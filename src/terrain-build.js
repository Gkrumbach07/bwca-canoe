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
// The palette (the palette pass's values): the splat below blends these, the classes still name them.
const C = {
  // the lake bed by depth, seen through the water where it is clear: pale sand in the shallows, then
  // boulder-and-weed olive, then the dark green of a drop-off, then the near-black of a deep hole
  bedSand: hex(0xc4b894), bedShelf: hex(0x9fa478), bedWeed: hex(0x6f8a66), bedDeep: hex(0x4d6a63), bedHole: hex(0x3a5250),
  rock: hex(0x9e958a), rockDark: hex(0x666a70), rockLichen: hex(0xa4a58d),
  // the forest floor is needle duff, not grass: a calm warm tan in the sun (forest), golden in the sunny
  // stands (forestLight), a cool grey-brown under a thick canopy (forestDark); moss comes in below. The
  // meadow is a light yellow-green, the burn tawny; each lit colour has a cooler shade partner (SHADE, MOSS)
  forest: hex(0xa28a67), forestLight: hex(0xb09a6d), forestDark: hex(0x5c544e), meadow: hex(0xa6a857), burn: hex(0xb29a62),
};
// moss on the forest floor, lit and in the canopy's shade: the pair the duff's own lit/shade pair is mixed with
const MOSS = { lit: hex(0x87ad52), shade: hex(0x405f3a) };
// the shade partner of the open ground classes (under a tree at the meadow's edge, say)
const SHADE = { meadow: hex(0x697048), burn: hex(0x72664f) };
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
// classes are what the ground cover, the footsteps and the cover atlas read (one class per cell); the
// terrain itself blends the same fields into material weights (splatAt) and cuts only along the shoreline.
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
    const lichen = lichenField(x, z);
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
  const light = sunnyField(x, z);
  if (fields) fields[7] = light;
  return light >= 0 ? I.forestLight : I.forest;
}
const lichenField = (x, z) => fbm(x * 0.03, z * 0.03, 2, 91) - 0.58;
const sunnyField = (x, z) => fbm(x * 0.0035, z * 0.0035, 2, 7) - 0.6; // a few broad sunny stands, not a speckle of patches

const _pre = { sd: 0, slope: 0, rock: 0, depth: -1 };
export function groundClass(grid, x, z, shade = 0) {
  _pre.sd = grid.shoreAt(x, z);
  _pre.slope = rockSlope(grid, x, z);
  _pre.rock = _pre.sd < 0 ? 0 : rockAt(_pre.slope, _pre.sd, x, z);
  _pre.depth = _pre.sd < 0 ? Math.max(0, grid.levelAt(x, z, 3) - grid.heightAt(x, z)) + bedGrain(x, z) : -1;
  return classify(grid, x, z, shade, _pre);
}

// Where the forest floor is moss rather than duff: patches 8–20 m across from a low-frequency field. The
// terrain blends it in over a few metres (the shader's noise does the rest), so it is a weight, not a cut.
export const mossAt = (x, z) => smoothstep(0.44, 0.6, fbm(x * 0.05 + 13, z * 0.05, 2, 83));

// ---- the splat ------------------------------------------------------------------------------------------
// The ground is painted from eight materials, each a lit colour and the colour it takes under a thick canopy
// (the floor pass's lit/shade pairs). The terrain carries their weights per vertex as two vec4s
// (aSplatA = duff, moss, meadow, burn; aSplatB = rock, dark rock, lichen rock, shore) and the shader blends
// them through a world-space noise (terrain.js), so a transition is a soft irregular band a few metres wide.
// `shadeK` is how far each goes toward its shade colour under a full canopy.
const SHORE = { lit: hex(0x8e8670), shade: hex(0x66604f) }; // the damp margin a soil shore has at the waterline
export const SPLAT = [
  // the duff's shade partner a step lighter than forestDark: the trees' real shadows now fall on it as well,
  // with no toon floor to lift them, and together they went to charcoal
  { name: 'duff', lit: C.forest, shade: hex(0x6a5f55), shadeK: 0.9 },
  { name: 'moss', lit: MOSS.lit, shade: MOSS.shade, shadeK: 1 },
  { name: 'meadow', lit: C.meadow, shade: SHADE.meadow, shadeK: 0.7 },
  { name: 'burn', lit: C.burn, shade: SHADE.burn, shadeK: 0.7 },
  { name: 'rock', lit: C.rock, shade: hex(0x77736e), shadeK: 0.6 },
  { name: 'rockDark', lit: C.rockDark, shade: hex(0x52565c), shadeK: 0.6 },
  { name: 'rockLichen', lit: C.rockLichen, shade: hex(0x7c7d6c), shadeK: 0.6 },
  { name: 'shore', lit: SHORE.lit, shade: SHORE.shade, shadeK: 0.5 },
];
export const SPLAT_SUNNY = C.forestLight; // the duff's lit colour in the broad sunny stands
export const BED_PALETTE = [C.bedSand, C.bedShelf, C.bedWeed, C.bedDeep, C.bedHole];
export const BED_DEPTH_SCALE = 16; // aFloor.w is the bed depth over this many metres

