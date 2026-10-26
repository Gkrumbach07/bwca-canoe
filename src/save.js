// Saved state in localStorage, one JSON document per namespace under `bwca-canoe:<ns>`. Any feature keeps
// its own namespace (`save.read('fishing')`, `save.write('fishing', {...})`) so nothing steps on anything
// else; `trip` (position, heading, clock, camera) and `settings` are the shell's. Reads never throw: a
// missing or unparsable entry gives the fallback, and a browser that refuses storage (private mode, quota)
// is treated as empty.
//
// Round A-D: three seasons side by side (the slots, below). Every season key (`bwca-canoe:<ns>` and the older
// `bwca-canoe-<name>`, all but the few GLOBAL_KEYS that belong to the player) is the season being played, so no module
// needs to know about slots: the slot is mounted before anything reads.
import { pack, unpack } from './lzw.js';

const PREFIX = 'bwca-canoe:';

export const save = {
  key(ns) { return PREFIX + ns; },
  has(ns) { try { return localStorage.getItem(this.key(ns)) != null; } catch { return false; } },
  read(ns, fallback = null) {
    try {
      const raw = localStorage.getItem(this.key(ns));
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  write(ns, value) {
    try { localStorage.setItem(this.key(ns), JSON.stringify(value)); return true; } catch { return false; }
  },
  // merge a few fields into the namespace's document
  patch(ns, fields) { return this.write(ns, Object.assign(this.read(ns, {}) || {}, fields)); },
  clear(ns) { try { localStorage.removeItem(this.key(ns)); } catch { /* nothing to clear */ } },
  // every namespace we hold
  namespaces() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length)); } } catch { /* no storage */ }
    return out;
  },
};

// The trip: where the canoe is, which way it points, the day clock and the camera, written every few
// seconds while playing so "Paddle in" picks the trip up where it stopped. `read()` returns null when
// there is nothing to continue.
export class TripSaver {
  constructor(player, day, chase, interval = 4) {
    this.player = player; this.day = day; this.chase = chase;
    this.interval = interval; this.t = 0; this.enabled = false;
    window.addEventListener('pagehide', () => { if (this.enabled) this.write(); });
    document.addEventListener('visibilitychange', () => { if (this.enabled && document.visibilityState === 'hidden') this.write(); });
  }
  static read() {
    const t = save.read('trip');
    return t && Number.isFinite(t.x) && Number.isFinite(t.z) ? t : null;
  }
  snapshot() {
    const p = this.player, d = this.day, drop = p.mode === 'walk' && p.carry && p.carry.drop; // on foot: where the canoe lies
    return { v: 1, x: p.x, z: p.z, heading: p.heading, mode: p.mode, drop: drop ? { x: drop.x, z: drop.z, heading: drop.heading } : null, year: d.year, doy: d.doy, hours: d.hours, running: d.running, camera: this.chase.mode, timeScale: p.timeScale, savedAt: Date.now() };
  }
  write() { if (!this.player.teleporting) save.write('trip', this.snapshot()); }
  clear() { save.clear('trip'); }
  update(dt) {
    if (!this.enabled) return;
    this.t += dt;
    if (this.t >= this.interval) { this.t = 0; this.write(); }
  }
}

