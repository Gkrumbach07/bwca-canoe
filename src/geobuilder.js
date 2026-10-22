import * as THREE from 'three';

const COOL = new THREE.Color(0x1f2a38); // what the shade side of a trunk leans toward: darker and bluer
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Builds flat-shaded, vertex-coloured, non-indexed geometry triangle by triangle.
export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, col, ref) {
    // ref: a point inside the shape; the face is flipped so its normal points away from it.
    // col: one colour for the face, or a function of the vertex for a gradient. A vertex object keeps the
    // same colour in every face it is part of, so gradients still weld smooth (see rocks.js smoothToon).
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    if (ref) {
      const mx = (a.x + b.x + c.x) / 3 - ref.x, my = (a.y + b.y + c.y) / 3 - ref.y, mz = (a.z + b.z + c.z) / 3 - ref.z;
      if (nx * mx + ny * my + nz * mz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    }
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const f = typeof col === 'function';
    for (const p of [a, b, c]) { const k = f ? col(p) : col; this.n.push(nx, ny, nz); this.c.push(k.r, k.g, k.b); }
  }
  quad(a, b, c, d, col, ref) { this.tri(a, b, c, col, ref); this.tri(a, c, d, col, ref); }
  // ring of n points around the y axis at height y, with radial/vertical jitter
  ring(cx, y, cz, r, n, rng, jitter = 0, phase = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = phase + (i / n) * Math.PI * 2;
      const rr = r * (1 + (rng() - 0.5) * jitter);
      pts.push(new THREE.Vector3(cx + Math.cos(t) * rr, y + (rng() - 0.5) * jitter * r, cz + Math.sin(t) * rr));
    }
    return pts;
  }
  fan(apex, ring, col, ref) { for (let i = 0; i < ring.length; i++) this.tri(apex, ring[i], ring[(i + 1) % ring.length], col, ref); }
  tube(r0, r1, col, ref) { for (let i = 0; i < r0.length; i++) { const j = (i + 1) % r0.length; this.quad(r0[i], r0[j], r1[j], r1[i], col, ref); } }
  cone(cx, y, cz, r, h, n, col, rng, jitter = 0.25) {
    const ring = this.ring(cx, y, cz, r, n, rng, jitter, rng() * 6.28);
    const apex = new THREE.Vector3(cx + (rng() - 0.5) * r * 0.3, y + h, cz + (rng() - 0.5) * r * 0.3);
    const ref = new THREE.Vector3(cx, y + h * 0.3, cz);
    this.fan(apex, ring, col, ref);
    return this;
  }
  trunk(cx, y, cz, r0, r1, h, n, col, rng, lean = 0.0) {
    const b = this.ring(cx, y, cz, r0, n, rng, 0.15);
    const t = this.ring(cx + lean, y + h, cz, r1, n, rng, 0.15);
    this.tube(b, t, col, new THREE.Vector3(cx + lean / 2, y + h / 2, cz));
    return this;
  }
  // A trunk in segments along a gently curved axis. `lean` [x, z] is where the top ends up off plumb, `bow`
  // [x, z] a bulge at mid height (a bowed stem), `wig` a smaller second wobble so no two stems bend alike,
  // `flare` widens the base ring into a buttress, `shade` leans the side away from +x toward COOL so even a
  // flat-lit trunk reads round, `jag` roughens the top ring (a broken top) and `cap` closes it. Rings at the
  // fractions in `ts`. Returns the axis sampler `at(t)` ({ x, y, z, r }) for hanging limbs and scars on the
  // surface, and the top ring.
  stem(cx, y, cz, r0, r1, h, n, col, rng, o = {}) {
    const { lean = [0, 0], bow = [0, 0], wig = 0.02, flare = 0.3, shade = 0.3, ts = [0, 0.1, 0.55, 1], jag = 0, cap = false } = o;
    const base = col instanceof THREE.Color ? col : new THREE.Color(col);
    const wx = (rng() - 0.5) * wig * h, wz = (rng() - 0.5) * wig * h, ph = rng() * 6.28;
    const at = (t) => {
      const s = Math.sin(Math.PI * t), s2 = Math.sin(2 * Math.PI * t + ph) * t;
      const r = (r1 + (r0 - r1) * (1 - t) ** 1.1) * (1 + flare * Math.max(0, 1 - t / 0.1) ** 2);
      return { x: cx + lean[0] * t + bow[0] * s + wx * s2, y: y + h * t, z: cz + lean[1] * t + bow[1] * s + wz * s2, r };
    };
    const phase = rng() * 6.28;
    const rings = ts.map((t, k) => {
      const a = at(t), last = k === ts.length - 1, pts = [];
      for (let i = 0; i < n; i++) {
        const th = phase + (i / n) * Math.PI * 2, rr = a.r * (1 + (rng() - 0.5) * 0.14);
        const p = V(a.x + Math.cos(th) * rr, a.y + (rng() - 0.5) * 0.14 * a.r + (last && jag ? (rng() - 0.7) * jag : 0), a.z + Math.sin(th) * rr);
        const lit = 0.5 + 0.5 * Math.cos(th); // the +x side is the lit side
        p.c = base.clone().lerp(COOL, shade * (1 - lit) + 0.12 * (1 - t) ** 2);
        pts.push(p);
      }
      return pts;
    });
    const vc = (p) => p.c;
    for (let k = 1; k < rings.length; k++) {
      const a = at(ts[k - 1]), b = at(ts[k]);
      this.tube(rings[k - 1], rings[k], vc, V((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
    }
    if (cap) { const a = at(1), top = rings[rings.length - 1]; const apex = V(a.x, a.y + (jag ? -jag * 0.3 : 0.05), a.z); apex.c = base.clone().lerp(COOL, 0.15); this.fan(apex, top, vc, V(a.x, a.y - h * 0.1, a.z)); }
    return { at, top: rings[rings.length - 1] };
  }
  // A branch: a tapered tube with its rings square to the axis, from p0 to p1; `tip` closes the far end.
  limb(p0, p1, r0, r1, n, col, rng, tip = false) {
    const d = p1.clone().sub(p0).normalize();
    const u = (Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(d).normalize(), w = d.clone().cross(u);
    const ringAt = (c, r) => { const pts = [], ph = rng() * 6.28; for (let i = 0; i < n; i++) { const t = ph + (i / n) * Math.PI * 2, rr = r * (1 + (rng() - 0.5) * 0.2); pts.push(c.clone().addScaledVector(u, Math.cos(t) * rr).addScaledVector(w, Math.sin(t) * rr)); } return pts; };
    const a = ringAt(p0, r0), b = ringAt(p1, r1);
    this.tube(a, b, col, p0.clone().lerp(p1, 0.5));
    if (tip) this.fan(p1.clone().addScaledVector(d, r1 * 1.5), b, col, p1.clone().addScaledVector(d, -r1));
    return this;
  }
  // A dark lens on the bark: a diamond of two triangles lying just proud of a stem's surface at height
  // fraction t and angle a (a birch's branch scar).
  scar(at, t, a, w, hgt, col) {
    const s = at(t), nx = Math.cos(a), nz = Math.sin(a), cx = s.x + nx * s.r * 1.04, cz = s.z + nz * s.r * 1.04;
    const tx = -nz, tz = nx, ref = V(s.x, s.y, s.z);
    const L = V(cx - tx * w, s.y, cz - tz * w), R = V(cx + tx * w, s.y, cz + tz * w), T = V(cx, s.y + hgt, cz), B = V(cx, s.y - hgt * 0.7, cz);
    this.tri(L, T, R, col, ref); this.tri(L, R, B, col, ref);
    return this;
  }
  // deformed icosahedron blob, scaled by (sx, sy, sz)
  blob(cx, cy, cz, r, col, rng, jitter = 0.3, sx = 1, sy = 1, sz = 1) {
    const t = (1 + Math.sqrt(5)) / 2;
    const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map(([x, y, z]) => { const L = Math.hypot(x, y, z); const s = r * (1 + (rng() - 0.5) * jitter); return new THREE.Vector3(cx + (x / L) * s * sx, cy + (y / L) * s * sy, cz + (z / L) * s * sz); });
    const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const ref = new THREE.Vector3(cx, cy, cz);
    for (const [a, b, c] of F) this.tri(V[a], V[b], V[c], col, ref);
    return this;
  }
  // A foliage cluster: a bipyramid on a jittered ring of n points, 2n triangles where a blob is 20, scaled by
  // (sx, sy, sz). `colAt(p, t)` colours each vertex, t = 0 at the underside apex, about 0.5 on the ring, 1 at
  // the top, so a cluster is lit above and dark below whatever the crown around it does.
  lump(cx, cy, cz, r, n, rng, jitter, sx, sy, sz, colAt) {
    const ry = cy - r * sy * 0.08, ring = this.ring(cx, ry, cz, r, n, rng, jitter, rng() * 6.28);
    for (const p of ring) { p.x = cx + (p.x - cx) * sx; p.z = cz + (p.z - cz) * sz; p.c = colAt(p, 0.45 + ((p.y - ry) / (r * sy)) * 0.6); }
    const top = V(cx + (rng() - 0.5) * r * 0.35 * sx, cy + r * sy * (0.85 + (rng() - 0.5) * jitter), cz + (rng() - 0.5) * r * 0.35 * sz);
    const bot = V(cx + (rng() - 0.5) * r * 0.2 * sx, cy - r * sy * (0.62 + (rng() - 0.5) * jitter * 0.5), cz + (rng() - 0.5) * r * 0.2 * sz);
    top.c = colAt(top, 1); bot.c = colAt(bot, 0);
    const vc = (p) => p.c, ref = V(cx, cy, cz);
    this.fan(top, ring, vc, ref); this.fan(bot, ring, vc, ref);
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// colour helper: hex base with a small random HSL wobble so faces are not uniform
const MUTE = 0.09; // saturation taken off every generated colour for a softer palette
export function vary(hex, rng, dl = 0.06, ds = 0.05) {
  return new THREE.Color(hex).offsetHSL((rng() - 0.5) * 0.02, (rng() - 0.5) * ds - MUTE, (rng() - 0.5) * dl + 0.015);
}
