// A bear at camp (the consequences pass, stream A; the owner, 2026-10-25: "a bear at camp if the food isn't hung … so
// the camp routines matter").
//
// The rule. At night, food that is not secured may bring a bear. Secured is hung from a good limb (hang.js secured: up,
// the rope tied off); a hung barrel is never visited. Not secured is food left in a pack, a barrel or a pile on the
// ground at camp, in the canoe lying there, on the grate (a cooked meal, a fish), or in the tent with you (the packs you
// sleep with on you). Food kept at an outfitter, or out on the water with you, is not at camp.
//
// The chance. Each night the camp has food out, about BEAR.chance, times the lake's bear activity (BEAR_LAKES: the lakes
// with a name for bears, where they have learned what a camp means; a keeper's word of a bear at a site, which content B's
// rumours pencil on the map, doubles it there), times the season (bears are out of their dens from late April to
// October), and halved on the first night ever (a warning, not a punishment). The night's die is seeded by the season and
// the night, so a reload never rolls it again; it also picks the hour the bear comes, one to four and a half hours after
// full dark, and how much it would take.
//
// The world shows it first: sound, sight, then the damage.
//   - Asleep (camp.sleep: the night card): the card's line is the visit (a woof outside, something heavy in the brush,
//     the barrel rolling over rock, nylon tearing), held longer while the sounds play in the dark (bearSounds). In the
//     morning the mess is there: the barrel knocked over and dragged a few metres into the brush, lid on, tooth holes in
//     it; or the pack torn open with wrappers scattered round it (the bear's litter, packed out with E on the dot). The
//     line saying what went shows once the mess is in view (or a few seconds on).
//   - Awake at camp when it comes (on foot within BEAR.hear of the food): it is heard first, crashing in from the woods
//     with a woof; in the headlamp its eyes shine (eyeshine: only toward a light near the eye, so only with the lamp on
//     and pointed its way), and the body shows dimly in the beam. On the dot it reads "E Make noise · a black bear":
//     yelling and banging the pot drive it off, and it has taken only what it got to (less the sooner). Walk up on it and
//     it runs the same way. Left alone it works at the food for BEAR.work seconds, then ambles off with its share.
//   - Away from camp when it comes: it raids quietly; the mess and the line wait for you to come back and see them.
// The loss: a third to a half of the food that was out (a barrel on the ground, lid held, less), taken by what a bear goes
// for first (the cooked food, the fish, the meals, the snacks), and never more than half of all the food with you, so a
// visit is never the whole season and never an evacuation by itself.
//
// Teaching (hints.js moments, pushed from main.js cons A): the first live visit, "A bear at the food. Face it and E to
// make noise."; the dusk after a visit, with food still out at camp, "Hang the food tonight." (hints.js's own "Bears: hang
// your food…" at dusk stays, and steps aside that evening).
//
//   import { bear } from './bear.js';
//   bear.attach({ camp, inventory, world, tiles, player, day, scene, audio, hud, lamp, outfitter, profile, invView, chase, camera })
//   camp.bear = bear                  camp.js asks bedtime({ x, z, from, to }) → { text, hold, onDark } | null at the
//                                     night card, and morning() → the morning's words | null at waking
//   bear.update(dt)                   each frame after the camp (main.js wraps camp.update): the awake watch, a visit
//                                     under way, the litter drawn, the morning's line
//   bear.afterPose()                  after containers.js (main.js wraps canoe.update): the knocked barrel on its side,
//                                     the torn pack on its back
//   bear.targets(ray, near)           a pointer provider: the bear (E Make noise), the litter (E Pack it out)
//   bear.moments(), bear.due(id, rec, next)   the moments and their triggers (main.js pushes and wraps)
//   bear.chanceAt(x, z), activityAt(x, z), exposed(x, z, { asleep }), stats()   (the console, the tests, tuning)
//   bear.test = { u, at, f }          the night's die forced (tests): u under the chance visits, at its hour (absolute
//                                     game hours, doy * 24 + hour), f the share
import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { itemDef, FOOD_KINDS } from './items.js';
import { save } from './save.js';
import { mulberry32 } from './rng.js';
import { env, grains } from './audio-kit.js';
import { PACKS } from './hull.js';