// --- round A-D: the season slots -------------------------------------------------------------------------------------
// Three seasons side by side. The slot being played is "live": its keys are the ordinary season keys every module
// reads and writes (the autosave, pagehide and all, writes there as it always has). The other two are "parked", each
// one string under `bwca-canoe@slot<n>`: { v, keys: { key: raw } } as JSON, packed (lzw.js, about a fifth the size).
// The slots' own document is `bwca-canoe@slots`: { v, active, live, gen, pending, boot, slots: { n: meta | null } },
// a meta being { made, played, saved, words, facts, from, size, packed }.
//
// Switching is done at the next page load, so nothing in memory has to be told: an action sets `active` (or a pending
// wipe or remount) and reloads, and mount() below, run when this module is first evaluated (before main() reads
// anything), parks the live keys into the slot they belong to, pagehide's last writes included, and unparks the active
// slot into their place. Today's single save is found with no slots document and becomes slot 1 where it lies.
//
// The photo prints (photo.js) are in IndexedDB, keyed by a number each season counts from 1, so a parked slot's prints
// are moved aside (`bwca-canoe-slots`, keyed "<slot>:<id>") before the reload and the next slot's put back.
//
// A season goes out as a versioned file and comes back in (exportSeason, importSeason) with no server: the keys as
// they are and the prints as data URLs. A second tab that changes seasons makes this one stale: its season writes are
// dropped from then on (the other tab owns the keys), and `slots.stale` says so.
//
//   slots.live · slots.count · slots.stale · slots.list() → [{ n, live, empty, meta }]
//   slots.describe(words) (the live slot's line) · claim() (a season begun in place) · takeBoot() → { do, ep, mode }
//   slots.play(n) · startNew(n, { ep, mode }) · remove(n) · copy(from, to) · exportSeason(n) → { file, text }
//   slots.importSeason(text, n) → { ok, why, reload } · slots.usage() → { total, limit, live, parked: { n } }
export const SLOT_COUNT = 3;
export const FILE_FORMAT = 'bwca-canoe-season', FILE_V = 1;
// the player's, not a season's: the settings, the mode the title picks for a new season, the GPS bridge, a key taught
export const GLOBAL_KEYS = new Set(['bwca-canoe:settings', 'bwca-canoe:tripMode', 'bwca-canoe-geo', 'bwca-canoe:fb5-rturn']);
const SEASON_KEY = /^bwca-canoe[:-]/;
export const isSeasonKey = (k) => typeof k === 'string' && SEASON_KEY.test(k) && !GLOBAL_KEYS.has(k);
const DOC = 'bwca-canoe@slots', PARKED = (n) => `bwca-canoe@slot${n}`, PACKED = 'Z1:';
const QUOTA = 5 * 1024 * 1024;   // chars a browser keeps per site, about (Chrome, Firefox and Safari: 5 M)
const FILE_MAX = 6e6;            // chars of an import, at most
const SEASON_MAX = 2.5e6;        // chars of a season's keys in an import, at most
const PRINT_MAX = 400e3;         // chars of one print's data URL
const PHOTOS = 'bwca-canoe:photos';
const PRINT_ID = /^\d+$/;

