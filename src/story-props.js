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
// Round 2 (a2, the mining years): casing, coreRack, boxLid, trench, stockpile, stationStake, creekRun, beaverDam, digPit,
// surveyLath, surveyTag, shovelBlade, twoStumps, cafeTable, urn, coolers, launch.
import * as THREE from 'three';
import { PropBuilder, TILE, chunkStone } from './prop-kit.js';
import { KITS_7B } from './story-props-7b.js'; // 7b
import { FAR_KITS } from './story-props-far.js'; // f: the far end's kits (Round 3)
import { KITS_7A } from './story-props-7a.js'; // 7a

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
  return { geo: b.build(), dots: [{ y: h * 0.75, r: 0.55 }], top: h }; // (the dot's sphere takes the stone on top too)
}
function quartzCobble({ rng }) {
  const b = new PropBuilder();
  const m = new THREE.Matrix4().makeScale(0.11, 0.13, 0.085).premultiply(new THREE.Matrix4().makeRotationY(rng() * Math.PI));
  chunkStone(b, m, rng, COL.quartz);
  return { geo: b.build(), dots: [{ y: 0.06, r: 0.18 }] };
}
// 20 §11.2: a box of squared logs notched at the corners, soft with rot, the top course gone; rock fills it; a rusted
// iron ring spiked into the corner log where the boats tied up. Its foot on the bed, its top a hand over the water.
function crib({ rng, level = 0.6, opts = {} }) {
  const b = new PropBuilder(), W = 1.6, D = 1.25, lr = 0.13, top = Number.isFinite(opts.under) ? Math.max(0.3, level - opts.under) : Math.max(0.35, level + 0.22); // e: opts.under: its top that far under the surface (60 S7's dock cribs, a metre under)
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


// a2: the mining years' kits (story Round 2, stream A2; docs/story/30-mining-years.md §3, §4.3, §4.7, §4.9; 90 §4, §11).
// Each in the kit's own frame (the foot on the ground, -z toward the water or the way it faces), all in the props'
// one material. The café's are drawn inside Farm 31 by kettle.js / cast.js (props.js L.cafe gives their spots).
const COLA = {
  steel: C(0x6d5a4a), rust: C(0x8a4a26), rustRed: C(0xa0482a), slat: C(0x8b7a60), slatOld: C(0x6c604c), moss: C(0x56663a),
  water: C(0x4a3b24), tea: C(0x7a4a1c), stain: C(0xb5642a), mud: C(0x5e4a36), lath: C(0x9a948a), flagPink: C(0xc46a8a),
  flagOrange: C(0xc0703a), alu: C(0xc8ccd0), table: C(0x8a6440), top: C(0xb08a5e), urn: C(0xb7b9bb), cooler: C(0x2f6aa0),
  coolerLid: C(0xe8e8e2), varnish: C(0x9a5a2a), deck: C(0xc49a62), stake: C(0xb59a6e), tape: C(0xff5fa8),
};
// a drill casing: a steel pipe a hand's height out of the moss, its cap rusted on (30 §4.3 "Casing")
function casing({ rng }) {
  const b = new PropBuilder(), h = 0.14 + rng() * 0.06;
  b.cyl(V(0, -0.3, 0), V(0, h, 0), 0.055, 0.055, 10, TILE.METAL, COLA.rust, { cap1: true, capTile: TILE.METAL, capCol: COLA.steel });
  b.cyl(V(0, -0.02, 0), V(0, 0.02, 0), 0.16, 0.14, 9, TILE.FIBRE, COLA.moss); // (the moss round its foot)
  return { geo: b.build(), dots: [{ y: 0.45, r: 0.6 }] };
}
// a core-box rack: two trestles and slats, fallen (opts.fallen: on its side, the slats split); opts.lid: one box end
// still has its lid (Leo's: 30 §4.3), drawn while it is there (show: !f:kettle.lid)
function coreRack({ rng, opts = {} }) {
  const b = new PropBuilder(), fallen = !!opts.fallen, tilt = fallen ? 1.15 : 0;
  const R = new THREE.Matrix4().makeRotationZ(tilt), P = (x, y, z) => V(x, y, z).applyMatrix4(R).add(V(0, fallen ? 0.12 : 0, 0));
  for (const x of [-0.8, 0.8]) for (const z of [-0.25, 0.25]) b.cyl(P(x, 0, z), P(x, 0.7, z), 0.04, 0.035, 5, TILE.WOOD, COLA.slatOld);
  for (let k = 0; k < 5; k++) {
    const y = 0.2 + k * 0.12, broke = rng() < 0.4;
    b.box(P(broke ? -0.4 : 0, y, 0), V(1, 0, 0).applyMatrix4(R), V(0, 1, 0).applyMatrix4(R), V(0, 0, 1), broke ? 0.45 : 0.9, 0.012, 0.28, TILE.WOOD, k % 2 ? COLA.slat : COLA.slatOld);
  }
  // the box ends spilled at its foot: rotten core boxes, one with its lid
  for (let k = 0; k < 3; k++) { const x = -0.5 + k * 0.5 + (rng() - 0.5) * 0.1; b.box(V(x, 0.05, -0.55 - rng() * 0.1), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.22, 0.05, 0.12, TILE.WOOD, COLA.slatOld); }
  const dots = [{ y: 0.35, r: 0.7 }];
  return { geo: b.build(), dots };
}
// the lid on its box end, alone (its own prop so it goes when taken): a slat with a punched stamp on its end
function boxLid() {
  const b = new PropBuilder();
  b.box(V(0, 0.04, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.36, 0.012, 0.13, TILE.WOOD, COLA.slat);
  b.box(V(0, 0.015, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.34, 0.015, 0.12, TILE.WOOD, COLA.slatOld);
  return { geo: b.build(), dots: [{ y: 0.45, r: 0.6 }] };
}
// the 1976 trench: a long scar full of brown water (the water a flat face a hand under the lip), its spoil either side
function trench({ rng }) {
  const b = new PropBuilder(), L = 9, W = 0.9;
  b.quad(V(-W, 0.02, -L), V(W, 0.02, -L), V(W, 0.02, L), V(-W, 0.02, L), TILE.PLAIN, COLA.water);
  for (const s of [-1, 1]) for (let k = 0; k < 7; k++) { const z = -L + (k + 0.5) * (2 * L / 7), r = 0.4 + rng() * 0.3; chunkStone(b, new THREE.Matrix4().compose(V(s * (W + r * 0.8), -0.05, z), new THREE.Quaternion(), V(r, 0.35 + rng() * 0.2, r * 1.3)), rng, COLA.mud); }
  return { geo: b.build(), dots: [{ y: 0.1, r: 1.6 }] };
}
// the stockpile: a grown-over mound with rust-red rock showing where frost has heaved it
function stockpile({ rng }) {
  const b = new PropBuilder();
  chunkStone(b, new THREE.Matrix4().compose(V(0, -0.6, 0), new THREE.Quaternion(), V(5.5, 1.6, 4.2)), rng, COLA.moss);
  for (let k = 0; k < 9; k++) { const a = rng() * 6.28, r = 1.5 + rng() * 3; chunkStone(b, new THREE.Matrix4().compose(V(Math.cos(a) * r, 0.1 + rng() * 0.6, Math.sin(a) * r * 0.75), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6, 0)), V(0.25 + rng() * 0.2, 0.2, 0.22)), rng, COLA.rustRed); }
  return { geo: b.build(), dots: [{ y: 0.6, r: 2.4 }] };
}
// a sampling station: a stake with a strip of tape (30 §4.3: the dot offers Fill here and nowhere else)
function stationStake() {
  const b = new PropBuilder();
  b.box(V(0, 0.45, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.025, 0.55, 0.025, TILE.WOOD, COLA.stake);
  b.cyl(V(0, 0.86, 0), V(0, 0.9, 0), 0.04, 0.04, 6, TILE.CANVAS, COLA.tape);
  return { geo: b.build(), dots: [{ y: 0.5, r: 0.6 }] };
}
// the creek below the pad: a ribbon of tea-coloured water, orange at its edges (opts.run: running orange after rain;
// else the stain on its stones only), laid along opts.pts ([[x, z] in the kit's frame])
function creekRun({ rng, opts = {} }) {
  const b = new PropBuilder(), pts = opts.pts || [[0, 0], [0, -20]], w = opts.w || 0.7;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w, nz = dx / L * w;
    if (opts.run) b.quad(V(ax - nx, 0.03, az - nz), V(bx - nx, 0.03, bz - nz), V(bx + nx, 0.03, bz + nz), V(ax + nx, 0.03, az + nz), TILE.PLAIN, COLA.tea);
    const n = Math.max(2, Math.round(L / 1.6));
    for (let k = 0; k < n; k++) { const t = (k + rng()) / n, x = ax + dx * t, z = az + dz * t, s = rng() < 0.5 ? -1 : 1, r = 0.1 + rng() * 0.12; chunkStone(b, new THREE.Matrix4().compose(V(x + nx * s * 1.2, -0.02, z + nz * s * 1.2), new THREE.Quaternion(), V(r, r * 0.6, r)), rng, COLA.stain); }
  }
  return { geo: b.build(), dots: [] };
}
// the beaver pond's dam and the pond behind it (the Secchi from the crest: 30 §4.3)
function beaverDam({ rng }) {
  const b = new PropBuilder(), R = 7;
  const ring = []; for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; ring.push(V(Math.cos(a) * R, 0.06, -R - 1 + Math.sin(a) * R * 0.7)); }
  b.face(ring, TILE.PLAIN, COLA.water);
  for (let k = 0; k < 22; k++) { const x = -3 + (k / 21) * 6 + (rng() - 0.5) * 0.3; b.cyl(V(x, 0.05, 0.1 + (rng() - 0.5) * 0.4), V(x + (rng() - 0.5) * 0.8, 0.35 + rng() * 0.3, -0.6 + rng() * 0.5), 0.04, 0.025, 4, TILE.BARK, COLA.mud); }
  return { geo: b.build(), dots: [{ y: 0.35, r: 1.4 }] };
}
// the dig on Pietro's hill (30 §4.7): a rectangle of turned ground grassed over and sunk, spoil heaped on two sides
function digPit({ rng }) {
  const b = new PropBuilder(), hx = 1.6, hz = 1.1;
  b.quad(V(-hx, -0.12, -hz), V(hx, -0.12, -hz), V(hx, -0.12, hz), V(-hx, -0.12, hz), TILE.FIBRE, COLA.moss);
  for (const s of [-1, 1]) chunkStone(b, new THREE.Matrix4().compose(V(s * (hx + 0.9), -0.1, 0), new THREE.Quaternion(), V(0.8, 0.45, hz + 0.3)), rng, COLA.mud);
  return { geo: b.build(), dots: [{ y: 0.05, r: 1.9 }] };
}
// rotten survey flags on lath stakes, the lath grey and split
function surveyLath({ rng }) {
  const b = new PropBuilder();
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + rng() * 0.4, r = 1.9 + rng() * 0.5, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.6 + rng() * 0.4, lean = (rng() - 0.5) * 0.25;
    b.box(V(x + lean * h * 0.5, h / 2, z), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.02, h / 2, 0.006, TILE.WOOD, COLA.lath);
    b.quad(V(x + lean * h, h - 0.02, z), V(x + lean * h + 0.03, h - 0.02, z), V(x + lean * h + 0.06, h - 0.25, z + 0.02), V(x + lean * h + 0.03, h - 0.25, z + 0.02), TILE.CANVAS, k % 2 ? COLA.flagPink : COLA.flagOrange);
  }
  return { geo: b.build(), dots: [{ y: 0.5, r: 0.8 }] };
}
// a numbered aluminium survey tag on a dead snag beside the dig, no company name
function surveyTag() {
  const b = new PropBuilder();
  b.cyl(V(0, -0.1, 0), V(0, 3.2, 0), 0.12, 0.07, 7, TILE.BARK, COL.cutOld);
  b.box(V(0, 1.45, -0.125), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.035, 0.025, 0.003, TILE.METAL, COLA.alu);
  return { geo: b.build(), dots: [{ y: 1.45, r: 0.3 }] };
}
// the snapped shovel blade, half-buried at the dig's edge
function shovelBlade() {
  const b = new PropBuilder();
  b.quad(V(-0.11, 0.02, -0.14), V(0.11, 0.02, -0.14), V(0.1, 0.05, 0.12), V(-0.1, 0.05, 0.12), TILE.METAL, COLA.rust);
  b.cyl(V(0, 0.05, 0.12), V(0, 0.07, 0.2), 0.018, 0.018, 5, TILE.METAL, COLA.rust);
  return { geo: b.build(), dots: [{ y: 0.45, r: 0.6 }] };
}
// two square-cut stumps a sledge-width apart (Two Stump, 1975), birch growing out of the clearing
function twoStumps({ rng }) {
  const b = new PropBuilder();
  for (const x of [-1.1, 1.1]) b.box(V(x, 0.45, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.2, 0.55, 0.2, TILE.BARK, COL.bark, { grain: 'y', endTile: TILE.END, endCol: COL.cutOld });
  for (let k = 0; k < 3; k++) { const x = (rng() - 0.5) * 5, z = 2 + rng() * 2, H = 4 + rng() * 2; b.cyl(V(x, -0.1, z), V(x, H, z), 0.06, 0.03, 6, TILE.BARK, C(0xe8e4da)); }
  return { geo: b.build(), dots: [{ y: 0.6, r: 1.6 }] };
}
// the café: a small table with two chairs (Mary's by the window, the corner table), and the coffee urn on the counter
function cafeTable() {
  const b = new PropBuilder();
  b.cyl(V(0, 0.73, 0), V(0, 0.76, 0), 0.42, 0.42, 12, TILE.WOOD, COLA.top, { cap1: true, capTile: TILE.WOOD, capCol: COLA.top });
  b.cyl(V(0, 0, 0), V(0, 0.73, 0), 0.05, 0.05, 6, TILE.WOOD, COLA.table);
  for (const s of [-1, 1]) {
    const z = s * 0.62;
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) b.cyl(V(dx, 0, z + dz), V(dx, 0.45, z + dz), 0.02, 0.02, 4, TILE.WOOD, COLA.table);
    b.box(V(0, 0.46, z), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.21, 0.02, 0.21, TILE.WOOD, COLA.top);
    b.box(V(0, 0.75, z + s * 0.2), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.21, 0.28, 0.015, TILE.WOOD, COLA.table);
  }
  return { geo: b.build(), dots: [] };
}
function urn() {
  const b = new PropBuilder();
  b.cyl(V(0, 0, 0), V(0, 0.42, 0), 0.13, 0.12, 10, TILE.METAL, COLA.urn, { cap1: true, capTile: TILE.METAL, capCol: COLA.urn });
  b.cyl(V(0, 0.08, -0.13), V(0, 0.08, -0.19), 0.012, 0.012, 5, TILE.METAL, COLA.steel);
  return { geo: b.build(), dots: [] };
}
// Tasha's coolers at the tailgate, and her orange-covered book's place on top (the turnaround, 30 §4.3)
function coolers() {
  const b = new PropBuilder();
  for (const [x, z] of [[-0.45, 0], [0.45, 0.1]]) { b.box(V(x, 0.2, z), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.34, 0.2, 0.22, TILE.PAINT, COLA.cooler); b.box(V(x, 0.42, z), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.35, 0.025, 0.23, TILE.PAINT, COLA.coolerLid); }
  return { geo: b.build(), dots: [] };
}
// Brekke's launch, a still prop at Farm's dock on Thursdays (owner call 4, until Round 4's motorboat actor): varnished
function launch() {
  const b = new PropBuilder(), L = 3.4, W = 0.95;
  const hull = []; for (let k = 0; k <= 12; k++) { const t = k / 12, z = -L + t * 2 * L, w = W * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.6; hull.push([z, w]); }
  for (let k = 0; k + 1 < hull.length; k++) { const [z0, w0] = hull[k], [z1, w1] = hull[k + 1]; for (const s of [-1, 1]) b.quad(V(s * w0, 0.55, z0), V(s * w1, 0.55, z1), V(s * w1 * 0.6, -0.1, z1), V(s * w0 * 0.6, -0.1, z0), TILE.WOOD, COLA.varnish); b.quad(V(-w0, 0.5, z0), V(w0, 0.5, z0), V(w1, 0.5, z1), V(-w1, 0.5, z1), TILE.WOOD, COLA.deck); }
  b.box(V(0, 0.85, 0.6), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.6, 0.3, 0.5, TILE.GLASS, C(0x88a0a8));
  return { geo: b.build(), dots: [{ y: 0.6, r: 1.6 }] };
}
// /a2

