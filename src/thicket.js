import * as THREE from 'three';
import { hash2, fbm, smoothstep } from './rng.js';
import { KIND, WCLASS, wclass1, wclass2, emergentGrow } from './land.js';
import { GUEST } from './placement.js';

// The near ring (the density round, 2026-11-01). The owner: "the biggest thing i notice is how much more open our game
// is compared to real life ... I don't want to walk through that vs that looks walkable. right now everything seems
// walkable bc it is so open." A black spruce bog stands 1,500–2,500 stems a hectare, an alder swamp a head-high wall,
// a marsh a field of cattail taller than you; the tiles draw a few dozen trees a hectare there, which is all a whole
// tile can afford. So round the camera, and only there, the wetlands are filled in: the bog's poles, live, dead-topped
// and dead, and its young spruce; the alder's wall; the leatherleaf and Labrador tea as one lumpy surface; the
// tamarack's open stands; the black ash on its mounds and the logs under it; the marsh's cattail, bulrush and sedge.
// Within a wetland you should not see past 15 or 20 m; the trails, the campsites and the yards stay clear (the tiles'
// exclusions), so they read as the way.
//
// How: the ground is cut into CHUNK m squares (two of the world's 10 m cells). A chunk's plants are worked out once,
// the first time it comes within reach, from the cells' NWI classes (land.js WCLASS, the second class in patches as
// wetlandMix makes them) or, where there is no code, the ground kind; every plant is seeded from its cell, so a chunk
// grows the same plants whenever it comes back. Each layer reaches its own distance (LAYERS reach) and thins out over
// the last quarter of it, by a number of each plant's own, so the edge of the ring has no line. The plants are drawn
// with the tiles' own geometry and materials (the vegetation kit's variants, the lake plants' reed clumps on land:
// aquatic.js kind 4), so they take the season, the wind and the light as the tiles' do; one instanced mesh per variant,
// a second for the near ones, which alone cast shadows. The meshes are filled again only when the camera crosses a
// chunk (or a chunk comes in, or the detail ground moves under one): a few thousand matrices, every few seconds.
// Nothing here is a trunk: the walker pushes through it (the brush slows the walk: brushAt, player.js).

