import * as THREE from 'three';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32, clamp, lerp, smoothstep, hash2 } from './rng.js';
import { makeToonMaterial, smoothToon } from './rocks.js';
import { calmAt, rockAt } from './fields.js';
import { rockSlope } from './terrain-build.js';
import { windHeight } from './waves.js';

// Fishing from the canoe. F brings the rod up (the paddle rests across the gunwales); hold Space or the
// mouse to load a cast and let go; the lure flies, splashes down and sinks or hangs under a bobber; W
// retrieves. Fish bite at a rate built from the water under the lure (depth, shore, weeds, rock,
// drop-offs), the lure and how it is worked, the hour, the lake's clarity and the chop. A bite is a dip
// or a twitch and a window to set the hook; the fight is a tension bar: reel against the fish, ease off
// when it runs. Nothing fails you: a snapped line costs the lure, a thrown hook costs nothing.
// Everything here is tunable through TUNING, SPECIES and LURES (window.__game.fishing holds them).

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

export const TUNING = {
  base: 1 / 80,          // bites per second for one species at every factor 1.0
  castSpeed: [3, 21],    // lure speed off the tip at zero and full power, m/s
  castAngle: 0.66,       // radians above the horizon
  floatDepth: 2.4,       // metres of line under the bobber
  retrieve: [1.3, 2.2],  // lure speed when reeling with W, with Shift
  hookWindow: [0.05, 1.35], // seconds after the bite in which the hook sets
  reelSpeed: 1.7,        // metres of line per second against a resting fish
  snapDanger: 1.0,       // seconds-ish of tension above the red line before the line parts
  slackLimit: 3.5,       // seconds of slack line before the fish throws the hook
  landAt: 1.7,           // metres of line left when the fish is at the hull
  holdUp: 12,            // seconds the fish is held up before it is let go on its own
  rodArc: 1.4,           // radians either side of the bow the rod can be swung to cast
};

