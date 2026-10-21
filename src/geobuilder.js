import * as THREE from 'three';

// Builds flat-shaded, vertex-coloured, non-indexed geometry triangle by triangle.
export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, col, ref) {
    // ref: a point inside the shape; the face is flipped so its normal points away from it
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    if (ref) {
      const mx = (a.x + b.x + c.x) / 3 - ref.x, my = (a.y + b.y + c.y) / 3 - ref.y, mz = (a.z + b.z + c.z) / 3 - ref.z;
      if (nx * mx + ny * my + nz * mz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    }
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) { this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); }
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
export function vary(hex, rng, dl = 0.06, ds = 0.05) {
  return new THREE.Color(hex).offsetHSL((rng() - 0.5) * 0.02, (rng() - 0.5) * ds, (rng() - 0.5) * dl);
}
