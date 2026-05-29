'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import { getUserProfile, updateDisplayName } from '@/utils/profile';

export default function SettingsPage() {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [userEmail, setUserEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [saveMessage, setSaveMessage] = useState('');

    useEffect(() => {
        const loadProfile = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/');
                return;
            }
            setUserEmail(session.user.email ?? '');
            const profile = await getUserProfile(session.user.id);
            if (profile?.display_name) setDisplayName(profile.display_name);
            setIsLoading(false);
        };
        loadProfile();
    }, [supabase, router]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage('');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const success = await updateDisplayName(session.user.id, displayName.trim());
        setIsSaving(false);
        setSaveMessage(success ? 'Changes saved!' : 'Failed to save. Please try again.');
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p>Loading...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-2xl mx-auto p-8">
                {/* Header */}
                <div className="mb-8">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 transition"
                    >
                        <ChevronLeft size={20} />
                        Back
                    </button>
                    <h1 className="text-3xl font-bold text-gray-800">Settings</h1>
                    <p className="text-gray-600 mt-2">Manage your account preferences</p>
                </div>

                {/* Settings Sections */}
                <div className="space-y-6">
                    {/* Account Section */}
                    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Account Settings</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={userEmail}
                                    disabled
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                                />
                                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Display Name
                                </label>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    placeholder="Your name"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Preferences Section */}
                    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Preferences</h2>
                        <div className="space-y-4">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    defaultChecked
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-gray-700">Enable email notifications</span>
                            </label>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    defaultChecked
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-gray-700">Enable collaboration notifications</span>
                            </label>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="bg-white rounded-lg shadow-sm p-6 border border-red-100">
                        <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
                        <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                            Delete Account
                        </button>
                        <p className="text-xs text-gray-500 mt-2">This action cannot be undone.</p>
                    </div>

                    {saveMessage && (
                        <p className={`text-sm text-center font-medium ${saveMessage.includes('saved') ? 'text-green-600' : 'text-red-600'}`}>
                            {saveMessage}
                        </p>
                    )}

                    {/* Save Button */}
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}
