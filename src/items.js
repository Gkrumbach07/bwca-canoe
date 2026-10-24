// Items (the owner's feedback of 2026-10-24, stream A): everything you own is an item, in a container (a Duluth
// pack, a blue food barrel, the leech bucket, the tackle box, your pockets, the stringer) or a long item you hold or
// lay down (the rod, the paddle). This is the registry; inventory.js keeps where each one is, and inv-ui.js (stream B)
// draws them on a Tarkov-style grid. Nothing here imports anything, so any module may read it at load.
//
//   ITEMS[id] = { id, name, kind, w, h, kg, stack, price, eat?: { food, lift?, cook, hot? }, icon,
//                 container?: { cols, rows, accepts?: [kinds] }, wear?: ['back', 'chest'], hand?, nest?, fixed?,
//                 slot?, lure?, long?, sold?, hang?, words, verbs }
//   defineItem(def) → the def (other streams add items: stream B's shop-only things, stream G's berries)
//   itemDef(id) → the def, or null (a fish of a species nobody defined gets a plain one)
//   sizeOf(id, rot) → { w, h } (rot 1 turns it a quarter)
//   VERBS[id] → { label, words }, verbsFor(def) → the verbs a def gets when it names none, verbsOf(id) → an item's
//
// kind: 'food' | 'snack' | 'meal' | 'fish' | 'bait' | 'lure' | 'tool' | 'gear' | 'map' | 'container' | 'long' |
// 'firewood' | 'forage'. w × h are grid cells (a cell is about a hand's width: a meal bag is one, a tent two by four).
// kg is one of them (a fish's own weight comes from its length, in the grid entry's data). stack is how many go in one
// cell's pile (leeches by the dozen). price is the reference in dollars (the shop's table; each outfitter scales it).
// eat: what eating one does (food: the food need, lift: the bar, cook: it must be cooked first, hot: a hot meal).
// container: its own grid and the kinds it takes (none listed: anything that fits); wear: where it rides (on the
// back or the chest, for a portage); hand: carried in a hand; nest: it can go inside a pack (a tackle box, the map
// case, the stringer); fixed: never carried (the pockets, the outfitters' crate). slot: the kit slot it fills (tent,
// filter, paddle). lure: fishing.js's lure id. long: 'rod' | 'paddle' (a long item, never in a grid). hang: a barrel,
// hung from a limb at camp.
//
// The world cards (the owner, 2026-10-24: "what does the pot even do, same with some other items"): every item says
// what it is for in one line, `words` ("Cooks a meal on the grate."), which the book's tooltip shows with the name and
// the weight; and `verbs` is the right-click list, and nothing else goes on it:
//   verbs: [{ id, label, where?, why? }]
//   id 'eat' | 'cook' | 'pitch' | 'hang' | 'hand' | 'tie' | 'use'; label the menu's word; where: 'fire' on Cook (it works
//   only inside the fire card); why: set when the verb is greyed in the book, the reason written under it (Hang: hanging
//   is E at a tree with the barrel in your hands; Eat on a raw meal: cook it first). Eating is instant, standing still.

export const ITEMS = {};

const KINDS = new Set(['food', 'snack', 'meal', 'fish', 'bait', 'lure', 'tool', 'gear', 'map', 'container', 'long', 'firewood', 'forage']);
export const FOOD_KINDS = ['food', 'snack', 'meal', 'fish', 'forage'];

