// What a rock is to the walker: its own drawn geometry, stood where the tile draws it (tiles.js treesNear builds one
// when the walker comes near a rock, from the worker's record and the vegetation kit's variant). Two questions:
//   heightAt(x, z)   the top of the rock straight above or below (x, z): the highest of its triangles there, or
//                    -Infinity off it. The walker stands on it (player.js supportAt) when it is no more than a step
//                    above the feet.
//   outline(level)   the rock above the plane y = level seen from above: the convex hull of its vertices over the
//                    plane and of its edges' crossings of it, as x, z pairs counter-clockwise (or null). The walker is
//                    held off that outline at the height of a step over the feet, so a low slab or a small rock is
//                    stepped onto and a boulder stops him at its visible edge, wherever it bulges. The rocks are
//                    convex solids (rocks.js cuts them from planes); a stack of slabs is held by its hull.
// And pushOut, a circle (the walker) set clear of such an outline.

export class RockShape {
  // geo: the variant's full geometry; rec: the worker's record (tiles.js, tile-worker.js collisionOf) at offset o;
  // ox, oz: the tile's corner
  constructor(geo, rec, o, ox, oz) {
    const P = geo.getAttribute('position').array, n = P.length / 3;
    const x0 = rec[o] + ox, y0 = rec[o + 1], z0 = rec[o + 2] + oz;
    const a = rec[o + 6], b = rec[o + 7], c = rec[o + 8], d = rec[o + 9], e = rec[o + 10], f = rec[o + 11], g = rec[o + 12], h = rec[o + 13], k = rec[o + 14];
    const v = new Float32Array(n * 3);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
      const x = x0 + a * px + d * py + g * pz, y = y0 + b * px + e * py + h * pz, z = z0 + c * px + f * py + k * pz;
      v[i * 3] = x; v[i * 3 + 1] = y; v[i * 3 + 2] = z;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; if (y > maxY) maxY = y;
    }
    this.v = v;
    this.idx = geo.index ? geo.index.array : null;
    this.tris = this.idx ? this.idx.length / 3 : n / 3;
    this.minX = minX; this.maxX = maxX; this.minZ = minZ; this.maxZ = maxZ; this.maxY = maxY;
    this.hulls = new Map();
  }

  heightAt(x, z) {
    if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return -Infinity;
    const v = this.v, I = this.idx;
    let top = -Infinity;
    for (let t = 0; t < this.tris; t++) {
      const i0 = (I ? I[t * 3] : t * 3) * 3, i1 = (I ? I[t * 3 + 1] : t * 3 + 1) * 3, i2 = (I ? I[t * 3 + 2] : t * 3 + 2) * 3;
      const ax = v[i0], az = v[i0 + 2], bx = v[i1], bz = v[i1 + 2], cx = v[i2], cz = v[i2 + 2];
      // the triangle's bounds first (most are nowhere near)
      if ((x < ax && x < bx && x < cx) || (x > ax && x > bx && x > cx) || (z < az && z < bz && z < cz) || (z > az && z > bz && z > cz)) continue;
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-12) continue;
      const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l2 = 1 - l0 - l1;
      if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
      const y = l0 * v[i0 + 1] + l1 * v[i1 + 1] + l2 * v[i2 + 1];
      if (y > top) top = y;
    }
    return top;
  }

  outline(level) {
    if (this.maxY <= level) return null;
    const key = Math.round(level * 20);
    let hull = this.hulls.get(key);
    if (hull !== undefined) return hull;
    const lv = key / 20, v = this.v, I = this.idx, pts = [];
    const n = v.length / 3;
    for (let i = 0; i < n; i++) if (v[i * 3 + 1] > lv) pts.push(v[i * 3], v[i * 3 + 2]);
    // where the edges cross the plane (each edge is met twice, from its two triangles: harmless for a hull)
    const cross = (i, j) => {
      const yi = v[i * 3 + 1] - lv, yj = v[j * 3 + 1] - lv;
      if ((yi > 0) === (yj > 0)) return;
      const t = yi / (yi - yj);
      pts.push(v[i * 3] + (v[j * 3] - v[i * 3]) * t, v[i * 3 + 2] + (v[j * 3 + 2] - v[i * 3 + 2]) * t);
    };
    for (let t = 0; t < this.tris; t++) {
      const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
      cross(a, b); cross(b, c); cross(c, a);
    }
    hull = pts.length >= 6 ? convexHull(pts) : null;
    if (this.hulls.size > 24) this.hulls.clear();
    this.hulls.set(key, hull);
    return hull;
  }
}

// Andrew's monotone chain over x, z pairs: the hull counter-clockwise (in x, z), as a Float32Array of pairs
export function convexHull(flat) {
  const n = flat.length / 2, order = Array.from({ length: n }, (_, i) => i);
  order.sort((i, j) => flat[i * 2] - flat[j * 2] || flat[i * 2 + 1] - flat[j * 2 + 1]);
  const X = (i) => flat[i * 2], Z = (i) => flat[i * 2 + 1];
  const turn = (o, a, b) => (X(a) - X(o)) * (Z(b) - Z(o)) - (Z(a) - Z(o)) * (X(b) - X(o));
  const lower = [], upper = [];
  for (const i of order) { while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], i) <= 1e-9) lower.pop(); lower.push(i); }
  for (let k = order.length - 1; k >= 0; k--) { const i = order[k]; while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], i) <= 1e-9) upper.pop(); upper.push(i); }
  const h = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (h.length < 3) return null;
  const out = new Float32Array(h.length * 2);
  h.forEach((i, k) => { out[k * 2] = X(i); out[k * 2 + 1] = Z(i); });
  return out;
}

// A circle of radius r at (x, z) set clear of a convex outline (counter-clockwise x, z pairs): the point it moves to,
// into out, and true; or false when it was clear already. Inside, it leaves by the nearest edge.
export function pushOut(x, z, hull, r, out) {
  const n = hull.length / 2;
  let inside = true, best = Infinity, bx = 0, bz = 0, nearIn = Infinity, ex = 0, ez = 0, ed = 0;
  for (let i = 0; i < n; i++) {
    const ax = hull[i * 2], az = hull[i * 2 + 1], cx = hull[((i + 1) % n) * 2], cz = hull[((i + 1) % n) * 2 + 1];
    const dx = cx - ax, dz = cz - az, L2 = dx * dx + dz * dz || 1e-12, L = Math.sqrt(L2);
    // outward normal of a counter-clockwise edge (x right, z down the page): (dz, -dx) / L
    const nx = dz / L, nz = -dx / L, side = (x - ax) * nx + (z - az) * nz;
    if (side > 0) inside = false;
    if (-side < nearIn) { nearIn = -side; ex = nx; ez = nz; ed = side; }
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / L2));
    const px = ax + dx * t, pz = az + dz * t, d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < best) { best = d2; bx = px; bz = pz; }
  }
  if (inside) { const k = r - ed; out.x = x + ex * k; out.z = z + ez * k; return true; }
  const d = Math.sqrt(best);
  if (d >= r) return false;
  const k = (r - d) / Math.max(d, 1e-6);
  out.x = x + (x - bx) * k; out.z = z + (z - bz) * k;
  return true;
}
