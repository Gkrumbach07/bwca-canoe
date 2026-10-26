import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Mesher, V3, ringPts, frame, loft, applyAO, bakeLater, trianglesOf, smooth01 } from './loft.js';
import { paddleMesher } from './gear.js';

// A 17 ft Kevlar tandem tripper, the kind every BWCA outfitter rents: symmetric, a touch of rocker, a flat
// shallow-arch bottom turning through a firm bilge into sides with a little tumblehome, a sheer that sweeps
// up to rounded stems, ash gunwales, small walnut deck plates, an ash yoke with pads, a stern-quarter thwart
// and two caned seats on hangers. The Duluth packs lie in front of and behind the yoke and a spare paddle along the port
// side. Canoe frame: +x bow, +y up, +z starboard; the origin sits FLOAT_OFFSET above the water at rest.

export const HULL = {
  L: 5.2,          // overall length (17 ft)
  B0: 0.455,       // half beam at the widest
  K0: -0.295,      // keel amidships (draws ~0.145 m with the paddler and the pack)
  rocker: 0.035,   // keel rise at the ends before the stems
  S0: 0.075,       // sheer amidships: 0.37 m deep
  rise: 0.16,      // sheer rise to the stem tops (0.53 m above the keel)
  stemU: 0.80,     // where the keel starts up into the stems
  skin: 0.006,
};
export const HULL_COLORS = { out: 0x305542, in: 0x274533, ash: 0xc8a46f, ashDark: 0xa98757, deck: 0x6e4528, cane: 0xcbae74, caneDark: 0xa38650, pad: 0x2b2e2c };
export const SEATS = { stern: { x: -1.66, depth: 0.27 }, bow: { x: 1.58, depth: 0.25 }, drop: 0.115 };
export const YOKE_X = 0.0, THWART_X = -0.92, BOW_THWART_X = 1.05;

const half = HULL.L / 2;
const C = (h) => new THREE.Color(h);

export function sheerAt(u) { return HULL.S0 + HULL.rise * Math.pow(Math.abs(u), 2.2); }
export function keelAt(u) {
  const a = Math.min(1, Math.abs(u)), base = HULL.K0 + HULL.rocker * a * a;
  if (a <= HULL.stemU) return base;
  const k = (a - HULL.stemU) / (1 - HULL.stemU);
  return base + (sheerAt(1) - (HULL.K0 + HULL.rocker)) * Math.pow(k, 2.3);
}
export function halfBeam(u) { const a = Math.min(1, Math.abs(u)); return HULL.B0 * Math.pow(Math.max(0, 1 - a * a), 0.72); }

// the outer half-section at station u, t from the keel (0) to the sheer (1): { y, z } with z >= 0
export function section(u, t, out = { y: 0, z: 0 }) {
  const a = Math.min(1, Math.abs(u));
  const B = halfBeam(a), yk = keelAt(a), H = sheerAt(a) - yk;
  const end = smooth01(0.45, 0.95, a);
  const pa = 0.55 + 0.6 * end, pb = 1.35 - 0.4 * end;
  const th = (t * Math.PI) / 2;
  let z = B * Math.pow(Math.sin(th), pa);
  z -= 0.075 * (1 - smooth01(0.3, 0.75, a)) * B * Math.pow(smooth01(0.62, 1, t), 1.4); // tumblehome amidships
  z += 0.12 * smooth01(0.55, 0.9, a) * B * t * t;                                       // flare toward the stems
  out.y = yk + H * Math.pow(1 - Math.cos(th), pb);
  out.z = z;
  return out;
}
// the section's outward normal in the (z, y) plane at t
function sectionNormal(u, t) {
  const e = 0.004, a = section(u, Math.max(0, t - e)), b = section(u, Math.min(1, t + e));
  const dz = b.z - a.z, dy = b.y - a.y, l = Math.hypot(dz, dy) || 1;
  return { nz: dy / l, ny: -dz / l };
}
// the inner surface: the outer one moved in by the skin
function innerSection(u, t, out = { y: 0, z: 0 }) {
  section(u, t, out);
  const n = sectionNormal(u, t);
  out.z = Math.max(0, out.z - n.nz * HULL.skin); out.y -= n.ny * HULL.skin;
  return out;
}
const _s = { y: 0, z: 0 };
// half-width of the inside of the hull at (x, y) in canoe space (0 outside it or below the floor)
export function innerHalfWidth(x, y) {
  const u = x / half;
  if (Math.abs(u) >= 1) return 0;
  innerSection(u, 0, _s);
  if (y <= _s.y) return 0;
  innerSection(u, 1, _s);
  if (y >= _s.y) return _s.z;
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; innerSection(u, m, _s); if (_s.y < y) lo = m; else hi = m; }
  return innerSection(u, (lo + hi) / 2, _s).z;
}
export function floorAt(x) { return innerSection(x / half, 0, _s).y; }
export function sheerY(x) { return sheerAt(x / half); }
// the outside of the hull where it crosses height y at station x: { z, t } (z 0 if the hull is above y)
export function outerAt(x, y) {
  const u = x / half;
  section(u, 0, _s); if (y <= _s.y) return { z: 0, t: 0 };
  section(u, 1, _s); if (y >= _s.y) return { z: _s.z, t: 1 };
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; section(u, m, _s); if (_s.y < y) lo = m; else hi = m; }
  const t = (lo + hi) / 2;
  return { z: section(u, t, _s).z, t };
}

