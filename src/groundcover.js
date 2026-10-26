import * as THREE from 'three';
import { glslSurface } from './water.js';
import { CELL_SPLAT } from './terrain-build.js';
import { groundUniforms, glslGround } from './terrain.js';
import { applyLook } from './shading.js';
import { applyWet } from './weather.js';
import { foliageAtlas, spriteUV } from './textures.js';
import { SWAY, glslSway } from './wind.js';

// Grass clumps and fireweed on a camera-following patch. Each tuft belongs to a world cell (so it stays put
// as the patch slides) but sits at a hashed offset inside it, so no lattice shows; presence, size and
// colour come from the cell hash, a clump field and the per-cell cover map baked into the water atlas
// (none in water, on bare rock, trails or campsites; a sparse few under the forest; thick on the meadows,
// in the burns and along the shore). The tufts gather in clumps a few metres across with open ground
// between, so the floor is seen. The material is the look's smooth Lambert (shading.js) with an upward
// normal, so a tuft takes the same sun, sky and shadows as the ground it stands on and darkens with it at
// dusk; its colour is the ground's own at the root (glslGround, terrain.js: the terrain's palette and blend,
// on the terrain's own splat weights under the tuft), lighter and warmer toward the tip, never darker than the
// ground under it. A clump is two cards crossed on its root from the grass sprite (textures.js, pivot pass 2),
// alpha-tested, the cutoff easing with distance as the blades thin out in the mipmaps.
//
// The weights: every cell's splat (the ten material weights, the canopy shade and the sunny stand of the terrain
// vertex at its centre) rides in the cover map the worker builds (placement.js coverField, terrain-build.js
// CELL_SPLAT). Here they are laid into a texture over the water's atlas window (three bands of the atlas's
// height: duff, moss, meadow, burn | rock, dark rock, lichen rock, shore | cliff, scree, shade, sunny), rebuilt
// whenever the water rebuilds its atlas, and read with the hardware's bilinear filter, which blends the four
// cells round a tuft as the terrain's triangles blend its vertices. So a tuft at a ground transition takes the
// blend the ground under it has, not the colour of one class per 10 m cell.

const SIZE = 128, SPACING = 0.87;   // one tuft slot per 0.76 m²: a third of the old half-metre lattice
const WID = 0.72, HGT = 0.58, ROOT = -0.12; // a clump's cards: width, height, the root below the ground