export const BEAR = {
  chance: 0.3,          // a night with food out, at a lake of ordinary bear activity
  first: 0.5,           // the first night ever: half of that (about 15 %)
  most: 0.6,            // never likelier than this
  take: [1 / 3, 1 / 2], // the share of the food left out a visit takes, undisturbed
  barrel: 0.7,          // a barrel on the ground holds its lid: what it ruins through the tooth holes is this much of that
  keep: 0.5,            // never more than this share of all the food with you goes
  reach: 60,            // m from your tent (or where you sleep) that food left out is the camp's
  hear: 90,             // m from the food within which you are there when it comes (else it raids quietly)
  from: 22,             // m out it comes in from, on the land side, away from you
  walk: 1.0, amble: 0.8, run: 4.5, // m/s
  work: 20,             // real seconds at the food, undisturbed, before it has its share
  scare: 4,             // m: come this close and it runs
  sight: 34,            // m within which the dot finds it
  hour: [1, 4.5],       // hours after full dark (an hour past sunset) the night's visit may come
};
// The lakes with a name for bears: the busy routes out of Ely and the Gunflint, where the rangers' warnings and the trip
// reports keep naming them. Everywhere else is 1.
export const BEAR_LAKES = {
  'Ensign Lake': 1.8, 'Vera Lake': 1.4, 'Basswood Lake': 1.5, 'Knife Lake': 1.4, 'South Arm Knife Lake': 1.4, 'Disappointment Lake': 1.3,
  'Snowbank Lake': 1.2, 'Newfound Lake': 1.3, 'Sucker Lake': 1.3, 'Moose Lake': 1.2, 'Lake Insula': 1.2, 'Lake One': 1.1, 'Lake Two': 1.1,
  'Sea Gull Lake': 1.3, 'Alpine Lake': 1.3, 'Red Rock Lake': 1.2, 'Saganaga Lake': 1.2, 'Sawbill Lake': 1.2, 'Alton Lake': 1.2,
};
const RUMOUR = 2.0, RUMOUR_R = 600; // a keeper's word of a bear at a site (outfitter.toldHints, kind 'bear'): that much, that near
const NS = 'bear';
const DANGER = 3, BODY = 2;          // hints.js priorities
const PREF = { food: 0, fish: 1, meal: 2, snack: 3, forage: 4 }; // what it goes for first (a cooked thing is kind 'food')
const RANK = { grate: 0, tent: 1, pile: 2, pack: 3, canoe: 3, stringer: 4, other: 5, barrel: 6 }; // the easiest smell first

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const lower = (s) => (/^(Duluth|Johnson|[A-Z]-)/.test(String(s)) ? String(s) : String(s).charAt(0).toLowerCase() + String(s).slice(1));
const listOf = (a) => (a.length <= 1 ? a[0] || '' : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const seedOf = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
// bears out of the den: late April to October
const seasonK = (doy) => Math.max(0.1, smooth(105, 125, doy) * (1 - smooth(290, 310, doy)));
const isFood = (e) => { if (!e || e.box) return false; const d = itemDef(e.id); return !!(d && FOOD_KINDS.includes(d.kind)); };
const perServing = (d) => Math.max(0.02, (d && d.eat && Number.isFinite(d.eat.food) ? d.eat.food : 0.08));
// what an entry is worth to eat: its servings left, all of its stack
function valueOf(e) {
  if (!isFood(e)) return 0;
  const d = itemDef(e.id), n = d.servings || 1, left = Number.isFinite(e.left) ? e.left : n;
  return perServing(d) * (left + n * Math.max(0, (e.qty || 1) - 1));
}
const thingName = (item) => ({ barrel30: 'small blue barrel', barrel60: 'big blue barrel' })[item] || (() => { const d = itemDef(item); const n = d ? d.name : 'pack'; return /^Blue barrel/.test(n) ? 'blue barrel' : lower(n.replace(/, \d+ L$/, '')); })(); // (hang.js's words)
const foodName = (d) => lower(String(d.name || d.id).replace(/, hot$/i, ''));

// --- the sounds ---------------------------------------------------------------------------------------------------------
// Each on audio-kit's Voice (the engine's running noises, oscillators, a panner placed in the world), as audio-voices.js
// builds the soundscape's; pos may carry `at` (seconds from now), and null is head-locked (your own yelling).
function nz(v, kind, type, f, Q = 0.7) { const b = v.filter(type, f, Q), g = v.gain(0); v.noise(kind, b); b.connect(g); g.connect(v.input); return [g, b]; }
function sends(au, pos, wet, echo) { if (!pos) return { wet, echo: 0 }; const d = au.distTo(pos); return { wet: wet + 0.25 * smooth(40, 400, d), echo: echo * (au.S ? au.S.open : 0.5) * smooth(30, 300, d) }; }
const opts = (au, pos, o) => (pos ? { x: pos.x, y: pos.y, z: pos.z, at: pos.at || 0, ...o } : { at: 0, ...o });
// the woof: a hard exhale through the nose and the chest, once or twice, then the jaw popped (two clacks)
function woof(au, pos, size = 1) {
  const s0 = sends(au, pos, 0.3, 0.4), v = au.voice(opts(au, pos, { gain: 0.85 * size, ref: 9, wet: s0.wet, echo: s0.echo, pri: 2 }));
  if (!v) return null;
  const R = au.rand, t = v.t, n = R() < 0.55 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const s = t + i * (0.34 + R() * 0.1);
    const [g, b] = nz(v, 'pink', 'bandpass', 480, 1.1); b.frequency.setValueAtTime(560 + R() * 80, s); b.frequency.exponentialRampToValueAtTime(240, s + 0.24); env(g.gain, s, 0.012, 1.0, 0.04, 0.24);
    const [gl] = nz(v, 'brown', 'lowpass', 210, 0.7); env(gl.gain, s, 0.01, 1.1, 0.03, 0.22);
    const o = v.osc('sawtooth', 100, s, s + 0.35), f = v.filter('lowpass', 380, 0.9), og = v.gain(0);
    v.chain(o, f, og); o.frequency.setValueAtTime(115, s); o.frequency.exponentialRampToValueAtTime(68, s + 0.22); env(og.gain, s, 0.02, 0.22, 0.04, 0.16);
  }
  const jaw = t + n * 0.42 + 0.18;
  for (const k of [0, 0.11]) { const [gc] = nz(v, 'white', 'bandpass', 1900, 2.5); env(gc.gain, jaw + k, 0.001, 0.9, 0, 0.03); }
  return v.until(jaw + 0.4);
}
// crashing in the brush: heavy steps, twigs snapping under them, the leaves dragged past
function brush(au, pos, size = 1, dur = 2.4) {
  const s0 = sends(au, pos, 0.25, 0.25), v = au.voice(opts(au, pos, { gain: 0.6 * size, ref: 8, wet: s0.wet, echo: s0.echo, pri: 2 }));
  if (!v) return null;
  const R = au.rand, t = v.t, [gr, br] = nz(v, 'pink', 'bandpass', 2300, 0.8), [gs] = nz(v, 'white', 'bandpass', 3200, 1.4), [gt] = nz(v, 'brown', 'lowpass', 240, 0.7);
  br.frequency.setValueAtTime(2300, t);
  let s = t;
  gr.gain.setValueAtTime(0, t); gs.gain.setValueAtTime(0, t); gt.gain.setValueAtTime(0, t);
  while (s < t + dur) {
    gt.gain.setTargetAtTime(0.9 + R() * 0.4, s, 0.004); gt.gain.setTargetAtTime(0, s + 0.03, 0.05);           // the step
    gr.gain.setTargetAtTime(0.35 + R() * 0.35, s, 0.05); gr.gain.setTargetAtTime(0.05, s + 0.18, 0.12);        // the leaves
    if (R() < 0.75) grains(gs.gain, s + 0.02 + R() * 0.12, 1 + Math.floor(R() * 3), 0.08, 0.8, 0.02, R);      // a twig
    s += 0.32 + R() * 0.28;
  }
  gr.gain.setTargetAtTime(0, s, 0.15);
  return v.until(s + 0.6);
}
// nosing through the food: snuffs, and the wrappers crinkling
function rummage(au, pos, size = 1) {
  const v = au.voice(opts(au, pos, { gain: 0.45 * size, ref: 5, wet: 0.15, echo: 0, pri: 1 }));
  if (!v) return null;
  const R = au.rand, t = v.t, [gn] = nz(v, 'pink', 'bandpass', 850, 1.5), [gc] = nz(v, 'white', 'highpass', 3600, 0.7);
  let s = t;
  for (let i = 0, n = 3 + Math.floor(R() * 3); i < n; i++) { env(gn.gain, s, 0.01, 0.8, 0.02, 0.07); s += 0.13 + R() * 0.06; }
  grains(gc.gain, t + 0.25, 28, 1.3, 0.5, 0.012, R);
  return v.until(t + 1.8);
}
// a barrel knocked over and rolled: a hollow plastic knock, then the rumble over rock, a knock at each turn
function barrelRoll(au, pos, size = 1) {
  const s0 = sends(au, pos, 0.2, 0.2), v = au.voice(opts(au, pos, { gain: 0.5 * size, ref: 8, wet: s0.wet, echo: s0.echo, pri: 2 }));
  if (!v) return null;
  const R = au.rand, t = v.t, k = 0.9 + R() * 0.2;
  const knockAt = (s, a) => {
    for (const [f, amp, d] of [[150, 0.9, 0.22], [330, 0.5, 0.14], [610, 0.25, 0.07]]) { const o = v.osc('sine', f * k, s, s + d + 0.05), g = v.gain(0); v.chain(o, g); env(g.gain, s, 0.002, amp * a, 0, d); }
    const [gc] = nz(v, 'white', 'bandpass', 900, 1); env(gc.gain, s, 0.001, 0.6 * a, 0, 0.025);
  };
  knockAt(t, 1);
  const [gr] = nz(v, 'brown', 'lowpass', 320, 0.8);
  gr.gain.setValueAtTime(0, t); gr.gain.setTargetAtTime(0.7, t + 0.1, 0.1); gr.gain.setTargetAtTime(0, t + 1.5, 0.25);
  for (let s = t + 0.35; s < t + 1.6; s += 0.24 + R() * 0.12) knockAt(s, 0.35 + R() * 0.35);
  return v.until(t + 2.4);
}
// a pack torn open: nylon ripping, twice
function tear(au, pos, size = 1) {
  const v = au.voice(opts(au, pos, { gain: 0.5 * size, ref: 6, wet: 0.15, echo: 0, pri: 1 }));
  if (!v) return null;
  const R = au.rand, t = v.t;
  for (const s of [t, t + 0.55 + R() * 0.25]) { const [g, b] = nz(v, 'white', 'bandpass', 1700, 0.7); b.frequency.setValueAtTime(1300, s); b.frequency.linearRampToValueAtTime(2600, s + 0.35); grains(g.gain, s, 40, 0.38, 0.7, 0.008, R); }
  return v.until(t + 1.4);
}
// you: yelling and banging the pot (head-locked): a few hard metal clangs, and a shout through two formants ("hey!")
function yell(au) {
  const v = au.voice({ gain: 0.5, local: true, wet: 0.25, echo: 0, pri: 3 });
  if (!v) return null;
  const R = au.rand, t = v.t;
  for (let i = 0; i < 3; i++) {
    const s = t + 0.05 + i * (0.24 + R() * 0.06);
    for (const [f, amp, d] of [[523, 0.6, 0.55], [1347, 0.45, 0.35], [2287, 0.3, 0.25], [3411, 0.18, 0.15]]) { const o = v.osc('sine', f * (0.98 + R() * 0.04), s, s + d + 0.05), g = v.gain(0); v.chain(o, g); env(g.gain, s, 0.001, amp, 0, d); }
    const [gc] = nz(v, 'white', 'highpass', 2500, 0.7); env(gc.gain, s, 0.001, 0.7, 0, 0.03);
  }
  const s = t + 0.85, o = v.osc('sawtooth', 170, s, s + 0.55), f1 = v.filter('bandpass', 720, 6), f2 = v.filter('bandpass', 1650, 7), g = v.gain(0), g2 = v.gain(0.6);
  o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g2); g2.connect(g); g.connect(v.input);
  o.frequency.setValueAtTime(165, s); o.frequency.linearRampToValueAtTime(205, s + 0.12); o.frequency.linearRampToValueAtTime(150, s + 0.45);
  f2.frequency.setValueAtTime(1500, s); f2.frequency.linearRampToValueAtTime(2100, s + 0.3);
  env(g.gain, s, 0.04, 1.6, 0.25, 0.18);
  const [gh] = nz(v, 'white', 'bandpass', 1800, 0.8); env(gh.gain, s - 0.04, 0.02, 0.25, 0.02, 0.06);
  return v.until(s + 0.7);
}
const SOUNDS = { 'bear-woof': [500, woof], 'bear-brush': [160, brush], 'bear-rummage': [60, rummage], 'barrel-roll': [220, barrelRoll], 'pack-tear': [90, tear] };

