import * as THREE from 'three';
import { makeLookMaterial } from './shading.js';
import { bakeOcclusion } from './occlusion.js';
import { groundUniforms, glslGround } from './terrain.js';
import { SPLAT } from './terrain-build.js';
import { applyWet } from './weather.js';

// The kit the built things are made from (props.js): generated textures, one material, a geometry builder
// with texture coordinates, a cheap occlusion bake against a few boxes, the terrain mesh's exact height, a
// canoe hull, and the trail's decal material.
//
// The look (docs/look.md) for things people made, after Campo Santo's props: simple shapes with believable
// construction (planks with gaps, frames round the openings, a roof with an overhang), wear modelled in
// (boards out of line, paint worn back to grey wood), grounded by soft occlusion. The textures are kept low
// in contrast and mostly neutral: the vertex colour carries the hue, the light and the fog carry the rest.
//
// Textures: one atlas of 16 cells generated at startup (hand-painted ones can replace them in the same
// cells). A cell is 256 px: a 224 px tile that repeats seamlessly plus a 16 px gutter wrapped from its
// opposite edge, so a face can repeat a cell many times (the shader takes fract() of the coordinate and
// samples with the unwrapped gradients, so the repeat never shows a seam), and the lookup is held to the
// first three mip levels, where the gutter still covers the filter. Past that the pattern fades to its
// cell's mean, so a far prop is its flat colour and never shimmers.

export const TILE = {
  PLAIN: 0, WOOD: 1, PAINT: 2, BARK: 3, END: 4, SPLIT: 5, CANVAS: 6, ROPE: 7,
  STONE: 8, METAL: 9, ASH: 10, ROOF: 11, GLASS: 12, HULL: 13, SIGN: 14, FIBRE: 15,
  ROCK: 16, // no texture: the colour is all in the vertices, lit with the rock's sky fill
};
// metres one repeat of a cell covers, [along the grain (u), across it (v)]; END, GLASS and SIGN are mapped 0..1
// across the face they cover instead
export const TILE_SIZE = [
  [1, 1], [1.6, 0.4], [1.2, 1.2], [0.9, 0.6], [1, 1], [1.0, 0.35], [1.2, 1.2], [0.12, 0.05],
  [0.6, 0.6], [0.4, 0.4], [0.9, 0.9], [1.0, 1.0], [1, 1], [2.0, 1.0], [1, 1], [0.8, 0.8], [1, 1],
];
// cells whose colour is in the texture (the vertex colour only shades them): no normalising gain
const SELF = new Set([TILE.END, TILE.METAL, TILE.ASH, TILE.GLASS, TILE.SIGN]);

