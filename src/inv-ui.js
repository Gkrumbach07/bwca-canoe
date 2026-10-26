// The inventory's face (feedback 2026-10-24, stream B; the world cards, the third round): the icons, the Tarkov grid,
// the book's pack side, the store's two-pane shelves, and the pieces the fire card (cards.js) is built from.
//
// The model is stream A's (items.js: ITEMS and defineItem; inventory.js: the containers, reachable, fits, put, take,
// move, eat, onChange). Until it is in the build this file runs on a small stand-in with the same calls (StubInventory,
// below), so the screens can be built and tested on their own; every call past the shared contract is feature-tested.
//
//   icon(itemId, size = 48) → <canvas>          an item's picture: drawn once on a 2D canvas per size and cached
//   grid(el, container, { onDrop, onUse })      a container as a Tarkov grid: drag and drop between any grids on the
//                                               page, R turns it while dragging (and a drop that fits only turned
//                                               turns by itself), Shift-drag splits, right-click lists its verbs (and
//                                               why one is greyed: its why and one chip, fb5 B)
//   MineSide                                    your stuff on one screen (the owner, 2026-10-24: "having to scroll to
//                                               see items is a struggle"): the body on the left (back, chest, hands,
//                                               pockets), a tab per container you carry across the top, one grid at a
//                                               time; in the book what is around you as the right pane, a tab each
//                                               (fb4 B: the canoe, each container on the ground, Wood, The ground,
//                                               Keeping). The book's pack side, the shelf's left pane and the fire
//                                               card's left pane are all this one thing (the shelf and the card have
//                                               their own right pane, so their left has every tab, yours first).
//   PackSide                                    the book's pack side (journal.js shows it): MineSide with its header;
//                                               since fb4 B what is around you is tabs on the right (the canoe, each
//                                               container on the ground, Wood, The ground, Keeping)
//   ShelfScreen                                 a shelf, the lure wall or the map table: yours on the left, the
//                                               shelf's stock on the right, priced; a drag buys exactly where it lands
//   openHere(ref)                               the book open at that container's tab, lit (stream A's Q; 'canoe')
//   firePanel, startHold, tickHold, SCREENS     the fire card's pieces (cards.js)
//   needsHtml, statusOf, tickTimers             fb4 B (decision 2): a greyed action's checklist (ticks, quantities,
//                                               countdowns, the next step) and an entry's state (inventory.status)
//   whyHtml, chipHtml, firstMissing, tipHtml    fb5 B (decisions 2 and 6): a greyed verb's why and the one thing
//                                               missing as a chip (items.js chipOf; the menu and the fire card), and
//                                               an item's tooltip in the one schema (name, identity, state, on you,
//                                               uses, weight)
//   invUI.attach({ inventory, profile, player, energy, hud, shop, outfitter, nearby, hold, audio, journal, packs, cards, day })
import './inv-ui.css';

// --- the model ----------------------------------------------------------------------------------------------------
// Stream A's items, when they are in the build (an eager glob: no import fails without them). items.js must not import
// this file, the shop or the outfitter.
const A_ITEMS = import.meta.glob('./items.js', { eager: true })['./items.js'] || null;
const A_INV = import.meta.glob('./inventory.js', { eager: true })['./inventory.js'] || null;
// the second round (fb2): the held work (hold.js, which imports nothing). The things near you (stream A's nearby.js: the
// fire ring, the pitched tent, the latrine, the hang) come only through attach, never an import here: nearby.js imports
// camp.js and tent.js, and pulling them in this early (journal.js imports this file) reads tent.js's TENT_SIZE before it
// is set (the merge test, 2026-10-24)
const A_HOLD = import.meta.glob('./hold.js', { eager: true })['./hold.js'] || null;
// fb5 B: the energy bar's own need icons (hud.js NEED_ICON: a snowflake, zz, a fork and knife, a drop), so an item's
// effect reads as the bar it moves
const A_HUD = import.meta.glob('./hud.js', { eager: true })['./hud.js'] || null;
// what the screens work with: main.js's fb B block (attach), else stream A's singleton, else the stand-in
const ctx = { inventory: null, profile: null, player: null, energy: null, hud: null, shop: null, outfitter: null, stub: null, nearby: null, hold: null, audio: null, journal: null, packs: null, cards: null, day: null };
export function attach(o) { Object.assign(ctx, o); return ctx; }
const of = (t) => (typeof t === 'function' ? t() : t) || null; // a thing given as itself or as a getter
export function model() {
  const t = ctx.inventory, v = typeof t === 'function' ? t() : t;
  if (v) return v;
  if (A_INV && A_INV.inventory) return A_INV.inventory;
  if (!ctx.stub) ctx.stub = new StubInventory(ctx);
  return ctx.stub;
}
export const live = () => !model().stub; // stream A's model is in
// the things near you: main.js's (attach: window.__game.nearby); each call is guarded, a thrown error costs a panel and
// not the book
function nearby() { const t = ctx.nearby, v = typeof t === 'function' ? t() : t; return v || null; }
// the fire ring near you, as nearby.objects() gives it (the fire card, cards.js): by its key, its id or itself
export function fireObject(ref = null) {
  const n = nearby(); if (!n || typeof n.objects !== 'function') return null;
  let list = [];
  try { list = (n.objects() || []).filter((o) => o && o.id && o.kind === 'fire'); } catch (e) { console.warn('nearby.objects', e); return null; }
  if (ref && typeof ref === 'object') return list.find((o) => o.id === ref.id) || null;
  if (ref == null) return list[0] || null;
  return list.find((o) => o.key === ref || o.id === ref || o.id === `fire:${ref}`) || null;
}
// the right-click actions a thing has where you stand (Pitch, Hang): ref { cId, uid, itemId } for an item in a grid,
// { container } for a container, { long } for a long thing
function nearActions(ref) {
  const n = nearby(); if (!n || typeof n.itemActions !== 'function') return [];
  try { return (n.itemActions(ref) || []).filter((a) => a && a.label); } catch (e) { console.warn('nearby.itemActions', e); return []; }
}
const holdOf = () => of(ctx.hold) || (A_HOLD && A_HOLD.hold) || null;
const packsOf = () => of(ctx.packs) || (typeof window !== 'undefined' && window.__game ? window.__game.packs : null) || null;
// an item's verbs for the right-click (stream D's items.js: def.verbs, verbsOf; derived here until it is in):
// [{ id: 'eat' | 'cook' | 'pitch' | 'hang' | 'hand' | 'tie' | 'use', label, where?, why? }]
export function verbsFor(d, id = d && d.id) {
  if (!d) return [];
  if (A_ITEMS && typeof A_ITEMS.verbsOf === 'function') { try { const v = A_ITEMS.verbsOf(id); if (Array.isArray(v)) return v; } catch { /* the derivation below */ } }
  if (Array.isArray(d.verbs)) return d.verbs;
  const out = [];
  if (d.eat) out.push(d.eat.cook && !d.cooked ? { id: 'eat', label: 'Eat', why: 'cook it on the grate first' } : { id: 'eat', label: 'Eat' });
  if (d.eat && d.eat.cook && !d.cooked) out.push({ id: 'cook', label: 'Onto the grate', where: 'fire', why: 'At a fire ring' });
  if (d.slot === 'tent') out.push({ id: 'pitch', label: 'Pitch' });
  if (d.hang || /^barrel/.test(String(d.id))) out.push({ id: 'hang', label: 'Hang', why: 'carry it to a tree and point at the limb' });
  if (d.kind === 'long' || (d.hand && d.kind === 'container')) out.push({ id: 'hand', label: 'Put in hand' });
  if ((d.kind === 'lure' || d.kind === 'bait') && d.lure) out.push({ id: 'tie', label: 'Tie it on' });
  if (d.kind === 'map') out.push({ id: 'use', label: 'Look at the map' });
  return out;
}

export const CELL = 50; // px a grid cell (the icons read at 48)

// The stand-in's items, and the shop's own (sheets, signature items, the map case) when A's items.js has no
// defineItem: { id, name, short, kind, w, h, kg, stack, price, eat, icon, container, words }. Kinds as A's contract.
const LOCAL = {};
const L = (id, name, kind, w, h, kg, o = {}) => { LOCAL[id] = { id, name, kind, w, h, kg, stack: 1, price: 0, icon: id, words: '', ...o }; };
// containers
L('pockets', 'Your pockets', 'container', 1, 1, 0, { short: 'Pockets', icon: 'pockets', container: { cols: 4, rows: 1 }, words: 'Shirt and trouser pockets: a snack, a lure, the tablets.' });
L('pack3', 'Duluth pack #3', 'container', 4, 5, 2.0, { short: 'Duluth #3', icon: 'pack', wear: ['back', 'chest'], price: 25, container: { cols: 6, rows: 8 }, words: 'Canvas and leather, the old #3: a week’s food, or the tent and the cook kit.' });
L('pack4', 'Duluth pack #4', 'container', 5, 5, 2.4, { short: 'Duluth #4', icon: 'pack4', wear: ['back', 'chest'], price: 35, container: { cols: 7, rows: 9 }, words: 'The big #4. Everything goes in, and you’ll feel every bit of it on the long carries.' });
L('barrel30', 'Blue barrel, 30 L', 'container', 3, 4, 2.2, { short: 'Barrel 30', icon: 'barrel', wear: ['back', 'chest'], hand: true, price: 25, container: { cols: 4, rows: 4, accepts: ['food', 'meal', 'snack', 'fish', 'forage'] }, words: 'A blue barrel on a harness. The food rides dry and sealed, and the bears can’t smell it.' });
L('barrel60', 'Blue barrel, 60 L', 'container', 4, 5, 3.0, { short: 'Barrel 60', icon: 'barrel60', wear: ['back'], price: 35, container: { cols: 5, rows: 6, accepts: ['food', 'meal', 'snack', 'fish', 'forage'] }, words: 'The big blue barrel: two weeks of food for a long trip. Heavy on the first portage, light on the last.' });
L('bucket', 'Leech bucket', 'container', 2, 2, 0.6, { short: 'Bucket', icon: 'bucket', hand: true, price: 6, container: { cols: 2, rows: 2, accepts: ['bait'] }, words: 'A foam bucket with a lid. Leeches stay lively in it for days if you change the water.' });
L('tacklebox', 'Tackle box', 'container', 3, 2, 0.8, { short: 'Tackle box', icon: 'tacklebox', hand: true, nest: true, price: 12, container: { cols: 4, rows: 3, accepts: ['lure', 'tool'] }, words: 'A green box with trays that fold out. The lures you own are the ones in here.' });
L('mapcase', 'Map case', 'container', 1, 3, 0.2, { short: 'Map case', icon: 'mapcase', hand: true, nest: true, price: 10, container: { cols: 2, rows: 6, accepts: ['map'] }, words: 'Clear vinyl with a roll-top seal. The sheet stays dry on the thwart in front of you.' });
// food
L('meal:breakfast', 'Oatmeal breakfast', 'meal', 1, 1, 0.35, { short: 'Oatmeal', icon: 'oatmeal', price: 3, eat: { food: 0.5, cook: true }, words: 'Oats, brown sugar and powdered milk in a bag. Boil the water and it’s breakfast.' });
L('meal:supper', 'Rice and lentil supper', 'meal', 1, 1, 0.5, { short: 'Supper', icon: 'supper', price: 3, eat: { food: 0.5, cook: true }, words: 'Rice, red lentils and a cube of stock, bagged for the trail. Twenty minutes on the grate.' });
L('meal:freeze', 'Freeze-dried supper', 'meal', 1, 1, 0.2, { short: 'Freeze-dr.', icon: 'freeze', price: 5, eat: { food: 0.5, cook: true }, words: 'Boil the water, pour it in, wait ten minutes. A hot supper on a night the wood is wet.' });
L('snack:trailmix', 'Trail mix', 'snack', 1, 1, 0.25, { short: 'Trail mix', icon: 'trailmix', price: 2, stack: 1, eat: { food: 0.2, cook: false }, words: 'Peanuts, raisins and the coloured chocolate. A handful between portages.' });
L('snack:jerky', 'Beef jerky', 'snack', 1, 1, 0.15, { short: 'Jerky', icon: 'jerky', price: 3, eat: { food: 0.25, cook: false }, words: 'Smoked in the shed out back. Chewy, salty, and it keeps forever.' });
L('snack:chocolate', 'Chocolate bar', 'snack', 1, 1, 0.1, { short: 'Choc.', icon: 'chocolate', price: 1, eat: { food: 0.15, cook: false }, words: 'Milk chocolate. It goes soft in the sun; eat it at the top of the portage.' });
// bait and lures
L('leeches', 'Leeches', 'bait', 1, 1, 0.03, { short: 'Leeches', icon: 'leeches', price: 4, stack: 12, sold: 12, words: 'Ribbon leeches from the bait fridge, by the dozen. A walleye can’t leave one alone.' });
for (const [id, name, short, price] of [['lure:jig', 'Jig & twister tail', 'Jig', 3], ['lure:mepps', 'Mepps spinner', 'Mepps', 6], ['lure:daredevle', 'Red-and-white Daredevle', 'Daredevle', 7], ['lure:rapala', 'Jointed Rapala', 'Rapala', 12], ['lure:silverminnow', 'Johnson Silver Minnow', 'S. Minnow', 8], ['lure:lazyike', 'Lazy Ike', 'Lazy Ike', 9]]) L(id, name, 'lure', 1, 1, 0.02, { short, icon: id.slice(5), price, stack: 3 });
// tools and camp gear
L('tablets', 'Purifying tablets', 'tool', 1, 1, 0.05, { short: 'Tablets', icon: 'tablets', price: 2 });
L('pump', 'Pump filter', 'tool', 1, 2, 0.4, { short: 'Pump', icon: 'pump', price: 35 });
L('gravity', 'Gravity filter', 'tool', 2, 2, 0.5, { short: 'Gravity', icon: 'gravity', price: 55 });
L('saw', 'Folding saw', 'tool', 1, 3, 0.4, { short: 'Saw', icon: 'saw', price: 18 });
L('camera', 'Camera, 35 mm', 'tool', 2, 1, 0.6, { short: 'Camera', icon: 'camera', price: 25 });
L('sleepingbag', 'Sleeping bag', 'gear', 2, 3, 1.8, { short: 'Bag', icon: 'sleepingbag', words: 'A down bag in a stuff sack, good to freezing.' });
L('clothes', 'Clothes bag', 'gear', 2, 2, 2.5, { short: 'Clothes', icon: 'clothes', words: 'Wool socks, a fleece, rain gear, a dry shirt for camp.' });
L('pot', 'Cook pot', 'tool', 2, 2, 1.2, { short: 'Pot', icon: 'pot', words: 'A blackened pot, a lid, a spoon and a lighter inside it.' });
L('tarp', 'Rain tarp', 'gear', 2, 2, 1.0, { short: 'Tarp', icon: 'tarp', words: 'A nylon tarp and its lines.' });
L('pad', 'Sleeping pad', 'gear', 2, 3, 0.6, { short: 'Pad', icon: 'pad', price: 30 });
L('yokepads', 'Portage yoke pads', 'gear', 2, 1, 0.4, { short: 'Yoke pads', icon: 'yokepads', price: 15 });
L('aframe', 'A-frame tent', 'gear', 2, 4, 3.0, { short: 'A-frame', icon: 'tent', words: 'Two poles and a fly in a green sack. It sags when it rains.' });
L('dome', 'Dome tent', 'gear', 2, 4, 2.8, { short: 'Dome', icon: 'dome', price: 50 });
L('fourseason', 'Four-season tent', 'gear', 2, 5, 3.6, { short: '4-season', icon: 'fourseason', price: 95 });
// the long things: in your hands, in the canoe or on the ground, never in a grid
L('rod', 'Spinning rod', 'long', 1, 7, 0.4, { short: 'Rod', icon: 'rod', words: 'A six-foot medium spinning rod and a reel that mostly works.' });
L('rodmh', 'Medium-heavy rod', 'long', 1, 7, 0.5, { short: 'MH rod', icon: 'rodmh', price: 45 });
L('ash', 'Ash paddle', 'long', 1, 6, 1.1, { short: 'Ash', icon: 'paddle' });
L('bentshaft', 'Bent-shaft laminate paddle', 'long', 1, 6, 0.9, { short: 'Bent-shaft', icon: 'bentshaft', price: 40 });
L('carbon', 'Carbon bent-shaft paddle', 'long', 1, 6, 0.5, { short: 'Carbon', icon: 'carbon', price: 110 });
// the hulls: not carried in anything (the canoe itself)
// fb5 B: their comparison is speed and steadiness (shop.js CATALOG effects: cruise, stability); the weight is the carry
L('aluminium', 'Aluminium canoe, 17 ft', 'long', 5, 1, 34, { short: 'Aluminium', icon: 'canoe', hull: true, identity: 'The outfitter’s old tripper', onYou: [{ label: 'Speed', value: '×1' }, { label: 'Steady', value: '×1' }] });
L('royalex', 'Royalex Prospector, 16 ft', 'long', 5, 1, 29, { short: 'Royalex', icon: 'royalex', price: 160, hull: true, identity: 'Wide and forgiving', onYou: [{ label: 'Speed', value: '×0.97' }, { label: 'Steady', value: '×1.3' }] });
L('kevlar', 'Kevlar tripper, 17 ft', 'long', 5, 1, 20, { short: 'Kevlar', icon: 'kevlar', price: 240, hull: true, identity: 'Light and quick', onYou: [{ label: 'Speed', value: '×1.04' }, { label: 'Steady', value: '×1' }] });

L('stringer', 'Fish stringer', 'container', 1, 2, 0.2, { short: 'Stringer', icon: 'stringer', hand: true, nest: true, container: { cols: 3, rows: 5, accepts: ['fish'] } });
L('crate', 'Kept for you at the outfitters', 'container', 1, 1, 0, { short: 'Crate', icon: 'crate', container: { cols: 10, rows: 8 } });
L('firewood', 'An armful of firewood', 'firewood', 3, 2, 6, { short: 'Firewood', icon: 'firewood' });

// Footprints and pictures for the signature items (outfitters.js families) and anything else the shop brings
const FAMILY = { yoke: [3, 1, 'cedaryoke'], paddle: [1, 5, 'ottertail'], net: [2, 3, 'net'], blanket: [2, 2, 'blanket'], jacket: [2, 1, 'jacket'], sail: [1, 4, 'sail'], cover: [2, 2, 'cover'],
  pole: [1, 5, 'pole'], spoon: [1, 1, 'copperspoon'], tump: [1, 1, 'tump'], leaders: [1, 1, 'leaders'], kneelers: [2, 1, 'kneelers'] };
const LONG_FAMILY = new Set(['paddle', 'pole']);
// fb5 B: what a signature item is (outfitters.js FAMILIES), and its effect in player.gear's terms as on-you lines
const FAMILY_ID = { yoke: 'Carved cedar yoke', paddle: 'Carved ottertail paddle', net: 'Ash and cotton landing net', blanket: 'Heavy wool blanket', jacket: 'Mesh bug jacket',
  sail: 'Square sail on two poles', cover: 'Canvas spray cover', pole: 'Iron-shod setting pole · 12 ft', spoon: 'Hammered copper spoon', tump: 'Leather tumpline', leaders: 'Steel leaders, a dozen', kneelers: 'Sheepskin kneeling pads' };
const times = (v) => `×${+(+v).toFixed(2)}`;
export function effectOnYou(f, { paddle = false } = {}) {
  if (!f) return [];
  const out = [];
  if (paddle && Number.isFinite(f.cruise)) out.push({ label: 'Cruise', value: `${(4.0 * f.cruise).toFixed(1)} km/h` }); // (as items.js says the paddles: 4.0 km/h the ash)
  else if (Number.isFinite(f.cruise) && f.cruise !== 1) out.push({ label: 'Cruise', value: times(f.cruise) });
  if (Number.isFinite(f.effort) && f.effort !== 1) out.push({ label: 'Effort', value: times(f.effort) });
  if (Number.isFinite(f.stability) && f.stability !== 1) out.push({ label: 'Steady', value: times(f.stability) });
  if (Number.isFinite(f.carry) && f.carry !== 1) out.push({ label: 'Carrying', value: `energy ${times(f.carry)}` });
  if (Number.isFinite(f.snap) && f.snap !== 1) out.push({ label: 'Line', value: times(f.snap) });
  if (Number.isFinite(f.sleepAdd) && f.sleepAdd) out.push({ need: 'rest', add: Math.round(f.sleepAdd * 100), when: 'a night' });
  return out;
}
// a lure's takes as a word per fish (items.js takesLine), for a signature spoon
const takesOf = (lure) => (lure && A_ITEMS && typeof A_ITEMS.takesLine === 'function' ? A_ITEMS.takesLine(lure) : '');
const takesOn = (lure) => (A_ITEMS && typeof A_ITEMS.takesOn === 'function' ? A_ITEMS.takesOn(lure) : { label: '', value: takesOf(lure) });

