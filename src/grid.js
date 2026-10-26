// Spatial queries over a 10 m cell grid, shared by the streamed World (main thread, resolves cells through
// loaded tiles) and TileGrid (one baked tile with its halo, used by the build worker and for props).
// Subclasses provide: cell, originX, originZ, hCell(i, j) (metres), sdCell(i, j) (metres, + land / - water),
// lakeCell(i, j) (polygon id, 0 = land) and levelOf(lakeId).

// ---- d2 bake: tile format v4 ----------------------------------------------------------------------------------------
// A v4 fine tile is the v3 tile, side^2 cells of [height Int16 dm][lake Uint16][sdist Int16 dm][level Int16 dm], then one
// Uint8 plane of side^2 cells per channel (same halo), in the order of index.json `fields` after the first four
// (scripts/v4-products.mjs says what each holds):
//   ground  d1-ground kind: 0 no survey (keep today's fields), 1 upland, 2 open bog, 3 conifer bog, 4 shrub swamp,
//           5 marsh, 6 wet meadow, 7 hardwood swamp, 8 in-lake emergent, 9 aquatic bed, 10 rock outcrop, 11 boulder
//           field, 12 sand, 13 open water (on land: a pond OpenStreetMap lacks)
//   forest  forest type 0-23 (d1-forest-rock legend; 0 none, 1 water, 23 a tree class in Ontario)
//   canopy  height of the life form, dm (0 none)            cover  its cover, % (0 none)
//   rock    bedrock unit 1-19 (0 outside Minnesota)
//   cliff   (class << 6) | strength: 0 no LiDAR here, 1 LiDAR and nothing; class 1 boulder field and 2 talus or ledge
//           (strength = roughness / 4 cm), 3 face (strength = its relief in metres)
//   stone   surface stone cover, 254 sqrt(fraction) (255 no survey)
//   secchi  the water's Secchi depth, byte / 10 m (0 on land)        cdom  its CDOM, byte / 20 per m (0 on land)
// The level field is the water's own: 0 on land in v4 (v3 copied the height there), so ask it of water cells only.
// A v3 tile (the data-v3 release) is just the four: channels() is null and chCell answers 0, so every reader falls
// back to today's ground.
export const V4_FIELDS = ['height', 'lake', 'sdist', 'level', 'ground', 'forest', 'canopy', 'cover', 'rock', 'cliff', 'stone', 'secchi', 'cdom'];
// the Uint8 channels of a tile buffer of side^2 = n cells, as { name: Uint8Array } views, or null (a v3 tile)
export function tileChannels(buf, n, fields = V4_FIELDS) {
  if (!buf || buf.byteLength < n * 9) return null;
  const ch = {};
  for (let q = 4; q < fields.length; q++) { const at = 4 + q; if (buf.byteLength >= n * (at + 1)) ch[fields[q]] = new Uint8Array(buf, n * at, n); }
  return ch;
}
export const cliffClass = (c) => c >> 6;        // 0 nothing (or no LiDAR), 1 boulder field, 2 talus or ledge, 3 face
export const cliffStrength = (c) => c & 63;

export class GridQueries {
  // d2 bake: a v4 channel's byte at a cell (0 where the tile is v3 or not in)
  chCell() { return 0; }
  cellX(i) { return this.originX + (i + 0.5) * this.cell; }
  cellZ(j) { return this.originZ + (j + 0.5) * this.cell; }
  cellI(x) { return Math.floor((x - this.originX) / this.cell); }
  cellJ(z) { return Math.floor((z - this.originZ) / this.cell); }

  // Bilinear interpolation of a per-cell field sampled at cell centres.
  heightAt(x, z) {
    const fx = (x - this.originX) / this.cell - 0.5, fz = (z - this.originZ) / this.cell - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
    return (this.hCell(i, j) * (1 - ax) + this.hCell(i + 1, j) * ax) * (1 - az) + (this.hCell(i, j + 1) * (1 - ax) + this.hCell(i + 1, j + 1) * ax) * az;
  }
  shoreAt(x, z) {
    const fx = (x - this.originX) / this.cell - 0.5, fz = (z - this.originZ) / this.cell - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
    return (this.sdCell(i, j) * (1 - ax) + this.sdCell(i + 1, j) * ax) * (1 - az) + (this.sdCell(i, j + 1) * (1 - ax) + this.sdCell(i + 1, j + 1) * ax) * az;
  }
  isWater(x, z) { return this.shoreAt(x, z) < 0; }
  lakeIdAt(x, z) { return this.lakeCell(this.cellI(x), this.cellJ(z)); }

