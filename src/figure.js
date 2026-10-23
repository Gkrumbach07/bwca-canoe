import * as THREE from 'three';
import { Mesher, V3, ringPts, frame, loft, applyAO, bakeLater, trianglesOf, smooth01 } from './loft.js';

// The paddler: one skinned mesh over a 27-bone rig, built procedurally from lofted rings so there are no
// separate pieces and no cracks at the joints. The torso is a single loft from the crotch to the crown of the
// head (shirt, collar, neck, jaw, skull); the arms run from inside the shoulders to curled fists with thumbs;
// the legs from inside the pelvis to the trouser cuffs over hiking boots. A PFD shell and its shoulder straps
// ride the torso with the same weights. Elbows and knees have half-rotation helper bones and each forearm a
// twist bone, so a bent joint keeps its volume and a turned wrist does not wring. The hat is a rigid mesh on
// the head bone. About 1.80 m tall, 7.5 heads. Bind pose: standing, facing +x, feet at y = 0, +z the right.
//
// Posing works in the paddler group's space: every bone rests unrotated, so a joint's rotation in that space
// is simply its rotation from the bind pose. Poser.rot / aim / arm / leg set them top-down.

export const FIGURE_COLORS = {
  skin: 0xd6a07a, shirt: 0x4d6577, cuff: 0x667e90, pants: 0x6b6a4d, belt: 0x3a2c20,
  pfd: 0xd65428, pfdDark: 0x8f3517, strap: 0x2a2a2a, boot: 0x5a3e29, sole: 0x2a221c, lace: 0x3b2a1c,
  hair: 0x3c2b1f, beard: 0x5b412d, hat: 0x9d8b61, band: 0x4a3a28,
};
const C = (h) => new THREE.Color(h);

export const BONES = ['root', 'spine', 'chest', 'neck', 'head',
  'clavL', 'armL', 'elbowL', 'foreL', 'twistL', 'handL',
  'clavR', 'armR', 'elbowR', 'foreR', 'twistR', 'handR',
  'thighL', 'kneeL', 'shinL', 'footL', 'toeL',
  'thighR', 'kneeR', 'shinR', 'footR', 'toeR'];
const B = Object.fromEntries(BONES.map((n, i) => [n, i]));

// lengths
export const LU = 0.315, LF = 0.265, LT = 0.4252, LS = 0.4153;
export const FIST = 0.07, PALM = 0.017; // the fist's centre: along the hand from the wrist, and toward the palm
const DIR_A = V3(0, -1, -0.24).normalize(); // the left arm in bind (the right mirrors z)
const mz = (v, sg) => V3(v.x, v.y, v.z * sg);

// bind positions (paddler space); the right side mirrors the left
function bindPositions() {
  const P = {
    root: V3(0, 0.975, 0), spine: V3(0, 1.08, 0), chest: V3(0, 1.25, 0), neck: V3(0, 1.495, 0), head: V3(0.008, 1.585, 0),
  };
  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const d = mz(DIR_A, sg === -1 ? 1 : -1);
    P['clav' + s] = V3(0, 1.44, sg * 0.03);
    const arm = V3(0, 1.425, sg * 0.185);
    P['arm' + s] = arm;
    P['fore' + s] = arm.clone().addScaledVector(d, LU);
    P['elbow' + s] = P['fore' + s].clone();
    P['twist' + s] = P['fore' + s].clone().addScaledVector(d, 0.13);
    P['hand' + s] = P['fore' + s].clone().addScaledVector(d, LF);
    P['thigh' + s] = V3(0, 0.925, sg * 0.098);
    P['shin' + s] = V3(0.012, 0.5, sg * 0.1);
    P['knee' + s] = P['shin' + s].clone();
    P['foot' + s] = V3(-0.005, 0.085, sg * 0.1);
    P['toe' + s] = V3(0.13, 0.022, sg * 0.103);
  }
  return P;
}
const PARENT = {
  spine: 'root', chest: 'spine', neck: 'chest', head: 'neck',
  clavL: 'chest', armL: 'clavL', elbowL: 'armL', foreL: 'armL', twistL: 'foreL', handL: 'twistL',
  clavR: 'chest', armR: 'clavR', elbowR: 'armR', foreR: 'armR', twistR: 'foreR', handR: 'twistR',
  thighL: 'root', kneeL: 'thighL', shinL: 'thighL', footL: 'shinL', toeL: 'footL',
  thighR: 'root', kneeR: 'thighR', shinR: 'thighR', footR: 'shinR', toeR: 'footR',
};

