// r2 (NPC motion, the owner 2026-11-05): the people look fluid and physical. Moose Lake (ep 25), Saturday 11 July 2026.
//   npx vite --port 5222 --strictPort &   APP=http://localhost:5222 node scripts/r2-npc-motion-test.mjs [--shots docs/build/shots]
// Checks:
//   1 the store yard at its busiest hour: every person standing has both feet on the exact ground (the gait's contact
//     within 3 cm of tiles.groundAt, the drawn ankle where the gait put it), on slopes too; the body upright (the pelvis'
//     up within 8 degrees of the world's) standing on a slope; nobody idle frozen (two or more standing with next to no
//     bone moving for over 6 s fails)
//   2 a party pushing off from its site: each gets in over more than a second (a step over the gunwale), and nobody's body
//     jumps more than 0.5 m in a frame (in, out or walking about the canoes); no row (their facings at the canoes differ)
//   3 the canoe paddled away: her speed surges on each stroke and glides between (the life speed rises and falls a
//     stroke at a time), the bow swings with inertia (the yaw rate never steps), and she never goes sideways (the way
//     she moves within 25 degrees of her bow once under way)
// --shots <dir>: frames of each (r2-npc-*.png)
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch, openGame, seasonAt, step, log } from './gl-e-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg('shots', null) ? path.resolve(arg('shots')) : null;
const TAG = arg('tag', 'after');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const YEAR = 2026, DOY = 192, DT = 1 / 30;
let fails = 0;
const check = (ok, what, detail = '') => { if (!ok) fails++; log(ok ? 'PASS' : 'FAIL', what, detail); };

// the page-side probe: window.__r2
const PROBE = () => {
  const g = window.__game, T = g.tiles, THREE = g.THREE, V = new THREE.Vector3(), Q = new THREE.Quaternion(), UP = new THREE.Vector3();
  const G = (x, z) => T.groundAt(x, z);
  const slope = (x, z) => Math.hypot(G(x + 0.5, z) - G(x - 0.5, z), G(x, z + 0.5) - G(x, z - 0.5));
  const qs = (bones) => { const q = []; for (const n of ['spine', 'chest', 'head', 'armL', 'armR', 'foreL', 'foreR', 'thighL', 'thighR', 'shinL', 'shinR', 'root']) { const b = bones[n]; q.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w); } q.push(bones.root.position.x, bones.root.position.y, bones.root.position.z); return q; };
  const prev = new Map();
  // a figure posed by a gait: its feet's contact against the ground, the drawn ankles against the gait's, the pelvis' up
  function feetOf(gait, bones, s, Gf = G) {
    const o = { contact: 0, ankle: 0, stepping: !!gait.loco.stepping };
    for (const k of ['L', 'R']) {
      const f = gait.loco.feet[k];
      if (!f.swing) o.contact = Math.max(o.contact, Math.abs(f.pos.y * s - Gf(f.pos.x * s, f.pos.z * s)));
      bones['foot' + k].getWorldPosition(V); const a = gait.ankles[k];
      if (!f.swing) o.ankle = Math.max(o.ankle, Math.hypot(V.x - a.x * s, V.y - a.y * s, V.z - a.z * s));
    }
    bones.root.getWorldQuaternion(Q); UP.set(0, 1, 0).applyQuaternion(Q); o.tilt = Math.acos(Math.min(1, UP.y)) * 180 / Math.PI;
    return o;
  }
  function dq(key, bones) {
    const q = qs(bones), pv = prev.get(key); let d = 0;
    if (pv) for (let i = 0; i < q.length; i++) d += Math.abs(q[i] - pv[i]);
    prev.set(key, q); return d;
  }
  function store() {
    const out = [];
    for (const b of g.npcs.bodies) {
      if (!b.who || b.lent || !b.gait || !b.group.visible) continue;
      const v = b.who.person, f = v.figs[b.who.fig]; if (!f) continue;
      const key = `${v.key}#${b.who.fig}`, s = b.sc || 1;
      b.rig.updateMatrixWorld(true);
      out.push({ key, crouch: b.pb && b.pb.life ? b.pb.life.crouch : 0, pose: f.spec.pose, walking: !!(f.path && f.path.length), floor: b.floorY != null, x: f.x, z: f.z, slope: slope(f.x, f.z), ...feetOf(b.gait, b.fig.bones, s, (x, z) => b.footGround(x, z)), dq: dq(key, b.fig.bones) });
    }
    return out;
  }
  const W = new THREE.Vector3(), lastRoot = new Map();
  function party(id) {
    const L = [...g.moves.active.values()].find((x) => x.plan.id === id); if (!L) return null;
    const ps = L.persons.map((a, i) => {
      const B = a.bind; let jump = 0, has = false;
      if (B && B.body && B.body.fig) { B.body.fig.bones.root.getWorldPosition(W); has = true; const pv = lastRoot.get(a.key); if (pv) jump = Math.hypot(W.x - pv.x, W.y - pv.y, W.z - pv.z); lastRoot.set(a.key, W.clone()); } else lastRoot.delete(a.key);
      return { i, mode: a.mode, drawn: has, kind: B ? B.kind : null, x: a.x, z: a.z, h: a.heading, step: L.steps ? L.steps.get(i) ?? null : null, jump, feet: B && B.gait && B.kind === 'foot' ? feetOf(B.gait, B.body.fig.bones, B.s || 1) : null, slope: slope(a.x, a.z) };
    });
    const bs = L.boats.map((b) => ({ x: b.x, z: b.z, h: b.heading, v: b.vSeen || 0, life: b.sim ? b.sim.speed : null, boost: b.sim ? b.sim.boost : null, thr: b.sim ? b.sim.thr : null, yaw: b.sim ? b.sim.yawRate : b.yawRate, sim: !!b.simOn, ph: b.stroke.phase, hidden: b.hidden, roll: b.roll, gx: b.ext ? b.ext.x : null, gz: b.ext ? b.ext.z : null, gv: b.ext ? b.ext.v : null, hold: b.ext ? !!b.ext.hold : null }));
    return { seg: L.seg ? L.seg.kind : null, h: g.day.hours, ps, bs };
  }
  window.__r2 = { store, party, G, slope };
};