const decl = glslSway + /* glsl */ `
  uniform vec2 uCenterLocal;   // patch centre relative to the floating origin, snapped to the lattice
  uniform float uTime, uHalf, uFlower;
  uniform vec3 uGrassTint;
  uniform sampler2D uSplatTex; // the terrain's splat per cell, three bands (see the header)
  uniform vec4 uSplatAtlas;    // its window: origin x, z (relative to the floating origin), 1/cell, cells per side
  attribute vec2 aOffset;
  varying vec2 vGrassUv;
  varying float vGrassDist, vGrassH, vGrassFlower, vGrassFw;
  ${glslSurface}
  ${glslGround}
  // the share of the tufts that are fireweed in a cell (the cover's fourth byte, high nibble: placement.js coverField, from
  // a burn's age, burns.js): tall stalks, pink in high summer
  float fireweedAt(vec2 rel) { return floor(texelFetch(uCoverTex, atlasCell(rel), 0).a * 255.0 / 16.0 + 0.01) / 15.0; }
  // The terrain's splat under a point: each band read once, bilinear between the four cell centres round it.
  void cellSplat(vec2 rel, out vec4 wA, out vec4 wB, out vec4 wC, out vec4 fl) {
    float A = uSplatAtlas.w;
    vec2 c = clamp((rel - uSplatAtlas.xy) * uSplatAtlas.z, vec2(0.5), vec2(A - 0.5)); // texel centres at +0.5
    float u = c.x / A, h = 1.0 / (3.0 * A);
    wA = textureLod(uSplatTex, vec2(u, c.y * h), 0.0);
    wB = textureLod(uSplatTex, vec2(u, (c.y + A) * h), 0.0);
    vec4 d = textureLod(uSplatTex, vec2(u, (c.y + 2.0 * A) * h), 0.0);
    wC = vec4(d.xy, 0.0, 0.0);
    fl = vec4(d.zw, 0.0, 0.0);
    // where no tile has filled the cells yet (or beside the water, whose cells carry none) plain duff makes up
    // the rest, so the blend never divides by nothing
    float s = dot(wA, vec4(1.0)) + dot(wB, vec4(1.0)) + d.x + d.y;
    wA.x += max(0.0, 0.05 - s);
    // the shore's damp margin: the terrain paints it by each vertex's own distance from the water (terrain-build.js
    // splatAt), a band narrower than a cell, so it is put back here by the tuft's own distance, out of the soil
    float shore = (1.0 - smoothstep(0.3, 2.4, shoreAt(rel))) * 0.9, gs = dot(wA, vec4(1.0)), soil = gs + wB.w;
    wA *= soil * (1.0 - shore) / max(gs, 1e-4);
    wB.w = soil * shore;
  }
  vec3 hash3(vec2 p) { vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9))); return fract(sin(q) * 43758.5453); }
  // smooth value noise for the clumps: the lattice spacing in metres is set by the caller
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash3(i).x, hash3(i + vec2(1.0, 0.0)).x, f.x), mix(hash3(i + vec2(0.0, 1.0)).x, hash3(i + vec2(1.0, 1.0)).x, f.x), f.y);
  }
`;
const body = /* glsl */ `
  vec2 rel = uCenterLocal + aOffset;
  vec2 cell = floor((rel + uOrigin) / ${SPACING.toFixed(2)});   // the world cell: stable identity as the patch slides
  vec3 h = hash3(mod(cell, 4096.0));
  vec3 h2 = hash3(mod(cell + 17.0, 4096.0));
  vec3 h3 = hash3(mod(cell + 53.0, 4096.0));
  rel += (h3.xy - 0.5) * ${SPACING.toFixed(2)} * 0.95;             // off the lattice
  vec2 cv = coverAt(rel); // cover, golden
  float edge = 1.0 - smoothstep(0.7, 1.0, max(abs(aOffset.x), abs(aOffset.y)) / uHalf);
  // clumps: a 3 m noise gates the cover, full at a clump's heart and empty between (the gain keeps the mean)
  float clump = vnoise(mod(rel + uOrigin, 4096.0) / 3.2);
  float heart = smoothstep(0.3, 0.7, clump);
  float present = step(h.x, cv.r * heart * 1.25) * edge;  // a card clump is fuller than the old three blades
  // fireweed (a burn of one to six years, burns.js): that share of the clumps stand twice as tall and flower pink in high
  // summer (uFlower is the fireweed's season, season.js)
  float fw = step(h2.z, fireweedAt(rel) * 0.85);
  float sc = present * (0.6 + 0.8 * h.y * h.y + 0.25 * heart) * (1.0 + 1.1 * fw);
  float yaw = h.z * 6.2832;
  vec3 p = position * sc;
  p.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * p.xz;
  // the wind (wind.js SWAY, as the trees and the reeds have it): the clump bends downwind from its root, deeper as
  // a gust rolls over, and the blades shiver about that, the tips furthest and a little lower; a calm leaves it be
  {
    vec2 gw = rel + uOrigin;   // world xz: nothing here may hang on the floating origin
    float gy = max(p.y, 0.0), gg = swayGustAt(gw) * uSwayGust.w;
    float shiver = sin(swayOmega(1.6 + 0.8 * h2.z) * uSwayGust.z + h3.z * 6.2831853 + fract((gw.x + gw.y) * 0.0636620) * 6.2831853);
    float lean = uSwayWind.z * (0.1 + 0.3 * gg) + smoothstep(1.0, 9.0, uSwayWind.w) * (0.05 + 0.07 * gg) * shiver;
    float d = lean * gy * gy / ${HGT.toFixed(2)};
    p.xz += uSwayWind.xy * d;
    p.y -= 0.5 * d * d / max(gy, 0.05);
  }
  vec3 transformed = vec3(rel.x + p.x, surfaceAt(rel) - 0.05 + p.y, rel.y + p.z);
  // colour: the ground's own at the root (the blade's vertex colour lifts it toward a lit tip), a touch
  // greener per tuft, the season's tint; golden in burns and dry clearings; fireweed stalks in high summer
  vec4 gA, gB, gC, gF;
  cellSplat(rel, gA, gB, gC, gF);
  vec3 ground = groundColor(rel + uOrigin, gA, gB, gC, gF, length(rel + uOrigin - cameraPosition.xz) * 0.0015);
  vec3 tint = mix(vec3(1.0, 1.02, 0.94), vec3(1.08, 1.12, 0.92), h2.x) * uGrassTint;
  vec3 base = ground * tint;
  base = mix(base, base * vec3(1.3, 1.08, 0.55), cv.g * (0.6 + 0.4 * h2.y));
  vGrassFlower = step(0.95, h.x / max(1e-3, cv.r * heart * 1.25)) * cv.g * uFlower;
  vGrassFw = fw * uFlower;
  base = mix(base, base * vec3(0.85, 1.05, 0.8), fw); // the stalks a darker, cooler green than the grass
  vColor.rgb *= base;
  vGrassUv = uv;
  vGrassH = (position.y - ${ROOT.toFixed(2)}) / ${(HGT - ROOT).toFixed(2)};
  vGrassDist = distance((modelMatrix * vec4(transformed, 1.0)).xyz, cameraPosition);
`;
// the card: the sprite's value lifts the ground colour from the root (never darker than the ground) to a
// lit tip; fireweed's pink on the top of a few clumps in high summer
const frag = /* glsl */ `
  vec4 grass = texture2D(uGrassMap, vGrassUv);
  if (grass.a < mix(0.5, 0.22, smoothstep(5.0, 45.0, vGrassDist))) discard;
  diffuseColor.rgb *= mix(1.0, 1.42, smoothstep(0.35, 1.0, grass.r));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.35, 0.6) * grass.r, vGrassFlower * step(0.72, vGrassH));
  // fireweed in bloom (a burn's first years): the upper part of the stalks magenta, a haze of it across the burn
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.26, 0.55) * (0.8 + 0.3 * grass.r), vGrassFw * 0.9 * smoothstep(0.5, 0.64, vGrassH));
`;

