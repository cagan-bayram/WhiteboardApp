'use client';
import dynamic from 'next/dynamic';
import { useStore } from '@/store/useStore';
import ChatInterface from '@/components/ChatInterface';

// Dynamic import for Canvas (No SSR)
const Whiteboard = dynamic(() => import('@/components/Whiteboard'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-screen">Loading Board...</div>,
});

export default function Home() {
  const { setTool, setColor, tool } = useStore();
  const roomId = 'default-room'; // In a real app, get this from URL params

  return (
    <main className="relative w-full h-screen overflow-hidden">
      {/* Toolbar Overlay */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-white shadow-md p-2 rounded-lg flex gap-4 border">
        <button 
          className={`px-4 py-2 rounded ${tool === 'pen' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
          onClick={() => setTool('pen')}
        >
          Pencil
        </button>
        <button 
          className={`px-4 py-2 rounded ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
          onClick={() => setTool('eraser')}
        >
          Eraser
        </button>

        <button 
          className={`px-4 py-2 rounded ${tool === 'rect' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
          onClick={() => setTool('rect')}
        >
          Rectangle
        </button>
        <button 
          className={`px-4 py-2 rounded ${tool === 'circle' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
          onClick={() => setTool('circle')}
        >
          Circle
        </button>
        {/* Thickness Slider */}
        <div className="flex flex-col">
          <span className="text-xs text-gray-500">Size</span>
          <input 
            type="range" 
            min="1" 
            max="20" 
            defaultValue="5"
            onChange={(e) => useStore.getState().setStrokeWidth(Number(e.target.value))}
          />
        </div>
        <input 
          type="color" 
          onChange={(e) => setColor(e.target.value)} 
          className="h-10 w-10 cursor-pointer"
        />
      </div>

      <Whiteboard roomId={roomId} />
      <ChatInterface />
    </main>
  );
}