// stations along the hull, denser toward the stems
function stations(n) {
  const out = [], k = 0.94, s1 = Math.sin((Math.PI / 2) * k);
  for (let i = 0; i < n; i++) { const s = -1 + (2 * i) / (n - 1); out.push(Math.sin((Math.PI / 2) * k * s) / s1); }
  return out;
}

// The shell, outer and inner skins: rows of 2*nt+1 points from port sheer through the keel to starboard.
function shell(m, us, nt, col, inner) {
  const rows = [];
  for (const u of us) {
    const row = [];
    for (let k = -nt; k <= nt; k++) {
      const t = Math.abs(k) / nt;
      const s = inner ? innerSection(u, t) : section(u, t);
      row.push(m.add(V3(u * half, s.y, Math.sign(k) * s.z), col));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    for (let k = 0; k < a.length - 1; k++) {
      // outward faces for the outer skin (bow-ward rows, starboard-ward columns), inward for the inner
      if (inner) m.quad(a[k], a[k + 1], b[k + 1], b[k]); else m.quad(a[k], b[k], b[k + 1], a[k + 1]);
    }
  }
  return rows;
}

// a lofted bar between two points: rounded-rect sections, width w across (in the `across` direction) and
// thickness h; w and h may be functions of the parameter s in 0..1, off(s) a Vector3 offset
function bar(m, a, b, across, w, h, col, { n = 10, steps = 6, shape = 4, off = null, colAt = null } = {}) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length(); dir.normalize();
  const f = frame(dir, across);
  const rings = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps, c = a.clone().addScaledVector(dir, s * len);
    if (off) c.add(off(s));
    const ww = typeof w === 'function' ? w(s) : w, hh = typeof h === 'function' ? h(s) : h;
    rings.push(ringPts(c, f.ex, f.ey, n, [ww / 2, hh / 2], { shape, col: colAt ? colAt(s) : col }));
  }
  loft(m, rings, { capStart: true, capEnd: true });
}

function gunwales(m, col) {
  const us = stations(64).filter((u) => Math.abs(u) <= 0.985);
  for (const sg of [-1, 1]) {
    const rings = [];
    for (let i = 0; i < us.length; i++) {
      const u = us[i], x = u * half;
      const s = section(u, 1);
      const P = V3(x, s.y, sg * s.z);
      // the sheer's tangent in plan, and across it outboard
      const u2 = us[Math.min(us.length - 1, i + 1)], u1 = us[Math.max(0, i - 1)];
      const p2 = section(u2, 1), p1 = section(u1, 1);
      const T = V3((u2 - u1) * half, p2.y - p1.y, sg * (p2.z - p1.z)).normalize();
      const A = T.clone().cross(V3(0, 1, 0)).normalize().multiplyScalar(sg);
      const f = frame(T, A);
      const c = P.clone().addScaledVector(f.ex, -0.004).add(V3(0, -0.009, 0));
      rings.push(ringPts(c, f.ex, f.ey, 10, [0.0245, 0.0155], { shape: 3.2, col }));
    }
    loft(m, rings, { capStart: true, capEnd: true });
  }
}

