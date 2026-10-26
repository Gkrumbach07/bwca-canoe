// p2 A: the pose lift's gate. Builds the player's canoe rig (src/canoe.js of the tree given) in plain Node and drives its
// `state` through a scripted sequence the way player.js writes it: paddling (the J, the switch across, the shift, sweeps,
// a back stroke, rest), the rod up in the canoe, the carry (a stagger, hills, a step), walking (turns, side-steps, a
// back-step, settling), jogging, a hop, a crouch, a hand holding something, the rod up on foot, sitting, wading, a vault,
// a climb, a swim and the climb back in, the hull set down and picked up, the packs moved. Every frame records every
// bone (quaternion and position), the figure's place, the hull, the paddle, the packs, the hat, the grip and blade, the
// cadence and the first-person eye. Math.random is seeded, so a run is exactly repeatable.
//   node scripts/poses/record.mjs <tree root> <out.json>
// Before and after a change to the poses (the tree before: git archive <commit> src | tar -x -C <dir>, with a
// node_modules link in <dir>), then compare.mjs: the lift of 2026-10-26 (p2 A) matched to 0 over all 5,820 frames.
// game-record.js is the same in the game (the real player.js and keys, through a test driver's page eval).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const out = process.argv[3];
// a seeded Math.random (mulberry32), before anything is imported
let seed = 0x9e3779b9;
Math.random = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const THREE = await import(path.join(root, 'node_modules/three/build/three.module.js'));
const { buildCanoeRig } = await import(path.join(root, 'src/canoe.js'));

const c = buildCanoeRig({});
const scene = new THREE.Scene();
scene.add(c.rig);
const st = c.state, rig = c.rig;
// the ground: a rolling hill, a 0.12 m step (a tread), a steep bank
const G = (x, z) => 0.6 * Math.sin(x * 0.11) + 0.35 * Math.cos(z * 0.13 + 0.4) + (x > 46 && x < 52 ? 0.12 : 0) + (z > 30 ? 0.42 * (z - 30) : 0);
c.ground = G; c.terrain = (x, z) => 0.6 * Math.sin(x * 0.11) + 0.35 * Math.cos(z * 0.13 + 0.4) + (z > 30 ? 0.42 * (z - 30) : 0);
let move = null;
c.moveOf = () => move;
const viewer = { position: new THREE.Vector3(0, 100, 0) };
c.viewer = viewer;

// the scripted walker / paddler, as player.js writes the state
const P = { x: 0, z: 0, heading: 0.3, level: 0, strokeCount: 0, bob: 0, footY: 0, fx: 0, fz: 0 };
const ease = (a, b, k) => a + (b - a) * k;
function paddleFrame(dt, { fwd = 0, turn = 0, hustle = false, rod = null }) {
  const paddling = fwd !== 0 || turn !== 0;
  st.drive = fwd; st.hustle = hustle;
  const rate = hustle ? 1.35 : 0.95, biased = Math.abs(turn) > 0.15;
  if (paddling || st.stroke > 0.02) {
    const prev = st.stroke;
    st.stroke = (st.stroke + dt * rate * (fwd < 0 ? 0.8 : 1)) % 1;
    if (prev < 0.5 && st.stroke >= 0.5 && !biased && (P.strokeCount + 1) % 7 === 0) st.side *= -1;
    if (st.stroke < prev) P.strokeCount++;
    if (!paddling && st.stroke < prev) st.stroke = 0;
  }
  if (biased) st.side = turn > 0 ? 1 : -1;
  st.turn = turn;
  st.power += ((paddling ? 1 : 0) - st.power) * (1 - Math.exp(-dt * 6));
  const v = fwd > 0 ? (hustle ? 1.8 : 1.3) : fwd < 0 ? -0.5 : 0;
  P.heading += turn * 0.5 * dt;
  P.x += Math.cos(P.heading) * v * dt; P.z -= Math.sin(P.heading) * v * dt;
  st.fishing = rod;
  const roll = st.side * st.power * 0.035 * Math.sin(st.stroke * Math.PI * 2);
  rig.position.set(P.x, 0.15 + 0.01 * Math.sin(P.x), P.z);
  rig.rotation.set(0, P.heading, 0);
  rig.rotateZ(-0.01); rig.rotateX(roll);
  st.mode = 'paddle'; st.speed = Math.abs(v);
}
function footFrame(dt, { mode = 'walk', speed = 0, dir = 0, turn = 0, hustle = false, air = null, crouch = 0, held = null, rod = null, stagger = 0 }) {
  // dir: the way the legs go, relative to the heading (0 ahead, ±π/2 a side-step, π back)
  P.heading += turn * dt;
  const ang = P.heading + dir;
  P.x += Math.cos(ang) * speed * dt; P.z -= Math.sin(ang) * speed * dt;
  const moved = Math.hypot(P.x - P.fx, P.z - P.fz), raw = dt > 0 && moved < 1 ? Math.min(5, moved / dt) : 0;
  P.fx = P.x; P.fz = P.z;
  st.speed += (raw - st.speed) * (1 - Math.exp(-dt * 12));
  const striding = raw > 0.12;
  st.walkSpeed += ((striding ? 1 : 0) - st.walkSpeed) * (1 - Math.exp(-dt * 8));
  st.walk += raw * dt * 4.2;
  st.hustle = hustle;
  const kd = 1 - Math.exp(-dt * 10);
  st.moveFwd += ((striding ? Math.cos(dir) : 0) - st.moveFwd) * kd; st.moveLat += ((striding ? -Math.sin(dir) : 0) - st.moveLat) * kd;
  const g = G(P.x, P.z);
  if (air) { st.air = true; st.airT = air.t; st.vy = air.vy; P.footY = g + air.h; } else { st.air = false; P.footY = g; }
  st.land = Math.max(0, (st.land || 0) - dt * 3);
  st.stagger = stagger || Math.max(0, (st.stagger || 0) - dt * 1.6);
  st.crouch = crouch; st.held = held; st.fishing = rod;
  rig.position.set(P.x, P.footY + 0.1, P.z);
  rig.rotation.set(0, P.heading, 0);
  st.mode = mode;
}

