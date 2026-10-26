import * as THREE from 'three';
import { glslWaves, glslRipples, waveHeight, windWeights, windHeight, N as WAVE_DIRS, CHOP, CHOP_W, CHOP_PH } from './waves.js';
import { glslNoise } from './shading.js';
import * as Sky from './sky.js';
import { groundUniforms } from './terrain.js';

// Water in two parts that share one fragment shader:
//  - far field: static 10 m meshes, one per tile, carrying only the long swell, with a hole cut where the patch sits
//  - near patch: a 3.2 m grid following the canoe. Its long swell is bilinearly interpolated from the
//    same 10 m lattice nodes the far mesh uses (so the seam is exact) and short swell is added on top,
//    fading out toward the patch edge. Shore distance, water level, terrain height and ground cover come
//    from a sliding 256-cell atlas of the loaded tiles around the canoe.
// All shader arithmetic happens relative to a floating origin (the corner of the player's tile) so the
// sin() noise and the facet normals stay precise a hundred kilometres from the world origin.
//
// The look (docs/look.md; Firewatch's and The Witness's lakes): a deep clean colour graded by the real depth
// and the lake's clarity, lit by the same sun and sky as everything else; the sky mirrored by the angle of the
// reflected ray (the dome's own colours, read from the sky material), and with the reflections setting on the
// shore, the trees and the canoe mirrored from a quarter-resolution pass, blurred a little and broken by the
// wind ripples; a sun glint that sparkles at a low sun; a soft pale line and thin fading ripples where the
// water meets the land; the shared fog ramps over all of it, so the far water goes pale and flat with the far
// shore. Calm water is a smooth surface with the wind's ripples as fine normal detail, not visible geometry.
// In rain (uRain, from weather.js) drops ring the surface: expanding rings drawn as a tilt of the normal, two offset
// lattices of cells each with its own drop clock, so they break the mirror up near the canoe and roughen it further out.

const PATCH_HALF = 160;   // metres; multiple of the 10 m lattice
const PATCH_RES = 3.2;    // metres per vertex
const ATLAS = 256;        // cells (2.56 km) of shore distance, level, height and cover around the canoe
const ATLAS_SLACK = 48;   // re-centre once the canoe gets this close to the atlas edge
const FETCH_RING = 100;   // cons B: cells round the atlas the fetch's march runs on over (rebuildFetch)
const FETCH_ROWS = 48;    // cons B: atlas rows of the fetch marched a frame after the wind veers (fetchStep)
// The mirror pass (tunable live): its size as a fraction of the drawing buffer, how far out it draws trees (metres
// from the camera to the nearest edge of a bin's region; the fog has the far shore by then), and inside what
// distance a bin keeps its full geometry (beyond, the mirror draws the trees' far twin: a few big cards, which is
// all a blurred reflection can show)
export const REFLECTION = { scale: 0.25, reach: 1400, full: 120 };
// cons B (the owner, 2026-10-25: "hug the lee"): the lee. Off a shore the wind blows from, the water is sheltered for a
// few hundred metres: the fetch (open water upwind, rebuildFetch) is short, so the waves are small (waves.js windHeight)
// and the wind's fine ripples lie down too, a dark smooth band that mirrors the trees along the upwind shore, the way a
// lee reads from out on a windy lake. reach: the fetch (m) over which the ripples come back, from calm (their share in the
// lee) to all of them; drift: the share of the wind the canoe feels in the lee (player.js reads shelterAt).
export const LEE = { reach: [20, 260], calm: 0.22, drift: 0.35 };
// vegetation.js SPECIES indices that stand tall enough to mirror: the trees, the snags and the outcrops
const MIRRORED = new Set([0, 1, 2, 3, 4, 5, 8, 9, 16]);
// The wind's fine ripples (windRipples in the shader): six wavelengths, 0.11 m to 0.84 m, each heading off the wind
// by its own fan angle. A heading is drawn as the two nearest of RIP_DIRS fixed world directions (each wavelength's
// set turned by its own offset), crossfaded by the angle with their energy kept, so a veering wind moves only the
// weights. Each direction's phase at the patch centre is kept here in double precision from the world position and
// the clock, so neither the veer, nor the floating origin's jump at a tile crossing, nor hours of play moves a crest.
const RIPPLES = 6, RIP_DIRS = 16, RIP_STEP = (2 * Math.PI) / RIP_DIRS, TAU = 2 * Math.PI;
const RIP = Array.from({ length: RIPPLES }, (_, i) => {
  const k = TAU / (0.11 * Math.pow(1.5, i));
  return { k, w: Math.sqrt(9.81 * k + 7.4e-5 * k * k * k), fan: (((i * 0.618 + 0.2) % 1) - 0.5) * 1.9, off: (i * 0.618) % 1 };
});
// each fixed direction's own phase, so no two line up
const RIP_PH = Float64Array.from({ length: RIPPLES * RIP_DIRS }, (_, n) => { const s = Math.sin(n * 12.9898 + 4.1) * 43758.5453; return (s - Math.floor(s)) * TAU; });
const GUST_DRIFT = 1.6;   // m/s: the cat's paws drift downwind this fast
// The water column (the lake pass; docs/look.md). What comes up out of the water is two things: the bed (and the
// rocks, logs and weed on it), seen through the column, and the light the water itself scatters back, the veil.
//   the bed's tint  the light that reaches the bed and comes back up loses each colour at its own rate: red to the
//                   water itself, blue to the tannins a bog lake carries. Per metre of path (down to the bed and back
//                   up along the refracted view) each channel keeps exp(-K), K = 1.7 / Secchi x the lake's spectral
//                   shape (clear: green passes most, so the bed goes golden then green; stained: red passes most, so
//                   it goes amber then tea-brown) + the water's own red. Drawn as a multiply over what the opaque
//                   pass drew under the near patch (tintMaterial), so the cobbles, the logs and the weed take it too;
//                   the far water, past 160 m, folds its brightness into the veil instead.
//   the veil        how much of the bed the column hides: little in the first half of the Secchi depth, about half at
//                   it, nearly all by twice it (1 - exp(-veil x (path / Secchi)^veilPow), the path the refracted view's
//                   own); it shows the body colour, the colour deep water has looking straight down: a dark clean
//                   blue-green in a clear lake (deeper still where the column is many Secchi depths thick), tea in a
//                   stained one, lit by the sun and the sky fill like any surface.
// So in a clear lake the cobbles read through two or three metres of water and fade past the Secchi depth, and in a
// stained one the bed goes brown within a metre. Over all of it the surface mirrors the sky by Fresnel, so grazing
// views still mirror the shore and the far water still goes flat and pale with the fog.
// WATER_LOOK: the body colours (linear albedo; the light multiplies them) and the ice.
export const WATER_LOOK = {
  clear: new THREE.Color().setRGB(0.02, 0.078, 0.07),
  deep: new THREE.Color().setRGB(0.012, 0.054, 0.056),
  stain: new THREE.Color().setRGB(0.066, 0.05, 0.012),
  ice: new THREE.Color(0xf2f6fa),
};
// The column's shape (tunable live): transmit scales the bed's path (1 is the physical round trip; less keeps a
// shallow bed brighter under the game's fixed exposure), veil and veilPow shape the veil; the spectral shapes are
// K over its mean per channel, for a clear and for a stained lake, and the water's own absorption per metre.
export const COLUMN = {
  transmit: 0.32, veil: 0.75, veilPow: 1.5,
  clearSpec: new THREE.Vector3(1.1, 0.74, 1.16),
  stainSpec: new THREE.Vector3(0.5, 0.92, 1.58),
  waterAbs: new THREE.Vector3(0.25, 0.04, 0.01),
};

// round A-E (the owner, 2026-10-26: "fix Night water"): white water by night takes the water's own floor. Under a cloud
// deck at night the day cycle lifts the sky fill toward a cool grey glow (daycycle.js NIGHT_GLOW) so the shore and the
// hull never go black. The water's own surface takes that lift by what it is: mostly a mirror, it shows the dome by
// Fresnel (and the dome lifts far less than the fill), over a dark column. White foam took the whole lifted fill at its
// albedo and FOAM_GAIN, four to six times the water round it, so at 23:30 under cloud the hull's water line and the
// stern's eddy read pale blue-white, the brightest thing on the water. waterOwnLight is that surface's light toward the
// eye (v: unit, from the water up to the eye): the sky it mirrors (the dome's own zenith and horizon) by Fresnel, and
// the column's glow under the fill (body: the deep water's colour, lit as water.js lights it). White water's fill is
// that, NIGHT_GLOW.foam brighter, as far as the night floor is on (uFoamNight.x, the day cycle's night x deck), and
// never more than it was (glslFoamLight in wake.js, the whitecaps and the shore's lap here). The key (the sun, the moon)
// lights it as before.
export const glslWaterOwn = /* glsl */ `
  vec3 waterOwnLight(vec3 v, vec3 zenith, vec3 horizon, vec3 body, vec3 fill) {
    float c = clamp(v.y, 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
    return F * mix(horizon, zenith, smoothstep(0.0, 0.6, c)) + (1.0 - F) * body * fill * 1.9;
  }
  // the fill white water takes: the sky fill at the foam's gain by day; by night under the floor (night.x) the water's
  // own light night.y brighter (over the foam's albedo), never more than the day's rule gives
  vec3 foamFill(vec3 fill, float gain, vec2 night, vec3 own) {
    if (night.x <= 0.0) return fill * gain;
    return mix(fill * gain, min(fill * gain, own * (night.y / 0.84)), night.x);
  }
`;

