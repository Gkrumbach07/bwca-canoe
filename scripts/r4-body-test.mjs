// Round 4, stream BODY: the player and people. Headless Chromium against a running Vite; each check printed PASS or
// FAIL, a screenshot at each step (--shots <dir>):
//   1 the life jacket: off in the store (the player on foot, the store's people), on in the canoe on the water, the
//     actors' crews wearing theirs and their portagers not; worn or not adds no shader program
//   2 over the shoulder: at 2.5 m from the staffer (the guide's step) the chase eases over his shoulder so her face and
//     the gem are in view and not behind his body; the ease is smooth (no frame's jump); facing away it eases back
//   3 the tents: a party's tents wait as packed bags, are spread out and rise after they land, one after another, then
//     stand in the camp's one mesh (its draw range whole again); on the day they go, they come down before they push off
//   4 no page errors
//
//   npx vite --port 5501 --strictPort &
//   APP=http://localhost:5501 node scripts/r4-body-test.mjs [--home 31] [--shots <dir>]   (ONLY=pfd,ots,tents)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, openGame, log, until } from './gl-e-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const HOME = Number(arg('home', 31));
const SHOTS = arg('shots', null) ? path.resolve(arg('shots')) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean), on = (k) => !ONLY.length || ONLY.includes(k);
const results = [];
const check = (n, name, ok, info) => { results.push({ n, name, ok: !!ok, info }); log(`${ok ? 'PASS' : 'FAIL'} ${n} ${name}`, JSON.stringify(info).slice(0, 1500)); };

const HELPERS = () => {
  const g = window.__game, T = g.THREE, H = window.__r4 = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.programs = () => { g.step(1 / 60, 1); return g.renderer.info.programs.length; };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  // stand d metres from a point, facing it (heading: x = cos h, z = -sin h)
  H.face = (q, d, ang = 0) => {
    const p = g.player, a = Math.atan2(p.z - q.z, p.x - q.x) + ang;
    const x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d;
    H.standAt(x, z, Math.atan2(-(q.z - z), q.x - x));
    g.chase.viewYaw = g.player.heading; g.chase.forwardYaw = g.player.heading; g.chase.viewPitch = 0;
  };
  // a close-up of the player from in front (chase.focus) for the life-jacket shots; unframe lets it go
  H.frontShot = (back = 2.6, up = 1.45) => {
    const p = g.player, f = p.forward, y = (p.altitude ?? p.groundAt(p.x, p.z));
    g.chase.focus = { pos: new T.Vector3(p.x + f.x * back - f.z * 0.6, y + up, p.z + f.z * back + f.x * 0.6), look: new T.Vector3(p.x, y + 1.0, p.z) };
    g.chase.first = true; H.step(3);
  };
  H.lookAt = (pos, look) => { g.chase.focus = { pos: new T.Vector3(pos.x, pos.y, pos.z), look: new T.Vector3(look.x, look.y, look.z) }; g.chase.first = true; H.step(2); };
  H.unframe = () => { g.chase.focus = null; g.chase.snap(); H.step(2); };
  // what is first along the line from the camera to a point: the player's own figure or hat, something else, or nothing
  const ray = new T.Raycaster();
  const shown = (o) => { for (let q = o; q; q = q.parent) { if (!q.visible) return false; if (q.name === 'r3-locator') return false; } return true; };
  H.firstHit = (pt) => {
    const c = g.camera.position, d = new T.Vector3(pt.x, pt.y, pt.z).sub(c), L = d.length();
    ray.set(c, d.normalize()); ray.far = L - 0.15; ray.camera = g.camera;
    const me = new Set([g.canoe.figure.mesh, g.canoe.figure.hat]);
    const hs = ray.intersectObjects(g.scene.children, true).filter((h) => h.object.isMesh && shown(h.object) && !(h.object.material && h.object.material.colorWrite === false));
    if (!hs.length) return 'clear';
    return me.has(hs[0].object) ? 'me' : hs[0].object.name || hs[0].object.type;
  };
  H.ndc = (pt) => { const v = new T.Vector3(pt.x, pt.y, pt.z).project(g.camera); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; };
  H.onScreen = (v) => Math.abs(v[0]) < 0.95 && Math.abs(v[1]) < 0.95 && v[2] < 1;
  return true;
};

