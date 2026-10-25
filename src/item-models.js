// The items as things (content pass 1, stream D: the owner, 2026-10-25: "more 3d versions of items so they show up in
// hand, or on ground better"). Every item that is not a container or a long thing gets a low-poly model of its own, in
// the props' style (docs/look.md: simple shapes with believable construction, flat calm colours, the light doing the
// rest): stuff sacks in their colours, foil pouches and ziploc bags, the pot with its bail, a fish by species, a lure by
// kind, the saw folded, the axe, the net. containers.js draws them wherever the inventory says they are: in a hand, in a
// pile on the ground (each laid out where its cell is in the pile's grid), on the grate, and in the bilge of the canoe
// while you paddle with something in your hand.
//
// All of it is one material (prop-kit.js's atlas material, the props' own program) and one geometry per model and tint,
// built once on first use. Things that lie together are merged into one mesh (a pile, a grate, a stringer: one draw
// each, whatever is in it; mergeModels), so a camp full of set-down gear costs a draw per pile, not per thing.
//
//   modelKeyOf(itemId) → the model's key ('sack', 'pouch', 'fish', …) or null (a container or a long thing: those are
//                        containers.js's own). The key comes from, in order: the item's id (KEY_OF_ID), def.model (stream
//                        C's new items name theirs), def.icon (the outfitters' signature items), then def.kind.
//   modelGeometry(itemId, data?) → { geo, key, hold, size } (shared; never dispose): `geo` lies at rest in its own frame,
//                        bottom at y = 0, centred, its long side along +x; `hold` how a hand takes it (below); `size`
//                        its box [x, y, z] in metres; `scale` the size it is drawn at (a fish by its length)
//   modelFor(itemId, data?) → a THREE.Mesh of it at rest (for stream C's uniques lying in the world), or null
//   holdMatrix(item, hand, forward, right, side, out) → its world matrix in a hand (see HOLD)
//   mergeModels(list) → one BufferGeometry: list [{ id, data?, matrix }] (matrix: the model's frame into the merged one)
//   itemMaterial() → the material (prop-kit.js propMaterial)
//
// HOLD, how a hand takes a thing (the walker's arms hang at his sides, so most things hang from the fist):
//   'hang'     by a loop, a bail, a cord or the gills: the grip point at the hand, the model's `up` axis ('x' for long
//              things carried by one end, 'y' for upright things with a handle on top) pointing up; a flat thing's
//              broad faces along the leg
//   'upright'  held in the fist the way it stands (a cup, a stove, a canister, a camera): its middle at the hand
//   'point'    a tool by its handle (the -x end), pointing ahead and down: the saw, the knife, the axe, the net
import * as THREE from 'three';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { itemDef } from './items.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const mixC = (a, b, t) => a.clone().lerp(b, Math.min(1, Math.max(0, t)));
// a cheap hash noise for mottled contents (trail mix, a plaid), by position: 0..1
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

// --- the parts ------------------------------------------------------------------------------------------------------
// a part built in its own builder, moved by a matrix (positions and normals), added to `b`
function part(b, fn, m = null) { const s = new PropBuilder(); fn(s); const g = s.build(); if (m) g.applyMatrix4(m); b.addBuilt(g); return b; }
const M = (sx, sy, sz, tx = 0, ty = 0, tz = 0) => new THREE.Matrix4().makeScale(sx, sy, sz).setPosition(tx, ty, tz);
const MR = (rx, ry, rz, tx = 0, ty = 0, tz = 0, s = 1) => new THREE.Matrix4().compose(V(tx, ty, tz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(s, s, s));
const xs = (n, a = -0.5, b = 0.5) => Array.from({ length: n }, (_, i) => V(a + ((b - a) * i) / (n - 1), 0, 0));
// a soft body along x of unit length and radius, its profile r(t) (t 0 at -x, 1 at +x), then sized L x H x W and set on
// the ground: a stuff sack, a bag, a pillow of a pouch. col(p) sees the unit position (p.y up, p.z across).
function soft(b, L, H, W, r, col, { sides = 10, n = 9, tile = TILE.CANVAS, x0 = 0, lift = 0, z0 = 0 } = {}) {
  return part(b, (s) => s.tube(xs(n), r, sides, tile, col, { cap0: true, cap1: true }), M(L, H / 2, W / 2, x0, H / 2 + lift, z0));
}
const round = (k = 0.35, floor = 0.3) => (t) => Math.max(floor, Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), k));
const flatBox = (b, cx, cy, cz, hx, hy, hz, tile, col, opts) => b.box(V(cx, cy, cz), X, Y, Z, hx, hy, hz, tile, col, opts);
// a short round thing standing on the ground (y up): a cup, a canister, a bottle; rings [[y, r, col]]
function standing(b, rings, { sides = 12, tile = TILE.PLAIN, cap = true } = {}) {
  for (let i = 0; i < rings.length - 1; i++) {
    const [y0, r0, c0] = rings[i], [y1, r1] = rings[i + 1];
    b.cyl(V(0, y0, 0), V(0, y1, 0), r0, r1, sides, tile, c0, { cap0: i === 0, cap1: cap && i === rings.length - 2, capTile: TILE.PLAIN });
  }
  return b;
}
// a cord along points
const cord = (b, pts, r, col, sides = 4) => b.tube(pts, r, sides, TILE.ROPE, col, { cap0: true, cap1: true });

// --- the colours ----------------------------------------------------------------------------------------------------
const COL = {
  foil: 0xb7bbbf, foilDark: 0x8c9196, zip: 0x3f6fb0, plastic: 0xe6e8e4, black: 0x2a2a28, webbing: 0x2e2e2c, toggle: 0x1f1f1f,
  steel: 0xb9bdc1, soot: 0x3d3a36, alu: 0x9a978f, brass: 0xc29a48, ash: 0xc9ab7a, birch: 0xd4bf98, leather: 0x6b4a2e,
  paper: 0xe7dcc2, kraft: 0xa9825a, foam: 0x4a77a8, rope: 0xcbbf9a,
};
// fishing.js SPECIES[*].colour and belly, with a pattern each and a size it is drawn at when no length is known (cm)
const FISH = {
  walleye: { back: 0x8c8a4e, belly: 0xd9d2a8, cm: 45, pattern: 'mottle', fin: 0x6c6a3a },
  pike: { back: 0x4f6b3a, belly: 0xd8d6a8, cm: 70, pattern: 'beans', slim: 0.7, fin: 0x5a5a2c },
  smallmouth: { back: 0x7d6a3c, belly: 0xcbbf98, cm: 38, pattern: 'bars', fin: 0x6a5a34 },
  laketrout: { back: 0x5a6a62, belly: 0xd2d4c6, cm: 60, pattern: 'spots', fin: 0x4a5450 },
  crappie: { back: 0x8e948a, belly: 0xe2e2d8, cm: 25, pattern: 'speckle', tall: 1.45, fin: 0x55574f },
  perch: { back: 0xb59a3e, belly: 0xece0b0, cm: 22, pattern: 'bars', fin: 0xc0703a },
  fish: { back: 0x7a7a5a, belly: 0xd6d2b0, cm: 40, pattern: 'mottle', fin: 0x5a5a40 },
};
// what a forage item looks like in its cup
const FORAGE_LOOK = {
  strawberries: 0xc8302a, juneberries: 0x4c2a48, blueberries: 0x3c4c8c, raspberries: 0xb8323a, pincherries: 0xb02424,
  bunchberries: 0xc83a2a, chanterelles: 0xe0a23a, hedgehogs: 0xe2c79a, lobsters: 0xd2532a, falsechanterelles: 0xe08a2a,
};

// --- the models -------------------------------------------------------------------------------------------------------
// Each: build(b, o) into a PropBuilder in its rest frame (o: { tint: Color|null, def, data, id }), hold, up, grip?
// (a point in the rest frame; defaults per hold), and tinted: true when the def's tint colours it (a geometry per tint).
const MODELS = {};
const model = (key, spec) => { MODELS[key] = { hold: 'hang', up: 'x', ...spec }; };

