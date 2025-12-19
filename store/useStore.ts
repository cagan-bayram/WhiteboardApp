import { create } from 'zustand';

// Added 'text' and 'bucket'
export type Tool = 'pen' | 'eraser' | 'rect' | 'circle' | 'image' | 'text' | 'bucket'; 

export interface ShapeData {
  id: string;
  tool: string;
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  text?: string;    // New: For text tool
  fill?: string;    // New: For bucket fill
  color: string;    // Stroke color
  strokeWidth: number;
  imageUrl?: string;
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
  updateShape: (index: number, shape: ShapeData) => void;
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