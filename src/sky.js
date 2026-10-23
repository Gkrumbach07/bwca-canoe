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
//   anvils    a building storm's cumulonimbus on the upwind horizon, 6.5-7.7 km out: a wide tower on a broad,
//             rain-dark base, lower towers stepping down upwind of it, and from its top a flat anvil streaming off
//             downwind to a thin ragged edge (seen side on, the way the shape reads), lit as the cumulus are and
//             darkening toward the base; the cumulus between cleared away so the towers stand clear over them.
export const CLOUD_COUNT = 220;
export const DECK_HEIGHT = 1000;   // metres over the water under the camera
const cloudVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  #ifdef ANVIL_HEIGHT
    varying float vH;   // height in the cloud's own frame (the base at 0), whatever its scale
  #endif
  #include <fog_pars_vertex>
  void main() {
    #ifdef ANVIL_HEIGHT
      vH = position.y;
    #endif
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
  varying vec3 vN;
  varying vec3 vW;
  #ifdef ANVIL_HEIGHT
    varying float vH;
  #endif
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vN);
    float lit = n.y * 0.75 + dot(n, uSunDir) * 0.45;
    #ifdef ANVIL_HEIGHT
      // a thunderhead: the tower lit as the cumulus it grew from is, bright on its sunward flank and a blue slate in
      // its own shade, darkening down into the rain-dark base (one ramp from the base to the anvil, so the tower and
      // the anvil read as one mass, never a dark stalk under a white cap); the anvil thin ice lit through, pale even
      // where the sun is behind it, its underside in shade
      float hf = clamp(vH / ANVIL_HEIGHT, 0.0, 1.0);
      float top = smoothstep(0.64, 0.74, hf);
      float sun = smoothstep(-0.35, 0.85, lit);
      float tower = mix(0.05, 0.85, smoothstep(-0.1, 0.5, lit)) * mix(0.3, 1.0, smoothstep(0.0, 0.45, hf));
      float under = 1.0 - smoothstep(-0.75, -0.25, n.y);
      float t = mix(tower, mix(0.42 + 0.58 * sun, 0.2, under), top);
      vec3 col = mix(uBase, uTop, clamp(t, 0.0, 1.0)) * mix(0.7, 1.0, smoothstep(0.0, 0.3, hf));
      const float rimK = 0.06;
    #else
      float t = smoothstep(-0.25, -0.05, lit) * 0.45 + smoothstep(0.2, 0.45, lit) * 0.55;
      vec3 col = mix(uBase, uTop, t);
      const float rimK = 0.22;
    #endif
    vec3 v = normalize(cameraPosition - vW);
    float rim = pow(1.0 - abs(dot(n, v)), 2.5);
    col = mix(col, uSky, rim * rimK);
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

