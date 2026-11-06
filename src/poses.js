import * as THREE from 'three';
import { SEATS, YOKE_X, sheerY, floorAt, outerAt } from './hull.js';
import { LT, LS } from './figure.js';
import { PADDLE } from './gear.js';

// p2 A: the poses any figure can take (people phase 2, docs/plans/people.md "Technical design"). Lifted out of canoe.js
// unchanged: the paddling stroke (the J, the sweep, the back stroke, the switch across, the paddle at rest), the kneel,
// the gait (walk, jog, a hop, a crouch, wading, the hill), the carry (the yoke on the shoulders, the hands on the
// gunwales) and the rod's hands. canoe.js poses the player with them; actors.js poses the people out on the water and
// the trails with the same functions, each from a state of canoe.state's shape handed to it, so a party's paddler, a
// companion and a remote player all move as the player does.
//
// A pose body is the figure and what it stands in:
//   { P: figure.poser, J: figure.joints, paddler: figure.group, rig, state, idle: makeIdle(), ground(x, z), terrain }
//   rig      the frame the figure stands in: an Object3D in the world, placed at the feet's height + 0.1 and turned to
//            the heading (yaw only) on foot; the hull's own frame afloat (the figure placed at its seat in it)
//   state    canoe.state's fields (canoe.js documents them): mode, stroke, side, power, drive, turn, hustle, speed,
//            walkSpeed, moveFwd, moveLat, air, airT, vy, land, stagger, crouch, held, fishing, grip, blade, cadence...
//   ground   the ground's height under a foot at a world (x, z); terrain: the bare terrain (or null: the ground)
// Then makeGait(body) walks, jogs, hops and carries it; makeStroke(body, { seatX }) paddles it from a seat.

export const FLOAT_OFFSET = 0.15; // the canoe's origin above the water at rest (canoe.js re-exports it)
export const HIP_H = 0.925, ROOT_UP = 0.05; // the hip joints' height standing, the root above them
export const AH = 0.085, HEEL = 0.065, BALL = 0.125; // ankle height over the sole; heel and ball from the ankle

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const sat = (t) => Math.min(1, Math.max(0, t));
export const ease = (t) => { t = sat(t); return t * t * (3 - 2 * t); };
export const smooth = (a, b, x) => ease((x - a) / (b - a));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (k, dt) => 1 - Math.exp(-k * dt);
export const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const frac = (x) => x - Math.floor(x);

// a body rotation: yaw (+ turns left: the right shoulder comes forward), lean (+ forward), side (+ tips right)
const _e = new THREE.Euler();
export function bodyQ(yaw, lean, side, out = new THREE.Quaternion()) { return out.setFromEuler(_e.set(side, yaw, -lean, 'YZX')); }
// a rotation from bind (x forward, y up, z right) to the frame forward f, up toward u
const _mm = new THREE.Matrix4(), _fa = V(), _fb = V(), _fc = V();
export function frameQ(f, u, out = new THREE.Quaternion()) {
  _fa.copy(f).normalize();
  _fb.copy(u).addScaledVector(_fa, -u.dot(_fa));
  if (_fb.lengthSq() < 1e-10) _fb.set(0, 1, 0).addScaledVector(_fa, -_fa.y);
  _fb.normalize();
  _fc.crossVectors(_fa, _fb);
  _mm.makeBasis(_fa, _fb, _fc);
  return out.setFromRotationMatrix(_mm);
}

// the spine from the pelvis up: chest and head rotations in the figure's space; shrug lifts a shoulder, reach brings it
// forward
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion();
export function spine(P, rootP, pelvis, chest, head, { shrugL = 0, shrugR = 0, reachL = 0, reachR = 0 } = {}) {
  P.setRoot(rootP, pelvis);
  P.rot('spine', _q.copy(pelvis).slerp(chest, 0.5));
  P.rot('chest', chest);
  P.rot('neck', _q.copy(chest).slerp(head, 0.45));
  P.rot('head', head);
  _qa.setFromEuler(_e.set(shrugL, -reachL, 0, 'YXZ'));
  P.rot('clavL', _q.copy(chest).multiply(_qa));
  _qa.setFromEuler(_e.set(-shrugR, reachR, 0, 'YXZ'));
  P.rot('clavR', _q.copy(chest).multiply(_qa));
}

// breathing and the odd glance
export const makeIdle = () => ({ breath: 0, glanceT: 3, glanceYaw: 0, glancePitch: 0, yaw: 0, pitch: 0, hold: 0, shift: 0 });
export const resetIdle = (idle) => Object.assign(idle, { breath: 0, glanceT: 3, glanceYaw: 0, glancePitch: 0, yaw: 0, pitch: 0, hold: 0, shift: 0 });
export function updateIdle(idle, dt, still) {
  idle.breath += dt * Math.PI * 2 * 0.24;
  idle.shift += dt * 0.7;
  idle.glanceT -= dt;
  if (idle.glanceT <= 0) {
    if (idle.hold > 0 || !still) { idle.glanceYaw = 0; idle.glancePitch = 0; idle.hold = 0; idle.glanceT = 3 + Math.random() * 5; }
    else { idle.glanceYaw = (Math.random() * 2 - 1) * 0.75; idle.glancePitch = (Math.random() - 0.6) * 0.3; idle.hold = 1; idle.glanceT = 1.2 + Math.random() * 1.8; }
  }
  // r2 (NPC motion): idle.watch { yaw, pitch } (head angles in the body's frame), set by whoever drives the figure: what
  // it looks at (you, near by; a store's keeper's customer) over the glance
  const W = idle.watch, k = damp(W ? 4.5 : still ? 3.2 : 6, dt);
  idle.yaw += ((W ? W.yaw : still ? idle.glanceYaw : 0) - idle.yaw) * k;
  idle.pitch += ((W ? W.pitch : still ? idle.glancePitch : 0) - idle.pitch) * k;
}

// --- r2 (NPC motion): an idle with life, for the people the game drives (not the player) -------------------------------
// The owner, 2026-11-05: "when they're not doing anything ... they're basically frozen ... their idle is very, very, very
// idle." A body with body.life (makeLife(seed)) standing still shifts its weight from foot to foot every few seconds,
// now and then takes a half step or turns a little where it stands (life.ox, oz, oh: the caller adds them to the
// rig's place, the gait's settle steps take them), looks round with the chest as well as the head, and does something
// with its hands: on the hips, in the pockets, arms crossed, a scratch of the head, a look at the watch, a stretch, a
// swat at the bugs when they are out (LIFE_ENV.bugs, main.js), a crouch to check a pack. Each person's timing and
// choices are their own (the seed). Walking, it all eases out.
export const LIFE_ENV = { bugs: 0 };
const GESTURES = [['hips', 3], ['pockets', 3], ['cross', 2.5], ['scratch', 1], ['watch', 0.8], ['stretch', 0.6], ['pack', 0.7], ['none', 4]];
export function makeLife(seed = 1) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    rnd, side: rnd() < 0.5 ? -1 : 1, shiftT: 1 + rnd() * 5, shift: 0, // the weight: on which foot, eased (shift -1..1)
    g: null, gT: 2 + rnd() * 6, w: 0,                                  // the hands: the gesture under way and its weight
    stepT: 6 + rnd() * 10, ox: 0, oz: 0, oh: 0, tx: 0, tz: 0, th: 0,   // the half step or the turn on the spot
    lookT: 2 + rnd() * 4, look: 0, lookP: 0, crouch: 0, still: 0,
    tempo: 0.8 + rnd() * 0.5,                                          // how restless they are
  };
}
// a frame of it: still (standing, not at a job that holds the hands), dt real seconds
export function lifeStep(L, dt, still, { hands = true } = {}) {
  if (!L) return;
  const r = L.rnd, tp = L.tempo;
  L.still = still ? L.still + dt : 0;
  // the weight from foot to foot
  if ((L.shiftT -= dt * tp) <= 0) { L.side = -L.side; L.shiftT = 4 + r() * 6; }
  L.shift += ((still ? L.side : 0) - L.shift) * damp(1.6, dt);
  // the chest's own look round (the head's is the idle's glance)
  if ((L.lookT -= dt * tp) <= 0) { const on = Math.abs(L.look) < 0.05 && r() < 0.6; L.look = on ? (r() * 2 - 1) * 0.5 : 0; L.lookP = on ? (r() - 0.5) * 0.12 : 0; L.lookT = on ? 1.5 + r() * 2.5 : 3 + r() * 5; }
  // the hands
  if (!still || !hands) { L.w = Math.max(0, L.w - dt * 2.5); if (L.w === 0) L.g = null; }
  else {
    if (L.g) {
      L.g.t += dt;
      const e = L.g.dur - L.g.t;
      L.w = Math.min(1, L.w + dt * 2.2, Math.max(0, e * 1.6));
      if (e <= 0) { L.g = null; L.w = 0; L.gT = 2 + r() * 7; }
    } else if ((L.gT -= dt * tp) <= 0 && L.still > 1.2) {
      const bugs = LIFE_ENV.bugs || 0;
      let kind = 'none';
      if (bugs > 0.25 && r() < 0.35 + 0.4 * bugs) kind = 'swat';
      else { let sum = 0; for (const [, wt] of GESTURES) sum += wt; let x = r() * sum; for (const [k, wt] of GESTURES) { if ((x -= wt) <= 0) { kind = k; break; } } }
      if (kind === 'none') L.gT = 2 + r() * 5;
      else L.g = { kind, t: 0, dur: kind === 'swat' ? 1.2 + r() * 0.8 : kind === 'scratch' ? 1.6 + r() : kind === 'watch' ? 1.8 + r() : kind === 'stretch' ? 2.4 + r() : kind === 'pack' ? 3 + r() * 3 : 5 + r() * 9 };
    }
  }
  L.crouch += ((L.g && L.g.kind === 'pack' ? L.w : 0) - L.crouch) * damp(4, dt);
  // the half step or the turn where they stand: a new place a few dozen centimetres off, or a new facing, now and then
  if (still && (L.stepT -= dt * tp) <= 0) {
    L.stepT = 7 + r() * 12;
    if (r() < 0.55) { const a = r() * Math.PI * 2, d = 0.12 + r() * 0.16; L.tx = Math.max(-0.3, Math.min(0.3, L.tx * 0.3 + Math.cos(a) * d)); L.tz = Math.max(-0.3, Math.min(0.3, L.tz * 0.3 + Math.sin(a) * d)); }
    else L.th = Math.max(-0.6, Math.min(0.6, L.th * 0.3 + (r() * 2 - 1) * 0.55));
  }
  if (!still) { L.tx *= 1 - damp(2, dt); L.tz *= 1 - damp(2, dt); L.th *= 1 - damp(2, dt); }
  // (eased, slower than a step: the feet's settle steps follow the rig there)
  const k = damp(1.4, dt);
  L.ox += (L.tx - L.ox) * k; L.oz += (L.tz - L.oz) * k; L.oh += (L.th - L.oh) * k;
}
// the hands at the gesture (figure space, the body already posed), weight L.w; the arms posed by the gait are blended
// toward it bone by bone
const ARM_BONES = ['armL', 'elbowL', 'foreL', 'twistL', 'handL', 'armR', 'elbowR', 'foreR', 'twistR', 'handR'];
const _armQ = ARM_BONES.map(() => new THREE.Quaternion());
export function snapArms(fig) { const b = fig.bones; ARM_BONES.forEach((n, i) => _armQ[i].copy(b[n].quaternion)); }
export function blendArms(fig, w) { if (w >= 0.999) return; const b = fig.bones; ARM_BONES.forEach((n, i) => { const q = b[n].quaternion; q.copy(_armQ[i].slerp(q, w)); }); }
export function lifeArms(body, L) {
  if (!L || !L.g || L.w < 0.01) return;
  const { P, J } = body, kind = L.g.kind, t = L.g.t, cq = J.chest.q;
  const root = J.root.p, chest = J.chest.p, head = J.head.p;
  snapArms(body.fig);
  for (const [k, sg] of [['L', -1], ['R', 1]]) {
    const sh = J['arm' + k].p;
    let tgt = null, axis = V(1, 0, -sg * 0.15).applyQuaternion(cq), pole = V(sh.x - 0.3, sh.y - 0.25, sh.z + sg * 0.4), palm = V(0, 0, -sg);
    if (kind === 'hips') { tgt = V(root.x - 0.02, root.y + 0.04, root.z + sg * 0.19); axis = V(0, -1, 0); pole = V(sh.x - 0.35, sh.y - 0.25, sh.z + sg * 0.55); palm = V(0, 0, -sg); }
    else if (kind === 'pockets') { tgt = V(root.x + 0.07, root.y - 0.07, root.z + sg * 0.15); axis = V(0, -1, 0); pole = V(sh.x - 0.3, sh.y - 0.3, sh.z + sg * 0.3); }
    else if (kind === 'cross') { tgt = V(chest.x + 0.2, chest.y - 0.13 + (k === 'L' ? 0.025 : 0), -sg * 0.09); axis = V(0, 0, -sg); pole = V(sh.x - 0.1, sh.y - 0.45, sh.z + sg * 0.25); palm = V(0, -1, 0); }
    else if (kind === 'stretch') { const u = Math.sin(Math.PI * Math.min(1, t / L.g.dur)); tgt = V(chest.x + 0.02, head.y + 0.2 + 0.25 * u, sg * 0.16); axis = V(0, 0, -sg); pole = V(sh.x - 0.25, sh.y + 0.1, sh.z + sg * 0.4); palm = V(0, 1, 0); }
    else if (kind === 'pack') { tgt = V(0.42, root.y - 0.55, sg * 0.16 + 0.04 * Math.sin(t * 3 + sg)); axis = V(0, 0, -sg); }
    else if (kind === 'scratch' && k === 'R') { tgt = V(head.x - 0.03, head.y + 0.1 + 0.015 * Math.sin(t * 14), 0.07); axis = V(0, 0, -1); pole = V(sh.x - 0.05, sh.y - 0.15, sh.z + 0.5); palm = V(-1, 0, 0); }
    else if (kind === 'watch' && k === 'L') { tgt = V(chest.x + 0.3, chest.y - 0.02, -0.02); axis = V(0, 0, 1); pole = V(sh.x - 0.1, sh.y - 0.35, sh.z - 0.3); palm = V(0, 1, 0); }
    else if (kind === 'watch' && k === 'R') { tgt = V(chest.x + 0.24, chest.y - 0.08, 0.05); axis = V(0, -1, 0); }
    else if (kind === 'swat' && k === 'R') { tgt = V(head.x + 0.22, head.y - 0.04 + 0.05 * Math.sin(t * 9), 0.12 + 0.16 * Math.sin(t * 11)); axis = V(0, 1, 0); pole = V(sh.x - 0.1, sh.y - 0.2, sh.z + 0.5); palm = V(-1, 0, 0); }
    if (!tgt) continue;
    P.arm(k, tgt, axis, pole, palm);
  }
  const w = L.w * L.w * (3 - 2 * L.w);
  blendArms(body.fig, w);
}
// --- r2: a crossfade between two poses (a sit to a stand, a kneel in the hull from the step in over the gunwale): the
// bones as they were when the pose changed, eased into the new one's over dur seconds (each frame after the new pose
// is posed: fadeStep). The root's place is kept in the world (the figure may have moved frame: a person into a boat)
export function poseSnap(fig, out = null) {
  const b = fig.bones, o = out || { q: BONE_LIST.map(() => new THREE.Quaternion()), root: V(), t: 0, dur: 0.4, on: false };
  BONE_LIST.forEach((n, i) => o.q[i].copy(b[n].quaternion));
  fig.group.updateWorldMatrix(true, true); b.root.getWorldPosition(o.root);
  o.t = 0; o.on = true;
  return o;
}
const BONE_LIST = ['root', 'spine', 'chest', 'neck', 'head', 'clavL', 'armL', 'elbowL', 'foreL', 'twistL', 'handL', 'clavR', 'armR', 'elbowR', 'foreR', 'twistR', 'handR', 'thighL', 'kneeL', 'shinL', 'footL', 'toeL', 'thighR', 'kneeR', 'shinR', 'footR', 'toeR'];
const _fv = V(), _fm = new THREE.Matrix4(), _fq = new THREE.Quaternion();
export function fadeStep(fig, o, dt) {
  if (!o || !o.on) return;
  o.t += dt;
  const u = Math.min(1, o.t / Math.max(1e-3, o.dur)), w = u * u * (3 - 2 * u);
  if (u >= 1) { o.on = false; return; }
  const b = fig.bones, r = b.root;
  // (r2 verify: a body placed afresh far from where the fade began, a camp's member set at a new job after a clock jump
  // while also getting up from the bench, is not slid there through the ground: the fade is let go)
  if (o.t <= dt + 1e-6) { fig.group.updateWorldMatrix(true, true); r.getWorldPosition(_fv); if (_fv.distanceTo(o.root) > 1.2) { o.on = false; return; } }
  BONE_LIST.forEach((n, i) => { if (n === 'root') return; const q = b[n].quaternion; q.copy(_fq.copy(o.q[i]).slerp(q, w)); });
  // the root: its turn eased from the old, its place from where it was in the world
  r.quaternion.copy(_fq.copy(o.q[0]).slerp(r.quaternion, w));
  const par = r.parent;
  if (par) { par.updateWorldMatrix(true, false); _fv.copy(o.root).applyMatrix4(_fm.copy(par.matrixWorld).invert()); r.position.lerpVectors(_fv, r.position, w); }
}

