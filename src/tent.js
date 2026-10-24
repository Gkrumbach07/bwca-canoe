// The tent in its phases (the camp redone, 2026-10-24: "setting up tent should be done where you say set up tent, should
// go through phases, like flat staked, poles up, tent up, raintarp on"). camp.js pitches it where you stand to, holding
// E (hold.js) through four phases, and strikes it the same way backwards; each phase has its own look:
//   1. the footprint staked: a groundsheet flat on the ground, a stake at each corner;
//   2. the poles up: two shock-corded poles crossed corner to corner over it, arched;
//   3. the tent up: the inner tent clipped to the poles, pale canvas and its mesh top;
//   4. the rain fly on: the dome's coloured fly over all of it (props.js buildTentMesh, the tent as it always was).
// Between phases a part grows into place (the sheet unrolls, the poles bow up, the tent and the fly rise), so a hold let
// go mid-phase shows where it got to until the camp snaps it back to the last phase finished.
//
// Everything is drawn on the props' one material (prop-kit.js propMaterial, which the fly's mesh already uses): no new
// program. The ghost (where you would pitch: green on good ground, red where you can't) is one translucent copy of the
// fly and the footprint; its material is the only new one, and it is drawn every frame (parked far under the ground when
// not wanted), so it is compiled behind the title card and never in the frame it first shows.
import * as THREE from 'three';
import { buildTentMesh, TENT_SIZE } from './props.js';
import { TILE, PropBuilder } from './prop-kit.js';

const { a: TA, b: TB, h: TH } = TENT_SIZE;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const C = (h) => new THREE.Color(h);
const ease = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
// the dome's footprint (a rounded rectangle) and its height at a share r of the way out, as props.js tentBuild draws it
const foot = (t) => { const c = Math.cos(t), s = Math.sin(t); return [TA * Math.sign(c) * Math.abs(c) ** 0.62, TB * Math.sign(s) * Math.abs(s) ** 0.62]; };
const hY = (r) => TH * Math.max(0, 1 - r ** 2.6) ** 0.55;

// The pitch, phase by phase: its name once done, what is being done meanwhile, its game minutes (a quarter hour in all,
// as the old pitch took) and its real seconds while E is held. The strike runs the other way, a phase per phase stood.
export const PITCH = [
  { name: 'Footprint staked', doing: 'Staking out the footprint', minutes: 4, seconds: 1.3 },
  { name: 'Poles up', doing: 'Raising the poles', minutes: 4, seconds: 1.3 },
  { name: 'Tent up', doing: 'Clipping the tent to the poles', minutes: 4, seconds: 1.3 },
  { name: 'Rain fly on', doing: 'Throwing the fly over and staking it out', minutes: 3, seconds: 1.2 },
];
export const STRIKE = [ // STRIKE[i] takes the tent from stage 4 - i to 3 - i
  { name: 'Fly off', doing: 'Unstaking the fly and folding it', minutes: 3, seconds: 1.1 },
  { name: 'Tent down', doing: 'Unclipping the tent from the poles', minutes: 3, seconds: 1.1 },
  { name: 'Poles down', doing: 'Folding the poles', minutes: 2, seconds: 1.0 },
  { name: 'Rolled up', doing: 'Pulling the stakes and rolling it all up', minutes: 3, seconds: 1.2 },
];
export const STAGE_WORDS = ['not pitched', 'the footprint staked', 'the poles up', 'the tent up, no fly', 'pitched, the fly on'];
// the fly's colour by the tent (items.js): the A-frame rust, the dome green, the four-season blue
export const TENT_FLY = { aframe: 0xa8693f, dome: 0x5c7a55, fourseason: 0x56708a };

