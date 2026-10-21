// The water swell, shared by the shaders (GLSL text) and the CPU (canoe bobbing). Every spatial frequency is
// rounded to a whole number of periods per PERIOD metres, so when the floating origin jumps by a tile the
// phase of every wave is unchanged: no pop, and the shader never sees coordinates beyond a few kilometres.
import { smoothstep } from './rng.js';

export const PERIOD = 2560; // metres, equal to one tile; the floating origin moves in multiples of this
const q = (k) => Math.round((k * PERIOD) / (2 * Math.PI)) * ((2 * Math.PI) / PERIOD);
export const K = {
  ax: q(0.14), bx: q(0.054), bz: q(0.072), cz: q(0.11), cx: q(0.05),
  dx: q(0.7), ez: q(1.05), ex: q(0.3), f: q(0.45),
  r1x: q(0.217), r1z: q(0.161), r2x: q(0.0713), r2z: q(0.0529), r3x: q(0.403), r3z: q(0.299),
};

export function lowWave(x, z, t) {
  return Math.sin(x * K.ax + t * 0.35) * 0.06 + Math.sin(x * K.bx + z * K.bz - t * 0.3) * 0.06 + Math.sin(z * K.cz - x * K.cx + t * 0.27) * 0.05;
}
export function highWave(x, z, t) {
  return Math.sin(x * K.dx + t * 1.1) * 0.18 + Math.sin(z * K.ez - t * 0.95 + x * K.ex) * 0.1 + Math.sin((x + z) * K.f + t * 0.8) * 0.14;
}

const g = (v) => v.toFixed(9);
export const glslWaves = /* glsl */ `
  float lowWave(vec2 p, float t) { return sin(p.x * ${g(K.ax)} + t * 0.35) * 0.06 + sin(p.x * ${g(K.bx)} + p.y * ${g(K.bz)} - t * 0.3) * 0.06 + sin(p.y * ${g(K.cz)} - p.x * ${g(K.cx)} + t * 0.27) * 0.05; }
  float highWave(vec2 p, float t) { return sin(p.x * ${g(K.dx)} + t * 1.1) * 0.18 + sin(p.y * ${g(K.ez)} - t * 0.95 + p.x * ${g(K.ex)}) * 0.1 + sin((p.x + p.y) * ${g(K.f)} + t * 0.8) * 0.14; }
`;
export const glslRipples = /* glsl */ `
  const vec2 RIP1 = vec2(${g(K.r1x)}, ${g(K.r1z)});
  const vec2 RIP2 = vec2(${g(K.r2x)}, ${g(K.r2z)});
  const vec2 RIP3 = vec2(${g(K.r3x)}, ${g(K.r3z)});
`;

// CPU twin of the water patch vertex shader: long swell interpolated from the 10 m lattice nodes (damped
// near shore, exactly as the far mesh does it) plus short swell. Coordinates are taken relative to the
// floating origin (ox, oz) just like the GPU does.
export function waveHeight(x, z, t, grid, ox, oz) {
  const fx = (x - grid.originX) / grid.cell - 0.5, fz = (z - grid.originZ) / grid.cell - 0.5;
  const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
  const corner = (ii, jj) => lowWave(grid.cellX(ii) - ox, grid.cellZ(jj) - oz, t) * smoothstep(0, 25, -grid.sdCell(ii, jj));
  const low = (corner(i, j) * (1 - ax) + corner(i + 1, j) * ax) * (1 - az) + (corner(i, j + 1) * (1 - ax) + corner(i + 1, j + 1) * ax) * az;
  return low + highWave(x - ox, z - oz, t) * smoothstep(0, 8, -grid.shoreAt(x, z));
}