// the figure's space and the rig's (the figure's matrix is kept current: placeFigure)
const _inv = new THREE.Matrix4();
export const toRig = (body, p) => p.clone().applyMatrix4(body.paddler.matrix);
export const fromRig = (body, p, out = V()) => out.copy(p).applyMatrix4(_inv.copy(body.paddler.matrix).invert());
export function placeFigure(body, x, y, z, yaw = 0) { const f = body.paddler; f.position.set(x, y, z); f.rotation.set(0, yaw, 0); f.updateMatrix(); }

// the paddle (gear.js's mesh) with its T-grip at gripRig (rig space), the shaft along dir (grip to blade), the power
// face toward n
export function placePaddle(paddle, gripRig, dir, n) {
  _fb.copy(dir).negate();                                        // paddle +y: up the shaft
  _fc.copy(n).addScaledVector(dir, -n.dot(dir)).normalize();    // paddle +z: the power face
  _fa.crossVectors(_fb, _fc);
  _mm.makeBasis(_fa, _fb, _fc);
  paddle.quaternion.setFromRotationMatrix(_mm);
  paddle.position.copy(gripRig);
}

// the rod's hands (fishing.js state.fishing, rig space): the right fist round the cork behind the reel, the left on the
// crank knob, on the butt for the cast, or either side of a fish held up; kneeling in the canoe or standing on foot
// (wc C), the body's joints already placed for the frame
export function rodArms(body, fz) {
  const { P, J } = body;
  const chestP = J.chest.p;
  const R = fromRig(body, fz.R), L = fromRig(body, fz.L);
  const dir = fz.dir ? V().copy(fz.dir) : V(1, 0, 0), up = fz.up ? V().copy(fz.up) : V(0, 1, 0);
  P.arm('R', R, dir, V(J.armR.p.x - 0.2, J.armR.p.y - 0.4, J.armR.p.z + 0.45), up.clone().negate());
  const ax = fz.knobAxis ? V().copy(fz.knobAxis) : V(0, 0, 1);
  P.arm('L', L, ax, V(J.armL.p.x - 0.25, J.armL.p.y - 0.45, J.armL.p.z - 0.4), V().subVectors(chestP, L));
}

