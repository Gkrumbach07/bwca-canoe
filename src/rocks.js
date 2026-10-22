import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm } from './rng.js';

// The toon register: smooth, rounded volumes shaded in a few flat tones (a stepped ramp), the way
// Firewatch paints rock, bark and canopy. The faceted ground stays Lambert for contrast.

let ramp = null;
export function toonRamp() {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([60, 110, 170, 230, 255]), 5, 1, THREE.RedFormat, THREE.UnsignedByteType);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}

export function makeToonMaterial(opts = {}) {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), ...opts });
}
export function makeRockMaterial() { return makeToonMaterial(); }

// GeoBuilder output is flat: three unshared vertices per face. Weld the faces that share a position and a
// colour and recompute the normals, so each coloured part (a canopy cone, a trunk, a hull) shades as one
// smooth volume while the colour boundaries stay crisp.
export function smoothToon(geo) {
  geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-4);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function smoothBoulder(rng, seed) {
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1, 3));
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0xa49d90), side = new THREE.Color(0x8a877f), under = new THREE.Color(0x6e7273), c = new THREE.Color();
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
// the stem must not blur into the sides.
export function creasedToon(geo, angle = Math.PI / 3) {
  geo.deleteAttribute('normal');
  const g = toCreasedNormals(mergeVertices(geo, 1e-4), angle);
  g.computeBoundingSphere();
  return g;
}

// Angular Shield rock, flat-faceted: a jittered low-order icosahedron pushed toward a box (a split block),
// flattened and tilted (a slab), or left rounder (a boulder). Warm top, cooler sides, dark underside, a
// few lichen-pale faces on top.
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
  const top = new THREE.Color(0xa89e92), side = new THREE.Color(0x8c8880), under = new THREE.Color(0x6c7072), lichen = new THREE.Color(0x9ca68c), c = new THREE.Color();
  for (let f = 0; f < pos.count; f += 3) {
    const ny = (nrm.getY(f) + nrm.getY(f + 1) + nrm.getY(f + 2)) / 3;
    c.copy(under).lerp(side, THREE.MathUtils.smoothstep(ny, -0.6, 0.0)).lerp(top, THREE.MathUtils.smoothstep(ny, 0.25, 0.8));
    if (ny > 0.35 && rng() < 0.18) c.copy(lichen);
    for (let k = 0; k < 3; k++) { col[(f + k) * 3] = c.r; col[(f + k) * 3 + 1] = c.g; col[(f + k) * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}