// the rod's hands (fishing.js shape), rig space, moving a little
const rodHands = (t, foot) => {
  const y = foot ? 1.25 : 0.55, x = foot ? 0.35 : -1.25;
  return { L: new THREE.Vector3(x + 0.05 + 0.03 * Math.sin(t * 3), y - 0.05, -0.12), R: new THREE.Vector3(x + 0.12, y + 0.02 * Math.cos(t * 2), 0.1),
    dir: new THREE.Vector3(1, 0.5, 0.1).normalize(), up: new THREE.Vector3(0, 1, 0), knobAxis: new THREE.Vector3(0, 0, -1), yaw: 0.3 * Math.sin(t), lean: 0.05 * Math.cos(t * 0.7), look: 0.4 };
};

// the record
const frames = [];
const bones = c.figure.mesh.skeleton.bones;
const names = { rig: c.rig, hull: c.hull, scene, chest: c.figure.bones.chest, head: c.figure.bones.head };
const parentOf = (o) => { for (const [k, v] of Object.entries(names)) if (o.parent === v) return k; return o.parent ? o.parent.name || o.parent.type : 'none'; };
const eyeOut = new THREE.Vector3();
let fp = false, frameN = 0;
function record(dt, label) {
  c.setFirstPerson(fp);
  c.update(dt);
  const eye = c.eye(eyeOut, 0.2 * Math.sin(frameN * 0.01), -0.2, dt).toArray();
  viewer.position.set(fp ? eye[0] : 0, fp ? eye[1] : 100, fp ? eye[2] : 0);
  const f = [];
  for (const b of bones) f.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w, b.position.x, b.position.y, b.position.z);
  const pd = c.paddler;
  f.push(...pd.position.toArray(), ...pd.quaternion.toArray());
  f.push(...c.hull.position.toArray(), ...c.hull.quaternion.toArray());
  f.push(...c.paddle.position.toArray(), ...c.paddle.quaternion.toArray(), c.paddle.visible ? 1 : 0);
  for (const m of c.packs) f.push(...m.position.toArray(), ...m.quaternion.toArray(), m.visible ? 1 : 0);
  f.push(...c.figure.hat.position.toArray(), ...c.figure.hat.quaternion.toArray());
  f.push(...st.grip.toArray(), ...st.blade.toArray(), st.cadence || 0);
  f.push(...eye, c.figure.bones.neck.scale.x, c.rig.userData.foam.visible ? 1 : 0);
  frames.push({ l: label, f, s: [parentOf(c.hull), parentOf(c.paddle), ...c.packs.map(parentOf), parentOf(c.figure.hat)].join(',') });
  frameN++;
}
const run = (n, dt, label, fn) => { for (let i = 0; i < n; i++) { fn(i, dt); record(dt, label); } };
const DT = 1 / 60;

