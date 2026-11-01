// A season carried from one map release to another (d2 join; docs/migration.md). A release may number its lakes,
// campsites and portages afresh (v4: Quetico's Ontario lakes in among Minnesota's, Lake One from 78 to 103; v6: the
// wetlands, almost every lake renumbered), and a season keeps those numbers: the map's ink (explored), the logbook's
// lakes, the trip's log, the notices' sites, trails and lakes, the tally, the record and the packs set down at a
// portage. Positions in metres are the same in every release (one projection, one grid), so whatever is kept by place
// carries over as it is, except the few campsites and landings a bake moved.
//
// Each season says which release it was made on: `bwca-canoe:data` = { version, baked } (index.json's `version` and
// `source.baked`; every release since v4 says version 4, so the bake time tells them apart), a season key like any
// other, so it travels with its slot, a parked slot, a copy and an exported file. A season with none is from before
// this (the v3 release). migrateSeason(meta), run in main.js once the world's index is in and before anything reads
// the season, carries the live season's numbers over once, by the table in TABLES whose `from` is the season's stamp
// and whose `to` is the release loaded (src/migrate/<from-baked>.json, scripts/migrate-table.mjs; each its own chunk,
// fetched only then), and stamps it. A season whose release has no table to the one loaded is left as it is, NOT
// stamped, so a later release that ships a table from it still carries it. A parked or an imported season is carried
// over the same way when it is next played (it goes live at the page load, save.js mount, and this runs before
// anything reads it). A number with nothing in the new release is dropped (a notice whose site or trail is gone leaves
// the board); a document that cannot be read is left as it was. Nothing here throws.
//
// The damaged seasons: v6 shipped with no table, and this then stamped any older season v6 while it kept its v3 or v4
// numbers. A season stamped v6 (or with a stamp no table knows) is tested by the lake names it keeps next to their ids
// (the trip's log, the tally, the record, the notices' routes) and by the campsites it slept at (kept by place): each
// table maps the season's ids into the loaded release, and the one under which the names come out right and the
// sites' lakes are among its lakes is the release the numbers are from (seasonFrom). With nothing that tells the
// tables apart, a v6 stamp is taken at its word and an unknown stamp is left for later.
//
//   migrateSeason(meta, store = localStorage, load?) → { did, from, to, via, report, damaged?, left? } | null
//     (load(entry) → table: the tests'; a table object in its place is the only table)
//   migrateKeys(keys, table, meta?) → { keys, report }    (keys: { 'bwca-canoe:<ns>': raw JSON }, as save.js liveMap)
//   seasonFrom(keys, meta, tables, stamped) → { entry, table, hits, of, damaged }, seasonNames(keys)
//   stampOf(meta), MARK, TABLES, sameNumbering(meta, table), mapperOf(table)

export const MARK = 'bwca-canoe:data';
const SEASON_KEY = /^bwca-canoe[:-]/;
const GLOBAL = new Set(['bwca-canoe:settings', 'bwca-canoe:tripMode', 'bwca-canoe-geo', 'bwca-canoe:fb5-rturn']); // save.js GLOBAL_KEYS
const seasonKey = (k) => typeof k === 'string' && SEASON_KEY.test(k) && !GLOBAL.has(k);

export const stampOf = (meta) => ({ version: meta ? meta.version : null, baked: (meta && meta.source && meta.source.baked) || null });
const same = (a, b) => !!a && !!b && a.version === b.version && a.baked === b.baked;

