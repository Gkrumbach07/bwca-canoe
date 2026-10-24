// Items (the owner's feedback of 2026-10-24, stream A): everything you own is an item, in a container (a Duluth
// pack, a blue food barrel, the leech bucket, the tackle box, your pockets, the stringer) or a long item you hold or
// lay down (the rod, the paddle). This is the registry; inventory.js keeps where each one is, and inv-ui.js (stream B)
// draws them on a Tarkov-style grid. Nothing here imports anything, so any module may read it at load.
//
//   ITEMS[id] = { id, name, kind, w, h, kg, stack, price, eat?: { food, lift?, cook, hot? }, icon,
//                 container?: { cols, rows, accepts?: [kinds] }, wear?: ['back', 'chest'], hand?, nest?, fixed?,
//                 slot?, lure?, long?, sold?, words }
//   defineItem(def) → the def (other streams add items: stream B's shop-only things, stream G's berries)
//   itemDef(id) → the def, or null (a fish of a species nobody defined gets a plain one)
//   sizeOf(id, rot) → { w, h } (rot 1 turns it a quarter)
//
// kind: 'food' | 'snack' | 'meal' | 'fish' | 'bait' | 'lure' | 'tool' | 'gear' | 'map' | 'container' | 'long' |
// 'firewood' | 'forage'. w × h are grid cells (a cell is about a hand's width: a meal bag is one, a tent two by four).
// kg is one of them (a fish's own weight comes from its length, in the grid entry's data). stack is how many go in one
// cell's pile (leeches by the dozen). price is the reference in dollars (the shop's table; each outfitter scales it).
// eat: what eating one does (food: the food need, lift: the bar, cook: it must be cooked first, hot: a hot meal).
// container: its own grid and the kinds it takes (none listed: anything that fits); wear: where it rides (on the
// back or the chest, for a portage); hand: carried in a hand; nest: it can go inside a pack (a tackle box, the map
// case, the stringer); fixed: never carried (the pockets, the outfitters' crate). slot: the kit slot it fills (tent,
// filter, paddle). lure: fishing.js's lure id. long: 'rod' | 'paddle' (a long item, never in a grid).

export const ITEMS = {};

const KINDS = new Set(['food', 'snack', 'meal', 'fish', 'bait', 'lure', 'tool', 'gear', 'map', 'container', 'long', 'firewood', 'forage']);
export const FOOD_KINDS = ['food', 'snack', 'meal', 'fish', 'forage'];

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
  if (s.startsWith('fish:')) return defineItem({ id: s, name: cap(s.slice(5)), kind: 'fish', w: 2, h: 1, kg: 0.8, eat: { food: 0.6, lift: 0.45, cook: true, hot: true }, words: 'Cleaned and kept for supper.' });
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
defineItem({ id: 'pockets', name: 'Your pockets', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, container: { cols: 4, rows: 1 }, icon: 'pockets', words: 'A snack, a lure, the map folded small.' });
defineItem({ id: 'pack3', name: 'Duluth pack #3', kind: 'container', w: 4, h: 5, kg: 2.0, price: 25, wear: ['back', 'chest'], mesh: 'food', container: { cols: 6, rows: 8 }, icon: 'pack', words: 'Canvas and leather, the old portage pack. Room for the tent, the bag and two weeks of meals.' });
defineItem({ id: 'pack4', name: 'Duluth pack #4', kind: 'container', w: 5, h: 5, kg: 2.4, price: 35, wear: ['back', 'chest'], mesh: 'gear', container: { cols: 7, rows: 9 }, icon: 'pack', words: 'The big one. Everything goes in, and you feel all of it on a long carry.' });
defineItem({ id: 'barrel30', name: 'Blue barrel, 30 L', kind: 'container', w: 3, h: 4, kg: 2.2, price: 25, wear: ['back', 'chest'], hand: true, mesh: 'barrel30', container: { cols: 4, rows: 4, accepts: FOODISH }, icon: 'barrel', words: 'A screw-lid barrel with a harness. A week of food, dry and sealed, and the bears can’t smell it.' });
defineItem({ id: 'barrel60', name: 'Blue barrel, 60 L', kind: 'container', w: 4, h: 5, kg: 3.0, price: 35, wear: ['back'], mesh: 'barrel60', container: { cols: 5, rows: 6, accepts: FOODISH }, icon: 'barrel', words: 'A blue barrel on a pack harness. Two weeks of food rides dry and sealed.' });
defineItem({ id: 'bucket', name: 'Leech bucket', kind: 'container', w: 2, h: 2, kg: 1.2, price: 6, hand: true, mesh: 'bucket', container: { cols: 2, rows: 2, accepts: ['bait'] }, icon: 'bucket', words: 'A foam bucket with a lid and cool lake water. Change the water and they keep a week.' });
defineItem({ id: 'tacklebox', name: 'Tackle box', kind: 'container', w: 3, h: 2, kg: 0.8, price: 12, hand: true, nest: true, mesh: 'tacklebox', container: { cols: 4, rows: 3, accepts: ['lure', 'tool'] }, icon: 'tacklebox', words: 'A green tackle box with a tray. Whatever lure is not in it, you can’t tie on.' });
defineItem({ id: 'mapcase', name: 'Map case', kind: 'container', w: 1, h: 3, kg: 0.2, price: 10, hand: true, nest: true, mesh: 'mapcase', container: { cols: 2, rows: 6, accepts: ['map'] }, icon: 'mapcase', words: 'A clear waterproof sleeve. The sheets stay dry under the thwart.' });
defineItem({ id: 'stringer', name: 'Fish stringer', kind: 'container', w: 1, h: 2, kg: 0.2, price: 0, hand: true, nest: true, mesh: 'stringer', container: { cols: 3, rows: 5, accepts: ['fish'] }, icon: 'fish', words: 'A chain of clips over the gunwale. The fish stay alive and cool until supper.' });
defineItem({ id: 'crate', name: 'Kept for you at the outfitters', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, stashOnly: true, container: { cols: 10, rows: 8 }, icon: 'crate', words: 'What you don’t take along waits on the back shelf, and they ship it up the road to whichever counter you come in at.' });
defineItem({ id: 'pile', name: 'On the ground', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, mesh: 'pile', container: { cols: 6, rows: 4 }, icon: 'pile', words: 'Set down here.' });

