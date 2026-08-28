'use client';
import { CloudOff, RefreshCw } from 'lucide-react';

// Shown instead of the page whenever a load fails, rather than rendering an empty
// shell. On the board that distinction matters: an empty canvas is indistinguishable
// from a board whose contents failed to arrive, and saving from that state would
// overwrite real content with nothing.
export default function BackendError({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 p-8">
      <div className="max-w-md text-center">
        <CloudOff size={48} className="mx-auto mb-4 text-gray-400" />
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Can&apos;t load your work</h2>
        <p className="mb-6 text-sm text-gray-600">{message}</p>
        <button
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-white transition enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={retrying ? 'animate-spin' : undefined} />
          {retrying ? 'Retrying...' : 'Try again'}
        </button>
      </div>
    </div>
  );
}