// an item's definition: A's, then the stand-in's or the shop's own
export function itemDef(id) {
  if (!id) return null;
  const A = A_ITEMS && A_ITEMS.ITEMS;
  return (A && A[id]) || LOCAL[id] || (A_ITEMS && typeof A_ITEMS.itemDef === 'function' ? A_ITEMS.itemDef(id) : null) || null;
}
// define an item (the shop's: map sheets, signature items, the map case), through A's defineItem when it has one
export function defineItem(def) {
  if (!def || !def.id) return null;
  if (A_ITEMS && typeof A_ITEMS.defineItem === 'function') { const A = A_ITEMS.ITEMS; if (!A || !A[def.id]) A_ITEMS.defineItem(def); return itemDef(def.id) || def; }
  if (!LOCAL[def.id]) LOCAL[def.id] = { stack: 1, price: 0, words: '', ...def };
  return LOCAL[def.id];
}
// a catalogue item (shop.js CATALOG, a sheet, a signature) as an item definition, made once
export function itemFor(it) {
  if (!it) return null;
  const have = itemDef(it.id); if (have && !have.stub) return have;
  if (String(it.id).startsWith('sheet:')) { // a stub (items.js, a sheet restored before the shop knew it) takes its full name
    const def = { id: it.id, name: it.name, short: String(it.sheet || it.id.slice(6)), kind: 'map', w: 2, h: 2, kg: it.kg || 0.1, price: it.price || 8, icon: 'map', identity: 'Fisher map · waterproof', stub: false };
    return have && A_ITEMS ? A_ITEMS.defineItem(def) : defineItem(def);
  }
  const f = FAMILY[it.family];
  if (f) {
    const long = LONG_FAMILY.has(it.family);
    return defineItem({ id: it.id, name: it.name, short: shortOf(it.name), kind: long ? 'long' : it.lure ? 'lure' : 'gear', w: f[0], h: f[1], kg: it.kg || 0.5, price: it.price || 0, icon: f[2], stack: it.lure ? 3 : 1,
      identity: FAMILY_ID[it.family] || '', onYou: [...(takesOf(it.lure) ? [takesOn(it.lure)] : []), ...effectOnYou(it.effect, { paddle: it.family === 'paddle' })],
      ...(long ? { long: it.family === 'paddle' ? 'paddle' : it.family } : {}), ...(it.slot ? { slot: it.slot } : {}), ...(it.lure ? { lure: it.lure } : {}) });
  }
  return defineItem({ id: it.id, name: it.name, short: shortOf(it.name), kind: it.kind === 'lure' ? 'lure' : 'gear', w: 1, h: 1, kg: it.kg || 0.2, price: it.price || 0, icon: it.id, onYou: effectOnYou(it.effect) });
}
export const shortOf = (name) => { const s = String(name || '').replace(/^(A|An|The) /, '').replace(/,.*$/, ''); const w = s.split(' '); return w.length > 2 ? w.slice(-2).join(' ') : s; };
// the short name in an item's corner: its own, the stand-in's, else the last words of its name
export const short = (d) => (d ? d.short || (LOCAL[d.id] && LOCAL[d.id].short) || (d.cooked && /^hot:/.test(d.id) && itemDef(d.cooked) ? `Hot ${lower(short(itemDef(d.cooked)))}` : shortOf(d.name)) : ''); // (a cooked meal: "Hot supper")
// the footprint of an item, turned or not
export const dims = (d, rot) => { const w = d ? d.w || 1 : 1, h = d ? d.h || 1 : 1; return rot ? [h, w] : [w, h]; };
export const gridSize = (c) => { const d = itemDef(c && c.item), k = (d && d.container) || (c && c.size) || { cols: 4, rows: 4 }; return { cols: k.cols, rows: k.rows, accepts: k.accepts || null }; };
export const acceptsKind = (c, d) => { const a = gridSize(c).accepts; return !a || !d || a.includes(d.kind); };
// what a container and its contents weigh (kg)
export function weightOf(c) {
  const own = itemDef(c.item);
  let kg = own ? own.kg || 0 : 0;
  for (const e of c.grid || []) { if (e.box) continue; const d = itemDef(e.id); kg += (d ? d.kg || 0 : 0) * (e.qty || 1); }
  return kg;
}
export const kgText = (kg) => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg < 10 ? kg.toFixed(1) : Math.round(kg)} kg`);
// a load in words: light, fair, heavy, a real load
export function loadWords(kg) {
  if (kg < 0.05) return 'nothing to speak of';
  if (kg < 8) return 'a light load';
  if (kg < 18) return 'a fair load';
  if (kg < 28) return 'a heavy load';
  if (kg < 40) return 'a real voyageur’s load';
  return 'more than anyone should carry';
}

// The cells an item at (x, y, rot) would take in container c, and whether they are free (ignoring the entry uid);
// 'merge' when it lands on the same stackable item with room
export function placeCheck(c, itemId, x, y, rot, ignore = null, qty = 1) {
  const d = itemDef(itemId); if (!d) return 'no';
  const { cols, rows } = gridSize(c), [w, h] = dims(d, rot);
  if (!acceptsKind(c, d)) return 'no';
  for (const e of c.grid || []) {
    if (e.uid === ignore) continue;
    const ed = itemDef(e.id), [ew, eh] = dims(ed, e.rot);
    if (x < e.x + ew && x + w > e.x && y < e.y + eh && y + h > e.y) {
      if (e.id === itemId && (d.stack || 1) > 1 && x >= e.x && y >= e.y && x < e.x + ew && y < e.y + eh) return (e.qty || 1) + qty <= d.stack ? 'merge' : 'no';
      return 'no';
    }
  }
  if (x < 0 || y < 0 || x + w > cols || y + h > rows) return 'no';
  return 'ok';
}
// the first spot in c where it fits (a stack with room first, then a free spot, turned if it must be)
export function firstFit(c, itemId, qty = 1, { merge = true } = {}) {
  const d = itemDef(itemId); if (!d || !acceptsKind(c, d)) return null;
  if (merge && (d.stack || 1) > 1) for (const e of c.grid || []) if (e.id === itemId && (e.qty || 1) + qty <= d.stack) return { x: e.x, y: e.y, rot: e.rot || 0, merge: e.uid };
  const { cols, rows } = gridSize(c);
  for (const rot of d.w === d.h ? [0] : [0, 1]) for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (placeCheck(c, itemId, x, y, rot) === 'ok') return { x, y, rot };
  return null;
}

// --- the stand-in model (until stream A's inventory.js is in the build) ---------------------------------------------
let uidN = 1;
const nuid = () => `s${(uidN++).toString(36)}`;
export class StubInventory {
  constructor({ player = null, energy = null, outfitter = null } = {}) {
    this.player = player; this.energy = energy; this.outfitter = outfitter; this.stub = true;
    this.fns = new Set();
    this.containers = [];
    this.reset();
  }
  reset() {
    const C = (id, item, where, grid = []) => ({ id, item, where, grid: grid.map((g) => ({ uid: nuid(), rot: 0, qty: 1, ...g })), at: null });
    this.containers = [
      C('pockets', 'pockets', 'pockets', [{ id: 'snack:chocolate', x: 0, y: 0 }]),
      C('pack-1', 'pack3', 'back', [{ id: 'aframe', x: 0, y: 0 }, { id: 'sleepingbag', x: 0, y: 4 }, { id: 'clothes', x: 2, y: 4 }, { id: 'pot', x: 4, y: 4 }, { id: 'tarp', x: 4, y: 6 }, { id: 'tablets', x: 2, y: 0 }, { id: 'meal:supper', x: 3, y: 0 }, { id: 'meal:supper', x: 4, y: 0 }, { id: 'meal:breakfast', x: 5, y: 0 }, { id: 'meal:breakfast', x: 5, y: 1 }, { id: 'snack:trailmix', x: 2, y: 1 }]),
      C('tackle-1', 'tacklebox', 'canoe', [{ id: 'lure:jig', x: 0, y: 0 }, { id: 'lure:mepps', x: 1, y: 0 }]),
      C('bucket-1', 'bucket', 'canoe', [{ id: 'leeches', x: 0, y: 0, qty: 12 }]),
    ];
    this.long = [{ uid: nuid(), id: 'rod', where: 'canoe', inUse: true }, { uid: nuid(), id: 'ash', where: 'hands', inUse: true }];
    this.changed();
  }
  onChange(fn) { this.fns.add(fn); return () => this.fns.delete(fn); }
  changed(what = 'items') { this.syncFood(); for (const fn of this.fns) { try { fn(what); } catch (e) { console.warn('inventory.onChange', e); } } }
  // the stand-in keeps the old food readout going: two meals a day of food
  syncFood() { const en = this.energy; if (en && !en.sandbox) en.food = this.count('meal') / 2; }
  byId(id) { return this.containers.find((c) => c.id === id) || null; }
  find(uid) { for (const c of this.containers) { const e = c.grid.find((g) => g.uid === uid); if (e) return { c, e }; } return null; }
  get atStash() { const o = this.outfitter; return !!(o && (o.open || o.visit)); }
  reachable(player = this.player) {
    if (this.atStash) return this.containers.slice();
    const p = player, canoe = p && (p.mode === 'paddle' || (p.hull && Math.hypot(p.hull.x - p.x, p.hull.z - p.z) < 3));
    return this.containers.filter((c) => c.where === 'back' || c.where === 'hands' || c.where === 'pockets' || c.where === 'chest' || (c.where === 'canoe' && canoe) || ((c.where === 'ground' || c.where === 'hung') && c.at && p && Math.hypot(c.at.x - p.x, c.at.z - p.z) < 3));
  }
  fits(cId, itemId, x, y, rot = 0, ignore = null) { const c = this.byId(cId); return !!c && placeCheck(c, itemId, x, y, rot, ignore) === 'ok'; }
  place(itemId, qty = 1, { prefer = [] } = {}) {
    const list = this.reachable(), order = [...prefer.map((id) => list.find((c) => c.id === id)).filter(Boolean), ...list];
    for (const c of order) { const f = firstFit(c, itemId, qty); if (f && this.put(c.id, itemId, { ...f, qty })) return { ok: true, cId: c.id, placed: qty }; }
    return { ok: false, why: 'room', placed: 0 };
  }
  weight(cId) { if (cId) { const c = this.byId(cId); return c ? weightOf(c) : 0; } return this.containers.filter((c) => ['back', 'chest', 'hands', 'pockets'].includes(c.where)).reduce((k, c) => k + weightOf(c), 0); }
  put(cId, itemId, { x, y, rot = 0, qty = 1 } = {}) {
    const c = this.byId(cId); if (!c) return false;
    if (x == null) { const f = firstFit(c, itemId, qty); if (!f) return false; x = f.x; y = f.y; rot = f.rot; }
    const ok = placeCheck(c, itemId, x, y, rot, null, qty);
    if (ok === 'no') return false;
    if (ok === 'merge') { const e = c.grid.find((g) => g.id === itemId && x >= g.x && y >= g.y); e.qty = (e.qty || 1) + qty; }
    else c.grid.push({ uid: nuid(), id: itemId, x, y, rot, qty });
    this.changed(); return true;
  }
  take(cId, uid, qty = null) {
    const c = this.byId(cId); if (!c) return null; const i = c.grid.findIndex((g) => g.uid === uid); if (i < 0) return null;
    const e = c.grid[i];
    if (qty != null && qty < (e.qty || 1)) { e.qty -= qty; this.changed(); return { ...e, uid: nuid(), qty }; }
    c.grid.splice(i, 1); this.changed(); return e;
  }
  move(fromC, uid, toC, x, y, rot = 0, qty = null) {
    const a = this.byId(fromC), b = this.byId(toC); if (!a || !b) return false;
    const e = a.grid.find((g) => g.uid === uid); if (!e) return false;
    const n = qty == null ? e.qty || 1 : Math.min(qty, e.qty || 1), whole = n >= (e.qty || 1);
    const ok = placeCheck(b, e.id, x, y, rot, whole ? uid : null, n);
    if (ok === 'no') return false;
    if (ok === 'merge') { const t = b.grid.find((g) => g.uid !== uid && g.id === e.id && x >= g.x && y >= g.y && x < g.x + dims(itemDef(g.id), g.rot)[0] && y < g.y + dims(itemDef(g.id), g.rot)[1]); t.qty = (t.qty || 1) + n; if (whole) a.grid.splice(a.grid.indexOf(e), 1); else e.qty -= n; }
    else if (whole) { a.grid.splice(a.grid.indexOf(e), 1); Object.assign(e, { x, y, rot }); b.grid.push(e); }
    else { e.qty -= n; b.grid.push({ uid: nuid(), id: e.id, x, y, rot, qty: n }); }
    this.changed(); return true;
  }
  count(itemOrKind, reach = false) {
    let n = 0;
    for (const c of reach ? this.reachable() : this.containers) for (const e of c.grid) { const d = itemDef(e.id); if (e.id === itemOrKind || (d && d.kind === itemOrKind)) n += e.qty || 1; }
    return n;
  }
  has(itemId, { reachable = false } = {}) { return this.count(itemId, reachable) > 0; }
  addContainer(itemId, where = 'stash') {
    const n = this.containers.filter((c) => c.item === itemId).length + 1;
    const c = { id: `${itemId}-${n}-${nuid()}`, item: itemId, where, grid: [], at: null };
    this.containers.push(c); this.changed('containers'); return c;
  }
  addLong(itemId, where = 'stash') { const e = { uid: nuid(), id: itemId, where, inUse: false }; this.long.push(e); this.changed('long'); return e; }
  meals() { return this.count('meal', true); }
  snacks() { return this.count('snack', true); }
  foodWords() { const m = this.meals(), s = this.snacks(); return `${m} ${m === 1 ? 'meal' : 'meals'}${s ? ` and ${s} ${s === 1 ? 'snack' : 'snacks'}` : ''}`; }
  drop(cId, uid, qty = null) { const e = this.take(cId, uid, qty), p = this.player; if (!e) return { ok: false, why: 'gone' }; const pile = this.addContainer('pockets', 'ground'); pile.at = p ? { x: p.x, z: p.z } : null; pile.item = 'pile'; pile.size = { cols: 4, rows: 4 }; pile.name = 'On the ground'; Object.assign(e, { x: 0, y: 0 }); pile.grid.push(e); this.changed(); return { ok: true, words: 'Set down on the ground.' }; }
  eat(uid) {
    const f = this.find(uid); if (!f) return { ok: false, why: 'gone', words: 'Nothing there to eat.' };
    const d = itemDef(f.e.id), en = this.energy;
    if (!d || !d.eat) return { ok: false, why: 'food', words: `You can’t eat ${lower(d ? d.name : 'that')}.` };
    if (d.eat.cook) return { ok: false, why: 'cook', words: `${d.name} wants cooking first: the pot on the grate at a fire.` };
    if (en && !en.still) return { ok: false, why: 'still', words: 'Hold still to eat.' };
    if ((f.e.qty || 1) > 1) f.e.qty -= 1; else f.c.grid.splice(f.c.grid.indexOf(f.e), 1);
    if (en) { en.feed && en.feed(d.eat.food * 0.6); en.lift && en.lift(d.eat.food * 0.25); }
    this.changed();
    return { ok: true, words: `You eat the ${lower(short(d))}.` };
  }
  thing(id) { return this.byId(id) || this.long.find((l) => l.uid === id) || null; }
  to(id, where, at = null) { const t = this.thing(id); if (!t) return { ok: false, why: 'gone' }; t.where = where; t.at = at; this.changed('containers'); return { ok: true, words: '' }; }
  setDown(id) { const p = this.player; return this.to(id, 'ground', p ? { x: p.x, z: p.z } : null); }
  load(id) { return this.to(id, 'canoe'); }
  stow(id) { return this.atStash ? this.to(id, 'stash') : { ok: false, why: 'stash', words: 'Only at an outfitter.' }; }
  carry(id, where = 'back') { for (const o of [...this.containers, ...this.long]) if (o.uid !== id && o.id !== id && o.where === where && where !== 'hands') o.where = this.atStash ? 'stash' : 'ground'; return this.to(id, where); }
}
const lower = (s) => (/^(Duluth|Johnson|Mepps|Rapala|Lazy Ike|[A-Z]-)/.test(String(s)) ? String(s) : String(s).charAt(0).toLowerCase() + String(s).slice(1)); // (a name keeps its capital)

// --- the icons ----------------------------------------------------------------------------------------------------
// Flat shapes in the game's palette with a soft ink edge, drawn once per size on a 2D canvas and cached. Each drawing
// has its own design box [w, h] and is letterboxed into the item's footprint (a cell is 50 px, so a 1×1 item reads at
// 48). A turned item is drawn unturned and turned by the grid.
const INK = '#2a2016';
const PAL = { canvas: '#a58d5c', canvasD: '#8a7448', leather: '#5b3a22', brass: '#c9a24a', blue: '#2f68a8', blueD: '#24528a', cream: '#efe6cf', paper: '#ebe2cb', red: '#b4321f', moss: '#5f7f45',
  green: '#3d6b47', silver: '#c9ced2', steel: '#8e959b', wood: '#b48a58', woodD: '#7a5634', black: '#26231f', orange: '#d9663f', gold: '#dcb469', lake: '#5d8fb0', foil: '#b9bdc0' };
function fill(c, col, path) { c.fillStyle = col; c.fill(path || undefined); }
function stroke(c, w = 2.2, col = INK) { c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function shape(c, pts, close = true) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); if (close) c.closePath(); }
function dots(c, col, list, r = 2.2) { c.fillStyle = col; for (const [x, y] of list) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); } }
function label(c, text, x, y, size = 13, col = INK) { c.font = `700 ${size}px "Alegreya Sans SC", "Alegreya Sans", sans-serif`; c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y); }
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function drawPack(c, big) {
  // the shoulder straps behind, the body, the flap, two straps and buckles, the tump
  shape(c, [26, 20, 34, 6, 42, 20]); stroke(c, 5, PAL.leather);
  shape(c, [58, 20, 66, 6, 74, 20]); stroke(c, 5, PAL.leather);
  rr(c, 10, 18, 80, 86, 10); fill(c, PAL.canvas); stroke(c);
  rr(c, 10, 18, 80, 10, 4); fill(c, PAL.canvasD);
  c.beginPath(); c.moveTo(12, 22); c.lineTo(88, 22); c.lineTo(86, 62); c.quadraticCurveTo(50, 70, 14, 62); c.closePath(); fill(c, PAL.canvasD); stroke(c, 2);
  for (const x of [32, 68]) { rr(c, x - 5, 26, 10, 66, 2); fill(c, PAL.leather); stroke(c, 1.5); rr(c, x - 7, 60, 14, 11, 2); fill(c, PAL.brass); stroke(c, 1.5); }
  label(c, big ? '#4' : '#3', 50, 86, 14, '#efe6cf');
}
function drawBarrel(c, tall) {
  const top = tall ? 10 : 18;
  rr(c, 16, top, 68, 104 - top, 12); fill(c, PAL.blue); stroke(c);
  for (const y of [top + 26, 82]) { rr(c, 14, y, 72, 7, 3); fill(c, PAL.blueD); stroke(c, 1.4); }
  rr(c, 12, top - 4, 76, 14, 4); fill(c, PAL.black); stroke(c, 1.6);
  rr(c, 40, top - 7, 20, 6, 2); fill(c, PAL.steel); stroke(c, 1.2);
  c.globalAlpha = 0.35; rr(c, 24, top + 12, 8, 104 - top - 22, 4); fill(c, '#fff'); c.globalAlpha = 1;
  shape(c, [30, top + 10, 30, 104]); stroke(c, 3, PAL.black); shape(c, [70, top + 10, 70, 104]); stroke(c, 3, PAL.black);
}
function drawBucket(c) {
  c.beginPath(); c.moveTo(18, 32); c.quadraticCurveTo(50, -6, 82, 32); stroke(c, 3, PAL.steel);
  shape(c, [14, 34, 86, 34, 78, 96, 22, 96]); fill(c, '#e4dfd1'); stroke(c);
  rr(c, 10, 26, 80, 12, 4); fill(c, '#3e7f86'); stroke(c, 1.8);
  dots(c, '#1d4a50', [[30, 32], [42, 32], [54, 32], [66, 32]], 1.8);
  shape(c, [20, 60, 80, 60]); stroke(c, 1.2, '#b9b2a0');
  label(c, 'BAIT', 50, 76, 14, '#3e7f86');
}
function drawTackle(c) {
  rr(c, 40, 4, 40, 16, 6); stroke(c, 5, PAL.black);
  rr(c, 8, 18, 104, 58, 6); fill(c, PAL.green); stroke(c);
  rr(c, 8, 18, 104, 18, 6); fill(c, '#4f8a5c'); stroke(c, 1.6);
  for (const x of [26, 94]) { rr(c, x - 6, 32, 12, 9, 2); fill(c, PAL.silver); stroke(c, 1.3); }
  shape(c, [16, 56, 104, 56]); stroke(c, 1.2, '#2c4f34');
}
function drawPockets(c) {
  shape(c, [10, 12, 90, 12, 86, 74, 50, 90, 14, 74]); fill(c, '#7d6a4a'); stroke(c);
  shape(c, [10, 12, 90, 12, 88, 34, 12, 34]); fill(c, '#6a583c'); stroke(c, 1.6);
  c.setLineDash([3, 3]); shape(c, [16, 40, 84, 40, 81, 70, 50, 83, 19, 70]); stroke(c, 1.3, PAL.cream); c.setLineDash([]);
}
function drawMapCase(c) {
  rr(c, 10, 12, 60, 92, 4); fill(c, 'rgba(210,228,236,.9)'); stroke(c);
  rr(c, 16, 24, 48, 74, 2); fill(c, PAL.paper);
  ell(c, 34, 50, 12, 8, 0.4); fill(c, PAL.lake); ell(c, 50, 74, 9, 12, -0.3); fill(c, PAL.lake);
  c.setLineDash([3, 3]); shape(c, [36, 56, 46, 66], false); stroke(c, 1.6, PAL.red); c.setLineDash([]);
  rr(c, 8, 8, 64, 10, 3); fill(c, PAL.black); stroke(c, 1.4);
}
function drawBag(c, fillCol, speck, seal = PAL.blue) {
  shape(c, [10, 20, 50, 20, 52, 98, 8, 98]); fill(c, 'rgba(240,236,226,.95)'); stroke(c);
  shape(c, [12, 40, 48, 40, 50, 96, 10, 96]); fill(c, fillCol);
  const r = rng(fillCol.length * 977);
  for (const [col, n] of speck) { c.fillStyle = col; for (let i = 0; i < n; i++) { c.beginPath(); c.arc(14 + r() * 32, 44 + r() * 50, 1.8, 0, Math.PI * 2); c.fill(); } }
  rr(c, 8, 14, 44, 8, 2); fill(c, seal); stroke(c, 1.4);
  rr(c, 14, 26, 32, 10, 2); fill(c, PAL.cream); stroke(c, 1.1);
}
function drawFreeze(c) {
  shape(c, [10, 14, 60, 14, 64, 104, 6, 104]); fill(c, PAL.foil); stroke(c);
  for (let x = 12; x < 60; x += 5) { shape(c, [x, 14, x, 22]); stroke(c, 1, '#8c9196'); }
  rr(c, 10, 40, 50, 36, 2); fill(c, PAL.orange); stroke(c, 1.4);
  rr(c, 16, 50, 38, 16, 2); fill(c, PAL.cream);
  label(c, 'HOT', 35, 58, 12, PAL.orange);
  shape(c, [8, 30, 14, 30]); stroke(c, 1.6);
}
function drawTrailMix(c) {
  shape(c, [12, 14, 68, 14, 72, 74, 8, 74]); fill(c, 'rgba(240,236,226,.95)'); stroke(c);
  const r = rng(31);
  for (let i = 0; i < 26; i++) { const x = 16 + r() * 48, y = 28 + r() * 42, k = r(); c.fillStyle = k < 0.45 ? '#c99a5b' : k < 0.7 ? '#4a2c26' : ['#c0392b', '#e0b13a', '#3f7fbf', '#4f9a4f'][Math.floor(r() * 4)]; ell(c, x, y, k < 0.45 ? 4 : 3, k < 0.45 ? 2.6 : 3, r() * 3); c.fill(); }
  rr(c, 10, 10, 60, 8, 2); fill(c, PAL.red); stroke(c, 1.4);
}
function drawJerky(c) {
  rr(c, 6, 10, 78, 52, 6); fill(c, 'rgba(240,236,226,.95)'); stroke(c);
  for (const [y, rot] of [[26, -0.12], [38, 0.08], [50, -0.05]]) { ell(c, 46, y, 32, 5.5, rot); fill(c, '#6b3424'); stroke(c, 1.2); }
  rr(c, 10, 14, 26, 14, 2); fill(c, '#c8a87a'); stroke(c, 1.1);
}
function drawChocolate(c) {
  rr(c, 6, 12, 98, 32, 3); fill(c, '#5a2e1e'); stroke(c);
  rr(c, 78, 12, 26, 32, 2); fill(c, PAL.foil); stroke(c, 1.4);
  rr(c, 22, 18, 46, 20, 2); fill(c, PAL.red); stroke(c, 1.2);
  label(c, 'CHOC', 45, 28, 12, PAL.cream);
}
const FISH_COL = { walleye: ['#9a8f4a', '#d9cf8a'], pike: ['#4f6b3a', '#c9d49a'], smallmouth: ['#8a6a3a', '#d6c08a'], laketrout: ['#6a7880', '#d7dde0'], crappie: ['#7a8a88', '#e2e6dc'], perch: ['#8a8a2a', '#e6d870'] };
function drawFish(c, sp) {
  const [back, belly] = FISH_COL[sp] || FISH_COL.walleye;
  shape(c, [100, 25, 118, 10, 116, 25, 118, 40]); fill(c, back); stroke(c, 1.6);
  c.beginPath(); c.moveTo(8, 25); c.quadraticCurveTo(40, 2, 100, 25); c.quadraticCurveTo(40, 48, 8, 25); fill(c, belly); stroke(c);
  c.beginPath(); c.moveTo(10, 23); c.quadraticCurveTo(40, 4, 98, 23); c.quadraticCurveTo(50, 22, 10, 23); fill(c, back);
  if (sp === 'perch' || sp === 'smallmouth') for (let x = 30; x < 90; x += 12) { shape(c, [x, 12, x + 3, 34]); stroke(c, 2.5, 'rgba(40,40,20,.45)'); }
  if (sp === 'pike' || sp === 'laketrout') dots(c, 'rgba(240,240,220,.7)', [[30, 20], [44, 28], [58, 18], [70, 27], [82, 21]], 2.2);
  dots(c, INK, [[20, 22]], 2.6);
}
function drawLeeches(c) {
  for (const [y, ph] of [[24, 0], [42, 1.3], [60, 2.4]]) { c.beginPath(); for (let x = 10; x <= 70; x += 3) { const yy = y + Math.sin(x / 8 + ph) * 5; if (x === 10) c.moveTo(x, yy); else c.lineTo(x, yy); } stroke(c, 7, '#3b3a26'); stroke(c, 3.5, '#5b5a36'); }
}
function drawJig(c) {
  c.beginPath(); c.moveTo(30, 30); c.bezierCurveTo(50, 10, 60, 50, 74, 26); stroke(c, 7, '#d6e05a'); stroke(c, 2.2, '#9aa830');
  c.beginPath(); c.arc(22, 32, 14, 0, Math.PI * 2); fill(c, PAL.red); stroke(c);
  dots(c, '#f3ecdd', [[18, 28]], 4); dots(c, INK, [[18, 28]], 2);
  c.beginPath(); c.moveTo(30, 40); c.quadraticCurveTo(46, 58, 54, 44); stroke(c, 2, PAL.steel);
}
function drawMepps(c) {
  shape(c, [30, 4, 30, 18]); stroke(c, 1.6, PAL.steel); c.beginPath(); c.arc(30, 6, 3, 0, 7); stroke(c, 1.4, PAL.steel);
  ell(c, 22, 34, 13, 20, 0.25); fill(c, PAL.silver); stroke(c); ell(c, 22, 34, 6, 11, 0.25); fill(c, '#e6e8ea');
  for (let y = 22; y < 62; y += 8) { ell(c, 34, y + 6, 5, 4); fill(c, PAL.brass); stroke(c, 1.2); }
  shape(c, [34, 66, 34, 82]); stroke(c, 1.6, PAL.steel); ell(c, 34, 88, 9, 10); fill(c, '#8a6a4a');
  dots(c, PAL.red, [[30, 92], [38, 92]], 2.4);
}
function drawDaredevle(c) {
  c.beginPath(); c.moveTo(25, 6); c.quadraticCurveTo(50, 40, 34, 86); c.quadraticCurveTo(25, 96, 16, 86); c.quadraticCurveTo(0, 40, 25, 6); fill(c, PAL.cream); stroke(c);
  c.save(); c.clip();
  for (let y = 10; y < 90; y += 18) { c.beginPath(); c.moveTo(0, y); c.lineTo(50, y + 8); c.lineTo(50, y + 17); c.lineTo(0, y + 9); fill(c, PAL.red); }
  c.restore(); c.beginPath(); c.moveTo(25, 6); c.quadraticCurveTo(50, 40, 34, 86); c.quadraticCurveTo(25, 96, 16, 86); c.quadraticCurveTo(0, 40, 25, 6); stroke(c);
  c.beginPath(); c.arc(25, 4, 3, 0, 7); stroke(c, 1.4, PAL.steel);
}
function drawRapala(c) {
  c.beginPath(); c.moveTo(14, 25); c.quadraticCurveTo(30, 6, 60, 12); c.lineTo(60, 38); c.quadraticCurveTo(30, 44, 14, 25); fill(c, PAL.silver); stroke(c);
  c.beginPath(); c.moveTo(64, 12); c.quadraticCurveTo(96, 12, 110, 25); c.quadraticCurveTo(96, 38, 64, 38); c.closePath(); fill(c, PAL.silver); stroke(c);
  c.beginPath(); c.moveTo(16, 22); c.quadraticCurveTo(30, 8, 60, 14); c.lineTo(60, 20); c.quadraticCurveTo(34, 18, 16, 22); fill(c, '#2c3e58');
  c.beginPath(); c.moveTo(64, 14); c.quadraticCurveTo(96, 14, 108, 22); c.quadraticCurveTo(90, 19, 64, 20); fill(c, '#2c3e58');
  shape(c, [14, 26, 2, 34, 12, 32]); fill(c, 'rgba(220,230,236,.8)'); stroke(c, 1.3);
  dots(c, INK, [[22, 22]], 2.4);
  shape(c, [44, 40, 44, 48]); stroke(c, 1.4, PAL.steel); shape(c, [100, 32, 108, 44]); stroke(c, 1.4, PAL.steel);
}
function drawSilverMinnow(c) {
  c.beginPath(); c.moveTo(25, 8); c.quadraticCurveTo(46, 50, 30, 90); c.quadraticCurveTo(25, 96, 20, 90); c.quadraticCurveTo(4, 50, 25, 8); fill(c, '#dfe3e6'); stroke(c);
  c.beginPath(); c.moveTo(25, 14); c.quadraticCurveTo(36, 50, 27, 84); stroke(c, 2, '#ffffff');
  c.beginPath(); c.moveTo(25, 30); c.quadraticCurveTo(46, 70, 30, 98); stroke(c, 1.4, PAL.steel);
}
function drawLazyIke(c) {
  c.beginPath(); c.moveTo(10, 30); c.quadraticCurveTo(40, 2, 100, 18); c.quadraticCurveTo(70, 46, 10, 30); fill(c, '#e8c33a'); stroke(c);
  dots(c, PAL.red, [[36, 22], [52, 18], [66, 26], [80, 20], [46, 30]], 3);
  dots(c, INK, [[20, 26]], 2.4);
  shape(c, [50, 36, 50, 46]); stroke(c, 1.4, PAL.steel); shape(c, [96, 22, 104, 32]); stroke(c, 1.4, PAL.steel);
}
function drawTablets(c) {
  rr(c, 18, 22, 34, 44, 6); fill(c, '#6a4a2a'); stroke(c);
  rr(c, 16, 10, 38, 14, 3); fill(c, PAL.cream); stroke(c, 1.6);
  rr(c, 22, 34, 26, 20, 2); fill(c, PAL.cream); label(c, 'H₂O', 35, 44, 10, PAL.blue);
}
function drawPump(c) {
  rr(c, 16, 22, 28, 62, 6); fill(c, '#3f7fbf'); stroke(c);
  rr(c, 26, 6, 8, 18, 2); fill(c, PAL.steel); stroke(c, 1.4); rr(c, 14, 2, 32, 8, 3); fill(c, PAL.black); stroke(c, 1.4);
  c.beginPath(); c.moveTo(44, 70); c.bezierCurveTo(70, 70, 64, 100, 40, 100); c.bezierCurveTo(20, 100, 24, 90, 30, 88); stroke(c, 3, '#9fb8c8');
}
function drawGravity(c) {
  c.beginPath(); c.moveTo(14, 18); c.lineTo(76, 18); c.quadraticCurveTo(84, 60, 64, 76); c.lineTo(26, 76); c.quadraticCurveTo(6, 60, 14, 18); fill(c, 'rgba(120,170,210,.85)'); stroke(c);
  rr(c, 12, 10, 66, 10, 3); fill(c, PAL.black); stroke(c, 1.4);
  c.beginPath(); c.moveTo(45, 76); c.bezierCurveTo(45, 96, 70, 92, 72, 104); stroke(c, 3, '#9fb8c8');
  rr(c, 38, 84, 14, 14, 3); fill(c, PAL.steel); stroke(c, 1.4);
}
function drawSaw(c) {
  rr(c, 8, 12, 64, 22, 8); fill(c, PAL.orange); stroke(c);
  shape(c, [70, 16, 104, 22, 104, 28, 70, 30]); fill(c, PAL.silver); stroke(c, 1.6);
  for (let x = 74; x < 104; x += 5) { shape(c, [x, 30, x + 2.5, 34, x + 5, 30], false); stroke(c, 1, INK); }
  dots(c, PAL.steel, [[66, 23]], 3);
}
function drawCamera(c) {
  rr(c, 8, 18, 84, 44, 5); fill(c, PAL.silver); stroke(c);
  rr(c, 8, 18, 84, 12, 4); fill(c, PAL.black); stroke(c, 1.4);
  rr(c, 22, 8, 22, 12, 2); fill(c, PAL.black); stroke(c, 1.4);
  c.beginPath(); c.arc(54, 42, 16, 0, 7); fill(c, PAL.black); stroke(c); c.beginPath(); c.arc(54, 42, 8, 0, 7); fill(c, '#3c5a72');
  dots(c, '#e6e8ea', [[50, 38]], 2.4);
}
function drawPad(c) {
  rr(c, 6, 10, 98, 30, 14); fill(c, '#3f6fa0'); stroke(c);
  for (const x of [30, 55, 80]) { shape(c, [x, 12, x, 38]); stroke(c, 1.4, '#2c5078'); }
  ell(c, 98, 25, 6, 13); fill(c, '#e0c050'); stroke(c, 1.6);
  shape(c, [20, 10, 20, 40]); stroke(c, 3, PAL.black); shape(c, [86, 10, 86, 40]); stroke(c, 3, PAL.black);
}
function drawYokePads(c) {
  for (const x of [8, 58]) { rr(c, x, 14, 44, 24, 10); fill(c, '#2e3a46'); stroke(c); rr(c, x + 6, 18, 32, 8, 4); fill(c, '#45576a'); }
}
function drawTentSack(c, col) {
  c.beginPath(); c.moveTo(14, 16); c.lineTo(56, 16); c.quadraticCurveTo(64, 60, 58, 100); c.lineTo(12, 100); c.quadraticCurveTo(6, 60, 14, 16); fill(c, col); stroke(c);
  rr(c, 12, 10, 46, 9, 3); fill(c, PAL.black); stroke(c, 1.3);
  shape(c, [35, 6, 35, 12]); stroke(c, 2, PAL.cream);
  shape(c, [20, 74, 35, 48, 50, 74]); stroke(c, 3, 'rgba(243,236,221,.85)'); shape(c, [35, 48, 35, 74]); stroke(c, 1.6, 'rgba(243,236,221,.85)');
}
function drawPaddle(c, kind) {
  const blade = kind === 'carbon' ? '#2a2a2a' : kind === 'bentshaft' ? '#9a6a3a' : kind === 'ottertail' ? '#8a4a2a' : '#c9a46a';
  const shaft = kind === 'carbon' ? '#3a3a3a' : kind === 'ottertail' ? '#9a5a36' : '#c09060';
  rr(c, 6, 16, 18, 10, 4); fill(c, shaft); stroke(c, 1.8);
  rr(c, 20, 18, kind === 'bentshaft' || kind === 'carbon' ? 74 : 80, 6, 3); fill(c, shaft); stroke(c, 1.6);
  c.beginPath();
  if (kind === 'ottertail') { c.moveTo(92, 21); c.quadraticCurveTo(120, 8, 168, 18); c.quadraticCurveTo(172, 21, 168, 24); c.quadraticCurveTo(120, 34, 92, 21); }
  else { const by = kind === 'bentshaft' || kind === 'carbon' ? 25 : 21; c.moveTo(96, 21); c.quadraticCurveTo(110, by - 15, 150, by - 13); c.quadraticCurveTo(168, by, 150, by + 13); c.quadraticCurveTo(110, by + 15, 96, 21); }
  fill(c, blade); stroke(c);
  if (kind === 'bentshaft') for (const y of [14, 22, 30]) { shape(c, [108, y, 150, y + 1]); stroke(c, 1, 'rgba(255,240,210,.45)'); }
}
function drawRod(c, mh) {
  shape(c, [8, 22, 168, 18]); stroke(c, mh ? 3.4 : 2.6, '#3a3a40');
  rr(c, 8, 18, 34, 9, 4); fill(c, '#c9a46a'); stroke(c, 1.4);
  for (const x of [70, 104, 134, 158]) { c.beginPath(); c.arc(x, 15, 2.4, 0, 7); stroke(c, 1.2, PAL.steel); }
  c.beginPath(); c.arc(46, 32, 8, 0, 7); fill(c, PAL.steel); stroke(c, 1.6); shape(c, [46, 24, 46, 21]); stroke(c, 2);
  shape(c, [168, 18, 172, 34], false); stroke(c, 0.8, '#7a7a7a');
}
function drawCanoe(c, col, rim) {
  c.beginPath(); c.moveTo(4, 14); c.quadraticCurveTo(10, 40, 30, 42); c.lineTo(140, 42); c.quadraticCurveTo(160, 40, 166, 14); c.quadraticCurveTo(85, 28, 4, 14); fill(c, col); stroke(c);
  c.beginPath(); c.moveTo(4, 14); c.quadraticCurveTo(85, 28, 166, 14); stroke(c, 3, rim);
  shape(c, [85, 24, 85, 40]); stroke(c, 1.5, 'rgba(40,30,20,.4)');
}
function drawMap(c) {
  shape(c, [8, 12, 38, 6, 64, 12, 92, 6, 92, 90, 64, 96, 38, 90, 8, 96]); fill(c, PAL.paper); stroke(c);
  ell(c, 30, 40, 14, 9, 0.5); fill(c, PAL.lake); ell(c, 62, 62, 16, 10, -0.4); fill(c, PAL.lake); ell(c, 70, 28, 8, 6); fill(c, PAL.lake);
  c.setLineDash([3, 3]); c.beginPath(); c.moveTo(40, 46); c.lineTo(52, 56); stroke(c, 2, PAL.red); c.setLineDash([]);
  for (const [x, y, r] of [[22, 74, 8], [80, 82, 6]]) { c.beginPath(); c.arc(x, y, r, 0, 7); stroke(c, 1, '#a08a60'); }
  shape(c, [38, 6, 38, 90]); stroke(c, 1, 'rgba(60,40,20,.3)'); shape(c, [64, 12, 64, 96]); stroke(c, 1, 'rgba(60,40,20,.3)');
  dots(c, PAL.red, [[46, 30]], 3);
}
function drawBerries(c) {
  shape(c, [12, 36, 68, 36, 62, 74, 18, 74]); fill(c, '#d8c79a'); stroke(c);
  const r = rng(7); for (let i = 0; i < 16; i++) { c.beginPath(); c.arc(20 + r() * 40, 24 + r() * 16, 5, 0, 7); fill(c, i % 5 ? '#3a4f8a' : '#56609a'); stroke(c, 1); }
}
function drawMushroom(c) {
  c.beginPath(); c.moveTo(10, 30); c.quadraticCurveTo(40, 0, 70, 30); c.quadraticCurveTo(40, 38, 10, 30); fill(c, '#e09a2a'); stroke(c);
  shape(c, [32, 34, 48, 34, 46, 72, 34, 72]); fill(c, '#f0c870'); stroke(c);
}
function drawFirewood(c) {
  rr(c, 8, 14, 96, 26, 12); fill(c, '#8a6a48'); stroke(c);
  ell(c, 98, 27, 8, 13); fill(c, '#d9b98a'); stroke(c, 1.6); ell(c, 98, 27, 3, 6); stroke(c, 1, '#a0805a');
  shape(c, [20, 22, 70, 20]); stroke(c, 1.2, '#5a4430');
}
function drawCedarYoke(c) {
  c.beginPath(); c.moveTo(6, 16); c.quadraticCurveTo(75, 46, 144, 16); c.lineTo(144, 26); c.quadraticCurveTo(75, 56, 6, 26); c.closePath(); fill(c, '#c49a6a'); stroke(c);
  ell(c, 55, 30, 12, 5, 0.15); fill(c, '#9a6a40'); ell(c, 95, 30, 12, 5, -0.15); fill(c, '#9a6a40');
}
function drawNet(c) {
  ell(c, 40, 40, 30, 32); stroke(c, 5, '#b48a58'); c.save(); ell(c, 40, 40, 28, 30); c.clip();
  for (let k = -60; k < 80; k += 9) { shape(c, [k, 0, k + 60, 80]); stroke(c, 1, '#d6cfbf'); shape(c, [k + 60, 0, k, 80]); stroke(c, 1, '#d6cfbf'); } c.restore();
  rr(c, 36, 70, 8, 46, 3); fill(c, '#b48a58'); stroke(c, 1.6);
}
function drawBlanket(c) {
  rr(c, 8, 10, 84, 70, 6); fill(c, '#e8dcc0'); stroke(c);
  for (const [y, col] of [[18, '#2e6a3a'], [26, '#d9a032'], [34, '#b4321f'], [42, '#2a3f6a']]) { rr(c, 8, y, 84, 6, 0); fill(c, col); }
  rr(c, 8, 10, 84, 70, 6); stroke(c);
}
function drawJacket(c) {
  shape(c, [30, 8, 70, 8, 94, 26, 82, 34, 74, 26, 74, 70, 26, 70, 26, 26, 18, 34, 6, 26]); fill(c, '#5a6a4a'); stroke(c);
  c.save(); c.clip(); for (let x = 0; x < 100; x += 5) { shape(c, [x, 0, x, 80]); stroke(c, 0.6, 'rgba(20,20,10,.4)'); } c.restore();
}
function drawSail(c) {
  shape(c, [10, 4, 10, 106]); stroke(c, 3, PAL.wood); shape(c, [40, 4, 40, 106]); stroke(c, 3, PAL.wood);
  shape(c, [12, 14, 38, 14, 38, 80, 12, 80]); fill(c, '#e6dcc2'); stroke(c, 1.6);
}
function drawCover(c) {
  rr(c, 8, 20, 84, 50, 20); fill(c, '#7a6a48'); stroke(c);
  for (const x of [30, 70]) { rr(c, x - 4, 18, 8, 54, 2); fill(c, PAL.leather); }
}
function drawPole(c) { rr(c, 8, 18, 160, 7, 3); fill(c, '#c9a46a'); stroke(c, 1.8); rr(c, 160, 16, 14, 11, 2); fill(c, PAL.steel); stroke(c, 1.4); }
function drawCopperSpoon(c) {
  c.beginPath(); c.moveTo(25, 6); c.quadraticCurveTo(48, 44, 32, 88); c.quadraticCurveTo(25, 96, 18, 88); c.quadraticCurveTo(2, 44, 25, 6); fill(c, '#c87a3a'); stroke(c);
  dots(c, 'rgba(255,220,180,.6)', [[22, 30], [28, 46], [21, 60], [27, 74]], 3);
}
function drawTump(c) { ell(c, 45, 30, 34, 18); stroke(c, 8, PAL.leather); ell(c, 45, 30, 34, 18); stroke(c, 2); rr(c, 32, 6, 26, 14, 4); fill(c, '#7a5030'); stroke(c, 1.6); }
function drawLeaders(c) { rr(c, 10, 6, 50, 80, 3); fill(c, PAL.cream); stroke(c); for (let y = 16; y < 80; y += 10) { shape(c, [16, y, 54, y]); stroke(c, 1.4, PAL.steel); } }
function drawKneelers(c) { for (const x of [8, 56]) { rr(c, x, 10, 44, 34, 12); fill(c, '#e8dfca'); stroke(c); const r = rng(x); for (let i = 0; i < 10; i++) dots(c, '#cfc3a6', [[x + 6 + r() * 32, 16 + r() * 22]], 2); } }
function drawBagSack(c, col, band) {
  c.beginPath(); c.moveTo(18, 14); c.lineTo(82, 14); c.quadraticCurveTo(92, 60, 84, 100); c.lineTo(16, 100); c.quadraticCurveTo(8, 60, 18, 14); fill(c, col); stroke(c);
  for (const y of [40, 72]) { rr(c, 10, y, 80, 7, 2); fill(c, band); stroke(c, 1.2); }
  rr(c, 16, 8, 68, 9, 3); fill(c, PAL.black); stroke(c, 1.3);
}
function drawDryBag(c) {
  rr(c, 14, 22, 72, 74, 10); fill(c, '#d9b23a'); stroke(c);
  rr(c, 10, 6, 80, 18, 4); fill(c, '#b8902a'); stroke(c, 1.6);
  shape(c, [20, 15, 80, 15]); stroke(c, 1.2, '#8a6a1a'); rr(c, 44, 0, 12, 8, 3); fill(c, PAL.black); stroke(c, 1.2);
}
function drawPot(c) {
  c.beginPath(); c.moveTo(16, 30); c.quadraticCurveTo(50, -8, 84, 30); stroke(c, 2.6, PAL.steel);
  rr(c, 14, 34, 72, 54, 8); fill(c, '#3a3632'); stroke(c);
  rr(c, 10, 28, 80, 10, 4); fill(c, '#55504a'); stroke(c, 1.6);
  rr(c, 44, 22, 12, 6, 2); fill(c, PAL.black); stroke(c, 1.2);
  c.globalAlpha = 0.25; rr(c, 22, 44, 8, 36, 4); fill(c, '#fff'); c.globalAlpha = 1;
}
function drawTarp(c) {
  rr(c, 8, 20, 84, 60, 6); fill(c, '#5d7488'); stroke(c);
  for (const y of [40, 60]) { shape(c, [8, y, 92, y]); stroke(c, 1.2, '#3e5466'); }
  c.beginPath(); c.moveTo(70, 20); c.bezierCurveTo(98, 6, 96, 40, 80, 46); stroke(c, 2, '#e0c060');
}
function drawCrate(c) { rr(c, 8, 18, 84, 66, 2); fill(c, '#a07a4a'); stroke(c); for (const y of [36, 54, 72]) { shape(c, [8, y, 92, y]); stroke(c, 1.4, '#6a4a28'); } shape(c, [8, 18, 92, 84]); stroke(c, 3, '#7a5832'); }
function drawStringer(c) {
  shape(c, [30, 4, 30, 100]); stroke(c, 2.4, PAL.steel);
  for (const y of [22, 46, 70, 94]) { c.beginPath(); c.arc(30, y, 7, Math.PI * 0.2, Math.PI * 1.8); stroke(c, 2.4, PAL.steel); }
  rr(c, 22, 0, 16, 8, 3); fill(c, PAL.brass); stroke(c, 1.2);
}
function drawTag(c, text) { rr(c, 6, 6, 88, 88, 6); fill(c, PAL.paper); stroke(c); label(c, text.slice(0, 3).toUpperCase(), 50, 52, 26); }
// the water bottle (fb3 C, decision 12: an item in the pockets with its litre bar): a wide-mouth bottle, its cap on a loop
function drawBottle(c) {
  rr(c, 14, 24, 40, 80, 9); fill(c, 'rgba(178, 206, 216, .88)'); stroke(c);
  rr(c, 18, 6, 32, 18, 5); fill(c, PAL.blue); stroke(c, 1.6);
  c.beginPath(); c.moveTo(50, 12); c.quadraticCurveTo(66, 10, 60, 28); stroke(c, 2.6, PAL.blueD);
  c.globalAlpha = 0.5; rr(c, 20, 34, 6, 60, 3); fill(c, '#fff'); c.globalAlpha = 1;
  for (const y of [48, 66, 84]) { shape(c, [42, y, 50, y]); stroke(c, 1.3, 'rgba(50, 70, 80, .55)'); }
}
// the things near you, for their panels' straps (fb2): the fire ring, a pitched tent, the latrine, a limb with a rope, the
// canoe ashore, the water's edge, a down log
function drawFireRing(c) {
  ell(c, 50, 70, 40, 16); fill(c, '#3a3128');
  for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2; ell(c, 50 + Math.cos(a) * 38, 70 + Math.sin(a) * 15, 9, 6.5, a); fill(c, i % 3 ? '#8e8a80' : '#a5a196'); stroke(c, 1.4); }
  shape(c, [30, 74, 70, 60]); stroke(c, 7, PAL.woodD); shape(c, [32, 60, 68, 74]); stroke(c, 7, PAL.wood);
  c.beginPath(); c.moveTo(38, 66); c.quadraticCurveTo(34, 40, 50, 18); c.quadraticCurveTo(54, 36, 62, 30); c.quadraticCurveTo(68, 50, 62, 66); c.closePath(); fill(c, PAL.orange); stroke(c, 1.6);
  c.beginPath(); c.moveTo(45, 66); c.quadraticCurveTo(44, 48, 52, 36); c.quadraticCurveTo(58, 52, 56, 66); c.closePath(); fill(c, '#f2c34a');
}
function drawTentUp(c) {
  shape(c, [8, 86, 50, 14, 92, 86]); fill(c, '#a8693f'); stroke(c);
  shape(c, [38, 86, 50, 50, 62, 86]); fill(c, '#3a2a1c'); stroke(c, 1.6);
  shape(c, [50, 14, 50, 6]); stroke(c, 2.4, PAL.woodD); shape(c, [4, 88, 96, 88]); stroke(c, 2, '#5a4a36');
}
function drawLatrine(c) {
  rr(c, 18, 40, 64, 46, 3); fill(c, PAL.wood); stroke(c);
  rr(c, 14, 30, 72, 14, 3); fill(c, PAL.woodD); stroke(c, 1.8);
  ell(c, 50, 37, 16, 4.5); fill(c, '#2a2016');
  for (const x of [34, 50, 66]) { shape(c, [x, 46, x, 84]); stroke(c, 1, 'rgba(60,40,20,.45)'); }
}
function drawHangTree(c) {
  shape(c, [4, 16, 96, 24]); stroke(c, 9, '#5d4a39'); shape(c, [4, 16, 96, 24]); stroke(c, 2);
  shape(c, [56, 20, 56, 44]); stroke(c, 1.8, '#d9cfa8'); shape(c, [62, 21, 84, 98], false); stroke(c, 1.6, '#d9cfa8');
  rr(c, 40, 44, 32, 46, 7); fill(c, PAL.blue); stroke(c); rr(c, 38, 40, 36, 8, 3); fill(c, PAL.black); stroke(c, 1.3);
}
function drawWater(c) {
  for (const [y, a] of [[44, 1], [64, 0.8], [84, 0.6]]) { c.beginPath(); for (let x = 6; x <= 94; x += 2) { const yy = y + Math.sin(x / 9) * 4; if (x === 6) c.moveTo(x, yy); else c.lineTo(x, yy); } c.globalAlpha = a; stroke(c, 4, PAL.lake); c.globalAlpha = 1; }
  rr(c, 40, 6, 20, 30, 5); fill(c, 'rgba(200,225,235,.9)'); stroke(c, 1.8); rr(c, 43, 2, 14, 6, 2); fill(c, PAL.blue); stroke(c, 1.2);
}
function drawDownLog(c) {
  rr(c, 6, 50, 88, 26, 12); fill(c, '#6b5d50'); stroke(c); ell(c, 90, 63, 7, 12); fill(c, '#cdb48a'); stroke(c, 1.4);
  shape(c, [30, 56, 64, 54]); stroke(c, 1.2, '#4a3e33');
  rr(c, 30, 14, 34, 12, 4); fill(c, PAL.orange); stroke(c, 1.6); shape(c, [64, 18, 88, 44, 84, 48, 60, 24]); fill(c, PAL.silver); stroke(c, 1.3);
}

// the drawings by icon key: [design w, design h, draw]
const ICONS = {
  pack: [100, 108, (c) => drawPack(c, false)], pack4: [100, 108, (c) => drawPack(c, true)],
  barrel: [100, 108, (c) => drawBarrel(c, false)], barrel60: [100, 108, (c) => drawBarrel(c, true)],
  bucket: [100, 100, drawBucket], tacklebox: [120, 80, drawTackle], pockets: [100, 96, drawPockets], mapcase: [80, 108, drawMapCase],
  oatmeal: [60, 104, (c) => drawBag(c, '#d6c08a', [['#a88a52', 30], ['#f0e6c8', 12]], PAL.blue)],
  supper: [60, 104, (c) => drawBag(c, '#efe8d6', [['#c06a32', 26], ['#8a5a32', 12]], PAL.red)],
  freeze: [70, 108, drawFreeze], trailmix: [80, 80, drawTrailMix], jerky: [90, 70, drawJerky], chocolate: [110, 56, drawChocolate],
  leeches: [80, 84, drawLeeches], jig: [80, 64, drawJig], mepps: [60, 100, drawMepps], daredevle: [50, 100, drawDaredevle], rapala: [120, 50, drawRapala],
  silverminnow: [50, 100, drawSilverMinnow], lazyike: [110, 50, drawLazyIke], spinner: [60, 100, drawMepps], spoon: [50, 100, drawDaredevle], crankbait: [120, 50, drawRapala],
  tablets: [70, 70, drawTablets], pump: [60, 108, drawPump], gravity: [90, 108, drawGravity], saw: [110, 46, drawSaw], camera: [100, 70, drawCamera], bottle: [68, 108, drawBottle],
  pad: [110, 50, drawPad], yokepads: [110, 52, drawYokePads], tent: [70, 108, (c) => drawTentSack(c, '#4f7a4a')], aframe: [70, 108, (c) => drawTentSack(c, '#4f7a4a')],
  dome: [70, 108, (c) => drawTentSack(c, '#c9662f')], fourseason: [70, 108, (c) => drawTentSack(c, '#d9b23a')],
  paddle: [176, 42, (c) => drawPaddle(c, 'ash')], ash: [176, 42, (c) => drawPaddle(c, 'ash')], bentshaft: [176, 50, (c) => drawPaddle(c, 'bentshaft')], carbon: [176, 50, (c) => drawPaddle(c, 'carbon')], ottertail: [176, 42, (c) => drawPaddle(c, 'ottertail')],
  rod: [176, 44, (c) => drawRod(c, false)], rodmh: [176, 44, (c) => drawRod(c, true)],
  canoe: [170, 50, (c) => drawCanoe(c, '#b9c0c4', '#7d868c')], aluminium: [170, 50, (c) => drawCanoe(c, '#b9c0c4', '#7d868c')], kevlar: [170, 50, (c) => drawCanoe(c, '#d8b86a', '#6a4a2a')], royalex: [170, 50, (c) => drawCanoe(c, '#4f7a4a', '#2a3a24')],
  breakfast: [60, 104, (c) => drawBag(c, '#d6c08a', [['#a88a52', 30], ['#f0e6c8', 12]], PAL.blue)],
  sleepingbag: [100, 108, (c) => drawBagSack(c, '#7a2f2a', '#4a1a16')], bag: [100, 108, (c) => drawBagSack(c, '#7a2f2a', '#4a1a16')], clothes: [100, 100, drawDryBag],
  fish: [120, 50, (c) => drawFish(c, 'walleye')], // a fish on the stringer (picture() draws it by its species) and a fried one
  pot: [100, 96, drawPot], tarp: [100, 100, drawTarp], crate: [100, 100, drawCrate], pile: [100, 100, drawCrate], stringer: [60, 104, drawStringer], yoke: [110, 52, drawYokePads],
  map: [100, 102, drawMap], berries: [80, 80, drawBerries], blueberries: [80, 80, drawBerries], mushroom: [80, 80, drawMushroom], firewood: [112, 54, drawFirewood],
  cedaryoke: [150, 52, drawCedarYoke], net: [80, 120, drawNet], blanket: [100, 90, drawBlanket], jacket: [100, 80, drawJacket], sail: [50, 110, drawSail], cover: [100, 90, drawCover],
  pole: [176, 42, drawPole], copperspoon: [50, 100, drawCopperSpoon], tump: [90, 60, drawTump], leaders: [70, 92, drawLeaders], kneelers: [110, 54, drawKneelers],
  'nb:fire': [100, 92, drawFireRing], 'nb:tent': [100, 92, drawTentUp], 'nb:latrine': [100, 92, drawLatrine], 'nb:hangTree': [100, 100, drawHangTree], 'nb:barrelHung': [100, 100, drawHangTree],
  'nb:water': [100, 92, drawWater], 'nb:downLog': [100, 92, drawDownLog], 'nb:canoe': [170, 50, (c) => drawCanoe(c, '#b9c0c4', '#7d868c')],
};
// the drawing an item uses: its icon key, the kind's, the id's own, a fish by its species, else a paper tag
function iconKey(d, id) {
  const k = d && d.icon, bare = String(id || '').replace(/^(lure|meal|snack|fish|sheet|forage):/, '');
  if (ICONS[bare] && !/^fish:/.test(id)) return bare; // the thing's own drawing before its family's (pack4, rodmh, fourseason)
  if (k && ICONS[k]) return k;
  if (/^fish:|^fish$/.test(id) || (d && d.kind === 'fish')) return 'fish';
  if (/^sheet:/.test(id) || (d && d.kind === 'map')) return 'map';
  if (d && d.kind === 'forage') return /mush|chant|hedge|lobster/.test(id) ? 'mushroom' : 'berries';
  if (d && d.kind === 'firewood') return 'firewood';
  if (d && d.kind === 'lure') return 'jig';
  if (d && d.kind === 'container') return 'pack';
  return null;
}
const CACHE = new Map();
const DPR = () => Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
// the cached picture of item id letterboxed in w × h css px (unturned)
function picture(id, w0, h0) {
  let w = w0, h = h0;
  const d = itemDef(id), key = iconKey(d, id), dpr = DPR(), ck = `${id}|${key}|${w0}x${h0}@${dpr}`;
  let cv = CACHE.get(ck);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  if (d && typeof d.draw === 'function') { // the item's own drawing (stream G's forage)
    const sz = Math.min(w0, h0);
    c.save(); c.translate((w - sz) / 2, (h - sz) / 2);
    try { d.draw(c, sz); } catch (e) { console.warn('icon draw', id, e); }
    c.restore(); CACHE.set(ck, cv); return cv;
  }
  const pad = Math.min(w, h) > 40 ? 3 : 1, [bw, bh, fn] = key ? ICONS[key] : [100, 100, (cc) => drawTag(cc, short(d) || String(id))];
  if ((bw > bh * 1.6 && h > w * 1.6) || (bh > bw * 1.6 && w > h * 1.6)) { c.translate(w, 0); c.rotate(Math.PI / 2); [w, h] = [h, w]; } // turned to fit
  const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  c.translate((w - bw * s) / 2, (h - bh * s) / 2); c.scale(s, s);
  if (key === 'fish') drawFish(c, (d && d.species) || String(id).replace(/^fish:/, ''));
  else fn(c);
  CACHE.set(ck, cv);
  return cv;
}
// a fresh canvas with the cached picture on it, w × h css px
function copyOf(src, w, h) {
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  cv.getContext('2d').drawImage(src, 0, 0);
  return cv;
}
// The contract's icon: item id's picture in a size × size box (48 by default), as a new canvas
export function icon(itemId, size = 48) { return copyOf(picture(itemId, size, size), size, size); }
// an item's picture at its footprint (w × h cells, unturned), as a new canvas
export function iconAt(itemId, wPx, hPx) { return copyOf(picture(itemId, wPx, hPx), wPx, hPx); }
// a data url of the picture (for markup that wants an <img>)
const URLS = new Map();
export function iconUrl(itemId, wPx = 48, hPx = wPx) { const k = `${itemId}|${wPx}x${hPx}`; let u = URLS.get(k); if (!u) { u = picture(itemId, wPx, hPx).toDataURL(); URLS.set(k, u); } return u; }
export const ICON_KEYS = Object.keys(ICONS);
// content C: more drawings by icon key, [design w, design h, draw(ctx)] (gear-icons.js: the new gear, food and uniques)
export function addIcons(map) { for (const [k, v] of Object.entries(map || {})) if (!ICONS[k]) { ICONS[k] = v; ICON_KEYS.push(k); } }

// --- the grid -----------------------------------------------------------------------------------------------------
// A container drawn as cells with its items on them at their footprints. Any grid on the page takes a drop from any
// other: a shelf's grid (opts.shelf) only gives (a drop from it is a buy, opts.screen.buy), never takes. A bin with no
// container behind it (opts.bin: the fire's ash, the wood lying about) takes and gives through its own drop and take.
const GRIDS = new Map();    // element → Grid
export const SCREENS = new Set();  // the open screens (the book's pack side, a shelf, the fire card), redrawn when the model changes
let drag = null, dirty = false, menuEl = null, tipEl = null, tipTimer = 0, version = 0, listening = null, listeningNear = null, pend = false;
export const BOOK_KEY = 'BookHold'; // the pseudo key held down while the mouse holds a held action's button (hold.js reads input.down)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// what an action says (eaten, refused, carried): the HUD's line, and in pencil on an open book, shelf or card, whose
// paper covers that line (the join, 2026-10-24: "Hold still to eat" was said under the book, unseen)
let lastNote = null;
export const note = (words, t = 4) => {
  if (!words) return;
  if (ctx.hud && ctx.hud.note) ctx.hud.note(words, t);
  lastNote = { words, until: now() + t * 1000 };
  for (const sc of SCREENS) if (sc.open && sc.el) { const n = sc.el.querySelector('.pk-note, .sh-receipt'); if (n) { n.textContent = words; n.classList.remove('no'); } }
};
const noteNow = () => (lastNote && now() < lastNote.until ? lastNote.words : '');
const said = (r, fail = 'It won’t go there.') => { if (r && r.words) note(r.words, 3.5); else if (r && r.ok === false) note(fail, 2.5); return r; };

// --- fb4 B: the checklists and the states (decision 2) ---------------------------------------------------------------
// The owner, 2026-10-25: "if I can't use something, I want to know exactly why … some sort of checklist or timer or
// quantity out of total". Stream C's shapes (A's on the dot, E's for the chores, the same): an action { enabled, why,
// needs?, next? }, needs [{ label, done, have?, need?, unit?, timer?, running?, note? }] (timer in game seconds; running
// !== false counts down with the clock, false is how long it will take once begun), next the one thing to do now; an
// entry's state inventory.status(ref) → null or { label, next, mark, timer?, running?, until? } (until: absolute game
// hours). Drawn alike everywhere: a box per step, ticked when done; "2 of 4 pieces" with a small bar; a countdown; the
// next step in italics. Everything is feature-tested: without stream C the book draws what it drew before.
const dayOf = () => of(ctx.day) || (typeof window !== 'undefined' && window.__game ? window.__game.day : null) || null;
// the clock in absolute game hours (energy.js's: day.doy * 24 + day.hours)
export function gameHours() {
  const inv = model(); if (inv && Number.isFinite(inv.now)) return inv.now;
  const d = dayOf(); return d && Number.isFinite(d.hours) ? (d.doy || 0) * 24 + d.hours : now() / 3.6e6;
}
// game seconds as words, as the inventory says them ("28 min", "1 h 10")
export function timeWords(sec) {
  if (!Number.isFinite(sec)) return '';
  if (sec <= 0) return 'done';
  const inv = model();
  if (inv && typeof inv.timerWords === 'function') { try { const w = inv.timerWords(sec); if (w) return String(w); } catch { /* ours, below */ } }
  if (sec < 60) return '<1 min';
  const m = Math.ceil(sec / 60); if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60; return mm ? `${h} h ${String(mm).padStart(2, '0')}` : `${h} h`;
}
const num = (v) => (Number.isInteger(v) ? String(v) : String(+(+v).toFixed(v < 10 ? 1 : 0)));
// a timer: counting down with the clock (data-end: the game hour it runs out), or the time a step will take
function timerHtml(n) {
  const sec = +n.timer, run = n.running !== false && sec > 0;
  const end = run ? (Number.isFinite(n.until) ? n.until : gameHours() + sec / 3600) : null;
  return `<span class="tmr${run ? ' run' : ''}"${end != null ? ` data-end="${end}"` : ''}>${esc(timeWords(sec))}</span>`;
}
// the checklist: a box per need (ticked when done), the quantities and the timers on them, then the next step
export function needsHtml(needs, next, { cls = '' } = {}) {
  const list = Array.isArray(needs) ? needs.filter((n) => n && n.label) : [];
  if (!list.length && !next) return '';
  const li = list.map((n) => {
    const q = Number.isFinite(n.need), t = Number.isFinite(n.timer), have = Number.isFinite(+n.have) ? +n.have : 0;
    const done = n.done != null ? !!n.done : q ? have >= n.need : t ? n.timer <= 0 : false;
    let v = '';
    if (q) v += `<span class="v">${num(have)} of ${num(n.need)}${n.unit ? ` ${esc(n.unit)}` : ''}</span><span class="qb" aria-hidden="true"><i style="width:${(n.need > 0 ? Math.max(0, Math.min(1, have / n.need)) * 100 : 100).toFixed(0)}%"></i></span>`;
    if (t) v += timerHtml(n);
    return `<li class="${q ? 'nd-q' : t ? 'nd-t' : 'nd-s'}${done ? ' ok' : ''}"><i class="tk" aria-hidden="true"></i><span class="l">${esc(n.label)}${n.note ? ` <em>${esc(n.note)}</em>` : ''}</span>${v}</li>`;
  }).join('');
  return `<div class="needs${cls ? ` ${cls}` : ''}">${li ? `<ul>${li}</ul>` : ''}${next ? `<p class="next">${esc(next)}</p>` : ''}</div>`;
}
// what a checklist would change on: its words and ticks, not the seconds of a running timer
export const needsSig = (needs, next) => `${(Array.isArray(needs) ? needs : []).map((n) => (n ? `${n.label}${n.done ? 1 : 0}${Number.isFinite(n.need) ? `${num(+n.have || 0)}/${n.need}` : ''}${n.running === false ? `t${Math.round(n.timer || 0)}` : ''}` : '')).join(';')}|${next || ''}`;
// an entry's state (stream C's inventory.status): the mark on its icon, a line in its tooltip
let statusWarned = false;
export function statusOf(ref) {
  const inv = model(); if (!ref || typeof inv.status !== 'function') return null;
  try { const s = inv.status(ref); return s && (s.label || s.mark) ? s : null; } catch (err) { if (!statusWarned) { statusWarned = true; console.warn('inventory.status', err); } return null; }
}
// fb5 B: the state as one short line, "Wet · dries by a fire, 30 min", "Drying · 22 min", "Hot · keeps 4 h 50", with
// the missing thing as a chip ("needs the pot"); its next step is stream E's to teach, never drawn here
export function statusHtml(s, cls = 'stt') {
  if (!s) return '';
  const t = Number.isFinite(s.timer) && s.timer > 0 ? timerHtml(s) : '';
  const hint = s.hint ? esc(s.hint) : '', tail = hint && t ? `${hint} ${t}` : hint || t;
  const chip = s.chip ? `<span class="chip">${esc(s.chip)}</span>` : s.need ? chipHtml(s.need) : '';
  return `<div class="${cls}${s.mark ? ` st-${esc(s.mark)}` : ''}"><b>${esc(s.label || s.mark || '')}</b>${tail ? `<span class="sep">·</span><span class="h">${tail}</span>` : ''}${chip}</div>`;
}

// --- fb5 B: the one thing missing (decision 6) ------------------------------------------------------------------------
// The owner, the third round of 2026-10-25: "the formulas should not always be there. it should only show whats
// missing". A greyed verb shows its why and the first missing thing as a chip, never a list of ticked steps; the chip's
// words are items.js chipOf's, which the fire card (cards.js) and the dot (stream E) read too. `next` is stream E's to
// teach once, as a moment.
const chipWords = (needs, why = '') => {
  if (A_ITEMS && typeof A_ITEMS.chipOf === 'function') { try { return String(A_ITEMS.chipOf(needs, why) || ''); } catch { /* ours, below */ } }
  const n = firstMissing(needs); if (!n) return why ? String(why).split(/[:,]/)[0].trim() : '';
  if (n.chip != null) return String(n.chip);
  const l = String(n.label || '').split(/[:,]/)[0].trim(), lab = l.charAt(0).toLowerCase() + l.slice(1);
  if (Number.isFinite(n.need)) { const left = Math.max(0, n.need - (+n.have || 0)); return /^(pieces?|poles?|logs?|)$/.test(n.unit || '') ? `${lab} ×${num(left)}` : `${lab} ${num(left)} ${n.unit}`; }
  return Number.isFinite(n.timer) ? `${lab} ${timeWords(n.timer)}` : lab;
};
// the first need not done (a check, or its needs)
export function firstMissing(c) {
  const needs = Array.isArray(c) ? c : c && Array.isArray(c.needs) ? c.needs : [];
  if (A_ITEMS && typeof A_ITEMS.missingOf === 'function') { try { return A_ITEMS.missingOf(needs); } catch { /* ours, below */ } }
  return needs.find((n) => n && !(n.done != null ? n.done : Number.isFinite(n.need) ? (+n.have || 0) >= n.need : false)) || null;
}
// a need as a chip: its words, the icon of the thing it wants in front (need.item), a running timer counting down
export function chipHtml(n) {
  if (!n) return '';
  let t = '';
  if (n.chip == null && Number.isFinite(n.timer) && n.running !== false && n.timer > 0) t = `${esc(chipWords([{ label: n.label, done: false }]))} ${timerHtml(n)}`;
  else { const w = chipWords([n]); if (!w) return ''; t = esc(w); }
  const d = n.item ? itemDef(n.item) : null;
  const pic = d ? `<img class="ci" src="${iconUrl(n.item, 36)}" alt="">` : n.icon ? `<span class="cg" aria-hidden="true">${esc(n.icon)}</span>` : '';
  return `<span class="chip${pic ? ' has-i' : ''}">${pic}${t}</span>`;
}
// a greyed check as one line: its why and the first missing chip ('' when it can be done). The chip goes when it only
// says the why again. cls: the line's class; tag: 'span' inside a button, 'div' in a pane
export function whyHtml(c, { cls = 'why1', tag = 'div' } = {}) {
  if (!c || c.enabled !== false) return '';
  const why = String(c.why || '').trim(), n = firstMissing(c.needs);
  // (the chip goes when every word of it is in the why already: "Treating: drinkable in 22 min" needs no "treating 22 min")
  const words = (t) => t.toLowerCase().replace(/[^a-z0-9.½ ]/g, ' ').split(/\s+/).filter(Boolean);
  const w = n ? chipWords([n]) : '', inWhy = new Set(words(why)), same = !!(w && why && words(w).every((k) => inWhy.has(k)));
  const chip = n && !same ? chipHtml(n) : '';
  if (!why && !chip) return '';
  return `<${tag} class="${cls}">${why ? `<span class="w">${esc(why.charAt(0).toUpperCase() + why.slice(1))}</span>` : ''}${chip}</${tag}>`;
}
// every countdown on the page, counted down with the clock a few times a second (the screens' update calls it)
let tickAt = 0;
export function tickTimers() {
  if (typeof document === 'undefined') return;
  const t = now(); if (t - tickAt < 300) return; tickAt = t;
  const els = document.querySelectorAll('.tmr[data-end]'); if (!els.length) return;
  const h = gameHours();
  for (const el of els) {
    const left = (+el.dataset.end - h) * 3600, w = timeWords(left);
    if (el.textContent !== w) el.textContent = w;
    if (left <= 0) { const li = el.closest('li'); if (li) li.classList.add('ok'); }
  }
}

function listen() {
  const inv = model();
  if (listening !== inv) { listening = inv; if (typeof inv.onChange === 'function') inv.onChange(() => { version++; soon(); }); }
  const n = nearby();
  if (n && listeningNear !== n && typeof n.onChange === 'function') { listeningNear = n; n.onChange(() => soon(false)); }
}
// the open screens redrawn after this event: all of it (the inventory changed), or only if what they show changed
let pendForce = false;
function soon(force = true) {
  if (drag) { dirty = true; return; }
  pendForce = pendForce || force;
  if (pend) return;
  pend = true;
  setTimeout(() => { pend = false; const f = pendForce; pendForce = false; for (const s of SCREENS) if (s.open) s.render(f); }, 0);
}
export function refresh() { version++; soon(); }

export function grid(el, container, opts = {}) {
  const old = GRIDS.get(el); if (old) old.destroy();
  return new Grid(el, container, opts);
}
export function destroyGridsIn(el) { for (const g of [...GRIDS.values()]) if (el.contains(g.el)) g.destroy(); }
class Grid {
  constructor(el, c, opts) {
    this.el = el; this.c = c; this.opts = opts;
    GRIDS.set(el, this);
    el.classList.add('ig'); el.classList.toggle('ig-shelf', !!opts.shelf); el.classList.toggle('ig-bin', !!opts.bin);
    this.render();
  }
  destroy() { if (GRIDS.get(this.el) === this) GRIDS.delete(this.el); }
  get size() { return this.opts.size || gridSize(this.c); } // opts.size: drawn at another size (a holder shown as the one thing it holds)
  render() {
    const { cols, rows } = this.size, el = this.el;
    el.style.width = `${cols * CELL}px`; el.style.height = `${rows * CELL}px`;
    el.dataset.cid = this.c.id;
    el.textContent = '';
    for (const r of this.c.boards || []) { const bd = mk('div', 'ig-board'); bd.style.top = `${r * CELL - 7}px`; el.appendChild(bd); }
    for (const e of this.c.grid || []) el.appendChild(this.itemEl(e));
  }
  itemEl(e) {
    const d = itemDef(e.id), [w, h] = dims(d, e.rot), [uw, uh] = dims(d, 0), shelf = !!this.opts.shelf, bin = this.opts.bin;
    const it = mk('div', `ig-item k-${d ? d.kind : 'none'}${e.box ? ' box' : ''}${shelf && e.dear ? ' dear' : ''}${shelf && e.owned ? ' owned' : ''}${shelf && e.sig ? ' sig' : ''}${bin && !bin.take ? ' still' : ''}`);
    it.style.left = `${e.x * CELL}px`; it.style.top = `${e.y * CELL}px`; it.style.width = `${w * CELL}px`; it.style.height = `${h * CELL}px`;
    it.dataset.uid = e.uid; it.dataset.id = e.id;
    const pic = iconAt(e.id, uw * CELL - 4, uh * CELL - 4); pic.className = `ig-pic${e.rot ? ' rot' : ''}`;
    it.appendChild(pic);
    it.appendChild(mk('span', 'ig-nm', esc(short(d) || e.id)));
    const st = d ? d.stack || 1 : 1;
    if ((e.qty || 1) > 1 || st > 1) it.appendChild(mk('span', 'ig-qty', String(e.qty || 1)));
    if (e.data && Number.isFinite(e.data.length)) it.appendChild(mk('span', 'ig-qty', `${Math.round(e.data.length)} cm`));
    // fb4 B (decision 2): a thing with a state says so on its icon (wet, drying, treating, cooking, burning, hot, low,
    // empty, ready: stream C's inventory.status), in place of the eat or raw mark
    const stt = !shelf ? statusOf(e) : null;
    // fb5 B: a missing thing is a chip on the icon itself, over its foot (stream A's grate: "needs the pot", "water 0.3 L")
    if (stt && stt.chip) { it.appendChild(mk('span', `ig-chip st-${esc(stt.mark || 'need')}`, esc(stt.chip))); it.classList.add('has-chip'); }
    else if (stt && stt.mark) { const m = mk('span', `ig-mark st st-${esc(stt.mark)}${w < 2 ? ' dot' : ''}`, esc(stt.mark)); if (w < 2) m.title = stt.label || stt.mark; it.appendChild(m); it.classList.add('has-st'); if (w < 2) it.classList.add('st-dot'); } // (one cell wide: a dot, the word in its tooltip)
    else if (d && d.eat && !shelf) it.appendChild(mk('span', `ig-mark ${d.eat.cook && !d.cooked ? 'cook' : 'eat'}`, d.eat.cook && !d.cooked ? 'raw' : 'eat'));
    if (e.box) it.appendChild(mk('span', 'ig-mark open', 'open'));
    if (shelf) it.appendChild(mk('span', 'ig-price', e.owned ? 'yours' : e.price ? `$${e.price}` : 'free'));
    // fb3 C (stream B's uses, servings and litres): a thin bar along the foot for what is left of a thing that has uses
    // (the tablets), servings (the trail mix) or litres (the bottle), and the number where a stack's count would go
    const n = d ? (d.uses ?? d.servings ?? d.litres ?? null) : null;
    if (n != null && n > 1 && !shelf) {
      const left = Number.isFinite(e.left) ? e.left : n, f = Math.max(0, Math.min(1, left / n));
      const bar = mk('span', 'ig-bar', `<i style="width:${(f * 100).toFixed(1)}%"></i>`);
      if (d.litres && Number.isFinite(e.treating) && e.treating > 0) { const tr = Math.max(0, Math.min(f, e.treating / n)); bar.insertAdjacentHTML('beforeend', `<em style="left:${((f - tr) * 100).toFixed(1)}%;width:${(tr * 100).toFixed(1)}%"></em>`); }
      it.appendChild(bar); it.classList.add('has-bar');
      if ((e.qty || 1) === 1 && st <= 1) it.appendChild(mk('span', 'ig-qty', d.litres ? `${+left.toFixed(2)} L` : String(Math.round(left))));
    }
    if (e.fixed) it.classList.add('fixed'); // a fixed entry (the bottle in the pockets) is not dragged
    else it.addEventListener('pointerdown', (ev) => press(this, e, it, ev));
    it.addEventListener('contextmenu', (ev) => { ev.preventDefault(); hideTip(); openMenu(ev.clientX, ev.clientY, itemMenu(this, e)); });
    it.addEventListener('dblclick', (ev) => { ev.preventDefault(); primary(this, e); });
    it.addEventListener('pointerenter', () => { clearTimeout(tipTimer); tipTimer = setTimeout(() => { if (!drag) showTip(it, this, e); }, 260); });
    it.addEventListener('pointerleave', () => { clearTimeout(tipTimer); hideTip(); });
    return it;
  }
  // the cell under a screen point for an item grabbed (gx, gy) px in from its top-left
  cellAt(x, y, gx, gy) { const r = this.el.getBoundingClientRect(); return [Math.round((x - gx - r.left) / CELL), Math.round((y - gy - r.top) / CELL)]; }
  // what dropping drag d at (x, y) would do here: 'ok' | 'merge' | 'buy' | 'no'
  check(d, x, y, rot) {
    if (this.opts.shelf) return 'no';
    const e = d.e, src = d.grid;
    if (this.opts.bin) { const b = this.opts.bin; return d.kind === 'thing' || e.box || !b.drop || src === this || (src && src.opts.shelf) ? 'no' : binAccepts(b, e.id) ? 'ok' : 'no'; }
    if (src && src.opts.shelf) {
      const k = (itemDef(e.id) || {}).kind;
      if (e.hull || e.owned || k === 'long' || k === 'container' || e.dear) return 'no';
      return placeCheck(this.c, e.id, x, y, rot, null, e.qty || 1) === 'no' ? 'no' : 'buy';
    }
    if (d.kind === 'thing' && d.thing.isLong) return 'no';
    if (src && src.opts.bin && !src.opts.bin.take) return 'no';
    if (e.box && (this.c.id === e.uid || this.c.in === e.uid)) return 'no';
    const qty = d.qty || e.qty || 1, r = placeCheck(this.c, e.id, x, y, rot, e.uid, qty);
    if (r === 'ok' && live()) { const inv = model(); if (typeof inv.fits === 'function' && !inv.fits(this.c.id, e.id, x, y, rot, e.uid)) return 'no'; }
    return r;
  }
}
// a bin's kinds: [kinds or item ids], or a function (itemId, def) → bool; none given takes anything
const pct = (v) => `${Math.round(Math.max(0, Math.min(1, v || 0)) * 100)}%`;
const binAccepts = (b, id) => { const a = b.accepts, d = itemDef(id); if (a == null) return true; if (typeof a === 'function') return !!a(id, d); return a.includes(id) || !!(d && a.includes(d.kind)); };
// a bin's things laid out on its cells (where they say, else the first room), the bin as tall as it must be
function binContainer(id, b) {
  const n = (b.items || []).length, cols = b.cols || 4, c = { id, item: null, size: { cols, rows: b.rows || (n ? 2 : 1), accepts: null }, grid: [] }; // an empty bin (the ash) a strip
  (b.items || []).forEach((it, i) => {
    const e = { uid: it.uid || `${id}:${i}`, id: it.id, qty: it.qty || 1, rot: it.rot || 0, x: it.x, y: it.y, ...(it.data ? { data: it.data } : {}) };
    if (!(Number.isFinite(e.x) && Number.isFinite(e.y))) {
      let f = firstFit(c, e.id, e.qty, { merge: false });
      while (!f && c.size.rows < 12) { c.size.rows++; f = firstFit(c, e.id, e.qty, { merge: false }); }
      if (!f) return;
      Object.assign(e, f);
    }
    c.grid.push(e);
  });
  return c;
}

// --- dragging -----------------------------------------------------------------------------------------------------
// Two kinds of drag share the ghost and the drop: an item out of a grid (st.kind 'item'), and a thing by its strap or
// its slot (st.kind 'thing': a container or a long thing, carried, set down, loaded or nested). The drop goes to the
// grid under the pointer when it would take it there, else to a tab (data-tab: a container of yours, Keeping at a shelf),
// else to the zone under it (data-dz: 'back', 'chest', 'hand0' the right hand, 'hand1' the left, 'canoe', 'ground',
// 'stash'); let go off the page altogether, on foot, it goes down on the ground at your feet (the owner, 2026-10-24:
// "should be able to drag off modal to put on ground").
function press(g, e, el, ev) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  closeMenu();
  if (g.opts.bin && !g.opts.bin.take) return;
  const r = el.getBoundingClientRect(), ox = ev.clientX - r.left, oy = ev.clientY - r.top;
  // (fb4 B, decision 4: no Ctrl-click any more; a double-click still buys off a shelf)
  const st = { kind: 'item', grid: g, e, el, x0: ev.clientX, y0: ev.clientY, gx: Math.max(0, Math.min(r.width, ox)), gy: Math.max(0, Math.min(r.height, oy)), rot: e.rot || 0, started: false, // (fb5 join: the exact grab point, so the thing lands where its ghost is under the pointer: the pot grabbed by its middle onto the grate's middle went a row low and red)
    qty: ev.shiftKey && (e.qty || 1) > 1 ? Math.ceil((e.qty || 1) / 2) : null };
  follow(st, null);
}
// a thing picked up by its strap, its slot or its frame: t { id, isLong, obj, def }
function pressThing(t, el, ev, onClick = null) {
  if (ev.button !== 0 || !t || !t.def || t.def.fixed || t.def.station) return;
  ev.preventDefault();
  closeMenu();
  const st = { kind: 'thing', thing: t, grid: null, e: { uid: t.id, id: t.isLong ? t.obj.id : t.obj.item, box: !t.isLong, long: t.isLong, qty: 1, rot: 0 }, el,
    x0: ev.clientX, y0: ev.clientY, gx: CELL / 2, gy: CELL / 2, rot: 0, started: false, qty: null };
  follow(st, onClick);
}
function follow(st, onClick) {
  const move = (m) => {
    if (!st.started && Math.hypot(m.clientX - st.x0, m.clientY - st.y0) > 5) begin(st);
    if (st.started) over(st, m.clientX, m.clientY);
  };
  const up = (u) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (st.started) end(st, u.clientX, u.clientY);
    else if (onClick) onClick();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
// fb5 B (rule 1): R is taught on the first few drags of a thing that turns, then it's learned
const R_HINTS = 3, R_KEY = 'bwca-canoe:fb5-rturn';
let rTaught = null;
function rHintNow() {
  if (rTaught == null) { try { rTaught = +(localStorage.getItem(R_KEY) || 0) || 0; } catch { rTaught = 0; } }
  if (rTaught >= R_HINTS) return false;
  rTaught++; try { localStorage.setItem(R_KEY, String(rTaught)); } catch { /* a nicety */ }
  return true;
}
export function rTurned() { rTaught = R_HINTS; try { localStorage.setItem(R_KEY, String(R_HINTS)); } catch { /* a nicety */ } } // R pressed: learned
function begin(st) {
  st.started = true; drag = st; hideTip();
  st.rHint = turnable(st) && rHintNow();
  st.el.classList.add('lifted');
  st.ghost = mk('div', `ig-ghost${st.kind === 'thing' ? ' thing' : ''}`);
  st.fromShelf = !!(st.grid && st.grid.opts.shelf) || !!st.el.closest('#shelf');
  document.body.appendChild(st.ghost);
  ghostDraw(st);
  document.body.classList.add('ig-dragging');
  for (const s of SCREENS) if (s.open && s.el) s.el.classList.add(st.kind === 'thing' ? 'dragging-thing' : 'dragging-item');
  // held near the top or the bottom of a scrolling pane, the pane scrolls (a tab's page taller than the book)
  st.scroller = setInterval(() => { if (st.x != null && edgeScroll(st.x, st.y)) over(st, st.x, st.y); }, 30);
}
function edgeScroll(x, y) {
  const el = document.elementFromPoint(x, y), col = el && el.closest ? el.closest('.tabpage, .sh-stock, .cd-thing') : null;
  if (!col || col.scrollHeight <= col.clientHeight + 1) return false;
  const r = col.getBoundingClientRect(), e = 56, was = col.scrollTop;
  if (y > r.bottom - e) col.scrollTop += Math.ceil((y - (r.bottom - e)) / 4);
  else if (y < r.top + e) col.scrollTop -= Math.ceil((r.top + e - y) / 4);
  return col.scrollTop !== was;
}
// what R can turn: an item that isn't square (a thing that nests too: the tackle box), not a pack by its strap
function turnable(st) { const d = itemDef(st.e.id); return !!d && (d.w || 1) !== (d.h || 1) && !(st.kind === 'thing' && !d.nest) && !(st.grid && st.grid.opts.bin && !st.grid.opts.bin.take); }
// the ghost: an item at its footprint; a thing that does not nest drawn small (a pack is 4 × 5 cells), a long thing 4 × 1
function ghostDims(st) {
  const d = itemDef(st.e.id), [w, h] = dims(d, st.rot);
  if (st.kind !== 'thing' || (d && d.nest)) return [w, h];
  return st.thing.isLong ? [4, 1] : [Math.min(2, w), Math.min(2, h)];
}
function ghostDraw(st, rot = st.rot) {
  st.drawn = rot;
  const [w, h] = ghostDims({ ...st, rot }), d = itemDef(st.e.id), [uw, uh] = st.kind === 'thing' && !(d && d.nest) ? [w, h] : dims(d, 0);
  st.ghost.style.width = `${w * CELL}px`; st.ghost.style.height = `${h * CELL}px`;
  st.ghost.textContent = '';
  const pic = iconAt(st.e.id, uw * CELL - 4, uh * CELL - 4); pic.className = `ig-pic${rot ? ' rot' : ''}`;
  st.ghost.appendChild(pic);
  if (st.qty) st.ghost.appendChild(mk('span', 'ig-qty', String(st.qty)));
  st.tag = mk('span', 'ig-ghost-tag', ''); st.ghost.appendChild(st.tag);
}
// the pointer is off every open paper (and not on a menu or a tag)
function offPage(x, y) {
  const top = document.elementFromPoint(x, y);
  return !(top && top.closest && top.closest('.paper, .ig-menu, .ig-tip, .ig-ghost'));
}
function over(st, x, y) {
  st.x = x; st.y = y;
  st.ghost.style.left = `${x - st.gx}px`; st.ghost.style.top = `${y - st.gy}px`;
  let g = null, z = null, tab = null;
  const nd = itemDef(st.e.id), loose = st.kind === 'thing' && !(nd && nd.nest); // a pack, a barrel, a long thing: no grid takes it, only the zones and the tabs
  for (const el of document.elementsFromPoint(x, y)) {
    if (!el.closest) continue;
    const ge = el.closest('.ig'), ze = el.closest('[data-dz]'), te = el.closest('[data-tab]');
    if (ge && GRIDS.has(ge) && !loose) g = GRIDS.get(ge);
    if (ze) z = ze;
    if (te) tab = te;
    if (g || z || tab) break;
  }
  let res = 'no', tgt = null, zone = null, off = false;
  st.turn = null;
  if (g) {
    const [cx, cy] = g.cellAt(x, y, st.gx, st.gy);
    st.cell = [cx, cy];
    res = g.check(st, cx, cy, st.rot);
    // fb4 B (decision 4): a drop that fits only turned turns by itself; the cells lit show it turned. Tried with the grab
    // point turned with it (the cell under the pointer stays in the thing), then with the pointer on its first cell.
    if (res === 'no' && turnable(st)) {
      const r2 = st.rot ? 0 : 1;
      for (const [gx, gy] of [[st.gy, st.gx], [CELL / 2, CELL / 2]]) {
        const [tx, ty] = g.cellAt(x, y, gx, gy), r = g.check(st, tx, ty, r2);
        if (r !== 'no') { res = r; st.turn = { rot: r2, cell: [tx, ty], g: [gx, gy] }; break; }
      }
    }
    if (res !== 'no' || !(z || tab)) tgt = g;
  }
  if (!tgt && tab) { zone = tab; res = tabCheck(st, tab); }
  else if (!tgt && z) { zone = z; res = zoneCheck(st, z); }
  // off the page: from the book or the card, on foot, the thing goes down on the ground at your feet
  if (!tgt && !zone && !st.fromShelf && offPage(x, y)) { off = true; res = st.kind === 'thing' || st.e.box ? zoneCheckDz(st, 'ground') : itemGroundCheck(st); }
  // a pack or a barrel off a shelf (no grid of yours takes it): dropped anywhere on your side it is bought, kept by the
  // outfitters like a double-click (shop.js buyItem), so a container is bought by a drag like everything else
  const mine = st.grid && st.grid.opts.shelf && nd && nd.kind === 'container' && !nd.nest ? document.elementFromPoint(x, y) : null, side = mine && mine.closest ? mine.closest('.sh-mine') : null;
  if (side && res === 'no') { res = 'buy'; tgt = null; zone = null; }
  if (st.side && st.side !== side) st.side.classList.remove('dz-ok');
  st.side = res === 'buy' ? side : null; if (st.side) st.side.classList.add('dz-ok');
  st.tgt = tgt; st.zone = zone; st.res = res; st.off = off;
  // the ghost drawn as it will land: turned where it fits only turned, back when it doesn't
  const want = st.turn ? st.turn.rot : st.rot, [gx0, gy0] = st.turn ? st.turn.g : [st.gx, st.gy];
  if (st.drawn !== want) ghostDraw(st, want);
  st.ghost.style.left = `${x - gx0}px`; st.ghost.style.top = `${y - gy0}px`;
  st.ghost.classList.toggle('off', off && res !== 'no'); st.ghost.classList.toggle('off-no', off && res === 'no');
  // the drag's own hint: where it goes off the page; R while the thing can turn (fb4 B: R is only this now)
  const wet = res === 'no' && (off || (zone && /^(ground|wood)$/.test(SPECIAL_TABS[zone.dataset.tab] || zone.dataset.dz || ''))) && onFoot() ? wadeBlock() : null;
  if (st.tag) st.tag.innerHTML = wet ? 'step ashore first' : off ? esc(res !== 'no' ? 'to the ground' : onFoot() ? 'not here' : 'go ashore first') : st.turn ? 'turned to fit' : st.rHint ? '<kbd>R</kbd> turns it' : '';
  st.ghost.classList.toggle('hinted', !!st.tag && st.tag.innerHTML !== '');
  // the cells lit in the grid, or the zone (or the tab) lit
  if (st.hl && (!tgt || st.hl.parentNode !== tgt.el)) { st.hl.remove(); st.hl = null; }
  if (st.zl && st.zl !== zone) { st.zl.classList.remove('dz-ok', 'dz-swap', 'dz-no', 'dz-buy'); st.zl = null; }
  if (zone) { st.zl = zone; zone.classList.remove('dz-ok', 'dz-swap', 'dz-no', 'dz-buy'); zone.classList.add(`dz-${res === 'no' ? 'no' : res === 'swap' ? 'swap' : res === 'buy' ? 'buy' : 'ok'}`); }
  if (!tgt) return;
  const [cx, cy] = st.turn ? st.turn.cell : st.cell, d = itemDef(st.e.id), [w, h] = dims(d, st.turn ? st.turn.rot : st.rot);
  if (!st.hl) { st.hl = mk('div', 'ig-hl'); tgt.el.appendChild(st.hl); }
  const { cols, rows } = tgt.size, x0 = Math.max(0, cx), y0 = Math.max(0, cy), x1 = Math.min(cols, cx + w), y1 = Math.min(rows, cy + h);
  st.hl.className = `ig-hl ${res}`;
  st.hl.style.display = x1 > x0 && y1 > y0 ? '' : 'none';
  st.hl.style.left = `${x0 * CELL}px`; st.hl.style.top = `${y0 * CELL}px`; st.hl.style.width = `${(x1 - x0) * CELL}px`; st.hl.style.height = `${(y1 - y0) * CELL}px`;
}
function end(st, x, y) {
  if (x != null) over(st, x, y);
  if (st.turn) { st.rot = st.turn.rot; st.cell = st.turn.cell; } // (the drop that fits only turned)
  const { tgt, res, cell, zone, off } = st;
  cleanup(st);
  drag = null;
  if (res === 'no') { const gz = groundZone({ off, zone }), w = (gz === 'ground' || gz === 'wood') && onFoot() ? wadeBlock() : null; if (w) said(w); } // (in the water: say why)
  else if (zone && zone.dataset.tab != null) dropOnTab(st, zone);
  else if (zone) dropOnZone(st, zone.dataset.dz);
  else if (off) dropOnZone(st, 'ground');
  else if (!tgt && res === 'buy') st.grid.opts.screen.buy(st.e.id, null); // a container off a shelf, dropped on your side
  else if (tgt) {
    const [cx, cy] = cell, from = st.grid;
    if (st.kind === 'thing') { if (!model().move(null, st.thing.id, tgt.c.id, cx, cy, st.rot)) note('It won’t go in there.', 2.5); }
    else if (from.opts.shelf) from.opts.screen.buy(st.e.id, { cId: tgt.c.id, x: cx, y: cy, rot: st.rot });
    else if (tgt.opts.bin) binDrop(tgt.opts.bin, from.c.id, st.e, st.qty);
    else if (from.opts.bin) binTake(from.opts.bin, st.e, tgt.c.id, { x: cx, y: cy, rot: st.rot, qty: st.qty });
    else if (!(tgt.opts.onDrop && tgt.opts.onDrop({ from: { c: from.c, e: st.e }, to: { c: tgt.c, x: cx, y: cy, rot: st.rot }, qty: st.qty }))) {
      const ok = model().move(from.c.id, st.e.uid, tgt.c.id, cx, cy, st.rot, st.qty || undefined);
      if (!ok) note('It won’t go there.', 2.5);
    }
  }
  dirty = false;
  refresh();
}
function cleanup(st) {
  clearInterval(st.scroller);
  if (st.ghost) st.ghost.remove();
  if (st.hl) st.hl.remove();
  if (st.zl) st.zl.classList.remove('dz-ok', 'dz-swap', 'dz-no', 'dz-buy');
  if (st.side) st.side.classList.remove('dz-ok');
  st.el.classList.remove('lifted');
  document.body.classList.remove('ig-dragging');
  for (const s of SCREENS) if (s.el) s.el.classList.remove('dragging-thing', 'dragging-item');
}
// R turns what is being dragged, Esc puts it back (both ahead of the game's own R and Esc)
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (ev) => {
    if (!drag) { if (ev.code === 'Escape' && menuEl) { closeMenu(); ev.stopImmediatePropagation(); } return; }
    if (ev.code === 'KeyR') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (ev.repeat) return;
      if (!turnable(drag)) return;
      rTurned(); drag.rHint = false; // (fb5 B: pressed, so learned)
      drag.rot = drag.rot ? 0 : 1; drag.gx = CELL / 2; drag.gy = CELL / 2;
      ghostDraw(drag); if (drag.x != null) over(drag, drag.x, drag.y);
    } else if (ev.code === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); cleanup(drag); drag = null; if (dirty) { dirty = false; refresh(); } }
  }, true);
}

// --- the zones: your back, your chest, your hands, the canoe, the ground, the outfitters ---------------------------------
const isSlot = (dz) => dz === 'back' || dz === 'chest' || dz === 'hand0' || dz === 'hand1';
const thingOf = (c) => (c ? { id: c.id, isLong: false, obj: c, def: itemDef(c.item) } : null);
const longOf = (l) => (l ? { id: l.uid, isLong: true, obj: l, def: itemDef(l.id) } : null);
// what is in hand i (0 the right, 1 the left: inventory.hands), on the back or the chest
function inHand(i) {
  const inv = model(), h = inv.hands, s = h && h[i];
  if (!s) return null;
  if (s.container) return thingOf(typeof inv.cont === 'function' ? inv.cont(s.container) : null);
  return longOf((inv.long || []).find((l) => l.uid === s.long));
}
const wornThing = (slot) => { const inv = model(); return thingOf(typeof inv.worn === 'function' ? inv.worn(slot) : (inv.containers || []).find((c) => c.where === slot)); };
const occupant = (dz) => (dz === 'back' || dz === 'chest' ? wornThing(dz) : dz === 'hand0' || dz === 'hand1' ? inHand(+dz[4]) : null);
const onFoot = () => { const p = ctx.player; return !!(p && (p.onFoot || p.mode === 'walk' || p.mode === 'carry')); };
const stillNow = () => { const inv = model(); return typeof inv.still === 'function' ? !!inv.still() : true; };
// the thing a drag holds: the thing itself, or a nested container's entry in a grid
function thingOfDrag(st) { if (st.kind === 'thing') return st.thing; const inv = model(); return thingOf(typeof inv.cont === 'function' ? inv.cont(st.e.uid) : null); }
const canFit = (c, itemId) => { const inv = model(); return typeof inv.firstFit === 'function' ? !!inv.firstFit(c.id, itemId) : !!firstFit(c, itemId); };
// what a drop on zone z would do: 'ok' | 'swap' (what is there goes where this came from) | 'no'
const zoneCheck = (st, z) => zoneCheckDz(st, z.dataset.dz);
// fb4 join (stream A's leftover): standing in the water with no dry ground within reach, nothing goes down on the ground:
// the model's why (inventory.wadeNo: "You're standing in the water", the checklist, the next step), else null
function wadeBlock() {
  const inv = model();
  if (!live() || typeof inv.wading !== 'function' || !inv.wading()) return null;
  return typeof inv.downSpot === 'function' && inv.downSpot() ? null : inv.wadeNo();
}
const groundZone = (st) => (st.off ? 'ground' : st.zone ? SPECIAL_TABS[st.zone.dataset.tab] || st.zone.dataset.dz || null : null);
function zoneCheckDz(st, dz) {
  const inv = model(), src = st.grid;
  if (!live() || (src && src.opts.shelf)) return 'no';
  if (st.kind === 'thing' || st.e.box) {
    const t = thingOfDrag(st); if (!t || !t.obj || !t.def || t.def.fixed || t.def.station) return 'no';
    const o = t.obj, d = t.def;
    if (isSlot(dz)) {
      if (!onFoot() && !inv.atStash) return 'no';
      const occ = occupant(dz), hand = dz !== 'back' && dz !== 'chest';
      if (occ && occ.obj === o) return 'no';
      // a hand takes any container once the model carries any in a hand (stream B's canHand: "hands take anything")
      if (hand ? t.isLong || d.hand || typeof inv.canHand === 'function' : (d.wear || []).includes(dz)) return occ ? 'swap' : 'ok';
      return occ && !occ.isLong && d.nest && canFit(occ.obj, o.item) ? 'ok' : 'no'; // not worn that way: into the one there
    }
    if (o.item === 'woodarms' && dz !== 'ground' && dz !== 'wood') return 'no'; // an armload is wood in the crook of an arm: set down, it is a pile
    if (dz === 'wood') return o.item === 'woodarms' ? zoneCheckDz(st, 'ground') : 'no'; // (fb4 B: the Wood tab takes wood)
    if (dz === 'canoe') return o.where === 'canoe' ? 'no' : 'ok';
    if (dz === 'ground') return !onFoot() || (o.where === 'ground' && typeof inv.dist === 'function' && inv.dist(o.at) < 1.6) || wadeBlock() ? 'no' : 'ok';
    if (dz === 'stash') return inv.atStash && o.where !== 'stash' ? 'ok' : 'no';
    return 'no';
  }
  // an item: to the ground (a pile at your feet), into what is on your back, your chest or in a hand, or an armload
  const d = itemDef(st.e.id), bin = src && src.opts.bin;
  if (!d || (bin && !bin.take)) return 'no';
  if (dz === 'ground') return itemGroundCheck(st);
  if (dz === 'wood') return d.kind === 'firewood' ? itemGroundCheck(st) : 'no'; // (fb4 B: wood onto the woodpile)
  if (dz === 'canoe') return canoeFor(st.e.id, src && src.c ? src.c.id : null) ? 'ok' : 'no'; // (fb4 B: into the best one in the canoe)
  if (dz === 'stash') return inv.atStash && inv.crate && canFit(inv.crate, st.e.id) ? 'ok' : 'no';
  if (!isSlot(dz)) return 'no';
  const occ = occupant(dz);
  if (occ && !occ.isLong) return occ.obj.id !== (src && src.c.id) && canFit(occ.obj, st.e.id) ? 'ok' : 'no';
  if (occ || !dz.startsWith('hand')) return 'no';
  // fb3 C (decision 11, stream B): a free hand takes any item (inventory.canHand; a piece of wood makes an armload)
  if (typeof inv.canHand === 'function' && !bin) { try { return inv.canHand(st.e.id) ? 'ok' : 'no'; } catch { return 'no'; } }
  return d.kind === 'firewood' && itemDef('woodarms') && onFoot() ? 'ok' : 'no';
}
// an item out of one of your grids onto the ground: on foot, and not out of a bin (the wood lying about is on the ground already)
function itemGroundCheck(st) {
  const src = st.grid, bin = src && src.opts.bin;
  if (!live() || !src || src.opts.shelf || bin) return 'no';
  if (src.c.item === 'pile' && typeof model().dist === 'function' && src.c.at && model().dist(src.c.at) < 1.6) return 'no'; // out of the pile at your feet onto the pile at your feet
  return onFoot() && !wadeBlock() ? 'ok' : 'no';
}
function dropOnZone(st, dz) {
  const thing = st.kind === 'thing' || st.e.box, t = thing ? thingOfDrag(st) : null;
  const r = said(thing ? thingTo(t, dz) : itemTo(st, dz));
  if (thing && t && r && r.ok && isSlot(dz)) openTab(t.id); // a container put on gets its tab
}
// a thing to a zone. Onto a slot that is taken, what is there goes where this came from (the canoe, the ground where it
// lay, the other slot), or down at your feet.
function thingTo(t, dz) {
  const inv = model();
  if (!t || !t.obj) return { ok: false };
  const o = t.obj, from = { where: o.where, at: o.at ? { ...o.at } : null };
  if (isSlot(dz)) {
    const hand = dz !== 'back' && dz !== 'chest', occ = occupant(dz);
    if (!(hand ? t.isLong || t.def.hand : (t.def.wear || []).includes(dz))) { // nested into the one there
      const f = occ && !occ.isLong && typeof inv.firstFit === 'function' ? inv.firstFit(occ.obj.id, o.item) : null;
      if (!f) return { ok: false, words: 'No room for it in there.' };
      return inv.move(null, o.id, occ.obj.id, f.x, f.y, f.rot) ? { ok: true, words: `${t.def.name}: into the ${lower(short(occ.def) || occ.def.name)}.` } : { ok: false };
    }
    let out = null;
    if (occ) { out = clearSlot(occ, from); if (!out.ok) return out; }
    const r = inv.carry(t.id, hand ? 'hands' : dz);
    if (!r.ok) { if (occ) inv.carry(occ.id, hand ? 'hands' : dz); return r; }
    if (hand) setHand(t, +dz[4]);
    let back = '';
    if (occ && isSlotWhere(from.where)) { const r2 = inv.carry(occ.id, from.where); back = r2.ok ? ` ${r2.words}` : ` ${occ.def.name} set down.`; }
    else if (occ) back = ` ${out.words || ''}`;
    return { ok: true, words: `${r.words}${back}`.trim() };
  }
  if (dz === 'canoe') return inv.load(t.id);
  if (dz === 'ground' || dz === 'wood') return o.item === 'woodarms' ? armloadDown(t) : inv.setDown(t.id);
  if (dz === 'stash') return inv.stow(t.id);
  return { ok: false };
}
const isSlotWhere = (w) => w === 'back' || w === 'chest' || w === 'hands';
// what is in a slot, out of the way: to where the thing taking its place came from, else at your feet
function clearSlot(occ, from) {
  const inv = model(), w = from.where;
  let r = { ok: false };
  if (w === 'canoe') r = inv.load(occ.id);
  else if (w === 'stash') r = inv.stow(occ.id);
  else if (w === 'ground' && from.at) r = inv.setDown(occ.id, from.at, { force: true });
  if (!r.ok) r = inv.setDown(occ.id);
  return r;
}
// the hand it was put in, when that one was free (the model fills the right hand first)
function setHand(t, i) {
  const inv = model(), o = t.obj;
  if (o.where !== 'hands' || o.hand === i || inHand(i)) return;
  o.hand = i;
  if (typeof inv.emit === 'function') inv.emit('carry');
}
// the armload set down: its wood onto a pile at your feet (the woodpile; the empty armload goes)
function armloadDown(t) {
  let n = 0;
  for (const e of [...t.obj.grid]) if (toGround(t.obj.id, e).ok) n += e.qty || 1;
  return n ? { ok: true, words: `The wood stacked on the ground: ${n} ${n === 1 ? 'piece' : 'pieces'}.` } : { ok: false, words: 'No room to set it down here.' };
}
// an item to a zone: onto the ground, into the outfitters' crate, or into what is in that slot (a piece of wood into a
// free hand is an armload)
function itemTo(st, dz) {
  const inv = model(), e = st.e, src = st.grid, bin = src && src.opts.bin;
  if (dz === 'ground' || dz === 'wood') return toGround(src.c.id, e, st.qty);
  if (dz === 'canoe') {
    const to = canoeFor(e.id, src.c.id); if (!to) return { ok: false, words: 'No room for it in the canoe.' };
    const where = `into the ${lower(short(itemDef(to.item)) || nameOf(to))} in the canoe`;
    if (bin) return binTake(bin, e, to.id, { qty: st.qty }) ? { ok: true, words: `${itemDef(e.id).name}: ${where}.` } : { ok: false };
    return moveInto(src, e, to, st.qty) ? { ok: true, words: `${itemDef(e.id).name}: ${where}.` } : { ok: false, words: 'No room for it in the canoe.' };
  }
  if (dz === 'stash') return inv.crate && moveInto(src, e, inv.crate, st.qty) ? { ok: true, words: `${itemDef(e.id).name}: kept for you.` } : { ok: false, words: 'No room on their shelf.' };
  const occ = occupant(dz), hand = dz.startsWith('hand');
  let to = occ && !occ.isLong ? occ.obj : null;
  // fb3 C (decision 11, stream B): an item into a free hand goes to a holder the model makes (inventory.toHand: "In your
  // hand"; wood keeps making an armload); without it, the old armload for wood alone
  if (!to && hand && !bin && typeof inv.toHand === 'function') {
    let r = null;
    try { r = inv.toHand(src.c.id, e.uid, +dz[4], st.qty || undefined) || null; } catch (err) { console.warn('inventory.toHand', err); }
    return r && r.ok ? { ok: true, words: r.words || `${itemDef(e.id).name}: in your hand.` } : { ok: false, words: (r && (r.words || r.why)) || 'It won’t go in your hand.' };
  }
  if (!to && hand && (itemDef(e.id) || {}).kind === 'firewood') to = inv.addContainer('woodarms', 'hands', null, { hand: +dz[4] });
  if (!to) return { ok: false };
  const where = `into the ${lower(short(itemDef(to.item)) || nameOf(to))}`;
  if (bin) return binTake(bin, e, to.id, { qty: st.qty }) ? { ok: true } : { ok: false };
  return moveInto(src, e, to, st.qty) ? { ok: true, words: `${itemDef(e.id).name}: ${where}.` } : { ok: false, words: 'No room for it there.' };
}
// an item out onto the ground (inventory.drop's pile): onto a pile within a step that has room for it, else a new one
// beside you, within reach so The ground's tab shows it
function toGround(cId, e, qty = null) {
  const inv = model(), p = ctx.player;
  if (e.box) return inv.setDown(e.uid);
  if (!onFoot()) return { ok: false, words: 'Not from the canoe: go ashore first.' };
  const n = qty || e.qty || 1, d = itemDef(e.id), wood = d.kind === 'firewood';
  // fb4 join: standing in the water, only onto dry ground (a pile there, or the nearest dry spot within reach), else why
  const wet = typeof inv.wading === 'function' && inv.wading(), pk = p && p.packs, dry = (at) => !wet || !pk || typeof pk.dryAt !== 'function' || pk.dryAt(at.x, at.z);
  // a pile within a step with room: wood onto the woodpile, anything else onto a pile that is not one (a woodpile stays wood)
  const isWoodpile = (k) => nameOf(k) === 'Woodpile';
  const piles = (inv.containers || []).filter((k) => k.item === 'pile' && k.where === 'ground' && k.at && inv.dist(k.at) < 1.6 && dry(k.at) && k.id !== cId && (wood || !isWoodpile(k))).sort((a, b) => (wood ? (isWoodpile(b) ? 1 : 0) - (isWoodpile(a) ? 1 : 0) : 0) || inv.dist(a.at) - inv.dist(b.at));
  for (const k of piles) { const f = firstFit(k, e.id, n); if (f && inv.move(cId, e.uid, k.id, f.x, f.y, f.rot, qty || undefined)) return { ok: true, words: `${d.name} on the ground.` }; }
  let s = wet && typeof inv.downSpot === 'function' ? inv.downSpot(piles.length ? -1 : 1, 1) : inv.spotNear(p.x, p.z, p.heading, piles.length ? -1 : 1, 1);
  if (wet && !s) return inv.wadeNo();
  if (!s || Math.hypot(s.x - p.x, s.z - p.z) > (wet ? 2.6 : 2.2)) s = { x: p.x + Math.sin(p.heading) * 0.8, z: p.z + Math.cos(p.heading) * 0.8 };
  const k = inv.addContainer('pile', 'ground', { x: s.x, z: s.z, y: inv.groundY(s.x, s.z), heading: p.heading, left: true }, { quiet: true });
  const f = k && firstFit(k, e.id, n);
  return f && inv.move(cId, e.uid, k.id, f.x, f.y, f.rot, qty || undefined) ? { ok: true, words: `${d.name} on the ground.` } : { ok: false, words: 'No room to set it down here.' };
}
function binDrop(b, cId, e, qty) {
  if (typeof b.drop !== 'function') return false;
  const r = b.drop({ cId, uid: e.uid, itemId: e.id, qty: qty || e.qty || 1 }) || {};
  said(r);
  return !!r.ok;
}
function binTake(b, e, toCId, { x, y, rot, qty } = {}) {
  if (typeof b.take !== 'function') return false;
  const r = b.take({ uid: e.uid, itemId: e.id, toCId, x, y, rot, qty: qty || e.qty || 1 }) || {};
  said(r, 'No room for it there.');
  return !!r.ok;
}

// --- the tabs as drop targets -------------------------------------------------------------------------------------------
// a container's tab (yours, or one on the ground) takes an item (the first room in it) or a container that nests; The
// canoe takes a pack (loaded) or an item (into the best one in it with room); Wood takes wood (stacked on the woodpile);
// The ground takes anything (set down at your feet); Keeping takes anything into the outfitters' keeping; from a shelf,
// a drop on a tab buys into it
const SPECIAL_TABS = { canoe: 'canoe', ground: 'ground', wood: 'wood', keeping: 'stash' };
function tabCheck(st, tabEl) {
  const key = tabEl.dataset.tab, inv = model(), src = st.grid, e = st.e;
  if (!live()) return 'no';
  if (src && src.opts.shelf) {
    const d = itemDef(e.id), k = d && d.kind;
    // fb4 join: a pack or a barrel dropped on The canoe is bought into the canoe (not kept by the outfitters)
    if (key === 'canoe' && k === 'container' && !e.hull && !e.owned && !e.dear) return (inv.containers || []).filter((c) => c.where === 'canoe').length < 8 ? 'buy' : 'no';
    if (e.hull || e.owned || e.dear || k === 'long' || k === 'container') return 'no';
    const c = key === 'keeping' ? inv.crate : key === 'canoe' ? canoeFor(e.id) : inv.cont(key);
    if (!(c && canFit(c, e.id)) && key === 'canoe' && (inv.containers || []).filter((q) => q.where === 'canoe').length < 8) return 'buy'; // (the content join: loose in the canoe, shop.js buyItem)
    return c && canFit(c, e.id) ? 'buy' : 'no';
  }
  if (SPECIAL_TABS[key]) return zoneCheckDz(st, SPECIAL_TABS[key]);
  if (key === 'pieces') return 'no';
  const c = inv.cont(key); if (!c) return 'no';
  if (st.kind === 'thing' || e.box) {
    const t = thingOfDrag(st); if (!t || t.isLong || !t.def || !t.def.nest || c.id === t.id || c.in === t.id) return 'no';
    return canFit(c, t.obj.item) ? 'ok' : 'no';
  }
  if (src && src.opts.bin && !src.opts.bin.take) return 'no';
  if (src && src.c.id === c.id) return 'no';
  return canFit(c, e.id) ? 'ok' : 'no';
}
function dropOnTab(st, tabEl) {
  const key = tabEl.dataset.tab, inv = model(), src = st.grid, e = st.e;
  if (src && src.opts.shelf && key === 'canoe' && (itemDef(e.id) || {}).kind === 'container') { // (fb4 join: bought into the canoe)
    const sc = src.opts.screen, had = new Set((inv.containers || []).map((c) => c.id));
    if (!sc.buy(e.id, null)) return;
    const c = (inv.containers || []).find((k) => !had.has(k.id) && k.item === e.id), r = c && typeof inv.load === 'function' ? inv.load(c.id) : null;
    if (r && r.ok) { const words = `${itemDef(e.id).name}, $${e.price || 0}: in the canoe at the dock. $${sc.money()} in hand.`; sc.receipt = { ok: true, words }; note(words, 4); sc.mine.openAt('canoe'); sc.render(true); }
    return;
  }
  if (src && src.opts.shelf) {
    const c = key === 'keeping' ? inv.crate : key === 'canoe' ? canoeFor(e.id) : inv.cont(key), f = c && inv.firstFit(c.id, e.id);
    if (f) src.opts.screen.buy(e.id, { cId: c.id, x: f.x, y: f.y, rot: f.rot });
    else if (key === 'canoe') src.opts.screen.buy(e.id, null); // (the content join: no gap in the canoe's packs: the shop says so, or it rides loose in the canoe; it was a drop that did nothing)
    return;
  }
  if (SPECIAL_TABS[key]) { dropOnZone(st, SPECIAL_TABS[key]); return; }
  const c = inv.cont(key); if (!c) return;
  if (st.kind === 'thing' || e.box) { const t = thingOfDrag(st), f = t && inv.firstFit(c.id, t.obj.item); if (!f || !inv.move(null, t.id, c.id, f.x, f.y, f.rot)) note('It won’t go in there.', 2.5); else note(`${t.def.name}: into the ${lower(short(itemDef(c.item)) || nameOf(c))}.`, 3); return; }
  if (!moveInto(src, e, c, st.qty)) note('No room in there.', 2.5);
}

// --- the actions --------------------------------------------------------------------------------------------------
// the containers your tabs show, in their order (the body's, then what nests in them; the pockets last)
function tabContainers() {
  const inv = model(), all = inv.reachable(ctx.player) || [], { list, byId } = ordered(all);
  const top = (c) => topOf(c, byId), rank = (c) => { const t = top(c); return t.where === 'back' ? 0 : t.where === 'chest' ? 1 : t.where === 'hands' ? 2 + (t.hand || 0) : 9; };
  const carried = list.filter((c) => { const w = top(c).where; return (w === 'back' || w === 'chest' || w === 'hands') && !fixedThing(c); }).sort((a, b) => rank(a) - rank(b));
  const pockets = list.filter((c) => c.item === 'pockets');
  return { carried, pockets, list, byId };
}
function moveInto(g, e, to, qty = null) {
  const c = to.c || to, f = firstFit(c, e.id, qty || e.qty || 1);
  if (!f) return false;
  if (g.opts && g.opts.bin) return binTake(g.opts.bin, e, c.id, { x: f.x, y: f.y, rot: f.rot, qty });
  return model().move(g.c.id, e.uid, c.id, f.x, f.y, f.rot, qty || undefined);
}
// a double-click: a shelf's thing bought; a container opened at its tab; a snack eaten; else the thing's use
function primary(g, e) {
  if (g.opts.shelf) { g.opts.screen.buy(e.id, null); return; }
  const d = itemDef(e.id);
  if (e.box) { openTab(e.uid); return; }
  if (d && d.eat && !(d.eat.cook && !d.cooked)) { eat(e); return; }
  if (g.opts.onUse) g.opts.onUse(e, 'use', g.c);
}
// eaten where you stand, at once (the owner, 2026-10-24: "i dont want to have to sit to eat food, just consume it")
function eat(e) {
  const inv = model(); if (typeof inv.eat !== 'function') return;
  const r = inv.eat(e.uid) || {};
  note(r.words || (r.ok ? 'You eat.' : r.why === 'cook' ? 'That wants cooking first: on the grate, over a fire.' : r.why === 'moving' ? 'Hold still to eat.' : 'Not now.'), 3.5);
  refresh();
}
// a container's grid brought up: its own tab (yours or around you), else the tab that holds it (the canoe, Keeping), lit
function openTab(cId) { for (const s of SCREENS) if (s.open && s.mine) s.mine.openAt(cId); }
// a world action on a container or a long thing (carry, setDown, load, stow), its words as a note
function world(fn, ...args) {
  const inv = model(); if (typeof inv[fn] !== 'function') return;
  said(inv[fn](...args), 'Not from here.');
  refresh();
}
// a thing near you's action (nearby.js), from the fire card's button or a verb: the book or the card closed first when
// it wants the world (the ghost tent at the crosshair)
export function runNear(a, opts = {}) {
  if (!a || a.enabled === false) { if (a && a.why) note(a.why, 3); return null; }
  if (a.closeBook) closeBooks();
  let r = null;
  try { r = typeof a.run === 'function' ? a.run({ from: 'book', ...opts }) : null; } catch (e) { console.warn('nearby action', a.id, e); }
  if (r && r.words) note(r.words, 3.5);
  refresh();
  return r;
}
function closeBooks() { for (const s of SCREENS) if (s.open && typeof s.closeBook === 'function') s.closeBook(); }
const WHERE = { back: 'on your back', chest: 'on your chest', hands: 'in your hands', pockets: 'on you', canoe: 'in the canoe', ground: 'on the ground', hung: 'hung in a tree', stash: 'kept by the outfitters', pile: 'on the ground' };
// what a container is called on its strap: a pile on the ground is a woodpile when it is all wood
const nameOf = (c) => {
  if (c.item === 'pile') { const g = c.grid || []; return g.length && g.every((e) => (itemDef(e.id) || {}).kind === 'firewood') ? 'Woodpile' : 'Set down here'; }
  // a hand's holder put into the hull at Get in (the fb3 join): named for what it holds (fb5 join: "At your feet · in the
  // canoe" read wrong ashore at a portage), else loose
  if ((itemDef(c.item) || {}).one && c.where === 'canoe') { const e = (c.grid || []).find((q) => !q.box), d = e && itemDef(e.id); return d ? d.name : 'Loose in the canoe'; }
  return c.name || (itemDef(c.item) || {}).name || 'A container';
};
function whereWords(c, byId) {
  if (c.where === 'in') { const p = byId && byId.get(c.in); return p ? `in the ${lower(short(itemDef(p.item)) || nameOf(p))}` : 'inside'; }
  if (c.item === 'crate') return 'what is left with them';
  const p = ctx.player, w = c.item === 'pile' ? 'on the ground' : c.where === 'hands' ? (c.hand === 1 ? 'in your left hand' : 'in your right hand') : WHERE[c.where] || c.where || '';
  if ((c.where === 'ground' || c.where === 'hung') && c.at && p) { const d = Math.hypot(c.at.x - p.x, c.at.z - p.z); return `${w}${d > 1.2 ? `, ${Math.round(d)} m off` : ''}`; }
  return w;
}

// --- the right-click: a thing's verbs, and nothing else ---------------------------------------------------------------
// (the owner, 2026-10-24: "at most an item can have two quick actions"; the book's menu lists what the thing is for:
// Eat, Cook, Pitch, Hang, Put in hand, Tie it on, Look at the map, stream D's items.js verbs). A greyed verb says why,
// and since fb4 B (decision 2) what it needs as a checklist and the next step: the model's check first (stream C's
// inventory.verb answers eat, cook and tie too), a thing near you's (nearby.itemActions: Pitch, Hang), else the words.
// ref: { g, e } an entry in a grid; { thing } a container or a long thing by its strap, its slot or its frame
function verbMenu(ref, sc = null) {
  const inv = model(), e = ref.e || null, g = ref.g || null, t = ref.thing || (e && e.box ? thingOf(inv.cont ? inv.cont(e.uid) : null) : null);
  const d = e ? itemDef(e.id) : t ? t.def : null;
  if (!d) return [];
  const onUse = g && !g.opts.bin ? g.opts.onUse : null, fire = sc && typeof sc.fireObj === 'function' ? sc.fireObj() : null;
  const near = e && g && !g.opts.bin ? { cId: g.c.id, uid: e.uid, itemId: e.id } : t ? (t.isLong ? { long: t.id } : { container: t.id }) : null;
  const acts = near ? nearActions(near) : [];
  const out = [];
  const grey = (label, why, src = null) => out.push({ label, disabled: true, title: why || (src && src.why) || '', needs: src && src.needs, next: src && src.next });
  // fb3 C (stream B's inventory.verb): the verbs the model runs itself (Drink, Put on the stringer, Change, Pitch over,
  // Put in hand on a plain thing): { enabled, why, label?, run }, null for one it does not know (greyed then)
  const hook = (id) => { if (typeof inv.verb !== 'function' || !near) return null; try { return inv.verb(id, near) || null; } catch (err) { console.warn('inventory.verb', id, err); return null; } };
  const viaHook = (id, label, why) => {
    const r = hook(id);
    if (!r) { grey(label, why); return; }
    out.push({ label: r.label || label, disabled: r.enabled === false, title: r.why || '', needs: r.needs, next: r.next, run: () => { let q = null; try { q = typeof r.run === 'function' ? r.run() : null; } catch (err) { console.warn('verb', id, err); } if (q && q.words) note(q.words, 3.5); refresh(); } });
  };
  for (const v of verbsFor(d, d.id)) {
    const label = v.label || v.id;
    // the model's own check for a verb it knows (C: eat, cook, tie): its why, needs and next when it greys it
    const chk = e && (v.id === 'eat' || v.id === 'cook' || v.id === 'tie') ? hook(v.id) : null, no = chk && chk.enabled === false ? chk : null;
    switch (v.id) {
      case 'eat': {
        if (!e) break;
        if (no) grey(no.label || label, no.why || v.why, no); else if (v.why && !chk) grey(label, v.why); else if (!stillNow()) grey(label, 'hold still'); else out.push({ label, run: () => eat(e) });
        break;
      }
      case 'cook': {
        if (!e || !g) break;
        if (no) { grey(no.label || label, no.why || v.why, no); break; }
        // fb5 B: the model's verb (inventory.verb: onto the grate, which cooks by itself over a lit fire, fb5 A), in the
        // book or the card alike; the fire card's own actions below only without it
        if (chk) { out.push({ label: chk.label || label, run: () => { let q = null; try { q = chk.run(); } catch (err) { console.warn('verb cook', err); } if (q && q.words) note(q.words, 3.5); const n = nearby(); if (n) n.list = null; refresh(); } }); break; }
        if (!fire) { grey(label, v.why || 'At a fire ring', chk); break; }
        const put = acts.find((a) => a.id === 'grate'), onGrate = g.c.item === 'grate', cook = (fire.actions || []).find((a) => a.id === 'cook');
        if (!onGrate && !put) grey(label, 'the grate is full');
        else if (!onGrate && put.enabled === false) grey(label, put.why || 'not now', put);
        else if (onGrate && cook && cook.enabled === false) grey(label, cook.why || 'not now', cook);
        else out.push({ label, run: () => {
          if (!onGrate) runNear(put);
          const n = nearby(); if (n) n.list = null; // the fire read again now the grate has it
          const f2 = sc.fireObj(), c2 = f2 && (f2.actions || []).find((a) => a.id === 'cook');
          if (c2 && c2.enabled !== false) runNear(c2); else if (c2 && c2.why) note(c2.why, 3.5);
        } });
        break;
      }
      case 'pitch': {
        const a = acts.find((x) => x.id === 'pitch');
        if (!a) grey(label, v.why || 'not here'); else if (a.enabled === false) grey(label, a.why || 'not here', a); else out.push({ label, run: () => runNear(a) });
        break;
      }
      case 'hang': { const a = acts.find((x) => x.id === 'hang'); grey(label, v.why || 'carry it to a tree and point at the limb', a && (a.needs || a.next) ? { needs: a.needs, next: a.next } : null); break; } // (E at the tree; what the hang needs from E's chores)
      case 'hand': {
        if (e && e.fixed) break; // (fb5 B: the bottle in its pocket never goes to a hand: no verb that is always grey)
        if (e && !t) { viaHook(v.id, label, v.why || 'not from here'); break; } // a plain thing into a free hand (stream B)
        if (!t) break;
        const o = t.obj;
        if (o.where === 'hands') grey(label, 'in your hand already');
        else if (!onFoot() && !inv.atStash) grey(label, 'not from the canoe');
        else if (typeof inv.freeHand === 'function' && inv.freeHand() < 0) grey(label, 'both hands are full');
        else out.push({ label, run: () => world('carry', t.id, 'hands') });
        break;
      }
      case 'tie': case 'use': {
        if (!e) break;
        const lab = onUse ? onUse(e, 'label', g.c) : null;
        if (no) grey(no.label || label, no.why || v.why, no);
        else if (!lab) grey(label, v.why || (v.id === 'tie' ? 'take the rod up first' : 'not now')); else out.push({ label: v.id === 'use' ? lab : label, run: () => onUse(e, 'use', g.c) });
        break;
      }
      default: viaHook(v.id, label, v.why || '');
    }
  }
  return out;
}
function itemMenu(g, e) {
  const d = itemDef(e.id);
  if (g.opts.shelf) {
    const sc = g.opts.screen, price = e.price || 0, money = sc.money();
    if (e.owned) return [{ label: e.inUse ? 'Yours, in use' : 'Yours already', disabled: true }];
    const out = [{ label: `Buy ${e.qty > 1 ? `${e.qty}` : 'one'}${price ? ` · $${price}` : ' · free'}`, disabled: price > money, run: () => sc.buy(e.id, null) }];
    if (!e.hull && d && (d.kind === 'meal' || d.kind === 'snack' || d.kind === 'lure')) out.push({ label: `Buy three${price ? ` · $${price * 3}` : ''}`, disabled: price * 3 > money, run: () => sc.buy(e.id, null, 3) });
    return out;
  }
  return verbMenu({ g, e }, g.opts.screen || null);
}
// a container or a long thing by its strap: its own verbs (Put in hand; Hang, greyed: that is E at a tree)
function thingMenu(t, isLong, sc = null) {
  const d = itemDef(isLong ? t.id : t.item);
  if (!d || d.fixed || d.station || d.one || t.where === 'pockets' || t.where === 'hung' || (!isLong && /^(crate|pockets|pile|woodarms)$/.test(t.item))) return [];
  return verbMenu({ thing: isLong ? longOf(t) : thingOf(t) }, sc);
}

// --- the menu and the tag -----------------------------------------------------------------------------------------
function openMenu(x, y, items) {
  closeMenu();
  if (!items || !items.length) return;
  const m = menuEl = mk('div', 'ig-menu');
  for (const it of items) {
    const b = mk('button', '', `<span class="vl">${esc(it.label)}</span>`); b.type = 'button'; b.disabled = !!it.disabled;
    if (it.title) b.title = it.title;
    // fb5 B (decision 6): under a greyed verb, one line: why, and the first thing missing as a chip (a hover tip alone
    // is never seen; the old checklist and its next step are gone)
    if (it.disabled) { const line = whyHtml({ enabled: false, why: it.title || '', needs: it.needs }, { tag: 'span' }); if (line) b.insertAdjacentHTML('beforeend', line); }
    b.addEventListener('click', (ev) => { ev.stopPropagation(); closeMenu(); if (it.run) it.run(); });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  // fb5 B (rule 1): a greyed verb's next step is taught once, as a moment over the paper (stream E's hints.next: once a
  // season per id), never written in the menu; the first one only, so one teaching line at a time
  // (fb5 join: only when every verb is greyed, so the player is stuck; a menu opened for its live verb taught the greyed
  // one: "Pitch the tarp" brought "Put down or away what is in a hand…" for the Put in hand under it)
  const teach = items.every((it) => it.disabled) ? items.find((it) => it.next) : null;
  if (teach) { try { const h = typeof window !== 'undefined' && window.__game && window.__game.hints; if (h && typeof h.next === 'function') h.next(`menu:${teach.label}|${String(teach.title || '').replace(/[\d.,½–-]+/g, '#')}`, teach.next, { card: true }); /* (the id without its numbers: a countdown is one moment) */ } catch (err) { console.warn('hints.next', err); } }
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`; m.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  setTimeout(() => window.addEventListener('pointerdown', outside, true), 0);
}
function outside(ev) { if (menuEl && !menuEl.contains(ev.target)) closeMenu(); }
export function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } window.removeEventListener('pointerdown', outside, true); }
// the tag: fb5 B (decision 2; the owner: "only whats relevant … The item doesn't say what it can be used for"), one
// schema for every item, each line only when it has one: the name; what it is in a few words (def.identity); its state
// with its timer (inventory.status); what it does to you, in numbers, with the numbers that compare it to its kind
// (def.onYou); what is left of its uses, servings or litres as a bar; its weight (on a shelf: the price first)
export function tipHtml(d, e, { shelf = false } = {}) {
  if (!d) return '';
  // (content join: a fish weighs what its length makes it, as the pack counts it: an 18 cm crappie read 800 g)
  const fishW = d.kind === 'fish' && e.data && e.data.length && A_ITEMS && typeof A_ITEMS.fishKg === 'function' ? A_ITEMS.fishKg(d.species || String(e.id || d.id).slice(5), e.data.length) : null;
  const kg = e.data && Number.isFinite(e.data.kg) ? e.data.kg * (e.qty || 1) : Number.isFinite(fishW) ? fishW * (e.qty || 1) : (d.kg || 0) * (e.qty || 1), st = d.stack || 1;
  const name = `${d.name}${e.data && e.data.length ? `, ${Math.round(e.data.length)} cm` : ''}`;
  const identity = typeof d.identity === 'string' ? d.identity : e.hull ? 'A canoe' : '';
  const stt = !shelf ? statusOf(e) : null;
  const all = (Array.isArray(d.onYou) ? d.onYou : []).filter(Boolean), effs = all.filter((o) => o.need && Number.isFinite(o.add));
  const on = all.filter((o) => !o.need && (o.label || o.value));
  const n = d.uses ?? d.servings ?? d.litres ?? null, left = n != null ? (Number.isFinite(e.left) ? e.left : n) : null;
  let uses = '';
  if (n != null && !shelf && (n > 1 || d.litres)) {
    const f = Math.max(0, Math.min(1, left / n));
    uses = `<span class="ub" aria-hidden="true"><i style="width:${(f * 100).toFixed(0)}%"></i></span><span class="un">${d.litres ? `${num(+left.toFixed(2))} of ${n} L` : `${Math.round(left)} of ${n}`}</span>`;
  } else if (n != null && shelf && (n > 1 || d.litres)) uses = `<span class="un">${d.litres ? `${n} L` : d.servings ? `${n} servings` : `${n} uses`}</span>`;
  const qty = st > 1 && (e.qty || 1) > 1 && !shelf ? `×${e.qty}` : ''; // (on a shelf the price says it: "$4 for 12")
  const price = shelf ? `${e.owned ? 'yours' : e.price ? `$${e.price}` : 'free'}${e.qty > 1 ? ` for ${e.qty}` : ''}` : '';
  const foot = [uses, [price, qty, kgText(kg)].filter(Boolean).map(esc).join(' · ')].filter(Boolean).join('<span class="sep">·</span>');
  return `<b class="nm">${esc(name)}</b>${identity ? `<span class="id">${esc(identity)}</span>` : ''}${stt && !stt.bar ? statusHtml(stt) : ''}${effsHtml(effs)}${on.length ? `<div class="on">${on.map((o) => (Array.isArray(o.takes) && o.takes.length ? takesHtml(o.takes) : `<span>${o.label ? `<b>${esc(o.label)}</b> ` : ''}${esc(o.value ?? '')}</span>`)).join('')}</div>` : ''}<span class="f">${foot}</span>`;
}
// the owner (2026-10-25: "the lure description can use icons for the neutral, great, etc"): a lure's or the bait's takes
// as the fish's name and five pips, as many filled as the step (neutral 1 … excellent 5, items.js TAKE_STEP); excellent
// in the warm accent; the word is the title and the label read aloud
function takesHtml(list) {
  return list.map((q) => { const n = Math.max(1, Math.min(5, q.step | 0)); return `<span class="take${n === 5 ? ' top' : ''}" title="${esc(`${q.fish}: ${q.word}`)}" aria-label="${esc(`${q.fish}: ${q.word}`)}"><span class="fw">${esc(q.fish)}</span><span class="pips" aria-hidden="true">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span></span>`; }).join('');
}
// fb5 B (the owner, after the first tooltips: "icons with +integers, stacked, no percent"): what an item does to the
// energy bar's needs, a chip each in a row, the bar's own icon and the points out of 100, then when ("a handful")
const ENERGY_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="5" width="14" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="2.6" y="6.6" width="7" height="2.8" fill="currentColor"/></svg>'; // (the bar itself, its green)
const NEED_WORD = { food: 'Food', water: 'Water', rest: 'Rest', warmth: 'Warmth', energy: 'Energy' };
function needIcon(k) {
  if (k === 'energy') return ENERGY_ICON;
  const I = A_HUD && A_HUD.NEED_ICON; return I && I[k] ? I[k] : '';
}
export function effsHtml(effs) {
  if (!effs || !effs.length) return '';
  const when = effs.map((o) => o.when).filter(Boolean)[0] || '';
  return `<div class="eff">${effs.map((o) => { const ic = needIcon(o.need); return `<span class="ef ef-${esc(o.need)}" title="${esc(NEED_WORD[o.need] || o.need)}">${ic || `<i>${esc(NEED_WORD[o.need] || o.need)}</i>`}<b>${o.add >= 0 ? '+' : '−'}${Math.abs(o.add)}</b></span>`; }).join('')}${when ? `<em>${esc(when)}</em>` : ''}</div>`;
}
function showTip(el, g, e) {
  hideTip();
  const d = itemDef(e.id); if (!d || !el.isConnected) return; // (fb5 join: an icon redrawn away under the pointer left its tip stuck in the corner)
  const t = tipEl = mk('div', 'ig-tip');
  t.innerHTML = tipHtml(d, e, { shelf: !!(g && g.opts.shelf) });
  document.body.appendChild(t);
  const r = el.getBoundingClientRect(), tr = t.getBoundingClientRect();
  let x = r.right + 8, y = r.top;
  if (x + tr.width > window.innerWidth - 8) x = r.left - tr.width - 8;
  if (y + tr.height > window.innerHeight - 8) y = window.innerHeight - tr.height - 8;
  t.style.left = `${Math.max(8, x)}px`; t.style.top = `${Math.max(8, y)}px`;
  tipWatch = setInterval(() => { if (!el.isConnected) hideTip(); }, 200); // (its icon redrawn away: no pointerleave comes)
}
let tipWatch = 0;
export function hideTip() { clearTimeout(tipTimer); clearInterval(tipWatch); if (tipEl) { tipEl.remove(); tipEl = null; } }

