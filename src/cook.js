import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { itemDef, NEED, check, VERB_WHEN, isPot } from './items.js';
import { plan, recipeFor, WATER, isWater, MIN_WATER, HOT_HOURS, STOVE_SPEED } from './recipes.js';
import { env, grains } from './audio-kit.js';
import { smoothstep, clamp } from './rng.js';

// crafting (2026-10-31): what follows on the pot beside the meal on the grate, drawing its water from the bottle, is
// history. The pot is a container now (items.js def.pot: small, cook, big); the meal and its water go IN it (poured from
// the bottle, or dipped at the lake), the pot goes on the grate, and recipes.js's table says what it makes and how long
// it takes over a lit fire or the stove. See "the cook" below and docs/crafting.md.
//
// Cooking and eating at the fire (camp 2, the camp redone; the owner, 2026-10-24: "you make a fire so you can cook so you
// can eat. not just press G. cooking takes a second, it puts a small pot on the grate and you cook for some time, you have
// to wait short time but not instant, then you can eat", and "the toilet actually you should actually sit").
//
// - The pot. A raw meal or a fish dragged onto the grate (a fixed container at the ring: items.js 'grate', on the ground
//   at.grate = the site's key), the cook pot (items.js 'pot') beside a meal, over a lit fire: it cooks by itself (fb5 A,
//   below). A meal takes water from the bottle (energy.useWater: boiling it makes lake water safe, so treated or not:
//   the untreated goes first).
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
// tuning: on the one clock (fb5 C, Trip ×4) a supper's 15 game minutes were 3¾ real minutes stood at the grate with
// nothing left to do (the tent's hold is a minute, the wood picked by then), so they were cut to two thirds. One speed
// (2026-10-26, the clock at ×8) puts them back: a supper's 15 game minutes are under 2 real minutes, breakfast and a
// fish 1¼. kit.js's meals and fillets the same way.
// water (the owner, 2026-10-26: "shoudlt it require some water for the deharated meals and oatmeal"): every meal that is
// dried takes its real water from the bottle, the grate's and the stove's alike (kit.js adds the content meals': pancakes,
// chili mac, bannock), and a fish none. A supper 0.4–0.5 L, oatmeal a quarter litre (it was 0.3). Short of it, the meal
// waits on the grate with the pot's chip "water 0.3 L" (grateStatus), the stove's Cook on it greys with the same chip,
// and the first time the moment 'mealwater' (kit.js) says to fill the bottle. Lake water as it comes is fine: it boils.
// crafting (2026-10-31): the minutes and the water of each thing cooked are recipes.js RECIPES now, one table.
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
// crafting (2026-10-31, the owner: "think of it like Minecraft, you would interact with a furnace, you'd add coal, and
// then you'd add whatever you're cooking on top … you have to start the fire with wood and then you have to add a pot
// on there … Food goes in pot"). A vessel (a pot, items.js def.pot; or the grate itself, for a fish on a stick) on a
// station (the grate over a lit fire, or the stove lit under it) works through what is in it by recipes.js's table, on
// the game clock: a job per vessel { sig, k (0..1), hours, last, word, cold }, kept while what is in it stays the same.
// Done, the cooked things and the water left (boiled now: clean, hot) are in the pot; you eat from it or take them out.
// The verbs that move water and pots by hand are this file's too (verb(), through kit.verb).
export const POT_VERBS = new Set(['cook', 'pourpot', 'pourbottle', 'tipout', 'fillpot', 'potgrate']);
const STOVE_HOURS = 0.75;      // game hours a canister's light lasts under a pot (one use of the fuel)
const SHORE_REACH = 2.5;       // m from the waterline where a pot is dipped full (camp.js AT_WATER)
const GRATE = { u: 0.41, w: 0.26 }; // the grate's half-length and half-width over the bars (containers.js GRATE)
export class Cook {
  // chores: chores.js's Chores (the camp, the inventory, the fires, the notes and the save come through it)
  constructor(chores) {
    this.ch = chores;
    this.pot = null;       // (a save before crafting: the one thing cooking; kept null, chores.tripEnded clears it)
    this.jobs = {};        // crafting: per vessel (a pot's container id, or a grate's): { sig, k, hours, last, word, cold, key }
    this.stove = null;     // the stove lit under a pot: { pot (its container id), until (abs game hours) }
    this.seat = null;      // sitting (or walking to sit): { stand, seat, heading, path, phase, t, k, until }
    this.eating = null;    // (wc A: eating is instant; kept null for the poses that asked)
    this.gesture = null;   // a moment on the heels (setting the pot on): { t, say }
    this.hot = null;       // a pot just off the boil: { key, t } (its steam thins over a little while)
    this.soundT = 0; this.spoilT = 0; this.autoT = 0; this.migT = 0;
    this.auto = true;      // fb5 A: it cooks by itself
    this.mat = propMaterial();
    const mk = (g) => { const m = new THREE.Mesh(g, this.mat); m.castShadow = true; m.receiveShadow = true; m.visible = false; m.matrixAutoUpdate = true; this.ch.camp.scene.add(m); return m; };
    this.mk = mk;
    this.geoLid = potGeometry({ lid: true });
    this.geoOpen = potGeometry({ lid: false, food: 0xb9925a });
    this.potLid = mk(this.geoLid); // (the first pot's mesh; containers.js once moved it)
    this.potMeshes = new Map(); // a pot's container id → its mesh on the grate
    this.panRaw = mk(panGeometry(false));
    this.panFried = mk(panGeometry(true));
    this.stickRaw = mk(stickGeometry(false)); // fb3 B: a fish on a stick, no pot
    this.stickFried = mk(stickGeometry(true));
    void spoonGeometry; // (the spoon and the pot in the hands went with the eating sit, wc A)
    const e = this.energy;
    if (e && e.onEat) e.onEat = null; // wc A: nothing sits you down to a meal any more
    // the verbs offered only when they can be (items.js VERB_WHEN): a pot in reach, a fire ring by you, the water's edge
    VERB_WHEN.pot = () => this.potsInReach().length > 0;
    VERB_WHEN.fire = () => !!this.fireHere();
    VERB_WHEN.shore = () => this.atShore();
    VERB_WHEN.cleanwater = () => true;
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
  // an entry's cell on the grate, in the world (its middle): containers.js's cellOf
  cellSpot(site, e) {
    const f = site.layout.fire, a = f.a || 0, gx = -Math.sin(a), gz = Math.cos(a), d = itemDef(e.id) || { w: 1, h: 1 }, spec = (itemDef('grate') || {}).container || { cols: 4, rows: 2 };
    const w = e.rot ? d.h : d.w, h = e.rot ? d.w : d.h, u = -GRATE.u + ((e.x + w / 2) / spec.cols) * 2 * GRATE.u, v = -GRATE.w + ((e.y + h / 2) / spec.rows) * 2 * GRATE.w;
    return { x: f.x + gx * u + gz * v, y: f.y + 0.322, z: f.z + gz * u - gx * v, a };
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

  // --- the grate and the pots -------------------------------------------------------------------------------------
  grate(key) { return this.ch.grate(key, null); }
  // the pots standing on the grate of ring `key`: their containers
  potsOn(key) {
    const g = this.grate(key), inv = this.inv;
    return g ? g.grid.filter((e) => e.box && isPot(e.id)).map((e) => inv.cont(e.uid)).filter(Boolean) : [];
  }
  // (the old shape, for the dot and the leaving note) { pot: the first pot's box entry, food: a cooked thing on the
  // grate or in a pot on it, g }
  onGrate(key) {
    const g = this.grate(key);
    if (!g) return { pot: null, food: null, g: null };
    const pot = g.grid.find((e) => e.box && isPot(e.id)) || null, cooked = (c) => c.grid.find((e) => !e.box && (itemDef(e.id) || {}).cooked) || null;
    let food = cooked(g);
    for (const c of this.potsOn(key)) if (!food) food = cooked(c);
    return { pot, food, g };
  }
  potsInReach() { const inv = this.inv; return inv && inv.attached ? inv.reachable().filter((c) => isPot(c.item)) : []; }
  // the ring you stand by (inventory.fireNear): { site, key, grate } or null
  fireHere() {
    const inv = this.inv, k = inv && typeof inv.fireNear === 'function' ? inv.fireNear() : null;
    if (!k) return null;
    const g = this.ch.grate(k.key, k.site);
    return g ? { site: k.site, key: k.key, grate: g } : null;
  }
  // on foot at the water's edge (camp.js bottleHere's test)
  atShore() {
    const p = this.player, w = this.camp.world;
    if (!p || p.mode !== 'walk' || !w || typeof w.shoreAt !== 'function') return false;
    const f = p.forward || { x: 0, z: 0 };
    try { return w.shoreAt(p.x, p.z) <= SHORE_REACH || w.shoreAt(p.x + f.x * 1.6, p.z + f.z * 1.6) < 0; } catch { return false; }
  }
  // where a pot is heated: { kind: 'fire', key, lit } on a grate, { kind: 'stove', lit } with the stove under it, or null
  stationOf(c) {
    const inv = this.inv, F = this.fires;
    if (this.stove && this.stove.pot === c.id) return { kind: 'stove', lit: this.now < this.stove.until };
    const host = c.where === 'in' ? inv.cont(c.in) : c.item === 'grate' ? c : null;
    if (!host || host.item !== 'grate' || !host.at || !host.at.grate) return null;
    const key = host.at.grate, lit = !!(F && F.isLit(key) && F.heat(F.get(key), this.now) >= HEAT_MIN);
    return { kind: 'fire', key, lit };
  }
  planOf(c) { return plan(c.grid, isPot(c.item) ? 'pot' : 'grate', this.now); }
  // the water entry in a pot, or null
  waterOf(c) { return c ? c.grid.find((e) => isWater(e.id)) || null : null; }
  litresIn(c) { const w = this.waterOf(c); return w && Number.isFinite(w.left) ? w.left : 0; }
  roomIn(c) { const d = itemDef(c.item); return Math.max(0, ((d && d.pot && d.pot.litres) || 2) - this.litresIn(c)); }
  // pour `l` litres into pot `c` (lake: as it comes): a drop of lake water makes it all lake water. → litres in
  addWater(c, l, lake) {
    const inv = this.inv, add = Math.min(Math.max(0, l), this.roomIn(c));
    if (add <= 0.001) return 0;
    const w = this.waterOf(c);
    if (w) {
      w.left = +(w.left + add).toFixed(3);
      if (lake) w.id = WATER.lake;
      w.data = { kg: w.left }; // (fresh water in it: no longer hot)
      inv.emit('items');
      return add;
    }
    if (!inv.put(c, lake ? WATER.lake : WATER.clean, { data: { kg: add }, quiet: true })) return 0;
    const e = c.grid.find((q) => q.uid === inv.lastPut);
    if (e) e.left = +add.toFixed(3);
    inv.emit('items');
    return add;
  }
  // the water in pot `c` set to `l` litres (clean, hot until `hot`), or gone under a wet bottom
  setWater(c, l, hot = null) {
    const w = this.waterOf(c);
    if (!w) return;
    if (l < MIN_WATER) { c.grid.splice(c.grid.indexOf(w), 1); return; }
    w.id = WATER.clean; w.left = +l.toFixed(3); w.data = { kg: w.left, ...(hot != null ? { hot: +hot.toFixed(3) } : {}) };
  }
  // hot clean water in a pot in reach, `l` litres of it: { c, e } or null (kit.js brew)
  hotWater(l) {
    for (const c of this.potsInReach()) { const w = this.waterOf(c); if (w && w.id === WATER.clean && w.left >= l - 1e-6 && w.data && w.data.hot > this.now) return { c, e: w }; }
    return null;
  }
  takeWater(w, l) {
    const c = this.inv.cont(w.c.id), e = c && c.grid.find((q) => q.uid === w.e.uid);
    if (!e || !(e.left >= l - 1e-6)) return false;
    e.left = +(e.left - l).toFixed(3); e.data = { ...(e.data || {}), kg: e.left };
    if (e.left < MIN_WATER) c.grid.splice(c.grid.indexOf(e), 1);
    this.inv.emit('items');
    return true;
  }
  // a save from before crafting: the cook pot was a plain thing, not a container; it becomes one where it lies
  migratePots() {
    const inv = this.inv;
    if (!inv || !inv.attached) return;
    let n = 0;
    for (const c of [...inv.containers]) for (const e of c.grid) {
      if (e.box || !isPot(e.id)) continue;
      const k = inv.mk(e.id, 'in'); k.in = c.id; inv.containers.push(k);
      e.box = true; e.uid = k.id; e.qty = 1; delete e.data; delete e.left;
      n++;
    }
    if (n) inv.emit('containers');
  }

  // --- the cooking ----------------------------------------------------------------------------------------------------
  // a few times a second: every vessel on a station works through what is in it (recipes.js plan), on the game clock
  work() {
    const inv = this.inv;
    if (!inv || !inv.attached) return;
    const now = this.now, live = new Set();
    if (this.stove && (now >= this.stove.until || !inv.cont(this.stove.pot))) this.stoveOut();
    for (const c of [...inv.containers]) {
      const pot = isPot(c.item);
      if (!pot && !(c.item === 'grate' && c.at && c.at.grate)) continue;
      live.add(c.id);
      const st = this.stationOf(c), pl = this.planOf(c);
      let j = this.jobs[c.id];
      if (!pl.ok) {
        if (j && j.sig !== pl.sig) delete this.jobs[c.id];
        if (this.stove && this.stove.pot === c.id) this.stoveOut(pl.wait === 'done' ? null : 'The stove off: nothing in the pot to cook.');
        continue;
      }
      if (!j || j.sig !== pl.sig) {
        if (!st || !st.lit) { if (j) delete this.jobs[c.id]; continue; }
        j = this.jobs[c.id] = { sig: pl.sig, k: 0, hours: pl.minutes / 60, last: now, word: pl.word, cold: false, fish: pl.dishes.some((x) => x.r.dry), item: pl.dishes.length ? pl.dishes[0].e.id : pl.water ? pl.water.e.id : null };
        if (this.fires.emit) this.fires.emit('cooking', { key: st.key || null, item: j.item });
        if (this.camp.log) this.camp.log('cook', { what: j.item, key: st.key || null });
      }
      const dh = Math.max(0, Math.min(2, now - (Number.isFinite(j.last) ? j.last : now)));
      j.last = now; j.key = st ? st.key || null : null; j.stove = !!(st && st.kind === 'stove');
      const speed = st && st.lit ? (st.kind === 'stove' ? STOVE_SPEED : 1) : 0;
      j.cold = !speed;
      if (speed) j.k = Math.min(1, j.k + (dh * speed) / Math.max(1e-3, j.hours));
      if (j.k >= 1) this.finish(c, pl, j);
    }
    for (const id of Object.keys(this.jobs)) if (!live.has(id)) delete this.jobs[id];
  }
  // done: the cooked things in the vessel where the raw ones were, the water left boiled (clean, hot), a chime
  finish(c, pl, j) {
    const inv = this.inv, now = this.now, made = [];
    for (const x of pl.dishes) {
      const n = x.e.qty || 1, len = x.e.data && x.e.data.length;
      if (!inv.take(c.id, x.e.uid, n)) continue;
      const def = itemDef(x.out), data = { cooked: +now.toFixed(3), until: +(now + ((def && def.keep) || 4)).toFixed(3), ...(len ? { length: len } : {}) };
      for (let i = 0; i < n; i++) {
        if (!inv.put(c, x.out, { data, quiet: true })) {
          const host = c.where === 'in' ? inv.cont(c.in) : null;
          if (!(host && host.item === 'grate' && inv.put(host, x.out, { data, quiet: true }))) inv.place(x.out, 1, { data, pool: this.ch.campPool(), quiet: true });
        }
      }
      made.push(def);
    }
    if (pl.water) this.setWater(c, pl.left, now + HOT_HOURS);
    delete this.jobs[c.id];
    const site = j.key ? this.camp.registry.site(j.key) : null;
    this.hot = j.key ? { key: j.key, t: 0 } : null;
    const at = site && site.layout ? this.grateSpot(site) : this.spotOf(c);
    if (at) this.sound(chime, at);
    const name = made.length ? cap(eatName(made[0])) : pl.left >= MIN_WATER ? 'The water' : 'It';
    this.note(made.length ? `${name}: ready, in the ${lower(potName(c))}.` : `${name}: boiled. Safe to drink, hot for a while.`, 3);
    if (j.stove) this.stoveOut(null);
    inv.emit('items');
    this.ch.persist();
    if (this.fires.emit) this.fires.emit('ready', { key: j.key || null, item: made.length ? made[0].id : WATER.clean });
  }
  // a pot's spot in the world (for its sounds): on the grate, else where its container is
  spotOf(c) {
    const inv = this.inv, q = typeof inv.posOf === 'function' ? inv.posOf(c) : null, p = this.player;
    if (!q) return null;
    const y = p && typeof p.groundAt === 'function' ? p.groundAt(q.x, q.z) + 0.1 : 0;
    return { x: q.x, y, z: q.z };
  }
  stoveOut(say = null) { if (!this.stove) return; this.stove = null; if (say) this.note(say, 3); }
  // the job on a vessel, for its bar: { value, label, timer (game seconds left), running, item } or null
  cookingOf(cId) {
    const j = this.jobs[cId];
    if (!j) return null;
    const sec = Math.max(0, (1 - j.k) * j.hours * 3600 / (j.stove ? STOVE_SPEED : 1));
    return { value: Math.min(1, j.k), label: j.word || 'Cooking', timer: Math.round(sec), running: !j.cold, words: '', item: j.item };
  }
  // what cooks at ring `key` (the fire card's bar under the grate): the fish on a stick there (grateOnly), else the job
  // furthest along on the grate or in a pot on it
  cookingNow(key, { grateOnly = false } = {}) {
    const g = this.grate(key);
    if (!g) return null;
    const own = this.cookingOf(g.id);
    if (own || grateOnly) return own;
    let best = null;
    for (const c of this.potsOn(key)) { const q = this.cookingOf(c.id); if (q && (!best || q.value > best.value)) best = q; }
    return best;
  }
  // (kit.js's moment: a pot on the grate of ring `key` short of its water) { wait, short } or null
  nextOnGrate(key) {
    for (const c of this.potsOn(key)) { const pl = this.planOf(c); if (!pl.ok && pl.wait === 'water') return { wait: 'water', short: pl.short || 0, water: pl.need }; }
    return null;
  }
  // the pots on ring `key`'s grate back into what you carry (E at the grate on a pot, the leaving)
  putAway(key, say = false, only = null) {
    const inv = this.inv;
    let n = 0;
    for (const c of this.potsOn(key)) {
      if (only && c.id !== only) continue;
      const to = inv.reachable().find((k) => k.id !== c.id && !isPot(k.item) && k.item !== 'grate' && !(itemDef(k.item) || {}).station && inv.firstFit(k, c.item));
      if (to && inv.move(null, c.id, to.id, ...Object.values(inv.firstFit(to, c.item)))) { n++; continue; }
      const r = inv.carry ? inv.carry(c.id, 'hands') : null;
      if (r && r.ok) n++;
      else if (say) this.note(`No room for the ${lower(potName(c))} in anything to hand.`);
    }
    if (n) { this.ch.dropEmptyGrate(key); if (say) this.note(n > 1 ? 'The pots off the grate and put away.' : 'Off the grate and put away.', 3); inv.emit('items'); this.ch.persist(); }
    return n > 0;
  }

  // --- the verbs (kit.verb routes POT_VERBS and the stove's here) -----------------------------------------------------
  // → { enabled, why, needs, next, label?, run } | null
  verb(id, ref) {
    try {
      const inv = this.inv;
      if (!inv || !inv.attached) return null;
      switch (id) {
        case 'cook': return this.intoPotVerb(ref);
        case 'potgrate': return this.potGrateVerb(ref);
        case 'fillpot': return this.fillPotVerb(ref);
        case 'pourpot': return this.pourPotVerb();
        case 'pourbottle': return this.pourBottleVerb(ref);
        case 'tipout': return this.tipOutVerb(ref);
        case 'stove': return this.stoveVerb();
        default: return null;
      }
    } catch (err) { console.warn('cook.verb', id, err); return no('Not now'); }
  }
  // a ref's entry ({ c, e }) or its pot (a pot by its strap, or its box entry): { c, e, pot }
  refIn(ref) {
    const inv = this.inv, r = inv.refOf(ref);
    if (!r) return null;
    if (r.thing) return r.thing.kind === 'container' && isPot(r.thing.obj.item) ? { pot: r.thing.obj } : null;
    if (r.e && r.e.box) { const k = inv.cont(r.e.uid); return k && isPot(k.item) ? { pot: k } : null; }
    return r.e ? { c: r.c, e: r.e } : null;
  }
  // a pot for `itemId` with room: one on the grate by you first, then any in reach (not one cooking something else)
  potFor(itemId, not = null) {
    const inv = this.inv, here = this.fireHere(), on = here ? this.potsOn(here.key) : [];
    const all = [...on, ...this.potsInReach().filter((c) => !on.includes(c))];
    return all.find((c) => c !== not && inv.firstFit(c, itemId)) || null;
  }
  // a raw meal or a fish: Into the pot (a whole fish too long for the pots goes on the grate, on a stick)
  intoPotVerb(ref) {
    const inv = this.inv, h = this.refIn(ref);
    if (!h || !h.e) return null;
    const d = itemDef(h.e.id);
    if (!d || !d.eat || !d.eat.cook) return null;
    if (isPot(h.c.item)) return no('In the pot', [], '');
    const pot = this.potFor(h.e.id), here = this.fireHere();
    if (pot) {
      return go(() => {
        const s = inv.firstFit(pot, h.e.id);
        if (!s || !inv.move(h.c.id, h.e.uid, pot.id, s.x, s.y, s.rot, 1)) return { ok: false, words: 'No room in the pot.' };
        return { ok: true, words: `${d.name}: into the ${lower(potName(pot))}.${this.planOf(pot).wait === 'water' ? ' It wants water.' : ''}` };
      }, [], 'With its water, over a lit fire, it cooks');
    }
    if (d.kind === 'fish' && here && h.c !== here.grate && inv.firstFit(here.grate, h.e.id)) {
      return go(() => { const s = inv.firstFit(here.grate, h.e.id); return s && inv.move(h.c.id, h.e.uid, here.grate.id, s.x, s.y, s.rot, 1) ? { ok: true, words: `${d.name}: on a stick over the grate.` } : { ok: false, words: 'No room on the grate.' }; }, [], 'Over a lit fire it cooks on a stick', 'Onto the grate');
    }
    if (h.c && h.c.item === 'grate') return no('On the grate', [], '');
    const any = this.potsInReach().length;
    return no(any ? 'No room in a pot' : 'Needs a pot', [NEED.step('A pot with room', false, { chip: any ? 'room in a pot' : 'a pot', item: 'pot' })], any ? 'Take what is in the pot out first, or bring another pot' : 'A pot in reach: the cook pot rides in your pack');
  }
  potGrateVerb(ref) {
    const inv = this.inv, h = this.refIn(ref);
    if (!h || !h.pot) return null;
    const here = this.fireHere();
    if (!here) return no('At a fire ring', [NEED.step('A fire ring', false, { chip: 'a fire ring' })], 'Walk to a campsite’s fire ring');
    if (h.pot.where === 'in' && h.pot.in === here.grate.id) return no('On the grate', [], '');
    if (!inv.firstFit(here.grate, h.pot.item)) return no('The grate is full', [NEED.step('Room on the grate', false, { chip: 'room on the grate' })], 'Take something off the grate first');
    return go(() => {
      const s = inv.firstFit(here.grate, h.pot.item);
      if (!s || !inv.move(null, h.pot.id, here.grate.id, s.x, s.y, s.rot)) return { ok: false, words: 'It won’t go on the grate.' };
      return { ok: true, words: `The ${lower(potName(h.pot))}, on the grate.` };
    });
  }
  fillPotVerb(ref) {
    const h = this.refIn(ref);
    if (!h || !h.pot) return null;
    if (!this.atShore()) return no('At the water’s edge', [NEED.step('The water’s edge', false, { chip: 'the water’s edge' })], 'Walk down to the water, on foot');
    const room = this.roomIn(h.pot);
    if (room <= 0.05) return no('The pot is full', [], 'Tip some out first');
    return go(() => {
      const cp = this.camp;
      const done = () => { const l = this.addWater(h.pot, room, true); if (cp.audio && cp.audio.paddleDip) cp.audio.paddleDip(); this.note(l > 0 ? `The ${lower(potName(h.pot))}: ${litres(this.litresIn(h.pot))} of lake water in it.` : 'No room in it.', 3); };
      if (typeof cp.chore === 'function') cp.chore('fill', done, { seconds: 0.8, hours: 0, say: 'Dipping the pot…', crouch: true }); else done();
      return { ok: true, words: '' };
    }, [], `${litres(room)} of lake water`);
  }
  // the bottle poured into a pot in reach: the one short of water first, then the grate's, then any
  pourPotVerb() {
    const e0 = this.energy;
    if (!e0 || typeof e0.pourOut !== 'function') return null;
    const pots = this.potsInReach();
    if (!pots.length) return no('No pot in reach', [NEED.step('A pot', false, { chip: 'a pot', item: 'pot' })], 'A pot in reach');
    if (e0.bottle <= 0.02) return no('The bottle is dry', [], 'Fill it at the water’s edge');
    const here = this.fireHere(), on = here ? new Set(this.potsOn(here.key)) : new Set();
    const rank = (c) => (this.planOf(c).wait === 'water' ? 0 : on.has(c) ? 1 : 2);
    const pot = pots.filter((c) => this.roomIn(c) > 0.05 && (this.waterOf(c) || this.inv.firstFit(c, WATER.lake))).sort((a, b) => rank(a) - rank(b))[0];
    if (!pot) return no('No room in a pot', [NEED.step('Room in a pot', false, { chip: 'room in a pot' })], 'Tip a pot out, or take something out of it');
    const pl = this.planOf(pot), want = pl.wait === 'water' ? Math.min(this.roomIn(pot), Math.max(pl.short || 0, 0)) : this.roomIn(pot);
    return go(() => {
      const q = e0.pourOut(Math.min(this.roomIn(pot), e0.bottle, want > 0 ? Math.max(want, Math.min(e0.bottle, this.roomIn(pot))) : this.roomIn(pot)));
      const l = q.l > 0 ? this.addWater(pot, q.l, q.lake) : 0;
      this.inv.emit('items');
      return { ok: l > 0, words: l > 0 ? `${litres(l)} into the ${lower(potName(pot))}${q.lake ? ': lake water, it wants a boil' : ''}.` : 'Nothing poured.' };
    }, [], `Into the ${lower(potName(pot))}`);
  }
  pourBottleVerb(ref) {
    const h = this.refIn(ref), e0 = this.energy;
    if (!h || !h.e || !isWater(h.e.id) || !e0) return null;
    if (h.e.id === WATER.lake) return no('Lake water: boil it first', [NEED.step('Boiled', false, { chip: 'boil it first' })], 'The pot on the grate over a lit fire boils it');
    if (e0.untreated > 0.001) return no('Lake water in the bottle', [NEED.step('The bottle clean', false, { chip: 'lake water in the bottle' })], 'Drink it, treat it, or pour it into a pot to boil first');
    const room = Math.max(0, 2 - e0.bottle);
    if (room <= 0.02) return no('The bottle is full', [], 'Drink first');
    return go(() => {
      const l = Math.min(room, h.e.left || 0), got = e0.addClean(l);
      const c = this.inv.cont(h.c.id), e = c && c.grid.find((q) => q.uid === h.e.uid);
      if (e) { e.left = +((e.left || 0) - got).toFixed(3); e.data = { ...(e.data || {}), kg: e.left }; if (e.left < MIN_WATER) c.grid.splice(c.grid.indexOf(e), 1); }
      this.inv.emit('items');
      return { ok: true, words: `${litres(got)} into the bottle: safe to drink.` };
    });
  }
  tipOutVerb(ref) {
    const h = this.refIn(ref);
    if (!h || !h.e || !isWater(h.e.id)) return null;
    return go(() => { const c = this.inv.cont(h.c.id), i = c ? c.grid.findIndex((q) => q.uid === h.e.uid) : -1; if (i >= 0) c.grid.splice(i, 1); this.inv.emit('items'); return { ok: true, words: 'Tipped out.' }; });
  }
  // the stove: lit under a pot (set down, or on a grate) that has something to cook or water to boil; a use of the fuel
  stoveVerb() {
    const inv = this.inv, p = this.player;
    if (!p || p.mode !== 'walk') return no('On foot', [NEED.step('On foot', false, { chip: 'on foot' })], 'Go ashore first');
    if (this.stove) return no('The stove is lit', [], 'Under the pot already');
    const fuel = inv.usesLeft('fuel');
    if (!(fuel > 0)) return no('No fuel', [NEED.qty('Fuel', 0, 1, '', { chip: 'a fuel canister', item: 'fuel' })], 'A fuel canister, in reach: any outfitter’s provisions shelf has them');
    const pots = this.potsInReach();
    if (!pots.length) return no('Needs a pot', [NEED.step('A pot', false, { chip: 'a pot', item: 'pot' })], 'A pot in reach, with what you cook in it');
    const out = (c) => { const host = c.where === 'in' ? inv.cont(c.in) : null; return !host || host.item === 'pile' || host.item === 'grate'; };
    const ready = pots.map((c) => ({ c, pl: this.planOf(c) })), go1 = ready.find((x) => x.pl.ok && out(x.c));
    if (!go1) {
      const inPack = ready.find((x) => x.pl.ok);
      if (inPack) return no('Set the pot down', [NEED.step('The pot out of the pack', false, { chip: 'set the pot down', item: 'pot' })], 'Drag the pot out of the pack onto the ground');
      const w = ready.find((x) => x.pl.chip);
      return no(w ? w.pl.why : 'Nothing to cook', [NEED.step('Something in the pot', false, { chip: w ? w.pl.chip : 'water or a meal in the pot', item: 'pot' })], 'Water in the pot to boil, or a meal and its water');
    }
    return go(() => {
      inv.useOne('fuel');
      this.stove = { pot: go1.c.id, until: this.now + STOVE_HOURS };
      const at = this.spotOf(go1.c); if (at) this.sound(strike, at, false);
      this.work();
      return { ok: true, words: `The stove roars under the ${lower(potName(go1.c))}.` };
    }, [], `${go1.pl.word}: ${Math.max(1, Math.round(go1.pl.minutes / STOVE_SPEED))} min`, 'Light it under the pot');
  }

  // --- states (inventory.status: a word, a mark and the one missing chip; no timers, the bar says how far) --------------
  // a pot's own (its icon, its tab): Cooking / Boiling, what it waits for, Ready
  potState(c) {
    const j = this.jobs[c.id], pl = this.planOf(c), st = this.stationOf(c);
    if (j && pl.ok && j.sig === pl.sig) return { label: j.word, mark: 'cooking', ...(j.cold ? { hint: 'off the heat' } : {}) };
    if (!pl.ok && pl.chip && pl.wait !== 'empty') return { label: pl.why, mark: 'need', chip: pl.chip };
    if (pl.ok && st && !st.lit) return { label: 'Ready to cook', mark: 'need', chip: st.kind === 'fire' ? 'a lit fire' : 'the stove' };
    if (c.grid.some((e) => !e.box && (itemDef(e.id) || {}).cooked)) return { label: 'Ready', mark: 'ready' };
    const w = this.waterOf(c);
    if (w && w.id === WATER.clean && w.data && w.data.hot > this.now) return { label: 'Hot water', mark: 'hot' };
    return null;
  }
  // a thing on the grate or in a pot (inventory.entryStatus): the water's, a raw thing's, Ready
  grateStatus(c, e) {
    if (!c || !e || e.box) return null;
    const d = itemDef(e.id);
    if (!d) return null;
    if (isWater(e.id)) {
      if (e.id === WATER.lake) return { label: 'Untreated', mark: 'untreated', hint: 'boil it first' };
      return e.data && e.data.hot > this.now ? { label: 'Hot', mark: 'hot', hint: 'boiled' } : { label: 'Clean', mark: null, hint: 'boiled' };
    }
    if (d.cooked) return { label: 'Ready', mark: 'ready' };
    if (!(d.eat && d.eat.cook)) return null;
    if (c.item === 'grate' && d.kind !== 'fish') return { label: 'Raw', mark: 'need', chip: 'into a pot' };
    const j = this.jobs[c.id], pl = this.planOf(c);
    if (j && pl.ok && j.sig === pl.sig) return { label: j.word, mark: 'cooking' };
    if (!pl.ok && pl.chip && pl.wait !== 'nocook') return { label: 'Raw', mark: 'need', chip: pl.chip };
    return { label: 'Raw', mark: null };
  }
  potStatus(c, e) { return null; }
  cookLabel() { return 'Into the pot'; }
  cookNow() { this.work(); return true; }
  grateRaw() { return null; }
  // what cooking `def` needs (a greyed Eat's checklist): a lit fire, a pot on the grate (a fish does without), its water
  needsFor(key, def = null) {
    const F = this.fires, lit = F.isLit(key), r = def ? recipeFor(def) : null, pots = this.potsOn(key);
    const needs = [NEED.step('A lit fire', lit, { chip: 'a lit fire' })];
    if (!(r && r.dry)) needs.push(NEED.step('A pot on the grate', pots.length > 0, { chip: 'a pot on the grate', item: 'pot' }));
    if (r && r.water > 0) { const best = Math.max(0, ...pots.map((c) => this.litresIn(c))); needs.push(NEED.qty('Its water in the pot', +best.toFixed(2), r.water, 'L', { chip: `water ${litresUp(Math.max(0, r.water - best))}`, item: 'bottle' })); }
    return needs;
  }
  cookCheck(site, key, def = null) {
    return check(true, null, this.needsFor(key, def).filter((q) => !q.done), 'Into a pot with its water, the pot on the grate over a lit fire');
  }

  // --- eating (wc A: at once, no sit; from the book, out of the pot or off the grate)
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
  // after player.update (chores.update): the pots, the seat, the leftovers
  update(dt) {
    const p = this.player;
    if (this.gesture) {
      this.gesture.t += dt;
      if (p.mode === 'walk') p.prompt = { key: null, text: this.gesture.say };
      if (this.gesture.t >= this.gesture.dur) this.gesture = null;
    }
    this.updateSeat(dt);
    if (this.seat && this.seat.phase !== 'up' && p.mode === 'walk' && !this.seat.quiet && !this.ch.holdActive()) p.prompt = { key: null, text: this.seat.phase === 'seated' ? `Sitting on the ${this.seat.kind || 'bench'}` : 'Sitting down…' };
    if ((this.migT -= dt) <= 0) { this.migT = 3; this.migratePots(); this.restoreOld(); }
    if ((this.autoT -= dt) <= 0) { this.autoT = AUTO_EVERY; this.work(); }
    if (this.hot) this.hot.t += dt;
    // the sounds: a pot bubbling or a fish sizzling, the one furthest along over a lit fire near you
    if ((this.soundT -= dt) <= 0) {
      this.soundT = 0.55 + Math.random() * 0.3;
      const q = this.loudest();
      if (q) this.sound(q.j.fish ? sizzle : bubble, q.at, 0.6 + 0.4 * smoothstep(0.1, 0.5, q.j.k));
    }
    // leftovers go off
    if ((this.spoilT -= dt) <= 0) { this.spoilT = 2; this.spoil(); }
    this.draw();
  }
  // the job working nearest you (within 30 m) and where it is: { j, c, at } or null
  loudest() {
    const inv = this.inv, p = this.player;
    if (!inv || !inv.attached || !p) return null;
    let best = null;
    for (const [id, j] of Object.entries(this.jobs)) {
      if (j.cold || j.k < 0.03) continue;
      const c = inv.cont(id); if (!c) continue;
      const site = j.key ? this.camp.registry.site(j.key) : null, at = site && site.layout ? this.grateSpot(site) : this.spotOf(c);
      if (!at || Math.hypot(at.x - p.x, at.z - p.z) > 30) continue;
      if (!best || j.k > best.j.k) best = { j, c, at };
    }
    return best;
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

  // the pots on the grates near you, each at its cell (the lid on while it works, open with food in it), the fish on
  // their sticks, the steam off the one working hardest
  draw() {
    const inv = this.inv, p = this.player, used = new Set();
    let stick = null, steam = null;
    if (inv && inv.attached && p) {
      for (const g of inv.containers) {
        if (g.item !== 'grate' || !g.at || !g.at.grate || Math.abs(g.at.x - p.x) > 120 || Math.abs(g.at.z - p.z) > 120) continue;
        const site = this.camp.registry.site(g.at.grate);
        if (!site || !site.layout || !site.layout.fire) continue;
        for (const e of g.grid) {
          if (!e.box || !isPot(e.id)) continue;
          const c = inv.cont(e.uid); if (!c) continue;
          const m = this.potMesh(c.id), at = this.cellSpot(site, e), d = itemDef(c.item), s = (d && d.pot && d.pot.scale) || 1, j = this.jobs[c.id];
          const open = !j && c.grid.some((q) => !q.box && (itemDef(q.id) || {}).cooked);
          m.geometry = open ? this.geoOpen : this.geoLid;
          m.position.set(at.x, at.y, at.z); m.rotation.set(0, -at.a + 0.6, 0); m.scale.set(s, s * (c.item === 'potsmall' ? 0.9 : 1), s);
          m.visible = true; used.add(c.id);
          const amt = j && !j.cold ? (j.fish ? 0.35 + 0.35 * smoothstep(0.2, 0.6, j.k) : 0.25 + 0.75 * smoothstep(0.1, 0.55, j.k)) : 0;
          if (amt > 0 && (!steam || amt > steam.amt)) steam = { amt, at: { x: at.x, y: at.y + H_POT * s + 0.03, z: at.z } };
        }
        // a fish on the grate itself: on a green stick (fb3 B), raw while it starts, golden done
        if (!stick) {
          const raw = g.grid.find((q) => !q.box && (itemDef(q.id) || {}).kind === 'fish'), done = g.grid.find((q) => !q.box && /^fried:/.test(q.id));
          if (raw || done) { const j = this.jobs[g.id]; stick = { at: this.grateSpot(site), fried: !raw || (j && j.k >= 0.5) }; if (j && !j.cold) { const amt = 0.5 * (0.35 + 0.35 * smoothstep(0.2, 0.6, j.k)); if (!steam || amt > steam.amt) steam = { amt, at: { x: stick.at.x, y: stick.at.y + 0.18, z: stick.at.z } }; } }
        }
      }
    }
    for (const [id, m] of this.potMeshes) if (!used.has(id)) m.visible = false;
    for (const k of ['potLid', 'panRaw', 'panFried']) this[k].visible = false;
    for (const k of ['stickRaw', 'stickFried']) {
      const m = this[k], on = !!(stick && (k === 'stickFried') === !!stick.fried);
      m.visible = on;
      if (on) { m.position.set(stick.at.x, stick.at.y + 0.16, stick.at.z); m.rotation.set(0, -(stick.at.a || 0) + 2.2, 0); }
    }
    if (steam && this.fires.steamAt) this.fires.steamAt('pot', steam.at, steam.amt);
  }
  potMesh(id) {
    let m = this.potMeshes.get(id);
    if (!m) { m = this.potMeshes.size ? this.mk(this.geoLid) : this.potLid; this.potMeshes.set(id, m); }
    return m;
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

  // --- saving (through chores.js) -----------------------------------------------------------------------------------
  serialize() {
    const jobs = {};
    for (const [id, j] of Object.entries(this.jobs)) jobs[id] = { sig: j.sig, k: +j.k.toFixed(4), hours: j.hours, word: j.word, fish: !!j.fish, item: j.item || null, key: j.key || null };
    return { jobs, stove: this.stove ? { ...this.stove } : null };
  }
  restore(d) {
    this.pot = null; this.seat = null; this.eating = null; this.gesture = null; this.hot = null; this.jobs = {}; this.stove = null;
    if (!d) return;
    for (const [id, j] of Object.entries(d.jobs || {})) if (j && j.sig) this.jobs[id] = { ...j, k: clamp(+j.k || 0, 0, 1), last: null, cold: true };
    if (d.stove && d.stove.pot) this.stove = { pot: d.stove.pot, until: +d.stove.until || 0 };
    // a save from before crafting, with a thing cooking: it goes back onto its grate, raw, to cook again in a pot
    const P = d.pot;
    if (P && P.key && itemDef(P.raw)) this.restoreRaw = P;
  }
  // (the old save's thing cooking, put back once the inventory is in: chores.js calls update every frame)
  restoreOld() {
    const P = this.restoreRaw, inv = this.inv;
    if (!P || !inv || !inv.attached) return;
    this.restoreRaw = null;
    const g = this.grate(P.key);
    if (!g || !inv.put(g, P.raw, { data: P.data || null, quiet: true })) inv.place(P.raw, 1, { data: P.data || null, pool: this.ch.campPool(), quiet: true });
  }
  // for the leaving note (camp.js): a pot left on a grate
  ashore(key = null, near = null) {
    const inv = this.inv;
    if (!inv || !inv.attached) return [];
    // (near { x, z, r }: only the grates there)
    const gs = inv.containers.filter((c) => c.item === 'grate' && c.at && (!key || c.at.grate === key) && (!near || Math.hypot(c.at.x - near.x, c.at.z - near.z) <= near.r));
    const out = [];
    const pots = gs.flatMap((g) => g.grid.filter((e) => e.box && isPot(e.id)).map((e) => inv.cont(e.uid)).filter(Boolean));
    if (pots.length) out.push(pots.some((c) => c.grid.some((e) => !e.box && !isWater(e.id))) ? `the ${pots.length > 1 ? 'pots are' : 'pot is'} on the grate with food in ${pots.length > 1 ? 'them' : 'it'}` : `the ${pots.length > 1 ? 'pots are' : 'pot is'} on the grate`);
    return out;
  }
}
const no = (why, needs = [], next = '') => ({ enabled: false, why, needs: needs.filter(Boolean), next, run: () => ({ ok: false, words: why }) });
const go = (run, needs = [], next = '', label = null) => ({ enabled: true, why: null, needs: needs.filter(Boolean), next, ...(label ? { label } : {}), run });
const lower = (s) => String(s || '').charAt(0).toLowerCase() + String(s || '').slice(1);
const potName = (c) => { const d = itemDef(c && c.item); return d ? d.name : 'pot'; };
const litres = (l) => (l >= 0.95 ? `${(Math.round(l * 10) / 10).toFixed(1).replace(/\.0$/, '')} L` : `${Math.round(l * 100) * 10} mL`);
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
