import * as THREE from 'three';
import { TileGrid } from './grid.js';
import { mulberry32 } from './rng.js';
import { buildItemProp, groundAt } from './props.js';
import { SPECIES as FISH } from './fishing.js';
import { esc, word, plural, fmtKm, shortDate } from './hud.js';
import { itemDef } from './items.js';
import { fmtIn, fmtInUp } from './units.js';
import { flyerHtml, flyerStyle } from './flyers.js'; // the notices as the paper they are, on the cork and in the pile as in the journal
import './flyers.css';

// The board: notices pinned up at each outfitter, the tasks they set, and the money they pay.
//
// Every outfitter keeps its own cork board of four notices: two close by, one a day trip out, one far. One notice changes
// each game day (a bare pin is filled first, else the oldest notice nobody took comes down).
//
// gl-d, the trip-end tally (the game-loop round, 2026-11-05; docs/build/game-loop-brief.md stream D): you hold at most
// LIMIT notices (take refuses a sixth with one line); each one taken has a deadline that fits it (KIND_DAYS: firewood in
// 3 days, a route report in 14), and a day turn past it takes it back with a short line from whoever posted it ("Deb
// got her walleye from the Hendersons."), no penalty, kept for the next tally and the journal (missed). Pay lands at
// the trip's end, not at the board: settle({ ep, trip }) (record.js calls it as the trip ends) pays every notice done,
// from any board, any kind, a visitor's too, before the tally counts it up; the fish a notice of the outfitter you came
// in at still wants are handed over there by themselves (the smallest fitting first, as fishFor picks). A notice done
// between trips (the berries at the counter, a fish handed over at the board) is paid there and then, in one line. The
// board has no claim buttons; claim and turnIn stay as functions (co-op mirrors them).
//
//   tasks.LIMIT, tasks.held(), tasks.dueOf(t), tasks.daysLeft(t), tasks.settle({ ep, trip }) → { lines, missed, total },
//   tasks.on('missed' | 'done' | 'settled' | 'paid', fn) → off, tasks.makeKind(kind, ep, band) (the console, the tests) A notice is one of the kinds in KINDS, a registry of { make, update, onEvent, pay }:
// - fish for the café: any fish, a species, or a species of a size (lake trout only from water 18 m deep or more);
// - a lost item at a campsite a few portages in (a small prop at the site's water edge; E picks it up);
// - a portage to survey (walk it to its far landing, or find its landing).
// Clues are written from the real data: lakes, portage rods, how many portages in, which side of the lake, and whether
// the site is on an island, a point or in a bay, worked out from the tile's own cells. A kept fish that a notice
// wants is kept like any other (in your hand, then the stringer) and the notice is done when you hand it over at the
// board that posted it (fishFor, handIn: the owner, 2026-10-31). A finished notice is paid only at the
// counter that posted it, through the profile (profile.js: earn) or, without one, a purse kept here. Each board is
// saved with the tasks, keyed by entry point.
//
// On the map (hud.js drawMap, the world cards of 2026-10-24) a notice on the go is the keeper's red pencil (hints →
// targetOf): a campsite you know (on a sheet you own, or any map you can see: a store's, Sandbox's) is ringed tight,
// about 150 m, and named ("the island site"); one you don't is ringed by the bay, arm or stretch the notice describes
// (hintFor: 400–700 m, the spot inside the ring, never the whole lake); a laker notice rings the lake's deep middle.

const HOPS = 4;              // portages out from the landing a notice may send you
const RANGE = 14000;         // metres from the landing, as the crow flies
// tuning (the content join's leftover: "the deadfall pays $45, as for a day trip, 13 km out"): the bands go by portages, so
// a medium notice ("a day trip") could lie 13 km out, a full day each way at the pace, and a local one ("close by") 12 km
// (240 sampled at six outfitters); a medium one now lies within BAND_KM.medium m (out and back in a day: 20 km at the
// pace), a local one within BAND_KM.local (an hour or so each way), a far one anywhere in RANGE
const BAND_KM = { local: 7000, medium: 9000 };
const rangeOf = (band) => Math.min(RANGE, BAND_KM[band] ?? RANGE);
const PICKUP = 4;            // metres within which E picks an item up
const ARRIVE = 28;           // metres within which a survey point counts as reached
const SLOTS = ['local', 'local', 'medium', 'far']; // the four pins on every board
const BAND_HOPS = { item: { local: [0, 1], medium: [1, 2], far: [2, 4] }, survey: { local: [0, 1], medium: [1, 2], far: [2, 3] } };
const BAND_WORDS = { local: 'close by', medium: 'a day trip', far: 'far' }; // at the pace (pace.js) a medium notice, 5 km out or so, is there and back in a morning or an afternoon
const DEEP = 18;             // lake trout only count from a lake at least this deep (m)
const TROUT_WATER = 20;      // fishing.js bites lake trout only in lakes this deep, so a trout notice names one
const LENGTH_SKEW = 1.7;     // fishing.js startBite: length = lerp(smallest, largest, random ^ 1.7)
const SIZE_PCT = [0.6, 0.75]; // a size notice asks for a fish between these percentiles of the species' length
const STANDING = 0.25;       // standing with an outfitter for each notice claimed there (profile.raise)
// gl-d: notices held at once, and each kind's deadline in game days from the day it is taken (the owner's table,
// docs/plans/campaigns.md "Board tasks"; the loon count's is its week)
export const LIMIT = 5;
export const KIND_DAYS = { fish: 3, lunch: 3, firewood: 3, berries: 5, item: 7, deadfall: 7, litter: 7, fetch: 7, npc: 7, survey: 10, secchi: 10,
  creel: 10, campsite: 10, beaver: 10, colour: 10, report: 14, photo: 14, pma: 14, iceout: 5, lastcheck: 7, loons: 7 };
const DAYS_ELSE = 7;
const MISSED_KEEP = 30;      // the missed notices kept for the journal
// a missed notice's line, by kind, from whoever posted it ({who}: the first word of the signature; {they}: someone else)
const MISSED_WORDS = {
  fish: ['{Who} got {her} {fish} from {they}.', '{Who} found {her} {fish} elsewhere: {they} brought one in.'],
  lunch: ['The shore lunch went ahead with fish from {they}.'], iceout: ['The smokehouse got its lakers from {they}.'],
  item: ['{Who} found it {themselves} in the end.', 'Somebody else brought it in.'],
  survey: ['The trail crew walked it {themselves}.'], deadfall: ['The trail crew cleared it {themselves}.'], report: ['Word came down the route from {they}.'],
  litter: ['A ranger packed the mess out.'], campsite: ['A ranger checked the site.'], lastcheck: ['The rangers made the last check {themselves}.'],
  beaver: ['The dam report went in without you.'], pma: ['The survey crew walked the trail {themselves}.'],
  secchi: ['The reading went in without you.'], loons: ['The count went in without your numbers.'], creel: ['The creel survey closed without you.'],
  photo: ['They went with somebody else’s picture.'], colour: ['The magazine went with somebody else’s picture.'],
  berries: ['The café found berries from {they}.'], firewood: ['Somebody else brought the wood in.'],
  fetch: ['It came over on the road in the end.'], npc: ['{Who} found another way.'],
};
const THEY = ['the Hendersons', 'a party from Duluth', 'the Scouts', 'the Larsons', 'a couple from Iowa', 'a guide’s party'];
const SHE = /^(Deb|Marge|Lorraine|Mrs|Ruth|Anna|Karen|Linda|Mary|Jean|Sue|Deborah|Ingrid|Elsa)/, HE = /^(Arnie|Hank|Bob|Jim|Olaf|Gus|Leif|Arvid|Mr)/;
// gl-d: the kinds' own words (here and in the modules that wrote them before pay moved to the trip's end) said where a
// notice is paid; they now say it pays when you come in
const PAY_SAYS = [
  [/\s*(?:[A-Z][^.]*?|They) pays? (?:for )?it at (?:their|its) (?:own )?counter, entry point \d+\./g, ' It pays when you come in.'],
  [/\s*Claim it at the board\./g, ' It pays when you come in.'],
];
// (off a trip the pay follows at once, in its own line: then nothing is said of it)
export function payWords(t, onTrip = true) { let s = String(t); for (const [re, w] of PAY_SAYS) s = s.replace(re, onTrip ? w : ''); return s.trim(); }
const SPECIES_PAY = { perch: 12, crappie: 13, smallmouth: 14, pike: 15, walleye: 18, laketrout: 30 };
const SIZE_PAY = 10;
// The way out is paid as well as the work: lost items and surveys add this much a kilometre of the straight line from
// the landing, a far laker a little; nothing past PAY_MAX. The hubs 2 join set $4, $5 and $2 when a canoe made 4–5 km
// a game day (a notice 8 km out was three or four days and $18–24 of food); at the pace a day covers 20–25 km (pace.js),
// so 8 km out is half a day there and back and $3 of food, and the km pay is cut to about a third (sampled over 144
// notices from 24 boards: $16 local, $25 medium, $40 far, from $19, $29 and $50).
const KM_PAY = { item: 1.5, survey: 2, laketrout: 1 };
const PAY_MAX = 60;
const kmFrom = (L, x, z) => +(Math.hypot(x - L.x, z - L.z) / 1000).toFixed(1);
// the map's rings (hints): tight round a known place, else the area the notice describes, never the whole lake
const TIGHT = 150;           // metres round a known campsite or landing
const AREA = [400, 700];     // metres round the bay, arm or stretch of an unknown one
const SITE_LABEL = { island: 'the island site', point: 'the site on the point', bay: 'the site in the bay', shore: 'the campsite' };
const AREA_LABEL = { island: 'the island', point: 'off the point', bay: 'the bay' };
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// the lost things: each lead is the notice's opening, signed by whoever pinned it up
const ITEMS = {
  paddle: { label: 'paddle', float: false, where: 'washed up on the landing rocks', titles: ['Lost: a paddle', 'Paddle left behind'],
    leads: [['We left ahead of a storm and forgot a paddle.', 'the Halvorsen party, cabin 2'], ['Our rental party came back a paddle short: ash, beavertail blade.', 'the rental desk']] },
  locket: { label: 'locket', float: false, where: 'on the rock where the canoes pull up', titles: ['Lost: a gold locket', 'Reward: a locket'],
    leads: [["My grandmother's gold locket slipped its chain.", 'Mrs. Lindqvist, Ely'], ['A gold locket, a wedding picture inside.', 'ask at the counter, any hour']] },
  drybag: { label: 'dry bag', float: true, where: 'still floating below the fire grate', titles: ['Lost: a blue dry bag', 'Dry bag overboard'],
    leads: [['Our blue dry bag went over the side, car keys inside.', 'the Ostrowski party, Duluth'], ['Our Scouts lost a blue dry bag.', 'Troop 21, Cedar Rapids']] },
};
// the fish notices: [what it says, who signed it]. A size notice opens "One walleye of 52 cm or better, kept." and
// gives its reason; a trout notice names a deep lake ({one}: "One laker" or "One laker of 70 cm or better").
const FISH_WORDS = {
  any: { titles: ['Fish wanted', 'Any fish, any size'],
    texts: [['Shore lunch special is short tonight. One fish, any kind, any size. Bring it to the kitchen door.', 'Deb, in the café'], ["Smoker's empty and the regulars are asking. One fish, any kind you keep.", 'the smokehouse out back'], ['The grandkids want to see a real one before supper. Any fish at all.', 'Lorraine, cabin 4']] },
  walleye: { short: 'walleye', title: 'Walleye wanted',
    texts: [["Friday fish fry, and we're one walleye short of a platter. Any size. Dusk on the drop-offs, a jig.", 'Legion Post 248, fish fry'], ["Walleye for the café's sandwich board. One, any size. They come up on the rocks when the light goes.", 'Deb, in the café']],
    size: [["The café's chalkboard special needs a big one.", 'Deb, in the café'], ['A guest wants her picture with a good one before she drives home.', 'the front desk']] },
  pike: { short: 'northern', title: 'Northern wanted',
    texts: [['One northern pike for the smoker, any size. Weedy bays, a spoon or a spinner.', 'the smokehouse out back'], ["A northern for the chowder pot, any size. We'll pick the bones.", 'Arnie, behind the counter']],
    size: [['For the smoker. The little ones are all bones.', 'the smokehouse out back'], ['Settling a bet behind the counter.', 'Arnie, behind the counter']] },
  smallmouth: { short: 'smallmouth', title: 'Smallmouth wanted',
    texts: [['One smallmouth bass for the café. Rocky points in the afternoon; a crankbait if you have one.', 'Deb, in the café'], ["A smallmouth, any size, for a guest who's never tasted one.", 'a guest from Iowa']],
    size: [['Settling a bet behind the counter.', 'Arnie, behind the counter'], ['For the wall by the till.', 'the counter']] },
  crappie: { short: 'crappie', title: 'Crappie wanted', texts: [['Crappie for the fry pan. One will do. They hang in the weeds at dusk; a small jig.', 'Marge, in the kitchen']] },
  perch: { short: 'perch', title: 'Perch wanted', texts: [['The cook wants a yellow perch for her chowder. Any size. Leeches on a bobber in the shallows.', 'the cook']] },
  laketrout: { short: 'laker', title: 'Lake trout wanted',
    texts: [["{one} for the lodge's anniversary supper. They hold deep and cold in {lake}{where}, down to {depth} feet. A spoon, deep, and bring it back cold.", 'the lodge kitchen'], ['{one} for the smoker. Deep water only, like {lake}{where}: it goes down {depth} feet. Let the spoon sink.', 'Arnie, smokehouse']] },
};
const SURVEY_WORDS = {
  walk: { titles: ['Portage report wanted', 'Trail crew: a portage to walk'],
    whys: ["Word is there's blowdown since the storm.", 'A group goes through next week.', 'Beavers have been at the low end again.'] },
  landing: { titles: ['Landing report wanted'], whys: ['A group goes through next week.', 'Someone said the put-in is under water.'] },
};
const THANKS = ['Much obliged.', 'That is the one. Thank you kindly.', 'Knew you would.', 'Good. That settles it.'];

