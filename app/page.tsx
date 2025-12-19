'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase';
import Auth from '@/components/Auth';
import { useRouter } from 'next/navigation';
import { Plus, LayoutGrid } from 'lucide-react';

export default function Dashboard() {
  const supabase = createClient();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [boards, setBoards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchBoards(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchBoards(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchBoards = async (userId: string) => {
    const { data } = await supabase
      .from('whiteboards')
      .select('id, title, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (data) setBoards(data);
    setLoading(false);
  };

  const createNewBoard = async () => {
    if (!session) return;
    // 1. Create a new row in Supabase
    const { data, error } = await supabase
      .from('whiteboards')
      .insert({ 
        user_id: session.user.id, 
        title: 'New Whiteboard',
        content: [] 
      })
      .select()
      .single();

    if (data) {
      // 2. Redirect to the new board
      router.push(`/board/${data.id}`);
    }
  };

  if (!session) return <Auth />;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <LayoutGrid /> My Whiteboards
          </h1>
          <div className="flex gap-4">
             <button onClick={() => supabase.auth.signOut()} className="text-red-600 hover:underline">
                Sign Out
             </button>
             <button 
               onClick={createNewBoard}
               className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition"
             >
               <Plus size={20} /> Create New Board
             </button>
          </div>
        </div>

        {loading ? (
          <p>Loading boards...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {boards.map((board) => (
              <div 
                key={board.id} 
                onClick={() => router.push(`/board/${board.id}`)}
                className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition cursor-pointer border border-gray-100 flex flex-col h-40 justify-between"
              >
                <h3 className="font-semibold text-lg text-gray-800">{board.title || 'Untitled'}</h3>
                <p className="text-xs text-gray-400">
                  {new Date(board.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
            
            {/* Empty State */}
            {boards.length === 0 && (
              <div className="col-span-full text-center py-20 text-gray-500">
                You haven't created any whiteboards yet. Click "Create New Board" to start!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}