// Everything that rides or stands on the surface shares this: the atlas lookups, the terrain surface
// (shaped in the shore band exactly as the terrain mesh is), the swell, and the swell as the water patch
// actually renders it. All positions are relative to the floating origin (uOrigin); world xz -> rel is
// `w - uOrigin`. Needs the uniforms from WaterSystem.surfaceUniforms().
export const glslSurface = /* glsl */ `
  uniform sampler2D uShoreTex, uHeightTex, uLevelTex, uCoverTex, uClarityTex, uFetchTex;
  uniform vec4 uAtlas;      // atlas origin x, z (relative to the floating origin), 1/cell, cells per side
  uniform vec2 uOrigin;     // floating origin, world xz
  uniform vec2 uPatchLocal; // water patch centre relative to the origin
  uniform float uPatchHalf, uPatchRes;
  ${glslWaves}
  ivec2 atlasCell(vec2 rel) { return clamp(ivec2(floor((rel - uAtlas.xy) * uAtlas.z)), ivec2(0), ivec2(int(uAtlas.w) - 1)); }
  float cellSample(sampler2D t, ivec2 c) { c = clamp(c, ivec2(0), ivec2(int(uAtlas.w) - 1)); return texelFetch(t, c, 0).r; }
  float bilinear(sampler2D t, vec2 rel) {
    vec2 f = (rel - uAtlas.xy) * uAtlas.z - 0.5;
    vec2 fi = floor(f), a = f - fi;
    ivec2 c = ivec2(fi);
    return mix(mix(cellSample(t, c), cellSample(t, c + ivec2(1, 0)), a.x), mix(cellSample(t, c + ivec2(0, 1)), cellSample(t, c + ivec2(1, 1)), a.x), a.y);
  }
  float terrainAt(vec2 rel) { return bilinear(uHeightTex, rel); }
  float levelAt(vec2 rel) { return cellSample(uLevelTex, atlasCell(rel)); }
  float clarityAt(vec2 rel) { return cellSample(uClarityTex, atlasCell(rel)); }
  float atlasLevel(vec2 rel) { return levelAt(rel); }
  float shoreAt(vec2 rel) { return bilinear(uShoreTex, rel); }
  // ground cover (r: grass cover, g: golden / burn) with its own bilinear filter; b holds the ground class,
  // a the moss weight (high nibble) and canopy shade (low nibble); the grass blends the terrain's own per-cell splat
  // from the bytes after each tile's four-byte cover (placement.js coverField, groundcover.js)
  vec2 coverAt(vec2 rel) {
    vec2 f = (rel - uAtlas.xy) * uAtlas.z - 0.5;
    vec2 fi = floor(f), a = f - fi;
    ivec2 c = ivec2(fi), m = ivec2(int(uAtlas.w) - 1);
    vec2 c00 = texelFetch(uCoverTex, clamp(c, ivec2(0), m), 0).rg, c10 = texelFetch(uCoverTex, clamp(c + ivec2(1, 0), ivec2(0), m), 0).rg;
    vec2 c01 = texelFetch(uCoverTex, clamp(c + ivec2(0, 1), ivec2(0), m), 0).rg, c11 = texelFetch(uCoverTex, clamp(c + ivec2(1, 1), ivec2(0), m), 0).rg;
    return mix(mix(c00, c10, a.x), mix(c01, c11, a.x), a.y);
  }
  int groundClassAt(vec2 rel) { return int(texelFetch(uCoverTex, atlasCell(rel), 0).b * 255.0 + 0.5); }
  // the terrain mesh reshapes the shore band from the distance field (see terrain-build.js shoreShape)
  float surfaceAt(vec2 rel) {
    float h = terrainAt(rel), sd = shoreAt(rel), a = abs(sd);
    if (a >= 9.0) return h;
    float target = levelAt(rel) + (sd > 0.0 ? 0.16 * sd : 0.12 * sd);
    return mix(h, target, 1.0 - smoothstep(4.5, 9.0, a));
  }
  // short swell exists only on the near patch; anything riding the water must fade it the same way
  float patchBorder(vec2 rel) { return 1.0 - smoothstep(uPatchHalf - 40.0, uPatchHalf - 6.0, max(abs(rel.x - uPatchLocal.x), abs(rel.y - uPatchLocal.y))); }
  // long swell at a lattice node: its height comes from the wind and the fetch (open water upwind) at that node
  float nodeWave(ivec2 c, float t) {
    vec2 np = uAtlas.xy + (vec2(c) + 0.5) / uAtlas.z;
    return lowWave(np, t) * 0.5 * windHeight(cellSample(uFetchTex, c)) * smoothstep(0.0, 25.0, -cellSample(uShoreTex, c));
  }
  float surfaceWave(vec2 rel, float t, float border, out float shore) {
    vec2 f = (rel - uAtlas.xy) * uAtlas.z - 0.5;
    vec2 fi = floor(f), a = f - fi;
    ivec2 c = ivec2(fi);
    float s00 = cellSample(uShoreTex, c), s10 = cellSample(uShoreTex, c + ivec2(1, 0));
    float s01 = cellSample(uShoreTex, c + ivec2(0, 1)), s11 = cellSample(uShoreTex, c + ivec2(1, 1));
    shore = mix(mix(s00, s10, a.x), mix(s01, s11, a.x), a.y);
    float low = mix(mix(nodeWave(c, t), nodeWave(c + ivec2(1, 0), t), a.x), mix(nodeWave(c + ivec2(0, 1), t), nodeWave(c + ivec2(1, 1), t), a.x), a.y);
    float chop = (0.03 + 0.2 * windHeight(bilinear(uFetchTex, rel))) * highWave(rel, t) + calmWave(rel, t);
    return low + chop * smoothstep(0.0, 8.0, -shore) * border;
  }
  // the swell as the water patch actually renders it: evaluated at the patch's own grid vertices and
  // interpolated between them, so floating things sit on the drawn surface, not the analytic one
  float renderedWave(vec2 rel, float t) {
    vec2 origin = uPatchLocal - vec2(uPatchHalf);
    vec2 f = (rel - origin) / uPatchRes;
    vec2 fi = floor(f), a = f - fi;
    vec2 p00 = origin + fi * uPatchRes;
    vec2 p10 = p00 + vec2(uPatchRes, 0.0), p01 = p00 + vec2(0.0, uPatchRes), p11 = p00 + vec2(uPatchRes);
    float s;
    float w00 = surfaceWave(p00, t, patchBorder(p00), s), w10 = surfaceWave(p10, t, patchBorder(p10), s);
    float w01 = surfaceWave(p01, t, patchBorder(p01), s), w11 = surfaceWave(p11, t, patchBorder(p11), s);
    return mix(mix(w00, w10, a.x), mix(w01, w11, a.x), a.y);
  }
`;

const vertHead = /* glsl */ `
  uniform float uTime, uIce;
  uniform mat4 uTextureMatrix;
  varying vec3 vLocal;        // position relative to the floating origin
  varying vec3 vWaveN;        // smooth surface normal from the swell itself, not from the triangle
  varying float vShore;
  varying float vDepth;
  varying float vClarity;
  varying vec4 vReflectUv;
  varying vec3 vCrest;        // x: wave height over the local wind-wave height, y: that height (damped near the shore),
                              // z: the wind-wave height the shore here takes (the most exposed water round it)
  varying float vLee;         // cons B: 0 in the lee (a short fetch upwind), 1 on open water (LEE)
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
  uniform vec2 uOrigin;
  uniform sampler2D uFetchTex;
  uniform vec4 uAtlas;
  attribute float aShore;
  attribute float aDepth;
  attribute float aClarity;
  void main() {
    vec2 rel = position.xz + (modelMatrix[3].xz - uOrigin);   // both exact multiples of 10 m: no rounding
    vShore = aShore;
    vDepth = aDepth;
    vClarity = aClarity;
    // fetch from the atlas where it covers this vertex (exactly what the patch's lattice nodes use), a middling default beyond
    vec2 ac = (rel - uAtlas.xy) * uAtlas.z;
    bool inAtlas = ac.x >= 0.0 && ac.y >= 0.0 && ac.x < uAtlas.w && ac.y < uAtlas.w;
    float fetch = inAtlas ? texelFetch(uFetchTex, ivec2(ac), 0).r : 400.0;
    float Hw = windHeight(fetch) * (1.0 - uIce);
    float damp = smoothstep(0.0, 25.0, -aShore) * 0.5 * Hw;
    float wave = lowWave(rel, uTime) * damp;
    // the shore's exposure: the fetch of the most open water beside it (a land vertex has none of its own)
    float reach = fetch;
    if (inAtlas) {
      ivec2 c = ivec2(ac), m = ivec2(int(uAtlas.w) - 1);
      reach = max(max(texelFetch(uFetchTex, clamp(c + ivec2(1, 0), ivec2(0), m), 0).r, texelFetch(uFetchTex, clamp(c - ivec2(1, 0), ivec2(0), m), 0).r),
        max(max(texelFetch(uFetchTex, clamp(c + ivec2(0, 1), ivec2(0), m), 0).r, texelFetch(uFetchTex, clamp(c - ivec2(0, 1), ivec2(0), m), 0).r), fetch));
    }
    vCrest = vec3(wave / max(0.05, 0.5 * Hw), Hw * smoothstep(0.0, 25.0, -aShore), windHeight(reach) * (1.0 - uIce));
    vLee = smoothstep(${LEE.reach[0].toFixed(1)}, ${LEE.reach[1].toFixed(1)}, reach);
    const float e = 5.0;
    float hL = lowWave(rel - vec2(e, 0.0), uTime) * damp, hR = lowWave(rel + vec2(e, 0.0), uTime) * damp;
    float hB = lowWave(rel - vec2(0.0, e), uTime) * damp, hF = lowWave(rel + vec2(0.0, e), uTime) * damp;
    vWaveN = normalize(vec3(hL - hR, 2.0 * e, hB - hF));
    vec3 objPos = vec3(position.x, position.y + wave, position.z);
    vec3 flatObj = position;
    vec3 local = vec3(rel.x, position.y + wave, rel.y);
` + vertTail;

