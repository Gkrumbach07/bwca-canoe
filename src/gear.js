import * as THREE from 'three';
import { Mesher, V3, ringPts, frame, loft } from './loft.js';

// The paddle and the fishing rod. Both are built as smooth vertex-coloured meshes for the look's Lambert
// (shading.js), with their pivots where the hands go.

const C = (h) => new THREE.Color(h);

// ---------------------------------------------------------------------------------------------------------
// The paddle: an ash T-grip and an oval shaft into a beavertail blade with a centre ridge, edges thinned
// to a soft lens and a dark resin tip. Paddle space: the grip's top at the origin, the shaft down -y, the
// blade in the x-y plane with its power face toward +z.
export const PADDLE = {
  length: 1.56,      // grip top to blade tip (61 in: kneeling, the grip comes to the chin with the blade buried)
  throat: 0.95,      // where the shaft flares into the blade
  centre: 1.25,      // the blade's middle (what player.js splashes from)
  grip: 0.017,       // the T's crossbar centre below the top
  lower: 0.63,       // the lower hand, down the shaft
};
export const PADDLE_COLORS = { shaft: 0xc9a46c, blade: 0xbd935c, tip: 0x3a2a1d, grip: 0xb48c58 };

export function paddleMesher(colors = PADDLE_COLORS) {
  const m = new Mesher();
  const shaft = C(colors.shaft), bladeC = C(colors.blade), tipC = C(colors.tip), gripC = C(colors.grip);
  // the T: a bar along x with a slight waist and rounded ends
  {
    const rings = [];
    const xs = [-0.066, -0.062, -0.052, -0.03, 0, 0.03, 0.052, 0.062, 0.066];
    for (const x of xs) {
      const end = Math.abs(x) > 0.06 ? (Math.abs(x) > 0.065 ? 0.45 : 0.8) : 1;
      const waist = 1 - 0.08 * (1 - Math.abs(x) / 0.06);
      rings.push(ringPts(V3(x, -PADDLE.grip, 0), V3(0, 1, 0), V3(0, 0, 1), 10, [0.016 * end * waist, 0.0135 * end * waist], { shape: 2.6, col: gripC }));
    }
    loft(m, rings, { capStart: true, capEnd: true });
  }
  // the shaft: oval, a little fuller under the grip, then the throat flaring flat into the blade
  {
    const rings = [];
    const sec = [[-0.012, 0.012, 0.011], [-0.03, 0.019, 0.016], [-0.06, 0.0168, 0.0148], [-0.45, 0.0165, 0.0145], [-0.87, 0.0165, 0.0142], [-0.92, 0.024, 0.0128], [-PADDLE.throat, 0.036, 0.0118]];
    for (const [y, rx, rz] of sec) rings.push(ringPts(V3(0, y, 0), V3(1, 0, 0), V3(0, 0, 1), 10, [rx, rz], { col: shaft }));
    // the blade: lens sections with a ridge down the middle
    const L = PADDLE.length - PADDLE.throat - 0.004;
    const vs = [0.03, 0.09, 0.18, 0.3, 0.45, 0.6, 0.74, 0.85, 0.92, 0.955, 0.98, 0.993];
    for (const v of vs) {
      const y = -PADDLE.throat - v * L;
      const rise = Math.sin(Math.min(1, v / 0.3) * Math.PI / 2);
      const w = 0.104 * (0.42 + 0.58 * rise) * (v > 0.3 ? Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.3) / 0.7, 3.2))) : 1);
      const ridge = 0.0115 - 0.0065 * v, edge = 0.0022;
      const col = v > 0.94 ? tipC : bladeC;
      const pts = [];
      const n = 14;
      for (let k = 0; k < n; k++) {
        const th = (k / n) * Math.PI * 2, x = w * Math.cos(th);
        const u = Math.abs(x) / Math.max(w, 1e-4);
        const t = edge + (ridge - edge) * Math.pow(Math.max(0, 1 - u * u), 1.3);
        pts.push({ p: V3(x, y, Math.sign(Math.sin(th)) * (Math.abs(Math.sin(th)) < 1e-6 ? 0 : t)), c: col });
      }
      rings.push(pts);
    }
    loft(m, rings, { capStart: false, capEnd: true });
  }
  return m;
}

// ---------------------------------------------------------------------------------------------------------
// The rod. Built along +y inside a group turned so it runs along +x (pitch is a z rotation): a rubber butt,
// a cork rear grip, a graphite reel seat, a short cork fore grip and a blank of eight tapering segments, each
// a child of the last so a bend accumulates toward the tip, carrying its guides. A spinning reel hangs under
// the seat (its foot between the fingers of the right hand) with a body, rotor, spool of line, bail wire and a
// crank on its left side for the left hand. Returns the same parts fishing.js poses, plus the knob.
export const ROD_COLORS = { blank: 0x2f2b27, cork: 0xc9a671, corkDark: 0xa98756, seat: 0x26292c, butt: 0x1f1f1f, reel: 0x3b3f45, spool: 0xb9bdc2, line: 0xe2ddd0, guide: 0x9aa0a6, thread: 0x6b2a22 };

