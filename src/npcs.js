// People in the outfitters (hubs phase 3, stream C): the keeper behind every counter, and the season's visitors.
//
// The owner: "different characters might show up in there and you can talk to them, different NPCs that might be going
// on trips. So it's kind of like this community area"; "the people are kind of for information, and sometimes they will
// have a single task that you can do for them".
//
// Who is there. Every store (props.js storeLayout) has its keeper standing behind the counter at L.keeper, leaning on
// it, the head turning to look at you while you are in the store. Each week a store has nought to two visitors, picked by
// a hash of the entry point and the week from twelve kinds, each in their months and their hours of the day: a guide, a
// wilderness ranger, a photographer, a family (a parent and a child), an old-timer, the portage crew, a birder, the café
// cook, the mail carrier, two trippers, a fishing guide and a kid with a bucket of leeches. They stand by the stove, at
// the lure wall, reading the board, in the aisle or at the end of the counter; they sit in the chair by the stove or on
// the porch bench, or stand at the porch rail looking at the lake (a store with a stoop and no porch keeps them inside).
// Who is in a store is settled as you come near it and holds while you are there, so nobody comes or goes in front of you.
//
// Talking (the owner's 2026-10-24 feedback, stream F: everything people say goes through dialogue.js). As you walk by,
// people make passing remarks, shown by their heads with their names: a visitor as you come near or a moment after you
// come into the room, a hook when they have something to ask, two trippers or a parent and a child between themselves,
// the keeper's hello as you come in and goodbye as you go (outfitter.js asks keeperSays), and now and then a word from
// behind the counter while you browse. A store is one room: its people's remarks queue there, one at a time.
// E within two metres of someone you face opens a conversation, Witcher style: a visitor's tree is their greeting, then
// ask about the area (their hints, in turn), ask about them (lore), their task (asked, then taken on or not; how it is
// going; handed over and paid) and goodbye. The keeper's is the news (keeperLine's talk: the keeper's own lines, the
// season's, and their insider hints at standing 2), the place, the counter (its services) and goodbye; at the counter E
// is still the counter and Q opens the keeper's conversation; the first word of the day with a keeper raises your
// standing there a little. A visitor's hint names something real near by: a lake and its fish, a campsite, a portage
// and how the trail is, the weather the forecast is bringing, a moose in a bay, the route they paddle tomorrow. A hint
// that means a lake's fish, a moose's bay or a long carry is pencilled on the map as the keepers' hints are
// (outfitter.toldHints, which this module extends). Their one task, if they have one: fetch a thing from another
// outfitter (the fetch kind, also on the boards, by water only there), take a letter or a thing to another outfitter or
// ashore at a campsite (the npc kind), find a thing lost at a campsite (the board's own item kind, or the npc kind where
// that finds nothing), or a photo for the photographer (stream B's photo kind when it is in the build; a fetch until
// then). Water first; an errand by the road pays both rides on top. It pays money (sometimes a lure or a dozen leeches on
// top), is listed at the counter (never pinned on the board) and in the journal, and is handed over in their
// conversation or at the counter of the outfitter they were at; once it is paid they thank you. Who you talked to, what
// you asked them and what they gave you is saved under `bwca-canoe:people`, cleared with a new season.
//
// The figures. A pool of three figures on the paddler's own model and material (figure.js buildFigure with the
// paddler's material, so no new shader program is added and no light), each recoloured per person by vertex role (the
// figure is built once in key colours, and each vertex's role and baked occlusion are kept), posed with figure.js's
// Poser: standing, leaning on the counter, or sitting. Never more than three are drawn, and a store's people are drawn
// together once you are within 40 m of its walls (so nobody appears as you come in the door, or as a tie-up puts you
// there); the walker is held off them as off a trunk.
//
// Hooks for later. A visitor going on a trip carries `party = { route, lakes, leaves, nights }` (a real chain of lakes
// out from the landing over the portages). Later they will put in as a party on the water that claims campsites through
// CampRegistry (camp.js); `People.parties()` lists them and `onParty` is the hook. "Join us" is switched off (JOIN_US).
//
//   new People({ world, scene, player, day, hud, tasks, outfitter, profile, weather, registry, mat })
//   people.update(dt)  after the outfitter's prompt (main.js): who is drawn, their poses, the prompt and E / Q
//   people.claimsE     a visitor is the one you face: the outfitter's hotspot leaves E to the talk (outfitter.js)
//   people.quiet       () => true while something else owns the keys (stream B's camera, raised): no prompt, no E
//   people.roster(ep), people.at(ep), people.talkTo(key), people.parties(), people.toldHints(), people.stats()
//   people.dialogue    dialogue.js (main.js sets it): barks and conversations; without it the lines go to hud.note
//   people.keeperSays(ep, words, moment)  the keeper's hello or goodbye as a bark (outfitter.js); false: say it yourself
//   people.speakerOf(person, fig)         the speaker dialogue.js places on the screen (the figure's head)
import * as THREE from 'three';
import { buildFigure } from './figure.js';
import { Mesher, V3, ringPts, loft } from './loft.js';
import { registerKind, KINDS } from './tasks.js';
import { outfitterProfile, keeperLine, placeFacts, abundanceOf } from './outfitters.js';
import { storeLayout, storeLayouts } from './props.js';
import { mulberry32 } from './rng.js';
import { save } from './save.js';
import { esc, word, fmtKm } from './hud.js';
import { monthDay } from './astro.js';
import { PRI } from './dialogue.js';

const NS = 'people';
const POOL = 3;               // figures drawn at most, at once
const DRAW_R = 40;            // metres from you to a store's walls within which its people are drawn
const DRAW_OUT = 44;          // and beyond which they are put away again
const STORE_R = 5;            // metres from a store's middle to its walls, about (8 x 6 m, and the porch)
const NEAR_STORE = 70;        // metres from a store within which its people are settled (and held)
const TALK_R = 2.0;           // metres within which E talks
const TALK_FACE = 0.5;        // cos of how squarely you must face someone to talk to them (60°)
const LOOK_R = 4.5;           // metres within which a visitor looks at you
const KEEPER_LOOK_R = 8;      // the keeper watches you anywhere in the store
const BODY_KEEP = 0.62;       // metres the walker is held off a standing person (their body and his)
const SEAT_KEEP = 0.7;        // and off a sitting one's knees
const STANDING_CHAT = 0.05;   // standing for the first word of the day with a keeper
const ARRIVE_STORE = 40;      // metres from another outfitter's landing that count as arriving there
const ARRIVE_SITE = 32;       // metres from a campsite that count as there
const FETCH_PAY = { base: 15, km: 1, max: 50 };   // the hubs plan's fetch: $15 + $1 a km, up to $50
const LETTER_PAY = { base: 10, km: 1, max: 40 };
export const JOIN_US = false; // later: "Join us" on a visitor going on a trip
const REMARK_R = 4.5;         // metres within which a visitor remarks as you come near
const ROOM_R = 7.5;           // and, a moment after you come into their room (ROOM_SETTLE s), anyone this near
const ROOM_SETTLE = 2.5;
const REMARK_GAP = 50;        // seconds before the same visitor remarks again
const PAIR_AFTER = 7;         // seconds in the room before a pair talk between themselves
const KEEPER_IDLE_AFTER = 35; // seconds in the store before the keeper says something over the counter

// --- small helpers ---------------------------------------------------------------------------------------------------
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const pickR = (rng, list) => (list && list.length ? list[Math.floor(rng() * list.length)] : null);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
const absDay = (year, doy) => Math.round(Date.UTC(year, 0, doy) / 86400000); // as trip.js and tasks.js
const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const compass = (dx, dz) => COMPASS[Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) / 45) % 8];
const kmOf = (m) => fmtKm(m / 1000);
const theWater = (name) => (/\bRiver$/.test(name || '') ? `the ${name}` : name);
const seeded = (...n) => mulberry32(n.reduce((h, x, i) => (Math.imul(h ^ ((x | 0) + i * 0x9e3779b9), 2654435761) >>> 0), 0x7e0b1e5) >>> 0);
// "one portage in", "right off the dock", "6.2 km northeast of here"
function whereWords(l) {
  if (l.here) return ', right off the dock';
  if (l.hops === 0) return ', on this water';
  if (l.hops === 1) return ', one portage in';
  if (l.hops != null && l.hops <= 4) return `, ${word(l.hops)} portages in`;
  return `, ${kmOf(l.d)} km ${l.dir} of here`;
}
const _e = new THREE.Euler();
// a body rotation as canoe.js has it: yaw (+ turns left), lean (+ forward), side (+ tips right)
const bodyQ = (yaw, lean, side, out = new THREE.Quaternion()) => out.setFromEuler(_e.set(side, yaw, -lean, 'YZX'));

// --- how people look ------------------------------------------------------------------------------------------------
// The figure's vertex roles (figure.js FIGURE_COLORS); the pool is built in a key colour per role so each vertex's role
// can be read back, and then dressed per person.
const ROLES = ['skin', 'shirt', 'cuff', 'pants', 'belt', 'pfd', 'pfdDark', 'strap', 'boot', 'sole', 'lace', 'hair', 'beard', 'hat', 'band'];
const KEY = Object.fromEntries(ROLES.map((k, i) => [k, new THREE.Color().setHSL(i / ROLES.length, 0.85, 0.5).getHex()]));
const KEY_LIN = ROLES.map((k) => new THREE.Color(KEY[k]));
const SKIN = [0xc8916a, 0xb98260, 0xa87150, 0x8a5a3c, 0x6e452e, 0xc28a62, 0x9c6a4b, 0xb07a58];
const HAIR = { dark: 0x3c2b1f, brown: 0x5b412d, fair: 0xa88a5a, red: 0x7a3e22, grey: 0x8a8580, white: 0xcbc7bf, black: 0x1f1a17 };
const SHIRTS = [0x7a2e2a, 0x2f4f6a, 0x3f5a3a, 0x6a5a3a, 0x5a3a52, 0x4d6577, 0x8a6a3a, 0x40505a];
const PANTS = [0x3a4a5a, 0x4a4436, 0x34362f, 0x5a5444, 0x2f3a46];
const BOOTS = [0x5a3e29, 0x3a2e24, 0x6a4a2e];
const HATS = [0x9d8b61, 0x6a5a40, 0x4a4a3a, 0x7a6a4a, 0x3a4436];
const FEMALE = new Set(['Ada', 'Agnes', 'Alma', 'Carol', 'Clara', 'Dot', 'Edna', 'Elsie', 'Ellen', 'Esther', 'Greta', 'Hazel', 'Helga', 'Ida', 'Inga', 'Ione', 'Joanne', 'June', 'Kari', 'Lois', 'Mae', 'Myrna', 'Nora', 'Sigrid', 'Sonja', 'Tess', 'Thea', 'Vi', 'Wilma', 'Ruth', 'Bev', 'Lise', 'Marit', 'Deb', 'Marge', 'Lorna', 'Anneli', 'Priya', 'Kate', 'Sue', 'Jo', 'Rosa', 'Nell', 'Britt', 'Maya', 'Hanna', 'Lucy', 'Liv', 'Ingrid', 'Pat', 'Dana', 'Gail']);
// a palette: { skin, shirt, cuff, pants, belt, pfd, pfdDark, boot, sole, lace, hair, beard, hat, band } and how the
// figure wears it: hat (bool), bun (bool), scale
function dress(rng, { female = false, age = 'adult', shirt, pfd, pants, hat, hatChance = 0.5, beardChance = 0.35, hair } = {}) {
  const skin = pickR(rng, SKIN);
  const hairC = hair != null ? hair : age === 'old' ? pickR(rng, [HAIR.white, HAIR.grey, HAIR.grey]) : pickR(rng, [HAIR.dark, HAIR.brown, HAIR.brown, HAIR.fair, HAIR.red, HAIR.black]);
  const sh = shirt != null ? shirt : pickR(rng, SHIRTS);
  const vest = pfd != null ? pfd : shade(sh, 0.7);
  const beard = !female && age !== 'kid' && rng() < (age === 'old' ? 0.8 : beardChance);
  const hatC = hat != null ? hat : pickR(rng, HATS);
  return {
    skin, shirt: sh, cuff: shade(sh, 1.18), pants: pants != null ? pants : pickR(rng, PANTS), belt: 0x3a2c20, pfd: vest, pfdDark: shade(vest, 0.66), strap: 0x2a2a2a,
    boot: pickR(rng, BOOTS), sole: 0x2a221c, lace: 0x3b2a1c, hair: hairC, beard: beard ? (age === 'old' ? hairC : shade(hairC, 1.15)) : skin, hat: hatC, band: shade(hatC, 0.55),
    wear: { hat: rng() < hatChance, bun: female && age !== 'kid' && rng() < 0.65, scale: age === 'kid' ? 0.62 : female ? 0.95 + rng() * 0.03 : 0.98 + rng() * 0.05 },
  };
}
function shade(hex, k) { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return c.getHex(); }