export const CHUNK = 20;
const SHADOW_R = 30;          // only the plants within this of the camera's chunk cast shadows
const BUDGET = 3;             // ms a frame may spend working out chunks (a teleport fills the ring over a few frames)
// The layers: the geometry they draw (kit species index and the variants, or the land reeds), how far they reach (m),
// the most a hectare holds anywhere (their candidates per cell), their pad off a trail or a site (m), the shore distance
// they keep (m), how deep they sink, and how they scale. `pick(h)` chooses a variant from a number in [0, 1).
export const LAYERS = {
  pole: { sp: 25, variants: [0, 1, 2, 3, 4, 5], reach: 115, pad: 1.1, shore: 0.9, sink: 0.35, pick: (h) => (h < 0.13 ? 5 : h < 0.25 ? 1 : h < 0.36 ? 4 : h < 0.6 ? 0 : h < 0.82 ? 3 : 2) },
  alder: { sp: 11, variants: [0, 1, 2, 3, 4, 5], reach: 95, pad: 0.5, shore: 0.2, sink: 0.12 },
  shrub: { sp: 7, variants: [0, 1, 2, 3], reach: 70, pad: 0.4, shore: 0.25, sink: 0.3 },
  mat: { sp: 24, variants: [0, 1, 2, 3], reach: 60, pad: 0.3, shore: 0.4, sink: 0.08 },
  tamarack: { sp: 17, variants: [0, 1, 3, 4], reach: 115, pad: 1.2, shore: 0.9, sink: 0.35 },
  ash: { sp: 3, variants: [18, 19, 20, 21], reach: 110, pad: 1.2, shore: 0.9, sink: 0.35, scale: GUEST[23][2] }, // (the birch's bins hold the ash's variants after the aspen's)
  log: { sp: 14, variants: [0, 1, 2, 3], reach: 70, pad: 1.6, shore: 0.6, sink: 0.04, log: true },
  reed: { reeds: [2, 0, 3], reach: 75, pad: 0.4, shore: -0.2, sink: 0.05 }, // cattail, bulrush, sedge
};
// What grows in each class, a hectare at full density: [layer, per hectare, scale from, to] (and for the reeds the
// shares of cattail, bulrush and sedge). From the real counts (scratchpad bogs-brief): black spruce 1,500–2,500 stems,
// speckled alder 3,000–8,000, cattail over half the ground; the game stays under them (the ring draws them all
// near you), the tiles' own trees and brush on top of these.
const R = (cat, rush, sedge) => [cat, rush, sedge];
export const GROWS = {
  FO4: [['pole', 760, 0.35, 1.25], ['mat', 2200, 0.85, 1.35], ['log', 45, 0.45, 0.7], ['shrub', 60, 0.6, 0.9]],
  FO2: [['tamarack', 260, 0.45, 0.95], ['pole', 160, 0.35, 1.0], ['alder', 300, 0.8, 1.3], ['mat', 1300, 0.85, 1.3], ['log', 30, 0.45, 0.7]],
  FO: [['pole', 380, 0.4, 1.15], ['alder', 420, 0.85, 1.35], ['tamarack', 80, 0.5, 1.0], ['mat', 400, 0.8, 1.2], ['log', 50, 0.5, 0.8]],
  FO1: [['ash', 170, 0.7, 1.05], ['alder', 380, 0.85, 1.35], ['log', 70, 0.55, 0.9], ['shrub', 120, 0.7, 1.1]],
  SS1: [['alder', 1150, 0.95, 1.55], ['shrub', 160, 0.8, 1.2], ['pole', 25, 0.3, 0.8], ['reed', 250, 0.9, 1.2, R(0.1, 0.1, 0.8)]],
  SS: [['alder', 800, 0.9, 1.45], ['shrub', 300, 0.8, 1.2], ['mat', 400, 0.8, 1.2], ['pole', 40, 0.3, 0.8]],
  SS2: [['tamarack', 300, 0.22, 0.42], ['mat', 2600, 0.8, 1.3], ['pole', 50, 0.25, 0.5]],
  SS3: [['mat', 3300, 0.8, 1.3], ['pole', 80, 0.2, 0.5], ['tamarack', 30, 0.2, 0.4]],
  SS4: [['pole', 520, 0.25, 0.6], ['mat', 2600, 0.8, 1.3], ['tamarack', 30, 0.25, 0.45]],
  EM1: [['reed', 5600, 1.1, 1.6, R(0.62, 0.18, 0.2)], ['alder', 25, 0.9, 1.3], ['pole', 6, 0.5, 1.0]],
  EM2: [['reed', 2600, 0.9, 1.3, R(0.05, 0.6, 0.35)], ['pole', 3, 0.5, 1.0]],
  meadow: [['reed', 900, 0.8, 1.1, R(0.05, 0.1, 0.85)], ['alder', 70, 0.8, 1.2], ['pole', 18, 0.6, 1.1]], // a beaver meadow: sedge, drowned snags
};
// the ground kind's class where the NWI gives no code (Ontario, and the odd cell)
const KIND_CLASS = { [KIND.openBog]: 'SS3', [KIND.coniferBog]: 'FO4', [KIND.shrubSwamp]: 'SS1', [KIND.marsh]: 'EM1', [KIND.wetMeadow]: 'meadow', [KIND.hardwoodSwamp]: 'FO1', [KIND.water]: 'meadow' };
// how much of each layer is in the way of a walker, per plant a hectare at the class's numbers (brushAt)
const BRUSH = { alder: 1 / 900, reed: 1 / 4500, pole: 1 / 1400, mat: 1 / 6000, shrub: 1 / 2000, tamarack: 1 / 2000, ash: 0, log: 0 };