// every live release a season may come from, each with its table to the release this code ships with (the newest;
// docs/migration.md). `also`: other bakes of that release with the same numbers; `suspect`: a season stamped with it
// may hold older numbers (v6 shipped with no table and stamped them all the same)
const V7 = { version: 4, baked: '2026-11-01T02:01:48.172Z' };
export const TABLES = [
  { name: 'v3', from: { version: 3, baked: '2026-10-22T02:16:45.493Z' }, to: V7, load: () => import('./migrate/2026-10-22T02-16-45-493Z.json') },
  { name: 'v4', from: { version: 4, baked: '2026-10-27T21:15:39.033Z' }, also: ['2026-10-27T13:09:41.460Z'], to: V7, load: () => import('./migrate/2026-10-27T21-15-39-033Z.json') },
  { name: 'v5', from: { version: 4, baked: '2026-10-31T22:27:14.604Z' }, to: V7, load: () => import('./migrate/2026-10-31T22-27-14-604Z.json') },
  { name: 'v6', from: { version: 4, baked: '2026-10-31T23:37:29.148Z' }, to: V7, suspect: true, load: () => import('./migrate/2026-10-31T23-37-29-148Z.json') },
];
const fromOf = (e, s) => !!s && (same(e.from, s) || (s.version === e.from.version && (e.also || []).includes(s.baked)));

// the release a table goes to, rebaked with the same numbers (a new bake time): its counts and a few records by place
export function sameNumbering(meta, table) {
  const c = table && table.check;
  if (!meta || !c || meta.version !== table.to.version) return false;
  const L = meta.lakes || [], S = meta.campsites || [], P = meta.portages || [];
  if (L.length < c.lakes || S.length !== c.campsites || P.length < c.portages) return false; // (world-fixes may append trails; water edges: a rebake may append water, the canoe routes' channels, after every lake it numbered)
  const near = (a, b) => Math.abs(a - b) <= 2;
  return c.lake.every(([id, x, z]) => { const l = L[id - 1]; return l && l.id === id && near(l.cx, x) && near(l.cz, z); })
    && c.site.every(([i, x, z]) => S[i] && near(S[i].x, x) && near(S[i].z, z))
    && c.trail.every(([i, x, z]) => P[i] && P[i].pts && near(P[i].pts[0][0], x) && near(P[i].pts[0][1], z));
}

// the table's runs as lookups: lake(id) → id | 0, portage(i) / site(i) → i | -1, siteKey / portKey (a moved place's key)
export function mapperOf(t) {
  const dense = (runs, none) => {
    let n = 0; for (let k = 0; k < runs.length; k += 3) n = Math.max(n, runs[k] + runs[k + 2]);
    const a = new Int32Array(n).fill(none);
    for (let k = 0; k < runs.length; k += 3) for (let q = 0; q < runs[k + 2]; q++) a[runs[k] + q] = runs[k + 1] + q;
    return a;
  };
  const L = dense(t.lakes || [], 0), P = dense(t.portages || [], -1), S = dense(t.campsites || [], -1);
  const at = (a, i, none) => (Number.isInteger(i) && i >= 0 && i < a.length ? a[i] : none);
  const ck = t.campKeys || {}, pk = t.portKeys || {};
  return {
    lake: (id) => (id > 0 ? at(L, id, 0) : 0),
    portage: (i) => at(P, i, -1),
    site: (i) => at(S, i, -1),
    siteKey: (k) => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(ck, k) ? ck[k] : k),
    portKey: (k) => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(pk, k) ? pk[k] : k),
    campKeys: ck,
  };
}

// --- explored.js's bitsets: base64 of the bytes up to the last one set ------------------------------------------------
function bitsIds(s) {
  const out = [];
  let t; try { t = atob(String(s || '')); } catch { return out; }
  for (let k = 0; k < t.length; k++) { const v = t.charCodeAt(k); if (v) for (let b = 0; b < 8; b++) if ((v >> b) & 1) out.push(k * 8 + b); }
  return out;
}
function bitsOf(ids) {
  const n = ids.reduce((m, i) => Math.max(m, i), -1);
  if (n < 0) return '';
  const a = new Uint8Array((n >> 3) + 1);
  for (const i of ids) a[i >> 3] |= 1 << (i & 7);
  let s = ''; for (let k = 0; k < a.length; k++) s += String.fromCharCode(a[k]);
  return btoa(s);
}
const remapBits = (s, f, ok, tally) => { const ids = bitsIds(s), to = []; for (const i of ids) { const j = f(i); if (ok(j)) to.push(j); else tally.dropped++; } tally.n += ids.length; return bitsOf([...new Set(to)]); };

