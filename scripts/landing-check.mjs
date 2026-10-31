#!/usr/bin/env node
// Checks every entry point's landing against a data release: the put-in, the landing on the shore, the dock and the
// outfitter's store (with its porch, steps and canoe rack), placed exactly as the game places them (props.js
// landingPlan, loaded through Vite so the game's own code runs) and sampled on the release's tiles.
//
//   node scripts/landing-check.mjs [--data public/data] [--ep 30,25] [--ground 10|2] [--json out.json] [--quiet] [--search]
//
// --search: for a store on steep ground, the put-ins nearby whose landing stands lowest (a `from`) and the sites in the
// landing's frame flattest on both grounds (a `store`), for src/landings.json.
//
// What fails:
//   put-in    the entry point's own spot is not on water (shore distance >= 0 or no lake there)
//   landing   the anchor the landing walked to is not at the shore (|shore distance - 1.1| > 1), or lies more than
//             150 m from the put-in (or 60 m past the put-in's own distance from the shore)
//   dock      its far end not over water, the water there shallower than 0.3 m where deeper is in reach along its line, its deck less than
//             0.3 m or more than 1.0 m over the highest water under it, or no bank under its land end
//   store     any of its footprint (the store, its porch or stoop, the rack) on a water cell or under the drawn water
//             (ground below the level of water within one cell), its floor less than 0.3 m over the water's level near
//             it, or the ground under it rising more than 2.5 m (a foundation taller than a man)
// The water's level near a spot: the highest level of the lake cells within 30 m (the level the drawn water patch
// reaches there); the shore distance and the lake id as the tile says.
// Each landing is checked twice: on the 10 m ground (the game with ?detail=10) and on the 2 m LiDAR ground the game
// streams in near the player (the release's detail/2m chunks, drawn as detail-build.js chunkGround draws them; --ground
// 10 or 2 for one of them). The site is chosen on the 10 m ground and kept, as the game keeps it, and what stands on the
// ground is fitted to the ground checked. On each, the whole outfitter is built as the game builds it (props.js
// buildOutfitterNow: the dock, the store, the rack, their meshes and the walker's obstacles from one plan), and also
// fails:
//   floor     the drawn ground poking up within 0.1 m of the store's floor anywhere under it (a 0.5 m lattice)
//   collision the obstacles and the meshes apart: the floor's top, the porch deck's, each tread's and the dock deck's
//             more than 4 cm from the boards drawn there; a wall, a shelf or the rack's box (one with no top) with nothing
//             drawn inside it (a blocker in empty air); a point of the store's walls drawn (their outer 12 cm, 0.5 to 2 m
//             over the floor) outside every box (a wall walked through). The meshes are sampled at points 8 cm apart.
//   blocking  the store, its porch, steps or rack within 2 m of a portage trail; the walker's way from the foot of the
//             store's steps to the foot of the dock's and up onto its deck running into anything over a step; the door
//             turned more than 75 degrees from that way (a note from 50)
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(arg('--data', path.join(root, 'public/data'))) + '/';
const only = arg('--ep', null) ? new Set(arg('--ep').split(',').map(Number)) : null;
const jsonOut = arg('--json', null), quiet = process.argv.includes('--quiet'), search = process.argv.includes('--search');
const grounds = arg('--ground', null) ? [arg('--ground')] : ['10', '2'];

// the canvases the store's signs and the props' atlas draw on: nothing in node (their pixels are not checked)
const ctx2d = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'getImageData' || k === 'createImageData' ? (a, b, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h })
    : k === 'measureText' ? (q) => ({ width: String(q).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
      : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, toDataURL: () => '' }) };
const vite = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
let props, gridMod, terrain, detailBuild;
try {
  props = await vite.ssrLoadModule('/src/props.js');
  gridMod = await vite.ssrLoadModule('/src/grid.js');
  terrain = await vite.ssrLoadModule('/src/terrain-build.js');
  detailBuild = await vite.ssrLoadModule('/src/detail-build.js');
} catch (e) { await vite.close(); throw e; }
const { TileGrid, GridQueries } = gridMod;

