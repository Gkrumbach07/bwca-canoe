import * as THREE from 'three';

// Geometry helpers for the canoe, the paddler and their gear: an indexed mesher (shared vertices, so
// normals come out smooth), closed rings lofted into tubes, and an occlusion bake that casts against a
// coarse proxy instead of the full mesh, so a figure of a few thousand vertices bakes in a few
// milliseconds. Everything is vertex-coloured for the look's Lambert (shading.js).

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// up to four [bone, weight] pairs, merged, the strongest kept, normalised
function packWeights(w) {
  if (!w || !w.length) return [[0, 1], [0, 0], [0, 0], [0, 0]];
  const m = new Map();
  for (const [b, x] of w) if (x > 0) m.set(b, (m.get(b) || 0) + x);
  const a = [...m.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
  const s = a.reduce((t, p) => t + p[1], 0) || 1;
  while (a.length < 4) a.push([0, 0]);
  return a.map(([b, x]) => [b, x / s]);
}

export class Mesher {
  constructor(skinned = false) { this.p = []; this.c = []; this.i = []; this.si = []; this.sw = []; this.skinned = skinned; }
  get count() { return this.p.length / 3; }
  add(pos, col, w = null) {
    this.p.push(pos.x, pos.y, pos.z); this.c.push(col.r, col.g, col.b);
    if (this.skinned) for (const [b, x] of packWeights(w)) { this.si.push(b); this.sw.push(x); }
    return this.count - 1;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
  // a closed ring of points (arrays of { p, c, w }) -> vertex indices
  ring(pts) { return pts.map((q) => this.add(q.p, q.c, q.w)); }
  // join two rings of equal length; flip turns the faces round
  bridge(a, b, flip = false) {
    const n = a.length;
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      if (flip) this.quad(a[k], b[k], b[k1], a[k1]); else this.quad(a[k], a[k1], b[k1], b[k]);
    }
  }
  // close a ring with a fan to a new centre vertex
  fan(ring, centre, col, w, flip = false) {
    const c = this.add(centre, col, w), n = ring.length;
    for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; if (flip) this.tri(c, ring[k1], ring[k]); else this.tri(c, ring[k], ring[k1]); }
    return c;
  }
  // append another mesher's triangles (same skinning) under a matrix
  merge(o, m = null) {
    const base = this.count, v = new THREE.Vector3(), col = new THREE.Color();
    for (let k = 0; k < o.count; k++) {
      v.set(o.p[k * 3], o.p[k * 3 + 1], o.p[k * 3 + 2]); if (m) v.applyMatrix4(m);
      col.setRGB(o.c[k * 3], o.c[k * 3 + 1], o.c[k * 3 + 2]);
      this.p.push(v.x, v.y, v.z); this.c.push(col.r, col.g, col.b);
      if (this.skinned) for (let j = 0; j < 4; j++) { this.si.push(o.si[k * 4 + j] || 0); this.sw.push(o.sw[k * 4 + j] || (j ? 0 : 1)); }
    }
    for (const x of o.i) this.i.push(x + base);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.skinned) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    }
    g.setIndex(this.i);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// Points of a closed ring of n around centre c in the plane of the unit vectors ex, ey. r(theta) returns
// [rx, ry] (or a number); `shape` is a superellipse exponent (2 an ellipse, higher a rounded box). colour and
// weights may be values or functions of theta.
export function ringPts(c, ex, ey, n, r, { shape = 2, col, w = null, off = null } = {}) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const th = (k / n) * Math.PI * 2;
    const cs = Math.cos(th), sn = Math.sin(th);
    const e = 2 / shape;
    const cx = Math.sign(cs) * Math.pow(Math.abs(cs), e), sy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
    let rr = typeof r === 'function' ? r(th) : r;
    if (!Array.isArray(rr)) rr = [rr, rr];
    const p = c.clone().addScaledVector(ex, cx * rr[0]).addScaledVector(ey, sy * rr[1]);
    if (off) p.add(off(th));
    out.push({ p, c: typeof col === 'function' ? col(th, p) : col, w: typeof w === 'function' ? w(th, p) : w });
  }
  return out;
}

// A frame for a ring whose axis is t: ex is `ref` made perpendicular to t, ey = t x ex.
export function frame(t, ref) {
  const ex = ref.clone().addScaledVector(t, -ref.dot(t));
  if (ex.lengthSq() < 1e-8) ex.set(1, 0, 0).addScaledVector(t, -t.x);
  ex.normalize();
  const ey = new THREE.Vector3().crossVectors(t, ex).normalize();
  return { ex, ey };
}

