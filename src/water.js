import * as THREE from 'three';
import { smoothstep } from './rng.js';

// Water in two parts that share one fragment shader:
//  - far field: static 10 m chunks carrying only the long swell, with a hole cut where the patch sits
//  - near patch: a 4 m grid following the canoe. Its long swell is bilinearly interpolated from the
//    same 10 m lattice nodes the far mesh uses (so the seam is exact) and short swell is added on top,
//    fading out toward the patch edge. Shore distance comes from the same field the terrain uses.
// Flat single-tone colour, per-facet lighting, crisp ripple lines, and a reflection of the canoe only.

const CHUNK = 64;
const PATCH_HALF = 160;   // metres; multiple of the 10 m lattice
const PATCH_RES = 3.2;    // metres per vertex

export function lowWave(x, z, t) {
  return Math.sin(x * 0.14 + t * 0.35) * 0.06 + Math.sin((x * 0.6 + z * 0.8) * 0.09 - t * 0.3) * 0.06 + Math.sin(z * 0.11 - x * 0.05 + t * 0.27) * 0.05;
}
export function highWave(x, z, t) {
  return Math.sin(x * 0.7 + t * 1.1) * 0.18 + Math.sin(z * 1.05 - t * 0.95 + x * 0.3) * 0.1 + Math.sin((x + z) * 0.45 + t * 0.8) * 0.14;
}
// CPU twin of the patch vertex shader (used for canoe bobbing)
export function waveHeight(x, z, t, world) {
  const fx = (x - world.originX) / world.cell - 0.5, fz = (z - world.originZ) / world.cell - 0.5;
  const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
  const corner = (ii, jj) => lowWave(world.cellX(ii), world.cellZ(jj), t) * smoothstep(0, 25, -world.sdCell(ii, jj));
  const low = (corner(i, j) * (1 - ax) + corner(i + 1, j) * ax) * (1 - az) + (corner(i, j + 1) * (1 - ax) + corner(i + 1, j + 1) * ax) * az;
  return low + highWave(x, z, t) * smoothstep(0, 8, -world.shoreAt(x, z));
}

const glslWaves = /* glsl */ `
  float lowWave(vec2 p, float t) { return sin(p.x * 0.14 + t * 0.35) * 0.06 + sin((p.x * 0.6 + p.y * 0.8) * 0.09 - t * 0.3) * 0.06 + sin(p.y * 0.11 - p.x * 0.05 + t * 0.27) * 0.05; }
  float highWave(vec2 p, float t) { return sin(p.x * 0.7 + t * 1.1) * 0.18 + sin(p.y * 1.05 - t * 0.95 + p.x * 0.3) * 0.1 + sin((p.x + p.y) * 0.45 + t * 0.8) * 0.14; }
`;

// Swell height at any world xz, shared by the near water patch and the surface particles:
// long waves interpolated from the 10 m lattice nodes (damped near shore, exactly as the far mesh
// does it) plus short waves on top. Needs uShoreTex / uGrid / uGridSize bound.
export const glslSurface = /* glsl */ `
  uniform sampler2D uShoreTex;
  uniform vec3 uGrid;      // originX, originZ, 1/cell
  uniform ivec2 uGridSize;
  ${glslWaves}
  float cellSample(sampler2D t, ivec2 c) { c = clamp(c, ivec2(0), uGridSize - 1); return texelFetch(t, c, 0).r; }
  float nodeWave(ivec2 c, float t) {
    vec2 np = uGrid.xy + (vec2(c) + 0.5) / uGrid.z;
    return lowWave(np, t) * smoothstep(0.0, 25.0, -cellSample(uShoreTex, c));
  }
  float surfaceWave(vec2 w, float t, float border, out float shore) {
    vec2 f = (w - uGrid.xy) * uGrid.z - 0.5;
    vec2 fi = floor(f), a = f - fi;
    ivec2 c = ivec2(fi);
    float s00 = cellSample(uShoreTex, c), s10 = cellSample(uShoreTex, c + ivec2(1, 0));
    float s01 = cellSample(uShoreTex, c + ivec2(0, 1)), s11 = cellSample(uShoreTex, c + ivec2(1, 1));
    shore = mix(mix(s00, s10, a.x), mix(s01, s11, a.x), a.y);
    float low = mix(mix(nodeWave(c, t), nodeWave(c + ivec2(1, 0), t), a.x), mix(nodeWave(c + ivec2(0, 1), t), nodeWave(c + ivec2(1, 1), t), a.x), a.y);
    return low + highWave(w, t) * smoothstep(0.0, 8.0, -shore) * border;
  }
`;