// what each ground class reads as in the splat (the ground cover has only the class map to go on):
// [eight weights, canopy shade, sunny stand]
export const CLASS_SPLAT = GROUND.map((name) => {
  const w = new Array(8).fill(0);
  const slot = { forest: 0, forestLight: 0, forestDark: 0, meadow: 2, burn: 3, rock: 4, rockDark: 5, rockLichen: 6 }[name];
  w[slot === undefined ? 7 : slot] = 1;
  return { w, shade: name === 'forestDark' ? 0.8 : name === 'forest' ? 0.3 : 0, sunny: name === 'forestLight' ? 1 : 0 };
});

// smoothstep across a threshold: 0 below v = -w, 1 above v = w
const across = (v, w) => smoothstep(-w, w, v);

// The splat at one point: the same fields and the same priority as classify, each threshold widened into
// a blend. wA, wB: the eight weights (sum 1); fl: [canopy shade, sunny stand, bed, bed depth / BED_DEPTH_SCALE].
export function splatAt(x, z, shade, pre, wA, wB, fl) {
  if (pre.sd < 0) {
    wA[0] = wA[1] = wA[2] = wA[3] = 0; wB[0] = wB[1] = wB[2] = wB[3] = 0;
    fl[0] = 0; fl[1] = 0; fl[2] = 1; fl[3] = Math.min(1, Math.max(0, pre.depth) / BED_DEPTH_SCALE);
    return;
  }
  const rock = across(pre.rock - 0.5, 0.12);
  const dark = across(pre.slope - 0.55, 0.08);
  const lichen = across(lichenField(x, z), 0.05) * (1 - dark);
  const soil = 1 - rock;
  const burn = across(burnAt(x, z) - 0.5, 0.25);
  const meadow = across(clearingAt(x, z) - 0.68, 0.025) * (1 - burn);
  const forest = 1 - burn - meadow;
  const sunny = across(sunnyField(x, z), 0.03);
  const moss = mossAt(x, z) * (1 - 0.6 * sunny);
  const shore = (1 - smoothstep(0.3, 2.4, pre.sd)) * 0.9;
  const ground = soil * (1 - shore);
  wA[0] = ground * forest * (1 - moss); wA[1] = ground * forest * moss; wA[2] = ground * meadow; wA[3] = ground * burn;
  wB[0] = rock * (1 - dark - lichen); wB[1] = rock * dark; wB[2] = rock * lichen; wB[3] = soil * shore;
  fl[0] = shade * (1 - 0.8 * sunny); fl[1] = sunny; fl[2] = 0; fl[3] = 0;
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
// The ground is a splat: every vertex carries the weights of the eight ground materials (splatAt), the
// canopy shade and the bed depth, all interpolated, and the shader paints the blend (terrain.js). Only the
// shoreline cuts the mesh: where it crosses a cell, the cell is cut along it (marching squares) so an edge
// lies exactly on the waterline, and the crossing point is two vertices, one painted as land and one as
// lake bed, so neither side bleeds into the other. Every other transition is a blend.
export function buildTerrainChunk(grid, i0, j0, n, { shade = null, fine = true, originX, originZ }) {
  const cell = grid.cell;
  const pos = [], sa = [], sb = [], fl = [], sdv = [], idx = [], idxAll = [];
  const twins = []; // [land, bed] vertex pairs at the waterline: they share one normal
  const tees = [];  // [mid, end, end]: a subdivided cell's mid-edge vertex against an undivided neighbour
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
  const wA = [0, 0, 0, 0], wB = [0, 0, 0, 0], wf = [0, 0, 0, 0];
  const q8 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  // the splat of a point: sd is the shore distance it is painted with (a waterline twin forces its side)
  const paint = (x, z, h, sd) => {
    pre.sd = sd; pre.slope = sd < 0 ? 0 : rockSlope(grid, x, z); pre.rock = sd < 0 ? 0 : rockAt(pre.slope, sd, x, z);
    pre.depth = sd < 0 ? Math.max(0, (fine ? levelNear(x, z) : grid.levelAt(x, z, 2)) - h) + bedGrain(x, z) : -1;
    splatAt(x, z, shadeAt(x, z), pre, wA, wB, wf);
    for (let k = 0; k < 4; k++) { sa.push(q8(wA[k])); sb.push(q8(wB[k])); fl.push(q8(wf[k])); }
  };
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
        else tees.push(pos.length / 3, a ? ii - 1 : ii, a ? jj : jj - 1, a ? ii + 1 : ii, a ? jj : jj + 1); // its index, then its two ends' lattice keys
      }
    }
    v = pos.length / 3;
    pos.push(x - originX, h, z - originZ);
    sdv.push(sd);
    paint(x, z, h, sd);
    map[key] = v;
    return v;
  };
  // the point where the shoreline crosses the edge v-w, shared by the cells on both sides: a land vertex
  // and a bed vertex at the same place
  const crossMap = new Map();
  const crossing = (v, w) => {
    const key = v < w ? v * 1048576 + w : w * 1048576 + v;
    let m = crossMap.get(key);
    if (m !== undefined) return m;
    const rv = sdv[v], rw = sdv[w], t = rv / (rv - rw);
    const px = lerp(pos[v * 3], pos[w * 3], t), py = lerp(pos[v * 3 + 1], pos[w * 3 + 1], t), pz = lerp(pos[v * 3 + 2], pos[w * 3 + 2], t);
    const land = pos.length / 3;
    pos.push(px, py, pz); sdv.push(0); paint(px + originX, pz + originZ, py, 0);
    const bedV = pos.length / 3;
    pos.push(px, py, pz); sdv.push(-1e-3); paint(px + originX, pz + originZ, py, -1e-3);
    m = { land, bed: bedV };
    twins.push(land, bedV);
    crossMap.set(key, m);
    return m;
  };
  // A T-junction: the undivided neighbour sees only the edge's two ends, so the mid-edge vertex must carry
  // exactly their average or the paint and the light step along the band's edge (its height already is)
  const teeEnds = (k) => [vert(tees[k + 1], tees[k + 2]), vert(tees[k + 3], tees[k + 4])];
  const evenTees = () => {
    for (let k = 0; k < tees.length; k += 5) {
      const m = tees[k], [e0, e1] = teeEnds(k);
      for (let c = 0; c < 4; c++) {
        sa[m * 4 + c] = (sa[e0 * 4 + c] + sa[e1 * 4 + c]) >> 1; sb[m * 4 + c] = (sb[e0 * 4 + c] + sb[e1 * 4 + c]) >> 1; fl[m * 4 + c] = (fl[e0 * 4 + c] + fl[e1 * 4 + c]) >> 1;
      }
    }
  };
  let core = true;
  const tri = (a, b, c) => { idxAll.push(a, b, c); if (core) idx.push(a, b, c); };
  const fan = (poly) => { for (let k = 1; k < poly.length - 1; k++) tri(poly[k], poly[k + 1], poly[0]); };
  const quad = (a, b, c2, d, flip) => {
    const P = [a, c2, d, b]; // front-face order around the cell
    let changes = 0;
    for (let k = 0; k < 4; k++) if ((sdv[P[k]] >= 0) !== (sdv[P[(k + 1) % 4]] >= 0)) changes++;
    if (changes !== 2) { // no shoreline here (or a saddle): two plain triangles
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
  evenTees();
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
  // the two halves of a waterline vertex each saw only their own side's faces: give both the sum
  const joinTwins = (a3) => {
    for (let k = 0; k < twins.length; k += 2) {
      const a = twins[k] * 3, b = twins[k + 1] * 3;
      for (let c = 0; c < 3; c++) { const s = a3[a + c] + a3[b + c]; a3[a + c] = s; a3[b + c] = s; }
    }
  };
  joinTwins(acc);
  const unit = (a3) => { for (let k = 0; k < nv; k++) { const x = a3[k * 3], y = a3[k * 3 + 1], z = a3[k * 3 + 2], L = Math.hypot(x, y, z) || 1; a3[k * 3] = x / L; a3[k * 3 + 1] = y / L; a3[k * 3 + 2] = z / L; } };
  unit(acc);
  // Then smoothed twice over the faces around each vertex. The DEM is noisy at the 10 m cell, so the raw
  // normals of neighbouring vertices disagree and the smooth light kinked at every triangle edge, which drew
  // the mesh on the ground; smoothed, the light follows the landform, not the cells (the shader adds its own
  // fine relief, terrain.js). Ledges and the shore stay readable: the kernel is one ring wide, kept twice.
  let cur = acc, nxt = new Float32Array(nv * 3);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < nv * 3; k++) nxt[k] = cur[k] * 2;
    for (let t = 0; t < idxAll.length; t += 3) {
      const a = idxAll[t] * 3, b = idxAll[t + 1] * 3, d = idxAll[t + 2] * 3;
      for (let c = 0; c < 3; c++) { const sum = cur[a + c] + cur[b + c] + cur[d + c]; nxt[a + c] += sum; nxt[b + c] += sum; nxt[d + c] += sum; }
    }
    joinTwins(nxt); unit(nxt);
    const tmp = cur; cur = nxt; nxt = tmp;
  }
  for (let k = 0; k < tees.length; k += 5) {
    const m = tees[k] * 3, [e0, e1] = teeEnds(k);
    let x = cur[e0 * 3] + cur[e1 * 3], y = cur[e0 * 3 + 1] + cur[e1 * 3 + 1], z = cur[e0 * 3 + 2] + cur[e1 * 3 + 2];
    const L = Math.hypot(x, y, z) || 1; x /= L; y /= L; z /= L;
    cur[m] = x; cur[m + 1] = y; cur[m + 2] = z;
  }
  const nrm = new Int8Array(nv * 3);
  for (let k = 0; k < nv * 3; k++) nrm[k] = Math.round(cur[k] * 127);
  return { pos: new Float32Array(pos), nrm, splatA: new Uint8Array(sa), splatB: new Uint8Array(sb), floor: new Uint8Array(fl), idx: new Uint32Array(idx) };
}
