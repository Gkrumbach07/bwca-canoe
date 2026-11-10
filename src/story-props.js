// The story's kit registry (docs/build/campaign-design.md §7.1; stream L, Round 1): the props the story layer stands
// in the world, each a builder of prop-kit.js faces in the props' one material (propMaterial(): no new shader
// program). A kit builds in its own frame: origin on the ground at the prop's foot, +y up, -z toward the water (the
// prop's heading turns it), and says where the dot finds it.
//
//   kit(name) → { build(ctx) → { geo, dots: [{ y, r, part? }], top? } } | null
//     ctx { rng, level (the water's height − the ground's, m: > 0 where the prop stands in the water), opts }
//     dots  the dot's spheres on the prop (y above its foot, radius); `top`: where a prop set `on` it sits (the stone
//           on the stump)
//   KITS   the names (story-lint and the unit check read them)
//
// Round 1's kits: stumpCut, quartzCobble (10 §9, every starred site), crib, landingRock, redPine (blaze and flagging),
// gradeMouth (the old road's mouth: a dot only), slab, pole (20 §11.1 the EP 33 lot), drillRod (Round 3's canoe rest).
// The camp and the pit (`waltcamp`, `pit`) are Round 3's modelling work.
import * as THREE from 'three';
import { PropBuilder, TILE, chunkStone } from './prop-kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const COL = {
  bark: C(0x6e4a34), barkRed: C(0x8a5236), cut: C(0xc9a57a), cutOld: C(0x9c8a70), quartz: C(0xf1eee6), log: C(0x6f6352),
  logWet: C(0x4f4a3e), rock: C(0x8d8a84), granite: C(0x97928a), iron: C(0x5a3d2a), blaze: C(0xb79a72), orange: C(0xd9772b),
  pink: C(0xff5fa8), needles: C(0x3b5230), concrete: C(0xa39f96), creosote: C(0x3a2d22), glass: C(0x4f9a72),
};