const vertHead = /* glsl */ `
  uniform float uTime;
  uniform mat4 uTextureMatrix;
  uniform vec2 uPatchCenter;
  uniform float uPatchHalf;
  varying vec3 vWorld;
  varying float vShore;
  varying vec4 vReflectUv;
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
`;
const vertTail = /* glsl */ `
    // shadows and the reflection are projected on the flat surface so the swell cannot break them up
    vec4 worldPosition = vec4(p.x, flatY, p.z, 1.0);
    vWorld = p;
    vReflectUv = uTextureMatrix * worldPosition;
    vec3 transformedNormal = normalMatrix * vec3(0.0, 1.0, 0.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
    #include <shadowmap_vertex>
  }
`;
const vertFar = vertHead + glslWaves + /* glsl */ `
  attribute float aShore;
  void main() {
    vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
    vShore = aShore;
    float flatY = p.y;
    p.y += lowWave(p.xz, uTime) * smoothstep(0.0, 25.0, -aShore);
` + vertTail;

const vertPatch = vertHead + glslSurface + /* glsl */ `
  uniform sampler2D uLevelTex;
  void main() {
    vec2 w = uPatchCenter + position.xz;
    float border = 1.0 - smoothstep(uPatchHalf - 40.0, uPatchHalf - 6.0, max(abs(position.x), abs(position.z)));
    float shore;
    float wave = surfaceWave(w, uTime, border, shore);
    vShore = shore;
    float level = cellSample(uLevelTex, ivec2(floor((w - uGrid.xy) * uGrid.z)));
    float flatY = level;
    vec3 p = vec3(w.x, level + wave, w.y);
` + vertTail;

