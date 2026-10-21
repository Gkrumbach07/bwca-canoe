// Loads the baked world (see scripts/bake.mjs) and answers spatial queries.

export class World {
  static async load(onProgress = () => {}) {
    const base = import.meta.env.BASE_URL + 'data/';
    const fetchBin = async (name, Ctor) => new Ctor(await (await fetch(base + name)).arrayBuffer());
    onProgress(0.05, 'Reading map data…');
    const meta = await (await fetch(base + 'world.json')).json();
    onProgress(0.15, 'Reading elevation…');
    const [height, lake, sdist] = await Promise.all([
      fetchBin('height.bin', Int16Array),
      fetchBin('lake.bin', Uint16Array),
      fetchBin('sdist.bin', Int16Array),
    ]);
    return new World(meta, height, lake, sdist);
  }

  constructor(meta, height, lake, sdist) {
    this.meta = meta;
    const g = meta.grid;
    this.width = g.width; this.height = g.height; this.cell = g.cell;
    this.originX = g.originX; this.originZ = g.originZ;
    this.sizeX = g.width * g.cell; this.sizeZ = g.height * g.cell;
    this.minX = g.originX; this.maxX = g.originX + this.sizeX;
    this.minZ = g.originZ; this.maxZ = g.originZ + this.sizeZ;
    this.h = height;     // decimetres
    this.lake = lake;    // lake polygon id per cell, 0 = land
    this.sd = Float32Array.from(sdist, (v) => v * 0.1); // metres, + land / - water (baked as decimetres)
    this.lakes = meta.lakes;
    this.basins = meta.basins;
    this.portages = meta.portages;
    this.campsites = meta.campsites;
    this.levelById = new Float32Array(meta.lakes.length + 1);
    for (const l of meta.lakes) if (l) this.levelById[l.id] = l.level;
  }

  // --- raw cell access -------------------------------------------------
  idx(i, j) { return j * this.width + i; }
  cellX(i) { return this.originX + (i + 0.5) * this.cell; }
  cellZ(j) { return this.originZ + (j + 0.5) * this.cell; }
  cellI(x) { return Math.floor((x - this.originX) / this.cell); }
  cellJ(z) { return Math.floor((z - this.originZ) / this.cell); }
  clampI(i) { return Math.min(this.width - 1, Math.max(0, i)); }
  clampJ(j) { return Math.min(this.height - 1, Math.max(0, j)); }
  hCell(i, j) { return this.h[this.idx(this.clampI(i), this.clampJ(j))] * 0.1; }
  sdCell(i, j) { return this.sd[this.idx(this.clampI(i), this.clampJ(j))]; }
  lakeCell(i, j) { return this.lake[this.idx(this.clampI(i), this.clampJ(j))]; }

  inBounds(x, z, margin = 0) {
    return x > this.minX + margin && x < this.maxX - margin && z > this.minZ + margin && z < this.maxZ - margin;
  }

  // Bilinear interpolation of a per-cell field sampled at cell centres.
  _bilinear(get, x, z) {
    const fx = (x - this.originX) / this.cell - 0.5, fz = (z - this.originZ) / this.cell - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    const ax = fx - i, az = fz - j;
    const a = get(i, j), b = get(i + 1, j), c = get(i, j + 1), d = get(i + 1, j + 1);
    return (a * (1 - ax) + b * ax) * (1 - az) + (c * (1 - ax) + d * ax) * az;
  }

  heightAt(x, z) { return this._bilinear((i, j) => this.hCell(i, j), x, z); }
  shoreAt(x, z) { return this._bilinear((i, j) => this.sdCell(i, j), x, z); }
  isWater(x, z) { return this.shoreAt(x, z) < 0; }
  lakeIdAt(x, z) { return this.lakeCell(this.cellI(x), this.cellJ(z)); }

  // Water surface level near (x,z): the level of the nearest water cell within r cells.
  levelAt(x, z, r = 6) {
    const ci = this.cellI(x), cj = this.cellJ(z);
    let best = -1, bestD = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const id = this.lakeCell(ci + di, cj + dj);
      if (!id) continue;
      const d = di * di + dj * dj;
      if (d < bestD) { bestD = d; best = id; }
    }
    return best > 0 ? this.levelById[best] : this.heightAt(x, z);
  }

  lakeName(id) {
    const l = id > 0 ? this.lakes[id - 1] : null;
    if (!l) return null;
    return l.displayName || l.name || null;
  }

  // Terrain surface normal (for placing props); cheap central differences.
  normalAt(x, z, out) {
    const e = this.cell * 0.5;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    out.set(-hx, 2 * e, -hz).normalize();
    return out;
  }

  slopeAt(x, z) {
    const e = this.cell;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(hx, hz) / (2 * e);
  }

  toLatLon(x, z) {
    const p = this.meta.proj;
    return { lat: p.lat0 - z / p.mPerDegLat, lon: p.lon0 + x / p.mPerDegLon };
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