function tubeMesh(m, y0, y1, r0, r1, col, n = 8) {
  const rings = [ringPts(V3(0, y0, 0), V3(1, 0, 0), V3(0, 0, 1), n, r0, { col }), ringPts(V3(0, y1, 0), V3(1, 0, 0), V3(0, 0, 1), n, r1, { col })];
  loft(m, rings);
}
// a torus in the plane of ex, ey about c
function torus(m, c, ex, ey, R, r, col, segs = 14, sides = 5, arc = Math.PI * 2) {
  const rings = [];
  const closed = arc >= Math.PI * 2 - 1e-6;
  const N = closed ? segs : segs + 1;
  for (let i = 0; i < N; i++) {
    const a = (i / segs) * arc, ca = Math.cos(a), sa = Math.sin(a);
    const centre = c.clone().addScaledVector(ex, ca * R).addScaledVector(ey, sa * R);
    const out = ex.clone().multiplyScalar(ca).addScaledVector(ey, sa);
    const ax = new THREE.Vector3().crossVectors(ex, ey).normalize();
    rings.push(ringPts(centre, out, ax, sides, r, { col }));
  }
  const idx = rings.map((rr) => m.ring(rr));
  // faces outward from the tube's core (the same test loft uses)
  const a = rings[0], b = rings[1];
  const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(a[1].p, a[0].p), new THREE.Vector3().subVectors(b[0].p, a[0].p));
  const core = a.reduce((s, q) => s.add(q.p), new THREE.Vector3()).multiplyScalar(1 / a.length);
  const flip = n.dot(new THREE.Vector3().subVectors(a[0].p, core)) < 0;
  for (let i = 0; i < idx.length - 1; i++) m.bridge(idx[i], idx[i + 1], flip);
  if (closed) m.bridge(idx[idx.length - 1], idx[0], flip);
}
function boxish(m, c, sx, sy, sz, col, shape = 4) {
  const rings = [];
  const ys = [-1, -0.8, 0.8, 1];
  for (const k of ys) {
    const s = Math.abs(k) === 1 ? 0.75 : 1;
    rings.push(ringPts(V3(c.x, c.y + k * sy, c.z), V3(1, 0, 0), V3(0, 0, 1), 12, [sx * s, sz * s], { shape, col }));
  }
  loft(m, rings, { capStart: true, capEnd: true });
}

