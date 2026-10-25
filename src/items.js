// Items (the owner's feedback of 2026-10-24, stream A): everything you own is an item, in a container (a Duluth
// pack, a blue food barrel, the leech bucket, the tackle box, your pockets, the stringer) or a long item you hold or
// lay down (the rod, the paddle). This is the registry; inventory.js keeps where each one is, and inv-ui.js (stream B)
// draws them on a Tarkov-style grid. Nothing here imports anything, so any module may read it at load.
//
//   ITEMS[id] = { id, name, kind, w, h, kg, stack, price, eat?: { food, lift?, cook, hot? }, icon,
//                 container?: { cols, rows, accepts?: [kinds], one? }, wear?: ['back', 'chest'], hand?, nest?, fixed?,
//                 slot?, lure?, long?, sold?, hang?, words, verbs, stats, uses?, servings?, litres? }
//   defineItem(def) → the def (other streams add items: stream B's shop-only things, stream G's berries)
//   itemDef(id) → the def, or null (a fish of a species nobody defined gets a plain one)
//   sizeOf(id, rot) → { w, h } (rot 1 turns it a quarter)
//   VERBS[id] → { label, words }, verbsFor(def) → the verbs a def gets when it names none, verbsOf(id) → an item's
//
// kind: 'food' | 'snack' | 'meal' | 'fish' | 'bait' | 'lure' | 'tool' | 'gear' | 'map' | 'container' | 'long' |
// 'firewood' | 'forage'. w × h are grid cells (a cell is about a hand's width: a meal bag is one, a tent two by four).
// kg is one of them (a fish's own weight comes from its length, in the grid entry's data). stack is how many go in one
// cell's pile (leeches by the dozen). price is the reference in dollars (the shop's table; each outfitter scales it).
// eat: what eating one serving does (food: the food need, lift: the bar, cook: it must be cooked first, hot: a hot meal).
// container: its own grid and the kinds it takes (none listed: anything that fits; one: exactly one entry, the hand's
// holder); wear: where it rides (on the back or the chest, for a portage); hand: carried in a hand; nest: it can go
// inside a pack (a tackle box, the map case, the stringer); fixed: never carried (the pockets, the outfitters' crate).
// slot: the kit slot it fills (tent, filter, paddle). lure: fishing.js's lure id. long: 'rod' | 'paddle' (a long item,
// never in a grid). hang: a barrel, hung from a limb at camp.
//
// The world cards (the owner, 2026-10-24: "what does the pot even do, same with some other items"): every item says
// what it is for in one line, `words` ("Cooks a meal on the grate."), which the book's tooltip shows with the name and
// the weight; and `verbs` is the right-click list, and nothing else goes on it:
//   verbs: [{ id, label, where?, why? }]
//   id 'eat' | 'cook' | 'pitch' | 'hang' | 'hand' | 'tie' | 'use' | 'stringer' | 'drink' | 'drinkup' | 'change' | 'tarp';
//   label the menu's word; where: 'fire' on Cook (it works only inside the fire card); why: set when the verb is greyed
//   in the book, the reason written under it (Hang: hanging is E at a tree with the barrel in your hands; Eat on a raw
//   meal: cook it first). Eating is instant, standing still. The verbs from 'hand' on are the inventory's
//   (inventory.verb(id, ref) says whether each can run now, and runs it).
//
// fb3 B (the owner, 2026-10-25: "i dont know the use of a lot of things … they need to show what that effect is in
// numbers … some things should have consumption bars … trail mix you dont eat all in one sitting"): every item that does
// something says so in numbers, `stats: [{ label, value, when? }]`, a block under the purpose line in the tooltip, and
// the effects are real in code (energy.js, cook.js, chores.js, fishing.js). Things with uses carry `uses` (the tablets:
// one per bottle, 20 new) and food `servings` (trail mix 6, jerky 4, a chocolate bar 2, a meal 1); the grid entry's
// `left` is what is left of either (absent: all of it), drawn as a small bar on the icon; eating takes one serving. The
// bottle is an item too (`litres: 2`, its `left` the litres in it), fixed in the pockets row, with Drink on it: nothing is
// drunk for you. A hand holds any item: a loose one rides in the `inhand` holder (container.one), as wood rides in the
// armload. A fish is 1 × 3 and goes in a hand, a pack or the stringer; pockets take things of up to two cells.