// a moved campsite's "x:z" wherever it is a value or a key (the trip's log, the tent, the fire rings, the wood piles,
// the record's camps, the bear's night): those keys are places, so nothing else is ever spelled the same
function deepKeys(v, map) {
  if (typeof v === 'string') return map(v);
  if (Array.isArray(v)) return v.map((x) => deepKeys(x, map));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[map(k)] = deepKeys(x, map); return o; }
  return v;
}

// --- each document ---------------------------------------------------------------------------------------------------
// the notices (tasks.js ads): their sites and trails by index, their lakes by id; the keys the boards dedupe by
const SITE_KINDS = new Set(['item', 'litter', 'canoe']), TRAIL_KINDS = new Set(['survey', 'deadfall']), LAKE_KINDS = new Set(['secchi', 'loons']);
function remapAd(t, M) {
  const c = { ...t };
  if (typeof c.site === 'number') { c.site = M.site(c.site); if (c.site < 0) return null; }
  if (typeof c.portage === 'number') { c.portage = M.portage(c.portage); if (c.portage < 0) return null; }
  if (typeof c.lakeId === 'number' && c.lakeId > 0) { c.lakeId = M.lake(c.lakeId); if (!c.lakeId && (LAKE_KINDS.has(c.kind) || c.kind === 'report')) return null; }
  if (typeof c.lakeHint === 'number' && c.lakeHint > 0) c.lakeHint = M.lake(c.lakeHint);
  if (Array.isArray(c.route)) { c.route = c.route.map((l) => (l && typeof l.id === 'number' ? { ...l, id: M.lake(l.id) } : l)); if (c.route.some((l) => l && l.id === 0)) return null; }
  if (c.target && typeof c.target === 'object' && typeof c.target.lake === 'number') { c.target = { ...c.target, lake: M.lake(c.target.lake) }; if (!c.target.lake && c.target.type === 'sunset') return null; }
  if (SITE_KINDS.has(c.kind) && typeof c.key === 'number') c.key = c.site;
  else if (TRAIL_KINDS.has(c.kind) && typeof c.key === 'number') c.key = c.portage;
  else if (LAKE_KINDS.has(c.kind) && typeof c.key === 'number') c.key = c.lakeId;
  else if (c.kind === 'report' && Array.isArray(c.route)) c.key = c.route.map((l) => l.id).join('>');
  else if (c.kind === 'photo' && typeof c.key === 'string') {
    const m = /^(island|trail|sunset):(\d+)$/.exec(c.key);
    if (m) { const n = +m[2], to = m[1] === 'island' ? M.site(n) : m[1] === 'trail' ? M.portage(n) : M.lake(n); if (to < 0 || (m[1] === 'sunset' && !to)) return null; c.key = `${m[1]}:${to}`; }
  }
  return c;
}
function remapLog(log, M, r) {
  if (!Array.isArray(log)) return log;
  return log.map((e) => { if (e && e.k === 'lake' && typeof e.id === 'number') { r.lakes++; return { ...e, id: M.lake(e.id) }; } return e; });
}
const DOCS = {
  'bwca-canoe:explored'(d, M, r) {
    if (!d || typeof d !== 'object') return d;
    const tl = { n: 0, dropped: 0 }, tp = { n: 0, dropped: 0 }, tc = { n: 0, dropped: 0 };
    const out = { ...d, lakes: remapBits(d.lakes, M.lake, (j) => j > 0, tl), portages: remapBits(d.portages, M.portage, (j) => j >= 0, tp), camps: remapBits(d.camps, M.site, (j) => j >= 0, tc) };
    r.explored = { lakes: tl.n, portages: tp.n, camps: tc.n, dropped: tl.dropped + tp.dropped + tc.dropped };
    return out;
  },
  'bwca-canoe:logbook'(d, M, r) {
    if (!d || typeof d !== 'object' || !d.seen) return d;
    const s = d.seen, uniq = (a) => [...new Set(a)];
    const lakes = Array.isArray(s.lakes) ? s.lakes.map((id) => M.lake(Number(id))).filter((id) => id > 0) : s.lakes;
    r.lakes += Array.isArray(s.lakes) ? s.lakes.length : 0;
    return { ...d, seen: { ...s, lakes: Array.isArray(lakes) ? uniq(lakes) : lakes,
      camps: Array.isArray(s.camps) ? uniq(s.camps.map(M.siteKey)) : s.camps,
      portages: Array.isArray(s.portages) ? uniq(s.portages.map(M.portKey)) : s.portages } };
  },
  'bwca-canoe-trip'(d, M, r) {
    if (!d || typeof d !== 'object') return d;
    const out = { ...d };
    if (out.core && typeof out.core === 'object') out.core = deepKeys({ ...out.core, log: remapLog(out.core.log, M, r) }, M.siteKey);
    if (out.tasks && typeof out.tasks === 'object' && Array.isArray(out.tasks.ads)) {
      const ads = [];
      for (const t of out.tasks.ads) { let c = null; try { c = t ? remapAd(t, M) : null; } catch { c = null; } if (c) ads.push(c); else r.notices++; }
      out.tasks = { ...out.tasks, ads }; // (a board slot whose notice is gone is emptied by tasks.js restore)
    }
    return out;
  },
  'bwca-canoe:stats'(d, M, r) {
    if (!d || typeof d !== 'object') return d;
    const lakes = Array.isArray(d.lakes) ? d.lakes.map((l) => (l && typeof l.id === 'number' ? { ...l, id: M.lake(l.id) } : l)) : d.lakes;
    r.lakes += Array.isArray(d.lakes) ? d.lakes.length : 0;
    return deepKeys({ ...d, lakes }, M.siteKey);
  },
  'bwca-canoe:record'(d, M, r) {
    if (!d || typeof d !== 'object') return d;
    const out = deepKeys(d, M.siteKey);
    if (out.lakes && typeof out.lakes === 'object') {
      const lakes = {};
      for (const [k, q] of Object.entries(out.lakes)) {
        if (!q || typeof q !== 'object') continue;
        const id = /^l\d+$/.test(k) && typeof q.id === 'number' ? M.lake(q.id) : q.id || 0;
        if (!id && !q.name) continue; // an unnamed water with nothing in the new data
        const key = id ? `l${id}` : `n:${q.name}`;
        if (lakes[key]) lakes[key].n = (lakes[key].n || 0) + (q.n || 0); // two old waters in one new lake
        else lakes[key] = { ...q, id };
        r.lakes++;
      }
      out.lakes = lakes;
    }
    if (Array.isArray(out.trips)) out.trips = out.trips.map((c) => (c && Array.isArray(c.lakes) ? { ...c, lakes: c.lakes.map((l) => (l && typeof l.id === 'number' ? { ...l, id: M.lake(l.id) } : l)) } : c));
    return out;
  },
  // the things set down: a pack left at a portage's end keeps its trail by number and first point (packs.js trailKey;
  // its line's first point from the new release, when it is at hand), a pile at a camp by the site's place
  'bwca-canoe:inventory'(d, M, r, meta) {
    if (!d || typeof d !== 'object') return d;
    const P = meta && Array.isArray(meta.portages) ? meta.portages : null;
    const fix = (o) => {
      if (!o || typeof o !== 'object' || !o.at || typeof o.at !== 'object') return o;
      const at = { ...o.at };
      if (typeof at.camp === 'string') at.camp = M.siteKey(at.camp);
      if (at.trail && typeof at.trail === 'object' && typeof at.trail.i === 'number') {
        const j = M.portage(at.trail.i), p0 = j >= 0 && P && P[j] && P[j].pts && P[j].pts[0];
        if (j < 0) { delete at.trail; r.trails++; } // (a trail with no line in the new data: the thing just lies there)
        else at.trail = { ...at.trail, i: j, ...(p0 ? { x: Math.round(p0[0]), z: Math.round(p0[1]) } : {}) };
      }
      return { ...o, at };
    };
    return { ...d, containers: Array.isArray(d.containers) ? d.containers.map(fix) : d.containers, long: Array.isArray(d.long) ? d.long.map(fix) : d.long };
  },
  // the tent, the fire rings and piles, the bear's night: kept by a site's place
  'bwca-canoe:camp': (d, M) => deepKeys(d, M.siteKey),
  'bwca-canoe:chores': (d, M) => deepKeys(d, M.siteKey),
  'bwca-canoe:bear': (d, M) => deepKeys(d, M.siteKey),
};

