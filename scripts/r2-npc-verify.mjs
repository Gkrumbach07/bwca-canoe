// r2 verify (NPC motion, adversarial): watch the people as the owner did on a first pass and measure what is DRAWN (the
// skinned bones in the world against tiles.groundAt), not what the gait meant: a busy store (Moose Lake 25, July) over
// three game hours, a party camp's evening, a party loading and paddling away beside you, a party's portage carry, and
// the people on the steepest ground of all of them.
//   npx vite --port 5223 --strictPort &   APP=http://localhost:5223 node scripts/r2-npc-verify.mjs [--shots dir]   (ONLY=store|camp|launch|carry)
// Per figure each frame: the lower ankle's height over the ground (sunk under 3 cm; floating over 22 cm standing), the
// hips' height (half sat: under 0.62 m standing upright), a knee bent backward, the body's tilt, its jump a frame, frozen
// idle (6 s of next to no bone change), and the pool of light (aimed at a few: at the feet, not the middle of the body).
// Hulls near: roll and pitch jerk a frame (fighting the waves), yaw-rate steps, sideslip.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, openGame, seasonAt, step, log } from './gl-e-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg('shots', null) ? path.resolve(arg('shots')) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const YEAR = 2026, DOY = 192, DT = 1 / 30, ONLY = process.env.ONLY || '';
const report = {};