// --- the sequence -------------------------------------------------------------------------------------------------
st.mode = 'paddle'; c.setHullPacks(2);
run(60, DT, 'paddle rest', (i, dt) => paddleFrame(dt, {}));
run(420, DT, 'paddle forward (switches)', (i, dt) => paddleFrame(dt, { fwd: 1 }));
run(180, DT, 'paddle hustle', (i, dt) => paddleFrame(dt, { fwd: 1, hustle: true }));
run(120, 1 / 30, 'paddle at 30 fps', (i, dt) => paddleFrame(dt, { fwd: 1 }));
run(120, DT, 'sweep left', (i, dt) => paddleFrame(dt, { turn: 1 }));
run(120, DT, 'sweep right (switch)', (i, dt) => paddleFrame(dt, { turn: -1 }));
run(90, DT, 'forward turning', (i, dt) => paddleFrame(dt, { fwd: 1, turn: 0.6 }));
run(150, DT, 'back paddle', (i, dt) => paddleFrame(dt, { fwd: -1 }));
run(90, DT, 'paddle to rest', (i, dt) => paddleFrame(dt, {}));
fp = true;
run(120, DT, 'rod up in the canoe (first person)', (i, dt) => paddleFrame(dt, { rod: rodHands(i * dt, false) }));
run(60, DT, 'paddle first person', (i, dt) => paddleFrame(dt, { fwd: 1 }));
fp = false;
run(30, DT, 'paddle rest 2', (i, dt) => paddleFrame(dt, {}));
// ashore with the canoe overhead: a carry over the hill and the step
st.packOnBack = 0; st.packOnChest = 1;
P.fx = P.x; P.fz = P.z;
run(30, DT, 'carry start', (i, dt) => footFrame(dt, { mode: 'carry' }));
run(300, DT, 'carry walking', (i, dt) => footFrame(dt, { mode: 'carry', speed: 1.25, turn: 0.15 * Math.sin(i * 0.02) }));
run(60, DT, 'carry stagger', (i, dt) => footFrame(dt, { mode: 'carry', speed: 0.8, stagger: i === 0 ? 1 : 0 }));
P.x = 40; P.z = 0; P.fx = P.x; P.fz = P.z; P.heading = 0;
run(240, DT, 'carry over the step', (i, dt) => footFrame(dt, { mode: 'carry', speed: 1.3 }));
run(60, DT, 'carry stop', (i, dt) => footFrame(dt, { mode: 'carry' }));
c.dropHull(P.x + 1.5, G(P.x + 1.5, P.z), P.z, P.heading, 0.1);
st.packOnBack = 0; st.packOnChest = null;
run(60, DT, 'walk standing', (i, dt) => footFrame(dt, {}));
run(240, DT, 'walk', (i, dt) => footFrame(dt, { speed: 1.35, turn: 0.3 * Math.sin(i * 0.03) }));
run(90, DT, 'walk turn in place', (i, dt) => footFrame(dt, { turn: 1.2 }));
run(120, DT, 'side-step right', (i, dt) => footFrame(dt, { speed: 1.0, dir: -Math.PI / 2 }));
run(120, DT, 'side-step left', (i, dt) => footFrame(dt, { speed: 1.0, dir: Math.PI / 2 }));
run(120, DT, 'back-step', (i, dt) => footFrame(dt, { speed: 0.9, dir: Math.PI }));
run(60, DT, 'stand', (i, dt) => footFrame(dt, {}));
P.x = 10; P.z = 20; P.fx = P.x; P.fz = P.z; P.heading = -Math.PI / 2; // up the steep bank (z > 30)
run(360, DT, 'walk up the bank', (i, dt) => footFrame(dt, { speed: 1.2 }));
P.heading = Math.PI / 2;
run(300, DT, 'walk down the bank', (i, dt) => footFrame(dt, { speed: 1.2 }));
run(240, DT, 'jog', (i, dt) => footFrame(dt, { speed: 2.9, hustle: true, turn: 0.2 }));
run(60, DT, 'jog to walk', (i, dt) => footFrame(dt, { speed: 1.35 }));
// a hop: up and down again
run(40, DT, 'hop', (i, dt) => { const t = i * dt, vy = 3.2 - 9.8 * t, h = Math.max(0, 3.2 * t - 4.9 * t * t); footFrame(dt, { speed: 1.35, air: h > 0 || i < 3 ? { t, vy, h } : null }); if (i === 39) st.land = 0.6; });
run(60, DT, 'landing', (i, dt) => footFrame(dt, { speed: 1.35 }));
run(30, DT, 'stop', (i, dt) => footFrame(dt, {}));
run(120, DT, 'crouch', (i, dt) => footFrame(dt, { crouch: 1 }));
run(60, DT, 'up from the crouch', (i, dt) => footFrame(dt, {}));
run(120, DT, 'walk, a hand holding', (i, dt) => footFrame(dt, { speed: 1.35, held: { L: true } }));
run(30, DT, 'stand 2', (i, dt) => footFrame(dt, {}));
fp = true;
run(150, DT, 'rod up on foot (first person)', (i, dt) => footFrame(dt, { rod: rodHands(i * dt, true), turn: 0.3 * Math.sin(i * 0.05) }));
run(60, DT, 'walk first person', (i, dt) => footFrame(dt, { speed: 1.35 }));
fp = false;
// sitting (player.move 'sit'), then up
move = { kind: 'sit', top: G(P.x, P.z) + 0.45, t: 0, dur: 0, u: 0 };
run(150, DT, 'sit', (i, dt) => { move.t += dt; footFrame(dt, {}); });
move = null;
run(60, DT, 'stand up', (i, dt) => footFrame(dt, {}));
move = { kind: 'wade', t: 0, dur: 0, u: 0 };
run(120, DT, 'wade', (i, dt) => { move.t += dt; footFrame(dt, { speed: 0.9 }); });
move = null;
// a vault and a climb (canoe.js keeps these; they read the gait's feet)
{
  const fx = P.x, fz = P.z, h = P.heading, g0 = G(fx, fz), to = { x: fx + Math.cos(h) * 1.6, z: fz - Math.sin(h) * 1.6 };
  move = { kind: 'vault', t: 0, dur: 0.9, u: 0, from: { x: fx, y: g0, z: fz }, to: { x: to.x, y: G(to.x, to.z), z: to.z }, top: g0 + 0.6, heading: h };
  run(54, DT, 'vault', (i, dt) => { move.t += dt; move.u = move.t / move.dur; const k = Math.min(1, move.u); P.x = fx + (to.x - fx) * k; P.z = fz + (to.z - fz) * k; footFrame(dt, {}); });
  move = null;
  run(30, DT, 'after the vault', (i, dt) => footFrame(dt, {}));
  const cx = P.x, cz = P.z, c0 = G(cx, cz), ct = { x: cx + Math.cos(h) * 1.0, z: cz - Math.sin(h) * 1.0 };
  move = { kind: 'climb', t: 0, dur: 1.6, u: 0, from: { x: cx, y: c0, z: cz }, to: { x: ct.x, y: c0 + 1.3, z: ct.z }, top: c0 + 1.3, heading: h };
  run(96, DT, 'climb', (i, dt) => { move.t += dt; move.u = move.t / move.dur; const k = Math.min(1, move.u); P.x = cx + (ct.x - cx) * k; P.z = cz + (ct.z - cz) * k; footFrame(dt, {}); rig.position.y = c0 + 1.3 * k + 0.1; });
  move = null;
  run(40, DT, 'after the climb', (i, dt) => footFrame(dt, {}));
}
// back to the canoe: picked up, a carry, then a swim and the climb back in
c.pickUpHull(); st.packOnBack = undefined; c.setHullPacks([0, 1]);
run(90, DT, 'carry again (no packs.js)', (i, dt) => footFrame(dt, { mode: 'carry', speed: 1.2 }));
c.setPackGround(1, { x: P.x + 1, y: G(P.x + 1, P.z), z: P.z, heading: 0.4 });
c.setHullPacks([0]);
run(30, DT, 'a pack on the ground', (i, dt) => footFrame(dt, { mode: 'carry' }));
st.mode = 'swim'; st.swimHull = true; st.swimSide = 1; st.swimHeading = P.heading;
run(120, DT, 'swim treading', (i, dt) => { c.swimmer.set(P.x, 0, P.z + 1); st.walk += dt * 2; st.walkSpeed += (0 - st.walkSpeed) * 0.1; rig.position.set(P.x, 0.05, P.z); rig.rotation.set(0, P.heading, 0); });
run(120, DT, 'swim stroke', (i, dt) => { c.swimmer.set(P.x + i * 0.01, 0, P.z + 1); st.walk += dt * 3; st.walkSpeed += (1 - st.walkSpeed) * 0.1; });
st.mode = 'paddle'; st.climb = 1.4; st.climbSide = 1; st.swimHull = false; st.stroke = 0; st.power = 0;
run(100, DT, 'climb back in', (i, dt) => { rig.position.set(P.x, 0.15, P.z); rig.rotation.set(0, P.heading, 0); });
run(120, DT, 'paddle after', (i, dt) => paddleFrame(dt, { fwd: 1 }));

fs.writeFileSync(out, JSON.stringify({ n: frames.length, frames }));
console.log('recorded', frames.length, 'frames,', frames[0].f.length, 'numbers each, to', out);
process.exit(0);
