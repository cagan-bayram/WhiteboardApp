'use client';
import { useState } from 'react';
import { X } from 'lucide-react';

interface NameBoardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (name: string) => void;
    isLoading?: boolean;
}

export default function NameBoardModal({ isOpen, onClose, onConfirm, isLoading = false }: NameBoardModalProps) {
    const [boardName, setBoardName] = useState('');

    const handleConfirm = () => {
        if (boardName.trim()) {
            onConfirm(boardName.trim());
            setBoardName('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && boardName.trim()) {
            handleConfirm();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Create New Whiteboard</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Whiteboard Name
                    </label>
                    <input
                        type="text"
                        value={boardName}
                        onChange={(e) => setBoardName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter board name..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                        autoFocus
                        disabled={isLoading}
                    />
                </div>

                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!boardName.trim() || isLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Creating...' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
}
