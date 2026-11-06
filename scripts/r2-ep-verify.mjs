#!/usr/bin/env node
// Round 2 verify (entry points + markers): a drive by the truck from an outfitter's counter (the ride button clicked on
// the counter's paper, as a player does) to each of a set of entry points; what you arrive at (the lot or the landing,
// on foot, dry), the put-in's lake and the first portage near by (its name, rods, its far lake); a shot of each
// arrival. Then a new season at three outfitters (on the porch?), and campsites visited (the map's spot at the ring).
//   APP=http://localhost:5213 node scripts/r2-ep-verify.mjs [--eps 4,6] [--out dir] [--no-camps]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, openGame, log } from './gl-e-lib.mjs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const EPS = (arg('--eps', '4,6,1,25,30,38,51,55,69,19,47,77')).split(',').map(Number);
const OUT = path.resolve(arg('--out', 'docs/build/shots/r2-ep-verify')); mkdirSync(OUT, { recursive: true });
// the counter driven from: the entry point's host outfitter; an outfitter's own from a neighbour
const FROM = { 1: 12, 6: 16, 25: 31, 38: 36, 51: 49, 69: 64, 55: 51, 30: 25, 4: 6, 19: 16, 47: 51, 77: 6 };
const HELPERS = () => {
  const g = window.__game, H = window.__v = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.built = async (ep, ms = 90000) => { const t0 = performance.now(); for (;;) { const L = g.props.storeLayout(ep); if (L) return L; if (performance.now() - t0 > ms) return null; H.step(15); await H.wait(40); } };
  H.arrived = async (ms = 90000) => { const o = g.outfitter, t0 = performance.now(); while ((o.arrival || g.player.teleporting || g.rides.busy || (g.veil && g.veil.active)) && performance.now() - t0 < ms) { H.step(10, 1 / 10); await H.wait(30); } H.step(30); };
  H.closeAll = () => { const o = g.outfitter; if (o.open) o.hide(); if (o.shelfOpen) o.shelf.close(); if (g.record && g.record.shown && g.record.close) g.record.close(); if (g.cards && g.cards.shown && g.cards.close) g.cards.close(); if (g.journal && g.journal.open && g.journal.close) g.journal.close(); };
  H.near = (x, z, R = 400) => { // the portages whose ends lie within R: nearest first
    const w = g.world, out = [];
    w.portages.forEach((p, i) => { if (!p || !p.pts) return; for (let e = 0; e < 2; e++) { const L = p.launch && p.launch[e], q = L || (e ? p.pts[p.pts.length - 1] : p.pts[0]); const qx = q.x ?? q[0], qz = q.z ?? q[1], d = Math.hypot(qx - x, qz - z); if (d < R) out.push({ i, end: e, d: Math.round(d), name: p.name, rods: p.rods, posted: p.posted || null, road: !!(L && L.road), far: w.lakeName(p.launch && p.launch[1 - e] ? p.launch[1 - e].lake : 0) || null }); } });
    return out.sort((a, b) => a.d - b.d).slice(0, 3);
  };
  return true;
};
const browser = await launch();
const res = { drives: [], seasons: [], camps: null };
try {
  const page = await openGame(browser, { quiet: true, width: 1280, height: 800 });
  await page.evaluate(HELPERS);
  log('loaded');
  const season = (ep, mode) => page.evaluate(async ({ ep, mode }) => {
    const g = window.__game, H = window.__v, t = g.title; H.closeAll(); t.setPick(mode);
    await t.newSeason(g.world.entryPoints.find((e) => e.ep === ep), { confirm: false, start: { year: 2026, doy: 180 } }); t.close();
    if (g.onboarding && g.onboarding.pending && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.onboarding.home, false); } // (r3: the talk's gear and the loaned canoe first)
    const L = await H.built(ep); await H.arrived(); H.closeAll(); g.day.setClock(2026, 180, 11);
    const p = g.player; H.step(30);
    return L ? { ep, door: +Math.hypot(p.x - L.door.x, p.z - L.door.z).toFixed(1), steps: L.steps ? +Math.hypot(p.x - L.steps.x, p.z - L.steps.z).toFixed(1) : null, y: +(p.y - (L.floorY ?? 0)).toFixed(2), floorY: L.floorY, mode: p.mode, onFoot: !!p.onFoot, shore: +g.world.shoreAt(p.x, p.z).toFixed(1), at: { x: Math.round(p.x), z: Math.round(p.z) } } : { ep, built: false };
  }, { ep, mode });
  // 1 the drives
  for (const ep of EPS) {
    const from = FROM[ep];
    await season(from, 'sandbox');
    const opened = await page.evaluate((from) => { const g = window.__game, o = g.outfitter; o.openHot('counter', o.landing(from)); window.__v.step(5); return !!o.open; }, from);
    const sel = `#outfitter button[data-act="ride"][data-id="${ep}"]`;
    let clicked = false, why = '';
    try { await page.locator(sel).first().scrollIntoViewIfNeeded({ timeout: 5000 }); await page.locator(sel).first().click({ timeout: 5000 }); clicked = true; } catch (e) { why = e.message.split('\n')[0]; }
    await page.evaluate(async () => { const H = window.__v; for (let i = 0; i < 20; i++) { H.step(5, 1 / 10); await H.wait(40); } await H.arrived(); H.closeAll(); });
    const r = await page.evaluate(async (ep) => {
      const g = window.__game, H = window.__v, w = g.world, p = g.player, e = w.entryPoints.find((q) => q.ep === ep);
      for (let k = 0; k < 60 && g.outfitter.arrival; k++) { H.step(10); await H.wait(30); }
      H.closeAll(); g.day.setClock(2026, 180, 11); H.step(30);
      const T = g.trailhead.trailheadLayout(ep), S = g.props.storeLayout(ep), hull = p.carry && p.carry.drop, s = e.head || e;
      const lakeHere = w.lakeName(w.lakeIdAt ? w.lakeIdAt(p.x, p.z) : 0);
      return {
        ep, name: e.name, start: e.start || null, shares: e.shares || null, head: !!e.head,
        me: { x: Math.round(p.x), z: Math.round(p.z), mode: p.mode, onFoot: !!p.onFoot, sd: +w.shoreAt(p.x, p.z).toFixed(1), lake: lakeHere },
        toLot: s.lot ? Math.round(Math.hypot(p.x - s.lot.x, p.z - s.lot.z)) : null,
        toPutIn: Math.round(Math.hypot(p.x - s.x, p.z - s.z)), putInLake: w.lakeName(s.lake), putInSd: +w.shoreAt(s.x, s.z).toFixed(1),
        store: S ? Math.round(Math.hypot(p.x - S.door.x, p.z - S.door.z)) : null,
        trailhead: T ? { where: (g.trailhead.trailheadAt(p.x, p.z) || {}).where || null, sign: T.sign ? Math.round(Math.hypot(p.x - T.sign.x, p.z - T.sign.z)) : null } : null,
        hull: hull ? { sd: +w.shoreAt(hull.x, hull.z).toFixed(1), d: Math.round(Math.hypot(hull.x - p.x, hull.z - p.z)) } : null,
        portages: H.near(p.x, p.z, 450), last: g.rides.last ? { from: g.rides.last.from, to: g.rides.last.to } : null,
      };
    }, ep);
    r.from = from; r.clicked = clicked; r.why = why; r.opened = opened;
    r.kicker = await page.evaluate(() => { const k = document.getElementById('veil-kicker'); return k ? k.textContent : null; });
    // at a store's door: turned round to look out, at the yard and the dock (the shot shows where you are, not the shelves)
    if (r.store === 0) await page.evaluate(async (ep) => { const g = window.__game, p = g.player, pl = g.outfitters.placeOf(ep); if (pl && pl.door && p.chase) { p.chase.userYaw = Math.PI; p.chase.userPitch = -0.05; } window.__v.step(20); }, ep);
    await page.waitForTimeout(800);
    writeFileSync(path.join(OUT, `ep-${ep}.png`), await page.screenshot({ type: 'png' }));
    // an outfitter's entry point's own start apart from the store: you set there (its lot, or its landing) to look at it
    if (r.head) {
      r.headAt = await page.evaluate(async (ep) => {
        const g = window.__game, H = window.__v, w = g.world, e = w.entryPoints.find((q) => q.ep === ep), h = e.head;
        const ok = h.lot ? await g.rides.toLot({ ...h, ep }) : await g.rides.teleport(h.x, h.z);
        await H.settle(); for (let i = 0; i < 60; i++) { H.step(10); await H.wait(20); }
        const p = g.player; return { ok, mode: p.mode, sd: +w.shoreAt(p.x, p.z).toFixed(1), toStore: Math.round(Math.hypot(p.x - g.outfitters.placeOf(ep).door[0], p.z - g.outfitters.placeOf(ep).door[1])), portages: H.near(p.x, p.z, 450), th: g.trailhead.trailheadLayout(`h${ep}`) ? true : !!g.trailhead.trailheadAt(p.x, p.z) };
      }, ep);
      await page.waitForTimeout(800);
      writeFileSync(path.join(OUT, `ep-${ep}-head.png`), await page.screenshot({ type: 'png' }));
    }
    log(JSON.stringify(r)); res.drives.push(r);
  }
  // 1b a shared landing is a walk from its host's counter, not a paid drive (49's counter, EP 47)
  await season(49, 'adventure');
  res.walk47 = await page.evaluate(() => { const g = window.__game, o = g.outfitter; o.openHot('counter', o.landing(49)); window.__v.step(5); const b = document.querySelector('#outfitter button[data-act="ride"][data-id="47"]'); const m0 = g.profile.money, r = g.rides.take(47); return { disabled: b ? b.disabled : null, fare: b ? b.closest('li').querySelector('.fare').textContent : null, took: r !== false, spent: m0 - g.profile.money }; });
  log('walk47', JSON.stringify(res.walk47));
  // 2 a new season at three outfitters (adventure)
  for (const ep of [6, 51, 38]) {
    const r = await season(ep, 'adventure'); await page.waitForTimeout(800);
    writeFileSync(path.join(OUT, `season-${ep}.png`), await page.screenshot({ type: 'png' }));
    log('season', JSON.stringify(r)); res.seasons.push(r);
  }
  // 3 campsites visited: ten, near the entry points driven to; the map's spot (c.fire) against the ring as built (c.grate)
  if (!process.argv.includes('--no-camps')) res.camps = await page.evaluate(async (eps) => {
    const g = window.__game, H = window.__v, w = g.world, out = [];
    const picks = [];
    for (const ep of eps) { const e = w.entryPoints.find((q) => q.ep === ep); let best = null; w.campsites.forEach((c, i) => { if (picks.includes(i)) return; const d = Math.hypot(c.x - e.x, c.z - e.z); if (d > 400 && c.fire && Math.hypot(c.fire.x - c.x, c.fire.z - c.z) > 1 && (!best || d < best.d)) best = { i, d }; }); if (best) picks.push(best.i); if (picks.length >= 10) break; }
    for (const i of picks) {
      const c = w.campsites[i];
      await g.outfitter.onTeleport(c.x + 20, c.z + 20); await H.settle();
      for (let k = 0; k < 150 && !c.grate; k++) { H.step(10); await H.wait(30); }
      const s = c.fire || c;
      out.push({ i, grate: !!c.grate, d: c.grate ? +Math.hypot(s.x - c.grate.x, s.z - c.grate.z).toFixed(2) : null, moved: +Math.hypot(s.x - c.x, s.z - c.z).toFixed(1) });
    }
    return out;
  }, EPS);
  log('camps', JSON.stringify(res.camps));
} finally { await browser.close(); }
writeFileSync(path.join(OUT, 'verify.json'), JSON.stringify(res, null, 1));