// ---------------------------------------------------------------------------------------------------------------------
// The stroke, from a seat (the stern seat by default; seatX: SEATS.bow.x for a bow paddler). Figure space: the seat's
// middle at x = 0, the water at y = WATER. pose(dt, paddle) kneels the figure at the seat and paddles from the state
// (stroke, side, power, drive, turn, hustle; fishing: the rod's hands instead), the paddle mesh in its hands.
export function makeStroke(body, { seatX = SEATS.stern.x } = {}) {
  const { P, J, state, idle } = body;
  const SEAT_X = seatX;
  const SEAT_TOP = sheerY(SEAT_X) - SEATS.drop;
  const WATER = -FLOAT_OFFSET;
  // Returns the blade's middle, the shaft direction (grip to blade) and the power face for a phase t on side s, blending
  // a forward J-stroke, a wide sweep (sw) and a back stroke (rv).
  const CATCH = 0.8, EXIT = -0.04, DEPTH = 0.27;
  const hw = (x) => outerAt(SEAT_X + x, WATER).z;  // the hull's half-width at the waterline under x
  function strokePose(t, s, J, sw, rv, out) {
    const pw = t < 0.38, jp = t >= 0.38 && t < 0.5;
    let x, y, z, gx, gz, nx, nz, ny = 0;
    // forward stroke
    if (pw) {
      const sp = t / 0.38, k = sp * 0.75 + 0.25 * ease(sp);
      x = lerp(CATCH, EXIT, k); y = WATER - DEPTH; z = hw(x) + 0.17;
      gx = lerp(-0.06, 0.14, sp); gz = lerp(0.32, 0.27, sp);
      nx = -1; nz = 0;
    } else if (jp) {
      const sj = (t - 0.38) / 0.12, e = ease(sj);
      x = EXIT - 0.07 * e; y = WATER - DEPTH + 0.06 * e; z = hw(x) + 0.17 + 0.13 * e * J;
      gx = lerp(0.14, 0.19, e); gz = lerp(0.28, 0.2, e * J);
      const a = 1.2 * J * e; nx = -Math.cos(a); nz = Math.sin(a);
    } else {
      // a low recovery: the blade skims forward just clear of the water, the shaft laid out over the side
      // and the top hand down in front of the chest, then up again square for the catch
      const sr = (t - 0.5) / 0.5, lift = smooth(0, 0.26, sr), drop = smooth(0.72, 1.0, sr);
      x = lerp(EXIT - 0.07, CATCH, ease(sr));
      y = WATER - DEPTH + 0.06 + 0.43 * lift - 0.49 * drop;
      z = hw(x) + 0.17 + 0.13 * J * (1 - smooth(0, 0.6, sr)) + 0.16 * lift * (1 - drop);
      gx = lerp(0.19, -0.06, ease(sr)) + 0.18 * Math.sin(Math.PI * sr);
      gz = lerp(lerp(0.2, 1.1, lift), 0.32, drop);
      // feathered: the edge leads forward, then square again for the catch
      const a0 = 1.2 * J, f = smooth(0, 0.18, sr), back = smooth(0.7, 0.93, sr);
      const ja = lerp(a0, Math.PI / 2, f);
      const a = lerp(ja, 0, back);
      nx = -Math.cos(a); nz = Math.sin(a);
    }
    // a sweep: wide and shallow, out round the side
    if (sw > 0) {
      let sx, sy, sz, sgx, sgz;
      if (t < 0.5) { const sp = t / 0.5; sx = lerp(CATCH + 0.05, EXIT - 0.3, ease(sp)); sy = WATER - 0.16; sz = hw(sx) + 0.17 + 0.34 * Math.sin(Math.PI * sp); sgx = lerp(-0.3, 0.2, sp); sgz = 0.26 + 0.62 * Math.sin(Math.PI * sp); }
      else { const sr = (t - 0.5) / 0.5; sx = lerp(EXIT - 0.3, CATCH + 0.05, ease(sr)); sy = WATER - 0.2 + 0.46 * smooth(0, 0.25, sr) - 0.46 * smooth(0.75, 1, sr); sz = hw(sx) + 0.24 + 0.05 * Math.sin(Math.PI * sr); sgx = lerp(0.2, -0.3, ease(sr)) + 0.2 * Math.sin(Math.PI * sr); sgz = lerp(lerp(0.3, 1.0, smooth(0, 0.25, sr)), 0.3, smooth(0.75, 1, sr)); }
      x = lerp(x, sx, sw); y = lerp(y, sy, sw); z = lerp(z, sz, sw); gx = lerp(gx, sgx, sw); gz = lerp(gz, sgz, sw);
    }
    // back-paddling: the same path run the other way, the back face pushing
    if (rv > 0) {
      let bx, by, bz, bgx, bnx;
      if (t < 0.5) { const sp = t / 0.5; bx = lerp(EXIT - 0.02, CATCH - 0.05, ease(sp)); by = WATER - 0.22; bz = hw(bx) + 0.17; bgx = lerp(0.14, -0.28, sp); bnx = 1; }
      else { const sr = (t - 0.5) / 0.5; bx = lerp(CATCH - 0.05, EXIT - 0.02, ease(sr)); by = WATER - 0.18 + 0.46 * smooth(0, 0.22, sr) - 0.5 * smooth(0.76, 1, sr); bz = hw(bx) + 0.23; bgx = lerp(-0.28, 0.14, ease(sr)); bnx = sr > 0.2 && sr < 0.8 ? 0.2 : 1; }
      x = lerp(x, bx, rv); y = lerp(y, by, rv); z = lerp(z, bz, rv); gx = lerp(gx, bgx, rv); nx = lerp(nx, bnx, rv); nz = lerp(nz, 0, rv);
    }
    out.B.set(x, y, s * z);
    const gy = Math.sqrt(Math.max(0.1, PADDLE.centre * PADDLE.centre - gx * gx - gz * gz));
    out.G.set(x + gx, y + gy, s * (z - gz));
    out.D.subVectors(out.B, out.G).normalize();
    out.N.set(nx, ny, s * nz);
    // the face lies across the shaft
    out.N.addScaledVector(out.D, -out.N.dot(out.D));
    if (out.N.lengthSq() < 1e-6) out.N.set(-1, 0, 0);
    out.N.normalize();
    out.G.copy(out.B).addScaledVector(out.D, -PADDLE.centre);
    return out;
  }
  // the paddle laid across the gunwales in front of the knees, the blade out over the water on side s
  function restPose(s, out) {
    const x = 0.62, y = sheerY(SEAT_X + x) + 0.03;
    out.B.set(x - 0.02, y + 0.01, s * 1.06);
    out.D.set(0.02, -0.01, s).normalize();
    out.N.set(0, 1, 0);
    out.G.copy(out.B).addScaledVector(out.D, -PADDLE.centre);
    return out;
  }
  // paddle motion state: the shown pose (smoothed), and the switch across when the side changes
  const pad = { B: V(0.6, 0.15, 1), D: V(0, 0, 1), N: V(0, 1, 0), side: 1, sw: 1, from: null, top: { L: 0, R: 1 } };
  const tgt = { B: V(), D: V(), N: V(), G: V() }, rest = { B: V(), D: V(), N: V(), G: V() };
  const blend = { sweep: 0, rev: 0, J: 1 };

  // the paddle pose for this frame (figure space), and which hand is on top
  function paddleTargets(dt) {
    const s = state.side, p = state.power;
    const turning = Math.abs(state.turn) > 0.15;
    blend.sweep += ((turning && state.drive === 0 ? 1 : 0) - blend.sweep) * damp(5, dt);
    blend.rev += ((state.drive < 0 ? 1 : 0) - blend.rev) * damp(5, dt);
    blend.J += ((turning ? 0.3 : 1) - blend.J) * damp(4, dt);
    strokePose(state.stroke, s, blend.J, blend.sweep, blend.rev, tgt);
    restPose(s, rest);
    const r = 1 - p;
    tgt.B.lerp(rest.B, r); tgt.D.lerp(rest.D, r).normalize(); tgt.N.lerp(rest.N, r);
    tgt.N.addScaledVector(tgt.D, -tgt.N.dot(tgt.D)).normalize();
    // the side changed: lift the paddle across in front of the body while the hands change over
    if (s !== pad.side) { pad.from = { B: pad.B.clone(), D: pad.D.clone(), N: pad.N.clone() }; pad.sw = 0; pad.side = s; }
    if (pad.sw < 1) {
      pad.sw = Math.min(1, pad.sw + dt / 0.6);
      const u = ease(pad.sw);
      // a high crossing point: the shaft level across the hull in front of the chest
      const mid = { B: V(0.5, 0.42, s * 0.55), D: V(0.05, -0.18, s).normalize(), N: V(0, 1, 0) };
      const a = pad.from;
      const b1 = (k) => { const q = V(); q.copy(a[k]).multiplyScalar((1 - u) * (1 - u)).addScaledVector(mid[k], 2 * u * (1 - u)).addScaledVector(tgt[k], u * u); return q; };
      tgt.B.copy(b1('B')); tgt.D.copy(b1('D')).normalize(); tgt.N.copy(b1('N'));
      tgt.N.addScaledVector(tgt.D, -tgt.N.dot(tgt.D)).normalize();
    }
    const k = damp(18, dt);
    pad.B.lerp(tgt.B, k); pad.D.lerp(tgt.D, k).normalize(); pad.N.lerp(tgt.N, k);
    pad.N.addScaledVector(pad.D, -pad.N.dot(pad.D)).normalize();
    // the top hand: the off side (paddling on the right, the left hand is on the grip)
    const topL = s > 0 ? 1 : 0;
    pad.top.L += (topL - pad.top.L) * damp(7, dt); pad.top.R = 1 - pad.top.L;
  }

  // the hands on the paddle: top hand round the T, lower hand on the shaft; during a switch the hands slide
  // past each other, the moving one lifted clear of the shaft
  const GRIP_D = PADDLE.grip, LOW_D = PADDLE.lower;
  function paddleHands(chestP) {
    const G = V().copy(pad.B).addScaledVector(pad.D, -PADDLE.centre);
    const X = V().crossVectors(V().copy(pad.D).negate(), pad.N).normalize(); // the T's crossbar
    for (const h of ['L', 'R']) {
      const top = pad.top[h];
      const d = lerp(LOW_D, GRIP_D, top);
      const target = G.clone().addScaledVector(pad.D, d);
      const mid = 4 * top * (1 - top);
      if (mid > 0.01) target.addScaledVector(pad.N, (h === 'L' ? 1 : -1) * 0.07 * mid).addScaledVector(X, 0.03 * mid);
      const onT = smooth(0.55, 0.9, top);
      const axis = V().copy(pad.D).lerp(X, onT).normalize();
      const hint = V().subVectors(chestP, target).normalize().lerp(pad.D, onT);
      const sg = h === 'L' ? -1 : 1, sh = J['arm' + h].p;
      const pole = V(sh.x - 0.35 + 0.25 * top, sh.y - 0.45, sh.z + sg * (0.45 + 0.1 * top));
      P.arm(h, target, axis, pole, hint);
    }
  }

  // if a hand would fall short of its place on the paddle, bring the paddle in toward that shoulder
  function keepInReach() {
    const lim = 0.62;
    for (let it = 0; it < 3; it++) {
      let worst = 0; const shift = V();
      for (const h of ['L', 'R']) {
        const d = lerp(LOW_D, GRIP_D, pad.top[h]);
        const target = V().copy(pad.B).addScaledVector(pad.D, d - PADDLE.centre);
        const sh = J['arm' + h].p, gap = target.distanceTo(sh) - lim;
        if (gap > worst) { worst = gap; shift.subVectors(sh, target).normalize().multiplyScalar(gap); }
      }
      if (worst <= 0) break;
      pad.B.add(shift);
    }
  }

  // kneeling at the seat: the seat edge under the seat bones, knees spread on the bottom, shins back under the seat with
  // the boots tucked toe-down
  function kneelLegs() {
    for (const [h, sg] of [['L', -1], ['R', 1]]) {
      const hip = J['thigh' + h].p;
      const kz = sg * 0.19, ky0 = floorAt(SEAT_X + hip.x + 0.25) + 0.056;
      const dy = ky0 - hip.y, dz = kz - hip.z;
      const kx = hip.x + Math.sqrt(Math.max(0.01, LT * LT - dy * dy - dz * dz));
      const knee = V(kx, ky0, kz);
      const az = sg * 0.115, ax = kx - Math.sqrt(Math.max(0.01, LS * LS - 0.0001 - (az - kz) ** 2));
      const ankle = V(ax, floorAt(SEAT_X + ax) + 0.05, az);
      const pole = knee.clone().multiplyScalar(2).sub(hip.clone().add(ankle).multiplyScalar(0.5));
      const fq = frameQ(V(-1, -0.12, -sg * 0.05), V(0, -1, 0));
      P.leg(h, ankle, pole, fq);
    }
  }

  // the seated pose of the frame (the figure already placed at the seat, figure.matrix current): the paddle's targets,
  // the torso winding with the stroke, the kneel, the paddle mesh in the hands (state.grip and state.blade, rig space),
  // and the arms on it, or on the rod (state.fishing)
  function pose(dt, paddle) {
    const fz = state.fishing;
    paddleTargets(dt);
    const s = state.side, p = state.power, t = state.stroke;
    // the torso winds toward the paddle side for the catch and unwinds through the power phase
    const wind = t < 0.45 ? lerp(1, -0.35, ease(t / 0.45)) : lerp(-0.35, 1, ease((t - 0.45) / 0.55));
    const hustle = state.hustle ? 1 : 0;
    let yaw = p * s * (0.3 + 0.06 * hustle) * wind * (1 - 0.5 * blend.sweep);
    let lean = 0.09 + p * (0.17 * Math.max(0, wind) + 0.03 + 0.05 * hustle);
    let side = p * s * (0.09 * (0.4 + 0.6 * Math.max(0, wind)) + 0.1 * blend.sweep + 0.05 * blend.rev);
    updateIdle(idle, dt, p < 0.15 && !fz);
    const br = Math.sin(idle.breath);
    lean += 0.012 * br;
    let headYaw = -0.75 * yaw + idle.yaw, headPitch = -0.08 - idle.pitch;
    if (fz) {
      // turned toward where the rod points, leaning into the fight or back for the cast
      yaw = 0.4 * (fz.yaw || 0); lean = 0.08 + (fz.lean || 0); side = 0.05 * (fz.yaw || 0);
      headYaw = 0.5 * (fz.yaw || 0) - 0.4 * yaw; headPitch = -0.05 - 0.15 * (fz.look || 0);
    }
    const pelvis = bodyQ(0.3 * yaw, 0.22 + 0.25 * lean, 0.3 * side);
    const chest = bodyQ(yaw, lean, side);
    const head = bodyQ(yaw + headYaw, lean * 0.3 + headPitch, 0);
    const hip = V(0.19, SEAT_TOP + 0.098, 0);
    const root = hip.clone().add(V(0.05 * Math.sin(0.22), ROOT_UP * Math.cos(0.22), 0));
    const reach = p * Math.max(0, wind) * 0.11;
    spine(P, root, pelvis, chest, head, { shrugL: 0.015 * br, shrugR: 0.015 * br, reachL: reach, reachR: reach });
    kneelLegs();
    if (!fz) keepInReach();
    // the paddle
    const G = V().copy(pad.B).addScaledVector(pad.D, -PADDLE.centre);
    placePaddle(paddle, toRig(body, G), pad.D, pad.N);
    state.grip.copy(toRig(body, G)); state.blade.copy(toRig(body, pad.B));
    state.gripT.copy(state.grip); state.bladeT.copy(state.blade);
    if (fz) { rodArms(body, fz); return; }
    paddleHands(J.chest.p);
  }

  return { SEAT_X, SEAT_TOP, pad, blend, strokePose, restPose, paddleTargets, paddleHands, keepInReach, kneelLegs, pose };
}

// ---------------------------------------------------------------------------------------------------------------------
// On foot. Feet are kept in world space while planted; the swing lifts one toward where it should land.
// Moving, the gait's phase runs at the cadence and each foot swings once a cycle, when its share of the cycle passes the
// stance. That is marked per cycle, so a stance that shortens as a walk becomes a jog cannot skip a swing and leave the
// foot planted while the body runs on (the reach of that leg then dragged the hips to the ground: the jog's "weird low
// lunge", the owner, 2026-10-24); and a planted foot left further behind than the stride allows steps at once.
// Standing, a foot steps only when it is off its spot under the hip or turned from it (the body turning to the look),
// one foot at a time, and then both stay planted: with the stance half the cycle the old settle steps had one foot in
// the air at every moment, so they never ended (the stomping at idle).
// fb2 E: on a hill (the owner, 2026-10-24: "when I'm going up a hill, the character does this weird wide leg splayed
// glitchiness"). Up a 0.35 grade the foot left behind stands about 0.13 m lower than on the flat, so its reach dragged the
// hips down 0.25 m at every double support, a deep lunge with the front thigh level; and each step up the slope was
// taken as a step up a stair, the knee lifted high over an edge that was not there. Now the grade along the way (eased,
// from the feet's own ground: a flight of stairs counts) shortens the stride (SLOPE.stride a cycle per unit of
// steepness, strideDown downhill) and leans him into it; the hips sit a little lower as people bend their knees on a
// hill (SLOPE.sink m at full steepness); and the foot behind steps as soon as its reach would pull the hips more than
// SLOPE.slack under where they want to be. A swing
// lifts the knee over an edge only where the ground along its way rises above the straight line from where it left to
// where it lands (a tread, a log, a rock), by more than STEP_EDGE; on an even slope it follows the slope.
export const SLOPE = { full: 0.45, stride: 0.35, strideDown: 0.6, sink: 0.05, slack: 0.025, lean: 0.14 };
const STEP_EDGE = [0.05, 0.14];
const SETTLE = { dist: 0.085, yaw: 0.42, dur: 0.34, clear: 0.045 };
const OFF = { L: 0, R: 0.5 };
const _aim = V(), _v = V(), _v2 = V(), _v3 = V(), _ra = V(), _rb = V();

