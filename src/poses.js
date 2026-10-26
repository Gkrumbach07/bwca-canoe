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
  const k = damp(still ? 3.2 : 6, dt);
  idle.yaw += ((still ? idle.glanceYaw : 0) - idle.yaw) * k;
  idle.pitch += ((still ? idle.glancePitch : 0) - idle.pitch) * k;
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
    if (!loco.init || loco.air || rig.position.distanceTo(loco.rigPos) > 1.5) { initFeet(); loco.air = false; }
    loco.rigPos.copy(rig.position); loco.h = rig.rotation.y;
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
    if (carry) { c = 0.55 + 0.3 * v; fs = 0.6; clear = 0.05 + 0.02 * sp; }
    else {
      // the jog upright, the knee lifting lightly: a shorter flight and a lower swing than the sprinter's it had been
      c = lerp(0.6 + 0.24 * v, 1.2 + 0.08 * v, jog);
      fs = lerp(lerp(0.58, 0.5, hustle), 0.36, jog);
      clear = lerp(0.06 + 0.05 * sp + 0.03 * hustle, 0.16, jog) + 0.12 * wadeK;
    }
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
      let worst = null, wv = 1;
      for (const k of ['L', 'R']) {
        const f = F[k], d = flatDist(f.pos, toWorld(restLocal(k), _v3)) / SETTLE.dist;
        const y = Math.abs(wrapPi(f.yaw - (h + (k === 'L' ? 0.08 : -0.08)))) / SETTLE.yaw;
        const e = Math.max(d, y);
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
    crouchK += ((carry || g.air ? 0 : state.crouch || 0) - crouchK) * damp(5, dt);
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
    const swayZ = lerp(0.014 * Math.sin(idle.shift), -0.024 * sp * Math.sin(twoPi * (phi - 0.03)), mw);
    const roll = lerp(-0.025 * Math.sin(idle.shift), 0.06 * sp * Math.sin(twoPi * (phi - 0.03)), mw);
    const pYaw = -0.11 * sp * Math.cos(twoPi * phi) * (g.backF ? -1 : 1);
    // the jog upright: a few degrees forward of the walk, no more
    const lean = (carry ? 0.1 : 0.03) + mw * (g.backF ? -0.05 : 0.045 * g.sp + 0.025 * g.hustle + 0.035 * g.jog + SLOPE.lean * smooth(0.05, SLOPE.full, loco.grade)) + 0.01 * Math.sin(idle.breath) + 0.07 * wadeK
      + 0.12 * ease(state.land) + (g.air ? 0.06 : 0) + 0.1 * Math.sin(Math.PI * state.stagger) + 0.45 * ck;
    const fy = fz ? 0.35 * (fz.yaw || 0) : 0, fl = fz ? 0.6 * (fz.lean || 0) : 0, fh = fz ? -0.18 * (fz.look || 0) : 0;
    const pelvis = bodyQ(yaw + pYaw + 0.25 * fy, 0.03 + lean * 0.3, roll);
    const chest = bodyQ(-0.6 * pYaw + idle.yaw * 0.15 + fy, lean + fl, -0.4 * roll + 0.04 * g.mz * sp);
    const head = bodyQ(idle.yaw * 0.85 + (fz ? 0.5 * (fz.yaw || 0) - 0.5 * fy : 0), (carry ? 0.22 : 0.02) - idle.pitch + 0.15 * lean + 0.2 * ck + fh, 0);
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

  // arms hanging and swinging against the legs; the elbows bend more as the pace picks up
  function swingArms(g) {
    const phi = g.phase, mw = g.mw, sp = g.sp * mw, jog = g.jog * mw;
    // jogging, the arms are carried bent at about a right angle, a little forward, and swing higher
    const A = lerp(0.32 + 0.22 * sp + 0.12 * g.hustle, 0.56, jog) * mw * (1 - 0.6 * Math.abs(g.mz)) * (g.backF ? 0.6 : 1);
    const bend = lerp(0.32 + 0.25 * sp + 0.5 * g.hustle, 1.55, jog) + (g.air ? 0.5 : 0) + 0.4 * ease(state.land);
    // crouched, the hands go down in front of the knees, working a little in turn (picking, gathering, the fire)
    const ck = ease(crouchK), work = 0.12 * ck * Math.sin(idle.breath * 7);
    const fwd = 0.04 + 0.12 * jog + (g.air ? 0.25 * g.tuck : 0) + 0.75 * ck;
    const cq = J.chest.q;
    for (const [k, sg] of [['L', -1], ['R', 1]]) {
      // a hand carrying something (stream A's state.held: the bucket, the tackle box, the rod) hangs straighter and swings less
      const held = state.held && state.held[k] ? 1 : 0;
      const sw = A * (1 - 0.6 * held) * (k === 'L' ? -1 : 1) * Math.cos(Math.PI * 2 * phi) + fwd * (1 - 0.5 * held) + (k === 'L' ? work : -work) * (1 - held);
      const sh = J['arm' + k].p;
      const du = V(Math.sin(sw), -Math.cos(sw), sg * (0.13 + 0.55 * wadeK)).normalize().applyQuaternion(cq);
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
    wadeK += ((moveKind === 'wade' ? 1 : 0) - wadeK) * damp(4, dt);
    const g = locomote(dt, false);
    standingBody(dt, g, false, fz);
    if (fz) rodArms(body, fz); else swingArms(g);
  }

  // the canoe overhead: the same feet under a heavier, shorter gait; the yoke's pads on the shoulders, the bow up a little
  // (p2 B: and state.carryBow more, set in first person so the tread ahead shows under it), riding the chest; the hands
  // on the gunwales ahead of the yoke. hull: the hull's pivot (hull.js geometry, +x the bow), brought into the rig.
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
    hull.position.set(neck.x - 0.02, shoulder + padTop, 0);
    const stg = state.stagger, wob = Math.sin(Math.PI * stg) * Math.sin(stg * 19);   // a stagger: the hull lurches and is caught
    hull.rotation.set(Math.PI + 0.015 * Math.sin(Math.PI * 2 * g.phase) * g.mw + 0.07 * wob, yawC, 0.09 + (state.carryBow || 0) + 0.05 * Math.sin(Math.PI * stg), 'YZX');
    hull.updateMatrix();
    // hands on the gunwales ahead of the yoke
    for (const [k, sg] of [['L', -1], ['R', 1]]) {
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
    crouchK = 0; wadeK = 0;
  }

  return { loco, fq, tq, ankles, toWorld, toLocal, restLocal, flatDist, ankleAt, footFrameQ, reachOf, locomote, standingBody, swingArms, walk, carry, heal };
}

// a pose body for a figure (figure.js buildFigure) standing in rig, posed from state (canoe.state's shape: newState)
export function makeBody(fig, rig, state, { ground, terrain = null } = {}) {
  return { fig, P: fig.poser, J: fig.joints, paddler: fig.group, rig, state, idle: makeIdle(), ground, terrain };
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