// e: Round 2 stream E's kits (docs/story/60-side-stories.md S7 "The place", S9 "The place"): Mummo's on Inlet Bay (the
// lilacs, the stone step, the foundation, the bed frame, the sauna's footing, the swimming rock; Toivo's cobble is
// quartzCobble on the step; the cribs are crib), Alice's beach rock (landingRock) and June's pot half in the sand. Rose's
// table by the window of Moose Lake 25 is A2's café kit (cafeTable at cafeSpots(L).window: the join).
const COL_E = { leaf: C(0x6aa457), leafDark: C(0x4f8a4e), leafPale: C(0x86b865), bloom: C(0xa47fc4), bloomPale: C(0xc3a6dc), // (the final pass: the leaves in the crowns' greens, vegetation.js; they read as black blocks)
   stem: C(0x6a5a4a),
  field: C(0x86817a), rust: C(0x7a4a2e), enamel: C(0x2f5f9a), chip: C(0x1c1c1c), shadow: C(0x2a2a26), table: C(0x8a6a48) };
// a lilac thicket three metres high (opts.bloom: purple in June, else green); a dot on its middle
function lilacs({ rng, opts = {} }) {
  const b = new PropBuilder(), n = 9;
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2, d = rng() * 1.6, x = Math.cos(a) * d, z = Math.sin(a) * d, H = 2.2 + rng() * 1.0;
    b.cyl(V(x, -0.1, z), V(x * 1.15, H * 0.7, z * 1.15), 0.05, 0.03, 5, TILE.BARK, COL_E.stem);
    // (the final pass: small clumps round the stem, not three solid two-metre blocks; a panicle on most in June)
    for (let j = 0; j < 7; j++) {
      const y = H * (0.45 + rng() * 0.5), s = 0.3 + rng() * 0.28, rot = rng() * 6.28, ax = V(Math.cos(rot), 0, Math.sin(rot));
      const cx = x * 1.2 + (rng() - 0.5) * 1.1, cz = z * 1.2 + (rng() - 0.5) * 1.1;
      b.box(V(cx, y, cz), ax, V(0, 1, 0), V(-ax.z, 0, ax.x), s, 0.22 + rng() * 0.12, s * 0.85, TILE.FIBRE, [COL_E.leaf, COL_E.leafDark, COL_E.leafPale][j % 3]);
      if (opts.bloom && j % 3 !== 2) {
        const bx = cx + (rng() - 0.5) * s, bz = cz + (rng() - 0.5) * s, by = y + 0.22 + rng() * 0.12;
        b.cyl(V(bx, by - 0.1, bz), V(bx, by + 0.26, bz), 0.11, 0.03, 5, TILE.FIBRE, j % 2 ? COL_E.bloom : COL_E.bloomPale, { cap1: true });
      }
    }
  }
  return { geo: b.build(), dots: [{ y: 1.6, r: 1.9 }] };
}
// three flat stones up from the water to nothing (-z: the water); `top` is the top step (Toivo's cobble sits there)
function stoneStep({ rng }) {
  const b = new PropBuilder();
  for (let k = 0; k < 3; k++) {
    const y = -0.08 + k * 0.17, z = 0.55 - k * 0.42;
    chunkStone(b, new THREE.Matrix4().compose(V((rng() - 0.5) * 0.1, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 0.4, 0)), V(0.48, 0.11, 0.26)), rng, COL.granite);
  }
  return { geo: b.build(), dots: [{ y: 0.3, r: 0.75 }], top: 0.43 };
}
// a rectangle of fieldstone in the grass, about 6 × 8 m, a course or two high
function foundation({ rng }) {
  const b = new PropBuilder(), hw = 3, hd = 4;
  for (const [ax, along, off] of [[1, hw, -hd], [1, hw, hd], [0, hd, -hw], [0, hd, hw]]) {
    for (let t = -along; t <= along; t += 0.55) {
      const x = ax ? t : off, z = ax ? off : t, s = 0.2 + rng() * 0.12;
      if (rng() < 0.12) continue; // (a stone gone)
      chunkStone(b, new THREE.Matrix4().compose(V(x, 0.02 + rng() * 0.06, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 6, 0)), V(s, s * 0.6, s * 0.85)), rng, COL_E.field);
    }
  }
  return { geo: b.build(), dots: [{ y: 0.2, r: 1.2 }, { y: 0.2, r: 1.2, part: 'corner' }] };
}
// a rusted iron bed frame leaned on a birch (the birch is the forest's: the frame stands leaning, its head up)
function bedFrame() {
  const b = new PropBuilder(), lean = 0.32, w = 0.48, L = 1.9;
  const up = V(0, Math.cos(lean), Math.sin(lean));
  const P = (x, t) => V(x, 0, 0).add(up.clone().multiplyScalar(t));
  for (const x of [-w, w]) b.cyl(P(x, 0), P(x, L), 0.018, 0.018, 5, TILE.METAL, COL_E.rust);
  for (const t of [0.05, 0.6, 1.2, L - 0.05]) b.cyl(P(-w, t), P(w, t), 0.014, 0.014, 5, TILE.METAL, COL_E.rust);
  for (let x = -w + 0.12; x < w; x += 0.12) b.cyl(P(x, L - 0.4), P(x, L - 0.05), 0.008, 0.008, 4, TILE.METAL, COL_E.rust);
  return { geo: b.build(), dots: [{ y: 0.9, r: 0.8 }] };
}
// the sauna's footing: a ring of stones by the water
function stoneRing({ rng }) {
  const b = new PropBuilder(), R = 1.5;
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2, s = 0.18 + rng() * 0.1; chunkStone(b, new THREE.Matrix4().compose(V(Math.cos(a) * R, 0.03, Math.sin(a) * R), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), V(s, s * 0.65, s)), rng, COL_E.field); }
  return { geo: b.build(), dots: [{ y: 0.2, r: 1.4 }] };
}
// the flat swimming rock: a shelf at waist depth, then deep (it stands in the water: its top about level with the
// surface's waist, level - 0.9)
function swimRock({ rng, level = 0.9 }) {
  const b = new PropBuilder(), top = Math.max(0.15, level - 0.85);
  chunkStone(b, new THREE.Matrix4().compose(V(0, top - 0.3, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 0.5, 0)), V(1.5, 0.32, 1.2)), rng, COL.granite);
  return { geo: b.build(), dots: [{ y: Math.max(top, level) - 0.1, r: 1.6 }] };
}
// June's pot (S9): blue enamel, lid on, one side under the sand, its wire bail standing up out of the sand in a loop
function enamelPot({ rng }) {
  const b = new PropBuilder(), r = 0.11, h = 0.2, tilt = 0.5;
  const ax = V(Math.sin(tilt), Math.cos(tilt), 0), base = V(0, -0.06, 0);
  b.cyl(base, base.clone().add(ax.clone().multiplyScalar(h)), r * 1.05, r * 0.92, 10, TILE.PAINT, COL_E.enamel, { cap1: true, capTile: TILE.PAINT, capCol: COL_E.enamel });
  const lip = base.clone().add(ax.clone().multiplyScalar(h));
  b.cyl(lip, lip.clone().add(ax.clone().multiplyScalar(0.035)), r * 0.8, r * 0.3, 8, TILE.PAINT, COL_E.enamel, { cap1: true });
  const loop = []; for (let k = 0; k <= 12; k++) { const a = Math.PI * (k / 12); loop.push(lip.clone().add(V(0, 0, Math.cos(a) * r * 0.95)).add(ax.clone().multiplyScalar(Math.sin(a) * 0.16))); }
  b.tube(loop, 0.005, 4, TILE.METAL, COL.iron);
  void rng;
  return { geo: b.build(), dots: [] }; // (under 2.4 m of water: never the dot's; it comes up on a line)
}
// the dark shape on the sand where the pot lies (60 S9: N03 read at the beach rock on a calm bright day)
function sandShape() {
  const b = new PropBuilder(), n = 12, pts = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pts.push(V(Math.cos(a) * 0.34, 0.01, Math.sin(a) * 0.26)); }
  b.face(pts, TILE.PLAIN, COL_E.shadow, { ref: V(0, 1, 0) });
  return { geo: b.build(), dots: [] };
}
// /e
// x: begin (campaign stream x: 70 §2.3's rhubarb at Mummo's; 30 §9's white stone on a flat rock at C902's landing)
const COL_X = { stalk: C(0x9a3a3a), stalkPale: C(0xb0605a), leaf: C(0x4f7f3a), leafDark: C(0x3f6a30), rock: C(0x8f8a82) };
// rhubarb gone wild where a garden was: red stalks out of one crown, big crinkled leaves held flat at knee height
function rhubarb({ rng }) {
  const b = new PropBuilder(), n = 7 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.5, L = 0.35 + rng() * 0.2, lean = 0.55 + rng() * 0.2;
    const tip = V(Math.cos(a) * L * lean, 0.32 + rng() * 0.18, Math.sin(a) * L * lean);
    b.cyl(V(0, 0, 0), tip, 0.018, 0.012, 4, TILE.FIBRE, k % 2 ? COL_X.stalk : COL_X.stalkPale);
    const r = 0.2 + rng() * 0.1, pts = [];
    for (let j = 0; j < 7; j++) { const t = (j / 7) * Math.PI * 2, rr = r * (0.8 + rng() * 0.3); pts.push(V(tip.x + Math.cos(a) * r * 0.7 + Math.cos(t) * rr, tip.y + (rng() - 0.5) * 0.05, tip.z + Math.sin(a) * r * 0.7 + Math.sin(t) * rr)); }
    b.face(pts, TILE.FIBRE, k % 3 ? COL_X.leaf : COL_X.leafDark, { ref: V(0, 1, 0) });
    b.face(pts.slice().reverse(), TILE.FIBRE, COL_X.leafDark, { ref: V(0, -1, 0) });
  }
  return { geo: b.build(), dots: [{ y: 0.4, r: 0.6 }] };
}
// a low flat rock at a landing, a white stone's seat (its top for `on`)
function flatRock({ rng }) {
  const b = new PropBuilder();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.03, rng() * Math.PI, -0.02));
  chunkStone(b, new THREE.Matrix4().compose(V(0, -0.08, 0), q, V(0.8, 0.22, 0.9)), rng, COL_X.rock);
  return { geo: b.build(), dots: [{ y: 0.08, r: 0.7 }], top: 0.11 };
}
// x: end

