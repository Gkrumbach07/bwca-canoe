#!/usr/bin/env node
// Bakes real-world data for the game into public/data:
//   - elevation from AWS Terrarium tiles (USGS 3DEP / SRTM derived, no auth needed)
//   - lakes, portages and campsites from OpenStreetMap (OSM API 0.6, no auth needed)
//
// Output files:
//   world.json  metadata, lakes (name + level), portages, campsites, start position
//   height.bin  Int16 terrain height in decimetres, row-major, row 0 = north edge
//   lake.bin    Uint16 lake id per cell (0 = land)
//   sdist.bin   Int16 signed distance to shore in metres (+ on land, - in water)

import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const CFG = {
  // Lake One -> Lake Two -> Lake Three -> Lake Four chain, BWCA entry point 30.
  bbox: { south: 47.875, west: -91.535, north: 47.945, east: -91.375 },
  cell: 10,            // metres per grid cell
  zoom: 14,            // terrarium tile zoom (~6.4 m/px at this latitude)
  ua: 'bwca-canoe-game/0.1 (local dev bake script)',
  cacheDir: 'data-cache',
  outDir: 'public/data',
  osmApi: 'https://api.openstreetmap.org/api/0.6',
  tileUrl: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
  maxLandDist: 3000,   // metres, clamp for the land side of the distance field
  portage: { maxEndToWater: 70, minLen: 15, maxLen: 2500 },
  // Fallback start: the Lake One landing at the end of the Fernberg road.
  startLatLon: [47.9417, -91.4645],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function cached(url, file, binary = false) {
  const p = path.join(CFG.cacheDir, file);
  try {
    return binary ? await fs.readFile(p) : await fs.readFile(p, 'utf8');
  } catch {}
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': CFG.ua } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      const data = binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
      await fs.writeFile(p, data);
      return data;
    } catch (e) {
      lastErr = e;
      log('retry', attempt + 1, String(e.message).slice(0, 80));
      await sleep(1500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

// ---------- projection -------------------------------------------------------

function makeProjection(bbox) {
  const lat0 = (bbox.south + bbox.north) / 2;
  const lon0 = (bbox.west + bbox.east) / 2;
  const phi = (lat0 * Math.PI) / 180;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
  const mPerDegLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  return {
    lat0, lon0, mPerDegLat, mPerDegLon,
    // x east, z south (so north is -z), metres from the bbox centre
    toLocal: (lat, lon) => [(lon - lon0) * mPerDegLon, -(lat - lat0) * mPerDegLat],
    toLatLon: (x, z) => [lat0 - z / mPerDegLat, lon0 + x / mPerDegLon],
  };
}

// ---------- OSM ----------------------------------------------------------------

async function fetchOsm(bbox) {
  const b = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  log('fetching OSM map data for', b);
  const txt = await cached(`${CFG.osmApi}/map.json?bbox=${b}`, `osm-map-${b}.json`);
  const base = JSON.parse(txt);
  const nodes = new Map(), ways = new Map(), rels = new Map();
  const ingest = (els) => {
    for (const e of els) {
      if (e.type === 'node') nodes.set(e.id, e);
      else if (e.type === 'way') ways.set(e.id, e);
      else if (e.type === 'relation') rels.set(e.id, e);
    }
  };
  ingest(base.elements);
  // The bbox call only returns the members inside the box; pull full water relations.
  const waterRels = [...rels.values()].filter((r) => r.tags && r.tags.natural === 'water');
  log(`found ${waterRels.length} water relations, fetching complete geometry`);
  for (const r of waterRels) {
    const t = await cached(`${CFG.osmApi}/relation/${r.id}/full.json`, `osm-rel-${r.id}.json`);
    ingest(JSON.parse(t).elements);
  }
  return { nodes, ways, rels };
}

function wayCoords(way, nodes, proj) {
  const out = [];
  for (const id of way.nodes) {
    const n = nodes.get(id);
    if (n) out.push(proj.toLocal(n.lat, n.lon));
  }
  return out;
}

// Stitch relation member ways into closed rings (by shared end nodes).
function assembleRings(wayList) {
  const remaining = wayList.map((w) => w.nodes.slice()).filter((n) => n.length >= 2);
  const rings = [];
  while (remaining.length) {
    let ring = remaining.pop();
    let guard = 0;
    while (ring[0] !== ring[ring.length - 1] && guard++ < 10000) {
      const end = ring[ring.length - 1];
      let found = false;
      for (let i = 0; i < remaining.length; i++) {
        const w = remaining[i];
        if (w[0] === end) { ring = ring.concat(w.slice(1)); remaining.splice(i, 1); found = true; break; }
        if (w[w.length - 1] === end) { ring = ring.concat(w.slice(0, -1).reverse()); remaining.splice(i, 1); found = true; break; }
      }
      if (!found) break;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

function collectLakes(osm, proj) {
  const { nodes, ways, rels } = osm;
  const lakes = [];
  const toXY = (ids) => ids.map((id) => nodes.get(id)).filter(Boolean).map((n) => proj.toLocal(n.lat, n.lon));
  for (const w of ways.values()) {
    if (!w.tags || w.tags.natural !== 'water') continue;
    if (w.tags.water === 'wetland') continue;
    const ring = toXY(w.nodes);
    if (ring.length >= 3) lakes.push({ osm: `way/${w.id}`, name: w.tags.name || null, rings: [ring] });
  }
  for (const r of rels.values()) {
    if (!r.tags || r.tags.natural !== 'water') continue;
    const outer = [], inner = [];
    for (const m of r.members || []) {
      if (m.type !== 'way') continue;
      const w = ways.get(m.ref);
      if (!w) continue;
      (m.role === 'inner' ? inner : outer).push(w);
    }
    const rings = [...assembleRings(outer), ...assembleRings(inner)].map(toXY).filter((rg) => rg.length >= 3);
    if (rings.length) lakes.push({ osm: `relation/${r.id}`, name: r.tags.name || null, rings });
  }
  // Big lakes first so small ponds / islands' inner lakes drawn later win.
  const area = (l) => l.rings.reduce((s, rg) => s + Math.abs(ringArea(rg)), 0);
  lakes.sort((a, b) => area(b) - area(a));
  return lakes;
}

function ringArea(rg) {
  let a = 0;
  for (let i = 0, n = rg.length; i < n; i++) {
    const [x1, z1] = rg[i], [x2, z2] = rg[(i + 1) % n];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

// ---------- grid -------------------------------------------------------------

function makeGrid(bbox, proj) {
  const [xw, zn] = proj.toLocal(bbox.north, bbox.west);
  const [xe, zs] = proj.toLocal(bbox.south, bbox.east);
  const width = Math.ceil((xe - xw) / CFG.cell);
  const height = Math.ceil((zs - zn) / CFG.cell);
  const originX = -(width * CFG.cell) / 2;
  const originZ = -(height * CFG.cell) / 2;
  return { width, height, cell: CFG.cell, originX, originZ,
    cx: (i) => originX + (i + 0.5) * CFG.cell,
    cz: (j) => originZ + (j + 0.5) * CFG.cell,
    ci: (x) => Math.floor((x - originX) / CFG.cell),
    cj: (z) => Math.floor((z - originZ) / CFG.cell) };
}

// Scanline rasterization with even-odd rule across all rings of a polygon.
function rasterizeLakes(lakes, grid, lakeId) {
  const { width, height, cell, originX, originZ } = grid;
  lakes.forEach((lake, idx) => {
    const id = idx + 1;
    let minZ = Infinity, maxZ = -Infinity;
    for (const rg of lake.rings) for (const [, z] of rg) { if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
    const j0 = Math.max(0, Math.floor((minZ - originZ) / cell)), j1 = Math.min(height - 1, Math.ceil((maxZ - originZ) / cell));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const zc = originZ + (j + 0.5) * cell;
      xs.length = 0;
      for (const rg of lake.rings) {
        for (let i = 0, n = rg.length; i < n; i++) {
          const [x1, z1] = rg[i], [x2, z2] = rg[(i + 1) % n];
          if ((z1 <= zc) !== (z2 <= zc)) xs.push(x1 + ((zc - z1) * (x2 - x1)) / (z2 - z1));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const ia = Math.max(0, Math.ceil((xs[k] - originX) / cell - 0.5));
        const ib = Math.min(width - 1, Math.floor((xs[k + 1] - originX) / cell - 0.5));
        for (let i = ia; i <= ib; i++) lakeId[j * width + i] = id;
      }
    }
  });
}

// Chamfer distance transform (1, sqrt2 weights) in cells to the nearest target cell.
function chamfer(width, height, isTarget) {
  const INF = 1e9, SQ2 = Math.SQRT2;
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = isTarget(i) ? 0 : INF;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x; let v = d[i]; if (v === 0) continue;
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) {
      v = Math.min(v, d[i - width] + 1);
      if (x > 0) v = Math.min(v, d[i - width - 1] + SQ2);
      if (x < width - 1) v = Math.min(v, d[i - width + 1] + SQ2);
    }
    d[i] = v;
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x; let v = d[i]; if (v === 0) continue;
    if (x < width - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < height - 1) {
      v = Math.min(v, d[i + width] + 1);
      if (x < width - 1) v = Math.min(v, d[i + width + 1] + SQ2);
      if (x > 0) v = Math.min(v, d[i + width - 1] + SQ2);
    }
    d[i] = v;
  }
  return d;
}

// ---------- elevation ----------------------------------------------------------

function mercPixel(lat, lon, z) {
  const n = 256 * 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return [x, y];
}

async function loadTiles(bbox, z) {
  const [x0, y0] = mercPixel(bbox.north, bbox.west, z);
  const [x1, y1] = mercPixel(bbox.south, bbox.east, z);
  const tx0 = Math.floor(x0 / 256) - 1, tx1 = Math.floor(x1 / 256) + 1;
  const ty0 = Math.floor(y0 / 256) - 1, ty1 = Math.floor(y1 / 256) + 1;
  const tiles = new Map();
  const jobs = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
    jobs.push((async () => {
      const buf = await cached(CFG.tileUrl(z, tx, ty), `terrarium-${z}-${tx}-${ty}.png`, true);
      const png = PNG.sync.read(buf);
      const h = new Float32Array(256 * 256);
      for (let p = 0; p < 256 * 256; p++) {
        const r = png.data[p * 4], g = png.data[p * 4 + 1], b = png.data[p * 4 + 2];
        h[p] = r * 256 + g + b / 256 - 32768;
      }
      tiles.set(`${tx},${ty}`, h);
    })());
  }
  log(`fetching ${jobs.length} elevation tiles at z${z}`);
  // modest concurrency
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8));
  const sample = (px, py) => {
    const tx = Math.floor(px / 256), ty = Math.floor(py / 256);
    const t = tiles.get(`${tx},${ty}`);
    if (!t) return 0;
    const lx = Math.min(255, Math.max(0, Math.floor(px - tx * 256)));
    const ly = Math.min(255, Math.max(0, Math.floor(py - ty * 256)));
    return t[ly * 256 + lx];
  };
  // bilinear over global pixel coordinates (pixel centres at +0.5)
  return (lat, lon) => {
    const [px, py] = mercPixel(lat, lon, z);
    const fx = px - 0.5, fy = py - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const ax = fx - ix, ay = fy - iy;
    const h00 = sample(ix, iy), h10 = sample(ix + 1, iy), h01 = sample(ix, iy + 1), h11 = sample(ix + 1, iy + 1);
    return (h00 * (1 - ax) + h10 * ax) * (1 - ay) + (h01 * (1 - ax) + h11 * ax) * ay;
  };
}

// ---------- portages & campsites --------------------------------------------------

function isPortageWay(w) {
  const t = w.tags || {};
  return t.highway === 'portage' || t.canoe === 'portage' || ['designated', 'yes', 'permissive'].includes(t.portage);
}

function chainPortages(osm) {
  const cands = [...osm.ways.values()].filter(isPortageWay);
  const degree = new Map();
  for (const w of cands) for (const id of [w.nodes[0], w.nodes[w.nodes.length - 1]]) degree.set(id, (degree.get(id) || 0) + 1);
  const used = new Set();
  const chains = [];
  for (const w of cands) {
    if (used.has(w.id)) continue;
    used.add(w.id);
    let nodes = w.nodes.slice();
    const names = new Set(w.tags.name ? [w.tags.name] : []);
    let grew = true;
    while (grew) {
      grew = false;
      for (const w2 of cands) {
        if (used.has(w2.id)) continue;
        const a = nodes[0], b = nodes[nodes.length - 1];
        const a2 = w2.nodes[0], b2 = w2.nodes[w2.nodes.length - 1];
        let next = null;
        if (b === a2 && degree.get(b) === 2) next = nodes.concat(w2.nodes.slice(1));
        else if (b === b2 && degree.get(b) === 2) next = nodes.concat(w2.nodes.slice(0, -1).reverse());
        else if (a === b2 && degree.get(a) === 2) next = w2.nodes.slice(0, -1).concat(nodes);
        else if (a === a2 && degree.get(a) === 2) next = w2.nodes.slice(1).reverse().concat(nodes);
        if (next) { nodes = next; used.add(w2.id); if (w2.tags.name) names.add(w2.tags.name); grew = true; }
      }
    }
    chains.push({ nodes, names: [...names], ids: [w.id] });
  }
  return chains;
}

function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

// Nearest comfortably-deep water cell to a point (for launching a canoe).
function findLaunch(x, z, grid, lakeId, sdist, maxCells = 10) {
  const ci = grid.ci(x), cj = grid.cj(z);
  let best = null;
  for (let dj = -maxCells; dj <= maxCells; dj++) for (let di = -maxCells; di <= maxCells; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) continue;
    const k = j * grid.width + i;
    if (!lakeId[k]) continue;
    const depth = -sdist[k]; // metres from shore, positive in water
    const d = Math.hypot(di, dj) * grid.cell;
    // want close to the trail end but at least ~1.5 cells from shore
    const score = d + Math.max(0, 15 - depth) * 3;
    if (!best || score < best.score) best = { score, x: grid.cx(i), z: grid.cz(j), lake: lakeId[k], dist: d };
  }
  return best;
}

// ---------- main -------------------------------------------------------------------

async function main() {
  await fs.mkdir(CFG.cacheDir, { recursive: true });
  await fs.mkdir(CFG.outDir, { recursive: true });
  const proj = makeProjection(CFG.bbox);
  const grid = makeGrid(CFG.bbox, proj);
  const { width, height } = grid;
  const N = width * height;
  log(`grid ${width} x ${height} cells of ${CFG.cell} m (${(width * CFG.cell / 1000).toFixed(1)} x ${(height * CFG.cell / 1000).toFixed(1)} km)`);

  const [osm, sampleElev] = await Promise.all([fetchOsm(CFG.bbox), loadTiles(CFG.bbox, CFG.zoom)]);

  // --- lakes
  const lakes = collectLakes(osm, proj);
  const lakeId = new Uint16Array(N);
  rasterizeLakes(lakes, grid, lakeId);
  log(`${lakes.length} water polygons rasterized`);

  // --- raw heights
  const h = new Float32Array(N);
  for (let j = 0; j < height; j++) {
    const z = grid.cz(j);
    for (let i = 0; i < width; i++) {
      const [lat, lon] = proj.toLatLon(grid.cx(i), z);
      h[j * width + i] = sampleElev(lat, lon);
    }
  }
  let hmin = Infinity, hmax = -Infinity;
  for (let k = 0; k < N; k++) { if (h[k] < hmin) hmin = h[k]; if (h[k] > hmax) hmax = h[k]; }
  log(`elevation range ${hmin.toFixed(1)} .. ${hmax.toFixed(1)} m`);

  // --- basins: connected water components share one level
  const basin = new Int32Array(N).fill(-1);
  const basins = [];
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (!lakeId[s] || basin[s] >= 0) continue;
    const b = basins.length;
    const cells = [];
    stack.push(s); basin[s] = b;
    while (stack.length) {
      const k = stack.pop(); cells.push(k);
      const x = k % width, y = (k - x) / width;
      const nb = [k - 1, k + 1, k - width, k + width];
      if (x === 0) nb[0] = -1; if (x === width - 1) nb[1] = -1; if (y === 0) nb[2] = -1; if (y === height - 1) nb[3] = -1;
      for (const n of nb) if (n >= 0 && lakeId[n] && basin[n] < 0) { basin[n] = b; stack.push(n); }
    }
    basins.push({ cells });
  }
  log(`${basins.length} water basins`);

  // --- distance fields (in cells) then signed metres
  const dToLand = chamfer(width, height, (k) => !lakeId[k]);   // for water cells
  const dToWater = chamfer(width, height, (k) => !!lakeId[k]); // for land cells
  const sdist = new Int16Array(N);
  for (let k = 0; k < N; k++) {
    const m = lakeId[k] ? -dToLand[k] * CFG.cell : Math.min(CFG.maxLandDist, dToWater[k] * CFG.cell);
    sdist[k] = Math.round(Math.max(-32000, Math.min(32000, m)));
  }

  // --- water level per basin: median of interior cells (robust to shoreline trees in the DEM)
  for (const b of basins) {
    const interior = b.cells.filter((k) => dToLand[k] >= 2);
    const src = (interior.length >= 8 ? interior : b.cells).map((k) => h[k]).sort((a, c) => a - c);
    // low percentile: shoreline trees leak into the DEM and bias the lake surface upward
    b.level = src[Math.floor(src.length * (interior.length >= 8 ? 0.3 : 0.12))];
  }
  const lakeLevel = new Float32Array(lakes.length + 1);
  const lakeArea = new Uint32Array(lakes.length + 1);
  const lakeBasin = new Int32Array(lakes.length + 1).fill(-1);
  for (let k = 0; k < N; k++) if (lakeId[k]) {
    lakeLevel[lakeId[k]] = basins[basin[k]].level; lakeArea[lakeId[k]]++;
    if (lakeBasin[lakeId[k]] < 0) lakeBasin[lakeId[k]] = basin[k];
  }
  // a basin is named after its largest named polygon (channels and bays are often unnamed)
  lakes.forEach((l, i) => {
    const id = i + 1, b = basins[lakeBasin[id]];
    if (!b || !l.name) return;
    if (lakeArea[id] > (b.nameArea || 0)) { b.name = l.name; b.nameArea = lakeArea[id]; }
  });
  const basinName = (id) => (id > 0 && basins[lakeBasin[id]]?.name) || lakes[id - 1]?.name || null;
  // Unnamed polygons (river channels, bays) take the name of the nearest named lake reachable by water.
  const displayName = new Array(lakes.length + 1).fill(null);
  {
    const cellsOf = Array.from({ length: lakes.length + 1 }, () => []);
    for (let k = 0; k < N; k++) if (lakeId[k]) cellsOf[lakeId[k]].push(k);
    const seen = new Uint8Array(N);
    for (let id = 1; id <= lakes.length; id++) {
      if (lakes[id - 1].name) { displayName[id] = lakes[id - 1].name; continue; }
      if (!cellsOf[id].length) continue;
      seen.fill(0);
      let frontier = cellsOf[id]; for (const k of frontier) seen[k] = 1;
      let found = null, steps = 0;
      while (frontier.length && !found && steps++ < 400) {
        const next = [];
        for (const k of frontier) {
          const x = k % width, y = (k - x) / width;
          const nb = [x > 0 ? k - 1 : -1, x < width - 1 ? k + 1 : -1, y > 0 ? k - width : -1, y < height - 1 ? k + width : -1];
          for (const n of nb) {
            if (n < 0 || seen[n] || !lakeId[n]) continue;
            seen[n] = 1;
            if (lakes[lakeId[n] - 1].name) { found = lakes[lakeId[n] - 1].name; break; }
            next.push(n);
          }
          if (found) break;
        }
        frontier = next;
      }
      displayName[id] = found;
    }
  }

  // --- carve lake beds and lift shores so water and terrain meet cleanly
  const out = new Float32Array(h);
  for (let k = 0; k < N; k++) {
    if (lakeId[k]) {
      const level = basins[basin[k]].level;
      const dm = dToLand[k] * CFG.cell;
      const depth = Math.min(14, 0.6 + dm * 0.09);
      out[k] = Math.min(h[k], level - depth);
    }
  }
  // shoreline land: must sit above the neighbouring water level
  for (let k = 0; k < N; k++) {
    if (lakeId[k] || dToWater[k] > 4.5) continue;
    const x = k % width, y = (k - x) / width;
    let lvl = -Infinity;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const n = yy * width + xx;
      if (lakeId[n]) lvl = Math.max(lvl, basins[basin[n]].level);
    }
    // a bank that climbs away from the shore instead of a flat terrace
    if (lvl > -Infinity) out[k] = Math.max(out[k], lvl + 0.3 + Math.max(0, dToWater[k] - 1) * 1.1);
  }

  // --- portages
  const chains = chainPortages(osm);
  const portages = [];
  for (const c of chains) {
    const pts = c.nodes.map((id) => osm.nodes.get(id)).filter(Boolean).map((n) => proj.toLocal(n.lat, n.lon));
    if (pts.length < 2) continue;
    const len = polyLength(pts);
    if (len < CFG.portage.minLen || len > CFG.portage.maxLen) continue;
    const ends = [pts[0], pts[pts.length - 1]];
    const inside = ends.every(([x, z]) => grid.ci(x) >= 0 && grid.ci(x) < width && grid.cj(z) >= 0 && grid.cj(z) < height);
    if (!inside) continue;
    const launches = ends.map(([x, z]) => findLaunch(x, z, grid, lakeId, sdist));
    if (launches.some((l) => !l || l.dist > CFG.portage.maxEndToWater)) { log('  skip (not between waters):', c.names.join('/') || c.ids[0], Math.round(len) + 'm'); continue; }
    const lakeName = (id) => displayName[id] || 'an unnamed lake';
    const name = c.names.find((n) => !/^portage$/i.test(n)) ||
      `${lakeName(launches[0].lake)} – ${lakeName(launches[1].lake)}`;
    portages.push({
      name,
      lengthM: Math.round(len),
      rods: Math.round(len / 5.0292),
      pts: pts.map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]),
      launch: launches.map((l) => ({ x: +l.x.toFixed(1), z: +l.z.toFixed(1), lake: l.lake })),
    });
  }
  log(`${portages.length} portages kept of ${chains.length} candidate trails`);
  for (const p of portages) log('  ', p.name, p.rods + ' rods');

  // --- campsites
  const campsites = [];
  for (const n of osm.nodes.values()) {
    if (!n.tags || n.tags.tourism !== 'camp_site') continue;
    const [x, z] = proj.toLocal(n.lat, n.lon);
    const i = grid.ci(x), j = grid.cj(z);
    if (i < 1 || j < 1 || i >= width - 1 || j >= height - 1) continue;
    const k = j * width + i;
    campsites.push({ x: +x.toFixed(1), z: +z.toFixed(1), name: n.tags.name || null, onWater: !!lakeId[k], shore: sdist[k] });
  }
  log(`${campsites.length} campsites`);

  // --- start position
  let start = null;
  for (const n of osm.nodes.values()) {
    const t = n.tags || {};
    if (t.leisure === 'slipway' || (t.amenity === 'parking' && /lake one/i.test(t.name || ''))) {
      const [x, z] = proj.toLocal(n.lat, n.lon);
      const l = findLaunch(x, z, grid, lakeId, sdist, 25);
      if (l && basinName(l.lake) === 'Lake One') { start = l; log('start from OSM', t.leisure || t.amenity, t.name || ''); break; }
    }
  }
  if (!start) {
    const [x, z] = proj.toLocal(...CFG.startLatLon);
    start = findLaunch(x, z, grid, lakeId, sdist, 40);
    log('start from fallback coordinates');
  }

  // --- write
  const hq = new Int16Array(N);
  for (let k = 0; k < N; k++) hq[k] = Math.round(out[k] * 10);
  const lakeMeta = lakes.map((l, i) => {
    const id = i + 1;
    if (!lakeArea[id]) return null;
    return { id, name: l.name, displayName: displayName[id], basin: lakeBasin[id], level: +lakeLevel[id].toFixed(2), cells: lakeArea[id], osm: l.osm };
  });
  const basinMeta = basins.map((b, i) => ({ id: i, name: b.name || null, level: +b.level.toFixed(2), cells: b.cells.length }));
  const world = {
    source: {
      elevation: 'AWS Terrarium tiles (Mapzen/USGS 3DEP, SRTM) z' + CFG.zoom,
      map: '© OpenStreetMap contributors, ODbL',
      baked: new Date().toISOString(),
    },
    bbox: CFG.bbox,
    proj: { lat0: proj.lat0, lon0: proj.lon0, mPerDegLat: proj.mPerDegLat, mPerDegLon: proj.mPerDegLon },
    grid: { width, height, cell: CFG.cell, originX: grid.originX, originZ: grid.originZ },
    heightRange: [hmin, hmax],
    lakes: lakeMeta,
    basins: basinMeta,
    portages,
    campsites,
    start: { x: start.x, z: start.z, lake: start.lake },
  };
  await fs.writeFile(path.join(CFG.outDir, 'world.json'), JSON.stringify(world));
  await fs.writeFile(path.join(CFG.outDir, 'height.bin'), Buffer.from(hq.buffer));
  await fs.writeFile(path.join(CFG.outDir, 'lake.bin'), Buffer.from(lakeId.buffer));
  await fs.writeFile(path.join(CFG.outDir, 'sdist.bin'), Buffer.from(sdist.buffer));
  const waterCells = lakeId.reduce((s, v) => s + (v ? 1 : 0), 0);
  log(`done. water covers ${(100 * waterCells / N).toFixed(1)}% of ${N} cells; start at`, start.x, start.z, 'on', basinName(start.lake));
}

main().catch((e) => { console.error(e); process.exit(1); });
