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
// The sky's colour along a direction, without the sun disc. Exported so another material can take the sky's colour
// by direction (a reflection along the mirrored ray, say) with the dome's own stops and glow.
//   skyGradient   three stops: the horizon band, a pale middle six to ten degrees up, the blue by twenty degrees.
//                 Toward a low sun the warm bands reach higher (lift: 1 doubles their height looking at the sun), so
//                 the sky about the sun is the horizon's warmth fading into the blue, never the blue with orange
//                 added on top (which goes violet where the two meet)
//   skyGlow       the low sun's glow: a broad warm bloom about the sun and a band along the horizon either side
//                 of it (glow: amount, power)
export const glslSky = /* glsl */ `
  vec3 skyGradient(vec3 d, vec3 zenith, vec3 mid, vec3 horizon, vec3 sunDir, float lift) {
    float s = max(dot(d, sunDir), 0.0);
    float y = d.y / (1.0 + lift * s * s * s);
    return mix(mix(horizon, mid, smoothstep(0.0, 0.1, y)), zenith, smoothstep(0.06, 0.45, y));
  }
  vec3 skyGlow(vec3 d, vec3 sunDir, vec3 sunColor, vec2 glow) {
    float sd = max(dot(d, sunDir), 0.0);
    float band = 1.0 - smoothstep(0.0, 0.3, abs(d.y));
    return sunColor * (pow(sd, 24.0) * 0.18 + pow(sd, 6.0) * 0.05 + glow.x * (pow(sd, glow.y) + 0.6 * pow(sd, 2.0) * band));
  }
`;

