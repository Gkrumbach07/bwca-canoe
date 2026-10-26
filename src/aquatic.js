import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { makeLookMaterial, FOLIAGE_WRAP } from './shading.js';
import { bakeOcclusion } from './occlusion.js';
import { addSurface, INSTANCE_ORIGIN } from './floating.js';
import { aquaticAtlas, aquaticUV } from './aquatic-textures.js';
import { SWAY, glslSway } from './wind.js';
import { REGION } from './placement.js';

// The lake plants (docs/look.md: crisp graphic clumps that sit in the water). Placement runs in the build worker
// (placement.js placeAquatic); this file turns a tile's bins into instanced meshes in tile-local coordinates that
// ride the rendered water surface. Every plant is cards from the generated atlas (aquatic-textures.js), alpha to
// coverage on the multisampled scene target, lit by the look's light with the leaves' wrap and fogged by the
// shared hook:
//   0 lily pads: loose rafts of flat pads of mixed sizes, overlapping, some with a white or a yellow lily
//   1 reeds: clumps of upright cards (bulrush, reed and sedge, cattails), the occlusion baked in at the base
//   2 submerged weed: pondweed swaying on the bed, seen through clear shallow water
//   3 wild rice: patches of thin cards, soft fields in the shallow bays
// The season: pads and rice grow in with the summer and go in the fall, the lilies bloom in high summer, the
// reeds and the rice turn tan, and nothing stands above a frozen lake.

// metres from the camera to the nearest of a bin's instances (makeAquaticMeshes measures from the middle of their
// spread, plus its half-diagonal) before the bin goes, per kind
const CULL = [420, 560, 200, 480];

// d2 water: the wild rice by each lake's DNR acres, on a v4 release (placement.js placeAquatic, MAPPED). The index counts
// each lake's water cells in the NWI's in-lake emergent bed (`emergent`, ground kind 8); d1 lakes' facts give the DNR
// Wildlife's rice acres for the 80 listed lakes. Per lake id:
//   share  of the mapped emergent bed, how much is rice (in fields): a listed lake its acres over the bed (0.12-0.92), a
//          listed lake with no acres or a surveyed lake not on the list 0.12 (the odd stand), any other water 0.45
//          (half rice, half bulrush, as the bays of the unlisted lakes run); -1 where the lake has no mapped bed
//   extra  the share of a listed lake's acres beyond its mapped bed, grown by the old rule in its sheltered shallows
// null on a release with no counts (v3): the old rule everywhere.
export const RICE_SHARE = { min: 0.12, max: 0.92, unlisted: 0.12, other: 0.45 };
export function riceBeds(world) {
  const lakes = world.lakes, n = lakes.length + 1, facts = world.facts, cellAcres = (world.cell * world.cell) / 4046.86;
  if (!lakes.some((l) => l && l.emergent > 0)) return null;
  const share = new Float32Array(n).fill(-1), extra = new Float32Array(n);
  // a DNR lake's acres belong to all its polygons: their mapped beds summed
  const bedOf = new Map();
  for (const l of lakes) {
    const f = l && facts ? facts.factsOf(l.id) : null;
    if (f && f.rice > 0) bedOf.set(f, (bedOf.get(f) || 0) + (l.emergent || 0) * cellAcres);
  }
  for (const l of lakes) {
    if (!l) continue;
    const f = facts ? facts.factsOf(l.id) : null, bed = (l.emergent || 0) * cellAcres;
    if (f && f.rice > 0) {
      const mapped = bedOf.get(f) || 0;
      share[l.id] = mapped > 0 ? Math.min(RICE_SHARE.max, Math.max(RICE_SHARE.min, f.rice / mapped)) : -1;
      extra[l.id] = Math.max(0, Math.min(1, (f.rice - mapped) / f.rice));
    } else if (bed > 0) share[l.id] = f ? RICE_SHARE.unlisted : RICE_SHARE.other;
  }
  return { share, extra };
}

