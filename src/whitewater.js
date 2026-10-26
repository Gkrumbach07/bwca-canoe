import * as THREE from 'three';
import { glslSurface } from './water.js';
import { foamUniforms, glslFoamLight } from './wake.js';
import { glslNoise } from './shading.js';
import { WHITE, rocksNear } from './rapids.js';

// d1 rapids: the falls and the rapids drawn and felt where they really are (rapids.js; the drop itself is in the water:
// the tile worker made each drop's levels over, so the water patch and every levelAt fall at the real place, and the
// water's own shader whitens the slope as it whitens any rapids). This adds, near you:
// - the white water itself, one overlay per drop draped on the drawn surface (it reads the level atlas, as the water
//   does): on a falls the sheet going over (glassy at the lip, then streaks falling at the speed of the slope, white
//   at the bottom) and the boil at its foot, spreading and thinning down the pool; on a rapids the standing waves of
//   its run, their crests broken white and flickering, and a few streaks between. Lit like any foam on the water
//   (wake.js foamLight: the sun by its height and shadow, the sky fill, the night floor), hazed by the fog.
// - spray off the foot of a falls and froth drifting off it (the hull's own droplets and bubbles: wake.js Ripples).
// - the canoe held off the lip and the foot of a falls (no running a falls: carry round it) and bumped off the rocks
//   above the water (rapids.js rocksNear), with a knock.
// - what the soundscape hears (heard): the nearest drops, by size, for audio-beds.js's roar.
// One program for all the overlays (compiled behind the title by a hidden one), at most WHITE_WATER.max meshes.
export const WHITE_WATER = {
  draw: 650,          // m: an overlay is built inside this, dropped past it plus 120
  max: 6,             // overlays at once (the nearest)
  fade: [380, 620],   // m: the overlay fades out over this
  falls: { above: 7, below: 22 },        // m along the flow the overlay covers round a falls's line
  rapids: { above: 10, below: 18 },      // m beyond a rapids's run (or round a level one)
  spray: { near: 170, rate: 1.4, most: 46, bubbles: 0.5 }, // m; droplets a second per metre of width and metre of drop
  hold: { drop: 0.9, keep: 4.5, side: 3 }, // a falls of this drop or more holds the hull `keep` m off its line
  rock: { pad: 0.45, knock: 0.6 },       // m kept off a rock's reach; speed (m/s) past which the hull knocks
  heard: { far: 1400, count: 3 },
};

const vert = /* glsl */ `
  uniform float uWaterTime;
  uniform vec2 uDir;        // the way the water runs (unit xz)
  uniform vec4 uDrop;       // drop (m), half width (m), kind (0 falls, 1 rapids), level water (1: a drop the game's water has not)
  attribute vec2 aSU;       // s: metres along the flow from the drop's line (downstream +), u: metres across from its middle
  varying vec2 vSU;
  varying float vSteep, vFell, vShore, vDist;
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
  ${glslSurface}
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position.x, 0.0, position.z, 1.0);
    vec2 rel = worldPosition.xz - uOrigin;
    float lv = levelAt(rel);
    // how steeply the still water runs down the flow here, and how far it has fallen over the last 7 m (the foot)
    vSteep = max(0.0, (levelAt(rel - uDir * 2.0) - levelAt(rel + uDir * 2.0)) * 0.25);
    vFell = max(0.0, levelAt(rel - uDir * 7.0) - lv);
    vShore = shoreAt(rel);
    vSU = aSU;
    // on the swell as the water patch draws it at its own vertices, and lifted more near a steep run: the patch's 3.2 m
    // triangles cut straight across the foot of a slope, up to a fifth of the slope's fall over a vertex step above the
    // bilinear surface there
    float s0 = max(0.0, (levelAt(rel - uDir * 5.0) - levelAt(rel - uDir * 1.0)) * 0.25), s1 = max(0.0, (levelAt(rel + uDir * 1.0) - levelAt(rel + uDir * 5.0)) * 0.25);
    float sh;
    worldPosition.y = lv + surfaceWave(rel, uWaterTime, patchBorder(rel), sh) + 0.035 + 0.7 * min(max(vSteep, max(s0, s1)), 0.8);
    vec4 mvPosition = viewMatrix * worldPosition;
    vDist = length(mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
    #include <shadowmap_vertex>
  }
`;