// Loft a list of rings (arrays of points) into a tube, faces outward (checked against the ring centres);
// capStart / capEnd close the ends with a fan.
export function loft(m, rings, { capStart = false, capEnd = false } = {}) {
  const idx = rings.map((r) => m.ring(r));
  const ctr = (r) => r.reduce((s, q) => s.add(q.p), new THREE.Vector3()).multiplyScalar(1 / r.length);
  // orientation: the first quad's normal against the outward direction
  const a = rings[0], b = rings[1], c0 = ctr(a);
  const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(a[1].p, a[0].p), new THREE.Vector3().subVectors(b[0].p, a[0].p));
  const out = new THREE.Vector3().subVectors(a[0].p, c0);
  const flip = n.dot(out) < 0; // the unflipped winding faces where (a1 - a0) x (b0 - a0) points
  for (let i = 0; i < idx.length - 1; i++) m.bridge(idx[i], idx[i + 1], flip);
  if (capStart) { const r = rings[0]; m.fan(idx[0], ctr(r), r[0].c, r[0].w, !flip); }
  if (capEnd) { const r = rings[rings.length - 1]; m.fan(idx[idx.length - 1], ctr(r), r[0].c, r[0].w, flip); }
  return idx;
}

// ---------------------------------------------------------------------------------------------------------
// Occlusion baked per vertex (the same cosine-weighted hemisphere as occlusion.js), cast against a proxy:
// a Float32Array of triangles (9 floats each), usually a coarse version of the same thing. The vertex
// colours are darkened in place: floor .. 1.
const DIRS = new Map();
function directions(n) {
  let d = DIRS.get(n);
  if (d) return d;
  d = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let bits = i; bits = ((bits << 16) | (bits >>> 16)) >>> 0;
    bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
    bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
    bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
    bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
    const u = (i + 0.5) / n, v = bits / 4294967296, r = Math.sqrt(u), phi = 2 * Math.PI * v;
    d[i * 3] = r * Math.cos(phi); d[i * 3 + 1] = r * Math.sin(phi); d[i * 3 + 2] = Math.sqrt(Math.max(0, 1 - u));
  }
  DIRS.set(n, d);
  return d;
}

// the triangles of an indexed or flat geometry as a flat array, optionally under a matrix
export function trianglesOf(geo, matrix = null) {
  const P = geo.getAttribute('position'), I = geo.getIndex();
  const n = I ? I.count : P.count, out = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    v.fromBufferAttribute(P, I ? I.getX(k) : k); if (matrix) v.applyMatrix4(matrix);
    out[k * 3] = v.x; out[k * 3 + 1] = v.y; out[k * 3 + 2] = v.z;
  }
  return out;
}

