// The creeks the bake no longer paddles, and the beaver's works (the wetlands round, 2026-10-31; the owner: "we assume
// all are navigable right now when thats not the case", "also include beaver dam placement too"). The bake (scripts/
// creeks.mjs) told every OSM waterway river, marsh channel or brook: the rivers and the marsh channels are water in the
// tiles as before; a brook is land now, and comes here as a line (creeks.json `brooks`), with the beaver dams at the
// outlets of the NWI's beaver ponds (`dams`). See docs/wetland-data.md.
//
//   brooks   a narrow stony bed on the ground along the line (2-4 ft), wet stones and a thin moving sheen of water
//            down a perennial one; an intermittent one (NHD's 46003) runs in the May melt and June, a dry bed of stones
//            from mid-July. One decal mesh a tile (BrookDecal, the trail's way: the terrain's own splats under it) and
//            a few stones in the tile's prop mesh. Cut into the ground (round 2): on the 2 m LiDAR detail a little V
//            (brook-cut.js), the decal draped into it; its banks darker and damp, a lip of stones, so on the 10 m
//            ground (too coarse for a channel a metre wide) it still reads as cut. Underfoot a wading step (player.js brookAt, audio.js footfall); the
//            nearest running one trickles (main.js, through audio.whiteWater).
//   dams     a low curved mound of peeled sticks and mud across `yaw`, `len` long; an `old` one (a drained beaver
//            meadow) lower, grassed over and breached in the middle. A lodge, a dome of sticks about 6 m across and
//            1.5 m high, where the dam has one. Built per tile with the props (props.js tilePropsSteps).
//            A `route` dam lies across a paddled creek: the canoe is held off it, and a held E hauls it over onto the
//            water below (player.js damsNear, haul).
//   seasons  a creek record `seasonal` (its paddled part mostly intermittent or seasonally flooded) runs shallow from
//            late July through September: the canoe drags and scrapes (player.js creekDrag), still passable, and its
//            water stands up to 1.3 ft lower, the mud of the bank showing (water-build.js lowCreeks).
import * as THREE from 'three';
import { mulberry32, hash2, noise2, smoothstep, clamp } from './rng.js';
import { makeLookMaterial } from './shading.js';
import { groundUniforms, glslGround, mireSheen } from './terrain.js';
import { applyWet } from './weather.js';
import { PropBuilder, TILE, chunkStone, occlude } from './prop-kit.js';

// the beds and the dams in metres; the seasons by day of the year
export const BROOK = {
  hw: [0.36, 0.56],     // half width of the stony bed (the decal's margin fades past it): 2-4 ft of stones
  step: 1.2,            // rows along it
  clear: 1.8,           // the trees and brush kept off the bed (props.js exclusionsFor; wetlands round 2: wider, fewer crowns over it)
  bank: 2.4,            // wetlands round 2: the decal's banks reach this many half widths out (brook-cut.js: the cut itself)
  stones: 0.5,          // stones a metre of bed, at most
  heard: 45,            // a running brook heard within this
};
export const DAM = {
  keep: 1.5,            // the hull held this far off a route dam's line (each end and the middle)
  side: 1.0,            // past its ends by this much
  reach: 4.5,           // the bow this near the line: the haul-over offered
  lodgeR: 3.0, lodgeH: 1.5,
};
// a perennial brook's water (0 dry .. 1 full): the spring flood, then lower through the summer; season.flow is the
// Kawishiwi's gauge over its mean (season.js), so a wet year's brooks run fuller. Under the ice, none to see.
export function brookWater(season, perennial) {
  if (!season) return perennial ? 0.7 : 0.3;
  const d = season.doy, ice = season.ice || 0;
  if (perennial) return (1 - ice) * clamp(0.35 + 0.45 * clamp((season.flow ?? 1) - 0.4, 0, 1.4), 0.3, 1);
  // intermittent: the melt and June, drying away by mid-July, a little back with the October rains
  const spring = smoothstep(118, 130, d) * (1 - smoothstep(178, 198, d)), fall = 0.35 * smoothstep(262, 280, d) * (1 - smoothstep(300, 315, d));
  return (1 - ice) * Math.max(spring, fall);
}
// how low a seasonal marsh channel runs (0 normal .. 1 at its lowest): late July through September (water-build.js, so
// the tile worker draws the low water by the same curve)
export { lowWater } from './water-build.js';

