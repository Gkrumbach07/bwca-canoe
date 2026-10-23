// Ambient occlusion baked per vertex (docs/look.md, pass 1: "occlusion wherever two things meet"). For
// every vertex a hemisphere of rays about its normal is cast against the geometry's own triangles and, for
// a thing that stands on the ground, a ground plane; the rays that hit something within `reach` darken the
// vertex's colour (a hit close by counts more than one at the edge of the reach). Done once per geometry
// variant at startup, so it costs nothing per frame: the canopy goes dark inside and underneath, a whorl
// darkens the one below it, a trunk and a boulder darken toward the ground they stand in.
//
// The rays are cosine-weighted and the same for every vertex (a fixed stratified set turned into each
// vertex's frame), so the result is deterministic and smooth across a surface.
//
// Being deterministic, a bake is cached: each one is keyed by a hash of what it reads (the positions, the normals,
// the index and the options) and its per-vertex factors are kept in IndexedDB, so a second start reads them back
// instead of casting the rays again (the vegetation kit, the rocks, the lake plants and the hull's props bake about
// a second's worth at startup). Change a geometry and its hash changes, so it bakes afresh; change the bake
// itself and bump BAKE_VERSION. The cache is read once at startup (occlusionCacheReady: main.js awaits it before
// the kits are built) and what was baked anew is written a few seconds later, in one transaction. Where there is
// no IndexedDB (a private window, a worker) every bake simply runs.

// ---------- the cache ---------------------------------------------------------------------------------------------
const BAKE_VERSION = 1;
const DB = 'bwca-occlusion', STORE = 'bakes', MAX_ENTRIES = 6000;
const cache = new Map();  // key -> { k: Float64Array (a factor per vertex), mean, triangles, reach }
const fresh = new Map();  // baked this session, not yet written
export const bakeStats = { baked: 0, cached: 0, bakeMs: 0, hashMs: 0, loaded: 0, loadMs: 0, saved: 0, log: null }; // log: [] to list each bake
let saveTimer = null;

const openDb = () => new Promise((resolve, reject) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
// Reads every cached bake into memory; resolves (never rejects) once done or found unavailable.
export async function loadOcclusionCache() {
  const t0 = performance.now();
  try {
    if (typeof indexedDB === 'undefined') return;
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly'), st = tx.objectStore(STORE);
      const keys = st.getAllKeys(), vals = st.getAll();
      tx.oncomplete = () => {
        const K = keys.result || [], Vs = vals.result || [];
        if (K.length > MAX_ENTRIES) { clearStore(db); resolve(); return; } // grown past its keep: start over
        for (let i = 0; i < K.length; i++) if (Vs[i] && Vs[i].k instanceof Float64Array) cache.set(K[i], Vs[i]);
        bakeStats.loaded = K.length;
        resolve();
      };
      tx.onerror = () => resolve();
    });
    db.close();
  } catch (e) {
    /* no cache this time: every bake runs */
  }
  bakeStats.loadMs = Math.round(performance.now() - t0);
}
function clearStore(db) { try { db.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch (e) { /* the next start rebuilds it */ } }
// started as soon as this module loads, so it reads while the world loads
export const occlusionCacheReady = typeof indexedDB === 'undefined' ? Promise.resolve() : loadOcclusionCache();

// Writes what was baked anew (a few seconds after the last bake, so a start's bakes go in one transaction).
export async function saveOcclusionCache() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!fresh.size || typeof indexedDB === 'undefined') return;
  const batch = [...fresh]; fresh.clear();
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
      for (const [key, v] of batch) st.put(v, key);
      tx.oncomplete = () => { bakeStats.saved += batch.length; resolve(); };
      tx.onerror = () => resolve();
    });
    db.close();
  } catch (e) {
    /* not stored: these bake again next start */
  }
}
const scheduleSave = () => { if (typeof indexedDB !== 'undefined' && !saveTimer) saveTimer = setTimeout(saveOcclusionCache, 4000); };

