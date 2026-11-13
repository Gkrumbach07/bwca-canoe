// 7c: the mini-campaigns M1–M6 (docs/build/campaign-design.md Part 2 §10.3, Part 3 #4, Part 4 Round 7 7C; docs/plans/
// campaigns.md §2). Pure: no game imports, so scripts/cmp-7c-unit.mjs runs it in Node and story-data/episodes/m*.js build
// their records from it at construction (all-rules.js: the data hash holds).
//
// Yearly reseeds. Facts only grow (§3.1), so a mini that comes round again after a winter turn is a new episode on the
// one runner: one record per cycle, `M1_0`, `M1_1`, … (CYCLES of them), cycle k open while exactly k winter turns have
// happened (`count(year.turned.*)=k`; the last cycle stays open from then on). Its world (the bear's chain, the soloist,
// the rangers' names, the freeze-up route) is bound from hash(quest, cycle): a new year, a new chain. (A default: the cycle
// alone, not the season's seed, so a year's flyer, page and list name their own lakes and man in words fixed at construction.)
// Stream w's season-turn.js writes `year.turned.<y>` (§3.9) and emits year:open; until it lands the facts alone drive it
// (story.debug.set('year.turned.2027')), which is all a cycle reads.
//
//   CYCLES · cycleWhen(k) → condition · idOf(base, k) · cycleOf(story) → k (turns so far, capped)
//   seedOf(quest, cycle) → u32 · pick(list, seed, salt) · pickN(list, n, seed, salt)
//   BEAR_CHAINS · chainOf(cycle) → index · bearChain(cycle, ok) → { i, lakes }
//   SOLOISTS · M3_ROUTES · soloist(cycle) → { s, r, name, last, past, family, look, route: [{ lake, i }] }
//   PARTNERS · rangers(cycle) → { p, partner }      (Tom Becker is always Tom: bible 4.9; his partner rotates)
//   FREEZE_ROUTES · freezeRoute(cycle) → { i, from, lakes }
//   FOG_ROUTE (M2's logbook places east along the voyageur road, US side), LONG_PROJECTS (M6), longStay(rec, start) (pure)

export const CYCLES = 6;
export const cycleWhen = (k) => (k < CYCLES - 1 ? `count(year.turned.*)=${k}` : `count(year.turned.*)>=${k}`);
export const idOf = (base, k) => `${base}_${k}`; // (an underscore: the lint's count()/any() atoms take [\w.*] only)
export function cycleOf(story) {
  if (!story) return 0;
  let n = 0;
  try { if (typeof story.keys === 'function') n = story.keys('year.turned.').length; else if (story.state && story.state.facts) n = Object.keys(story.state.facts).filter((k) => k.startsWith('year.turned.')).length; } catch { n = 0; }
  return Math.min(CYCLES - 1, n);
}

