// The inventory's face (feedback 2026-10-24, stream B): the icons, the Tarkov grid, the book's pack side and the
// store's two-pane shelves.
//
// The model is stream A's (items.js: ITEMS and defineItem; inventory.js: the containers, reachable, fits, put, take,
// move, eat, onChange). Until it is in the build this file runs on a small stand-in with the same calls (StubInventory,
// below), so the screens can be built and tested on their own; every call past the shared contract is feature-tested.
//
//   icon(itemId, size = 48) → <canvas>          an item's picture: drawn once on a 2D canvas per size and cached
//   grid(el, container, { onDrop, onUse })      a container as a Tarkov grid: drag and drop between any grids on the
//                                               page, R rotates while dragging, right-click for Use / Eat / Drop /
//                                               Split / Move, Ctrl-click moves to the next container that has room
//   PackSide                                    the book's inventory side (journal.js shows it): what you carry, what
//                                               is within reach, the canoe's load, the stash at an outfitter
//   ShelfScreen                                 a shelf, the lure wall or the map table: your containers on the left,
//                                               the shelf's stock on the right, priced (outfitter.js opens it)
//   invUI.attach({ inventory, profile, player, energy, hud, shop, outfitter })   (main.js, the fb B block)
import './inv-ui.css';

// --- the model ----------------------------------------------------------------------------------------------------
// Stream A's items, when they are in the build (an eager glob: no import fails without them). items.js must not import
// this file, the shop or the outfitter.
const A_ITEMS = import.meta.glob('./items.js', { eager: true })['./items.js'] || null;
const A_INV = import.meta.glob('./inventory.js', { eager: true })['./inventory.js'] || null;
// what the screens work with: main.js's fb B block (attach), else stream A's singleton, else the stand-in
const ctx = { inventory: null, profile: null, player: null, energy: null, hud: null, shop: null, outfitter: null, stub: null };
export function attach(o) { Object.assign(ctx, o); return ctx; }
export function model() {
  const t = ctx.inventory, v = typeof t === 'function' ? t() : t;
  if (v) return v;
  if (A_INV && A_INV.inventory) return A_INV.inventory;
  if (!ctx.stub) ctx.stub = new StubInventory(ctx);
  return ctx.stub;
}
export const live = () => !model().stub; // stream A's model is in

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
L('aluminium', 'Aluminium canoe, 17 ft', 'long', 5, 1, 34, { short: 'Aluminium', icon: 'canoe', hull: true });
L('royalex', 'Royalex Prospector, 16 ft', 'long', 5, 1, 29, { short: 'Royalex', icon: 'royalex', price: 160, hull: true });
L('kevlar', 'Kevlar tripper, 17 ft', 'long', 5, 1, 20, { short: 'Kevlar', icon: 'kevlar', price: 240, hull: true });

L('stringer', 'Fish stringer', 'container', 1, 2, 0.2, { short: 'Stringer', icon: 'stringer', hand: true, nest: true, container: { cols: 3, rows: 5, accepts: ['fish'] } });
L('crate', 'Kept for you at the outfitters', 'container', 1, 1, 0, { short: 'Crate', icon: 'crate', container: { cols: 10, rows: 8 } });
L('firewood', 'An armful of firewood', 'firewood', 3, 2, 6, { short: 'Firewood', icon: 'firewood' });

// Footprints and pictures for the signature items (outfitters.js families) and anything else the shop brings
const FAMILY = { yoke: [3, 1, 'cedaryoke'], paddle: [1, 5, 'ottertail'], net: [2, 3, 'net'], blanket: [2, 2, 'blanket'], jacket: [2, 1, 'jacket'], sail: [1, 4, 'sail'], cover: [2, 2, 'cover'],
  pole: [1, 5, 'pole'], spoon: [1, 1, 'copperspoon'], tump: [1, 1, 'tump'], leaders: [1, 1, 'leaders'], kneelers: [2, 1, 'kneelers'] };
const LONG_FAMILY = new Set(['paddle', 'pole']);

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
    const def = { id: it.id, name: it.name, short: String(it.sheet || it.id.slice(6)), kind: 'map', w: 2, h: 2, kg: it.kg || 0.1, price: it.price || 8, icon: 'map', words: it.words || '', stub: false };
    return have && A_ITEMS ? A_ITEMS.defineItem(def) : defineItem(def);
  }
  const f = FAMILY[it.family];
  if (f) {
    const long = LONG_FAMILY.has(it.family);
    return defineItem({ id: it.id, name: it.name, short: shortOf(it.name), kind: long ? 'long' : it.lure ? 'lure' : 'gear', w: f[0], h: f[1], kg: it.kg || 0.5, price: it.price || 0, icon: f[2], words: it.words || '', stack: it.lure ? 3 : 1,
      ...(long ? { long: it.family === 'paddle' ? 'paddle' : it.family } : {}), ...(it.slot ? { slot: it.slot } : {}), ...(it.lure ? { lure: it.lure } : {}) });
  }
  return defineItem({ id: it.id, name: it.name, short: shortOf(it.name), kind: it.kind === 'lure' ? 'lure' : 'gear', w: 1, h: 1, kg: it.kg || 0.2, price: it.price || 0, icon: it.id, words: it.words || '' });
}
export const shortOf = (name) => { const s = String(name || '').replace(/^(A|An|The) /, '').replace(/,.*$/, ''); const w = s.split(' '); return w.length > 2 ? w.slice(-2).join(' ') : s; };
// the short name in an item's corner: its own, the stand-in's, else the last words of its name
export const short = (d) => (d ? d.short || (LOCAL[d.id] && LOCAL[d.id].short) || shortOf(d.name) : '');
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
const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);

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
  tablets: [70, 70, drawTablets], pump: [60, 108, drawPump], gravity: [90, 108, drawGravity], saw: [110, 46, drawSaw], camera: [100, 70, drawCamera],
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

