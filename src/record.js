// The season's record (round A, stream A: "a sense of progress"; the owner, 2026-10-26). Progress lives in the book
// and on one card, never as standing numbers on the HUD.
//
// The trip card. When a trip ends (you set foot at an outfitter's landing, or someone brings you in), one quiet paper
// card comes up once you are free (no counter, card or fade up): a logbook page with the days, the lakes paddled, the
// portages and their rods, the nights and where, the fish (the species and the best one), what you saw, the photos,
// the notices done and the money, and one line of the trip in words ("Four days out to Lake Insula and back, a bear on
// Ensign"). Few numbers: counts are words; rods, centimetres and dollars stay figures. E or Esc closes it. It is kept
// in the season's record, and the first time one closes a moment says where ("Your trip is in the journal's Record").
//
// The season's record (the journal's Record tab, journal.js recordTab): the trips (each opens its page), the lakes
// paddled against the named lakes on your sheets, the species with the best of each, the portages crossed, what you
// saw by kind, the campsites stayed at, the keepers' stories finished, the photos (a link to the Photos tab), the
// outfitters known, and the firsts, pencilled ("first walleye", "first moose").
//
// What is watched (each read when it is there, so an older build of any of them is harmless):
//   - the trip (trip.js): 'start' / 'leave' begin a draft, 'exit' finishes it into a card; its log has the portages,
//     the camps and the nights' sleep and an evacuation; the tally (trip-stats.js) the lakes, the nights and where, the
//     km. (A capsize is still counted on the card's data, never written: the owner, 2026-10-31, "you don't need to
//     track how often you fall in. That's not really something you need.")
//   - the catch log (fishing.js log, by date): the species, the best of each, the firsts
//   - what you look at (fauna.subjects(): moose, beaver, eagle, gull, raven, loon; the bear on a live visit): a sighting
//     is a deliberate look, not a thing being near (the owner, 2026-10-31: "it basically tells me I saw something when
//     in reality I didn't really see it. I think to see it, we need to have more of an event. Like ... my view, looking
//     at it a little bit longer than just like having it be near me"). The animal is near the middle of the view (CONE
//     degrees off it, plus its own size there), near enough to make out for its size (SIZE × SIGHT metres, further
//     through the long lens, much less in the dark without the lamp), not behind the land, and held there DWELL real
//     seconds (a look that wavers loses FADE a second of it, not the lot). The common birds (COMMON: the loons, which
//     keep round you on every lake, the gulls, the ravens) count once a lake a day; the rest again only well away from
//     the last (AGAIN_M) or hours after it (AGAIN_H). A bear that came to camp unseen (asleep, away) is the trip's line
//     ("a bear at camp"), never a sighting. A look at something worth it says a thought on the lines (muse: "Oh, an
//     eagle.", "A beaver, there by the lodge.", "Loon, close."; the same: "when I do see something noteworthy, it says a
//     little blurb to myself like, oh, an eagle, or oh, a beaver, because I didn't know I saw a bald eagle, but it said
//     I did").
//   - the notices (tasks.js): one turning done on a trip is that trip's; a claim marks it paid wherever it is
//   - the camera (photo.js): pictures taken; the keepers' arcs (npcs.js s.arcs): a story finished at its last beat
//
// Saved as `bwca-canoe:record` (save.js; stream D's slots keep it per season), keyed on profile.seasonId: a new season
// (in place, profile 'season') starts it empty. An older save with no record builds one from what it knows: the
// logbook's trips, the people's memory of the season (npcs.js s.mem: the trips' lakes, the lakes, the carries, the
// campsite lakes, the loons), the catch log, the photos' subjects, the bear's last visit, the arcs and the claims.
//
// gl-d, the trip-end tally (the game-loop round, 2026-11-05; docs/build/game-loop-brief.md stream D): the card counts up,
// one line at a time. As the trip ends the notices done are paid (tasks.js settle: the money lands before anything is
// drawn, so a reload in the middle of the count loses nothing), and the card's tally keeps what it says: each notice
// with its pay ticking into the purse, the notices missed (their lines), the distance, the portages and their rods, the
// lakes newly inked, the fish and their kinds, the photos, the firsts stamped and the one or two milestones that moved
// (milestones.js), ending on the purse. E finishes the count; E again puts it away. Four firsts of the trip itself:
// the first laker, the first carry of 200 rods or more, the first night alone on a lake (no party on its water that
// night: parties.js partiesOn) and the first wind-bound day (a trip day camped with under a kilometre paddled whose
// afternoon wind puts whitecaps on the camp's lake: weather.js windDay, waves.js windHeight). Record v2 keeps the
// milestones as last counted and the titles they gave; a v1 doc loads with none, its cards with no tally.
//
//   record.milestones() → [{ key, words, title, n, of, done }]   record.view().milestones, .titles
//
//   import { record } from './record.js';
//   record.attach({ trip, stats, fishing, fauna, bear, photo, tasks, npcs, profile, world, player, day, camera, hud,
//     title, veil, outfitter, talk, camp, sheets, journal })            (main.js, the round A-A block)
//   record.update(dt)      each frame (real seconds), after the trip
//   record.moments()       the moment hints.js gets (main.js pushes it and wraps hints.due)
//   record.show(id) / close(); record.shown; record.view() (the Record tab's data); record.pageHtml(trip, { book })
//   record.s (the saved doc), record.version (bumps on a change: the journal's signature)
import { Vector3 } from 'three';
import { save } from './save.js';
import { esc, plural, word, longDate, shortDate, weekdayOf } from './hud.js';
import { itemDef } from './items.js';
import { inches, miles } from './units.js';
import { windHeight } from './waves.js';
import { milestonesOf, monthsLeft } from './milestones.js';
import './record.css';

const NS = 'record';
const V = 2;                // gl-d: v2 adds the milestones, the titles and the cards' tally (a v1 doc loads)
const TALLY_STEP = 0.42;   // real seconds between two lines of the tally
const TICK = 0.3;          // real seconds a pay line takes to tick into the purse
const SEA_CAPS = 0.4;      // the wind-wave (m) at which the whitecaps are plain (player.js seaMoments)
const KEEP_TRIPS = 80;     // trip cards kept in a season (the oldest go first)
const KEEP_FIRSTS = 60;
const SHOW_AFTER = 1.4;    // real seconds free after a trip ends before its card comes up
const MOMENT_FOR = 40;     // real seconds after the first card closes that its moment may show
const DWELL = 1.5;         // real seconds of looking at an animal before it counts as seen
const FADE = 0.6;          // dwell lost a real second of looking away (a glance aside costs a little; a second's look away, most of it)
const CONE = 13;           // degrees off the middle of the view an animal may be and still be what you are looking at
const AGAIN_M = 600;       // metres from the last sighting of a kind that make another one
const AGAIN_H = 3;         // game hours after the last sighting of a kind that make another one
const COMMON = new Set(['loon', 'gull', 'raven']); // seen once a lake a day
const LOOK = 0.2;          // real seconds between two looks at what is in view
const CLEARS = 3;          // line-of-sight checks a look (the most central few; the rest wait for the next look)
const POLL = 0.5;          // real seconds between two looks at the notices, the photos, the bear and the catch log
// how big each reads, in metres (its length or its spread, not its height: a loon is a long low shape on the water, a
// soaring eagle its wings), and how far a thing that big is made out by eye: SIGHT × SIZE at the plain view (an eagle
// further than a beaver, a moose furthest). photo.js REACH is the picture's; these are the eye's. The long lens
// narrows the view and reaches further with it; the dark brings it in to a few metres, the lamp's beam to LAMP.
const SIZE = { moose: 3, bear: 1.8, beaver: 0.8, loon: 0.9, eagle: 1.5, gull: 1, raven: 1 };
const SIGHT = 100;
const LAMP = 35;           // metres the headlamp's beam lets you make an animal out in the dark
const DARK = 0.1;          // the share of the reach left in full dark without the lamp
// the thoughts a look says (muse): each kind's, by what it is doing; the notable ones every new sighting (not again
// for a few minutes), a loon when it is close, the commoner birds the first time a trip only (the owner: "Oh, an
// eagle", "oh, a beaver")
const NOTABLE = new Set(['moose', 'bear', 'beaver', 'eagle']);
const MUSE_GAP = 180;      // real seconds before the same kind says a thought again
const LOON_CLOSE = 45;     // metres: a loon this near is worth a word (loons.js: they dive or swim off from about here)
const MUSE = {
  moose: { any: ['Oh. A moose.', 'A moose. Don’t move.', 'Moose. Right there.'], bull: ['A bull moose. Look at that rack.', 'Oh, a bull moose.'],
    calf: ['A moose calf. The cow won’t be far.'], wade: ['A moose, out in the shallows.', 'Moose, standing in the water.'] },
  bear: { any: ['A bear.', 'Oh. That’s a bear.', 'Bear. Right there.'] },
  beaver: { any: ['Oh, a beaver.', 'A beaver, out swimming.', 'Beaver. Look at it go.'], lodge: ['A beaver, there by the lodge.', 'Beaver, by its lodge.'],
    slap: ['A beaver. That was its tail.'] },
  eagle: { any: ['Oh, an eagle.', 'A bald eagle. Look at that.', 'Eagle.'], perch: ['Oh, an eagle.', 'A bald eagle, up in the pine.', 'Eagle, sitting up there.'],
    soar: ['An eagle, way up.', 'Oh, an eagle.', 'Bald eagle, circling.'], strike: ['An eagle, going for a fish.'] },
  loon: { any: ['A loon.', 'There’s a loon.', 'Loons out here.'], close: ['Loon, close.', 'A loon, right there.', 'Oh, a loon. Close.'] },
  gull: { any: ['A gull.', 'Herring gull.'], stand: ['Gulls on the rock.', 'A gull, on the rock.'] },
  raven: { any: ['A raven.', 'Oh, a raven.'] },
};
// how a kind is written
const SEEN = {
  moose: { one: 'a moose', many: 'moose', name: 'moose' },
  bear: { one: 'a black bear', many: 'black bears', name: 'black bear' },
  beaver: { one: 'a beaver', many: 'beavers', name: 'beaver' },
  eagle: { one: 'a bald eagle', many: 'bald eagles', name: 'bald eagle' },
  loon: { one: 'a loon', many: 'loons', name: 'loon' },
  gull: { one: 'a herring gull', many: 'herring gulls', name: 'herring gull' },
  raven: { one: 'a raven', many: 'ravens', name: 'raven' },
};
const SEEN_ORDER = ['moose', 'bear', 'beaver', 'eagle', 'loon', 'gull', 'raven'];
// a fish worth the trip's line, in cm (talk-memory.js GOOD_CM), and its short name there
const GOOD_CM = { walleye: 50, pike: 70, smallmouth: 40, laketrout: 60, crappie: 28, perch: 26 };
const FISH_SHORT = { walleye: 'walleye', pike: 'northern', smallmouth: 'smallmouth', laketrout: 'laker', crappie: 'crappie', perch: 'perch' };
// how an evacuation reads in the line (trip.js REASONS, the need that ran the bar down)
const BROUGHT = { food: 'brought in hungry', water: 'brought in thirsty', awake: 'brought in worn out', cold: 'brought in chilled through', spent: 'brought in spent' };