// a stuff sack lying on its side: a soft drum, the drawcord end cinched to a ruffle, a cord lock and a loop; `straps`
// compression straps (a sleeping bag's), `poles` the tent's pole ends showing at the cinch
function sack(b, o, { L = 0.4, R = 0.11, col = 0x8a5a3a, straps = 0, poles = 0, stakes = false } = {}) {
  const c = o.tint || C(col), dark = c.clone().multiplyScalar(0.72);
  const prof = (t) => (t < 0.08 ? 0.72 + 3 * t : t > 0.86 ? 1 - 2.6 * (t - 0.86) : 1) * (0.94 + 0.06 * Math.sin(t * 9));
  soft(b, L, R * 1.7, R * 2, prof, (p) => (p.y < -0.6 ? dark : c), { sides: 12, x0: -0.03 });
  // the cinched neck and its ruffle, the cord lock, the loop
  const nx = L / 2 - 0.03;
  b.cyl(V(nx - 0.005, R * 0.85, 0), V(nx + 0.04, R * 0.85, 0), R * 0.42, R * 0.2, 8, TILE.CANVAS, dark, { cap1: true, capTile: TILE.CANVAS });
  flatBox(b, nx + 0.055, R * 0.85, 0, 0.012, 0.009, 0.009, TILE.PLAIN, C(COL.toggle));
  cord(b, [V(nx + 0.06, R * 0.85, 0), V(nx + 0.1, R * 0.92, 0.02), V(nx + 0.11, R * 0.85, 0), V(nx + 0.1, R * 0.78, -0.02), V(nx + 0.06, R * 0.85, 0)], 0.003, C(COL.black));
  for (let i = 0; i < straps; i++) {
    const a = (i / straps) * Math.PI * 2 + 0.4, ca = Math.cos(a), sa = Math.sin(a);
    cord(b, [V(-L / 2 + 0.012, R * 0.85 + sa * R * 0.55, ca * R * 0.66), V(-L / 4, R * 0.85 + sa * R * 0.88, ca * R * 1.03), V(L / 4, R * 0.85 + sa * R * 0.88, ca * R * 1.03), V(L / 2 - 0.05, R * 0.85 + sa * R * 0.48, ca * R * 0.55)], 0.006, C(COL.webbing), 4);
  }
  for (let i = 0; i < poles; i++) { const z = (i - (poles - 1) / 2) * 0.022; b.cyl(V(nx, R * 0.95 + (i % 2) * 0.012, z), V(nx + 0.09, R * 0.95 + (i % 2) * 0.012, z), 0.007, 0.007, 5, TILE.PLAIN, C(0x9fa3a6), { cap1: true, capTile: TILE.PLAIN }); }
  if (stakes) soft(b, 0.16, 0.05, 0.06, round(), C(0x3a3a38), { x0: -0.02, lift: R * 1.6, sides: 6 });
  return b;
}
model('sack', { build: (b, o) => sack(b, o, { L: 0.38, R: 0.1 }), tinted: true });
model('sleepbag', { build: (b, o) => sack(b, o, { L: 0.36, R: 0.12, col: 0x2f5f8a, straps: 3 }), tinted: true });
model('tarpsack', { build: (b, o) => sack(b, o, { L: 0.28, R: 0.07, col: 0x55704a }), tinted: true });
model('tentbag', { build: (b, o) => sack(b, o, { L: 0.5, R: 0.085, col: 0xb5763a, poles: 3 }), tinted: true });
// a roll-top dry bag on its side (the clothes): the bag, the top rolled flat three times and buckled into a loop
model('drybag', {
  tinted: true,
  build: (b, o) => {
    const c = o.tint || C(0x4f7d9c), band = C(COL.black);
    soft(b, 0.3, 0.17, 0.2, (t) => (t < 0.08 ? 0.7 + 3.7 * t : 1) * (t > 0.9 ? 0.9 : 1), (p) => (p.y < -0.6 ? c.clone().multiplyScalar(0.75) : c), { sides: 12, x0: -0.03 });
    flatBox(b, 0.15, 0.09, 0, 0.035, 0.03, 0.115, TILE.CANVAS, c.clone().multiplyScalar(0.92));
    flatBox(b, 0.188, 0.09, 0, 0.004, 0.032, 0.116, TILE.CANVAS, C(0xd9d6cc));
    for (const s of [-1, 1]) flatBox(b, 0.15, 0.12, s * 0.118, 0.022, 0.008, 0.006, TILE.PLAIN, band);
    cord(b, [V(0.15, 0.125, -0.118), V(0.2, 0.2, -0.06), V(0.2, 0.205, 0.06), V(0.15, 0.125, 0.118)], 0.007, band, 4);
    return b;
  },
});
// a closed-cell foam pad rolled and strapped: the spiral's ends lighter, two straps; padroll the self-inflating one,
// smooth, one strap and the valve
function padRoll(b, o, { col = COL.foam, L = 0.52, R = 0.075, inflating = false } = {}) {
  const c = o.tint || C(col), end = mixC(c, C(0xffffff), 0.25), inner = c.clone().multiplyScalar(0.6);
  b.cyl(V(-L / 2, R, 0), V(L / 2, R, 0), R, R, 14, inflating ? TILE.PLAIN : TILE.CANVAS, c, { cap0: true, cap1: true, capTile: TILE.PLAIN, capCol: end });
  for (const s of [-1, 1]) b.cyl(V(s * (L / 2 + 0.001), R, 0), V(s * (L / 2 + 0.002), R, 0), R * 0.42, R * 0.42, 10, TILE.PLAIN, inner, { cap1: true, capTile: TILE.PLAIN });
  for (const x of inflating ? [0] : [-L * 0.3, L * 0.3]) b.cyl(V(x - 0.012, R, 0), V(x + 0.012, R, 0), R * 1.04, R * 1.04, 14, TILE.PLAIN, C(COL.webbing), {});
  if (inflating) b.cyl(V(L / 2, R * 1.5, 0), V(L / 2 + 0.018, R * 1.5, 0), 0.008, 0.008, 6, TILE.PLAIN, C(COL.black), { cap1: true, capTile: TILE.PLAIN });
  return b;
}
model('pad', { build: (b, o) => padRoll(b, o), tinted: true });
model('padroll', { build: (b, o) => padRoll(b, o, { col: 0xc96a2a, L: 0.34, R: 0.07, inflating: true }), tinted: true });
// two foam yoke pads, strapped together
model('yokepads', {
  build: (b) => {
    for (const z of [-0.05, 0.05]) part(b, (s) => s.tube(xs(7), round(0.25, 0.55), 8, TILE.CANVAS, C(0x3a4148), { cap0: true, cap1: true }), M(0.24, 0.019, 0.044, 0, 0.019, z));
    for (const z of [-0.05, 0.05]) for (const x of [-0.07, 0.07]) flatBox(b, x, 0.0375, z, 0.009, 0.0022, 0.04, TILE.PLAIN, C(COL.black));
    return b;
  },
});

// the cook pot (as cook.js's on the grate: blackened aluminium, the lid on with its knob, the wire bail), upright
const R_POT = 0.085, H_POT = 0.1;
model('pot', {
  hold: 'hang', up: 'y', grip: [0, H_POT + 0.06, 0],
  build: (b) => {
    const metal = C(0x8f8b84), soot = C(COL.soot), wire = C(0xa4a6a8);
    b.cyl(V(0, 0, 0), V(0, H_POT * 0.35, 0), R_POT * 0.97, R_POT, 12, TILE.PLAIN, soot, { cap0: true, capTile: TILE.PLAIN });
    b.cyl(V(0, H_POT * 0.35, 0), V(0, H_POT, 0), R_POT, R_POT * 1.01, 12, TILE.PLAIN, metal);
    b.cyl(V(0, H_POT, 0), V(0, H_POT + 0.012, 0), R_POT * 1.03, R_POT * 0.8, 12, TILE.PLAIN, metal, { cap1: true, capTile: TILE.PLAIN });
    b.cyl(V(0, H_POT + 0.012, 0), V(0, H_POT + 0.026, 0), 0.012, 0.01, 6, TILE.PLAIN, soot, { cap1: true, capTile: TILE.PLAIN });
    const bail = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; bail.push(V(0, H_POT * 0.8 + Math.sin(a) * 0.075, -Math.cos(a) * R_POT * 1.06)); }
    b.tube(bail, 0.0025, 4, TILE.PLAIN, wire);
    return b;
  },
});
// a hot meal: an enamel bowl of it, steaming (the steam is the fire's); fried fish on a tin plate
model('bowl', {
  hold: 'upright', tinted: true,
  build: (b, o) => {
    const enamel = C(0x3f6f9e), rim = C(0xe9e4d4), food = o.tint || C(0xb9925a);
    b.cyl(V(0, 0, 0), V(0, 0.01, 0), 0.04, 0.05, 12, TILE.PLAIN, enamel, { cap0: true, capTile: TILE.PLAIN });
    b.cyl(V(0, 0.01, 0), V(0, 0.055, 0), 0.05, 0.075, 12, TILE.PLAIN, enamel);
    b.cyl(V(0, 0.055, 0), V(0, 0.06, 0), 0.075, 0.077, 12, TILE.PLAIN, rim);
    b.cyl(V(0, 0.035, 0), V(0, 0.046, 0), 0.066, 0.068, 12, TILE.PLAIN, food, { cap1: true, capTile: TILE.PLAIN });
    return b;
  },
});
function fillets(b, cA, cB, { L = 0.13, plate = false } = {}) {
  for (const [z, l] of [[-0.028, L * 0.62], [0.03, L * 0.56]]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(V(-l + 2 * l * t, 0, z + Math.sin(t * Math.PI * 2) * 0.004)); }
    part(b, (s) => s.tube(pts, (t) => 0.004 + 0.021 * Math.sin(Math.max(0.12, Math.min(0.94, t)) * Math.PI) ** 0.7, 7, TILE.PLAIN, (p) => (p.y > 0.004 ? cA : cB), { cap0: true, cap1: true }), M(1, 0.4, 1, 0, plate ? 0.016 : 0.009, 0));
  }
  return b;
}
model('plate', {
  hold: 'upright',
  build: (b) => {
    b.cyl(V(0, 0, 0), V(0, 0.012, 0), 0.085, 0.105, 14, TILE.PLAIN, C(0xa7a9aa), { cap0: true, cap1: true, capTile: TILE.PLAIN });
    return fillets(b, C(0xb9773a), C(0x7a4a22), { L: 0.15, plate: true });
  },
});
model('fillet', { hold: 'upright', tinted: true, build: (b, o) => fillets(b, o.tint || C(0xf0e2d2), (o.tint || C(0xf0e2d2)).clone().multiplyScalar(0.82), { L: 0.16 }) });
// stream C's hot breakfasts: pancakes stacked on the tin plate, a round of bannock golden from the pan
model('pancakes', {
  hold: 'upright',
  build: (b) => {
    b.cyl(V(0, 0, 0), V(0, 0.012, 0), 0.085, 0.105, 14, TILE.PLAIN, C(0xa7a9aa), { cap0: true, cap1: true, capTile: TILE.PLAIN });
    for (let i = 0; i < 3; i++) b.cyl(V(0.004 * i, 0.012 + i * 0.011, -0.003 * i), V(0.004 * i, 0.021 + i * 0.011, -0.003 * i), 0.068, 0.066, 12, TILE.PLAIN, C(i === 2 ? 0xc8873a : 0xd9a45a), { cap1: true, capTile: TILE.PLAIN });
    return b;
  },
});
model('bannock', {
  hold: 'upright',
  build: (b) => {
    const crust = C(0xc8913e), top = C(0xb07a32);
    b.cyl(V(0, 0, 0), V(0, 0.022, 0), 0.085, 0.09, 14, TILE.PLAIN, crust, { cap0: true, capTile: TILE.PLAIN });
    b.cyl(V(0, 0.022, 0), V(0, 0.036, 0), 0.09, 0.06, 14, TILE.PLAIN, top, { cap1: true, capTile: TILE.PLAIN });
    return b;
  },
});

