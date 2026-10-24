import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { itemDef } from './items.js';
import { env, grains } from './audio-kit.js';
import { smoothstep, clamp } from './rng.js';
import { word } from './hud.js';

// Cooking and eating at the fire (camp 2, the camp redone; the owner, 2026-10-24: "you make a fire so you can cook so you
// can eat. not just press G. cooking takes a second, it puts a small pot on the grate and you cook for some time, you have
// to wait short time but not instant, then you can eat", and "the toilet actually you should actually sit").
//
// - The pot. fb2 A: from the fire's panel in the book (nearby.js): a raw meal or a fish dragged onto the grate (a fixed
//   container at the ring: items.js 'grate', on the ground at.grate = the site's key) and Cook, at a burning fire,
//   takes it and the cook pot (items.js 'pot', from the grate or out of whatever pack in the camp's reach it is in) onto
//   the grate. (tapAction, the old E at the grate's choice of the best raw thing in reach, is no one's now.) A meal takes
//   water from the bottle (energy.useWater: boiling it makes lake water safe, so treated or not). It cooks for COOK[kind]
//   real seconds while the clock passes its game minutes (only while you are at the camp: walk off and it still cooks),
//   steaming (fire.js's pot steam) and bubbling, a fish sizzling in the pot's lid. It needs the fire burning under it.
//   Done, it chimes, and the cooked thing (items.js hot:* and fried:*) sits in the pot on the grate: the panel's Eat eats
//   it, or the book moves it into a container as leftovers, which keep `keep` game hours and then go off.
// - Eating: Eat walks you round the fire to the bench and you sit, the pot in one hand and the spoon going to your mouth
//   (canoe.js poseSit with move.eat), for EAT_SECONDS, ten minutes on the clock; then the food need (energy.eatItem) and
//   the pot goes back in a pack. A hot meal eaten from the book near your bench sits you down the same way.
// - Sitting: sitAt(spot) walks the walker to a spot in front of a seat (round whatever is between, along an arc about
//   it), turns him and sits him down onto it: the figure's rig is moved onto the seat (beforePose) and poseSit is given
//   the seat's height (move()). The latrine (chores.js) and the bench use it. main.js (camp 2) wraps canoe.moveOf and
//   canoe.update to call move(), beforePose() and afterPose() (the spoon and the pot in the hands).
// Saved through chores.js (trip.state.chores.cook).

export const COOK = { // real seconds on the grate and game minutes on the clock; litres of water from the bottle
  'meal:supper': { seconds: 8, minutes: 25, water: 0.4, say: 'on the grate' },
  'meal:breakfast': { seconds: 6.5, minutes: 20, water: 0.3, say: 'on the grate' },
  'meal:freeze': { seconds: 6, minutes: 20, water: 0.5, say: 'the water on to boil' },
  fish: { seconds: 7, minutes: 20, water: 0, say: 'cleaned and into the lid to fry' },
};
const EAT_SECONDS = 4.6, EAT_MINUTES = 10, SET_SECONDS = 1.0;
const NEAR_CAMP = 30;          // m from the fire within which the cook's minutes pass on the clock
const HEAT_MIN = 0.12;         // the fire's heat (fire.js) under which the pot stops cooking
const BENCH_REACH = 9;         // m from a site's bench within which a hot meal eaten from the book is eaten sitting
const WALK = 1.6;              // m/s, walked to a seat
const RIG = new THREE.Vector3();

