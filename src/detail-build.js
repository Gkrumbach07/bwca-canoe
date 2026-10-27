// LiDAR detail, the worker's half (docs/detail.md; the main thread's is detail.js). The tile workers build one detail
// chunk at a time (tile-worker.js, message 'chunk'): a 640 m chunk of the 2 m lattice or a 1280 m chunk of the 5 m
// lattice (scripts/detail-bake.mjs cuts them), as a terrain mesh with three heights per vertex: its own level's, the
// 5 m surface's (a 2 m chunk only) and the 10 m mesh's. The main thread blends them per vertex by which neighbours are
// in (detail.js blend), so a chunk eases into whatever coarser ground it meets over its last BLEND metres and is
// exactly that ground on its edge, without being built again when a neighbour comes or goes.
//   - the 10 m tile still says where the water is, what the ground is made of and how it is painted (its channels,
//     the site, the forest's shade); the LiDAR only moves the land up and down
//   - under water (the 10 m shore distance below 0) the ground is the 10 m mesh's (the lake bed), and within 2 m
//     inland it rises from the waterline to the LiDAR, so a face at the shore stands straight out of the water
//   - deep water (every sample of a 10 m quad over 30 m from the shore) is drawn as the 10 m mesh's own two triangles
//   - a skirt hangs from the chunk's edge to close the slits where two lattices meet (the T-junctions of a 2 m edge
//     against a 5 m one, a one-unit difference between neighbours' shared samples)
import { lerp, smoothstep } from './rng.js';
import { meshHeightAt, groundPre, bedPre, bedGrain, splatAt } from './terrain-build.js';

const HEADER = 56, MAGIC = 0x43445742; // 'BWDC' (scripts/detail-bake.mjs)
const DEEP = 30; // metres from the shore past which a 10 m quad of lake bed is drawn as the 10 m mesh draws it
export const SKIRT = { 2: 2, 5: 3 }; // metres a chunk's skirt hangs below its edge, by level

// A chunk file (gzip already undone): the reference decoder is scripts/detail-bake.mjs decodeChunk.
export function decodeChunk(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a detail chunk');
  const n = dv.getUint16(20, true), pred = dv.getUint16(22, true), r = dv.getFloat32(24, true), unit = dv.getFloat32(28, true), base = dv.getFloat32(32, true);
  const d = new Int16Array(buf, HEADER, n * n), v = new Int32Array(n * n);
  for (let l = 0; l < n; l++) for (let k = 0; k < n; k++) {
    const q = l * n + k;
    let p = 0;
    if (pred === 2) p = l && k ? v[q - 1] + v[q - n] - v[q - n - 1] : k ? v[q - 1] : l ? v[q - n] : 0;
    else if (pred === 1) p = k ? v[q - 1] : l ? v[q - n] : 0;
    v[q] = p + d[q];
  }
  const h = new Float32Array(n * n);
  for (let q = 0; q < n * n; q++) h[q] = base + v[q] * unit;
  return { n, r, x0: dv.getFloat64(40, true), z0: dv.getFloat64(48, true), h };
}

// A lattice's height at a point as its mesh draws it: two triangles per square, split alternately; NaN off it.
// L: { n, r, x0, z0, v } (x0, z0: sample (0, 0)).
export function latticeAt(L, x, z) {
  const fx = (x - L.x0) / L.r, fz = (z - L.z0) / L.r, K = Math.floor(fx), M = Math.floor(fz);
  if (K < 0 || M < 0 || K >= L.n - 1 || M >= L.n - 1) return NaN;
  const u = fx - K, w = fz - M, V = L.v, n = L.n, q = M * n + K;
  const h00 = V[q], h10 = V[q + 1], h01 = V[q + n], h11 = V[q + n + 1];
  if (((K + M) & 1) === 0) return u + w <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * w : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - w);
  return u >= w ? h00 + (h10 - h00) * u + (h11 - h10) * w : h00 + (h01 - h00) * w + (h11 - h01) * u;
}

