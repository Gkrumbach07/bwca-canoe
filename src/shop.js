// The shop (hubs phase 2, stream B; the store made physical in the feedback of 2026-10-24, stream B): what an
// outfitter sells, where in the store it sits, at that outfitter's prices, and what the gear does.
//
// CATALOG is everything for sale: { id, name, shelf, price, kg, words, qty?, effect?, slot?, family?, hull? }. The id
// is an item's (items.js, stream A; inv-ui.js holds stand-ins until it is in), so a buy is a thing in one of your
// containers. shelf is where it stands in the store: 'food' (the provisions shelf: meals, snacks, the barrels and the
// water), 'tackle' (the tackle shelf: the rod, the leeches and their bucket, the tackle box), 'gear' (the gear shelf
// and the rafters: packs, paddles, canoes, tents and the rest), 'lure' (the pegboard lure wall), 'map' (the map
// table: the map sheets of this country, owned once bought: maptable.js, fb2 D) and 'counter' (a bunk: the counter is
// for services only).
// The words are the keeper's: what a thing does, never a number past the price and the weight. Each outfitter adds
// its own signature item (stream C's outfitters.js), and its prices are the table's × that outfitter's priceMul (×0.9
// more at standing 3).
//
// What the gear does is small and felt, in player.gear, which player.js, energy.js, packs.js, camp.js and fishing.js
// each read in one line (with these defaults the game plays as it did before the shop):
//   { cruise: 1, effort: 1, stability: 1, carry: 1, sleep: 0.85, sleepDry: false, snap: 1, saw: false,
//     filter: 'tablets', camera: false, canoeKg: 34, foodRoom: 7 }
// cruise scales the canoe's top speed, effort what the paddle costs, stability the sea a hull can take broadside before
// it rolls, carry what a portage with the canoe costs, sleep the night's quality (the tent, plus a pad), sleepDry a
// tent that dries the gear overnight, snap how long a line holds in the red, canoeKg the hull on the portages and
// foodRoom the days of food the packs hold. Everything you own counts (profile.owned: the owned list and every item in
// the inventory, stream A), the canoe, paddle, tent and filter only when in use (profile.kit).
//
// The tackle box: the lures you can tie on are the ones in reach (inventory.hasLure; 1–7 with the rod up; one not in
// reach is refused, and quiet on the strip). A snapped line loses that lure from its container (fishing.js calls
// onSnap), never the last jig; a leech goes with each fish on the bobber.
//
//   shop.stock(ep) → items priced for that outfitter, each { ...item, price, owned, inUse, afford }
//   shop.shelfStock(shelf, ep) → what stands on one shelf (the stock for inv-ui.js's ShelfScreen)
//   shop.buyItem(id, ep, spot?, n = 1) → { ok, why, words }   (spot: { cId, x, y, rot }, a drop on a slot; without it
//     the first container with room, food to the barrel and bait to the bucket first; refused politely when nothing
//     has room or you are short)
//   shop.buy(id, ep) (the old call), shop.equip(id) (profile.use: the canoe, paddle, tent or filter in use)
//   shop.price(id, ep), shop.priceMul(ep), shop.outfitterProfile(ep), shop.keeperLine(ep, situation)
//   applyGear(profile, player) → player.gear
import { ITEMS } from './profile.js';
import { LURES, SPECIES } from './fishing.js';
import { save } from './save.js';
import { model, itemFor, itemDef, firstFit, acceptsKind, refresh } from './inv-ui.js';
import { LURE_TAKES } from './items.js'; // content C: the new lures' takes

const NS = 'shop';
export const SHEET_PRICE = 8;
const DOZEN = 12;
const STANDING_DEAL = 3;   // standing at which an outfitter's prices drop
const DEAL = 0.9;
const CAMP_REACH = 40;     // metres from your pitched tent within which the gravity bag keeps the bottle full

// The other streams' modules, when they are in the build (C: the outfitters' characters; D: the map sheets). Loaded
// lazily so this file builds and runs without them, and so nothing they import is read before it is ready.
const LATER = import.meta.glob(['./outfitters.js', './sheets.js']);

export const GEAR0 = Object.freeze({ cruise: 1, effort: 1, stability: 1, carry: 1, sleep: 0.85, sleepDry: false, snap: 1, saw: false, filter: 'tablets', camera: false, canoeKg: 34, foodRoom: 7,
  feel: 1, night: 1.3 }); // content C: feel scales the strike window after a take (the graphite rod), night what travel after dark costs (kit.js: the headlamp with you)

// Two more lures on the wall: the tackle the plan names as new. Each species reads a lure by its id, so every one of
// them gets a word for these two (fishing.js rateFor).
if (!LURES.some((l) => l.id === 'silverminnow')) {
  LURES.push(
    { id: 'silverminnow', name: 'Silver Minnow', short: 'Silver Minnow', sink: 0.45, run: 0.8, still: 0.2, slow: 1.05, fast: 0.95, colour: 0xc9ced2, weedless: true },
    { id: 'lazyike', name: 'Lazy Ike', short: 'Lazy Ike', sink: -0.3, run: 2.6, still: 0.15, slow: 1.15, fast: 0.8, colour: 0xd99a3a },
  );
  const add = { walleye: [0.5, 1.35], smallmouth: [0.85, 1.0], pike: [1.6, 0.9], laketrout: [0.3, 0.6], crappie: [0.3, 0.45], perch: [0.4, 0.45] };
  for (const [id, sp] of Object.entries(SPECIES)) { const [m, z] = add[id] || [0.5, 0.5]; sp.lures.silverminnow ??= m; sp.lures.lazyike ??= z; }
}
// content C: three more on the wall (a spinnerbait for the weed edges, the jig and minnow every walleye guide ties on, a
// topwater plug for the evening calm) and Eino's carved minnow (a keeper's arc, stream B). What each species thinks of
// them is items.js LURE_TAKES (the words the tooltips say), copied into each species' lures here.
for (const L of [
  { id: 'spinnerbait', name: 'Spinnerbait', short: 'spinnerbait', sink: 0.5, run: 1.2, still: 0.15, slow: 0.95, fast: 1.1, colour: 0xb8d03a, weedless: true },
  { id: 'jigminnow', name: 'Jig & minnow', short: 'jig & minnow', sink: 0.9, run: 'bottom', still: 0.8, slow: 1.05, fast: 0.45, colour: 0xd96a2a },
  { id: 'topwater', name: 'Topwater plug', short: 'topwater', sink: -0.6, run: 0.1, still: 0.5, slow: 1.2, fast: 0.7, colour: 0xe8e2d0 },
  { id: 'cedarminnow', name: 'Cedar minnow', short: 'cedar minnow', sink: -0.2, run: 1.6, still: 0.25, slow: 1.1, fast: 0.95, colour: 0x6f8a52, unique: true },
]) if (!LURES.some((l) => l.id === L.id)) LURES.push(L);
for (const [id, sp] of Object.entries(SPECIES)) for (const lure of ['spinnerbait', 'jigminnow', 'topwater', 'cedarminnow']) { const t = LURE_TAKES[lure]; sp.lures[lure] ??= t && Number.isFinite(t[id]) ? t[id] : 0.5; }
// the rod's lures as the keeper says them
const LURE_WORD = { jig: 'jig', spinner: 'Mepps', spoon: 'Daredevle', crankbait: 'Rapala', leech: 'leech', silverminnow: 'Silver Minnow', lazyike: 'Lazy Ike', spinnerbait: 'spinnerbait', jigminnow: 'jig and minnow', topwater: 'topwater plug', cedarminnow: 'cedar minnow' };
const lureWord = (def) => (def ? LURE_WORD[def.id] || lower(def.name) : 'lure');
// the profile's items that are the rod's lures, by fishing.js's lure id
export const LURE_ITEM = { jig: 'lure:jig', spinner: 'lure:mepps', spoon: 'lure:daredevle', crankbait: 'lure:rapala', leech: 'leeches', silverminnow: 'lure:silverminnow', lazyike: 'lure:lazyike', spinnerbait: 'lure:spinnerbait', jigminnow: 'lure:jigminnow', topwater: 'lure:topwater', cedarminnow: 'lure:cedarminnow' };

