import * as THREE from 'three';
import { fbm, lerp, smoothstep } from './rng.js';
import { clearingAt, burnAt } from './fields.js';

const CHUNK = 64;        // cells per chunk edge
const FINE_BAND = 25;    // metres either side of the shore that get 2x2 subdivision
const SHAPE_BAND = 9;    // metres either side of the shore where height follows the distance field exactly

// A fixed palette; every face gets exactly one of these (no gradients).
const C = {
  bedShallow: new THREE.Color(0xc4b894),
  bedDeep: new THREE.Color(0x5f7c70),
  sand: new THREE.Color(0xc8b88d),
  rock: new THREE.Color(0x8f8d85),
  rockDark: new THREE.Color(0x6f6d67),
  forest: new THREE.Color(0x667f52),
  forestLight: new THREE.Color(0x7b9360),
  forestDark: new THREE.Color(0x546b47),
  meadow: new THREE.Color(0x98a56a),
  burn: new THREE.Color(0x9a8a5e),
};

export function groundColor(world, x, z, out, shade = 0) {
  const sd = world.shoreAt(x, z);
  const slope = world.slopeAt(x, z);
  if (sd < 0) return out.copy(sd > -7 ? C.bedShallow : C.bedDeep);
  if (sd < 2.4) return out.copy(C.sand);
  if (slope > 0.55) return out.copy(C.rockDark);
  if (slope > 0.38) return out.copy(C.rock);
  if (burnAt(x, z) > 0.5) return out.copy(C.burn);
  const clearing = clearingAt(x, z); // same field the forest uses
  if (clearing > 0.68) return out.copy(C.meadow);
  if (shade > 0.55) return out.copy(C.forestDark);
  return out.copy(fbm(x * 0.012, z * 0.012, 3, 7) > 0.55 ? C.forestLight : C.forest);
}

// Height in the shore band follows the distance field, so the waterline, the ripple lines and the
// collision all agree on where the shore is. Outside the band the baked DEM height is used.
function shoreShape(hBase, sd, level) {
  const a = Math.abs(sd);
  if (a >= SHAPE_BAND || !Number.isFinite(level)) return hBase;
  const target = level + (sd > 0 ? 0.16 * sd : 0.12 * sd);
  const w = 1 - smoothstep(SHAPE_BAND * 0.5, SHAPE_BAND, a);
  return lerp(hBase, target, w);
}

// Gentle rock bumps a little way from the waterline (never across it).
function shoreBumps(x, z, sd) {
  const n = fbm(x * 0.07, z * 0.07, 2, 51) - 0.5;
  if (sd > 0) return Math.max(0, n) * 1.6 * smoothstep(3, 8, sd) * (1 - smoothstep(10, FINE_BAND, sd));
  return -Math.abs(n) * 1.0 * smoothstep(3, 8, -sd) * (1 - smoothstep(10, FINE_BAND, -sd));
}

// Lambert with flat-interpolated vertex colour: each triangle takes one vertex's colour, no blending.
export function makeTerrainMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // onBeforeCompile sees the shader before its #includes are expanded, so replace the include itself
  // (three r186 declares vColor as a vec4 whenever any colour source is in use)
  const decl = '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )\n flat varying vec4 vColor;\n#endif';
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <color_pars_vertex>', decl);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_pars_fragment>', decl);
  };
  m.customProgramCacheKey = () => 'flat-vcolor';
  return m;
}

export async function buildTerrain(world, shade, onProgress = () => {}) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const material = makeTerrainMaterial();
  const W = world.width, H = world.height, cell = world.cell;
  const fine = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) fine[k] = Math.abs(world.sd[k]) <= FINE_BAND ? 1 : 0;
  const quadFine = (i, j) => (i < 0 || j < 0 || i >= W - 1 || j >= H - 1) ? 0 : (fine[j * W + i] | fine[j * W + i + 1] | fine[(j + 1) * W + i] | fine[(j + 1) * W + i + 1]);
  const shadeAt = (x, z) => shade ? shade[world.clampJ(world.cellJ(z)) * W + world.clampI(world.cellI(x))] : 0;
  // nearest water level per cell, computed on demand for the shore band
  const levelCache = new Float32Array(W * H).fill(NaN);
  const levelNear = (x, z) => {
    const k = world.clampJ(world.cellJ(z)) * W + world.clampI(world.cellI(x));
    if (Number.isNaN(levelCache[k])) levelCache[k] = world.levelAt(world.cellX(k % W), world.cellZ((k - (k % W)) / W), 4);
    return levelCache[k];
  };
  const heightAt = (x, z, hBase) => {
    const sd = world.shoreAt(x, z);
    let h = hBase;
    if (Math.abs(sd) < SHAPE_BAND) h = shoreShape(hBase, sd, levelNear(x, z));
    return h;
  };
  const color = new THREE.Color();
  const nx = Math.ceil((W - 1) / CHUNK), nz = Math.ceil((H - 1) / CHUNK);
  let done = 0;
  for (let cj = 0; cj < nz; cj++) {
    for (let ci = 0; ci < nx; ci++) {
      const i0 = ci * CHUNK, j0 = cj * CHUNK;
      const i1 = Math.min(W - 1, i0 + CHUNK), j1 = Math.min(H - 1, j0 + CHUNK);
      const pos = [], col = [], idx = [];
      const map = new Map();
      const vert = (ii, jj) => {
        const key = ii * 4096 + jj;
        let v = map.get(key);
        if (v !== undefined) return v;
        const i = ii >> 1, j = jj >> 1, a = ii & 1, b = jj & 1;
        const x = world.cellX(i) + (a * cell) / 2, z = world.cellZ(j) + (b * cell) / 2;
        let hBase;
        if (!a && !b) hBase = world.hCell(i, j);
        else hBase = a && b ? (world.hCell(i, j) + world.hCell(i + 1, j) + world.hCell(i, j + 1) + world.hCell(i + 1, j + 1)) / 4
          : a ? (world.hCell(i, j) + world.hCell(i + 1, j)) / 2 : (world.hCell(i, j) + world.hCell(i, j + 1)) / 2;
        let h = heightAt(x, z, hBase);
        if (a || b) {
          // bumps only where every quad sharing this vertex is subdivided, so band edges stay watertight
          const interior = a && b ? quadFine(i, j) : a ? quadFine(i, j) && quadFine(i, j - 1) : quadFine(i, j) && quadFine(i - 1, j);
          if (interior) h += shoreBumps(x, z, world.shoreAt(x, z));
        }
        v = pos.length / 3;
        pos.push(x, h, z);
        groundColor(world, x, z, color, shadeAt(x, z));
        col.push(color.r, color.g, color.b);
        map.set(key, v);
        return v;
      };
      const quad = (a, b, c, d, flip) => { if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b); };
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const flip = ((i + j) & 1) === 0;
          if (quadFine(i, j)) {
            for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
              const ii = 2 * i + a, jj = 2 * j + b;
              quad(vert(ii, jj), vert(ii + 1, jj), vert(ii, jj + 1), vert(ii + 1, jj + 1), flip !== (((a + b) & 1) === 1));
            }
          } else {
            quad(vert(2 * i, 2 * j), vert(2 * i + 2, 2 * j), vert(2 * i, 2 * j + 2), vert(2 * i + 2, 2 * j + 2), flip);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      done++;
    }
    onProgress(done / (nx * nz));
    await new Promise((r) => setTimeout(r));
  }
  return group;
}
