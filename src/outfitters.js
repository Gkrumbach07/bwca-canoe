// Every entry point's outfitter, each its own (hubs phase 2, stream C). Six are written by hand (Lake One 30, Moose
// Lake 25, Sawbill 38, Seagull 54, Saganaga 55, the Little Indian Sioux North 14); the other 49 are generated from
// the place, seeded by the entry point: the landing water (a river or a lake, its size, depth and clarity), the deep
// lakes within 12 km, the campsites within 10 km, the long carries near by, the other outfitters near by and how far
// it is down the road to town. From that comes:
//   - a kind: a lodge (big, busy water), a river post (a river landing), a trout camp (deep, cold lakes near by) or a
//     bait shop (small water, out of the way);
//   - prices ×0.9–1.25 by how far it is from town, and one signature item sold only here (`sig:<ep>`), from a family
//     the kind and the place suggest (a cedar yoke where the carries are long, a setting pole on a river, a copper
//     spoon by trout water…), with an outfitter's words for it and a small, felt effect in player.gear's terms;
//   - what the board leans to (tasks.js reads boardLean): a lodge café fish and photos, a river post surveys and lost
//     things, a trout camp fish (the far ones lake trout), a bait shop berries and firewood;
//   - a keeper: a fictional person with a name and a manner (warm, dry, gruff, an old hand, a keen summer hire, a
//     precise ex-ranger), lines for each moment at the counter, and insider hints read from the data: lake trout deep
//     in a named lake, walleye on a stained lake's drop-offs at dusk, pike in weedy bays, smallmouth on clear rocky
//     points, moose on a river at dawn, the carry that sorts people out. A hint's lake is the real one, and where it
//     says the fish are thick this year, fishing.js's own abundance for that lake and species says so too;
//   - the building's look (props.js, stream A): the stain, the roof and its kind, the trim, the door, a porch or not.
// The signs keep the real business names (outfitter.js outfitterName); the keepers are made up.
//
//   outfitterProfile(ep, world) → { ep, name, place, lake, area, kind, kindWords, post, keeper: { name, manner,
//     lines: { hello, goodbye, chat: [...] }, moments: { hello: [...], stranger: [...], …each moment }, hint(world,
//     profile, n) }, priceMul, signature,
//     boardWeights { fish, photo, lost, fetch, survey, berries, firewood, deadfall, litter, secchi, loons, report, canoe,
//     lunch }, look { stain, roof, roofKind, trim, door,
//     porch, stainName }, hints [{ kind, text, lake, x, z, r }], facts, hand }
//   keeperLine(profile, moment, ctx) → words; moments: hello stranger season passing morning after bunk ride goodbye chat
//   signatureItem(ep, world) → { id, name, kind, family, slot?, lure?, price, kg, words, effect }; SIGNATURES fills as
//     profiles are made (signatures(world) makes all 55)
//   boardLean(ep, world) → weights by tasks.js kind key (fish, item, survey, photo, fetch, berries, firewood; content A:
//     deadfall, litter, secchi, loons, report, canoe, lunch)
//   allProfiles(world), speakAtCounter(outfitter, world): the phase-1 counter's header in the keeper's voice, until the
//     shop's counter speaks for itself (outfitter.keeperVoice)
//
// Pure data: no three, no DOM outside speakAtCounter, cached per world. The world needs entryPoints, lakes, campsites,
// portages (and lakeName, or the lake records' names).
import { outfitterName } from './outfitter.js';
import { mulberry32, hash2 } from './rng.js';

const TROUT_WATER = 20;      // fishing.js bites lake trout only where the lake is sounded this deep (m)
const DEEP_REACH = 12000;    // m: deep lakes looked for
const CAMP_REACH = 10000;    // m: campsites counted
const HINT_REACH = 10000;    // m: lakes a hint may name
const HOPS = 4;              // portages out by water
// fishing.js SPECIES order: its abundance per lake and species is 0.75 + 0.5 × hash2(lake, index, 5), walleye ×0.35
// in water under 25 ha
const SPECIES_INDEX = { walleye: 0, smallmouth: 1, pike: 2, laketrout: 3, crappie: 4, perch: 5 };
export const abundanceOf = (lakeId, species, cells = 1e9) => (0.75 + 0.5 * hash2(lakeId, SPECIES_INDEX[species] ?? 0, 5)) * (species === 'walleye' && cells < 2500 ? 0.35 : 1);
const THICK = 1.2;           // an abundance this high (the top tenth) is "thick this year"

// the towns at the foot of the roads (x, z in the world's metres, from their latitude and longitude)
const TOWNS = [['Ely', -48571, 20793], ['Grand Marais', 65631, 37805], ['Tofte', 28234, 57375], ['Isabella', -10429, 52594], ['Crane Lake', -94833, -19570], ['Cook', -109881, 26464], ['Hovland', 92747, 27798]];
// the road each landing is reached by
const ROADS = [
  ['the Echo Trail', [4, 6, 7, 8, 9, 14, 16, 19, 20, 22, 77]],
  ['the Crane Lake road', [1, 12]],
  ['the Fernberg Road', [24, 25, 26, 27, 29, 30, 31]],
  ['Highway 1', [32, 33, 34, 35, 36, 37, 67, 75, 84]],
  ['the Sawbill Trail', [38, 39, 40, 41]],
  ['the Gunflint Trail', [43, 44, 45, 47, 48, 49, 50, 51, 52, 54, 55, 57, 58, 60, 61, 62, 64, 66, 80]], // fb E: Larch Creek is on the Gunflint
  ['the Arrowhead Trail', [68, 69, 70]],
];
export function roadOf(ep) { const r = ROADS.find(([, eps]) => eps.includes(Number(ep))); return r ? r[0] : 'the county road'; }

// --- small words ---------------------------------------------------------------------------------------------------
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const word = (n) => (n < WORDS.length ? WORDS[n] : String(n));
const km = (m) => { const k = m / 1000; return k < 10 ? k.toFixed(1) : String(Math.round(k)); };
const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const compass = (dx, dz) => COMPASS[Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) / 45) % 8];
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pickR = (rng, list) => (list && list.length ? list[Math.floor(rng() * list.length)] : null);
const round05 = (x) => Math.round(x * 20) / 20;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lakeNameOf = (world, l) => (l ? (world.lakeName ? world.lakeName(l.id) : l.displayName || l.name) || null : null);
// a place's name for the things named after it: "Little Indian Sioux River North" → "Little Indian Sioux", "Lizz and
// Swamp Lakes" → "Lizz Lake", "East Bearskin Lake" → "East Bearskin", but "Big Lake" and "Crab Lake" stay whole
function shortName(s) {
  let n = String(s || '').replace(/\s+and\s+\w+\s+Lakes$/i, ' Lake').replace(/\s+(North|South)$/i, '');
  const m = n.match(/^(.*\S)\s+(Lake|River|Creek)$/i);
  if (m && m[1].split(/\s+/).length >= 2) n = m[1];
  return n || String(s || '');
}

// --- reading the place ---------------------------------------------------------------------------------------------
const CACHE = new WeakMap();
function cacheOf(world) {
  let c = CACHE.get(world);
  if (!c) { c = { facts: new Map(), profiles: new Map(), graph: null }; CACHE.set(world, c); }
  return c;
}
const lakeRec = (world, id) => (id > 0 ? world.lakes[id - 1] || null : null);
// basins (connected water) joined by portages
function graphOf(world) {
  const c = cacheOf(world);
  if (c.graph) return c.graph;
  const adj = new Map(), basin = (id) => { const l = lakeRec(world, id); return l ? l.basin : -1; };
  for (const p of world.portages || []) {
    if (!p.launch || p.launch.length < 2) continue;
    const a = basin(p.launch[0].lake), b = basin(p.launch[1].lake);
    if (a < 0 || b < 0 || a === b) continue;
    if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b); adj.get(b).add(a);
  }
  return (c.graph = adj);
}
function reachFrom(world, basin, hops = HOPS) {
  const adj = graphOf(world), out = new Map([[basin, 0]]);
  let frontier = [basin];
  for (let h = 1; h <= hops && frontier.length; h++) {
    const next = [];
    for (const b of frontier) for (const n of adj.get(b) || []) if (!out.has(n)) { out.set(n, h); next.push(n); }
    frontier = next;
  }
  return out;
}
const epRec = (world, ep) => (typeof ep === 'object' && ep ? ep : world.entryPoints.find((e) => e.ep === Number(ep)) || null);

