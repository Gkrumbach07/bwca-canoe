import * as THREE from 'three';
import { clock12, esc } from './hud.js';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32, clamp, lerp, smoothstep, hash2 } from './rng.js';
import { makeToonMaterial, smoothToon } from './rocks.js';
import { makeLookMaterial } from './shading.js';
import { buildRod } from './gear.js';
import { SEATS, sheerY, floorAt } from './hull.js';
import { calmAt, rockAt } from './fields.js';
import { rockSlope } from './terrain-build.js';
import { windHeight } from './waves.js';
import { itemDef } from './items.js';

// Fishing from the canoe. F brings the rod up (the paddle rests across the gunwales); hold Space or the
// mouse to load a cast and let go; the lure flies, splashes down and sinks or hangs under a bobber; W
// retrieves. Fish bite at a rate built from the water under the lure (depth, shore, weeds, rock,
// drop-offs), the lure and how it is worked, the hour, the lake's clarity and the chop. A bite is a dip
// or a twitch and a window to set the hook; the fight is a tension bar: reel against the fish, ease off
// when it runs. Nothing fails you: a snapped line costs the lure, a thrown hook costs nothing.
// Everything here is tunable through TUNING, SPECIES and LURES (window.__game.fishing holds them).
// wc C (the owner, 2026-10-24: "why can't I put the fishing rod in my hand and fish with it outside of canoe"): on foot
// with the rod in a hand (the book: drag it to a hand slot, or Put in hand; inventory.rodInHand) the same F brings it up
// facing water within a cast, from the shore, a dock or a rock, and the cast, the retrieve, the bites, the fight and the
// catch card are the canoe's; the standing figure holds it (canoe.js rodArms).
// fb3 B (the owner, 2026-10-25: "same thing with fish on the stringer. it auto puts it there which i only want if i say
// put on stringer and the stringer is nearby. otherwise it goes into my hand", "how do i use leaches?"): a kept fish (E at the catch; fb4 D, was K)
// goes into your hand (inventory.toHandNew; into a pack or a barrel in reach when both hands are full, let go when
// nothing has room), never onto the stringer by itself: "Put on the stringer" is its verb in the book while the stringer
// is in reach (inventory.verb). The bobber rig takes one leech from the bucket per bite, and the bucket must be in
// reach (in a hand, within 3 m, or in the canoe you are in or beside): without one the rig can't be cast and the strip
// reads "needs leeches" (ui.needsLeeches). fishing.stringer is only ever rebuilt from the stringer container.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
// wc C: on foot. offShore: no further than this from the water's edge; reach: open water looked for this far ahead, in a
// fan either side of the way you face; drag: a lure reeled this close to the tip comes up the bank to your feet
const FOOT = { offShore: 12, reach: 24, drag: 4 };
const STEADY = 0.4; // fb4 D: seconds the leeches' reach must say the same before the strip and the prompt change