// The bake as a resumable job: next(deadline) works through the vertices until performance.now() passes the
// deadline and returns true once every vertex has its factor in k (floor .. 1).
export function makeAO(geo, tris, { rays = 16, reach = 0.25, floor = 0.45, ground = null, power = 1 } = {}) {
  const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal');
  const P = pos.array, N = nrm.array, count = pos.count;
  const k = new Float32Array(count).fill(1);
  const nt = tris.length / 9, T = new Float32Array(nt * 13);
  for (let t = 0; t < nt; t++) {
    const o = t * 13, s = t * 9;
    const ax = tris[s], ay = tris[s + 1], az = tris[s + 2], bx = tris[s + 3], by = tris[s + 4], bz = tris[s + 5], cx = tris[s + 6], cy = tris[s + 7], cz = tris[s + 8];
    T[o] = ax; T[o + 1] = ay; T[o + 2] = az;
    T[o + 3] = bx - ax; T[o + 4] = by - ay; T[o + 5] = bz - az; T[o + 6] = cx - ax; T[o + 7] = cy - ay; T[o + 8] = cz - az;
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
    T[o + 9] = mx; T[o + 10] = my; T[o + 11] = mz;
    T[o + 12] = Math.sqrt(Math.max((ax - mx) ** 2 + (ay - my) ** 2 + (az - mz) ** 2, (bx - mx) ** 2 + (by - my) ** 2 + (bz - mz) ** 2, (cx - mx) ** 2 + (cy - my) ** 2 + (cz - mz) ** 2));
  }
  const D = directions(rays), R = reach, eps = R * 0.01 + 1e-4;
  // a spatial hash of the triangles (cells one reach across), so each vertex only tests the ones near it
  const inv = 1 / R, grid = new Map();
  const key = (i, j, kk) => ((i * 73856093) ^ (j * 19349663) ^ (kk * 83492791)) | 0;
  for (let t = 0; t < nt; t++) {
    const o = t * 13, r = T[o + 12];
    const i0 = Math.floor((T[o + 9] - r) * inv), i1 = Math.floor((T[o + 9] + r) * inv);
    const j0 = Math.floor((T[o + 10] - r) * inv), j1 = Math.floor((T[o + 10] + r) * inv);
    const k0 = Math.floor((T[o + 11] - r) * inv), k1 = Math.floor((T[o + 11] + r) * inv);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let kk = k0; kk <= k1; kk++) {
      const h = key(i, j, kk); let list = grid.get(h); if (!list) { list = []; grid.set(h, list); } list.push(t);
    }
  }
  const stamp = new Int32Array(nt).fill(-1), cand = new Int32Array(nt);
  let v = 0;
  function vertex() {
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
    let nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let tx, ty, tz;
    if (Math.abs(ny) < 0.9) { tx = nz; ty = 0; tz = -nx; } else { tx = 0; ty = -nz; tz = ny; }
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    const ox = px + nx * eps, oy = py + ny * eps, oz = pz + nz * eps;
    let nc = 0;
    const ci = Math.floor(px * inv), cj = Math.floor(py * inv), ck = Math.floor(pz * inv);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let kk = ck - 1; kk <= ck + 1; kk++) {
      const list = grid.get(key(i, j, kk));
      if (list) for (const t of list) {
        if (stamp[t] === v) continue;
        stamp[t] = v;
        // only triangles that come within reach, on the side the vertex faces
        const o = t * 13, qx = T[o + 9] - px, qy = T[o + 10] - py, qz = T[o + 11] - pz, rad = T[o + 12];
        const d2 = qx * qx + qy * qy + qz * qz, lim = R + rad;
        if (d2 > lim * lim || qx * nx + qy * ny + qz * nz < -rad) continue;
        cand[nc++] = t;
      }
    }
    let occ = 0;
    for (let r = 0; r < rays; r++) {
      const u = D[r * 3], w = D[r * 3 + 1], h = D[r * 3 + 2];
      const dx = tx * u + bx * w + nx * h, dy = ty * u + by * w + ny * h, dz = tz * u + bz * w + nz * h;
      let best = R;
      if (ground !== null && dy < -1e-4) { const tg = (oy - ground) / -dy; if (tg > 0 && tg < best) best = tg; }
      for (let c = 0; c < nc; c++) {
        const o = cand[c] * 13;
        const qx = T[o + 9] - ox, qy = T[o + 10] - oy, qz = T[o + 11] - oz, rad = T[o + 12];
        const along = qx * dx + qy * dy + qz * dz;
        if (along < -rad || along - rad > best) continue;
        if (qx * qx + qy * qy + qz * qz - along * along > rad * rad) continue;
        const e1x = T[o + 3], e1y = T[o + 4], e1z = T[o + 5], e2x = T[o + 6], e2y = T[o + 7], e2z = T[o + 8];
        const sx = dy * e2z - dz * e2y, sy = dz * e2x - dx * e2z, sz = dx * e2y - dy * e2x;
        const det = e1x * sx + e1y * sy + e1z * sz;
        if (det > -1e-9 && det < 1e-9) continue;
        const iv = 1 / det, fx = ox - T[o], fy = oy - T[o + 1], fz = oz - T[o + 2];
        const bu = (fx * sx + fy * sy + fz * sz) * iv;
        if (bu < 0 || bu > 1) continue;
        const gx = fy * e1z - fz * e1y, gy = fz * e1x - fx * e1z, gz = fx * e1y - fy * e1x;
        const bv = (dx * gx + dy * gy + dz * gz) * iv;
        if (bv < 0 || bu + bv > 1) continue;
        const th = (e2x * gx + e2y * gy + e2z * gz) * iv;
        if (th > eps && th < best) best = th;
      }
      if (best < R) occ += 1 - (best / R) * (best / R);
    }
    k[v] = floor + (1 - floor) * Math.pow(1 - occ / rays, power);
  }
  return {
    k,
    next(deadline = Infinity) {
      while (v < count) { vertex(); v++; if ((v & 31) === 0 && performance.now() > deadline) return v >= count; }
      return true;
    },
  };
}

// multiply colours by baked factors: target vertex i takes k[map ? map[i] : i] (map: the index the target was
// expanded from, for a geometry made non-indexed or creased after the bake)
export function applyAO(target, k, start = 0, count = null, map = null) {
  const col = target.getAttribute('color'), C = col.array, cs = col.itemSize;
  const n = count ?? (map ? map.length : k.length);
  for (let i = 0; i < n; i++) { const f = k[map ? map[i] : i]; const o = (start + i) * cs; C[o] *= f; C[o + 1] *= f; C[o + 2] *= f; }
  col.needsUpdate = true;
}

// the bake, all at once, into the geometry's own colours
export function bakeAO(geo, tris, opts = {}) {
  const job = makeAO(geo, tris, opts);
  job.next();
  applyAO(geo, job.k);
  return geo;
}

// the bake in the background: a few milliseconds at a time after startup (behind the title card); `job` is a
// function returning { geo, tris, opts, apply(k) } so even the proxy is built later
const queue = [];
let pumping = false;
function pump() {
  pumping = true;
  const deadline = performance.now() + 5;
  while (queue.length && performance.now() < deadline) {
    const q = queue[0];
    if (!q.job) { const s = q.make(); q.spec = s; q.job = makeAO(s.geo, s.tris, s.opts); }
    if (q.job.next(deadline)) { queue.shift(); q.spec.apply(q.job.k); }
  }
  if (queue.length) setTimeout(pump, 0); else pumping = false;
}
export function bakeLater(make) {
  queue.push({ make, job: null, spec: null });
  if (!pumping) setTimeout(pump, 0);
}
export function bakesPending() { return queue.length; }

export const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
