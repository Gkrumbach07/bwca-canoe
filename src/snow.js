import * as THREE from 'three';
import { smoothstep } from './rng.js';

// Snow on the ground, the rocks and the trees (the snow round, 2026-11-01). No geometry: every look material that
// takes it (terrain, ground cover, trees and shrubs, rocks, cliffs, props) lays the snow's colour over its own where
// the surface faces up, as applyWet lays the rain's darkening (weather.js). How much lies where:
//   - the date's cover and depth (season.js snowAt, the Ely record): in the fall the first patches on the open ground,
//     the pack from late November, in the spring the melt;
//   - the slope: past about 55° it sheds, so a cliff face or a boulder's side stays dark and only its top is white;
//   - the aspect and the shade in the spring: the south slopes and the open ground go first, the north slopes and the
//     floor under the conifers last; in the early winter the canopy holds the first snow off the floor;
//   - a ragged noise a few metres across, so the patches are drifts and not a fade;
//   - fresh snow from the weather's own snowfall (weather.js), a dusting over everything that melts off on a warm day.
// Low things are buried by the depth: an instanced plant or rock's parts lower than the pack draw as snow (`foot`),
// and the grass tufts sink into it (groundcover.js).
//
// uSnow: x the cover (0..1), y the depth (m), z the spring (0 the fall and the winter, 1 the melt), w the fresh snow
// (0..1). setSnowSeason fills x-z from the day's season each frame (terrain.js setLandSeason calls it), the weather
// fills w.
export const SNOW = {
  uSnow: { value: new THREE.Vector4(0, 0, 0, 0) },
  fresh: 0,
};
export const SNOW_COLOR = [0.8, 0.83, 0.88]; // linear albedo: fresh snow is nearly white, a touch blue

export function setSnowSeason(season) {
  const u = SNOW.uSnow.value;
  u.set(season.snow || 0, (season.snowCm || 0) / 100, season.snowMelt || 0, SNOW.fresh);
}
// the weather's snowfall (weather.js): rate 0..1 while it snows, the air's temperature (°C) and the sun's share; dh in
// game hours. An hour of steady snow whitens the ground; above freezing it melts off over a few hours, faster in sun.
export function snowFall(dh, rate, temp, sun) {
  const melt = (temp > 0.5 ? 0.04 + 0.12 * (temp - 0.5) * (0.4 + sun) : 0.01) * (rate > 0.02 ? 0.25 : 1);
  const f = SNOW.fresh + dh * (0.9 * rate - melt);
  SNOW.fresh = Math.min(1, Math.max(0, f));
  SNOW.uSnow.value.w = SNOW.fresh;
}
// how deep the snow is where you stand (m), for the walk (player.js): the pack by the date wherever it lies, the fresh
// snow a few centimetres
export function snowDepthHere(season) {
  if (!season) return 0;
  return (season.snowCm || 0) / 100 * smoothstep(0.2, 0.7, season.snow || 0) + 0.04 * SNOW.fresh;
}

