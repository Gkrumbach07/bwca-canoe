import * as THREE from 'three';
import { glslWaves, glslRipples, waveHeight } from './waves.js';

// Water in two parts that share one fragment shader:
//  - far field: static 10 m meshes, one per tile, carrying only the long swell, with a hole cut where the patch sits
//  - near patch: a 3.2 m grid following the canoe. Its long swell is bilinearly interpolated from the
//    same 10 m lattice nodes the far mesh uses (so the seam is exact) and short swell is added on top,
//    fading out toward the patch edge. Shore distance and water level come from a sliding 256-cell atlas
//    of the loaded tiles around the canoe.
// All shader arithmetic happens relative to a floating origin (the corner of the player's tile) so the
// sin() noise and the facet normals stay precise a hundred kilometres from the world origin.
// Flat single-tone colour, per-facet lighting, crisp ripple lines, and a reflection of the canoe only.

const PATCH_HALF = 160;   // metres; multiple of the 10 m lattice
const PATCH_RES = 3.2;    // metres per vertex
const ATLAS = 256;        // cells (2.56 km) of shore distance and water level around the canoe
const ATLAS_SLACK = 48;   // re-centre once the canoe gets this close to the atlas edge

// Swell height at any xz (relative to the floating origin), shared by the near water patch and the surface
// particles: long waves interpolated from the 10 m lattice nodes (damped near shore, exactly as the far
// mesh does it) plus short waves on top. Needs uShoreTex / uLevelTex / uAtlas bound.
export const glslSurface = /* glsl */ `
  uniform sampler2D uShoreTex;
  uniform sampler2D uLevelTex;
  uniform vec4 uAtlas;      // atlas origin x, z (relative to the floating origin), 1/cell, cells per side
  ${glslWaves}
  float cellSample(sampler2D t, ivec2 c) { c = clamp(c, ivec2(0), ivec2(int(uAtlas.w) - 1)); return texelFetch(t, c, 0).r; }
  float nodeWave(ivec2 c, float t) {
    vec2 np = uAtlas.xy + (vec2(c) + 0.5) / uAtlas.z;
    return lowWave(np, t) * smoothstep(0.0, 25.0, -cellSample(uShoreTex, c));
  }
  float atlasLevel(vec2 rel) { return cellSample(uLevelTex, ivec2(floor((rel - uAtlas.xy) * uAtlas.z))); }
  float surfaceWave(vec2 rel, float t, float border, out float shore) {
    vec2 f = (rel - uAtlas.xy) * uAtlas.z - 0.5;
    vec2 fi = floor(f), a = f - fi;
    ivec2 c = ivec2(fi);
    float s00 = cellSample(uShoreTex, c), s10 = cellSample(uShoreTex, c + ivec2(1, 0));
    float s01 = cellSample(uShoreTex, c + ivec2(0, 1)), s11 = cellSample(uShoreTex, c + ivec2(1, 1));
    shore = mix(mix(s00, s10, a.x), mix(s01, s11, a.x), a.y);
    float low = mix(mix(nodeWave(c, t), nodeWave(c + ivec2(1, 0), t), a.x), mix(nodeWave(c + ivec2(0, 1), t), nodeWave(c + ivec2(1, 1), t), a.x), a.y);
    return low + highWave(rel, t) * smoothstep(0.0, 8.0, -shore) * border;
  }
`;

const vertHead = /* glsl */ `
  uniform float uTime;
  uniform mat4 uTextureMatrix;
  uniform vec2 uOrigin;       // floating origin, world xz
  uniform vec2 uPatchLocal;   // patch centre relative to the origin
  uniform float uPatchHalf;
  varying vec3 vLocal;        // position relative to the floating origin
  varying float vShore;
  varying vec4 vReflectUv;
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
`;
const vertTail = /* glsl */ `
    vLocal = local;
    vec4 mvPosition = modelViewMatrix * vec4(objPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // shadows and the reflection are projected on the flat surface so the swell cannot break them up
    vec4 worldPosition = modelMatrix * vec4(flatObj, 1.0);
    vReflectUv = uTextureMatrix * worldPosition;
    vec3 transformedNormal = normalMatrix * vec3(0.0, 1.0, 0.0);
    #include <fog_vertex>
    #include <shadowmap_vertex>
  }
`;
const vertFar = vertHead + glslWaves + /* glsl */ `
  attribute float aShore;
  void main() {
    vec2 rel = position.xz + (modelMatrix[3].xz - uOrigin);   // both exact multiples of 10 m: no rounding
    vShore = aShore;
    float wave = lowWave(rel, uTime) * smoothstep(0.0, 25.0, -aShore);
    vec3 objPos = vec3(position.x, position.y + wave, position.z);
    vec3 flatObj = position;
    vec3 local = vec3(rel.x, position.y + wave, rel.y);
` + vertTail;