// --- the blocks the screens are made of ---------------------------------------------------------------------------
// a container: a leather strap with its name, where it is and its weight, over its grid. The strap is its handle:
// dragged, the container goes where it is dropped (a slot, a tab, the canoe, the ground, into another).
const fixedThing = (c) => { const d = itemDef(c.item); return !d || !!d.fixed || !!d.station || !!d.one || /^(crate|pockets|pile)$/.test(c.item); }; // (one: a hand's holder for a single thing, stream B: no tab, no strap)
const isStation = (c) => { const d = itemDef(c.item); return !!(d && d.station) || c.item === 'firefuel' || c.item === 'grate'; };
function block(c, byId, opts = {}) {
  const w = mk('div', `ct w-${c.where}${c.where === 'in' ? ' nested' : ''}${c.item === 'pile' ? ' pile' : ''}`);
  w.dataset.cid = c.id;
  const inv = model(), kg = typeof inv.weight === 'function' && live() ? inv.weight(c.id) : weightOf(c), { cols, rows } = gridSize(c);
  const wide = Math.max(cols * CELL + 4, 154); // as wide as its grid, a strap's width at least (the words are cut to it: a bucket is not as wide as its name)
  w.style.width = `${wide}px`; if (wide < 250) w.classList.add('narrow');
  const used = (c.grid || []).reduce((n, e) => { const [a, b] = dims(itemDef(e.id), e.rot); return n + a * b; }, 0);
  const head = mk('div', 'ct-head', `<span class="nm">${esc(nameOf(c))}</span><span class="wh">${esc(whereWords(c, byId))}</span><span class="kg">${kgText(kg)}${used >= cols * rows ? ' · full' : ''}</span>`);
  head.title = `${nameOf(c)} · ${whereWords(c, byId)} · ${kgText(kg)}`;
  // fb4 B (decision 2): a container's own state on its strap (a pack left out in the rain: "Damp"), the next step in its title
  const cs = fixedThing(c) ? null : statusOf({ container: c.id });
  if (cs) { head.querySelector('.nm').insertAdjacentElement('afterend', mk('span', `ct-st st-${esc(cs.mark || 'none')}`, esc(cs.label || cs.mark))); head.title += ` · ${cs.label || cs.mark}${cs.hint ? ` · ${cs.hint}` : ''}`; }
  if (!fixedThing(c) && c.where !== 'hung') { head.classList.add('grab'); head.addEventListener('pointerdown', (ev) => pressThing(thingOf(c), w, ev)); }
  const menu = () => thingMenu(c, false, opts.screen);
  if (menu().length) { head.classList.add('acts'); head.addEventListener('contextmenu', (ev) => { ev.preventDefault(); openMenu(ev.clientX, ev.clientY, menu()); }); }
  const g = mk('div');
  grid(g, c, { onUse: opts.onUse, screen: opts.screen });
  w.append(head, g);
  return w;
}
// a long thing (the rod, a paddle) as a 5 × 1 frame with its name and where it is; dragged, it goes where it is dropped
function longBlock(l, { inHand = false, screen = null } = {}) {
  const d = itemDef(l.id), w = mk('div', `lg w-${l.where}${l.inUse ? ' inuse' : ''}`);
  w.dataset.uid = l.uid;
  const pic = iconAt(l.id, 4 * CELL, CELL - 8); pic.className = 'lg-pic';
  w.append(pic, mk('span', 'lg-nm', `${esc(d ? d.name : l.id)}<i>${esc(inHand ? (l.inUse ? 'in use' : '') : `${WHERE[l.where] || l.where}${l.inUse ? ' · in use' : ''}`)}</i>`));
  w.title = d ? d.name : l.id;
  const ls = statusOf({ long: l.uid }); // (fb4 B: a long thing's state, as a container's)
  if (ls) { w.appendChild(mk('span', `ct-st st-${esc(ls.mark || 'none')}`, esc(ls.label || ls.mark))); w.title += ` · ${ls.label || ls.mark}${ls.hint ? ` · ${ls.hint}` : ''}`; }
  w.addEventListener('pointerdown', (ev) => pressThing(longOf(l), w, ev));
  // fb5 B: its tag as any item's (the comparison a rod or a paddle carries), not a hover title
  w.removeAttribute('title');
  w.addEventListener('pointerenter', () => { clearTimeout(tipTimer); tipTimer = setTimeout(() => { if (!drag) showTip(w, null, { id: l.id, long: l.uid }); }, 260); });
  w.addEventListener('pointerleave', () => { clearTimeout(tipTimer); hideTip(); });
  const menu = () => thingMenu(l, true, screen);
  if (menu().length) w.addEventListener('contextmenu', (ev) => { ev.preventDefault(); openMenu(ev.clientX, ev.clientY, menu()); });
  return w;
}
// containers in order, each followed by those nested in it
function ordered(list) {
  const byId = new Map(list.map((c) => [c.id, c])), out = [], seen = new Set();
  const add = (c) => { if (seen.has(c.id)) return; seen.add(c.id); out.push(c); for (const k of list) if (k.where === 'in' && k.in === c.id) add(k); };
  for (const c of list) if (c.where !== 'in' || !byId.has(c.in)) add(c);
  return { list: out, byId };
}
const topOf = (c, byId) => { let k = c; for (let i = 0; i < 6 && k.where === 'in' && byId.get(k.in); i++) k = byId.get(k.in); return k; };
// the hold ring on a held action's button: a track, the arc done, a tick between phases
function ringSvg(f, n = 1) {
  const R = 9, C = 12, len = Math.PI * 2 * R, on = Math.max(0, Math.min(1, f)) * len;
  let ticks = '';
  for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI * 2 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a); ticks += `<line x1="${(C + c * (R - 2.4)).toFixed(1)}" y1="${(C + s * (R - 2.4)).toFixed(1)}" x2="${(C + c * (R + 2.4)).toFixed(1)}" y2="${(C + s * (R + 2.4)).toFixed(1)}"/>`; }
  return `<svg class="nb-ring" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle class="tr" cx="${C}" cy="${C}" r="${R}"/><circle class="on" cx="${C}" cy="${C}" r="${R}" stroke-dasharray="${on.toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${C} ${C})"/><g class="tk">${ticks}</g></svg>`;
}