const vertPatch = vertHead + glslSurface + /* glsl */ `
  void main() {
    vec2 rel = position.xz + uPatchLocal;
    float border = 1.0 - smoothstep(uPatchHalf - 40.0, uPatchHalf - 6.0, max(abs(position.x), abs(position.z)));
    float shore, s2;
    border *= (1.0 - uIce);
    float wave = surfaceWave(rel, uTime, border, shore) * (1.0 - uIce);
    vShore = shore;
    float Hw = windHeight(bilinear(uFetchTex, rel)) * (1.0 - uIce);
    // the shore's exposure: the fetch of the most open water within a cell (a land vertex has none of its own)
    ivec2 fc = atlasCell(rel);
    float reach = max(max(max(cellSample(uFetchTex, fc), cellSample(uFetchTex, fc + ivec2(1, 0))), max(cellSample(uFetchTex, fc - ivec2(1, 0)), cellSample(uFetchTex, fc + ivec2(0, 1)))), cellSample(uFetchTex, fc - ivec2(0, 1)));
    vCrest = vec3(wave / max(0.05, 0.5 * Hw), Hw * smoothstep(0.0, 25.0, -shore), windHeight(reach) * (1.0 - uIce));
    vLee = smoothstep(${LEE.reach[0].toFixed(1)}, ${LEE.reach[1].toFixed(1)}, reach);
    const float e = 1.6;
    float hL = surfaceWave(rel - vec2(e, 0.0), uTime, border, s2), hR = surfaceWave(rel + vec2(e, 0.0), uTime, border, s2);
    float hB = surfaceWave(rel - vec2(0.0, e), uTime, border, s2), hF = surfaceWave(rel + vec2(0.0, e), uTime, border, s2);
    vWaveN = normalize(vec3((hL - hR) * (1.0 - uIce), 2.0 * e, (hB - hF) * (1.0 - uIce)));
    float level = levelAt(rel);
    vDepth = max(0.0, level - surfaceAt(rel));   // the bed as the terrain mesh draws it (the shore band reshaped)
    vClarity = clarityAt(rel);
    vec3 objPos = vec3(position.x, level + wave, position.z);
    vec3 flatObj = vec3(position.x, level, position.z);
    vec3 local = vec3(rel.x, level + wave, rel.y);
` + vertTail;

// sky.js's sky by direction (skyGradient, skyGlow), or the same formula where sky.js does not export it
const SKY_GLSL = Sky.glslSky || /* glsl */ `
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

// The column (see WATER_LOOK above), shared by the surface and the tint pass. secchi: the lake's Secchi depth (m);
// cosI: the view's cosine off the surface normal.
const glslColumn = /* glsl */ `
  uniform vec3 uColumn;   // transmit, veil, veilPow
  uniform vec3 uSpecClear, uSpecStain, uWaterAbs;
  // No column is ever less than none. The depth comes in as a varying (0 at the shore, never below in the bake), but
  // under multisampling a pixel the triangle only partly covers is shaded at the pixel's centre, off the triangle,
  // and the varying runs on past its last vertex. Far off, where the whole shore band of the lattice is a sliver of
  // one pixel row, it runs on far below zero: the veil's pow of a negative base is NaN, the tint's exp grows past 1,
  // and the tone map burned the far waterline into a thin white line at night (4x samples; October 2026).
  // the refracted view's path through a column depth metres deep
  float columnPath(float depth, float cosI) {
    float s2 = (1.0 - cosI * cosI) / 1.7769;   // sin^2 of the refracted ray (n = 1.333)
    return max(depth, 0.0) / sqrt(max(1.0 - s2, 0.3));
  }
  // what the column passes of the bed's light, per channel: down to the bed and back up along the view
  vec3 columnTint(float depth, float path, float secchi) {
    vec3 K = (1.7 / secchi) * mix(uSpecStain, uSpecClear, smoothstep(1.5, 5.0, secchi)) + uWaterAbs;
    return exp(-K * max(depth + path, 0.0) * uColumn.x);
  }
  // how much of the bed the column hides
  float columnVeil(float path, float secchi) { return clamp(1.0 - exp(-uColumn.y * pow(max(path, 0.0) / secchi, uColumn.z)), 0.0, 0.985); }
  // the tint pass covers the near patch and gives out over its last 40 m (where the surface folds it into the veil)
  float tintReach(vec3 local, vec2 centre, float halfSize) { return 1.0 - smoothstep(halfSize - 40.0, halfSize - 6.0, max(abs(local.x - centre.x), abs(local.z - centre.y))); }
`;

// The tint pass: the column's per-channel transmission multiplied over the bed (and whatever else the opaque pass drew
// under the water) before the surface is laid over it; the near patch only.
const fragTint = /* glsl */ `
  uniform float uClarity, uIce, uPatchHalf;
  uniform vec2 uOrigin, uPatchLocal;
  varying vec3 vLocal;
  varying vec3 vWaveN;
  varying float vShore;
  varying float vDepth;
  varying float vClarity;
  ${glslColumn}
  void main() {
    if (vShore > 0.6) discard;
    vec3 camRel = vec3(cameraPosition.x - uOrigin.x, cameraPosition.y, cameraPosition.z - uOrigin.y);
    vec3 v = normalize(camRel - vLocal);
    float secchi = max(0.3, vClarity * uClarity);
    vec3 T = columnTint(vDepth, columnPath(vDepth, max(dot(normalize(vWaveN), v), 0.05)), secchi);
    gl_FragColor = vec4(mix(vec3(1.0), T, tintReach(vLocal, uPatchLocal, uPatchHalf) * (1.0 - uIce)), 1.0);
  }