// ---- the data -------------------------------------------------------------------------------------------------------
// creeks.json in world metres; bucketed per world tile so a tile's props, the walker and the map find theirs quickly.
export class Creeks {
  static async load(world, base) {
    const name = world.meta && world.meta.creeks;
    if (!name) return null;
    try {
      const r = await fetch(base + name);
      if (!r.ok) return null;
      return new Creeks(await r.json(), world);
    } catch (e) { console.warn('creeks', e); return null; }
  }
  constructor(data, world) {
    this.world = world;
    const T = world.tileMetres, ox = world.originX, oz = world.originZ;
    this.T = T; this.ox = ox; this.oz = oz; this.ntx = world.ntx;
    this.brookBins = new Map(); this.damBins = new Map();
    const bin = (m, tx, ty, i) => { const k = ty * this.ntx + tx; const a = m.get(k); if (a) { if (a[a.length - 1] !== i) a.push(i); } else m.set(k, [i]); };
    this.brooks = (data.brooks || []).map((b, i) => {
      const p = b.pts, pts = [];
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k + 1 < p.length; k += 2) { const x = p[k], z = p[k + 1]; pts.push([x, z]); if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      const r = { id: b.id, i, perennial: b.perennial !== false, pts, bbox: [x0, z0, x1, z1] };
      const tx0 = Math.floor((x0 - 3 - ox) / T), tx1 = Math.floor((x1 + 3 - ox) / T), ty0 = Math.floor((z0 - 3 - oz) / T), ty1 = Math.floor((z1 + 3 - oz) / T);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) bin(this.brookBins, tx, ty, i);
      return r;
    }).filter((b) => b.pts.length > 1);
    // (the bake sometimes puts an old meadow's dam on the very outlet of a live pond's: the live one stands there)
    const cellOf = (x, z) => Math.floor(x / 8) * 100000 + Math.floor(z / 8), live = new Set();
    for (const d of data.dams || []) if (!d.old) for (const ex of [-8, 0, 8]) for (const ez of [-8, 0, 8]) live.add(cellOf(d.x + ex, d.z + ez));
    const dams = (data.dams || []).filter((d) => !d.old || !live.has(cellOf(d.x, d.z)));
    this.dams = dams.map((d, i) => ({ ...d, i, ax: Math.sin(d.yaw), az: Math.cos(d.yaw) }));
    for (const d of this.dams) {
      bin(this.damBins, Math.floor((d.x - ox) / T), Math.floor((d.z - oz) / T), d.i);
      if (d.lodge) bin(this.damBins, Math.floor((d.lodge[0] - ox) / T), Math.floor((d.lodge[1] - oz) / T), d.i);
    }
  }
  // indices of the brooks or the dams binned to the tiles a box touches
  _in(bins, list, x0, z0, x1, z1) {
    const T = this.T, out = new Set();
    const tx0 = Math.floor((x0 - this.ox) / T), tx1 = Math.floor((x1 - this.ox) / T), ty0 = Math.floor((z0 - this.oz) / T), ty1 = Math.floor((z1 - this.oz) / T);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const a = bins.get(ty * this.ntx + tx); if (a) for (const i of a) out.add(i); }
    return [...out].map((i) => list[i]);
  }
  brooksIn(x0, z0, x1, z1) { return this._in(this.brookBins, this.brooks, x0, z0, x1, z1).filter((b) => !(b.bbox[2] < x0 || b.bbox[0] > x1 || b.bbox[3] < z0 || b.bbox[1] > z1)); }
  damsIn(x0, z0, x1, z1) { return this._in(this.damBins, this.dams, x0, z0, x1, z1).filter((d) => d.x >= x0 && d.x <= x1 && d.z >= z0 && d.z <= z1); }
  damsNear(x, z, r) { return this.damsIn(x - r, z - r, x + r, z + r); }
  // the nearest brook line to (x, z) within r: { b, d, x, z } (the nearest point on it), or null
  brookAt(x, z, r = 2) {
    let best = null;
    for (const b of this.brooksIn(x - r, z - r, x + r, z + r)) {
      const p = b.pts;
      for (let k = 1; k < p.length; k++) {
        const [ax, az] = p[k - 1], [bx, bz] = p[k], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
        if (d <= r && (!best || d < best.d)) best = { b, d, x: px, z: pz };
      }
    }
    return best;
  }
  // a route dam's frame at (x, z): s across its line (signed), u along it
  frame(d, x, z) { const dx = x - d.x, dz = z - d.z; return { u: dx * d.ax + dz * d.az, s: dx * d.az - dz * d.ax }; }
  // the running brooks heard near (x, z): [{ x, y, z, size, kind: 'brook', d }] for audio-beds.js, at most two
  heard(x, z, season, groundAt) {
    const out = [], R = BROOK.heard;
    for (const b of this.brooksIn(x - R, z - R, x + R, z + R)) {
      const wet = brookWater(season, b.perennial);
      if (wet < 0.15) continue;
      let best = null; const p = b.pts;
      for (let k = 1; k < p.length; k++) {
        const [ax, az] = p[k - 1], [bx, bz] = p[k], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
        if (!best || d < best.d) best = { d, x: px, z: pz };
      }
      if (best && best.d < R) out.push({ x: best.x, z: best.z, d: best.d, size: 0.1 + 0.18 * wet, kind: 'brook' });
    }
    out.sort((p, q) => p.d - q.d);
    const two = out.slice(0, 2);
    for (const h of two) h.y = groundAt ? groundAt(h.x, h.z) : 0;
    return two;
  }
}