// ---------------------------------------------------------------------------------------------------------
// The mesh. res scales the ring counts (the occlusion proxy is built at a low res).
function torsoSpec(headScale) {
  // y, centre x, front, back, half-width
  const T = [
    [0.80, 0, 0.05, 0.06, 0.06], [0.84, 0, 0.085, 0.1, 0.12], [0.9, 0, 0.102, 0.115, 0.158], [0.97, 0, 0.1, 0.108, 0.16],
    [1.015, 0, 0.098, 0.1, 0.152], [1.03, 0, 0.099, 0.1, 0.15], [1.045, 0, 0.098, 0.098, 0.147], [1.08, 0, 0.097, 0.096, 0.145],
    [1.16, 0, 0.104, 0.096, 0.15], [1.25, 0, 0.118, 0.102, 0.16], [1.33, 0, 0.122, 0.104, 0.165], [1.4, 0, 0.105, 0.1, 0.163],
    [1.445, 0, 0.082, 0.088, 0.133], [1.485, 0.005, 0.062, 0.07, 0.085], [1.508, 0.008, 0.052, 0.058, 0.06], [1.54, 0.01, 0.05, 0.054, 0.054],
    [1.57, 0.014, 0.053, 0.053, 0.056],
  ];
  const H = [[1.6, 0.034, 0.068, 0.06, 0.064], [1.622, 0.026, 0.094, 0.08, 0.075], [1.655, 0.017, 0.104, 0.093, 0.083], [1.69, 0.01, 0.101, 0.099, 0.088],
    [1.725, 0.006, 0.093, 0.098, 0.087], [1.755, 0.002, 0.078, 0.084, 0.077], [1.78, 0, 0.05, 0.056, 0.05], [1.793, 0, 0.022, 0.024, 0.022]];
  for (const h of H) T.push([1.592 + (h[0] - 1.6) * headScale, h[1] * headScale, h[2] * headScale, h[3] * headScale, h[4] * headScale]);
  return T;
}
// the torso's surface ring at height y (interpolated), for the PFD and the straps
function torsoAt(spec, y) {
  for (let i = 0; i < spec.length - 1; i++) {
    const a = spec[i], b = spec[i + 1];
    if (y >= a[0] && y <= b[0]) { const t = (y - a[0]) / (b[0] - a[0]); return a.map((v, k) => v + (b[k] - v) * t); }
  }
  return spec[spec.length - 1];
}
function torsoWeights(y, z) {
  const t1 = smooth01(0.96, 1.12, y), t2 = smooth01(1.1, 1.27, y), t3 = smooth01(1.47, 1.535, y), t4 = smooth01(1.565, 1.615, y);
  const w = [[B.root, 1 - t1], [B.spine, t1 * (1 - t2)], [B.chest, t2 * (1 - t3)], [B.neck, t3 * (1 - t4)], [B.head, t4]];
  const sh = smooth01(1.32, 1.42, y) * (1 - t3) * smooth01(0.07, 0.15, Math.abs(z));
  if (sh > 0) { w[2][1] *= 1 - 0.55 * sh; w.push([z < 0 ? B.clavL : B.clavR, (t2 * (1 - t3)) * 0.55 * sh]); }
  return w;
}