export const ITEMS = {};

const KINDS = new Set(['food', 'snack', 'meal', 'fish', 'bait', 'lure', 'tool', 'gear', 'map', 'container', 'long', 'firewood', 'forage']);
export const FOOD_KINDS = ['food', 'snack', 'meal', 'fish', 'forage'];

// the right-click verbs: what each is, in the book's words
export const VERBS = {
  eat: { label: 'Eat', words: 'One serving, where you stand, afloat or on foot; no sitting down.' },
  cook: { label: 'Cook', words: 'Onto the grate, inside the fire card.' },
  pitch: { label: 'Pitch', words: 'The ghost goes to the dot; a held E or click works through the phases.' },
  hang: { label: 'Hang', words: 'Carry it to a tree and point at the limb: E hangs it.' },
  hand: { label: 'Put in hand', words: 'Into a free hand, to carry or to use.' },
  tie: { label: 'Tie it on', words: 'On the line, with the rod up.' },
  use: { label: 'Use', words: 'What the thing does.' },
  stringer: { label: 'Put on the stringer', words: 'Onto the stringer, when it is in reach: in the canoe beside you, in a hand or within a step.' },
  drink: { label: 'Drink', words: 'A gulp from the bottle, about a quarter of a litre.' },
  drinkup: { label: 'Drink up', words: 'The rest of what is drinkable in the bottle.' },
  change: { label: 'Change into dry clothes', words: 'After a capsize or a soaking: the dry set on, the wet one in the bag.' },
  tarp: { label: 'Pitch over…', words: 'Over the fire ring or a pack on the ground within a few steps: rain stays off it.' },
};
const WHY = { hang: 'carry it to a tree and point at the limb', cook: 'only in the fire card', raw: 'cook it on the grate first' };
const verb = (id, more = {}) => ({ id, label: VERBS[id].label, ...more });
// the verbs a def gets when it names none: food is eaten (a raw meal cooked first), a tent pitched, a barrel hung, a
// long item or a container put in a hand (and any plain item too: hands take anything), a lure tied on, a map sheet
// looked at, a fish put on the stringer, the bottle drunk from, the clothes changed into, the tarp pitched over a thing
export function verbsFor(d) {
  const out = [];
  if (d.eat) { if (d.eat.cook) out.push(verb('cook', { where: 'fire', why: WHY.cook }), verb('eat', { why: WHY.raw })); else out.push(verb('eat')); }
  if (d.id === 'bottle') out.push(verb('drink'), verb('drinkup'));
  if (d.slot === 'tent') out.push(verb('pitch'));
  if (d.id === 'tarp') out.push(verb('tarp'));
  if (d.id === 'clothes') out.push(verb('change'));
  if (d.hang) out.push(verb('hang', { why: WHY.hang }));
  if (d.kind === 'fish') out.push(verb('stringer'));
  if (d.long || (d.kind === 'container' && !d.fixed && !d.station) || (d.kind !== 'container' && d.kind !== 'long' && !d.fixed)) out.push(verb('hand'));
  if (d.lure && (d.kind === 'lure' || d.kind === 'bait')) out.push(verb('tie'));
  if (d.kind === 'map') out.push(verb('use', { label: 'Look at the map' }));
  return out;
}
export function verbsOf(id) { const d = itemDef(id); return d ? d.verbs || [] : []; }
// a purpose line for a def that gives none, by its kind (forage's and the camp's items come through defineItem too)
const WORDS = {
  food: 'Eat it hot, or keep it a few hours as leftovers.', snack: 'Eaten a serving at a time, anywhere you stand still.', meal: 'Cook it in the pot on the grate, then eat.',
  fish: 'Fry it on the grate for supper.', bait: 'Bait for the bobber rig.', lure: 'Tie it on and cast.', tool: 'A tool for camp.', gear: 'Gear for the trip.',
  map: 'A Fisher map sheet; sheets are owned now, not carried.', container: 'Holds things.', long: 'Carried in a hand or laid in the canoe.',
  firewood: 'Burns in the fire ring.', forage: 'Picked on the trip; eat it as it is, or cook it with supper.',
};
const wordsFor = (d) => (d.eat && d.eat.cook && d.kind === 'forage' ? 'Cook them first, on the grate with supper.' : WORDS[d.kind] || WORDS.gear);
// a stats line
const S = (label, value, when = null) => (when ? { label, value, when } : { label, value });
const pct = (x) => `${Math.round(x * 100)} %`;
// what eating one serving does, as lines (the food need and the bar; servings when more than one)
function eatStats(d) {
  if (!d.eat) return [];
  const e = d.eat, out = [];
  const how = e.cook ? (d.kind === 'fish' ? 'fried on the grate: in the pot’s lid, or on a stick without the pot' : e.boil ? 'the pot of boiled water on the grate' : 'cooked in the pot on the grate') : d.servings > 1 ? 'a serving, eaten as it is, standing still' : 'eaten as it is, standing still';
  out.push(S('Hunger', `+${pct(e.food)}`, how));
  if (Number.isFinite(e.lift)) out.push(S('The bar', `+${pct(e.lift)}`));
  if (d.servings > 1) out.push(S('Servings', String(d.servings)));
  if (d.keep) out.push(S('Keeps', `${d.keep} h as leftovers, then goes off`));
  return out;
}

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
  if (d.eat && !Number.isFinite(d.servings)) d.servings = 1;
  if (!Array.isArray(d.stats)) d.stats = eatStats(d);
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
  if (s.startsWith('fish:')) return defineItem({ id: s, name: cap(s.slice(5)), kind: 'fish', w: 1, h: 3, kg: 0.8, eat: { food: 0.6, lift: 0.45, cook: true, hot: true }, words: 'Fry it on the grate for supper.' });
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
const REACH_WORDS = 'in a hand, on the ground within 3 m, or in the canoe you are in or beside';
defineItem({ id: 'pockets', name: 'Your pockets', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, container: { cols: 5, rows: 1 }, icon: 'pockets', words: 'The bottle, and four quick slots for small things: a snack, a lure, the tablets.',
  stats: [S('Quick slots', '4, for things of one or two cells'), S('The bottle', 'always in the first')] });