// What the season starts with and what was always there: in the kit, never on a shelf (and the old ids an old save
// still owns: their effects stay what they were)
const BASE = {
  aluminium: { id: 'aluminium', name: 'Aluminium canoe, 17 ft', kind: 'gear', price: 0, kg: 34, slot: 'canoe', hull: true, words: 'The old aluminium seventeen-footer. Dents and all, it floats.', effect: { canoeKg: 34 } },
  ash: { id: 'ash', name: 'Ash paddle', kind: 'gear', price: 0, kg: 1.1, slot: 'paddle', words: 'A plain ash beavertail. It gets you there.', effect: {} },
  rod: { id: 'rod', name: 'Spinning rod', kind: 'tackle', price: 0, kg: 0.4, words: 'A six-foot spinning rod.', effect: {} },
  pack: { id: 'pack', name: 'Duluth pack', kind: 'gear', price: 0, kg: 2, family: 'pack', words: 'Canvas and leather, room for a week of food.', effect: {} },
  pack2: { id: 'pack2', name: 'A second Duluth pack', kind: 'gear', price: 0, kg: 2, family: 'pack2', effect: {} },
  barrel: { id: 'barrel', name: 'Food barrel and harness', kind: 'food', price: 0, kg: 3, family: 'barrel', effect: {} },
  aframe: { id: 'aframe', name: 'A-frame tent', kind: 'gear', price: 0, kg: 3, slot: 'tent', words: 'Two poles and a fly. It sags when it rains.', effect: { sleep: 0.85 } },
};