// --- the animal ---------------------------------------------------------------------------------------------------------
// A black bear, low-poly on the props' one material (no new program): a deep body with the shoulder hump, the head on its
// own (it drops to sniff and comes up to look), four legs that swing at the shoulder and the hip, the tan muzzle and the
// ears. About 1.5 m long, 0.9 m at the shoulder. The eyes are two small beads on a light additive material, lit only by
// eyeshine (eyesFor). Built in its own frame: +x the nose, y up, the ground at y 0.
function bearGeometries() {
  const fur = C(0x1d1a17), furDark = C(0x161412), muzzle = C(0x76593e), nose = C(0x121010), pad = C(0x2a2420);
  const body = new PropBuilder();
  const spine = [V(-0.64, 0.56, 0), V(-0.42, 0.6, 0), V(-0.08, 0.6, 0), V(0.24, 0.64, 0), V(0.46, 0.62, 0), V(0.62, 0.58, 0)];
  body.tube(spine, (t) => 0.2 + 0.11 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 0.03 * Math.exp(-((t - 0.72) ** 2) / 0.01), 9, TILE.PLAIN, fur, { cap0: true, cap1: true });
  body.cyl(V(-0.64, 0.6, 0), V(-0.74, 0.55, 0), 0.05, 0.02, 5, TILE.PLAIN, furDark, { cap1: true, capTile: TILE.PLAIN });
  const bg = body.build(); bg.scale(1, 1, 0.84); bg.computeBoundingSphere();
  const head = new PropBuilder();
  head.tube([V(-0.06, 0, 0), V(0.06, 0.02, 0), V(0.18, 0, 0)], (t) => 0.15 - 0.035 * t, 8, TILE.PLAIN, fur, { cap0: true, cap1: true });
  head.cyl(V(0.15, -0.03, 0), V(0.34, -0.09, 0), 0.085, 0.052, 7, TILE.PLAIN, muzzle, { cap1: true, capTile: TILE.PLAIN, capCol: nose });
  for (const s of [-1, 1]) head.cyl(V(0.02, 0.1, s * 0.085), V(0.0, 0.19, s * 0.11), 0.048, 0.028, 5, TILE.PLAIN, furDark, { cap1: true, capTile: TILE.PLAIN });
  const hg = head.build(); hg.computeBoundingSphere();
  const leg = new PropBuilder(), X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  leg.cyl(V(0, 0.05, 0), V(0, -0.47, 0), 0.105, 0.075, 6, TILE.PLAIN, fur, { capTile: TILE.PLAIN });
  leg.box(V(0.035, -0.5, 0), X, Y, Z, 0.085, 0.032, 0.068, TILE.PLAIN, pad);
  const lg = leg.build(); lg.computeBoundingSphere();
  return { body: bg, head: hg, leg: lg };
}
const LEGS = [[0.38, 0.52, 0.15, 0], [0.38, 0.52, -0.15, Math.PI], [-0.42, 0.52, 0.15, Math.PI], [-0.42, 0.52, -0.15, 0]]; // shoulder/hip (x, y, z), gait phase
const NECK = V(0.6, 0.62, 0), EYES = [V(0.2, 0.05, 0.062), V(0.2, 0.05, -0.062)]; // (on the front of the skull, above the muzzle)

// --- the litter --------------------------------------------------------------------------------------------------------
// What a bear leaves: torn meal pouches (foil, a label on one side), wrappers, a chewed bag, a scatter of oats, shreds of
// the pack's canvas. Each added to one builder at (x, z) about the mess's origin, turned by rot, on the ground at gy.
const LITTER = {
  pouch: { label: 'a torn meal pouch' }, wrapper: { label: 'a wrapper' }, bag: { label: 'a chewed food bag' },
  oats: { label: 'spilled oats' }, shred: { label: 'a shred of the pack' },
};
// n: the ground's normal there (the bit lies on the slope); read from a standing eye, a pouch is a hand and a half long
function addLitter(b, kind, x, y, z, rot, rng, n = V(0, 1, 0)) {
  const S = 1.5, t1 = V(Math.cos(rot), 0, Math.sin(rot)), t2 = V();
  t1.addScaledVector(n, -t1.dot(n)).normalize(); t2.crossVectors(n, t1).normalize();
  const P = (u, h, w) => V(x + (t1.x * u + t2.x * w) * S + n.x * h, y + (t1.y * u + t2.y * w) * S + n.y * h, z + (t1.z * u + t2.z * w) * S + n.z * h), up = V(x - n.x, y - n.y, z - n.z);
  if (kind === 'pouch') {
    const silver = C(0xd2d3ce), label = C(0xc65a26);
    b.face([P(-0.09, 0.012, -0.06), P(0.08, 0.016, -0.065), P(0.1, 0.02, 0.055), P(-0.07, 0.014, 0.065)], TILE.METAL, silver, { ref: up });
    b.face([P(-0.05, 0.022, -0.035), P(0.04, 0.024, -0.04), P(0.05, 0.026, 0.03), P(-0.04, 0.023, 0.035)], TILE.PAINT, label, { ref: up });
    b.face([P(0.08, 0.016, -0.065), P(0.15, 0.04, -0.02), P(0.1, 0.02, 0.055)], TILE.METAL, silver.clone().offsetHSL(0, 0, -0.08), { ref: up }); // the torn top, bent up
  } else if (kind === 'wrapper') {
    const col = rng() < 0.5 ? C(0xd4ad36) : C(0xa8382b);
    b.face([P(-0.05, 0.008, -0.03), P(0.04, 0.02, -0.04), P(0.055, 0.01, 0.03), P(-0.03, 0.022, 0.04)], TILE.PAINT, col, { ref: up });
    b.face([P(0.04, 0.02, -0.04), P(0.08, 0.008, -0.01), P(0.055, 0.01, 0.03)], TILE.PAINT, col.clone().offsetHSL(0, 0, -0.1), { ref: up });
  } else if (kind === 'bag') {
    const white = C(0xd9d8cf);
    const pts = []; for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, r = 0.09 + rng() * 0.07; pts.push(P(Math.cos(a) * r, 0.01 + rng() * 0.05, Math.sin(a) * r * 0.7)); }
    const mid = P(0, 0.06, 0);
    for (let i = 0; i < pts.length; i++) b.face([mid, pts[i], pts[(i + 1) % pts.length]], TILE.CANVAS, i % 2 ? white : white.clone().offsetHSL(0, 0, -0.07), { ref: up });
  } else if (kind === 'oats') {
    const oat = C(0xd6c69c);
    for (let i = 0; i < 14; i++) { const u = (rng() - 0.5) * 0.5, w = (rng() - 0.5) * 0.35, q = 0.012 + rng() * 0.01; b.face([P(u - q, 0.006, w - q * 0.6), P(u + q, 0.006, w - q * 0.4), P(u, 0.006, w + q)], TILE.PLAIN, oat, { ref: up }); }
  } else {
    const canvas = C(0x7a6f4d);
    for (let i = 0; i < 2; i++) { const o = (i - 0.5) * 0.08; b.face([P(-0.12, 0.01, o - 0.012), P(0.1, 0.014, o - 0.02), P(0.12, 0.012, o + 0.012), P(-0.1, 0.008, o + 0.02)], TILE.CANVAS, canvas.clone().offsetHSL(0, 0, i ? -0.05 : 0), { ref: up }); }
  }
}

// --- the words ---------------------------------------------------------------------------------------------------------
// the night card (asleep), by what it went for
const CARD = {
  barrel: 'Past midnight, a woof outside, and something heavy in the brush. Then the barrel, rolling over rock.',
  pack: 'Past midnight, a woof outside, and something heavy in the brush. Then nylon tearing, and wrappers.',
  canoe: 'Past midnight, a woof down by the canoe, and something heavy in the brush. Then nylon tearing.',
  tent: 'Past midnight, a woof right by the door, and the tent shaking. Something drags your pack off into the dark.',
  tentHand: 'Past midnight, a woof right by the door, and the tent shaking. Something noses in at the door and is gone with what you had by you.', // (the join: food in a hand or a pocket, no pack to drag)
  grate: 'Past midnight, a woof outside, and the grate rattling on its stones.',
  pile: 'Past midnight, a woof outside, and something heavy in the brush, nosing through the food.',
  stringer: 'Past midnight, a woof down at the water, and something heavy in the brush.',
  other: 'Past midnight, a woof outside, and something heavy in the brush, nosing through the camp.',
};

class Bear {
  constructor() {
    this.attached = false;
    this.s = null;            // the saved state (load())
    this.visit = null;        // a live visit under way
    this.tonight = null;      // a visit decided at bedtime, applied at waking: { N, here }
    this.note = null;         // the morning's line waiting to be seen: { text, x, z, t, max }
    this.realT = 0;
    this.test = null;         // { u, at, f } (tests)
    this.ver = 0; this.drawnVer = -1;
    this.targets = (ray, near) => this.pointed(ray, near);
  }
  attach(o = {}) {
    Object.assign(this, { camp: null, inventory: null, world: null, tiles: null, player: null, day: null, scene: null, audio: null, hud: null, lamp: null, outfitter: null, profile: null, invView: null, chase: null, camera: null }, o);
    this.attached = true;
    this.load();
    this.build();
    return this;
  }
  get inv() { const i = this.inventory; return i && i.attached ? i : null; }
  get live() { const c = this.camp; return !!(this.attached && c && c.adventure && this.inv); }
  get nowAbs() { const d = this.day; return d.doy * 24 + d.hours; }
  get season() { const p = this.profile; return p && p.seasonId ? p.seasonId : 'none'; }