// --- the kits ---------------------------------------------------------------------------------------------------------
function stumpCut({ rng }) {
  const b = new PropBuilder(), h = 0.42 + rng() * 0.08, r = 0.23 + rng() * 0.04;
  b.cyl(V(0, -0.1, 0), V(0, h, 0), r * 1.18, r, 9, TILE.BARK, COL.bark, { cap1: true, capTile: TILE.END, capCol: COL.cutOld, jitter: 0.02, rng });
  // three roots into the ground
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + rng() * 0.6, ca = Math.cos(a), sa = Math.sin(a);
    b.cyl(V(ca * r * 0.7, 0.12, sa * r * 0.7), V(ca * (r + 0.32), -0.06, sa * (r + 0.32)), 0.08, 0.04, 5, TILE.BARK, COL.bark);
  }
  return { geo: b.build(), dots: [{ y: h * 0.7, r: 0.45 }], top: h };
}
function quartzCobble({ rng }) {
  const b = new PropBuilder();
  const m = new THREE.Matrix4().makeScale(0.11, 0.13, 0.085).premultiply(new THREE.Matrix4().makeRotationY(rng() * Math.PI));
  chunkStone(b, m, rng, COL.quartz);
  return { geo: b.build(), dots: [{ y: 0.06, r: 0.18 }] };
}
// 20 §11.2: a box of squared logs notched at the corners, soft with rot, the top course gone; rock fills it; a rusted
// iron ring spiked into the corner log where the boats tied up. Its foot on the bed, its top a hand over the water.
function crib({ rng, level = 0.6 }) {
  const b = new PropBuilder(), W = 1.6, D = 1.25, lr = 0.13, top = Math.max(0.35, level + 0.22);
  const courses = Math.max(2, Math.round(top / (lr * 1.8)));
  for (let c = 0; c < courses; c++) {
    const y = lr + c * lr * 1.8, alongX = c % 2 === 0, col = c < courses - 1 ? COL.logWet : COL.log;
    if (c === courses - 1 && rng() < 0.6) continue; // (the last course half gone)
    for (const s of [-1, 1]) {
      const sag = (rng() - 0.5) * 0.04;
      if (alongX) b.box(V(0, y + sag, s * D), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), W + 0.18, lr, lr, TILE.WOOD, col, { grain: 'x', endTile: TILE.END, endCol: COL.cutOld });
      else b.box(V(s * W, y + sag, 0), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), D + 0.18, lr, lr, TILE.WOOD, col, { grain: 'x', endTile: TILE.END, endCol: COL.cutOld });
    }
  }
  // the rock fill, spilling out on the water side
  for (let k = 0; k < 14; k++) {
    const x = (rng() - 0.5) * W * 1.7, z = (rng() - 0.5) * D * 1.7 - (k > 9 ? D * 1.2 : 0), s = 0.14 + rng() * 0.16;
    const y = k > 9 ? 0 : Math.min(top - 0.1, 0.1 + rng() * top);
    chunkStone(b, new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6, 0)), V(s, s * 0.8, s * 0.9)), rng, COL.rock);
  }
  // the iron ring on the corner log (the shore-side corner)
  const ry = Math.max(lr, top - lr * 1.6), cx = W, cz = D + lr;
  const ring = []; for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2; ring.push(V(cx + Math.cos(a) * 0.07, ry - 0.07 + Math.sin(a) * 0.07, cz + 0.02)); }
  b.tube(ring, 0.012, 5, TILE.METAL, COL.iron);
  return { geo: b.build(), dots: [{ y: top * 0.7, r: 1.5 }] };
}
// the landing rock: a slab of granite sloping into deep water (20 §11.2), the only place to set a canoe down
function landingRock({ rng }) {
  const b = new PropBuilder();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, rng() * 0.3, 0.04));
  chunkStone(b, new THREE.Matrix4().compose(V(0, -0.45, -0.4), q, V(1.6, 0.55, 1.5)), rng, COL.granite);
  return { geo: b.build(), dots: [] };
}
// a red pine: a straight trunk, bark plates going red up it, a few tufts up top. opts.blaze: an axe scar at chest height
// facing the water, its bark rolled in, a smudge of paint in the wood (opts.blaze = 'orange'); opts.flag: a strip of
// survey tape tied round the trunk a hand above it, its tail hanging (opts.flag = 'pink')
function redPine({ rng, opts = {} }) {
  const b = new PropBuilder(), H = 15 + rng() * 3, r0 = 0.27, r1 = 0.08;
  b.cyl(V(0, -0.2, 0), V(0, H, 0), r0, r1, 10, TILE.BARK, (t) => COL.bark.clone().lerp(COL.barkRed, Math.min(1, t * 1.6)), { ts: [0, 0.3, 0.7, 1], jitter: 0.015, rng });
  // the crown: tufts on the last third, stubs of dead limbs below
  for (let k = 0; k < 9; k++) {
    const y = H * (0.66 + (k / 9) * 0.32), a = rng() * Math.PI * 2, L = 1.4 + rng() * 1.6 * (1 - k / 12);
    const p0 = V(0, y, 0), p1 = V(Math.cos(a) * L, y + 0.5 + rng() * 0.6, Math.sin(a) * L);
    b.cyl(p0, p1, 0.05, 0.02, 5, TILE.BARK, COL.bark);
    b.box(p1.clone().add(V(0, 0.15, 0)), V(Math.cos(a), 0, Math.sin(a)), V(0, 1, 0), V(-Math.sin(a), 0, Math.cos(a)), 0.9 + rng() * 0.4, 0.35, 0.7 + rng() * 0.3, TILE.FIBRE, COL.needles);
  }
  for (let k = 0; k < 5; k++) { const y = 3 + k * 1.8 + rng(), a = rng() * 6.28; b.cyl(V(0, y, 0), V(Math.cos(a) * 0.5, y + 0.1, Math.sin(a) * 0.5), 0.03, 0.015, 4, TILE.BARK, COL.cutOld); }
  const rAt = (y) => r0 + (r1 - r0) * ((y + 0.2) / (H + 0.2));
  const dots = [];
  if (opts.blaze) {
    // the scar facing -z (the water), 0.34 m tall, the bark rolled in round its edges
    const y0 = 1.15, y1 = 1.5, r = rAt(1.3) + 0.005, a = 0.55;
    const P = (ang, y, rr = r) => V(Math.sin(ang) * rr, y, -Math.cos(ang) * rr);
    b.face([P(-a, y0), P(a, y0), P(a, y1), P(-a, y1)], TILE.SPLIT, COL.blaze, { ref: V(0, 1.3, 0) });
    b.cyl(P(-a, y0, r + 0.01), P(-a, y1, r + 0.01), 0.022, 0.022, 5, TILE.BARK, COL.bark);
    b.cyl(P(a, y0, r + 0.01), P(a, y1, r + 0.01), 0.022, 0.022, 5, TILE.BARK, COL.bark);
    if (opts.blaze === 'orange') b.face([P(-0.18, 1.27, r + 0.004), P(0.2, 1.25, r + 0.004), P(0.16, 1.36, r + 0.004), P(-0.14, 1.38, r + 0.004)], TILE.PAINT, COL.orange, { ref: V(0, 1.3, 0) });
    dots.push({ y: 1.32, r: 0.42, part: 'blaze' });
  }
  if (opts.flag) {
    const y = 1.62, r = rAt(y) + 0.012;
    b.cyl(V(0, y - 0.025, 0), V(0, y + 0.025, 0), r, r, 12, TILE.CANVAS, COL.pink);
    // the knot and its two tails, hanging and lifting a little in the wind
    const k0 = V(Math.sin(0.4) * r, y, -Math.cos(0.4) * r);
    for (const [dx, len] of [[0.03, 0.34], [-0.02, 0.26]]) b.quad(k0.clone().add(V(dx, 0, -0.01)), k0.clone().add(V(dx + 0.03, 0, -0.01)), k0.clone().add(V(dx + 0.08, -len, -0.06)), k0.clone().add(V(dx + 0.05, -len, -0.06)), TILE.CANVAS, COL.pink);
    dots.push({ y: 1.6, r: 0.4, part: 'flag' });
  }
  if (!dots.length) dots.push({ y: 1.4, r: 0.45 });
  return { geo: b.build(), dots };
}
// the old road's mouth (a few steps in from the landing rock): the trough is the lane's own clearing; a dot only
function gradeMouth() { return { geo: null, dots: [{ y: 0.35, r: 1.6 }] }; }
// the crew camp's cracked concrete slab in young aspen (20 §11.1 step 2)
function slab({ rng }) {
  const b = new PropBuilder(), crack = 0.04 + rng() * 0.03;
  b.box(V(-0.9 - crack, 0.06, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.9, 0.13, 1.3, TILE.STONE, COL.concrete);
  b.box(V(0.65, 0.04, 0.05), V(Math.cos(0.05), 0, Math.sin(0.05)), V(0, 1, 0), V(-Math.sin(0.05), 0, Math.cos(0.05)), 0.62, 0.12, 1.25, TILE.STONE, COL.concrete);
  return { geo: b.build(), dots: [{ y: 0.15, r: 1.5 }] };
}
// a creosoted pole with a crossarm and two green glass insulators
function pole() {
  const b = new PropBuilder(), H = 6.2;
  b.cyl(V(0, -0.3, 0), V(0, H, 0), 0.15, 0.12, 8, TILE.WOOD, COL.creosote, { cap1: true });
  b.box(V(0, H - 0.5, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.7, 0.05, 0.05, TILE.WOOD, COL.creosote);
  for (const x of [-0.5, 0.5]) b.cyl(V(x, H - 0.45, 0), V(x, H - 0.3, 0), 0.045, 0.03, 8, TILE.GLASS, COL.glass, { cap1: true });
  return { geo: b.build(), dots: [{ y: 1.4, r: 0.5 }] };
}
// drill rod: lengths of steel rod (Round 3's canoe rest at Gull; here so the registry names it)
function drillRod({ rng }) {
  const b = new PropBuilder();
  for (let k = 0; k < 3; k++) { const z = (k - 1) * 0.22, y = 0.03; b.cyl(V(-0.9, y, z + rng() * 0.03), V(0.9, y, z), 0.022, 0.022, 6, TILE.METAL, COL.iron); }
  return { geo: b.build(), dots: [{ y: 0.05, r: 0.9 }] };
}

const REGISTRY = { stumpCut, quartzCobble, crib, landingRock, redPine, gradeMouth, slab, pole, drillRod };
export const KITS = Object.freeze(Object.keys(REGISTRY));
export function kit(name) { const f = REGISTRY[name]; return f ? { build: (ctx = {}) => f({ rng: Math.random, opts: {}, ...ctx }) } : null; }
// a seeded rng for a prop (the same stump every load)
export function rngFor(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  let a = h || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