// --- the grid -----------------------------------------------------------------------------------------------------
// A container drawn as cells with its items on them at their footprints. Any grid on the page takes a drop from any
// other: a shelf's grid (opts.shelf) only gives (a drop from it is a buy, opts.screen.buy), never takes.
const GRIDS = new Map();    // element → Grid
const SCREENS = new Set();  // the open screens, redrawn when the model changes
let drag = null, dirty = false, menuEl = null, tipEl = null, tipTimer = 0, version = 0, listening = null, pend = false;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
// what an action says (eaten, refused, carried): the HUD's line, and in pencil on an open book or shelf, whose paper
// covers that line (the join, 2026-10-24: "Hold still to eat" was said under the book, unseen)
let lastNote = null;
const note = (words, t = 4) => {
  if (!words) return;
  if (ctx.hud && ctx.hud.note) ctx.hud.note(words, t);
  lastNote = { words, until: performance.now() + t * 1000 };
  for (const sc of SCREENS) if (sc.open && sc.el) { const n = sc.el.querySelector('.pk-note, .sh-receipt'); if (n) { n.textContent = words; n.classList.remove('no'); } }
};
const noteNow = () => (lastNote && performance.now() < lastNote.until ? lastNote.words : '');

function listen() {
  const inv = model(); if (listening === inv) return;
  listening = inv;
  if (typeof inv.onChange === 'function') inv.onChange(() => { version++; soon(); });
}
function soon() {
  if (drag) { dirty = true; return; }
  if (pend) return;
  pend = true;
  setTimeout(() => { pend = false; for (const s of SCREENS) if (s.open) s.render(true); }, 0);
}
export function refresh() { version++; soon(); }

export function grid(el, container, opts = {}) {
  const old = GRIDS.get(el); if (old) old.destroy();
  return new Grid(el, container, opts);
}
class Grid {
  constructor(el, c, opts) {
    this.el = el; this.c = c; this.opts = opts;
    GRIDS.set(el, this);
    el.classList.add('ig'); el.classList.toggle('ig-shelf', !!opts.shelf);
    this.render();
  }
  destroy() { if (GRIDS.get(this.el) === this) GRIDS.delete(this.el); }
  get size() { return gridSize(this.c); }
  render() {
    const { cols, rows } = this.size, el = this.el;
    el.style.width = `${cols * CELL}px`; el.style.height = `${rows * CELL}px`;
    el.dataset.cid = this.c.id;
    el.textContent = '';
    for (const r of this.c.boards || []) { const bd = mk('div', 'ig-board'); bd.style.top = `${r * CELL - 7}px`; el.appendChild(bd); }
    for (const e of this.c.grid || []) el.appendChild(this.itemEl(e));
  }
  itemEl(e) {
    const d = itemDef(e.id), [w, h] = dims(d, e.rot), [uw, uh] = dims(d, 0), shelf = !!this.opts.shelf;
    const it = mk('div', `ig-item k-${d ? d.kind : 'none'}${e.box ? ' box' : ''}${shelf && e.dear ? ' dear' : ''}${shelf && e.owned ? ' owned' : ''}${shelf && e.sig ? ' sig' : ''}`);
    it.style.left = `${e.x * CELL}px`; it.style.top = `${e.y * CELL}px`; it.style.width = `${w * CELL}px`; it.style.height = `${h * CELL}px`;
    it.dataset.uid = e.uid; it.dataset.id = e.id;
    const pic = iconAt(e.id, uw * CELL - 4, uh * CELL - 4); pic.className = `ig-pic${e.rot ? ' rot' : ''}`;
    it.appendChild(pic);
    it.appendChild(mk('span', 'ig-nm', esc(short(d) || e.id)));
    const st = d ? d.stack || 1 : 1;
    if ((e.qty || 1) > 1 || st > 1) it.appendChild(mk('span', 'ig-qty', String(e.qty || 1)));
    if (e.data && Number.isFinite(e.data.length)) it.appendChild(mk('span', 'ig-qty', `${Math.round(e.data.length)} cm`));
    if (d && d.eat && !shelf) it.appendChild(mk('span', `ig-mark ${d.eat.cook ? 'cook' : 'eat'}`, d.eat.cook ? 'cook' : 'eat'));
    if (e.box) it.appendChild(mk('span', 'ig-mark open', 'open'));
    if (shelf) it.appendChild(mk('span', 'ig-price', e.owned ? 'yours' : e.price ? `$${e.price}` : 'free'));
    it.addEventListener('pointerdown', (ev) => press(this, e, it, ev));
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
    if (src.opts.shelf) {
      const k = (itemDef(e.id) || {}).kind;
      if (e.hull || e.owned || k === 'long' || k === 'container' || e.dear) return 'no';
      return placeCheck(this.c, e.id, x, y, rot, null, e.qty || 1) === 'no' ? 'no' : 'buy';
    }
    if (e.box && (this.c.id === e.uid || this.c.in === e.uid)) return 'no';
    const qty = d.qty || e.qty || 1, r = placeCheck(this.c, e.id, x, y, rot, e.uid, qty);
    if (r === 'ok' && live()) { const inv = model(); if (typeof inv.fits === 'function' && !inv.fits(this.c.id, e.id, x, y, rot, e.uid)) return 'no'; }
    return r;
  }
}

