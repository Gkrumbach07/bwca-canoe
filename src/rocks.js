import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm } from './rng.js';
import { makeLookMaterial, FOLIAGE_WRAP } from './shading.js';
import { bakeOcclusion } from './occlusion.js';

// The solid register: smooth, rounded volumes under the look's smooth Lambert (shading.js), with occlusion
// baked into the vertex colour (occlusion.js), the way Firewatch paints rock, bark and canopy: the colour
// arrives through the light. No ramp, no rim.

// The material for rock, bark, props, the canoe and the walker: plain Lambert. (The name is the old one,
// kept so the canoe, the props and the fishing kit need no change; nothing in it is toon any more.)
export function makeToonMaterial(opts = {}) { return makeLookMaterial(opts, { wrap: 0, name: 'look-solid' }); }
export function makeRockMaterial() { return makeLookMaterial({}, { wrap: 0, name: 'look-rock' }); }
// Vegetation: the wrap is read per vertex (aWrap, written by smoothToon): leaves wrap the light past the
// terminator (dotNL * 0.6 + 0.4), bark does not.
export function makeFoliageMaterial(opts = {}, compile = null, name = 'look-foliage') {
  return makeLookMaterial(opts, { wrap: 'varying', name, compile });
}

// Which vertices are foliage: greens and yellows with some saturation (bark, snow-white birch and grey are
// not), the same test vegetation.js uses for the leaves the seasons turn.
const _c = new THREE.Color(), _hsl = { h: 0, s: 0, l: 0 };
function tagWrap(geo) {
  const col = geo.getAttribute('color'), w = new Float32Array(col.count);
  for (let i = 0; i < col.count; i++) {
    _c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).getHSL(_hsl);
    w[i] = _hsl.s > 0.2 && _hsl.h > 0.1 && _hsl.h < 0.47 ? FOLIAGE_WRAP : 0;
  }
  geo.setAttribute('aWrap', new THREE.BufferAttribute(w, 1));
  return geo;
}

// Where a welded part stands on the ground: anything taller than 0.8 m whose base reaches within 0.6 m of
// its origin is a plant (trees are sunk ~0.3 m into the ground by placement), so its occlusion bake gets a
// ground plane there; small parts (the walker's pieces, the fishing kit) float free.
function groundOf(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  return b.min.y < 0.6 && b.max.y > 0.8 ? 0.3 : null;
}

// GeoBuilder output is flat: three unshared vertices per face. Weld the faces that share a position and a
// colour and recompute the normals, so each coloured part (a canopy cone, a trunk, a hull) shades as one
// smooth volume while the colour boundaries stay crisp; tag the foliage for the wrapped light and bake the
// occlusion into the colour.
export function smoothToon(geo) {
  geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-4);
  g.computeVertexNormals();
  tagWrap(g);
  bakeOcclusion(g, { ground: groundOf(g) });
  g.computeBoundingSphere();
  return g;
}

export function smoothBoulder(rng, seed) {
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1, 3));
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0xaea699), side = new THREE.Color(0x8e8b84), under = new THREE.Color(0x66707a), c = new THREE.Color();
  const v = new THREE.Vector3();
  const sx = 1 + rng() * 0.7, sy = 0.55 + rng() * 0.3, sz = 1 + rng() * 0.5;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // low-frequency lumps, a flatter bottom
    const bump = 1 + (fbm(v.x * 1.2 + seed, v.y * 1.2 + v.z * 0.6, 2, 83) - 0.5) * 0.24;
    const flat = v.y < -0.3 ? 1 - (-0.3 - v.y) * 0.5 : 1;
    v.multiplyScalar(bump * flat);
    pos.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
    c.copy(under).lerp(side, THREE.MathUtils.smoothstep(v.y, -0.6, 0.1)).lerp(top, THREE.MathUtils.smoothstep(v.y, 0.2, 0.8));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// Like smoothToon, but edges sharper than `angle` stay creased: for a hull or a box, where the keel and
// the stem must not blur into the sides. Occlusion baked in, no ground (a hull floats).
export function creasedToon(geo, angle = Math.PI / 3) {
  geo.deleteAttribute('normal');
  const g = toCreasedNormals(mergeVertices(geo, 1e-4), angle);
  bakeOcclusion(g, { rays: 20 });
  g.computeBoundingSphere();
  return g;
}

// Angular Shield rock, flat-faceted: a jittered low-order icosahedron pushed toward a box (a split block),
// flattened and tilted (a slab), or left rounder (a boulder). Warm top, cooler sides, dark underside, a
// few lichen-pale faces on top; occlusion baked against a ground plane a little above its base, where
// placement sinks it (boulders 15–50 % of their height, outcrop slabs about a quarter), so it sits in the
// ground instead of on it.
export function angularRock(rng, kind = 'block') {
  const geo = new THREE.IcosahedronGeometry(1, kind === 'boulder' ? 2 : 1);
  const pos = geo.getAttribute('position');
  const seen = new Map(), v = new THREE.Vector3(), n = new THREE.Vector3();
  const jit = kind === 'boulder' ? 0.16 : 0.3, box = kind === 'block' ? 0.6 : kind === 'slab' ? 0.75 : 1.0;
  const sx = kind === 'slab' ? 1.3 + rng() * 0.6 : 0.9 + rng() * 0.4;
  const sy = kind === 'slab' ? 0.28 + rng() * 0.17 : kind === 'block' ? 0.7 + rng() * 0.3 : 0.6 + rng() * 0.25;
  const sz = kind === 'slab' ? 0.9 + rng() * 0.45 : 0.85 + rng() * 0.35;
  const tilt = new THREE.Euler((rng() - 0.5) * (kind === 'slab' ? 0.5 : 0.3), rng() * 6.28, (rng() - 0.5) * (kind === 'slab' ? 0.6 : 0.3));
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let p = seen.get(key);
    if (!p) {
      n.copy(v).normalize();
      // push toward a box: |c|^box keeps the sign, flattens the faces, sharpens the corners
      p = new THREE.Vector3(Math.sign(n.x) * Math.abs(n.x) ** box, Math.sign(n.y) * Math.abs(n.y) ** box, Math.sign(n.z) * Math.abs(n.z) ** box);
      p.multiplyScalar(1 + (rng() - 0.5) * jit);
      if (p.y < -0.35) p.y = -0.35 - (p.y + 0.35) * 0.3; // a flatter base
      seen.set(key, p);
    }
    v.set(p.x * sx, p.y * sy, p.z * sz).applyEuler(tilt);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals(); // non-indexed: one normal per face, flat
  const nrm = geo.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  // the underside was painted dark and blue for the toon ramp; the light and the baked occlusion do that now
  const top = new THREE.Color(0xb2a89a), side = new THREE.Color(0x9a958d), under = new THREE.Color(0x80817f), lichen = new THREE.Color(0xa4ae90), c = new THREE.Color();
  for (let f = 0; f < pos.count; f += 3) {
    const ny = (nrm.getY(f) + nrm.getY(f + 1) + nrm.getY(f + 2)) / 3;
    c.copy(under).lerp(side, THREE.MathUtils.smoothstep(ny, -0.6, 0.0)).lerp(top, THREE.MathUtils.smoothstep(ny, 0.25, 0.8));
    if (ny > 0.35 && rng() < 0.18) c.copy(lichen);
    for (let k = 0; k < 3; k++) { col[(f + k) * 3] = c.r; col[(f + k) * 3 + 1] = c.g; col[(f + k) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bakeOcclusion(geo, { ground: 0.15, reach: 1.2, rays: 24, floor: 0.55 });
  geo.computeBoundingSphere();
  return geo;
}
