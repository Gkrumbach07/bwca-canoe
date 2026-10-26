// The water swell, shared by the shaders (GLSL text) and the CPU (canoe bobbing), now driven by the wind.
// Eight fixed wave directions each carry a swell (26 m) and a chop (6.5 m) component; the wind only changes
// how much each direction carries (the weights) and how tall the waves are (from wind speed and fetch, the
// open-water distance upwind). Fixed directions mean the field never pops when the wind veers.
// Every spatial frequency is rounded to a whole number of periods per PERIOD metres, so when the floating
// origin jumps by a tile the phase of every wave is unchanged.
import { smoothstep } from './rng.js';

export const PERIOD = 2560; // metres, equal to one tile; the floating origin moves in multiples of this
const q = (k) => Math.round((k * PERIOD) / (2 * Math.PI)) * ((2 * Math.PI) / PERIOD);
const G = 9.81;
export const N = 8;
export const DIRS = Array.from({ length: N }, (_, i) => { const a = (i / N) * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; });
const SWELL_K = (2 * Math.PI) / 26, CHOP_K = (2 * Math.PI) / 6.5;
export const SWELL = DIRS.map(([c, s]) => [q(SWELL_K * c), q(SWELL_K * s)]);
export const CHOP = DIRS.map(([c, s]) => [q(CHOP_K * c), q(CHOP_K * s)]);
export const SWELL_W = Math.sqrt(G * SWELL_K), CHOP_W = Math.sqrt(G * CHOP_K);   // deep-water dispersion
const PH = [0, 1.7, 3.1, 4.4, 0.9, 2.6, 5.3, 3.9], PH2 = [2.2, 0.4, 4.1, 1.3, 5.0, 2.9, 0.7, 3.6];
export const CHOP_PH = PH2; // (the chop's phases: water.js's whitecaps break on the crests the vertices draw)
const CALM = [[q(0.7), q(0.1), 1.1, 0.03], [q(0.2), q(1.05), 0.95, 0.025], [q(0.45), q(0.45), 0.8, 0.02]];
export const K = { r1x: q(0.217), r1z: q(0.161), r2x: q(0.0713), r2z: q(0.0529), r3x: q(0.403), r3z: q(0.299) };

// How much each of the eight directions carries for a wind blowing toward (dirX, dirZ); sums to one.
export function windWeights(dirX, dirZ, out = new Float32Array(N)) {
  let sum = 0;
  for (let i = 0; i < N; i++) { const d = Math.max(0, DIRS[i][0] * dirX + DIRS[i][1] * dirZ); out[i] = d * d * d + 0.02; sum += out[i]; }
  for (let i = 0; i < N; i++) out[i] /= sum;
  return out;
}
// Wave height (crest to trough, metres) for a wind speed over a fetch; a stylized fetch-limited growth law.
export function windHeight(speed, fetch) { return 0.05 + Math.min(1.1, 0.0016 * speed * Math.sqrt(Math.max(fetch, 15))); }

export function lowWave(x, z, t, w) {
  let s = 0;
  for (let i = 0; i < N; i++) s += w[i] * Math.sin(x * SWELL[i][0] + z * SWELL[i][1] + PH[i] - SWELL_W * t);
  return s;
}
export function highWave(x, z, t, w) {
  let s = 0;
  for (let i = 0; i < N; i++) s += w[i] * Math.sin(x * CHOP[i][0] + z * CHOP[i][1] + PH2[i] - CHOP_W * t);
  return s;
}
export function calmWave(x, z, t) {
  let s = 0;
  for (const [kx, kz, w, a] of CALM) s += a * Math.sin(x * kx + z * kz + t * w);
  return s;
}

const g = (v) => v.toFixed(9);
const sumGlsl = (vecs, ph, w) => vecs.map((v, i) => `uDirW[${i}] * sin(dot(p, vec2(${g(v[0])}, ${g(v[1])})) + ${g(ph[i])} - ${g(w)} * t)`).join(' + ');
export const glslWaves = /* glsl */ `
  uniform float uDirW[${N}];
  uniform float uWindSpeed;
  float windHeight(float fetch) { return 0.05 + min(1.1, 0.0016 * uWindSpeed * sqrt(max(fetch, 15.0))); }
  float lowWave(vec2 p, float t) { return ${sumGlsl(SWELL, PH, SWELL_W)}; }
  float highWave(vec2 p, float t) { return ${sumGlsl(CHOP, PH2, CHOP_W)}; }
  float calmWave(vec2 p, float t) { return ${CALM.map(([kx, kz, w, a]) => `${g(a)} * sin(dot(p, vec2(${g(kx)}, ${g(kz)})) + t * ${g(w)})`).join(' + ')}; }
`;
export const glslRipples = /* glsl */ `
  const vec2 RIP1 = vec2(${g(K.r1x)}, ${g(K.r1z)});
  const vec2 RIP2 = vec2(${g(K.r2x)}, ${g(K.r2z)});
  const vec2 RIP3 = vec2(${g(K.r3x)}, ${g(K.r3z)});
`;

// CPU twin of the water patch vertex shader: long swell interpolated from the 10 m lattice nodes (damped
// near shore, exactly as the far mesh does it) plus short chop and the calm-water texture. Coordinates are
// taken relative to the floating origin (ox, oz) just like the GPU. `wind` = { w, speed, fetch(x, z) }.
export function waveHeight(x, z, t, grid, ox, oz, wind) {
  const fx = (x - grid.originX) / grid.cell - 0.5, fz = (z - grid.originZ) / grid.cell - 0.5;
  const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
  const corner = (ii, jj) => {
    const cx = grid.cellX(ii), cz = grid.cellZ(jj);
    return lowWave(cx - ox, cz - oz, t, wind.w) * 0.5 * windHeight(wind.speed, wind.fetch(cx, cz)) * smoothstep(0, 25, -grid.sdCell(ii, jj));
  };
  const low = (corner(i, j) * (1 - ax) + corner(i + 1, j) * ax) * (1 - az) + (corner(i, j + 1) * (1 - ax) + corner(i + 1, j + 1) * ax) * az;
  const damp = smoothstep(0, 8, -grid.shoreAt(x, z));
  const chop = (0.03 + 0.2 * windHeight(wind.speed, wind.fetch(x, z))) * highWave(x - ox, z - oz, t, wind.w) + calmWave(x - ox, z - oz, t);
  return low + chop * damp;
}