defineItem({ id: 'pack3', name: 'Duluth pack #3', kind: 'container', w: 4, h: 5, kg: 2.0, price: 25, wear: ['back', 'chest'], mesh: 'food', container: { cols: 6, rows: 8 }, icon: 'pack', words: 'Carries the camp on your back or chest: the tent, the bag, the pot and two weeks of meals.',
  stats: [S('Room', '6 × 8 cells'), S('Carried', 'on the back or the chest, or in a hand; 2 kg empty'), S('Food room at the counter', '7 days')] });
defineItem({ id: 'pack4', name: 'Duluth pack #4', kind: 'container', w: 5, h: 5, kg: 2.4, price: 35, wear: ['back', 'chest'], mesh: 'gear', container: { cols: 7, rows: 9 }, icon: 'pack', words: 'Carries more than the #3, and you feel all of it on a long carry.',
  stats: [S('Room', '7 × 9 cells'), S('Carried', 'on the back or the chest; 2.4 kg empty'), S('Food room at the counter', '+10 days'), S('A second pack', 'the double portage: the gear pack waits at the trail head')] });
defineItem({ id: 'barrel30', name: 'Blue barrel, 30 L', kind: 'container', w: 3, h: 4, kg: 2.2, price: 25, wear: ['back', 'chest'], hand: true, hang: true, mesh: 'barrel30', container: { cols: 4, rows: 4, accepts: FOODISH }, icon: 'barrel', words: 'Keeps a week of food dry and sealed; hang it from a limb at night and the bears go hungry.',
  stats: [S('Room', '4 × 4 cells, food only'), S('Food room at the counter', '7 days'), S('Bears', 'seldom get into a sealed barrel on the ground; never into a hung one', 'food on the ground overnight within 60 m may be found')] });
defineItem({ id: 'barrel60', name: 'Blue barrel, 60 L', kind: 'container', w: 4, h: 5, kg: 3.0, price: 35, wear: ['back'], hang: true, mesh: 'barrel60', container: { cols: 5, rows: 6, accepts: FOODISH }, icon: 'barrel', words: 'Keeps two weeks of food dry and sealed; hang it from a limb at night.',
  stats: [S('Room', '5 × 6 cells, food only'), S('Food room at the counter', '14 days'), S('Bears', 'seldom get into a sealed barrel on the ground; never into a hung one')] });
