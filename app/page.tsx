'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase';
import { withTimeout, describeBackendError } from '@/utils/backend';
import BackendError from '@/components/BackendError';
import Auth from '@/components/Auth';
import NameBoardModal from '@/components/NameBoardModal';
import UserProfileDropdown from '@/components/UserProfileDropdown';
import { useRouter } from 'next/navigation';
import { Plus, LayoutGrid, Trash2, Star } from 'lucide-react';

export default function Dashboard() {
  // Memoised: createClient() on every render built a fresh client each time, and the
  // retry callback below has to close over a stable one.
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [boards, setBoards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);

  // Throws rather than swallowing: this used to destructure only `data`, so a failed
  // query left `boards` empty and the dashboard claimed you had no boards.
  const fetchBoards = useCallback(async (userId: string) => {
    const { data, error } = await withTimeout(
      supabase
        .from('whiteboards')
        .select('id, title, created_at, starred')
        .eq('user_id', userId)
        .order('starred', { ascending: false })
        .order('created_at', { ascending: false })
    );

    if (error) throw error;
    setBoards(data ?? []);
  }, [supabase]);

  // Everything the first render waits on, as one retryable unit.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await withTimeout(supabase.auth.getSession());
      setSession(session);
      if (session) await fetchBoards(session.user.id);
    } catch (e) {
      setError(describeBackendError(e));
    } finally {
      setLoading(false);
    }
  }, [supabase, fetchBoards]);

  useEffect(() => {
    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // A refresh here can fail just as the initial load can, and dropping it would
      // put us back to a stale board list with no indication anything went wrong.
      if (session) fetchBoards(session.user.id).catch((e) => setError(describeBackendError(e)));
    });

    return () => subscription.unsubscribe();
  }, [load, supabase, fetchBoards]);

  const createNewBoard = async (title: string) => {
    if (!session) return;
    setIsCreating(true);

    const { data, error } = await supabase
      .from('whiteboards')
      .insert({
        user_id: session.user.id,
        title: title,
        content: [],
        starred: false
      })
      .select()
      .single();

    setIsCreating(false);
    setShowNameModal(false);

    if (data) {
      router.push(`/board/${data.id}`);
    } else if (error) {
      console.error('Error creating board:', error);
    }
  };

  const toggleStarBoard = async (e: React.MouseEvent, boardId: string, currentStarred: boolean) => {
    e.stopPropagation();

    const { error } = await supabase
      .from('whiteboards')
      .update({ starred: !currentStarred })
      .eq('id', boardId);

    if (!error) {
      setBoards(boards.map(b =>
        b.id === boardId ? { ...b, starred: !currentStarred } : b
      ));
    }
  };

  const deleteBoard = async (boardId: string) => {
    const { error } = await supabase
      .from('whiteboards')
      .delete()
      .eq('id', boardId);

    if (!error) {
      setBoards(boards.filter(b => b.id !== boardId));
    }
    setDeleteConfirm(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const starredBoards = boards.filter(b => b.starred);
  const regularBoards = boards.filter(b => !b.starred);

  if (loading) return <div className="flex h-screen items-center justify-center"><p>Loading...</p></div>;
  // Before the Auth check: an unreachable backend means we don't know whether there's
  // a session, and showing a sign-in form would invite a login that can't succeed.
  if (error) return <BackendError message={error} onRetry={load} retrying={loading} />;
  if (!session) return <Auth />;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <LayoutGrid /> My Whiteboards
          </h1>
          <div className="flex gap-4 items-center">
            <button
              onClick={() => setShowNameModal(true)}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition"
            >
              <Plus size={20} /> Create New Board
            </button>
            <UserProfileDropdown
              userEmail={session?.user?.email || 'User'}
              onLogout={handleLogout}
              onSettings={() => router.push('/settings')}
              onSubscriptions={() => router.push('/subscriptions')}
            />
          </div>
        </div>

        {loading ? (
          <p>Loading boards...</p>
        ) : (
          <div className="space-y-8">
            {/* Starred Boards Section */}
            {starredBoards.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Star size={20} className="text-yellow-500 fill-yellow-500" /> Starred Boards
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {starredBoards.map((board) => (
                    <div
                      key={board.id}
                      onClick={() => router.push(`/board/${board.id}`)}
                      className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer border border-yellow-200 flex flex-col h-40 justify-between group relative"
                    >
                      <h3 className="font-semibold text-lg text-gray-800">{board.title || 'Untitled'}</h3>
                      <p className="text-xs text-gray-400">
                        {new Date(board.created_at).toLocaleDateString()}
                      </p>
                      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={(e) => toggleStarBoard(e, board.id, board.starred)}
                          className="p-2 bg-yellow-100 text-yellow-600 rounded hover:bg-yellow-200 transition"
                        >
                          <Star size={16} className="fill-yellow-500 text-yellow-500" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ id: board.id, title: board.title }); }}
                          className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Boards Section */}
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">All Boards</h2>
              {regularBoards.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {regularBoards.map((board) => (
                    <div
                      key={board.id}
                      onClick={() => router.push(`/board/${board.id}`)}
                      className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer border border-gray-100 flex flex-col h-40 justify-between group relative"
                    >
                      <h3 className="font-semibold text-lg text-gray-800">{board.title || 'Untitled'}</h3>
                      <p className="text-xs text-gray-400">
                        {new Date(board.created_at).toLocaleDateString()}
                      </p>
                      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={(e) => toggleStarBoard(e, board.id, board.starred)}
                          className="p-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition"
                        >
                          <Star size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ id: board.id, title: board.title }); }}
                          className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : starredBoards.length === 0 ? (
                <div className="col-span-full text-center py-20 text-gray-500">
                  You haven't created any whiteboards yet. Click "Create New Board" to start!
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No regular boards yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-gray-800 mb-2">Delete Whiteboard?</h2>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete "<strong>{deleteConfirm.title}</strong>"? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteBoard(deleteConfirm.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Name Board Modal */}
        <NameBoardModal
          isOpen={showNameModal}
          onClose={() => setShowNameModal(false)}
          onConfirm={createNewBoard}
          isLoading={isCreating}
        />
      </div>
    </div>
  );
}