`;

const frag = /* glsl */ `
  uniform float uTime, uReflOn, uClarity, uIce, uRippleAmt, uRain, uGlint;
  uniform vec3 uSunDir, uFoam, uSunLight, uSkyLight;
  uniform vec3 uBodyClear, uBodyDeep, uBodyStain, uBodyIce;
  const vec3 FOAM_ALBEDO = vec3(0.86, 0.9, 0.92);   // the white of the foam; FOAM_GAIN as wake.js glslFoamLight has it
  const float FOAM_GAIN = 2.0;
  uniform vec2 uFoamNight;   // round A-E: how far the night floor is on, and white water's lift over the water (glslWaterOwn)
  ${glslWaterOwn}
  ${glslColumn}
  uniform vec3 uSkyZenith, uSkyMid, uSkyHorizon, uSkySun, uSkySunDir;
  #ifdef SKY_LIFT
    uniform vec3 uSkyGlow;   // amount, power, how far the warm bands rise toward the sun
  #else
    uniform vec2 uSkyGlow;
  #endif
  uniform vec2 uOrigin, uReflTexel, uGustOff, uWindDir; // (uWindDir: the whitecaps' patches drift downwind)
  uniform float uDirW[${WAVE_DIRS}];   // (the chop's weights by direction: the whitecaps break on its crests)
  uniform vec4 uRip[${RIPPLES * 2}];
  uniform sampler2D uReflection;
  uniform vec2 uPatchLocal;
  uniform float uPatchHalf;
  varying vec3 vLocal;
  varying vec3 vWaveN;
  varying float vShore;
  varying float vDepth;
  varying float vClarity;
  varying vec4 vReflectUv;
  varying vec3 vCrest;
  varying float vLee;
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <shadowmap_pars_fragment>
  ${glslRipples}
  ${glslNoise}
  // The sky the surface mirrors, by the reflected ray: the dome's own stops and the low sun's glow, with sky.js's
  // own functions where it exports them (glslSky), else the same formula here
  ${SKY_GLSL}
  vec3 skyAt(vec3 d) {
    d.y = max(d.y, 0.0);
    #ifdef SKY_LIFT
      return skyGradient(d, uSkyZenith, uSkyMid, uSkyHorizon, uSkySunDir, uSkyGlow.z) + skyGlow(d, uSkySunDir, uSkySun, uSkyGlow.xy);
    #else
      return skyGradient(d, uSkyZenith, uSkyMid, uSkyHorizon, uSkySunDir, 0.0) + skyGlow(d, uSkySunDir, uSkySun, uSkyGlow.xy);
    #endif
  }
  // The wind's ripples as a tilt of the normal (x, z): six short waves, 0.1 to 0.85 m long, fanned about the wind
  // and drifting with it, their crests wandered by a slow warp; each fades out before it would alias (px: metres
  // per pixel). Each wave is two fixed world directions either side of its heading (uRip, see WaterSystem.update:
  // the direction, its phase at the patch centre kept on the CPU, its weight), so a veering wind moves weights,
  // never crests, and a tile crossing moves nothing. pw is the world position, for the noise. rough: a slow field
  // drifting downwind, the cat's paws where a gust touches the water (uGustOff: the origin less the drift).
  vec2 windRipples(vec2 p, vec2 pw, float px, out float rough) {
    rough = smoothstep(0.36, 0.68, lookFbm((p + uGustOff) * 0.03, 5u, 2));
    vec2 tilt = vec2(0.0);
    if (lookFade(0.84, px) <= 0.0) return tilt;   // too far for the longest of them
    float warp = 5.0 * lookNoise(pw * 0.37, 7u);
    vec2 c = p - uPatchLocal;   // the phases are kept at the patch centre: small numbers here
    for (int i = ${RIPPLES - 1}; i >= 0; i--) {
      float fi = float(i);
      float L = 0.11 * pow(1.5, fi);
      float fade = lookFade(L, px);
      if (fade <= 0.0) break;   // the shorter ones are gone too
      float k = 6.2831853 / L, wph = warp * (0.6 + 0.25 * fi);
      vec4 a = uRip[i * 2], b = uRip[i * 2 + 1];
      tilt += (a.xy * (a.w * cos(k * dot(c, a.xy) + a.z + wph)) + b.xy * (b.w * cos(k * dot(c, b.xy) + b.z + wph))) * (0.07 * fade);
    }
    return tilt;
  }
  // Rain on the water: each cell of a lattice (two of them, offset and of different sizes) holds one drop at a time,
  // landing at a random place in the cell on its own clock; its ring runs outward and dies. Returned as a tilt of the
  // normal (x, z) like windRipples; amount 0..1 thins the drops (a cell sits out a cycle when its hash is over it).
  vec2 rainRings(vec2 pw, float px, float amount) {
    vec2 tilt = vec2(0.0);
    for (int k = 0; k < 2; k++) {
      float cell = k == 0 ? 0.55 : 0.8;
      float fade = lookFade(cell * 0.35, px);
      if (fade <= 0.0) continue;
      vec2 g = pw / cell + (k == 0 ? vec2(0.0) : vec2(0.37, 0.71));
      vec2 id = floor(g), f = g - id - 0.5;
      ivec2 c = ivec2(id);
      float rate = k == 0 ? 1.45 : 1.1;
      float clock = uTime * rate + lookHash(c, 31u + uint(k));
      float t = fract(clock);
      uint cyc = uint(mod(floor(clock), 4096.0));
      float h = lookHash(c + ivec2(int(cyc), 0), 57u + uint(k));
      if (h > amount) continue;
      vec2 at = vec2(lookHash(c + ivec2(int(cyc), 7), 3u), lookHash(c + ivec2(int(cyc), 13), 5u)) - 0.5;
      vec2 d = f - at * 0.36;
      float r = length(d);
      float x = (r - t * 0.34) / 0.045;   // across the ring, in ring widths
      float wave = -x * exp(-x * x);      // the slope of a crest
      tilt += d / max(r, 1e-4) * wave * (1.0 - t) * (1.0 - t) * fade * 0.55;
    }
    return tilt;
  }
  // cons B, redrawn at the join (the brief: the whitecaps read as flat white ovals; "short foam streaks along the wave
  // crests, oriented across the wind, which appear at the crest, run briefly and fade"). The near whitecaps break on
  // the chop's own crests (waves.js CHOP, the phases the vertices draw): each direction that carries a good share of
  // the wind's waves has its crests cut into 7 m cells, and on its own 4 s clock the cell's stretch of crest may
  // break (more often the harder it blows): for 1.3 s a white line 2.5 to 5 m long rides the crest, spilling a little
  // down its front, ragged and thinning to its ends; the foam it lays lies where it fell, streaked along the crest,
  // and fades in a few tenths of a second as the crest runs on. share: this direction's weight against the strongest (the odd one breaks on a minor direction); streak: a
  // noise drawn out across the wind, which breaks the laid foam into streaks.
  float crestFoam(vec2 p, vec2 pw, vec2 k, float ph, float share, float blow, float streak, float px) {
    float kl = length(k), L = 6.2831853 / kl, c = ${CHOP_W.toFixed(6)} / kl;   // wavelength, the crest's speed
    vec2 u = k / kl;
    float cyc = (dot(p, k) + ph - ${CHOP_W.toFixed(6)} * uTime - 1.5707963) * 0.15915494;   // crests at whole numbers
    float n = floor(cyc + 0.85), s = (cyc - n) * L;   // the crest just passed (up to 0.85 L back) or about to, and metres ahead of it
    n += floor(dot(uOrigin, k) * 0.15915494 + 0.5);   // its own number, the same from any floating origin
    float bm = dot(pw, vec2(-u.y, u.x)), b = bm * ${(1 / 7.0).toFixed(6)}, j = floor(b);
    ivec2 id = ivec2(int(n), int(j));
    float clock = uTime * 0.25 + lookHash(id, 61u);
    float age = fract(clock) * 4.0;
    int cy = int(mod(floor(clock), 4096.0));
    ivec2 ic = id + ivec2(cy, 3 * cy);
    if (lookHash(ic, 67u) > (0.08 + 0.62 * blow) * share * share) return 0.0;
    // a breaking crest is never ruled straight: it wanders a hand's width either way along its length
    s += 0.22 * (lookNoise(vec2(bm * 0.9, n * 3.7), 83u) - 0.5);
    float since = max(-s, 0.0) / c;   // seconds since the crest passed here (0 on it and ahead)
    float td = age - since;           // the break's age when it passed
    if (td < 0.0 || td > 1.3) return 0.0;
    float env = smoothstep(0.0, 0.18, td) * (1.0 - smoothstep(0.75, 1.3, td));
    // along the crest: the segment's middle and half-length (in cells), spreading as it breaks; x runs -1..1 over it
    float hl = (0.18 + 0.16 * lookHash(ic, 73u)) * (0.8 + 0.25 * blow) * (0.45 + 0.55 * smoothstep(0.0, 0.6, td));
    float x = (b - j - 0.5 - (lookHash(ic, 71u) - 0.5) * 0.2) / hl;   // (inside its cell: no end cut by a cell's edge)
    x += 0.4 * (lookNoise(vec2(bm * 1.1, s * 1.5 + n * 5.1), 97u) - 0.5);   // ragged ends
    float body = 1.0 - x * x;   // thickest mid-way, thinning to nothing at the ends
    if (body <= 0.0) return 0.0;
    // across it: a sharp spill just ahead of the crest, its width the body's, and behind it the foam laid, streaked,
    // thinner and older further back, the ends of the break laying less
    float soft = 0.04 + px;
    float froth = lookNoise(vec2(bm * 2.2, s * 4.0 - n * 1.3), 101u);   // (a breaking face is froth, not paint)
    float reach = 0.45 * body * (0.5 + 0.9 * froth);                    // (what a canoe looking upwind sees of it)
    float front = 1.0 - smoothstep(reach - soft, reach + soft, s);
    float laid = exp(-since * (4.0 + 4.0 * (1.0 - body))) * mix(0.62 + 0.38 * froth, 0.12 + 0.45 * streak, smoothstep(0.02, 0.12, since));
    laid *= 1.0 - smoothstep(0.4, 0.6, -s / L);
    return env * front * laid * smoothstep(0.0, 0.55, body);
  }
  void main() {
    #ifdef FAR
      if (abs(vLocal.x - uPatchLocal.x) < uPatchHalf && abs(vLocal.z - uPatchLocal.y) < uPatchHalf) discard;
    #else
      if (vShore > 0.6) discard;
    #endif
    float shore = -vShore;   // metres out from the shore
    float live = 1.0 - uIce;
    vec3 camRel = vec3(cameraPosition.x - uOrigin.x, cameraPosition.y, cameraPosition.z - uOrigin.y);
    vec3 toEye = camRel - vLocal;
    float dist = max(length(toEye), 1e-3);
    vec3 v = toEye / dist;
    float px = max(max(fwidth(vLocal.x), fwidth(vLocal.z)), 1e-4);
    float shadow = 1.0;
    #if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
      shadow = getSunShadow(sunShadowMap[0], sunLightShadows[0], 0); // the sun's two cascades (sunlight.js)
    #elif defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      shadow = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowIntensity, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
    #endif
    // the normal: the swell's own (smooth, from the vertices), tilted by the wind's fine ripples
    float rough;
    vec2 pw = vLocal.xz + uOrigin;   // world xz, for the noise (a lattice relative to the origin would jump with it)
    vec2 tilt = windRipples(vLocal.xz, pw, px, rough) * uRippleAmt * mix(0.3, 1.0, rough) * live * smoothstep(-0.3, 2.5, shore)
      * mix(${LEE.calm.toFixed(3)}, 1.0, vLee);   // cons B: the lee lies smooth
    if (uRain > 0.0) tilt += rainRings(pw, px, uRain) * live;
    vec3 n0 = normalize(vWaveN);
    vec3 n = normalize(n0 - vec3(tilt.x, 0.0, tilt.y));
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);   // Schlick: a fifth looking down beside the canoe, nearly all at the far shore
    // the column (WATER_LOOK): the veil over the bed along the refracted view, and the body colour it shows, from the
    // lake's own Secchi depth; lit by the sun (in the shadows' shade) and the sky fill like any lit surface. The tint
    // pass has already multiplied the column's colour into the bed under the near patch; past it (and over the patch's
    // last metres, where that pass gives out) the column's darkening of the bed is folded into the veil instead.
    float secchi = max(0.3, vClarity * uClarity);
    float clear = smoothstep(1.5, 5.0, secchi);
    float path = columnPath(vDepth, max(dot(n0, v), 0.05));
    float ab = columnVeil(path, secchi);
    #ifdef FAR
      float folded = 1.0;
    #else
      float folded = 1.0 - tintReach(vLocal, uPatchLocal, uPatchHalf);
    #endif
    if (folded > 0.0) ab = 1.0 - (1.0 - ab) * mix(1.0, dot(columnTint(vDepth, path, secchi), vec3(0.3, 0.5, 0.2)), folded);
    vec3 body = mix(uBodyStain, mix(uBodyClear, uBodyDeep, smoothstep(0.8, 3.0, vDepth / secchi)), clear);
    vec3 lit = uSunLight * max(uSunDir.y, 0.0) * shadow + uSkyLight;
    body *= lit * 1.9;   // light reaches the column from the whole sky and the sun, not one direction
    // the mirror: the sky by the reflected ray, and over it what the reflection pass drew (shore, trees, canoe),
    // pushed about by the ripples, smeared up and down where the surface is rough, a little blurred
    vec3 R = reflect(-v, n);
    R.y = abs(R.y);
    vec3 sky = skyAt(normalize(R));
    vec4 refl = vec4(0.0);
    if (uReflOn > 0.5) {
      vec2 uv = vReflectUv.xy / vReflectUv.w + (n.xz - n0.xz * 0.5) * (0.012 + 1.2 / dist);
      // the roughness the ripples no longer resolve far off still smears the image: a breeze blurs the far
      // shore's reflection into a soft band, a blow all but wipes it
      float unresolved = min(1.0, uRippleAmt * mix(${LEE.calm.toFixed(3)}, 1.0, vLee) + uRain * 0.6) * (1.0 - lookFade(0.84, px));
      vec2 tx = uReflTexel * vec2(1.0 + 3.0 * unresolved, 1.0 + 10.0 * length(tilt) + 9.0 * unresolved);
      refl = texture2D(uReflection, uv) * 0.36
        + texture2D(uReflection, uv + tx * vec2(1.1, 0.7)) * 0.16 + texture2D(uReflection, uv - tx * vec2(1.1, 0.7)) * 0.16
        + texture2D(uReflection, uv + tx * vec2(-0.6, 2.0)) * 0.16 + texture2D(uReflection, uv - tx * vec2(-0.6, 2.0)) * 0.16;
    }
    float ra = refl.a;
    vec3 mirrored = refl.rgb / max(ra, 1e-3);   // the pass clears to transparent black: its colour comes premultiplied
    // the sun's glint, wherever a ripple mirrors the sun into the eye: at a low sun a path of sparkles across the
    // water toward it with a soft sheen under them, at noon a faint sheen; never where the shore hides the sun
    vec3 H = normalize(uSunDir + v);
    float nh = max(dot(n, H), 0.0);
    float low = 1.0 - smoothstep(0.1, 0.6, uSunDir.y);
    float glint = (pow(nh, 1200.0) * 30.0 * smoothstep(0.0, 0.6, length(tilt) * 8.0) + pow(nh, 120.0) * 0.5 * low) * mix(0.05, 1.0, low) * step(0.0, uSunDir.y);
    vec3 G = uSunLight * 3.14159 * glint * shadow * live * (1.0 - ra) * uGlint;
    // the surface: what the mirror shows (F) over what comes out of the water (1 - F); the bed shows through what
    // the column lets by. Composed for plain alpha blending over the bed the terrain drew: colour / A, alpha A.
    // The fog lies over all of it except the mirrored shore, which its own pass already hazed along the whole path.
    float A = F + (1.0 - F) * ab;
    float wObj = F * ra;
    vec3 rest = (F * (1.0 - ra) * sky + (1.0 - F) * ab * body + G) / max(A - wObj, 1e-4);
    #ifdef USE_FOG
      rest = fogApply(rest, vFogDir);
    #endif
    vec3 col = mix(rest, mirrored, wObj / max(A, 1e-4));
    // the shore: where the wind raises a lap, a pale broken line where it runs up the beach and the rock, its width
    // breathing with the lap, and thin ripple lines rolling in that fade under a pixel and with distance. Both come
    // with the wind-waves this shore takes (vCrest.z, from the wind and the fetch of the water beside it): nothing on
    // calm water or a sheltered shore (no white rim on a still lake), a broken lap line on a windward shore in a
    // breeze, a fuller one in a blow.
    vec2 p = vLocal.xz;
    float expose = smoothstep(0.08, 0.5, vCrest.z);
    float edgeA = 0.0, lineA = 0.0;
    float cycle = shore * 0.8 + uTime * 0.55 + 0.25 * sin(dot(p, RIP3) + uTime * 0.4);
    float fw = max(fwidth(cycle), 1e-4);   // outside the branch: derivatives want every pixel of the quad
    // the shore distance's slope (1 by a real shore): where it flattens (the middle of a narrow channel) a contour
    // line would smear into a broad stripe, so the lines give out there
    vec2 ex = dFdx(vLocal.xz), ey = dFdy(vLocal.xz);
    float sx = dFdx(shore), sy = dFdy(shore), det = ex.x * ey.y - ex.y * ey.x;
    float slope = abs(det) > 1e-9 ? length(vec2(sx * ey.y - sy * ex.y, sy * ex.x - sx * ey.x) / det) : 1.0;
    if (shore < 3.5 && expose > 0.002) {
      float edgeN = lookNoise(pw * 0.45 + uTime * 0.04, 11u);
      float lap = 0.5 + 0.5 * sin(uTime * 0.8 + dot(p, RIP3) * 0.5);
      float edge = 1.0 - smoothstep(0.0, (0.2 + 0.6 * edgeN + 0.35 * lap) * (0.35 + 0.9 * expose), shore);
      // broken along the shore by a slow drifting noise, closing up as the wind rises
      float broken = smoothstep(0.62 - 0.45 * expose, 0.78 - 0.3 * expose, lookNoise(pw * vec2(0.23, 0.31) + vec2(uTime * 0.07, -uTime * 0.05), 29u));
      edgeA = edge * edge * 0.42 * expose * broken;
      // The ripple lines: contours of the shore distance rolling in, each broken into short dashes a metre or three
      // long (a noise a couple of metres across, its own for each line, so a dash keeps its length as it rolls in
      // and dies at the beach), only in the last few metres of water, fading out away from the shore and the eye.
      // The distance field is a 10 m lattice interpolated: a few metres out its contours run on as long strings
      // past the waterline, so the lines stop there; and where its slope falls off a true distance (a channel's
      // middle, a lattice cell's flat) they give out too.
      float phase = fract(cycle), lineNo = floor(cycle);
      float dash = lookNoise(pw * 0.6 + vec2(lineNo * 7.31, lineNo * 3.17), 23u);
      dash = smoothstep(0.57, 0.69, dash) * (0.75 + 0.25 * sin(dot(p, RIP1) * 0.7 + uTime * 0.25 + lineNo * 2.4));
      // a crest about 8 cm across (0.065 of a cycle), its edges a pixel soft; it fades as it narrows under a pixel
      float line = smoothstep(0.85 - fw, 0.85 + fw, phase) * (1.0 - smoothstep(0.915 - fw, 0.915 + fw, phase));
      lineA = line * 0.34 * dash * smoothstep(0.55, 0.85, slope) * smoothstep(0.6, 1.6, 0.065 / fw) * (1.0 - smoothstep(9.0, 30.0, dist))
        * smoothstep(0.1, 0.5, shore) * (1.0 - smoothstep(1.0, 2.8, shore)) * (1.0 - smoothstep(0.8, 2.0, vDepth)) * smoothstep(0.15, 0.7, expose);
    }
    // whitecaps: once the wind has raised real waves their crests break: the odd one in a fresh breeze (a wind-wave height
    // of about 0.25 m), many in a blow (0.6 m and up, a near gale over open water). The swell's height is bilinear
    // between its lattice nodes, so a crest is a broad blob: a cap is a patch a metre or two across on it, picked by a
    // noise drifting downwind, never the whole crest at once (polish A: the old thresholds showed none under 0.6 m)
    // cons B (the owner, 2026-10-25: "read the lake: whitecaps"): more of them the harder it blows, so a lake in a blow
    // reads white-flecked from the canoe and from the shore, and far off a coarser field of patches (the fine one only
    // sparkles once a pixel is a few centimetres): at blow 1 about a crest in six breaks, at a breeze the odd one
    float blow = smoothstep(0.18, 0.7, vCrest.y);
    float capFar = smoothstep(0.08, 0.35, px);   // (where a breaker would be under a few pixels)
    // near: crests breaking (crestFoam), on the chop directions that carry the wind's waves, more on the swell's tops
    float capNear = 0.0;
    if (blow > 0.001 && capFar < 0.999) {
      float wmax = 1e-4;
      for (int i = 0; i < ${WAVE_DIRS}; i++) wmax = max(wmax, uDirW[i]);
      vec2 wa = vec2(-uWindDir.y, uWindDir.x);
      float streak = smoothstep(0.38, 0.66, lookNoise(vec2(dot(pw, wa) * 0.9, dot(pw, uWindDir) * 3.2), 79u) * 0.65 + lookNoise(vec2(dot(pw, wa) * 2.3, dot(pw, uWindDir) * 7.0), 89u) * 0.35);
      ${CHOP.map((k, i) => `{ float sh = uDirW[${i}] / wmax; if (sh > 0.25) capNear = max(capNear, crestFoam(p, pw, vec2(${k[0].toFixed(9)}, ${k[1].toFixed(9)}), ${CHOP_PH[i].toFixed(4)}, sh, blow, streak, px)); }`).join('\n      ')}
      capNear *= mix(1.0, smoothstep(-0.2, 0.5, vCrest.x), 0.5) * smoothstep(0.0, 0.2, blow);
    }
    // far: what a pixel there averages of them, a fleck field on a finer noise, more of it the harder it blows
    // (drawn out across the wind, as the breaking crests are: streaks, not blobs)
    vec2 wq = vec2(dot(pw, vec2(-uWindDir.y, uWindDir.x)) * 0.32, (dot(pw, uWindDir) - uTime * 0.6) * 1.15);
    float capFarV = smoothstep(0.64 - 0.12 * blow, 0.76 - 0.1 * blow, lookNoise(wq, 37u))
      * smoothstep(0.1 - 0.2 * blow, 0.6, vCrest.x) * (0.16 + 0.3 * blow);
    // (seen low over the water a cap stands up off the face of its wave, where a flat patch would lie under a pixel: far
    // off and at a grazing look they count for more)
    capFarV *= mix(1.0, 2.6, smoothstep(0.35, 0.06, dot(normalize(vWaveN), v)));
    float cap = min(1.0, mix(capNear * 0.95, capFarV * blow * (0.6 + 0.4 * sin(dot(p, RIP1) * 3.0 + uTime * 1.7)) * 0.9, capFar));
    float foam = max(max(edgeA, lineA), cap) * live;
    // white water lit as the splashes and the rise rings are (wake.js foamLight): the key by its height in the sun's
    // shadow and the sky fill, so it greys at dusk and is dark at night instead of keeping the day's white; round A-E: by
    // night under the floor its fill is the water's own light (glslWaterOwn), so a whitecap or the lap never outshines it
    vec3 fillC = uSkyLight * FOAM_GAIN;
    if (foam > 0.002 && uFoamNight.x > 0.0) fillC = foamFill(uSkyLight, FOAM_GAIN, uFoamNight, waterOwnLight(v, uSkyZenith, uSkyHorizon, uBodyDeep, uSkyLight));
    vec3 foamC = FOAM_ALBEDO * (uSunLight * max(uSunDir.y, 0.0) * shadow * FOAM_GAIN + fillC);
    #ifdef USE_FOG
      if (foam > 0.002) foamC = fogApply(foamC, vFogDir);
    #endif
    float outA = foam + A * (1.0 - foam);
    vec3 outC = (foamC * foam + col * A * (1.0 - foam)) / max(outA, 1e-4);
    // frozen over: a pale sheet lit like the snow, a little of the sky in it, no swell, ripples or foam
    if (uIce > 0.0) {
      vec3 ice = mix(uBodyIce * (uSunLight * max(uSunDir.y, 0.0) * shadow + uSkyLight) * 1.2, sky, F * 0.4);
      #ifdef USE_FOG
        ice = fogApply(ice, vFogDir);
      #endif
      outC = mix(outC, ice, uIce); outA = mix(outA, 0.985, uIce);
    }
    gl_FragColor = vec4(outC, outA);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const REFLECT_LAYER = 1;

