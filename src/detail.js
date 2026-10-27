// LiDAR detail near the player, the main thread's half (docs/detail.md; the worker's is detail-build.js). Where the
// data has a `detail/` folder (scripts/detail-bake.mjs: the US side's 2 m LiDAR in 640 m chunks, and a 5 m set in
// 1280 m chunks), the ground within about RING[2].in metres of the player is drawn from the 2 m chunks, out to
// RING[5].in from the 5 m ones, and the 10 m tiles beyond. The chunks stream in and out as the player moves, built in
// the tile workers (tiles.js dispatch), each installed whole in one frame:
//   - a 5 m chunk is exactly one quarter of its 10 m tile's terrain (tile-worker.js partTerrain), which it hides; a
//     2 m chunk is exactly one quarter of its 5 m chunk, which it hides. Nothing coarser is ever drawn under detail.
//   - every vertex carries its own height, the 5 m surface's (a 2 m chunk) and the 10 m mesh's; here they are blended
//     by which neighbours are in (blend): within BLEND metres of an edge whose neighbour is coarser, a chunk eases to
//     the coarser ground and is exactly it on the edge, so the two meet without a step. A neighbour coming or going
//     changes the blend of the chunks round it, not their meshes. A skirt under each edge hides the slits left.
//   - the ground query (heightAt, tiles.js groundAt) answers from the finest chunk in: the walker, the canoe, the
//     camera, the props and the lost items stand on what is drawn
//   - the trees, the rocks, the props and the collision were placed on the 10 m ground; a chunk coming in (or
//     going) re-seats them on what is drawn now, a few hundred a frame (reseat); the cliff modules stay (HIDE_CLIFFS, carriesFace)
//   - the grass is lifted onto it by a small offset map round the player (detailGrass)
// `?detail=10` (or `?detail=off`) turns it off; without a `detail/` folder (older data, Quetico) nothing changes.
// `__game.tiles.detail.setEnabled(false | true)` switches at runtime.
import * as THREE from 'three';

// The owner's call (2026-10-27): the cliff modules stay everywhere, over the 2 m ground too. The 2 m DEM rounds the
// tall columnar walls (the Border Route palisades) into smooth slopes, so the modules keep drawing them, and the
// doubled bands where a face is short (Lake One) are the accepted cost. true hides them where the ground carries the face.
const HIDE_CLIFFS = false;
import { surfaceAt } from './terrain-build.js';
import { REFLECT_SHORE_LAYER } from './water.js';
import { smoothstep } from './rng.js';

export const DETAIL_OFF = (() => {
  if (typeof location === 'undefined') return true;
  const m = /[?&]detail=(\w+)/.exec(location.search);
  return !!m && /^(10|off|0|no)$/.test(m[1]);
})();
export const BLEND = 50; // metres inside a chunk's edge over which it eases into a coarser neighbour
// the rings, by level (metres from the player to the chunk's nearest point): installed inside `in`, let go past
// `out`, built ahead inside `pre`, its arrays dropped past `drop`
export const RING = { 2: { in: 300, out: 400, pre: 520, drop: 640 }, 5: { in: 900, out: 1050, pre: 1200, drop: 1400 } };
const INSTALL_BUDGET = 6;  // ms a frame for installs (one at least) and the blends they cause
const RESEAT_BUDGET = 2;   // ms a frame re-seating the trees, rocks and props
const SCAN_STEP = 16;      // metres moved before the rings are looked at again (and every 30 frames)

const smooth = (d) => smoothstep(0, BLEND, d);
// a chunk's blend weight at local (x, z) of a square S a side: 1 inside, easing to 0 on each edge (and each corner)
// whose neighbour is coarser. Bits: N 1, S 2, W 4, E 8, NW 16, NE 32, SW 64, SE 128. Two chunks sharing an edge
// get the same weights along it: each edge or corner term of one is an edge or corner term of the other.
function weight(x, z, S, m) {
  if (!m) return 1;
  const dW = x, dE = S - x, dN = z, dS = S - z;
  if (dW > BLEND && dE > BLEND && dN > BLEND && dS > BLEND) return 1;
  let w = 1;
  if (m & 1) w = Math.min(w, smooth(dN));
  if (m & 2) w = Math.min(w, smooth(dS));
  if (m & 4) w = Math.min(w, smooth(dW));
  if (m & 8) w = Math.min(w, smooth(dE));
  if (m & 16) w = Math.min(w, smooth(Math.max(dW, dN)));
  if (m & 32) w = Math.min(w, smooth(Math.max(dE, dN)));
  if (m & 64) w = Math.min(w, smooth(Math.max(dW, dS)));
  if (m & 128) w = Math.min(w, smooth(Math.max(dE, dS)));
  return w;
}
const NB = [[0, -1, 1], [0, 1, 2], [-1, 0, 4], [1, 0, 8], [-1, -1, 16], [1, -1, 32], [-1, 1, 64], [1, 1, 128]];

