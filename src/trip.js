// The trip: how you travel (Adventure, a season of open trips; or Sandbox, the same lakes with no limits), the trip
// under way from push-off until you come in, the packs and the canoe (from what you own, profile.js), the trip's own
// log, and how it ended. Trips are open: no nights, no date to be out by and no exit place. They start and end by
// themselves (fb2 C, outfitter.js updateTrip): a trip pushes off as you paddle away from an outfitter's landing, and
// comes in as you set foot at any outfitter's landing, logged as "came in" there (comeIn). Back where it left without
// having gone anywhere, it is taken back (takeBack: nothing logged). There is no permit (the world cards, 2026-10-24:
// "what is the stamp for at the counter, i thought we got rid of that"): the season is just the season, home is the
// profile's, and a saved core that still carries a permit drops it on loading.
//
// The clock in either mode runs at the pace's one rate (fb5 C, pace.js clockOf: 4 at Trip, 1 at Real, 1 while the camera
// is up), the same on the water, on a trail, on foot, in camp and standing about; the canoe's and the walker's
// time-lapse (player.boost) is how they are seen to move and no longer moves the clock. The 1/2/3 keys multiply it
// (main.js scales dt). `travel` still says whether you are under way (paddling, carrying, walking a trail or the woods).
//
// In Adventure it keeps the rules: the clock and wind keys and the map's "Paddle in" are off, a capsize costs energy and food and wets the gear, and a
// calm evacuation comes only when the energy bar is spent with nothing left to eat or drink (energy.onEvac): a fade, a
// line from the outfitter, and you wake at 7:30 at the nearest outfitter you know. The stringer and the rest of the
// day are lost; the tasks are kept, and there is no fee. Sandbox never ends a trip.
//
// The trip is saved inside the outfitter's document (`bwca-canoe-trip`, outfitter.save()) as `core` (v3). A v2 core
// (the trip core's, with dates) loses its dates; a document without one is from before the trip core and comes back
// as Sandbox. The logbook (`bwca-canoe:logbook`) keeps every trip's outcome and what has been seen (lakes, campsites,
// landings, portages) across trips: the hook for achievements.
//
//   trip.mode ('adventure' | 'sandbox'), trip.adventure, trip.sandbox, trip.active, trip.dayN, trip.state (the saved core),
//   trip.state.since { year, doy, hours }, trip.state.from (the push-off's entry point), trip.state.packs { count, canoe, foodDays }, trip.log(kind, data),
//   trip.on(kind, fn) → off, trip.start(f), trip.comeIn(ep), trip.takeBack(), trip.evacuate(why),
//   trip.nearestKnownOutfitter(x, z)
//   kinds: 'start' (the season's first push-off: the needs fresh, main.js) 'leave' (a later one) 'lake' 'portage'
//   'camp' 'sleep' 'capsize' 'offsite' 'bunk' 'ride' 'known' 'evac' 'exit'
import { save } from './save.js';
import { plural } from './hud.js';
import { clockOf } from './pace.js';

const DOC_KEY = 'bwca-canoe-trip';  // the outfitter's document
const BOOK = 'logbook';             // save.js namespace
const WAKE_AT = 7.5;               // the hour you wake at the landing after an evacuation
const LOG_MAX = 300;
const CANOES = ['aluminium', 'royalex', 'kevlar']; // the hulls a season can own (shop.js); anything else reads as the aluminium
const KNOWN_REACH = 30;             // metres from a landing that make its outfitter known

// days since 1970 for a calendar date, and back
export const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000);
export function dateOfAbs(n) { const d = new Date(n * 86400000), year = d.getUTCFullYear(); return { year, doy: n - absDay(year, 0) }; }