export const REFLECT_SHORE_LAYER = 2; // terrain, trees and outcrops, put on it as their tiles come in (tagTiles)

export class WaterSystem {
  // env: what the water reads by reference every frame, so whatever drives them flows through: the sky dome's
  // uniforms (its stops, glow and sun, mirrored by the reflected ray), the sun, the sky fill and the moon (the
  // light the water column sends back). Without them the water falls back to the palette and a fixed light.
  constructor(world, sunDir, palette, env = {}) {
    this.world = world;
    this.time = 0;
    this.origin = { x: world.originX, z: world.originZ };
    this.reflection = new WaterReflection(4, 4);
    this.reflectionsOn = true;
    this.env = env;
    this._mirrored = [];   // tree and outcrop meshes on the shore layer, for the mirror pass's LOD
    this._saved = [];
    this._sweep = 0;
    this.shore = new Float32Array(ATLAS * ATLAS);
    this.level = new Float32Array(ATLAS * ATLAS);
    this.height = new Float32Array(ATLAS * ATLAS);
    this.clarity = new Float32Array(ATLAS * ATLAS);
    this.fetch = new Float32Array(ATLAS * ATLAS);
    this.cover = new Uint8Array(ATLAS * ATLAS * 4);
    this.wind = { x: 0, z: 1, speed: 2.5, bucket: -1, w: windWeights(0, 1) };
    this.gustDrift = { x: 0, z: 0 };   // how far the cat's paws have drifted downwind (world metres, integrated)
    this.atlasI = NaN; this.atlasJ = NaN; this.atlasDirty = true;
    const tex = (data, format, type) => { const t = new THREE.DataTexture(data, ATLAS, ATLAS, format, type); t.minFilter = t.magFilter = THREE.NearestFilter; return t; };
    this.shoreTex = tex(this.shore, THREE.RedFormat, THREE.FloatType);
    this.levelTex = tex(this.level, THREE.RedFormat, THREE.FloatType);
    this.heightTex = tex(this.height, THREE.RedFormat, THREE.FloatType);
    this.clarityTex = tex(this.clarity, THREE.RedFormat, THREE.FloatType);
    this.fetchTex = tex(this.fetch, THREE.RedFormat, THREE.FloatType);
    this.coverTex = tex(this.cover, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights, {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone() },
      uFoam: { value: new THREE.Color(0xf2f6f6) },
      uClarity: { value: 1.0 },
      uIce: { value: 0 },
      uStain: { value: new THREE.Color(1.0, 0.74, 0.4) },
      uReflection: { value: null },
      uReflOn: { value: 0 },
      uTextureMatrix: { value: new THREE.Matrix4() },
      uOrigin: { value: new THREE.Vector2(this.origin.x, this.origin.z) },
      uPatchLocal: { value: new THREE.Vector2(1e9, 1e9) },
      uPatchHalf: { value: PATCH_HALF },
      uPatchRes: { value: PATCH_RES },
      uShoreTex: { value: null },
      uLevelTex: { value: null },
      uHeightTex: { value: null },
      uClarityTex: { value: null },
      uCoverTex: { value: null },
      uFetchTex: { value: null },
      uDirW: { value: new Float32Array(WAVE_DIRS) },
      uWindSpeed: { value: 2.5 },
      uAtlas: { value: new THREE.Vector4(0, 0, 1 / world.cell, ATLAS) },
      uRippleAmt: { value: 0.3 },
      uRain: { value: 0 },   // drops on the surface, 0..1 (weather.js)
      uGlint: { value: 1 },  // the sun's glint, 0..1: cloud over the sun takes it (weather.js)
      uWindDir: { value: new THREE.Vector2(0, 1) },
      uRip: { value: new Float32Array(RIPPLES * 2 * 4) },
      uGustOff: { value: new THREE.Vector2(this.origin.x, this.origin.z) },
      uReflTexel: { value: new THREE.Vector2(1 / 4, 1 / 4) },
      uSunLight: { value: new THREE.Color(0.6, 0.55, 0.45) },
      uSkyLight: { value: new THREE.Color(0.15, 0.2, 0.28) },
      uFoamNight: { value: new THREE.Vector2(0, 1) },   // round A-E: the day cycle writes it (glslWaterOwn)
      uBodyClear: { value: WATER_LOOK.clear },
      uBodyDeep: { value: WATER_LOOK.deep },
      uBodyStain: { value: WATER_LOOK.stain },
      uBodyIce: { value: WATER_LOOK.ice },
      uSkyZenith: { value: new THREE.Color(palette.zenith) },
      uSkyMid: { value: new THREE.Color(palette.horizon).lerp(new THREE.Color(palette.zenith), 0.5) },
      uSkyHorizon: { value: new THREE.Color(palette.horizon) },
      uSkySun: { value: new THREE.Color(palette.sun) },
      uSkyGlow: { value: new THREE.Vector2(0.1, 8) },
      uSkySunDir: { value: sunDir.clone() },
    }]);
    // the dome's uniforms by reference (the same objects the day cycle writes): the reflected sky is the sky
    const su = env.sky;
    if (su) {
      const bind = { uSkyZenith: 'uZenith', uSkyMid: 'uMid', uSkyHorizon: 'uHorizon', uSkySun: 'uSunColor', uSkyGlow: 'uGlow', uSkySunDir: 'uSunDir' };
      for (const [mine, theirs] of Object.entries(bind)) if (su[theirs]) this.uniforms[mine] = su[theirs];
    }
    // the look's colours are shared objects too, so WATER_LOOK can be tuned live
    const look = { uBodyClear: 'clear', uBodyDeep: 'deep', uBodyStain: 'stain', uBodyIce: 'ice' };
    for (const [k, name] of Object.entries(look)) this.uniforms[k].value = WATER_LOOK[name];
    // and the column's shape (COLUMN), the same way
    this.uniforms.uColumn = { value: new THREE.Vector3(COLUMN.transmit, COLUMN.veil, COLUMN.veilPow) };
    this.uniforms.uSpecClear = { value: COLUMN.clearSpec };
    this.uniforms.uSpecStain = { value: COLUMN.stainSpec };
    this.uniforms.uWaterAbs = { value: COLUMN.waterAbs };
    this.uniforms.uReflection.value = this.reflection.target.texture;
    this.uniforms.uShoreTex.value = this.shoreTex;
    this.uniforms.uLevelTex.value = this.levelTex;
    this.uniforms.uHeightTex.value = this.heightTex;
    this.uniforms.uClarityTex.value = this.clarityTex;
    this.uniforms.uCoverTex.value = this.coverTex;
    this.uniforms.uFetchTex.value = this.fetchTex;
    this.uniforms.uDirW.value.set(this.wind.w);
    this.uniforms.uTextureMatrix.value = this.reflection.textureMatrix;
    const lift = this.uniforms.uSkyGlow.value.isVector3 ? { SKY_LIFT: 1 } : {};
    const common = { fragmentShader: frag, uniforms: this.uniforms, transparent: true, depthWrite: true, fog: true, lights: true };
    this.farMaterial = new THREE.ShaderMaterial({ ...common, vertexShader: vertFar, defines: { FAR: 1, ...lift } });
    this.patchMaterial = new THREE.ShaderMaterial({ ...common, vertexShader: vertPatch, defines: { ...lift } });
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
    // the tint pass (glslColumn): the same patch, drawn just before it, multiplying the column's colour into what the
    // opaque pass left under the water; it rides with the patch as its child
    this.tintMaterial = new THREE.ShaderMaterial({ ...common, vertexShader: vertPatch, fragmentShader: fragTint, defines: { ...lift },
      depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
    this.tint = new THREE.Mesh(geo, this.tintMaterial);
    this.tint.frustumCulled = false;
    this.tint.renderOrder = 9;
    this.patch.add(this.tint);
  }

  // A tile's far water mesh (see water-build.js), in tile-local coordinates.
  makeFarMesh(res) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(res.pos, 3));
    geo.setAttribute('aShore', new THREE.BufferAttribute(res.shore, 1));
    geo.setAttribute('aDepth', new THREE.BufferAttribute(res.depth, 1));
    geo.setAttribute('aClarity', new THREE.BufferAttribute(res.clarity, 1));
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

  // The atlas is built again on the next update; given a block of cells (i0, j0, n on a side: a tile coming or going),
  // only if the block lies inside it (a tile streaming in at the edge of the neighbourhood is beyond it).
  invalidateAtlas(i0, j0, n) {
    if (n === undefined || Number.isNaN(this.atlasI)) { this.atlasDirty = true; return; }
    if (i0 < this.atlasI + ATLAS && i0 + n > this.atlasI && j0 < this.atlasJ + ATLAS && j0 + n > this.atlasJ) this.atlasDirty = true;
  }

  update(dt, cx, cz) {
    this.time += dt;
    this.fetchStep(); // cons B
    this.uniforms.uTime.value = this.time;
    this.uniforms.uColumn.value.set(COLUMN.transmit, COLUMN.veil, COLUMN.veilPow);
    // the bed's caustics (terrain.js) run on the water's clock and the sun the day cycle gives the water
    groundUniforms.uBedTime.value = this.time;
    groundUniforms.uBedSun.value.copy(this.uniforms.uSunDir.value);
    const w = this.world, s = w.cell; // snap to the lattice so the patch edge lies on far-mesh edges
    const px = Math.round(cx / s) * s, pz = Math.round(cz / s) * s;
    this.patch.position.set(px, 0, pz);
    this.uniforms.uPatchLocal.value.set(px - this.origin.x, pz - this.origin.z);
    this.updateRipples(dt, px, pz);
    const ci = w.cellI(cx), cj = w.cellJ(cz);
    if (this.atlasDirty || Math.abs(ci - (this.atlasI + ATLAS / 2)) > ATLAS / 2 - ATLAS_SLACK || Math.abs(cj - (this.atlasJ + ATLAS / 2)) > ATLAS / 2 - ATLAS_SLACK) this.rebuildAtlas(ci, cj);
    // the light the water column sends back: the key (the sun, or the moon at night) and the sky fill as they
    // stand this frame, over pi as three's Lambert has them, so the water is lit like everything round it
    const { sun, hemi, moon } = this.env, u = this.uniforms;
    if (sun && hemi) {
      const k = u.uSunLight.value.setRGB(0, 0, 0), add = (c, s) => { k.r += c.r * s; k.g += c.g * s; k.b += c.b * s; };
      if (sun.visible) add(sun.color, sun.intensity / Math.PI);
      if (moon && moon.visible) add(moon.color, moon.intensity / Math.PI);
      u.uSkyLight.value.copy(hemi.color).multiplyScalar(hemi.intensity / Math.PI);
    }
  }

  // The fine ripples' directions, phases and weights (see RIP) for the patch centre (cx, cz, world metres), and the
  // cat's paws' drift, from the wind setWind left this frame.
  updateRipples(dt, cx, cz) {
    const w = this.wind, R = this.uniforms.uRip.value, heading = Math.atan2(w.z, w.x), t = this.time;
    for (let i = 0; i < RIPPLES; i++) {
      const r = RIP[i], f = (heading + r.fan) / RIP_STEP - r.off, j0 = Math.floor(f), blend = (f - j0) * (Math.PI / 2);
      for (let s = 0; s < 2; s++) {
        const j = j0 + s, a = (j + r.off) * RIP_STEP, dx = Math.cos(a), dz = Math.sin(a);
        let ph = r.k * (cx * dx + cz * dz) - r.w * t + RIP_PH[i * RIP_DIRS + (((j % RIP_DIRS) + RIP_DIRS) % RIP_DIRS)];
        ph -= TAU * Math.floor(ph / TAU);
        const o = (i * 2 + s) * 4;
        R[o] = dx; R[o + 1] = dz; R[o + 2] = ph; R[o + 3] = s ? Math.sin(blend) : Math.cos(blend);
      }
    }
    const g = this.gustDrift, l = Math.hypot(w.x, w.z) || 1;
    g.x += (w.x / l) * GUST_DRIFT * dt; g.z += (w.z / l) * GUST_DRIFT * dt;
    this.uniforms.uGustOff.value.set(this.origin.x - g.x, this.origin.z - g.z);
  }

  // Shore distance, terrain height, ground cover and water level for the cells around the canoe; the
  // level of land cells is that of the nearest water by flood fill, so the patch can rise over the beach
  // and be discarded there.
  rebuildAtlas(ci, cj) {
    const w = this.world, A = ATLAS, N = A * A;
    const i0 = Math.max(0, Math.min(w.width - A, ci - A / 2)), j0 = Math.max(0, Math.min(w.height - A, cj - A / 2));
    this.atlasI = i0; this.atlasJ = j0; this.atlasDirty = false;
    const shore = this.shore, level = this.level, height = this.height, cover = this.cover, clarity = this.clarity;
    const queue = this._queue || (this._queue = new Int32Array(N));
    let head = 0, tail = 0;
    // a row at a time, a fine tile's span of it read straight from the tile's arrays (the cell accessors cost a
    // division and a lookup a call, six calls a cell: 15-50 ms a rebuild); cells with no fine tile through them
    const T = w.tile, halo = w.halo, side = w.side;
    for (let lj = 0; lj < A; lj++) {
      const j = j0 + lj, tj = (j / T) | 0, row = ((j % T) + halo) * side + halo;
      for (let li = 0; li < A;) {
        const i = i0 + li, ti = (i / T) | 0, span = Math.min(A - li, (ti + 1) * T - i), t = w.slots[tj * w.ntx + ti];
        for (let q = 0, m = row + (i % T), k = lj * A + li; q < span; q++, m++, k++) {
          let id;
          if (t) {
            shore[k] = t.sd[m] * 0.1; height[k] = t.h[m] * 0.1;
            const cv = t.cover;
            if (cv) { cover[k * 4] = cv[m * 4]; cover[k * 4 + 1] = cv[m * 4 + 1]; cover[k * 4 + 2] = cv[m * 4 + 2]; cover[k * 4 + 3] = cv[m * 4 + 3]; }
            else { cover[k * 4] = 0; cover[k * 4 + 1] = 0; cover[k * 4 + 2] = 0; cover[k * 4 + 3] = 0; }
            id = t.lake[m];
            if (id) level[k] = t.lvl[m] * 0.1;
          } else {
            const ci2 = i + q;
            shore[k] = w.sdCell(ci2, j); height[k] = w.hCell(ci2, j);
            const cv = w.coverCell(ci2, j);
            cover[k * 4] = cv & 255; cover[k * 4 + 1] = (cv >> 8) & 255; cover[k * 4 + 2] = (cv >> 16) & 255; cover[k * 4 + 3] = (cv >>> 24) & 255;
            id = w.lakeCell(ci2, j);
            if (id) level[k] = w.levelCell(ci2, j);
          }
          if (id) { clarity[k] = w.clarityOf(id); queue[tail++] = k; } else level[k] = -9999;
        }
        li += span;
      }
    }
    // land cells take the level and clarity of the nearest water, so the patch can rise over the beach
    while (head < tail) {
      const k = queue[head++], x = k % A, y = (k - x) / A, L = level[k], C = clarity[k];
      if (x > 0 && level[k - 1] === -9999) { level[k - 1] = L; clarity[k - 1] = C; queue[tail++] = k - 1; }
      if (x < A - 1 && level[k + 1] === -9999) { level[k + 1] = L; clarity[k + 1] = C; queue[tail++] = k + 1; }
      if (y > 0 && level[k - A] === -9999) { level[k - A] = L; clarity[k - A] = C; queue[tail++] = k - A; }
      if (y < A - 1 && level[k + A] === -9999) { level[k + A] = L; clarity[k + A] = C; queue[tail++] = k + A; }
    }
    this.shoreTex.needsUpdate = true;
    this.levelTex.needsUpdate = true;
    this.heightTex.needsUpdate = true;
    this.clarityTex.needsUpdate = true;
    this.coverTex.needsUpdate = true;
    this.uniforms.uAtlas.value.set(w.originX + i0 * w.cell - this.origin.x, w.originZ + j0 * w.cell - this.origin.z, 1 / w.cell, A);
    this._atlasStamp = (this._atlasStamp || 0) + 1; // cons B: the fetch's ring is built again with the atlas
    this.rebuildFetch();
  }

  // The wind: direction it blows toward (unit xz) and speed. The fetch map is re-marched when the
  // direction moves to a new 15-degree bucket.
  setWind(dirX, dirZ, speed) {
    const w = this.wind;
    w.x = dirX; w.z = dirZ; w.speed = speed;
    this.uniforms.uWindSpeed.value = speed;
    // the fine ripples: a faint texture on a still day, a full roughness from a fresh breeze up
    this.uniforms.uRippleAmt.value = 0.1 + 0.9 * Math.min(1, Math.max(0, (speed - 0.5) / 9));
    const l = Math.hypot(dirX, dirZ) || 1;
    this.uniforms.uWindDir.value.set(dirX / l, dirZ / l);
    windWeights(dirX, dirZ, w.w);
    this.uniforms.uDirW.value.set(w.w);
    // cons B: a new bucket only once the wind is well into it (a wind wavering on a bucket's edge re-marched every frame)
    const at = Math.atan2(dirZ, dirX) / (Math.PI / 12), off = w.held ? ((at - w.bucket) % 24 + 36) % 24 - 12 : 1;
    if (Math.abs(off) > 0.65) { w.bucket = Math.round(at); w.held = true; if (!Number.isNaN(this.atlasI)) this.startFetch(); } // (over a few frames)
  }

  // Fetch: how far open water extends upwind of each water cell in the atlas, in metres (up to 300 cells, 3 km).
  // cons B: the march runs on past the atlas's edge over a ring of FETCH_RING cells round it (the world's own shore
  // distance, the far data where no fine tile is in), so water near the upwind edge of the atlas is not taken for a lee
  // (a false calm band, straight along the atlas's edge, a kilometre off); past the ring the ray ends as open water.
  // rows: the rows to march now (all of them at once when the atlas moves; a few a frame after a veer, fetchStep)
  rebuildFetch(rows = null) {
    const A = ATLAS, M = FETCH_RING, E = A + 2 * M, shore = this.shore, w = this.wind, cell = this.world.cell;
    if (this._ringAt !== this._atlasStamp || !this._ring) this.buildFetchRing();
    const ring = this._ring;
    const job = rows ? this._fetchJob : null, fetch = job ? job.out : this.fetch;
    if (!job) this._fetchJob = null; // (a whole march supersedes one under way)
    const ux = job ? job.ux : -w.x, uz = job ? job.uz : -w.z; // upwind
    const j0 = job ? job.lj : 0, j1 = job ? Math.min(A, j0 + rows) : A;
    for (let lj = j0; lj < j1; lj++) for (let li = 0; li < A; li++) {
      const k = lj * A + li;
      if (shore[k] >= 0) { fetch[k] = 0; continue; }
      let x = li + M + 0.5, y = lj + M + 0.5, steps = 0;
      while (steps < 300) {
        x += ux; y += uz; steps++;
        if (x < 0 || y < 0 || x >= E || y >= E) break; // past the ring: open water as far as is known
        if (ring[(y | 0) * E + (x | 0)]) break;
      }
      fetch[k] = steps * cell;
    }
    if (job) { job.lj = j1; if (j1 < A) return; this.fetch.set(job.out); this._fetchJob = null; }
    this.fetchTex.needsUpdate = true;
  }
  // cons B: a march after the wind veers into a new bucket runs over a few frames (FETCH_ROWS rows each, into a copy
  // swapped in whole when done), so a veer never costs one frame the whole march; called from update
  fetchStep() {
    if (this._fetchJob) this.rebuildFetch(FETCH_ROWS);
  }
  startFetch() {
    if (Number.isNaN(this.atlasI)) return;
    const j = this._fetchJob || (this._fetchJob = { out: this._fetchOut || (this._fetchOut = new Float32Array(ATLAS * ATLAS)) });
    j.lj = 0; j.ux = -this.wind.x; j.uz = -this.wind.z;
  }
  // cons B: the land mask for the fetch's march: the atlas's own shore inside, the world's round it (rebuilt with the atlas)
  buildFetchRing() {
    const A = ATLAS, M = FETCH_RING, E = A + 2 * M, w = this.world, shore = this.shore;
    const ring = this._ring && this._ring.length === E * E ? this._ring : new Uint8Array(E * E);
    for (let j = 0; j < E; j++) for (let i = 0; i < E; i++) {
      const li = i - M, lj = j - M;
      ring[j * E + i] = li >= 0 && lj >= 0 && li < A && lj < A ? (shore[lj * A + li] >= 0 ? 1 : 0) : (w.sdCell(this.atlasI + li, this.atlasJ + lj) >= 0 ? 1 : 0);
    }
    this._ring = ring; this._ringAt = this._atlasStamp;
  }

  fetchAt(x, z) {
    const w = this.world, A = ATLAS;
    if (Number.isNaN(this.atlasI)) return 400; // no atlas yet (first frames)
    const li = w.cellI(x) - this.atlasI, lj = w.cellJ(z) - this.atlasJ;
    if (!(li >= 0 && lj >= 0 && li < A && lj < A)) return 400;
    return this.fetch[lj * A + li];
  }
  // cons B: the share of the wind felt on the water here, 1 on open water down to LEE.drift close under a lee shore
  shelterAt(x, z) {
    const f = this.fetchAt(x, z), k = Math.min(1, Math.max(0, (f - LEE.reach[0]) / (LEE.reach[1] - LEE.reach[0])));
    return LEE.drift + (1 - LEE.drift) * k * k * (3 - 2 * k);
  }
  // cons B: the biggest wind-wave (windHeight, m) on the water within r metres: whitecaps show from about 0.33 (the
  // fragment shader's blow) — what the eye sees from the canoe, for the first whitecaps' moment
  seaNear(x, z, r = 400) {
    if (Number.isNaN(this.atlasI)) return 0;
    let best = 0;
    for (const rr of [0, r * 0.15, r * 0.35, r * 0.65, r]) for (let a = 0; a < 12; a++) {
      const px = x + Math.cos((a * Math.PI) / 6) * rr, pz = z + Math.sin((a * Math.PI) / 6) * rr;
      const f = this.fetchAt(px, pz);
      if (f > 0) best = Math.max(best, windHeight(this.wind.speed, f));
      if (rr === 0) break;
    }
    return best;
  }

  waveAt(x, z) {
    if (!this._cpuWind) { const self = this; this._cpuWind = { get w() { return self.wind.w; }, get speed() { return self.wind.speed; }, fetch: (px, pz) => self.fetchAt(px, pz) }; }
    return waveHeight(x, z, this.time, this.world, this.origin.x, this.origin.z, this._cpuWind);
  }

  // uniforms another material needs to ride or stand on the same surface (see floating.js, wake.js, groundcover.js)
  surfaceUniforms() {
    const u = this.uniforms;
    return { uShoreTex: u.uShoreTex, uLevelTex: u.uLevelTex, uHeightTex: u.uHeightTex, uClarityTex: u.uClarityTex, uCoverTex: u.uCoverTex, uFetchTex: u.uFetchTex, uDirW: u.uDirW, uWindSpeed: u.uWindSpeed, uAtlas: u.uAtlas, uOrigin: u.uOrigin, uPatchLocal: u.uPatchLocal, uPatchHalf: u.uPatchHalf, uPatchRes: u.uPatchRes, uWaterTime: u.uTime };
  }

  // Puts each tile's terrain, trees and outcrops on the shore layer as the tiles come in (the fine tiles and the
  // far chunks under them) and lists the tree meshes for the mirror pass. A tile group is looked at again when its
  // child count moves (the vegetation LOD adds a stand's variant meshes later; those stay off the layer, the
  // mirror draws every instance of a bin with the bin's own mesh).
  tagTiles() {
    const tm = this.world.tiles;
    if (!tm) return;
    const terrain = tm.terrainMaterial, mirrored = this._mirrored;
    const tag = (g) => {
      if (g.userData.mirrorTag === g.children.length) return;
      g.userData.mirrorTag = g.children.length;
      for (const o of g.children) {
        if (o.layers.isEnabled(REFLECT_SHORE_LAYER)) continue;
        if (o.material === terrain) o.layers.enable(REFLECT_SHORE_LAYER);
        else if (o.userData.lod && MIRRORED.has(o.userData.sp)) { o.layers.enable(REFLECT_SHORE_LAYER); mirrored.push(o); }
      }
    };
    for (const e of tm.tiles.values()) if (e.group) tag(e.group);
    for (const g of tm.farChunks.values()) tag(g);
    if (++this._sweep % 240 === 0) this._mirrored = mirrored.filter((m) => m.parent); // tiles that have gone
  }

  // The mirror pass, at a quarter of the drawing buffer each way: the canoe and the rod (REFLECT_LAYER) and, on the
  // shore layer, the terrain, the trees and the outcrops, seen from under the surface. The trees as a blurred
  // reflection wants them: every instance of a bin drawn with one geometry, the far twin past REFLECTION.full,
  // nothing past REFLECTION.reach; put back as the main view had them after. The world matrices
  // are the main pass's from the last frame (a frame-old canoe is well inside a mirror's blur), which spares the
  // scene a second walk. Off (the reflections setting), or well inland, there is no pass and the water mirrors the
  // sky alone.
  renderReflection(renderer, scene, camera, level) {
    const u = this.uniforms, R = this.reflection;
    if (!this.reflectionsOn) { u.uReflOn.value = 0; return; }
    renderer.getDrawingBufferSize(_size);
    const w = Math.max(16, Math.round(_size.x * REFLECTION.scale)), h = Math.max(16, Math.round(_size.y * REFLECTION.scale));
    if (R.target.width !== w || R.target.height !== h) { R.target.setSize(w, h); u.uReflTexel.value.set(1 / w, 1 / h); }
    camera.getWorldPosition(_camPos);
    // walking well inland there is no water in view to mirror into
    if (this.world.shoreAt(_camPos.x, _camPos.z) > 150) { u.uReflOn.value = 0; return; }
    this.tagTiles();
    const saved = this._saved;
    saved.length = 0;
    for (const m of this._mirrored) {
      if (!m.visible || !m.parent) continue;
      const l = m.userData.lod, half = l.half || 320;
      const d = Math.hypot(Math.max(0, Math.abs(_camPos.x - l.cx) - half), Math.max(0, Math.abs(_camPos.z - l.cz) - half));
      saved.push(m, m.geometry, m.count);
      if (d > REFLECTION.reach) { m.visible = false; continue; }
      m.geometry = d > REFLECTION.full ? l.low : l.full;
      if (l.total) m.count = l.total;
    }
    const bg = scene.background, auto = scene.matrixWorldAutoUpdate;
    scene.background = null;
    scene.matrixWorldAutoUpdate = false;
    const ok = R.render(renderer, scene, camera, level, (1 << REFLECT_LAYER) | (1 << REFLECT_SHORE_LAYER));
    scene.background = bg;
    scene.matrixWorldAutoUpdate = auto;
    for (let i = 0; i < saved.length; i += 3) { const m = saved[i]; m.visible = true; m.geometry = saved[i + 1]; m.count = saved[i + 2]; }
    u.uReflOn.value = ok ? 1 : 0;
  }
}

const _size = new THREE.Vector2();
const _normal = new THREE.Vector3(0, 1, 0), _planePoint = new THREE.Vector3(), _camPos = new THREE.Vector3(), _view = new THREE.Vector3();
const _look = new THREE.Vector3(), _target = new THREE.Vector3(), _rot = new THREE.Matrix4(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
const _clear = new THREE.Color();
export class WaterReflection {
  constructor(w, h) {
    // linear light, as the scene pass is: the shore's lit tops and the sun on the hull run past 1
    this.target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.camera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
  }
  // mask: the layers the mirror sees (a bit mask, as Layers.mask)
  render(renderer, scene, camera, level, mask) {
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
    cam.layers.mask = mask;
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
