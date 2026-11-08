// The story's rule engine (docs/build/campaign-design.md §3.5). Rules are hand data (story-data/rules-*.js); the
// engine indexes them by the atoms their conditions read, so a fact written re-checks only the rules that read it (a
// derived value, any fact), and the clock tick re-checks only the rules that read a sensor, plus the due timers.
//
//   new Rules(story) · add(rules) · fire(evt, args) (an event in) · changed(keys) (index keys written: 'f:<fact>',
//   'p:<who>', 'nb', 'lead:<id>') · tick() (the clock)
//   rerun({ quiet }) (every `when:` rule once: after a migration or a data change) · producers(fact) → [rule]
//
// A rule fires once a season (doc.fired) unless `repeat: true`. `after` saves a timer instead of acting now. `push`
// stages something and must pass story.push(rule) (beats.js, §12; until it exists everything passes). In quiet mode
// only the state actions run (f: ppl: walt: und: lead:); scenes, lines, rings, gifts and pay wait for a real moment.
// In mirror mode (a co-op guest, Part 3 call 7) nothing runs at all.
import { compile, parseValue } from './story-cond.js';

const STATE_ACTIONS = new Set(['f', 'ppl', 'walt', 'und', 'lead']);
const MAX_PASSES = 64;

// `{told.denny.lake}` from the event's data, then the story's own lookups
function fill(s, args, story) {
  return String(s).replace(/\{([\w.]+)\}/g, (_, path) => {
    let v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), args);
    if (v === undefined && story && typeof story.lookup === 'function') v = story.lookup(path);
    return v === undefined ? '' : String(v);
  });
}
// → { kind, arg }
export function parseAction(a) {
  const i = String(a).indexOf(':');
  return i < 0 ? { kind: String(a), arg: '' } : { kind: a.slice(0, i), arg: a.slice(i + 1) };
}

export class Rules {
  constructor(story) {
    this.story = story;
    this.rules = new Map();
    this.byKey = new Map();     // index key → Set(rule)
    this.byPrefix = [];         // [prefix, rule] for any()/count() atoms
    this.byEvent = new Map();   // evt → Set(rule)
    this.derived = new Set();   // rules reading a derived value (re-checked on any fact)
    this.sensors = new Set();   // rules reading a sensor (re-checked on the tick)
    this.running = false; this.queue = [];
    this.errors = [];
  }
  add(list) {
    for (const r0 of list || []) {
      if (!r0 || !r0.id) continue;
      if (this.rules.has(r0.id)) { this.errors.push(`duplicate rule ${r0.id}`); continue; }
      const r = { ...r0, then: Array.isArray(r0.then) ? r0.then : r0.then ? [r0.then] : [] };
      r.c = compile(r.when || '');
      if (!r.c.ok) this.errors.push(`${r.id}: ${r.c.errors.join('; ')}`);
      this.rules.set(r.id, r);
      if (r.on) { if (!this.byEvent.has(r.on)) this.byEvent.set(r.on, new Set()); this.byEvent.get(r.on).add(r); continue; }
      // a when: rule: indexed by what it reads
      for (const k of r.c.keys) {
        if (k === 'd') this.derived.add(r);
        else if (k === 's') this.sensors.add(r);
        else if (k.startsWith('f:') && k.endsWith('*')) this.byPrefix.push([k.slice(2, -1), r]);
        else { if (!this.byKey.has(k)) this.byKey.set(k, new Set()); this.byKey.get(k).add(r); }
      }
      if (!r.c.keys.length) this.derived.add(r); // (no condition: true at once, checked with the first change)
    }
    return this;
  }
  get doc() { return this.story.doc; }
  active() { return this.story.mode !== 'mirror' && !!this.doc; }
  fired(r) { return !!(this.doc.fired && this.doc.fired[r.id]); }