// --- held buttons (the fire's Light and Douse, the canoe's Load everything here) ---------------------------------------
// Held work on the mouse: the book's own key down in the input while the button is held (hold.js moves the job only
// while its key is down); E held keeps it going too. sc is the screen the button is on (its `held`), b the button.
export function actButton(sc, o, a) {
  const off = a.enabled === false, b = mk('button', `nb-act${a.held ? ' held' : ''}${off ? ' off' : ''}`);
  b.type = 'button'; b.dataset.act = `${o.id}|${a.id}`; if (a.job) b.dataset.job = a.job;
  // held: "hold" beside it; a hint beside a ready one; why it cannot be done yet is its tag, and the pencil note when
  // it is pressed
  b.innerHTML = `${a.held ? ringSvg(0) : ''}<span class="l">${esc(a.label)}</span>${a.held ? '<span class="h">hold</span>' : a.hint && !off ? `<span class="h">${esc(a.hint)}</span>` : ''}`;
  if (off) { b.setAttribute('aria-disabled', 'true'); if (a.why) b.title = a.why; } else if (a.hint) b.title = a.hint;
  if (a.held) b.addEventListener('pointerdown', (ev) => { if (ev.button !== 0) return; ev.preventDefault(); if (off) { if (a.why) note(a.why, 3); return; } startHold(sc, o, a, b); });
  else b.addEventListener('click', () => runNear(a));
  return b;
}
export function startHold(sc, o, a, b) {
  const inp = ctx.player && ctx.player.input;
  if (!inp || !inp.down) return;
  stopHold(sc);
  inp.down.add(BOOK_KEY);
  const h = sc.held = { o: o.id, a: a.id, job: a.job || null, extra: null, btn: b, key: `${o.id}|${a.id}` };
  b.classList.add('down');
  if (a.closeBook) closeBooks();
  let r = null;
  try { r = a.run({ key: BOOK_KEY, keys: ['KeyE', 'Mouse0', BOOK_KEY], from: 'book' }); } catch (e) { console.warn('held action', a.id, e); }
  if (r && r.words) note(r.words, 3.5);
  const H = holdOf(), j = H && H.active;
  if (j) { h.job = h.job || j.id; if (j.key && j.key !== BOOK_KEY && !inp.down.has(j.key)) { inp.down.add(j.key); h.extra = j.key; } }
  const up = () => { window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); window.removeEventListener('blur', up); if (sc.held === h) stopHold(sc); };
  window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true); window.addEventListener('blur', up);
}
export function stopHold(sc) {
  const h = sc.held; if (!h) return;
  sc.held = null;
  const inp = ctx.player && ctx.player.input;
  if (inp && inp.down) { inp.down.delete(BOOK_KEY); if (h.extra) inp.down.delete(h.extra); }
  if (h.btn) h.btn.classList.remove('down');
  soon(false);
}
// each frame: the ring on a held button whose job is under way (from the mouse or from E), and the phase under way in
// pencil under the buttons (the button keeps its size, so it never slides out from under the mouse)
export function tickHold(sc, all = false) {
  const H = holdOf(), j = H && H.active;
  if (!j && !sc.wasHolding && !all) return;
  sc.wasHolding = !!j;
  if (!sc.el) return;
  for (const b of sc.el.querySelectorAll('.nb-act.held')) {
    const own = sc.held && sc.held.btn === b, on = !!(j && ((b.dataset.job && j.id === b.dataset.job) || (own && sc.held.job === j.id)));
    const n = on ? j.phases.length : 1, f = on ? j.at / n : 0, k = `${on ? 1 : 0}:${f.toFixed(3)}`;
    if (b.dataset.k === k) continue;
    b.dataset.k = k;
    b.classList.toggle('going', on);
    const svg = b.querySelector('.nb-ring'); if (svg) svg.outerHTML = ringSvg(f, n);
    const acts = b.closest('.nb-acts'); if (!acts) continue;
    let line = acts.nextElementSibling;
    if (!line || !line.classList.contains('nb-doing')) { line = mk('div', 'nb-doing pencil'); acts.after(line); }
    if (on) { const i = Math.min(n - 1, Math.floor(j.at + 1e-9)), ph = j.phases[i]; line.textContent = `${ph.doing || ph.name}${n > 1 ? ` · ${i + 1} of ${n}` : ''}`; line.dataset.by = b.dataset.act; }
    else if (line.dataset.by === b.dataset.act) { line.textContent = ''; line.dataset.by = ''; }
  }
}