// a season's keys (raw strings) carried over: a new map, and what was done
export function migrateKeys(keys, table, meta = null) {
  const M = mapperOf(table), out = { ...keys }, report = { lakes: 0, notices: 0, trails: 0, failed: [], explored: null };
  for (const [k, fn] of Object.entries(DOCS)) {
    if (keys[k] == null) continue;
    try {
      const d = JSON.parse(keys[k]);
      out[k] = JSON.stringify(fn(d, M, report, meta));
    } catch (e) { report.failed.push(k); console.warn(`migrate: ${k} left as it was`, e); }
  }
  return { keys: out, report };
}

// --- the damaged seasons: which release a season's numbers are from, by the lake names it keeps beside them ----------
const nameOf = (meta, id) => { const l = id > 0 && meta && Array.isArray(meta.lakes) ? meta.lakes[id - 1] : null; return l ? l.displayName || l.name || null : null; };
export function seasonNames(keys) {
  const out = new Map(), add = (id, name) => { if (Number.isInteger(id) && id > 0 && typeof name === 'string' && name && !out.has(id)) out.set(id, name); };
  const read = (k) => { try { return keys[k] == null ? null : JSON.parse(keys[k]); } catch { return null; } };
  const tr = read('bwca-canoe-trip');
  if (tr && tr.core && Array.isArray(tr.core.log)) for (const e of tr.core.log) if (e && e.k === 'lake') add(e.id, e.name);
  if (tr && tr.tasks && Array.isArray(tr.tasks.ads)) for (const t of tr.tasks.ads) {
    if (t && Array.isArray(t.route)) for (const l of t.route) if (l) add(l.id, l.name);
    if (t && t.target && typeof t.target === 'object') add(t.target.lake, t.target.name);
  }
  const st = read('bwca-canoe:stats');
  if (st && Array.isArray(st.lakes)) for (const l of st.lakes) if (l) add(l.id, l.name);
  const rec = read('bwca-canoe:record');
  if (rec && rec.lakes && typeof rec.lakes === 'object') for (const q of Object.values(rec.lakes)) if (q) add(q.id, q.name);
  if (rec && Array.isArray(rec.trips)) for (const c of rec.trips) if (c && Array.isArray(c.lakes)) for (const l of c.lakes) if (l) add(l.id, l.name);
  return out;
}
// every lake id a season holds (the ink, the logbook, the named ones)
function seasonIds(keys, names) {
  const ids = new Set(names.map(([id]) => id));
  try { const ex = JSON.parse(keys['bwca-canoe:explored']); if (ex && ex.lakes) for (const id of bitsIds(ex.lakes)) if (id > 0) ids.add(id); } catch { /* none */ }
  try { const lb = JSON.parse(keys['bwca-canoe:logbook']); if (lb && lb.seen && Array.isArray(lb.seen.lakes)) for (const id of lb.seen.lakes) if (Number.isInteger(id) && id > 0) ids.add(id); } catch { /* none */ }
  return [...ids];
}
// the lakes (in the loaded release's numbers) of the campsites a season slept at or saw: kept by place ("x:z"), so
// the same in every release, and a site's lake is one the season paddled, so it holds that lake's id too
function campLakes(keys, meta) {
  const S = meta && Array.isArray(meta.campsites) ? meta.campsites : [], at = new Map();
  for (const s of S) if (s && s.lake > 0) at.set(`${Math.round(s.x)}:${Math.round(s.z)}`, s.lake);
  const out = new Set(), add = (k) => {
    if (typeof k !== 'string' || !/^-?\d+:-?\d+$/.test(k)) return;
    let l = at.get(k);
    if (!l) { const [x, z] = k.split(':').map(Number); let bd = 100; for (const s of S) { const d = s && s.lake > 0 ? Math.hypot(s.x - x, s.z - z) : Infinity; if (d < bd) { bd = d; l = s.lake; } } }
    if (l) out.add(l);
  };
  try { const lb = JSON.parse(keys['bwca-canoe:logbook']); if (lb && lb.seen && Array.isArray(lb.seen.camps)) lb.seen.camps.forEach(add); } catch { /* none */ }
  try { const st = JSON.parse(keys['bwca-canoe:stats']); if (st && Array.isArray(st.nights)) for (const n of st.nights) if (n) add(n.key); } catch { /* none */ }
  try { const rec = JSON.parse(keys['bwca-canoe:record']); if (rec && rec.camps && typeof rec.camps === 'object') Object.keys(rec.camps).forEach(add); } catch { /* none */ }
  return [...out];
}
// tables: [{ entry, table }] that go to the loaded release; stamped: the entry of the season's stamp (or none).
// Two tables that send (nearly) every lake the season holds to the same lake are the same to it (v4 and v5 share their
// numbers; the big lakes kept theirs in v6). Otherwise what tells them apart: the named lakes the two send to
// differently named lakes, and the lakes of the sites it camped at that one table finds among the season's lakes and
// the other does not. X beats Y when it gets one of those right and Y none, or at least two and three times as many
// as Y. A season stamped v6 keeps the v6 table unless another beats it; one with a stamp no table knows takes the
// table that beats every other it is not the same as, or none.
export function seasonFrom(keys, meta, tables, stamped) {
  const names = [...seasonNames(keys)], ids = seasonIds(keys, names), camps = campLakes(keys, meta);
  const scored = tables.map(({ entry, table }) => {
    const M = mapperOf(table), to = names.map(([id]) => nameOf(meta, M.lake(id))), got = new Set(ids.map((id) => M.lake(id)));
    const at = camps.map((l) => got.has(l));
    let hits = 0; names.forEach(([, name], k) => { if (to[k] === name) hits++; }); at.forEach((b) => { if (b) hits++; });
    return { entry, table, M, to, at, hits };
  });
  const alike = (X, Y) => { if (!ids.length) return true; let n = 0; for (const id of ids) if (X.M.lake(id) === Y.M.lake(id)) n++; return n >= 0.95 * ids.length; };
  const beats = (X, Y) => {
    let x = 0, y = 0;
    names.forEach(([, name], k) => { if (X.to[k] !== Y.to[k]) { if (X.to[k] === name) x++; else if (Y.to[k] === name) y++; } });
    camps.forEach((_, k) => { if (X.at[k] && !Y.at[k]) x++; else if (Y.at[k] && !X.at[k]) y++; });
    return (x >= 1 && y === 0) || (x >= 2 && x >= 3 * y);
  };
  const own = scored.find((s) => s.entry === stamped) || null, of = names.length + camps.length;
  const ok = own ? scored.filter((X) => X !== own && !alike(X, own) && beats(X, own))
    : scored.filter((X) => scored.every((Y) => Y === X || alike(X, Y) || beats(X, Y)) && X.hits > 0);
  let best = null; for (const s of ok) if (!best || s.hits > best.hits) best = s;
  if (best) return { entry: best.entry, table: best.table, hits: best.hits, of, damaged: true };
  return own ? { entry: own.entry, table: own.table, hits: own.hits, of, damaged: false } : { entry: null, table: null, hits: 0, of, damaged: false };
}