// A cumulonimbus, ANVIL_H tall with its base at y = 0, x downshear and z toward the eye (the storms are always seen
// side on, from +z):
//   the tower      wide, on a broad flat base, narrowing a little as it climbs and leaning downshear: a solid core up
//                  its axis with cauliflower turrets round it (none on the far side, which never shows); its upwind
//                  half carries on up to the flat top, so the upwind side is one wall from the base to the top
//   the flank      a line of lower towers stepping down upshear (the young storm has two), widening the base
//   the anvil      flattened lobes in two rows across the shear, cut flat at the top (the tropopause): deep over the
//                  tower, then a wedge thinning downshear, the underside sloping up to a thin, ragged leading edge
//                  (lobes dropping out and scattering, a few thin tongues past it); only a short lip upshear
// The flat top and the flat base are cut (every vertex clamped to 0..top). The depth across the shear is squeezed
// (the tower to 0.6, the anvil to 0.35), so the near side of a storm 7 km off does not loom over the eye: the anvil's
// near edge stays a flat line rather than a dome. The shading normals are the full-depth cloud's, bent toward each
// tower's broad cylinder (the anvil's slab), the turrets keeping their lit caps: big planes of light with lumpy
// edges, not a pile of separately shaded balls. `mature` lengthens the anvil and the flank.
const ANVIL_H = 3500;
function makeAnvilGeometry(rng, mature = 1) {
  const H = ANVIL_H, C = 1050, topY = 0.96 * H, base = 0.68 * H;   // C: the tower's radius
  const parts = [];
  // a blob, and what its broad normal leans toward: part 1 a tower round the axis at x = axis, part 2 the anvil
  const blob = (rx, ry, rz, x, y, z, seg, part, axis = 0) => {
    const g = new THREE.SphereGeometry(1, seg, 6);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g.scale(rx, ry, rz); g.translate(x, y, z);
    const n = g.attributes.position.count;
    g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
    g.setAttribute('axis', new THREE.BufferAttribute(new Float32Array(n).fill(axis), 1));
    parts.push(g);
  };
  const R = (a, b) => a + (b - a) * rng();
  const sm = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const lean = (y) => 380 * Math.pow(Math.max(0, y) / H, 1.5);
  // the tower's radius by height: a broad foot narrowing up into the updraft, flaring a little into the anvil
  const prof = [[0, 1.3], [0.25, 1.15], [0.55, 0.95], [0.85, 0.86], [1, 1.02]];
  const radAt = (y) => {
    const v = Math.min(1, Math.max(0, y / base));
    for (let i = 1; i < prof.length; i++) if (v <= prof[i][0]) return C * (prof[i - 1][1] + (prof[i][1] - prof[i - 1][1]) * sm((v - prof[i - 1][0]) / (prof[i][0] - prof[i - 1][0])));
    return C * prof[prof.length - 1][1];
  };
  // the tower: eight levels of core, turrets round the lower six
  for (let k = 0; k < 8; k++) {
    const sp = (base - 260) / 7, y = 260 + k * sp, r = radAt(y), cx = lean(y);
    blob(r * 0.82, sp, r * 0.74, cx, y, 0, 12, 1, cx);
    if (y > 0.6 * H) continue;
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2 + R(-0.35, 0.35) + k * 0.6;
      if (Math.sin(a) < -0.55) continue;
      const rt = r * R(0.3, 0.44), d = r - rt * 0.7;
      blob(rt, rt * R(0.95, 1.15) * (1 + 0.25 * k / 7), rt * 0.95, cx + Math.cos(a) * d, y + R(-0.3, 0.3) * sp, Math.sin(a) * d * 0.88, 10, 1, cx);
    }
  }
  // the updraft: the upwind half of the tower carried on up into the anvil's flat top
  for (let i = 0; i < 3; i++) {
    const y = base + (i + 0.6) * 0.1 * H, r = C * (0.8 - 0.05 * i), cx = lean(base) - 0.15 * C;
    blob(r * 0.85, 0.09 * H, r * 0.72, cx, y, 0, 12, 1, cx);
    for (let j = 0; j < 3; j++) {
      const a = Math.PI * R(0.55, 0.95) + (j - 1) * 0.5, rt = r * R(0.35, 0.45), d = r - rt * 0.6;
      blob(rt, rt * R(1, 1.2), rt * 0.95, cx + Math.cos(a) * d, y + R(-0.03, 0.05) * H, Math.sin(a) * d * 0.88, 10, 1, cx);
    }
  }
  // the flank: towers stepping down upshear ([height, radius] of each, by H and C)
  const flank = [[0.5, 0.56], [0.37, 0.46], [0.25, 0.38]], nf = mature > 0.6 ? 3 : 2;
  let fx = -radAt(0) * 0.55;
  for (let i = 0; i < nf; i++) {
    const h = flank[i][0] * H * (mature > 0.6 ? 1 : 0.85), r = flank[i][1] * C;
    fx -= r * (i === 0 ? 1 : 1.24);
    blob(r * 0.9, h * 0.55, r * 0.8, fx, h * 0.45, 0, 12, 1, fx);
    for (let j = 0; j < 4; j++) {
      const rt = r * R(0.42, 0.58), a = R(0.2, Math.PI - 0.2);
      blob(rt, rt * R(1, 1.2), rt * 0.95, fx + Math.cos(a) * r * 0.5, h - rt * R(0.6, 0.9), Math.sin(a) * r * 0.45, 10, 1, fx);
    }
  }
  // the anvil: deep over the tower (from a little upshear of its axis to 0.3 C past it), a wedge thinning downshear
  const ax = lean(base), xEnd = ax + 1500 + 1500 * mature, xBack = ax - radAt(base) + 0.45 * C, deep = 0.28 * H, tip = 90;
  const depthAt = (x) => {
    if (x >= ax + 0.3 * C) return tip + (deep - tip) * (1 - Math.min(1, (x - ax - 0.3 * C) / (xEnd - ax - 0.3 * C)));
    if (x >= ax) return deep;
    return deep * (1 - 0.55 * sm((ax - x) / (ax - xBack)));
  };
  const widthAt = (x) => C + (x > ax ? 420 * mature * sm((x - ax) / (xEnd - ax)) : -200 * sm((ax - x) / (ax - xBack)));
  const step = 560, nx = Math.ceil((xEnd - xBack) / step);
  for (let i = 0; i <= nx; i++) {
    const f = i / nx, x0 = xBack + f * (xEnd - xBack), W = widthAt(x0);
    for (let row = 0; row < 2; row++) {
      const edge = f > 0.8 ? (f - 0.8) / 0.2 : 0;   // the leading edge: lobes drop out and scatter
      if (edge > 0 && rng() < 0.35 * edge) continue;
      const x = x0 + R(-0.25, 0.25) * step * (1 + 1.5 * edge);
      const d = depthAt(x) * R(0.88, 1.08), rz = W * R(0.5, 0.62), zc = (row - 0.5) * 2 * (W - rz) + R(-0.08, 0.08) * W;
      blob(step * R(0.95, 1.2) * (i === 0 ? 0.8 : 1), d * 0.72, rz, x, topY - d * 0.28, zc, 14, 2);
    }
  }
  for (let i = 0; i < 3; i++) {   // thin tongues past the leading edge
    const z = R(-0.7, 0.7) * widthAt(xEnd), len = R(250, 450), th = R(35, 55);
    blob(len, th, R(300, 450), xEnd + R(-150, 150), topY - th * 0.6, z, 12, 2);
  }
  // the flat top and the flat base cut, the shading normals, the depth squeezed
  const merged = mergeGeometries(parts, false), pos = merged.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, Math.min(topY, Math.max(0, pos.getY(i))));
  const geo = mergeVertices(merged, 1);
  geo.computeVertexNormals();
  const P = geo.attributes.position, N = geo.attributes.normal, part = geo.attributes.part, axis = geo.attributes.axis;
  const v = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), anvil = part.getX(i) === 2;
    v.set(N.getX(i), N.getY(i), N.getZ(i));
    if (y <= 1) v.set(0, -1, 0);
    else if (anvil && y >= topY - 1) v.set(0, 1, 0);
    else if (anvil) { if (v.y < 0) v.lerp(m.set(v.x * 0.4, -1, v.z * 0.4).normalize(), 0.45).normalize(); }
    else v.lerp(m.set(x - axis.getX(i), 0.2 * C, z / 0.88).normalize(), 0.45 + 0.55 * (1 - sm((v.y + 0.1) / 0.8))).normalize();
    N.setXYZ(i, v.x, v.y, v.z);
    P.setZ(i, z * (anvil ? 0.35 : 0.6));
  }
  geo.deleteAttribute('part'); geo.deleteAttribute('axis');
  return geo;
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
  // the anvils: their own colours (a lit top over a dark base, set by the day cycle) on the same shaders, two shapes
  // (a mature storm with a long anvil and a full flank, a younger one with a short anvil), each from its own seed so
  // the shapes stay put, placed by its bearing from upwind, its distance and its scale, every anvil sheared the same
  // way (one wind aloft) square to the upwind bearing, so looking upwind they are seen side on: the silhouette that
  // says "storm"
  const anvilMat = mat.clone();
  anvilMat.defines = { FOG_SCALE: '0.07', ANVIL_HEIGHT: `${ANVIL_H}.0` };   // a strong shape against the sky: hazed as if much nearer than it is
  const anvilMeshes = [makeAnvilGeometry(mulberry32(101), 1), makeAnvilGeometry(mulberry32(202), 0.3)].map((g) => {
    const m = new THREE.InstancedMesh(g, anvilMat, 2);
    m.count = 0; m.frustumCulled = false; m.name = 'anvils';
    group.add(m);
    return m;
  });
  const anvils = [
    { bearing: -0.3, dist: 7300, scale: 1.0, shape: 0, turn: 0 },
    { bearing: 0.33, dist: 6500, scale: 0.78, shape: 1, turn: 0 },
    { bearing: -0.82, dist: 7700, scale: 0.72, shape: 0, turn: 0 },   // at the edge of a view upwind
  ];
  group.userData = {
    extent, puffs, meshes, deck, deckMat, anvilMeshes, anvils, material: mat, anvilMaterial: anvilMat, presence: 0, anvilShown: 0, anvilHead: NaN,
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
  // the anvils stand upwind: their bearing turns with the wind, slowly (at once when the weather jumped)
  const head = Math.atan2(-dz, -dx);
  if (!Number.isFinite(u.anvilHead) || ease === 1) u.anvilHead = head;
  else { const dh = Math.atan2(Math.sin(head - u.anvilHead), Math.cos(head - u.anvilHead)); u.anvilHead += Math.sign(dh) * Math.min(Math.abs(dh), 0.01 * dt); }
  u.anvilShown += ((w ? w.anvil : 0) - u.anvilShown) * ease;
  // while they show, the cumulus between them and the eye goes (a sector of the sky upwind, past the near puffs
  // overhead), so the towers stand clear on the horizon over the fair-weather clouds
  const clear = u.anvilShown > 0.25;
  for (const c of u.puffs) {
    const v = c.drift / 3.75 * speed;
    c.x += dx * v * dt; c.z += dz * v * dt;
    if (c.x - cx > e) c.x -= 2 * e; else if (c.x - cx < -e) c.x += 2 * e;
    if (c.z - cz > e) c.z -= 2 * e; else if (c.z - cz < -e) c.z += 2 * e;
    let want = c.rank < cover ? 1 : 0;
    if (want && clear) {
      const ox = c.x - cx, oz = c.z - cz, rel = Math.atan2(oz, ox) - u.anvilHead;
      if (ox * ox + oz * oz > 150 * 150 && Math.cos(rel) > 0.5) want = 0;   // within 60 degrees of upwind
    }
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
  // the anvils: a storm's towers on the upwind horizon, rising with the storm
  for (const m of u.anvilMeshes) m.count = 0;
  if (u.anvilShown > 0.02) {
    const base = (w ? w.base : u.base) + 250, grow = Math.sqrt(u.anvilShown);
    for (const s of u.anvils) {
      const h = u.anvilHead + s.bearing, m = u.anvilMeshes[s.shape];
      // the shear: one wind aloft for them all, square to the upwind bearing and to its right (each anvil's long flat
      // top then runs level across a view upwind, not tilted by its own bearing), turned by its own turn
      const sx = -Math.sin(u.anvilHead), sz = Math.cos(u.anvilHead);
      _q.setFromAxisAngle(_up, Math.atan2(-sz, sx) + s.turn);
      const k = grow * s.scale;
      _m.compose(_p.set(cx + Math.cos(h) * s.dist, base, cz + Math.sin(h) * s.dist), _q, _s.set(k, k * (0.6 + 0.4 * grow), k));
      m.setMatrixAt(m.count++, _m);
    }
    for (const m of u.anvilMeshes) if (m.count) m.instanceMatrix.needsUpdate = true;
  }
}