// --- dragging -----------------------------------------------------------------------------------------------------
function press(g, e, el, ev) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  closeMenu();
  const r = el.getBoundingClientRect(), ox = ev.clientX - r.left, oy = ev.clientY - r.top;
  const st = { grid: g, e, el, x0: ev.clientX, y0: ev.clientY, gx: Math.min(ox, CELL * Math.floor(ox / CELL) + CELL / 2), gy: Math.min(oy, CELL * Math.floor(oy / CELL) + CELL / 2), rot: e.rot || 0, started: false,
    qty: ev.shiftKey && (e.qty || 1) > 1 ? Math.ceil((e.qty || 1) / 2) : null, ctrl: ev.ctrlKey || ev.metaKey };
  const move = (m) => {
    if (!st.started && Math.hypot(m.clientX - st.x0, m.clientY - st.y0) > 5) begin(st);
    if (st.started) over(st, m.clientX, m.clientY);
  };
  const up = (u) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (st.started) end(st, u.clientX, u.clientY);
    else if (st.ctrl) quick(g, e);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
function begin(st) {
  st.started = true; drag = st; hideTip();
  st.el.classList.add('lifted');
  st.ghost = mk('div', 'ig-ghost');
  document.body.appendChild(st.ghost);
  ghostDraw(st);
  document.body.classList.add('ig-dragging');
}
function ghostDraw(st) {
  const d = itemDef(st.e.id), [w, h] = dims(d, st.rot), [uw, uh] = dims(d, 0);
  st.ghost.style.width = `${w * CELL}px`; st.ghost.style.height = `${h * CELL}px`;
  st.ghost.textContent = '';
  const pic = iconAt(st.e.id, uw * CELL - 4, uh * CELL - 4); pic.className = `ig-pic${st.rot ? ' rot' : ''}`;
  st.ghost.appendChild(pic);
  if (st.qty) st.ghost.appendChild(mk('span', 'ig-qty', String(st.qty)));
}
function over(st, x, y) {
  st.x = x; st.y = y;
  st.ghost.style.left = `${x - st.gx}px`; st.ghost.style.top = `${y - st.gy}px`;
  let tgt = null;
  for (const el of document.elementsFromPoint(x, y)) { const g = el.closest && el.closest('.ig'); if (g && GRIDS.has(g)) { tgt = GRIDS.get(g); break; } }
  if (st.hl && (!tgt || st.hl.parentNode !== tgt.el)) { st.hl.remove(); st.hl = null; }
  st.tgt = tgt; st.res = 'no';
  if (!tgt) return;
  const [cx, cy] = tgt.cellAt(x, y, st.gx, st.gy), d = itemDef(st.e.id), [w, h] = dims(d, st.rot);
  st.cell = [cx, cy];
  st.res = tgt.check(st, cx, cy, st.rot);
  if (!st.hl) { st.hl = mk('div', 'ig-hl'); tgt.el.appendChild(st.hl); }
  const { cols, rows } = tgt.size, x0 = Math.max(0, cx), y0 = Math.max(0, cy), x1 = Math.min(cols, cx + w), y1 = Math.min(rows, cy + h);
  st.hl.className = `ig-hl ${st.res}`;
  st.hl.style.display = x1 > x0 && y1 > y0 ? '' : 'none';
  st.hl.style.left = `${x0 * CELL}px`; st.hl.style.top = `${y0 * CELL}px`; st.hl.style.width = `${(x1 - x0) * CELL}px`; st.hl.style.height = `${(y1 - y0) * CELL}px`;
}
function end(st, x, y) {
  if (x != null) over(st, x, y);
  const { tgt, res, cell } = st;
  cleanup(st);
  drag = null;
  if (tgt && res !== 'no') {
    const [cx, cy] = cell, from = st.grid;
    if (from.opts.shelf) from.opts.screen.buy(st.e.id, { cId: tgt.c.id, x: cx, y: cy, rot: st.rot });
    else if (!(tgt.opts.onDrop && tgt.opts.onDrop({ from: { c: from.c, e: st.e }, to: { c: tgt.c, x: cx, y: cy, rot: st.rot }, qty: st.qty }))) {
      const ok = model().move(from.c.id, st.e.uid, tgt.c.id, cx, cy, st.rot, st.qty || undefined);
      if (!ok) note('It won’t go there.', 2.5);
    }
  }
  dirty = false;
  refresh();
}
function cleanup(st) {
  if (st.ghost) st.ghost.remove();
  if (st.hl) st.hl.remove();
  st.el.classList.remove('lifted');
  document.body.classList.remove('ig-dragging');
}
// R turns what is being dragged, Esc puts it back (both ahead of the game's own R and Esc)
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (ev) => {
    if (!drag) { if (ev.code === 'Escape' && menuEl) { closeMenu(); ev.stopImmediatePropagation(); } return; }
    if (ev.code === 'KeyR') {
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (ev.repeat) return;
      const d = itemDef(drag.e.id); if (!d || d.w === d.h) return;
      drag.rot = drag.rot ? 0 : 1; drag.gx = CELL / 2; drag.gy = CELL / 2;
      ghostDraw(drag); if (drag.x != null) over(drag, drag.x, drag.y);
    } else if (ev.code === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); cleanup(drag); drag = null; if (dirty) { dirty = false; refresh(); } }
  }, true);
}

