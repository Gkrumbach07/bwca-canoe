// The trailheads (game-loop round, stream B). Since the outfitters were cut to fourteen (outfitters.js OUTFITTERS),
// the other entry points are what most of them are in real life: a gravel lot at the end of a forest road, a brown
// Forest Service permit box on a post, a "Welcome to the Boundary Waters" sign and a worn path down to the water. No
// store, no dock. props.js builds each one with its tile (buildTrailhead: the lot where the old store's yard was graded,
// the landing at the shore, all of it merged into the tile's own meshes, so a trailhead adds no draw call) and tells
// this module its layout.
//
// What a trailhead does (outfitter.js): a trip pushes off from its landing like any; standing at the landing does not
// end a trip (a portage or a paddle past it must not), walking up into the lot does (comes out there); the sign is
// what E points at to call a pickup (rides.js pickups: free from the outfitter that sold the trip and serves this
// entry point, priced otherwise). A drive from a counter or a pickup's way back leaves you in the lot with the canoe in
// the water at the landing.
//
//   trailheadLayout(ep) → { ep, name, place, landing: { x, z }, water: { x, z, heading }, lot: { x, z, r, y },
//     sign: { x, y, z, hx, hy, hz, heading }, box: { x, y, z }, door: { x, z, y, heading }, d: { x, z } } | null
//   trailheadLayouts() → [layout], trailheadAt(x, z) → { L, where: 'lot' | 'landing' } | null (built ones only),
//   onTrailhead(fn(L | null, ep)) → off, setTrailhead(L) / dropTrailhead(ep) (props.js)
export const LOT_R = 7;          // m: the lot's radius (a few cars and a trailer); on foot inside it a trip comes out
export const LANDING_R = 24;     // m from the landing (the water's edge) within which you are at a trailhead's landing
const heads = new Map();
const heard = [];
export function trailheadLayout(ep) { const n = ep && typeof ep === 'object' ? ep.ep : Number(ep); return heads.get(n) || null; }
export function trailheadLayouts() { return [...heads.values()]; }
export function onTrailhead(fn) {
  heard.push(fn);
  for (const L of heads.values()) { try { fn(L, L.ep); } catch (e) { console.warn('onTrailhead', e); } }
  return () => { const i = heard.indexOf(fn); if (i >= 0) heard.splice(i, 1); };
}
function tell(L, ep) { for (const fn of heard) { try { fn(L, ep); } catch (e) { console.warn('onTrailhead', e); } } }
export function setTrailhead(L) { heads.set(L.ep, L); queueMicrotask(() => { if (heads.get(L.ep) === L) tell(L, L.ep); }); }
export function dropTrailhead(ep, L = null) { if (heads.has(ep) && (!L || heads.get(ep) === L)) { heads.delete(ep); tell(null, ep); } }
// where (x, z) is at a trailhead: in its lot, or by its landing
export function trailheadAt(x, z) {
  let best = null;
  for (const L of heads.values()) {
    const dl = Math.hypot(L.lot.x - x, L.lot.z - z);
    if (dl <= L.lot.r) return { L, where: 'lot', d: dl };
    const dw = Math.hypot(L.landing.x - x, L.landing.z - z);
    if (dw <= LANDING_R && (!best || dw < best.d)) best = { L, where: 'landing', d: dw };
  }
  return best;
}
// how far (x, z) is from a trailhead: its lot or its landing, the nearer
export function trailheadDist(L, x, z) { return Math.min(Math.max(0, Math.hypot(L.lot.x - x, L.lot.z - z) - L.lot.r), Math.hypot(L.landing.x - x, L.landing.z - z)); }