// --- the parts ---------------------------------------------------------------------------------------------------
function footprintGeometry() {
  const b = new PropBuilder(), S = 20, sheet = C(0x4d584c), stake = C(0x8f8c86), cord = C(0xc8c2b0);
  const below = V(0, -1, 0);
  for (let k = 0; k < S; k++) {
    const t0 = (k / S) * Math.PI * 2, t1 = ((k + 1) / S) * Math.PI * 2, [a, b0] = foot(t0), [c, d] = foot(t1);
    b.face([V(0, 0.05, 0), V(a * 1.02, 0.045, b0 * 1.02), V(c * 1.02, 0.045, d * 1.02)], TILE.CANVAS, sheet, { ref: below });
  }
  // the hem's edge a shade darker, a hand's width wide
  for (let k = 0; k < S; k++) {
    const t0 = (k / S) * Math.PI * 2, t1 = ((k + 1) / S) * Math.PI * 2, [a, b0] = foot(t0), [c, d] = foot(t1);
    b.face([V(a * 0.94, 0.052, b0 * 0.94), V(a * 1.03, 0.05, b0 * 1.03), V(c * 1.03, 0.05, d * 1.03), V(c * 0.94, 0.052, d * 0.94)], TILE.CANVAS, sheet.clone().multiplyScalar(0.72), { ref: below });
  }
  // a stake at each corner (where the poles will stand) and its loop of cord from the sheet's corner
  for (let k = 0; k < 4; k++) {
    const t = Math.PI / 4 + (k * Math.PI) / 2, [fx, fz] = foot(t), out = Math.hypot(fx, fz), ux = fx / out, uz = fz / out;
    const sx = fx + ux * 0.22, sz = fz + uz * 0.22;
    b.box(V(sx, 0.02, sz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.006, 0.07, 0.006, TILE.METAL, stake, { grain: 'y' });
    b.tube([V(fx * 1.01, 0.05, fz * 1.01), V(sx, 0.07, sz)], 0.004, 3, TILE.PLAIN, cord);
  }
  return b.build();
}
// two poles corner to corner over the top, crossing at the peak, their ends in the footprint's corner grommets
function polesGeometry() {
  const b = new PropBuilder(), metal = C(0xc3c8cc), N = 14;
  for (const t0 of [Math.PI / 4, (Math.PI * 3) / 4]) {
    const [fx, fz] = foot(t0), pts = [];
    for (let i = 0; i <= N; i++) { const s = -1 + (2 * i) / N, r = Math.abs(s) * 0.995; pts.push(V(fx * s * 0.99, 0.04 + hY(r) * 0.975, fz * s * 0.99)); }
    b.tube(pts, 0.009, 5, TILE.PLAIN, metal);
  }
  return b.build();
}
// the inner tent hung from the poles: a dome a little inside the fly's, pale canvas below and the mesh top darker, the
// door's panel on the +z side
function innerGeometry() {
  const b = new PropBuilder(), S = 16, K = 5, canvas = C(0xe2c98a), mesh = C(0x9c9a8a), door = C(0xcdb377);
  const pt = (t, r) => { const [fx, fz] = foot(t); return V(fx * r * 0.965, 0.04 + hY(r) * 0.92, fz * r * 0.965); };
  const inside = V(0, 0.32, 0);
  for (let i = 0; i < K; i++) for (let k = 0; k < S; k++) {
    const r0 = ((i / K) ** 0.85) * 0.995, r1 = (((i + 1) / K) ** 0.85) * 0.995, t0 = (k / S) * Math.PI * 2 + Math.PI / 4, t1 = ((k + 1) / S) * Math.PI * 2 + Math.PI / 4;
    const tm = (t0 + t1) / 2, dz = Math.exp(-((Math.atan2(Math.sin(tm - Math.PI / 2), Math.cos(tm - Math.PI / 2)) / 0.5) ** 2));
    const col = r1 < 0.62 ? mesh : dz > 0.4 && r0 > 0.3 ? door : canvas;
    const q = [pt(t0, r0), pt(t1, r0), pt(t1, r1), pt(t0, r1)];
    if (i === 0) b.face([q[0], q[2], q[3]], TILE.CANVAS, col, { ref: inside }); else b.face(q, TILE.CANVAS, col, { ref: inside });
  }
  return b.build();
}

let geos = null;
const partGeos = () => geos || (geos = { footprint: footprintGeometry(), poles: polesGeometry(), inner: innerGeometry() });

// One tent's parts, standing where camp.js pitches it: set(at) shows it at `at` phases done (0 to 4, fractional between)
export class TentStages {
  constructor(scene, colour) {
    const fly = buildTentMesh(colour), mat = fly.material, G = partGeos();
    this.group = new THREE.Group();
    this.group.name = 'tent-stages'; this.group.matrixAutoUpdate = false; this.group.visible = false;
    const mk = (geo) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; this.group.add(m); return m; };
    this.footprint = mk(G.footprint); this.poles = mk(G.poles); this.inner = mk(G.inner);
    fly.matrixAutoUpdate = false; this.fly = fly; this.group.add(fly);
    this.colour = colour;
    this.at = -1;
    scene.add(this.group);
  }
  // the tent's world matrix (props.js tentPose)
  place(matrix) { this.group.matrix.copy(matrix); this.group.matrixWorldNeedsUpdate = true; this.group.updateMatrixWorld(true); }
  set(at) {
    at = Math.max(0, Math.min(4, at));
    if (Math.abs(at - this.at) < 1e-4 && this.group.visible) return;
    this.at = at;
    this.group.visible = at > 0.001;
    const part = (m, k, sx, sy, sz, dy = 0) => {
      m.visible = k > 0.001;
      if (!m.visible) return;
      m.matrix.makeScale(sx, sy, sz); m.matrix.setPosition(0, dy, 0); m.matrixWorldNeedsUpdate = true;
    };
    // the sheet unrolls from the middle out
    const f = ease(at); part(this.footprint, at, 0.2 + 0.8 * f, 1, 0.35 + 0.65 * f);
    // the poles bow up from flat
    const p = ease(at - 1); part(this.poles, at - 1, 1 + 0.1 * (1 - p), 0.06 + 0.94 * p, 1 + 0.1 * (1 - p));
    // the tent rises on its clips
    const t = ease(at - 2); part(this.inner, at - 2, 1, 0.12 + 0.88 * t, 1);
    // the fly goes over from above and settles
    const y = ease(at - 3); part(this.fly, at - 3, 1.1 - 0.1 * y, 0.75 + 0.25 * y, 1.1 - 0.1 * y, 0.35 * (1 - y));
    this.group.updateMatrixWorld(true);
  }
  hide() { this.group.visible = false; this.at = -1; }
  dispose() { this.group.removeFromParent(); }
}