defineItem({ id: 'bucket', name: 'Leech bucket', kind: 'container', w: 2, h: 2, kg: 1.2, price: 6, hand: true, mesh: 'bucket', container: { cols: 2, rows: 2, accepts: ['bait'] }, icon: 'bucket', words: 'Keeps the leeches alive for the bobber rig; carried in a hand.',
  stats: [S('Room', '4 dozen leeches'), S('The bobber rig', 'takes one leech from it per bite', `the bucket must be in reach: ${REACH_WORDS}`)] });
defineItem({ id: 'tacklebox', name: 'Tackle box', kind: 'container', w: 3, h: 2, kg: 0.8, price: 12, hand: true, nest: true, mesh: 'tacklebox', container: { cols: 4, rows: 3, accepts: ['lure'] }, icon: 'tacklebox', words: 'Holds the lures you can tie on; whatever is not in it, you can’t fish with.',
  stats: [S('Room', '4 × 3 cells, lures only'), S('Casting', 'only a lure in reach can be tied on (1–7 with the rod up)')] });
defineItem({ id: 'mapcase', name: 'Map case', kind: 'container', w: 1, h: 3, kg: 0.2, price: 10, hand: true, nest: true, mesh: 'mapcase', container: { cols: 2, rows: 6, accepts: ['map'] }, icon: 'mapcase', words: 'Kept the map sheets dry; the sheets are owned now, not carried.' });
defineItem({ id: 'stringer', name: 'Fish stringer', kind: 'container', w: 1, h: 2, kg: 0.2, price: 0, hand: true, nest: true, mesh: 'stringer', container: { cols: 3, rows: 5, accepts: ['fish'] }, icon: 'fish', words: 'Keeps the fish you land alive and cool until supper.',
  stats: [S('Room', '3 × 5 cells, fish only (a fish is 1 × 3)'), S('A landed fish', 'goes to your hand; Put on the stringer is its verb while the stringer is in reach'), S('Shouldering the canoe', 'it rides lashed under the thwarts, fish and all')] });
defineItem({ id: 'crate', name: 'Kept for you at the outfitters', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, stashOnly: true, container: { cols: 10, rows: 8 }, icon: 'crate', words: 'Keeps what you leave behind at an outfitter until you come in again, at any counter.' });
defineItem({ id: 'pile', name: 'On the ground', kind: 'container', w: 1, h: 1, kg: 0, fixed: true, mesh: 'pile', container: { cols: 6, rows: 4 }, icon: 'pile', words: 'Things set down on the ground here; Q opens the pile, E takes one.' });
// fb3 B: a hand holds any item (decision 11): a loose thing in a hand rides in this holder, exactly one entry (a stack
// counts as one), the way wood rides in the armload. The book draws the thing itself in the hand slot, not the holder.
defineItem({ id: 'inhand', name: 'In your hand', short: 'In hand', kind: 'container', w: 1, h: 1, kg: 0, hand: true, one: true, container: { cols: 2, rows: 5, one: true }, icon: 'inhand', verbs: [], words: 'One thing, carried in a hand.' });

// --- food --------------------------------------------------------------------------------------------------------
// A day of food is two meals (0.9 kg, $6): a breakfast and a supper, both cooked in the pot on the grate. Snacks are
// eaten a serving at a time, standing still, on foot or in the canoe (fb3 B: trail mix 6 servings, jerky 4, a bar 2).
defineItem({ id: 'meal:breakfast', name: 'Oatmeal breakfast', kind: 'meal', kg: 0.4, price: 3, eat: { food: 0.5, lift: 0.3, cook: true, hot: true }, words: 'A hot breakfast: cook it in the pot on the grate, then eat.',
  stats: [S('Hunger', '+50 %', 'cooked in the pot on the grate: 300 mL of water from the bottle, 20 min'), S('The bar', '+30 %'), S('Needs', 'the pot on the grate, a fire burning under it')] });
defineItem({ id: 'meal:supper', name: 'Rice and lentil supper', kind: 'meal', kg: 0.5, price: 3, eat: { food: 0.6, lift: 0.45, cook: true, hot: true }, words: 'A hot supper: cook it in the pot on the grate, then eat.',
  stats: [S('Hunger', '+60 %', 'cooked in the pot on the grate: 400 mL of water from the bottle, 25 min'), S('The bar', '+45 %'), S('Needs', 'the pot on the grate, a fire burning under it')] });
