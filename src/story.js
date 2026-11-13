// The story's state, v2 (docs/build/campaign-design.md §3, Part 4 Round 0 stream K1a). Facts (grow-only), people
// state (up and down), the notebook's marks, the Walt page, the bus, `when(expr)`, derived values (stage, tier, the big
// findings, locks, porch, doors) and the saved document under `bwca-canoe:story2`. Runs only behind STORY_ON
// (story-flag.js): story-hooks.js hands out this object when the flag is on, else the v1 Story exactly as before.
//
// No game imports: the store comes in as `io` ({ read(ns), write(ns, v) }, save.js in the game, a Map in Node), the
// world through attach({ profile, day, trip }). So scripts/story-unit.mjs runs it in Node.
//
//   story.set(key, v?, src?) · has(key) · get(key) · fact(key) → record · facts() · keys(prefix) · when(expr, args?)
//   story.person(who, field, op, v) · waltLine(id) · understand(nb) · markRead(nb) · readHere(nb) · leadState(id, s)
//   story.stage ('S0'…'S7') · stageN · tier · big · bigCount · north · lock(n) → { keys, solved } · ending · porch · door(id)
//   story.on(evt, fn) · emit(evt, data) ('*' for all; every emit is also an event in for the rules)
//   story.clock({ abs, hours }) the tick (main.js calls update() each frame; a rule pass each game quarter-hour)
//   story.handle(kind, fn) a stream takes an action kind (scene:, ring:, line:, give:, pay:, queue:, emit:)
//   story.sensor(name, fn) a stream reads a live-world atom (at:, lake:, wind, …)
//   story.setMode('mirror') a co-op guest (Part 3 call 7): rules, timers, the night-one find and every write off; the
//     guest's own document is left as it lies; only applyMirror() writes (world facts from the host, Round 3)
//   story.why(key) · can(key) · log rows · debug
//   v1 surface kept: state (.notebook, .read, .legacy), pages(), setPages(), read(i), flag(), found(), newSeason(), legacy
//
// Saved per season slot as `bwca-canoe:story2` (§3.7); the v1 document (`bwca-canoe:story`) is read once for the
// migration. Its v1-shaped echo (notebook, pages read, flags) is kept written so a rollback to a v1 build finds its
// own document, true to the season, and the gl rigs' raw-key checks hold. `bwca-canoe:story-meta` is the player's
// (save.js GLOBAL_KEYS): { nightOneSeen, endings }.
import { compile, setFactCheck } from './story-cond.js';
import { Rules } from './story-rules.js';
import { FACTS, factRow, checkValue, ARCS, DOORS } from './story-data/facts.js';
import { LOCKS, lockById, lockRules } from './story-data/locks.js';
import { RULES_ALL } from './story-data/all-rules.js'; // every stream's rules, in the data from the start (all-rules.js: a rule added later changes the data hash and rewrites a guest's own save before it is a mirror)
import { RETIRED } from './story-data/retired.js';

// every condition's fact reads checked against facts.js: an undeclared one (a bare 'wibble') is a loud warning
setFactCheck((k) => !!factRow(k));
const warnedWhen = new Set();

export const NS2 = 'story2', NS1 = 'story', META = 'story-meta';
const LOG_MAX = 300;
const absDayOf = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000); // (trip.js absDay)
const STAGES = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// the placeholder pages, until the campaign writes its own (the same words as v1's)
export const PLACEHOLDER_PAGES = [
  { title: 'The first pages', text: 'Lists, mostly. Lakes and portages in a small hand, the rods counted, a night’s weather in a word or two. Years of trips, one after another.' },
  { title: 'Further on', text: 'The lists get shorter and the trips longer. Most of them alone. A few pages are torn out near the end.' },
  { title: 'The last page', text: 'The writing changes here: hurried, the pencil pressed hard, a line started and left. You can’t make it out by headlamp.' },
];

export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function blankDoc(season = null) {
  return {
    v: 2, season, legacy: false, rev: 0, tick: 0, data: null,
    facts: {}, src: [], ppl: {},
    nb: { at: null, read: {}, here: {}, und: {}, bc: [], photos: {}, pages: [] },
    walt: [], pencil: { rings: [], names: [], bearings: [], walked: [], ticks: [] },
    leads: {}, eps: {}, dir: {}, timers: [], fired: {}, meeting: null, queue: [], end: null, amb: { once: [] },
    flags: {}, log: [],
  };
}
// a loaded document, made whole (fields a later version adds are filled in)
function wholeDoc(d) {
  const b = blankDoc(d.season ?? null);
  const out = { ...b, ...d, nb: { ...b.nb, ...(d.nb || {}) }, pencil: { ...b.pencil, ...(d.pencil || {}) }, amb: { ...b.amb, ...(d.amb || {}) } };
  for (const k of ['facts', 'ppl', 'leads', 'eps', 'dir', 'fired', 'flags']) if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {};
  for (const k of ['src', 'walt', 'timers', 'queue', 'log']) if (!Array.isArray(out[k])) out[k] = [];
  if (!Array.isArray(out.nb.pages)) out.nb.pages = [];
  return out;
}

