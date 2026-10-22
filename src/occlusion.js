// Ambient occlusion baked per vertex (docs/look.md, pass 1: "occlusion wherever two things meet"). For
// every vertex a hemisphere of rays about its normal is cast against the geometry's own triangles and, for
// a thing that stands on the ground, a ground plane; the rays that hit something within `reach` darken the
// vertex's colour (a hit close by counts more than one at the edge of the reach). Done once per geometry
// variant at startup, so it costs nothing per frame: the canopy goes dark inside and underneath, a whorl
// darkens the one below it, a trunk and a boulder darken toward the ground they stand in.
//
// The rays are cosine-weighted and the same for every vertex (a fixed stratified set turned into each
// vertex's frame), so the result is deterministic and smooth across a surface.

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
  const cache = new Map(); // a position and normal seen before (non-indexed geometry repeats them)
  let sum = 0;
  for (let v = 0; v < pos.count; v++) {
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
    let nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const key = `${px.toFixed(4)},${py.toFixed(4)},${pz.toFixed(4)},${nx.toFixed(2)},${ny.toFixed(2)},${nz.toFixed(2)}`;
    let k = cache.get(key);
    if (k === undefined) {
      // a frame about the normal
      let tx, ty, tz;
      if (Math.abs(ny) < 0.9) { tx = nz; ty = 0; tz = -nx; } else { tx = 0; ty = -nz; tz = ny; }
      const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
      const ox = px + nx * eps, oy = py + ny * eps, oz = pz + nz * eps;
      let occ = 0;
      for (let r = 0; r < rays; r++) {
        const u = D[r * 3], w = D[r * 3 + 1], h = D[r * 3 + 2];
        const dx = tx * u + bx * w + nx * h, dy = ty * u + by * w + ny * h, dz = tz * u + bz * w + nz * h;
        let best = R;
        if (ground !== null && dy < -1e-4) { const tg = (oy - ground) / -dy; if (tg > 0 && tg < best) best = tg; }
        for (let t = 0; t < triCount; t++) {
          const o = t * 13;
          // bounding sphere first: most triangles are nowhere near the ray
          const qx = T[o + 9] - ox, qy = T[o + 10] - oy, qz = T[o + 11] - oz, rad = T[o + 12];
          const along = qx * dx + qy * dy + qz * dz;
          if (along < -rad || along - rad > best) continue;
          if (qx * qx + qy * qy + qz * qz - along * along > rad * rad) continue;
          // Moller-Trumbore
          const e1x = T[o + 3], e1y = T[o + 4], e1z = T[o + 5], e2x = T[o + 6], e2y = T[o + 7], e2z = T[o + 8];
          const sx = dy * e2z - dz * e2y, sy = dz * e2x - dx * e2z, sz = dx * e2y - dy * e2x;
          const det = e1x * sx + e1y * sy + e1z * sz;
          if (det > -1e-9 && det < 1e-9) continue;
          const inv = 1 / det;
          const fx = ox - T[o], fy = oy - T[o + 1], fz = oz - T[o + 2];
          const bu = (fx * sx + fy * sy + fz * sz) * inv;
          if (bu < 0 || bu > 1) continue;
          const gx = fy * e1z - fz * e1y, gy = fz * e1x - fx * e1z, gz = fx * e1y - fy * e1x;
          const bv = (dx * gx + dy * gy + dz * gz) * inv;
          if (bv < 0 || bu + bv > 1) continue;
          const th = (e2x * gx + e2y * gy + e2z * gz) * inv;
          if (th > eps && th < best) best = th;
        }
        if (best < R) occ += 1 - (best / R) * (best / R);
      }
      const open = 1 - occ / rays;
      k = floor + (1 - floor) * open;
      cache.set(key, k);
    }
    sum += k;
    for (let c = 0; c < 3; c++) Cc[v * cs + c] *= k;
  }
  col.needsUpdate = true;
  geo.userData.occlusion = { mean: sum / pos.count, vertices: pos.count, triangles: triCount, reach: R };
  return geo;
}