  // --- the save --------------------------------------------------------------------------------------------------------
  // { v, season, nights (all-time: nights out at a camp), visits (all-time), night: { key, kind } (the night last
  // resolved), last: { y, d } (the night of the last visit), mess: [{ k, x, z, rot }] }. A new season keeps the all-time
  // counts and clears the rest.
  load() {
    const s = save.read(NS);
    const fresh = { v: 1, season: this.season, nights: 0, visits: 0, night: null, last: null, mess: [] };
    if (!s || s.v !== 1) { this.s = fresh; return; }
    this.s = { ...fresh, nights: s.nights | 0, visits: s.visits | 0 };
    if (s.season === this.season) Object.assign(this.s, { night: s.night || null, last: s.last || null, mess: Array.isArray(s.mess) ? s.mess.slice(0, 40) : [] });
    this.ver++;
  }
  write() { save.write(NS, this.s); }
  // a new season under way (profile.seasonId changed): the night and the mess start again
  seasonCheck() {
    if (this.s.season === this.season) return;
    this.s = { v: 1, season: this.season, nights: this.s.nights, visits: this.s.visits, night: null, last: null, mess: [] };
    this.ver++; this.write();
  }

  // --- the night's die ---------------------------------------------------------------------------------------------------
  // the night we are in (the evening's day: before noon it is last night's), its die and its hour
  nightAt(doy = this.day.doy, hours = this.day.hours, year = this.day.year) {
    const nd = hours < 12 ? doy - 1 : doy, key = `${year}:${nd}`;
    if (this._n && this._n.key === key && this._n.season === this.season && this._n.test === this.test) return this._n;
    const r = mulberry32(seedOf(`${this.season}:${key}:bear`));
    const u = r(), a = r(), f = r(), ss = this.day.sunriseSunset || {}, dark = (ss.set ?? 20.5) + 1;
    const N = { key, y: year, d: nd, season: this.season, u, f, at: nd * 24 + dark + BEAR.hour[0] + a * (BEAR.hour[1] - BEAR.hour[0]), test: this.test };
    if (this.test) { if (Number.isFinite(this.test.u)) N.u = this.test.u; if (Number.isFinite(this.test.at)) N.at = this.test.at; if (Number.isFinite(this.test.f)) N.f = this.test.f; }
    return (this._n = N);
  }
  resolved(N) { return !!(this.s.night && this.s.night.key === N.key); }
  resolve(N, kind, counted) {
    this.s.night = { key: N.key, kind };
    if (counted) this.s.nights++;
    if (kind === 'card' || kind === 'live' || kind === 'raid') { this.s.visits++; this.s.last = { y: N.y, d: N.d }; }
    this.write();
  }
  // the lake's bear activity at (x, z): { k, lake, rumour }
  activityAt(x, z) {
    const w = this.world, p = this.player;
    let lake = null;
    try { const id = p && p.nearWater ? p.nearWater(x, z, 30) : 0; lake = id ? w.lakeName(id) : null; } catch { lake = null; }
    let k = (lake && BEAR_LAKES[lake]) || 1, rumour = null;
    const o = this.outfitter;
    try {
      const told = o && typeof o.toldHints === 'function' ? o.toldHints() : [];
      rumour = told.find((h) => h && h.kind === 'bear' && Number.isFinite(h.x) && Math.hypot(h.x - x, h.z - z) < RUMOUR_R) || null;
    } catch { rumour = null; }
    if (rumour) k = Math.max(k, RUMOUR);
    return { k, lake, rumour: rumour ? rumour.by || 'a keeper' : null };
  }
  chanceAt(x, z) {
    const a = this.activityAt(x, z);
    let p = BEAR.chance * a.k * seasonK(this.day.doy);
    if (!this.s.nights) p *= BEAR.first;
    return Math.min(BEAR.most, p);
  }