// the live season, once: from the release it was made on to the one loaded (meta: index.json, world.meta)
const loads = new Map();
const loadEntry = (e) => { if (!loads.has(e)) loads.set(e, e.load().then((m) => (m && m.default) || m, () => null)); return loads.get(e); };
let told = false;
const tell = (msg) => { if (!told) { told = true; console.warn(msg); } };
export async function migrateSeason(meta, store = (typeof localStorage !== 'undefined' ? localStorage : null), load = null) {
  try {
    if (!store || !meta) return null;
    // (a table object in place of the loader: that table is the only one)
    const tables = load && typeof load === 'object' ? [{ name: 'given', from: load.from, to: load.to, load: () => Promise.resolve(load) }] : TABLES;
    const get = typeof load === 'function' ? (e) => Promise.resolve().then(() => load(e)).catch(() => null) : loadEntry;
    const now = stampOf(meta), keys = {};
    for (let i = 0; i < store.length; i++) { const k = store.key(i); if (seasonKey(k) && k !== MARK) keys[k] = store.getItem(k); }
    let mark = null; try { mark = JSON.parse(store.getItem(MARK)); } catch { mark = null; }
    if (mark && (typeof mark !== 'object' || mark.version == null)) mark = null;
    const stamp = () => { try { store.setItem(MARK, JSON.stringify(now)); } catch { /* storage full: next load tries again */ } };
    if (same(mark, now)) return { did: false, from: mark, to: now };
    if (!Object.keys(keys).length) { stamp(); return { did: false, from: null, to: now }; } // nothing kept yet: a new season
    // a season with no stamp is from before the stamps: the v3 release
    if (!mark && now.version === 3) { stamp(); return { did: false, from: null, to: now }; }
    const from = mark || TABLES[0].from;
    // a table that goes to the release loaded: its own bake, or a rebake of it with the same numbers
    const goes = async (e) => { if (!e.to || e.to.version !== now.version) return null; const t = await get(e); return t && t.to && (same(t.to, now) || sameNumbering(meta, t)) ? t : null; };
    // a season stamped with another bake of the loaded release's numbers (a rebake): only the stamp
    const onTo = mark ? tables.find((e) => same(e.to, mark)) : null;
    if (onTo && await goes(onTo)) { stamp(); return { did: false, from: mark, to: now }; }
    const stamped = tables.find((e) => fromOf(e, from)) || null;
    let pick = null, damaged = null;
    if (stamped && !stamped.suspect) { const t = await goes(stamped); if (t) pick = { entry: stamped, table: t }; }
    else {
      // stamped v6, or with a stamp no table knows: by the lake names the season keeps
      const all = [];
      for (const e of tables) { const t = await goes(e); if (t) all.push({ entry: e, table: t }); }
      const r = seasonFrom(keys, meta, all, stamped);
      if (r.table) pick = { entry: r.entry, table: r.table };
      if (r.damaged) { damaged = { stamped: from, numbers: r.entry.name, hits: r.hits, of: r.of }; console.warn(`migrate: this season is stamped map data ${from.version} (${from.baked}), but its lake names say its numbers are ${r.entry.name}'s (${r.hits} of ${r.of} lake names and campsites right): carried from ${r.entry.name}`); }
    }
    if (!pick) {
      // (NOT stamped: what it keeps is still in its own release's numbers, and a later release with a table from that
      // release carries it then)
      tell(`migrate: this season was made on map data ${from.version} (${from.baked}) and there is no table from it to ${now.version} (${now.baked}); it is left as it is for a release that has one`);
      return { did: false, from, to: now, left: true };
    }
    const { keys: next, report } = migrateKeys(keys, pick.table, meta);
    for (const [k, v] of Object.entries(next)) if (v !== keys[k]) store.setItem(k, v);
    stamp();
    console.log(`migrate: the season carried from map data ${pick.entry.name} (${pick.table.from.baked}) to ${now.version} (${now.baked}): ${report.lakes} lake records${report.explored ? `, the map's ink (${report.explored.lakes} lakes, ${report.explored.portages} portages, ${report.explored.camps} sites; ${report.explored.dropped} with nothing in the new data)` : ''}${report.notices ? `, ${report.notices} notices whose place is gone` : ''}${report.trails ? `, ${report.trails} things set down on a trail that is gone` : ''}${report.failed.length ? `; left as they were: ${report.failed.join(', ')}` : ''}`);
    return { did: true, from, to: now, via: pick.entry.name, report, ...(damaged ? { damaged } : {}) };
  } catch (e) { console.warn('migrate: the season could not be carried over', e); return null; }
}
