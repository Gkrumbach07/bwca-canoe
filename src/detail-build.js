// Detail prototype, the worker's half (docs/detail-proto.md; the main thread's is detail.js). With `?detail=2` or
// `?detail=5`, a fine tile near the player that has a LiDAR detail file (scripts/detail-proto.mjs) is built from it:
// its ground is a regular lattice r metres apart through the 10 m cell centres instead of one vertex per cell, and
// every height query the build makes (the trees, the rocks, the props, the site's steepness, the paint's walls) reads
// that lattice, so nothing floats or sinks. The 10 m tile still says where the water is, what the ground is made of
// and how it is painted (its channels, sampled bilinear as before); the detail only moves the ground up and down.
//   - under water (the 10 m shore distance below 0) and at the waterline the ground is the 10 m tile's, shaped as
//     today, so the shore meets the water sheet exactly where it does now; the LiDAR takes over within 2 m inland
//   - within BLEND metres of the tile's edge the ground eases back to the 10 m mesh, and on the edge it is that mesh
//     exactly (its own triangles, read at each lattice point), so the neighbour built at 10 m meets it without a crack
// Nothing here runs unless the tile's build message carries a detail file.
import { lerp, smoothstep } from './rng.js';
import { meshHeightAt, groundPre, bedPre, bedGrain, splatAt, CELL_SPLAT } from './terrain-build.js';

export const BLEND = 60; // metres inside the tile's edge over which the detail eases into the 10 m mesh
const SKIRT = 1.5;       // metres the edge's skirt hangs down (buildDetailChunk)

// <tx>_<ty>.<r>m.bin (gzip already undone by the fetch): header and the delta-coded centimetres -> Float32 metres
export function decodeDetail(buf) {
  const v = new DataView(buf);
  if (v.getUint32(0, true) !== 0x54445742) throw new Error('not a detail file'); // 'BWDT'
  const n = v.getUint32(16, true), r = v.getFloat32(24, true), base = v.getFloat32(28, true);
  const x0 = v.getFloat64(32, true), z0 = v.getFloat64(40, true);
  const d = new Int16Array(buf, 48, n * n), h = new Float32Array(n * n);
  let acc = 0, rowStart = 0;
  for (let l = 0; l < n; l++) {
    acc = rowStart + d[l * n]; rowStart = acc; h[l * n] = acc;
    for (let k = 1; k < n; k++) { acc += d[l * n + k]; h[l * n + k] = acc; }
  }
  for (let q = 0; q < n * n; q++) h[q] = base + h[q] * 0.01;
  return { n, r, x0, z0, h };
}

// The lattice's height at a point, the way the mesh draws it: two triangles per lattice square, split alternately
// (buildDetailChunk); NaN off the lattice.
function latticeHeight(L, x, z) {
  const fx = (x - L.x0) / L.r, fz = (z - L.z0) / L.r, K = Math.floor(fx), M = Math.floor(fz);
  if (K < 0 || M < 0 || K >= L.n - 1 || M >= L.n - 1) return NaN;
  const u = fx - K, w = fz - M, V = L.v, n = L.n, q = M * n + K;
  const h00 = V[q], h10 = V[q + 1], h01 = V[q + n], h11 = V[q + n + 1];
  if (((K + M) & 1) === 0) return u + w <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * w : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - w);
  return u >= w ? h00 + (h10 - h00) * u + (h11 - h10) * w : h00 + (h01 - h00) * w + (h11 - h01) * u;
}

// A view of the 10 m TileGrid whose ground is the detail lattice: every query of the grid is the grid's own (it is the
// grid's prototype child, sharing its arrays), and `detail.height` is what terrain-build.js surfaceAt and meshHeightAt
// answer with where it is not NaN. tx, ty: the tile; file: decodeDetail's.
export function withDetail(grid, file, tx, ty) {
  const T = grid.tileSize, cell = grid.cell, n = file.n, r = file.r;
  const i0 = tx * T, j0 = ty * T;
  // the tile's mesh runs from the centre of its first cell to the centre of the next tile's first (tiles.js locate)
  const ex0 = grid.cellX(i0), ex1 = grid.cellX(i0 + T), ez0 = grid.cellZ(j0), ez1 = grid.cellZ(j0 + T);
  const v = new Float32Array(n * n);
  const t0 = Date.now();
  for (let l = 0; l < n; l++) {
    const z = file.z0 + l * r;
    for (let k = 0; k < n; k++) {
      const x = file.x0 + k * r, q = l * n + k;
      const edge = Math.min(x - ex0, ex1 - x, z - ez0, ez1 - z);
      const sd = grid.shoreAt(x, z);
      const near = edge < BLEND || sd < 2;
      const base = near ? meshHeightAt(grid, x, z) : 0;
      if (sd <= 0) { v[q] = base; continue; }
      let h = file.h[q];
      if (sd < 2) h = lerp(base, h, smoothstep(0, 2, sd)); // a face at the waterline rises straight out of it
      // land stays above its water: where the LiDAR's shore lies a few metres inland of the game's, its low ground
      // would sit under the water's level with no water drawn over it
      if (sd < 30) { const lv = grid.levelAt(x, z, 3); if (lv === lv) h = Math.max(h, lv + 0.04 * Math.min(sd, 5)); }
      v[q] = edge < BLEND ? lerp(base, h, smoothstep(0, BLEND, edge)) : h;
    }
  }
  const L = { n, r, x0: file.x0, z0: file.z0, v };
  const dg = Object.create(grid);
  dg.detail = { r, n, x0: file.x0, z0: file.z0, v, i0, j0, ms: Date.now() - t0, height: (x, z) => latticeHeight(L, x, z) };
  return dg;
}

