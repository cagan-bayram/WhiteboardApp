'use client';
import { useEffect, useMemo, useState } from 'react';
import React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import ChatInterface from '@/components/ChatInterface';
import { createClient } from '@/utils/supabase';
import Auth from '@/components/Auth';
import { Save, LogOut, Video, Type, PaintBucket, Home, Share2, Check, MousePointer2 } from 'lucide-react';

const Whiteboard = dynamic(() => import('@/components/Whiteboard'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-screen">Loading Board...</div>,
});

export default function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = React.use(params);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [boardTitle, setBoardTitle] = useState('Untitled Board');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const { setTool, setColor, setStrokeWidth, tool, shapes, setShapes } = useStore();

  useEffect(() => {
    const loadBoard = async () => {
      setLoading(true);
      // No user_id filter: any authenticated user with the link can load the board
      const { data } = await supabase
        .from('whiteboards')
        .select('content, title')
        .eq('id', boardId)
        .single();

      if (data) {
        if (data.content) setShapes(data.content);
        setBoardTitle(data.title || 'Untitled Board');
      }
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadBoard();
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Only reload board on explicit sign-in; ignore token refreshes to preserve unsaved work
      if (session && _event === 'SIGNED_IN') loadBoard();
    });

    return () => subscription.unsubscribe();
  }, [boardId, supabase, setShapes]);

  // Extracts a YouTube video id from either a full watch URL or a youtu.be link.
  const extractVideoId = (url: string): string | null => {
    const byParam = url.split('v=')[1]?.split('&')[0];
    if (byParam) return byParam;
    const byShort = url.split('youtu.be/')[1]?.split(/[?&]/)[0];
    return byShort || null;
  };

  const handleAddVideo = () => {
    const videoId = extractVideoId(videoUrl.trim());
    if (!videoId) {
      showToast('Could not read a YouTube video ID from that URL.');
      return;
    }
    const shape = {
      id: crypto.randomUUID(),
      tool: 'video',
      x: 100, y: 100,
      width: 400, height: 225,
      color: 'transparent', strokeWidth: 0,
      videoId,
    };
    useStore.getState().addShape(shape);
    useStore.getState().broadcastShape?.(shape);
    setVideoUrl('');
    setShowVideoModal(false);
  };

  const handleSave = async () => {
    if (!session) return;
    // Update (not upsert): the row already exists, and this avoids reassigning
    // user_id to a collaborator who isn't the original owner.
    const { error } = await supabase
      .from('whiteboards')
      .update({
        content: shapes,
        title: boardTitle,
      })
      .eq('id', boardId);
    showToast(error ? 'Error saving: ' + error.message : 'Board saved successfully!');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShapes([]);
    // Leave the board URL so the next account to sign in doesn't auto-load this
    // board (boards are link-accessible, so staying here would leak it).
    router.push('/');
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-secure context) — show the link instead.
      showToast(window.location.href);
    }
  };

  const handleGoHome = () => {
    router.push('/');
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!session) return <Auth />;

  return (
    <main className="relative w-full h-screen overflow-hidden">
      {/* Toolbar */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-white shadow-md p-2 rounded-lg flex gap-4 border items-center">
        <button onClick={handleGoHome} className="p-2 text-gray-700 hover:bg-gray-100 rounded flex flex-col items-center" title="Back to Home">
          <Home size={20} />
          <span className="text-[9px]">Home</span>
        </button>
        <div className="w-px h-8 bg-gray-300"></div>
        <button className={`px-4 py-2 rounded ${tool === 'select' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('select')} title="Select / Move / Resize">
          <MousePointer2 size={18} />
        </button>
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
        <button onClick={handleShare} className="p-2 text-blue-600 hover:bg-blue-50 rounded flex flex-col items-center" title="Copy shareable link">
          {copied ? <Check size={20} /> : <Share2 size={20} />}
          <span className="text-[9px]">{copied ? 'Copied' : 'Share'}</span>
        </button>
        <button onClick={() => setShowVideoModal(true)} className="p-2 text-red-600 hover:bg-red-50 rounded" title="Add Video">
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

      {/* Add Video modal (replaces prompt(), which is blocked in sandboxed embeds) */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Add YouTube Video</h2>
            <p className="text-gray-600 text-sm mb-4">Paste a YouTube link to drop its thumbnail on the board.</p>
            <input
              autoFocus
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddVideo();
                else if (e.key === 'Escape') { setShowVideoModal(false); setVideoUrl(''); }
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowVideoModal(false); setVideoUrl(''); }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddVideo}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transient toast (replaces alert()) */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg max-w-[90vw] break-words text-center">
          {toast}
        </div>
      )}
    </main>
  );
}