export const CATALOG = [
  // --- the provisions shelf --------------------------------------------------------------------------------------
  { id: 'meal:breakfast', name: 'Oatmeal breakfast', shelf: 'food', price: 3, kg: 0.35, words: 'Oats, brown sugar and powdered milk in a bag. Boil the water and it’s breakfast.' },
  { id: 'meal:supper', name: 'Rice and lentil supper', shelf: 'food', price: 3, kg: 0.55, words: 'Rice, red lentils and a cube of stock, bagged for the trail. Twenty minutes on the grate.' },
  { id: 'meal:freeze', name: 'Freeze-dried supper', shelf: 'food', price: 5, kg: 0.2, words: 'Boil the water, pour it in, wait ten minutes. A hot supper on a night the wood is wet.' },
  { id: 'snack:trailmix', name: 'Trail mix', shelf: 'food', price: 2, kg: 0.25, words: 'Peanuts, raisins and the coloured chocolate. A handful between portages, standing still.' },
  { id: 'snack:jerky', name: 'Beef jerky', shelf: 'food', price: 3, kg: 0.15, words: 'Smoked out back. Chewy, salty, and it keeps forever. Eat it in the canoe when the wind lets you.' },
  { id: 'snack:chocolate', name: 'Chocolate bar', shelf: 'food', price: 1, kg: 0.1, words: 'Milk chocolate. It goes soft in the sun; eat it at the top of the portage.' },
  { id: 'barrel30', name: 'Blue barrel, 30 L', shelf: 'food', price: 25, kg: 2.2, words: 'A blue barrel on a harness. The food rides dry and sealed, and the bears can’t smell it.' },
  { id: 'barrel60', name: 'Blue barrel, 60 L', shelf: 'food', price: 35, kg: 3.0, words: 'The big blue barrel: two weeks of food. Heavy on the first portage, light on the last.' },
  { id: 'tablets', name: 'Purifying tablets', shelf: 'food', price: 2, kg: 0.05, slot: 'filter', words: 'A tablet in the bottle and half an hour’s wait. Cheap, and they always work.', effect: { filter: 'tablets' } },
  { id: 'pump', name: 'Pump filter', shelf: 'food', price: 35, kg: 0.4, slot: 'filter', words: 'Pump it full at the shore and drink it then and there. No waiting on a tablet.', effect: { filter: 'pump' } },
  { id: 'gravity', name: 'Gravity filter', shelf: 'food', price: 55, kg: 0.5, slot: 'filter', at: ['lodge', 'trout camp', 'river post'], words: 'Hang the bag in a tree at camp and the bottle fills itself while you see to the fire.', effect: { filter: 'gravity' } },
  // content C: more to eat and drink, the stove and its fuel
  { id: 'meal:pancakes', name: 'Pancake breakfast', shelf: 'food', price: 4, kg: 0.35, words: 'Mix, water, a hot pot lid. Syrup’s in the little bottle.' },
  { id: 'meal:chili', name: 'Chili mac', shelf: 'food', price: 6, kg: 0.22, words: 'Freeze-dried. Boil the water and it warms you right down to the feet.' },
  { id: 'meal:bannock', name: 'Bannock mix', shelf: 'food', price: 2, kg: 0.3, words: 'Flour, baking powder and lard. Fry it in the pot lid like the old guides did.' },
  { id: 'snack:sausage', name: 'Summer sausage', shelf: 'food', price: 4, kg: 0.35, words: 'Dry-cured. It keeps the whole trip and slices on a paddle blade.' },
  { id: 'snack:granola', name: 'Granola bars', shelf: 'food', price: 3, kg: 0.2, words: 'Four bars. One at the top of every portage.' },
  { id: 'snack:apricots', name: 'Dried apricots', shelf: 'food', price: 3, kg: 0.2, words: 'Dried fruit. Something that isn’t peanuts.' },
  { id: 'snack:tortilla', name: 'Tortillas & peanut butter', shelf: 'food', price: 4, kg: 0.45, words: 'Lunch without a fire: roll it up and eat it in the canoe.' },
  { id: 'coffee', name: 'Coffee bags', shelf: 'food', price: 4, kg: 0.12, words: 'Steep one in a cup of hot water. Mornings make more sense after.' },
  { id: 'cocoa', name: 'Hot cocoa', shelf: 'food', price: 3, kg: 0.15, words: 'For the cold evenings. A cup of it and you stop shivering.' },
  { id: 'stove', name: 'Canister stove', shelf: 'food', price: 35, kg: 0.12, words: 'Screws onto a gas canister. Supper in the rain, no fire needed.' },
  { id: 'fuel', name: 'Fuel canister', shelf: 'food', price: 6, kg: 0.36, words: 'Ten boils, near enough. The stove wants one.' },
  // --- the tackle shelf ------------------------------------------------------------------------------------------
  { id: 'leeches', name: 'A dozen leeches', shelf: 'tackle', price: 4, kg: 0.3, qty: 12, words: 'Fresh from the bait fridge, for the bobber rig. They want the bucket: a walleye can’t leave one alone.' },
  { id: 'bucket', name: 'Leech bucket', shelf: 'tackle', price: 6, kg: 0.6, words: 'A foam bucket with a lid. The leeches stay lively in it for days if you change the water.' },
  { id: 'tacklebox', name: 'Tackle box', shelf: 'tackle', price: 12, kg: 0.8, words: 'A green box with trays that fold out. The lures you own ride in here.' },
  { id: 'rodmh', name: 'Medium-heavy rod', shelf: 'tackle', price: 45, kg: 0.5, family: 'rod', words: 'A stiffer rod and heavier line. A big pike can make his run and you’ll still have him.', effect: { snap: 1.4 } },
  // content C: the graphite rod, the net, the knife
  { id: 'rodpro', name: 'Graphite rod', shelf: 'tackle', price: 85, kg: 0.35, family: 'rod', at: ['lodge', 'trout camp', 'bait shop'], words: 'Graphite and a reel with a drag like butter. You feel every tap down there.', effect: { snap: 1.8, feel: 1.35 } },
  { id: 'net', name: 'Landing net', shelf: 'tackle', price: 20, kg: 0.7, family: 'net', words: 'The big ones come off right at the gunwale. Not with this under them.' },
  { id: 'knife', name: 'Fillet knife', shelf: 'tackle', price: 14, kg: 0.15, words: 'Two fillets off a walleye in a minute, once you have the knack.' },
  // --- the lure wall ---------------------------------------------------------------------------------------------
  { id: 'lure:jig', name: 'Jig & twister tail', shelf: 'lure', price: 3, kg: 0.01, words: 'A lead head and a curly tail. Hop it along the bottom for walleye.' },
  { id: 'lure:mepps', name: 'Mepps spinner', shelf: 'lure', price: 6, kg: 0.01, words: 'The blade throws the light. Cast it along the weed edge and the bass come up for it.' },
  { id: 'lure:daredevle', name: 'Red-and-white Daredevle', shelf: 'lure', price: 7, kg: 0.02, words: 'The spoon every pike in the country knows. Let it flutter down off a drop-off.' },
  { id: 'lure:rapala', name: 'Jointed Rapala', shelf: 'lure', price: 12, kg: 0.02, words: 'A balsa minnow that swims deep on a steady crank. Trout and walleye both.' },
  { id: 'lure:silverminnow', name: 'Johnson Silver Minnow', shelf: 'lure', price: 8, kg: 0.02, words: 'A weedless spoon. Drag it right through the cabbage where the pike lie.' },
  { id: 'lure:lazyike', name: 'Lazy Ike', shelf: 'lure', price: 9, kg: 0.02, words: 'An old banana plug with a lazy wobble. Walleye in the dark-water lakes like it slow.' },
  // content C: three more
  { id: 'lure:spinnerbait', name: 'Spinnerbait', shelf: 'lure', price: 7, kg: 0.02, words: 'Run it over the cabbage. It comes through the weeds and the pike come out of them.' },
  { id: 'lure:jigminnow', name: 'Jig & minnow', shelf: 'lure', price: 4, kg: 0.01, words: 'A jig with a salted minnow on it. Every walleye guide on the border ties one on.' },
  { id: 'lure:topwater', name: 'Topwater plug', shelf: 'lure', price: 9, kg: 0.02, words: 'Walk it across a flat calm at dusk and hold on. The bass hit it like a dropped rock.' },
  // --- the gear shelf and the rafters ----------------------------------------------------------------------------
  { id: 'pack3', name: 'Duluth pack #3', shelf: 'gear', price: 25, kg: 2, words: 'Canvas and leather, the old #3: a week of food, or the tent and the cook kit. Two packs, two carries.' },
  { id: 'pack4', name: 'Duluth pack #4', shelf: 'gear', price: 35, kg: 2.6, words: 'The big #4. Everything goes in, and you’ll feel every bit of it on the long carries.' },
  { id: 'bentshaft', name: 'Bent-shaft laminate paddle', shelf: 'gear', price: 40, kg: 0.9, slot: 'paddle', words: 'A bent-shaft laminate: easier on the shoulders, a touch quicker.', effect: { cruise: 1.05, effort: 0.95 } },
  { id: 'carbon', name: 'Carbon bent-shaft paddle', shelf: 'gear', price: 110, kg: 0.5, slot: 'paddle', at: ['lodge', 'trout camp'], words: 'Carbon, bent at the throat and next to no weight. You’ll feel it by the second lake.', effect: { cruise: 1.09, effort: 0.9 } },
  { id: 'royalex', name: 'Royalex Prospector, 16 ft', shelf: 'gear', price: 160, kg: 29, slot: 'canoe', hull: true, at: ['lodge', 'river post'], words: 'Wide and forgiving. It shrugs off a beam sea, though it’s a little slower to push. On the rack outside.', effect: { canoeKg: 29, stability: 1.3, cruise: 0.97 } },
  { id: 'kevlar', name: 'Kevlar tripper, 17 ft', shelf: 'gear', price: 240, kg: 20, slot: 'canoe', hull: true, at: ['lodge', 'trout camp'], words: 'Light enough to carry one-handed down the dock, and she runs a little quicker. Up on the rafters.', effect: { canoeKg: 20, cruise: 1.04 } },
  { id: 'yokepads', name: 'Portage yoke pads', shelf: 'gear', price: 15, kg: 0.4, family: 'yoke', words: 'Foam pads for the yoke. The canoe sits easier on the neck over a long carry.', effect: { carry: 0.85 } },
  { id: 'dome', name: 'Dome tent', shelf: 'gear', price: 50, kg: 2.8, slot: 'tent', words: 'Stands up to the wind off the lake. You’ll sleep the whole night through.', effect: { sleep: 1 } },
  { id: 'fourseason', name: 'Four-season tent', shelf: 'gear', price: 95, kg: 3.6, slot: 'tent', at: ['lodge', 'trout camp'], words: 'A good night in any weather, and room in the vestibule to hang the wet things: dry by morning.', effect: { sleep: 1, sleepDry: true } },
  { id: 'pad', name: 'Foam pad', shelf: 'gear', price: 20, kg: 0.6, family: 'pad', words: 'Foam between you and the cold ground. A better night in any tent.', effect: { sleepAdd: 0.05 } },
  { id: 'saw', name: 'Folding saw', shelf: 'gear', price: 18, kg: 0.4, family: 'saw', words: 'For the dead and down wood. An armful in no time at all.', effect: { saw: true } },
  { id: 'camera', name: 'Camera, 35 mm', shelf: 'gear', price: 25, kg: 0.6, family: 'camera', words: 'A good little camera and a roll of film. The magazines pay for a sharp picture.', effect: { camera: true } },
  // content C: the bags, the pad, the headlamps, the waterproof pack, the weather and the bugs, a chair (what each does
  // with you is kit.js's: the bag on a cold night, the lamp after dark, the jacket in rain, the net at dusk)
  { id: 'bag3', name: 'Three-season bag', shelf: 'gear', price: 45, kg: 1.6, words: 'Good down to a hard frost, and still warm if it gets damp.' },
  { id: 'bagdown', name: 'Down bag', shelf: 'gear', price: 95, kg: 0.95, at: ['lodge', 'trout camp'], words: 'Goose down: light, small, warm as toast. Keep it dry, mind.' },
  { id: 'padair', name: 'Self-inflating pad', shelf: 'gear', price: 50, kg: 0.9, family: 'pad', at: ['lodge', 'trout camp', 'river post'], words: 'Open the valve and it blows itself up. The ground stops stealing your heat.', effect: { sleepAdd: 0.1 } },
  { id: 'headlamp2', name: 'LED headlamp', shelf: 'gear', price: 15, kg: 0.08, words: 'Brighter than the one on your cap, and the batteries last.' },
  { id: 'headlamp3', name: 'Rechargeable headlamp', shelf: 'gear', price: 35, kg: 0.11, at: ['lodge', 'river post'], words: 'Lights the far shore. You can paddle by it if you must.' },
  { id: 'packdry', name: 'Portage pack', shelf: 'gear', price: 55, kg: 1.5, at: ['lodge', 'river post'], words: 'Roll the top three times and clip it: tip over and your bag stays dry.' },
  { id: 'rainjacket', name: 'Rain jacket', shelf: 'gear', price: 30, kg: 0.45, words: 'It’ll rain. It always does. This keeps you dry under it.' },
  { id: 'headnet', name: 'Head net', shelf: 'gear', price: 5, kg: 0.04, words: 'Five dollars against the June mosquitoes. Best money you’ll spend.' },
  { id: 'chair', name: 'Canoe chair', shelf: 'gear', price: 25, kg: 0.7, words: 'Folds flat in the pack, opens into a seat with a back. Your back thanks you by the fire.' },
  // --- the map table ---------------------------------------------------------------------------------------------
  // the map sheets of each outfitter's country (sheets.js stockFor, added in stock()); no map case since fb2 D: a sheet
  // bought is yours for the season (profile.ownSheet), not a thing in a pack
  // --- at the counter -------------------------------------------------------------------------------------------
  { id: 'bunk', name: 'A night in the bunkhouse', shelf: 'counter', price: 8, kg: 0, use: 'bunk', words: 'A real bed, soup on the stove and breakfast in the morning.' },
];
for (const it of CATALOG) it.kind = it.shelf; // the old field, for whatever still reads it
const BY_ID = new Map(CATALOG.map((it) => [it.id, it]));
// the shelves in the store, by the hotspot that opens each (props.js storeLayout: shelves[].kind, wall, mapTable)
export const SHELVES = [
  { kind: 'food', name: 'Groceries', where: 'The provisions shelf', sub: 'meals, snacks, the barrels and the water' },
  { kind: 'tackle', name: 'Tackle & bait', where: 'The tackle shelf', sub: 'the rod, the leeches and their bucket, the tackle box' },
  { kind: 'gear', name: 'Camp gear', where: 'The gear shelf', sub: 'packs, paddles, canoes, tents and the rest' },
  { kind: 'lure', name: 'The lure wall', where: 'The pegboard', sub: 'what is in your tackle box is what the rod can tie on' },
  { kind: 'map', name: 'The map table', where: 'Fisher map sheets', sub: 'every campsite, every portage in rods, and the soundings' },
];

