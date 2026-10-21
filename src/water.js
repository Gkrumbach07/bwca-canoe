import * as THREE from 'three';

// Water in two parts that share one shader:
//  - far field: static 10 m chunks, flat, with a hole cut where the near patch sits
//  - near patch: a 2.5 m grid that follows the canoe, carrying the faceted swell; it samples the
//    same shore-distance field the terrain was shaped from, so the waterline matches exactly
// Plus a planar reflection pass and shadow reception.

const CHUNK = 64;
const PATCH_HALF = 150;   // metres
const PATCH_RES = 2.5;    // metres per vertex

export function waveHeight(x, z, t, shore = -50) {
  let w = 0;
  w += Math.sin(x * 0.35 + t * 1.3) * 0.05;
  w += Math.sin(z * 0.42 - t * 1.1 + x * 0.18) * 0.045;
  w += Math.sin((x + z) * 0.21 + t * 0.9) * 0.06;
  w += Math.sin((x * 0.7 - z * 0.5) * 0.9 + t * 2.1) * 0.02;
  return w * THREE.MathUtils.smoothstep(-shore, 0, 8);
}

const glslWaves = /* glsl */ `
  float waves(vec2 p, float t) {
    float w = 0.0;
    w += sin(p.x * 0.35 + t * 1.3) * 0.05;
    w += sin(p.y * 0.42 - t * 1.1 + p.x * 0.18) * 0.045;
    w += sin((p.x + p.y) * 0.21 + t * 0.9) * 0.06;
    w += sin((p.x * 0.7 - p.y * 0.5) * 0.9 + t * 2.1) * 0.02;
    return w;
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
  ${glslWaves}
`;
const vertTail = /* glsl */ `
    vec4 worldPosition = vec4(p, 1.0);
    vWorld = p;
    vReflectUv = uTextureMatrix * worldPosition;
    vec3 transformedNormal = normalMatrix * vec3(0.0, 1.0, 0.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
    #include <shadowmap_vertex>
  }
`;
const vertFar = vertHead + /* glsl */ `
  attribute float aShore;
  void main() {
    vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
    vShore = aShore;
` + vertTail;

const vertPatch = vertHead + /* glsl */ `
  uniform sampler2D uShoreTex, uLevelTex;
  uniform vec3 uGrid;      // originX, originZ, 1/cell
  uniform ivec2 uGridSize;
  float cellSample(sampler2D t, ivec2 c) { c = clamp(c, ivec2(0), uGridSize - 1); return texelFetch(t, c, 0).r; }
  float shoreAt(vec2 w) {
    vec2 f = (w - uGrid.xy) * uGrid.z - 0.5;
    vec2 i = floor(f), a = f - i;
    ivec2 c = ivec2(i);
    float s00 = cellSample(uShoreTex, c), s10 = cellSample(uShoreTex, c + ivec2(1, 0));
    float s01 = cellSample(uShoreTex, c + ivec2(0, 1)), s11 = cellSample(uShoreTex, c + ivec2(1, 1));
    return mix(mix(s00, s10, a.x), mix(s01, s11, a.x), a.y);
  }
  void main() {
    vec2 w = uPatchCenter + position.xz;
    float level = cellSample(uLevelTex, ivec2(floor((w - uGrid.xy) * uGrid.z)));
    float shore = shoreAt(w);
    vShore = shore;
    float border = 1.0 - smoothstep(uPatchHalf - 30.0, uPatchHalf - 4.0, max(abs(position.x), abs(position.z)));
    float damp = smoothstep(0.0, 8.0, -shore) * border;
    vec3 p = vec3(w.x, level + waves(w, uTime) * damp, w.y);
` + vertTail;