// --- the looks --------------------------------------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);
function shade(g, f) {
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), O = g.getAttribute('aOcc');
  for (let i = 0; i < O.count; i++) O.setX(i, f(P.getX(i), P.getY(i), P.getZ(i), N.getY(i)));
  O.needsUpdate = true;
  return g;
}
const R_POT = 0.085, H_POT = 0.1;
// the cook pot: blackened aluminium, the lid on with its knob, the wire bail folded to one side (y 0 the bottom)
function potGeometry({ lid = true, food = null } = {}) {
  const b = new PropBuilder(), metal = C(0x8f8b84), soot = C(0x3d3a36), wire = C(0xa4a6a8);
  b.cyl(V(0, 0, 0), V(0, H_POT * 0.35, 0), R_POT * 0.97, R_POT, 12, TILE.PLAIN, soot, { cap0: true });
  b.cyl(V(0, H_POT * 0.35, 0), V(0, H_POT, 0), R_POT, R_POT * 1.01, 12, TILE.PLAIN, metal);
  b.cyl(V(0, H_POT - 0.006, 0), V(0, H_POT + 0.003, 0), R_POT * 1.04, R_POT * 1.04, 12, TILE.PLAIN, metal, { cap1: !lid && !food });
  if (lid) {
    b.cyl(V(0, H_POT + 0.003, 0), V(0, H_POT + 0.012, 0), R_POT * 1.03, R_POT * 0.8, 12, TILE.PLAIN, metal, { cap1: true });
    b.cyl(V(0, H_POT + 0.012, 0), V(0, H_POT + 0.026, 0), 0.012, 0.01, 6, TILE.PLAIN, soot, { cap1: true });
  } else if (food) b.cyl(V(0, H_POT * 0.62, 0), V(0, H_POT * 0.7, 0), R_POT * 0.96, R_POT * 0.95, 12, TILE.PLAIN, C(food), { cap1: true });
  const bail = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; bail.push(V(-Math.sin(a) * 0.03 - 0.002, H_POT * 0.82 + Math.sin(a) * 0.025, -Math.cos(a) * R_POT * 1.06)); }
  b.tube(bail.map((p) => p.applyAxisAngle(V(0, 0, 1), -1.15).add(V(-R_POT * 0.15, 0.02, 0))), 0.0022, 4, TILE.PLAIN, wire);
  return shade(b.build(), (x, y, z, ny) => (0.55 + 0.45 * Math.min(1, y / H_POT)) * (ny < -0.4 ? 0.5 : 1));
}
// the pot's lid turned over as a pan, its folding handle out, a fish frying in it (raw pale; fried golden)
function panGeometry(fried) {
  const b = new PropBuilder(), metal = C(0x7a766f), wire = C(0xa4a6a8);
  b.cyl(V(0, 0, 0), V(0, 0.018, 0), R_POT * 0.86, R_POT * 1.04, 12, TILE.PLAIN, metal, { cap0: true });
  b.cyl(V(0, 0.004, 0), V(0, 0.005, 0), R_POT * 0.95, R_POT * 0.95, 12, TILE.PLAIN, C(0x3e3a36), { cap1: true });
  b.tube([V(R_POT, 0.016, 0), V(R_POT + 0.06, 0.03, 0), V(R_POT + 0.12, 0.034, 0)], 0.004, 4, TILE.PLAIN, wire, { cap1: true });
  // two fillets, flat: built round, then pressed to a third of their height in the lid
  const f = new PropBuilder(), meat = C(fried ? 0xb9773a : 0xe2c3b0), edge = C(fried ? 0x7a4a22 : 0xb3b7a2);
  for (const [z, l] of [[-0.028, 0.078], [0.03, 0.072]]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(V(-l + 2 * l * t, 0, z + Math.sin(t * Math.PI * 2) * 0.004)); }
    f.tube(pts, (t) => 0.004 + 0.021 * Math.sin(Math.max(0.12, Math.min(0.94, t)) * Math.PI) ** 0.7, 7, TILE.PLAIN, (p) => (p.y > 0.008 ? meat : edge), { cap0: true, cap1: true });
  }
  const fish = f.build();
  fish.scale(1, 0.38, 1); fish.translate(0, 0.016, 0);
  b.addBuilt(fish);
  return shade(b.build(), (x, y, z, ny) => (ny < -0.4 ? 0.55 : 0.95));
}
// a camp spoon, a little bigger than life so it reads: the handle along +x, the bowl at its end
function spoonGeometry() {
  const b = new PropBuilder(), steel = C(0xd0d4d8);
  b.box(V(0.06, 0, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.06, 0.003, 0.007, TILE.PLAIN, steel, { grain: 'x' });
  b.cyl(V(0.12, 0, 0), V(0.165, 0, 0), 0.014, 0.012, 7, TILE.PLAIN, steel, { cap0: true, cap1: true });
  return b.build();
}

// --- the sounds (Web Audio, as audio-voices.js: built per sound on the engine's kit) -----------------------------------
// the pot bubbling: a few round blips under a low simmer
function bubble(au, pos, amt = 1) {
  const v = au.voice({ ...pos, gain: 0.16 * amt, ref: 3, wet: 0.05, air: false });
  if (!v) return null;
  const R = au.rand, t = v.t;
  for (let i = 0; i < 3 + Math.floor(R() * 3); i++) {
    const s = t + R() * 0.45, f = 260 + R() * 420, o = v.osc('sine', f, s, s + 0.09), g = v.gain(0);
    o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * 1.9, s + 0.05);
    o.connect(g); g.connect(v.input); env(g.gain, s, 0.004, 0.5 + R() * 0.4, 0, 0.05);
  }
  const lp = v.filter('lowpass', 420, 0.7), g2 = v.gain(0); v.noise('brown', lp); lp.connect(g2); g2.connect(v.input);
  env(g2.gain, t, 0.08, 0.35, 0.25, 0.2);
  return v.until(t + 0.6);
}
// a fish in the pan: a sizzle of fat spitting
function sizzle(au, pos, amt = 1) {
  const v = au.voice({ ...pos, gain: 0.12 * amt, ref: 3, wet: 0.04, air: false });
  if (!v) return null;
  const R = au.rand, t = v.t, hp = v.filter('bandpass', 5200 + R() * 1500, 0.8), g = v.gain(0);
  v.noise('white', hp); hp.connect(g); g.connect(v.input);
  env(g.gain, t, 0.05, 0.45, 0.35, 0.2);
  const bp = v.filter('highpass', 2500, 0.7), gc = v.gain(0); v.noise('white', bp); bp.connect(gc); gc.connect(v.input);
  grains(gc.gain, t, 9, 0.55, 1, 0.012, R);
  return v.until(t + 0.7);
}
// done: two taps of the spoon on the pot's rim, a metal tink
function chime(au, pos) {
  const v = au.voice({ ...pos, gain: 0.22, ref: 6, wet: 0.18, air: false, pri: 2 });
  if (!v) return null;
  const t = v.t;
  for (const [s, k] of [[0, 1], [0.19, 1.06]]) {
    for (const [f, a, d] of [[1620, 0.7, 0.55], [2710, 0.45, 0.35], [4120, 0.2, 0.18]]) { const o = v.osc('sine', f * k, t + s, t + s + d + 0.05), g = v.gain(0); o.connect(g); g.connect(v.input); env(g.gain, t + s, 0.002, a, 0, d); }
  }
  return v.until(t + 0.9);
}
// water on a fire: a hiss that swells and dies, the coals spitting, a soft whump as it hits
export function hiss(au, pos, amt = 1) {
  const v = au.voice({ ...pos, gain: 0.3 * amt, ref: 5, wet: 0.12, air: false, pri: 2 });
  if (!v) return null;
  const R = au.rand, t = v.t, dur = 1.6 + R() * 0.6;
  const hp = v.filter('highpass', 2400, 0.6), g = v.gain(0); v.noise('white', hp); hp.connect(g); g.connect(v.input);
  env(g.gain, t, 0.12, 0.8, dur * 0.5, dur * 0.5);
  hp.frequency.setValueAtTime(1800, t); hp.frequency.linearRampToValueAtTime(3600, t + dur);
  const bp = v.filter('bandpass', 1400, 1.2), gc = v.gain(0); v.noise('white', bp); bp.connect(gc); gc.connect(v.input);
  grains(gc.gain, t + 0.05, 14, dur * 0.8, 0.9, 0.02, R);
  const lp = v.filter('lowpass', 240, 0.8), gl = v.gain(0); v.noise('brown', lp); lp.connect(gl); gl.connect(v.input);
  env(gl.gain, t, 0.03, 0.9, 0.05, 0.4);
  return v.until(t + dur + 0.2);
}
// wood picked up or set down: a dry knock or two
export function woodKnock(au, pos, log = false) {
  const v = au.voice({ ...pos, gain: 0.14, ref: 5, wet: 0.08, air: false });
  if (!v) return null;
  const R = au.rand, t = v.t;
  for (let i = 0; i < (log ? 1 : 2); i++) {
    const s = t + i * (0.05 + R() * 0.05), k = (log ? 0.62 : 1) * (0.9 + R() * 0.25);
    for (const [f, a, d] of [[230, 0.8, 0.12], [610, 0.45, 0.06], [1450, 0.2, 0.03]]) { const o = v.osc('sine', f * k, s, s + d + 0.04), g = v.gain(0); o.connect(g); g.connect(v.input); env(g.gain, s, 0.001, a, 0, d); }
    const bp = v.filter('bandpass', 1900, 2), gc = v.gain(0); v.noise('white', bp); bp.connect(gc); gc.connect(v.input); env(gc.gain, s, 0.001, 0.5, 0, 0.018);
  }
  return v.until(t + 0.3);
}

