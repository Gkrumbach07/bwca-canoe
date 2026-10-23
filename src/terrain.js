import * as THREE from 'three';
import { applyLook } from './shading.js';
import { applyWet } from './weather.js';
import { SPLAT, SPLAT_SUNNY, BED_PALETTE, BED_STEPS, BED_DEPTH_SCALE } from './terrain-build.js';

// The ground as a painted splat (docs/look.md, pass 1). Every vertex carries the weights of twelve ground
// materials (the bluff pass added the cliff and the scree, the shoreline pass a beach's sand and the wet margin at the
// waterline), the canopy shade over it and, under water, the depth of the bed (terrain-build.js splatAt);
// the fragment shader blends the materials through a warped world-space noise, so a transition is a soft
// irregular band a few metres wide and never a polygon edge, then mottles the result at three scales and
// darkens it under the canopy. The light is the shared smooth Lambert (shading.js).
//
// The palette lives in uniforms shared with the ground cover (groundcover.js uses the same glslGround on
// the class map under each tuft), so a tuft's root matches the ground it stands on. setGroundTint lets the
// day cycle or the season tint the whole floor at once.

const v3 = (c) => new THREE.Vector3(c[0], c[1], c[2]);
export const groundUniforms = {
  uGroundLit: { value: SPLAT.map((m) => v3(m.lit)) },
  uGroundShade: { value: SPLAT.map((m) => v3(m.shade)) },
  uGroundShadeK: { value: SPLAT.map((m) => m.shadeK) },
  uGroundSunny: { value: v3(SPLAT_SUNNY) },
  uBedPalette: { value: BED_PALETTE.map(v3) },
  uBedSteps: { value: new THREE.Vector4(...BED_STEPS) },
  uGroundTint: { value: new THREE.Vector3(1, 1, 1) },
  // x: the blend noise's reach (in weight units), y: how soft a band is (weight units; smaller is crisper),
  // z: the blend noise's size (m), w: how far the slow field pushes it about (m)
  uSplat: { value: new THREE.Vector4(1.0, 0.2, 4.5, 6) },
  uMottle: { value: new THREE.Vector3(0.14, 0.09, 0.07) },   // contrast of the 20 m, 3 m and 0.3 m mottle
  // the crisp break inside a band (pivot pass 2): x how far a 0.45–0.7 m noise pushes the blended weights
  // about, y how soft the edge it cuts is (weight units; widened to stay a pixel or two wide), z strength
  uSplatEdge: { value: new THREE.Vector3(0.38, 0.03, 1) },
  uRelief: { value: 0.22 },  // how far the fine relief tilts the shading normal
};
export function setGroundTint(r, g, b) { groundUniforms.uGroundTint.value.set(r, g, b); }

