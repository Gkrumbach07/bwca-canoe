// Terrain geometry for one tile (or one far-field chunk), built from a TileGrid. Pure data in, typed arrays
// out, so it runs in the build worker. Positions are relative to (originX, originZ), the tile corner, which
// keeps every vertex small enough for float32 however far the tile sits from the world origin.
import { fbm, lerp, smoothstep } from './rng.js';
import { clearingAt, burnAt, rockAt } from './fields.js';

export const FINE_BAND = 25;    // metres either side of the shore that get 2x2 subdivision
export const SHAPE_BAND = 9;    // metres either side of the shore where height follows the distance field exactly

// sRGB hex -> linear rgb, the same conversion THREE.Color applies to hex colours
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hex = (h) => [lin(((h >> 16) & 255) / 255), lin(((h >> 8) & 255) / 255), lin((h & 255) / 255)];
// A fixed palette; every face gets exactly one of these (no gradients).
const C = {
  bedShallow: hex(0xc4b894), bedDeep: hex(0x5f7c70), sand: hex(0xc8b88d), rock: hex(0x8f8d85), rockDark: hex(0x6f6d67),
  forest: hex(0x667f52), forestLight: hex(0x7b9360), forestDark: hex(0x546b47), meadow: hex(0x98a56a), burn: hex(0x9a8a5e),
  rockLichen: hex(0x9c9d8c),
};

export const GROUND = Object.keys(C);                 // class index -> name
export const GROUND_PALETTE = GROUND.map((k) => C[k]); // class index -> linear rgb

// Which of the palette's classes a point of ground belongs to.
// The bed is one pale tone: the water above it carries the depth (its colour deepens and it goes opaque
// within a few metres), so a second bed colour only drew a staircase along the grid. Land runs rock or
// forest straight to the waterline, as Shield shores do; the water's foam line marks the edge.
export function groundClass(grid, x, z, shade = 0) {
  const sd = grid.shoreAt(x, z);
  if (sd < 0) return 0;
  const slope = grid.slopeAt(x, z);
  if (rockAt(slope, sd, x, z) > 0.5) return slope > 0.55 ? 4 : fbm(x * 0.03, z * 0.03, 2, 91) > 0.58 ? 10 : 3;
  if (burnAt(x, z) > 0.5) return 9;
  if (clearingAt(x, z) > 0.68) return 8; // same field the forest uses for clearings
  if (shade > 0.55) return 7;
  return fbm(x * 0.012, z * 0.012, 3, 7) > 0.55 ? 6 : 5;
}

export function groundColor(grid, x, z, out, shade = 0) {
  const c = GROUND_PALETTE[groundClass(grid, x, z, shade)];
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  return out;
}

// Height in the shore band follows the distance field, so the waterline, the ripple lines and the
// collision all agree on where the shore is. Outside the band the baked DEM height is used.
function shoreShape(hBase, sd, level) {
  const a = Math.abs(sd);
  if (a >= SHAPE_BAND || !Number.isFinite(level)) return hBase;
  const target = level + (sd > 0 ? 0.16 * sd : 0.12 * sd);
  const w = 1 - smoothstep(SHAPE_BAND * 0.5, SHAPE_BAND, a);
  return lerp(hBase, target, w);
}

// The height things should stand on: the DEM reshaped in the shore band exactly as the mesh is.
export function surfaceAt(grid, x, z) {
  const h = grid.heightAt(x, z), sd = grid.shoreAt(x, z);
  if (Math.abs(sd) >= SHAPE_BAND) return h;
  return shoreShape(h, sd, grid.levelAt(x, z, 4));
}

// Gentle rock bumps a little way from the waterline (never across it).
function shoreBumps(x, z, sd) {
  const n = fbm(x * 0.07, z * 0.07, 2, 51) - 0.5;
  if (sd > 0) return Math.max(0, n) * 1.6 * smoothstep(3, 8, sd) * (1 - smoothstep(10, FINE_BAND, sd));
  return -Math.abs(n) * 0.5 * smoothstep(3, 8, -sd) * (1 - smoothstep(10, FINE_BAND, -sd));
}