  // --- what is out ------------------------------------------------------------------------------------------------------
  // hung from a good limb (hang.js), never visited
  secured(k) {
    const h = this.camp && this.camp.hang;
    if (h && typeof h.secured === 'function') return h.secured(k);
    return k.where === 'hung' && !!k.at && k.at.up !== false;
  }
  // the camp you are at: your tent (pitched), else the site's area you stand in: { x, z, key } or null
  campHere(x = null, z = null) {
    const c = this.camp, t = c && c.camp;
    if (t && t.stage >= 1) return { x: t.x, z: t.z, key: t.key || null, tent: true };
    const a = c && typeof c.reachArea === 'function' ? c.reachArea() : null;
    if (a) return { x: a.x, z: a.z, key: a.key || null, tent: false };
    return Number.isFinite(x) ? { x, z, key: null, tent: false } : null;
  }
  // The food not secured within BEAR.reach of (x, z), grouped by the thing it is in at the root (a pack lying there, the
  // barrel, the grate, the canoe's load, what you carry when asleep: 'tent'):
  //   [{ k (the root container), kind, at ({ x, z } where it is), items: [{ c, e }], value }]
  exposed(x, z, { asleep = false, r = BEAR.reach } = {}) {
    const inv = this.inv; if (!inv) return [];
    const s = inv.canoeSpot ? inv.canoeSpot() : null;
    const canoe = s && !s.afloat && !s.overhead && !s.capsized && Math.hypot(s.x - x, s.z - z) <= r ? s : null;
    const tent = this.camp && this.camp.camp ? this.camp.camp : null;
    const groups = new Map();
    for (const c of inv.containers) {
      if (c.item === 'crate') continue;
      const items = c.grid.filter(isFood).map((e) => ({ c, e }));
      if (!items.length) continue;
      const k = inv.root(c);
      if (this.secured(k)) continue;
      let kind = null, at = null;
      const d = k.at ? Math.hypot(k.at.x - x, k.at.z - z) : Infinity;
      if (k.where === 'ground' && d <= r) { at = k.at; kind = k.item === 'grate' ? 'grate' : /^barrel/.test(k.item) ? 'barrel' : k.item === 'pile' ? 'pile' : k.item === 'stringer' ? 'stringer' : /pack/.test(k.item) ? 'pack' : 'other'; }
      else if (k.where === 'hung' && d <= r) { at = k.at; kind = 'barrel'; } // tied on at the rope's foot, never hoisted
      else if (k.where === 'canoe' && canoe) { at = canoe; kind = 'canoe'; }
      else if (asleep && (k.where === 'back' || k.where === 'chest' || k.where === 'hands' || k.where === 'pockets')) { at = tent || { x, z }; kind = 'tent'; }
      if (!kind) continue;
      let g = groups.get(k.id);
      if (!g) groups.set(k.id, (g = { k, kind, at, items: [], value: 0 }));
      for (const it of items) { g.items.push(it); g.value += valueOf(it.e); }
    }
    return [...groups.values()].filter((g) => g.value > 0).sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.value - a.value);
  }
  // all the food with you in the wild (not the outfitters' keeping): what "never the whole season" is a share of
  allFood() {
    const inv = this.inv; if (!inv) return 0;
    let v = 0;
    for (const c of inv.containers) { if (c.item === 'crate' || inv.root(c).where === 'stash') continue; for (const e of c.grid) v += valueOf(e); }
    return v;
  }

  // --- the loss ---------------------------------------------------------------------------------------------------------
  // Take share `frac` of the food in `groups` (in order: the one it went for first), a barrel's lid holding some back,
  // never past BEAR.keep of all the food with you. min: when the share comes to less than a serving, a serving anyway
  // (unless it is the last of your food). → [{ id, name, whole, n }]
  take(groups, frac, { min = true } = {}) {
    const inv = this.inv, lost = new Map();
    if (!inv || !groups.length || !(frac > 0)) return [];
    const all = this.allFood(), wk = (g) => g.value * (g.kind === 'barrel' ? BEAR.barrel : 1);
    const most = BEAR.keep * all + 1e-6; // (a hard cap: a whole meal that would pass it is left, a serving of something else taken)
    const budget = Math.min(frac * groups.reduce((s, g) => s + wk(g), 0), most);
    const noteLost = (d, whole) => { const r = lost.get(d.id) || { id: d.id, name: foodName(d), whole: 0, some: false, n: d.servings || 1 }; if (whole) r.whole++; else r.some = true; lost.set(d.id, r); };
    const takeOne = (c, e) => {
      const d = itemDef(e.id), n = d.servings || 1;
      if (n > 1) {
        const left = Number.isFinite(e.left) ? e.left : n;
        if (left > 1) { e.left = left - 1; noteLost(d, false); return perServing(d); }
        if (e.qty > 1) { e.qty -= 1; delete e.left; noteLost(d, true); return perServing(d); }
      }
      if (!inv.take(c.id, e.uid, 1)) return 0;
      noteLost(d, true);
      return perServing(d);
    };
    const pref = (a, b) => ((PREF[(itemDef(a.e.id) || {}).kind] ?? 9) - (PREF[(itemDef(b.e.id) || {}).kind] ?? 9));
    let got = 0;
    for (const g of groups) {
      const items = g.items.slice().sort(pref);
      for (const { c, e } of items) {
        const d = itemDef(e.id), per = perServing(d);
        let guard = 0;
        while (got + per * 0.5 < budget && got + per <= most && c.grid.includes(e) && guard++ < 40) { const t = takeOne(c, e); if (!t) break; got += t; }
        if (got + 0.01 >= budget) break;
      }
      if (got + 0.01 >= budget) break;
    }
    if (!lost.size && min) {
      const first = groups.flatMap((g) => g.items).sort(pref).find((it) => perServing(itemDef(it.e.id)) <= most);
      if (first) takeOne(first.c, first.e);
    }
    if (lost.size) inv.emit('items');
    return [...lost.values()];
  }
  lostWords(lost) {
    const inv = this.inv;
    const parts = lost.map((r) => {
      // a thing eaten by the serving (trail mix, jerky): all of it, or some of it
      if (r.n > 1) { let left = 0; try { left = inv ? inv.count(r.id, { reachable: false }) : 0; } catch { left = 0; } return left > 0 ? `some of the ${r.name}` : `the ${r.name}`; }
      if (r.whole <= 1) return `the ${r.name}`;
      return `${WORDS[r.whole] || r.whole} ${/s$/.test(r.name) ? r.name : `${r.name}s`}`;
    });
    if (!parts.length) return 'It got nothing.';
    const many = parts.length > 1 || /^(two|three|four|five|six|seven|eight|nine|ten|\d)/.test(parts[0]) || /s$/.test(parts[0]); // ("the rice and lentils are", "the trail mix is")
    return `${cap(listOf(parts))} ${many ? 'are' : 'is'} gone.`;
  }

  // --- the mess ---------------------------------------------------------------------------------------------------------
  // a spot on dry land near (x, z) between r0 and r1 metres, away from the water if it can, clear of trunks
  spotNear(x, z, r0, r1, rng, away = null) {
    const w = this.world, T = this.tiles;
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = away && i < 12 ? Math.atan2(away.z, away.x) + (rng() - 0.5) * 1.6 : rng() * Math.PI * 2, d = r0 + rng() * (r1 - r0);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!w.isReady(px, pz)) continue;
      const sh = w.shoreAt(px, pz);
      if (!(sh > 1.2)) continue;
      if (T && T.treesNear && T.treesNear(px, pz, 0.45).length) continue;
      const score = sh + rng();
      if (!best || score > best.score) best = { x: px, z: pz, score };
      if (i > 6 && best) break;
    }
    return best;
  }
  inland(x, z) { const w = this.world; try { const d = w.deeperDir(x, z); return { x: -d.x, z: -d.z }; } catch { return null; } }
  litterAt(x, z, n, rng, kinds) {
    for (let i = 0; i < n; i++) {
      const sp = this.spotNear(x, z, 0.4, 2.8, rng);
      if (!sp) continue;
      this.s.mess.push({ k: kinds[i % kinds.length], x: Math.round(sp.x * 100) / 100, z: Math.round(sp.z * 100) / 100, rot: +(rng() * 6.28).toFixed(2) });
    }
    if (this.s.mess.length > 40) this.s.mess.splice(0, this.s.mess.length - 40);
    this.ver++;
  }
  // the visit's mess at group g: the barrel knocked over and dragged, a pack torn (dragged out of the canoe or the tent),
  // wrappers about the pile or the grate. → the morning's words for it
  mess(g, rng, { far = true } = {}) {
    const inv = this.inv, k = g.k, name = thingName(k.item), barrel = /^barrel/.test(k.item), at = g.at || { x: this.player.x, z: this.player.z };
    const toward = this.inland(at.x, at.z);
    const putAt = (sp, flag) => {
      if (k.where === 'ground' || k.where === 'hung') { k.where = 'ground'; k.at = { ...(k.at || {}), x: sp.x, z: sp.z, y: this.tiles.groundAt(sp.x, sp.z), heading: rng() * 6.28 }; delete k.at.up; delete k.at.tree; delete k.at.limb; }
      else if (k.item !== 'pockets') inv.setDown(k.id, { x: sp.x, z: sp.z, heading: rng() * 6.28 }, { left: false, force: true, quiet: true });
      if (k.where === 'ground' && k.at) { k.at[flag] = true; k.at.bear = true; }
      inv.emit('ground');
    };
    if (g.kind === 'grate') { this.litterAt(at.x, at.z, 2, rng, ['pouch', 'wrapper']); return 'The grate is licked clean.'; }
    if (g.kind === 'pile') { this.litterAt(at.x, at.z, 4, rng, ['wrapper', 'bag', 'oats', 'pouch']); return 'The food left on the ground is scattered and chewed.'; }
    if (g.kind === 'stringer') return 'The stringer lies empty on the rocks.';
    // (the join: fish on a stringer in the canoe, or a fish held into the tent, leave no wrappers)
    const fishOnly = g.items.length && g.items.every(({ e }) => (itemDef(e.id) || {}).kind === 'fish');
    if (fishOnly && k.item === 'stringer') return 'The stringer hangs empty over the gunwale.';
    if (fishOnly && !barrel && !/pack/.test(k.item)) return g.kind === 'tent' ? 'Fish scales and slime at the tent door.' : `Fish scales about the ${name}.`;
    if (!barrel && !/pack/.test(k.item)) { this.litterAt(at.x, at.z, 2, rng, ['wrapper', 'bag']); return g.kind === 'tent' ? 'Wrappers outside the tent door, chewed.' : `Wrappers about the ${name}, chewed.`; }
    if (barrel) {
      const sp = (far ? this.spotNear(at.x, at.z, 2.5, 5, rng, toward) : this.spotNear(at.x, at.z, 0.6, 1.6, rng, toward)) || { x: at.x, z: at.z };
      putAt(sp, 'knocked');
      const d = Math.round(Math.hypot(sp.x - at.x, sp.z - at.z));
      return `The ${name} lies on its side ${d >= 2 ? `${WORDS[d] || d} metres off ` : ''}in the brush, the lid still on, tooth holes through it.`;
    }
    const sp = this.spotNear(at.x, at.z, g.kind === 'tent' ? 3 : g.kind === 'canoe' ? 2 : 0.5, g.kind === 'tent' ? 6 : g.kind === 'canoe' ? 3.5 : 1.6, rng, toward) || { x: at.x + 1, z: at.z };
    putAt(sp, 'torn');
    this.litterAt(sp.x, sp.z, 5, rng, ['shred', 'pouch', 'wrapper', 'bag', 'oats']);
    const the = `The ${name}`;
    if (g.kind === 'tent') return `${the} was dragged out of the tent and torn open, wrappers all round it.`;
    if (g.kind === 'canoe') return `${the} was dragged out of the canoe and torn open, wrappers all round it.`;
    return `${the} lies torn open, wrappers all round it.`;
  }
  // a whole raid (asleep, or away): every group got into, the loss shared out. → { words, lost, x, z }
  raid(groups, N, { frac = null, main = null } = {}) {
    const rng = mulberry32(seedOf(`${N.key}:mess`));
    const share = frac ?? (BEAR.take[0] + N.f * (BEAR.take[1] - BEAR.take[0]));
    const order = main ? [main, ...groups.filter((g) => g !== main)] : groups;
    const left = (g) => g.items.reduce((s, it) => s + (it.c.grid.includes(it.e) ? valueOf(it.e) : 0), 0);
    const before = order.map(left);
    const lost = this.take(order, share);
    const lines = [], first = order[0];
    // the mess where it went: the first thing it went for, and whatever else it got into
    order.forEach((g, i) => { if ((i === 0 || left(g) < before[i] - 1e-6) && lines.length < 3) lines.push(this.mess(g, rng)); });
    const words = `A bear was into the food in the night. ${lines.join(' ')} ${this.lostWords(lost)}`;
    const at = first.k.where === 'ground' && first.k.at ? first.k.at : first.at || { x: this.player.x, z: this.player.z };
    this.log({ how: 'raid', kinds: order.map((g) => g.kind), lost: lost.map((r) => r.id) });
    return { words, lost, x: at.x, z: at.z };
  }
  log(data) { if (this.camp && this.camp.log) this.camp.log('bear', data); }

  // --- asleep: the night card (camp.sleep) and the morning (camp.wake) ----------------------------------------------------
  // At bedtime, for a night's sleep (not a nap) from abs hour `from` to `to` at (x, z): the visit decided now, if the
  // night's hour falls in the sleep and food is out. → { text, hold, onDark } for the card, or null
  bedtime({ x, z, from = this.nowAbs, to = this.nowAbs + 8 } = {}) {
    if (!this.live) return null;
    this.seasonCheck();
    if (this.visit) this.endVisit();
    const N = this.nightAt();
    if (this.resolved(N) || N.at < from - 1e-6 || N.at > to + 1e-6) return null;
    const here = this.campHere(x, z);
    const groups = this.exposed(here.x, here.z, { asleep: true });
    if (!groups.length) { this.resolve(N, 'safe', true); return null; }
    if (N.u >= this.chanceAt(here.x, here.z)) { this.resolve(N, 'none', true); return null; }
    this.resolve(N, 'card', true);
    const main = groups[0];
    this.tonight = { N, here, kind: main.kind };
    const at = main.at || here, h = N.at - N.d * 24;
    const card = main.kind === 'tent' && !/pack|barrel/.test(main.k.item) ? 'tentHand' : main.kind;
    const text = (CARD[card] || CARD.other).replace(/^Past midnight/, h < 23.75 ? 'Late in the night' : h < 24.25 ? 'Around midnight' : 'Past midnight');
    return { text, hold: 6.5, onDark: () => this.nightSounds(main.kind, at) };
  }
  // in the dark of the card: the woof, the brush, then what it got into, then the woof going away
  nightSounds(kind, at) {
    const y = this.tiles ? this.tiles.groundAt(at.x, at.z) + 0.6 : 0;
    const P = (dt, dx = 0, dz = 0) => ({ x: at.x + dx, y, z: at.z + dz, at: dt });
    this.play('bear-brush', P(0.2, 6, 4), 0.9, 2.6);
    this.play('bear-woof', P(1.4, 3, 2), 1);
    if (kind === 'barrel') this.play('barrel-roll', P(2.6), 1);
    else if (kind === 'pack' || kind === 'canoe' || kind === 'tent') this.play('pack-tear', P(2.6), 1);
    this.play('bear-rummage', P(3.6), 1);
    this.play('bear-woof', P(5.0, -4, 5), 0.8);
  }
  // At waking (camp.wake, after the clock's jump): the visit decided at bedtime, done. → the morning's words, or null
  // (the bear shows them itself once the mess is in view: the line waits in this.note)
  morning() {
    const T = this.tonight; if (!T) return null;
    this.tonight = null;
    const groups = this.exposed(T.here.x, T.here.z, { asleep: true });
    if (!groups.length) return null;
    const r = this.raid(groups, T.N);
    this.note = { text: r.words, x: r.x, z: r.z, t: null, max: 8 };
    return r.words;
  }

  // --- awake: the night's hour comes ----------------------------------------------------------------------------------------
  watch() {
    const c = this.camp, p = this.player;
    if (c.night || (c.veil && c.veil.active) || this.visit || p.teleporting) return;
    const N = this.nightAt();
    if (this.resolved(N) || this.nowAbs < N.at) return;
    if (this.nowAbs > N.at + 6) { this.resolve(N, 'late', false); return; } // (a save picked up long after: let it be)
    const here = this.campHere();
    if (!here) { this.resolve(N, 'away', false); return; }
    const groups = this.exposed(here.x, here.z, { asleep: false });
    if (!groups.length) { this.resolve(N, 'safe', true); return; }
    if (N.u >= this.chanceAt(here.x, here.z)) { this.resolve(N, 'none', true); return; }
    const main = groups[0], at = main.at || here;
    const there = p.onFoot && Math.hypot(p.x - at.x, p.z - at.z) <= BEAR.hear;
    this.resolve(N, there ? 'live' : 'raid', true);
    if (there) this.startVisit(main, groups, at, N);
    else { const r = this.raid(groups, N); this.note = { text: r.words.replace('in the night', 'while you were away'), x: r.x, z: r.z, t: null, max: Infinity }; }
  }

  // --- a live visit ------------------------------------------------------------------------------------------------------
  // in from the woods on the land side, away from you, to the food: 'come' → 'work' (BEAR.work s at it) → 'leave'; or
  // 'flee' at a noise or when walked up on
  startVisit(main, groups, at, N) {
    const p = this.player, rng = mulberry32(seedOf(`${N.key}:visit`)), inl = this.inland(at.x, at.z) || { x: 1, z: 0 };
    let best = null;
    for (let i = 0; i < 20; i++) {
      const a = Math.atan2(inl.z, inl.x) + (rng() - 0.5) * 2.2, x = at.x + Math.cos(a) * BEAR.from, z = at.z + Math.sin(a) * BEAR.from;
      if (!this.world.isReady(x, z) || !(this.world.shoreAt(x, z) > 3)) continue;
      const sc = Math.hypot(x - p.x, z - p.z) + rng() * 4;
      if (!best || sc > best.sc) best = { x, z, sc };
    }
    const S = best || { x: at.x + inl.x * BEAR.from, z: at.z + inl.z * BEAR.from };
    const dx = at.x - S.x, dz = at.z - S.z, L = Math.hypot(dx, dz) || 1;
    const stop = Math.min(1.1, L * 0.5);
    this.visit = { state: 'come', t: 0, workT: 0, x: S.x, z: S.z, h: Math.atan2(-dz, dx), tx: at.x - (dx / L) * stop, tz: at.z - (dz / L) * stop, fx: at.x, fz: at.z, ex: S.x, ez: S.z, gait: 0, look: 0, sndT: 0, woofed: false, knocked: false, main: main.k.id, groupIds: groups.map((g) => g.k.id), N, kind: main.kind, done: false, said: false, head: 0, headYaw: 0 };
    this.play('bear-brush', this.at3(S.x, S.z), 1, 2.8);
    this.log({ how: 'live', kind: main.kind });
  }
  at3(x, z, dt = 0) { return { x, y: (this.tiles ? this.tiles.groundAt(x, z) : 0) + 0.6, z, at: dt }; }
  stepVisit(dt) {
    const v = this.visit; if (!v) return;
    const p = this.player;
    v.t += dt; v.sndT -= dt;
    const goTo = (tx, tz, speed) => {
      const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
      if (d < 0.05) return 0;
      const want = Math.atan2(-dz, dx); let e = want - v.h; e = Math.atan2(Math.sin(e), Math.cos(e));
      v.h += clamp(e, -2.5 * dt, 2.5 * dt);
      const k = Math.min(d, speed * dt * clamp(1 - Math.abs(e) / 2, 0.25, 1));
      v.x += Math.cos(v.h) * k; v.z -= Math.sin(v.h) * k; v.gait += k * 3.2;
      return d;
    };
    const dMe = Math.hypot(p.x - v.x, p.z - v.z);
    if ((v.state === 'come' || v.state === 'work') && p.onFoot && dMe < BEAR.scare) this.finish('scared');
    if (v.state === 'come') {
      const d = goTo(v.tx, v.tz, BEAR.walk);
      if (v.sndT <= 0) { this.play('bear-brush', this.at3(v.x, v.z), 0.8, 2.2); v.sndT = 2.6; }
      if (!v.woofed && d < BEAR.from * 0.55) { v.woofed = true; this.play('bear-woof', this.at3(v.x, v.z), 1); }
      v.head = -0.15; v.headYaw = 0;
      if (d < 0.15) { v.state = 'work'; v.workT = 0; v.sndT = 0.3; this.startWork(v); }
    } else if (v.state === 'work') {
      v.workT += dt;
      const want = Math.atan2(-(v.fz - v.z), v.fx - v.x); let e = want - v.h; e = Math.atan2(Math.sin(e), Math.cos(e)); v.h += clamp(e, -1.5 * dt, 1.5 * dt);
      // nose down in the food; every few seconds the head comes up and round toward the light
      const ph = v.workT % 6.5, up = ph > 4.6;
      v.head += ((up ? 0.12 : -0.62) - v.head) * Math.min(1, dt * 4);
      const toMe = Math.atan2(-(p.z - v.z), p.x - v.x); let ey = toMe - v.h; ey = Math.atan2(Math.sin(ey), Math.cos(ey));
      v.headYaw += ((up ? clamp(ey, -0.9, 0.9) : 0) - v.headYaw) * Math.min(1, dt * 3);
      if (v.sndT <= 0) { this.play(v.kind === 'barrel' ? (v.workT < 8 ? 'barrel-roll' : 'bear-rummage') : v.kind === 'pack' || v.kind === 'canoe' ? (v.workT < 6 ? 'pack-tear' : 'bear-rummage') : 'bear-rummage', this.at3(v.fx, v.fz), 0.9); v.sndT = 3 + Math.random() * 1.5; }
      if (v.workT >= BEAR.work) this.finish('done');
    } else if (v.state === 'leave' || v.state === 'flee') {
      const run = v.state === 'flee';
      goTo(v.ex, v.ez, run ? BEAR.run : BEAR.amble);
      v.head += ((run ? 0.1 : -0.1) - v.head) * Math.min(1, dt * 4); v.headYaw *= 0.9;
      if (run && v.sndT <= 0) { this.play('bear-brush', this.at3(v.x, v.z), 1.1, 1.6); v.sndT = 1.5; }
      const away = Math.hypot(v.x - v.fx, v.z - v.fz);
      if (away > BEAR.from + 6 || v.t > 90) this.endVisit();
    }
    if (this.visit && this.visit.done && !this.visit.said && (this.visit.state === 'flee' ? this.visit.t - this.visit.doneT > 1.6 : this.visit.t - this.visit.doneT > 3)) {
      this.visit.said = true;
      if (this.hud) this.hud.note(this.visit.words, 9);
    }
  }
  // at the food: the barrel knocked over at once (the dragging comes as it leaves), a pack pawed
  startWork(v) {
    const g = this.groupNow(v.main);
    if (g && /^barrel/.test(g.k.item) && g.k.where === 'ground' && g.k.at) { g.k.at.knocked = true; g.k.at.bear = true; this.inv.emit('ground'); v.knocked = true; this.play('barrel-roll', this.at3(v.fx, v.fz), 1); }
    else this.play('bear-rummage', this.at3(v.fx, v.fz), 1);
  }
  groupNow(id) {
    const c = this.inv && this.inv.cont(id); if (!c) return null;
    const here = { x: this.visit ? this.visit.fx : this.player.x, z: this.visit ? this.visit.fz : this.player.z };
    return this.exposed(here.x, here.z, { asleep: false, r: BEAR.reach }).find((g) => g.k.id === id) || null;
  }
  // the visit ends: 'done' (it had its share), 'noise' (you drove it off), 'scared' (walked up on). The share it got to:
  // all of it, else as far as it got through BEAR.work (nothing if it never reached the food)
  finish(how) {
    const v = this.visit; if (!v || v.done) return;
    const full = BEAR.take[0] + v.N.f * (BEAR.take[1] - BEAR.take[0]);
    const share = how === 'done' ? full : v.state === 'work' ? full * clamp(v.workT / BEAR.work, 0, 1) : 0;
    const groups = this.exposed(v.fx, v.fz, { asleep: false });
    const main = groups.find((g) => g.k.id === v.main) || null;
    const order = main ? [main, ...groups.filter((g) => g !== main)] : groups;
    const lost = share > 0.02 && order.length ? this.take(order, share, { min: how === 'done' || v.workT > 3 }) : [];
    let mess = '';
    if (main && (v.state === 'work' || how === 'done')) mess = this.mess(main, mulberry32(seedOf(`${v.N.key}:mess`)), { far: how === 'done' });
    else if (v.knocked) mess = '';
    const lead = how === 'done' ? 'The bear ambles off into the dark.' : how === 'noise' ? 'It woofs and crashes off into the dark.' : 'It woofs and bolts off into the dark.';
    v.words = `${lead} ${mess}${mess ? ' ' : ''}${lost.length ? this.lostWords(lost) : share > 0 || v.state === 'work' ? 'It got nothing.' : 'It never got to the food.'}`.trim();
    v.done = true; v.doneT = v.t; v.how = how;
    v.state = how === 'done' ? 'leave' : 'flee'; v.sndT = 0;
    // it goes back the way it came, a little off it
    const inl = this.inland(v.x, v.z) || { x: v.ex - v.x, z: v.ez - v.z }, L = Math.hypot(inl.x, inl.z) || 1;
    v.ex = v.x + (inl.x / L) * (BEAR.from + 10); v.ez = v.z + (inl.z / L) * (BEAR.from + 10);
    if (how !== 'done') this.play('bear-woof', this.at3(v.x, v.z), 1.1);
    this.log({ how, share: +share.toFixed(2), lost: lost.map((r) => r.id) });
  }
  endVisit() {
    const v = this.visit; if (!v) return;
    if (!v.done) this.finish('done');
    if (!v.said && this.hud && v.words) this.hud.note(v.words, 9);
    this.visit = null;
    if (this.group) this.group.visible = false;
  }
  // E on the dot: yelling and banging the pot
  noise() {
    const v = this.visit; if (!v || v.done) return false;
    const au = this.audio;
    if (au && au.ctx && au.enabled) au.say('bear-yell', yell(au));
    this.finish('noise');
    return true;
  }
  play(kind, pos, size = 1, extra) {
    const au = this.audio, S = SOUNDS[kind];
    if (!au || !au.ctx || !au.enabled || !S || !pos) return false;
    if (au.distTo(pos) > S[0] * Math.sqrt(Math.max(0.2, size))) return false;
    return !!au.say(kind, extra === undefined ? S[1](au, pos, size) : S[1](au, pos, size, extra));
  }

  // --- drawing ------------------------------------------------------------------------------------------------------------
  build() {
    const G = bearGeometries(), mat = propMaterial(), g = this.group = new THREE.Group();
    g.name = 'bear'; g.visible = false;
    const mk = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
    this.body = mk(G.body); g.add(this.body);
    this.headPivot = new THREE.Group(); this.headPivot.position.copy(NECK); g.add(this.headPivot);
    this.head = mk(G.head); this.headPivot.add(this.head);
    this.legs = LEGS.map(([x, y, z]) => { const piv = new THREE.Group(); piv.position.set(x, y, z); piv.add(mk(G.leg)); g.add(piv); return piv; });
    // eyeshine: a light additive bead each, unfogged, only as bright as the headlamp makes it
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xf4e3a2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    const eg = new THREE.OctahedronGeometry(0.024, 0);
    this.eyes = EYES.map((p) => { const m = new THREE.Mesh(eg, this.eyeMat); m.position.copy(p); m.renderOrder = 6; this.head.add(m); return m; });
    if (this.scene) this.scene.add(g);
    // the litter: one merged mesh about an origin, rebuilt when the mess changes
    this.litter = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.litter.name = 'bear litter'; this.litter.receiveShadow = true; this.litter.visible = false;
    if (this.scene) this.scene.add(this.litter);
  }
  pose() {
    const v = this.visit, g = this.group;
    if (!v) { if (g.visible) g.visible = false; this.eyeMat.opacity = 0; return; }
    const p = this.player, near = Math.hypot(v.x - p.x, v.z - p.z) < 120;
    g.visible = near;
    if (!near) return;
    const gy = this.tiles.groundAt(v.x, v.z), moving = v.state !== 'work';
    g.position.set(v.x, gy + (moving ? Math.abs(Math.sin(v.gait)) * 0.02 : 0), v.z);
    g.rotation.set(0, v.h, 0);
    LEGS.forEach(([, , , ph], i) => { this.legs[i].rotation.z = moving ? Math.sin(v.gait + ph) * (v.state === 'flee' ? 0.65 : 0.38) : 0; });
    this.headPivot.rotation.set(0, v.headYaw, v.head, 'YXZ');
    g.updateMatrixWorld(true);
    this.eyeMat.opacity = this.eyeshine();
    // eyeshine stays a point or two however far: the beads grow with distance
    const cam = this.camera, d = cam ? cam.position.distanceTo(g.position) : 10, s = Math.max(1, d / 11);
    for (const e of this.eyes) e.scale.setScalar(s);
  }
  // how bright the eyes shine: the lamp on, its beam on them, the bear's face toward it, the dark
  eyeshine() {
    const L = this.lamp, v = this.visit;
    if (!L || !L.light || !(L.level > 0.01) || !v) return 0;
    const lp = L.light.getWorldPosition(this._a || (this._a = V())), tp = L.light.target.getWorldPosition(this._b || (this._b = V()));
    const ax = tp.sub(lp).normalize(), e = this.eyes[0].getWorldPosition(this._c || (this._c = V()));
    const to = e.sub(lp), d = to.length(); to.multiplyScalar(1 / (d || 1));
    const cone = smooth(Math.cos(0.95), Math.cos(0.35), ax.dot(to));
    const far = 1 - smooth(45, 75, d);
    const fwd = this._f || (this._f = V()); fwd.set(1, 0, 0).applyQuaternion(this.head.getWorldQuaternion(this._q || (this._q = new THREE.Quaternion())));
    const face = smooth(0.15, 0.7, -fwd.dot(to));
    const dark = 1 - smooth(-6, 2, this.day.elevation);
    return clamp(L.level * cone * far * face * (0.35 + 0.65 * dark), 0, 1);
  }
  afterPose() {
    if (!this.attached) return;
    const inv = this.inv, view = this.invView;
    this.pose();
    if (!inv || !view || !view.objs) return;
    // the knocked barrel on its side, the torn pack on its back (containers.js stands them up each frame)
    for (const c of inv.containers) {
      if (c.where !== 'ground' || !c.at || !(c.at.knocked || c.at.torn)) continue;
      const o = view.objs.get(c.id); if (!o) continue;
      const at = c.at, y = Number.isFinite(at.y) ? at.y : this.tiles.groundAt(at.x, at.z), h = at.heading || 0;
      const q = this._qq || (this._qq = new THREE.Quaternion()), q2 = this._q2 || (this._q2 = new THREE.Quaternion());
      if (c.at.knocked && /^barrel/.test(c.item)) {
        const R = c.item === 'barrel60' ? 0.195 : 0.15;
        q.setFromAxisAngle(V(0, 1, 0), h + Math.PI / 2); q2.setFromAxisAngle(V(0, 0, 1), -Math.PI / 2);
        o.quaternion.copy(q).multiply(q2);
        o.position.set(at.x, y + R - 0.01, at.z);
      } else if (c.at.torn) {
        const mk = o.userData.mesh, P = PACKS[mk] || PACKS.food, T = 1.3, fx = Math.cos(h), fz = -Math.sin(h);
        const m = this._m || (this._m = new THREE.Matrix4());
        m.makeBasis(V(0, 1, 0), V(-fx, 0, -fz), V(-fz, 0, fx));
        o.quaternion.setFromRotationMatrix(m).multiply(q2.setFromAxisAngle(V(0, 0, 1), T));
        o.position.set(at.x - fx * Math.sin(T) * P.H / 2, y + Math.cos(T) * P.H / 2 + Math.sin(T) * P.D * 0.45, at.z - fz * Math.sin(T) * P.H / 2);
      }
    }
  }
  drawMess() {
    const L = this.litter; if (!L) return;
    const p = this.player, mess = this.s.mess.filter((b) => Math.abs(b.x - p.x) < 400 && Math.abs(b.z - p.z) < 400);
    const sig = `${this.ver}:${mess.length}:${mess.length ? Math.round(mess[0].x / 200) : 0}`;
    if (sig === this.drawnVer) return;
    this.drawnVer = sig;
    if (!mess.length) { L.visible = false; return; }
    const ox = Math.round(mess[0].x), oz = Math.round(mess[0].z), b = new PropBuilder();
    const T = this.tiles, e = 0.3;
    for (const m of mess) {
      const rng = mulberry32(seedOf(`${m.x}:${m.z}:${m.k}`)), gy = T.groundAt(m.x, m.z);
      const n = V(-(T.groundAt(m.x + e, m.z) - T.groundAt(m.x - e, m.z)), 2 * e, -(T.groundAt(m.x, m.z + e) - T.groundAt(m.x, m.z - e))).normalize();
      addLitter(b, m.k, m.x - ox, gy + 0.01, m.z - oz, m.rot, rng, n);
    }
    L.geometry.dispose(); L.geometry = b.build();
    L.position.set(ox, 0, oz); L.visible = true; L.updateMatrixWorld(true);
  }
  // the morning's line once the mess is in view (or `max` seconds after the night card's gone)
  sayMorning() {
    const n = this.note; if (!n) return;
    const c = this.camp, v = c && c.veil;
    if ((v && v.active) || (c && c.night)) return;
    if (n.t === null) n.t = this.realT;
    const cam = this.camera, p = this.player;
    let seen = false;
    if (cam) {
      const f = this._d || (this._d = V()); cam.getWorldDirection(f);
      const dx = n.x - cam.position.x, dz = n.z - cam.position.z, d = Math.hypot(dx, dz);
      seen = d < 30 && (f.x * dx + f.z * dz) / (d * Math.hypot(f.x, f.z) || 1) > 0.82;
    }
    const near = Math.hypot(n.x - p.x, n.z - p.z) < 40;
    if ((seen && near) || (near && this.realT - n.t > n.max)) { if (this.hud) this.hud.note(n.text, 10); this.note = null; }
  }

  // --- the dot ----------------------------------------------------------------------------------------------------------
  // the bear while it is about (E Make noise); a piece of its litter within reach (E Pack it out)
  pointed(ray, near) {
    const out = [], v = this.visit, p = this.player;
    if (v && !v.done && this.group.visible) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d <= BEAR.sight) {
        const gy = this.tiles.groundAt(v.x, v.z), hit = near.sphere(v.x + Math.cos(v.h) * 0.2, gy + 0.6, v.z - Math.sin(v.h) * 0.2, 1.3 + d * 0.07); // (generous: in the dark you point at the eyes, or at the noise)
        // (no rim and no pool: it is seen only as the headlamp shows it)
        if (hit) out.push({ dist: hit.t, miss: hit.miss * 0.5, target: { kind: 'bear', ref: 'bear', label: this.eyeMat.opacity > 0.05 || d < 8 ? 'a black bear' : 'something big in the dark', e: { verb: 'Make noise', run: () => this.noise() } } });
      }
    }
    if (this.s && this.s.mess.length) {
      for (let i = 0; i < this.s.mess.length; i++) {
        const b = this.s.mess[i];
        if (near.flat(b.x, b.z) > near.reach) continue;
        const hit = near.sphere(b.x, this.tiles.groundAt(b.x, b.z) + 0.03, b.z, 0.2);
        if (!hit) continue;
        out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'item', ref: `bear-litter:${i}`, label: (LITTER[b.k] || LITTER.wrapper).label, box: { x: b.x, y: this.tiles.groundAt(b.x, b.z) + 0.03, z: b.z, hx: 0.18, hy: 0.04, hz: 0.18, heading: b.rot }, e: { verb: 'Pack it out', run: () => this.packOut(i) } } });
      }
    }
    return out;
  }
  // Leave No Trace: the bear's litter into your pack (content A's 'litter' item, when it is in the build)
  packOut(i) {
    const b = this.s.mess[i]; if (!b) return false;
    const inv = this.inv;
    if (inv && itemDef('litter')) {
      let r = inv.place('litter', 1, {});
      if (!r || !r.ok) r = inv.toHandNew('litter');
      if (!r || r.ok === false) { if (this.hud) this.hud.note('No room for it: a pack on your back, or a free hand.', 3); return false; }
    }
    this.s.mess.splice(i, 1); this.ver++; this.write();
    if (this.hud) this.hud.note(this.s.mess.some((m) => Math.hypot(m.x - b.x, m.z - b.z) < 12) ? 'Packed out.' : 'Packed out: the last of the mess.', 2);
    return true;
  }

  // --- the frame ----------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.attached) return;
    this.realT += dt;
    this.seasonCheck();
    if (this.live) this.watch();
    this.stepVisit(dt);
    this.drawMess();
    this.sayMorning();
  }

  // --- the moments (hints.js) ----------------------------------------------------------------------------------------------
  moments() {
    return [
      { id: 'bearnoise', prio: DANGER, recur: 'while', text: 'A bear at the food. Face it and {E} to make noise.', short: 'Bear: {E} make noise.', due: () => !!(this.visit && !this.visit.done && this.visit.t > 2.5 && this.player.onFoot) },
      { id: 'bearback', prio: BODY, recur: 'daily', text: 'Hang the food tonight.', short: 'Hang the food tonight.', due: () => this.backDue() },
    ];
  }
  // the dusk after a visit, at camp on foot, with food still out
  backDue() {
    const L = this.s && this.s.last, d = this.day, p = this.player;
    if (!L || !this.live || p.mode !== 'walk') return false;
    const N = this.nightAt(), set = d.sunriseSunset ? d.sunriseSunset.set ?? 20 : 20;
    if (!(N.y === L.y && N.d === L.d + 1) || d.hours < 12 || d.hours < set - 1.5) return false;
    const here = this.campHere(); if (!here || Math.hypot(here.x - p.x, here.z - p.z) > 30) return false;
    return this.exposed(here.x, here.z, { asleep: true }).length > 0;
  }
  due(id, rec, next) {
    const m = this._moments || (this._moments = new Map(this.moments().map((q) => [q.id, q])));
    if (m.has(id)) { try { return m.get(id).due(rec); } catch { return false; } }
    if (id === 'bears' && this.backDue()) return false; // (that evening it is "Hang the food tonight." instead)
    return next(id, rec);
  }

  // --- the console and the tests ------------------------------------------------------------------------------------------------
  stats() {
    const p = this.player, here = this.campHere(p.x, p.z), N = this.nightAt();
    const ex = here ? this.exposed(here.x, here.z, { asleep: true }) : [];
    return {
      nights: this.s.nights, visits: this.s.visits, night: { key: N.key, u: +N.u.toFixed(3), at: +N.at.toFixed(2), f: +N.f.toFixed(2), resolved: this.s.night },
      last: this.s.last, chance: here ? +this.chanceAt(here.x, here.z).toFixed(3) : null, activity: here ? this.activityAt(here.x, here.z) : null,
      exposed: ex.map((g) => `${g.kind}:${g.k.item}:${g.items.length}:${g.value.toFixed(2)}`), all: +this.allFood().toFixed(2),
      visit: this.visit ? { state: this.visit.state, t: +this.visit.t.toFixed(1), work: +this.visit.workT.toFixed(1), d: +Math.hypot(this.visit.x - p.x, this.visit.z - p.z).toFixed(1), eyes: +this.eyeMat.opacity.toFixed(2), words: this.visit.words || null } : null,
      mess: this.s.mess.length, note: this.note ? this.note.text : null,
    };
  }
}

export const bear = new Bear();
