// What the people remember of you this season (content pass 1, stream B: conversations). The owner, 2026-10-25: "npc
// convos"; the brief: "memory of you: your last trip, the big fish you brought in, a task you finished, how long you've
// been out". The keepers greet you with it and talk about it when you ask how you are doing.
//
// Kept in the people's own saved state (npcs.js `bwca-canoe:people`, cleared with a new season) as `s.mem`:
//   since      the day (days since 1970) the season's memory began
//   trips      the season's trips, newest last: { from, to, k ('completed' | 'evacuated'), days, nights, km, portages,
//              lakes [names, in order], far (the lake furthest from where it left), camps [lake names], fish, swim,
//              end (day) }
//   fish       the season's catches worth remembering: { sp, name, cm, kg, lake, kept, day, good } (the biggest 24);
//              spLakes sp → the lakes it came out of, spN sp → how many
//   tasks      the notices and favours paid this season: { kind, title, from, pay, day }
//   lakes      every named lake paddled this season; campLakes the lakes slept on; carries the portages walked (names)
//   loons      { lake, chick, day }: where you were when a loon pair (with a chick) swam near you
//   greet      ep → the day the keeper there last greeted you; heard ep → what they last remarked on
//   n          counters: { fishSeen (the catch log read so far), claimSeen }
//
//   const mem = new Memory(people)         people: npcs.js People (its s, day, world, tasks, lakeAt)
//   mem.attach({ trip, fishing, loons })   main.js content B; each is feature-detected
//   mem.update(dt)                         from people.update: the catch log, the claims, the loons
//   mem.state, mem.stats(), mem.lastTrip(), mem.bigFish(sinceDay), mem.goodFish(sp)
import { absDay } from './trip.js';

const KEEP_FISH = 24;
const KEEP_TRIPS = 16;
const KEEP_TASKS = 20;
const LOON_R = 450;            // metres: a pair this near you on the water counts as seen
const SEED_DAYS = 45;          // an old save's memory is seeded from the catches and trips of this many days back
// a fish worth a keeper's word, in cm (about the top third of what the lakes give)
export const GOOD_CM = { walleye: 50, pike: 70, smallmouth: 40, laketrout: 60, crappie: 28, perch: 26 };
export const FISH_WORD = { walleye: 'walleye', pike: 'northern', smallmouth: 'smallmouth', laketrout: 'laker', crappie: 'crappie', perch: 'perch' };

export const blankMemory = (today) => ({ v: 1, since: today, trips: [], fish: [], spLakes: {}, spN: {}, tasks: [], lakes: [], campLakes: [], carries: [], loons: [], greet: {}, heard: {}, n: { fishSeen: -1, claimSeen: -1 }, swims: 0, evacs: 0 });

export class Memory {
  constructor(people) {
    this.P = people;
    this.trip = null; this.fishing = null; this.loons = null;
    this.t = 0; this.loonT = 0;
    this.off = null;
  }
  get today() { return this.P.today; }
  // the memory in the people's state (made, and seeded once for an old save, the first time it is asked for)
  get state() {
    const s = this.P.s;
    if (!s.mem || s.mem.v !== 1) { s.mem = blankMemory(this.today); this.seed(s.mem); }
    return s.mem;
  }
  attach({ trip = null, fishing = null, loons = null } = {}) {
    this.trip = trip || null; this.fishing = fishing || null; this.loons = loons || null;
    if (this.off) { this.off(); this.off = null; }
    if (trip && typeof trip.on === 'function') this.off = trip.on('exit', (e, t) => this.tripEnded(t));
    this.state; // eslint-disable-line no-unused-expressions
  }
  // a season begun: everything forgotten (people.reset blanks s, so the next read makes a new one)
  reset() { this.P.s.mem = blankMemory(this.today); this.P.s.mem.n.fishSeen = this.fishing ? this.fishing.log.length : 0; this.P.s.mem.n.claimSeen = this.P.tasks ? (this.P.tasks.claimed || []).length : 0; }

