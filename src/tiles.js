import * as THREE from 'three';
import { makeTerrainMesh } from './terrain.js';
import { makeVegetationMeshes, updateVegetationLOD, CARD, LOD_SCALE, SPECIES as VEG_SPECIES } from './vegetation.js';
import { makeAquaticMeshes, waterInit } from './aquatic.js'; // (d2 water: waterInit)
import { tilePropsSteps, exclusionsFor } from './props.js';
import { MeshGround } from './prop-kit.js';
import { RockShape, stemOf, trunkProfile, profileAt } from './collide.js';
import { meshHeightAt } from './terrain-build.js';
import { cascadeHooks } from './sunlight.js';
import { burnDate } from './burns.js';

// Streams the world around the player: a 5 x 5 neighbourhood of 2.56 km tiles (terrain, water, forest,
// lake vegetation, portages, campsites) built in a pool of workers and installed one per frame, a 3 x 3
// neighbourhood of 20 km far-field tiles (80 m terrain and water, no trees) underneath, and an LRU that
// lets go of the rest.

const NEIGHBOURHOOD = 2;      // tiles each side of the player's tile
const FAR_NEIGHBOURHOOD = 1;  // far tiles each side
const MAX_LOADED = 36;        // fine tiles kept before the least recently wanted are dropped
const DRAW_DISTANCE = 4600;   // metres to a tile centre; past the fog's far distance plus the tile radius
const FAR_DRAW_DISTANCE = 12000; // far chunks are cheap (2k triangles): keep distant shores around for a clearer sky
// A built tile is installed in stages (installSteps: the ground and the terrain, then the forest and the lake plants,
// then the props a trail, a yard or a campsite at a time, then the rest), as many a frame as fit in INSTALL_BUDGET
// ms and at least one, so a tile coming in spreads its main-thread work over a few frames instead of one long one.
const INSTALL_BUDGET = 3;
const LOD_STEP = 1; // round A-C: metres the camera moves in the tile underfoot before its LOD is looked at again (update)

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
  understoryShadow: true, // round A-C: the understory casts into the cascades (main.js: off at half the undergrowth, Low)
};
const UNDERSTORY = new Set([7, 10, 11, 12, 13, 20, 22]); // shrub, hazel, alder, sapling, fern, talus, a burn's regrowth (placement.js SPECIES)
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
      if (st.understory && !CULL.understoryShadow) continue; // round A-C: its proxies stay hidden (beforeRender)
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

// round A-C: the fine terrain as one mesh per quarter of the tile (four of the worker's 4 x 4 blocks, one run of the
// index: tile-worker.js partTerrain), each over the same arrays and index with its own draw range and sphere, so the
// view, the mirror and each shadow cascade draw only the quarters they meet. Quarters, not blocks: a block a mesh
// cut the triangles a little more but added ~100 draw calls a frame, which cost a slow CPU more than the triangles
// cost the GPU. TERRAIN_GROUP blocks a mesh (1, 4 or 16). A terrain built without blocks (the far chunks) stays one.
// (Same triangles, same arrays: MeshGround and the props read the index in any order.)
const TERRAIN_GROUP = 4, PART_STRIDE = 8;
function terrainParts(res, material) {
  const whole = makeTerrainMesh(res, material), P = res.parts;
  if (!P) return [whole];
  const out = [], src = whole.geometry, n = P.length / PART_STRIDE, box = new THREE.Box3(), b = new THREE.Box3();
  for (let q0 = 0; q0 < n; q0 += TERRAIN_GROUP) {
    let start = Infinity, end = 0;
    box.makeEmpty();
    for (let q = q0; q < Math.min(n, q0 + TERRAIN_GROUP); q++) {
      const o = q * PART_STRIDE, count = P[o + 1];
      if (!count) continue;
      start = Math.min(start, P[o]); end = Math.max(end, P[o] + count);
      box.union(b.set(new THREE.Vector3(P[o + 2], P[o + 3], P[o + 4]), new THREE.Vector3(P[o + 5], P[o + 6], P[o + 7])));
    }
    if (end <= start) continue;
    const geo = new THREE.BufferGeometry();
    for (const k of Object.keys(src.attributes)) geo.setAttribute(k, src.attributes[k]);
    geo.setIndex(src.index);
    geo.setDrawRange(start, end - start);
    geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    geo.boundingSphere.radius += 0.5;
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = whole.receiveShadow; m.castShadow = whole.castShadow; m.matrixAutoUpdate = false;
    m.name = 'terrain';
    out.push(m);
  }
  return out;
}