  // Water surface level at (x,z). p2 B: bilinear between the four cells round the point (the water patch draws it so,
  // water.js levelAt), a land corner standing in with the mean of the water corners; it was the level of the nearest
  // water cell, so on a graded river the canoe and the camera rode a 10 m staircase. With no water among the four, the
  // level of the nearest water cell within r cells, else the ground.
  levelAt(x, z, r = 6) {
    const fx = (x - this.originX) / this.cell - 0.5, fz = (z - this.originZ) / this.cell - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fz), ax = fx - i0, az = fz - j0;
    const w00 = this.lakeCell(i0, j0), w10 = this.lakeCell(i0 + 1, j0), w01 = this.lakeCell(i0, j0 + 1), w11 = this.lakeCell(i0 + 1, j0 + 1);
    if (w00 || w10 || w01 || w11) {
      let l00 = w00 ? this.levelCell(i0, j0) : 0, l10 = w10 ? this.levelCell(i0 + 1, j0) : 0;
      let l01 = w01 ? this.levelCell(i0, j0 + 1) : 0, l11 = w11 ? this.levelCell(i0 + 1, j0 + 1) : 0;
      if (!(w00 && w10 && w01 && w11)) {
        const m = (l00 + l10 + l01 + l11) / ((w00 ? 1 : 0) + (w10 ? 1 : 0) + (w01 ? 1 : 0) + (w11 ? 1 : 0));
        if (!w00) l00 = m; if (!w10) l10 = m; if (!w01) l01 = m; if (!w11) l11 = m;
      }
      return (l00 * (1 - ax) + l10 * ax) * (1 - az) + (l01 * (1 - ax) + l11 * ax) * az;
    }
    const ci = this.cellI(x), cj = this.cellJ(z);
    let bi = 0, bj = 0, bestD = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (!this.lakeCell(ci + di, cj + dj)) continue;
      const d = di * di + dj * dj;
      if (d < bestD) { bestD = d; bi = ci + di; bj = cj + dj; }
    }
    return bestD < Infinity ? this.levelCell(bi, bj) : this.heightAt(x, z);
  }

  slopeAt(x, z) {
    const e = this.cell;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(hx, hz) / (2 * e);
  }

  // Terrain surface normal (for placing props); out must have set() and normalize() (a THREE.Vector3).
  normalAt(x, z, out) {
    const e = this.cell * 0.5;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    out.set(-hx, 2 * e, -hz).normalize();
    return out;
  }

  // Direction (unit xz) from (x,z) toward deeper water: gradient of the shore distance.
  deeperDir(x, z) {
    const e = this.cell;
    const gx = this.shoreAt(x + e, z) - this.shoreAt(x - e, z);
    const gz = this.shoreAt(x, z + e) - this.shoreAt(x, z - e);
    const L = Math.hypot(gx, gz) || 1;
    return { x: -gx / L, z: -gz / L };
  }
}

// One baked tile: (tile + 2 * halo)^2 cells of height / lake id / shore distance / water level, addressed with global
// cell indices. Queries outside the halo clamp to its edge, which is why tiles carry a halo at all:
// every build (terrain, forest, props) can run from this one buffer alone.
export class TileGrid extends GridQueries {
  constructor(desc, tx, ty, buf, levelById, clarityById = null) {
    super();
    this.cell = desc.cell; this.originX = desc.originX; this.originZ = desc.originZ;
    this.tileSize = desc.tile; this.halo = desc.halo;
    this.side = desc.tile + 2 * desc.halo;
    this.i0 = tx * desc.tile - desc.halo; this.j0 = ty * desc.tile - desc.halo;
    const n = this.side * this.side;
    this.h = new Int16Array(buf, 0, n);
    this.lake = new Uint16Array(buf, n * 2, n);
    this.sd = new Int16Array(buf, n * 4, n);
    this.lvl = new Int16Array(buf, n * 6, n);
    this.levelById = levelById;
    this.clarityById = clarityById;
    this.ch = tileChannels(buf, n, desc.fields); // d2 bake: the v4 channels (null on a v3 tile)
  }
  local(i, j) {
    let li = i - this.i0, lj = j - this.j0;
    const m = this.side - 1;
    if (li < 0) li = 0; else if (li > m) li = m;
    if (lj < 0) lj = 0; else if (lj > m) lj = m;
    return lj * this.side + li;
  }
  hCell(i, j) { return this.h[this.local(i, j)] * 0.1; }
  sdCell(i, j) { return this.sd[this.local(i, j)] * 0.1; }
  lakeCell(i, j) { return this.lake[this.local(i, j)]; }
  levelCell(i, j) { return this.lvl[this.local(i, j)] * 0.1; }
  chCell(name, i, j) { const a = this.ch && this.ch[name]; return a ? a[this.local(i, j)] : 0; } // d2 bake
  levelOf(id) { return this.levelById[id]; }
  clarityOf(id) { return this.clarityById ? this.clarityById[id] || 2.6 : 2.6; }
}
