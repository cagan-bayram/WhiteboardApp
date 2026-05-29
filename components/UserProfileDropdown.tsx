'use client';
import { useRef, useEffect, useState } from 'react';
import { User, Settings, Gift, LogOut, ChevronDown } from 'lucide-react';

interface UserProfileDropdownProps {
    userEmail?: string;
    onLogout: () => void;
    onSettings: () => void;
    onSubscriptions: () => void;
}

export default function UserProfileDropdown({
    userEmail = 'User',
    onLogout,
    onSettings,
    onSubscriptions,
}: UserProfileDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => {
        setIsOpen(false);
        onLogout();
    };

    const handleSettings = () => {
        setIsOpen(false);
        onSettings();
    };

    const handleSubscriptions = () => {
        setIsOpen(false);
        onSubscriptions();
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition text-gray-700"
            >
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                    <User size={16} />
                </div>
                <ChevronDown size={16} className={`transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-800">Logged in as</p>
                        <p className="text-xs text-gray-500 truncate">{userEmail}</p>
                    </div>

                    <button
                        onClick={handleSettings}
                        className="w-full flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition text-sm"
                    >
                        <Settings size={16} />
                        Settings
                    </button>

                    <button
                        onClick={handleSubscriptions}
                        className="w-full flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition text-sm"
                    >
                        <Gift size={16} />
                        Subscriptions
                    </button>

                    <div className="border-t border-gray-100 my-1"></div>

                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition text-sm"
                    >
                        <LogOut size={16} />
                        Sign Out
                    </button>
                </div>
            )}
        </div>
    );
}