// a3: Round 4 stream A3's kits (docs/story/31-guiding-years.md GY-04, GY-07, GY-12, GY-13, §9.1, §13 "Story props"): the
// tow landing at Prairie's Sucker end, the lunch rock's old fire ring and pine stub, and at Moose Lake 25 the bunkhouse
// (six bunks, bunk 3 under the window, the step, the stuck screen door, the battery lamp on the sill) and the boathouse
// (the loft over its back half: the ladder on the left inside the door, the banker's boxes 1998–2020, the rafter by the
// window, Marlys's red canoe across the rafters, the crew snapshot, the coffee can of bolts). The two buildings return
// their `spots` in their own frame (front, the door's side, toward -z; x across; y up from the floor) for guiding-cast.js.
const COL_G = { plank: C(0x8a7356), plankOld: C(0x6e6050), post: C(0x5a4a3a), moss: C(0x5f6e3c), stub: C(0x9a958c),
  siding: C(0x7d5a3c), trim: C(0xd9cdb0), roof: C(0x4b4f55), floor: C(0x9a7a56), frame: C(0x5a4636), mattress: C(0x9aa08a),
  stove: C(0x2a2a2a), glass: C(0x86a0a8), screen: C(0x4a4a46), lamp: C(0xd8b84a), box: C(0xc9b48a), boxLid: C(0xb8a37a),
  red: C(0xa8322a), rafter: C(0x6a5440), photo: C(0xe8e0cc), can: C(0x8a8a86), shingle: C(0x5a4f48) };