// A blade is lit as the ground under it from either side: three flips the normal on a back face of a
// double-sided material, which left every blade seen from behind lit only from below (near black), so the
// flip is taken out of the normal chunk. The light is the terrain's own (shading.js, no wrap), so a tuft's
// root is exactly the ground's tone under the same sun and sky.
const noFlip = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
if (noFlip === THREE.ShaderChunk.normal_fragment_begin) console.warn('groundcover: normal chunk changed, blades seen from behind will go dark');

// Two cards crossed on the clump's root, the grass sprite on both, the root a little below the ground so a
// slope never shows a gap; normals straight up, so a clump is lit as the ground under it.
function tuftGeometry() {
  const pos = [], uv = [], col = [], nrm = [], idx = [];
  for (const a of [0, Math.PI / 2]) {
    const dx = Math.cos(a) * WID / 2, dz = Math.sin(a) * WID / 2, b = pos.length / 3;
    for (const [s, t] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push((s * 2 - 1) * dx, t ? HGT : ROOT, (s * 2 - 1) * dz);
      uv.push(...spriteUV('grass', s, t)); col.push(1, 1, 1); nrm.push(0, 1, 0);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class GroundCover {
  constructor(water) {
    this.water = water;
    const n = Math.round(SIZE / SPACING);
    const offsets = new Float32Array(n * n * 2);
    let o = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { offsets[o++] = (i - n / 2) * SPACING; offsets[o++] = (j - n / 2) * SPACING; }
    const base = tuftGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('normal', base.getAttribute('normal'));
    geo.setAttribute('color', base.getAttribute('color'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    geo.setIndex(base.getIndex());
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
    geo.instanceCount = n * n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    // the splat over the water's atlas window (see the header): A x 3A texels, linear data, bilinear, no mips
    const A = water.uniforms.uAtlas.value.w;
    this.splat = new Uint8Array(A * A * 3 * 4);
    this.splatTex = new THREE.DataTexture(this.splat, A, 3 * A, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.splatTex.minFilter = this.splatTex.magFilter = THREE.LinearFilter;
    this.splatTex.generateMipmaps = false;
    this.splatTex.name = 'grass-splat';
    this.splatAt = { i: NaN, j: NaN, version: -1 };
    this.u = {
      ...water.surfaceUniforms(),
      uCenterLocal: { value: new THREE.Vector2() }, uTime: { value: 0 }, uHalf: { value: SIZE / 2 },
      uFlower: { value: 1 }, uGrassTint: { value: new THREE.Vector3(1, 1, 1) }, uGrassMap: { value: foliageAtlas() },
      ...groundUniforms,
      ...SWAY,
      uSplatTex: { value: this.splatTex },
      uSplatAtlas: { value: new THREE.Vector4(0, 0, water.uniforms.uAtlas.value.z, A) },
    };
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.material.onBeforeCompile = (shader) => {
      applyLook(shader, { wrap: 0 });
      Object.assign(shader.uniforms, this.u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\n' + decl)
        .replace('#include <begin_vertex>', body);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uGrassMap;\nvarying vec2 vGrassUv;\nvarying float vGrassDist, vGrassH, vGrassFlower, vGrassFw;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + frag)
        .replace('#include <normal_fragment_begin>', noFlip);
      // rain (weather.js): the root wets as the ground under it does, the blade tips a little less
      applyWet(shader, { porosity: 'mix( 1.0, 0.6, vGrassH )', gloss: '0.2' });
    };
    this.material.customProgramCacheKey = () => 'look-grass';
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }
  setSeason(s) {
    this.u.uGrassTint.value.set(s.grassTint[0], s.grassTint[1], s.grassTint[2]);
    this.u.uFlower.value = s.flower;
  }
  update(dt, x, z) {
    const o = this.water.origin, u = this.u;
    u.uTime.value += dt;
    u.uCenterLocal.value.set(Math.round(x / SPACING) * SPACING - o.x, Math.round(z / SPACING) * SPACING - o.z);
    this.mesh.position.set(o.x, 0, o.z);
    // the splat follows the water's atlas: rebuilt whenever that is (it moves, or a tile comes in)
    const wt = this.water, S = this.splatAt;
    if (wt.coverTex.version !== S.version && !Number.isNaN(wt.atlasI)) this.rebuildSplat(wt.atlasI, wt.atlasJ);
    const w = wt.world;
    if (!Number.isNaN(S.i)) u.uSplatAtlas.value.set(w.originX + S.i * w.cell - o.x, w.originZ + S.j * w.cell - o.z, 1 / w.cell, u.uSplatAtlas.value.w);
  }
  // The cells [i0, i0 + A) x [j0, j0 + A) into the splat texture, from the fine tiles' cover maps (their splat
  // part, placement.js coverField; read as world.coverCell reads the cover); cells with no tile in stay empty.
  rebuildSplat(i0, j0) {
    const w = this.water.world, A = this.u.uSplatAtlas.value.w, D = this.splat, T = w.tile, side = w.side, halo = w.halo;
    const base = side * side * 4, need = base + side * side * CELL_SPLAT;
    D.fill(0);
    for (let lj = 0; lj < A; lj++) {
      const j = j0 + lj;
      if (j < 0 || j >= w.height) continue;
      const row = ((j % T) + halo) * side + halo, ty = (j / T) | 0;
      for (let li = 0; li < A;) {
        const i = i0 + li;
        if (i < 0 || i >= w.width) { li++; continue; }
        const end = Math.min(A, li + T - (i % T)), t = w.slots[ty * w.ntx + ((i / T) | 0)], cv = t && t.cover;
        if (!cv || cv.length < need) { li = end; continue; }
        for (; li < end; li++) {
          const k = base + (row + ((i0 + li) % T)) * CELL_SPLAT;
          for (let b = 0; b < 3; b++) {
            const o = ((b * A + lj) * A + li) * 4, s = k + b * 4;
            D[o] = cv[s]; D[o + 1] = cv[s + 1]; D[o + 2] = cv[s + 2]; D[o + 3] = cv[s + 3];
          }
        }
      }
    }
    this.splatTex.needsUpdate = true;
    this.splatAt.i = i0; this.splatAt.j = j0; this.splatAt.version = this.water.coverTex.version;
  }
}