const store = () => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const parse = (s) => { try { return s == null ? null : JSON.parse(s); } catch { return null; } };
const nums = () => Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);
function blankDoc() { return { v: 1, active: 1, live: 1, gen: 1, pending: null, boot: null, error: null, slots: Object.fromEntries(nums().map((n) => [n, null])) }; }
function readDoc() {
  const d = parse(store() && store().getItem(DOC));
  if (!d || d.v !== 1 || !d.slots) return null;
  const ok = (n) => Number.isInteger(n) && n >= 1 && n <= SLOT_COUNT;
  if (!ok(d.active)) d.active = 1;
  if (!ok(d.live)) d.live = d.active;
  for (const n of nums()) if (!(n in d.slots)) d.slots[n] = null;
  return d;
}
function writeDoc(d) { try { store().setItem(DOC, JSON.stringify(d)); return true; } catch { return false; } }
// the live season's keys, raw
function liveMap() {
  const st = store(), out = {};
  if (!st) return out;
  for (let i = 0; i < st.length; i++) { const k = st.key(i); if (isSeasonKey(k)) out[k] = st.getItem(k); }
  return out;
}
function clearLive() { const st = store(); for (const k of Object.keys(liveMap())) st.removeItem(k); }
// what a season's keys say about it, for its line when it has none in words: the profile and the trip saver's spot
export function factsOf(keys) {
  const j = (k) => parse(keys[k]);
  const pr = j('bwca-canoe:profile'), t = j('bwca-canoe:trip'), doc = j('bwca-canoe-trip');
  const f = { started: !!(pr && pr.started), mode: pr && pr.mode === 'sandbox' ? 'sandbox' : 'adventure', money: pr && Number.isFinite(pr.money) ? pr.money : null, home: pr ? pr.home : null, out: !!(doc && doc.trip && doc.trip.active) };
  if (t && Number.isFinite(t.x) && Number.isFinite(t.z)) Object.assign(f, { x: Math.round(t.x), z: Math.round(t.z), year: t.year, doy: t.doy, hours: t.hours });
  return f;
}
const sizeOf = (keys) => Object.entries(keys).reduce((s, [k, v]) => s + k.length + String(v).length, 0);
function decodeParked(raw) {
  const json = String(raw).startsWith(PACKED) ? unpack(String(raw).slice(PACKED.length)) : String(raw);
  const p = JSON.parse(json);
  if (!p || p.v !== 1 || !p.keys || typeof p.keys !== 'object') throw new Error('not a parked season');
  return p;
}
function encodeParked(keys) { return PACKED + pack(JSON.stringify({ v: 1, keys })); }
// the live keys into slot n's parked string: false when the browser will not hold it
function park(d, n) {
  const keys = liveMap(), raw = encodeParked(keys), now = Date.now();
  // (a slot's parked string is never replaced by live keys with no season in them: after a mount that ran out of room
  // half-way, the string is the season)
  if (!keys['bwca-canoe:profile'] && store().getItem(PARKED(n)) != null) return true;
  try { store().setItem(PARKED(n), raw); } catch { return false; }
  const m = d.slots[n] || { made: now };
  d.slots[n] = { ...m, saved: now, played: m.played || now, facts: factsOf(keys), size: sizeOf(keys), packed: raw.length };
  return true;
}
// slot n's parked string into the live keys: 'ok' | 'damaged' (kept aside as @slot<n>.bad) | 'full'
function unpark(n) {
  const st = store(), raw = st.getItem(PARKED(n));
  if (raw == null) return 'ok'; // a slot made but never parked: an empty season
  let p;
  try { p = decodeParked(raw); } catch { try { st.setItem(`${PARKED(n)}.bad`, raw); } catch { /* full */ } st.removeItem(PARKED(n)); return 'damaged'; }
  try { for (const [k, v] of Object.entries(p.keys)) if (isSeasonKey(k)) st.setItem(k, String(v)); } catch { clearLive(); return 'full'; }
  st.removeItem(PARKED(n)); // the live keys are the season now
  return 'ok';
}
// run once, when this module is first evaluated
function mount() {
  const st = store();
  if (!st) return null;
  let d = readDoc();
  const now = Date.now();
  if (!d) {
    d = blankDoc();
    const keys = liveMap(), f = factsOf(keys);
    if (Object.keys(keys).length && (f.started || keys['bwca-canoe-trip'])) d.slots[1] = { made: now, played: now, from: 'migrated', facts: f, size: sizeOf(keys) }; // today's single save is slot 1
  } else if (d.pending || d.live !== d.active) {
    const from = d.live, to = d.active;
    // the live keys are their slot's newest (pagehide's writes included), unless that slot was deleted or replaced
    const parked = d.pending || !d.slots[from] ? true : park(d, from);
    // (a change that could not be made drops what the last page asked of this load: a new season asked for slot 3
    // must never begin over the season it stayed in)
    if (!parked) { d.active = from; d.error = 'full'; d.boot = null; }
    else {
      clearLive();
      const r = d.slots[to] ? unpark(to) : 'ok';
      if (r === 'full') { // back as it was: the season left stays the live one (or that slot stays empty), the other parked
        if (from !== to && d.slots[from]) unpark(from);
        if (from === to) { d.slots[to] = null; st.removeItem(PARKED(to)); } // (an import over an empty slot, refused)
        d.active = from; d.error = 'full'; d.boot = null;
      }
      else if (r === 'damaged') { d.error = `damaged:${to}`; d.slots[to] = null; d.boot = null; } // (its string kept as @slot<n>.bad)
      d.live = d.active; d.gen = (d.gen || 0) + 1;
    }
    d.pending = null;
  }
  // the slot being played still has its parked string and no season in the live keys (a mount that ran out of room
  // half-way): the string is the season, so it goes live
  if (d.slots[d.live] && st.getItem(PARKED(d.live)) != null && !st.getItem('bwca-canoe:profile')) { clearLive(); if (unpark(d.live) !== 'ok') d.error = 'full'; }
  if (d.slots[d.live]) d.slots[d.live].played = now;
  writeDoc(d);
  return d;
}