  // an old save (from before this memory): the last few weeks' catches and trips, so the keepers are not strangers to it
  seed(m) {
    const F = this.fishing, T = this.trip, d0 = this.today - SEED_DAYS;
    if (F && Array.isArray(F.log)) {
      for (const e of F.log) if (Number.isFinite(e.year) && Number.isFinite(e.doy) && absDay(e.year, e.doy) >= d0) this.addFish(m, e);
      m.n.fishSeen = F.log.length;
    }
    if (T && T.book && Array.isArray(T.book.trips)) for (const t of T.book.trips.slice(-4)) {
      const end = t.end && Number.isFinite(t.end.year) ? absDay(t.end.year, t.end.doy) : null;
      if (end != null && end >= d0) m.trips.push({ from: t.from, to: t.to, k: t.k, days: t.days, nights: t.nights_out || 0, km: t.km || 0, portages: t.portages || 0, lakes: [], far: null, camps: [], fish: t.fish || 0, swim: false, end });
    }
    const C = this.P.tasks && this.P.tasks.claimed;
    if (Array.isArray(C)) { for (const c of C) if (c.day >= d0) m.tasks.push({ kind: c.kind, title: c.title, from: c.from, pay: c.pay, day: c.day }); m.n.claimSeen = C.length; }
  }

  // --- recording -------------------------------------------------------------------------------------------------
  update(dt) {
    if ((this.t += dt) < 0.5) return;
    this.t = 0;
    const m = this.state, F = this.fishing, C = this.P.tasks && this.P.tasks.claimed;
    if (F && Array.isArray(F.log)) {
      if (m.n.fishSeen < 0 || m.n.fishSeen > F.log.length) m.n.fishSeen = F.log.length; // (a log cut back: from here)
      // (the content join: the count moved on before addFish writes the save; written after, a reload read the same
      // catch again, and the 76 cm walleye was remembered four times over)
      for (let i = m.n.fishSeen; i < F.log.length; i++) { m.n.fishSeen = i + 1; this.addFish(m, F.log[i]); }
      m.n.fishSeen = F.log.length;
    }
    if (Array.isArray(C)) {
      if (m.n.claimSeen < 0 || m.n.claimSeen > C.length) m.n.claimSeen = C.length;
      const had = m.n.claimSeen;
      for (let i = m.n.claimSeen; i < C.length; i++) { const c = C[i]; m.tasks.push({ kind: c.kind, title: c.title, from: c.from, pay: c.pay, day: c.day ?? this.today }); }
      if (m.tasks.length > KEEP_TASKS) m.tasks.splice(0, m.tasks.length - KEEP_TASKS);
      m.n.claimSeen = C.length;
      if (C.length > had) this.P.write(); // (and saved with the count, so a reload does not count the claims twice)
    }
    if ((this.loonT -= 0.5) <= 0) { this.loonT = 2; this.watchLoons(m); }
  }
  addFish(m, e) {
    if (!e || !e.species) return;
    const sp = e.species, cm = Math.round(e.length || 0), good = cm >= (GOOD_CM[sp] || 999), lake = e.lake && e.lake !== 'Unnamed water' ? e.lake : null;
    const sl = m.spLakes || (m.spLakes = {}), list = sl[sp] || (sl[sp] = []);
    if (lake && !list.includes(lake)) list.push(lake);
    m.spN = m.spN || {}; m.spN[sp] = (m.spN[sp] || 0) + 1;
    m.fish.push({ sp, name: e.name || FISH_WORD[sp] || sp, cm, kg: +(e.weight || 0), lake, kept: !!e.kept, day: Number.isFinite(e.year) ? absDay(e.year, e.doy) : this.today, good });
    if (m.fish.length > KEEP_FISH) { m.fish.sort((a, b) => b.kg - a.kg || b.day - a.day); m.fish.length = KEEP_FISH; m.fish.sort((a, b) => a.day - b.day); }
    this.P.write();
  }
  // a loon pair near you on a named lake, with a chick or not (loons.js keeps them round the player)
  watchLoons(m) {
    const L = this.loons, p = this.P.player;
    if (!L || !Array.isArray(L.loons) || p.mode !== 'paddle' || !(p.lakeId > 0)) return;
    const name = this.P.world.lakeName(p.lakeId); if (!name) return;
    const near = (o) => o && o.alive && Math.hypot(o.x - p.x, o.z - p.z) < LOON_R;
    const adults = L.loons.filter(near).length, chick = Array.isArray(L.chicks) && L.chicks.some(near);
    if (adults < 2 && !chick) return;
    const last = m.loons[m.loons.length - 1];
    if (last && last.lake === name && last.day === this.today && (last.chick || !chick)) return;
    m.loons.push({ lake: name, chick, day: this.today });
    if (m.loons.length > 12) m.loons.splice(0, m.loons.length - 12);
    this.P.write();
  }
  // a trip has come in (or been brought in): what it was, from its own log
  tripEnded(t) {
    const m = this.state, b = t && t.book && t.book.trips ? t.book.trips[t.book.trips.length - 1] : null, log = (t && t.state && t.state.log) || [];
    if (!b) return;
    const w = this.P.world, lakes = [], camps = [];
    for (const e of log) {
      if (e.k === 'lake' && e.name && !lakes.includes(e.name)) lakes.push(e.name);
      if (e.k === 'camp' && Number.isFinite(e.x)) { const n = this.P.lakeAt(e.x, e.z); if (n && !camps.includes(n)) camps.push(n); }
      if (e.k === 'portage' && e.name && !m.carries.includes(e.name)) m.carries.push(e.name);
    }
    for (const n of lakes) if (!m.lakes.includes(n)) m.lakes.push(n);
    for (const n of camps) if (!m.campLakes.includes(n)) m.campLakes.push(n);
    // the lake furthest from where it left: what a keeper would say you went out to
    const from = b.from != null ? w.entryPoints.find((e) => e.ep === b.from) : null;
    let far = null, fd = -1;
    for (const e of log) if (e.k === 'lake' && e.name && Number.isFinite(e.id)) { const L = w.lakes[e.id - 1]; if (!L || !from) continue; const d = Math.hypot(L.cx - from.x, L.cz - from.z); if (d > fd) { fd = d; far = e.name; } }
    const swim = log.some((e) => e.k === 'capsize');
    if (swim) m.swims = (m.swims || 0) + 1;
    if (b.k === 'evacuated') m.evacs = (m.evacs || 0) + 1;
    m.trips.push({ from: b.from, to: b.to, k: b.k, days: b.days, nights: b.nights_out || 0, km: b.km || 0, portages: b.portages || 0, lakes, far: far || lakes[lakes.length - 1] || null, camps, fish: b.fish || 0, swim, end: this.today });
    if (m.trips.length > KEEP_TRIPS) m.trips.splice(0, m.trips.length - KEEP_TRIPS);
    this.P.write();
  }

