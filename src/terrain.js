import * as THREE from 'three';
import { fbm, noise2, hash2, clamp, smoothstep } from './rng.js';

const CHUNK = 64;        // cells per chunk edge
const FINE_BAND = 25;    // metres either side of the shore that get 2x2 subdivision and rock noise

const C = {
  bedShallow: new THREE.Color(0xb59a66),
  bedDeep: new THREE.Color(0x3c4a3a),
  rock: new THREE.Color(0x8d8a80),
  rockDark: new THREE.Color(0x5e5d58),
  rockWet: new THREE.Color(0x4a4a46),
  lichen: new THREE.Color(0xa6a07a),
  moss: new THREE.Color(0x4f6d33),
  forest: new THREE.Color(0x3f6a2e),
  forestLight: new THREE.Color(0x6a8a3a),
  dryGrass: new THREE.Color(0x9a9a4e),
  blueberry: new THREE.Color(0x5e6b3a),
  duff: new THREE.Color(0x5a4a34),
};
const tmp = new THREE.Color();

export function groundColor(world, x, z, out, shade = 0) {
  const sd = world.shoreAt(x, z);
  const slope = world.slopeAt(x, z);
  const h = world.heightAt(x, z);
  const n1 = fbm(x * 0.012, z * 0.012, 3, 7);
  const n2 = fbm(x * 0.05, z * 0.05, 2, 11);
  if (sd < 0) {
    const t = smoothstep(-2, -35, sd);
    out.copy(C.bedShallow).lerp(C.bedDeep, t);
    out.offsetHSL(0, 0, (n2 - 0.5) * 0.06 + (noise2(x * 0.3, z * 0.3, 23) - 0.5) * 0.08);
    return out;
  }
  out.copy(C.forest).lerp(C.forestLight, smoothstep(0.35, 0.7, n1));
  out.lerp(C.blueberry, smoothstep(0.55, 0.8, n2) * 0.5);
  out.lerp(C.dryGrass, smoothstep(490, 525, h) * 0.35 * n1);
  // shoreline: Canadian Shield granite with lichen, wet and dark right at the waterline
  const n3 = fbm(x * 0.18, z * 0.18, 2, 23);
  const shoreRock = (1 - smoothstep(1.5, 10, sd)) * smoothstep(0.15, 0.55, n2 * 0.5 + n3 * 0.5 + slope * 1.5);
  tmp.copy(C.rock).lerp(C.lichen, smoothstep(0.45, 0.8, n3));
  tmp.lerp(C.rockWet, (1 - smoothstep(0.4, 2.2, sd)) * 0.6);
  out.lerp(tmp, shoreRock);
  // steep slopes are rock outcrops
  const steep = smoothstep(0.28, 0.5, slope);
  out.lerp(C.rockDark, steep);
  out.lerp(C.moss, smoothstep(0.5, 0.9, n2) * (1 - steep) * 0.35 * smoothstep(0, 20, sd));
  // forest floor duff under the canopy
  out.lerp(C.duff, shade * 0.35 * (1 - steep));
  out.offsetHSL(0, 0, (hash2(Math.round(x), Math.round(z), 3) - 0.5) * 0.05);
  // canopy shade: ground under the forest is darker
  out.multiplyScalar(1 - 0.3 * shade);
  return out;
}

// Rock bumps along the shore. Land only ever moves up and lake bed only down, so the shoreline stays put.
function shoreNoise(world, x, z) {
  const sd = world.shoreAt(x, z);
  const n = fbm(x * 0.09, z * 0.09, 3, 51) - 0.5;
  const n2 = noise2(x * 0.35, z * 0.35, 77) - 0.5;
  if (sd > 0) {
    const w = 1 - smoothstep(3, FINE_BAND, sd);
    return Math.max(0, n * 1.8 + n2 * 0.6) * w * smoothstep(0, 1.2, sd);
  }
  const w = 1 - smoothstep(3, FINE_BAND, -sd);
  return -Math.abs(n * 1.2 + n2 * 0.4) * w * smoothstep(0, 1.5, -sd);
}

// Lambert material with a cheap per-fragment grain so facets read as ground, not plastic.
export function makeTerrainMaterial() {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGroundPos;
float gHash(vec2 p) { p = fract(p * vec2(0.3183099, 0.3678794)) * 51.0; return fract(p.x * p.y * (p.x + p.y)); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float g = gNoise(vGroundPos.xz * 0.8) * 0.55 + gNoise(vGroundPos.xz * 3.3) * 0.45;
  diffuseColor.rgb *= 0.84 + 0.3 * g; }`);
  };
  return material;
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
  const color = new THREE.Color();
  const nx = Math.ceil((W - 1) / CHUNK), nz = Math.ceil((H - 1) / CHUNK);
  let done = 0;
  for (let cj = 0; cj < nz; cj++) {
    for (let ci = 0; ci < nx; ci++) {
      const i0 = ci * CHUNK, j0 = cj * CHUNK;
      const i1 = Math.min(W - 1, i0 + CHUNK), j1 = Math.min(H - 1, j0 + CHUNK);
      const pos = [], col = [], idx = [];
      const map = new Map(); // doubled-lattice key -> vertex index
      const vert = (ii, jj) => {
        const key = ii * 4096 + jj;
        let v = map.get(key);
        if (v !== undefined) return v;
        const i = ii >> 1, j = jj >> 1, a = ii & 1, b = jj & 1;
        const x = world.cellX(i) + (a * cell) / 2, z = world.cellZ(j) + (b * cell) / 2;
        let h;
        if (!a && !b) h = world.hCell(i, j);
        else {
          h = a && b ? (world.hCell(i, j) + world.hCell(i + 1, j) + world.hCell(i, j + 1) + world.hCell(i + 1, j + 1)) / 4
            : a ? (world.hCell(i, j) + world.hCell(i + 1, j)) / 2 : (world.hCell(i, j) + world.hCell(i, j + 1)) / 2;
          // noise only where every quad sharing this vertex is subdivided, so edges stay watertight
          const interior = a && b ? quadFine(i, j) : a ? quadFine(i, j) && quadFine(i, j - 1) : quadFine(i, j) && quadFine(i - 1, j);
          if (interior) h += shoreNoise(world, x, z);
        }
        v = pos.length / 3;
        pos.push(x, h, z);
        groundColor(world, x, z, color, shadeAt(x, z));
        col.push(color.r, color.g, color.b);
        map.set(key, v);
        return v;
      };
      const quad = (a, b, c, d, flip) => { // a=(x0,z0) b=(x1,z0) c=(x0,z1) d=(x1,z1)
        if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
      };
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const flip = ((i + j) & 1) === 0;
          if (quadFine(i, j)) {
            for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
              const ii = 2 * i + a, jj = 2 * j + b;
              quad(vert(ii, jj), vert(ii + 1, jj), vert(ii, jj + 1), vert(ii + 1, jj + 1), flip !== ((a + b) & 1 ? true : false));
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