// --- the fire's pane (cards.js draws it on the card's right) -------------------------------------------------------------
// fb5 A (the owner's third round of 2026-10-25: "fire ring got too complex … the formulas should not always be there. it
// should only show whats missing … if lit, no tooltips needed, just show how much is left with the bar"). The fire ring as
// nearby.objects() gives it (state, need, burn, coals, cooking, slots, actions): its strap (the picture and the name),
// then one line of state: the chips of what it is short of while it is cold ("Gather wood"; "a dry branch", "×2 more";
// "Wet wood won’t catch"), "Hot coals" and its chip, or, lit, only the burn bar (amber under 20 min; the owner: "just the
// bar", no time beside it). Then the fuel and the grate as grids (a thin bar under the grate while something cooks, its
// state on the thing's icon, inventory.status: lean on the fire's own, no timers, chores.fuelStatus / cook.grateStatus),
// and Douse (held), the one button, while there is a fire to put out. No words or numbers besides the missing chips.
const FP_ICON = '🪵';
// a chip: an icon (the item's, else none) and its words (the wood glyph dropped where the icon stands for it)
function fireChip(q) {
  if (!q || !q.text) return '';
  const img = q.item && !String(q.text).startsWith(FP_ICON) ? `<img class="ic" alt="" src="${iconUrl(q.item, 26, 26)}">` : ''; // (the wood's own glyph reads better than a 1 × 3 log drawn at chip size)
  const text = img ? String(q.text).replace(new RegExp(`^${FP_ICON}\\s*`, 'u'), '') : q.text;
  return `<span class="fp-chip k-${esc(q.kind || 'need')}">${img}<span>${esc(text)}</span></span>`;
}
// fb5 join: what is cooking, by its bar (a fish fries on a stick off the grate's grid, which then looked empty: "where did my
// fish go?"): its icon, a long thing drawn lying down
function cookIcon(ck) {
  if (!ck || !ck.item) return '';
  const d = itemDef(ck.item), long = d && (d.h || 1) > (d.w || 1);
  return `<img class="ic" alt="" src="${long ? iconUrl(ck.item, 54, 18) : iconUrl(ck.item, 24, 24)}">`;
}
// the state line's insides: the chips, the coals, or the burn bar alone
function fireLine(o) {
  if (o.burn) return `<span class="fp-bar${o.burn.low ? ' low' : ''}" role="meter" aria-label="Wood left" aria-valuemin="0" aria-valuemax="1" aria-valuenow="${(+o.burn.value).toFixed(2)}"><i style="width:${pct(o.burn.value)}"></i></span>`;
  const lead = o.coals ? `<span class="fp-lead">Hot coals</span>` : '';
  return `${lead}${(o.need || []).map(fireChip).join('')}`;
}
export function firePanel(o, sc) {
  const w = mk('div', `nb k-${o.kind} fp st-${esc(o.state || 'none')}${o.caught ? ' caught' : ''}`);
  w.dataset.nb = o.id;
  const head = mk('div', 'nb-head');
  const ik = `nb:${o.kind}`;
  if (ICONS[ik]) { const pic = iconAt(ik, 44, 34); pic.className = 'nb-pic'; head.appendChild(pic); }
  head.appendChild(mk('span', 'nm', esc(o.title || '')));
  w.appendChild(head);
  const body = mk('div', 'nb-body');
  const line = fireLine(o);
  body.appendChild(mk('div', `fp-line${line ? '' : ' none'}`, line));
  if (o.slots && o.slots.length) {
    const row = mk('div', 'nb-slots');
    for (const s of o.slots) {
      const sw = mk('div', `nb-slot s-${s.id}`);
      sw.appendChild(mk('div', 'nb-lab', esc(s.label || s.id)));
      const g = mk('div'), inv = model(), c = s.cId && typeof inv.cont === 'function' ? inv.cont(s.cId) : null;
      if (c) grid(g, c, { onUse: sc.onUse || null, screen: sc });
      else { const b = { ...s, obj: o.id }; grid(g, binContainer(`bin:${o.id}:${s.id}`, b), { bin: b, screen: sc }); }
      sw.appendChild(g);
      if (s.id === 'grate') sw.appendChild(mk('span', `fp-cook${o.cooking ? '' : ' none'}`, `${cookIcon(o.cooking)}<b><i style="width:${pct(o.cooking ? o.cooking.value : 0)}"></i></b>`));
      row.appendChild(sw);
    }
    body.appendChild(row);
  }
  const acts = (o.actions || []).filter((a) => a && a.label && a.enabled !== false);
  if (acts.length) {
    const row = mk('div', 'nb-acts');
    for (const a of acts) row.appendChild(actButton(sc, o, a));
    body.appendChild(row);
  }
  w.appendChild(body);
  return w;
}
// a few times a second: the bars in place (the wood left, the amber under 20 min, the pot's progress)
export function livenPanel(el, o) {
  const bar = el.querySelector('.fp-bar');
  if (bar && o.burn) {
    bar.classList.toggle('low', !!o.burn.low);
    const i = bar.querySelector('i'); if (i) i.style.width = pct(o.burn.value);
  }
  const ck = el.querySelector('.fp-cook');
  if (ck) { ck.classList.toggle('none', !o.cooking); const i = ck.querySelector('i'); if (i) i.style.width = pct(o.cooking ? o.cooking.value : 0); }
}
// the signature of a fire object: what would change its drawing (not the bars' lengths: livenPanel moves those)
export const panelSig = (o) => [o.id, o.title, o.state || '', o.cooking ? o.cooking.item || 1 : 0, (o.need || []).map((q) => `${q.kind}${q.text}`).join(','), o.burn ? 1 : 0, o.coals ? 1 : 0,
  (o.slots || []).map((s) => `${s.id}:${s.cId || ''}:${(s.items || []).map((i) => `${i.uid}x${i.qty || 1}`).join('.')}`).join(';'),
  (o.actions || []).map((a) => `${a.id}${a.enabled === false ? 0 : 1}${a.label}`).join(';'), slotStates(o)].join('/');