// a fish lying on its side, built 1 m long (scaled to its length): head +x, back toward +z, the up side +y
model('fish', {
  hold: 'hang', up: 'x', grip: [0.44, 0.03, 0.02], tinted: false,
  build: (b, o) => {
    const sp = FISH[o.species] || FISH.fish, slim = sp.slim || 1, tall = sp.tall || 1;
    const back = C(sp.back), belly = C(sp.belly), fin = C(sp.fin), dark = back.clone().multiplyScalar(0.62), light = mixC(belly, C(0xffffff), 0.2);
    const col = (p) => {
      const k = smooth(-0.75, 0.2, p.z);
      let c = mixC(belly, back, k);
      const u = p.x;
      if (sp.pattern === 'bars' && Math.sin(u * 46) > 0.35 && p.z > -0.45) c = mixC(c, dark, 0.6);
      else if (sp.pattern === 'beans' && hash3(Math.round(u * 26), Math.round(p.z * 4), Math.round(p.y * 3)) > 0.55 && p.z > -0.5) c = mixC(c, light, 0.65);
      else if (sp.pattern === 'spots' && hash3(Math.round(u * 34), Math.round(p.z * 5), Math.round(p.y * 3)) > 0.62) c = mixC(c, light, 0.55);
      else if (sp.pattern === 'speckle' && hash3(Math.round(u * 40), Math.round(p.z * 6), Math.round(p.y * 3)) > 0.6) c = mixC(c, dark, 0.7);
      else if (sp.pattern === 'mottle' && hash3(Math.round(u * 20), Math.round(p.z * 3), Math.round(p.y * 3)) > 0.6 && p.z > -0.3) c = mixC(c, dark, 0.35);
      return c;
    };
    // the body: fusiform, the head blunt, the wrist of the tail thin; lateral thickness a third of its depth
    // (the wrist of the tail at -x, the body fullest a little ahead of the middle, the head tapering to a blunt snout)
    const prof = (t) => { const tt = Math.min(1, Math.max(0, t)); return tt < 0.45 ? 0.16 + 0.84 * Math.pow(Math.sin((tt / 0.45) * Math.PI / 2), 1.2) : 1 - 0.75 * Math.pow((tt - 0.45) / 0.55, 2.2); };
    const depth = 0.095 * slim * tall, yh = 0.052 * Math.min(1, slim * 1.15);
    part(b, (s) => s.tube(xs(13, -0.42, 0.5), prof, 10, TILE.PLAIN, col, { cap0: true, cap1: true }), M(1, yh, depth, 0, yh, 0));
    const y = yh;
    // the tail: two lobes in the plane of the body, both faces
    const tail = [V(-0.41, y, 0), V(-0.58, y, 0.13 * slim * tall), V(-0.53, y, 0), V(-0.58, y, -0.13 * slim * tall)];
    b.face([tail[0], tail[1], tail[2]], TILE.PLAIN, fin, { ref: V(-0.5, 0, 0) }); b.face([tail[0], tail[2], tail[3]], TILE.PLAIN, fin, { ref: V(-0.5, 0, 0) });
    b.face([tail[0], tail[1], tail[2]], TILE.PLAIN, fin, { ref: V(-0.5, 1, 0) }); b.face([tail[0], tail[2], tail[3]], TILE.PLAIN, fin, { ref: V(-0.5, 1, 0) });
    // the dorsal fin along the back, the pectoral on the up side, the eye
    const dz = depth * 0.95, d0 = pike(o) ? -0.32 : -0.12, d1 = pike(o) ? -0.18 : 0.16;
    for (const ry of [0, 1]) b.face([V(d0, y, dz * 0.92), V(d1, y, dz * 0.98), V((d0 + d1) / 2 - 0.03, y, dz + 0.07 * slim)], TILE.PLAIN, fin, { ref: V(0, ry ? 1 : -1, 0) });
    b.face([V(0.3, y * 1.9, -0.01), V(0.18, y * 2.1, -0.05), V(0.2, y * 1.9, 0.01)], TILE.PLAIN, fin, { ref: V(0.25, 0, -0.02) });
    for (const s of [1, -1]) flatBox(b, 0.39, y + s * (yh * 0.5), depth * 0.18, 0.011, 0.007, 0.011, TILE.PLAIN, C(0x1a1a1a));
    return b;
  },
});
const pike = (o) => o.species === 'pike';

// food in bags and pouches -----------------------------------------------------------------------------------------
// a ziploc of something, lying flat: the contents' colour through the clear bag, the zip along the +x end
function ziploc(b, o, { L = 0.17, W = 0.13, H = 0.035, col = 0xd9c9a0, mottle = null } = {}) {
  const c = o.tint || C(col);
  const fill = mottle ? (p) => mottle(p, c) : (p) => (p.y > 0.75 ? mixC(c, C(0xffffff), 0.25) : c);
  soft(b, L, H, W, (t) => (t < 0.04 ? 0.78 : t > 0.9 ? 0.72 : 1), fill, { tile: TILE.PLAIN, sides: 8, x0: -0.01 });
  flatBox(b, L / 2 - 0.004, H * 0.35, 0, 0.012, 0.004, W * 0.48, TILE.PLAIN, C(COL.plastic));
  flatBox(b, L / 2 - 0.002, H * 0.35 + 0.0045, 0, 0.0025, 0.0012, W * 0.47, TILE.PLAIN, C(COL.zip));
  return b;
}
model('bag', { build: (b, o) => ziploc(b, o), tinted: true });
model('trailmix', {
  build: (b, o) => ziploc(b, o, { L: 0.18, W: 0.14, H: 0.045, mottle: (p) => { const h = hash3(Math.round(p.x * 14), Math.round(p.y * 4), Math.round(p.z * 9)); return C(h < 0.35 ? 0xc8a46a : h < 0.6 ? 0x4a2a24 : h < 0.82 ? 0x6a4228 : 0xd8b878); } }),
});
model('tortilla', {
  build: (b) => {
    ziploc(b, {}, { L: 0.2, W: 0.18, H: 0.03, col: 0xe2cfa0 });
    b.cyl(V(-0.02, 0.03, 0.04), V(-0.02, 0.085, 0.04), 0.032, 0.032, 10, TILE.PLAIN, C(0xb88a4a), { cap0: true, capTile: TILE.PLAIN });
    b.cyl(V(-0.02, 0.085, 0.04), V(-0.02, 0.1, 0.04), 0.034, 0.034, 10, TILE.PLAIN, C(0x9a2a22), { cap1: true, capTile: TILE.PLAIN });
    return b;
  },
});
// a freeze-dried meal in its foil pouch, lying flat: the gusset at -x, the torn-notch seal at +x, the label
function pouch(b, o, { L = 0.19, W = 0.135, H = 0.03, label = 0x4e7a52, foil = COL.foil, window = null } = {}) {
  const f = C(foil), lab = o.tint || C(label);
  soft(b, L, H, W, (t) => (t < 0.06 ? 0.7 : t > 0.88 ? 0.45 : 1), (p) => (p.y < -0.5 ? f.clone().multiplyScalar(0.85) : f), { tile: TILE.PLAIN, sides: 8, x0: -0.01 });
  flatBox(b, L / 2 + 0.006, H * 0.42, 0, 0.012, 0.0018, W * 0.47, TILE.PLAIN, f.clone().multiplyScalar(0.92));
  flatBox(b, -0.01, H * 0.93, 0, L * 0.3, 0.0015, W * 0.36, TILE.PLAIN, lab);
  if (window) flatBox(b, -0.01, H * 0.93 + 0.0012, 0, L * 0.16, 0.0012, W * 0.2, TILE.PLAIN, C(window));
  return b;
}
model('pouch', { build: (b, o) => pouch(b, o), tinted: true });
model('jerky', { build: (b, o) => pouch(b, o, { L: 0.17, W: 0.11, H: 0.025, foil: 0x3e2a22, label: 0xb8432c, window: 0x7a3a24 }), tinted: true });
model('coffee', {
  tinted: true,
  build: (b, o) => {
    const k = o.tint || C(COL.kraft);
    soft(b, 0.15, 0.04, 0.1, (t) => (t > 0.85 ? 0.6 : t < 0.06 ? 0.75 : 1), (p) => (p.y < -0.5 ? k.clone().multiplyScalar(0.82) : k), { tile: TILE.PLAIN, sides: 8 });
    flatBox(b, 0.085, 0.022, 0, 0.018, 0.004, 0.05, TILE.PLAIN, k.clone().multiplyScalar(0.85));
    flatBox(b, 0.098, 0.027, 0, 0.003, 0.002, 0.052, TILE.PLAIN, C(0xc9a24a)); // (the tin tie)
    flatBox(b, -0.01, 0.0395, 0, 0.03, 0.0012, 0.03, TILE.PLAIN, C(0xe9e4d4));
    return b;
  },
});
// a chocolate bar: the paper sleeve, the foil showing at both ends
model('bar', {
  hold: 'upright', tinted: true,
  build: (b, o) => {
    flatBox(b, 0, 0.007, 0, 0.078, 0.007, 0.036, TILE.PLAIN, C(COL.foil));
    flatBox(b, 0, 0.0072, 0, 0.06, 0.0073, 0.0365, TILE.PLAIN, o.tint || C(0x6e1f24));
    flatBox(b, 0.01, 0.0146, 0, 0.022, 0.0003, 0.02, TILE.PLAIN, C(0xe8d9a8));
    return b;
  },
});
model('granola', {
  hold: 'upright',
  build: (b) => {
    for (const [x, y] of [[-0.024, 0], [0.024, 0], [-0.024, 1], [0.024, 1]]) flatBox(b, 0, 0.011 + y * 0.022, x, 0.055, 0.011, 0.022, TILE.PLAIN, C(y ? 0xa8adb2 : 0x9a9fa4));
    for (const x of [-0.03, 0.03]) flatBox(b, x, 0.022, 0, 0.004, 0.0235, 0.0485, TILE.PLAIN, C(0xc0392b));
    return b;
  },
});
model('sausage', {
  tinted: true,
  build: (b, o) => {
    const wax = o.tint || C(0x9a2a22);
    soft(b, 0.22, 0.055, 0.055, round(0.3, 0.35), wax, { tile: TILE.PLAIN, sides: 10 });
    cord(b, [V(0.11, 0.028, 0), V(0.125, 0.03, 0.004), V(0.14, 0.024, 0.012)], 0.0025, C(COL.rope));
    return b;
  },
});
// a cup: leeches in water (a foam cup with a lid), berries or mushrooms in a tin cup
model('cup', {
  hold: 'upright', tinted: true,
  build: (b, o) => {
    if (o.forage) {
      const tin = C(0xa9abad), fruit = o.tint || C(0x3c4c8c);
      standing(b, [[0, 0.04, tin], [0.075, 0.048, tin]], { cap: false });
      b.cyl(V(0, 0.06, 0), V(0, 0.072, 0), 0.046, 0.04, 10, TILE.PLAIN, fruit, { cap1: true, capTile: TILE.PLAIN });
      for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 0.012 + 0.022 * ((i * 7) % 5) / 5; flatBox(b, Math.cos(a) * r, 0.075, Math.sin(a) * r, 0.008, 0.007, 0.008, TILE.PLAIN, fruit.clone().multiplyScalar(0.85 + 0.1 * (i % 3))); }
      cord(b, [V(0.046, 0.06, 0), V(0.064, 0.055, 0), V(0.064, 0.025, 0), V(0.044, 0.02, 0)], 0.004, tin);
      return b;
    }
    const foam = C(0xeeeee8);
    standing(b, [[0, 0.035, foam], [0.085, 0.045, foam]], { cap: false });
    b.cyl(V(0, 0.085, 0), V(0, 0.092, 0), 0.047, 0.044, 12, TILE.PLAIN, C(0xd8d8d2), { cap1: true, capTile: TILE.PLAIN });
    return b;
  },
});