let mounted = null, stale = false;
try { mounted = mount(); } catch (e) { console.warn('save slots: the mount failed', e); }
const myGen = mounted ? mounted.gen : 0, myLive = mounted ? mounted.live : 1;
const bootError = mounted ? mounted.error : null;
if (mounted && mounted.error) { mounted.error = null; writeDoc(mounted); }
// another tab changed seasons: from now on its keys are not ours to write
if (mounted && typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (stale || e.key !== DOC || e.storageArea !== store()) return;
    const d = parse(e.newValue);
    if (d && d.gen === myGen && d.live === myLive) return;
    stale = true;
    const set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k, v) { if (this === store() && isSeasonKey(k)) return undefined; return set.call(this, k, v); };
    Storage.prototype.removeItem = function (k) { if (this === store() && isSeasonKey(k)) return undefined; return rem.call(this, k); };
    console.warn('save slots: another tab changed seasons; this tab no longer saves');
  });
}

// --- the prints, beside the slots (IndexedDB) ---
const PHOTO_DB = 'bwca-canoe-photos', SLOT_DB = 'bwca-canoe-slots', PRINTS = 'prints';
const dbs = new Map();
function openDb(name) {
  if (dbs.has(name)) return dbs.get(name);
  const p = new Promise((res) => {
    try {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(PRINTS)) r.result.createObjectStore(PRINTS); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch { res(null); }
  });
  dbs.set(name, p);
  return p;
}
async function dbDo(name, mode, fn) {
  const db = await openDb(name);
  if (!db) return undefined;
  return new Promise((res) => {
    try {
      const tx = db.transaction(PRINTS, mode), st = tx.objectStore(PRINTS), out = fn(st);
      tx.oncomplete = () => res(out && typeof out === 'object' && 'result' in out ? out.result : out === undefined ? true : out);
      tx.onerror = tx.onabort = () => res(undefined);
    } catch { res(undefined); }
  });
}
const slotRange = (n) => IDBKeyRange.bound(`${n}:`, `${n}:￿`);
// the prints a season's keys list (photo.js keeps the list in `photos`)
function printIds(keys) { const p = parse(keys[PHOTOS]); return p && Array.isArray(p.list) ? p.list.map((r) => r && r.id).filter((id) => id != null) : []; }
async function readPrints(n, ids) { // n: a slot, or 0 for the live store
  const out = {};
  for (const id of ids) {
    const v = n ? await dbDo(SLOT_DB, 'readonly', (s) => s.get(`${n}:${id}`)) : await dbDo(PHOTO_DB, 'readonly', (s) => s.get(id));
    if (typeof v === 'string' && v) out[id] = v;
  }
  return out;
}
async function writePrints(n, prints) {
  for (const [id, v] of Object.entries(prints)) {
    if (n) await dbDo(SLOT_DB, 'readwrite', (s) => { s.put(v, `${n}:${id}`); });
    else await dbDo(PHOTO_DB, 'readwrite', (s) => { s.put(v, Number(id)); });
  }
}
async function dropPrints(n) {
  if (n) await dbDo(SLOT_DB, 'readwrite', (s) => { s.delete(slotRange(n)); });
  else await dbDo(PHOTO_DB, 'readwrite', (s) => { s.clear(); });
}
async function slotPrints(n) { // every print parked under slot n, by id
  const db = await openDb(SLOT_DB);
  if (!db) return {};
  return new Promise((res) => {
    const out = {};
    try {
      const tx = db.transaction(PRINTS, 'readonly'), req = tx.objectStore(PRINTS).openCursor(slotRange(n));
      req.onsuccess = () => { const c = req.result; if (c) { out[String(c.key).split(':')[1]] = c.value; c.continue(); } };
      tx.oncomplete = () => res(out); tx.onerror = tx.onabort = () => res(out);
    } catch { res(out); }
  });
}
// the live prints aside under slot n; the live store emptied
async function stashLive(n) { const live = await readPrints(0, printIds(liveMap())); await dropPrints(n); await writePrints(n, live); await dropPrints(0); }
// slot n's parked prints into the live store (emptied first), and out of the slot's
async function bringIn(n) { const p = await slotPrints(n); await dropPrints(0); await writePrints(0, p); await dropPrints(n); }