// The class of a 10 m cell: its NWI class (the second one on part of it, as land.js wetlandMix lays the patches), else
// its ground kind's; null on the upland and in the water's own classes
function classOf(world, x, z) {
  const wc = world.chAt('wcls', x, z);
  if (wc) {
    const A = WCLASS[wclass1(wc)], B = WCLASS[wclass2(wc)];
    if (A && A.trees !== undefined) {
      if (B && B !== A && B.trees !== undefined && smoothstep(0.59, 0.64, fbm(x * 0.022 + 31, z * 0.022 - 17, 2, 263)) > 0.5) return B.code;
      return A.code;
    }
    if (A) return null;
  }
  return KIND_CLASS[world.chAt('ground', x, z)] || null;
}
// how thick the brush is at a point, 0 open .. 1 a wall: the walk slows through it (player.js); 0 on a trail's tread
// is the caller's (it knows where the trail is)
export function brushAt(world, x, z) {
  if (!world.chAt) return 0;
  const c = classOf(world, x, z), G = c && GROWS[c];
  if (!G) return 0;
  let b = 0;
  for (const [layer, n] of G) b += n * (BRUSH[layer] || 0);
  return Math.min(1, b);
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export class Thicket {
  // tiles: the TileManager (groundAt, the world); exclusions: the trails', sites' and yards' segments (props.js
  // exclusionsFor: [x1, z1, x2, z2, radius], a negative radius a yard)
  constructor(tiles, scene, exclusions, { kit, aquatic }) {
    this.tiles = tiles; this.world = tiles.world; this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'thicket';
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);
    this.chunks = new Map();  // key -> { ci, cj, lists: Map(bucket -> Float64Array rows), touched }
    this.want = [];           // chunk keys waiting to be worked out, nearest first
    this.at = null;           // the camera's chunk [ci, cj]
    this.dirty = true;
    this.doy = 180;
    this.enabled = !(typeof location !== 'undefined' && /[?&]thicket=off\b/.test(location.search));
    // the trails, sites and yards, bucketed into 64 m cells
    this.ex = new Map();
    for (const s of exclusions) {
      const r = Math.abs(s[4]) + 2, x0 = Math.floor((Math.min(s[0], s[2]) - r) / 64), x1 = Math.floor((Math.max(s[0], s[2]) + r) / 64);
      const z0 = Math.floor((Math.min(s[1], s[3]) - r) / 64), z1 = Math.floor((Math.max(s[1], s[3]) + r) / 64);
      for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) { const k = i * 100003 + j; const a = this.ex.get(k); if (a) a.push(s); else this.ex.set(k, [s]); }
    }
    // the buckets: one per layer and variant, each an inner (shadow-casting) and an outer mesh
    this.buckets = [];
    for (const [name, L] of Object.entries(LAYERS)) {
      L.name = name; L.index = {};
      const list = L.reeds || L.variants;
      list.forEach((v, k) => {
        let geo, mat, depth;
        if (L.reeds) { if (!aquatic || !aquatic.land) return; geo = aquatic.land.geos[v]; mat = aquatic.land.mat; depth = aquatic.land.depth; }
        else { const V = kit.variants[L.sp][v]; if (!V) return; geo = V.full; mat = kit.materialFor(L.sp); depth = kit.depthFor(L.sp); }
        const b = { layer: L, k, geo, mat, depth, n: 0, meshes: [] };
        L.index[k] = this.buckets.length;
        this.buckets.push(b);
      });
    }
  }

  // inside a trail's, a site's or a yard's clearing, grown by pad?
  blocked(x, z, pad) {
    const a = this.ex.get(Math.floor(x / 64) * 100003 + Math.floor(z / 64));
    if (!a) return false;
    for (const s of a) {
      const dx = s[2] - s[0], dz = s[3] - s[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / L2));
      if (Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t) < Math.abs(s[4]) + pad) return true;
    }
    return false;
  }

  setSeason(season) {
    const d = season.doy | 0;
    // the wild rice's kin die back and come up again with the season: worked out again when the date has moved
    if (Math.abs(d - this.doy) >= 4) { this.doy = d; this.reset(); }
  }
  // every chunk worked out again (the date moved, or a test asks)
  reset() { this.chunks.clear(); this.want.length = 0; this.dirty = true; }
  // the detail ground moved under rect [x0, z0, x1, z1] (detail.js): the chunks there are seated again
  touched(rect) {
    for (const [key, c] of this.chunks) {
      const x0 = c.ci * CHUNK, z0 = c.cj * CHUNK;
      if (x0 > rect[2] || x0 + CHUNK < rect[0] || z0 > rect[3] || z0 + CHUNK < rect[1]) continue;
      this.chunks.delete(key);
      this.want.unshift(key);
    }
    this.dirty = true;
  }

  // Work out one chunk: every 10 m cell's plants, seeded from the cell
  build(ci, cj) {
    const w = this.world, lists = new Map(), em2 = emergentGrow(this.doy);
    const add = (bi, row) => { let a = lists.get(bi); if (!a) lists.set(bi, (a = [])); a.push(...row); };
    let ready = true;
    for (let sj = 0; sj < 2; sj++) for (let si = 0; si < 2; si++) {
      const cx = ci * CHUNK + si * 10 + 5, cz = cj * CHUNK + sj * 10 + 5;
      if (!w.isReady(cx, cz)) { ready = false; continue; }
      const gi = Math.round(cx / 10), gj = Math.round(cz / 10);
      const cls = classOf(w, cx, cz), G = cls && GROWS[cls];
      if (!G) continue;
      // patches: the stand thicker and thinner over a few tens of metres (0.55 .. 1.35)
      const patch = 0.55 + 0.8 * smoothstep(0.3, 0.7, fbm(cx * 0.035 + 7, cz * 0.035 - 3, 2, 911));
      for (let li = 0; li < G.length; li++) {
        const [name, perHa, s0, s1, mix] = G[li], L = LAYERS[name];
        let e = (perHa / 100) * patch * (name === 'reed' && cls === 'EM2' ? em2 : 1);
        if (name === 'mat' || name === 'reed') e *= 0.75 + 0.25 * patch; // (the low layers more even)
        const n = Math.floor(e) + (hash2(gi * 7 + li, gj, 4001) < e - Math.floor(e) ? 1 : 0);
        for (let q = 0; q < n; q++) {
          const H = (s) => hash2(gi * 977 + q * 13 + li * 101, gj * 613 + q * 7, s);
          // a point anywhere in the cell and up to 3 m over its edge, so the cells' edges blur
          const x = cx + (H(1) - 0.5) * 16, z = cz + (H(2) - 0.5) * 16;
          if (w.shoreAt(x, z) < L.shore || this.blocked(x, z, L.pad)) continue;
          const scale = (s0 + (s1 - s0) * H(3) ** 1.3) * (L.scale || 1), yaw = H(4) * Math.PI * 2, tint = 0.86 + H(5) * 0.2, fade = H(6);
          let k;
          if (L.reeds) { const r = H(7), m = mix || [1, 0, 0], t = m[0] + m[1] + m[2]; k = r * t < m[0] ? 0 : r * t < m[0] + m[1] ? 1 : 2; }
          else k = L.pick ? L.pick(H(7)) : Math.floor(H(7) * L.variants.length);
          const bi = L.index[k];
          if (bi === undefined) continue;
          // a log lies along the ground; the rest stand, the leaning ones a little off plumb
          let y = this.tiles.groundAt(x, z) - L.sink * (L.log ? 1 : scale);
          const lean = L.log ? 0 : (H(8) - 0.5) * (name === 'alder' ? 0.3 : name === 'pole' ? 0.12 : 0.06);
          if (L.log) y += 0.05;
          add(bi, [x, y, z, yaw, scale, tint, fade, lean, H(9) * Math.PI * 2]);
        }
      }
    }
    return ready ? lists : null;
  }

  update(camPos) {
    if (!this.enabled) { this.group.visible = false; return; }
    const ci = Math.floor(camPos.x / CHUNK), cj = Math.floor(camPos.z / CHUNK);
    this.frame = (this.frame || 0) + 1;
    if (!this.at || this.at[0] !== ci || this.at[1] !== cj || (this.waiting && !this.want.length && this.frame % 20 === 0)) { this.at = [ci, cj]; this.dirty = true; this.waiting = false; this.plan(); }
    // work out the chunks wanted, nearest first, under the budget
    const t0 = performance.now();
    while (this.want.length && performance.now() - t0 < BUDGET) {
      const key = this.want.shift();
      if (this.chunks.has(key)) continue;
      const [a, b] = key.split(',').map(Number);
      const lists = this.build(a, b);
      if (!lists) { this.waiting = true; continue; } // its tile is not in yet: planned again in a moment
      this.chunks.set(key, { ci: a, cj: b, lists });
      this.dirty = true;
    }
    if (this.dirty && (!this.want.length || performance.now() - t0 < BUDGET)) this.fill();
  }
  // the chunks within the farthest reach, nearest first; the ones beyond it let go
  plan() {
    const [ci, cj] = this.at, reach = Math.max(...Object.values(LAYERS).map((L) => L.reach)), n = Math.ceil(reach / CHUNK) + 1;
    const out = [];
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      const d = Math.hypot(di, dj) * CHUNK - CHUNK;
      if (d > reach) continue;
      const key = `${ci + di},${cj + dj}`;
      if (!this.chunks.has(key)) out.push([d, key]);
    }
    out.sort((a, b) => a[0] - b[0]);
    this.want = out.map((o) => o[1]);
    for (const [key, c] of this.chunks) if (Math.hypot(c.ci - ci, c.cj - cj) * CHUNK - CHUNK > reach + CHUNK * 2) this.chunks.delete(key);
  }
  // every bucket's meshes filled from the chunks in reach: each plant kept by its distance (its layer's reach, thinning
  // over the last quarter), into the inner mesh within SHADOW_R, else the outer
  fill() {
    this.dirty = false;
    const [ci, cj] = this.at, ox = (ci + 0.5) * CHUNK, oz = (cj + 0.5) * CHUNK;
    this.group.position.set(ox, 0, oz);
    this.group.updateMatrix(); this.group.updateMatrixWorld(true);
    const rows = this.buckets.map(() => [[], []]);
    for (const c of this.chunks.values()) {
      const d = Math.max(0, Math.hypot(c.ci - ci, c.cj - cj) * CHUNK - CHUNK * 0.7), inner = d < SHADOW_R ? 0 : 1;
      for (const [bi, a] of c.lists) {
        const L = this.buckets[bi].layer, keep = 1 - smoothstep(L.reach * 0.72, L.reach, d);
        if (keep <= 0) continue;
        const into = rows[bi][inner];
        for (let o = 0; o < a.length; o += 9) if (a[o + 6] < keep) into.push(o, a);
      }
    }
    for (let bi = 0; bi < this.buckets.length; bi++) {
      const B = this.buckets[bi];
      for (let part = 0; part < 2; part++) {
        const list = rows[bi][part], n = list.length / 2;
        let mesh = B.meshes[part];
        if (!mesh || mesh.instanceMatrix.count < n) {
          if (mesh) { this.group.remove(mesh); mesh.dispose(); }
          if (!n) { B.meshes[part] = null; continue; }
          mesh = new THREE.InstancedMesh(B.geo, B.mat, Math.ceil(n * 1.3) + 16);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3), 3);
          mesh.customDepthMaterial = B.depth;
          mesh.castShadow = part === 0;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false; // (the ring is round the camera: some of it is always in view)
          mesh.matrixAutoUpdate = false;
          mesh.userData.thicket = B.layer.name;
          B.meshes[part] = mesh;
          this.group.add(mesh);
          mesh.updateMatrixWorld(true);
        }
        const M = mesh.instanceMatrix.array, C = mesh.instanceColor.array;
        for (let i = 0; i < n; i++) {
          const o = list[i * 2], a = list[i * 2 + 1];
          const s = a[o + 4], lean = a[o + 7];
          _p.set(a[o] - ox, a[o + 1], a[o + 2] - oz);
          if (B.layer.log) _e.set(0, a[o + 3], 0.04 * Math.sin(a[o + 8]), 'YXZ');
          else _e.set(lean * Math.cos(a[o + 8]), a[o + 3], lean * Math.sin(a[o + 8]), 'YXZ');
          _q.setFromEuler(_e);
          _s.set(s, s, s);
          _m.compose(_p, _q, _s).toArray(M, i * 16);
          const t = a[o + 5];
          C[i * 3] = t; C[i * 3 + 1] = t; C[i * 3 + 2] = t;
        }
        mesh.count = n;
        mesh.visible = n > 0;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }
  // how many plants the ring draws now, by layer (for the tests)
  counts() {
    const out = {};
    for (const B of this.buckets) for (const m of B.meshes) if (m) out[B.layer.name] = (out[B.layer.name] || 0) + m.count;
    return out;
  }
}
