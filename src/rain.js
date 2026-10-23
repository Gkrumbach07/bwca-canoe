import * as THREE from 'three';

// Rain and snow near the camera: one draw of thin quads in a box that wraps round the eye (weather.js drives it).
// Every drop has a fixed place in a world-space lattice the size of the box, moved on by its fall (the wind's push
// plus gravity) and wrapped into the box about the camera in the vertex shader, so the drops hold still in the world
// while the camera moves through them, and nothing is spawned or kept on the CPU. A rain drop is a streak along its
// velocity, turned about that axis to face the eye; a snowflake a small soft quad facing the eye that sways as it
// falls. The amount thins the drops (a drop whose seed is over it collapses to nothing), so light rain is the same
// field, sparser. Lit by the sky fill (the day cycle's hemisphere), and by the lightning.
//
// Cost: one draw of COUNT quads (4 vertices each), thin and near; nothing at all when the amount is zero.
const COUNT = 9000;
const BOX = new THREE.Vector3(34, 20, 34);   // metres: the volume about the eye
const vert = /* glsl */ `
  uniform vec3 uCam, uBox, uFall;
  uniform float uTime, uAmount, uSnow, uLen, uWidth;
  attribute vec4 aSeed;     // xyz: place in the box (0..1), w: which share of the amount it belongs to
  attribute vec2 aCorner;   // x: across (-1..1), y: along (0 tail .. 1 head)
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    vec3 lo = uCam - uBox * vec3(0.5, 0.35, 0.5);
    vec3 fall = uFall * (1.0 + (aSeed.w - 0.5) * 0.3);
    vec3 p = aSeed.xyz * uBox + fall * uTime;
    // snow sways about its line
    p.xz += uSnow * vec2(sin(uTime * 1.3 + aSeed.w * 40.0), cos(uTime * 1.1 + aSeed.x * 31.0)) * 0.35;
    p = lo + mod(p - lo, uBox);
    vec3 toEye = uCam - p;
    float dist = length(toEye);
    vec3 view = toEye / max(dist, 1e-3);
    vec3 axis = normalize(fall);
    // rain: a streak along the fall, as wide as uWidth, facing the eye about that axis; snow: a quad facing the eye
    vec3 side = normalize(cross(axis, view));
    vec3 up = mix(axis, normalize(cross(view, side)), uSnow);
    float len = mix(uLen, uWidth, uSnow);
    vec3 pos = p + side * aCorner.x * uWidth + up * (aCorner.y - 0.5) * len;
    float on = step(aSeed.w, uAmount);
    // fade in past the lens (a drop on the eye is a smear), out toward the box's walls
    vAlpha = on * smoothstep(1.0, 3.0, dist) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, dist));
    vUv = aCorner;
    gl_Position = projectionMatrix * viewMatrix * vec4(on > 0.0 ? pos : uCam, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity, uSnow;
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    // a streak thins to its ends; a flake is a soft round spot
    float across = 1.0 - abs(vUv.x);
    float along = sin(3.14159 * vUv.y);
    float rain = across * along;
    float flake = 1.0 - smoothstep(0.35, 1.0, length(vec2(vUv.x, vUv.y * 2.0 - 1.0)));
    float a = vAlpha * mix(rain, flake, uSnow) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Precip {
  constructor(count = COUNT) {
    const seed = new Float32Array(count * 4 * 4), corner = new Float32Array(count * 4 * 2), index = new Uint32Array(count * 6);
    let s = 7;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < count; i++) {
      const a = [rnd(), rnd(), rnd(), rnd()];
      for (let k = 0; k < 4; k++) {
        seed.set(a, (i * 4 + k) * 4);
        corner.set([k & 1 ? 1 : -1, k >> 1], (i * 4 + k) * 2);
      }
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3)); // unused; three wants one
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: {
        uCam: { value: new THREE.Vector3() }, uBox: { value: BOX.clone() }, uFall: { value: new THREE.Vector3(0, -9, 0) },
        uTime: { value: 0 }, uAmount: { value: 0 }, uSnow: { value: 0 }, uLen: { value: 0.75 }, uWidth: { value: 0.008 },
        uColor: { value: new THREE.Color(0.7, 0.74, 0.8) }, uOpacity: { value: 0.3 },
      },
      transparent: true, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'precipitation';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;   // after the water and the mist
    this.mesh.visible = false;
    this.time = 0;
  }

  // amount 0..1 (how many of the drops fall), snow 0..1, wind: { x, z } the way it blows and speed (m/s), the eye,
  // light: the colour the drops catch (linear)
  update(dt, { amount, snow, windX, windZ, windSpeed, eye, light }) {
    const u = this.material.uniforms;
    this.mesh.visible = amount > 0.004;
    if (!this.mesh.visible) return;
    // the clock wraps every ten minutes to stay inside float precision (the drops reshuffle then, unseen in rain)
    this.time = (this.time + dt) % 600;
    u.uTime.value = this.time;
    u.uCam.value.copy(eye);
    u.uAmount.value = amount;
    u.uSnow.value = snow;
    // rain falls at ~9 m/s, pushed a little by the wind; snow at ~1.1 m/s and blown along much more
    const push = Math.min(windSpeed, 18) * (0.12 + 0.45 * snow);
    u.uFall.value.set(windX * push, -(9 - 7.9 * snow), windZ * push);
    u.uLen.value = 0.55 + 0.35 * Math.min(1, amount * 1.5);
    u.uWidth.value = 0.005 + 0.032 * snow;
    u.uOpacity.value = 0.12 + 0.08 * amount + 0.5 * snow;
    u.uColor.value.copy(light);
  }
}