function buildMesh(cols, res = 1) {
  const m = new Mesher(true);
  const col = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, C(v)]));
  const n = (k) => Math.max(4, Math.round(k * res));
  const spec = torsoSpec(1.1);
  // --- the torso, neck and head: one loft
  {
    const rings = [];
    for (const [y, cx, rf, rb, rz] of spec) {
      const colAt = (th) => {
        const front = Math.cos(th);
        if (y < 1.02) return col.pants;
        if (y < 1.05) return col.belt;
        if (y < 1.49) return col.shirt;
        if (y < 1.59) return col.skin;
        if (y < 1.665 && front > 0.2) return col.beard;           // a short beard on the jaw
        if (y > 1.645 && front < -0.1) return col.hair;           // hair at the back under the hat
        if (y > 1.73) return col.hair;
        return col.skin;
      };
      rings.push(ringPts(V3(cx, y, 0), V3(1, 0, 0), V3(0, 0, 1), n(20), (th) => [Math.cos(th) >= 0 ? rf : rb, rz], { shape: y < 1.47 ? 2.5 : 2.1, col: colAt, w: (th, p) => torsoWeights(y, p.z) }));
    }
    loft(m, rings, { capStart: true, capEnd: true });
  }
  // the nose and ears, on the head bone
  {
    const hy = 1.592 + (1.68 - 1.6) * 1.1;
    const front = torsoAt(spec, hy);
    const nx = front[1] + front[2];
    loft(m, [
      ringPts(V3(nx - 0.016, hy + 0.016, 0), V3(0, 1, 0), V3(0, 0, 1), n(6), [0.016, 0.013], { col: col.skin, w: [[B.head, 1]] }),
      ringPts(V3(nx + 0.008, hy - 0.004, 0), V3(0, 1, 0), V3(0, 0, 1), n(6), [0.014, 0.012], { col: col.skin, w: [[B.head, 1]] }),
      ringPts(V3(nx + 0.019, hy - 0.019, 0), V3(0, 1, 0), V3(0, 0, 1), n(6), [0.007, 0.01], { col: col.skin, w: [[B.head, 1]] }),
    ], { capEnd: true });
    for (const sg of [-1, 1]) {
      const ez = sg * (front[4] - 0.006);
      loft(m, [
        ringPts(V3(-0.005, hy, ez), V3(0, 1, 0), V3(1, 0, 0), n(6), [0.024, 0.014], { col: col.skin, w: [[B.head, 1]] }),
        ringPts(V3(-0.008, hy, ez + sg * 0.012), V3(0, 1, 0), V3(1, 0, 0), n(6), [0.022, 0.012], { col: col.skin, w: [[B.head, 1]] }),
      ], { capEnd: true });
    }
  }
  // --- the PFD shell over the shirt, and its shoulder straps
  {
    const rows = [[1.04, 0.003, 'pfdDark'], [1.052, 0.024, 'pfdDark'], [1.065, 0.025, 'pfd'], [1.15, 0.027, 'pfd'], [1.25, 0.029, 'pfd'], [1.33, 0.027, 'pfd'], [1.372, 0.022, 'pfd'], [1.386, 0.018, 'pfdDark'], [1.394, 0.003, 'pfdDark']];
    const rings = [];
    for (const [y, add, c] of rows) {
      const [, cx, rf, rb, rz] = torsoAt(spec, y);
      const colAt = (th) => (Math.abs(Math.sin(th)) < 0.13 && Math.cos(th) > 0 && c === 'pfd' ? col.pfdDark : col[c]);
      rings.push(ringPts(V3(cx, y, 0), V3(1, 0, 0), V3(0, 0, 1), n(20), (th) => [(Math.cos(th) >= 0 ? rf : rb) + add, rz + add * 0.85], { shape: 2.5, col: colAt, w: (th, p) => torsoWeights(y, p.z) }));
    }
    loft(m, rings);
    // straps: over the shoulders from the front panel to the back
    for (const sg of [-1, 1]) {
      const pts = [[0.118, 1.372], [0.085, 1.43], [0.035, 1.468], [-0.025, 1.47], [-0.075, 1.44], [-0.11, 1.372]];
      const rr = [];
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i], p = V3(x, y, sg * 0.098);
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const t = V3(b[0] - a[0], b[1] - a[1], 0).normalize();
        const f = frame(t, V3(0, 0, 1));
        rr.push(ringPts(p, f.ex, f.ey, 6, [0.026, 0.006], { shape: 3, col: col.pfdDark, w: torsoWeights(Math.min(y, 1.46), sg * 0.12) }));
      }
      loft(m, rr, { capStart: true, capEnd: true });
    }
  }
  // --- arms into fists
  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const d = mz(DIR_A, -sg);  // the arm's bind direction (outward is sg z)
    const a0 = V3(1, 0, 0);    // the grip axis: thumb side forward
    const palm = new THREE.Vector3().crossVectors(d, a0).multiplyScalar(-sg).normalize(); // palms face the thighs (the poser's convention)
    const sh = V3(0, 1.425, sg * 0.185);
    const bn = (k) => B[k + s];
    const spec2 = [
      [-0.055, 0.048, 'shirt', [['chest', 0.5, true], ['clav', 0.5]]],
      [-0.02, 0.056, 'shirt', [['clav', 0.55], ['arm', 0.45]]],
      [0.02, 0.06, 'shirt', [['clav', 0.3], ['arm', 0.7]]],
      [0.07, 0.056, 'shirt', [['arm', 1]]],
      [0.16, 0.05, 'shirt', [['arm', 1]]],
      [0.255, 0.046, 'shirt', [['arm', 0.6], ['elbow', 0.4]]],
      [LU, 0.044, 'shirt', [['elbow', 1]]],
      [0.36, 0.046, 'shirt', [['elbow', 0.35], ['fore', 0.65]]],
      [0.39, 0.05, 'cuff', [['fore', 1]]],
      [0.425, 0.049, 'cuff', [['fore', 1]]],
      [0.429, 0.038, 'skin', [['fore', 1]]],
      [0.47, 0.038, 'skin', [['fore', 0.7], ['twist', 0.3]]],
      [0.52, 0.035, 'skin', [['fore', 0.2], ['twist', 0.8]]],
      [0.56, 0.031, 'skin', [['twist', 0.75], ['hand', 0.25]]],
      [LU + LF, 0.0295, 'skin', [['twist', 0.4], ['hand', 0.6]]],
    ];
    const W = (list) => list.map(([k, w, abs]) => [abs ? B[k] : bn(k), w]);
    const rings = [];
    for (const [t, r, c, w] of spec2) rings.push(ringPts(sh.clone().addScaledVector(d, t), a0, palm, n(12), r, { col: col[c], w: W(w) }));
    // the fist: the fingers curl toward the palm round the grip
    const wr = sh.clone().addScaledVector(d, LU + LF);
    const fist = [[0.01, 0.031, 0.021, 0, [['hand', 0.85], ['twist', 0.15]]], [0.035, 0.04, 0.023, 0.001, [['hand', 1]]], [0.06, 0.045, 0.024, 0.004, [['hand', 1]]],
      [0.082, 0.046, 0.026, 0.011, [['hand', 1]]], [0.1, 0.043, 0.027, 0.025, [['hand', 1]]], [0.111, 0.037, 0.022, 0.04, [['hand', 1]]]];
    for (const [t, rx, ry, off, w] of fist) rings.push(ringPts(wr.clone().addScaledVector(d, t).addScaledVector(palm, off), a0, palm, n(12), [rx, ry], { shape: 2.4, col: col.skin, w: W(w) }));
    loft(m, rings, { capStart: true, capEnd: true });
    // the thumb, wrapping over the fingers on the thumb side
    const th = [[0.028, 0.03, 0.006, 0.013], [0.052, 0.046, 0.02, 0.012], [0.073, 0.047, 0.034, 0.0105], [0.087, 0.038, 0.042, 0.0085]];
    const tr = [];
    for (let i = 0; i < th.length; i++) {
      const [td, ta, tp, r] = th[i];
      const p = wr.clone().addScaledVector(d, td).addScaledVector(a0, ta).addScaledVector(palm, tp);
      const q = th[Math.min(th.length - 1, i + 1)], o = th[Math.max(0, i - 1)];
      const tan = d.clone().multiplyScalar(q[0] - o[0]).addScaledVector(a0, q[1] - o[1]).addScaledVector(palm, q[2] - o[2]).normalize();
      const f = frame(tan, palm);
      tr.push(ringPts(p, f.ex, f.ey, n(6), r, { col: col.skin, w: [[bn('hand'), 1]] }));
    }
    loft(m, tr, { capStart: true, capEnd: true });
  }
  // --- legs into trouser cuffs
  for (const [s, sg] of [['L', -1], ['R', 1]]) {
    const bn = (k) => B[k + s];
    const hip = V3(0, 0.925, sg * 0.098), knee = V3(0.012, 0.5, sg * 0.1), ankle = V3(-0.005, 0.085, sg * 0.1);
    const along = (y) => (y >= 0.5 ? hip.clone().lerp(knee, (0.925 - y) / 0.425) : knee.clone().lerp(ankle, (0.5 - y) / 0.415));
    const spec3 = [
      [0.995, 0.08, 0.078, [['root', 0.75, true], ['thigh', 0.25]]], [0.925, 0.086, 0.084, [['root', 0.35, true], ['thigh', 0.65]]],
      [0.86, 0.083, 0.081, [['thigh', 0.9], ['root', 0.1, true]]], [0.74, 0.075, 0.073, [['thigh', 1]]], [0.6, 0.066, 0.063, [['thigh', 0.6], ['knee', 0.4]]],
      [0.5, 0.06, 0.058, [['knee', 1]]], [0.42, 0.06, 0.057, [['knee', 0.35], ['shin', 0.65]]], [0.32, 0.061, 0.056, [['shin', 1]]],
      [0.22, 0.056, 0.053, [['shin', 1]]], [0.18, 0.063, 0.061, [['shin', 1]]], [0.168, 0.046, 0.045, [['shin', 1]]],
    ];
    const W = (list) => list.map(([k, w, abs]) => [abs ? B[k] : bn(k), w]);
    const rings = [];
    for (const [y, rf, rz, w] of spec3) {
      const c = along(Math.min(0.925, y));
      if (y > 0.925) c.y = y;
      rings.push(ringPts(c, V3(1, 0, 0), V3(0, 0, 1), n(12), [rf, rz], { col: col.pants, w: W(w) }));
    }
    loft(m, rings, { capEnd: true });
    // the boot: an ankle shaft and the foot, heel to toe
    const ax = ankle.x, az = ankle.z;
    loft(m, [
      ringPts(V3(ax, 0.205, az), V3(1, 0, 0), V3(0, 0, 1), n(12), [0.057, 0.055], { col: col.boot, w: W([['shin', 0.55], ['foot', 0.45]]) }),
      ringPts(V3(ax + 0.003, 0.15, az), V3(1, 0, 0), V3(0, 0, 1), n(12), [0.058, 0.056], { col: col.boot, w: W([['foot', 0.85], ['shin', 0.15]]) }),
      ringPts(V3(ax + 0.008, 0.1, az), V3(1, 0, 0), V3(0, 0, 1), n(12), [0.056, 0.054], { col: col.boot, w: W([['foot', 1]]) }),
    ]);
    const foot = [[-0.072, 0.006, 0.07, 0.038], [-0.058, 0.0, 0.1, 0.045], [-0.02, 0.0, 0.118, 0.05], [0.03, 0.0, 0.108, 0.052], [0.08, 0.0, 0.084, 0.053], [0.125, 0.0, 0.066, 0.054], [0.17, 0.0, 0.054, 0.05], [0.205, 0.004, 0.044, 0.04], [0.226, 0.012, 0.032, 0.025], [0.234, 0.018, 0.024, 0.012]];
    const fr = [];
    for (const [x, bot, top, hw] of foot) {
      const fx = ax + x, cy = (bot + top) / 2, ry = (top - bot) / 2;
      const w = x < 0.07 ? [['foot', 1]] : x < 0.15 ? [['foot', 1 - (x - 0.07) / 0.08], ['toe', (x - 0.07) / 0.08]] : [['toe', 1]];
      fr.push(ringPts(V3(fx, cy, az), V3(0, 1, 0), V3(0, 0, 1), n(12), [ry, hw], { shape: 3.2, col: (thh, p) => (p.y < bot + 0.013 ? col.sole : (x > 0.0 && x < 0.1 && p.y > top - 0.012 && Math.abs(p.z - az) < 0.02 ? col.lace : col.boot)), w: W(w) }));
    }
    loft(m, fr, { capStart: true, capEnd: true });
  }
  return m;
}

