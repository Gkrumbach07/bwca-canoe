import * as THREE from 'three';
import { REFLECT_LAYER } from './water.js';
import { PropBuilder, propMaterial, TILE } from './prop-kit.js';
import { smoothstep } from './rng.js';

// Campfires in the steel grates of the campsites (props.js builds the ring and the grate; camp.js lights the fire).
// A fire is a few split logs crossed on the ash, a handful of flames, a bed of embers, sparks going up and a thread
// of smoke, all on two light-free shader materials (additive for what glows, plain blending for the smoke, the
// pattern of mist.js), plus one PointLight that is always in the scene: intensity 0 when nothing burns (a light
// coming or going recompiles every lit material, docs/look.md), carried by the lit fire nearest the eye. It sits on
// layer 0 with the sun, the fill and the moon (the mirror pass draws with no lights); the flames are on the mirror's
// layer, so a fire by the water shows in it.
//
// A fire burns FIRE.burn game hours on an armful of wood (hubs 3A: camp.js lights it with one and feeds it another),
// up to FIRE.most hours of wood at once. It burns full while there is plenty left, then burns down over the last
// FIRE.low hours: the flames shorten, the light dims to FIRE.floor of itself, the split lengths in the ring char and sink
// and the bed of coals under them brightens. Out of wood, the embers glow for FIRE.embers more; then it is out. Times
// are absolute game hours (day.doy * 24 + day.hours, as energy.js keeps them).
export const FIRE = {
  burn: 3,            // game hours a fire burns on one armful of wood
  most: 5,            // game hours of wood a fire holds at once (about two armfuls)
  low: 1.6,           // game hours left under which it burns down
  floor: 0.25,        // how hard it still burns (the flames, the light) just before the wood is gone
  embers: 0.75,       // game hours the embers glow after
  color: 0xff8a3d,
  intensity: 9,       // candela at full heat
  distance: 18,
  decay: 1.8,
  lift: 0.45,         // the light's height over the ash (m)
};
// A steady light (an outfitter's store lamp, props.js storeLayout lamp) borrows the same PointLight when it is the
// lit thing nearest the eye: warm, no flicker, a smaller pool. reach: metres from the eye past which it lets it go.
export const STEADY = { color: 0xffcf94, intensity: 7, distance: 11, decay: 1.4, reach: 70 };
const _fireColor = new THREE.Color(FIRE.color);

const glslNoise = /* glsl */ `
  float fh(vec2 p) { p = fract(p * vec2(0.3183099, 0.3678794)) * 51.0; return fract(p.x * p.y * (p.x + p.y)); }
  float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
`;