// Cards: indexed quads (upright ones in rows, so the occlusion and the sway have vertices to work with), each
// corner with its colour, its shading normal, its atlas UV and its part (0 leaf, 1 flower).
class Cards {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.part = []; this.ix = []; }
  vert(x, y, z, n, col, uv, part) {
    this.p.push(x, y, z); this.n.push(n.x, n.y, n.z); this.c.push(col.r, col.g, col.b); this.uv.push(uv[0], uv[1]); this.part.push(part);
    return this.p.length / 3 - 1;
  }
  // a card lying flat at height y: centre (x, z), half size r, turned by a; tilt lifts it about its own z axis (a pad
  // standing up out of the water on its stalk), its centre at y
  flat(x, y, z, r, a, sprite, col, part = 0, tilt = 0) {
    const c = Math.cos(a), s = Math.sin(a), ct = Math.cos(tilt), st = Math.sin(tilt), k = [];
    const up = new THREE.Vector3(-st * c, ct, -st * s);
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const lx = (u * 2 - 1) * r, lz = (v * 2 - 1) * r, tx = lx * ct, ty = lx * st;
      k.push(this.vert(x + tx * c - lz * s, y + ty, z + tx * s + lz * c, up, col, aquaticUV(sprite, u, v), part));
    }
    this.ix.push(k[0], k[2], k[1], k[0], k[3], k[2]);
  }
  // an upright card rooted at (x, y, z), w wide and h tall, facing along yaw, its top leaning by (lx, lz) on a
  // curve; rows: heights (fractions of h) where it gets a row of vertices. The normal leans out from the clump's
  // centre (cx, cz) and up, so the clump shades as one soft volume rather than as flat cards.
  upright(x, y, z, w, h, yaw, lx, lz, sprite, col, rows, cx, cz, part = 0) {
    const fx = Math.cos(yaw), fz = Math.sin(yaw), base = this.p.length / 3;
    for (const t of rows) {
      for (const u of [0, 1]) {
        const off = (u - 0.5) * w, px = x + fx * off + lx * t * t, pz = z + fz * off + lz * t * t, py = y + t * h;
        let ox = px - cx, oz = pz - cz;
        const ol = Math.hypot(ox, oz);
        if (ol < 1e-3) { ox = -fz; oz = fx; } else { ox /= ol; oz /= ol; }
        const n = new THREE.Vector3(ox * 0.55, 0.85, oz * 0.55).normalize();
        this.vert(px, py, pz, n, col, aquaticUV(sprite, u, t), part);
      }
    }
    for (let r = 0; r < rows.length - 1; r++) {
      const a = base + r * 2, b = a + 1, c = a + 2, d = a + 3;
      this.ix.push(a, b, d, a, d, c);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setIndex(this.ix);
    g.computeBoundingSphere();
    return g;
  }
}

const tint = (rng, r, g, b, j = 0.06) => new THREE.Color(r * (1 - j + 2 * j * rng()), g * (1 - j + 2 * j * rng()), b * (1 - j + 2 * j * rng()));

// a raft of pads: a loose cluster grown pad by pad, each touching or overlapping one already there, sizes mixed,
// each a hair above the last so the overlaps never fight; `flower` 1 white lilies, 2 yellow pond lilies
function padRaft(rng, flower) {
  const C = new Cards(), n = 11 + Math.floor(rng() * 11), pads = [];
  for (let i = 0; i < n; i++) {
    const r = 0.15 + Math.pow(rng(), 1.6) * 0.3;
    let x = 0, z = 0;
    if (i) { const o = pads[Math.floor(rng() * pads.length)], a = rng() * Math.PI * 2, d = (o.r + r) * (0.55 + rng() * 0.45); x = o.x + Math.cos(a) * d; z = o.z + Math.sin(a) * d; }
    pads.push({ x, z, r });
    const old = rng() < 0.3, col = old ? tint(rng, 1.0, 0.97, 0.9) : tint(rng, 0.95, 1.0, 0.95);
    C.flat(x, i * 0.004, z, r, rng() * Math.PI * 2, old ? 'padB' : 'pad', col);
  }
  if (flower) {
    const k = 1 + Math.floor(rng() * 2);
    for (let f = 0; f < k; f++) {
      const o = pads[Math.floor(rng() * pads.length)], a = rng() * Math.PI * 2, x = o.x + Math.cos(a) * o.r * 0.9, z = o.z + Math.sin(a) * o.r * 0.9;
      const s = flower === 1 ? 0.07 + rng() * 0.03 : 0.05 + rng() * 0.015, y = n * 0.004 + 0.012, col = tint(rng, 1, 1, 1, 0.03);
      const top = flower === 1 ? 'lilyTop' : 'yellowTop', side = flower === 1 ? 'lilySide' : 'yellowSide';
      C.flat(x, y + s * 0.55, z, s, rng() * Math.PI, top, col, 1);
      const yaw = rng() * Math.PI;
      for (const dy of [0, Math.PI / 2]) C.upright(x - Math.cos(yaw + dy) * 0, y - 0.01, z, s * 2.1, s * 1.5, yaw + dy, 0, 0, side, col, [0, 1], x, z, 1);
    }
  }
  return C.build();
}