// --- the atlas --------------------------------------------------------------------------------------------------
const CELL = 256, INNER = 224, GUT = 16, ATLAS = 1024;
// periodic value noise over a 256 x 256 table: x, y in lattice units, periods px, py (<= 256)
const NT = (() => { let a = 0x2f6b9d1 >>> 0; const t = new Float32Array(65536); for (let i = 0; i < 65536; i++) { a = (a + 0x6d2b79f5) >>> 0; let q = a; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); t[i] = ((q ^ (q >>> 14)) >>> 0) / 4294967296; } return t; })();
function pnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const ox = (seed * 37) & 255, oy = (seed * 101) & 255;
  const r0 = ((y0 + oy) & 255) << 8, r1 = ((y1 + oy) & 255) << 8, c0 = (x0 + ox) & 255, c1 = (x1 + ox) & 255;
  const a = NT[r0 | c0], b = NT[r0 | c1], c = NT[r1 | c0], d = NT[r1 | c1];
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
// fbm of the periodic noise over the unit tile: fx, fy whole numbers of lattice cells across it (so it repeats)
function fb(u, v, fx, fy, oct, seed) {
  let s = 0, amp = 0.5, n = 0;
  for (let o = 0; o < oct; o++) { s += amp * pnoise(u * fx, v * fy, fx, fy, seed + o * 13); n += amp; amp *= 0.5; fx *= 2; fy *= 2; }
  return s / n;
}
const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// weathered wood along u: long streaks, a fine fibre, the dark lines of the growth rings, now and then a knot
function woodValue(u, v, s) {
  const streak = fb(u, v, 2, 20, 3, s), fine = fb(u, v, 4, 80, 2, s + 7);
  const ring = 0.5 + 0.5 * Math.sin(2 * Math.PI * (v * 7 + 1.4 * fb(u, v, 2, 3, 2, s + 11)));
  const line = sm(0.8, 0.97, ring), knot = sm(0.8, 0.9, fb(u, v, 2, 2, 2, s + 17));
  return 0.86 + 0.2 * (streak - 0.5) + 0.07 * (fine - 0.5) - 0.11 * line - 0.22 * knot;
}
// each generator: (u, v in [0, 1) over the tile) -> [r, g, b, a] in sRGB 0..1
const GEN = [];
GEN[TILE.PLAIN] = (u, v) => { const m = 0.9 + 0.05 * (fb(u, v, 4, 4, 3, 1) - 0.5); return [m, m, m, 1]; };
GEN[TILE.WOOD] = (u, v) => { const m = woodValue(u, v, 3); return [m * 1.01, m, m * 0.97, 1]; };
// paint (or stain) worn back to the wood: alpha is where the paint still is. Mostly whole; the wear comes in
// thin flakes along the grain, gathered in a few patches, and the paint is chalky and uneven between them
GEN[TILE.PAINT] = (u, v) => {
  const patch = sm(0.56, 0.7, fb(u, v, 2, 2, 3, 37)), flake = sm(0.6, 0.7, fb(u, v, 2, 14, 4, 31)) * patch;
  const a = 1 - flake;
  const brush = 0.96 + 0.06 * (fb(u, v, 2, 36, 2, 33) - 0.5) + 0.05 * (fb(u, v, 3, 3, 2, 39) - 0.5), w = woodValue(u, v, 35) * 0.95;
  const lip = 1 - 0.08 * (1 - Math.abs(2 * a - 1));
  const m = (w * (1 - a) + brush * a) * lip;
  return [m, m, m, a];
};
GEN[TILE.BARK] = (u, v) => {
  const r = Math.abs(2 * fb(u, v, 2, 6, 3, 41) - 1), plate = sm(0.12, 0.42, r), f = fb(u, v, 5, 16, 2, 43);
  const m = 0.6 + 0.42 * plate + 0.12 * (f - 0.5);
  return [m, m * 0.98, m * 0.95, 1];
};
// end grain, mapped once across a cap: rings round the pith, a few checks, the bark at the rim
GEN[TILE.END] = (u, v) => {
  const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2, ang = Math.atan2(dy, dx);
  const ring = 0.5 + 0.5 * Math.sin(r * 2 * Math.PI * 7 + 2.2 * fb(u, v, 3, 3, 2, 51));
  let c = mix3([0.78, 0.68, 0.54], [0.66, 0.53, 0.40], sm(0.55, 0.05, r));
  const k = 0.92 + 0.08 * ring;
  c = [c[0] * k, c[1] * k, c[2] * k];
  for (const a0 of [0.7, 2.6, 4.4]) if (r > 0.15 && r < 0.86 && Math.abs(Math.sin(ang - a0)) * r < 0.014) c = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55];
  if (r > 0.88) c = mix3(c, [0.32, 0.26, 0.21], sm(0.88, 0.94, r));
  return [c[0], c[1], c[2], 1];
};
GEN[TILE.SPLIT] = (u, v) => {
  const fib = fb(u, v, 1, 28, 3, 61), tear = sm(0.62, 0.8, fb(u, v, 2, 9, 2, 63));
  const m = 0.9 + 0.22 * (fib - 0.5) - 0.12 * tear;
  return [m * 1.02, m, m * 0.95, 1];
};
// tent and fly cloth: soft mottle and creases
GEN[TILE.CANVAS] = (u, v) => {
  const mott = fb(u, v, 3, 3, 3, 71), crease = sm(0.62, 0.78, fb(u, v, 2, 6, 2, 73));
  const m = 0.95 + 0.07 * (mott - 0.5) - 0.05 * crease;
  return [m, m, m, 1];
};
// three-strand rope, u along it: the strands lie diagonally
GEN[TILE.ROPE] = (u, v) => {
  const t = (u * 3 + v * 2) % 1, prof = Math.sin(Math.PI * t);
  const m = 0.62 + 0.38 * Math.pow(prof, 0.6) + 0.08 * (fb(u, v, 6, 4, 2, 81) - 0.5);
  return [m, m * 0.97, m * 0.9, 1];
};
GEN[TILE.STONE] = (u, v) => {
  const b = fb(u, v, 3, 3, 3, 91), sp = fb(u, v, 20, 20, 2, 93);
  const m = 0.88 + 0.12 * (b - 0.5) - 0.08 * sm(0.66, 0.8, sp) + 0.04 * sm(0.34, 0.2, sp);
  return [m, m * 0.985, m * 0.975, 1];
};
// iron: dark, mottled, rust in patches
GEN[TILE.METAL] = (u, v) => {
  const rust = sm(0.5, 0.74, fb(u, v, 3, 3, 4, 101)), mot = fb(u, v, 8, 8, 2, 103);
  const c = mix3([0.27, 0.26, 0.25], [0.46, 0.29, 0.18], rust * 0.85), m = 0.9 + 0.2 * (mot - 0.5);
  return [c[0] * m, c[1] * m, c[2] * m, 1];
};
// the bed of a fire ring: pale ash, charred patches, bits of charcoal
GEN[TILE.ASH] = (u, v) => {
  const n = fb(u, v, 3, 3, 3, 111), bits = sm(0.7, 0.82, fb(u, v, 14, 14, 2, 113));
  let c = mix3([0.5, 0.49, 0.47], [0.3, 0.28, 0.27], sm(0.35, 0.7, n));
  c = mix3(c, [0.16, 0.15, 0.14], bits * 0.6);
  const m = 0.96 + 0.08 * (fb(u, v, 16, 16, 2, 117) - 0.5);
  return [c[0] * m, c[1] * m, c[2] * m, 1];
};
// shingles, u along the eave and v down the slope: five courses, tabs offset course to course, the shadow
// line under each butt, a slot between tabs, every tab its own tone
GEN[TILE.ROOF] = (u, v) => {
  const rows = 5, row = Math.floor(v * rows), fv = v * rows - row, tabs = 3, tu = u * tabs + (row % 2) * 0.5;
  const tab = ((Math.floor(tu) % tabs) + tabs) % tabs, fu = tu - Math.floor(tu);
  const h = NT[((row * 7 + tab * 31) & 255) * 256 + 77];
  const tone = 0.9 + 0.18 * (h - 0.5), shadow = fv < 0.12 ? 0.62 + 0.38 * sm(0, 0.12, fv) : 1;
  const slot = fu < 0.02 || fu > 0.98 ? 0.65 : 1, grain = 0.95 + 0.1 * (fb(u, v, 32, 32, 1, 121) - 0.5);
  const m = tone * shadow * slot * grain;
  return [m, m, m, 1];
};
// glass, mapped once across a pane (v = 0 at its head): the sky's reflection fading into a dark room, a streak
GEN[TILE.GLASS] = (u, v) => {
  const c = mix3([0.46, 0.53, 0.57], [0.15, 0.17, 0.19], sm(0.0, 0.75, v));
  const s = 0.22 * sm(0.07, 0, Math.abs(u - v * 0.55 - 0.18)) + 0.12 * sm(0.04, 0, Math.abs(u - v * 0.55 - 0.32));
  return [c[0] + s, c[1] + s, c[2] + s, 1];
};
GEN[TILE.HULL] = (u, v) => {
  const sc = sm(0.74, 0.9, fb(u, v, 2, 12, 3, 131)), mot = fb(u, v, 3, 2, 3, 133);
  const m = 0.96 + 0.05 * (mot - 0.5) + 0.06 * sc;
  return [m, m, m, 1];
};
// fibreglass (a latrine box, a cooler): plain with a faint orange-peel
GEN[TILE.FIBRE] = (u, v) => { const m = 0.95 + 0.06 * (fb(u, v, 12, 12, 2, 141) - 0.5) - 0.05 * sm(0.7, 0.85, fb(u, v, 2, 2, 3, 143)); return [m, m, m, 1]; };