defineItem({ id: 'meal:freeze', name: 'Freeze-dried supper', kind: 'meal', kg: 0.2, price: 5, eat: { food: 0.6, lift: 0.45, cook: true, hot: true, boil: true }, words: 'A hot supper from boiled water alone: the pot on the grate, then eat.',
  stats: [S('Hunger', '+60 %', 'the pot of water boiled on the grate: 500 mL from the bottle, 20 min'), S('The bar', '+45 %'), S('Needs', 'the pot on the grate, a fire burning under it')] });
defineItem({ id: 'snack:trailmix', name: 'Trail mix', kind: 'snack', kg: 0.25, price: 2, servings: 6, eat: { food: 0.06, lift: 0.03 }, words: 'A handful at a time, afloat or on foot, standing still: six handfuls to the bag.',
  stats: [S('Hunger', '+6 % a handful', 'eaten as it is, standing still'), S('The bar', '+3 % a handful'), S('Servings', '6 to the bag')] });
defineItem({ id: 'snack:jerky', name: 'Beef jerky', kind: 'snack', kg: 0.12, price: 3, servings: 4, eat: { food: 0.07, lift: 0.03 }, words: 'A strip at a time, afloat or on foot; it keeps forever.',
  stats: [S('Hunger', '+7 % a strip', 'eaten as it is, standing still'), S('The bar', '+3 % a strip'), S('Servings', '4 strips to the bag')] });
defineItem({ id: 'snack:chocolate', name: 'Chocolate bar', kind: 'snack', kg: 0.1, price: 1, servings: 2, eat: { food: 0.06, lift: 0.06 }, words: 'Half a bar at a time; a lift on a portage.',
  stats: [S('Hunger', '+6 % a half', 'eaten as it is, standing still'), S('The bar', '+6 % a half'), S('Servings', '2 halves')] });
// kept fish, by species: 1 × 3 in a grid (fb3 B: a fish goes in a hand, a pack or the stringer); a fish of any other
// species gets a plain one (itemDef)
const FISH_STATS = [S('Hunger', '+60 %', 'fried on the grate: in the pot’s lid, or on a stick without the pot; 20 min'), S('The bar', '+45 %'), S('Weight', 'by its length: a 50 cm walleye 1.2 kg, a 90 cm pike 3.1 kg'), S('A notice’s cooler', 'may want it as it is: K at the catch says so')];
for (const [sp, name] of [['walleye', 'Walleye'], ['pike', 'Northern pike'], ['smallmouth', 'Smallmouth bass'], ['laketrout', 'Lake trout'], ['perch', 'Yellow perch'], ['crappie', 'Crappie']]) {
  defineItem({ id: `fish:${sp}`, name, kind: 'fish', w: 1, h: 3, kg: 0.8, species: sp, eat: { food: 0.6, lift: 0.45, cook: true, hot: true }, words: 'Fry it on the grate for supper; a notice’s cooler may want it as it is.', stats: FISH_STATS });
}
defineItem({ id: 'leeches', name: 'Leeches', kind: 'bait', kg: 0.025, stack: 12, price: 4, sold: 12, lure: 'leech', icon: 'leeches', words: 'Bait for the bobber rig, kept alive in the bucket; a walleye can’t leave one alone.',
  stats: [S('The bobber rig', 'one leech per bite, taken from the bucket in reach', `the bucket ${REACH_WORDS}`), S('Takes', 'walleye ×1.0, crappie and perch ×1.3, smallmouth ×1.0, pike ×0.6'), S('A dozen', 'to a stack; four dozen to the bucket')] });
defineItem({ id: 'firewood', name: 'An armful of firewood', kind: 'firewood', w: 3, h: 2, kg: 6, burn: 2.4, words: 'Burns in the fire ring for a couple of hours.', stats: [S('Burns', '2.4 h'), S('Lights', 'on its own')] });
// camp 2 (the camp redone, 2026-10-24): firewood is found lying about, a piece at a time (chores.js), and burns by the
// piece (burn: game hours on a fire, fire.js); a few pieces are carried in the arms, a hand's armload (woodarms, drawn by
// chores.js). The grate holds what is cooking or cooked and the pot (cook.js): a fixed container at the fire ring.
defineItem({ id: 'wood:branch', name: 'Dead branch', short: 'Branch', kind: 'firewood', w: 1, h: 2, kg: 0.7, burn: 0.6, icon: 'firewood', words: 'Kindling for the fire ring: it catches easily and burns about half an hour.',
  stats: [S('Burns', '0.6 h'), S('Kindling', 'a fire lights only with a branch in the ring, two pieces in all'), S('On hot coals', 'brings a burnt-out fire back')] });