const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const g = index.grid;
const desc = { cell: g.cell, originX: g.originX, originZ: g.originZ, tile: g.tile, halo: g.halo, fields: index.version >= 4 ? index.fields : undefined };
const levelById = new Float32Array(index.lakes.length + 1);
for (const l of index.lakes) if (l) levelById[l.id] = l.level;

const tiles = new Map();
function tileGrid(tx, ty) {
  const k = `${tx},${ty}`;
  if (!tiles.has(k)) {
    let tg = null;
    try {
      const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${tx}_${ty}.bin`));
      tg = new TileGrid(desc, tx, ty, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), levelById);
    } catch { /* no tile: all land at 0 */ }
    tiles.set(k, tg);
  }
  return tiles.get(k);
}
// The whole map's cells from the tiles' cores: the ground the game draws across tile seams, and the world props.js
// reads (outfitters.js profiles it).
class WorldGrid extends GridQueries {
  constructor() {
    super();
    this.cell = g.cell; this.originX = g.originX; this.originZ = g.originZ; this.tile = g.tile;
    this.ntx = g.ntx; this.nty = g.nty; this.tileMetres = g.tile * g.cell; this.meta = index;
    this.lakes = index.lakes; this.basins = index.basins; this.portages = index.portages; this.campsites = index.campsites;
    this.entryPoints = index.entryPoints; this.levelById = levelById;
  }
  at(i, j) {
    const tx = Math.min(g.ntx - 1, Math.max(0, Math.floor(i / g.tile))), ty = Math.min(g.nty - 1, Math.max(0, Math.floor(j / g.tile)));
    return tileGrid(tx, ty);
  }
  hCell(i, j) { const t = this.at(i, j); return t ? t.hCell(i, j) : 0; }
  sdCell(i, j) { const t = this.at(i, j); return t ? t.sdCell(i, j) : 100; }
  lakeCell(i, j) { const t = this.at(i, j); return t ? t.lakeCell(i, j) : 0; }
  levelCell(i, j) { const t = this.at(i, j); return t ? t.levelCell(i, j) : 0; }
  levelOf(id) { return levelById[id]; }
  tileOrigin(tx, ty) { return [g.originX + tx * this.tileMetres, g.originZ + ty * this.tileMetres]; }
  isReady() { return true; }
}
const world = new WorldGrid();
const cache = new Map();
const H10 = (x, z) => terrain.meshHeightAt(world, x, z, cache);
let H = H10; // the ground the landing is checked on (H10, or H2 below)
// The 2 m ground as the game draws it inside a chunk (detail-build.js chunkGround: the LiDAR on land, the 10 m bed under
// water, eased at the waterline), or the 10 m mesh where the release has no chunk. (The blend into a coarser neighbour
// over a chunk's last 50 m is left out: in the game the chunks round the player are all in.)
let detailIndex = null;
try { detailIndex = JSON.parse(fs.readFileSync(dataDir + 'detail/index.json', 'utf8')); } catch { /* no detail: 10 m only */ }
const chunks2 = new Map();
function chunk2(x, z) {
  if (!detailIndex) return null;
  const L = detailIndex.levels['2'], gox = g.originX + g.cell / 2, goz = g.originZ + g.cell / 2;
  const gx = Math.floor((x - gox) / L.size), gy = Math.floor((z - goz) / L.size), tx = Math.floor(gx / L.perTile), ty = Math.floor(gy / L.perTile);
  const name = `${tx}_${ty}_${gx - tx * L.perTile}_${gy - ty * L.perTile}`;
  if (!chunks2.has(name)) {
    let G = null;
    if ((detailIndex.chunks['2'] || {})[name]) {
      const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}detail/${L.dir}/${name}.bin`));
      const D = detailBuild.decodeChunk(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
      G = detailBuild.chunkGround(world, D, cache).L;
    }
    chunks2.set(name, G);
  }
  return chunks2.get(name);
}
const H2 = (x, z) => { const L = chunk2(x, z); if (L) { const y = detailBuild.latticeAt(L, x, z); if (y === y) return y; } return H10(x, z); };
// the drawn water's level at (x, z): the highest level of the lake cells whose quads reach within r metres, or null
function waterNear(x, z, r = 30) {
  const ci = world.cellI(x), cj = world.cellJ(z), n = Math.ceil(r / g.cell);
  let best = null;
  for (let dj = -n; dj <= n + 1; dj++) for (let di = -n; di <= n + 1; di++) {
    const i = ci + di, j = cj + dj;
    if (!world.lakeCell(i, j)) continue;
    if (Math.hypot(world.cellX(i) - x, world.cellZ(j) - z) > r + g.cell) continue;
    const l = world.levelCell(i, j);
    if (best === null || l > best) best = l;
  }
  return best;
}
// under the drawn water: a water quad covers (x, z) (a corner of its cell quad is a lake cell) and the ground is below it
function flooded(x, z) {
  const fx = (x - g.originX) / g.cell - 0.5, fz = (z - g.originZ) / g.cell - 0.5, i = Math.floor(fx), j = Math.floor(fz);
  let lv = -Infinity;
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (world.lakeCell(i + a, j + b)) lv = Math.max(lv, world.levelCell(i + a, j + b));
  return lv > -Infinity && H(x, z) < lv + 0.02 ? lv : null;
}

