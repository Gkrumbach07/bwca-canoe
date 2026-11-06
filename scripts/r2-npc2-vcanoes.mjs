// r2 npc 2 verify, canoes lens (adversarial): party hulls watched every frame through the player's camera at entry points,
// hours and places the builder's test did not use: launches and landings (morning, afternoon, dusk), you standing right by
// the canoes, mid-lake passes. Per hull drawn: its step a frame (a jump), a yaw step, sideslip, appearing/vanishing in
// view, the ground over its keel; per person drawn on foot: a step a frame.
//   APP=http://localhost:5238 EPS=25,30,38 node scripts/r2-npc2-vcanoes.mjs [--shots dir]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, openGame, seasonAt, log } from './gl-e-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg('shots', null) ? path.resolve(arg('shots')) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const EPS = (process.env.EPS || '25,30,38,54,24').split(',').map(Number);
const KINDS = (process.env.KINDS || 'launch,land,dusk,pass').split(',');
const YEAR = 2026, DOY = +(process.env.DOY || 193), PER = +(process.env.PER || 2), SECS = +(process.env.SECS || 80);

const PROBE = () => {
  const g = window.__game, T = g.tiles, G = (x, z) => T.groundAt(x, z), THREE = g.THREE;
  const V3 = new THREE.Vector3(), K = new THREE.Vector3();
  const KP = [[2.05, -0.27], [0, -0.295], [-2.05, -0.27]];
  const keelIn = (b) => { if (!b.root || !b.root.parent || b.hidden) return null; b.root.updateMatrixWorld(true); let e = -Infinity; for (const [x, y] of KP) { V3.set(x, y, 0).applyMatrix4(b.root.matrixWorld); e = Math.max(e, G(V3.x, V3.z) - V3.y); } return e; };
  const legOf = (b) => { for (const L of g.moves.active.values()) { const c = L.boats.indexOf(b); if (c >= 0) return { L, c }; } return null; };
  const prev = new Map(), prevP = new Map();
  const R = { keelList: [], slipEv: [], frames: 0, jumps: [], yaw: [], slip: 0, slipFrames: 0, slipWorst: 0, appear: [], vanish: [], keel: 0, keelEv: null, pjump: [], hullFrames: 0, maxStep: 0, maxYaw: 0 };
  const inView = (x, z) => { g.camera.getWorldPosition(K); const e = g.camera.matrixWorld.elements, fx = -e[8], fz = -e[10], fl = Math.hypot(fx, fz) || 1, dx = x - K.x, dz = z - K.z, d = Math.hypot(dx, dz); return d < 30 || (dx * fx + dz * fz) / (d * fl) > 0.5; };
  function frame(tag) {
    R.frames++;
    for (const b of g.actors.boats) {
      const lo = legOf(b); if (!lo) continue; // (the parties' only)
      const sh = !b.hidden && b.dist < 1200, vw = sh && inView(b.x, b.z), pv = prev.get(b);
      const seg = lo.L.seg ? lo.L.seg.kind : null;
      if (pv) {
        if (sh && pv.sh && vw && b.dist < 500) {
          R.hullFrames++;
          const st = Math.hypot(b.x - pv.x, b.z - pv.z), dh = Math.abs(Math.atan2(Math.sin(b.heading - pv.h), Math.cos(b.heading - pv.h)));
          if (st > R.maxStep) R.maxStep = +st.toFixed(2);
          if (dh > R.maxYaw && b.dist < 300) R.maxYaw = +dh.toFixed(3);
          const lim = Math.max(1.2, (b.vSeen || 0) / 30 * 1.6 + 0.3);
          if (st > lim && R.jumps.length < 20) R.jumps.push({ tag, st: +st.toFixed(2), d: Math.round(b.dist), seg, sim: !!b.simOn, hold: !!(b.ext && b.ext.hold), gd: b.ext ? +Math.hypot(b.ext.x - b.x, b.ext.z - b.z).toFixed(1) : null, stuck: b.sim ? +(b.sim.stuck || 0).toFixed(2) : null, boost: b.sim ? +b.sim.boost.toFixed(2) : null, vSeen: +(b.vSeen || 0).toFixed(1), id: lo.L.plan.id, c: lo.c, at: [Math.round(b.x), Math.round(b.z)], h: +g.day.hours.toFixed(3) });
          if (dh > 0.12 && b.dist < 300 && R.yaw.length < 20) R.yaw.push({ tag, dh: +dh.toFixed(3), d: Math.round(b.dist), seg, sim: !!b.simOn, id: lo.L.plan.id });
          if (st * 30 > 1.0 && b.dist < 300) {
            const vx = (b.x - pv.x), vz = (b.z - pv.z), fx = Math.cos(b.heading), fz = -Math.sin(b.heading), cs = (vx * fx + vz * fz) / st, ang = Math.acos(Math.max(-1, Math.min(1, Math.abs(cs))));
            R.slipFrames++; if (ang > 0.44) { R.slip++; if (R.slipEv.length < 12) R.slipEv.push({ tag, ang: +ang.toFixed(2), v: +(st * 30).toFixed(1), d: Math.round(b.dist), seg, hold: !!(b.ext && b.ext.hold), sim: !!b.simOn, yr: +(b.yawRate || 0).toFixed(2), id: lo.L.plan.id, c: lo.c, h: +g.day.hours.toFixed(3) }); } if (ang > R.slipWorst) R.slipWorst = +ang.toFixed(2);
          }
        }
        if (sh && !pv.sh && vw && b.dist < 250 && R.appear.length < 20) R.appear.push({ tag, d: Math.round(b.dist), seg, id: lo.L.plan.id, c: lo.c, h: +g.day.hours.toFixed(3) });
        if (!sh && pv.sh && pv.vw && pv.d < 250 && R.vanish.length < 20) R.vanish.push({ tag, d: Math.round(pv.d), seg, id: lo.L.plan.id, c: lo.c, h: +g.day.hours.toFixed(3), carried: seg && lo.L.seg ? !!g.moves.carriedNow(lo.L, lo.L.seg, lo.c, g.day.hours - g.moves.lagOf(lo.L.party.id)) : null });
      }
      if (sh && b.near && b.dist < 200) { const e = keelIn(b); if (e != null && e > 0.15 && R.keelList.length < 12) R.keelList.push({ tag, e: +e.toFixed(2), seg, d: Math.round(b.dist), beached: +(b.beached || 0).toFixed(2), hold: !!(b.ext && b.ext.hold), sd: +g.world.shoreAt(b.x, b.z).toFixed(1), id: lo.L.plan.id, c: lo.c, h: +g.day.hours.toFixed(3) }); if (e != null && e > R.keel) { R.keel = +e.toFixed(2); R.keelEv = { tag, seg, d: Math.round(b.dist), beached: b.beached, id: lo.L.plan.id }; } }
      prev.set(b, { x: b.x, z: b.z, h: b.heading, sh, vw, d: b.dist });
    }
    for (const a of g.actors.people) {
      const sh = !a.hidden && !!a.bind && !a.boat && a.dist < 200, pv = prevP.get(a);
      if (pv && sh && pv.sh && inView(a.x, a.z)) { const st = Math.hypot(a.x - pv.x, a.z - pv.z); if (st > 0.45 && R.pjump.length < 20) R.pjump.push({ tag, st: +st.toFixed(2), d: Math.round(a.dist), mode: a.mode, boat: !!a.boat, key: a.key, h: +g.day.hours.toFixed(3) }); }
      prevP.set(a, { x: a.x, z: a.z, sh });
    }
  }
  const shots = [];
  function snap(tag) { try { shots.push({ tag, url: g.renderer.domElement.toDataURL('image/jpeg', 0.8) }); } catch { /* */ } }
  const reset = () => { prev.clear(); prevP.clear(); };
  window.__vc = { reset, R, frame, snap, shots, keelIn };
};