// --- the cook --------------------------------------------------------------------------------------------------------
export class Cook {
  // chores: chores.js's Chores (the camp, the inventory, the fires, the notes and the save come through it)
  constructor(chores) {
    this.ch = chores;
    this.pot = null;       // on the grate: { key, raw, out, data, t, dur, hours, at0, fish, done, cold }
    this.seat = null;      // sitting (or walking to sit): { stand, seat, heading, path, phase, t, k, eat, until }
    this.eating = null;    // { def, t, apply, key }
    this.gesture = null;   // a moment on the heels (setting the pot on): { t, say }
    this.hot = null;       // the pot just off the boil: { key, t } (its steam thins over a little while)
    this.soundT = 0; this.spoilT = 0;
    this.mat = propMaterial();
    const mk = (g) => { const m = new THREE.Mesh(g, this.mat); m.castShadow = true; m.receiveShadow = true; m.visible = false; m.matrixAutoUpdate = true; this.ch.camp.scene.add(m); return m; };
    this.potLid = mk(potGeometry({ lid: true }));
    this.potOpen = mk(potGeometry({ lid: false, food: 0xb9925a }));
    this.panRaw = mk(panGeometry(false));
    this.panFried = mk(panGeometry(true));
    this.spoon = mk(spoonGeometry()); this.spoon.castShadow = false;
    this.handPot = mk(potGeometry({ lid: false, food: 0xb9925a })); // the pot in the hand while eating (the lid off)
    const e = this.energy;
    if (e) e.onEat = (eat, name) => this.onEat(eat, name); // a hot meal eaten from the book, near the bench, sits you down
  }
  get camp() { return this.ch.camp; }
  get player() { return this.ch.camp.player; }
  get energy() { return this.ch.camp.energy; }
  get fires() { return this.ch.camp.fires; }
  get inv() { return this.ch.inv; }
  get audio() { return this.ch.camp.audio; }
  get now() { return this.ch.camp.now; }
  get busy() { return !!(this.seat || this.eating || this.gesture); }
  note(t, s = 5) { this.ch.note(t, s); }
  sound(fn, at, ...a) { const au = this.audio; if (!au || !au.ctx || !au.enabled) return; try { fn(au, at, ...a); } catch { /* the sound is a nicety */ } }
  // the clock moved on a little (as camp.pass and hold.js do: over midnight by setClock)
  pass(h) {
    const d = this.ch.camp.day;
    if (!(h > 0)) return;
    if (d.hours + h < 24) d.hours += h; else d.setClock(d.year, d.doy + 1, d.hours + h - 24);
  }

  // --- where things are at a site ---------------------------------------------------------------------------------
  // the top of the grate's bars over a site's ring, and the spot the pot stands on (a little off the middle, so the
  // flames show by it): { x, y, z, a }
  grateSpot(site) {
    const f = site.layout.fire, ga = f.a || 0, gx = -Math.sin(ga), gz = Math.cos(ga), u = 0.15;
    return { x: f.x + gx * u, y: f.y + 0.322, z: f.z + gz * u, a: ga };
  }
  // the bench: the seat over the split log's middle, a little to one side, facing the fire; the spot to stand in front
  benchSpot(site) {
    const L = site.layout, B = L.bench, f = L.fire, t = this.ch.camp.tiles;
    let dx = f.x - B.x, dz = f.z - B.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const along = 0.32, sx = B.x + B.ax * along, sz = B.z + B.az * along;
    const g = Math.max(t.groundAt(B.x + B.ax * 0.72, B.z + B.az * 0.72), t.groundAt(B.x - B.ax * 0.72, B.z - B.az * 0.72));
    return { kind: 'bench', seat: { x: sx, y: g + 0.43, z: sz }, stand: { x: sx + dx * 0.66, z: sz + dz * 0.66 }, heading: Math.atan2(-dz, dx), round: { x: f.x, z: f.z, r: 1.55 } };
  }
  // the latrine box (props.js latrine: a 0.6 m box, its lid at 0.47 m, set at the bearing from the ring); you sit facing
  // out of its front, away from the hinge
  latrineSpot(site) {
    const L = site.layout, B = L.latrine, f = L.fire, t = this.ch.camp.tiles;
    const la = Math.atan2(B.z - f.z, B.x - f.x), b = la + 0.4, fx = Math.sin(b), fz = -Math.cos(b);
    const g = t.groundAt(B.x, B.z);
    return { kind: 'latrine', seat: { x: B.x, y: g + 0.47, z: B.z }, stand: { x: B.x + fx * 0.86, z: B.z + fz * 0.86 }, heading: Math.atan2(-fz, fx), round: { x: B.x, z: B.z, r: 0.86 } };
  }

