import * as THREE from 'three';
import { makeTerrainMesh } from './terrain.js';
import { makeVegetationMeshes, updateVegetationLOD, CARD, LOD_SCALE } from './vegetation.js';
import { makeAquaticMeshes } from './aquatic.js';
import { buildTileProps, exclusionsFor } from './props.js';
import { MeshGround } from './prop-kit.js';
import { meshHeightAt } from './terrain-build.js';
import { cascadeHooks } from './sunlight.js';

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

// ---------- per-instance culling ---------------------------------------------------------------------------------
// A vegetation bin is one instanced mesh over a 640 m (or 320 m) region, so three can only cull it whole: a bin
// that touches the view draws every instance in it, and a bin that touches a shadow cascade draws every instance
// into it, though the near cascade covers a few dozen metres. So the bins that cost (full geometry, or casting
// shadows) and the variant-group meshes beside them are drawn through proxies, one for the view and one per
// cascade, each holding only the instances that can show in its pass. The bin itself leaves layer 0 (so neither
// the view nor the shadow pass draws it) and keeps the mirror's shore layer, so the reflection pass still draws it
// whole with its forced geometry and counts (water.js renderReflection). updateVegetationLOD still decides each
// mesh's visibility, geometry, count and shadow, and the proxies follow them every frame; the sway and the swell
// run in the same materials.
//
// To keep the work small, a mesh is prepared once before it is first culled (a few per frame, under a time budget;
// until then it draws whole, as before): its instances are sorted along a Morton curve of 16 m cells inside each
// variant group (the groups stay where they are: the group meshes share the bin's arrays), and cut into chunks of
// CHUNK neighbours with a sphere round each. A pass then tests chunks, not instances, and a proxy is refilled
// (copied and uploaded) only when its set of chunks changes, which a turning camera does every few frames, not
// every frame. A chunk's sphere encloses its instances' spheres, each its geometry's (the full and the far twin's
// together) grown by the cards' swell at the chunk's distance (CARD.uCardGrow) and by how far the wind can carry
// a crown.
//
// The view proxies are culled in scene.onBeforeRender (main camera only: the mirror's camera has no layer 0); the
// shadow proxies in the cascade hook (sunlight.js), after the fit and before the first cascade draws. They are
// visible only inside the shadow pass, and each draws into its own cascade alone: the shadow pass asks each caster
// whether it meets the cascade's frustum, and a cascade proxy answers yes for its own cascade only.
//
// What the quality presets set (quality.js):
export const CULL = {
  enabled: true,
  understory: 1,     // the share of the understory and the scree drawn (the density scale); the trees are not thinned (their trunks collide)
  farSmall: 0,       // far cascade: instances whose sphere is under this radius (m) cast no shadow past farSmallFrom metres
  farSmallFrom: 60,
  budget: 2,         // milliseconds a frame may spend preparing meshes
};
const UNDERSTORY = new Set([7, 10, 11, 12, 13, 20]); // shrub, hazel, alder, sapling, fern, talus (placement.js SPECIES)
const SWAY_MARGIN = 2; // metres the wind can carry a crown past its geometry's bounds
const CHUNK = 64;      // instances per chunk at most
const CELL = 16;       // metres: the sort's cells (a chunk keeps to a block of 2 x 2 of them)
const MANAGE_REACH = 1400; // metres from the camera to a tile's nearest edge before its meshes are looked at

