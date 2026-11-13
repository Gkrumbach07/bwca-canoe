// Tie off (docs/story/50-finale.md §6.2 "Rest only tied off", §6.15; 60 S2; campaign-design §8.3; Round 3 stream R).
// In the canoe, afloat within 3 m of something to tie to (a snag or a deadhead, a reed bed, an overhanging cedar: at
// the water's edge, by the shore's own line), the dot offers Tie off. Tied off, the Rest dial and sleep work as in a
// tent at a lower ceiling (cold, cramped), and on the run the dial stops at each change of light (dusk, full dark,
// first light) and whenever a watcher's light comes within sight (the caller's stopAt).
//
//   tieoffSpot({ world, tiles }, x, z) → { x, z, kind: 'snag' | 'reeds' | 'cedar' } | null
//   tieoff(opts, api) → handle (minigames.register('tieoff', tieoff))
//     opts { snag: { x, z }, why: 'run' | 'S2', ctx: { player, day, energy, veil, hud, stopAt(fromH, toH) → hour | null,
//            rest: [{ label, small, at }] } }
//     handle.update(dt) → null | { done: true, result: 'untied' } (paddling off unties it)
//     handle.rest(at) → Promise: a sleep tied off until `at` (or the stop before it); energy.sleep at TIEOFF.q
//     handle.untie()
// Pure but for the ctx it is handed (no game imports).
export const TIEOFF = {
  reach: 3,         // m from the thing tied to
  edge: 4.5,        // m: within this of the shore's line counts (the snags, the reeds and the cedars are at the edge)
  q: 0.62,          // a night's rest tied off, against a tent's 1 (cold, cramped)
  drift: 2.5,       // m the canoe may swing on the line before paddling unties it
};

export function tieoffSpot({ world, tiles } = {}, x, z) {
  if (!world || typeof world.shoreAt !== 'function') return null;
  const s = world.shoreAt(x, z); // < 0 on the water: metres out from the shore's line
  if (!(s < 0) || s < -TIEOFF.edge) return null;
  let kind = 'reeds';
  try {
    const t = tiles && typeof tiles.treesNear === 'function' ? tiles.treesNear(x, z, 7) : null;
    if (t && t.length) kind = t.some((q) => q && /cedar|thuja/i.test(String(q.species || q.kind || ''))) ? 'cedar' : 'snag';
  } catch { /* the tiles' */ }
  return { x, z, kind };
}

export function tieoff(opts = {}, api = {}) {
  const c = opts.ctx || {}, p = c.player, at = opts.snag || (p ? { x: p.x, z: p.z } : { x: 0, z: 0 });
  const h = {
    why: opts.why || 'run', at: { x: at.x, z: at.z }, tied: true, resting: false,
    update() {
      if (!this.tied || !p) return null;
      if (p.mode !== 'paddle' || Math.hypot(p.x - this.at.x, p.z - this.at.z) > TIEOFF.reach + TIEOFF.drift) return this.untie();
      if (Math.abs(p.speed || 0) > 0.3 && !this.resting) p.speed *= 0.5; // the line holds her
      return null;
    },
    untie() { if (!this.tied) return null; this.tied = false; try { api.done && api.done('untied', { why: this.why }); } catch { /* */ } return { done: true, result: 'untied' }; },
    // a sleep tied off: to `to` (an hour), stopped at the first stop the caller names
    rest(to) {
      const d = c.day, e = c.energy;
      if (!d || this.resting) return Promise.resolve(null);
      const from = d.hours, span = ((to - from) % 24 + 24) % 24 || 24;
      let stop = c.stopAt ? c.stopAt(from, from + span) : null;
      if (!Number.isFinite(stop) || stop <= from + 0.05) stop = from + span;
      const hours = Math.max(0.25, stop - from);
      this.resting = true;
      const onDark = () => {
        d.advance(hours);
        if (e && typeof e.sleep === 'function') { try { e.sleep(TIEOFF.q, hours); } catch (er) { console.warn('tieoff: sleep', er); } }
        if (p) p.speed = 0;
      };
      const card = { kicker: 'Tied off', text: c.line || '', sub: `${hours >= 1 ? `${Math.round(hours * 2) / 2} h` : `${Math.round(hours * 60)} min`} in the canoe`, fadeIn: 1.0, hold: 1.4, fadeOut: 1.6, onDark };
      const done = () => { this.resting = false; try { api.emit && api.emit('rested', { hours, stopped: stop < from + span - 0.01 }); } catch { /* */ } return { hours, stopped: stop < from + span - 0.01 }; };
      if (c.veil && typeof c.veil.card === 'function') return c.veil.card(card).then(done, done);
      onDark(); return Promise.resolve(done());
    },
    cancel() { this.tied = false; },
  };
  try { api.emit && api.emit('tied', { why: h.why, kind: opts.kind || null }); } catch { /* */ }
  return h;
}