// ---- the brook's bed: a decal over the drawn ground ------------------------------------------------------------------
// Rows across it every BROOK.step metres, five vertices a row, each carrying the terrain's splat weights, floor and
// normal there (so the shader paints the ground under it exactly, as the trail's does: prop-kit.js trailMaterial), and
// aBrook: x across (-1 .. 1 the bed, out to +-BROOK.bank its banks), y metres along it (downstream), z the fade (its
// ends, the lake it runs into), w perennial.
const ACROSS = [-BROOK.bank, -1.45, -1, -0.5, 0, 0.5, 1, 1.45, BROOK.bank];
const brookU = { uBrookWater: { value: new THREE.Vector2(0.7, 0.3) } }; // x a perennial brook's water, y an intermittent one's
let brookMat = null;
export function brookMaterial() {
  if (brookMat) return brookMat;
  const vary = 'varying vec4 vSplatA;\nvarying vec4 vSplatB;\nvarying vec4 vFloor;\nvarying vec3 vLookWorld;\nvarying vec4 vBrook;';
  brookMat = makeLookMaterial({ vertexColors: false, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, {
    wrap: 0, name: 'look-brook',
    compile: (shader) => {
      Object.assign(shader.uniforms, groundUniforms, brookU);
      shader.vertexShader = shader.vertexShader
        .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute vec4 aSplatA;\nattribute vec4 aSplatB;\nattribute vec4 aFloor;\nattribute vec4 aBrook;\n' + vary)
        .replace('#include <project_vertex>', '#include <project_vertex>\n\tvSplatA = aSplatA; vSplatB = aSplatB; vFloor = aFloor; vBrook = aBrook;\n\tvLookWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <color_pars_fragment>', '#include <color_pars_fragment>\n' + vary + '\nuniform vec2 uBrookWater;\nfloat brookSheen = 0.0;\nvec2 brookTilt = vec2( 0.0 );\n' + glslGround)
        .replace('#include <color_fragment>', `
	float lookPx = length( fwidth( vLookWorld.xz ) );
	vec2 q = vLookWorld.xz;
	float water = mix( uBrookWater.y, uBrookWater.x, vBrook.w );
	// across the bed (0 the middle, 1 the margin), its edges pushed about so they never run straight
	float a = abs( vBrook.x ) + ( lookFbm( q / 0.6, 51u, 2 ) - 0.5 ) * 0.4 + ( lookFbm( q / 2.5, 52u, 2 ) - 0.5 ) * 0.25;
	float bed = 1.0 - smoothstep( 0.55, 0.95, a );
	// round 2, the banks: the cut's face dark and damp just past the stones, easing out into the ground round it; a
	// little moss at their top. (On the LiDAR detail the decal lies in the cut; on the 10 m ground this is the cut.)
	float bankW = ${BROOK.bank.toFixed(2)};
	float face = ( 1.0 - smoothstep( 0.9, 1.7, a ) ) * smoothstep( 0.55, 0.9, a );
	float bank = 1.0 - smoothstep( 1.1, bankW, a );
	// the stones: rounded cobbles over grit, grey to tan, set close in the middle of the bed
	float cob = lookFbm( q / 0.16, 53u, 2 ), cob2 = lookFbm( q / 0.07 + vec2( 2.1, -3.7 ), 54u, 2 );
	float stone = smoothstep( 0.5, 0.6, cob ) * lookFade( 0.16, lookPx ) + smoothstep( 0.62, 0.7, cob2 ) * 0.6 * lookFade( 0.07, lookPx );
	vec3 rockC = mix( vec3( 0.36, 0.35, 0.33 ), vec3( 0.52, 0.48, 0.42 ), lookFbm( q / 0.45, 55u, 2 ) );
	vec3 grit = vec3( 0.29, 0.26, 0.21 ) * ( 0.8 + 0.4 * lookFbm( q / 0.05, 56u, 2 ) );
	vec3 bedC = mix( grit, rockC, clamp( stone * mix( 0.7, 1.0, 1.0 - a ), 0.0, 1.0 ) );
	// the water's reach: a thin sheet down the middle as wide as the brook runs, the stones wet a little past it
	float wide = 0.08 + 0.32 * water;
	float chan = ( 1.0 - smoothstep( wide, wide + 0.1, a ) ) * smoothstep( 0.04, 0.2, water );
	float damp = ( 1.0 - smoothstep( wide + 0.1, wide + 0.4, a ) ) * smoothstep( 0.02, 0.15, water );
	bedC *= mix( 1.0, 0.6, damp );
	// running water: tea-brown over the stones, ripples carried downstream (along vBrook.y) on the bed's clock
	float t = uBedTime;
	float r1 = lookFbm( vec2( vBrook.y * 1.6 - t * 2.2, vBrook.x * 2.6 ) , 57u, 2 ), r2 = lookFbm( vec2( vBrook.y * 4.0 - t * 3.5, vBrook.x * 5.0 + 3.0 ), 58u, 2 );
	// (laid over the ground drawn under it as a shade, not a colour of its own: the LiDAR detail paints its ground apart)
	float moss = smoothstep( 0.55, 0.75, lookFbm( q / 0.35, 59u, 2 ) ) * ( 1.0 - face );
	vec3 bankC = mix( vec3( 0.045, 0.04, 0.028 ), vec3( 0.06, 0.075, 0.035 ), moss );
	float bankA = clamp( 0.38 * bank + 0.3 * face, 0.0, 0.62 );
	vec3 col = mix( bankC, bedC, bed );
	vec3 tea = vec3( 0.05, 0.036, 0.018 ) + bedC * vec3( 0.22, 0.17, 0.1 ) * ( 1.0 - 0.6 * water ); // the stones show through a shallow run
	col = mix( col, tea, chan );
	col += vec3( 0.05, 0.055, 0.05 ) * chan * smoothstep( 0.62, 0.8, r2 ) * lookFade( 0.25, lookPx ); // a fleck of foam on a riffle
	brookSheen = chan * ( 0.75 + 0.25 * r1 );
	brookTilt = vec2( r1 - 0.5, r2 - 0.5 ) * 0.5 * chan;
	diffuseColor.rgb = col;
	diffuseColor.a = ( bed + ( 1.0 - bed ) * bankA ) * vBrook.z;`)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\t{ vec2 r = groundRelief( vLookWorld.xz, lookPx ) * ( 1.0 - vFloor.z ) * ( 1.0 - brookSheen ); normal = normalize( normal + mat3( viewMatrix ) * vec3( r.x, 0.0, r.y ) ); normal = normalize( mix( normal, mat3( viewMatrix ) * normalize( vec3( brookTilt.x, 1.0, brookTilt.y ) ), brookSheen ) ); }')
        .replace('#include <opaque_fragment>', mireSheen('brookSheen'));
      applyWet(shader, { porosity: '0.6', gloss: '0.6' });
    },
  });
  return brookMat;
}
// the season's water in the brooks (main.js, each frame or when the date moves)
export function setBrookSeason(season) {
  const u = brookU.uBrookWater.value;
  u.set(brookWater(season, true), brookWater(season, false));
}

class BrookDecal {
  constructor() { this.p = []; this.n = []; this.sa = []; this.sb = []; this.fl = []; this.br = []; this.ix = []; this.rows = 0; }
  row(ctx, x, z, nx, nz, hw, along, fade, per) {
    const f4 = [0, 0, 0, 0], n3 = [0, 1, 0], p3 = [0, 0, 0];
    for (const t of ACROSS) {
      const px = x + nx * t * hw, pz = z + nz * t * hw;
      const at = ctx.locate(px, pz);
      let y;
      if (at) {
        const m = at.mesh;
        y = m.interp(m.t.pos, 3, p3)[1];
        m.interp(m.t.nrm, 3, n3, 1 / 127); this.n.push(n3[0], n3[1], n3[2]);
        m.interp(m.t.splatA, 4, f4, 1 / 255); this.sa.push(...f4);
        m.interp(m.t.splatB, 4, f4, 1 / 255); this.sb.push(...f4);
        m.interp(m.t.floor, 4, f4, 1 / 255); this.fl.push(...f4);
        y += 0.02;
      } else {
        y = ctx.H(px, pz) + 0.03;
        this.n.push(0, 1, 0); this.sa.push(1, 0, 0, 0); this.sb.push(0, 0, 0, 0); this.fl.push(0, 0, 0, 0);
      }
      this.p.push(px - ctx.ox, y, pz - ctx.oz);
      this.br.push(t, along, fade, per);
    }
    return this.rows++;
  }
  join(r0, r1) {
    const k = ACROSS.length;
    for (let i = 0; i < k - 1; i++) { const a = r0 * k + i, b = r0 * k + i + 1, c = r1 * k + i + 1, d = r1 * k + i; this.ix.push(a, b, d, b, c, d); }
  }
  // the ground poking through a long span (the trail's lift: prop-kit.js TrailDecal)
  lift(ctx) {
    const P = this.p, I = this.ix, ox = ctx.ox, oz = ctx.oz;
    if (!I.length) return;
    for (let pass = 0; pass < 2; pass++) {
      const up = new Float32Array(P.length / 3);
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        let need = 0;
        for (const [wa, wb, wc] of [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]]) {
          const x = P[a * 3] * wa + P[b * 3] * wb + P[c * 3] * wc, z = P[a * 3 + 2] * wa + P[b * 3 + 2] * wb + P[c * 3 + 2] * wc;
          const g = ctx.H(x + ox, z + oz);
          if (Number.isFinite(g)) need = Math.max(need, g + 0.015 - (P[a * 3 + 1] * wa + P[b * 3 + 1] * wb + P[c * 3 + 1] * wc));
        }
        if (need > 0) for (const v of [a, b, c]) up[v] = Math.max(up[v], need);
      }
      for (let v = 0; v < up.length; v++) P[v * 3 + 1] += up[v];
    }
  }
  mesh() {
    if (!this.ix.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aSplatA', new THREE.Float32BufferAttribute(this.sa, 4));
    g.setAttribute('aSplatB', new THREE.Float32BufferAttribute(this.sb, 4));
    g.setAttribute('aFloor', new THREE.Float32BufferAttribute(this.fl, 4));
    g.setAttribute('aBrook', new THREE.Float32BufferAttribute(this.br, 4));
    g.setIndex(this.ix);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, brookMaterial());
    m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; m.name = 'brooks';
    m.renderOrder = -1;
    return m;
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tone = (hex, rng, dl = 0.06) => new THREE.Color(hex).offsetHSL(0, 0, (rng() - 0.5) * dl);
const n1 = (x, seed) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash2(i, seed, 7) * (1 - u) + hash2(i + 1, seed, 7) * u; };
// a polyline resampled every `step` metres
function resampleLine(pts, step) {
  const out = [[pts[0][0], pts[0][1]]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], L = Math.hypot(x1 - x0, z1 - z0);
    let d = step - carry;
    while (d <= L) { out.push([x0 + ((x1 - x0) * d) / L, z0 + ((z1 - z0) * d) / L]); d += step; }
    carry = L - (d - step);
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

// One brook's rows in this tile (a segment belongs to the tile holding its first point), and its stones.
function buildBrook(ctx, b, decal, bits, rounded) {
  const { inside, tg } = ctx;
  const pts = b.line || (b.line = resampleLine(rounded(b.pts), BROOK.step));
  const m = pts.length, seed = (b.id * 7919) % 100003, rng = mulberry32(seed + ctx.ox * 3 + ctx.oz);
  const want = new Uint8Array(m);
  let any = false;
  for (let i = 0; i < m - 1; i++) if (inside(pts[i][0], pts[i][1])) { want[i] = 1; want[i + 1] = 1; any = true; }
  if (!any) return;
  const rowOf = new Int32Array(m).fill(-1), total = (m - 1) * BROOK.step, per = b.perennial ? 1 : 0;
  for (let i = 0; i < m; i++) {
    if (!want[i]) continue;
    const [x, z] = pts[i], [xa, za] = pts[Math.max(0, i - 1)], [xb, zb] = pts[Math.min(m - 1, i + 1)];
    let dx = xb - xa, dz = zb - za; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nx = -dz, nz = dx, s = i * BROOK.step;
    const meander = (n1(s / 6, seed) - 0.5) * 0.5, hw = BROOK.hw[0] + (BROOK.hw[1] - BROOK.hw[0]) * n1(s / 9 + 40, seed);
    const cx = x + nx * meander, cz = z + nz * meander, sd = tg.shoreAt(cx, cz);
    // faded in over its first metres, and out where it meets the water (the lake or the creek it runs into)
    const fade = Math.min(smoothstep(0, 4, s), smoothstep(-0.5, 2.5, sd), total - s < 2 && sd > 3 ? smoothstep(0, 2, total - s) : 1);
    rowOf[i] = decal.row(ctx, cx, cz, nx, nz, hw, s, fade, per);
    if (i > 0 && rowOf[i - 1] >= 0 && want[i - 1] && inside(pts[i - 1][0], pts[i - 1][1])) decal.join(rowOf[i - 1], rowOf[i]);
    // stones along the bed: the bigger ones at its margins, cobbles in it; wet and darker where it runs
    if (!inside(x, z) || sd < 0.5 || fade < 0.5) continue;
    if (rng() < BROOK.stones * BROOK.step) {
      const off = (rng() < 0.55 ? (rng() < 0.5 ? -1 : 1) * (0.7 + rng() * 0.35) : (rng() - 0.5) * 0.9) * hw;
      const px = cx + nx * off, pz = cz + nz * off, edge = Math.abs(off) / hw, s0 = edge > 0.6 ? 0.05 + rng() * 0.08 : 0.03 + rng() * 0.04;
      const wet = per && edge < 0.6, col = tone(wet ? 0x77726a : 0xa39d92, rng, 0.12);
      const mat = new THREE.Matrix4().makeRotationY(rng() * 6.28).scale(V(s0, s0 * 0.55, s0 * 0.8)).setPosition(V(px - ctx.ox, ctx.H(px, pz) - s0 * 0.25, pz - ctx.oz));
      chunkStone(bits, mat, rng, col);
    }
    // round 2: a lip of small stones along the top of the cut, mossy and dry
    if (rng() < 0.45 * BROOK.step) {
      const off = (rng() < 0.5 ? -1 : 1) * (1.05 + rng() * 0.4) * hw, px = cx + nx * off, pz = cz + nz * off, s0 = 0.04 + rng() * 0.06;
      const mat = new THREE.Matrix4().makeRotationY(rng() * 6.28).scale(V(s0, s0 * 0.5, s0 * 0.8)).setPosition(V(px - ctx.ox, ctx.H(px, pz) - s0 * 0.2, pz - ctx.oz));
      chunkStone(bits, mat, rng, tone(rng() < 0.4 ? 0x6f7356 : 0x8f8a80, rng, 0.12));
    }
  }
}

// ---- the beaver's works -----------------------------------------------------------------------------------------------
const MUD = 0x6b5640, MUD_WET = 0x4c3d2e, PEELED = 0xc4b393, PEELED_OLD = 0x9a9488, BARK = 0x4f4031, GRASSED = 0x76703f;
// a colour function for PropBuilder (of the tile-local point): the hue mottled over half a metre, wet and dark within
// 15 cm of the water level `lv` (null: no water)
function mudColour(ctx, hex, lv, seed) {
  const dry = new THREE.Color(hex), wet = new THREE.Color(MUD_WET), c = new THREE.Color();
  return (p) => {
    const m = (hash2(Math.floor((p.x + ctx.ox) * 2), Math.floor((p.z + ctx.oz) * 2), seed) - 0.5) * 0.12;
    c.copy(dry).offsetHSL(0, 0, m);
    if (lv !== null) c.lerp(wet, 1 - smoothstep(lv + 0.04, lv + 0.2, p.y));
    return c;
  };
}
// The water level a little way off (x, z) on either side of a dam, or the ground there
function sideLevel(tg, x, z) { return tg.lakeIdAt(x, z) ? tg.levelAt(x, z) : null; }

// A dam: a mound along its axis (u, -len/2 - 1.5 .. len/2 + 1.5) bowed a little upstream, its cross-section a soft
// arch (v across), standing to its crest over the ground or the bed; the sticks laid over it mostly the way the water
// goes, peeled pale and some in their bark; an old one lower, grassed and breached. b: a PropBuilder in tile-local metres.
function buildDam(ctx, b, d, rng) {
  const { tg } = ctx, old = !!d.old, half = d.len / 2;
  const ax = d.ax, az = d.az, nx = az, nz = -ax; // along the dam, and across it
  // the two sides' water (the pond above, the creek below) decide which way it bows and how high the crest stands
  const la = sideLevel(tg, d.x + nx * 5, d.z + nz * 5), lb = sideLevel(tg, d.x - nx * 5, d.z - nz * 5);
  const gMid = ctx.H(d.x, d.z), lv = Math.max(la ?? -Infinity, lb ?? -Infinity, tg.lakeIdAt(d.x, d.z) ? tg.levelAt(d.x, d.z) : -Infinity);
  const up = la !== null && lb !== null ? (la >= lb ? 1 : -1) : la !== null ? 1 : -1;
  const crest = (Number.isFinite(lv) ? Math.max(lv, gMid) : gMid) + (old ? 0.25 : 0.3 + Math.min(0.3, 0.015 * d.len));
  // its section: steep on the pond's side (wUp), a long slope of sticks down the other (wDn); an old one broad and low
  const wUp = old ? 1.8 : 0.9, wDn = old ? 2.2 : 2.1, ext = half + 1.6;
  const nu = Math.max(6, Math.ceil((2 * ext) / 0.5)), nv = 12;
  const prof = (v) => { const w = v * up; return w > 0 ? Math.max(0, 1 - (w / wUp) ** 2) ** 0.55 : Math.max(0, 1 - (w / wDn) ** 2) ** 1.3; };
  const at = (u, v) => {
    const bow = up * 0.07 * d.len * (1 - Math.min(1, (u / ext) ** 2));
    const x = d.x + ax * u + nx * (v + bow), z = d.z + az * u + nz * (v + bow);
    const g = ctx.H(x, z);
    let c = crest * (1 - smoothstep(half - 0.6, ext, Math.abs(u))) + g * smoothstep(half - 0.6, ext, Math.abs(u));
    if (old) c = g + (c - g) * smoothstep(0.5, 2.2, Math.abs(u)); // the breach the water cut
    const k = prof(v), lump = (noise2(u * 1.3, v * 1.3 + d.i, 17) - 0.5) * (old ? 0.12 : 0.3);
    return { x, z, y: Math.max(g + 0.02, g + Math.max(0, c - g) * k + lump * k), g, k };
  };
  const grid = [];
  const vAt = (iv) => (iv / nv) < 0.5 ? -(up > 0 ? wDn : wUp) * (1 - (2 * iv) / nv) : (up > 0 ? wUp : wDn) * ((2 * iv) / nv - 1);
  for (let iu = 0; iu <= nu; iu++) { const row = []; for (let iv = 0; iv <= nv; iv++) row.push(at(-ext + (2 * ext * iu) / nu, vAt(iv))); grid.push(row); }
  const P = (q) => V(q.x - ctx.ox, q.y, q.z - ctx.oz);
  // the mud's colour by where it is (a vertex's own, so the faces blend): darker and wetter at the waterline, an old
  // dam grassed over
  const mudCol = mudColour(ctx, old ? GRASSED : MUD, Number.isFinite(lv) && !old ? lv : null, d.i);
  for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++) {
    const a = grid[iu][iv], bq = grid[iu + 1][iv], c = grid[iu + 1][iv + 1], e = grid[iu][iv + 1];
    if (Math.max(a.k, bq.k, c.k, e.k) < 0.02) continue;
    b.face([P(a), P(bq), P(c)], TILE.PLAIN, mudCol, { ref: V(a.x - ctx.ox, a.y - 5, a.z - ctx.oz) });
    b.face([P(a), P(c), P(e)], TILE.PLAIN, mudCol, { ref: V(a.x - ctx.ox, a.y - 5, a.z - ctx.oz) });
  }
  // the sticks: a tangle over it, the most laid the way the water goes, some along the crest, and on the face below a
  // good few with their butts in the mud and their tops sticking up and out
  const n = Math.round(d.len * (old ? 1.5 : 11)) + (old ? 2 : 12);
  for (let i = 0; i < n; i++) {
    const u = (rng() * 2 - 1) * (half + 0.4), v = old ? (rng() * 2 - 1) * wDn * 0.8 : -up * (rng() * 1.15 - 0.15) * wDn * 0.85;
    const along = !old && rng() < 0.25, jut = !old && !along && rng() < 0.3;
    const ang = (along ? Math.PI / 2 : 0) + (rng() - 0.5) * 1.2, len = 0.9 + rng() * (old ? 1.2 : 2.0), r = old ? 0.02 + rng() * 0.025 : 0.025 + rng() * 0.04;
    const du = Math.sin(ang) * len / 2, dv = Math.cos(ang) * len / 2;
    const p0 = at(u - du, v - dv), p1 = at(u + du, v + dv);
    if (p0.k < 0.05 && p1.k < 0.05) continue;
    let y0 = p0.y + r * 0.5, y1 = p1.y + r * 0.5;
    if (jut) { if ((p1.x - p0.x) * nx * up + (p1.z - p0.z) * nz * up < 0) y1 += 0.25 + rng() * 0.5; else y0 += 0.25 + rng() * 0.5; } // the end downstream cocked up
    const peeled = rng() < (old ? 0.9 : 0.5), col = tone(old ? PEELED_OLD : peeled ? PEELED : BARK, rng, 0.14);
    b.cyl(V(p0.x - ctx.ox, y0, p0.z - ctx.oz), V(p1.x - ctx.ox, y1, p1.z - ctx.oz), r, r * 0.7, 5, peeled ? TILE.WOOD : TILE.BARK, col);
  }
  return crest;
}