const vertPatch = vertHead + glslSurface + /* glsl */ `
  void main() {
    vec2 rel = position.xz + uPatchLocal;
    float border = 1.0 - smoothstep(uPatchHalf - 40.0, uPatchHalf - 6.0, max(abs(position.x), abs(position.z)));
    float shore;
    float wave = surfaceWave(rel, uTime, border, shore);
    vShore = shore;
    float level = atlasLevel(rel);
    vec3 objPos = vec3(position.x, level + wave, position.z);
    vec3 flatObj = vec3(position.x, level, position.z);
    vec3 local = vec3(rel.x, level + wave, rel.y);
` + vertTail;

const frag = /* glsl */ `
  uniform float uTime, uReflOn;
  uniform vec3 uSunDir, uWater, uReflect;
  uniform sampler2D uReflection;
  uniform vec2 uPatchLocal;
  uniform float uPatchHalf;
  varying vec3 vLocal;
  varying float vShore;
  varying vec4 vReflectUv;
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <shadowmap_pars_fragment>
  ${glslRipples}
  float aastep(float edge, float x) { float w = fwidth(x) * 0.8; return smoothstep(edge - w, edge + w, x); }
  void main() {
    #ifdef FAR
      if (abs(vLocal.x - uPatchLocal.x) < uPatchHalf && abs(vLocal.z - uPatchLocal.y) < uPatchHalf) discard;
    #else
      if (vShore > 0.6) discard;
    #endif
    vec3 n = normalize(cross(dFdx(vLocal), dFdy(vLocal)));
    if (n.y < 0.0) n = -n;
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
    vec2 p = vLocal.xz;
    float breakup = 0.5 + 0.5 * sin(dot(p, RIP1) + uTime * 0.25) * sin(dot(p, RIP2) - uTime * 0.11);
    float phase = fract(depth * 0.8 + uTime * 0.55 + 0.25 * sin(dot(p, RIP3) + uTime * 0.4));
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

export const REFLECT_LAYER = 1;

export class WaterSystem {
  constructor(world, sunDir, palette) {
    this.world = world;
    this.time = 0;
    this.origin = { x: world.originX, z: world.originZ };
    this.reflection = new WaterReflection(768, 768);
    this.reflectionsOn = true;
    this.shore = new Float32Array(ATLAS * ATLAS);
    this.level = new Float32Array(ATLAS * ATLAS);
    this.atlasI = NaN; this.atlasJ = NaN; this.atlasDirty = true;
    const shoreTex = new THREE.DataTexture(this.shore, ATLAS, ATLAS, THREE.RedFormat, THREE.FloatType);
    shoreTex.minFilter = shoreTex.magFilter = THREE.NearestFilter;
    const levelTex = new THREE.DataTexture(this.level, ATLAS, ATLAS, THREE.RedFormat, THREE.FloatType);
    levelTex.minFilter = levelTex.magFilter = THREE.NearestFilter;
    this.shoreTex = shoreTex; this.levelTex = levelTex;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights, {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone() },
      uWater: { value: new THREE.Color(palette.water) },
      uReflect: { value: new THREE.Color(palette.reflect) },
      uReflection: { value: null },
      uReflOn: { value: 0 },
      uTextureMatrix: { value: new THREE.Matrix4() },
      uOrigin: { value: new THREE.Vector2(this.origin.x, this.origin.z) },
      uPatchLocal: { value: new THREE.Vector2(1e9, 1e9) },
      uPatchHalf: { value: PATCH_HALF },
      uShoreTex: { value: null },
      uLevelTex: { value: null },
      uAtlas: { value: new THREE.Vector4(0, 0, 1 / world.cell, ATLAS) },
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
    const n = Math.round((PATCH_HALF * 2) / PATCH_RES);
    const geo = new THREE.PlaneGeometry(PATCH_HALF * 2, PATCH_HALF * 2, n, n);
    geo.rotateX(-Math.PI / 2);
    this.patch = new THREE.Mesh(geo, this.patchMaterial);
    this.patch.frustumCulled = false;
    this.patch.renderOrder = 10;
    this.patch.receiveShadow = true;
    this.group.add(this.patch);
  }

  // A tile's far water mesh (see water-build.js), in tile-local coordinates.
  makeFarMesh(res) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(res.pos, 3));
    geo.setAttribute('aShore', new THREE.BufferAttribute(res.shore, 1));
    geo.setIndex(new THREE.BufferAttribute(res.idx, 1));
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 0.5;
    const mesh = new THREE.Mesh(geo, this.farMaterial);
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 10;
    mesh.receiveShadow = true;
    return mesh;
  }

  setOrigin(ox, oz) {
    if (ox === this.origin.x && oz === this.origin.z) return;
    this.origin.x = ox; this.origin.z = oz;
    this.uniforms.uOrigin.value.set(ox, oz);
    this.atlasDirty = true;
  }

  invalidateAtlas() { this.atlasDirty = true; }

  update(dt, cx, cz) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    const w = this.world, s = w.cell; // snap to the lattice so the patch edge lies on far-mesh edges
    const px = Math.round(cx / s) * s, pz = Math.round(cz / s) * s;
    this.patch.position.set(px, 0, pz);
    this.uniforms.uPatchLocal.value.set(px - this.origin.x, pz - this.origin.z);
    const ci = w.cellI(cx), cj = w.cellJ(cz);
    if (this.atlasDirty || Math.abs(ci - (this.atlasI + ATLAS / 2)) > ATLAS / 2 - ATLAS_SLACK || Math.abs(cj - (this.atlasJ + ATLAS / 2)) > ATLAS / 2 - ATLAS_SLACK) this.rebuildAtlas(ci, cj);
  }

  // Shore distance and water level for the cells around the canoe; the level of land cells is that of the
  // nearest water by flood fill, so the patch can rise over the beach and be discarded there.
  rebuildAtlas(ci, cj) {
    const w = this.world, A = ATLAS, N = A * A;
    const i0 = Math.max(0, Math.min(w.width - A, ci - A / 2)), j0 = Math.max(0, Math.min(w.height - A, cj - A / 2));
    this.atlasI = i0; this.atlasJ = j0; this.atlasDirty = false;
    const shore = this.shore, level = this.level;
    const queue = this._queue || (this._queue = new Int32Array(N));
    let head = 0, tail = 0;
    for (let lj = 0; lj < A; lj++) for (let li = 0; li < A; li++) {
      const k = lj * A + li, id = w.lakeCell(i0 + li, j0 + lj);
      shore[k] = w.sdCell(i0 + li, j0 + lj);
      if (id) { level[k] = w.levelOf(id); queue[tail++] = k; } else level[k] = -9999;
    }
    while (head < tail) {
      const k = queue[head++], x = k % A, y = (k - x) / A, L = level[k];
      if (x > 0 && level[k - 1] === -9999) { level[k - 1] = L; queue[tail++] = k - 1; }
      if (x < A - 1 && level[k + 1] === -9999) { level[k + 1] = L; queue[tail++] = k + 1; }
      if (y > 0 && level[k - A] === -9999) { level[k - A] = L; queue[tail++] = k - A; }
      if (y < A - 1 && level[k + A] === -9999) { level[k + A] = L; queue[tail++] = k + A; }
    }
    this.shoreTex.needsUpdate = true;
    this.levelTex.needsUpdate = true;
    this.uniforms.uAtlas.value.set(w.originX + i0 * w.cell - this.origin.x, w.originZ + j0 * w.cell - this.origin.z, 1 / w.cell, A);
  }

  waveAt(x, z) { return waveHeight(x, z, this.time, this.world, this.origin.x, this.origin.z); }

  // uniforms another material needs to ride the same surface (see wake.js)
  surfaceUniforms() { const u = this.uniforms; return { uShoreTex: u.uShoreTex, uLevelTex: u.uLevelTex, uAtlas: u.uAtlas, uWaterTime: u.uTime }; }

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