// the states of what is in the fire's fuel and on its grate (wet wood, the pot's chip, a meal Ready): their marks change
// the drawing
function slotStates(o) {
  const inv = model(); if (typeof inv.status !== 'function' || typeof inv.cont !== 'function') return '';
  return (o.slots || []).map((s) => { const c = s.cId ? inv.cont(s.cId) : null; return c ? (c.grid || []).map((e) => { const q = statusOf(e); return q ? `${e.uid}${q.mark || ''}${q.chip || ''}` : ''; }).join('') : ''; }).join(';');
}

// --- your stuff, on one screen ------------------------------------------------------------------------------------
// The body on the left: the back and the chest, each hand, the pockets. Across the top a tab for every container you
// carry (Pack · Barrel · Bucket · Tackle box …), one grid open at a time.
// fb4 B (decision 1; the owner, 2026-10-25: "it should be a tab for each container, where the canoe is a container,
// maybe the wood pile is a tab. Tackle box, if it's on the ground, is a tab … ground is also a tab"): in the book
// (pane: true) the right pane is tabs too, one per thing within reach that isn't on you, one grid open at a time:
//   The canoe      when it is beside you (afloat: you are in it; at an outfitter: at the dock): its load, each pack or
//                  barrel in it with its grid, the paddles and the rod, Set everything out and Load everything here
//   Duluth pack …  each container on the ground within reach (a pack, a barrel, the bucket, a tackle box lying there),
//                  and what nests in them after them ("in the pack")
//   Wood           the woodpile and the wood lying about, dead and down
//   The ground     what is set down loose (a pile that isn't wood), a rod or a paddle lying there; a drop here, or on
//                  the tab, or off the page, sets a thing down at your feet
//   Keeping        at an outfitter, what they keep for you
// Drag between any left tab and any right tab, both ways, or onto a tab itself (the first room in it). With a card open
// (the fire, a shelf) the right is the card's, and the left is the body plus all the tabs together: yours first, then
// the ones around you in the ground's cord colour, the same tabs in the same order as the book's right. "Nothing within
// reach" when the right has none.
const TAB_NAMES = { pack3: 'Pack', pack4: 'Pack', barrel30: 'Barrel', barrel60: 'Barrel', bucket: 'Bucket', tacklebox: 'Tackle box', stringer: 'Stringer', mapcase: 'Map case', woodarms: 'Armload' };
const TAB_TWO = { pack3: 'Pack #3', pack4: 'Pack #4', barrel30: 'Barrel 30', barrel60: 'Barrel 60' };
const AROUND_NAMES = { ...TAB_NAMES, pack3: 'Duluth pack', pack4: 'Duluth pack' };
const AROUND_TWO = { ...TAB_TWO, pack3: 'Duluth #3', pack4: 'Duluth #4' };
const SHORT_WHERE = { back: 'back', chest: 'chest' };
// containers with their tab labels, two of a kind told apart ("Pack #3", "Pack #4"; "Barrel 30 2")
function labelled(cs, names, two) {
  const base = (c) => names[c.item] || short(itemDef(c.item)) || 'Container', count = new Map(), seen = new Map();
  for (const c of cs) count.set(base(c), (count.get(base(c)) || 0) + 1);
  return cs.map((c) => {
    let label = base(c);
    if (count.get(label) > 1) { label = two[c.item] || label; const k = seen.get(label) || 0; seen.set(label, k + 1); if (k) label = `${label} ${k + 1}`; }
    return { c, label };
  });
}
// the best container in the canoe for an item dropped on The canoe (its tab or its page): the ones that take its kind
// first (the barrel for food), never a hand's holder or the stringer for anything but a fish
function canoeFor(itemId, not = null) {
  const inv = model(), d = itemDef(itemId); if (!d) return null;
  const root = (c) => (typeof inv.rootWhere === 'function' ? inv.rootWhere(c) : c.where);
  const score = (c) => (typeof inv.score === 'function' ? inv.score(c, d) : (gridSize(c).accepts ? 4 : 0));
  const list = (inv.containers || []).filter((c) => c.id !== not && root(c) === 'canoe' && !(itemDef(c.item) || {}).one && c.item !== 'crate' && (c.item !== 'stringer' || d.kind === 'fish') && acceptsKind(c, d) && canFit(c, itemId));
  return list.sort((a, b) => score(b) - score(a))[0] || null;
}
export class MineSide {
  // owner: the screen this is part of (its render(force), its held state); onUse: the grids' Use (the lures, the sheets);
  // pane: the things around you drawn as the right pane, tabs of their own (the book); else they are tabs after yours
  // (the fire card, a shelf)
  constructor({ owner = null, onUse = null, closeBook = null, pane = false } = {}) {
    this.el = mk('div', `mine${pane ? ' with-here' : ''}`); this.owner = owner; this.onUse = onUse; this.closeBook = closeBook; this.pane = !!pane;
    this.tab = null; this.rtab = null; this.sig = ''; this.pendLit = null; this.pieces = []; this.shown = ['', ''];
  }
  // the tabs now: yours [{ key, kind: 'cont', c, label, sub }], and what is around you (around(): the tabs and their
  // contents)
  tabs() {
    const { carried, list, byId } = tabContainers(), top = (c) => topOf(c, byId);
    const yours = labelled(carried, TAB_NAMES, TAB_TWO).map(({ c, label }) => {
      const t = top(c), sub = c.where === 'in' ? `in the ${lower(TAB_NAMES[t.item] || short(itemDef(t.item)) || 'pack')}` : t.where === 'hands' ? (t.hand === 1 ? 'left hand' : 'right hand') : SHORT_WHERE[t.where] || t.where;
      return { key: c.id, kind: 'cont', c, label, sub };
    });
    const A = this.around(list, byId);
    return { yours, around: A.tabs, list, byId, A };
  }
  // what is within reach that isn't on you, as tabs (in this order: the canoe, Keeping, each container on the ground,
  // Wood, The ground), with what each shows
  around(list, byId) {
    const inv = model(), p = ctx.player, top = (c) => topOf(c, byId), stash = !!inv.atStash, afloat = !!(p && p.mode === 'paddle'), foot = onFoot();
    const groundAll = list.filter((c) => { const k = top(c); return k.where === 'ground' && !isStation(k); });
    const woodpiles = groundAll.filter((c) => c.item === 'pile' && nameOf(c) === 'Woodpile'), loose = groundAll.filter((c) => c.item === 'pile' && !woodpiles.includes(c));
    const pileKids = groundAll.filter((c) => c.item !== 'pile' && top(c).item === 'pile'); // (a thing nested in a pile: drawn with the ground)
    const ground = groundAll.filter((c) => c.item !== 'pile' && top(c).item !== 'pile');
    const canoe = list.filter((c) => top(c).where === 'canoe');
    const atCanoe = !!(stash || canoe.length > 0 || afloat || (typeof inv.nearCanoe === 'function' && inv.nearCanoe()));
    const near3 = (l) => l.at && p && Math.hypot(l.at.x - p.x, l.at.z - p.z) < 3;
    const longs = inv.long || [], longCanoe = atCanoe ? longs.filter((l) => l.where === 'canoe') : [], longGround = foot ? longs.filter((l) => l.where === 'ground' && near3(l)) : [];
    const pieces = foot ? this.pieces : [];
    const tabs = [];
    if (atCanoe) tabs.push({ key: 'canoe', kind: 'canoe', label: 'The canoe', sub: afloat ? 'you are in it' : stash ? 'at the dock' : p && p.mode === 'carry' ? 'on your shoulders' : 'beside you' });
    if (stash) tabs.push({ key: 'keeping', kind: 'keeping', label: 'Keeping', sub: 'at the outfitter’s' });
    for (const { c, label } of labelled(ground, AROUND_NAMES, AROUND_TWO)) {
      const t = top(c), d = c.at && p ? Math.hypot(c.at.x - p.x, c.at.z - p.z) : 0;
      tabs.push({ key: c.id, kind: 'ground', c, label, sub: c.where === 'in' ? `in the ${lower(AROUND_NAMES[t.item] || short(itemDef(t.item)) || 'pack')}` : d > 1.2 ? `${Math.round(d)} m off` : 'on the ground' });
    }
    const pcs = woodpiles.reduce((n, c) => n + (c.grid || []).reduce((k, e) => k + (e.qty || 1), 0), 0) + pieces.length;
    if (foot && (woodpiles.length || pieces.length)) tabs.push({ key: 'wood', kind: 'wood', label: 'Wood', sub: `${pcs} ${pcs === 1 ? 'piece' : 'pieces'}` });
    const n = loose.reduce((k, c) => k + (c.grid || []).length, 0) + pileKids.length + longGround.length;
    if (foot) tabs.push({ key: 'ground', kind: 'loose', label: 'The ground', sub: n ? `${n} ${n === 1 ? 'thing' : 'things'}` : 'at your feet' });
    return { tabs, ground, woodpiles, loose, pileKids, canoe, longCanoe, longGround, atCanoe, afloat, stash };
  }
  // the tab open on a side: the one chosen while it is still there, else (yours) the back's, else the first
  current(tabs, cur, mine) {
    if (cur && tabs.some((t) => t.key === cur)) return cur;
    if (mine) { const inv = model(), back = typeof inv.worn === 'function' ? inv.worn('back') : null, t = (back && tabs.find((q) => q.key === back.id)) || tabs.find((q) => q.kind === 'cont'); if (t) return t.key; }
    return tabs[0] ? tabs[0].key : null;
  }
  redraw() { this.sig = ''; if (this.owner) this.owner.render(true); else this.render(true); }
  setTab(key) { if (this.tab === key) return; this.tab = key; this.redraw(); }
  setRTab(key) { if (this.rtab === key) return; this.rtab = key; this.redraw(); }
  // a container's grid brought up and lit: its own tab (yours, or one around you), else the tab that holds it: the one it
  // nests in, the canoe, the wood, the ground, the keeping. ref: a container's id, 'canoe', a piece of wood ('piece:…')
  openAt(ref) {
    const inv = model(), T = this.tabs(), c = ref && typeof inv.cont === 'function' ? inv.cont(ref) : null;
    const root = c ? (typeof inv.root === 'function' ? inv.root(c) : c) : null, where = root ? root.where : null;
    const wood = (k) => !!(k && k.item === 'pile' && nameOf(k) === 'Woodpile');
    this.pendLit = ref;
    const keys = [ref, c && c.where === 'in' ? c.in : null, ref === 'canoe' || where === 'canoe' ? 'canoe' : null,
      String(ref).startsWith('piece:') || ref === 'pieces' || wood(c) || wood(root) ? 'wood' : null, root && root.item === 'pile' ? 'ground' : null, where === 'stash' ? 'keeping' : null].filter(Boolean);
    this.litTab = null;
    for (const k of keys) {
      if (T.yours.some((t) => t.key === k)) { this.tab = k; this.litTab = k; break; }
      if (T.around.some((t) => t.key === k)) { if (this.pane) this.rtab = k; else this.tab = k; this.litTab = k; break; }
    }
    this.redraw();
  }
  sigNow() {
    const inv = model(), list = inv.reachable(ctx.player) || [], p = ctx.player, n = nearby();
    this.pieces = n && typeof n.groundPieces === 'function' && onFoot() ? (() => { try { return n.groundPieces() || []; } catch { return []; } })() : [];
    const pk = packsOf(), lo = pk && typeof pk.loadables === 'function' && p && p.carry && p.carry.drop ? (() => { try { return pk.loadables(p.carry.drop).filter((u) => !(typeof pk.autoLoads === 'function' && pk.autoLoads(u))).length; } catch { return 0; } })() : 0;
    // (fb4 B, decision 2: an entry's state, wet or treating or cooking, redraws its mark when it changes)
    const sl = (s) => (s ? `${s.mark || ''}${s.label}` : '');
    const st = typeof inv.status === 'function' ? list.map((c) => `${fixedThing(c) ? '' : sl(statusOf({ container: c.id }))}${(c.grid || []).map((e) => { const s = statusOf(e); return s ? `${e.uid}${sl(s)}` : ''; }).join('')}`).join('') + (inv.long || []).map((l) => sl(statusOf({ long: l.uid }))).join('') : '';
    return [version, this.tab, this.rtab, list.map((c) => `${c.id}:${c.where}:${c.hand ?? ''}:${c.in || ''}:${(c.grid || []).length}`).join(), (inv.long || []).map((l) => `${l.uid}:${l.where}:${l.hand ?? ''}`).join(), inv.atStash ? 1 : 0,
      p ? p.mode : '', onFoot() ? 1 : 0, typeof inv.nearCanoe === 'function' && inv.nearCanoe() ? 1 : 0, this.pieces.map((q) => q.uid).join(), lo, this.pendLit || '', st].join('|');
  }
  render(force) {
    if (drag) { dirty = true; return; }
    const sig = this.sigNow(); if (!force && sig === this.sig) return;
    this.sig = sig;
    const T = this.tabs(), left = this.pane ? T.yours : [...T.yours, ...T.around];
    const key = this.current(left, this.tab, true), rkey = this.pane ? this.current(T.around, this.rtab, false) : null;
    // each page keeps its scroll while it shows the same tab
    const pages = [...this.el.querySelectorAll(':scope > section > .tabpage')].map((n) => n.scrollTop);
    for (const g of [...GRIDS.values()]) if (this.el.contains(g.el)) g.destroy();
    this.el.textContent = '';
    // the body
    const body = mk('section', 'mn-body'); body.setAttribute('aria-label', 'On you');
    const slots = mk('div', 'slots');
    slots.append(this.wornSlot('back', 'On your back'), this.wornSlot('chest', 'On your chest'));
    body.appendChild(slots);
    body.append(this.handSlot(0), this.handSlot(1));
    for (const c of T.list.filter((q) => q.item === 'pockets')) { const w = mk('div', 'mn-pockets'); w.appendChild(mk('div', 'slot-lab', 'Pockets · quick slots')); const g = mk('div'); grid(g, c, { onUse: this.onUse, screen: this.owner }); w.appendChild(g); body.appendChild(w); }
    const cols = [this.column(left, key, T, false)];
    if (this.pane) cols.push(this.column(T.around, rkey, T, true));
    this.el.append(body, ...cols);
    cols.forEach((col, i) => { const k = i ? rkey : key, pg = col.querySelector('.tabpage'); if (pg && this.shown[i] === k && pages[i]) pg.scrollTop = pages[i]; this.shown[i] = k; });
    // the grid brought up (openAt) lit for a moment, and scrolled to; the light survives a redraw (its animation picks
    // up where it was)
    if (this.pendLit) { this.lit = { ref: this.pendLit, t0: now(), until: now() + 1600 }; this.pendLit = null; }
    if (this.lit) {
      if (now() > this.lit.until) this.lit = null;
      else {
        const ref = this.lit.ref, el = this.el.querySelector(`.ct[data-cid="${CSS.escape(ref)}"], .ct[data-piece="${CSS.escape(ref)}"]`) || (String(ref).startsWith('piece:') ? this.el.querySelector('.ct.pieces') : ref === 'canoe' ? this.el.querySelector('.pk-zone.z-canoe') : null);
        if (el) { if (this.lit.t0 === now() || now() - this.lit.t0 < 50) setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 0); el.style.animationDelay = `${-(now() - this.lit.t0)}ms`; el.classList.add('lit'); }
        const tb = this.litTab ? this.el.querySelector(`.ctab[data-tab="${CSS.escape(this.litTab)}"]`) : null; // (and its tab)
        if (tb) { tb.style.animationDelay = `${-(now() - this.lit.t0)}ms`; tb.classList.add('lit'); }
      }
    }
  }
  // a column of tabs and the page of the one open: yours (left), or what is around you (right, the book)
  column(tabs, key, T, right) {
    const side = mk('section', right ? 'mn-here' : 'mn-tabs');
    if (right) side.setAttribute('aria-label', 'Around you: what is within reach');
    const nav = mk('nav', `ctabs${right ? ' around' : ''}`); nav.setAttribute('role', 'tablist');
    for (const t of tabs) {
      const b = mk('button', `ctab k-${t.kind}${t.kind !== 'cont' ? ' k-around' : ''}${t.key === key ? ' on' : ''}`, `<b>${esc(t.label)}</b><i>${esc(t.sub || '')}</i>`);
      b.type = 'button'; b.dataset.tab = t.key; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(t.key === key));
      b.addEventListener('click', () => (right ? this.setRTab(t.key) : this.setTab(t.key)));
      nav.appendChild(b);
    }
    if (right && !tabs.length) nav.appendChild(mk('span', 'ctabs-none', 'Nothing within reach'));
    side.appendChild(nav);
    const t = tabs.find((q) => q.key === key) || null;
    const page = mk('div', `tabpage tp-${t ? t.kind : 'none'}`);
    this.pageFor(page, t, T, right);
    side.appendChild(page);
    return side;
  }
  pageFor(page, t, T, right) {
    const sc = this.owner;
    if (!t) { page.appendChild(mk('p', 'pk-empty', right ? 'Nothing within reach.' : 'Nothing on you.')); return; } // (fb5 B: quiet, rule 5)
    if (t.kind === 'cont' || t.kind === 'ground') page.appendChild(block(t.c, T.byId, { onUse: this.onUse, screen: sc }));
    else if (t.kind === 'canoe') this.canoePage(page, T);
    else if (t.kind === 'wood') this.woodPage(page, T);
    else if (t.kind === 'loose') this.groundPage(page, T);
    else if (t.kind === 'keeping') this.keepingPage(page, T.list, T.byId);
  }
  // the back or the chest: the thing worn there, its strap a handle; a drop zone; a click opens its tab
  wornSlot(dz, label) {
    const t = wornThing(dz), s = mk('div', `slot big${t ? '' : ' empty'}`), sc = this.owner;
    s.dataset.dz = dz;
    s.appendChild(mk('div', 'slot-lab', esc(label)));
    const f = mk('div', 'slot-frame');
    if (t && t.def) {
      f.append(iconAt(t.obj.item, 2 * CELL, 2 * CELL), mk('span', 'slot-nm', esc(short(t.def))));
      f.classList.add('grab'); f.title = 'Click for its grid · drag it to set it down, load it or swap it';
      if (this.tab === t.obj.id) f.classList.add('on');
      f.addEventListener('pointerdown', (ev) => pressThing(t, f, ev, () => this.setTab(t.obj.id)));
      const menu = () => thingMenu(t.obj, false, sc);
      if (menu().length) f.addEventListener('contextmenu', (ev) => { ev.preventDefault(); openMenu(ev.clientX, ev.clientY, menu()); });
    } else f.appendChild(mk('span', 'slot-none', dz === 'back' ? 'a pack' : 'a pack or a barrel'));
    s.appendChild(f);
    return s;
  }
  // a hand: what is in it, a container (its grid is its tab) or a long thing in its frame; a drop zone
  handSlot(i) {
    const t = inHand(i), s = mk('div', `slot hand${t ? '' : ' empty'}${t && t.isLong ? ' long' : ''}`), sc = this.owner;
    s.dataset.dz = `hand${i}`;
    s.appendChild(mk('div', 'slot-lab', i ? 'Left hand' : 'Right hand'));
    if (!t || !t.def) { const f = mk('div', 'slot-frame'); f.appendChild(mk('span', 'slot-none', 'empty')); s.appendChild(f); return s; } // (fb5 B: quiet, rule 5)
    if (t.isLong) { s.appendChild(longBlock(t.obj, { inHand: true, screen: sc })); return s; }
    // fb3 C (decision 11, stream B's holder): a hand holding one plain thing (def.one) shows the thing itself, at its own
    // footprint, dragged out of it as from any grid, its verbs on the right-click
    if (t.def.one) {
      const held = (t.obj.grid || [])[0];
      s.classList.add('held');
      const f = mk('div', 'slot-frame one');
      if (held) { const hd = itemDef(held.id), [w, h] = dims(hd, held.rot), g = mk('div'); grid(g, t.obj, { onUse: this.onUse, screen: sc, size: { cols: Math.max(1, w + (held.x || 0)), rows: Math.max(1, h + (held.y || 0)) } }); f.appendChild(g); }
      else f.appendChild(mk('span', 'slot-none', 'an empty hand'));
      s.appendChild(f);
      return s;
    }
    const f = mk('div', 'slot-frame grab');
    f.append(iconAt(t.obj.item, CELL, CELL), mk('span', 'slot-nm', esc(short(t.def))));
    f.title = 'Click for its grid · drag it to set it down or load it';
    if (this.tab === t.obj.id) f.classList.add('on');
    f.addEventListener('pointerdown', (ev) => pressThing(t, f, ev, () => this.setTab(t.obj.id)));
    const menu = () => thingMenu(t.obj, false, sc);
    if (menu().length) f.addEventListener('contextmenu', (ev) => { ev.preventDefault(); openMenu(ev.clientX, ev.clientY, menu()); });
    s.appendChild(f);
    return s;
  }
  zone(col, dz, title, kids, empty) {
    const z = mk('div', `pk-zone z-${dz}`); z.dataset.dz = dz;
    if (title) z.appendChild(mk('div', 'pk-lab', esc(title)));
    const f = mk('div', 'pk-flow');
    for (const k of kids) f.appendChild(k);
    if (empty) f.appendChild(mk('div', 'pk-well', esc(empty)));
    z.appendChild(f); col.appendChild(z);
    return z;
  }
  // The canoe: what is in it (each container with its grid, the long things in their frames), and beside it on foot its
  // two buttons. A drop on the page (not on a grid) loads a container, or puts an item in the best one in it with room.
  canoePage(page, T) {
    const A = T.A, inv = model(), sc = this.owner;
    // the biggest first, so the smaller ones sit beside it; what nests in one right after it
    const area = (c) => { const k = gridSize(c); return k.cols * k.rows; }, top = (c) => topOf(c, T.byId);
    const tops = A.canoe.filter((c) => c.where === 'canoe').sort((a, b) => area(b) - area(a));
    const order = [...tops.flatMap((t) => A.canoe.filter((c) => top(c) === t)), ...A.canoe.filter((c) => !tops.includes(top(c)))];
    const kids = [...order.map((c) => block(c, T.byId, { onUse: this.onUse, screen: sc })), ...A.longCanoe.map((l) => longBlock(l, { screen: sc }))];
    const kg = A.canoe.filter((c) => c.where === 'canoe').reduce((k, c) => k + (typeof inv.weight === 'function' && live() ? inv.weight(c.id) : weightOf(c)), 0) + A.longCanoe.reduce((k, l) => k + ((itemDef(l.id) || {}).kg || 0), 0);
    const title = `${A.stash ? 'In the canoe at the dock' : 'In the canoe'}${kg > 0.05 ? ` · ${kgText(kg)}` : ''}`;
    const z = this.zone(page, 'canoe', title, kids, kids.length ? (A.afloat ? '' : 'room to load') : A.afloat ? 'Nothing in the canoe but you.' : 'Nothing in the canoe.'); // (fb5 B: quiet, rule 5)
    if (!A.afloat && !A.stash) z.insertBefore(this.canoeActs(A.canoe, A.longCanoe), z.querySelector('.pk-flow')); // (fb5 join: at the top, where Shoulder it's word sends you, not under a loaded canoe's grids out of sight)
  }
  // Wood: the woodpiles within reach and the wood lying about (dead and down); wood dropped here is stacked
  woodPage(page, T) {
    const kids = T.A.woodpiles.map((c) => block(c, T.byId, { onUse: this.onUse, screen: this.owner }));
    if (this.pieces.length) kids.push(this.piecesBlock());
    this.zone(page, 'wood', 'Wood · within reach', kids, 'drag wood here to stack it');
  }
  // The ground: what is set down loose and what lies there; a drop here sets a thing down at your feet
  groundPage(page, T) {
    const A = T.A, sc = this.owner;
    const kids = [...A.loose.map((c) => block(c, T.byId, { onUse: this.onUse, screen: sc })), ...A.pileKids.map((c) => block(c, T.byId, { onUse: this.onUse, screen: sc })), ...A.longGround.map((l) => longBlock(l, { screen: sc }))];
    this.zone(page, 'ground', 'On the ground · within reach', kids, kids.length ? 'drag here to set a thing down' : 'Nothing lies here. Drag a thing here, onto the tab, or off the page to set it down at your feet.');
  }
  // the canoe's two: everything out onto the ground about the hull, everything about it in (held: packs.js)
  canoeActs(canoe, longCanoe) {
    const pk = packsOf(), p = ctx.player, d = p && p.carry && p.carry.drop, sc = this.owner, row = mk('div', 'nb-acts canoe-acts');
    const loadable = pk && d && typeof pk.loadables === 'function' ? pk.loadables(d).filter((u) => !(typeof pk.autoLoads === 'function' && pk.autoLoads(u))) : [];
    const out = canoe.filter((c) => c.where === 'canoe').length + longCanoe.filter((l) => !l.inUse && l.id !== 'stringer').length;
    const o = { id: 'canoe' };
    row.appendChild(actButton(sc, o, { id: 'setout', label: 'Set everything out', enabled: out > 0, why: 'nothing in the canoe to set out', run: () => setOutAll() }));
    row.appendChild(actButton(sc, o, { id: 'load', label: 'Load everything here', held: true, job: 'load', enabled: loadable.length > 0, why: 'nothing lies about to load', run: (opts) => loadAll(d, loadable, opts) }));
    return row;
  }
  keepingPage(page, list, byId) {
    const inv = model(), sc = this.owner, kept = list.filter((c) => topOf(c, byId).where === 'stash').sort((a, b) => (a.item === 'crate' ? 1 : 0) - (b.item === 'crate' ? 1 : 0)); // the crate (their back shelf) last
    const longKept = (inv.long || []).filter((l) => l.where === 'stash');
    this.zone(page, 'stash', 'Kept for you by the outfitters', [...kept.map((c) => block(c, byId, { onUse: this.onUse, screen: sc })), ...longKept.map((l) => longBlock(l, { screen: sc }))], kept.length || longKept.length ? 'they ship it up the road to whichever counter you come in at' : 'Nothing kept here.');
  }
  // the wood lying about within reach (nearby.groundPieces): a pile you take from
  piecesBlock() {
    const n = nearby(), w = mk('div', 'ct pieces'), sc = this.owner;
    w.dataset.piece = 'pieces';
    w.appendChild(mk('div', 'ct-head', '<span class="nm">Lying about</span><span class="wh">dead and down, within reach</span>'));
    const b = { id: 'pieces', items: this.pieces.map((q) => ({ uid: q.uid, id: q.id })), cols: 4, rows: 2, take: ({ uid, toCId, x, y, rot }) => n.takePiece(uid, toCId, x, y, rot) };
    const g = mk('div'); grid(g, binContainer('bin:pieces', b), { bin: b, screen: sc });
    w.appendChild(g);
    return w;
  }
}
// everything in the canoe beside you set out on the ground about the hull (packs.setOutAll, stream A; a stand-in until it is in)
function setOutAll() {
  const pk = packsOf(), inv = model(), p = ctx.player;
  let r = null;
  if (pk && typeof pk.setOutAll === 'function') r = pk.setOutAll();
  else {
    let n = 0;
    const spot = (k) => inv.spotNear(p.x, p.z, p.heading, k % 2 ? -1 : 1, 1 + Math.floor(k / 2) * 0.7);
    for (const c of [...inv.containers]) if (c.where === 'canoe' && !fixedThing(c) && c.item !== 'stringer') { const s = spot(n); if (inv.setDown(c.id, { x: s.x, z: s.z, heading: p.heading }, { force: true }).ok) n++; }
    for (const l of [...inv.long]) if (l.where === 'canoe' && !l.inUse) { const s = spot(n); if (inv.setDown(l.uid, { x: s.x, z: s.z, heading: p.heading }, { force: true }).ok) n++; }
    r = { n, words: n ? `${n === 1 ? 'One thing' : `${n} things`} set out beside the canoe.` : 'Nothing in the canoe to set out.' };
  }
  if (r && r.words) note(r.words, 3.5);
  refresh();
  return r;
}
// the held load: packs.loadAll (stream A), else the hold job over packs.loadAllOpts
function loadAll(d, list, opts = {}) {
  const pk = packsOf(), H = holdOf();
  if (!pk) return null;
  const o = { key: opts.key || BOOK_KEY, keys: opts.keys || ['KeyE', 'Mouse0', opts.key || BOOK_KEY] };
  if (typeof pk.loadAll === 'function') return pk.loadAll(o);
  if (!H || !d || !list.length || typeof pk.loadAllOpts !== 'function') return null;
  return H.begin({ ...pk.loadAllOpts(d, list), ...o });
}
// the book open with that container's (or pile's) tab on the right, its grid lit: stream A's Q "Open it" and "Open the
// pile"
export function openHere(ref) {
  const j = of(ctx.journal);
  // 'canoe' (or the canoe itself: a ref of kind 'canoe', or the beached hull's spot, with no container id) lights the
  // canoe's tab: stream A's Q on a loaded hull, "Unload it first" (fb3 C, decision 3)
  const canoe = ref === 'canoe' || !!(ref && typeof ref === 'object' && !ref.cId && !ref.id && !ref.container && (ref.kind === 'canoe' || ref.canoe === true || ref.hull || (ref.x != null && ref.z != null)));
  const id = canoe ? 'canoe' : ref && typeof ref === 'object' ? ref.cId || ref.id || ref.container || null : ref;
  const cards = of(ctx.cards); if (cards && cards.shown && typeof cards.close === 'function') cards.close();
  if (j && typeof j.show === 'function') { j.show('pack'); if (j.pack && j.pack.mine) { j.pack.mine.openAt(id); return true; } }
  for (const s of SCREENS) if (s.open && s.mine) { s.mine.openAt(id); return true; }
  return false;
}

