import { create } from 'zustand';
import { PeerPresence } from '@/utils/presence';

export type Tool = 'select' | 'pen' | 'eraser' | 'rect' | 'circle' | 'image' | 'text' | 'bucket' | 'video';

export interface ShapeData {
  id: string;
  tool: string;
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  rotation?: number;
  text?: string;
  fill?: string;
  color: string;
  strokeWidth: number;
  imageUrl?: string;
  videoId?: string;
  // True for full-canvas bucket-fill snapshots. These are background layers, not
  // real objects: they're excluded from click/marquee selection so a fill can't
  // swallow the whole board's selection (or be deleted by a stray Delete press).
  fillLayer?: boolean;
}

// One shape's before/after state for a single undoable action. A missing
// `before` means the action created the shape; a missing `after` means it
// deleted it. `index` is the shape's slot in `shapes` — i.e. its z-order — so an
// undone delete comes back at its original depth instead of on top of the board.
export interface ShapeChange {
  id: string;
  index: number;
  before?: ShapeData;
  after?: ShapeData;
}

// A z-order change touches no shape's data, only where each one sits in the
// array, so it can't be written as per-shape before/after patches — every patch
// would be a no-op. Record the whole id order on each side instead.
export interface OrderChange {
  kind: 'order';
  before: string[];
  after: string[];
}

// One undo step. A gesture that touches several shapes at once (moving or
// deleting a multi-selection) records them all in a single entry, so one Ctrl+Z
// reverses the whole thing rather than peeling it apart one shape at a time.
export type HistoryEntry = ShapeChange[] | OrderChange;

// The two entry kinds are told apart by shape, not by a tag on the array: patch
// entries stay plain arrays so nothing else about them had to change.
export const isOrderChange = (entry: HistoryEntry): entry is OrderChange => !Array.isArray(entry);

// Reorder `shapes` to match `ids`. Ids we don't hold are skipped, and shapes the
// list doesn't mention keep their relative order at the top — a peer that is one
// stroke ahead of or behind us converges instead of dropping work, and a shape we
// drew while their reorder was in flight stays where it was drawn: on top.
export const applyOrder = (shapes: ShapeData[], ids: string[]): ShapeData[] => {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const named = new Set(ids);
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as ShapeData[];
  return [...ordered, ...shapes.filter((s) => !named.has(s.id))];
};

// Bucket fills store a full-canvas PNG data URL, so a handful of them dominates
// the stack's memory. Cap the depth rather than letting a long session grow
// without bound.
const HISTORY_LIMIT = 50;

// Rebuild `shapes` with one side of a history entry applied. Tolerant by design:
// a peer may have deleted or re-added something since the entry was recorded, so
// every lookup is by id and missing shapes are simply skipped or re-inserted.
const applyChanges = (
  shapes: ShapeData[],
  entry: HistoryEntry,
  dir: 'before' | 'after'
): ShapeData[] => {
  if (isOrderChange(entry)) return applyOrder(shapes, dir === 'before' ? entry.before : entry.after);

  const targetOf = (c: ShapeChange) => (dir === 'before' ? c.before : c.after);

  // Removals first, so the indices captured when the entry was recorded still
  // describe the array the re-insertion pass below walks.
  let next = shapes.filter((s) => !entry.some((c) => c.id === s.id && !targetOf(c)));

  // Shapes that survive on both sides are replaced in place.
  next = next.map((s) => {
    const c = entry.find((x) => x.id === s.id);
    return (c && targetOf(c)) || s;
  });

  // Shapes the entry brings back. Ascending by index so each insertion lands
  // before the next one shifts the array.
  const inserts = entry
    .filter((c) => targetOf(c) && !shapes.some((s) => s.id === c.id))
    .sort((a, b) => a.index - b.index);
  for (const c of inserts) {
    const at = Math.max(0, Math.min(c.index, next.length));
    next = [...next.slice(0, at), targetOf(c)!, ...next.slice(at)];
  }

  return next;
};

interface AppState {
  tool: Tool;
  color: string;
  strokeWidth: number;
  shapes: ShapeData[];

  // Undo/redo stacks, newest last. Only locally-initiated actions are pushed —
  // changes arriving over the socket are applied straight to `shapes`, so
  // Ctrl+Z never reaches across and reverts a collaborator's work.
  past: HistoryEntry[];
  future: HistoryEntry[];

  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setShapes: (shapes: ShapeData[]) => void;
  addShape: (shape: ShapeData) => void;
  prependShape: (shape: ShapeData) => void;
  updateShape: (index: number, shape: ShapeData) => void;
  updateShapeById: (id: string, shape: ShapeData) => void;
  removeShapeById: (id: string) => void;
  insertShapeAt: (index: number, shape: ShapeData) => void;
  // Rewrite the z-order to the given id sequence. Bottom of the array is the
  // bottom of the board, exactly as it renders.
  reorderShapes: (ids: string[]) => void;

  pushHistory: (entry: HistoryEntry) => void;
  // Both return the entry they applied (or null when the stack is empty) so the
  // caller can broadcast the result — the store deliberately knows nothing about
  // the socket.
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;

