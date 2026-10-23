// The streamed world: index.json plus whatever tiles are loaded right now. Spatial queries resolve through
// the loaded fine tiles, fall back to the 80 m far field, and finally to a flat default, so nothing ever
// has to wait for a tile to answer a question.
import { GridQueries, TileGrid } from './grid.js';

// Where the baked data lives: VITE_DATA_URL (a bucket behind a CDN, see docs/HOSTING.md), else `data/`
// under the app's own base path (public/data in development). Always ends in a slash.
export const DATA_URL = (() => {
  const u = import.meta.env.VITE_DATA_URL || import.meta.env.BASE_URL + 'data/';
  return u.endsWith('/') ? u : u + '/';
})();

// ---- lake clarity -------------------------------------------------------------------------------------------------
// How clear a lake is, as a Secchi depth in metres: how far down a white disc stays in sight, and so how far down the
// bed reads from a canoe (water.js, terrain.js). The DNR has sounded 301 of the 21,191 polygons (`secchiMeasured`);
// those stay exactly as measured. The bake gave every other one the inverse-distance mean of the sounded lakes within
// 15 km (rivers 0.8 of it), which keeps the region (the clear Shield lakes up the Gunflint, the browner west) but
// makes every lake in a district alike, near 2.7 m. A lake's own clarity in the Boundary Waters comes mostly from how
// much bog drains into it: deep basins in bare rock run clear (5-9 m), shallow lakes and ponds ringed by muskeg run
// tea-brown (1-2 m). From what the index knows of each lake, the estimate is that regional figure times:
//   depth   where the DNR's bathymetry gives a maximum depth: 0.514 x maxDepth^0.245, held to 0.7-1.5 (the fit of the
//           73 sounded lakes with a map: their Secchi over their region's, r = 0.51); 5 m -> 0.76, 15 m -> 1, 30 m -> 1.2
//   size    ponds below the size the DNR samples are mostly bog and beaver ponds: 0.55 at a fifth of a hectare up to 1
//           from 10 ha (lakes only: a river's polygons are short by how it is cut, not by what it is); the big lakes
//           over 400 ha up to 1.1 (the 14 sounded ones over 1000 ha read 1.07 of their region)
//   flow    creeks 0.85 (on top of the bake's 0.8 for running water: they drain the bogs)
//   name    a weak hint, since the names are old and not always right (Mud Lake #322 sounds 5 m, Clear Lake #215 2 m):
//           Mud, Bog, Muskeg, Marsh, Swamp, Rice, Manomin, Beaver, Muck, Tamarack 0.75; Clear, Crystal, Clearwater 1.2
//   known   a short list of clear lakes the DNR has not sounded, from paddlers' knowledge, set outright (CLEAR_LAKES)
// held to 0.8-8.5 m. What the index cannot give cheaply (the share of wetland along the shore or in the watershed, the
// relief round the basin) would sharpen it; it belongs in the bake, which sees the whole grid at once.
export const CLEAR_LAKES = [ // [name, centroid x, z (matched within 4 km), Secchi m]
  ['Indiana Lake', -28277, 8513, 6.0],
  ['Kekekabic Lake', 2124, 2722, 6.5],
  ['Ogishkemuncie Lake', 11040, -382, 6.0],
  ['Mountain Lake', 73819, -1934, 7.5],
  ['Rose Lake', 58384, -1448, 5.5],
  ['Duncan Lake', 56137, 1313, 5.0],
];
const STAINED_NAME = /\b(Mud|Bog|Muskeg|Marsh|Swamp|Rice|Manomin|Beaver|Muck|Tamarack)\b/i, CLEAR_NAME = /\b(Clear|Crystal|Clearwater)\b/i;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function estimateSecchi(l, cellArea = 100) {
  if (l.secchiMeasured) return l.secchi;
  const name = l.name || '';
  for (const [n, x, z, s] of CLEAR_LAKES) if (name === n && Math.hypot(l.cx - x, l.cz - z) < 4000) return s;
  let s = l.secchiBaked ?? l.secchi ?? 2.6;
  const lg = Math.log10(Math.max(0.01, (l.cells * cellArea) / 1e4)); // hectares
  if (l.maxDepth) s *= Math.min(1.5, Math.max(0.7, 0.514 * l.maxDepth ** 0.245));
  if (!l.river) s *= 0.55 + 0.45 * smooth(-0.7, 1.0, lg);
  s *= 1 + 0.1 * smooth(2.6, 3.4, lg);
  if (l.creek) s *= 0.85;
  if (STAINED_NAME.test(name)) s *= 0.75; else if (CLEAR_NAME.test(name)) s *= 1.2;
  return Math.min(8.5, Math.max(0.8, s));
}

export class World extends GridQueries {
  static async load(onProgress = () => {}, base = DATA_URL) {
    onProgress(0.05, 'Reading map data…');
    const res = await fetch(base + 'index.json').catch((e) => { throw new Error(`cannot reach ${base}index.json (${e.message})`); });
    if (!res.ok) throw new Error(base.startsWith('/') || base.startsWith(location.origin)
      ? 'no map data in public/data: run `npm run bake:all` (whole BWCA) or `npm run bake` (Lake One test area)'
      : `${res.status} fetching ${base}index.json: check VITE_DATA_URL and the bucket's CORS policy (docs/HOSTING.md)`);
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
    // the DNR's soundings as they are, every other lake's clarity estimated (estimateSecchi below); the record's own
    // `secchi` takes the estimate too, so the HUD, the journal and the fishing read what the water shows (the bake's
    // regional figure stays as `secchiBaked`)
    for (const l of index.lakes) {
      if (!l) continue;
      this.levelById[l.id] = l.level;
      if (!l.secchiMeasured) { l.secchiBaked = l.secchi; l.secchi = +estimateSecchi(l, g.cell * g.cell).toFixed(2); }
      if (l.secchi) this.clarityById[l.id] = l.secchi;
    }
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
  // ground cover of a cell (cover | gold << 8 | ground class << 16 | moss and canopy shade nibbles << 24, see
  // placement.js coverField and tile-worker.js packFloor; the grass's per-cell splat bytes follow these four);
  // 0 until the fine tile is in
  coverCell(i, j) {
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return 0;
    const T = this.tile, t = this.slots[((j / T) | 0) * this.ntx + ((i / T) | 0)];
    if (!t || !t.cover) return 0;
    const k = (((j % T) + this.halo) * this.side + (i % T) + this.halo) * 4;
    return (t.cover[k] | (t.cover[k + 1] << 8) | (t.cover[k + 2] << 16) | (t.cover[k + 3] << 24)) >>> 0;
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