// --- the actions --------------------------------------------------------------------------------------------------
// the other grids on screen (not the shelf, not this one), in the page's order
const others = (g) => {
  const seen = new Set([g.c && g.c.id]);
  return [...GRIDS.values()].filter((o) => { if (o === g || o.opts.shelf || !o.c || !o.el.isConnected || o.el.offsetParent === null || seen.has(o.c.id)) return false; seen.add(o.c.id); return true; });
};
function moveInto(g, e, to, qty = null) {
  const c = to.c || to, f = firstFit(c, e.id, qty || e.qty || 1);
  if (!f) return false;
  return model().move(g.c.id, e.uid, c.id, f.x, f.y, f.rot, qty || undefined);
}
// Ctrl-click: a shelf's item bought into the first container with room; one of yours to the next one with room
function quick(g, e) {
  if (g.opts.shelf) { g.opts.screen.buy(e.id, null); return; }
  for (const o of others(g)) if (moveInto(g, e, o)) return;
  note('No room for it anywhere else.', 2.5);
}
function primary(g, e) {
  if (g.opts.shelf) { g.opts.screen.buy(e.id, null); return; }
  const d = itemDef(e.id);
  if (e.box) { reveal(e.uid); return; }
  if (d && d.eat) { eat(e); return; }
  if (g.opts.onUse) g.opts.onUse(e, 'use', g.c);
}
function eat(e) {
  const inv = model(); if (typeof inv.eat !== 'function') return;
  const r = inv.eat(e.uid) || {};
  note(r.words || (r.ok ? 'You eat.' : r.why === 'cook' ? 'That wants cooking first.' : r.why === 'moving' ? 'Hold still to eat.' : 'Not now.'), 3.5);
  refresh();
}
function split(g, e) {
  const n = Math.floor((e.qty || 1) / 2); if (n < 1) return;
  const f = firstFit(g.c, e.id, n, { merge: false });
  if (f) { model().move(g.c.id, e.uid, g.c.id, f.x, f.y, f.rot, n); return; }
  for (const o of others(g)) { const h = firstFit(o.c, e.id, n, { merge: false }); if (h) { model().move(g.c.id, e.uid, o.c.id, h.x, h.y, h.rot, n); return; } }
  note('No room to split it.', 2.5);
}
function turn(g, e) {
  const r = e.rot ? 0 : 1;
  if (placeCheck(g.c, e.id, e.x, e.y, r, e.uid) === 'ok') { model().move(g.c.id, e.uid, g.c.id, e.x, e.y, r); return; }
  const f = firstFit({ ...g.c, grid: (g.c.grid || []).filter((q) => q.uid !== e.uid) }, e.id, e.qty || 1, { merge: false });
  if (f && f.rot === r) model().move(g.c.id, e.uid, g.c.id, f.x, f.y, r); else note('No room to turn it.', 2.5);
}
// a nested container's grid, scrolled to and lit for a moment
function reveal(cId) {
  const el = document.querySelector(`.ct[data-cid="${CSS.escape(cId)}"]`);
  if (!el) return;
  if (el.classList.contains('folded')) { el.classList.remove('folded'); FOLDED.set(cId, false); }
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  el.classList.remove('lit'); void el.offsetWidth; el.classList.add('lit');
}
// a world action on a container or a long thing (carry, setDown, load, stow), its words as a note
function world(fn, ...args) {
  const inv = model(); if (typeof inv[fn] !== 'function') return;
  const r = inv[fn](...args);
  if (r && r.words) note(r.words, 3.5); else if (r && r.ok === false) note(r.why === 'canoe' ? 'The canoe is not here.' : 'Not from here.', 3);
  refresh();
}
const WHERE = { back: 'on your back', chest: 'on your chest', hands: 'in your hands', pockets: 'on you', canoe: 'in the canoe', ground: 'on the ground', hung: 'hung in a tree', stash: 'kept by the outfitters', pile: 'on the ground' };
const nameOf = (c) => c.name || (itemDef(c.item) || {}).name || 'A container';
function whereWords(c, byId) {
  if (c.where === 'in') { const p = byId && byId.get(c.in); return p ? `in the ${lower(short(itemDef(p.item)) || nameOf(p))}` : 'inside'; }
  if (c.item === 'crate') return 'what is left with them';
  const p = ctx.player, w = WHERE[c.where] || c.where || '';
  if ((c.where === 'ground' || c.where === 'hung') && c.at && p) { const d = Math.hypot(c.at.x - p.x, c.at.z - p.z); return `${w}${d > 1.2 ? `, ${Math.round(d)} m off` : ''}`; }
  return w;
}
function itemMenu(g, e) {
  const d = itemDef(e.id), out = [], inv = model();
  if (g.opts.shelf) {
    const sc = g.opts.screen, price = e.price || 0, money = sc.money();
    if (e.owned) return [{ label: e.inUse ? 'Yours, in use' : 'Yours already', disabled: true }];
    out.push({ label: `Buy ${e.qty > 1 ? `${e.qty}` : 'one'}${price ? ` · $${price}` : ' · free'}`, disabled: price > money, run: () => sc.buy(e.id, null) });
    if (!e.hull && d && (d.kind === 'meal' || d.kind === 'snack' || d.kind === 'lure')) out.push({ label: `Buy three${price ? ` · $${price * 3}` : ''}`, disabled: price * 3 > money, run: () => sc.buy(e.id, null, 3) });
    return out;
  }
  if (e.box) out.push({ label: 'Open it', run: () => reveal(e.uid) });
  if (d && d.eat) out.push(d.eat.cook ? { label: 'Cook it first: the pot on a fire', disabled: true } : { label: 'Eat it', run: () => eat(e) });
  if (g.opts.onUse) { const u = g.opts.onUse(e, 'label', g.c); if (u) out.push({ label: u, run: () => g.opts.onUse(e, 'use', g.c) }); }
  if ((e.qty || 1) > 1) out.push({ label: `Split off ${Math.floor((e.qty || 1) / 2)}`, run: () => split(g, e) });
  if (d && d.w !== d.h) out.push({ label: 'Turn it', run: () => turn(g, e) });
  for (const o of others(g).filter((k) => k.c.id !== e.uid && firstFit(k.c, e.id, e.qty || 1)).slice(0, 5)) out.push({ label: `Move to the ${lower(short(itemDef(o.c.item)) || nameOf(o.c))}`, run: () => { if (!moveInto(g, e, o)) note('No room in there.', 2.5); } });
  if (typeof inv.drop === 'function' && !e.box) out.push({ label: 'Drop it here', run: () => world('drop', g.c.id, e.uid) });
  return out;
}
// what you can do with a container or a long thing: carry it, set it down, load it, leave it at the outfitter's
function thingMenu(t, isLong) {
  const inv = model(), d = itemDef(isLong ? t.id : t.item), id = isLong ? t.uid : t.id, out = [];
  if (!d || t.where === 'in' || t.where === 'pockets' || (!isLong && /^(crate|pockets|pile)$/.test(t.item))) return out;
  const wear = d.wear || [];
  if (t.where !== 'back' && wear.includes('back')) out.push({ label: 'Carry it on your back', run: () => world('carry', id, 'back') });
  if (t.where !== 'chest' && wear.includes('chest')) out.push({ label: 'Wear it on your chest', run: () => world('carry', id, 'chest') });
  if (t.where !== 'hands' && (isLong || d.hand)) out.push({ label: 'Take it in your hands', run: () => world('carry', id, 'hands') });
  if (t.where !== 'canoe' && typeof inv.load === 'function' && (inv.atStash || typeof inv.nearCanoe !== 'function' || inv.nearCanoe())) out.push({ label: 'Load it into the canoe', run: () => world('load', id) }); // only with the canoe by you
  if (t.where !== 'ground' && t.where !== 'stash' && typeof inv.setDown === 'function') out.push({ label: 'Set it down here', run: () => world('setDown', id) });
  if (t.where !== 'stash' && inv.atStash && typeof inv.stow === 'function') out.push({ label: 'Leave it with the outfitters', run: () => world('stow', id) });
  return out;
}

