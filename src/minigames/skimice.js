// 7c · skimice: M5's skim ice broken with the paddle handle (docs/build/campaign-design.md §10.3 "skim ice broken with
// the paddle (season.js ice)"). Late in the year the bays skin over before the lakes close: a lead of SKIM.cells breaks to
// get through, each SKIM.hits strokes of the handle (the paddle stroke while the bow is in the ice: the caller passes
// `stroke` on each stroke). Sitting still lets it set again, slowly (a break heals after `heal` s). Through is `through`;
// paddling back out is `back` (nothing lost: the ice is the place's danger, never a fail screen).
//
//   skimice(opts, api) → handle   opts { cells, hits, heal (s) }
//   handle.update(dt, { stroke (bool, this frame), out (bool: turned back out of the ice) }) → null | { done, result }
//   handle.broken (cells broken) · handle.cells · handle.cracks (strokes into the current cell)
// Pure (Node: scripts/cmp-7c-unit.mjs).
import { SKIM } from '../minis.js';

export function skimice(opts = {}, api = {}) {
  const cells = opts.cells || SKIM.cells, hits = opts.hits || SKIM.hits, heal = opts.heal || 20;
  const h = {
    cells, broken: 0, cracks: 0, idle: 0, done: null, t: 0,
    update(dt, { stroke = false, out = false } = {}) {
      if (this.done) return this.done;
      this.t += dt;
      if (out) return this.finish('back');
      if (stroke) { this.idle = 0; if (++this.cracks >= hits) { this.cracks = 0; this.broken++; if (typeof api.emit === 'function') api.emit('crack', { broken: this.broken }); } }
      else if ((this.idle += dt) > heal && this.cracks > 0) { this.cracks = 0; this.idle = 0; }
      if (this.broken >= this.cells) return this.finish('through');
      return null;
    },
    finish(result) { this.done = { done: true, result }; if (typeof api.done === 'function') api.done(result, { secs: +this.t.toFixed(1), broken: this.broken }); return this.done; },
    cancel() { this.done = this.done || { done: true, result: 'cancelled' }; },
  };
  return h;
}