// Register the catalogue with the profile's items (profile.js ITEMS: the label, the slot, a note), so the kit, the
// journal's Gear tab and profile.use know them. What the profile already has keeps its own label.
function register(it) {
  const have = ITEMS[it.id];
  if (have) { if (it.slot && !have.slot) have.slot = it.slot; return; }
  const e = it.effect || {};
  ITEMS[it.id] = { label: it.name, ...(it.slot ? { slot: it.slot } : {}), ...(Number.isFinite(e.sleep) ? { sleep: e.sleep } : {}), note: it.note || shortWords(it) };
}
const NOTE = { bentshaft: 'easier on the shoulders, a touch quicker', carbon: 'light and quick', royalex: 'steady in a sea', kevlar: '20 kg on the portages', pack2: 'room for more food; two carries',
  barrel: 'two weeks of food', yokepads: 'an easier carry', dome: 'a whole night’s sleep', fourseason: 'sleeps well; dries the gear', pad: 'a better night', pump: 'drinkable at once', gravity: 'fills itself at camp',
  rod: 'the line holds longer', saw: 'firewood in no time', camera: 'for the photo notices', 'lure:silverminnow': 'weedless', 'lure:lazyike': 'walleye, slow',
  rodpro: 'feels every tap', bag3: 'good to −4 °C', bagdown: 'good to −9 °C', padair: 'a warmer night', headlamp2: 'a 40 m beam', headlamp3: 'a 55 m beam', packdry: 'stays dry', rainjacket: 'dry in the rain', headnet: 'keeps the bugs off', stove: 'supper without a fire' }; // (content C)
function shortWords(it) { return NOTE[it.id] || ''; }
for (const it of [...Object.values(BASE), ...CATALOG]) if (!it.use) register(it);
// the catalogue's things as items (inv-ui.js: the stand-in's, or stream A's)
for (const it of CATALOG) if (!it.use && !it.hull) itemFor(it);

// --- what the gear does ---------------------------------------------------------------------------------------------
// the better way for each field that stacks across families, and is the best of one within it
const BETTER = { cruise: 'max', stability: 'max', snap: 'max', effort: 'min', carry: 'min', sleepAdd: 'max', feel: 'max' }; // (content C: feel, the graphite rod's)
const MULT = ['cruise', 'effort', 'stability', 'carry', 'snap', 'feel'];
let signatures = null;   // stream C's SIGNATURES (id → item), once its module is in
export function itemOf(id) {
  return BY_ID.get(id) || BASE[id] || (signatures && signatures[id]) || null;
}
// player.gear from what is owned and in use: the slot items in use (a spare on the rack does nothing), every other
// owned item, one per family (the best value of each field), multiplied across families; sleep is the tent's quality
// plus the pads and blankets, never past 1; the food room is the packs' and the barrel's.
export function applyGear(profile, player) {
  const g = { ...GEAR0 };
  if (profile) {
    const kit = profile.kit, fam = new Map();
    for (const id of new Set(profile.owned)) {
      const it = itemOf(id); if (!it) continue;
      if (it.slot && kit[it.slot] !== id) continue;
      const e = it.effect || {};
      if (it.slot === 'canoe' && Number.isFinite(e.canoeKg)) g.canoeKg = e.canoeKg;
      if (it.slot === 'tent' && Number.isFinite(e.sleep)) g.sleep = e.sleep;
      if (it.slot === 'filter' && e.filter) g.filter = e.filter;
      if (e.sleepDry) g.sleepDry = true;
      if (e.saw) g.saw = true;
      if (e.camera) g.camera = true;
      const f = it.family || it.slot || id, best = fam.get(f) || {};
      for (const k in BETTER) if (Number.isFinite(e[k])) best[k] = best[k] === undefined ? e[k] : BETTER[k] === 'max' ? Math.max(best[k], e[k]) : Math.min(best[k], e[k]);
      fam.set(f, best);
    }
    let add = 0;
    for (const best of fam.values()) { for (const k of MULT) if (best[k] !== undefined) g[k] *= best[k]; if (best.sleepAdd) add += best.sleepAdd; }
    g.sleep = Math.min(1, g.sleep + add);
    g.foodRoom = (profile.has('barrel') ? 14 : 7) + (profile.has('pack2') ? 10 : 0);
    for (const k of MULT) g[k] = +g[k].toFixed(4);
  }
  if (player) player.gear = g;
  return g;
}

