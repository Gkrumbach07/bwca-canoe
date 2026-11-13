// The story's feed (docs/build/campaign-design.md §2, Appendix A): the ONLY place the story listens to other modules.
// Each stream adds an adapter in its own file (feed-trip.js, feed-outfitter.js, later feed-book.js, feed-talk.js,
// feed-place.js …) that registers itself here; the adapter turns that module's own events into the story's vocabulary
// and hands them to emit(). Every other story module reads the story, never the game.
//
//   feed.register(name, attach)   attach(api) → detach? · api = { emit(evt, data), on(target, kind, fn), mods, story }
//                                 (api.on listens through target.on(kind, fn) → off and is undone by stop())
//   feed.start({ story, mods, guest })  attaches every adapter registered (and any registered later); guest() → bool
//   feed.stop()                   detaches them all
//   feed.emit(evt, data)          the one way in: dropped while story.mode === 'mirror' (a co-op guest's engine is off,
//                                 §11), and HOST_ONLY events dropped on a guest; else handed to the story
//                                 (story.ingest(evt, data) when K1a's story.js has it, else story.emit)
//   feed.tap(fn) → off            fn(evt, data, how) for every event seen, how 'in' | 'mirror' | 'guest' (rigs, why())
//   feed.running · feed.names() · feed.stats() { in, dropped: { mirror, guest }, byEvt } · feed.recent (last 60)
//
// Nothing here runs unless main.js starts it, and main.js starts it only under STORY_ON (story-flag.js).
export const HOST_ONLY = new Set(['walkout', 'store:enter', 'sleep']); // §11: pushes wait for the host
const RECENT = 60;

class Feed {
  constructor() {
    this.adapters = new Map();   // name → attach
    this.live = new Map();       // name → [off…]
    this.ctx = null;
    this.taps = new Set();
    this.recent = [];
    this.counts = { in: 0, mirror: 0, guest: 0, byEvt: {} };
  }
  get running() { return !!this.ctx; }
  names() { return [...this.adapters.keys()]; }
  register(name, attach) {
    if (typeof attach !== 'function') throw new Error(`story-feed: adapter ${name} needs an attach function`);
    if (this.adapters.has(name)) this.detach(name);
    this.adapters.set(name, attach);
    if (this.ctx) this.attach(name);
    return this;
  }
  start({ story, mods = {}, guest = () => false } = {}) {
    if (this.ctx) this.stop();
    this.ctx = { story, mods, guest };
    for (const name of this.adapters.keys()) this.attach(name);
    return this;
  }
  stop() {
    for (const name of [...this.live.keys()]) this.detach(name);
    this.ctx = null;
  }
  attach(name) {
    const offs = [], ctx = this.ctx, attach = this.adapters.get(name);
    const api = {
      story: ctx.story, mods: ctx.mods,
      emit: (evt, data) => this.emit(evt, data),
      on: (target, kind, fn) => {
        if (!target || typeof target.on !== 'function') return () => {};
        const off = target.on(kind, (...a) => { try { fn(...a); } catch (e) { console.warn(`story-feed ${name}: ${kind}`, e); } });
        if (typeof off === 'function') offs.push(off);
        return off;
      },
    };
    this.live.set(name, offs);
    try { const d = attach(api); if (typeof d === 'function') offs.push(d); } catch (e) { console.warn(`story-feed: adapter ${name}`, e); }
  }
  detach(name) {
    for (const off of this.live.get(name) || []) { try { off(); } catch { /* gone already */ } }
    this.live.delete(name);
  }
  emit(evt, data = {}) {
    const ctx = this.ctx; if (!ctx) return false;
    const s = ctx.story;
    let how = 'in';
    if (s && s.mode === 'mirror') how = 'mirror';
    else if (HOST_ONLY.has(evt)) { let g = false; try { g = !!ctx.guest(); } catch { g = false; } if (g) how = 'guest'; }
    this.counts[how]++;
    this.counts.byEvt[evt] = (this.counts.byEvt[evt] || 0) + 1;
    this.recent.push({ evt, data, how }); if (this.recent.length > RECENT) this.recent.shift();
    for (const fn of this.taps) { try { fn(evt, data, how); } catch (e) { console.warn('story-feed tap', e); } }
    if (how !== 'in' || !s) return false;
    if (typeof s.ingest === 'function') s.ingest(evt, data);
    else if (typeof s.emit === 'function') s.emit(evt, data);
    return true;
  }
  tap(fn) { this.taps.add(fn); return () => this.taps.delete(fn); }
  stats() { return { in: this.counts.in, dropped: { mirror: this.counts.mirror, guest: this.counts.guest }, byEvt: { ...this.counts.byEvt } }; }
}

export const feed = new Feed();
export { Feed };