// --- food --------------------------------------------------------------------------------------------------------
// A day of food is two meals (0.9 kg, $6): a breakfast and a supper, both cooked on the grate. Snacks are eaten as they
// are, standing still, on foot or in the canoe.
defineItem({ id: 'meal:breakfast', name: 'Oatmeal breakfast', kind: 'meal', kg: 0.4, price: 3, eat: { food: 0.5, lift: 0.3, cook: true, hot: true }, words: 'Oats, brown sugar and raisins in a bag. Hot water and a spoon.' });
defineItem({ id: 'meal:supper', name: 'Rice and lentil supper', kind: 'meal', kg: 0.5, price: 3, eat: { food: 0.6, lift: 0.45, cook: true, hot: true }, words: 'Rice, lentils and a curry packet. Twenty minutes on the grate.' });
defineItem({ id: 'meal:freeze', name: 'Freeze-dried supper', kind: 'meal', kg: 0.2, price: 5, eat: { food: 0.6, lift: 0.45, cook: true, hot: true, boil: true }, words: 'Boil the water, pour it in, wait. A hot supper on a night you can’t get a fire going.' });
defineItem({ id: 'snack:trailmix', name: 'Trail mix', kind: 'snack', kg: 0.25, price: 2, eat: { food: 0.2, lift: 0.08 }, words: 'Peanuts, raisins and the chocolate bits you pick out first.' });
defineItem({ id: 'snack:jerky', name: 'Beef jerky', kind: 'snack', kg: 0.12, price: 3, eat: { food: 0.2, lift: 0.06 }, words: 'Smoked at the shop. Chewing it lasts a whole bay.' });
defineItem({ id: 'snack:chocolate', name: 'Chocolate bar', kind: 'snack', kg: 0.1, price: 1, eat: { food: 0.1, lift: 0.12 }, words: 'A square on every portage.' });
// kept fish, by species: a fish of any other species gets a plain one (itemDef)
for (const [sp, name, w, h] of [['walleye', 'Walleye', 2, 1], ['pike', 'Northern pike', 3, 1], ['smallmouth', 'Smallmouth bass', 2, 1], ['laketrout', 'Lake trout', 3, 1], ['perch', 'Yellow perch', 1, 1], ['crappie', 'Crappie', 1, 1]]) {
  defineItem({ id: `fish:${sp}`, name, kind: 'fish', w, h, kg: 0.8, species: sp, eat: { food: 0.6, lift: 0.45, cook: true, hot: true }, words: 'Kept for supper. Fry it on the grate.' });
}
defineItem({ id: 'leeches', name: 'Leeches', kind: 'bait', kg: 0.025, stack: 12, price: 4, sold: 12, lure: 'leech', icon: 'leeches', words: 'Fresh from the bait fridge, for the bobber rig. A walleye can’t leave one alone.' });
defineItem({ id: 'firewood', name: 'An armful of firewood', kind: 'firewood', w: 3, h: 2, kg: 6, words: 'Dead and down, broken to length.' });

// --- the tackle --------------------------------------------------------------------------------------------------
defineItem({ id: 'lure:jig', name: 'Jig & twister tail', kind: 'lure', kg: 0.01, price: 3, lure: 'jig', words: 'A lead head and a curly tail. Hop it along the bottom for walleye.' });
defineItem({ id: 'lure:mepps', name: 'Mepps spinner', kind: 'lure', kg: 0.01, price: 6, lure: 'spinner', words: 'The blade throws the light. Cast it along the weed edge.' });
defineItem({ id: 'lure:daredevle', name: 'Red-and-white Daredevle', kind: 'lure', kg: 0.02, price: 7, lure: 'spoon', words: 'The spoon every pike in the country knows.' });
defineItem({ id: 'lure:rapala', name: 'Jointed Rapala', kind: 'lure', kg: 0.02, price: 12, lure: 'crankbait', words: 'A balsa minnow that swims deep on a steady crank.' });
defineItem({ id: 'lure:silverminnow', name: 'Johnson Silver Minnow', kind: 'lure', kg: 0.02, price: 8, lure: 'silverminnow', words: 'A weedless spoon. Drag it right through the cabbage.' });
defineItem({ id: 'lure:lazyike', name: 'Lazy Ike', kind: 'lure', kg: 0.02, price: 9, lure: 'lazyike', words: 'An old banana plug with a lazy wobble.' });