// what glows: flames (kind 0, billboards turning about the vertical, their foot on the base), the ember bed (kind 1,
// flat on the ash) and sparks (kind 2, rising and drifting with the wind)
const glowVert = /* glsl */ `
  attribute vec3 aBase;
  attribute vec2 aSize;
  attribute float aSeed, aKind;
  uniform float uTime, uFlame;
  uniform vec2 uWind;
  varying vec2 vUv;
  varying float vSeed, vKind, vFade;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = position.xy; vSeed = aSeed; vKind = aKind; vFade = 1.0;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 w;
    if (aKind < 0.5) {
      vec3 r = normalize(vec3(right.x, 0.0, right.z) + vec3(1e-5, 0.0, 0.0));
      float h = aSize.y * uFlame * (0.82 + 0.28 * sin(uTime * (2.1 + aSeed * 1.7) + aSeed * 17.0));
      float bend = position.y * position.y * h;
      w = aBase + r * position.x * aSize.x * (0.55 + 0.45 * uFlame) + vec3(0.0, position.y * h, 0.0) + vec3(uWind.x, 0.0, uWind.y) * bend * 0.45;
    } else if (aKind < 1.5) {
      w = aBase + vec3(position.x * aSize.x, 0.0, (position.y - 0.5) * aSize.y);
    } else {
      float t = fract(uTime * (0.3 + 0.25 * fract(aSeed * 7.1)) + aSeed);
      vec3 drift = vec3(sin(aSeed * 40.0 + t * 5.0), 0.0, cos(aSeed * 23.0 + t * 4.0)) * 0.13 * t + vec3(uWind.x, 0.0, uWind.y) * t * t * 0.9;
      vec3 c = aBase + vec3(0.0, 0.12 + t * (1.1 + 0.7 * fract(aSeed * 3.3)) * uFlame, 0.0) + drift;
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      w = c + right * position.x * aSize.x + up * (position.y - 0.5) * aSize.y;
      vFade = (1.0 - t) * smoothstep(0.0, 0.06, t) * step(0.5, fract(aSeed * 13.7 + floor(uTime * (0.3 + 0.25 * fract(aSeed * 7.1)) + aSeed) * 0.618));
    }
    vec4 mvPosition = modelViewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const glowFrag = /* glsl */ `
  uniform float uTime, uHeat, uEmber;
  varying vec2 vUv;
  varying float vSeed, vKind, vFade;
  #include <common>
  #include <fog_pars_fragment>
  ${glslNoise}
  void main() {
    vec3 col;
    float a;
    if (vKind < 0.5) {
      // a flame: a teardrop, widest a third of the way up, licked sideways and torn at the tip by noise rising
      // through it; a yellow core low down, orange round it, red at the tips. Clean edges, as a painted flame has.
      float y = vUv.y, x = vUv.x * 2.0, t = uTime;
      float n = fn(vec2(x * 1.6 + vSeed * 9.0, y * 2.4 - t * (2.0 + vSeed)));
      float n2 = fn(vec2(x * 3.3 - vSeed * 5.0, y * 4.6 - t * 3.6));
      x += (n - 0.5) * 0.55 * y + sin(y * 4.0 - t * (3.0 + vSeed * 2.0) + vSeed * 6.0) * 0.12 * y;
      float w = 1.9 * sqrt(max(y, 0.0)) * pow(max(1.0 - y, 0.0), 0.9) * (0.75 + 0.5 * n2);
      a = 1.0 - smoothstep(-0.1, 0.0, abs(x) - w);
      a *= 1.0 - smoothstep(0.55, 0.95, y + (n - 0.5) * 0.4);
      a *= smoothstep(0.0, 0.06, y);
      float core = (1.0 - smoothstep(-0.1, 0.0, abs(x) - w * 0.4)) * (1.0 - smoothstep(0.1, 0.5, y + (n2 - 0.5) * 0.2));
      vec3 outer = mix(vec3(1.9, 0.62, 0.11), vec3(0.85, 0.16, 0.025), smoothstep(0.3, 0.92, y));
      col = mix(outer, vec3(2.4, 1.45, 0.42), core) * uHeat;
    } else if (vKind < 1.5) {
      // the embers: coals in the ash, breathing
      vec2 q = vUv - vec2(0.0, 0.5);
      float r = length(q) * 2.0;
      float n = fn(q * 9.0 + vSeed * 3.0) * 0.7 + fn(q * 23.0 - uTime * 0.25) * 0.3;
      float pulse = 0.7 + 0.3 * sin(uTime * 1.6 + n * 7.0);
      a = (1.0 - smoothstep(0.45, 1.0, r)) * smoothstep(0.38, 0.78, n) * pulse;
      col = mix(vec3(0.8, 0.1, 0.015), vec3(2.6, 0.85, 0.16), smoothstep(0.55, 0.9, n)) * uEmber;
    } else {
      vec2 q = vUv - vec2(0.0, 0.5);
      a = (1.0 - smoothstep(0.0, 1.0, length(q) * 2.0)) * vFade;
      col = vec3(3.0, 1.35, 0.32) * uHeat;
    }
    col *= a;
    #ifdef USE_FOG
      col *= 1.0 - fogAt(vFogDir).a;
    #endif
    if (col.r + col.g < 0.004) discard;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
// the smoke: soft puffs rising and widening, carried off by the wind, lit by the sky's fill and the fire under them
const smokeVert = /* glsl */ `
  attribute vec3 aBase;
  attribute float aSeed;
  uniform float uTime, uSmoke;
  uniform vec2 uWind;
  varying vec2 vUv;
  varying float vA, vSeed, vLow;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = position.xy; vSeed = aSeed;
    float t = fract(uTime * 0.075 + aSeed);
    vec3 c = aBase + vec3(0.0, 0.55 + t * 4.2, 0.0) + vec3(uWind.x, 0.0, uWind.y) * t * t * 3.2
      + vec3(sin(aSeed * 31.0 + t * 2.0), 0.0, cos(aSeed * 17.0 + t * 2.0)) * 0.3 * t;
    float s = 0.25 + t * 1.5;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 w = c + (right * position.x + up * position.y) * s;
    vA = uSmoke * smoothstep(0.0, 0.12, t) * (1.0 - t);
    vLow = 1.0 - smoothstep(0.0, 0.35, t);
    vec4 mvPosition = modelViewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const smokeFrag = /* glsl */ `
  uniform vec3 uColor, uGlow;
  varying vec2 vUv;
  varying float vA, vSeed, vLow;
  #include <common>
  #include <fog_pars_fragment>
  ${glslNoise}
  void main() {
    float r = length(vUv) * 2.0, n = fn(vUv * 3.0 + vSeed * 11.0);
    float a = (1.0 - smoothstep(0.2, 1.0, r + (n - 0.5) * 0.5)) * vA * 0.1;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor + uGlow * vLow, a);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const FLAMES = [ // base (x, z from the middle of the ash), width, height, seed: one tall tongue, a few lower round it
  [0, 0, 0.42, 0.92, 0.11], [0.1, 0.06, 0.34, 0.72, 0.37], [-0.11, -0.04, 0.36, 0.66, 0.53], [0.04, -0.11, 0.3, 0.58, 0.71],
  [-0.06, 0.12, 0.28, 0.52, 0.83], [0.16, -0.07, 0.24, 0.42, 0.29], [-0.17, 0.07, 0.24, 0.4, 0.61], [0.02, 0.17, 0.22, 0.36, 0.47],
];
const SPARKS = 14, PUFFS = 11;
const PARKED = -1e4; // y of a fire not burning (FireLook.park)
const _c = new THREE.Color();

let shared = null;
function materials() {
  if (shared) return shared;
  const fog = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  const time = { value: 0 }, wind = { value: new THREE.Vector2() };
  const glow = new THREE.ShaderMaterial({
    vertexShader: glowVert, fragmentShader: glowFrag,
    uniforms: { ...fog(), uTime: time, uWind: wind, uFlame: { value: 1 }, uHeat: { value: 1 }, uEmber: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, side: THREE.DoubleSide,
  });
  const smoke = new THREE.ShaderMaterial({
    vertexShader: smokeVert, fragmentShader: smokeFrag,
    uniforms: { ...fog(), uTime: time, uWind: wind, uSmoke: { value: 1 }, uColor: { value: new THREE.Color(0.5, 0.52, 0.55) }, uGlow: { value: new THREE.Color(0, 0, 0) } },
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
  shared = { glow, smoke, time, wind };
  return shared;
}

// quads in one geometry: position is the corner (x -0.5..0.5, y 0..1), the rest per quad
function quads(list) {
  const P = [], B = [], S = [], E = [], K = [], I = [];
  list.forEach(({ base, size = [1, 1], seed, kind = 0 }, q) => {
    for (const [cx, cy] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) { P.push(cx, cy, 0); B.push(...base); S.push(...size); E.push(seed); K.push(kind); }
    const o = q * 4; I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aBase', new THREE.Float32BufferAttribute(B, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 2));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(E, 1));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(K, 1));
  g.setIndex(I);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 4);
  return g;
}

// the wood: four split lengths crossed in two layers on the ash, under the grate (built along +x; the fire turns
// it to the grate's bearing)
function woodGeometry() {
  const b = new PropBuilder(), V = (x, y, z) => new THREE.Vector3(x, y, z), bark = new THREE.Color(0x4b3d31), end = new THREE.Color(0x2a2522);
  for (const [z, y, r] of [[-0.11, 0.045, 0.045], [0.12, 0.05, 0.05]]) b.cyl(V(-0.24, y, z), V(0.22, y + 0.01, z + 0.02), r, r * 0.9, 7, TILE.BARK, bark, { cap0: true, cap1: true, capCol: end });
  for (const [x, y, r] of [[-0.1, 0.13, 0.04], [0.1, 0.135, 0.043]]) b.cyl(V(x, y, -0.22), V(x + 0.03, y, 0.23), r, r * 0.88, 7, TILE.BARK, bark, { cap0: true, cap1: true, capCol: end });
  const g = b.build();
  const O = g.getAttribute('aOcc'); for (let i = 0; i < O.count; i++) O.setX(i, 0.75); // charred, half buried in ash
  return g;
}

class FireLook {
  constructor(scene) {
    const M = materials();
    this.group = new THREE.Group(); this.group.name = 'campfire';
    const list = FLAMES.map(([x, z, w, h, seed]) => ({ base: [x, 0.04, z], size: [w, h], seed, kind: 0 }));
    list.push({ base: [0, 0.062, 0], size: [0.95, 0.95], seed: 0.4, kind: 1 });
    for (let i = 0; i < SPARKS; i++) list.push({ base: [(Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3], size: [0.022, 0.022], seed: (i + 0.5) / SPARKS + Math.random() * 0.03, kind: 2 });
    this.glow = new THREE.Mesh(quads(list), M.glow);
    this.glow.renderOrder = 16; this.glow.layers.enable(REFLECT_LAYER);
    this.smoke = new THREE.Mesh(quads(Array.from({ length: PUFFS }, (_, i) => ({ base: [0, 0, 0], seed: i / PUFFS }))), M.smoke);
    this.smoke.renderOrder = 15;
    // drawn every frame, lit or not (a fire not burning is parked far under the world, where it has no pixels): so
    // their programs are made in the first frames, behind the title card, as they are drawn (into the post chain's
    // target), and lighting a fire compiles nothing
    this.glow.frustumCulled = false; this.smoke.frustumCulled = false;
    this.wood = new THREE.Mesh(woodGeometry(), propMaterial());
    this.wood.castShadow = false; this.wood.receiveShadow = true;
    this.group.add(this.wood, this.glow, this.smoke);
    scene.add(this.group);
    this.park();
  }
  place(at) {
    this.group.position.set(at.x, at.y, at.z);
    this.wood.rotation.y = -(at.a || 0);
    this.group.updateMatrixWorld(true);
  }
  park() { this.place({ x: 0, y: PARKED, z: 0, a: 0 }); }
}

export class Fires {
  // { scene, wind, hemi, sun }: the smoke takes the light of the sky fill and the sun
  constructor({ scene, wind = null, hemi = null, sun = null }) {
    this.scene = scene; this.wind = wind; this.hemi = hemi; this.sun = sun;
    this.light = new THREE.PointLight(FIRE.color, 0, FIRE.distance, FIRE.decay);
    this.light.name = 'campfire light'; this.light.castShadow = false;
    scene.add(this.light);
    this.fires = new Map();   // key -> { key, at: { x, y, z, a }, lit, until, look }
    this.lampOn = null;       // the steady lamp holding the light this frame, or null
    this.steadies = new Map(); // key -> { key, at: { x, y, z }, intensity, color, distance, decay, reach } (steady)
    this.looks = [new FireLook(scene)]; // one built now, so its programs compile behind the title card
    this.free = [...this.looks];
    this.t = 0; this.now = 0;
    this.near = null;         // the lit fire nearest the eye: { x, y, z, heat } (audio.js reads it)
  }

  get(key) { return this.fires.get(key) || null; }
  // 0..1 how hard it burns at abs hour `now` (0 once only embers are left): full while the wood lasts, down to
  // FIRE.floor over the last FIRE.low hours (the flames and the light both follow it)
  heat(f, now = this.now) {
    if (!f || now >= f.until) return 0;
    const catchUp = smoothstep(f.lit, f.lit + 0.06, now), left = f.until - now;
    return catchUp * (FIRE.floor + (1 - FIRE.floor) * smoothstep(0, FIRE.low, left));
  }
  // how bright the bed of coals is: it grows as the wood burns down, then fades once it is gone
  embers(f, now = this.now) {
    if (!f) return 0;
    if (now >= f.until) return 1 - smoothstep(f.until, f.until + FIRE.embers, now);
    return (0.5 + 0.5 * (1 - smoothstep(0.2, FIRE.low, f.until - now))) * (0.6 + 0.4 * smoothstep(f.lit, f.lit + 0.3, now));
  }
  // how much of the wood in the ring is left to look at (1: fresh lengths, about 0.4: charred stubs in the coals)
  wood(f, now = this.now) { return !f ? 0 : 0.4 + 0.6 * smoothstep(0, FIRE.burn, Math.max(0, f.until - now)); }
  isLit(key, now = this.now) { const f = this.fires.get(key); return !!f && now < f.until; }
  // hours of burning left (0 when out or only embers)
  left(key, now = this.now) { const f = this.fires.get(key); return f ? Math.max(0, f.until - now) : 0; }

  // at: { x, y, z, a } (props.js c.layout.fire: the ash's centre, its ground height, the grate's bearing)
  kindle(key, at, now, hours = FIRE.burn) {
    let f = this.fires.get(key);
    if (f && now < f.until) { f.until = now + hours; return f; }
    if (!f) {
      const look = this.free.pop() || (() => { const l = new FireLook(this.scene); this.looks.push(l); return l; })();
      f = { key, at: { ...at }, look };
      this.fires.set(key, f);
      look.place(at);
    }
    f.lit = now; f.until = now + hours;
    return f;
  }
  // an armful on a fire that burns (or on its embers): another span of burning on top of what is left, up to
  // FIRE.most hours of wood in the ring
  feed(key, now, hours = FIRE.burn) {
    const f = this.fires.get(key);
    if (f && now < f.until + FIRE.embers) {
      if (now >= f.until) { f.lit = now; f.until = now + hours; } else f.until = Math.min(now + FIRE.most, f.until + hours);
    }
    return f;
  }
  douse(key) {
    const f = this.fires.get(key);
    if (!f) return;
    f.look.park();
    this.free.push(f.look);
    this.fires.delete(key);
  }

  // A steady light at `at` ({ x, y, z }): a store's lamp. It shares the one PointLight (the light count never changes):
  // the light goes to whichever is nearest the eye, a lit fire or a steady lamp within its reach. intensity in candela,
  // 0 or null to take it away; opts: { color, distance, decay, reach } (STEADY's by default). Returns its record.
  steady(key, at, intensity = STEADY.intensity, opts = {}) {
    if (!intensity || !at) { this.steadies.delete(key); return null; }
    const o = { ...STEADY, ...opts };
    const s = { key, at: { x: at.x, y: at.y, z: at.z }, intensity, color: new THREE.Color(o.color), distance: o.distance, decay: o.decay, reach: o.reach };
    this.steadies.set(key, s);
    return s;
  }

  // dt: real seconds; now: abs game hours; eye: the camera's position
  update(dt, now, eye) {
    this.now = now;
    this.t += dt;
    const M = materials();
    M.time.value = this.t % 3600;
    if (this.wind) { const d = this.wind.dir, s = Math.min(1, this.wind.speed / 8); M.wind.value.set(d.x * s, d.z * s); }
    let best = null, bd = Infinity;
    for (const f of [...this.fires.values()]) {
      const h = this.heat(f, now), e = this.embers(f, now);
      if (h <= 0 && e <= 0.001) { this.douse(f.key); continue; }
      f.h = h; f.e = e;
      // the lengths in the ring burn down with the wood: smaller and sunk into the coals
      const s = this.wood(f, now), wd = f.look.wood;
      if (Math.abs(wd.scale.y - s) > 0.004) { wd.scale.set(0.75 + 0.25 * s, s, 0.75 + 0.25 * s); wd.position.y = -0.03 * (1 - s); wd.updateMatrixWorld(); }
      const d = eye ? Math.hypot(f.at.x - eye.x, f.at.z - eye.z) : 0;
      if (d < bd) { bd = d; best = f; }
    }
    const L = this.light;
    // a steady lamp nearer the eye than any lit fire takes the light (no fire's uniforms change for it)
    let lamp = null, ld = Infinity;
    if (eye) for (const s of this.steadies.values()) { const d = Math.hypot(s.at.x - eye.x, s.at.z - eye.z); if (d < s.reach && d < ld) { ld = d; lamp = s; } }
    if (lamp && ld < bd) {
      L.color.copy(lamp.color); L.distance = lamp.distance; L.decay = lamp.decay;
      L.position.set(lamp.at.x, lamp.at.y, lamp.at.z);
      L.intensity = lamp.intensity * (1 - smoothstep(lamp.reach * 0.7, lamp.reach, ld));
      this.lampOn = lamp;
    } else { this.lampOn = null; L.color.copy(_fireColor); L.distance = FIRE.distance; L.decay = FIRE.decay; }
    if (!best) { if (!this.lampOn) L.intensity = 0; this.near = null; return; }
    // one fire's uniforms: the nearest one's (the materials are shared; a second fire far off burns alike)
    const h = best.h, e = best.e, t = this.t;
    const flick = 0.82 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1.3) + 0.08 * Math.sin(t * 19.7 + Math.sin(t * 5.1));
    M.glow.uniforms.uHeat.value = h * (0.9 + 0.1 * flick);
    M.glow.uniforms.uFlame.value = Math.max(0.05, h);
    M.glow.uniforms.uEmber.value = e;
    M.smoke.uniforms.uSmoke.value = 0.35 + 0.65 * Math.max(h, e * 0.6);
    const sc = M.smoke.uniforms.uColor.value;
    if (this.hemi) sc.copy(this.hemi.color).multiplyScalar(0.3 * this.hemi.intensity);
    if (this.sun) sc.add(_c.copy(this.sun.color).multiplyScalar(0.12 * this.sun.intensity));
    M.smoke.uniforms.uGlow.value.setRGB(0.5, 0.2, 0.06).multiplyScalar(h);
    if (!this.lampOn) {
      L.position.set(best.at.x + Math.sin(t * 9.1) * 0.03, best.at.y + FIRE.lift + Math.sin(t * 6.3) * 0.03, best.at.z + Math.cos(t * 8.2) * 0.03);
      L.intensity = FIRE.intensity * (h * flick + 0.12 * e);
    }
    this.near = { x: best.at.x, y: best.at.y, z: best.at.z, heat: h, embers: e };
  }
}