// placeholder rewards from before money; kept so old saves (and the migration to owned items) can read them
export const UNLOCKS = [
  { key: 'mepps', label: 'a Mepps Aglia spinner' }, { key: 'daredevle', label: 'a red-and-white Daredevle' }, { key: 'rapala', label: 'a jointed Rapala' },
  { key: 'kevlar', label: 'a Kevlar canoe (lighter on the portages)' }, { key: 'jig', label: 'a jig and twister tail' },
  { key: 'silverminnow', label: 'a Johnson Silver Minnow' }, { key: 'lazyike', label: 'a Lazy Ike' }, { key: 'fisher', label: 'the old Fisher map sheets' },
];
const UP = new THREE.Vector3(0, 1, 0);
const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const compass = (dx, dz) => COMPASS[Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) / 45) % 8];
const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000); // as trip.js
const pickR = (rng, list) => (list.length ? list[Math.floor(rng() * list.length)] : null);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const poss = (name) => (/s$/.test(name) ? `${name}’` : `${name}’s`); // Sawbill Canoe Outfitters’ board, Tuscarora Lodge’s
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : ''));
const hopsText = (h) => (h == null ? '' : h === 0 ? ', right off this landing' : h === 1 ? ', one portage in' : `, ${word(h)} portages in`);
const fishName = (sp) => (FISH[sp] ? FISH[sp].name.toLowerCase() : 'fish');
// a fish of the size at percentile q of what the species bites at (fishing.js: lerp by random ^ 1.7)
export function sizeAt(species, q) { const s = FISH[species]; return s ? Math.round(s.length[0] + (s.length[1] - s.length[0]) * Math.pow(q, LENGTH_SKEW)) : 0; }
// the band districts of the Superior National Forest, for the trail crew's notices
const district = (ep) => (ep <= 20 ? 'LaCroix' : ep <= 33 ? 'Kawishiwi' : ep >= 40 && ep <= 70 ? 'Gunflint' : 'Tofte');
// content A: the clue writer's words and numbers, for the kinds written in other modules (task-kinds.js)
export const WORDS = { hopsText, compass, pickR, kmFrom, cap, fill, poss, district, fishName, absDay };
export const NUMBERS = { HOPS, RANGE, BAND_KM, DEEP, TROUT_WATER, SPECIES_PAY, PAY_MAX, KM_PAY, TIGHT, AREA, SITE_LABEL, AREA_LABEL, BAND_WORDS, STANDING };

// --- the kinds ---------------------------------------------------------------------------------------------------
// A kind: { label, weight: { local, medium, far }, make(tasks, ctx) → fields | null (may be async), pay(t) → dollars,
// update(tasks, t, dt) while taken on, onEvent(tasks, t, ev) → words when it took the event, progress(t) → words }.
// ctx: { ep, band, rng, landing, reach, board }. A kind with an E action sets tasks.inReach in update and acts in
// use(tasks, t). Phase 2 and 3 kinds (photos, fetch, berries) register the same way.
// Content pass 1 (stream A) added hooks a kind may have: onTake(tasks, t) when it is taken on (a disk lent), onDrop(t)
// when let go, onClaim(tasks, t) when it is paid (the disk handed back, the litter into the bin), cleanup(tasks, t)
// when its prop leaves the scene (an obstacle off the trail), target(tasks, t) → its one pencil ring and targets(tasks,
// t) → several (a route's lakes), fraction(t) → 0..1 for the book, doneWords(t) for the notice once done. The new kinds
// are in task-kinds.js.
export const KINDS = {};
export function registerKind(key, def) { KINDS[key] = { key, label: key, weight: { local: 1, medium: 1, far: 1 }, ...def }; return KINDS[key]; }

registerKind('fish', {
  label: 'For the kitchen', weight: { local: 1.4, medium: 1.2, far: 1.1 }, handsIn: true,
  make(T, c) {
    const onBoard = new Set(c.board.map((t) => t && t.kind === 'fish' && (t.species || 'any')).filter(Boolean));
    const fresh = (sp) => !onBoard.has(sp);
    let species = null, minCm = 0;
    if (c.band === 'far') {
      const trout = T.troutLake(c.landing, c.reach);
      if (trout && fresh('laketrout')) {
        const sizeIt = c.rng() < 0.3;
        const W = FISH_WORDS.laketrout, lake = trout.l.name, depth = Math.round(T.depthOf(trout.l.id) * 3.28084); // (d1 lakes: the DNR's depth; in feet for the words)
        const where = trout.hops != null ? hopsText(trout.hops) : `, ${fmtKm(trout.d / 1000)} miles ${compass(trout.l.cx - c.landing.x, trout.l.cz - c.landing.z)} of here`;
        minCm = sizeIt ? sizeAt('laketrout', SIZE_PCT[0] + c.rng() * (SIZE_PCT[1] - SIZE_PCT[0])) : 0;
        const [say, sign] = pickR(c.rng, W.texts), text = fill(say, { one: minCm ? `One laker of ${fmtInUp(minCm)} or better` : 'One laker', lake, depth, where });
        return { species: 'laketrout', minCm, need: 1, lakeHint: trout.l.id, km: +(trout.d / 1000).toFixed(1), title: minCm ? 'A big laker' : W.title, text, sign, hint: T.hintFor(trout.l.id, null, 'lakers, deep') };
      }
      species = pickR(c.rng, ['walleye', 'pike'].filter(fresh)) || 'walleye';
      minCm = sizeAt(species, SIZE_PCT[1] - c.rng() * 0.05);
    } else if (c.band === 'medium') {
      species = pickR(c.rng, ['walleye', 'pike', 'smallmouth'].filter(fresh)) || 'walleye';
      if (species !== 'walleye' || c.rng() < 0.5) minCm = sizeAt(species, SIZE_PCT[0] + c.rng() * (SIZE_PCT[1] - SIZE_PCT[0]));
    } else {
      const choices = ['any', 'any', 'walleye', 'pike', 'smallmouth', 'perch', 'crappie'].filter(fresh);
      const sp = pickR(c.rng, choices.length ? choices : ['any']);
      species = sp === 'any' ? null : sp;
    }
    if (!species) {
      const W = FISH_WORDS.any;
      const [text, sign] = pickR(c.rng, W.texts);
      return { species: null, minCm: 0, need: 1, title: pickR(c.rng, W.titles), text, sign };
    }
    const W = FISH_WORDS[species];
    if (minCm) {
      const [why, sign] = pickR(c.rng, W.size || FISH_WORDS.smallmouth.size);
      return { species, minCm, need: 1, title: `A big ${W.short}`, text: `One ${fishName(species)} of ${fmtInUp(minCm)} or better, kept. ${why}`, sign };
    }
    const [text, sign] = pickR(c.rng, W.texts);
    return { species, minCm: 0, need: 1, title: W.title, text, sign };
  },
  pay(t) { return t.species ? Math.min(PAY_MAX, (SPECIES_PAY[t.species] || 12) + (t.minCm ? SIZE_PAY : 0) + (t.species === 'laketrout' ? Math.round(KM_PAY.laketrout * (t.km || 0)) : 0)) : 8; },
  // a kept fish this notice wants: the species, the size, and lake trout only from deep water (a fish kept before the
  // lake was written on it is taken at its word: fishing.js bites lake trout only in deep water anyway)
  fits(T, t, ev) {
    if (!ev.kept || t.status !== 'open') return false;
    if (t.species && t.species !== ev.species) return false;
    if (t.minCm && Math.round(ev.cm) < t.minCm) return false;
    if (ev.species === 'laketrout' && ev.lake) { const l = T.lakeRec(ev.lake); if (!l || T.depthOf(l.id) < DEEP) return false; } // (d1 lakes)
    return true;
  },
  // The owner (2026-10-31): "keep the fish on the stringer like normal and require the user to bring that fish back to
  // wherever it needs to go instead of it just disappearing". A catch no longer fills a cooler: the fish is yours, and
  // the notice is done when you hand a fitting one over at its own board (Tasks.handIn). An old save's full cooler
  // still claims as it did.
  progress(t) {
    const c = t.cooler || [];
    if (t.status === 'done' && c.length) return `in the cooler: ${c.map((f) => `${fishName(f.species)}, ${fmtIn(f.cm)}`).join('; ')}`;
    const f = LIVE && LIVE.fishFor(t), L = LIVE && LIVE.landing(t.from);
    const there = L ? `${L.name}, entry point ${L.ep}` : 'the outfitter';
    return f ? `a ${f.words} with you: bring it to ${there}` : `not caught yet · it goes to ${there}`;
  },
  fraction(t) { return t.status === 'done' ? 1 : LIVE && LIVE.fishFor(t) ? 0.5 : 0; },
  // with a fitting fish on you, the pencil rings the outfitter it goes to; else the notice's own water
  target(T, t) {
    if (t.status !== 'open' || !T.fishFor(t)) return undefined;
    const L = T.landing(t.from);
    return L ? { x: Math.round(L.x), z: Math.round(L.z), r: TIGHT, label: `the fish to ${L.name}`, tight: true } : undefined;
  },
});