const pageList = (a) => (Array.isArray(a) ? [...new Set(a.filter((i) => Number.isInteger(i) && i >= 0))] : []);
const memIO = () => { const m = new Map(); return { read: (ns, f = null) => (m.has(ns) ? JSON.parse(m.get(ns)) : f), write: (ns, v) => { m.set(ns, JSON.stringify(v)); return true; }, map: m }; };

export class StoryV2 {
  constructor({ io = null, rules = null } = {}) {
    this.v = 2;
    this.io = io || memIO();
    this.mode = 'live';
    this.handlers = new Map();
    this.pagesFn = null;
    this.actions = new Map();
    this.sensors = new Map();
    this.ctx = {};
    this.now = null;          // { abs, hours } set by clock(), else read from ctx.day
    this.lastQ = null;
    this.pending = false;
    this.beats = null;        // beats.js (§12), when it exists
    this.rules = new Rules(this).add(rules || RULES_ALL).add(lockRules());
    this.env = {
      fact: (k) => this.get(k),
      keys: (p) => this.keys(p),
      derived: (n, a) => this.derivedValue(n, a),
      ppl: (w) => (this.doc && this.doc.ppl[w]) || null,
      nb: (kind, id) => this.nbHas(kind, id),
      lead: (id) => (this.doc && this.doc.leads[id] ? this.doc.leads[id].s : null),
      since: (unit, k) => this.since(unit, k),
      sensor: (n, a, args, node) => this.readSensor(n, a, args, node),
    };
    this.data = this.dataHash();
    const d = this.io.read(NS2);
    this.setDoc(d && d.v === 2 ? wholeDoc(d) : null);
    this.debug = this.makeDebug();
  }

  // the story data's hash: facts, locks and every rule (a change re-runs the rules quietly on load, §3.7)
  dataHash() {
    const rules = [...this.rules.rules.values()].map((r) => [r.id, r.on || '', r.when || '', r.then, r.after || null]);
    return 'sd-' + hash32(JSON.stringify([FACTS, LOCKS, rules])).toString(16).padStart(8, '0');
  }
  addRules(list) {
    this.rules.add(list);
    this.data = this.dataHash();
    if (this.doc && this.attached && this.mode !== 'mirror') { this.rules.rerun({ quiet: true }); this.doc.data = this.data; this.dirty(); }
    return this;
  }

  // the document, with the v1 getters on it (not enumerable: never saved)
  setDoc(d) {
    this.doc = d;
    if (!d) return;
    const self = this;
    Object.defineProperties(d, {
      notebook: { configurable: true, enumerable: false, get() { const at = d.nb.at || {}; return { found: self.has('nb.found'), abs: at.abs ?? null, key: at.key ?? null, lake: at.lake ?? null }; } },
      read: { configurable: true, enumerable: false, get() { return d.nb.pages; } },
    });
  }
  get state() { return this.doc; }
  get legacy() { return !!(this.doc && this.doc.legacy); }

