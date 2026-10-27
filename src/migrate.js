// A season carried from one map release to the next (d2 join). The data-v4 release numbers its lakes, campsites and
// portages afresh (Quetico's Ontario lakes in among Minnesota's, the official sites and trails added: Lake One is lake
// 78 in v3 and 103 in v4), and a season keeps those numbers: the map's ink (explored), the logbook's lakes, the trip's
// log, the notices' sites, trails and lakes, the tally, the record and the packs set down at a portage. Positions in metres are the same in both (one
// projection, one grid), so whatever is kept by place carries over as it is, except the few campsites and landings the
// new bake moved.
//
// Each season says which release it was made on: `bwca-canoe:data` = { version, baked } (index.json's `version` and
// `source.baked`), a season key like any other, so it travels with its slot, a parked slot, a copy and an exported
// file. A season with none is from before this (the live v3 release). migrateSeason(meta), run in main.js once the
// world's index is in and before anything reads the season, carries the live season's numbers over once, from
// src/migrate-v3-v4.json (scripts/migrate-v3-v4.mjs; its own chunk, fetched only then), and stamps it. A parked or an
// imported season is carried over the same way when it is next played (it goes live at the page load, save.js mount,
// and this runs before anything reads it). A number with nothing in the new release is dropped (a notice whose site or
// trail is gone leaves the board); a document that cannot be read is left as it was. Nothing here throws.
//
//   migrateSeason(meta, store = localStorage, table?) → { did, from, to, report } | null   (table: the tests')
//   migrateKeys(keys, table, meta?) → { keys, report }    (keys: { 'bwca-canoe:<ns>': raw JSON }, as save.js liveMap)
//   stampOf(meta), MARK, sameNumbering(meta, table), mapperOf(table)

export const MARK = 'bwca-canoe:data';
const SEASON_KEY = /^bwca-canoe[:-]/;
const GLOBAL = new Set(['bwca-canoe:settings', 'bwca-canoe:tripMode', 'bwca-canoe-geo', 'bwca-canoe:fb5-rturn']); // save.js GLOBAL_KEYS
const seasonKey = (k) => typeof k === 'string' && SEASON_KEY.test(k) && !GLOBAL.has(k);

export const stampOf = (meta) => ({ version: meta ? meta.version : null, baked: (meta && meta.source && meta.source.baked) || null });
const same = (a, b) => !!a && !!b && a.version === b.version && a.baked === b.baked;

// the release a table goes to, rebaked with the same numbers (a new bake time): its counts and a few records by place
export function sameNumbering(meta, table) {
  const c = table && table.check;
  if (!meta || !c || meta.version !== table.to.version) return false;
  const L = meta.lakes || [], S = meta.campsites || [], P = meta.portages || [];
  if (L.length !== c.lakes || S.length !== c.campsites || P.length < c.portages) return false; // (world-fixes may append trails)
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

// the live season, once: from the release it was made on to the one loaded (meta: index.json, world.meta)
let tableLoad = null;
const loadTable = () => tableLoad || (tableLoad = import('./migrate-v3-v4.json').then((m) => m.default, () => null));
export async function migrateSeason(meta, store = (typeof localStorage !== 'undefined' ? localStorage : null), given = null) {
  try {
    if (!store || !meta) return null;
    const now = stampOf(meta), keys = {};
    for (let i = 0; i < store.length; i++) { const k = store.key(i); if (seasonKey(k) && k !== MARK) keys[k] = store.getItem(k); }
    let mark = null; try { mark = JSON.parse(store.getItem(MARK)); } catch { mark = null; }
    const stamp = () => { try { store.setItem(MARK, JSON.stringify(now)); } catch { /* storage full: next load tries again */ } };
    if (same(mark, now)) return { did: false, from: mark, to: now };
    if (!Object.keys(keys).length) { stamp(); return { did: false, from: null, to: now }; } // nothing kept yet: a new season
    // a season with no stamp is from before the stamps: the live v3 release
    if (!mark && now.version === 3) { stamp(); return { did: false, from: null, to: now }; }
    const table = given || await loadTable();
    if (!table) { console.warn('migrate: the table did not load; the season is left for the next load'); return null; } // (not stamped: tried again)
    const from = mark && mark.version != null ? mark : table.from;
    if (same(from, now)) { stamp(); return { did: false, from, to: now }; }
    if (!same(from, table.from) || !(same(now, table.to) || sameNumbering(meta, table))) {
      // (stamped all the same: what the season keeps from here on is in this release's numbers)
      console.warn(`migrate: this season was made on map data ${from.version} (${from.baked}) and there is no table from it to ${now.version} (${now.baked}); its lakes, sites and trails keep their old numbers`);
      stamp();
      return { did: false, from, to: now };
    }
    const { keys: next, report } = migrateKeys(keys, table, meta);
    for (const [k, v] of Object.entries(next)) if (v !== keys[k]) store.setItem(k, v);
    stamp();
    console.log(`migrate: the season carried from map data ${from.version} to ${now.version}: ${report.lakes} lake records${report.explored ? `, the map's ink (${report.explored.lakes} lakes, ${report.explored.portages} portages, ${report.explored.camps} sites; ${report.explored.dropped} with nothing in the new data)` : ''}${report.notices ? `, ${report.notices} notices whose place is gone` : ''}${report.trails ? `, ${report.trails} things set down on a trail that is gone` : ''}${report.failed.length ? `; left as they were: ${report.failed.join(', ')}` : ''}`);
    return { did: true, from, to: now, report };
  } catch (e) { console.warn('migrate: the season could not be carried over', e); return null; }
}