  // --- the grate --------------------------------------------------------------------------------------------------
  grate(key) { return this.ch.grate(key, null); }
  onGrate(key) {
    const g = this.grate(key);
    if (!g) return { pot: null, food: null, g: null };
    const pot = g.grid.find((e) => e.id === 'pot') || null, food = g.grid.find((e) => { const d = itemDef(e.id); return d && d.kind === 'food' && d.cooked; }) || null;
    return { pot, food, g };
  }
  // the raw things in the camp's reach that want cooking: [{ c, e, def }], the best first (a fish, the biggest, at any
  // hour; else the meal of the hour)
  rawToCook() {
    const pool = this.ch.campPool(), out = [];
    for (const c of pool) for (const e of c.grid) { if (e.box) continue; const d = itemDef(e.id); if (d && d.eat && d.eat.cook && (d.kind === 'meal' || d.kind === 'fish')) out.push({ c, e, def: d }); }
    const h = this.ch.camp.day.hours, evening = h >= 14 || h < 3;
    const rank = (x) => (x.def.kind === 'fish' ? -100 - (x.e.data && x.e.data.length ? x.e.data.length : 30) / 100 : ({ 'meal:supper': evening ? 0 : 2, 'meal:freeze': evening ? 1 : 3, 'meal:breakfast': evening ? 2 : 0 }[x.def.id] ?? 5));
    out.sort((a, b) => rank(a) - rank(b));
    return out;
  }
  // the cook pot, on the grate already or in the camp's reach: { c, e } or null
  potHere(key) {
    const og = this.onGrate(key);
    if (og.pot) return { c: og.g, e: og.pot, on: true };
    for (const c of this.ch.campPool()) { if (c.item === 'grate') continue; const e = c.grid.find((q) => q.id === 'pot'); if (e) return { c, e, on: false }; }
    return null;
  }
  // what the cooked thing out of `def` is
  cookedOf(def) {
    if (def.kind === 'fish') { const sp = def.species || String(def.id).replace(/^fish:/, ''); return itemDef(`fried:${sp}`) ? `fried:${sp}` : 'fried:fish'; }
    return { 'meal:supper': 'hot:supper', 'meal:breakfast': 'hot:breakfast', 'meal:freeze': 'hot:freeze' }[def.id] || 'hot:supper';
  }
  nameOf(def, data = null) {
    if (def.kind === 'fish') return `${data && data.length ? `${Math.round(data.length)} cm ` : ''}${def.name.toLowerCase().replace(/^northern /, '')}`;
    return { 'meal:supper': 'rice and lentils', 'meal:breakfast': 'oatmeal', 'meal:freeze': 'freeze-dried supper' }[def.id] || def.name.toLowerCase();
  }

  // The tap at a burning fire (chores.js firePrompts asks): what E does here now, { label, hint, run } or a line to say
  // ({ say }), or null. Eat what is cooked; while it cooks, how long; put a cold pot away; cook the best raw thing.
  tapAction(site, key, burning = true) {
    const og = this.onGrate(key), P = this.pot && this.pot.key === key ? this.pot : null;
    if (og.food) { const d = itemDef(og.food.id); return { label: `Eat the ${eatName(d)}`, hint: 'on the bench by the fire', run: () => this.eatAt(site, key) }; }
    if (P && !P.done) {
      const left = Math.max(1, Math.ceil(P.dur - P.t)), heat = this.fires.heat(this.fires.get(key));
      return { say: `The ${P.fish ? 'fish is frying' : `${this.nameOf(itemDef(P.raw))} ${P.raw === 'meal:freeze' ? 'is soaking' : isAre(this.nameOf(itemDef(P.raw))) + ' cooking'}`} on the grate · ${heat < HEAT_MIN ? 'the fire is too low under it' : `ready in ${left} s`}` };
    }
    const raw = burning ? this.rawToCook()[0] : null;
    if (raw) {
      const pot = this.potHere(key), K = COOK[raw.def.kind === 'fish' ? 'fish' : raw.def.id] || COOK['meal:supper'];
      const label = raw.def.kind === 'fish' ? `Fry the ${this.nameOf(raw.def, raw.e.data)}` : `Cook the ${this.nameOf(raw.def)}`;
      if (!pot) return { say: `${label} · the cook pot is not to hand: it is in a pack` };
      const e0 = this.energy, short = K.water > 0 && e0 && e0.useWater && !e0.sandbox && e0.bottle < K.water - 0.001;
      if (short) return { say: `The ${this.nameOf(raw.def)} ${isAre(this.nameOf(raw.def)) === 'are' ? 'want' : 'wants'} ${mL(K.water)} of water · the bottle has ${e0.bottle > 0.04 ? mL(e0.bottle) : 'none'}: fill it at the shore` };
      return { label, hint: raw.def.kind === 'fish' ? 'cleaned, in the pot lid' : `the pot on the grate, ${mL(K.water)} of water`, run: () => this.start(site, key, raw) };
    }
    if (og.pot) return { label: 'Put the pot away', hint: 'scrubbed out with sand', run: () => this.putAway(key, true) };
    return null;
  }