// --- the shop -------------------------------------------------------------------------------------------------------
export class Shop {
  // world, player, profile (profile.js), energy, fishing, day, hud, camp (camp.js); outfitter (outfitter.js) sets itself
  constructor({ world, player, profile, energy = null, fishing = null, day = null, hud = null, camp = null }) {
    this.world = world; this.player = player; this.profile = profile; this.energy = energy; this.fishing = fishing; this.day = day; this.hud = hud; this.camp = camp;
    this.outfitter = null;
    this.C = null; this.D = null; // stream C's outfitters.js and stream D's sheets.js, when they are in
    this.cache = new Map();       // ep → the outfitter's profile (C's, or the plain one)
    const s = save.read(NS);
    this.s = { v: 1, leeches: DOZEN, ...(s && s.v === 1 ? s : {}) };
    this.lastLure = 0; this.gravityAt = -1e9; this.fishSeen = fishing ? fishing.log.length : 0;
    if (fishing) fishing.onSnap = (def, fish) => this.onSnap(def, fish);
    if (profile) profile.onChange((what) => { if (what === 'season') this.newSeason(); this.apply(); });
    this.apply();
    for (const [path, load] of Object.entries(LATER)) {
      load().then((m) => {
        if (path.includes('outfitters')) { this.C = m; signatures = m.SIGNATURES || null; if (signatures) for (const it of Object.values(signatures)) register(it); this.cache.clear(); }
        else { this.D = m; if (Array.isArray(m.SHEETS) && typeof m.sheetItem === 'function') for (const sh of m.SHEETS) { const it = m.sheetItem(sh.id); if (it) { register(it); itemFor(it); } } }
        this.apply();
        if (this.outfitter && this.outfitter.open) this.outfitter.render();
      }, (e) => console.warn('shop: could not load', path, e));
    }
  }
  write() { save.write(NS, this.s); }
  newSeason() { this.s = { v: 1, leeches: DOZEN }; this.write(); }
  // (and whenever money changes hands the inventory is written with it: a thing bought is in the save as soon as the
  // dollars are gone from it, not up to 6 s of play later, so a reload or a closed tab never keeps one without the other)
  apply() { const inv = this.inv; if (inv && inv.attached && inv.dirty && typeof inv.write === 'function') inv.write(); return applyGear(this.profile, this.player); }
  get gear() { return this.player.gear || this.apply(); }
  get money() { return this.profile ? this.profile.money : 0; }
  // the inventory (stream A's, or inv-ui.js's stand-in) once it holds the things; the old counts before
  get inv() { const m = model(); return m && !m.stub ? m : null; }
  // the leeches and the lures are counted in the inventory (stream A's bridge to the old count steps aside)
  get usesInventory() { return !!this.inv; }
  get suppers() { const inv = this.inv; return inv ? inv.count('meal:freeze', { reachable: false }) : 0; }
  get leeches() {
    const inv = this.inv;
    if (inv) return inv.count('leeches', { reachable: false });
    return this.profile && this.profile.has('leeches') ? Math.max(0, Math.min(DOZEN, this.s.leeches ?? DOZEN)) : 0;
  }
  // one leech used (a fish on the bobber, a snapped line): out of the bucket in reach
  useLeech() {
    const inv = this.inv;
    if (inv) { const f = typeof inv.find === 'function' ? inv.find('leeches', { reachable: true }) : []; if (f && f[0]) inv.take(f[0].c.id, f[0].e.uid, 1); return; }
    this.s.leeches = Math.max(0, this.leeches - 1); if (!this.s.leeches) drop(this.profile, 'leeches'); this.write();
  }

  // --- the outfitter's character (stream C), or a plain one -----------------------------------------------------
  landing(ep) { const o = this.outfitter; return o ? o.landing(Number(ep)) : null; }
  outfitterProfile(ep) {
    const n = Number(ep);
    if (this.cache.has(n)) return this.cache.get(n);
    let op = null;
    const C = this.C;
    if (C && typeof C.outfitterProfile === 'function') { try { op = C.outfitterProfile(n, this.world); } catch (e) { console.warn('shop: outfitterProfile', n, e); } }
    if (!op) { const l = this.landing(n); op = { ep: n, name: l ? l.name : `Entry point ${n}`, kind: null, keeper: null, priceMul: 1, signature: null }; }
    this.cache.set(n, op);
    return op;
  }
  // the keeper's words for a moment ('welcome', 'stranger', 'season', 'passing', 'morning', 'after', 'bunk', 'hello',
  // 'goodbye', 'chat', 'ride'), or null for the counter's own lines
  keeperLine(ep, situation) {
    const C = this.C; if (!C || typeof C.keeperLine !== 'function') return null;
    const rep = this.profile && ep != null ? this.profile.outfitter(ep).rep : 0, doy = this.day ? this.day.doy : undefined, hours = this.day ? this.day.hours : undefined;
    try { return C.keeperLine(this.outfitterProfile(ep), situation, { rep, doy, hours }) || null; } catch { return null; }
  }
  keeperName(ep) { const op = this.outfitterProfile(ep), k = op && op.keeper; return k && k.name ? k.name : null; }
  // the outfitter's signature item, sold only there, on the shelf it belongs on (and an item you can carry)
  signature(ep) {
    const C = this.C, op = this.outfitterProfile(ep);
    let it = null;
    if (C && typeof C.signatureItem === 'function') { try { it = C.signatureItem(Number(ep), this.world); } catch { it = null; } }
    if (!it && op && op.signature && signatures) it = signatures[op.signature] || null;
    if (!it) return null;
    if (!ITEMS[it.id]) register(it);
    itemFor(it);
    const shelf = it.lure || it.family === 'spoon' ? 'lure' : it.family === 'net' || it.family === 'leaders' ? 'tackle' : 'gear';
    return { ...it, kind: shelf, shelf, signature: true };
  }