// --- the menu and the tag -----------------------------------------------------------------------------------------
function openMenu(x, y, items) {
  closeMenu();
  if (!items || !items.length) return;
  const m = menuEl = mk('div', 'ig-menu');
  for (const it of items) {
    const b = mk('button', '', esc(it.label)); b.type = 'button'; b.disabled = !!it.disabled;
    b.addEventListener('click', (ev) => { ev.stopPropagation(); closeMenu(); if (it.run) it.run(); });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`; m.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  setTimeout(() => window.addEventListener('pointerdown', outside, true), 0);
}
function outside(ev) { if (menuEl && !menuEl.contains(ev.target)) closeMenu(); }
export function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } window.removeEventListener('pointerdown', outside, true); }
const KIND_WORDS = { meal: 'A meal · cook it first', snack: 'A snack · eat it standing still', food: 'Food', fish: 'A fish · cook it first', bait: 'Bait · the bucket', lure: 'A lure · the tackle box', tool: 'A tool', gear: 'Camp gear', container: 'A container', long: 'A long thing · carried in the hands', map: 'A map sheet', forage: 'Found in the bush', firewood: 'Firewood' };
function showTip(el, g, e) {
  hideTip();
  const d = itemDef(e.id); if (!d) return;
  const t = tipEl = mk('div', 'ig-tip');
  const kg = (d.kg || 0) * (e.qty || 1), st = d.stack || 1;
  const kind = e.hull ? 'A canoe · it waits at the dock' : e.box ? 'A container · double-click to open' : KIND_WORDS[d.kind] || '';
  let foot = `${kgText(kg)}${st > 1 ? ` · ${e.qty || 1} of ${st} in a stack` : ''}`;
  if (g.opts.shelf) foot = `${e.owned ? 'yours' : e.price ? `$${e.price}` : 'free'}${e.qty > 1 ? ` for ${e.qty}` : ''} · ${foot}`;
  t.innerHTML = `<b>${esc(d.name)}${e.data && e.data.length ? `, ${Math.round(e.data.length)} cm` : ''}</b><span class="k">${esc(kind)}</span>${e.words || d.words ? `<p>${esc(e.words || d.words)}</p>` : ''}<span class="f">${esc(foot)}</span>`;
  document.body.appendChild(t);
  const r = el.getBoundingClientRect(), tr = t.getBoundingClientRect();
  let x = r.right + 8, y = r.top;
  if (x + tr.width > window.innerWidth - 8) x = r.left - tr.width - 8;
  if (y + tr.height > window.innerHeight - 8) y = window.innerHeight - tr.height - 8;
  t.style.left = `${Math.max(8, x)}px`; t.style.top = `${Math.max(8, y)}px`;
}
export function hideTip() { clearTimeout(tipTimer); if (tipEl) { tipEl.remove(); tipEl = null; } }

// --- the blocks the screens are made of ---------------------------------------------------------------------------
// a container: a leather strap with its name, where it is and its weight, over its grid
const FOLDED = new Map(); // container id → folded (a click on its strap); the crate starts folded while empty
function block(c, byId, opts = {}) {
  const folded = FOLDED.has(c.id) ? FOLDED.get(c.id) : c.item === 'crate' && !(c.grid || []).length;
  const w = mk('div', `ct w-${c.where}${c.where === 'in' ? ' nested' : ''}${folded ? ' folded' : ''}`);
  w.dataset.cid = c.id;
  const inv = model(), kg = typeof inv.weight === 'function' && live() ? inv.weight(c.id) : weightOf(c), { cols, rows } = gridSize(c);
  const used = (c.grid || []).reduce((n, e) => { const [a, b] = dims(itemDef(e.id), e.rot); return n + a * b; }, 0);
  const head = mk('div', 'ct-head', `<span class="nm">${esc(nameOf(c))}</span><span class="wh">${esc(whereWords(c, byId))}</span><span class="kg">${kgText(kg)}${used >= cols * rows ? ' · full' : ''}</span>`);
  if (thingMenu(c, false).length) { head.classList.add('acts'); head.title = 'Right-click: carry it, set it down, load it'; head.addEventListener('contextmenu', (ev) => { ev.preventDefault(); openMenu(ev.clientX, ev.clientY, thingMenu(c, false)); }); }
  head.addEventListener('click', () => { const f = !w.classList.contains('folded'); FOLDED.set(c.id, f); w.classList.toggle('folded', f); });
  const g = mk('div');
  grid(g, c, { onUse: opts.onUse });
  w.append(head, g);
  return w;
}
// a long thing (the rod, a paddle) as a 5 × 1 frame with its name and where it is
function longBlock(l) {
  const d = itemDef(l.id), w = mk('div', `lg w-${l.where}${l.inUse ? ' inuse' : ''}`);
  const pic = iconAt(l.id, 4 * CELL, CELL - 8); pic.className = 'lg-pic';
  w.append(pic, mk('span', 'lg-nm', `${esc(d ? d.name : l.id)}<i>${esc(WHERE[l.where] || l.where)}${l.inUse ? ' · in use' : ''}</i>`));
  if (thingMenu(l, true).length) w.addEventListener('contextmenu', (ev) => { ev.preventDefault(); openMenu(ev.clientX, ev.clientY, thingMenu(l, true)); });
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
const GROUP = { back: 'on', chest: 'on', hands: 'on', pockets: 'on', canoe: 'canoe', stash: 'stash', ground: 'near', hung: 'near', pile: 'near' };
const groupOf = (c, byId) => GROUP[topOf(c, byId).where] || 'near';
const RANK = { on: 0, canoe: 1, near: 2, stash: 3 };
const sorted = (list, byId) => list.slice().sort((a, b) => (RANK[groupOf(a, byId)] + (topOf(a, byId).item === 'crate' ? 1 : 0)) - (RANK[groupOf(b, byId)] + (topOf(b, byId).item === 'crate' ? 1 : 0)));

// --- the book's pack side -----------------------------------------------------------------------------------------
// Tarkov's layout on the book's canvas: what you wear and hold on the left (the back, the chest, the hands, the
// pockets, the rod and the paddle), the grids of what you carry in the middle, and what is within reach on the right:
// the canoe's load when you are at it, what lies on the ground or hangs within a few metres, and at an outfitter
// everything you own (the stash). Weight in kg and in words.
export class PackSide {
  constructor(el, { onUse = null } = {}) {
    this.el = el; this.open = false; this.sig = ''; this.t = 0; this.onUse = onUse;
    SCREENS.add(this);
  }
  show() { this.open = true; listen(); this.render(true); }
  hide() { this.open = false; this.sig = ''; closeMenu(); hideTip(); for (const g of [...GRIDS.values()]) if (this.el.contains(g.el)) g.destroy(); }
  update(dt) { if (this.open && (this.t += dt) > 0.4) { this.t = 0; this.render(false); } }
  sigNow() {
    const inv = model(), list = inv.reachable(ctx.player) || [], pr = ctx.profile;
    return [version, list.map((c) => `${c.id}:${c.where}:${(c.grid || []).length}`).join(), (inv.long || []).map((l) => `${l.uid}:${l.where}`).join(), pr ? pr.money : 0, inv.atStash ? 1 : 0].join('|');
  }
  render(force) {
    if (!this.open) return;
    if (drag) { dirty = true; return; }
    const sig = this.sigNow(); if (!force && sig === this.sig) return;
    this.sig = sig;
    const inv = model(), pr = ctx.profile, all = inv.reachable(ctx.player) || [], { list, byId } = ordered(all), stash = !!inv.atStash;
    const scroll = [...this.el.querySelectorAll('.pk-col')].map((n) => n.scrollTop);
    for (const g of [...GRIDS.values()]) if (this.el.contains(g.el)) g.destroy();
    const on = list.filter((c) => groupOf(c, byId) === 'on'), canoe = list.filter((c) => groupOf(c, byId) === 'canoe');
    const near = list.filter((c) => groupOf(c, byId) === 'near'), kept = sorted(list.filter((c) => groupOf(c, byId) === 'stash'), byId);
    const p = ctx.player, atCanoe = stash || canoe.length > 0 || (p && p.mode === 'paddle');
    const longs = (inv.long || []).filter((l) => stash || l.where === 'hands' || (l.where === 'canoe' && atCanoe) || (l.where === 'ground' && l.at && p && Math.hypot(l.at.x - p.x, l.at.z - p.z) < 3));
    const kgOn = typeof inv.weight === 'function' ? inv.weight() : on.reduce((k, c) => k + weightOf(c), 0);
    const food = typeof inv.foodWords === 'function' ? inv.foodWords() : '';
    this.el.innerHTML = `<header class="pk-head">
        <div class="lede"><div class="sc kicker">The pack · ${stash ? 'at the outfitter’s, everything you own' : 'what you carry and what is within reach'}</div><h2>${kgOn > 0.05 ? `${kgText(kgOn)} on you` : 'Travelling light'}</h2><div class="sub">${esc(loadWords(kgOn))}${food ? ` · ${esc(food)} within reach` : ''}</div></div>
        <div class="pk-note pencil" aria-live="polite">${esc(noteNow())}</div>
        ${pr ? `<div class="purse"><span class="sc">In hand</span><b>$${pr.money}</b></div>` : ''}
      </header>
      <div class="pk-body"><section class="pk-col pk-on" aria-label="On you"></section><section class="pk-col pk-carry" aria-label="What you carry"></section><section class="pk-col pk-near" aria-label="Within reach"></section></div>
      <footer class="pk-foot"><span>drag to move · <kbd>R</kbd> turns it while dragging · <kbd>Shift</kbd>-drag splits a stack · right-click for more · <kbd>Ctrl</kbd>-click sends it on</span><span><kbd>Tab</kbd> the journal · <kbd>J</kbd> closes</span></footer>`;
    const [cOn, cCarry, cNear] = this.el.querySelectorAll('.pk-col');
    // on you: the slots, then the pockets and the long things
    const slot = (label, thing, isLong, cls = '') => {
      const s = mk('div', `slot ${cls}${thing ? '' : ' empty'}`), d = thing ? itemDef(isLong ? thing.id : thing.item) : null;
      s.appendChild(mk('div', 'slot-lab', esc(label)));
      const f = mk('div', 'slot-frame');
      if (d) {
        const pic = isLong ? iconAt(thing.id, 4 * CELL - 10, CELL - 8) : cls === 'hand' ? iconAt(thing.item, 2 * CELL, CELL - 8) : iconAt(thing.item, 2 * CELL, 2 * CELL);
        f.append(pic, mk('span', 'slot-nm', esc(short(d))));
        if (thingMenu(thing, isLong).length) f.addEventListener('contextmenu', (ev) => { ev.preventDefault(); openMenu(ev.clientX, ev.clientY, thingMenu(thing, isLong)); });
      } else f.appendChild(mk('span', 'slot-none', '—'));
      s.appendChild(f);
      return s;
    };
    const top = (w) => on.find((c) => c.where === w) || null;
    const hands = [...on.filter((c) => c.where === 'hands').map((c) => [c, false]), ...(inv.long || []).filter((l) => l.where === 'hands').map((l) => [l, true])];
    const slots = mk('div', 'slots');
    slots.append(slot('On your back', top('back'), false, 'big'), slot('On your chest', top('chest'), false, 'big'));
    for (let i = 0; i < 2; i++) slots.appendChild(slot(i ? 'Right hand' : 'Left hand', hands[i] ? hands[i][0] : null, hands[i] ? hands[i][1] : false, hands[i] && hands[i][1] ? 'long' : 'hand'));
    cOn.appendChild(slots);
    for (const c of on.filter((k) => k.where === 'pockets')) cOn.appendChild(block(c, byId, { onUse: this.onUse }));
    const lg = longs.filter((l) => l.where !== 'hands');
    if (lg.length) { cOn.appendChild(mk('div', 'pk-lab', 'Long things')); for (const l of lg) cOn.appendChild(longBlock(l)); }
    // what you carry: the grids of the back, the chest and the hands, and what is nested in them; with nothing on
    // you, the canoe's load takes the middle
    const carried = on.filter((c) => c.where !== 'pockets' && !(c.where === 'in' && topOf(c, byId).where === 'pockets'));
    for (const c of carried) cCarry.appendChild(block(c, byId, { onUse: this.onUse }));
    const sec = (col, title, cs) => { if (!cs.length) return; col.appendChild(mk('div', 'pk-lab', esc(title))); const f = mk('div', 'pk-flow'); for (const c of cs) f.appendChild(block(c, byId, { onUse: this.onUse })); col.appendChild(f); };
    const canoeTitle = stash ? 'The canoe, tied at the dock' : 'In the canoe';
    if (!carried.length) { cCarry.appendChild(mk('p', 'pk-empty', 'Nothing on your back or in your hands. E at a pack on the ground takes it up.')); sec(cCarry, canoeTitle, canoe); }
    else sec(cNear, canoeTitle, canoe);
    // within reach
    sec(cNear, 'Close by', near);
    sec(cNear, 'Kept for you by the outfitters', kept);
    if (!cNear.children.length) cNear.appendChild(mk('p', 'pk-empty', stash ? 'Nothing kept here.' : 'Nothing else within reach. What you leave behind stays where you left it.'));
    [...this.el.querySelectorAll('.pk-col')].forEach((n, i) => { if (scroll[i]) n.scrollTop = scroll[i]; });
  }
}

// --- a shelf, the lure wall or the map table ------------------------------------------------------------------------
// Witcher 3's two panes: your containers on the left (at an outfitter, all of them), the shelf on the right, priced.
// spec: { kind, kicker, title, shelfName, sub, say, who, look ('shelf' | 'pegs' | 'table'), stock() → [{ id, price,
// qty, owned, inUse, hull, words, signature }], buy(id, spot, n) → { ok, words }, money(), onClose }
export class ShelfScreen {
  constructor(el, hud) {
    this.el = el; this.hud = hud; this.open = false; this.spec = null; this.receipt = null; this.sig = '';
    SCREENS.add(this);
    if (hud && hud.registerPaper) hud.registerPaper('shelf', () => this.close());
    el.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-act]'); if (b && b.dataset.act === 'close') this.close(); });
  }
  show(spec) {
    this.spec = spec; this.open = true; this.receipt = null; this.fresh = true;
    listen(); hideTip();
    if (this.hud && this.hud.openPaper) this.hud.openPaper('shelf');
    this.render(true);
  }
  close() {
    if (!this.open) return;
    this.open = false; this.el.classList.remove('show'); closeMenu(); hideTip();
    for (const g of [...GRIDS.values()]) if (this.el.contains(g.el)) g.destroy();
    if (this.hud && this.hud.closePaper) this.hud.closePaper('shelf');
    const s = this.spec; if (s && s.onClose) s.onClose();
  }
  money() { return this.spec && this.spec.money ? this.spec.money() : 0; }
  buy(id, spot, n = 1) {
    const r = this.spec.buy(id, spot, n) || { ok: false, words: 'Not today.' };
    this.receipt = r;
    if (r.ok && r.cId) this.reveal = r.cId; // the container it went into, scrolled to
    if (r.ok) note(r.words, 4);
    refresh();
    this.render(true);
    return r.ok;
  }
  update() { if (this.open) this.render(false); }
  render(force) {
    if (!this.open) return;
    if (drag) { dirty = true; return; }
    const inv = model(), all = inv.reachable(ctx.player) || [], sig = [version, all.map((c) => `${c.id}:${c.where}`).join(), this.money()].join('|');
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const s = this.spec, money = this.money(), o = ordered(all), byId = o.byId, list = sorted(o.list, byId), r = this.receipt;
    const scroll = this.fresh ? [] : [...this.el.querySelectorAll('.sh-mine, .sh-stock')].map((n) => n.scrollTop);
    this.fresh = false;
    for (const g of [...GRIDS.values()]) if (this.el.contains(g.el)) g.destroy();
    this.el.className = `paper show look-${s.look || 'shelf'}`;
    this.el.innerHTML = `<header>
        <div class="lede"><div class="sc kicker">${esc(s.kicker || '')}</div><h2>${esc(s.title)}</h2>${s.say ? `<div class="say">“${esc(s.say)}”${s.who ? ` <span class="who">— ${esc(s.who)}</span>` : ''}</div>` : ''}</div>
        <div class="purse"><span class="sc">In hand</span><b>$${money}</b></div>
        <button type="button" class="stamp outline" data-act="close" aria-label="Step back from the shelf (E or Esc)">Step back · E</button>
      </header>
      <div class="sh-body">
        <section class="sh-mine pk-mat" aria-label="Your containers"><div class="pk-lab">Yours${typeof inv.foodWords === 'function' ? ` · ${esc(inv.foodWords())}` : ''}</div><div class="pk-flow"></div></section>
        <section class="sh-shelf" aria-label="${esc(s.title)}"><div class="sh-top"><h3>${esc(s.shelfName || s.title)}</h3><span class="sum">${esc(s.sub || '')}</span></div><div class="sh-stock"></div>
          <div class="sh-receipt pencil${r && !r.ok ? ' no' : ''}">${esc(r ? r.words : s.hint || 'Drag a thing into one of yours, or double-click it to buy one.')}</div></section>
      </div>
      <footer class="sh-foot"><span>drag onto a slot to buy it there · double-click or <kbd>Ctrl</kbd>-click buys into the first with room · <kbd>R</kbd> turns it while dragging · right-click for more</span></footer>`;
    const mine = this.el.querySelector('.sh-mine .pk-flow'), big = mk('div', 'sh-col'), small = mk('div', 'sh-col'), under = mk('div', 'sh-under');
    mine.append(big, small, under);
    for (const c of list) {
      const top = topOf(c, byId), { cols, rows } = gridSize(top);
      (top.item === 'crate' ? under : cols * rows >= 20 && top.item !== 'stringer' ? big : small).appendChild(block(c, byId));
    }
    const longs = (inv.long || []).filter((l) => l.where !== 'ground');
    if (longs.length) { const f = mk('div', 'pk-longs'); for (const l of longs) f.appendChild(longBlock(l)); small.appendChild(f); }
    if (this.reveal) { const id = this.reveal; this.reveal = null; setTimeout(() => reveal(id), 30); }
    // the stock on shelf boards ten cells wide: the tallest first, each board as high as the tallest thing on it, the
    // things standing on it (a long thin thing lies down)
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
    this.el.querySelector('.sh-stock').appendChild(sg);
    [...this.el.querySelectorAll('.sh-mine, .sh-stock')].forEach((n, i) => { if (scroll[i]) n.scrollTop = scroll[i]; });
  }
}

// for the tests and the console
export const invUI = { icon, iconAt, iconUrl, grid, itemDef, defineItem, model, attach, refresh, placeCheck, firstFit, CELL, GRIDS, get drag() { return drag; } };