// what an outfitter knows of its own country
export function placeFacts(ep, world) {
  const e = epRec(world, ep); if (!e) return null;
  const c = cacheOf(world);
  if (c.facts.has(e.ep)) return c.facts.get(e.ep);
  const L = lakeRec(world, e.lake) || { id: 0, cells: 0, basin: -1, secchi: 2.6 };
  const reach = L.basin >= 0 ? reachFrom(world, L.basin) : new Map();
  const landingName = lakeNameOf(world, L) || e.name;
  const river = !!(L.river || L.creek) || /\b(River|Creek)\b/.test(e.name);
  // the named lakes about, with how they are reached
  const lakes = [];
  for (const l of world.lakes) {
    if (!l || !l.name || !(l.cells >= 200)) continue;
    const dx = l.cx - e.x, dz = l.cz - e.z;
    if (Math.abs(dx) > DEEP_REACH || Math.abs(dz) > DEEP_REACH) continue;
    const d = Math.hypot(dx, dz); if (d > DEEP_REACH) continue;
    lakes.push({ id: l.id, name: lakeNameOf(world, l), ha: Math.round(l.cells / 100), cells: l.cells, d, dir: compass(dx, dz), hops: reach.has(l.basin) ? reach.get(l.basin) : null,
      depth: l.maxDepth || 0, secchi: l.secchi || 2.6, tp: l.tp || 0, river: !!(l.river || l.creek), x: l.cx, z: l.cz, here: l.id === L.id || (l.basin === L.basin && l.name === L.name) });
  }
  const byWay = (a, b) => (a.hops ?? 9) * 3000 + a.d - ((b.hops ?? 9) * 3000 + b.d);
  const deep = lakes.filter((l) => l.depth >= TROUT_WATER).sort(byWay);
  let camps = 0;
  for (const s of world.campsites) if (Math.abs(s.x - e.x) < CAMP_REACH && Math.abs(s.z - e.z) < CAMP_REACH && Math.hypot(s.x - e.x, s.z - e.z) < CAMP_REACH) camps++;
  const carries = (world.portages || []).filter((p) => p.pts && p.pts.length && Math.hypot(p.pts[0][0] - e.x, p.pts[0][1] - e.z) < 8000).sort((a, b) => b.rods - a.rods);
  let near = null;
  for (const o of world.entryPoints) if (o.ep !== e.ep) { const d = Math.hypot(o.x - e.x, o.z - e.z); if (!near || d < near.d) near = { ep: o.ep, name: o.name, d }; }
  const neighbours = world.entryPoints.filter((o) => o.ep !== e.ep && Math.hypot(o.x - e.x, o.z - e.z) < 12000).length;
  let town = null;
  for (const [name, x, z] of TOWNS) { const d = Math.hypot(x - e.x, z - e.z); if (!town || d < town.d) town = { name, d }; }
  const clear = lakes.filter((l) => l.secchi >= 4.5 && l.ha >= 30).length;
  const f = {
    ep: e.ep, name: e.name, x: e.x, z: e.z, lakeId: L.id, landing: landingName, ha: Math.round((L.cells || 0) / 100), depth: L.maxDepth || 0,
    secchi: L.secchi || 2.6, tp: L.tp || 0, river, lakes, deep, camps, carries: carries.slice(0, 4).map((p) => ({ name: p.name, rods: p.rods })),
    longest: carries[0] ? { name: carries[0].name, rods: carries[0].rods, x: carries[0].pts[0][0], z: carries[0].pts[0][1] } : null,
    near, neighbours, town: town.name, townKm: Math.round(town.d / 1000), clear, road: roadOf(e.ep), reach,
  };
  c.facts.set(e.ep, f);
  return f;
}

// --- the kinds -------------------------------------------------------------------------------------------------------
export const KINDS = ['lodge', 'river post', 'trout camp', 'bait shop'];
const NEW_KINDS = new Set(['deadfall', 'litter', 'secchi', 'loons', 'report', 'canoe', 'lunch']); // content A's notices (task-kinds.js)
const KIND = {
  lodge: {
    words: (f) => (f.ha >= 1500 ? 'a lodge on big water' : 'a lodge'),
    board: { fish: 1.6, photo: 1.5, lost: 0.9, fetch: 1.0, survey: 0.6, berries: 0.8, firewood: 0.7, deadfall: 0.5, litter: 0.8, secchi: 0.8, loons: 1.3, report: 1.1, canoe: 0.9, lunch: 1.5 },
    chat: ['The café buys what you keep: walleye best, but the cook won’t turn up her nose at a perch.', '{lake} is big water. When the whitecaps come up, get off it and wait.', 'Cabins are full this week. You’d be amazed who can’t paddle.'],
  },
  'river post': {
    words: (f) => {
      const r = /\b(River|Creek)\b/.test(f.name) ? f.name.replace(/\s+(North|South)$/, '') : /\b(River|Creek)$/.test(f.landing) ? f.landing : null;
      return r && r !== f.landing ? `a river post on ${theWater(r)}` : 'a river post';
    },
    board: { fish: 0.8, photo: 0.9, lost: 1.5, fetch: 1.2, survey: 1.6, berries: 0.9, firewood: 0.9, deadfall: 1.5, litter: 1.0, secchi: 0.6, loons: 0.7, report: 1.4, canoe: 1.3, lunch: 0.6 },
    chat: ['A river isn’t a lake: read the current at the bends and keep off the rocks at the riffles.', 'River trips are portages with a bit of water in between.', 'The board here is mostly surveys and lost things. The river eats paddles.'],
  },
  'trout camp': {
    words: () => 'a trout camp by deep, cold water',
    board: { fish: 1.8, photo: 1.0, lost: 0.8, fetch: 0.8, survey: 0.9, berries: 0.7, firewood: 0.8, deadfall: 0.8, litter: 0.8, secchi: 1.5, loons: 1.0, report: 0.9, canoe: 0.8, lunch: 1.2 },
    chat: ['Lakers come up in the spring and go deep by July. Down there, a spoon on a long line, slow.', 'The deep lakes here stay cold all summer. That’s the trout’s whole secret.', 'Bring a laker back cold and the kitchen pays well for it.'],
  },
  'bait shop': {
    words: (f) => `a bait shop ${f.townKm >= 30 ? 'at the end of the road' : 'by the landing'}`,
    board: { fish: 1.1, photo: 0.7, lost: 0.9, fetch: 1.0, survey: 0.8, berries: 1.6, firewood: 1.6, deadfall: 0.9, litter: 1.4, secchi: 0.7, loons: 0.9, report: 0.8, canoe: 0.7, lunch: 1.0 },
    chat: ['Leeches, crawlers and the odd minnow. That’s the whole shop, near enough.', 'Berries in season: bring me a pint and I’ll pay for it.', 'Firewood’s picked over at the sites round here; an armful is worth something to me.'],
  },
};
// the kind a place makes
function kindOf(f) {
  const bigWater = f.ha >= 450, huge = f.ha >= 3000;
  const deepNear = f.deep.some((l) => l.d <= 6000 || (l.hops != null && l.hops <= 1));
  if (f.river) return 'river post';
  if (huge) return 'lodge';
  if (f.depth >= TROUT_WATER || ((deepNear || f.clear >= 5) && !bigWater)) return 'trout camp';
  if (bigWater) return 'lodge';
  return 'bait shop';
}

