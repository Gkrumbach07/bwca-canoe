// Round 7 stream 7b's kits for the story layer (story-props.js REGISTRY takes them in its 7b block): S5's wreck on the
// Kek's bed and its map case, the framed chart for the Round Lake wall; S6's carved rock at the Beatty, the healed blazes
// on the cut line, the beaver pond, and the Bootleg pit's planks, the planks tossed aside, the crate. The pit's moss slump
// itself is stream f's `pit` (the look shared with the cellar, 60 S6 "Build notes"). Same frame and contract as
// story-props.js: origin on the ground at the foot, +y up, -z toward the water; { geo, dots, top? }. One material.
import * as THREE from 'three';
import { PropBuilder, TILE, chunkStone } from './prop-kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const COL = {
  red: C(0x9a2e24), redDull: C(0x6e3a30), cream: C(0xd8ccae), creamDull: C(0x9e9a84), metal: C(0x6a6e6a), weed: C(0x4a5a34),
  leather: C(0x5a3a22), granite: C(0x8f8a80), rock: C(0x7c776e), cut: C(0x5e5a52), bark: C(0x5a4a3a), face: C(0x8a857a),
  rot: C(0x5c4a36), rotDark: C(0x3e3226), tin: C(0x7a7a72), amber: C(0x8a5a1a), glass: C(0x4a3a1a), oil: C(0x3a3a2a),
  water: C(0x2a3428), mud: C(0x4a3e2e), stick: C(0x6a5a44), frame: C(0x3e2e1e), paper: C(0xd8d0b8), pencil: C(0x5a5a5a),
};
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

