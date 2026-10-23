import * as THREE from 'three';
import { makeTerrainMesh } from './terrain.js';
import { makeVegetationMeshes, updateVegetationLOD } from './vegetation.js';
import { makeAquaticMeshes } from './aquatic.js';
import { buildTileProps, exclusionsFor } from './props.js';
import { MeshGround } from './prop-kit.js';
import { meshHeightAt } from './terrain-build.js';

// Streams the world around the player: a 5 x 5 neighbourhood of 2.56 km tiles (terrain, water, forest,
// lake vegetation, portages, campsites) built in a pool of workers and installed one per frame, a 3 x 3
// neighbourhood of 20 km far-field tiles (80 m terrain and water, no trees) underneath, and an LRU that
// lets go of the rest.

const NEIGHBOURHOOD = 2;      // tiles each side of the player's tile
const FAR_NEIGHBOURHOOD = 1;  // far tiles each side
const MAX_LOADED = 36;        // fine tiles kept before the least recently wanted are dropped
const DRAW_DISTANCE = 4600;   // metres to a tile centre; past the fog's far distance plus the tile radius
const FAR_DRAW_DISTANCE = 12000; // far chunks are cheap (2k triangles): keep distant shores around for a clearer sky
const INSTALLS_PER_FRAME = 1;

export class TileManager {
  constructor(world, scene, { terrainMaterial, water, vegetation, aquatic, seed = 3 }) {
    this.world = world; this.scene = scene;
    this.terrainMaterial = terrainMaterial; this.water = water; this.vegetation = vegetation; this.aquatic = aquatic;
    this.tiles = new Map();      // key -> fine tile entry
    this.grounds = new Map();    // ty * ntx + tx -> the installed fine tile's drawn ground { mesh: MeshGround, ox, oz }
    this.farTiles = new Map();   // key -> far tile entry
    this.farChunks = new Map();  // fine tile key -> far chunk group
    this.queue = [];             // entries waiting for a worker
    this.pending = [];           // built entries waiting to be installed
    this.tick = 0;
    this.playerTile = [0, 0];
    this.stats = { built: 0, trees: 0, plants: 0 };
    const ex = exclusionsFor(world);
    const exclusions = new Float32Array(ex.length * 5);
    ex.forEach((s, i) => exclusions.set(s, i * 5));
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(new URL('./tile-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.onMessage(e.data);
      w.postMessage({ type: 'init', grid: world.meta.grid, levelById: world.levelById, clarityById: world.clarityById, exclusions, seed });
      return { w, key: null };
    });
  }

  key(tx, ty) { return `${tx},${ty}`; }

  setSeason(season) {
    if (this.vegetation.setSeason) this.vegetation.setSeason(season);
    if (this.aquatic && this.aquatic.setSeason) this.aquatic.setSeason(season);
  }

  // --- requests ------------------------------------------------------------------
  request(tx, ty) {
    const key = this.key(tx, ty);
    let e = this.tiles.get(key);
    if (e) { e.lastWanted = this.tick; return e; }
    e = { key, tx, ty, level: 'fine', state: 'queued', lastWanted: this.tick, group: null, veg: null, result: null };
    e.ready = new Promise((resolve) => { e.resolve = resolve; });
    this.tiles.set(key, e);
    this.queue.push(e);
    return e;
  }
  requestFar(fx, fy) {
    const key = `far:${fx},${fy}`;
    let e = this.farTiles.get(key);
    if (e) { e.lastWanted = this.tick; return e; }
    e = { key, fx, fy, level: 'far', state: 'queued', lastWanted: this.tick, chunks: [] };
    e.ready = new Promise((resolve) => { e.resolve = resolve; });
    this.farTiles.set(key, e);
    this.queue.push(e);
    return e;
  }