function deckPlates(m, col) {
  for (const end of [-1, 1]) {
    const us = [0.865, 0.9, 0.93, 0.955, 0.975, 0.99];
    const top = [], bot = [];
    for (const u of us) {
      const s = section(u, 1), zi = Math.max(0.004, s.z - 0.026), y = s.y - 0.004;
      const rowT = [], rowB = [];
      for (const k of [-1, -0.5, 0, 0.5, 1]) {
        const crown = 0.006 * (1 - k * k);
        rowT.push(m.add(V3(end * u * half, y + crown, k * zi), col));
        rowB.push(m.add(V3(end * u * half, y - 0.014, k * zi), col));
      }
      top.push(rowT); bot.push(rowB);
    }
    for (let i = 0; i < us.length - 1; i++) for (let k = 0; k < 4; k++) {
      const a = top[i], b = top[i + 1], c = bot[i], d = bot[i + 1];
      if (end > 0) { m.quad(a[k], a[k + 1], b[k + 1], b[k]); m.quad(c[k], d[k], d[k + 1], c[k + 1]); }
      else { m.quad(a[k], b[k], b[k + 1], a[k + 1]); m.quad(c[k], c[k + 1], d[k + 1], d[k]); }
    }
    // the inner edge
    const a = top[0], c = bot[0];
    for (let k = 0; k < 4; k++) { if (end > 0) m.quad(a[k], c[k], c[k + 1], a[k + 1]); else m.quad(a[k], a[k + 1], c[k + 1], c[k]); }
  }
}

// a thwart or the yoke across the hull at x, hung under the inwales
function thwart(m, x, col, { yoke = false, padCol = null } = {}) {
  const y = sheerY(x) - 0.036, zi = innerHalfWidth(x, y) + 0.004;
  const w = yoke ? (s) => { const z = Math.abs(s * 2 - 1); return z > 0.9 ? 0.05 : z < 0.3 ? 0.068 : 0.062; } : (s) => { const z = Math.abs(s * 2 - 1); return z > 0.9 ? 0.05 : 0.04 + 0.006 * (1 - z); };
  const off = yoke ? (s) => { const z = (s * 2 - 1) * zi; return V3(Math.abs(z) < 0.13 ? 0.03 * (1 - (z / 0.13) ** 2) : 0, 0, 0); } : null;
  bar(m, V3(x, y, -zi), V3(x, y, zi), V3(1, 0, 0), w, 0.021, col, { steps: yoke ? 16 : 8, off, shape: 3.5 });
  if (yoke) for (const sg of [-1, 1]) {
    // the pads, on top of the yoke either side of the neck (they face the shoulders once the hull is over)
    bar(m, V3(x, y + 0.028, sg * 0.115), V3(x, y + 0.028, sg * 0.27), V3(1, 0, 0), 0.072, 0.035, padCol, { steps: 4, shape: 3 });
  }
}