// The gait of one body: walk(dt, moveKind, fz) and carry(dt, hull) pose it for the frame (the figure placed at the rig's
// origin first); the rest are what canoe.js's own moves (a vault, a climb, sitting) read: the feet (loco.feet, ankles,
// fq, tq), the frames (toWorld, toLocal), the sole (ankleAt, footFrameQ). heal() starts it all afresh.
export function makeGait(body) {
  const { P, J, rig, state, idle } = body;
  const ground = body.ground;
  let crouchK = 0; // state.crouch, eased: the hips sink over the planted feet (the knees forward), the back bends over
  let wadeK = 0;   // wading (player.move 'wade'), eased: the knees lifted high out of the water, the arms out from the sides
  let mireK = 0;   // the wetlands underfoot (player.js state.mire, 0..1), eased: each boot pulled up out of the muck (a higher
                   // knee, a slower step), the body rolling over the foot that takes it and the arms a little out for balance
  const loco = { init: false, phase: 0, hipY: HIP_H - 0.1, hipW: NaN, hipYaw: 0, stepping: false, moving: false, mw: 0, feet: {}, rigPos: V(), h: 0, grade: 0, tilt: 0, want: HIP_H - 0.05 };
  for (const h of ['L', 'R']) loco.feet[h] = { pos: V(), yaw: 0, lift: V(), liftYaw: 0, target: V(), targetYaw: 0, swing: false, s: 0, dur: 0.3, cyc: -1, planted: 1, clear: 0.05, slope: 0, pitch: 0 };
  const toWorld = (local, out = V()) => { const h = rig.rotation.y, c = Math.cos(h), s = Math.sin(h); return out.set(rig.position.x + local.x * c + local.z * s, rig.position.y + local.y, rig.position.z - local.x * s + local.z * c); };
  const toLocal = (world, out = V()) => { const h = rig.rotation.y, c = Math.cos(h), s = Math.sin(h), dx = world.x - rig.position.x, dz = world.z - rig.position.z; return out.set(dx * c - dz * s, world.y - rig.position.y, dx * s + dz * c); };
  const restLocal = (h, hipYaw = 0, out = V()) => { const sg = h === 'L' ? -1 : 1; return out.set(Math.sin(hipYaw) * sg * 0.115, 0, Math.cos(hipYaw) * sg * 0.115); };
  const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function plantAt(f, world, yaw) {
    f.pos.copy(world); f.pos.y = ground(world.x, world.z); f.yaw = yaw;
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const gh = ground(world.x - fx * HEEL, world.z - fz * HEEL), gb = ground(world.x + fx * BALL, world.z + fz * BALL);
    f.slope = Math.atan2(gb - gh, HEEL + BALL);
  }
  function initFeet() {
    loco.init = true; loco.phase = 0; loco.stepping = false; loco.moving = false;
    for (const h of ['L', 'R']) { const f = loco.feet[h]; plantAt(f, toWorld(restLocal(h)), rig.rotation.y + (h === 'L' ? 0.08 : -0.08)); f.swing = false; f.s = 0; f.cyc = -1; f.planted = 1; }
    loco.hipY = ground(rig.position.x, rig.position.z) - rig.position.y + HIP_H - 0.02; loco.hipW = NaN;
    loco.rigPos.copy(rig.position); loco.h = rig.rotation.y;
  }
  // the ankle (world) for a foot reference point on the ground, its yaw and pitch (+ toes up), pivoting on the
  // heel when the toes are up and on the ball when the heel is
  function ankleAt(p, yaw, pitch, out) {
    const fx = Math.cos(yaw), fz = -Math.sin(yaw), c = Math.cos(pitch), s = Math.sin(pitch);
    if (pitch >= 0) { const a = HEEL * c - AH * s, b = HEEL * s + AH * c; return out.set(p.x - fx * HEEL + fx * a, p.y + b, p.z - fz * HEEL + fz * a); }
    const a = -BALL * c - AH * s, b = -BALL * s + AH * c;
    return out.set(p.x + fx * BALL + fx * a, p.y + b, p.z + fz * BALL + fz * a);
  }
  function footFrameQ(yawW, pitch, out) {
    const yl = yawW - rig.rotation.y, c = Math.cos(pitch), s = Math.sin(pitch);
    return frameQ(_v.set(Math.cos(yl) * c, s, -Math.sin(yl) * c), _v2.set(-Math.cos(yl) * s, c, Math.sin(yl) * s), out);
  }
  const fq = { L: new THREE.Quaternion(), R: new THREE.Quaternion() }, tq = { L: new THREE.Quaternion(), R: new THREE.Quaternion() };
  const ankles = { L: V(), R: V() };
  // fb2 E: how high (rig space) foot k's reach lets the hips stand, from its ankle as last placed (standingBody's cap for
  // that foot, without its 0.42 m clamp)
  function reachOf(k) {
    const a = toLocal(ankles[k], _ra), sg = k === 'L' ? -1 : 1, yaw = loco.hipYaw, R = (LT + LS) * 0.995;
    const horiz = Math.hypot(a.x - Math.sin(yaw) * sg * 0.098, a.z - Math.cos(yaw) * sg * 0.098);
    return horiz >= R ? a.y - 1 : a.y + Math.sqrt(R * R - horiz * horiz);
  }
  loco.reachOf = reachOf; // (for the tests)
  // fb2 E: how far the ground along a swing's way rises above the straight line from where the foot left to where it lands
  // (0 on an even slope; a tread's edge, a log, a rock on the way)
  function edgeOf(f) {
    let bump = 0;
    for (let i = 1; i <= 5; i++) {
      const s = i / 6;
      _rb.lerpVectors(f.lift, f.target, s);
      const d = ground(_rb.x, _rb.z) - _rb.y;
      if (d > bump) bump = d;
    }
    return bump;
  }

  // In a hop or a fall: the feet leave the ground and follow the body, pushed off with the toes down, tucked up under
  // the hips at the top, reaching down again as it falls; planted afresh where they land.
  function airFeet(dt) {
    loco.air = true; loco.stepping = false;
    loco.mw += (0 - loco.mw) * damp(6, dt);
    const T = state.airT, rising = state.vy > 0;
    const tuck = rising ? smooth(0.04, 0.2, T) : smooth(-2.6, -0.5, state.vy); // up after the push-off, down again to land
    for (const [k, sg] of [['L', -1], ['R', 1]]) {
      const f = loco.feet[k];
      f.swing = false;
      const local = restLocal(k, 0, _v3);
      local.x += (rising ? -0.06 * (1 - tuck) : 0.04) + 0.06 * tuck + (sg < 0 ? 0.03 : -0.03) * tuck;
      local.y = -0.1 + 0.2 * tuck;
      const pitch = rising ? lerp(-0.6, -0.15, tuck) : lerp(0.12, -0.1, tuck);
      toWorld(local, f.pos); f.yaw = rig.rotation.y + (k === 'L' ? 0.08 : -0.08); f.pitch = pitch;
      ankleAt(f.pos, f.yaw, pitch, ankles[k]);
      footFrameQ(f.yaw, pitch, fq[k]); tq[k].copy(fq[k]);
    }
    return { v: Math.max(0, state.speed), sp: 0, hustle: 0, jog: 0, moving: false, mw: loco.mw, backF: false, mx: 1, mz: 0, fs: 0.5, phase: loco.phase, amp: 1, air: true, tuck };
  }

  // advance the feet; returns the gait numbers the upper body uses
  function locomote(dt, carry) {
    if (state.air && !carry) { loco.rigPos.copy(rig.position); loco.h = rig.rotation.y; return airFeet(dt); }
    // (r2: a jump across the ground starts the feet afresh; the ground itself rising or falling under a body standing
    // there, a finer tile or a LiDAR chunk come in, does not: the feet re-step to it and the hips follow it eased)
    if (!loco.init || loco.air || Math.hypot(rig.position.x - loco.rigPos.x, rig.position.z - loco.rigPos.z) > 1.5 || Math.abs(rig.position.y - loco.rigPos.y) > 4) { initFeet(); loco.air = false; }
    loco.rigPos.copy(rig.position); loco.h = rig.rotation.y;
    // (r2 verify: for the people the game drives, a planted foot the ground has moved under by more than 0.25 m, walking
    // as well as standing, is planted afresh where it stands: a finer tile come in under a party on a steep bank had left
    // a walker's feet a metre under it and the hips capped down to them, buried to the waist. The player's own and a
    // friend's feet keep their rules: their ground can change with what they stand on)
    if (body.life && loco.init) for (const k of ['L', 'R']) { const f = loco.feet[k]; if (!f.swing && Math.abs(f.pos.y - ground(f.pos.x, f.pos.z)) > 0.25) plantAt(f, f.pos, f.yaw); }
    mireK += ((state.mire || 0) - mireK) * damp(3, dt);
    const v = Math.max(0, state.speed);
    const mf = state.moveFwd, ml = state.moveLat, mag = Math.hypot(mf, ml);
    const moving = state.walkSpeed > 0.25 && v > 0.12 && mag > 0.1;
    const mx = mag > 0.05 ? mf / mag : 1, mz = mag > 0.05 ? ml / mag : 0;
    const th = Math.atan2(mz, mx);
    const backF = Math.abs(th) > 1.75;
    let hy = backF ? -(th - Math.sign(th) * Math.PI) / 2 : -th / 2;
    hy = Math.max(-0.7, Math.min(0.7, hy));
    loco.hipYaw += ((moving ? hy : 0) - loco.hipYaw) * damp(6, dt);
    const sp = smooth(0.3, 2.2, v), hustle = smooth(2.5, 3.1, v);
    // the jog, from the walk by speed: the stride lengthens rather than the step quickening, and the stance shortens
    // under half the cycle, so between one foot's push-off and the other's landing both are off the ground
    const jog = carry || backF ? 0 : smooth(2.35, 2.85, v) * (1 - Math.abs(mz) * 0.7);
    // c: gait cycles a second (two steps each), as people walk: a 3 mph walk (1.35 m/s) is about 110 steps a minute of
    // 0.73 m, a jog at 2.9 m/s about 170 of a metre, a canoe carry about 100 short ones. (These had been about 1.6
    // times too quick, so every step came out some 0.45 m long and a 4.8 km/h walk read as a shuffle at half that:
    // the owner, 2026-10-23, "you say its 4.8 but it feels like 2.4".)
    let c, fs, clear;
    if (carry) { c = 0.55 + 0.3 * v; fs = 0.6; clear = 0.05 + 0.02 * sp + 0.06 * mireK; }
    else {
      // the jog upright, the knee lifting lightly: a shorter flight and a lower swing than the sprinter's it had been
      c = lerp(0.6 + 0.24 * v, 1.2 + 0.08 * v, jog);
      fs = lerp(lerp(0.58, 0.5, hustle), 0.36, jog);
      clear = lerp(0.06 + 0.05 * sp + 0.03 * hustle, 0.16, jog) + 0.12 * wadeK + 0.09 * mireK;
    }
    c *= 1 - 0.14 * mireK; // (the muck: fewer, heavier steps; player.js slows the walk itself)
    fs = Math.min(0.7, fs + 0.06 * mireK); // (and longer on each foot)
    c *= 1 + 0.2 * Math.abs(mz);
    // world velocity of the body, for where a swinging foot will land
    const h = rig.rotation.y, ch = Math.cos(h), shh = Math.sin(h);
    // fb2 E: the grade along the way, from the feet's ground 0.35 m ahead and behind (a flight of stairs is steep), eased:
    // a steep one shortens the stride; and the tilt, the terrain's own steepness (a step's edge beside him is not a hill)
    {
      const px = rig.position.x, pz = rig.position.z, e = 0.35, T = body.terrain || ground;
      const ux = moving ? mx * ch + mz * shh : ch, uz = moving ? -mx * shh + mz * ch : -shh;
      const gx = (T(px + e, pz) - T(px - e, pz)) / (2 * e), gz = (T(px, pz + e) - T(px, pz - e)) / (2 * e);
      const lim = (x) => Math.max(-1.2, Math.min(1.2, x)), k = damp(10, dt);
      const along = (ground(px + ux * e, pz + uz * e) - ground(px - ux * e, pz - uz * e)) / (2 * e);
      loco.grade += (lim(along) - loco.grade) * k; // along the way, or standing the way he faces (+ up): the stride
      loco.tilt += (Math.min(1.2, Math.hypot(gx, gz)) - loco.tilt) * k;        // the ground's own steepness: the hips
    }
    const steep = Math.min(1, Math.abs(loco.grade) / SLOPE.full);
    c *= 1 + (loco.grade < 0 ? SLOPE.strideDown : SLOPE.stride) * steep * (1 - jog); // (down a hill shorter still: the foot ahead lands lower)
    state.cadence = moving ? c : 0;
    const L = v / c, E = fs * L;
    const vx = moving ? (mx * ch + mz * shh) * v : 0, vz = moving ? (-mx * shh + mz * ch) * v : 0;
    const amp = 0.3 + 0.7 * sp;
    const F = loco.feet;
    const startSwing = (f, dur, cl) => { f.swing = true; f.s = 0; f.dur = Math.max(0.12, dur); f.clear = cl; f.lift.copy(f.pos); f.liftYaw = f.yaw; f.fresh = true; };
    const cycOf = (k) => Math.floor(loco.phase + OFF[k]);
    const uOf = (k) => loco.phase + OFF[k] - Math.floor(loco.phase + OFF[k]);
    // where a foot is, along the way the body goes (+ ahead of the hips)
    const along = (f) => { const a = toLocal(f.pos, _v2); return a.x * mx + a.z * mz; };
    if (moving && !loco.moving) {
      // setting off: the phase is set so the first step comes now, by the foot further back (or the one already in the air)
      let lead = F.L.swing ? 'L' : F.R.swing ? 'R' : null;
      if (!lead) lead = along(F.L) <= along(F.R) ? 'L' : 'R';
      const u0 = F[lead].swing ? fs + F[lead].s * (1 - fs) : fs + 1e-4;
      loco.phase = Math.ceil(loco.phase) + 2 + frac(u0 - OFF[lead]);
      for (const k of ['L', 'R']) {
        const f = F[k];
        if (k === lead) {
          f.cyc = cycOf(k);
          if (!f.swing) startSwing(f, (1 - uOf(k)) / c, clear);
          else if (f.s < 1) f.dur = Math.min(f.dur, 0.14 / (1 - f.s)); // a settle step under way comes down soon, the other foot next
        } else f.cyc = uOf(k) >= fs ? cycOf(k) : cycOf(k) - 1;
      }
    }
    loco.moving = moving;
    loco.mw += ((moving ? 1 : 0) - loco.mw) * damp(moving ? 7 : 5, dt);
    if (moving) {
      loco.phase += c * dt;
      for (const k of ['L', 'R']) {
        const f = F[k], o = F[k === 'L' ? 'R' : 'L'];
        if (f.swing) { f.clear = clear; continue; }
        const cy = cycOf(k), u = uOf(k);
        // its turn in the cycle, or left further behind than the stride allows (the other foot down, unless jogging); or
        // (fb2 E) behind and lower, down a slope's length, so that its reach would hold the hips under where they want to be
        // (on the flat the hips' dip at double support is about 0.07 m; that slack is let go only as the ground steepens)
        const slack = lerp(0.13, SLOPE.slack, smooth(0.15, 0.6, steep));
        const behind = -along(f), far = behind > Math.min(E / 2 + 0.24, 0.6) || (jog < 0.5 && behind > 0.12 && reachOf(k) < loco.want - slack), late = far && (!o.swing || jog > 0.5);
        if ((u >= fs && f.cyc !== cy) || late) { f.cyc = cy; startSwing(f, late && u < fs ? (1 - fs) / c : (1 - u) / c, clear); }
        else if (far && o.swing && o.s < 1) o.dur = Math.min(o.dur, 0.1 / (1 - o.s)); // the other foot down quickly, so this one can go
      }
    } else if (!F.L.swing && !F.R.swing) {
      // standing: the foot furthest off its place under the hip (or turned from it) steps back to it, one at a time
      // (r2: or with the ground under it moved: a finer tile come in, a spot moved, a floor given afresh; the owner,
      // 2026-11-05, "sometimes I see them like embedded in the ground": the hips had sunk to reach feet left planted
      // under the new ground. A small change steps; a big one is planted afresh where the foot stands)
      let worst = null, wv = 1;
      for (const k of ['L', 'R']) {
        const f = F[k], d = flatDist(f.pos, toWorld(restLocal(k), _v3)) / SETTLE.dist;
        const y = Math.abs(wrapPi(f.yaw - (h + (k === 'L' ? 0.08 : -0.08)))) / SETTLE.yaw;
        const gy = Math.abs(f.pos.y - ground(f.pos.x, f.pos.z));
        if (gy > 0.25) { plantAt(f, f.pos, f.yaw); continue; }
        const e = Math.max(d, y, gy / 0.035);
        if (e > wv) { wv = e; worst = k; }
      }
      if (worst) startSwing(F[worst], SETTLE.dur, SETTLE.clear);
    }
    loco.stepping = moving || F.L.swing || F.R.swing;
    for (const k of ['L', 'R']) {
      const f = F[k];
      const toe = k === 'L' ? 0.08 : -0.08;
      if (f.swing) {
        if (moving) f.dur = Math.min(f.dur, Math.max(0.12, (1 - fs) / c)); // a step begun slow, setting off, quickens with the pace
        f.s = Math.min(1, f.s + dt / f.dur);
        const s = f.s;
        const tau = (1 - s) * f.dur;
        const land = restLocal(k, moving ? loco.hipYaw : 0, _v3);
        if (moving) { land.x += mx * E / 2; land.z += mz * E / 2; }
        // where it will land, followed smoothly: the pace, the way or the step's timing changing under a swing (setting
        // off, a step hurried along) move the aim, never the foot in one frame
        const tw = toWorld(land, _aim);
        tw.x += vx * tau; tw.z += vz * tau;
        if (f.fresh) { f.target.copy(tw); f.fresh = false; }
        else { const ka = damp(16, dt); f.target.x += (tw.x - f.target.x) * ka; f.target.z += (tw.z - f.target.z) * ka; }
        f.target.y = ground(f.target.x, f.target.z);
        f.targetYaw = h + (moving ? loco.hipYaw : 0) + toe;
        if (s >= 1) {
          f.swing = false; f.planted = 0; plantAt(f, f.target, f.targetYaw);
          // the phase kept with the feet: a landing is the start of that foot's cycle (a step hurried or held back, setting
          // off or speeding up, would otherwise leave the cycle and the feet out of step)
          if (moving) { const d = Math.round(loco.phase + OFF[k]) - OFF[k] - loco.phase; loco.phase += Math.max(-0.15, Math.min(0.15, d)); }
        }
      }
      if (f.swing) {
        const s = f.s;
        // a jogging foot stays back a moment as the heel comes up, then the knee brings it through
        const e = lerp(ease(s), Math.pow(ease(s), 1.3), jog);
        f.pos.lerpVectors(f.lift, f.target, e);
        // a step up (a log, a rock, the store's step): the knee lifts the foot over the edge early; a step down holds it
        // up until it is over the lower ground
        // (fb2 E: only over an edge on the way; up or down an even slope the foot keeps to the slope)
        const bump = edgeOf(f), edge = smooth(STEP_EDGE[0], STEP_EDGE[1], bump);
        const rise = f.target.y - f.lift.y, up = smooth(0.08, 0.2, rise) * edge, down = smooth(0.08, 0.2, -rise) * edge;
        const sy = lerp(lerp(s, Math.sin((Math.PI / 2) * Math.min(1, s * 1.25)), up), s * s, down);
        const cl = Math.max(f.clear, up * (0.45 * rise + 0.08), edge * (1 - up) * (bump + 0.04)); // (over a log on the level: its height)
        f.pos.y = lerp(f.lift.y, f.target.y, sy) + cl * Math.pow(Math.sin(Math.PI * Math.pow(s, lerp(0.8, 0.6, jog))), 1.2);
        f.pos.y = Math.max(f.pos.y, ground(f.pos.x, f.pos.z) + 0.01 * Math.sin(Math.PI * s)); // never through a bump on the way
        f.yaw = f.liftYaw + wrapPi(f.targetYaw - f.liftYaw) * e;
        // toes down after the push-off, up again to meet the ground with the heel
        let pt = s < 0.3 ? lerp(-0.55, -0.2, s / 0.3) : s < 0.85 ? lerp(-0.2, 0.18, (s - 0.3) / 0.55) : lerp(0.18, 0.22, (s - 0.85) / 0.15);
        pt *= amp * (backF ? -0.6 : 1);
        f.pitch = pt;
        ankleAt(f.pos, f.yaw, pt + f.slope * s, ankles[k]);
        footFrameQ(f.yaw, pt + f.slope * s, fq[k]);
        tq[k].copy(fq[k]);
      } else {
        // planted: heel strike, flat, heel off (the other way on a back-step), the toes kept on the ground; standing, flat
        f.planted += dt;
        const sig = moving ? sat(f.planted * c / fs) : 0.4;
        let pt = sig < 0.12 ? 0.22 * (1 - sig / 0.12) : sig < 0.6 ? 0 : -0.55 * Math.pow((sig - 0.6) / 0.4, 1.4);
        pt *= amp * (backF ? -0.6 : 1) * loco.mw;
        f.pitch = pt;
        ankleAt(f.pos, f.yaw, pt + f.slope, ankles[k]);
        footFrameQ(f.yaw, pt + f.slope, fq[k]);
        if (pt < 0) footFrameQ(f.yaw, f.slope, tq[k]); else tq[k].copy(fq[k]);
      }
    }
    return { v, sp, hustle, jog, moving, mw: loco.mw, backF, mx, mz, fs, phase: loco.phase, amp, air: false, tuck: 0 };
  }

  // the standing body over the feet: pelvis height from the ground under the feet and the legs' reach, the
  // bob (down after each contact, up at passing), sway toward the standing foot, the hips turning with the
  // swing and the shoulders against them
  // fz (wc C): fishing.js's hands while the rod is up on foot: the chest turned toward where the rod points (fz.yaw),
  // leaning back for the cast or into the fight (fz.lean), the head down to the lure (fz.look)
  function standingBody(dt, g, carry, fz = null) {
    const phi = g.phase, mw = g.mw, sp = g.sp * mw;
    const life = body.life || null, lw = life ? 1 - mw : 0; // (r2: an idle with life, standing)
    crouchK += ((carry || g.air ? 0 : Math.max(state.crouch || 0, life ? life.crouch : 0)) - crouchK) * damp(5, dt);
    const ck = ease(crouchK);
    const twoPi = Math.PI * 2;
    // in the air the ground is where the feet are (the rig rides the hop); otherwise the ground under the body
    const gl = g.air ? -0.1 : toLocal(_v.set(rig.position.x, ground(rig.position.x, rig.position.z), rig.position.z)).y;
    const jog = g.jog * mw;
    const bend = carry ? 0.05 + 0.02 * sp : lerp(0.018 + 0.02 * sp + 0.03 * g.hustle * mw, 0.04, jog);
    const bobA = (carry ? 0.012 : 0.01) + 0.008 * sp;
    // the walk: down after each contact, up at passing; the jog: lowest at mid-stance (half the stance after a
    // foot lands), highest in the flight between steps
    const bobW = -bobA * (0.5 + 0.5 * Math.cos(twoPi * 2 * (phi - 0.07))), bobJ = -0.03 * Math.cos(twoPi * 2 * (phi - g.fs / 2));
    const bob = lerp(-0.006 * (0.5 + 0.5 * Math.sin(idle.breath)), lerp(bobW, bobJ, g.jog), mw);
    // a hop: the legs straight at the push-off, the knees up in the tuck; the landing sinks into them; a stagger
    // under the canoe dips
    const airDrop = g.air ? 0.02 + 0.05 * g.tuck : 0;
    let target = gl + HIP_H - bend + bob - airDrop - 0.16 * ease(state.land) - 0.06 * Math.sin(Math.PI * state.stagger) - 0.4 * ck;
    // fb2 E: on a hill the knees stay a little bent (the hips lower by up to SLOPE.sink, by the ground's steepness whichever
    // way it falls: standing across a slope the lower foot holds them too), and that is where they want to be:
    // a foot whose reach would hold them under it steps (locomote)
    target -= SLOPE.sink * smooth(0.08, SLOPE.full, loco.tilt) * mw;
    loco.want = target;
    // no higher than the planted legs reach. A walking foot reaching for the ground counts from mid-swing, so the hips
    // settle into the heel strike instead of dropping at it; a jogging foot in the air does not hold the body down. Only
    // so far for a foot left behind: past 0.42 m out it steps (locomote) rather than pulling the hips down
    const yaw = loco.hipYaw;
    let cap = Infinity;
    for (const [k, sg] of [['L', -1], ['R', 1]]) {
      const f = loco.feet[k];
      if (f.swing && !g.air && (jog > 0.5 || f.s < 0.5)) continue;
      const a = toLocal(ankles[k], _v2);
      const hx = Math.sin(yaw) * sg * 0.098, hz = Math.cos(yaw) * sg * 0.098;
      const horiz = Math.min(0.42, Math.hypot(a.x - hx, a.z - hz)), reach = (LT + LS) * 0.995;
      const max = a.y + Math.sqrt(Math.max(0, reach * reach - horiz * horiz));
      if (max < cap) cap = max;
    }
    target = Math.min(target, cap);
    // the hips follow their height in the world, not the rig's: a step down off a stone, a slab underfoot or the ground's
    // facets come through the body softly (in a hop the body rides the rig)
    const ry = rig.position.y;
    if (!g.air && Number.isFinite(loco.hipW)) loco.hipY = loco.hipW - ry;
    loco.hipY += (target - loco.hipY) * damp(target < loco.hipY ? 22 : 12, dt);
    loco.hipY = Math.min(loco.hipY, cap + 0.008); // never past what the planted legs reach
    loco.hipW = loco.hipY + ry;
    // standing: the weight drifts slowly from foot to foot, the hips rolling a touch over the one that takes it
    // (r2: with life the weight goes onto one foot and stays there a while, the hips out over it and rolled up on that side)
    const still0 = life ? 0.045 * life.shift : 0.014 * Math.sin(idle.shift), roll0 = life ? -0.06 * life.shift : -0.025 * Math.sin(idle.shift);
    const swayZ = lerp(still0, -(0.024 * sp + 0.03 * mireK) * Math.sin(twoPi * (phi - 0.03)), mw);
    const roll = lerp(roll0, (0.06 * sp + 0.07 * mireK) * Math.sin(twoPi * (phi - 0.03)), mw);
    const pYaw = -0.11 * sp * Math.cos(twoPi * phi) * (g.backF ? -1 : 1);
    // the jog upright: a few degrees forward of the walk, no more
    const lean = (carry ? 0.1 : 0.03) + mw * (g.backF ? -0.05 : 0.045 * g.sp + 0.025 * g.hustle + 0.035 * g.jog + SLOPE.lean * smooth(0.05, SLOPE.full, loco.grade)) + 0.01 * Math.sin(idle.breath) + 0.07 * wadeK + 0.04 * mireK
      + 0.12 * ease(state.land) + (g.air ? 0.06 : 0) + 0.1 * Math.sin(Math.PI * state.stagger) + 0.45 * ck + (state.lean || 0) * (1 - mw); // (r2: state.lean, a lean of its own standing: over a counter)
    const fy = fz ? 0.35 * (fz.yaw || 0) : 0, fl = fz ? 0.6 * (fz.lean || 0) : 0, fh = fz ? -0.18 * (fz.look || 0) : 0;
    const pelvis = bodyQ(yaw + pYaw + 0.25 * fy, 0.03 + lean * 0.3, roll);
    const ly = life ? lw * (life.look + 0.25 * idle.yaw) : 0, lp = life ? lw * life.lookP : 0;
    const chest = bodyQ(-0.6 * pYaw + idle.yaw * 0.15 + fy + ly, lean + fl + lp, -0.4 * roll + 0.04 * g.mz * sp);
    const head = bodyQ(idle.yaw * 0.85 + (fz ? 0.5 * (fz.yaw || 0) - 0.5 * fy : 0) - 0.5 * ly, (carry ? 0.22 : 0.02) - idle.pitch + 0.15 * lean + 0.2 * ck + fh + (life && life.g && life.g.kind === 'watch' ? 0.35 * life.w : 0) - (life && life.g && life.g.kind === 'stretch' ? 0.25 * life.w : 0), 0);
    const root = V(lean * 0.06, loco.hipY + ROOT_UP, swayZ);
    spine(P, root, pelvis, chest, head, { shrugL: 0.012 * Math.sin(idle.breath), shrugR: 0.012 * Math.sin(idle.breath) });
    // the legs to the feet, knees over the toes
    for (const [k, sg] of [['L', -1], ['R', 1]]) {
      const a = toLocal(ankles[k], V());
      const f = loco.feet[k], yl = f.yaw - rig.rotation.y;
      const hip = J['thigh' + k].p;
      const pole = V((hip.x + a.x) / 2 + Math.cos(yl) * 0.6, (hip.y + a.y) / 2, (hip.z + a.z) / 2 - Math.sin(yl) * 0.6 + sg * 0.05);
      P.leg(k, a, pole, fq[k], tq[k]);
    }
    return { pYaw };
  }

  // arms hanging and swinging against the legs; the elbows bend more as the pace picks up. only: the arms to pose
  // ('L', 'R'; all when null): under the canoe the hand with a thing in it hangs and swings so, the other is on a gunwale
  function swingArms(g, only = null) {
    const phi = g.phase, mw = g.mw, sp = g.sp * mw, jog = g.jog * mw;
    // jogging, the arms are carried bent at about a right angle, a little forward, and swing higher
    const A = lerp(0.32 + 0.22 * sp + 0.12 * g.hustle, 0.56, jog) * mw * (1 - 0.6 * Math.abs(g.mz)) * (g.backF ? 0.6 : 1);
    const bend = lerp(0.32 + 0.25 * sp + 0.5 * g.hustle, 1.55, jog) + (g.air ? 0.5 : 0) + 0.4 * ease(state.land);
    // crouched, the hands go down in front of the knees, working a little in turn (picking, gathering, the fire)
    const ck = ease(crouchK), work = 0.12 * ck * Math.sin(idle.breath * 7);
    const fwd = 0.04 + 0.12 * jog + (g.air ? 0.25 * g.tuck : 0) + 0.75 * ck;
    const cq = J.chest.q;
    for (const [k, sg] of [['L', -1], ['R', 1]]) {
      if (only && !only.includes(k)) continue;
      // a hand carrying something (stream A's state.held: the bucket, the tackle box, the rod) hangs straighter and swings less
      const held = state.held && state.held[k] ? 1 : 0;
      const sw = A * (1 - 0.6 * held) * (k === 'L' ? -1 : 1) * Math.cos(Math.PI * 2 * phi) + fwd * (1 - 0.5 * held) + (k === 'L' ? work : -work) * (1 - held);
      const sh = J['arm' + k].p;
      const du = V(Math.sin(sw), -Math.cos(sw), sg * (0.13 + 0.55 * wadeK + 0.18 * mireK)).normalize().applyQuaternion(cq);
      const df = V(Math.sin(sw + bend * (1 - 0.7 * held)), -Math.cos(sw + bend * (1 - 0.7 * held)), sg * (0.06 + 0.3 * wadeK)).normalize().applyQuaternion(cq);
      const elbow = sh.clone().addScaledVector(du, 0.315);
      const target = elbow.clone().addScaledVector(df, 0.265 + 0.07);
      const pole = elbow.clone().add(V(-0.3, 0, sg * 0.05).applyQuaternion(cq));
      P.arm(k, target, V(1, 0, -sg * 0.15).applyQuaternion(cq), pole, V(0, 0, -sg).applyQuaternion(cq));
    }
  }

  // walking, jogging, a hop, a crouch, wading (moveKind 'wade'); the hands on the rod when fz (fishing.js's hands)
  function walk(dt, moveKind = null, fz = null) {
    updateIdle(idle, dt, state.walkSpeed < 0.2 && !fz);
    if (body.life) lifeStep(body.life, dt, state.walkSpeed < 0.2 && !fz && !state.air, { hands: !body.handsBusy && !(state.crouch > 0.1) && !(state.held && (state.held.L || state.held.R)) });
    wadeK += ((moveKind === 'wade' ? 1 : 0) - wadeK) * damp(4, dt);
    const g = locomote(dt, false);
    standingBody(dt, g, false, fz);
    if (fz) rodArms(body, fz); else { swingArms(g); if (body.life && !body.handsBusy) lifeArms(body, body.life); }
  }

  // the canoe overhead: the same feet under a heavier, shorter gait; the yoke's pads on the shoulders, the bow up a little
  // (p2 B: and state.carryBow more, set in first person so the tread ahead shows under it), riding the chest; the hands
  // on the gunwales ahead of the yoke. hull: the hull's pivot (hull.js geometry, +x the bow), brought into the rig.
  // The owner, 2026-10-31 ("the items kind of just float at your sides, but your hands are up on the canoe"): a hand
  // with a thing in it (state.held) hangs at your side carrying it, and only the empty hands are on the gunwales; the
  // canoe rolls on the yoke by state.carryLean (balance.js: radians, + toward the right), and the stride rolls it more
  // with fewer hands on it.
  function carry(dt, hull) {
    updateIdle(idle, dt, false);
    const g = locomote(dt, true);
    standingBody(dt, g, true);
    // the yoke's pads on the shoulders, the bow up a little, riding the chest
    if (hull.parent !== rig) rig.attach(hull);
    const neck = J.neck.p, cq = J.chest.q;
    const yawC = 2 * Math.atan2(cq.y, cq.w) * 0.6;
    const padTop = sheerY(YOKE_X) + 0.0095;
    const shoulder = neck.y - 0.032;
    const lean = state.carryLean || 0, held = state.held || {};
    hull.position.set(neck.x - 0.02, shoulder + padTop, 0.06 * lean); // (rolling, it slides a little on the pads that way)
    const stg = state.stagger, wob = Math.sin(Math.PI * stg) * Math.sin(stg * 19);   // a stagger: the hull lurches and is caught
    // the stride's roll, more with no hand to damp it
    const free = (held.R ? 1 : 0) + (held.L ? 1 : 0), strideRoll = (0.015 + 0.01 * free) * Math.sin(Math.PI * 2 * g.phase) * g.mw;
    hull.rotation.set(Math.PI + strideRoll + 0.07 * wob + lean, yawC, 0.09 + (state.carryBow || 0) + 0.05 * Math.sin(Math.PI * stg) + 0.03 * Math.abs(lean), 'YZX');
    hull.updateMatrix();
    // a thing in a hand: that arm hangs and carries it
    const hang = ['L', 'R'].filter((k) => held[k]);
    if (hang.length) swingArms(g, hang);
    // the empty hands on the gunwales ahead of the yoke
    for (const [k, sg] of [['L', -1], ['R', 1]]) {
      if (held[k]) continue;
      const x = YOKE_X + 0.45, ys = sheerY(x) - 0.009, zg = outerAt(x, sheerY(x) - 0.002).z - 0.004;
      // hull space (upright) -> rig: the pivot is inverted, so the hull's port gunwale is on the paddler's right;
      // the fist closes round the gunwale itself
      const local = V(x, ys, -sg * zg);
      const target = local.applyMatrix4(hull.matrix);
      const axis = V(1, 0, 0).applyQuaternion(hull.quaternion);
      const sh = J['arm' + k].p;
      P.arm(k, target, axis, V(sh.x - 0.1, sh.y - 0.5, sh.z + sg * 0.5), V(0, 1, 0));
    }
    return g;
  }

  function heal() {
    Object.assign(loco, { init: false, air: false, phase: 0, hipY: HIP_H - 0.1, hipW: NaN, hipYaw: 0, stepping: false, moving: false, mw: 0, grade: 0, tilt: 0, want: HIP_H - 0.05 });
    for (const k of ['L', 'R']) Object.assign(loco.feet[k], { swing: false, s: 0, dur: 0.3, cyc: -1, planted: 1, slope: 0, pitch: 0 });
    crouchK = 0; wadeK = 0; mireK = 0;
  }

  return { loco, fq, tq, ankles, toWorld, toLocal, restLocal, flatDist, ankleAt, footFrameQ, reachOf, locomote, standingBody, swingArms, walk, carry, heal };
}