// The key: two 32-bit hashes (murmur-style mixing, different seeds) over the words of the positions, the normals
// and the index, with the options and the counts.
function hashWords(words, h1, h2) {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    h1 = Math.imul(h1 ^ w, 0x5bd1e995); h1 ^= h1 >>> 15;
    h2 = Math.imul(h2 + w, 0x27d4eb2d) ^ (h2 >>> 13);
  }
  return [h1 >>> 0, h2 >>> 0];
}
const words32 = (a) => (a.BYTES_PER_ELEMENT === 4 ? new Uint32Array(a.buffer, a.byteOffset, a.length) : Uint32Array.from(a));
function bakeKey(P, N, I, rays, R, ground, floor) {
  let h = [0x9747b28c ^ P.length, 0x85ebca6b ^ (I ? I.length : 0)];
  h = hashWords(words32(P), h[0], h[1]);
  h = hashWords(words32(N), h[0], h[1]);
  if (I) h = hashWords(words32(I), h[0], h[1]);
  return `v${BAKE_VERSION}:${h[0].toString(36)}.${h[1].toString(36)}:${P.length / 3}:${rays}:${R}:${ground}:${floor}`;
}

const DIRS = new Map(); // ray count -> Float32Array of (x, y, z) in a z-up frame, cosine-weighted
function directions(n) {
  let d = DIRS.get(n);
  if (d) return d;
  d = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // Hammersley point set, mapped to the cosine-weighted hemisphere
    let bits = i; bits = ((bits << 16) | (bits >>> 16)) >>> 0;
    bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
    bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
    bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
    bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
    const u = (i + 0.5) / n, v = bits / 4294967296;
    const r = Math.sqrt(u), phi = 2 * Math.PI * v;
    d[i * 3] = r * Math.cos(phi); d[i * 3 + 1] = r * Math.sin(phi); d[i * 3 + 2] = Math.sqrt(Math.max(0, 1 - u));
  }
  DIRS.set(n, d);
  return d;
}