// A tile never moves once installed and nothing in it is animated by its transform, so its world matrices are
// worked out once here and the scene's update walk (every frame, over some 24 000 objects with 25 tiles in) skips
// the whole subtree. What the tile gains later sets its own: a bin's variant-group meshes and the culling proxies
// copy the bin's, and updateVegetationLOD places a bin from the group's matrix.
function freeze(group) {
  THREE.Object3D.prototype.updateMatrixWorld.call(group, true);
  group.matrixWorldAutoUpdate = false;
  group.updateMatrixWorld = frozenWalk;
}
// round A-C: three r186 still recurses into every child of a group whose matrixWorldAutoUpdate is off, so the frozen
// tiles cost the per-render walk ~25 000 calls a frame (the main pass's; the mirror's skips the walk), 14 % of the
// frame's main thread at Lake One. A frozen tile's walk now goes only into its groups (the props, whose meshes keep three's own
// rule: a prop moved by hand calls updateMatrix and is picked up); the terrain, the far water, the vegetation's bins,
// their variant groups and the culling proxies set their own matrixWorld and are never walked.
function frozenWalk(force) {
  const ch = this.children;
  for (let i = 0; i < ch.length; i++) if (ch[i].isGroup) ch[i].updateMatrixWorld(force);
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
    const waterMsg = { type: 'water', ...waterInit(world) }; // d2 water: the lakes' colour and beds, a message of its own after init
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(new URL('./tile-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.onMessage(e.data);
      w.postMessage({ type: 'init', grid: world.meta.grid, levelById: world.levelById, clarityById: world.clarityById, exclusions, seed,
        bowlById: world.facts ? world.facts.bowlById : null, riceById: world.facts ? world.facts.riceById : null, // d1 lakes: the lakes' bowls and rice (lake-facts.js)
        land: typeof location === 'undefined' || !/[?&]land=off\b/.test(location.search) }); // d2 land: `?land=off`, the noise's land (land.js setLand)
      return { w, key: null, entry: null }; // entry: the request this worker's build answers (onMessage)
    });
    for (const x of this.workers) x.w.postMessage(waterMsg); // d2 water (after each one's init)
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
  async ensure(x, z, r = 0) {
    const w = this.world;
    const [tx0, ty0] = w.tileOf(x - r, z - r), [tx1, ty1] = w.tileOf(x + r, z + r);
    // asked for outright (a teleport's target): kept in the queue and the installs even while it lies outside the
    // player's neighbourhood, so busy workers cannot let it be forgotten and the wait resolve on nothing. A tile that
    // still is not in when the wait ends (its build failed, or it was let go) is asked for again, a couple of times.
    for (let round = 0; round < 3; round++) {
      const waits = [];
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const e = this.request(tx, ty);
        if (e.state !== 'ready') { e.ensured = true; waits.push(e.ready); }
      }
      if (!waits.length) return;
      this.dispatch(x, z);
      await Promise.all(waits);
    }
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
      this.install(40);
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
    this.camPos = camPos;
    this.dispatch(px, pz);
    // frames far apart (a hidden or throttled window, where a frame may come once a second): nobody is watching them
    // be smooth, so the installs take a quarter of the gap (to 100 ms) instead of 3 ms, or a teleport's wait stretches
    // to a minute and more at a step of a tile a frame
    const now = performance.now(), gap = this.lastUpdate ? now - this.lastUpdate : 0;
    this.lastUpdate = now;
    const hidden = typeof document !== 'undefined' && document.hidden;
    this.install(hidden || gap > 500 ? Math.min(100, Math.max(INSTALL_BUDGET, gap / 4, hidden ? 50 : 0)) : INSTALL_BUDGET);
    this.evict();
    // draw only what the fog lets through; far chunks stand in wherever a fine tile is missing
    // round A-C: a tile's LOD is worked out again only once the camera has moved a step that could change a decision
    // there: LOD_STEP metres in the tile underfoot, a fiftieth of the distance to a tile farther off (a choice made at
    // 2 km is the same choice 40 m on), or at once when the tile's meshes or the LOD scale changed. It
    // walked all ~16 000 bins of 25 tiles every frame (9 % of the main thread at Lake One).
    CARD.uEye.value.copy(camPos);
    const half = w.tileMetres / 2;
    for (const e of this.tiles.values()) {
      if (e.state !== 'ready') continue;
      const [ox, oz] = w.tileOrigin(e.tx, e.ty);
      const d = Math.hypot(ox + half - px, oz + half - pz);
      e.group.visible = d < DRAW_DISTANCE;
      if (!e.group.visible) continue;
      const L = e.lodAt || (e.lodAt = { x: NaN, z: NaN, s: -1, n: -1 });
      const edge = Math.hypot(Math.max(0, Math.abs(camPos.x - ox - half) - half), Math.max(0, Math.abs(camPos.z - oz - half) - half));
      const moved = Math.hypot(camPos.x - L.x, camPos.z - L.z);
      if (L.n === e.veg.length && L.s === LOD_SCALE.value && moved < Math.max(LOD_STEP, edge * 0.02)) continue;
      updateVegetationLOD(e.veg, camPos);
      L.x = camPos.x; L.z = camPos.z; L.s = LOD_SCALE.value; L.n = e.veg.length;
    }
    this.culler.update(this.tiles, w, camPos);
    // round A-C: at a short tree detail distance (Low's 0.5) the far field ends sooner too, past the haze's thick part
    // (8.4 km, not 12): the far chunks are two draw calls each, and Low drew some thirty of them
    const farReach = FAR_DRAW_DISTANCE * Math.min(1, 0.4 + 0.6 * LOD_SCALE.value);
    for (const [key, g] of this.farChunks) {
      const fine = this.tiles.get(key);
      if (fine && fine.state === 'ready') { g.visible = false; continue; }
      const d = Math.hypot(g.userData.cx - px, g.userData.cz - pz);
      g.visible = d < farReach;
    }
  }

  dispatch(px, pz) {
    this.lastPos = [px, pz];
    if (!this.queue.length) return;
    const w = this.world;
    const dist = (e) => {
      if (e.level === 'far') return -1; // far tiles are cheap and cover the gaps: first
      if (e.ensured) return 0;          // then what was asked for outright (a teleport's target)
      const [ox, oz] = w.tileOrigin(e.tx, e.ty);
      return Math.hypot(ox + w.tileMetres / 2 - px, oz + w.tileMetres / 2 - pz);
    };
    this.queue.sort((a, b) => dist(a) - dist(b));
    for (const wk of this.workers) {
      if (wk.key || !this.queue.length) continue;
      const e = this.queue.shift();
      e.state = 'building';
      wk.key = e.key; wk.entry = e;
      // (the season's date goes with each build: the burns a tile shows are those begun by then, burns.js)
      const bd = burnDate(), date = [bd.year, bd.doy];
      if (e.level === 'far') wk.w.postMessage({ type: 'build', level: 'far', key: e.key, fx: e.fx, fy: e.fy, url: w.farUrl(e.fx, e.fy), date });
      else wk.w.postMessage({ type: 'build', level: 'fine', key: e.key, tx: e.tx, ty: e.ty, url: w.tileUrl(e.tx, e.ty), date });
    }
  }

  onMessage(m) {
    // the build answers the request its worker was given (the entry, not the key: a key let go and asked for again
    // is a new request); a result for a request no longer in the map is dropped, never installed over another
    const wk = this.workers.find((x) => x.key === m.key);
    const e = wk ? wk.entry : null;
    if (wk) { wk.key = null; wk.entry = null; }
    const map = e && e.level === 'far' ? this.farTiles : this.tiles;
    const live = !!e && e.state === 'building' && map.get(e.key) === e;
    if (m.type === 'error') {
      console.warn('tile build failed', m.key, m.error);
      if (live) { map.delete(e.key); e.state = 'failed'; }
      if (e) e.resolve(); // (an ensure asks again)
    } else if (live) {
      e.result = m;
      e.state = 'built';
      if (e.level === 'far') this.installFar(e); else this.pending.push(e);
    }
    // the next build goes out now, not at the next frame (which a hidden window may not draw for a second)
    if (this.lastPos) this.dispatch(this.lastPos[0], this.lastPos[1]);
  }

  // budget: ms this frame may spend (prime passes more: no frame is waiting on it)
  install(budget = INSTALL_BUDGET) {
    const t0 = performance.now();
    let steps = 0;
    while (this.pending.length && (steps === 0 || performance.now() - t0 < budget)) {
      // a tile not begun yet: the one asked for outright first, then the nearest (not the first built, which after a
      // jump is often one of the neighbourhood left behind)
      if (!this.pending[0].steps && this.pending.length > 1 && this.lastPos) {
        const [px, pz] = this.lastPos, w = this.world;
        const rank = (e) => { if (e.ensured) return -1; const [ox, oz] = w.tileOrigin(e.tx, e.ty); return Math.hypot(ox + w.tileMetres / 2 - px, oz + w.tileMetres / 2 - pz); };
        let best = 0;
        for (let i = 1; i < this.pending.length; i++) if (rank(this.pending[i]) < rank(this.pending[best])) best = i;
        if (best) this.pending.unshift(...this.pending.splice(best, 1));
      }
      const e = this.pending[0];
      if (e.state !== 'built') { this.pending.shift(); continue; }
      if (!e.steps) e.steps = this.installSteps(e);
      const t = performance.now(), done = e.steps.next().done;
      steps++;
      (e.installMs || (e.installMs = [])).push(+(performance.now() - t).toFixed(2));
      if (done) { this.pending.shift(); e.steps = null; this.stats.lastInstall = e.installMs; }
    }
  }

  installFine(e) { const it = this.installSteps(e); while (!it.next().done); }

  *installSteps(e) {
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
    for (const m of terrainParts(r.terrain, this.terrainMaterial)) group.add(m); // round A-C: in quarters, culled one by one
    if (r.water) group.add(this.water.makeFarMesh(r.water));
    this.scene.add(group);
    freeze(group);
    const fc = this.farChunks.get(e.key);
    if (fc) fc.visible = false; // the fine terrain is in: the far chunk under it goes
    yield;
    // the forest and the lake plants, put at their LOD at once so no frame draws a whole stand at full detail
    // which mesh draws each of the worker's bins (one per bin with instances, in order), for the collision's geometry
    // keys (bin * 64 + group: tile-worker.js collisionOf); read before makeVegetationMeshes drops the bins that are
    // no trunks from the list
    const binMesh = [];
    let nb = 0;
    for (const b of r.veg) binMesh.push(b.count ? nb++ : -1);
    e.veg = makeVegetationMeshes(r.veg, this.vegetation);
    e.binMesh = binMesh;
    e.vegBins = r.veg; e.ox = ox; e.oz = oz; e.collide = r.collide; e.shapes = new Map();
    e.trunkR = r.collide ? new Float32Array(r.collide.trunks.length / 3).fill(NaN) : null; // the drawn radii, measured on first meeting
    if (this.aquatic) e.veg.push(...makeAquaticMeshes(r.aquatic, this.aquatic));
    for (const m of e.veg) group.add(m);
    if (this.camPos) updateVegetationLOD(e.veg, this.camPos);
    yield;
    // the props, a piece at a time
    const steps = tilePropsSteps(w.tileGrid(e.tx, e.ty), w, e.tx, e.ty);
    let st = steps.next();
    while (!st.done) { yield; st = steps.next(); }
    const props = st.value;
    group.add(props);
    e.obstacles = props.userData.obstacles; // docks, shacks, tents and the like, in world coordinates
    freeze(group);
    e.group = group; e.state = 'ready'; e.result = null;
    // in this frame (evict runs after the installs, before an ensure's waiter can stand on it): the newest wanted
    e.readyTick = this.tick;
    if (e.ensured) { e.lastWanted = this.tick; e.ensured = false; }
    this.stats.built++; this.stats.trees += r.trees; this.stats.plants += r.plants;
    this.water.invalidateAtlas(e.tx * w.tile, e.ty * w.tile, w.tile);
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
      const victims = [...this.tiles.values()].filter((e) => e.state === 'ready' && !wanted(e) && e.readyTick !== this.tick).sort((a, b) => a.lastWanted - b.lastWanted);
      for (let i = 0; i < victims.length && this.tiles.size > MAX_LOADED; i++) {
        const e = victims[i];
        this.disposeGroup(e.group);
        w.clearTile(e.tx, e.ty);
        this.grounds.delete(e.ty * w.ntx + e.tx); e.ground = null;
        this.tiles.delete(e.key);
        const fc = this.farChunks.get(e.key);
        if (fc) fc.visible = true;
        this.water.invalidateAtlas(e.tx * w.tile, e.ty * w.tile, w.tile);
      }
    }
    // queued tiles that fell out of the neighbourhood are forgotten rather than built
    this.queue = this.queue.filter((e) => { if (e.level === 'far' || wanted(e) || e.ensured) return true; this.tiles.delete(e.key); e.state = 'dropped'; e.resolve(); return false; });
    // and so are the built ones not begun installing: installed only to be evicted the same frame, they held the
    // installs (and the new neighbourhood) up after a jump; one begun finishes (its ground is already registered)
    this.pending = this.pending.filter((e) => { if (e.steps || e.state !== 'built' || wanted(e) || e.ensured) return true; this.tiles.delete(e.key); e.state = 'dropped'; e.result = null; e.resolve(); return false; });
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

  // Everything the walker is held off within r metres of (x, z), in world metres:
  //   the trunks as circles { x, z, r }, r the drawn trunk's radius a little over the ground (measured from the geometry
  //     the tree is drawn with: collide.js trunkProfile);
  //   the solids, each with `shape`, its own drawn geometry where it stands (collide.js RockShape: a height, and a hull
  //     per part at any level), and r its reach round (x, z): the rocks (the boulders, the outcrops, the scree) and the
  //     cliff modules of the bluffs { rock: true, cliff?: true }; the down logs { log: true, top, ax, az, bx, bz, rad }
  //     (the stem as a capsule from (ax, az) to (bx, bz) of radius rad, for anyone who wants it simple) and the
  //     stumps { stump: true, top };
  //   the props' footprints, circles or boxes { x, z, ux, uz, hx, hz, box: true } (props.js; one with `top`, the
  //     height of its top, is stood on: a dock's deck).
  // The worker sorted the trunks and the solids into cells (tile-worker.js collisionOf), so a query reads only the
  // cells it touches; a solid's shape is made the first time one comes this near and kept with the tile.
  treesNear(x, z, r) {
    const out = [], w = this.world, M = 40; // M: the furthest a solid reaches from its origin (a cliff module running far back into its hill)
    const [tx0, ty0] = w.tileOf(x - r - M, z - r - M), [tx1, ty1] = w.tileOf(x + r + M, z + r + M);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const e = this.tiles.get(this.key(tx, ty));
      if (!e || e.state !== 'ready' || !e.collide) continue;
      const C = e.collide, n = C.n, S = C.cell, lx = x - e.ox, lz = z - e.oz;
      const scan = (reach, start, each) => {
        const c0 = Math.max(0, Math.floor((lx - reach) / S)), c1 = Math.min(n - 1, Math.floor((lx + reach) / S));
        const r0 = Math.max(0, Math.floor((lz - reach) / S)), r1 = Math.min(n - 1, Math.floor((lz + reach) / S));
        for (let cz = r0; cz <= r1; cz++) for (let cx = c0; cx <= c1; cx++) { const c = cz * n + cx; for (let i = start[c]; i < start[c + 1]; i++) each(i); }
      };
      const T = C.trunks;
      scan(r + 1.5, C.trunkStart, (i) => {
        const o = i * 3, dx = T[o] - lx, dz = T[o + 1] - lz, d2 = dx * dx + dz * dz;
        if (d2 > (r + 1.5) ** 2) return;
        const tr = this.trunkRadius(e, i);
        if (d2 <= (r + tr) ** 2) out.push({ x: T[o] + e.ox, z: T[o + 1] + e.oz, r: tr });
      });
      const R = C.rocks, ST = 15; // tile-worker.js ROCK_STRIDE_C
      scan(r + C.maxR, C.rockStart, (i) => {
        const o = i * ST, dx = R[o] - lx, dz = R[o + 2] - lz, rr = r + R[o + 3];
        if (dx * dx + dz * dz > rr * rr) return;
        const s = this.rockShape(e, i, o);
        if (!s || (R[o + 3] > 3 && s.shape.boundsDist(x, z) > r)) return; // a big one: near its bounds, not just its reach
        out.push(s);
      });
      if (e.obstacles) for (const o of e.obstacles) if (Math.hypot(o.x - x, o.z - z) <= r + (o.box ? Math.hypot(o.hx, o.hz) : o.r)) out.push(o);
    }
    for (const o of this.dynamic || []) if (Math.hypot(o.x - x, o.z - z) <= r + (o.box ? Math.hypot(o.hx, o.hz) : o.r)) out.push(o); // pitched since the tiles were built: camp.js's tents
    return out;
  }
  // the geometry the worker's key names (bin * 64 + group): the variant that group of that bin is drawn with
  keyGeometry(e, key) {
    const bi = Math.floor(key / 64), g = key - bi * 64, mi = e.binMesh ? e.binMesh[bi] : -1, m = mi >= 0 && e.veg ? e.veg[mi] : null;
    const L = m && m.userData.lod;
    if (!L) return null;
    return L.groups ? L.groups.geos[g] || L.full : L.full;
  }
  // a tile's trunk i at its drawn radius: the stem's 0.3 m over the ground, at the tree's scale (kept once measured)
  trunkRadius(e, i) {
    let tr = e.trunkR[i];
    if (tr === tr) return tr;
    const T = e.collide.trunks, Mt = e.collide.trunkMeta, o = i * 3, q = i * 4;
    const geo = Mt && this.keyGeometry(e, Mt[q + 3]);
    tr = T[o + 2];
    if (geo) {
      const y = this.groundAt(T[o] + e.ox, T[o + 1] + e.oz) + 0.3, h = (y - Mt[q]) / Math.max(1e-3, Mt[q + 1]);
      const pr = profileAt(trunkProfile(geo), h);
      if (pr === pr) tr = Math.max(0.06, pr * Mt[q + 2]);
    }
    e.trunkR[i] = tr;
    return tr;
  }
  // a tile's solid i (its record at offset o) as the walker meets it: { x, z, r, shape, ...what it is } (kept)
  rockShape(e, i, o) {
    let s = e.shapes.get(i);
    if (s === undefined) {
      const R = e.collide.rocks, sp = R[o + 5], geo = this.keyGeometry(e, R[o + 4]);
      s = null;
      if (geo) {
        // a log's limbs and a stump's roots (thin pieces of a few vertices) are passed; the stem and the root plate hold
        const wood = sp === 14 || sp === 15, shape = new RockShape(geo, R, o, e.ox, e.oz, { minVerts: wood ? 6 : 0, rings: sp === 14 });
        s = { x: R[o] + e.ox, z: R[o + 2] + e.oz, r: R[o + 3], shape };
        if (sp === 14) {
          // the stem's axis in the world: the instance matrix (columns at o + 6, o + 9, o + 12) on its own frame's ends
          const st = stemOf(geo), at = (px) => [R[o] + R[o + 6] * px + R[o + 9] * st.y + R[o + 12] * st.z + e.ox, R[o + 2] + R[o + 8] * px + R[o + 11] * st.y + R[o + 14] * st.z + e.oz];
          const [ax, az] = at(st.x0), [bx, bz] = at(st.x1);
          Object.assign(s, { log: true, top: shape.maxY, ax, az, bx, bz, rad: st.r * Math.hypot(R[o + 12], R[o + 13], R[o + 14]) });
        } else if (sp === 15) Object.assign(s, { stump: true, top: shape.maxY });
        else { s.rock = true; if (sp === 21) s.cliff = true; }
      }
      if (e.shapes.size > 6000) e.shapes.clear(); // made again when met again
      e.shapes.set(i, s);
    }
    return s;
  }
  readyFarTiles() { return [...this.farTiles.values()].filter((e) => e.state === 'ready'); }

  // One instance of every material the tiles draw with, as they draw it (instanced, with colours where the forest
  // has them, the cards' depth material for the shadows): main.js compiles it at startup (renderer.compileAsync) so
  // a species, a cliff or a lake plant first met miles on compiles nothing in the frame it comes into view.
  prewarmGroup() {
    const g = new THREE.Group(), kit = this.vegetation;
    kit.variants.forEach((vs, sp) => {
      if (!vs || !vs.length) return;
      const m = new THREE.InstancedMesh(vs[0].full, VEG_SPECIES[sp].cliff ? kit.cliffMaterial : kit.materialFor(sp), 1);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
      m.customDepthMaterial = kit.depthFor(sp);
      g.add(m);
    });
    const aq = this.aquatic;
    if (aq) aq.geos.forEach((set, k) => { if (set && set.length && aq.mats[k]) g.add(new THREE.InstancedMesh(set[0], aq.mats[k], 1)); });
    return g;
  }

  // round A-C: one of every shadow caster the tiles make, as the shadow pass draws it (a bin with its colours, a
  // cascade proxy without, the lake plants that cast), unculled, for main.js to draw a shadow pass with behind the
  // title card: three's compile skips the depth programs, so each compiled in the frame its kind first cast a shadow
  // (and again for the other light state: see quality.js prewarmPasses). Placed by the caller; dispose() after.
  shadowPrewarmGroup() {
    const g = new THREE.Group(), kit = this.vegetation, id = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const add = (geo, mat, depth, colour) => {
      const m = new THREE.InstancedMesh(geo, mat, 1);
      m.instanceMatrix.array.set(id);
      if (colour) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
      if (depth) m.customDepthMaterial = depth;
      m.castShadow = true; m.frustumCulled = false; m.scale.setScalar(0.01);
      g.add(m);
    };
    kit.variants.forEach((vs, sp) => {
      if (!vs || !vs.length || VEG_SPECIES[sp].shadow === false) return;
      const mat = VEG_SPECIES[sp].cliff ? kit.cliffMaterial : kit.materialFor(sp), depth = kit.depthFor(sp);
      add(vs[0].full, mat, depth, true);  // the bin, drawn whole
      add(vs[0].full, mat, depth, false); // its cascade proxy (tiles.js makeProxy: no colours)
    });
    const aq = this.aquatic;
    if (aq && aq.geos[1] && aq.geos[1].length) add(aq.geos[1][0], aq.mats[1], aq.depth, false);
    g.dispose = () => { for (const m of g.children) if (m.dispose) m.dispose(); };
    return g;
  }
}