// a raft of yellow pond lily (spatterdock): long heart-shaped pads, big and leathery, crowded and overlapping, a few of
// them standing up out of the water on their stalks at a slant, and a few yellow ball flowers held just over the water
function spatterRaft(rng) {
  const C = new Cards(), n = 9 + Math.floor(rng() * 8), pads = [];
  for (let i = 0; i < n; i++) {
    const r = 0.17 + Math.pow(rng(), 1.4) * 0.17;
    let x = 0, z = 0;
    if (i) { const o = pads[Math.floor(rng() * pads.length)], a = rng() * Math.PI * 2, d = (o.r + r) * (0.5 + rng() * 0.45); x = o.x + Math.cos(a) * d; z = o.z + Math.sin(a) * d; }
    pads.push({ x, z, r });
    const up = rng() < 0.3, col = tint(rng, 1.0, 1.0, 0.92);
    C.flat(x, up ? 0.06 + rng() * 0.14 : i * 0.004, z, r, rng() * Math.PI * 2, 'spatter', col, 0, up ? 0.5 + rng() * 0.6 : 0);
  }
  for (let f = 1 + Math.floor(rng() * 3); f > 0; f--) {
    const o = pads[Math.floor(rng() * pads.length)], x = o.x + (rng() - 0.5) * o.r, z = o.z + (rng() - 0.5) * o.r;
    const s = 0.045 + rng() * 0.015, y = 0.05 + rng() * 0.08, col = tint(rng, 1, 1, 1, 0.03), yaw = rng() * Math.PI;
    C.flat(x, y + s * 0.55, z, s, rng() * Math.PI, 'yellowTop', col, 1);
    for (const dy of [0, Math.PI / 2]) C.upright(x, y - 0.06, z, s * 2.1, s * 1.5 + 0.06, yaw + dy, 0, 0, 'yellowSide', col, [0, 1], x, z, 1);
  }
  return C.build();
}

// a clump of reeds: cards rooted near the middle, their faces spread round so it is full from any side, leaning out
// a little; kind 0 bulrush, 1 reed and sedge, 2 cattail. Roots go below the water so the clump stands in it.
const CLUMP = [
  { sprite: 'rush', cards: [3, 5], w: [0.5, 0.75], h: [1.3, 1.9], col: [0.95, 1.0, 0.95] },
  { sprite: 'reed', cards: [3, 5], w: [0.7, 1.0], h: [1.0, 1.5], col: [1.0, 1.0, 0.95] },
  { sprite: 'cattail', cards: [3, 4], w: [0.75, 1.0], h: [1.6, 2.2], col: [1.0, 1.0, 1.0] },
  { sprite: 'sedge', cards: [5, 7], w: [0.8, 1.2], h: [0.6, 0.95], col: [1.0, 1.0, 0.95], spread: 0.3 },
];
const ROWS = [0, 0.12, 0.24, 0.45, 1];
function reedClump(rng, kind) {
  const K = CLUMP[kind], C = new Cards(), n = K.cards[0] + Math.floor(rng() * (K.cards[1] - K.cards[0] + 1));
  const yaw0 = rng() * Math.PI;
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = rng() * (K.spread || 0.22), x = Math.cos(a) * d, z = Math.sin(a) * d;
    const w = K.w[0] + rng() * (K.w[1] - K.w[0]), h = K.h[0] + rng() * (K.h[1] - K.h[0]);
    const yaw = yaw0 + (i / n) * Math.PI + (rng() - 0.5) * 0.4, lean = 0.08 + rng() * 0.14;
    C.upright(x, -0.35, z, w, h + 0.35, yaw, Math.cos(a) * lean, Math.sin(a) * lean, K.sprite, tint(rng, ...K.col, 0.07), ROWS, 0, 0);
  }
  return occluded(C.build());
}