// tools and gear --------------------------------------------------------------------------------------------------
// the stove: a canister-top burner, folded: the steel burner head, the brass valve and its wire key, three pot arms up
model('stove', {
  hold: 'upright',
  build: (b) => {
    const steel = C(COL.steel), brass = C(COL.brass);
    b.cyl(V(0, 0, 0), V(0, 0.025, 0), 0.016, 0.016, 10, TILE.PLAIN, brass, { cap0: true, capTile: TILE.PLAIN });
    b.cyl(V(0, 0.025, 0), V(0, 0.07, 0), 0.012, 0.012, 8, TILE.PLAIN, steel);
    b.cyl(V(0, 0.07, 0), V(0, 0.085, 0), 0.026, 0.03, 12, TILE.PLAIN, steel, { cap1: true, capTile: TILE.PLAIN });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; flatBox(b, Math.cos(a) * 0.022, 0.06, Math.sin(a) * 0.022, 0.004, 0.03, 0.004, TILE.PLAIN, C(0x8a8e92)); }
    cord(b, [V(0.016, 0.012, 0), V(0.05, 0.012, 0), V(0.06, 0.02, 0)], 0.0025, C(0x8a8e92));
    return b;
  },
});
// a fuel canister: squat, the coloured band, the valve on top
model('canister', {
  hold: 'upright', tinted: true,
  build: (b, o) => {
    const s = C(0xc4c7ca), band = o.tint || C(0x2f68a8);
    standing(b, [[0, 0.046, s], [0.012, 0.055, band], [0.05, 0.055, s], [0.062, 0.04, s], [0.07, 0.018, C(0x8a8e92)], [0.082, 0.012, C(0x8a8e92)]]);
    return b;
  },
});
// a small bottle or tube: the tablets (brown glass, white cap), a tin match safe (tinted)
model('tube', {
  hold: 'upright', tinted: true,
  build: (b, o) => {
    const glass = o.tint || C(0x5a3a1e), cap = o.tint ? o.tint.clone().multiplyScalar(0.8) : C(0xe9e6de);
    b.cyl(V(-0.035, 0.018, 0), V(0.022, 0.018, 0), 0.018, 0.018, 10, TILE.PLAIN, glass, { cap0: true, capTile: TILE.PLAIN });
    b.cyl(V(0.022, 0.018, 0), V(0.04, 0.018, 0), 0.0185, 0.0185, 10, TILE.PLAIN, cap, { cap1: true, capTile: TILE.PLAIN });
    if (!o.tint) flatBox(b, -0.008, 0.0365, 0, 0.018, 0.0008, 0.01, TILE.PLAIN, C(0xe9e4d4));
    return b;
  },
});
// a wide-mouth water bottle, lying on its side, the lid's loop
model('bottle', {
  hold: 'hang', up: 'x', grip: [0.12, 0.04, 0],
  build: (b) => {
    const body = C(0x7aa6c8), lid = C(0x2a4a72);
    b.cyl(V(-0.11, 0.045, 0), V(0.07, 0.045, 0), 0.045, 0.045, 12, TILE.PLAIN, body, { cap0: true, capTile: TILE.PLAIN });
    b.cyl(V(0.07, 0.045, 0), V(0.085, 0.045, 0), 0.045, 0.034, 12, TILE.PLAIN, body);
    b.cyl(V(0.085, 0.045, 0), V(0.105, 0.045, 0), 0.036, 0.036, 12, TILE.PLAIN, lid, { cap1: true, capTile: TILE.PLAIN });
    cord(b, [V(0.1, 0.075, 0), V(0.125, 0.085, 0), V(0.13, 0.06, 0), V(0.105, 0.05, 0)], 0.004, lid);
    return b;
  },
});
// the pump filter: the blue body, the black handle, the hoses coiled by it
model('pump', {
  hold: 'upright',
  build: (b) => {
    b.cyl(V(-0.08, 0.028, 0), V(0.08, 0.028, 0), 0.026, 0.026, 10, TILE.PLAIN, C(0x2f6aa8), { cap0: true, cap1: true, capTile: TILE.PLAIN });
    b.cyl(V(0.08, 0.028, 0), V(0.12, 0.028, 0), 0.006, 0.006, 6, TILE.PLAIN, C(0x9a9ea2), { cap1: true, capTile: TILE.PLAIN });
    flatBox(b, 0.13, 0.028, 0, 0.01, 0.01, 0.035, TILE.PLAIN, C(COL.black));
    const coil = [];
    for (let i = 0; i <= 18; i++) { const a = (i / 18) * Math.PI * 3.6; coil.push(V(-0.02 + Math.cos(a) * 0.05, 0.01 + i * 0.0006, 0.07 + Math.sin(a) * 0.04)); }
    b.tube(coil, 0.005, 5, TILE.PLAIN, C(0xd8dadc));
    return b;
  },
});
// the gravity filter: its bag rolled up and strapped, the hose and the cartridge
model('gravity', {
  build: (b) => {
    padRoll(b, {}, { col: 0x3a7ab8, L: 0.22, R: 0.05, inflating: true });
    const hose = [];
    for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 2.4; hose.push(V(0.02 + Math.cos(a) * 0.06, 0.006, 0.09 + Math.sin(a) * 0.035)); }
    b.tube(hose, 0.005, 5, TILE.PLAIN, C(0xd8dadc));
    b.cyl(V(0.08, 0.02, 0.1), V(0.14, 0.02, 0.1), 0.018, 0.018, 8, TILE.PLAIN, C(0x2a2a28), { cap0: true, cap1: true, capTile: TILE.PLAIN });
    return b;
  },
});
// the folding saw, folded: the handle (orange), the blade's back in its slot, the wing nut
model('saw', {
  hold: 'point', grip: [-0.08, 0.016, 0],
  build: (b) => {
    const handle = C(0xd9662a), blade = C(0xc7cbcf);
    part(b, (s) => s.tube(xs(7), (t) => 0.9 + 0.1 * Math.sin(t * Math.PI), 8, TILE.PLAIN, handle, { cap0: true, cap1: true }), M(0.24, 0.016, 0.028, 0, 0.016, 0));
    flatBox(b, 0.01, 0.031, 0, 0.11, 0.0025, 0.012, TILE.PLAIN, blade);
    flatBox(b, 0.012, 0.0325, 0, 0.1, 0.0012, 0.003, TILE.PLAIN, C(0x6a6e72));
    b.cyl(V(0.095, 0.005, 0), V(0.095, 0.036, 0), 0.009, 0.009, 6, TILE.PLAIN, C(0x2a2a28), { cap0: true, cap1: true, capTile: TILE.PLAIN });
    flatBox(b, -0.1, 0.016, 0, 0.012, 0.0165, 0.0145, TILE.PLAIN, C(0x2a2a28));
    return b;
  },
});
// an axe lying on its side: the ash handle along x, the head at +x (the bit toward +z, the poll -z)
model('axe', {
  hold: 'point', grip: [-0.2, 0.02, 0], tinted: true,
  build: (b, o) => {
    const wood = C(COL.ash), iron = o.tint || C(0x3e3e3c), edge = C(0xa6a9ab);
    const hp = [V(-0.24, 0.018, 0), V(-0.1, 0.017, 0.006), V(0.05, 0.016, 0.004), V(0.2, 0.017, 0)];
    b.tube(hp, (t) => 0.016 - 0.003 * Math.sin(t * Math.PI), 7, TILE.WOOD, wood, { cap0: true, cap1: true });
    // the head: a wedge in the plane, an eye round the handle
    const y0 = 0.004, y1 = 0.032;
    for (const y of [y0, y1]) {
      const pts = [V(0.165, y, -0.035), V(0.215, y, -0.035), V(0.225, y, 0.02), V(0.245, y, 0.115), V(0.15, y, 0.115), V(0.16, y, 0.02)];
      b.face(pts, TILE.PLAIN, iron, { ref: V(0.2, y === y0 ? 1 : -1, 0.03) });
    }
    const ring = [V(0.165, 0, -0.035), V(0.215, 0, -0.035), V(0.225, 0, 0.02), V(0.245, 0, 0.115), V(0.15, 0, 0.115), V(0.16, 0, 0.02)];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      b.quad(V(a.x, y0, a.z), V(c.x, y0, c.z), V(c.x, y1, c.z), V(a.x, y1, a.z), TILE.PLAIN, i === 3 ? edge : iron, { ref: V(0.2, 0.018, 0.03) });
    }
    return b;
  },
});
// the fillet knife in its leather sheath: the birch handle at -x
model('knife', {
  hold: 'point', grip: [-0.09, 0.012, 0],
  build: (b) => {
    part(b, (s) => s.tube(xs(6, -0.5, 0.5), (t) => (t > 0.85 ? 1 - (t - 0.85) * 4 : 1), 8, TILE.CANVAS, C(COL.leather), { cap0: true, cap1: true }), M(0.2, 0.012, 0.03, 0.06, 0.012, 0));
    part(b, (s) => s.tube(xs(6), round(0.3, 0.75), 8, TILE.WOOD, C(COL.birch), { cap0: true, cap1: true }), M(0.11, 0.018, 0.024, -0.095, 0.018, 0));
    flatBox(b, -0.038, 0.018, 0, 0.004, 0.017, 0.016, TILE.PLAIN, C(COL.brass));
    return b;
  },
});
// the landing net: the handle (-x), the hoop flat, its rubber-mesh bag slumped through it as cords
model('net', {
  hold: 'point', grip: [-0.36, 0.016, 0],
  build: (b) => {
    const alu = C(0x2b2d2f), mesh = C(0x1d1e1f);
    b.cyl(V(-0.42, 0.016, 0), V(-0.12, 0.016, 0), 0.014, 0.015, 8, TILE.PLAIN, alu, { cap0: true, capTile: TILE.PLAIN });
    flatBox(b, -0.37, 0.016, 0, 0.05, 0.017, 0.017, TILE.CANVAS, C(0x1a1a1a));
    const hoop = [];
    for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI * 2; hoop.push(V(0.08 - Math.cos(a) * 0.2, 0.014, Math.sin(a) * 0.16)); }
    b.tube(hoop, 0.009, 5, TILE.PLAIN, alu);
    b.tube([V(-0.13, 0.016, 0), V(-0.12, 0.015, 0)], 0.015, 6, TILE.PLAIN, alu);
    // the bag: meridians from the hoop to a low point beyond it, and two rings round it
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, x = 0.08 - Math.cos(a) * 0.2, z = Math.sin(a) * 0.16; cord(b, [V(x, 0.014, z), V(x * 0.6 + 0.12 * 0.4, 0.03, z * 0.6), V(0.14, 0.035, z * 0.15)], 0.0025, mesh, 3); }
    for (const k of [0.45, 0.75]) { const r = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; r.push(V((0.08 - Math.cos(a) * 0.2) * (1 - k) + 0.14 * k, 0.014 + 0.02 * k, Math.sin(a) * 0.16 * (1 - k * 0.85))); } b.tube(r, 0.0022, 3, TILE.ROPE, mesh); }
    return b;
  },
});
// the 35 mm camera: the black body, the chrome top, the lens; a strap's loops
model('camera', {
  hold: 'upright',
  build: (b) => {
    flatBox(b, 0, 0.038, 0, 0.068, 0.034, 0.025, TILE.CANVAS, C(0x262624));
    flatBox(b, 0, 0.078, 0, 0.068, 0.007, 0.025, TILE.PLAIN, C(0xb9bcbf));
    flatBox(b, 0, 0.09, 0, 0.018, 0.008, 0.016, TILE.PLAIN, C(0xb9bcbf));
    b.cyl(V(0, 0.04, 0.025), V(0, 0.04, 0.065), 0.024, 0.022, 12, TILE.PLAIN, C(0x1f1f1e), { cap1: true, capTile: TILE.PLAIN, capCol: C(0x3a4a5a) });
    b.cyl(V(0, 0.04, 0.05), V(0, 0.04, 0.054), 0.0245, 0.0245, 12, TILE.PLAIN, C(0xb9bcbf));
    for (const s of [-1, 1]) cord(b, [V(s * 0.068, 0.07, 0), V(s * 0.078, 0.075, 0), V(s * 0.08, 0.06, 0)], 0.003, C(COL.black));
    return b;
  },
});
// a headlamp: its band in a loose loop, the lamp's housing on it (the bigger one with the battery at the back)
model('headlamp', {
  hold: 'hang', up: 'y', grip: [0, 0.06, -0.05], tinted: true,
  build: (b, o) => {
    const band = C(0x262626), house = o.tint || C(0x3a3c3e), big = !!o.tint;
    const loop = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; loop.push(V(Math.cos(a) * 0.07, 0.008 + 0.004 * Math.sin(a * 2), Math.sin(a) * 0.055)); }
    part(b, (s) => s.tube(loop, 0.012, 4, TILE.CANVAS, band), M(1, 0.4, 1, 0, 0.003, 0));
    flatBox(b, 0.07, 0.022, 0, 0.012, 0.02, big ? 0.03 : 0.024, TILE.PLAIN, house);
    b.cyl(V(0.082, 0.022, 0), V(0.088, 0.022, 0), 0.012, 0.012, 10, TILE.PLAIN, C(0xd8dadc), { cap1: true, capTile: TILE.PLAIN, capCol: C(0xf2f0e4) });
    if (big) flatBox(b, -0.07, 0.02, 0, 0.012, 0.018, 0.03, TILE.PLAIN, house);
    return b;
  },
});
// a folded sheet of map (a Fisher map: pale paper, lakes in blue, a fold line)
model('map', {
  hold: 'upright', tinted: true,
  build: (b, o) => {
    const paper = o.tint || C(COL.paper), lake = C(0x8fb1c4), land = mixC(paper, C(0x9fb88a), 0.35);
    const col = (p) => (p.y < 0.004 ? paper.clone().multiplyScalar(0.85) : hash3(Math.round(p.x * 30), 0, Math.round(p.z * 30)) > 0.6 ? lake : hash3(Math.round(p.x * 12), 1, Math.round(p.z * 12)) > 0.5 ? land : paper);
    // the face as a grid of quads so the patches show
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      const x0 = -0.11 + i * (0.22 / 6), x1 = x0 + 0.22 / 6, z0 = -0.07 + j * (0.14 / 4), z1 = z0 + 0.14 / 4;
      b.quad(V(x0, 0.008, z0), V(x1, 0.008, z0), V(x1, 0.008, z1), V(x0, 0.008, z1), TILE.PLAIN, col, { ref: V((x0 + x1) / 2, 0, (z0 + z1) / 2) });
    }
    flatBox(b, 0, 0.004, 0, 0.11, 0.004, 0.07, TILE.PLAIN, paper.clone().multiplyScalar(0.9), { skip: ['+y'] });
    flatBox(b, 0, 0.0085, 0, 0.11, 0.0004, 0.0012, TILE.PLAIN, paper.clone().multiplyScalar(0.7));
    return b;
  },
});
// a rain jacket or a bug jacket folded small: a soft slab, the hood's fold, the zip
model('jacket', {
  tinted: true,
  build: (b, o) => {
    const c = o.tint || C(0x8a8a5a);
    soft(b, 0.22, 0.05, 0.17, (t) => (t < 0.05 ? 0.8 : t > 0.93 ? 0.8 : 1), (p) => (p.y < -0.5 ? c.clone().multiplyScalar(0.75) : c), { sides: 10 });
    soft(b, 0.07, 0.025, 0.15, round(0.3, 0.6), c.clone().multiplyScalar(0.88), { x0: 0.07, lift: 0.042, sides: 8 });
    flatBox(b, -0.02, 0.0505, 0, 0.09, 0.0012, 0.003, TILE.PLAIN, c.clone().multiplyScalar(0.55));
    return b;
  },
});
// a head net balled up, a blanket folded (a point blanket's stripes), a toque, a cap
model('headnet', { build: (b) => soft(b, 0.09, 0.05, 0.08, round(0.6, 0.3), (p) => C(hash3(Math.round(p.x * 6), Math.round(p.y * 5), Math.round(p.z * 6)) > 0.5 ? 0x2a2a2a : 0x3a3a38), { sides: 8, tile: TILE.CANVAS }) });
model('blanket', {
  build: (b) => {
    const wool = C(0xe8e0cc), stripes = [0x2f6a3a, 0xd9b23a, 0xb8322a, 0x2a3a6a];
    const col = (p) => { const u = (p.x + 0.5) * 5.2; const k = Math.floor(u); return u - k < 0.32 && k >= 1 && k <= 4 ? C(stripes[k - 1]) : wool; };
    soft(b, 0.32, 0.09, 0.24, (t) => (t < 0.04 || t > 0.96 ? 0.8 : 1), col, { n: 17, sides: 10 });
    return b;
  },
});
function hat(b, o, { cap = false } = {}) {
  const c = o.tint || C(0xa8322a), dark = c.clone().multiplyScalar(0.7);
  const ring = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; ring.push([0.002 + t * 0.075, 0.085 * Math.cos(t * Math.PI / 2) ** 0.6 + 0.004]); }
  for (let i = 0; i < ring.length - 1; i++) b.cyl(V(0, ring[i][0], 0), V(0, ring[i + 1][0], 0), ring[i][1], Math.max(0.006, ring[i + 1][1]), 12, TILE.CANVAS, i === 0 && !cap ? dark : c, { cap0: i === 0, capTile: TILE.CANVAS, cap1: i === ring.length - 2, capCol: c });
  if (cap) { const bill = []; for (let i = 0; i <= 6; i++) { const a = -0.9 + (i / 6) * 1.8; bill.push(V(Math.cos(a) * 0.086, 0.006, Math.sin(a) * 0.086)); } for (let i = 0; i < 6; i++) b.quad(bill[i], bill[i + 1], bill[i + 1].clone().multiplyScalar(1.75).setY(0.004), bill[i].clone().multiplyScalar(1.75).setY(0.004), TILE.CANVAS, dark, { ref: V(0.1, -1, 0) }); for (let i = 0; i < 6; i++) b.quad(bill[i], bill[i + 1], bill[i + 1].clone().multiplyScalar(1.75).setY(0.004), bill[i].clone().multiplyScalar(1.75).setY(0.004), TILE.CANVAS, dark, { ref: V(0.1, 1, 0) }); flatBox(b, 0, 0.08, 0, 0.008, 0.004, 0.008, TILE.CANVAS, C(0xd2b23a)); }
  else b.cyl(V(0, 0, 0), V(0, 0.022, 0), 0.087, 0.087, 12, TILE.CANVAS, dark);
  return b;
}
model('toque', { hold: 'upright', build: (b, o) => hat(b, o), tinted: true });
model('cap', { hold: 'upright', build: (b, o) => hat(b, o, { cap: true }), tinted: true });
// the camp chair (a floor chair: two foam panels in nylon, side straps): folded flat, or open as a low seat
model('chair', {
  tinted: true,
  build: (b, o) => {
    const c = o.tint || C(0x3f5443), edge = c.clone().multiplyScalar(0.7);
    for (const k of [0, 1]) soft(b, 0.46, 0.028, 0.4, (t) => (t < 0.04 || t > 0.96 ? 0.8 : 1), (p) => (p.y < -0.5 ? edge : c), { lift: k * 0.03, sides: 8, tile: TILE.CANVAS });
    for (const s of [-1, 1]) flatBox(b, 0, 0.031, s * 0.2, 0.2, 0.031, 0.006, TILE.PLAIN, C(COL.webbing));
    return b;
  },
});
model('chairopen', {
  tinted: true,
  build: (b, o) => {
    const c = o.tint || C(0x3f5443), edge = c.clone().multiplyScalar(0.7);
    soft(b, 0.46, 0.03, 0.4, (t) => (t < 0.04 || t > 0.96 ? 0.8 : 1), (p) => (p.y < -0.5 ? edge : c), { sides: 8 });
    // the back, raised at 70 degrees from the seat's back edge (-x)
    part(b, (s) => soft(s, 0.46, 0.03, 0.4, (t) => (t < 0.04 || t > 0.96 ? 0.8 : 1), (p) => (p.y < -0.5 ? edge : c), { sides: 8 }), MR(0, 0, 1.92, -0.31, 0.246, 0));
    for (const s of [-1, 1]) b.tube([V(-0.36, 0.44, s * 0.19), V(0.2, 0.035, s * 0.19)], 0.006, 4, TILE.PLAIN, C(COL.webbing), { cap0: true, cap1: true });
    return b;
  },
});