// --- the book's pack side -----------------------------------------------------------------------------------------
// MineSide with what is around you as its right pane (a tab each), under the book's header (what is on you, the food
// within reach, the pencil note, the purse) and over its keys. One screen: a page scrolls down only when its grid is
// taller than the page, never sideways.
export class PackSide {
  constructor(el, { onUse = null, closeBook = null } = {}) {
    this.el = el; this.open = false; this.sig = ''; this.t = 0; this.mt = 0; this.onUse = onUse; this.closeBook = closeBook;
    this.held = null; this.fresh = true;
    this.mine = new MineSide({ owner: this, onUse: (e, mode, c) => (this.onUse ? this.onUse(e, mode, c) : null), closeBook, pane: true });
    SCREENS.add(this);
  }
  // opened at your pack (the back's container) and the first thing around you each time; a click turns to the others
  show() { this.open = true; this.fresh = true; this.mine.tab = null; this.mine.rtab = null; listen(); this.render(true); }
  hide() { stopHold(this); this.open = false; this.sig = ''; this.mine.sig = ''; closeMenu(); hideTip(); for (const g of [...GRIDS.values()]) if (this.el.contains(g.el)) g.destroy(); }
  update(dt) {
    if (!this.open) return;
    tickHold(this);
    tickTimers();
    if ((this.t += dt) > 0.4) { this.t = 0; this.render(false); }
  }
  openHere(ref) { if (!openHere(ref)) this.mine.openAt(ref); }
  headWords() {
    const inv = model(), pr = ctx.profile, stash = !!inv.atStash;
    const kgOn = typeof inv.weight === 'function' ? inv.weight() : 0;
    const hungW = !stash && ctx.energy && typeof ctx.energy.hungFood === 'function' ? ctx.energy.hungFood().words : ''; // (the barrel hung at camp, as the HUD says it)
    const food = typeof inv.foodWords === 'function' ? inv.foodWords() : '';
    // at a camp the food words count the camp's reach (inventory.campReach: the barrel in the canoe on the shore)
    const atCamp = !stash && !!(inv.camp && typeof inv.camp.reachArea === 'function' && inv.camp.reachArea());
    return {
      kicker: `The pack · ${stash ? 'at the outfitter’s' : 'on you and within reach'}`,
      h2: kgOn > 0.05 ? `${kgText(kgOn)} on you` : 'Travelling light',
      sub: `${loadWords(kgOn)}${food ? ` · ${food} ${atCamp ? 'about the camp' : 'within reach'}` : ''}${hungW ? ` · ${hungW}` : ''}`,
      money: pr ? `$${pr.money}` : '',
    };
  }
  render(force) {
    if (!this.open) return;
    if (drag) { dirty = true; return; }
    const w = this.headWords(), sig = [w.kicker, w.h2, w.sub, w.money].join('|');
    if (this.fresh) {
      this.fresh = false;
      this.el.innerHTML = `<header class="pk-head">
        <div class="lede"><div class="sc kicker"></div><h2></h2><div class="sub"></div></div>
        <div class="pk-note pencil" aria-live="polite">${esc(noteNow())}</div>
        <div class="purse"${w.money ? '' : ' hidden'}><span class="sc">In hand</span><b></b></div>
      </header>
      <div class="pk-body"></div>
      <footer class="pk-foot"><span>drag between the tabs · off the page sets it down</span><span><kbd>I</kbd> or <kbd>Esc</kbd> closes</span></footer>`;
      this.el.querySelector('.pk-body').appendChild(this.mine.el);
      this.sig = '';
    }
    if (sig !== this.sig) {
      this.sig = sig;
      this.el.querySelector('.kicker').textContent = w.kicker; this.el.querySelector('h2').textContent = w.h2; this.el.querySelector('.lede .sub').textContent = w.sub;
      const purse = this.el.querySelector('.purse'); if (w.money) { purse.hidden = false; purse.querySelector('b').textContent = w.money; } else purse.hidden = true;
    }
    this.mine.render(force);
    tickHold(this, true);
  }
}