// geo: a BufferGeometry with position, normal and color (indexed or not). Options:
//   rays    rays per vertex
//   reach   how far an occluder still counts, in the geometry's units (default: a fifth of its size, 0.4–4)
//   ground  y of a ground plane the thing stands on, or null
//   floor   the darkest a fully enclosed vertex goes (the colour is multiplied by floor..1)
// Returns the geometry, its colour attribute darkened in place; geo.userData.occlusion holds the stats.
export function bakeOcclusion(geo, { rays = 24, reach = null, ground = null, floor = 0.4 } = {}) {
  const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal'), col = geo.getAttribute('color');
  if (!pos || !nrm || !col) return geo;
  const P = pos.array, N = nrm.array, Cc = col.array, cs = col.itemSize;
  const index = geo.getIndex(), I = index ? index.array : null;
  const triCount = (I ? I.length : pos.count) / 3;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
  const R = reach ?? Math.min(4, Math.max(0.4, size * 0.2));
  // baked before (this start or an earlier one): the factors as they were
  const th0 = performance.now(), id = bakeKey(P, N, I, rays, R, ground, floor);
  bakeStats.hashMs += performance.now() - th0;
  const hit = cache.get(id);
  if (hit && hit.k.length === pos.count) {
    const K = hit.k;
    for (let v = 0; v < pos.count; v++) for (let c = 0; c < 3; c++) Cc[v * cs + c] *= K[v];
    col.needsUpdate = true;
    geo.userData.occlusion = { mean: hit.mean, vertices: pos.count, triangles: hit.triangles, reach: hit.reach };
    bakeStats.cached++;
    return geo;
  }
  const t0 = performance.now();
  // per triangle: p0, e1, e2, the bounding sphere (centre, radius)
  const T = new Float32Array(triCount * 13);
  for (let t = 0; t < triCount; t++) {
    const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
    const o = t * 13;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2], cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
    T[o] = ax; T[o + 1] = ay; T[o + 2] = az;
    T[o + 3] = bx - ax; T[o + 4] = by - ay; T[o + 5] = bz - az;
    T[o + 6] = cx - ax; T[o + 7] = cy - ay; T[o + 8] = cz - az;
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
    T[o + 9] = mx; T[o + 10] = my; T[o + 11] = mz;
    T[o + 12] = Math.sqrt(Math.max((ax - mx) ** 2 + (ay - my) ** 2 + (az - mz) ** 2, (bx - mx) ** 2 + (by - my) ** 2 + (bz - mz) ** 2, (cx - mx) ** 2 + (cy - my) ** 2 + (cz - mz) ** 2));
  }
  const D = directions(rays), eps = R * 0.004 + 1e-4;
  const G = triangleGrid(T, triCount, R, eps * 2 + 1e-4);
  const { gx, gy, gz, cell, nx, ny, nz, start, list } = G;
  const stamp = new Int32Array(triCount).fill(-1);
  let all = null; // every triangle, for a ray starting off the grid (a vertex no triangle uses)
  let rayId = 0;
  const Kout = new Float64Array(pos.count); // the factors exactly as applied
  const seen = new Map(); // a position and normal seen before (non-indexed geometry repeats them)
  let sum = 0;
  for (let v = 0; v < pos.count; v++) {
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
    let nx0 = N[v * 3], ny0 = N[v * 3 + 1], nz0 = N[v * 3 + 2];
    const nl = Math.hypot(nx0, ny0, nz0) || 1; nx0 /= nl; ny0 /= nl; nz0 /= nl;
    const key = `${px.toFixed(4)},${py.toFixed(4)},${pz.toFixed(4)},${nx0.toFixed(2)},${ny0.toFixed(2)},${nz0.toFixed(2)}`;
    let k = seen.get(key);
    if (k === undefined) {
      // a frame about the normal
      let tx, ty, tz;
      if (Math.abs(ny0) < 0.9) { tx = nz0; ty = 0; tz = -nx0; } else { tx = 0; ty = -nz0; tz = ny0; }
      const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
      const bx = ny0 * tz - nz0 * ty, by = nz0 * tx - nx0 * tz, bz = nx0 * ty - ny0 * tx;
      const ox = px + nx0 * eps, oy = py + ny0 * eps, oz = pz + nz0 * eps;
      let occ = 0;
      for (let r = 0; r < rays; r++) {
        const u = D[r * 3], w = D[r * 3 + 1], h = D[r * 3 + 2];
        const dx = tx * u + bx * w + nx0 * h, dy = ty * u + by * w + ny0 * h, dz = tz * u + bz * w + nz0 * h;
        let best = R;
        if (ground !== null && dy < -1e-4) { const tg = (oy - ground) / -dy; if (tg > 0 && tg < best) best = tg; }
        // walk the grid from the cell of the ray's origin
        const ray = rayId++;
        const off = ox < gx || oy < gy || oz < gz || ox >= gx + nx * cell || oy >= gy + ny * cell || oz >= gz + nz * cell;
        if (off && !all) all = Int32Array.from({ length: triCount }, (_, i) => i);
        let ix = cellOf(ox, gx, cell, nx), iy = cellOf(oy, gy, cell, ny), iz = cellOf(oz, gz, cell, nz);
        const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
        const tdx = dx !== 0 ? cell / Math.abs(dx) : Infinity, tdy = dy !== 0 ? cell / Math.abs(dy) : Infinity, tdz = dz !== 0 ? cell / Math.abs(dz) : Infinity;
        let tmx = dx !== 0 ? ((ix + (dx > 0 ? 1 : 0)) * cell + gx - ox) / dx : Infinity;
        let tmy = dy !== 0 ? ((iy + (dy > 0 ? 1 : 0)) * cell + gy - oy) / dy : Infinity;
        let tmz = dz !== 0 ? ((iz + (dz > 0 ? 1 : 0)) * cell + gz - oz) / dz : Infinity;
        for (;;) {
          const c = (iz * ny + iy) * nx + ix, L = off ? all : list;
          for (let q = off ? 0 : start[c], qe = off ? triCount : start[c + 1]; q < qe; q++) {
            const t = L[q];
            if (stamp[t] === ray) continue;
            stamp[t] = ray;
            const o = t * 13;
            // bounding sphere first: most triangles are nowhere near the ray
            const qx = T[o + 9] - ox, qy = T[o + 10] - oy, qz = T[o + 11] - oz, rad = T[o + 12];
            const along = qx * dx + qy * dy + qz * dz;
            if (along < -rad || along - rad > best) continue;
            if (qx * qx + qy * qy + qz * qz - along * along > rad * rad) continue;
            // Moller-Trumbore
            const e1x = T[o + 3], e1y = T[o + 4], e1z = T[o + 5], e2x = T[o + 6], e2y = T[o + 7], e2z = T[o + 8];
            const sxx = dy * e2z - dz * e2y, syy = dz * e2x - dx * e2z, szz = dx * e2y - dy * e2x;
            const det = e1x * sxx + e1y * syy + e1z * szz;
            if (det > -1e-9 && det < 1e-9) continue;
            const inv = 1 / det;
            const fx = ox - T[o], fy = oy - T[o + 1], fz = oz - T[o + 2];
            const bu = (fx * sxx + fy * syy + fz * szz) * inv;
            if (bu < 0 || bu > 1) continue;
            const qgx = fy * e1z - fz * e1y, qgy = fz * e1x - fx * e1z, qgz = fx * e1y - fy * e1x;
            const bv = (dx * qgx + dy * qgy + dz * qgz) * inv;
            if (bv < 0 || bu + bv > 1) continue;
            const th = (e2x * qgx + e2y * qgy + e2z * qgz) * inv;
            if (th > eps && th < best) best = th;
          }
          // on to the next cell along the ray, unless it starts past the nearest hit so far or leaves the grid
          if (off) break;
          if (tmx <= tmy && tmx <= tmz) { if (tmx > best) break; ix += sx; if (ix < 0 || ix >= nx) break; tmx += tdx; }
          else if (tmy <= tmz) { if (tmy > best) break; iy += sy; if (iy < 0 || iy >= ny) break; tmy += tdy; }
          else { if (tmz > best) break; iz += sz; if (iz < 0 || iz >= nz) break; tmz += tdz; }
        }
        if (best < R) occ += 1 - (best / R) * (best / R);
      }
      const open = 1 - occ / rays;
      k = floor + (1 - floor) * open;
      seen.set(key, k);
    }
    sum += k;
    Kout[v] = k;
    for (let c = 0; c < 3; c++) Cc[v * cs + c] *= k;
  }
  col.needsUpdate = true;
  geo.userData.occlusion = { mean: sum / pos.count, vertices: pos.count, triangles: triCount, reach: R };
  const entry = { k: Kout, mean: sum / pos.count, triangles: triCount, reach: R };
  cache.set(id, entry); fresh.set(id, entry); scheduleSave();
  bakeStats.baked++; bakeStats.bakeMs += performance.now() - t0;
  if (bakeStats.log) bakeStats.log.push({ vertices: pos.count, triangles: triCount, rays, reach: R, ms: performance.now() - t0 });
  return geo;
}

