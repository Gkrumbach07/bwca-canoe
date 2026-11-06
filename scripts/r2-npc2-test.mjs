// r2 NPC motion 2: the twelve leftovers of the r2 verify, each measured on what is drawn and checked. Every check fails on
// claude/r2-npc-motion (d2aa4c9) and passes on claude/r2-npc-motion-2.
//   npx vite --port 5232 --strictPort &   APP=http://localhost:5232 node scripts/r2-npc2-test.mjs [--shots dir]
//   ONLY=carry,terrain,... (sections: carry terrain names route launch arrive depart camp store)
//   1 route    a canoe's water route still being searched when they push off in view: held at the bank, never hidden and
//              thrown onto the route (the hull's largest step a frame, its frames hidden in view)
//   2 arrive / depart   the camp's canoes on the bank and the party's in the water: one carried up to the other's place
//              (no hull appears or goes where no hull was a moment before); the camp's people start where the party's were
//   3 carry    party people over a portage: the largest step a frame and the speed seen (the player's carry is 8 m/s seen)
//   4 names    every member of a camp is pointed at by their own name
//   5 camp     someone out of a tent comes out of its door (never appears in the open)
//   6 launch   the stern pushes off with a foot before she gets in (the push seen, the hull moved off by it)
//   7 launch   nobody's place at a landing on ground steeper than 0.8
//   8 camp     a camp walk never goes through a tent, a tarp or the fire
//   9 arrive   a canoe held at the bank sits on the ground under her (the bank over her waterline at the bow: none)
//   10 terrain the ground under the people changed in a frame (a detail chunk in): they stand on the new ground that frame
//   11 store   two people going through the store door never walk through each other
//   12 terrain the single frame's standing foot 0.5 m off the ground: none in a run
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, openGame, seasonAt, step, log } from './gl-e-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg('shots', null) ? path.resolve(arg('shots')) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const YEAR = 2026, ONLY = (process.env.ONLY || '').split(',').filter(Boolean), on = (k) => !ONLY.length || ONLY.includes(k);
const results = [];
const check = (n, name, ok, info) => { results.push({ n, name, ok: !!ok, info }); log(`${ok ? 'PASS' : 'FAIL'} ${n} ${name}`, typeof info === 'string' ? info : JSON.stringify(info)); };

// --- in the page: what is drawn, measured --------------------------------------------------------------------------
const PROBE = () => {
  const g = window.__game, T = g.tiles, THREE = g.THREE, G = (x, z) => T.groundAt(x, z);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), R = new THREE.Vector3();
  const shown = (o) => { for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === g.scene) return true; } return false; };
  // every figure drawn on foot: the store's and the camps' (npcs.js bodies) and the parties' (actors.js)
  function figs() {
    const out = [];
    for (const b of g.npcs.bodies) {
      if (!b.who || b.lent || !b.rig || !shown(b.group)) continue;
      const v = b.who.person, f = v.figs[b.who.fig]; if (!f) continue;
      const sp = f.spec || {};
      out.push({ key: `npc:${v.key}#${b.who.fig}`, src: v.party ? 'camp' : 'store', fig: b.fig, sc: b.sc || 1, floor: b.floorY != null, sit: sp.pose === 'sit', walking: !!(f.path && f.path.length) || sp.pose === 'walk', f, v, b });
    }
    for (const p of g.actors.people) {
      const Bd = p.bind; if (!Bd || Bd.kind !== 'foot' || !Bd.body || !Bd.body.fig || !shown(Bd.body.fig.group)) continue;
      out.push({ key: `party:${p.key}`, src: 'party', fig: Bd.body.fig, sc: Bd.s || 1, floor: p.footY != null, sit: false, walking: p.mode === 'walk' || p.mode === 'carry' || p.v > 0.15, a: p });
    }
    return out;
  }
  // the lower ankle over the ground under it, and where the root is
  function feet(f) {
    const bn = f.fig.bones; f.fig.group.updateWorldMatrix(true, true);
    bn.footL.getWorldPosition(A); bn.footR.getWorldPosition(B); bn.root.getWorldPosition(R);
    const lo = Math.min(A.y - G(A.x, A.z), B.y - G(B.x, B.z));
    return { lo, x: R.x, y: R.y, z: R.z };
  }
  const slope = (x, z) => Math.hypot(G(x + 0.5, z) - G(x - 0.5, z), G(x, z + 0.5) - G(x, z - 0.5));
  // the dot aimed at a figure from 1.7 m off (as r2-npc-verify.mjs ring): what it names
  const H = new THREE.Vector3(), K = new THREE.Vector3();
  function ring(key) {
    let last = null;
    for (let tr = 0; tr < 6; tr++) {
      const f = figs().find((x) => x.key === key); if (!f) return last;
      const p = g.player, ch = g.chase, bn = f.fig.bones, fx = f.f ? f.f.x : f.a.x, fz = f.f ? f.f.z : f.a.z;
      if (p.mode === 'walk') { const a = tr * 1.05 + 0.3, x = fx + Math.cos(a) * 1.7, z = fz + Math.sin(a) * 1.7; if (g.world.shoreAt(x, z) < 0.8 && tr < 5) continue; p.x = x; p.z = z; if (p.placeOnGround) p.placeOnGround(); g.chase.setMode('first'); g.step(1 / 30, 2); }
      f.fig.group.updateWorldMatrix(true, true); bn.head.getWorldPosition(H); bn.footL.getWorldPosition(A); bn.footR.getWorldPosition(B);
      g.camera.getWorldPosition(K);
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, cy = (H.y + Math.min(A.y, B.y)) / 2;
      ch.viewYaw = Math.atan2(-(mz - K.z), mx - K.x); ch.forwardYaw = ch.viewYaw; ch.viewPitch = Math.atan2(cy - K.y, Math.hypot(mx - K.x, mz - K.z));
      for (let i = 0; i < 4; i++) g.step(1 / 30, 1);
      const t = g.pointer.target;
      last = { key, kind: t ? t.kind : null, label: t && t.kind === 'person' ? t.label : null, mode: p.mode, d: +Math.hypot(p.x - fx, p.z - fz).toFixed(2), on: g.pointer.on, title: g.title.state, tp: !!p.teleporting, cm: g.chase.mode, out: g.outfitter && g.outfitter.open };
      if (t && t.kind === 'person') return last;
    }
    return last;
  }
  // 12: a standing foot far off the ground a lone frame (not walking, not stepping in, not on a floor or a seat)
  const odd = { n: 0, frames: 0, worst: 0, ev: [] };
  function oddFrame(tag) {
    odd.frames++;
    for (const f of figs()) {
      if (f.floor || f.sit || f.walking || (f.a && f.a.anim && (f.a.anim.lift > 0 || f.a.anim.push))) continue;
      const q = feet(f), e = Math.max(-0.35 * f.sc - q.lo, q.lo - 0.45 * f.sc);
      if (e > 0) { odd.n++; const w = Math.max(-q.lo, q.lo); if (w > odd.worst) odd.worst = +w.toFixed(2); if (odd.ev.length < 8) odd.ev.push({ tag, key: f.key, lo: +q.lo.toFixed(2), det: T.detail.stats.installed, ...(f.a ? { mode: f.a.mode, v: +(f.a.v || 0).toFixed(2), anim: f.a.anim ? JSON.stringify(f.a.anim).slice(0, 80) : null, y: +f.a.y.toFixed(2), g: +G(f.a.x, f.a.z).toFixed(2), sl: +slope(f.a.x, f.a.z).toFixed(2), seg: (() => { const L = [...g.moves.active.values()].find((x) => x.persons.includes(f.a)); return L && L.seg ? L.seg.kind : null; })(), dbg: (() => { const bn = f.fig.bones; bn.footL.getWorldPosition(A); bn.footR.getWorldPosition(B); bn.root.getWorldPosition(R); const gl = f.a.bind.gait && f.a.bind.gait.loco; return { fl: [+A.x.toFixed(2), +A.y.toFixed(2), +A.z.toFixed(2), +G(A.x, A.z).toFixed(2)], fr: [+B.x.toFixed(2), +B.y.toFixed(2), +B.z.toFixed(2), +G(B.x, B.z).toFixed(2)], root: [+R.x.toFixed(2), +R.y.toFixed(2), +R.z.toFixed(2)], ax: [+f.a.x.toFixed(2), +f.a.z.toFixed(2)], s: f.a.bind.s, init: gl ? gl.init : null, lf: gl ? ['L', 'R'].map((k) => gl.feet[k] && [+(gl.feet[k].pos.x * f.a.bind.s).toFixed(2), +(gl.feet[k].pos.y * f.a.bind.s).toFixed(2), +(gl.feet[k].pos.z * f.a.bind.s).toFixed(2), gl.feet[k].swing ? 1 : 0]) : null }; })() } : { pose: f.f.spec && f.f.spec.pose, y: f.f.y }) }); }
    }
  }
  // 9: a party hull's keel against the ground under it (bow, middle, stern): how far the ground stands over it
  const KP = [[2.05, -0.27], [0, -0.295], [-2.05, -0.27]], V3 = new THREE.Vector3();
  function keelIn(b) {
    if (!b.root || !b.root.parent || b.hidden) return null;
    b.root.updateMatrixWorld(true); let e = -Infinity;
    for (const [x, y] of KP) { V3.set(x, y, 0).applyMatrix4(b.root.matrixWorld); e = Math.max(e, G(V3.x, V3.z) - V3.y); }
    return e;
  }
  // a frame of the canvas as drawn (just after a step, so the drawing buffer still holds it), kept for the strips
  const shots = [];
  function snap(tag, k) { if (!window.__n2shots) return; try { shots.push({ tag, k, url: g.renderer.domElement.toDataURL('image/jpeg', 0.72) }); } catch { /* none */ } }
  window.__n2 = { figs, feet, shown, slope, G, ring, odd, oddFrame, keelIn, snap, shots };
};