  // --- cooking ------------------------------------------------------------------------------------------------------
  // put `raw` ({ c, e, def }) on the grate of `site` (key): the pot onto the grate, the water from the bottle
  start(site, key, raw) {
    const F = this.fires, inv = this.inv, e0 = this.energy, def = raw.def, fish = def.kind === 'fish';
    if (!F.isLit(key)) { this.note('The fire has to be burning to cook on.'); return false; }
    if (this.pot && !this.pot.done && this.pot.key === key) { this.note('Something is on the grate already.'); return false; }
    const og = this.onGrate(key);
    if (og.food) { this.note(`The ${eatName(itemDef(og.food.id))} is still in the pot: eat it, or keep it in a pack.`); return false; }
    const K = COOK[fish ? 'fish' : def.id] || COOK['meal:supper'];
    if (K.water > 0 && e0 && e0.useWater && !e0.sandbox) {
      if (e0.bottle < K.water - 0.001) { this.note(`The ${this.nameOf(def)} wants ${mL(K.water)} of water and the bottle has ${e0.bottle > 0.04 ? mL(e0.bottle) : 'none'}: fill it at the shore.`, 5); return false; }
    }
    const pot = this.potHere(key);
    if (!pot) { this.note('The cook pot is not to hand: it is in one of the packs.'); return false; }
    // the pot onto the grate (it is a thing: out of its pack, into the grate's container), the raw thing out of its
    const g = this.ch.grate(key, site);
    if (!pot.on) {
      const taken = inv.take(pot.c.id, pot.e.uid, 1);
      if (!taken || !inv.put(g, 'pot', { quiet: true })) { if (taken) inv.put(pot.c, 'pot', { quiet: true }); this.note('No room on the grate.'); return false; }
      this.potFrom = pot.c.id;
    }
    const got = inv.take(raw.c.id, raw.e.uid, 1);
    if (!got) return false;
    if (K.water > 0 && e0 && e0.useWater && !e0.sandbox) e0.useWater(K.water);
    this.pot = { key, raw: def.id, out: this.cookedOf(def), data: got.data ? { ...got.data } : null, t: 0, dur: K.seconds, hours: K.minutes / 60, at0: this.now, fish, done: false, cold: false };
    this.hot = null;
    this.gesture = { t: 0, dur: SET_SECONDS, say: fish ? `Cleaning the ${this.nameOf(def, got.data)}…` : 'Setting the pot on the grate…' };
    inv.emit('items');
    const mins = `${word(Math.round(K.minutes / 5) * 5 === 25 ? 25 : K.minutes)} minutes`;
    this.note(fish ? `You clean the ${this.nameOf(def, got.data)} at the water's edge and lay it in the pot lid over the coals. About ${mins}.` : `The ${this.nameOf(def)} ${isAre(this.nameOf(def)) === 'are' ? 'go' : 'goes'} in the pot with ${K.water < 0.45 ? `${K.water * 1000 | 0} mL` : 'half a litre'} of water from the bottle, ${K.say}. About ${mins}.`, 6);
    this.ch.persist();
    if (this.ch.camp.log) this.ch.camp.log('cook', { what: def.id, key });
    return true;
  }
  // done: the cooked thing in the pot on the grate, a chime
  finish() {
    const P = this.pot, inv = this.inv, site = this.ch.camp.registry.site(P.key);
    const g = this.ch.grate(P.key, site), def = itemDef(P.out), now = this.now;
    const data = { cooked: +now.toFixed(3), until: +(now + (def.keep || 4)).toFixed(3), ...(P.data && P.data.length ? { length: P.data.length } : {}) };
    if (!g || !inv.put(g, P.out, { data, quiet: true })) inv.place(P.out, 1, { data, pool: this.ch.campPool(), quiet: true });
    P.done = true;
    this.hot = { key: P.key, t: 0 };
    if (site) this.sound(chime, this.grateSpot(site));
    this.note(P.fish ? `The ${this.nameOf(itemDef(P.raw), P.data)} is fried golden, on the grate. Eat it there, or keep it in a pack (it keeps a few hours).` : `The ${this.nameOf(itemDef(P.raw))} ${isAre(this.nameOf(itemDef(P.raw)))} ready, on the grate. Eat it there, or keep it in a pack for later (it keeps a few hours).`, 7);
    this.pot = null;
    inv.emit('items');
    this.ch.persist();
  }
  // the pot off the grate and back in a pack in the camp's reach (or left where it is when nothing has room)
  putAway(key, say = false) {
    const og = this.onGrate(key), inv = this.inv;
    if (!og.pot) return false;
    const pool = this.ch.campPool().filter((c) => c.item !== 'grate' && c.item !== 'woodarms');
    const back = this.potFrom ? pool.find((c) => c.id === this.potFrom) : null;
    const r = back && inv.put(back, 'pot', { quiet: true }) ? { ok: true } : inv.place('pot', 1, { pool, quiet: true });
    if (!r.ok) { if (say) this.note('No room for the pot in anything to hand.'); return false; }
    inv.take(og.g.id, og.pot.uid, 1);
    this.ch.dropEmptyGrate(key);
    this.potFrom = null;
    if (say) this.note('You scrub the pot out with a handful of sand and put it away.', 4);
    inv.emit('items');
    this.ch.persist();
    return true;
  }

  // --- eating -------------------------------------------------------------------------------------------------------
  // E at the fire with a meal in the pot: round to the bench, sit, eat out of the pot
  eatAt(site, key) {
    const og = this.onGrate(key);
    if (!og.food || this.busy) return false;
    const def = itemDef(og.food.id), got = this.inv.take(og.g.id, og.food.uid, 1);
    if (!got) return false;
    const spot = this.benchSpot(site);
    this.eating = { def, data: got.data || null, t: 0, apply: true, key, site, phase: 0 };
    this.sitAt(spot);
    this.inv.emit('items');
    this.ch.persist();
    return true;
  }
  // a hot meal eaten from the book (energy.eatItem): near a site's bench, you sit down to it (it is already eaten)
  onEat(eat, name) {
    if (this.eatingNow || !eat || !eat.hot || this.busy) return;
    const p = this.player;
    if (p.mode !== 'walk') return;
    const site = this.ch.camp.nearestSite(p.x, p.z, BENCH_REACH + 3, true);
    if (!site || !site.layout || !site.layout.bench) return;
    const spot = this.benchSpot(site);
    if (Math.hypot(spot.stand.x - p.x, spot.stand.z - p.z) > BENCH_REACH) return;
    this.eating = { def: { name, eat }, t: 0, apply: false, key: null, site, phase: 0 };
    this.sitAt(spot);
  }
  // seated: eat for EAT_SECONDS (the spoon to the mouth), then the food need and the pot back in the pack
  updateEating(dt) {
    const E = this.eating, S = this.seat;
    if (!S || S.phase !== 'seated') return;
    E.t += dt;
    E.phase += dt / 1.15;
    this.pass((EAT_MINUTES / 60) * (dt / EAT_SECONDS));
    if (E.t < EAT_SECONDS) return;
    if (E.apply) {
      const e = this.energy;
      this.eatingNow = true;
      try { if (e && e.eatItem) e.eatItem(E.def.eat || {}, E.def.name); } finally { this.eatingNow = false; }
      const d = this.ch.camp.day, h = d.hours, what = eatName(E.def);
      const line = h >= 17 || h < 3 ? 'the loons starting up out on the lake' : h < 10 ? 'the mist lifting off the bay' : 'the jays watching from the spruce';
      this.note(`${cap(what)} out of the pot on the bench by the fire, ${line}.`, 6);
      if (E.key) this.putAway(E.key, false);
      if (this.ch.camp.log) this.ch.camp.log('meal', { what: E.def.id || E.def.name, at: 'fire' });
    }
    this.eating = null;
    this.standUp();
  }