const PROBE = () => {
  const g = window.__game, T = g.tiles, THREE = g.THREE;
  const G = (x, z) => T.groundAt(x, z);
  const slope = (x, z) => Math.hypot(G(x + 0.5, z) - G(x - 0.5, z), G(x, z + 0.5) - G(x, z - 0.5));
  const A = new THREE.Vector3(), B = new THREE.Vector3(), K = new THREE.Vector3(), H = new THREE.Vector3(), R = new THREE.Vector3(), Q = new THREE.Quaternion(), U = new THREE.Vector3(), F = new THREE.Vector3();
  const shown = (o) => { for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === g.scene) return true; } return false; };
  const prev = new Map(), prevQ = new Map(), still = new Map(), ids = new WeakMap(); let idN = 0;
  const DTF = 1 / 30;
  const S = {};
  const keep = (arr, v, max = 12) => { arr.push(v); arr.sort((a, b) => b.v - a.v); if (arr.length > max) arr.length = max; };
  function figs() {
    const out = [];
    for (const b of g.npcs.bodies) {
      if (!b.who || b.lent || !b.rig || !shown(b.group)) continue;
      const v = b.who.person, f = v.figs[b.who.fig]; if (!f) continue;
      const sp = f.spec || {};
      out.push({ key: `npc:${v.key}#${b.who.fig}`, who: v.name || v.key, fig: b.fig, src: String(v.key).startsWith('party') || v.party ? 'camp' : 'store', pose: sp.pose, floor: b.floorY != null, crouch: sp.pose === 'stoop', sit: sp.pose === 'sit', walking: !!(f.path && f.path.length) || sp.pose === 'walk', sc: b.sc || 1, x: f.x, z: f.z, body: b, fo: f });
    }
    for (const p of g.actors.people) {
      const Bd = p.bind; if (!Bd || Bd.kind !== 'foot' || !Bd.body || !Bd.body.fig || !shown(Bd.body.fig.group)) continue;
      out.push({ key: `party:${p.key}`, who: p.name || p.key, fig: Bd.body.fig, src: p.mode === 'carry' ? 'carry' : 'party', pose: p.mode, floor: p.footY != null, crouch: !!(p.anim && p.anim.crouch > 0.25), sit: false, walking: p.mode === 'walk' || p.mode === 'carry' || p.v > 0.15, sc: Bd.s || 1, x: p.x, z: p.z, ref: p });
    }
    return out;
  }
  function reset() { Object.assign(S, { air: [], slipEv: [], yawEv: [], frames: 0, figFrames: 0, sunk: [], float: [], half: [], knee: [], tilt: [], jump: [], frozen: new Set(), dbg: [], perSrc: {}, hull: { rollJ: 0, pitchJ: 0, yawStep: 0, slip: 0, n: 0 } }); prev.clear(); prevQ.clear(); still.clear(); }
  reset();
  let lastTag = null;
  function frame(tag = '') {
    S.frames++;
    if (tag !== lastTag) { prev.clear(); prevQ.clear(); lastTag = tag; }
    const seen = new Set();
    for (const f of figs()) {
      S.figFrames++; seen.add(f.key);
      const bn = f.fig.bones; f.fig.group.updateWorldMatrix(true, true);
      let lo = Infinity, inv = 0;
      bn.root.getWorldPosition(R); bn.root.getWorldQuaternion(Q); F.set(1, 0, 0).applyQuaternion(Q); F.y = 0; F.normalize();
      for (const k of ['L', 'R']) {
        bn['thigh' + k].getWorldPosition(H); bn['shin' + k].getWorldPosition(K); bn['foot' + k].getWorldPosition(A);
        lo = Math.min(lo, A.y - G(A.x, A.z));
        B.copy(H).add(A).multiplyScalar(0.5); inv = Math.min(inv, K.sub(B).dot(F));
      }
      const ph = R.y - G(R.x, R.z), sl = slope(R.x, R.z);
      U.set(0, 1, 0).applyQuaternion(Q); const tilt = Math.acos(Math.min(1, U.y)) * 57.3;
      const pv = prev.get(f.key); const jump = pv ? Math.hypot(R.x - pv.x, R.y - pv.y, R.z - pv.z) : 0; prev.set(f.key, R.clone());
      const q = []; for (const n of ['spine', 'chest', 'head', 'armL', 'armR', 'foreL', 'foreR', 'thighL', 'thighR', 'root']) { const b = bn[n]; q.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w); }
      const pq = prevQ.get(f.key); let dq = 0; if (pq) for (let i = 0; i < q.length; i++) dq += Math.abs(q[i] - pq[i]); prevQ.set(f.key, q);
      const sc = f.sc, at = { who: f.who, src: f.src, pose: f.pose, slope: +sl.toFixed(2), tag, x: +R.x.toFixed(1), z: +R.z.toFixed(1) };
      const ps = S.perSrc[f.src] || (S.perSrc[f.src] = { n: 0, sunk: 0, float: 0, half: 0, knee: 0, steep: 0, steepMax: 0 }); ps.n++; if (sl > 0.45) ps.steep++; ps.steepMax = Math.max(ps.steepMax, +sl.toFixed(2));
      if (!f.floor && !f.sit) {
        if (lo < 0.03 * sc) { ps.sunk++; keep(S.sunk, { v: +(0.085 * sc - lo).toFixed(3), ...at }); }
        if (lo < -0.3 && f.body && S.dbg.length < 12) { const b = f.body, fo = f.fo, gl = b.gait.loco; S.dbg.push({ who: f.who, pose: f.pose, lo: +lo.toFixed(2), ph: +ph.toFixed(2), fy: +fo.y.toFixed(2), gF: +G(fo.x, fo.z).toFixed(2), floorY: b.floorY, rig: b.rig.position.toArray().map((v) => +v.toFixed(2)), fxz: [+fo.x.toFixed(2), +fo.z.toFixed(2)], path: fo.path ? fo.path.length : 0, sc: b.sc, feet: ['L', 'R'].map((k) => { const q = gl.feet[k]; return [+(q.pos.x * b.sc).toFixed(2), +(q.pos.y * b.sc).toFixed(2), +(q.pos.z * b.sc).toFixed(2), q.swing ? 1 : 0, +G(q.pos.x * b.sc, q.pos.z * b.sc).toFixed(2)]; }), init: gl.init, tag }); }
        if (lo < -0.3 && f.ref && S.dbg.length < 12) { const a = f.ref, L = [...g.moves.active.values()].find((x) => x.persons.includes(a)), i = L ? L.persons.indexOf(a) : -1; S.dbg.push({ who: f.who, lo: +lo.toFixed(2), ph: +ph.toFixed(2), mode: a.mode, y: +a.y.toFixed(2), footY: a.footY, gT: +G(a.x, a.z).toFixed(2), gRoot: +G(R.x, R.z).toFixed(2), rootY: +R.y.toFixed(2), anim: a.anim, seg: L && L.seg ? L.seg.kind : null, step: L && L.steps ? L.steps.get(i) : null, xz: [+a.x.toFixed(2), +a.z.toFixed(2)], rxz: [+R.x.toFixed(2), +R.z.toFixed(2)], frameIsRoot: a.bind.frame === a.bind.root, rootPos: a.bind.root.position.toArray().map((v) => +v.toFixed(2)), framePos: a.bind.frame.position.toArray().map((v) => +v.toFixed(2)), s: a.bind.s, parent: a.bind.root.parent && a.bind.root.parent.name }); }
        if (!f.walking && lo > 0.22 * sc) { ps.float++; keep(S.float, { v: +lo.toFixed(3), ...at }); }
        if (!f.crouch && !f.walking && ph < 0.62 * sc) { ps.half++; keep(S.half, { v: +(0.9 * sc - ph).toFixed(3), ph: +ph.toFixed(2), ...at }); }
      }
      // walking in the air: on a 'floor' (the drawn feet well over the ground) where there is none: a camp has no floors;
      // in a store's yard, a floor more than 0.12 m over the ground away from the store, its porch and its dock
      if (f.floor && f.body && f.walking) { const lift = f.body.floorY - G(f.fo.x, f.fo.z); if (lift > 0.15) keep(S.air || (S.air = []), { v: +lift.toFixed(2), ...at }); if (f.src === 'camp') ps.campAir = (ps.campAir || 0) + 1; }
      if (!f.sit && inv < -0.04) { ps.knee++; keep(S.knee, { v: +(-inv).toFixed(3), ...at }); }
      if (!f.sit && tilt > 10) keep(S.tilt, { v: +tilt.toFixed(1), ...at });
      if (jump > 0.3) keep(S.jump, { v: +jump.toFixed(2), ...at });
      const st = still.get(f.key) || { t: 0, s: 0 };
      if (f.walking || f.sit) { st.t = 0; st.s = 0; } else { st.t++; st.s += dq; if (st.t >= 180) { if (st.s / st.t < 0.0015) S.frozen.add(`${f.who} (${f.src} ${f.pose})`); st.t = 0; st.s = 0; } }
      still.set(f.key, st);
    }
    for (const k of [...prev.keys()]) if (!k.startsWith('boat:') && !seen.has(k)) { prev.delete(k); prevQ.delete(k); still.delete(k); } // (a figure not drawn this frame: its next jump not counted)
    const bs = g.actors.boats || [];
    bs.forEach((b, i) => {
      if (b.hidden || !b.root || !shown(b.root) || !(b.dist < 300)) return;
      if (!ids.has(b)) ids.set(b, ++idN); const k = `boat:${ids.get(b)}`, pv = prev.get(k); void i;
      if (pv) {
        S.hull.n++;
        S.hull.rollJ = Math.max(S.hull.rollJ, Math.abs((b.roll - pv.roll) - pv.droll));
        S.hull.pitchJ = Math.max(S.hull.pitchJ, Math.abs((b.pitch - pv.pitch) - pv.dpitch));
        if (b.sim && b.simOn) { const ys = Math.abs(b.sim.yawRate - pv.yr); S.hull.yawStep = Math.max(S.hull.yawStep, ys); if (ys > 0.04) keep(S.yawEv || (S.yawEv = []), { v: +ys.toFixed(3), tag, hold: !!(b.ext && b.ext.hold), dist: Math.round(b.dist), spd: +b.sim.speed.toFixed(2), boost: +b.sim.boost.toFixed(1) }, 6); }
        const dx = b.x - pv.x, dz = b.z - pv.z, sp = Math.hypot(dx, dz) / DTF;
        if (sp > 1.5) { const e = Math.abs(Math.atan2(Math.sin(Math.atan2(-dz, dx) - b.heading), Math.cos(Math.atan2(-dz, dx) - b.heading))); S.hull.slip = Math.max(S.hull.slip, +(e * 57.3).toFixed(1)); if (e > 0.5) keep(S.slipEv || (S.slipEv = []), { st: hs(b), v: +(e * 57.3).toFixed(0), sp: +sp.toFixed(1), simOn: !!b.simOn, hold: !!(b.ext && b.ext.hold), extV: b.ext ? +(b.ext.v || 0).toFixed(1) : null, crew: b.crew.length, tag, dist: Math.round(b.dist), x: +b.x.toFixed(1), z: +b.z.toFixed(1), shore: +g.world.shoreAt(b.x, b.z).toFixed(1) }, 8); }
        if (Math.hypot(dx, dz) > 0.8) keep(S.jump, { v: +Math.hypot(dx, dz).toFixed(2), who: k, src: 'hull', tag, dist: Math.round(b.dist), before: pv.st, now: hs(b) });
      }
      // the hull in the ground: the bank's ground over her keel (bow, middle, stern) above her waterline
      { const fx = Math.cos(b.heading), fz = -Math.sin(b.heading); let e = -Infinity; for (const a of [-2.2, 0, 2.2]) e = Math.max(e, G(b.x + fx * a, b.z + fz * a) - b.y); if (e > (S.hull.inGround || 0)) { S.hull.inGround = +e.toFixed(2); S.hull.inGroundAt = { tag, x: +b.x.toFixed(1), z: +b.z.toFixed(1), sim: !!b.simOn, hold: !!(b.ext && b.ext.hold) }; } }
      prev.set(k, { st: hs(b), x: b.x, z: b.z, roll: b.roll, pitch: b.pitch, droll: pv ? b.roll - pv.roll : 0, dpitch: pv ? b.pitch - pv.pitch : 0, yr: b.sim ? b.sim.yawRate : 0 });
    });
  }
  const hs = (b) => ({ simOn: !!b.simOn, hidden: !!b.hidden, gd: b.ext ? +Math.hypot(b.ext.x - b.x, b.ext.z - b.z).toFixed(1) : null, eV: b.ext ? +(b.ext.v || 0).toFixed(2) : null, cr: b.ext ? +(b.ext.cruise || 0).toFixed(2) : null, hold: !!(b.ext && b.ext.hold), spd: b.sim ? +b.sim.speed.toFixed(2) : null, boost: b.sim ? +b.sim.boost.toFixed(2) : null, goff: !!b.goff, crew: b.crew.length, h: +b.heading.toFixed(2), eh: b.ext ? +b.ext.heading.toFixed(2) : null });
  function run(n, tag, dt = DTF) { for (let i = 0; i < n; i++) { g.step(dt, 1); frame(tag); } }
  function summary() { return { frames: S.frames, figFrames: S.figFrames, perSrc: S.perSrc, sunk: S.sunk, float: S.float, half: S.half, knee: S.knee, tilt: S.tilt, jump: S.jump, frozen: [...S.frozen], hull: S.hull, dbg: S.dbg, air: S.air || [], slipEv: S.slipEv || [], yawEv: S.yawEv || [] }; }
  // aim the dot at a figure from where the player stands and read the pool of light against its drawn feet
  function ring(key) {
    const f = figs().find((x) => x.key === key); if (!f) return null;
    const p = g.player, ch = g.chase, bn = f.fig.bones;
    if (p.mode === 'walk') { const dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz) || 1; p.x = f.x + (dx / d) * 1.7; p.z = f.z + (dz / d) * 1.7; if (p.placeOnGround) p.placeOnGround(); g.step(DTF, 2); }
    f.fig.group.updateWorldMatrix(true, true); bn.head.getWorldPosition(H); bn.footL.getWorldPosition(A); bn.footR.getWorldPosition(B);
    g.camera.getWorldPosition(K);
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, cy = (H.y + Math.min(A.y, B.y)) / 2;
    ch.viewYaw = Math.atan2(-(mz - K.z), mx - K.x); ch.forwardYaw = ch.viewYaw; ch.viewPitch = Math.atan2(cy - K.y, Math.hypot(mx - K.x, mz - K.z));
    for (let i = 0; i < 4; i++) g.step(DTF, 1);
    const t = g.pointer.target; if (!t || t.kind !== 'person') return { key, hit: false, kind: t ? t.kind : null, d: +Math.hypot(mx - p.x, mz - p.z).toFixed(1), on: g.pointer.on, mode: p.mode, talking: !!(g.dialogue && g.dialogue.talking) };
    const m = g.pointer.glow.matrix.elements, gx = m[12], gy = m[13], gz = m[14];
    f.fig.group.updateWorldMatrix(true, true); bn.footL.getWorldPosition(A); bn.footR.getWorldPosition(B); bn.root.getWorldPosition(R);
    const sole = Math.min(A.y, B.y) - 0.085 * f.sc;
    return { key, hit: true, label: t.label, dxz: +Math.hypot(gx - (A.x + B.x) / 2, gz - (A.z + B.z) / 2).toFixed(2), dSole: +(gy - sole).toFixed(3), hipsOverPool: +(R.y - gy).toFixed(2), slope: +slope(R.x, R.z).toFixed(2) };
  }
  window.__v = { figs: () => figs().map((f) => ({ key: f.key, who: f.who, src: f.src, pose: f.pose, floor: f.floor, x: f.x, z: f.z, slope: slope(f.x, f.z) })), frame, run, summary, reset, ring, slope, G };
};

