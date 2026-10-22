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
  // the lake bed by depth, seen through the water where it is clear: pale sand in the shallows, then
  // boulder-and-weed olive, then the dark green of a drop-off, then the near-black of a deep hole
  bedSand: hex(0xc4b894), bedShelf: hex(0x9fa478), bedWeed: hex(0x6f8a66), bedDeep: hex(0x4d6a63), bedHole: hex(0x3a5250),
  rock: hex(0x8f8d85), rockDark: hex(0x6f6d67), rockLichen: hex(0x9c9d8c),
  forest: hex(0x667f52), forestLight: hex(0x7b9360), forestDark: hex(0x546b47), meadow: hex(0x98a56a), burn: hex(0x9a8a5e),
};
// bed bands by water depth (metres); the depth carries a little grain so the bands are not rulers
export const BED_STEPS = [1.4, 3.2, 6.5, 13];
export const bedGrain = (x, z) => (fbm(x * 0.03, z * 0.03, 2, 61) - 0.5) * 1.2;

// The slope the rock decisions use: the raw 10 m slope is noisy enough at the 5 m shore vertices that
// thresholding it threw up isolated spikes (diamonds in the cut); a five-point average over 20 m keeps
// the real ledges and loses the specks, and every layer (terrain, forest, grass, boulders) shares it.
export function rockSlope(grid, x, z) {
  const e = grid.cell;
  return (grid.slopeAt(x, z) * 2 + grid.slopeAt(x + e, z) + grid.slopeAt(x - e, z) + grid.slopeAt(x, z + e) + grid.slopeAt(x, z - e)) / 6;
}

export const GROUND = Object.keys(C);                 // class index -> name
export const GROUND_PALETTE = GROUND.map((k) => C[k]); // class index -> linear rgb
const I = Object.fromEntries(GROUND.map((k, i) => [k, i]));

// Every class boundary is the zero crossing of a signed field (>= 0 inside), in this priority order. The
// terrain mesh is cut along whichever of them crosses a cell, so the patches have real outlines.
//   0 shoreline (land inside)   1 bedrock   2 dark rock (steep)   3 lichen rock   4 burn   5 meadow
//   6 dark forest (canopy shade)   7 light forest   8.. the bed's depth bands
export const NFIELDS = 8 + BED_STEPS.length;

// Which of the palette's classes a point of ground belongs to; also fills `fields` (NFIELDS signed values)
// when given. pre: { sd, slope, rock, depth } with depth the grained water depth over the bed (or -1 on land).
// Land runs rock or forest straight to the waterline, as Shield shores do; the water's foam line marks the edge.
export function classify(grid, x, z, shade, pre, fields = null) {
  if (fields) fields.fill(-1);
  const sd = pre.sd;
  if (fields) fields[0] = sd;
  if (sd < 0) {
    const d = pre.depth;
    if (fields) for (let k = 0; k < BED_STEPS.length; k++) fields[8 + k] = d - BED_STEPS[k];
    return d < BED_STEPS[0] ? I.bedSand : d < BED_STEPS[1] ? I.bedShelf : d < BED_STEPS[2] ? I.bedWeed : d < BED_STEPS[3] ? I.bedDeep : I.bedHole;
  }
  const slope = pre.slope, rock = pre.rock;
  if (fields) fields[1] = rock - 0.5;
  if (rock >= 0.5) {
    const dark = slope - 0.55;
    if (fields) fields[2] = dark;
    if (dark >= 0) return I.rockDark;
    const lichen = fbm(x * 0.03, z * 0.03, 2, 91) - 0.58;
    if (fields) fields[3] = lichen;
    return lichen >= 0 ? I.rockLichen : I.rock;
  }
  const burn = burnAt(x, z) - 0.5;
  if (fields) fields[4] = burn;
  if (burn >= 0) return I.burn;
  const meadow = clearingAt(x, z) - 0.68; // same field the forest uses for clearings
  if (fields) fields[5] = meadow;
  if (meadow >= 0) return I.meadow;
  const dark = shade - 0.55;
  if (fields) fields[6] = dark;
  if (dark >= 0) return I.forestDark;
  const light = fbm(x * 0.012, z * 0.012, 3, 7) - 0.55;
  if (fields) fields[7] = light;
  return light >= 0 ? I.forestLight : I.forest;
}