// a patch of wild rice: thin cards scattered over a couple of metres, at odd angles and leans
function ricePatch(rng) {
  const C = new Cards(), n = 9 + Math.floor(rng() * 6);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 2.0, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const w = 0.4 + rng() * 0.25, h = 1.1 + rng() * 0.7, la = rng() * Math.PI * 2, lean = rng() * 0.2;
    C.upright(x, -0.3, z, w, h + 0.3, rng() * Math.PI, Math.cos(la) * lean, Math.sin(la) * lean, 'rice', tint(rng, 1, 1, 0.95, 0.08), ROWS, 0, 0);
  }
  return occluded(C.build());
}

// submerged weed: crossed cards rising from the bed, y from 0 (bed) to 1 (tip) for the sway; pondweed, or a bushier
// clump of milfoil and coontail
function weed(rng, sprite = 'weed') {
  const C = new Cards(), yaw = rng() * Math.PI, bush = sprite === 'milfoil', n = bush ? 4 : 3;
  for (let i = 0; i < n; i++) C.upright((rng() - 0.5) * 0.25, 0, (rng() - 0.5) * 0.25, (bush ? 0.75 : 0.55) + rng() * 0.2, bush ? 0.8 : 1.0, yaw + (i / n) * Math.PI, 0, 0, sprite, tint(rng, 0.85, 0.95, 0.85, 0.08), [0, 0.3, 1], 0, 0);
  return C.build();
}

// the occlusion where the cards cross and down toward the water (the ground plane just under the waterline)
function occluded(g) { return bakeOcclusion(g, { rays: 20, reach: 0.55, ground: -0.08, floor: 0.4 }); }

// ---------- the material ------------------------------------------------------------
// The look's Lambert with the leaves' wrap, double-sided without three's back-face flip (a card seen from behind keeps
// its normal). Vertex: the season's growth about the instance's root, the ride on the rendered swell, a sway that grows
// with the height above the water and with the wind (or, for the weed, the slow swing of the water), and nothing at
// all above ice. Fragment: the sprite, alpha to coverage sharpened to about a pixel (alpha lifted in the coarser mips
// so thin stems hold up far off), the flowers out of season cut, the leaves turning tan.
export const AQUA = {
  uAquaMap: { value: null },
  uGrow: { value: 1 },    // pads and rice: 0 gone, 1 full grown
  uBloom: { value: 1 },   // the lilies
  uTan: { value: 0 },     // reeds and rice: 0 green, 1 tan
  uIceHide: { value: 0 }, // 1 over a frozen lake
};
const noFlip = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
// The wind on the plants (wind.js SWAY, as the trees and the grass have it): reeds and rice bend downwind from the
// water line, the tops furthest, deeper as a gust rolls over, and swing and shiver about that; the rice is the more
// limber. The pads only shift a little on the water. The submerged weed swings with the water instead. Phases come
// from the world position (an instance's own hash, a slow wave across the weed beds), so a tile crossing moves nothing.
const PLANT_SWAY = { 1: [0.14, 1.9], 3: [0.22, 1.5] }; // reeds, rice: lean in radians at 12 m/s under a gust, height (m)
const windSway = (kind) => kind === 2
  ? 'float ph = uWaterTime * 1.1 + fract(dot(ip.xz, vec2(0.5, 0.35) / 6.2831853)) * 6.2831853; transformed.x += sin(ph) * 0.12 * position.y; transformed.z += cos(ph * 0.7) * 0.07 * position.y;'
  : /* glsl */ `
    #ifdef USE_INSTANCING
      mat3 aM = mat3(instanceMatrix);
    #else
      mat3 aM = mat3(1.0);
    #endif
    vec2 W = uSwayWind.xy;
    float ag = swayGustAt(ip.xz) * uSwayGust.w, ah = swayHash(floor(ip.xz * 3.0)), load = uSwayWind.z;
    float ph = swayOmega(${kind === 0 ? '0.35' : '0.75'} + 0.25 * ah) * uSwayGust.z + ah * 6.2831853 + position.x * 0.6;
    ${kind === 0
      ? `vec3 d = vec3(W.x, 0.0, W.y) * (0.05 * load * (0.3 + 0.7 * ag)) + vec3(sin(ph), 0.0, cos(ph * 0.8)) * 0.012 * smoothstep(1.0, 9.0, uSwayWind.w);`
      : `float h = max(position.y, 0.0) * sy, bend = h * h / ${PLANT_SWAY[kind][1].toFixed(2)}, k = ${PLANT_SWAY[kind][0].toFixed(3)};
    float along = k * load * (0.4 + 0.6 * ag + (0.25 + 0.4 * ag) * sin(ph)) + 0.05 * smoothstep(1.0, 9.0, uSwayWind.w) * (0.5 + 0.5 * ag) * sin(ph * 3.1 + 0.7);
    float across = k * load * (0.1 + 0.2 * ag) * sin(ph * 0.73 + 1.9);
    vec3 d = vec3(W.x * along - W.y * across, 0.0, W.y * along + W.x * across) * bend;
    d.y = -0.5 * dot(d.xz, d.xz) / max(h, 0.1);`}
    transformed += swayToObject(aM, d);`;