// --- reading an import ---
const why = {
  notSeason: 'That file isn’t a season from this game.',
  newer: 'That season was saved by a newer version of the game.',
  big: 'That file is too big to be a season.',
  empty: 'That file has no season in it.',
  cut: 'That season’s file is damaged and can’t be read.',
};
export function readSeasonFile(text) {
  const s = String(text ?? '');
  if (s.length > FILE_MAX) return { ok: false, why: why.big };
  const f = parse(s);
  if (!f && s.includes(FILE_FORMAT)) return { ok: false, why: why.cut };
  if (!f || typeof f !== 'object' || f.format !== FILE_FORMAT || !Number.isInteger(f.v) || f.v < 1) return { ok: false, why: why.notSeason };
  if (f.v > FILE_V) return { ok: false, why: why.newer };
  if (!f.keys || typeof f.keys !== 'object' || Array.isArray(f.keys)) return { ok: false, why: why.empty };
  const keys = {};
  for (const [k, v] of Object.entries(f.keys)) {
    if (GLOBAL_KEYS.has(k)) continue; // the player's own settings stay as they are
    if (!isSeasonKey(k) || typeof v !== 'string') return { ok: false, why: why.notSeason };
    if (parse(v) === null && v !== 'null') return { ok: false, why: `That season is damaged: its ${k.replace(/^bwca-canoe[:-]/, '')} doesn’t read.` };
    keys[k] = v;
  }
  const pr = parse(keys['bwca-canoe:profile']);
  if (!pr || pr.v !== 1) return { ok: false, why: why.empty };
  if (sizeOf(keys) > SEASON_MAX) return { ok: false, why: why.big };
  const prints = {};
  if (f.prints && typeof f.prints === 'object') for (const [id, v] of Object.entries(f.prints)) if (PRINT_ID.test(id) && typeof v === 'string' && /^data:image\/[a-z]+;base64,/.test(v) && v.length < PRINT_MAX) prints[id] = v;
  return { ok: true, keys, prints, words: typeof f.words === 'string' ? f.words.slice(0, 200) : null, facts: factsOf(keys), exported: f.exported || null };
}

const liveStarted = () => factsOf(liveMap()).started;
let leaving = false; // a change of season is under way: the page's last writes leave the slots document alone
const reload = () => { leaving = true; try { location.reload(); } catch { /* not a page */ } };
const refused = (w) => ({ ok: false, why: w });
const STALE = 'Another tab changed seasons. Reload this one to carry on.';