  // --- sitting ------------------------------------------------------------------------------------------------------
  // walk to spot.stand (round spot.round's middle along an arc), turn to spot.heading, and sit on spot.seat
  sitAt(spot, { until = null } = {}) {
    const p = this.player, R = spot.round, path = [];
    if (R) {
      // round the fire (or the box) along an arc from where you stand to the stand spot, never nearer its middle than r
      const a0 = Math.atan2(p.z - R.z, p.x - R.x), a1 = Math.atan2(spot.stand.z - R.z, spot.stand.x - R.x);
      const r0 = Math.max(R.r, Math.hypot(p.x - R.x, p.z - R.z)), r1 = Math.hypot(spot.stand.x - R.x, spot.stand.z - R.z);
      let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
      const n = Math.max(1, Math.ceil(Math.abs(da) / 0.35));
      for (let i = 1; i <= n; i++) { const k = i / n, a = a0 + da * k, r = Math.max(R.r, r0 + (r1 - r0) * k); path.push({ x: R.x + Math.cos(a) * r, z: R.z + Math.sin(a) * r }); }
    }
    path.push({ x: spot.stand.x, z: spot.stand.z });
    this.seat = { ...spot, path, phase: 'walk', t: 0, k: 0, until };
  }
  standUp() { const S = this.seat; if (S && S.phase !== 'up') { S.phase = 'up'; S.t = 0; } }
  updateSeat(dt) {
    const S = this.seat, p = this.player;
    if (!S) return;
    if (p.mode !== 'walk' || p.teleporting) { this.seat = null; this.eating = null; return; }
    S.t += dt;
    if (S.phase === 'walk') {
      let step = WALK * dt;
      while (step > 0 && S.path.length) {
        const q = S.path[0], dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
        if (d <= step) { p.x = q.x; p.z = q.z; S.path.shift(); step -= d; continue; }
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        p.heading = Math.atan2(-dz, dx);
        step = 0;
      }
      if (!S.path.length || S.t > 4) { p.x = S.stand.x; p.z = S.stand.z; S.phase = 'sit'; S.t = 0; }
    } else if (S.phase === 'sit') {
      p.heading = S.heading; p.speed = 0;
      S.k = Math.min(1, S.t / 0.45);
      if (S.k >= 1) { S.phase = 'seated'; S.t = 0; }
    } else if (S.phase === 'seated') {
      p.heading = S.heading; p.speed = 0; S.k = 1;
      if (S.until != null && S.t >= S.until) this.standUp();
    } else if (S.phase === 'up') {
      S.k = Math.max(0, 1 - S.t / 0.35);
      if (S.k <= 0) this.seat = null;
    }
  }
  // the move canoe.js poses (main.js camp 2 wraps canoe.moveOf): sitting, with the spoon's cycle while eating
  move() {
    const S = this.seat;
    if (!S || S.phase === 'walk' || (S.phase === 'up' && S.k < 0.55)) return null;
    const m = this._move || (this._move = { kind: 'sit', t: 0, dur: 0, u: 0, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, top: 0, heading: 0, speed: 0, depth: 0, carry: false, nearD: null, far: null, eat: null });
    m.t = S.t; m.top = S.seat.y; m.heading = S.heading;
    m.from.x = m.to.x = S.seat.x; m.from.y = m.to.y = S.seat.y; m.from.z = m.to.z = S.seat.z;
    const E = this.eating;
    m.eat = E && S.phase === 'seated' ? { k: E.phase, t: E.t } : E && S.phase === 'sit' ? { k: 0, t: 0 } : null;
    return m;
  }