const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _c = new THREE.Vector3();
const _planes = [new Float32Array(24), new Float32Array(24), new Float32Array(24)]; // the view, cascade 0, cascade 1
function planesOf(frustum, out) {
  for (let i = 0; i < 6; i++) { const p = frustum.planes[i]; out[i * 4] = p.normal.x; out[i * 4 + 1] = p.normal.y; out[i * 4 + 2] = p.normal.z; out[i * 4 + 3] = p.constant; }
  return out;
}
const keepHash = (i) => (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;
const morton = (x, z) => { // two 10-bit cell indices interleaved
  let k = 0;
  for (let b = 0; b < 10; b++) k |= (((x >> b) & 1) << (2 * b)) | (((z >> b) & 1) << (2 * b + 1));
  return k;
};

// The geometry sphere D may draw with: the full geometry's and the far twin's together (a bin swaps them by distance).
function localSphere(D) {
  const l = D.userData.lod, geos = l ? [l.full, l.low] : [D.geometry];
  let r = -1;
  for (const g of geos) {
    if (!g.boundingSphere) g.computeBoundingSphere();
    const s = g.boundingSphere;
    if (r < 0) { _c.copy(s.center); r = s.radius; continue; }
    const d = _c.distanceTo(s.center);
    if (d + s.radius <= r) continue;
    if (d + r <= s.radius) { _c.copy(s.center); r = s.radius; continue; }
    const nr = (r + d + s.radius) / 2;
    _c.lerp(s.center, (nr - r) / d); r = nr;
  }
  return r;
}

// Sorts instances [a, b) of a bin's arrays along the Morton curve of their cells (matrices and colours together).
function sortRange(A, C, a, b) {
  const n = b - a;
  if (n < 2) return;
  let x0 = Infinity, z0 = Infinity;
  for (let i = a; i < b; i++) { x0 = Math.min(x0, A[i * 16 + 12]); z0 = Math.min(z0, A[i * 16 + 14]); }
  const keys = new Float64Array(n);
  for (let i = 0; i < n; i++) keys[i] = morton(Math.min(1023, Math.floor((A[(a + i) * 16 + 12] - x0) / CELL)), Math.min(1023, Math.floor((A[(a + i) * 16 + 14] - z0) / CELL))) * 1048576 + i;
  keys.sort();
  const M = A.slice(a * 16, b * 16), K = C ? C.slice(a * 3, b * 3) : null;
  for (let j = 0; j < n; j++) {
    const i = keys[j] % 1048576;
    A.set(M.subarray(i * 16, i * 16 + 16), (a + j) * 16);
    if (K) { C[(a + j) * 3] = K[i * 3]; C[(a + j) * 3 + 1] = K[i * 3 + 1]; C[(a + j) * 3 + 2] = K[i * 3 + 2]; }
  }
}

// Prepares D: sorts a bin's instances inside each variant group (once per bin; its group meshes share the arrays),
// then the spheres of its instances (x, y, z, r: world space) and of its chunks (x, y, z, R, rMax).
function prepare(D) {
  const st = D.userData.cull, l = D.userData.lod;
  if (l && !l.sorted) {
    const A = D.instanceMatrix.array, C = D.instanceColor ? D.instanceColor.array : null;
    const counts = l.groups ? l.groups.counts : [l.total];
    for (let g = 0, a = 0; g < counts.length; a += counts[g], g++) sortRange(A, C, a, a + counts[g]);
    l.sorted = true;
    D.instanceMatrix.needsUpdate = true;
    if (D.instanceColor) D.instanceColor.needsUpdate = true;
    if (l.groups && l.groups.meshes) for (const k of l.groups.meshes) { k.instanceMatrix.needsUpdate = true; if (k.instanceColor) k.instanceColor.needsUpdate = true; if (k.userData.cull) k.userData.cull.ready = false; }
  }
  const r = localSphere(D), cx = _c.x, cy = _c.y, cz = _c.z;
  const A = D.instanceMatrix.array, n = D.instanceMatrix.count, W = D.matrixWorld.elements, S = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 16;
    const lx = A[o] * cx + A[o + 4] * cy + A[o + 8] * cz + A[o + 12];
    const ly = A[o + 1] * cx + A[o + 5] * cy + A[o + 9] * cz + A[o + 13];
    const lz = A[o + 2] * cx + A[o + 6] * cy + A[o + 10] * cz + A[o + 14];
    const sc = Math.sqrt(Math.max(A[o] * A[o] + A[o + 1] * A[o + 1] + A[o + 2] * A[o + 2], A[o + 4] * A[o + 4] + A[o + 5] * A[o + 5] + A[o + 6] * A[o + 6], A[o + 8] * A[o + 8] + A[o + 9] * A[o + 9] + A[o + 10] * A[o + 10]));
    S[i * 4] = W[0] * lx + W[4] * ly + W[8] * lz + W[12];
    S[i * 4 + 1] = W[1] * lx + W[5] * ly + W[9] * lz + W[13];
    S[i * 4 + 2] = W[2] * lx + W[6] * ly + W[10] * lz + W[14];
    S[i * 4 + 3] = r * sc;
  }
  // chunks: runs of neighbours inside one 32 m block of the sort's grid (each group has its own grid, from its
  // own corner), never straddling a group, so a bin drawing its first group only (near the camera) takes whole chunks
  const counts = l && l.groups ? l.groups.counts : [n], starts = [];
  for (let g = 0, a = 0; g < counts.length; a += counts[g], g++) {
    const b = a + counts[g];
    let x0 = Infinity, z0 = Infinity, last = -1, size = 0;
    for (let i = a; i < b; i++) { x0 = Math.min(x0, A[i * 16 + 12]); z0 = Math.min(z0, A[i * 16 + 14]); }
    for (let i = a; i < b; i++) {
      const key = morton(Math.min(1023, Math.floor((A[i * 16 + 12] - x0) / (2 * CELL))), Math.min(1023, Math.floor((A[i * 16 + 14] - z0) / (2 * CELL))));
      if (key !== last || size >= CHUNK) { starts.push(i); last = key; size = 0; }
      size++;
    }
  }
  starts.push(n);
  const nc = starts.length - 1, B = new Float32Array(nc * 5);
  for (let c = 0; c < nc; c++) {
    const a = starts[c], b = starts[c + 1];
    let mx = 0, my = 0, mz = 0, rmax = 0;
    for (let i = a; i < b; i++) { mx += S[i * 4]; my += S[i * 4 + 1]; mz += S[i * 4 + 2]; rmax = Math.max(rmax, S[i * 4 + 3]); }
    mx /= b - a; my /= b - a; mz /= b - a;
    let R = 0;
    for (let i = a; i < b; i++) R = Math.max(R, Math.hypot(S[i * 4] - mx, S[i * 4 + 1] - my, S[i * 4 + 2] - mz) + S[i * 4 + 3]);
    B[c * 5] = mx; B[c * 5 + 1] = my; B[c * 5 + 2] = mz; B[c * 5 + 3] = R; B[c * 5 + 4] = rmax;
  }
  st.spheres = S; st.chunks = B; st.starts = Int32Array.from(starts); st.ready = true;
}