registerKind('item', {
  label: 'Lost and found', weight: { local: 0.9, medium: 1, far: 1 },
  async make(T, c) {
    const w = T.world, L = c.landing, [h0, h1] = BAND_HOPS.item[c.band], cands = [];
    w.campsites.forEach((s, i) => {
      const d = Math.hypot(s.x - L.x, s.z - L.z);
      if (d > rangeOf(c.band) || T.used('item', i)) return;
      const r = c.reach.get(T.basinOf(T.lakeNear(s.x, s.z)));
      if (r && r.hops >= h0 && r.hops <= h1) cands.push({ s, i, d, hops: r.hops });
    });
    const pool = (c.band === 'far' ? cands.sort((a, b) => b.hops - a.hops || a.d - b.d) : cands.sort((a, b) => a.d - b.d)).slice(0, 14);
    for (let attempt = 0; attempt < 4 && pool.length; attempt++) {
      const cand = pool.splice(Math.floor(c.rng() * pool.length), 1)[0];
      const tg = await T.peek(cand.s.x, cand.s.z);
      if (!tg) continue;
      const lakeId = lakeNearGrid(tg, cand.s.x, cand.s.z, 8), r = c.reach.get(T.basinOf(lakeId));
      if (!lakeId || !r || r.hops < h0 || r.hops > h1) continue;
      const held = new Set(c.board.map((t) => t && t.kind === 'item' && t.item).filter(Boolean)); // not two dry bags on one board
      const key = pickR(c.rng, Object.keys(ITEMS).filter((k) => !held.has(k))) || pickR(c.rng, Object.keys(ITEMS)), item = ITEMS[key];
      const spot = shoreSpot(tg, cand.s.x, cand.s.z, item.float);
      if (!spot) continue;
      const feature = siteFeature(tg, cand.s.x, cand.s.z), lake = T.lakeRec(lakeId);
      const name = T.lakeName(lakeId) || (lake && lake.cells < 400 ? 'a little pond' : 'an unnamed lake');
      const site = { island: 'the island site', point: 'the site out on a point', bay: 'the site tucked into a bay', shore: 'the campsite' }[feature];
      const body = /river|creek/i.test(name) ? 'the river' : 'the lake';
      const dir = lake && lake.cells >= 2500 ? (feature !== 'island' ? ` on the ${compass(cand.s.x - lake.cx, cand.s.z - lake.cz)} side of ${body}` : ` toward the ${compass(cand.s.x - lake.cx, cand.s.z - lake.cz)} end`) : '';
      const [lead, sign] = pickR(c.rng, item.leads), text = `${lead} ${cap(name)}${hopsText(r.hops)}: ${site}${dir}${dir ? ',' : ''} ${item.where}.`;
      return { key: cand.i, item: key, label: item.label, site: cand.i, lakeId, spot, feature, hops: r.hops, km: kmFrom(L, spot.x, spot.z), title: pickR(c.rng, item.titles), text, sign, hint: T.hintFor(lakeId, cand.s, AREA_LABEL[feature] || null) };
    }
    return null;
  },
  pay(t) { return Math.min(PAY_MAX, 15 + 5 * (t.hops ?? 1) + Math.round(KM_PAY.item * (t.km || 0))); },
  update(T, t) {
    const p = T.player, w = T.world, s = t.spot;
    if (!s) return;
    let m = T.props.get(t.id);
    if (!m && w.isReady(s.x, s.z)) {
      m = buildItemProp(t.item, t.id);
      // on the drawn ground (props.js groundAt), lying with its slope
      const e = 0.25, gx = groundAt(w, s.x + e, s.z) - groundAt(w, s.x - e, s.z), gz = groundAt(w, s.x, s.z + e) - groundAt(w, s.x, s.z - e);
      const up = ITEMS[t.item] && ITEMS[t.item].float ? UP : new THREE.Vector3(-gx, 2 * e, -gz).normalize();
      m.position.set(s.x, groundAt(w, s.x, s.z) - 0.004, s.z);
      m.quaternion.setFromUnitVectors(UP, up).multiply(new THREE.Quaternion().setFromAxisAngle(UP, t.id * 1.7));
      T.scene.add(m); T.props.set(t.id, m);
    }
    if (m && ITEMS[t.item] && ITEMS[t.item].float) m.position.y = w.levelAt(s.x, s.z) + (T.water ? T.water.waveAt(s.x, s.z) : 0) - 0.12;
    // in reach from the canoe or on foot: the prompt now, and E next frame, before the shore's "Go ashore" takes it
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d < PICKUP && (p.mode === 'paddle' || p.mode === 'carry' || p.mode === 'walk') && !p.landing && !p.teleporting) {
      p.prompt = { key: 'E', text: `Pick up the ${t.label}` };
      T.inReach = t;
    }
  },
  use(T, t) {
    t.status = 'done'; T.removeProp(t.id);
    if (T.audio) T.audio.paddleDip();
    T.note(`You have the ${t.label}. It pays when you come in.`); // gl-d: the tally pays it, wherever you come in
    T.changed(); T.boardChanged();
  },
  progress(t) { return `the ${t.label} is still out there`; },
});

registerKind('survey', {
  label: 'Portage crew', weight: { local: 0.8, medium: 1, far: 0.9 },
  make(T, c) {
    const w = T.world, L = c.landing, [h0, h1] = BAND_HOPS.survey[c.band];
    let cands = [];
    w.portages.forEach((p, i) => {
      if (p.rods < 15 || T.used('survey', i)) return;
      const d = Math.hypot(p.pts[0][0] - L.x, p.pts[0][1] - L.z);
      if (d > rangeOf(c.band)) return;
      const ra = c.reach.get(T.basinOf(p.launch[0].lake)), rb = c.reach.get(T.basinOf(p.launch[1].lake));
      if (!ra && !rb) return;
      const near = (ra ? ra.hops : 99) <= (rb ? rb.hops : 99) ? 0 : 1, hops = Math.min(ra ? ra.hops : 99, rb ? rb.hops : 99);
      if (hops < h0 || hops > h1) return;
      const toName = T.lakeName(p.launch[1 - near].lake), fromName = T.lakeName(p.launch[near].lake);
      if (!toName || toName === fromName) return; // unnamed channels carry the nearest lake's name: skip "from X to X"
      cands.push({ p, i, near, hops, d, toName, fromName });
    });
    if (!cands.length) return null;
    if (c.band === 'far' && cands.some((x) => x.p.rods >= 80)) cands = cands.filter((x) => x.p.rods >= 80); // far is a long carry
    // far: the long way in and the long carries first; nearer bands: the nearest few
    const sorted = c.band === 'far' ? cands.sort((a, b) => b.hops - a.hops || b.p.rods - a.p.rods) : cands.sort((a, b) => a.d - b.d);
    const cand = pickR(c.rng, sorted.slice(0, c.band === 'far' ? 6 : 10));
    const { p, near, hops, toName, fromName } = cand, far = 1 - near;
    const fromLake = T.lakeRec(p.launch[near].lake), sign = c.rng() < 0.5 ? `the ${district(c.ep)} trail crew` : 'the portage crew';
    const base = { key: cand.i, portage: cand.i, rods: p.rods, hops, lakeId: p.launch[near].lake, to: toName, sign };
    if (fromName && c.rng() < 0.4) {
      // a named point: the landing of the portage, on this side
      const W = SURVEY_WORDS.landing, dir = fromLake && fromLake.cells >= 2500 ? ` at the ${compass(p.launch[near].x - fromLake.cx, p.launch[near].z - fromLake.cz)} end` : '';
      const target = { x: p.launch[near].x, z: p.launch[near].z };
      return { ...base, target, km: kmFrom(L, target.x, target.z), title: pickR(c.rng, W.titles), text: `${hops === 0 ? `On ${fromName}, right off this landing,` : `Paddle to ${fromName}${hopsText(hops)}, and`} find the ${p.rods}-rod portage to ${toName}${dir}. How's the landing? ${pickR(c.rng, W.whys)}`, hint: T.hintFor(p.launch[near].lake, target) };
    }
    const W = SURVEY_WORDS.walk, end = far === 0 ? p.pts[0] : p.pts[p.pts.length - 1];
    const target = { x: end[0], z: end[1] };
    const from = fromName ? `from ${fromName}` : `off ${p.name.split(/\s[–-]\s/)[0]}`;
    return { ...base, target, km: kmFrom(L, target.x, target.z), title: pickR(c.rng, W.titles), text: `Walk the ${p.rods}-rod portage ${from} to ${toName}${hopsText(hops)}. How's the far landing? ${pickR(c.rng, W.whys)}`, hint: T.hintFor(p.launch[near].lake, target) };
  },
  pay(t) { return Math.min(PAY_MAX, 10 + Math.round((t.rods || 0) / 25) + Math.round(KM_PAY.survey * (t.km || 0))); },
  update(T, t) {
    const p = T.player;
    if (t.target && Math.hypot(t.target.x - p.x, t.target.z - p.z) < ARRIVE) {
      t.status = 'done';
      T.note('Noted. It pays when you come in.'); // gl-d
      T.changed();
    }
  },
  progress(t) { return t.rods ? `${t.rods} rods, not walked yet` : 'not there yet'; },
});