// The detail terrain of tile (tx, ty): buildTerrainChunk's output (terrain-build.js; the same arrays, the same paint,
// the same smooth normals over a one-cell ring, the waterline cut the same way) on the detail lattice. grid: withDetail's.
export function buildDetailChunk(grid, i0, j0, n, { shade = null, originX, originZ, site = null, cellSplat = null }) {
  const D = grid.detail, N = D.n, r = D.r, s = Math.round(grid.cell / r), V = D.v;
  const tStart = Date.now();
  // capacity: every lattice point, plus the waterline's twin vertices
  let cap = N * N + 65536;
  let pos = new Float32Array(cap * 3), sdv = new Float32Array(cap), sa = new Uint8Array(cap * 4), sb = new Uint8Array(cap * 4), sc = new Uint8Array(cap * 4), fl = new Uint8Array(cap * 4);
  const hasLand = !!(site && site.land);
  let lnd = hasLand ? new Int8Array(cap * 4) : null;
  let nv = 0;
  const grow = () => {
    cap *= 2;
    const g = (a, k) => { const b = new a.constructor(cap * k); b.set(a); return b; };
    pos = g(pos, 3); sdv = g(sdv, 1); sa = g(sa, 4); sb = g(sb, 4); sc = g(sc, 4); fl = g(fl, 4); if (lnd) lnd = g(lnd, 4);
  };
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
  const add = (x, h, z, sd) => {
    if (nv >= cap) grow();
    const v = nv++;
    pos[v * 3] = x - originX; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z - originZ; sdv[v] = sd;
    groundPre(grid, x, z, sd, site, pre);
    if (sd < 0) {
      pre.bedDepth = Math.max(0, levelNear(x, z) - h);
      pre.depth = pre.bedDepth + bedGrain(x, z);
      bedPre(grid, x, z, sd, pre.bedDepth, site, pre.bed);
    } else pre.depth = -1;
    splatAt(x, z, shadeAt(x, z), pre, wA, wB, wC, wf);
    for (let k = 0; k < 4; k++) { sa[v * 4 + k] = q8(wA[k]); sb[v * 4 + k] = q8(wB[k]); sc[v * 4 + k] = q8(wC[k]); fl[v * 4 + k] = q8(wf[k]); }
    if (lnd) { lnd[v * 4] = s8(pre.tR - 1); lnd[v * 4 + 1] = s8(pre.tG - 1); lnd[v * 4 + 2] = s8(pre.tB - 1); lnd[v * 4 + 3] = sd < 0 ? 0 : s8(pre.sphag); }
    return v;
  };
  // lattice point (K, M) of the file's lattice (K = 0 is the centre of cell i0 - 1)
  const map = new Int32Array(N * N).fill(-1);
  const vert = (K, M) => {
    const q = M * N + K;
    let v = map[q];
    if (v >= 0) return v;
    const x = D.x0 + K * r, z = D.z0 + M * r;
    v = add(x, V[q], z, grid.shoreAt(x, z));
    map[q] = v;
    return v;
  };
  const crossMap = new Map(), twins = [];
  const crossing = (v, w) => {
    const key = v < w ? v * 4194304 + w : w * 4194304 + v;
    let m = crossMap.get(key);
    if (m !== undefined) return m;
    const rv = sdv[v], rw = sdv[w], t = rv / (rv - rw);
    const px = lerp(pos[v * 3], pos[w * 3], t), py = lerp(pos[v * 3 + 1], pos[w * 3 + 1], t), pz = lerp(pos[v * 3 + 2], pos[w * 3 + 2], t);
    const land = add(px + originX, py, pz + originZ, 0), bedV = add(px + originX, py, pz + originZ, -1e-3);
    m = { land, bed: bedV };
    twins.push(land, bedV);
    crossMap.set(key, m);
    return m;
  };
  let tris = new Uint32Array(N * N * 6 + 65536), nt3 = 0, coreFlag = new Uint8Array(tris.length / 3), core = true;
  const tri = (a, b, c) => {
    if (nt3 + 3 > tris.length) { const t = new Uint32Array(tris.length * 2); t.set(tris); tris = t; const f = new Uint8Array(tris.length / 3); f.set(coreFlag); coreFlag = f; }
    coreFlag[nt3 / 3] = core ? 1 : 0;
    tris[nt3++] = a; tris[nt3++] = b; tris[nt3++] = c;
  };
  const fan = (poly) => { for (let k = 1; k < poly.length - 1; k++) tri(poly[k], poly[k + 1], poly[0]); };
  const quad = (a, b, c2, d, flip) => {
    const P = [a, c2, d, b];
    let changes = 0;
    for (let k = 0; k < 4; k++) if ((sdv[P[k]] >= 0) !== (sdv[P[(k + 1) % 4]] >= 0)) changes++;
    if (changes !== 2) {
      if (flip) { tri(a, c2, b); tri(b, c2, d); } else { tri(a, c2, d); tri(a, d, b); }
      return;
    }
    const inside = [], outside = [];
    for (let k = 0; k < 4; k++) {
      const v = P[k], w = P[(k + 1) % 4], vin = sdv[v] >= 0;
      (vin ? inside : outside).push(v);
      if (vin !== (sdv[w] >= 0)) { const m = crossing(v, w); inside.push(m.land); outside.push(m.bed); }
    }
    fan(inside); fan(outside);
  };
  // the 10 m quads of the tile and a ring of one round it, each as s x s lattice squares, quad by quad and row by
  // row (prop-kit.js MeshGround buckets the triangles by 10 m quad)
  const K0 = (i0 - 1 - (D.i0 - 1)) * s, M0 = (j0 - 1 - (D.j0 - 1)) * s;
  for (let j = j0 - 1; j < j0 + n + 1; j++) {
    for (let i = i0 - 1; i < i0 + n + 1; i++) {
      core = i >= i0 && i < i0 + n && j >= j0 && j < j0 + n;
      const Kq = K0 + (i - (i0 - 1)) * s, Mq = M0 + (j - (j0 - 1)) * s;
      for (let b = 0; b < s; b++) for (let a = 0; a < s; a++) {
        const K = Kq + a, M = Mq + b;
        if (K < 0 || M < 0 || K >= N - 1 || M >= N - 1) continue;
        quad(vert(K, M), vert(K + 1, M), vert(K, M + 1), vert(K + 1, M + 1), ((K + M) & 1) === 0);
      }
    }
  }
  if (cellSplat) {
    for (let j = j0; j < j0 + n; j++) for (let i = i0; i < i0 + n; i++) {
      const v = map[(M0 + (j - j0 + 1) * s) * N + K0 + (i - i0 + 1) * s];
      if (v < 0) continue;
      const o = grid.local(i, j) * CELL_SPLAT;
      for (let c = 0; c < 4; c++) { cellSplat[o + c] = sa[v * 4 + c]; cellSplat[o + 4 + c] = sb[v * 4 + c]; }
      cellSplat[o + 8] = sc[v * 4]; cellSplat[o + 9] = sc[v * 4 + 1]; cellSplat[o + 10] = fl[v * 4]; cellSplat[o + 11] = fl[v * 4 + 1];
    }
  }
  // smooth normals, as buildTerrainChunk: area-weighted face normals, the waterline twins joined, then two passes of
  // a one-ring smoothing (on the finer lattice that ring is narrower, so the light keeps more of the detail's relief)
  const acc = new Float32Array(nv * 3);
  for (let t = 0; t < nt3; t += 3) {
    const a = tris[t], b = tris[t + 1], d = tris[t + 2];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[d * 3] - ax, vy = pos[d * 3 + 1] - ay, vz = pos[d * 3 + 2] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    acc[a * 3] += nx; acc[a * 3 + 1] += ny; acc[a * 3 + 2] += nz;
    acc[b * 3] += nx; acc[b * 3 + 1] += ny; acc[b * 3 + 2] += nz;
    acc[d * 3] += nx; acc[d * 3 + 1] += ny; acc[d * 3 + 2] += nz;
  }
  const joinTwins = (a3) => {
    for (let k = 0; k < twins.length; k += 2) {
      const a = twins[k] * 3, b = twins[k + 1] * 3;
      for (let c = 0; c < 3; c++) { const sum = a3[a + c] + a3[b + c]; a3[a + c] = sum; a3[b + c] = sum; }
    }
  };
  const unit = (a3) => { for (let k = 0; k < nv; k++) { const x = a3[k * 3], y = a3[k * 3 + 1], z = a3[k * 3 + 2], L = Math.hypot(x, y, z) || 1; a3[k * 3] = x / L; a3[k * 3 + 1] = y / L; a3[k * 3 + 2] = z / L; } };
  joinTwins(acc); unit(acc);
  let cur = acc, nxt = new Float32Array(nv * 3);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < nv * 3; k++) nxt[k] = cur[k] * 2;
    for (let t = 0; t < nt3; t += 3) {
      const a = tris[t] * 3, b = tris[t + 1] * 3, d = tris[t + 2] * 3;
      for (let c = 0; c < 3; c++) { const sum = cur[a + c] + cur[b + c] + cur[d + c]; nxt[a + c] += sum; nxt[b + c] += sum; nxt[d + c] += sum; }
    }
    joinTwins(nxt); unit(nxt);
    const tmp = cur; cur = nxt; nxt = tmp;
  }
  // Skirts: the 10 m neighbour's edge has a vertex every 5 m in the shore band (its 2 x 2 subdivision, with the shore
  // bumps on them), which a 2 m lattice does not land on, so the two edges part by up to a few decimetres there. A
  // strip hung SKIRT metres down from the tile's edge, painted and lit as the edge, closes any such slit from either
  // side. (Its triangles have no area seen from above: the ground queries never land on them.)
  const nBody = nv, skirt = [];
  const edgeRun = (K, M, dK, dM) => { const out = []; for (let t = 0; t <= n * s; t++) { const v = map[(M + dM * t) * N + K + dK * t]; if (v >= 0) out.push(v); } return out; };
  const Ka = K0 + s, Ma = M0 + s, Kb = K0 + s + n * s, Mb = M0 + s + n * s;
  for (const run of [edgeRun(Ka, Ma, 1, 0), edgeRun(Ka, Mb, 1, 0), edgeRun(Ka, Ma, 0, 1), edgeRun(Kb, Ma, 0, 1)]) skirt.push(run);
  const drop = new Map();
  const dropped = (v) => {
    let d = drop.get(v);
    if (d !== undefined) return d;
    if (nv >= cap) grow();
    d = nv++;
    pos[d * 3] = pos[v * 3]; pos[d * 3 + 1] = pos[v * 3 + 1] - SKIRT; pos[d * 3 + 2] = pos[v * 3 + 2]; sdv[d] = sdv[v];
    for (let k = 0; k < 4; k++) { sa[d * 4 + k] = sa[v * 4 + k]; sb[d * 4 + k] = sb[v * 4 + k]; sc[d * 4 + k] = sc[v * 4 + k]; fl[d * 4 + k] = fl[v * 4 + k]; if (lnd) lnd[d * 4 + k] = lnd[v * 4 + k]; }
    drop.set(v, d);
    return d;
  };
  const skirtTris = [];
  for (const run of skirt) for (let k = 0; k + 1 < run.length; k++) {
    const a = run[k], b = run[k + 1], da = dropped(a), db = dropped(b);
    skirtTris.push(a, b, db, a, db, da, a, db, b, a, da, db); // both windings: the strip shows from either side
  }
  const nrm = new Int8Array(nv * 3);
  for (let k = 0; k < nBody * 3; k++) nrm[k] = Math.round(cur[k] * 127);
  for (const [v, d] of drop) for (let c = 0; c < 3; c++) nrm[d * 3 + c] = nrm[v * 3 + c];
  let nc = 0;
  for (let t = 0; t < nt3 / 3; t++) nc += coreFlag[t];
  const idx = new Uint32Array(nc * 3 + skirtTris.length);
  let o = 0;
  for (let t = 0; t < nt3 / 3; t++) if (coreFlag[t]) { idx[o++] = tris[t * 3]; idx[o++] = tris[t * 3 + 1]; idx[o++] = tris[t * 3 + 2]; }
  idx.set(skirtTris, o);
  return {
    pos: pos.slice(0, nv * 3), nrm, splatA: sa.slice(0, nv * 4), splatB: sb.slice(0, nv * 4), splatC: sc.slice(0, nv * 4), floor: fl.slice(0, nv * 4), idx,
    ...(lnd ? { land: lnd.slice(0, nv * 4) } : {}), detail: { r, vertices: nv, triangles: idx.length / 3, buildMs: Date.now() - tStart, latticeMs: D.ms },
  };
}