function ownCascade(frustum) { return frustum === this.userData.frustum; }

// A proxy beside D in its tile group (so the tile's disposal takes it): its own instance buffer, D's material.
function makeProxy(D, shadow) {
  const cap = D.instanceMatrix.count;
  const P = new THREE.InstancedMesh(D.geometry, D.material, 0);
  P.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16).setUsage(THREE.DynamicDrawUsage);
  if (!shadow && D.instanceColor) P.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
  P.count = 0;
  P.frustumCulled = false; // culled here, per chunk
  P.boundingSphere = D.boundingSphere; // for the render list's sort only
  P.matrixAutoUpdate = false; P.matrixWorldAutoUpdate = false;
  P.matrix.copy(D.matrix); P.matrixWorld.copy(D.matrixWorld);
  P.castShadow = shadow; P.receiveShadow = !shadow;
  if (shadow) { P.customDepthMaterial = D.customDepthMaterial; P.visible = false; P.userData.frustum = null; P.frustumCulled = true; P.intersectsFrustum = ownCascade; }
  P.userData.proxyOf = D; P.userData.n = 0; P.userData.sig = new Int32Array(0); P.userData.sigN = -1;
  D.parent.add(P);
  return P;
}

// Fills proxy P with D's instances [0, n) whose spheres meet the planes; returns how many. (ex, ey, ez): the eye
// (the cards swell with distance from it); keep: the share kept by hash (1: all); small, from: instances under
// `small` metres of radius past `from` metres are left out (0: none). Chunks wholly inside go in whole, chunks
// across a plane instance by instance; the proxy is refilled (copied and uploaded) only when what it holds changed.
let _runs = new Int32Array(512);
function fill(D, n, planes, ex, ey, ez, P, keep, small, from) {
  const st = D.userData.cull, B = st.chunks, starts = st.starts, S = st.spheres, nc = B.length / 5;
  const G = CARD.uCardGrow.value, g = G.x, g0 = G.y, gi = 1 / Math.max(1e-3, G.z - G.y);
  let m = 0; // runs [a, b) of instances, pairs in _runs
  const push = (a, b) => {
    if (m && _runs[m - 1] === a) _runs[m - 1] = b;
    else { if (m + 2 > _runs.length) { const r = new Int32Array(_runs.length * 2); r.set(_runs); _runs = r; } _runs[m++] = a; _runs[m++] = b; }
  };
  for (let c = 0; c < nc && starts[c] < n; c++) {
    const x = B[c * 5], y = B[c * 5 + 1], z = B[c * 5 + 2], R0 = B[c * 5 + 3];
    const dx = x - ex, dy = y - ey, dz = z - ez, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let t = (d + R0 - g0) * gi; t = t < 0 ? 0 : t > 1 ? 1 : t; // the swell grows with distance: at its farthest instance
    const R = R0 + B[c * 5 + 4] * g * t * t * (3 - 2 * t) + SWAY_MARGIN;
    let out = false, across = false;
    for (let p = 0; p < 24; p += 4) {
      const s = planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3];
      if (s < -R) { out = true; break; }
      if (s < R) across = true;
    }
    if (out) continue;
    const a = starts[c], b = Math.min(starts[c + 1], n), cut = small > 0 && d + R0 > from;
    if (!across && keep >= 1 && !cut) { push(a, b); continue; }
    for (let i = a; i < b; i++) {
      if (keep < 1 && keepHash(i) >= keep) continue;
      const j = i * 4, ix = S[j], iy = S[j + 1], iz = S[j + 2], r0 = S[j + 3];
      if (cut || across) {
        const ux = ix - ex, uy = iy - ey, uz = iz - ez, di = Math.sqrt(ux * ux + uy * uy + uz * uz);
        if (cut && r0 < small && di > from) continue;
        if (across) {
          let u = (di - g0) * gi; u = u < 0 ? 0 : u > 1 ? 1 : u;
          const r = -(r0 * (1 + g * u * u * (3 - 2 * u)) + SWAY_MARGIN);
          if (planes[0] * ix + planes[1] * iy + planes[2] * iz + planes[3] < r || planes[4] * ix + planes[5] * iy + planes[6] * iz + planes[7] < r
            || planes[8] * ix + planes[9] * iy + planes[10] * iz + planes[11] < r || planes[12] * ix + planes[13] * iy + planes[14] * iz + planes[15] < r
            || planes[16] * ix + planes[17] * iy + planes[18] * iz + planes[19] < r || planes[20] * ix + planes[21] * iy + planes[22] * iz + planes[23] < r) continue;
        }
      }
      push(i, i + 1);
    }
  }
  // unchanged since the last fill: nothing to copy or upload
  const ud = P.userData;
  let same = ud.sigN === m;
  for (let i = 0; same && i < m; i++) if (ud.sig[i] !== _runs[i]) same = false;
  if (same) return ud.n;
  if (ud.sig.length < m) ud.sig = new Int32Array(m * 2);
  ud.sig.set(_runs.subarray(0, m)); ud.sigN = m;
  const A = D.instanceMatrix.array, C = D.instanceColor && P.instanceColor ? D.instanceColor.array : null;
  const M = P.instanceMatrix.array, PC = C ? P.instanceColor.array : null;
  let k = 0;
  for (let r = 0; r < m; r += 2) {
    const a = _runs[r], b = _runs[r + 1];
    M.set(A.subarray(a * 16, b * 16), k * 16);
    if (PC) PC.set(C.subarray(a * 3, b * 3), k * 3);
    k += b - a;
  }
  if (k) { // only what is drawn goes up (an empty range would upload the whole buffer)
    const im = P.instanceMatrix; im.clearUpdateRanges(); im.addUpdateRange(0, k * 16); im.needsUpdate = true;
    if (PC) { const ic = P.instanceColor; ic.clearUpdateRanges(); ic.addUpdateRange(0, k * 3); ic.needsUpdate = true; }
  }
  ud.n = k;
  return k;
}