// A lodge: a dome of mud and sticks, the sticks leant up it from all round, stood in the pond (or on its bank)
function buildLodge(ctx, b, x, z, rng, seed) {
  const { tg } = ctx, R = DAM.lodgeR * (0.85 + 0.3 * rng()), Ht = DAM.lodgeH * (0.85 + 0.3 * rng());
  const g = ctx.H(x, z), lv = tg.lakeIdAt(x, z) ? tg.levelAt(x, z) : null, base = lv !== null ? Math.max(lv - 0.1, g) : g;
  const nr = 6, ns = 14;
  const dome = (th, t) => { // t 0 the rim (a little under the water or into the ground) .. 1 the top
    const wob = 1 + (hash2(Math.round(th * 4), seed, 5) - 0.5) * 0.18;
    const rr = R * wob * Math.cos(t * Math.PI / 2) ** 0.8, px = x + Math.cos(th) * rr, pz = z + Math.sin(th) * rr;
    return { x: px, z: pz, y: base - 0.25 + (Ht + 0.25) * Math.sin(t * Math.PI / 2) };
  };
  const P = (q) => V(q.x - ctx.ox, q.y, q.z - ctx.oz), top = V(x - ctx.ox, base + Ht, z - ctx.oz);
  const mudCol = mudColour(ctx, MUD, lv, seed);
  const ring = [];
  for (let k = 0; k <= nr; k++) { const row = []; for (let s = 0; s <= ns; s++) row.push(dome((s / ns) * Math.PI * 2, k / nr)); ring.push(row); }
  for (let k = 0; k < nr; k++) for (let s = 0; s < ns; s++) {
    const a = ring[k][s], bq = ring[k][s + 1], c = ring[k + 1][s + 1], e = ring[k + 1][s];
    const ref = V(x - ctx.ox, base, z - ctx.oz);
    b.face([P(a), P(bq), P(c)], TILE.PLAIN, mudCol, { ref });
    if (k < nr - 1) b.face([P(a), P(c), P(e)], TILE.PLAIN, mudCol, { ref });
  }
  void top;
  const n = 70 + Math.floor(rng() * 30);
  for (let i = 0; i < n; i++) {
    const th = rng() * Math.PI * 2, t0 = rng() * 0.45, t1 = Math.min(0.97, t0 + 0.3 + rng() * 0.45), r = 0.02 + rng() * 0.035;
    const p0 = dome(th, t0), p1 = dome(th + (rng() - 0.5) * 0.5, t1);
    const peeled = rng() < 0.55, col = tone(peeled ? PEELED : BARK, rng, 0.12);
    b.cyl(V(p0.x - ctx.ox, p0.y + r, p0.z - ctx.oz), V(p1.x - ctx.ox, p1.y + r, p1.z - ctx.oz), r, r * 0.7, 5, peeled ? TILE.WOOD : TILE.BARK, col);
  }
}