function towDock({ rng }) {
  const b = new PropBuilder(), L = 3.2, W = 0.9;
  for (const [x, z] of [[-W, -L], [W, -L], [-W, 0], [W, 0]]) b.cyl(V(x, -0.9, z), V(x, 0.42, z), 0.07, 0.07, 6, TILE.WOOD, COL_G.post);
  for (let z = -L; z <= 0.01; z += 0.32) b.box(V(0, 0.4, z), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), W + 0.12, 0.025, 0.14, TILE.WOOD, rng() < 0.3 ? COL_G.plankOld : COL_G.plank);
  return { geo: b.build(), dots: [{ y: 0.5, r: 1.6 }] };
}
function oldFireRing({ rng }) {
  const b = new PropBuilder(), R = 0.45;
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, s = 0.1 + rng() * 0.05; chunkStone(b, new THREE.Matrix4().compose(V(Math.cos(a) * R, -0.02, Math.sin(a) * R), new THREE.Quaternion(), V(s, s * 0.5, s)), rng, rng() < 0.5 ? COL_G.moss : COL.rock); }
  return { geo: b.build(), dots: [{ y: 0.05, r: 0.7 }] };
}
function pineStub({ rng }) {
  const b = new PropBuilder(), h = 1.6 + rng() * 0.5;
  b.cyl(V(0, -0.1, 0), V(0.05, h, 0.03), 0.36, 0.24, 9, TILE.BARK, COL_G.stub, { cap1: true, capTile: TILE.SPLIT, capCol: COL.cutOld, jitter: 0.04, rng });
  b.cyl(V(0.05, h, 0.03), V(0.12, h + 0.5, -0.05), 0.12, 0.02, 5, TILE.SPLIT, COL_G.stub); // (the snapped top's splinter)
  return { geo: b.build(), dots: [{ y: 1, r: 0.6 }] };
}
// the walls of a box building with gaps (front −z: `door` [x0, x1, y1], `win` [x0, x1, y0, y1]); half sizes hx, hz, eave h
function walls(b, hx, hz, h, col, { door = null, win = [], sideWin = [] } = {}) {
  const t = 0.05;
  // front, in pieces round the door and the windows (columns between gaps)
  const cuts = [...(door ? [[door[0], door[1], 0, door[2]]] : []), ...win].sort((p, q) => p[0] - q[0]);
  let x = -hx;
  for (const [x0, x1, y0, y1] of cuts) {
    if (x0 > x) b.box(V((x + x0) / 2, h / 2, -hz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), (x0 - x) / 2, h / 2, t, TILE.WOOD, col);
    if (y0 > 0) b.box(V((x0 + x1) / 2, y0 / 2, -hz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), (x1 - x0) / 2, y0 / 2, t, TILE.WOOD, col);
    if (y1 < h) b.box(V((x0 + x1) / 2, (y1 + h) / 2, -hz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), (x1 - x0) / 2, (h - y1) / 2, t, TILE.WOOD, col);
    if (y0 > 0) b.box(V((x0 + x1) / 2, y0, -hz + 0.02), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), (x1 - x0) / 2 + 0.05, 0.03, 0.12, TILE.WOOD, COL_G.trim); // (a sill)
    x = x1;
  }
  if (x < hx) b.box(V((x + hx) / 2, h / 2, -hz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), (hx - x) / 2, h / 2, t, TILE.WOOD, col);
  b.box(V(0, h / 2, hz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), hx, h / 2, t, TILE.WOOD, col);
  for (const s of [-1, 1]) {
    const w = sideWin.find((q) => q.s === s);
    if (!w) { b.box(V(s * hx, h / 2, 0), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), hz, h / 2, t, TILE.WOOD, col); continue; }
    b.box(V(s * hx, w.y0 / 2, 0), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), hz, w.y0 / 2, t, TILE.WOOD, col);
    b.box(V(s * hx, (w.y1 + h) / 2, 0), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), hz, (h - w.y1) / 2, t, TILE.WOOD, col);
    b.box(V(s * hx, (w.y0 + w.y1) / 2, (w.z0 - hz) / 2), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), (w.z0 + hz) / 2, (w.y1 - w.y0) / 2, t, TILE.WOOD, col);
    b.box(V(s * hx, (w.y0 + w.y1) / 2, (w.z1 + hz) / 2), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), (hz - w.z1) / 2, (w.y1 - w.y0) / 2, t, TILE.WOOD, col);
    b.box(V(s * hx, (w.y0 + w.y1) / 2, (w.z0 + w.z1) / 2), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), (w.z1 - w.z0) / 2, (w.y1 - w.y0) / 2, 0.01, TILE.GLASS, COL_G.glass);
  }
}
function gable(b, hx, hz, h, rise, col, over = 0.3) {
  const e = hz + over;
  for (const s of [-1, 1]) b.quad(V(-hx - over, h, s * e), V(hx + over, h, s * e), V(hx + over, h + rise, 0), V(-hx - over, h + rise, 0), TILE.ROOF, col);
  for (const sx of [-1, 1]) b.face([V(sx * hx, h, -hz), V(sx * hx, h, hz), V(sx * hx, h + rise * (hz / e), 0)], TILE.WOOD, COL_G.siding);
}
function bunk(b, cx, cz, y, along = 'x') {
  const X = along === 'x' ? V(1, 0, 0) : V(0, 0, 1), Z = along === 'x' ? V(0, 0, 1) : V(1, 0, 0), o = V(cx, y, cz);
  b.box(o, X, V(0, 1, 0), Z, 0.98, 0.05, 0.42, TILE.WOOD, COL_G.frame);
  b.box(o.clone().add(V(0, 0.09, 0)), X, V(0, 1, 0), Z, 0.94, 0.06, 0.38, TILE.CANVAS, COL_G.mattress);
  if (y < 0.6) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = o.clone().addScaledVector(X, sx * 0.94).addScaledVector(Z, sz * 0.38); b.cyl(V(p.x, 0, p.z), V(p.x, y, p.z), 0.035, 0.035, 4, TILE.WOOD, COL_G.frame); }
}
// the bunkhouse: 6 × 4 m, the door and bunk 3's window in the front (toward the lot), bunk 4 across, 1 and 2 at the back
// with 5 and 6 over them, the stove at the back between; the step outside the door
function bunkhouse() {
  const b = new PropBuilder(), hx = 3, hz = 2, h = 2.3;
  b.box(V(0, 0.05, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), hx, 0.05, hz, TILE.WOOD, COL_G.floor);
  walls(b, hx, hz, h, COL_G.siding, { door: [-0.45, 0.45, 2.0], win: [[-2.2, -1.0, 1.05, 1.75]] });
  gable(b, hx, hz, h, 1.0, COL_G.roof);
  bunk(b, -1.75, -1.4, 0.45); bunk(b, 1.75, -1.4, 0.45); bunk(b, -1.75, 1.45, 0.45); bunk(b, 1.75, 1.45, 0.45);
  bunk(b, -1.75, 1.45, 1.45); bunk(b, 1.75, 1.45, 1.45);
  b.box(V(0, 0.4, 1.6), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.35, 0.4, 0.3, TILE.METAL, COL_G.stove);
  b.cyl(V(0, 0.8, 1.6), V(0, h + 1.2, 1.6), 0.07, 0.07, 6, TILE.METAL, COL_G.stove);
  b.box(V(0, 0.08, -hz - 0.45), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.6, 0.08, 0.3, TILE.WOOD, COL_G.plankOld); // the step
  const spots = {
    bunk3: { x: -1.75, y: 0.62, z: -1.4, face: Math.PI }, bunk4: { x: 1.75, y: 0.62, z: -1.4 }, step: { x: 0, y: 0.2, z: -hz - 0.45 },
    door: { x: 0, y: 0, z: -hz }, lamp: { x: -1.6, y: 1.1, z: -hz + 0.1 }, window: { x: -1.6, y: 1.4, z: -hz }, inside: { x: 0, y: 0, z: 0 },
  };
  return { geo: b.build(), dots: [], spots };
}
// the screen door, hinged at x = −0.45 of the doorway (its own mesh: it sticks, then bangs at 02:00)
function bunkDoor() {
  const b = new PropBuilder();
  for (const x of [0.02, 0.88]) b.box(V(x, 1.0, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.03, 1.0, 0.025, TILE.WOOD, COL_G.trim);
  for (const y of [0.04, 1.0, 1.96]) b.box(V(0.45, y, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.44, 0.04, 0.025, TILE.WOOD, COL_G.trim);
  b.box(V(0.45, 1.0, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.42, 0.94, 0.005, TILE.PLAIN, COL_G.screen);
  return { geo: b.build(), dots: [] };
}
function bunkLamp() {
  const b = new PropBuilder();
  b.cyl(V(0, 0, 0), V(0, 0.16, 0), 0.06, 0.05, 8, TILE.METAL, COL_G.stove, { cap1: true });
  b.cyl(V(0, 0.16, 0), V(0, 0.24, 0), 0.045, 0.045, 8, TILE.GLASS, COL_G.lamp, { cap1: true, capTile: TILE.METAL, capCol: COL_G.stove });
  return { geo: b.build(), dots: [{ y: 0.12, r: 0.25 }] };
}
// the boathouse: 7 × 5 m, the door in the front (−z, from the yard), the water side open over the slip; the loft over the
// back half at 2.3 m, the ladder on the left inside the door, the window over the dock in the left wall
export const LOFT_YEARS = Array.from({ length: 23 }, (_, k) => 1998 + k);
function boathouse({ rng }) {
  const b = new PropBuilder(), hx = 3.5, hz = 2.5, h = 3.4, loftY = 2.3;
  b.box(V(0, 0.05, -hz / 2), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), hx, 0.05, hz / 2, TILE.WOOD, COL_G.floor);
  // front wall with the door; the back (water side) only a beam; the sides with the window on the left (−x)
  const t = 0.05;
  for (const [x0, x1] of [[-hx, -0.7], [0.7, hx]]) b.box(V((x0 + x1) / 2, h / 2, -hz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), (x1 - x0) / 2, h / 2, t, TILE.WOOD, COL_G.siding);
  b.box(V(0, (2.1 + h) / 2, -hz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.7, (h - 2.1) / 2, t, TILE.WOOD, COL_G.siding);
  b.box(V(0, h - 0.2, hz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), hx, 0.2, 0.08, TILE.WOOD, COL_G.rafter);
  for (const s of [-1, 1]) {
    if (s < 0) { // the window over the dock, in the loft
      b.box(V(-hx, 1.4, 0), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), hz, 1.4, t, TILE.WOOD, COL_G.siding);
      b.box(V(-hx, (3.3 + h) / 2, 0), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), hz, (h - 3.3) / 2 + 0.01, t, TILE.WOOD, COL_G.siding);
      b.box(V(-hx, 3.05, -hz / 2 - 0.2), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), hz / 2 + 0.2, 0.25, t, TILE.WOOD, COL_G.siding);
      b.box(V(-hx, 3.05, hz * 0.75), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), hz * 0.25, 0.25, t, TILE.WOOD, COL_G.siding);
      b.box(V(-hx, 3.05, hz * 0.25), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), hz * 0.25, 0.25, 0.01, TILE.GLASS, COL_G.glass);
    } else b.box(V(hx, h / 2, 0), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), hz, h / 2, t, TILE.WOOD, COL_G.siding);
  }
  gable(b, hx, hz, h, 1.2, COL_G.shingle);
  // the loft floor (the back half), its joists, the rafters
  b.box(V(0, loftY, hz / 2), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), hx - 0.05, 0.04, hz / 2, TILE.WOOD, COL_G.plankOld);
  for (const x of [-2.6, -1.3, 0, 1.3, 2.6]) b.box(V(x, h + 0.02, 0), V(0, 0, 1), V(0, 1, 0), V(1, 0, 0), hz, 0.06, 0.05, TILE.WOOD, COL_G.rafter);
  // the ladder on the left inside the door
  const lx = -2.4, lz = -0.15;
  for (const dx of [-0.22, 0.22]) b.cyl(V(lx + dx, 0, lz - 0.35), V(lx + dx, loftY + 0.9, lz), 0.03, 0.03, 4, TILE.WOOD, COL_G.frame);
  for (let k = 1; k <= 8; k++) { const f = k / 9, y = f * (loftY + 0.9); b.cyl(V(lx - 0.22, y, lz - 0.35 * (1 - f)), V(lx + 0.22, y + (k === 3 ? 0.04 : 0), lz - 0.35 * (1 - f)), 0.018, 0.018, 4, TILE.WOOD, COL_G.frame); } // (the third rung loose)
  // Marlys's red canoe across the rafters, upside down
  const cz = -0.9; b.cyl(V(-2.4, h - 0.12, cz), V(2.4, h - 0.12, cz), 0.32, 0.32, 8, TILE.HULL, COL_G.red, { arc: [Math.PI * 0.05, Math.PI * 0.95], up: V(0, 1, 0) });
  // the banker's boxes by year, in rows on the loft floor (1998 at the back left); 2019 is not among them
  const boxes = [], yrs = LOFT_YEARS.filter((y) => y !== 2019);
  yrs.forEach((yr, k) => {
    const col = k % 8, row = Math.floor(k / 8), x = -2.9 + col * 0.62 + 0.4, z = hz - 0.35 - row * 0.5, y = loftY + 0.04 + 0.16;
    b.box(V(x, y, z), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.2, 0.15, 0.16, TILE.PLAIN, COL_G.box);
    b.box(V(x, y + 0.16, z), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.21, 0.02, 0.17, TILE.PLAIN, COL_G.boxLid);
    boxes.push({ year: yr, x, y: y + 0.1, z });
  });
  // the rafter by the window (the initials), the crew snapshot on a beam, the coffee can of bolts
  const rafter = { x: -hx + 0.35, y: h + 0.02, z: hz * 0.25 };
  const snap = { x: 1.3, y: h - 0.15, z: hz * 0.7 }; b.box(V(snap.x, snap.y, snap.z - 0.06), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.07, 0.05, 0.004, TILE.PLAIN, COL_G.photo);
  const bolts = { x: 2.7, y: loftY + 0.14, z: hz - 0.3 }; b.cyl(V(bolts.x, loftY + 0.04, bolts.z), V(bolts.x, loftY + 0.2, bolts.z), 0.08, 0.08, 8, TILE.METAL, COL_G.can, { cap1: true });
  void rng;
  const spots = { door: { x: 0, y: 0, z: -hz }, ladder: { x: lx, y: 1.2, z: lz - 0.2 }, loft: { x: -1.6, y: loftY + 0.15, z: hz * 0.45 }, loftStand: { x: lx + 0.6, y: 0, z: lz - 0.6 },
    boxes, rafter, snap, bolts, canoe: { x: 0, y: h - 0.2, z: cz }, inside: { x: 0, y: 0, z: -hz / 2 } };
  return { geo: b.build(), dots: [], spots };
}
// /a3