const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); ctx.setDefaultNavigationTimeout(300000); ctx.setDefaultTimeout(300000);
  const page = await openGame(browser, { quiet: true, ctx });
  await seasonAt(page, { ep: 25, year: YEAR, doy: DOY, hours: 7.5 });
  await page.evaluate(PROBE);
  await page.evaluate(() => window.__game.renderer.setAnimationLoop(null)); // (driven by step alone)

  const ONLY = process.env.ONLY || '';
  if (!ONLY || ONLY === 'store') {
  // --- 1 the store yard -------------------------------------------------------------------------------------------
  const busy = await page.evaluate(({ YEAR, DOY }) => {
    const g = window.__game, N = g.npcs, P = g.parties; let best = 8.4, n = -1;
    for (let h = 7.5; h <= 11.5; h += 0.05) { const k = N.storeParties(25, P.today, h).filter((e) => e.dir === 'in').reduce((a, e) => a + Math.min(3, e.party.size), 0); if (k > n) { n = k; best = h; } }
    g.day.setClock(YEAR, DOY, best); return { h: +best.toFixed(2), n };
  }, { YEAR, DOY });
  log('store: busiest hour', busy);
  await step(page, 300, DT);
  await page.evaluate(() => {
    const g = window.__game, L = g.outfitter.visit.L, p = g.player, q = L.dockFoot, t = L.dockDeck, dl = Math.hypot(t.x - q.x, t.z - q.z) || 1, dx = (t.x - q.x) / dl, dz = (t.z - q.z) / dl;
    g.chase.setMode('third'); p.x = q.x - dx * 4 - dz * 6; p.z = q.z - dz * 4 + dx * 6; const mx = (q.x + t.x) / 2, mz = (q.z + t.z) / 2; p.heading = Math.atan2(-(mz - p.z), mx - p.x); g.step(1 / 30, 60);
  });
  const rec = [];
  for (let k = 0; k < 40; k++) {
    rec.push(...await page.evaluate(({ DT }) => { const g = window.__game, o = []; for (let i = 0; i < 30; i++) { g.step(DT, 1); for (const r of window.__r2.store()) o.push({ ...r, t: i }); } return o; }, { DT }).then((r) => r.map((x) => ({ ...x, t: x.t + k * 30 }))));
    if (SHOTS && k % 13 === 0) await page.screenshot({ path: path.join(SHOTS, `r2-npc-${TAG}-yard-${k}.png`) });
  }
  const people = [...new Set(rec.map((r) => r.key))];
  // (standing: a second and more after a walk, so the stop's last steps are not counted as standing)
  const walkedAt = new Map(); for (const r of rec.slice().sort((a, b) => a.t - b.t)) { if (r.walking || r.pose === 'walk') walkedAt.set(r.key, r.t); r.since = r.t - (walkedAt.has(r.key) ? walkedAt.get(r.key) : -1e9); }
  const standing = rec.filter((r) => !r.walking && r.pose !== 'walk' && r.pose !== 'sit' && !r.stepping && r.since > 1 / DT); // (on the ground or a floor: the feet's own)
  const sloped = standing.filter((r) => r.slope > 0.15 && !r.floor);
  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const cont = standing.map((r) => r.contact), ank = standing.map((r) => r.ankle);
  log('store:', people.length, 'people,', standing.length, 'standing frames,', sloped.length, 'on slopes over 0.15 (the steepest', +Math.max(0, ...sloped.map((r) => r.slope)).toFixed(2), ')');
  check(standing.length > 200 && pct(cont, 0.99) <= 0.03 && Math.max(0, ...sloped.map((r) => r.contact)) <= 0.03, 'store: feet on the ground standing', `contact p99 ${pct(cont, 0.99).toFixed(3)} max ${Math.max(0, ...cont).toFixed(3)} m; on slopes max ${Math.max(0, ...sloped.map((r) => r.contact)).toFixed(3)} m`);
  const worstA = standing.slice().sort((a, b) => b.ankle - a.ankle)[0];
  const byPose = {}; for (const r of standing) { const o = byPose[r.pose] || (byPose[r.pose] = []); o.push(r.ankle); }
  check(pct(ank, 0.95) <= 0.03, 'store: the drawn ankles where the gait planted them', `p95 ${pct(ank, 0.95).toFixed(3)} max ${Math.max(0, ...ank).toFixed(3)} m (worst: ${worstA ? `${worstA.pose} on ${worstA.slope.toFixed(2)}` : '-'}; p95 by pose ${Object.entries(byPose).map(([k, a]) => `${k} ${pct(a, 0.95).toFixed(3)}`).join(', ')})`);
  const tilt = sloped.filter((r) => r.pose === 'stand' && !(r.crouch > 0.1)).map((r) => r.tilt); // (r2 verify: not while the idle crouches to a pack: its 11 degrees are the crouch's own lean)
  check(!tilt.length || Math.max(...tilt) <= 8, 'store: upright on a slope', `pelvis tilt max ${tilt.length ? Math.max(...tilt).toFixed(1) : '-'} deg over ${tilt.length} frames`);
  // frozen: a run of standing frames over 6 s with next to no bone moving
  let frozen = 0; const detail = [];
  for (const k of people) {
    const list = rec.filter((r) => r.key === k).sort((a, b) => a.t - b.t);
    let run = 0, sum = 0;
    for (const r of list) { if (r.walking || r.pose === 'walk') { run = 0; sum = 0; continue; } run++; sum += r.dq; if (run >= 6 / DT) { if (sum / run < 0.0015) { frozen++; detail.push(k); break; } run = 0; sum = 0; } }
  }
  const idleDq = standing.reduce((a, r) => a + r.dq, 0) / Math.max(1, standing.length);
  check(frozen < 2, 'store: nobody frozen idle', `${frozen} frozen (${detail.join(', ')}); bone change a standing frame ${idleDq.toFixed(4)} (it was 0.003-0.01)`);

  }
  // --- 2 a party pushing off ---------------------------------------------------------------------------------------
  const pick = await page.evaluate(() => {
    const g = window.__game, P = g.parties, T = P.today, cands = [];
    for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl || k === 0 || pl.from.kind !== 'site' || pl.start < 7.5 || pl.start > 11) continue; cands.push({ id: pl.id, start: pl.start, d: Math.hypot(pl.from.x - g.player.x, pl.from.z - g.player.z), from: { x: pl.from.x, z: pl.from.z }, size: party.size, n: pl.crew.boats.length }); }
    cands.sort((a, b) => (b.size >= 2) - (a.size >= 2) || a.d - b.d); return cands[0] || null;
  });
  if (ONLY && ONLY !== 'party') log('party: skipped');
  else if (!pick) { check(false, 'party: one leaving a site this morning'); }
  else {
    log('party:', pick.id, 'size', pick.size, 'canoes', pick.n, 'leaves', pick.start.toFixed(3));
    await page.evaluate(async ({ c, YEAR, DOY }) => { const g = window.__game; g.day.setClock(YEAR, DOY, c.start - 0.06); await g.player.teleport(c.from.x, c.from.z); g.chase.setMode('third'); }, { c: pick, YEAR, DOY });
    await step(page, 120, DT);
    for (let k = 0; k < 40 && !(await page.evaluate(({ id }) => { const L = [...window.__game.moves.active.values()].find((x) => x.plan.id === id); return !!(L && L.st && L.persons.length); }, { id: pick.id })); k++) await step(page, 30, DT);
    // stand up the bank behind them, looking at the water
    const st = await page.evaluate(({ id }) => {
      const g = window.__game, L = [...g.moves.active.values()].find((x) => x.plan.id === id); if (!L || !L.st) return null;
      // (in your canoe off the landing, looking in at them: the bank is all trees from above it)
      const S = L.st.from.L, p = g.player, W = g.world;
      let off = 13; while (off > 7 && !(W.shoreAt(S.x - S.ux * off + S.tx * 4, S.z - S.uz * off + S.tz * 4) < -3)) off -= 1;
      g.chase.setMode('first');
      if (p.mode === 'paddle') { p.x = S.x - S.ux * off + S.tx * 4; p.z = S.z - S.uz * off + S.tz * 4; p.heading = Math.atan2(-S.uz, S.ux) + 0.12; p.speed = 0; p.yawRate = 0; }
      g.step(1 / 30, 30);
      return { seg: L.seg && L.seg.kind, h: g.day.hours, par: L.st.from.par, mode: p.mode, off };
    }, { id: pick.id });
    log('party: at their landing', st);
    const frames = [];
    let shot = 0;
    for (let k = 0; k < 140; k++) {
      const r = await page.evaluate(({ id, DT }) => { const g = window.__game, o = []; for (let i = 0; i < 15; i++) { g.step(DT, 1); o.push(window.__r2.party(id)); } return o; }, { id: pick.id, DT });
      frames.push(...r.filter(Boolean));
      const last = frames[frames.length - 1];
      if (SHOTS && last && shot < 14 && (k % 6 === 0)) { await page.screenshot({ path: path.join(SHOTS, `r2-npc-${TAG}-launch-${String(shot).padStart(2, '0')}.png`) }); shot++; }
      if (last && last.seg === 'paddle' && frames.filter((f) => f.seg === 'paddle').length > 30 * 45) break;
      // (keep the canoes in view once they are away)
      if (last && last.seg === 'paddle') await page.evaluate(({ id }) => { const g = window.__game, L = [...g.moves.active.values()].find((x) => x.plan.id === id); const b = L && L.boats[0]; if (!b) return; const p = g.player; p.heading = Math.atan2(-(b.z - p.z), b.x - p.x); p.speed = 0; }, { id: pick.id });
    }
    // places at the canoes before boarding: no row
    const pre = frames.filter((f) => f.seg === 'launch' && !f.ps.some((p) => p.step != null || p.mode === 'crew')).slice(0, -9 / DT); // (before they line up to get in)
    if (pre.length) {
      // (a row: their places on one line, evenly spaced, all facing one way. Off the line they stand by its best fit,
      // and their facings spread)
      let worst = Infinity, worstH = Infinity;
      for (const f of pre.filter((_, n) => n % 30 === 0)) {
        const P0 = f.ps.filter((p) => p.mode !== 'crew'); if (P0.length < 4) continue; // (three or fewer are always near enough a line)
        const mx = P0.reduce((a, p) => a + p.x, 0) / P0.length, mz = P0.reduce((a, p) => a + p.z, 0) / P0.length;
        let sxx = 0, szz = 0, sxz = 0; for (const p of P0) { sxx += (p.x - mx) ** 2; szz += (p.z - mz) ** 2; sxz += (p.x - mx) * (p.z - mz); }
        const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), nx = -Math.sin(th), nz = Math.cos(th);
        const off = Math.sqrt(P0.reduce((a, p) => a + ((p.x - mx) * nx + (p.z - mz) * nz) ** 2, 0) / P0.length);
        const hs = P0.map((p) => p.h), sp = Math.max(...hs) - Math.min(...hs);
        worst = Math.min(worst, off); worstH = Math.min(worstH, sp);
      }
      check(worst === Infinity || worst > 0.3 || worstH > 0.4, 'party: not one row at the canoes', `the least they stood off one line ${worst === Infinity ? '-' : worst.toFixed(2)} m (rms), their facings spread at least ${worstH === Infinity ? '-' : worstH.toFixed(2)} rad`);
    }
    // boarding: each one's step in over more than a second; no jump past 0.5 m
    const stepT = new Map(); let jumpMax = 0, jumpAt = null;
    frames.forEach((f, n) => { for (const p of f.ps) { if (p.step != null && f.seg === 'launch') stepT.set(p.i, (stepT.get(p.i) || 0) + DT); if (n > 2 && p.drawn && p.jump > jumpMax) { jumpMax = p.jump; jumpAt = `${f.seg} ${p.mode} #${p.i} frame ${n}`; } } });
    const seated = frames.length ? frames[frames.length - 1].ps.filter((p) => p.mode === 'crew').length : 0;
    check(stepT.size > 0 && [...stepT.values()].every((t) => t > 1), 'party: boarding takes more than a second each', `${[...stepT.entries()].map(([i, t]) => `#${i} ${t.toFixed(2)} s`).join(', ')}; ${seated} seated at the end`);
    check(jumpMax <= 0.5, 'party: no body jumps more than 0.5 m a frame', `max ${jumpMax.toFixed(3)} m (${jumpAt})`);
    // the canoe away: stroke surge, turn inertia, no sideslip
    if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(frames.map((f) => ({ seg: f.seg, h: f.h, b: f.bs[0], ps: f.ps.map((p) => [p.mode, +p.x.toFixed(2), +p.z.toFixed(2), p.step, +p.jump.toFixed(3)]), bs: f.bs }))));
    const pad = frames.filter((f) => f.seg === 'paddle' && f.bs[0] && f.bs[0].sim);
    if (pad.length > 200) {
      const B = pad.map((f) => f.bs[0]), life = B.map((b) => b.life);
      // the surge: over each stroke's cycle, the life speed's rise and fall
      let cyc = [];
      const amps = [];
      for (let i = 1; i < B.length; i++) { cyc.push(life[i]); if (B[i].ph < B[i - 1].ph) { if (cyc.length > 10) amps.push(Math.max(...cyc) - Math.min(...cyc)); cyc = []; } }
      const steady = amps.slice(3), amp = steady.length ? steady.reduce((a, b) => a + b, 0) / steady.length : 0;
      check(steady.length >= 3 && amp > 0.02, 'canoe: surges on each stroke', `${steady.length} strokes, mean rise and fall ${amp.toFixed(3)} m/s at life (mean ${(life.reduce((a, b) => a + b, 0) / life.length).toFixed(2)} m/s)`);
      let dyaw = 0; for (let i = 1; i < B.length; i++) dyaw = Math.max(dyaw, Math.abs(B[i].yaw - B[i - 1].yaw));
      check(dyaw < 0.08, 'canoe: the bow swings with inertia', `the yaw rate's largest step ${dyaw.toFixed(4)} rad/s a frame`);
      let slip = 0;
      for (let i = 5; i < B.length; i++) { const dx = B[i].x - B[i - 5].x, dz = B[i].z - B[i - 5].z, d = Math.hypot(dx, dz); if (d / (5 * DT) < 2) continue; const mh = Math.atan2(-dz, dx), e = Math.abs(Math.atan2(Math.sin(mh - B[i].h), Math.cos(mh - B[i].h))); slip = Math.max(slip, e); }
      check(slip < 25 * Math.PI / 180, 'canoe: never sideways or stern first', `the largest angle between her way and her bow ${(slip * 180 / Math.PI).toFixed(1)} deg`);
      const vs = B.map((b) => b.v); log('canoe: seen speed', Math.min(...vs.slice(90)).toFixed(2), '..', Math.max(...vs).toFixed(2), 'm/s; time-lapse', (B[B.length - 1].boost || 0).toFixed(2));
    } else check(false, 'canoe: paddled away in view', `${pad.length} frames with her own physics`);
  }

  // --- 4 a party coming in to its site: the canoes brought in and held, each out of the canoe over a step -----------
  const inc = await page.evaluate(() => {
    const g = window.__game, P = g.parties, T = P.today, cands = [];
    for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl || pl.to.kind !== 'site' || pl.arrive < 11 || pl.arrive > 18) continue; const d = Math.hypot(pl.to.x - g.player.x, pl.to.z - g.player.z); if (d < 9000) cands.push({ id: pl.id, arrive: pl.arrive, to: { x: pl.to.x, z: pl.to.z }, size: party.size, d }); }
    cands.sort((a, b) => (b.size >= 2) - (a.size >= 2) || a.d - b.d); return cands[0] || null;
  });
  if (ONLY && ONLY !== 'arrival') log('arrival: skipped');
  else if (!inc) log('arrival: no party coming in this afternoon (skipped)');
  else {
    log('arrival:', inc.id, 'size', inc.size, 'in at', inc.arrive.toFixed(3));
    await page.evaluate(async ({ c, YEAR, DOY }) => { const g = window.__game; g.day.setClock(YEAR, DOY, c.arrive - 0.05); await g.player.teleport(c.to.x, c.to.z); g.chase.setMode('third'); }, { c: inc, YEAR, DOY });
    await step(page, 60, DT);
    for (let k = 0; k < 40 && !(await page.evaluate(({ id }) => { const L = [...window.__game.moves.active.values()].find((x) => x.plan.id === id); return !!(L && L.st && L.persons.length); }, { id: inc.id })); k++) await step(page, 30, DT);
    await page.evaluate(({ id }) => {
      const g = window.__game, L = [...g.moves.active.values()].find((x) => x.plan.id === id); if (!L || !L.st) return;
      const S = L.st.to.L, p = g.player, W = g.world;
      let off = 16; while (off > 7 && !(W.shoreAt(S.x - S.ux * off - S.tx * 8, S.z - S.uz * off - S.tz * 8) < -3)) off -= 1;
      if (p.mode === 'paddle') { p.x = S.x - S.ux * off - S.tx * 8; p.z = S.z - S.uz * off - S.tz * 8; p.heading = Math.atan2(-S.uz, S.ux) - 0.3; p.speed = 0; p.yawRate = 0; }
      g.chase.setMode('first'); g.step(1 / 30, 10);
    }, { id: inc.id });
    const fr = []; let shot = 0;
    for (let k = 0; k < 160; k++) {
      const r = await page.evaluate(({ id, DT }) => { const g = window.__game, o = []; for (let i = 0; i < 15; i++) { g.step(DT, 1); o.push(window.__r2.party(id)); } return o; }, { id: inc.id, DT });
      fr.push(...r.filter(Boolean));
      const last = fr[fr.length - 1];
      if (SHOTS && last && (last.seg === 'land' || (last.seg === 'paddle' && fr.length % 120 === 0)) && shot < 10 && k % 3 === 0) { await page.screenshot({ path: path.join(SHOTS, `r2-npc-${TAG}-land-${String(shot).padStart(2, '0')}.png`) }); shot++; }
      if (last && last.seg === 'land' && fr.filter((f) => f.seg === 'land').length > 30 * 20) break;
    }
    if (process.env.DUMP2) (await import('node:fs')).writeFileSync(process.env.DUMP2, JSON.stringify(fr.map((f) => ({ seg: f.seg, h: f.h, ps: f.ps.map((p) => [p.mode, +p.x.toFixed(2), +p.z.toFixed(2), p.step, +p.jump.toFixed(3), p.kind]), bs: f.bs }))));
    const outT = new Map(); let jm = 0, ja = null;
    fr.forEach((f, n) => { for (const p of f.ps) { if (p.step != null && f.seg === 'land') outT.set(p.i, (outT.get(p.i) || 0) + DT); if (n > 2 && p.drawn && p.jump > jm) { jm = p.jump; ja = `${f.seg} ${p.mode} #${p.i} frame ${n}`; } } });
    const land = fr.filter((f) => f.seg === 'land');
    check(land.length > 0 && outT.size > 0 && [...outT.values()].every((t) => t > 1), 'arrival: each steps out over more than a second', `${[...outT.entries()].map(([i, t]) => `#${i} ${t.toFixed(2)} s`).join(', ') || 'none seen'} (${land.length} frames in)`);
    check(jm <= 0.5, 'arrival: no body jumps more than 0.5 m a frame', `max ${jm.toFixed(3)} m (${ja})`);
    if (land.length) { const b = land[land.length - 1].bs[0]; log('arrival: the canoe at rest', b ? `v ${b.v.toFixed(2)} m/s, ${Math.hypot(b.x - b.gx, b.z - b.gz).toFixed(2)} m from its place` : '-'); }
  }
} finally { await browser.close(); }
log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