// --- the tasks ----------------------------------------------------------------------------------------------------
// the tasks the page runs (the catch kinds' progress reads what you carry through it)
let LIVE = null;
export const fishWith = (t) => (LIVE ? LIVE.fishFor(t) : null);
export class Tasks {
  constructor(world, scene, player, { audio = null, water = null } = {}) {
    LIVE = this;
    this.world = world; this.scene = scene; this.player = player; this.audio = audio; this.water = water;
    this.day = null; this.fishing = null; this.outfitter = null; // attach()
    this.ads = new Map();       // id -> notice (offered, open or done); claimed ones leave
    this.boards = {};           // ep -> { slots: [id | null] × 4, day, n, pending: [slot] }
    this.filling = new Map();   // ep -> the promise writing up that board's empty pins
    this.tally = { item: 0, survey: 0, fish: 0 }; this.unlocks = [];
    this.purse = 0;             // money earned here when there is no profile to pay into
    this.earned = 0;            // all the boards have paid this season
    this.claimed = [];          // the last few notices paid: { id, kind, title, from, pay, day }
    this.nextId = 1; this.seed = (Date.now() & 0xffff) || 1;
    this.props = new Map();     // notice id -> mesh in the scene
    this.peeks = new Map();     // tile key -> TileGrid fetched for the clue writer alone
    this._graph = null;
    this.inReach = null;        // the notice whose E is offered this frame (kind.update sets it, before() acts on it)
    this.onNote = null; this.onChange = null; this.onBoard = null;
    // gl-d: the notices gone past their day (kept for the tally and the journal), the listeners, the day last looked at
    // for deadlines, and the notices already heard as done
    this.missed = [];           // [{ id, kind, title, from, line, abs, told }]
    this.handlers = new Map();
    this.dueDay = null; this.doneSeen = new Set();
    this.reachOf = null;        // gl-d: (ep) → [entry points] an outfitter serves (stream B's outfitters.js reachOf), when there is one
    injectCss();
  }
  // --- gl-d: listeners, held notices, deadlines ------------------------------------------------------------------------
  on(evt, fn) { if (!this.handlers.has(evt)) this.handlers.set(evt, new Set()); this.handlers.get(evt).add(fn); return () => this.handlers.get(evt).delete(fn); }
  emit(evt, data) { for (const fn of this.handlers.get(evt) || []) { try { fn(data, this); } catch (e) { console.warn('tasks.on', evt, e); } } }
  get LIMIT() { return LIMIT; }
  // the notices you hold: taken on and not yet paid (on the go or done), from any board or anyone
  held() { return this.active; }
  daysFor(t) { return KIND_DAYS[t && t.kind] ?? DAYS_ELSE; }
  // the last day a notice may be done on (its taken day + its kind's days)
  dueOf(t) { if (!t) return null; if (!Number.isFinite(t.due)) t.due = (Number.isFinite(t.taken) ? t.taken : this.today()) + this.daysFor(t); return t.due; }
  daysLeft(t) { const d = this.dueOf(t); return d == null ? null : d - this.today(); }
  // a co-op guest mirrors the host's notices: the host keeps their deadlines and their pay
  get mirror() { const g = typeof window !== 'undefined' ? window.__game : null, c = g && g.coopTrip; return !!(c && c.mirroring); }
  get tripActive() { const o = this.outfitter, g = typeof window !== 'undefined' ? window.__game : null, tr = (o && o.core) || (g && g.trip); return !!(tr && tr.active); } // (the trip core, trip.js)
  // a notice whose day has gone: off the list, its prop lifted, a bare pin where it was, and its line kept
  expire(today = this.today()) {
    if (this.mirror) return [];
    const gone = [];
    for (const t of this.active) {
      if (t.status !== 'open') continue;
      if (this.dueOf(t) >= today) continue;
      gone.push(t);
    }
    for (const t of gone) {
      const k = KINDS[t.kind];
      this.removeProp(t.id);
      if (k && k.onDrop) { try { k.onDrop(this, t); } catch (e) { console.warn('the board: missed', t.kind, e); } }
      this.ads.delete(t.id);
      const b = this.boards[t.from]; if (b) { const i = b.slots.indexOf(t.id); if (i >= 0) b.slots[i] = null; }
      const m = { id: t.id, kind: t.kind, title: t.title || 'A notice', from: t.from, npc: t.npc || null, line: this.missedLine(t), abs: today, told: false };
      this.missed.push(m);
      if (this.missed.length > MISSED_KEEP) this.missed.splice(0, this.missed.length - MISSED_KEEP);
      this.note(`“${m.title}”: gone. ${m.line}`);
      this.emit('missed', m);
    }
    if (gone.length) { this.changed(); this.boardChanged(); }
    return gone;
  }
  // the line from whoever posted it: "Deb got her walleye from the Hendersons."
  missedLine(t) {
    const rng = mulberry32(((t.id * 2654435761) ^ 0x51ed) >>> 0);
    const sign = String(t.npcName || t.sign || '').trim();
    // who signed it, as it was signed ("Deb", "The smokehouse out back", "Mrs. Lindqvist", "Legion Post 248")
    const who = sign ? cap(sign.split(',')[0].trim()) : t.npc ? 'They' : 'The counter';
    const first = who.split(' ')[0];
    const fish = t.species ? fishName(t.species) : 'fish';
    const her = SHE.test(first) ? 'her' : HE.test(first) ? 'his' : 'their';
    const line = pickR(rng, MISSED_WORDS[t.kind] || ['Somebody else saw to it.']);
    return cap(fill(line.replace('{Who}', who).replace('{her}', her), { fish, they: pickR(rng, THEY), themselves: 'themselves' }));
  }
  // --- gl-d: pay at the trip's end --------------------------------------------------------------------------------------
  // The tally's money: every notice done is paid (through the profile, as claim did), and a fish notice of the outfitter
  // you came in at takes the fitting fish you have in reach first. Returns { lines, missed, total }; the money is in the
  // purse before anything is drawn, so a reload in the middle of the tally loses nothing.
  settle({ ep = null, trip = null } = {}) {
    void trip;
    if (this.mirror) return { lines: [], missed: [], total: 0 };
    if (ep != null) for (const t of this.active) {
      const k = KINDS[t.kind];
      if (t.from !== ep || t.status !== 'open' || !k || !k.handsIn) continue;
      const r = this.deliver(t);
      if (r && r.n && (t.cooler || []).length >= (t.need || 1)) t.status = 'done';
    }
    const lines = [];
    for (const t of this.active.filter((x) => x.status === 'done').sort((a, b) => a.id - b.id)) {
      const pay = this.pay(t, t.from);
      lines.push({ id: t.id, title: t.title || 'A notice', from: t.from, pay, kind: t.kind, npc: t.npc || null, npcName: t.npcName || null });
      this.emit('paid', t);
    }
    const missed = this.missed.filter((m) => !m.told).map((m) => { m.told = true; return { id: m.id, title: m.title, line: m.line, kind: m.kind, from: m.from }; });
    const total = lines.reduce((a, l) => a + l.pay, 0);
    const out = { lines, missed, total };
    if (lines.length || missed.length) { this.changed(); this.boardChanged(); }
    this.emit('settled', out);
    return out;
  }
  // a notice done between trips is paid where you are, in one line ("$12 for “Walleye wanted”.")
  settleNow() {
    if (this.mirror || this.tripActive) return null;
    const done = this.active.filter((t) => t.status === 'done');
    if (!done.length) return null;
    const lines = done.map((t) => { const pay = this.pay(t, t.from); this.emit('paid', t); return { id: t.id, title: t.title || 'A notice', pay, from: t.from, kind: t.kind, npc: t.npc || null, npcName: t.npcName || null }; });
    const total = lines.reduce((a, l) => a + l.pay, 0);
    const words = lines.length === 1 ? `$${total} for “${lines[0].title}”.` : `$${total} for ${word(lines.length)} notices.`;
    this.note(words);
    this.changed(); this.boardChanged();
    const out = { lines, missed: [], total, words, now: true };
    this.emit('settled', out);
    return out;
  }
  // a notice of one kind written for an outfitter's board (not pinned: the console's and the tests'), or null
  async makeKind(kind, ep, band = 'medium') {
    const K = KINDS[kind], landing = this.landing(ep);
    if (!K || !landing) return null;
    const b = this.boards[ep] || { slots: SLOTS.map(() => null), n: 0 };
    const rng = mulberry32(((this.seed * 2654435761) ^ (ep * 40503) ^ (++b.n * 9973) ^ 0x9d) >>> 0);
    const board = b.slots.map((id) => (id == null ? null : this.ads.get(id)));
    const f = await K.make(this, { ep, band, rng, landing, reach: this.reach(landing.lake), board, turf: this.turfOf(ep) });
    if (!f) return null;
    const t = { id: this.nextId++, kind, from: ep, fromName: landing.name, band, status: 'offered', posted: this.today(), ...f };
    t.pay = K.pay(t); t.clue = t.text;
    this.ads.set(t.id, t);
    return t;
  }
  // home turf (stream B's reach): the basins of the lakes of the entry points an outfitter serves, or null without it
  turfOf(ep) {
    if (typeof this.reachOf !== 'function') return null;
    let eps = null; try { eps = this.reachOf(ep); } catch { eps = null; }
    if (!Array.isArray(eps) || !eps.length) return null;
    const out = new Set();
    for (const e of [ep, ...eps]) { const L = this.world.entryPoints.find((x) => x.ep === Number(e)); if (L && L.lake) out.add(this.basinOf(L.lake)); }
    return out.size ? out : null;
  }
  // the day cycle (for the board's day), the fishing (the stringer) and the outfitter (its landings and profile)
  attach({ day = null, fishing = null, outfitter = null } = {}) { if (day) this.day = day; if (fishing) this.fishing = fishing; if (outfitter) this.outfitter = outfitter; return this; }
  get profile() { const g = window.__game; return (g && g.profile) || (this.outfitter && this.outfitter.profile) || null; }
  get money() { const p = this.profile; return p && typeof p.money === 'number' ? p.money : this.purse; }
  get kinds() { return KINDS; } // the registry, for the console and the tests
  has(key) { return this.unlocks.some((u) => u.key === key); }
  note(t) { if (t && this.onNote) this.onNote(payWords(t, this.tripActive)); }
  changed() { if (this.onChange) this.onChange(); }
  boardChanged() { if (this.onBoard) this.onBoard(); }
  today() { const d = this.day || (window.__game && window.__game.day); return d ? absDay(d.year, d.doy) : 0; }
  lakeRec(id) { return id > 0 ? this.world.lakes[id - 1] : null; }
  // d1 lakes: how deep a lake goes (the DNR's contour map, else its max depth: lake-facts.js), and whether lake trout
  // live in it (the DNR's survey where there is one: fishing.js bites them by it); with no facts, 20 m and deeper
  depthOf(id) { const F = this.world.facts, l = this.lakeRec(id); return F ? F.depthOf(id) : (l && l.maxDepth) || 0; }
  troutIn(l) { const F = this.world.facts; return F ? F.fishOf(l.id, 'laketrout') > 0.3 && F.depthOf(l.id) >= DEEP : (l.maxDepth || 0) >= TROUT_WATER; }
  basinOf(id) { const l = this.lakeRec(id); return l ? l.basin : -1; }
  lakeName(id) { return this.world.lakeName(id); }
  // an outfitter's landing: { ep, name, place, x, z, lake }
  landing(ep) {
    const o = this.outfitter, l = o && o.landings ? o.landings.find((x) => x.ep === ep) : null;
    if (l) return l;
    const e = this.world.entryPoints.find((x) => x.ep === ep);
    return e ? { ep: e.ep, name: `${e.name} Outfitters`, place: e.name, x: e.x, z: e.z, lake: e.lake } : null;
  }
  // every notice taken on and not yet paid, from any board
  get active() { const out = []; for (const t of this.ads.values()) if (t.status === 'open' || t.status === 'done') out.push(t); return out; }

