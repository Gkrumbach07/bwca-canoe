import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './rng.js';

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const skyFrag = /* glsl */ `
  uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float t = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(clamp(t, 0.0, 1.0), 0.38));
    col = mix(col, uGround, smoothstep(0.0, 0.12, -t));
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunColor * (pow(sd, 600.0) * 1.6 + pow(sd, 24.0) * 0.22 + pow(sd, 6.0) * 0.06);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildSky(sunDir, palette) {
  const geo = new THREE.SphereGeometry(7000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    uniforms: {
      uZenith: { value: new THREE.Color(palette.zenith) },
      uHorizon: { value: new THREE.Color(palette.horizon) },
      uGround: { value: new THREE.Color(palette.ground) },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(palette.sun) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

// Painterly cumulus: overlapping smooth spheres with flat bottoms, shaded in three soft bands
// (warm lit top, pale blue underside) with a sky-tinted rim so edges read as painted, not modelled.
const cloudVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const cloudFrag = /* glsl */ `
  uniform vec3 uTop, uBase, uSky, uSunDir;
  varying vec3 vN;
  varying vec3 vW;
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vN);
    float lit = n.y * 0.75 + dot(n, uSunDir) * 0.45;
    float t = smoothstep(-0.25, -0.05, lit) * 0.45 + smoothstep(0.2, 0.45, lit) * 0.55;
    vec3 col = mix(uBase, uTop, t);
    vec3 v = normalize(cameraPosition - vW);
    float rim = pow(1.0 - abs(dot(n, v)), 2.5);
    col = mix(col, uSky, rim * 0.22);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeCloudGeometry(rng) {
  const parts = [];
  const n = 5 + Math.floor(rng() * 9);
  let x = 0;
  const big = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    const mid = 1 - Math.abs(i - big) / (big + 1);           // tallest puffs in the middle
    const r = (35 + rng() * 30) * (0.7 + 0.6 * mid);
    const g = new THREE.SphereGeometry(r, 14, 10);
    g.translate(x, r * 0.5, (rng() - 0.5) * r * 1.2);
    parts.push(g);
    x += r * (0.75 + rng() * 0.45);
  }
  const merged = mergeVertices(mergeGeometries(parts, false));
  merged.translate(-x / 2, 0, 0);
  merged.scale(1, 0.55, 1);                                  // squat, flat-bottomed
  merged.computeVertexNormals();
  return merged;
}

export function buildClouds(count, extent, palette, sunDir, seed = 5) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'clouds';
  const mat = new THREE.ShaderMaterial({
    vertexShader: cloudVert, fragmentShader: cloudFrag,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTop: { value: new THREE.Color(palette.cloudTop) },
      uBase: { value: new THREE.Color(palette.cloudBase) },
      uSky: { value: new THREE.Color(palette.zenith) },
      uSunDir: { value: sunDir.clone() },
    }]),
    fog: true,
  });
  const geos = Array.from({ length: 7 }, () => makeCloudGeometry(rng));
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geos[i % geos.length], mat);
    m.position.set((rng() - 0.5) * extent * 2, 650 + rng() * 450, (rng() - 0.5) * extent * 2);
    m.rotation.y = rng() * Math.PI * 2;
    const s = 1.6 + rng() * 2.6;
    m.scale.set(s, s * (0.8 + rng() * 0.3), s * (0.8 + rng() * 0.4));
    m.userData.drift = 2.5 + rng() * 2.5;
    group.add(m);
  }
  group.userData.extent = extent;
  return group;
}

// Clouds drift east and wrap around the camera, so the sky is full wherever the canoe has got to.
export function updateClouds(group, dt, cx = 0, cz = 0) {
  const e = group.userData.extent;
  for (const c of group.children) {
    c.position.x += c.userData.drift * dt;
    if (c.position.x - cx > e) c.position.x -= 2 * e;
    else if (c.position.x - cx < -e) c.position.x += 2 * e;
    if (c.position.z - cz > e) c.position.z -= 2 * e;
    else if (c.position.z - cz < -e) c.position.z += 2 * e;
  }
}