const frag = /* glsl */ `
  uniform float uTime, uReflOn;
  uniform vec3 uSunDir, uDeep, uShallow, uReflect;
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
    vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 30.0, depth));
    float ndl = max(dot(n, uSunDir), 0.0);
    vec3 col = base * (0.66 + 0.34 * ndl * shadow);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec4 ruv = vReflectUv;
    ruv.xy += n.xz * 0.35 * ruv.w;
    vec3 refl = mix(uReflect, texture2DProj(uReflection, ruv).rgb, uReflOn);
    col = mix(col, refl, 0.14 + 0.5 * fres);
    col *= 0.78 + 0.22 * shadow;
    vec3 h = normalize(uSunDir + v);
    float spec = pow(max(dot(n, h), 0.0), 500.0) * shadow;
    col += vec3(1.0, 0.96, 0.85) * spec * 0.5;
    // shoreline ripples: thin lines parallel to the shore rolling in, broken up along the shore
    float along = vWorld.x * 0.31 + vWorld.z * 0.23;
    float breakup = 0.5 + 0.5 * sin(along * 0.7 + uTime * 0.25) * sin(along * 0.23 - uTime * 0.11);
    float phase = fract(depth * 0.8 + uTime * 0.55 + 0.25 * sin(along * 1.3 + uTime * 0.4));
    float line = smoothstep(0.78, 0.88, phase) * (1.0 - smoothstep(0.9, 0.98, phase));
    float ripple = line * (1.0 - smoothstep(0.8, 5.5, depth)) * smoothstep(0.3, 0.6, breakup) * step(0.0, depth);
    float waterline = (1.0 - smoothstep(0.0, 0.45, depth)) * step(0.0, depth);
    float foam = max(ripple * 0.5, waterline * 0.3);
    col = mix(col, vec3(0.93, 0.96, 0.96), foam);
    float alpha = mix(0.6, 0.95, smoothstep(0.0, 14.0, depth));
    alpha = max(alpha, foam * 0.9);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function buildLevelGrid(world) {
  // every cell gets the surface level of the nearest water (multi-source flood fill)
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

export class WaterSystem {
  constructor(world, sunDir, palette) {
    this.world = world;
    this.time = 0;
    this.reflection = new WaterReflection(1024, 512);
    this.reflectionsOn = true;
    const W = world.width, H = world.height;
    const shoreTex = new THREE.DataTexture(world.sd, W, H, THREE.RedFormat, THREE.FloatType);
    shoreTex.minFilter = shoreTex.magFilter = THREE.NearestFilter; shoreTex.needsUpdate = true;
    const levelGrid = buildLevelGrid(world);
    const levelTex = new THREE.DataTexture(levelGrid, W, H, THREE.RedFormat, THREE.FloatType);
    levelTex.minFilter = levelTex.magFilter = THREE.NearestFilter; levelTex.needsUpdate = true;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights, {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone() },
      uDeep: { value: new THREE.Color(palette.deep) },
      uShallow: { value: new THREE.Color(palette.shallow) },
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
    // merge() clones values; put the shared objects back
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
    const s = PATCH_RES;
    this.uniforms.uPatchCenter.value.set(Math.round(cx / s) * s, Math.round(cz / s) * s);
  }

  waveAt(x, z, shore) { return waveHeight(x, z, this.time, shore); }

  renderReflection(renderer, scene, camera, level, hidden) {
    if (!this.reflectionsOn) { this.uniforms.uReflOn.value = 0; return; }
    const wasVisible = hidden.map((o) => o.visible);
    hidden.forEach((o) => { o.visible = false; });
    this.group.visible = false;
    const ok = this.reflection.render(renderer, scene, camera, level);
    this.group.visible = true;
    hidden.forEach((o, i) => { o.visible = wasVisible[i]; });
    this.uniforms.uReflOn.value = ok ? 1 : 0;
  }
}

// Mirror-camera render of the scene across the plane y = level (after three's Reflector).
const _normal = new THREE.Vector3(0, 1, 0), _planePoint = new THREE.Vector3(), _camPos = new THREE.Vector3(), _view = new THREE.Vector3();
const _look = new THREE.Vector3(), _target = new THREE.Vector3(), _rot = new THREE.Matrix4(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
export class WaterReflection {
  constructor(w, h) {
    this.target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, type: THREE.HalfFloatType });
    this.camera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
  }
  render(renderer, scene, camera, level) {
    const cam = this.camera;
    _planePoint.set(0, level, 0);
    camera.getWorldPosition(_camPos);
    if (_camPos.y <= level + 0.05) return false; // camera under water: nothing sensible to mirror
    _view.subVectors(_planePoint, _camPos).reflect(_normal).negate().add(_planePoint);
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_camPos);
    _target.subVectors(_planePoint, _look).reflect(_normal).negate().add(_planePoint);
    cam.position.copy(_view);
    cam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_normal);
    cam.lookAt(_target);
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // oblique near plane so nothing below the water surface ends up in the reflection
    _plane.setFromNormalAndCoplanarPoint(_normal, _planePoint).applyMatrix4(cam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = cam.projectionMatrix;
    _q.x = (Math.sign(_clip.x) + pm.elements[8]) / pm.elements[0];
    _q.y = (Math.sign(_clip.y) + pm.elements[9]) / pm.elements[5];
    _q.z = -1.0;
    _q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    pm.elements[2] = _clip.x; pm.elements[6] = _clip.y; pm.elements[10] = _clip.z + 1.0 - 0.0; pm.elements[14] = _clip.w;
    cam.projectionMatrixInverse.copy(pm).invert();
    const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevAuto;
    return true;
  }
}
