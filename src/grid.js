// Spatial queries over a 10 m cell grid, shared by the streamed World (main thread, resolves cells through
// loaded tiles) and TileGrid (one baked tile with its halo, used by the build worker and for props).
// Subclasses provide: cell, originX, originZ, hCell(i, j) (metres), sdCell(i, j) (metres, + land / - water),
// lakeCell(i, j) (polygon id, 0 = land) and levelOf(lakeId).

export class GridQueries {
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

  // Water surface level near (x,z): the level of the nearest water cell within r cells.
  levelAt(x, z, r = 6) {
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
  constructor(desc, tx, ty, buf, levelById) {
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
  levelOf(id) { return this.levelById[id]; }
}
