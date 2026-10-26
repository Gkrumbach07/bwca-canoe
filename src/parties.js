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
// three weeks before it, so a long trip is counted) is given its site in order of arrival, first come: the free site
// nearest the way they came in and the way they go on (a little seeded jitter), never one already taken that night,
// never yours (camp.js: your pitched or saved tent's site is an input, so a party never camps on you, and a reload
// with your camp gives the same camps). A stay holds its site from the hour they land (15:00–18:30; the first night
// after the put-in) to the hour they leave (8:00–10:30). Which water a site is on comes from src/site-lakes.json
// (scripts/site-lakes.mjs reads the release's own tiles), so the schedule never depends on what is loaded round you.
//
// What the world sees. The camps within PARTIES.claimR of you (the dusk note looks 6 km out) hold their sites in the
// campsite registry (camp.js CampRegistry, holder 'party:<id>'): a site reads "Taken" from the water and ashore, and
// the dusk note's nearest free site is one nobody lands at later today (registry.spoken). A camp comes and goes only
// while nobody watches (watched(): within PARTIES.watchR in the view, or within watchNear): a party never pops in
// across the bay as you look. party-camps.js draws them.
//
//   const parties = new Parties({ world, profile, day })
//   parties.attach({ registry, camp, player, camera, settings })   main.js round A-F
//   parties.update(dt)          after camp.update: the claims within claimR, the registry's spoken hook
//   parties.entering(ep, absDay)   the parties put in at ep on a day: [{ id, ep, day, kind, size, members, canoes,
//                                  tents, nights, stays: [{ id, basin, start, end, land, leave, in, out }], words }]
//   parties.campsAt(absDay, hours)  the stays at a site then: [{ stay, party, site (the world's record), i, key, d? }]
//   parties.live                Map key -> camp: the ones holding their sites now (party-camps.js draws these)
//   parties.partyAt(key), parties.partiesOn(lakeId, absDay), parties.partiesNear(x, z, r), parties.stats()
import { mulberry32 } from './rng.js';
import { seasonAt } from './season.js';
import SITE_LAKES from './site-lakes.json';