class InstanceCuller {
  constructor(scene) {
    this.managed = [];       // the meshes drawn through proxies this frame
    this.shadowProxies = []; // their cascade proxies
    this.stats = { managed: 0, waiting: 0, instances: 0, view: 0, near: 0, far: 0 }; // meshes through proxies, waiting to be prepared; instances they hold, kept for the view and each cascade
    this.frame = 0;
    const culler = this, prev = scene.onBeforeRender;
    scene.onBeforeRender = function (renderer, s, camera, target) { prev.call(this, renderer, s, camera, target); culler.beforeRender(camera); };
    cascadeHooks.push((shadow, camera) => this.cascades(shadow, camera));
  }

  // D drawn through its proxies (on, once prepared) or by itself (off)
  manage(D, on, list, wait) {
    let st = D.userData.cull;
    if (on) {
      if (!st) st = D.userData.cull = { on: false, ready: false, seen: 0, view: null, c0: null, c1: null, understory: UNDERSTORY.has(D.userData.sp ?? D.userData.cullSp) };
      if (!st.ready) { wait.push(D); return; }
      if (!st.on) { st.on = true; D.layers.disable(0); }
      st.seen = this.frame;
      list.push(D);
    } else if (st && st.on) {
      st.on = false; D.layers.enable(0);
      for (const P of [st.view, st.c0, st.c1]) if (P) { P.visible = false; P.userData.sigN = -1; }
    }
  }

