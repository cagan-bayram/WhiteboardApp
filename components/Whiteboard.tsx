'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text, Image as KonvaImage, Transformer } from 'react-konva';
import { io, Socket } from 'socket.io-client';
import useImage from 'use-image';
import { useStore, ShapeData, ShapeChange, HistoryEntry, Tool } from '@/store/useStore';
import Konva from 'konva';
import { Minus, Plus } from 'lucide-react';

// Zoom bounds. Below the floor shapes stop being discernible; above the ceiling a
// stroke's width exceeds the viewport and panning gets uselessly slow.
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

// Single-key tool shortcuts, Miro-style. Only fire without a modifier and never
// while a form field has focus (see the keydown handler's guard).
const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  p: 'pen',
  r: 'rect',
  c: 'circle',
  e: 'eraser',
  t: 'text',
  f: 'bucket',
};

// Shift/Ctrl/Meta all add to the current selection — used by both click-select
// and the marquee so the two agree on what "additive" means.
const isAdditive = (evt?: MouseEvent | TouchEvent | null) => {
  const m = evt as MouseEvent | undefined;
  return !!(m?.shiftKey || m?.metaKey || m?.ctrlKey);
};

// Defined at module scope (not inside Whiteboard) so its component identity is
// stable across renders — otherwise every re-render remounts each image and
// reloads it via useImage, causing visible flicker while drawing.
const URLImage = ({
  shape,
  onClick,
  draggable,
  listening,
  onDragStart,
  onDragEnd,
  onTransformEnd,
}: {
  shape: ShapeData;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  draggable?: boolean;
  listening?: boolean;
  onDragStart?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
}) => {
  const [img] = useImage(shape.imageUrl || '', 'anonymous');
  return (
    <KonvaImage
      id={shape.id}
      onClick={onClick}
      onTap={onClick}
      image={img}
      x={shape.x}
      y={shape.y}
      width={shape.width || 200}
      height={shape.height || 200}
      rotation={shape.rotation || 0}
      draggable={draggable}
      listening={listening}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
};

// A live, playable YouTube embed rendered as an HTML overlay on top of the canvas
// (Konva's <canvas> can't host an <iframe>). Draggable by its header bar and
// resizable from the bottom-right corner; both sync via onLocalChange/onCommit.
const VIDEO_HEADER_H = 28;
const VideoEmbed = ({
  shape,
  scale,
  onLocalChange,
  onCommit,
  onDelete,
}: {
  shape: ShapeData;
  // Current zoom. Pointer deltas arrive in screen pixels but shape geometry is in
  // board units, so a drag at 2x would otherwise move the video twice as far as the
  // cursor.
  scale: number;
  onLocalChange: (s: ShapeData) => void;
  // `before` is the shape as it stood when the gesture began. onLocalChange has
  // already written every intermediate frame into the store, so the caller can't
  // recover the pre-drag state on its own — it has to come from the session.
  onCommit: (s: ShapeData, before: ShapeData) => void;
  onDelete: (id: string) => void;
}) => {
  const session = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; orig: ShapeData; latest: ShapeData } | null>(null);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const s = session.current;
      if (!s) return;
      const dx = (e.clientX - s.startX) / scale;
      const dy = (e.clientY - s.startY) / scale;
      const next: ShapeData = s.mode === 'move'
        ? { ...s.orig, x: (s.orig.x || 0) + dx, y: (s.orig.y || 0) + dy }
        : { ...s.orig, width: Math.max(200, (s.orig.width || 400) + dx), height: Math.max(112, (s.orig.height || 225) + dy) };
      s.latest = next;
      onLocalChange(next);
    };
    const handleUp = () => {
      const s = session.current;
      if (!s) return;
      // A press with no movement leaves latest identical to orig — nothing to
      // commit, and recording it would cost an undo step that does nothing.
      if (s.latest !== s.orig) onCommit(s.latest, s.orig);
      session.current = null;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [onLocalChange, onCommit, scale]);

  const startDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    session.current = { mode, startX: e.clientX, startY: e.clientY, orig: shape, latest: shape };
  };

  const w = shape.width || 400;
  const h = shape.height || 225;

  return (
    <div
      style={{
        position: 'absolute',
        top: shape.y || 0,
        left: shape.x || 0,
        width: w,
        // The wrapper opts out of hit-testing so drawing works between videos;
        // this element opts back in for itself.
        pointerEvents: 'auto',
        zIndex: 5,
        borderRadius: 6,
        overflow: 'hidden',
        background: '#000',
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
      }}
    >
      <div
        onPointerDown={startDrag('move')}
        style={{
          height: VIDEO_HEADER_H,
          background: '#1f2937',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          cursor: 'move',
          fontSize: 12,
          userSelect: 'none',
        }}
      >
        <span>▶ YouTube</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(shape.id); }}
          title="Remove video"
          style={{ color: '#fca5a5', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <iframe
        src={`https://www.youtube.com/embed/${shape.videoId}`}
        width={w}
        height={h}
        style={{ border: 0, display: 'block' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        title={`youtube-${shape.videoId}`}
      />
      <div
        onPointerDown={startDrag('resize')}
        title="Drag to resize"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          background: 'linear-gradient(135deg, transparent 50%, #3b82f6 50%)',
        }}
      />
    </div>
  );
};