export const slots = {
  count: SLOT_COUNT,
  get live() { return myLive; },
  get stale() { return stale; },
  get error() { return bootError; },     // what the mount ran into ('full', 'damaged:<n>'), once
  get usable() { return !!mounted; },
  // every slot: the live one is occupied once its season has begun
  list() {
    const d = readDoc() || blankDoc();
    return nums().map((n) => {
      const live = n === myLive, meta = d.slots[n];
      const empty = live ? !meta && !liveStarted() : !meta;
      return { n, live, empty, meta: meta || null };
    });
  },
  occupied(n) { const s = this.list()[n - 1]; return !!s && !s.empty; },
  // the first empty slot, one not being played first (a season there needs no reload to land)
  firstEmpty() { const l = this.list(), s = l.find((x) => x.empty && !x.live) || l.find((x) => x.empty); return s ? s.n : 0; },
  // the live slot's line, as the title words it (written on pagehide and whenever the title opens)
  describe(words) {
    if (stale || !mounted || leaving) return;
    const d = readDoc(); if (!d || d.live !== myLive || d.active !== myLive || d.pending) return; // (a change of season is under way)
    const m = d.slots[myLive];
    if (!m) { if (!liveStarted()) return; d.slots[myLive] = { made: Date.now(), played: Date.now() }; }
    const keys = liveMap();
    Object.assign(d.slots[myLive], { words: words ? String(words) : null, facts: factsOf(keys), size: sizeOf(keys), saved: Date.now() });
    writeDoc(d);
  },
  // a season begun in place in the live slot (the title's New season with the slot empty)
  claim() {
    if (stale || !mounted || leaving) return;
    const d = readDoc(); if (!d) return;
    const now = Date.now();
    d.slots[myLive] = { made: now, played: now, from: null };
    writeDoc(d);
  },
  // what the last page asked of this load: { do: 'continue' } or { do: 'new', ep, mode }, once
  takeBoot() {
    const d = readDoc(); if (!d || !d.boot) return null;
    const b = d.boot; d.boot = null; writeDoc(d);
    return b;
  },
  // the pending state of every module written now: the same handlers the page's going away runs
  flush() { try { window.dispatchEvent(new Event('pagehide')); } catch { /* not a page */ } },
  // play a parked season: the reload parks this one and mounts that
  async play(n) {
    if (stale) return refused(STALE);
    const d = readDoc(); if (!d || !d.slots[n] || n === myLive) return refused('There is no season there.');
    if (this.occupied(myLive)) await stashLive(myLive); else await dropPrints(0);
    await bringIn(n);
    d.active = n; d.boot = { do: 'continue' };
    writeDoc(d); reload();
    return { ok: true, reload: true };
  },
  // a new season in slot n (empty, or the live one, which it replaces), begun at entry point ep after the reload
  async startNew(n, { ep, mode } = {}) {
    if (stale) return refused(STALE);
    const d = readDoc(); if (!d) return refused('The saves aren’t working in this browser.');
    const live = n === myLive;
    if (!live && d.slots[n]) return refused('That slot holds a season.');
    if (live) { d.pending = 'wipe'; await dropPrints(0); }
    else {
      if (this.occupied(myLive)) await stashLive(myLive); else { d.slots[myLive] = null; await dropPrints(0); }
      try { store().removeItem(PARKED(n)); } catch { /* none */ }
      await dropPrints(n); d.active = n;
    }
    d.slots[n] = { made: Date.now(), from: null };
    d.boot = { do: 'new', ep: ep != null ? Number(ep) : null, mode: mode === 'sandbox' ? 'sandbox' : 'adventure' };
    writeDoc(d); reload();
    return { ok: true, reload: true };
  },
  // forget slot n's season: a parked one at once; the live one with a reload, into the last played of the others
  async remove(n) {
    if (stale) return refused(STALE);
    const d = readDoc(); if (!d) return refused('The saves aren’t working in this browser.');
    if (n !== myLive) {
      try { store().removeItem(PARKED(n)); } catch { /* gone */ }
      d.slots[n] = null; writeDoc(d); await dropPrints(n);
      return { ok: true, reload: false };
    }
    d.slots[n] = null;
    const next = nums().filter((k) => k !== n && d.slots[k]).sort((a, b) => (d.slots[b].played || 0) - (d.slots[a].played || 0))[0];
    await dropPrints(0);
    if (next) { d.active = next; await bringIn(next); } else d.pending = 'wipe';
    d.boot = null;
    writeDoc(d); reload();
    return { ok: true, reload: true };
  },
  // slot from's season into the empty slot to, as it stands
  async copy(from, to) {
    if (stale) return refused(STALE);
    const d = readDoc(); if (!d) return refused('The saves aren’t working in this browser.');
    if (!this.occupied(from)) return refused('There is no season there.');
    if (this.occupied(to)) return refused('That slot holds a season.');
    const now = Date.now(), m = d.slots[from] || { made: now };
    let raw, keys;
    if (from === myLive) { this.flush(); keys = liveMap(); raw = encodeParked(keys); }
    else { raw = store().getItem(PARKED(from)); try { keys = decodeParked(raw).keys; } catch { return refused('That season doesn’t read.'); } }
    try { store().setItem(PARKED(to), raw); } catch { return refused('There’s no room left in this browser for another season.'); }
    const d2 = readDoc(); // (the flush may have written the live line)
    d2.slots[to] = { ...(d2.slots[from] || m), made: now, played: (d2.slots[from] || m).played || now, from: `copy:${from}`, facts: factsOf(keys), size: sizeOf(keys), packed: raw.length };
    const prints = from === myLive ? await readPrints(0, printIds(keys)) : await slotPrints(from);
    if (to === myLive) { // the live slot was the empty one: the copy is mounted there with a reload
      d2.pending = 'remount'; d2.boot = null;
      await dropPrints(0); await writePrints(0, prints);
      writeDoc(d2); reload();
      return { ok: true, reload: true, n: to };
    }
    writeDoc(d2);
    await dropPrints(to); await writePrints(to, prints);
    return { ok: true, reload: false, n: to };
  },
  // slot n's season as a file: { file, text }, the file { format, v, exported, words, facts, keys, prints }
  async exportSeason(n) {
    if (!this.occupied(n)) return refused('There is no season there.');
    const d = readDoc() || blankDoc();
    let keys;
    if (n === myLive) { this.flush(); keys = liveMap(); }
    else { try { keys = decodeParked(store().getItem(PARKED(n))).keys; } catch { return refused('That season doesn’t read.'); } }
    const prints = n === myLive ? await readPrints(0, printIds(keys)) : await slotPrints(n);
    const m = (readDoc() || d).slots[n] || {};
    const file = { format: FILE_FORMAT, v: FILE_V, exported: new Date().toISOString(), words: m.words || null, facts: factsOf(keys), keys, prints };
    return { ok: true, file, text: JSON.stringify(file, null, 1) };
  },
  // a season file into the empty slot n: refused with a line when it is not one; into the live slot (empty) it
  // mounts with a reload
  async importSeason(text, n) {
    if (stale) return refused(STALE);
    const r = readSeasonFile(text);
    if (!r.ok) return r;
    const d = readDoc(); if (!d) return refused('The saves aren’t working in this browser.');
    if (this.occupied(n)) return refused('That slot holds a season.');
    const raw = encodeParked(r.keys), now = Date.now();
    try { store().setItem(PARKED(n), raw); } catch { return refused('There’s no room left in this browser for another season.'); }
    d.slots[n] = { made: now, played: now, saved: now, words: r.words, facts: r.facts, from: 'import', size: sizeOf(r.keys), packed: raw.length };
    if (n === myLive) {
      d.pending = 'remount'; d.boot = null;
      await dropPrints(0); await writePrints(0, r.prints);
      writeDoc(d); reload();
      return { ok: true, reload: true, n };
    }
    writeDoc(d);
    await dropPrints(n); await writePrints(n, r.prints);
    return { ok: true, reload: false, n };
  },
  // localStorage in chars: every key the game holds, the live season's, each parked slot's
  usage() {
    const st = store(), out = { total: 0, limit: QUOTA, live: 0, parked: {} };
    if (!st) return out;
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i), v = st.getItem(k) || '', c = k.length + v.length;
      if (!k.startsWith('bwca-canoe')) continue;
      out.total += c;
      if (isSeasonKey(k)) out.live += c;
      const m = /^bwca-canoe@slot(\d)$/.exec(k); if (m) out.parked[m[1]] = c;
    }
    return out;
  },
};
