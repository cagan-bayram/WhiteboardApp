'use client';
import { useEffect, useMemo, useState } from 'react';
import React from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@/store/useStore';
import ChatInterface from '@/components/ChatInterface';
import { createClient } from '@/utils/supabase';
import Auth from '@/components/Auth';
import { Save, LogOut, Video, Type, PaintBucket } from 'lucide-react';

const Whiteboard = dynamic(() => import('@/components/Whiteboard'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-screen">Loading Board...</div>,
});

export default function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = React.use(params);
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [boardTitle, setBoardTitle] = useState('Untitled Board');

  const { setTool, setColor, setStrokeWidth, tool, shapes, setShapes } = useStore();

  useEffect(() => {
    const loadBoard = async (userId: string) => {
      setLoading(true);
      const { data } = await supabase
        .from('whiteboards')
        .select('content, title')
        .eq('id', boardId)
        .eq('user_id', userId)
        .single();

      if (data) {
        if (data.content) setShapes(data.content);
        setBoardTitle(data.title || 'Untitled Board');
      }
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadBoard(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Only reload board on explicit sign-in; ignore token refreshes to preserve unsaved work
      if (session && _event === 'SIGNED_IN') loadBoard(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [boardId, supabase, setShapes]);

  const handleAddVideo = () => {
    const url = prompt('Enter YouTube URL:');
    if (url) {
      const videoId = url.split('v=')[1]?.split('&')[0];
      if (videoId) {
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/0.jpg`;
        const newShape = {
          id: crypto.randomUUID(),
          tool: 'image',
          x: 100, y: 100,
          width: 320, height: 180,
          color: 'transparent', strokeWidth: 0,
          imageUrl: thumbnailUrl,
        };
        useStore.getState().addShape(newShape);
      }
    }
  };

  const handleSave = async () => {
    if (!session) return;
    const { error } = await supabase
      .from('whiteboards')
      .upsert({
        id: boardId,
        user_id: session.user.id,
        content: shapes,
        title: boardTitle,
      });
    if (error) {
      alert('Error saving: ' + error.message);
    } else {
      alert('Board saved successfully!');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShapes([]);
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!session) return <Auth />;

  return (
    <main className="relative w-full h-screen overflow-hidden">
      {/* Toolbar */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-white shadow-md p-2 rounded-lg flex gap-4 border items-center">
        <button className={`px-4 py-2 rounded ${tool === 'pen' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('pen')}>Pencil</button>
        <button className={`px-4 py-2 rounded ${tool === 'rect' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('rect')}>Rect</button>
        <button className={`px-4 py-2 rounded ${tool === 'circle' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('circle')}>Circle</button>
        <button className={`px-4 py-2 rounded ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('eraser')}>Eraser</button>
        <button className={`px-4 py-2 rounded ${tool === 'text' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('text')} title="Text Tool">
          <Type size={18} />
        </button>
        <button className={`px-4 py-2 rounded ${tool === 'bucket' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('bucket')} title="Fill Color">
          <PaintBucket size={18} />
        </button>
        <div className="flex flex-col w-24">
          <span className="text-[10px] text-gray-500 text-center">Thickness</span>
          <input type="range" min="1" max="20" defaultValue="5" onChange={(e) => setStrokeWidth(Number(e.target.value))} />
        </div>
        <input type="color" onChange={(e) => setColor(e.target.value)} className="h-10 w-10 cursor-pointer" />

        <div className="w-px h-8 bg-gray-300 mx-2"></div>
        <button onClick={handleAddVideo} className="p-2 text-red-600 hover:bg-red-50 rounded" title="Add Video">
          <Video size={20} />
        </button>
        <button onClick={handleSave} className="p-2 text-green-600 hover:bg-green-50 rounded flex flex-col items-center" title="Save Board">
          <Save size={20} />
          <span className="text-[9px]">Save</span>
        </button>
        <button onClick={handleLogout} className="p-2 text-red-600 hover:bg-red-50 rounded flex flex-col items-center" title="Logout">
          <LogOut size={20} />
          <span className="text-[9px]">Logout</span>
        </button>
      </div>

      <Whiteboard roomId={boardId} />
      <ChatInterface />
    </main>
  );
}