// --- the twelve kinds of visitor -------------------------------------------------------------------------------------
// months: [from, to] (1 = January), hours: [from, to) of the day; at: how much each kind of outfitter draws them;
// spots: where they like to be, best first (a pair names a pair of spots); hints: what they tell you, in order; task:
// what they may ask (null: nothing); odds: how often they have one; wear: their clothes.
const CITIES = ['Minneapolis', 'St. Paul', 'Duluth', 'Des Moines', 'Madison', 'Chicago', 'Milwaukee', 'Rochester', 'Fargo', 'Iowa City', 'Thunder Bay', 'Winnipeg', 'Eau Claire', 'Ames'];
const F_NAMES = ['Marit', 'Anneli', 'Priya', 'Kate', 'Sue', 'Jo', 'Rosa', 'Nell', 'Britt', 'Maya', 'Hanna', 'Lucy', 'Liv', 'Ingrid', 'Pat', 'Dana', 'Gail', 'Lorna'];
const M_NAMES = ['Jake', 'Dave', 'Tom', 'Sam', 'Arne', 'Pete', 'Luis', 'Ben', 'Mike', 'Eli', 'Gary', 'Hal', 'Nate', 'Rolf', 'Will', 'Joe', 'Dan', 'Kurt'];
const OLD_NAMES = ['Walt', 'Otto', 'Hjalmar', 'Clem', 'Arvo', 'Reino', 'Edna', 'Ione', 'Toivo', 'Elmer'];
const KID_NAMES = ['Tyler', 'Emma', 'Owen', 'Ava', 'Finn', 'Lily', 'Max', 'Ruby', 'Leo', 'Nora'];
const SURNAMES = ['Olson', 'Lindqvist', 'Peterson', 'Nguyen', 'Hansen', 'Garcia', 'Kowalski', 'Larsen', 'Schmidt', 'Johnson', 'Haugen', 'Novak'];
const COOKS = ['Marge', 'Lorna', 'Dolores', 'Arlene', 'Sue'];
const ARCH = {
  guide: { months: [6, 9], hours: [7, 20], at: { lodge: 1.3, 'river post': 0.8, 'trout camp': 1, 'bait shop': 0.6 }, spots: ['counterEnd', 'aisle', 'rail'], hints: ['fish', 'route', 'camp'], task: 'fetch', odds: 0.8, party: true,
    who: (v) => `a guide out of ${v.town}`, wear: { pfd: [0xd65428, 0xc8a22a, 0x2f6aa0], hatChance: 0.8 } },
  ranger: { months: [5, 10], hours: [8, 19], at: { lodge: 1, 'river post': 1.3, 'trout camp': 1, 'bait shop': 1 }, spots: ['board', 'counterEnd', 'rail'], hints: ['portage', 'rules', 'weather'], task: 'letterSite', odds: 0.75,
    who: () => 'a wilderness ranger with the Forest Service', wear: { shirt: 0x8c8a6c, pfd: 0x4a5a3a, pants: 0x3f4a32, hat: 0x55583a, hatChance: 1 } },
  photographer: { months: [5, 10], hours: [6, 21], at: { lodge: 1.2, 'river post': 1.1, 'trout camp': 0.9, 'bait shop': 0.8 }, spots: ['rail', 'board', 'aisle'], hints: ['moose', 'loons', 'light'], task: 'photo', odds: 0.9,
    who: (v) => `a photographer up from ${v.city}`, wear: { shirt: 0x6a6a5a, pfd: 0xa89a6a, hatChance: 0.7 } },
  family: { months: [6, 8], hours: [8, 20], at: { lodge: 1.4, 'river post': 0.7, 'trout camp': 0.8, 'bait shop': 1 }, spots: [['lures', 'kidLures'], ['rail', 'rail2'], ['aisle', 'mid']], hints: ['camp', 'swim'], task: 'lost', odds: 0.85, pair: 'kid', party: true,
    who: (v) => `up from ${v.city} with the kids`, wear: { pfd: [0xd8b02a, 0xd65428, 0x3a7aa0], hatChance: 0.4 } },
  oldtimer: { months: [5, 10], hours: [7, 21], at: { lodge: 1, 'river post': 1, 'trout camp': 1.2, 'bait shop': 1.3 }, spots: ['chair', 'bench', 'stove'], hints: ['history', 'weather', 'fish'], task: 'letterOutfitter', odds: 0.7, age: 'old',
    who: () => 'who has fished here since the fifties', wear: { shirt: 0x8a2a24, pfd: 0x2f2a26, hatChance: 0.6 } },
  crew: { months: [6, 9], hours: [7, 18], at: { lodge: 0.7, 'river post': 1.4, 'trout camp': 1, 'bait shop': 1.2 }, spots: ['counterEnd', 'stove', 'rail'], hints: ['portage', 'portage2'], task: 'fetch', odds: 0.75,
    who: (v) => `on the ${v.district} portage crew`, wear: { shirt: 0x6a7a5a, pfd: 0x3f4f3a, pants: 0x3f4a32, hat: 0x55583a, hatChance: 0.9 } },
  birder: { months: [5, 9], hours: [6, 20], at: { lodge: 1, 'river post': 1.2, 'trout camp': 1, 'bait shop': 0.9 }, spots: ['rail', 'bench', 'board'], hints: ['loons', 'eagle', 'owl'], task: 'lost', odds: 0.7,
    who: () => 'a birder with a long life list', wear: { shirt: 0x7a7a5a, pfd: 0x5a6a4a, hatChance: 0.9 } },
  cook: { months: [6, 9], hours: [9, 15], at: { lodge: 2.2, 'river post': 0.3, 'trout camp': 0.6, 'bait shop': 0.3 }, spots: ['counterEnd', 'stove'], hints: ['cafe', 'berries'], task: 'fetch', odds: 0.85,
    who: () => 'who cooks at the café', wear: { shirt: 0xd8d4c8, pfd: 0xe6e2d6, pants: 0x34362f, hatChance: 0 }, female: true },
  mail: { months: [5, 10], hours: [10, 15], at: { lodge: 1, 'river post': 1, 'trout camp': 1, 'bait shop': 1 }, spots: ['counterEnd', 'board'], hints: ['weather', 'road'], task: 'letterOutfitter', odds: 0.8,
    who: (v) => `who drives the mail up ${v.road}`, wear: { shirt: 0x5a6a80, pfd: 0x2f3a4a, pants: 0x2f3a46, hat: 0x2f3a4a, hatChance: 0.5 } },
  trippers: { months: [6, 9], hours: [7, 21], at: { lodge: 1.1, 'river post': 1.1, 'trout camp': 1, 'bait shop': 1 }, spots: [['rail', 'rail2'], ['board', 'mid'], ['aisle', 'mid']], hints: ['route', 'fish', 'camp'], task: 'lost', odds: 0.75, pair: 'adult', party: true,
    who: () => 'two trippers going in tomorrow', wear: { pfd: [0xd65428, 0x2f6aa0, 0xc8a22a, 0x3a6a3a], hatChance: 0.6 } },
  fishguide: { months: [5, 9], hours: [6, 20], at: { lodge: 1.2, 'river post': 0.6, 'trout camp': 1.6, 'bait shop': 1 }, spots: ['aisle', 'counterEnd', 'lures'], hints: ['fish', 'fish2'], task: 'fetch', odds: 0.85,
    who: () => 'a fishing guide', wear: { pfd: [0x3a5a3a, 0xb0402a], hatChance: 0.9 } },
  kid: { months: [6, 8], hours: [9, 19], at: { lodge: 0.7, 'river post': 0.5, 'trout camp': 0.6, 'bait shop': 1.0 }, spots: ['bench', 'lures', 'rail'], hints: ['dock', 'leeches'], task: 'deliverSite', odds: 0.85, age: 'kid',
    who: () => 'with a bucket of leeches', wear: { pfd: 0xe07a2a, hatChance: 0.2 } },
};
export const ARCHETYPES = Object.keys(ARCH);

// Where people stand or sit, in the store's own frame (props.js: a across, b toward the lake, y up from the floor):
// face is the way they face (a, b); pose stand or sit (seat: the seat's height); porch: only where the store has one.
const SPOTS = {
  stove: { a: -1.55, b: -1.95, face: [-0.55, -0.83], pose: 'stand' },
  chair: { a: -1.092, b: -2.73, face: [-0.94, 0.34], pose: 'sit', seat: 0.47 },
  lures: { a: -2.2, b: 1.35, face: [-0.9, 0.45], pose: 'stand' },
  kidLures: { a: -2.15, b: 0.62, face: [-0.6, 0.8], pose: 'stand' },
  board: { a: 2.25, b: 1.95, face: [0.85, 0.53], pose: 'stand' },
  mid: { a: 1.35, b: 2.5, face: [0.8, 0.6], pose: 'stand' },
  aisle: { a: 1.78, b: 0.95, face: [-1, 0.1], pose: 'stand' },
  counterEnd: { a: 2.2, b: -1.95, face: [-0.35, -0.94], pose: 'stand' },
  bench: { a: 1.45, b: 4.36, face: [0, 1], pose: 'sit', seat: 0.46, porch: true },
  bench2: { a: 2.1, b: 4.36, face: [0, 1], pose: 'sit', seat: 0.46, porch: true },
  rail: { a: -2.1, b: 5.25, face: [0.2, 1], pose: 'stand', porch: true, y: -0.04 },
  rail2: { a: -1.45, b: 5.3, face: [-0.35, 1], pose: 'stand', porch: true, y: -0.04 },
};
const PORCH_FALLBACK = { bench: 'chair', bench2: 'stove', rail: 'board', rail2: 'mid' };

// --- the figure pool -------------------------------------------------------------------------------------------------
// Each vertex's role (the nearest key colour) and the colour last written there (so the occlusion the background bake
// multiplies in is read back as current / written, whenever it lands)
function rolesOf(arr) {
  const n = arr.length / 3, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = arr[i * 3], g = arr[i * 3 + 1], b = arr[i * 3 + 2];
    let best = 0, bd = Infinity;
    for (let k = 0; k < KEY_LIN.length; k++) { const c = KEY_LIN[k], d = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2; if (d < bd) { bd = d; best = k; } }
    out[i] = best;
  }
  return out;
}
const _lin = ROLES.map(() => new THREE.Color());
function recolour(attr, roles, written, pal) {
  for (let k = 0; k < ROLES.length; k++) { _lin[k].set(pal[ROLES[k]] ?? KEY[ROLES[k]]); _lin[k].r = Math.max(0.002, _lin[k].r); _lin[k].g = Math.max(0.002, _lin[k].g); _lin[k].b = Math.max(0.002, _lin[k].b); }
  const a = attr.array;
  for (let i = 0, n = roles.length; i < n; i++) {
    const o = i * 3, w0 = written[o], w1 = written[o + 1], w2 = written[o + 2];
    const m = w0 >= w1 && w0 >= w2 ? 0 : w1 >= w2 ? 1 : 2, ao = written[o + m] > 1e-6 ? a[o + m] / written[o + m] : 1;
    const c = _lin[roles[i]];
    a[o] = c.r * ao; a[o + 1] = c.g * ao; a[o + 2] = c.b * ao;
    written[o] = c.r; written[o + 1] = c.g; written[o + 2] = c.b;
  }
  attr.needsUpdate = true;
}
// a bun of hair at the nape, on the head bone (head-bone space: x forward, y up from the head joint)
function bunGeometry() {
  const m = new Mesher(), c = new THREE.Color(KEY.hair), rings = [];
  const P = [[-0.085, 0.07, 0.03], [-0.11, 0.072, 0.04], [-0.13, 0.075, 0.046], [-0.148, 0.08, 0.042], [-0.16, 0.085, 0.028], [-0.166, 0.088, 0.008]];
  for (const [x, y, r] of P) rings.push(ringPts(V3(x, y, 0), V3(0, 1, 0), V3(0, 0, 1), 10, [r * 0.9, r], { col: c }));
  loft(m, rings, { capStart: true, capEnd: true });
  return m.geometry();
}

class Body {
  constructor(mat, scene, i) {
    const fig = this.fig = buildFigure(mat, KEY);
    this.group = fig.group; this.group.name = `person ${i}`; this.group.visible = false;
    const col = fig.mesh.geometry.getAttribute('color'), hcol = fig.hat.geometry.getAttribute('color');
    this.parts = [{ attr: col, roles: rolesOf(col.array), written: Float32Array.from(col.array) }, { attr: hcol, roles: rolesOf(hcol.array), written: Float32Array.from(hcol.array) }];
    const bun = this.bun = new THREE.Mesh(bunGeometry(), mat);
    bun.castShadow = true; bun.receiveShadow = true; bun.visible = false;
    fig.bones.head.add(bun);
    const bcol = bun.geometry.getAttribute('color');
    this.parts.push({ attr: bcol, roles: rolesOf(bcol.array), written: Float32Array.from(bcol.array) });
    scene.add(this.group);
    this.who = null; // the figure of a person: { person, fig: 0 | 1 }
    this.s = { breath: Math.random() * 6, shift: Math.random() * 6, glanceT: 2 + Math.random() * 3, glanceYaw: 0, glancePitch: 0, yaw: 0, pitch: 0, turn: 0, look: 0 };
  }
  wear(look) {
    for (const p of this.parts) recolour(p.attr, p.roles, p.written, look);
    this.fig.hat.visible = !!look.wear.hat;
    this.bun.visible = !!look.wear.bun && !look.wear.hat;
    this.group.scale.setScalar(look.wear.scale || 1);
  }
}

// The standing pose, as canoe.js stands the walker (the legs to planted feet, the arms hanging, the breath), and its two
// variants: leaning on a counter (the hands on its top `counter` metres ahead, at `top` over the floor) and sitting (on a
// seat `seat` high). look: { yaw, pitch } of the head toward what it watches, in the body's frame.
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), FOOT = { L: new THREE.Quaternion(), R: new THREE.Quaternion() };
FOOT.L.setFromAxisAngle(V(0, 1, 0), 0.1); FOOT.R.setFromAxisAngle(V(0, 1, 0), -0.1);
const SIT_FOOT = { L: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 0.18), R: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -0.18) };
function posePerson(body, spec, dt, sc = 1) {
  const P = body.fig.poser, J = body.fig.joints, s = body.s;
  s.breath += dt * Math.PI * 2 * 0.22; s.shift += dt * 0.55;
  const br = Math.sin(s.breath);
  const yaw = s.yaw, pitch = s.pitch;
  if (spec.pose === 'sit') {
    const seat = spec.seat / sc;
    const pelvis = bodyQ(0.15 * yaw, -0.06, 0), chest = bodyQ(0.35 * yaw, 0.1 + 0.01 * br, 0), head = bodyQ(yaw, pitch - 0.05, 0);
    P.setRoot(V(0.02, seat + 0.098 + 0.05, 0), pelvis);
    P.rot('spine', _q.copy(pelvis).slerp(chest, 0.5)); P.rot('chest', chest); P.rot('neck', _q.copy(chest).slerp(head, 0.45)); P.rot('head', head);
    P.rot('clavL', chest); P.rot('clavR', chest);
    for (const [k, sg] of [['L', -1], ['R', 1]]) {
      P.leg(k, V(0.47, 0.085, sg * 0.15), V(0.6, 1.2, sg * 0.2), SIT_FOOT[k]);
      const sh = J['arm' + k].p;
      P.arm(k, V(0.33, seat + 0.2, sg * 0.15), V(0, 0, 1), V(sh.x - 0.15, sh.y - 0.4, sh.z + sg * 0.35), V(0, -1, 0));
    }
    return;
  }
  const lean = (spec.lean || 0.02) + 0.008 * br;
  const pelvis = bodyQ(0.12 * yaw, 0.03 + lean * 0.3, 0), chest = bodyQ(0.35 * yaw, lean, 0), head = bodyQ(yaw, pitch + 0.1 * lean, 0);
  const sway = spec.pose === 'counter' ? 0 : 0.012 * Math.sin(s.shift);
  P.setRoot(V(lean * 0.06, 0.925 - 0.02 + 0.05 - 0.004 * (0.5 + 0.5 * br) - (spec.pose === 'counter' ? 0.012 : 0), sway), pelvis);
  P.rot('spine', _q.copy(pelvis).slerp(chest, 0.5)); P.rot('chest', chest); P.rot('neck', _q.copy(chest).slerp(head, 0.45)); P.rot('head', head);
  _q2.setFromEuler(_e.set(0.01 * br, 0, 0, 'YXZ')); P.rot('clavL', _q.copy(chest).multiply(_q2));
  _q2.setFromEuler(_e.set(-0.01 * br, 0, 0, 'YXZ')); P.rot('clavR', _q.copy(chest).multiply(_q2));
  for (const [k, sg] of [['L', -1], ['R', 1]]) {
    const ankle = V(-0.005 + (k === 'L' ? 0.03 : -0.02), 0.085, sg * 0.12);
    P.leg(k, ankle, V(0.6, 0.5, sg * 0.16), FOOT[k]);
  }
  const cq = J.chest.q;
  for (const [k, sg] of [['L', -1], ['R', 1]]) {
    const sh = J['arm' + k].p;
    if (spec.pose === 'counter') {
      // the hands on the counter's top a little ahead, the elbows out
      P.arm(k, V(spec.counter, spec.top + 0.04, sg * 0.21), V(0, 0, 1), V(sh.x - 0.25, sh.y - 0.35, sh.z + sg * 0.45), V(0, -1, 0));
      continue;
    }
    const sw = 0.05, bend = 0.3;
    const du = V(Math.sin(sw), -Math.cos(sw), sg * 0.13).normalize().applyQuaternion(cq);
    const df = V(Math.sin(sw + bend), -Math.cos(sw + bend), sg * 0.06).normalize().applyQuaternion(cq);
    const elbow = sh.clone().addScaledVector(du, 0.315), target = elbow.clone().addScaledVector(df, 0.335);
    P.arm(k, target, V(1, 0, -sg * 0.15).applyQuaternion(cq), elbow.clone().add(V(-0.3, 0, sg * 0.05).applyQuaternion(cq)), V(0, 0, -sg).applyQuaternion(cq));
  }
}