// the right-click verbs: what each is, in the book's words
export const VERBS = {
  eat: { label: 'Eat', words: 'Eaten where you stand, afloat or on foot; no sitting down.' },
  cook: { label: 'Cook', words: 'Onto the grate, inside the fire card.' },
  pitch: { label: 'Pitch', words: 'The ghost goes to the dot; a held E or click works through the phases.' },
  hang: { label: 'Hang', words: 'Carry it to a tree and point at the limb: E hangs it.' },
  hand: { label: 'Put in hand', words: 'Into a free hand, to carry or to use.' },
  tie: { label: 'Tie it on', words: 'On the line, with the rod up.' },
  use: { label: 'Use', words: 'What the thing does.' },
};
const WHY = { hang: 'carry it to a tree and point at the limb', cook: 'only in the fire card', raw: 'cook it on the grate first' };
const verb = (id, more = {}) => ({ id, label: VERBS[id].label, ...more });
// the verbs a def gets when it names none: food is eaten (a raw meal cooked first), a tent pitched, a barrel hung, a
// long item or a hand-carried container put in a hand, a lure tied on, a map sheet looked at
export function verbsFor(d) {
  const out = [];
  if (d.eat) { if (d.eat.cook) out.push(verb('cook', { where: 'fire', why: WHY.cook }), verb('eat', { why: WHY.raw })); else out.push(verb('eat')); }
  if (d.slot === 'tent') out.push(verb('pitch'));
  if (d.hang) out.push(verb('hang', { why: WHY.hang }));
  if (d.long || (d.hand && d.kind === 'container' && !d.fixed)) out.push(verb('hand'));
  if (d.lure && (d.kind === 'lure' || d.kind === 'bait')) out.push(verb('tie'));
  if (d.kind === 'map') out.push(verb('use', { label: 'Look at the map' }));
  return out;
}
export function verbsOf(id) { const d = itemDef(id); return d ? d.verbs || [] : []; }
// a purpose line for a def that gives none, by its kind (forage's and the camp's items come through defineItem too)
const WORDS = {
  food: 'Eat it hot, or keep it a few hours as leftovers.', snack: 'Eaten as it is, anywhere you stand still.', meal: 'Cook it in the pot on the grate, then eat.',
  fish: 'Fry it on the grate for supper.', bait: 'Bait for the bobber rig.', lure: 'Tie it on and cast.', tool: 'A tool for camp.', gear: 'Gear for the trip.',
  map: 'A Fisher map sheet; sheets are owned now, not carried.', container: 'Holds things.', long: 'Carried in a hand or laid in the canoe.',
  firewood: 'Burns in the fire ring.', forage: 'Picked on the trip; eat it as it is, or cook it with supper.',
};
const wordsFor = (d) => (d.eat && d.eat.cook && d.kind === 'forage' ? 'Cook them first, on the grate with supper.' : WORDS[d.kind] || WORDS.gear);

export function defineItem(def) {
  if (!def || !def.id) throw new Error('defineItem: an id is needed');
  const id = String(def.id), had = ITEMS[id];
  const d = {
    id, name: id, kind: 'gear', w: 1, h: 1, kg: 0, stack: 1, price: 0, icon: null, words: '',
    ...(had || {}), ...def,
  };
  if (!KINDS.has(d.kind)) console.warn(`defineItem ${id}: unknown kind ${d.kind}`);
  d.w = Math.max(1, Math.round(d.w || 1)); d.h = Math.max(1, Math.round(d.h || 1));
  d.stack = Math.max(1, Math.round(d.stack || 1));
  if (!d.icon) d.icon = iconFor(d);
  if (!d.words) d.words = wordsFor(d);
  if (!Array.isArray(d.verbs)) d.verbs = verbsFor(d);
  ITEMS[id] = d;
  return d;
}
// the icon key stream B's inv-ui.js draws: the item's own, else its family
function iconFor(d) {
  if (d.kind === 'fish') return 'fish';
  if (d.kind === 'map') return 'map';
  if (d.kind === 'lure') return d.id.replace(/^lure:/, '');
  if (d.kind === 'meal') return d.id === 'meal:freeze' ? 'freeze' : 'meal';
  if (d.kind === 'snack') return d.id.replace(/^snack:/, '');
  return d.id;
}

export function itemDef(id) {
  if (id == null) return null;
  const d = ITEMS[id];
  if (d) return d;
  const s = String(id);
  if (s.startsWith('fish:')) return defineItem({ id: s, name: cap(s.slice(5)), kind: 'fish', w: 2, h: 1, kg: 0.8, eat: { food: 0.6, lift: 0.45, cook: true, hot: true }, words: 'Fry it on the grate for supper.' });
  // a map sheet the inventory restores before the shop's sheets are in (shop.js loads sheets.js later and names it fully)
  if (s.startsWith('sheet:')) return defineItem({ id: s, name: `Fisher map ${s.slice(6)}`, short: s.slice(6), kind: 'map', w: 2, h: 2, kg: 0.1, price: 8, icon: 'map', stub: true, words: 'Opens the map at this sheet; sheets are owned now, not carried.' });
  return null;
}
export function sizeOf(id, rot = 0) {
  const d = itemDef(id); if (!d) return { w: 1, h: 1 };
  return rot ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}
