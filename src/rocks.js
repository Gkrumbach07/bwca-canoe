import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm } from './rng.js';

// Boulders in a different register from the faceted ground: smooth, rounded, sculpted volumes shaded
// in three flat tones (a toon ramp) with a warm top and a cool underside, the way Firewatch paints rock.

export function makeRockMaterial() {
  const ramp = new THREE.DataTexture(new Uint8Array([60, 110, 170, 230, 255]), 5, 1, THREE.RedFormat, THREE.UnsignedByteType);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
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
