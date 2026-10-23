import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { makeLookMaterial, FOLIAGE_WRAP } from './shading.js';
import { bakeOcclusion } from './occlusion.js';
import { addSurface, INSTANCE_ORIGIN } from './floating.js';
import { aquaticAtlas, aquaticUV } from './aquatic-textures.js';

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

const CULL = [420, 620, 260, 520];   // metres from the camera to a bin's region centre, per kind

// Cards: indexed quads (upright ones in rows, so the occlusion and the sway have vertices to work with), each
// corner with its colour, its shading normal, its atlas UV and its part (0 leaf, 1 flower).
class Cards {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.part = []; this.ix = []; }
  vert(x, y, z, n, col, uv, part) {
    this.p.push(x, y, z); this.n.push(n.x, n.y, n.z); this.c.push(col.r, col.g, col.b); this.uv.push(uv[0], uv[1]); this.part.push(part);
    return this.p.length / 3 - 1;
  }
  // a card lying flat at height y: centre (x, z), half size r, turned by a
  flat(x, y, z, r, a, sprite, col, part = 0) {
    const c = Math.cos(a), s = Math.sin(a), up = new THREE.Vector3(0, 1, 0), k = [];
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const lx = (u * 2 - 1) * r, lz = (v * 2 - 1) * r;
      k.push(this.vert(x + lx * c - lz * s, y, z + lx * s + lz * c, up, col, aquaticUV(sprite, u, v), part));
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
  const C = new Cards(), n = 7 + Math.floor(rng() * 8), pads = [];
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

// a clump of reeds: cards rooted near the middle, their faces spread round so it is full from any side, leaning out
// a little; kind 0 bulrush, 1 reed and sedge, 2 cattail. Roots go below the water so the clump stands in it.
const CLUMP = [
  { sprite: 'rush', cards: [3, 5], w: [0.5, 0.75], h: [1.3, 1.9], col: [0.95, 1.0, 0.95] },
  { sprite: 'reed', cards: [3, 5], w: [0.7, 1.0], h: [1.0, 1.5], col: [1.0, 1.0, 0.95] },
  { sprite: 'cattail', cards: [3, 4], w: [0.75, 1.0], h: [1.6, 2.2], col: [1.0, 1.0, 1.0] },
];
const ROWS = [0, 0.12, 0.24, 0.45, 1];
function reedClump(rng, kind) {
  const K = CLUMP[kind], C = new Cards(), n = K.cards[0] + Math.floor(rng() * (K.cards[1] - K.cards[0] + 1));
  const yaw0 = rng() * Math.PI;
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = rng() * 0.22, x = Math.cos(a) * d, z = Math.sin(a) * d;
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

// submerged weed: crossed cards rising from the bed, y from 0 (bed) to 1 (tip) for the sway
function weed(rng) {
  const C = new Cards(), yaw = rng() * Math.PI;
  for (let i = 0; i < 3; i++) C.upright((rng() - 0.5) * 0.15, 0, (rng() - 0.5) * 0.15, 0.55 + rng() * 0.2, 1.0, yaw + (i / 3) * Math.PI, 0, 0, 'weed', tint(rng, 0.85, 0.95, 0.85, 0.08), [0, 0.3, 1], 0, 0);
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
const vertexBody = (kind) => INSTANCE_ORIGIN + /* glsl */ `
  {
    vAqUv = uv; vAqPart = aPart;
    ${kind === 0 || kind === 3 ? 'transformed *= uGrow;' : ''}
    ${kind === 2 ? '' : 'transformed *= 1.0 - step(0.5, uIceHide);'}
    ${kind === 2
      ? 'float ph = uWaterTime * 1.1 + ipRel.x * 0.5 + ipRel.y * 0.35; transformed.x += sin(ph) * 0.12 * position.y; transformed.z += cos(ph * 0.7) * 0.07 * position.y;'
      : `transformed.y += renderedWave(ipRel, uWaterTime) / sy;
    ${kind === 0 ? '' : `float hh = max(position.y, 0.0); hh *= hh;
    float ph = uWaterTime * (1.3 + 0.08 * uWindSpeed) + ipRel.x * 0.37 + ipRel.y * 0.29 + position.x * 0.6;
    float amp = (0.015 + 0.006 * uWindSpeed) * hh;
    transformed.x += (sin(ph) + 0.4 * sin(ph * 2.3 + 1.1)) * amp; transformed.z += cos(ph * 0.8) * amp * 0.7;`}`}
  }`;
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
      addSurface(shader, water, AQUA, 'uniform float uGrow, uIceHide;\nattribute float aPart;\nvarying vec2 vAqUv;\nvarying float vAqPart;');
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
    addSurface(shader, water, AQUA, 'uniform float uGrow, uIceHide;\nattribute float aPart;\nvarying vec2 vAqUv;\nvarying float vAqPart;');
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
    [padRaft(rng, 0), padRaft(rng, 0), padRaft(rng, 1), padRaft(rng, 2)],
    [reedClump(rng, 0), reedClump(rng, 1), reedClump(rng, 2)],
    [weed(rng), weed(rng)],
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
    mesh.userData.lod = { full: geo, low: geo, cx: b.cx, cz: b.cz, lod: Infinity, cull: CULL[b.kind] ?? 600 };
    meshes.push(mesh);
  }
  return meshes;
}