// --- the tasks: fetch (boards and visitors) and npc (a visitor's errand) ----------------------------------------------
// What one outfitter sends for from another, by the kind of place it comes from
const THINGS = {
  lodge: [['a box of pies from the café', 'pies'], ['a sack of coffee beans', 'coffee'], ['the café’s pie tins', 'pie tins']],
  'river post': [['a spare paddle', 'paddle'], ['a roll of canvas for the canoe seats', 'canvas']],
  'trout camp': [['a crate of smoked lake trout', 'smoked trout'], ['a card of hand-hammered spoons', 'spoons']],
  'bait shop': [['a cooler of leeches', 'leeches'], ['a bucket of minnows', 'minnows']],
};
const FETCH_TITLES = ['An errand to {place}', 'Pick-up at {place}', 'Fetch from {place}'];
// a landing reachable from here: by water within four portages (its hops) if there is one in range, else by the road
// (water: the water only); none another notice on the board already sends you to
function fetchTarget(T, c, ranges, { water = false } = {}) {
  const L = c.landing, reach = c.reach || new Map(), cands = [];
  const held = new Set((c.board || []).filter((t) => t && t.to != null).map((t) => t.to));
  for (const e of T.world.entryPoints) {
    if (e.ep === c.ep || held.has(e.ep)) continue;
    const d = Math.hypot(e.x - L.x, e.z - L.z);
    if (d < ranges[0] * 1000 || d > ranges[1] * 1000) continue;
    const r = reach.get(T.basinOf(e.lake));
    cands.push({ e, d, hops: r ? r.hops : null });
  }
  const wet = cands.filter((x) => x.hops != null), pool = wet.length ? wet : water ? [] : cands;
  if (!pool.length) return null;
  pool.sort((a, b) => a.d - b.d);
  return pickR(c.rng, pool.slice(0, 4));
}
// a ride up the road (rides.js): $5 + $0.50 a road km (about 1.4 x the crow's), to the $5; a road errand pays both rides
const rideFare = (km) => 5 * Math.round((5 + 0.5 * 1.4 * km) / 5);
const BAND_KM = { local: [1, 7], medium: [5, 16], far: [12, 35] };
function fetchFields(T, c, { thing = null, ranges = null, sign = null, lead = null, forWhom = 'us', water = false } = {}) {
  const tg = fetchTarget(T, c, ranges || BAND_KM[c.band] || BAND_KM.medium, { water });
  if (!tg) return null;
  const to = T.landing(tg.e.ep), op = outfitterProfile(tg.e.ep, T.world), from = outfitterProfile(c.ep, T.world);
  const who = op && op.keeper ? op.keeper.name : `the keeper at ${to.name}`;
  const [what, short] = thing || pickR(c.rng, THINGS[op ? op.kind : 'lodge'] || THINGS.lodge);
  const km = +(tg.d / 1000).toFixed(1), way = tg.hops == null ? ` (a ride up the road from the counter, ${fmtKm(km)} km as the crow flies)` : tg.hops === 0 ? ' (on this water)' : ` (${word(tg.hops)} ${tg.hops === 1 ? 'portage' : 'portages'} over)`;
  const text = `${lead ? `${lead} ` : ''}${who} at ${to.name}, ${to.place}${way}, has ${what} for ${forWhom}. Pick it up at their dock and bring it back here.`;
  const title = fill(pickR(c.rng, FETCH_TITLES), { place: to.place });
  return { to: tg.e.ep, toName: to.name, toPlace: to.place, toKeeper: who, thing: what, short, hops: tg.hops, road: tg.hops == null, km, title, text, sign: sign || (from && from.keeper ? `${from.keeper.first}, behind the counter` : 'the counter'), hint: { x: to.x, z: to.z, r: 600 } };
}
// the player is at another outfitter's landing: tied up there, in its store, or near its dock
function arrivedAt(T, ep) {
  const p = T.player, o = T.outfitter, l = T.landing(ep);
  if (o && o.visit && o.visit.ep === ep) return true;
  if (l && Math.hypot(l.x - p.x, l.z - p.z) < ARRIVE_STORE) return true;
  const L = storeLayout(ep);
  return !!(L && Math.hypot(L.centre.x - p.x, L.centre.z - p.z) < 25);
}
registerKind('fetch', {
  label: 'An errand', weight: { local: 0.2, medium: 0.5, far: 0.45 },
  make(T, c) { return fetchFields(T, c, { water: true }); }, // the boards send you by water
  pay(t) { return t.road ? Math.min(60, FETCH_PAY.base + Math.round(FETCH_PAY.km * (t.km || 0)) + 2 * rideFare(t.km || 0)) : Math.min(FETCH_PAY.max, FETCH_PAY.base + Math.round(FETCH_PAY.km * (t.km || 0))); },
  update(T, t) {
    if (t.to == null || !arrivedAt(T, t.to)) return;
    t.status = 'done';
    const L = T.landing(t.from);
    T.note(`${t.toKeeper || 'The keeper'} hands you ${t.thing}${t.npcName ? ` for ${t.npcName}` : ''}. Bring it back to ${L ? L.name : 'the outfitter'}, entry point ${t.from}.`);
    T.changed(); T.boardChanged();
  },
  progress(t) { return `${t.short || 'it'} waiting at ${t.toPlace || 'the other landing'}`; },
});
// a letter or a thing taken to another outfitter (to) or to a campsite (site: { x, z, lake, words })
registerKind('npc', {
  label: 'A favour', weight: { local: 0, medium: 0, far: 0 }, // a visitor's, never pinned on a board
  make() { return null; },
  pay(t) { const n = (t.base ?? LETTER_PAY.base) + Math.round(LETTER_PAY.km * (t.km || 0)); return t.road ? Math.min(60, n + 2 * rideFare(t.km || 0)) : Math.min(LETTER_PAY.max, n); },
  update(T, t) {
    const p = T.player;
    let there = false;
    if (t.to != null) there = arrivedAt(T, t.to);
    else if (t.site) there = !!p.onFoot && Math.hypot(t.site.x - p.x, t.site.z - p.z) < ARRIVE_SITE; // ashore at the site
    if (!there) return;
    t.status = 'done';
    const L = T.landing(t.from);
    T.note(`${t.left || `You hand over ${t.thing}.`} Back to ${L ? L.name : 'the outfitter'}, entry point ${t.from}, to say so.`);
    T.changed(); T.boardChanged();
  },
  progress(t) { return t.to != null ? `${t.short || 'it'} for ${t.toPlace}` : `${t.short || 'it'} for the site on ${t.site && t.site.lake ? t.site.lake : 'a lake'}: land there`; },
});

// --- what visitors tell you: hints from the place ----------------------------------------------------------------------
const FISH_LURE = { walleye: 'a jig and a leech, slow', pike: 'a spoon over the weeds', smallmouth: 'a crankbait off the rocky points', laketrout: 'a spoon, deep and slow', crappie: 'a small jig at dusk', perch: 'leeches on a bobber' };
const FISH_NAME = { walleye: 'walleye', pike: 'northerns', smallmouth: 'smallmouth', laketrout: 'lakers', crappie: 'crappie', perch: 'perch' };
// the fish a lake is good for, by its water (as outfitters.js reads the keepers' hints), best first
function fishOf(l) {
  const out = [];
  const ab = (sp) => abundanceOf(l.id, sp, l.cells);
  if (l.depth >= 20) out.push(['laketrout', 2 + ab('laketrout')]);
  if (l.ha >= 60 && !l.river && l.secchi < 3.2) out.push(['walleye', 1.4 + ab('walleye')]);
  if (l.ha >= 20 && !l.river && (l.tp >= 12 || l.secchi < 2.3)) out.push(['pike', 1.1 + ab('pike')]);
  if (l.ha >= 40 && !l.river && l.secchi >= 3.4) out.push(['smallmouth', 1.1 + ab('smallmouth')]);
  if (l.ha >= 10 && l.ha <= 160 && !l.river && l.secchi < 3) out.push(['perch', 0.8]);
  return out.sort((a, b) => b[1] - a[1]);
}
const ringOf = (l, kind) => ({ kind, lake: l.name, x: Math.round(l.x), z: Math.round(l.z), r: Math.round(Math.max(500, Math.sqrt(((l.cells || 3000) * 100) / Math.PI) * 1.2 + 250)) });