  // --- the frame -----------------------------------------------------------------------------------------------------
  // before player.update (chores.before): the walker held while sitting, eating or setting the pot on
  before() { if (this.busy) this.player.input.paused = true; }
  // after player.update (chores.update): the pot, the seat, the eating, the leftovers
  update(dt) {
    const p = this.player;
    if (this.gesture) {
      this.gesture.t += dt;
      if (p.mode === 'walk') p.prompt = { key: null, text: this.gesture.say };
      if (this.gesture.t >= this.gesture.dur) this.gesture = null;
    }
    this.updateSeat(dt);
    if (this.eating) {
      if (!this.seat) this.eating = null;
      else { this.updateEating(dt); if (this.eating && p.mode === 'walk') p.prompt = { key: null, text: this.eating.apply ? `Eating the ${eatName(this.eating.def)} by the fire…` : 'Eating…' }; }
    } else if (this.seat && this.seat.phase !== 'up' && p.mode === 'walk' && !this.seat.quiet && !this.ch.holdActive()) p.prompt = { key: null, text: 'Sitting down…' };
    const P = this.pot;
    if (P) {
      const F = this.fires, f = F.get(P.key), site = this.ch.camp.registry.site(P.key), og = this.onGrate(P.key);
      if (!og.pot) { // the pot was taken off the grate (the book): what was in it goes back where it can
        this.inv.place(P.raw, 1, { data: P.data, pool: this.ch.campPool(), quiet: true });
        this.note('You take the pot off the grate before it is done.', 4);
        this.pot = null; this.ch.persist();
      } else {
        const heat = F.heat(f);
        if (heat >= HEAT_MIN) {
          P.t += dt; P.cold = false;
          // the cook's minutes on the clock over its seconds, while you are about the camp
          const fs = site && site.layout ? site.layout.fire : null, near = fs && Math.hypot(fs.x - p.x, fs.z - p.z) < NEAR_CAMP;
          const want = P.at0 + P.hours * Math.min(1, P.t / P.dur), now = this.now;
          if (near && now < want && want - now < 1) this.pass(want - now);
        } else if (!P.cold) { P.cold = true; this.note('The fire is too low to cook on: a branch or a log under the pot.', 5); }
        if (P.t >= P.dur) this.finish();
      }
    }
    if (this.hot) this.hot.t += dt;
    // the sounds: the pot bubbling or the pan sizzling while it cooks
    if ((this.soundT -= dt) <= 0) {
      this.soundT = 0.55 + Math.random() * 0.3;
      const Q = this.pot, site = Q && this.ch.camp.registry.site(Q.key);
      if (Q && !Q.cold && site && site.layout && Q.t > 0.8) this.sound(Q.fish ? sizzle : bubble, this.grateSpot(site), 0.6 + 0.4 * smoothstep(0.1, 0.5, Q.t / Q.dur));
    }
    // leftovers go off
    if ((this.spoilT -= dt) <= 0) { this.spoilT = 2; this.spoil(); }
    this.draw();
  }
  // a cooked thing past its keeping, anywhere, is thrown out (once you would notice: in reach or at the camp)
  spoil() {
    const inv = this.inv, now = this.now;
    if (!inv || !inv.attached) return;
    for (const c of inv.containers) for (const e of [...c.grid]) {
      const d = e.data;
      if (!d || !Number.isFinite(d.until) || now < d.until) continue;
      const def = itemDef(e.id); if (!def || !def.cooked) continue;
      inv.take(c.id, e.uid, e.qty);
      this.note(`The leftover ${eatName(def)} ${isAre(eatName(def)) === 'are' ? 'have' : 'has'} gone off. You pack it out in the garbage bag.`, 5);
    }
  }

  // the pot (or the pan) on whichever grate holds it, its steam
  draw() {
    const show = (m, on) => { m.visible = !!on; };
    let at = null, look = null, steam = 0;
    const P = this.pot;
    const keyOn = P ? P.key : (this.inv.attached ? (this.inv.containers.find((c) => c.item === 'grate' && c.at && c.at.grate && c.grid.some((e) => e.id === 'pot')) || {}).at : null)?.grate ?? null;
    const site = keyOn ? this.ch.camp.registry.site(keyOn) : null;
    if (site && site.layout) {
      at = this.grateSpot(site);
      const og = this.onGrate(keyOn);
      const fishy = P ? P.fish : og.food ? /^fried:/.test(og.food.id) : false;
      const inHand = !!(this.eating && this.eating.key === keyOn && this.eating.apply); // the pot is in his hand
      if ((og.pot || P) && !inHand) look = fishy ? (P && P.t < P.dur * 0.5 ? 'panRaw' : 'panFried') : 'potLid';
      if (P && !P.cold) steam = fishy ? 0.35 + 0.35 * smoothstep(0.2, 0.6, P.t / P.dur) : 0.25 + 0.75 * smoothstep(0.1, 0.55, P.t / P.dur);
      else if (this.hot && this.hot.key === keyOn && og.food) steam = 0.5 * (1 - smoothstep(4, 40, this.hot.t)) + 0.12;
    }
    for (const k of ['potLid', 'panRaw', 'panFried']) {
      const m = this[k];
      show(m, look === k);
      if (look === k) { m.position.set(at.x, at.y, at.z); m.rotation.set(0, -(at.a || 0) + 0.6, 0); }
    }
    if (look && steam > 0.01 && this.fires.steamAt) this.fires.steamAt('pot', { x: at.x, y: at.y + (look === 'potLid' ? H_POT + 0.03 : 0.03), z: at.z }, steam);
  }

  // --- the figure (main.js camp 2: canoe.update wrapped) ------------------------------------------------------------
  // before the pose: sitting, the rig is carried from where he stands onto the seat; on his heels for a moment
  beforePose() {
    const S = this.seat, p = this.player, cn = p.canoe;
    if (this.gesture && cn && cn.state) cn.state.crouch = 1;
    if (!S || S.phase === 'walk' || !cn) return;
    const k = S.k * S.k * (3 - 2 * S.k), fx = Math.cos(S.heading), fz = -Math.sin(S.heading);
    RIG.set(S.seat.x + fx * 0.07, 0, S.seat.z + fz * 0.07);
    const x = S.stand.x + (RIG.x - S.stand.x) * k, z = S.stand.z + (RIG.z - S.stand.z) * k;
    const rig = cn.rig, g = this.ch.camp.tiles.groundAt(x, z);
    rig.position.set(x, (Number.isFinite(g) ? g : rig.position.y - 0.1) + 0.1, z);
    rig.rotation.set(0, S.heading, 0);
    rig.updateMatrixWorld(true);
  }
  // after the pose: the spoon in the right hand and the pot in the left while eating
  afterPose() {
    const E = this.eating, S = this.seat, cn = this.player.canoe, on = !!(E && S && (S.phase === 'seated' || S.phase === 'sit') && cn && cn.figure);
    this.spoon.visible = on; this.handPot.visible = on && !!E.apply;
    if (!on) return;
    const b = cn.figure.bones;
    b.handR.updateWorldMatrix(true, false); b.handL.updateWorldMatrix(true, false);
    // the hand bone's frame (figure.js Poser): +x the grip axis (the thumb side), the fingers along the bind direction
    const R = b.handR.matrixWorld, Lm = b.handL.matrixWorld;
    const grip = (m, sg) => V(0, -1, -0.24 * sg).normalize().multiplyScalar(0.07).add(V(0, -0.24, -sg).normalize().multiplyScalar(0.017)).applyMatrix4(m);
    const pR = grip(R, -1), ax = V(1, 0, 0).transformDirection(R);
    this.spoon.position.copy(pR).addScaledVector(ax, -0.05);
    this.spoon.quaternion.setFromUnitVectors(V(1, 0, 0), ax);
    if (E.apply) {
      const pL = grip(Lm, 1), dn = V(0, -1, -0.24).normalize().transformDirection(Lm), palm = V(0, -0.24, 1).normalize().transformDirection(Lm);
      this.handPot.position.copy(pL).addScaledVector(palm, R_POT * 0.6).addScaledVector(dn, 0.01);
      this.handPot.position.y -= H_POT * 0.55;
      this.handPot.rotation.set(0, S.heading, 0);
    }
  }