  // --- prices ---------------------------------------------------------------------------------------------------
  priceMul(ep) {
    const op = this.outfitterProfile(ep), m = op && Number.isFinite(op.priceMul) ? op.priceMul : 1;
    const rep = this.profile && ep != null ? this.profile.outfitter(ep).rep : 0;
    return m * (rep >= STANDING_DEAL ? DEAL : 1);
  }
  // Sandbox has no limits: the shelves are free there, as its food and its rides are
  get free() { const o = this.outfitter, t = o && o.core; return !!(t && t.sandbox); }
  priceOf(it, ep) { return it.price > 0 && !this.free ? Math.max(1, Math.round(it.price * this.priceMul(ep))) : 0; }
  price(id, ep) {
    if (String(id).startsWith('sheet:')) return this.free ? 0 : Math.max(1, Math.round(SHEET_PRICE * this.priceMul(ep)));
    const it = itemOf(id) || (this.signature(ep) && this.signature(ep).id === id ? this.signature(ep) : null);
    return it ? this.priceOf(it, ep) : 0;
  }

  // --- the stock ------------------------------------------------------------------------------------------------
  // what an outfitter has, priced there: the catalogue, its signature item and the map sheets of its own country, each
  // with whether you can afford it, and for the things you only ever want one of (a canoe, a map sheet, the signature)
  // whether you own it already and have it in use
  stock(ep) {
    const pr = this.profile, kit = pr ? pr.kit : {}, money = this.money;
    const out = [];
    const add = (it) => {
      const price = this.priceOf(it, ep);
      const one = !!(it.hull || it.signature || it.shelf === 'map' && it.id !== 'mapcase');
      const owned = !it.use && one && !!(pr && pr.has(it.id));
      out.push({ ...it, price, owned, inUse: !!(owned && it.slot && kit[it.slot] === it.id), afford: price <= money });
    };
    // content C: the stock follows the outfitter (it.at: the kinds that carry it; none: every counter). The lodges carry
    // everything, a trout camp the light kit and the cold-water tackle, a river post the river gear, a bait shop the
    // basics and the rods; Sandbox's shelves have it all
    const kind = this.free ? null : (this.outfitterProfile(ep) || {}).kind || null;
    for (const it of CATALOG) if (!kind || !it.at || it.at.includes(kind) || (pr && pr.has(it.id) && it.hull)) add(it);
    const sig = this.signature(ep);
    if (sig) add(sig);
    for (const s of this.sheetsFor(ep)) add({ ...s, shelf: 'map' });
    return out;
  }
  // what stands on one shelf ('food', 'tackle', 'gear', 'lure', 'map'), for the shelf's screen (inv-ui.js)
  shelfStock(shelf, ep) { return this.stock(ep).filter((it) => it.shelf === shelf && !it.use); }
  // the map sheets an outfitter stocks: the sheet its landing is on, and the sheets around it (stream D's sheets.js)
  sheetsFor(ep) {
    const D = this.D, l = this.landing(ep);
    if (!D || !l) return [];
    if (typeof D.stockFor === 'function' && typeof D.sheetItem === 'function') { // D's own stock: the landing's sheet, then its neighbours within reach
      let list = [];
      try { list = D.stockFor({ x: l.x, z: l.z, lake: l.lake }) || []; } catch { list = []; }
      return list.map((s, i) => { const it = D.sheetItem(s.id || s); if (it) itemFor(it); return it ? { ...it, kind: 'map', here: i === 0 } : null; }).filter(Boolean);
    }
    if (typeof D.sheetAt !== 'function') return [];
    const home = D.sheetAt(l.x, l.z); if (!home) return [];
    const all = Array.isArray(D.SHEETS) ? D.SHEETS : D.SHEETS && typeof D.SHEETS === 'object' ? Object.values(D.SHEETS) : [];
    const idOf = (s) => (s && (s.id ?? s.no ?? s.key)), found = new Map([[String(idOf(home)), home]]);
    if (typeof D.neighbours === 'function') { for (const s of D.neighbours(idOf(home)) || []) { const t = typeof s === 'object' ? s : all.find((q) => String(idOf(q)) === String(s)); if (t) found.set(String(idOf(t)), t); } }
    else {
      const b = boundsOf(home);
      if (b) for (const s of all) { const q = boundsOf(s); if (q && q.x0 <= b.x1 + 1 && q.x1 >= b.x0 - 1 && q.z0 <= b.z1 + 1 && q.z1 >= b.z0 - 1) found.set(String(idOf(s)), s); }
      else for (const r of [9000, 18000]) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, s = D.sheetAt(l.x + Math.cos(a) * r, l.z + Math.sin(a) * r); if (s) found.set(String(idOf(s)), s); }
    }
    return [...found.values()].map((s) => {
      const id = String(idOf(s)), own = idOf(s) === idOf(home);
      const it = { id: `sheet:${id}`, sheet: id, name: s.name || s.title || `Sheet ${id}`, kind: 'map', price: SHEET_PRICE, kg: 0.05, here: own,
        words: own ? 'The sheet this landing is on: every campsite, every portage in rods, and the depths.' : 'The country next door: its campsites, its portages in rods, and the depths.' };
      itemFor(it);
      return it;
    });
  }

  // --- buying -------------------------------------------------------------------------------------------------------
  // the containers a thing goes to first when it is bought without a slot: food to the barrels, then the packs; bait
  // to the bucket; lures to the tackle box; a sheet to the map case; anything else to the packs before the pockets
  prefer(id) {
    const inv = model(), d = itemDef(id), k = d ? d.kind : '', list = (inv.reachable ? inv.reachable(this.player) : inv.containers) || [];
    const score = (c) => {
      const it = String(c.item || '');
      if (k === 'bait') return it === 'bucket' ? 0 : 9;
      if (k === 'lure') return it === 'tacklebox' ? 0 : /pack/.test(it) ? 2 : 9;
      if (k === 'map') return it === 'mapcase' ? 0 : /pack/.test(it) ? 2 : 9;
      if (k === 'meal' || k === 'snack' || k === 'food' || k === 'fish') return /barrel/.test(it) ? 0 : /pack/.test(it) ? 1 : it === 'pockets' ? (k === 'snack' ? 1.5 : 5) : 9;
      return /pack/.test(it) ? 0 : /barrel/.test(it) ? 3 : it === 'pockets' ? 4 : 9;
    };
    return list.filter((c) => c.where !== 'in' || /tacklebox|mapcase/.test(c.item)).filter((c) => acceptsKind(c, d)).sort((a, b) => score(a) - score(b) || (a.where === 'stash') - (b.where === 'stash')).map((c) => c.id);
  }
  // Buy n of a thing at an outfitter: into the slot it was dropped on (spot), else the first container with room.
  // Refused when it is not stocked here, when it is a canoe or a sheet you own, when you are short, or when nothing
  // you have can take it. A canoe goes on the rack (in use), a paddle or a rod with your things, a pack, a barrel, a
  // bucket, a tackle box or a map case is a container of its own; the rest go in. { ok, why, words, cId }
  buyItem(id, ep, spot = null, n = 1) {
    const pr = this.profile; if (!pr) return { ok: false, why: 'stock', words: 'Nothing to buy with.' };
    const it = this.stock(ep).find((s) => s.id === id);
    if (!it) return { ok: false, why: 'stock', words: 'Not on these shelves.' };
    if (it.use) return { ok: false, why: 'counter', words: 'Ask at the counter.' };
    if (it.owned) return { ok: false, why: 'owned', words: `You have ${lowerA(it.name)} already.` };
    if (/^sheet:/.test(it.id)) { // fb2 D: a sheet is yours for the season, a profile entry and not a thing in a pack
      if (!pr.spend(it.price, `${it.name}${this.landing(ep) ? ` at ${this.landing(ep).name}` : ''}`)) return { ok: false, why: 'short', words: `Not enough in hand: the sheet is $${it.price}, and you have $${pr.money}.` };
      pr.ownSheet(it.id); refresh();
      return { ok: true, sheet: it.sheet, words: `${it.name}${it.price ? `, $${it.price}` : ''}: yours now, on your map whenever you press M. $${pr.money} in hand.` };
    }
    n = Math.max(1, Math.floor(n));
    const cost = it.price * n, where = this.landing(ep), at = where ? ` at ${where.name}` : '';
    if (cost > pr.money) return { ok: false, why: 'short', words: `Not enough in hand: ${n > 1 ? `${n} for $${cost}` : `${lowerA(it.name)} is $${cost}`}, and you have $${pr.money}.` };
    const paid = (k) => (it.price ? `, $${it.price * k}` : '');
    const inv = model(), d = it.hull ? null : itemFor(it);
    if (it.hull) { // the canoe: on the rack by the dock, in use
      if (!pr.spend(cost, `${it.name}${at}`)) return { ok: false, why: 'short', words: 'Not enough in hand.' };
      pr.give(it.id); pr.use('canoe', it.id); this.apply(); refresh();
      return { ok: true, words: `${it.name}${paid(1)}: she’s on the rack by the dock, and yours to paddle. $${pr.money} in hand.` };
    }
    if (d && d.kind === 'long') {
      for (let i = 0; i < n; i++) { if (typeof inv.addLong === 'function') inv.addLong(it.id, inv.atStash || inv.stub ? 'stash' : 'canoe'); else pr.give(it.id); }
      pr.spend(cost, `${it.name}${at}`);
      if (it.slot) pr.use(it.slot, it.id);
      this.apply(); refresh();
      return { ok: true, words: `${it.name}${paid(n)}: with your things${it.slot ? ', and the one you’ll use' : ''}. $${pr.money} in hand.` };
    }
    if (d && d.kind === 'container') {
      let made = null;
      for (let i = 0; i < n; i++) made = inv.addContainer(it.id, 'stash');
      pr.spend(cost, `${it.name}${at}`); this.apply(); refresh();
      return { ok: true, cId: made && made.id, words: `${it.name}${paid(n)}: it’s with your things. Fill it, then carry it out. $${pr.money} in hand.` };
    }
    // a thing that goes in: where it was dropped, else where there is room, one at a time
    const qty = it.qty || 1, into = new Map();
    let got = 0;
    for (let i = 0; i < n; i++) {
      let cId = null;
      if (spot && i === 0) { if (inv.put(spot.cId, it.id, { x: spot.x, y: spot.y, rot: spot.rot || 0, qty })) cId = spot.cId; }
      else if (this.room(it.id, qty) >= qty) {
        const r = typeof inv.place === 'function' ? inv.place(it.id, qty, { prefer: this.prefer(it.id) }) : null;
        if (r && r.ok && (r.placed == null || r.placed >= qty)) cId = r.cId;
        else if (r && r.placed > 0 && r.cId) { inv.take(r.cId, r.uid, r.placed); }
      }
      if (!cId) break;
      got++; into.set(cId, (into.get(cId) || 0) + 1);
    }
    if (!got) {
      const name = lowerA(it.name);
      return { ok: false, why: 'room', words: spot ? `${cap(name)} won’t go there.` : `No room for ${name} in anything you have. Make some room, or a bigger pack or barrel is on the shelves.` };
    }
    pr.spend(it.price * got, `${got > 1 ? `${got} × ` : ''}${it.name}${at}`);
    if (it.slot && !(pr.kit && pr.kit[it.slot] && better(pr.kit[it.slot], it.id))) pr.use(it.slot, it.id);
    this.apply(); refresh();
    const cs = [...into.keys()].map((c) => containerWord(inv, c));
    const what = got > 1 ? `${got} × ${lowerName(it.name)}` : it.name;
    return { ok: true, cId: [...into.keys()][0], words: `${cap(what)}${paid(got)}, into the ${cs.join(' and the ')}.${got < n ? ' No room for more.' : ''} $${pr.money} in hand.` };
  }
  // how many of a thing your reachable containers could take now (stacks with room, then free spots)
  room(id, want = 1) {
    const inv = model(), d = itemDef(id); if (!d) return 0;
    let n = 0;
    for (const cid of this.prefer(id)) {
      const c = (inv.reachable ? inv.reachable(this.player) : inv.containers).find((k) => k.id === cid); if (!c) continue;
      const st = d.stack || 1;
      if (st > 1) for (const e of c.grid || []) if (e.id === id) n += Math.max(0, st - (e.qty || 1));
      const probe = { ...c, grid: (c.grid || []).slice() };
      for (let k = 0; k < 40 && n < want; k++) { const f = firstFit(probe, id, st, { merge: false }); if (!f) break; probe.grid.push({ uid: `probe${k}`, id, x: f.x, y: f.y, rot: f.rot, qty: st }); n += st; }
      if (n >= want) return n;
    }
    return n;
  }
  // the old call (the counter's map sheets, the visitors): one, wherever there is room
  buy(id, ep) { return this.buyItem(id, ep, null, 1); }
  // put an owned canoe, paddle, tent or filter into use (and the one it replaces back on the rack)
  equip(id) {
    const pr = this.profile, it = itemOf(id); if (!pr || !it || !it.slot) return false;
    const ok = pr.use(it.slot, id);
    this.apply();
    return ok;
  }

  // --- the tackle box -----------------------------------------------------------------------------------------------
  // the lure ids (fishing.js) you can tie on now: in reach (stream A's hasLure), else the lures you own
  box() {
    const pr = this.profile, out = new Set(), inv = this.inv;
    if (inv && typeof inv.hasLure === 'function') { for (const l of LURES) if (inv.hasLure(l.id)) out.add(l.id); return out; }
    if (!pr) { for (const l of LURES) out.add(l.id); return out; }
    for (const [lure, item] of Object.entries(LURE_ITEM)) if (pr.has(item) && (lure !== 'leech' || this.leeches > 0)) out.add(lure);
    for (const id of pr.owned) { const it = itemOf(id); if (it && it.lure) out.add(it.lure); }
    return out;
  }
  hasLure(i) { const l = LURES[i]; return !!l && this.box().has(l.id); }
  // the rod's lure id (fishing.js) an item is, or null: 'lure:mepps' → 'spinner'
  lureOf(itemId) { for (const [lure, item] of Object.entries(LURE_ITEM)) if (item === itemId && lure !== 'leech') return lure; const it = itemOf(itemId); return it && it.lure ? it.lure : null; }
  tieOn(lureId) {
    const f = this.fishing; if (!f || !lureId) return;
    const k = LURES.findIndex((l) => l.id === lureId);
    if (k >= 0 && (f.state === 'stowed' || f.state === 'ready')) { f.lureIndex = k; this.lastLure = k; }
  }
  // Fishing.js's hook when a line parts: the fish kept the lure, so it leaves its container (and the rod ties on the
  // next one in reach). The last jig is never lost: there is always a spare in the bottom of the box. On the bobber
  // rig it is one leech.
  onSnap(def, fish) {
    const f = this.fishing, pr = this.profile; if (!f || !pr || !def) return;
    const name = fish && SPECIES[fish.species] ? SPECIES[fish.species].name.toLowerCase() : 'fish';
    let words;
    if (def.id === 'leech') {
      this.useLeech();
      words = `The line parted. The ${name} took the leech${this.leeches ? `: ${this.leeches} left in the bucket` : ', the last one'}.`;
    } else if (def.unique) { // content C: a one-of-a-kind lure (Eino's carved minnow) comes back: cedar floats
      words = `The line parted at the knot. The ${lureWord(def)} bobs up beside the canoe, and you have it back.`;
    } else {
      const item = LURE_ITEM[def.id], sig = pr.owned.find((id) => { const it = itemOf(id); return it && it.lure === def.id; });
      const others = [...this.box()].filter((l) => l !== def.id && l !== 'leech');
      if (def.id === 'jig' && !others.length && !sig) words = `The line parted and the ${name} kept the jig. There is a spare in the bottom of the box.`;
      else {
        const inv = this.inv, lose = item && pr.has(item) ? item : sig;
        if (inv && lose) { const hit = typeof inv.find === 'function' ? inv.find(lose, { reachable: true }) : []; if (hit && hit[0]) inv.take(hit[0].c.id, hit[0].e.uid, 1); else if (typeof pr.take === 'function') pr.take(lose); }
        else if (lose) drop(pr, lose);
        const left = this.box().has(def.id);
        words = `The line parted. The ${name} kept the ${lureWord(def)}${left ? '; you tie on the other one' : ': there are more on any outfitter’s lure wall'}.`;
      }
    }
    if (!this.box().has(def.id)) this.nextLure();
    f.message = { text: words, t: 5 };
    this.apply();
  }
  nextLure() {
    const f = this.fishing; if (!f) return;
    const box = this.box();
    for (let i = 0; i < LURES.length; i++) { const k = (f.lureIndex + i) % LURES.length; if (box.has(LURES[k].id)) { f.lureIndex = k; this.lastLure = k; return; } }
    f.lureIndex = 0; this.lastLure = 0;
  }

  // --- each frame ---------------------------------------------------------------------------------------------------
  // after fishing.update, before the HUD: a lure tied on that is not in reach goes back (and says why); the lure strip
  // quiets what is not in reach; a leech goes with each fish caught on the bobber; the gravity bag keeps the bottle full
  // at a pitched camp (the lure strip lists only the lures you have: stream G's fishing.js)
  update() {
    const f = this.fishing, pr = this.profile;
    if (f && pr) {
      const box = this.box();
      if (!box.has(LURES[f.lureIndex] && LURES[f.lureIndex].id)) {
        const want = LURES[f.lureIndex];
        if (f.lureIndex !== this.lastLure && box.has(LURES[this.lastLure] && LURES[this.lastLure].id)) {
          f.lureIndex = this.lastLure;
          f.message = { text: want && want.id === 'leech' ? 'No leeches in reach. The tackle shelf at any outfitter has them, and a bucket.' : `No ${lureWord(want)} in the tackle box. The lure wall at any outfitter has them.`, t: 2.4 };
        } else this.nextLure();
      } else this.lastLure = f.lureIndex;
      // the catch on the bobber: a leech gone
      const n = f.log.length;
      if (n > this.fishSeen) {
        for (let i = this.fishSeen; i < n; i++) if (f.log[i] && /leech/i.test(f.log[i].lure || '') && this.leeches > 0) this.useLeech();
        this.fishSeen = n;
      } else if (n < this.fishSeen) this.fishSeen = n;
    }
    const e = this.energy, c = this.camp && this.camp.camp, p = this.player;
    // (content C: the bag must be at the camp, set out or in a pack there: inventory.campReach, not just owned)
    const k = this.kit, bagHere = k && typeof k.inCamp === 'function' ? k.inCamp('gravity') : this.gear.filter === 'gravity';
    if (e && c && bagHere && e.live && Math.hypot(c.x - p.x, c.z - p.z) < CAMP_REACH && e.bottle < 1.9) {
      const now = e.now;
      if (now - this.gravityAt > 0.5) { this.gravityAt = now; if (e.fill(2, 0) > 0.05 && this.hud) this.hud.note('The gravity bag in the spruce has filled the bottle.', 4); }
    }
  }
}

