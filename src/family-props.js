// The family arc's props (campaign Round 6, stream a4; docs/story/33-family.md §3, §10 "Prop states"): Aili's motel beside
// the Little Vermilion store (six rooms, the bait and coffee room at the store end with its counter, three stools, the
// bait tank, the photo of three children on a rock and Pekka's behind the till, the back porch with boots, a chest
// freezer, a shelf and the red coffee can), the porch light (on, dusk to dawn), June's pot on the counter, the lilac
// print on the wall, Jon's cleaning board; the Carp end's stump with a clean ring where a stone sat and the ranger's
// cairn with the white one on top (re-sited: docs/story/dlc-quetico.md). Prop-kit faces in the props' one material
// (propMaterial: no new shader program), as story-props.js's kits; a frame with +z toward the building's front (the
// yard), -z toward the back porch and the water, x along its length.
//
//   fkit(name) → { build({ rng, opts }) → { geo, dots } } | null       FKITS: the names
import * as THREE from 'three';
import { PropBuilder, TILE, chunkStone } from './prop-kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const COL = {
  siding: C(0xb9a98c), trim: C(0x6e3b2a), roof: C(0x4a4c4e), floor: C(0x8a7458), counter: C(0x9a6a44), steel: C(0x9ea3a6),
  red: C(0xa8322a), white: C(0xe8e6df), boot: C(0x3a2c22), photo: C(0x2a2a2a), paper: C(0xd8d2c0), glass: C(0x58707a),
  bark: C(0x6e4a34), cut: C(0xc9a57a), ring: C(0xe2d6bc), rock: C(0x8d8a84), quartz: C(0xf1eee6), lamp: C(0xfff1b8), lampOff: C(0x8a8470),
  enamel: C(0x3d6fb0), lilac: C(0xb48fc8), board: C(0x7a6248),
};
const box = (b, x, y, z, hx, hy, hz, tile, col) => b.box(V(x, y, z), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), hx, hy, hz, tile, col);

