import { create } from 'zustand';

type Tool = 'pen' | 'eraser';

interface AppState {
  tool: Tool;
  color: string;
  strokeWidth: number;
  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
}

export const useStore = create<AppState>((set) => ({
  tool: 'pen',
  color: '#000000',
  strokeWidth: 5,
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
}));