'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import ChatInterface from '@/components/ChatInterface';
import { createClient } from '@/utils/supabase';
import { withTimeout, describeBackendError } from '@/utils/backend';
import BackendError from '@/components/BackendError';
import Auth from '@/components/Auth';
import { Save, LogOut, Video, Type, PaintBucket, Home, Share2, Check, MousePointer2, Undo2, Redo2 } from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);
  // Bumped by "Try again". The load lives inside an effect keyed on the board, so
  // re-running it is a dependency change rather than a separate code path.
  const [retryToken, setRetryToken] = useState(0);
  const [boardTitle, setBoardTitle] = useState('Untitled Board');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const { setTool, setColor, setStrokeWidth, tool, shapes, setShapes, past, future, requestUndo, requestRedo } = useStore();

  // Which user's board content is already loaded. Loading is keyed on identity
  // rather than on the auth event, because SIGNED_IN fires for far more than an
  // actual sign-in: Supabase broadcasts it to every open tab when any one of
  // them authenticates, and re-emits it when a tab regains focus. Each of those
  // used to re-run loadBoard(), whose setShapes() overwrote whatever had been
  // drawn but not yet saved — so merely opening the same board in a second tab
  // wiped the first tab's work.
  const loadedForUser = useRef<string | null>(null);

  useEffect(() => {
    // A different board means the previous load no longer counts, and no peer has
    // seeded the new one yet.
    loadedForUser.current = null;
    useStore.getState().setHydratedFromPeer(false);

    // Guards against a resolved request writing into a board we've navigated away from.
    let cancelled = false;

    const loadBoard = async (userId: string) => {
      // Same user, board already loaded: nothing to fetch, and re-fetching would
      // clobber unsaved shapes. Switching accounts still reloads, as it should.
      if (loadedForUser.current === userId) return;
      loadedForUser.current = userId;

      setLoading(true);
      setError(null);
      try {
        // No user_id filter: any authenticated user with the link can load the board
        const { data, error } = await withTimeout(
          supabase
            .from('whiteboards')
            .select('content, title')
            .eq('id', boardId)
            .single()
        );

        // Previously only `data` was read, so a failed query fell through to an empty
        // canvas — indistinguishable from an genuinely empty board, and one Save away
        // from overwriting real content with nothing.
        if (error) throw error;
        if (cancelled) return;

        if (data) {
          // A peer's snapshot may have landed while this request was in flight. It
          // reflects the live board; `content` only reflects the last save, so
          // writing it now would roll the board back to whenever someone last
          // pressed Save.
          if (data.content && !useStore.getState().hydratedFromPeer) setShapes(data.content);
          setBoardTitle(data.title || 'Untitled Board');
        }
      } catch (e) {
        // Release the guard, or "Try again" would short-circuit on the id we recorded
        // above and never re-fetch.
        loadedForUser.current = null;
        if (!cancelled) setError(describeBackendError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    withTimeout(supabase.auth.getSession())
      .then(({ data: { session } }) => {
        if (cancelled) return;
        setSession(session);
        if (session) loadBoard(session.user.id);
        else setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(describeBackendError(e));
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        // Signed out — the next sign-in should load fresh, even as the same user.
        loadedForUser.current = null;
        return;
      }
      loadBoard(session.user.id);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [boardId, supabase, setShapes, retryToken]);

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
    // Read the index after the add — it lands on top of whatever is there now.
    useStore.getState().pushHistory([
      { id: shape.id, index: useStore.getState().shapes.length - 1, after: shape },
    ]);
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
  // Deliberately ahead of the Whiteboard: rendering a blank canvas for a board whose
  // contents failed to arrive is how unsaved-looking state becomes real data loss.
  if (error) {
    return <BackendError message={error} onRetry={() => setRetryToken((t) => t + 1)} retrying={loading} />;
  }
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
        <button
          onClick={() => requestUndo?.()}
          disabled={!past.length}
          className="p-2 text-gray-700 rounded enabled:hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={20} />
        </button>
        <button
          onClick={() => requestRedo?.()}
          disabled={!future.length}
          className="p-2 text-gray-700 rounded enabled:hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 size={20} />
        </button>
        <div className="w-px h-8 bg-gray-300"></div>
        <button className={`px-4 py-2 rounded ${tool === 'select' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('select')} title="Select / Move / Resize (V)">
          <MousePointer2 size={18} />
        </button>
        <button className={`px-4 py-2 rounded ${tool === 'pen' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('pen')} title="Pencil (P)">Pencil</button>
        <button className={`px-4 py-2 rounded ${tool === 'rect' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('rect')} title="Rectangle (R)">Rect</button>
        <button className={`px-4 py-2 rounded ${tool === 'circle' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('circle')} title="Circle (C)">Circle</button>
        <button className={`px-4 py-2 rounded ${tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('eraser')} title="Eraser (E)">Eraser</button>
        <button className={`px-4 py-2 rounded ${tool === 'text' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('text')} title="Text Tool (T)">
          <Type size={18} />
        </button>
        <button className={`px-4 py-2 rounded ${tool === 'bucket' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-black'}`} onClick={() => setTool('bucket')} title="Fill Color (F)">
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg max-w-[90vw] wrap-break-word text-center">
          {toast}
        </div>
      )}
    </main>
  );
}