export function buildRod(mat, colors = ROD_COLORS) {
  const root = new THREE.Group();
  const turn = new THREE.Group();
  turn.rotation.z = -Math.PI / 2;
  root.add(turn);
  const cork = C(colors.cork), corkDark = C(colors.corkDark), seat = C(colors.seat), butt = C(colors.butt), blank = C(colors.blank);
  const reelC = C(colors.reel), spoolC = C(colors.spool), lineC = C(colors.line), guideC = C(colors.guide), thread = C(colors.thread);
  const mesh = (m) => { const o = new THREE.Mesh(m.geometry(), mat); o.castShadow = true; return o; };
  // handle and seat
  {
    const m = new Mesher();
    tubeMesh(m, -0.345, -0.33, 0.012, 0.0145, butt, 10);
    const rings = [];
    for (const [y, r, c] of [[-0.33, 0.0145, butt], [-0.328, 0.0142, corkDark], [-0.31, 0.0143, cork], [-0.2, 0.0138, cork], [-0.1, 0.013, cork], [-0.035, 0.0124, corkDark], [-0.03, 0.0112, seat], [-0.005, 0.0112, seat], [0.0, 0.0125, seat], [0.012, 0.0125, seat], [0.016, 0.0105, seat], [0.07, 0.0105, seat], [0.074, 0.0125, seat], [0.088, 0.0125, seat], [0.092, 0.0108, corkDark], [0.1, 0.0115, cork], [0.15, 0.0102, cork], [0.168, 0.0094, corkDark], [0.172, 0.0072, thread]]) {
      rings.push(ringPts(V3(0, y, 0), V3(1, 0, 0), V3(0, 0, 1), 10, r, { col: c }));
    }
    loft(m, rings);
    turn.add(mesh(m));
  }
  // the reel: hung under the seat (build +x is down once turned)
  const crank = new THREE.Group();
  const knob = new THREE.Object3D();
  {
    const m = new Mesher();
    // foot and stem
    boxish(m, V3(0.014, 0.043, 0), 0.004, 0.022, 0.006, reelC);
    const stem = [ringPts(V3(0.016, 0.04, 0), V3(0, 1, 0), V3(0, 0, 1), 8, [0.006, 0.004], { col: reelC }), ringPts(V3(0.05, 0.038, 0), V3(0, 1, 0), V3(0, 0, 1), 8, [0.009, 0.006], { col: reelC })];
    loft(m, stem);
    // body (gearbox)
    boxish(m, V3(0.062, 0.036, 0), 0.02, 0.024, 0.017, reelC, 3);
    // rotor cup and spool along the rod's axis, ahead of the body
    const sx = 0.062;
    const rot = [];
    for (const [y, r, c] of [[0.058, 0.012, reelC], [0.064, 0.021, reelC], [0.082, 0.022, reelC], [0.084, 0.019, spoolC], [0.087, 0.0235, spoolC], [0.09, 0.0215, lineC], [0.106, 0.0215, lineC], [0.108, 0.0248, spoolC], [0.112, 0.0235, spoolC], [0.114, 0.008, spoolC]]) {
      rot.push(ringPts(V3(sx, y, 0), V3(1, 0, 0), V3(0, 0, 1), 14, r, { col: c }));
    }
    loft(m, rot, { capEnd: true });
    // the bail: a wire hoop across the front of the spool, on the far side from the rod
    torus(m, V3(sx, 0.098, 0), V3(1, 0, 0), V3(0, 0, 1), 0.027, 0.0012, spoolC, 12, 4, Math.PI);
    m.merge((() => { const k = new Mesher(); torus(k, V3(sx, 0.098, 0), V3(1, 0, 0), V3(0, 0, -1), 0.027, 0.0012, spoolC, 3, 4, Math.PI * 0.25); return k; })());
    turn.add(mesh(m));
    // the crank: an arm on the left of the body, spun about the axle (z); the knob at its end
    crank.position.set(sx, 0.036, -0.019);
    const cm = new Mesher();
    boxish(cm, V3(0, 0, -0.004), 0.006, 0.006, 0.004, reelC);
    loft(cm, [ringPts(V3(0.0, 0, -0.006), V3(0, 1, 0), V3(0, 0, 1), 6, 0.0028, { col: spoolC }), ringPts(V3(0.042, 0, -0.008), V3(0, 1, 0), V3(0, 0, 1), 6, 0.0026, { col: spoolC })]);
    const kn = [ringPts(V3(0.042, 0, -0.01), V3(1, 0, 0), V3(0, 1, 0), 8, 0.0055, { col: reelC }), ringPts(V3(0.042, 0, -0.034), V3(1, 0, 0), V3(0, 1, 0), 8, 0.0062, { col: reelC })];
    loft(cm, kn, { capStart: true, capEnd: true });
    crank.add(mesh(cm));
    knob.position.set(0.042, 0, -0.022);
    crank.add(knob);
    turn.add(crank);
  }
  // the blank: eight tapering segments, the guides hanging under it (build +x)
  const segs = [];
  const N = 8, segLen = 0.22, start = 0.172;
  const guides = [0.26, 0.48, 0.7, 0.92, 1.13, 1.34, 1.54, 1.72];
  const gR = [0.0125, 0.009, 0.0068, 0.0055, 0.0048, 0.0042, 0.0038, 0.0035];
  let parent = turn, y = start;
  const rAt = (s) => 0.0074 - (0.0074 - 0.0021) * Math.pow(s / (N * segLen), 0.9);
  for (let i = 0; i < N; i++) {
    const seg = new THREE.Group();
    seg.position.y = y;
    const m = new Mesher();
    const s0 = i * segLen, s1 = (i + 1) * segLen;
    tubeMesh(m, 0, segLen + 0.002, rAt(s0), rAt(s1), blank, 7);
    for (let g = 0; g < guides.length; g++) {
      const gs = guides[g];
      if (gs < s0 || gs >= s1) continue;
      const ly = gs - s0, rb = rAt(gs), R = gR[g];
      // the wrap, a wire leg from the blank to the ring, and the ring
      tubeMesh(m, ly - 0.008, ly + 0.008, rb + 0.0008, rb + 0.0008, thread, 7);
      const ringC = V3(rb + 0.004 + R, ly, 0);
      // the leg runs along x: rings in the y-z plane
      const f = frame(V3(1, 0, 0), V3(0, 1, 0));
      loft(m, [ringPts(V3(rb * 0.8, ly, 0), f.ex, f.ey, 4, 0.0012, { col: guideC }), ringPts(V3(ringC.x - R + 0.0005, ly, 0), f.ex, f.ey, 4, 0.0012, { col: guideC })]);
      torus(m, ringC, V3(1, 0, 0), V3(0, 0, 1), R, 0.0011, guideC, 10, 4);
    }
    seg.add(mesh(m));
    parent.add(seg);
    segs.push(seg);
    parent = seg; y = segLen;
  }
  // the tip-top
  {
    const m = new Mesher();
    torus(m, V3(0.0035, segLen, 0), V3(1, 0, 0), V3(0, 0, 1), 0.0028, 0.0009, guideC, 8, 4);
    tubeMesh(m, segLen - 0.006, segLen + 0.002, 0.0026, 0.0024, guideC, 6);
    parent.add(mesh(m));
  }
  const tip = new THREE.Object3D();
  tip.position.y = segLen;
  parent.add(tip);
  root.traverse((o) => { o.castShadow = true; });
  // where the right hand's fist sits (root space): round the cork just behind the reel foot
  const hand = V3(-0.055, 0, 0);
  return { root, segs, tip, crank, knob, hand };
}
