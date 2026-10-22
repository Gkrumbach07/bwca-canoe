// Terrain geometry for one tile (or one far-field chunk), built from a TileGrid. Pure data in, typed arrays
// out, so it runs in the build worker. Positions are relative to (originX, originZ), the tile corner, which
// keeps every vertex small enough for float32 however far the tile sits from the world origin.
import { fbm, lerp, smoothstep } from './rng.js';
import { clearingAt, burnAt } from './fields.js';

export const FINE_BAND = 25;    // metres either side of the shore that get 2x2 subdivision
export const SHAPE_BAND = 9;    // metres either side of the shore where height follows the distance field exactly

// sRGB hex -> linear rgb, the same conversion THREE.Color applies to hex colours
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hex = (h) => [lin(((h >> 16) & 255) / 255), lin(((h >> 8) & 255) / 255), lin((h & 255) / 255)];
// A fixed palette; every face gets exactly one of these (no gradients).
const C = {
  // the lake bed by depth, seen through the water where it is clear: pale sand in the shallows, then
  // boulder-and-weed olive, then the dark green of a drop-off, then the near-black of a deep hole
  bedSand: hex(0xc4b894), bedShelf: hex(0x9fa478), bedWeed: hex(0x6f8a66), bedDeep: hex(0x4d6a63), bedHole: hex(0x3a5250),
  sand: hex(0xc8b88d), rock: hex(0x8f8d85), rockDark: hex(0x6f6d67),
  forest: hex(0x667f52), forestLight: hex(0x7b9360), forestDark: hex(0x546b47), meadow: hex(0x98a56a), burn: hex(0x9a8a5e),
};

// Lake bed colour from the depth of water over it (metres), with a little grain so the bands are not rulers.
export function bedColor(depth, x, z) {
  const g = (fbm(x * 0.03, z * 0.03, 2, 61) - 0.5) * 1.2; // +- 0.6 m of wobble on the band edges
  const d = depth + g;
  if (d < 1.4) return C.bedSand;
  if (d < 3.2) return C.bedShelf;
  if (d < 6.5) return C.bedWeed;
  if (d < 13) return C.bedDeep;
  return C.bedHole;
}

export function groundColor(grid, x, z, out, shade = 0, depth = -1) {
  const sd = grid.shoreAt(x, z);
  let c;
  if (sd < 0) c = bedColor(depth >= 0 ? depth : Math.max(0, grid.levelAt(x, z, 3) - grid.heightAt(x, z)), x, z);
  else if (sd < 2.4) c = C.sand;
  else {
    const slope = grid.slopeAt(x, z);
    if (slope > 0.55) c = C.rockDark;
    else if (slope > 0.38) c = C.rock;
    else if (burnAt(x, z) > 0.5) c = C.burn;
    else if (clearingAt(x, z) > 0.68) c = C.meadow; // same field the forest uses for clearings
    else if (shade > 0.55) c = C.forestDark;
    else c = fbm(x * 0.012, z * 0.012, 3, 7) > 0.55 ? C.forestLight : C.forest;
  }
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
export function buildTerrainChunk(grid, i0, j0, n, { shade = null, fine = true, originX, originZ }) {
  const cell = grid.cell;
  const pos = [], col = [], idx = [];
  const stride = 2 * n + 3;
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
    const key = (ii - 2 * i0) * stride + (jj - 2 * j0);
    let v = map[key];
    if (v >= 0) return v;
    const i = ii >> 1, j = jj >> 1, a = ii & 1, b = jj & 1;
    const x = grid.cellX(i) + (a * cell) / 2, z = grid.cellZ(j) + (b * cell) / 2;
    let hBase;
    if (!a && !b) hBase = grid.hCell(i, j);
    else hBase = a && b ? (grid.hCell(i, j) + grid.hCell(i + 1, j) + grid.hCell(i, j + 1) + grid.hCell(i + 1, j + 1)) / 4
      : a ? (grid.hCell(i, j) + grid.hCell(i + 1, j)) / 2 : (grid.hCell(i, j) + grid.hCell(i, j + 1)) / 2;
    let h = hBase;
    if (fine) {
      const sd = grid.shoreAt(x, z);
      if (Math.abs(sd) < SHAPE_BAND) h = shoreShape(hBase, sd, levelNear(x, z));
      if (a || b) {
        // bumps only where every quad sharing this vertex is subdivided, so band edges stay watertight
        const interior = a && b ? quadFine(i, j) : a ? quadFine(i, j) && quadFine(i, j - 1) : quadFine(i, j) && quadFine(i - 1, j);
        if (interior) h += shoreBumps(x, z, sd);
      }
    }
    v = pos.length / 3;
    pos.push(x - originX, h, z - originZ);
    const sdv = fine ? grid.shoreAt(x, z) : grid.sdCell(i, j);
    groundColor(grid, x, z, c, shadeAt(x, z), sdv < 0 ? Math.max(0, (fine ? levelNear(x, z) : grid.levelAt(x, z, 2)) - h) : -1);
    col.push(Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255));
    map[key] = v;
    return v;
  };
  const quad = (a, b, c2, d, flip) => { if (flip) idx.push(a, c2, b, b, c2, d); else idx.push(a, c2, d, a, d, b); };
  for (let j = j0; j < j0 + n; j++) {
    for (let i = i0; i < i0 + n; i++) {
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
  return { pos: new Float32Array(pos), col: new Uint8Array(col), idx: new Uint32Array(idx) };
}