const frag = /* glsl */ `
  uniform float uTime, uFade, uGain, uSeed;
  uniform vec4 uDrop;
  uniform vec2 uRun;        // a rapids's run along the flow, from and to (m)
  uniform vec3 uBox;        // the overlay's own extent: s from, s to, u either side (its edges fade out)
  uniform vec3 uColor;
  varying vec2 vSU;
  varying float vSteep, vFell, vShore, vDist;
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <shadowmap_pars_fragment>
  ${glslFoamLight}
  ${glslNoise}
  void main() {
    float s = vSU.x, u = vSU.y, t = uTime;
    uint sd = uint(uSeed);
    float px = max(fwidth(s), fwidth(u));
    float st = vSteep * uGain;
    float a = 0.0;
    if (uDrop.z < 0.5) {
      // a falls: the sheet going over, its streaks falling with the slope, white toward the bottom
      float sheet = smoothstep(0.05, 0.2, st);
      float spd = 2.0 + 9.0 * min(st, 0.6);
      float k1 = lookNoise(vec2(u * 2.4, (s - t * spd) * 0.22), sd + 3u);
      float k2 = lookNoise(vec2(u * 7.0, (s - t * spd * 1.15) * 0.55), sd + 5u);
      float streak = smoothstep(0.32, 0.72, 0.62 * k1 + 0.38 * k2);
      // glassy at the lip (the first metres of the slope: little has fallen yet), white once it has fallen a metre
      float down = smoothstep(0.15, 1.1, vFell);
      a = sheet * mix(0.18 + 0.5 * streak, 0.62 + 0.36 * streak, down);
      // the boil at the foot, where the water has just come down: froth in drifts stretched down the flow, warped
      // and churning; below it the pool's lace, thinning as it drifts off (further for a bigger falls)
      float foot = smoothstep(0.3, 1.5, vFell) * (1.0 - 0.7 * sheet);
      float pool = exp(-max(0.0, s) / (5.0 + 1.6 * uDrop.x)) * smoothstep(-2.0, 1.0, s);
      vec2 q = vec2(u * 0.9, (s - t * 1.1) * 0.34);
      q.x += 1.2 * lookNoise(vec2(u * 0.3, s * 0.15 - t * 0.25), sd + 7u);
      float b = lookFbm(q, sd + 11u, 3);
      float lace = smoothstep(0.62 - 0.24 * foot - 0.05 * pool, 0.7 - 0.12 * foot, b);
      float fine = lookNoise(vec2(u * 2.6 + t * 0.4, (s - t * 1.6) * 1.3), sd + 13u);
      a = max(a, max(foot * 0.92, pool * 0.6) * lace * mix(0.6, 1.0, fine) * smoothstep(0.3, 0.8, uDrop.x));
    } else {
      // a rapids: standing waves down its run, crests across the flow about 3 m apart, bent and broken into patches
      // (more of them, and longer, the steeper it runs), their tops white froth churning down; between them the water
      // only streaked; below the run, lace drifting off as at the foot of a falls
      float run = smoothstep(uRun.x - 4.0, uRun.x + 3.0, s) * (1.0 - smoothstep(uRun.y - 2.0, uRun.y + 9.0, s));
      float lively = max(smoothstep(0.012, 0.06, st), uDrop.w * 0.75) * run;
      float warp = 2.4 * (lookFbm(vec2(u * 0.12, s * 0.09), sd + 19u, 2) - 0.5);
      float ph = (s + warp) / 3.1 + 0.3 * sin(u * 0.45 + 6.0 * lookNoise(vec2(u * 0.1, s * 0.05), sd + 17u));
      float crest = pow(0.5 + 0.5 * cos(ph * 6.2832), 4.0);
      float patchN = lookFbm(vec2(u * 0.33, s * 0.24), sd + 23u, 3);
      float br = smoothstep(0.6 - 0.22 * lively, 0.72, patchN);
      float froth = lookFbm(vec2(u * 1.3 + t * 0.4, (s - t * 1.3) * 1.1), sd + 29u, 2);
      a = lively * crest * br * smoothstep(0.32, 0.58, froth) * 0.95;
      a = max(a, lively * smoothstep(0.72, 0.86, patchN) * smoothstep(0.42, 0.7, froth) * 0.75);
      float k = lookNoise(vec2(u * 3.2, (s - t * 3.5) * 0.4), sd + 31u);
      a = max(a, lively * smoothstep(0.7, 0.9, k) * 0.35);
      float tail = smoothstep(uRun.y - 3.0, uRun.y + 2.0, s) * exp(-max(0.0, s - uRun.y) / 10.0) * max(smoothstep(0.012, 0.05, uDrop.x / max(4.0, uRun.y - uRun.x)), uDrop.w * 0.6);
      vec2 q = vec2(u * 0.9 + 1.2 * lookNoise(vec2(u * 0.3, s * 0.15 - t * 0.25), sd + 37u), (s - t * 1.0) * 0.34);
      a = max(a, tail * smoothstep(0.6, 0.7, lookFbm(q, sd + 41u, 3)) * 0.55);
    }
    // ragged against the banks, thinned where the water is shallow at its edge, gone on land; fine detail fades with
    // distance (a pixel over a few centimetres), the whole overlay past the fade
    a *= smoothstep(-0.2, -1.6, vShore) * (0.75 + 0.25 * lookNoise(vec2(u * 0.8, s * 0.8), sd + 43u));
    float edge = min(min(s - uBox.x, uBox.y - s), uBox.z - abs(u)) + 2.5 * (lookNoise(vec2(u * 0.4, s * 0.4), sd + 47u) - 0.5);
    a *= smoothstep(0.0, 5.0, edge);
    a *= 1.0 - 0.4 * smoothstep(0.08, 0.4, px);
    a *= uFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * foamLight(), min(a, 0.96));
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// A drop's overlay: a grid over the stretch of water it covers, its vertices at their world place relative to the
// drop's middle (the mesh stands there), each with its s (along the flow) and u (across) in metres.
function overlayGeometry(w) {
  const W = WHITE_WATER, half = Math.max(4, w.half) + 3;
  let s0, s1;
  if (w.kind === 'falls') { s0 = -W.falls.above; s1 = W.falls.below + (w.cascade ? Math.min(40, w.cascade / 0.3) : 0); }
  else { const run = w.run || [-15, 15]; s0 = run[0] - W.rapids.above; s1 = run[1] + W.rapids.below; }
  const nu = Math.max(4, Math.min(48, Math.ceil((2 * half) / 1.5))), nv = Math.max(8, Math.min(96, Math.ceil((s1 - s0) / 1.0)));
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3), su = new Float32Array((nu + 1) * (nv + 1) * 2);
  const ux = w.ux, uz = w.uz, vx = -uz, vz = ux;
  for (let j = 0, k = 0; j <= nv; j++) for (let i = 0; i <= nu; i++, k++) {
    const s = s0 + ((s1 - s0) * j) / nv, u = -half + (2 * half * i) / nu;
    pos[k * 3] = ux * s + vx * u; pos[k * 3 + 2] = uz * s + vz * u;
    su[k * 2] = s; su[k * 2 + 1] = u;
  }
  const idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSU', new THREE.BufferAttribute(su, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.hypot(half, Math.max(-s0, s1)) + 40);
  g.userData.box = [s0, s1, half];
  return g;
}

export class WhiteWater {
  constructor({ world, water, ripples, scene }) {
    this.world = world; this.water = water; this.ripples = ripples; this.scene = scene;
    this.knock = null; this.knockAt = -9; // (pos, amount) => a knock on the hull (main.js: audio-voices.js bonk), at most one a 0.7 s
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: foamUniforms(water, {
        uTime: { value: 0 }, uFade: { value: 1 }, uGain: { value: 1 }, uSeed: { value: 1 }, uColor: { value: new THREE.Color(0xe6eef0) },
        uDir: { value: new THREE.Vector2(1, 0) }, uDrop: { value: new THREE.Vector4() }, uRun: { value: new THREE.Vector2(-15, 15) }, uBox: { value: new THREE.Vector3(-7, 22, 7) },
      }),
      transparent: true, depthWrite: false, fog: true, lights: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3,
    });
    this.material.name = 'whitewater';
    this.live = new Map(); // drop id -> { mesh, w }
    this.time = 0; this.gain = 1; this.heard = []; this.near = [];
    this.sprayAcc = new Map();
    // one hidden overlay so the program is compiled behind the title card with the rest (main.js prewarm)
    this.warm = new THREE.Mesh(overlayGeometry({ kind: 'falls', half: 4, ux: 1, uz: 0 }), this.material);
    this.warm.visible = false; this.warm.frustumCulled = false;
    scene.add(this.warm);
    this.hold = null; // the falls holding the hull off this frame, for the line it says
  }

  // the overlays for the drops near the eye (the nearest WHITE_WATER.max inside `draw`), their fade and time; the
  // spray; what is heard. flow: the rivers' flow over their mean (season.flow; 1 when unknown): spring white water
  update(dt, eye, flow = 1) {
    const W = WHITE_WATER;
    this.time += dt;
    this.gain = Math.min(1.6, Math.max(0.8, Math.sqrt(flow || 1)));
    const near = [];
    for (const w of WHITE) {
      if (w.hidden) continue;
      const d = Math.hypot(w.x - eye.x, w.z - eye.z) - w.half;
      if (d < W.draw + 120) near.push({ w, d });
    }
    near.sort((a, b) => a.d - b.d);
    const want = new Set(near.filter((n) => n.d < W.draw).slice(0, W.max).map((n) => n.w.id));
    for (const [id, o] of this.live) if (!want.has(id)) { this.scene.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); this.live.delete(id); }
    for (const n of near) {
      if (!want.has(n.w.id) || this.live.has(n.w.id)) continue;
      const w = n.w, m = this.material.clone();
      // the shared uniforms by reference (the lights, the surface, the time), the drop's own by value
      for (const [k, v] of Object.entries(this.material.uniforms)) m.uniforms[k] = v;
      m.uniforms.uDir = { value: new THREE.Vector2(w.ux, w.uz) };
      m.uniforms.uDrop = { value: new THREE.Vector4(w.drop, w.half, w.kind === 'falls' ? 0 : 1, w.flat ? 1 : 0) };
      m.uniforms.uRun = { value: new THREE.Vector2(...(w.run || [-15, 15])) };
      m.uniforms.uSeed = { value: 1 + (w.id % 997) };
      m.uniforms.uFade = { value: 1 };
      const geo = overlayGeometry(w);
      m.uniforms.uBox = { value: new THREE.Vector3(...geo.userData.box) };
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(w.x, 0, w.z);
      mesh.geometry.boundingSphere.center.y = this.world.levelAt(w.x, w.z); // (the vertices are lifted to the water in the shader)
      mesh.renderOrder = 11; // over the water (and its tint pass), under the hull's foam and the splashes
      this.scene.add(mesh);
      this.live.set(w.id, { mesh, w });
    }
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uGain.value = this.gain;
    for (const o of this.live.values()) {
      const d = Math.hypot(o.w.x - eye.x, o.w.z - eye.z);
      o.mesh.material.uniforms.uFade.value = 1 - Math.min(1, Math.max(0, (d - W.fade[0]) / (W.fade[1] - W.fade[0])));
    }
    this.near = near;
    this.spray(dt, eye);
    // heard: the nearest drops, each at the point of its line nearest you, by how much water falls how far
    const heard = [];
    for (const n of near.length ? near : []) if (n.d < W.heard.far) heard.push(n.w);
    for (const w of WHITE) if (w.hidden && Math.hypot(w.x - eye.x, w.z - eye.z) < 300) heard.push(w);
    this.heard = heard.slice(0, W.heard.count).map((w) => {
      let x = w.x, z = w.z;
      if (w.a) { // the nearest point of the line across
        const ax = w.b[0] - w.a[0], az = w.b[1] - w.a[1], L2 = ax * ax + az * az || 1, t = Math.max(0, Math.min(1, ((eye.x - w.a[0]) * ax + (eye.z - w.a[1]) * az) / L2));
        x = w.a[0] + ax * t; z = w.a[1] + az * t;
      }
      const y = this.world.levelAt(x + w.ux * 3, z + w.uz * 3);
      const width = Math.max(6, 2 * w.half);
      const size = (w.kind === 'falls' ? 1 : 0.55) * Math.sqrt(Math.max(0.4, w.drop) * width / 30) * (w.flat ? 0.6 : 1) * (w.hidden ? 0.5 : 1) * this.gain;
      return { x: x + w.ux * 3, y, z: z + w.uz * 3, size, kind: w.kind, d: Math.hypot(x - eye.x, z - eye.z) };
    });
  }

  // droplets off the foot of a falls within spray.near (more the more water falls and the higher), froth drifting off
  // it; a little off the crests of a rapids
  spray(dt, eye) {
    const S = WHITE_WATER.spray, rp = this.ripples;
    if (!rp || dt <= 0) return;
    for (const o of this.live.values()) {
      const w = o.w, d = Math.hypot(w.x - eye.x, w.z - eye.z);
      if (d > S.near || w.flat) continue;
      const width = Math.max(4, 2 * w.half - 4);
      const rate = Math.min(S.most, (w.kind === 'falls' ? S.rate : S.rate * 0.25) * width * Math.min(4, Math.max(0.5, w.drop)) * this.gain);
      let acc = (this.sprayAcc.get(w.id) || 0) + rate * dt;
      const vx = -w.uz, vz = w.ux;
      while (acc >= 1) {
        acc -= 1;
        const u = (Math.random() - 0.5) * width, run = w.run || [0, 0];
        const s = w.kind === 'falls' ? 1 + Math.random() * 3.5 : run[0] + Math.random() * (run[1] - run[0]);
        const x = w.x + w.ux * s + vx * u, z = w.z + w.uz * s + vz * u;
        if (this.world.shoreAt(x, z) > -0.8) continue;
        const y = this.world.levelAt(x, z) + 0.05, up = w.kind === 'falls' ? 1.2 + Math.random() * 2.2 * Math.min(2, Math.sqrt(w.drop)) : 0.6 + Math.random() * 1.2;
        const along = w.kind === 'falls' ? 0.4 + Math.random() * 1.6 : 0.8 + Math.random();
        rp.spawn(1, x, y, z, 0.05 + Math.random() * 0.08, 0.16 + Math.random() * 0.3, 0.7 + Math.random() * 0.8, w.ux * along + (Math.random() - 0.5) * 0.6, up, w.uz * along + (Math.random() - 0.5) * 0.6);
        if (Math.random() < S.bubbles) {
          const sb = (w.kind === 'falls' ? 2 + Math.random() * 6 : run[1] + Math.random() * 6), ub = (Math.random() - 0.5) * width;
          const bx = w.x + w.ux * sb + vx * ub, bz = w.z + w.uz * sb + vz * ub;
          if (this.world.shoreAt(bx, bz) < -1) rp.spawn(3, bx, this.world.levelAt(bx, bz), bz, 0.25 + Math.random() * 0.3, 0.7 + Math.random() * 0.8, 2 + Math.random() * 1.5, w.ux * (0.5 + Math.random() * 0.7), 0, w.uz * (0.5 + Math.random() * 0.7));
        }
      }
      this.sprayAcc.set(w.id, acc);
    }
  }

  // After the paddler moves: the hull kept off a falls's line (above and below it alike) and off the rocks above the
  // water. Returns the falls holding it, if one does (for the line the prompt says).
  afterPlayer(player) {
    this.hold = null;
    if (!player || player.mode !== 'paddle' || player.teleporting) return null;
    const H = WHITE_WATER.hold, f = player.forward;
    const ends = [0, 2.3, -2.3];
    for (const n of this.near) {
      const w = n.w;
      if (w.kind !== 'falls' || w.flat || w.drop < H.drop || n.d > 60) continue;
      const vx = -w.uz, vz = w.ux;
      for (const e of ends) {
        const px = player.x + f.x * e, pz = player.z + f.z * e;
        const s = (px - w.x) * w.ux + (pz - w.z) * w.uz, u = (px - w.x) * vx + (pz - w.z) * vz;
        if (Math.abs(u) > w.half + H.side || Math.abs(s) >= H.keep) continue;
        // push the whole hull back to its own side of the line, and take the speed toward it
        const side = Math.sign(s) || -1, push = side * H.keep - s;
        player.x += w.ux * push; player.z += w.uz * push;
        const toward = (f.x * w.ux + f.z * w.uz) * -side;
        if (toward > 0) player.speed *= -0.15;
        this.hold = w;
        break;
      }
    }
    // the rocks
    const R = WHITE_WATER.rock;
    const rocks = rocksNear(this.world, player.x, player.z, 12);
    for (const r of rocks) for (const e of ends) {
      const px = player.x + f.x * e, pz = player.z + f.z * e, dx = px - r.x, dz = pz - r.z, d = Math.hypot(dx, dz), keep = r.reach + R.pad;
      if (d >= keep || d < 1e-6) continue;
      const k = keep - d;
      player.x += (dx / d) * k; player.z += (dz / d) * k;
      if (Math.abs(player.speed) > R.knock && this.knock && this.time - this.knockAt > 0.7) { this.knockAt = this.time; this.knock({ x: px, y: player.level, z: pz }, Math.min(1, Math.abs(player.speed) / 2)); }
      player.speed *= 0.35;
    }
    return this.hold;
  }

  // the list for the map (hud.mapPlaces) is rapids.js whiteWater(); this is what is near, for the tests
  report() { return { live: [...this.live.values()].map((o) => `${o.w.kind} ${o.w.name || '-'} ${o.w.drop.toFixed(1)} m`), heard: this.heard.map((h) => `${h.kind} ${h.d.toFixed(0)} m size ${h.size.toFixed(2)}`), hold: this.hold ? this.hold.name || this.hold.kind : null }; }
}