const REASONS = { food: 'spent, and gone hungry', water: 'spent, and gone without water', spent: 'spent, with nothing left to eat or drink', awake: 'spent, after too long awake', cold: 'spent, and chilled through' };
const LINES = {
  food: ['You let yourself go hungry out there. We took the motor out and fetched you in. Hot food first.', 'It happens to everyone once. Come in and eat something; the lake will keep.'],
  water: ['You were dry as a bone out there. Drink this first, slowly.', 'No water and nothing left in you. We brought you in; sit, drink, rest.'],
  spent: ['You were about done in out there. We brought you in to rest.', 'Nothing left to eat or drink. We came and got you; that is what we are here for.'],
  awake: ['You were asleep on your feet out there. We brought you in; the bunk is made up.', 'Nobody paddles forever. Sleep now; the lake will keep.'],
  cold: ['You were shaking with the cold out there. We brought you in; sit by the stove and get dry.', 'Wet and cold is how it goes wrong out there. Dry clothes first, then something hot.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function blank(mode = 'adventure') {
  return {
    v: 3, id: null, mode: mode === 'sandbox' ? 'sandbox' : 'adventure', active: false,
    since: null, from: null, packs: { count: 1, canoe: 'aluminium', foodDays: 0 },
    camp: null, wet: false, offsite: 0, log: [], outcome: null,
  };
}
const blankBook = () => ({ trips: [], seen: { lakes: [], camps: [], eps: [], portages: [] } });
function readDoc() { try { const s = localStorage.getItem(DOC_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
// an older core's permit carried the push-off: its date and its entry point are all that is kept of it
const stampDate = (p) => (p && p.entry ? { year: p.entry.year, doy: p.entry.doy, hours: +(p.entry.hours ?? 8) } : null);

export class Trip {
  // t: { world, player, day, energy, hud, veil, tasks, fishing, stats, profile }
  constructor(t) {
    this.world = t.world; this.player = t.player; this.day = t.day; this.energy = t.energy || null;
    this.hud = t.hud || null; this.veil = t.veil || null; this.tasks = t.tasks || null; this.fishing = t.fishing || null; this.stats = t.stats || null;
    this.profile = null;            // the season (profile.js), handed over with useProfile
    this.outfitter = null;          // the outfitter sets itself here
    this.handlers = new Map();
    this.state = blank(save.read('tripMode') || 'adventure');
    const book = save.read(BOOK);
    this.book = { ...blankBook(), ...(book || {}) };
    this.book.seen = { ...blankBook().seen, ...(this.book.seen || {}) };
    this.evacuating = false;
    this.travelT = 0; this.lastMode = this.player.mode; this.lastLake = 0; this.lastTrail = null; this.lastPortages = this.stats ? this.stats.portages : 0;
    this.seenT = 0; this.bookT = 0; this.bookDirty = false; this.fresh = null;
    if (this.energy) this.energy.trip = this;
    this.restoreFrom(readDoc());
  }
  // the season: the packs and the canoe follow what you own
  useProfile(profile) {
    if (!profile || this.profile === profile) return;
    this.profile = profile;
    profile.onChange(() => this.syncKit());
    this.syncKit();
  }
  syncKit() {
    const pr = this.profile, s = this.state; if (!pr) return;
    const kit = pr.kit;
    s.packs.count = pr.has('pack2') ? 2 : 1;
    s.packs.canoe = CANOES.includes(kit.canoe) && pr.has(kit.canoe) ? kit.canoe : 'aluminium';
  }

  // --- the mode and the words ------------------------------------------------------------------------------
  get mode() { return this.state.mode; }
  set mode(m) { this.setMode(m); }
  setMode(m) { this.state.mode = m === 'sandbox' ? 'sandbox' : 'adventure'; this.day.locked = this.adventure; }
  get adventure() { return this.state.mode === 'adventure'; }
  get sandbox() { return this.state.mode === 'sandbox'; }
  get active() { return !!this.state.active; }
  get today() { const a = this.asOf || this.day; return absDay(a.year, a.doy); } // asOf: a saved date the words are for
  // the day of the trip, by the calendar: the push-off day is day 1, and never less (Sandbox's clock keys, or an old
  // save, can set the date back before it)
  get dayN() { const s = this.state.since; return this.active && s ? Math.max(1, this.today - absDay(s.year, s.doy) + 1) : 0; }
  // "day 3" (the title's menu), "Day 3" (the titles), "" between trips
  dayWords(cap = false) {
    if (!this.active) return '';
    const s = `day ${this.dayN}`;
    return cap ? s[0].toUpperCase() + s.slice(1) : s;
  }
  landing(ep) { const o = this.outfitter; return o && ep != null ? o.landings.find((l) => l.ep === ep) || null : null; }
  placeOf(ep) { const l = this.landing(ep); return l ? (this.world.lakeName(l.lake) || l.place) : ''; }
  packWords(foodDays = this.state.packs.foodDays) {
    const pk = this.state.packs;
    return `${pk.count === 1 ? 'one pack' : 'two packs'}, ${this.sandbox ? 'food that keeps' : foodDays > 0 ? `${foodDays} ${plural(foodDays, 'day')} of food` : 'no food'}`;
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
  // an outfitter becomes known: you reached its landing (or stood at its counter)
  learn(ep) {
    const pr = this.profile; if (!pr || ep == null || !pr.learn(ep)) return false;
    const l = this.landing(ep);
    this.fresh = ep; // the counter greets a first visit (outfitter.js)
    this.log('known', { ep });
    if (l) this.say(`${l.name} · entry point ${ep}. You know this outfitter now: food here, and a board of its own.`, 7);
    return true;
  }

  // --- starting and ending ---------------------------------------------------------------------------------
  // push-off: { ep, foodDays, canoe, fresh }. fresh: the season's first trip, put in rested with the needs full
  // ('start'); a later one leaves the energy as it is ('leave': a landing is not a refill)
  start(f) {
    const s = this.state, d = this.day;
    s.id = `${f.ep}-${absDay(d.year, d.doy)}-${Math.floor(Math.random() * 1e5).toString(36)}`;
    s.active = true; s.outcome = null; s.camp = null; s.offsite = 0; s.log = [];
    s.since = { year: d.year, doy: d.doy, hours: +d.hours.toFixed(2) }; s.from = f.ep;
    s.packs = { count: 1, canoe: CANOES.includes(f.canoe) ? f.canoe : 'aluminium', foodDays: f.foodDays ?? 0 };
    this.syncKit();
    s.fish0 = this.fishing ? this.fishing.log.length : 0;
    this.lastLake = 0; this.lastPortages = this.stats ? this.stats.portages : 0;
    // the season's first trip: you put in having been up since the morning
    const en = this.energy;
    if (f.fresh && en) { s.wet = false; en.value = 1; en.awakeSince = en.now - Math.min(12, Math.max(0, d.hours - 7)); en.tired = 0; en.lastMealAbs = -1e9; }
    this.seen('eps', f.ep); this.learn(f.ep);
    this.log(f.fresh ? 'start' : 'leave', { ep: f.ep });
  }
  // a trip under way has reached an outfitter's landing (outfitter.js updateTrip): logged as came in, there
  comeIn(ep) {
    if (!this.active) return null;
    this.learn(ep);
    return this.close('completed', 'came in', ep);
  }
  // back at the landing it left without having gone anywhere: no trip after all, and nothing in the logbook
  takeBack() {
    const s = this.state; if (!s.active) return false;
    s.active = false; s.camp = null; s.outcome = null; s.log = [];
    return true;
  }
  abandon() { return this.active ? this.close('abandoned', 'a new season begun', null) : null; }
  close(k, why, ep) {
    const s = this.state, d = this.day, st = this.stats;
    s.outcome = { k, why, ep, at: { year: d.year, doy: d.doy, hours: +d.hours.toFixed(2) } };
    const entry = s.since || { year: d.year, doy: d.doy, hours: d.hours };
    this.book.trips.push({
      id: s.id, mode: s.mode, k, why, from: s.from ?? null, to: ep, entry, end: s.outcome.at,
      days: Math.max(1, absDay(d.year, d.doy) - absDay(entry.year, entry.doy) + 1), packs: s.packs.count, canoe: s.packs.canoe,
      km: st ? +st.km.toFixed(2) : 0, portages: st ? st.portages : 0, lakes: st ? st.lakes.length : 0, nights_out: st ? st.nights.length : 0,
      fish: this.fishing ? Math.max(0, this.fishing.log.length - (s.fish0 || 0)) : 0, offsite: s.offsite || 0,
      resupplies: (s.log || []).filter((e) => e.k === 'resupply').length,
    });
    s.active = false; s.camp = null;
    this.log('exit', { outcome: s.outcome });
    this.saveBook();
    return s.outcome;
  }
  // a fresh, inactive trip in a mode (a new season)
  reset(mode = this.mode) { this.state = blank(mode); this.setMode(mode); this.evacuating = false; this.syncKit(); }

  // --- the evacuation -------------------------------------------------------------------------------------
  // the nearest landing whose outfitter you know (home when nothing else is), else the nearest of all
  nearestKnownOutfitter(x = this.player.x, z = this.player.z) {
    const o = this.outfitter, pr = this.profile; if (!o) return null;
    let best = null, bestD = Infinity;
    for (const l of o.landings) {
      if (pr && !pr.knows(l.ep)) continue;
      const d = Math.hypot(l.x - x, l.z - z);
      if (d < bestD) { bestD = d; best = l; }
    }
    if (!best && pr && pr.home != null) best = this.landing(pr.home);
    return best || (o.nearest(x, z) || {}).l || null;
  }
  // when the bar has sat empty an hour (energy.onEvac): why 'food' | 'water' | 'awake' | 'cold' (the need that ran it down) | 'spent'
  evacuate(why = 'food') {
    if (!this.adventure || !this.active || this.evacuating) return false;
    this.evacuating = true;
    const o = this.outfitter, w = this.world;
    const to = this.nearestKnownOutfitter();
    const lake = to ? w.lakeName(to.lake) || to.place : null;
    const reason = REASONS[why] || REASONS.spent;
    this.log('evac', { why, reason, to: to ? to.ep : null });
    const card = {
      kicker: to ? `${to.name} · entry point ${to.ep}` : 'The outfitter',
      text: `“${pick(LINES[why] || LINES.spent)}”`,
      sub: `You wake at the ${lake ? `${lake} ` : ''}landing at half past seven. The trip is logged as brought in: ${reason}. The tasks are still yours, and there is nothing to pay; the stringer and the rest of the day stayed out there.`,
      fadeIn: 1.6, hold: 5.5, fadeOut: 2.2,
      onDark: async () => {
        if (to && o && o.onTeleport) await o.onTeleport(to.x, to.z);
        const h = this.day.hours; this.day.advance(h < 5 ? WAKE_AT - h : 24 - h + WAKE_AT); // the rest of the day is lost: the next morning
        this.close('evacuated', reason, to ? to.ep : null);
        this.state.wet = false; // a night indoors dries the gear (polish B: it stayed "wet" into the next trip)
        if (to) this.learn(to.ep);
        if (this.fishing && this.fishing.stringer) this.fishing.stringer.length = 0;
        const en = this.energy;
        if (en) { en.sleep(1, 8); en.value = 1; }
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
    // taste (the owner's call, 2026-10-26): only food outside a sealed container is spoiled, a meal (half a day) of it;
    // a barrel with its lid on and the waterproof pack keep theirs dry (inventory.sealed, items.js sealedDef)
    const inv = en && en.inv && typeof en.inv.spoilLoose === 'function' ? en.inv : null;
    let spoiled = 0, kept = null;
    if (inv) { kept = inv.sealedMeals(); spoiled = inv.spoilLoose(Math.min(1, inv.looseMeals())) / 2; }
    else if (en) { spoiled = Math.min(0.5, en.food); en.food = Math.max(0, en.food - spoiled); } // (no inventory: the days of food)
    if (en) en.spend(cold ? 0.5 : 0.25);
    // content C: the bag and the clothes rolled up in a waterproof pack stay dry (kit.js dryKit; main.js sets this.kit)
    let dry = false; try { dry = !!(this.kit && typeof this.kit.dryKit === 'function' && this.kit.dryKit()); } catch { dry = false; }
    if (!dry) this.state.wet = true;
    const inPack = !!(kept && kept.n && kept.box && kept.box.dry), box = kept && kept.n ? (inPack ? 'the portage pack' : 'the barrel') : null;
    const lost = spoiled >= 0.5 ? 'Half a day of food is spoiled' : spoiled > 0 ? 'The last of the food is spoiled' : '';
    const over = `Over you go${cold ? ', into cold water' : ''}.`;
    if (dry && inPack) this.say(`${over}${lost ? ` ${lost}.` : ''} The food, the bag and the clothes stayed dry in the portage pack.`, 7);
    else {
      const food = lost && box ? `${lost}; the food in ${box} stayed dry` : lost || (box ? `The food stayed dry in ${box}` : '');
      if (dry) this.say(`${over}${food ? ` ${food}.` : ''} The bag and the clothes stayed dry in the portage pack.`, 7);
      else this.say(`${over} ${food && !box ? `${food}, and the gear` : food ? `${food}. The gear` : 'The gear'} is wet until a fire dries it.`, 7);
    }
  }

  // --- per frame (game seconds) ------------------------------------------------------------------------------
  update(dt) {
    const p = this.player, d = this.day, s = this.state, adv = this.adventure;
    d.locked = adv;
    // fb5 C: one clock, the pace's own rate wherever you are and whatever you do (pace.js); the boost is the motion's
    d.rate = clockOf(p.pace);
    this.travel = this.travelling(dt);
    if ((this.bookT += dt) > 5) { this.bookT = 0; if (this.bookDirty) this.saveBook(); }
    if (!s.active || p.teleporting) { this.lastMode = p.mode; return; }
    this.watch(dt);
  }
  // travelling: paddling under way, carrying the canoe, walking a portage trail or the woods outside a camp and a yard
  // (player.lapsing, fb3 A; folded in here from main.js's wrapper by fb5 C). A stop of under a second between strokes or
  // steps still counts. It no longer sets the clock (one clock, above).
  travelling(dt) {
    const p = this.player;
    let moving = false;
    if (p.teleporting) moving = false;
    else if (p.landing) moving = true;
    else if (p.mode === 'paddle') moving = Math.abs(p.speed) > 0.3 && !(p.fishing && p.fishing.rodUp);
    else if (p.mode === 'carry') moving = Math.abs(p.speed) > 0.1;
    else if (p.mode === 'walk') moving = Math.abs(p.speed) > 0.1 && (!!p.onTrail || !!p.lapsing);
    this.travelT = moving ? 1 : Math.max(0, this.travelT - dt);
    return this.travelT > 0;
  }
  // what happens on the way: a capsize, a new lake, a portage walked end to end, campsites and landings come by (a
  // landing reached makes its outfitter known)
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
      if (st.portages > this.lastPortages && this.lastTrail) {
        const t = this.lastTrail, l = t.def && t.def.launch[0]; // by place: several trails share a name ("Kawishiwi River – Kawishiwi River")
        this.log('portage', { name: t.name, rods: t.rods });
        this.seen('portages', l ? `${Math.round(l.x)}:${Math.round(l.z)}` : t.name);
      }
      this.lastPortages = st.portages;
    }
    if ((this.seenT -= dt) <= 0) {
      this.seenT = 1;
      for (const c of w.campsites) if (Math.abs(c.x - p.x) < 40 && Math.abs(c.z - p.z) < 40) this.seen('camps', `${Math.round(c.x)}:${Math.round(c.z)}`);
      for (const ep of w.entryPoints) if (Math.abs(ep.x - p.x) < KNOWN_REACH && Math.abs(ep.z - p.z) < KNOWN_REACH) { this.seen('eps', ep.ep); this.learn(ep.ep); }
    }
  }

  // --- saving ------------------------------------------------------------------------------------------------
  serialize() { return this.state; }
  // the outfitter's document: its core (v3; a v2 core loses its dates; any permit either carried is dropped, its
  // push-off kept as since and from), or an old one (no core) brought back as Sandbox
  restoreFrom(doc) {
    if (!doc) { this.setMode(this.mode); return; }
    const c = doc.core;
    if (c && (c.v === 3 || c.v === 2)) {
      const b = blank(c.mode);
      const s = { ...b, ...c, v: 3, packs: { ...b.packs, ...(c.packs || {}) }, log: Array.isArray(c.log) ? c.log : [] };
      const pm = c.permit || null; // a core from before the world cards: the paper's date and entry point stand in for a missing push-off
      if (c.v === 2 || (pm && c.active && !s.since)) s.since = c.active ? stampDate(pm) : null;
      if (c.v === 2 || (pm && s.from == null)) s.from = pm ? pm.ep ?? null : null;
      delete s.permit;
      this.state = s;
    } else {
      const t = doc.trip || {}, s = blank('sandbox'), d = this.day;
      const kevlar = !!(doc.tasks && Array.isArray(doc.tasks.unlocks) && doc.tasks.unlocks.includes('kevlar'));
      s.packs = { count: 1, canoe: kevlar ? 'kevlar' : 'aluminium', foodDays: t.days || 4 };
      if (t.active) {
        const entry = { year: t.startYear ?? d.year, doy: t.startDoy ?? d.doy, hours: t.startHours ?? 8 };
        s.active = true; s.id = `${t.ep}-${absDay(entry.year, entry.doy)}-old`;
        s.since = { ...entry }; s.from = t.ep ?? null;
      }
      this.state = s;
    }
    this.setMode(this.state.mode);
    this.syncKit();
  }
  // words for the menu: "Adventure · day 2", as of a saved date (the title shows the spot saved)
  menuWords(at = null) {
    const m = this.adventure ? 'Adventure' : 'Sandbox';
    if (!this.active) return m;
    this.asOf = at && Number.isFinite(at.year) && Number.isFinite(at.doy) ? at : null;
    const s = `${m} · ${this.dayWords()}`;
    this.asOf = null;
    return s;
  }
}
