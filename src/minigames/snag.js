// The snag (docs/story/60-side-stories.md S9 "The set piece: a slow, dead weight"; Round 2 stream E). A target lies on
// the bed (June's pot, its bail up out of the sand); a lure that runs on the bottom (the jig) dragged within `r` of it
// catches the bail on about `chance` of the passes (seeded per pass, so a rig replays it); a lure that runs high (a
// spinner, a crankbait, the bobber) goes over it. The hook-up reads at first like any bite: the rod loads and the
// tension bar comes up. Then the dead weight: no run, no head shake, no line taken; it gives a little at a time as the
// reel works and the sand lets go, then sticks, then gives. Reeling into a stick takes the bar into the red the same as a
// fish: the line parts (fishing.js's own snap: the lure lost) and the pot stays for the next cast. Easing off and reeling
// again is the whole skill; about a game minute from 12 m out (at ×8, some eight real seconds of reeling).
//
//   snagTarget({ id, x, z, r, chance, bed? }) → target    passes(target, lure, def, seed) → bool (a new pass's roll)
//   snag(opts, api) → handle (minigames.register('snag', snag))
//     opts { target, line (m out), snap (the rod's snap: TUNING.snapDanger × gear), seed }
//     handle.update(dt, { reeling }) → null | { done, result: 'landed' | 'snapped' }
//     handle.tension · danger · slack · line · phase ('give' | 'stick') · x, z (where the weight is, along the line)
// Pure (fishing.js drives it; scripts/c2-episodes-unit.mjs runs it in Node).
export const SNAG = {
  r: 1.0,           // m: a bottom lure this near the bail catches it
  chance: 0.5,      // of the passes
  bottom: 0.7,      // m: the lure within this of the bed counts as running on the bottom
  give: [1.1, 2.4], // s a give lasts: the sand letting go
  stick: [0.7, 1.6],// s a stick lasts
  reel: 1.6,        // m/s of line in while it gives and you reel
  slip: 0.06,       // m/s of line back out while it sticks and you hold on (never a run)
  pullGive: 0.5,    // the bar's target reeling through a give
  pullStick: 1.12,  // the bar's target reeling into a stick (the red is 0.8: past it the danger grows, as a fish's)
  rest: 0.14,       // the bar's target easing off (a dead weight never throws the hook: no slack limit)
  follow: 2.6,      // the bar's response (fishing.js's own 2.8 for a fish)
  danger: 7,        // the red's growth, as a fish's (fishing.js: (tension - 0.8) × dt × 7)
  cool: 0.45,       // the danger's fall below the red
  landAt: 1.7,      // m of line left: it comes up by its bail
};
const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
const rngOf = (seed) => { let a = hash(String(seed)) || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

export function snagTarget({ id, x, z, r = SNAG.r, chance = SNAG.chance } = {}) { return { id, x, z, r, chance }; }
// a lure in the water over the target now: in reach, running on the bottom (its lure def's run: 'bottom', near the bed)
export function overTarget(T, lure, def) {
  if (!T || !lure || !def || def.run !== 'bottom' || lure.onLand) return false;
  if (Math.hypot(lure.x - T.x, lure.z - T.z) > T.r) return false;
  return !Number.isFinite(lure.bed) || !Number.isFinite(lure.depth) || lure.depth >= lure.bed - SNAG.bottom;
}
// a new pass over it (the lure came into reach): does it catch the bail? seeded (the target, the cast, the pass)
export function passes(T, seed) { return rngOf(`${T.id}:${seed}`)() < T.chance; }

export function snag(opts = {}, api = {}) {
  const T = opts.target || {}, rng = rngOf(`${T.id || 'snag'}:${opts.seed ?? 0}`);
  const span = (a) => a[0] + (a[1] - a[0]) * rng();
  const h = {
    target: T, tension: 0.35, danger: 0, slack: 0, line: Math.max(SNAG.landAt + 0.5, opts.line || 12), phase: 'give', left: span(SNAG.give), t: 0, run: 0,
    snapAt: Number.isFinite(opts.snap) ? opts.snap : 1, done: null,
    update(dt, { reeling = false } = {}) {
      if (this.done) return this.done;
      this.t += dt;
      // give and stick, by turns (the sand lets go, then holds)
      if ((this.left -= dt) <= 0) { this.phase = this.phase === 'give' ? 'stick' : 'give'; this.left = span(this.phase === 'give' ? SNAG.give : SNAG.stick); }
      const target = !reeling ? SNAG.rest : this.phase === 'stick' ? SNAG.pullStick : SNAG.pullGive;
      this.tension += (target - this.tension) * (1 - Math.exp(-dt * SNAG.follow));
      if (this.tension > 0.8) this.danger += (this.tension - 0.8) * dt * SNAG.danger; else this.danger = Math.max(0, this.danger - dt * SNAG.cool);
      this.slack = 0; // (a dead weight never throws the hook)
      if (this.danger > this.snapAt) return this.finish('snapped');
      if (reeling && this.phase === 'give') this.line = Math.max(SNAG.landAt - 0.01, this.line - SNAG.reel * dt * (1 - 0.4 * Math.min(1, this.tension)));
      else if (reeling && this.phase === 'stick') this.line += SNAG.slip * dt * 0.3;
      if (this.line <= SNAG.landAt) return this.finish('landed');
      return null;
    },
    finish(result) { this.done = { done: true, result }; if (typeof api.done === 'function') api.done(result, { target: T.id, secs: +this.t.toFixed(2) }); return this.done; },
    cancel() { this.done = this.done || { done: true, result: 'cancelled' }; },
  };
  if (typeof api.emit === 'function') api.emit('hooked', { target: T.id });
  return h;
}
