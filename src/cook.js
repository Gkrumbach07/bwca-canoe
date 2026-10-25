import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { itemDef, NEED, check, timerWords } from './items.js';
import { env, grains } from './audio-kit.js';
import { smoothstep, clamp } from './rng.js';

// Cooking and eating at the fire (camp 2, the camp redone; the owner, 2026-10-24: "you make a fire so you can cook so you
// can eat. not just press G. cooking takes a second, it puts a small pot on the grate and you cook for some time, you have
// to wait short time but not instant, then you can eat", and "the toilet actually you should actually sit").
//
// - The pot. A raw meal or a fish dragged onto the grate (a fixed container at the ring: items.js 'grate', on the ground
//   at.grate = the site's key), the cook pot (items.js 'pot') beside a meal, over a lit fire: it cooks by itself (fb5 A,
//   below). A meal takes water from the bottle (energy.useWater: boiling it makes lake water safe, so treated or not).
//   It cooks for COOK[kind] game minutes on the clock while the fire under it burns, steaming (fire.js's pot steam) and
//   bubbling, a fish sizzling in the pot's lid. Done, it chimes, and the cooked thing (items.js hot:* and fried:*) sits on
//   the grate marked Ready: taken off it (E at it, or a drag), it is eaten from the book, or kept as leftovers, which keep
//   `keep` game hours and then go off.
// - Eating is instant (wc A, the owner's third round of 2026-10-24: "i dont want to have to sit to eat food, just
//   consume it. no animation"): a thing eaten from the book (inventory.eat), with no sit. Sitting on the bench is its own
//   thing now (E Sit, stream C's player.sitAt).
// - Sitting (the fallback when player.sitAt is not in the build, and the latrine's walk): sitAt(spot) walks the walker
//   to a spot in front of a seat (round whatever is between, along an arc about it), turns him and sits him down onto
//   it: the figure's rig is moved onto the seat (beforePose) and poseSit is given the seat's height (move()). main.js
//   (camp 2) wraps canoe.moveOf and canoe.update to call move(), beforePose() and afterPose().
// Saved through chores.js (trip.state.chores.cook).

