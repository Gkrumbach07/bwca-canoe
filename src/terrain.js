import * as THREE from 'three';
import { fbm, clamp, lerp, smoothstep } from './rng.js';

const CHUNK = 64;        // cells per chunk edge
const FINE_BAND = 25;    // metres either side of the shore that get 2x2 subdivision
const SHAPE_BAND = 9;    // metres either side of the shore where height follows the distance field exactly

// Clean, soft palette: a few flat colours in large regions.
const C = {
  bedShallow: new THREE.Color(0xd3c39b),
  bedDeep: new THREE.Color(0x587a6a),
  sand: new THREE.Color(0xd9caa2),
  rock: new THREE.Color(0xb4aea1),
  rockDark: new THREE.Color(0x8f8b82),
  forest: new THREE.Color(0x6e9450),
  forestLight: new THREE.Color(0x84a85c),
  meadow: new THREE.Color(0x9fb566),
  duff: new THREE.Color(0x6f7f4b),
};
const tmp = new THREE.Color();

export function groundColor(world, x, z, out, shade = 0) {
  const sd = world.shoreAt(x, z);
  const slope = world.slopeAt(x, z);
  if (sd < 0) {
    out.copy(C.bedShallow).lerp(C.bedDeep, smoothstep(-1, -28, sd));
    return out;
  }
  const n1 = fbm(x * 0.012, z * 0.012, 3, 7);
  const clearing = smoothstep(0.62, 0.78, fbm(x * 0.0035, z * 0.0035, 3, 21)); // same field the forest uses
  out.copy(C.forest).lerp(C.forestLight, smoothstep(0.4, 0.7, n1));
  out.lerp(C.meadow, clearing * 0.8);
  // a sand strip at the waterline, granite on the steep bits
  out.lerp(C.sand, 1 - smoothstep(1.0, 3.2, sd));
  const steep = smoothstep(0.26, 0.48, slope);
  tmp.copy(C.rock).lerp(C.rockDark, smoothstep(0.4, 0.7, slope));
  out.lerp(tmp, Math.max(steep, smoothstep(0.18, 0.4, slope) * (1 - smoothstep(4, 12, sd))));
  // forest floor under the canopy
  out.lerp(C.duff, shade * 0.3 * (1 - steep));
  out.multiplyScalar(1 - 0.14 * shade);
  return out;
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

export function makeTerrainMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
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
