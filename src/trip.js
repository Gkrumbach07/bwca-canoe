// The trip: how you travel (Adventure, with a permit, a food pack and a date to be out by; or Sandbox, the same lakes
// with no limits), the permit written at the outfitter's counter, the packs and the canoe, the trip's own log, and how
// it ended. In Adventure it keeps the rules: the clock runs at a third while you travel (paddling, carrying, walking a
// portage), the clock and wind keys and the map's "Paddle in" are off, a capsize costs energy and food and wets the
// gear, and three things end a trip in a calm evacuation (no food and no energy, about 36 hours awake, two days past
// "out by"): a fade, a line from the outfitter or a ranger, and you wake at the nearest landing with the trip logged as
// evacuated. Sandbox never ends a trip.
//
// The trip is saved inside the outfitter's document (`bwca-canoe-trip`, outfitter.save()) as `core`; a document
// without one is from before the trip core and comes back as Sandbox. The logbook (`bwca-canoe:logbook`) keeps every
// trip's outcome and what has been seen (lakes, campsites, docks, portages) across trips: the hook for achievements.
//
//   trip.mode ('adventure' | 'sandbox'), trip.adventure, trip.sandbox, trip.active, trip.state (the saved core),
//   trip.state.packs { count, canoe, foodDays }, trip.log(kind, data), trip.on(kind, fn) → off, trip.evacuate(why)
//   kinds: 'start' 'lake' 'portage' 'camp' 'sleep' 'capsize' 'offsite' 'evac' 'exit'
import { save } from './save.js';
import { weekdayOf, longDate, shortDate, word, plural } from './hud.js';

const DOC_KEY = 'bwca-canoe-trip';  // the outfitter's document
const BOOK = 'logbook';             // save.js namespace
const TRAVEL_RATE = 1 / 3;          // the clock while you travel, in Adventure
const AWAKE_LIMIT = 36;             // hours awake that end a trip
const OVERDUE_DAYS = 2;             // days past "out by" that end one
const WAKE_AT = 7.5;                // the hour you wake at the landing after an evacuation
const LOG_MAX = 300;

// days since 1970 for a calendar date, and back
export const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000);
export function dateOfAbs(n) { const d = new Date(n * 86400000), year = d.getUTCFullYear(); return { year, doy: n - absDay(year, 0) }; }