  // --- in ------------------------------------------------------------------------------------------------------------
  fire(evt, args = {}) {
    if (!this.active()) return [];
    const out = [];
    for (const r of this.byEvent.get(evt) || []) {
      if (!r.repeat && this.fired(r)) continue;
      if (r.c.test(this.story.env, args)) { if (this.run(r, args)) out.push(r.id); }
    }
    this.drain();
    return out;
  }
  changed(keys) {
    if (!this.active()) return;
    for (const k of keys) this.queue.push(k);
    this.drain();
  }
  tick() {
    if (!this.active()) return [];
    const out = [];
    for (const r of this.sensors) if (!this.fired(r) && r.c.test(this.story.env)) { if (this.run(r)) out.push(r.id); }
    // timers due
    const now = this.story.nowAbs(), due = (this.doc.timers || []).filter((t) => t.at <= now);
    if (due.length) {
      this.doc.timers = this.doc.timers.filter((t) => t.at > now);
      for (const t of due) { const r = this.rules.get(t.rule); if (r) { this.apply(r, t.args || {}); out.push(r.id); } }
      this.story.dirty();
    }
    this.drain();
    return out;
  }
  // every when: rule once (after a migration or a data change); quiet: only state actions
  rerun({ quiet = true } = {}) {
    if (!this.active()) return [];
    const was = this.quiet, out = [];
    this.quiet = quiet;
    try {
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        let any = false;
        for (const r of this.rules.values()) {
          if (r.on || this.fired(r)) continue;
          if (r.c.test(this.story.env)) { if (this.run(r)) { out.push(r.id); any = true; } }
        }
        if (!any) break;
      }
      this.queue.length = 0;
    } finally { this.quiet = was; }
    return out;
  }

  // the rules a changed fact might wake, until nothing more changes
  drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (let pass = 0; this.queue.length && pass < MAX_PASSES * 16; pass++) {
        const k = this.queue.shift(), isFact = k.startsWith('f:'), cand = new Set(isFact ? this.derived : []);
        for (const r of this.byKey.get(k) || []) cand.add(r);
        if (isFact) for (const [pre, r] of this.byPrefix) if (k.startsWith(pre, 2)) cand.add(r);
        for (const r of cand) if (!this.fired(r) && r.c.test(this.story.env)) this.run(r);
      }
    } finally { this.running = false; }
  }

  // --- a rule fires --------------------------------------------------------------------------------------------------
  run(r, args = {}) {
    if (r.push && !this.quiet && !this.story.push(r, args)) return false; // (the director said not today)
    if (!this.doc.fired) this.doc.fired = {};
    if (!r.repeat) this.doc.fired[r.id] = this.story.tickN();
    if (r.after && !this.quiet) {
      const at = this.story.nowAbs() + this.delay(r);
      (this.doc.timers || (this.doc.timers = [])).push({ rule: r.id, at, args: plain(args) });
      this.story.log('timer', { rule: r.id, at });
      this.story.dirty();
      return true;
    }
    this.apply(r, args);
    return true;
  }
  // a timer's wait in days (fractional), seeded so the same season waits the same
  delay(r) {
    const a = r.after;
    if (Number.isFinite(a.hours)) return a.hours / 24;
    const [lo, hi] = Array.isArray(a.days) ? a.days : [a.days || 0, a.days || 0];
    const h = this.story.hash(`${r.id}:${this.story.doc.season || ''}`) / 4294967296;
    return lo + (hi - lo) * h;
  }
  apply(r, args = {}) {
    const st = this.story;
    st.log('rule', { rule: r.id, quiet: !!this.quiet });
    for (const a0 of r.then) {
      const { kind, arg } = parseAction(fill(a0, args, st));
      if (this.quiet && !STATE_ACTIONS.has(kind)) continue;
      try {
        switch (kind) {
          case 'f': { const i = arg.indexOf('='); i < 0 ? st.set(arg, true, `rule:${r.id}`) : st.set(arg.slice(0, i), parseValue(arg.slice(i + 1)), `rule:${r.id}`); break; }
          case 'ppl': { const m = /^(\w+)\.(\w+)([+-]|=)(.+)$/.exec(arg); if (m) st.person(m[1], m[2], m[3], parseValue(m[4]), `rule:${r.id}`); else st.log('warn', { rule: r.id, bad: a0 }); break; }
          case 'walt': st.waltLine(arg, `rule:${r.id}`); break;
          case 'und': st.understand(arg, `rule:${r.id}`); break;
          case 'lead': { const i = arg.indexOf('='); st.leadState(i < 0 ? arg : arg.slice(0, i), i < 0 ? 'open' : arg.slice(i + 1), `rule:${r.id}`); break; }
          default: st.action(kind, arg, { rule: r.id, args });
        }
      } catch (e) { st.log('warn', { rule: r.id, action: a0, error: String(e.message || e) }); }
    }
  }

  // --- for the lint, the solver and why() ----------------------------------------------------------------------------
  producers(fact) {
    return [...this.rules.values()].filter((r) => r.then.some((a) => { const { kind, arg } = parseAction(a); return kind === 'f' && (arg === fact || arg.startsWith(`${fact}=`)); }));
  }
}
const plain = (o) => { try { return JSON.parse(JSON.stringify(o || {})); } catch { return {}; } };