// The ground a chunk's samples draw: the LiDAR on land, the 10 m mesh under water and at the waterline, easing up to
// the LiDAR over the first 2 m inland, and never under its own water's level near the shore (where the LiDAR's shore
// lies a few metres inland of the game's, its low ground would sit under the water with no water drawn over it).
// Returns { L (the lattice of the drawn heights), base (the 10 m mesh at each sample), sd (the shore distance) }.
export function chunkGround(grid, D, cache) {
  const n = D.n, r = D.r, N = n * n;
  const v = new Float32Array(N), base = new Float32Array(N), sdA = new Float32Array(N);
  for (let l = 0; l < n; l++) {
    const z = D.z0 + l * r;
    for (let k = 0; k < n; k++) {
      const x = D.x0 + k * r, q = l * n + k;
      const sd = grid.shoreAt(x, z), b = meshHeightAt(grid, x, z, cache);
      base[q] = b; sdA[q] = sd;
      if (sd <= 0) { v[q] = b; continue; }
      let h = D.h[q];
      if (sd < 2) h = lerp(b, h, smoothstep(0, 2, sd));
      if (sd < 30) { const lv = grid.levelAt(x, z, 3); if (lv === lv) h = Math.max(h, lv + 0.04 * Math.min(sd, 5)); }
      v[q] = h;
    }
  }
  return { L: { n, r, x0: D.x0, z0: D.z0, v }, base, sd: sdA };
}

