// What a solid thing of the woods is to the walker: its own drawn geometry, stood where the tile draws it (tiles.js
// treesNear builds one when the walker comes near, from the worker's record and the geometry its bin draws). The
// rocks, the outcrops, the scree, the cliff modules of the bluffs, the down logs and the stumps all come this way.
// A geometry is cut into its parts, the connected pieces it was built from (partsOf: a boulder's stones, an
// outcrop's slabs, a cliff's columns and blocks, a log's stem and its root plate), each of them convex (rocks.js
// and cliffs.js cut their blocks from planes; a stem is a tapered prism), so each is held off by its own hull and
// a bay between two columns of a cliff stays open. Questions:
//   heightAt(x, z)   the top of the solid straight above or below (x, z): the highest of its triangles there, or
//                    -Infinity off it. The walker stands on it (player.js supportAt) when it is no more than a step
//                    above the feet.
//   push(x, z, r, level, head, out)   a circle (the walker, radius r) set clear of every part that rises above the
//                    plane y = level (a step over the feet) and starts below `head` (overhead rock is walked under):
//                    each part seen from above as the convex hull of its vertices over the plane and of its edges'
//                    crossings of it. A low slab or a small rock is stepped onto, a boulder or a log stops him at
//                    its visible edge, wherever it bulges.
//   overlaps(x, z, r, level, head)    the same test without the push
//   outline(level)   the whole solid above the plane as one hull (the old single-hull answer, for anyone reading it)
// And pushOut, a circle set clear of one such hull.

// A geometry's parts: its vertices joined by its triangles, equal positions welded (a builder's flat-shaded faces
// share no index), as { verts, tris } (tris: the parts' triangles as vertex index triples). Cached per geometry.
const PARTS = new WeakMap();
export function partsOf(geo) {
  let parts = PARTS.get(geo);
  if (parts) return parts;
  const P = geo.getAttribute('position').array, n = P.length / 3, I = geo.index ? geo.index.array : null, nt = I ? I.length / 3 : n / 3;
  const up = new Int32Array(n);
  for (let i = 0; i < n; i++) up[i] = i;
  const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) up[a] = b; };
  for (let t = 0; t < nt; t++) { const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2; join(a, b); join(b, c); }
  const weld = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
    const j = weld.get(k);
    if (j === undefined) weld.set(k, i); else join(i, j);
  }
  const byRoot = new Map();
  const of = (i) => { const r = find(i); let q = byRoot.get(r); if (!q) byRoot.set(r, (q = { verts: [], tris: [] })); return q; };
  for (let i = 0; i < n; i++) of(i).verts.push(i);
  for (let t = 0; t < nt; t++) { const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2; of(a).tris.push(a, b, c); }
  parts = [...byRoot.values()].map((q) => ({ verts: Uint32Array.from(q.verts), tris: Uint32Array.from(q.tris) }));
  PARTS.set(geo, parts);
  return parts;
}

// A down log's stem in its own frame (the geometry lies along x, vegetation.js log): the biggest part's extent along
// x, the middle of its section and its mean radius, for anyone who wants the log as a capsule (camera.js). Cached.
const STEMS = new WeakMap();
export function stemOf(geo) {
  let s = STEMS.get(geo);
  if (s) return s;
  const P = geo.getAttribute('position').array, parts = partsOf(geo);
  let stem = parts[0];
  for (const q of parts) if (q.verts.length > stem.verts.length) stem = q;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const i of stem.verts) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  s = { x0, x1, y: (y0 + y1) / 2, z: (z0 + z1) / 2, r: (y1 - y0 + z1 - z0) / 4 };
  STEMS.set(geo, s);
  return s;
}

const _out = { x: 0, z: 0 };

// A down log's stem is rings of vertices along its own x (vegetation.js log: a bowed, leaning prism of four rings), so
// the whole stem is not convex: its hull above a step's plane bridged the sag between a high butt and a high top, and a
// log lying along a slope held the walker along its whole length where its drawn top was below a step (the fb join,
// 2026-10-24: Space only hopped there). Cut into the frusta between consecutive rings, each convex, it holds him where
// it is drawn. Parts with fewer than three rings stay whole. Cached per part.
const RINGS = new WeakMap();
function ringSegments(q, P) {
  let segs = RINGS.get(q);
  if (segs) return segs;
  segs = [q];
  if (q.verts.length >= 12) {
    const xs = Array.from(q.verts, (i) => P[i * 3]).sort((a, b) => a - b), cuts = [];
    let sum = xs[0], n = 1;
    for (let k = 1; k < xs.length; k++) { if (xs[k] - xs[k - 1] > 0.2) { cuts.push(sum / n); sum = 0; n = 0; } sum += xs[k]; n++; }
    cuts.push(sum / n);
    if (cuts.length >= 3) {
      const ringOf = (i) => { const x = P[i * 3]; let b = 0; for (let k = 1; k < cuts.length; k++) if (Math.abs(x - cuts[k]) < Math.abs(x - cuts[b])) b = k; return b; };
      const out = [], T = q.tris;
      for (let k = 0; k + 1 < cuts.length; k++) {
        const tris = [];
        for (let t = 0; t < T.length; t += 3) {
          const a = ringOf(T[t]), b = ringOf(T[t + 1]), c = ringOf(T[t + 2]);
          if (Math.min(a, b, c) >= k && Math.max(a, b, c) <= k + 1) tris.push(T[t], T[t + 1], T[t + 2]);
        }
        if (tris.length) out.push({ verts: Uint32Array.from(new Set(tris)), tris: Uint32Array.from(tris) });
      }
      if (out.length > 1) segs = out;
    }
  }
  RINGS.set(q, segs);
  return segs;
}

