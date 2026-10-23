import * as THREE from 'three';
import { TileGrid } from './grid.js';
import { mulberry32 } from './rng.js';
import { buildItemProp, groundAt } from './props.js';
import { SPECIES as FISH } from './fishing.js';
import { esc, word, plural, fmtKm, shortDate } from './hud.js';

// The board: notices pinned up at each outfitter, the tasks they set, and the money they pay.
//
// Every outfitter keeps its own cork board of four notices: two close by, one a day out, one far. One notice changes
// each game day (a bare pin is filled first, else the oldest notice nobody took comes down), and nothing you take on
// ever expires. A notice is one of the kinds in KINDS, a registry of { make, update, onEvent, pay }:
// - fish for the café: any fish, a species, or a species of a size (lake trout only from water 18 m deep or more);
// - a lost item at a campsite a few portages in (a small prop at the site's water edge; E picks it up);
// - a portage to survey (walk it to its far landing, or find its landing).
// Clues are written from the real data: lakes, portage rods, how many portages in, which side of the lake, and whether
// the site is on an island, a point or in a bay, worked out from the tile's own cells. A kept fish that a notice
// wants goes into that notice's cooler on its own (fishing.js calls onCatch). A finished notice is paid only at the
// counter that posted it, through the profile (profile.js: earn) or, without one, a purse kept here. Each board is
// saved with the tasks, keyed by entry point.

const HOPS = 4;              // portages out from the landing a notice may send you
const RANGE = 14000;         // metres from the landing, as the crow flies
const PICKUP = 4;            // metres within which E picks an item up
const ARRIVE = 28;           // metres within which a survey point counts as reached
const SLOTS = ['local', 'local', 'medium', 'far']; // the four pins on every board
const BAND_HOPS = { item: { local: [0, 1], medium: [1, 2], far: [2, 4] }, survey: { local: [0, 1], medium: [1, 2], far: [2, 3] } };
const BAND_WORDS = { local: 'close by', medium: 'a day out', far: 'far' };
const DEEP = 18;             // lake trout only count from a lake at least this deep (m)
const TROUT_WATER = 20;      // fishing.js bites lake trout only in lakes this deep, so a trout notice names one
const LENGTH_SKEW = 1.7;     // fishing.js startBite: length = lerp(smallest, largest, random ^ 1.7)
const SIZE_PCT = [0.6, 0.75]; // a size notice asks for a fish between these percentiles of the species' length
const STANDING = 0.25;       // standing with an outfitter for each notice claimed there (profile.raise)
const SPECIES_PAY = { perch: 12, crappie: 13, smallmouth: 14, pike: 15, walleye: 18, laketrout: 30 };
const SIZE_PAY = 10;

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
    texts: [["{one} for the lodge's anniversary supper. They hold deep and cold in {lake}{where}, down to {depth} m. A spoon, deep, and bring it back cold.", 'the lodge kitchen'], ['{one} for the smoker. Deep water only, like {lake}{where}: it goes down {depth} m. Let the spoon sink.', 'Arnie, smokehouse']] },
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

// --- the kinds ---------------------------------------------------------------------------------------------------
// A kind: { label, weight: { local, medium, far }, make(tasks, ctx) → fields | null (may be async), pay(t) → dollars,
// update(tasks, t, dt) while taken on, onEvent(tasks, t, ev) → words when it took the event, progress(t) → words }.
// ctx: { ep, band, rng, landing, reach, board }. A kind with an E action sets tasks.inReach in update and acts in
// use(tasks, t). Phase 2 and 3 kinds (photos, fetch, berries) register the same way.
export const KINDS = {};
export function registerKind(key, def) { KINDS[key] = { key, label: key, weight: { local: 1, medium: 1, far: 1 }, ...def }; return KINDS[key]; }