// a pose body for a figure (figure.js buildFigure) standing in rig, posed from state (canoe.state's shape: newState)
export function makeBody(fig, rig, state, { ground, terrain = null, life = null } = {}) {
  return { fig, P: fig.poser, J: fig.joints, paddler: fig.group, rig, state, idle: makeIdle(), ground, terrain, life, handsBusy: false };
}
// a fresh state of canoe.state's shape (canoe.js documents the fields)
export function newState(over = {}) {
  return {
    mode: 'walk', stroke: 0, side: 1, power: 0, drive: 0, turn: 0, hustle: false, speed: 0, cadence: 0, air: false, airT: 0, vy: 0,
    land: 0, stagger: 0, walk: 0, walkSpeed: 0, moveFwd: 0, moveLat: 0,
    gripT: V(0, 0, 0), bladeT: V(0, 0, 0), grip: V(0, 0.8, 0), blade: V(0, -0.2, 0.8),
    fishing: null, crouch: 0, held: null, carryBow: 0, ...over,
  };
}

// Sitting on a seat whose top is at world height top (as canoe.js poseSit, for a figure posed by its gait: co-op phase
// 3, a friend sitting on a bench, a stump, the latrine): the hips on the seat, the feet a knee's reach ahead on the
// ground, the hands on the knees, breathing. The figure is placed at the frame's origin.
const _sw = V(), _sl = V();
export function sitPose(me, gait, dt, top) {
  const { P, J, rig, idle, ground } = me;
  placeFigure(me, 0, 0, 0);
  updateIdle(idle, dt, true);
  const gy = ground(rig.position.x, rig.position.z), seat = Number.isFinite(top) ? top : gy + 0.45;
  const br = Math.sin(idle.breath), hipY = seat + 0.1 - rig.position.y;
  const pelvis = bodyQ(0, -0.05, 0), chest = bodyQ(idle.yaw * 0.15, 0.22 + 0.012 * br, 0), head = bodyQ(idle.yaw * 0.85, 0.02 - idle.pitch, 0);
  spine(P, V(-0.06, hipY + ROOT_UP, 0), pelvis, chest, head, { shrugL: 0.012 * br, shrugR: 0.012 * br });
  const h = rig.rotation.y;
  const above = hipY + rig.position.y - gy, reach = (LT + LS) * 0.93;
  const ahead = Math.min(0.45, Math.max(0.22, Math.sqrt(Math.max(0.04, reach * reach - above * above))));
  for (const [k, sg] of [['L', -1], ['R', 1]]) {
    const p = gait.toWorld(V(ahead, 0, sg * 0.16), _sw); p.y = ground(p.x, p.z);
    // the foot set there (canoe.js footTo)
    const yawW = h + sg * -0.12;
    gait.ankleAt(p, yawW, 0, gait.ankles[k]);
    const a = gait.toLocal(gait.ankles[k], _sl), yl = yawW - h;
    gait.footFrameQ(yawW, 0, gait.fq[k]);
    const hip = J['thigh' + k].p;
    const pole = V((hip.x + a.x) / 2 + Math.cos(yl) * 0.6, (hip.y + a.y) / 2, (hip.z + a.z) / 2 - Math.sin(yl) * 0.6 + sg * 0.1);
    P.leg(k, a.clone(), pole, gait.fq[k]);
    const knee = V(ahead - 0.06, hipY + 0.02 + 0.1 * (0.45 - ahead), sg * 0.16);
    const sh = J['arm' + k].p;
    P.arm(k, knee.add(V(-0.05, 0.06, -sg * 0.02)), V(0, 0, -sg), V(sh.x - 0.25, sh.y - 0.3, sh.z + sg * 0.3), V(0, -1, 0));
  }
  gait.loco.init = false;
}

