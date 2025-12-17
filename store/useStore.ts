import { create } from 'zustand';

export type Tool = 'pen' | 'eraser' | 'rect' | 'circle' | 'image'; // Added 'image'

export interface ShapeData {
  id: string;
  tool: string;
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  color: string;
  strokeWidth: number;
  imageUrl?: string;
}


interface AppState {
  tool: Tool;
  color: string;
  strokeWidth: number;
  shapes: ShapeData[]; // <--- New: Global Shapes Array

  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setShapes: (shapes: ShapeData[]) => void; // <--- New: Overwrite all shapes (for loading)
  addShape: (shape: ShapeData) => void;     // <--- New: Add one shape
  updateShape: (index: number, shape: ShapeData) => void; // <--- New: Update while drawing
}

export const useStore = create<AppState>((set) => ({
  tool: 'pen',
  color: '#000000',
  strokeWidth: 5,
  shapes: [],

  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setShapes: (shapes) => set({ shapes }),
  addShape: (shape) => set((state) => ({ shapes: [...state.shapes, shape] })),
  updateShape: (index, shape) => set((state) => {
    const newShapes = [...state.shapes];
    newShapes[index] = shape;
    return { shapes: newShapes };
  }),
}));