// The hint writer for one visitor: real lakes, sites and portages near the landing, none the keeper already tells
class HintWriter {
  constructor(people, ep, rng) {
    this.P = people; this.world = people.world; this.ep = ep; this.rng = rng;
    this.f = placeFacts(ep, this.world) || { lakes: [], deep: [], carries: [], camps: 0 };
    const op = outfitterProfile(ep, this.world);
    this.op = op;
    this.taken = new Set((op && op.hints ? op.hints : []).map((h) => h.lake)); // the keeper's own hint lakes
    this.used = new Set(); // campsite lakes told already
  }
  lakes(maxD = 10000) { return this.f.lakes.filter((l) => l.name && (l.d < maxD || l.here) && !this.taken.has(l.name)); }
  pickLake(list, score) { const s = list.map((l) => [l, score(l) + this.rng() * 0.25]).filter(([, v]) => v > -Infinity).sort((a, b) => b[1] - a[1]); return s.length ? s[0][0] : null; }
  reachScore(l) { return (l.here ? 0.5 : l.hops === 0 ? 0.45 : l.hops === 1 ? 0.35 : l.hops != null ? 0.15 : 0) - l.d / 14000; }
  fish(avoid = null) {
    const l = this.pickLake(this.lakes().filter((x) => x.name !== avoid && fishOf(x).length), (x) => this.reachScore(x) + (fishOf(x)[0] || [0, 0])[1] * 0.4);
    if (!l) return null;
    const [sp, sc] = fishOf(l)[0];
    this.taken.add(l.name);
    return { sp, l, thick: sc - (sp === 'laketrout' ? 2 : sp === 'walleye' ? 1.4 : 1.1) >= 1.2, where: whereWords(l), ring: ringOf(l, sp) };
  }
  // the named lake a point is on, by each lake's size and middle (a circle of its area, and 150 m of shore round it)
  lakeByShape(x, z) {
    let best = null, bd = 150;
    for (const l of this.f.lakes) { const d = Math.hypot(l.x - x, l.z - z) - Math.sqrt(((l.cells || 0) * 100) / Math.PI); if (d < bd) { bd = d; best = l; } }
    return best;
  }
  camp(minD = 300) {
    const w = this.world, L = this.P.landingOf(this.ep), sites = [];
    // the sites near by and the water each is on (the record's name where it has one, else the nearest lake's)
    const T = this.P.tasks, near = [], on = new Map();
    for (const c of w.campsites) { const d = Math.hypot(c.x - L.x, c.z - L.z); if (d <= 9000 && d >= minD) near.push({ c, d }); }
    near.sort((a, b) => a.d - b.d);
    for (const { c, d } of near.slice(0, 80)) {
      let lake = siteLake(c), l = lake ? this.f.lakes.find((x) => x.name === lake) : null;
      if (!l && T) { const id = T.lakeNear(c.x, c.z, 6); l = this.f.lakes.find((x) => x.id === id) || null; lake = l ? l.name : null; }
      if (!l) { l = this.lakeByShape(c.x, c.z); lake = l ? l.name : null; } // its tile not in: the lake whose round it is in
      if (!l || !lake || l.ha < 15 || this.used.has(lake)) continue;
      on.set(c, lake);
      sites.push({ c, l, lake, d, score: this.reachScore(l) + this.rng() * 0.3 });
    }
    if (!sites.length) return null;
    sites.sort((a, b) => b.score - a.score);
    const s = sites[0], n = near.filter((x) => on.get(x.c) === s.lake).length;
    const side = s.l.ha >= 25 ? compass(s.c.x - s.l.x, s.c.z - s.l.z) : null;
    this.used.add(s.lake);
    return { site: s.c, l: s.l, lake: s.lake, n, side, where: s.l.here ? ', on this water' : whereWords(s.l), name: side ? `the site on the ${side} shore of ${s.lake}` : `the site on ${s.lake}` };
  }
  portage(n = 0) {
    const w = this.world, L = this.P.landingOf(this.ep), out = [];
    w.portages.forEach((p, i) => {
      if (!p.pts || !p.pts.length || p.rods < 25 || !p.launch || p.launch.length < 2) return;
      const d = Math.hypot(p.pts[0][0] - L.x, p.pts[0][1] - L.z);
      if (d > 9000) return;
      const a = w.lakeName(p.launch[0].lake), b = w.lakeName(p.launch[1].lake);
      if (!a || !b || a === b) return;
      out.push({ p, i, d, a, b });
    });
    if (!out.length) return null;
    out.sort((x, y) => x.d - y.d);
    const pick = out[Math.min(out.length - 1, n + Math.floor(this.rng() * Math.min(3, out.length)))];
    const wet = this.P.weather && this.P.weather.wetness > 0.35, doy = this.P.day.doy;
    const how = wet ? 'muddy at the low end after the rain; put the packs down on the rocks, not in it'
      : doy < 165 ? 'flooded at the low end where the beavers have been at it; you’ll get your boots wet'
        : pickR(this.rng, ['clear now: we cut the blowdown out on Tuesday', 'rocky at the far landing, so mind the canoe getting out', 'a good trail with one wet spot in the middle', 'a steep pitch off the landing and easy after']);
    const ring = pick.p.rods >= 100 ? { kind: 'carry', lake: `${pick.a} – ${pick.b}`, x: Math.round(pick.p.pts[0][0]), z: Math.round(pick.p.pts[0][1]), r: 500 } : null;
    return { rods: pick.p.rods, a: pick.a, b: pick.b, how, ring };
  }
  weather() {
    const W = this.P.weather, d = this.P.day;
    if (!W || typeof W.forecast !== 'function') return null;
    const now = W.forecast(1)[0], wet = (s) => /rain|storm/.test(s);
    let ahead = null;
    for (let h = 2; h <= 30; h++) { const f = W.forecast(h); const ch = f.slice(1).find((x) => wet(x.state) !== wet(now.state) || (x.state === 'storm') !== (now.state === 'storm')); if (ch) { ahead = { h, ...ch }; break; } }
    if (!ahead) return { text: wet(now.state) ? 'This rain’s set in for the day. Dry socks in a bag, and a tarp over the fire.' : 'Settled weather for a day or two yet. Make the most of it.', when: null };
    const at = (d.hours + ahead.h) % 24, nextDay = d.hours + ahead.h >= 24;
    const when = ahead.h <= 2 ? 'within the hour or two' : nextDay ? (at < 10 ? 'by morning' : at < 14 ? 'tomorrow by noon' : 'tomorrow afternoon') : at < 12 ? 'later this morning' : at < 17 ? 'this afternoon' : at < 21 ? 'this evening' : 'tonight';
    const what = ahead.state === 'storm' ? 'a thunderstorm' : wet(ahead.state) ? 'rain' : 'it clearing';
    return { what, when, storm: ahead.state === 'storm', clearing: !wet(ahead.state) };
  }
  water(kind) { // a river or a weedy bay for a moose, a big lake for the eagles, any lake for the loons
    const list = this.lakes(9000);
    if (kind === 'moose') { const l = this.pickLake(list.filter((x) => x.river || x.tp >= 12 || x.secchi < 2.2), (x) => this.reachScore(x)); if (l) this.taken.add(l.name); return l; }
    const l = kind === 'eagle' ? this.pickLake(list.filter((x) => x.ha >= 200), (x) => this.reachScore(x) + x.ha / 4000) : this.pickLake(list.filter((x) => x.ha >= 20 && !x.river), (x) => this.reachScore(x));
    if (l) this.taken.add(l.name);
    return l;
  }
  // a party's way in: lakes out from the landing over the portages (the water graph), two to four of them
  route() {
    const T = this.P.tasks, w = this.world, L = this.P.landingOf(this.ep);
    if (!T || !L) return null;
    const adj = T.graph(), names = [], lakes = [];
    let basin = T.basinOf(L.lake);
    const seen = new Set([basin]), first = w.lakeName(L.lake);
    if (first) { names.push(first); lakes.push(L.lake); }
    for (let k = 0; k < 4; k++) {
      const next = (adj.get(basin) || []).filter((e) => !seen.has(e.to)).map((e) => ({ e, p: w.portages[e.portage] })).filter((x) => x.p && x.p.launch && x.p.launch[1 - x.e.end]);
      if (!next.length) break;
      const pick = next[Math.floor(this.rng() * next.length)], lake = pick.p.launch[1 - pick.e.end].lake, nm = w.lakeName(lake);
      seen.add(pick.e.to); basin = pick.e.to;
      if (nm && !names.includes(nm)) { names.push(nm); lakes.push(lake); }
      if (names.length >= 4 && this.rng() < 0.6) break;
    }
    return names.length >= 2 ? { names, lakes } : null;
  }
}
// "Lake One, Lake Two and Lake Three"
const siteLake = (c) => (c && c.name ? String(c.name).replace(/\s*#\s*\d+$/, '') : null); // "Saganaga Lake #60": the forest's own number off
const listWords = (a) => { const b = a.map(theWater); return b.length <= 1 ? b.join('') : `${b.slice(0, -1).join(', ')} and ${b[b.length - 1]}`; };

// Each visitor's lines: [the opener, ...] and what each hint sounds like in their mouth. A hint returns { text, ring? }
// or null when the place has nothing for it.
const HINTS = {
  fish(H, v) {
    const h = H.fish(); if (!h) return null;
    const lake = theWater(h.l.name), fishN = FISH_NAME[h.sp], lure = FISH_LURE[h.sp];
    const t = {
      guide: `Yesterday I had a party on ${lake}${h.where}. ${cap(fishN)} ${h.sp === 'laketrout' ? 'down deep' : 'on the windward points at dusk'}: ${lure}.`,
      fishguide: `${cap(lake)}${h.where}: the ${fishN} are ${h.sp === 'laketrout' ? 'sitting deep on the cold side of the thermocline' : 'on the fifteen-foot break'}. ${cap(lure)}.${h.thick ? ' Thick this year.' : ''}`,
      trippers: `We just came off ${lake}. ${cap(fishN)} ${h.sp === 'smallmouth' ? 'off every rocky point in the afternoon' : 'at dusk, right by the campsite'}. ${cap(lure)}.`,
      oldtimer: `When I was a boy my dad took ${fishN} out of ${lake}${h.where}. The same trick still works: ${lure}.`,
    }[v.arch] || `${cap(fishN)} in ${lake}${h.where}. ${cap(lure)}.`;
    return { text: t, ring: h.ring };
  },
  fish2(H, v) { return HINTS.fish(H, v); },
  camp(H, v) {
    const c = H.camp(); if (!c) return null;
    const t = {
      family: `The kids loved ${c.name}${c.where}. A sandy landing and a rock to jump off. ${c.n > 1 ? `There are ${word(c.n)} sites on it; that one’s the pick.` : ''}`.trim(),
      trippers: `If it’s open, take ${c.name}${c.where}. Flat rock for the tent and the sunset straight down the lake.`,
      guide: `If the island sites are taken, try ${c.name}${c.where}. It’s high and breezy, so the bugs leave you be.`,
    }[v.arch] || `There’s a good site: ${c.name}${c.where}.`;
    return { text: t };
  },
  swim(H) {
    const l = H.water('loons'); if (!l) return null;
    return { text: `There’s a swimming rock on ${theWater(l.name)}${whereWords(l)}. The water’s warm enough by July, if you don’t think about it.` };
  },
  portage(H, v, n = 0) {
    const p = H.portage(n); if (!p) return null;
    const t = v.arch === 'ranger' ? `The ${p.rods}-rod portage from ${p.a} to ${p.b} is ${p.how}.` : `We were on the ${p.rods}-rod carry, ${p.a} to ${p.b}, this week. It’s ${p.how}.`;
    return { text: t, ring: p.ring };
  },
  portage2(H, v) { return HINTS.portage(H, v, 2); },
  rules(H) {
    const n = H.f.camps || 0;
    return { text: `Nine to a site and two canoes at most, fires in the grates only, and pack out what you pack in.${n >= 10 ? ` There are ${n >= 100 ? 'over a hundred' : `${Math.floor(n / 10) * 10}-odd`} sites within a day of here; you’ll find one.` : ''}` };
  },
  weather(H, v) {
    const w = H.weather(); if (!w) return null;
    if (!w.when) return { text: w.text };
    const t = {
      oldtimer: w.clearing ? `My knee says it’ll clear ${w.when}. It’s never wrong.` : `My knee says ${w.what} ${w.when}. Hasn’t been wrong since ’62.`,
      mail: w.clearing ? `Radio in town says it clears ${w.when}.` : `Radio in town says ${w.what} ${w.when}.${w.storm ? ' Get off the big water before it comes.' : ''}`,
      ranger: w.clearing ? `The forecast has it clearing ${w.when}.` : `Forecast has ${w.what} ${w.when}. ${w.storm ? 'Get off the water and away from the tall pines when it comes.' : 'Keep the tarp handy.'}`,
    }[v.arch] || `${cap(w.what)} ${w.when}.`;
    return { text: t };
  },
  moose(H) {
    const l = H.water('moose'); if (!l) return null;
    return { text: `At first light a cow moose and her calf come to feed in the shallows of ${theWater(l.name)}${whereWords(l)}. Go slow and stay downwind.`, ring: ringOf(l, 'moose') };
  },
  loons(H) {
    const l = H.water('loons'); if (!l) return null;
    return { text: `A pair of loons with a chick on ${theWater(l.name)}${whereWords(l)}. Give the little islands a wide berth.` };
  },
  light(H) {
    const l = H.water('eagle') || H.water('loons'); if (!l) return null;
    return { text: `Go out on ${theWater(l.name)} at the end of the day. The light comes in low across the water for about twenty minutes, and then it’s gone.` };
  },
  eagle(H) {
    const l = H.water('eagle'); if (!l) return null;
    return { text: `Bald eagles nesting on ${theWater(l.name)}${whereWords(l)}: the big white pine on the point. They’ll scold you if you stop under it.` };
  },
  owl(H) {
    const c = H.camp(); if (!c) return null;
    return { text: `Half the night a barred owl called at ${c.name}${c.where}. “Who cooks for you.” Lovely, if you’re not trying to sleep.` };
  },
  history(H) {
    const l = (H.f.deep || []).find((x) => !H.taken.has(x.name)) || H.water('eagle');
    if (!l) return null;
    return { text: `In ’58 we carried a wood-canvas Chestnut into ${theWater(l.name)}${l.depth ? `. It goes down ${Math.round(l.depth)} metres` : ''}, and we fished it a week and never saw another soul.` };
  },
  route(H, v) {
    const r = v.party && v.party.route ? v.party : null; if (!r) return null;
    const rest = r.route.slice(1), n = r.nights;
    return { text: v.arch === 'guide' ? `I take a party in tomorrow: ${listWords(rest)}, ${word(n)} nights. Three canoes of dentists from ${v.city}.` : `We go in tomorrow: ${listWords(rest)}. ${cap(word(n))} nights, if the weather holds.` };
  },
  cafe(H) {
    const h = H.fish(); if (!h) return null;
    return { text: `The café’s paying for ${FISH_NAME[h.sp]} this week. They’re in ${theWater(h.l.name)}${h.where}, if you’ve the patience. Bring one in cold.`, ring: h.ring };
  },
  berries(H, v, n, P) {
    const doy = P.day.doy;
    if (doy >= 190 && doy <= 235) { const l = H.water('eagle') || H.water('loons'); return { text: `Blueberries are on in the burns${l ? ` along ${theWater(l.name)}` : ''}. Bring a pint in and I’ll make it into a pie.` }; }
    return { text: doy < 190 ? 'Blueberries come on in the burns about the middle of July. Then I make pies until I can’t look at one.' : 'The blueberries are done for the year. It’s apple from the store now, and nobody’s happy.' };
  },
  road(H) {
    const f = H.f;
    return { text: `${f.town || 'Town'}’s ${f.townKm || 'a long way'} km back down ${f.road || 'the road'}. Washboard past the gravel pit, so tie your canoe down twice.` };
  },
  dock(H) {
    const L = H.P.landingOf(H.ep), name = H.world.lakeName(L.lake) || 'the lake';
    return { text: `I caught a perch right off the dock! ${cap(theWater(name))} has the best perch. You have to be really quiet.` };
  },
  leeches() { return { text: 'There’s leeches under the flat rocks by the dock. I got eleven. One got in my sock.' }; },
};
const OPENERS = {
  guide: ['Morning.', 'Hey there.', 'Heading out?'], ranger: ['Afternoon.', 'Hello.', 'Good to see you.'], photographer: ['Oh, hello.', 'Hi.', 'Hello there.'],
  family: ['Hi!', 'Hello there.', 'Oh, hi.'], oldtimer: ['Sit down a minute.', 'Well, now.', 'Afternoon.'], crew: ['Hey.', 'Afternoon.', 'How’s it going.'],
  birder: ['Shh. Oh, it’s gone. Hello.', 'Hello!', 'Hi there.'], cook: ['Hi, hon.', 'Hello, dear.', 'Oh, hi.'], mail: ['Morning.', 'Afternoon.', 'Hey.'],
  trippers: ['Hey!', 'Hi.', 'Hey, how’s it going.'], fishguide: ['Morning.', 'Yep.', 'Hey.'], kid: ['Hi!', 'Hey! Hey!', 'Want to see my leeches?'],
};
// a greeting for the hour: no "Morning" after noon, no "Afternoon" before it or in the evening (as keeperLine does)
function opener(arch, h) {
  const all = OPENERS[arch] || ['Hello.'], fit = all.filter((w) => !(/^Morning/.test(w) && h >= 12) && !(/^Afternoon/.test(w) && (h < 12 || h >= 18)));
  return pickR(Math.random, fit.length ? fit : ['Hello.']);
}
const BYE = {
  guide: 'Paddle safe.', ranger: 'Have a good trip. Fires in the grates.', photographer: 'Keep your eyes open out there.', family: 'Have a lovely trip!', oldtimer: 'Go on, then. The lake won’t wait for you.',
  crew: 'Watch your step on the carries.', birder: 'Listen for the loons tonight.', cook: 'Come by the café, hon.', mail: 'See you up the road.', trippers: 'Maybe we’ll see you out there.', fishguide: 'Tight lines.', kid: 'Bye! Don’t step on the leeches!',
};
const THANKS = {
  guide: 'Thanks. That saves my week.', ranger: 'Much obliged. That’s one less trip for me.', photographer: 'That’s a keeper. Thank you.', family: 'Thank you so much! The kids were heartbroken.', oldtimer: 'You’re a good one. Here.',
  crew: 'Good. That saves us a day.', birder: 'Oh, thank you! I’d have wept.', cook: 'Bless you, hon.', mail: 'Saved me a trip. Thanks.', trippers: 'You’re a lifesaver.', fishguide: 'That’ll do. Thanks.', kid: 'Did he like them? Here, you can have some!',
};

// --- the conversation trees and the passing remarks (stream F) -------------------------------------------------------
// Who each is, in a word or two, over their line on the screen
const ROLE = { keeper: 'the keeper', guide: 'guide', ranger: 'ranger', photographer: 'photographer', family: 'with the kids', oldtimer: 'old-timer', crew: 'portage crew', birder: 'birder', cook: 'café cook', mail: 'mail carrier', trippers: 'tripper', fishguide: 'fishing guide', kid: 'with the leeches' };
const roleOf = (v, fig) => (v.keeper ? ROLE.keeper : v.arch === 'family' && fig === 1 ? 'their kid' : ROLE[v.arch] || '');
// the first time you meet them: who they are, in their words
const INTRO = {
  guide: (v) => `I’m ${v.first}. I guide out of ${v.vars.town}.`,
  ranger: (v) => `${v.first}, with the Forest Service. I look after the sites round here.`,
  photographer: (v) => `${v.first}. I take pictures for a magazine in ${v.vars.city}, when the light lets me.`,
  family: (v) => `We’re the ${v.last}s, up from ${v.vars.city}. This one’s been up since five.`,
  oldtimer: (v) => `${v.first}. I’ve fished these lakes since the fifties.`,
  crew: (v) => `${v.first}, ${v.vars.district} portage crew. We keep the carries open.`,
  birder: (v) => `${v.first}. I’m here for the birds, I’m afraid. Everyone else is here for the fish.`,
  cook: (v) => `I’m ${v.first}, hon. I cook at the café.`,
  mail: (v) => `${v.first}. I drive the mail up ${v.vars.road}.`,
  trippers: (v) => `I’m ${v.first}${v.figNames && v.figNames[1] ? `, and that’s ${v.figNames[1]}` : ''}. We go in tomorrow.`,
  fishguide: (v) => `${v.first}. I guide for fish. Walleye, mostly.`,
  kid: (v) => `I’m ${v.first}! I have a bucket of leeches!`,
};
const AGAIN = { kid: ['Hi again!', 'You came back!'], oldtimer: ['Back, are you?', 'Well, now.'], cook: ['Hello again, hon.'], birder: ['Oh, hello again.'] };
// about them: their lore, in turn ('route' and 'history' are their hints of those names, when the place has them)
const LORE = {
  guide: [(v) => `Twelve seasons out of ${v.vars.town}. Most of my parties have never held a paddle; by the third day they’re arguing about J-strokes.`, 'route', 'The trick is the first portage. Get them over it laughing and the rest of the week looks after itself.'],
  ranger: [(v) => `I patrol the ${v.vars.district} district: the sites, the latrines, the fire grates. Mostly the latrines.`, 'Most people do it right. The ones who don’t leave fish guts on the rocks and wonder why the bear came.', 'Nine to a site, two canoes at most. It’s not me being difficult. It’s the place staying wild.'],
  photographer: ['One good frame a day, if I’m lucky. The rest is mosquitoes and waiting.', 'I’m after a moose standing in the mist with the sun behind it. Six summers now.'],
  family: ['It’s the kids’ first time in. We’ll see if it’s their last.', 'route', (v) => `${v.vars.city}’s a long drive, but they slept the whole way. I didn’t.`],
  oldtimer: ['My father brought me up in ’52 in a wood-canvas Chestnut. There were motorboats on half these lakes then.', 'history', 'I don’t paddle the big water any more. I sit here and tell people where the fish are. Most of them don’t listen.'],
  crew: [(v) => `We clear the ${v.vars.district} portages: blowdown, washouts, the odd beaver dam. Crosscut saws only, in the wilderness.`, 'Eight days in, six out. You get used to the bugs. No, you don’t.'],
  birder: ['Two hundred and eleven species for Minnesota. A boreal owl would make it twelve.', 'Listen at dusk for the white-throated sparrow: “Old Sam Peabody, Peabody.” Once you’ve heard it you’ll hear it everywhere.'],
  cook: ['Nine summers at the café. The walleye on the menu is whatever you lot bring in.', 'Saturday’s pie day. Blueberry when they’re on, apple when they’re not, and everyone complains either way.'],
  mail: [(v) => `Three days a week up ${v.vars.road} and back. Washboard the whole way.`, 'I know every dog between here and town by name. Not all of them like me.'],
  trippers: ['route', 'Our first time this far in. We practised the portages in the back yard with the canoe on our heads. The neighbours loved it.'],
  fishguide: ['Twenty years on these lakes. I could find the fish blindfolded; it’s the clients who need the glasses.', 'Fish follow the wind and the light. Learn those and you won’t need a guide. Don’t tell anyone I said so.'],
  kid: ['I’m going to catch the biggest fish in the whole lake. Grandpa said.', 'I named one of my leeches Gerald. He’s the long one.'],
};
const NO_MORE = { kid: 'That’s all I know. Do you want to see my leeches again?', oldtimer: 'That’s the lot. The rest you find out on the water, like I did.' };
const NO_SELF = { oldtimer: 'Oh, I could go on. Another time.', kid: 'That’s everything about me.' };
// what they say as you pass: their own, and the hour's and the weather's
const REMARKS = {
  guide: ['Wind’s coming round to the west.', 'Good day for it, if you’re going in.', 'Watch the big stretches after noon.'],
  ranger: ['Fires in the grates only, mind.', 'Nice to see a proper pack.', 'Hang your food tonight.'],
  photographer: ['The light’s all wrong today.', 'Did you hear the loons last night?', 'Shh. A chickadee, on the rail.'],
  family: ['Don’t touch that, honey.', 'Have you been out long?', 'Is it always this buggy?'],
  oldtimer: ['Sit a minute, if you’ve a minute.', 'Hm. Another one going in.', 'Fish are biting, if you know how.'],
  crew: ['Watch the third step on that trail. It’s loose.', 'Blowdown on every carry this week.', 'Mind the mud.'],
  birder: ['Was that a veery? Did you hear it?', 'Oh! A Blackburnian. No. Gone.', 'Boreal chickadee by the dock this morning.'],
  cook: ['Wipe your boots, dear.', 'Pie’s Saturday, hon.', 'You look hungry.'],
  mail: ['Washboard all the way up.', 'Nothing for you today, I’m afraid.', 'Road’s dusty.'],
  trippers: ['Going in, or coming out?', 'Have you done the long carry?', 'How’s the water out there?'],
  fishguide: ['They’re on the reefs at dusk.', 'Jigs or spoons?', 'Wind on the point, fish on the point.'],
  kid: ['I have leeches!', 'Do you want to see my leeches?', 'I caught a perch!'],
};
// a hook: muttered when they have something to ask and have not asked it yet
const HOOK = {
  guide: 'Short a paddle, and a party at six. Hm.', ranger: 'Somebody has to get that note out there…', photographer: 'One picture short. One.', family: 'We’ll never find it now…',
  oldtimer: 'I owe a letter I can’t carry myself any more.', crew: 'The saw’s gone dull, and the file’s up the road.', birder: 'How could I leave it behind…', cook: 'No flour, and Saturday’s pie day.',
  mail: 'One sack too many for the truck.', trippers: 'Rookie move, leaving it behind.', fishguide: 'Out of leeches, with a party at six.', kid: 'Grandpa forgot his leeches!',
};
const ACCEPT = { guide: 'Good. I owe you one.', ranger: 'Much obliged.', photographer: 'Wonderful. Thank you.', family: 'Oh, would you? Thank you!', oldtimer: 'Good. It’ll make their week.', crew: 'Good. Saves us a day.', birder: 'Oh, thank you!', cook: 'You’re a dear.', mail: 'Saves me a trip.', trippers: 'You’re a lifesaver.', fishguide: 'Good.', kid: 'Yay! Thank you!' };
const LATER = { kid: 'Okay… but soon?', oldtimer: 'It’s waited forty years. It’ll wait.', cook: 'No trouble, hon.' };
const NO_TASK = { kid: 'Never mind! Grandpa found them.', oldtimer: 'No, no. It’ll keep.' };
// two of a pair between themselves: [figure, words], in turn (family: 0 the parent, 1 the child)
const PAIRS = {
  trippers: [[[0, 'Did you pack the coffee?'], [1, 'You packed the coffee.']], [[0, 'How many portages tomorrow?'], [1, 'Don’t ask. Just carry.']], [[1, 'Think the wind will lie down?'], [0, 'It always does. Eventually.']]],
  family: [[[1, 'Can we get a lure? Please?'], [0, 'One lure. One.']], [[1, 'Is there a bathroom in the woods?'], [0, 'The whole woods is the bathroom, honey.']], [[1, 'I want to see a moose.'], [0, 'Then you’ll have to be very quiet.']]],
};
// the keeper's words by manner: what they ask you, who they are, what they say over the counter while you browse
const KEEPER_ASK = { warm: 'What can I get you, dear?', dry: 'What’ll it be?', gruff: 'Yep?', 'old hand': 'Well, now. What do you need?', keen: 'Hi! What can I help with?', precise: 'How can I help?' };
const KEEPER_SELF = {
  warm: 'Twenty-odd summers behind this counter. Winters I knit and listen to the ice.', dry: 'I came up for one summer in ’98. The summer’s still going.', gruff: 'Born here. I’ll die here. Not today, though.',
  'old hand': 'Forty years. I sold the first Kevlar canoe on this road, and the man sank it in a week.', keen: 'It’s my first summer! I’m at the university in Duluth the rest of the year.', precise: 'Twenty years with the Forest Service, then this. The trails are the same; the paperwork is worse.',
};
const KEEPER_IDLE = {
  warm: ['Holler if you need anything, dear.', 'Coffee’s on, if you want a cup.'], dry: ['Take your time. The lake isn’t going anywhere.', 'Browsing is free. So far.'], gruff: ['Shelves are labelled.', 'Mm.'],
  'old hand': ['That shelf’s been there since ’71. So have I.', 'Ask if you can’t find it.'], keen: ['Let me know if you need help finding anything!', 'The new spoons just came in!'], precise: ['Everything’s priced. Ask if it isn’t.', 'Ask if you can’t find something.'],
};
// a task's words in the tree: the choice that hands it over, and the line about how it is going
function doneChoice(t) {
  if (t.kind === 'item') return `I found the ${t.label}.`;
  if (t.kind === 'photo') return 'Here’s the photo.';
  if (t.kind === 'fetch') return `Here’s ${t.short || 'it'}.`;
  return /^You find/.test(t.left || '') ? `I found ${t.short || 'it'}.` : 'It’s delivered.';
}
function doneRemark(t) {
  if (t.kind === 'item') return `You found the ${t.label}!`;
  if (t.kind === 'photo') return 'Did you get the picture?';
  if (t.kind === 'fetch') return `Is that ${t.short || 'it'}? Bring it here!`;
  return /^You find/.test(t.left || '') ? `You found ${t.short || 'it'}!` : 'Did it get there all right?';
}
const statusWords = (t) => ({ fetch: `Any luck at ${t.toPlace}?`, npc: `Still got ${t.short || 'it'}? No rush.`, item: `Did you find the ${t.label}? It’s at the site, I’m sure of it.`, photo: 'Any luck with the picture?' }[t.kind] || 'No rush.');
const aboutChoice = (t) => (t.kind === 'item' ? `About the ${t.label}…` : t.kind === 'photo' ? 'About the picture…' : `About ${t.short || 'the errand'}…`);

// What each one asks of you, and the words for it: make(people, person) → { kind, fields } | Promise of one | null
const ASKS = {
  fetch(P, v, c) {
    const thing = { guide: ['a spare paddle', 'the paddle'], crew: ['a new saw file', 'the saw file'], cook: ['two sacks of flour', 'the flour'], fishguide: ['a cooler of leeches', 'the leeches'], photographer: ['a roll of slide film', 'the film'] }[v.arch] || null;
    const f = fetchFields(P.tasks, { ...c, band: 'medium' }, { thing, ranges: [2, 22], sign: v.name, forWhom: 'me', lead: { guide: 'My party’s short a paddle.', crew: 'The saw’s gone dull.', cook: 'We’re out of flour, and Saturday’s pie day.', fishguide: 'I’m out of leeches and I’ve got a party at six.', photographer: 'My film came up on the wrong truck.' }[v.arch] });
    if (!f) return null;
    f.title = { guide: 'A paddle for the guide', crew: 'A file for the crew’s saw', cook: 'Flour for the café', fishguide: 'Leeches for the guide', photographer: 'The photographer’s film' }[v.arch] || f.title;
    return { kind: 'fetch', fields: f, ask: { guide: `My party’s short a paddle. ${f.toKeeper} at ${f.toPlace} has one for me. Could you fetch it?`, crew: `The crosscut saw’s gone dull. ${f.toKeeper} at ${f.toPlace} is holding a new file for us. Fetch it?`, cook: `We’re out of flour and Saturday’s pie day. ${f.toKeeper} at ${f.toPlace} has two sacks for me. Would you?`, fishguide: `I’m out of leeches and I’ve a party at six. ${f.toKeeper} at ${f.toPlace} has a cooler for me. Bring it?`, photographer: `My film came up on the wrong truck: ${f.toKeeper} at ${f.toPlace} has it. Would you bring it down?` }[v.arch] || `${f.toKeeper} at ${f.toPlace} has ${f.thing} for me. Would you fetch it?` };
  },
  letterOutfitter(P, v, c) {
    const tg = fetchTarget(P.tasks, { ...c }, [3, 30]);
    const road = !!tg && tg.hops == null;
    if (!tg) return null;
    const to = P.tasks.landing(tg.e.ep), op = outfitterProfile(tg.e.ep, P.world), keeper = op && op.keeper ? op.keeper.name : 'the keeper';
    const km = +(tg.d / 1000).toFixed(1), old = v.arch === 'oldtimer';
    const thing = old ? `a letter for ${keeper}` : `the last of the mail for ${to.place}`, short = old ? 'the letter' : 'the mail';
    const way = tg.hops == null ? 'up the road' : tg.hops === 0 ? 'on this water' : `${word(tg.hops)} ${tg.hops === 1 ? 'portage' : 'portages'} over`;
    return { kind: 'npc', fields: { to: tg.e.ep, toName: to.name, toPlace: to.place, thing, short, km, road, base: old ? 12 : 10, title: old ? `A letter for ${keeper}` : `The mail for ${to.place}`, text: `${old ? `A letter for ${keeper}, an old friend, at ${to.name}` : `The mail sack for ${to.name}`} (${to.place}, ${way}). Hand it over at their counter.`, sign: v.name, left: old ? `${keeper} reads the letter twice and laughs out loud.` : `${keeper} takes the mail and signs for it.`, hint: { x: to.x, z: to.z, r: 600 }, gift: old ? 'lure:daredevle' : null },
      ask: old ? `I owe ${keeper} at ${to.place} a letter, ${way}. Forty years we’ve been writing. Would you take it?` : `I’ve one more sack for ${to.place}, ${way}, and the truck’s full. Could you run it over?` };
  },
  letterSite(P, v, c) { return siteErrand(P, v, c, 'ranger'); },
  deliverSite(P, v, c) { return siteErrand(P, v, c, 'kid'); },
  async lost(P, v, c) {
    const k = KINDS.item; if (!k || !k.make) return null;
    let f = null;
    for (const band of v.arch === 'birder' ? ['local', 'medium'] : ['medium', 'local', 'far']) { f = await k.make(P.tasks, { ...c, band, board: [] }); if (f) break; }
    if (!f) return siteErrand(P, v, c, 'lost');
    const what = { locket: 'Grandma’s locket', 'dry bag': 'the blue dry bag', paddle: 'the spare paddle' }[f.label] || `the ${f.label}`, rest = String(f.text || '').replace(/^[^.]*\.\s*/, '');
    const lead = { family: `Our youngest left ${what} at a campsite, and there were tears all the way back.`, trippers: `We left ${what} behind at our last site. Rookie move.`, birder: `I set ${what} down at a campsite and paddled off without it.` }[v.arch] || `We left ${what} behind.`;
    const whose = { family: `The ${v.last}s’`, trippers: 'The trippers’', birder: 'The birder’s' }[v.arch] || 'A';
    return { kind: 'item', fields: { ...f, title: `${whose} ${f.label}`, text: `${lead} ${rest}`, sign: v.name, gift: v.arch === 'trippers' ? 'lure:silverminnow' : null },
      ask: `${lead} ${rest} Could you look for it?` };
  },
  async photo(P, v, c) {
    const k = KINDS.photo; // stream B's camera notices, when they are in the build
    if (k && typeof k.make === 'function') {
      try {
        const f = await k.make(P.tasks, { ...c, band: 'medium', board: [] });
        if (f) return { kind: 'photo', fields: { ...f, sign: v.name }, ask: `I’m short one picture for the magazine: ${String(f.title || 'a photo').toLowerCase()}. ${f.text || ''} Would you take it for me?` };
      } catch (e) { console.warn('people: the photo notice', e); }
    }
    return ASKS.fetch(P, v, c); // no camera in the build yet: the film from another outfitter
  },
};
async function siteErrand(P, v, c, who) {
  const H = new HintWriter(P, c.ep, c.rng), s = H.camp(1500) || H.camp(600); // an errand worth the paddle
  if (!s) return null;
  const km = +(Math.hypot(s.site.x - c.landing.x, s.site.z - c.landing.z) / 1000).toFixed(1);
  if (who === 'lost') {
    const [thing, short, lead] = { family: ['a stuffed moose', 'the moose', 'Our youngest left her stuffed moose at'], trippers: ['a fillet knife in a leather sheath', 'the knife', 'We left the fillet knife at'], birder: ['a pair of binoculars', 'the binoculars', 'I set my binoculars down at'] }[v.arch] || ['a mug', 'the mug', 'We left a mug at'];
    const whose = { family: `The ${v.last}s’`, trippers: 'The trippers’', birder: 'The birder’s' }[v.arch] || 'A';
    return { kind: 'npc', fields: { site: { x: s.site.x, z: s.site.z, lake: s.lake }, thing, short, km, base: 12, title: `${whose} ${short.replace(/^the /, '')}`, text: `${lead} ${s.name}${s.where}. Somewhere by the fire grate, we think.`, sign: v.name, left: `You find ${thing} on the rock by the fire grate.`, hint: H.P.tasks.hintFor(s.l.id, s.site), gift: v.arch === 'trippers' ? 'lure:silverminnow' : null },
      ask: `${lead} ${s.name}${s.where}. Could you look for ${v.arch === 'birder' ? 'them' : 'it'}, if you’re going that way?` };
  }
  if (who === 'kid') {
    return { kind: 'npc', fields: { site: { x: s.site.x, z: s.site.z, lake: s.lake }, thing: 'a bucket of leeches', short: 'the leeches', km, base: 6, title: 'Leeches for Grandpa', text: `Grandpa’s camped at ${s.name}${s.where}, and he forgot his leeches. He’s the one with the pipe.`, sign: v.name, left: `Grandpa takes the bucket, puffs his pipe and says to thank ${v.name}.`, hint: H.P.tasks.hintFor(s.l.id, s.site), gift: 'leeches' },
      ask: `Grandpa’s camped at ${s.name}${s.where}, and he forgot his leeches! Can you take him the bucket? Please?` };
  }
  return { kind: 'npc', fields: { site: { x: s.site.x, z: s.site.z, lake: s.lake }, thing: 'the ranger’s note', short: 'the note', km, base: 10, title: `A note for ${s.lake}`, text: `A bear has been at the packs at ${s.name}${s.where}. Tack the ranger’s note up at the latrine for whoever camps there next.`, sign: v.name, left: 'You tack the ranger’s note up by the latrine: “Bear in the area. Hang your food.”', hint: H.P.tasks.hintFor(s.l.id, s.site) },
    ask: `A bear’s been into the packs at ${s.name}${s.where}. I can’t get there this week. Would you tack a note up at the latrine?` };
}

// --- the people --------------------------------------------------------------------------------------------------------
const blankState = () => ({ v: 1, talked: {}, tasks: {}, paid: {}, gifts: {}, names: {}, told: [], chat: {}, asked: {} });
export class People {
  constructor({ world, scene, player, day, hud, tasks, outfitter = null, profile = null, weather = null, registry = null, mat }) {
    this.world = world; this.scene = scene; this.player = player; this.day = day; this.hud = hud; this.tasks = tasks; this.outfitter = outfitter; this.profile = profile; this.weather = weather; this.registry = registry;
    this.bodies = [];
    for (let i = 0; i < POOL; i++) this.bodies.push(new Body(mat, scene, i));
    this.rosters = new Map();   // ep -> the people settled there while you are near
    this.focus = null;          // { person, key: 'E' | 'Q', fig } the one you face
    this.qFocus = null;         // at the counter: the keeper, Q's (whoever else has E)
    this.claimsE = false;       // outfitter.js: a visitor takes E from the hotspot you also stand at
    this.onParty = null;        // later: (party) when a visitor's party puts in
    this.preparing = new Map(); // person key -> the promise writing up their task
    this.checkT = 0;
    this.quiet = null;          // () => true while something else owns the keys (the camera raised: stream B)
    this.dialogue = null;       // stream F: dialogue.js, set by main.js (barks by the speaker's head, the conversations)
    this.clock = 0;             // seconds of play, for the remarks' spacing
    this.roomEp = null; this.roomT = 0; // the store you are in, and how long you have been inside it
    this.s = this.load();
    if (profile && profile.onChange) profile.onChange((what) => { if (what === 'season') this.reset(); });
    // the visitors' words on the map, with the keepers' (hud.js reads outfitter.toldHints)
    if (outfitter && typeof outfitter.toldHints === 'function' && !outfitter.toldHints.people) {
      const base = outfitter.toldHints.bind(outfitter);
      const both = () => [...base(), ...this.toldHints()];
      both.people = true;
      outfitter.toldHints = both;
    }
  }

  // --- saved state: who you have talked to, the tasks they gave, the words on the map --------------------------------
  load() {
    const s = save.read(NS);
    return s && s.v === 1 ? { v: 1, talked: s.talked || {}, tasks: s.tasks || {}, paid: s.paid || {}, gifts: s.gifts || {}, names: s.names || {}, told: Array.isArray(s.told) ? s.told : [], chat: s.chat || {}, asked: s.asked || {} } : blankState();
  }
  write() { save.write(NS, this.s); }
  reset() { this.s = blankState(); this.rosters.clear(); this.preparing.clear(); this.write(); }

  get today() { const d = this.day; return absDay(d.year, d.doy); }
  get week() { return Math.floor(this.today / 7); }
  landingOf(ep) { const o = this.outfitter, l = o && o.landings ? o.landings.find((x) => x.ep === Number(ep)) : null; return l || (this.tasks ? this.tasks.landing(Number(ep)) : null); }

  // --- who is at a store -------------------------------------------------------------------------------------------
  // The keeper, and this week's visitors in their months and hours, with where each stands or sits (in world metres)
  roster(ep, L = storeLayout(ep)) {
    if (!L) return [];
    const op = outfitterProfile(ep, this.world), out = [];
    out.push(this.keeperOf(ep, L, op));
    for (const v of this.visitorsOf(ep, L, op)) out.push(v);
    return out;
  }
  keeperOf(ep, L, op) {
    const k = op && op.keeper, name = k ? k.name : 'The keeper', first = k ? k.first : 'the keeper';
    const rng = seeded(ep, 0x4ee9);
    const manner = k ? k.manner : 'warm';
    const look = (k && k.look) || dress(rng, { female: FEMALE.has(first), age: manner === 'old hand' ? 'old' : manner === 'keen' ? 'young' : 'adult', hatChance: manner === 'gruff' || manner === 'old hand' ? 0.6 : 0.2,
      pfd: pickR(rng, [0x6a5a44, 0x3a3a3a, 0x8a7a5a, 0x2f4436, 0x5a3a2a]) });
    look.wear.scale = Math.min(look.wear.scale, 1.0);
    const kp = L.keeper;
    return { key: `keeper:${ep}`, ep, keeper: true, name, first, arch: 'keeper', who: 'behind the counter', figs: [{ x: kp.x, z: kp.z, y: L.floorY, heading: kp.heading, look, spec: { pose: 'counter', counter: 0.36, top: 0.95, lean: 0.1 } }] };
  }
  visitorsOf(ep, L, op) {
    const d = this.day, { month } = monthDay(d.year, d.doy), m = month + 1, h = d.hours, week = this.week;
    const kind = op ? op.kind : 'lodge', f = placeFacts(ep, this.world) || {};
    const rng = seeded(ep, week, 0x51717);
    const r = rng(), n = r < 0.22 ? 0 : r < 0.66 ? 1 : 2;
    if (!n) return [];
    const pool = ARCHETYPES.filter((a) => { const A = ARCH[a]; return m >= A.months[0] && m <= A.months[1] && (A.at[kind] || 0) > 0.2; });
    const out = [], usedSpots = new Set();
    let figures = 0;
    for (let k = 0; k < 6 && pool.length && figures < n; k++) {
      const tot = pool.reduce((s, a) => s + ARCH[a].at[kind], 0);
      let x = rng() * tot, j = 0;
      for (; j < pool.length - 1; j++) { x -= ARCH[pool[j]].at[kind]; if (x <= 0) break; }
      const arch = pool.splice(j, 1)[0], A = ARCH[arch], pair = !!A.pair;
      if (pair && figures > 0) continue;
      // in their hours of the day only (settled as you come near, so nobody walks out in front of you)
      if (h < A.hours[0] || h >= A.hours[1]) continue;
      const vr = seeded(ep, week, arch.length * 977 + arch.charCodeAt(0));
      const v = this.makeVisitor(ep, L, arch, vr, f, usedSpots);
      if (!v) continue;
      out.push(v);
      figures += v.figs.length;
      if (pair) break;
    }
    return out;
  }
  makeVisitor(ep, L, arch, rng, f, used) {
    const A = ARCH[arch], porch = !!(L.look && L.look.porch);
    const female = A.female ? true : arch === 'kid' ? rng() < 0.5 : rng() < 0.45;
    const list = arch === 'cook' ? COOKS : arch === 'kid' ? KID_NAMES : A.age === 'old' ? OLD_NAMES : female ? F_NAMES : M_NAMES;
    let name = arch === 'cook' && ep === 30 ? 'Deb' : pickR(rng, list); // Deb in Ruth's café (the fish notices are hers)
    for (let k = 0; k < 6 && used.has(`name:${name}`); k++) name = pickR(rng, list);
    used.add(`name:${name}`);
    const last = pickR(rng, SURNAMES), city = pickR(rng, CITIES);
    const district = ep <= 20 ? 'LaCroix' : ep <= 33 ? 'Kawishiwi' : ep >= 40 && ep <= 70 ? 'Gunflint' : 'Tofte';
    const vars = { town: f.town || 'Ely', city, last, road: f.road || 'the road', district };
    // the spot (or pair of spots): the first free one they like, a porch one only where there is a porch
    const sp = (s) => (SPOTS[s].porch && !porch ? PORCH_FALLBACK[s] : s);
    let spots = null;
    for (const o of A.spots) {
      const want = Array.isArray(o) ? o.map(sp) : [sp(o)];
      if (want.every((s) => s && !used.has(s)) && new Set(want).size === want.length) { spots = want; break; }
    }
    if (!spots) return null;
    for (const s of spots) used.add(s);
    const wear = A.wear || {}, pfd = Array.isArray(wear.pfd) ? pickR(rng, wear.pfd) : wear.pfd;
    const figs = spots.map((s, i) => {
      const kidFig = (A.pair === 'kid' && i === 1) || arch === 'kid';
      const fem = i === 0 ? female : A.pair === 'adult' ? rng() < 0.5 : rng() < 0.5;
      const look = dress(rng, { ...wear, pfd: kidFig && arch !== 'kid' ? pickR(rng, [0xe07a2a, 0xd8b02a]) : i === 1 && Array.isArray(wear.pfd) ? pickR(rng, wear.pfd) : pfd, female: fem, age: kidFig ? 'kid' : A.age || 'adult', hatChance: kidFig ? 0.15 : wear.hatChance ?? 0.5 });
      return this.placeAt(L, SPOTS[s], look);
    });
    const second = A.pair === 'adult' ? pickR(rng, rng() < 0.5 ? F_NAMES : M_NAMES) : null;
    const full = arch === 'family' ? `${name} ${last}` : second && second !== name ? `${name} and ${second}` : name;
    const v = { key: `${ep}:${this.week}:${arch}`, ep, arch, name: full, first: name, last, city, vars, figs };
    // each figure's own name, for the line over their head (the family's child: a name of their own, drawn apart so
    // the visitor's own draws are as they were)
    const other = seeded(ep, this.week, 0x6b1d);
    v.figNames = figs.length < 2 ? [name] : [name, A.pair === 'adult' ? (second && second !== name ? second : pickR(other, M_NAMES.filter((n) => n !== name))) : pickR(other, KID_NAMES.filter((n) => n !== name))];
    v.who = A.who(vars);
    v.hasTask = !!A.task && rng() < A.odds;
    if (A.party) v.party = this.partyFor(v, rng); // the hook for later: a party on the water
    return v;
  }
  placeAt(L, S, look) {
    const X = L.axes.a, Z = L.axes.b, c = L.centre;
    const x = c.x + X.x * S.a + Z.x * S.b, z = c.z + X.z * S.a + Z.z * S.b;
    const dx = X.x * S.face[0] + Z.x * S.face[1], dz = X.z * S.face[0] + Z.z * S.face[1];
    const heading = Math.atan2(-dz, dx);
    return { x, z, y: L.floorY + (S.y || 0), heading, look, spec: S.pose === 'sit' ? { pose: 'sit', seat: S.seat } : { pose: 'stand', lean: 0.02 } };
  }
  // a party's trip: a real chain of lakes out from the landing, the day they put in and the nights out (not run yet)
  partyFor(v, rng) {
    const H = new HintWriter(this, v.ep, rng), r = H.route();
    if (!r) return null;
    return { route: r.names, lakes: r.lakes, leaves: this.today + 1, nights: 2 + Math.floor(rng() * 4), join: JOIN_US };
  }
  // the visitors with a trip ahead, at every store settled near you (the hook for the parties on the water)
  parties() {
    const out = [];
    for (const list of this.rosters.values()) for (const v of list) if (v.party && v.party.leaves >= this.today) out.push({ key: v.key, ep: v.ep, who: v.name, ...v.party });
    return out;
  }
  // everyone at ep's store as now settled (the console and the tests)
  at(ep) { return this.rosters.get(Number(ep)) || this.roster(Number(ep)); }

  // --- per frame ---------------------------------------------------------------------------------------------------
  update(dt) {
    const p = this.player;
    // the stores near you: settle who is there as you come near, and let them go once you are well away
    const near = [];
    for (const L of storeLayouts()) {
      const d = Math.hypot(L.centre.x - p.x, L.centre.z - p.z);
      if (d < NEAR_STORE) { if (!this.rosters.has(L.ep)) this.rosters.set(L.ep, this.roster(L.ep, L)); near.push(L.ep); }
      else if (d > NEAR_STORE + 20 && this.rosters.has(L.ep)) this.rosters.delete(L.ep);
    }
    for (const ep of [...this.rosters.keys()]) if (!storeLayout(ep)) this.rosters.delete(ep); // its tile let it go
    // the figures to draw: a store's people all together once you are within DRAW_R of its walls (so nobody comes into
    // being as you walk in, or as a tie-up puts you at the door), kept to DRAW_OUT; the nearest first
    const want = [];
    for (const ep of near) {
      const L = storeLayout(ep), ds = L ? Math.max(0, Math.hypot(L.centre.x - p.x, L.centre.z - p.z) - STORE_R) : Infinity;
      for (const v of this.rosters.get(ep) || []) v.figs.forEach((f, i) => {
        const drawn = this.bodies.some((b) => b.who && b.who.person === v && b.who.fig === i);
        if (ds < DRAW_R || (drawn && ds < DRAW_OUT)) want.push({ person: v, fig: i, f, d: Math.hypot(f.x - p.x, f.z - p.z) - (v.keeper ? 5 : 0) });
      });
    }
    want.sort((a, b) => a.d - b.d);
    const keep = want.slice(0, POOL);
    for (const b of this.bodies) if (b.who && !keep.some((w) => w.person === b.who.person && w.fig === b.who.fig)) { b.who = null; b.group.visible = false; }
    for (const w of keep) {
      if (this.bodies.some((b) => b.who && b.who.person === w.person && b.who.fig === w.fig)) continue;
      const b = this.bodies.find((x) => !x.who); if (!b) break;
      b.who = { person: w.person, fig: w.fig };
      b.wear(w.f.look);
      b.s.yaw = 0; b.s.pitch = 0; b.s.turn = 0;
      b.group.visible = true;
    }
    // pose them, each looking at you when you are near
    const eye = V(p.x, (p.foot ? p.foot.y : p.altitude || 0) + 1.62, p.z), inStore = !!(this.outfitter && this.outfitter.visit && this.outfitter.visit.inside);
    for (const b of this.bodies) {
      if (!b.who) continue;
      const v = b.who.person, f = v.figs[b.who.fig];
      this.look(b, v, f, eye, dt, inStore);
      b.group.position.set(f.x, f.y, f.z);
      b.group.rotation.set(0, f.heading + b.s.turn, 0);
      posePerson(b, f.spec, dt, f.look.wear.scale || 1);
    }
    if (p.onFoot) this.holdOff();
    this.prompt();
    this.murmur(dt);
    if ((this.checkT += dt) > 0.5) { this.checkT = 0; this.checkTasks(); }
  }
  // the head (and a little of the chest) toward you within reach, else an idle glance now and then; a standing visitor
  // turns round to you when you stand by them a while
  look(b, v, f, eye, dt, inStore) {
    const s = b.s, sc = f.look.wear.scale || 1, h = f.heading + s.turn;
    const dx = eye.x - f.x, dz = eye.z - f.z, d = Math.hypot(dx, dz);
    const lx = (dx * Math.cos(h) - dz * Math.sin(h)), lz = (dx * Math.sin(h) + dz * Math.cos(h));
    const reach = v.keeper ? (inStore ? KEEPER_LOOK_R : LOOK_R) : LOOK_R;
    let ty = 0, tp = 0, k = 3;
    const ang = Math.atan2(-lz, lx);
    if (d < reach && (Math.abs(ang) < 2.0 || v.keeper)) {
      const headY = f.y + (f.spec.pose === 'sit' ? f.spec.seat + 0.78 : 1.66) * sc;
      ty = clamp(ang, -1.25, 1.25); tp = clamp(Math.atan2(headY - eye.y, Math.max(0.3, d)), -0.45, 0.5); k = 5;
      s.look = Math.min(1, s.look + dt);
      // standing visitors turn their feet to you when you stay near and to one side
      if (!v.keeper && f.spec.pose === 'stand' && d < TALK_R + 1 && Math.abs(ang) > 0.85 && s.look >= 1) s.turn = wrapPi(s.turn + Math.sign(ang) * Math.min(Math.abs(ang) - 0.6, 1.1 * dt));
    } else {
      s.look = 0;
      if ((s.glanceT -= dt) <= 0) {
        const away = Math.abs(s.glanceYaw) > 0.01;
        s.glanceYaw = away ? 0 : (Math.random() * 2 - 1) * 0.7; s.glancePitch = away ? 0 : (Math.random() - 0.5) * 0.25;
        s.glanceT = away ? 3 + Math.random() * 5 : 1.2 + Math.random() * 2;
      }
      ty = s.glanceYaw; tp = s.glancePitch + (f.spec.pose === 'counter' ? 0.12 : 0);
      if (!v.keeper && Math.abs(s.turn) > 0.01 && d > TALK_R + 2) s.turn *= 1 - damp(0.6, dt); // back to what they were doing
    }
    s.yaw += (ty - s.yaw) * damp(k, dt); s.pitch += (tp - s.pitch) * damp(k, dt);
  }
  // the walker is held off the people as off a trunk
  holdOff() {
    const p = this.player;
    for (const b of this.bodies) {
      if (!b.who) continue;
      const f = b.who.person.figs[b.who.fig], sit = f.spec.pose === 'sit', fx = Math.cos(f.heading), fz = -Math.sin(f.heading);
      const cx = f.x + (sit ? fx * 0.25 : 0), cz = f.z + (sit ? fz * 0.25 : 0), keep = (sit ? SEAT_KEEP : BODY_KEEP) * (f.look.wear.scale || 1);
      if (b.who.person.keeper) continue; // behind the counter: the counter holds you off
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d < keep && d > 1e-4) { p.x = cx + (dx / d) * keep; p.z = cz + (dz / d) * keep; }
    }
  }

  // --- the prompt and the keys ----------------------------------------------------------------------------------------
  // whom you face within reach: a visitor takes E (from a hotspot too, when you face them more squarely than it); the
  // keeper at the counter is Q, the counter keeping E
  prompt() {
    const p = this.player, o = this.outfitter;
    this.focus = null; this.qFocus = null; this.claimsE = false;
    const free = p.onFoot && !p.teleporting && !p.input.paused && !(this.hud && (this.hud.paper || this.hud.big)) && !(o && (o.open || o.bunking)) && !(p.fishing && p.fishing.rodUp);
    if (!free || (this.quiet && this.quiet())) return;
    const fw = p.forward;
    let best = null, keeper = null;
    for (const b of this.bodies) {
      if (!b.who) continue;
      const v = b.who.person, f = v.figs[b.who.fig];
      const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz), reach = v.keeper ? TALK_R + 0.6 : TALK_R;
      if (d > reach) continue;
      const dot = d > 1e-3 ? (dx * fw.x + dz * fw.z) / d : 1;
      if (dot < TALK_FACE && d > 0.9) continue;
      const score = dot - d * 0.15, c = { person: v, fig: b.who.fig, d, dot, score };
      if (v.keeper) { if (!keeper || score > keeper.score) keeper = c; } else if (!best || score > best.score) best = c;
    }
    if (!best && !keeper) return;
    const s = this.hotSpot();
    // E: a visitor you face (more squarely than the hotspot you also stand at), else the keeper away from any hotspot;
    // at the counter Q is a word with the keeper, whoever else stands by
    let e = null;
    if (best) {
      const at = s && s.p.at, ax = s ? (at ? at.x : s.p.x) - p.x : 0, az = s ? (at ? at.z : s.p.z) - p.z : 0, al = Math.hypot(ax, az) || 1;
      if (!s || !((ax * fw.x + az * fw.z) / al > best.dot + 0.05 && best.d > 1.0)) e = { ...best, key: 'E' };
    }
    if (!e && keeper && !s) e = { ...keeper, key: 'E' };
    const q = keeper && s && s.key === 'counter' ? { ...keeper, key: 'Q' } : null;
    if (!e && !q) return;
    // (fb4 join) the dot on the counter has the keeper's Q on its own label (outfitter.js asks keeperWord): no line here
    if (!e && q && o && o.pointer) { this.focus = q; this.qFocus = q; return; }
    const qText = q ? ` &nbsp; <kbd>Q</kbd>A word with ${esc(q.person.first)}` : '';
    if (e) p.prompt = { key: 'E', text: `${e.person.keeper ? `A word with ${esc(e.person.name)} · ${esc(e.person.who)}` : this.promptText(e.person)}${qText}` };
    else p.prompt = { key: 'E', text: `${p.prompt && p.prompt.text ? p.prompt.text : 'The counter'}${qText}` };
    this.focus = e || q; this.qFocus = q;
    this.claimsE = !!e;
    if (e && p.input.pressed('KeyE')) this.talkTo(e.person);
    else if (q && p.input.pressed('KeyQ')) this.talkTo(q.person);
  }
  // the store's hotspot you look at, in outfitter.spot()'s shape ({ key, p: { x, z, at } }). fb4 join (stream D's find:
  // Q at the counter never opened a word with the keeper while the dot existed): with the pointer, spot() is null and
  // the hotspot is the one the dot is on
  hotSpot() {
    const o = this.outfitter, ptr = o && o.pointer, p = this.player;
    if (!ptr) return o && typeof o.spot === 'function' ? o.spot() : null;
    const t = ptr.target, hot = o.visit && o.visit.inside && o.visit.L && Array.isArray(o.visit.L.hot) ? o.visit.L.hot : null;
    const h = t && hot ? hot.find((q) => q.key === t.ref) : null;
    return h ? { key: h.key, p: { x: p.x, z: p.z, at: { x: h.x, z: h.z } } } : null;
  }
  // the counter's Q on the dot's label (outfitter.js targetOf): a word with the keeper drawn at store ep, or null
  keeperWord(ep) {
    const b = this.bodies.find((x) => x.who && x.who.person.keeper && x.who.person.ep === Number(ep));
    if (!b) return null;
    const v = b.who.person;
    return { verb: `A word with ${v.first}`, run: () => this.talkTo(v) };
  }
  promptText(v) {
    const n = this.s.talked[v.key] || 0, t = this.taskOf(v);
    const first = esc(v.first);
    if (!n) return `Talk to ${esc(v.name)} · ${esc(v.who)}`;
    if (t && t.status === 'done') return t.kind === 'item' ? `Give ${first} the ${esc(t.label)}` : t.kind === 'photo' ? `Show ${first} the photo` : t.kind === 'fetch' ? `Give ${first} ${esc(t.short || 'it')}` : `Tell ${first} it’s delivered`;
    if (v.hasTask && !t && !this.s.paid[v.key] && n === 1) return `${first} · “I could use a hand”`;
    return `Talk to ${first}`;
  }

  // --- talking ----------------------------------------------------------------------------------------------------------
  say(v, words, secs = 8, first = false) { if (this.hud && words) this.hud.note(`${first ? v.name : v.first}${v.keeper || !first ? '' : `, ${v.who}`}: “${words}”`, secs); }
  // E (or Q at the counter): a conversation (dialogue.js), else (no dialogue in the build) their line as a note
  talkTo(key) {
    const v = typeof key === 'string' ? this.find(key) : key;
    if (!v) return null;
    if (this.dialogue) return v.keeper ? this.keeperConverse(v) : this.converse(v);
    return v.keeper ? this.keeperTalk(v) : this.visitorTalk(v);
  }
  find(key) { for (const list of this.rosters.values()) for (const v of list) if (v.key === key) return v; return null; }

  // --- what dialogue.js needs: speakers, barks --------------------------------------------------------------------
  // The speaker of a person's figure: their name and role, and their head (the bone when drawn, else the spot they stand
  // or sit at) while they are settled here; null once they are let go
  speakerOf(v, fig = 0) {
    const list = v._sp || (v._sp = []);
    if (list[fig]) return list[fig];
    const self = this, names = v.figNames || [v.first];
    return (list[fig] = {
      key: `${v.key}#${fig}`, person: v.key, name: v.keeper ? v.first : names[fig] || v.first, role: roleOf(v, fig),
      pos(out) {
        const f = v.figs[fig], roster = self.rosters.get(v.ep);
        if (!f || !roster || !roster.includes(v)) return null;
        const sc = f.look.wear.scale || 1, b = self.bodies.find((x) => x.who && x.who.person === v && x.who.fig === fig);
        if (b) { b.fig.bones.head.getWorldPosition(out); out.y += 0.16 * sc; return out; }
        return out.set(f.x, f.y + (f.spec.pose === 'sit' ? f.spec.seat + 0.78 : 1.66) * sc, f.z);
      },
    });
  }
  // a line by a figure's head, queued in their store's room (or a note, without dialogue.js)
  bark(v, fig, text, pri = PRI.ambient, next = null) {
    if (!text) return null;
    if (this.dialogue) return this.dialogue.bark(this.speakerOf(v, fig), text, { room: v.ep, pri, next });
    if (this.hud) this.hud.note(`${(v.figNames && v.figNames[fig]) || v.first}: “${text}”`, 6);
    return null;
  }
  // the keeper's hello as you come in and goodbye as you go (outfitter.js): a bark by their head; false when there is
  // no dialogue or no keeper here (the caller writes the note itself)
  keeperSays(ep, words, moment = 'hello') {
    if (!this.dialogue || !words) return false;
    ep = Number(ep);
    let list = this.rosters.get(ep);
    if (!list) { const L = storeLayout(ep); if (!L) return false; list = this.roster(ep, L); this.rosters.set(ep, list); }
    const k = list.find((v) => v.keeper); if (!k) return false;
    this.dialogue.bark(this.speakerOf(k, 0), words, { room: ep, pri: moment === 'goodbye' ? PRI.reply : PRI.greet });
    return true;
  }
  // Passing remarks: a visitor as you come within REMARK_R, or anyone within ROOM_R a moment after you come into their
  // room (each once, then not for REMARK_GAP s, and then only now and then); a pair between themselves once you have
  // been in the room a while; the keeper over the counter once a visit while you browse. Who is pressing (a hook, a
  // thing you bring them) goes first; the queue in dialogue.js keeps it to one at a time in the room.
  murmur(dt) {
    const D = this.dialogue, p = this.player, o = this.outfitter, vis = o && o.visit;
    this.clock += dt;
    if (vis) { if (this.roomEp !== vis.ep) { this.roomEp = vis.ep; this.roomT = 0; } if (vis.inside) this.roomT += dt; } else { this.roomEp = null; this.roomT = 0; }
    if (!D || D.talking || !p.onFoot || p.teleporting || (this.quiet && this.quiet()) || (o && (o.open || o.bunking)) || (this.hud && this.hud.paper)) return;
    const inside = !!(vis && vis.inside);
    for (const b of this.bodies) {
      if (!b.who) continue;
      const v = b.who.person, fi = b.who.fig, f = v.figs[fi];
      const m = v._m || (v._m = { near: false, last: -1e9, n: 0, pair: false, idle: false });
      const d = Math.hypot(f.x - p.x, f.z - p.z), here = inside && this.roomEp === v.ep;
      if (v.keeper) {
        if (here && !m.idle && this.roomT > KEEPER_IDLE_AFTER && this.clock - (m.spoke || -1e9) > 30) {
          m.idle = true;
          const op = outfitterProfile(v.ep, this.world), pool = KEEPER_IDLE[(op && op.keeper && op.keeper.manner) || 'warm'] || KEEPER_IDLE.warm;
          this.bark(v, 0, pickR(Math.random, pool), PRI.ambient);
        }
        continue;
      }
      if (fi !== 0) continue; // a pair's remarks are the first figure's; the second answers in their talk
      const near = d < REMARK_R || (here && this.roomT > ROOM_SETTLE && d < ROOM_R);
      if (near && !m.near && this.clock - m.last > REMARK_GAP && (m.n === 0 || Math.random() < 0.6)) {
        const w = this.remarkFor(v);
        if (w) { this.bark(v, 0, w.text, w.pri); m.last = this.clock; m.n++; }
      }
      m.near = near;
      const talk = PAIRS[v.arch];
      if (talk && v.figs.length > 1 && !m.pair && here && this.roomT > PAIR_AFTER && d < 9.5) {
        m.pair = true;
        const [a, c] = pickR(Math.random, talk);
        this.bark(v, a[0], a[1], PRI.ambient, { sp: this.speakerOf(v, c[0]), text: c[1], room: v.ep, pri: PRI.ambient + 0.4 });
      }
    }
  }
  // what a visitor says as you pass: what you bring them, what they need, thanks, else their own remarks and the hour's
  remarkFor(v) {
    const t = this.taskOf(v);
    if (t && t.status === 'done') return { text: doneRemark(t), pri: PRI.hook };
    if (this.s.paid[v.key]) return Math.random() < 0.5 ? { text: 'Thanks again for that.', pri: PRI.ambient } : null;
    if (t) return { text: statusWords(t), pri: PRI.ambient };
    if (v.hasTask && HOOK[v.arch]) return { text: HOOK[v.arch], pri: PRI.hook };
    const pool = [...(REMARKS[v.arch] || ['Hello.'])], h = this.day.hours, wet = this.weather && this.weather.wetness > 0.35;
    if (wet) pool.push('Wet one out there.', 'Shake off by the stove, if you like.');
    if (h < 9) pool.push('Early start, eh?');
    if (h >= 19) pool.push('Getting on for supper.');
    return { text: pickR(Math.random, pool), pri: PRI.ambient };
  }

  // --- the conversations (dialogue.js) --------------------------------------------------------------------------------
  asked(v) { return this.s.asked[v.key] || (this.s.asked[v.key] = { area: 0, self: 0, news: 0, place: 0 }); }
  // a visitor's tree: the greeting, then the area, them, their task and goodbye
  converse(v) {
    const n = this.s.talked[v.key] || 0;
    this.s.talked[v.key] = n + 1;
    if (v.hasTask && !this.s.paid[v.key] && !this.s.tasks[v.key]) this.prepare(v); // written up while you talk
    this.write();
    const first = n === 0, t = this.taskOf(v);
    let say;
    if (first) say = `${opener(v.arch, this.day.hours)} ${(INTRO[v.arch] || (() => ''))(v)}`.trim();
    else if (t && t.status === 'done') say = doneRemark(t);
    else if (t) say = statusWords(t);
    else if (this.s.paid[v.key]) say = THANKS[v.arch] || 'Thank you again.';
    else say = pickR(Math.random, AGAIN[v.arch] || ['Hello again.', 'Back again?']);
    if (v._m) v._m.last = this.clock; // no remark straight after
    return this.dialogue.open({ speaker: this.speakerOf(v, 0), name: v.name, role: v.who, room: v.ep, start: () => ({ say, choices: this.vChoices(v) }), bye: () => BYE[v.arch] || 'Good paddling.' });
  }
  vChoices(v) {
    const a = this.asked(v), hints = this.hintList(v), lore = this.loreOf(v), t = this.taskOf(v), out = [];
    out.push({ text: a.area ? 'Anything else worth knowing?' : 'What’s good around here?', dim: a.area >= hints.length, go: () => this.vArea(v) });
    out.push({ text: a.self ? 'Go on.' : 'Tell me about yourself.', dim: a.self >= lore.length, go: () => this.vSelf(v) });
    if (t && t.status === 'done') out.push({ text: doneChoice(t), kind: 'task', go: () => this.vClaim(v, t) });
    else if (t) out.push({ text: aboutChoice(t), kind: 'task', go: () => ({ say: statusWords(t), choices: this.vChoices(v) }) });
    else if (v.hasTask && !this.s.paid[v.key]) out.push({ text: 'Need a hand with anything?', kind: 'task', go: () => this.vAsk(v) });
    out.push({ text: 'Goodbye.', kind: 'bye', go: () => null });
    return out;
  }
  // their hints, in turn (each told on the map where it means some water), then that they have told you all they know
  hintList(v) {
    const A = ARCH[v.arch]; if (!A) return [];
    if (v._hints) return v._hints;
    const H = new HintWriter(this, v.ep, seeded(v.ep, this.week, v.arch.length, 0x4a17)), out = [];
    for (const k of A.hints) { const fn = HINTS[k]; if (!fn) continue; try { const h = fn(H, v, 0, this); if (h && h.text && !out.some((x) => x.text === h.text)) out.push(h); } catch (e) { console.warn('people: a hint', k, e); } }
    return (v._hints = out);
  }
  vArea(v) {
    const a = this.asked(v), list = this.hintList(v);
    let say;
    if (a.area < list.length) { const h = list[a.area++]; if (h.ring) this.tell(v, h); say = h.text; this.write(); }
    else say = NO_MORE[v.arch] || 'That’s about all I know. The rest you find out on the water.';
    return { say, choices: this.vChoices(v) };
  }
  // about them: their lore lines, their route or their history where those are hints of theirs
  loreOf(v) {
    if (v._lore) return v._lore;
    const out = [];
    for (const l of LORE[v.arch] || []) {
      if (typeof l === 'function') { out.push(l(v)); continue; }
      if (l === 'route' || l === 'history') { try { const H = new HintWriter(this, v.ep, seeded(v.ep, this.week, 0x10e)), h = HINTS[l](H, v, 0, this); if (h && h.text) out.push(h.text); } catch { /* the place has none */ } continue; }
      out.push(l);
    }
    return (v._lore = out);
  }
  vSelf(v) {
    const a = this.asked(v), list = this.loreOf(v);
    let say;
    if (a.self < list.length) { say = list[a.self++]; this.write(); }
    else say = NO_SELF[v.arch] || 'Not much more to tell.';
    return { say, choices: this.vChoices(v) };
  }
  // their task: asked (written up when the talk began; a lost thing may take a moment), then taken on or not
  vAsk(v) {
    const job = this.prepare(v);
    const ready = () => {
      const r = job && job.result, k = r ? KINDS[r.kind] : null;
      if (!r || !k) { v.hasTask = false; return { say: NO_TASK[v.arch] || 'No, I’m all right. Thanks, though.', choices: this.vChoices(v) }; }
      let p = 0;
      try { p = k.pay({ kind: r.kind, from: v.ep, band: 'medium', ...r.fields }); } catch { p = 0; }
      return { say: `${r.ask}${p ? ` ${pay(p)}` : ''}`, choices: [
        { text: 'I’ll do it.', kind: 'task', go: () => { const w = this.offer(v); return { say: w === 'wait' ? 'Hang on, let me think where it was.' : w ? ACCEPT[v.arch] || 'Thank you.' : NO_TASK[v.arch] || 'No, I’m all right. Thanks, though.', choices: this.vChoices(v) }; } },
        { text: 'Not right now.', go: () => ({ say: LATER[v.arch] || 'No trouble. I’m here a while yet.', choices: this.vChoices(v) }) },
      ] };
    };
    if (!job) return ready();
    return 'result' in job ? ready() : job.then(ready, ready);
  }
  vClaim(v, t) {
    const words = this.claimWith(v, t);
    return { say: words, choices: this.vChoices(v) };
  }
  // the keeper's tree: the news, the place, the counter's services, goodbye
  keeperConverse(v) {
    const op = outfitterProfile(v.ep, this.world), pr = this.profile, d = this.day, manner = (op && op.keeper && op.keeper.manner) || 'warm';
    const n = this.s.talked[v.key] || 0, stamp = `${d.year}-${d.doy}`;
    this.s.talked[v.key] = n + 1;
    if (pr && this.s.chat[v.ep] !== stamp) { this.s.chat[v.ep] = stamp; pr.raise(v.ep, STANDING_CHAT); } // the first word of the day
    this.write();
    if (v._m) v._m.spoke = this.clock;
    const L = this.landingOf(v.ep), name = L && L.name ? L.name : null;
    return this.dialogue.open({ speaker: this.speakerOf(v, 0), name: v.name, role: name ? `the keeper · ${name}` : 'the keeper', room: v.ep,
      start: () => ({ say: KEEPER_ASK[manner] || 'What can I do for you?', choices: this.kChoices(v) }),
      bye: () => keeperLine(op, 'goodbye', { hours: d.hours, n: this.today * 5 + n }) });
  }
  kChoices(v) {
    const a = this.asked(v), place = this.placeOf(v);
    return [
      { text: a.news ? 'Anything else going on?' : 'What’s the news?', go: () => this.kNews(v) },
      { text: a.place ? 'What else should I know about the place?' : 'Tell me about this place.', dim: a.place >= place.length, go: () => this.kPlace(v) },
      { text: 'The counter, please: a ride, a bunk, what I’m owed.', kind: 'counter', go: () => ({ end: true, after: () => this.openCounter(v) }) },
      { text: 'Goodbye.', kind: 'bye', go: () => null },
    ];
  }
  kNews(v) {
    const op = outfitterProfile(v.ep, this.world), pr = this.profile, d = this.day, a = this.asked(v);
    const words = keeperLine(op, 'chat', { rep: pr ? pr.outfitter(v.ep).rep : 0, doy: d.doy, n: (a.news++) + this.today * 3, hours: d.hours });
    this.write();
    if (this.outfitter && typeof this.outfitter.heard === 'function') this.outfitter.heard(v.ep, words); // an insider hint goes on the map
    return { say: words, choices: this.kChoices(v) };
  }
  // the place in the keeper's words: what kind of place it is and where, who they are, the long carry, the deep water,
  // the sites
  placeOf(v) {
    if (v._place) return v._place;
    const op = outfitterProfile(v.ep, this.world); if (!op) return [];
    const f = op.facts || {}, manner = (op.keeper && op.keeper.manner) || 'warm', out = [];
    out.push(`We’re ${op.kindWords} on ${theWater(op.lake)}${op.area ? `, up ${op.area}` : ''}.${f.town ? ` ${f.town}’s ${f.townKm} km back down the road.` : ''}`);
    if (KEEPER_SELF[manner]) out.push(KEEPER_SELF[manner]);
    if (f.longest) out.push(`The long carry round here is ${f.longest}. It sorts people out.`);
    if (f.deep && f.deep.length) out.push(`Deep water near by: ${listWords(f.deep)}. That’s lake trout country.`);
    if (f.camps >= 10) out.push(`There are ${f.camps >= 100 ? 'over a hundred' : `${Math.floor(f.camps / 10) * 10}-odd`} campsites within a day of here. You’ll find one.`);
    return (v._place = out);
  }
  kPlace(v) {
    const a = this.asked(v), list = this.placeOf(v);
    let say;
    if (a.place < list.length) { say = list[a.place++]; this.write(); }
    else say = 'That’s the place. The rest is on the map.';
    return { say, choices: this.kChoices(v) };
  }
  // the keeper's services: the counter opens (its counter tab: the bunk, the rides, the notices to claim)
  openCounter(v) {
    const o = this.outfitter; if (!o || typeof o.show !== 'function') return;
    const l = typeof o.landing === 'function' ? o.landing(v.ep) : null;
    if (l) o.show(l, 'counter');
  }
  // the keeper's word across the counter: their talk, the season's, an insider hint to a friend of the house
  keeperTalk(v) {
    const op = outfitterProfile(v.ep, this.world), pr = this.profile, d = this.day;
    const n = (this.s.talked[v.key] || 0);
    const words = keeperLine(op, 'chat', { rep: pr ? pr.outfitter(v.ep).rep : 0, doy: d.doy, n: n + this.today * 3, hours: d.hours });
    this.s.talked[v.key] = n + 1;
    const stamp = `${d.year}-${d.doy}`;
    if (pr && this.s.chat[v.ep] !== stamp) { this.s.chat[v.ep] = stamp; pr.raise(v.ep, STANDING_CHAT); }
    if (this.outfitter && typeof this.outfitter.heard === 'function') this.outfitter.heard(v.ep, words); // an insider hint goes on the map
    this.write();
    if (this.hud) this.hud.note(`${v.name}, behind the counter: “${words}”`, 8);
    return words;
  }
  // a visitor: the first word a hint; the second their task, taken on; then how it is going, the pay and the thanks
  visitorTalk(v) {
    const n = this.s.talked[v.key] || 0, t = this.taskOf(v);
    this.s.talked[v.key] = n + 1;
    let words;
    if (t && t.status === 'done') words = this.claimWith(v, t);
    else if (t) words = { fetch: `Any luck at ${t.toPlace}?`, npc: `Still got ${t.short || 'it'}? No rush.`, item: `Did you find the ${t.label}? It’s at the site, I’m sure of it.`, photo: 'Any luck with the picture?' }[t.kind] || 'No rush.';
    else if (n === 0) {
      const h = this.hint(v, 0);
      words = `${opener(v.arch, this.day.hours)} ${h ? h.text : ''}`.trim();
      if (v.hasTask && !this.s.paid[v.key]) this.prepare(v);
    } else if (v.hasTask && !this.s.paid[v.key] && !this.s.tasks[v.key]) {
      const r = this.offer(v);
      if (r === 'wait') words = 'Hang on, let me think where it was.';
      else if (r) words = r;
      else { const h = this.hint(v, n); words = h ? h.text : BYE[v.arch]; }
    } else if (this.s.paid[v.key]) words = n % 2 ? THANKS[v.arch] : (this.hint(v, n) || {}).text || BYE[v.arch];
    else { const h = this.hint(v, n); words = h ? h.text : BYE[v.arch] || 'Good paddling.'; }
    this.write();
    if (words) this.say(v, words, 9, n === 0);
    return words;
  }
  // their nth hint (the lines go round), told on the map where it means some water
  hint(v, n) {
    const A = ARCH[v.arch]; if (!A) return null;
    const rng = seeded(v.ep, this.week, v.arch.length, 0x4a17);
    const H = new HintWriter(this, v.ep, rng);
    const order = A.hints, out = [];
    for (const k of order) { const fn = HINTS[k]; if (!fn) continue; try { const h = fn(H, v, 0, this); if (h && h.text) out.push(h); } catch (e) { console.warn('people: a hint', k, e); } }
    if (!out.length || (n > 0 && out.length < 2 && n % 2)) return null;
    const h = out[n % out.length];
    if (h.ring) this.tell(v, h);
    return h;
  }
  tell(v, h) {
    const id = `${v.key}:${h.ring.kind}:${h.ring.lake}`;
    if (this.s.told.some((x) => x.id === id)) return;
    this.s.told.push({ id, ...h.ring, text: h.text, ep: v.ep, by: v.name });
    if (this.s.told.length > 40) this.s.told.splice(0, this.s.told.length - 40);
    this.write();
  }
  toldHints() { return this.s.told.filter((h) => Number.isFinite(h.x) && Number.isFinite(h.z)); }

  // --- their task ---------------------------------------------------------------------------------------------------
  taskOf(v) { const id = this.s.tasks[v.key]; const t = id != null && this.tasks ? this.tasks.ads.get(id) || null : null; return t && t.status !== 'offered' ? t : null; }
  ctxFor(v) {
    const T = this.tasks, landing = T.landing(v.ep);
    return { ep: v.ep, band: 'medium', rng: seeded(v.ep, this.week, 0xa5c), landing, reach: T.reach(landing.lake), board: [] };
  }
  // write up what they will ask (a lost thing reads its site's tile, so it may take a moment)
  prepare(v) {
    if (this.preparing.has(v.key) || !this.tasks) return this.preparing.get(v.key);
    const fn = ASKS[ARCH[v.arch].task]; if (!fn) return null;
    const job = Promise.resolve().then(() => fn(this, v, this.ctxFor(v))).then((r) => { job.result = r || null; return r; }, (e) => { console.warn('people: a task', e); job.result = null; return null; });
    this.preparing.set(v.key, job);
    return job;
  }
  // the second word: they ask, and it is taken on (on the counter's list and in the journal)
  offer(v) {
    const job = this.prepare(v);
    if (!job) { v.hasTask = false; return null; }
    if (!('result' in job)) return 'wait';
    const r = job.result;
    if (!r) { v.hasTask = false; return null; }
    const T = this.tasks, k = KINDS[r.kind];
    T.board(v.ep); // the board kept first, so this is not pinned on it as an old save's notice would be
    if (!k) { v.hasTask = false; return null; }
    const t = { id: T.nextId++, kind: r.kind, from: v.ep, fromName: T.landing(v.ep).name, band: 'medium', status: 'open', posted: T.today(), taken: T.today(), npc: v.key, npcName: v.name, ...r.fields };
    if (!t.sign) t.sign = v.name;
    t.pay = k.pay(t); t.clue = t.text;
    if (t.kind === 'fish' || t.kind === 'photo') t.cooler = t.cooler || [];
    T.ads.set(t.id, t);
    this.s.tasks[v.key] = t.id; this.s.names[v.key] = v.first;
    if (t.gift) this.s.gifts[v.key] = t.gift;
    this.preparing.delete(v.key);
    T.changed(); T.boardChanged();
    const gift = t.gift ? ` and ${giftWords(t.gift)}` : '';
    if (this.hud) setTimeout(() => this.hud.note(`Taken on: “${t.title}” · $${t.pay}${gift} · paid by ${v.first} or at ${t.fromName}`, 7), 50);
    return `${r.ask} ${pay(t.pay)}`;
  }
  // E with them when it is done: paid here, and their thanks
  claimWith(v, t) {
    const r = this.tasks.claim(t.id, v.ep);
    if (!r || !r.ok) return 'Not quite yet, I think.';
    this.paid(v, t);
    return THANKS[v.arch] || 'Thank you.';
  }
  paid(v, t) {
    if (this.s.paid[v.key]) return;
    this.s.paid[v.key] = this.today;
    delete this.s.tasks[v.key];
    const gift = (t && t.gift) || this.s.gifts[v.key];
    delete this.s.gifts[v.key];
    if (gift) this.give(gift, v.first);
    this.write();
  }
  give(id, first) {
    const pr = this.profile; if (!pr) return;
    if (id === 'leeches') {
      const shop = this.outfitter && this.outfitter.shop;
      if (shop && pr.has('leeches') && shop.leeches >= 12) return; // the bucket is full already
      if (shop && shop.s) { shop.s.leeches = 12; if (typeof shop.write === 'function') shop.write(); }
      pr.give('leeches');
      if (this.hud) this.hud.note(`${first} fills your bait bucket: a dozen leeches.`, 6);
      return;
    }
    if (pr.has(id)) return;
    pr.give(id);
    if (this.hud) this.hud.note(`${first} gives you ${giftWords(id)}. It’s in your tackle box.`, 6);
  }
  // a task of theirs paid at the counter, or let go there: settled here too
  checkTasks() {
    const T = this.tasks; if (!T) return;
    for (const [key, id] of Object.entries(this.s.tasks)) {
      { const t = T.ads.get(id); if (t && t.status !== 'offered') continue; }
      if ((T.claimed || []).some((c) => c.id === id)) this.paid({ key, first: this.s.names[key] || 'They' }, null); // paid at the counter
      else { delete this.s.tasks[key]; delete this.s.gifts[key]; this.write(); } // let go at the counter: they will ask again
    }
  }

  // --- the console and the tests ----------------------------------------------------------------------------------------
  stats() {
    return { drawn: this.bodies.filter((b) => b.group.visible).map((b) => `${b.who.person.name}${b.who.fig ? ' (2)' : ''}`), rosters: [...this.rosters.entries()].map(([ep, l]) => ({ ep, people: l.map((v) => `${v.name} · ${v.arch}`) })), focus: this.focus ? `${this.focus.person.name} [${this.focus.key}]` : null };
  }
}
const GIFTS = { 'lure:daredevle': 'his old red-and-white Daredevle', 'lure:silverminnow': 'a Johnson Silver Minnow', 'lure:lazyike': 'a Lazy Ike', leeches: 'a dozen leeches' };
const giftWords = (id) => GIFTS[id] || 'something for the tackle box';
const pay = (n) => (n >= 30 ? `There’s $${n} in it.` : n >= 15 ? `$${n} for your trouble.` : `I can give you $${n}.`);