// --- the signature items ---------------------------------------------------------------------------------------------
// Each outfitter sells one thing no other counter has (`sig:<ep>`), from a family. The effect is in player.gear's
// terms (shop.js applyGear): multipliers for cruise, effort, stability, carry and snap; sleepAdd adds to the night's
// rest. Two of one family do not stack (the best counts).
const FAMILIES = {
  yoke: { kind: 'gear', price: 32, kg: 1.6, effect: { carry: 0.8 }, name: (s) => `${s} cedar yoke`,
    words: ['Carved from white cedar out back and shaped to sit on the shoulders. Carrying tires you less than the pads do.', 'A carved yoke, white cedar, with the hollows worn in by the last owner’s neck. The long carries go easier.'] },
  paddle: { kind: 'paddle', slot: 'paddle', price: 55, kg: 0.9, effect: { cruise: 1.02, effort: 0.9 }, name: (s, k) => `${k} ottertail paddle`,
    words: ['Cherry, carved over the winter, with a long ottertail blade: quiet in the water and kind to the shoulders, if not quick.', 'An ottertail, carved here: slow to start, easy all day. Your shoulders will notice before you do.'] },
  net: { kind: 'tackle', price: 22, kg: 0.8, effect: { snap: 1.12 }, name: (s) => `${s} landing net`,
    words: ['Bent ash and cotton mesh. A fish at the side of the canoe stays on more often than not.', 'Steam-bent ash, a deep bag. The ones that throw the hook at the gunwale mostly don’t, with this.'] },
  blanket: { kind: 'camp', price: 28, kg: 1.4, effect: { sleepAdd: 0.04 }, name: (s) => `${s} wool blanket`,
    words: ['Heavy wool, striped at the ends. Cold nights cost you less, and you wake a little better.', 'Wool, the old weight. Over the bag on a cold night and you sleep like a stone.'] },
  jacket: { kind: 'camp', price: 14, kg: 0.3, effect: { sleepAdd: 0.02 }, name: (s) => `${s} bug jacket`,
    words: ['Mesh hood and sleeves. You still hear them; you just stop caring. A better night in June.', 'Bug jacket, mesh to the waist. The blackflies give up and so do you, but in a good way: you sleep.'] },
  sail: { kind: 'gear', price: 45, kg: 1.8, effect: { cruise: 1.03 }, name: (s) => `${s} downwind sail`,
    words: ['Two spruce poles and a square of canvas. With the wind behind you on open water it’s free miles.', 'A square sail on two poles, for the big water. Run before the wind and let it do the work.'] },
  cover: { kind: 'gear', price: 60, kg: 1.5, effect: { stability: 1.15 }, name: (s) => `${s} spray cover`,
    words: ['Snaps on over the gunwales and keeps the chop out of your lap. The canoe sits steadier in a big sea.', 'Canvas deck, snapped down tight. When the big lake gets up, you stay upright and dry.'] },
  pole: { kind: 'gear', price: 20, kg: 2.2, effect: { stability: 1.08 }, name: (s) => `${s} setting pole`,
    words: ['Ash, iron-shod, twelve feet. Stand and push off the bottom where the water’s thin; you feel steadier in moving water.', 'A setting pole, the old way up a river. Brace on it in the current and the canoe settles.'] },
  spoon: { kind: 'lure', lure: 'spoon', price: 9, kg: 0.05, effect: { snap: 1.05 }, name: (s) => `${s} copper spoon`,
    words: ['Hammered in the shed, copper over brass. It flutters down slow and the lakers can’t leave it alone. Ties on like any spoon.', 'Hand-hammered copper, a wobble like a dying cisco. Let it sink deep; it holds a fish better than the store ones.'] },
  tump: { kind: 'gear', price: 18, kg: 0.4, effect: { carry: 0.9 }, name: (s) => `${s} tumpline`,
    words: ['A leather strap over the forehead, the voyageur way. The pack rides higher and the carries take less out of you.', 'Tanned moosehide, braided at the ends. Your neck takes the pack, your shoulders take a holiday.'] },
  leaders: { kind: 'tackle', price: 6, kg: 0.05, effect: { snap: 1.08 }, name: (s) => `${s} steel leaders`,
    words: ['A card of steel leaders, twisted here. The pike can’t bite through, so the line holds.', 'Wire leaders, a dozen on a card. Teeth don’t cut them; the big ones stay on.'] },
  kneelers: { kind: 'gear', price: 16, kg: 0.5, effect: { effort: 0.96 }, name: (s) => `${s} kneeling pads`,
    words: ['Sheepskin over felt, cut to fit the bottom of a canoe. Kneel all day and the paddling costs you a little less.', 'Kneeling pads, sheepskin. Lower in the boat, easier on the knees, steadier stroke. Felt by evening.'] },
};
const FAMILIES_BY_KIND = {
  lodge: (f) => (f.ha >= 1000 ? ['cover', 'sail', 'net'] : ['net', 'blanket', 'paddle', 'kneelers']),
  'river post': (f) => (f.longest && f.longest.rods >= 200 ? ['tump', 'yoke', 'pole', 'jacket'] : ['pole', 'jacket', 'tump', 'kneelers']),
  'trout camp': () => ['spoon', 'blanket', 'net'],
  'bait shop': (f) => (f.longest && f.longest.rods >= 200 ? ['yoke', 'leaders', 'jacket'] : ['leaders', 'jacket', 'net', 'tump']),
};
export const SIGNATURES = {};
function makeSignature(ep, family, f, keeper, rng, over = {}) {
  const F = FAMILIES[family], s = over.short || shortName(f.name);
  const item = { id: `sig:${ep}`, family, kind: F.kind, name: over.name || F.name(s, keeper.name.split(' ').slice(-1)[0]), price: over.price || F.price, kg: F.kg,
    words: over.words || pickR(rng, F.words), effect: { ...F.effect } };
  if (F.slot) item.slot = F.slot;
  if (F.lure) item.lure = F.lure;
  SIGNATURES[item.id] = item;
  return item;
}

// --- the building's look -------------------------------------------------------------------------------------------
const STAINS = { oxblood: 0x7b4a33, 'barn red': 0x8a3e2c, 'weathered grey': 0x7d776c, 'forest green': 0x3f5443, cedar: 0x9a6a43, 'log brown': 0x5e4532, ochre: 0xa8823f, 'slate blue': 0x4f6272, whitewash: 0xc9c2b0 };
const ROOFS = { 'grey shingle': [0x55564c, 'shingle'], 'tar black': [0x3a3833, 'shingle'], 'green steel': [0x4a5a48, 'steel'], 'red steel': [0x7a3a2e, 'steel'], 'cedar shake': [0x7a6450, 'shake'] };
const TRIMS = [0xd8ceb2, 0xe6e1d3, 0x435d49, 0x8a3e2c, 0x3a322a, 0xb8913f];
const DOORS = [0x435d49, 0x8a3e2c, 0x3a322a, 0x4f6272, 0xb8913f, 0x7b4a33];
const LOOK_BY_KIND = {
  lodge: { stains: ['log brown', 'oxblood', 'forest green', 'cedar'], roofs: ['green steel', 'red steel', 'cedar shake'], porch: 0.8 },
  'river post': { stains: ['weathered grey', 'cedar', 'log brown'], roofs: ['cedar shake', 'grey shingle', 'tar black'], porch: 0.3 },
  'trout camp': { stains: ['forest green', 'slate blue', 'weathered grey', 'log brown'], roofs: ['green steel', 'grey shingle', 'tar black'], porch: 0.5 },
  'bait shop': { stains: ['barn red', 'ochre', 'whitewash', 'oxblood'], roofs: ['grey shingle', 'red steel', 'tar black'], porch: 0.35 },
};
function makeLook(kind, rng, over = {}) {
  const k = LOOK_BY_KIND[kind], stainName = over.stain || pickR(rng, k.stains), roofName = over.roof || pickR(rng, k.roofs), [roof, roofKind] = ROOFS[roofName];
  const stain = STAINS[stainName];
  // trim and door that stand off the stain: never the same colour as it
  const trims = TRIMS.filter((t) => t !== stain), trim = over.trim ?? (stainName === 'whitewash' ? pickR(rng, [0x435d49, 0x8a3e2c, 0x3a322a]) : pickR(rng, trims));
  const door = over.door ?? pickR(rng, DOORS.filter((d) => d !== stain && d !== trim));
  return { stain, stainName, roof, roofName, roofKind, trim, door, porch: over.porch ?? rng() < k.porch };
}

