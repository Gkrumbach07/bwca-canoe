import * as THREE from 'three';
import { SLOTS, spriteUV } from './textures.js';

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
  // A branch along the polyline `pts` (Vector3s): rings square to the line and shared at the joints, so it
  // bends without cracks, tapering from r0 to r1, its frame carried along the line so the rings never twist.
  // `tip` closes the far end. Returns at(t) -> { p, d, r } (t 0..1 along its length: the point, the unit
  // direction there, the radius) for hanging sub-branches and foliage cards on it, and its length.
  branch(pts, r0, r1, n, col, rng, tip = false) {
    const m = pts.length, cum = [0];
    for (let i = 1; i < m; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = cum[m - 1] || 1, dirs = [];
    for (let i = 0; i < m; i++) dirs.push(pts[Math.min(m - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
    let u = (Math.abs(dirs[0].y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(dirs[0]).normalize();
    const ph = rng() * 6.28, rings = [];
    for (let i = 0; i < m; i++) {
      const d = dirs[i];
      u.addScaledVector(d, -u.dot(d)).normalize();
      const w = d.clone().cross(u), r = r0 + (r1 - r0) * (cum[i] / total), ring = [];
      for (let k = 0; k < n; k++) { const t = ph + (k / n) * Math.PI * 2; ring.push(pts[i].clone().addScaledVector(u, Math.cos(t) * r).addScaledVector(w, Math.sin(t) * r)); }
      rings.push(ring);
    }
    for (let i = 1; i < m; i++) this.tube(rings[i - 1], rings[i], col, pts[i - 1].clone().lerp(pts[i], 0.5));
    if (tip) this.fan(pts[m - 1].clone().addScaledVector(dirs[m - 1], r1 * 2), rings[m - 1], col, pts[m - 1].clone().addScaledVector(dirs[m - 1], -r1));
    const at = (t) => {
      const L = Math.min(1, Math.max(0, t)) * total;
      let i = 1;
      while (i < m - 1 && cum[i] < L) i++;
      const k = (L - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      return { p: pts[i - 1].clone().lerp(pts[i], k), d: pts[i].clone().sub(pts[i - 1]).normalize(), r: r0 + (r1 - r0) * Math.min(1, Math.max(0, t)) };
    };
    return { at, length: total };
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

// Foliage cards (docs/look.md, pivot pass 2): quads that sample one sprite of the foliage atlas
// (textures.js) and are alpha-tested in the material, indexed, each corner with its own colour and its own
// shading normal (bent away from the crown, not the card's face, so a crown of many cards shades as one
// soft volume). The caller hangs every card on a branch: `o` is where the sprite's anchor (the end of its
// twig) sits. Each corner also carries its offset from the anchor (aGrow), so the material can swell the
// cards about their anchors with distance and a far crown fills into one mass; `grow: false` writes zeros.
// `pair[k]` is, for the second card of a crossed pair, the index of the first (-1 otherwise): the two hang in
// the same place, so a bake can do one and give the other its values (vegetation.js finish).
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
export class CardBuilder {
  constructor({ grow = true } = {}) { this.p = []; this.n = []; this.c = []; this.uv = []; this.gr = []; this.ix = []; this.pair = []; this.grow = grow; }
  get count() { return this.p.length / 12; }
  // One card: sprite `slot`, its anchor at `o`, its s axis along the unit vector `ax` for `w` metres and its
  // t axis along `ay` for `h` metres. `nrm(p)` -> a unit Vector3 per corner; `col` a Color or col(p);
  // `k` scales how far it swells (a card anchored at one end reaches further from its anchor).
  card(slot, o, ax, ay, w, h, nrm, col, k = 1) {
    const [as, at] = SLOTS[slot].anchor, b = this.p.length / 3;
    for (const [s, t] of CORNERS) {
      const p = o.clone().addScaledVector(ax, (s - as) * w).addScaledVector(ay, (t - at) * h);
      const n = nrm(p), c = typeof col === 'function' ? col(p) : col, [u, v] = spriteUV(slot, s, t);
      this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.c.push(c.r, c.g, c.b); this.uv.push(u, v);
      const gk = this.grow ? k : 0;
      this.gr.push((p.x - o.x) * gk, (p.y - o.y) * gk, (p.z - o.z) * gk);
    }
    this.ix.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.pair.push(-1);
    return this;
  }
  // Two cards crossed on a shared s axis (`axis`): the first card's t axis is `side`, the second's is square
  // to both. For a sprite anchored at one end (a spray, a tuft) the shared axis is its twig, so the twig
  // painted on both cards draws one line in space, a branchlet seen from any side.
  cross(slot, o, axis, side, w, h, nrm, col, k = 1) {
    const s2 = axis.clone().cross(side).normalize(), first = this.count;
    this.card(slot, o, axis, side, w, h, nrm, col, k);
    this.card(slot, o, axis, s2, w, h, nrm, col, k);
    this.pair[first + 1] = first;
    return this;
  }
  // The geometry; `keep(k)`, if given, picks which cards go in (in order, four corners each).
  build(keep = null) {
    let { p, n, c, uv, gr, ix } = this;
    if (keep) {
      p = []; n = []; c = []; uv = []; gr = []; ix = [];
      for (let k = 0, m = 0; k < this.count; k++) {
        if (!keep(k)) continue;
        for (let i = k * 12; i < k * 12 + 12; i++) { p.push(this.p[i]); n.push(this.n[i]); c.push(this.c[i]); gr.push(this.gr[i]); }
        for (let i = k * 8; i < k * 8 + 8; i++) uv.push(this.uv[i]);
        const b = m++ * 4;
        ix.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aGrow', new THREE.Float32BufferAttribute(gr, 3));
    g.setIndex(ix);
    return g;
  }
}

// colour helper: hex base with a small random HSL wobble so faces are not uniform
const MUTE = 0.09; // saturation taken off every generated colour for a softer palette
export function vary(hex, rng, dl = 0.06, ds = 0.05) {
  return new THREE.Color(hex).offsetHSL((rng() - 0.5) * 0.02, (rng() - 0.5) * ds - MUTE, (rng() - 0.5) * dl + 0.015);
}
