// The milestones (gl-d, the game-loop round, 2026-11-05; docs/plans/campaigns.md "The trip-end screen"): countable goals
// read from the season's record (record.js), each with a title it gives when it is reached. Nothing on the HUD: the
// trip's tally shows the one or two that moved on that trip, and the journal's Trips page lists them all.
//
//   milestonesOf(record) → [{ key, words, title, n, of, done }]   (n capped at of)
//   MILESTONES             the table: { key, words, title, of, read(record) → n }
//
// What each reads (the record's season doc, record.s): the lakes paddled (one a name), the rods carried (each portage
// its rods times the crossings), the species caught (of the six), the months with a night out (May to November), the
// first carries out of one road's landings (the portages leaving the lakes of the entry points on one road: outfitters.js
// roadOf), and the trips.
import { roadOf } from './outfitters.js';

const SPECIES = ['walleye', 'smallmouth', 'pike', 'laketrout', 'crappie', 'perch']; // fishing.js SPECIES
const MONTHS = [4, 5, 6, 7, 8, 9, 10];   // May .. November (Date months)
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000);
const monthOf = (year, doy) => new Date(absDay(year, doy) * 86400000).getUTCMonth();

const lakes = (R) => { const had = new Set(); for (const l of Object.values(R.s.lakes || {})) if (l && l.name) had.add(l.name); return had.size; };
const rods = (R) => Object.values(R.s.portages || {}).reduce((a, p) => a + (p.rods || 0) * (p.n || 1), 0);
const species = (R) => SPECIES.filter((sp) => R.s.fish && R.s.fish[sp]).length;
export function monthsOut(R) {
  const had = new Set();
  for (const t of R.s.trips || []) {
    const y = t.entry && Number.isFinite(t.entry.year) ? t.entry.year : null;
    if (y == null) continue;
    for (const n of t.nights || []) if (Number.isFinite(n.doy)) had.add(monthOf(y, n.doy));
    if (!(t.nights && t.nights.length) && t.counts && t.counts.nights) had.add(monthOf(y, t.entry.doy));
  }
  return MONTHS.filter((m) => had.has(m));
}
// each road's first carries: the portages that leave the lake of an entry point on that road, by name (the record keeps
// portages by name). Worked out once per world.
const ROAD_CACHE = new WeakMap();
export function roadReach(world) {
  if (!world || !Array.isArray(world.entryPoints) || !Array.isArray(world.portages)) return [];
  let r = ROAD_CACHE.get(world);
  if (r) return r;
  const basin = (id) => { const l = id > 0 ? world.lakes[id - 1] : null; return l ? l.basin : -1; };
  const roads = new Map();
  for (const e of world.entryPoints) {
    const name = roadOf(e.ep); if (!name || name === 'the county road') continue;
    if (!roads.has(name)) roads.set(name, new Set());
    const b = basin(e.lake); if (b >= 0) roads.get(name).add(b);
  }
  r = [];
  for (const [name, basins] of roads) {
    const names = new Set();
    for (const p of world.portagesPublic()) {
      if (!p || !p.name || !p.launch) continue;
      if (basins.has(basin(p.launch[0].lake)) || basins.has(basin(p.launch[1].lake))) names.add(p.name);
    }
    if (names.size) r.push({ road: name, names });
  }
  ROAD_CACHE.set(world, r);
  return r;
}
// the road whose first carries you have crossed most of (by share): { road, n, of }
export function bestRoad(R) {
  const crossed = new Set(Object.values(R.s.portages || {}).map((p) => p && p.name).filter(Boolean));
  let best = null;
  for (const q of roadReach(R.world)) {
    let n = 0; for (const nm of q.names) if (crossed.has(nm)) n++;
    const f = n / q.names.size;
    if (!best || f > best.f || (f === best.f && n > best.n)) best = { road: q.road, n, of: q.names.size, f };
  }
  return best;
}
const roadTitle = (road) => `Knows ${road}`;

export const MILESTONES = [
  { key: 'lakes20', words: '20 lakes', title: 'Lake hopper', of: 20, read: lakes },
  { key: 'lakes50', words: '50 lakes', title: 'Old hand', of: 50, read: lakes },
  { key: 'rods1000', words: '1,000 rods carried', title: 'Pack mule', of: 1000, read: rods },
  { key: 'species', words: 'every species', title: 'Angler', of: SPECIES.length, read: species },
  { key: 'months', words: 'a night out in every month, May to November', title: 'All seasons', of: MONTHS.length, read: (R) => monthsOut(R).length },
  { key: 'road', words: 'every first carry off one road', title: null, of: null, read: (R) => (bestRoad(R) || { n: 0 }).n },
  { key: 'trips10', words: '10 trips', title: 'Regular', of: 10, read: (R) => (R.s.trips || []).length },
];

export function milestonesOf(R) {
  if (!R || !R.s) return [];
  const out = [];
  for (const m of MILESTONES) {
    let n = 0, of = m.of, title = m.title, words = m.words;
    try {
      if (m.key === 'road') {
        const b = bestRoad(R);
        if (!b) continue;
        n = b.n; of = b.of; title = roadTitle(b.road); words = `every first carry off ${b.road}`;
      } else n = m.read(R) || 0;
    } catch { n = 0; }
    out.push({ key: m.key, words, title, n: Math.min(n, of), of, done: n >= of });
  }
  return out;
}
// the months still to get a night out in, by name (the journal's line)
export function monthsLeft(R) { const had = new Set(monthsOut(R)); return MONTHS.filter((m) => !had.has(m)).map((m) => MONTH_NAMES[m]); }