// the hat: a bush hat with a soft crown and a wide drooping brim, in head-bone space
function buildHat(cols) {
  const m = new Mesher();
  const hat = C(cols.hat), band = C(cols.band);
  const base = 0.163, cx = -0.006;
  const N = 28;
  const ring = (y, rx, rz, c, drop = 0, dent = 0) => {
    const pts = [];
    for (let k = 0; k < N; k++) {
      const th = (k / N) * Math.PI * 2;
      pts.push({ p: V3(cx + Math.cos(th) * rx, y - drop - dent * (1 - Math.abs(Math.cos(th))), Math.sin(th) * rz), c });
    }
    return pts;
  };
  // crown: from inside the brim up to a pinched top
  const crown = [ring(base - 0.004, 0.106, 0.096, band), ring(base + 0.022, 0.104, 0.094, band), ring(base + 0.024, 0.103, 0.093, hat), ring(base + 0.07, 0.097, 0.087, hat), ring(base + 0.092, 0.088, 0.078, hat), ring(base + 0.1, 0.062, 0.054, hat, 0, 0.012), ring(base + 0.098, 0.02, 0.016, hat, 0, 0.012)];
  loft(m, crown, { capEnd: true });
  // brim: top surface out to the edge, round the rim, and the underside back in under the crown
  const brim = [ring(base + 0.003, 0.105, 0.095, hat), ring(base + 0.0, 0.14, 0.13, hat, 0.004), ring(base - 0.004, 0.185, 0.172, hat, 0.012), ring(base - 0.009, 0.19, 0.177, hat, 0.015),
    ring(base - 0.013, 0.186, 0.173, hat, 0.014), ring(base - 0.009, 0.14, 0.13, hat, 0.005), ring(base - 0.006, 0.07, 0.062, hat)];
  const idx = brim.map((r) => m.ring(r));
  for (let i = 0; i < idx.length - 1; i++) m.bridge(idx[i], idx[i + 1]);
  m.fan(idx[idx.length - 1], V3(cx, base - 0.006, 0), hat, null);
  return m;
}