const browser = await launch();
const errors = [];
let page;
const shot = async (name) => { if (!SHOTS) return; const f = path.join(SHOTS, `r4-${name}.png`); await page.screenshot({ path: f }); log('shot', f); };
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); ctx.setDefaultTimeout(900000);
  page = await openGame(browser, { quiet: true, ctx });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.onboarding && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  const p0 = await page.evaluate(() => window.__game.renderer.info.programs.length);
  log('title programs', p0);
  // a new adventure season at home, the onboarding's first step (the staffer) open
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0, null, 120000);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); g.day.setClock(g.day.year, g.day.doy, 9.5); g.chase.setMode('third'); window.__r4.step(30); });
  // (the page's own loop stopped: every frame is the rig's, so a shot is of the state measured)
  await page.evaluate(() => window.__game.renderer.setAnimationLoop(null));

  // --- 2: over the shoulder by the staffer ---------------------------------------------------------------------------
  if (on('ots')) {
    const measure = async (tag, off) => page.evaluate(async ({ off }) => {
      const g = window.__game, H = window.__r4, ch = g.chase, cur = g.guide.current();
      if (!cur || !cur.target || cur.target.kind !== 'person') return { cur: cur && cur.id, kind: cur && cur.target && cur.target.kind };
      // (placed and settled with the shoulder held off, so the trace starts from the usual chase at rest)
      Object.defineProperty(ch, 'story', { configurable: true, get: () => null, set: () => {} });
      const r = g.guide.reach(cur); H.face(r.pos, 2.5); H.step(2); ch.snap(); H.step(45);
      if (!off) { delete ch.story; ch.story = null; }
      // (frame by frame: the ease and the camera's moves)
      const trace = []; let last = g.camera.position.clone(), jump = 0;
      for (let k = 0; k < 90; k++) { H.step(1); const c = g.camera.position; jump = Math.max(jump, c.distanceTo(last)); last = c.clone(); trace.push(+ch.ots.toFixed(3)); }
      const sp = g.guide.reach(cur).pos, face = { x: sp.x, y: sp.y - 0.5, z: sp.z }, chest = { x: sp.x, y: sp.y - 0.85, z: sp.z };
      const gem = g.locator.shown().find((q) => q.main) || null;
      const out = { cur: cur.id, d: +Math.hypot(g.player.x - sp.x, g.player.z - sp.z).toFixed(2), ots: +ch.ots.toFixed(3), maxStep: Math.max(...trace.slice(1).map((v, i) => Math.abs(v - trace[i]))), jump: +jump.toFixed(3),
        face: H.firstHit(face), chest: H.firstHit(chest), faceNdc: H.ndc(face), gem: gem ? { hit: H.firstHit(gem), ndc: H.ndc(gem) } : null, cam: g.camera.position.toArray().map((v) => +v.toFixed(2)), dot: g.pointer && g.pointer.target ? `${g.pointer.target.kind}:${g.pointer.target.label || ''}` : null };
      return out;
    }, { off });
    const before = await measure('before', true);
    await shot('2a-staffer-chase-before');
    await page.evaluate(() => { const ch = window.__game.chase; delete ch.story; ch.story = null; });
    const after = await measure('after', false);
    await shot('2b-staffer-over-shoulder');
    log('ots before', JSON.stringify(before)); log('ots after', JSON.stringify(after));
    check(2, 'over the shoulder at 2.5 m from the staffer: her face and the gem in view, not behind his body', after.cur === 'story:onboard:talk' && after.ots > 0.95 && after.face !== 'me' && after.chest !== 'me' && H_on(after.faceNdc) && after.gem && after.gem.hit !== 'me' && H_on(after.gem.ndc), { before, after });
    check(2, 'the dot is on her over his shoulder (E talks to her)', /^person:/.test(after.dot || ''), { dot: after.dot, before: before.dot });
    check(2, 'the ease is smooth (ots under 0.12 a frame; the camera under 0.35 m a frame at 30 fps)', after.maxStep < 0.12 && after.jump < 0.35, { maxStep: after.maxStep, jump: after.jump });
    const back = await page.evaluate(async () => {
      const g = window.__game, H = window.__r4, ch = g.chase, p = g.player;
      p.heading += Math.PI; ch.viewYaw = p.heading; ch.forwardYaw = p.heading; const tr = [];
      for (let k = 0; k < 90; k++) { H.step(1); tr.push(+ch.ots.toFixed(3)); }
      return { end: tr[tr.length - 1], maxStep: Math.max(...tr.slice(1).map((v, i) => Math.abs(v - tr[i]))) };
    });
    await shot('2c-turned-away');
    check(2, 'facing away from her it eases back to the usual chase', back.end < 0.05 && back.maxStep < 0.12, back);
  }

  // --- 1: the life jacket ----------------------------------------------------------------------------------------------
  if (on('pfd')) {
    const store = await page.evaluate(async () => {
      const g = window.__game, H = window.__r4, o = g.outfitter, L = o.layout(o.visit.ep), at = L.counter || L.centre;
      H.standAt(at.x + 0.6, at.z + 0.6, g.player.heading); H.step(20);
      const fig = g.canoe.figure, bodies = (g.npcs.bodies || []).filter((b) => b.group.visible && b.who);
      const out = { mode: g.player.mode, pfd: fig.pfd, range: fig.mesh.geometry.drawRange.count, keepers: bodies.map((b) => b.fig.pfd), pA: H.programs() };
      H.frontShot();
      return out;
    });
    await shot('1a-store-no-pfd');
    await page.evaluate(() => window.__r4.unframe());
    check(1, 'in the store on foot: no life jacket on him, none on the store\'s people', store.mode === 'walk' && store.pfd === false && store.range < 20000 && store.keepers.length > 0 && store.keepers.every((v) => v === false), store);
    // to the water: Lake One's open middle, in the canoe
    const lake = await page.evaluate(() => { const w = window.__game.world, ep = w.entryPoints.find((e) => e.name === 'Lake One') || w.entryPoints[0], lk = (w.lakes || []).find((l) => l && l.id === ep.lake); return lk ? { x: lk.cx, z: lk.cz } : { x: ep.x, z: ep.z }; });
    await page.evaluate(({ x, z }) => { const g = window.__game; window.__tpDone = false; g.player.teleport(x, z).finally(() => { window.__tpDone = true; }); }, lake);
    for (let k = 0; k < 600 && !(await page.evaluate(() => window.__tpDone)); k++) await page.evaluate(() => window.__game.step(1 / 30, 3));
    const water = await page.evaluate(async () => {
      const g = window.__game, H = window.__r4; H.step(60);
      const fig = g.canoe.figure, out = { mode: g.player.mode, pfd: fig.pfd, range: fig.mesh.geometry.drawRange.count, pB: H.programs() };
      // the actors' demo: two canoes crossing and a party on a portage
      out.demo = !!g.actors.demo(); H.step(10);
      // (the camera beside each of them in turn: the actors' layer draws figures within 60 m of the view)
      const near = (a) => { const y = g.world.levelAt(a.x, a.z); H.lookAt({ x: a.x + 9, y: y + 4, z: a.z + 9 }, { x: a.x, y: y + 0.5, z: a.z }); H.step(20); };
      const boat = g.actors.boats.find((b) => b.key.startsWith('demo:boat'));
      if (boat) near(boat);
      out.crew = g.actors.people.filter((p) => p.bind && p.mode === 'crew').map((p) => p.bind.body.fig.pfd);
      if (boat) { const y = g.world.levelAt(boat.x, boat.z); H.lookAt({ x: boat.x + 6, y: y + 2.5, z: boat.z + 6 }, { x: boat.x, y: y + 0.5, z: boat.z }); }
      out.crewShot = true;
      return out;
    });
    await shot('1c-actors-crew-pfd');
    Object.assign(water, await page.evaluate(async () => {
      const g = window.__game, H = window.__r4, out = {};
      const port = g.actors.people.find((p) => p.key.startsWith('demo:portage'));
      if (port) { const y = g.tiles.groundAt(port.x, port.z); H.lookAt({ x: port.x + 7, y: y + 3, z: port.z + 7 }, { x: port.x, y: y + 1, z: port.z }); H.step(30); }
      out.carry = g.actors.people.filter((p) => p.bind && !p.boat && (p.mode === 'carry' || p.mode === 'walk' || p.mode === 'stand')).map((p) => p.bind.body.fig.pfd);
      out.portage = !!port;
      return out;
    }));
    await shot('1d-actors-portage-no-pfd');
    Object.assign(water, await page.evaluate(async () => {
      const g = window.__game, H = window.__r4, out = {};
      const p = g.player, f = p.forward, y = g.world.levelAt(p.x, p.z);
      H.lookAt({ x: p.x + f.x * 2.4 - f.z * 1.6, y: y + 1.3, z: p.z + f.z * 2.4 + f.x * 1.6 }, { x: p.x, y: y + 0.7, z: p.z });
      out.pC = H.programs();
      return out;
    }));
    await shot('1b-canoe-pfd');
    await page.evaluate(() => window.__r4.unframe());
    check(1, 'in the canoe on the water: the life jacket on (the whole figure drawn)', water.mode === 'paddle' && water.pfd === true && water.range === Infinity, water);
    check(1, 'the actors: crews in their canoes wear one, those on a portage do not', water.crew.length > 0 && water.crew.every(Boolean) && water.carry.length > 0 && water.carry.every((v) => !v), { crew: water.crew, carry: water.carry, portage: water.portage });
    check(1, 'worn or not adds no shader program', water.pB <= store.pA && water.pC <= store.pA, { store: store.pA, canoe: water.pB, actors: water.pC, title: p0 });
    await page.evaluate(() => { const g = window.__game; for (const a of [...g.actors.boats, ...g.actors.people]) if (a.key.startsWith('demo:')) a.remove(); window.__r4.step(5); });
  }

  // --- 3: the tents ---------------------------------------------------------------------------------------------------
  if (on('tents')) {
    const pick = await page.evaluate(() => {
      const g = window.__game, P = g.parties; g.day.setClock(g.day.year, g.day.doy, 7.4); const T = P.today, out = [];
      for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl || pl.to.kind !== 'site' || pl.arrive < 10 || pl.arrive > 16.5 || party.tents < 1) continue; out.push({ id: party.id, key: pl.to.key, arrive: pl.arrive, to: { x: pl.to.x, z: pl.to.z }, tents: party.tents }); }
      out.sort((a, b) => b.tents - a.tents || a.arrive - b.arrive); return out.slice(0, 4);
    });
    log('tent picks', JSON.stringify(pick));
    let R = null;
    for (const c of pick) {
      await page.evaluate(({ c }) => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, c.arrive - 0.02); }, { c });
      await page.evaluate(({ x, z }) => { const g = window.__game; window.__tpDone = false; g.player.teleport(x, z).finally(() => { window.__tpDone = true; }); }, c.to);
      for (let k = 0; k < 600 && !(await page.evaluate(() => window.__tpDone)); k++) await page.evaluate(() => window.__game.step(1 / 30, 3));
      R = await page.evaluate(async ({ c }) => {
        const g = window.__game, H = window.__r4, C = g.partyCamps;
        const camp = () => { const D = C.drawn.get(c.key); return D && D.party.id === c.id ? D : null; };
        for (let k = 0; k < 60 && !camp(); k++) H.step(15);
        const D = camp(); if (!D) return { none: true, drawn: [...C.drawn.keys()] };
        H.step(10);
        const out = { tents: D.tentList.length, pitchAt: D.pitchAt, h0: +g.day.hours.toFixed(3), samples: [], stoop: 0, frames: 0, pP: null };
        if (D.pitchAt == null) return { ...out, why: 'no pitch today' };
        // before: the bags, no tent drawn, the camp drawn without them
        out.before = { objs: !!D.tentObjs, bags: D.tentObjs ? D.tentObjs.filter((o) => o.bag.visible).length : 0, tentsShown: D.tentObjs ? D.tentObjs.filter((o) => o.tent.visible).length : 0, range: D.mesh.geometry.drawRange.count, tentFrom: D.tentFrom };
        const tn = D.tentList[0], G = g.tiles.groundAt(tn.x, tn.z), side = { x: -tn.fdz, z: tn.fdx };
        window.__r4tent = { pos: { x: tn.x + tn.fdx * 5.5 + side.x * 2.5, y: G + 2.2, z: tn.z + tn.fdz * 5.5 + side.z * 2.5 }, look: { x: tn.x, y: G + 0.5, z: tn.z } };
        H.lookAt(window.__r4tent.pos, window.__r4tent.look);
        return out;
      }, { c });
      if (R && !R.none && R.pitchAt != null) { R.pick = c; break; }
    }
    await shot('3a-tent-bags');
    if (R && R.pitchAt != null) {
      // to just before the first goes up, then frame by frame to all up
      const run = await page.evaluate(async ({ c }) => {
        const g = window.__game, H = window.__r4, C = g.partyCamps, D = C.drawn.get(c.key);
        if (!D) return { lost: true };
        g.day.setClock(g.day.year, g.day.doy, D.pitchAt - 0.004); H.step(2);
        H.lookAt(window.__r4tent.pos, window.__r4tent.look);
        const out = { samples: [], mono: true, stoop: 0, frames: 0, shots: {} }, last = D.tentList.map(() => 0);
        for (let k = 0; k < 6000; k++) {
          g.step(1 / 30, 1); out.frames++;
          const us = D.tentList.map((_, i) => C.tentU(D, i));
          us.forEach((u, i) => { if (u < last[i] - 1e-6) out.mono = false; last[i] = u; });
          if (k % 60 === 0) out.samples.push(us.map((u) => +u.toFixed(2)));
          if (D.v.figs.some((f) => f && f.act === 'tent' && f.spec && f.spec.pose === 'stoop')) out.stoop++;
          if (out.shots.flat == null && us[0] > 0.15 && us[0] < 0.3) { out.shots.flat = k; return { ...out, pause: 'flat' }; }
          if (!D.tentObjs && us.every((u) => u >= 1)) break;
        }
        return out;
      }, { c: R.pick });
      await shot('3b-tent-spread-flat');
      const run2 = await page.evaluate(async ({ c, prev }) => {
        const g = window.__game, H = window.__r4, C = g.partyCamps, D = C.drawn.get(c.key);
        const out = { ...prev, pause: null }, last = D.tentList.map((_, i) => C.tentU(D, i));
        for (let k = 0; k < 8000; k++) {
          g.step(1 / 30, 1); out.frames++;
          const us = D.tentList.map((_, i) => C.tentU(D, i));
          us.forEach((u, i) => { if (u < last[i] - 1e-6) out.mono = false; last[i] = u; });
          if (k % 60 === 0) out.samples.push(us.map((u) => +u.toFixed(2)));
          if (D.v.figs.some((f) => f && f.act === 'tent' && f.spec && f.spec.pose === 'stoop')) out.stoop++;
          if (!out.rising && us[0] > 0.6 && us[0] < 0.8) { out.rising = k; return { ...out, pause: 'rising' }; }
          if (!D.tentObjs && us.every((u) => u >= 1)) break;
        }
        return out;
      }, { c: R.pick, prev: run });
      await shot('3c-tent-rising');
      const run3 = await page.evaluate(async ({ c, prev }) => {
        const g = window.__game, H = window.__r4, C = g.partyCamps, D = C.drawn.get(c.key);
        const out = { ...prev, pause: null }, last = D.tentList.map((_, i) => C.tentU(D, i));
        for (let k = 0; k < 12000; k++) {
          g.step(1 / 30, 1); out.frames++;
          const us = D.tentList.map((_, i) => C.tentU(D, i));
          us.forEach((u, i) => { if (u < last[i] - 1e-6) out.mono = false; last[i] = u; });
          if (k % 120 === 0) out.samples.push(us.map((u) => +u.toFixed(2)));
          if (D.v.figs.some((f) => f && f.act === 'tent' && f.spec && f.spec.pose === 'stoop')) out.stoop++;
          if (!D.tentObjs && us.every((u) => u >= 1)) break;
        }
        H.step(20);
        out.after = { objs: !!D.tentObjs, range: D.mesh.geometry.drawRange.count, h: +g.day.hours.toFixed(3), obstacles: D.obstacles.filter((o) => o.tent && (g.tiles.dynamic || []).includes(o)).length };
        out.pP = H.programs();
        return out;
      }, { c: R.pick, prev: run2 });
      await shot('3d-tents-up');
      R.run = { ...run3, samples: run3.samples.slice(0, 40) };
      log('tents', JSON.stringify(R));
      check(3, 'before they go up: a packed bag where each will stand, no tent drawn, the camp drawn without them', R.before && R.before.objs && R.before.bags === R.tents && R.before.tentsShown === 0 && R.before.range === R.before.tentFrom, R.before);
      check(3, 'they go up (spread flat, then risen), never back down, one after another, then in the camp\'s one mesh again', run3.mono && run3.shots && run3.shots.flat != null && run3.rising != null && run3.after && !run3.after.objs && run3.after.range === Infinity && run3.after.obstacles === R.tents, { mono: run3.mono, flat: run3.shots && run3.shots.flat, rising: run3.rising, after: run3.after, frames: run3.frames });
      check(3, 'someone is stooped at a tent going up', run3.stoop > 0, { stoopFrames: run3.stoop, frames: run3.frames });
      check(3, 'the pitch adds no shader program', run3.pP <= (await page.evaluate(() => window.__r4.programs())), { pP: run3.pP });
    } else check(3, 'a party landing at a site today to watch', false, { pick, R });
    // the strike: a party leaving a site today
    const S = await page.evaluate(async () => {
      const g = window.__game, P = g.parties, T = P.today, out = [];
      for (const { party, k } of P.legsOn(T)) { const pl = P.legPlan(party, k); if (!pl || pl.from.kind !== 'site' || pl.start < 8 || pl.start > 13 || party.tents < 1) continue; out.push({ id: party.id, key: pl.from.key, start: pl.start, from: { x: pl.from.x, z: pl.from.z } }); }
      out.sort((a, b) => a.start - b.start); return out.slice(0, 3);
    });
    log('strike picks', JSON.stringify(S));
    let K = null;
    for (const c of S) {
      if (c.start - 0.9 < 0) continue;
      await page.evaluate(({ c }) => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, c.start - 0.9); }, { c });
      await page.evaluate(({ x, z }) => { const g = window.__game; window.__tpDone = false; g.player.teleport(x, z).finally(() => { window.__tpDone = true; }); }, c.from);
      for (let k = 0; k < 600 && !(await page.evaluate(() => window.__tpDone)); k++) await page.evaluate(() => window.__game.step(1 / 30, 3));
      K = await page.evaluate(async ({ c }) => {
        const g = window.__game, H = window.__r4, C = g.partyCamps, camp = () => { const D = C.drawn.get(c.key); return D && D.party.id === c.id ? D : null; };
        for (let k = 0; k < 60 && !camp(); k++) H.step(15);
        const D = camp(); if (!D) return { none: true };
        if (D.strikeAt == null) return { why: 'no strike today', tents: D.tentList.length };
        const tn = D.tentList[0], G = g.tiles.groundAt(tn.x, tn.z), side = { x: -tn.fdz, z: tn.fdx };
        g.day.setClock(g.day.year, g.day.doy, D.strikeAt - 0.003); H.step(2);
        H.lookAt({ x: tn.x + tn.fdx * 5.5 + side.x * 2.5, y: G + 2.2, z: tn.z + tn.fdz * 5.5 + side.z * 2.5 }, { x: tn.x, y: G + 0.5, z: tn.z });
        const out = { tents: D.tentList.length, strikeAt: D.strikeAt, bagUntil: D.bagUntil, mono: true, frames: 0, mid: null }, last = D.tentList.map(() => 1);
        for (let k = 0; k < 12000; k++) {
          g.step(1 / 30, 1); out.frames++;
          const us = D.tentList.map((_, i) => C.tentU(D, i));
          us.forEach((u, i) => { if (u > last[i] + 1e-6) out.mono = false; last[i] = u; });
          if (out.mid == null && us[0] < 0.5 && us[0] > 0.3) { out.mid = k; return { ...out, pause: true }; }
          if (us.every((u) => u <= 0)) break;
        }
        return out;
      }, { c });
      if (K && K.pause) { K.pick = c; break; }
    }
    await shot('3e-tent-struck-half');
    if (K && K.pause) {
      const K2 = await page.evaluate(async ({ c, prev }) => {
        const g = window.__game, C = g.partyCamps, D = C.drawn.get(c.key), out = { ...prev }, last = D.tentList.map((_, i) => C.tentU(D, i));
        for (let k = 0; k < 12000; k++) {
          g.step(1 / 30, 1); out.frames++;
          const us = D.tentList.map((_, i) => C.tentU(D, i));
          us.forEach((u, i) => { if (u > last[i] + 1e-6) out.mono = false; last[i] = u; });
          if (us.every((u) => u <= 0)) break;
        }
        g.step(1 / 30, 5);
        out.h = +g.day.hours.toFixed(3);
        out.shown = D.tentObjs ? D.tentObjs.filter((o) => o.tent.visible).length : null;
        out.obstacles = D.obstacles.filter((o) => o.tent && (g.tiles.dynamic || []).includes(o)).length;
        return out;
      }, { c: K.pick, prev: K });
      await shot('3f-tents-struck');
      check(3, 'on the day they go: the tents come down (never back up) and are gone before they push off', K2.mono && K2.shown === 0 && K2.obstacles === 0 && K2.h < K2.bagUntil, K2);
    } else check(3, 'a party leaving a site today to watch', false, { S, K });
  }

  check(4, 'no page errors', errors.length === 0, errors.slice(0, 5));
  if (SHOTS) writeFileSync(path.join(SHOTS, 'r4-body-test.json'), JSON.stringify(results, null, 1));
} finally { await browser.close(); }
function H_on(v) { return Array.isArray(v) && Math.abs(v[0]) < 0.95 && Math.abs(v[1]) < 0.95 && v[2] < 1; }
const fails = results.filter((r) => !r.ok);
log(`r4 body: ${results.length - fails.length}/${results.length} passed`, fails.length ? `failed: ${fails.map((f) => `${f.n} ${f.name}`).join(' | ')}` : '');
process.exit(fails.length ? 1 : 0);