registerKind('fish', {
  label: 'For the kitchen', weight: { local: 1.4, medium: 1.2, far: 1.1 },
  make(T, c) {
    const onBoard = new Set(c.board.map((t) => t && t.kind === 'fish' && (t.species || 'any')).filter(Boolean));
    const fresh = (sp) => !onBoard.has(sp);
    let species = null, minCm = 0;
    if (c.band === 'far') {
      const trout = T.troutLake(c.landing, c.reach);
      if (trout && fresh('laketrout')) {
        const sizeIt = c.rng() < 0.3;
        const W = FISH_WORDS.laketrout, lake = trout.l.name, depth = Math.round(trout.l.maxDepth);
        const where = trout.hops != null ? hopsText(trout.hops) : `, ${fmtKm(trout.d / 1000)} km ${compass(trout.l.cx - c.landing.x, trout.l.cz - c.landing.z)} of here`;
        minCm = sizeIt ? sizeAt('laketrout', SIZE_PCT[0] + c.rng() * (SIZE_PCT[1] - SIZE_PCT[0])) : 0;
        const [say, sign] = pickR(c.rng, W.texts), text = fill(say, { one: minCm ? `One laker of ${minCm} cm or better` : 'One laker', lake, depth, where });
        return { species: 'laketrout', minCm, need: 1, lakeHint: trout.l.id, title: minCm ? 'A big laker' : W.title, text, sign, hint: T.hintFor(trout.l.id) };
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
      return { species, minCm, need: 1, title: `A big ${W.short}`, text: `One ${fishName(species)} of ${minCm} cm or better, kept. ${why}`, sign };
    }
    const [text, sign] = pickR(c.rng, W.texts);
    return { species, minCm: 0, need: 1, title: W.title, text, sign };
  },
  pay(t) { return t.species ? (SPECIES_PAY[t.species] || 12) + (t.minCm ? SIZE_PAY : 0) : 8; },
  // a kept fish this notice wants: the species, the size, and lake trout only from deep water
  fits(T, t, ev) {
    if (!ev.kept || t.status !== 'open') return false;
    if (t.species && t.species !== ev.species) return false;
    if (t.minCm && Math.round(ev.cm) < t.minCm) return false;
    if (ev.species === 'laketrout') { const l = T.lakeRec(ev.lake); if (!l || (l.maxDepth || 0) < DEEP) return false; }
    return true;
  },
  onEvent(T, t, ev) {
    if (ev.type !== 'catch' || !this.fits(T, t, ev)) return null;
    (t.cooler || (t.cooler = [])).push({ species: ev.species, cm: Math.round(ev.cm), lake: T.lakeName(ev.lake) || 'unnamed water', day: T.today() });
    const full = t.cooler.length >= (t.need || 1);
    if (full) t.status = 'done';
    const L = T.landing(t.from);
    return `A ${Math.round(ev.cm)} cm ${fishName(ev.species)} into the cooler for ${L ? L.name : 'the outfitter'}. ${full ? `Claim it at their counter, entry point ${t.from}.` : ''}`.trim();
  },
  progress(t) {
    const c = t.cooler || [], n = t.need || 1;
    if (!c.length) return n === 1 ? 'the cooler is empty' : `0 of ${n} in the cooler`;
    return `in the cooler: ${c.map((f) => `${fishName(f.species)}, ${f.cm} cm`).join('; ')}`;
  },
});

registerKind('item', {
  label: 'Lost and found', weight: { local: 0.9, medium: 1, far: 1 },
  async make(T, c) {
    const w = T.world, L = c.landing, [h0, h1] = BAND_HOPS.item[c.band], cands = [];
    w.campsites.forEach((s, i) => {
      const d = Math.hypot(s.x - L.x, s.z - L.z);
      if (d > RANGE || T.used('item', i)) return;
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
      return { key: cand.i, item: key, label: item.label, site: cand.i, lakeId, spot, hops: r.hops, title: pickR(c.rng, item.titles), text, sign, hint: T.hintFor(lakeId, cand.s) };
    }
    return null;
  },
  pay(t) { return 15 + 5 * (t.hops ?? 1); },
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
    const L = T.landing(t.from);
    T.note(`You have the ${t.label}. Bring it back to ${L ? L.name : 'the outfitter'}, entry point ${t.from}.`);
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
      if (d > RANGE) return;
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
    const base = { key: cand.i, portage: cand.i, rods: p.rods, hops, lakeId: p.launch[near].lake, sign };
    if (fromName && c.rng() < 0.4) {
      // a named point: the landing of the portage, on this side
      const W = SURVEY_WORDS.landing, dir = fromLake && fromLake.cells >= 2500 ? ` at the ${compass(p.launch[near].x - fromLake.cx, p.launch[near].z - fromLake.cz)} end` : '';
      const target = { x: p.launch[near].x, z: p.launch[near].z };
      return { ...base, target, title: pickR(c.rng, W.titles), text: `${hops === 0 ? `On ${fromName}, right off this landing,` : `Paddle to ${fromName}${hopsText(hops)}, and`} find the ${p.rods}-rod portage to ${toName}${dir}. How's the landing? ${pickR(c.rng, W.whys)}`, hint: T.hintFor(p.launch[near].lake, target) };
    }
    const W = SURVEY_WORDS.walk, end = far === 0 ? p.pts[0] : p.pts[p.pts.length - 1];
    const target = { x: end[0], z: end[1] };
    const from = fromName ? `from ${fromName}` : `off ${p.name.split(/\s[–-]\s/)[0]}`;
    return { ...base, target, title: pickR(c.rng, W.titles), text: `Walk the ${p.rods}-rod portage ${from} to ${toName}${hopsText(hops)}. How's the far landing? ${pickR(c.rng, W.whys)}`, hint: T.hintFor(p.launch[near].lake, target) };
  },
  pay(t) { return 10 + Math.round((t.rods || 0) / 25); },
  update(T, t) {
    const p = T.player;
    if (t.target && Math.hypot(t.target.x - p.x, t.target.z - p.z) < ARRIVE) {
      t.status = 'done';
      const L = T.landing(t.from);
      T.note(`Noted. Tell ${L ? L.name : 'the outfitter'} what you saw: entry point ${t.from}.`);
      T.changed();
    }
  },
  progress(t) { return t.rods ? `${t.rods} rods, not walked yet` : 'not there yet'; },
});

// --- the tasks ----------------------------------------------------------------------------------------------------
export class Tasks {
  constructor(world, scene, player, { audio = null, water = null } = {}) {
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
    injectCss();
  }
  // the day cycle (for the board's day), the fishing (the stringer) and the outfitter (its landings and profile)
  attach({ day = null, fishing = null, outfitter = null } = {}) { if (day) this.day = day; if (fishing) this.fishing = fishing; if (outfitter) this.outfitter = outfitter; return this; }
  get profile() { const g = window.__game; return (g && g.profile) || (this.outfitter && this.outfitter.profile) || null; }
  get money() { const p = this.profile; return p && typeof p.money === 'number' ? p.money : this.purse; }
  get kinds() { return KINDS; } // the registry, for the console and the tests
  has(key) { return this.unlocks.some((u) => u.key === key); }
  note(t) { if (t && this.onNote) this.onNote(t); }
  changed() { if (this.onChange) this.onChange(); }
  boardChanged() { if (this.onBoard) this.onBoard(); }
  today() { const d = this.day || (window.__game && window.__game.day); return d ? absDay(d.year, d.doy) : 0; }
  lakeRec(id) { return id > 0 ? this.world.lakes[id - 1] : null; }
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
      if (!l || !l.name || (l.maxDepth || 0) < TROUT_WATER) continue;
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
  // the soft circle on the map: the lake, never the spot
  hintFor(lakeId, site = null) {
    const l = this.lakeRec(lakeId);
    if (!l) return site ? { x: site.x + (Math.random() - 0.5) * 700, z: site.z + (Math.random() - 0.5) * 700, r: 900 } : null;
    let r = Math.max(500, Math.sqrt((l.cells * 100) / Math.PI) * 1.2 + 250);
    if (site) r = Math.max(r, Math.hypot(site.x - l.cx, site.z - l.cz) + 300);
    return { x: l.cx, z: l.cz, r: Math.round(r) };
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
      const f = await kind.make(this, { ep, band, rng, landing, reach, board });
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
    t.status = 'open'; t.taken = this.today();
    if (t.kind === 'fish') t.cooler = [];
    this.changed();
    return true;
  }
  accept(id) { return this.take(id); }
  // let a notice go before it is done: it stays pinned on its board, on offer again (a lost item's prop is lifted)
  drop(id) {
    const t = this.ads.get(+id);
    if (!t || t.status !== 'open') return false;
    this.removeProp(t.id);
    t.status = 'offered'; delete t.taken; if (t.cooler) t.cooler = [];
    const b = this.boards[t.from];
    if (!b || !b.slots.includes(t.id)) this.ads.delete(t.id); // not on a pin (an old save's task): gone
    this.changed();
    return true;
  }
  // where a notice is paid, said from the counter at `ep`
  whereToClaim(t, ep = null) {
    const L = this.landing(t.from), here = ep != null ? this.landing(ep) : null;
    if (!L) return 'That notice came off another board.';
    const d = here ? Math.hypot(L.x - here.x, L.z - here.z) : 0;
    const far = here && d > 500 ? `, about ${fmtKm(d / 1000)} km ${compass(L.x - here.x, L.z - here.z)} of here` : '';
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
  pay(t, ep) {
    const pay = t.pay || 0, p = this.profile;
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
    for (const from of [...new Set(elsewhere.map((t) => t.from))]) {
      const these = elsewhere.filter((t) => t.from === from), names = these.map((t) => `“${t.title}”`).join(', ');
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
    this.boardChanged();
    return r;
  }
  reset() {
    for (const id of [...this.props.keys()]) this.removeProp(id);
    this.ads.clear(); this.boards = {}; this.filling.clear();
    this.tally = { item: 0, survey: 0, fish: 0 }; this.unlocks = [];
    this.purse = 0; this.earned = 0; this.claimed = [];
    this.seed = (Date.now() & 0xffff) || 1;
    this.changed(); this.boardChanged();
  }
  // The hook for the fishing code (release): a fish landed on a lake, kept or let go. A kept one that a notice
  // taken on wants goes into that notice's cooler (the best paying first), and the words come back for the catch
  // line; otherwise null and it goes on the stringer.
  onCatch(species, lakeId, lengthCm = 0, kept = true) {
    const ev = catchEvent(species, lakeId, lengthCm, kept);
    for (const t of this.fitting(ev)) {
      const words = KINDS[t.kind].onEvent(this, t, ev);
      if (!words) continue;
      this.note(words);
      this.changed(); this.boardChanged();
      const L = this.landing(t.from);
      return `Into the cooler · for ${L ? L.name : 'the outfitter'}`;
    }
    for (const t of this.active) { const k = KINDS[t.kind]; if (k && !k.fits && k.onEvent) k.onEvent(this, t, ev); }
    return null;
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
  // the map: a soft circle per notice on the go
  hints() { return this.active.filter((t) => t.status === 'open' && t.hint).map((t) => t.hint); }
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
  }
  removeProp(id) { const m = this.props.get(id); if (m) { this.scene.remove(m); m.geometry.dispose(); this.props.delete(id); } }

  // --- the board at the counter (outfitter.js renders it in its middle column) -------------------------------
  boardSection(ep) {
    injectCss();
    const slots = this.board(ep), writing = this.filling.has(ep);
    const mine = slots.filter((t) => t && t.status !== 'offered'), ready = mine.filter((t) => t.status === 'done');
    const offered = slots.filter((t) => t && t.status === 'offered').length;
    const bits = [];
    if (offered) bits.push(`${word(offered)} on offer`);
    if (mine.length - ready.length) bits.push(`${word(mine.length - ready.length)} taken on`);
    if (ready.length) bits.push(`${word(ready.length)} to claim`);
    const sum = bits.length ? `${bits.join(', ')} · a new notice each morning` : writing ? 'the keeper is pinning up notices' : 'a new notice each morning';
    const all = ready.length > 1 ? `<button type="button" class="stamp" data-act="task" data-id="claimall">Claim all · $${ready.reduce((s, t) => s + t.pay, 0)}</button>` : '';
    const pins = slots.map((t, i) => this.notice(t, i, ep, writing)).join('');
    // what you have on the go from other boards (and anything of this board's off its pins)
    const away = this.active.filter((t) => !slots.includes(t));
    const list = away.map((t) => {
      const L = this.landing(t.from), k = KINDS[t.kind];
      const state = t.status === 'done' ? (t.from === ep ? '' : `done · claim at ${esc(L ? L.name : 'its outfitter')}, entry point ${t.from}`) : esc(k && k.progress ? k.progress(t) : 'on the go');
      // done, from this board (off its pins): claim it; done, from another board: the keeper says where it is paid
      const btn = t.status === 'done' ? ` <button type="button" class="stamp small${t.from === ep ? '' : ' quiet'}" data-act="task" data-id="claim:${t.id}">Claim · $${t.pay}</button>` : '';
      return `<li><b>${esc(t.title)}</b> · $${t.pay}${state ? ` · <span class="soft">${state}</span>` : ''}${btn}</li>`;
    }).join('');
    const elsewhere = away.length ? `<div class="elsewhere"><div class="lab">Taken from other boards</div><ul>${list}</ul></div>` : '';
    return `<section class="board cork" aria-labelledby="board-h">
      <div class="top"><h3 id="board-h">The board</h3><span class="sum">${sum}</span>${all}</div>
      <div class="notices">${pins}</div>${elsewhere}
    </section>`;
  }
  notice(t, i, ep, writing) {
    const tilt = [-1.1, 0.8, -0.5, 1.2][i % 4];
    if (!t) {
      const b = this.boards[ep], due = b && b.pending.includes(i);
      return `<article class="notice bare" style="--tilt:${tilt}deg"><i class="tack" aria-hidden="true"></i><p>${due && writing ? 'Pinning up a notice…' : 'A bare pin. Something new goes up in the morning.'}</p></article>`;
    }
    const k = KINDS[t.kind] || { label: t.kind };
    let btn, state = '';
    if (t.status === 'offered') btn = `<button type="button" class="stamp" data-act="task" data-id="take:${t.id}">Take it on</button>`;
    else if (t.status === 'done') {
      btn = `<button type="button" class="stamp" data-act="task" data-id="claim:${t.id}">Claim · $${t.pay}</button>`;
      state = `<div class="state done">Done${t.kind === 'fish' && k.progress ? ` · ${esc(k.progress(t))}` : ''}</div>`;
    } else {
      btn = `<button type="button" class="stamp quiet" data-act="task" data-id="drop:${t.id}">Let it go</button>`;
      state = `<div class="state">Taken on ${t.taken ? esc(this.dayWords(t.taken)) : ''} · ${esc(k.progress ? k.progress(t) : '')}</div>`;
    }
    return `<article class="notice${t.status === 'offered' ? '' : ' mine'}${t.status === 'done' ? ' done' : ''}" style="--tilt:${tilt}deg">
      <i class="tack" aria-hidden="true"></i>
      <div class="head"><span>${esc(k.label)} · ${BAND_WORDS[t.band] || ''}</span><b class="pay">$${t.pay}</b></div>
      <h4>${esc(t.title)}</h4>
      <p class="text">${esc(t.text)}</p>${state}
      <div class="foot">${btn}<span class="sign">— ${esc(t.sign || 'the counter')}</span></div>
    </article>`;
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
    return { v: 3, seed: this.seed, nextId: this.nextId, ads: [...this.ads.values()], boards: this.boards, purse: this.purse, earned: this.earned, claimed: this.claimed,
      tally: this.tally, unlocks: this.unlocks.map((u) => u.key) };
  }
  restore(d) {
    if (!d) return;
    for (const id of [...this.props.keys()]) this.removeProp(id);
    this.tally = { item: 0, survey: 0, fish: 0, ...(d.tally || {}) };
    this.unlocks = (d.unlocks || []).map((k) => UNLOCKS.find((u) => u.key === k)).filter(Boolean);
    this.nextId = d.nextId || 1; this.seed = d.seed || this.seed;
    this.purse = d.purse || 0; this.earned = d.earned || 0; this.claimed = Array.isArray(d.claimed) ? d.claimed : [];
    this.ads = new Map(); this.boards = {}; this.filling.clear();
    if (d.v >= 3) {
      for (const t of d.ads || []) if (t && t.id != null && KINDS[t.kind]) this.ads.set(t.id, t);
      for (const [ep, b] of Object.entries(d.boards || {})) {
        if (!b || !Array.isArray(b.slots)) continue;
        this.boards[ep] = { slots: SLOTS.map((_, i) => (b.slots[i] != null && this.ads.has(b.slots[i]) ? b.slots[i] : null)), day: b.day || 0, n: b.n || 0, pending: Array.isArray(b.pending) ? b.pending : [] };
      }
    } else {
      // an old save: the tasks under way are kept, claimable where they were posted; the old offers are gone
      for (const t of d.active || []) { const a = this.upgrade(t); if (a) { this.ads.set(a.id, a); this.nextId = Math.max(this.nextId, a.id + 1); } }
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
const CSS = `
#outfitter .board.cork { gap: 10px; }
#outfitter .cork .notices { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 214px), 1fr)); grid-auto-rows: max-content; gap: 14px 12px; align-content: start;
  min-height: 0; flex: 1 1 auto; overflow: auto; scrollbar-width: thin; padding: 13px 12px 12px; border-radius: 3px; border: 1px solid var(--edge-deep); background-color: #c4a77c;
  background-image: radial-gradient(rgba(96, 66, 34, .22) 1px, transparent 1.6px), radial-gradient(rgba(255, 244, 220, .2) 1px, transparent 1.6px);
  background-size: 7px 7px, 11px 11px; background-position: 0 0, 3px 5px; box-shadow: inset 0 1px 5px rgba(40, 24, 8, .25); }
#outfitter .cork .notice { position: relative; box-sizing: border-box; padding: 11px 12px 10px; background: var(--paper-note); border: 1px solid var(--edge); border-radius: 2px;
  box-shadow: 0 3px 6px rgba(40, 24, 8, .28); transform: rotate(var(--tilt, 0deg)); display: flex; flex-direction: column; gap: 4px; }
#outfitter .cork .notice .tack { position: absolute; left: 50%; top: -5px; width: 11px; height: 11px; margin-left: -5px; border-radius: 50%; background: var(--map-red);
  box-shadow: inset -2px -2px 0 rgba(0, 0, 0, .25), 0 1px 2px rgba(0, 0, 0, .35); }
#outfitter .cork .notice .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font: 700 10px/1.3 var(--sc); letter-spacing: .12em; color: var(--ink-soft); }
#outfitter .cork .notice .pay { font: 500 23px/0.9 var(--pencil-font); letter-spacing: 0; color: var(--pencil); }
#outfitter .cork .notice h4 { margin: 0; font: 600 16.5px/1.15 var(--serif); color: var(--ink); }
#outfitter .cork .notice .text { margin: 0; font-size: 13.5px; line-height: 1.34; }
#outfitter .cork .notice .state { font-size: 12.5px; line-height: 1.3; font-style: italic; color: var(--ink-soft); }
#outfitter .cork .notice .state.done { color: #3f5a2a; }
#outfitter .cork .notice .foot { margin-top: auto; padding-top: 3px; display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
#outfitter .cork .notice .foot .stamp { flex: none; font-size: 10.5px; padding: 5px 10px; }
#outfitter .cork .notice .sign { font: 500 16.5px/1 var(--pencil-font); color: var(--pencil); text-align: right; }
#outfitter .cork .notice.done { border-left: 4px solid var(--moss); }
#outfitter .cork .notice.mine:not(.done) { background: var(--paper-card); }
#outfitter .cork .notice.bare { background: transparent; border: 1px dashed rgba(60, 40, 20, .35); box-shadow: none; justify-content: center; min-height: 110px; }
#outfitter .cork .notice.bare p { margin: 0; font: 500 18px/1.15 var(--pencil-font); color: rgba(42, 32, 22, .7); text-align: center; }
#outfitter .cork .elsewhere { flex: none; display: flex; flex-direction: column; gap: 3px; max-height: 28%; overflow: auto; scrollbar-width: thin; }
#outfitter .cork .elsewhere ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; font-size: 13.5px; line-height: 1.35; }
#outfitter .cork .elsewhere .soft { color: var(--ink-soft); font-style: italic; }
#outfitter .cork .elsewhere .stamp.small { font-size: 10.5px; padding: 3px 8px; }
#journal .notice-list { display: flex; flex-direction: column; gap: 12px; }
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