defineItem({ id: 'wood:log', name: 'Short log', short: 'Log', kind: 'firewood', w: 1, h: 3, kg: 2.2, burn: 1.5, icon: 'firewood', words: 'Burns long in the fire ring, an hour and a half once the fire is going.',
  stats: [S('Burns', '1.5 h'), S('Lighting', 'won’t catch on its own: a dead branch under it'), S('The ring holds', '4.5 h of wood at once')] });
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
// the multipliers are fishing.js SPECIES[*].lures, written out
defineItem({ id: 'lure:jig', name: 'Jig & twister tail', kind: 'lure', kg: 0.01, price: 3, lure: 'jig', words: 'Tie it on for walleye and hop it along the bottom.',
  stats: [S('Takes', 'walleye ×1.25, crappie ×1.1, perch ×1.0, smallmouth ×0.9, lake trout ×0.9, pike ×0.5'), S('Worked', 'hops along the bottom; best slow (×1.0), still ×0.7, burned back ×0.5'), S('The last jig', 'is never lost to a snapped line')] });
defineItem({ id: 'lure:mepps', name: 'Mepps spinner', kind: 'lure', kg: 0.01, price: 6, lure: 'spinner', words: 'Tie it on along the weed edge; the blade throws the light.',
  stats: [S('Takes', 'pike ×1.1, smallmouth ×1.0, walleye ×0.7, crappie ×0.5, perch ×0.4, lake trout ×0.3'), S('Worked', 'runs a metre down; best burned back (×1.1), slow ×0.85, still ×0.15')] });
defineItem({ id: 'lure:daredevle', name: 'Red-and-white Daredevle', kind: 'lure', kg: 0.02, price: 7, lure: 'spoon', words: 'Tie it on for pike: the spoon every pike in the country knows.',
  stats: [S('Takes', 'pike ×1.3, lake trout ×1.3, walleye ×0.5, smallmouth ×0.5, crappie ×0.2, perch ×0.2'), S('Worked', 'runs 2.2 m down; slow or fast ×1.0, still ×0.25')] });
defineItem({ id: 'lure:rapala', name: 'Jointed Rapala', kind: 'lure', kg: 0.02, price: 12, lure: 'crankbait', words: 'Tie it on and crank it deep: a balsa minnow that swims.',
  stats: [S('Takes', 'smallmouth ×1.2, pike ×1.0, walleye ×0.9, lake trout ×0.5, crappie ×0.4, perch ×0.3'), S('Worked', 'dives to 3.4 m; best burned back (×1.1), slow ×0.95; it floats at rest (×0.2)')] });
defineItem({ id: 'lure:silverminnow', name: 'Johnson Silver Minnow', kind: 'lure', kg: 0.02, price: 8, lure: 'silverminnow', words: 'Tie it on through the weeds: a weedless spoon.',
  stats: [S('Takes', 'pike in the weed beds'), S('Worked', 'a weedless spoon: through the lily pads and the cabbage')] });
defineItem({ id: 'lure:lazyike', name: 'Lazy Ike', kind: 'lure', kg: 0.02, price: 9, lure: 'lazyike', words: 'Tie it on for a lazy wobble: an old banana plug.',
  stats: [S('Takes', 'walleye, trolled along a drop-off'), S('Worked', 'a slow wobble; best trolled')] });

// --- camp gear and tools -----------------------------------------------------------------------------------------
defineItem({ id: 'aframe', name: 'A-frame tent', kind: 'gear', w: 2, h: 4, kg: 3.0, price: 0, slot: 'tent', icon: 'tent', words: 'Pitch it at camp to sleep in; it sags when it rains.',
  stats: [S('Night’s rest', '85 %', 'pitched, the fly on; no fly: 90 % of that'), S('Rain with no fly', 'the night ×0.8 and the gear soaked by morning'), S('Pitching', 'about 15 min, four phases, E held')] });