// the motel: 18 m long, 7 deep, the walls 2.9 m; the coffee room the east (+x) 5 m with its door to the yard; the porch
// behind it. opts { light: the porch light on, pot: June's pot on the counter, print: the lilac print on the wall, can:
// the can behind the boots }
export const MOTEL = { L: 18, D: 7, H: 2.9, room: 5, porch: { x: 6.5, z: -4.6 }, counter: { x: 6.6, z: 0.6 }, aili: { x: 6.6, z: -0.5 }, stool: { x: 6.6, z: 1.6 }, shelf: { x: 7.6, z: -5.2 }, boots: { x: 6.9, z: -5.0 }, dock: { x: 6.5, z: -14 } };
function motel({ opts = {} }) {
  const b = new PropBuilder(), { L, D, H, room } = MOTEL, hl = L / 2, hd = D / 2, t = 0.09;
  // floor, walls (a door gap on the front of the coffee room and of each of the six rooms), roof
  box(b, 0, 0.05, 0, hl, 0.05, hd, TILE.WOOD, COL.floor);
  const wall = (x0, x1, z, gaps = []) => { let a = x0; for (const [g0, g1] of [...gaps, [x1, x1]]) { if (g0 > a) box(b, (a + g0) / 2, H / 2, z, (g0 - a) / 2, H / 2, t, TILE.WOOD, COL.siding); if (g1 > g0) box(b, (g0 + g1) / 2, H - 0.3, z, (g1 - g0) / 2, 0.3, t, TILE.WOOD, COL.siding); a = g1; } };
  const doors = []; for (let k = 0; k < 6; k++) { const x = -hl + 0.9 + k * ((L - room) / 6); doors.push([x, x + 0.9]); }
  wall(-hl, hl, hd, [...doors, [hl - room + 1.6, hl - room + 2.6]]);
  wall(-hl, hl, -hd, [[hl - room + 2.0, hl - room + 2.9]]); // (the back door onto the porch)
  for (const s of [-1, 1]) box(b, s * hl, H / 2, 0, t, H / 2, hd, TILE.WOOD, COL.siding);
  box(b, hl - room, H / 2, 0, t, H / 2, hd, TILE.WOOD, COL.siding); // (the coffee room's inner wall)
  for (const s of [-1, 1]) b.quad(V(-hl - 0.4, H, s * (hd + 0.5)), V(hl + 0.4, H, s * (hd + 0.5)), V(hl + 0.4, H + 0.9, 0), V(-hl - 0.4, H + 0.9, 0), TILE.ROOF, COL.roof, { ref: V(0, H, 0) });
  for (const s of [-1, 1]) b.face([V(s * (hl + 0.4), H, -hd - 0.5), V(s * (hl + 0.4), H, hd + 0.5), V(s * (hl + 0.4), H + 0.9, 0)], TILE.WOOD, COL.siding, { ref: V(0, H, 0) });
  // the sign over the coffee room's door
  box(b, hl - room + 2.1, H + 0.2, hd + 0.12, 1.6, 0.28, 0.04, TILE.SIGN, COL.paper);
  box(b, hl - room + 2.1, H + 0.2, hd + 0.17, 1.62, 0.3, 0.02, TILE.PAINT, COL.trim);
  // the counter, three stools, the bait tank, the photos
  const cx = MOTEL.counter.x, cz = MOTEL.counter.z;
  box(b, cx, 0.5, cz, 1.5, 0.5, 0.32, TILE.WOOD, COL.counter);
  box(b, cx, 1.02, cz, 1.6, 0.03, 0.4, TILE.WOOD, COL.trim);
  for (let k = -1; k <= 1; k++) { b.cyl(V(cx + k * 0.9, 0.05, MOTEL.stool.z), V(cx + k * 0.9, 0.7, MOTEL.stool.z), 0.04, 0.04, 6, TILE.METAL, COL.steel); b.cyl(V(cx + k * 0.9, 0.7, MOTEL.stool.z), V(cx + k * 0.9, 0.76, MOTEL.stool.z), 0.2, 0.2, 10, TILE.PAINT, COL.red, { cap1: true, capTile: TILE.PAINT, capCol: COL.red }); }
  box(b, hl - 0.6, 0.45, 1.6, 0.45, 0.45, 0.9, TILE.METAL, COL.steel); // the bait tank
  box(b, hl - 0.62, 0.92, 1.6, 0.4, 0.02, 0.85, TILE.GLASS, COL.glass);
  box(b, cx, 1.75, -hd + 0.14, 0.28, 0.2, 0.02, TILE.PLAIN, COL.photo); // three children on a rock
  box(b, cx + 1.1, 1.6, -hd + 0.14, 0.18, 0.13, 0.02, TILE.PLAIN, COL.photo); // Pekka in the boat, behind the till
  if (opts.print) box(b, cx - 0.75, 1.75, -hd + 0.14, 0.16, 0.11, 0.02, TILE.PLAIN, COL.lilac); // the lilac print, beside the children
  if (opts.pot) { const p = V(cx + 0.9, 1.05, cz); b.cyl(p, p.clone().add(V(0, 0.2, 0)), 0.11, 0.09, 10, TILE.PAINT, COL.enamel, { cap1: true, capTile: TILE.PAINT, capCol: COL.enamel }); }
  // the back porch: a deck, two posts and a roof, the boots, the chest freezer, the shelf (the can behind the boots)
  const P = MOTEL.porch;
  box(b, P.x, 0.12, P.z, 2.2, 0.06, 1.1, TILE.WOOD, COL.board);
  for (const s of [-1, 1]) b.cyl(V(P.x + s * 2.1, 0.12, P.z - 1.0), V(P.x + s * 2.1, 2.4, P.z - 1.0), 0.06, 0.06, 6, TILE.WOOD, COL.board);
  box(b, P.x, 2.45, P.z, 2.3, 0.04, 1.25, TILE.ROOF, COL.roof);
  box(b, P.x - 1.3, 0.55, P.z + 0.65, 0.65, 0.42, 0.35, TILE.PAINT, COL.white); // the chest freezer
  box(b, MOTEL.shelf.x, 1.15, MOTEL.shelf.z + 0.45, 0.6, 0.03, 0.18, TILE.WOOD, COL.board); // the shelf, against the wall
  for (let k = 0; k < 2; k++) box(b, MOTEL.boots.x + k * 0.22, 0.32, MOTEL.boots.z + 0.55, 0.07, 0.17, 0.14, TILE.PAINT, COL.boot);
  if (opts.can) b.cyl(V(MOTEL.shelf.x + 0.2, 1.18, MOTEL.shelf.z + 0.48), V(MOTEL.shelf.x + 0.2, 1.36, MOTEL.shelf.z + 0.48), 0.075, 0.075, 10, TILE.PAINT, COL.red, { cap1: true, capTile: TILE.METAL, capCol: COL.steel });
  // the porch light by the back door
  box(b, hl - room + 3.1, 2.15, -hd - 0.08, 0.07, 0.09, 0.05, TILE.PAINT, opts.light ? COL.lamp : COL.lampOff);
  return { geo: b.build(), dots: [] };
}
// Jon's cleaning board on two posts by the water
function cleanBoard() {
  const b = new PropBuilder();
  box(b, 0, 0.85, 0, 0.7, 0.03, 0.22, TILE.WOOD, COL.board);
  for (const s of [-1, 1]) box(b, s * 0.55, 0.42, 0, 0.05, 0.42, 0.05, TILE.WOOD, COL.board);
  return { geo: b.build(), dots: [] };
}
// the Carp end: a stump with a clean, unweathered ring on its top where a stone sat a long time
function ringStump({ rng }) {
  const b = new PropBuilder(), h = 0.45, r = 0.25;
  b.cyl(V(0, -0.1, 0), V(0, h, 0), r * 1.18, r, 9, TILE.BARK, COL.bark, { cap1: true, capTile: TILE.END, capCol: COL.cut, jitter: 0.02, rng });
  b.cyl(V(0, h, 0), V(0, h + 0.004, 0), 0.07, 0.07, 10, TILE.PLAIN, COL.ring, { cap1: true, capTile: TILE.PLAIN, capCol: COL.ring });
  return { geo: b.build(), dots: [{ y: h * 0.75, r: 0.55 }] };
}
// the ranger's cairn: a knee-high pile of grey stones, the white quartz cobble on top
function cairn({ rng }) {
  const b = new PropBuilder();
  let y = 0.05;
  for (let k = 0; k < 6; k++) { const s = 0.22 - k * 0.025; chunkStone(b, new THREE.Matrix4().compose(V((rng() - 0.5) * 0.08, y, (rng() - 0.5) * 0.08), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6, 0)), V(s, s * 0.55, s * 0.9)), rng, COL.rock); y += s * 0.75; }
  chunkStone(b, new THREE.Matrix4().compose(V(0, y + 0.04, 0), new THREE.Quaternion(), V(0.11, 0.13, 0.085)), rng, COL.quartz);
  return { geo: b.build(), dots: [{ y: y * 0.6, r: 0.5 }] };
}
const REG = { motel, cleanBoard, ringStump, cairn };
export const FKITS = Object.freeze(Object.keys(REG));
export function fkit(name) { const f = REG[name]; return f ? { build: (ctx = {}) => f({ rng: Math.random, opts: {}, ...ctx }) } : null; }