// Quads [i0, i0+n) x [j0, j0+n) of cells. shade: Float32Array over the grid's local extent or null.
// fine=false (far field) skips the shore subdivision, shaping and bumps.
// Normals are smooth (one per vertex, averaged over the faces around it), computed over a one-cell ring
// beyond the chunk so the lighting is continuous across tile edges; the ring's triangles are then dropped.
// Colour stays one flat tone per face: smooth light under flat paint.
export function buildTerrainChunk(grid, i0, j0, n, { shade = null, fine = true, originX, originZ }) {
  const cell = grid.cell;
  const pos = [], col = [], bed = [], idx = [], idxAll = [];
  const stride = 2 * n + 7;
  const map = new Int32Array(stride * stride).fill(-1);
  const levelCache = fine ? new Float32Array(grid.side * grid.side).fill(NaN) : null;
  const levelNear = (x, z) => {
    const i = grid.cellI(x), j = grid.cellJ(z), k = grid.local(i, j);
    if (Number.isNaN(levelCache[k])) levelCache[k] = grid.levelAt(grid.cellX(i), grid.cellZ(j), 4);
    return levelCache[k];
  };
  const fineCell = (i, j) => Math.abs(grid.sdCell(i, j)) <= FINE_BAND;
  const quadFine = (i, j) => fine && (fineCell(i, j) || fineCell(i + 1, j) || fineCell(i, j + 1) || fineCell(i + 1, j + 1));
  const shadeAt = (x, z) => (shade ? shade[grid.local(grid.cellI(x), grid.cellJ(z))] : 0);
  const c = [0, 0, 0];
  const vert = (ii, jj) => {
    const key = (ii - 2 * (i0 - 1)) * stride + (jj - 2 * (j0 - 1));
    let v = map[key];
    if (v >= 0) return v;
    const i = ii >> 1, j = jj >> 1, a = ii & 1, b = jj & 1;
    const x = grid.cellX(i) + (a * cell) / 2, z = grid.cellZ(j) + (b * cell) / 2;
    let hBase;
    if (!a && !b) hBase = grid.hCell(i, j);
    else hBase = a && b ? (grid.hCell(i, j) + grid.hCell(i + 1, j) + grid.hCell(i, j + 1) + grid.hCell(i + 1, j + 1)) / 4
      : a ? (grid.hCell(i, j) + grid.hCell(i + 1, j)) / 2 : (grid.hCell(i, j) + grid.hCell(i, j + 1)) / 2;
    let h = hBase;
    const sd = grid.shoreAt(x, z);
    if (fine) {
      if (Math.abs(sd) < SHAPE_BAND) h = shoreShape(hBase, sd, levelNear(x, z));
      if (a || b) {
        // bumps only where every quad sharing this vertex is subdivided, so band edges stay watertight
        const interior = a && b ? quadFine(i, j) : a ? quadFine(i, j) && quadFine(i, j - 1) : quadFine(i, j) && quadFine(i - 1, j);
        if (interior) h += shoreBumps(x, z, sd);
      }
    }
    v = pos.length / 3;
    pos.push(x - originX, h, z - originZ);
    groundColor(grid, x, z, c, shadeAt(x, z));
    col.push(Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255));
    bed.push(sd < 0 ? 1 : 0);
    map[key] = v;
    return v;
  };
  let core = true;
  const quad = (a, b, c2, d, flip) => {
    if (flip) idxAll.push(a, c2, b, b, c2, d); else idxAll.push(a, c2, d, a, d, b);
    if (core) { if (flip) idx.push(a, c2, b, b, c2, d); else idx.push(a, c2, d, a, d, b); }
  };
  for (let j = j0 - 1; j < j0 + n + 1; j++) {
    for (let i = i0 - 1; i < i0 + n + 1; i++) {
      core = i >= i0 && i < i0 + n && j >= j0 && j < j0 + n;
      const flip = ((i + j) & 1) === 0;
      if (quadFine(i, j)) {
        for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
          const ii = 2 * i + a, jj = 2 * j + b;
          quad(vert(ii, jj), vert(ii + 1, jj), vert(ii, jj + 1), vert(ii + 1, jj + 1), flip !== (((a + b) & 1) === 1));
        }
      } else {
        quad(vert(2 * i, 2 * j), vert(2 * i + 2, 2 * j), vert(2 * i, 2 * j + 2), vert(2 * i + 2, 2 * j + 2), flip);
      }
    }
  }
  // smooth normals: every face around a vertex votes, weighted by its area (the unnormalised cross product)
  const nv = pos.length / 3;
  const acc = new Float32Array(nv * 3);
  for (let t = 0; t < idxAll.length; t += 3) {
    const a = idxAll[t], b = idxAll[t + 1], d = idxAll[t + 2];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[d * 3] - ax, vy = pos[d * 3 + 1] - ay, vz = pos[d * 3 + 2] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    for (const k of [a, b, d]) { acc[k * 3] += nx; acc[k * 3 + 1] += ny; acc[k * 3 + 2] += nz; }
  }
  const nrm = new Int8Array(nv * 3);
  for (let k = 0; k < nv; k++) {
    const x = acc[k * 3], y = acc[k * 3 + 1], z = acc[k * 3 + 2], L = Math.hypot(x, y, z) || 1;
    nrm[k * 3] = Math.round((x / L) * 127); nrm[k * 3 + 1] = Math.round((y / L) * 127); nrm[k * 3 + 2] = Math.round((z / L) * 127);
  }
  return { pos: new Float32Array(pos), col: new Uint8Array(col), nrm, bed: new Uint8Array(bed), idx: new Uint32Array(idx) };
}