const skyFrag = /* glsl */ `
  uniform vec3 uZenith, uHorizon, uMid, uGround, uSunDir, uSunColor;
  uniform vec3 uGlow; // the low sun's glow: amount, power, and how far the warm bands rise toward it
  uniform vec3 uDisc; // the sun disc: angular radius (radians), brightness, halo brightness
  varying vec3 vDir;
  ${glslSky}
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = skyGradient(d, uZenith, uMid, uHorizon, uSunDir, uGlow.z);
    col = mix(col, uGround, smoothstep(0.0, 0.12, -d.y));
    col += skyGlow(d, uSunDir, uSunColor, uGlow.xy);
    // the sun: a crisp disc (the chord to the sun's centre is the angle to it, without acos's loss of precision
    // near 1), much brighter than anything else so the tone map burns it white at the core, in a soft halo
    float ang = length(d - uSunDir);
    float aa = max(fwidth(ang), 1e-5);
    float disc = 1.0 - smoothstep(uDisc.x - aa, uDisc.x + aa, ang);
    float halo = exp(-ang / (uDisc.x * 2.2)) * 0.55 + exp(-ang / (uDisc.x * 9.0)) * 0.12;
    col += uSunColor * (uDisc.y * disc + uDisc.z * halo) * smoothstep(-0.03, 0.0, uSunDir.y);
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
      uMid: { value: new THREE.Color(palette.mid ?? palette.horizon).lerp(new THREE.Color(palette.zenith), palette.mid ? 0 : 0.5) },
      uGround: { value: new THREE.Color(palette.ground) },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(palette.sun) },
      uGlow: { value: new THREE.Vector3(0.1, 8, 0) },
      uDisc: { value: new THREE.Vector3(0.0085, 24, 3) },
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

// The clouds. The weather (weather.js) moves them through the day cycle, which colours them and leaves the frame's
// weather in group.userData.weather (cover, deck, dark, anvil, the wind, the flash) for updateClouds:
//   cumulus   painterly puffs: overlapping smooth spheres with flat bottoms, shaded in three soft bands (warm lit top,
//             pale blue underside) with a sky-tinted rim so edges read as painted, not modelled. CLOUD_COUNT of them,
//             instanced over seven shapes; each has a rank, and the ones ranked under the cover show, swelling in and
//             shrinking away over half a minute, so a fair sky fills with broken cumulus and a clear one keeps a few.
//             They drift with the wind and wrap round the camera.
//   deck      the overcast: one wide layer DECK_HEIGHT over the water, following the camera, a world-space noise
//             drifting with the wind. The cover thresholds the noise, so it comes in as broken stratocumulus and
//             closes to a flat grey sheet, a little darker where thick and silver at thin edges toward the sun, and
//             fades out toward its rim into the dome's horizon (which the day cycle greys to match).
//   anvils    a storm's cumulonimbus: dark towers with a spread flat top, standing 5-7 km upwind.
export const CLOUD_COUNT = 220;
export const DECK_HEIGHT = 1000;   // metres over the water under the camera
const cloudVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = m * instanceMatrix;
    #endif
    vN = normalize(mat3(m) * normal);
    vec4 wp = m * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const cloudFrag = /* glsl */ `
  uniform vec3 uTop, uBase, uSky, uSunDir, uFlash;
  uniform float uAnvilBase;   // the anvils' base, world y
  varying vec3 vN;
  varying vec3 vW;
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vN);
    float lit = n.y * 0.75 + dot(n, uSunDir) * 0.45;
    #ifdef ANVIL_HEIGHT
      // a thunderhead reads as one mass: smooth light over it, dark slate low (the rain under it), bright up top
      float t = smoothstep(-0.7, 0.9, lit);
      vec3 col = mix(uBase, uTop, t) * mix(0.45, 1.1, smoothstep(0.1, 0.85, (vW.y - uAnvilBase) / ANVIL_HEIGHT));
    #else
      float t = smoothstep(-0.25, -0.05, lit) * 0.45 + smoothstep(0.2, 0.45, lit) * 0.55;
      vec3 col = mix(uBase, uTop, t);
    #endif
    vec3 v = normalize(cameraPosition - vW);
    float rim = pow(1.0 - abs(dot(n, v)), 2.5);
    col = mix(col, uSky, rim * 0.22);
    col += uFlash * (0.6 + 0.4 * t);   // lightning inside the cloud
    gl_FragColor = vec4(col, 1.0);
    #ifdef USE_FOG
      gl_FragColor.rgb = fogApply(gl_FragColor.rgb, vFogDir * FOG_SCALE);   // the anvils take less of the haze
    #endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const deckVert = /* glsl */ `
  varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const deckFrag = /* glsl */ `
  uniform vec3 uLit, uDark, uSunDir, uSunColor, uFlash;
  uniform vec4 uDeck;   // cover 0..1, darkness 0..1, the drift (world metres, wrapped)
  varying vec3 vW;
  #include <fog_pars_fragment>
  float deckHash(vec2 c) {
    uvec2 q = uvec2(ivec2(c) + 65536) * uvec2(1597334677u, 3812015801u);
    uint n = (q.x ^ (q.y >> 3u)) * 1597334677u;
    n ^= n >> 15u;
    n *= 2246822519u;
    return float(n >> 8u) * (1.0 / 16777216.0);
  }
  float deckNoise(vec2 p) {
    vec2 i = floor(p), f = p - i, u = f * f * (3.0 - 2.0 * f);
    return mix(mix(deckHash(i), deckHash(i + vec2(1.0, 0.0)), u.x), mix(deckHash(i + vec2(0.0, 1.0)), deckHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    float cover = uDeck.x;
    vec2 p = (vW.xz + uDeck.zw) * 0.00042;
    float base = deckNoise(p) * 0.62 + deckNoise(p * 2.13 + vec2(3.7, 1.3)) * 0.38;
    float n = base * 0.77 + deckNoise(p * 4.7 + vec2(9.1, 4.2)) * 0.15 + deckNoise(p * 10.3 + vec2(2.4, 7.7)) * 0.08;
    float th = mix(0.82, 0.2, cover);
    float a = max(smoothstep(th - 0.03, th + 0.09, n), smoothstep(0.88, 1.0, cover));
    a *= 1.0 - smoothstep(5600.0, 8400.0, length(vW.xz - cameraPosition.xz));
    if (a < 0.004) discard;
    // thick is dark, the broken edges paler; a full deck keeps only a soft mottle
    float thick = smoothstep(th, th + 0.3, n) * mix(1.0, 0.45, smoothstep(0.85, 1.0, cover));
    float mottle = (base - 0.5) * 0.9;
    vec3 col = mix(uLit, uDark, clamp(thick * (0.45 + 0.55 * uDeck.y) + mottle * 0.35, 0.0, 1.0));
    vec3 v = normalize(vW - cameraPosition);
    float sd = max(dot(v, uSunDir), 0.0);
    col += uSunColor * (pow(sd, 8.0) * 0.35 + pow(sd, 48.0) * 0.8) * (1.0 - thick) * (1.0 - 0.7 * smoothstep(0.85, 1.0, cover));
    col += uFlash * (1.0 - 0.4 * thick);
    gl_FragColor = vec4(col, a);
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
    const g = new THREE.SphereGeometry(r, 13, 9);
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

// A cumulonimbus: a cauliflower tower of puffs, broad at the base and narrowing upward, under a wide flat anvil
// sheared downwind (+x) with a dome overshooting its top; base at y = 0, about 3 km tall, 4 km across the top.
function makeAnvilGeometry(rng) {
  const parts = [];
  const puff = (r, x, y, z, sy = 1) => { const g = new THREE.SphereGeometry(r, 12, 8); g.scale(1, sy, 1); g.translate(x, y, z); parts.push(g); };
  // the tower: puffs scattered through a cone that narrows upward, each a little taller than wide
  const top = 2300;
  for (let i = 0; i < 34; i++) {
    const v = Math.pow(rng(), 0.8), y = v * top, w = 900 - 450 * v;
    const r = (300 + rng() * 260) * (1 - 0.35 * v), a = rng() * Math.PI * 2, d = w * Math.sqrt(rng()) * 0.6;
    puff(r, Math.cos(a) * d + v * 180, y + r * 0.4, Math.sin(a) * d, 1.15);
  }
  const y = top;
  puff(760, 160, y - 120, 0, 0.5);   // the tower's shoulders under the anvil
  for (let k = 0; k < 7; k++) {
    const g = new THREE.SphereGeometry(1, 16, 8);
    g.scale(1000 + rng() * 600, 150 + rng() * 70, 800 + rng() * 400);
    g.translate(250 + k * 230 + (rng() - 0.5) * 300, y + 220 + rng() * 90, (rng() - 0.5) * 600);
    parts.push(g);
  }
  puff(420, 80, y + 300, 0, 0.8);   // the overshooting top
  const merged = mergeVertices(mergeGeometries(parts, false), 1);
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
      uFlash: { value: new THREE.Color(0, 0, 0) },
      uAnvilBase: { value: 0 },
    }]),
    defines: { FOG_SCALE: '1.0' },
    fog: true,
  });
  // the cumulus: CLOUD_COUNT (at least the count asked for) over seven shapes; the first `count` by rank are what a
  // clear sky shows, the rest come in with the cover
  const total = Math.max(count, CLOUD_COUNT);
  const geos = Array.from({ length: 7 }, () => makeCloudGeometry(rng));
  const meshes = geos.map((g) => { const m = new THREE.InstancedMesh(g, mat, Math.ceil(total / geos.length)); m.count = 0; m.frustumCulled = false; group.add(m); return m; });
  const ranks = Array.from({ length: total }, (_, i) => i);
  for (let i = total - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ranks[i], ranks[j]] = [ranks[j], ranks[i]]; }
  const puffs = [];
  for (let i = 0; i < total; i++) {
    const s = 1.6 + rng() * 2.6;
    puffs.push({
      mesh: meshes[i % geos.length], x: (rng() - 0.5) * extent * 2, y: 650 + rng() * 450, z: (rng() - 0.5) * extent * 2,
      rot: rng() * Math.PI * 2, sx: s, sy: s * (0.8 + rng() * 0.3), sz: s * (0.8 + rng() * 0.4),
      drift: 2.5 + rng() * 2.5, rank: ranks[i] / total, shown: ranks[i] < count ? 1 : 0,
    });
  }
  // the deck
  const deckMat = new THREE.ShaderMaterial({
    vertexShader: deckVert, fragmentShader: deckFrag,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uLit: { value: new THREE.Color(0.6, 0.62, 0.66) },
      uDark: { value: new THREE.Color(0.3, 0.32, 0.36) },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(0, 0, 0) },
      uFlash: { value: new THREE.Color(0, 0, 0) },
      uDeck: { value: new THREE.Vector4(0, 0, 0, 0) },
    }]),
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const deckGeo = new THREE.PlaneGeometry(17600, 17600, 1, 1);
  deckGeo.rotateX(-Math.PI / 2);
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.name = 'cloud deck';
  deck.frustumCulled = false;
  deck.renderOrder = -7;   // after the dome, the stars and the moon; before anything else see-through
  deck.visible = false;
  group.add(deck);
  // the anvils
  // the anvils have their own colours (a lit top over a dark base, set by the day cycle) on the same shaders
  const anvilMat = mat.clone();
  anvilMat.defines = { FOG_SCALE: '0.4', ANVIL_HEIGHT: '3600.0' };   // a strong shape against the sky: hazed as if nearer than it is
  const anvil = new THREE.InstancedMesh(makeAnvilGeometry(rng), anvilMat, 3);
  anvil.count = 0; anvil.frustumCulled = false; anvil.name = 'anvils';
  group.add(anvil);
  const anvils = [{ bearing: -0.35, dist: 6200, scale: 1.25 }, { bearing: 0.4, dist: 5400, scale: 1.0 }, { bearing: 0.05, dist: 7300, scale: 1.4 }];
  group.userData = {
    extent, puffs, meshes, deck, deckMat, anvil, anvils, material: mat, anvilMaterial: anvilMat, presence: 0, anvilShown: 0,
    drift: { x: 0, z: 0 }, base: 446, clearCover: count / total,
    weather: null, // { cover, deck, dark, anvil, windX, windZ, windSpeed, base, snap }: written by the day cycle
  };
  updateClouds(group, 0);
  return group;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// Clouds drift with the wind (east, as before, until a weather says otherwise) and wrap around the camera, so the sky
// is full wherever the canoe has got to; the cover brings puffs in and out, the deck follows the camera.
export function updateClouds(group, dt, cx = 0, cz = 0) {
  const u = group.userData, e = u.extent, w = u.weather;
  const cover = w ? w.cover : u.clearCover;
  const speed = w ? 2 + 0.8 * w.windSpeed : 3.5;
  const dx = w ? w.windX : 1, dz = w ? w.windZ : 0;
  // puffs form and dissolve over half a minute; at once when the weather jumped (a debug set, a change of clock)
  const ease = !(dt > 0) || (w && w.snap) ? 1 : 1 - Math.exp(-dt / 12);
  if (w) w.snap = false;
  for (const m of u.meshes) m.userData.n = 0;
  for (const c of u.puffs) {
    const v = c.drift / 3.75 * speed;
    c.x += dx * v * dt; c.z += dz * v * dt;
    if (c.x - cx > e) c.x -= 2 * e; else if (c.x - cx < -e) c.x += 2 * e;
    if (c.z - cz > e) c.z -= 2 * e; else if (c.z - cz < -e) c.z += 2 * e;
    const want = c.rank < cover ? 1 : 0;
    c.shown += (want - c.shown) * ease;
    if (c.shown < 0.02) continue;
    const grow = Math.sqrt(c.shown) * (w ? 1 + 0.35 * w.dark : 1);   // storm cloud bases are bigger and darker
    const i = c.mesh.userData.n++;
    _q.setFromAxisAngle(_up, c.rot);
    _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(c.sx * grow, c.sy * grow * (w ? 1 + 0.6 * w.dark : 1), c.sz * grow));
    c.mesh.setMatrixAt(i, _m);
  }
  for (const m of u.meshes) { m.count = m.userData.n; if (m.count) m.instanceMatrix.needsUpdate = true; }
  // the deck: over the water under the camera, its noise carried downwind
  const d = u.deck, deck = w ? w.deck : 0;
  u.drift.x = (u.drift.x - dx * speed * 1.4 * dt) % 1e6; u.drift.z = (u.drift.z - dz * speed * 1.4 * dt) % 1e6;
  d.visible = deck > 0.01;
  if (d.visible) {
    d.position.set(cx, (w ? w.base : u.base) + DECK_HEIGHT, cz);
    u.deckMat.uniforms.uDeck.value.set(deck, w.dark, u.drift.x, u.drift.z);
  }
  // the anvils: a storm's towers, upwind of the camera, rising with the storm
  const a = w ? w.anvil : 0;
  u.anvilShown += (a - u.anvilShown) * ease;
  const an = u.anvil;
  if (u.anvilShown > 0.02) {
    const head = Math.atan2(-dz, -dx);   // upwind
    u.anvils.forEach((s, i) => {
      const h = head + s.bearing, k = Math.sqrt(u.anvilShown) * s.scale;
      _q.setFromAxisAngle(_up, -Math.atan2(dz, dx));   // the anvil's top sheared downwind
      _m.compose(_p.set(cx + Math.cos(h) * s.dist, (w ? w.base : u.base) + 250, cz + Math.sin(h) * s.dist), _q, _s.set(k, k, k));
      u.anvilMaterial.uniforms.uAnvilBase.value = (w ? w.base : u.base) + 250;
      an.setMatrixAt(i, _m);
    });
    an.count = u.anvils.length; an.instanceMatrix.needsUpdate = true;
  } else an.count = 0;
}
