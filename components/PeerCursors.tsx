'use client';
import { useStore } from '@/store/useStore';
import { colorForId } from '@/utils/presence';

// Other people's pointers, drawn as an HTML overlay rather than Konva nodes.
//
// A cursor has to stay the same size on screen however far the board is zoomed —
// a Konva node would scale with the stage and need counter-scaling on every
// render, and its label would need text measurement to boot. Projecting board
// coordinates into screen space by hand is the simpler half of that trade, and
// it's the same arithmetic the text editor overlay already does.
//
// Subscribes to `peers` alone. Cursor updates land many times a second, and this
// component re-rendering on each one costs almost nothing; the Whiteboard
// re-rendering its whole shape list would not.
export default function PeerCursors({
  viewport,
}: {
  viewport: { x: number; y: number; scale: number };
}) {
  const peers = useStore((s) => s.peers);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {Object.entries(peers).map(([id, peer]) => {
        // No cursor means their pointer has left the canvas — they're still on the
        // board, just not pointing at it.
        if (!peer.cursor) return null;
        const color = colorForId(id);
        return (
          <div
            key={id}
            className="absolute top-0 left-0"
            style={{
              // Board -> screen. transform rather than left/top so the browser can
              // move these on the compositor instead of relaying out the overlay.
              transform: `translate(${peer.cursor.x * viewport.scale + viewport.x}px, ${
                peer.cursor.y * viewport.scale + viewport.y
              }px)`,
            }}
          >
            {/* A plain arrow, drawn rather than imported: it has to be tinted per
                peer, and an inline path is cheaper than a coloured icon font. */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ display: 'block' }}>
              <path
                d="M2 1.5 L2 14 L5.6 10.6 L8 15.5 L10.4 14.3 L8 9.6 L13 9.6 Z"
                fill={color}
                stroke="#fff"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="absolute top-4 left-3 max-w-40 truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              {peer.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