export class RockShape {
  // geo: the variant's full geometry; rec: the worker's record (tiles.js, tile-worker.js collisionOf) at offset o: x, y,
  // z (tile-local), reach, its geometry key, species, then the instance matrix's three columns; ox, oz: the tile's
  // corner. minVerts: parts with no more vertices than this are left out (a log's limbs, a stump's roots: thin sticks
  // the walker passes)
  constructor(geo, rec, o, ox, oz, { minVerts = 0, rings = false } = {}) {
    const P = geo.getAttribute('position').array, n = P.length / 3;
    const x0 = rec[o] + ox, y0 = rec[o + 1], z0 = rec[o + 2] + oz;
    const a = rec[o + 6], b = rec[o + 7], c = rec[o + 8], d = rec[o + 9], e = rec[o + 10], f = rec[o + 11], g = rec[o + 12], h = rec[o + 13], k = rec[o + 14];
    const v = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
      v[i * 3] = x0 + a * px + d * py + g * pz; v[i * 3 + 1] = y0 + b * px + e * py + h * pz; v[i * 3 + 2] = z0 + c * px + f * py + k * pz;
    }
    this.v = v;
    let parts = partsOf(geo);
    if (minVerts > 0) { const kept = parts.filter((q) => q.verts.length > minVerts); if (kept.length) parts = kept; }
    if (rings) parts = parts.flatMap((q) => ringSegments(q, P));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = -Infinity, minY = Infinity;
    this.parts = parts.map((q) => {
      const s = { verts: q.verts, tris: q.tris, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, maxY: -Infinity, hulls: new Map() };
      for (const i of q.verts) {
        const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
        if (x < s.minX) s.minX = x; if (x > s.maxX) s.maxX = x; if (z < s.minZ) s.minZ = z; if (z > s.maxZ) s.maxZ = z;
        if (y < s.minY) s.minY = y; if (y > s.maxY) s.maxY = y;
      }
      minX = Math.min(minX, s.minX); maxX = Math.max(maxX, s.maxX); minZ = Math.min(minZ, s.minZ); maxZ = Math.max(maxZ, s.maxZ);
      minY = Math.min(minY, s.minY); maxY = Math.max(maxY, s.maxY);
      return s;
    });
    this.minX = minX; this.maxX = maxX; this.minZ = minZ; this.maxZ = maxZ; this.maxY = maxY; this.minY = minY;
    this.hulls = new Map();
  }

  // how far (x, z) lies outside the solid's bounds from above (0 inside them)
  boundsDist(x, z) {
    const dx = Math.max(this.minX - x, 0, x - this.maxX), dz = Math.max(this.minZ - z, 0, z - this.maxZ);
    return Math.hypot(dx, dz);
  }

  heightAt(x, z) {
    if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return -Infinity;
    const v = this.v;
    let top = -Infinity;
    for (const p of this.parts) {
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ || p.maxY <= top) continue;
      const T = p.tris;
      for (let t = 0; t < T.length; t += 3) {
        const i0 = T[t] * 3, i1 = T[t + 1] * 3, i2 = T[t + 2] * 3;
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
    }
    return top;
  }

  // one part above the plane y = level, from above: the hull of its vertices over the plane and its edges' crossings
  // (each edge is met twice, from its two triangles: harmless for a hull); cached by the level to 5 cm
  partHull(p, level) {
    if (p.maxY <= level) return null;
    const key = Math.round(level * 20);
    let hull = p.hulls.get(key);
    if (hull !== undefined) return hull;
    const lv = key / 20, v = this.v, pts = [];
    for (const i of p.verts) if (v[i * 3 + 1] > lv) pts.push(v[i * 3], v[i * 3 + 2]);
    const cross = (i, j) => {
      const yi = v[i * 3 + 1] - lv, yj = v[j * 3 + 1] - lv;
      if ((yi > 0) === (yj > 0)) return;
      const t = yi / (yi - yj);
      pts.push(v[i * 3] + (v[j * 3] - v[i * 3]) * t, v[i * 3 + 2] + (v[j * 3 + 2] - v[i * 3 + 2]) * t);
    };
    if (p.minY < lv) { const T = p.tris; for (let t = 0; t < T.length; t += 3) { cross(T[t], T[t + 1]); cross(T[t + 1], T[t + 2]); cross(T[t + 2], T[t]); } }
    hull = pts.length >= 6 ? convexHull(pts) : null;
    if (p.hulls.size > 24) p.hulls.clear();
    p.hulls.set(key, hull);
    return hull;
  }

  // The circle (x, z, r) clear of the parts that rise above `level` and start below `head`: into out, true when any
  // held it. One pass over the parts (the caller goes round again for what one push sends into another).
  push(x, z, r, level, head, out) {
    out.x = x; out.z = z;
    if (this.maxY <= level || this.minY >= head || this.boundsDist(x, z) >= r) return false;
    let hit = false;
    for (const p of this.parts) {
      if (p.maxY <= level || p.minY >= head) continue;
      if (out.x < p.minX - r || out.x > p.maxX + r || out.z < p.minZ - r || out.z > p.maxZ + r) continue;
      const hull = this.partHull(p, level);
      if (hull && pushOut(out.x, out.z, hull, r, _out)) { out.x = _out.x; out.z = _out.z; hit = true; }
    }
    return hit;
  }

  // does a circle (x, z, r) reach into any part rising above `level` (and starting below `head`) by more than `slack`?
  overlaps(x, z, r, level, head = Infinity, slack = 0.01) {
    if (this.maxY <= level || this.minY >= head || this.boundsDist(x, z) >= r - slack) return false;
    for (const p of this.parts) {
      if (p.maxY <= level || p.minY >= head) continue;
      if (x < p.minX - r || x > p.maxX + r || z < p.minZ - r || z > p.maxZ + r) continue;
      const hull = this.partHull(p, level);
      if (hull && pushOut(x, z, hull, r - slack, _out)) return true;
    }
    return false;
  }

  // the whole solid above the plane as one hull (counter-clockwise x, z pairs), or null
  outline(level) {
    if (this.maxY <= level) return null;
    const key = Math.round(level * 20);
    let hull = this.hulls.get(key);
    if (hull !== undefined) return hull;
    const pts = [];
    for (const p of this.parts) { const h = this.partHull(p, level); if (h) for (let i = 0; i < h.length; i++) pts.push(h[i]); }
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

// A trunk's radius at a height, from the geometry its bin draws: the stem's rings (the part holding the lowest vertex
// near the axis, its vertices grouped by height) as [y, r] pairs at unit scale, r the mean of each ring's corners
// to its middle less a little (the faces of a five-sided stem lie nearer than its corners). Cached per geometry.
const TRUNKS = new WeakMap();
export function trunkProfile(geo) {
  let prof = TRUNKS.get(geo);
  if (prof) return prof;
  const P = geo.getAttribute('position').array;
  let best = null, span = -1;
  for (const q of partsOf(geo)) {
    let y0 = Infinity, y1 = -Infinity;
    for (const i of q.verts) { const y = P[i * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (y0 > 0.2) continue;
    let near = true;
    for (const i of q.verts) if (P[i * 3 + 1] < y0 + 0.3 && Math.hypot(P[i * 3], P[i * 3 + 2]) > 1.5) { near = false; break; }
    if (near && y1 - y0 > span) { span = y1 - y0; best = q; }
  }
  const rings = [];
  if (best) {
    const vs = [...best.verts].sort((a, b) => P[a * 3 + 1] - P[b * 3 + 1]);
    let cur = null;
    for (const i of vs) {
      const y = P[i * 3 + 1];
      if (!cur || y - cur.y0 > 0.08) rings.push((cur = { y0: y, v: [] }));
      cur.v.push(i);
    }
  }
  prof = [];
  for (const g of rings) {
    if (g.v.length < 3) continue;
    let cx = 0, cz = 0, cy = 0;
    for (const i of g.v) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; }
    cx /= g.v.length; cy /= g.v.length; cz /= g.v.length;
    let r = 0;
    for (const i of g.v) r += Math.hypot(P[i * 3] - cx, P[i * 3 + 2] - cz);
    prof.push(cy, (r / g.v.length) * 0.92);
  }
  TRUNKS.set(geo, prof);
  return prof;
}
// the radius of a profile at unit height y (clamped to its first and last rings), or NaN for an empty one
export function profileAt(prof, y) {
  if (prof.length < 2) return NaN;
  if (y <= prof[0] || prof.length < 4) return prof[1];
  for (let i = 2; i < prof.length; i += 2) {
    if (y <= prof[i]) { const t = (y - prof[i - 2]) / Math.max(1e-6, prof[i] - prof[i - 2]); return prof[i - 1] + (prof[i + 1] - prof[i - 1]) * t; }
  }
  return prof[prof.length - 1];
}