  // --- reading ---------------------------------------------------------------------------------------------------
  lastTrip() { const t = this.state.trips; return t.length ? t[t.length - 1] : null; }
  // the biggest fish worth a word caught since a day (by weight), or null
  bigFish(since = -Infinity) { let best = null; for (const f of this.state.fish) if (f.good && f.day >= since && (!best || f.kg > best.kg)) best = f; return best; }
  biggest() { let best = null; for (const f of this.state.fish) if (!best || f.kg > best.kg) best = f; return best; }
  // a species caught this season (on a lake, or any): by the per-species tally, which keeps every lake (fish keeps the biggest)
  caught(sp, lake = null) { const m = this.state; if (!sp) return m.fish.length > 0; if (lake) return !!(m.spLakes && m.spLakes[sp] && m.spLakes[sp].includes(lake)); return !!(m.spN && m.spN[sp] > 0); }
  // the season in numbers, for "How am I doing?"
  stats() {
    const m = this.state, done = m.trips.filter((t) => t.k === 'completed');
    return { trips: m.trips.length, done: done.length, nights: m.trips.reduce((s, t) => s + (t.nights || 0), 0), km: Math.round(m.trips.reduce((s, t) => s + (t.km || 0), 0)), lakes: m.lakes.length, fish: m.fish.length,
      tasks: m.tasks.length, swims: m.swims || 0, evacs: m.evacs || 0, days: Math.max(1, this.today - m.since + 1), biggest: this.biggest(), camps: m.campLakes.length };
  }
}