const r2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? v : +v.toFixed(2));
const lakeName = (id) => { const l = id > 0 ? index.lakes[id - 1] : null; return l ? l.displayName || l.name || `lake ${id}` : '—'; };

// The outfitter's obstacles against its own meshes, the ground under its floor and what it stands in the way of. B:
// props.buildOutfitterNow's; F, P, S: the landing's frame, plan and store site. Pushes to fails and notes; returns the numbers.
function outfitterChecks(B, ctx, F, P, S, ep, fails, notes) {
  const Lo = B.layout, obs = B.obs, R = 0.32;
  if (!Lo) { fails.push('no store built'); return {}; }
  const c = Lo.centre, A = Lo.axes.a, Bv = Lo.axes.b, { hW, hD } = Lo.size, floorY = Lo.floorY;
  const toS = (x, z) => { const dx = x - c.x, dz = z - c.z; return [dx * A.x + dz * A.z, dx * Bv.x + dz * Bv.z]; };
  const W = (a, b) => [c.x + A.x * a + Bv.x * b, c.z + A.z * a + Bv.z * b];
  // the drawn vertices, world (the glass left out: it stops nothing)
  const vx = [], vy = [], vz = [], vs = [];
  B.sub.traverse((m) => {
    if (!m.isMesh || /glass/.test(m.name)) return;
    m.updateMatrixWorld(true);
    // points over the surface drawn, no more than 8 cm apart (a long rail is two triangles end to end)
    const p = m.geometry.getAttribute('position'), idx = m.geometry.index, e = m.matrixWorld.elements, store = m.name === `store ${ep.ep}` ? 1 : 0;
    const P = (i) => { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); return [e[0] * x + e[4] * y + e[8] * z + e[12] + ctx.ox, e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14] + ctx.oz]; };
    const nt = idx ? idx.count / 3 : p.count / 3;
    for (let t = 0; t < nt; t++) {
      const A = P(idx ? idx.getX(t * 3) : t * 3), Bq = P(idx ? idx.getX(t * 3 + 1) : t * 3 + 1), Cq = P(idx ? idx.getX(t * 3 + 2) : t * 3 + 2);
      const L = Math.max(Math.hypot(A[0] - Bq[0], A[1] - Bq[1], A[2] - Bq[2]), Math.hypot(A[0] - Cq[0], A[1] - Cq[1], A[2] - Cq[2]), Math.hypot(Bq[0] - Cq[0], Bq[1] - Cq[1], Bq[2] - Cq[2]));
      const k = Math.min(120, Math.max(1, Math.ceil(L / 0.08)));
      for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
        const u = i / k, v = j / k, w = 1 - u - v;
        vx.push(A[0] * w + Bq[0] * u + Cq[0] * v); vy.push(A[1] * w + Bq[1] * u + Cq[1] * v); vz.push(A[2] * w + Bq[2] * u + Cq[2] * v); vs.push(store);
      }
    }
  });
  const n = vx.length;
  // the points by 0.5 m cell, for the queries round each obstacle
  const cellK = (x, z) => Math.floor(x * 2) * 100003 + Math.floor(z * 2), hash = new Map();
  for (let i = 0; i < n; i++) { const k = cellK(vx[i], vz[i]); let a = hash.get(k); if (!a) hash.set(k, (a = [])); a.push(i); }
  const near = (o, g, fn) => {
    const r = (o.box ? Math.hypot(o.hx, o.hz) : o.r) + Math.max(0, g) + 0.01;
    for (let cx = Math.floor((o.x - r) * 2); cx <= Math.floor((o.x + r) * 2); cx++) for (let cz = Math.floor((o.z - r) * 2); cz <= Math.floor((o.z + r) * 2); cz++) {
      const a = hash.get(cx * 100003 + cz); if (!a) continue;
      for (const i of a) if (inBox(o, vx[i], vz[i], g) && fn(i)) return;
    }
  };
  const inBox = (o, x, z, g = 0) => {
    const dx = x - o.x, dz = z - o.z;
    if (!o.box) return dx * dx + dz * dz <= (o.r + g) ** 2;
    return Math.abs(dx * o.ux + dz * o.uz) <= o.hx + g && Math.abs(-dx * o.uz + dz * o.ux) <= o.hz + g;
  };
  // 1. the ground under the floor
  let poke = -Infinity;
  for (let a = -hW + 0.2; a <= hW - 0.2 + 1e-6; a += 0.5) for (let b = -hD + 0.2; b <= hD - 0.2 + 1e-6; b += 0.5) { const [x, z] = W(a, b); poke = Math.max(poke, H(x, z) - floorY); }
  if (poke > -0.1) fails.push(`floor: the ground ${r2(poke)} m from the floor's top under it`);
  // 2. what is stood on (a top): boards drawn at its top; 3. what stops (no top): something drawn inside it
  let topErr = 0, topWhat = '', empty = 0;
  for (const o of obs) {
    if (o.top !== undefined && o.box && !o.wall) {
      let best = Infinity;
      near(o, -0.02, (i) => { if (Math.abs(vy[i] - o.top) < 0.3) best = Math.min(best, Math.abs(vy[i] - o.top)); return false; });
      if (best > topErr) { topErr = best; topWhat = o.store ? 'floor/deck' : o.stair ? 'tread' : 'dock deck'; }
    } else if (o.top === undefined || o.wall) {
      let any = false;
      near(o, 0.02, (i) => (any = vy[i] > H(vx[i], vz[i]) - 0.3));
      if (!any) { empty++; if (process.env.DEBUG) console.log('empty', JSON.stringify(o), 'ground', H(o.x, o.z).toFixed(2), 'floor', floorY.toFixed(2)); }
    }
  }
  if (topErr > 0.04) fails.push(`collision: a ${topWhat}'s top ${topErr === Infinity ? 'over nothing drawn' : r2(topErr) + ' m from the boards drawn there'}`);
  if (empty) fails.push(`collision: ${empty} obstacles with nothing drawn in them`);
  // 4. the walls' vertices (the shell's band 0.5 to 2 m over the floor, the outer 15 cm) each inside an obstacle
  const stops = obs.filter((o) => o.top === undefined || o.wall);
  const stopsNear = (x, z) => stops.filter((o) => Math.abs(o.x - x) < (o.box ? o.hx + o.hz : o.r) + 0.1 && Math.abs(o.z - z) < (o.box ? o.hx + o.hz : o.r) + 0.1);
  let through = 0;
  for (let i = 0; i < n; i++) {
    if (!vs[i] || vy[i] < floorY + 0.5 || vy[i] > floorY + 2.0) continue;
    const [a, b] = toS(vx[i], vz[i]);
    const wallA = Math.abs(a) >= hW - 0.12 && Math.abs(a) <= hW && Math.abs(b) <= hD, wallB = Math.abs(b) >= hD - 0.12 && Math.abs(b) <= hD && Math.abs(a) <= hW;
    if (!wallA && !wallB) continue;
    if (!stopsNear(vx[i], vz[i]).some((o) => inBox(o, vx[i], vz[i], 0.02))) through++;
  }
  if (through) fails.push(`collision: ${through} vertices of the store's walls outside every obstacle`);
  // 5. blocking: a portage trail near the store, the porch, the steps or the rack
  const yardObs = obs.filter((o) => !(o.box && o.top !== undefined && !o.store && !o.stair && !o.wall)); // (not the dock's deck)
  let trail = Infinity, trailName = '';
  for (const p of world.portages) {
    const [bx0, bz0, bx1, bz1] = p.bbox || [-Infinity, -Infinity, Infinity, Infinity];
    if (bx1 < c.x - 80 || bx0 > c.x + 80 || bz1 < c.z - 80 || bz0 > c.z + 80) continue;
    for (let k = 0; k + 1 < p.pts.length; k++) {
      const [x0, z0] = p.pts[k], [x1, z1] = p.pts[k + 1], L = Math.hypot(x1 - x0, z1 - z0), m = Math.max(1, Math.ceil(L / 0.5));
      for (let j = 0; j <= m; j++) {
        const x = x0 + ((x1 - x0) * j) / m, z = z0 + ((z1 - z0) * j) / m;
        if (Math.hypot(x - c.x, z - c.z) > 40) continue;
        for (const o of yardObs) { const dx = x - o.x, dz = z - o.z; let d; if (o.box) { const a = Math.abs(dx * o.ux + dz * o.uz) - o.hx, b = Math.abs(-dx * o.uz + dz * o.ux) - o.hz; d = Math.hypot(Math.max(0, a), Math.max(0, b)); } else d = Math.max(0, Math.hypot(dx, dz) - o.r); if (d < trail) { trail = d; trailName = p.name; } }
      }
    }
  }
  if (trail < 2) fails.push(`blocking: ${trailName} passes ${r2(trail)} m from the store`);
  // the way down from the steps to the dock: the walker's circle clear of everything taller than a step
  // (from the foot of the store's steps to the foot of the dock's, then up them onto its deck)
  const sf = Lo.stepsFoot, dl = Lo.dockLand, df = Lo.dockFoot || dl, l1 = Math.hypot(df.x - sf.x, df.z - sf.z), l2 = Math.hypot(dl.x - df.x, dl.z - df.z), steps = Math.ceil((l1 + l2) / 0.1);
  let path = null;
  let y = H(sf.x, sf.z);
  for (let k = 0; k <= steps && !path; k++) {
    const t = ((l1 + l2) * k) / steps, [p, q, u] = t <= l1 ? [sf, df, l1 ? t / l1 : 1] : [df, dl, l2 ? (t - l1) / l2 : 1];
    const x = p.x + (q.x - p.x) * u, z = p.z + (q.z - p.z) * u;
    let ny = H(x, z); // what he stands on there (player.js supportAt): the ground, or a top within a step over his feet
    for (const o of obs) if (o.top !== undefined && o.top > ny && o.top <= y + 0.35 && inBox(o, x, z)) ny = o.top;
    y = ny;
    for (const o of obs) { if (o.top !== undefined && o.top <= y + 0.35) continue; if (inBox(o, x, z, R - 0.04)) { path = o; if (process.env.DEBUG) console.log('path', k, steps, (l1 / (l1 + l2)).toFixed(2), 'y', y.toFixed(2), 'top', o.top, 'ground', H(x, z).toFixed(2), JSON.stringify(Lo.dockFoot), JSON.stringify(o)); break; } }
  }
  if (path) fails.push(`blocking: the way from the steps to the dock runs into ${path.stair ? 'a tread' : path.wall ? 'a rail' : path.store ? 'the porch' : path.top !== undefined ? 'the dock' : 'an obstacle'}`);
  // the door toward the dock
  const [da, db] = toS(dl.x, dl.z), doorDeg = (Math.atan2(Math.abs(da - (-0.25)), db - hD) * 180) / Math.PI;
  if (doorDeg > 75) fails.push(`blocking: the door turned ${r2(doorDeg)} degrees from the dock`);
  else if (doorDeg > 50) notes.push(`door ${r2(doorDeg)} degrees from the dock`);
  return { poke: r2(poke), topErr: r2(topErr), empty, through, trail: r2(trail), doorDeg: r2(doorDeg), toWater: r2(world.shoreAt(c.x, c.z)), toDock: r2(Math.hypot(c.x - dl.x, c.z - dl.z)) };
}