  // Set once a peer's snapshot has seeded this board on join. The Supabase load
  // races against that handoff, and Supabase is by definition the staler of the
  // two — it holds the last *saved* state, while the peer holds the live one — so
  // a load that resolves second must not overwrite a snapshot that already landed.
  hydratedFromPeer: boolean;
  setHydratedFromPeer: (v: boolean) => void;

  // Everyone else currently on this board, keyed by socket id. Kept in the store
  // rather than in the Whiteboard's own state on purpose: cursor updates arrive
  // many times a second, and a component that subscribes only to `peers` re-renders
  // without dragging the whole shape list along with it.
  peers: Record<string, PeerPresence>;
  // Partial by design — a cursor tick carries only a cursor, a selection change
  // only a selection — so each merges into whatever is already known about them.
  mergePeer: (id: string, patch: Partial<PeerPresence>) => void;
  removePeer: (id: string) => void;
  clearPeers: () => void;

  // Registered by the Whiteboard so other components (e.g. the board toolbar)
  // can broadcast a newly added shape over the socket without owning it.
  broadcastShape: ((shape: ShapeData) => void) | null;
  setBroadcastShape: (fn: ((shape: ShapeData) => void) | null) => void;

  // Same pattern for undo/redo: the toolbar buttons and the Whiteboard's
  // keyboard shortcuts must both broadcast, and only the Whiteboard owns the
  // socket, so it registers the real implementations here.
  requestUndo: (() => void) | null;
  requestRedo: (() => void) | null;
  setUndoRedo: (undo: (() => void) | null, redo: (() => void) | null) => void;
}

export const useStore = create<AppState>((set, get) => ({
  tool: 'select',
  color: '#000000',
  strokeWidth: 5,
  shapes: [],
  past: [],
  future: [],

  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setShapes: (shapes) => set({ shapes }),
  addShape: (shape) => set((state) => ({ shapes: [...state.shapes, shape] })),
  prependShape: (shape) => set((state) => ({ shapes: [shape, ...state.shapes] })),
  updateShape: (index, shape) => set((state) => {
    const newShapes = [...state.shapes];
    newShapes[index] = shape;
    return { shapes: newShapes };
  }),
  updateShapeById: (id, shape) => set((state) => {
    const index = state.shapes.findIndex((s) => s.id === id);
    if (index === -1) return state;
    const newShapes = [...state.shapes];
    newShapes[index] = shape;
    return { shapes: newShapes };
  }),
  removeShapeById: (id) => set((state) => ({ shapes: state.shapes.filter((s) => s.id !== id) })),
  // Restores a shape at a specific depth. Used when a peer undoes a delete —
  // appending it would silently reorder their board relative to ours.
  insertShapeAt: (index, shape) => set((state) => {
    if (state.shapes.some((s) => s.id === shape.id)) return state;
    const at = Math.max(0, Math.min(index, state.shapes.length));
    return { shapes: [...state.shapes.slice(0, at), shape, ...state.shapes.slice(at)] };
  }),
  reorderShapes: (ids) => set((state) => ({ shapes: applyOrder(state.shapes, ids) })),

  pushHistory: (entry) => set((state) => {
    if (Array.isArray(entry) && !entry.length) return state;
    // A fresh action makes any redo branch unreachable, as everywhere else.
    return { past: [...state.past, entry].slice(-HISTORY_LIMIT), future: [] };
  }),

  undo: () => {
    const { past, future, shapes } = get();
    const entry = past[past.length - 1];
    if (!entry) return null;
    set({
      shapes: applyChanges(shapes, entry, 'before'),
      past: past.slice(0, -1),
      future: [...future, entry],
    });
    return entry;
  },

  redo: () => {
    const { past, future, shapes } = get();
    const entry = future[future.length - 1];
    if (!entry) return null;
    set({
      shapes: applyChanges(shapes, entry, 'after'),
      future: future.slice(0, -1),
      past: [...past, entry],
    });
    return entry;
  },

  hydratedFromPeer: false,
  setHydratedFromPeer: (hydratedFromPeer) => set({ hydratedFromPeer }),

  peers: {},
  mergePeer: (id, patch) => set((state) => {
    // A cursor tick can arrive before the announcement that names them, so a peer
    // starts with a placeholder rather than being dropped for having no name.
    const existing: PeerPresence = state.peers[id] ?? { name: 'Someone' };
    return { peers: { ...state.peers, [id]: { ...existing, ...patch } } };
  }),
  removePeer: (id) => set((state) => {
    if (!state.peers[id]) return state;
    const next = { ...state.peers };
    delete next[id];
    return { peers: next };
  }),
  clearPeers: () => set({ peers: {} }),

  broadcastShape: null,
  setBroadcastShape: (broadcastShape) => set({ broadcastShape }),

  requestUndo: null,
  requestRedo: null,
  setUndoRedo: (requestUndo, requestRedo) => set({ requestUndo, requestRedo }),
}));