// lures, a little bigger than life so they read (as cook.js's spoon) --------------------------------------------------
const LURE_SCALE = 1.6;
model('lure', {
  hold: 'upright', tinted: true,
  build: (b, o) => {
    const k = o.lure || 'jig', c = o.tint, hook = C(0x5a5a5a), silver = C(0xc7cbcf);
    const at = (fn) => part(b, fn, M(LURE_SCALE, LURE_SCALE, LURE_SCALE));
    if (k === 'jig' || k === 'jigminnow') at((s) => {
      s.cyl(V(0.02, 0.01, 0), V(0.035, 0.01, 0), 0.008, 0.009, 8, TILE.PLAIN, c || C(k === 'jig' ? 0xc0392b : 0xd96a2a), { cap0: true, cap1: true, capTile: TILE.PLAIN });
      const tail = [V(0.02, 0.008, 0), V(0, 0.007, 0.004), V(-0.015, 0.006, -0.004), V(-0.03, 0.005, 0.004)];
      s.tube(tail, (t) => 0.005 * (1 - t * 0.7), 5, TILE.PLAIN, k === 'jig' ? C(0xd8b84a) : silver, { cap1: true });
    });
    else if (k === 'spinner' || k === 'spinnerbait') at((s) => {
      s.cyl(V(-0.025, 0.006, 0), V(0.012, 0.006, 0), 0.004, 0.005, 6, TILE.PLAIN, C(COL.brass), { cap0: true, cap1: true, capTile: TILE.PLAIN });
      part(s, (q) => q.tube(xs(5), round(0.5, 0.3), 6, TILE.PLAIN, silver, { cap0: true, cap1: true }), M(0.03, 0.003, 0.016, 0.03, 0.002, 0.006));
      if (k === 'spinnerbait') s.tube([V(-0.03, 0.006, 0), V(-0.045, 0.007, 0.006), V(-0.05, 0.007, -0.006)], 0.005, 5, TILE.PLAIN, c || C(0xb8d03a), { cap0: true, cap1: true });
      else s.tube([V(-0.025, 0.005, 0), V(-0.035, 0.004, 0.004)], 0.003, 4, TILE.PLAIN, hook);
    });
    else if (k === 'spoon' || k === 'silverminnow' || k === 'copperspoon') at((s) => {
      const top = k === 'spoon' ? (p) => (p.y > 0.2 ? (Math.abs(p.x) < 0.12 ? C(0xe8e4dc) : C(0xc0332a)) : silver) : () => c || (k === 'copperspoon' ? C(0xb87333) : silver);
      part(s, (q) => q.tube(xs(7), round(0.5, 0.25), 8, TILE.PLAIN, top, { cap0: true, cap1: true }), M(0.07, 0.006, 0.026, 0, 0.003, 0));
      s.tube([V(-0.035, 0.004, 0), V(-0.045, 0.004, 0.005)], 0.0025, 4, TILE.PLAIN, hook);
    });
    else at((s) => { // a plug: the Rapala, the Lazy Ike's banana, a topwater, a carved minnow
      const banana = k === 'lazyike', back = c || C(k === 'crankbait' ? 0x2a2e33 : k === 'lazyike' ? 0xd9b23a : k === 'topwater' ? 0xe8e2d0 : 0x6f8a52), belly = k === 'lazyike' ? C(0xd9b23a) : C(0xe6e6de);
      // (built a unit long, then sized: 9 cm, the Lazy Ike's banana bent through its depth)
      const pts = xs(7).map((p) => (banana ? p.setY(0.6 * Math.cos(p.x * 2.6)) : p));
      const head = (p) => k === 'topwater' && p.x > 0.3;
      part(s, (q) => q.tube(pts, round(0.5, 0.3), 8, TILE.PLAIN, (p) => (head(p) ? C(0xc0392b) : p.y > (banana ? 0.6 * Math.cos(p.x * 2.6) : 0) + 0.15 ? back : belly), { cap0: true, cap1: true }), M(0.09, 0.008, 0.0055, 0, 0.008, 0));
      if (k === 'crankbait') flatBox(s, 0.05, 0.004, 0, 0.008, 0.0006, 0.006, TILE.PLAIN, C(0xd8dcd8));
      s.tube([V(0, 0.0, 0), V(-0.004, -0.004, 0.003)], 0.0018, 3, TILE.PLAIN, hook);
    });
    return b;
  },
});