function seat(m, sx, depth, cols) {
  const y = sheerY(sx) - SEATS.drop;
  const zi = Math.min(innerHalfWidth(sx - depth / 2, y), innerHalfWidth(sx + depth / 2, y)) - 0.012;
  const ash = C(cols.ash), caneA = C(cols.cane), caneB = C(cols.caneDark);
  // the frame: two cross rails and two side rails
  for (const dx of [-1, 1]) bar(m, V3(sx + dx * (depth / 2 - 0.016), y - 0.011, -zi), V3(sx + dx * (depth / 2 - 0.016), y - 0.011, zi), V3(1, 0, 0), 0.032, 0.024, ash, { steps: 4 });
  for (const sg of [-1, 1]) bar(m, V3(sx - depth / 2, y - 0.012, sg * (zi - 0.016)), V3(sx + depth / 2, y - 0.012, sg * (zi - 0.016)), V3(0, 0, 1), 0.032, 0.026, ash, { steps: 3 });
  // the cane: a woven panel, two tones alternating at shared vertices so the check blurs into a weave
  const x0 = sx - depth / 2 + 0.03, x1 = sx + depth / 2 - 0.03, z0 = -zi + 0.03, z1 = zi - 0.03;
  const nx = Math.max(2, Math.round((x1 - x0) / 0.03)), nz = Math.max(2, Math.round((z1 - z0) / 0.03));
  for (const [yy, up] of [[y - 0.006, true], [y - 0.01, false]]) {
    const g = [];
    for (let i = 0; i <= nx; i++) { const row = []; for (let j = 0; j <= nz; j++) row.push(m.add(V3(x0 + ((x1 - x0) * i) / nx, yy, z0 + ((z1 - z0) * j) / nz), (i + j) % 2 ? caneA : caneB)); g.push(row); }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (up) m.quad(g[i][j], g[i][j + 1], g[i + 1][j + 1], g[i + 1][j]); else m.quad(g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]);
    }
  }
  // hangers: dowels from the side rails up to the inwales
  const top = sheerY(sx) - 0.026;
  for (const dx of [-1, 1]) for (const sg of [-1, 1]) {
    const px = sx + dx * (depth / 2 - 0.04), pz = sg * (zi - 0.016);
    bar(m, V3(px, y - 0.02, pz), V3(px, top, pz), V3(1, 0, 0), 0.018, 0.018, C(cols.ashDark), { steps: 1, n: 8, shape: 2 });
  }
  return { y, zi };
}

// Duluth packs: the canvas portage pack of the Boundary Waters. A tall, flat bag of waxed canvas, fuller
// low on the front and flat on the back panel, its top rolled shut under a big flap that comes down over
// the top half of the front; two leather straps run down the flap to buckles on short tabs sewn to the bag,
// and two leather shoulder straps on the back panel run from the top down to the bottom corners, with a
// carry handle between them at the top. The gear pack is the big one; the food pack is a size smaller and
// a lighter canvas. Built standing on its own origin's middle: height along x (top +x), thickness along y
// (the back panel, which goes against the wearer's back, +y), width along z.
export const PACKS = {
  gear: { H: 0.62, W: 0.5, D: 0.22, canvas: 0x7a6f4d, flap: 0x655b3e },
  food: { H: 0.5, W: 0.42, D: 0.19, canvas: 0x96875f, flap: 0x7f7250 },
};
const PACK_LEATHER = 0x4e3322, PACK_LEATHER_DARK = 0x3d281b, PACK_BUCKLE = 0x9a9890;
const PACK_SHAPE = 3.0; // the bag's section: a soft rounded box

// The bag's surface. s: 0 at the bottom, 1 at the top; side +1 the back panel, -1 the front. The section at s
// is a superellipse rz(s) wide and ryBack / ryFront deep; at width z the face lies `depth` off the middle.
function packBody(P) {
  const smooth = smooth01;
  const end = (s) => (s < 0.015 ? 0.72 : s < 0.05 ? 0.93 : 1) * (s > 0.995 ? 0.8 : 1);           // the rounded bottom and the top's roll
  const top = (s) => 1 - 0.5 * smooth(0.8, 1, s);                                                 // the top is rolled shut, thinner
  const ryB = (s) => P.D * 0.36 * end(s) * top(s);
  const ryF = (s) => P.D * 0.64 * end(s) * top(s) * (0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, s / 0.85) ** 0.8)); // fuller low on the front
  const rz = (s) => (P.W / 2) * end(s) * (1 - 0.05 * smooth(0.8, 1, s));
  const x = (s) => -P.H / 2 + s * P.H;
  const depth = (s, z, side) => { const r = side > 0 ? ryB(s) : ryF(s), w = rz(s), u = Math.min(1, Math.abs(z) / w); return r * Math.pow(Math.max(0, 1 - Math.pow(u, PACK_SHAPE)), 1 / PACK_SHAPE); };
  const at = (s, z, side, out = V3()) => out.set(x(s), side * depth(s, z, side), z);
  // the outward normal there, by differences
  const normal = (s, z, side, out = V3()) => {
    const e = 0.004, a = at(s - e, z, side), b = at(s + e, z, side), c = at(s, z - e, side), d = at(s, z + e, side);
    out.crossVectors(b.sub(a), d.sub(c)).normalize();
    if (out.y * side < 0) out.negate();
    return out;
  };
  return { ryB, ryF, rz, x, depth, at, normal };
}