// groundRelief(world xz, metres per pixel) -> a small world-space tilt (x, z) for the shading normal: the
// slope of a soft noise a few metres across, so the light ripples over the ground as it does over real
// hummocks, and fades before it could shimmer. Added to the smooth normals (terrain-build.js).
// groundColor(world xz, weights A, weights B, weights C, floor, metres per pixel) -> linear albedo; the
// five-argument form (no C weights) is what the props' trail decal calls.
// floor = (canopy shade, sunny stand, bed, bed depth / BED_DEPTH_SCALE). Needs the look's noise (applyLook).
const NM = SPLAT.length;
export const glslGround = /* glsl */ `
uniform vec3 uGroundLit[${NM}];
uniform vec3 uGroundShade[${NM}];
uniform float uGroundShadeK[${NM}];
uniform vec3 uGroundSunny;
uniform vec3 uBedPalette[5];
uniform vec4 uBedSteps;
uniform vec3 uGroundTint;
uniform vec4 uSplat;
uniform vec3 uMottle;
uniform vec3 uSplatEdge;
// what groundColor leaves for the wet look (weather.js applyWet): how porous the ground that shows is (the duff, the
// moss, the meadow, the burn and the shore's soil soak the rain up, 1; the rock, the cliff and the scree half as
// much; the lake bed is under water already, 0), how much of it is rock, and the canopy's shade over it
float groundPorosity = 1.0, groundRock = 0.0, groundCanopy = 0.0;
// each material's noise is a turn of the two shared fields (golden-angle steps), so any two neighbours
// meet along a noisy line
const vec4 SPLAT_CA = vec4(1.0000, -0.7374, 0.0874, 0.6084), SPLAT_SA = vec4(0.0000, 0.6755, -0.9962, 0.7936);
const vec4 SPLAT_CB = vec4(-0.9847, 0.8437, -0.2596, -0.4609), SPLAT_SB = vec4(-0.1742, -0.5367, 0.9657, -0.8874);
const vec4 SPLAT_CC = vec4(0.9397, -0.9239, 0.4226, 0.3007), SPLAT_SC = vec4(0.3420, 0.3827, -0.9063, 0.9537);
vec3 groundShaded(int i, vec3 lit, float s) { return mix(lit, uGroundShade[i], s * uGroundShadeK[i]); }
// The cliff's face where the ground shows it (the cliff meshes stand over most of it): dark green-grey, broken
// by water streaks (dark runs a metre or so across, longer than wide on a steep face), pale lichen in patches and
// now and then a rust stain. A multiplier on the lit colour.
vec3 cliffTone(vec2 p, float px) {
  float f = lookFade(1.2, px);
  float streak = lookFbm(mat2(0.94, 0.34, -0.34, 0.94) * p / vec2(0.8, 2.6), 41u, 2);
  vec3 t = vec3(1.0 - 0.28 * smoothstep(0.42, 0.22, streak) * f);
  float lich = smoothstep(0.6, 0.7, lookFbm(p / 2.2 + vec2(3.3, 1.7), 42u, 2)) * lookFade(2.2, px);
  t = mix(t, vec3(1.38, 1.42, 1.18), 0.75 * lich);
  float rust = smoothstep(0.76, 0.84, lookFbm(p / 5.0 + vec2(-7.1, 2.9), 43u, 2));
  return mix(t, vec3(1.5, 0.95, 0.62), 0.6 * rust);
}
// The scree: small blocks a few tens of centimetres across, a little lighter or darker each, with dark gaps
// between, from two hashed lattices turned against each other (crazy paving, no grid); low contrast, fading
// to the plain colour before it could shimmer.
vec3 screeTone(vec2 p, float px) {
  float f = lookFade(0.5, px);
  if (f <= 0.0) return vec3(1.0);
  vec2 q1 = p / 0.42, q2 = mat2(0.5, 0.866, -0.866, 0.5) * p / 0.55 + vec2(0.31, 0.77);
  vec2 f1 = fract(q1), f2 = fract(q2);
  float v = 0.5 * (lookHash(ivec2(floor(q1)), 44u) + lookHash(ivec2(floor(q2)), 45u));
  float e1 = min(min(f1.x, 1.0 - f1.x), min(f1.y, 1.0 - f1.y)), e2 = min(min(f2.x, 1.0 - f2.x), min(f2.y, 1.0 - f2.y));
  float gap = 1.0 - smoothstep(0.0, 0.09, min(e1, e2));
  return vec3(mix(1.0, (0.86 + 0.28 * v) * (1.0 - 0.22 * gap), f));
}
uniform float uRelief;
vec2 groundRelief(vec2 p, float px) {
  const float e = 0.35;
  vec2 q = p / 3.2;
  float h = lookFbm(q, 21u, 2), hx = lookFbm(q + vec2(e, 0.0), 21u, 2), hz = lookFbm(q + vec2(0.0, e), 21u, 2);
  return -vec2(hx - h, hz - h) / e * uRelief * lookFade(3.2, px);
}
vec3 groundColor(vec2 p, vec4 wA, vec4 wB, vec4 wC, vec4 fl, float px) {
  // the blend field: two noises a few metres across, their coordinates pushed about by a slower field so
  // no band runs straight along a triangle edge
  vec2 warp = vec2(lookFbm(p / 23.0, 11u, 2), lookFbm(p / 23.0 + vec2(41.3, 17.9), 12u, 2)) - 0.5;
  vec2 q = (p + warp * uSplat.w) / uSplat.z;
  float n1 = lookFbm(q, 13u, 3) - 0.5, n2 = lookFbm(q + vec2(7.31, -3.17), 14u, 3) - 0.5;
  float fb = lookFade(uSplat.z, px);
  // mottle at three scales, all low contrast; the fine two fade out before they could shimmer
  float m20 = lookFbm(p / 20.0 + vec2(5.1, 2.7), 16u, 2) - 0.5;
  float m3 = lookFbm(p / 3.0 + vec2(9.4, 1.3), 17u, 2) - 0.5;
  float m03 = lookFbm(mat2(0.866, 0.5, -0.5, 0.866) * p / 0.3 + vec2(3.7, 8.2), 18u, 2) - 0.5; // turned: no lattice
  float mottle = 1.0 + uMottle.x * m20 + uMottle.y * m3 * lookFade(3.0, px) + uMottle.z * m03 * lookFade(0.3, px);
  vec3 c;
  if (fl.z > 0.5) {
    // the lake bed: its depth bands blended, wider the deeper they lie, the depth wobbling with the field
    float d = fl.w * ${BED_DEPTH_SCALE.toFixed(1)} + 0.9 * n1 * fb;
    c = uBedPalette[0];
    c = mix(c, uBedPalette[1], smoothstep(uBedSteps.x - 0.35, uBedSteps.x + 0.35, d));
    c = mix(c, uBedPalette[2], smoothstep(uBedSteps.y - 0.6, uBedSteps.y + 0.6, d));
    c = mix(c, uBedPalette[3], smoothstep(uBedSteps.z - 1.0, uBedSteps.z + 1.0, d));
    c = mix(c, uBedPalette[4], smoothstep(uBedSteps.w - 2.0, uBedSteps.w + 2.0, d));
    groundPorosity = 0.0; groundRock = 0.0;
  } else {
    // each material's weight lifted or lowered by its noise; those within a band's softness of the top
    // share the pixel. Far away the noise fades and the band widens to the plain weighted blend.
    float amp = uSplat.x * fb;
    vec4 hA = wA + amp * (n1 * SPLAT_CA + n2 * SPLAT_SA) * smoothstep(0.0, 0.15, wA);
    vec4 hB = wB + amp * (n1 * SPLAT_CB + n2 * SPLAT_SB) * smoothstep(0.0, 0.15, wB);
    vec4 hC = wC + amp * (n1 * SPLAT_CC + n2 * SPLAT_SC) * smoothstep(0.0, 0.15, wC);
    vec4 onC = step(0.002, wC); // the cliff, the scree, the sand and the margin only where the vertices carry them
    float top = max(max(max(max(hA.x, hA.y), max(hA.z, hA.w)), max(max(hB.x, hB.y), max(hB.z, hB.w))), max(max(hC.x, hC.y), max(hC.z, hC.w)));
    float soft = mix(1.0, uSplat.y, fb);
    vec4 bA = max(hA - top + soft, 0.0), bB = max(hB - top + soft, 0.0), bC = max(hC - top + soft, 0.0) * onC;
    bA *= bA; bB *= bB; bC *= bC;
    float sum = dot(bA, vec4(1.0)) + dot(bB, vec4(1.0)) + dot(bC, vec4(1.0));
    bA /= sum; bB /= sum; bC /= sum;
    // Up close the soft band is cut again on a fine noise (0.45 and 0.7 m), so two materials meet along a
    // sharp ragged edge, the way a painted transition does, while how much of each shows still follows the
    // 2–6 m band. Only the materials already in the blend take part; the edge widens with the pixel so it
    // never aliases, and the whole thing fades back to the soft blend before the noise could shimmer.
    float ef = lookFade(0.45, px) * uSplatEdge.z;
    if (ef > 0.0) {
      float f1 = lookFbm(p / 0.7 + vec2(3.1, 7.7), 19u, 2) - 0.5, f2 = lookFbm(mat2(0.6, 0.8, -0.8, 0.6) * p / 0.45 + vec2(-5.3, 1.9), 20u, 2) - 0.5;
      vec4 cA = bA + uSplatEdge.x * (f1 * SPLAT_CA + f2 * SPLAT_SA) * step(0.02, bA);
      vec4 cB = bB + uSplatEdge.x * (f1 * SPLAT_CB + f2 * SPLAT_SB) * step(0.02, bB);
      vec4 cC = bC + uSplatEdge.x * (f1 * SPLAT_CC + f2 * SPLAT_SC) * step(0.02, bC);
      float t2 = max(max(max(max(cA.x, cA.y), max(cA.z, cA.w)), max(max(cB.x, cB.y), max(cB.z, cB.w))), max(max(cC.x, cC.y), max(cC.z, cC.w)));
      float e = max(uSplatEdge.y, 0.75 * px);
      vec4 eA = max(cA - t2 + e, 0.0) * step(0.02, bA), eB = max(cB - t2 + e, 0.0) * step(0.02, bB), eC = max(cC - t2 + e, 0.0) * step(0.02, bC);
      eA *= eA; eB *= eB; eC *= eC;
      float es = max(1e-6, dot(eA, vec4(1.0)) + dot(eB, vec4(1.0)) + dot(eC, vec4(1.0)));
      bA = mix(bA, eA / es, ef); bB = mix(bB, eB / es, ef); bC = mix(bC, eC / es, ef);
    }
    // the canopy's shade and the sunny stands: soft-edged patches out of the noise rather than ramps, so no
    // gradient follows the triangles the values were interpolated over
    float s = smoothstep(0.32, 0.68, fl.x + 0.4 * n2 * fb);
    float sunny = smoothstep(0.3, 0.7, fl.y + 0.35 * n1 * fb);
    groundRock = bB.x + bB.y + bB.z + bC.x + bC.y;
    groundPorosity = 1.0 - 0.5 * groundRock;
    groundCanopy = s;
    c = bA.x * groundShaded(0, mix(uGroundLit[0], uGroundSunny, sunny), s)
      + bA.y * groundShaded(1, uGroundLit[1], s) + bA.z * groundShaded(2, uGroundLit[2], s) + bA.w * groundShaded(3, uGroundLit[3], s)
      + bB.x * groundShaded(4, uGroundLit[4], s) + bB.y * groundShaded(5, uGroundLit[5], s) + bB.z * groundShaded(6, uGroundLit[6], s) + bB.w * groundShaded(7, uGroundLit[7], s);
    if (bC.x + bC.y > 0.0) c += bC.x * groundShaded(8, uGroundLit[8] * cliffTone(p, px), s) + bC.y * groundShaded(9, uGroundLit[9] * screeTone(p, px), s);
    if (bC.z + bC.w > 0.0) c += bC.z * groundShaded(10, uGroundLit[10], s) + bC.w * groundShaded(11, uGroundLit[11], s);
  }
  c *= mottle;
  c *= vec3(1.0 + 0.06 * m20, 1.0, 1.0 - 0.06 * m20); // the slow mottle drifts a touch warm and cool too
  return c * uGroundTint;
}
vec3 groundColor(vec2 p, vec4 wA, vec4 wB, vec4 fl, float px) { return groundColor(p, wA, wB, vec4(0.0), fl, px); }
`;