// wood and the woods' things -------------------------------------------------------------------------------------------
// a dead branch, a short log, a dead pole, an armful of split wood (as chores.js's pieces, lying on the ground)
function wood(b, kind) {
  if (kind === 'pole') { b.tube([V(-1.05, 0.03, 0), V(-0.35, 0.031, 0.01), V(0.35, 0.028, -0.008), V(1.05, 0.024, 0)], (t) => 0.03 * (1 - 0.35 * t), 6, TILE.BARK, C(0x8b8276), { cap0: true, cap1: true }); return b; }
  if (kind === 'branch') {
    const bark = C(0x6b5d50), pts = [V(-0.55, 0.024, 0), V(-0.16, 0.026, 0.025), V(0.16, 0.022, -0.02), V(0.55, 0.018, 0.012)];
    b.tube(pts, (t) => 0.024 * (1 - 0.5 * t), 6, TILE.BARK, bark, { cap0: true, cap1: true });
    for (const [t, s] of [[1, 1], [2, -1]]) b.tube([pts[t].clone(), pts[t].clone().add(V(0.1, 0.012, s * 0.12))], (q) => 0.01 * (1 - 0.6 * q), 4, TILE.BARK, bark, { cap1: true });
    return b;
  }
  if (kind === 'log') { b.cyl(V(-0.24, 0.06, 0), V(0.24, 0.058, 0.01), 0.06, 0.056, 9, TILE.BARK, C(0x5d4c3c), { cap0: true, cap1: true, capCol: C(0xcdb48a) }); return b; }
  for (const [z, y] of [[-0.06, 0.05], [0.06, 0.05], [0, 0.13]]) b.cyl(V(-0.22, y, z), V(0.22, y, z), 0.05, 0.05, 7, TILE.BARK, C(0x6a5644), { cap0: true, cap1: true, capCol: C(0xcdb48a), arc: [Math.PI * 0.1, Math.PI * 1.3], flatTile: TILE.SPLIT, flatCol: C(0xc6a77c) });
  return b;
}
model('branch', { build: (b) => wood(b, 'branch'), hold: 'point', grip: [-0.25, 0.02, 0] });
model('log', { build: (b) => wood(b, 'log'), hold: 'upright' });
model('pole', { build: (b) => wood(b, 'pole'), hold: 'point', grip: [-0.6, 0.03, 0] });
model('firewood', { build: (b) => wood(b, 'split'), hold: 'upright' });