// The brooks, the dams and the lodges in tile (tx, ty): a generator for props.js tilePropsSteps (it yields after each
// dam, the heaviest piece). The brook decal goes into the group; the stones, dams and lodges into `pieces` (the tile's
// one prop mesh); a lodge holds the walker off (obstacles).
export function* tileCreeks(ctx, group, pieces, rounded) {
  const C = ctx.world.creeks;
  if (!C) return;
  const size = ctx.world.tileMetres, { ox, oz } = ctx;
  const decal = new BrookDecal(), stones = new PropBuilder();
  for (const b of C.brooksIn(ox - 2, oz - 2, ox + size + 2, oz + size + 2)) buildBrook(ctx, b, decal, stones, rounded);
  decal.lift(ctx);
  const m = decal.mesh();
  if (m) group.add(m);
  if (stones.count) pieces.push(stones.build());
  yield;
  const ground = (x, z) => ctx.H(x + ox, z + oz);
  for (const d of C.damsIn(ox - 40, oz - 40, ox + size + 40, oz + size + 40)) {
    const rng = mulberry32((d.i + 1) * 2654435761 % 4294967291);
    const b = new PropBuilder();
    if (ctx.inside(d.x, d.z)) buildDam(ctx, b, d, rng);
    if (d.lodge && ctx.inside(d.lodge[0], d.lodge[1])) {
      buildLodge(ctx, b, d.lodge[0], d.lodge[1], mulberry32(d.i * 31 + 7), d.i);
      ctx.obstacles.push({ x: d.lodge[0], z: d.lodge[1], r: DAM.lodgeR * 0.9 });
    }
    if (!b.count) continue;
    const g = b.build();
    occlude(g, [], { ground, rays: 5, reach: 0.4, floor: 0.45, bury: 0.08 });
    pieces.push(g);
    yield;
  }
}

// ---- the moment ------------------------------------------------------------------------------------------------------
// The first time a seasonal creek runs shallow under you (hints.js MOMENTS; main.js registers them as seaMoments are).
export function creekMoments(player) {
  return [
    { id: 'lowCreek', prio: 1, recur: 'once', text: 'Low water: this creek runs shallow by late summer. Slow going.',
      due: () => player.mode === 'paddle' && !player.teleporting && (player.shallow || 0) > 0.4 && Math.abs(player.speed) > 0.2 },
  ];
}