  // --- attach: the season, the migration, the data check --------------------------------------------------------------
  attach({ profile = null, day = null, trip = null } = {}) {
    this.profile = profile;
    Object.assign(this.ctx, { profile, day, trip });
    const id = profile ? profile.seasonId : null, started = !!(profile && profile.started);
    if (!this.doc) {
      const v1 = this.io.read(NS1);
      if (v1 && v1.v === 1 && !(started && v1.season && id && v1.season !== id)) this.setDoc(this.migrate(v1, id));
      else { this.setDoc(blankDoc(id)); if (started) this.doc.legacy = true; }
    } else if (started && this.doc.season && id && this.doc.season !== id) {
      // another season's document: a slot's keys out of step, or a season begun on a v1 build (the flag off) since
      const v1 = this.io.read(NS1);
      this.setDoc(v1 && v1.v === 1 && v1.season === id ? this.migrate(v1, id) : blankDoc(id));
    } else {
      this.mergeV1(); // (a v1 build ran this season since: the flag turned off and on again)
    }
    if (this.doc.season == null && id) this.doc.season = id;
    this.attached = true;
    this.checkData();
    this.flush();
    if (profile && typeof profile.onChange === 'function') profile.onChange((what) => { if (what === 'season') this.newSeason(profile.seasonId); });
    return this;
  }
  // v1 → v2 (§3.7): the notebook found becomes nb.found; v1's read[] (page indices) is kept as nb.pages, so the echo
  // gives it back to a v1 build and walt.js's Read moment sees it; flags go under legacy.*; the rules then re-run quietly
  // (data: null), so a v1 finder gets night one's Walt lines
  migrate(v1, id = null) {
    const d = blankDoc(v1.season ?? id);
    this.setDoc(d);
    d.legacy = !!v1.legacy;
    d.nb.pages = pageList(v1.read);
    d.flags = { ...(v1.flags || {}) };
    for (const [k, v] of Object.entries(v1.flags || {})) if (v !== undefined && v !== null) this.put(`legacy.${k}`, v, 'migrate:v1', { abs: null });
    const nb = v1.notebook || {};
    if (nb.found) {
      d.nb.at = { abs: nb.abs ?? null, key: nb.key ?? null, lake: nb.lake ?? null };
      this.put('nb.found', true, 'migrate:v1', { abs: nb.abs ?? null });
    }
    d.data = null;
    this.log('migrate', { from: 1, found: !!nb.found, flags: Object.keys(v1.flags || {}).length });
    return d;
  }
  // the v1 document moved on since this document's last echo (a v1 build, the flag off, played this season): what it
  // added is merged in before the echo overwrites it. Found, pages read and flags only ever grow or change on v1, so a
  // difference from the echo is the v1 build's own progress. → true when anything was merged
  mergeV1() {
    const d = this.doc;
    if (!d || this.mode === 'mirror') return false;
    const v1 = this.io.read(NS1);
    if (!v1 || v1.v !== 1 || (v1.season != null && d.season != null && v1.season !== d.season)) return false;
    let n = 0;
    const nb = v1.notebook || {};
    if (nb.found && !this.has('nb.found')) {
      d.nb.at = { abs: nb.abs ?? null, key: nb.key ?? null, lake: nb.lake ?? null };
      this.put('nb.found', true, 'merge:v1', { abs: nb.abs ?? null });
      n++;
    }
    for (const p of pageList(v1.read)) if (!d.nb.pages.includes(p)) { d.nb.pages.push(p); n++; }
    for (const [k, v] of Object.entries(v1.flags || {})) {
      if (v === undefined || JSON.stringify(d.flags[k]) === JSON.stringify(v)) continue;
      d.flags[k] = v;
      if (v !== null) this.put(`legacy.${k}`, v, 'merge:v1', { abs: null });
      n++;
    }
    if (!n) return false;
    d.data = null; // (the rules re-run quietly in checkData, as after the migration)
    this.log('merge', { from: 1, n });
    return true;
  }
  // a save made with other story data: retired ids mapped or dropped, then every when: rule once, quietly
  checkData() {
    const d = this.doc;
    if (d.data === this.data) return false;
    for (const [from, to] of Object.entries(RETIRED.facts || {})) {
      if (!(from in d.facts)) continue;
      if (to && !(to in d.facts)) d.facts[to] = d.facts[from];
      delete d.facts[from];
    }
    for (const [from, to] of Object.entries(RETIRED.rules || {})) if (from in d.fired) { if (to) d.fired[to] = d.fired[from]; delete d.fired[from]; }
    for (const [from, to] of Object.entries(RETIRED.walt || {})) d.walt = d.walt.flatMap((w) => (w[0] === from ? (to ? [[to, w[1]]] : []) : [w]));
    const was = d.data;
    if (this.mode !== 'mirror') this.rules.rerun({ quiet: true });
    d.data = this.data;
    this.log('data', { from: was, to: this.data });
    this.dirty();
    return true;
  }
  newSeason(id = null) {
    if (this.mode === 'mirror') return; // (a guest's season change is in memory only: their own story never moves)
    this.setDoc(blankDoc(id));
    this.doc.data = this.data;
    this.flush();
    this.emit('season', { id });
  }

  // --- the store -------------------------------------------------------------------------------------------------------
  dirty() {
    if (this.pending || this.mode === 'mirror') return;
    this.pending = true;
    const go = () => { this.pending = false; this.flush(); };
    if (typeof queueMicrotask === 'function') queueMicrotask(go); else Promise.resolve().then(go);
  }
  flush() {
    this.pending = false;
    if (!this.doc || this.mode === 'mirror') return false;
    this.io.write(NS2, this.doc);
    // the v1 echo: what a v1 build would read of this season
    this.io.write(NS1, { v: 1, season: this.doc.season, ...(this.doc.legacy ? { legacy: true } : {}), notebook: this.doc.notebook, read: this.doc.nb.pages.slice(), flags: { ...this.doc.flags } });
    return true;
  }
  write() { return this.flush(); }
  meta() { const m = this.io.read(META); return { nightOneSeen: false, endings: [], ...(m && typeof m === 'object' ? m : {}) }; }
  setMeta(patch) { if (this.mode === 'mirror') return false; return this.io.write(META, { ...this.meta(), ...patch }); }