  // After the LOD pass: which meshes are drawn through proxies (the costly ones: full geometry, or casting shadows,
  // and the variant groups beside them), preparing the ones that are not yet within the frame's budget.
  update(tiles, world, camPos) {
    const list = [], wait = [];
    this.frame++;
    for (const e of tiles.values()) {
      if (e.state !== 'ready' || !e.group.visible) continue;
      const dx = Math.max(0, Math.abs(camPos.x - e.ox - world.tileMetres / 2) - world.tileMetres / 2), dz = Math.max(0, Math.abs(camPos.z - e.oz - world.tileMetres / 2) - world.tileMetres / 2);
      const reach = MANAGE_REACH * Math.max(1, LOD_SCALE.value);
      if (dx * dx + dz * dz > reach * reach) continue;
      for (const m of e.veg) {
        const l = m.userData.lod;
        if (m.userData.sp === undefined || !l || !l.placed) continue; // the lake plants stay as they are
        this.manage(m, CULL.enabled && m.visible && (m.geometry === l.full || m.castShadow), list, wait);
        const G = l.groups;
        if (G && G.meshes && m.userData.cull && m.userData.cull.ready) for (const k of G.meshes) { k.userData.cullSp = m.userData.sp; this.manage(k, CULL.enabled && k.visible, list, wait); }
      }
    }
    // the meshes that left the list (their tile out of reach or gone, or no longer costly) draw themselves again
    for (const D of this.managed) if (D.userData.cull.on && D.userData.cull.seen !== this.frame) this.manage(D, false);
    // prepare the waiting ones, nearest first, within the budget (at least one a frame)
    if (wait.length) {
      const key = (D) => { const p = D.userData.lod; return p ? Math.hypot(p.cx - camPos.x, p.cz - camPos.z) : 0; };
      wait.sort((a, b) => key(a) - key(b));
      const t0 = performance.now();
      for (let i = 0; i < wait.length && (i === 0 || performance.now() - t0 < CULL.budget); i++) prepare(wait[i]);
    }
    this.managed = list;
    this.shadowProxies = [];
    for (const D of list) { const st = D.userData.cull; if (st.c0) this.shadowProxies.push(st.c0, st.c1); }
    this.stats.managed = list.length; this.stats.waiting = wait.length;
  }