const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000);
const dateOfAbs = (n) => { const d = new Date(n * 86400000), year = d.getUTCFullYear(); return { year, doy: n - absDay(year, 0) }; };
const absHours = (a) => (a && Number.isFinite(a.year) ? absDay(a.year, a.doy) * 24 + (a.hours || 0) : null);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const realNow = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000);
// "Moose Lake" → "Moose", "Lake One" stays: the way a paddler says it
const short = (name) => (name ? String(name).replace(/^(.+?) Lake$/, '$1') : name);
// "on Lake Two", "on Moose", "on the Kawishiwi River"
const theW = (name) => { const n = short(name); return /( River| Creek| Bay| Narrows| Arm| Rapids)$/.test(n) ? `the ${n}` : n; };
const onW = (name) => `on ${theW(name)}`;
// a water's full name, with "the" before a river's: "Wind Lake", "the Kawishiwi River"
const full = (name) => (/( River| Creek| Bay| Narrows| Arm| Rapids)$/.test(String(name || '')) ? `the ${name}` : name);
const countWords = (n, k) => { const S = SEEN[k] || { one: `${an(k)} ${k}`, many: `${k}s` }; return n === 1 ? S.one : `${word(n)} ${S.many}`; };
const times = (n) => (n === 1 ? '' : n === 2 ? ', twice' : `, ${word(n)} times`);
const money = (n) => `$${Math.round(n)}`;
// the article as it is said: "a 42 cm", "an 81 cm", "an 18 cm", "an 8 kg", "an 11,000"; "an otter", "a unicorn", "an hour"
const an = (w) => {
  const s = String(w == null ? '' : w).trim();
  if (/^\d/.test(s)) { const d = String(Math.floor(parseFloat(s.replace(/,/g, '')))); return /^8/.test(d) || ((d.length === 2 || d.length === 5) && /^1[18]/.test(d)) ? 'an' : 'a'; }
  return /^(?:[aeio]|u(?!n[aeiou]|ni|s[aeiou]|r[aeiou]|ti|k)|hour|honest|heir)/i.test(s) ? 'an' : 'a';
};
// a list of lakes with each name once (the first kept: two waters can carry one name)
const oneEach = (ls) => { const had = new Set(); return ls.filter((l) => { const k = l && l.name; if (!k || had.has(k)) return !k; had.add(k); return true; }); };
// a lake's key in the season's lakes: never integer-like, so the object keeps the order they were first paddled in
const lakeKey = (id, name) => (id ? `l${id}` : `n:${name}`);

const blankDoc = (season, since) => ({
  v: V, season, since, built: null,
  trips: [], lakes: {}, fish: {}, fishSeen: 0, portages: {}, seen: {}, camps: {}, stories: [], storyDone: {},
  photos: { n: 0, next: null }, notices: { done: [], paid: [], base: false }, firsts: [], draft: null, pending: null, bearVisits: null,
  milestones: {}, titles: [],
});