// --- camp gear and tools -----------------------------------------------------------------------------------------
defineItem({ id: 'aframe', name: 'A-frame tent', kind: 'gear', w: 2, h: 4, kg: 3.0, price: 0, slot: 'tent', icon: 'tent', words: 'Two poles and a fly. It sags when it rains.' });
defineItem({ id: 'dome', name: 'Dome tent', kind: 'gear', w: 2, h: 4, kg: 2.8, price: 50, slot: 'tent', icon: 'dome', words: 'Stands up to the wind off the lake.' });
defineItem({ id: 'fourseason', name: 'Four-season tent', kind: 'gear', w: 2, h: 5, kg: 3.6, price: 95, slot: 'tent', icon: 'dome', words: 'A good night in any weather, and the wet things dry by morning.' });
defineItem({ id: 'sleepingbag', name: 'Sleeping bag', kind: 'gear', w: 2, h: 3, kg: 1.8, price: 0, icon: 'bag', words: 'A down bag in a stuff sack, good to freezing.' });
defineItem({ id: 'clothes', name: 'Clothes bag', kind: 'gear', w: 2, h: 2, kg: 2.5, price: 0, icon: 'clothes', words: 'Wool socks, a fleece, rain gear, a dry shirt for camp.' });
defineItem({ id: 'pot', name: 'Cook pot', kind: 'tool', w: 2, h: 2, kg: 1.2, price: 0, icon: 'pot', words: 'A blackened pot, a lid, a spoon and a lighter inside it.' });
defineItem({ id: 'tarp', name: 'Rain tarp', kind: 'gear', w: 2, h: 2, kg: 1.0, price: 0, icon: 'tarp', words: 'A nylon tarp and its lines, for over the tent or the kitchen.' });
defineItem({ id: 'pad', name: 'Sleeping pad', kind: 'gear', w: 2, h: 3, kg: 0.6, price: 30, words: 'Foam between you and the cold ground.' });
defineItem({ id: 'yokepads', name: 'Portage yoke pads', kind: 'gear', w: 2, h: 1, kg: 0.4, price: 15, icon: 'yoke', words: 'Foam pads for the yoke.' });
defineItem({ id: 'tablets', name: 'Purifying tablets', kind: 'tool', kg: 0.05, price: 2, slot: 'filter', words: 'A tablet in the bottle and half an hour’s wait.' });
defineItem({ id: 'pump', name: 'Pump filter', kind: 'tool', w: 1, h: 2, kg: 0.4, price: 35, slot: 'filter', words: 'Pump it full at the shore and drink it then and there.' });
defineItem({ id: 'gravity', name: 'Gravity filter', kind: 'tool', w: 2, h: 2, kg: 0.5, price: 55, slot: 'filter', words: 'Hang the bag in a tree at camp and the bottle fills itself.' });
defineItem({ id: 'saw', name: 'Folding saw', kind: 'tool', w: 1, h: 3, kg: 0.4, price: 18, words: 'For the dead and down wood.' });
defineItem({ id: 'camera', name: 'Camera, 35 mm', kind: 'tool', w: 2, h: 1, kg: 0.6, price: 25, words: 'A good little camera and a roll of film.' });

// --- the long items: held in a hand, lying in the canoe or on the ground -------------------------------------------
defineItem({ id: 'ash', name: 'Ash paddle', kind: 'long', w: 1, h: 6, kg: 1.1, price: 0, slot: 'paddle', long: 'paddle', icon: 'paddle', words: 'A plain ash beavertail. It gets you there.' });
defineItem({ id: 'bentshaft', name: 'Bent-shaft laminate paddle', kind: 'long', w: 1, h: 6, kg: 0.9, price: 40, slot: 'paddle', long: 'paddle', words: 'Easier on the shoulders, a touch quicker.' });
defineItem({ id: 'carbon', name: 'Carbon bent-shaft paddle', kind: 'long', w: 1, h: 6, kg: 0.5, price: 110, slot: 'paddle', long: 'paddle', words: 'Next to no weight. You’ll feel it by the second lake.' });
defineItem({ id: 'rod', name: 'Spinning rod', kind: 'long', w: 1, h: 7, kg: 0.4, price: 0, long: 'rod', words: 'A medium-light rod and a spinning reel, six-pound line.' });
defineItem({ id: 'rodmh', name: 'Medium-heavy rod', kind: 'long', w: 1, h: 7, kg: 0.5, price: 45, long: 'rod', icon: 'rod', words: 'A stiffer rod and heavier line. A big pike can make his run and you’ll still have him.' });

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