// a leather strap along a path on a surface: pts the path, ns the outward normals; w wide, t thick
function strapAlong(m, pts, ns, w, t, col, { lift = 0.002 } = {}) {
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    const T = V3().subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    const N = ns[i].clone().addScaledVector(T, -ns[i].dot(T)).normalize();
    const A = V3().crossVectors(N, T).normalize();
    const c = pts[i].clone().addScaledVector(N, lift + t / 2);
    rings.push(ringPts(c, A, N, 8, [w / 2, t / 2], { shape: 4, col }));
  }
  loft(m, rings, { capStart: true, capEnd: true });
}

function pack(m, P) {
  const canvas = C(P.canvas), flapC = C(P.flap), leather = C(PACK_LEATHER), leatherDark = C(PACK_LEATHER_DARK), buckle = C(PACK_BUCKLE);
  const B = packBody(P);
  // the bag: rings up its height, each a soft box fuller on the front (-y) than on the back panel (+y)
  const ss = [0, 0.012, 0.04, 0.09, 0.17, 0.26, 0.36, 0.46, 0.56, 0.66, 0.75, 0.82, 0.88, 0.93, 0.97, 0.99, 1];
  const rings = ss.map((s) => ringPts(V3(B.x(s), 0, 0), V3(0, 0, 1), V3(0, 1, 0), 28, (th) => [B.rz(s), Math.sin(th) < 0 ? B.ryF(s) : B.ryB(s)], { shape: PACK_SHAPE, col: canvas }));
  loft(m, rings, { capStart: true, capEnd: true });

  // The flap: one thick sheet of canvas from high on the back panel over the top and down the front to its edge,
  // lofted across the width. It lies on the bag's surface (taken a little in from the sides, so it stays flat
  // and overhangs the rounded corners the way stiff canvas does) and its lower corners are rounded up.
  const sEdge = P.H > 0.55 ? 0.5 : 0.46, gap = 0.004, thick = 0.009;
  const flapProfile = (z, outer) => {
    const zz = Math.min(Math.abs(z), 0.8 * P.W / 2) * Math.sign(z);
    const u = Math.abs(z) / (P.W / 2), se = sEdge + 0.07 * Math.pow(Math.min(1, u), 5);
    const pts = [];
    const push = (s, side) => { const p = B.at(s, zz, side), n = B.normal(Math.min(0.996, s), zz, side); pts.push({ p: p.addScaledVector(n, gap + (outer ? thick : 0)), z }); };
    for (const s of [0.86, 0.92, 0.96, 0.985]) push(s, 1);
    // over the top: the roll, from the back panel's edge to the front's
    const yb = B.depth(1, zz, 1), yf = B.depth(1, zz, -1), xt = P.H / 2 + gap + (outer ? thick : 0) + 0.004;
    for (const k of [0.6, 0.2, -0.2, -0.6]) pts.push({ p: V3(xt + 0.006 * (1 - k * k), k > 0 ? k * yb : k * yf, zz), z });
    const n = 9;
    for (let i = 0; i < n; i++) { const s = 0.985 - (0.985 - se) * (i / (n - 1)); push(s, -1); }
    for (const q of pts) q.p.z = q.z;
    return pts.map((q) => q.p);
  };
  const flapRings = [];
  const zs = [-1, -0.97, -0.88, -0.7, -0.45, -0.2, 0, 0.2, 0.45, 0.7, 0.88, 0.97, 1].map((k) => k * P.W / 2 * 1.03);
  for (const z of zs) {
    const out = flapProfile(z, true), inn = flapProfile(z, false).reverse();
    flapRings.push([...out, ...inn].map((p) => ({ p, c: flapC })));
  }
  loft(m, flapRings, { capStart: true, capEnd: true });
  // the flap's straps: down the flap from over the top to buckles on short tabs sewn to the front
  const flapAt = (s, z) => { // a point on the flap's outer face (front, s >= the edge) and its normal
    const p = B.at(s, z, -1), n = B.normal(s, z, -1);
    return { p: p.addScaledVector(n, gap + thick), n };
  };
  const sBuckle = sEdge - 0.13;
  for (const sg of [-1, 1]) {
    const z = sg * P.W * 0.21;
    const pts = [], ns = [];
    // over the top, then down the front of the flap and past its edge onto the bag
    for (const k of [0.5, 0, -0.5]) { const yb = B.depth(1, z, 1), yf = B.depth(1, z, -1); pts.push(V3(P.H / 2 + gap + thick + 0.01 - 0.004 * Math.abs(k), k > 0 ? k * yb : k * yf, z)); ns.push(V3(1, 0, 0)); }
    for (let i = 0; i <= 8; i++) { const s = 0.97 - (0.97 - (sEdge + 0.012)) * (i / 8); const q = flapAt(s, z); pts.push(q.p); ns.push(q.n); }
    for (const s of [sEdge - 0.02, sEdge - 0.06, sBuckle + 0.02]) { const p = B.at(s, z, -1), n = B.normal(s, z, -1); pts.push(p.addScaledVector(n, 0.004)); ns.push(n); }
    strapAlong(m, pts, ns, P.W * 0.075, 0.006, leather);
    // the buckle: a small square frame where the strap meets its tab
    const bp = B.at(sBuckle, z, -1), bn = B.normal(sBuckle, z, -1);
    const T = V3(1, 0, 0).addScaledVector(bn, -bn.x).normalize(), A = V3().crossVectors(bn, T).normalize();
    for (const [dx, dz, w, h] of [[0.016, 0, 0.006, P.W * 0.1], [-0.016, 0, 0.006, P.W * 0.1], [0, P.W * 0.045, 0.034, 0.006], [0, -P.W * 0.045, 0.034, 0.006]]) {
      const c = bp.clone().addScaledVector(T, dx).addScaledVector(A, dz).addScaledVector(bn, 0.012);
      bar(m, c.clone().addScaledVector(bn, -0.005), c.clone().addScaledVector(bn, 0.003), T, w, h, buckle, { steps: 1, n: 6, shape: 4 });
    }
    // the tab below it, sewn to the bag
    const tp = [], tn = [];
    for (const s of [sBuckle - 0.012, sBuckle - 0.06, sBuckle - 0.11]) { const p = B.at(s, z, -1), n = B.normal(s, z, -1); tp.push(p); tn.push(n); }
    strapAlong(m, tp, tn, P.W * 0.08, 0.005, leatherDark, { lift: 0.001 });
  }
  // the shoulder straps on the back panel: from near the top, side by side, out and down to the bottom corners,
  // standing a little off the panel in the middle where the padding is
  for (const sg of [-1, 1]) {
    const pts = [], ns = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const u = i / n, s = lerpN(0.9, 0.05, u), z = sg * lerpN(0.05, 0.36, Math.pow(u, 1.6)) * P.W;
      const p = B.at(s, z, 1), nn = B.normal(Math.max(0.02, s), z, 1);
      pts.push(p.addScaledVector(nn, 0.012 * Math.sin(Math.PI * Math.min(1, u * 1.15)))); ns.push(nn);
    }
    strapAlong(m, pts, ns, 0.052, 0.011, leather);
  }
  // the carry handle at the top of the back panel
  {
    const pts = [], ns = [];
    for (let i = 0; i <= 6; i++) { const u = i / 6, z = lerpN(-0.055, 0.055, u); const p = B.at(0.965, z, 1), nn = B.normal(0.965, z, 1); pts.push(p.addScaledVector(nn, 0.026 * Math.sin(Math.PI * u))); ns.push(nn); }
    strapAlong(m, pts, ns, 0.03, 0.008, leatherDark);
  }
}
const lerpN = (a, b, t) => a + (b - a) * t;