const browser = await launch();
const all = [];
try {
  for (const ep of EPS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); ctx.setDefaultTimeout(900000);
    const page = await openGame(browser, { quiet: true, ctx });
    await seasonAt(page, { ep, year: YEAR, doy: DOY - 1, hours: 7.0 });
    await page.evaluate(PROBE);
    await page.evaluate(() => window.__game.renderer.setAnimationLoop(null));
    // the day's candidates: launches from a site or a portage end, landings, a landing at dusk, a paddle leg's middle
    const cands = await page.evaluate(({ YEAR, DOY, KINDS, PER }) => {
      const g = window.__game, P = g.parties; g.day.setClock(YEAR, DOY, 6.0); const T = P.today, p = g.player, out = { launch: [], land: [], dusk: [], pass: [] };
      for (const { party, k } of P.legsOn(T)) {
        const pl = P.legPlan(party, k); if (!pl) continue;
        for (const s of pl.segs) {
          const d = (q) => Math.hypot(q.x - p.x, q.z - p.z);
          if (s.kind === 'launch' && s.h0 > 7.5 && s.h0 < 17 && s.at) out.launch.push({ id: pl.id, h: s.h0 - 0.03, S: { x: s.at.x, z: s.at.z }, n: pl.crew.boats.length, d: d(s.at), kind: 'launch', site: pl.from.kind === 'site' });
          if ((s.kind === 'land' || s.kind === 'landing') && s.at) { const q = { id: pl.id, h: s.h0 - 0.06, S: { x: s.at.x, z: s.at.z }, n: pl.crew.boats.length, d: d(s.at), kind: 'land', site: s.kind === 'land' && pl.to.kind === 'site' }; if (s.h0 > 19 && s.h0 < 21.5) out.dusk.push({ ...q, kind: 'dusk' }); else if (s.h0 > 9 && s.h0 < 19) out.land.push(q); }
          if (s.kind === 'paddle' && s.dist > 1500 && s.h0 > 8 && s.h1 < 19) out.pass.push({ id: pl.id, h: s.h0 + (s.h1 - s.h0) * 0.4, A: { x: s.a.x, z: s.a.z }, B: { x: s.b.x, z: s.b.z }, n: pl.crew.boats.length, d: d(s.a), kind: 'pass' });
        }
      }
      const pick = (arr) => { arr.sort((a, b) => (b.n >= 2) - (a.n >= 2) || a.d - b.d); return arr.slice(0, PER); };
      return KINDS.flatMap((k) => pick(out[k]));
    }, { YEAR, DOY, KINDS, PER });
    log(`ep ${ep}: ${cands.length} scenarios`);
    for (const c of cands) {
      const tag = `ep${ep}:${c.kind}:${c.id}`;
      await page.evaluate(({ c, YEAR, DOY }) => window.__game.day.setClock(YEAR, DOY, c.h), { c, YEAR, DOY });
      // where you stand: by the landing (2.5 m up the bank, beside the slot) or on a shore by a paddle leg's line
      const at = await page.evaluate(({ c }) => {
        const W = window.__game.world;
        if (c.S) { const S = c.S, R = +(window.__STAND || 4); for (const r of [R, R + 2, R + 4, R + 8]) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = S.x + Math.cos(a) * r, z = S.z + Math.sin(a) * r, sd = W.shoreAt(x, z); if (sd > 0.6 && sd < 4) return { x, z, tx: S.x + (S.x - x) * 2, tz: S.z + (S.z - z) * 2 }; } return { x: S.x, z: S.z, tx: S.x + 5, tz: S.z }; }
        // (a pass: the shore nearest the line's 40 %)
        const mx = c.A.x + (c.B.x - c.A.x) * 0.45, mz = c.A.z + (c.B.z - c.A.z) * 0.45;
        for (let r = 0; r < 600; r += 15) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, x = mx + Math.cos(a) * r, z = mz + Math.sin(a) * r, sd = W.shoreAt(x, z); if (sd > 1 && sd < 5) return { x, z, tx: mx, tz: mz }; }
        return { x: mx, z: mz, tx: c.B.x, tz: c.B.z };
      }, { c });
      await page.evaluate(({ x, z }) => { const g = window.__game; window.__tpDone = false; g.player.teleport(x, z).finally(() => { window.__tpDone = true; }); }, at);
      for (let k = 0; k < 600 && !(await page.evaluate(() => window.__tpDone)); k++) await page.evaluate(() => window.__game.step(1 / 30, 2));
      await page.evaluate(({ at }) => { const g = window.__game, p = g.player; if (p.mode !== 'walk' && p.stepOut) { p.stepOut(); g.step(1 / 30, 5); } p.x = at.x; p.z = at.z; if (p.placeOnGround) p.placeOnGround(); g.chase.setMode('first'); const ch = g.chase; ch.viewYaw = Math.atan2(-(at.tz - at.z), at.tx - at.x); ch.forwardYaw = ch.viewYaw; ch.viewPitch = -0.08; }, { at });
      // every frame for SECS s, looking at the party's nearest hull (or person) as you would follow it
      const r = await page.evaluate(async ({ id, tag, SECS, shots }) => {
        const g = window.__game, V = window.__vc, R = V.R, n0 = { j: R.jumps.length, a: R.appear.length, v: R.vanish.length, y: R.yaw.length, p: R.pjump.length };
        let segs = {}, near = Infinity, simF = 0, seen = 0; const n1 = { k: R.keelList.length, s: R.slipEv.length };
        V.reset(); g.step(1 / 30, 15);
        for (let k = 0; k < SECS * 30; k++) {
          const L = [...g.moves.active.values()].find((x) => x.plan.id === id);
          if (L && k % 6 === 0) {
            const tgt = [...L.boats.filter((b) => !b.hidden), ...L.persons.filter((a) => !a.hidden && a.bind && !a.boat)].sort((a, b) => a.dist - b.dist)[0];
            if (tgt) { const p = g.player, ch = g.chase; ch.viewYaw = Math.atan2(-(tgt.z - p.z), tgt.x - p.x); ch.forwardYaw = ch.viewYaw; seen++; }
          }
          g.step(1 / 30, 1); V.frame(tag);
          if (L) { const sk = L.seg ? L.seg.kind : '-'; segs[sk] = (segs[sk] || 0) + 1; for (const b of L.boats) { if (!b.hidden) near = Math.min(near, b.dist); if (b.simOn) simF++; } }
          if (shots && k % 300 === 150) V.snap(`${tag}-${k}`);
          if (k % 20 === 0) await new Promise((q) => setTimeout(q, 3));
        }
        return { segs, near: Math.round(near), simF, seen, jumps: R.jumps.slice(n0.j), appear: R.appear.slice(n0.a), vanish: R.vanish.slice(n0.v), yaw: R.yaw.slice(n0.y), pjump: R.pjump.slice(n0.p), keel: R.keelList.slice(n1.k), slip: R.slipEv.slice(n1.s) };
      }, { id: c.id, tag, SECS, shots: !!SHOTS });
      log(tag, JSON.stringify({ c: { h: +c.h.toFixed(2), n: c.n }, ...r }));
      all.push({ tag, ...r });
      if (SHOTS) { const list = await page.evaluate(() => window.__vc.shots.splice(0)); for (const q of list) writeFileSync(path.join(SHOTS, `vc-${q.tag.replace(/[^a-z0-9]+/gi, '_')}.jpg`), Buffer.from(q.url.split(',')[1], 'base64')); }
    }
    const R = await page.evaluate(() => { const R = window.__vc.R; return { frames: R.frames, hullFrames: R.hullFrames, maxStep: R.maxStep, maxYaw: R.maxYaw, slip: R.slip, slipFrames: R.slipFrames, slipWorst: R.slipWorst, keel: R.keel, keelEv: R.keelEv, jumps: R.jumps.length, appear: R.appear.length, vanish: R.vanish.length, pjump: R.pjump.length }; });
    log(`ep ${ep} totals`, JSON.stringify(R));
    await ctx.close();
  }
} finally { await browser.close(); }