const REASONS = { food: 'no food and no energy', awake: 'about 36 hours awake', overdue: 'two days past the permit' };
const LINES = {
  food: ['Heard you ran out. We took the motor out and fetched you in. Hot food first.', 'It happens to everyone once. Come in and eat something; the lake will keep.'],
  awake: ['You were about done in out there. We brought you in to sleep it off.', 'Thirty-some hours on your feet. Sleep first; the lakes will keep.'],
  overdue: ['Your outfitter reported you overdue, so we came looking. Glad you are all right.', 'Two days past your permit. We found you fine, and that is what counts.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function blank(mode = 'adventure') {
  return {
    v: 2, id: null, mode: mode === 'sandbox' ? 'sandbox' : 'adventure', active: false,
    permit: null, packs: { count: 2, canoe: 'aluminium', foodDays: 4 },
    camp: null, wet: false, offsite: 0, log: [], outcome: null,
  };
}
const blankBook = () => ({ trips: [], seen: { lakes: [], camps: [], eps: [], portages: [] } });
function readDoc() { try { const s = localStorage.getItem(DOC_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }

export class Trip {
  // t: { world, player, day, energy, hud, veil, tasks, fishing, stats }
  constructor(t) {
    this.world = t.world; this.player = t.player; this.day = t.day; this.energy = t.energy || null;
    this.hud = t.hud || null; this.veil = t.veil || null; this.tasks = t.tasks || null; this.fishing = t.fishing || null; this.stats = t.stats || null;
    this.outfitter = null;          // the outfitter sets itself here
    this.handlers = new Map();
    this.state = blank(save.read('tripMode') || 'adventure');
    const book = save.read(BOOK);
    this.book = { ...blankBook(), ...(book || {}) };
    this.book.seen = { ...blankBook().seen, ...(this.book.seen || {}) };
    this.evacuating = false;
    this.travelT = 0; this.lastMode = this.player.mode; this.lastLake = 0; this.lastTrail = null; this.lastPortages = this.stats ? this.stats.portages : 0;
    this.seenT = 0; this.bookT = 0; this.bookDirty = false; this.dueNoted = null;
    if (this.energy) this.energy.trip = this;
    this.restoreFrom(readDoc());
  }

  // --- the mode and the words ------------------------------------------------------------------------------
  get mode() { return this.state.mode; }
  set mode(m) { this.setMode(m); }
  setMode(m) { this.state.mode = m === 'sandbox' ? 'sandbox' : 'adventure'; this.day.locked = this.adventure; }
  get adventure() { return this.state.mode === 'adventure'; }
  get sandbox() { return this.state.mode === 'sandbox'; }
  get active() { return !!this.state.active; }
  get permit() { return this.state.permit; }
  get today() { const a = this.asOf || this.day; return absDay(a.year, a.doy); } // asOf: a saved date the words are for
  // the day of the trip, by the calendar: the put-in day is day 1
  get dayN() { const p = this.permit; return this.active && p && p.entry ? this.today - absDay(p.entry.year, p.entry.doy) + 1 : 0; }
  // the days the permit runs (the put-in day to the out-by day); 0 without dates
  get days() { const p = this.permit; return this.active && this.adventure && p && p.nights != null ? p.nights + 1 : 0; }
  // days left to "out by": 0 on the day, 1 the day before, negative once past it; null without dates
  get dueIn() { const p = this.permit; return this.active && this.adventure && p && p.exitBy ? absDay(p.exitBy.year, p.exitBy.doy) - this.today : null; }
  outBy(form = 'day') {
    const p = this.permit; if (!p || !p.exitBy) return '';
    const { year, doy } = p.exitBy, wd = weekdayOf(year, doy), ahead = absDay(year, doy) - this.today;
    if (form === 'short') return ahead >= 7 ? shortDate(year, doy) : wd.slice(0, 3);
    if (form === 'long') return longDate(year, doy);
    return ahead >= 7 ? `${wd}, ${shortDate(year, doy)}` : ahead === 0 ? 'today' : ahead === 1 ? 'tomorrow' : wd;
  }
  // "day 2 of 5 · out by Fri" (the title's menu), "Day 3 of 5" (the titles), "" in Sandbox
  dayWords(cap = false) {
    if (!this.active) return '';
    const n = this.dayN, d = this.days;
    const s = d ? `day ${n} of ${d}` : `day ${n}`;
    return cap ? s[0].toUpperCase() + s.slice(1) : s;
  }
  landing(ep) { const o = this.outfitter; return o && ep != null ? o.landings.find((l) => l.ep === ep) || null : null; }
  exitWords() {
    const p = this.permit; if (!p || p.exitEp == null) return '';
    const l = this.landing(p.exitEp); if (!l) return '';
    return p.exitEp === p.ep ? 'back at the put-in' : `at ${this.world.lakeName(l.lake) || l.place}, entry point ${l.ep}`;
  }
  packWords(foodDays = this.state.packs.foodDays) {
    const pk = this.state.packs;
    return `${pk.count === 1 ? 'one pack' : 'two packs'}, ${this.sandbox ? 'food that keeps' : `${foodDays} ${plural(foodDays, 'day')} of food`}`;
  }

  // --- the log and its listeners ---------------------------------------------------------------------------
  on(kind, fn) {
    if (!this.handlers.has(kind)) this.handlers.set(kind, new Set());
    this.handlers.get(kind).add(fn);
    return () => this.handlers.get(kind).delete(fn);
  }
  log(kind, data = {}) {
    const d = this.day, e = { k: kind, at: { year: d.year, doy: d.doy, hours: +d.hours.toFixed(2) }, ...data };
    const log = this.state.log || (this.state.log = []);
    log.push(e); if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
    if (kind === 'camp' && data.key != null) this.seen('camps', String(data.key));
    if (kind === 'offsite') this.state.offsite = (this.state.offsite || 0) + 1;
    for (const k of [kind, '*']) for (const fn of this.handlers.get(k) || []) { try { fn(e, this); } catch (err) { console.warn('trip.on', kind, err); } }
    return e;
  }
  say(text, seconds) { if (this.hud && text) this.hud.note(text, seconds); }

  // --- the logbook: trips and what has been seen ----------------------------------------------------------
  seen(kind, key) {
    const list = this.book.seen[kind] || (this.book.seen[kind] = []);
    if (list.includes(key)) return false;
    list.push(key); this.bookDirty = true;
    return true;
  }
  saveBook() { this.bookDirty = false; save.write(BOOK, this.book); }

  // --- starting and ending ---------------------------------------------------------------------------------
  // the permit as written at the counter: { ep, entry: {year, doy, hours}, nights, exitEp, packs, canoe, foodDays, no }
  start(f) {
    const adv = this.adventure, s = this.state, e = f.entry;
    s.id = `${f.ep}-${absDay(e.year, e.doy)}-${Math.floor(Math.random() * 1e5).toString(36)}`;
    s.active = true; s.outcome = null; s.camp = null; s.wet = false; s.offsite = 0; s.log = [];
    const exitBy = adv && f.nights != null ? dateOfAbs(absDay(e.year, e.doy) + f.nights) : null;
    s.permit = { no: f.no || null, ep: f.ep, entry: { year: e.year, doy: e.doy, hours: +(e.hours ?? this.day.hours).toFixed(2) }, nights: adv ? f.nights : null, exitBy, exitEp: adv ? (f.exitEp ?? f.ep) : null };
    s.packs = { count: f.packs === 1 ? 1 : 2, canoe: f.canoe === 'kevlar' ? 'kevlar' : 'aluminium', foodDays: f.foodDays };
    s.fish0 = this.fishing ? this.fishing.log.length : 0;
    this.dueNoted = null; this.lastLake = 0; this.lastPortages = this.stats ? this.stats.portages : 0;
    // you put in having been up since the morning
    const en = this.energy;
    if (en) { en.value = 1; en.awakeSince = en.now - Math.min(12, Math.max(0, this.day.hours - 7)); en.tired = 0; en.lastMealAbs = -1e9; }
    this.seen('eps', f.ep);
    this.log('start', { ep: f.ep });
  }
  // the counter's "End the trip here": the outcome, with its note
  finish(ep) {
    if (!this.active) return null;
    const p = this.permit;
    let k = 'completed', why = this.sandbox ? 'sandbox' : 'as planned';
    if (this.adventure && p && p.exitBy) {
      const late = -this.dueIn, notes = [];
      if (late > 0) { k = 'late'; notes.push(`${word(late)} ${plural(late, 'day')} past the permit`); }
      else if (late < 0) notes.push('back early');
      if (p.exitEp != null && ep !== p.exitEp) notes.push('out at another entry point');
      if (notes.length) why = notes.join(', ');
    }
    return this.close(k, why, ep);
  }
  abandon() { return this.active ? this.close('abandoned', 'a new trip begun', null) : null; }
  close(k, why, ep) {
    const s = this.state, d = this.day, p = s.permit || {}, st = this.stats;
    s.outcome = { k, why, ep, at: { year: d.year, doy: d.doy, hours: +d.hours.toFixed(2) } };
    const entry = p.entry || { year: d.year, doy: d.doy, hours: d.hours };
    this.book.trips.push({
      id: s.id, mode: s.mode, k, why, from: p.ep ?? null, to: ep, entry, end: s.outcome.at, nights: p.nights ?? null, exitEp: p.exitEp ?? null,
      days: absDay(d.year, d.doy) - absDay(entry.year, entry.doy) + 1, packs: s.packs.count, canoe: s.packs.canoe,
      km: st ? +st.km.toFixed(2) : 0, portages: st ? st.portages : 0, lakes: st ? st.lakes.length : 0, nights_out: st ? st.nights.length : 0,
      fish: this.fishing ? Math.max(0, this.fishing.log.length - (s.fish0 || 0)) : 0, offsite: s.offsite || 0,
    });
    s.active = false; s.camp = null;
    this.log('exit', { outcome: s.outcome });
    this.saveBook();
    return s.outcome;
  }
  // a fresh, inactive trip in a mode (the title's New trip)
  reset(mode = this.mode) { this.state = blank(mode); this.setMode(mode); this.evacuating = false; }

  // --- the evacuation -------------------------------------------------------------------------------------
  evacuate(why = 'food') {
    if (!this.adventure || !this.active || this.evacuating) return false;
    this.evacuating = true;
    const o = this.outfitter, p = this.player, w = this.world;
    const to = o ? o.nearest(p.x, p.z).l : null;
    const lake = to ? w.lakeName(to.lake) || to.place : null;
    const ranger = why !== 'food';
    const reason = REASONS[why] || String(why);
    this.log('evac', { why, reason, to: to ? to.ep : null });
    const card = {
      kicker: ranger ? 'A Forest Service ranger · Superior National Forest' : to ? `${to.name} · entry point ${to.ep}` : 'The outfitter',
      text: `“${pick(LINES[why] || LINES.food)}”`,
      sub: `You wake at the ${lake ? `${lake} ` : ''}landing in the morning. The trip is logged as evacuated: ${reason}. The lakes, the catches and the gear are yours to keep; the tasks under way and the stringer stayed out there.`,
      fadeIn: 1.6, hold: 5.5, fadeOut: 2.2,
      onDark: async () => {
        if (to && o && o.onTeleport) await o.onTeleport(to.x, to.z);
        const h = this.day.hours; this.day.advance((WAKE_AT - h + 24) % 24 || 24);
        this.close('evacuated', reason, to ? to.ep : null);
        if (this.tasks) this.tasks.endTrip();
        if (this.fishing && this.fishing.stringer) this.fishing.stringer.length = 0;
        const en = this.energy;
        if (en) { en.food = 0; en.sleep(1); en.value = 1; }
        if (o) o.evacuated(to);
      },
    };
    const done = () => { this.evacuating = false; if (o) o.afterEvac(to); };
    if (this.veil) this.veil.card(card).then(done);
    else Promise.resolve(card.onDark()).then(done, done);
    return true;
  }

  // --- a capsize: the cost in Adventure ------------------------------------------------------------------
  capsize() {
    this.log('capsize');
    if (!this.adventure) return;
    const cold = (this.day.season && this.day.season.waterTemp != null ? this.day.season.waterTemp : 15) < 12, en = this.energy;
    if (en) { en.spend(cold ? 0.5 : 0.25); en.food = Math.max(0, en.food - 0.5); }
    this.state.wet = true;
    this.say(`Over you go${cold ? ', into cold water' : ''}. Half a day of food is spoiled, and the gear is wet until a fire dries it.`, 7);
  }

  // --- per frame (game seconds) ------------------------------------------------------------------------------
  update(dt) {
    const p = this.player, d = this.day, s = this.state, adv = this.adventure;
    d.locked = adv;
    d.rate = adv && s.active && this.travelling(dt) ? TRAVEL_RATE : 1;
    if ((this.bookT += dt) > 5) { this.bookT = 0; if (this.bookDirty) this.saveBook(); }
    if (!s.active || p.teleporting) { this.lastMode = p.mode; return; }
    this.watch(dt);
    if (!adv || this.evacuating) return;
    if (this.energy && this.energy.awake >= AWAKE_LIMIT) { this.evacuate('awake'); return; }
    const due = this.dueIn;
    if (due == null) return;
    if (due < -OVERDUE_DAYS) { this.evacuate('overdue'); return; }
    // a word on the morning of the last day, and on the days past it
    if (due <= 0 && due !== this.dueNoted && d.hours >= 7 && d.hours < 20) {
      this.dueNoted = due;
      const where = this.exitWords();
      this.say(due === 0 ? `Out by today${where ? `, ${where}` : ''}.` : due === -1 ? 'A day past the permit. The outfitter will be wondering.' : 'Two days past the permit. Someone will come looking tonight.', 7);
    }
  }
  // travelling, for the clock: paddling under way, carrying the canoe, walking a portage trail (a stop of under a
  // second between strokes or steps still counts)
  travelling(dt) {
    const p = this.player;
    let moving = false;
    if (p.teleporting) moving = false;
    else if (p.landing) moving = true;
    else if (p.mode === 'paddle') moving = Math.abs(p.speed) > 0.3 && !(p.fishing && p.fishing.rodUp);
    else if (p.mode === 'carry') moving = Math.abs(p.speed) > 0.1;
    else if (p.mode === 'walk') moving = Math.abs(p.speed) > 0.1 && !!p.onTrail;
    this.travelT = moving ? 1 : Math.max(0, this.travelT - dt);
    return this.travelT > 0;
  }
  // what happens on the way: a capsize, a new lake, a portage walked end to end, campsites and docks come by
  watch(dt) {
    const p = this.player, w = this.world, st = this.stats;
    if (p.mode === 'swim' && this.lastMode === 'paddle') this.capsize();
    this.lastMode = p.mode;
    if (p.mode === 'paddle' && p.lakeId > 0 && p.lakeId !== this.lastLake) {
      this.lastLake = p.lakeId;
      this.seen('lakes', p.lakeId);
      if (!this.state.log.some((e) => e.k === 'lake' && e.id === p.lakeId)) this.log('lake', { id: p.lakeId, name: w.lakeName(p.lakeId) || null });
    }
    if (st) {
      if (st.carried) this.lastTrail = st.carried;
      if (st.portages > this.lastPortages && this.lastTrail) { this.log('portage', { name: this.lastTrail.name, rods: this.lastTrail.rods }); this.seen('portages', this.lastTrail.name); }
      this.lastPortages = st.portages;
    }
    if ((this.seenT -= dt) <= 0) {
      this.seenT = 1;
      for (const c of w.campsites) if (Math.abs(c.x - p.x) < 40 && Math.abs(c.z - p.z) < 40) this.seen('camps', `${Math.round(c.x)}:${Math.round(c.z)}`);
      for (const ep of w.entryPoints) if (Math.abs(ep.x - p.x) < 30 && Math.abs(ep.z - p.z) < 30) this.seen('eps', ep.ep);
    }
  }

  // --- saving ------------------------------------------------------------------------------------------------
  serialize() { return this.state; }
  // the outfitter's document: its core, or an old one (no core) brought back as Sandbox with a permit built from it
  restoreFrom(doc) {
    if (!doc) { this.setMode(this.mode); return; }
    if (doc.core && doc.core.v === 2) {
      const b = blank(doc.core.mode);
      this.state = { ...b, ...doc.core, packs: { ...b.packs, ...(doc.core.packs || {}) }, log: Array.isArray(doc.core.log) ? doc.core.log : [] };
    } else {
      const t = doc.trip || {}, s = blank('sandbox'), d = this.day;
      const kevlar = !!(doc.tasks && Array.isArray(doc.tasks.unlocks) && doc.tasks.unlocks.includes('kevlar'));
      s.packs = { count: 2, canoe: kevlar ? 'kevlar' : 'aluminium', foodDays: t.days || 4 };
      if (t.active) {
        const entry = { year: t.startYear ?? d.year, doy: t.startDoy ?? d.doy, hours: t.startHours ?? 8 };
        s.active = true; s.id = `${t.ep}-${absDay(entry.year, entry.doy)}-old`;
        s.permit = { no: null, ep: t.ep ?? null, entry, nights: Math.max(1, (t.days || 4) - 1), exitBy: null, exitEp: null };
      }
      this.state = s;
    }
    this.setMode(this.state.mode);
  }
  // words for the menu: "Adventure · day 2 of 5 · out by Fri", as of a saved date (the title shows the spot saved)
  menuWords(at = null) {
    const m = this.adventure ? 'Adventure' : 'Sandbox';
    if (!this.active) return m;
    this.asOf = at && Number.isFinite(at.year) && Number.isFinite(at.doy) ? at : null;
    const out = this.adventure && this.permit && this.permit.exitBy ? ` · out by ${this.outBy('short')}` : '';
    const s = `${m} · ${this.dayWords()}${out}`;
    this.asOf = null;
    return s;
  }
}