// The ghost: where the tent would go, green on good ground and red where it can't. One translucent material, a colour
// per state; drawn every frame (parked under the world when not wanted) so its program is made once, at the start.
const GOOD = 0x86e29a, BAD = 0xf06a55;
export class TentGhost {
  constructor(scene) {
    const fly = buildTentMesh(0xffffff), G = partGeos();
    this.mat = new THREE.MeshBasicMaterial({ color: GOOD, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide });
    this.group = new THREE.Group();
    this.group.name = 'tent-ghost'; this.group.matrixAutoUpdate = false; this.group.renderOrder = 5;
    for (const geo of [fly.geometry, G.footprint]) {
      const m = new THREE.Mesh(geo, this.mat);
      m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 5; m.matrixAutoUpdate = false;
      this.group.add(m);
    }
    this.on = false; this.ok = true;
    this.park();
    scene.add(this.group);
  }
  park() { this.group.matrix.makeTranslation(0, -1e4, 0); this.group.matrixWorldNeedsUpdate = true; this.group.updateMatrixWorld(true); this.on = false; }
  show(matrix, ok) {
    this.group.matrix.copy(matrix); this.group.matrixWorldNeedsUpdate = true; this.group.updateMatrixWorld(true);
    if (ok !== this.ok || !this.on) { this.mat.color.setHex(ok ? GOOD : BAD); this.mat.opacity = ok ? 0.34 : 0.42; }
    this.ok = ok; this.on = true;
  }
}