// The portage sign: a stained board with PORTAGE routed into it, the letters picked out in cream (v = 0 at
// its top edge). Drawn with the 2D canvas, read back into the cell.
function signPixels() {
  const c = document.createElement('canvas'); c.width = INNER; c.height = INNER;
  const x = c.getContext('2d');
  x.fillStyle = '#7a5a3f'; x.fillRect(0, 0, INNER, INNER);
  for (let i = 0; i < 60; i++) { // grain
    const y = (i * 37) % INNER, a = 0.05 + ((i * 13) % 7) * 0.012;
    x.strokeStyle = i % 2 ? `rgba(30,20,12,${a})` : `rgba(140,110,80,${a})`; x.lineWidth = 1 + (i % 3);
    x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(70, y + 3, 150, y - 4, INNER, y + 1); x.stroke();
  }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = 60; const font = () => `bold ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  x.font = font(); while (x.measureText('PORTAGE').width > INNER - 24 && size > 20) { size -= 2; x.font = font(); }
  x.fillStyle = 'rgba(25,16,10,0.8)'; x.fillText('PORTAGE', INNER / 2 + 2, INNER / 2 + 3); // the routed groove's shadow
  x.fillStyle = '#e0d3ac'; x.fillText('PORTAGE', INNER / 2, INNER / 2);
  const d = x.getImageData(0, 0, INNER, INNER).data, out = new Float32Array(INNER * INNER * 4);
  for (let i = 0; i < out.length; i++) out[i] = d[i] / 255;
  return out;
}

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
let atlas = null;
function makeAtlas() {
  const data = new Uint8Array(ATLAS * ATLAS * 4), mean = [], gain = [];
  const tile = new Float32Array(INNER * INNER * 4);
  for (let k = 0; k < 16; k++) {
    if (k === TILE.SIGN) tile.set(signPixels());
    else {
      const gen = GEN[k] || GEN[TILE.PLAIN];
      for (let y = 0; y < INNER; y++) for (let x = 0; x < INNER; x++) {
        const c = gen((x + 0.5) / INNER, (y + 0.5) / INNER), o = (y * INNER + x) * 4;
        tile[o] = c[0]; tile[o + 1] = c[1]; tile[o + 2] = c[2]; tile[o + 3] = c[3];
      }
    }
    const cx = (k % 4) * CELL, cy = Math.floor(k / 4) * CELL;
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < CELL; j++) {
      const ty = (((j - GUT) % INNER) + INNER) % INNER;
      for (let i = 0; i < CELL; i++) {
        const tx = (((i - GUT) % INNER) + INNER) % INNER, s = (ty * INNER + tx) * 4, d = ((cy + j) * ATLAS + cx + i) * 4;
        for (let ch = 0; ch < 4; ch++) data[d + ch] = Math.max(0, Math.min(255, Math.round(tile[s + ch] * 255)));
        if (j >= GUT && j < GUT + INNER && i >= GUT && i < GUT + INNER) { r += toLin(data[d] / 255); g += toLin(data[d + 1] / 255); b += toLin(data[d + 2] / 255); a += data[d + 3] / 255; }
      }
    }
    const n = INNER * INNER;
    mean.push(new THREE.Vector4(r / n, g / n, b / n, a / n));
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / n;
    gain.push(SELF.has(k) ? 1 : 1 / Math.max(0.05, lum));
  }
  const tex = new THREE.DataTexture(data, ATLAS, ATLAS, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4; tex.needsUpdate = true;
  return { tex, mean, gain };
}

// --- the material -----------------------------------------------------------------------------------------------
// Every built thing: the look's smooth Lambert (wrap 0), the vertex colour as the hue, the atlas cell as the
// surface, the baked occlusion (aOcc) multiplied in. Paint: the cell's alpha says where the paint still is,
// the rest is weathered grey wood. A rock vertex (tile 16) takes no texture and the rock's sky fill (rocks.js:
// the fill desaturated and lifted so the shade side of granite reads cool grey, not navy).
export const PROP_FILL = { saturation: 0.4, lift: 1.3 };
export const WEATHERED = new THREE.Color(0x8e8a80); // wood the paint has worn off
let material = null;
export function propMaterial() {
  if (material) return material;
  if (!atlas) atlas = makeAtlas();
  const u = {
    uPropAtlas: { value: atlas.tex }, uPropMean: { value: atlas.mean }, uPropGain: { value: atlas.gain },
    uWeathered: { value: WEATHERED }, uPropFill: { value: new THREE.Vector2(PROP_FILL.saturation, PROP_FILL.lift) },
  };
  material = makeLookMaterial({}, {
    wrap: 0, name: 'look-prop',
    compile: (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute vec2 aPropUv;\nattribute float aPropTile;\nattribute float aOcc;\nvarying vec2 vPropUv;\nflat varying int vPropTile;\nvarying float vOcc;')
        .replace('#include <color_vertex>', '#include <color_vertex>\n\tvPropUv = aPropUv; vPropTile = int( aPropTile + 0.5 ); vOcc = aOcc;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <color_pars_fragment>', `#include <color_pars_fragment>
uniform sampler2D uPropAtlas;
uniform vec4 uPropMean[16];
uniform float uPropGain[16];
uniform vec3 uWeathered;
uniform vec2 uPropFill;
varying vec2 vPropUv;
flat varying int vPropTile;
varying float vOcc;
float propRock = 0.0;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
	if ( vPropTile >= 16 ) { propRock = 1.0; diffuseColor.rgb *= vOcc; }
	else {
		vec2 cell = vec2( float( vPropTile % 4 ), float( vPropTile / 4 ) );
		vec2 st = ( cell * ${CELL.toFixed(1)} + ${GUT.toFixed(1)} + fract( vPropUv ) * ${INNER.toFixed(1)} ) / ${ATLAS.toFixed(1)};
		vec2 gx = dFdx( vPropUv ) * ${(INNER / ATLAS).toFixed(5)}, gy = dFdy( vPropUv ) * ${(INNER / ATLAS).toFixed(5)};
		float fp = max( length( gx ), length( gy ) ) * ${ATLAS.toFixed(1)};
		float hold = min( 1.0, 8.0 / max( fp, 1e-4 ) );
		vec4 tx = textureGrad( uPropAtlas, st, gx * hold, gy * hold );
		tx = mix( tx, uPropMean[ vPropTile ], smoothstep( 4.0, 16.0, fp ) );
		vec3 base = diffuseColor.rgb;
		if ( vPropTile == ${TILE.PAINT} ) base = mix( mix( base, uWeathered, 0.6 ), base, tx.a );
		diffuseColor.rgb = base * tx.rgb * uPropGain[ vPropTile ] * vOcc;
	}`)
        .replace('reflectedLight.indirectDiffuse += irradiance * lookSky',
          'vec3 propIrr = mix( irradiance, mix( vec3( dot( irradiance, vec3( 0.2126, 0.7152, 0.0722 ) ) ), irradiance, uPropFill.x ) * uPropFill.y, propRock );\n  reflectedLight.indirectDiffuse += propIrr * lookSky');
      // rain: the wood soaks it up (porosity 1), a rock half as much and shines more
      applyWet(shader, { porosity: 'mix( 1.0, 0.5, propRock )', gloss: 'mix( 0.35, 0.7, propRock )' });
    },
  });
  material.userData.u = u;
  return material;
}

// --- the builder ------------------------------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _c = new THREE.Color();
const colOf = (col, p) => (typeof col === 'function' ? col(p) : col);

// Flat and smooth faces with texture coordinates in metres over a cell's size, a cell per vertex, the hue in
// the vertex colour and an occlusion factor (1 until baked). Non-indexed, triangle by triangle.
export class PropBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.t = []; this.o = []; }
  get count() { return this.p.length / 3; }
  vert(p, n, u, v, tile, col) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v); this.t.push(tile);
    const k = colOf(col, p); this.c.push(k.r, k.g, k.b); this.o.push(1);
  }
  // A flat convex polygon. Its normal from the winding, turned to face away from `ref` when given. UVs given
  // per point (`uvs`), or projected on `U` (the grain; default the first edge) and n x U from `o`, over the
  // cell's size times `scale`, plus `shift`.
  face(pts, tile, col, { ref = null, U = null, uvs = null, o = null, scale = 1, shift = null } = {}) {
    const m = pts.length;
    let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < m; i++) {
      const a = pts[i], b = pts[(i + 1) % m];
      nx += (a.y - b.y) * (a.z + b.z); ny += (a.z - b.z) * (a.x + b.x); nz += (a.x - b.x) * (a.y + b.y);
      cx += a.x; cy += a.y; cz += a.z;
    }
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    let order = pts.map((_, i) => i);
    if (ref && (cx / m - ref.x) * nx + (cy / m - ref.y) * ny + (cz / m - ref.z) * nz < 0) { nx = -nx; ny = -ny; nz = -nz; order = order.reverse(); }
    const n = V(nx, ny, nz);
    let uvv = uvs;
    if (!uvv) {
      const Uv = (U ? U.clone() : pts[1].clone().sub(pts[0])); Uv.addScaledVector(n, -Uv.dot(n));
      if (Uv.lengthSq() < 1e-12) Uv.set(Math.abs(nx) < 0.9 ? 1 : 0, Math.abs(nx) < 0.9 ? 0 : 1, 0).addScaledVector(n, -(Math.abs(nx) < 0.9 ? nx : ny));
      Uv.normalize();
      const W = n.clone().cross(Uv), org = o || pts[0], [su, sv] = TILE_SIZE[tile];
      const du = shift ? shift[0] : 0, dv = shift ? shift[1] : 0;
      uvv = pts.map((p) => { const d = p.clone().sub(org); return [d.dot(Uv) / (su * scale) + du, d.dot(W) / (sv * scale) + dv]; });
    }
    for (let k = 1; k < m - 1; k++) for (const i of [order[0], order[k], order[k + 1]]) this.vert(pts[i], n, uvv[i][0], uvv[i][1], tile, col);
    return this;
  }
  quad(a, b, c, d, tile, col, opts) { return this.face([a, b, c, d], tile, col, opts); }
  // A box about centre `o` with half extents (hx, hy, hz) along the unit axes X, Y, Z. `grain` ('x', 'y' or
  // 'z') runs the texture's u along that axis; the two faces square to it take `endTile` (default the same
  // cell, laid the other way). `skip` lists faces to leave out ('+x', '-y', ...); `col` may be a function.
  box(o, X, Y, Z, hx, hy, hz, tile, col, { grain = 'x', endTile = null, skip = null, shift = null, endCol = null } = {}) {
    const ax = { x: X, y: Y, z: Z }, G = ax[grain];
    const P = (sx, sy, sz) => o.clone().addScaledVector(X, sx * hx).addScaledVector(Y, sy * hy).addScaledVector(Z, sz * hz);
    for (const k of ['x', 'y', 'z']) for (const s of [1, -1]) {
      if (skip && skip.includes((s > 0 ? '+' : '-') + k)) continue;
      const [a, b] = k === 'x' ? ['y', 'z'] : k === 'y' ? ['x', 'z'] : ['x', 'y'];
      const pt = (i, j) => { const q = { x: 0, y: 0, z: 0 }; q[k] = s; q[a] = i; q[b] = j; return P(q.x, q.y, q.z); };
      const pts = [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)];
      const isEnd = k === grain;
      const t = isEnd && endTile !== null ? endTile : tile;
      let uvs = null;
      if (t === TILE.END || t === TILE.SIGN || t === TILE.GLASS) uvs = [[0.03, 0.97], [0.97, 0.97], [0.97, 0.03], [0.03, 0.03]];
      const U = isEnd ? ax[a] : G;
      this.face(pts, t, isEnd && endCol ? endCol : col, { ref: o, U, uvs, o: pts[0], shift });
    }
    return this;
  }
  // A round (or part-round) shaft from p0 to p1, radius r0 to r1, `sides` facets with smooth normals. Rings
  // at the fractions `ts`, coloured by `col(t)` when it is a function of t. `arc` [a0, a1] makes a part of it
  // (a split log), closed by a flat face of `flatTile`. Caps of `capTile` (end grain) at either end.
  cyl(p0, p1, r0, r1, sides, tile, col, { ts = [0, 1], cap0 = false, cap1 = false, capTile = TILE.END, capCol = null, arc = null, flatTile = TILE.SPLIT, flatCol = null, phase = 0, up = null, jitter = 0, rng = null } = {}) {
    const d = p1.clone().sub(p0), len = d.length(); d.normalize();
    const u = (up ? up.clone() : (Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0))).cross(d).normalize(), w = d.clone().cross(u);
    const a0 = arc ? arc[0] : phase, a1 = arc ? arc[1] : phase + Math.PI * 2, full = !arc;
    const segs = sides, slope = (r0 - r1) / len, [su, sv] = TILE_SIZE[tile];
    const rad = ts.map(() => Array.from({ length: segs + 1 }, () => 1 + (jitter && rng ? (rng() - 0.5) * jitter : 0)));
    if (full) for (const r of rad) r[segs] = r[0];
    const ringPt = (k, i) => { const t = ts[k], th = a0 + ((a1 - a0) * i) / segs, r = (r0 + (r1 - r0) * t) * rad[k][i]; return p0.clone().addScaledVector(d, t * len).addScaledVector(u, Math.cos(th) * r).addScaledVector(w, Math.sin(th) * r); };
    const nrm = (i) => { const th = a0 + ((a1 - a0) * i) / segs; return u.clone().multiplyScalar(Math.cos(th)).addScaledVector(w, Math.sin(th)).addScaledVector(d, slope).normalize(); };
    const cAt = (k) => (typeof col === 'function' ? col(ts[k]) : col);
    const rm = (r0 + r1) / 2;
    for (let k = 0; k < ts.length - 1; k++) {
      const ca = cAt(k), cb = cAt(k + 1);
      for (let i = 0; i < segs; i++) {
        const A = ringPt(k, i), B = ringPt(k, i + 1), C = ringPt(k + 1, i + 1), D = ringPt(k + 1, i);
        const nA = nrm(i), nB = nrm(i + 1);
        const ua = (ts[k] * len) / su, ub = (ts[k + 1] * len) / su, va = ((a1 - a0) * i * rm) / segs / sv, vb = ((a1 - a0) * (i + 1) * rm) / segs / sv;
        // (u, w, d) is right-handed, so A B C and A C D face out
        this.vert(A, nA, ua, va, tile, ca); this.vert(B, nB, ua, vb, tile, ca); this.vert(C, nB, ub, vb, tile, cb);
        this.vert(A, nA, ua, va, tile, ca); this.vert(C, nB, ub, vb, tile, cb); this.vert(D, nA, ub, va, tile, cb);
      }
    }
    if (!full) { // the flat face of a part-round shaft
      const last = ts.length - 1;
      const pts = [ringPt(0, 0), ringPt(last, 0), ringPt(last, segs), ringPt(0, segs)];
      this.face(pts, flatTile, flatCol || col, { ref: p0.clone().addScaledVector(d, len / 2).addScaledVector(u, Math.cos((a0 + a1) / 2) * rm).addScaledVector(w, Math.sin((a0 + a1) / 2) * rm), U: d });
    }
    const cap = (k, sign) => {
      const c = p0.clone().addScaledVector(d, ts[k] * len), pts = [], uvs = [];
      for (let i = 0; i < (full ? segs : segs + 1); i++) {
        const th = a0 + ((a1 - a0) * i) / segs; pts.push(ringPt(k, i));
        uvs.push([0.5 + 0.47 * Math.cos(th), 0.5 + 0.47 * Math.sin(th)]);
      }
      if (!full) { pts.push(c); uvs.push([0.5, 0.5]); }
      this.face(pts, capTile, capCol || cAt(k), { ref: c.clone().addScaledVector(d, -sign), uvs });
    };
    if (cap0) cap(0, -1);
    if (cap1) cap(ts.length - 1, 1);
    return this;
  }
  // A tube along the polyline `pts` (Vector3s), radius r (or r(t)), its rings carried along without twisting.
  tube(pts, r, sides, tile, col, { cap0 = false, cap1 = false } = {}) {
    const m = pts.length, cum = [0];
    for (let i = 1; i < m; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = cum[m - 1] || 1, dirs = [];
    for (let i = 0; i < m; i++) dirs.push(pts[Math.min(m - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
    let u = (Math.abs(dirs[0].y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(dirs[0]).normalize();
    const rings = [], norms = [], [su, sv] = TILE_SIZE[tile];
    for (let i = 0; i < m; i++) {
      const d = dirs[i]; u.addScaledVector(d, -u.dot(d)).normalize();
      const w = d.clone().cross(u), rr = typeof r === 'function' ? r(cum[i] / total) : r, ring = [], nr = [];
      for (let k = 0; k <= sides; k++) { const th = (k / sides) * Math.PI * 2, n = u.clone().multiplyScalar(Math.cos(th)).addScaledVector(w, Math.sin(th)); nr.push(n); ring.push(pts[i].clone().addScaledVector(n, rr)); }
      rings.push(ring); norms.push(nr);
    }
    const rr0 = typeof r === 'function' ? r(0.5) : r;
    for (let i = 1; i < m; i++) for (let k = 0; k < sides; k++) {
      const A = rings[i - 1][k], B = rings[i - 1][k + 1], C = rings[i][k + 1], D = rings[i][k];
      const ua = cum[i - 1] / su, ub = cum[i] / su, va = (k / sides) * 2 * Math.PI * rr0 / sv, vb = ((k + 1) / sides) * 2 * Math.PI * rr0 / sv;
      this.vert(A, norms[i - 1][k], ua, va, tile, col); this.vert(B, norms[i - 1][k + 1], ua, vb, tile, col); this.vert(C, norms[i][k + 1], ub, vb, tile, col);
      this.vert(A, norms[i - 1][k], ua, va, tile, col); this.vert(C, norms[i][k + 1], ub, vb, tile, col); this.vert(D, norms[i][k], ub, va, tile, col);
    }
    if (cap0) this.face(rings[0].slice(0, sides), tile, col, { ref: pts[0].clone().add(dirs[0]) });
    if (cap1) this.face(rings[m - 1].slice(0, sides), tile, col, { ref: pts[m - 1].clone().sub(dirs[m - 1]) });
    return this;
  }
  // a built geometry's vertices as they are (position, normal, colour, cells, occlusion)
  addBuilt(g) {
    const map = [['position', this.p], ['normal', this.n], ['color', this.c], ['aPropUv', this.uv], ['aPropTile', this.t], ['aOcc', this.o]];
    for (const [k, dst] of map) { const a = g.getAttribute(k).array; for (let i = 0; i < a.length; i++) dst.push(a[i]); }
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aPropUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aPropTile', new THREE.Float32BufferAttribute(this.t, 1));
    g.setAttribute('aOcc', new THREE.Float32BufferAttribute(this.o, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// --- a stone -------------------------------------------------------------------------------------------------
// A small stone as a convex chunk: a box with a few of its corners and edges sliced off by planes at random
// tilts, so it is a handful of big flat faces and no two are alike (the rock sheet at the scale of a fire ring
// or a pier). About 30 triangles. Built in a unit frame (x +-1, y 0..0.9, z +-0.7), moved by `matrix`.
function clipPoly(poly, n, h, cut) {
  const out = [], m = poly.length;
  for (let i = 0; i < m; i++) {
    const a = poly[i], b = poly[(i + 1) % m], da = a.dot(n) - h, db = b.dot(n) - h;
    if (da <= 0) out.push(a);
    if ((da < 0) !== (db < 0) && Math.abs(da - db) > 1e-9) { const p = a.clone().lerp(b, da / (da - db)); out.push(p); cut.push(p); }
  }
  return out;
}
export function chunkStone(b, matrix, rng, tint) {
  const x = 1, y0 = 0, y1 = 0.9, z = 0.7;
  const P = (sx, sy, sz) => V(sx * x, sy ? y1 : y0, sz * z);
  let faces = [
    [P(1, 0, -1), P(1, 1, -1), P(1, 1, 1), P(1, 0, 1)], [P(-1, 0, -1), P(-1, 0, 1), P(-1, 1, 1), P(-1, 1, -1)],
    [P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1)], [P(-1, 0, -1), P(1, 0, -1), P(1, 0, 1), P(-1, 0, 1)],
    [P(-1, 0, 1), P(1, 0, 1), P(1, 1, 1), P(-1, 1, 1)], [P(-1, 0, -1), P(-1, 1, -1), P(1, 1, -1), P(1, 0, -1)],
  ];
  const cuts = 4 + Math.floor(rng() * 3);
  for (let k = 0; k < cuts; k++) {
    // a corner or an edge of the upper part, sliced a random depth
    const n = V((rng() < 0.5 ? -1 : 1) * (0.4 + rng()), 0.35 + rng() * 1.1, (rng() < 0.5 ? -1 : 1) * (rng() < 0.3 ? 0 : 0.4 + rng())).normalize();
    let hmax = -Infinity; for (const f of faces) for (const p of f) hmax = Math.max(hmax, p.dot(n));
    const h = hmax - (0.15 + rng() * 0.3), cut = [];
    faces = faces.map((f) => clipPoly(f, n, h, cut)).filter((f) => f.length >= 3);
    const uniq = [];
    for (const p of cut) if (!uniq.some((q) => q.distanceToSquared(p) < 1e-8)) uniq.push(p);
    if (uniq.length >= 3) {
      const c = uniq.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / uniq.length);
      const u = (Math.abs(n.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(n).normalize(), w = n.clone().cross(u);
      uniq.sort((p, q) => Math.atan2(p.clone().sub(c).dot(w), p.clone().sub(c).dot(u)) - Math.atan2(q.clone().sub(c).dot(w), q.clone().sub(c).dot(u)));
      faces.push(uniq);
    }
  }
  const t = new PropBuilder(), ref = V(0, 0.4, 0), sh = [rng() * 3, rng() * 3];
  const col = (p) => _c.copy(tint).multiplyScalar(0.72 + 0.28 * Math.min(1, Math.max(0, p.y / 0.5)));
  for (const f of faces) t.face(f, TILE.STONE, col, { ref, shift: sh, scale: 0.6 });
  const g = t.build();
  g.applyMatrix4(matrix);
  b.addBuilt(g);
  return b;
}

// --- occlusion --------------------------------------------------------------------------------------------------
// Ambient occlusion baked per vertex into aOcc against a handful of boxes (the deck, the walls, the roof as
// solid blocks) and the ground, instead of every triangle of the piece: a dock or a shack is hundreds of
// small parts, and what darkens them is the big volumes near them (the deck over the stringers, the eaves
// over the wall, the floor over the crawl space, the ground). Cosine-weighted rays as in occlusion.js; a hit
// close by counts more than one at the edge of the reach. A vertex inside a box (a pile's head in its cap)
// is fully occluded. Faces that run into the ground darken toward it.
//   boxes: [{ c, X, Y, Z, h: [hx, hy, hz] }]   ground: a number or (x, z) => y, or null
const DIRS = new Map();
function dirs(n) {
  let d = DIRS.get(n);
  if (d) return d;
  d = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, v = ((i * 0.6180339887) % 1), r = Math.sqrt(u), ph = 2 * Math.PI * v;
    d[i * 3] = r * Math.cos(ph); d[i * 3 + 1] = r * Math.sin(ph); d[i * 3 + 2] = Math.sqrt(Math.max(0, 1 - u));
  }
  DIRS.set(n, d);
  return d;
}
export function obb(c, X, Y, Z, hx, hy, hz) { return { c, X, Y, Z, h: [hx, hy, hz] }; }
export function occlude(geo, boxes, { ground = null, rays = 12, reach = 1.2, floor = 0.35, bury = 0.3, buryFloor = 0.4 } = {}) {
  const P = geo.getAttribute('position').array, N = geo.getAttribute('normal').array, O = geo.getAttribute('aOcc');
  const D = dirs(rays), R = reach, eps = 0.004;
  const B = boxes.map((b) => [b.c.x, b.c.y, b.c.z, b.X.x, b.X.y, b.X.z, b.Y.x, b.Y.y, b.Y.z, b.Z.x, b.Z.y, b.Z.z, b.h[0], b.h[1], b.h[2]]);
  const near = new Int32Array(B.length);
  const gfn = typeof ground === 'function' ? ground : null;
  // vertices repeat (the geometry is flat, three a triangle): a numeric hash of the quantised position and
  // normal, checked against the stored quantised values, so a repeat costs a lookup
  const cache = new Map(), qs = [];
  for (let v = 0; v < O.count; v++) {
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
    let nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
    const q0 = Math.round(px * 500), q1 = Math.round(py * 500), q2 = Math.round(pz * 500), q3 = Math.round(nx * 50) * 10201 + Math.round(ny * 50) * 101 + Math.round(nz * 50);
    const h = (Math.imul(q0, 73856093) ^ Math.imul(q1, 19349663) ^ Math.imul(q2, 83492791) ^ Math.imul(q3, 2654435761)) >>> 0;
    const hit = cache.get(h);
    if (hit !== undefined && qs[hit] === q0 && qs[hit + 1] === q1 && qs[hit + 2] === q2 && qs[hit + 3] === q3) { O.setX(v, O.getX(v) * qs[hit + 4]); continue; }
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let tx, ty, tz;
    if (Math.abs(ny) < 0.9) { tx = nz; ty = 0; tz = -nx; } else { tx = 0; ty = -nz; tz = ny; }
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    const ox = px + nx * eps, oy = py + ny * eps, oz = pz + nz * eps;
    const gy = ground === null ? null : gfn ? gfn(px, pz) : ground;
    // only the boxes within reach of this vertex
    let nn = 0;
    for (let i = 0; i < B.length; i++) {
      const q = B[i], rx = ox - q[0], ry = oy - q[1], rz = oz - q[2];
      let d2 = 0;
      for (let s = 0; s < 3; s++) { const o = Math.abs(rx * q[3 + s * 3] + ry * q[4 + s * 3] + rz * q[5 + s * 3]) - q[12 + s]; if (o > 0) d2 += o * o; }
      if (d2 < R * R) near[nn++] = i;
    }
    let occ = 0;
    for (let r = 0; r < rays; r++) {
      const a = D[r * 3], b = D[r * 3 + 1], hh = D[r * 3 + 2];
      const dx = tx * a + bx * b + nx * hh, dy = ty * a + by * b + ny * hh, dz = tz * a + bz * b + nz * hh;
      let best = R;
      if (gy !== null && dy < -1e-4) { const t = (oy - gy) / -dy; if (t >= 0 && t < best) best = t; }
      for (let j = 0; j < nn && best > 0; j++) {
        const q = B[near[j]], rx = ox - q[0], ry = oy - q[1], rz = oz - q[2];
        let t0 = -Infinity, t1 = Infinity;
        for (let s = 0; s < 3; s++) {
          const ax = q[3 + s * 3], ay = q[4 + s * 3], az = q[5 + s * 3], hb = q[12 + s];
          const o = rx * ax + ry * ay + rz * az, dd = dx * ax + dy * ay + dz * az;
          if (Math.abs(dd) < 1e-9) { if (o < -hb || o > hb) { t0 = Infinity; break; } continue; }
          let ta = (-hb - o) / dd, tb = (hb - o) / dd;
          if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
          if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
          if (t0 > t1) break;
        }
        if (t0 <= t1 && t1 > 0) { const t = Math.max(0, t0); if (t < best) best = t; }
      }
      if (best < R) occ += 1 - (best / R) * (best / R);
    }
    let k = floor + (1 - floor) * (1 - occ / rays);
    if (gy !== null) { const dgy = py - gy; if (dgy < 0) k *= 1 - (1 - buryFloor) * sm(0, bury, -dgy); }
    if (hit === undefined) { cache.set(h, qs.length); qs.push(q0, q1, q2, q3, k); }
    O.setX(v, O.getX(v) * k);
  }
  O.needsUpdate = true;
  return geo;
}
// The exact bake (occlusion.js) against the geometry's own triangles, into aOcc: for the pieces built once
// and placed many times (a hull, a tent).
export function bakeSelf(geo, opts) {
  const col = geo.getAttribute('color'), keep = col.array.slice();
  col.array.fill(1);
  bakeOcclusion(geo, opts);
  const O = geo.getAttribute('aOcc');
  for (let i = 0; i < O.count; i++) O.setX(i, O.getX(i) * col.array[i * 3]);
  col.array.set(keep); col.needsUpdate = true; O.needsUpdate = true;
  return geo;
}

// --- the terrain's own height ----------------------------------------------------------------------------------
// Things stand on the terrain mesh as drawn, not on the smooth field it was built from: near the shore the
// mesh carries rock bumps at its mid-cell vertices (terrain-build.js shoreBumps) that the field does not, up
// to a metre at the lodge, and between vertices the mesh is flat triangles where the field is bilinear. So
// anything placed on the field floats or sinks. This reads a fine tile's own triangles (tile-local positions
// and index, as the build worker produced them): every triangle lies inside one 10 m lattice cell (the quad
// between four cell centres; quad i spans tile-local x from (i + 0.5) to (i + 1.5) cells, so the first half
// cell of a tile belongs to its neighbour's mesh), so they are bucketed by cell once and a lookup tests the
// few in its cell. tiles.js keeps one per installed fine tile (`TileManager.groundAt`, the game's ground).
export class MeshGround {
  constructor(t, cell, n) {
    this.t = t; this.cell = cell; this.n = n;
    const P = t.pos, I = t.idx, nt = I.length / 3, nn = n * n;
    const start = new Int32Array(nn + 1), of = new Int32Array(nt);
    let sorted = true, prev = -1;
    for (let k = 0; k < nt; k++) {
      const a = I[k * 3] * 3, b = I[k * 3 + 1] * 3, c = I[k * 3 + 2] * 3;
      const i = Math.floor((P[a] + P[b] + P[c]) / 3 / cell - 0.5), j = Math.floor((P[a + 2] + P[b + 2] + P[c + 2]) / 3 / cell - 0.5);
      let q = i >= 0 && i < n && j >= 0 && j < n ? j * n + i : -1;
      // a sliver of no area (the waterline cut through a cell corner) can sit on a quad's edge; no lookup ever
      // lands in it (scan skips it), so it stays with the quad before it
      if (prev >= 0 && Math.abs((P[b] - P[a]) * (P[c + 2] - P[a + 2]) - (P[c] - P[a]) * (P[b + 2] - P[a + 2])) < 1e-9) q = prev;
      of[k] = q; if (q >= 0) start[q + 1]++;
      if (q < prev) sorted = false; else prev = q;
    }
    for (let q = 0; q < nn; q++) start[q + 1] += start[q];
    // buildTerrainChunk emits each quad's triangles together, row by row: then the bucket list is the identity
    // and is not kept (a megabyte a tile)
    let list = null;
    if (!sorted || start[nn] !== nt) {
      const fill = start.slice(0, nn);
      list = new Int32Array(start[nn]);
      for (let k = 0; k < nt; k++) if (of[k] >= 0) list[fill[of[k]]++] = k;
    }
    this.start = start; this.list = list;
    this.hit = { tri: -1, w0: 0, w1: 0, w2: 0 };
    this.best = { k: -1, e: -Infinity, w0: 0, w1: 0, w2: 0 };
  }
  // the triangle under tile-local (x, z) and its barycentric weights, or null
  locate(x, z) {
    const ci = Math.floor(x / this.cell - 0.5), cj = Math.floor(z / this.cell - 0.5);
    const best = this.best;
    best.k = -1; best.e = -Infinity;
    this.scan(ci, cj, x, z, best);
    if (best.e < -1e-6) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj) this.scan(ci + di, cj + dj, x, z, best);
    if (best.k < 0 || best.e < -0.02) return null;
    const h = this.hit; h.tri = best.k; h.w0 = best.w0; h.w1 = best.w1; h.w2 = best.w2;
    return h;
  }
  scan(i, j, x, z, best) {
    const n = this.n;
    if (i < 0 || j < 0 || i >= n || j >= n) return;
    const P = this.t.pos, I = this.t.idx, L = this.list, q = j * n + i;
    for (let s = this.start[q]; s < this.start[q + 1]; s++) {
      const k = L ? L[s] : s, a = I[k * 3] * 3, b = I[k * 3 + 1] * 3, c = I[k * 3 + 2] * 3;
      const ax = P[a], az = P[a + 2], bx = P[b], bz = P[b + 2], cx = P[c], cz = P[c + 2];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-9) continue;
      const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l2 = 1 - l0 - l1;
      const e = Math.min(l0, l1, l2);
      if (e > best.e) { best.e = e; best.k = k; best.w0 = l0; best.w1 = l1; best.w2 = l2; }
      if (e >= -1e-7) return;
    }
  }
  // the drawn ground's height at tile-local (x, z), or NaN off this tile's mesh
  height(x, z) {
    const h = this.locate(x, z);
    if (!h) return NaN;
    const P = this.t.pos, I = this.t.idx, k = h.tri;
    return P[I[k * 3] * 3 + 1] * h.w0 + P[I[k * 3 + 1] * 3 + 1] * h.w1 + P[I[k * 3 + 2] * 3 + 1] * h.w2;
  }
  // an attribute of `size` components interpolated at the last located point (scale: 1/127 for the normals)
  interp(arr, size, out, scale = 1) {
    const h = this.hit, I = this.t.idx, k = h.tri, a = I[k * 3] * size, b = I[k * 3 + 1] * size, c = I[k * 3 + 2] * size;
    for (let s = 0; s < size; s++) out[s] = (arr[a + s] * h.w0 + arr[b + s] * h.w1 + arr[c + s] * h.w2) * scale;
    return out;
  }
}

// --- a canoe ----------------------------------------------------------------------------------------------------
// The hull reads like the paddler's (canoe.js): the same lines, a little shorter, with gunwales, decks,
// thwarts, a yoke and seats. Local frame: +x bow, +y up, +z starboard, origin at the waterline amidships.
export const HULL_LENGTH = 5.0;
export function hullProfile(u) {
  const w = 0.45 * Math.pow(1 - Math.pow(u, 4), 0.6);
  const g = 0.3 + 0.13 * Math.pow(u, 4);
  const b = -0.33 * Math.pow(1 - Math.pow(u, 8), 0.7);
  return { w, g, b };
}
export function buildHull(b, shell, inner, wood, cane) {
  const S = 16, side = 4, L = HULL_LENGTH, grid = [];
  const at = (s, k) => {
    const u = (s / S) * 2 - 1, x = u * L * 0.5, { w, g, b: kb } = hullProfile(u), t = Math.abs(k) / side;
    const y = kb + (g - kb) * Math.pow(1 - Math.cos((t * Math.PI) / 2), 0.75);
    const z = Math.sign(k) * w * Math.pow(Math.sin((t * Math.PI) / 2), 0.85);
    return V(x, y, z);
  };
  for (let s = 0; s <= S; s++) { const row = []; for (let k = -side; k <= side; k++) row.push(at(s, k)); grid.push(row); }
  // smooth normals from the surface's own tangents; the stems (s = 0, S) take their neighbours'
  const nrm = (s, k) => {
    const s0 = Math.max(1, Math.min(S - 1, s)), kk = k + side;
    const ds = grid[Math.min(S, s0 + 1)][kk].clone().sub(grid[Math.max(0, s0 - 1)][kk]);
    const dk = grid[s0][Math.min(2 * side, kk + 1)].clone().sub(grid[s0][Math.max(0, kk - 1)]);
    const n = dk.cross(ds).normalize(), p = grid[s0][kk];
    if (n.y * (p.y - 0.15) + n.z * p.z < 0) n.negate();
    return n;
  };
  const N = grid.map((row, s) => row.map((_, kk) => nrm(s, kk - side)));
  const [su, sv] = TILE_SIZE[TILE.HULL];
  for (let s = 0; s < S; s++) for (let kk = 0; kk < 2 * side; kk++) {
    const A = grid[s][kk], B = grid[s][kk + 1], C = grid[s + 1][kk + 1], D = grid[s + 1][kk];
    const nA = N[s][kk], nB = N[s][kk + 1], nC = N[s + 1][kk + 1], nD = N[s + 1][kk];
    const uv = (p) => [p.x / su, (p.y + Math.abs(p.z)) / sv];
    const out = [[A, nA], [B, nB], [C, nC], [D, nD]];
    const tri = (q, tile, col, off, flip) => {
      for (const [p, n] of q) { const o = p.clone().addScaledVector(n, -off), nn = flip ? n.clone().negate() : n, [u, v] = uv(p); b.vert(o, nn, u, v, tile, col); }
    };
    // outside: A, B, C / A, C, D (the winding that faces out with these normals is checked below)
    const f1 = [out[0], out[1], out[2]], f2 = [out[0], out[2], out[3]];
    const e1 = B.clone().sub(A), e2 = C.clone().sub(A), fn = e1.cross(e2);
    const outward = fn.dot(nA.clone().add(nC)) > 0;
    const o1 = outward ? f1 : [f1[0], f1[2], f1[1]], o2 = outward ? f2 : [f2[0], f2[2], f2[1]];
    tri(o1, TILE.HULL, shell, 0, false); tri(o2, TILE.HULL, shell, 0, false);
    tri([o1[0], o1[2], o1[1]], TILE.HULL, inner, 0.007, true); tri([o2[0], o2[2], o2[1]], TILE.HULL, inner, 0.007, true);
  }
  // gunwales: a rail along each sheer, proud of the hull on both faces
  for (const sgn of [-1, 1]) {
    const kk = sgn < 0 ? 0 : 2 * side, pts = [];
    for (let s = 0; s <= S; s++) pts.push(grid[s][kk]);
    for (let s = 0; s < S; s++) {
      const a = pts[s], c = pts[s + 1], ref = V((a.x + c.x) / 2, a.y - 0.3, 0);
      const q = (p, dy, dz) => V(p.x, p.y + dy, p.z + sgn * dz);
      b.quad(q(a, 0.025, 0.03), q(c, 0.025, 0.03), q(c, 0.025, -0.035), q(a, 0.025, -0.035), TILE.WOOD, wood, { ref, U: c.clone().sub(a) });
      b.quad(q(a, -0.035, 0.03), q(c, -0.035, 0.03), q(c, 0.025, 0.03), q(a, 0.025, 0.03), TILE.WOOD, wood, { ref: V((a.x + c.x) / 2, a.y, 0), U: c.clone().sub(a) });
      b.quad(q(a, -0.035, -0.035), q(c, -0.035, -0.035), q(c, 0.025, -0.035), q(a, 0.025, -0.035), TILE.WOOD, wood, { ref: V((a.x + c.x) / 2, a.y, sgn * 2), U: c.clone().sub(a) });
      b.quad(q(a, -0.035, 0.03), q(c, -0.035, 0.03), q(c, -0.035, -0.035), q(a, -0.035, -0.035), TILE.WOOD, wood, { ref: V((a.x + c.x) / 2, a.y + 0.3, 0), U: c.clone().sub(a) });
    }
  }
  // the decks at bow and stern: a plate between the gunwales over the last station
  for (const s of [0, S - 1]) {
    const e = s === 0 ? 0 : S, m = s === 0 ? 1 : S - 1;
    const p0 = grid[e][side], pl = grid[m][0], pr = grid[m][2 * side];
    b.face([V(p0.x, p0.y + 0.012, 0), V(pl.x, pl.y + 0.012, pl.z), V(pr.x, pr.y + 0.012, pr.z)], TILE.WOOD, wood, { ref: V(p0.x, p0.y - 1, 0) });
    b.face([V(p0.x, p0.y - 0.005, 0), V(pl.x, pl.y - 0.005, pl.z), V(pr.x, pr.y - 0.005, pr.z)], TILE.WOOD, wood, { ref: V(p0.x, p0.y + 1, 0) });
  }
  // thwarts, the yoke, the seats: boxes from gunwale to gunwale
  const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  const across = (x, y, hx, hy, inset, col, tile = TILE.WOOD) => {
    const u = (x / L) * 2, { w, g } = hullProfile(u);
    b.box(V(x, g + y, 0), X, Y, Z, hx, hy, w - inset, tile, col, { grain: 'z' });
  };
  across(0, -0.01, 0.035, 0.02, 0.01, wood);
  across(0.95, -0.02, 0.025, 0.015, 0.02, wood); across(-0.95, -0.02, 0.025, 0.015, 0.02, wood);
  across(1.7, -0.2, 0.16, 0.018, 0.1, cane, TILE.SPLIT); across(-1.62, -0.2, 0.16, 0.018, 0.06, cane, TILE.SPLIT);
  return b;
}

// --- the trail ---------------------------------------------------------------------------------------------------
// A worn footpath laid over the ground as a decal: the terrain's own splat weights and normals are carried on
// its vertices, so the shader paints the exact ground colour under it (terrain.js groundColor) and lights it
// the same (with the same fine relief), then wears a lighter strip of packed soil down the middle with ragged
// edges and fades out at the margins and the ends. Alpha-blended, depth-tested, writing no depth, drawn a
// hair above the mesh with a polygon offset, so it never fights the ground.
const lin3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const splat = (name) => (SPLAT.find((m) => m.name === name) || SPLAT[0]).lit;
let trailMat = null;
export function trailMaterial() {
  if (trailMat) return trailMat;
  const duff = splat('duff'), shore = splat('shore');
  // packed soil: the damp shore margin's grey-brown lightened toward the duff's warmth
  const soil = [0, 1, 2].map((i) => (shore[i] * 0.6 + duff[i] * 0.4) * 0.98);
  const u = { uTrailSoil: { value: lin3(soil) }, uTrailEdge: { value: 0.8 } };
  const vary = 'varying vec4 vSplatA;\nvarying vec4 vSplatB;\nvarying vec4 vFloor;\nvarying vec3 vLookWorld;\nvarying vec4 vTrail;';
  trailMat = makeLookMaterial({ vertexColors: false, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, {
    wrap: 0, name: 'look-trail',
    compile: (shader) => {
      Object.assign(shader.uniforms, groundUniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute vec4 aSplatA;\nattribute vec4 aSplatB;\nattribute vec4 aFloor;\nattribute vec4 aTrail;\n' + vary)
        .replace('#include <project_vertex>', '#include <project_vertex>\n\tvSplatA = aSplatA; vSplatB = aSplatB; vFloor = aFloor; vTrail = aTrail;\n\tvLookWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <color_pars_fragment>', '#include <color_pars_fragment>\n' + vary + '\nuniform vec3 uTrailSoil;\nuniform float uTrailEdge;\n' + glslGround)
        .replace('#include <color_fragment>', `
	float lookPx = length( fwidth( vLookWorld.xz ) );
	vec3 groundC = groundColor( vLookWorld.xz, vSplatA, vSplatB, vFloor, lookPx );
	vec2 q = vLookWorld.xz;
	// how far across the path (0 middle, 1 the outer margin), pushed about so neither edge runs straight
	float wob = ( lookFbm( q / 0.8, 31u, 2 ) - 0.5 ) * 0.36 + ( lookFbm( q / 3.5, 32u, 2 ) - 0.5 ) * 0.3;
	float a = abs( vTrail.x ) + wob;
	float core = 1.0 - smoothstep( 0.22, 0.56, a );          // the packed middle
	float worn = 1.0 - smoothstep( 0.5, 0.95, a );           // the trodden margin
	float grit = lookFbm( q / 0.22, 33u, 2 ), clump = lookFbm( q / 1.4, 34u, 2 );
	// packed soil, pulled toward a lighter, greyer take on the ground it crosses, so the path shows on any floor
	float gl = dot( groundC, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 packed = mix( uTrailSoil, vec3( gl ) * vec3( 1.05, 1.0, 0.92 ) * 1.3, 0.5 );
	vec3 soil = packed * ( 0.9 + 0.2 * grit ) * mix( 0.9, 1.08, clump );
	float peb = smoothstep( 0.62, 0.78, lookFbm( mat2( 0.8, 0.6, -0.6, 0.8 ) * q / 0.12 + vec2( 3.3, 1.7 ), 35u, 2 ) ) * lookFade( 0.12, lookPx );
	soil *= 1.0 + 0.18 * peb * core;                          // pebbles and roots worn pale
	vec3 col = mix( groundC * mix( 1.0, uTrailEdge, worn ), soil, core * vTrail.w );
	diffuseColor.rgb = col;
	diffuseColor.a = worn * vTrail.z;`)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\t{ vec2 r = groundRelief( vLookWorld.xz, lookPx ) * ( 1.0 - vFloor.z ); normal = normalize( normal + mat3( viewMatrix ) * vec3( r.x, 0.0, r.y ) ); }');
      applyWet(shader, { porosity: '1.0', gloss: '0.3 * ( 1.0 - 0.7 * groundCanopy )' }); // the packed soil wets as the ground round it does
    },
  });
  return trailMat;
}