const browser = await launch();
let shotN = 0;
// the frames a section kept (n2.snap) written out: <shots>/n2-<tag>-<k>.jpg
async function flushShots(page) {
  if (!SHOTS) return;
  const list = await page.evaluate(() => window.__n2.shots.splice(0));
  for (const q of list) writeFileSync(path.join(SHOTS, `n2-${q.tag}-${String(q.k).padStart(5, '0')}.jpg`), Buffer.from(q.url.split(',')[1], 'base64'));
}
async function shot(page, name) { if (!SHOTS) return; await page.screenshot({ path: path.join(SHOTS, `n2-${String(shotN++).padStart(2, '0')}-${name}.png`) }); }
async function tp(page, x, z, watch = null) {
  await page.evaluate(({ x, z }) => { const g = window.__game; window.__tpDone = false; g.player.teleport(x, z).finally(() => { window.__tpDone = true; }); }, { x, z });
  for (let k = 0; k < 600 && !(await page.evaluate(() => window.__tpDone)); k++) await page.evaluate(() => window.__game.step(1 / 30, 3));
  if (watch) await arrival(page, watch); else await page.evaluate(() => window.__game.step(1 / 30, 20));
}
// 12: just come (a teleport's tiles in, the detail chunks still coming in under everyone): every frame watched, the
// workers let answer between frames
async function arrival(page, tag, n = 360) {
  await page.evaluate(async ({ tag, n }) => { const g = window.__game, N = window.__n2; for (let k = 0; k < n; k++) { g.step(1 / 30, 1); N.oddFrame(tag); await new Promise((q) => setTimeout(q, 3)); } }, { tag, n });
}
// the player on foot at (x, z) looking at (tx, tz)
async function standAt(page, x, z, tx, tz, pitch = -0.12) {
  await page.evaluate(({ x, z, tx, tz, pitch }) => {
    const g = window.__game, p = g.player;
    if (p.mode !== 'walk' && p.stepOut) { p.stepOut(); g.step(1 / 30, 10); }
    p.x = x; p.z = z; if (p.placeOnGround) p.placeOnGround();
    g.chase.setMode('first'); const ch = g.chase; ch.viewYaw = Math.atan2(-(tz - z), tx - x); ch.forwardYaw = ch.viewYaw; ch.viewPitch = pitch; p.heading = ch.viewYaw;
    g.step(1 / 30, 4);
  }, { x, z, tx, tz, pitch });
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); ctx.setDefaultNavigationTimeout(300000); ctx.setDefaultTimeout(900000);
  const page = await openGame(browser, { quiet: true, ctx });
  await seasonAt(page, { ep: 25, year: YEAR, doy: 192, hours: 7.4 });
  await page.evaluate(PROBE);
  if (SHOTS) await page.evaluate(() => { window.__n2shots = true; });
  await page.evaluate(() => window.__game.renderer.setAnimationLoop(null));
  // the home store's yard (Moose Lake), as it is at the start
  const yard = await page.evaluate(() => { const o = window.__game.outfitter, L = (o.visit && o.visit.L) || o.layout(25), r = (q) => q && { x: q.x, z: q.z, y: q.y }; return { door: r(L.door), steps: r(L.stepsFoot), dockFoot: r(L.dockFoot), dockDeck: r(L.dockDeck), centre: r(L.centre) }; });

  // --- 3: a portage carry beside you -------------------------------------------------------------------------------
  if (on('carry')) {
    // (a carry nobody else is on within the hour: one waiting at the landing for another party's carry walks nothing)
    const cands = await page.evaluate(({ YEAR }) => {
      const g = window.__game, P = g.parties; g.day.setClock(YEAR, 193, 6.5); const T = P.today, out = [];
      for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl) continue; for (const s of pl.segs) if (s.kind === 'carry' && s.h0 > 7 && s.h0 < 16 && s.L > 300) out.push({ id: pl.id, p: s.p, h0: s.h0, h1: s.h1, a: s.a, len: s.L, d: Math.hypot(s.a.x - g.player.x, s.a.z - g.player.z) }); }
      const lone = out.filter((c) => !out.some((o) => o !== c && o.p === c.p && o.h0 < c.h1 + 0.2 && c.h0 < o.h1 + 0.2));
      lone.sort((a, b) => a.d - b.d || a.h0 - b.h0); return lone.slice(0, 3);
    }, { YEAR });
    let m = null;
    for (const cc of cands) {
      log('carry:', JSON.stringify(cc));
      await page.evaluate(({ c, YEAR }) => window.__game.day.setClock(YEAR, 193, c.h0 + 0.004), { c: cc, YEAR }); await tp(page, cc.a.x, cc.a.z);
      // beside the first of them on the trail, each second; every frame each drawn walker's step measured
      m = await page.evaluate(async ({ id }) => {
        const g = window.__game, steps = [], speeds = [];
        for (let k = 0; k < 220 && steps.length < 9000; k++) {
          const L = [...g.moves.active.values()].find((x) => x.plan.id === id); if (!L) { g.step(1 / 30, 30); continue; }
          const w = L.persons.find((q) => q.walking && q.bind);
          if (w) { const p = g.player; const hx = Math.cos(w.heading), hz = -Math.sin(w.heading); p.x = w.x + hx * 6 - hz * 2; p.z = w.z + hz * 6 + hx * 2; if (p.placeOnGround) p.placeOnGround(); const ch = g.chase; ch.viewYaw = Math.atan2(-(w.z - p.z), w.x - p.x); ch.forwardYaw = ch.viewYaw; }
          const prev = new Map(L.persons.map((a) => [a, [a.x, a.z, !!(a.walking && a.bind)]]));
          for (let f = 0; f < 30; f++) {
            g.step(1 / 30, 1);
            for (const a of L.persons) { const q = prev.get(a); if (!q) continue; const d = Math.hypot(a.x - q[0], a.z - q[1]); if (q[2] && a.walking && a.bind) { steps.push(d); } q[0] = a.x; q[1] = a.z; q[2] = !!(a.walking && a.bind); }
          }
          for (const a of L.persons) if (a.walking && a.bind) speeds.push(a.vExt || 0);
          if (k % 10 === 0) await new Promise((q) => setTimeout(q, 4));
        }
        steps.sort((a, b) => a - b); speeds.sort((a, b) => a - b);
        const sum = steps.reduce((a, b) => a + b, 0);
        return { n: steps.length, max: +(steps[steps.length - 1] || 0).toFixed(3), mean: +(sum / Math.max(1, steps.length) * 30).toFixed(2), p99: +(steps[Math.floor(steps.length * 0.99)] || 0).toFixed(3), vMed: speeds.length ? +speeds[speeds.length >> 1].toFixed(2) : null };
      }, { id: cc.id });
      log('carry steps', JSON.stringify(m));
      if (m.n > 200) break;
    }
    // (the player's carry is 8 m/s seen, 9 with Shift: a step a frame of 0.3 m, 9 m/s, is the most anyone's is seen at)
    check(3, 'carry pace: on screen no faster than a carry (step a frame <= 0.3 m)', m && m.n > 200 && m.max <= 0.3 && m.mean <= 9, m);
  }

  // --- 10, 12: the ground changed under the people in a frame; the lone frame's foot off the ground -------------------
  if (on('terrain')) {
    await page.evaluate(({ YEAR }) => window.__game.day.setClock(YEAR, 192, 9.6), { YEAR });
    const at = { x: yard.dockFoot.x, z: yard.dockFoot.z, sx: (yard.steps || yard.door).x, sz: (yard.steps || yard.door).z };
    await tp(page, at.x + 4, at.z + 4);
    await standAt(page, at.x + 4, at.z + 4, at.sx, at.sz);
    await step(page, 300);
    // the detail let go and taken again, six times: each chunk installed in a frame of its own, the people measured each
    // frame (the lowest foot of those standing, against the ground as it is after the frame)
    const m = await page.evaluate(async () => {
      const g = window.__game, D = g.tiles.detail, N = window.__n2, out = { frames: 0, installFrames: 0, worstInstall: 0, worstOther: 0, ev: [] };
      const meas = () => { let w = 0, who = null; for (const f of N.figs()) { if (f.floor || f.sit) continue; const q = N.feet(f), e = f.walking ? Math.max(-0.1 * f.sc - q.lo, 0) : Math.max(0.03 * f.sc - q.lo, q.lo - 0.3 * f.sc, 0); if (e > w) { w = e; who = f.key; } } return { w, who }; };
      for (let r = 0; r < 9; r++) {
        D.setEnabled(false); g.step(1 / 30, 3); D.setEnabled(true);
        for (let k = 0; k < 400; k++) {
          await new Promise((q) => setTimeout(q, 4)); // (the workers' chunks come back between frames)
          const i0 = D.stats.installed; g.step(1 / 30, 1); const inst = D.stats.installed - i0, q = meas(); out.frames++; N.oddFrame(inst ? 'terrain: a chunk in' : 'terrain');
          if (inst) { out.installFrames++; if (q.w > out.worstInstall) out.worstInstall = +q.w.toFixed(3); if (q.w > 0.15 && out.ev.length < 6) out.ev.push({ w: +q.w.toFixed(2), who: q.who, inst }); }
          else if (q.w > out.worstOther) out.worstOther = +q.w.toFixed(3);
          if (k > 60 && !inst && D.pending && !D.pending()) break;
        }
      }
      return out;
    });
    log('terrain swaps', JSON.stringify(m));
    check(10, 'a detail chunk in: the people on the new ground that frame (off it <= 0.15 m)', m.installFrames >= 6 && m.worstInstall <= 0.15, m);
  }

  // --- 4: a camp's people by their own names ----------------------------------------------------------------------
  if (on('names')) {
    const c = await page.evaluate(({ YEAR }) => {
      const g = window.__game, P = g.parties; g.day.setClock(YEAR, 192, 7.4); const T = P.today, out = [];
      for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl || pl.to.kind !== 'site' || pl.arrive > 16 || party.size < 3) continue; out.push({ id: pl.id, arrive: pl.arrive, to: { x: pl.to.x, z: pl.to.z }, d: Math.hypot(pl.to.x - g.player.x, pl.to.z - g.player.z) }); }
      out.sort((a, b) => a.d - b.d); return out[0] || null;
    }, { YEAR });
    log('names camp:', JSON.stringify(c));
    await page.evaluate(({ c, YEAR }) => window.__game.day.setClock(YEAR, 192, 19.0), { c, YEAR }); await tp(page, c.to.x, c.to.z, 'camp arrival');
    await step(page, 200);
    await standAt(page, c.to.x + 3, c.to.z + 3, c.to.x, c.to.z);
    // (whatever the earlier sections left up, a card or a word, let it go: the dot is off under it)
    const why = await page.evaluate(async () => {
      const g = window.__game, P = g.pointer, h = g.hud;
      for (let k = 0; k < 300 && !P.usable(false); k++) { if (h && h.paper) { const c = h.papers && h.papers.get(h.paper); if (c) c(); } if (h && h.big && h.closeBig) h.closeBig(); if (g.input) { g.input.once.add && g.input.once.add('Escape'); } g.step(1 / 30, 1); await new Promise((q) => setTimeout(q, 2)); }
      return { usable: P.usable(false), paper: !!(h && h.paper), big: !!(h && h.big), talking: !!(g.dialogue && g.dialogue.talking), quiet: !!(P.quiet && P.quiet()) };
    });
    log('names: the dot', JSON.stringify(why));
    const r = await page.evaluate(async ({ pid }) => {
      const g = window.__game, N = window.__n2, D = [...g.partyCamps.drawn.values()].find((d) => d.party.id === pid); if (!D) return { none: true };
      const out = [];
      for (let k = 0; k < D.v.figs.length; k++) {
        if (!D.v.figs[k]) continue;
        const f = D.v.figs[k], p = g.player; p.x = f.x + 3; p.z = f.z + 1; if (p.placeOnGround) p.placeOnGround(); g.step(1 / 30, 3);
        const q = N.ring(`npc:${D.v.key}#${k}`);
        out.push({ k, label: q ? q.label : null, kind: q ? q.kind : 'undrawn', own: D.v.figNames[k], q });
      }
      return out;
    }, { pid: c.id.split('#')[0] });
    log('names', JSON.stringify(r));
    const hit = Array.isArray(r) ? r.filter((x) => x.label) : [];
    check(4, 'each camp member pointed at shows their own name', hit.length >= 2 && hit.every((x) => x.label === x.own) && new Set(hit.map((x) => x.label)).size === hit.length, r);
  }
  // --- 1, 6, 7, 9: a party loading at its site's landing, pushing off and paddling away -------------------------------
  if (on('launch')) {
    const picks = await page.evaluate(({ YEAR }) => {
      const g = window.__game, P = g.parties; g.day.setClock(YEAR, 193, 6.5); const T = P.today, cands = [];
      for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl || pl.from.kind !== 'site' || pl.start < 7.2 || pl.start > 11) continue; cands.push({ id: pl.id, start: pl.start, d: Math.hypot(pl.from.x - g.player.x, pl.from.z - g.player.z), from: { x: pl.from.x, z: pl.from.z }, size: party.size, n: pl.crew.boats.length }); }
      cands.sort((a, b) => (b.n >= 2) - (a.n >= 2) || a.d - b.d); return cands.slice(0, 3);
    }, { YEAR });
    let M = null;
    for (const pick of picks) {
      log('launch:', JSON.stringify(pick));
      await page.evaluate(({ c, YEAR }) => window.__game.day.setClock(YEAR, 193, c.start - 0.07), { c: pick, YEAR }); await tp(page, pick.from.x, pick.from.z, 'launch arrival');
      for (let k = 0; k < 40 && !(await page.evaluate(({ id }) => { const L = [...window.__game.moves.active.values()].find((x) => x.plan.id === id); return !!(L && L.st && L.persons.length); }, { id: pick.id })); k++) await step(page, 30);
      const ok = await page.evaluate(({ id }) => {
        const g = window.__game, L = [...g.moves.active.values()].find((x) => x.plan.id === id); if (!L || !L.st) return false;
        const S = L.st.from.L, W = g.world, p = g.player;
        for (const [up, al] of [[7, 7], [6, -7], [9, 9], [5, 10], [10, -10], [4, 4]]) { const x = S.x + S.ux * up + S.tx * al, z = S.z + S.uz * up + S.tz * al; if (W.shoreAt(x, z) > 1.2) { if (p.mode !== 'walk' && p.stepOut) { p.stepOut(); g.step(1 / 30, 10); } p.x = x; p.z = z; if (p.placeOnGround) p.placeOnGround(); g.chase.setMode('first'); const ch = g.chase; ch.viewYaw = Math.atan2(-(S.z - z), S.x - x); ch.forwardYaw = ch.viewYaw; ch.viewPitch = -0.15; g.step(1 / 30, 4); return true; } }
        return true;
      }, { id: pick.id });
      if (!ok) continue;
      // every frame through the loading, the push-off and the paddle away; the water route of their first leg taken
      // from them when they push off and held back 15 s (a slow search, as the store's busy hour had it)
      M = await page.evaluate(async ({ id }) => {
        const g = window.__game, N = window.__n2, mv = g.moves, orig = mv.pathOf;
        let L = [...mv.active.values()].find((x) => x.plan.id === id);
        const first = L.plan.segs.find((q) => q.kind === 'paddle');
        mv.pathOf = function (Lg, sg, budget) { if (window.__blockRoute && Lg.id === id && sg === first) return null; return orig.call(this, Lg, sg, budget); };
        const out = { frames: 0, route: { maxStep: 0, vanished: 0, blockedFrames: 0, seenFrames: 0 }, push: [], slopeMax: 0, steepFrames: 0, keel: 0, keelAt: null, seg: {} };
        const prevB = new Map(), board = new Map();
        let blockAt = null;
        for (let k = 0; k < 75 * 30; k++) {
          L = [...mv.active.values()].find((x) => x.plan.id === id); if (!L) break;
          const sg = L.seg ? L.seg.kind : null; out.seg[sg] = (out.seg[sg] || 0) + 1;
          // (the route held back from the frame the paddle leg starts, 15 s)
          if (sg === 'paddle' && blockAt == null) { blockAt = k; }
          if (sg === 'launch' && first && first.pathKey && L.paths.has(first.pathKey) && (L.seg.h1 - g.day.hours) * 3600 / 8 < 6) { L.paths.delete(first.pathKey); window.__blockRoute = true; }
          if (blockAt != null && k - blockAt > 450) window.__blockRoute = false;
          if (window.__blockRoute) out.route.blockedFrames++;
          g.step(1 / 30, 1); out.frames++;
          N.oddFrame('launch'); if (k % 15 === 0 && (sg === 'launch' ? (L.seg.h1 - g.day.hours) * 3600 / 8 < 18 : sg === 'paddle' && k - (blockAt ?? k) < 600)) N.snap('launch', k);
          // the hulls: their step a frame while shown, and any that vanish within 250 m on the water
          L.boats.forEach((b, c) => {
            const pv = prevB.get(c), sh = !b.hidden && !!b.near;
            if (sh && pv && pv.sh) out.route.maxStep = Math.max(out.route.maxStep, +Math.hypot(b.x - pv.x, b.z - pv.z).toFixed(2));
            if (pv && pv.sh && !sh && pv.d < 230 && (L.seg.kind === 'paddle' || L.seg.kind === 'launch')) { out.route.vanished++; if (!out.route.ev) out.route.ev = { d: Math.round(pv.d), seg: L.seg.kind, hidden: !!b.hidden, k }; }
            if (sh && window.__blockRoute) out.route.seenFrames++;
            prevB.set(c, { x: b.x, z: b.z, sh, d: b.dist });
            // 9: held at the bank, the ground over her keel
            if (sh && (sg === 'launch' || sg === 'land' || sg === 'landing')) { const e = N.keelIn(b); if (e != null && e > out.keel) { out.keel = +e.toFixed(2); out.keelAt = { sg, c, beached: b.beached != null ? +b.beached.toFixed(2) : null }; } }
            // 6: from the frame all but the stern are in, to the stern in: how far she went off the bank, the stern's feet
            const crew = L.plan.crew.boats[c] || [], inN = b.crew.length, S0 = L.st.from.L;
            if (sg === 'launch' && crew.length) {
              const r = board.get(c) || { c, n: crew.length };
              if (inN === crew.length - 1 && r.x0 == null && !b.hidden) { r.x0 = b.x; r.z0 = b.z; }
              if (r.x0 != null && inN < crew.length) {
                const stern = L.persons.find((a, i) => crew.includes(i) && !a.boat);
                if (stern && stern.bind) { const f = N.figs().find((q) => q.a === stern); if (f) { const q = N.feet(f); r.footMin = Math.min(r.footMin ?? 9, q.lo); r.pushSeen = (r.pushSeen || 0) + (stern.anim && stern.anim.arms && stern.anim.arms.kind === 'push' ? 1 : 0); } }
              }
              if (r.x0 != null && inN === crew.length && r.out == null) r.out = +(-(b.x - r.x0) * S0.ux - (b.z - r.z0) * S0.uz).toFixed(2);
              board.set(c, r);
            }
          });
          // 7: those standing at the landing (not walking, not stepping in): the slope under them
          L.persons.forEach((a) => {
            if (!a.bind || a.boat || a.v > 0.15 || (a.anim && a.anim.lift > 0)) return;
            const sl = N.slope(a.x, a.z); if (sl > out.slopeMax) out.slopeMax = +sl.toFixed(2); if (sl > 0.8) out.steepFrames++;
          });
          if (k % 15 === 0) await new Promise((q) => setTimeout(q, 2));
          // (the view on the canoes once they are off)
          if (sg === 'paddle' && L.boats[0] && k % 10 === 0) { const b = L.boats[0], e = new g.THREE.Vector3(); g.camera.getWorldPosition(e); const ch = g.chase; ch.viewYaw = Math.atan2(-(b.z - e.z), b.x - e.x); ch.forwardYaw = ch.viewYaw; }
        }
        mv.pathOf = orig; window.__blockRoute = false;
        out.push = [...board.values()];
        return out;
      }, { id: pick.id });
      log('launch measured', JSON.stringify(M)); await flushShots(page);
      if (M && M.seg.launch > 300 && M.seg.paddle > 300) break;
    }
    if (!M) check(1, 'launch scenario', false, 'none');
    else {
      check(1, 'route searched as they push off: no canoe hidden or thrown along in view (step a frame <= 1 m)', M.route.blockedFrames > 300 && M.route.vanished === 0 && M.route.maxStep <= 1.0, M.route);
      const P = M.push.filter((r) => r.out != null);
      check(6, 'the stern pushes her off before getting in (out >= 0.4 m, a foot on the ground, the push seen)', P.length > 0 && P.every((r) => r.out >= 0.4 && r.footMin < 0.12 && r.pushSeen > 10), M.push);
      check(9, 'a canoe held at the bank sits on the ground (the bank over her keel <= 0.12 m)', M.keel <= 0.12, { keel: M.keel, at: M.keelAt });
      results.launch = M;
    }
  }

  // --- 7: where they stand at their landings, on the sites round Moose Lake --------------------------------------------
  // (every leg of the day from or to the six sites nearest the store, and the store's own beach: its places up the bank
  // and beside each canoe, as the parties' code has them once you are by it, against the slope of the ground there)
  if (on('steep')) {
    const sites = await page.evaluate(({ YEAR }) => {
      const g = window.__game, P = g.parties; g.day.setClock(YEAR, 193, 6.5); const T = P.today, by = new Map(), p = g.player, W = g.world;
      const add = (x, z) => { const key = `${Math.round(x / 40)},${Math.round(z / 40)}`; if (!by.has(key)) by.set(key, { x, z, d: Math.hypot(x - p.x, z - p.z) }); };
      for (const { party, k } of P.legsOn(T)) {
        const pl = P.legPlan(party, k); if (!pl) continue;
        for (const e of [pl.from, pl.to]) if (e.kind === 'site') add(e.x, e.z);
        for (const sg of pl.segs) if (sg.kind === 'carry') { const q = W.portages[sg.p]; if (q && q.launch) for (const l of q.launch) add(l.x, l.z); }
      }
      return [...by.values()].sort((a, b) => a.d - b.d).slice(0, 24);
    }, { YEAR });
    const all = { n: 0, steep: 0, worst: 0, ev: [], hulls: 0, keel: 0, keelEv: [] };
    for (const st of sites) {
      await tp(page, st.x, st.z);
      const r = await page.evaluate(async ({ st }) => {
        const g = window.__game, P = g.parties, mv = g.moves, N = window.__n2, T = P.today, out = { n: 0, steep: 0, worst: 0, ev: [], slots: new Map() };
        for (const { party, k } of P.legsOn(T)) {
          const plan = P.legPlan(party, k); if (!plan) continue;
          const L = { plan, party: plan.party, id: plan.id, stations: null, paths: new Map(), boats: [], persons: party.members.map(() => ({})), ready: false, aside: new Map(), off: new Map() };
          const b = plan.box; if (st.x < b[0] - 200 || st.x > b[2] + 200 || st.z < b[1] - 200 || st.z > b[3] + 200) continue;
          for (let w = 0; w < 200 && !L.ready && !L.broken; w++) { if (!mv.prepare(L)) await new Promise((q) => setTimeout(q, 20)); }
          if (!L.st) continue;
          for (const S of [L.st.from, L.st.to, ...[...L.st.carry.values()].flatMap((c) => [c.A, c.B])]) {
            if (Math.hypot(S.L.x - st.x, S.L.z - st.z) > 110) continue;
            const seen = [];
            for (let j = 0; j < party.members.length; j++) mv.spot(S, j, { x: 0, z: 0, h: 0 }, L);
            S.checked = false; mv.checkSpots(S);
            S.spots.forEach((q) => q && seen.push(['spot', q.x, q.z]));
            if (!S.trail) for (const [i, seat] of L.seatOf) { const q = mv.sideOf(L, seat.c, seat.seat, S, i); seen.push(['side', q.x, q.z]); }
            for (const [what, x, z] of seen) { const sl = N.slope(x, z); out.n++; if (sl > out.worst) out.worst = +sl.toFixed(2); if (sl > 0.8) { out.steep++; if (out.ev.length < 4) out.ev.push({ what, kind: S.kind, sl: +sl.toFixed(2), id: plan.id }); } }
            // 9: their canoes as they lie at this landing, each a party hull of the actor layer held in her slot
            const n = plan.crew.boats.length;
            for (let c = 0; c < n; c++) { const o = mv.slot(S, c, n, { x: 0, z: 0, h: 0 }); const key = `${Math.round(o.x)},${Math.round(o.z)},${Math.round(o.h * 10)}`; if (!out.slots.has(key)) out.slots.set(key, o); }
          }
        }
        // (six at a time: the layer draws six hulls whole)
        const list = [...out.slots.values()]; out.slots = list.length; out.keel = 0; out.keelEv = null;
        for (let i = 0; i < list.length; i += 6) {
          const bs = list.slice(i, i + 6).map((o, k) => { const b = g.actors.boat({ key: `n2:keel:${i + k}`, hull: 'aluminium', crew: [], packs: 1 }); b.drive({ x: o.x, z: o.z, heading: o.h, v: 0, snap: true, sim: true, hold: true }); return b; });
          g.step(1 / 30, 45);
          bs.forEach((b) => { const e = N.keelIn(b); if (e != null && e > out.keel) { out.keel = +e.toFixed(2); out.keelEv = { x: Math.round(b.x), z: Math.round(b.z), beached: b.beached != null ? +b.beached.toFixed(2) : null }; } });
          for (const b of bs) b.remove();
        }
        return out;
      }, { st });
      all.n += r.n; all.steep += r.steep; all.worst = Math.max(all.worst, r.worst); all.ev.push(...r.ev.slice(0, 2));
      all.hulls += r.slots; if (r.keel > 0.12) all.keelEv.push(r.keelEv); all.keel = Math.max(all.keel, r.keel);
      log('steep at', JSON.stringify({ x: Math.round(st.x), z: Math.round(st.z) }), JSON.stringify(r));
    }
    check(7, 'nobody stands at a landing on ground steeper than 0.8 (their places up the bank and by the canoes)', all.n > 20 && all.steep === 0, { n: all.n, steep: all.steep, worst: all.worst, ev: all.ev });
    check(9, 'their canoes held at the landings sit on the ground (the bank over a keel <= 0.12 m)', all.hulls > 10 && all.keel <= 0.12, { hulls: all.hulls, keel: all.keel, ev: all.keelEv.slice(0, 6) });
  }

  // --- 11, 12: the store's busiest morning hour, the people through its door -----------------------------------------
  if (on('store')) {
    const h = await page.evaluate(({ YEAR }) => { const g = window.__game, N = g.npcs, P = g.parties; g.day.setClock(YEAR, 192, 7.4); let best = 8.4, n = -1; for (let h = 7.5; h <= 11.5; h += 0.05) { const k = N.storeParties(25, P.today, h).reduce((a, e) => a + Math.min(3, e.party.size), 0); if (k > n) { n = k; best = h; } } return best; }, { YEAR });
    await page.evaluate(({ h, YEAR }) => window.__game.day.setClock(YEAR, 192, h - 0.2), { h, YEAR });
    await tp(page, yard.steps ? yard.steps.x + 5 : yard.door.x + 6, yard.steps ? yard.steps.z + 5 : yard.door.z + 6, 'store arrival');
    await standAt(page, yard.steps ? yard.steps.x + 6 : yard.door.x + 7, yard.steps ? yard.steps.z + 6 : yard.door.z + 7, yard.door.x, yard.door.z, -0.1);
    const m = await page.evaluate(async ({ door }) => {
      const g = window.__game, N = window.__n2, out = { frames: 0, walkers: 0, pairs: 0, close: 0, min: 9, minDoor: 9, ev: [], doorPass: 0 };
      const was = new Map();
      for (let k = 0; k < 9000; k++) {
        g.step(1 / 30, 1); out.frames++;
        if (k % 3 === 0) N.oddFrame('store'); if (k % 300 === 0) N.snap('store', k);
        const fs = N.figs().filter((f) => f.src === 'store');
        const pos = fs.map((f) => ({ key: f.key, x: f.f.x, z: f.f.z, w: f.walking, nd: Math.hypot(f.f.x - door.x, f.f.z - door.z) < 3.2, st: `${f.f.path ? f.f.path.length : 0}/${f.f.spec && f.f.spec.pose}/${f.f.at}/${f.f.where}/${(f.f.wv || 0).toFixed(2)}` }));
        for (const q of pos) { if (q.w) out.walkers++; const w0 = was.get(q.key); if (w0 != null && !w0 && q.nd) out.doorPass++; was.set(q.key, q.nd); }
        for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
          const a = pos[i], b = pos[j]; if (!a.w && !b.w) continue;
          const d = Math.hypot(a.x - b.x, a.z - b.z); out.pairs++;
          if (d < out.min) out.min = +d.toFixed(2);
          if ((a.nd || b.nd) && d < out.minDoor) out.minDoor = +d.toFixed(2);
          if (d < 0.3) { out.close++; if (out.ev.length < 6 || (out.ev.length < 14 && k > out.ev[out.ev.length - 1].k + 60)) out.ev.push({ a: a.key, b: b.key, d: +d.toFixed(2), door: a.nd || b.nd, k, sa: a.st, sb: b.st }); }
        }
        if (k % 30 === 0) await new Promise((q) => setTimeout(q, 2));
      }
      return out;
    }, { door: yard.door });
    log('store door', JSON.stringify(m)); await flushShots(page);
    check(11, 'two people walking in the store and its yard never walk through each other (apart >= 0.3 m)', m.pairs > 2000 && m.close === 0, m);
  }

  // --- 5, 8: a camp's evening walks, the night in the tents, the morning out of them --------------------------------
  if (on('camp')) {
    const c = await page.evaluate(({ YEAR }) => {
      const g = window.__game, P = g.parties; g.day.setClock(YEAR, 192, 7.4); const T = P.today, out = [];
      for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl || pl.to.kind !== 'site' || pl.arrive > 16.5 || party.size < 3) continue; const st = pl.to.stay; if (!st || st.end <= T) continue; out.push({ id: pl.id, arrive: pl.arrive, to: { x: pl.to.x, z: pl.to.z }, d: Math.hypot(pl.to.x - g.player.x, pl.to.z - g.player.z) }); }
      out.sort((a, b) => a.d - b.d); return out[0] || null;
    }, { YEAR });
    log('camp:', JSON.stringify(c));
    const pid = c.id.split('#')[0];
    await page.evaluate(({ YEAR }) => window.__game.day.setClock(YEAR, 192, 17.6), { YEAR }); await tp(page, c.to.x, c.to.z, 'camp arrival');
    // (on the bank 10 m off the camp, looking at it)
    const look = async () => {
      const at = await page.evaluate(({ pid }) => { const g = window.__game, D = [...g.partyCamps.drawn.values()].find((d) => d.party.id === pid); if (!D) return null; const F = D.site.layout.fire, W = g.world; for (let k = 0; k < 16; k++) { const a = k * 0.4, x = F.x + Math.cos(a) * 11, z = F.z + Math.sin(a) * 11; if (W.shoreAt(x, z) > 1.5) return { x, z, tx: F.x, tz: F.z }; } return { x: F.x + 9, z: F.z, tx: F.x, tz: F.z }; }, { pid });
      if (at) await standAt(page, at.x, at.z, at.tx, at.tz, -0.2);
    };
    await look();
    const WATCH = async (frames, tag) => page.evaluate(async ({ pid, frames, tag }) => {
      const g = window.__game, N = window.__n2, D = [...g.partyCamps.drawn.values()].find((d) => d.party.id === pid);
      const out = { frames: 0, walkFrames: 0, through: 0, ev: [], appear: [], tag };
      if (!D) { out.none = true; return out; }
      const tents = D.obstacles.filter((o) => o.tent), F = D.site.layout.fire;
      const inTent = (x, z, m) => tents.findIndex((t) => { const dx = x - t.x, dz = z - t.z, a = dx * t.ux + dz * t.uz, b = -dx * t.uz + dz * t.ux; return Math.abs(a) < t.hx + m && Math.abs(b) < t.hz + m; });
      let prev = new Set(D.v.figs.filter(Boolean)); const born = new Map();
      for (let k = 0; k < frames; k++) {
        g.step(1 / 30, 1); out.frames++; N.oddFrame(tag); if (tag === 'camp morning' && k > 300 && k < 700 && k % 12 === 0) N.snap('morning', k); if (tag !== 'camp morning' && k % 150 === 0) N.snap('campwalk', k);
        const now = new Set(D.v.figs.filter(Boolean));
        for (const f of now) if (!prev.has(f)) { const ti = inTent(f.x, f.z, 0); out.appear.push({ k, fromTent: ti >= 0, d: +Math.hypot(f.x - F.x, f.z - F.z).toFixed(1) }); born.set(f, { k, ti }); }
        prev = now;
        for (const f of now) {
          if (!(f.path && f.path.length)) continue;
          out.walkFrames++;
          const b = born.get(f), ti = inTent(f.x, f.z, -0.1), fire = Math.hypot(f.x - F.x, f.z - F.z) < 0.6;
          if ((ti >= 0 && !(b && b.ti === ti && k - b.k < 150)) || fire) { out.through++; if (out.ev.length < 5) out.ev.push({ k, tent: ti, fire }); }
        }
        if (k % 15 === 0) await new Promise((q) => setTimeout(q, 2));
      }
      return out;
    }, { pid, frames, tag });
    const walks = { frames: 0, walkFrames: 0, through: 0, ev: [] }, outs = [];
    for (const hh of [17.7, 18.6, 19.4, 20.3, 21.0]) {
      await page.evaluate(({ hh, YEAR }) => { const g = window.__game; g.day.setClock(YEAR, 192, hh); g.step(1 / 30, 40); }, { hh, YEAR });
      const r = await WATCH(900, `camp ${hh}`);
      walks.frames += r.frames; walks.walkFrames += r.walkFrames; walks.through += r.through; walks.ev.push(...r.ev.slice(0, 2));
    }
    log('camp walks', JSON.stringify(walks));
    // the night in the tents, then the morning: who comes out, and from where
    await page.evaluate(({ YEAR }) => { const g = window.__game; g.day.setClock(YEAR, 192, 22.4); g.step(1 / 30, 60); g.day.setClock(YEAR, 193, 6.47); g.step(1 / 30, 3); }, { YEAR });
    await look();
    const mo = await WATCH(1500, 'camp morning');
    log('camp morning', JSON.stringify({ appear: mo.appear, through: mo.through, walkFrames: mo.walkFrames })); await flushShots(page);
    check(8, 'a camp walk never goes through a tent or the fire ring', walks.walkFrames + mo.walkFrames > 100 && walks.through + mo.through === 0, { walkFrames: walks.walkFrames + mo.walkFrames, through: walks.through + mo.through, ev: walks.ev.concat(mo.ev).slice(0, 6) });
    check(5, 'in the morning they come out of a tent (each appears in a tent’s door)', mo.appear.length > 0 && mo.appear.every((q) => q.fromTent), mo.appear);
  }

  // --- 2: the hand-over between a party and its camp, as they come in and as they go ---------------------------------
  // Each frame: every hull there is (a party canoe in the water, one on someone's shoulders, the camp's on the bank); one
  // appearing where no hull was a moment before (2.5 m), or going from where none is now, is a pop. And the people: the
  // camp's first drawn where the party's last stood (or the party's first where the camp's last stood, or in a tent)
  const HAND = (pid, key, tag, frames, which) => page.evaluate(async ({ pid, key, tag, frames, which }) => {
    const g = window.__game, N = window.__n2, mv = g.moves, C = g.partyCamps, p = g.player;
    const out = { frames: 0, pops: 0, popEv: [], people: [], doubles: 0, dropped: null, hulls: 0 };
    let prevH = null, prevParty = null, prevCamp = null, legWas = true;
    const camp = () => { const D = C.drawn.get(key); return D && D.party.id === pid ? D : null; };
    for (let k = 0; k < frames; k++) {
      g.step(1 / 30, 1); out.frames++; N.oddFrame(tag); if (k % 20 === 0) N.snap(tag, k);
      const L = [...mv.active.values()].find((x) => x.party.id === pid && (which === 'in' ? x.plan.to.key === key : x.plan.from.key === key));
      const D = camp(), H = [];
      if (L) {
        for (const b of L.boats) if (!b.hidden && b.near) H.push({ x: b.x, z: b.z, w: 'water' });
        for (const a of L.persons) if (a.mode === 'carry' && a.hull && !a.hidden) H.push({ x: a.x, z: a.z, w: 'shoulders' });
      }
      if (D && D.canoesIn) for (const o of D.canoeObs) H.push({ x: o.x, z: o.z, w: 'bank' });
      out.hulls = Math.max(out.hulls, H.length);
      const nearMe = (q) => Math.hypot(q.x - p.x, q.z - p.z) < 70;
      if (prevH) {
        for (const q of H) if (nearMe(q) && !prevH.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 2.5)) { out.pops++; if (out.popEv.length < 6) out.popEv.push({ k, appear: q.w, at: [+q.x.toFixed(1), +q.z.toFixed(1)], prev: prevH.map((o) => [o.w, +o.x.toFixed(1), +o.z.toFixed(1)]) }); }
        for (const o of prevH) if (nearMe(o) && !H.some((q) => Math.hypot(o.x - q.x, o.z - q.z) < 2.5)) { out.pops++; if (out.popEv.length < 6) out.popEv.push({ k, gone: o.w }); }
      }
      prevH = H;
      if (window.__dbgHand && L && L.arrive && k < 140 && k % 4 === 0) { const X = L.arrive, tl = (L.seg.h1 - (g.day.hours - mv.lagOf(L.party.id))) * 3600 / 8; (out.dbg || (out.dbg = [])).push({ k, tl: +tl.toFixed(1), seg: L.seg.kind, cr: [...X.carry.entries()].map(([i, cr]) => ({ i, c: cr.c, up: +cr.up.toFixed(1), dur: +cr.dur.toFixed(1), fx: !!cr.fixed, from: [+cr.from.x.toFixed(1), +cr.from.z.toFixed(1)], to: [+cr.to.x.toFixed(1), +cr.to.z.toFixed(1)], a: [+L.persons[i].x.toFixed(1), +L.persons[i].z.toFixed(1), L.persons[i].mode], b: [+L.boats[cr.c].x.toFixed(1), +L.boats[cr.c].z.toFixed(1), L.boats[cr.c].hidden] })) }); }
      // the people: who of the party is drawn on foot, who of the camp
      const party = L ? L.persons.filter((a) => a.bind && !a.boat).map((a) => ({ x: a.x, z: a.z })) : [];
      // (one of the party drawn on foot moved over 0.6 m in a frame: a jump)
      if (L) for (const a of L.persons) { const q = out.lastP || (out.lastP = new Map()), o = q.get(a); if (a.bind && !a.boat && o && o.on) { const d = Math.hypot(a.x - o.x, a.z - o.z); if (d > 0.6) { out.jumps = (out.jumps || 0) + 1; if (!out.jumpEv) out.jumpEv = []; if (out.jumpEv.length < 5) out.jumpEv.push({ k, d: +d.toFixed(2), i: L.persons.indexOf(a), seg: L.seg && L.seg.kind, mode: a.mode }); } } q.set(a, { x: a.x, z: a.z, on: !!(a.bind && !a.boat) }); }
      const campF = D ? D.v.figs.filter(Boolean).map((f) => ({ x: f.x, z: f.z })) : [];
      const tents = D ? D.obstacles.filter((o) => o.tent) : [];
      const inTent = (q) => tents.some((t) => { const dx = q.x - t.x, dz = q.z - t.z, a = dx * t.ux + dz * t.uz, b = -dx * t.uz + dz * t.ux; return Math.abs(a) < t.hx + 0.2 && Math.abs(b) < t.hz + 0.2; });
      if (L && D && L.persons.some((a, i) => a.bind && !a.boat && D.figs[i] && D.v.figs.includes(D.figs[i]))) out.doubles++; // (one of them drawn twice: the camp's and the party's)
      if (which === 'in' && prevParty && prevParty.length && !party.length && campF.length) {
        // (the party let go this frame: the camp's people where the party's were)
        out.dropped = k;
        for (const q of campF) { const d = Math.min(...prevParty.map((o) => Math.hypot(o.x - q.x, o.z - q.z))); out.people.push(+d.toFixed(2)); }
      }
      if (which === 'out' && prevCamp && prevCamp.length && !campF.length && party.length) {
        out.dropped = k;
        for (const q of party) { const d = Math.min(...prevCamp.map((o) => Math.hypot(o.x - q.x, o.z - q.z))); out.people.push(inTent(q) ? 0 : +d.toFixed(2)); }
      }
      prevParty = party; prevCamp = campF; legWas = !!L;
      if (k % 15 === 0) await new Promise((q) => setTimeout(q, 2));
    }
    void legWas;
    return out;
  }, { pid, key, tag, frames, which });
  const watchLanding = async (S) => {
    const at = await page.evaluate(({ S }) => { const W = window.__game.world; for (const [up, al] of [[8, 6], [7, -6], [10, 8], [6, 10], [12, -9]]) { const x = S.x + S.ux * up + S.tx * al, z = S.z + S.uz * up + S.tz * al; if (W.shoreAt(x, z) > 1.5) return { x, z }; } return { x: S.x + S.ux * 9, z: S.z + S.uz * 9 }; }, { S });
    await standAt(page, at.x, at.z, S.x + S.ux * 3, S.z + S.uz * 3, -0.2);
  };
  if (on('arrive')) {
    const picks = await page.evaluate(({ YEAR }) => {
      const g = window.__game, P = g.parties; g.day.setClock(YEAR, 192, 7.4); const T = P.today, out = [];
      for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl || pl.to.kind !== 'site' || pl.arrive < 12 || pl.arrive > 17.5 || pl.crew.boats.length < 2) continue; out.push({ id: pl.id, pid: party.id, key: pl.to.key, arrive: pl.arrive, end: pl.end, to: { x: pl.to.x, z: pl.to.z }, d: Math.hypot(pl.to.x - g.player.x, pl.to.z - g.player.z) }); }
      out.sort((a, b) => a.d - b.d); return out.slice(0, 3);
    }, { YEAR });
    let R = null;
    for (const c of picks) {
      log('arrive:', JSON.stringify(c));
      await page.evaluate(({ c, YEAR }) => window.__game.day.setClock(YEAR, 192, c.arrive - 0.12), { c, YEAR }); await tp(page, c.to.x, c.to.z, 'arrive arrival');
      const S = await page.evaluate(({ id }) => { for (let k = 0; k < 40; k++) { const L = [...window.__game.moves.active.values()].find((x) => x.plan.id === id); if (L && L.st) { const q = L.st.to.L; return { x: q.x, z: q.z, ux: q.ux, uz: q.uz, tx: q.tx, tz: q.tz }; } window.__game.step(1 / 30, 15); } return null; }, { id: c.id });
      if (!S) continue;
      await watchLanding(S);
      // (to the last minute of their landing, then every frame through the hand-over)
      await page.evaluate(({ c, YEAR }) => { const g = window.__game; g.day.setClock(YEAR, 192, c.end - 0.075); g.step(1 / 30, 30); }, { c, YEAR });
      if (process.env.DBG) await page.evaluate(() => { window.__dbgHand = true; });
      R = await HAND(c.pid, c.key, 'arrive', 1500, 'in');
      if (R.dbg) for (const q of R.dbg) log('dbg', JSON.stringify(q)); delete R.dbg;
      log('arrive measured', JSON.stringify(R)); await flushShots(page);
      if (R.dropped != null) break;
    }
    check(2, 'as they come in, no canoe pops between the water and the camp’s bank; the camp’s people start where the party’s stood (<= 0.6 m)', R && R.dropped != null && R.pops === 0 && !R.jumps && R.people.length > 0 && R.people.every((d) => d <= 0.6), R);
  }
  if (on('depart')) {
    const picks = await page.evaluate(({ YEAR }) => {
      const g = window.__game, P = g.parties; g.day.setClock(YEAR, 193, 6.5); const T = P.today, out = [];
      for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl || pl.from.kind !== 'site' || pl.start < 7.4 || pl.start > 11 || pl.crew.boats.length < 2) continue; out.push({ id: pl.id, pid: party.id, key: pl.from.key, h0: pl.segs[0].h0, from: { x: pl.from.x, z: pl.from.z }, d: Math.hypot(pl.from.x - g.player.x, pl.from.z - g.player.z) }); }
      out.sort((a, b) => a.d - b.d); return out.slice(0, 3);
    }, { YEAR });
    let R = null;
    for (const c of picks) {
      log('depart:', JSON.stringify(c));
      await page.evaluate(({ c, YEAR }) => window.__game.day.setClock(YEAR, 193, c.h0 - 0.06), { c, YEAR }); await tp(page, c.from.x, c.from.z, 'depart arrival');
      const S = await page.evaluate(({ id }) => { for (let k = 0; k < 60; k++) { const L = [...window.__game.moves.active.values()].find((x) => x.plan.id === id); if (L && L.st) { const q = L.st.from.L; return { x: q.x, z: q.z, ux: q.ux, uz: q.uz, tx: q.tx, tz: q.tz }; } window.__game.step(1 / 30, 15); } return null; }, { id: c.id });
      if (!S) continue;
      await watchLanding(S);
      await page.evaluate(({ c, YEAR }) => { const g = window.__game; g.day.setClock(YEAR, 193, c.h0 - 0.012); g.step(1 / 30, 3); }, { c, YEAR });
      R = await HAND(c.pid, c.key, 'depart', 1200, 'out');
      log('depart measured', JSON.stringify(R)); await flushShots(page);
      if (R.dropped != null) break;
    }
    check(2, 'as they go, no canoe pops off the camp’s bank into the water, nobody stands twice over; the party’s people start where the camp’s stood or in a tent (<= 0.6 m)', R && R.dropped != null && R.pops === 0 && !R.jumps && R.doubles === 0 && R.people.length > 0 && R.people.every((d) => d <= 0.6), R);
  }

  // --- 12: over all of it, a standing foot far off the ground a lone frame -------------------------------------------
  if (on('launch') || on('store') || on('camp') || on('arrive') || on('depart') || on('names') || on('terrain')) {
    const odd = await page.evaluate(() => window.__n2.odd);
    // (traced: the lone frame's foot off the ground was a detail chunk installed under the people after they had stood
    // on the old ground that frame: the terrain section's chunks in, and every arrival, are where it showed)
    check(12, 'no standing foot 0.35 m under or 0.45 m over the ground in any frame watched (arrivals, chunks coming in)', odd.frames > 1000 && odd.n === 0, odd);
  }

  if (SHOTS) writeFileSync(path.join(SHOTS, 'r2-npc2-test.json'), JSON.stringify(results, null, 1));
} finally { await browser.close(); }
const fails = results.filter((r) => !r.ok);
log(`r2 npc2: ${results.length - fails.length}/${results.length} passed`, fails.length ? `failed: ${fails.map((f) => f.n).join(', ')}` : '');
process.exit(fails.length ? 1 : 0);