export function makeTerrainMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const vary = 'varying vec4 vSplatA;\nvarying vec4 vSplatB;\nvarying vec4 vSplatC;\nvarying vec4 vFloor;\nvarying vec3 vLookWorld;';
  m.onBeforeCompile = (shader) => {
    applyLook(shader, { wrap: 0 });
    Object.assign(shader.uniforms, groundUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute vec4 aSplatA;\nattribute vec4 aSplatB;\nattribute vec4 aSplatC;\nattribute vec4 aFloor;\n' + vary)
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvSplatA = aSplatA; vSplatB = aSplatB; vSplatC = aSplatC; vFloor = aFloor;\n\tvLookWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_pars_fragment>', '#include <color_pars_fragment>\n' + vary + '\n' + glslGround)
      .replace('#include <color_fragment>', '\tfloat lookPx = length( fwidth( vLookWorld.xz ) );\n\tdiffuseColor.rgb *= groundColor( vLookWorld.xz, vSplatA, vSplatB, vSplatC, vFloor, lookPx );')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\t{ vec2 r = groundRelief( vLookWorld.xz, lookPx ) * ( 1.0 - vFloor.z ); normal = normalize( normal + mat3( viewMatrix ) * vec3( r.x, 0.0, r.y ) ); }');
    // rain: the soil darkens most, the rock half as much and shines a little more; less sheen under the canopy
    applyWet(shader, { porosity: 'groundPorosity', gloss: '( 0.3 + 0.4 * groundRock ) * ( 1.0 - 0.7 * groundCanopy ) * ( 1.0 - vFloor.z )' });
  };
  m.customProgramCacheKey = () => 'look-terrain';
  return m;
}

// Wraps the typed arrays a build worker produced (see terrain-build.js) into a mesh in tile-local coordinates.
export function makeTerrainMesh(res, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(res.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(res.nrm, 3, true));
  geo.setAttribute('aSplatA', new THREE.BufferAttribute(res.splatA, 4, true));
  geo.setAttribute('aSplatB', new THREE.BufferAttribute(res.splatB, 4, true));
  geo.setAttribute('aSplatC', new THREE.BufferAttribute(res.splatC || new Uint8Array(res.splatB.length), 4, true));
  geo.setAttribute('aFloor', new THREE.BufferAttribute(res.floor, 4, true));
  geo.setIndex(new THREE.BufferAttribute(res.idx, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