defineItem({ id: 'dome', name: 'Dome tent', kind: 'gear', w: 2, h: 4, kg: 2.8, price: 50, slot: 'tent', icon: 'dome', words: 'Pitch it at camp to sleep in; it stands up to the wind off the lake.',
  stats: [S('Night’s rest', '100 %', 'pitched, the fly on; no fly: 90 % of that'), S('Rain with no fly', 'the night ×0.8 and the gear soaked by morning'), S('Pitching', 'about 15 min, four phases, E held')] });
defineItem({ id: 'fourseason', name: 'Four-season tent', kind: 'gear', w: 2, h: 5, kg: 3.6, price: 95, slot: 'tent', icon: 'dome', words: 'Pitch it at camp for the best night in any weather; the wet things dry by morning.',
  stats: [S('Night’s rest', '100 %', 'pitched, the fly on; no fly: 90 % of that'), S('Wet gear', 'dries overnight in the vestibule'), S('Pitching', 'about 15 min, four phases, E held')] });
defineItem({ id: 'sleepingbag', name: 'Sleeping bag', kind: 'gear', w: 2, h: 3, kg: 1.8, price: 0, icon: 'bag', words: 'Keeps you warm through the night in the tent, down to freezing.',
  stats: [S('Night’s rest', 'full', 'in the tent, within the camp’s reach (25 m of the ring)'), S('Without it', '60 %'), S('Cold nights (under 10 °C)', 'no warmth lost; without it you wake at 60 % warmth'), S('Damp gear', 'warmth 80 %')] });
defineItem({ id: 'clothes', name: 'Clothes bag', kind: 'gear', w: 2, h: 2, kg: 2.5, price: 0, icon: 'clothes', uses: 1, words: 'A dry set of clothes for camp: warmth again after a capsize or a wet day.',
  stats: [S('A dry set', '1 in the bag'), S('Change', 'after a capsize or a soaking: warmth comes back twice as fast for 2 h, and the gear counts dry'), S('The wet set', 'dries by a fire in half an hour, inside a store, or overnight')] });
defineItem({ id: 'pot', name: 'Cook pot', kind: 'tool', w: 2, h: 2, kg: 1.2, price: 0, icon: 'pot', words: 'Cooks a meal on the grate: drag it onto the grate, the meal beside it, and Cook.',
  stats: [S('A meal', 'cooks only in the pot: drag it onto the grate'), S('Water', '300–500 mL a meal from the bottle; boiled, lake water is safe'), S('A fish', 'fries in its lid in 20 min (on a stick over the coals without it)')] });
defineItem({ id: 'tarp', name: 'Rain tarp', kind: 'gear', w: 2, h: 2, kg: 1.0, price: 0, icon: 'tarp', words: 'Pitched over the fire ring or a pack on the ground, the rain stays off it.',
  stats: [S('Over the fire ring', 'rain neither wets the wood in it nor burns the fire down', 'without it, rain burns a fire twice as fast and wets the wood through in 20 min'), S('Over a pack on the ground', 'the gear stays dry', 'without it, half an hour of rain soaks the gear'), S('Rain fly for the tent', 'none')] });
defineItem({ id: 'pad', name: 'Sleeping pad', kind: 'gear', w: 2, h: 3, kg: 0.6, price: 30, words: 'Softens the ground under the bag for a better night.', stats: [S('Night’s rest', '+5 %', 'owned, in any tent')] });
defineItem({ id: 'yokepads', name: 'Portage yoke pads', kind: 'gear', w: 2, h: 1, kg: 0.4, price: 15, icon: 'yoke', words: 'Eases the canoe on your shoulders over a portage.', stats: [S('Carrying the canoe', 'energy ×0.85', 'owned')] });
defineItem({ id: 'tablets', name: 'Purifying tablets', kind: 'tool', kg: 0.05, price: 2, slot: 'filter', uses: 20, words: 'Treats the bottle: a tablet dropped in at each fill and half an hour’s wait.',
  stats: [S('Treats', 'one bottle per tablet, drinkable in 30 min', 'E at the water’s edge; the tablets in reach'), S('Tablets', '20 to the tube'), S('Without one', 'lake water as it comes: a queasy stomach for 6 h (hunger ×1.5)')] });