// the plane on the bed, settled into the silt: a high wing, red and cream, riveted, the body under it with its cabin door
// hanging open, a ski broken off beside; weed on the upper surfaces. About 10 m of wing, 7.5 m of body. opts.level: the
// water's depth over the foot (the bed), so the dots sit at the surface for the canoe (60 S5: seen from above)
function wreck({ rng, level = 3.5 }) {
  const b = new PropBuilder(), tilt = 0.08;
  // the body: a tapered box, cream below, red above, along x
  b.box(V(0, 0.55, 0), X, Y, Z, 2.6, 0.5, 0.48, TILE.PAINT, COL.creamDull, { grain: 'x' });
  b.box(V(0.4, 1.02, 0), X, Y, Z, 2.2, 0.06, 0.46, TILE.PAINT, COL.redDull, { grain: 'x' });
  b.box(V(-3.2, 0.62, 0), X, Y, Z, 0.9, 0.32, 0.26, TILE.PAINT, COL.redDull, { grain: 'x' }); // the tail cone
  b.box(V(-3.95, 1.05, 0), X, Y, Z, 0.35, 0.5, 0.04, TILE.PAINT, COL.red, { grain: 'y' });     // the fin
  b.box(V(-3.9, 0.66, 0), X, Y, Z, 0.32, 0.03, 1.2, TILE.PAINT, COL.cream, { grain: 'z' });    // the tailplane
  b.cyl(V(2.62, 0.55, 0), V(2.95, 0.55, 0), 0.32, 0.22, 8, TILE.METAL, COL.metal, { cap1: true }); // the cowl
  b.box(V(3.0, 0.55, 0), X, Y, Z, 0.03, 0.85, 0.06, TILE.METAL, COL.metal, { grain: 'y' });       // a blade, bent
  // the high wing: across z, a little tilted, red with a cream stripe
  for (const s of [-1, 1]) {
    const o = V(0.9, 1.25 + s * tilt, s * 2.6);
    b.box(o, X, Y, Z, 0.85, 0.07, 2.3, TILE.PAINT, COL.red, { grain: 'z' });
    b.box(V(o.x + 0.55, o.y + 0.075, o.z), X, Y, Z, 0.22, 0.01, 2.2, TILE.PAINT, COL.cream, { grain: 'z' });
    b.cyl(V(0.6, 0.3, s * 0.4), V(0.6, 1.2 + s * tilt, s * 1.6), 0.04, 0.04, 5, TILE.METAL, COL.metal); // the strut
  }
  // the cabin door hanging open on the near side (+z), and the dark of the cabin behind it
  b.box(V(1.1, 0.6, 0.62), X, Y, Z, 0.42, 0.36, 0.02, TILE.PAINT, COL.creamDull, { grain: 'x' });
  b.box(V(1.3, 0.62, 0.485), X, Y, Z, 0.4, 0.3, 0.005, TILE.PLAIN, COL.oil, { grain: 'x' });
  // a ski, broken off, half in the silt
  b.box(V(0.9, 0.06, -1.4), X, Y, Z, 1.2, 0.04, 0.16, TILE.WOOD, COL.creamDull, { grain: 'x' });
  // weed on the wing, rocks of the shelf at its root
  for (let k = 0; k < 18; k++) { const x = (rng() - 0.3) * 3.6, z = (rng() - 0.5) * 9, y = 1.34; b.cyl(V(x, y, z), V(x + (rng() - 0.5) * 0.2, y + 0.25 + rng() * 0.3, z), 0.05, 0.01, 4, TILE.FIBRE, COL.weed); }
  for (let k = 0; k < 4; k++) chunkStone(b, new THREE.Matrix4().compose(V(-1.5 + k * 1.4, 0.05, -2.4 - rng()), new THREE.Quaternion(), V(0.7, 0.35, 0.6)), rng, COL.granite);
  // the dots: from the canoe, at the surface over it (the reading); the case behind the seat (the diver)
  return { geo: b.build(), dots: [{ y: Math.max(1.6, level), r: 4.5 }], top: 1.3 };
}
// the map case behind the seat: swollen leather, a strap
function mapCase() {
  const b = new PropBuilder();
  b.box(V(0, 0.14, 0), X, Y, Z, 0.2, 0.14, 0.05, TILE.CANVAS, COL.leather, { grain: 'x' });
  b.box(V(0, 0.3, 0), X, Y, Z, 0.16, 0.012, 0.012, TILE.CANVAS, COL.leather, { grain: 'x' });
  return { geo: b.build(), dots: [{ y: 0.14, r: 0.35 }] };
}
// the pilot's chart, framed under glass on the Round Lake wall (built by feed-side7b.js in the store's frame: it faces +z)
function chartFrame() {
  const b = new PropBuilder(), w = 0.46, h = 0.34;
  b.box(V(0, 0, 0), X, Y, Z, w + 0.03, h + 0.03, 0.012, TILE.WOOD, COL.frame, { grain: 'x' });
  b.box(V(0, 0, 0.014), X, Y, Z, w, h, 0.002, TILE.PLAIN, COL.paper, { grain: 'x' });
  b.box(V(-0.1, 0.05, 0.017), X, Y, Z, 0.22, 0.002, 0.001, TILE.PLAIN, COL.pencil); // the straight cut
  b.box(V(0, -h - 0.08, 0.01), X, Y, Z, 0.16, 0.03, 0.004, TILE.PLAIN, COL.paper);  // the card
  return { geo: b.build(), dots: [{ y: 0, r: 0.45 }] };
}
// the flat rock at the Beatty's low end, the letters cut deep with a knife point and worn soft
function carvedRock({ rng }) {
  const b = new PropBuilder();
  chunkStone(b, new THREE.Matrix4().compose(V(0, 0.08, 0), new THREE.Quaternion(), V(1.4, 0.22, 1.0)), rng, COL.granite);
  // the cuts: N.N. 1928 as short dark strokes on the top face
  const S = [[-0.55, 0, 0.18, 0.5], [-0.42, 0, -0.18, 0.5], [-0.3, 0, 0.18, 0.5], [-0.12, 0, 0.18, 0.5], [0.01, 0, -0.18, 0.5], [0.14, 0, 0.18, 0.5],
    [0.32, 0, 0, 0.0], [0.46, 0, 0, 0.0], [0.6, 0, 0, 0.0], [0.74, 0, 0, 0.0]];
  for (const [x, , tz] of S) b.box(V(x, 0.305, tz * 0.3), X, Y, Z, 0.012, 0.004, 0.09, TILE.PLAIN, COL.cut, { grain: 'z' });
  return { geo: b.build(), dots: [{ y: 0.3, r: 0.9 }] };
}
// an old axe blaze on a pine, healed to a grey "cat face": a long scar in the bark, no paint
function catface({ rng }) {
  const b = new PropBuilder(), H = 7 + rng() * 3;
  b.cyl(V(0, -0.2, 0), V(0.05, H, 0.03), 0.22, 0.12, 8, TILE.BARK, COL.bark, { cap1: true, jitter: 0.02, rng });
  b.box(V(0, 1.35, -0.2), X, Y, Z, 0.09, 0.32, 0.03, TILE.WOOD, COL.face, { grain: 'y' });
  return { geo: b.build(), dots: [{ y: 1.35, r: 0.5 }] };
}
// the beaver pond behind the lake: dark still water in a hollow, a dam of sticks and mud along its low side, drowned stubs
function beaverPond({ rng }) {
  const b = new PropBuilder(), R = 14;
  const pts = []; for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2, r = R * (0.75 + rng() * 0.3); pts.push(V(Math.cos(a) * r, 0.04, Math.sin(a) * r * 0.7)); }
  for (let k = 0; k < pts.length; k++) b.face([V(0, 0.04, 0), pts[(k + 1) % pts.length], pts[k]], TILE.PLAIN, COL.water);
  for (let k = 0; k < 14; k++) { const x = -R * 0.8 + k * (R * 1.6 / 13), z = R * 0.7 * 0.92; b.cyl(V(x, 0, z), V(x + (rng() - 0.5) * 0.6, 0.45 + rng() * 0.25, z + (rng() - 0.5) * 0.5), 0.06, 0.03, 4, TILE.BARK, k % 3 ? COL.stick : COL.mud); }
  b.box(V(0, 0.12, R * 0.68), X, Y, Z, R * 0.82, 0.14, 0.5, TILE.PLAIN, COL.mud, { grain: 'x' });
  for (let k = 0; k < 5; k++) { const x = (rng() - 0.5) * R, z = (rng() - 0.5) * R * 0.8; b.cyl(V(x, 0, z), V(x, 1.2 + rng() * 2, z), 0.1, 0.06, 5, TILE.BARK, COL.face); }
  return { geo: b.build(), dots: [] };
}
// one rotten plank of the pit's cover, laid side by side over the hole, sagging (opts.i: which, 1..5 across x)
function pitPlank({ opts = {} }) {
  const b = new PropBuilder(), i = opts.i || 1, x = -0.64 + (i - 1) * 0.32;
  b.box(V(x, -0.07 - (i === 2 || i === 4 ? 0.04 : 0), 0), X, Y, Z, 0.145, 0.025, 0.78, TILE.WOOD, i % 2 ? COL.rot : COL.rotDark, { grain: 'z' });
  return { geo: b.build(), dots: [{ y: -0.06, r: 0.28 }] };
}
// a plank pulled out and tossed aside, wet and punky, broken in two (a piece in each hand)
function plankTossed({ rng, opts = {} }) {
  const b = new PropBuilder(), i = opts.i || 1, a = 0.4 + i * 0.7;
  for (const k of [0, 1]) b.box(V(1.2 + Math.cos(a) * (0.3 + k * 0.5), 0.03, -0.6 + i * 0.3 + Math.sin(a) * k * 0.3), V(Math.cos(a + k * 0.5), 0, Math.sin(a + k * 0.5)), Y, V(-Math.sin(a + k * 0.5), 0, Math.cos(a + k * 0.5)), 0.14, 0.025, 0.34 + rng() * 0.08, TILE.WOOD, COL.rot, { grain: 'z' });
  return { geo: b.build(), dots: [] };
}
// the hole under the planks, opened from above: the tin-lined crate, broken amber glass, three whole bottles (one full,
// its seal on), the oilcloth packet (opts.ledger false: the packet taken; opts.bottle false: the full one taken;
// opts.dug: a stranger's work, the crate gone and meltwater in it)
function bootCrate({ rng, opts = {} }) {
  const b = new PropBuilder(), D = 0.75, h = 0.66;
  b.quad(V(-h, -D, -h), V(h, -D, -h), V(h, -D, h), V(-h, -D, h), TILE.PLAIN, opts.dug ? COL.water : COL.mud);
  for (const [ax, az, bx, bz] of [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]]) b.quad(V(bx, -D, bz), V(ax, -D, az), V(ax, -0.08, az), V(bx, -0.08, bz), TILE.PLAIN, COL.mud);
  if (opts.dug) return { geo: b.build(), dots: [] };
  b.box(V(0, -D + 0.18, 0), X, Y, Z, 0.42, 0.18, 0.3, TILE.METAL, COL.tin, { grain: 'x', skip: ['+y'] });
  for (let k = 0; k < 14; k++) { const x = (rng() - 0.5) * 0.7, z = (rng() - 0.5) * 0.5; b.box(V(x, -D + 0.38, z), V(Math.cos(k), 0, Math.sin(k)), Y, V(-Math.sin(k), 0, Math.cos(k)), 0.03, 0.004, 0.02, TILE.GLASS, COL.amber); }
  const bottles = opts.bottle === false ? 2 : 3;
  for (let k = 0; k < bottles; k++) { const x = -0.22 + k * 0.2; b.cyl(V(x, -D + 0.2, 0.05), V(x, -D + 0.48, 0.05), 0.04, 0.04, 7, TILE.GLASS, k === 2 ? COL.amber : COL.glass, { cap1: true }); b.cyl(V(x, -D + 0.48, 0.05), V(x, -D + 0.56, 0.05), 0.015, 0.015, 5, TILE.GLASS, COL.glass, { cap1: true }); }
  if (opts.ledger !== false) b.box(V(0.2, -D + 0.4, -0.12), X, Y, Z, 0.09, 0.015, 0.06, TILE.CANVAS, COL.oil, { grain: 'x' });
  return { geo: b.build(), dots: [{ y: -D + 0.42, r: 0.5 }] };
}

export const KITS_7B = { wreck, mapCase, chartFrame, carvedRock, catface, beaverPond, pitPlank, plankTossed, bootCrate };