  // --- the water graph: basins (connected water) joined by portages ---------------------------------------
  graph() {
    if (this._graph) return this._graph;
    const adj = new Map();
    const add = (a, b, i, end) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, portage: i, end }); };
    this.world.portages.forEach((p, i) => {
      const a = this.basinOf(p.launch[0].lake), b = this.basinOf(p.launch[1].lake);
      if (a < 0 || b < 0) return;
      add(a, b, i, 0); add(b, a, i, 1);
    });
    return (this._graph = adj);
  }
  // basin -> { hops } for every basin within HOPS portages of a lake
  reach(lakeId, hops = HOPS) {
    const start = this.basinOf(lakeId), adj = this.graph(), out = new Map();
    if (start < 0) return out;
    out.set(start, { hops: 0 });
    let frontier = [start];
    for (let h = 1; h <= hops && frontier.length; h++) {
      const next = [];
      for (const b of frontier) for (const e of adj.get(b) || []) if (!out.has(e.to)) { out.set(e.to, { hops: h }); next.push(e.to); }
      frontier = next;
    }
    return out;
  }
  // the lake of the nearest water cell within r cells (through the loaded tiles or the far field)
  lakeNear(x, z, r = 12) {
    const w = this.world, ci = w.cellI(x), cj = w.cellJ(z);
    let best = 0, bestD = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const d = di * di + dj * dj; if (d >= bestD) continue;
      const id = w.lakeCell(ci + di, cj + dj); if (id) { bestD = d; best = id; }
    }
    return best;
  }
  // a deep named lake (lake trout water) near a landing: by water within HOPS if there is one, else the nearest
  troutLake(landing, reach) {
    let best = null;
    for (const l of this.world.lakes) {
      if (!l || !l.name || !this.troutIn(l)) continue; // (d1 lakes)
      const d = Math.hypot(l.cx - landing.x, l.cz - landing.z);
      if (d > RANGE * 1.5) continue;
      const r = reach.get(l.basin), hops = r ? r.hops : null;
      const score = (hops != null ? hops * 3000 : 30000) + d;
      if (!best || score < best.score) best = { l, d, hops, score };
    }
    return best;
  }
  // a fine tile's grid for a point: the live one if it is loaded, else fetched and kept for the clue writer
  async peek(x, z) {
    const w = this.world, [tx, ty] = w.tileOf(x, z);
    const live = w.tileGrid(tx, ty);
    if (live) return live;
    const key = `${tx},${ty}`;
    if (this.peeks.has(key)) return this.peeks.get(key);
    try {
      const r = await fetch(w.tileUrl(tx, ty));
      if (!r.ok) return null;
      const buf = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const tg = new TileGrid(w.gridDesc, tx, ty, buf, w.levelById, w.clarityById);
      if (this.peeks.size >= 12) this.peeks.delete(this.peeks.keys().next().value);
      this.peeks.set(key, tg);
      return tg;
    } catch { return null; }
  }
  used(kind, key) { for (const t of this.ads.values()) if (t.kind === kind && t.key === key) return true; return false; }
  // The area a notice describes, for the map's ring: the part of the lake a spot is on (the bay, the arm, the stretch:
  // 400–700 m, the ring pushed out over the water so the spot sits inside it, off its middle), or without a spot the
  // lake's deep middle (a laker notice). Never the whole lake: a big lake gets its side named ("the northeast side").
  hintFor(lakeId, site = null, label = null) {
    const l = this.lakeRec(lakeId);
    if (!l) return site ? { x: Math.round(site.x), z: Math.round(site.z), r: 500, label: label || 'about here' } : null;
    const lakeR = Math.sqrt((l.cells * 100) / Math.PI); // the lake as a disc, in metres
    if (!site) return { x: Math.round(l.cx), z: Math.round(l.cz), r: Math.round(clampN(lakeR * 0.6, AREA[0], AREA[1])), label: label || 'the deep water' };
    const r = clampN(lakeR * 0.5, AREA[0], AREA[1]), dx = l.cx - site.x, dz = l.cz - site.z, d = Math.hypot(dx, dz) || 1;
    const push = Math.min(d * 0.5, r * 0.45);
    const words = label || (l.cells >= 2500 ? `the ${compass(site.x - l.cx, site.z - l.cz)} side` : 'about here');
    return { x: Math.round(site.x + (dx / d) * push), z: Math.round(site.z + (dz / d) * push), r: Math.round(r), label: words };
  }
  // a place is known when a map you can see shows it: Sandbox, an outfitter's whole map, or a sheet you own (sheets.js)
  known(x, z) {
    const g = window.__game, sh = g && g.sheets;
    if (!sh || typeof sh.view !== 'function') return true;
    return sh.view() !== 'owned' || sh.showsDetail(x, z);
  }
  // the keeper's red pencil for a notice on the go (hud.js drawMap): { x, z, r, label, tight }. A known campsite or
  // landing is ringed tight and named; an unknown one by the area the notice describes; a lake-only notice by its
  // saved area (an old save's whole-lake hint is cut to 700 m).
  targetOf(t) {
    const own = KINDS[t.kind] && KINDS[t.kind].target; // content A: a kind's own ring (the Secchi station, the next lake of a route)
    if (own) { try { const r = own(this, t); if (r !== undefined) return r; } catch (e) { console.warn('the board: target', t.kind, e); } }
    const w = this.world, s = t.site;
    const site = typeof s === 'number' ? w.campsites[s] || null : s && Number.isFinite(s.x) && Number.isFinite(s.z) ? s : null;
    const at = site || t.spot || t.target || null;
    const lakeId = t.lakeId ?? (site && site.lake) ?? (t.target && t.target.lake) ?? 0;
    if (at && Number.isFinite(at.x) && Number.isFinite(at.z)) {
      // named in the notice (an island site is the island's; a kind may say so with t.known), or on a map you can see
      const named = !!t.known || t.feature === 'island' || !!(t.target && t.target.type === 'island');
      if (named || this.known(at.x, at.z)) {
        const label = t.kind === 'survey' ? (t.rods ? `the ${t.rods}-rod portage` : 'the portage')
          : site || t.kind === 'item' ? SITE_LABEL[t.feature] || 'the campsite'
            : t.target && t.target.type === 'island' ? 'the island site' : t.place || 'here';
        return { x: at.x, z: at.z, r: TIGHT, label, tight: true };
      }
      if (lakeId) return this.hintFor(lakeId, at, t.kind === 'item' ? AREA_LABEL[t.feature] || null : t.kind === 'survey' && t.to ? `the portage to ${t.to}` : null);
    }
    if (t.hint && Number.isFinite(t.hint.x)) return { ...t.hint, r: Math.min(t.hint.r || AREA[1], AREA[1]), label: t.hint.label || (t.species === 'laketrout' ? 'lakers, deep' : 'about here') };
    return at ? this.hintFor(lakeId, at) : null;
  }

  // --- the boards ---------------------------------------------------------------------------------------------
  // An outfitter's four pins (a notice, or null for a bare pin), with the days since it was last read worked off:
  // one change a day, a bare pin filled first, else the oldest notice nobody took comes down. The empty pins are
  // written up in the background (an item notice reads the tile it is set on); onBoard fires when they are up.
  board(ep) {
    const today = this.today();
    let b = this.boards[ep];
    if (!b) {
      b = this.boards[ep] = { slots: SLOTS.map(() => null), day: today, n: 0, pending: [] };
      // notices taken here before the board was kept (an old save) go back on their pins first
      const mine = this.active.filter((t) => t.from === ep).slice(0, SLOTS.length);
      mine.forEach((t, i) => { b.slots[i] = t.id; if (!t.band) t.band = SLOTS[i]; });
      for (let i = mine.length; i < SLOTS.length; i++) b.pending.push(i);
    } else if (today > b.day) {
      const n = Math.min(SLOTS.length, today - b.day);
      for (let k = 0; k < n; k++) this.changeOne(b);
      b.day = today;
      this.changed();
    }
    if (b.pending.length && !this.filling.has(ep)) this.write(ep);
    return b.slots.map((id) => (id == null ? null : this.ads.get(id) || null));
  }
  // the day's change on one board: which pin gets a new notice
  changeOne(b) {
    let i = b.slots.findIndex((id, k) => id == null && !b.pending.includes(k));
    if (i < 0) {
      let oldest = null;
      b.slots.forEach((id, k) => {
        const t = id != null ? this.ads.get(id) : null;
        if (t && t.status === 'offered' && (!oldest || t.posted < oldest.t.posted || (t.posted === oldest.t.posted && t.id < oldest.t.id))) oldest = { t, k };
      });
      if (!oldest) return false; // every notice is taken on: nothing comes down
      i = oldest.k; this.ads.delete(oldest.t.id); b.slots[i] = null;
    }
    b.pending.push(i);
    return true;
  }
  // write up the board's empty pins, one at a time (seeded by the season, the entry point and the change)
  write(ep) {
    if (this.filling.has(ep)) return this.filling.get(ep);
    const job = (async () => {
      const b = this.boards[ep], landing = this.landing(ep);
      if (!b || !landing) return;
      const reach = this.reach(landing.lake);
      while (b.pending.length) {
        const i = b.pending[0];
        if (b.slots[i] == null) {
          let t = null;
          try { t = await this.make(ep, SLOTS[i], landing, reach, b); } catch (e) { console.warn('the board', e); }
          if (this.boards[ep] !== b) return; // reset while it was being written
          if (t) b.slots[i] = t.id;
        }
        b.pending.shift(); // a pin that found nothing stays bare until the next day's change
      }
    })().catch((e) => console.warn('the board', e)).finally(() => { this.filling.delete(ep); this.changed(); this.boardChanged(); });
    this.filling.set(ep, job);
    return job;
  }
  // a notice for a pin: a kind by weight (no more than two of a kind on a board), the others when it finds nothing
  async make(ep, band, landing, reach, b) {
    const rng = mulberry32(((this.seed * 2654435761) ^ (ep * 40503) ^ (++b.n * 9973)) >>> 0);
    const board = b.slots.map((id) => (id == null ? null : this.ads.get(id)));
    const count = (k) => board.filter((t) => t && t.kind === k).length;
    const kinds = Object.values(KINDS).filter((k) => (k.weight[band] || 0) > 0 && count(k.key) < 2);
    const lean = (this.leanOf && this.leanOf(ep)) || {}, wt = (k) => k.weight[band] * (count(k.key) ? 0.35 : 1) * (lean[k.key] ?? 1); // hubs 2C: each outfitter's board leans its own way (outfitters.js boardLean)
    const order = [];
    while (kinds.length) {
      let r = rng() * kinds.reduce((s, k) => s + wt(k), 0), j = 0;
      for (; j < kinds.length - 1; j++) { r -= wt(kinds[j]); if (r <= 0) break; }
      order.push(kinds.splice(j, 1)[0]);
    }
    if (!order.some((k) => k.key === 'fish') && KINDS.fish) order.push(KINDS.fish); // fish can always be asked for
    for (const kind of order) {
      const f = await kind.make(this, { ep, band, rng, landing, reach, board, turf: this.turfOf(ep) });
      if (!f) continue;
      const t = { id: this.nextId++, kind: kind.key, from: ep, fromName: landing.name, band, status: 'offered', posted: this.today(), ...f };
      t.pay = kind.pay(t); t.clue = t.text;
      this.ads.set(t.id, t);
      return t;
    }
    return null;
  }

  // --- taking, doing, claiming --------------------------------------------------------------------------------
  take(id) {
    const t = this.ads.get(+id);
    if (!t || t.status !== 'offered') return false;
    if (this.active.length >= LIMIT) { this.note('You hold five. Let one go first.'); return false; } // gl-d
    t.status = 'open'; t.taken = this.today(); t.due = t.taken + this.daysFor(t);
    const k = KINDS[t.kind];
    if (k && k.onTake) { try { k.onTake(this, t); } catch (e) { console.warn('the board: take', t.kind, e); } } // content A: a disk lent, a cooler set
    this.changed();
    return true;
  }
  accept(id) { return this.take(id); }
  // let a notice go before it is done: it stays pinned on its board, on offer again (a lost item's prop is lifted)
  drop(id) {
    const t = this.ads.get(+id);
    if (!t || t.status !== 'open') return false;
    this.removeProp(t.id);
    const k = KINDS[t.kind];
    if (k && k.onDrop) { try { k.onDrop(this, t); } catch (e) { console.warn('the board: drop', t.kind, e); } } // content A: its state back to the notice's
    t.status = 'offered'; delete t.taken; delete t.due; if (t.cooler) t.cooler = [];
    const b = this.boards[t.from];
    if (!b || !b.slots.includes(t.id)) this.ads.delete(t.id); // not on a pin (an old save's task): gone
    this.changed();
    return true;
  }
  // where a notice is paid, said from the counter at `ep`
  whereToClaim(t, ep = null) {
    const L = this.landing(t.from), here = ep != null ? this.landing(ep) : null;
    if (!L) return t.npc ? 'That was asked of you at another outfitter.' : 'That notice came off another board.';
    const d = here ? Math.hypot(L.x - here.x, L.z - here.z) : 0;
    const far = here && d > 500 ? `, about ${fmtKm(d / 1000)} miles ${compass(L.x - here.x, L.z - here.z)} of here` : '';
    // a visitor's task (npcs.js): theirs, asked at their outfitter, and paid by them or that counter
    if (t.npc) return `That is ${poss(t.npcName || 'a visitor')}, asked of you at ${L.name}. They pay it, or the counter there does: entry point ${L.ep}, ${L.place}${far}.`;
    return `That notice came off ${poss(L.name)} board. They pay it at their own counter: entry point ${L.ep}, ${L.place}${far}.`;
  }
  // pay one finished notice, only at the counter that posted it
  claim(id, ep) {
    const t = this.ads.get(+id);
    let words;
    if (!t || t.status === 'offered') words = 'That one was never taken on.';
    else if (t.from !== ep) words = this.whereToClaim(t, ep);
    else if (t.status !== 'done') words = `Not done yet: ${KINDS[t.kind] && KINDS[t.kind].progress ? KINDS[t.kind].progress(t) : 'still out there'}.`;
    if (words) { this.note(words); return { ok: false, words }; }
    const pay = this.pay(t, ep);
    words = `${pickR(Math.random, THANKS)} $${pay} for “${t.title}”.`;
    this.note(words);
    this.changed(); this.boardChanged();
    return { ok: true, pay, words };
  }
  // The fish a catch notice (a kind with handsIn: the fish notices, the shore lunch) still wants, with you: anything
  // in reach (at an outfitter that is all you own outside the wild), raw and whole, the smallest first so a bigger one
  // stays for a bigger notice, as many as are still wanted. [{ c, e, cm, species }] with .words ("52 cm walleye",
  // "two perch"), or null when there is none.
  fishFor(t) {
    const k = t && KINDS[t.kind];
    if (!k || !k.handsIn || t.status !== 'open') return null;
    const g = typeof window !== 'undefined' ? window.__game : null, inv = g && g.inventory;
    if (!inv || !inv.attached || typeof inv.reachable !== 'function') return null;
    const out = [];
    try {
      for (const c of inv.reachable()) for (const e of c.grid) {
        if (e.box || !/^fish:/.test(e.id) || (e.data && e.data.cooked)) continue;
        const d = itemDef(e.id); if (!d || d.kind !== 'fish' || d.fillet) continue;
        const cm = e.data && e.data.length ? e.data.length : 0, ev = catchEvent(e.id.slice(5), e.data && e.data.lake ? e.data.lake : 0, cm, true);
        if (k.fits(this, t, ev)) for (let i = 0; i < (e.qty || 1); i++) out.push({ c, e, cm, species: ev.species });
      }
    } catch { return null; }
    if (!out.length) return null;
    const want = Math.max(1, (t.need || 1) - (t.cooler ? t.cooler.length : 0)), list = out.sort((a, b) => a.cm - b.cm).slice(0, want);
    const f = list[0];
    list.words = list.length === 1 ? `${f.cm ? `${fmtIn(f.cm)} ` : ''}${fishName(f.species)}` : `${word(list.length)} ${fishName(f.species)}`;
    return list;
  }
  // the catch notices this board posted that you can hand fish over for now
  deliverable(ep) { return this.active.filter((t) => t.from === ep && t.status === 'open' && KINDS[t.kind] && KINDS[t.kind].handsIn && this.fishFor(t)); }
  // Hand the fish over at the board that posted the notice: they leave your hands (or the stringer, or a pack) into
  // its cooler, and once it has all it wants the notice is paid
  handIn(id, ep) {
    const t = this.ads.get(+id), k = t && KINDS[t.kind];
    let words = null;
    if (!t || !k || !k.handsIn || t.status !== 'open') words = 'There is nothing to hand over for that one.';
    else if (t.from !== ep) words = this.whereToClaim(t, ep).replace(/They pay it/, 'The fish goes to them, and they pay for it');
    const list = words ? null : this.fishFor(t);
    if (!words && !list) words = `Nothing on you fits “${t.title}”.`;
    if (words) { this.note(words); return { ok: false, words }; }
    const { n, given } = this.deliver(t, list);
    if (!n) { words = 'The fish would not come loose.'; this.note(words); return { ok: false, words }; }
    const cooler = t.cooler || [], need = t.need || 1;
    if (cooler.length < need) {
      words = `You hand over the ${given}. ${cap(word(need - cooler.length))} more wanted.`;
      this.note(words); this.changed(); this.boardChanged();
      return { ok: true, pay: 0, words };
    }
    t.status = 'done';
    // gl-d: between trips the board pays it there, in one line (on a trip it would wait for the tally; at a counter you
    // are never on one)
    const pay = this.pay(t, ep);
    this.emit('paid', t);
    words = `You hand over the ${given}. $${pay} for “${t.title}”.`;
    this.note(words);
    this.emit('settled', { lines: [{ id: t.id, title: t.title, from: t.from, pay, kind: t.kind }], missed: [], total: pay, words, now: true });
    this.changed(); this.boardChanged();
    return { ok: true, pay, words };
  }
  // the fish a catch notice wants, out of your reach into its cooler (list: fishFor's, else looked for now): { n, given }
  deliver(t, list = this.fishFor(t)) {
    if (!list || !list.length) return { n: 0, given: '' };
    const g = typeof window !== 'undefined' ? window.__game : null, inv = g && g.inventory, cooler = t.cooler || (t.cooler = []);
    let n = 0;
    for (const f of list) {
      if (!inv || !inv.take(f.c.id, f.e.uid, 1)) break;
      cooler.push({ species: f.species, cm: Math.round(f.cm), lake: f.e.data && f.e.data.lake ? this.lakeName(f.e.data.lake) || '' : '', day: this.today() });
      n++;
    }
    if (n && inv && typeof inv.emit === 'function') { try { inv.emit('items'); } catch { /* the inventory's */ } }
    return { n, given: n === list.length ? list.words : `${word(n)} ${fishName(list[0].species)}` };
  }
  pay(t, ep) {
    const pay = t.pay || 0, p = this.profile, k = KINDS[t.kind];
    if (k && k.onClaim) { try { k.onClaim(this, t); } catch (e) { console.warn('the board: claim', t.kind, e); } } // content A: the disk handed back, the litter in the bin
    if (p && typeof p.earn === 'function') p.earn(pay, `the board: ${t.title}`); else this.purse += pay;
    if (p && typeof p.raise === 'function') p.raise(ep, STANDING);
    this.earned += pay;
    this.tally[t.kind] = (this.tally[t.kind] || 0) + 1;
    this.claimed.push({ id: t.id, kind: t.kind, title: t.title, from: t.from, pay, day: this.today() });
    if (this.claimed.length > 30) this.claimed.splice(0, this.claimed.length - 30);
    this.removeProp(t.id);
    this.ads.delete(t.id);
    const b = this.boards[t.from];
    if (b) { const i = b.slots.indexOf(t.id); if (i >= 0) b.slots[i] = null; } // a bare pin until the morning
    return pay;
  }
  // every finished notice this counter posted; the ones from other boards are named with where they are paid
  turnIn(ep) {
    const done = this.active.filter((t) => t.status === 'done');
    const here = done.filter((t) => t.from === ep), elsewhere = done.filter((t) => t.from !== ep);
    const paid = here.map((t) => ({ task: t, pay: this.pay(t, ep) }));
    const total = paid.reduce((s, x) => s + x.pay, 0);
    const bits = [];
    if (paid.length) bits.push(`${pickR(Math.random, THANKS)} $${total} for ${paid.length === 1 ? `“${paid[0].task.title}”` : `${word(paid.length)} notices`}.`);
    for (const t of elsewhere.filter((x) => x.npc)) bits.push(`“${t.title}”: ${this.whereToClaim(t, ep).replace(/^That is /, 'that is ')}`); // a visitor's: theirs
    for (const from of [...new Set(elsewhere.filter((t) => !t.npc).map((t) => t.from))]) {
      const these = elsewhere.filter((t) => t.from === from && !t.npc), names = these.map((t) => `“${t.title}”`).join(', ');
      bits.push(`${names}: ${this.whereToClaim(these[0], ep).replace(/^That notice came off (.*?) board\. They pay it/, these.length > 1 ? 'those came off $1 board. They pay them' : 'that came off $1 board. They pay it')}`);
    }
    const words = bits.join(' ') || 'Nothing finished for this board.';
    this.note(words);
    if (paid.length) { this.changed(); this.boardChanged(); }
    return { paid, total, elsewhere, words };
  }
  // the counter's buttons: "take:12", "drop:12", "claim:12", "claimall"
  act(spec, ep) {
    const [verb, id] = String(spec).split(':');
    let r;
    if (verb === 'take') r = this.take(id);
    else if (verb === 'drop') r = this.drop(id);
    else if (verb === 'claim') r = this.claim(id, ep);
    else if (verb === 'claimall') r = this.turnIn(ep);
    else if (verb === 'give') r = this.handIn(id, ep);
    this.boardChanged();
    return r;
  }
  reset() {
    for (const id of [...this.props.keys()]) this.removeProp(id);
    this.ads.clear(); this.boards = {}; this.filling.clear();
    this.tally = { item: 0, survey: 0, fish: 0 }; this.unlocks = [];
    this.purse = 0; this.earned = 0; this.claimed = []; this.missed = []; this.dueDay = null; this.doneSeen.clear();
    this.seed = (Date.now() & 0xffff) || 1;
    this.changed(); this.boardChanged();
  }
  // The hook for the fishing code (release): a fish landed on a lake, kept or let go. A kept one that a fish notice
  // taken on wants is kept like any other (fishing.js puts it in your hand); the words for the catch line say where it
  // goes (handIn pays it there). Other kinds may hear the catch too.
  onCatch(species, lakeId, lengthCm = 0, kept = true) {
    const ev = catchEvent(species, lakeId, lengthCm, kept);
    for (const t of this.active) { const k = KINDS[t.kind]; if (k && !k.fits && k.onEvent) k.onEvent(this, t, ev); }
    const t = this.fitting(ev)[0];
    if (!t) return null;
    const L = this.landing(t.from);
    this.changed();
    return `Wanted for “${t.title}” · bring it to ${L ? L.name : 'the outfitter'}, entry point ${t.from}`;
  }
  // the notices taken on that a catch fits, the best paying first
  fitting(ev) { return this.active.filter((t) => KINDS[t.kind] && KINDS[t.kind].fits && KINDS[t.kind].fits(this, t, ev)).sort((a, b) => b.pay - a.pay || a.id - b.id); }
  // the notice a landed fish would go to if kept (fishing.js says so on the catch's prompt), or null
  wants(species, lakeId, lengthCm = 0) { return this.fitting(catchEvent(species, lakeId, lengthCm, true))[0] || null; }
  // any other event a kind may want (arrivals, photos, later): every notice taken on hears it
  onEvent(ev) {
    let hit = false;
    for (const t of this.active) { const k = KINDS[t.kind]; const w = k && k.onEvent ? k.onEvent(this, t, ev) : null; if (w) { hit = true; this.note(w); } }
    if (hit) this.changed();
    return hit;
  }
  // a notice's state in a few words ("the cooler is empty", "the paddle is still out there")
  progressOf(t) { const k = KINDS[t.kind]; return t.status === 'done' ? 'done' : k && k.progress ? k.progress(t) : 'on the go'; }
  // the map: the keeper's red pencil per notice on the go (targetOf)
  hints() {
    const out = [];
    for (const t of this.active) {
      if (t.status !== 'open') continue;
      const k = KINDS[t.kind];
      // content A: a kind with several places (a route's lakes) rings each one still to do
      if (k && k.targets) { try { for (const r of k.targets(this, t) || []) if (r) out.push(r); continue; } catch (e) { console.warn('the board: targets', t.kind, e); } }
      const r = this.targetOf(t); if (r) out.push(r);
    }
    return out;
  }
  // the readout's words (hud.js may read them)
  get readout() {
    const a = this.active, done = a.filter((t) => t.status === 'done');
    if (!a.length) return 'nothing on the go · every outfitter has a board';
    const where = [...new Set(done.map((t) => (this.landing(t.from) || {}).place).filter(Boolean))];
    return `${a.length - done.length} on the go${done.length ? ` · ${done.length} to claim${where.length ? ` at ${where.join(', ')}` : ''}` : ''}`;
  }

  // --- per frame: props at the sites, pick-ups, arrivals ----------------------------------------------------
  // Before the player moves (main.js): E for a notice in reach (a lost item at your feet) is taken here, ahead of
  // the shore's "Go ashore" and the canoe's own E, which would otherwise use the key first.
  before() {
    const t = this.inReach, p = this.player;
    this.inReach = null;
    if (!t || t.status !== 'open' || p.input.paused || !p.input.pressed('KeyE')) return;
    const k = KINDS[t.kind];
    if (k && k.use) k.use(this, t);
  }
  update(dt) {
    this.inReach = null;
    for (const t of this.active) {
      if (t.status !== 'open') continue;
      const k = KINDS[t.kind];
      if (k && k.update) k.update(this, t, dt);
    }
    // gl-d: a day turn takes back the notices past their day; a notice turned done is heard (the moment, the record),
    // and one done between trips is paid there and then
    const today = this.today();
    if (today !== this.dueDay) { this.dueDay = today; this.expire(today); }
    for (const t of this.active) if (t.status === 'done' && !this.doneSeen.has(t.id)) { this.doneSeen.add(t.id); this.emit('done', t); }
    if (this.doneSeen.size > 200) for (const id of [...this.doneSeen]) if (!this.ads.has(id)) this.doneSeen.delete(id);
    if (!this.tripActive && this.active.some((t) => t.status === 'done')) this.settleNow();
  }
  removeProp(id) {
    const t = this.ads.get(id), k = t && KINDS[t.kind];
    if (k && k.cleanup) { try { k.cleanup(this, t); } catch (e) { console.warn('the board: cleanup', t.kind, e); } } // content A: an obstacle off the trail
    const m = this.props.get(id);
    if (!m) return;
    this.scene.remove(m);
    // (content A: a kind's prop may be a group; a geometry shared between props, userData.shared, stays)
    m.traverse((o) => { if (o.geometry && !(o.userData && o.userData.shared)) o.geometry.dispose(); });
    this.props.delete(id);
  }

  // --- the board at the counter (outfitter.js renders it as its two panes) ------------------------------------
  // The owner (2026-11-01): "the task board needs to use the same renderings of the tasks as the inventory does", "when
  // you pull a task it needs to be ripped from the board", "dont have the tasks from other boards section. what that
  // should instead be is a rendering of the tasks pulled from THIS board", and "look at the lure wall. it has the board
  // + inventory. we might be able to do board plus tasks taken for this board". So the board is two panes, as a shelf
  // is (inv-ui.js ShelfScreen): the cork on the left, each notice pinned up as the very paper the journal unfolds
  // (flyers.js flyerHtml), and on the right the pile of what you tore off this board, the same papers, folded since
  // and splayed out, where the finished ones are handed in and paid (and one still on the go can be let go). A notice
  // taken leaves a torn scrap under its tack until it is paid (the pin is bare then, until the morning). What you have
  // from other boards is the journal's business (its Tasks page says where each is paid), not this board's.
  boardSection(ep) {
    injectCss();
    const slots = this.board(ep), writing = this.filling.has(ep), where = (this.landing(ep) || {}).name || 'the outfitter';
    const onPins = new Set(slots.filter(Boolean).map((t) => t.id));
    // the pile: every notice on the go that this counter pays, torn off its pins or asked of you here in person
    // (npcs.js: theirs to pay, or this counter's); the finished ones on top, then the oldest taken first
    const pile = this.active.filter((t) => t.from === ep)
      .sort((a, b) => (a.status === 'done' ? 0 : 1) - (b.status === 'done' ? 0 : 1) || (a.taken || 0) - (b.taken || 0) || a.id - b.id);
    const ready = pile.filter((t) => t.status === 'done'), offered = slots.filter((t) => t && t.status === 'offered').length;
    const full = slots.every((t) => t && t.status !== 'offered'); // (every pin a torn scrap of yours: nothing new goes up until one is paid, the playthrough)
    const sum = offered ? `${word(offered)} on offer · a new notice each morning` : writing ? 'the keeper is pinning up notices' : full ? 'every notice taken · new ones once these are paid' : 'a new notice each morning';
    const pileSum = pile.length ? [pile.length - ready.length ? `${word(pile.length - ready.length)} on the go` : '', ready.length ? `${word(ready.length)} done` : ''].filter(Boolean).join(' · ') : '';
    // (gl-d: no Claim all: a notice done is paid when you come in, on the trip's tally)
    const all = this.active.length >= LIMIT ? '<span class="sum full">You hold five</span>' : '';
    const pins = slots.map((t, i) => this.notice(t, i, ep, writing, where)).join('');
    const cards = pile.map((t, i) => this.pileCard(t, i, ep, where, onPins.has(t.id))).join('');
    return `<section class="board cork two" aria-label="The board">
      <div class="bd-cork"><div class="top"><h3 id="board-h">The board</h3><span class="sum">${sum}</span></div>
        <div class="notices"><div class="pins">${pins}</div></div></div>
      <aside class="bd-pile" aria-labelledby="pile-h"><div class="top"><h3 id="pile-h">Taken from this board</h3>${pileSum ? `<span class="sum">${pileSum}</span>` : ''}${all}</div>
        <div class="pile">${cards || '<p class="pile-none">Nothing of this board’s on the go. Pull a notice off the cork and it ends up here.</p>'}</div></aside>
    </section>`;
  }
  // a pin on the cork: bare, a notice on offer (its paper, pinned, and "Take it on" under it), or the scrap a notice
  // left under the tack when it was torn off (until it is paid)
  notice(t, i, ep, writing, where = '') {
    if (!t) {
      const b = this.boards[ep], due = b && b.pending.includes(i);
      return `<article class="pin bare"><i class="tack" aria-hidden="true"></i><p>${due && writing ? 'Pinning up a notice…' : 'A bare pin. Something new goes up in the morning.'}</p></article>`;
    }
    if (t.status !== 'offered') {
      const scrap = SCRAP[flyerStyle(t)] || SCRAP.notice;
      return `<article class="pin torn" data-notice="${t.id}" aria-label="${esc(t.title)}: torn off"><i class="tack" aria-hidden="true"></i><i class="scrap" style="--scrap:${scrap}" aria-hidden="true"></i>
        <p>Torn off ${t.taken ? esc(this.dayWords(t.taken)) : ''}.</p></article>`;
    }
    const k = KINDS[t.kind] || { label: t.kind };
    return `<article class="pin" data-notice="${t.id}"><i class="tack" aria-hidden="true"></i>${flyerHtml(t, { where, ep })}
      <div class="pin-foot"><span class="pin-band">${esc(k.label)} · ${BAND_WORDS[t.band] || ''}</span><button type="button" class="stamp" data-act="task" data-id="take:${t.id}">Take it on</button></div>
    </article>`;
  }
  // a notice in the pile: the paper (folded since it came off the cork) with a slip over it saying where it stands and
  // what can be done with it here: hand the fish over, claim the pay, or let it go back up on its pin
  pileCard(t, i, ep, where, pinned) {
    const k = KINDS[t.kind] || { label: t.kind };
    const btns = [];
    let say;
    if (t.status === 'done') {
      const dw = k.doneWords ? k.doneWords(t) : t.kind === 'fish' && k.progress ? k.progress(t) : ''; // content A: "Done · 4.4 m"
      say = `Done${dw ? ` · ${dw}` : ''} · paid when you come in`;
    } else {
      const f = this.fishFor(t); // a fish notice of this board's, its fish with you: hand it over here, and it is paid
      const left = this.daysLeft(t), due = left == null ? '' : left <= 0 ? 'last day · ' : `${word(left)} ${plural(left, 'day')} left · `;
      say = `${t.npc ? `For ${t.npcName || 'a visitor'} · ` : ''}${due}${f ? `the ${f.words} with you` : k.progress ? k.progress(t) : 'on the go'}`;
      if (f) btns.push(`<button type="button" class="stamp small" data-act="task" data-id="give:${t.id}">Hand ${f.length > 1 ? 'them' : 'it'} over · $${t.pay}</button>`);
      if (pinned) btns.push(`<button type="button" class="stamp small quiet" data-act="task" data-id="drop:${t.id}">Let it go</button>`);
    }
    const h = (t.id * 2654435761) >>> 0, dx = ((h % 7) - 3) * 5, rot = (((h >>> 3) % 9) - 4) * 0.6;
    return `<div class="tk${t.status === 'done' ? ' done' : ''}" data-card="${t.id}" style="--dx:${dx}px;--rot:${rot.toFixed(1)}deg;z-index:${i + 1}">
      <div class="tk-slip"><span class="tk-say">${esc(cap(say))}</span>${btns.length ? `<span class="tk-btns">${btns.join('')}</span>` : ''}</div>
      <div class="tk-paper">${flyerHtml(t, { where, ep })}${t.status === 'done' ? '<span class="tk-done" aria-hidden="true">Done</span>' : ''}</div>
    </div>`;
  }
  // The rip (the owner, 2026-11-01: "when you pull a task it needs to be ripped from the board"). outfitter.js asks
  // ripStart before a "take" goes through, while the notice is still on its pin, and ripEnd after the board is drawn
  // again (the notice now in the pile, a scrap left under the tack): a copy of the paper, its top torn out round the
  // tack, gives a tug, comes free and flies to its place in the pile, where the real one is waiting hidden under it.
  // Only the look: the take itself has happened already, so nothing hangs on the animation finishing. Not at all
  // under prefers-reduced-motion.
  ripStart(root, spec) {
    const [verb, id] = String(spec).split(':');
    if (verb !== 'take' || !root || typeof window === 'undefined' || !document.body.animate) return null;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    const fl = root.querySelector(`.pin[data-notice="${id}"] .fl`);
    if (!fl) return null;
    const r = fl.getBoundingClientRect();
    if (!r.width) return null;
    const ghost = fl.cloneNode(true);
    ghost.classList.add('fl-ghost'); ghost.classList.remove('unfold');
    ghost.removeAttribute('aria-label');
    // the cork draws its papers small (a zoom: tasks.js CSS); the copy is drawn at the same zoom, and as wide, so it
    // looks the same the moment it comes off
    const z = parseFloat(getComputedStyle(fl).zoom) || 1;
    return { id, ghost, r, z };
  }
  ripEnd(root, rip) {
    if (!rip || !root) return;
    const card = root.querySelector(`.tk[data-card="${rip.id}"]`), to = card && card.querySelector('.fl');
    const scrap = root.querySelector(`.pin.torn[data-notice="${rip.id}"]`);
    if (scrap) scrap.classList.add('fresh');
    if (!to) return;
    try { card.scrollIntoView({ block: 'nearest' }); } catch { /* an old browser */ }
    const t = to.getBoundingClientRect(), s1 = t.width / rip.r.width;
    const fly = document.createElement('div'), g = rip.ghost;
    fly.className = 'rip-fly'; fly.setAttribute('aria-hidden', 'true');
    Object.assign(fly.style, { position: 'fixed', left: '0px', top: '0px', zIndex: '60', pointerEvents: 'none', transformOrigin: '0 0', willChange: 'transform' });
    Object.assign(g.style, { zoom: String(rip.z), width: `${rip.r.width / rip.z}px`, margin: '0' });
    fly.appendChild(g);
    document.body.appendChild(fly);
    card.style.visibility = 'hidden';
    const x0 = rip.r.left, y0 = rip.r.top, x1 = t.left, y1 = t.top;
    const at = (x, y, rot, s) => `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${s})`;
    const anim = fly.animate([
      { transform: at(x0, y0, 0, 1), offset: 0 },
      { transform: at(x0, y0 + 9, 4, 1), offset: 0.16 },                                                   // the tug against the tack
      { transform: at(x0 - 6, y0 + 2, -7, 1.04), offset: 0.3, easing: 'cubic-bezier(.3,.6,.3,1)' },        // torn free
      { transform: at(x0 + (x1 - x0) * 0.55, Math.min(y0, y1) - 40, -10, (1 + s1) / 2), offset: 0.66 },    // up and over
      { transform: at(x1, y1, 0, s1), offset: 1 },
    ], { duration: 720, easing: 'ease-in-out', fill: 'forwards' });
    let done = false;
    const land = () => { if (done) return; done = true; fly.remove(); card.style.visibility = ''; card.classList.add('landed'); };
    anim.onfinish = land; anim.oncancel = land;
    setTimeout(land, 1200); // whatever happens to the animation, the card is never left hidden
  }
  dayWords(n) {
    const today = this.today(), d = today - n;
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    const date = new Date(n * 86400000);
    return shortDate(date.getUTCFullYear(), n - absDay(date.getUTCFullYear(), 0));
  }

  // --- persistence -------------------------------------------------------------------------------------------
  serialize() {
    return { v: 4, seed: this.seed, nextId: this.nextId, ads: [...this.ads.values()], boards: this.boards, purse: this.purse, earned: this.earned, claimed: this.claimed,
      tally: this.tally, unlocks: this.unlocks.map((u) => u.key), missed: this.missed };
  }
  restore(d) {
    if (!d) return;
    for (const id of [...this.props.keys()]) this.removeProp(id);
    this.tally = { item: 0, survey: 0, fish: 0, ...(d.tally || {}) };
    this.unlocks = (d.unlocks || []).map((k) => UNLOCKS.find((u) => u.key === k)).filter(Boolean);
    this.nextId = d.nextId || 1; this.seed = d.seed || this.seed;
    this.purse = d.purse || 0; this.earned = d.earned || 0; this.claimed = Array.isArray(d.claimed) ? d.claimed : [];
    this.ads = new Map(); this.boards = {}; this.filling.clear();
    // gl-d (v4): the missed notices kept; a notice taken in an older save gets its deadline from today (never from the
    // day it was taken: nothing expires the moment an old season loads); a kind no longer written (the rental canoe) is
    // dropped with its pin
    this.missed = Array.isArray(d.missed) ? d.missed.filter((m) => m && m.title) : [];
    this.dueDay = null;
    if (d.v >= 3) {
      for (const t of d.ads || []) if (t && t.id != null && KINDS[t.kind]) this.ads.set(t.id, t);
      if (!(d.v >= 4)) { const today = this.today(); for (const t of this.ads.values()) if ((t.status === 'open' || t.status === 'done') && !Number.isFinite(t.due)) t.due = today + this.daysFor(t); }
      for (const [ep, b] of Object.entries(d.boards || {})) {
        if (!b || !Array.isArray(b.slots)) continue;
        this.boards[ep] = { slots: SLOTS.map((_, i) => (b.slots[i] != null && this.ads.has(b.slots[i]) ? b.slots[i] : null)), day: b.day || 0, n: b.n || 0, pending: Array.isArray(b.pending) ? b.pending : [] };
      }
    } else {
      // an old save: the tasks under way are kept, claimable where they were posted; the old offers are gone
      for (const t of d.active || []) { const a = this.upgrade(t); if (a) { this.ads.set(a.id, a); this.nextId = Math.max(this.nextId, a.id + 1); } }
      const today = this.today(); for (const t of this.ads.values()) if (!Number.isFinite(t.due)) t.due = today + this.daysFor(t);
    }
  }
  upgrade(t) {
    const kind = KINDS[t && t.kind];
    if (!kind || t.from == null) return null;
    const a = { ...t, band: 'medium', status: t.status === 'done' ? 'done' : 'open', posted: this.today(), taken: this.today(), text: t.clue, sign: 'the counter' };
    if (t.kind === 'fish') {
      a.species = t.species === 'trout' ? 'laketrout' : t.species; a.minCm = 0; a.need = 1;
      a.cooler = t.status === 'done' ? [{ species: a.species, cm: 0, lake: this.lakeName(t.lakeId) || '', day: this.today() }] : [];
      a.title = FISH_WORDS[a.species] ? FISH_WORDS[a.species].title : 'Fish wanted';
    } else if (t.kind === 'item') { a.hops = 1; a.title = `Lost: a ${t.label || 'thing'}`; } else { a.title = 'Portage report wanted'; a.rods = (this.world.portages[t.portage] || {}).rods || 0; }
    a.pay = kind.pay(a);
    return a;
  }
}

