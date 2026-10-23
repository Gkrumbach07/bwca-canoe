import * as THREE from 'three';
import { smoothstep } from './rng.js';

// The headlamp: a soft warm-white cone from the paddler's hat band, enough to find the tent and the grate and to see
// the shore ahead, not a searchlight. One SpotLight that is always in the scene (intensity 0 when off: a light
// coming or going recompiles every lit material, docs/look.md), no shadow, on layer 0 with the sun, the fill and the
// moon (the mirror pass draws with no lights). Each frame it rides the figure's head bone and points along the
// heading, a little down (third person), or sits at the eye and points along the look (first person). A small
// unlit bead on the hat band and a faint glow round it show that it is on from behind.
//   H toggles it (main.js reads the key through the game's input, so a card or a panel holds it); it turns itself
//   off on sleep (camp.js) and once the sun is well up.
export const LAMP = {
  color: 0xfff0dc,   // a warm LED white
  intensity: 7,      // candela at full: about the ground's daylight share at 4 m, falling off past 10
  distance: 30,      // where the light stops
  decay: 1.6,
  angle: 0.55,       // the cone's half angle (rad)
  penumbra: 0.85,    // most of the cone is its soft edge: a brighter middle and a wide spill
  pitchFoot: -0.32,  // the beam's tilt below the heading on foot (third person), radians
  pitchBoat: -0.16,  // and seated in the canoe
  ease: 6,           // per second: how fast it comes up and goes down
  offAt: 5,          // sun elevation (deg) above which it switches itself off
};

const glowVert = /* glsl */ `
  uniform float uSize;
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = position.xy;
    // a billboard round the bead's origin, scaled with the bone (the first-person view collapses the head)
    float s = length(modelMatrix[0].xyz);
    vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mvPosition.xy += position.xy * uSize * s;
    mvPosition.z += 0.02;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const glowFrag = /* glsl */ `
  uniform float uLevel;
  uniform vec3 uColor;
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float r = length(vUv) * 2.0;
    float a = pow(max(0.0, 1.0 - r), 2.2) * uLevel;
    if (a < 0.002) discard;
    vec3 c = uColor * a;
    #ifdef USE_FOG
      c *= 1.0 - fogAt(vFogDir).a;
    #endif
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const _p = new THREE.Vector3(), _d = new THREE.Vector3();
const BEAD_AT = new THREE.Vector3(0.106, 0.176, 0); // on the hat band's front, in head-bone space (figure.js buildHat)

export class Headlamp {
  // { scene, canoe, chase, camera, player, day }
  constructor({ scene, canoe, chase, camera, player, day }) {
    Object.assign(this, { canoe, chase, camera, player, day });
    const L = this.light = new THREE.SpotLight(LAMP.color, 0, LAMP.distance, LAMP.angle, LAMP.penumbra, LAMP.decay);
    L.name = 'headlamp'; L.castShadow = false;
    L.target.name = 'headlamp target';
    scene.add(L, L.target);
    // the bead and its glow, on the head bone
    const head = canoe.figure.bones.head;
    this.lensOff = new THREE.Color(0x2c2b29); this.lensOn = new THREE.Color(LAMP.color).multiplyScalar(4);
    this.bead = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 6), new THREE.MeshBasicMaterial({ color: this.lensOff.clone() }));
    this.bead.name = 'headlamp bead';
    this.bead.position.copy(BEAD_AT);
    head.add(this.bead);
    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: glowVert, fragmentShader: glowFrag,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uSize: { value: 0.22 }, uLevel: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.84, 0.62).multiplyScalar(1.1) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    });
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.glow = new THREE.Mesh(quad, this.glowMat);
    this.glow.name = 'headlamp glow'; this.glow.frustumCulled = false; this.glow.renderOrder = 15;
    this.bead.add(this.glow);
    this.on = false; this.level = 0;
    this.onNote = null; // set by main: a line in the HUD
  }

  // switch it (no argument: the other way); returns whether it is on
  toggle(on = !this.on) {
    this.on = !!on;
    return this.on;
  }

  // dt: real seconds. Runs every frame, behind the title card too (the light follows the figure there).
  update(dt) {
    const day = this.day;
    if (this.on && day && day.elevation > LAMP.offAt) this.on = false; // full daylight: off by itself
    const k = 1 - Math.exp(-dt * LAMP.ease);
    this.level += ((this.on ? 1 : 0) - this.level) * k;
    if (this.level < 1e-3 && !this.on) this.level = 0;
    const L = this.light, lv = this.level;
    // a cool night makes no difference to the lamp; dusk does: it reads only once the sky has gone (it is never
    // turned down, the eye just stops noticing it by day)
    L.intensity = LAMP.intensity * lv;
    this.bead.material.color.copy(this.lensOff).lerp(this.lensOn, lv);
    // the glow is drawn every frame, on or off (its program is made behind the title card, not when H is first
    // pressed); from the eyes, or off, it has nothing to show
    const first = this.chase.mode === 'first' && !this.chase.focus;
    this.glowMat.uniforms.uLevel.value = first ? 0 : lv * (day ? 0.35 + 0.65 * (1 - smoothstep(-4, 4, day.elevation)) : 1);
    if (lv <= 0) return;
    // where it is and where it points
    const p = this.player;
    if (first) {
      const cam = this.camera;
      cam.getWorldDirection(_d);
      _p.copy(cam.position).addScaledVector(_d, 0.05); _p.y += 0.04;
    } else {
      this.bead.updateWorldMatrix(true, false);
      this.bead.getWorldPosition(_p);
      const f = p.forward, pitch = p.onFoot || p.mode === 'swim' ? LAMP.pitchFoot : LAMP.pitchBoat;
      _d.set(f.x * Math.cos(pitch), Math.sin(pitch), f.z * Math.cos(pitch));
      _p.addScaledVector(_d, 0.04);
    }
    L.position.copy(_p);
    L.target.position.copy(_p).addScaledVector(_d, 8);
    L.updateMatrixWorld(); L.target.updateMatrixWorld();
  }
}