// How far a lure flies off a tip `h` metres above the water at `speed`, with the flight's own drag; and the
// speed that lands it `dist` out, so a cast can be dropped on the spot the player is pointing at.
export function rangeFor(speed, h) {
  const a = TUNING.castAngle, dt = 0.02;
  let x = 0, y = h, vx = Math.cos(a) * speed, vy = Math.sin(a) * speed;
  for (let i = 0; i < 500; i++) { vy -= 9.81 * dt; const d = 1 - 0.08 * dt; vx *= d; vy *= d; x += vx * dt; y += vy * dt; if (y <= 0) break; }
  return x;
}
export function speedFor(dist, h) {
  let lo = TUNING.castSpeed[0], hi = TUNING.castSpeed[1];
  if (rangeFor(hi, h) <= dist) return hi;
  if (rangeFor(lo, h) >= dist) return lo;
  for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (rangeFor(m, h) < dist) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------------------------------------------
// Tackle. sink: fall rate at rest (negative floats up). run: depth it swims at when retrieved at a walking pace,
// 'bottom' hops along the bed, 'float' hangs under the bobber. still / slow / fast: how well it fishes left
// alone, worked slowly, or burned back.
export const LURES = [
  { id: 'jig', name: 'Jig', sink: 0.9, run: 'bottom', still: 0.7, slow: 1.0, fast: 0.5, colour: 0xd8b84a },
  { id: 'spinner', name: 'Spinner', sink: 0.35, run: 1.0, still: 0.15, slow: 0.85, fast: 1.1, colour: 0xd9c38a },
  { id: 'spoon', name: 'Spoon', sink: 0.6, run: 2.2, still: 0.25, slow: 1.0, fast: 1.0, colour: 0xe0c070 },
  { id: 'crankbait', name: 'Crankbait', sink: -0.5, run: 3.4, still: 0.2, slow: 0.95, fast: 1.1, colour: 0x8fb07a },
  { id: 'leech', name: 'Leech & bobber', sink: 0.5, run: 'float', still: 1.0, slow: 0.8, fast: 0.3, colour: 0x2e2a2a, bobber: true },
];

// Species and where they feed. bed: preferred water depth at the spot; zone: preferred lure depth below the
// surface; shore: distance from shore it likes; weeds / rock / dropoff: multipliers in fully weedy water, off
// a rocky shore, over a drop-off; day / lowLight / night: activity by light; stained / clear: multipliers in
// tea-dark and clear water by day; chop: in a light chop; fast: when the lure is burned back; lures: by lure
// id; length: [smallest, largest] cm; k: weight (kg) at one metre, cubed with the length.
export const SPECIES = {
  walleye: { name: 'Walleye', bed: [3, 11], zone: [2, 10], shore: [8, 200], weeds: 0.6, rock: 1.3, dropoff: 1.6, day: 0.4, lowLight: 2.2, night: 1.3, stained: 1.35, clear: 0.7, chop: 1.35, calm: 0.8, fast: 0.6, lures: { jig: 1.25, spinner: 0.7, spoon: 0.5, crankbait: 0.9, leech: 1.0 }, length: [30, 76], k: 10, colour: 0x8c8a4e, belly: 0xd9d2a8 },
  smallmouth: { name: 'Smallmouth bass', bed: [1.5, 8], zone: [0.5, 6], shore: [3, 70], weeds: 0.7, rock: 1.7, dropoff: 1.2, day: 1.0, lowLight: 1.5, night: 0.3, stained: 0.8, clear: 1.15, chop: 1.2, calm: 0.9, fast: 1.15, lures: { jig: 0.9, spinner: 1.0, spoon: 0.5, crankbait: 1.2, leech: 1.0 }, length: [25, 55], k: 14, colour: 0x7d6a3c, belly: 0xcbbf98 },
  pike: { name: 'Northern pike', bed: [1, 5.5], zone: [0.3, 3.5], shore: [3, 90], weeds: 2.1, rock: 0.6, dropoff: 0.9, day: 1.0, lowLight: 1.3, night: 0.25, stained: 1.0, clear: 1.0, chop: 1.0, calm: 1.0, fast: 1.2, lures: { jig: 0.5, spinner: 1.1, spoon: 1.3, crankbait: 1.0, leech: 0.6 }, length: [45, 118], k: 7.5, colour: 0x4f6b3a, belly: 0xc9c89a },
  laketrout: { name: 'Lake trout', bed: [15, 80], zone: [10, 60], shore: [60, 5000], weeds: 0.3, rock: 1.0, dropoff: 1.3, day: 0.8, lowLight: 1.3, night: 0.3, stained: 0.7, clear: 1.25, chop: 1.0, calm: 1.0, fast: 0.8, deepLake: true, lures: { jig: 0.9, spinner: 0.3, spoon: 1.3, crankbait: 0.5, leech: 0.1 }, length: [40, 96], k: 10, colour: 0x5a6a62, belly: 0xc2c6b6 },
  crappie: { name: 'Black crappie', bed: [2, 7], zone: [1, 5], shore: [5, 70], weeds: 1.7, rock: 0.8, dropoff: 1.0, day: 0.6, lowLight: 2.0, night: 0.7, stained: 1.0, clear: 1.0, chop: 1.0, calm: 1.1, fast: 0.4, lures: { jig: 1.1, spinner: 0.5, spoon: 0.2, crankbait: 0.4, leech: 1.3 }, length: [18, 38], k: 16, colour: 0x9ea39a, belly: 0xdcdcd2 },
  perch: { name: 'Yellow perch', bed: [1, 6], zone: [0.5, 5], shore: [3, 70], weeds: 1.4, rock: 0.9, dropoff: 1.0, day: 1.2, lowLight: 1.0, night: 0.2, stained: 1.0, clear: 1.0, chop: 1.0, calm: 1.1, fast: 0.4, lures: { jig: 1.0, spinner: 0.4, spoon: 0.2, crankbait: 0.3, leech: 1.3 }, length: [15, 36], k: 12, colour: 0xc9a84a, belly: 0xe8dca8 },
};
const SPECIES_IDS = Object.keys(SPECIES);

// a soft band: 1 inside [lo, hi], falling to `floor` a little outside it
function band(v, lo, hi, soft, floor = 0.1) {
  const t = smoothstep(lo - soft, lo, v) * (1 - smoothstep(hi, hi + soft * 2, v));
  return floor + (1 - floor) * t;
}
const bump = (h, c, w) => Math.exp(-(((h - c) / w) ** 2));

// the day's light, as fish feel it: low light at dawn and dusk, night, and the rest is day
export function lightAt(hours) {
  const night = clamp(smoothstep(21.8, 23.2, hours) + 1 - smoothstep(3.6, 5.0, hours), 0, 1);
  const low = clamp(Math.max(bump(hours, 5.7, 1.4), bump(hours, 20.5, 1.5)), 0, 1) * (1 - night);
  return { low, night, day: Math.max(0, 1 - low - night) };
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry. The rod is a chain of segments so it can bend under a fish; the fish are one blob body with fins,
// built at a length of one metre along +x and scaled to the catch.
function unitTube(r0, r1, len, col, rng) {
  const g = new GeoBuilder();
  g.tube(g.ring(0, 0, 0, r0, 6, rng), g.ring(0, len, 0, r1, 6, rng), col, V(0, len / 2, 0));
  return g.build();
}

function buildRod(rng, mat) {
  // built along +y (GeoBuilder rings lie in xz), then turned so the rod runs along +x: pitch is a z rotation
  const root = new THREE.Group();
  const turn = new THREE.Group();
  turn.rotation.z = -Math.PI / 2;
  root.add(turn);
  const blank = vary(0x3a352f, rng, 0.03), cork = vary(0xc8a872, rng, 0.04), reelC = vary(0x4b5058, rng, 0.03), spool = vary(0xb9bcc0, rng, 0.03);
  const butt = new THREE.Mesh(unitTube(0.017, 0.015, 0.34, cork, rng), mat);
  butt.position.y = -0.34;
  turn.add(butt);
  const fore = new THREE.Mesh(unitTube(0.015, 0.012, 0.16, cork, rng), mat);
  turn.add(fore);
  const g = new GeoBuilder();
  g.blob(0.065, 0.1, 0, 0.034, reelC, rng, 0.1, 0.8, 1.1, 1.3);     // the reel, hanging under the rod ahead of the hand
  g.blob(0.075, 0.1, 0.055, 0.024, spool, rng, 0.1, 0.9, 1, 0.6);  // its spool
  g.tube(g.ring(0.03, 0.04, 0, 0.006, 4, rng), g.ring(0.065, 0.1, 0, 0.006, 4, rng), reelC, V(0.05, 0.07, 0));
  const reel = new THREE.Mesh(smoothToon(g.build()), mat);
  turn.add(reel);
  const crank = new THREE.Group();   // the handle, spun about the spool's axle while reeling
  crank.position.set(0.075, 0.1, 0.075);
  const handle = new THREE.Mesh(unitTube(0.005, 0.005, 0.035, spool, rng), mat);
  handle.rotation.x = Math.PI / 2; handle.position.set(0.03, 0, 0);
  const knob = new THREE.Mesh(unitTube(0.004, 0.004, 0.03, reelC, rng), mat);
  knob.position.set(0, 0, 0.0);
  knob.rotation.z = -Math.PI / 2;
  crank.add(knob, handle);
  turn.add(crank);
  // the blank: eight tapering segments, each a child of the last, so a bend accumulates toward the tip
  const segs = [];
  let parent = turn, y = 0.16;
  const N = 8, segLen = 0.22;
  for (let i = 0; i < N; i++) {
    const r0 = lerp(0.011, 0.0035, i / N), r1 = lerp(0.011, 0.0035, (i + 1) / N);
    const seg = new THREE.Group();
    seg.position.y = y;
    const m = new THREE.Mesh(unitTube(r0, r1, segLen, blank, rng), mat);
    seg.add(m);
    parent.add(seg);
    segs.push(seg);
    parent = seg; y = segLen;
  }
  const tip = new THREE.Object3D();
  tip.position.y = segLen;
  parent.add(tip);
  root.traverse((o) => { o.castShadow = true; });
  return { root, segs, tip, crank };
}

function buildBobber(rng, mat) {
  const g = new GeoBuilder();
  g.blob(0, 0.035, 0, 0.065, vary(0xd94c2c, rng, 0.03), rng, 0.1, 1, 0.75, 1);
  g.blob(0, -0.02, 0, 0.06, vary(0xf2ecdc, rng, 0.03), rng, 0.1, 1, 0.7, 1);
  g.tube(g.ring(0, 0.06, 0, 0.007, 4, rng), g.ring(0, 0.19, 0, 0.006, 4, rng), vary(0xf2ecdc, rng, 0.03), V(0, 0.12, 0));
  const m = new THREE.Mesh(smoothToon(g.build()), mat);
  m.castShadow = true;
  return m;
}

function buildLure(def, rng, mat) {
  const g = new GeoBuilder();
  const c = vary(def.colour, rng, 0.04), hook = new THREE.Color(0x5a5a5a);
  if (def.id === 'jig') { g.blob(0, 0, 0, 0.018, vary(0xc0392b, rng, 0.03), rng, 0.1); g.tri(V(0, -0.005, 0), V(-0.06, 0.01, -0.012), V(-0.06, 0.01, 0.012), c, V(-0.02, 0.05, 0)); }
  else if (def.id === 'spinner') { g.blob(0, 0, 0, 0.012, hook, rng, 0.1, 1, 1.8, 1); g.blob(0.02, 0.03, 0, 0.022, c, rng, 0.1, 0.5, 1.4, 1); }
  else if (def.id === 'spoon') g.blob(0, 0, 0, 0.03, c, rng, 0.05, 0.55, 1.6, 0.18);
  else if (def.id === 'crankbait') { g.blob(0, 0, 0, 0.035, c, rng, 0.08, 1.5, 0.55, 0.5); g.blob(0.05, -0.012, 0, 0.012, hook, rng, 0.05, 1.2, 0.2, 1.4); }
  else g.blob(0, 0, 0, 0.02, c, rng, 0.15, 1.8, 0.35, 0.5);
  const m = new THREE.Mesh(smoothToon(g.build()), mat);
  m.castShadow = false;
  return m;
}

// one metre long along +x, centred on the body, head at +x
function buildFish(sp, rng, mat) {
  const g = new GeoBuilder();
  const body = vary(sp.colour, rng, 0.04), belly = vary(sp.belly, rng, 0.03), fin = new THREE.Color(sp.colour).offsetHSL(0, -0.05, -0.12), eye = new THREE.Color(0x1a1a1a);
  const slim = sp.name.includes('pike') ? 0.7 : sp.name.includes('crappie') ? 1.5 : 1;
  g.blob(0, 0, 0, 0.5, body, rng, 0.06, 1, 0.26 * slim, 0.12);
  g.blob(0.02, -0.04, 0, 0.44, belly, rng, 0.06, 1, 0.22 * slim, 0.11);
  if (sp.name.includes('pike') || sp.name.includes('trout')) for (let i = 0; i < 7; i++) g.blob(-0.3 + i * 0.1, 0.04 + (i % 2) * 0.05, (i % 2 ? 1 : -1) * 0.06, 0.018, belly, rng, 0.1, 1.3, 0.6, 0.6);
  g.tri(V(-0.5, 0, 0), V(-0.7, 0.17 * slim, 0), V(-0.62, 0, 0), fin, V(-0.5, 0, 1));       // tail, upper lobe
  g.tri(V(-0.5, 0, 0), V(-0.62, 0, 0), V(-0.7, -0.17 * slim, 0), fin, V(-0.5, 0, 1));      // tail, lower lobe
  g.tri(V(-0.5, 0, 0), V(-0.7, 0.17 * slim, 0), V(-0.62, 0, 0), fin, V(-0.5, 0, -1));
  g.tri(V(-0.5, 0, 0), V(-0.62, 0, 0), V(-0.7, -0.17 * slim, 0), fin, V(-0.5, 0, -1));
  g.tri(V(-0.1, 0.11 * slim, 0), V(0.18, 0.11 * slim, 0), V(0.0, 0.24 * slim, 0), fin, V(0, 0.1, 1));   // dorsal
  g.tri(V(-0.1, 0.11 * slim, 0), V(0.18, 0.11 * slim, 0), V(0.0, 0.24 * slim, 0), fin, V(0, 0.1, -1));
  for (const s of [-1, 1]) g.tri(V(0.2, -0.04, s * 0.1), V(0.05, -0.08, s * 0.2), V(0.02, -0.02, s * 0.1), fin, V(0.1, -0.5, s * 0.1));  // pectorals
  for (const s of [-1, 1]) g.blob(0.38, 0.05, s * 0.075, 0.02, eye, rng, 0.05);
  const m = new THREE.Mesh(smoothToon(g.build()), mat);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
export class Fishing {
  constructor({ world, player, canoe, water, ripples, audio, chase, input, day, wind, scene }) {
    Object.assign(this, { world, player, canoe, water, ripples, audio, chase, input, day, wind, scene });
    this.tuning = TUNING; this.species = SPECIES; this.lures = LURES;
    const rng = mulberry32(17);
    const mat = makeToonMaterial();
    this.rodParts = buildRod(rng, mat);
    this.rod = this.rodParts.root;
    canoe.rig.add(this.rod);
    this.bobber = buildBobber(rng, mat);
    this.bobber.visible = false;
    scene.add(this.bobber);
    this.lureMeshes = LURES.map((d) => { const m = buildLure(d, rng, mat); m.visible = false; scene.add(m); return m; });
    this.fishMeshes = {};
    for (const id of SPECIES_IDS) { const m = buildFish(SPECIES[id], rng, mat); m.visible = false; scene.add(m); this.fishMeshes[id] = m; }
    this.heldFish = null;      // mesh in the hands
    this.stringerMeshes = [];  // fish hung over the port gunwale
    // the line: a sagging polyline from the tip to the water and on to the lure
    this.LINE_N = 28;
    this.linePos = new Float32Array((this.LINE_N + 2) * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf4f1e8, transparent: true, opacity: 0.75 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.line.renderOrder = 13;
    scene.add(this.line);
    // where the cast will land: a pale ring on the water while the rod is ready or loading
    this.aimRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.58, 28), new THREE.MeshBasicMaterial({ color: 0xf4f1e8, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    this.aimRing.rotation.x = -Math.PI / 2;
    this.aimRing.renderOrder = 12;
    this.aimRing.visible = false;
    scene.add(this.aimRing);
    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this.aimPoint = null;   // world xz the cast is aimed at (the cursor's spot on the water, or the view's), if in reach
    this.aimDist = 0;
    this.focus = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

    this.rodUp = false;
    this.state = 'stowed';     // stowed | ready | charging | swing | flying | inwater | bite | fight | landed
    this.lureIndex = 0;
    this.power = 0; this.charge = 0;
    this.pitch = 0.03; this.yaw = 0; this.bend = 0; this.crank = 0;
    this.aim = 0;              // world yaw of the cast
    this.lure = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, depth: 0, onLand: false, speed: 0, bed: 1 };
    this.lineOut = 0;
    this.sinceCast = 0;
    this.bite = null; this.fish = null; this.landed = null; this.pending = null;
    this.cooldown = 0;
    this.message = null;
    this.spot = { text: '', t: 0, hab: null };
    this.lureHab = { hab: null, t: 0 };
    this.factors = {};
    this.rate = 0;
    this.stringer = [];
    this.log = []; this.bests = {}; this.logVersion = 0; this.logOpen = false;
    this.loadLog();
    this.mouse = { down: false, pressed: false };
    window.addEventListener('pointerdown', (e) => { if (e.button === 0 && !(e.target && e.target.id === 'minimap')) { this.mouse.down = true; this.mouse.pressed = true; } });
    window.addEventListener('pointerup', () => { this.mouse.down = false; });
    window.addEventListener('blur', () => { this.mouse.down = false; });
    this.ui = {};
    this._tip = new THREE.Vector3(); this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3();
    this._grip = new THREE.Vector3(); this._dir = new THREE.Vector3(); this._up = new THREE.Vector3(); this._side = new THREE.Vector3();
    this.hands = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this.wanderSeed = 0;
  }

  get lureDef() { return LURES[this.lureIndex]; }
  // in first person the first click only captures the pointer for looking around; it is not a cast
  get mouseOk() { const c = this.chase; return c.mode !== 'first' || c.locked || c.lockDenied; }
  get button() { return this.input.held('Space') || (this.mouse.down && this.mouseOk); }
  buttonPressed() { return this.input.pressed('Space') || (this.mouse.pressed && this.mouseOk); }

  // --- catch log ----------------------------------------------------------------------------------------------------
  loadLog() {
    try {
      const raw = JSON.parse(localStorage.getItem('bwca-canoe-catchlog') || 'null');
      if (raw && Array.isArray(raw.catches)) { this.log = raw.catches; this.bests = raw.bests || {}; }
    } catch { /* a fresh log */ }
  }
  saveLog() {
    try { localStorage.setItem('bwca-canoe-catchlog', JSON.stringify({ catches: this.log.slice(-200), bests: this.bests })); } catch { /* storage may be off */ }
  }
  record(fish, kept) {
    const w = this.world, id = w.lakeIdAt(this.player.x, this.player.z);
    const entry = { species: fish.species, name: SPECIES[fish.species].name, length: Math.round(fish.length), weight: Math.round(fish.weight * 100) / 100, lake: w.lakeName(id) || 'Unnamed water', time: this.day.clock, lure: LURES[fish.lure].name, kept, at: Date.now() };
    this.log.push(entry);
    const b = this.bests[fish.species];
    entry.best = !b || entry.length > b.length;
    if (entry.best) this.bests[fish.species] = { name: entry.name, length: entry.length, weight: entry.weight, lake: entry.lake, at: entry.at };
    this.logVersion++;
    this.saveLog();
    return entry;
  }

  // --- the water under a point ---------------------------------------------------------------------------------
  habitatAt(x, z) {
    const w = this.world;
    const level = w.levelAt(x, z), depth = Math.max(0, level - w.heightAt(x, z));
    const shore = -w.shoreAt(x, z);
    const id = w.lakeIdAt(x, z), rec = id > 0 ? w.lakes[id - 1] : null;
    // weeds: the same sheltered-shallows rule the lily pads and weed beds grow by
    let weeds = 0;
    for (const [dx, dz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]]) {
      const px = x + dx, pz = z + dz, s = -w.shoreAt(px, pz), d = Math.max(0, w.levelAt(px, pz) - w.heightAt(px, pz));
      weeds += smoothstep(0.42, 0.6, calmAt(px, pz)) * band(d, 0.3, 3.4, 0.6, 0) * band(s, 0.7, 28, 4, 0) / 5;
    }
    // the nearest shore: walk toward it and read whether it is bedrock there
    let rock = 0;
    if (shore < 120) {
      const d = w.deeperDir(x, z);
      let px = x, pz = z;
      for (let i = 0; i < 40; i++) {
        px -= d.x * 4; pz -= d.z * 4;
        const sd = w.shoreAt(px, pz);
        if (sd > 0.5) { rock = rockAt(rockSlope(w, px, pz), sd, px, pz); break; }
      }
    }
    // a drop-off: much deeper water within 30 m
    let dmax = depth;
    for (let r = 15; r <= 30; r += 15) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (w.shoreAt(px, pz) >= 0) continue;
      const dd = Math.max(0, w.levelAt(px, pz) - w.heightAt(px, pz));
      if (dd > dmax) dmax = dd;
    }
    const dropoff = smoothstep(2.5, 6, dmax - depth);
    const H = this.wind ? windHeight(this.wind.speed, this.water.fetchAt(x, z)) : 0.05;
    return { depth, shore, weeds, rock, dropoff, dmax, secchi: w.clarityOf(id), maxDepth: rec && rec.maxDepth ? rec.maxDepth : 0, cells: rec ? rec.cells : 0, lakeId: id, H, level };
  }

  // bites per second for one species, given the water, the lure, how it is moving and the hour; fills `out`
  rateFor(id, hab, lureDef, lureDepth, speed, hours, out = null) {
    const sp = SPECIES[id];
    if (sp.deepLake && hab.maxDepth < 20) { if (out) out.rate = 0; return 0; }
    const f = out || {};
    f.lure = sp.lures[lureDef.id];
    f.bed = band(hab.depth, sp.bed[0], sp.bed[1], 1.5, 0.12);
    f.zone = band(lureDepth, sp.zone[0], sp.zone[1], 1.2, 0.1);
    f.shore = band(hab.shore, sp.shore[0], sp.shore[1], 10, 0.3);
    f.structure = lerp(1, sp.weeds, hab.weeds) * lerp(1, sp.rock, hab.rock * (1 - smoothstep(40, 90, hab.shore))) * lerp(1, sp.dropoff, hab.dropoff);
    const L = lightAt(hours);
    f.time = sp.day * L.day + sp.lowLight * L.low + sp.night * L.night;
    f.clarity = lerp(lerp(sp.stained, sp.clear, smoothstep(1.5, 4.5, hab.secchi)), 1, 1 - L.day);
    f.wind = hab.H < 0.1 ? sp.calm : hab.H < 0.42 ? sp.chop : hab.H < 0.8 ? 1 : 0.55;
    f.action = speed < 0.05 ? lureDef.still : speed < 1.6 ? lureDef.slow : lureDef.fast * sp.fast;
    f.abundance = 0.75 + 0.5 * hash2(hab.lakeId, SPECIES_IDS.indexOf(id), 5);
    if (id === 'walleye' && hab.cells && hab.cells < 2500) f.abundance *= 0.35;
    f.rate = TUNING.base * f.abundance * f.lure * f.bed * f.zone * f.shore * f.structure * f.time * f.clarity * f.wind * f.action;
    return f.rate;
  }

  // a few words on the spot: what the shore and the bed are doing, and who lives there
  describe(hab, hours) {
    const d = hab.depth;
    let place;
    if (hab.weeds > 0.45) place = 'Weedy bay';
    else if (hab.rock > 0.5 && hab.shore < 45) place = hab.dropoff > 0.5 ? 'Rocky point' : 'Rocky shore';
    else if (hab.shore > 150) place = d > 15 ? 'Deep open water' : 'Open water';
    else if (d < 2) place = 'Shallow flat';
    else if (hab.dropoff > 0.5) place = 'Edge of a drop-off';
    else place = hab.shore < 45 ? 'Wooded shore' : 'A gentle shelf';
    let depthTxt = `${d < 10 ? d.toFixed(1) : d.toFixed(0)} m`;
    if (hab.dmax - d > 3) depthTxt += `, drop-off to ${hab.dmax.toFixed(0)} m`;
    // who lives here: habitat and hour, with the best lure of the box for each
    const scored = SPECIES_IDS.map((id) => {
      let best = 0;
      for (const l of LURES) { const z = l.run === 'float' ? TUNING.floatDepth : typeof l.run === 'number' ? l.run : Math.max(0.3, d - 0.3); best = Math.max(best, this.rateFor(id, hab, l, Math.min(z, Math.max(0.3, d - 0.2)), 1.0, hours)); }
      return { id, s: best / TUNING.base };
    }).sort((a, b) => b.s - a.s);
    const names = { walleye: 'walleye', smallmouth: 'smallmouth', pike: 'pike', laketrout: 'lake trout', crappie: 'crappie', perch: 'perch' };
    const top = scored.filter((s) => s.s > 0.35).slice(0, 2).map((s) => names[s.id]);
    const who = top.length ? top.join(' and ') + ' water' : 'slow water';
    const L = lightAt(hours);
    const when = L.day > 0.7 && scored[0] && scored[0].id === 'walleye' && scored[0].s < 1.2 ? ', better at dusk' : '';
    return `${place} · ${depthTxt} · ${who}${when}`;
  }

  // --- rod up / down -----------------------------------------------------------------------------------------------
  raise() {
    if (this.rodUp) return;
    this.rodUp = true; this.state = 'ready'; this.lineOut = 0; this.power = 0; this.cooldown = 0;
    this.canoe.state.fishing = this.hands;
    this.message = null;
  }
  stow(silent = false) {
    if (this.state === 'landed') this.release(false);
    this.rodUp = false; this.state = 'stowed'; this.lineOut = 0; this.power = 0;
    this.bite = null; this.fish = null; this.pending = null;
    this.bobber.visible = false; this.line.visible = false; this.aimRing.visible = false;
    this.chase.orbitLocked = false; this.chase.focus = null;
    for (const m of this.lureMeshes) m.visible = false;
    for (const id of SPECIES_IDS) if (this.fishMeshes[id] !== this.heldFish) this.fishMeshes[id].visible = false;
    this.canoe.state.fishing = null;
    if (!silent) this.message = null;
  }

  // --- the cast ------------------------------------------------------------------------------------------------------
  // Where the player is pointing: the view's centre in first person, the cursor in third. Where that ray meets
  // the water inside the rod's reach, the cast is aimed at the spot and will not fly past it.
  computeAim() {
    const p = this.player, ch = this.chase, cam = ch.camera, t = this.tipWorld();
    const level = p.level || this.world.levelAt(p.x, p.z);
    let ox, oy, oz, dx, dy, dz;
    if (ch.mode === 'first' || !ch.cursor.inside) {
      cam.getWorldDirection(this._v2);
      ox = cam.position.x; oy = cam.position.y; oz = cam.position.z; dx = this._v2.x; dy = this._v2.y; dz = this._v2.z;
      if (ch.mode !== 'first') { ox = t.x; oy = t.y; oz = t.z; dx = p.forward.x; dz = p.forward.z; dy = -0.05; } // no cursor: dead ahead
    } else {
      this.raycaster.setFromCamera(this._ndc.set(ch.cursor.x, ch.cursor.y), cam);
      const r = this.raycaster.ray;
      ox = r.origin.x; oy = r.origin.y; oz = r.origin.z; dx = r.direction.x; dy = r.direction.y; dz = r.direction.z;
    }
    const h = Math.max(0.3, t.y - level), reach = rangeFor(TUNING.castSpeed[1], h);
    let yaw = null, point = null, dist = reach;
    if (dy < -1e-3) {
      const s = (level - oy) / dy, px = ox + dx * s, pz = oz + dz * s;
      const D = Math.hypot(px - t.x, pz - t.z);
      if (D > 1.5) { yaw = Math.atan2(-(pz - t.z), px - t.x); if (D <= reach + 2) { point = { x: px, z: pz }; dist = Math.min(D, reach); } }
    }
    if (yaw == null) yaw = Math.hypot(dx, dz) > 1e-3 ? Math.atan2(-dz, dx) : p.heading;
    let rel = yaw - p.heading; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const inArc = Math.abs(rel) <= TUNING.rodArc;
    this.aim = p.heading + clamp(rel, -TUNING.rodArc, TUNING.rodArc);
    this.aimPoint = inArc ? point : null;
    this.aimDist = inArc ? dist : reach;
    this.tipHeight = h;
    return reach;
  }

  // the ring on the water: the spot aimed at when the rod is ready, the spot this much power reaches while loading
  placeAimRing(reach) {
    const t = this.tipWorld(), s = this.state;
    const show = this.rodUp && (s === 'ready' || s === 'charging');
    if (!show) { this.aimRing.visible = false; return; }
    let d = this.aimDist;
    if (s === 'charging') d = Math.min(d, rangeFor(lerp(TUNING.castSpeed[0], TUNING.castSpeed[1], this.power), this.tipHeight));
    const x = t.x + Math.cos(this.aim) * d, z = t.z - Math.sin(this.aim) * d;
    const water = this.world.shoreAt(x, z) < 0;
    this.aimRing.visible = water;
    if (!water) return;
    this.aimRing.position.set(x, this.surfaceAt(x, z) + 0.03, z);
    const sc = 1 + 0.5 * Math.max(0, 1 - d / Math.max(1, reach)); // a touch larger close in so it still reads
    this.aimRing.scale.setScalar(sc * (this.aimPoint ? 1 : 0.8));
    this.aimRing.material.opacity = this.aimPoint ? 0.6 : 0.35;
  }

  launch() {
    const p = this.pending; this.pending = null;
    const t = this.tipWorld();
    const level = this.player.level || this.world.levelAt(this.player.x, this.player.z), h = Math.max(0.3, t.y - level);
    let sp = lerp(TUNING.castSpeed[0], TUNING.castSpeed[1], p.power), yaw = this.aim;
    const ap = this.aimPoint;
    if (ap) { const D = Math.hypot(ap.x - t.x, ap.z - t.z); if (D > 1.5) { yaw = Math.atan2(-(ap.z - t.z), ap.x - t.x); sp = Math.min(sp, speedFor(D, h)); } }
    const a = TUNING.castAngle;
    const l = this.lure;
    l.x = t.x; l.y = t.y; l.z = t.z;
    l.vx = Math.cos(yaw) * Math.cos(a) * sp; l.vz = -Math.sin(yaw) * Math.cos(a) * sp; l.vy = Math.sin(a) * sp;
    l.depth = 0; l.onLand = false; l.speed = 0;
    this.state = 'flying'; this.sinceCast = 0;
    if (this.audio) this.audio.reelClick(1.4);
  }

  splash(x, y, z, n, size = 1) {
    if (this.ripples) for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = (0.3 + Math.random() * 1.1) * size;
      this.ripples.spawn(1, x, y + 0.05, z, (0.05 + Math.random() * 0.06) * size, 0.04, 0.5 + Math.random() * 0.3, Math.cos(a) * r, (1.0 + Math.random() * 1.6) * size, Math.sin(a) * r);
    }
    if (this.ripples) for (let i = 0; i < Math.ceil(n / 2); i++) {
      const a = Math.random() * TAU, r = 0.15 + Math.random() * 0.35;
      this.ripples.spawn(3, x, y + 0.02, z, 0.05 + Math.random() * 0.05, 0.12 + Math.random() * 0.15 * size, 1.2 + Math.random() * 1.2, Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    if (this.audio) this.audio.splash(size / (1 + Math.hypot(x - this.player.x, z - this.player.z) / 25));
  }

  tipWorld() { return this.rodParts.tip.getWorldPosition(this._tip); }

  surfaceAt(x, z) { return this.world.levelAt(x, z) + (this.water ? this.water.waveAt(x, z) : 0); }

  // --- per frame -------------------------------------------------------------------------------------------------------
  update(dt, timeScale = 1) {
    const p = this.player, inp = this.input;
    if (inp.pressed('KeyL')) this.logOpen = !this.logOpen;
    const afloat = p.mode === 'paddle' && !p.landing && !p.teleporting;
    if (!afloat && this.rodUp) this.stow();
    if (afloat && inp.pressed('KeyF')) {
      if (!this.rodUp) this.raise();
      else if (this.state === 'fight') this.message = { text: 'Land it first', t: 1.5 };
      else this.stow();
    }
    if (this.message && (this.message.t -= dt) <= 0) this.message = null;
    if (this.cooldown > 0) this.cooldown -= dt;
    // the spot readout, refreshed twice a second while the rod is up
    if (this.rodUp && (this.spot.t -= dt) <= 0) {
      this.spot.t = 0.5;
      this.spot.hab = this.habitatAt(p.x, p.z);
      this.spot.text = this.describe(this.spot.hab, this.day.hours);
    }
    if (this.rodUp) {
      for (let k = 0; k < LURES.length; k++) if (inp.pressed(`Digit${k + 1}`)) {
        if (this.state === 'ready' || this.state === 'charging') { this.lureIndex = k; this.message = { text: `Tied on a ${LURES[k].name.toLowerCase()}`, t: 1.6 }; }
        else this.message = { text: 'Reel in to change lures', t: 1.6 };
      }
      const warning = p.balance > 0.25 ? p.prompt : null; // the sea's warning outranks the rod's prompts
      this.updateRodUp(dt, timeScale);
      if (warning) p.prompt = warning;
    }
    this.poseRod(dt);
    this.placeLine();
    this.placeStringer();
    this.mouse.pressed = false;
    this.fillUi();
  }

  updateRodUp(dt, ts) {
    const p = this.player, l = this.lure, w = this.world;
    this.chase.orbitLocked = this.chase.mode === 'third'; // a click casts; it does not swing the camera
    const s = this.state;
    if (s === 'ready' || s === 'charging') { const reach = this.computeAim(); this.placeAimRing(reach); } else this.aimRing.visible = false;
    if (s === 'ready') {
      if (this.buttonPressed()) { this.state = 'charging'; this.charge = 0; this.power = 0; }
      const where = this.chase.mode === 'first' ? 'where you look' : 'where the cursor points';
      p.prompt = { key: 'Space', text: `Hold to load a cast ${where} · <b>${this.lureDef.name}</b> · 1-5 to change · F puts the rod down` };
    } else if (s === 'charging') {
      this.charge += dt;
      this.power = 1 - Math.exp(-this.charge * 1.6);
      if (!this.button) { this.state = 'swing'; this.swing = 0; this.pending = { power: this.power }; }
      p.prompt = { key: null, text: 'Let go to cast' };
    } else if (s === 'swing') {
      this.swing += dt;
      if (this.pending && this.swing > 0.12) this.launch();
      if (this.swing > 0.35 && !this.pending) this.state = 'flying';
    } else if (s === 'flying') {
      this.sinceCast += dt;
      const steps = Math.max(1, Math.ceil(dt / 0.01));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        l.vy -= 9.81 * h;
        const drag = 1 - 0.08 * h;
        l.vx *= drag; l.vz *= drag; l.vy *= drag;
        l.x += l.vx * h; l.y += l.vy * h; l.z += l.vz * h;
        const water = w.shoreAt(l.x, l.z) < 0;
        const surf = water ? this.surfaceAt(l.x, l.z) : w.heightAt(l.x, l.z) + 0.05;
        if (l.y <= surf || !w.inBounds(l.x, l.z, 10)) {
          l.y = surf; l.onLand = !water; l.depth = 0; l.speed = 0;
          l.bed = water ? Math.max(0.2, w.levelAt(l.x, l.z) - w.heightAt(l.x, l.z)) : 0;
          const t = this.tipWorld();
          this.lineOut = Math.hypot(l.x - t.x, l.y - t.y, l.z - t.z) + 0.4;
          this.state = 'inwater'; this.sinceCast = 0;
          if (water) this.splash(l.x, l.y, l.z, 10, 0.9); else if (this.audio) this.audio.reelClick(0.6);
          break;
        }
      }
      const t = this.tipWorld();
      this.lineOut = Math.hypot(l.x - t.x, l.y - t.y, l.z - t.z);
      if (this.lineOut > 70) { l.vx *= 0.5; l.vz *= 0.5; }
      p.prompt = null;
    } else if (s === 'inwater' || s === 'bite') {
      this.updateLureInWater(dt, ts);
    } else if (s === 'fight') {
      this.updateFight(dt);
    } else if (s === 'landed') {
      this.updateLanded(dt);
    }
  }

  // the lure (or the bobber) sitting in the water: retrieve, sink, drift, and the bites
  updateLureInWater(dt, ts) {
    const p = this.player, l = this.lure, w = this.world, inp = this.input, def = this.lureDef;
    const t = this.tipWorld();
    const reeling = inp.held('KeyW', 'ArrowUp');
    const fast = inp.held('ShiftLeft', 'ShiftRight');
    const speed = reeling ? (fast ? TUNING.retrieve[1] : TUNING.retrieve[0]) : 0;
    l.speed += (speed - l.speed) * (1 - Math.exp(-dt * 5));
    this.sinceCast += dt;
    if (reeling) {
      this.lineOut = Math.max(1.0, this.lineOut - speed * dt);
      if (this.audio) { this.crankAcc = (this.crankAcc || 0) + dt * (fast ? 9 : 6); if (this.crankAcc >= 1) { this.crankAcc -= 1; this.audio.reelClick(1.0); } }
      this.crank += dt * (fast ? 11 : 7);
    }
    // the wind pushes a bobber along; a taut line pulls the lure after the drifting canoe
    if (def.bobber && this.wind && !l.onLand) { l.x += this.wind.dir.x * 0.012 * this.wind.speed * dt; l.z += this.wind.dir.z * 0.012 * this.wind.speed * dt; }
    const dx = l.x - t.x, dz = l.z - t.z, horiz = Math.hypot(dx, dz);
    const surf = l.onLand ? w.heightAt(l.x, l.z) + 0.05 : this.surfaceAt(l.x, l.z);
    // depth below the surface
    if (!l.onLand) {
      l.bed = Math.max(0.2, w.levelAt(l.x, l.z) - w.heightAt(l.x, l.z));
      const floor = Math.max(0.1, l.bed - 0.12);
      let target, rate;
      if (def.run === 'float') { target = Math.min(TUNING.floatDepth, floor); rate = 1.2; }
      else if (def.run === 'bottom') { target = l.speed > 0.1 ? Math.max(0.3, floor - 1.3 * l.speed) : floor; rate = l.speed > 0.1 ? 1.6 : def.sink; }
      else if (l.speed > 0.1) { target = clamp(def.run * (1.3 / Math.max(0.5, l.speed)), 0.3, floor); rate = 1.2; }
      else { target = def.sink > 0 ? floor : 0.05; rate = Math.abs(def.sink); }
      l.depth += clamp(target - l.depth, -rate * dt, rate * dt);
      l.depth = clamp(l.depth, 0, floor);
    }
    // the line is only so long: the lure (3D distance from the tip) stays within it
    const yEntry = surf - (def.bobber ? 0 : l.depth);
    const dist = Math.hypot(dx, yEntry - t.y, dz);
    if (dist > this.lineOut && horiz > 0.01) {
      const vert = yEntry - t.y;
      const allowed = Math.sqrt(Math.max(0.04, this.lineOut * this.lineOut - vert * vert));
      if (horiz > allowed) {
        const k = allowed / horiz;
        const nx = t.x + dx * k, nz = t.z + dz * k;
        if (w.shoreAt(nx, nz) < 0 || l.onLand) { l.x = nx; l.z = nz; if (l.onLand && w.shoreAt(nx, nz) < 0) { l.onLand = false; this.splash(l.x, this.surfaceAt(l.x, l.z), l.z, 4, 0.6); } }
      }
    }
    l.y = l.onLand ? surf : surf - l.depth;
    if (horiz < 1.6 || this.lineOut <= 1.05) {
      this.state = 'ready'; this.lineOut = 0; this.bite = null;
      for (const m of this.lureMeshes) m.visible = false; this.bobber.visible = false;
      return;
    }
    // the bites
    if (this.state === 'bite') return this.updateBite(dt);
    if (!l.onLand && this.sinceCast > 1.2 && this.cooldown <= 0) {
      if ((this.lureHab.t -= dt) <= 0) { this.lureHab.t = 0.5; this.lureHab.hab = this.habitatAt(l.x, l.z); }
      const hab = this.lureHab.hab;
      if (hab) {
        let total = 0;
        for (const id of SPECIES_IDS) { const f = this.factors[id] || (this.factors[id] = {}); total += this.rateFor(id, hab, def, l.depth, l.speed, this.day.hours, f); }
        this.rate = total;
        if (Math.random() < 1 - Math.exp(-total * dt * ts)) {
          let r = Math.random() * total, id = SPECIES_IDS[0];
          for (const s of SPECIES_IDS) { r -= this.factors[s].rate; if (r <= 0) { id = s; break; } }
          this.startBite(id);
        }
      }
    }
    if (l.onLand) p.prompt = { key: 'W', text: 'The lure is on the rocks — reel it back' };
    else p.prompt = { key: 'W', text: `${def.bobber ? 'Watch the bobber' : 'Retrieve'} · ${this.lineOut.toFixed(0)} m out${def.bobber ? '' : ` · ${l.depth.toFixed(1)} m down`}` };
  }

  startBite(id, lengthCm = null) {
    const sp = SPECIES[id];
    const u = Math.pow(Math.random(), 1.7);
    const length = lengthCm ?? lerp(sp.length[0], sp.length[1], u);
    const weight = sp.k * Math.pow(length / 100, 3);
    this.bite = { species: id, length, weight, t: 0, lure: this.lureIndex };
    this.state = 'bite';
    if (this.audio) this.audio.bite(this.lureDef.bobber ? 1 : 0.6);
  }

  updateBite(dt) {
    const b = this.bite, p = this.player;
    b.t += dt;
    const [w0, w1] = TUNING.hookWindow;
    const set = this.buttonPressed() || this.input.pressed('KeyW');
    if (set && b.t >= w0 && b.t <= w1) { this.hook(); return; }
    if (b.t > w1 + 0.25 || (set && b.t < w0)) {
      this.state = 'inwater'; this.bite = null; this.cooldown = 2.5 + Math.random() * 4;
      this.message = { text: set ? 'Too soon — it spat the hook' : 'Missed it', t: 2 };
      return;
    }
    p.prompt = { key: 'Space', text: this.lureDef.bobber ? 'Bobber down! Set the hook' : 'Tap tap… set the hook' };
  }

  hook() {
    const b = this.bite, l = this.lure, t = this.tipWorld();
    const w = b.weight;
    const away = Math.atan2(-(l.z - t.z), l.x - t.x);
    this.fish = {
      ...b, x: l.x, z: l.z, depth: Math.max(0.6, l.depth), heading: away,
      stamina: 0.6 + 0.3 * Math.min(6, w), pull: clamp(0.22 + 0.5 * Math.sqrt(w / 4), 0.22, 1),
      runSpeed: 1.6 + 2.4 * Math.min(1, w / 4), run: 0, nextRun: 0.6 + Math.random() * 1.5, tension: 0.35, danger: 0, slack: 0, t: 0, surf: 0,
    };
    this.bite = null; this.state = 'fight';
    this.lineOut = Math.max(this.lineOut, 2);
    this.bobber.visible = false;
    this.splash(l.x, this.surfaceAt(l.x, l.z), l.z, 8, 0.8 + Math.min(1, w / 3));
    if (this.audio) this.audio.reelClick(1.6);
  }

  // The fight. Tension rises while you reel and falls when you let the fish run; the fish pulls in pulses that
  // weaken as it tires. Red for too long parts the line, slack for too long throws the hook.
  updateFight(dt) {
    const f = this.fish, p = this.player, w = this.world, t = this.tipWorld();
    f.t += dt;
    const reeling = this.button || this.input.held('KeyW', 'ArrowUp');
    // runs
    f.nextRun -= dt;
    if (f.run > 0) { f.run -= dt; f.stamina = Math.max(0, f.stamina - dt * 0.09); }
    else if (f.nextRun <= 0 && f.stamina > 0.12) { f.run = 1.0 + Math.random() * 2.2 * Math.min(1, f.stamina); f.nextRun = 2.5 + Math.random() * 5 + (1 - Math.min(1, f.stamina)) * 4; f.heading += (Math.random() - 0.5) * 1.6; if (Math.random() < 0.4) f.surf = 0.8; }
    else f.stamina = Math.max(0, f.stamina - dt * 0.012);
    const tired = 1 - Math.min(1, f.stamina), pullNow = clamp(f.pull * (f.run > 0 ? 2.1 : 0.9) * (1 - 0.55 * tired), 0.08, 1.4);
    // tension follows a target set by the reel and the fish
    const target = reeling ? clamp(0.42 + 0.5 * pullNow, 0, 1) : clamp(0.12 * pullNow, 0, 1);
    f.tension += (target - f.tension) * (1 - Math.exp(-dt * 2.8));
    if (f.tension > 0.8) f.danger += (f.tension - 0.8) * dt * 7; else f.danger = Math.max(0, f.danger - dt * 0.45);
    if (f.tension < 0.1) f.slack += dt; else f.slack = 0;
    if (f.danger > TUNING.snapDanger) return this.endFight('snap');
    if (f.slack > TUNING.slackLimit) return this.endFight('thrown');
    // line: in against the reel, out with the run
    let dLine = 0;
    if (reeling) dLine -= TUNING.reelSpeed * (1 - 0.65 * Math.min(1, pullNow)) * dt;
    if (f.run > 0) dLine += f.runSpeed * Math.min(1, f.stamina + 0.2) * dt * (reeling ? 0.6 : 1);
    else if (!reeling) dLine += 0.25 * dt;
    this.lineOut = clamp(this.lineOut + dLine, 0.5, 90);
    // the fish moves: away on a run, toward the hull as line comes in, always in water
    const away = Math.atan2(-(f.z - t.z), f.x - t.x);
    let dh = f.heading - away; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    f.heading = away + clamp(dh, -1.1, 1.1) + Math.sin(f.t * 1.7 + this.wanderSeed) * 0.25 * dt;
    const spd = f.run > 0 ? f.runSpeed * Math.min(1, f.stamina + 0.2) : 0.3;
    let nx = f.x + Math.cos(f.heading) * spd * dt, nz = f.z - Math.sin(f.heading) * spd * dt;
    if (w.shoreAt(nx, nz) > -1.5) { f.heading += Math.PI * 0.5; nx = f.x; nz = f.z; }
    f.x = nx; f.z = nz;
    const dx = f.x - t.x, dz = f.z - t.z, horiz = Math.hypot(dx, dz);
    const allowed = Math.sqrt(Math.max(0.09, this.lineOut * this.lineOut - Math.min(this.lineOut * 0.9, (t.y - this.surfaceAt(f.x, f.z) + f.depth)) ** 2));
    if (horiz > allowed) { const k = allowed / horiz; const px = t.x + dx * k, pz = t.z + dz * k; if (w.shoreAt(px, pz) < -1) { f.x = px; f.z = pz; } }
    // depth: deep on a run, up when close or surfacing
    const near = smoothstep(8, 2.5, horiz);
    f.surf = Math.max(0, f.surf - dt);
    const targetDepth = f.surf > 0 ? 0.12 : lerp(f.run > 0 ? 1.6 : 1.0, 0.3, near);
    f.depth += (targetDepth - f.depth) * (1 - Math.exp(-dt * 2));
    const surf = this.surfaceAt(f.x, f.z);
    if ((f.surf > 0.6 && f.surf < 0.8) || (f.run > 0 && Math.random() < dt * 1.5)) this.splash(f.x, surf, f.z, 5, 0.6 + Math.min(1, f.weight / 3));
    this.lure.x = f.x; this.lure.z = f.z; this.lure.y = surf - f.depth; this.lure.depth = f.depth;
    if (this.audio) {
      this.crankAcc = (this.crankAcc || 0) + dt * (reeling ? 7 : 0) + (f.run > 0 ? dt * 22 : 0);
      if (this.crankAcc >= 1) { this.crankAcc -= 1; this.audio.reelClick(f.run > 0 ? 1.8 : 1.0); }
    }
    if (reeling) this.crank += dt * 7;
    if (this.lineOut <= TUNING.landAt && horiz < 3.5) return this.land();
    const sp = SPECIES[f.species];
    p.prompt = { key: null, text: f.danger > 0.35 ? 'Ease off — the line is singing' : f.slack > 1 ? 'Reel! The line has gone slack' : f.run > 0 ? 'It is running — let it go' : `Reel it in · ${this.lineOut.toFixed(0)} m${f.t > 6 ? ` · feels like a ${sp.name.toLowerCase()}` : ''}` };
  }

  endFight(how) {
    const f = this.fish;
    this.fish = null;
    for (const id of SPECIES_IDS) if (this.fishMeshes[id] !== this.heldFish) this.fishMeshes[id].visible = false;
    for (const m of this.lureMeshes) m.visible = false;
    if (how === 'snap') {
      this.message = { text: `The line parted — the ${SPECIES[f.species].name.toLowerCase()} kept the ${this.lureDef.name.toLowerCase()}. Tying on another…`, t: 3.5 };
      if (this.audio) this.audio.snap();
    } else {
      this.message = { text: `It threw the hook`, t: 2.5 };
      this.splash(f.x, this.surfaceAt(f.x, f.z), f.z, 6, 0.7);
    }
    this.state = 'ready'; this.lineOut = 0; this.cooldown = 2;
  }

  land() {
    const f = this.fish;
    this.fish = null;
    this.state = 'landed';
    const sp = SPECIES[f.species];
    const entry = this.record(f, false);
    this.landed = { ...f, t: 0, entry };
    for (const m of this.lureMeshes) m.visible = false;
    const mesh = this.fishMeshes[f.species];
    this.heldFish = mesh;
    this.canoe.paddler.add(mesh);
    mesh.visible = true;
    mesh.scale.setScalar(f.length / 100);
    this.splash(f.x, this.surfaceAt(f.x, f.z), f.z, 12, 0.8 + Math.min(1.2, f.weight / 3));
    const lb = f.weight * 2.2046;
    this.message = { text: `${sp.name} · ${Math.round(f.length)} cm · ${f.weight.toFixed(f.weight < 1 ? 2 : 1)} kg (${lb.toFixed(1)} lb)${entry.best ? ' · a personal best!' : ''}`, t: TUNING.holdUp };
    this.lineOut = 0;
  }

  // The fish is held up for a look: the camera comes round to the paddler's front quarter until it is kept
  // or let go (E or K; a stray click does not end it), or the hold-up time runs out.
  updateLanded(dt) {
    const L = this.landed, p = this.player;
    L.t += dt;
    const keep = this.input.pressed('KeyK'), rel = this.input.pressed('KeyE');
    if (keep && L.t > 0.4) return this.release(true);
    if ((rel && L.t > 0.4) || L.t > TUNING.holdUp) return this.release(false);
    const f = p.forward, rx = -f.z, rz = f.x, y = this.canoe.rig.position.y;
    const fx = this.focus;
    fx.pos.set(p.x + f.x * 1.5 + rx * 1.55, y + 1.25, p.z + f.z * 1.5 + rz * 1.55);
    fx.look.set(p.x - f.x * 1.2, y + 0.78, p.z - f.z * 1.2);
    this.chase.focus = fx;
    p.prompt = { key: 'E', text: `Let it go · <kbd>K</kbd>keep it on the stringer` };
  }

  release(keep) {
    const L = this.landed;
    this.landed = null;
    this.chase.focus = null;
    const mesh = this.heldFish;
    this.heldFish = null;
    if (mesh) { this.canoe.paddler.remove(mesh); this.scene.add(mesh); mesh.visible = false; mesh.scale.setScalar(1); }
    if (L) {
      L.entry.kept = keep; this.logVersion++; this.saveLog();
      if (keep) { this.stringer.push({ species: L.species, length: L.length }); this.message = { text: `On the stringer · ${this.stringer.length} fish`, t: 2 }; }
      else { const r = this.canoe.rig, f = this.player.forward; const x = r.position.x - f.z * 1.2, z = r.position.z + f.x * 1.2; this.splash(x, this.surfaceAt(x, z), z, 7, 0.7); this.message = { text: 'Released', t: 1.5 }; }
    }
    this.state = 'ready';
  }

  // --- posing ------------------------------------------------------------------------------------------------------------
  // The rod in rig space (+x bow, +z starboard): held in the right hand ahead of the hip, pointing where the cast goes.
  poseRod(dt) {
    const rod = this.rod, parts = this.rodParts, s = this.state, p = this.player;
    let grip, yaw, pitch, bend = 0.02, k = 1 - Math.exp(-dt * 10);
    if (!this.rodUp || s === 'landed') {
      // laid along the hull floor on the starboard side (or across the gunwales while the fish is held up)
      grip = s === 'landed' ? V(-0.95, 0.36, -0.6) : V(-1.05, 0.1, 0.24);
      yaw = s === 'landed' ? -Math.PI / 2 : 0.02; pitch = s === 'landed' ? 0 : 0.02;
      k = this.rodUp ? k : 1;
    } else {
      grip = V(-1.22, 0.62, 0.08);
      let relYaw = this.aim - p.heading; relYaw = Math.atan2(Math.sin(relYaw), Math.cos(relYaw));
      yaw = clamp(relYaw, -TUNING.rodArc, TUNING.rodArc);
      if (s === 'ready') pitch = 0.45;
      else if (s === 'charging') { pitch = lerp(0.5, 1.75, this.power); grip.x -= 0.1 * this.power; grip.y += 0.1 * this.power; }
      else if (s === 'swing') { const u = clamp(this.swing / 0.3, 0, 1); pitch = lerp(1.75, 0.3, 1 - (1 - u) * (1 - u)); bend = -0.6 * Math.sin(u * Math.PI); k = 1 - Math.exp(-dt * 30); }
      else if (s === 'flying') pitch = 0.35;
      else if (s === 'inwater' || s === 'bite') { pitch = 0.4 + (this.lure.speed > 0.1 ? 0.05 * Math.sin(this.crank * 0.8) : 0); bend = 0.03 + (s === 'bite' && !this.lureDef.bobber ? 0.12 * Math.abs(Math.sin(this.bite.t * 14)) : 0) + 0.02 * this.lure.speed; }
      else if (s === 'fight') { const f = this.fish; pitch = 0.75 + 0.35 * f.tension; bend = 0.15 + 1.0 * f.tension + 0.04 * Math.sin(f.t * 9) * (f.run > 0 ? 1 : 0.2); grip.y += 0.08 * f.tension; }
      else pitch = 0.4;
    }
    this._grip.lerp(grip, k);
    this.yaw += (yaw - this.yaw) * k; this.pitch += (pitch - this.pitch) * k; this.bend += (bend - this.bend) * (1 - Math.exp(-dt * 8));
    rod.position.copy(this._grip);
    rod.rotation.set(0, this.yaw, this.pitch, 'YXZ');
    const N = parts.segs.length;
    for (let i = 0; i < N; i++) parts.segs[i].rotation.z = -this.bend * ((i + 1) / N) * 0.42;
    parts.crank.rotation.z = this.crank;
    this.canoe.rig.updateMatrixWorld(true); // the tip's world position is read this frame, before the render
    // hands for the paddler rig: right hand behind the reel, left on the crank (or on the fish)
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._dir.set(cp * cy, sp, -cp * sy);
    this._up.set(-sp * cy, cp, sp * sy);
    this._side.crossVectors(this._dir, this._up);
    const H = this.hands;
    if (s === 'landed' && this.heldFish) {
      const L = Math.min(0.42, this.landed.length / 100 * 0.38);
      this.heldFish.position.set(0.44, 0.74 + 0.05 * Math.sin(this.landed.t * 2), 0);
      this.heldFish.rotation.set(0.25, Math.PI / 2, 0.08 * Math.sin(this.landed.t * 3));
      H.L.set(0.42, 0.7, -L).add(this.canoe.paddler.position); H.R.set(0.42, 0.7, L).add(this.canoe.paddler.position);
    } else if (this.rodUp) {
      H.R.copy(this._grip).addScaledVector(this._dir, -0.05).addScaledVector(this._up, -0.015);
      const reeling = (s === 'inwater' && this.lure.speed > 0.1) || (s === 'fight' && (this.button || this.input.held('KeyW', 'ArrowUp')));
      if (reeling || s === 'fight') {
        H.L.copy(this._grip).addScaledVector(this._dir, 0.1 + 0.045 * Math.sin(this.crank)).addScaledVector(this._up, -0.1 + 0.045 * Math.cos(this.crank)).addScaledVector(this._side, 0.06);
      } else H.L.copy(this._grip).addScaledVector(this._dir, 0.3).addScaledVector(this._up, -0.01).addScaledVector(this._side, -0.02);
    }
  }

  // the line from the tip to the water and down to the lure, the bobber and the lure meshes
  placeLine() {
    const s = this.state, l = this.lure, N = this.LINE_N, pos = this.linePos;
    if (!this.rodUp || s === 'landed') { this.line.visible = false; this.bobber.visible = false; for (const m of this.lureMeshes) m.visible = false; if (!this.rodUp) for (const id of SPECIES_IDS) if (this.fishMeshes[id] !== this.heldFish) this.fishMeshes[id].visible = false; return; }
    const t = this.tipWorld();
    const def = this.lureDef, lm = this.lureMeshes[this.lureIndex];
    for (let i = 0; i < this.lureMeshes.length; i++) this.lureMeshes[i].visible = i === this.lureIndex;
    let end, sag, under = null;
    const dangle = s === 'ready' || s === 'charging' || s === 'swing';
    if (dangle) {
      const sw = Math.sin(this.player.time * 2.1) * 0.08 * (s === 'charging' ? 2 : 1);
      end = this._v.set(t.x + sw * Math.cos(this.aim + 1.5), t.y - 0.6, t.z + sw * 0.5);
      sag = 0;
      this.bobber.visible = def.bobber;
      if (def.bobber) { this.bobber.position.set(end.x, end.y + 0.35, end.z); this.bobber.rotation.set(0.1, 0, 0.1); }
    } else {
      const surf = l.onLand ? l.y : this.surfaceAt(l.x, l.z);
      if (def.bobber && (s === 'inwater' || s === 'bite')) {
        const dip = s === 'bite' ? 0.28 * Math.max(0, Math.sin(Math.min(Math.PI, this.bite.t * 4.2))) : 0;
        end = this._v.set(l.x, surf - dip + (l.onLand ? 0.1 : 0.0), l.z);
        this.bobber.visible = true;
        this.bobber.position.copy(end);
        this.bobber.rotation.set(0.12 * Math.sin(this.player.time * 1.3), 0, 0.12 * Math.cos(this.player.time * 1.1) + (s === 'bite' ? 0.5 * dip : 0));
        under = this._v2.set(l.x, l.y, l.z);
      } else {
        end = this._v.set(l.x, l.y, l.z);
        this.bobber.visible = false;
      }
      const dist = Math.hypot(end.x - t.x, end.y - t.y, end.z - t.z);
      sag = s === 'flying' ? 0.1 : clamp((this.lineOut - dist) * 0.35, 0, 2.5) + (s === 'fight' ? 0.05 * (1 - this.fish.tension) : 0.08);
    }
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), o = i * 3;
      pos[o] = lerp(t.x, end.x, u); pos[o + 1] = lerp(t.y, end.y, u) - sag * 4 * u * (1 - u); pos[o + 2] = lerp(t.z, end.z, u);
    }
    const o = N * 3;
    if (under) { pos[o] = under.x; pos[o + 1] = under.y; pos[o + 2] = under.z; } else { pos[o] = end.x; pos[o + 1] = end.y; pos[o + 2] = end.z; }
    pos[o + 3] = pos[o]; pos[o + 4] = pos[o + 1]; pos[o + 5] = pos[o + 2];
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.geometry.computeBoundingSphere();
    this.line.visible = true;
    // the lure itself
    const lp = under || end;
    lm.visible = s !== 'fight';
    lm.position.copy(dangle ? end : lp);
    if (!dangle && s !== 'flying' && l.speed > 0.1) lm.rotation.set(0, Math.atan2(-(t.z - l.z), t.x - l.x), 0.3 * Math.sin(this.crank * 2));
    else if (s === 'flying') lm.rotation.set(0, Math.atan2(-l.vz, l.vx), Math.atan2(l.vy, Math.hypot(l.vx, l.vz)));
    else lm.rotation.set(0, this.aim, -1.2);
    // the fish on the line, seen through the water when it is near
    if (s === 'fight') {
      const f = this.fish, m = this.fishMeshes[f.species];
      const horiz = Math.hypot(f.x - t.x, f.z - t.z);
      m.visible = horiz < 14;
      m.scale.setScalar(f.length / 100);
      m.position.set(f.x, l.y, f.z);
      const yawTo = Math.atan2(-(f.z - t.z), f.x - t.x);
      m.rotation.set(0.25 * Math.sin(f.t * 6) * (f.run > 0 ? 1 : 0.3), (f.run > 0 ? f.heading : yawTo + Math.PI) + 0.3 * Math.sin(f.t * 5), 0.15 * Math.sin(f.t * 7));
    } else for (const id of SPECIES_IDS) if (this.fishMeshes[id] !== this.heldFish) this.fishMeshes[id].visible = false;
  }

  // kept fish hang head-up over the port gunwale beside the paddler
  placeStringer() {
    const n = Math.min(5, this.stringer.length);
    while (this.stringerMeshes.length < n) {
      const s = this.stringer[this.stringerMeshes.length];
      const m = this.fishMeshes[s.species].clone();
      m.visible = true;
      this.canoe.rig.add(m);
      this.stringerMeshes.push(m);
    }
    while (this.stringerMeshes.length > n) { const m = this.stringerMeshes.pop(); this.canoe.rig.remove(m); }
    for (let i = 0; i < n; i++) {
      const s = this.stringer[i], m = this.stringerMeshes[i], L = s.length / 100;
      m.scale.setScalar(L);
      m.position.set(-0.85 + i * 0.3, 0.3 - L / 2, -0.56);
      m.rotation.set(0.2, 0, -Math.PI / 2 + 0.06 * Math.sin(this.player.time * 1.5 + i));
      m.visible = this.player.mode === 'paddle';
    }
  }

  fillUi() {
    const u = this.ui;
    u.rodUp = this.rodUp; u.state = this.state; u.lure = this.lureIndex; u.lures = LURES;
    u.power = this.state === 'charging' ? this.power : null;
    u.spot = this.rodUp ? this.spot.text : '';
    u.fight = this.fish ? { tension: this.fish.tension, danger: this.fish.danger, slack: this.fish.slack, line: this.lineOut, run: this.fish.run > 0 } : null;
    u.message = this.message ? this.message.text : null;
    u.stringer = this.stringer.length;
    u.log = this.log; u.bests = this.bests; u.logVersion = this.logVersion; u.logOpen = this.logOpen;
    u.rate = this.rate;
    return u;
  }
}