// s: S8's things (60 S8 "The place"; campaign stream S, Round 4): the trapper's freight sled on the lunch rock, and the
// clearing up Emil's creek (the stovepipe, the square hollow, the bed spring, the tin under it, the rusted things in a
// row), a beaver house at the creek's mouth; the brass spinner in the rock's crack (Walt's, N16 read there). The cut
// stumps are Round 1's stumpCut (knee high, cut flat)
const COL_S = { ash: C(0x8c8270), board: C(0x77705f), boardDark: C(0x5d574b), strap: C(0x7a4128), sash: C(0x6a6255), pane: C(0x8fa6a4), rope: C(0x8f8366),
  pipe: C(0x5b3a26), moss: C(0x56663a), hollow: C(0x4a4434), spring: C(0x6e4128), tin: C(0x8a6a3a), sticks: C(0x6a5a44), mud: C(0x4f4232), brass: C(0xc2a050) };
// a freight sled about 2.4 m: ash runners curled up at the front, iron straps rusted to lace, a deck of split grey boards,
// two window sashes lashed on with rope rotted to threads, one pane cracked, one gone
function sled({ rng }) {
  const b = new PropBuilder(), L = 2.4, W = 0.34, rr = 0.035;
  for (const x of [-W, W]) {
    const run = []; for (let k = 0; k <= 10; k++) { const t = k / 10, z = -L / 2 + t * L, y = 0.04 + (t > 0.82 ? Math.pow((t - 0.82) / 0.18, 2) * 0.32 : 0); run.push(V(x, y, z)); }
    b.tube(run, rr, 5, TILE.WOOD, COL_S.ash);
    const strap = run.map((p) => p.clone().add(V(0, -rr * 0.7, 0))); b.tube(strap, rr * 0.45, 4, TILE.METAL, COL_S.strap);
  }
  for (let z = -L / 2 + 0.25; z < L / 2 - 0.3; z += 0.42) b.box(V(0, 0.13, z), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), W + 0.06, 0.03, 0.06, TILE.WOOD, COL_S.boardDark); // the cross-bars
  for (let x = -W + 0.06; x <= W - 0.05; x += 0.135) b.box(V(x + (rng() - 0.5) * 0.02, 0.18, (rng() - 0.5) * 0.06), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.06, 0.012, L / 2 - 0.35 - rng() * 0.12, TILE.SPLIT, rng() < 0.5 ? COL_S.board : COL_S.boardDark);
  // the two sashes, flat on the deck one over the other, a little askew
  for (let k = 0; k < 2; k++) {
    const y = 0.21 + k * 0.045, a = (k ? 0.08 : -0.05), ax = V(Math.cos(a), 0, Math.sin(a)), az = V(-Math.sin(a), 0, Math.cos(a)), c = V((k ? 0.02 : -0.03), y, -0.15 + k * 0.1);
    const hw = 0.3, hd = 0.42, f = 0.03;
    for (const [dx, dz, ex, ez] of [[0, -hd, hw, f], [0, hd, hw, f], [-hw, 0, f, hd], [hw, 0, f, hd]]) b.box(c.clone().add(ax.clone().multiplyScalar(dx)).add(az.clone().multiplyScalar(dz)), ax, V(0, 1, 0), az, ex, 0.02, ez, TILE.WOOD, COL_S.sash);
    if (k === 0) b.box(c.clone(), ax, V(0, 1, 0), az, hw - f, 0.004, hd - f, TILE.GLASS, COL_S.pane); // (the one pane left, cracked; the other's gone)
  }
  for (const z of [-0.45, 0.35]) b.tube([V(-W - 0.02, 0.2, z), V(-0.1, 0.27, z + 0.02), V(0.15, 0.27, z - 0.01), V(W + 0.02, 0.2, z)], 0.006, 3, TILE.ROPE, COL_S.rope);
  return { geo: b.build(), dots: [{ y: 0.25, r: 1.3 }] };
}
// a stovepipe rusted through, lying in the moss, an elbow at one end
function stovepipe({ rng }) {
  const b = new PropBuilder(), a = rng() * 0.6;
  const d = V(Math.cos(a), 0, Math.sin(a)), p0 = V(0, 0.05, 0).sub(d.clone().multiplyScalar(0.6)), p1 = V(0, 0.07, 0).add(d.clone().multiplyScalar(0.55));
  b.cyl(p0, p1, 0.075, 0.075, 8, TILE.METAL, COL_S.pipe, { jitter: 0.012, rng });
  b.cyl(p1, p1.clone().add(V(0, 0.02, 0)).add(V(-d.z, 0, d.x).multiplyScalar(0.22)), 0.07, 0.065, 8, TILE.METAL, COL_S.pipe);
  return { geo: b.build(), dots: [{ y: 0.1, r: 0.7 }] };
}
// a square hollow where the floor sat, about 4 × 4.5 m: its rim of rotted sill logs under moss, its middle sunk
function squareHollow({ rng }) {
  const b = new PropBuilder(), hw = 2.0, hd = 2.25;
  b.face([V(-hw, -0.12, -hd), V(hw, -0.12, -hd), V(hw, -0.12, hd), V(-hw, -0.12, hd)].reverse(), TILE.PLAIN, COL_S.hollow, { ref: V(0, 1, 0) });
  for (const [ax, along, off] of [[1, hw, -hd], [1, hw, hd], [0, hd, -hw], [0, hd, hw]]) {
    const a0 = ax ? V(-along, 0.04, off) : V(off, 0.04, -along), a1 = ax ? V(along, 0.04, off) : V(off, 0.04, along);
    b.cyl(a0, a1, 0.16, 0.14, 6, TILE.BARK, COL_S.moss, { jitter: 0.03, rng });
  }
  return { geo: b.build(), dots: [{ y: 0.05, r: 2.2 }] };
}
// a bed spring half sunk in the moss, its coils rusted to the frame
function bedSpring({ rng }) {
  const b = new PropBuilder(), hw = 0.45, hd = 0.95, tilt = 0.12;
  const P = (x, z) => V(x, 0.05 + z * Math.sin(tilt) * 0.3, z);
  for (const x of [-hw, hw]) b.cyl(P(x, -hd), P(x, hd), 0.014, 0.014, 4, TILE.METAL, COL_S.spring);
  for (const z of [-hd, hd]) b.cyl(P(-hw, z), P(hw, z), 0.014, 0.014, 4, TILE.METAL, COL_S.spring);
  for (let z = -hd + 0.15; z < hd; z += 0.19) for (let x = -hw + 0.12; x < hw; x += 0.15) { if (rng() < 0.15) continue; const c = P(x, z); b.cyl(c.clone().add(V(0, -0.05, 0)), c.clone().add(V(0, 0.04, 0)), 0.045, 0.045, 6, TILE.METAL, COL_S.spring); }
  return { geo: b.build(), dots: [{ y: 0.1, r: 0.9 }], top: 0.02 };
}
// the flat tobacco tin, its lid punched with nail dots ("E.R. 1947"): its words are the item's
function tobaccoTin() {
  const b = new PropBuilder();
  b.box(V(0, 0.012, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.06, 0.012, 0.04, TILE.METAL, COL_S.tin);
  return { geo: b.build(), dots: [{ y: 0.02, r: 0.25 }] };
}
// rusted things in a row along one side (a can, a trap's jaws, a bucket's hoop, a stove leg)
function rustRow({ rng }) {
  const b = new PropBuilder();
  for (let k = 0; k < 5; k++) {
    const x = -1.2 + k * 0.6 + (rng() - 0.5) * 0.15, z = (rng() - 0.5) * 0.15;
    if (k % 2) b.cyl(V(x, 0, z), V(x, 0.11, z), 0.05, 0.05, 7, TILE.METAL, COLA.rust);
    else b.tube([V(x - 0.12, 0.02, z), V(x, 0.07, z + 0.05), V(x + 0.12, 0.02, z)], 0.012, 4, TILE.METAL, COLA.rustRed);
  }
  return { geo: b.build(), dots: [{ y: 0.06, r: 1.4 }] };
}
// a beaver house at the creek's mouth: a dome of peeled sticks and mud standing in the water
function beaverLodge({ rng, level = 0.6 }) {
  const b = new PropBuilder(), R = 2.6, H = Math.max(1.3, level + 1.1);
  chunkStone(b, new THREE.Matrix4().compose(V(0, -level - 0.2, 0), new THREE.Quaternion(), V(R, H + 0.2, R * 0.85)), rng, COL_S.mud);
  for (let k = 0; k < 26; k++) {
    const a = rng() * Math.PI * 2, r0 = R * (0.3 + rng() * 0.7), y0 = (1 - r0 / R) * H - level;
    b.cyl(V(Math.cos(a) * r0, y0, Math.sin(a) * r0 * 0.85), V(Math.cos(a + 0.6) * (r0 + 0.5), y0 - 0.25, Math.sin(a + 0.6) * (r0 + 0.5) * 0.85), 0.03, 0.025, 4, TILE.BARK, COL_S.sticks);
  }
  return { geo: b.build(), dots: [{ y: Math.max(0.4, H - level) * 0.6, r: 2.4 }] };
}
// a brass spinner hooked into a crack in the rock
function spinner() {
  const b = new PropBuilder();
  b.box(V(0, 0.015, 0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.018, 0.004, 0.032, TILE.METAL, COL_S.brass);
  b.cyl(V(0, 0.015, 0.03), V(0, 0.01, 0.075), 0.002, 0.002, 3, TILE.METAL, COL.iron);
  return { geo: b.build(), dots: [{ y: 0.03, r: 0.22 }] };
}
// /s

// 7c: begin (the mini-campaigns' props: M1's bear sign at a chain site, M2's logbook box at each falls)
const COL_7C = { pack: C(0x7a5a2e), packDark: C(0x4e3a20), torn: C(0xd8cbb0), scat: C(0x2e2219), seed: C(0x8a2a3a), barrel: C(0x2f5aa0), lid: C(0x1e1e1e), box: C(0x6a5a44), post: C(0x5a4a38), cord: C(0xb8a888) };
const X7 = V(1, 0, 0), Y7 = V(0, 1, 0), Z7 = V(0, 0, 1);
// a food pack hung too low from a limb, torn down its side, claw marks in the canvas (the dot: "Torn pack")
function bearClaw({ rng }) {
  const b = new PropBuilder(), y = 1.35 + rng() * 0.2;
  b.cyl(V(-0.9, 2.4, 0), V(1.0, 2.55, 0.1), 0.07, 0.05, 6, TILE.BARK, COL.bark);          // the limb
  b.cyl(V(0.1, 2.48, 0.04), V(0.1, y + 0.32, 0.04), 0.008, 0.008, 4, TILE.ROPE, COL_7C.cord); // the rope
  b.box(V(0.1, y, 0.04), X7, Y7, Z7, 0.26, 0.32, 0.16, TILE.CANVAS, COL_7C.pack);           // the pack
  for (let k = 0; k < 3; k++) b.box(V(0.0 + k * 0.07, y - 0.05, 0.205), X7, Y7, Z7, 0.012, 0.2, 0.004, TILE.CANVAS, COL_7C.torn); // the claw rents
  b.box(V(0.1, y - 0.38, 0.04), X7, Y7, Z7, 0.2, 0.05, 0.12, TILE.CANVAS, COL_7C.packDark); // the sag where it spilled
  return { geo: b.build(), dots: [{ y: y, r: 0.6 }] };
}
// scat full of raspberry seeds by the latrine trail (the dot: "Scat")
function bearScat({ rng }) {
  const b = new PropBuilder();
  for (let k = 0; k < 4; k++) chunkStone(b, new THREE.Matrix4().compose(V((rng() - 0.5) * 0.25, 0.03, (rng() - 0.5) * 0.25), new THREE.Quaternion(), V(0.07, 0.04, 0.06)), rng, COL_7C.scat);
  for (let k = 0; k < 6; k++) chunkStone(b, new THREE.Matrix4().compose(V((rng() - 0.5) * 0.2, 0.06, (rng() - 0.5) * 0.2), new THREE.Quaternion(), V(0.012, 0.01, 0.012)), rng, COL_7C.seed);
  return { geo: b.build(), dots: [{ y: 0.05, r: 0.4 }] };
}
// a blue barrel dragged into the brush on its side, lid on, tooth holes (the dot: "Barrel")
function bearBarrel({ rng }) {
  const b = new PropBuilder(), tilt = 0.2 + rng() * 0.3;
  const ax = V(Math.cos(tilt), 0, Math.sin(tilt));
  b.cyl(V(0, 0.28, 0).sub(ax.clone().multiplyScalar(0.42)), V(0, 0.28, 0).add(ax.clone().multiplyScalar(0.42)), 0.28, 0.28, 12, TILE.PAINT, COL_7C.barrel, { cap0: true, cap1: true, capTile: TILE.PAINT, capCol: COL_7C.lid });
  for (let k = 0; k < 4; k++) b.box(V((rng() - 0.5) * 0.5, 0.52, (rng() - 0.5) * 0.2), X7, Y7, Z7, 0.012, 0.012, 0.012, TILE.PAINT, COL_7C.lid); // tooth holes
  return { geo: b.build(), dots: [{ y: 0.3, r: 0.6 }] };
}
// a weathered box on a cedar post at the carry, a logbook in it (M2: the dot "Logbook")
function logBox({ rng }) {
  const b = new PropBuilder(), h = 1.05 + rng() * 0.1;
  b.cyl(V(0, -0.1, 0), V(0, h, 0), 0.06, 0.055, 6, TILE.WOOD, COL_7C.post, { cap1: true });
  b.box(V(0, h + 0.13, 0), X7, Y7, Z7, 0.2, 0.14, 0.14, TILE.WOOD, COL_7C.box);
  b.box(V(0, h + 0.29, 0), X7, Y7, Z7, 0.23, 0.02, 0.17, TILE.WOOD, COL_7C.post); // the lid
  return { geo: b.build(), dots: [{ y: h + 0.15, r: 0.45 }] };
}
// 7c: end
// b5: begin (Round 5, the boys: 32 §5.2, §5.9.8, §12 #4, #6): Gene's paddle wedged blade up in the crotch of a red pine
// above C1125's landing (silver-grey, the varnish long gone, *G.A. '87* and four notches on the grip: too small to model,
// the camera reads them); the spent flare cartridge in the crack of Walt's rock; Walt's dented tin cup on the rock
const COL_B = { paddle: C(0xa8a49a), paddleEnd: C(0x8c877c), flare: C(0x9a3a2e), brass: C(0xb08a48), tin: C(0x9a9890), whiskey: C(0x7a4a1c) };
function paddlePine({ rng }) {
  const b = new PropBuilder(), H = 16 + rng() * 2, r0 = 0.3, r1 = 0.08, fork = 2.3;
  b.cyl(V(0, -0.2, 0), V(0, fork, 0), r0, r0 * 0.82, 10, TILE.BARK, COL.bark, { jitter: 0.015, rng });
  // the crotch: two leaders out of the fork, the paddle's shaft dropped between them
  for (const s of [-1, 1]) {
    const top = V(s * 1.1, H, 0.2 * s);
    b.cyl(V(0, fork - 0.1, 0), top, r0 * 0.6, r1, 9, TILE.BARK, (t) => COL.bark.clone().lerp(COL.barkRed, Math.min(1, t * 1.6)), { ts: [0, 0.4, 1], jitter: 0.015, rng });
    for (let k = 0; k < 5; k++) {
      const y = H * (0.68 + (k / 5) * 0.3), a = rng() * Math.PI * 2, L = 1.3 + rng() * 1.3, x0 = s * 1.1 * ((y - fork) / (H - fork));
      const p1 = V(x0 + Math.cos(a) * L, y + 0.5, Math.sin(a) * L);
      b.cyl(V(x0, y, 0), p1, 0.05, 0.02, 5, TILE.BARK, COL.bark);
      b.box(p1.clone().add(V(0, 0.15, 0)), V(Math.cos(a), 0, Math.sin(a)), V(0, 1, 0), V(-Math.sin(a), 0, Math.cos(a)), 0.9, 0.35, 0.7, TILE.FIBRE, COL.needles);
    }
  }
  // the paddle, blade up, facing the water (-z): grip down in the fork, the blade above it
  const g = V(0, fork - 0.25, -0.12), lean = V(0.05, 1, -0.12).normalize();
  const sh = g.clone().add(lean.clone().multiplyScalar(0.95));
  b.cyl(g, sh, 0.017, 0.016, 6, TILE.WOOD, COL_B.paddle);
  b.box(g.clone().add(lean.clone().multiplyScalar(-0.04)), V(1, 0, 0), lean, V(0, 0, 1), 0.06, 0.05, 0.022, TILE.WOOD, COL_B.paddleEnd); // the grip
  const bc = sh.clone().add(lean.clone().multiplyScalar(0.3));
  b.box(bc, V(1, 0, 0), lean, V(0, 0, 1), 0.095, 0.32, 0.009, TILE.WOOD, COL_B.paddle); // the beavertail blade
  return { geo: b.build(), dots: [{ y: fork + 0.6, r: 0.75, part: 'paddle' }] };
}
function flareCase() {
  const b = new PropBuilder();
  b.cyl(V(0, 0.012, -0.05), V(0.01, 0.022, 0.05), 0.012, 0.012, 7, TILE.PAINT, COL_B.flare, { cap1: true, capTile: TILE.METAL, capCol: COL_B.brass });
  return { geo: b.build(), dots: [{ y: 0.05, r: 0.35 }] };
}
function tinCup() {
  const b = new PropBuilder();
  b.cyl(V(0, 0, 0), V(0, 0.07, 0), 0.04, 0.045, 9, TILE.METAL, COL_B.tin, { cap0: true, capTile: TILE.METAL, capCol: COL_B.tin });
  b.cyl(V(0, 0.015, 0), V(0, 0.022, 0), 0.036, 0.036, 9, TILE.PLAIN, COL_B.whiskey, { cap1: true, capTile: TILE.PLAIN, capCol: COL_B.whiskey }); // a finger of whiskey
  const loop = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8); loop.push(V(0.045 + Math.sin(a) * 0.028, 0.055 - (1 - Math.cos(a)) * 0.0, 0).add(V(0, -Math.cos(a) * 0.02 - 0.015, 0))); }
  b.tube(loop, 0.004, 4, TILE.METAL, COL_B.tin);
  return { geo: b.build(), dots: [] };
}
// b5: end
const REGISTRY = { stumpCut, quartzCobble, crib, landingRock, redPine, gradeMouth, slab, pole, drillRod,
  casing, coreRack, boxLid, trench, stockpile, stationStake, creekRun, beaverDam, digPit, surveyLath, surveyTag, shovelBlade, twoStumps, cafeTable, urn, coolers, launch, // (a2: the mining years' kits)
  lilacs, stoneStep, foundation, bedFrame, stoneRing, swimRock, enamelPot, sandShape, // e:
  rhubarb, flatRock, // x:
  towDock, oldFireRing, pineStub, bunkhouse, bunkDoor, bunkLamp, boathouse, // a3:
  sled, stovepipe, squareHollow, bedSpring, tobaccoTin, rustRow, beaverLodge, spinner, // s: S8
  bearClaw, bearScat, bearBarrel, logBox, // 7c:
  paddlePine, flareCase, tinCup, // b5:
};
// 7a: begin (Round 7 stream 7a: S2's west site, S3's long rock and north bay, S4's kill: story-props-7a.js)
Object.assign(REGISTRY, KITS_7A);
// 7a: end
// a2: the café's spots in a store's own frame (props.js's: a across, b toward the front wall and the door; every store's
// inside is the same ±2.86 × ±3.86 m): the window table front left, the corner table front right clear of the board, the
// urn on the counter; each table's two seats facing it. Farm 31's café (mining-cast.js) and Rose's window table at Moose
// Lake 25 (feed-episodes.js, the join) both stand here
export function cafeSpots(L) {
  const A = L.axes.a, B = L.axes.b, Cn = L.centre, y = L.floorY;
  const W = (a, b) => ({ x: Cn.x + A.x * a + B.x * b, z: Cn.z + A.z * a + B.z * b });
  const head = (da, db) => Math.atan2(-(A.z * da + B.z * db), A.x * da + B.x * db);
  const tab = (a, b) => ({ ...W(a, b), y, ax: { x: B.x, z: B.z }, seats: [{ ...W(a, b - 0.62), y, heading: head(0, 1) }, { ...W(a, b + 0.62), y, heading: head(0, -1) }] });
  return { window: tab(-1.65, 3.05), corner: tab(1.5, 2.95), urn: { ...W(2.45, -2.65), y: y + 0.95 } };
}
// f: begin (Round 3 stream F: the far end's kits, story-props-far.js)
for (const [k, f] of Object.entries(FAR_KITS)) if (!REGISTRY[k]) REGISTRY[k] = f;
// f: end
// 7b: begin (Round 7 stream 7b: S5's wreck, case and framed chart; S6's carving, blazes, pond, planks, crate: story-props-7b.js)
for (const [k, f] of Object.entries(KITS_7B)) if (!REGISTRY[k]) REGISTRY[k] = f;
// 7b: end
export const KITS = Object.freeze(Object.keys(REGISTRY));
export function kit(name) { const f = REGISTRY[name]; return f ? { build: (ctx = {}) => f({ rng: Math.random, opts: {}, ...ctx }) } : null; }
// a seeded rng for a prop (the same stump every load)
export function rngFor(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  let a = h || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