const vertexBody = (kind) => INSTANCE_ORIGIN + /* glsl */ `
  {
    vAqUv = uv; vAqPart = aPart;
    ${kind === 0 || kind === 3 ? 'transformed *= uGrow;' : ''}
    ${windSway(kind)}
    ${kind === 2 ? '' : 'transformed *= 1.0 - step(0.5, uIceHide);\n    transformed.y += renderedWave(ipRel, uWaterTime) / sy;'}
  }`;
const PLANT_DECL = 'uniform float uGrow, uIceHide;\nattribute float aPart;\nvarying vec2 vAqUv;\nvarying float vAqPart;\n' + glslSway;
const fragCut = /* glsl */ `
  vec4 aq = texture2D( uAquaMap, vAqUv );
  vec2 tsz = vAqUv * 1024.0;
  float lod = max( 0.0, 0.5 * log2( max( dot( dFdx( tsz ), dFdx( tsz ) ), dot( dFdy( tsz ), dFdy( tsz ) ) ) ) );
  float aqA = aq.a * ( 1.0 + lod * 0.28 );
  aqA = clamp( ( aqA - 0.5 ) / max( fwidth( aqA ), 1e-4 ) + 0.5, 0.0, 1.0 );
  if ( aqA <= 0.0 || ( vAqPart > 0.5 && uBloom < 0.5 ) ) discard;`;
function makeAquaticMaterial(water, kind) {
  const m = makeLookMaterial({ side: THREE.DoubleSide, alphaToCoverage: true }, {
    wrap: FOLIAGE_WRAP, name: `look-aquatic-${kind}`,
    compile: (shader) => {
      addSurface(shader, water, { ...AQUA, ...SWAY }, PLANT_DECL);
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertexBody(kind));
      const tan = kind === 1 || kind === 3
        ? '\n  if ( vAqPart < 0.5 ) { float l = dot( diffuseColor.rgb, vec3( 0.3, 0.5, 0.2 ) ); diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.55, 0.4, 0.2 ) * ( 0.35 + 1.6 * l ), uTan ); }'
        : '';
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uAquaMap;\nuniform float uBloom, uTan;\nvarying vec2 vAqUv;\nvarying float vAqPart;')
        .replace('#include <map_fragment>', fragCut + '\n  diffuseColor.rgb *= aq.rgb;\n  diffuseColor.a = aqA;' + tan)
        .replace('#include <normal_fragment_begin>', noFlip);
    },
  });
  return m;
}
// the reeds' shadows: the same ride, sway and cut in the depth pass
function makeAquaticDepth(water, kind) {
  const m = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (shader) => {
    addSurface(shader, water, { ...AQUA, ...SWAY }, PLANT_DECL);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertexBody(kind));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uAquaMap;\nuniform float uBloom;\nvarying vec2 vAqUv;\nvarying float vAqPart;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if ( texture2D( uAquaMap, vAqUv ).a < 0.5 || ( vAqPart > 0.5 && uBloom < 0.5 ) ) discard;');
  };
  m.customProgramCacheKey = () => `aquatic-depth-${kind}`;
  return m;
}