export const TUNING = {
  // bites per real second for one species at every factor 1.0. tuning: the one clock (fb5 C) made a game hour of
  // fishing three times the real seconds it was (the idle clock had run ×12, now ×4), so 1/80 brought three times the
  // bites a game hour, and the fight and the catch card (about 35 real s a fish) had shrunk to a third of the game
  // minutes too: a scripted season landed 14–23 a game hour on a jig, 22 on leeches (a dozen gone in half an hour),
  // where the old clock gave about 5. A fifth of the old rate brings a game hour back near that (1/240, a third, still
  // landed 9: the handling's real seconds count for less of a game hour than they did): a bite every two real minutes.
  base: 1 / 400,
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
  { id: 'jig', name: 'Jig & twister', short: 'jig', sink: 0.9, run: 'bottom', still: 0.7, slow: 1.0, fast: 0.5, colour: 0xd8b84a },
  { id: 'spinner', name: 'Mepps spinner', short: 'spinner', sink: 0.35, run: 1.0, still: 0.15, slow: 0.85, fast: 1.1, colour: 0xd9c38a },
  { id: 'spoon', name: 'Daredevle spoon', short: 'spoon', sink: 0.6, run: 2.2, still: 0.25, slow: 1.0, fast: 1.0, colour: 0xe0c070 },
  { id: 'crankbait', name: 'Jointed Rapala', short: 'Rapala', sink: -0.5, run: 3.4, still: 0.2, slow: 0.95, fast: 1.1, colour: 0x8fb07a },
  { id: 'leech', name: 'Bobber & leech', short: 'leech', sink: 0.5, run: 'float', still: 1.0, slow: 0.8, fast: 0.3, colour: 0x2e2a2a, bobber: true },
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
// Geometry. The rod (blank, cork, reel, guides) is gear.js's; the fish are one blob body with fins, built at a
// length of one metre along +x and scaled to the catch.
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
    this.rodParts = buildRod(makeLookMaterial({}, { wrap: 0, name: 'look-solid' }));
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
    this.aimWorld = null;   // where the ring sits on the water, for the HUD's reticle
    this.screenReticle = true; // the HUD draws the reticle; the ring in the world stays hidden
    this.focus = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

    this.rodUp = false;
    this.onFoot = false;       // wc C: the rod up standing on foot (the shore, a dock, a rock), not from the canoe
    this.inventory = null;     // wc C: set by main.js: the inventory, for the rod in a hand (rodInHand) and the canoe's reach
    this.indoors = null;       // wc C: set by main.js: () => inside a store
    this.footWater = null;     // wc C: the nearest open water found ahead on foot { x, z, d }, for the spot readout
    this.state = 'stowed';     // stowed | ready | charging | swing | flying | inwater | bite | fight | landed
    this.lureIndex = 0;
    // fb G: the lures you have (keys 1–n and the strip list only these): hasLure(id) is set by main.js (the shop's
    // tackle box, or the inventory's); without it every lure is to hand
    this.hasLure = null;
    this.owned = LURES.map((_, i) => i); this.ownedT = 0; this.ownedSig = '';
    this.ownedNext = null; this.needsShown = null; this.needsFor = 0; // fb4 D: the steadied lure list and leeches (refreshOwned, steadyNeeds)
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
    // for the paddler's arms (canoe.js): the right fist round the cork (the rod's axis and its up for the palm),
    // the left on the crank knob (its axle) or the butt; the rod's yaw, how far to lean, where to look
    this.hands = { L: new THREE.Vector3(), R: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), knobAxis: new THREE.Vector3(0, 0, -1), yaw: 0, lean: 0, look: 0 };
    this.wanderSeed = 0;
  }

  get lureDef() { return LURES[this.lureIndex]; }
  // fb G: the indices (into LURES) of the lures you have, in LURES's order. With none, the jig: there is always a spare
  // in the bottom of the box (shop.js onSnap)
  ownedLures() {
    const has = this.hasLure;
    const out = [];
    for (let i = 0; i < LURES.length; i++) {
      let ok = true;
      if (has) { try { ok = !!has(LURES[i].id); } catch { ok = true; } }
      if (!ok && LURES[i].bobber && this.ownsBait()) ok = true; // fb3 B: the rig is listed while you own a bucket or leeches at all; "needs leeches" when none is in reach
      if (ok) out.push(i);
    }
    if (!out.length) out.push(Math.max(0, LURES.findIndex((l) => l.id === 'jig')));
    return out;
  }
  // --- fb3 B: the leeches ---------------------------------------------------------------------------------------------
  // the leech bucket within reach (inventory.js inReach: in a hand, on the ground within 3 m, in the canoe you are in or
  // beside), or null
  bucketInReach() {
    const inv = this.inventory;
    if (!inv || !inv.attached || typeof inv.inReach !== 'function') return false;
    try { const k = inv.ctx(); return inv.containers.some((c) => c.item === 'bucket' && inv.inReach(c, k)); } catch { return false; }
  }
  // a bucket or leeches owned anywhere (the rig stays on the strip, "needs leeches" when none is to hand)
  ownsBait() {
    const inv = this.inventory;
    if (!inv || !inv.attached) return false;
    try { return inv.containers.some((c) => c.item === 'bucket') || inv.count('leeches', { reachable: false }) > 0; } catch { return false; }
  }
  // the first leech in reach: { c, e } or null
  leechSource() {
    const inv = this.inventory;
    if (!inv || !inv.attached || typeof inv.find !== 'function') return null;
    try { return inv.find('leeches', { reachable: true })[0] || null; } catch { return null; }
  }
  leechCount() { const inv = this.inventory; try { return inv && inv.attached ? inv.count('leeches') : 0; } catch { return 0; } }
  // you have bait somewhere but no leech is to hand (the strip says "needs leeches"; the bobber rig can't be cast)
  needsRaw() { return !!(this.inventory && this.inventory.attached && this.ownsBait() && !this.leechSource()); }
  // fb4 D (decision 6): what the strip, the prompt and the cast go by, which changes only once the reach has said the
  // same for STEADY seconds (a bucket at the edge of the 3 m reach, a hull swinging on the swell, must not flick the strip)
  get needsLeeches() { return this.needsShown ?? this.needsRaw(); }
  steadyNeeds(dt) {
    if (!this.rodUp) { this.needsShown = null; this.needsFor = 0; return; }
    const raw = this.needsRaw();
    if (this.needsShown == null || raw === this.needsShown) { this.needsShown = raw; this.needsFor = 0; return; }
    if ((this.needsFor += dt) >= STEADY) { this.needsShown = raw; this.needsFor = 0; }
  }
  // one leech off the bucket (a bite took it): false when there was none
  takeLeech() {
    const s = this.leechSource(); if (!s) return false;
    this.inventory.take(s.c.id, s.e.uid, 1);
    if (this.rodUp) this.needsShown = this.needsRaw(); // (the last one going is said at once)
    return true;
  }
  // the owned list refreshed four times a second, and on a change the tied-on lure kept to one you have (between casts).
  // fb4 D (decision 6): a new list is taken once it has read the same twice running (a tackle box at the edge of the
  // reach), and the bobber rig, listed while you own bait anywhere, is tied on and kept like any lure: the shop's own
  // check of the box (main.js fb4 D) counts it as there too, so the two no longer tie it on and off by turns, four
  // times a second, which flashed the bobber at the rod's tip, the strip and the "needs leeches" prompt (the owner).
  refreshOwned(dt) {
    if ((this.ownedT -= dt) > 0) return;
    this.ownedT = 0.25;
    const next = this.ownedLures(), sig = next.join(',');
    if (sig !== this.owned.join(',') && this.ownedNext !== sig) { this.ownedNext = sig; return; } // a first reading of a new list: wait
    this.ownedNext = null;
    this.owned = next;
    if (!this.owned.includes(this.lureIndex) && (this.state === 'stowed' || this.state === 'ready')) this.lureIndex = this.owned[0];
  }
  lureKeys() { const n = this.owned.length; return n > 1 ? `1–${n} change the lure` : '1 the lure'; }
  get button() { return this.input.held('Space') || this.mouse.down; }
  buttonPressed() { return this.input.pressed('Space') || this.mouse.pressed; }

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
  // the lake a fish came out of: under the fish (on foot you stand on the shore), else under you
  catchLake(f) { const w = this.world; return (f && Number.isFinite(f.x) ? w.lakeIdAt(f.x, f.z) : 0) || w.lakeIdAt(this.player.x, this.player.z); }
  record(fish, kept) {
    const w = this.world, id = this.catchLake(fish);
    const entry = { species: fish.species, name: SPECIES[fish.species].name, length: Math.round(fish.length), weight: Math.round(fish.weight * 100) / 100, lake: w.lakeName(id) || 'Unnamed water', time: this.day.clock, hours: this.day.hours, doy: this.day.doy, year: this.day.year, lure: LURES[fish.lure].name, lureShort: LURES[fish.lure].short, kept, at: Date.now() };
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
    f.rate = TUNING.base * f.abundance * f.lure * f.bed * f.zone * f.shore * f.structure * f.time * f.clarity * f.wind * f.action * (this.kit ? this.kit.mods.bite : 1); // (content C: the lucky cap)
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
    const clarity = hab.secchi ? ` · ${hab.secchi < 1.8 ? 'stained' : hab.secchi < 3 ? 'fair' : 'clear'} water, ${hab.secchi.toFixed(1)} m` : '';
    const whoLine = top.length ? `${who[0].toUpperCase()}${who.slice(1)}${when}.` : `Slow water${when}.`;
    return { where: `${place} · ${depthTxt}${clarity}`, who: whoLine, text: `${place} · ${depthTxt} · ${who}${when}` };
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
    this.rodUp = false; this.onFoot = false; this.state = 'stowed'; this.lineOut = 0; this.power = 0;
    this.bite = null; this.fish = null; this.pending = null;
    this.bobber.visible = false; this.line.visible = false; this.aimRing.visible = false;
    this.chase.orbitLocked = false; this.chase.focus = null;
    for (const m of this.lureMeshes) m.visible = false;
    for (const id of SPECIES_IDS) if (this.fishMeshes[id] !== this.heldFish) this.fishMeshes[id].visible = false;
    this.canoe.state.fishing = null;
    if (!silent) this.message = null;
  }

  // --- the cast ------------------------------------------------------------------------------------------------------
  // Where the player is pointing: the ray through the cursor in either view (the view's own centre when the
  // cursor is off the page). Where it meets the water inside the rod's reach, the cast is aimed at the spot
  // and will not fly past it.
  // the water's level: the hull's afloat, the nearest water's on foot
  waterLevel() { const p = this.player; return !this.onFoot && p.level ? p.level : this.world.levelAt(p.x, p.z); }
  computeAim() {
    const p = this.player, ch = this.chase, cam = ch.camera, t = this.tipWorld();
    const level = this.waterLevel();
    let ox, oy, oz, dx, dy, dz;
    if (!ch.cursor.inside) {
      cam.getWorldDirection(this._v2);
      ox = cam.position.x; oy = cam.position.y; oz = cam.position.z; dx = this._v2.x; dy = this._v2.y; dz = this._v2.z;
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
    if (!show) { this.aimRing.visible = false; this.aimWorld = null; return; }
    let d = this.aimDist;
    if (s === 'charging') d = Math.min(d, rangeFor(lerp(TUNING.castSpeed[0], TUNING.castSpeed[1], this.power), this.tipHeight));
    const x = t.x + Math.cos(this.aim) * d, z = t.z - Math.sin(this.aim) * d;
    const water = this.world.shoreAt(x, z) < 0;
    this.aimRing.visible = water && !this.screenReticle;
    this.aimWorld = water ? { x, y: this.surfaceAt(x, z) + 0.03, z, dist: d, inReach: !!this.aimPoint } : null;
    if (!water) return;
    this.aimRing.position.set(x, this.aimWorld.y, z);
    const sc = 1 + 0.5 * Math.max(0, 1 - d / Math.max(1, reach)); // a touch larger close in so it still reads
    this.aimRing.scale.setScalar(sc * (this.aimPoint ? 1 : 0.8));
    this.aimRing.material.opacity = this.aimPoint ? 0.6 : 0.35;
  }

  launch() {
    const p = this.pending; this.pending = null;
    const t = this.tipWorld();
    const level = this.waterLevel(), h = Math.max(0.3, t.y - level);
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
    if (this.audio) { if (this.audio.emit) this.audio.emit('splash', { x, y, z, size }); else this.audio.splash(size / (1 + Math.hypot(x - this.player.x, z - this.player.z) / 25)); }
  }

  tipWorld() { return this.rodParts.tip.getWorldPosition(this._tip); }

  surfaceAt(x, z) { return this.world.levelAt(x, z) + (this.water ? this.water.waveAt(x, z) : 0); }

  // --- wc C: on foot --------------------------------------------------------------------------------------------------------
  // the rod in a hand: stream A's inventory.rodInHand (packs.js), else the long item itself
  rodInHand() {
    const inv = this.inventory; if (!inv) return false;
    if ('rodInHand' in inv) return !!inv.rodInHand;
    return !!(inv.long || []).find((l) => l.where === 'hands' && (itemDef(l.id) || {}).long === 'rod');
  }
  // standing on foot with the rod in a hand, free to fish: not teleporting, not mid-vault, not on a seat, not in a store
  footOk() {
    const p = this.player;
    return p.mode === 'walk' && !p.teleporting && !p.act && !p.seat && !(this.indoors && this.indoors()) && this.rodInHand();
  }
  // open water within a cast in the fan ahead (a metre deep by the shore field); the nearest spot is kept as footWater
  waterAhead() {
    const p = this.player, w = this.world;
    if (w.shoreAt(p.x, p.z) > FOOT.offShore) { this.footWater = null; return false; }
    let best = null;
    for (const da of [0, -0.45, 0.45, -0.9, 0.9, -1.3, 1.3]) {
      const c = Math.cos(p.heading + da), s = -Math.sin(p.heading + da);
      for (let d = 1.5; d <= FOOT.reach; d += 1.5) { const x = p.x + c * d, z = p.z + s * d; if (w.shoreAt(x, z) < -1.0) { if (!best || d < best.d) best = { x, z, d }; break; } }
    }
    this.footWater = best;
    return !!best;
  }
  canFishOnFoot() { return this.footOk() && this.waterAhead(); }
  // where the spot readout reads the water: under the hull afloat; on foot where the cast is aimed, or the water ahead
  spotAt() { const p = this.player; if (!this.onFoot) return p; return this.aimWorld || this.footWater || p; }

  // --- per frame -------------------------------------------------------------------------------------------------------
  update(dt, timeScale = 1) {
    const p = this.player, inp = this.input;
    const afloat = p.mode === 'paddle' && !p.landing && !p.ashore && !p.teleporting && !(this.canoe.state.climb > 0);
    const foot = !afloat && this.footOk(); // wc C: standing with the rod in a hand
    if (this.rodUp && !(afloat || foot)) this.stow();
    this.onFoot = this.rodUp && !afloat;
    this.rod.visible = p.mode === 'paddle' || this.onFoot; // it lies in the hull (not on your shoulders, on the bank or in the water), or is up in your hands on foot (down, containers.js carries it)
    const water = foot && !this.rodUp ? this.waterAhead() : false;
    if ((afloat || foot) && inp.pressed('KeyF')) {
      if (!this.rodUp) { if (afloat || water) { this.onFoot = !afloat; this.raise(); } else this.message = { text: 'No water within a cast from here', t: 1.8 }; }
      else if (this.state === 'fight') this.message = { text: 'Land it first', t: 1.5 };
      else this.stow();
    }
    if (this.message && (this.message.t -= dt) <= 0) this.message = null;
    if (this.cooldown > 0) this.cooldown -= dt;
    // the spot readout, refreshed twice a second while the rod is up
    if (this.rodUp && (this.spot.t -= dt) <= 0) {
      this.spot.t = 0.5;
      const at = this.spotAt();
      this.spot.hab = this.habitatAt(at.x, at.z);
      this.spot.parts = this.describe(this.spot.hab, this.day.hours); this.spot.text = this.spot.parts.text;
    }
    if (water && !this.rodUp && !p.prompt) p.prompt = { key: 'F', text: 'Fish from here' };
    this.refreshOwned(dt);
    this.steadyNeeds(dt); // fb4 D (decision 6)
    if (this.rodUp) {
      // fb G: 1–n pick from the lures you have, in the strip's order
      for (let k = 0; k < this.owned.length; k++) if (inp.pressed(`Digit${k + 1}`)) {
        const i = this.owned[k];
        if (this.state === 'ready' || this.state === 'charging') { this.lureIndex = i; this.message = { text: `Tied on a ${LURES[i].name.toLowerCase()}`, t: 1.6 }; }
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
      const needs = this.lureDef.bobber && this.needsLeeches; // fb3 B: no leech to hand, no cast with the bobber rig
      if (this.buttonPressed()) { if (needs) this.message = { text: 'Needs leeches: the bucket is out of reach, or empty', t: 2.2 }; else { this.state = 'charging'; this.charge = 0; this.power = 0; } }
      p.prompt = needs ? { key: null, text: `Needs leeches · the bucket in a hand, by you or in the canoe · ${this.lureKeys()} · F puts the rod down` } : { key: 'Space', text: `Hold to load a cast where ${this.onFoot ? 'you look' : 'the cursor points'} · ${this.lureKeys()} · F puts the rod down` };
    } else if (s === 'charging') {
      this.charge += dt;
      this.power = 1 - Math.exp(-this.charge * 1.6);
      if (!this.button) { this.state = 'swing'; this.swing = 0; this.pending = { power: this.power }; }
      p.prompt = { key: null, text: `Let go to cast · ${this.lureKeys()} · F puts the rod down` };
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
        const ashore = this.onFoot && Math.hypot(nx - t.x, nz - t.z) < FOOT.drag; // wc C: reeled in from the shore it comes up the bank to your feet
        if (w.shoreAt(nx, nz) < 0 || l.onLand || ashore) {
          l.x = nx; l.z = nz;
          if (l.onLand && w.shoreAt(nx, nz) < 0) { l.onLand = false; this.splash(l.x, this.surfaceAt(l.x, l.z), l.z, 4, 0.6); }
          else if (!l.onLand && w.shoreAt(nx, nz) >= 0) { l.onLand = true; l.depth = 0; }
        }
      }
    }
    const surfNow = l.onLand ? w.heightAt(l.x, l.z) + 0.05 : this.surfaceAt(l.x, l.z);
    l.y = l.onLand ? surfNow : surfNow - l.depth;
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
    if (this.lureDef.bobber) this.takeLeech(); // fb3 B: the fish has the leech, hooked or not
    if (this.audio) this.audio.bite(this.lureDef.bobber ? 1 : 0.6);
  }

  updateBite(dt) {
    const b = this.bite, p = this.player;
    b.t += dt;
    const w0 = TUNING.hookWindow[0], w1 = TUNING.hookWindow[1] * (p.gear && p.gear.feel ? p.gear.feel : 1); // content C: the graphite rod feels the take sooner
    const set = this.buttonPressed() || this.input.pressed('KeyW');
    if (set && b.t >= w0 && b.t <= w1) { this.hook(); return; }
    if (b.t > w1 + 0.25 || (set && b.t < w0)) {
      this.state = 'inwater'; this.bite = null; this.cooldown = 2.5 + Math.random() * 4;
      const gone = this.lureDef.bobber; // fb3 B: the leech went with it
      this.message = { text: `${set ? 'Too soon — it spat the hook' : 'Missed it'}${gone ? ', and took the leech' : ''}`, t: 2 };
      if (gone && this.needsLeeches) { this.state = 'ready'; this.lineOut = 0; for (const m of this.lureMeshes) m.visible = false; this.bobber.visible = false; this.message = { text: 'The last leech is gone. Needs leeches', t: 2.5 }; }
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
    if (f.danger > TUNING.snapDanger * (p.gear ? p.gear.snap : 1) * (this.kit ? this.kit.mods.snap : 1)) { this.endFight('snap'); if (this.onSnap) this.onSnap(this.lureDef, f); return; } // hubs 2B: the rod (shop.js player.gear); the lure is lost (shop.js onSnap); content C: the brass reel (kit.js)
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
    const shoreD = this.onFoot ? Math.max(0, w.shoreAt(t.x, t.z)) : 0; // wc C: from a bank the fish comes to the water's edge below you
    if (this.lineOut <= TUNING.landAt + shoreD && horiz < 3.5 + shoreD) return this.land();
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
    // content C: a big fish at the side thrashes and may throw the hook, with no landing net to get under it (kit.js)
    const side = this.kit && typeof this.kit.atTheSide === 'function' ? this.kit.atTheSide(f) : null;
    if (side) { this.endFight('thrown'); this.message = { text: side, t: 3 }; return; }
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
    this.message = null; void sp; void lb; // the catch card (hud.js) carries the fish
    this.lineOut = 0;
  }

  // The fish is held up for a look: the camera comes round to the paddler's front quarter until it is kept
  // or let go (E keeps it, Q lets it go; a stray click does not end it), or the hold-up time runs out.
  // fb4 D (decision 4): E and Q, the two keys of the dot, in place of K and E (K was outside the round's key set)
  updateLanded(dt) {
    const L = this.landed, p = this.player;
    L.t += dt;
    const keep = this.input.pressed('KeyE'), rel = this.input.pressed('KeyQ');
    if (keep && L.t > 0.4) return this.release(true);
    if ((rel && L.t > 0.4) || L.t > TUNING.holdUp) return this.release(false);
    const f = p.forward, rx = -f.z, rz = f.x, y = this.canoe.rig.position.y + (this.onFoot ? 0.62 : 0); // wc C: standing, the fish is held higher
    const fx = this.focus;
    fx.pos.set(p.x + f.x * 0.9 + rx * 1.6, y + 1.05, p.z + f.z * 0.9 + rz * 1.6);
    fx.look.set(p.x - f.x * 1.25, y + 0.5, p.z - f.z * 1.25);
    this.chase.focus = fx;
    const want = this.tasks && this.tasks.wants ? this.tasks.wants(L.species, this.catchLake(L), L.length) : null; // hubs 1C: a notice taken on wants it
    const inv = this.inventory, free = inv && inv.attached && typeof inv.freeHand === 'function' ? inv.freeHand() >= 0 : true;
    // (the content join: both hands full and nothing with room said "Keep it, into a pack", and E then let it go)
    if (!want && !free && inv && inv.attached && typeof inv.firstFit === 'function' && !(L.roomAt > L.t - 0.5)) {
      const id = `fish:${L.species}`, d = itemDef(id); L.roomAt = L.t;
      L.room = inv.reachable().some((c) => !['stringer', 'crate', 'pile', 'inhand'].includes(c.item) && (typeof inv.accepts !== 'function' || inv.accepts(c, d)) && !!inv.firstFit(c.id, id));
    }
    if (!want && !free && L.room === false) { p.prompt = { key: 'Q', text: 'Let it go · no room on you to keep it' }; return; }
    p.prompt = { key: 'E', text: `${want ? `Keep it for “${esc(want.title)}”` : free ? 'Keep it, in your hand' : 'Keep it, into a pack'} · <kbd>Q</kbd> Let it go` }; // fb3 B: to the hand
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
      const cooler = this.tasks ? this.tasks.onCatch(L.species, this.catchLake(L), L.length, keep) : null; // hubs 1C: a notice taken on wants it
      if (keep && cooler) this.message = { text: cooler, t: 3 }; // into that notice's cooler, not the stringer
      else if (keep) {
        // fb3 B (decision 1): the fish goes into your hand; with both hands full, into a pack or a barrel in reach (never
        // the stringer by itself: that is its "Put on the stringer" verb in the book); nothing with room, back it goes
        const inv = this.inventory, id = `fish:${L.species}`, data = { length: Math.round(L.length) };
        let r = inv && inv.attached && typeof inv.toHandNew === 'function' ? inv.toHandNew(id, { data }) : { ok: false };
        if (r && r.ok) this.message = { text: 'Kept · in your hand', t: 2.2 };
        else if (inv && inv.attached && typeof inv.place === 'function') {
          const stringers = inv.containers.filter((c) => c.item === 'stringer').map((c) => c.id);
          r = inv.place(id, 1, { data, exclude: stringers });
          const nm = (itemDef((inv.cont(r.cId) || {}).item) || {}).name || 'pack'; // (the content join: "the duluth pack #3": a name keeps its capital)
          if (r && r.ok) this.message = { text: `Kept · into the ${/^(Duluth|Johnson)/.test(nm) ? nm : nm.charAt(0).toLowerCase() + nm.slice(1)}`, t: 2.2 };
        }
        if (!(r && r.ok)) { L.entry.kept = false; this.saveLog(); this.message = { text: 'No room to keep it: you let it go.', t: 3 }; if (Number.isFinite(L.x) && this.world.shoreAt(L.x, L.z) < 0) this.splash(L.x, this.surfaceAt(L.x, L.z), L.z, 7, 0.7); }
      } else {
        // let go beside the hull, or back into the water it came from
        let x, z;
        if (this.onFoot && Number.isFinite(L.x) && this.world.shoreAt(L.x, L.z) < 0) { x = L.x; z = L.z; }
        else { const r = this.canoe.rig, f = this.player.forward; x = r.position.x - f.z * 1.2; z = r.position.z + f.x * 1.2; }
        this.splash(x, this.surfaceAt(x, z), z, 7, 0.7); this.message = { text: 'Released', t: 1.5 };
      }
    }
    this.state = 'ready';
  }

  // --- posing ------------------------------------------------------------------------------------------------------------
  // The rod in rig space (+x bow, +z starboard): held in the right hand in front of the kneeling paddler's
  // stomach, pointing where the cast goes; the left hand on the crank knob, or on the butt for the cast.
  poseRod(dt) {
    const rod = this.rod, parts = this.rodParts, s = this.state, p = this.player, foot = this.onFoot;
    const sx = SEATS.stern.x;
    let grip, yaw, pitch, bend = 0.02, k = 1 - Math.exp(-dt * 10), lean = 0, look = 0;
    if (!this.rodUp || s === 'landed') {
      // laid along the starboard bilge (or across the gunwales while the fish is held up); on foot, laid at your feet
      // while the fish is held up (the rig's origin is a tenth of a metre over the ground)
      if (foot) { grip = V(0.3, -0.08, 0.38); yaw = -0.5; pitch = 0.03; }
      else { grip = s === 'landed' ? V(sx + 0.66, sheerY(sx + 0.66) + 0.022, -0.5) : V(-0.82, floorAt(-0.82) + 0.05, 0.26); yaw = s === 'landed' ? -Math.PI / 2 : 0.045; pitch = s === 'landed' ? 0.02 : 0.03; }
      k = this.rodUp ? k : 1;
    } else {
      // wc C: standing (the figure at the rig's origin facing +x) the cork is held in front of the stomach
      grip = foot ? V(0.3, 1.02, 0.14) : V(sx + 0.47, 0.31, 0.11);
      let relYaw = this.aim - p.heading; relYaw = Math.atan2(Math.sin(relYaw), Math.cos(relYaw));
      yaw = clamp(relYaw, -TUNING.rodArc, TUNING.rodArc);
      if (s === 'ready') pitch = 0.45;
      else if (s === 'charging') { pitch = lerp(0.5, 1.75, this.power); grip.x -= 0.14 * this.power; grip.y += 0.24 * this.power; grip.z += 0.04 * this.power; lean = -0.12 * this.power; }
      else if (s === 'swing') { const u = clamp(this.swing / 0.3, 0, 1); pitch = lerp(1.75, 0.3, 1 - (1 - u) * (1 - u)); bend = -0.6 * Math.sin(u * Math.PI); k = 1 - Math.exp(-dt * 30); lean = 0.12 * Math.sin(u * Math.PI); grip.x += 0.08 * u; }
      else if (s === 'flying') { pitch = 0.35; lean = 0.05; }
      else if (s === 'inwater' || s === 'bite') { pitch = 0.4 + (this.lure.speed > 0.1 ? 0.05 * Math.sin(this.crank * 0.8) : 0); bend = 0.03 + (s === 'bite' && !this.lureDef.bobber ? 0.12 * Math.abs(Math.sin(this.bite.t * 14)) : 0) + 0.02 * this.lure.speed; look = 0.3; }
      else if (s === 'fight') { const f = this.fish; pitch = 0.75 + 0.35 * f.tension; bend = 0.15 + 1.0 * f.tension + 0.04 * Math.sin(f.t * 9) * (f.run > 0 ? 1 : 0.2); grip.y += 0.12 * f.tension; grip.x -= 0.04 * f.tension; lean = -0.1 * f.tension; look = 0.4; }
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
    // hands for the paddler rig (rig space): the right fist round the cork behind the reel, the left on the
    // crank knob, the butt while casting, or the fish
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._dir.set(cp * cy, sp, -cp * sy);
    this._up.set(-sp * cy, cp, sp * sy);
    this._side.crossVectors(this._dir, this._up);
    const H = this.hands;
    H.dir.copy(this._dir); H.up.copy(this._up); H.yaw = this.yaw; H.lean = lean; H.look = look;
    if (s === 'landed' && this.heldFish) {
      const L = Math.min(0.42, this.landed.length / 100 * 0.38), up = foot ? 0.62 : 0, fwd = foot ? -0.08 : 0; // wc C: held up standing
      this.heldFish.position.set(0.52 + fwd, 0.5 + up + 0.04 * Math.sin(this.landed.t * 2), 0);
      this.heldFish.rotation.set(0.25, Math.PI / 2, 0.08 * Math.sin(this.landed.t * 3));
      H.L.set(0.5 + fwd, 0.47 + up, -L).add(this.canoe.paddler.position); H.R.set(0.5 + fwd, 0.47 + up, L).add(this.canoe.paddler.position);
      H.dir.set(0, 0, 1); H.up.set(0, 1, 0); H.knobAxis.set(0, 0, 1); H.yaw = 0; H.lean = 0.05; H.look = 0.6;
    } else if (this.rodUp) {
      H.R.copy(parts.hand).applyMatrix4(rod.matrix);
      if (s === 'charging' || s === 'swing') {
        H.L.copy(this._grip).addScaledVector(this._dir, -0.3);
        H.knobAxis.copy(this._dir);
      } else {
        parts.knob.getWorldPosition(H.L); this.canoe.rig.worldToLocal(H.L);
        H.knobAxis.copy(this._side).negate();
      }
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
      // fb G: a plain true or false (it was the lure's own `bobber`, undefined on every other lure, and three hides an
      // object only when visible === false: the bobber stayed in the air wherever it was last put, 2026-10-24)
      this.bobber.visible = !!def.bobber;
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
      m.position.set(-0.9 + i * 0.28, sheerY(-0.9 + i * 0.28) - 0.02 - L / 2, -0.47);
      m.rotation.set(0.2, 0, -Math.PI / 2 + 0.06 * Math.sin(this.player.time * 1.5 + i));
      m.visible = this.player.mode === 'paddle';
    }
  }

  fillUi() {
    const u = this.ui;
    // fb G: the strip lists only the lures you have (numbered as the keys pick them); on a change to the list the HUD,
    // which redraws the strip when the chosen one changes, is handed -1 for a frame so it redraws
    const sig = this.owned.join(',');
    const fresh = sig !== this.ownedSig;
    if (fresh || !this.ownedDefs) this.ownedDefs = this.owned.map((i) => LURES[i]);
    u.rodUp = this.rodUp; u.state = this.state; u.lures = this.ownedDefs;
    u.lure = fresh ? -1 : this.owned.indexOf(this.lureIndex);
    this.ownedSig = sig;
    u.power = this.state === 'charging' ? this.power : null;
    u.spot = this.rodUp && this.spot.parts ? this.spot.parts : null;
    u.aim = this.rodUp && (this.state === 'ready' || this.state === 'charging') ? this.aimWorld : null;
    const L = this.landed;
    u.landed = L ? { key: L.entry.at, species: L.species, name: L.entry.name, length: L.entry.length, weight: L.entry.weight, best: !!L.entry.best, lake: L.entry.lake, lure: L.entry.lure, time: clock12(L.entry.hours), t: L.t } : null;
    u.fight = this.fish ? { tension: this.fish.tension, danger: this.fish.danger, slack: this.fish.slack, line: this.lineOut, run: this.fish.run > 0 } : null;
    u.message = this.message ? this.message.text : null;
    u.stringer = this.stringer.length;
    u.needsLeeches = this.rodUp && this.needsLeeches; // fb3 B: the strip's "needs leeches"
    // fb4 D: the leeches in reach as the strip counts them, held while the steadied reach still says they are there (a
    // bucket at the reach's edge read 12 and 0 by turns)
    const n = this.leechCount();
    if (n > 0 || u.needsLeeches || this.leechesShown == null) this.leechesShown = n;
    u.leeches = this.leechesShown;
    u.log = this.log; u.bests = this.bests; u.logVersion = this.logVersion;
    u.rate = this.rate;
    return u;
  }
}