// the signature items (outfitters.js families) that are not long things ---------------------------------------------
model('cedaryoke', {
  build: (b) => {
    const cedar = C(0xb9824e);
    part(b, (s) => s.tube(xs(9, -0.5, 0.5).map((p) => p.setZ(-0.035 * Math.cos(p.x * Math.PI))), (t) => (Math.abs(t - 0.5) < 0.12 ? 0.6 : 1), 6, TILE.WOOD, cedar, { cap0: true, cap1: true }), M(0.78, 0.022, 0.05, 0, 0.022, 0));
    for (const s of [-1, 1]) soft(b, 0.15, 0.035, 0.08, round(0.3, 0.6), C(0x5a4232), { x0: s * 0.2, lift: 0.03, sides: 8 });
    return b;
  },
});
model('tump', {
  build: (b) => {
    const coil = [];
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 6, r = 0.03 + i * 0.0018; coil.push(V(Math.cos(a) * r, 0.006 + (i % 2) * 0.001, Math.sin(a) * r)); }
    part(b, (s) => s.tube(coil, 0.012, 4, TILE.CANVAS, C(COL.leather)), M(1, 0.4, 1));
    return b;
  },
});
model('kneelers', { build: (b) => { for (const z of [-0.07, 0.07]) soft(b, 0.24, 0.05, 0.12, round(0.25, 0.6), (p) => C(hash3(Math.round(p.x * 10), Math.round(p.y * 4), Math.round(p.z * 8)) > 0.5 ? 0xe8e0c8 : 0xd8cfb4), { z0: z, sides: 8 }); return b; } });
model('canvas', { build: (b) => { soft(b, 0.28, 0.06, 0.22, (t) => (t < 0.04 || t > 0.96 ? 0.8 : 1), (p) => C(p.y < -0.5 ? 0x8a7a54 : 0xb3a274), { sides: 8 }); for (const x of [-0.07, 0.07]) flatBox(b, x, 0.03, 0, 0.012, 0.032, 0.112, TILE.PLAIN, C(COL.leather)); return b; } });
model('card', { hold: 'upright', build: (b) => { flatBox(b, 0, 0.003, 0, 0.06, 0.003, 0.045, TILE.PLAIN, C(COL.paper)); for (let i = 0; i < 3; i++) cord(b, [V(-0.04, 0.007, -0.02 + i * 0.02), V(0.04, 0.007, -0.02 + i * 0.02)], 0.0015, C(0xb8bcc0), 3); return b; } });
model('sailroll', {
  build: (b) => {
    for (const z of [-0.025, 0.025]) b.cyl(V(-0.32, 0.025, z), V(0.32, 0.025, z), 0.018, 0.018, 6, TILE.WOOD, C(COL.ash), { cap0: true, cap1: true });
    b.cyl(V(-0.25, 0.04, 0), V(0.25, 0.04, 0), 0.04, 0.04, 10, TILE.CANVAS, C(0xd8ccae), { cap0: true, cap1: true, capTile: TILE.CANVAS });
    for (const x of [-0.15, 0.15]) b.cyl(V(x - 0.008, 0.04, 0), V(x + 0.008, 0.04, 0), 0.043, 0.043, 10, TILE.ROPE, C(COL.rope), {});
    return b;
  },
});
// the uniques that are small things: a heart brooch of trade silver, a brass bait-casting reel
model('brooch', {
  hold: 'upright', tinted: true,
  build: (b, o) => {
    const s = o.tint || C(0xc7c9cc), heart = [];
    for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2, x = 16 * Math.sin(t) ** 3, z = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); heart.push(V(-z * 0.0028, 0, x * 0.0028)); }
    for (const y of [0.002, 0.006]) b.face(heart.map((p) => p.clone().setY(y)), TILE.PLAIN, s, { ref: V(0, y === 0.002 ? 1 : -1, 0) });
    for (let i = 0; i < heart.length; i++) { const a = heart[i], c = heart[(i + 1) % heart.length]; b.quad(V(a.x, 0.002, a.z), V(c.x, 0.002, c.z), V(c.x, 0.006, c.z), V(a.x, 0.006, a.z), TILE.PLAIN, s.clone().multiplyScalar(0.8), { ref: V(0, 0.004, 0) }); }
    return b;
  },
});
model('reel', {
  hold: 'upright', tinted: true,
  build: (b, o) => {
    const brass = o.tint || C(COL.brass);
    for (const z of [-0.022, 0.022]) b.cyl(V(0, 0.03, z), V(0, 0.03, z + (z > 0 ? 0.006 : -0.006)), 0.03, 0.03, 14, TILE.PLAIN, brass, { cap0: true, cap1: true, capTile: TILE.PLAIN });
    b.cyl(V(0, 0.03, -0.022), V(0, 0.03, 0.022), 0.018, 0.018, 10, TILE.PLAIN, C(0x3a3a38));
    for (const x of [-0.02, 0.02]) b.cyl(V(x, 0.008, -0.022), V(x, 0.008, 0.022), 0.003, 0.003, 4, TILE.PLAIN, brass);
    b.tube([V(0, 0.03, 0.03), V(0.03, 0.03, 0.035), V(0.03, 0.045, 0.04)], 0.003, 4, TILE.PLAIN, C(0x1f1f1f), { cap1: true });
    flatBox(b, 0.03, 0.045, 0.043, 0.008, 0.005, 0.004, TILE.PLAIN, C(0x1f1f1f));
    return b;
  },
});

// --- which model an item is ------------------------------------------------------------------------------------------
// the ids drawn as a particular model (with a tint), before def.model: the base items and those whose look the def's
// own words would get wrong (a summer sausage is not a jerky pack, a granola band is not a chocolate bar)
const KEY_OF_ID = {
  'meal:breakfast': ['bag', 0xd9c9a0], 'meal:supper': ['bag', 0xc29a6a], 'meal:freeze': ['pouch', 0x4e7a52], 'meal:pancakes': ['bag', 0xeadfc4],
  'meal:bannock': ['bag', 0xeee6d2], 'meal:chili': ['pouch', 0xa8402e],
  'snack:trailmix': ['trailmix'], 'snack:jerky': ['jerky'], 'snack:chocolate': ['bar'], 'snack:sausage': ['sausage', 0x9a2a22], 'snack:granola': ['granola'],
  'snack:apricots': ['bag', 0xd98a3a], 'snack:tortilla': ['tortilla'],
  'hot:breakfast': ['bowl', 0xcdb88a], 'hot:supper': ['bowl', 0xb9925a], 'hot:freeze': ['bowl', 0x9a6a3a],
  'hot:pancakes': ['pancakes'], 'hot:chili': ['bowl', 0x8a3a24], 'hot:bannock': ['bannock'],
  leeches: ['cup'], aframe: ['tentbag', 0xb5763a], dome: ['tentbag', 0x5f7f3a], fourseason: ['tentbag', 0xc9a23a],
  sleepingbag: ['sleepbag', 0x2f5f8a], bag3: ['sleepbag', 0x4a6a3a], bagdown: ['sleepbag', 0xa8402e], clothes: ['drybag', 0x4f7d9c],
  tarp: ['tarpsack', 0x55704a], pad: ['pad'], padair: ['padroll', 0xc96a2a], yokepads: ['yokepads'], pot: ['pot'],
  tablets: ['tube'], pump: ['pump'], gravity: ['gravity'], saw: ['saw'], camera: ['camera'], bottle: ['bottle'],
  stove: ['stove'], fuel: ['canister', 0x2f68a8], rainjacket: ['jacket', 0xc99a2e], headnet: ['headnet'], chair: ['chair', 0x3f5443],
  coffee: ['coffee'], cocoa: ['coffee', 0x6a3a22], headlamp: ['headlamp'], headlamp2: ['headlamp'], headlamp3: ['headlamp', 0xb4321f],
  net: ['net'], knife: ['knife'], axe: ['axe'], axehead: ['axe', 0x3a3532], tradesilver: ['brooch', 0xb9bbbd], brassreel: ['reel', 0xb8923a],
  matchsafe: ['tube', 0xa0a4a8], toque: ['toque', 0xa8322a], luckycap: ['cap', 0x6e2630], guidemap: ['map', 0xd8c9a2],
  'wood:branch': ['branch'], 'wood:log': ['log'], pole: ['pole'], firewood: ['firewood'],
};
// the outfitters' signature items by their icon (inv-ui.js FAMILY)
const KEY_OF_ICON = {
  cedaryoke: ['cedaryoke'], net: ['net'], blanket: ['blanket'], jacket: ['jacket', 0x6a6a4a], cover: ['canvas'], copperspoon: ['lure'],
  tump: ['tump'], leaders: ['card'], kneelers: ['kneelers'], sail: ['sailroll'],
};
const KEY_OF_KIND = { food: ['bowl'], snack: ['bag', 0xc8a46a], meal: ['pouch'], fish: ['fish'], bait: ['cup'], lure: ['lure'], tool: ['box'], gear: ['sack'], map: ['map'], firewood: ['branch'], forage: ['cup'] };
// a small hard case: a fallback for a tool nobody named
model('box', { hold: 'upright', tinted: true, build: (b, o) => { const c = o.tint || C(0x4a5a4a); flatBox(b, 0, 0.025, 0, 0.06, 0.025, 0.04, TILE.PLAIN, c); flatBox(b, 0, 0.051, 0, 0.055, 0.002, 0.035, TILE.PLAIN, c.clone().multiplyScalar(0.8)); return b; } });
model('book', { hold: 'upright', build: (b) => { flatBox(b, 0, 0.012, 0, 0.09, 0.012, 0.065, TILE.CANVAS, C(0x5a3a2a)); flatBox(b, 0.004, 0.012, 0, 0.087, 0.01, 0.062, TILE.PLAIN, C(COL.paper), { skip: ['-x'] }); return b; } });