// The coarse proxy the occlusion is cast against: low-res skins and boxes for the fittings.
function proxyTris(parts) {
  const m = new Mesher();
  const us = stations(26);
  shell(m, us, 5, C(0), true); // the inside is all that occludes anything
  for (const p of parts) bar(m, p.a, p.b, p.across, p.w, p.h, C(0), { n: 4, steps: 1, shape: 2 });
  return trianglesOf(m.geometry());
}

export function buildHullGeometry(cols = HULL_COLORS) {
  const us = stations(52), nt = 14;
  // the skins: creased where the two sides meet sharply (the stems), smooth across the bottom
  const sm = new Mesher(), im = new Mesher();
  shell(sm, us, nt, C(cols.out), false);
  shell(im, us, nt, C(cols.in), true);
  // the fittings: smooth parts, each its own little volume
  const fm = new Mesher();
  gunwales(fm, C(cols.ash));
  deckPlates(fm, C(cols.deck));
  thwart(fm, YOKE_X, C(cols.ash), { yoke: true, padCol: C(cols.pad) });
  thwart(fm, THWART_X, C(cols.ash));
  thwart(fm, BOW_THWART_X, C(cols.ash));
  const st = seat(fm, SEATS.stern.x, SEATS.stern.depth, cols);
  const bw = seat(fm, SEATS.bow.x, SEATS.bow.depth, cols);
  // the spare paddle along the port bilge, blade forward, face down
  const sp = paddleMesher();
  const mat = new THREE.Matrix4().makeBasis(V3(0, 0, 1), V3(-1, 0, 0), V3(0, -1, 0)); // paddle x -> z, -y -> +x (blade forward)
  mat.setPosition(-1.08, floorAt(0) + 0.055, -0.22);
  fm.merge(sp, mat);
  // occlusion inside, cast against a coarse proxy: under the seats and thwarts, along the bilge, round the pack
  const parts = [
    { a: V3(SEATS.stern.x, st.y - 0.01, -st.zi), b: V3(SEATS.stern.x, st.y - 0.01, st.zi), across: V3(1, 0, 0), w: SEATS.stern.depth, h: 0.02 },
    { a: V3(SEATS.bow.x, bw.y - 0.01, -bw.zi), b: V3(SEATS.bow.x, bw.y - 0.01, bw.zi), across: V3(1, 0, 0), w: SEATS.bow.depth, h: 0.02 },
  ];
  for (const x of [YOKE_X, THWART_X, BOW_THWART_X]) { const y = sheerY(x) - 0.036, zi = innerHalfWidth(x, y); parts.push({ a: V3(x, y, -zi), b: V3(x, y, zi), across: V3(1, 0, 0), w: 0.06, h: 0.022 }); }
  const outGeo = sm.geometry(), inGeo = im.geometry(), fitGeo = fm.geometry();
  // the skins creased where the two sides meet sharply (the stems), smooth across the bottom
  const crease = (52 * Math.PI) / 180;
  const geo = mergeGeometries([toCreasedNormals(outGeo, crease), toCreasedNormals(inGeo, crease), fitGeo.toNonIndexed()], false);
  // the occlusion is baked on the welded parts in the background after startup and laid into the merged
  // colours through the indices they were expanded from
  let proxy = null;
  const getProxy = () => proxy || (proxy = proxyTris(parts));
  const nOut = outGeo.index.count, nIn = inGeo.index.count;
  bakeLater(() => ({ geo: inGeo, tris: getProxy(), opts: { rays: 10, reach: 0.2, floor: 0.45 }, apply: (k) => applyAO(geo, k, nOut, nIn, inGeo.index.array) }));
  bakeLater(() => ({ geo: fitGeo, tris: getProxy(), opts: { rays: 10, reach: 0.16, floor: 0.5 }, apply: (k) => applyAO(geo, k, nOut + nIn, fitGeo.index.count, fitGeo.index.array) }));
  geo.computeBoundingSphere();
  return geo;
}

