import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
    vec3 col = mix(uHorizon, uZenith, pow(clamp(t, 0.0, 1.0), 0.5));
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

// Low-poly cumulus: clusters of squashed icosahedra, merged into one geometry per cloud.
function makeCloudGeometry(rng) {
  const parts = [];
  const n = 4 + Math.floor(rng() * 6);
  let x = 0;
  for (let i = 0; i < n; i++) {
    const r = 18 + rng() * 28;
    const g = new THREE.IcosahedronGeometry(r, 1);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, (rng() - 0.5) * 8 + r * 0.25, (rng() - 0.5) * 30),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3)),
      new THREE.Vector3(1.4 + rng() * 0.5, 0.55 + rng() * 0.25, 1.1 + rng() * 0.4),
    );
    g.applyMatrix4(m);
    parts.push(g);
    x += r * (0.9 + rng() * 0.5);
  }
  const merged = mergeGeometries(parts, false);
  merged.translate(-x / 2, 0, 0);
  merged.computeVertexNormals();
  return merged;
}

export function buildClouds(count, extent, seed = 5) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'clouds';
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x6c7f8f, emissiveIntensity: 0.25 });
  const geos = Array.from({ length: 6 }, () => makeCloudGeometry(rng));
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geos[i % geos.length], mat);
    m.position.set((rng() - 0.5) * extent * 2, 420 + rng() * 260, (rng() - 0.5) * extent * 2);
    m.rotation.y = rng() * Math.PI * 2;
    const s = 1.2 + rng() * 1.8;
    m.scale.set(s, s * 0.8, s);
    m.userData.drift = 2 + rng() * 2;
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
