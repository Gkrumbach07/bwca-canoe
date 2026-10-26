// The other parties out in the Boundary Waters (round A-F: the people plan's phase 1, camps; docs/plans/people.md on
// claude/plans-people-coop-37d3f0). The owner, 2026-10-26: "wilderness people".
//
// Where they come from. Every entry point has a daily quota of overnight permits May 1 to September 30 (QUOTA: the
// Forest Service's numbers, as recreation.gov lists them); the parties that go in on a day are the quota times the
// fill: a quarter of it in May, half in June and September, most of it from mid-July to mid-August (FILL), a tenth
// out of the quota season while the lakes are open and none on the ice; Friday and Saturday entries ×1.4, Monday to
// Wednesday ×0.7; and the whole times PARTIES.start (the plan: "start low, tuned down before up") and the Traffic
// setting (quiet · usual · busy, TRAFFIC). A party is a pure function of (entry point, day, slot, season): who they
// are (a pair, friends, a family with kids, a group of up to nine with a guide, a solo; their canoes and tents, one
// per two), how many nights (a family 2–4 near the landing, trippers 3–6, a solo 4–10), and their route: out from the
// landing over the portages one or two at a time (the water graph: basins of connected water joined by portages),
// then back the same way, a night at a lake with sites each time, a layover now and then. Nothing is saved: a reload,
// another client or the same day replayed gives the same people in the same places; a new season gives new people.
//
// Where they camp. Their nights in one basin are a stay at one site. Every stay in a week's block of days (and the
// four weeks before it, so a long trip is counted) is given its site in order of arrival, first come: the free site
// nearest the way they came in and the way they go on (a little seeded jitter), never one already taken that night,
// never yours. Yours (mine()) are your pitched or saved tent's site, and a site where you have set things down or lit
// a fire, from the hour they were first there: a party landing after that goes on to another site, so a party never
// camps on you, and a reload with your camp gives the same camps. A stay holds its site from the hour they land
// (15:00–18:30; the first night after the put-in) to the hour they leave (8:00–10:30). Which water a site is on comes from src/site-lakes.json
// (scripts/site-lakes.mjs reads the release's own tiles), so the schedule never depends on what is loaded round you.
//
// What the world sees. The camps within PARTIES.claimR of you (the dusk note looks 6 km out) hold their sites in the
// campsite registry (camp.js CampRegistry, holder 'party:<id>'): a site reads "Taken" from the water and ashore, and
// the dusk note's nearest free site is one nobody lands at later today (registry.spoken). A camp comes and goes only
// while nobody watches (watched(): within PARTIES.watchR in the view, or within watchNear): a party never pops in
// across the bay as you look. party-camps.js draws them.
//
//   const parties = new Parties({ world, profile, day })
//   parties.attach({ registry, camp, player, camera, settings, inventory, fires })   main.js round A-F
//   parties.update(dt)          after camp.update: the claims within claimR, the registry's spoken hook
//   parties.entering(ep, absDay)   the parties put in at ep on a day: [{ id, ep, day, kind, size, members, canoes,
//                                  tents, nights, stays: [{ id, basin, start, end, land, leave, in, out }], words }]
//   parties.campsAt(absDay, hours)  the stays at a site then: [{ stay, party, site (the world's record), i, key, d? }]
//   parties.live                Map key -> camp: the ones holding their sites now (party-camps.js draws these)
//   parties.partyAt(key), parties.partiesOn(lakeId, absDay), parties.partiesNear(x, z, r), parties.stats()
//
// p2 C, their days on the move (people phase 2; party-moves.js draws them): each stay records the carries of the day
// they came (viaIn) and the party those home (viaOut), without drawing on the schedule's rng. legPlan(party, k) is
// leg k's day as movement, fitted to the schedule's hours: off at the leave hour (the canoes in the water MOVE.launch
// before), the water legs at their pace, each carry in a line (a second trip back for the packs where they outnumber
// the hands), lunch at the carry nearest midday or a stop afloat, in at the next stay's land hour. A pure function of
// the index (the sites, the launches, the trails' lengths), so a reload or another client has them where they were.
//   parties.legsOn(absDay) -> [{ party, k }]   parties.legPlan(party, k)   parties.crewOf(party)
//   parties.arrivalOf(stay), parties.departureOf(stay)   (party-camps.js: the camp comes up as they land)
//   parties.seenIn   stays whose landing you see (party-moves.js): their camp may come up while you look
import { mulberry32 } from './rng.js';
import { seasonAt } from './season.js';
import SITE_LAKES from './site-lakes.json';

