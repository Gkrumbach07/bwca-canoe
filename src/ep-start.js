// Entry points true to life (round 2, the owner 2026-11-05). How each entry point starts in real life, as the v9 table
// src/ep-fixes.json (scripts/ep-fixes.mjs; world.js applyEpFixes) sets it on world.entryPoints:
//   ep.start   'lake' | 'paddle' | 'river' | 'portage' (a road-end lot, or a boat drop, and the carry first)
//   ep.lot     { x, z } the lot on dry ground where the truck leaves you (a portage-first start); the canoe comes off
//              the roof there, and the opening portage ep.open { i, end, join, rods, posted } starts at its edge
//   ep.shares  another entry point's number whose lot and landing this one puts in at (two signs on one board)
//   ep.head    an outfitter's entry point whose own start is not the store's dock: the start's fields (x, z, lake, lot,
//              open) apart from the store, which stays where it was built
// A trailhead (props.js buildTrailhead) is built for each record headRecs gives; the map marks an entry point at its
// start (markOf).
export const startOf = (ep) => (ep && ep.head) || ep || null;
// where an entry point is marked on a map: its lot (where you start), else its landing
export function markOf(ep) { const s = startOf(ep); return s && s.lot ? { x: s.lot.x, z: s.lot.z } : s ? { x: s.x, z: s.z } : null; }
// the trailheads to build: every entry point with no outfitter that has a landing of its own (not a share), and each
// outfitter's entry point's own start apart from its store (its head). A head's record: key 'h<ep>', noFix (the store's
// landings.json row is not its), outfitter false
export function headRecs(world, isOutfitter) {
  const out = [];
  for (const e of world.entryPoints || []) {
    if (e.shares) continue;
    if (!isOutfitter(e.ep)) out.push(e);
    else if (e.head) out.push({ ep: e.ep, key: `h${e.ep}`, noFix: true, name: e.name, start: e.start, x: e.head.x, z: e.head.z, lake: e.head.lake, lot: e.head.lot || null, open: e.head.open || null, drop: e.drop || null });
  }
  return out;
}
// the spot a trailhead record is built by (the tile that holds it): its lot, else its landing
export const anchorOf = (r) => (r.lot ? r.lot : r);
// the entry point whose landing ep's is (itself when it has its own)
export function landingEp(world, ep) { const n = Number(ep), e = (world.entryPoints || []).find((q) => q.ep === n); return e && e.shares ? e.shares : n; }