// --- a shelf, the lure wall or the map table ------------------------------------------------------------------------
// Witcher 3's two panes: yours on the left (MineSide: the body, your tabs, then the canoe at the dock, Keeping and what
// is on the floor, as the book's right pane has them), the
// shelf on the right, priced. A drag buys exactly where it lands (that slot, or the first room in the tab it is dropped
// on), never another box, and a bought thing is marked: the tag flips to "bought", a quiet chime, a glint on the thing.
// spec: { kind, kicker, title, shelfName, sub, say, who, look ('shelf' | 'pegs' | 'table'), stock() → [{ id, price,
// qty, owned, inUse, hull, words, signature }], buy(id, spot, n) → { ok, words }, money(), onClose }
export class ShelfScreen {
  constructor(el, hud) {
    this.el = el; this.hud = hud; this.open = false; this.spec = null; this.receipt = null; this.sig = ''; this.held = null;
    this.mine = new MineSide({ owner: this, onUse: null, closeBook: () => this.close() });
    this.bought = null; this.glint = null;
    SCREENS.add(this);
    if (hud && hud.registerPaper) hud.registerPaper('shelf', () => this.close());
    el.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-act]'); if (b && b.dataset.act === 'close') this.close(); });
  }
  show(spec) {
    this.spec = spec; this.open = true; this.receipt = null; this.fresh = true; this.bought = null; this.glint = null;
    listen(); hideTip();
    if (this.hud && this.hud.openPaper) this.hud.openPaper('shelf');
    this.render(true);
  }
  close() {
    if (!this.open) return;
    stopHold(this);
    this.open = false; this.el.classList.remove('show'); closeMenu(); hideTip();
    for (const g of [...GRIDS.values()]) if (this.el.contains(g.el)) g.destroy();
    if (this.hud && this.hud.closePaper) this.hud.closePaper('shelf');
    const s = this.spec; if (s && s.onClose) s.onClose();
  }
  closeBook() { this.close(); }
  money() { return this.spec && this.spec.money ? this.spec.money() : 0; }
  buy(id, spot, n = 1) {
    const inv = model(), before = new Set();
    for (const c of inv.containers || []) for (const e of c.grid || []) before.add(e.uid);
    const r = this.spec.buy(id, spot, n) || { ok: false, words: 'Not today.' };
    this.receipt = r;
    if (r.ok) {
      note(r.words, 4);
      // the marks of the purchase: the tag on the shelf, the glint on the thing where it landed (the new entry there,
      // or the stack it joined), the chime
      this.bought = { id, until: now() + 1600 };
      const c = r.cId && typeof inv.cont === 'function' ? inv.cont(r.cId) : null;
      const fresh = c ? (c.grid || []).filter((e) => e.id === id && !before.has(e.uid)) : [];
      const stack = c && !fresh.length ? (c.grid || []).filter((e) => e.id === id && (!spot || (e.x === spot.x && e.y === spot.y))) : [];
      this.glint = { cId: r.cId || null, uids: [...fresh, ...stack].map((e) => e.uid), until: now() + 1600 };
      if (r.cId) this.mine.openAt(r.cId);
      chime();
    }
    refresh();
    this.render(true);
    return r.ok;
  }
  update() { if (!this.open) return; tickHold(this); tickTimers(); this.render(false); }
  render(force) {
    if (!this.open) return;
    if (drag) { dirty = true; return; }
    const inv = model(), all = inv.reachable(ctx.player) || [], money = this.money(), s = this.spec, r = this.receipt;
    const sig = [version, all.map((c) => `${c.id}:${c.where}`).join(), money, r ? r.words : '', this.bought ? this.bought.id : ''].join('|');
    if (this.fresh) {
      this.fresh = false;
      this.el.className = `paper show look-${s.look || 'shelf'}`;
      this.el.innerHTML = `<header>
        <div class="lede"><div class="sc kicker">${esc(s.kicker || '')}</div><h2>${esc(s.title)}</h2>${s.say ? `<div class="say">“${esc(s.say)}”${s.who ? ` <span class="who">— ${esc(s.who)}</span>` : ''}</div>` : ''}</div>
        <div class="purse"><span class="sc">In hand</span><b>$${money}</b></div>
        <button type="button" class="stamp outline" data-act="close" aria-label="Step back from the shelf (E or Esc)">Step back · E</button>
      </header>
      <div class="sh-body">
        <section class="sh-mine pk-mat" aria-label="Yours"><div class="pk-lab">Yours${typeof inv.foodWords === 'function' ? ` · ${esc(inv.foodWords())}` : ''}</div></section>
        <section class="sh-shelf" aria-label="${esc(s.title)}"><div class="sh-top"><h3>${esc(s.shelfName || s.title)}</h3><span class="sum">${esc(s.sub || '')}</span></div><div class="sh-stock"></div>
          <div class="sh-receipt pencil"></div></section>
      </div>
      <footer class="sh-foot"><span>drag it where you want it · double-click buys one</span></footer>`;
      this.el.querySelector('.sh-mine').appendChild(this.mine.el);
      this.sig = '';
    }
    if (force || sig !== this.sig) {
      this.sig = sig;
      this.el.querySelector('header .purse b').textContent = `$${money}`;
      const yl = this.el.querySelector('.sh-mine .pk-lab'); if (yl && typeof inv.foodWords === 'function') yl.textContent = `Yours · ${inv.foodWords()}`; // (fb5 join: the food just bought counts at once, not "no food" until the shelf is reopened)
      const rc = this.el.querySelector('.sh-receipt'); rc.textContent = r ? r.words : s.hint || ''; rc.classList.toggle('no', !!(r && !r.ok)); // (fb5 B: the footer says it once)
      this.stock(money);
    }
    this.mine.render(force);
    this.marks();
  }
  // the stock on shelf boards ten cells wide: the tallest first, each board as high as the tallest thing on it, the
  // things standing on it (a long thin thing lies down)
  stock(money) {
    const s = this.spec, box = this.el.querySelector('.sh-stock'), scroll = box.scrollTop;
    for (const g of [...GRIDS.values()]) if (box.contains(g.el)) g.destroy();
    box.textContent = '';
    const cols = 10, gap = s.look === 'pegs' ? 1 : 0, shelf = { id: `shelf:${s.kind}`, item: null, size: { cols, rows: 1 }, grid: [], boards: [] };
    const items = s.stock().map((it) => { const d = itemDef(it.id), w = d ? d.w || 1 : 1, h = d ? d.h || 1 : 1, rot = w === 1 && h >= 3 ? 1 : 0; return { it, W: rot ? h : w, H: rot ? w : h, rot }; })
      .sort((a, b) => b.H - a.H || b.W - a.W || (b.it.signature ? 1 : 0) - (a.it.signature ? 1 : 0));
    let y = 0, x = 0, band = 0;
    for (const q of items) {
      if (x + q.W > cols) { shelf.boards.push(y + band); y += band + gap; x = 0; band = 0; }
      if (!band) band = q.H;
      const it = q.it;
      shelf.grid.push({ uid: `shelf:${it.id}`, id: it.id, x, y: y + band - q.H, rot: q.rot, w: q.W, h: q.H, qty: it.qty || 1, price: it.price, owned: !!it.owned, inUse: !!it.inUse, hull: !!it.hull, sig: !!it.signature, words: it.words, dear: it.price > money && !it.owned });
      x += q.W + gap;
    }
    if (band) shelf.boards.push(y + band);
    shelf.size.rows = Math.max(y + band, 4);
    const sg = mk('div');
    grid(sg, shelf, { shelf: true, screen: this });
    box.appendChild(sg);
    box.scrollTop = scroll;
  }
  // the purchase's marks while they last: "bought" on the shelf's tag, the glint on the thing in your grid
  marks() {
    const t = now();
    if (this.bought) {
      if (t < this.bought.until) { const el = this.el.querySelector(`.ig-shelf .ig-item[data-id="${CSS.escape(this.bought.id)}"]`); if (el && !el.classList.contains('bought')) { el.classList.add('bought'); const p = el.querySelector('.ig-price'); if (p) { p.dataset.was = p.textContent; p.textContent = 'bought'; } } }
      else { const el = this.el.querySelector('.ig-shelf .ig-item.bought'); if (el) { el.classList.remove('bought'); const p = el.querySelector('.ig-price'); if (p && p.dataset.was) p.textContent = p.dataset.was; } this.bought = null; }
    }
    if (this.glint) {
      if (t < this.glint.until) for (const uid of this.glint.uids) { const el = this.el.querySelector(`.ig-item[data-uid="${CSS.escape(uid)}"]`); if (el && !el.classList.contains('glint')) el.classList.add('glint'); }
      else this.glint = null;
    }
  }
}
// a quiet two-note chime by your ear (audio.js's voice), for a thing bought
function chime() {
  const au = of(ctx.audio), p = ctx.player;
  if (!au || !au.ctx || !au.enabled || typeof au.voice !== 'function') return;
  try {
    const v = au.voice({ x: p ? p.x : 0, y: p ? (p.altitude || 0) + 1.5 : 0, z: p ? p.z : 0, gain: 0.14, ref: 6, wet: 0.08, air: false, pri: 2 });
    if (!v) return;
    const t = v.t;
    for (const [s, f, a, d] of [[0, 1760, 0.6, 0.42], [0.17, 2217, 0.45, 0.55]]) {
      const o = v.osc('sine', f, t + s, t + s + d + 0.05), g = v.gain(0); o.connect(g); g.connect(v.input);
      g.gain.setValueAtTime(0, t + s); g.gain.linearRampToValueAtTime(a, t + s + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + s + d);
    }
    v.until(t + 0.9);
  } catch { /* the chime is a nicety */ }
}

// for the tests and the console
export const dragging = () => !!drag;
export const invUI = { icon, iconAt, iconUrl, grid, itemDef, defineItem, model, attach, refresh, placeCheck, firstFit, CELL, GRIDS, SCREENS, openHere, verbsFor, fireObject, needsHtml, statusOf, timeWords, gameHours, whyHtml, chipHtml, firstMissing, tipHtml, statusHtml, effsHtml, get drag() { return drag; } };