// The daily overnight paddle quotas (May 1 – Sep 30) by entry point number. p2 C: checked against the real numbers,
// recreation.gov permit 233396 (BWCAW Overnight Paddle, Motor and Hiking, Superior National Forest): each entry point's
// overnight paddle (OP) division, its daily permit total over June–August 2026, read 2026-10-26 from
// https://www.recreation.gov/api/permits/233396/availability/month joined to /api/permitcontent/233396's divisions.
// Phase 1's table, written from memory, had Lake One 18 (it is 13), Sawbill 14 (11), Seagull 13 (8), Saganaga 12 (15)
// and most small ones a little high. The motor (OM) permits are left out (no motorboats in the game); a restricted
// permit from the same landing is added in: Mudro Lake 22 with 23 (2 + 5), Snowbank 27 with 28 (8 + 1), Little
// Vermilion 12 with 12A, Lac La Croix only (6 + 6).
export const QUOTA = {
  1: 12, 4: 3, 6: 2, 7: 2, 8: 1, 9: 1, 12: 12, 14: 4, 16: 5, 19: 1, 20: 2, 22: 7, 24: 14, 25: 27, 26: 2, 27: 9, 29: 1, 30: 13,
  31: 3, 32: 2, 33: 2, 34: 2, 35: 2, 36: 4, 37: 7, 38: 11, 39: 2, 40: 2, 41: 7, 43: 1, 44: 1, 45: 1, 47: 3, 48: 2, 49: 2,
  50: 3, 51: 5, 52: 4, 54: 8, 55: 15, 57: 3, 58: 2, 60: 2, 61: 1, 62: 2, 64: 3, 66: 1, 67: 1, 68: 1, 69: 1, 70: 2, 75: 1,
  77: 2, 80: 1, 84: 1,
};
const QUOTA_ELSE = 3;          // an entry point not in the table
// the share of the quota that goes in, by day of the year (piecewise between these; the ice takes the rest away)
export const FILL = [[0, 0], [118, 0.08], [121, 0.2], [151, 0.25], [166, 0.4], [182, 0.6], [196, 0.8], [227, 0.8], [244, 0.5], [258, 0.4], [273, 0.25], [274, 0.08], [320, 0.06], [366, 0]];
export const WEEKDAY = [1, 0.7, 0.7, 0.7, 1, 1.4, 1.4]; // Sunday .. Saturday
export const TRAFFIC = { quiet: 0.45, usual: 1, busy: 1.7 }; // the Settings row (settings.js 'traffic')
export const PARTIES = {
  start: 0.5,       // of the fill: where the tuning starts
  lead: 28,         // days before a block whose entries are swept with it (the longest trip and a margin)
  block: 7,         // days a sweep answers for
  claimR: 6500,     // m: camps within this of you hold their sites in the registry
  watchR: 700,      // m: a camp this near, in the view, does not come or go while you look
  watchNear: 90,    // m: nor this near, whichever way you look
  watchCos: 0.34,   // the view's half-width as a cosine (about 70° each side)
  sync: 0.5,        // seconds between the claims' passes
  jump: 0.3,        // game hours: a clock that moves more than this between passes (a night, a rest) settles at once
  jumpM: 400,       // m: and so does a move this far (a teleport, a ride)
  late: [11, 0.15],  // a put-in after this hour adds this to the chance of a first night on the entry lake
};
// who goes: weight, size, nights, km a travel day (first: the put-in day's, from the landing at midday), and how
// often a day out is a layover at the same site instead
export const KINDS = {
  pair: { w: 0.3, size: [2, 2], nights: [2, 5], km: [10, 18], first: [3, 9], layover: 0.2, stayIn: 0.25 },
  friends: { w: 0.26, size: [3, 6], nights: [3, 6], km: [9, 16], first: [3, 9], layover: 0.25, stayIn: 0.3 },
  family: { w: 0.2, size: [3, 5], nights: [2, 4], km: [5, 9], first: [1, 5], layover: 0.35, stayIn: 0.55 },
  group: { w: 0.1, size: [6, 9], nights: [3, 6], km: [8, 13], first: [2, 7], layover: 0.2, stayIn: 0.4 }, // scouts or a church group, a guide with them
  solo: { w: 0.14, size: [1, 1], nights: [4, 10], km: [14, 24], first: [5, 12], layover: 0.1, stayIn: 0.1 },
};
// stayIn: how often the first night is on the entry lake itself, where it has sites (more for a late put-in, PARTIES.late)
const KIND_LIST = Object.keys(KINDS);

// p2 C: a party's travel day as movement (legPlan below; party-moves.js draws it). Speeds are of game time, so a party
// is time-lapsed with the clock as the player is: 4 km/h on the water at life (seen at about 4.4 m/s at Trip, slower
// than you), and on a trail what the player's carry makes good per game hour (0.62 m/s: seen at 2.5 m/s at Trip)
export const MOVE = {
  paddle: 4 / 3.6, paddleMin: 2.8 / 3.6, paddleMax: 5.6 / 3.6, // m/s on the water
  carry: 0.65, back: 0.8,  // m/s on a trail: loaded (a canoe or a pack), and walking back empty for the second load
  detour: 1.22, add: 60,   // a water leg's length: the straight line times this, plus this (m)
  ramp: 25,                // game seconds to get under way and to stop (each end of a water leg)
  launch: 0.25,            // h at the landing before they push off (the canoes in the water, loading)
  land: 0.3,               // h at the landing after they come in, unloading (the camp comes up)
  out: 0.06, in: 0.08,     // h: out of the canoes at a carry, and in again at the far end
  gap: 9,                  // m between carriers on a trail, all at one pace (nobody passes)
  turn: 0.02,              // h at the far end before walking back for the second load
  lunch: [0.4, 1.0], noon: 12.5, // h of lunch, at the carry nearest midday (or drifting on a long crossing)
  pace: { pair: 1, friends: 1, family: 0.86, group: 0.9, solo: 1.08 },
};