const rows = [];
for (const mode of grounds) for (const ep of index.entryPoints) {
  if (only && !only.has(ep.ep)) continue;
  H = mode === '2' ? H2 : H10;
  const [tx, ty] = [Math.floor((ep.x - g.originX) / (g.tile * g.cell)), Math.floor((ep.z - g.originZ) / (g.tile * g.cell))];
  const tg = tileGrid(tx, ty);
  const [ox, oz] = world.tileOrigin(tx, ty);
  const ctx = { tg, world, H, Hsite: H10, ox, oz, obstacles: [] }; // (the site chosen on the 10 m ground, as the game chooses it)
  const fails = [], notes = [];
  // the put-in
  const sdEp = world.shoreAt(ep.x, ep.z), lakeEp = world.lakeIdAt(ep.x, ep.z);
  if (!(sdEp < 0 && lakeEp)) fails.push(`put-in on land (shore ${r2(sdEp)} m)`);
  // the plan
  const P = props.landingPlan(ctx, ep), F = P.F, D = P.dock, S = P.site;
  const sdA = world.shoreAt(P.x, P.z), far = Math.hypot(P.x - ep.x, P.z - ep.z);
  if (Math.abs(sdA - 1.1) > 1) fails.push(`landing not at the shore (shore ${r2(sdA)} m, ${r2(far)} m from the put-in)`);
  if (far > Math.max(150, -sdEp + 60)) fails.push(`landing ${far.toFixed(0)} m from the put-in`);
  // the dock
  const [ex, ez] = F.W(0, D.len), lvEnd = world.levelAt(ex, ez), gEnd = H(ex, ez), depthEnd = lvEnd - gEnd;
  let under = -Infinity; // the highest water under the dock
  for (let b = D.back; b <= D.len; b += 0.5) { const [x, z] = F.W(0, b); if (world.shoreAt(x, z) < 0.5) under = Math.max(under, world.levelAt(x, z, 2)); }
  const deckOver = D.deckY - (under > -Infinity ? under : D.level);
  if (world.shoreAt(ex, ez) >= 0) fails.push(`dock end on land (shore ${r2(world.shoreAt(ex, ez))} m)`);
  if (depthEnd < 0.3) {
    // shallow water: a fail unless there is no deeper water along the dock's line within 18 m (a creek, a flat bed)
    let deepest = -Infinity;
    for (let b = 0; b <= 18; b += 0.5) { const [x, z] = F.W(0, b); if (world.shoreAt(x, z) < 0) deepest = Math.max(deepest, world.levelAt(x, z, 2) - H(x, z)); }
    if (deepest > depthEnd + 0.1) fails.push(`dock end in ${r2(depthEnd)} m of water (${r2(deepest)} m within 18 m)`);
    else notes.push(`shallow water: the dock's end in ${r2(depthEnd)} m, the deepest along it within 18 m ${r2(deepest)} m`);
  }
  if (deckOver < 0.3 || deckOver > 1.0) fails.push(`dock deck ${r2(deckOver)} m over the water`);
  if (D.sill <= -6) fails.push('no bank under the dock\'s land end');
  // the store, its porch or stoop and its steps' landing, and the rack
  const { ao, b0, floorY } = S, hD = 4.0, hW = 3.0;
  let gmin = Infinity, gmax = -Infinity, wl = -Infinity, wet = 0, flood = 0, worstUnder = 0;
  const pts = [];
  for (let a = -hW; a <= hW + 1e-6; a += 1) for (let c = -hD; c <= hD + P.pd + 1e-6; c += 1) pts.push([ao + a, b0 + c]);
  const ra = ao + (ao > 1 ? hW + 2.3 : -(hW + 2.3));
  for (let a = -0.7; a <= 0.71; a += 0.7) for (let c = -1.3; c <= 1.31; c += 0.65) pts.push([ra + a, b0 + 1.2 + c]);
  for (const [a, c] of pts) {
    const [x, z] = F.W(a, c), y = H(x, z);
    gmin = Math.min(gmin, y); gmax = Math.max(gmax, y);
    const w = waterNear(x, z); if (w !== null) wl = Math.max(wl, w);
    if (world.lakeIdAt(x, z) || world.shoreAt(x, z) < 0) wet++;
    const f = flooded(x, z); if (f !== null) { flood++; worstUnder = Math.max(worstUnder, f - y); }
  }
  const clear = wl > -Infinity ? floorY - wl : null;
  if (wet) fails.push(`store: ${wet} of its spots on water cells`);
  if (flood) fails.push(`store: ${flood} of its spots under the drawn water (to ${r2(worstUnder)} m)`);
  if (clear !== null && clear < 0.3) fails.push(`store floor ${r2(clear)} m over the water`);
  if (floorY - gmin > 2.5) fails.push(`store on steep ground (floor ${r2(floorY - gmin)} m over its lowest ground)`);
  if (S.fallback) notes.push('store site: fallback');
  // --search: for a landing on steep ground, the put-ins on the same water within 150 m whose landing stands lowest (a
  // `from` for src/landings.json)
  if (search && floorY - gmin > 2.5) {
    const tried = [];
    for (let r = 15; r <= 150; r += 15) for (let k = 0; k < Math.round(r / 3); k++) {
      const t = (k / Math.round(r / 3)) * Math.PI * 2, x = Math.round(ep.x + Math.cos(t) * r), z = Math.round(ep.z + Math.sin(t) * r);
      if (!(world.shoreAt(x, z) < -1) || world.lakeIdAt(x, z) !== lakeEp) continue;
      const Q = props.landingPlan(ctx, { ...ep, x, z });
      let lo = Infinity;
      for (let a = -3; a <= 3; a += 1) for (let c = -4; c <= 4; c += 1) { const [px, pz] = Q.F.W(Q.site.ao + a, Q.site.b0 + c); lo = Math.min(lo, H(px, pz)); }
      tried.push({ from: [x, z], rise: r2(Q.site.floorY - lo), shore: [r2(Q.x), r2(Q.z)], dist: r2(Math.hypot(Q.x - ep.x, Q.z - ep.z)) });
    }
    tried.sort((a, b) => a.rise - b.rise || a.dist - b.dist);
    notes.push('search: ' + tried.slice(0, 4).map((t) => JSON.stringify(t)).join(' '));
  }
  // the outfitter built as the game builds it, on this ground: its obstacles against its meshes, and what it blocks
  const B = props.buildOutfitterNow(ctx, ep), Lo = B.layout, sub = B.sub, extra = outfitterChecks(B, ctx, F, P, S, ep, fails, notes);
  // --search, a store on steep ground: the sites in this landing's frame whose floor stands lowest over its lowest ground
  // on both grounds (a `store` for src/landings.json; check it with a run after)
  if (search && floorY - gmin > 2.5) {
    const tried = [];
    for (let b0 = -11.5; b0 >= -32; b0 -= 1) for (let ao = -12.5; ao <= 12.5; ao += 2.5) {
      let worst = 0, dry = true;
      for (const G of [H10, H2]) {
        let lo = Infinity, hi = -Infinity;
        for (let a = -hW - 0.5; a <= hW + 0.5; a += 1) for (let c = -hD; c <= hD + P.pd; c += 1) { const [x, z] = F.W(ao + a, b0 + c); const y = G(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y); if (world.shoreAt(x, z) < 1.5) dry = false; }
        worst = Math.max(worst, hi - lo);
      }
      if (dry) tried.push({ store: [ao, b0], spread: r2(worst), score: worst + 0.04 * (Math.abs(b0 + 12) + Math.abs(ao)) });
    }
    tried.sort((a, b) => a.score - b.score);
    notes.push('search (store): ' + tried.slice(0, 5).map((t) => JSON.stringify({ store: t.store, spread: t.spread })).join(' '));
  }
  const row = {
    ep: ep.ep, name: ep.name, ground: mode, ...extra, lake: lakeName(lakeEp || ep.lake), putIn: { shore: r2(sdEp), lake: lakeEp },
    landing: { x: r2(P.x), z: r2(P.z), shore: r2(sdA), fromPutIn: r2(far), level: r2(P.level) },
    dock: { deckY: r2(D.deckY), level: r2(D.level), deckOver: r2(deckOver), endDepth: r2(depthEnd), sill: r2(D.sill), len: D.len },
    store: { ao, b0, floorY: r2(floorY), water: wl > -Infinity ? r2(wl) : null, clear: r2(clear), groundMin: r2(gmin), groundMax: r2(gmax), wet, under: flood, worstUnder: r2(worstUnder), fallback: !!S.fallback, centre: F.W(ao, b0).map(r2) },
    fails, notes,
  };
  rows.push(row);
}
await vite.close();