// --- the keepers -----------------------------------------------------------------------------------------------------
// The north country's names (Finnish, Scandinavian and Slovenian on the Iron Range, French up the border). Each
// generated keeper takes the next first and last name of a fixed shuffle, by the entry point's place in the list, so
// no two of the 55 share a name, and none takes a hand-written keeper's.
const FIRST = ['Ada', 'Agnes', 'Alma', 'Art', 'Bert', 'Cal', 'Carol', 'Clara', 'Dale', 'Dot', 'Duane', 'Earl', 'Edna', 'Elsie', 'Ellen', 'Emil', 'Erik', 'Esther', 'Frank', 'Gordy', 'Greta', 'Hank', 'Hazel', 'Helga', 'Ida', 'Inga', 'Ione', 'Irv', 'Jens', 'Joanne', 'June', 'Karl', 'Kari', 'Lars', 'Lois', 'Lyle', 'Mae', 'Marv', 'Myrna', 'Nels', 'Nora', 'Norm', 'Ole', 'Pete', 'Ray', 'Rudy', 'Sigrid', 'Sonja', 'Stan', 'Tess', 'Thea', 'Tom', 'Vern', 'Vi', 'Walt', 'Ward', 'Wilma'];
const LAST = ['Maki', 'Koski', 'Heikkila', 'Novak', 'Hautala', 'Berg', 'Sundquist', 'Ojala', 'Pekkala', 'Skogstad', 'Lahti', 'Tikkanen', 'Rautio', 'Gornick', 'Brandt', 'Sorenson', 'Dahl', 'Moe', 'Kovach', 'Bergstrom', 'Niemi', 'Saari', 'Wuori', 'Kalla', 'Bratvold', 'Sether', 'Ostrom', 'Halvorson', 'Pajari', 'Ranta', 'Hendrickson', 'Erspamer', 'Mattila', 'Sjoberg', 'Lundeen', 'Torkelson', 'Hakala', 'Jarvi', 'Kivi', 'Laine', 'Seppala', 'Toivonen', 'Vukelich', 'Bozich', 'Perko', 'Skerjanc', 'Gustafson', 'Nygaard', 'Rasmussen', 'Engebretson', 'Quale', 'Hanson', 'Thorsen', 'Aune', 'Fossum', 'Lofgren', 'Belanger', 'Gagnon'];
const shuffled = (list, seed) => { const a = list.slice(), r = mulberry32(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const FIRST_ORDER = shuffled(FIRST, 0x51ed), LAST_ORDER = shuffled(LAST, 0xa11e);
function keeperName(world, ep) {
  const eps = world.entryPoints.map((e) => e.ep).filter((n) => !HAND[n]).sort((a, b) => a - b), i = Math.max(0, eps.indexOf(ep));
  return `${FIRST_ORDER[i % FIRST_ORDER.length]} ${LAST_ORDER[(i * 7) % LAST_ORDER.length]}`;
}
const MANNERS = ['warm', 'dry', 'gruff', 'old hand', 'keen', 'precise'];
const MANNER_WORDS = { warm: 'warm, and talks while she works', dry: 'dry as kindling', gruff: 'few words, all of them useful', 'old hand': 'an old hand with a story for every lake', keen: 'a keen summer hire', precise: 'precise: twenty years with the Forest Service' };
// the keeper's lines for each moment at the counter, by manner. {lake} the landing water, {place} the entry point,
// {near} the nearest other outfitter's place, {town}, {road}, {camps} (words)
const VOICE = {
  warm: {
    hello: ['Morning! Coffee’s on, and there’s a chair by the stove if you want it.', 'There you are. Come in, come in. Take what you need.', 'Good to see a face. How’s the water out there?'],
    stranger: ['Well, hello. I’ve not seen you before. Food’s on the shelf, and our board’s by the door.', 'A new face! Sit a minute. Food’s on the shelf and the board has a few things on it.'],
    season: ['First trip of the season? Here’s forty dollars to start you off. Food’s on the shelf, and the board’s by the door.', 'Forty dollars to start you, dear. Food on the shelf, work on the board by the door.'],
    passing: ['Still out there? Good for you. Take what you need.', 'Stocking up? There’s fresh bread out this morning, for what it’s worth.'],
    morning: ['Sleep all right? There’s eggs if you want them.', 'Morning. The lake’s flat as a plate. Go on, before the wind wakes up.'],
    after: ['You gave us a fright. Eat something. Then eat something else.', 'Sit. Dry socks first, then we’ll talk about the next one.'],
    bunk: ['The bunk’s made up out back, and there’s soup on the stove.', 'Clean sheets on the back bunk. Sleep in a real bed tonight.'],
    ride: ['You made good time. Come in, the kettle’s on.', 'Off the truck already? Come in and warm up.'],
    goodbye: ['Mind the wind on the big stretches. Off you go.', 'Paddle safe. Come back with stories.'],
    chat: ['Wear the bug net in the evening. You’ll thank me.', 'The fish don’t read the board, so don’t blame me if they’re not biting.'],
    pre: ['Between you and me, ', 'Don’t tell the others, but ', ''],
    post: ['', ''],
  },
  dry: {
    hello: ['Morning. The lake’s where you left it.', 'Back again. The mosquitoes said you might be.', 'Come in before the bugs do.'],
    stranger: ['Don’t think we’ve met. Food’s on the shelf. The board’s by the door. The bugs are free.', 'New here? Everything’s for sale except the dog.'],
    season: ['Forty dollars to start you off. Don’t spend it all on lures. Food’s on the shelf, the board’s by the door.', 'Here’s forty dollars. That’s the season’s float, not a tip. Board’s by the door.'],
    passing: ['Passing through? The shelf is where the food lives.', 'Still alive, then. Good. Take what you need.'],
    morning: ['You snore, by the way. Breakfast’s on.', 'Morning. The coffee’s strong enough to paddle on.'],
    after: ['Well. That’s one way to see the inside of a motorboat. Eat.', 'They fished you out. Next time pack more than optimism.'],
    bunk: ['Bunk’s out back. The mattress has seen worse than you.', 'There’s a bunk out back. Try not to dream about portages.'],
    ride: ['Survived the road, then. It’s rougher than the lakes.', 'Truck’s still in one piece? Good. So are you.'],
    goodbye: ['Off you go. The lake won’t paddle itself.', 'Don’t do anything the Forest Service would write home about.'],
    chat: ['People ask if the fish are biting. They are. Just not for them.', 'The road’s the dangerous part. The lake only wants you wet.'],
    pre: ['', ''],
    post: [' Don’t say I told you.', ' Or so the fish tell me.', ''],
  },
  gruff: {
    hello: ['Morning.', 'Yep. Come in.', 'What’ll it be.'],
    stranger: ['Food’s there. Board’s there. Holler if you need me.', 'New. Fine. Food’s on the shelf, board’s by the door.'],
    season: ['Forty dollars. Season’s start. Food on the shelf, board by the door.', 'Here. Forty. Don’t lose it in the lake. Board’s by the door.'],
    passing: ['Take what you need.', 'Back already. Food’s on the shelf.'],
    morning: ['Coffee. Then go.', 'Lake’s flat. Get going.'],
    after: ['Eat. Sleep. Then we’ll talk.', 'Brought you in. Happens. Eat something.'],
    bunk: ['Bunk’s out back.', 'Back bunk. Lights out at ten.'],
    ride: ['Truck’s unloaded. You’re here.', 'Road’s washboard. You’ll live.'],
    goodbye: ['Watch the wind.', 'Go on, then.'],
    chat: ['Don’t trust a calm morning.', 'Two packs is one too many for most people.'],
    pre: [''], post: [''],
  },
  'old hand': {
    hello: ['Morning, morning. Sit, if your legs want it.', 'In ’74 we’d have been on the water an hour already. Come in anyway.', 'There’s the paddler. Pull up a stool.'],
    stranger: ['A new one. I’ve been behind this counter since before the road was paved. Food’s on the shelf, board’s by the door.', 'Haven’t seen you before, and I’ve seen everybody. Have a look round.'],
    season: ['Forty dollars to start you off, same as I gave my first paddler, near enough. Food’s on the shelf, the board’s by the door.', 'Season’s open. Forty dollars, and some advice for free: food first, lures after. Board’s by the door.'],
    passing: ['Still out there. That’s the spirit. Take what you need.', 'Resupplying? We used to do it with a sack of flour and a slab of bacon.'],
    morning: ['Sleep all right? The loons were going all night. Good sign.', 'Morning. There was frost on the canoes once in July. Not today.'],
    after: ['Happened to me in ’81. Eat something and don’t tell anyone.', 'Everybody gets brought in once. Twice is a habit.'],
    bunk: ['Bunk’s out back, built it myself. Still standing.', 'There’s a bunk with your name on it. Well, someone’s name, carved in the frame.'],
    ride: ['You came up the road. In my day it was two ruts and a prayer.', 'Road’s better than it was. Not much.'],
    goodbye: ['Keep the wind at your back and the bugs at your front.', 'Go easy. The lake’s older than both of us.'],
    chat: ['Forty years I’ve watched people pack too much. Leave the cast-iron pan.', 'The old Fisher maps had every portage in rods. Still the best way to count a carry.'],
    pre: ['Forty years I’ve fished it: ', 'Old trick: ', ''],
    post: ['', ''],
  },
  keen: {
    hello: ['Hey! Welcome back! Did you see the loons on the way in?', 'Oh hey! Perfect timing, I just restocked the shelves.', 'Hi! Okay, what are we doing today?'],
    stranger: ['Hi! First time here? Food’s on the shelf and the board’s by the door; there’s some good ones up.', 'Welcome! I’m only up for the summer but I know where everything is. Mostly.'],
    season: ['Okay, so: forty dollars to start your season! Food’s on the shelf, and the board’s by the door.', 'Your first trip? That’s so exciting. Here’s forty dollars. The board’s by the door!'],
    passing: ['You’re still out? That’s amazing. Grab what you need!', 'Resupply day! The food’s on the shelf.'],
    morning: ['Morning! I think there’s still pancakes.', 'Did you sleep? I heard wolves last night. Maybe. Probably a dog.'],
    after: ['Oh, wow, are you okay? Sit down, I’ll get you water.', 'They brought you in! Here, eat this granola bar. Eat two.'],
    bunk: ['The bunk’s out back! It’s got a quilt and everything.', 'You can have the good bunk, the one by the window.'],
    ride: ['You took the ride! The road up here is so pretty.', 'Welcome! Did the truck hit the big pothole? Everyone hits it.'],
    goodbye: ['Have the best time! Bring me back a fish story.', 'Bye! Wear sunscreen; the water reflects.'],
    chat: ['I’m saving up for a Kevlar too. We can compare.', 'I saw a moose last week. It looked at me like I owed it money.'],
    pre: ['Insider tip! ', 'So my boss says ', ''],
    post: ['', ''],
  },
  precise: {
    hello: ['Good morning. Wind’s out of the west, about ten.', 'Morning. Water’s up two degrees since Tuesday.', 'Hello again. What can I find you?'],
    stranger: ['Welcome. I keep things where they belong: food on the shelf, notices on the board by the door.', 'First visit. Everything here is labelled. Ask if it isn’t.'],
    season: ['The season’s float: forty dollars. Food is on the shelf; paid work is on the board by the door.', 'Forty dollars to start. Spend it on food before anything else; the arithmetic is unforgiving.'],
    passing: ['Resupplying. Sensible. Take what you need.', 'Out from where? Never mind. The shelf is stocked.'],
    morning: ['Morning. Pressure’s holding; it should stay fair till evening.', 'You slept the night through. Good. The barometer is steady.'],
    after: ['You ran low on everything at once. That’s rarer than it sounds. Eat first.', 'Brought in. It goes in the log as weather. Rest.'],
    bunk: ['The bunk is out back, second door. Breakfast is at seven.', 'Bunk night. Breakfast at seven, not a minute after.'],
    ride: ['The road runs about half again the distance the crow flies. You’re here.', 'Road time logged. Welcome.'],
    goodbye: ['Check the sky every hour. It changes faster than the forecast.', 'Keep your route in your head and stick to it.'],
    chat: ['A rod is sixteen and a half feet. Count your steps on a carry: about five to the rod.', 'Twenty years with the Forest Service. The trails haven’t moved; the people have.'],
    pre: ['For the record: ', ''],
    post: ['', ''],
  },
};
// the place's own talk, from the data
function placeChat(f) {
  const out = [];
  if (f.camps >= 20) out.push(`There’s ${f.camps >= 100 ? 'over a hundred' : `${Math.floor(f.camps / 10) * 10}-odd`} campsites within a day or two of here. The island ones go first.`);
  if (f.near) out.push(`The ${f.near.name} landing is ${km(f.near.d * 1.4)} km down the road. They keep a board of their own.`);
  out.push(`${f.town}’s ${f.townKm} km back down ${f.road}, if you forgot anything.`);
  if (f.longest && f.longest.rods >= 150) out.push(`The ${f.longest.rods}-rod carry, ${f.longest.name}, sorts people out. Take it in two.`);
  const deep = f.deep[0];
  if (deep) out.push(`${deep.name} goes down ${Math.round(deep.depth)} m. Cold at the bottom all summer.`);
  return out;
}

// --- the hints: insider words from the data ---------------------------------------------------------------------------
const HINT_WORDS = {
  // {lake}{where} always closes its clause, so the "one portage in" never runs into the rest of the sentence
  laketrout: ['Lakers in {lake}{where}. It goes down {depth} m; let the spoon sink a long count.', 'Lake trout, deep and cold, in {lake}{where}. Troll a spoon slow along the drop.'],
  walleye: ['At dusk the walleye come up the drop-offs in {lake}{where}. A jig, slow.', 'Walleye on the rocks at dusk in {lake}{where}. A leech if the jig won’t do it.'],
  pike: ['Northerns in the weedy bays of {lake}{where}. A spoon over the weeds.', 'Big pike sit in the weeds in {lake}{where}. Bring a spoon and some patience.'],
  smallmouth: ['Afternoons, smallmouth on the rocky points of {lake}{where}. A crankbait if you have one.', 'Smallmouth hold on the rocky points in {lake}{where}. Clear water, afternoons.'],
  crappie: ['Crappie in the weeds at dusk in {lake}{where}. A small jig, or a leech under a bobber.'],
  perch: ['Perch in the shallows of {lake}{where}. Leeches on a bobber.'],
  moose: ['At first light, moose come down to {water}{where}. Go slow round the bends.', 'Early, there’s a cow and calf on {water}{where}. Keep your distance.'],
  carry: ['The {rods}-rod carry, {lake}, sorts people out. Take it in two, or put pads on the yoke.'],
};
const TERSE = { laketrout: 'Lakers. {lake}{where}. Deep, a spoon.', walleye: 'Walleye. {lake}{where}. Dusk, a jig.', pike: 'Pike. Weedy bays, {lake}{where}. A spoon.', smallmouth: 'Smallmouth. Rocky points, {lake}{where}.', crappie: 'Crappie. {lake}{where}. Dusk, the weeds.', perch: 'Perch. {lake}{where}. Leeches.', moose: 'Moose on {water}{where}. Dawn.', carry: '{rods} rods, {lake}. Take it in two.' };
// "the Kawishiwi River", but "Filson Creek" and "Lake One"
const theWater = (name) => (/\bRiver$/.test(name || '') ? `the ${name}` : name);
const THICK_WORDS = [' They’re thick this year.', ' Thicker than they’ve been in years.'];
function whereWords(l) {
  if (l.here) return ', right off the dock';
  if (l.hops === 0) return ', on this water';
  if (l.hops === 1) return ', one portage in';
  if (l.hops != null && l.hops <= HOPS) return `, ${word(l.hops)} portages in`;
  return `, ${km(l.d)} km ${l.dir} of here`;
}
// the hints a place gives, best first: up to four, of different kinds
function hintsFor(f, rng) {
  const cand = [], near = f.lakes.filter((l) => l.d < HINT_REACH || l.here);
  const add = (kind, l, score, extra = {}) => cand.push({ kind, l, score: score + rng() * 0.2, ...extra });
  const reachBonus = (l) => (l.here ? 0.6 : l.hops === 0 ? 0.5 : l.hops === 1 ? 0.35 : l.hops != null ? 0.15 : 0) - l.d / 12000;
  for (const l of f.deep) add('laketrout', l, 2 + reachBonus(l) + 0.6 * abundanceOf(l.id, 'laketrout', l.cells));
  for (const l of near) {
    const ab = (sp) => abundanceOf(l.id, sp, l.cells);
    if (l.ha >= 60 && !l.river && l.secchi < 3.2) add('walleye', l, 1.4 + reachBonus(l) + 0.6 * ab('walleye') + (l.secchi < 2.2 ? 0.2 : 0), { ab: ab('walleye') });
    if (l.ha >= 20 && !l.river && (l.tp >= 12 || l.secchi < 2.3)) add('pike', l, 1.1 + reachBonus(l) + 0.6 * ab('pike'), { ab: ab('pike') });
    if (l.ha >= 40 && !l.river && l.secchi >= 3.4) add('smallmouth', l, 1.1 + reachBonus(l) + 0.6 * ab('smallmouth'), { ab: ab('smallmouth') });
    if (l.ha >= 10 && l.ha <= 160 && !l.river && l.secchi < 3) add(rng() < 0.5 ? 'crappie' : 'perch', l, 0.8 + reachBonus(l), {});
    if (l.river && l.d < 8000) add('moose', l, 1.0 + reachBonus(l), {});
  }
  if (f.longest && f.longest.rods >= 120) cand.push({ kind: 'carry', l: { name: f.longest.name, d: 0, x: f.longest.x, z: f.longest.z, here: false }, score: 0.9 + f.longest.rods / 800, rods: f.longest.rods });
  cand.sort((a, b) => b.score - a.score);
  const out = [], kinds = new Set(), lakes = new Set();
  for (const c of cand) {
    if (kinds.has(c.kind) || (c.kind !== 'carry' && lakes.has(c.l.name))) continue;
    kinds.add(c.kind); if (c.kind !== 'carry') lakes.add(c.l.name);
    if (c.kind === 'laketrout') c.ab = abundanceOf(c.l.id, 'laketrout', c.l.cells);
    out.push(c);
    if (out.length >= 4) break;
  }
  return out;
}
// the keeper's way of putting it: the manner's opening for the fish (taken in turn, so no two hints open alike) and
// its closing words
function hintText(h, manner, rng, i = 0) {
  const l = h.l, v = { lake: l.name, water: theWater(l.name), where: h.kind === 'carry' ? '' : whereWords(l), depth: Math.round(l.depth || 0), rods: h.rods };
  if (manner === 'gruff') return fill(TERSE[h.kind], v) + (h.ab >= THICK ? ' Thick this year.' : '');
  const V = VOICE[manner], base = pickR(rng, HINT_WORDS[h.kind]), fish = h.kind !== 'carry' && h.kind !== 'moose', pre = fish ? V.pre[i % V.pre.length] || '' : '';
  let s = fill(base, v);
  if (pre && !base.startsWith('{') && !/[!.?] $/.test(pre)) s = s[0].toLowerCase() + s.slice(1);
  s = pre + s;
  if (h.ab >= THICK) s += pickR(rng, THICK_WORDS);
  // the ex-ranger gives the crow's distance too, where the words gave it by portages
  if (manner === 'precise' && h.kind !== 'carry' && !l.here && l.hops != null && l.hops <= HOPS) s += ` ${cap(km(l.d))} km ${l.dir} as the crow flies.`;
  return s + (pickR(rng, V.post) || '');
}

// --- the six written by hand ---------------------------------------------------------------------------------------
// keeper, manner, kind, the signature (family and its own name and words), the look, priceMul, and lines of their own
// that go ahead of the manner's (chat lines are added to the generated ones)
const HAND = {
  30: { kind: 'lodge', keeper: 'Ruth Aho', manner: 'warm', priceMul: 1.0,
    sig: { family: 'paddle', name: 'Aho ottertail paddle', price: 55, words: 'My brother carves these over the winter: cherry, with a long ottertail blade. Quiet in the water and kind to the shoulders, if not quick.' },
    look: { stain: 'log brown', roof: 'green steel', trim: 0xd8ceb2, door: 0x8a3e2c, porch: true },
    lines: {
      hello: ['Morning! Coffee’s on, and the café has pie until it doesn’t.', 'There you are. Lake One behaving itself?'],
      stranger: ['Welcome to the lodge. I’m Ruth. Food’s on the shelf, our board’s by the door, and the café’s through there.'],
      goodbye: ['Count the narrows on Lake One and you’ll never get lost. Off you go.'],
      chat: ['Lake One is really four lakes pretending to be one. Count the narrows and you’ll never get lost.', 'Snowbank’s the deep one, up the road past Moose Lake. Lakers, if you’ve the patience.', 'The café pays for any fish you keep for it. Deb likes walleye best, but she’ll fry a perch.'],
    } },
  25: { kind: 'lodge', keeper: 'Gus Lindgren', manner: 'gruff', priceMul: 0.95,
    sig: { family: 'cover', name: 'Moose Lake spray cover', price: 60, words: 'For Basswood when it’s blowing. Snaps down over the gunwales and keeps the chop out of your lap. Sits you steadier in a big sea.' },
    look: { stain: 'oxblood', roof: 'red steel', trim: 0xe6e1d3, door: 0x435d49, porch: true },
    lines: {
      hello: ['Morning. Busy one. What’ll it be.', 'Yep. Moose Lake. Come in.'],
      stranger: ['Busiest landing in the Boundary Waters. Food’s there, board’s there. Get in line.'],
      goodbye: ['Basswood’s big. Watch the wind on it.'],
      chat: ['Half of Iowa comes through that door in July.', 'Wind Lake’s over the 175-rod carry. Quieter there.', 'The chain goes north to the border. Don’t get lost in Canada; the paperwork’s worse than the portages.'],
    } },
  38: { kind: 'bait shop', keeper: 'Bev Kangas', manner: 'dry', priceMul: 1.05,
    sig: { family: 'yoke', name: 'Sawbill cedar yoke', price: 32, words: 'Carved out back from white cedar. The pads are fine; this is better. Your neck will write to thank me.' },
    look: { stain: 'weathered grey', roof: 'cedar shake', trim: 0x435d49, door: 0xb8913f, porch: false },
    lines: {
      hello: ['Morning. End of the road. Literally: it stops at our door.', 'Back again. The leeches missed you.'],
      stranger: ['End of the Sawbill Trail. Food’s on the shelf, the board’s by the door, the leeches are in the cooler, and the cooler is not for sitting on.'],
      goodbye: ['Alton’s over the hill if the walleye won’t play. Off you go.'],
      chat: ['Alton Lake’s one short carry over the hill. That’s where the lakers are, down in the cold.', 'Blueberries on the burns come August. Bring me a pint and I’ll bake.', 'Everybody wants the island site on Sawbill. Everybody can’t have it.'],
    } },
  54: { kind: 'trout camp', keeper: 'Arvid Strand', manner: 'old hand', priceMul: 1.2,
    sig: { family: 'spoon', name: 'Seagull copper spoon', price: 9, words: 'Hammered them myself in the shed, copper over brass. Lakers can’t leave it alone when it flutters down. Ties on like any spoon.' },
    look: { stain: 'forest green', roof: 'green steel', trim: 0xd8ceb2, door: 0x8a3e2c, porch: true },
    lines: {
      hello: ['Morning. Sit, if your legs want it. Seagull’s blowing again.', 'There’s the paddler. The lakers have been asking after you.'],
      stranger: ['A new one. I’ve watched this lake since before the road was paved. Food’s on the shelf, the board’s by the door.'],
      goodbye: ['Seagull’s all islands and rock. Keep the compass handy.'],
      chat: ['Seagull’s all islands and rock. The fire in ’07 took the pines and the blueberries took over.', 'Lake trout don’t care for July. Go deep or go home.', 'Magnetic Lake’s the deep one round here. Twenty-seven metres, and cold as a banker.'],
    } },
  55: { kind: 'lodge', keeper: 'Lise Thibodeau', manner: 'keen', priceMul: 1.25,
    sig: { family: 'sail', name: 'Saganaga downwind sail', price: 45, words: 'Two spruce poles and a square of canvas. On Sag with a west wind behind you it’s free miles. Don’t try it into the wind; I mean it.' },
    look: { stain: 'barn red', roof: 'tar black', trim: 0xe6e1d3, door: 0x3a322a, porch: true },
    lines: {
      hello: ['Hey! End of the Gunflint! Did you see the eagle on the way in?', 'Oh hey, you’re back! Sag’s been flat all morning, so go now.'],
      stranger: ['Welcome to the end of the Gunflint Trail! Past here it’s Canada and moose. Food’s on the shelf, the board’s by the door.'],
      goodbye: ['Watch the whitecaps past the big point. Sag makes its own weather!'],
      chat: ['Sag’s big enough to make its own weather. If it’s whitecapping past the point, wait it out on an island.', 'The walleye here are the real thing. Jig the reefs at dusk.', 'Past the border it’s Canada’s lakes and Canada’s rules. Don’t get us in trouble.'],
    } },
  14: { kind: 'river post', keeper: 'Leon Zupancic', manner: 'precise', priceMul: 1.1,
    sig: { family: 'pole', name: 'Sioux River setting pole', price: 20, words: 'Ash, iron-shod, twelve feet. Stand and push off the bottom where the river’s too thin to paddle. Steadier than you would think.' },
    look: { stain: 'weathered grey', roof: 'cedar shake', trim: 0x7b4a33, door: 0x435d49, porch: false },
    lines: {
      hello: ['Good morning. The river’s down four inches since the weekend.', 'Morning. Beaver have been at the second dam again.'],
      stranger: ['Welcome. The Little Indian Sioux meanders about three miles of river for every mile of map. Food’s on the shelf; the board’s by the door.'],
      goodbye: ['Mind the beaver dams; drag over them on the left, where it’s shallowest.'],
      chat: ['The Little Indian Sioux meanders like it’s paid by the mile. Beaver dams every bend or two.', 'Moose in the river bottoms at dawn. Go slow round the bends.', 'The 319-rod landing carry is the price of admission. Everything after it is easier.'],
    } },
};

// --- the profile -----------------------------------------------------------------------------------------------------
export function outfitterProfile(ep, world) {
  const e = epRec(world, ep); if (!e) return null;
  const c = cacheOf(world);
  if (c.profiles.has(e.ep)) return c.profiles.get(e.ep);
  const f = placeFacts(e, world), H = HAND[e.ep] || null;
  const rng = mulberry32(((e.ep * 2654435761) ^ 0x5eed0c) >>> 0);
  const kind = H ? H.kind : kindOf(f);
  const manner = H ? H.manner : MANNERS[Math.floor(rng() * MANNERS.length)];
  const kname = H ? H.keeper : keeperName(world, e.ep);
  const vars = { lake: f.landing, place: e.name, town: f.town, road: f.road, near: f.near ? f.near.name : '' };
  // the lines: the hand-written first, then the manner's
  const V = VOICE[manner], lines = {};
  for (const k of ['hello', 'stranger', 'season', 'passing', 'morning', 'after', 'bunk', 'ride', 'goodbye']) lines[k] = [...((H && H.lines[k]) || []), ...V[k]].map((s) => fill(s, vars));
  const hints = hintsFor(f, rng).map((h, i) => ({ kind: h.kind, text: hintText(h, manner, rng, i), lake: h.l.name, x: Math.round(h.l.x ?? f.x), z: Math.round(h.l.z ?? f.z), r: h.kind === 'carry' ? 500 : Math.round(Math.max(500, Math.sqrt(((h.l.cells || 3000) * 100) / Math.PI) * 1.2 + 250)), thick: (h.ab || 0) >= THICK }));
  // public talk: the keeper's own, the kind's, the place's, the manner's
  const chat = [...((H && H.lines.chat) || []), ...KIND[kind].chat.map((s) => fill(s, vars)), ...placeChat(f), ...V.chat];
  // lines as the contract has them (a hello, a goodbye and the talk), and every moment's lines for keeperLine
  const keeperObj = { name: kname, first: kname.split(' ')[0], manner, mannerWords: MANNER_WORDS[manner], lines: { hello: lines.hello[0], goodbye: lines.goodbye[0], chat }, moments: { ...lines, chat },
    // an insider hint, the nth (keepers share them with a friend of the house: standing 2)
    hint(w, p, n = 0) { const hs = (p || profile).hints; return hs.length ? hs[((n % hs.length) + hs.length) % hs.length].text : pickR(Math.random, chat); } };
  // what is sold only here
  const fams = FAMILIES_BY_KIND[kind](f), family = H ? H.sig.family : fams[Math.floor(rng() * fams.length)];
  const sig = makeSignature(e.ep, family, f, keeperObj, rng, H ? H.sig : {});
  // prices by how far it is down the road to town (and a bait shop at the end of it a touch dearer)
  const priceMul = H ? H.priceMul : Math.min(1.25, Math.max(0.9, round05(0.9 + 0.35 * smooth(8, 60, f.townKm) + (kind === 'bait shop' && f.townKm >= 30 ? 0.05 : 0))));
  // the board's lean: the kind's, nudged by the place, and a touch of its own
  const bw = { ...KIND[kind].board };
  if (f.carries.length >= 3 && f.carries[0].rods >= 150) bw.survey *= 1.2;
  if (f.camps >= 100) bw.lost *= 1.15;
  if (f.ha >= 1000) bw.fish *= 1.1;
  if (f.deep.length) bw.fish *= 1.05;
  // content A: the new notices by the place too: long carries want sawing, busy sites want cleaning up, clear lakes are
  // read for the monitors, big water has the loons and the shore lunches
  if (f.carries.length && f.carries[0].rods >= 120) bw.deadfall *= 1.25;
  if (f.camps >= 100) bw.litter *= 1.15;
  if (f.clear >= 2) bw.secchi *= 1.2;
  if (f.ha >= 1000) { bw.loons *= 1.1; bw.lunch *= 1.1; }
  // (content A: the new kinds' touch of their own from a seed of their own, so the old draws, and the building's look
  // drawn after them, stay as they were)
  const rngA = mulberry32(((e.ep * 2246822519) ^ 0xc0a7e1) >>> 0);
  for (const k of Object.keys(bw)) bw[k] = +(bw[k] * (0.92 + (NEW_KINDS.has(k) ? rngA() : rng()) * 0.16)).toFixed(2);
  const look = makeLook(kind, rng, H ? H.look : {});
  const shared = world.entryPoints.filter((o) => outfitterName(o) === outfitterName(e)).length > 1;
  const profile = {
    ep: e.ep, name: outfitterName(e), place: e.name, lake: f.landing, area: f.road, kind, kindWords: KIND[kind].words(f),
    post: shared ? `the ${e.name} post` : null, // a business with landings at several entry points
    keeper: keeperObj, priceMul, signature: sig.id, boardWeights: bw, look, hints, hand: !!H,
    facts: { landing: f.landing, ha: f.ha, depth: f.depth, secchi: f.secchi, river: f.river, camps: f.camps, deep: f.deep.slice(0, 3).map((l) => `${l.name} ${Math.round(l.depth)} m`), longest: f.longest ? `${f.longest.name}, ${f.longest.rods} rods` : null, town: f.town, townKm: f.townKm, road: f.road, near: f.near ? f.near.ep : null },
  };
  c.profiles.set(e.ep, profile);
  return profile;
}
export function allProfiles(world) { return world.entryPoints.map((e) => outfitterProfile(e, world)); }
export function signatureItem(ep, world) { const p = outfitterProfile(ep, world); return p ? SIGNATURES[p.signature] || null : null; }
export function signatures(world) { allProfiles(world); return { ...SIGNATURES }; }
// tasks.js's kinds by key: 'item' is the board's lost-and-found
export function boardLean(ep, world) {
  const p = outfitterProfile(ep, world); if (!p) return null;
  const w = p.boardWeights;
  return { fish: w.fish, item: w.lost, survey: w.survey, photo: w.photo, fetch: w.fetch, berries: w.berries, firewood: w.firewood,
    // content A (task-kinds.js)
    deadfall: w.deadfall ?? 1, litter: w.litter ?? 1, secchi: w.secchi ?? 1, loons: w.loons ?? 1, report: w.report ?? 1, canoe: w.canoe ?? 1, lunch: w.lunch ?? 1 };
}

// --- what the keeper says ------------------------------------------------------------------------------------------
// moment: hello stranger season passing morning after bunk ride goodbye chat (welcome is hello). ctx: { rep, doy, n,
// hours }: a friend of the house (standing 2 or more) hears an insider hint now and then; the season colours the talk;
// the hour keeps a "Morning!" to the morning and a "tonight" to the afternoon and evening (forHour).
const SEASON_TALK = [
  [120, 150, ['Ice went out late this year. The water’s still cold enough to stop your heart; stay near shore.', 'The lakers are up near the top while the water’s cold. Best trout weeks of the year.']],
  [150, 185, ['Blackflies this week, then the mosquitoes. Bring the head net.', 'The loons are on their nests. Give the little islands a wide berth.']],
  [195, 240, ['Blueberries are on in the burns. Bring me a pint if you find a good patch.', 'Water’s warm. The walleye have gone deep in the afternoons; dusk is your time.']],
  [245, 285, ['Colour’s coming on the birches. Cold nights now: bring the wool.', 'The bugs are gone. Best weeks of the year, if you don’t mind frost.']],
  [285, 320, ['The loons are gathering to leave. So are most of the paddlers.', 'Ice will be on the bays in a month. Don’t get caught out.']],
];
// the lines of a pool that fit the hour of the day: none that say morning after noon, none that say tonight or this
// evening before eleven (the whole pool when that would leave none)
function forHour(pool, h) {
  if (!Number.isFinite(h) || !pool || !pool.length) return pool;
  const off = h >= 12 ? /\bmorning\b/i : h < 11 ? /\b(tonight|this evening)\b/i : null;
  const keep = off ? pool.filter((s) => !off.test(s)) : pool;
  return keep.length ? keep : pool;
}
export function keeperLine(profile, moment = 'hello', ctx = {}) {
  if (!profile) return '';
  const k = profile.keeper, L = k.moments || {}, rng = ctx.n != null ? mulberry32((profile.ep * 7919 + ctx.n * 104729) >>> 0) : Math.random;
  const m = moment === 'welcome' ? 'hello' : moment;
  if (m === 'chat') {
    const pool = [...(L.chat || k.lines.chat || [])];
    if (ctx.doy) for (const [a, b, lines] of SEASON_TALK) if (ctx.doy >= a && ctx.doy < b) pool.push(...lines, ...lines);
    if ((ctx.rep || 0) >= 2 && profile.hints.length) pool.push(...profile.hints.map((h) => h.text));
    return pickR(rng, pool);
  }
  // a friend of the house: the hello is an insider hint half the time
  if ((m === 'hello' || m === 'passing') && (ctx.rep || 0) >= 2 && profile.hints.length && rng() < 0.5) return k.hint(null, profile, Math.floor(rng() * 8));
  return pickR(rng, forHour(L[m] && L[m].length ? L[m] : L.hello || [k.lines.hello], ctx.hours));
}

// --- the phase-1 counter in the keeper's voice -------------------------------------------------------------------------
// Until the shop's counter (stream B) speaks for itself (outfitter.keeperVoice), the header's line is the keeper's, the
// kicker says what kind of place it is and the keeper signs the line; the wall's last note names what is sold only here.
export function speakAtCounter(outfitter, world) {
  if (!outfitter || outfitter.speaksForKeeper) return;
  outfitter.speaksForKeeper = true;
  const show = outfitter.show.bind(outfitter), render = outfitter.render.bind(outfitter);
  // every argument is passed on (the shop's counter opens at a tab: show(landing, tab, focus))
  outfitter.show = (landing, ...rest) => {
    if (outfitter.keeperVoice || !landing) return show(landing, ...rest);
    const pr = outfitter.profile, core = outfitter.core;
    const stranger = (pr && !pr.knows(landing.ep)) || (core && core.fresh === landing.ep);
    const lk = outfitter.lineKind || 'welcome', by = outfitter.arrivedBy; // rides.js: off the truck ('ride') or up from its bunk ('bunk')
    outfitter.arrivedBy = null;
    const moment = lk === 'welcome' ? (stranger ? 'stranger' : by === 'ride' ? 'ride' : outfitter.trip && outfitter.trip.active ? 'passing' : 'hello') : lk;
    const r = show(landing, ...rest);
    const p = outfitterProfile(landing.ep, world);
    if (p) { outfitter.greeting = keeperLine(p, moment, { rep: pr ? pr.outfitter(landing.ep).rep : 0, doy: outfitter.day ? outfitter.day.doy : 0 }); outfitter.render(); }
    return r;
  };
  outfitter.render = (...args) => {
    const out = render(...args);
    if (outfitter.keeperVoice || !outfitter.open || !outfitter.at || typeof document === 'undefined') return out;
    const p = outfitterProfile(outfitter.at.ep, world), el = outfitter.el && outfitter.el.panel;
    if (!p || !el) return out;
    const kick = el.querySelector('header .kicker'), say = el.querySelector('header .say');
    if (kick && !kick.dataset.kind) { kick.dataset.kind = '1'; kick.textContent = `Entry point ${p.ep} · ${p.lake} · ${p.kindWords} · ${p.area}`; }
    if (say && !say.textContent.includes(p.keeper.name)) {
      const who = document.createElement('span');
      who.className = 'keeper'; who.textContent = ` — ${p.keeper.name}, behind the counter`;
      who.style.cssText = 'font-style: normal; font-size: 15px; color: var(--ink-soft); white-space: nowrap;';
      say.appendChild(who);
    }
    const sig = SIGNATURES[p.signature], note = el.querySelector('.wall > p.soft:last-of-type');
    if (sig && note && !note.dataset.sig) {
      note.dataset.sig = '1';
      note.textContent = `Only here: the ${sig.name}, $${Math.round(sig.price * p.priceMul)}. “${sig.words}”`;
    }
    return out;
  };
}
