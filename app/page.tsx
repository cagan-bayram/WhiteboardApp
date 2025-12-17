'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@/store/useStore';
import ChatInterface from '@/components/ChatInterface';
import { createClient } from '@/utils/supabase';
import Auth from '@/components/Auth';
import { Save, LogOut } from 'lucide-react';

const Whiteboard = dynamic(() => import('@/components/Whiteboard'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-screen">Loading Board...</div>,
});

export default function Home() {
  const supabase = createClient();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // We grab shapes and setShapes from the store
  const { setTool, setColor, setStrokeWidth, tool, shapes, setShapes } = useStore();

  useEffect(() => {
    // Check Auth Session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadUserBoard(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadUserBoard(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Function to Load Board from Supabase
  const loadUserBoard = async (userId: string) => {
    setLoading(true);
    // Fetch the most recently updated board for this user
    const { data, error } = await supabase
      .from('whiteboards')
      .select('content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data && data.content) {
      setShapes(data.content); // Restore the shapes!
    }
    setLoading(false);
  };

  // Function to Save Board to Supabase
  const handleSave = async () => {
    if (!session) return;
    
    // We are saving the entire 'shapes' array as a JSON blob
    const { error } = await supabase
      .from('whiteboards')
      .insert({ 
        user_id: session.user.id, 
        content: shapes, // Supabase automatically handles the JSON conversion
        title: 'My Saved Board' 
      }); 
      // Note: "insert" creates a NEW row every time (like "Save As"). 
      // To "Overwrite", we would need the Board ID. 
      // For now, "insert" is safer to prevent data loss.

    if (error) {
      alert('Error saving: ' + error.message);
    } else {
      alert('Board saved successfully!');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShapes([]); // Clear board on logout
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

        <div className="flex flex-col w-24">
           <span className="text-[10px] text-gray-500 text-center">Thickness</span>
           <input type="range" min="1" max="20" defaultValue="5" onChange={(e) => setStrokeWidth(Number(e.target.value))} />
        </div>
        <input type="color" onChange={(e) => setColor(e.target.value)} className="h-10 w-10 cursor-pointer" />

        <div className="w-px h-8 bg-gray-300 mx-2"></div>

        <button onClick={handleSave} className="p-2 text-green-600 hover:bg-green-50 rounded flex flex-col items-center" title="Save Board">
           <Save size={20}/>
           <span className="text-[9px]">Save</span>
        </button>
        <button onClick={handleLogout} className="p-2 text-red-600 hover:bg-red-50 rounded flex flex-col items-center" title="Logout">
           <LogOut size={20}/>
           <span className="text-[9px]">Logout</span>
        </button>
      </div>

      <Whiteboard roomId="default-room" />
      <ChatInterface />
    </main>
  );
}