// a catch as the kinds hear it (fishing.js names lake trout 'trout' in places)
function catchEvent(species, lakeId, lengthCm, kept) {
  return { type: 'catch', species: species === 'trout' ? 'laketrout' : String(species || '').toLowerCase(), lake: lakeId, cm: lengthCm, kept: !!kept };
}

// --- the cork board's look (Paper: cream notices, ink, a red tack, pencil for the pay) -----------------------------
// the colour of the scrap a notice leaves under its tack when it is torn off: the top of its own paper (flyers.css),
// the Leave No Trace poster's green band, the kraft of a tag
const SCRAP = { scrap: '#f4efe0', order: '#eef1df', lost: '#fbfaf4', rental: '#f3e39a', usfs: '#f8f6ee', lnt: '#2e5b3a', clmp: '#e9f0f0', dnr: '#f2efe3', photo: '#fbf7ea', tag: '#c9a877', notice: '#f4ecd8' };
// The board's two panes (the cork, the pile), laid out as a shelf's are (inv-ui.css #shelf); store.css adds the wood.
// The papers are flyers.css's own, drawn smaller with a zoom: on the cork pinned flat (not folded yet, so no creases,
// no tape: a tack), in the pile folded (the creases), their tops torn out round where the tack was.
const CSS = `
#outfitter .board.cork.two { display: grid; grid-template-columns: minmax(0, 1fr) clamp(300px, 34%, 440px); gap: 22px; min-height: 0; flex: 1 1 auto; }
#outfitter .board.cork .bd-cork, #outfitter .board.cork .bd-pile { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
#outfitter .board.cork .top { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; padding-bottom: 6px; flex: none; }
#outfitter .board.cork .top .stamp { margin-left: auto; }
#outfitter .cork .notices { min-height: 0; flex: 1 1 auto; overflow: auto; scrollbar-width: thin; border-radius: 3px; border: 1px solid var(--edge-deep); background-color: #c4a77c;
  background-image: radial-gradient(rgba(96, 66, 34, .22) 1px, transparent 1.6px), radial-gradient(rgba(255, 244, 220, .2) 1px, transparent 1.6px);
  background-size: 7px 7px, 11px 11px; background-position: 0 0, 3px 5px; box-shadow: inset 0 1px 5px rgba(40, 24, 8, .25); }
#outfitter .cork .pins { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 26px 20px; align-items: start; padding: 18px 18px 22px; }
#outfitter .cork .pin { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: 0; padding-top: 2px; }
#outfitter .cork .pin > .tack, #outfitter .cork .pin .tack { position: absolute; left: 50%; top: 0; z-index: 3; width: 13px; height: 13px; margin-left: -6px; border-radius: 50%; background: var(--map-red);
  box-shadow: inset -2px -2px 0 rgba(0, 0, 0, .25), 0 1px 2px rgba(0, 0, 0, .35); }
#outfitter .cork .pin .fl { zoom: .7; margin-top: 10px; }
#outfitter .cork .pin .fl::before, #outfitter .cork .pin .fl::after, #outfitter .cork .pin .fl .fl-tack { display: none; }
#outfitter .cork .pin .fl.fl-tag .fl-eye { background: #c4a77c; }
#outfitter .cork .pin-foot { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }
#outfitter .cork .pin-foot .pin-band { font: 500 18px/1 var(--pencil-font); color: rgba(42, 30, 18, .82); }
#outfitter .cork .pin-foot .stamp { font-size: 10.5px; padding: 5px 11px; box-shadow: 0 2px 4px rgba(40, 24, 8, .3); }
#outfitter .cork .pin.bare, #outfitter .cork .pin.torn { min-height: 150px; justify-content: center; }
#outfitter .cork .pin.bare p, #outfitter .cork .pin.torn p { margin: 0; max-width: 200px; font: 500 18px/1.15 var(--pencil-font); color: rgba(42, 32, 22, .7); text-align: center; }
/* what is left on the pin when a notice is torn off: a jagged scrap of its paper under the tack */
#outfitter .cork .pin.torn .scrap { position: absolute; left: 50%; top: 4px; width: 46px; height: 22px; margin-left: -23px; z-index: 2; background: var(--scrap, #f4ecd8);
  clip-path: polygon(0 0, 100% 0, 100% 46%, 90% 78%, 79% 52%, 66% 100%, 54% 64%, 41% 92%, 28% 58%, 15% 86%, 6% 60%, 0 70%); filter: drop-shadow(0 1px 1px rgba(40, 24, 8, .3)); transform-origin: 50% 0; rotate: -4deg; }
#outfitter .cork .pin.torn.fresh .scrap { animation: bd-flutter .9s ease-out; }
@keyframes bd-flutter { 0% { rotate: 14deg; } 30% { rotate: -12deg; } 55% { rotate: 7deg; } 80% { rotate: -6deg; } 100% { rotate: -4deg; } }
/* the pile: the papers taken off this board, folded, splayed out down the tray; the one under the pointer comes up */
#outfitter .board.cork .pile { min-height: 0; flex: 1 1 auto; overflow: hidden auto; scrollbar-width: thin; padding: 14px 12px 40px; display: flex; flex-direction: column; }
#outfitter .board.cork .pile-none { margin: 30px 14px; font: 500 20px/1.2 var(--pencil-font); text-align: center; }
#outfitter .board.cork .tk { position: relative; flex: none; translate: var(--dx, 0) 0; rotate: var(--rot, 0deg); transition: translate .18s ease-out, rotate .18s ease-out; }
#outfitter .board.cork .tk + .tk { margin-top: -30px; }
#outfitter .board.cork .tk:hover, #outfitter .board.cork .tk:focus-within { z-index: 50 !important; translate: var(--dx, 0) -6px; rotate: 0deg; }
#outfitter .board.cork .tk-slip { position: relative; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin: 0 6% -4px; padding: 4px 10px 5px;
  background: var(--paper-note); border: 1px solid var(--edge); box-shadow: 0 2px 5px rgba(20, 10, 0, .3); rotate: -.8deg; }
#outfitter .board.cork .tk-say { flex: 1 1 140px; min-width: 0; font: 500 17px/1.1 var(--pencil-font); color: var(--pencil); }
#outfitter .board.cork .tk.done .tk-say { color: #3f5a2a; }
#outfitter .board.cork .tk-btns { display: flex; gap: 5px; flex-wrap: wrap; }
#outfitter .board.cork .tk-btns .stamp.small { font-size: 10.5px; padding: 3px 8px; }
#outfitter .board.cork .tk-paper { position: relative; }
#outfitter .board.cork .tk-paper .fl { zoom: .6; margin-top: 4px; }
#outfitter .board.cork .tk-paper .fl::before, #outfitter .board.cork .tk-paper .fl .fl-tack { display: none; }
#outfitter .board.cork .tk-done { position: absolute; right: 12%; top: 16px; padding: 2px 10px; border: 3px double rgba(63, 90, 42, .85); border-radius: 4px; rotate: -12deg;
  font: 700 18px/1 var(--sc); letter-spacing: .16em; text-transform: uppercase; color: rgba(63, 90, 42, .9); mix-blend-mode: multiply; pointer-events: none; }
#outfitter .board.cork .tk.landed .tk-paper { animation: bd-settle .3s ease-out; }
@keyframes bd-settle { 0% { translate: 0 -5px; } 60% { translate: 0 2px; } 100% { translate: 0 0; } }
/* torn off round the tack (a notebook scrap and a tag have their own edges) */
.board.cork .tk-paper .fl:not(.fl-scrap):not(.fl-tag), .fl-ghost:not(.fl-scrap):not(.fl-tag) {
  clip-path: polygon(0 0, 43% 0, 44.5% 9px, 46% 4px, 47.5% 14px, 49% 7px, 50.5% 16px, 52% 6px, 53.5% 12px, 55% 3px, 56.5% 0, 100% 0, 100% 100%, 0 100%); }
.fl-ghost::before, .fl-ghost .fl-tack { display: none; }
@media (prefers-reduced-motion: reduce) {
  #outfitter .cork .pin.torn.fresh .scrap, #outfitter .board.cork .tk.landed .tk-paper { animation: none; }
  #outfitter .board.cork .tk { transition: none; }
}
#journal .notice-list { display: flex; flex-direction: column; gap: 12px; }
/* gl-d: the journal's Tasks: the days left on a notice, the missed ones crossed out; the Trips page's milestones */
#journal .pp-todo .st .due { font-weight: 600; color: var(--pencil); }
#journal .pp-todo .st .due.last { color: var(--map-red); }
#journal .pp-todo.missed .t, #journal .pp-todo.missed .st { opacity: .7; }
#journal .pp-box.gone { opacity: .5; }
#journal .pp-miles { margin-top: 14px; padding: 0 30px 0 calc(var(--pp-margin, 40px) + 8px); }
#journal .pp-miles .pp-sub { margin: 6px 0 2px; font: 700 12px/2 var(--sc); letter-spacing: .14em; text-transform: uppercase; color: var(--pp-brown, #6b4a2b); }
#journal .pp-mile { display: grid; grid-template-columns: minmax(0, 1fr) 90px auto; gap: 10px; align-items: center; font: 500 19px/1.5 var(--pencil-font); color: var(--pencil); }
#journal .pp-mile.done { grid-template-columns: auto minmax(0, 1fr); }
#journal .pp-mile.done b { color: var(--map-red); font-weight: 600; }
#journal .pp-mile i { display: block; height: 6px; border: 1px solid currentColor; border-radius: 2px; background: linear-gradient(90deg, currentColor var(--f, 0%), transparent var(--f, 0%)); opacity: .8; }
#journal .pp-mile .n { font-size: 16px; white-space: nowrap; }
#outfitter .board.cork .top .sum.full { margin-left: auto; color: var(--map-red); }
#journal .todo .pay { font: 500 20px/1 var(--pencil-font); color: var(--pencil); margin-left: 6px; }
`;
let cssIn = false;
function injectCss() {
  if (cssIn || typeof document === 'undefined') return;
  cssIn = true;
  const s = document.createElement('style'); s.id = 'tasks-board'; s.textContent = CSS;
  document.head.appendChild(s);
}

