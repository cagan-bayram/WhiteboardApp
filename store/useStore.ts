import { create } from 'zustand';

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
}

interface AppState {
  tool: Tool;
  color: string;
  strokeWidth: number;
  shapes: ShapeData[];

  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setShapes: (shapes: ShapeData[]) => void;
  addShape: (shape: ShapeData) => void;
  prependShape: (shape: ShapeData) => void;
  updateShape: (index: number, shape: ShapeData) => void;
  updateShapeById: (id: string, shape: ShapeData) => void;
  removeShapeById: (id: string) => void;

  // Registered by the Whiteboard so other components (e.g. the board toolbar)
  // can broadcast a newly added shape over the socket without owning it.
  broadcastShape: ((shape: ShapeData) => void) | null;
  setBroadcastShape: (fn: ((shape: ShapeData) => void) | null) => void;
}

export const useStore = create<AppState>((set) => ({
  tool: 'select',
  color: '#000000',
  strokeWidth: 5,
  shapes: [],

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

  broadcastShape: null,
  setBroadcastShape: (broadcastShape) => set({ broadcastShape }),
}));