  beforeRender(camera) {
    for (const P of this.shadowProxies) P.visible = false;
    if (!(camera.layers.mask & 1) || !this.managed.length) return; // the mirror's camera: it draws the bins themselves
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const planes = planesOf(_frustum.setFromProjectionMatrix(_pm), _planes[0]);
    const E = camera.matrixWorld.elements, ex = E[12], ey = E[13], ez = E[14];
    let inst = 0, kept = 0;
    for (const D of this.managed) {
      const st = D.userData.cull, P = st.view || (st.view = makeProxy(D, false));
      const n = D.visible ? D.count : 0;
      if (P.geometry !== D.geometry) P.geometry = D.geometry;
      const k = n ? fill(D, n, planes, ex, ey, ez, P, st.understory ? CULL.understory : 1, 0, 0) : 0;
      P.count = k; P.visible = k > 0;
      inst += n; kept += k;
    }
    this.stats.instances = inst; this.stats.view = kept;
  }

  cascades(shadow, camera) {
    if (!this.managed.length) return;
    const f0 = shadow.getFrustum(0), f1 = shadow.getFrustum(1), p0 = planesOf(f0, _planes[1]), p1 = planesOf(f1, _planes[2]);
    const E = camera.matrixWorld.elements, ex = E[12], ey = E[13], ez = E[14];
    let near = 0, far = 0;
    for (const D of this.managed) {
      const st = D.userData.cull;
      if (!D.visible || !D.castShadow || !D.count) continue;
      if (!st.c0) { st.c0 = makeProxy(D, true); st.c1 = makeProxy(D, true); this.shadowProxies.push(st.c0, st.c1); }
      const P0 = st.c0, P1 = st.c1, keep = st.understory ? CULL.understory : 1;
      if (P0.geometry !== D.geometry) { P0.geometry = D.geometry; P1.geometry = D.geometry; }
      P0.userData.frustum = f0; P1.userData.frustum = f1;
      P0.count = fill(D, D.count, p0, ex, ey, ez, P0, keep, 0, 0);
      P1.count = fill(D, D.count, p1, ex, ey, ez, P1, keep, CULL.farSmall, CULL.farSmallFrom);
      P0.visible = P0.count > 0; P1.visible = P1.count > 0;
      near += P0.userData.n; far += P1.userData.n;
    }
    this.stats.near = near; this.stats.far = far;
  }
}

// A tile never moves once installed and nothing in it is animated by its transform, so its world matrices are
// worked out once here and the scene's update walk (every frame, over some 24 000 objects with 25 tiles in) skips
// the whole subtree. What the tile gains later sets its own: a bin's variant-group meshes and the culling proxies
// copy the bin's, and updateVegetationLOD places a bin from the group's matrix.
function freeze(group) {
  group.updateMatrixWorld(true);
  group.matrixWorldAutoUpdate = false;
}

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
    this.culler = new InstanceCuller(scene);
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
    this.culler.update(this.tiles, w, camPos);
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
    freeze(group);
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
      freeze(g);
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