// snowLie(world position, world normal, shelter 0..1, metres per pixel) -> how white this point is (0..1).
// snowBury(height over the instance's foot) -> 1 where the pack covers it.
// Needs the look's noise (shading.js applyLook).
export const glslSnow = /* glsl */ `
uniform vec4 uSnow;
const vec3 SNOW_C = vec3(${SNOW_COLOR.map((c) => c.toFixed(3)).join(', ')});
// (the noise turned off the lattice's axes and warped a few metres, and the edge of a thin snow soft: a hard edge on
// the value noise, or on the canopy's shelter between the ground's vertices, drew squares)
const mat2 SNOW_TURN = mat2(0.788, 0.616, -0.616, 0.788);
float snowPatch(vec3 wp, vec3 wn, float shelter, float px) {
  vec2 q = SNOW_TURN * wp.xz;
  q += 3.0 * (vec2(lookNoise(q / 6.3, 75u), lookNoise(q / 6.3 + vec2(5.2, 1.3), 76u)) - 0.5);
  float n = lookFbm(q / 11.0, 71u, 2);
  n += 0.22 * (lookFbm(q / 2.3 + vec2(3.1, -1.7), 72u, 2) - 0.5) * lookFade(2.3, px);
  // the melt: north slopes (z is south) and the shade keep it, south slopes lose it; before it the canopy holds it off
  // (the melt's last patches go with the cover: none left once the record's has gone, early May)
  float bias = uSnow.z * (1.4 * -wn.z + 0.28 * shelter) * smoothstep(0.0, 0.15, uSnow.x) - (1.0 - uSnow.z) * 0.22 * shelter;
  float soft = mix(0.14, 0.05, smoothstep(0.03, 0.2, uSnow.y));
  float cov = smoothstep(-soft, soft, uSnow.x * 1.12 - 0.06 + bias - n);
  // a thin snow lets the ground through in grains; a pack covers it
  if (uSnow.y < 0.05) {
    float grain = lookFbm(q / 0.33 + vec2(-2.7, 5.3), 73u, 2);
    cov *= mix(mix(0.62, smoothstep(0.28, 0.66, grain) * 0.85 + 0.15, lookFade(0.33, px)), 1.0, smoothstep(0.0, 0.05, uSnow.y));
  }
  // the fresh snow from the sky, over everything that faces up, a little less under the canopy
  return max(cov, uSnow.w * (0.6 + 0.4 * n) * (1.0 - 0.45 * shelter));
}
float snowLie(vec3 wp, vec3 wn, float shelter, float px) {
  float up = smoothstep(0.52, 0.82, wn.y);
  if (up <= 0.0) return 0.0;
  return snowPatch(wp, wn, shelter, px) * up;
}
// the pack's depth where it lies (no patches: the burial is a winter thing, when the cover is whole)
float snowBury(float h) {
  float d = uSnow.y * smoothstep(0.3, 0.8, uSnow.x);
  return 1.0 - smoothstep(d - 0.05, d + 0.01, h);
}
`;

// Lays the snow on a look material: call in onBeforeCompile after applyLook, the material's own colour patches and
// applyWet. GLSL expressions in main's scope: shelter (the canopy over it, 0..1), amount (a multiplier: 0 none),
// lie (a replacement for how much the facing takes: the crowns' cards read their own), foot: true to bury the parts
// of an instance lower than the pack (instanced meshes only). The colour goes in just before the emissive (the normal
// is final there); the world position is the fog's ray from the eye.
export function applySnow(shader, { shelter = '0.0', amount = '1.0', lie = null, foot = false } = {}) {
  shader.uniforms.uSnow = SNOW.uSnow;
  let vs = shader.vertexShader, fs = shader.fragmentShader;
  const swap = (src, from, to) => { if (src.includes(from)) return src.replace(from, to); console.warn(`snow: ${from} not found, no snow there`); return src; };
  fs = swap(fs, '#include <shadowmap_pars_fragment>', glslSnow + (foot ? '\nvarying float vSnowFoot;' : '') + '\n#include <shadowmap_pars_fragment>'); // (after the look's noise)
  if (foot) {
    vs = swap(vs, '#include <common>', '#include <common>\nvarying float vSnowFoot;');
    vs = swap(vs, '#include <project_vertex>', `vSnowFoot = 9.0;
	#ifdef USE_INSTANCING
	vSnowFoot = ( instanceMatrix * vec4( transformed, 1.0 ) ).y - instanceMatrix[ 3 ].y;
	#endif
	#include <project_vertex>`);
  }
  // (a `lie` of its own skips the ground's patches: the crowns and the reeds take the date's cover and the fresh snow as
  // they are, so a card's many layers cost a noise or two, not the ground's)
  const lieExpr = lie ? `min( 1.0, uSnow.x * ( 1.0 - 0.65 * uSnow.z ) + uSnow.w ) * ( ${lie} )` : `snowLie( snowWp, snowN, ${shelter}, snowPx )`;
  fs = swap(fs, '#include <emissivemap_fragment>', `
	#ifdef USE_FOG
	if ( uSnow.x + uSnow.w > 0.002 ) {
		vec3 snowWp = cameraPosition + vFogDir, snowN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
		float snowPx = length( fwidth( snowWp.xz ) );
		float snowK = ${lieExpr};
		${foot ? 'snowK = max( snowK, snowBury( vSnowFoot ) );' : ''}
		diffuseColor.rgb = mix( diffuseColor.rgb, SNOW_C, clamp( snowK * ( ${amount} ), 0.0, 1.0 ) );
	}
	#endif
	#include <emissivemap_fragment>`);
  shader.vertexShader = vs; shader.fragmentShader = fs;
  return shader;
}