// The rays walk a uniform grid over the triangles (Amanatides and Woo): each triangle is listed in every cell its
// bounding sphere's box touches, `pad` wider, and a ray tests the triangles of the cells it passes through until the
// next cell starts past the nearest hit so far. A hit lies inside its triangle's sphere, so every triangle that could
// be the nearest is tested, with the same arithmetic as testing them all: the same result, many times sooner (a
// tree's crown: 30 times). Cells half a reach across, at most 48 along the longest side.
const cellOf = (v, g, cell, n) => { const i = Math.floor((v - g) / cell); return i < 0 ? 0 : i >= n ? n - 1 : i; };
function triangleGrid(T, triCount, R, pad) {
  let gx = Infinity, gy = Infinity, gz = Infinity, hx = -Infinity, hy = -Infinity, hz = -Infinity;
  for (let t = 0; t < triCount; t++) {
    const o = t * 13, rr = T[o + 12] + pad;
    gx = Math.min(gx, T[o + 9] - rr); gy = Math.min(gy, T[o + 10] - rr); gz = Math.min(gz, T[o + 11] - rr);
    hx = Math.max(hx, T[o + 9] + rr); hy = Math.max(hy, T[o + 10] + rr); hz = Math.max(hz, T[o + 11] + rr);
  }
  if (!triCount) { gx = gy = gz = 0; hx = hy = hz = 1; }
  const cell = Math.max(R * 0.5, Math.max(hx - gx, hy - gy, hz - gz, 1e-3) / 48);
  const nx = Math.max(1, Math.ceil((hx - gx) / cell)), ny = Math.max(1, Math.ceil((hy - gy) / cell)), nz = Math.max(1, Math.ceil((hz - gz) / cell));
  const n = nx * ny * nz, start = new Int32Array(n + 1);
  const each = (fn) => {
    for (let t = 0; t < triCount; t++) {
      const o = t * 13, rr = T[o + 12] + pad;
      const x0 = cellOf(T[o + 9] - rr, gx, cell, nx), x1 = cellOf(T[o + 9] + rr, gx, cell, nx);
      const y0 = cellOf(T[o + 10] - rr, gy, cell, ny), y1 = cellOf(T[o + 10] + rr, gy, cell, ny);
      const z0 = cellOf(T[o + 11] - rr, gz, cell, nz), z1 = cellOf(T[o + 11] + rr, gz, cell, nz);
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn((z * ny + y) * nx + x, t);
    }
  };
  each((c) => { start[c + 1]++; });
  for (let c = 0; c < n; c++) start[c + 1] += start[c];
  const list = new Int32Array(start[n]), at = start.slice(0, n);
  each((c, t) => { list[at[c]++] = t; });
  return { gx, gy, gz, cell, nx, ny, nz, start, list };
}
