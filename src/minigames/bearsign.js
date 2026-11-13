// 7c · bearsign: M1's night watch (docs/build/campaign-design.md §10.3: "`bearsign` + night watch"). You wait at a chain
// site after dark where its signs are; the bear comes at its hour (minis.js bearHours) if you keep still and dark: the
// headlamp off, not moving, not talking. It comes in from the brush (heard first), works at the site for a while, then
// goes back the way it came. Stillness through its visit is `seen`; a picture while it is in (feed-minis.js asks
// photo()) is `photo`; a light on it or a walk at it sends it off early: `spooked` (it comes again another night: no
// fail). Leaving the site before it comes is `left`. Teaches once (hints.js moment 'm1.watch', the caller's).
//
//   bearsign(opts, api) → handle      opts { site: { x, z }, hour0 (abs game hours it comes), stay (game h), r (m), seed }
//   handle.update(dt, { abs (game hours now), x, z, lamp (bool), moving (bool) }) → null | { done, result }
//   handle.phase: 'wait' | 'in' | 'gone' · handle.bear: { x, z } while in · handle.shot() (a picture now: true if in)
// Pure (Node: scripts/cmp-7c-unit.mjs).
export const BEARSIGN = { r: 45, spook: 14, stay: 0.6, approach: 40, still: 0.6 };

export function bearsign(opts = {}, api = {}) {
  const S = opts.site || { x: 0, z: 0 }, r = opts.r || BEARSIGN.r, stay = opts.stay || BEARSIGN.stay;
  const h = {
    site: S, phase: 'wait', hour0: opts.hour0, bear: null, t: 0, inFor: 0, photo: false, done: null, moved: 0,
    update(dt, { abs = 0, x = S.x, z = S.z, lamp = false, moving = false } = {}) {
      if (this.done) return this.done;
      this.t += dt;
      const d = Math.hypot(x - S.x, z - S.z);
      if (this.phase === 'wait') {
        if (d > r * 2) return this.finish('left');
        if (abs >= this.hour0) { this.phase = 'in'; this.bear = { x: S.x + BEARSIGN.approach * 0.3, z: S.z - BEARSIGN.approach * 0.2 }; this.inAt = abs; if (typeof api.emit === 'function') api.emit('come', { at: abs }); }
        return null;
      }
      if (this.phase === 'in') {
        this.moved = moving ? this.moved + dt : Math.max(0, this.moved - dt);
        const bd = Math.hypot(x - this.bear.x, z - this.bear.z);
        if (lamp && bd < BEARSIGN.spook * 2 || bd < BEARSIGN.spook || this.moved > BEARSIGN.still * 3) return this.finish('spooked');
        if (abs - this.inAt >= stay) return this.finish(this.photo ? 'photo' : 'seen');
      }
      return null;
    },
    shot() { if (this.phase !== 'in' || this.done) return false; this.photo = true; return true; },
    finish(result) { this.phase = 'gone'; this.done = { done: true, result }; if (typeof api.done === 'function') api.done(result, { secs: +this.t.toFixed(1) }); return this.done; },
    cancel() { this.done = this.done || { done: true, result: 'cancelled' }; },
  };
  return h;
}