// In the water (lifted from canoe.js poseSwim; co-op phase 3: a friend swimming is drawn swimming, actors.js): treading
// water when still (m 0), a breaststroke when moving (m 1); ph the swim's cycle phase (state.walk). The figure is placed
// first with its origin 0.15 under the surface; the body pitches forward as it swims, the head stays up.
const _qs = new THREE.Quaternion();
export function swimPose(me, m, ph) {
  const { P, J, idle } = me;
  const bob = 0.025 * Math.sin(ph * 2);
  const lean = lerp(0.18, 1.05, m);
  const pelvis = bodyQ(0, lean * 0.95, 0), chest = bodyQ(0, lean, 0.05 * Math.sin(ph));
  const head = bodyQ(idle.yaw * (1 - m), lean - lerp(0.25, 1.15, m), 0);
  // the neck just above the surface (the swimmer's origin is 0.15 under it)
  const neckH = 0.15 + 0.03 + bob;
  const spineLen = 1.495 - 0.975;
  const root = V(-Math.sin(lean) * spineLen, neckH - Math.cos(lean) * spineLen, 0);
  spine(P, root, pelvis, chest, head);
  // arms: sculling out to the sides when treading, a breaststroke sweep when swimming
  const cq = J.chest.q;
  const brA = ph % (Math.PI * 2) / (Math.PI * 2);
  for (const [k, sg] of [['L', -1], ['R', 1]]) {
    const sh = J['arm' + k].p;
    // treading: hands sweep in and out at shoulder depth
    const sc = Math.sin(ph * 2 + (k === 'L' ? 0 : 0.5));
    const tread = V(0.32 + 0.05 * sc, -0.12, sg * (0.42 + 0.12 * sc));
    // breaststroke: out-sweep, in-sweep under the chest, then shoot forward
    let bs;
    if (brA < 0.35) { const u = brA / 0.35; bs = V(0.55 - 0.15 * u, -0.05, sg * (0.12 + 0.38 * ease(u))); }
    else if (brA < 0.6) { const u = (brA - 0.35) / 0.25; bs = V(0.4 - 0.25 * u, -0.2 + 0.1 * u, sg * (0.5 - 0.38 * ease(u))); }
    else { const u = (brA - 0.6) / 0.4; bs = V(0.15 + 0.42 * ease(u), -0.1 + 0.05 * u, sg * 0.12); }
    const local = tread.lerp(bs, m);
    // in the chest's frame for the swimmer
    const target = sh.clone().add(local.applyQuaternion(_qs.copy(cq)));
    const pole = sh.clone().add(V(-0.2, -0.3, sg * 0.5).applyQuaternion(cq));
    P.arm(k, target, V(1, 0, 0).applyQuaternion(cq), pole, V(0, -1, 0));
  }
  // legs: a slow bicycle treading, a frog kick swimming
  for (const [k, sg] of [['L', -1], ['R', 1]]) {
    const hip = J['thigh' + k].p;
    const pq = J.root.q;
    const cyc = ph * 1.3 + (k === 'L' ? 0 : Math.PI);
    const tread = V(0.18 + 0.12 * Math.sin(cyc), -0.68 + 0.12 * Math.cos(cyc), sg * 0.16);
    // the frog kick, in the pelvis's frame: the heels drawn up with the knees out, then driven back together
    const kick = brA < 0.5 ? V(-0.12 * ease(brA / 0.5), -0.78 + 0.3 * ease(brA / 0.5), sg * (0.12 + 0.2 * ease(brA / 0.5))) : V(-0.12 + 0.12 * ease((brA - 0.5) / 0.5), -0.48 - 0.32 * ease((brA - 0.5) / 0.5), sg * (0.32 - 0.2 * ease((brA - 0.5) / 0.5)));
    const ankle = hip.clone().add(tread.lerp(kick, m).applyQuaternion(_qs.copy(pq)));
    const pole = hip.clone().add(V(0.6, -0.2, sg * 0.3).applyQuaternion(pq));
    const fwd = V(0.3, -1, 0).applyQuaternion(pq);
    P.leg(k, ankle, pole, frameQ(fwd, V(1, 0, 0).applyQuaternion(pq)));
  }
}

