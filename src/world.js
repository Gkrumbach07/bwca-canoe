// The streamed world: index.json plus whatever tiles are loaded right now. Spatial queries resolve through
// the loaded fine tiles, fall back to the 80 m far field, and finally to a flat default, so nothing ever
// has to wait for a tile to answer a question.
import { GridQueries, TileGrid } from './grid.js';

export class World extends GridQueries {
  static async load(onProgress = () => {}) {
    const base = import.meta.env.BASE_URL + 'data/';
    onProgress(0.05, 'Reading map data…');
    const res = await fetch(base + 'index.json');
    if (!res.ok) throw new Error('no map data in public/data: run `npm run bake:all` (whole BWCA) or `npm run bake` (Lake One test area)');
    const index = await res.json();
    if (index.version !== 3) throw new Error('map data is from an older bake: run `npm run bake:all`');
    return new World(index, base);
  }

  constructor(index, base) {
    super();
    this.meta = index; this.base = base;
    const g = index.grid;
    this.cell = g.cell; this.originX = g.originX; this.originZ = g.originZ;
    this.width = g.width; this.height = g.height;
    this.tile = g.tile; this.halo = g.halo; this.side = g.tile + 2 * g.halo;
    this.ntx = g.ntx; this.nty = g.nty;
    this.tileMetres = g.tile * g.cell;
    this.far = g.far; this.farSide = g.far.tile + 2 * g.far.halo;
    this.sizeX = g.width * g.cell; this.sizeZ = g.height * g.cell;
    this.minX = g.originX; this.maxX = g.originX + this.sizeX;
    this.minZ = g.originZ; this.maxZ = g.originZ + this.sizeZ;
    this.slots = new Array(g.ntx * g.nty).fill(null);
    this.farSlots = new Array(g.far.ntx * g.far.nty).fill(null);
    this.lakes = index.lakes;
    this.basins = index.basins;
    this.portages = index.portages;
    this.campsites = index.campsites;
    this.entryPoints = index.entryPoints || [];
    this.tileFlags = index.tiles;
    this.levelById = new Float32Array(index.lakes.length + 1);
    this.clarityById = new Float32Array(index.lakes.length + 1).fill(2.6); // Secchi depth, metres
    for (const l of index.lakes) if (l) { this.levelById[l.id] = l.level; if (l.secchi) this.clarityById[l.id] = l.secchi; }
    for (const p of this.portages) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of p.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      p.bbox = [x0, z0, x1, z1];
    }
    this.gridDesc = { cell: g.cell, originX: g.originX, originZ: g.originZ, tile: g.tile, halo: g.halo };
  }

  // --- tiles ----------------------------------------------------------------
  tileUrl(tx, ty) { return `${this.base}tiles/${tx}_${ty}.bin`; }
  farUrl(fx, fy) { return `${this.base}far/${fx}_${fy}.bin`; }
  tileOrigin(tx, ty) { return [this.originX + tx * this.tileMetres, this.originZ + ty * this.tileMetres]; }
  tileOf(x, z) {
    const tx = Math.min(this.ntx - 1, Math.max(0, Math.floor((x - this.originX) / this.tileMetres)));
    const ty = Math.min(this.nty - 1, Math.max(0, Math.floor((z - this.originZ) / this.tileMetres)));
    return [tx, ty];
  }
  tileHasWater(tx, ty) { const t = this.tileFlags[ty * this.ntx + tx]; return !!(t && t[0]); }
  hasTile(tx, ty) { return !!this.slots[ty * this.ntx + tx]; }
  isReady(x, z) { const [tx, ty] = this.tileOf(x, z); return this.hasTile(tx, ty); }
  setTile(tx, ty, buf, cover = null) {
    const n = this.side * this.side;
    this.slots[ty * this.ntx + tx] = { buf, h: new Int16Array(buf, 0, n), lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n), lvl: new Int16Array(buf, n * 6, n), cover };
  }
  clearTile(tx, ty) { this.slots[ty * this.ntx + tx] = null; }
  tileGrid(tx, ty) { const s = this.slots[ty * this.ntx + tx]; return s ? new TileGrid(this.gridDesc, tx, ty, s.buf, this.levelById) : null; }
  setFar(fx, fy, buf) {
    const n = this.farSide * this.farSide;
    this.farSlots[fy * this.far.ntx + fx] = { buf, h: new Int16Array(buf, 0, n), lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n), lvl: new Int16Array(buf, n * 6, n) };
  }
  clearFar(fx, fy) { this.farSlots[fy * this.far.ntx + fx] = null; }
  hasFar(fx, fy) { return !!this.farSlots[fy * this.far.ntx + fx]; }

  // --- raw cell access: fine tile, else far field, else a flat default ---------------------------
  _fine(i, j) {
    const T = this.tile;
    const t = this.slots[((j / T) | 0) * this.ntx + ((i / T) | 0)];
    if (!t) return -1;
    return ((j % T) + this.halo) * this.side + (i % T) + this.halo;
  }
  _farIndex(i, j) {
    const f = this.far, fi = (i / f.factor) | 0, fj = (j / f.factor) | 0;
    const s = this.farSlots[((fj / f.tile) | 0) * f.ntx + ((fi / f.tile) | 0)];
    if (!s) return null;
    return { s, m: ((fj % f.tile) + f.halo) * this.farSide + (fi % f.tile) + f.halo };
  }
  hCell(i, j) {
    if (i < 0) i = 0; else if (i >= this.width) i = this.width - 1;
    if (j < 0) j = 0; else if (j >= this.height) j = this.height - 1;
    const T = this.tile, t = this.slots[((j / T) | 0) * this.ntx + ((i / T) | 0)];
    if (t) return t.h[((j % T) + this.halo) * this.side + (i % T) + this.halo] * 0.1;
    const f = this._farIndex(i, j);
    return f ? f.s.h[f.m] * 0.1 : 0;
  }
  sdCell(i, j) {
    if (i < 0) i = 0; else if (i >= this.width) i = this.width - 1;
    if (j < 0) j = 0; else if (j >= this.height) j = this.height - 1;
    const T = this.tile, t = this.slots[((j / T) | 0) * this.ntx + ((i / T) | 0)];
    if (t) return t.sd[((j % T) + this.halo) * this.side + (i % T) + this.halo] * 0.1;
    const f = this._farIndex(i, j);
    return f ? f.s.sd[f.m] * 0.1 : 3000;
  }
  lakeCell(i, j) {
    if (i < 0) i = 0; else if (i >= this.width) i = this.width - 1;
    if (j < 0) j = 0; else if (j >= this.height) j = this.height - 1;
    const T = this.tile, t = this.slots[((j / T) | 0) * this.ntx + ((i / T) | 0)];
    if (t) return t.lake[((j % T) + this.halo) * this.side + (i % T) + this.halo];
    const f = this._farIndex(i, j);
    return f ? f.s.lake[f.m] : 0;
  }
  // water level of a water cell (per cell: rivers and creeks descend along their course)
  levelCell(i, j) {
    if (i < 0) i = 0; else if (i >= this.width) i = this.width - 1;
    if (j < 0) j = 0; else if (j >= this.height) j = this.height - 1;
    const T = this.tile, t = this.slots[((j / T) | 0) * this.ntx + ((i / T) | 0)];
    if (t) return t.lvl[((j % T) + this.halo) * this.side + (i % T) + this.halo] * 0.1;
    const f = this._farIndex(i, j);
    return f ? f.s.lvl[f.m] * 0.1 : 0;
  }
  // ground cover of a cell (cover | gold << 8 | ground class << 16, see placement.js coverField); 0 until the fine tile is in
  coverCell(i, j) {
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return 0;
    const T = this.tile, t = this.slots[((j / T) | 0) * this.ntx + ((i / T) | 0)];
    if (!t || !t.cover) return 0;
    const k = (((j % T) + this.halo) * this.side + (i % T) + this.halo) * 4;
    return t.cover[k] | (t.cover[k + 1] << 8) | (t.cover[k + 2] << 16);
  }
  levelOf(id) { return this.levelById[id]; }
  clarityOf(id) { return this.clarityById[id] || 2.6; }
  // water clarity (Secchi depth) at a point: that of the water cell there, or the nearest within r cells
  clarityAt(x, z, r = 3) {
    const ci = this.cellI(x), cj = this.cellJ(z);
    let bestD = Infinity, best = 0;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const id = this.lakeCell(ci + di, cj + dj); if (!id) continue; const d = di * di + dj * dj; if (d < bestD) { bestD = d; best = id; } }
    return this.clarityOf(best);
  }

  inBounds(x, z, margin = 0) {
    return x > this.minX + margin && x < this.maxX - margin && z > this.minZ + margin && z < this.maxZ - margin;
  }

  lakeName(id) {
    const l = id > 0 ? this.lakes[id - 1] : null;
    if (!l) return null;
    return l.displayName || l.name || null;
  }

  toLatLon(x, z) {
    const p = this.meta.proj;
    return { lat: p.lat0 - z / p.mPerDegLat, lon: p.lon0 + x / p.mPerDegLon };
  }
  fromLatLon(lat, lon) {
    const p = this.meta.proj;
    return { x: (lon - p.lon0) * p.mPerDegLon, z: -(lat - p.lat0) * p.mPerDegLat };
  }
}
