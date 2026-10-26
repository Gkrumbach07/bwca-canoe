// p2 A: the pose lift's in-game gate (page side, through the driver). The real player.js drives the real rig with real
// keys (the input's own held set), the whole frame (__game.advance) run synchronously with the clocks frozen to the
// frames, Math.random seeded and the soundscape held, so nothing outside the sequence changes it; every frame records
// what rig-record.mjs records. arg: { block: 'water' | 'foot' | 'carry', seed }
const g = window.__game, A = window.__arg || {}, p = g.player, c = g.canoe, inp = p.input, st = c.state;
const realNow = performance.now, realDateNow = Date.now, realRandom = Math.random, realTick = g.audio.tick;
let fake = 5e6, seed = A.seed || 0x5eed;
performance.now = () => fake; Date.now = () => 1.78e12 + fake;
Math.random = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
g.audio.tick = () => {};
// the swat at the bugs and the bear's moment pose the arms over the figure's own pose, on timers carried from before the
// record: held, so what is recorded is canoe.js's pose alone
const realSwat = g.bugs && g.bugs.afterPose, realBear = g.bear && g.bear.afterPose;
if (g.bugs) g.bugs.afterPose = () => {};
if (g.bear) g.bear.afterPose = () => {};
c.heal(); // the pose's own easing (the idle's breath, the feet) from a clean start
const bones = c.figure.mesh.skeleton.bones, frames = [];
const names = { rig: c.rig, hull: c.hull, scene: g.scene, chest: c.figure.bones.chest, head: c.figure.bones.head };
const parentOf = (o) => { for (const [k, v] of Object.entries(names)) if (o.parent === v) return k; return o.parent ? o.parent.name || o.parent.type : 'none'; };
const eyeOut = new g.THREE.Vector3();
const keys = (...ks) => { inp.down.clear(); for (const k of ks) inp.down.add(k); };
const DT = 1 / 60;
function frame(label) {
  fake += DT * 1000;
  g.advance(DT, 1);
  const f = [];
  for (const b of bones) f.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w, b.position.x, b.position.y, b.position.z);
  const pd = c.paddler;
  f.push(...pd.position.toArray(), ...pd.quaternion.toArray());
  f.push(...c.hull.position.toArray(), ...c.hull.quaternion.toArray());
  f.push(...c.paddle.position.toArray(), ...c.paddle.quaternion.toArray(), c.paddle.visible ? 1 : 0);
  for (const m of c.packs) f.push(...m.position.toArray(), ...m.quaternion.toArray(), m.visible ? 1 : 0);
  f.push(...c.figure.hat.position.toArray(), ...c.figure.hat.quaternion.toArray());
  f.push(...st.grip.toArray(), ...st.blade.toArray(), st.cadence || 0);
  f.push(...g.camera.position.toArray(), c.figure.bones.neck.scale.x, c.rig.userData.foam.visible ? 1 : 0);
  frames.push({ l: label, f, s: [parentOf(c.hull), parentOf(c.paddle), ...c.packs.map(parentOf), parentOf(c.figure.hat), p.mode].join(',') });
}
const run = (n, label, ks) => { keys(...ks); for (let i = 0; i < n; i++) frame(label); };
let err = null;
try {
  if (A.block === 'water') {
    run(30, 'still', []);
    run(360, 'W', ['KeyW']);
    run(180, 'W shift', ['KeyW', 'ShiftLeft']);
    run(120, 'A', ['KeyA']);
    run(120, 'D', ['KeyD']);
    run(90, 'W A', ['KeyW', 'KeyA']);
    run(120, 'S', ['KeyS']);
    run(90, 'rest', []);
  } else if (A.block === 'foot') {
    run(30, 'still', []);
    run(240, 'W', ['KeyW']);
    run(60, 'W D', ['KeyW', 'KeyD']);
    run(180, 'W shift', ['KeyW', 'ShiftLeft']);
    run(40, 'stop', []);
    run(90, 'A (side)', ['KeyA']);
    run(90, 'S (back)', ['KeyS']);
    run(60, 'still 2', []);
    run(120, 'W again', ['KeyW']);
    run(30, 'end', []);
  } else if (A.block === 'carry') {
    run(30, 'still', []);
    run(600, 'W', ['KeyW']);
    run(60, 'stop', []);
    run(240, 'W 2', ['KeyW']);
    run(30, 'end', []);
  }
} catch (e) { err = String(e && e.stack || e); }
keys();
performance.now = realNow; Date.now = realDateNow; Math.random = realRandom; g.audio.tick = realTick;
if (g.bugs) g.bugs.afterPose = realSwat;
if (g.bear) g.bear.afterPose = realBear;
return { n: frames.length, frames, err, at: { x: p.x, z: p.z, mode: p.mode } };