  // Resolves once every fine tile touching the square of half-size r around (x, z) is installed.
  ensure(x, z, r = 0) {
    const w = this.world;
    const [tx0, ty0] = w.tileOf(x - r, z - r), [tx1, ty1] = w.tileOf(x + r, z + r);
    const waits = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) waits.push(this.request(tx, ty).ready);
    this.dispatch(x, z);
    return Promise.all(waits);
  }

  // Initial load: the 3 x 3 fine tiles and the far field around (x, z), with progress.
  async prime(x, z, onProgress = () => {}) {
    const w = this.world;
    const [ptx, pty] = w.tileOf(x, z);
    const entries = [];
    const [pfx, pfy] = this.farOf(ptx, pty);
    for (let dy = -FAR_NEIGHBOURHOOD; dy <= FAR_NEIGHBOURHOOD; dy++) for (let dx = -FAR_NEIGHBOURHOOD; dx <= FAR_NEIGHBOURHOOD; dx++) {
      const fx = pfx + dx, fy = pfy + dy;
      if (fx >= 0 && fy >= 0 && fx < w.far.ntx && fy < w.far.nty) entries.push(this.requestFar(fx, fy));
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const tx = ptx + dx, ty = pty + dy;
      if (tx >= 0 && ty >= 0 && tx < w.ntx && ty < w.nty) entries.push(this.request(tx, ty));
    }
    let done = 0;
    for (const e of entries) e.ready.then(() => onProgress(++done / entries.length));
    // the frame loop is not running yet, so pump the worker queue and the installs here
    while (done < entries.length) {
      this.dispatch(x, z);
      this.install();
      await new Promise((r) => setTimeout(r, 16));
    }
  }

  farOf(tx, ty) { const per = this.world.far.tile / (this.world.tile / this.world.far.factor); return [Math.floor(tx / per), Math.floor(ty / per)]; }

  // --- per frame ----------------------------------------------------------------------------
  update(px, pz, camPos) {
    this.tick++;
    const w = this.world;
    const [ptx, pty] = w.tileOf(px, pz);
    this.playerTile = [ptx, pty];
    for (let dy = -NEIGHBOURHOOD; dy <= NEIGHBOURHOOD; dy++) for (let dx = -NEIGHBOURHOOD; dx <= NEIGHBOURHOOD; dx++) {
      const tx = ptx + dx, ty = pty + dy;
      if (tx >= 0 && ty >= 0 && tx < w.ntx && ty < w.nty) this.request(tx, ty);
    }
    const [pfx, pfy] = this.farOf(ptx, pty);
    for (let dy = -FAR_NEIGHBOURHOOD; dy <= FAR_NEIGHBOURHOOD; dy++) for (let dx = -FAR_NEIGHBOURHOOD; dx <= FAR_NEIGHBOURHOOD; dx++) {
      const fx = pfx + dx, fy = pfy + dy;
      if (fx >= 0 && fy >= 0 && fx < w.far.ntx && fy < w.far.nty) this.requestFar(fx, fy);
    }
    this.dispatch(px, pz);
    this.install();
    this.evict();
    // draw only what the fog lets through; far chunks stand in wherever a fine tile is missing
    for (const e of this.tiles.values()) {
      if (e.state !== 'ready') continue;
      const [ox, oz] = w.tileOrigin(e.tx, e.ty);
      const d = Math.hypot(ox + w.tileMetres / 2 - px, oz + w.tileMetres / 2 - pz);
      e.group.visible = d < DRAW_DISTANCE;
      if (e.group.visible) updateVegetationLOD(e.veg, camPos);
    }
    for (const [key, g] of this.farChunks) {
      const fine = this.tiles.get(key);
      if (fine && fine.state === 'ready') { g.visible = false; continue; }
      const d = Math.hypot(g.userData.cx - px, g.userData.cz - pz);
      g.visible = d < FAR_DRAW_DISTANCE;
    }
  }

  dispatch(px, pz) {
    if (!this.queue.length) return;
    const w = this.world;
    const dist = (e) => {
      if (e.level === 'far') return -1; // far tiles are cheap and cover the gaps: first
      const [ox, oz] = w.tileOrigin(e.tx, e.ty);
      return Math.hypot(ox + w.tileMetres / 2 - px, oz + w.tileMetres / 2 - pz);
    };
    this.queue.sort((a, b) => dist(a) - dist(b));
    for (const wk of this.workers) {
      if (wk.key || !this.queue.length) continue;
      const e = this.queue.shift();
      e.state = 'building';
      wk.key = e.key;
      if (e.level === 'far') wk.w.postMessage({ type: 'build', level: 'far', key: e.key, fx: e.fx, fy: e.fy, url: w.farUrl(e.fx, e.fy) });
      else wk.w.postMessage({ type: 'build', level: 'fine', key: e.key, tx: e.tx, ty: e.ty, url: w.tileUrl(e.tx, e.ty) });
    }
  }

  onMessage(m) {
    const wk = this.workers.find((x) => x.key === m.key);
    if (wk) wk.key = null;
    const e = m.level === 'far' || m.key.startsWith('far:') ? this.farTiles.get(m.key) : this.tiles.get(m.key);
    if (m.type === 'error') {
      console.warn('tile build failed', m.key, m.error);
      if (e) { (e.level === 'far' ? this.farTiles : this.tiles).delete(m.key); e.resolve(); }
      return;
    }
    if (!e || e.state !== 'building') return; // evicted while building
    e.result = m;
    e.state = 'built';
    if (e.level === 'far') this.installFar(e); else this.pending.push(e);
  }

  install() {
    for (let n = 0; n < INSTALLS_PER_FRAME && this.pending.length; n++) {
      const e = this.pending.shift();
      if (e.state !== 'built') continue;
      this.installFine(e);
    }
  }

  installFine(e) {
    const w = this.world, r = e.result;
    w.setTile(e.tx, e.ty, r.data, r.cover);
    const [ox, oz] = w.tileOrigin(e.tx, e.ty);
    // the drawn ground, from the terrain arrays the mesh is made of (shared with its geometry, not copied);
    // registered before the props are built so they stand on it too
    e.ground = new MeshGround(r.terrain, w.cell, w.tile);
    this.grounds.set(e.ty * w.ntx + e.tx, { mesh: e.ground, ox, oz });
    const group = new THREE.Group();
    group.name = `tile ${e.key}`;
    group.position.set(ox, 0, oz);
    group.matrixAutoUpdate = false;
    group.updateMatrix();
    group.add(makeTerrainMesh(r.terrain, this.terrainMaterial));
    if (r.water) group.add(this.water.makeFarMesh(r.water));
    e.veg = makeVegetationMeshes(r.veg, this.vegetation);
    e.vegBins = r.veg; e.ox = ox; e.oz = oz; e.treeHash = null;
    if (this.aquatic) e.veg.push(...makeAquaticMeshes(r.aquatic, this.aquatic));
    for (const m of e.veg) group.add(m);
    const props = buildTileProps(w.tileGrid(e.tx, e.ty), w, e.tx, e.ty);
    group.add(props);
    e.obstacles = props.userData.obstacles; // docks, shacks, tents and the like, in world coordinates
    this.scene.add(group);
    e.group = group; e.state = 'ready'; e.result = null;
    this.stats.built++; this.stats.trees += r.trees; this.stats.plants += r.plants;
    const fc = this.farChunks.get(e.key);
    if (fc) fc.visible = false;
    this.water.invalidateAtlas();
    e.resolve();
  }

  installFar(e) {
    const w = this.world, r = e.result;
    w.setFar(e.fx, e.fy, r.data);
    for (const c of r.chunks) {
      const key = this.key(c.tx, c.ty);
      const [ox, oz] = w.tileOrigin(c.tx, c.ty);
      const g = new THREE.Group();
      g.name = `far ${key}`;
      g.position.set(ox, 0, oz);
      g.matrixAutoUpdate = false;
      g.updateMatrix();
      g.userData.cx = ox + w.tileMetres / 2; g.userData.cz = oz + w.tileMetres / 2;
      const t = makeTerrainMesh(c.terrain, this.terrainMaterial);
      t.castShadow = false;
      g.add(t);
      if (c.water) { const m = this.water.makeFarMesh(c.water); m.receiveShadow = false; g.add(m); }
      const fine = this.tiles.get(key);
      g.visible = !(fine && fine.state === 'ready');
      this.scene.add(g);
      const old = this.farChunks.get(key);
      if (old) this.disposeGroup(old);
      this.farChunks.set(key, g);
      e.chunks.push(key);
    }
    e.state = 'ready'; e.result = null;
    this.water.invalidateAtlas();
    e.resolve();
  }

  disposeGroup(g) {
    this.scene.remove(g);
    g.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      else if (o.isMesh) o.geometry.dispose();
    });
  }

  evict() {
    const w = this.world, [ptx, pty] = this.playerTile;
    const wanted = (e) => Math.max(Math.abs(e.tx - ptx), Math.abs(e.ty - pty)) <= NEIGHBOURHOOD;
    if (this.tiles.size > MAX_LOADED) {
      const victims = [...this.tiles.values()].filter((e) => e.state === 'ready' && !wanted(e)).sort((a, b) => a.lastWanted - b.lastWanted);
      for (let i = 0; i < victims.length && this.tiles.size > MAX_LOADED; i++) {
        const e = victims[i];
        this.disposeGroup(e.group);
        w.clearTile(e.tx, e.ty);
        this.grounds.delete(e.ty * w.ntx + e.tx); e.ground = null;
        this.tiles.delete(e.key);
        const fc = this.farChunks.get(e.key);
        if (fc) fc.visible = true;
        this.water.invalidateAtlas();
      }
    }
    // queued tiles that fell out of the neighbourhood are forgotten rather than built
    this.queue = this.queue.filter((e) => { if (e.level === 'far' || wanted(e)) return true; this.tiles.delete(e.key); e.resolve(); return false; });
    // far tiles: keep the neighbourhood plus a ring
    const [pfx, pfy] = this.farOf(ptx, pty);
    for (const e of [...this.farTiles.values()]) {
      if (e.state !== 'ready' || Math.max(Math.abs(e.fx - pfx), Math.abs(e.fy - pfy)) <= FAR_NEIGHBOURHOOD + 1) continue;
      for (const key of e.chunks) { const g = this.farChunks.get(key); if (g) { this.disposeGroup(g); this.farChunks.delete(key); } }
      w.clearFar(e.fx, e.fy);
      this.farTiles.delete(e.key);
    }
  }

  // --- the ground ---------------------------------------------------------------------------------------------
  // The game's one ground query: the height of the terrain as it is drawn at world (x, z). Anything that stands
  // on the ground outside the worker's placement reads it (the walker and its feet, the hull set down or beached,
  // the props, the lost items, the camera's clearance). On an installed fine tile it is the mesh's own
  // triangle (prop-kit.js MeshGround: exact, a few hundred nanoseconds); elsewhere the same mesh computed from a
  // grid (terrain-build.js meshHeightAt: the plain split in a cell the waterline cuts, a few centimetres off
  // there), from `grid` when given (a tile's own halo'd grid while it installs), else from the world where it
  // has the cells, else the world's smooth height.
  groundAt(x, z, grid = null) {
    const g = this.locate(x, z);
    if (g) { const y = g.mesh.height(x - g.ox, z - g.oz); if (y === y) return y; }
    const w = this.world;
    if (grid) return meshHeightAt(grid, x, z);
    return w.isReady(x, z) ? meshHeightAt(w, x, z) : w.heightAt(x, z);
  }
  // the installed tile whose mesh covers world (x, z): { mesh, ox, oz }, or undefined. The mesh of tile t runs
  // from half a cell into t to half a cell into t + 1 (its quads join cell centres), so the quad lattice, not
  // the tile lattice, picks it.
  locate(x, z) {
    const w = this.world, T = w.tile;
    const qi = Math.floor((x - w.originX) / w.cell - 0.5), qj = Math.floor((z - w.originZ) / w.cell - 0.5);
    const tx = Math.floor(qi / T), ty = Math.floor(qj / T);
    if (tx < 0 || ty < 0 || tx >= w.ntx || ty >= w.nty) return undefined;
    return this.grounds.get(ty * w.ntx + tx);
  }

  // for the HUD: ready tiles with their data (minimap drawing)
  readyTiles() { return [...this.tiles.values()].filter((e) => e.state === 'ready'); }

  // Tree trunks within r metres of (x, z): [{ x, z, r }] in world metres. Built lazily per tile from the
  // instance matrices into a 10 m hash; boulders and shrubs are left out (they do not reach a canoe overhead).
  // Everything the walker is held off within r metres: trunks and boulders as circles { x, z, r } (rock: true
  // for a boulder), the props' footprints as circles or boxes { x, z, ux, uz, hx, hz, box: true }.
  treesNear(x, z, r) {
    const out = [], w = this.world, HASH = 10;
    const [tx0, ty0] = w.tileOf(x - r, z - r), [tx1, ty1] = w.tileOf(x + r, z + r);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const e = this.tiles.get(this.key(tx, ty));
      if (!e || e.state !== 'ready' || !e.vegBins) continue;
      if (!e.treeHash) {
        const h = new Map();
        for (const b of e.vegBins) {
          if (!b.count || b.sp === 7) continue; // shrubs are walked through
          const rock = b.sp === 6, m = b.matrices;
          for (let i = 0; i < b.count; i++) {
            const px = m[i * 16 + 12] + e.ox, pz = m[i * 16 + 14] + e.oz, sx = Math.hypot(m[i * 16], m[i * 16 + 1], m[i * 16 + 2]);
            if (rock && sx < 0.6) continue; // knee-high: stepped over
            const key = Math.floor(px / HASH) * 65536 + Math.floor(pz / HASH);
            let a = h.get(key); if (!a) { a = []; h.set(key, a); }
            // a trunk's radius, or a boulder's footprint (the rock geometry is a unit-radius block at its scale, part sunk)
            a.push(px, pz, rock ? 0.8 * sx : 0.12 + 0.14 * sx, rock ? 1 : 0);
          }
        }
        e.treeHash = h;
      }
      for (let cz = Math.floor((z - r) / HASH); cz <= Math.floor((z + r) / HASH); cz++) for (let cx = Math.floor((x - r) / HASH); cx <= Math.floor((x + r) / HASH); cx++) {
        const a = e.treeHash.get(cx * 65536 + cz);
        if (!a) continue;
        for (let i = 0; i < a.length; i += 4) if (Math.hypot(a[i] - x, a[i + 1] - z) <= r + a[i + 2]) out.push({ x: a[i], z: a[i + 1], r: a[i + 2], rock: a[i + 3] === 1 });
      }
      if (e.obstacles) for (const o of e.obstacles) if (Math.hypot(o.x - x, o.z - z) <= r + (o.box ? Math.hypot(o.hx, o.hz) : o.r)) out.push(o);
    }
    return out;
  }
  readyFarTiles() { return [...this.farTiles.values()].filter((e) => e.state === 'ready'); }
}