const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
// "A dozen leeches" → "a dozen leeches"; "Trail mix" → "trail mix"; a name with a capital past the first word keeps it
const lowerName = (s) => (/^[A-Z][a-z]+ [A-Z]/.test(s) ? s : lower(s));
const lowerA = (s) => { const t = lowerName(s); return /^(a|an|the) /i.test(t) ? t : `${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t}`; };
// the container a thing went into, as words ("barrel", "Duluth pack")
const CWORD = { pack3: 'Duluth pack', pack4: 'big Duluth pack', barrel30: 'barrel', barrel60: 'big barrel', bucket: 'leech bucket', tacklebox: 'tackle box', pockets: 'pockets', mapcase: 'map case', stringer: 'stringer', crate: 'outfitters’ crate', packdry: 'portage pack' };
function containerWord(inv, cId) {
  const c = (inv.containers || []).find((k) => k.id === cId) || (inv.reachable ? inv.reachable().find((k) => k.id === cId) : null);
  const d = c ? itemDef(c.item) : null;
  return c && CWORD[c.item] ? CWORD[c.item] : d ? lowerName(d.name).replace(/^(a|an|the) /i, '') : 'pack';
}
// is the tent or filter in use already a better one than the one just bought (a spare goes in the pack, the use stays)
const RANK = { aframe: 0, dome: 1, fourseason: 2, tablets: 0, pump: 1, gravity: 2 };
const better = (have, got) => (RANK[have] ?? -1) > (RANK[got] ?? -1);
// the profile has give but no take: a lure lost takes it out of what is owned (profile.take when it has one, else
// the profile's own document, then its change and save)
function drop(pr, id) {
  if (pr && typeof pr.take === 'function') { pr.take(id); return; }
  const o = pr && pr.s && pr.s.owned; if (!Array.isArray(o)) return;
  const i = o.indexOf(id); if (i < 0) return;
  o.splice(i, 1);
  if (typeof pr.changed === 'function') pr.changed('gear'); else if (typeof pr.write === 'function') pr.write();
}
function boundsOf(s) {
  if (!s) return null;
  if ([s.x0, s.x1, s.z0, s.z1].every(Number.isFinite)) return { x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), z0: Math.min(s.z0, s.z1), z1: Math.max(s.z0, s.z1) };
  const b = s.bounds || s.bbox;
  if (Array.isArray(b) && b.length === 4) return { x0: b[0], z0: b[1], x1: b[2], z1: b[3] };
  if (b && [b.x0, b.x1, b.z0, b.z1].every(Number.isFinite)) return b;
  if (b && [b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite)) return { x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ };
  return null;
}
