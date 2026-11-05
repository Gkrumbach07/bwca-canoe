// The old primitive areas carried to the real ones (r2, the owner 2026-11-05: "Fix the old saves"). Until 4f5145d the
// ids pma-1 … pma-12 meant twelve made-up areas drawn from the game's data (scripts/gl-a-pma.mjs); since then they mean
// the Forest Service's twelve (src/pma.json). A season played on the old table keeps those ids in its permits (held,
// used, lapsed: { kind: 'pma', pma }), in the trip under way's permit (bwca-canoe-trip core.permit) and in its trail
// survey notices (tasks ads of kind 'pma': pma, pmaName, key, title, text, hint).
//
// The stamp: the permits document's `pmaSet` (PMA_SET, 2: the real twelve; permits.js writes it on every new season).
// A season whose permits say pmaSet 2 is never looked at again. A season with no stamp was played either on the old
// table (a dev build of the game-loop branch, the morning of 2026-11-05) or on the real one before the stamp existed
// (the game loop's first build): its own words tell them apart (the names its survey notices carry; which area its desk
// offered first), and with nothing to tell, a dev host (where alone the old table ever ran) takes it as old, any other
// as new. Old ids are mapped once, by the old area's centre (src/migrate/pma-v1.json): the real area that holds it,
// else the nearest within NEAR, else none:
//   - a permit for an area with none becomes an overnight permit at the same entry point and day; a held one gets a
//     line at the desk next time (permits.takeRedrawn)
//   - a survey notice goes to its real area when its marks still lie inside it (or it is done), else it is dropped
//     (no penalty: it simply leaves the board)
//
//   migratePmas(store, { meta, dev }) → { did, as: 'old' | 'new' | null, why, permits, notices, dropped } | null
//   PMA_MAP: old id → real id | null; OLD_PMAS; PMA_SET
import OLD from './migrate/pma-v1.json';
import { PMAS, pmaById, inPoly } from './pma.js';

export const PMA_SET = 2;
const NEAR = 8000; // m: how far an old area's centre may lie outside the nearest real one and still be carried to it
const PERMITS = 'bwca-canoe:permits', TRIP = 'bwca-canoe-trip';
export const OLD_PMAS = (OLD && Array.isArray(OLD.pmas) ? OLD.pmas : []);
const OLD_BY = new Map(OLD_PMAS.map((p) => [p.id, p]));

const segD = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0;
  return Math.hypot(a[0] + t * dx - x, a[1] + t * dz - z);
};
const distTo = (p, x, z) => { if (inPoly(p.poly, x, z)) return 0; let m = Infinity; for (let i = 0, j = p.poly.length - 1; i < p.poly.length; j = i++) m = Math.min(m, segD(x, z, p.poly[j], p.poly[i])); return m; };
export const PMA_MAP = Object.fromEntries(OLD_PMAS.map((o) => {
  let best = null;
  for (const p of PMAS) { const d = distTo(p, o.centre[0], o.centre[1]); if (!best || d < best.d) best = { id: p.id, d }; }
  return [o.id, best && best.d <= NEAR ? best.id : null];
}));

const OLD_NAMES = new Set(OLD_PMAS.map((p) => p.name)), NEW_NAMES = new Set(PMAS.map((p) => p.name));
// the area a desk at ep offered first under a table (permits.js pmasNear: its own entry point's first, then the nearest)
const firstAt = (table, ep, meta) => {
  const e = meta && Array.isArray(meta.entryPoints) ? meta.entryPoints.find((q) => q.ep === ep) : null; if (!e) return null;
  const key = (a) => (a.near === ep ? -1e9 : 0) + Math.hypot(a.centre[0] - e.x, a.centre[1] - e.z);
  const first = table.slice().sort((a, b) => key(a) - key(b))[0];
  return first ? first.id : null;
};
const isDev = () => { try { return typeof location !== 'undefined' && /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|.+\.localhost|.+\.test)$/.test(location.hostname); } catch { return false; } };
const parse = (s) => { try { return s == null ? null : JSON.parse(s); } catch { return undefined; } };

// the season's words for which table its ids are from: { old, neu }
function evidence(permits, trip, meta) {
  let old = 0, neu = 0;
  const ads = trip && trip.tasks && Array.isArray(trip.tasks.ads) ? trip.tasks.ads : [];
  for (const t of ads) {
    if (!t || t.kind !== 'pma') continue;
    const n = t.pmaName || '';
    if (OLD_NAMES.has(n)) old += 2; else if (NEW_NAMES.has(n)) neu += 2;
  }
  const all = permits ? [...(permits.held || []), ...(permits.used || []), ...(permits.lapsed || [])] : [];
  for (const p of all) {
    if (!p || p.kind !== 'pma' || !p.pma || p.from == null) continue;
    const a = firstAt(OLD_PMAS, Number(p.from), meta), b = firstAt(PMAS, Number(p.from), meta);
    if (a === b) continue;
    if (p.pma === a) old++; else if (p.pma === b) neu++;
  }
  return { old, neu };
}