// --- seeds ------------------------------------------------------------------------------------------------------------
export function hashStr(s) { let h = 0x811c9dc5; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
export const seedOf = (quest, cycle) => hashStr(`${quest}|${cycle}`);
// a cycle's index into a table of n: every cycle a different one until the table comes round
export const slotOf = (quest, cycle, n) => ((hashStr(quest) % n) + cycle) % n;
export const pick = (list, seed, salt = 0) => list[(hashStr(`${seed}:${salt}`) % list.length + list.length) % list.length];
export function pickN(list, n, seed, salt = 0) {
  const a = list.map((x, i) => ({ x, k: hashStr(`${seed}:${salt}:${i}`) })).sort((p, q) => p.k - q.k);
  return a.slice(0, Math.min(n, a.length)).map((p) => p.x);
}

// --- M1: the raspberry bear's chains (the gentle side: Moose Lake 25, Farm 31; bear.js BEAR_LAKES names) ---------------
// Each a run of real connected lakes with sites. The runtime resolves the names to lakes and sites (feed-minis.js); a name
// that doesn't resolve is dropped, and a chain with fewer than two lakes left is passed over for the next.
export const BEAR_CHAINS = [
  ['Moose Lake', 'Newfound Lake', 'Sucker Lake'],
  ['Newfound Lake', 'Splash Lake', 'Ensign Lake'],
  ['Snowbank Lake', 'Disappointment Lake', 'Parent Lake'],
  ['Fall Lake', 'Newton Lake', 'Basswood Lake'],
  ['Lake One', 'Lake Two', 'Lake Three'],
  ['Ensign Lake', 'Vera Lake', 'Knife Lake'],
];
export const chainOf = (cycle) => slotOf('M1', cycle, BEAR_CHAINS.length);
export function bearChain(cycle, ok = () => true) {
  const i = chainOf(cycle);
  return { i, lakes: BEAR_CHAINS[i].filter(ok), seed: seedOf('M1', cycle) };
}
// the signs a bear leaves at a chain's sites (bearsign): claw marks on a hung pack, scat full of raspberry seeds, a barrel
// dragged into the brush. Which sites: bound at start (feed-minis.js), three of the chain's sites by the seed
export const SIGNS = ['claw', 'scat', 'barrel'];
// the bear's hours (its range and hours are what the signs give): it comes in after full dark, one of these windows
export const BEAR_HOURS = [[22, 1], [23, 2], [0, 3]];
export const bearHours = (cycle) => pick(BEAR_HOURS, seedOf('M1', cycle), 'hours');
// a night at a chain camp fed it (the fate counts them): a party's camp on a chain lake, a seeded one in FED of the nights
export const FED = 9;
export const partyFed = (partyId, absDay, cycle) => hashStr(`fed:${partyId}:${absDay}:${cycle}`) % FED === 0;
// the relocation sites the ranger offers (60's "a site you pick": three far lakes, the doc's own gentle-side geography)
export const RELOCATE = ['a', 'b', 'c'];

// --- M3: the trip not taken (a soloist at the home dock; never Walt: §10.3's banned words) -----------------------------
// Each year's has a fixed name, a local past and a family (§10.3's own example first). His list: five lakes of his route,
// a picture from each.
export const SOLOISTS = [
  { name: 'Arvid Lund', past: 'retired from the Virginia plant', family: 'his daughter drove him up', look: { age: 'old', shirt: 0x4d6a8a, pants: 0x4a4436, hat: 0x6b5a3a, hair: 0xc9c6bf } },
  { name: 'Harold Sjoberg', past: 'thirty years a lineman for the co-op', family: 'his son-in-law brought him', look: { age: 'old', shirt: 0x7a4030, pants: 0x3e3a32, hat: 0x2f3b2a, hair: 0xdedad2 } },
  { name: 'Leonard Maki', past: 'taught shop at Mountain Iron', family: 'his granddaughter waits in the car', look: { age: 'old', shirt: 0x5c6b3a, pants: 0x3a3a40, hat: null, hair: 0xb8b4ac } },
  { name: 'Gene Kozlowski', past: 'drove truck for the paper mill in Sartell', family: 'his wife sent him with a thermos', look: { age: 'old', shirt: 0x8a6a3a, pants: 0x34404a, hat: 0x8a2a20, hair: 0xd0ccc4 } },
  { name: 'Clifford Ness', past: 'a mail carrier in Two Harbors', family: 'his nephew drove up from the Cities', look: { age: 'old', shirt: 0x3a4f6a, pants: 0x48443a, hat: 0x3a3a3a, hair: 0xe0dcd4 } },
  { name: 'Ray Bergquist', past: 'kept the books at a lumberyard in Cloquet', family: 'his daughter-in-law drove him', look: { age: 'old', shirt: 0x6a3a4a, pants: 0x3a3630, hat: 0x5a6a3a, hair: 0xc4c0b8 } },
];
// (the lint for M3: never Walt, no Walt-shaped names or places; a name above starting "Walter" is a different man, but
// the lint bans "Walt" as a word, so no line says his first name: the page names him by his last)
export const M3_ROUTES = [
  ['Ensign Lake', 'Knife Lake', 'Kekekabic Lake', 'Ogishkemuncie Lake', 'Seagull Lake'],
  ['Lake One', 'Lake Two', 'Lake Three', 'Lake Insula', 'Alice Lake'],
  ['Basswood Lake', 'Crooked Lake', 'Iron Lake', 'Lac La Croix', 'Fourtown Lake'],
  ['Sawbill Lake', 'Alton Lake', 'Kelso Lake', 'Polly Lake', 'Malberg Lake'],
  ['Brule Lake', 'Cherokee Lake', 'Frost Lake', 'Little Saganaga Lake', 'Gabimichigami Lake'],
  ['Snowbank Lake', 'Disappointment Lake', 'Ima Lake', 'Thomas Lake', 'Fraser Lake'],
];
export function soloist(cycle) {
  const s = slotOf('M3', cycle, SOLOISTS.length), r = slotOf('M3route', cycle, M3_ROUTES.length), who = SOLOISTS[s];
  return { ...who, s, r, last: who.name.split(' ').slice(-1)[0], route: M3_ROUTES[r].map((lake, i) => ({ lake, i })) };
}

// --- M4: the ranger crew (Tom Becker and his partner: bible 4.9; stream s's fixed party `tom` draws them) --------------
export const PARTNERS = ['Kelsey', 'Marcus', 'Jen', 'Dale', 'Priya', 'Nils'];
export const rangers = (cycle) => { const p = slotOf('M4', cycle, PARTNERS.length); return { p, partner: PARTNERS[p] }; };
// the favours, one a meeting (existing board kinds: tasks.makeKind), the fourth their last check (Oct)
export const FAVOURS = ['litter', 'blowdown', 'litter', 'lastcheck'];
export const FAVOUR_EP = 30; // Lake One's landing (their district; Farm 31's reach)

// --- M5: the freeze-up run (Farm 31, Hog Creek 36; two retired guides' bet) --------------------------------------------
export const FREEZE_ROUTES = [
  { from: 31, lakes: ['Farm Lake', 'South Kawishiwi River', 'Clear Lake'] },
  { from: 31, lakes: ['Lake One', 'Lake Two', 'Lake Three', 'Lake Four'] },
  { from: 36, lakes: ['Isabella Lake', 'Bog Lake', 'Perent Lake'] },
  { from: 36, lakes: ['Hog Creek', 'Perent Lake', 'Isabella Lake'] },
];
export const freezeRoute = (cycle) => { const i = slotOf('M5', cycle, FREEZE_ROUTES.length); return { i, ...FREEZE_ROUTES[i] }; };
export const SKIM = { cells: 6, hits: 3 }; // skimice: a lead of skim ice is this many breaks wide; each break this many strokes

// --- M2: singing in the fog (never settled; never closes by itself, Part 3 #4 owner edit) ------------------------------
// The logbook's places east along the voyageur road from Loon Falls, on the US side (Quetico is DLC): portages' ends from
// names-portages.json. The runtime keeps the end that is in bounds (edge.js isPast). Grand Portage is past the edge: a
// keeper tells it.
export const FOG_ROUTE = [
  { id: 'loon', name: 'Loon Falls', ends: [[-82703, -16386], [-83005, -16165]] },
  { id: 'curtain', name: 'Curtain Falls', ends: [[-51456, -16318], [-52126, -16321]] },
  { id: 'basswood', name: 'Basswood Falls', ends: [[-33702, -1982], [-32996, -2054]] },
  { id: 'prairie', name: 'Prairie Portage', ends: [[-16720, 4231], [-16605, 4549]] },
  { id: 'knife', name: 'Knife Lake', ends: [[-7194, 1850], [-6835, 1893]] },
];
export const FOG_LAKE = 'Lac La Croix';
export const FOG_HOURS = [4.5, 8.5]; // dawn
// the brigade: four canoes, voices; the set piece's own numbers (fogvoices)
export const FOG = { canoes: 4, hear: 420, near: 140, catchUp: 60, secs: 75, drift: 1.6 };

// --- M6: the long stay (any counter, any 30 days, one resupply; the project is yours) ---------------------------------
export const LONG = { days: 30, resupplies: 1 };
// the projects a counter topic offers: what record.js counts (the long stay's goal); `n` to reach in the 30 days
export const LONG_PROJECTS = [
  { id: 'lakes', n: 50 },    // fifty lakes paddled
  { id: 'species', n: 6 },   // every species (the six the water holds)
  { id: 'photos', n: 30 },   // a photo series: thirty pictures
  { id: 'nights', n: 30 },   // thirty nights out (the stay itself)
];
// the stay's progress from a snapshot of counts at its start and now: { lakes, species, photos, nights } each a number
export function longStay(project, start, now) {
  const P = LONG_PROJECTS.find((p) => p.id === project);
  if (!P) return { done: false, got: 0, n: 0 };
  const got = Math.max(0, (now[P.id] || 0) - (start[P.id] || 0));
  return { done: got >= P.n, got, n: P.n };
}