const frag = /* glsl */ `
  uniform float uTime, uReflOn;
  uniform vec3 uSunDir, uWater, uReflect;
  uniform sampler2D uReflection;
  uniform vec2 uPatchCenter;
  uniform float uPatchHalf;
  varying vec3 vWorld;
  varying float vShore;
  varying vec4 vReflectUv;
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <shadowmap_pars_fragment>
  float aastep(float edge, float x) { float w = fwidth(x) * 0.8; return smoothstep(edge - w, edge + w, x); }
  void main() {
    #ifdef FAR
      if (abs(vWorld.x - uPatchCenter.x) < uPatchHalf && abs(vWorld.z - uPatchCenter.y) < uPatchHalf) discard;
    #else
      if (vShore > 0.6) discard;
    #endif
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.0) n = -n;
    vec3 v = normalize(cameraPosition - vWorld);
    float depth = -vShore;
    float shadow = 1.0;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      shadow = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
    #endif
    // three flat tones (facets tilted toward the sun, level, away), with a soft hand-off so the
    // moving swell does not make facets pop between tones
    float d = dot(n, uSunDir) - uSunDir.y;
    float tone = smoothstep(0.006, 0.016, d) - smoothstep(0.006, 0.016, -d);   // -1 .. 1
    vec3 col = mix(uWater, uReflect, 0.12) * (1.0 + 0.08 * tone);
    col *= 0.72 + 0.28 * shadow;
    // the canoe's reflection, nothing else
    vec4 r = texture2DProj(uReflection, vReflectUv);
    col = mix(col, r.rgb, r.a * 0.65 * uReflOn);
    // shoreline ripples: thin crisp lines parallel to the shore rolling in, broken up along the shore
    float along = vWorld.x * 0.31 + vWorld.z * 0.23;
    float breakup = 0.5 + 0.5 * sin(along * 0.7 + uTime * 0.25) * sin(along * 0.23 - uTime * 0.11);
    float phase = fract(depth * 0.8 + uTime * 0.55 + 0.25 * sin(along * 1.3 + uTime * 0.4));
    float line = aastep(0.8, phase) * (1.0 - aastep(0.9, phase));
    float ripple = line * (1.0 - aastep(5.5, depth)) * aastep(0.45, breakup) * step(0.0, depth);
    float waterline = (1.0 - aastep(0.4, depth)) * step(0.0, depth);
    float foam = max(ripple, waterline) * 0.85;
    col = mix(col, vec3(0.95, 0.97, 0.97), foam);
    float alpha = max(0.74, foam);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function buildLevelGrid(world) {
  const W = world.width, H = world.height, N = W * H;
  const level = new Float32Array(N).fill(-9999);
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (let k = 0; k < N; k++) if (world.lake[k]) { level[k] = world.levelById[world.lake[k]]; queue[tail++] = k; }
  while (head < tail) {
    const k = queue[head++];
    const x = k % W, y = (k - x) / W;
    const nb = [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1];
    for (const n of nb) if (n >= 0 && level[n] === -9999) { level[n] = level[k]; queue[tail++] = n; }
  }
  return level;
}

export const REFLECT_LAYER = 1;

export class WaterSystem {
  constructor(world, sunDir, palette) {
    this.world = world;
    this.time = 0;
    this.reflection = new WaterReflection(768, 768);
    this.reflectionsOn = true;
    const W = world.width, H = world.height;
    const shoreTex = new THREE.DataTexture(world.sd, W, H, THREE.RedFormat, THREE.FloatType);
    shoreTex.minFilter = shoreTex.magFilter = THREE.NearestFilter; shoreTex.needsUpdate = true;
    const levelTex = new THREE.DataTexture(buildLevelGrid(world), W, H, THREE.RedFormat, THREE.FloatType);
    levelTex.minFilter = levelTex.magFilter = THREE.NearestFilter; levelTex.needsUpdate = true;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights, {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone() },
      uWater: { value: new THREE.Color(palette.water) },
      uReflect: { value: new THREE.Color(palette.reflect) },
      uReflection: { value: null },
      uReflOn: { value: 0 },
      uTextureMatrix: { value: new THREE.Matrix4() },
      uPatchCenter: { value: new THREE.Vector2(1e9, 1e9) },
      uPatchHalf: { value: PATCH_HALF },
      uShoreTex: { value: null },
      uLevelTex: { value: null },
      uGrid: { value: new THREE.Vector3(world.originX, world.originZ, 1 / world.cell) },
      uGridSize: { value: new THREE.Vector2(W, H) },
    }]);
    this.uniforms.uReflection.value = this.reflection.target.texture;
    this.uniforms.uShoreTex.value = shoreTex;
    this.uniforms.uLevelTex.value = levelTex;
    this.uniforms.uTextureMatrix.value = this.reflection.textureMatrix;
    const common = { fragmentShader: frag, uniforms: this.uniforms, transparent: true, depthWrite: true, fog: true, lights: true };
    this.farMaterial = new THREE.ShaderMaterial({ ...common, vertexShader: vertFar, defines: { FAR: 1 } });
    this.patchMaterial = new THREE.ShaderMaterial({ ...common, vertexShader: vertPatch });
    this.group = new THREE.Group();
    this.group.name = 'water';
    this.buildFar();
    const n = Math.round((PATCH_HALF * 2) / PATCH_RES);
    const geo = new THREE.PlaneGeometry(PATCH_HALF * 2, PATCH_HALF * 2, n, n);
    geo.rotateX(-Math.PI / 2);
    this.patch = new THREE.Mesh(geo, this.patchMaterial);
    this.patch.frustumCulled = false;
    this.patch.renderOrder = 10;
    this.patch.receiveShadow = true;
    this.group.add(this.patch);
  }

  buildFar() {
    const world = this.world, W = world.width, H = world.height, lake = world.lake, levels = world.levelById;
    const vertexLevel = (i, j) => {
      const id = world.lakeCell(i, j);
      if (id) return levels[id];
      let best = -Infinity;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const n = world.lakeCell(i + di, j + dj); if (n) best = Math.max(best, levels[n]); }
      return best;
    };
    const nx = Math.ceil((W - 1) / CHUNK), nz = Math.ceil((H - 1) / CHUNK);
    const map = new Int32Array((CHUNK + 1) * (CHUNK + 1));
    for (let cj = 0; cj < nz; cj++) for (let ci = 0; ci < nx; ci++) {
      const i0 = ci * CHUNK, j0 = cj * CHUNK, i1 = Math.min(W - 1, i0 + CHUNK), j1 = Math.min(H - 1, j0 + CHUNK);
      const w = i1 - i0 + 1;
      map.fill(-1);
      const pos = [], shore = [], idx = [];
      const vid = (i, j) => {
        const m = (j - j0) * w + (i - i0);
        if (map[m] < 0) { map[m] = pos.length / 3; pos.push(world.cellX(i), vertexLevel(i, j), world.cellZ(j)); shore.push(world.sdCell(i, j)); }
        return map[m];
      };
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const k = j * W + i;
        if (!(lake[k] || lake[k + 1] || lake[k + W] || lake[k + W + 1])) continue;
        const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
        if (((i + j) & 1) === 0) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
      }
      if (!idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 1));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      geo.boundingSphere.radius += 0.5;
      const mesh = new THREE.Mesh(geo, this.farMaterial);
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 10;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  update(dt, cx, cz) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    const s = this.world.cell; // snap to the lattice so the patch edge lies on far-mesh edges
    this.uniforms.uPatchCenter.value.set(Math.round(cx / s) * s, Math.round(cz / s) * s);
  }

  waveAt(x, z) { return waveHeight(x, z, this.time, this.world); }

  // uniforms another material needs to ride the same surface (see wake.js)
  surfaceUniforms() { const u = this.uniforms; return { uShoreTex: u.uShoreTex, uGrid: u.uGrid, uGridSize: u.uGridSize, uWaterTime: u.uTime }; }

  // Mirror only what is on REFLECT_LAYER (the canoe) into the reflection target.
  renderReflection(renderer, scene, camera, level) {
    if (!this.reflectionsOn) { this.uniforms.uReflOn.value = 0; return; }
    const bg = scene.background;
    scene.background = null;
    const ok = this.reflection.render(renderer, scene, camera, level, REFLECT_LAYER);
    scene.background = bg;
    this.uniforms.uReflOn.value = ok ? 1 : 0;
  }
}

const _normal = new THREE.Vector3(0, 1, 0), _planePoint = new THREE.Vector3(), _camPos = new THREE.Vector3(), _view = new THREE.Vector3();
const _look = new THREE.Vector3(), _target = new THREE.Vector3(), _rot = new THREE.Matrix4(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
const _clear = new THREE.Color();
export class WaterReflection {
  constructor(w, h) {
    this.target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
    this.camera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
  }
  render(renderer, scene, camera, level, layer) {
    const cam = this.camera;
    _planePoint.set(0, level, 0);
    camera.getWorldPosition(_camPos);
    if (_camPos.y <= level + 0.05) return false;
    _view.subVectors(_planePoint, _camPos).reflect(_normal).negate().add(_planePoint);
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_camPos);
    _target.subVectors(_planePoint, _look).reflect(_normal).negate().add(_planePoint);
    cam.position.copy(_view);
    cam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_normal);
    cam.lookAt(_target);
    cam.far = camera.far;
    cam.layers.set(layer);
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    _plane.setFromNormalAndCoplanarPoint(_normal, _planePoint).applyMatrix4(cam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = cam.projectionMatrix;
    _q.x = (Math.sign(_clip.x) + pm.elements[8]) / pm.elements[0];
    _q.y = (Math.sign(_clip.y) + pm.elements[9]) / pm.elements[5];
    _q.z = -1.0;
    _q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    pm.elements[2] = _clip.x; pm.elements[6] = _clip.y; pm.elements[10] = _clip.z + 1.0; pm.elements[14] = _clip.w;
    cam.projectionMatrixInverse.copy(pm).invert();
    const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate, prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(_clear);
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setClearColor(_clear, prevAlpha);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevAuto;
    return true;
  }
}
