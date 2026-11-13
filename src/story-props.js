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
import { FAR_KITS } from './story-props-far.js'; // f: the far end's kits (Round 3)

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

const REGISTRY = { stumpCut, quartzCobble, crib, landingRock, redPine, gradeMouth, slab, pole, drillRod,
  casing, coreRack, boxLid, trench, stockpile, stationStake, creekRun, beaverDam, digPit, surveyLath, surveyTag, shovelBlade, twoStumps, cafeTable, urn, coolers, launch, // (a2: the mining years' kits)
  lilacs, stoneStep, foundation, bedFrame, stoneRing, swimRock, enamelPot, sandShape, // e:
};
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
export const KITS = Object.freeze(Object.keys(REGISTRY));
export function kit(name) { const f = REGISTRY[name]; return f ? { build: (ctx = {}) => f({ rng: Math.random, opts: {}, ...ctx }) } : null; }
// a seeded rng for a prop (the same stump every load)
export function rngFor(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  let a = h || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