export default function Whiteboard({ roomId }: { roomId: string }) {
  const { tool, setTool, color, strokeWidth, shapes, addShape, prependShape, updateShape, updateShapeById, removeShapeById, insertShapeAt, setShapes, setBroadcastShape, setUndoRedo } = useStore();
  const isDrawing = useRef(false);
  const stageRef = useRef<Konva.Stage>(null);
  const socketRef = useRef<Socket | null>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  // Currently selected shapes (only meaningful with the 'select' tool). Supports
  // multi-select via marquee drag and Shift-click.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Rubber-band marquee rectangle (stage coords) while dragging on empty canvas.
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeActive = useRef(false);
  // Whether the in-progress marquee should add to the existing selection (Shift).
  const marqueeAdditive = useRef(false);
  // Mirror of `marquee` in a ref so the window-level pointerup finalizer can read
  // the latest rect without being re-registered on every mousemove.
  const marqueeRect = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Stable offscreen canvas reused for bucket fill — never recreated across renders
  const fillCanvas = useMemo(() => document.createElement('canvas'), []);

  // The camera. Shapes are stored in *board* coordinates; the browser reports
  // *screen* coordinates; this is the only bridge between them. Deliberately
  // per-client and never synced — collaborators share a board, not a viewpoint.
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  // Handlers registered on window (panning, paste) outlive the render that created
  // them, so they read the camera through a ref rather than a stale closure.
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  // Held space turns any drag into a pan, the convention every canvas tool shares.
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panSession = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [panning, setPanning] = useState(false);

  // Zoom about a fixed screen point: whatever board coordinate sits under the
  // cursor has to stay under the cursor, which is what makes wheel-zoom feel
  // anchored instead of drifting toward the origin.
  const zoomAt = useCallback((screenX: number, screenY: number, factor: number) => {
    setViewport((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      if (scale === v.scale) return v;
      const boardX = (screenX - v.x) / v.scale;
      const boardY = (screenY - v.y) / v.scale;
      return { scale, x: screenX - boardX * scale, y: screenY - boardY * scale };
    });
  }, []);

  // Zoom the centre of the viewport — what the on-screen buttons and Ctrl +/- use,
  // since neither has a cursor position to anchor to.
  const zoomFromCentre = useCallback((factor: number) => {
    const stage = stageRef.current;
    zoomAt((stage?.width() ?? window.innerWidth) / 2, (stage?.height() ?? window.innerHeight) / 2, factor);
  }, [zoomAt]);

  // Changes recorded for the action currently in flight, flushed on a microtask.
  // Batching by tick is what makes a gesture one undo step: a group drag fires
  // dragend once per selected node and the Delete key removes each selected shape
  // in turn, all synchronously, so they coalesce into a single entry.
  const pendingChanges = useRef<ShapeChange[]>([]);
  const recordChange = useCallback((change: ShapeChange) => {
    if (pendingChanges.current.length === 0) {
      queueMicrotask(() => {
        const entry = pendingChanges.current;
        pendingChanges.current = [];
        if (entry.length) useStore.getState().pushHistory(entry);
      });
    }
    pendingChanges.current.push(change);
  }, []);

  // Broadcast the result of an undo/redo. Each change replays as the socket event
  // the original action would have sent, so peers land on the same state without
  // needing to know anything about our history stack.
  const syncEntry = useCallback((entry: HistoryEntry, dir: 'before' | 'after') => {
    const socket = socketRef.current;
    if (!socket) return;
    for (const c of entry) {
      const target = dir === 'before' ? c.before : c.after;
      if (!target) {
        socket.emit('delete-shape', { roomId, id: c.id });
      } else if (dir === 'before' ? !c.after : !c.before) {
        // Absent on the other side, so this direction brings the shape back.
        socket.emit('insert-shape', { roomId, index: c.index, shape: target });
      } else {
        socket.emit('update-shape', { roomId, id: c.id, shape: target });
      }
    }
  }, [roomId]);

  // An undone create leaves its id selected but the node gone; drop any id that
  // no longer resolves so the Transformer doesn't hold a dead handle.
  const pruneSelection = useCallback(() => {
    const live = useStore.getState().shapes;
    setSelectedIds((prev) => prev.filter((id) => live.some((s) => s.id === id)));
  }, []);

  const handleUndo = useCallback(() => {
    const entry = useStore.getState().undo();
    if (!entry) return;
    syncEntry(entry, 'before');
    pruneSelection();
  }, [syncEntry, pruneSelection]);

  const handleRedo = useCallback(() => {
    const entry = useStore.getState().redo();
    if (!entry) return;
    syncEntry(entry, 'after');
    pruneSelection();
  }, [syncEntry, pruneSelection]);

  // Let the toolbar's undo/redo buttons drive the same path as the shortcuts.
  useEffect(() => {
    setUndoRedo(handleUndo, handleRedo);
    return () => setUndoRedo(null, null);
  }, [handleUndo, handleRedo, setUndoRedo]);

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Inline text editing: when the text tool is used, we show a real <textarea>
  // at the click position instead of a blocking prompt().
  const [textEditor, setTextEditor] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the editor after it mounts (via a timeout so the click that opened it
  // has fully settled — autoFocus mid-click can immediately blur it shut).
  useEffect(() => {
    if (textEditor) {
      const t = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [textEditor]);

  useEffect(() => {
    const handleResize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Leaving the select tool clears any active selection.
  useEffect(() => {
    if (tool !== 'select') setSelectedIds([]);
  }, [tool]);

  // Panning listens on window, not the stage, so a drag that runs off the canvas
  // (or off the browser window) still tracks and still ends cleanly.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = panSession.current;
      if (!p) return;
      setViewport((v) => ({ ...v, x: p.origX + (e.clientX - p.startX), y: p.origY + (e.clientY - p.startY) }));
    };
    const up = () => {
      if (!panSession.current) return;
      panSession.current = null;
      setPanning(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  // Space is tracked separately from the shortcut handler below because it needs a
  // keyup as well, and because it must not fire while a text field has focus.
  useEffect(() => {
    const isTyping = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping()) return;
      // Space would otherwise scroll the page behind the canvas.
      e.preventDefault();
      setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    // Releasing space while the tab is unfocused would otherwise leave it stuck on.
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    // Always: the page must not scroll underneath the board.
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;

    // Ctrl/Cmd+wheel is also what browsers synthesise for a trackpad pinch, so this
    // one branch covers both gestures. A plain wheel pans, as on every other
    // infinite canvas — scrolling a board that has no scrollbar should move it.
    if (e.evt.ctrlKey || e.evt.metaKey) {
      zoomAt(pointer.x, pointer.y, Math.exp(-e.evt.deltaY * 0.002));
      return;
    }
    // Shift redirects a vertical wheel sideways, matching normal scroll behaviour.
    const dx = e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX;
    const dy = e.evt.shiftKey ? 0 : e.evt.deltaY;
    setViewport((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
  };

  // Attach the Konva Transformer to every currently selected node.
  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = tool === 'select'
      ? selectedIds.map((id) => stage.findOne('#' + id)).filter(Boolean) as Konva.Node[]
      : [];
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, tool, shapes]);

  // Board shortcuts: undo/redo, delete the selection, clear it, pick a tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore while typing in a form field (text editor, chat, modal inputs).
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        // Ctrl+Shift+Z and Ctrl+Y both redo — the two conventions users arrive with.
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      // Zoom shortcuts shadow the browser's own page zoom deliberately: on a canvas
      // the expected target is the board, not the chrome around it.
      if (mod && (key === '=' || key === '+')) { e.preventDefault(); zoomFromCentre(1.2); return; }
      if (mod && key === '-') { e.preventDefault(); zoomFromCentre(1 / 1.2); return; }
      if (mod && key === '0') { e.preventDefault(); setViewport({ x: 0, y: 0, scale: 1 }); return; }
      // Leave every other modifier combo to the browser (copy, reload, ...) so a
      // tool shortcut can't hijack it.
      if (mod || e.altKey) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault();
        // Snapshot before removing: each change needs the shape's pre-delete
        // index so undo can restore it at the same depth.
        const all = useStore.getState().shapes;
        selectedIds.forEach((id) => {
          const index = all.findIndex((s) => s.id === id);
          if (index === -1) return;
          recordChange({ id, index, before: all[index] });
          removeShapeById(id);
          socketRef.current?.emit('delete-shape', { roomId, id });
        });
        setSelectedIds([]);
        return;
      }
      if (e.key === 'Escape') {
        setSelectedIds([]);
        return;
      }
      if (TOOL_KEYS[key]) {
        e.preventDefault();
        setTool(TOOL_KEYS[key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, removeShapeById, roomId, recordChange, handleUndo, handleRedo, setTool, zoomFromCentre]);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    socket.emit('join-room', roomId);

    // Let other components (e.g. the toolbar's Add Video) broadcast new shapes.
    setBroadcastShape((shape: ShapeData) => socket.emit('draw-shape', { roomId, shape }));

    socket.on('draw-shape', (newShape: ShapeData) => {
      addShape(newShape);
    });

    socket.on('prepend-shape', (newShape: ShapeData) => {
      prependShape(newShape);
    });

    // A peer undid a delete — restore the shape at the depth it had.
    socket.on('insert-shape', ({ index, shape }: { index: number; shape: ShapeData }) => {
      insertShapeAt(index, shape);
    });

    // The server picked us to seed a client that just joined. Read through
    // getState() rather than closing over `shapes`: this listener is registered
    // once for the life of the connection, so a captured array would be whatever
    // the board held at mount.
    socket.on('request-state', ({ requesterId }: { requesterId: string }) => {
      socket.emit('provide-state', { requesterId, shapes: useStore.getState().shapes });
    });

    // We joined an existing session and a peer sent us its board. Nothing here is
    // recorded to history — as with every socket-delivered change, Ctrl+Z must not
    // reach across and undo work that was never ours.
    socket.on('board-state', (peerShapes: ShapeData[]) => {
      if (!Array.isArray(peerShapes)) return;
      const store = useStore.getState();
      store.setHydratedFromPeer(true);

      // An empty `past` means the user hasn't touched this board yet, so there is
      // nothing of ours to lose and the peer's state is strictly newer than the
      // Supabase row we loaded from. Take it whole.
      if (store.past.length === 0) {
        store.setShapes(peerShapes);
        return;
      }

      // The handoff was slow enough that the user already started drawing. Add
      // only what we're missing — insertShapeAt ignores ids we already hold — so a
      // late snapshot can't discard their strokes. Depths are approximate in this
      // path, since each insert shifts the indices the rest were measured against,
      // but a rare ordering quirk beats destroying work.
      peerShapes.forEach((shape, index) => store.insertShapeAt(index, shape));
    });

    socket.on('update-shape', ({ id, shape }: { id: string; shape: ShapeData }) => {
      updateShapeById(id, shape);
    });

    socket.on('delete-shape', ({ id }: { id: string }) => {
      removeShapeById(id);
    });

    socket.on('clear-canvas', () => setShapes([]));

    const handlePaste = (e: ClipboardEvent) => {
      // Ignore pastes into form fields (e.g. the Add Video modal input, the text
      // editor, chat box) — otherwise pasting a link there would ALSO drop it on
      // the canvas, duplicating it.
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return;
      }

      const items = e.clipboardData?.items;
      const text = e.clipboardData?.getData('text');

      if (items) {
        for (const item of items) {
          if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            if (blob) {
              const reader = new FileReader();
              reader.onload = (event) => {
                const base64 = event.target?.result as string;
                // Centre of what the user is looking at, in board coordinates —
                // pasting used to drop images at the screen centre interpreted as
                // board space, which lands off-screen the moment you pan.
                const v = viewportRef.current;
                const newShape: ShapeData = {
                  id: crypto.randomUUID(),
                  tool: 'image',
                  x: (window.innerWidth / 2 - v.x) / v.scale - 100,
                  y: (window.innerHeight / 2 - v.y) / v.scale - 100,
                  width: 200,
                  height: 200,
                  color: 'transparent',
                  strokeWidth: 0,
                  imageUrl: base64,
                };
                addShape(newShape);
                recordChange({ id: newShape.id, index: useStore.getState().shapes.length - 1, after: newShape });
                socket.emit('draw-shape', { roomId, shape: newShape });
                // Pasted images are one-shot inserts: drop to the cursor and
                // select the new image so it can be moved/resized right away.
                useStore.getState().setTool('select');
                setSelectedIds([newShape.id]);
              };
              reader.readAsDataURL(blob);
            }
          }
        }
      }

      if (text && (text.includes('youtube.com/watch') || text.includes('youtu.be/'))) {
        const videoId = text.split('v=')[1]?.split('&')[0] || text.split('youtu.be/')[1]?.split(/[?&]/)[0];
        if (videoId) {
          const v = viewportRef.current;
          const newShape: ShapeData = {
            id: crypto.randomUUID(),
            tool: 'video',
            // Same reasoning as the pasted image above: near the top-left of what's
            // currently visible, not of the board.
            x: (200 - v.x) / v.scale,
            y: (200 - v.y) / v.scale,
            width: 400, height: 225,
            color: 'transparent', strokeWidth: 0,
            videoId,
          };
          addShape(newShape);
          recordChange({ id: newShape.id, index: useStore.getState().shapes.length - 1, after: newShape });
          socket.emit('draw-shape', { roomId, shape: newShape });
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      socket.disconnect();
      socketRef.current = null;
      setBroadcastShape(null);
      window.removeEventListener('paste', handlePaste);
    };
  }, [roomId, addShape, prependShape, setShapes, updateShapeById, removeShapeById, insertShapeAt, setBroadcastShape, recordChange]);

  // Stable handlers for the video overlays (drag = local update; commit = sync).
  const handleVideoChange = useCallback((s: ShapeData) => updateShapeById(s.id, s), [updateShapeById]);
  const handleVideoCommit = useCallback((s: ShapeData, before: ShapeData) => {
    const index = useStore.getState().shapes.findIndex((x) => x.id === s.id);
    if (index !== -1) recordChange({ id: s.id, index, before, after: s });
    updateShapeById(s.id, s);
    socketRef.current?.emit('update-shape', { roomId, id: s.id, shape: s });
  }, [updateShapeById, roomId, recordChange]);
  const handleVideoDelete = useCallback((id: string) => {
    const all = useStore.getState().shapes;
    const index = all.findIndex((s) => s.id === id);
    if (index !== -1) recordChange({ id, index, before: all[index] });
    removeShapeById(id);
    socketRef.current?.emit('delete-shape', { roomId, id });
  }, [removeShapeById, roomId, recordChange]);

  // Finish a rubber-band marquee and select what it touched. Bound to a window
  // pointerup (not just the stage's mouseup) so releasing outside the canvas —
  // over the toolbar or past the window edge — can't leave a stuck ghost rect
  // that blocks every later mousemove. Same pattern as VideoEmbed's drag session.
  const finalizeMarquee = useCallback(() => {
    if (!marqueeActive.current) return;
    marqueeActive.current = false;
    const stage = stageRef.current;
    const m = marqueeRect.current;
    if (stage && m) {
      const box = {
        x: Math.min(m.x1, m.x2),
        y: Math.min(m.y1, m.y2),
        width: Math.abs(m.x2 - m.x1),
        height: Math.abs(m.y2 - m.y1),
      };
      // A tiny box is really an empty-canvas click — leave the selection cleared.
      if (box.width >= 3 || box.height >= 3) {
        const hits = useStore.getState().shapes
          .filter((s) => s.tool !== 'video' && !s.fillLayer)
          .filter((s) => {
            const n = stage.findOne('#' + s.id);
            // relativeTo the stage puts the node's box in board coordinates, which
            // is what `box` is. A bare getClientRect() returns screen coordinates —
            // identical only at 100% zoom with no pan, so comparing the two silently
            // selected nothing as soon as the camera moved.
            return n ? Konva.Util.haveIntersection(box, n.getClientRect({ relativeTo: stage })) : false;
          })
          .map((s) => s.id);
        setSelectedIds((prev) =>
          marqueeAdditive.current ? Array.from(new Set([...prev, ...hits])) : hits
        );
      }
    }
    marqueeRect.current = null;
    setMarquee(null);
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', finalizeMarquee);
    return () => window.removeEventListener('pointerup', finalizeMarquee);
  }, [finalizeMarquee]);

  const handleShapeClick = (index: number, e?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (tool === 'bucket') {
      const before = shapes[index];
      const shape = { ...before };
      if (shape.tool === 'text') {
        shape.color = color;
      } else {
        shape.fill = color;
      }
      updateShape(index, shape);
      recordChange({ id: shape.id, index, before, after: shape });
      socketRef.current?.emit('update-shape', { roomId, id: shape.id, shape });
    } else if (tool === 'select') {
      const id = shapes[index].id;
      if (isAdditive(e?.evt)) {
        // Shift/Ctrl-click toggles this shape in/out of the selection.
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      } else {
        setSelectedIds([id]);
      }
    }
  };

  // Commit a moved/resized node's geometry back into the store and sync it.
  // Reads from the store directly to avoid a stale closure — during a group drag
  // this runs once per member, and a peer's update may have landed mid-gesture.
  const commitNode = (id: string, patch: Partial<ShapeData>) => {
    const all = useStore.getState().shapes;
    const index = all.findIndex((s) => s.id === id);
    if (index === -1) return;
    const before = all[index];
    // Konva fires dragend even for a click that never moved the node. Recording
    // that would spend an undo step on a no-op, so only log a real change.
    const changed = (Object.keys(patch) as Array<keyof ShapeData>).some((k) => before[k] !== patch[k]);
    const updated = { ...before, ...patch };
    updateShapeById(id, updated);
    if (changed) recordChange({ id, index, before, after: updated });
    socketRef.current?.emit('update-shape', { roomId, id, shape: updated });
  };

  // Pressing an unselected node selects just it (Miro behavior). Moving a
  // multi-selection needs no handling here: Konva's Transformer already proxies
  // the drag to every attached node (Transformer._proxyDrag), so each selected
  // node moves with the one under the cursor and fires its own dragend.
  const handleDragStart = (id: string) => () => {
    if (!selectedIds.includes(id)) setSelectedIds([id]);
  };

  // Fires once per moved node — including every member of a group drag — so each
  // commits its own final position.
  const handleDragEnd = (id: string) => (e: Konva.KonvaEventObject<DragEvent>) => {
    commitNode(id, { x: e.target.x(), y: e.target.y() });
  };

  const handleTransformEnd = (id: string) => (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    // Bake the transform's scale back into real dimensions and reset the scale,
    // so the stored shape stays clean (scale always 1).
    node.scaleX(1);
    node.scaleY(1);
    // Resizing a multi-selection that contains a rotated shape leaves residual
    // skew on that node (Transformer forces its own rotation to 0 for multiple
    // nodes, so decompose() yields skew). ShapeData has no skew field, so clear
    // it — otherwise it desyncs peers and vanishes on the next re-render anyway.
    node.skewX(0);
    node.skewY(0);
    const shape = useStore.getState().shapes.find((s) => s.id === id);
    if (!shape) return;
    const patch: Partial<ShapeData> = { x: node.x(), y: node.y(), rotation: node.rotation() };
    if (shape.tool === 'rect' || shape.tool === 'image') {
      patch.width = Math.max(5, (shape.width || node.width()) * scaleX);
      patch.height = Math.max(5, (shape.height || node.height()) * scaleY);
    } else if (shape.tool === 'circle') {
      patch.radius = Math.max(5, (shape.radius || 0) * Math.max(scaleX, scaleY));
    } else if (shape.tool === 'text') {
      patch.strokeWidth = Math.max(6, (shape.strokeWidth || 24) * scaleY);
    } else if (shape.tool === 'pen' || shape.tool === 'eraser') {
      // Freehand strokes have no width/height — bake the scale into every point
      // coordinate (x on even indices, y on odd), and scale the line thickness by
      // the average factor so it reads like a proportionally resized drawing.
      const pts = shape.points || [];
      patch.points = pts.map((v, idx) => (idx % 2 === 0 ? v * scaleX : v * scaleY));
      patch.strokeWidth = Math.max(1, (shape.strokeWidth || 1) * ((scaleX + scaleY) / 2));
    }
    commitNode(id, patch);
  };

  const hexToRgba = (hex: string): [number, number, number, number] => {
    const h = hex.replace('#', '');
    const num = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return [r, g, b, 255];
  };

  const floodFill = (canvas: HTMLCanvasElement, sx: number, sy: number, fill: [number, number, number, number]) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;
    const i = (sy * width + sx) * 4;
    const target = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (target.every((v, idx) => v === fill[idx])) return;

    const stack: Array<[number, number]> = [[sx, sy]];
    const match = (x: number, y: number) => {
      const k = (y * width + x) * 4;
      return data[k] === target[0] && data[k + 1] === target[1] && data[k + 2] === target[2] && data[k + 3] === target[3];
    };
    const paint = (x: number, y: number) => {
      const k = (y * width + x) * 4;
      data[k] = fill[0]; data[k + 1] = fill[1]; data[k + 2] = fill[2]; data[k + 3] = fill[3];
    };

    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= width || y >= height || !match(x, y)) continue;
      paint(x, y);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    ctx.putImageData(img, 0, 0);
  };

  // `pos` is in screen pixels, not board coordinates — toCanvas() renders the stage
  // as currently displayed, so the flood fill operates on the visible bitmap. The
  // shape it produces still has to be placed in board space, or the fill would land
  // at the board origin no matter where the camera happens to be.
  const handleBucketFill = async (pos: { x: number; y: number }) => {
    const stage = stageRef.current;
    if (!stage) return;
    const exportCanvas = stage.toCanvas({ pixelRatio: 1 });
    fillCanvas.width = exportCanvas.width;
    fillCanvas.height = exportCanvas.height;
    const ctx = fillCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(exportCanvas, 0, 0);
    try {
      floodFill(fillCanvas, Math.round(pos.x), Math.round(pos.y), hexToRgba(color));
    } catch (e) {
      console.warn('Canvas tainted by cross-origin images; bucket fill unavailable.', e);
      return;
    }
    const dataUrl = fillCanvas.toDataURL();
    const v = viewportRef.current;
    const newShape: ShapeData = {
      id: crypto.randomUUID(),
      tool: 'image',
      // Board coordinates of the viewport's top-left corner, and the viewport's
      // size measured in board units. At scale 1 with no pan this is (0,0) and the
      // stage size, exactly as before.
      x: -v.x / v.scale,
      y: -v.y / v.scale,
      width: stage.width() / v.scale,
      height: stage.height() / v.scale,
      color: 'transparent', strokeWidth: 0,
      imageUrl: dataUrl,
      // Background snapshot, not a selectable object — see ShapeData.fillLayer.
      fillLayer: true,
    };
    // Append on top: the fill is a full snapshot of the current canvas, so the
    // newest fill must render above earlier ones (otherwise a second fill, e.g.
    // white over black, lands behind the first and is invisible). Strokes drawn
    // afterward are appended later and still render above the fill.
    addShape(newShape);
    recordChange({ id: newShape.id, index: useStore.getState().shapes.length - 1, after: newShape });
    socketRef.current?.emit('draw-shape', { roomId, shape: newShape });
  };

  const commitText = () => {
    if (textEditor && textValue.trim()) {
      const newShape: ShapeData = {
        id: crypto.randomUUID(),
        tool: 'text',
        x: textEditor.x,
        y: textEditor.y,
        text: textValue.trim(),
        color: color,
        strokeWidth: 24,
      };
      addShape(newShape);
      recordChange({ id: newShape.id, index: useStore.getState().shapes.length - 1, after: newShape });
      socketRef.current?.emit('draw-shape', { roomId, shape: newShape });
      // Return to the cursor so the just-placed text can be moved/resized.
      setTool('select');
      setSelectedIds([newShape.id]);
    }
    setTextEditor(null);
    setTextValue('');
  };

  const cancelText = () => {
    setTextEditor(null);
    setTextValue('');
  };

  const handleMouseDown = async (e: any) => {
    // Space-drag and middle-drag pan from anywhere, whatever tool is active, and
    // take precedence over drawing — otherwise a pan would leave a stroke behind.
    if (spaceHeld || e.evt?.button === 1) {
      e.evt?.preventDefault?.();
      const v = viewportRef.current;
      panSession.current = { startX: e.evt.clientX, startY: e.evt.clientY, origX: v.x, origY: v.y };
      setPanning(true);
      return;
    }

    if (tool === 'select') {
      // Pressing empty canvas starts a rubber-band marquee. Clicks on shapes are
      // handled by their own onClick (select) and Konva's built-in dragging.
      if (e.target === e.target.getStage()) {
        // Board coordinates: the marquee is drawn inside the Layer and compared
        // against shape positions, both of which live in board space.
        const pos = e.target.getStage().getRelativePointerPosition();
        marqueeAdditive.current = isAdditive(e.evt);
        if (!marqueeAdditive.current) setSelectedIds([]);
        if (pos) {
          marqueeActive.current = true;
          const rect = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
          marqueeRect.current = rect;
          setMarquee(rect);
        }
      }
      return;
    }

    if (tool === 'text') {
      // If an editor is already open, its onBlur will commit it — don't open
      // another on the same click.
      if (textEditor) return;
      // Board coordinates: the editor is positioned back into screen space at render
      // time, and commitText stores these straight onto the shape.
      const pos = e.target.getStage().getRelativePointerPosition();
      if (pos) setTextEditor({ x: pos.x, y: pos.y });
      return;
    }

    if (tool === 'bucket') {
      // Only empty canvas gets the flood-fill snapshot. Without this guard a
      // bucket click on a shape ran both paths — this one, and the shape's own
      // onClick recolour — leaving a redundant full-canvas layer stacked on top
      // of the recoloured shape, and taking two undo steps to unwind.
      if (e.target === e.target.getStage()) {
        // Screen coordinates here, unlike everywhere else: the flood fill runs over
        // a bitmap of what's on screen, so it needs pixel positions in that bitmap.
        const pos = e.target.getStage().getPointerPosition();
        if (pos) await handleBucketFill(pos);
      }
      return;
    }

    isDrawing.current = true;
    const pos = e.target.getStage().getRelativePointerPosition();
    const id = crypto.randomUUID();
    let newShape: ShapeData;

    if (tool === 'pen' || tool === 'eraser') {
      newShape = {
        id, tool,
        points: [pos.x, pos.y],
        color: tool === 'eraser' ? '#ffffff' : color,
        strokeWidth: tool === 'eraser' ? 20 : strokeWidth,
      };
    } else {
      newShape = {
        id, tool,
        x: pos.x, y: pos.y,
        width: 0, height: 0, radius: 0,
        color, strokeWidth,
        fill: 'transparent',
      };
    }
    addShape(newShape);
  };

  const handleMouseMove = (e: any) => {
    if (marqueeActive.current) {
      const pos = e.target.getStage().getRelativePointerPosition();
      const prev = marqueeRect.current;
      if (pos && prev) {
        const next = { ...prev, x2: pos.x, y2: pos.y };
        marqueeRect.current = next;
        setMarquee(next);
      }
      return;
    }
    if (!isDrawing.current) return;

    const stage = e.target.getStage();
    const point = stage.getRelativePointerPosition();
    const lastShapeIndex = shapes.length - 1;
    if (lastShapeIndex < 0) return;
    const lastShape = { ...shapes[lastShapeIndex] };

    if (lastShape.tool === 'pen' || lastShape.tool === 'eraser') {
      lastShape.points = lastShape.points!.concat([point.x, point.y]);
    } else if (lastShape.tool === 'rect') {
      lastShape.width = point.x - lastShape.x!;
      lastShape.height = point.y - lastShape.y!;
    } else if (lastShape.tool === 'circle') {
      const dx = point.x - lastShape.x!;
      const dy = point.y - lastShape.y!;
      lastShape.radius = Math.sqrt(dx * dx + dy * dy);
    }
    updateShape(lastShapeIndex, lastShape);
  };

  const handleMouseUp = () => {
    if (marqueeActive.current) {
      finalizeMarquee();
      return;
    }

    if (!isDrawing.current) return;
    isDrawing.current = false;
    // Read from store directly to avoid stale closure
    const currentShapes = useStore.getState().shapes;
    const lastShape = currentShapes[currentShapes.length - 1];
    if (lastShape) {
      socketRef.current?.emit('draw-shape', { roomId, shape: lastShape });
      // The shape was added on mousedown and mutated on every mousemove; record
      // it once here so the whole stroke is a single undo step, not one per point.
      recordChange({ id: lastShape.id, index: currentShapes.length - 1, after: lastShape });
    }
    // Miro-style: after placing a discrete shape, drop back to the cursor so it
    // can be moved/resized immediately. Pen/eraser stay active for repeat drawing.
    if (lastShape && (lastShape.tool === 'rect' || lastShape.tool === 'circle')) {
      setTool('select');
      setSelectedIds([lastShape.id]);
    }
  };

  return (
    <div
      className="relative border bg-white shadow-lg overflow-hidden"
      // Space-drag pans from anywhere, so advertise it before the drag begins.
      style={{ cursor: panning ? 'grabbing' : spaceHeld ? 'grab' : undefined }}
    >
      {textEditor && (
        <textarea
          ref={textareaRef}
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitText();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelText();
            }
          }}
          placeholder="Type text, Enter to add"
          rows={1}
          style={{
            position: 'absolute',
            // textEditor holds board coordinates; this is an HTML element layered
            // over the canvas, so it has to be projected back into screen space by
            // hand. Konva does this for its own nodes.
            top: textEditor.y * viewport.scale + viewport.y,
            left: textEditor.x * viewport.scale + viewport.x,
            zIndex: 30,
            color: color,
            // Matches the 24px the committed Text node will use, at this zoom.
            fontSize: 24 * viewport.scale,
            lineHeight: 1.2,
            background: '#ffffff',
            border: '2px solid #3b82f6',
            borderRadius: 4,
            outline: 'none',
            padding: '2px 6px',
            margin: 0,
            resize: 'none',
            overflow: 'hidden',
            minWidth: 160,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        />
      )}
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
      >
        <Layer>
          {shapes.map((shape, i) => {
            // Videos are rendered as HTML overlays (below), not Konva nodes.
            if (shape.tool === 'video') return null;
            const selectable = tool === 'select';
            if (shape.tool === 'image') {
              // Bucket-fill snapshots cover the whole stage. Left interactive
              // they'd absorb every empty-canvas mousedown, so the marquee could
              // never start on a filled board. Make them ignore hit detection.
              return (
                <URLImage
                  key={shape.id}
                  shape={shape}
                  onClick={(e) => handleShapeClick(i, e)}
                  draggable={selectable && !shape.fillLayer}
                  listening={!shape.fillLayer}
                  onDragStart={handleDragStart(shape.id)}
                  onDragEnd={handleDragEnd(shape.id)}
                  onTransformEnd={handleTransformEnd(shape.id)}
                />
              );
            }
            if (shape.tool === 'text') {
              return (
                <Text
                  key={shape.id}
                  id={shape.id}
                  onClick={(e) => handleShapeClick(i, e)}
                  onTap={(e) => handleShapeClick(i, e)}
                  x={shape.x}
                  y={shape.y}
                  text={shape.text}
                  fontSize={shape.strokeWidth || 24}
                  fill={shape.color}
                  rotation={shape.rotation || 0}
                  draggable={selectable}
                  onDragStart={handleDragStart(shape.id)}
                  onDragEnd={handleDragEnd(shape.id)}
                  onTransformEnd={handleTransformEnd(shape.id)}
                />
              );
            }
            if (shape.tool === 'pen' || shape.tool === 'eraser') {
              return (
                <Line
                  key={shape.id}
                  id={shape.id}
                  onClick={(e) => handleShapeClick(i, e)}
                  onTap={(e) => handleShapeClick(i, e)}
                  x={shape.x || 0}
                  y={shape.y || 0}
                  points={shape.points}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                  fill={shape.tool === 'eraser' ? undefined : shape.fill}
                  closed={!!shape.fill}
                  rotation={shape.rotation || 0}
                  draggable={selectable}
                  onDragStart={handleDragStart(shape.id)}
                  onDragEnd={handleDragEnd(shape.id)}
                  onTransformEnd={handleTransformEnd(shape.id)}
                />
              );
            } else if (shape.tool === 'rect') {
              return (
                <Rect
                  key={shape.id}
                  id={shape.id}
                  onClick={(e) => handleShapeClick(i, e)}
                  onTap={(e) => handleShapeClick(i, e)}
                  x={shape.x}
                  y={shape.y}
                  width={shape.width}
                  height={shape.height}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  fill={shape.fill || 'transparent'}
                  rotation={shape.rotation || 0}
                  draggable={selectable}
                  onDragStart={handleDragStart(shape.id)}
                  onDragEnd={handleDragEnd(shape.id)}
                  onTransformEnd={handleTransformEnd(shape.id)}
                />
              );
            } else if (shape.tool === 'circle') {
              return (
                <Circle
                  key={shape.id}
                  id={shape.id}
                  onClick={(e) => handleShapeClick(i, e)}
                  onTap={(e) => handleShapeClick(i, e)}
                  x={shape.x}
                  y={shape.y}
                  radius={shape.radius}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                  fill={shape.fill || 'transparent'}
                  rotation={shape.rotation || 0}
                  draggable={selectable}
                  onDragStart={handleDragStart(shape.id)}
                  onDragEnd={handleDragEnd(shape.id)}
                  onTransformEnd={handleTransformEnd(shape.id)}
                />
              );
            }
          })}
          {marquee && (
            <Rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill="rgba(59,130,246,0.12)"
              stroke="#3b82f6"
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
            />
          )}
          {tool === 'select' && (
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => (newBox.width < 5 || newBox.height < 5 ? oldBox : newBox)}
            />
          )}
        </Layer>
      </Stage>

      {/* Live YouTube players — HTML overlays positioned over the canvas. They can't
          be Konva nodes (a <canvas> can't host an <iframe>), so the stage transform
          is reproduced here in CSS and each embed keeps using board coordinates.
          pointerEvents is off on the wrapper so the transparent area between videos
          doesn't swallow drawing; each embed turns it back on for itself. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {shapes
          .filter((s) => s.tool === 'video')
          .map((s) => (
            <VideoEmbed
              key={s.id}
              shape={s}
              scale={viewport.scale}
              onLocalChange={handleVideoChange}
              onCommit={handleVideoCommit}
              onDelete={handleVideoDelete}
            />
          ))}
      </div>

      {/* Zoom control. Lives here rather than in the board toolbar because the
          viewport is the Whiteboard's own state — putting it in the toolbar would
          mean plumbing the camera through the store for no gain. */}
      {/* Offset from the right edge to clear the chat launcher, which is pinned at
          bottom-4 right-4 (ChatInterface.tsx). */}
      <div className="absolute bottom-4 right-20 z-20 flex items-center gap-1 rounded-lg border bg-white p-1 shadow-md">
        <button
          onClick={() => zoomFromCentre(1 / 1.2)}
          disabled={viewport.scale <= MIN_SCALE}
          className="rounded p-1.5 text-gray-700 enabled:hover:bg-gray-100 disabled:opacity-30"
          title="Zoom out (Ctrl+-)"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}
          className="min-w-14 rounded px-2 py-1 text-xs font-medium tabular-nums text-gray-700 hover:bg-gray-100"
          title="Reset zoom (Ctrl+0)"
        >
          {Math.round(viewport.scale * 100)}%
        </button>
        <button
          onClick={() => zoomFromCentre(1.2)}
          disabled={viewport.scale >= MAX_SCALE}
          className="rounded p-1.5 text-gray-700 enabled:hover:bg-gray-100 disabled:opacity-30"
          title="Zoom in (Ctrl+=)"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