const bad = rows.filter((r) => r.fails.length);
const kinds = {};
for (const r of bad) for (const f of r.fails) { const k = f.replace(/[-\d.]+/g, '#').replace(/\(.*\)/, '').trim(); kinds[k] = (kinds[k] || 0) + 1; }
if (!quiet) for (const r of rows) {
  const s = r.store;
  console.log(`${String(r.ep).padStart(2)} ${String(r.ground).padStart(2)}m ${(r.name + ' / ' + r.lake).slice(0, 40).padEnd(40)} ${r.fails.length ? 'FAIL' : 'ok  '} poke ${r.poke} door ${r.doorDeg}° trail ${r.trail} floor ${s.floorY} water ${s.water} clear ${s.clear} ground ${s.groundMin}..${s.groundMax} dock over ${r.dock.deckOver} end ${r.dock.endDepth} m${r.notes.length ? ' · ' + r.notes.join(', ') : ''}`);
  for (const f of r.fails) console.log(`     - ${f}`);
}
for (const m of grounds) { const rs = rows.filter((r) => r.ground === m); console.log(`\n${dataDir} on the ${m} m ground: ${rs.length} entry points, ${rs.filter((r) => !r.fails.length).length} pass, ${rs.filter((r) => r.fails.length).length} fail`); }
for (const [k, n] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
const worst = rows.filter((r) => r.store.clear !== null).sort((a, b) => a.store.clear - b.store.clear).slice(0, 8);
console.log('lowest store floors over the water: ' + worst.map((r) => `${r.ep} ${r.name} ${r.store.clear} m`).join('; '));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
process.exitCode = bad.length ? 1 : 0;
