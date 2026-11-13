// Stream i's kits (campaign Round 5, the informant; story-props.js REGISTRY takes them in its `// i:` block): Denny's
// cabin ten minutes down the Sawbill Trail (32 §5.15 "His porch, the weather radio low, a bucket of minnows, two crayon
// drawings taped inside the window"; §11 props). Same frame and contract as story-props.js: origin on the ground at the
// foot, +y up, -z toward the front (the porch); { geo, dots, spots }. One material.
import * as THREE from 'three';
import { PropBuilder, TILE } from './prop-kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const COL = {
  siding: C(0x7a5a3c), trim: C(0xd8d0bc), roof: C(0x4a4640), floor: C(0x8b6e4e), porch: C(0x9a8064), post: C(0x6e5438),
  window: C(0x2e3a40), paper: C(0xf0ece0), crayonR: C(0xc0402a), crayonB: C(0x3a5aa0), bucket: C(0x9aa0a4), radio: C(0x3a3430), step: C(0x7d6650),
};

// a one-room cabin, 5 × 4 m, the door and the window in the front, a porch 1.6 m deep across it with a step; the radio on
// the porch rail, the minnow bucket by the step (the key under it), two drawings in the window
function dennyCabin() {
  const b = new PropBuilder(), hx = 2.5, hz = 2, h = 2.4, t = 0.06;
  b.box(V(0, 0.1, 0), X, Y, Z, hx, 0.1, hz, TILE.WOOD, COL.floor);
  // the front wall round the door (x −0.45…0.45) and the window (x 0.9…2.0, y 0.9…1.7)
  b.box(V(-1.475, h / 2, -hz), X, Y, Z, 1.025, h / 2, t, TILE.WOOD, COL.siding);
  b.box(V(0, (2.05 + h) / 2, -hz), X, Y, Z, 0.45, (h - 2.05) / 2, t, TILE.WOOD, COL.siding);
  b.box(V(0.675, h / 2, -hz), X, Y, Z, 0.225, h / 2, t, TILE.WOOD, COL.siding);
  b.box(V(2.25, h / 2, -hz), X, Y, Z, 0.25, h / 2, t, TILE.WOOD, COL.siding);
  b.box(V(1.45, 0.45, -hz), X, Y, Z, 0.55, 0.45, t, TILE.WOOD, COL.siding);
  b.box(V(1.45, 2.05, -hz), X, Y, Z, 0.55, 0.35, t, TILE.WOOD, COL.siding);
  b.box(V(1.45, 1.3, -hz + 0.02), X, Y, Z, 0.55, 0.4, 0.01, TILE.GLASS, COL.window);
  b.box(V(1.15, 1.3, -hz + 0.035), X, Y, Z, 0.16, 0.12, 0.004, TILE.PLAIN, COL.paper); // the drawings, taped inside
  b.box(V(1.15, 1.3, -hz + 0.04), X, Y, Z, 0.08, 0.04, 0.003, TILE.PLAIN, COL.crayonR);
  b.box(V(1.62, 1.26, -hz + 0.035), X, Y, Z, 0.15, 0.13, 0.004, TILE.PLAIN, COL.paper);
  b.box(V(1.62, 1.3, -hz + 0.04), X, Y, Z, 0.05, 0.07, 0.003, TILE.PLAIN, COL.crayonB);
  b.box(V(0, h / 2, hz), X, Y, Z, hx, h / 2, t, TILE.WOOD, COL.siding);
  for (const s of [-1, 1]) b.box(V(s * hx, h / 2, 0), Z, Y, X, hz, h / 2, t, TILE.WOOD, COL.siding);
  // the roof, its ridge front to back, over the porch too
  const e = hz + 1.9, over = 0.3, rise = 1.1;
  for (const s of [-1, 1]) b.quad(V(s * (hx + over), h, -e), V(s * (hx + over), h, hz + over), V(0, h + rise, hz + over), V(0, h + rise, -e), TILE.ROOF, COL.roof);
  for (const z of [-hz, hz]) b.face([V(-hx, h, z), V(hx, h, z), V(0, h + rise, z)], TILE.WOOD, COL.siding);
  // the porch: deck, posts, a rail with the radio on it, the step, the minnow bucket
  b.box(V(0, 0.18, -hz - 0.8), X, Y, Z, hx, 0.05, 0.8, TILE.WOOD, COL.porch);
  for (const x of [-hx + 0.1, hx - 0.1]) b.cyl(V(x, 0, -hz - 1.5), V(x, h, -hz - 1.5), 0.06, 0.06, 6, TILE.WOOD, COL.post);
  b.box(V(-1.5, 0.95, -hz - 1.55), X, Y, Z, 0.95, 0.03, 0.05, TILE.WOOD, COL.post);
  b.box(V(-1.2, 1.06, -hz - 1.55), X, Y, Z, 0.14, 0.08, 0.05, TILE.METAL, COL.radio);
  b.box(V(0, 0.08, -hz - 1.85), X, Y, Z, 0.55, 0.08, 0.2, TILE.WOOD, COL.step);
  b.cyl(V(0.9, 0.23, -hz - 1.35), V(0.9, 0.5, -hz - 1.35), 0.16, 0.18, 10, TILE.METAL, COL.bucket, { cap0: true });
  const spots = { porch: { x: -0.6, y: 0.23, z: -hz - 0.9 }, step: { x: 0, y: 0, z: -hz - 2.3 }, bucket: { x: 0.9, y: 0.4, z: -hz - 1.35 }, door: { x: 0, y: 0, z: -hz } };
  return { geo: b.build(), dots: [{ y: 1.2, r: 2.5 }], spots };
}

export const KITS_I = { dennyCabin };