// ---------------------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
// the rotation whose y axis is d and whose x axis is s (made perpendicular)
function basisQ(d, s, out) {
  _y.copy(d).normalize();
  _x.copy(s).addScaledVector(_y, -s.dot(_y));
  if (_x.lengthSq() < 1e-10) { _x.set(1, 0, 0).addScaledVector(_y, -_y.x); if (_x.lengthSq() < 1e-10) _x.set(0, 0, 1); }
  _x.normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

// Two-bone IK: the middle joint for a limb from s to h with lengths l1, l2, bending toward pole. h is pulled
// in when out of reach; returns how far short it fell.
const _dir = new THREE.Vector3(), _pole = new THREE.Vector3();
export function solveJoint(s, h, l1, l2, pole, out) {
  _dir.subVectors(h, s);
  let d = _dir.length(), short = 0;
  const maxD = l1 + l2 - 0.002, minD = Math.abs(l1 - l2) + 0.01;
  if (d > maxD) { short = d - maxD; h.copy(s).addScaledVector(_dir, maxD / d); d = maxD; }
  if (d < minD) { h.copy(s).addScaledVector(_dir, minD / Math.max(d, 1e-6)); d = minD; }
  _dir.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _pole.subVectors(pole, s);
  _pole.addScaledVector(_dir, -_pole.dot(_dir));
  if (_pole.lengthSq() < 1e-10) _pole.set(1, 0, 0).addScaledVector(_dir, -_dir.x);
  _pole.normalize();
  out.copy(s).addScaledVector(_dir, a).addScaledVector(_pole, hgt);
  return short;
}

class Joint {
  constructor(name, bone, parent, bind) {
    this.name = name; this.bone = bone; this.parent = parent; this.bind = bind.clone();
    this.off = parent ? bind.clone().sub(parent.bind) : bind.clone();
    this.q = new THREE.Quaternion(); this.p = bind.clone(); this.children = [];
    this.q0inv = null; // for aim: the inverse of the bind basis (d0, s0)
  }
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _aa = new THREE.Vector3(), _ad = new THREE.Vector3(), _ap = new THREE.Vector3(), _aw = new THREE.Vector3();
export class Poser {
  constructor(joints) {
    this.j = joints;
    // aim frames: bind direction and side for the limbs
    const set = (n, d0, s0) => { const J = joints[n]; J.d0 = d0.clone().normalize(); J.s0 = s0.clone(); J.q0inv = basisQ(J.d0, J.s0, new THREE.Quaternion()).invert(); };
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? -1 : 1, d = mz(DIR_A, -sg);
      for (const k of ['arm', 'elbow', 'fore', 'twist']) set(k + s, d, V3(-1, 0, 0));
      set('hand' + s, d, V3(1, 0, 0));
      for (const k of ['thigh', 'knee']) set(k + s, joints['shin' + s].bind.clone().sub(joints['thigh' + s].bind), V3(1, 0, 0));
      set('shin' + s, joints['foot' + s].bind.clone().sub(joints['shin' + s].bind), V3(1, 0, 0));
    }
    this.elbow = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this.short = { L: 0, R: 0 };
  }
  pos(n) { return this.j[n].p; }
  // the root, in the paddler group's space
  setRoot(p, q) {
    const J = this.j.root;
    J.p.copy(p); J.q.copy(q);
    J.bone.position.copy(p); J.bone.quaternion.copy(q);
    this._children(J);
  }
  _children(J) { for (const c of J.children) c.p.copy(c.off).applyQuaternion(J.q).add(J.p); }
  // a joint's rotation in the paddler group's space (its parent already set)
  rot(n, q) {
    const J = this.j[n];
    J.q.copy(q);
    J.bone.quaternion.copy(_q.copy(J.parent.q).invert().multiply(q));
    this._children(J);
  }
  // turn a limb bone so its bind direction lies along d and its bind side toward s
  aim(n, d, s) {
    const J = this.j[n];
    basisQ(d, s, _q2).multiply(J.q0inv);
    this.rot(n, _q2);
  }
  // an arm to a grip: the fist's centre at `target`, its grip axis (the held bar, thumb side) along `axis`.
  // palmHint picks which way the palm faces (the axis flips to suit); pole is where the elbow goes.
  arm(s, target, axis, pole, palmHint = null) {
    const sg = s === 'L' ? -1 : 1, mirror = -sg; // palm = mirror * (d x a)
    const sh = this.j['arm' + s].p;
    const a = _aa.copy(axis).normalize();
    const d = _ad.subVectors(target, sh); d.addScaledVector(a, -d.dot(a));
    if (d.lengthSq() < 1e-8) d.set(0, -1, 0);
    d.normalize();
    const palm = _ap.crossVectors(d, a).multiplyScalar(mirror);
    if (palmHint && palm.dot(palmHint) < 0) { a.negate(); palm.negate(); }
    const wrist = _aw, elbow = this.elbow[s];
    for (let it = 0; it < 2; it++) {
      wrist.copy(target).addScaledVector(d, -FIST).addScaledVector(palm, -PALM);
      this.short[s] = solveJoint(sh, wrist, LU, LF, pole, elbow);
      // the hand continues the forearm, turned square to the bar
      d.subVectors(target, elbow); d.addScaledVector(a, -d.dot(a)).normalize();
      palm.crossVectors(d, a).multiplyScalar(mirror);
    }
    wrist.copy(target).addScaledVector(d, -FIST).addScaledVector(palm, -PALM);
    this.short[s] = solveJoint(sh, wrist, LU, LF, pole, elbow);
    this._limb('arm' + s, 'elbow' + s, 'fore' + s, sh, elbow, wrist, pole);
    // the twist bone takes half the turn from the forearm to the hand
    const fd = new THREE.Vector3().subVectors(wrist, elbow).normalize();
    const sf = this._side.clone();
    const sh2 = a.clone().negate().addScaledVector(fd, a.dot(fd)); // the hand's equivalent of the forearm's side
    if (sh2.lengthSq() > 1e-8) { sh2.normalize(); const mid = sf.clone().add(sh2); if (mid.lengthSq() > 1e-6) sf.copy(mid.normalize()); }
    this.aim('twist' + s, fd, sf);
    this.aim('hand' + s, d, a);
    return this.short[s];
  }
  // upper and lower bones from s through mid to end, and the helper between them at half the turn
  _limb(upper, helper, lower, s, mid, end, pole) {
    // the bend side: where the joint points, off the line from s to end
    const line = _v.subVectors(end, s).normalize();
    const side = _v2.subVectors(mid, s); side.addScaledVector(line, -side.dot(line));
    if (side.lengthSq() < 1e-8) side.subVectors(pole, s).addScaledVector(line, -_v3.subVectors(pole, s).dot(line));
    side.normalize();
    // the arm's bind side points where the elbow points (back); the leg's where the knee points (front)
    this._side = side.clone();
    this.aim(upper, _v3.subVectors(mid, s), side);
    this.aim(lower, _v3.subVectors(end, mid), side);
    _q.copy(this.j[upper].q).slerp(this.j[lower].q, 0.5);
    this.rot(helper, _q.clone());
  }
  // a leg to an ankle target, the knee toward pole; then the foot and toe frames (rotations from bind)
  leg(s, ankle, pole, footQ, toeQ = null) {
    const hip = this.j['thigh' + s].p, knee = new THREE.Vector3();
    const a = ankle.clone();
    const short = solveJoint(hip, a, LT, LS, pole, knee);
    this._limb('thigh' + s, 'knee' + s, 'shin' + s, hip, knee, a, pole);
    this.rot('foot' + s, footQ);
    this.rot('toe' + s, toeQ || footQ);
    return short;
  }
}

// ---------------------------------------------------------------------------------------------------------
export function buildFigure(mat, cols = FIGURE_COLORS) {
  const P = bindPositions();
  const bones = {}, joints = {};
  for (const n of BONES) { const b = new THREE.Bone(); b.name = n; bones[n] = b; }
  for (const n of BONES) {
    const par = PARENT[n];
    const J = new Joint(n, bones[n], par ? joints[par] : null, P[n]);
    joints[n] = J;
    if (par) { bones[par].add(bones[n]); joints[par].children.push(J); }
    bones[n].position.copy(J.off);
  }
  const group = new THREE.Group();
  const geo = buildMesh(cols, 1).geometry();
  const hatM = buildHat(cols);
  // occlusion in the bind pose, baked in the background after startup: the armpits, between the legs, the
  // collar, under the hat's brim and the PFD
  const hatG = hatM.geometry();
  {
    let body = null;
    const proxy = () => body || (body = trianglesOf(buildMesh(cols, 0.35).geometry()));
    bakeLater(() => {
      const hatTris = trianglesOf(hatG, new THREE.Matrix4().makeTranslation(P.head.x, P.head.y, P.head.z));
      const b = proxy(), all = new Float32Array(b.length + hatTris.length); all.set(b); all.set(hatTris, b.length);
      return { geo, tris: all, opts: { rays: 10, reach: 0.1, floor: 0.55 }, apply: (k) => applyAO(geo, k) };
    });
    bakeLater(() => ({ geo: hatG, tris: proxy(), opts: { rays: 8, reach: 0.05, floor: 0.6 }, apply: (k) => applyAO(hatG, k) }));
  }
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  group.add(bones.root, mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(BONES.map((n) => bones[n])));
  const hat = new THREE.Mesh(hatG, mat);
  hat.castShadow = true; hat.receiveShadow = true;
  bones.head.add(hat);
  const poser = new Poser(joints);
  return { group, mesh, hat, bones, joints, poser, bind: P };
}