// The mesh of one chunk. grid: the 10 m tile's (its own grid, halo'd); site: its Site; shade: its forest shade (per
// local cell); G: chunkGround's for this chunk; P: chunkGround's for the 5 m chunk over it (a 2 m chunk), else null;
// cell0: [i, j], the 10 m cell whose centre is the chunk's corner (sample (1, 1)).
// Vertices: the lattice's n x n samples first, row by row (so the main thread reads the lattice straight off the
// arrays), then the waterline's twins, then the skirt. pos is chunk-local (the corner at 0), y its own level's height;
// own, h5, h10 are the three heights (h5 null on a 5 m chunk), nOwn, n5, n10 the normals over each.
export function buildChunk(grid, site, shade, G, P, cell0) {
  const L = G.L, n = L.n, r = L.r, s = Math.round(grid.cell / r), N = n * n;
  const ox = L.x0 + r, oz = L.z0 + r; // the chunk's corner, sample (1, 1)
  const t0 = Date.now();
  // a view of the grid whose ground is this chunk's lattice (the paint's slope and walls read it)
  const dg = Object.create(grid);
  const own = (x, z) => latticeAt(L, x, z);
  dg.detail = { height: own };
  dg.heightAt = (x, z) => { const h = own(x, z); return h === h ? h : grid.heightAt(x, z); };
  let cap = N + 16384, nv = N;
  let pos = new Float32Array(cap * 3), hOwn = new Float32Array(cap), h5 = P ? new Float32Array(cap) : null, h10 = new Float32Array(cap), sdv = new Float32Array(cap);
  const grow = () => {
    cap *= 2;
    const g = (a, k) => { const b = new a.constructor(cap * k); b.set(a); return b; };
    pos = g(pos, 3); hOwn = g(hOwn, 1); if (h5) h5 = g(h5, 1); h10 = g(h10, 1); sdv = g(sdv, 1);
  };
  for (let M = 0; M < n; M++) for (let K = 0; K < n; K++) {
    const q = M * n + K, x = L.x0 + K * r, z = L.z0 + M * r;
    pos[q * 3] = x - ox; pos[q * 3 + 1] = L.v[q]; pos[q * 3 + 2] = z - oz;
    hOwn[q] = L.v[q]; h10[q] = G.base[q]; sdv[q] = G.sd[q];
    if (h5) { const y = latticeAt(P.L, x, z); h5[q] = y === y ? y : G.base[q]; }
  }
  // the waterline: where it crosses a lattice edge, two vertices at the crossing, one painted land and one lake bed
  const crossMap = new Map(), twins = [], paintAs = new Map(); // vertex -> the shore distance it is painted with
  const crossing = (a, b) => {
    const key = a < b ? a * 4194304 + b : b * 4194304 + a;
    let m = crossMap.get(key);
    if (m !== undefined) return m;
    const t = sdv[a] / (sdv[a] - sdv[b]);
    const pair = [];
    for (const sd of [0, -1e-3]) {
      if (nv >= cap) grow();
      const v = nv++;
      for (let c = 0; c < 3; c++) pos[v * 3 + c] = lerp(pos[a * 3 + c], pos[b * 3 + c], t);
      hOwn[v] = lerp(hOwn[a], hOwn[b], t); h10[v] = lerp(h10[a], h10[b], t); if (h5) h5[v] = lerp(h5[a], h5[b], t);
      sdv[v] = sd; paintAs.set(v, sd); pair.push(v);
    }
    m = { land: pair[0], bed: pair[1] };
    twins.push(pair[0], pair[1]);
    crossMap.set(key, m);
    return m;
  };
  // every square (the apron's ring too, for the normals); the core's, less the deep quads, are drawn
  let all = new Uint32Array(N * 6 + 65536), na = 0, core = new Uint32Array(N * 6 + 65536), nc = 0, isCore = true;
  const tri = (a, b, c) => {
    if (na + 3 > all.length) { const t = new Uint32Array(all.length * 2); t.set(all); all = t; }
    all[na++] = a; all[na++] = b; all[na++] = c;
    if (isCore) { if (nc + 3 > core.length) { const t = new Uint32Array(core.length * 2); t.set(core); core = t; } core[nc++] = a; core[nc++] = b; core[nc++] = c; }
  };
  const fan = (poly) => { for (let k = 1; k < poly.length - 1; k++) tri(poly[k], poly[k + 1], poly[0]); };
  const quad = (a, b, c2, d, flip) => {
    const Pq = [a, c2, d, b];
    let changes = 0;
    for (let k = 0; k < 4; k++) if ((sdv[Pq[k]] >= 0) !== (sdv[Pq[(k + 1) % 4]] >= 0)) changes++;
    if (changes !== 2) { if (flip) { tri(a, c2, b); tri(b, c2, d); } else { tri(a, c2, d); tri(a, d, b); } return; }
    const inside = [], outside = [];
    for (let k = 0; k < 4; k++) {
      const v = Pq[k], w = Pq[(k + 1) % 4], vin = sdv[v] >= 0;
      (vin ? inside : outside).push(v);
      if (vin !== (sdv[w] >= 0)) { const m = crossing(v, w); inside.push(m.land); outside.push(m.bed); }
    }
    fan(inside); fan(outside);
  };
  // the deep quads: 10 m quads (s x s squares from sample (1 + a s, 1 + b s)) whose every sample is far out in a lake
  const nq = (n - 3) / s, deep = new Uint8Array(nq * nq);
  for (let b = 0; b < nq; b++) for (let a = 0; a < nq; a++) {
    let all2 = true;
    for (let M = 1 + b * s; all2 && M <= 1 + (b + 1) * s; M++) for (let K = 1 + a * s; K <= 1 + (a + 1) * s; K++) if (!(sdv[M * n + K] < -DEEP)) { all2 = false; break; }
    deep[b * nq + a] = all2 ? 1 : 0;
  }
  for (let M = 0; M < n - 1; M++) for (let K = 0; K < n - 1; K++) {
    const inCore = K >= 1 && M >= 1 && K <= n - 3 && M <= n - 3;
    isCore = inCore && !deep[Math.floor((M - 1) / s) * nq + Math.floor((K - 1) / s)];
    const q = M * n + K;
    quad(q, q + 1, q + n, q + n + 1, ((K + M) & 1) === 0);
  }
  isCore = true;
  // a deep quad: the 10 m mesh's two triangles (its split: terrain-build.js buildTerrainChunk)
  const deepTri = [];
  for (let b = 0; b < nq; b++) for (let a = 0; a < nq; a++) {
    if (!deep[b * nq + a]) continue;
    const K = 1 + a * s, M = 1 + b * s, A = M * n + K, B = A + s, C = A + s * n, Dd = C + s;
    if (((cell0[0] + a + cell0[1] + b) & 1) === 0) deepTri.push(A, C, B, B, C, Dd); else deepTri.push(A, C, Dd, A, Dd, B);
  }
  // smooth normals over a surface (y from hy), as buildTerrainChunk: area-weighted face normals over every triangle
  // (the apron's ring too, so the light runs on across the chunk's edge), the waterline twins joined, two passes of
  // a one-ring smoothing
  const normals = (hy) => {
    const acc = new Float32Array(nv * 3);
    for (let t = 0; t < na; t += 3) {
      const a = all[t], b = all[t + 1], d = all[t + 2];
      const ax = pos[a * 3], ay = hy[a], az = pos[a * 3 + 2];
      const ux = pos[b * 3] - ax, uy = hy[b] - ay, uz = pos[b * 3 + 2] - az;
      const vx = pos[d * 3] - ax, vy = hy[d] - ay, vz = pos[d * 3 + 2] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      acc[a * 3] += nx; acc[a * 3 + 1] += ny; acc[a * 3 + 2] += nz;
      acc[b * 3] += nx; acc[b * 3 + 1] += ny; acc[b * 3 + 2] += nz;
      acc[d * 3] += nx; acc[d * 3 + 1] += ny; acc[d * 3 + 2] += nz;
    }
    const join = (a3) => { for (let k = 0; k < twins.length; k += 2) { const a = twins[k] * 3, b = twins[k + 1] * 3; for (let c = 0; c < 3; c++) { const sum = a3[a + c] + a3[b + c]; a3[a + c] = sum; a3[b + c] = sum; } } };
    const unit = (a3) => { for (let k = 0; k < nv; k++) { const x = a3[k * 3], y = a3[k * 3 + 1], z = a3[k * 3 + 2], l = Math.hypot(x, y, z) || 1; a3[k * 3] = x / l; a3[k * 3 + 1] = y / l; a3[k * 3 + 2] = z / l; } };
    join(acc); unit(acc);
    let cur = acc, nxt = new Float32Array(nv * 3);
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < nv * 3; k++) nxt[k] = cur[k] * 2;
      for (let t = 0; t < na; t += 3) {
        const a = all[t] * 3, b = all[t + 1] * 3, d = all[t + 2] * 3;
        for (let c = 0; c < 3; c++) { const sum = cur[a + c] + cur[b + c] + cur[d + c]; nxt[a + c] += sum; nxt[b + c] += sum; nxt[d + c] += sum; }
      }
      join(nxt); unit(nxt);
      const tmp = cur; cur = nxt; nxt = tmp;
    }
    return cur;
  };
  const nBody = nv;
  const NO = normals(hOwn), N10 = normals(h10), N5 = h5 ? normals(h5) : null;
  // the paint, for the vertices drawn: the 10 m tile's site and shade at each, its slope and walls off the lattice
  const used = new Uint8Array(nBody);
  for (let t = 0; t < nc; t++) used[core[t]] = 1;
  for (const v of deepTri) used[v] = 1;
  let sa = new Uint8Array(cap * 4), sb = new Uint8Array(cap * 4), sc = new Uint8Array(cap * 4), fl = new Uint8Array(cap * 4);
  const hasLand = !!(site && site.land);
  let lnd = hasLand ? new Int8Array(cap * 4) : null;
  const s8 = (v) => Math.round(Math.min(1, Math.max(-1, v)) * 127);
  const q8 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const levelCache = new Map();
  const levelNear = (x, z) => {
    const i = grid.cellI(x), j = grid.cellJ(z), key = i * 65536 + j;
    let lv = levelCache.get(key);
    if (lv === undefined) { lv = grid.levelAt(grid.cellX(i), grid.cellZ(j), 4); levelCache.set(key, lv); }
    return lv;
  };
  const shadeAt = (x, z) => (shade ? shade[grid.local(grid.cellI(x), grid.cellJ(z))] : 0);
  const pre = { sd: 0, slope: 0, rock: 0, cliff: 0, talus: 0, depth: -1, bedDepth: 0, bed: {} };
  const wA = [0, 0, 0, 0], wB = [0, 0, 0, 0], wC = [0, 0, 0, 0], wf = [0, 0, 0, 0];
  for (let v = 0; v < nBody; v++) {
    if (!used[v]) continue;
    const x = pos[v * 3] + ox, z = pos[v * 3 + 2] + oz, h = hOwn[v];
    const sd = paintAs.has(v) ? paintAs.get(v) : sdv[v];
    groundPre(dg, x, z, sd, site, pre);
    if (sd < 0) {
      pre.bedDepth = Math.max(0, levelNear(x, z) - h);
      pre.depth = pre.bedDepth + bedGrain(x, z);
      bedPre(dg, x, z, sd, pre.bedDepth, site, pre.bed);
    } else pre.depth = -1;
    splatAt(x, z, shadeAt(x, z), pre, wA, wB, wC, wf);
    for (let k = 0; k < 4; k++) { sa[v * 4 + k] = q8(wA[k]); sb[v * 4 + k] = q8(wB[k]); sc[v * 4 + k] = q8(wC[k]); fl[v * 4 + k] = q8(wf[k]); }
    if (lnd) { lnd[v * 4] = s8(pre.tR - 1); lnd[v * 4 + 1] = s8(pre.tG - 1); lnd[v * 4 + 2] = s8(pre.tB - 1); lnd[v * 4 + 3] = sd < 0 ? 0 : s8(pre.sphag); }
  }
  // the skirt: a strip hung SKIRT metres down from each edge, painted and lit as the edge, both windings
  const S = SKIRT[r] || 2, drop = new Map(), skirtTris = [];
  const growAll = () => {
    grow();
    const g = (a, k) => { const b = new a.constructor(cap * k); b.set(a); return b; };
    sa = g(sa, 4); sb = g(sb, 4); sc = g(sc, 4); fl = g(fl, 4); if (lnd) lnd = g(lnd, 4);
  };
  const dropped = (v) => {
    let d = drop.get(v);
    if (d !== undefined) return d;
    if (nv >= cap) growAll();
    d = nv++;
    pos[d * 3] = pos[v * 3]; pos[d * 3 + 1] = pos[v * 3 + 1] - S; pos[d * 3 + 2] = pos[v * 3 + 2];
    hOwn[d] = hOwn[v] - S; h10[d] = h10[v] - S; if (h5) h5[d] = h5[v] - S; sdv[d] = sdv[v];
    for (let k = 0; k < 4; k++) { sa[d * 4 + k] = sa[v * 4 + k]; sb[d * 4 + k] = sb[v * 4 + k]; sc[d * 4 + k] = sc[v * 4 + k]; fl[d * 4 + k] = fl[v * 4 + k]; if (lnd) lnd[d * 4 + k] = lnd[v * 4 + k]; }
    drop.set(v, d);
    return d;
  };
  const runs = [[], [], [], []]; // north, south, west, east
  for (let t = 1; t <= n - 2; t++) { runs[0].push(1 * n + t); runs[1].push((n - 2) * n + t); runs[2].push(t * n + 1); runs[3].push(t * n + n - 2); }
  for (const run of runs) for (let k = 0; k + 1 < run.length; k++) {
    const a = run[k], b = run[k + 1], da = dropped(a), db = dropped(b);
    skirtTris.push(a, b, db, a, db, da, a, db, b, a, da, db);
  }
  const i8 = (src, k) => Math.round(src[k] * 127);
  const nrmOf = (src) => {
    const out = new Int8Array(nv * 3);
    for (let k = 0; k < nBody * 3; k++) out[k] = i8(src, k);
    for (const [v, d] of drop) for (let c = 0; c < 3; c++) out[d * 3 + c] = out[v * 3 + c];
    return out;
  };
  // the index, in four runs by quarter (the 5 m chunk is drawn as four 640 m meshes, one per 2 m chunk's footprint, so
  // the one a 2 m chunk covers can be hidden); a triangle goes to the quarter its first vertex's square lies in
  const half = (n - 3) / 2;
  const quarterSquare = (a, b, c) => { // the centroid's quarter (a triangle never straddles: the halves are whole squares)
    const x = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / (3 * r), z = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / (3 * r);
    return (x >= half ? 1 : 0) + (z >= half ? 2 : 0);
  };
  const lists = [[], [], [], []];
  for (let t = 0; t < nc; t += 3) lists[quarterSquare(core[t], core[t + 1], core[t + 2])].push(core[t], core[t + 1], core[t + 2]);
  for (let t = 0; t < deepTri.length; t += 3) lists[quarterSquare(deepTri[t], deepTri[t + 1], deepTri[t + 2])].push(deepTri[t], deepTri[t + 1], deepTri[t + 2]);
  const dropOf = new Map(); for (const [v, d] of drop) dropOf.set(d, v);
  for (let t = 0; t < skirtTris.length; t += 3) {
    const a = skirtTris[t], b = skirtTris[t + 1], base = dropOf.has(a) ? dropOf.get(a) : a, base2 = dropOf.has(b) ? dropOf.get(b) : b;
    const x = (pos[base * 3] + pos[base2 * 3]) / (2 * r), z = (pos[base * 3 + 2] + pos[base2 * 3 + 2]) / (2 * r);
    lists[(x >= half ? 1 : 0) + (z >= half ? 2 : 0)].push(a, b, skirtTris[t + 2]);
  }
  let total = 0;
  for (const l of lists) total += l.length;
  const idx = new Uint32Array(total), parts = new Float32Array(4 * 8);
  let o = 0;
  lists.forEach((l, k) => {
    idx.set(l, o);
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const v of l) {
      const x = pos[v * 3], z = pos[v * 3 + 2], ya = Math.min(hOwn[v], h10[v], h5 ? h5[v] : Infinity), yb = Math.max(hOwn[v], h10[v], h5 ? h5[v] : -Infinity);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; if (ya < y0) y0 = ya; if (yb > y1) y1 = yb;
    }
    parts.set([o, l.length, x0, y0, z0, x1, y1, z1], k * 8);
    o += l.length;
  });
  return {
    n, r, s, ox, oz, nv, nBody, nq, deep,
    pos: pos.slice(0, nv * 3), own: hOwn.slice(0, nv), h10: h10.slice(0, nv), ...(h5 ? { h5: h5.slice(0, nv), n5: nrmOf(N5) } : {}),
    nOwn: nrmOf(NO), n10: nrmOf(N10),
    splatA: sa.slice(0, nv * 4), splatB: sb.slice(0, nv * 4), splatC: sc.slice(0, nv * 4), floor: fl.slice(0, nv * 4), ...(lnd ? { land: lnd.slice(0, nv * 4) } : {}),
    idx, parts, ms: Date.now() - t0,
  };
}