const look = (id) => {
  const d = itemDef(id); if (!d) return null;
  if (d.kind === 'container' || d.kind === 'long') return null;
  const s = String(id);
  let k = KEY_OF_ID[s];
  if (!k && s.startsWith('fish:')) k = ['fish'];
  if (!k && s.startsWith('fillet:')) k = ['fillet'];
  if (!k && s.startsWith('fried:')) k = ['plate'];
  if (!k && s.startsWith('sheet:')) k = ['map'];
  if (!k && typeof d.model === 'string' && MODELS[d.model]) k = [d.model];
  if (!k && d.icon && KEY_OF_ICON[d.icon]) k = KEY_OF_ICON[d.icon];
  if (!k && d.kind === 'forage') k = ['cup', FORAGE_LOOK[s] || 0x3c4c8c];
  if (!k) k = KEY_OF_KIND[d.kind] || ['sack'];
  // the def's own tint (stream C) over the table's
  const tint = Number.isFinite(d.tint) ? d.tint : k[1] ?? null;
  return { key: k[0], tint, def: d };
};
export function modelKeyOf(itemId) { const l = look(itemId); return l ? l.key : null; }

// --- the geometries ----------------------------------------------------------------------------------------------------
const GEOS = new Map();
// baked shade (no bake: they are small): darker low down and facing down, a soft contact at the bottom
function shadeModel(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, H = Math.max(0.01, bb.max.y - bb.min.y);
  const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), O = geo.getAttribute('aOcc');
  for (let i = 0; i < O.count; i++) {
    const y = (P.getY(i) - bb.min.y) / H, ny = N.getY(i);
    O.setX(i, (0.6 + 0.4 * Math.min(1, y * 1.6)) * (ny < -0.5 ? 0.62 : ny < 0 ? 0.85 : 1) * (P.getY(i) - bb.min.y < 0.012 ? 0.8 : 1));
  }
  O.needsUpdate = true;
  return geo;
}
// a lure's shape by its id (lure:<this>) or, failing that, its fishing.js lure
const LURE_SHAPE = {
  jig: 'jig', mepps: 'spinner', daredevle: 'spoon', rapala: 'crankbait', silverminnow: 'silverminnow', lazyike: 'lazyike', spinnerbait: 'spinnerbait',
  jigminnow: 'jigminnow', topwater: 'topwater', cedarminnow: 'cedarminnow', spinner: 'spinner', spoon: 'spoon', crankbait: 'crankbait', leech: 'jig',
};
// the variant a def asks for: the species of a fish or a fillet, the lure's kind, a forage item, the chair open
function variantOf(l, id) {
  const d = l.def, s = String(id);
  const species = d.species || (s.startsWith('fish:') || s.startsWith('fillet:') || s.startsWith('fried:') ? s.split(':')[1] : null);
  const lure = l.key === 'lure' ? (d.icon === 'copperspoon' ? 'copperspoon' : LURE_SHAPE[s.replace(/^lure:/, '')] || LURE_SHAPE[d.lure] || 'jig') : null;
  return { species, lure, forage: d.kind === 'forage' };
}
const FILLET_TINT = { laketrout: 0xe8b8a0, walleye: 0xf2ece2, pike: 0xeee8dc, smallmouth: 0xeee2d4, perch: 0xf0e8dc, crappie: 0xf2ece4 };
export function modelGeometry(itemId, data = null, { open = false } = {}) {
  const l = look(itemId); if (!l) return null;
  let key = l.key;
  if (key === 'chair' && open) key = 'chairopen';
  const spec = MODELS[key] || MODELS.sack, v = variantOf(l, itemId);
  let tint = l.tint;
  if (key === 'fillet' && !Number.isFinite(l.def.tint)) tint = FILLET_TINT[v.species] ?? 0xf0e8dc;
  const gk = `${key}|${tint ?? ''}|${v.species || ''}|${v.lure || ''}|${v.forage ? 1 : 0}`;
  let g = GEOS.get(gk);
  if (!g) {
    const b = new PropBuilder();
    spec.build(b, { tint: tint != null && spec.tinted !== false ? C(tint) : null, def: l.def, id: itemId, data, ...v });
    const geo = shadeModel(b.build());
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    // set on the ground and centred on its footprint
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    const shift = V(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    const size = geo.boundingBox.getSize(V());
    const grip = spec.grip ? V(...spec.grip).add(shift) : null;
    g = { geo, key, hold: spec.hold, up: spec.up, grip, size: [size.x, size.y, size.z] };
    GEOS.set(gk, g);
  }
  // the size it is drawn at: a fish by its length (built a metre long), anything else as built
  const cm = data && Number.isFinite(+data.length) ? +data.length : key === 'fish' ? (FISH[v.species] || FISH.fish).cm : null;
  return { ...g, scale: key === 'fish' ? cm / 100 : 1 };
}
export function itemMaterial() { return propMaterial(); }
// a mesh of an item at rest (stream C's uniques lying in the world): bottom at y = 0, centred, the long side along +x
export function modelFor(itemId, data = null, opts = {}) {
  const m = modelGeometry(itemId, data, opts); if (!m) return null;
  const mesh = new THREE.Mesh(m.geo, propMaterial());
  mesh.scale.setScalar(m.scale);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = `item:${itemId}`;
  mesh.userData.itemModel = m.key;
  return mesh;
}

// --- in a hand -------------------------------------------------------------------------------------------------------
const _b = new THREE.Matrix4(), _g = V(), _x = V(), _y = V(), _z = V(), _s = V();
// its world matrix in a hand: hand the hand's world position, forward and right the body's (unit, level), side +1 the
// right hand and -1 the left, m a modelGeometry; out a Matrix4
export function holdMatrix(m, hand, forward, right, side, out) {
  const s = m.scale || 1, up = Y, size = m.size;
  if (m.hold === 'point') {
    // ahead and down: the handle (-x) in the fist, the flat side to the side
    _x.copy(forward).multiplyScalar(Math.cos(0.75)).addScaledVector(up, -Math.sin(0.75)).normalize();
    _y.copy(right).multiplyScalar(side);
    _z.crossVectors(_x, _y);
    _g.copy(m.grip || V(-size[0] * 0.38, size[1] / 2, 0));
  } else if (m.hold === 'hang' && m.up === 'x') {
    // hung by its +x end: x up, its thickness (y) across the body, so the broad faces lie along the leg
    _x.copy(up); _y.copy(right).multiplyScalar(side); _z.crossVectors(_x, _y);
    _g.copy(m.grip || V(size[0] / 2, size[1] / 2, 0));
  } else {
    // upright, or hung by a handle on top: as it stands, its long side ahead
    _x.copy(forward); _y.copy(up); _z.crossVectors(_x, _y);
    _g.copy(m.grip || (m.hold === 'hang' ? V(0, size[1], 0) : V(0, size[1] * 0.5, 0)));
  }
  _b.makeBasis(_x, _y, _z);
  _s.set(s, s, s);
  out.copy(_b).scale(_s);
  _g.multiplyScalar(s).applyMatrix4(_b);
  out.setPosition(hand.x - _g.x, hand.y - _g.y, hand.z - _g.z);
  return out;
}

// --- many in one ---------------------------------------------------------------------------------------------------------
// [{ geo, matrix }] → one geometry (positions and normals moved, the rest copied), or null for none
export function mergeModels(list) {
  let n = 0;
  for (const it of list) n += it.geo.getAttribute('position').count;
  if (!n) return null;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cl = new Float32Array(n * 3), U = new Float32Array(n * 2), T = new Float32Array(n), O = new Float32Array(n);
  const nm = new THREE.Matrix3(), v = V();
  let o = 0;
  for (const it of list) {
    const g = it.geo, gp = g.getAttribute('position'), gn = g.getAttribute('normal');
    nm.getNormalMatrix(it.matrix);
    for (let i = 0; i < gp.count; i++) {
      v.fromBufferAttribute(gp, i).applyMatrix4(it.matrix); P[(o + i) * 3] = v.x; P[(o + i) * 3 + 1] = v.y; P[(o + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize(); N[(o + i) * 3] = v.x; N[(o + i) * 3 + 1] = v.y; N[(o + i) * 3 + 2] = v.z;
    }
    Cl.set(g.getAttribute('color').array, o * 3); U.set(g.getAttribute('aPropUv').array, o * 2); T.set(g.getAttribute('aPropTile').array, o); O.set(g.getAttribute('aOcc').array, o);
    o += gp.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(Cl, 3)); geo.setAttribute('aPropUv', new THREE.BufferAttribute(U, 2));
  geo.setAttribute('aPropTile', new THREE.BufferAttribute(T, 1)); geo.setAttribute('aOcc', new THREE.BufferAttribute(O, 1));
  geo.computeBoundingSphere();
  return geo;
}
// a cord with clips, for the stringer: from a to b (world or local points), sagging
export function cordGeometry(pts, r = 0.003, col = COL.rope) {
  const b = new PropBuilder();
  b.tube(pts, r, 4, TILE.ROPE, C(col), { cap0: true, cap1: true });
  return shadeModel(b.build());
}
export const MODEL_KEYS = Object.keys(MODELS);