export const PARTY = 'party:';
const AREA = 25; // m round a site's ring that are its area (camp.js AREA_R)
export const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000); // as trip.js and tasks.js
const doyOfAbs = (n) => { const d = new Date(n * 86400000), y = d.getUTCFullYear(); return n - absDay(y, 0); };
const seeded = (...n) => mulberry32(n.reduce((h, x, i) => (Math.imul(h ^ ((x | 0) + i * 0x9e3779b9), 2654435761) >>> 0), 0x2a71e5) >>> 0);
const hashStr = (s) => { let h = 2166136261; for (const c of String(s || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const between = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));
const lerp = (a, b, t) => a + (b - a) * t;
const polyLen = (pts) => { let s = 0; for (let i = 1; i < (pts || []).length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
export const siteKey = (c) => `${Math.round(c.x)}:${Math.round(c.z)}`; // camp.js campKey
const FILLS = new Map();
export function fillOn(doy) {
  let f = FILLS.get(doy);
  if (f == null) FILLS.set(doy, (f = fillAt(doy)));
  return f;
}
function fillAt(doy) {
  let k = 1; while (k < FILL.length - 1 && FILL[k][0] < doy) k++;
  const [d0, f0] = FILL[k - 1], [d1, f1] = FILL[k];
  const f = d1 > d0 ? lerp(f0, f1, Math.min(1, Math.max(0, (doy - d0) / (d1 - d0)))) : f1;
  return f * (1 - seasonAt(doy).ice);
}

export class Parties {
  constructor({ world, profile = null, day = null }) {
    this.world = world; this.profile = profile; this.day = day;
    this.registry = null; this.camp = null; this.player = null; this.camera = null; this.settings = null; this.inventory = null; this.fires = null;
    this.mineSig = ''; this.mineList = [];
    this.live = new Map();   // site key -> the camp holding it now: { stay, party, site, i, key }
    this.cache = new Map();  // `${ep}:${day}` -> the parties put in there that day
    this.blocks = new Map(); // block key -> the sweep
    this.t = 0; this.lastNow = null; this.lastAt = null; this.spokenSet = new Set(); this.blocked = new Set();
    this.seenIn = new Set(); // p2 C: stays whose party you see land (party-moves.js): their camp comes up as they unload
    this.sig = '';
    this.index();
  }
  attach({ registry = null, camp = null, player = null, camera = null, settings = null, inventory = null, fires = null } = {}) {
    if (registry) { this.registry = registry; registry.spoken = (key) => this.spokenSet.has(key); }
    if (inventory) this.inventory = inventory;
    if (fires) this.fires = fires;
    if (camp) this.camp = camp;
    if (player) this.player = player;
    if (camera) this.camera = camera;
    if (settings) { this.settings = settings; if (settings.onChange) settings.onChange((k) => { if (k === 'traffic') this.forget(); }); }
    return this;
  }
  get traffic() { const v = this.settings && this.settings.get ? this.settings.get('traffic') : 'usual'; return TRAFFIC[v] ?? 1; }
  get seed() { const p = this.profile || (window.__game && window.__game.profile); return hashStr(p && p.seasonId ? p.seasonId : 'none'); }
  get today() { const d = this.day; return d ? absDay(d.year, d.doy) : 0; }
  forget() { this.cache.clear(); this.blocks.clear(); }

  // --- the world's water and sites, read once -------------------------------------------------------------------
  index() {
    const w = this.world, lakes = w.lakes;
    this.basinOfLake = (id) => { const l = id > 0 ? lakes[id - 1] : null; return l ? l.basin : -1; };
    // which lake each site is on: the release's table (scripts/site-lakes.mjs), else the nearest lake by its size
    const table = SITE_LAKES && SITE_LAKES.for === (w.meta && w.meta.source && w.meta.source.baked) && SITE_LAKES.n === w.campsites.length ? SITE_LAKES.lakes : null;
    // d2 bake: a v4 index carries each site's lake itself (bake.mjs, as site-lakes.mjs made the table for data-v3)
    const own = w.campsites.length && w.campsites.every((c) => Number.isInteger(c.lake)) ? w.campsites.map((c) => c.lake) : null;
    this.siteLake = own ? Int32Array.from(own) : table ? Int32Array.from(table) : this.guessLakes();
    this.basinSites = new Map();
    w.campsites.forEach((c, i) => {
      const b = this.basinOfLake(this.siteLake[i]); if (b < 0) return;
      let l = this.basinSites.get(b); if (!l) this.basinSites.set(b, (l = [])); l.push(i);
    });
    this.keyOf = w.campsites.map(siteKey);
    this.siteOfKey = new Map(this.keyOf.map((k, i) => [k, i]));
    // the water graph: basin -> [{ to, portage, end }] (as tasks.js graph)
    this.adj = new Map();
    const add = (a, b, i, end) => { let l = this.adj.get(a); if (!l) this.adj.set(a, (l = [])); l.push({ to: b, portage: i, end }); };
    w.portages.forEach((p, i) => {
      if (!p.launch || p.launch.length < 2) return;
      const a = this.basinOfLake(p.launch[0].lake), b = this.basinOfLake(p.launch[1].lake);
      if (a < 0 || b < 0 || a === b) return;
      add(a, b, i, 0); add(b, a, i, 1);
    });
    // what a basin offers a party walking into it: its own sites, and half the best next door's
    this.ahead = new Map();
    for (const b of this.adj.keys()) { let best = 0; for (const q of this.adj.get(b)) best = Math.max(best, this.sitesIn(q.to).length); this.ahead.set(b, this.sitesIn(b).length + 0.5 * best); }
    this.eps = w.entryPoints.map((e) =>({ ep: e.ep, name: e.name, x: e.x, z: e.z, lake: e.lake, basin: this.basinOfLake(e.lake) }));
  }
  // (a release without the table: each site on the lake whose round it is nearest, on a 2 km grid of the lakes)
  guessLakes() {
    const w = this.world, G = 2000, grid = new Map(), out = new Int32Array(w.campsites.length);
    for (const l of w.lakes) { if (!l || !(l.cells >= 200)) continue; const k = `${Math.floor(l.cx / G)}:${Math.floor(l.cz / G)}`; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(l); }
    w.campsites.forEach((c, i) => {
      const gx = Math.floor(c.x / G), gz = Math.floor(c.z / G);
      let best = 0, bd = 2500;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) for (const l of grid.get(`${gx + dx}:${gz + dz}`) || []) {
        const d = Math.hypot(l.cx - c.x, l.cz - c.z) - Math.sqrt((l.cells * 100) / Math.PI); if (d < bd) { bd = d; best = l.id; }
      }
      out[i] = best;
    });
    return out;
  }
  sitesIn(basin) { return this.basinSites.get(basin) || []; }

  // --- who goes in where, and when ------------------------------------------------------------------------------
  // how many parties put in at ep on an abs day (a whole number: the seeded share of the fractional part)
  count(ep, d) {
    const doy = doyOfAbs(d), q = QUOTA[ep] ?? QUOTA_ELSE, f = fillOn(doy) * WEEKDAY[(((d + 4) % 7) + 7) % 7] * PARTIES.start * this.traffic;
    if (f <= 0) return 0;
    const r = seeded(ep, d, this.seed, 0x51a7);
    return Math.max(0, Math.floor(q * f * (0.7 + 0.6 * r()) + r()));
  }
  entering(ep, d) {
    const seed = this.seed, key = `${ep}:${d}`;
    if (seed !== this.cacheSeed) { this.cache.clear(); this.cacheSeed = seed; } // (a new season: new people)
    let list = this.cache.get(key);
    if (list) return list;
    const e = this.eps.find((x) => x.ep === ep);
    list = [];
    if (e && e.basin >= 0) { const n = this.count(ep, d); for (let k = 0; k < n; k++) { const p = this.make(e, d, k); if (p) list.push(p); } }
    if (this.cache.size > 6000) this.cache.clear();
    this.cache.set(key, list);
    return list;
  }
  // one party: who, how many, their canoes and tents, their nights and the route
  make(e, d, k) {
    const rng = seeded(e.ep, d, k, this.seed, 0x9a71);
    let x = rng() * KIND_LIST.reduce((s, q) => s + KINDS[q].w, 0), kind = KIND_LIST[0];
    for (const q of KIND_LIST) { x -= KINDS[q].w; if (x <= 0) { kind = q; break; } }
    const K = KINDS[kind], size = between(rng, K.size), nights = between(rng, K.nights);
    const members = [];
    for (let i = 0; i < size; i++) {
      const kid = kind === 'family' && i >= 2, young = kind === 'group' && i >= 1;
      members.push({ female: rng() < (kid ? 0.5 : 0.45), age: kid ? 'kid' : young ? (rng() < 0.6 ? 'young' : 'adult') : kind === 'solo' && rng() < 0.3 ? 'old' : 'adult' });
    }
    // (p2 C: a family's kids ride in the middle, so three or five of them take two canoes, not three)
    const canoes = size === 1 ? 1 : Math.min(4, Math.ceil(size / (size >= 7 || kind === 'family' ? 2.5 : 2)));
    const tents = size === 1 ? 1 : Math.min(4, Math.ceil(size / 2));
    const id = `${e.ep}-${d}-${k}`;
    const party = { id, holder: PARTY + id, ep: e.ep, day: d, slot: k, kind, size, members, canoes, tents, nights, stays: [], putIn: 8.5 + rng() * 4, look: rng() };
    party.stays = this.route(party, e, rng);
    party.exit = party.stays.length ? party.stays[party.stays.length - 1].end : d;
    return party;
  }
  // the nights' route: out over the portages a few at a time to a lake with sites, then back the same way
  route(party, e, rng) {
    const K = KINDS[party.kind], visited = new Set([e.basin]), out = Math.ceil(party.nights / 2), O = [];
    let b = e.basin, at = { x: e.x, z: e.z };
    // (p2 C: each outbound entry keeps the carries that brought it from the one before, `via`; a layover none. None of
    // this draws on the rng, so the schedule is what phase 1 made)
    const stay = (o) => ({ ...o, via: [] });
    for (let i = 0; i < out; i++) {
      if (i > 0 && rng() < K.layover) { O.push(stay(O[O.length - 1])); continue; } // a day at the same site
      const km = i === 0 ? between(rng, K.first) : between(rng, K.km);
      // (a busy landing on a lake of few sites, Moose Lake's 27 a day for seven, sends most of them on)
      const room = Math.min(1, this.sitesIn(b).length / Math.max(1, (QUOTA[e.ep] ?? QUOTA_ELSE) * 0.6));
      const stayIn = i === 0 && this.sitesIn(b).length && rng() < (K.stayIn + (party.putIn > PARTIES.late[0] ? PARTIES.late[1] : 0)) * room;
      const w = stayIn ? { basin: b, in: null, firstOut: null, via: [] } : this.walk(b, km * 1000, visited, rng, at, i === 0 ? room : 1, e);
      if (!this.sitesIn(w.basin).length) { if (!O.length) return []; O.push(stay(O[O.length - 1])); continue; } // nowhere to camp out there: a layover
      if (O.length && w.basin !== b) O[O.length - 1].out = w.firstOut;
      if (w.basin === b && O.length) { O.push(stay(O[O.length - 1])); continue; }
      O.push({ basin: w.basin, in: w.in || at, out: null, via: w.basin === b ? [] : w.via });
      b = w.basin; at = w.in || at;
    }
    for (const o of O) o.out = o.out || o.in;
    // night by night: out, then back (a layover at the far end, then the outbound basins in turn)
    const nightly = [];
    for (let i = 0; i < party.nights; i++) {
      if (i < out) nightly.push({ ...O[i], oi: i });
      else { const oi = Math.max(0, out - 1 - (i - out)), o = O[oi]; nightly.push({ basin: o.basin, in: o.out, out: o.in, oi }); }
    }
    // p2 C: the carries from the outbound entry a to b (b > a: on out; b < a: back the way they came, each carry turned)
    const between2 = (a, b2) => {
      const out2 = [];
      if (b2 > a) for (let j = a + 1; j <= b2; j++) out2.push(...O[j].via);
      else for (let j = a; j > b2; j--) for (const c of O[j].via.slice().reverse()) out2.push({ p: c.p, end: 1 - c.end });
      return out2;
    };
    // a run of nights in one basin is one stay at one site
    const stays = [];
    for (let i = 0; i < nightly.length; i++) {
      const n = nightly[i], last = stays[stays.length - 1];
      if (last && last.basin === n.basin) { last.end++; last.oi = n.oi; continue; }
      const land = i === 0 ? Math.min(18.5, Math.max(party.putIn + 2, 14.5 + rng() * 3.5)) : 15 + rng() * 3.5;
      // (p2 C: viaIn, the carries of the day they came: from the landing, or from the stay before)
      const viaIn = last ? between2(last.oi, n.oi) : between2(-1, n.oi);
      stays.push({ id: `${party.id}/${i}`, party, basin: n.basin, start: party.day + i, end: party.day + i + 1, land, leave: 0, in: n.in, out: n.out, seed: rng() * 1e9, oi: n.oi, viaIn });
    }
    for (const s of stays) s.leave = 8 + rng() * 2.5;
    party.viaOut = stays.length ? between2(stays[stays.length - 1].oi, -1) : []; // p2 C: the carries home
    return stays;
  }
  // A day's travel: about `metres` on from `at` in basin b (across the water to a portage's landing, over the carry),
  // never back over the way (sites ahead weigh more), to a basin with sites (a pond between two carries is crossed);
  // it stops short rather than run far past the day's distance where it can camp
  walk(b, metres, visited, rng, at, room = 1, home = at) {
    let cur = b, firstOut = null, inPt = null, pos = at, gone = 0;
    const via = []; // p2 C: the carries crossed, in order ({ p: portage index, end: the launch they start from })
    for (let s = 0; s < 10; s++) {
      const camps = this.sitesIn(cur).length > 0;
      if (camps && gone >= metres * 0.6) break;
      const edges = (this.adj.get(cur) || []).filter((q) => !visited.has(q.to));
      if (!edges.length) break;
      // (sites there or just beyond weigh more, and so does a carry that takes them further in from the landing)
      const wt = edges.map((q) => {
        const n = this.ahead.get(q.to) || 0, P = this.world.portages[q.portage], h = P.launch[q.end], t = P.launch[1 - q.end];
        const away = Math.min(2.2, Math.max(0.4, 1 + (Math.hypot(t.x - home.x, t.z - home.z) - Math.hypot(h.x - home.x, h.z - home.z)) / 1500));
        return (n ? 1.5 + Math.min(1.5, n / 8) : 0.7) * (1 + 0.08 * Math.min(6, (this.adj.get(q.to) || []).length)) * away;
      });
      let r = rng() * wt.reduce((a, c) => a + c, 0), j = 0;
      for (; j < edges.length - 1; j++) { r -= wt[j]; if (r <= 0) break; }
      const q = edges[j], P = this.world.portages[q.portage], here = P.launch[q.end], there = P.launch[1 - q.end];
      const leg = Math.hypot(here.x - pos.x, here.z - pos.z) + (P.lengthM || 0);
      if (camps && gone + leg > metres && (s > 0 || rng() < room)) break; // the next carry would take the day past its distance: camp here (the busy landing: on, mostly)
      if (!firstOut) firstOut = { x: here.x, z: here.z };
      inPt = { x: there.x, z: there.z }; pos = inPt; gone += leg;
      visited.add(q.to); cur = q.to;
      via.push({ p: q.portage, end: q.end });
    }
    return { basin: cur, in: inPt, firstOut, gone, via };
  }
  // how much a stay likes each site of its basin (lower is better): nearest the way in and the way on, a little jitter
  prefs(s) {
    if (s.prefs) return s.prefs;
    const w = this.world, rng = mulberry32(s.seed >>> 0), sites = this.sitesIn(s.basin), score = new Float32Array(sites.length);
    for (let k = 0; k < sites.length; k++) { const c = w.campsites[sites[k]]; score[k] = Math.hypot(c.x - s.in.x, c.z - s.in.z) + 0.7 * Math.hypot(c.x - s.out.x, c.z - s.out.z) + rng() * 700; }
    return (s.prefs = score);
  }

  // --- the sweep: every stay of a block given its site, first come -----------------------------------------------
  // abs game hours from the day cycle's (doy * 24 + hours, as camp.js and fire.js keep them) and back
  absHours(h) { const d = this.day; return h + (this.today - d.doy) * 24; }
  // your site: the pitched tent's (or the saved one waiting for its ground), and since when (abs game hours)
  playerSite() {
    const c = this.camp, t = c && (c.camp || c.pending), key = t && t.key;
    if (!key) return null;
    const i = this.siteOfKey.get(key); if (i == null) return null;
    return { i, key, since: Number.isFinite(t.since) ? this.absHours(t.since) : this.today * 24 };
  }
  // Every site that is yours: your tent's, and one where you have left things (set down on the ground within its area,
  // or a fire of yours in its ring), from the hour they were first seen there: a party landing after that goes on to
  // another site, one camped there before keeps it (first come). A thing set down is stamped with that hour in its own
  // record (at.firstAt, saved with the inventory), so a reload knows who was first. [{ i, key, since (abs hours) }]
  mine() {
    const out = [], me = this.playerSite(), inv = this.inventory, nowH = this.today * 24 + (this.day ? this.day.hours : 0);
    if (me) out.push(me);
    const spots = [];
    if (inv && inv.attached) {
      for (const c of inv.containers) {
        const k = inv.root ? inv.root(c) : c;
        if (!k || k.where !== 'ground' || !k.at || !Number.isFinite(k.at.x)) continue;
        if ((c.item === 'firefuel' || c.item === 'grate') && !c.grid.length) continue; // (an empty ring's bin is the site's, not yours)
        spots.push({ x: k.at.x, z: k.at.z, at: k.at });
      }
    }
    if (this.fires) for (const f of this.fires.fires.values()) if (!f.party && f.at && f.lit > -1e8) spots.push({ x: f.at.x, z: f.at.z, since: this.absHours(f.lit) });
    const p = this.player, near = PARTIES.claimR + 500;
    for (const s of spots) {
      if (p && (Math.abs(s.x - p.x) > near || Math.abs(s.z - p.z) > near)) continue; // (only round you: further off, it waits till you come)
      const i = this.siteNear(s.x, s.z, AREA);
      if (i < 0) continue;
      if (s.at && !Number.isFinite(s.at.firstAt)) { s.at.firstAt = nowH; inv.dirty = true; } // (written with the inventory's next save)
      const since = s.at ? s.at.firstAt : s.since, o = out.find((q) => q.i === i);
      if (o) { o.since = Math.min(o.since, since); continue; }
      out.push({ i, key: this.keyOf[i], since });
    }
    return out;
  }
  // the site whose ring (its record before its tile is in) is within r of (x, z), nearest; -1 for none
  siteNear(x, z, r) {
    const w = this.world; let best = -1, bd = r;
    w.campsites.forEach((c, i) => { const f = c.layout ? c.layout.fire : c, d = Math.abs(f.x - x) < bd && Math.abs(f.z - z) < bd ? Math.hypot(f.x - x, f.z - z) : Infinity; if (d < bd) { bd = d; best = i; } });
    return best;
  }
  block(T) {
    const B = PARTIES.block, b = Math.floor(T / B), mine = this.mineList;
    const key = `${b}|${this.seed}|${this.traffic}|${this.mineSig}`;
    let blk = this.blocks.get(key);
    if (blk) return blk;
    const from = b * B - PARTIES.lead, to = b * B + B, byBasin = new Map(), stays = [];
    for (let d = from; d < to; d++) for (const e of this.eps) for (const p of this.entering(e.ep, d)) for (const s of p.stays) {
      if (s.end < from) continue;
      stays.push(s); let l = byBasin.get(s.basin); if (!l) byBasin.set(s.basin, (l = [])); l.push(s);
    }
    const site = new Map();
    for (const list of byBasin.values()) {
      list.sort((a, c) => a.start - c.start || a.land - c.land || (a.id < c.id ? -1 : 1));
      const occ = new Map(); // site index -> the abs day it is let go (the morning they leave)
      for (const s of list) {
        for (const [i, end] of occ) if (end <= s.start) occ.delete(i);
        // the best liked of the free ones, never yours
        const sites = this.sitesIn(s.basin), score = this.prefs(s);
        let pick = -1, best = Infinity;
        for (let k = 0; k < sites.length; k++) {
          const i = sites[k];
          if (score[k] >= best || occ.has(i) || (mine.length && mine.some((m) => m.i === i && s.start * 24 + s.land > m.since))) continue;
          best = score[k]; pick = i;
        }
        site.set(s, pick);
        if (pick >= 0) occ.set(pick, s.end);
      }
    }
    blk = { b, from, to, stays, site, key };
    if (this.blocks.size > 4) this.blocks.delete(this.blocks.keys().next().value);
    this.blocks.set(key, blk);
    return blk;
  }
  // the stays at a site at (abs day, hour of the day): [{ stay, party, i, site, key }]
  campsAt(T, h) {
    const blk = this.block(T), w = this.world, out = [];
    for (const s of blk.stays) {
      if (s.start > T || s.end < T) continue;
      if (s.start === T && h < s.land) continue;
      if (s.end === T && h >= s.leave) continue;
      const i = blk.site.get(s); if (i == null || i < 0) continue;
      out.push({ stay: s, party: s.party, i, site: w.campsites[i], key: this.keyOf[i] });
    }
    return out;
  }
  // the sites someone lands at later today (the dusk note leaves them be: CampRegistry.spoken)
  spokenOn(T, h) {
    const blk = this.block(T), out = new Set();
    for (const s of blk.stays) if (s.start === T && h < s.land) { const i = blk.site.get(s); if (i >= 0) out.add(this.keyOf[i]); }
    return out;
  }

  // --- the claims: what the registry holds round you --------------------------------------------------------------
  // a site you could be looking at: near, or within watchR in the view
  watched(site) {
    const p = this.player, cam = this.camera;
    if (!p) return false;
    const dx = site.x - p.x, dz = site.z - p.z, d = Math.hypot(dx, dz);
    if (d < PARTIES.watchNear) return true;
    if (d > PARTIES.watchR || !cam) return false;
    const e = cam.matrixWorld.elements, fx = -e[8], fz = -e[10], fl = Math.hypot(fx, fz) || 1;
    return (dx * fx + dz * fz) / (d * fl) > PARTIES.watchCos;
  }
  update(dt) {
    if ((this.t += dt) < PARTIES.sync || !this.registry || !this.day || !this.player) return;
    this.t = 0;
    const d = this.day, T = this.today, h = d.hours, now = T * 24 + h, p = this.player, reg = this.registry;
    const jump = this.lastNow == null || Math.abs(now - this.lastNow) > PARTIES.jump || !this.lastAt || Math.hypot(p.x - this.lastAt.x, p.z - this.lastAt.z) > PARTIES.jumpM;
    this.lastNow = now; this.lastAt = { x: p.x, z: p.z };
    // your sites (your tent's, your things'): an input to the sweep, which is made again when they change
    const mine = this.mine(), sig = mine.map((m) => `${m.i}@${m.since}`).sort().join(',');
    if (sig !== this.mineSig) { this.mineSig = sig; this.mineList = mine; }
    const R = PARTIES.claimR, want = new Map();
    for (const c of this.campsAt(T, h)) { const dx = c.site.x - p.x, dz = c.site.z - p.z; if (dx < R && dx > -R && dz < R && dz > -R && dx * dx + dz * dz < R * R) want.set(c.key, c); }
    // gone (they left, or the plan moved them): let the site go once nobody is looking
    for (const [key, c] of [...this.live]) {
      const w = want.get(key);
      if (w && w.party === c.party) { this.live.set(key, w); continue; }
      if (!jump && this.watched(c.site)) continue;
      reg.release(key, c.party.holder); this.live.delete(key);
    }
    // come: claim it, unless someone is there first (you: they go on to another site) or you are watching
    this.blocked.clear();
    for (const [key, c] of want) {
      if (this.live.has(key)) continue;
      const hd = reg.holder(key);
      if (hd) { if (hd !== c.party.holder) this.blocked.add(c.stay.id); else this.live.set(key, c); continue; }
      if (!jump && this.watched(c.site) && !this.seenIn.has(c.stay.id)) continue; // (p2 C: unless you saw them come in)
      if (reg.claim(key, c.party.holder)) this.live.set(key, c);
    }
    this.spokenSet = this.spokenOn(T, h);
    for (const key of this.live.keys()) this.spokenSet.delete(key);
  }

  // --- p2 C: the days on the move ------------------------------------------------------------------------------
  // Who sits where and who carries what, from the party's id (its own rng, so the schedule's is untouched): boats
  // [[member index, ...]] (stern, bow, then the middle: the able ones in the sterns first, the kids in the middle), the
  // packs, whether a canoe's carrier wears a pack too (yoke and pack), each canoe's hull, and the carry: who takes what
  // over first, and who walks back for the second load where the packs outnumber the hands
  crewOf(party) {
    if (party.crew) return party.crew;
    const r = seeded(hashStr(party.id), 0xc4e3), n = Math.max(1, party.canoes), M = party.members;
    const able = M.map((m, i) => i).filter((i) => M[i].age !== 'kid'), kids = M.map((m, i) => i).filter((i) => M[i].age === 'kid');
    const order = [...able, ...kids], boats = Array.from({ length: n }, () => []);
    order.forEach((i, j) => boats[j % n].push(i));
    const light = /^(pair|solo|friends)$/.test(party.kind) && r() < 0.35;
    const packs = Math.max(1, Math.round(M.length * (light ? 0.75 : 1.1) + (light ? 0 : 0.5)));
    const yokePack = r() < 0.6, same = party.kind === 'group' && r() < 0.7; // (a group's canoes from one outfitter)
    const hullOf = () => { const x = r(); return x < 0.55 ? 'aluminium' : x < 0.86 ? 'kevlar' : 'forest'; };
    const h0 = hullOf(), hulls = boats.map(() => (same ? h0 : hullOf()));
    // the carry: the sterns take the canoes (a pack on their backs too when yokePack), the other able ones a pack each,
    // the kids walk; the packs left over go on a second trip, carried by the pack carriers first, then the canoes'
    let left = packs;
    const loads = new Map(), first = [];
    boats.forEach((b, c) => { const i = b[0]; const pk = yokePack && left > 0 && M[i].age !== 'kid'; if (pk) left--; loads.set(i, { canoe: c, pack: pk }); first.push(i); });
    for (const i of able) if (!loads.has(i)) { const pk = left > 0; if (pk) left--; loads.set(i, { canoe: null, pack: pk }); first.push(i); }
    for (const i of kids) if (!loads.has(i)) { loads.set(i, { canoe: null, pack: false }); first.push(i); }
    const second = [];
    for (const i of [...able.filter((i) => loads.get(i).canoe == null), ...able.filter((i) => loads.get(i).canoe != null)]) { if (left <= 0) break; second.push(i); left--; }
    return (party.crew = { boats, hulls, packs, light, yokePack, loads, first, second, pace: (MOVE.pace[party.kind] || 1) * (0.92 + 0.16 * r()), lunch: MOVE.lunch[0] + r() * (MOVE.lunch[1] - MOVE.lunch[0]), r: r() });
  }
  // one carry's own clock (seconds from the moment they land at its near end): each person's walks, the canoes lifted and
  // set down, and when the last of them is over. Everyone loaded goes at one pace in a line MOVE.gap apart, so nobody
  // passes; the second trip walks back as each comes in, and goes over again in the order they came
  carrySchedule(crew, L) {
    const v = MOVE.carry, vb = MOVE.back, u = MOVE.out * 3600, gap = MOVE.gap / v, people = new Map(), boats = [];
    let done = u, lastStart = u;
    crew.first.forEach((i, j) => {
      const ld = crew.loads.get(i), s = u + j * gap, e = s + L / v;
      people.set(i, [{ kind: ld.canoe != null ? 'carry' : 'walk', dir: 1, s, e, canoe: ld.canoe, pack: ld.pack }]);
      if (ld.canoe != null) boats[ld.canoe] = { lift: s, down: e };
      done = Math.max(done, e); lastStart = s;
    });
    let prev = -Infinity;
    const back = crew.second.slice().sort((a, b) => people.get(a)[0].e - people.get(b)[0].e);
    for (const i of back) {
      const w = people.get(i), b0 = w[0].e + MOVE.turn * 3600, b1 = b0 + L / vb;
      const s2 = Math.max(b1, prev + gap, lastStart + gap), e2 = s2 + L / v;
      w.push({ kind: 'walk', dir: -1, s: b0, e: b1, canoe: null, pack: false }, { kind: 'walk', dir: 1, s: s2, e: e2, canoe: null, pack: true });
      prev = s2; done = Math.max(done, e2);
    }
    return { L, people, boats, done, trips: back.length ? 2 : 1 };
  }
  // the day each leg is paddled: leg k of a party runs from the landing (k 0) or stay k-1's site, to stay k's site or,
  // for k = stays.length, home to the landing. On (abs day T): [{ party, k }]
  legsOn(T) {
    const blk = this.block(T), key = `${blk.key}|${T}`;
    if (this.legsKey === key) return this.legsList;
    const out = [], seen = new Set();
    for (const s of blk.stays) {
      const p = s.party;
      if (s.start === T) out.push({ party: p, k: p.stays.indexOf(s) });
      if (p.exit === T && !seen.has(p)) { seen.add(p); out.push({ party: p, k: p.stays.length }); }
    }
    this.legsKey = key; this.legsList = out;
    return out;
  }
  // The plan of leg k: where they push off and land, the water legs and the carries between, and the clock of it, fitted
  // to the schedule's hours: away at the stay's leave hour (the put-in's for the first) and in at the next stay's land
  // hour, at their pace with lunch at the carry nearest midday (or drifting, on a day of one long crossing); slower where
  // the day is long, faster (to MOVE.paddleMax) where it is short, and in late only past that. Pure of the world's index
  // (the sites, the carries' launches and lengths), so a reload or another client has them at the same place at the same
  // hour; party-moves.js puts the water legs on the lakes. Null when an end has no site (a night with nowhere free).
  //   { id, party, k, day, from, to, start, arrive, end, v, crew, segs: [{ kind: 'launch' | 'paddle' | 'drift' | 'carry' |
  //     'landing' | 'land', h0, h1, ... }], box: [x0, z0, x1, z1] }  (hours of the day)
  legPlan(party, k) {
    const n = party.stays.length;
    if (!(k >= 0 && k <= n)) return null;
    const day = k < n ? party.stays[k].start : party.exit, blk = this.block(day);
    const memo = party.legPlans || (party.legPlans = []), m = memo[k];
    if (m && m.key === blk.key) return m.plan;
    const plan = this.makeLeg(party, k, day, blk);
    memo[k] = { key: blk.key, plan };
    return plan;
  }
  makeLeg(party, k, day, blk) {
    const w = this.world, n = party.stays.length, e = this.eps.find((x) => x.ep === party.ep);
    if (!e) return null;
    const siteEnd = (s) => { const i = blk.site.get(s); if (i == null || i < 0) return null; const c = w.campsites[i]; return { kind: 'site', i, x: c.x, z: c.z, stay: s, key: this.keyOf[i] }; };
    const from = k === 0 ? { kind: 'ep', ep: e.ep, x: e.x, z: e.z } : siteEnd(party.stays[k - 1]);
    const to = k === n ? { kind: 'ep', ep: e.ep, x: e.x, z: e.z } : siteEnd(party.stays[k]);
    if (!from || !to) return null;
    const crew = this.crewOf(party), chain = k < n ? party.stays[k].viaIn : party.viaOut || [];
    const start = k === 0 ? party.putIn : party.stays[k - 1].leave, due = k < n ? party.stays[k].land : null;
    // the parts in order: water, a carry, water, ... water
    const parts = [], waterLeg = (a, b) => { const d = Math.hypot(b.x - a.x, b.z - a.z); return { kind: 'paddle', a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z }, dist: d < 25 ? 0 : d * MOVE.detour + MOVE.add }; };
    let at = from;
    for (const c of chain) {
      const P = w.portages[c.p]; if (!P || !P.launch) return null;
      const near = P.launch[c.end], far = P.launch[1 - c.end];
      parts.push(waterLeg(at, near));
      const L = P.lengthM > 0 ? P.lengthM : polyLen(P.pts);
      parts.push({ kind: 'carry', p: c.p, end: c.end, a: { x: near.x, z: near.z }, b: { x: far.x, z: far.z }, L, sched: this.carrySchedule(crew, L) });
      at = far;
    }
    parts.push(waterLeg(at, to));
    const water = parts.filter((q) => q.kind === 'paddle' && q.dist > 0), carries = parts.filter((q) => q.kind === 'carry');
    const P = water.reduce((s, q) => s + q.dist, 0);
    const fixed = carries.reduce((s, q) => s + q.sched.done + MOVE.in * 3600, 0) + water.length * MOVE.ramp * 2;
    const v0 = MOVE.paddle * crew.pace, wantLunch = carries.length > 0 || P > 2500;
    let v = v0, rest = 0, late = 0;
    if (due != null) {
      const W = (due - start) * 3600, slack = W - fixed - P / v0;
      if (slack >= 0) {
        // half the time to spare goes into an easier pace (to MOVE.paddleMin), the rest into stops
        v = P > 0 ? Math.max(MOVE.paddleMin, P / (P / v0 + slack / 2)) : v0;
        rest = Math.max(0, W - fixed - (P > 0 ? P / v : 0));
      } else {
        v = P > 0 ? Math.min(MOVE.paddleMax, Math.max(v0, P / Math.max(60, W - fixed))) : v0;
        late = Math.max(0, fixed + (P > 0 ? P / v : 0) - W);
      }
    } else if (wantLunch && start < MOVE.noon - 1) rest = crew.lunch * 0.6 * 3600;
    // the stops: lunch at the far end of the carry nearest midday (by the times without it), up to an hour and a half;
    // the rest afloat on the longest water leg, a line over the side (up to three stops)
    let lunchAt = null, lunch = 0;
    if (rest > 0 && carries.length) {
      let t = start * 3600, best = Infinity;
      for (const q of parts) {
        if (q.kind === 'paddle') t += q.dist > 0 ? q.dist / v + MOVE.ramp * 2 : 0;
        else { t += q.sched.done; const d = Math.abs(t / 3600 - MOVE.noon); if (d < best) { best = d; lunchAt = q; } t += MOVE.in * 3600; }
      }
      lunch = Math.min(rest, Math.max(crew.lunch, 1.5) * 3600);
    }
    if (rest - lunch > 60 && water.length) water.reduce((a, b) => (b.dist > a.dist ? b : a), water[0]).drift = rest - lunch;
    else lunch = rest; // (a minute left over: at the landing)
    // the clock of it
    const segs = [], H = (s) => s / 3600;
    let t = start;
    segs.push({ kind: 'launch', h0: start - MOVE.launch, h1: start, at: from });
    for (const q of parts) {
      if (q.kind === 'paddle') {
        if (!(q.dist > 0)) continue;
        const stops = q.drift > 0 ? (q.drift > 3 * 3600 ? 3 : q.drift > 1.5 * 3600 ? 2 : 1) : 0;
        // the leg in stops + 1 pieces with a drift between each (lunch afloat, a line over the side)
        for (let j = 0; j <= stops; j++) {
          const u0 = j / (stops + 1), u1 = (j + 1) / (stops + 1);
          segs.push({ kind: 'paddle', h0: t, h1: (t += H((q.dist * (u1 - u0)) / v + MOVE.ramp * 2)), a: q.a, b: q.b, u0, u1, dist: q.dist, v });
          if (j < stops) segs.push({ kind: 'drift', h0: t, h1: (t += H(Math.max(0, q.drift - stops * MOVE.ramp * 2) / stops)), a: q.a, b: q.b, u: u1 }); // (each stop's own ramps come out of it)
        }
      } else {
        segs.push({ kind: 'carry', h0: t, h1: (t += H(q.sched.done)), p: q.p, end: q.end, a: q.a, b: q.b, L: q.L, sched: q.sched });
        const stay = q === lunchAt ? lunch : 0, h0 = t;
        t += H(stay + MOVE.in * 3600);
        segs.push({ kind: 'landing', h0, h1: t, p: q.p, end: q.end, at: q.b, inAt: t - MOVE.in, lunch: stay > 0 });
      }
    }
    const arrive = t;
    segs.push({ kind: 'land', h0: arrive, h1: arrive + MOVE.land, at: to });
    let x0 = Math.min(from.x, to.x), z0 = Math.min(from.z, to.z), x1 = Math.max(from.x, to.x), z1 = Math.max(from.z, to.z);
    for (const q of carries) for (const pt of [q.a, q.b]) { x0 = Math.min(x0, pt.x); z0 = Math.min(z0, pt.z); x1 = Math.max(x1, pt.x); z1 = Math.max(z1, pt.z); }
    return { id: `${party.id}#${k}`, party, k, day, from, to, start, arrive, end: arrive + MOVE.land, due, late: H(late), v, crew, segs, box: [x0, z0, x1, z1] };
  }
  // when a stay's party comes in to its site (the hour of the day its plan lands; the schedule's land hour without one)
  // and when they push off from it (the canoes go in the water MOVE.launch before the leave hour): party-camps.js
  arrivalOf(stay) { const p = stay.party, k = p.stays.indexOf(stay), plan = k >= 0 ? this.legPlan(p, k) : null; return plan ? plan.arrive : stay.land; }
  departureOf(stay) { const p = stay.party, k = p.stays.indexOf(stay), plan = k >= 0 ? this.legPlan(p, k + 1) : null; return plan ? plan.start - MOVE.launch : stay.leave; }

  // --- what the others ask ------------------------------------------------------------------------------------
  partyAt(key) { const c = this.live.get(key); return c ? c.party : null; }
  campAt(key) { return this.live.get(key) || null; }
  // the parties whose plan has them on a lake's water (its basin) that day, camped or passing
  partiesOn(lakeId, T = this.today) {
    const b = this.basinOfLake(lakeId), out = new Set();
    if (b < 0) return [];
    for (const s of this.block(T).stays) if (s.basin === b && s.start <= T && s.end >= T) out.add(s.party);
    return [...out];
  }
  partiesNear(x, z, r) { const out = []; for (const c of this.live.values()) if (Math.hypot(c.site.x - x, c.site.z - z) < r) out.push(c.party); return out; }
  // the console's and the tests' summary
  stats(T = this.today) {
    const blk = this.block(T), out = { day: T, block: blk.b, stays: blk.stays.length, campedTonight: 0, homeless: 0, live: this.live.size, spoken: this.spokenSet.size, traffic: this.traffic, entering: 0 };
    for (const s of blk.stays) { if (s.start <= T && s.end > T) { if (blk.site.get(s) >= 0) out.campedTonight++; else out.homeless++; } }
    for (const e of this.eps) out.entering += this.entering(e.ep, T).length;
    return out;
  }
}
