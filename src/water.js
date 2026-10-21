import * as THREE from 'three';

const CHUNK = 64;

// CPU twin of the vertex shader's wave function (used for canoe bobbing).
export function waveHeight(x, z, t, shore = -50) {
  let w = 0;
  w += Math.sin(x * 0.11 + t * 1.1) * 0.06;
  w += Math.sin(z * 0.13 - t * 0.9 + x * 0.05) * 0.05;
  w += Math.sin((x + z) * 0.07 + t * 0.7) * 0.04;
  const damp = THREE.MathUtils.smoothstep(-shore, 0, 6); // 0 at the shore, 1 six metres out
  return w * damp;
}

const vert = /* glsl */ `
  uniform float uTime;
  attribute float aShore;
  varying vec3 vWorld;
  varying float vShore;
  #include <fog_pars_vertex>
  void main() {
    vec3 p = position;
    float w = 0.0;
    w += sin(p.x * 0.11 + uTime * 1.1) * 0.06;
    w += sin(p.z * 0.13 - uTime * 0.9 + p.x * 0.05) * 0.05;
    w += sin((p.x + p.z) * 0.07 + uTime * 0.7) * 0.04;
    float damp = smoothstep(0.0, 6.0, -aShore);
    p.y += w * damp;
    vec4 worldPosition = modelMatrix * vec4(p, 1.0);
    vWorld = worldPosition.xyz;
    vShore = aShore;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir, uDeep, uShallow, uZenith, uHorizon, uReflect;
  varying vec3 vWorld;
  varying float vShore;
  #include <fog_pars_fragment>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.0) n = -n;
    vec3 v = normalize(cameraPosition - vWorld);
    float depth = -vShore; // metres from shore, positive in water
    float depthT = smoothstep(0.0, 32.0, depth);
    vec3 base = mix(uShallow, uDeep, depthT);
    float ndl = max(dot(n, uSunDir), 0.0);
    vec3 col = base * (0.6 + 0.4 * ndl);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 skyRef = mix(uReflect, uZenith, clamp(v.y * 1.2, 0.0, 1.0));
    col = mix(col, skyRef, 0.1 + 0.5 * fres);
    vec3 h = normalize(uSunDir + v);
    float spec = pow(max(dot(n, h), 0.0), 600.0);
    col += vec3(1.0, 0.96, 0.85) * spec * 0.4;
    // shoreline ripples: thin lines parallel to the shore rolling in, broken up along the shore
    float along = vWorld.x * 0.31 + vWorld.z * 0.23;
    float breakup = 0.5 + 0.5 * sin(along * 0.7 + uTime * 0.25) * sin(along * 0.23 - uTime * 0.11);
    float phase = fract(depth * 0.8 + uTime * 0.55 + 0.25 * sin(along * 1.3 + uTime * 0.4));
    float line = smoothstep(0.78, 0.88, phase) * (1.0 - smoothstep(0.9, 0.98, phase));
    float ripple = line * (1.0 - smoothstep(1.0, 7.5, depth)) * smoothstep(0.25, 0.55, breakup) * step(0.0, depth);
    float waterline = (1.0 - smoothstep(0.0, 0.45, depth)) * step(0.0, depth);
    float foam = max(ripple * 0.7, waterline * 0.4);
    col = mix(col, vec3(0.92, 0.96, 0.96), foam);
    float alpha = mix(0.55, 0.93, smoothstep(0.0, 16.0, depth));
    alpha = max(alpha, foam * 0.9);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function makeWaterMaterial(sunDir, palette) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSunDir: { value: sunDir.clone() },
        uDeep: { value: new THREE.Color(palette.deep) },
        uShallow: { value: new THREE.Color(palette.shallow) },
        uZenith: { value: new THREE.Color(palette.zenith) },
        uHorizon: { value: new THREE.Color(palette.horizon) },
        uReflect: { value: new THREE.Color(palette.reflect) },
      },
    ]),
    transparent: true,
    depthWrite: true,
    fog: true,
  });
}

export function buildWater(world, material) {
  const group = new THREE.Group();
  group.name = 'water';
  const W = world.width, H = world.height;
  const lake = world.lake, levels = world.levelById;
  // surface level for any lattice point: own lake, else the highest neighbouring lake
  const vertexLevel = (i, j) => {
    const id = world.lakeCell(i, j);
    if (id) return levels[id];
    let best = -Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const n = world.lakeCell(i + di, j + dj);
      if (n) best = Math.max(best, levels[n]);
    }
    return best;
  };
  const nx = Math.ceil((W - 1) / CHUNK), nz = Math.ceil((H - 1) / CHUNK);
  const map = new Int32Array((CHUNK + 1) * (CHUNK + 1));
  for (let cj = 0; cj < nz; cj++) {
    for (let ci = 0; ci < nx; ci++) {
      const i0 = ci * CHUNK, j0 = cj * CHUNK;
      const i1 = Math.min(W - 1, i0 + CHUNK), j1 = Math.min(H - 1, j0 + CHUNK);
      const w = i1 - i0 + 1, h = j1 - j0 + 1;
      map.fill(-1);
      const pos = [], shore = [], idx = [];
      const vid = (i, j) => {
        const m = (j - j0) * w + (i - i0);
        if (map[m] < 0) {
          map[m] = pos.length / 3;
          pos.push(world.cellX(i), vertexLevel(i, j), world.cellZ(j));
          shore.push(world.sdCell(i, j));
        }
        return map[m];
      };
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const k = j * W + i;
          if (!(lake[k] || lake[k + 1] || lake[k + W] || lake[k + W + 1])) continue;
          const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
          if (((i + j) & 1) === 0) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
        }
      }
      if (!idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 1));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 10;
      group.add(mesh);
    }
  }
  return group;
}