  // --- time --------------------------------------------------------------------------------------------------------------
  time() {
    const day = this.ctx.day;
    if (this.now && Number.isFinite(this.now.abs)) return this.now;
    if (day && Number.isFinite(day.year) && Number.isFinite(day.doy)) return { abs: absDayOf(day.year, day.doy), hours: day.hours || 0 };
    return { abs: 0, hours: 0 };
  }
  nowAbs() { const t = this.time(); return t.abs + (t.hours || 0) / 24; }
  date() { const t = this.time(), d = new Date(t.abs * 86400000); return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), dow: d.getUTCDay(), hours: t.hours || 0, doy: t.abs - absDayOf(d.getUTCFullYear(), 0) }; }
  tripN() { const tr = this.ctx.trip; if (typeof this.ctx.tripN === 'function') return this.ctx.tripN(); return tr && tr.book && Array.isArray(tr.book.trips) ? tr.book.trips.length + (tr.active ? 1 : 0) : 0; }
  tickN() { return this.doc ? this.doc.tick : 0; }
  // the clock in (the tick): a rule pass for the sensors and the timers
  clock({ abs, hours = 0 } = {}) {
    if (Number.isFinite(abs)) this.now = { abs, hours };
    if (this.mode === 'mirror' || !this.doc) return [];
    const t = this.time();
    this.emit('clock', { abs: t.abs, hours: t.hours });
    return this.rules.tick();
  }
  // each frame (main.js): the tick once a game quarter-hour, from the game's own clock
  update() {
    const day = this.ctx.day;
    if (!day || this.mode === 'mirror' || !this.doc) return;
    const q = Math.floor((absDayOf(day.year, day.doy) * 24 + (day.hours || 0)) * 4);
    if (q === this.lastQ) return;
    this.lastQ = q;
    this.now = null;
    this.clock();
  }
  hash(s) { return hash32(String(s)); }

  // --- facts -------------------------------------------------------------------------------------------------------------
  has(k) { return !!(this.doc && this.doc.facts[k]); }
  get(k) { const r = this.doc && this.doc.facts[k]; return r ? r[0] : undefined; }
  fact(k) { const r = this.doc && this.doc.facts[k]; return r ? { key: k, v: r[0], abs: r[1], hours: r[2], trip: r[3], src: this.doc.src[r[4]], tick: r[5] } : null; }
  facts() { const out = {}; if (this.doc) for (const [k, r] of Object.entries(this.doc.facts)) out[k] = r[0]; return out; }
  keys(prefix) { const out = []; if (this.doc) for (const [k, r] of Object.entries(this.doc.facts)) if (k.startsWith(prefix)) out.push([k, r[0]]); return out; }
  srcIndex(src) { const d = this.doc, s = String(src || '?'); let i = d.src.indexOf(s); if (i < 0) { d.src.push(s); i = d.src.length - 1; } return i; }
  // the write itself, unchecked (migration, mirror)
  put(k, v, src, { abs } = {}) {
    const d = this.doc, t = this.time();
    d.tick++; d.rev++;
    d.facts[k] = [v, abs === undefined ? t.abs : abs, abs === undefined ? +(t.hours || 0).toFixed(2) : null, this.tripN(), this.srcIndex(src), d.tick];
  }
  // → true when written; a refusal is a warning and a log row
  set(k, v = true, src = '?') {
    if (!this.doc) return false;
    if (this.mode === 'mirror') return this.refuse(k, v, src, 'mirror: a guest\'s story never moves');
    const row = factRow(k);
    if (!row) return this.refuse(k, v, src, 'undeclared');
    const why = checkValue(row, v);
    if (why) return this.refuse(k, v, src, why);
    const had = this.doc.facts[k];
    if (had) {
      if (had[0] === v) return false;
      if (row.exclusive) return this.refuse(k, v, src, `exclusive: already ${had[0]}`);
      this.log('kept', { key: k, v, had: had[0], src }); // (grow-only: the first value stands)
      return false;
    }
    const before = { stage: this.stageN, tier: this.tier };
    this.put(k, v, src);
    this.log('fact', { key: k, v, src });
    this.dirty();
    this.emit('fact', { key: k, v });
    const after = { stage: this.stageN, tier: this.tier };
    if (after.stage !== before.stage) this.emit('stage', { from: STAGES[before.stage], to: STAGES[after.stage] });
    if (after.tier !== before.tier) this.emit('tier', { to: after.tier });
    this.rules.changed([`f:${k}`]);
    return true;
  }
  refuse(k, v, src, why) {
    this.log('refused', { key: k, v, src, why });
    if (this.mode !== 'mirror') console.warn(`story.set ${k}: ${why}`);
    return false;
  }

  // --- people, the notebook, the Walt page, leads ---------------------------------------------------------------------------
  person(who, field, op, v, src = '?') {
    if (!this.doc || this.mode === 'mirror') return null;
    const p = this.doc.ppl[who] || (this.doc.ppl[who] = { met: 0, last: null, trust: 0, fear: 0, cold: false });
    const cur = p[field];
    let nv = op === '+' ? (Number(cur) || 0) + Number(v) : op === '-' ? (Number(cur) || 0) - Number(v) : v;
    if (field === 'trust') nv = Math.max(0, Math.min(3, nv));
    if (field === 'fear') nv = Math.max(0, Math.min(2, nv));
    if (field === 'met') nv = Math.max(0, nv);
    p[field] = nv;
    p.last = this.time().abs;
    this.log('ppl', { who, field, v: nv, src });
    this.dirty();
    this.rules.changed([`p:${who}`]);
    return p;
  }
  meet(who, src = '?') { return this.person(who, 'met', '+', 1, src); }
  nbHas(kind, id) {
    const nb = this.doc && this.doc.nb;
    if (!nb) return false;
    if (kind === 'nbphoto') return !!nb.photos[id];
    return !!(nb[kind] && nb[kind][id] != null);
  }
  nbMark(kind, id, evt, src) {
    if (!this.doc || this.mode === 'mirror' || this.nbHas(kind, id)) return false;
    this.doc.nb[kind][id] = this.time().abs;
    this.log('nb', { kind, id, src });
    this.dirty();
    this.emit(evt, { id });
    this.rules.changed(['nb']);
    return true;
  }
  markRead(id, src = '?') { return this.nbMark('read', id, 'read', src); }
  readHere(id, src = '?') { return this.nbMark('here', id, 'nb:here', src); }
  understand(id, src = '?') { return this.nbMark('und', id, 'nb:understood', src); }
  waltLine(id, src = '?') {
    if (!this.doc || this.mode === 'mirror' || this.doc.walt.some((w) => w[0] === id)) return false;
    this.doc.walt.push([id, this.time().abs]);
    this.log('walt', { id, src });
    this.dirty();
    this.emit('walt:line', { id });
    return true;
  }
  walt() { return this.doc ? this.doc.walt.map((w) => w[0]) : []; }
  pencil() { return this.doc ? this.doc.pencil : null; }
  leadState(id, s, src = '?') {
    if (!this.doc || this.mode === 'mirror') return false;
    const L = this.doc.leads[id] || (this.doc.leads[id] = { s: null, d: this.time().abs });
    if (L.s === s) return false;
    L.s = s;
    L[s === 'open' ? 'd' : s[0]] = this.time().abs;
    this.log('lead', { id, s, src });
    this.dirty();
    this.emit(`lead:${s}`, { id });
    this.rules.changed([`lead:${id}`]);
    return true;
  }

  // --- actions and sensors other streams own ---------------------------------------------------------------------------
  handle(kind, fn) { this.actions.set(kind, fn); return () => this.actions.delete(kind); }
  action(kind, arg, meta = {}) {
    const fn = this.actions.get(kind);
    if (fn) return fn(arg, meta, this);
    if (kind === 'emit') { this.emit(arg, meta.args || {}); return true; }
    this.log('pending', { kind, arg, rule: meta.rule });
    this.emit('action', { kind, arg, rule: meta.rule });
    return false;
  }
  push(rule, args) { return this.beats && typeof this.beats.push === 'function' ? !!this.beats.push(rule, args, this) : true; }
  sensor(name, fn) { this.sensors.set(name, fn); return () => this.sensors.delete(name); }
  readSensor(name, arg, args, node) {
    const fn = this.sensors.get(name);
    if (fn) { try { return fn(arg, args, node, this); } catch (e) { console.warn('story sensor', name, e); return undefined; } }
    const dt = this.date();
    const range = (a, v) => String(a).split(/[|,]/).some((part) => {
      const m = /^(\d+)-(\d+)$/.exec(part);
      if (!m) return Number(part) === v;
      const lo = +m[1], hi = +m[2];
      return lo <= hi ? v >= lo && v <= hi : v >= lo || v <= hi; // (a wrap: hour:22-4)
    });
    switch (name) {
      case 'month': return range(arg, dt.month);
      case 'hour': return String(arg).split(/[|,]/).some((part) => { const m = /^(\d+)-(\d+)$/.exec(part); if (!m) return Math.floor(dt.hours) === +part; const lo = +m[1], hi = +m[2]; return lo <= hi ? dt.hours >= lo && dt.hours < hi : dt.hours >= lo || dt.hours < hi; });
      case 'dow': return String(arg).toLowerCase().split(/[|,]/).includes(DOW[dt.dow]);
      case 'date': {
        const m = /^(\d\d)-(\d\d)\.\.(\d\d)-(\d\d)$/.exec(String(arg));
        if (!m) return false;
        const v = dt.month * 100 + dt.day, lo = +m[1] * 100 + +m[2], hi = +m[3] * 100 + +m[4];
        return lo <= hi ? v >= lo && v <= hi : v >= lo || v <= hi;
      }
      case 'year': return dt.year;
      case 'daylight': case 'dark': {
        const { rise, set } = this.sunTimes(dt);
        const lit = dt.hours >= rise && dt.hours < set;
        return name === 'daylight' ? lit : !lit;
      }
      case 'trips': return this.tripN();
      case 'host': return this.mode !== 'mirror';
      case 'coop': return false;
      case 'peers': return 0;
      case 'ev@here': return false;
    }
    if (args && Object.prototype.hasOwnProperty.call(args, name)) return arg == null ? args[name] : String(args[name]) === String(arg);
    return undefined;
  }
  sunTimes(dt) {
    const day = this.ctx.day;
    if (day && !this.now) { const s = day.sunriseSunset; if (s && Number.isFinite(s.rise) && Number.isFinite(s.set)) return s; }
    // (no game clock: the sun at 48° N, in the game's local hours)
    const decl = 23.44 * Math.sin((2 * Math.PI * (284 + dt.doy)) / 365) * Math.PI / 180, lat = 48 * Math.PI / 180;
    const H = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl)))) * 180 / Math.PI / 15;
    return { rise: 13.1 - H, set: 13.1 + H };
  }
  since(unit, k) {
    const r = this.doc && this.doc.facts[k];
    if (!r) return null;
    if (unit === 'trips') return Math.max(0, this.tripN() - (r[3] || 0));
    if (r[1] == null) return null;
    return Math.max(0, this.nowAbs() - (r[1] + (r[2] || 0) / 24)); // (clamped: a checkpoint can rewind the clock past a stamp)
  }
  // `{told.denny.lake}`-style lookups for rule actions
  lookup(path) {
    const [head, ...rest] = path.split('.');
    if (head === 'told' && rest.length) { const p = this.doc.ppl[rest[0]]; return p && p.told ? (rest[1] ? p.told[rest[1]] : p.told) : undefined; }
    return this.get(path);
  }

  // --- derived values (never saved, §3.3) ---------------------------------------------------------------------------------
  get stageN() {
    if (!this.doc) return 0;
    if (this.has('end')) return 7;
    if (this.readSensor('run.active') || this.has('run.active')) return 6;
    if (this.has('ev.adrift')) return 5;
    if (this.has('ev.search')) return 4;
    if (this.has('tauno.turn')) return 3;
    if (this.has('tauno.porch.done') || this.keys('door.').some(([k]) => k.endsWith('.taken'))) return 2;
    if (this.has('nb.found')) return 1;
    return 0;
  }
  get stage() { return STAGES[this.stageN]; }
  get tier() {
    let t = 0;
    for (const [k] of this.keys('tier.')) { const n = +k.slice(5); if (Number.isFinite(n) && n > t) t = n; }
    if (this.get('choice.brekke') === 'needle') t += 1;
    const cap = this.has('tier.5') || this.readSensor('run.active') ? 5 : 4;
    return Math.min(t, cap);
  }
  get big() { const o = {}; for (const a of ARCS) o[a] = this.has(`door.${a}.yield`); return o; }
  get bigCount() {
    let n = ARCS.filter((a) => this.has(`door.${a}.yield`)).length;
    // p: begin (Round 6: the big findings that are not an arc's yield, each once: Mary's far end, 30 §4.8 and §6.1, the
    // mining arc's second; the drift test, 31 #27; the far end's camp, find.big.camp)
    for (const k of ['mary.farend', 'drift.done', 'find.big.camp']) if (this.has(k)) n++;
    // p: end
    return n;
  }
  get north() { return this.has('drift.done') || ['cards.seen', 'danielle.log', 'birch.stone', 'gord.told'].filter((k) => this.has(k)).length >= 2; }
  lock(n) {
    const L = lockById(n);
    if (!L) return null;
    const keys = L.keys.map((k) => k.id).filter((id) => this.has(`key.${id}`));
    return { id: L.id, name: L.name, keys, solved: L.solved ? this.has(L.solved) : keys.length > 0 };
  }
  get ending() { return this.get('end') || null; }
  get porch() { return this.has('tauno.porch.done') ? 'done' : this.has('tauno.porch.declined2') ? 'declined2' : this.has('tauno.porch.declined1') ? 'declined1' : 'none'; }
  door(id) { return this.has(`door.${id}.taken`) ? 'taken' : this.has(`door.${id}.declined`) ? 'declined' : 'none'; }
  doors() { const o = {}; for (const d of DOORS) o[d] = this.door(d); return o; }
  derivedValue(name, arg) {
    switch (name) {
      case 'stage': return this.stageN;
      case 'tier': return this.tier;
      case 'bigCount': return this.bigCount;
      case 'north': return this.north;
      case 'end': return this.ending;
      case 'lock': { const l = this.lock(arg); return !!(l && l.solved); }
      case 'porch': return this.porch;
      case 'door': return this.door(arg);
    }
    return undefined;
  }
  when(expr, args) {
    const c = compile(expr);
    if (c.warnings.length && !warnedWhen.has(c.src)) { warnedWhen.add(c.src); console.warn(`story.when '${c.src}': ${c.warnings.join('; ')} (it reads false; story-lint fails it)`); }
    if (!c.ok && !warnedWhen.has(c.src)) { warnedWhen.add(c.src); console.warn(`story.when '${c.src}': ${c.errors.join('; ')}`); }
    return c.test(this.env, args);
  }

  // --- the bus -----------------------------------------------------------------------------------------------------------
  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
    return () => this.handlers.get(evt).delete(fn);
  }
  emit(evt, data = {}) {
    for (const fn of this.handlers.get(evt) || []) { try { fn(data, this); } catch (e) { console.warn('story.on', evt, e); } }
    for (const fn of this.handlers.get('*') || []) { try { fn(evt, data, this); } catch (e) { console.warn('story.on *', e); } }
    if (evt !== 'fact' && evt !== 'clock') this.rules.fire(evt, data); // (every event is also an event in; mirror: off)
    else if (evt === 'clock') this.rules.fire('clock', data);
  }
  // the feed's way in (story-feed.js, K1b; the R0 join's call): an event from the game. On a co-op guest (mirror) it is
  // dropped here too, so nothing the guest's game does reaches the rules even if a feed is started by hand
  ingest(evt, data = {}) {
    if (this.mode === 'mirror' || !evt) return false;
    this.emit(evt, data);
    return true;
  }
  log(t, data) {
    if (!this.doc) return;
    const tm = this.time();
    this.doc.log.push([this.doc.tick, tm.abs, +(tm.hours || 0).toFixed(2), t, data]);
    if (this.doc.log.length > LOG_MAX) this.doc.log.splice(0, this.doc.log.length - LOG_MAX);
  }

  // --- co-op: the guest (Part 3 call 7) -------------------------------------------------------------------------------------
  setMode(mode) {
    if (mode !== 'mirror' || this.mode === 'mirror') return this.mode;
    this.mode = 'mirror';
    this.pending = false;
    // the guest's own document stays where it lies (the store is frozen, and nothing here writes); what the guest's book
    // shows is the host's, mirrored in (Round 3)
    this.setDoc(blankDoc('mirror'));
    this.doc.mirror = true;
    this.emit('mode', { mode });
    return this.mode;
  }
  // the host's world facts, in (coop-story.js, Round 3): only `world: true` rows, only on a guest
  applyMirror({ rev = 0, f = {} } = {}) {
    if (this.mode !== 'mirror' || !this.doc) return 0;
    let n = 0;
    for (const [k, v] of Object.entries(f)) {
      const row = factRow(k);
      if (!row || !row.world || this.doc.facts[k]) continue;
      this.put(k, v, 'host');
      n++;
      this.emit('fact', { key: k, v });
    }
    this.doc.rev = Math.max(this.doc.rev, rev);
    return n;
  }
  // the facts a guest would be sent (the host side of the mirror)
  worldFacts() { const out = {}; if (this.doc) for (const [k, r] of Object.entries(this.doc.facts)) { const row = factRow(k); if (row && row.world) out[k] = r[0]; } return out; }

  // --- the v1 surface (walt.js, onboarding.js, the gl rigs) ----------------------------------------------------------------
  setPages(fn) { this.pagesFn = typeof fn === 'function' ? fn : null; }
  pages() {
    let p = null;
    if (this.pagesFn) { try { p = this.pagesFn(this.doc); } catch (e) { console.warn('story.pages', e); p = null; } }
    return Array.isArray(p) && p.length ? p : PLACEHOLDER_PAGES;
  }
  read(i) {
    const pages = this.pages(), n = Math.max(0, Math.min(pages.length - 1, i | 0)), page = pages[n];
    if (this.doc && this.mode !== 'mirror' && !this.doc.nb.pages.includes(n)) { this.doc.nb.pages.push(n); this.dirty(); }
    this.emit('notebook:read', { page: n, title: page.title });
    return page;
  }
  flag(key, value) {
    if (value === undefined) return this.doc ? this.doc.flags[key] : undefined;
    if (this.doc && this.mode !== 'mirror') { this.doc.flags[key] = value; this.dirty(); }
    return value;
  }
  // the notebook found (walt.js): its place kept, and said (the nbfound rule writes nb.found)
  found({ abs = null, key = null, lake = null } = {}) {
    if (!this.doc || this.mode === 'mirror') return false;
    this.doc.nb.at = { abs, key, lake };
    this.dirty();
    this.emit('notebook:found', { abs, key, lake });
    if (!this.has('nb.found')) this.set('nb.found', true, 'walt.find'); // (the rule's own write, unless rules are swapped out)
    return true;
  }

  // --- for rigs and the lint (§14.3) -----------------------------------------------------------------------------------------
  why(k) {
    const f = this.fact(k);
    if (!f) return null;
    const rows = this.doc.log.filter((r) => r[4] && (r[4].key === k)).map((r) => ({ tick: r[0], abs: r[1], hours: r[2], t: r[3], ...r[4] }));
    return { ...f, log: rows };
  }
  // the producers of a fact and what each still lacks
  can(k) {
    return this.rules.producers(k).map((r) => ({ rule: r.id, on: r.on || null, when: r.when || '', ok: r.c.test(this.env), lacks: r.c.atoms.filter((a) => !compile(atomSrc(a)).test(this.env)).map(atomSrc) }));
  }
  makeDebug() {
    const self = this, acts = new Map(), fixtures = new Map();
    acts.set('newSeason', (id) => self.newSeason(id ?? (self.profile && self.profile.seasonId) ?? null));
    acts.set('read', (i) => self.read(i));
    acts.set('found', (o) => self.found(o || { abs: self.time().abs }));
    acts.set('tick', () => self.clock());
    acts.set('wait', ({ days = 0, hours = 0 } = {}) => {
      const t = self.time(), tot = t.abs * 24 + (t.hours || 0) + days * 24 + hours, abs = Math.floor(tot / 24), h = tot - abs * 24, day = self.ctx.day;
      if (day && typeof day.setClock === 'function' && !self.now) { const d = new Date(abs * 86400000), y = d.getUTCFullYear(); day.setClock(y, abs - absDayOf(y, 0), h); self.lastQ = null; return self.clock(); }
      return self.clock({ abs, hours: h });
    });
    return {
      actions: acts, fixtures,
      do(name, ...a) { const fn = acts.get(name); if (!fn) throw new Error(`story.debug.do: no action ${name}`); return fn(...a); },
      set(k, v = true) { return self.set(k, v, 'debug'); },
      emit(evt, data) { return self.emit(evt, data); },
      rerun(quiet = true) { return self.rules.rerun({ quiet }); },
      fixture(name) { const fn = fixtures.get(name); if (!fn) throw new Error(`story.debug.fixture: no fixture ${name}`); return fn(self); },
      doc() { return JSON.parse(JSON.stringify(self.doc)); },
      errors() { return self.rules.errors.slice(); },
      warnings() { return self.rules.warnings.slice(); },
    };
  }
}
function atomSrc(a) {
  switch (a.k) {
    case 'fact': return `f:${a.fact}${a.op ? a.op + a.v : ''}`;
    case 'any': return `any(${a.prefix}*${a.op ? a.op + a.v : ''})`;
    case 'count': return `count(${a.prefix}*)${a.op}${a.v}`;
    case 'since': return `${a.unit}.since(${a.fact})${a.op}${a.v}`;
    case 'stage': return `stage${a.op}S${a.v}`;
    case 'stagein': return `S${a.lo}-S${a.hi}`;
    case 'derived': return a.name === 'end' ? `end:${a.vals.join('|')}` : a.name === 'porch' ? `porch:${a.vals.join('|')}` : a.name === 'door' ? `door:${a.arg}=${a.vals.join('|')}` : a.name === 'lock' ? `lock:${a.arg}` : a.name === 'north' ? 'north' : `${a.name}${a.op}${a.v}`;
    case 'nb': return `${a.kind}:${a.id}`;
    case 'ppl': return a.op ? `${a.field}:${a.who}${a.op}${a.v}` : `${a.field}:${a.who}`;
    case 'lead': return `lead:${a.id}=${a.vals.join('|')}`;
    case 'sensor': return a.name === 'ev@here' ? `${a.arg}@here` : `${a.name}${a.arg != null ? ':' + (typeof a.arg === 'object' ? JSON.stringify(a.arg) : a.arg) : ''}${a.op ? a.op + a.v : ''}`;
    case 'in': return `${a.name} in [${a.vals.join(',')}]`;
  }
  return '?';
}