export class DetailStreamer {
  constructor(tm) {
    this.tm = tm; this.world = tm.world;
    this.index = null; this.levels = null;
    this.enabled = !DETAIL_OFF;
    this.chunks = new Map();                      // key -> chunk record
    this.installed = { 2: new Map(), 5: new Map() }; // gk -> record
    this.group = new THREE.Group(); this.group.name = 'detail';
    this.group.matrixAutoUpdate = false; this.group.matrixWorldAutoUpdate = false;
    tm.scene.add(this.group);
    this.version = 0;      // moves whenever what is drawn changes (the grass offset map listens)
    this.dirty = [];       // rects [x0, z0, x1, z1] to re-seat
    this.job = null;
    this.last = { x: NaN, z: NaN, frame: 0 };
    this.frame = 0;
    this.stats = { built: 0, installed: 0, uninstalled: 0, buildMs: [], installMs: [], blendMs: [], reseatMs: 0, reseatMax: 0, bytes: 0, chunksFetched: 0, hiddenCliffs: 0, errors: 0 };
    const base = this.world.base || '';
    this.ready = DETAIL_OFF ? Promise.resolve() : fetch(`${base}detail/index.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !j.levels || !j.levels[2] || !j.levels[5] || !j.chunks) return;
        this.index = j; this.base = `${base}detail/`;
        const g = this.world;
        this.levels = {};
        for (const r of [2, 5]) {
          const L = j.levels[r];
          this.levels[r] = { r, C: L.cells, size: L.size, per: L.perTile, n: L.n, dir: L.dir, have: j.chunks[r] || j.chunks[String(r)] || {} };
        }
        this.gox = g.originX + g.cell / 2; this.goz = g.originZ + g.cell / 2; // the chunk grids' origin: a cell centre
      })
      .catch(() => {});
  }

  get active() { return this.enabled && !!this.levels; }
  gk(gx, gy) { return gx * 8192 + gy; }

  // a record for chunk (gx, gy) of level r, or null when the data has none there
  rec(r, gx, gy) {
    const L = this.levels[r], tx = Math.floor(gx / L.per), ty = Math.floor(gy / L.per), cx = gx - tx * L.per, cy = gy - ty * L.per;
    if (tx < 0 || ty < 0 || tx >= this.world.ntx || ty >= this.world.nty) return null;
    const name = `${tx}_${ty}_${cx}_${cy}`;
    if (!L.have[name]) return null;
    const key = `${r}:${name}`;
    let c = this.chunks.get(key);
    if (!c) {
      c = { key, r, name, tx, ty, cx, cy, gx, gy, x0: this.gox + gx * L.size, z0: this.goz + gy * L.size, size: L.size, state: 'idle', res: null, meshes: null, sig: -1, dist: Infinity, bytes: L.have[name][0] };
      c.tileKey = `${tx},${ty}`; c.cell0 = [gx * L.C, gy * L.C];
      this.chunks.set(key, c);
    }
    return c;
  }
  parentOf(c) { return this.rec(5, c.gx >> 1, c.gy >> 1); }
  tileReady(c) { const e = this.tm.tiles.get(c.tileKey); return !!(e && e.state === 'ready'); }
  dist(c, px, pz) {
    const dx = Math.max(0, c.x0 - px, px - c.x0 - c.size), dz = Math.max(0, c.z0 - pz, pz - c.z0 - c.size);
    return Math.hypot(dx, dz);
  }

  // ---- per frame -------------------------------------------------------------------------------------------------
  tick(px, pz) {
    this.frame++;
    if (!this.levels) return;
    this.px = px; this.pz = pz;
    if (!this.enabled) { if (this.installed[5].size || this.installed[2].size) this.clear(); this.reseat(); return; }
    const L = this.last;
    if (!(Math.hypot(px - L.x, pz - L.z) < SCAN_STEP) || this.frame - L.frame > 30) { this.scan(px, pz); L.x = px; L.z = pz; L.frame = this.frame; }
    // let go: the 2 m first (their 5 m parent's quarter comes back with them), then the 5 m
    for (const r of [2, 5]) for (const c of [...this.installed[r].values()]) if (this.dist(c, px, pz) > RING[r].out || !this.tileReady(c)) this.uninstall(c);
    // install: the nearest first, a 5 m chunk before the 2 m ones under it, within the budget (one at least)
    const t0 = performance.now();
    for (let k = 0; k < 8 && (k === 0 || performance.now() - t0 < INSTALL_BUDGET); k++) {
      let best = null, bd = Infinity;
      for (const c of this.chunks.values()) {
        if (c.state !== 'built') continue;
        const d = this.dist(c, px, pz);
        if (d > RING[c.r].in || !this.tileReady(c)) continue;
        if (c.r === 2) { const p = this.parentOf(c); if (!p || p.state !== 'installed') continue; }
        if (d < bd) { bd = d; best = c; } // 5 m and 2 m alike by distance: a 2 m one waits only for its parent
      }
      if (!best) break;
      this.install(best);
    }
    this.reseat();
  }

  // which chunks are wanted: records made (and given their distance) for every chunk within `drop`, the rest let go
  scan(px, pz) {
    for (const r of [5, 2]) {
      const L = this.levels[r], R = RING[r];
      const g0 = Math.floor((px - R.drop - this.gox) / L.size), g1 = Math.floor((px + R.drop - this.gox) / L.size);
      const h0 = Math.floor((pz - R.drop - this.goz) / L.size), h1 = Math.floor((pz + R.drop - this.goz) / L.size);
      for (let gy = h0; gy <= h1; gy++) for (let gx = g0; gx <= g1; gx++) {
        const c = this.rec(r, gx, gy);
        if (c) c.dist = this.dist(c, px, pz);
      }
    }
    for (const c of [...this.chunks.values()]) {
      c.dist = this.dist(c, px, pz);
      if (c.dist > RING[c.r].drop && c.state !== 'installed') this.forget(c);
    }
  }
  forget(c) {
    if (c.state === 'installed') this.uninstall(c);
    c.state = 'dropped'; c.res = null;
    this.chunks.delete(c.key);
  }

  // the next build for a free worker: { rank, c } (rank 0: wanted in the ring now; 1: ahead of the player), or null
  peek() {
    if (!this.active) return null;
    let best = null, bd = Infinity;
    for (const c of this.chunks.values()) {
      if (c.state !== 'idle' || c.dist > RING[c.r].pre || !this.tileReady(c)) continue;
      const k = (c.dist <= RING[c.r].in ? 0 : 1e5) + c.dist + (c.r === 5 ? -1 : 0);
      if (k < bd) { bd = k; best = c; }
    }
    return best ? { rank: bd < 1e5 ? 0 : 1, c: best } : null;
  }
  // the build message for c, to worker wk (whose tiles we mirror: tile-worker.js keeps the last TILES_KEPT)
  message(c, wk) {
    const w = this.world, L = this.levels[c.r];
    c.state = 'building'; c.sent = performance.now();
    const m = { type: 'chunk', key: `detail:${c.key}`, r: c.r, tx: c.tx, ty: c.ty, url: `${this.base}${L.dir}/${c.name}.bin`, cell0: c.cell0 };
    if (c.r === 2) { const p = this.parentOf(c); if (p) m.parent = { url: `${this.base}${this.levels[5].dir}/${p.name}.bin` }; }
    const transfer = [];
    const T = wk.dtiles || (wk.dtiles = new Map());
    if (!T.has(c.tileKey)) {
      const slot = w.slots[c.ty * w.ntx + c.tx], e = this.tm.tiles.get(c.tileKey);
      const data = slot.buf.slice(0), shade = e && e.shade ? e.shade.slice() : null;
      m.tile = { data, shade };
      transfer.push(data); if (shade) transfer.push(shade.buffer);
    }
    T.delete(c.tileKey); T.set(c.tileKey, 1);
    while (T.size > 3) T.delete(T.keys().next().value);
    return { m, transfer };
  }
  built(c, m) {
    if (m.type === 'error') {
      this.stats.errors++;
      console.warn('detail chunk failed', c.key, m.error);
      if (c.state === 'building') c.state = /not sent/.test(m.error) ? 'idle' : 'failed';
      return;
    }
    if (c.state !== 'building') return; // let go while it built
    c.res = m.chunk; c.state = 'built';
    const s = this.stats;
    s.built++; s.bytes += c.bytes || 0; s.chunksFetched++; // (the gzip bytes fetched, from the index; a 2 m chunk's 5 m parent is fetched by the worker too, counted with its own build)
    s.buildMs.push(m.chunk.buildMs); if (s.buildMs.length > 200) s.buildMs.shift();
  }

  // ---- install and let go --------------------------------------------------------------------------------------
  install(c) {
    const t0 = performance.now(), R = c.res, tm = this.tm;
    const geo = new THREE.BufferGeometry();
    c.nrm = R.nOwn.slice(); // (inside the band its own level's alone: blend touches only the band)
    geo.setAttribute('position', new THREE.BufferAttribute(R.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(c.nrm, 3, true));
    geo.setAttribute('aSplatA', new THREE.BufferAttribute(R.splatA, 4, true));
    geo.setAttribute('aSplatB', new THREE.BufferAttribute(R.splatB, 4, true));
    geo.setAttribute('aSplatC', new THREE.BufferAttribute(R.splatC, 4, true));
    geo.setAttribute('aFloor', new THREE.BufferAttribute(R.floor, 4, true));
    geo.setAttribute('aLand', new THREE.BufferAttribute(R.land || new Int8Array(R.nv * 4), 4, true));
    geo.setIndex(new THREE.BufferAttribute(R.idx, 1));
    c.geo = geo; c.sig = -1;
    // a 5 m chunk is four meshes over the same arrays, one per 640 m quarter (a 2 m chunk hides one); a 2 m chunk one
    const P = R.parts, parts = c.r === 5 ? [0, 1, 2, 3] : [-1];
    const S = R.n > 300 ? 2 : 3; // its skirt (detail-build.js SKIRT), for the bounds
    c.meshes = parts.map((q) => {
      const g = q < 0 ? geo : new THREE.BufferGeometry();
      if (q >= 0) { for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]); g.setIndex(geo.index); g.setDrawRange(P[q * 8], P[q * 8 + 1]); }
      const box = new THREE.Box3();
      for (let k = 0; k < 4; k++) if ((q < 0 || k === q) && P[k * 8 + 1]) box.union(new THREE.Box3(new THREE.Vector3(P[k * 8 + 2], P[k * 8 + 3] - S, P[k * 8 + 4]), new THREE.Vector3(P[k * 8 + 5], P[k * 8 + 6], P[k * 8 + 7])));
      g.boundingSphere = box.isEmpty() ? new THREE.Sphere(new THREE.Vector3(), 1) : box.getBoundingSphere(new THREE.Sphere());
      g.boundingSphere.radius += 0.5;
      const m = new THREE.Mesh(g, tm.terrainMaterial);
      m.name = 'terrain'; m.userData.detail = c.r; m.userData.quarter = q;
      m.castShadow = true; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false;
      m.position.set(R.ox, 0, R.oz); m.updateMatrix(); m.matrixWorld.copy(m.matrix);
      m.layers.enable(REFLECT_SHORE_LAYER);
      m.visible = q < 0 || !!P[q * 8 + 1];
      this.group.add(m);
      return m;
    });
    c.state = 'installed';
    this.installed[c.r].set(this.gk(c.gx, c.gy), c);
    // what it covers goes: the tile's quarter (5 m), the 5 m chunk's quarter (2 m)
    this.cover(c, false);
    if (c.r === 5) for (const k of [0, 1, 2, 3]) { const ch = this.installed[2].get(this.gk(c.gx * 2 + (k & 1), c.gy * 2 + (k >> 1))); if (ch) this.cover(ch, false); }
    this.reblend(c);
    this.touched(c);
    this.stats.installed++;
    this.stats.installMs.push(+(performance.now() - t0).toFixed(1)); if (this.stats.installMs.length > 200) this.stats.installMs.shift();
  }
  uninstall(c) {
    if (c.state !== 'installed') return;
    if (c.r === 5) for (const k of [0, 1, 2, 3]) { const ch = this.installed[2].get(this.gk(c.gx * 2 + (k & 1), c.gy * 2 + (k >> 1))); if (ch) this.uninstall(ch); }
    for (const m of c.meshes) { this.group.remove(m); if (m.geometry !== c.geo) m.geometry.dispose(); }
    c.geo.dispose(); // (the quarters share its arrays: their buffers go with it)
    c.meshes = null; c.geo = null; c.nrm = null;
    // the arrays were blended in place: as built again (its own heights)
    const R = c.res;
    for (let v = 0; v < R.nv; v++) R.pos[v * 3 + 1] = R.own[v];
    this.installed[c.r].delete(this.gk(c.gx, c.gy));
    c.state = 'built';
    this.cover(c, true);
    this.reblend(c);
    this.touched(c);
    this.stats.uninstalled++;
  }
  // hide (or show again) what chunk c covers
  cover(c, show) {
    if (c.r === 5) {
      const e = this.tm.tiles.get(c.tileKey);
      if (e && e.group) for (const m of e.group.children) if (m.name === 'terrain' && m.userData.quarter === (c.cx | (c.cy << 1))) m.visible = show;
    } else {
      const p = this.installed[5].get(this.gk(c.gx >> 1, c.gy >> 1));
      if (p && p.meshes) { const q = (c.gx & 1) | ((c.gy & 1) << 1), m = p.meshes[q]; if (m) m.visible = show && !!p.res.parts[q * 8 + 1]; }
    }
  }
  // the chunks whose blend c's coming or going changes: itself and its neighbours (a 5 m chunk: and the 2 m ones in
  // them all)
  reblend(c) {
    const t0 = performance.now(), todo = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.installed[c.r].get(this.gk(c.gx + dx, c.gy + dy));
      if (n) todo.add(n);
      if (c.r === 5) for (let k = 0; k < 4; k++) { const ch = this.installed[2].get(this.gk((c.gx + dx) * 2 + (k & 1), (c.gy + dy) * 2 + (k >> 1))); if (ch) todo.add(ch); }
    }
    for (const n of todo) this.blend(n);
    this.stats.blendMs.push(+(performance.now() - t0).toFixed(1)); if (this.stats.blendMs.length > 200) this.stats.blendMs.shift();
  }
  mask(r, gx, gy) {
    let m = 0;
    for (const [dx, dy, bit] of NB) if (!this.installed[r].has(this.gk(gx + dx, gy + dy))) m |= bit;
    return m;
  }
  // c's heights and normals for the neighbours it has now (see weight)
  blend(c) {
    const R = c.res, two = c.r === 2;
    const p = two ? this.installed[5].get(this.gk(c.gx >> 1, c.gy >> 1)) : c;
    const m5 = p ? this.mask(5, p.gx, p.gy) : 255, m2 = two ? this.mask(2, c.gx, c.gy) : 0;
    const sig = m5 | (m2 << 8) | (p ? 0 : 1 << 16);
    if (sig === c.sig) return;
    c.sig = sig;
    const pos = R.pos, own = R.own, h5 = R.h5, h10 = R.h10, nO = R.nOwn, n5 = R.n5, n10 = R.n10, out = c.nrm;
    const ox5 = p ? c.x0 - p.x0 : 0, oz5 = p ? c.z0 - p.z0 : 0, S5 = this.levels[5].size, S2 = this.levels[2].size;
    // only the band within BLEND of its edges: inside it the chunk is its own level's alone (as built and installed)
    const S = c.size;
    if (!c.band) {
      const b = [];
      for (let v = 0; v < R.nv; v++) { const x = pos[v * 3], z = pos[v * 3 + 2]; if (x <= BLEND || z <= BLEND || x >= S - BLEND || z >= S - BLEND) b.push(v); }
      c.band = Uint32Array.from(b);
    }
    const band = c.band, nb = band.length;
    for (let t = 0; t < nb; t++) {
      const v = band[t];
      const x = pos[v * 3], z = pos[v * 3 + 2];
      const w5 = p ? weight(x + ox5, z + oz5, S5, m5) : 0;
      let y, nx, ny, nz;
      if (two) {
        const w2 = weight(x, z, S2, m2), a = 1 - w5, b = 1 - w2;
        y = (h10[v] * a + h5[v] * w5) * b + own[v] * w2;
        const k = v * 3;
        nx = (n10[k] * a + n5[k] * w5) * b + nO[k] * w2; ny = (n10[k + 1] * a + n5[k + 1] * w5) * b + nO[k + 1] * w2; nz = (n10[k + 2] * a + n5[k + 2] * w5) * b + nO[k + 2] * w2;
      } else {
        const a = 1 - w5, k = v * 3;
        y = h10[v] * a + own[v] * w5;
        nx = n10[k] * a + nO[k] * w5; ny = n10[k + 1] * a + nO[k + 1] * w5; nz = n10[k + 2] * a + nO[k + 2] * w5;
      }
      pos[v * 3 + 1] = y;
      const l = 127 / (Math.hypot(nx, ny, nz) || 1), k = v * 3;
      out[k] = Math.round(nx * l); out[k + 1] = Math.round(ny * l); out[k + 2] = Math.round(nz * l);
    }
    if (c.geo) { c.geo.attributes.position.needsUpdate = true; c.geo.attributes.normal.needsUpdate = true; }
  }
  touched(c) {
    this.version++;
    this.dirty.push([c.x0 - BLEND, c.z0 - BLEND, c.x0 + c.size + BLEND, c.z0 + c.size + BLEND]);
  }
  // every chunk of tile (tx, ty) let go (the tile is going: tiles.js evict)
  dropTile(tx, ty) {
    for (const c of [...this.chunks.values()]) if (c.tx === tx && c.ty === ty) this.forget(c);
    this.dirty = this.dirty.filter(Boolean);
  }
  // let go of everything (switched off)
  clear() {
    for (const c of [...this.installed[2].values()]) this.uninstall(c);
    for (const c of [...this.installed[5].values()]) this.uninstall(c);
    for (const c of [...this.chunks.values()]) if (c.state !== 'building') this.forget(c);
  }
  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this.clear();
    this.last.x = NaN;
    return this.enabled;
  }

  // ---- the ground ------------------------------------------------------------------------------------------------
  // the installed chunk of the finest level over world (x, z), or null
  at(x, z) {
    if (!this.levels) return null;
    for (const r of [2, 5]) {
      const M = this.installed[r];
      if (!M.size) continue;
      const S = this.levels[r].size, c = M.get(this.gk(Math.floor((x - this.gox) / S), Math.floor((z - this.goz) / S)));
      if (c) return c;
    }
    return null;
  }
  // the drawn ground of chunk c at (x, z) (dy: less the 10 m mesh), as its triangles draw it (the waterline's fans
  // aside, a few centimetres there)
  sample(c, x, z, dy = false) {
    const R = c.res, n = R.n, r = R.r, s = R.s, P = R.pos, H = R.h10;
    const val = dy ? (q) => P[q * 3 + 1] - H[q] : (q) => P[q * 3 + 1];
    let fx = (x - R.ox) / r + 1, fz = (z - R.oz) / r + 1;
    fx = Math.min(n - 2, Math.max(1, fx)); fz = Math.min(n - 2, Math.max(1, fz));
    let K = Math.min(n - 3, Math.floor(fx)), M = Math.min(n - 3, Math.floor(fz));
    const a = Math.min(R.nq - 1, Math.floor((K - 1) / s)), b = Math.min(R.nq - 1, Math.floor((M - 1) / s));
    let u, w, step = 1, flip;
    if (R.deep[b * R.nq + a]) { // a deep quad: the 10 m mesh's two triangles
      K = 1 + a * s; M = 1 + b * s; step = s; u = (fx - K) / s; w = (fz - M) / s;
      flip = ((c.cell0[0] + a + c.cell0[1] + b) & 1) === 0;
    } else { u = fx - K; w = fz - M; flip = ((K + M) & 1) === 0; }
    const q = M * n + K, h00 = val(q), h10 = val(q + step), h01 = val(q + step * n), h11 = val(q + step * n + step);
    if (flip) return u + w <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * w : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - w);
    return u >= w ? h00 + (h10 - h00) * u + (h11 - h10) * w : h00 + (h01 - h00) * w + (h11 - h01) * u;
  }
  // the drawn ground at (x, z) where a chunk is in, else NaN (tiles.js groundAt asks this first)
  heightAt(x, z) { const c = this.at(x, z); return c ? this.sample(c, x, z) : NaN; }
  // how far the drawn ground at (x, z) is above the 10 m mesh (0 where no chunk is in)
  dyAt(x, z) { const c = this.at(x, z); return c ? this.sample(c, x, z, true) : 0; }

  // A cliff module (cliffs.js) at (x, z), its foot's face looking along -(dx, dz), `tall` metres high and `deep` metres
  // into the hill: does the 2 m ground here already stand up as its face? Then the module goes (the two would double
  // up). Along its fall line, from 4 m in front of the foot to its back, the ground must rise by 0.6 of its height and
  // be 42 degrees or steeper over 4 m somewhere (the 2 m DEM draws a real face at 45-70 degrees: the palisades, Lake One).
  carriesFace(x, z, dx, dz, tall, deep) {
    if (!HIDE_CLIFFS || !this.installed[2].size) return false;
    const c = this.at(x, z);
    if (!c || c.r !== 2) return false;
    const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, end = Math.max(8, Math.min(30, deep || l));
    const h = [];
    for (let t = -4; t <= end + 0.01; t += 2) { const y = this.heightAt(x + ux * t, z + uz * t); if (!(y === y)) return false; h.push(y); }
    let steep = 0;
    for (let k = 2; k < h.length; k++) steep = Math.max(steep, (h[k] - h[k - 2]) / 4);
    return h[h.length - 1] - h[0] >= 0.6 * tall && steep >= 0.9;
  }

  // ---- re-seating what stands on the ground -------------------------------------------------------------------
  // Within the dirty rects, a few hundred at a time under RESEAT_BUDGET: every instance of the tiles' bins (the trees,
  // the rocks, the cliff modules: dy over the 10 m mesh, what has been applied kept per instance), the collision's
  // solids and trunks, and the props (per vertex, per instance). Their order in a bin is fixed first (tiles.js
  // sortBin: the culling would sort them later).
  reseat() {
    const t0 = performance.now();
    while (performance.now() - t0 < RESEAT_BUDGET) {
      if (!this.job) {
        if (!this.dirty.length) break;
        this.job = this.reseatRect(this.dirty.shift());
      }
      if (this.job.next().done) this.job = null;
    }
    const ms = performance.now() - t0;
    this.stats.reseatMs += ms; this.stats.reseatMax = Math.max(this.stats.reseatMax, ms);
  }
  *reseatRect(rect) {
    const w = this.world, [tx0, ty0] = w.tileOf(rect[0], rect[1]), [tx1, ty1] = w.tileOf(rect[2], rect[3]);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const e = this.tm.tiles.get(this.tm.key(tx, ty));
      if (!e || e.state !== 'ready') continue;
      yield* this.reseatTile(e, rect);
    }
  }
  *reseatTile(e, [x0, z0, x1, z1]) {
    const ox = e.ox, oz = e.oz, inside = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
    // the bins
    for (const m of e.veg || []) {
      const l = m.userData.lod, sp = m.userData.sp;
      if (sp === undefined || !l || !m.parent) continue;
      if (l.cx + l.half < x0 || l.cx - l.half > x1 || l.cz + l.half < z0 || l.cz - l.half > z1) continue;
      this.tm.sortBin(m);
      const A = m.instanceMatrix.array, n = l.total, ud = m.userData;
      const dy = ud.dy || (ud.dy = new Float32Array(n));
      let changed = false, grow = 0;
      for (let i = 0; i < n; i++) {
        if ((i & 2047) === 2047) yield;
        const o = i * 16, x = A[o + 12] + ox, z = A[o + 14] + oz;
        if (!inside(x, z)) continue;
        if (sp === 21) changed = this.hideCliff(ud, A, o, i, x, z) || changed;
        const d = this.dyAt(x, z), delta = d - dy[i];
        if (Math.abs(delta) < 0.002) continue;
        A[o + 13] += delta; dy[i] = d; changed = true; grow = Math.max(grow, Math.abs(delta));
      }
      if (changed) this.tm.binMoved(m, grow);
      yield;
    }
    // the collision: the solids (and the cliffs hidden) and the trunks' seats
    const C = e.collide;
    if (C) {
      const R = C.rocks, ST = 15, nr = R.length / ST;
      const rd = e.rockDy || (e.rockDy = new Float32Array(nr));
      for (let i = 0; i < nr; i++) {
        if ((i & 2047) === 2047) yield;
        const o = i * ST, x = R[o] + ox, z = R[o + 2] + oz;
        if (!inside(x, z)) continue;
        if (R[o + 5] === 21) {
          const hide = this.carriesFace(x, z, R[o + 12], R[o + 14], Math.hypot(R[o + 9], R[o + 10], R[o + 11]), Math.hypot(R[o + 12], R[o + 13], R[o + 14]));
          const H = e.rockHidden || (e.rockHidden = new Uint8Array(nr));
          H[i] = hide ? 1 : 0;
        }
        const d = this.dyAt(x, z), delta = d - rd[i];
        if (Math.abs(delta) < 0.002) continue;
        R[o + 1] += delta; rd[i] = d; e.shapes.delete(i);
      }
      const T = C.trunks, Mt = C.trunkMeta, nt = T.length / 3;
      if (Mt) {
        const td = e.trunkDy || (e.trunkDy = new Float32Array(nt));
        for (let i = 0; i < nt; i++) {
          if ((i & 4095) === 4095) yield;
          const x = T[i * 3] + ox, z = T[i * 3 + 1] + oz;
          if (!inside(x, z)) continue;
          const d = this.dyAt(x, z), delta = d - td[i];
          if (Math.abs(delta) < 0.002) continue;
          Mt[i * 4] += delta; td[i] = d; if (e.trunkR) e.trunkR[i] = NaN;
        }
      }
      yield;
    }
    // the props: every mesh's vertices (a merged campsite, a trail's decal) and every instance (the ledges), shifted by
    // the dy where each stands (a prop on gentle ground moves as one; the decal drapes)
    const props = e.group && e.group.children.find((o) => o.name === 'props');
    if (props) {
      const list = [];
      props.traverse((o) => { if (o.isMesh) list.push(o); });
      for (const m of list) { yield* this.reseatMesh(m, inside); yield; }
    }
  }
  *reseatMesh(m, inside) {
    const M = m.matrixWorld.elements, inv = _m3.setFromMatrix4(m.matrixWorld).invert().elements, ud = m.userData;
    const ux = inv[3], uy = inv[4], uz = inv[5]; // local (0, 1, 0) of the world's up
    let changed = false, grow = 0;
    const shift = (arr, o, k, dyA) => { // a point at arr[o..o+2] (local), its record k
      const x = M[0] * arr[o] + M[4] * arr[o + 1] + M[8] * arr[o + 2] + M[12], z = M[2] * arr[o] + M[6] * arr[o + 1] + M[10] * arr[o + 2] + M[14];
      if (!inside(x, z)) return;
      const d = this.dyAt(x, z), delta = d - dyA[k];
      if (Math.abs(delta) < 0.002) return;
      arr[o] += ux * delta; arr[o + 1] += uy * delta; arr[o + 2] += uz * delta; dyA[k] = d; changed = true; grow = Math.max(grow, Math.abs(delta));
    };
    if (m.isInstancedMesh) {
      const A = m.instanceMatrix.array, n = m.count, dyA = ud.dy || (ud.dy = new Float32Array(A.length / 16));
      // (an instance's translation is its origin in the mesh's frame: shifted along the mesh's own up)
      for (let i = 0; i < n; i++) { if ((i & 2047) === 2047) yield; shift(A, i * 16 + 12, i, dyA); }
      if (changed) { m.instanceMatrix.needsUpdate = true; if (m.boundingSphere) m.boundingSphere.radius += grow; }
    } else {
      const p = m.geometry.attributes.position;
      if (!p || p.itemSize !== 3 || p.isInterleavedBufferAttribute) return;
      const A = p.array, n = p.count, dyA = ud.dy || (ud.dy = new Float32Array(n));
      for (let i = 0; i < n; i++) { if ((i & 4095) === 4095) yield; shift(A, i * 3, i, dyA); }
      if (changed) { p.needsUpdate = true; if (m.geometry.boundingSphere) m.geometry.boundingSphere.radius += grow; }
    }
  }
  // a cliff module's instance o (bin's array A) hidden or shown: its three columns kept aside while hidden
  hideCliff(ud, A, o, i, x, z) {
    const H = ud.hidden || (ud.hidden = new Map());
    const was = H.has(i);
    const cols = was ? H.get(i) : A;
    const co = was ? 0 : o;
    const hide = this.carriesFace(x, z, cols[co + 8], cols[co + 10], Math.hypot(cols[co + 4], cols[co + 5], cols[co + 6]), Math.hypot(cols[co + 8], cols[co + 9], cols[co + 10]));
    if (hide === was) return false;
    if (hide) { H.set(i, A.slice(o, o + 12)); for (let k = 0; k < 12; k++) A[o + k] = 0; this.stats.hiddenCliffs++; }
    else { A.set(H.get(i), o); H.delete(i); this.stats.hiddenCliffs--; }
    return true;
  }

  // how many chunks still have something to do where the player is (0: settled; the shots and tests wait on it)
  pending() {
    if (!this.active) return 0;
    let k = this.dirty.length + (this.job ? 1 : 0);
    for (const c of this.chunks.values()) {
      const R = RING[c.r];
      if (c.state === 'building') k++;
      else if (c.state === 'idle' && c.dist <= R.pre && this.tileReady(c)) k++;
      else if (c.state === 'built' && c.dist <= R.in && this.tileReady(c) && (c.r === 5 || (this.parentOf(c) || {}).state === 'installed')) k++;
    }
    return k;
  }

  // for the HUD and the measurements
  report() {
    const med = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
    const max = (a) => (a.length ? Math.max(...a) : null);
    let tris = 0, verts = 0, bytes = 0;
    for (const r of [2, 5]) for (const c of this.installed[r].values()) {
      tris += c.res.idx.length / 3; verts += c.res.nv;
      for (const a of [c.res.pos, c.res.own, c.res.h10, c.res.h5, c.res.nOwn, c.res.n5, c.res.n10, c.res.splatA, c.res.splatB, c.res.splatC, c.res.floor, c.res.land, c.res.idx, c.nrm]) if (a) bytes += a.byteLength;
    }
    let held = 0;
    for (const c of this.chunks.values()) if (c.state === 'built' && c.res) for (const k of ['pos', 'own', 'h10', 'h5', 'nOwn', 'n5', 'n10', 'splatA', 'splatB', 'splatC', 'floor', 'land', 'idx']) if (c.res[k]) held += c.res[k].byteLength;
    const s = this.stats;
    return {
      active: this.active, in2: [...this.installed[2].values()].map((c) => c.name), in5: [...this.installed[5].values()].map((c) => c.name),
      building: [...this.chunks.values()].filter((c) => c.state === 'building').length, built: [...this.chunks.values()].filter((c) => c.state === 'built').length,
      triangles: tris, vertices: verts, installedMB: +(bytes / 2 ** 20).toFixed(1), heldMB: +(held / 2 ** 20).toFixed(1),
      buildMs: { median: med(s.buildMs), max: max(s.buildMs) }, installMs: { median: med(s.installMs), max: max(s.installMs) }, blendMs: { median: med(s.blendMs), max: max(s.blendMs) },
      reseatMaxMs: +s.reseatMax.toFixed(1), downloadedMB: +(s.bytes / 2 ** 20).toFixed(2), chunksFetched: s.chunksFetched, hiddenCliffs: s.hiddenCliffs, errors: s.errors, dirty: this.dirty.length + (this.job ? 1 : 0),
    };
  }
}
const _m3 = new THREE.Matrix3();

// ---- the grass on the detail ground --------------------------------------------------------------------------------
// The clumps' shader puts each on the 10 m surface (water.js surfaceAt, from the atlas); here a WIN-metre square round
// the player, every STEP metres, holds the drawn ground where a detail chunk is in less that 10 m surface, and the
// shader adds it (bilinear). Rebuilt when the player has moved MOVE metres or the chunks changed.
const WIN = 192, STEP = 2, MOVE = 32, NW = WIN / STEP + 1;
export function detailGrass(cover, tiles, world) {
  const D = tiles.detail;
  if (DETAIL_OFF || !D || !cover || !cover.material) return null;
  const data = new Float32Array(NW * NW);
  const tex = new THREE.DataTexture(data, NW, NW, THREE.RedFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  const u = { uDetailDy: { value: tex }, uDetailWin: { value: new THREE.Vector4(0, 0, 1 / STEP, NW) } };
  const st = { x: NaN, z: NaN, version: -1, wx: 0, wz: 0, any: false, ms: 0 };
  const prev = cover.material.onBeforeCompile;
  cover.material.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `uniform sampler2D uDetailDy;
uniform vec4 uDetailWin;
float detailDy(vec2 rel) {
  vec2 f = (rel - uDetailWin.xy) * uDetailWin.z;
  if (f.x < 0.0 || f.y < 0.0 || f.x > uDetailWin.w - 1.001 || f.y > uDetailWin.w - 1.001) return 0.0;
  ivec2 c = ivec2(floor(f)); vec2 a = f - floor(f);
  return mix(mix(texelFetch(uDetailDy, c, 0).r, texelFetch(uDetailDy, c + ivec2(1, 0), 0).r, a.x), mix(texelFetch(uDetailDy, c + ivec2(0, 1), 0).r, texelFetch(uDetailDy, c + ivec2(1, 1), 0).r, a.x), a.y);
}
void main() {`)
      .replace('surfaceAt(rel) - 0.05 + p.y', 'surfaceAt(rel) + detailDy(rel) - 0.05 + p.y');
  };
  cover.material.customProgramCacheKey = () => 'look-grass-detail';
  cover.material.needsUpdate = true;
  const rebuild = (x, z) => {
    const t0 = performance.now();
    st.wx = Math.round(x / STEP) * STEP - WIN / 2; st.wz = Math.round(z / STEP) * STEP - WIN / 2;
    const wasAny = st.any;
    st.any = false;
    if (D.installed[2].size || D.installed[5].size) {
      for (let j = 0; j < NW; j++) for (let i = 0; i < NW; i++) {
        const px = st.wx + i * STEP, pz = st.wz + j * STEP;
        let dy = 0;
        const h = D.heightAt(px, pz);
        if (h === h && world.isReady(px, pz)) { dy = h - surfaceAt(world, px, pz); if (!(dy === dy)) dy = 0; else st.any = true; }
        data[j * NW + i] = dy;
      }
    }
    if (!st.any && wasAny) data.fill(0);
    if (st.any || wasAny) tex.needsUpdate = true;
    st.x = x; st.z = z; st.version = D.version;
    st.ms = performance.now() - t0;
  };
  const up = cover.update.bind(cover);
  cover.update = (dt, x, z) => {
    up(dt, x, z);
    if (st.version !== D.version || !(Math.hypot(x - st.x, z - st.z) < MOVE)) rebuild(x, z);
    const o = cover.water.origin;
    u.uDetailWin.value.set(st.wx - o.x, st.wz - o.z, 1 / STEP, NW);
  };
  return st;
}