// The daily overnight paddle quotas (May 1 – Sep 30) by entry point number, as recreation.gov lists them (2024–25;
// a few of the small ones rounded). Moose Lake 27, Lake One 18, Sawbill 14; Trout, Fall and Little Vermilion count
// their motor permits in.
export const QUOTA = {
  1: 14, 4: 4, 6: 2, 7: 2, 8: 1, 9: 2, 12: 7, 14: 9, 16: 7, 19: 1, 20: 2, 22: 3, 24: 14, 25: 27, 26: 4, 27: 8, 29: 1, 30: 18,
  31: 4, 32: 2, 33: 2, 34: 3, 35: 5, 36: 5, 37: 9, 38: 14, 39: 2, 40: 2, 41: 8, 43: 1, 44: 1, 45: 1, 47: 4, 48: 3, 49: 3,
  50: 3, 51: 4, 52: 3, 54: 13, 55: 12, 57: 2, 58: 2, 60: 5, 61: 2, 62: 3, 64: 4, 66: 1, 67: 1, 68: 2, 69: 2, 70: 2, 75: 2,
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

export const PARTY = 'party:';
const AREA = 25; // m round a site's ring that are its area (camp.js AREA_R)
export const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000); // as trip.js and tasks.js
const doyOfAbs = (n) => { const d = new Date(n * 86400000), y = d.getUTCFullYear(); return n - absDay(y, 0); };
const seeded = (...n) => mulberry32(n.reduce((h, x, i) => (Math.imul(h ^ ((x | 0) + i * 0x9e3779b9), 2654435761) >>> 0), 0x2a71e5) >>> 0);
const hashStr = (s) => { let h = 2166136261; for (const c of String(s || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const between = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));
const lerp = (a, b, t) => a + (b - a) * t;
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
    this.siteLake = table ? Int32Array.from(table) : this.guessLakes();
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
    const canoes = size === 1 ? 1 : Math.min(4, Math.ceil(size / (size >= 7 ? 2.5 : 2)));
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
    for (let i = 0; i < out; i++) {
      if (i > 0 && rng() < K.layover) { O.push({ ...O[O.length - 1] }); continue; } // a day at the same site
      const km = i === 0 ? between(rng, K.first) : between(rng, K.km);
      // (a busy landing on a lake of few sites, Moose Lake's 27 a day for seven, sends most of them on)
      const room = Math.min(1, this.sitesIn(b).length / Math.max(1, (QUOTA[e.ep] ?? QUOTA_ELSE) * 0.6));
      const stayIn = i === 0 && this.sitesIn(b).length && rng() < (K.stayIn + (party.putIn > PARTIES.late[0] ? PARTIES.late[1] : 0)) * room;
      const w = stayIn ? { basin: b, in: null, firstOut: null } : this.walk(b, km * 1000, visited, rng, at, i === 0 ? room : 1, e);
      if (!this.sitesIn(w.basin).length) { if (!O.length) return []; O.push({ ...O[O.length - 1] }); continue; } // nowhere to camp out there: a layover
      if (O.length && w.basin !== b) O[O.length - 1].out = w.firstOut;
      if (w.basin === b && O.length) { O.push({ ...O[O.length - 1] }); continue; }
      O.push({ basin: w.basin, in: w.in || at, out: null });
      b = w.basin; at = w.in || at;
    }
    for (const o of O) o.out = o.out || o.in;
    // night by night: out, then back (a layover at the far end, then the outbound basins in turn)
    const nightly = [];
    for (let i = 0; i < party.nights; i++) {
      if (i < out) nightly.push(O[i]);
      else { const o = O[Math.max(0, out - 1 - (i - out))]; nightly.push({ basin: o.basin, in: o.out, out: o.in }); }
    }
    // a run of nights in one basin is one stay at one site
    const stays = [];
    for (let i = 0; i < nightly.length; i++) {
      const n = nightly[i], last = stays[stays.length - 1];
      if (last && last.basin === n.basin) { last.end++; continue; }
      const land = i === 0 ? Math.min(18.5, Math.max(party.putIn + 2, 14.5 + rng() * 3.5)) : 15 + rng() * 3.5;
      stays.push({ id: `${party.id}/${i}`, party, basin: n.basin, start: party.day + i, end: party.day + i + 1, land, leave: 0, in: n.in, out: n.out, seed: rng() * 1e9 });
    }
    for (const s of stays) s.leave = 8 + rng() * 2.5;
    return stays;
  }
  // A day's travel: about `metres` on from `at` in basin b (across the water to a portage's landing, over the carry),
  // never back over the way (sites ahead weigh more), to a basin with sites (a pond between two carries is crossed);
  // it stops short rather than run far past the day's distance where it can camp
  walk(b, metres, visited, rng, at, room = 1, home = at) {
    let cur = b, firstOut = null, inPt = null, pos = at, gone = 0;
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
    }
    return { basin: cur, in: inPt, firstOut, gone };
  }
  // how much a stay likes each site of its basin (lower is better): nearest the way in and the way on, a little jitter
  prefs(s) {
    if (s.prefs) return s.prefs;
    const w = this.world, rng = mulberry32(s.seed >>> 0), sites = this.sitesIn(s.basin), score = new Float32Array(sites.length);
    for (let k = 0; k < sites.length; k++) { const c = w.campsites[sites[k]]; score[k] = Math.hypot(c.x - s.in.x, c.z - s.in.z) + 0.7 * Math.hypot(c.x - s.out.x, c.z - s.out.z) + rng() * 700; }
    return (s.prefs = score);
  }

  // --- the sweep: every stay of a block given its site, first come -----------------------------------------------
  // your site: the pitched tent's (or the saved one waiting for its ground), and the abs day you took it
  playerSite() {
    const c = this.camp, t = c && (c.camp || c.pending), key = t && t.key;
    if (!key) return null;
    const i = this.siteOfKey.get(key); if (i == null) return null;
    const d = this.day, since = Number.isFinite(t.since) ? this.today - (d.doy - Math.floor(t.since / 24)) : this.today;
    return { i, key, since };
  }
  // Every site that is yours tonight: your tent's, and a free one where you have left things (set down on the ground
  // within its area, the canoe lying there, a fire of yours in its ring): you were there first. [{ i, key, since }]
  mine() {
    const out = [], me = this.playerSite(), inv = this.inventory, reg = this.registry;
    if (me) out.push(me);
    const spots = [];
    if (inv && inv.attached) {
      for (const c of inv.containers) {
        const k = inv.root ? inv.root(c) : c;
        if (!k || k.where !== 'ground' || !k.at || !Number.isFinite(k.at.x)) continue;
        if ((c.item === 'firefuel' || c.item === 'grate') && !c.grid.length) continue; // (an empty ring's bin is the site's, not yours)
        spots.push(k.at);
      }
      const s = inv.canoeSpot ? inv.canoeSpot() : null;
      if (s && !s.afloat && !s.overhead && Number.isFinite(s.x)) spots.push(s);
    }
    if (this.fires) for (const f of this.fires.fires.values()) if (!f.party && f.at) spots.push(f.at);
    const p = this.player, near = PARTIES.claimR + 500;
    for (const at of spots) {
      if (p && (Math.abs(at.x - p.x) > near || Math.abs(at.z - p.z) > near)) continue; // (only round you: further off, it waits till you come)
      const i = this.siteNear(at.x, at.z, AREA);
      if (i < 0 || out.some((o) => o.i === i)) continue;
      const key = this.keyOf[i], h = reg ? reg.holder(key) : null;
      if (h && h !== 'player') continue; // (things left in a party's camp don't move them)
      out.push({ i, key, since: this.today });
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
          if (score[k] >= best || occ.has(i) || (mine.length && mine.some((m) => m.i === i && s.end > m.since))) continue;
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
      if (!jump && this.watched(c.site)) continue;
      if (reg.claim(key, c.party.holder)) this.live.set(key, c);
    }
    this.spokenSet = this.spokenOn(T, h);
    for (const key of this.live.keys()) this.spokenSet.delete(key);
  }

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