// kinds: 0 pad, 1 reed, 2 weed (placement.js AQUATIC), 3 wild rice (placeAquatic)
export function makeAquaticKit(water, seed = 9) {
  AQUA.uAquaMap.value = aquaticAtlas();
  const rng = mulberry32(seed);
  const geos = [
    // pads: plain, spatterdock, white lilies, yellow lilies among plain pads (placement.js placeAquatic picks them)
    [padRaft(rng, 0), spatterRaft(rng), padRaft(rng, 1), padRaft(rng, 2)],
    // reeds: bulrush, reed and grass, cattail, sedge
    [reedClump(rng, 0), reedClump(rng, 1), reedClump(rng, 2), reedClump(rng, 3)],
    [weed(rng), weed(rng, 'milfoil')],
    [ricePatch(rng), ricePatch(rng)],
  ];
  const mats = [0, 1, 2, 3].map((k) => makeAquaticMaterial(water, k));
  const depth = makeAquaticDepth(water, 1);
  const grow = AQUA.uGrow;
  const setSeason = (s) => {
    const d = s.doy;
    AQUA.uGrow.value = s.pads;
    AQUA.uBloom.value = THREE.MathUtils.smoothstep(d, 168, 176) * (1 - THREE.MathUtils.smoothstep(d, 236, 246));
    // the reeds stand tan from the fall through to the new growth; the rice ripens from late August
    AQUA.uTan.value = Math.max(s.fall, s.bare, 1 - s.leaf, THREE.MathUtils.smoothstep(d, 228, 252) * 0.7);
    AQUA.uIceHide.value = s.ice;
  };
  return { geos, mats, depth, grow, setSeason };
}

export function makeAquaticMeshes(bins, kit) {
  const meshes = [];
  for (const b of bins) {
    if (!b.count) continue;
    const set = kit.geos[b.kind];
    if (!set) continue;
    const geo = set[Math.min(b.variant, set.length - 1)];
    const mesh = new THREE.InstancedMesh(geo, kit.mats[b.kind], b.count);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(b.matrices, 16);
    mesh.receiveShadow = b.kind !== 2;
    mesh.castShadow = b.kind === 1;
    if (b.kind === 1) mesh.customDepthMaterial = kit.depth;
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius += 2.5; // the sway and the swell
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = b.kind === 2 ? 0 : 11;
    // culled by distance from the middle of the instances' own spread (not the 640 m region's centre, which left the
    // weed under the canoe culled in a region's corner), that spread's half-diagonal added. The instances are
    // tile-local; regions nest in tiles, so the region holding their mean gives the tile's corner from its centre.
    const a = b.matrices;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, mx = 0, mz = 0;
    for (let i = 0; i < b.count; i++) { const x = a[i * 16 + 12], z = a[i * 16 + 14]; mx += x; mz += z; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const ox = b.cx - (Math.floor(mx / b.count / REGION) + 0.5) * REGION, oz = b.cz - (Math.floor(mz / b.count / REGION) + 0.5) * REGION;
    mesh.userData.lod = { full: geo, low: geo, cx: ox + (x0 + x1) / 2, cz: oz + (z0 + z1) / 2, lod: Infinity, cull: (CULL[b.kind] ?? 600) + Math.hypot(x1 - x0, z1 - z0) / 2 };
    meshes.push(mesh);
  }
  return meshes;
}
