// Who else is on the board, and where they are.
//
// Presence is deliberately ephemeral: it lives only in memory, is never written
// to Supabase, and disappears when a socket does. Nothing here is authoritative
// about the board's content — it only describes people.

export interface PeerPresence {
  // What to show above their cursor.
  name: string;
  // Their pointer in *board* coordinates, or null when it isn't over the canvas.
  // Board coordinates rather than screen ones because every viewer has their own
  // pan and zoom: the same point has to land on the same shape for everybody.
  cursor?: { x: number; y: number } | null;
  // Shape ids they currently have selected.
  selection?: string[];
}

// Stable colour for a connection. Derived from the socket id on both ends rather
// than sent over the wire, so a peer's cursor and their selection outlines always
// agree without the colour having to be part of any payload.
export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 360;
  // Fixed saturation and lightness keep every peer legible against white and
  // distinguishable from the board's own black strokes and blue selection UI.
  return `hsl(${hash} 72% 45%)`;
}

// The label shown to other people. Boards are link-shareable, so this is the one
// place a user's identity reaches strangers — keep it to the local part of the
// address rather than the whole thing.
export function labelForEmail(email?: string | null): string {
  const local = email?.split('@')[0]?.trim();
  return local || 'Someone';
}