// one permit carried: its area mapped, or an overnight permit when its area has no real one (told: the held ones' lines)
function carryPermit(p, told) {
  if (!p || typeof p !== 'object' || p.kind !== 'pma' || !p.pma || !OLD_BY.has(p.pma)) return p;
  const to = PMA_MAP[p.pma], was = OLD_BY.get(p.pma).name;
  if (told) told.push({ ep: p.ep, abs: p.abs, to: to ? pmaById(to).name : null });
  return to ? { ...p, pma: to, pmaWas: was } : { ...p, kind: 'overnight', pma: null, pmaWas: was };
}
// a trail survey notice carried to its real area (null: dropped)
function carryNotice(t) {
  if (!t || t.kind !== 'pma' || !t.pma || !OLD_BY.has(t.pma)) return t;
  const to = PMA_MAP[t.pma], q = to ? pmaById(to) : null;
  if (!q) return t.status === 'done' ? t : null;
  const pts = Array.isArray(t.pts) ? t.pts : [];
  if (t.status !== 'done' && !pts.filter((m) => m && !m.seen).every((m) => inPoly(q.poly, m.x, m.z))) return null;
  const name = q.name; // (the words as task-kinds-2.js writes them now)
  return { ...t, pma: to, pmaName: name, key: `pma:${to}`, title: `Trail survey: ${name}`,
    text: `The old trail into the ${name}: walk it and mark where it really goes. Three marks. The primitive-area permit for this one; it isn’t kept up.`,
    hint: t.hint ? { ...t.hint, x: q.centre[0], z: q.centre[1], label: name } : t.hint };
}

export function migratePmas(store = (typeof localStorage !== 'undefined' ? localStorage : null), { meta = null, dev = isDev() } = {}) {
  try {
    if (!store) return null;
    const permits = parse(store.getItem(PERMITS)), trip = parse(store.getItem(TRIP));
    const P = permits && typeof permits === 'object' ? permits : null, T = trip && typeof trip === 'object' ? trip : null;
    if (P && P.pmaSet >= PMA_SET) return { did: false, as: null, why: 'stamped' };
    const stamp = () => { if (P) { P.pmaSet = PMA_SET; store.setItem(PERMITS, JSON.stringify(P)); } };
    const { old, neu } = evidence(P, T, meta);
    const as = old > neu ? 'old' : neu > old ? 'new' : dev ? 'old' : 'new';
    const why = old !== neu ? `its own words (${old} old, ${neu} new)` : dev ? 'nothing to tell them apart, on a dev host' : 'nothing to tell them apart';
    if (as === 'new') { stamp(); return { did: false, as, why }; }
    const report = { did: true, as, why, permits: 0, notices: 0, dropped: 0 };
    if (P) {
      const told = [];
      const arr = (a, tell) => (Array.isArray(a) ? a.map((p) => { const q = carryPermit(p, tell); if (q !== p) report.permits++; return q; }) : a);
      P.held = arr(P.held, told); P.used = arr(P.used, null); P.lapsed = arr(P.lapsed, null);
      if (told.length) P.redrawn = [...(Array.isArray(P.redrawn) ? P.redrawn : []), ...told];
    }
    if (T) {
      let changed = false;
      if (T.core && T.core.permit) { const q = carryPermit(T.core.permit, null); if (q !== T.core.permit) { T.core = { ...T.core, permit: q }; changed = true; report.permits++; } }
      if (T.tasks && Array.isArray(T.tasks.ads)) {
        const ads = [];
        for (const t of T.tasks.ads) {
          const q = carryNotice(t);
          if (q !== t) { changed = true; if (q) report.notices++; else report.dropped++; }
          if (q) ads.push(q);
        }
        T.tasks = { ...T.tasks, ads }; // (a board slot whose notice is gone is emptied by tasks.js restore)
      }
      if (changed) store.setItem(TRIP, JSON.stringify(T));
    }
    stamp();
    if (!report.permits && !report.notices && !report.dropped) return { ...report, did: false };
    console.log(`migrate: the primitive areas redrawn (the season's ids were the old table's, by ${why}): ${report.permits} permits, ${report.notices} notices carried, ${report.dropped} dropped`);
    return report;
  } catch (e) { console.warn('migrate: the primitive areas could not be carried over', e); return null; }
}
