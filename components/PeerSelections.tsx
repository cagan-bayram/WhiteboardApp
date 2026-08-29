'use client';
import { Rect } from 'react-konva';
import Konva from 'konva';
import { useStore } from '@/store/useStore';
import { colorForId } from '@/utils/presence';

// Outlines around shapes other people have selected, in the same colour as their
// cursor. Selection has always been purely local, so until now two people could
// grab the same shape and neither would have any idea.
//
// This shows, it doesn't lock: you can still take a shape someone else is holding.
// Locking is a much larger question (who wins, for how long, what happens when
// they disconnect mid-drag) and deliberately isn't attempted here.
export default function PeerSelections({ stage }: { stage: Konva.Stage | null }) {
  const peers = useStore((s) => s.peers);
  // Subscribed to so the outlines follow a shape as it's moved or resized — the
  // geometry below is read off live nodes, which only happens on a render.
  const shapes = useStore((s) => s.shapes);

  if (!stage) return null;

  return (
    <>
      {Object.entries(peers).flatMap(([id, peer]) => {
        const color = colorForId(id);
        return (peer.selection ?? []).map((shapeId) => {
          const node = stage.findOne('#' + shapeId);
          // They may have a shape selected that we've since deleted, or that hasn't
          // reached us yet.
          if (!node || !shapes.some((s) => s.id === shapeId)) return null;
          // relativeTo the stage: board coordinates, which is the space this Layer
          // draws in. A bare getClientRect() would be screen coordinates and drift
          // the moment either of us pans or zooms.
          const box = node.getClientRect({ relativeTo: stage });
          return (
            <Rect
              key={id + ':' + shapeId}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              stroke={color}
              strokeWidth={2}
              dash={[6, 4]}
              // Purely decorative: it must never absorb a click meant for the shape
              // underneath, and it must never be scaled by a Transformer.
              listening={false}
              // The stroke shouldn't thicken as the board is zoomed in.
              strokeScaleEnabled={false}
            />
          );
        });
      })}
    </>
  );
}