// --- reading a site off its tile -----------------------------------------------------------------------------
export function lakeNearGrid(tg, x, z, r) {
  const ci = tg.cellI(x), cj = tg.cellJ(z);
  let best = 0, bestD = Infinity;
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const d = di * di + dj * dj; if (d >= bestD) continue;
    const id = tg.lakeCell(ci + di, cj + dj); if (id) { bestD = d; best = id; }
  }
  return best;
}
// island (the land under the site closes on itself within the tile), point (mostly water around), bay (mostly land), shore
export function siteFeature(tg, x, z) {
  const side = tg.side;
  let ci = tg.cellI(x) - tg.i0, cj = tg.cellJ(z) - tg.j0;
  const inside = (li, lj) => li >= 0 && lj >= 0 && li < side && lj < side;
  const land = (li, lj) => inside(li, lj) && tg.lake[lj * side + li] === 0;
  if (!land(ci, cj)) { // a site mapped just over the water: start from the nearest land cell
    let found = null;
    for (let r = 1; r <= 4 && !found; r++) for (let dj = -r; dj <= r && !found; dj++) for (let di = -r; di <= r && !found; di++) if (land(ci + di, cj + dj)) found = [ci + di, cj + dj];
    if (!found) return 'shore';
    [ci, cj] = found;
  }
  let water = 0, n = 0;
  for (let dj = -10; dj <= 10; dj++) for (let di = -10; di <= 10; di++) {
    if (di * di + dj * dj > 100 || !inside(ci + di, cj + dj)) continue;
    n++; if (!land(ci + di, cj + dj)) water++;
  }
  const frac = n ? water / n : 0;
  const seen = new Uint8Array(side * side), stack = [cj * side + ci];
  seen[cj * side + ci] = 1;
  let count = 0, open = false;
  while (stack.length && count < 6000) {
    const k = stack.pop(), li = k % side, lj = (k - li) / side;
    count++;
    if (li === 0 || lj === 0 || li === side - 1 || lj === side - 1) { open = true; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const m = (lj + dj) * side + li + di;
      if (!seen[m] && land(li + di, lj + dj)) { seen[m] = 1; stack.push(m); }
    }
  }
  if (!open && !stack.length) return 'island';
  if (frac >= 0.55) return 'point';
  if (frac <= 0.25) return 'bay';
  return 'shore';
}
// where the canoes pull up below a site: on the shoreline a little up on the rock, or just afloat
export function shoreSpot(tg, x, z, float) {
  let px = x, pz = z, d = tg.deeperDir(px, pz);
  for (let i = 0; i < 240 && tg.shoreAt(px, pz) > 0; i++) { px += d.x * 0.5; pz += d.z * 0.5; if (i % 8 === 7) d = tg.deeperDir(px, pz); }
  if (tg.shoreAt(px, pz) > 0) return null;
  const want = float ? -0.7 : 0.7;
  for (let i = 0; i < 24; i++) {
    const s = tg.shoreAt(px, pz);
    if (Math.abs(s - want) < 0.12) break;
    const dd = tg.deeperDir(px, pz), step = (s - want) * 0.5;
    px += dd.x * step; pz += dd.z * step;
  }
  return { x: Math.round(px * 10) / 10, z: Math.round(pz * 10) / 10 };
}