const browser = await launch();
const shotN = { n: 0 };
async function shot(page, name) { if (!SHOTS) return; await page.screenshot({ path: path.join(SHOTS, `v-${String(shotN.n++).padStart(2, '0')}-${name}.png`) }); }
// a close look through a long lens at (x, y, z) from where the camera is (the fov narrowed for the one frame)
async function zoomShot(page, name, at, fov = 18) {
  if (!SHOTS) return;
  await page.evaluate(({ at, fov }) => { const g = window.__game, c = g.camera, ch = g.chase, e = new g.THREE.Vector3(); c.getWorldPosition(e); ch.viewYaw = Math.atan2(-(at.z - e.z), at.x - e.x); ch.forwardYaw = ch.viewYaw; ch.viewPitch = Math.atan2(at.y + 0.8 - e.y, Math.hypot(at.x - e.x, at.z - e.z)); window.__fov = c.fov; c.fov = fov; c.updateProjectionMatrix(); g.step(1 / 600, 1); }, { at, fov });
  await shot(page, name);
  await page.evaluate(() => { const c = window.__game.camera; c.fov = window.__fov; c.updateProjectionMatrix(); });
}
// the player on foot at (x, z) looking at (tx, tz), first person
async function standAt(page, x, z, tx, tz, pitch = -0.12) {
  await tp(page, x, z);
  await page.evaluate(async ({ x, z, tx, tz, pitch }) => {
    const g = window.__game, p = g.player;
    if (p.mode !== 'walk' && p.stepOut) { p.stepOut(); g.step(1 / 30, 10); }
    p.x = x; p.z = z; if (p.placeOnGround) p.placeOnGround();
    g.chase.setMode('first'); const ch = g.chase; ch.viewYaw = Math.atan2(-(tz - z), tx - x); ch.forwardYaw = ch.viewYaw; ch.viewPitch = pitch; p.heading = ch.viewYaw;
    g.step(1 / 30, 30);
  }, { x, z, tx, tz, pitch });
}
const summ = async (page, name) => { const s = await page.evaluate(() => window.__v.summary()); report[name] = s; log(name, JSON.stringify({ frames: s.frames, figFrames: s.figFrames, perSrc: s.perSrc, frozen: s.frozen, hull: s.hull })); for (const k of ['sunk', 'float', 'half', 'knee', 'tilt', 'jump', 'air', 'slipEv', 'yawEv', 'dbg']) if (s[k].length) log(`  ${k}:`, JSON.stringify(s[k].slice(0, 5))); await page.evaluate(() => window.__v.reset()); return s; };
// a teleport, the frames stepped while its tiles load (never an await on a stopped page)
async function tp(page, x, z) {
  await page.evaluate(({ x, z }) => { const g = window.__game; window.__tpDone = false; g.player.teleport(x, z).finally(() => { window.__tpDone = true; }); }, { x, z });
  for (let k = 0; k < 600 && !(await page.evaluate(() => window.__tpDone)); k++) await page.evaluate(() => window.__game.step(1 / 30, 3));
  await page.evaluate(() => window.__game.step(1 / 30, 20));
}
const party = (page, id) => page.evaluate(({ id }) => { const L = [...window.__game.moves.active.values()].find((x) => x.plan.id === id); return !!(L && L.st && L.persons.length); }, { id });

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); ctx.setDefaultNavigationTimeout(300000); ctx.setDefaultTimeout(900000);
  const page = await openGame(browser, { quiet: true, ctx });
  await seasonAt(page, { ep: 25, year: YEAR, doy: DOY, hours: 7.4 });
  await page.evaluate(PROBE);
  await page.evaluate(() => window.__game.renderer.setAnimationLoop(null));

  // --- the store, three game hours ------------------------------------------------------------------------------------
  if (!ONLY || ONLY === 'store') {
    const t0 = Date.now(); const rings = [];
    log('store geometry', JSON.stringify(await page.evaluate(() => { const L = window.__game.outfitter.visit.L, r = (q) => q && { x: +q.x.toFixed(1), z: +q.z.toFixed(1), y: q.y != null ? +q.y.toFixed(2) : null }; return { centre: r(L.centre), floorY: L.floorY, door: r(L.door), steps: r(L.stepsFoot), dockFoot: r(L.dockFoot), dockDeck: r(L.dockDeck) }; })));
    // 3 game hours at the one clock (x8): 1350 real s. Watched every frame in 12 windows of 45 s (one each quarter hour of
    // game time), the time between stepped at 1/10 s frames (the same sim, coarser)
    for (let w = 0; w < 12; w++) {
      const h = await page.evaluate(() => window.__game.day.hours);
      if (w % 3 === 0) {
        const at = await page.evaluate(({ w }) => {
          const g = window.__game, fs = window.__v.figs().filter((f) => !f.floor), L = g.outfitter.visit.L; let bx = L.dockFoot.x, bz = L.dockFoot.z;
          if (fs.length) { let best = -1; for (const f of fs) { const n = fs.filter((o) => Math.hypot(o.x - f.x, o.z - f.z) < 6).length; if (n > best) { best = n; bx = f.x; bz = f.z; } } }
          for (let k = 0; k < 16; k++) { const a = w * 1.3 + 0.6 + k * 0.45, x = bx + Math.cos(a) * 9, z = bz + Math.sin(a) * 9; if (g.world.shoreAt(x, z) > 1) return { x, z, tx: bx, tz: bz, n: fs.length }; }
          return { x: bx + 6, z: bz, tx: bx, tz: bz, n: fs.length };
        }, { w });
        await standAt(page, at.x, at.z, at.tx, at.tz, -0.1);
      }
      await page.evaluate(() => window.__v.run(30, 'settle'));
      for (let k = 0; k < 9; k++) { await page.evaluate(({ h }) => window.__v.run(150, `store ${h.toFixed(2)}`), { h }); if (k === 4 && w % 2 === 0) await shot(page, `store-${h.toFixed(1)}`); }
      if (rings.length < 10) {
        const fs = await page.evaluate(() => window.__v.figs());
        for (const f of fs.sort((a, b) => b.slope - a.slope).slice(0, 2)) { const r = await page.evaluate((k) => window.__v.ring(k), f.key); if (r) { rings.push(r); if (r.hit && rings.filter((x) => x.hit).length <= 2) await shot(page, `store-ring-${r.slope}`); } }
      }
      await step(page, Math.round((15 * 60 / 8 - 45) / 0.1), 0.1, 300);
    }
    report.storeRings = rings;
    log('store: rings', JSON.stringify(rings));
    await summ(page, 'store');
    log('store: watched in', ((Date.now() - t0) / 1000).toFixed(0), 's real');
  }

  // --- a party camp: its unloading, the evening, the fire ----------------------------------------------------------------
  if (!ONLY || ONLY === 'camp') {
    const c = await page.evaluate(({ YEAR, DOY }) => {
      const g = window.__game, P = g.parties; g.day.setClock(YEAR, DOY, 7.4); const T = P.today, out = [];
      for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl || pl.to.kind !== 'site' || pl.arrive < 12 || pl.arrive > 17.5) continue; out.push({ id: pl.id, arrive: pl.arrive, to: { x: pl.to.x, z: pl.to.z }, size: party.size, d: Math.hypot(pl.to.x - g.player.x, pl.to.z - g.player.z) }); }
      out.sort((a, b) => (b.size >= 3) - (a.size >= 3) || a.d - b.d); return out[0] || null;
    }, { YEAR, DOY });
    log('camp:', JSON.stringify(c));
    if (c) {
      await page.evaluate(({ c, YEAR, DOY }) => window.__game.day.setClock(YEAR, DOY, c.arrive + 0.6), { c, YEAR, DOY }); await tp(page, c.to.x, c.to.z);
      for (const [hh, tag] of [[c.arrive + 0.7, 'unload'], [18.6, 'evening'], [20.2, 'fire']]) {
        await page.evaluate(({ hh, YEAR, DOY }) => { const g = window.__game; g.day.setClock(YEAR, DOY, hh); g.step(1 / 30, 150); }, { hh, YEAR, DOY });
        const fs = await page.evaluate(({ pid }) => { const D = [...window.__game.partyCamps.drawn.values()].find((d) => d.party.id === pid); return D ? D.v.figs.filter(Boolean).map((f) => ({ x: f.x, z: f.z })) : []; }, { pid: c.id.split('#')[0] });
        log(`camp ${tag}: the camp's figures`, fs.length, JSON.stringify(await page.evaluate(() => window.__game.partyCamps.stats())).slice(0, 400));
        if (fs.length) {
          const mx = fs.reduce((a, f) => a + f.x, 0) / fs.length, mz = fs.reduce((a, f) => a + f.z, 0) / fs.length;
          const at = await page.evaluate(({ mx, mz }) => { const W = window.__game.world; for (let k = 0; k < 16; k++) { const a = k * 0.4, x = mx + Math.cos(a) * 10, z = mz + Math.sin(a) * 10; if (W.shoreAt(x, z) > 1.5) return { x, z }; } return { x: mx + 8, z: mz }; }, { mx, mz });
          await standAt(page, at.x, at.z, mx, mz, -0.15);
        }
        await page.evaluate(() => window.__v.reset());
        for (let k = 0; k < 8; k++) { await page.evaluate(({ tag }) => window.__v.run(150, `camp ${tag}`), { tag }); if (k === 2 || k === 6) await shot(page, `camp-${tag}`); }
        const rs = []; for (const f of (await page.evaluate(() => window.__v.figs().filter((f) => f.src === 'camp'))).slice(0, 3)) { const r = await page.evaluate((k) => window.__v.ring(k), f.key); rs.push(r); if (r && r.hit && rs.filter((x) => x && x.hit).length === 1) await shot(page, `camp-${tag}-ring`); }
        log(`camp ${tag}: rings`, JSON.stringify(rs)); report[`camp-${tag}-rings`] = rs;
        await summ(page, `camp-${tag}`);
      }
    }
  }

  // --- a party loading at a landing and paddling away beside you -----------------------------------------------------
  if (!ONLY || ONLY === 'launch') {
    const pick = await page.evaluate(({ YEAR }) => {
      const g = window.__game, P = g.parties; g.day.setClock(YEAR, 193, 6.5); const T = P.today, cands = [];
      for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl || pl.from.kind !== 'site' || pl.start < 7.2 || pl.start > 11) continue; cands.push({ id: pl.id, start: pl.start, d: Math.hypot(pl.from.x - g.player.x, pl.from.z - g.player.z), from: { x: pl.from.x, z: pl.from.z }, size: party.size, n: pl.crew.boats.length }); }
      cands.sort((a, b) => (b.n >= 2) - (a.n >= 2) || a.d - b.d); return cands[0] || null;
    }, { YEAR });
    log('launch:', JSON.stringify(pick));
    if (pick) {
      await page.evaluate(({ c, YEAR }) => window.__game.day.setClock(YEAR, 193, c.start - 0.07), { c: pick, YEAR }); await tp(page, pick.from.x, pick.from.z);
      for (let k = 0; k < 30 && !(await party(page, pick.id)); k++) await step(page, 30, DT);
      const at = await page.evaluate(({ id }) => {
        const g = window.__game, L = [...g.moves.active.values()].find((x) => x.plan.id === id); if (!L || !L.st) return null; const S = L.st.from.L, W = g.world;
        for (const [up, al] of [[7, 7], [6, -7], [9, 9], [5, 10], [10, -10], [4, 4]]) { const x = S.x + S.ux * up + S.tx * al, z = S.z + S.uz * up + S.tz * al; if (W.shoreAt(x, z) > 1.2) return { x, z, tx: S.x, tz: S.z }; }
        return { x: S.x + S.ux * 8, z: S.z + S.uz * 8, tx: S.x, tz: S.z };
      }, { id: pick.id });
      // (in your canoe off their landing, as the owner paddled by; on the bank above them if not afloat)
      const afloat = await page.evaluate(({ id }) => {
        const g = window.__game, L = [...g.moves.active.values()].find((x) => x.plan.id === id); if (!L || !L.st) return false;
        const S = L.st.from.L, p = g.player, W = g.world; if (p.mode !== 'paddle') return false;
        let off = 12; while (off > 6 && !(W.shoreAt(S.x - S.ux * off + S.tx * 5, S.z - S.uz * off + S.tz * 5) < -3)) off -= 1;
        p.x = S.x - S.ux * off + S.tx * 5; p.z = S.z - S.uz * off + S.tz * 5; p.heading = Math.atan2(S.uz, -S.ux); p.speed = 0; p.yawRate = 0;
        g.chase.setMode('first'); const ch = g.chase; ch.viewYaw = Math.atan2(-(S.z - p.z), S.x - p.x); ch.forwardYaw = ch.viewYaw; ch.viewPitch = -0.1; g.step(1 / 30, 20); return off;
      }, { id: pick.id });
      log('launch: afloat off', afloat);
      if (!afloat && at) await standAt(page, at.x, at.z, at.tx, at.tz, -0.18);
      await page.evaluate(() => window.__v.reset());
      let shots = 0;
      for (let k = 0; k < 75; k++) {
        const r = await page.evaluate(({ id }) => { const g = window.__game; window.__v.run(30, 'launch'); const L = [...g.moves.active.values()].find((x) => x.plan.id === id); return L ? { seg: L.seg && L.seg.kind, h: g.day.hours, steps: L.steps ? L.steps.size : 0 } : null; }, { id: pick.id });
        if (!r) break;
        if (r.seg === 'launch' && (k % 6 === 0 || r.steps) && shots < 6) { await shot(page, `launch-${r.steps ? 'boarding' : 'load'}`); shots++; }
        if (r.seg === 'launch' && (k === 6 || (r.steps && !globalThis.zb))) {
          const st = await page.evaluate(({ id }) => { const g = window.__game, L = [...g.moves.active.values()].find((x) => x.plan.id === id); let best = null; for (const [i, a] of L.persons.entries()) { if (!a.bind || a.bind.kind !== 'foot') continue; const sl = window.__v.slope(a.x, a.z), st = L.steps && L.steps.has(i); const sc = st ? 10 : sl; if (!best || sc > best.sc) best = { sc, sl: +sl.toFixed(2), x: a.x, y: a.y, z: a.z, st }; } return best; }, { id: pick.id });
          if (st) { await zoomShot(page, st.st ? 'launch-step-in-zoom' : `launch-slope-${st.sl}-zoom`, st); if (st.st) globalThis.zb = true; }
        }
        if (k === 12) { const fs = await page.evaluate(() => window.__v.figs().filter((f) => f.src === 'party')); const rs = []; for (const f of fs.slice(0, 3)) rs.push(await page.evaluate((key) => window.__v.ring(key), f.key)); log('launch rings', JSON.stringify(rs)); report.launchRings = rs; }
        if (r.seg === 'paddle') {
          await page.evaluate(({ id }) => { const g = window.__game, L = [...g.moves.active.values()].find((x) => x.plan.id === id), b = L && L.boats[0], ch = g.chase, p = g.player; if (!b) return; g.camera.getWorldPosition(window.__tmpV || (window.__tmpV = new g.THREE.Vector3())); const c = window.__tmpV; ch.viewYaw = Math.atan2(-(b.z - c.z), b.x - c.x); ch.forwardYaw = ch.viewYaw; ch.viewPitch = -0.06; void p; }, { id: pick.id });
          if (shots < 9 && k % 4 === 0) { await shot(page, 'paddle-away'); shots++; }
        }
      }
      await summ(page, 'launch');
    }
  }

  // --- a portage carry --------------------------------------------------------------------------------------------------
  if (!ONLY || ONLY === 'carry') {
    const cc = await page.evaluate(({ YEAR }) => {
      const g = window.__game, P = g.parties; g.day.setClock(YEAR, 193, 6.5); const T = P.today, out = [];
      for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl) continue; for (const s of pl.segs) if (s.kind === 'carry' && s.h0 > 7 && s.h0 < 16 && s.L > 60) out.push({ id: pl.id, h0: s.h0, h1: s.h1, a: s.a, b: s.b, len: s.L, d: Math.hypot(s.a.x - g.player.x, s.a.z - g.player.z), size: party.size }); }
      out.sort((a, b) => a.d - b.d); return out.slice(0, 5);
    }, { YEAR });
    log('carry candidates', JSON.stringify(cc.map((c) => ({ id: c.id, h0: +c.h0.toFixed(2), len: Math.round(c.len), d: Math.round(c.d) }))));
    let best = null;
    for (const c of cc) {
      await tp(page, c.a.x, c.a.z);
      const s = await page.evaluate(({ c }) => { let m = 0; for (let u = 0; u <= 1; u += 0.05) { const x = c.a.x + (c.b.x - c.a.x) * u, z = c.a.z + (c.b.z - c.a.z) * u; m = Math.max(m, window.__v.slope(x, z)); } return m; }, { c });
      if (!best || s > best.s) best = { ...c, s };
    }
    log('carry:', best && JSON.stringify({ id: best.id, h0: best.h0, len: Math.round(best.len), slopeMax: best.s.toFixed(2) }));
    if (best) {
      await page.evaluate(({ c, YEAR }) => window.__game.day.setClock(YEAR, 193, c.h0 + 0.004), { c: best, YEAR }); await tp(page, best.a.x, best.a.z);
      await page.evaluate(() => window.__v.reset());
      let shots = 0;
      for (let k = 0; k < 60; k++) {
        const r = await page.evaluate(({ id }) => { const g = window.__game; window.__v.run(30, 'carry'); const L = [...g.moves.active.values()].find((x) => x.plan.id === id); if (!L) return null; const a = L.persons.find((p) => p.bind && (p.mode === 'carry' || p.mode === 'walk')); return { seg: L.seg && L.seg.kind, who: a ? { x: a.x, z: a.z, h: a.heading, mode: a.mode } : null }; }, { id: best.id });
        if (!r) break;
        if (r.who && k % 3 === 0) {
          await page.evaluate(({ w }) => { const g = window.__game, p = g.player; if (p.mode !== 'walk') return; const x = w.x + Math.sin(w.h) * 5, z = w.z + Math.cos(w.h) * 5; p.x = x; p.z = z; if (p.placeOnGround) p.placeOnGround(); const ch = g.chase; ch.viewYaw = Math.atan2(-(w.z - z), w.x - x); ch.forwardYaw = ch.viewYaw; ch.viewPitch = -0.12; g.step(1 / 30, 2); }, { w: r.who });
          if (shots < 5 && k % 9 === 0) { await shot(page, `carry-${r.who.mode}`); shots++; }
        }
      }
      await summ(page, 'carry');
    }
  }
  if (SHOTS) writeFileSync(path.join(SHOTS, 'r2-npc-verify.json'), JSON.stringify(report, null, 1));
} finally { await browser.close(); }