class Record {
  constructor() {
    this.s = null; this.version = 0; this.attached = false; this.dirty = false;
    this.shown = null;          // the trip card up: the trip's id
    this.el = null;
    this.saveT = 0; this.pollT = 0; this.lookT = 0; this.storyT = 0; this.freeT = 0;
    this.eyes = {};             // kind → { dwell, held, at, d } (the looks under way: watchView)
    this.told = {};             // kind → { t, words } (the last thought said of it: real seconds, its words)
    this.toldDay = new Set();   // `${kind}|${day}`: a kind looked at today, off a trip (the commoner birds' one thought)
    this.bearLook = null;       // the bear's visit already seen (one sighting a visit)
    this.closedAt = -1e9;       // real seconds: the last card put away (the moment)
    this._v = new Vector3(); this._e = new Vector3(); this._f = new Vector3();
    // E or Esc puts the card away, ahead of the dot's E and the pause card (a capture listener made at load, as cards.js's)
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (!this.shown || e.repeat) return;
        if (e.code === 'KeyE' || e.code === 'Escape' || e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); if (this.counting && e.code !== 'Escape') this.finishCount(); else this.close(); }
      }, true);
      window.addEventListener('pagehide', () => { if (this.attached && this.dirty) this.write(); });
    }
  }

  attach(o = {}) {
    Object.assign(this, { trip: null, stats: null, fishing: null, fauna: null, bear: null, photo: null, tasks: null, npcs: null, profile: null, world: null, player: null, day: null, camera: null, hud: null, title: null, veil: null, outfitter: null, talk: null, camp: null, sheets: null, journal: null }, o);
    this.attached = true;
    this.load();
    const T = this.trip;
    if (T && typeof T.on === 'function') {
      T.on('start', () => this.began()); T.on('leave', () => this.began());
      T.on('exit', (e) => this.ended(e));
      T.on('portage', (e) => this.portaged(e));
      T.on('sleep', (e) => this.slept(e)); // gl-d: a night alone on a lake
    }
    if (this.profile && this.profile.onChange) this.profile.onChange((what) => { if (what === 'season') this.newSeason(); });
    if (this.hud && this.hud.registerPaper) this.hud.registerPaper('tripcard', () => this.close());
    return this;
  }
  get season() { const p = this.profile; return p && p.seasonId ? p.seasonId : 'none'; }
  get today() { const d = this.day; return d ? absDay(d.year, d.doy) : 0; }
  get nowH() { const d = this.day; return d ? absDay(d.year, d.doy) * 24 + d.hours : 0; }
  get at() { const d = this.day; return d ? { y: d.year, d: d.doy, h: +d.hours.toFixed(2) } : { y: 0, d: 0, h: 0 }; }
  changed() { this.dirty = true; this.version++; }
  write() { this.dirty = false; if (this.s) save.write(NS, this.s); }

  // --- the doc: this season's, a new one, or one built from an older save --------------------------------------------
  load() {
    const d = save.read(NS);
    const ok = d && (d.v === 1 || d.v === V); // (gl-d: a v1 doc is this one with no milestones yet)
    if (ok && d.season === this.season) {
      const b = blankDoc(d.season, d.since);
      this.s = { ...b, ...d, v: V, photos: { ...b.photos, ...(d.photos || {}) }, notices: { ...b.notices, ...(d.notices || {}) } };
      for (const k of ['trips', 'stories', 'firsts', 'titles']) if (!Array.isArray(this.s[k])) this.s[k] = [];
      for (const k of ['lakes', 'fish', 'portages', 'seen', 'camps', 'storyDone', 'milestones']) if (!this.s[k] || typeof this.s[k] !== 'object') this.s[k] = {};
      if (d.v === 1) for (const m of milestonesOf(this)) this.s.milestones[m.key] = m.n; // (what it stood at when the tally began: none of it moved by this trip)
    } else if (ok && d.season !== this.season) {
      this.s = blankDoc(this.season, this.today); // a doc from another season (a slot copied in, say): this one starts empty
      this.baseline();
    } else {
      this.s = this.build(); // an older save, or the first load ever
    }
    // a trip under way with no draft of its own (an older save, or a draft from another trip): one from here
    const T = this.trip;
    if (T && T.active && (!this.s.draft || this.s.draft.id !== T.state.id)) this.s.draft = this.newDraft(true);
    if (T && !T.active) this.s.draft = null;
    this.changed(); this.write();
  }
  // what is already there when the record starts (so none of it is counted again): the catch log, the photos, the
  // notices done and paid, the bear's visits
  baseline() {
    const s = this.s, F = this.fishing, P = this.photo, B = this.bear;
    s.fishSeen = F && Array.isArray(F.log) ? F.log.length : 0;
    s.photos.next = P && P.state ? P.state.nextId : null;
    s.notices.base = false; // (the notices are the outfitter's document's, read at its boot: baseTasks on the first frame)
    s.bearVisits = B && B.s ? B.s.visits | 0 : 0;
  }
  // the notices done and paid when the record began are not this trip's (the first frame in the game, after the
  // outfitter's boot has read them back)
  baseTasks() {
    const s = this.s, Ts = this.tasks;
    if (Ts) {
      for (const t of Ts.active || []) if (t.status === 'done' && !s.notices.done.includes(t.id)) s.notices.done.push(t.id);
      for (const c of Ts.claimed || []) if (!s.notices.paid.includes(c.id)) s.notices.paid.push(c.id);
    }
    s.notices.base = true;
    this.changed();
  }
  newSeason() {
    this.close();
    this.s = blankDoc(this.season, this.today);
    this.baseline();
    this.eyes = {};
    this.changed(); this.write();
  }

  // An older save (no record): the season as the save knows it. The people's memory (npcs.js s.mem) has the season's
  // start, its trips with their lakes, the lakes, the carries, the lakes slept on and the loons; the logbook has the
  // trips' dates; the catch log the fish; the prints their subjects; the bear its last visit; the arcs the stories.
  // (mem.loons, the loons near you, is not read: near is not seen)
  build() {
    const T = this.trip, F = this.fishing, N = this.npcs, B = this.bear;
    const mem = N && N.s && N.s.mem && N.s.mem.v === 1 ? N.s.mem : null;
    const book = T && T.book && Array.isArray(T.book.trips) ? T.book.trips.filter((t) => t && t.k !== 'abandoned') : [];
    const endDay = (t) => (t.end && Number.isFinite(t.end.year) ? absDay(t.end.year, t.end.doy) : null);
    let since = mem && Number.isFinite(mem.since) ? mem.since : null;
    if (since == null) { const e = book.find((t) => t.entry && Number.isFinite(t.entry.year)); since = e ? absDay(e.entry.year, e.entry.doy) : this.today; }
    const s = blankDoc(this.season, since);
    this.s = s;
    s.built = 'old';
    const inSeason = (y, d) => Number.isFinite(y) && absDay(y, d) >= since;
    const lakeId = (name) => this.lakeIdOf(name);
    // the trips: the logbook's of this season, each with what the memory kept of it (matched by its end and where it left)
    const memTrips = mem && Array.isArray(mem.trips) ? mem.trips.slice() : [];
    for (const b of book) {
      const end = endDay(b); if (end == null || end < since) continue;
      const mi = memTrips.findIndex((m) => m.end === end && m.from === b.from);
      const m = mi >= 0 ? memTrips.splice(mi, 1)[0] : null;
      const c = {
        id: b.id || `old-${end}-${b.from}`, n: s.trips.length + 1, k: b.k, why: b.why || '', from: b.from ?? null, to: b.to ?? null,
        entry: b.entry || null, end: b.end || null, days: b.days || 1, km: b.km || 0, old: true,
        lakes: m ? m.lakes.map((n) => ({ id: lakeId(n), name: n })) : [], far: m && m.far ? m.far : null,
        portages: [], nights: [], camps: m ? m.camps.map((n) => ({ key: `lake:${n}`, lake: n })) : [],
        counts: { portages: b.portages || 0, lakes: b.lakes || 0, nights: b.nights_out || 0 },
        fish: this.fishOf(b.entry, b.end), seen: [], photos: 0, notices: [], capsizes: m && m.swim ? 1 : 0, evac: null, firsts: [],
      };
      const pr = this.printsIn(b.entry, b.end); c.photos = pr.length; c.photoOf = pr.map((r) => r.kind).filter(Boolean).reverse();
      c.line = this.lineOf(c);
      s.trips.push(c);
    }
    // the lakes, the carries and the lakes slept on
    for (const n of (mem && mem.lakes) || []) { const id = lakeId(n); s.lakes[lakeKey(id, n)] = { id, name: n, y: null, d: null, n: 0 }; }
    for (const c of s.trips) for (const l of c.lakes) { const k = lakeKey(l.id, l.name); if (s.lakes[k]) s.lakes[k].n++; }
    for (const n of (mem && mem.carries) || []) { const p = this.portageByName(n); s.portages[`n:${n}`] = { name: n, rods: p ? p.rods : null, n: 1, y: null, d: null }; }
    for (const n of (mem && mem.campLakes) || []) s.camps[`lake:${n}`] = { key: `lake:${n}`, words: `a campsite on ${full(n)}`, lake: n, nights: 0, y: null, d: null };
    // the fish, from the catch log, in order (the firsts and the bests with them)
    if (F && Array.isArray(F.log)) {
      for (const e of F.log) if (e && inSeason(e.year, e.doy)) this.addFish(e, { quiet: true });
      s.fishSeen = F.log.length;
    }
    // what was seen: the subjects of the prints (a picture is a look if anything is). Not the loons the people noticed
    // near you, nor the bear's last visit: near is not seen, and a bear in the night is heard (the owner, 2026-10-31)
    for (const p of this.printsIn(null, null)) for (const k of p.subjects || (p.kind ? [p.kind] : [])) if (SEEN[k]) this.addSeen(k, { lake: null, y: p.year, d: p.doy, h: p.hours, quiet: true, old: true });
    s.photos.n = this.printsIn(null, null).length;
    // the firsts the old trips can say: the first portage and the first night out
    const firstOut = s.trips.find((c) => c.counts && c.counts.nights > 0), firstCarry = s.trips.find((c) => c.counts && c.counts.portages > 0);
    if (firstCarry && firstCarry.entry) this.first('portage', 'portage', 'first portage', null, { y: firstCarry.entry.year, d: firstCarry.entry.doy, h: firstCarry.entry.hours || 9 }, firstCarry.id);
    if (firstOut && firstOut.entry) this.first('night', 'night', 'first night out', null, { y: firstOut.entry.year, d: firstOut.entry.doy, h: 21 }, firstOut.id);
    // what each old trip saw, by date: the subjects of its prints (its bear, if the last visit fell in it, is its line's)
    for (const c of s.trips) {
      const a = absHours(c.entry), b = absHours(c.end); if (a == null || b == null) continue;
      const add = (kind, lake, how = null) => { const q = c.seen.find((x) => x.kind === kind); if (q) q.n++; else c.seen.push({ kind, n: 1, lake, h: null, how }); };
      const inTrip = (y, d) => { const h = absDay(y, d) * 24 + 12; return h >= Math.floor(a / 24) * 24 && h <= Math.ceil(b / 24) * 24; };
      for (const p of this.printsIn(c.entry, c.end)) for (const k of p.subjects || (p.kind ? [p.kind] : [])) if (SEEN[k]) add(k, null);
      if (B && B.s && B.s.last && inTrip(B.s.last.y, B.s.last.d)) c.bear = { n: 1, lake: null };
    }
    // each first on the old trip it fell in, by its date
    for (const f of s.firsts) {
      if (f.trip || !Number.isFinite(f.y)) continue;
      const h = absDay(f.y, f.d) * 24 + (f.h || 0), c = s.trips.find((t) => t.entry && t.end && h >= absHours(t.entry) - 1e-6 && h <= absHours(t.end) + 1e-6);
      if (c) f.trip = c.id;
    }
    for (const c of s.trips) { c.firsts = s.firsts.filter((f) => f.trip === c.id).map((f) => f.words); c.line = this.lineOf(c); }
    this.baseline();
    s.fishSeen = F && Array.isArray(F.log) ? F.log.length : 0;
    this.watchStories(true);
    this.sortFirsts();
    return s;
  }
  // a lake's id by its name (the first lake of that name), or 0
  lakeIdOf(name) {
    const w = this.world; if (!w || !name) return 0;
    if (!this.lakeIds) { this.lakeIds = new Map(); w.lakes.forEach((l, i) => { const n = l && (l.displayName || l.name); if (n && !this.lakeIds.has(n)) this.lakeIds.set(n, i + 1); }); }
    return this.lakeIds.get(name) || 0;
  }
  portageByName(name) { const w = this.world; return w && Array.isArray(w.portages) ? w.portages.find((p) => p && p.name === name) || null : null; }
  // the prints taken between two moments (null: since the season began)
  printsIn(from, to) {
    const P = this.photo; if (!P || typeof P.prints !== 'function') return [];
    const a = from ? absHours(from) : (this.s ? this.s.since * 24 : -Infinity), b = to ? absHours(to) : Infinity;
    return P.state.list.filter((r) => { const h = absHours({ year: r.year, doy: r.doy, hours: r.hours }); return h != null && h >= a - 1e-6 && h <= b + 1e-6; });
  }
  // a trip's fish from the catch log, by date: { n, kept, sp: [{ sp, name, n, cm, lake }], best: { sp, name, cm, kg, lake } }
  fishOf(from, to) {
    const F = this.fishing, out = { n: 0, kept: 0, sp: [], best: null };
    if (!F || !Array.isArray(F.log) || !from) return out;
    const a = absHours(from), b = to ? absHours(to) : Infinity;
    for (const e of F.log) {
      const h = absHours({ year: e.year, doy: e.doy, hours: e.hours ?? 12 }); if (h == null || h < a - 1e-6 || h > b + 1e-6) continue;
      out.n++; if (e.kept) out.kept++;
      let r = out.sp.find((q) => q.sp === e.species);
      if (!r) out.sp.push(r = { sp: e.species, name: String(e.name || e.species).toLowerCase(), n: 0, cm: 0, lake: null });
      r.n++; if (e.length > r.cm) { r.cm = e.length; r.lake = e.lake && e.lake !== 'Unnamed water' ? e.lake : null; }
      // the best: the heaviest (a 42 cm smallmouth over a 30 cm perch, a 96 cm pike over them all)
      if (!out.best || (e.weight || 0) > out.best.kg) out.best = { sp: e.species, name: r.name, cm: e.length, kg: e.weight || 0, lake: e.lake && e.lake !== 'Unnamed water' ? e.lake : null };
    }
    out.sp.sort((p, q) => q.n - p.n || q.cm - p.cm);
    return out;
  }

  // --- the season's parts, as they come -------------------------------------------------------------------------------
  // a first: once a season for each (k, key); the trip under way is its trip
  first(k, key, words, lake = null, at = this.at, trip = this.trip && this.trip.active ? this.trip.state.id : null) {
    const s = this.s; if (s.firsts.some((f) => f.k === k && f.key === key)) return false;
    s.firsts.push({ k, key, words, lake: lake || null, y: at.y, d: at.d, h: at.h, trip });
    if (s.firsts.length > KEEP_FIRSTS) s.firsts.splice(0, s.firsts.length - KEEP_FIRSTS);
    this.changed();
    return true;
  }
  sortFirsts() { this.s.firsts.sort((a, b) => (absDay(a.y || 2026, a.d || 1) * 24 + (a.h || 0)) - (absDay(b.y || 2026, b.d || 1) * 24 + (b.h || 0))); }
  addFish(e, { quiet = false } = {}) {
    if (!e || !e.species) return;
    const s = this.s, sp = e.species, lake = e.lake && e.lake !== 'Unnamed water' ? e.lake : null, at = { y: e.year, d: e.doy, h: e.hours ?? 12 };
    let r = s.fish[sp];
    if (!r) {
      r = s.fish[sp] = { name: String(e.name || sp).toLowerCase(), n: 0, kept: 0, best: null, y: at.y, d: at.d, lake };
      this.first('fish', sp, sp === 'laketrout' ? 'first laker' : `first ${r.name}`, lake, at, quiet ? null : undefined); // (gl-d: a laker, as it is said)
    }
    r.n++; if (e.kept) r.kept++;
    if (!r.best || e.length > r.best.cm) r.best = { cm: e.length, kg: e.weight, lake, y: at.y, d: at.d };
    this.changed();
  }
  // a sighting: { lake, y, d, h, x, z, how } (how: a bear's 'camp' or 'night')
  addSeen(kind, o = {}) {
    const s = this.s, r = s.seen[kind] || (s.seen[kind] = { n: 0, y: o.y ?? this.at.y, d: o.d ?? this.at.d, lake: o.lake || null, last: null });
    r.n++;
    if (Number.isFinite(o.x)) r.last = { x: Math.round(o.x), z: Math.round(o.z), h: +this.nowH.toFixed(2) };
    if (r.n === 1) this.first('seen', kind, `first ${(SEEN[kind] || { name: kind }).name}${kind === 'bear' ? ' at camp' : ''}`, o.lake, { y: o.y ?? this.at.y, d: o.d ?? this.at.d, h: o.h ?? this.at.h }, o.old ? null : undefined);
    const D = this.s.draft;
    if (D && !o.old && this.trip && this.trip.active) {
      const q = D.seen.find((x) => x.kind === kind);
      if (q) q.n++; else D.seen.push({ kind, n: 1, lake: o.lake || null, h: o.h ?? this.at.h, how: o.how || null });
    }
    this.changed();
  }

  // --- the trip: a draft from the push-off, a card at the end ---------------------------------------------------------
  newDraft(partial = false) {
    const T = this.trip, s = T ? T.state : null;
    return { id: s ? s.id : null, partial, seen: [], notices: [], photos: 0 };
  }
  began() { this.s.draft = this.newDraft(false); this.changed(); this.write(); }
  portaged(e) {
    if (e && e.name) this.first('portage', 'portage', 'first portage', null);
    if (e && (e.rods || 0) >= 200) this.first('feat', 'carry200', 'first 200-rod carry', null); // gl-d
  }
  // gl-d: a night slept at a site on a lake nobody else's party was on that night (parties.js partiesOn: camped or
  // passing). camp.js logs the sleep in the morning, so the night is the day before when you wake before noon.
  slept(e) {
    const T = this.trip, P = (typeof window !== 'undefined' && window.__game && window.__game.parties) || this.parties || null;
    if (!e || !e.key || !T || !T.active || !P || typeof P.partiesOn !== 'function') return false;
    const [x, z] = String(e.key).split(':').map(Number); if (!Number.isFinite(x)) return false;
    const w = this.world, p = this.player, id = p && p.nearWater ? p.nearWater(x, z, 12) : w && w.lakeIdAt ? w.lakeIdAt(x, z) : 0;
    if (!(id > 0)) return false;
    const at = e.at || { year: this.day.year, doy: this.day.doy, hours: this.day.hours };
    const night = absDay(at.year, at.doy) - ((at.hours ?? 12) < 12 ? 1 : 0);
    let others = null; try { others = P.partiesOn(id, night); } catch { others = null; }
    if (!Array.isArray(others) || others.length) return false;
    return this.first('feat', 'alone', 'first night alone on a lake', (w && w.lakeName(id)) || null);
  }
  // gl-d: a wind-bound day: a whole trip day (the trip out before it began) camped, under a kilometre paddled, and the
  // afternoon's wind (weather.js windDay: the day's peak) puts whitecaps on the camp's lake (waves.js windHeight over the
  // lake's own reach of open water, as wide as the lake)
  windbound(abs, lakeId = null) {
    const T = this.trip, st = this.stats, W = this.weather || (typeof window !== 'undefined' && window.__game && window.__game.weather) || null;
    if (!T || !T.active || !W || typeof W.windDay !== 'function') return false;
    const since = T.state && T.state.since; if (!since || absDay(since.year, since.doy) >= abs) return false;
    const { year, doy } = dateOfAbs(abs);
    const day = st && st.days ? st.days[`${year}-${doy}`] : null;
    if (day && day.km >= 1) return false;
    let id = lakeId;
    if (!id) {
      const c = this.camp && this.camp.camp, log = T.state.log || [];
      const sl = log.slice().reverse().find((q) => q.k === 'sleep' && q.key) || null;
      const [x, z] = c ? [c.x, c.z] : sl ? String(sl.key).split(':').map(Number) : [NaN, NaN];
      if (!c && !sl) return false; // (not camped)
      const p = this.player, w = this.world;
      id = Number.isFinite(x) ? (p && p.nearWater ? p.nearWater(x, z, 12) : w.lakeIdAt(x, z)) : 0;
    }
    const L = id > 0 && this.world ? this.world.lakes[id - 1] : null; if (!L) return false;
    const fetch = 2 * Math.sqrt(((L.cells || 0) * 100) / Math.PI);
    let peak = 0; try { peak = W.windDay(year, doy).peak || 0; } catch { peak = 0; }
    if (windHeight(peak, fetch) < SEA_CAPS) return false;
    return this.first('feat', 'windbound', 'first wind-bound day', this.world.lakeName(id) || null, { y: year, d: doy, h: 15 });
  }
  ended(e) {
    const o = e && e.outcome, T = this.trip;
    if (!o || o.k === 'abandoned' || !T) { this.s.draft = null; this.changed(); return; }
    // gl-d: the pay first (the notices done, a fish notice's fish handed over where you came in), into the purse before
    // the card is made, so the card's notices read paid and a reload mid-count loses nothing
    const pr = this.profile, purse0 = pr && typeof pr.money === 'number' ? pr.money : null;
    let paid = { lines: [], missed: [], total: 0 };
    try { if (this.tasks && typeof this.tasks.settle === 'function') paid = this.tasks.settle({ ep: o.ep ?? null, trip: T }) || paid; } catch (err) { console.warn('record: the tally', err); }
    try { this.watchNotices(); this.watchFish(); this.watchPhotos(); } catch { /* the watchers' own */ }
    let c = null;
    try { c = this.cardOf(T, o); } catch (err) { console.warn('record: the trip card', err); }
    this.s.draft = null;
    if (!c) { this.changed(); this.write(); return; }
    const inked = c.lakes.filter((l) => !this.s.lakes[lakeKey(l.id, l.name)]).map((l) => l.name);
    const before = new Map(milestonesOf(this).map((m) => [m.key, this.s.milestones[m.key] ?? m.n]));
    this.merge(c);
    const after = milestonesOf(this.withTrip(c));
    c.tally = this.tallyOf(c, paid, purse0, pr && typeof pr.money === 'number' ? pr.money : null, inked, before, after);
    this.s.trips.push(c);
    if (this.s.trips.length > KEEP_TRIPS) this.s.trips.splice(0, this.s.trips.length - KEEP_TRIPS);
    this.s.pending = c.id; this.freeT = 0;
    this.changed(); this.write();
  }
  // the card: what the trip's log, the tally and the draft say
  cardOf(T, o) {
    const s = T.state, st = this.stats, log = Array.isArray(s.log) ? s.log : [], D = this.s.draft && this.s.draft.id === s.id ? this.s.draft : null;
    // (brought in: the trip ended where it was called, not the next morning you woke at the landing)
    const evac = log.find((e) => e.k === 'evac'), entry = s.since || { year: o.at.year, doy: o.at.doy, hours: o.at.hours }, end = evac && evac.at ? evac.at : o.at;
    const days = Math.max(1, absDay(end.year, end.doy) - absDay(entry.year, entry.doy) + 1);
    const lakes = []; for (const l of (st && st.lakes) || []) if (l && l.name && !lakes.some((q) => q.id === l.id)) lakes.push({ id: l.id, name: l.name });
    for (const e of log) if (e.k === 'lake' && e.name && !lakes.some((q) => q.id === e.id)) lakes.push({ id: e.id, name: e.name });
    const portages = []; for (const e of log) if (e.k === 'portage' && e.name) { const q = portages.find((p) => p.name === e.name); if (q) q.n++; else portages.push({ name: e.name, rods: e.rods ?? null, n: 1 }); }
    const nights = ((st && st.nights) || []).map((n) => ({ doy: n.doy, where: n.where, key: n.key || null, lake: n.lake || null }));
    // the campsites stayed at: where the nights were, and a night slept at a site (the tent's key)
    const camps = [];
    const addCamp = (key, lake, night) => { if (!key) return; let q = camps.find((c) => c.key === key); if (!q) camps.push(q = { key, lake: lake || this.campLake(key), nights: 0 }); if (night) q.nights++; };
    for (const n of nights) addCamp(n.key, n.lake, true);
    for (const e of log) if (e.k === 'sleep' && e.key && !nights.some((n) => n.key === e.key)) addCamp(e.key, null, true);
    const fish = this.fishOf(entry, end);
    const notices = D ? D.notices.map((n) => ({ ...n, paid: this.s.notices.paid.includes(n.id) })) : [];
    const c = {
      id: s.id, n: this.s.trips.length + 1, k: o.k, why: o.why || '', from: s.from ?? null, to: o.ep ?? null, mode: s.mode,
      entry: { year: entry.year, doy: entry.doy, hours: +(+entry.hours || 0).toFixed(2) }, end: { year: end.year, doy: end.doy, hours: end.hours }, days,
      km: st ? +st.km.toFixed(2) : 0, lakes, far: this.farOf(lakes, s.from), portages, nights, camps,
      fish, seen: D ? D.seen.map((q) => ({ ...q })) : [], photos: D ? D.photos : this.printsIn(entry, end).length, photoOf: this.printsIn(entry, end).map((r) => r.kind).filter(Boolean).reverse(),
      bear: D && D.bear ? { ...D.bear } : null, // (a bear at camp, seen or not: the line's; seen, it is in seen too)
      notices, capsizes: log.filter((e) => e.k === 'capsize').length, evac: evac ? evac.why || 'spent' : null, partial: !!(D && D.partial) || !D,
      firsts: this.s.firsts.filter((f) => f.trip === s.id).map((f) => f.words),
    };
    c.line = this.lineOf(c);
    return c;
  }
  // the record as it will be with this trip in it (the milestones' trips count)
  withTrip(c) { return { s: { ...this.s, trips: [...this.s.trips, c] }, world: this.world }; }
  // the tally the card counts up: what it says, kept on the card (the book draws it still)
  tallyOf(c, paid, purse0, purse1, inked, before, after) {
    const portN = (c.portages || []).reduce((a, p) => a + (p.n || 1), 0), rods = (c.portages || []).reduce((a, p) => a + (p.rods || 0) * (p.n || 1), 0);
    const F = c.fish || { n: 0, sp: [] };
    const moved = [];
    for (const m of after) {
      const b = before.get(m.key) ?? 0;
      if (m.n > b) moved.push({ key: m.key, words: m.words, title: m.title, n0: b, n: m.n, of: m.of, done: m.done, fresh: m.done && b < m.of });
      this.s.milestones[m.key] = m.n;
      if (m.done && !this.s.titles.some((t) => t.key === m.key)) this.s.titles.push({ key: m.key, title: m.title, y: c.end.year, d: c.end.doy, trip: c.id });
    }
    moved.sort((a, b) => (b.fresh ? 1 : 0) - (a.fresh ? 1 : 0) || (b.n / b.of) - (a.n / a.of));
    const total = paid ? paid.total || 0 : 0;
    return {
      pay: (paid && paid.lines ? paid.lines : []).map((l) => ({ id: l.id, title: l.title, pay: l.pay, kind: l.kind, from: l.from })),
      missed: (paid && paid.missed ? paid.missed : []).map((m) => ({ title: m.title, line: m.line })),
      total, purse0, purse1: purse1 != null ? purse1 : purse0 != null ? purse0 + total : null,
      km: c.km || 0, portages: portN, rods, inked, fish: F.n || 0, species: (F.sp || []).length, photos: c.photos || 0,
      firsts: (c.firsts || []).slice(), milestones: moved.slice(0, 2),
    };
  }
  // the season takes the trip's lakes, portages and campsites
  merge(c) {
    const s = this.s, at = { y: c.end.year, d: c.end.doy };
    for (const l of c.lakes) { const k = lakeKey(l.id, l.name), q = s.lakes[k]; if (q) q.n++; else s.lakes[k] = { id: l.id, name: l.name, y: c.entry.year, d: c.entry.doy, n: 1 }; }
    for (const p of c.portages) { const k = `n:${p.name}`, q = s.portages[k]; if (q) q.n += p.n; else s.portages[k] = { name: p.name, rods: p.rods, n: p.n, y: at.y, d: at.d }; }
    for (const q of c.camps) {
      const r = s.camps[q.key];
      if (r) r.nights += q.nights; else s.camps[q.key] = { key: q.key, words: this.campWords(q.key, q.lake), lake: q.lake, nights: q.nights, y: at.y, d: at.d };
    }
    if (c.nights.length) this.first('night', 'night', 'first night out', c.nights[0].lake || null, { y: c.entry.year, d: c.nights[0].doy, h: 21 }, c.id);
    c.firsts = s.firsts.filter((f) => f.trip === c.id).map((f) => f.words);
    this.sortFirsts();
  }
  campLake(key) {
    const w = this.world, p = this.player, [x, z] = String(key).split(':').map(Number);
    if (!w || !Number.isFinite(x)) return null;
    const id = p && p.nearWater ? p.nearWater(x, z, 8) : w.lakeIdAt ? w.lakeIdAt(x, z) : 0;
    return (id > 0 && w.lakeName(id)) || null;
  }
  campWords(key, lake) {
    const w = this.world, [x, z] = String(key).split(':').map(Number);
    const site = w && Number.isFinite(x) ? (w.campsites || []).find((c) => (c.kx ?? Math.round(c.x)) === x && (c.kz ?? Math.round(c.z)) === z) : null;
    if (site && site.name) return `${site.name} campsite`;
    const id = lake ? this.lakeIdOf(lake) : 0, L = id ? w.lakes[id - 1] : null;
    if (L && L.cells >= 1500 && Number.isFinite(x)) {
      const C = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
      const side = C[Math.round((((Math.atan2(x - L.cx, -(z - L.cz)) * 180) / Math.PI + 360) % 360) / 45) % 8];
      return `the ${side} campsite on ${full(lake)}`;
    }
    return lake ? `the campsite on ${full(lake)}` : 'a campsite';
  }
  // the lake furthest from where the trip left (talk-memory.js's "far"): what you would say you went out to
  farOf(lakes, fromEp) {
    const w = this.world, from = w && fromEp != null ? w.entryPoints.find((e) => e.ep === fromEp) : null;
    let far = null, fd = -1;
    for (const l of lakes) { const L = l.id ? w.lakes[l.id - 1] : null; if (!L || !from) continue; const d = Math.hypot(L.cx - from.x, L.cz - from.z); if (d > fd) { fd = d; far = l.name; } }
    return far || (lakes.length ? lakes[lakes.length - 1].name : null);
  }
  landing(ep) { const o = this.outfitter; return o && ep != null ? o.landings.find((l) => l.ep === ep) || null : null; }
  landingLake(ep) { const l = this.landing(ep), w = this.world; return l ? (w.lakeName(l.lake) || l.place || null) : null; }

  // One line of the trip in words: the days, where it went, and the one thing it will be remembered by. "Four days out
  // to Lake Insula and back, a bear on Ensign"; "A day on Lake One"; "Two days out to Lake Three, brought in hungry".
  lineOf(c) {
    const days = c.days <= 1 ? 'A day' : `${cap(word(c.days))} days`;
    const home = this.landingLake(c.from), to = this.landingLake(c.to), back = c.to != null && c.to === c.from;
    const far = c.far || null;
    let shape;
    if (c.k === 'evacuated') shape = far && far !== home ? `out to ${theW(far)}` : home ? onW(home) : 'out';
    else if (back || c.to == null) shape = far && far !== home ? `out to ${theW(far)} and back` : home ? onW(home) : 'out and back';
    else if (far && far !== to && far !== home) shape = `out to ${theW(far)}, in at ${theW(to)}`;
    else shape = home && to ? `from ${theW(home)} to ${theW(to)}` : `in at ${theW(to) || 'a landing'}`;
    const hi = this.highlight(c, shape);
    return `${days} ${shape}${hi ? `, ${hi}` : ''}`;
  }
  // (shape: the line's words so far; a lake it names is not named again: "A day on Lake One, an 81 cm northern")
  highlight(c, shape = '') {
    const onW2 = (lake) => (lake && !String(shape).includes(theW(lake)) ? ` ${onW(lake)}` : '');
    if (c.k === 'evacuated') return BROUGHT[c.evac] || 'brought in';
    const seen = c.seen || [], bear = seen.find((q) => q.kind === 'bear'), moose = seen.find((q) => q.kind === 'moose');
    if (bear) return bear.lake ? `a bear${onW2(bear.lake)}` : 'a bear at camp';
    if (c.bear) return `a bear at camp${c.bear.lake ? onW2(c.bear.lake) : ''}`; // (came in the night, unseen: it still came)
    if (moose) { const when = this.whenWords(moose.h); return `a moose${when}${onW2(moose.lake)}`; }
    // (no "over once": the owner, 2026-10-31, "you don't need to track how often you fall in")
    const b = c.fish && c.fish.best;
    if (b && b.cm >= (GOOD_CM[b.sp] || 999)) return `${an(inches(b.cm))} ${inches(b.cm)}-inch ${FISH_SHORT[b.sp] || b.name}${b.lake !== c.far ? onW2(b.lake) : ''}`;
    const f = (c.firsts || []).find((w) => /^first (?!portage|night)/.test(w) && !/at camp$/.test(w));
    if (f) return `the ${f}`;
    if (c.fish && c.fish.n >= 3) return `${word(c.fish.n)} fish`;
    const eagle = seen.find((q) => q.kind === 'eagle' || q.kind === 'beaver');
    if (eagle) return SEEN[eagle.kind].one;
    if (c.nights && c.nights.length >= 2 && c.camps.length === 1) return `${word(c.nights.length)} nights at one site`;
    return '';
  }
  whenWords(h) {
    const d = this.day, ss = d && d.sunriseSunset ? d.sunriseSunset : {};
    if (!Number.isFinite(h)) return '';
    if (ss.rise != null && h < ss.rise + 1.5) return ' at dawn';
    if (ss.set != null && h > ss.set - 1.5) return ' at dusk';
    return '';
  }

  // --- each frame -----------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.attached || !this.s) return;
    if (this.s.season !== this.season) this.newSeason();
    if (!this.s.notices.base) this.baseTasks();
    const T = this.trip;
    if (T && T.active && (!this.s.draft || this.s.draft.id !== T.state.id)) { this.s.draft = this.newDraft(true); this.changed(); }
    if ((this.pollT += dt) >= POLL) { this.pollT = 0; this.watchFish(); this.watchNotices(); this.watchPhotos(); this.watchBear(); }
    if ((this.storyT += dt) >= 2) { this.storyT = 0; this.watchStories(false); }
    if ((this.lookT += dt) >= LOOK) { const k = this.lookT; this.lookT = 0; this.watchView(k); }
    // gl-d: a day turn on a trip: was the day just gone a wind-bound one
    const today = this.today;
    if (this.dayAbs == null) this.dayAbs = today;
    else if (today > this.dayAbs) { for (let a = Math.max(this.dayAbs, today - 3); a < today; a++) { try { this.windbound(a); } catch (err) { console.warn('record: wind-bound', err); } } this.dayAbs = today; }
    else if (today < this.dayAbs) this.dayAbs = today;
    // the card, once you are free a moment after the trip ended
    if (this.s.pending && !this.shown) {
      if (this.free()) { if ((this.freeT += dt) >= SHOW_AFTER) { const id = this.s.pending; this.s.pending = null; this.changed(); this.show(id); } }
      else this.freeT = 0;
    }
    if ((this.saveT += dt) > 5) { this.saveT = 0; if (this.dirty) this.write(); }
  }
  // main.js runs this before the outfitter's frame: a counter waiting to open by itself (outfitter.pendingShow: after an
  // evacuation, the bunk's morning) waits for the trip's card, which comes first, and opens once it is put away
  beforeOutfitter(o) {
    if (!o || !this.s) return;
    if (this.s.pending || this.shown) {
      if (o.pendingShow) { o.pendingShow = false; this.heldCounter = true; }
      // (the store-door arrival after an evacuation opens the counter the frame it ties up: it waits too)
      if (o.arrival && o.arrival.pending) { o.arrival.pending = false; this.heldCounter = true; }
    }
    else if (this.heldCounter) { this.heldCounter = false; o.pendingShow = true; }
  }
  // nothing else up: the game, no paper, no fade, no counter, no conversation, no camera, no night
  free() {
    const t = this.title, h = this.hud, p = this.player, o = this.outfitter, v = this.veil, c = this.camp, T = this.trip;
    if (t && t.state !== 'game') return false;
    if (h && (h.paper || h.big || h.pin)) return false;
    if (v && v.active) return false;
    if (p && p.teleporting) return false;
    if (T && T.evacuating) return false;
    if (o && (o.open || o.shelfOpen || o.bunking || o.docking || o.arrival)) return false;
    if (this.talk && this.talk.talking) return false;
    if (this.photo && this.photo.raised) return false;
    if (c && (c.dialOpen || c.night || c.busy)) return false;
    return true;
  }
  watchFish() {
    const F = this.fishing; if (!F || !Array.isArray(F.log)) return;
    const s = this.s;
    if (s.fishSeen > F.log.length) s.fishSeen = F.log.length; // (a log cut back: from here)
    for (let i = s.fishSeen; i < F.log.length; i++) { s.fishSeen = i + 1; this.addFish(F.log[i]); }
  }
  // a notice turning done on a trip is the trip's; a claim marks it paid, on the trip's card too
  watchNotices() {
    const Ts = this.tasks; if (!Ts) return;
    const s = this.s, N = s.notices, D = s.draft, active = !!(this.trip && this.trip.active);
    for (const t of Ts.active || []) {
      if (t.status !== 'done' || N.done.includes(t.id)) continue;
      N.done.push(t.id);
      if (D && active) D.notices.push({ id: t.id, title: t.title || 'a notice', pay: t.pay || 0, from: t.from ?? null });
      this.changed();
    }
    for (const c of Ts.claimed || []) {
      if (N.paid.includes(c.id)) continue;
      N.paid.push(c.id);
      if (!N.done.includes(c.id)) { N.done.push(c.id); if (D && active) D.notices.push({ id: c.id, title: c.title || 'a notice', pay: c.pay || 0, from: c.from ?? null }); } // (done and paid in one go: a visitor's, in person)
      for (const tr of s.trips) for (const n of tr.notices || []) if (n.id === c.id) n.paid = true;
      this.changed();
    }
    if (N.done.length > 300) N.done.splice(0, N.done.length - 300);
    if (N.paid.length > 300) N.paid.splice(0, N.paid.length - 300);
  }
  watchPhotos() {
    const P = this.photo; if (!P || !P.state) return;
    const s = this.s, next = P.state.nextId;
    if (s.photos.next == null) { s.photos.next = next; return; }
    if (next > s.photos.next) {
      const k = next - s.photos.next; s.photos.next = next; s.photos.n += k;
      if (s.draft && this.trip && this.trip.active) s.draft.photos += k;
      this.changed();
    }
  }
  // a bear at camp (bear.js: its visits count up when one comes, asleep, awake or away): the trip's, for its line ("a
  // bear at camp"), and not a sighting. Asleep it is heard, away it is the mess you come back to; one you look at on a
  // live visit is seen by the look (watchView's bear)
  watchBear() {
    const B = this.bear; if (!B || !B.s) return;
    const n = B.s.visits | 0, s = this.s;
    if (s.bearVisits == null) { s.bearVisits = n; return; }
    if (n <= s.bearVisits) { s.bearVisits = n; return; }
    const k = n - s.bearVisits; s.bearVisits = n;
    const D = s.draft;
    if (D && this.trip && this.trip.active) {
      const c = this.camp && this.camp.camp, p = this.player, w = this.world;
      const x = c ? c.x : p.x, z = c ? c.z : p.z, id = p && p.nearWater ? p.nearWater(x, z, 30) : 0;
      if (D.bear) D.bear.n += k; else D.bear = { n: k, lake: (id > 0 && w.lakeName(id)) || null };
    }
    this.changed();
  }
  // a keeper's story told to its last beat (npcs.js s.arcs, charOf(ep).arc)
  watchStories(quiet) {
    const N = this.npcs; if (!N || !N.s || !N.s.arcs || typeof N.charOf !== 'function') return;
    const s = this.s;
    for (const [k, st] of Object.entries(N.s.arcs)) {
      const ep = Number(k); if (s.storyDone[ep] || !st) continue;
      let ch = null; try { ch = N.charOf(ep); } catch { ch = null; }
      const beats = ch && ch.arc ? ch.arc.beats : null;
      if (!beats || !(st.b >= beats.length)) continue;
      s.storyDone[ep] = true;
      const done = beats[beats.length - 1].done || {}, first = (ch.vars && ch.vars.k) || 'The keeper';
      const who = (ch.op && ch.op.keeper && ch.op.keeper.name) || first, L = this.landing(ep);
      let gave = '';
      if (done.give && itemDef(done.give)) gave = itemDef(done.give).name || '';
      else if (done.deal) gave = `${Math.round((1 - done.deal) * 100)} percent off at ${first}’s counter`;
      else if (done.secret) gave = 'a site nobody knows';
      else if (done.take === 'berry') gave = 'a pint of berries for the pie';
      const dd = Number.isFinite(st.at) ? dateOfAbs(st.at) : { year: this.at.y, doy: this.at.d };
      s.stories.push({ ep, who, at: L ? L.name : null, gave, y: dd.year, d: dd.doy });
      if (!quiet) this.changed();
    }
  }
  // What you look at. Each look (LOOK s) takes the animals out now and keeps, for each kind, the one nearest the middle
  // of the view: within CONE degrees of where the camera points (plus the half of the animal's own size it spans there,
  // so a moose at twenty metres fills the middle), within its reach (reach), and not behind the land (clear, the most
  // central CLEARS only). The camera is the one the frame draws with, first person or the chase's: on the water the
  // middle of the chase's view is just over the bow, so turning the view onto a thing is the look. Held DWELL real
  // seconds, it is a sighting (sighted) and maybe a thought (muse); a look that wavers loses FADE a second, so a glance
  // at the map or a wave in the way does not start it over. One sighting a look: it has to be let go (the dwell run
  // down) before the same kind is looked at afresh.
  watchView(dt) {
    const eyes = this.eyes, now = new Map();
    // (only while the scene is what you look at: the game, no paper over it, no fade)
    const ok = !(this.title && this.title.state !== 'game') && !(this.hud && (this.hud.paper || this.hud.big)) && !(this.veil && this.veil.active) && !(this.player && this.player.teleporting);
    if (ok && this.camera) {
      const cam = this.camera, e = this._e.setFromMatrixPosition(cam.matrixWorld), f = cam.getWorldDirection(this._f);
      // the plain view is 60° high (the chase's; first person is wider, never shorter for it): a long lens reaches further
      const tanHalf = Math.tan(((cam.fov || 60) * Math.PI) / 360) / (cam.zoom || 1);
      const lens = Math.min(8, Math.max(1, Math.tan(Math.PI / 6) / tanHalf)), cone = Math.min(CONE, (Math.atan(tanHalf) * 180) / Math.PI * 0.6);
      const light = this.lightReach();
      let list = [];
      try { if (this.fauna && typeof this.fauna.subjects === 'function') list = this.fauna.subjects(); } catch { /* the wildlife is fauna.js's */ }
      const bear = this.bearSubject(); if (bear) list = list.concat(bear);
      const cands = [];
      for (const s of list) {
        const size = SIZE[s.kind]; if (!size) continue;
        const dx = s.x - e.x, dy = s.y - e.y, dz = s.z - e.z, d = Math.hypot(dx, dy, dz);
        if (d < 0.5 || d > this.reach(size, lens, light)) continue;
        const off = (Math.acos(Math.min(1, (dx * f.x + dy * f.y + dz * f.z) / d)) * 180) / Math.PI;
        const wide = cone + (Math.atan(size / 2 / d) * 180) / Math.PI;
        if (off > wide) continue;
        const best = cands.find((c) => c.s.kind === s.kind);
        if (!best) cands.push({ s, off, d }); else if (off < best.off) { best.s = s; best.off = off; best.d = d; }
      }
      cands.sort((a, b) => a.off - b.off);
      for (let i = 0; i < cands.length && i < CLEARS; i++) { const c = cands[i]; if (this.clear(e, c.s)) now.set(c.s.kind, c); }
    }
    for (const [k, c] of now) if (!eyes[k]) eyes[k] = { dwell: 0, held: false, at: null, d: 0 };
    for (const [k, q] of Object.entries(eyes)) {
      const c = now.get(k);
      if (c) {
        q.at = c.s; q.d = c.d; q.dwell = Math.min(DWELL + 1, q.dwell + dt);
        if (q.dwell >= DWELL && !q.held) {
          q.held = true;
          const firstHere = this.firstHere(k);
          const fresh = this.sighted(k, c.s);
          this.muse(k, c.s, c.d, fresh, firstHere);
        }
      } else {
        q.dwell = Math.max(0, q.dwell - FADE * dt);
        if (q.dwell <= 0) delete eyes[k]; // (let go: the next look at this kind is a new one)
      }
    }
  }
  // how far a thing `size` metres big is made out: SIGHT × size, times the lens, times the light
  reach(size, lens, light) { const r = SIGHT * size * lens; return light.lamp ? Math.max(r * light.k, Math.min(r, light.lamp)) : r * light.k; }
  // the light to see by: the day's (the sun up to a little under the horizon, all of it; full dark, DARK of it) and the
  // headlamp's beam (LAMP metres, as bright as it is: bear.js eyeshine reads it the same way)
  lightReach() {
    const d = this.day, el = d && Number.isFinite(d.elevation) ? d.elevation : 30;
    const t = Math.min(1, Math.max(0, (el + 12) / 9)), day = t * t * (3 - 2 * t); // (full at -3°, the dusk a moose is out in; dark under -12°)
    const L = this.lamp || (this.bear && this.bear.lamp) || null, lvl = L && L.level > 0.01 ? L.level : 0;
    return { k: DARK + (1 - DARK) * day, lamp: lvl ? LAMP * lvl * (1 - day) : 0 };
  }
  // the bear on a live visit, as a subject (drawn only within 120 m of you: bear.js pose)
  bearSubject() {
    const B = this.bear, v = B && B.visit, w = this.world;
    if (!v || !B.group || !B.group.visible || !Number.isFinite(v.x) || !w) return null;
    return { kind: 'bear', state: v.state, x: v.x, y: w.heightAt(v.x, v.z) + 0.6, z: v.z, h: 1, visit: v };
  }
  // the first look at a kind this trip (off a trip: today), before the look is counted
  firstHere(kind) {
    const D = this.s.draft;
    if (D && this.trip && this.trip.active) return !D.seen.some((q) => q.kind === kind);
    return !this.toldDay.has(`${kind}|${this.today}`);
  }
  // a look held: a sighting if it is a new one (→ true), else the last kept in sight
  sighted(kind, a) {
    const s = this.s, r = s.seen[kind], h = this.nowH, w = this.world, p = this.player;
    this.toldDay.add(`${kind}|${this.today}`);
    const id = (w.lakeIdAt ? w.lakeIdAt(a.x, a.z) : 0) || (p && p.nearWater ? p.nearWater(a.x, a.z, 80) : 0) || (p ? p.lakeId : 0);
    const lake = (id > 0 && w.lakeName(id)) || null;
    // (the first look at a kind on a trip is the trip's, whatever the season had of it: a loon seen on this lake this
    // morning, before you pushed off, is still in the card of the trip you are on)
    const D = s.draft, tripFirst = !!(D && this.trip && this.trip.active && !D.seen.some((q) => q.kind === kind));
    if (kind === 'bear') {
      // once a visit (bear.js: one at a time), at camp; the visit itself is counted by watchBear
      if (a.visit && this.bearLook === a.visit) return false;
      this.bearLook = a.visit || null;
      this.addSeen('bear', { lake, x: a.x, z: a.z, how: 'camp' });
      return true;
    }
    if (COMMON.has(kind)) {
      // once a lake a day: the same loons are about you all day on a lake (loons.js keeps a group round the canoe)
      const key = `${id || 0}|${this.today}`;
      if (r && Array.isArray(r.keys) && r.keys.includes(key) && !tripFirst) return false;
      this.addSeen(kind, { lake, x: a.x, z: a.z });
      const q = s.seen[kind]; if (!(q.keys || []).includes(key)) q.keys = [...(q.keys || []), key].slice(-40);
      return true;
    }
    // the rest: a new one away from where the last was first seen, or hours on (the last is kept in sight meanwhile)
    if (!tripFirst && r && r.last && Math.hypot(a.x - r.last.x, a.z - r.last.z) < AGAIN_M && h - r.last.h < AGAIN_H) { r.last.h = +h.toFixed(2); return false; }
    this.addSeen(kind, { lake, x: a.x, z: a.z });
    return true;
  }
  // The thought a look says, on the lines (hud.note), to yourself: "Oh, an eagle." The notable kinds (NOTABLE) say one
  // at each new sighting and the first look a trip; a loon when it is close (LOON_CLOSE) or the first a trip; the gulls
  // and the raven only the first a trip. Never the same kind again inside MUSE_GAP, never the same words twice running,
  // and not over a conversation.
  muse(kind, a, d, fresh, firstHere) {
    const M = MUSE[kind]; if (!M || !this.hud || typeof this.hud.note !== 'function') return;
    if (this.talk && this.talk.talking) return;
    const close = kind === 'loon' && d < LOON_CLOSE;
    const worth = firstHere || (NOTABLE.has(kind) && fresh) || close;
    if (!worth) return;
    const t = realNow(), T = this.told[kind] || (this.told[kind] = { t: -1e9, words: null });
    if (t - T.t < MUSE_GAP && !(firstHere && NOTABLE.has(kind))) return;
    // the words by what it is doing (fauna.js subjects: its state; a beaver's byLodge; a moose's bull and calf)
    const st = a.state, w = this.world, F = this.fauna;
    let pool = M.any;
    if (kind === 'moose') {
      const wet = F && w && typeof F.levelAt === 'function' && w.heightAt(a.x, a.z) < F.levelAt(a.x, a.z) - 0.15;
      pool = a.calf ? M.calf : st === 'wade' || wet ? M.wade : a.bull && Math.random() < 0.6 ? M.bull : M.any;
    } else if (kind === 'beaver') pool = st === 'slap' ? M.slap : a.byLodge ? M.lodge : M.any;
    else if (kind === 'eagle') pool = st === 'perch' ? M.perch : st === 'strike' ? M.strike : (st === 'soar' && w && a.y - w.heightAt(a.x, a.z) > 25) ? M.soar : M.any;
    else if (kind === 'loon') pool = close ? M.close : M.any;
    else if (kind === 'gull') pool = st === 'stand' ? M.stand : M.any;
    pool = pool && pool.length ? pool : M.any;
    let i = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && pool[i] === T.words) i = (i + 1) % pool.length;
    T.t = t; T.words = pool[i];
    this.hud.note(pool[i], 4);
  }
  // whether the land hides p from the eye (photo.js clear: world.heightAt along the line of sight)
  clear(eye, p) {
    const w = this.world, dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z, L = Math.hypot(dx, dy, dz);
    const n = Math.min(60, Math.max(6, Math.ceil(L / 3)));
    for (let i = 1; i < n; i++) {
      const t = i / n, s = t * L;
      if (s < 1.2 || L - s < 1.5) continue;
      if (w.heightAt(eye.x + dx * t, eye.z + dz * t) > eye.y + dy * t + 0.1) return false;
    }
    return true;
  }

  // --- the card ---------------------------------------------------------------------------------------------------------
  ensure() {
    if (this.el) return;
    const el = this.el = document.createElement('div');
    el.id = 'tripcard'; el.className = 'paper'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'The trip, in the logbook');
    (document.getElementById('journal') || document.body).insertAdjacentElement('afterend', el);
    el.addEventListener('click', (ev) => { if (ev.target.closest('[data-act="close"]')) this.close(); });
  }
  tripById(id) { return this.s ? this.s.trips.find((t) => t.id === id) || null : null; }
  show(id) {
    const c = this.tripById(id); if (!c) return false;
    this.ensure();
    if (this.hud && this.hud.openPaper) this.hud.openPaper('tripcard');
    this.shown = id;
    this.el.innerHTML = `<header><div class="sc kicker">The logbook · trip ${c.n}</div><button type="button" class="stamp outline" data-act="close" aria-label="Close (E or Esc)">Close · E</button></header>${this.pageHtml(c, { live: !!c.tally })}
      <div class="tc-foot"><span class="pencil">in the journal’s Trips</span><span class="keys"><kbd>E</kbd> or <kbd>Esc</kbd> closes</span></div>`;
    this.el.classList.add('show');
    if (c.tally) this.count(c);
    return true;
  }
  // gl-d: the tally, a line at a time (TALLY_STEP apart), each notice's pay ticking into the purse; E finishes it at once
  count(c) {
    this.stopCount();
    const root = this.el, lines = [...root.querySelectorAll('.tl-l')], purse = root.querySelector('[data-purse]'), T = c.tally;
    if (!lines.length) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cur = T.purse0 ?? 0;
    const show = (v) => { if (purse) purse.textContent = money(v); };
    show(cur);
    this.counting = { c, timers: [], done: false };
    if (reduce) { this.finishCount(); return; }
    const timers = this.counting.timers;
    let t = 0.25;
    lines.forEach((li) => {
      const pay = Number(li.dataset.pay || 0);
      timers.push(setTimeout(() => {
        li.classList.add('on');
        if (pay) {
          const from = cur, to = cur + pay, n = 8;
          cur = to;
          for (let k = 1; k <= n; k++) timers.push(setTimeout(() => show(from + ((to - from) * k) / n), (TICK * 1000 * k) / n));
        }
      }, t * 1000));
      t += TALLY_STEP + (pay ? TICK : 0);
    });
    timers.push(setTimeout(() => this.finishCount(), t * 1000 + 50));
  }
  finishCount() {
    const q = this.counting; if (!q) return;
    this.stopCount();
    if (!this.el) return;
    for (const li of this.el.querySelectorAll('.tl-l')) li.classList.add('on');
    const purse = this.el.querySelector('[data-purse]'), T = q.c.tally;
    if (purse && T && T.purse1 != null) purse.textContent = money(T.purse1);
    const box = this.el.querySelector('.tc-tally'); if (box) box.classList.add('counted');
  }
  stopCount() { const q = this.counting; if (q) for (const id of q.timers) clearTimeout(id); this.counting = null; }
  // the tally's lines (live: hidden until the count reaches them)
  tallyHtml(c, { live = false } = {}) {
    const T = c.tally; if (!T) return '';
    const L = [];
    const line = (cls, lab, v, pay = 0) => L.push(`<li class="tl-l ${cls}${live ? '' : ' on'}"${pay ? ` data-pay="${pay}"` : ''}><span class="tl-k">${lab}</span><span class="tl-v">${v}</span></li>`);
    for (const n of T.pay || []) line('pay', `“${esc(n.title)}”`, `<span class="num">+${money(n.pay)}</span>`, n.pay);
    if (T.km >= 0.1) line('stat', 'Paddled', `<span class="num">${miles(T.km)}</span> mi`);
    if (T.portages) line('stat', cap(plural(T.portages, 'Portage')), `${word(T.portages)}${T.rods ? `, <span class="num">${T.rods}</span> rods` : ''}`);
    if (T.inked && T.inked.length) line('stat', 'New on the map', esc(T.inked.slice(0, 4).join(' · ') + (T.inked.length > 4 ? ` and ${word(T.inked.length - 4)} more` : '')));
    if (T.fish) line('stat', 'Fish', `${word(T.fish)}${T.species > 1 ? `, ${word(T.species)} kinds` : ''}`);
    if (T.photos) line('stat', 'Photos', word(T.photos));
    for (const f of T.firsts || []) line('first', '', `<span class="tl-stamp">${esc(cap(f))}</span>`);
    for (const m of T.milestones || []) {
      const pct = Math.round((100 * m.n) / (m.of || 1));
      line(`mile${m.fresh ? ' fresh' : ''}`, esc(cap(m.words)), m.fresh ? `<span class="tl-title">${esc(m.title)}</span>` : `<span class="tl-bar" style="--f:${pct}%" aria-hidden="true"></span><span class="num">${m.n.toLocaleString('en-US')} of ${m.of.toLocaleString('en-US')}</span>`);
    }
    for (const m of T.missed || []) line('missed', `<s>“${esc(m.title)}”</s>`, `<span class="soft">${esc(m.line)}</span>`);
    if (!L.length && T.purse1 == null) return '';
    const purse = T.purse1 != null ? `<div class="tl-purse"><span class="tl-k">Purse</span><b class="num" data-purse>${money(live ? T.purse0 ?? T.purse1 : T.purse1)}</b>${T.total ? `<span class="pencil">+${money(T.total)} this trip</span>` : ''}</div>` : '';
    return `<div class="tc-tally${live ? '' : ' counted'}"><ol class="tl-lines">${L.join('')}</ol>${purse}</div>`;
  }
  close() {
    if (!this.shown) return;
    this.stopCount();
    this.shown = null;
    if (this.el) this.el.classList.remove('show');
    if (this.hud && this.hud.closePaper) this.hud.closePaper('tripcard');
    this.closedAt = realNow();
    if (this.player && this.player.input) this.player.input.paused = false;
  }
  // the logbook page of a trip, for the card and the book (book: the Record tab's page, narrower)
  pageHtml(c, { book = false, live = false } = {}) {
    const e = c.entry, f = c.end, rows = [];
    const firsts = new Set(c.firsts || []);
    const mark = (words) => (firsts.has(words) ? ' <span class="first">first</span>' : '');
    const from = this.landing(c.from), to = this.landing(c.to);
    const dates = e && f ? (e.year === f.year && e.doy === f.doy ? longDate(e.year, e.doy) : `${longDate(e.year, e.doy)} to ${longDate(f.year, f.doy)}`) : '';
    const whereW = c.k === 'evacuated' ? `out from ${from ? from.name : 'a landing'}; brought ${c.to != null && c.to === c.from ? 'back in' : `in to ${to ? to.name : 'the nearest outfitter'}`}`
      : c.to != null && c.to === c.from ? `out from ${from ? from.name : 'a landing'} and back` : `out from ${from ? from.name : 'a landing'}, in at ${to ? to.name : 'a landing'}`;
    // the lakes, the portages, the nights (no Lakes row that only says again what the line above it says: "A day on
    // Lake One" over "Lakes: Lake One")
    const line = this.lineOf(c) || c.line || 'A trip';
    const said = (name) => !!name && new RegExp(`\\b${String(short(name)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(line);
    const cl = oneEach(c.lakes || []);
    if (cl.length) { if (!cl.every((l) => said(l.name))) rows.push(['Lakes', esc(cl.map((l) => l.name).join(' · '))]); }
    else if (c.counts && c.counts.lakes) rows.push(['Lakes', `${word(c.counts.lakes)} ${plural(c.counts.lakes, 'lake')}`]);
    if (c.portages && c.portages.length) rows.push(['Portages', c.portages.map((p, i) => `${esc(p.name)}${p.rods ? `, <span class="num">${p.rods}</span> rods` : ''}${times(p.n)}${i === 0 ? mark('first portage') : ''}`).join('<br>')]);
    else if (c.counts && c.counts.portages) rows.push(['Portages', `${word(c.counts.portages)}`]);
    if (c.nights && c.nights.length) rows.push(['Nights', c.nights.map((n, i) => `<span class="day">${esc(e && Number.isFinite(e.year) ? weekdayOf(e.year, n.doy).slice(0, 3) : '')}</span> ${esc(n.where || 'out')}${i === 0 ? mark('first night out') : ''}`).join('<br>')]);
    else if (c.counts && c.counts.nights) rows.push(['Nights', `${word(c.counts.nights)} out`]);
    else rows.push(['Nights', `<span class="soft">${c.k === 'evacuated' ? 'none out' : 'none out: home the same day'}</span>`]);
    // the fish: how many, the best, the kinds
    const F = c.fish;
    if (F && F.n) {
      const kept = F.kept ? `, ${F.kept === F.n ? (F.n === 1 ? 'kept' : 'all kept') : `${word(F.kept)} kept`}` : ', all let go';
      const best = F.best ? ` The best, ${an(inches(F.best.cm))} <span class="num">${inches(F.best.cm)}</span>-inch ${esc(F.best.name)}${F.best.lake ? ` on ${esc(F.best.lake)}` : ''}.` : '';
      const fw = (q) => (q.sp === 'laketrout' && firsts.has('first laker') ? 'first laker' : `first ${q.name}`);
      const kinds = F.sp.length > 1 || firsts.has(fw(F.sp[0])) ? `<br><span class="soft">${F.sp.map((q) => `${esc(q.name)}${q.n > 1 ? ` ×${q.n}` : ''}${mark(fw(q))}`).join(' · ')}</span>` : '';
      rows.push(['Fish', `${cap(word(F.n))} ${plural(F.n, 'fish', 'fish')}${kept}.${best}${kinds}`]);
    }
    // what was seen
    const seen = (c.seen || []).slice().sort((a, b) => SEEN_ORDER.indexOf(a.kind) - SEEN_ORDER.indexOf(b.kind));
    if (seen.length) rows.push(['Seen', seen.map((q) => `${esc(q.kind === 'bear' ? `${countWords(q.n, 'bear')} at camp` : countWords(q.n, q.kind))}${q.lake && (q.kind === 'moose' || q.kind === 'bear') ? ` ${esc(onW(q.lake))}` : ''}${mark(`first ${SEEN[q.kind] ? SEEN[q.kind].name : q.kind}${q.kind === 'bear' ? ' at camp' : ''}`)}`).join(' · ')]);
    if (c.photos) {
      const tally = {}; for (const k of c.photoOf || []) tally[k] = (tally[k] || 0) + 1;
      const of = Object.entries(tally).map(([k, n]) => (k === 'place' ? (n === 1 ? 'a place' : `${word(n)} places`) : SEEN[k] ? countWords(n, k) : null)).filter(Boolean);
      rows.push(['Photos', `${cap(word(c.photos))} ${plural(c.photos, 'picture')}${of.length ? (c.photos === 1 ? `, of ${esc(of[0])}` : `: ${esc(of.join(', '))}`) : ''}`]);
    }
    // the notices done, and the money
    const N = c.notices || [];
    if (N.length && !c.tally) { // (gl-d: a card with a tally says them there, with their pay)
      rows.push(['Notices', N.map((n) => `“${esc(n.title)}”`).join(' · ')]);
      const paid = N.filter((n) => n.paid).reduce((a, n) => a + (n.pay || 0), 0), owed = N.filter((n) => !n.paid).reduce((a, n) => a + (n.pay || 0), 0);
      const where = [...new Set(N.filter((n) => !n.paid).map((n) => { const l = this.landing(n.from); return l ? l.name : null; }).filter(Boolean))];
      const words = [paid ? `<span class="num">${money(paid)}</span> paid` : '', owed ? `<span class="num">${money(owed)}</span> ${c.tally ? 'paid since' : 'to claim'}${!c.tally && where.length === 1 ? ` at ${esc(where[0])}` : ''}` : ''].filter(Boolean).join(' · ');
      if (words) rows.push(['Money', words]);
    }
    // (no Over row: the owner, 2026-10-31, "you don't need to track how often you fall in")
    const grid = rows.map(([k, v]) => `<div class="lab">${k}</div><div class="v">${v}</div>`).join('');
    const note = c.partial ? '<div class="soft small">The record began part way through this trip.</div>' : c.old ? '<div class="soft small">From the logbook kept before the record.</div>' : '';
    return `<div class="tc-page${book ? ' in-book' : ''}"><h2 class="tc-line">${esc(line)}</h2><div class="tc-sub">${esc(dates)}${dates ? ' · ' : ''}${esc(whereW)}</div>
      ${this.tallyHtml(c, { live: live && !book })}<div class="tc-grid">${grid}</div>${note}</div>`;
  }

  // --- the Record tab's data (journal.js recordTab draws it) --------------------------------------------------------------
  view() {
    const s = this.s, w = this.world, T = this.trip, st = this.stats;
    // the lakes paddled this season, and the trip under way's
    // (round A join: one line a name: a pond by the Lake One portage is "Lake One" too, and the list said it twice)
    const lakes = oneEach(Object.values(s.lakes).map((l) => ({ ...l })));
    if (T && T.active && st) for (const l of st.lakes || []) if (l && l.name && !lakes.some((q) => (q.id && q.id === l.id) || q.name === l.name)) lakes.push({ id: l.id, name: l.name, y: this.day.year, d: l.doy, n: 0, now: true });
    // against the named lakes on your sheets (everything, in Sandbox)
    let reach = 0, onSheets = lakes.length;
    const S = this.sheets;
    if (S && S.open) reach = w.lakes.filter((l) => l && l.name).length;
    else if (S && typeof S.ownedSheets === 'function') {
      for (const sh of S.ownedSheets()) reach += (S.contents(sh.id) || {}).lakes || 0;
      onSheets = lakes.filter((l) => { const L = l.id ? w.lakes[l.id - 1] : null; return !L || S.showsDetail(L.cx, L.cz); }).length;
    }
    const fish = Object.entries(s.fish).map(([sp, r]) => ({ sp, ...r })); // (in the order first caught)
    const portages = Object.values(s.portages);
    if (T && T.active) for (const e of (T.state.log || [])) if (e.k === 'portage' && e.name && !portages.some((p) => p.name === e.name)) portages.push({ name: e.name, rods: e.rods, n: 1, now: true });
    const seen = SEEN_ORDER.filter((k) => s.seen[k]).map((k) => ({ kind: k, ...s.seen[k], words: k === 'bear' ? `${countWords(s.seen[k].n, 'bear')} at camp` : countWords(s.seen[k].n, k) }));
    const camps = Object.values(s.camps);
    const pr = this.profile, o = this.outfitter;
    const known = pr && Array.isArray(pr.known) ? pr.known.map((ep) => this.landing(ep)).filter(Boolean) : [];
    const nights = s.trips.reduce((a, t) => a + ((t.nights && t.nights.length) || (t.counts && t.counts.nights) || 0), 0);
    return {
      since: s.since, trips: s.trips.slice().reverse(), lakes, reach, onSheets, sandbox: !!(S && S.open), fish, portages,
      rods: portages.reduce((a, p) => a + (p.rods || 0) * (p.n || 1), 0), seen, camps, stories: s.stories.slice(), photos: s.photos.n,
      firsts: s.firsts.slice(), earned: pr ? pr.earned || 0 : 0, nights, known, outfitters: o ? o.landings.length : 0, built: s.built,
      milestones: this.milestones(), titles: (s.titles || []).slice(), monthsLeft: monthsLeft(this),
    };
  }
  // gl-d: the milestones as the season stands (milestones.js)
  milestones() { return this.s ? milestonesOf(this) : []; }

  // --- the moment: the first time a trip's card is put away -----------------------------------------------------------------
  moments() {
    return [{ id: 'record', prio: 1, recur: 'once', text: 'Your trip is in the journal’s Trips: {I}, then Journal.',
      due: () => !this.shown && realNow() - this.closedAt < MOMENT_FOR }];
  }
  // gl-d: the first time a count is up, E finishes it (said once, while it counts)
  tallyMoments() {
    return [{ id: 'tally', prio: 1, recur: 'once', text: 'Pay for the notices lands here. {E} to finish the count.',
      due: () => !!(this.shown && this.counting) }];
  }
}

export const record = new Record();
export { SEEN, SIZE, shortDate };
