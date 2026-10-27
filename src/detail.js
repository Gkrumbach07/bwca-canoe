// Detail prototype, the main thread's half (docs/detail-proto.md; the worker's is detail-build.js). Off unless the page
// is opened with `?detail=2`, `?detail=5` or `?detail=10` (metres; 10 is today's ground with the switch armed): then
// the fine tiles that have a LiDAR detail file at that resolution (public/data-detail, scripts/detail-proto.mjs) and
// lie under the player or next to it (RING tiles out) are built from it. A tile that comes into the ring, or leaves
// it, is built again. The ground cover (the grass clumps, which stand on the 10 m surface the water's atlas carries:
// groundcover.js) is lifted onto the detail ground by a small offset map round the player. With the flag,
// `__game.tiles.detail.set(2 | 5 | 10)` switches at runtime (the tiles round the player are built again, one a
// frame). Everything here is inert with the flag off: the game is unchanged.
import * as THREE from 'three';
import { surfaceAt } from './terrain-build.js';

// the flag: 0 off, else the metres asked for (10: armed, today's ground)
export const DETAIL_FLAG = (() => {
  if (typeof location === 'undefined') return 0;
  const m = /[?&]detail=([\d.]+)/.exec(location.search), v = m ? +m[1] : 0;
  return v > 0 && v <= 10 && (10 / v) % 1 === 0 ? v : 0;
})();
const resOf = (v) => (v > 0 && v < 10 ? v : 0);
const DETAIL_URL = (import.meta.env && import.meta.env.BASE_URL ? import.meta.env.BASE_URL : '/') + 'data-detail/';
const RING = 1; // tiles each side of the player's tile built from the detail

// The tile manager's helper (tiles.js: made in its constructor, asked at each dispatch and each update).
export class DetailRing {
  constructor(tm) {
    this.tm = tm;
    this.armed = DETAIL_FLAG > 0;
    this.res = resOf(DETAIL_FLAG);
    this.index = null;
    this.rebuilds = 0;
    this.ready = !this.armed ? Promise.resolve() : fetch(DETAIL_URL + 'index.json')
      .then((r) => (r.ok ? r.json() : null)).then((j) => { this.index = j; if (!j) console.warn('detail: no', DETAIL_URL + 'index.json'); })
      .catch((e) => console.warn('detail: index', e));
  }
  // switch at runtime: 2, 5 (metres) or 10 (today's ground); the ring is built again over the next frames
  set(v) {
    if (!this.armed) { console.warn('detail: open the page with ?detail=10 (or 2, 5) to arm the switch'); return false; }
    this.res = resOf(v);
    return true;
  }
  // what tile (tx, ty) should be built from: { url, res } or null
  want(tx, ty, ptx, pty) {
    if (!this.res || !this.index) return null;
    const t = this.index.tiles[`${tx}_${ty}`];
    if (!t || !t.res.includes(this.res) || Math.max(Math.abs(tx - ptx), Math.abs(ty - pty)) > RING) return null;
    return { url: `${DETAIL_URL}${tx}_${ty}.${this.res}m.bin`, res: this.res };
  }
  // the build message's `detail` for entry e, dispatched with the player at (px, pz); remembered on the entry
  msg(e, px, pz) {
    if (!this.armed) return undefined;
    const [ptx, pty] = this.tm.world.tileOf(px, pz);
    const d = this.want(e.tx, e.ty, ptx, pty);
    e.detailRes = d ? d.res : 0;
    return d || undefined;
  }
  // per frame: a ready tile built at the wrong resolution for where the player is now is let go and asked for again
  // (one a frame); the far chunk stands in while it builds
  tick(px, pz) {
    if (!this.armed || !this.index) return;
    const tm = this.tm, w = tm.world, [ptx, pty] = w.tileOf(px, pz);
    for (const e of tm.tiles.values()) {
      if (e.state !== 'ready') continue;
      const d = this.want(e.tx, e.ty, ptx, pty);
      if ((d ? d.res : 0) === (e.detailRes || 0)) continue;
      tm.disposeGroup(e.group);
      w.clearTile(e.tx, e.ty);
      tm.grounds.delete(e.ty * w.ntx + e.tx); e.ground = null;
      tm.tiles.delete(e.key);
      const fc = tm.farChunks.get(e.key);
      if (fc) fc.visible = true;
      tm.water.invalidateAtlas(e.tx * w.tile, e.ty * w.tile, w.tile);
      tm.request(e.tx, e.ty);
      this.rebuilds++;
      return;
    }
  }
  // the detail tiles in now: { key: { res, vertices, triangles, buildMs } }
  report() {
    const out = {};
    for (const e of this.tm.tiles.values()) if (e.state === 'ready' && e.detailRes) out[e.key] = { res: e.detailRes, ...(e.detailInfo || {}) };
    return out;
  }
}

// ---- the grass on the detail ground --------------------------------------------------------------------------------
// The clumps' shader puts each on the 10 m surface (water.js surfaceAt, from the atlas); here a WIN-metre square round
// the player, every STEP metres, holds the drawn ground (tiles.js groundAt, the detail mesh where a detail tile is in)
// less that 10 m surface, and the shader adds it (bilinear). Rebuilt when the player has moved MOVE metres or a tile
// came in. Only where a detail tile is in is it anything but 0.
const WIN = 192, STEP = 2, MOVE = 32, NW = WIN / STEP + 1;
export function detailGrass(cover, tiles, world) {
  if (!DETAIL_FLAG || !cover || !cover.material) return null;
  const data = new Float32Array(NW * NW);
  const tex = new THREE.DataTexture(data, NW, NW, THREE.RedFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  const u = { uDetailDy: { value: tex }, uDetailWin: { value: new THREE.Vector4(0, 0, 1 / STEP, NW) } };
  const st = { x: NaN, z: NaN, built: -1, wx: 0, wz: 0, any: false, ms: 0 };
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
  const isDetail = (x, z) => { const [tx, ty] = world.tileOf(x, z), e = tiles.tiles.get(tiles.key(tx, ty)); return !!(e && e.state === 'ready' && e.detailRes); };
  const rebuild = (x, z) => {
    const t0 = performance.now();
    st.wx = Math.round(x / STEP) * STEP - WIN / 2; st.wz = Math.round(z / STEP) * STEP - WIN / 2;
    st.any = false;
    for (let j = 0; j < NW; j++) for (let i = 0; i < NW; i++) {
      const px = st.wx + i * STEP, pz = st.wz + j * STEP;
      let dy = 0;
      if (isDetail(px, pz) && world.isReady(px, pz)) { dy = tiles.groundAt(px, pz) - surfaceAt(world, px, pz); if (!(dy === dy)) dy = 0; else st.any = true; }
      data[j * NW + i] = dy;
    }
    tex.needsUpdate = true;
    st.x = x; st.z = z; st.built = tiles.stats.built;
    st.ms = performance.now() - t0;
  };
  const up = cover.update.bind(cover);
  cover.update = (dt, x, z) => {
    up(dt, x, z);
    if (st.built !== tiles.stats.built || !(Math.hypot(x - st.x, z - st.z) < MOVE)) rebuild(x, z);
    const o = cover.water.origin;
    u.uDetailWin.value.set(st.wx - o.x, st.wz - o.z, 1 / STEP, NW);
  };
  return st;
}