  // --- the book (main.js camp 2: journal.pack.onUse) ----------------------------------------------------------------
  // fb2 A: the grate is the fire's panel in the book now (nearby.js: a raw meal or a fish dragged onto the grate, Cook;
  // the cooked thing in the grate's slot, Eat), so the old Use paths ("Cook it on the fire", "Eat it by the fire") are
  // gone: nothing here is the book's Use any more.
  onUse() { return undefined; }
  // fb2 A: Cook from the fire's panel: the first raw thing on the grate of site `key`, the pot from the grate or the
  // camp's reach. why it can't now, or null
  grateRaw(key) {
    const g = this.grate(key);
    if (!g) return null;
    for (const e of g.grid) { if (e.box) continue; const d = itemDef(e.id); if (d && d.eat && d.eat.cook && (d.kind === 'meal' || d.kind === 'fish')) return { c: g, e, def: d }; }
    return null;
  }
  cookProblem(site, key) {
    const F = this.fires, P = this.pot && this.pot.key === key ? this.pot : null;
    if (P && !P.done) return `${P.fish ? 'frying' : 'cooking'}: ready in ${Math.max(1, Math.ceil(P.dur - P.t))} s`;
    const og = this.onGrate(key);
    if (og.food) { const n = eatName(itemDef(og.food.id)); return `the ${n} ${isAre(n)} ready: eat, or take it off the grate`; }
    const raw = this.grateRaw(key);
    if (!raw) return 'drag a meal or a fish onto the grate';
    if (!F.isLit(key)) return 'the fire has to be burning';
    if (!this.potHere(key)) return 'the cook pot is not to hand: it is in a pack out of reach';
    const K = COOK[raw.def.kind === 'fish' ? 'fish' : raw.def.id] || COOK['meal:supper'], e0 = this.energy;
    if (K.water > 0 && e0 && e0.useWater && !e0.sandbox && e0.bottle < K.water - 0.001) return `it wants ${mL(K.water)} of water and the bottle has ${e0.bottle > 0.04 ? mL(e0.bottle) : 'none'}: fill it at the shore`;
    return null;
  }
  cookLabel(key) {
    const raw = this.grateRaw(key);
    if (!raw) return 'Cook';
    return raw.def.kind === 'fish' ? `Fry the ${this.nameOf(raw.def, raw.e.data)}` : `Cook the ${this.nameOf(raw.def)}`;
  }
  cookNow(site, key) { const raw = this.grateRaw(key); return raw && !this.cookProblem(site, key) ? this.start(site, key, raw) : false; }

  // --- saving (through chores.js) -----------------------------------------------------------------------------------
  serialize() {
    const P = this.pot;
    return { pot: P ? { key: P.key, raw: P.raw, out: P.out, data: P.data, t: +P.t.toFixed(2), dur: P.dur, hours: P.hours, at0: P.at0, fish: P.fish } : null, potFrom: this.potFrom || null };
  }
  restore(d) {
    this.pot = null; this.seat = null; this.eating = null; this.gesture = null; this.hot = null;
    if (!d) return;
    const P = d.pot;
    if (P && P.key && itemDef(P.raw) && itemDef(P.out)) this.pot = { key: P.key, raw: P.raw, out: P.out, data: P.data || null, t: clamp(+P.t || 0, 0, P.dur || 8), dur: P.dur || 8, hours: P.hours || 0.4, at0: this.now - (P.hours || 0.4) * ((+P.t || 0) / (P.dur || 8)), fish: !!P.fish, done: false, cold: false };
    this.potFrom = d.potFrom || null;
  }
  // for the leaving note (camp.js): the pot left on a grate
  ashore(key = null) {
    const inv = this.inv;
    if (!inv || !inv.attached) return [];
    const gs = inv.containers.filter((c) => c.item === 'grate' && c.at && (!key || c.at.grate === key));
    const out = [];
    if (gs.some((g) => g.grid.some((e) => e.id === 'pot'))) out.push(gs.some((g) => g.grid.some((e) => (itemDef(e.id) || {}).cooked)) ? 'the pot is on the grate with food in it' : 'the pot is on the grate');
    return out;
  }
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// litres as a line says them, to the 10 mL (rounded down: "270 mL", never "0.3 L" for 0.27 against 0.3 wanted)
const mL = (l) => (l >= 1 ? `${(Math.floor(l * 10) / 10).toFixed(1)} L` : `${Math.floor(l * 100 + 1e-6) * 10} mL`);
const isAre = (name) => (/\band\b/.test(name) ? 'are' : 'is'); // "the rice and lentils are", "the oatmeal is"
// a cooked thing as you would say it: "rice and lentils", "fried walleye", "oatmeal"
function eatName(d) {
  if (!d) return 'meal';
  const id = d.id || '';
  if (/^fried:/.test(id)) return d.name.toLowerCase();
  return { 'hot:supper': 'rice and lentils', 'hot:breakfast': 'oatmeal', 'hot:freeze': 'freeze-dried supper' }[id] || String(d.name || 'meal').toLowerCase();
}
export { eatName };