// a fish's weight from its length (cm): about the walleye's and the pike's own curves, near enough for a pack
export function fishKg(species, cm) {
  const L = Math.max(5, Number(cm) || 30), k = { pike: 0.0042, laketrout: 0.0105, smallmouth: 0.0135, walleye: 0.0098, perch: 0.012, crappie: 0.014 }[species] ?? 0.01;
  return +(k * Math.pow(L, 3) / 1000).toFixed(2);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------------------------------------------
// The containers. A cell is a hand's width; a Duluth pack #3 holds about two weeks of meals besides the tent, the
// sleeping bag, the clothes and the pot; the 60 L barrel about 14 days of food, the 30 L one 7.
const FOODISH = ['food', 'snack', 'meal', 'fish', 'forage'];
defineItem({ id: 'pockets', name: 'Your pockets', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, container: { cols: 4, rows: 1 }, icon: 'pockets', words: 'Four quick slots for small things: a snack, a lure, the tablets.' });
defineItem({ id: 'pack3', name: 'Duluth pack #3', kind: 'container', w: 4, h: 5, kg: 2.0, price: 25, wear: ['back', 'chest'], mesh: 'food', container: { cols: 6, rows: 8 }, icon: 'pack', words: 'Carries the camp on your back or chest: the tent, the bag, the pot and two weeks of meals.' });
defineItem({ id: 'pack4', name: 'Duluth pack #4', kind: 'container', w: 5, h: 5, kg: 2.4, price: 35, wear: ['back', 'chest'], mesh: 'gear', container: { cols: 7, rows: 9 }, icon: 'pack', words: 'Carries more than the #3, and you feel all of it on a long carry.' });
defineItem({ id: 'barrel30', name: 'Blue barrel, 30 L', kind: 'container', w: 3, h: 4, kg: 2.2, price: 25, wear: ['back', 'chest'], hand: true, hang: true, mesh: 'barrel30', container: { cols: 4, rows: 4, accepts: FOODISH }, icon: 'barrel', words: 'Keeps a week of food dry and sealed; hang it from a limb at night and the bears go hungry.' });
defineItem({ id: 'barrel60', name: 'Blue barrel, 60 L', kind: 'container', w: 4, h: 5, kg: 3.0, price: 35, wear: ['back'], hang: true, mesh: 'barrel60', container: { cols: 5, rows: 6, accepts: FOODISH }, icon: 'barrel', words: 'Keeps two weeks of food dry and sealed; hang it from a limb at night.' });
defineItem({ id: 'bucket', name: 'Leech bucket', kind: 'container', w: 2, h: 2, kg: 1.2, price: 6, hand: true, mesh: 'bucket', container: { cols: 2, rows: 2, accepts: ['bait'] }, icon: 'bucket', words: 'Keeps the leeches alive for the bobber rig; carried in a hand.' });
defineItem({ id: 'tacklebox', name: 'Tackle box', kind: 'container', w: 3, h: 2, kg: 0.8, price: 12, hand: true, nest: true, mesh: 'tacklebox', container: { cols: 4, rows: 3, accepts: ['lure'] }, icon: 'tacklebox', words: 'Holds the lures you can tie on; whatever is not in it, you can’t fish with.' });
defineItem({ id: 'mapcase', name: 'Map case', kind: 'container', w: 1, h: 3, kg: 0.2, price: 10, hand: true, nest: true, mesh: 'mapcase', container: { cols: 2, rows: 6, accepts: ['map'] }, icon: 'mapcase', words: 'Kept the map sheets dry; the sheets are owned now, not carried.' });
defineItem({ id: 'stringer', name: 'Fish stringer', kind: 'container', w: 1, h: 2, kg: 0.2, price: 0, hand: true, nest: true, mesh: 'stringer', container: { cols: 3, rows: 5, accepts: ['fish'] }, icon: 'fish', words: 'Keeps the fish you land alive and cool until supper.' });
defineItem({ id: 'crate', name: 'Kept for you at the outfitters', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, stashOnly: true, container: { cols: 10, rows: 8 }, icon: 'crate', words: 'Keeps what you leave behind at an outfitter until you come in again, at any counter.' });
defineItem({ id: 'pile', name: 'On the ground', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, mesh: 'pile', container: { cols: 6, rows: 4 }, icon: 'pile', words: 'Things set down on the ground here; Q opens the pile, E takes one.' });

// --- food --------------------------------------------------------------------------------------------------------
// A day of food is two meals (0.9 kg, $6): a breakfast and a supper, both cooked on the grate. Snacks are eaten as they
// are, standing still, on foot or in the canoe.
defineItem({ id: 'meal:breakfast', name: 'Oatmeal breakfast', kind: 'meal', kg: 0.4, price: 3, eat: { food: 0.5, lift: 0.3, cook: true, hot: true }, words: 'A hot breakfast: cook it in the pot on the grate, then eat.' });
defineItem({ id: 'meal:supper', name: 'Rice and lentil supper', kind: 'meal', kg: 0.5, price: 3, eat: { food: 0.6, lift: 0.45, cook: true, hot: true }, words: 'A hot supper: cook it in the pot on the grate, then eat.' });
defineItem({ id: 'meal:freeze', name: 'Freeze-dried supper', kind: 'meal', kg: 0.2, price: 5, eat: { food: 0.6, lift: 0.45, cook: true, hot: true, boil: true }, words: 'A hot supper from boiled water alone: the pot on the grate, then eat.' });
defineItem({ id: 'snack:trailmix', name: 'Trail mix', kind: 'snack', kg: 0.25, price: 2, eat: { food: 0.2, lift: 0.08 }, words: 'Eaten as it is, afloat or on foot, standing still.' });
defineItem({ id: 'snack:jerky', name: 'Beef jerky', kind: 'snack', kg: 0.12, price: 3, eat: { food: 0.2, lift: 0.06 }, words: 'Eaten as it is, afloat or on foot; it keeps forever.' });
defineItem({ id: 'snack:chocolate', name: 'Chocolate bar', kind: 'snack', kg: 0.1, price: 1, eat: { food: 0.1, lift: 0.12 }, words: 'Eaten as it is; a lift on a portage.' });
// kept fish, by species: a fish of any other species gets a plain one (itemDef)
for (const [sp, name, w, h] of [['walleye', 'Walleye', 2, 1], ['pike', 'Northern pike', 3, 1], ['smallmouth', 'Smallmouth bass', 2, 1], ['laketrout', 'Lake trout', 3, 1], ['perch', 'Yellow perch', 1, 1], ['crappie', 'Crappie', 1, 1]]) {
  defineItem({ id: `fish:${sp}`, name, kind: 'fish', w, h, kg: 0.8, species: sp, eat: { food: 0.6, lift: 0.45, cook: true, hot: true }, words: 'Fry it on the grate for supper; a notice’s cooler may want it as it is.' });
}
defineItem({ id: 'leeches', name: 'Leeches', kind: 'bait', kg: 0.025, stack: 12, price: 4, sold: 12, lure: 'leech', icon: 'leeches', words: 'Bait for the bobber rig, kept alive in the bucket; a walleye can’t leave one alone.' });
defineItem({ id: 'firewood', name: 'An armful of firewood', kind: 'firewood', w: 3, h: 2, kg: 6, burn: 2.4, words: 'Burns in the fire ring for a couple of hours.' });
// camp 2 (the camp redone, 2026-10-24): firewood is found lying about, a piece at a time (chores.js), and burns by the
// piece (burn: game hours on a fire, fire.js); a few pieces are carried in the arms, a hand's armload (woodarms, drawn by
// chores.js). The grate holds what is cooking or cooked and the pot (cook.js): a fixed container at the fire ring.
defineItem({ id: 'wood:branch', name: 'Dead branch', short: 'Branch', kind: 'firewood', w: 1, h: 2, kg: 0.7, burn: 0.6, icon: 'firewood', words: 'Kindling for the fire ring: it catches easily and burns about half an hour.' });
defineItem({ id: 'wood:log', name: 'Short log', short: 'Log', kind: 'firewood', w: 1, h: 3, kg: 2.2, burn: 1.5, icon: 'firewood', words: 'Burns long in the fire ring, an hour and a half once the fire is going.' });
defineItem({ id: 'woodarms', name: 'Armload of wood', short: 'Armload', kind: 'container', w: 2, h: 3, kg: 0, hand: true, container: { cols: 3, rows: 3, accepts: ['firewood'] }, icon: 'firewood', verbs: [], words: 'Wood carried in the crook of an arm to the fire ring.' });
defineItem({ id: 'grate', name: 'On the grate', short: 'The grate', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, container: { cols: 4, rows: 2, accepts: ['food', 'tool'] }, icon: 'pot', words: 'The fire ring’s grate: the pot, the pan or a fish on a stick go on it.' });
// what comes off the grate: a meal cooked (hot, eaten at the fire, or kept a few hours as leftovers) and a fish fried
for (const [id, raw, name] of [
  ['hot:breakfast', 'meal:breakfast', 'Hot oatmeal'],
  ['hot:supper', 'meal:supper', 'Rice and lentils, hot'],
  ['hot:freeze', 'meal:freeze', 'Freeze-dried supper, ready'],
]) defineItem({ id, name, kind: 'food', w: 1, h: 1, kg: 0.6, cooked: raw, keep: 5, eat: { ...ITEMS[raw].eat, cook: false, hot: true }, icon: 'pot', words: 'Eat it hot, or keep it a few hours as leftovers.' });
for (const [sp, name] of [['walleye', 'Walleye'], ['pike', 'Northern pike'], ['smallmouth', 'Smallmouth bass'], ['laketrout', 'Lake trout'], ['perch', 'Yellow perch'], ['crappie', 'Crappie'], ['fish', 'Fish']]) {
  defineItem({ id: `fried:${sp}`, name: `Fried ${sp === 'fish' ? 'fish' : name.toLowerCase().replace(/^northern /, '')}`, kind: 'food', w: 2, h: 1, kg: 0.5, cooked: `fish:${sp}`, keep: 4, species: sp, eat: { food: 0.6, lift: 0.45, hot: true }, icon: 'fish', words: 'Eat it hot off the grate, or keep it a few hours as leftovers.' });
}

// --- the tackle --------------------------------------------------------------------------------------------------
defineItem({ id: 'lure:jig', name: 'Jig & twister tail', kind: 'lure', kg: 0.01, price: 3, lure: 'jig', words: 'Tie it on for walleye and hop it along the bottom.' });
defineItem({ id: 'lure:mepps', name: 'Mepps spinner', kind: 'lure', kg: 0.01, price: 6, lure: 'spinner', words: 'Tie it on along the weed edge; the blade throws the light.' });
defineItem({ id: 'lure:daredevle', name: 'Red-and-white Daredevle', kind: 'lure', kg: 0.02, price: 7, lure: 'spoon', words: 'Tie it on for pike: the spoon every pike in the country knows.' });
defineItem({ id: 'lure:rapala', name: 'Jointed Rapala', kind: 'lure', kg: 0.02, price: 12, lure: 'crankbait', words: 'Tie it on and crank it deep: a balsa minnow that swims.' });
defineItem({ id: 'lure:silverminnow', name: 'Johnson Silver Minnow', kind: 'lure', kg: 0.02, price: 8, lure: 'silverminnow', words: 'Tie it on through the weeds: a weedless spoon.' });
defineItem({ id: 'lure:lazyike', name: 'Lazy Ike', kind: 'lure', kg: 0.02, price: 9, lure: 'lazyike', words: 'Tie it on for a lazy wobble: an old banana plug.' });

// --- camp gear and tools -----------------------------------------------------------------------------------------
defineItem({ id: 'aframe', name: 'A-frame tent', kind: 'gear', w: 2, h: 4, kg: 3.0, price: 0, slot: 'tent', icon: 'tent', words: 'Pitch it at camp to sleep in; it sags when it rains.' });
defineItem({ id: 'dome', name: 'Dome tent', kind: 'gear', w: 2, h: 4, kg: 2.8, price: 50, slot: 'tent', icon: 'dome', words: 'Pitch it at camp to sleep in; it stands up to the wind off the lake.' });
defineItem({ id: 'fourseason', name: 'Four-season tent', kind: 'gear', w: 2, h: 5, kg: 3.6, price: 95, slot: 'tent', icon: 'dome', words: 'Pitch it at camp for the best night in any weather; the wet things dry by morning.' });
defineItem({ id: 'sleepingbag', name: 'Sleeping bag', kind: 'gear', w: 2, h: 3, kg: 1.8, price: 0, icon: 'bag', words: 'Keeps you warm through the night in the tent, down to freezing.' });
defineItem({ id: 'clothes', name: 'Clothes bag', kind: 'gear', w: 2, h: 2, kg: 2.5, price: 0, icon: 'clothes', words: 'Dry clothes for camp: warmth again after a wet day or a cold one.' });
defineItem({ id: 'pot', name: 'Cook pot', kind: 'tool', w: 2, h: 2, kg: 1.2, price: 0, icon: 'pot', words: 'Cooks a meal on the grate.' });
defineItem({ id: 'tarp', name: 'Rain tarp', kind: 'gear', w: 2, h: 2, kg: 1.0, price: 0, icon: 'tarp', words: 'Shelters the tent or the kitchen from the rain.' });
defineItem({ id: 'pad', name: 'Sleeping pad', kind: 'gear', w: 2, h: 3, kg: 0.6, price: 30, words: 'Softens the ground under the bag for a better night.' });
defineItem({ id: 'yokepads', name: 'Portage yoke pads', kind: 'gear', w: 2, h: 1, kg: 0.4, price: 15, icon: 'yoke', words: 'Eases the canoe on your shoulders over a portage.' });
defineItem({ id: 'tablets', name: 'Purifying tablets', kind: 'tool', kg: 0.05, price: 2, slot: 'filter', words: 'Purifies the bottle: a tablet dropped in and half an hour’s wait.' });
defineItem({ id: 'pump', name: 'Pump filter', kind: 'tool', w: 1, h: 2, kg: 0.4, price: 35, slot: 'filter', words: 'Fills the bottle at the shore, drinkable at once.' });
defineItem({ id: 'gravity', name: 'Gravity filter', kind: 'tool', w: 2, h: 2, kg: 0.5, price: 55, slot: 'filter', words: 'Fills the bottle by itself: hang the bag in a tree at camp.' });
defineItem({ id: 'saw', name: 'Folding saw', kind: 'tool', w: 1, h: 3, kg: 0.4, price: 18, words: 'Saws a down log into short logs for the fire: hold E at the log with it in reach.' });
defineItem({ id: 'camera', name: 'Camera, 35 mm', kind: 'tool', w: 2, h: 1, kg: 0.6, price: 25, words: 'Takes the pictures the photo notices ask for; C raises it.' });

// --- the long items: held in a hand, lying in the canoe or on the ground -------------------------------------------
defineItem({ id: 'ash', name: 'Ash paddle', kind: 'long', w: 1, h: 6, kg: 1.1, price: 0, slot: 'paddle', long: 'paddle', icon: 'paddle', words: 'Paddles the canoe; a plain beavertail that gets you there.' });
defineItem({ id: 'bentshaft', name: 'Bent-shaft laminate paddle', kind: 'long', w: 1, h: 6, kg: 0.9, price: 40, slot: 'paddle', long: 'paddle', words: 'Paddles the canoe a touch quicker and easier on the shoulders.' });
defineItem({ id: 'carbon', name: 'Carbon bent-shaft paddle', kind: 'long', w: 1, h: 6, kg: 0.5, price: 110, slot: 'paddle', long: 'paddle', words: 'Paddles the canoe with next to no weight in your hands.' });
defineItem({ id: 'rod', name: 'Spinning rod', kind: 'long', w: 1, h: 7, kg: 0.4, price: 0, long: 'rod', words: 'Fishes from the canoe (F), or from the shore, a dock or a rock with it in your hand.' });
defineItem({ id: 'rodmh', name: 'Medium-heavy rod', kind: 'long', w: 1, h: 7, kg: 0.5, price: 45, long: 'rod', icon: 'rod', words: 'Fishes for the big pike: stiffer, with heavier line; from the canoe or the shore with it in hand.' });

// The old profile's owned ids (profile.js, the hubs' shop) as items: what a save from before the items migrates to
export const LEGACY = { pack: 'pack3', pack2: 'pack4', barrel: 'barrel60', rod: 'rodmh' };
// the season's starting kit as items: where each goes (inventory.newSeason)
export const STARTER_KIT = {
  canoe: ['pack3', 'bucket', 'stringer'],
  pack3: ['aframe', 'sleepingbag', 'clothes', 'pot', 'tarp', 'tablets', 'tacklebox'],
  tacklebox: ['lure:jig', 'lure:mepps'],
  bucket: [['leeches', 12]],
  long: ['ash', 'rod'],
};