// The walker's timed moves (lifted from canoe.js, co-op phase 3 round 2, so a friend's vault and climb are drawn with the
// player's own): makeMoves(me, gait) → { vault(dt, m), climb(dt, m), done() }. m is player.js's player.move ({ kind, u, from,
// to, top, nearD, far, heading, t }); the figure is placed at the frame's origin, which rides the move's path (the feet's
// height + 0.1). done() when neither is running, so the next one notes its start afresh.
export function makeMoves(me, gait) {
  const { P, J, rig, idle } = me;
  const ground = me.ground;
  const { loco, fq, ankles, toWorld, toLocal, ankleAt, footFrameQ, flatDist } = gait;
  // The walker's moves (player.js player.move, read through api.moveOf): a vault over a log, a climb onto a rock or a
  // ledge, and sitting. player.js drives the body's path (the rig: the feet's height plus 0.1, along from -> to); these
  // pose the limbs on it from world places that stay put while the body passes: the hand on the log, the hands on the
  // edge, the feet where they push off and land. Each is a few keys per part over the move's u (0..1), run through a
  // smooth curve. A step up is the gait's own (locomote: the swinging knee lifted over the edge); a hop, a fall and a
  // landing are the air pose (state.air, state.land); wading is the walk with the knees high and the arms out.
  // track: a value through keys [[u, v], ...]: a cubic through each key, flat at the two ends
  function track(u, K) {
    const n = K.length;
    if (u <= K[0][0]) return K[0][1];
    if (u >= K[n - 1][0]) return K[n - 1][1];
    let i = 0;
    while (u > K[i + 1][0]) i++;
    const u0 = K[i][0], p0 = K[i][1], u1 = K[i + 1][0], p1 = K[i + 1][1], h = u1 - u0, t = (u - u0) / h;
    const m0 = i > 0 ? ((p1 - K[i - 1][1]) / (u1 - K[i - 1][0])) * h : 0;
    const m1 = i + 2 < n ? ((K[i + 2][1] - p0) / (K[i + 2][0] - u0)) * h : 0;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
  }
  // the same through world points [[u, Vector3], ...]
  const _kx = [], _ky = [], _kz = [];
  function trackV(u, K, out) {
    _kx.length = _ky.length = _kz.length = K.length;
    for (let i = 0; i < K.length; i++) { _kx[i] = [K[i][0], K[i][1].x]; _ky[i] = [K[i][0], K[i][1].y]; _kz[i] = [K[i][0], K[i][1].z]; }
    return out.set(track(u, _kx), track(u, _ky), track(u, _kz));
  }
  // the move's own frame in the world: its way (f), its right (r), a point `along` metres on from `from`, `side` to the
  // right, at height y
  const mvF = { fx: 1, fz: 0, rx: 0, rz: 1, L: 0, ox: 0, oz: 0 };
  function moveFrame(m) {
    const dx = m.to.x - m.from.x, dz = m.to.z - m.from.z, L = Math.hypot(dx, dz);
    const h = Number.isFinite(m.heading) ? m.heading : rig.rotation.y;
    mvF.fx = L > 0.05 ? dx / L : Math.cos(h); mvF.fz = L > 0.05 ? dz / L : -Math.sin(h);
    mvF.rx = -mvF.fz; mvF.rz = mvF.fx; mvF.L = L; mvF.ox = m.from.x; mvF.oz = m.from.z;
    mvF.yaw = Math.atan2(-mvF.fz, mvF.fx);
  }
  const mvAt = (along, side, y, out = V()) => out.set(mvF.ox + mvF.fx * along + mvF.rx * side, y, mvF.oz + mvF.fz * along + mvF.rz * side);
  // a timed move's start: where the feet were (they push off from there), kept until the kind changes
  const moveStart = { kind: null, feet: { L: V(), R: V() } };
  function noteMoveStart(m) {
    if (moveStart.kind === m.kind && moveStart.t0 <= m.t) { moveStart.t0 = m.t; return; }
    moveStart.kind = m.kind; moveStart.t0 = m.t;
    for (const k of ['L', 'R']) {
      const f = loco.feet[k];
      if (loco.init && Number.isFinite(f.pos.x) && flatDist(f.pos, rig.position) < 1.2) moveStart.feet[k].copy(f.pos);
      else mvAt(0, k === 'L' ? -0.11 : 0.11, m.from.y, moveStart.feet[k]);
    }
  }
  // limbs to world places: a foot (its ankle over the sole's point p, yawed `yaw`, pitched) and a hand (the fist at p,
  // its grip along `axis`, the palm toward `palm`)
  const _wa = V(), _wb = V(), _wc = V();
  function footTo(k, p, yawW, pitch, kneeOut = 0.05) {
    ankleAt(p, yawW, pitch, ankles[k]);
    const a = toLocal(ankles[k], _wa), sg = k === 'L' ? -1 : 1, yl = yawW - rig.rotation.y;
    footFrameQ(yawW, pitch, fq[k]);
    const hip = J['thigh' + k].p;
    const pole = _wb.set((hip.x + a.x) / 2 + Math.cos(yl) * 0.6, (hip.y + a.y) / 2, (hip.z + a.z) / 2 - Math.sin(yl) * 0.6 + sg * kneeOut);
    P.leg(k, a.clone(), pole, fq[k]);
  }
  function handTo(k, pWorld, axisL, palmL, poleOff) {
    const t = toLocal(pWorld, _wc), sh = J['arm' + k].p, sg = k === 'L' ? -1 : 1;
    P.arm(k, t.clone(), axisL, V(sh.x + poleOff.x, sh.y + poleOff.y, sh.z + sg * poleOff.z), palmL);
  }
  // a hand's free place (local): from its shoulder, hanging by the hip, or (up) out to the side for balance
  const freeHand = (k, out, up = 0) => { const sg = k === 'L' ? -1 : 1, sh = J['arm' + k].p; return out.set(sh.x + 0.06 + 0.06 * up, sh.y - 0.56 + 0.36 * up, sh.z + sg * (0.08 + 0.4 * up)); };
  const _h0 = V(), _h1 = V(), _hw = V();

  // A vault over a log or a low rock: the left hand on its top, the body over it leaning on that hand with the legs
  // tucked and swung across on the right, then down on the far side, the knees giving on the landing.
  function vault(dt, m) {
    placeFigure(me, 0, 0, 0);
    updateIdle(idle, dt, false);
    noteMoveStart(m); moveFrame(m);
    const u = sat(m.u), top = m.top ?? m.from.y + 0.7, L = Math.max(0.6, mvF.L);
    const nearD = m.nearD ?? L * 0.32, far = m.far >= 0 ? m.far : nearD + 0.4, mid = (nearD + far) / 2;
    const g0 = m.from.y, g1 = m.to.y;
    const yOff = mvF.yaw - rig.rotation.y; // the body keeps to the move's way whatever the view does
    // the hips (world height) through take-off, over, and the landing
    const hipW = track(u, [[0, g0 + 0.83], [0.08, g0 + 0.72], [0.2, g0 + 0.84], [0.45, top + 0.24], [0.7, g1 + 0.72], [0.84, g1 + 0.6], [1, g1 + 0.83]]);
    const lean = track(u, [[0, 0.1], [0.08, 0.3], [0.25, 0.62], [0.45, 0.75], [0.65, 0.4], [0.84, 0.35], [1, 0.05]]);
    const side = track(u, [[0, 0], [0.2, -0.2], [0.45, -0.48], [0.65, -0.25], [0.85, 0], [1, 0]]);
    const twist = track(u, [[0, 0], [0.25, -0.2], [0.48, -0.5], [0.72, -0.15], [1, 0]]);
    const root = V(0.04 * lean, hipW - rig.position.y + ROOT_UP, -0.06 * side);
    const pelvis = bodyQ(yOff + twist, 0.05 + lean * 0.4, side * 0.6);
    const chest = bodyQ(yOff + twist * 0.35, lean, side);
    const head = bodyQ(yOff, 0.1 + lean * 0.25 - 0.25 * smooth(0.1, 0.4, u) * (1 - smooth(0.6, 0.85, u)), side * 0.3);
    spine(P, root, pelvis, chest, head);
    // the feet: the left pushes off where it stood, the right drives up; both tucked over the top on the right; down
    // beside each other on the far side
    const fL = trackV(u, [[0, moveStart.feet.L], [0.12, moveStart.feet.L], [0.3, mvAt(nearD + 0.05, 0.25, top + 0.15, _h0)], [0.45, mvAt(mid + 0.1, 0.38, top + 0.15, _h1)], [0.6, mvAt(far + 0.15, 0.3, top + 0.05, _hw)], [0.78, mvAt(L - 0.06, -0.11, g1, V())], [1, mvAt(L, -0.11, g1, V())]], V());
    const fR = trackV(u, [[0, moveStart.feet.R], [0.1, mvAt(0.3, 0.16, g0 + 0.35, V())], [0.28, mvAt(nearD + 0.15, 0.36, top + 0.22, V())], [0.45, mvAt(mid + 0.2, 0.48, top + 0.2, V())], [0.6, mvAt(far + 0.25, 0.4, top + 0.08, V())], [0.78, mvAt(L + 0.06, 0.11, g1, V())], [1, mvAt(L, 0.11, g1, V())]], V());
    for (const [k, p] of [['L', fL], ['R', fR]]) {
      const gy = ground(p.x, p.z);
      if (p.y < gy) p.y = gy;
      const air = smooth(0.08, 0.18, u) * (1 - smooth(0.74, 0.84, u));
      footTo(k, p, mvF.yaw + (k === 'L' ? 0.08 : -0.08) + 0.5 * air, -0.45 * air, 0.05 + 0.25 * air);
    }
    // the left hand on the top, the right out for balance
    const plant = smooth(0.03, 0.17, u) * (1 - smooth(0.58, 0.7, u));
    const logP = mvAt(mid + 0.12, -0.15, top + 0.035, _h0);
    const free = toWorld(freeHand('L', _h1, smooth(0.6, 0.8, u) * (1 - smooth(0.85, 1, u))), _hw);
    const hL = V().lerpVectors(free, logP, plant);
    handTo('L', hL, V(mvF.rx, 0, mvF.rz).applyAxisAngle(V(0, 1, 0), -rig.rotation.y), V(0, -1, 0), { x: -0.25, y: -0.1, z: 0.45 });
    const up = smooth(0.1, 0.32, u) * (1 - smooth(0.78, 0.98, u));
    const cq = J.chest.q, sh = J.armR.p;
    const tR = freeHand('R', V(), up);
    P.arm('R', tR, V(1, 0, -0.15).applyQuaternion(cq), V(sh.x - 0.3, sh.y - 0.2, sh.z + 0.3), V(0, 0, -1).applyQuaternion(cq));
    loco.hipW = NaN; // the gait takes the hips up afresh after
  }

  // A climb onto a rock or a ledge (up to about 2 m): the hands up onto the edge, the feet walked up the face; the right
  // foot up onto the top with the body bent over the edge, the hands pushing; then standing up and stepping in.
  function climb(dt, m) {
    placeFigure(me, 0, 0, 0);
    updateIdle(idle, dt, false);
    noteMoveStart(m); moveFrame(m);
    const u = sat(m.u), top = m.top ?? m.to.y, L = Math.max(0.3, mvF.L), g0 = m.from.y, rise = Math.max(0.3, top - g0);
    const face = m.nearD ?? Math.max(0.25, L - 0.45); // the face, metres on from where he began
    const yOff = mvF.yaw - rig.rotation.y;
    // the hips: a dip to spring, pulled up off the hands with the feet on the face, pressed up over the edge on straight
    // arms, the foot on the top under them, then standing
    const hangC = top - Math.min(0.95, 0.6 * rise); // where player.js has the feet at the hang (u 0.35)
    const pull = Math.max(g0 + 0.85, Math.min(top - 0.2, hangC + 0.62));
    const hipW = track(u, [[0, g0 + 0.83], [0.14, g0 + 0.76], [0.35, pull], [0.55, Math.max(pull + 0.05, top + 0.05)], [0.72, top + 0.3], [0.87, top + 0.62], [1, m.to.y + 0.83]]);
    const hipA = track(u, [[0, 0], [0.35, face - 0.4], [0.55, face - 0.18], [0.72, face + 0.04], [1, L]]); // back off the face, then over it
    const hipP = mvAt(hipA, 0, hipW, _h0), hl = toLocal(hipP, _h1);
    const lean = track(u, [[0, 0.1], [0.14, 0.22], [0.35, 0.12], [0.55, 0.62], [0.72, 0.85], [0.88, 0.45], [1, 0.05]]);
    const root = V(hl.x, hl.y + ROOT_UP, hl.z);
    const look = -0.35 * smooth(0.05, 0.25, u) * (1 - smooth(0.5, 0.7, u)); // eyes up at the edge while hanging
    spine(P, root, bodyQ(yOff, 0.05 + lean * 0.5, 0), bodyQ(yOff, lean, 0), bodyQ(yOff, lean * 0.4 + look, 0));
    // the feet: on the face (toes to it) as the body hangs; the right up onto the top; the left after it; both on the top
    const onFace = (k, y) => mvAt(face - 0.17, k === 'L' ? -0.13 : 0.13, Math.min(y, top - 0.12), V());
    const fy0 = Math.max(g0, Math.min(hangC + 0.05, top - 0.25));
    const fL = trackV(u, [[0, moveStart.feet.L], [0.2, onFace('L', g0 + rise * 0.25)], [0.4, onFace('L', fy0)], [0.7, onFace('L', fy0 + 0.1)], [0.86, mvAt(face + 0.3, -0.12, top + 0.12, V())], [1, mvAt(L, -0.11, m.to.y, V())]], V());
    const fR = trackV(u, [[0, moveStart.feet.R], [0.25, onFace('R', g0 + rise * 0.4)], [0.42, onFace('R', fy0 + 0.15)], [0.55, mvAt(face - 0.05, 0.13, top + 0.2, V())], [0.68, mvAt(face + 0.22, 0.13, top, V())], [0.88, mvAt(face + 0.22, 0.13, top, V())], [1, mvAt(L, 0.11, m.to.y, V())]], V());
    for (const [k, p, onTop] of [['L', fL, smooth(0.86, 0.95, u)], ['R', fR, smooth(0.62, 0.7, u)]]) {
      const gy = ground(p.x, p.z);
      if (p.y < gy - 0.02 && onTop > 0.5) p.y = gy;
      const wall = 1 - onTop;
      footTo(k, p, mvF.yaw + (k === 'L' ? 0.08 : -0.08), 0.35 * wall * smooth(0.1, 0.3, u), 0.12 * wall + 0.05);
    }
    // the hands: up to the edge from the sides, on it until he stands, then down again
    const on = smooth(0.04, 0.2, u) * (1 - smooth(0.8, 0.96, u));
    const axis = V(mvF.rx, 0, mvF.rz).applyAxisAngle(V(0, 1, 0), -rig.rotation.y);
    for (const k of ['L', 'R']) {
      const sg = k === 'L' ? -1 : 1;
      const edge = mvAt(face + 0.1, sg * 0.24, top + 0.035, _h0);
      const free = toWorld(freeHand(k, _h1, 0.6 * (1 - smooth(0.85, 1, u))), _hw);
      handTo(k, V().lerpVectors(free, edge, on), axis, V(0, -1, 0), { x: -0.3, y: -0.25, z: 0.4 });
    }
    loco.hipW = NaN;
  }

  return { vault, climb, done() { moveStart.kind = null; }, moveStart };
}