defineItem({ id: 'pump', name: 'Pump filter', kind: 'tool', w: 1, h: 2, kg: 0.4, price: 35, slot: 'filter', words: 'Fills the bottle at the shore, drinkable in a few minutes.', stats: [S('Fills the bottle', 'drinkable in 5 min', 'E at the water’s edge'), S('Tablets', 'none used')] });
defineItem({ id: 'gravity', name: 'Gravity filter', kind: 'tool', w: 2, h: 2, kg: 0.5, price: 55, slot: 'filter', words: 'Fills the bottle by itself: hang the bag in a tree at camp.', stats: [S('Fills the bottle', 'on its own within 25 m of your camp’s ring, drinkable in 5 min'), S('At the shore', 'drinkable in 5 min; no tablets used')] });
defineItem({ id: 'saw', name: 'Folding saw', kind: 'tool', w: 1, h: 3, kg: 0.4, price: 18, words: 'Saws a down log into short logs for the fire: hold E at the log with it in reach.',
  stats: [S('A down log', 'three short logs (1.5 h of fire each), 5 min a cut', 'hold E at the log with the saw in reach'), S('Once in two days', 'a log')] });
defineItem({ id: 'camera', name: 'Camera, 35 mm', kind: 'tool', w: 2, h: 1, kg: 0.6, price: 25, words: 'Takes the pictures the photo notices ask for; C raises it.', stats: [S('A photo notice', 'pays $10 a bird, $15 a beaver, $35 a moose, $12 a place', 'the subject near the middle, close, not hidden')] });
// fb3 B: the bottle is an item (decision 12), fixed in the first pocket cell; `left` is the litres in it. Nothing drinks
// for you: thirst falls on its own and comes back only when you Drink (energy.drink).
defineItem({ id: 'bottle', name: 'Water bottle', short: 'Bottle', kind: 'tool', w: 1, h: 1, kg: 0.15, price: 0, litres: 2, icon: 'bottle', words: 'Two litres. Drink from it when you are thirsty: nothing is drunk for you.',
  stats: [S('Holds', '2 L'), S('A gulp', '0.25 L: thirst +19 %', 'Drink, standing or afloat'), S('Drink up', 'the rest of what is drinkable'), S('Thirst falls', '12.5 % an hour; 19 % paddling hard, carrying 30 kg or on a hot afternoon'), S('Fill', 'E at the water’s edge (a tablet per fill, 30 min); free at any counter')] });

// --- the long items: held in a hand, lying in the canoe or on the ground -------------------------------------------
defineItem({ id: 'ash', name: 'Ash paddle', kind: 'long', w: 1, h: 6, kg: 1.1, price: 0, slot: 'paddle', long: 'paddle', icon: 'paddle', words: 'Paddles the canoe; a plain beavertail that gets you there.', stats: [S('Cruise', '4.0 km/h at life'), S('Effort', '×1')] });
defineItem({ id: 'bentshaft', name: 'Bent-shaft laminate paddle', kind: 'long', w: 1, h: 6, kg: 0.9, price: 40, slot: 'paddle', long: 'paddle', words: 'Paddles the canoe a touch quicker and easier on the shoulders.', stats: [S('Cruise', '+5 % (4.2 km/h)'), S('Effort', '×0.95')] });
defineItem({ id: 'carbon', name: 'Carbon bent-shaft paddle', kind: 'long', w: 1, h: 6, kg: 0.5, price: 110, slot: 'paddle', long: 'paddle', words: 'Paddles the canoe with next to no weight in your hands.', stats: [S('Cruise', '+9 % (4.4 km/h)'), S('Effort', '×0.9')] });
defineItem({ id: 'rod', name: 'Spinning rod', kind: 'long', w: 1, h: 7, kg: 0.4, price: 0, long: 'rod', words: 'Fishes from the canoe (F), or from the shore, a dock or a rock with it in your hand.', stats: [S('Line', 'parts after about a second in the red'), S('On foot', 'F with it in a hand, water within a cast ahead')] });
defineItem({ id: 'rodmh', name: 'Medium-heavy rod', kind: 'long', w: 1, h: 7, kg: 0.5, price: 45, long: 'rod', icon: 'rod', words: 'Fishes for the big pike: stiffer, with heavier line; from the canoe or the shore with it in hand.', stats: [S('Line', '×1.4: parts after 1.4 s in the red'), S('On foot', 'F with it in a hand, water within a cast ahead')] });

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