// A pack on its own (PACKS.gear or PACKS.food), and where they lie in the hull: flat, the flap and its buckles
// up, the top toward the bow; the gear pack in front of the yoke, the food pack behind it, over the spare paddles
// (the solo paddler kneels at the stern seat, so the weight goes forward of him). lift: the pack's middle above
// the floor there.
export const PACK_AT = { x: 0.74, lift: 0.098 };
export const PACK2_AT = { x: -0.5, lift: 0.094 };
export function buildPackGeometry(kind = 'gear') {
  const m = new Mesher();
  pack(m, PACKS[kind] || PACKS.gear);
  const g = m.geometry();
  // a little occlusion of its own: under the straps and the flap
  bakeLater(() => ({ geo: g, tris: trianglesOf(g), opts: { rays: 6, reach: 0.05, floor: 0.6 }, apply: (k) => applyAO(g, k) }));
  return g;
}

// The lid: an invisible deck at the gunwales that writes depth only, so the water never shows inside the hull.
export function buildLidGeometry() {
  const m = new Mesher(), col = C(0);
  const us = stations(30);
  let prev = null;
  for (const u of us) {
    const s = innerSection(u, 1), y = s.y - 0.03;
    const row = [m.add(V3(u * half, y, -s.z), col), m.add(V3(u * half, y, s.z), col)];
    if (prev) m.quad(prev[0], row[0], row[1], prev[1]);
    prev = row;
  }
  return m.geometry();
}

