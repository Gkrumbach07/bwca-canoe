// The silhouette match (campaign-design §7.1 "Photo matches … silhouette: true compares only the terrain horizon";
// campaign stream b5, Round 5; docs/story/32-the-boys.md §5.3, 10 NB55, bible 5.2 lock 3B, `independent: false`): an old
// print held up against the view until the ridge on it lies on the ridge in front of you. Gene's 1998 slide was taken
// from the water off Gull's creek mouth looking up the bay to the notch; the forest has changed since (the 2011 fire),
// so only the land's own skyline counts. Pure (no game imports): the caller gives the horizon (terrain only) and the
// view, so the Node unit check drives it.
//
//   factory(opts, api) → handle      registered as minigames.register('silhouette', silhouette)
//     opts.target    { x, z, face, d, deg, hold, tol }   the slide's eye (x, z), its bearing (rad, atan2(dx, dz)), how near
//                    (m) and how square (deg) you must be, how long it must hold (s), the skyline's error allowed (deg)
//     opts.profile   [elevation°] the slide's skyline, cols across its frame (from the target's eye and bearing)
//     opts.horizon(eye, bearing) → [elevation°]   the live skyline, the same cols across the same frame width
//     opts.view() → { x, z, bearing, raised }     where you stand and face, and whether the slide is up (the camera)
//     opts.every     seconds between live samples (default 0.25)
//   handle.update(dt) → null | { done: true, result: 'matched' }
//   handle.state → { near, square, err, score, held, raised }   (the overlay reads it: how far the ridges lie apart)
//   handle.cancel()
export const DEFAULTS = { d: 70, deg: 7, hold: 1.2, tol: 0.6, every: 0.25 };
const DEG = 180 / Math.PI;
const wrap = (a) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };

// the mean distance between two skylines (degrees); the live one shifted by up to `slip` columns to forgive a small turn
export function skylineError(a, b, slip = 2) {
  if (!a || !b || !a.length || a.length !== b.length) return Infinity;
  let best = Infinity;
  for (let s = -slip; s <= slip; s++) {
    let sum = 0, n = 0;
    for (let i = 0; i < a.length; i++) { const j = i + s; if (j < 0 || j >= b.length) continue; sum += Math.abs(a[i] - b[j]); n++; }
    if (n >= a.length * 0.7) best = Math.min(best, sum / n);
  }
  return best;
}

export function silhouette(opts = {}, api = {}) {
  const T = { ...DEFAULTS, ...(opts.target || {}) };
  const every = opts.every || DEFAULTS.every;
  const profile = opts.profile || null;
  let t = every, done = false;
  const state = { near: false, square: false, err: Infinity, score: 0, held: 0, raised: false, dist: Infinity, off: 180 };
  const h = {
    state,
    update(dt = 0) {
      if (done) return null;
      const v = typeof opts.view === 'function' ? opts.view() : null;
      state.raised = !!(v && v.raised);
      if (!v || !state.raised || !profile) { state.held = 0; return null; }
      state.dist = Math.hypot(v.x - T.x, v.z - T.z);
      state.off = Math.abs(wrap(v.bearing - T.face)) * DEG;
      state.near = state.dist <= T.d; state.square = state.off <= T.deg;
      t += dt;
      if (t >= every) {
        t = 0;
        let live = null; try { live = typeof opts.horizon === 'function' ? opts.horizon({ x: v.x, z: v.z }, v.bearing) : null; } catch { live = null; }
        state.err = skylineError(profile, live);
        state.score = Number.isFinite(state.err) ? Math.max(0, 1 - state.err / (T.tol * 4)) : 0;
      }
      const ok = state.near && state.square && state.err <= T.tol;
      state.held = ok ? state.held + dt : 0;
      if (state.held >= T.hold) {
        done = true;
        const r = { dist: +state.dist.toFixed(1), off: +state.off.toFixed(1), err: +state.err.toFixed(2) };
        if (api && typeof api.done === 'function') api.done('matched', r);
        return { done: true, result: 'matched', ...r };
      }
      return null;
    },
    cancel() { done = true; },
  };
  return h;
}
export default silhouette;