// fb3 B (the owner, 2026-10-25: "pot seems useless, we can just drag food onto fire and it starts cooking it right away"):
// the pot matters. A meal cooks only in the pot, and the pot has to be ON the grate (dragged there from the book: nothing
// fetches it out of a pack for you): the meal beside it on the grate, and it draws its water from the bottle. A fish
// fries in the pot's lid when the pot is there, else on a green stick over the coals (no pot needed). The pot stays on
// the grate after the meal.
// fb5 A (the owner's third round of 2026-10-25: "cooking is automatic when you put something over a active fire, no
// extra button"): whatever raw thing sits on the grate over a lit fire cooks by itself (autoCook, a few times a second),
// one at a time, on the game clock (no minutes passed for you: the clock runs as it runs, and you pitch the tent while
// supper cooks). A meal waits for the pot on the grate, and for its water in the bottle; what is missing is a chip on
// the thing (grateStatus: "needs the pot" on the meal, "water 0.3 L" on the pot). Done, it chimes and sits on the grate
// marked Ready; you take it off to eat. The fire's events say 'cooking' and 'ready' (fire.js on / events).
export const COOK = { // game minutes on the grate over a lit fire; litres of water from the bottle
  'meal:supper': { minutes: 15, water: 0.4 },
  'meal:breakfast': { minutes: 10, water: 0.3 },
  'meal:freeze': { minutes: 10, water: 0.5 },
  fish: { minutes: 10, water: 0 },
};
const HEAT_MIN = 0.12;         // the fire's heat (fire.js) under which the pot stops cooking
const AUTO_EVERY = 0.25;       // real seconds between the grates' looks (autoCook)
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
// (content D: the caps are plain metal, not the END cell's wood end grain)
// the cook pot: blackened aluminium, the lid on with its knob, the wire bail folded to one side (y 0 the bottom)
function potGeometry({ lid = true, food = null } = {}) {
  const b = new PropBuilder(), metal = C(0x8f8b84), soot = C(0x3d3a36), wire = C(0xa4a6a8);
  b.cyl(V(0, 0, 0), V(0, H_POT * 0.35, 0), R_POT * 0.97, R_POT, 12, TILE.PLAIN, soot, { cap0: true, capTile: TILE.PLAIN });
  b.cyl(V(0, H_POT * 0.35, 0), V(0, H_POT, 0), R_POT, R_POT * 1.01, 12, TILE.PLAIN, metal);
  b.cyl(V(0, H_POT - 0.006, 0), V(0, H_POT + 0.003, 0), R_POT * 1.04, R_POT * 1.04, 12, TILE.PLAIN, metal, { cap1: !lid && !food, capTile: TILE.PLAIN });
  if (lid) {
    b.cyl(V(0, H_POT + 0.003, 0), V(0, H_POT + 0.012, 0), R_POT * 1.03, R_POT * 0.8, 12, TILE.PLAIN, metal, { cap1: true, capTile: TILE.PLAIN });
    b.cyl(V(0, H_POT + 0.012, 0), V(0, H_POT + 0.026, 0), 0.012, 0.01, 6, TILE.PLAIN, soot, { cap1: true, capTile: TILE.PLAIN });
  } else if (food) b.cyl(V(0, H_POT * 0.62, 0), V(0, H_POT * 0.7, 0), R_POT * 0.96, R_POT * 0.95, 12, TILE.PLAIN, C(food), { cap1: true, capTile: TILE.PLAIN });
  const bail = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; bail.push(V(-Math.sin(a) * 0.03 - 0.002, H_POT * 0.82 + Math.sin(a) * 0.025, -Math.cos(a) * R_POT * 1.06)); }
  b.tube(bail.map((p) => p.applyAxisAngle(V(0, 0, 1), -1.15).add(V(-R_POT * 0.15, 0.02, 0))), 0.0022, 4, TILE.PLAIN, wire);
  return shade(b.build(), (x, y, z, ny) => (0.55 + 0.45 * Math.min(1, y / H_POT)) * (ny < -0.4 ? 0.5 : 1));
}
// the pot's lid turned over as a pan, its folding handle out, a fish frying in it (raw pale; fried golden)
function panGeometry(fried) {
  const b = new PropBuilder(), metal = C(0x7a766f), wire = C(0xa4a6a8);
  b.cyl(V(0, 0, 0), V(0, 0.018, 0), R_POT * 0.86, R_POT * 1.04, 12, TILE.PLAIN, metal, { cap0: true, capTile: TILE.PLAIN });
  b.cyl(V(0, 0.004, 0), V(0, 0.005, 0), R_POT * 0.95, R_POT * 0.95, 12, TILE.PLAIN, C(0x3e3a36), { cap1: true, capTile: TILE.PLAIN });
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
// fb3 B: a fish on a stick: a green alder stick angled up over the grate from the ground beside it, the two fillets
// skewered near its tip (raw pale; done golden). Built with the fish at the origin (the grate's spot), the stick running
// down and away along -x to its butt on the ground
function stickGeometry(fried) {
  const b = new PropBuilder(), bark = C(0x6d5a44), cut = C(0xd9cfa6);
  b.tube([V(-0.78, -0.42, 0.06), V(-0.4, -0.2, 0.03), V(0.02, 0.02, 0), V(0.2, 0.11, -0.01)], (t) => 0.015 - 0.006 * t, 5, TILE.BARK, bark, { cap0: true, cap1: true });
  b.cyl(V(0.195, 0.105, -0.01), V(0.2, 0.11, -0.01), 0.009, 0.008, 5, TILE.PLAIN, cut, { cap1: true });
  const f = new PropBuilder(), meat = C(fried ? 0xb9773a : 0xe2c3b0), edge = C(fried ? 0x7a4a22 : 0xb3b7a2);
  for (const [x, z, l] of [[-0.05, 0.0, 0.1], [0.09, 0.0, 0.095]]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(V(x + (-l + 2 * l * t) * 0.45, (-l + 2 * l * t) * 0.9, z + Math.sin(t * Math.PI * 2) * 0.004)); }
    f.tube(pts, (t) => 0.005 + 0.03 * Math.sin(Math.max(0.12, Math.min(0.94, t)) * Math.PI) ** 0.7, 7, TILE.PLAIN, (p) => (p.z > 0.008 ? meat : edge), { cap0: true, cap1: true });
  }
  const fish = f.build();
  fish.scale(1, 1, 0.45);
  b.addBuilt(fish);
  return shade(b.build(), (x, y, z, ny) => (ny < -0.4 ? 0.55 : 0.92));
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
// fb5 A: a match struck on the box and the kindling taking: a rasp, the flare's soft whump, then a crackle rising
// (relit: the coals catching a dry piece, no match: the whump and the crackle)
export function strike(au, pos, relit = false) {
  const v = au.voice({ ...pos, gain: 0.26, ref: 5, wet: 0.1, air: false, pri: 2 });
  if (!v) return null;
  const R = au.rand, t = v.t, t1 = t + (relit ? 0 : 0.32);
  if (!relit) {
    const hp = v.filter('bandpass', 3800, 1.1), g = v.gain(0); v.noise('white', hp); hp.connect(g); g.connect(v.input);
    env(g.gain, t, 0.01, 0.9, 0.09, 0.08);
    hp.frequency.setValueAtTime(2600, t); hp.frequency.linearRampToValueAtTime(5200, t + 0.16);
    const hs = v.filter('highpass', 1800, 0.7), gs = v.gain(0); v.noise('white', hs); hs.connect(gs); gs.connect(v.input);
    env(gs.gain, t + 0.17, 0.04, 0.35, 0.18, 0.25); // the match head's fizz
  }
  const lp = v.filter('lowpass', 700, 0.8), gw = v.gain(0); v.noise('brown', lp); lp.connect(gw); gw.connect(v.input);
  env(gw.gain, t1, 0.12, relit ? 0.6 : 0.85, 0.35, 0.6);
  lp.frequency.setValueAtTime(380, t1); lp.frequency.linearRampToValueAtTime(1100, t1 + 0.5);
  const bp = v.filter('bandpass', 2400, 1.4), gc = v.gain(0); v.noise('white', bp); bp.connect(gc); gc.connect(v.input);
  grains(gc.gain, t1 + 0.15, 16, 1.4, 0.8, 0.014, R);
  return v.until(t1 + 1.8);
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
    this.seat = null;      // sitting (or walking to sit): { stand, seat, heading, path, phase, t, k, until }
    this.eating = null;    // (wc A: eating is instant; kept null for the poses that asked)
    this.gesture = null;   // a moment on the heels (setting the pot on): { t, say }
    this.hot = null;       // the pot just off the boil: { key, t } (its steam thins over a little while)
    this.soundT = 0; this.spoilT = 0; this.autoT = 0;
    this.auto = true;      // fb5 A: it cooks by itself (stream B's "Onto the grate" leaves the start to autoCook)
    this.mat = propMaterial();
    const mk = (g) => { const m = new THREE.Mesh(g, this.mat); m.castShadow = true; m.receiveShadow = true; m.visible = false; m.matrixAutoUpdate = true; this.ch.camp.scene.add(m); return m; };
    this.potLid = mk(potGeometry({ lid: true }));
    this.potOpen = mk(potGeometry({ lid: false, food: 0xb9925a }));
    this.panRaw = mk(panGeometry(false));
    this.panFried = mk(panGeometry(true));
    this.stickRaw = mk(stickGeometry(false)); // fb3 B: a fish on a stick, no pot
    this.stickFried = mk(stickGeometry(true));
    void spoonGeometry; // (the spoon and the pot in the hands went with the eating sit, wc A)
    const e = this.energy;
    if (e && e.onEat) e.onEat = null; // wc A: nothing sits you down to a meal any more
  }
  get camp() { return this.ch.camp; }
  get player() { return this.ch.camp.player; }
  get energy() { return this.ch.camp.energy; }
  get fires() { return this.ch.camp.fires; }
  get inv() { return this.ch.inv; }
  get audio() { return this.ch.camp.audio; }
  get now() { return this.ch.camp.now; }
  get busy() { return !!(this.seat || this.gesture); }
  note(t, s = 5) { this.ch.note(t, s); }
  sound(fn, at, ...a) { const au = this.audio; if (!au || !au.ctx || !au.enabled) return; try { fn(au, at, ...a); } catch { /* the sound is a nicety */ } }

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
  // the cook pot, on the grate already or in the camp's reach: { c, e, on } or null (fb3 B: only one ON the grate cooks
  // a meal; the words "no pot" on the grate mean none anywhere near)
  potHere(key) {
    const og = this.onGrate(key);
    if (og.pot) return { c: og.g, e: og.pot, on: true };
    for (const c of this.ch.campPool()) { if (c.item === 'grate') continue; const e = c.grid.find((q) => q.id === 'pot'); if (e) return { c, e, on: false }; }
    return null;
  }
  potOn(key) { const og = this.onGrate(key); return og.pot ? { c: og.g, e: og.pot, on: true } : null; }
  // what the cooked thing out of `def` is
  cookedOf(def) {
    if (def.kind === 'fish') { const sp = def.species || String(def.id).replace(/^fish:/, ''); return itemDef(`fried:${sp}`) ? `fried:${sp}` : 'fried:fish'; }
    return { 'meal:supper': 'hot:supper', 'meal:breakfast': 'hot:breakfast', 'meal:freeze': 'hot:freeze' }[def.id] || 'hot:supper';
  }
  nameOf(def, data = null) {
    if (def.kind === 'fish') return `${data && data.length ? `${Math.round(data.length)} cm ` : ''}${def.name.toLowerCase().replace(/^northern /, '')}`;
    return { 'meal:supper': 'rice and lentils', 'meal:breakfast': 'oatmeal', 'meal:freeze': 'freeze-dried supper' }[def.id] || def.name.toLowerCase();
  }

  // --- cooking ------------------------------------------------------------------------------------------------------
  // fb5 A: the raw thing on the grate of ring `key` that would cook next, and what it still waits for: { raw: { c, e,
  // def }, wait: null | 'pot' | 'water' | 'busy', water (litres it wants), short (litres the bottle is short) } or null
  nextOnGrate(key) {
    const g = this.grate(key);
    if (!g) return null;
    const og = this.onGrate(key), potBusy = !!(og.food && !/^fried:/.test(og.food.id)); // (a cooked meal still in the pot)
    let best = null;
    for (const e of g.grid) {
      if (e.box) continue;
      const d = itemDef(e.id);
      if (!d || !d.eat || !d.eat.cook || !(d.kind === 'meal' || d.kind === 'fish')) continue;
      const fish = d.kind === 'fish', K = COOK[fish ? 'fish' : d.id] || COOK['meal:supper'];
      let wait = null, short = 0;
      if (!fish && !og.pot) wait = 'pot';
      else if (!fish && potBusy) wait = 'busy';
      else if (K.water > 0) { short = this.waterShort(K.water); if (short > 0) wait = 'water'; }
      const it = { raw: { c: g, e, def: d }, wait, water: K.water, short };
      if (!wait) return it; // the first that can go on
      if (!best) best = it;
    }
    return best;
  }
  // litres the bottle is short of `want` (0 when it has it; none in a sandbox)
  waterShort(want) {
    const e0 = this.energy;
    if (!(want > 0) || !e0 || !e0.useWater || e0.sandbox) return 0;
    return Math.max(0, want - (e0.bottle || 0));
  }
  // a few times a second: a raw thing on a grate over a lit fire goes on to cook (one at a time)
  autoCook(only = null) {
    const inv = this.inv, F = this.fires;
    if (!inv || !inv.attached || !F || (this.pot && !this.pot.done)) return false;
    for (const g of inv.containers) {
      if (g.item !== 'grate' || !g.at || !g.at.grate || (only && g.at.grate !== only)) continue;
      const key = g.at.grate;
      if (!F.isLit(key) || F.heat(F.get(key), this.now) < HEAT_MIN) continue;
      const n = this.nextOnGrate(key);
      if (n && !n.wait) return this.start(key, n.raw);
    }
    return false;
  }
  // put `raw` ({ c, e, def }, on the grate of ring `key`) on to cook: the water from the bottle, the pot's steam, the
  // fire's 'cooking' event
  start(key, raw) {
    const F = this.fires, inv = this.inv, e0 = this.energy, def = raw.def, fish = def.kind === 'fish';
    const K = COOK[fish ? 'fish' : def.id] || COOK['meal:supper'];
    if (!F.isLit(key) || (this.pot && !this.pot.done)) return false;
    const pot = this.potOn(key), stick = fish && !pot;
    if (!pot && !fish) return false;
    if (K.water > 0 && this.waterShort(K.water) > 0) return false;
    const got = inv.take(raw.c.id, raw.e.uid, 1);
    if (!got) return false;
    if (K.water > 0 && e0 && e0.useWater && !e0.sandbox) e0.useWater(K.water);
    this.pot = { key, raw: def.id, out: this.cookedOf(def), data: got.data ? { ...got.data } : null, k: 0, hours: K.minutes / 60, last: this.now, fish, stick, done: false, cold: false };
    this.hot = null;
    inv.emit('items');
    this.ch.persist();
    if (F.emit) F.emit('cooking', { key, item: def.id });
    if (this.ch.camp.log) this.ch.camp.log('cook', { what: def.id, key });
    return true;
  }
  // done: the cooked thing on the grate, marked Ready (grateStatus), a chime
  finish() {
    const P = this.pot, inv = this.inv, site = this.ch.camp.registry.site(P.key);
    const g = this.ch.grate(P.key, site), def = itemDef(P.out), now = this.now;
    const data = { cooked: +now.toFixed(3), until: +(now + (def.keep || 4)).toFixed(3), ...(P.data && P.data.length ? { length: P.data.length } : {}) };
    if (!g || !inv.put(g, P.out, { data, quiet: true })) inv.place(P.out, 1, { data, pool: this.ch.campPool(), quiet: true });
    P.done = true;
    this.hot = { key: P.key, t: 0 };
    if (site) this.sound(chime, this.grateSpot(site));
    this.note(`${cap(eatName(def))}: ready.`, 3);
    this.pot = null;
    inv.emit('items');
    this.ch.persist();
    if (this.fires.emit) this.fires.emit('ready', { key: P.key, item: P.out });
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

  // --- eating (wc A: at once, no sit; fb5 A: from the book, the cooked thing taken off the grate or right-clicked there)
  onEat() {}

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
  // sat down (or sitting down), the fallback's word of it (pointer.seated)
  get seated() { const S = this.seat; return !!(S && (S.phase === 'sit' || S.phase === 'seated')); }
  updateSeat(dt) {
    const S = this.seat, p = this.player;
    if (!S) return;
    if (p.mode !== 'walk' || p.teleporting) { this.seat = null; return; }
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
  // the move canoe.js poses (main.js camp 2 wraps canoe.moveOf): sitting
  move() {
    const S = this.seat;
    if (!S || S.phase === 'walk' || (S.phase === 'up' && S.k < 0.55)) return null;
    const m = this._move || (this._move = { kind: 'sit', t: 0, dur: 0, u: 0, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, top: 0, heading: 0, speed: 0, depth: 0, carry: false, nearD: null, far: null, eat: null });
    m.t = S.t; m.top = S.seat.y; m.heading = S.heading;
    m.from.x = m.to.x = S.seat.x; m.from.y = m.to.y = S.seat.y; m.from.z = m.to.z = S.seat.z;
    m.eat = null;
    return m;
  }

  // --- the frame -----------------------------------------------------------------------------------------------------
  // before player.update (chores.before): the walker held while sitting or setting the pot on
  before() { if (this.busy) this.player.input.paused = true; }
  // after player.update (chores.update): the pot, the seat, the leftovers
  update(dt) {
    const p = this.player;
    if (this.gesture) {
      this.gesture.t += dt;
      if (p.mode === 'walk') p.prompt = { key: null, text: this.gesture.say };
      if (this.gesture.t >= this.gesture.dur) this.gesture = null;
    }
    this.updateSeat(dt);
    if (this.seat && this.seat.phase !== 'up' && p.mode === 'walk' && !this.seat.quiet && !this.ch.holdActive()) p.prompt = { key: null, text: this.seat.phase === 'seated' ? `Sitting on the ${this.seat.kind || 'bench'}` : 'Sitting down…' };
    const P = this.pot;
    if (P) {
      const F = this.fires, f = F.get(P.key), og = this.onGrate(P.key), now = this.now;
      if (!og.pot && !P.stick) { // the pot was taken off the grate (the book): what was in it goes back onto the grate, raw (fb3 B: a fish on a stick has no pot)
        const g = this.grate(P.key);
        if (!g || !this.inv.put(g, P.raw, { data: P.data, quiet: true })) this.inv.place(P.raw, 1, { data: P.data, pool: this.ch.campPool(), quiet: true });
        this.pot = null; this.inv.emit('items'); this.ch.persist();
      } else {
        // (fb5 A: on the game clock, while the fire under it is hot enough; a jump of the clock, a rest, counts while it burns)
        const dh = Math.max(0, Math.min(2, now - (Number.isFinite(P.last) ? P.last : now)));
        P.last = now;
        const heat = F.heat(f, now);
        if (heat >= HEAT_MIN) { P.k = Math.min(1, P.k + dh / Math.max(1e-3, P.hours)); P.cold = false; }
        else if (dh > 0.2 && f && f.until > now - dh) { P.k = Math.min(1, P.k + Math.max(0, f.until - (now - dh)) / Math.max(1e-3, P.hours)); P.cold = true; }
        else P.cold = true;
        if (P.k >= 1) this.finish();
      }
    }
    if ((this.autoT -= dt) <= 0) { this.autoT = AUTO_EVERY; if (!this.pot) this.autoCook(); }
    if (this.hot) this.hot.t += dt;
    // the sounds: the pot bubbling or the pan sizzling while it cooks
    if ((this.soundT -= dt) <= 0) {
      this.soundT = 0.55 + Math.random() * 0.3;
      const Q = this.pot, site = Q && this.ch.camp.registry.site(Q.key);
      if (Q && !Q.cold && site && site.layout && Q.k > 0.03) this.sound(Q.fish ? sizzle : bubble, this.grateSpot(site), 0.6 + 0.4 * smoothstep(0.1, 0.5, Q.k));
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
    const keyOn = P ? P.key : (this.inv.attached ? (this.inv.containers.find((c) => c.item === 'grate' && c.at && c.at.grate && c.grid.some((e) => e.id === 'pot' || !!(itemDef(e.id) || {}).cooked)) || {}).at : null)?.grate ?? null; // (fb3 B: a fish done on its stick shows with no pot there)
    const site = keyOn ? this.ch.camp.registry.site(keyOn) : null;
    if (site && site.layout) {
      at = this.grateSpot(site);
      const og = this.onGrate(keyOn);
      const fishy = P ? P.fish : og.food ? /^fried:/.test(og.food.id) : false;
      // fb3 B: a fish without the pot is on a stick (while it cooks, and done on the grate until it is taken)
      const stick = fishy && (P ? P.stick : !og.pot), rawish = P && P.k < 0.5;
      if (stick) look = rawish ? 'stickRaw' : 'stickFried';
      else if (og.pot || P) look = fishy ? (rawish ? 'panRaw' : 'panFried') : 'potLid';
      if (P && !P.cold) steam = fishy ? 0.35 + 0.35 * smoothstep(0.2, 0.6, P.k) : 0.25 + 0.75 * smoothstep(0.1, 0.55, P.k);
      else if (this.hot && this.hot.key === keyOn && og.food) steam = 0.5 * (1 - smoothstep(4, 40, this.hot.t)) + 0.12;
      if (stick) steam *= 0.5;
    }
    for (const k of ['potLid', 'panRaw', 'panFried', 'stickRaw', 'stickFried']) {
      const m = this[k];
      show(m, look === k);
      if (look === k) { m.position.set(at.x, at.y + (k.startsWith('stick') ? 0.16 : 0), at.z); m.rotation.set(0, -(at.a || 0) + (k.startsWith('stick') ? 2.2 : 0.6), 0); }
    }
    if (look && steam > 0.01 && this.fires.steamAt) this.fires.steamAt('pot', { x: at.x, y: at.y + (look === 'potLid' ? H_POT + 0.03 : look.startsWith('stick') ? 0.18 : 0.03), z: at.z }, steam);
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
  // after the pose: nothing in the hands any more (the spoon and the pot went with the eating sit, wc A)
  afterPose() {}

  // --- the book (main.js camp 2: journal.pack.onUse) ----------------------------------------------------------------
  // fb2 A: the grate is the fire's card now; nothing here is the book's Use any more.
  onUse() { return undefined; }
  // the first raw thing on the grate of site `key`
  grateRaw(key) { const n = this.nextOnGrate(key); return n ? n.raw : null; }
  // inventory.verb('cook') and ('eat') on a raw thing (stream B's "Onto the grate"): a check. def: a raw thing not yet on
  // the grate (the verb moves it there; it cooks by itself over a lit fire). fb5 A: nothing to press, so the check is
  // only "can it go on": room, and nothing of its kind cooking in the way; what it then waits for is the grate's chips.
  cookCheck(site, key, def = null) {
    const P = this.pot && this.pot.key === key && !this.pot.done ? this.pot : null;
    if (P && !def) { const c = this.cookingNow(key); return check(false, `${c.label} · ${timerWords(c.timer)}`, [NEED.timer(c.label, c.timer, c.running, { chip: `${c.label.toLowerCase()} ${timerWords(c.timer)}` })], ''); }
    if (!def) { const n = this.nextOnGrate(key); return n ? check(!n.wait, n.wait ? this.waitWhy(n) : null, n.wait ? [this.waitNeed(n)] : [], '') : check(false, 'Nothing raw on the grate', [NEED.step('A meal or a fish on the grate', false, { chip: 'a meal or a fish' })], 'Drag a meal or a fish onto the grate: over a lit fire it cooks by itself'); }
    return check(true, null, this.needsFor(key, def).filter((q) => !q.done), 'Over a lit fire it cooks by itself');
  }
  waitWhy(n) { return n.wait === 'pot' ? 'Needs the pot' : n.wait === 'water' ? `Needs ${mL(n.short)} more water` : 'The pot is full'; }
  waitNeed(n) { return n.wait === 'pot' ? NEED.step('The pot on the grate', false, { chip: 'needs the pot', item: 'pot' }) : n.wait === 'water' ? NEED.qty('Water', +((this.energy && this.energy.bottle) || 0).toFixed(2), n.water, 'L', { chip: `water ${litresUp(n.short)}`, item: 'bottle' }) : NEED.step('The pot free', false, { chip: 'take the meal out of the pot' }); }
  // what cooking `def` at ring `key` needs, as needs with chips (the first not done is what a greyed verb shows): a lit
  // fire, the pot on the grate (a meal; a fish does without), the water it wants from the bottle
  needsFor(key, def = null) {
    const F = this.fires, lit = F.isLit(key), fish = !!(def && def.kind === 'fish'), K = def ? COOK[fish ? 'fish' : def.id] || COOK['meal:supper'] : null;
    const needs = [NEED.step('A lit fire', lit, { chip: 'a lit fire' })];
    if (!fish) needs.push(NEED.step('The pot on the grate', !!this.potOn(key), { chip: 'needs the pot', item: 'pot' }));
    if (K && K.water > 0) { const short = this.waterShort(K.water); needs.push(NEED.qty('Water', +((this.energy && this.energy.bottle) || 0).toFixed(2), K.water, 'L', { done: short <= 0, chip: `water ${litresUp(short)}`, item: 'bottle' })); }
    return needs;
  }
  // the pot cooking now, for the card's bar: { value, label, timer (game seconds left), running } or null
  cookingNow(key) {
    const P = this.pot && this.pot.key === key ? this.pot : null;
    if (!P || P.done) return null;
    const sec = Math.max(0, (1 - P.k) * P.hours * 3600), running = this.fires.heat(this.fires.get(key), this.now) >= HEAT_MIN;
    const label = P.fish ? 'Frying' : P.raw === 'meal:freeze' ? 'Soaking' : 'Cooking';
    return { value: Math.min(1, P.k), label, timer: Math.round(sec), running, words: '', item: P.raw }; // (item: the fb5 join's card draws it by the bar, the fish being off the grate's grid while it fries)
  }
  // fb5 A (decision 1, the grate): the state of a thing on the grate as a status (inventory.status; stream B draws the
  // chip on its icon and the label in its tooltip): the meal with no pot "needs the pot", the pot short of water
  // "water 0.3 L", the pot Cooking, the cooked thing Ready; else null. The state word and the missing chip only: no
  // timers, no next lines (the owner, 2026-10-25: "you still seem to be exposing too much numbers and info in the fire")
  grateStatus(c, e) {
    const key = c && c.item === 'grate' && c.at ? c.at.grate : null;
    if (!key || !e || e.box) return null;
    const d = itemDef(e.id);
    if (!d) return null;
    const P = this.pot && this.pot.key === key && !this.pot.done ? this.pot : null;
    if (d.cooked) return { label: 'Ready', mark: 'ready' };
    const n = this.nextOnGrate(key);
    if (e.id === 'pot') {
      if (P && !P.fish) return { label: this.cookingNow(key).label, mark: 'cooking' }; // (fb5 A: its bar under the grate; no timer)
      if (n && n.wait === 'water') return { label: 'Short of water', mark: 'need', chip: `water ${litresUp(n.short)}` };
      return null;
    }
    if (d.eat && d.eat.cook && (d.kind === 'meal' || d.kind === 'fish')) {
      if (P && P.fish && P.stick && d.kind === 'fish') return null;
      if (d.kind === 'meal' && !this.potOn(key)) return { label: 'Raw', mark: 'need', chip: 'needs the pot' };
      return { label: 'Raw', mark: null };
    }
    return null;
  }
  // the pot's entry on the grate (inventory.status's own call): the grate's status
  potStatus(c, e) { return e && e.id === 'pot' ? this.grateStatus(c, e) : null; }
  cookLabel() { return 'Onto the grate'; }
  // inventory.verb('cook') after it has moved the raw thing onto the grate: it goes on now if it can (else it waits)
  cookNow(site, key) { this.autoCook(key); return true; }

  // --- saving (through chores.js) -----------------------------------------------------------------------------------
  serialize() {
    const P = this.pot;
    return { pot: P ? { key: P.key, raw: P.raw, out: P.out, data: P.data, k: +P.k.toFixed(4), hours: P.hours, fish: P.fish, stick: !!P.stick } : null, potFrom: this.potFrom || null };
  }
  restore(d) {
    this.pot = null; this.seat = null; this.eating = null; this.gesture = null; this.hot = null;
    if (!d) return;
    const P = d.pot;
    // (fb5 A: k, how far along, 0..1; a save from before it kept real seconds t of dur)
    if (P && P.key && itemDef(P.raw) && itemDef(P.out)) { const K = COOK[P.fish ? 'fish' : P.raw] || COOK['meal:supper'], k = Number.isFinite(+P.k) ? +P.k : (+P.t || 0) / (P.dur || 8); this.pot = { key: P.key, raw: P.raw, out: P.out, data: P.data || null, k: clamp(k, 0, 1), hours: K.minutes / 60, last: null, fish: !!P.fish, stick: !!P.stick, done: false, cold: false }; }
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
// what the bottle is short, as the chip says it: up to the next tenth of a litre ("0.3 L")
const litresUp = (l) => `${(Math.ceil(l * 10 - 1e-6) / 10).toFixed(1)} L`;
const isAre = (name) => (/\band\b/.test(name) ? 'are' : 'is'); // "the rice and lentils are", "the oatmeal is"
// a cooked thing as you would say it: "rice and lentils", "fried walleye", "oatmeal"
function eatName(d) {
  if (!d) return 'meal';
  const id = d.id || '';
  if (/^fried:/.test(id)) return d.name.toLowerCase();
  return { 'hot:supper': 'rice and lentils', 'hot:breakfast': 'oatmeal', 'hot:freeze': 'freeze-dried supper' }[id] || String(d.name || 'meal').toLowerCase();
}
export { eatName };