// Co-op phase 3 round 2: the arms at a held job, eating, drinking and the camera up, for a figure its gait has posed (a
// friend, actors.js), laid over the gait's arms in the figure's own space; w 0..1 how far into it (eased in and out by
// the caller), t seconds into it (the work's rhythm). kind:
//   'saw'    the right hand drawing the saw back and forth low ahead, the left holding the log
//   'douse'  both hands ahead at the chest, tipping water out
//   'pitch'  both hands low ahead, working in turn (stakes, poles, the fly: a tent or a tarp)
//   'hang'   hand over hand on a rope over the head (the barrel up or down)
//   'work'   any other held job: as 'pitch'
//   'eat', 'drink'  the right hand up to the mouth and down again (about 1.6 s)
//   'photo'  both hands up at the face, round the camera
const _wt = V(), _wh = V();
export function workArms(me, kind, t, w = 1) {
  const { P, J } = me;
  const hd = J.head.p, TAU = Math.PI * 2;
  for (const [k, sg] of [['L', -1], ['R', 1]]) {
    const sh = J['arm' + k].p;
    // where the hand hangs at rest (as canoe.js freeHand), blended toward the job's place by w
    const hang = _wh.set(sh.x + 0.06, sh.y - 0.56, sh.z + sg * 0.08);
    let axis = V(1, 0, 0), palm = V(0, 0, -sg), pole = V(sh.x - 0.25, sh.y - 0.35, sh.z + sg * 0.35);
    let k2 = w;
    switch (kind) {
      case 'saw':
        if (k === 'R') _wt.set(sh.x + 0.42 + 0.13 * Math.sin(t * TAU * 1.4), sh.y - 0.42, sh.z - 0.05);
        else { _wt.set(sh.x + 0.36, sh.y - 0.5, sh.z + 0.12); palm = V(0, -1, 0); }
        break;
      case 'douse':
        _wt.set(sh.x + 0.38, sh.y - 0.18 + 0.03 * Math.sin(t * 3), sh.z - sg * 0.12); axis = V(0, 0, 1);
        break;
      case 'hang':
        _wt.set(sh.x + 0.14, sh.y + 0.32 + 0.16 * Math.sin(t * 3.2 + (k === 'L' ? Math.PI : 0)), sh.z - sg * 0.1); axis = V(0, 1, 0); palm = V(1, 0, 0);
        pole = V(sh.x - 0.1, sh.y - 0.2, sh.z + sg * 0.45);
        break;
      case 'eat': case 'drink':
        if (k === 'L') { k2 = 0; break; }
        // up over the first third of a second and a half, held at the mouth, then down
        k2 = w * smooth(0, 0.35, t) * (1 - smooth(1.2, 1.6, t));
        _wt.set(hd.x + 0.13, hd.y - (kind === 'drink' ? 0.02 : 0.07) + 0.012 * Math.sin(t * 14), hd.z + 0.03); axis = kind === 'drink' ? V(0, 1, 0) : V(0, 0, 1); palm = V(-1, 0, 0);
        pole = V(sh.x - 0.1, sh.y - 0.35, sh.z + 0.3);
        break;
      case 'photo':
        _wt.set(hd.x + 0.15, hd.y - 0.03, hd.z + sg * 0.07); axis = V(0, 1, 0);
        pole = V(sh.x - 0.05, sh.y - 0.35, sh.z + sg * 0.3);
        break;
      case 'push': // r2 2: both hands forward and down on a gunwale, shoving (a party's stern pushing the canoe off)
        _wt.set(sh.x + 0.5 + 0.05 * Math.sin(t * 2.4), sh.y - 0.52, sh.z - sg * 0.06); palm = V(1, 0, 0);
        break;
      default: // 'pitch', 'work'
        _wt.set(sh.x + 0.4, sh.y - 0.55 + 0.07 * Math.sin(t * 5 + (k === 'L' ? Math.PI : 0)), sh.z + sg * 0.1);
        palm = V(0, -1, 0);
    }
    if (k2 <= 0.001) continue;
    P.arm(k, V().lerpVectors(hang, _wt, k2), axis, pole, palm);
  }
}