// ---------------------------------------------------------------------------------------------------------------------
// p2 A: other people's canoes (actors.js). The rental fleets' three hulls, each built once (buildHullGeometry with its
// palette) and shared by every party canoe of that colour, on the rig's own material: a dented grey aluminium Grumman
// with aluminium gunwales and seats, a gold Kevlar tripper with ash, and the Forest Service's olive green with dark
// gunwales. (The player's own is HULL_COLORS's green.)
export const HULL_PALETTES = {
  aluminium: { out: 0xa4a9ac, in: 0x8b9093, ash: 0x9da2a5, ashDark: 0x7d8285, deck: 0x8a8f92, cane: 0x8a8f92, caneDark: 0x6d7275, pad: 0x2b2e2c },
  kevlar: { ...HULL_COLORS, out: 0xc0954c, in: 0xae8541 },
  forest: { ...HULL_COLORS, out: 0x46542f, in: 0x3b4729, ash: 0x34362f, ashDark: 0x2a2c26, deck: 0x34362f },
};
// The far hull: 60 triangles (the skin as six bays of four facets round from gunwale to gunwale, and a flat deck at the
// sheer in the inside's colour, so from above it reads as an open canoe), non-indexed with flat normals and vertex
// colours. Drawn beyond 250 m, where a hull is a few pixels.
export function buildFarHullGeometry(cols = HULL_COLORS) {
  const us = [-1, -0.72, -0.38, 0, 0.38, 0.72, 1], ts = [1, 0.45, 0, 0.45, 1], sides = [-1, -1, 0, 1, 1];
  const out = C(cols.out), inn = C(cols.in), pos = [], col = [];
  const at = (u, k) => { const s = section(u, ts[k]); return [u * half, s.y, sides[k] * s.z]; };
  const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b); };
  for (let i = 0; i < us.length - 1; i++) {
    for (let k = 0; k < 4; k++) { // outward, as the shell's outer skin winds
      const a0 = at(us[i], k), a1 = at(us[i], k + 1), b0 = at(us[i + 1], k), b1 = at(us[i + 1], k + 1);
      tri(a0, b0, b1, out); tri(a0, b1, a1, out);
    }
    const p0 = at(us[i], 0), s0 = at(us[i], 4), p1 = at(us[i + 1], 0), s1 = at(us[i + 1], 4); // the deck, facing up
    tri(p0, s0, s1, inn); tri(p0, s1, p1, inn);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
