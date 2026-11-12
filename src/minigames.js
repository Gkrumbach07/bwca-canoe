// The minigames (docs/build/campaign-design.md §10.2; Round 2 stream E). A kind registers a factory; start() makes a
// handle the game's own system drives (the snag is driven by fishing.js's fight, on its existing tension bar). Results
// go out as the story's events `mg:<kind>` (data: { kind, result, ...the handle's own }) and as the facts the
// episodes' steps read, `mg.<kind>.<result>` (a bool row per kind in facts.js). Each kind teaches once through its own
// hints.js moment (the kind's `moment`, registered by the caller). Pure: no game imports (Node unit checks).
//
//   minigames.register(kind, factory) → off    factory(opts, api) → handle; Round 3 adds R's `tieoff`, Round 4 `loadedCarry`
//   minigames.start(kind, opts) → handle | null  handle: { kind, update(dt, input) → null | { done: true, result }, cancel() }
//   minigames.active → [handle] · kinds() · attach({ story, held }) (held() → bool: episodes.held, nothing starts)
//   minigames.result(handle, result, data)      a handle's result said (its own update calls it through api.done)
// A co-op guest (story.mode 'mirror') starts nothing.
export class Minigames {
  constructor() { this.factories = new Map(); this.live = new Set(); this.c = {}; this.n = 0; }
  attach(c = {}) { Object.assign(this.c, c); return this; }
  register(kind, factory) { this.factories.set(kind, factory); return () => this.factories.delete(kind); }
  kinds() { return [...this.factories.keys()]; }
  get active() { return [...this.live]; }
  can() {
    const s = this.c.story;
    if (s && s.mode === 'mirror') return false;
    try { if (typeof this.c.guest === 'function' && this.c.guest()) return false; } catch { /* */ }
    try { if (typeof this.c.held === 'function' && this.c.held()) return false; } catch { /* */ }
    return true;
  }
  start(kind, opts = {}) {
    const f = this.factories.get(kind);
    if (!f || !this.can()) return null;
    const id = `${kind}:${++this.n}`;
    let h = null;
    const api = { emit: (result, data) => this.say(kind, result, data), done: (result, data) => { this.say(kind, result, data); if (h) this.live.delete(h); } };
    h = f(opts, api);
    if (!h) return null;
    h.kind = kind; h.id = id;
    const cancel = typeof h.cancel === 'function' ? h.cancel.bind(h) : () => {};
    h.cancel = () => { this.live.delete(h); cancel(); };
    this.live.add(h);
    return h;
  }
  // a result: the story's event and fact (a rule reads `f:mg.<kind>.<result>`)
  say(kind, result, data = {}) {
    const s = this.c.story;
    if (!s || s.mode === 'mirror') return false;
    if (typeof s.ingest === 'function') s.ingest(`mg:${kind}`, { kind, result, ...data }); else if (typeof s.emit === 'function') s.emit(`mg:${kind}`, { kind, result, ...data });
    if (s.rules && typeof s.rules.apply === 'function') s.rules.apply({ id: `mg:${kind}:${result}`, then: [`f:mg.${kind}.${result}`] }, {});
    return true;
  }
}
export const minigames = new Minigames();
