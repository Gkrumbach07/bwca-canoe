// 7c · fogvoices: M2's set piece (docs/build/campaign-design.md §10.3; campaigns.md §2 "Singing in the fog"). On Lac La
// Croix at dawn in fog: voices and a canoe song from somewhere ahead, four big canoes you never catch. The brigade is a
// point moving east at its own pace (FOG.drift m/s, a voyageur's stroke), starting FOG.hear×0.7 off the player's bow-ish
// side; their voices are placed at it (feed-minis.js: positional audio and the hint lines). Keep within earshot for
// FOG.secs and it is `heard`; come within FOG.near and it is `close` too (the paddles knock), but closing to FOG.catchUp
// only makes it fall away: they are always a little further on. The fog lifting or falling out of earshot ends it.
//
//   fogvoices(opts, api) → handle   opts { x, z (player), seed, east: { x, z } (unit vector along the route) }
//   handle.update(dt, { x, z, fog (bool) }) → null | { done, result: 'heard' | 'close' | 'lost' }
//   handle.at → { x, z } the brigade now · handle.d (m to it) · handle.near (bool) · handle.heardFor (s)
// Pure (Node: scripts/cmp-7c-unit.mjs).
import { FOG } from '../minis.js';

export function fogvoices(opts = {}, api = {}) {
  const e = opts.east || { x: 1, z: 0 }, el = Math.hypot(e.x, e.z) || 1, ex = e.x / el, ez = e.z / el;
  const off = FOG.hear * 0.55;
  const h = {
    at: { x: (opts.x || 0) + ex * off - ez * off * 0.3, z: (opts.z || 0) + ez * off + ex * off * 0.3 },
    d: Infinity, near: false, heardFor: 0, t: 0, done: null, wasNear: false,
    update(dt, { x = 0, z = 0, fog = true } = {}) {
      if (this.done) return this.done;
      this.t += dt;
      // they pull ahead whenever you close: never caught
      this.d = Math.hypot(this.at.x - x, this.at.z - z);
      const pace = FOG.drift * (this.d < FOG.catchUp * 1.5 ? 3 : 1);
      this.at.x += ex * pace * dt; this.at.z += ez * pace * dt;
      if (this.d < FOG.hear) this.heardFor += dt;
      this.near = this.d < FOG.near;
      if (this.near) this.wasNear = true;
      if (!fog || this.d > FOG.hear * 1.6) return this.finish(this.heardFor >= FOG.secs ? (this.wasNear ? 'close' : 'heard') : 'lost');
      if (this.heardFor >= FOG.secs * 2) return this.finish(this.wasNear ? 'close' : 'heard');
      return null;
    },
    finish(result) { this.done = { done: true, result }; if (typeof api.done === 'function') api.done(result, { secs: +this.heardFor.toFixed(1) }); return this.done; },
    cancel() { this.done = this.done || { done: true, result: 'cancelled' }; },
  };
  return h;
}