const _pre = { sd: 0, slope: 0, rock: 0, depth: -1 };
export function groundClass(grid, x, z, shade = 0) {
  _pre.sd = grid.shoreAt(x, z);
  _pre.slope = rockSlope(grid, x, z);
  _pre.rock = _pre.sd < 0 ? 0 : rockAt(_pre.slope, _pre.sd, x, z);
  _pre.depth = _pre.sd < 0 ? Math.max(0, grid.levelAt(x, z, 3) - grid.heightAt(x, z)) + bedGrain(x, z) : -1;
  return classify(grid, x, z, shade, _pre);
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
// Colour stays one flat tone per face: smooth light under flat paint. Where a class boundary (the
// shoreline, bedrock, a forest or bed band, see classify) crosses a cell, the cell is cut along that
// isoline (marching squares) so the patches get real outlines instead of the staircase of a grid
// classification; each part is coloured from one of its own corners. The shore cut puts an edge
// exactly on the waterline.
export function buildTerrainChunk(grid, i0, j0, n, { shade = null, fine = true, originX, originZ }) {
  const cell = grid.cell;
  const pos = [], col = [], bed = [], fv = [], idx = [], idxAll = [];
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
  const pre = { sd: 0, slope: 0, rock: 0, depth: -1 };
  const fields = new Float32Array(NFIELDS);
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
    pre.sd = sd; pre.slope = sd < 0 ? 0 : rockSlope(grid, x, z); pre.rock = sd < 0 ? 0 : rockAt(pre.slope, sd, x, z);
    pre.depth = sd < 0 ? Math.max(0, (fine ? levelNear(x, z) : grid.levelAt(x, z, 2)) - h) + bedGrain(x, z) : -1;
    const c = GROUND_PALETTE[classify(grid, x, z, shadeAt(x, z), pre, fields)];
    col.push(Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255));
    bed.push(sd < 0 ? 1 : 0);
    for (let f = 0; f < NFIELDS; f++) fv.push(fields[f]);
    map[key] = v;
    return v;
  };
  const field = (f, v) => fv[v * NFIELDS + f];
  // the point where field f's isoline crosses the edge v-w, shared by the cells on both sides
  const crossMap = new Map();
  const crossing = (f, v, w) => {
    const key = (v < w ? v * 1048576 + w : w * 1048576 + v) * 16 + f;
    let m = crossMap.get(key);
    if (m !== undefined) return m;
    const rv = field(f, v), rw = field(f, w), t = rv / (rv - rw);
    m = pos.length / 3;
    pos.push(lerp(pos[v * 3], pos[w * 3], t), lerp(pos[v * 3 + 1], pos[w * 3 + 1], t), lerp(pos[v * 3 + 2], pos[w * 3 + 2], t));
    const src = rv >= 0 ? w : v; // colour and flags from the outside end; the point is never a provoking vertex
    col.push(col[src * 3], col[src * 3 + 1], col[src * 3 + 2]);
    bed.push(bed[src]);
    for (let q = 0; q < NFIELDS; q++) fv.push(-1); // never read: crossings are not cell corners
    crossMap.set(key, m);
    return m;
  };
  let core = true;
  const tri = (a, b, c) => { idxAll.push(a, b, c); if (core) idx.push(a, b, c); };
  // fan a polygon (in front-face order) from one of its own corners, which the flat colour is taken from
  const fan = (poly, corners) => {
    const L = poly.length;
    let piv = 0;
    for (let k = 0; k < L; k++) if (corners.has(poly[k])) { piv = k; break; }
    const p0 = poly[piv];
    for (let k = 1; k < L - 1; k++) tri(poly[(piv + k) % L], poly[(piv + k + 1) % L], p0);
  };
  const quad = (a, b, c2, d, flip) => {
    const P = [a, c2, d, b]; // front-face order around the cell
    // the first field whose isoline crosses this cell cleanly (two sign changes) decides the cut
    let f = -1;
    for (let q = 0; q < NFIELDS && f < 0; q++) {
      let changes = 0;
      for (let k = 0; k < 4; k++) if ((field(q, P[k]) >= 0) !== (field(q, P[(k + 1) % 4]) >= 0)) changes++;
      if (changes === 2) f = q;
    }
    if (f < 0) {
      if (flip) { tri(a, c2, b); tri(b, c2, d); } else { tri(a, c2, d); tri(a, d, b); }
      return;
    }
    const inside = [], outside = [], corners = new Set(P);
    for (let k = 0; k < 4; k++) {
      const v = P[k], w = P[(k + 1) % 4], vin = field(f, v) >= 0;
      (vin ? inside : outside).push(v);
      if (vin !== (field(f, w) >= 0)) { const m = crossing(f, v, w); inside.push(m); outside.push(m); }
    }
    fan(inside, corners); fan(outside, corners);
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
    acc[a * 3] += nx; acc[a * 3 + 1] += ny; acc[a * 3 + 2] += nz;
    acc[b * 3] += nx; acc[b * 3 + 1] += ny; acc[b * 3 + 2] += nz;
    acc[d * 3] += nx; acc[d * 3 + 1] += ny; acc[d * 3 + 2] += nz;
  }
  const nrm = new Int8Array(nv * 3);
  for (let k = 0; k < nv; k++) {
    const x = acc[k * 3], y = acc[k * 3 + 1], z = acc[k * 3 + 2], L = Math.hypot(x, y, z) || 1;
    nrm[k * 3] = Math.round((x / L) * 127); nrm[k * 3 + 1] = Math.round((y / L) * 127); nrm[k * 3 + 2] = Math.round((z / L) * 127);
  }
  return { pos: new Float32Array(pos), col: new Uint8Array(col), nrm, bed: new Uint8Array(bed), idx: new Uint32Array(idx) };
}
