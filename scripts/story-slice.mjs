// story-slice.mjs: the Round 1 slice rig (docs/build/campaign-design.md Part 4, "The first playable slice, exactly"),
// assembled at the join from the streams' sections (scripts/slice/c1-book.mjs, c1-layer.mjs, c1-pencil.mjs,
// c1-talk.mjs). Headless Chromium against a running Vite (and the relay for step 8), ?story=1.
//
//   --slice (the default)   steps 1–8 on one season at --home (Moose Lake 25), by real input where the slice asks for
//                           it: the store's door walked through (W held, the outfitter's own updateVisit), every choice
//                           pressed by its number, the talk opened with E on the person, the last 200 m to the crews'
//                           landing paddled (W and A/D) and E ashore, E Look on the props, E on the open notebook to read
//                           it where he wrote it, the Walt page's chip clicked and the nickname clicked onto Lake One.
//                           Travel between places is a teleport (the slice is the story, not the drive). A second season
//                           (its own browser) leaves the bundle on the shelf (R1) and plays the declines (X1, R3,
//                           "Changed your mind?"). With RELAY: a co-op guest (step 8).
//   --ignore                a player who ignores the story: the bundle taken as the onboarding's gear, the night-one
//                           cutscene sat through, Tauno walked past, then two days of an ordinary trip; nothing waits on
//                           the story and nothing breaks
//   --plan slice            no browser: the solver's plan for the slice (scripts/story-solve.mjs --plan-only), each move
//                           with the slice step it belongs to and how this rig plays it
//   APP=http://localhost:5651 RELAY=ws://localhost:8651 node scripts/story-slice.mjs [--slice|--ignore|--plan slice]
//     [--home 25] [--out dir] [--shots dir] [--no-coop] [--only a,b]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { steps as BOOK } from './slice/c1-book.mjs';
import { section as LAYER, HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T, choose, hear, shelf as T_SHELF, r1 as T_R1, declines as T_DECLINES } from './slice/c1-talk.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const MODE = arg('plan', null) ? 'plan' : arg('ignore', false) ? 'ignore' : 'slice';
const HOME = Number(arg('home', 25));
const OUT = path.resolve(String(arg('out', path.join(process.env.TMPDIR || '/tmp', 'story-slice-out'))));
const SHOTS = arg('shots', null) ? path.resolve(String(arg('shots'))) : null;
const APP = (process.env.APP || 'http://localhost:5651').replace(/\/$/, '');
const RELAY = process.env.RELAY || '';
const COOP = !argv.includes('--no-coop') && !!RELAY;
const ONLY = arg('only', null) ? new Set(String(arg('only')).split(',')) : null;
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1400)); };

// --- --plan slice: the solver's plan, mapped to the slice's steps and to how this rig plays each move -------------------
if (MODE === 'plan') {
  const r = spawnSync(process.execPath, ['--max-old-space-size=3000', path.join(ROOT, 'scripts/story-solve.mjs'), '--plan-only'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const lines = (r.stdout || '').split('\n').filter((l) => /^\s*\d+\. /.test(l)).map((l) => l.replace(/^\s*\d+\.\s*/, ''));
  if (r.status !== 0 || !lines.length) { console.log(r.stdout, r.stderr); console.log('story-slice --plan slice: the solver found no plan'); process.exit(1); }
  const how = (m) => (/^counter:P1/.test(m) ? [1, 'walk in by the door (W), E at the counter'] : /^say:p1/.test(m) ? [1, 'the choice pressed by its number']
    : /^night/.test(m) ? [2, 'the old tent pitched at a site, a night slept (camp.sleep); the cutscene, a key at its last page']
    : /^read NB\d+ at/.test(m) ? [3, 'E on the open notebook, standing at the place'] : /^read /.test(m) ? [m.includes('NB20') || m.includes('NB31') ? 7 : 3, 'the spread open 3 s']
    : /^carry/.test(m) ? [3, 'the carry logged (trip.js)'] : /^Look at ws\./.test(m) ? [3, 'E Look on the stump (the dot)'] : /^Look at crews\./.test(m) ? [5, 'E Look on the prop (the dot)']
    : /^into the store/.test(m) ? [4, 'walk in by the door (W)'] : /^tauno|^josie/.test(m) ? [/U1|resumeU|seat/.test(m) ? (/seat/.test(m) ? 7 : 6) : 4, 'walk out by the door (W); E on him']
    : /^say:porch:(U|seat|twostump)/.test(m) ? [/seat|twostump/.test(m) ? 7 : 6, 'the choice pressed by its number'] : /^say:/.test(m) ? [4, 'the choice pressed by its number']
    : /^walk off/.test(m) ? [4, 'walked away (or Escape)'] : /^ask the keeper.*(lg|bewest)$/.test(m) ? [5, 'E on the keeper; "Ask about…", the topic by its number']
    : /^ask the keeper.*nick\./.test(m) ? [7, 'E on the keeper; the topic by its number'] : /^ask the keeper/.test(m) ? [6, 'E on the keeper; the topic by its number']
    : /^pencil/.test(m) ? [7, 'the Walt page\'s chip clicked, then Lake One clicked on the map'] : /^stand at/.test(m) ? [5, 'the last 200 m paddled, E ashore'] : [0, '']);
  console.log('The slice, as the solver plays it, and as story-slice.mjs --slice plays each move:');
  lines.forEach((m, i) => { const [st, h] = how(m); console.log(`${String(i + 1).padStart(3)}. [step ${st}] ${m}${h ? `  — ${h}` : ''}`); });
  console.log(`story-slice --plan slice: ${lines.length} moves`);
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const browsers = [];
async function openGame(name, query = 'story=1') {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(browser);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /story|book|walt|layer|pencil|talk|cast/i.test(m.text()))) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  const q = [RELAY ? `relay=${encodeURIComponent(RELAY)}` : '', query].filter(Boolean).join('&');
  await page.goto(`${APP}/${q ? '?' + q : ''}`, { timeout: 180000 });
  await booted(page);
  log(`[${name}] loaded`);
  return page;
}
const booted = (page) => page.waitForFunction(() => window.__game && window.__game.title && window.__game.story && (window.__game.title.state === 'title' || window.__game.title.state === 'game') && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
const newSeason = async (page, home, doy = 175) => {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting && window.__game.storySeams && window.__game.storySeams.feed && window.__game.book && window.__game.storyTalk && window.__game.pencil, null, { timeout: 200000, polling: 250 });
  await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(HELPERS_J);
};
const harnessB = (page, state = {}) => ({
  page, log, result, state,
  step: (n) => page.evaluate((n) => window.__L.step(Math.round(n)), n),
  until: (fn, a, ms = 120000) => page.waitForFunction(fn, a, { timeout: ms, polling: 250 }),
  shot: async (name) => { if (!SHOTS) return; try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch { /* a nicety */ } },
});
const shot = async (page, name) => { if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch { /* a nicety */ } } };
const facts = (page, keys) => page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, window.__game.story.has(k)])), keys);

// --- the join's own helpers in the page (window.__J): walking a route by the keys, E on a person ---------------------
const HELPERS_J = () => {
  const g = window.__game, J = window.__J = {}, L = window.__L, T = window.__t;
  // a store's door as waypoints: from outside (in front of the steps) to the door to inside, or the reverse
  J.route = (ep, dir, side = 0) => {
    const S = g.outfitter.layout(ep); if (!S) return null;
    const a = S.axes.a, b = S.axes.b, d = S.door, f0 = S.stepsFoot || { x: d.x + b.x * 2, z: d.z + b.z * 2 };
    const foot = { x: f0.x + a.x * side, z: f0.z + a.z * side }; // (a step to one side: someone standing at the foot)
    const outside = { x: foot.x + b.x * 2.5, z: foot.z + b.z * 2.5 }, inside = { x: d.x - b.x * 3, z: d.z - b.z * 3 };
    return dir === 'in' ? [outside, foot, d, inside] : [inside, d, foot, { x: foot.x + b.x * 4, z: foot.z + b.z * 4 }];
  };
  // the player as the slice wants them between places: fed and watered, rested (the rig skips the meals; the pack is left
  // where night one left it: on the back, the canoe would not paddle)
  J.refresh = () => {
    const e = g.energy; e.fresh(); e.bunk(); e.value = 1; // (a night in a bunk, breakfast, a full bottle: the bar full again)
    if (g.player.seat) { g.player.seat = null; } // (up off a bench: Farm's porch sat the player down for the turn)
    return +e.value.toFixed(2);
  };
  J.at = () => ({ x: g.player.x, z: g.player.z, inside: !!(g.outfitter.visit && g.outfitter.visit.inside), mode: g.player.mode });
  J.face = (q) => { const yaw = L.yawTo(q); L.look(yaw); g.player.heading = yaw; };
  J.convo = () => T.convo();
  return true;
};
// walk a store's door by the keys (W held, steered at each waypoint): → { ok, inside, via }
async function walkDoor(page, ep, dir) {
  await page.evaluate(() => { const j = window.__game.journal; if (j.open) j.close(); window.__J.refresh(); window.__L.step(2); });
  const tries = [];
  for (const side of [0, 1.3, -1.3]) {
    const route = await page.evaluate(([ep, dir, side]) => window.__J.route(ep, dir, side), [ep, dir, side]);
    if (!route) return { ok: false, why: 'no store layout' };
    await page.evaluate((p) => { window.__L.standAt(p.x, p.z, 0); window.__J.face(p); window.__L.step(4); }, route[0]);
    let st = null, stuck = null;
    for (let w = 1; w < route.length && !stuck; w++) {
      await page.keyboard.down('w');
      let best = Infinity, still = 0;
      for (let k = 0; k < 90; k++) {
        st = await page.evaluate((q) => { window.__J.face(q); window.__L.step(3); const a = window.__J.at(); return { ...a, d: Math.hypot(q.x - a.x, q.z - a.z) }; }, route[w]);
        if (st.d < 0.7) break;
        if (st.d < best - 0.05) { best = st.d; still = 0; } else if (++still > 12) { stuck = { w, d: +st.d.toFixed(2) }; break; }
      }
      await page.keyboard.up('w');
    }
    await page.evaluate(() => window.__L.step(10));
    st = await page.evaluate(() => window.__J.at());
    const ok = dir === 'in' ? st.inside : !st.inside;
    tries.push({ side, stuck, inside: st.inside });
    if (ok) return { ok: true, inside: st.inside, via: side ? `keys (a step to the side: ${side} m)` : 'keys', tries };
  }
  await page.evaluate(([ep, dir]) => (dir === 'in' ? window.__t.walkIn(ep) : window.__t.walkOut(ep)), [ep, dir]);
  return { ok: false, via: 'api (the walk stuck)', tries };
}
// E on a person (the dot on them); the talk opened as E opens it, else through npcs.talkTo: → { ok, via }
async function talkE(page, key) {
  const f = await page.evaluate((key) => { const f = window.__t.figure(key); if (!f) return null; window.__L.face({ x: f.x, z: f.z }, 1.7, f.y + 1.45); window.__L.step(4); return f; }, key);
  if (!f) return { ok: false, why: `no figure ${key}` };
  const want = await page.evaluate((key) => { const n = window.__game.npcs, v = n && typeof n.find === 'function' ? n.find(key) : null; return v ? v.name || null : null; }, key);
  await page.keyboard.press('e');
  let other = null;
  for (let k = 0; k < 10; k++) {
    const c = await page.evaluate(() => { window.__L.step(2); return window.__t.convo(); });
    if (c) { if (!want || !c.who || c.who === want || /old man|Tauno/.test(c.who) === /tauno/.test(key)) return { ok: true, via: 'E' }; other = c.who; break; }
    await page.waitForTimeout(60);
  }
  if (other) await endTalk(page); // (the dot was on someone else: a visitor stood between)
  await page.evaluate((k) => window.__t.talkTo(k), key);
  for (let k = 0; k < 25; k++) { if (await page.evaluate(() => { window.__L.step(2); return !!window.__t.convo(); })) return { ok: true, via: other ? `api (E found ${other} in the way)` : 'api (E did not open it)' }; await page.waitForTimeout(100); }
  return { ok: false, via: 'neither E nor the API opened it' };
}
// the store's keeper, once the roster has settled (E on them)
async function keeperE(page, ep) {
  let key = null;
  for (let k = 0; k < 40 && !key; k++) { key = await page.evaluate((e) => { window.__L.step(5); return window.__t.keeperKey(e); }, ep); if (!key) await page.waitForTimeout(80); }
  return key ? talkE(page, key) : { ok: false, why: 'no keeper in the roster' };
}
// "Ask about…" shows three story topics, the newest part of the story first (topics.js): the topics above the one wanted
// are asked first, as a player would, each by its number; → { ok, asked: [texts] }
// A keeper draws two rings a conversation at most (topics.js): before a third ring topic the talk is ended and taken up
// again an hour later (reopen), as a player would come back to the counter
const RINGS = /^(Can you ring|And Bald Eagle|Where's Farm|Who goes in at Sawbill|Walt's sister's|Ever hear a lake called)/;
async function dig(page, want, { max = 14, reopen = null } = {}) {
  const asked = [], EXIT = /^(That’s all\.|That's all\.|Goodbye\.|…)$/;
  let rings = 0;
  for (let k = 0; k < max; k++) {
    const c = await page.evaluate(() => window.__t.convo());
    if (!c) return { ok: false, why: 'no conversation', asked };
    const i = c.choices.findIndex((t) => t.startsWith(want));
    if (i >= 0 && RINGS.test(want) && rings >= 2 && reopen) { await reopen(); rings = 0; asked.push('(a new talk)'); continue; }
    if (i >= 0) { await page.keyboard.press(`Digit${i + 1}`); await page.waitForTimeout(60); return { ok: true, asked }; }
    const ask = c.choices.findIndex((t) => /^Ask about/.test(t));
    if (ask >= 0) { await page.keyboard.press(`Digit${ask + 1}`); await page.waitForTimeout(60); continue; }
    if (c.choices.length === 1 && c.choices[0] === '…') { await page.keyboard.press('Digit1'); await page.waitForTimeout(60); continue; }
    const j = c.choices.findIndex((t) => !EXIT.test(t) && !asked.includes(t) && !/^Lake One, Two/.test(t));
    if (j < 0) return { ok: false, why: `no "${want}" in [${c.choices.join(' | ')}]`, asked };
    if (RINGS.test(c.choices[j])) { if (rings >= 2 && reopen) { await reopen(); rings = 0; asked.push('(a new talk)'); continue; } rings++; }
    asked.push(c.choices[j]); await page.keyboard.press(`Digit${j + 1}`); await page.waitForTimeout(60); await hear(page, 6);
  }
  return { ok: false, why: 'too many topics', asked };
}
async function picks(page, list) {
  const out = [];
  for (const p of list) { const r = await choose(page, p); out.push(r); if (!r.ok) return { ok: false, at: p, r, out }; }
  return { ok: true, out };
}
async function endTalk(page) {
  for (let k = 0; k < 10; k++) { const c = await page.evaluate(() => window.__t.convo()); if (!c) break; await page.keyboard.press('Escape'); await page.waitForTimeout(80); }
  await page.evaluate(() => window.__L.step(30)); // (the goodbye said, the person back to their seat, before the next talk or walk)
}
async function readSpread(page, nb, secs = 3.6) {
  await page.evaluate((nb) => { const g = window.__game, b = g.book; if (!g.journal.open) g.journal.show('pack'); g.journal.setSide('walt'); b.view = 'nb'; b.debug.spread(b.debug.spreadOf(nb)); }, nb);
  await page.evaluate((n) => window.__L.step(n), Math.round(secs * 30));
  return page.evaluate((nb) => window.__game.story.nbHas('read', nb), nb);
}
const closeBook = (page) => page.evaluate(() => { const j = window.__game.journal; if (j.open) j.close(); window.__L.step(3); }); // (an open book eats W)
const clockTo = (page, h, dd = 0) => page.evaluate(([h, dd]) => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy + dd, h); window.__L.step(4); }, [h, dd]);
async function goStore(page, ep) {
  await page.evaluate(async (ep) => {
    const g = window.__game, L = window.__L, l = g.outfitter.landing(ep);
    if (Math.hypot(g.player.x - l.x, g.player.z - l.z) > 120) { await g.player.teleport(l.x, l.z); await L.settle(); }
    for (let k = 0; k < 150 && !g.outfitter.layout(ep); k++) { L.step(10); await L.wait(60); }
    const S = g.outfitter.layout(ep); // (the store's own tiles in, its steps and porch collidable, before anyone walks them)
    if (S && g.tiles.ensure) { try { await g.tiles.ensure(S.door.x, S.door.z, 120); } catch { /* */ } }
    for (let k = 0; k < 60 && S && g.tiles.readyAt && !g.tiles.readyAt(S.door.x, S.door.z); k++) { L.step(5); await L.wait(60); }
    L.step(20);
  }, ep);
}
async function taunoWalkout(page, ep) {
  const out = await walkDoor(page, ep, 'out');
  await page.evaluate(() => window.__L.step(30));
  const t = await page.evaluate(() => window.__t.tauno());
  return { out, t };
}

// =====================================================================================================================
async function slice() {
  const A = await openGame('slice');
  const hB = harnessB(A, {});
  const ep = HOME;
  await newSeason(A, ep, 175);
  const run = async (id, fn) => { if (ONLY && !ONLY.has(id)) return; log(`--- ${id}`); try { await fn(); } catch (e) { result(`${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 900) }); } };

  // step 1 (B, T): the door walked through, E at the counter, P1 by number, the bundle taken -----------------------------
  await run('1', async () => {
    await goStore(A, ep);
    const door = await walkDoor(A, ep, 'in');
    // E on the counter when the dot is on it; else the counter's own E (outfitter.openHot: a visitor stood in the way)
    const counter = await A.evaluate(() => { const g = window.__game, S = g.outfitter.layout(g.profile.home), c = S.counter || S.centre; window.__L.face({ x: c.x, z: c.z }, 1.4, S.floorY + 1.0); window.__L.step(4); const t = g.pointer && g.pointer.target; return { pending: g.onboarding.pending(g.profile.home), dot: t ? { ref: t.ref || null, label: t.label || '', verb: t.e ? t.e.verb : t.verb || null } : null }; });
    let via = 'E';
    if (counter.dot && counter.dot.ref === 'counter') await A.keyboard.press('e');
    else { via = `the counter's E (the dot was on ${counter.dot ? counter.dot.label || counter.dot.ref : 'nothing'})`; await A.evaluate(() => { const o = window.__game.outfitter; o.openHot('counter', o.visit.landing); }); }
    for (let k = 0; k < 20 && !(await A.evaluate(() => { window.__L.step(3); return !!window.__t.convo(); })); k++) await A.waitForTimeout(80);
    if (!(await A.evaluate(() => !!window.__t.convo()))) { via += '; api (no talk opened)'; await A.evaluate(() => { const g = window.__game; if (g.onboarding.pending(g.profile.home)) g.onboarding.start(g.profile.home); }); await A.waitForTimeout(150); }
    const first = await A.evaluate(() => window.__t.convo());
    const said = await hear(A);
    const r = await picks(A, ['What\'s BRM-14?', 'I\'ll take it.']);
    await hear(A, 4);
    for (let k = 0; k < 8; k++) { const c = await A.evaluate(() => window.__t.convo()); if (!c) break; await A.keyboard.press('Digit1'); await A.waitForTimeout(80); }
    await A.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
    const f = await facts(A, ['bundle.taken', 'bundle.shelf']);
    const pack = await A.evaluate(() => window.__game.inventory.containers.some((c) => c.item === 'waltpack'));
    result('1a the door walked through (W), E at the counter, P1: the keeper first, Josie\'s week, "I\'ll take it." by its number → the BRM-14 pack', door.ok && first && said.length >= 2 && r.ok && f['bundle.taken'] && !f['bundle.shelf'] && pack, { door, counter, via, first, said: said.slice(0, 4), r: r.ok ? 'ok' : r, f, pack });
    for (const s of BOOK.filter((q) => q.id === 'B1')) await s.run(hB);
  });

  // step 3 before night one (L): the stone on C837's stump reads "Stump", no verb ---------------------------------------
  await run('3pre', async () => {
    const W = await A.evaluate(() => { const q = window.__game.storyLayer.place('ws.c837'); return q && { x: q.x, z: q.z }; });
    await A.evaluate(async (W) => { await window.__L.near(W.x, W.z); }, W);
    const t = await A.evaluate(() => window.__L.faceTo('ws.c837.stump', 2.5, 0.4));
    await A.keyboard.press('e'); await A.evaluate(() => window.__L.step(3));
    const looked = await A.evaluate(() => window.__game.story.has('stone.c837'));
    result('3a before night one the stone on C837\'s stump reads "Stump", no verb, E does nothing', t && t.label === 'Stump' && !t.verb && !looked, { t, looked });
  });

  // step 2 (B): the old tent pitched at a site, the first night: the real cutscene, the notebook in the book --------------
  await run('2', async () => {
    const site = await A.evaluate(async () => {
      const g = window.__game, home = g.outfitter.landing(g.profile.home);
      const near = g.world.campsites.map((c) => ({ c, d: Math.hypot(c.x - home.x, c.z - home.z) })).filter((q) => q.d > 400).sort((a, b) => a.d - b.d).slice(0, 10);
      for (const { c } of near) {
        if (!g.campsites.isFree(g.campsites.key(c))) continue;
        await g.player.teleport(c.x, c.z);
        for (let i = 0; i < 40 && !c.layout; i++) { g.step(1 / 30, 10); await new Promise((r) => setTimeout(r, 100)); }
        if (c.layout && c.layout.pad && g.campsites.isFree(g.campsites.key(c))) return { i: g.world.campsites.indexOf(c) };
      }
      return null;
    });
    if (!site) throw new Error('no campsite with a layout near home');
    await A.waitForFunction(() => !window.__game.player.teleporting, null, { timeout: 60000 });
    const pitched = await A.evaluate((i) => {
      const g = window.__game, c = g.world.campsites[i], L = c.layout, inv = g.profile.inventory, p = g.player, camp = g.camp, pad = L.pad;
      p.standAt({ x: pad.x + pad.fdx * 2.2, z: pad.z + pad.fdz * 2.2, heading: Math.atan2(-pad.fdx, pad.fdz), drop: { x: L.fire.x + 1.5, z: L.fire.z + 1.5, heading: 0 } });
      const pack = inv.containers.find((k) => k.item === 'waltpack'); pack.where = 'ground'; pack.at = { x: pad.x + pad.fdx * 1.6, z: pad.z + pad.fdz * 1.6 }; inv.emit('containers');
      g.step(1 / 30, 30);
      const tent = camp.tentInReach(); if (!tent) return { error: 'no tent in reach' };
      let s = null;
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1.5, 1.5], [-1.5, -1.5]]) { s = camp.ghostAt(c, tent.def.id, pad.x + dx, pad.z + dz, pad.fdx, pad.fdz); if (s && s.ok) break; }
      if (!s || !s.ok) return { error: `no spot: ${s && s.why}` };
      if (!camp.stake(s, tent, c) || !camp.camp) return { error: 'not staked', why: s.why || null, carried: g.walt.carried() };
      camp.setStage(camp.camp, 4); camp.pitched();
      return { item: camp.camp.item, carried: g.walt.carried() };
    }, site.i);
    result('2a a site near home, Walt\'s things along (the old tent pitched there when a spot takes it)', !!pitched.carried, pitched);
    hB.state.site = site.i;
    for (const s of BOOK.filter((q) => q.id === 'B2')) await s.run(hB);
    await closeBook(A);
    const struck = await A.evaluate(() => { const g = window.__game, had = !!g.camp.camp; if (had) g.camp.strike({ quiet: true }); window.__J.refresh(); return { had, now: !!g.camp.camp }; }); // (the morning: breakfast, the camp packed up as a tripper leaves a site)
    log('the camp packed', JSON.stringify(struck));
  });

  // step 3 (join L + B, K1b + B): NB45 read (its dot goes); NB01 read at C837 by E; the stone; P289's 64 ------------------
  await run('3', async () => {
    const r45 = await readSpread(A, 'NB45', 2.0);
    await A.evaluate(() => window.__L.step(48));
    const r45b = await A.evaluate(() => window.__game.story.nbHas('read', 'NB45'));
    const dots = await A.evaluate(() => document.querySelectorAll('#journal .side.w .nbw-strip .nbw-dot').length);
    result('3b NB45\'s spread open 3 s: read:NB45 and its dot gone (not at 2 s)', !r45 && r45b && dots < 88, { r45, r45b, dots });
    await closeBook(A);
    const W = await A.evaluate(() => { const q = window.__game.storyLayer.place('ws.c837'); return { x: q.x, z: q.z }; });
    await A.evaluate(async (W) => { await window.__L.near(W.x, W.z); }, W);
    const t = await A.evaluate(() => window.__L.faceTo('ws.c837.stump', 2.5, 0.4));
    await A.keyboard.press('e'); await A.evaluate(() => window.__L.step(3));
    const stone = await A.evaluate(() => { const s = window.__game.story; return { stone: s.has('stone.c837'), walt: s.walt().includes('20:2.4.w2') }; });
    result('3c after night one "A white stone on a stump": E Look (real key), stone.c837 and 20 §2.4\'s Walt line', t && t.label === 'A white stone on a stump' && t.verb === 'Look' && stone.stone && stone.walt, { t, stone });
    // the notebook opened at NB02 here: E reads nothing; at NB01: he was here (B's reader → L's place and trigger)
    const openAt = (nb) => A.evaluate((nb) => { const g = window.__game, b = g.book; g.journal.show('pack'); g.journal.setSide('walt'); b.view = 'nb'; b.debug.spread(b.debug.spreadOf(nb)); window.__L.step(3); }, nb);
    await openAt('NB02'); await A.keyboard.press('e'); await A.evaluate(() => window.__L.step(3));
    const wrong = await A.evaluate(() => window.__game.story.nbHas('here', 'NB01'));
    await openAt('NB01'); await A.keyboard.press('e'); await A.evaluate(() => window.__L.step(4));
    const here = await A.evaluate(() => { const g = window.__game, el = document.querySelector('#journal .side.w .nbw-here'); return { here: g.story.nbHas('here', 'NB01'), mark: el ? el.textContent : null, events: (g.story.doc.log || []).filter((l) => l[3] === 'nb' && l[4] && l[4].kind === 'here').length }; });
    await shot(A, 'slice-3-here');
    result('3d at C837, the notebook open at NB01, E: he was here (once); at another page, nothing', !wrong && here.here && here.mark === 'he was here', { wrong, here });
    await closeBook(A);
    // P289 (Little Trout – Rum, 64 r): the carry as trip.js logs it → "64" pencilled on the back cover, NB15 he was here
    const c64 = await A.evaluate(() => {
      const g = window.__game, tr = g.trip, i = g.book.debug.resolved()['64'][0], p = g.world.portages[i];
      tr.log('portage', { i, name: p.name, rods: p.rods });
      const s = g.story;
      return { i, name: p.name, bc: s.has('bc.64'), here: s.nbHas('here', 'NB15'), line: s.walt().includes('20:2.4.w1') };
    });
    result('3e P289 crossed (the carry logged as trip.js logs it): "64" pencilled, NB15 he was here, the Walt line', c64.bc && c64.here && c64.line, c64);
  });

  // step 4 (T): the return, the walkout by daylight: Tauno at the porch foot, T1–T6 warm (the Swede test), no ring --------
  await run('4', async () => {
    await clockTo(A, 10, 1);
    await goStore(A, ep);
    const inn = await walkDoor(A, ep, 'in');
    const armed = await facts(A, ['tauno.armed']);
    const k1 = await keeperE(A, ep);
    const gold = await A.evaluate(() => window.__t.convo());
    const g1 = await choose(A, 'Whose gear was this?');
    const gearSaid = await hear(A, 4);
    await endTalk(A);
    const gearF = await A.evaluate(() => ({ gear: window.__game.story.get('walt.gear'), line: window.__game.story.walt().includes('20:5.2.w1') }));
    // (the door by the keys is 1a's, 4b's and 5a's assertion; here a stuck walk goes in by the API and says so)
    result('4a in by the door after night one arms the porch; E on the keeper: "Whose gear was this?" first, in gold; its Walt line', armed['tauno.armed'] && k1.ok && gold && gold.choices[0] === 'Whose gear was this?' && g1.ok && gearF.line, { inn, armed, k1, gold, gearSaid, gearF });
    const w = await taunoWalkout(A, ep);
    const fig = w.t ? await A.evaluate((k) => window.__t.figure(k), `cast:tauno:${w.t.ep}`) : null;
    result('4b out of the door by daylight (W): Tauno at the porch foot (his truck where there is no porch), on the ground, drawn', w.out.ok && w.t && w.t.slot === 'porch' && fig && Math.abs(fig.y - fig.ground) < 0.35 && fig.drawn, { w, fig });
    const k2 = w.t ? await talkE(A, `cast:tauno:${w.t.ep}`) : { ok: false };
    const t1 = await A.evaluate(() => window.__t.convo());
    const r = await picks(A, ['Sorry?', 'Walk with him', 'A Swede?', 'You knew him?', 'Doing what?', 'What\'s BRM?', 'Who are you?', 'What do you want from me?', 'I\'ll go look.']);
    await hear(A, 6); await endTalk(A);
    const f = await facts(A, ['tauno.porch.done', 'tauno.porch.warm', 'knows.walt', 'knows.haapala', 'knows.boreal', 'knows.tauno', 'door.crews.taken']);
    const rings = await A.evaluate(() => window.__game.pencil.rings().length);
    const stage = await A.evaluate(() => window.__game.story.stage);
    result('4c E on him; T1–T6 by number, warm (NB45 read: "A Swede?" there): Walt, Haapala, Boreal, his name, the door taken; no ring; S2', k2.ok && t1 && r.ok && Object.values(f).every(Boolean) && rings === 0 && stage === 'S2', { k2, t1, r: r.ok ? 'ok' : r, f, rings, stage });
  });

  // step 5 (join T + P + L): a keeper rings the crews' landing, her name in Marked; the landing paddled to; the lead closes --
  await run('5', async () => {
    const inn = await walkDoor(A, ep, 'in');
    const k = await keeperE(A, ep);
    const name = await A.evaluate((e) => { const v = (window.__game.npcs.at(e) || []).find((x) => x.keeper); return v ? v.name.split(' ')[0] : null; }, ep);
    const r = await picks(A, ['Ask about', 'Can you ring Little Gabbro for me?']);
    await hear(A, 4);
    const r2 = await picks(A, ['And Bald Eagle\'s west shore?']);
    await hear(A, 3); await endTalk(A);
    const m = await A.evaluate(() => {
      const g = window.__game, P = g.pencil, mb = g.journal.map;
      g.journal.showMap(); mb.tab = 'marked'; mb.render(true);
      const el = document.querySelector('.mb-marked'), text = el ? el.innerText : '';
      return { text: text.slice(0, 400), ep33: P.ringFor('ep33'), west: P.ringFor('baldeagle.west'), lead: g.leads.state('crews'), ringed: g.story.when('ringed:ep33') };
    });
    await shot(A, 'slice-5-marked');
    await closeBook(A);
    result(`5a E on the keeper; "Can you ring Little Gabbro for me?", "And Bald Eagle's west shore?": two rings, ${name} beside them in Marked; the lead open`, inn.ok && k.ok && r.ok && r2.ok && m.ep33 && m.west && m.ep33.by.includes(name) && m.text.includes(name) && m.lead === 'open' && m.ringed, { inn, k, r: r.ok ? 'ok' : r, r2: r2.ok ? 'ok' : r2, m, name });
    // the landing: L's section (the last 200 m paddled, E ashore, E Look on the crib, the tree, the grade); a day trip from
    // Little Gabbro (day use needs no permit), fed and rested
    await A.evaluate(() => window.__J.refresh());
    const pre = await A.evaluate(() => { const g = window.__game, p = g.player, inv = g.profile.inventory; return { hours: +g.day.hours.toFixed(2), mode: p.mode, carry: p.carry ? { drop: !!p.carry.drop, trail: !!p.carry.trail } : null, canoe: (inv.long || []).filter((l) => /canoe|boat/i.test(l.id)).map((l) => [l.id, l.where]), trip: g.trip ? { active: !!g.trip.active, adventure: !!g.trip.adventure } : null, energy: +g.energy.value.toFixed(2), boat: p.boat ? Object.keys(p.boat).slice(0, 6) : null, papers: g.hud && g.hud.papers ? [...(g.hud.papers.keys ? g.hud.papers.keys() : g.hud.papers)].slice(0, 6) : null, paused: !!(g.pause && (g.pause.open || g.pause.shown)), focus: document.activeElement ? `${document.activeElement.tagName}#${document.activeElement.id || ''}` : null, journal: g.journal.open, talk: !!window.__t.convo(), dock: !!(g.outfitter && g.outfitter.docking) }; });
    log('before the landing', JSON.stringify(pre));
    // the hands free for the paddle: a rod left up (a digit pressed as a talk closed picks it up) idles the hands
    const hands = await A.evaluate(() => { const g = window.__game, p = g.player, f = p.fishing, c = g.canoe || p.canoe; const was = { rodUp: !!(f && f.rodUp), climb: c && c.state ? c.state.climb : null, held: g.inventory && typeof g.inventory.hands === 'function' ? g.inventory.hands() : null }; if (f && f.rodUp) f.stow(true); return was; });
    log('the hands before the paddle', JSON.stringify(hands));
    for (const s of LAYER.steps.filter((q) => q.step === 5)) await s.run({ page: A, result, shots: SHOTS });
    const post = await A.evaluate(() => { const g = window.__game, p = g.player; return { hours: +g.day.hours.toFixed(2), mode: p.mode, speed: p.speed, energy: +g.energy.value.toFixed(2), bilge: g.canoe && g.canoe.bilge, low: g.energy.low || null }; });
    log('after the landing', JSON.stringify(post));
    const c = await A.evaluate(() => { const g = window.__game, rg = g.pencil.ringFor('crews'); return { lead: g.leads.state('crews'), closed: !!(rg && rg.closed), seen: g.story.has('crews.seen'), line: g.story.walt().includes('20:11.2.w2') }; });
    result('5b the lead closes at the crib: its rings ticked and faint, the line under it', c.lead === 'closed' && c.closed && c.seen && c.line, c);
  });

  // step 6 (T, P): Farm's porch of a morning: U1–U5, Eino, the four doors; a keeper rings one when asked; S3 ---------------
  await run('6', async () => {
    await clockTo(A, 8, 1);
    await goStore(A, 31);
    const sat = await A.evaluate(() => { const g = window.__game, S = g.outfitter.layout(31), b = S.axes.b, f = S.stepsFoot || S.door; window.__L.standAt(f.x + b.x * 4, f.z + b.z * 4, 0); window.__L.step(60); return window.__t.staged(); });
    const t = await A.evaluate(() => window.__t.tauno());
    let k = t ? await talkE(A, `cast:tauno:${t.ep}`) : { ok: false };
    if (t && !k.ok) { await A.evaluate(() => window.__L.step(90)); k = await talkE(A, `cast:tauno:${t.ep}`); k.again = true; } // (under load his seat settles a moment later)
    const u1 = await A.evaluate(() => window.__t.convo());
    const r = await picks(A, ['The crib\'s still there.', 'Somebody\'s flagged the grade.', 'Pink. New.', 'Measuring for who?', 'Away from the west shore', 'Somebody killed him.', 'Marlys?', 'I\'ll go.']);
    await hear(A, 4); await endTalk(A);
    const f = await facts(A, ['tauno.pink', 'knows.eino', 'tauno.upwind', 'tauno.turn', 'tauno.killed', 'door.guiding.named', 'door.boys.named', 'door.family.named', 'door.mining.named']);
    const stage = await A.evaluate(() => window.__game.story.stage);
    result('6a Farm\'s porch of a morning, E on him: U1–U6 by number (the crib, pink, Eino, upwind, the word, the doors); S3', t && t.ep === 31 && k.ok && u1 && r.ok && Object.values(f).every(Boolean) && stage === 'S3', { sat: sat.length, t, k, u1, r: r.ok ? 'ok' : r, f, stage });
    const inn = await walkDoor(A, 31, 'in');
    const k2 = await keeperE(A, 31);
    const r2 = await picks(A, ['Ask about', 'Walt\'s sister\'s at Crane Lake?']);
    await hear(A, 3); await endTalk(A);
    const d = await A.evaluate(() => ({ ringed: window.__game.story.has('door.family.ringed'), ring: window.__game.pencil.ringFor('lv12'), lead: window.__game.leads.state('family') }));
    result('6b at Farm\'s counter a keeper rings a door when asked (Crane Lake: Little Vermilion), the door ringed', k2.ok && r2.ok && d.ringed && !!d.ring, { inn, k2, r2: r2.ok ? 'ok' : r2, d });
  });

  // step 7 (P, B): NB20 and NB31 understood through Tauno; the Front Porch inked from a keeper's ring; the Walt page -------
  await run('7', async () => {
    const r20 = await readSpread(A, 'NB20'), r31 = await readSpread(A, 'NB31'), r01 = await readSpread(A, 'NB01');
    await closeBook(A);
    await clockTo(A, 8, 1);
    await goStore(A, 31);
    await A.evaluate(() => { const g = window.__game, S = g.outfitter.layout(31), b = S.axes.b, f = S.stepsFoot || S.door; window.__L.standAt(f.x + b.x * 4, f.z + b.z * 4, 0); window.__L.step(60); });
    const t = await A.evaluate(() => window.__t.tauno());
    const k = t ? await talkE(A, `cast:tauno:${t.ep}`) : { ok: false };
    const c0 = await A.evaluate(() => window.__t.convo());
    const v = await picks(A, ['V.\'s water']);
    const vs = await hear(A, 4);
    const s = await picks(A, ['Two Stump', 'It\'s in a notebook.']);
    const ss = await hear(A, 4); await endTalk(A);
    const u = await A.evaluate(() => { const s = window.__game.story; return { und20: s.nbHas('und', 'NB20'), und31: s.nbHas('und', 'NB31'), v: s.has('knows.vwater'), t: s.has('knows.twostump') }; });
    result('7a NB20, NB31 (and NB01) read; at Farm\'s porch E on Tauno: "V.\'s water", "Two Stump" → "It\'s in a notebook." by number: both understood', r20 && r31 && r01 && t && k.ok && v.ok && s.ok && u.und20 && u.und31, { r20, r31, t, k, c0, v: v.ok ? 'ok' : v, vs, s: s.ok ? 'ok' : s, ss, u });
    // the margin notes on the page (B's reader)
    await A.evaluate(() => { const g = window.__game, b = g.book; g.journal.show('pack'); g.journal.setSide('walt'); b.view = 'nb'; b.debug.spread(b.debug.spreadOf('NB20')); window.__L.step(4); });
    const pg = await A.evaluate(() => { const el = document.querySelector('#journal .side.w'); return { margin: [...el.querySelectorAll('.nbw-margin')].map((n) => n.textContent), dec: [...el.querySelectorAll('u.dec')].map((n) => n.textContent) }; });
    await shot(A, 'slice-7-nb20');
    result('7b NB20 understood on the page: the margin note in pencil, "V.\'s water" underlined', pg.margin.includes('Bald Eagle. Where they found Eino.') && pg.dec.includes('V.\'s water'), pg);
    // the Front Porch: the Walt page's chip clicked (real), Lake One clicked on the map (real), then a keeper's ring
    const chip = await A.evaluate(async () => {
      const g = window.__game, b = g.book; b.view = 'walt'; b.render(true); window.__L.step(2);
      const S = await import('/src/sheets.js'); const sh = S.sheetAt(-19849, 18415); if (sh) g.profile.ownSheet(sh.id); // (the sheet with Lake One owned: the map shows its water)
      const el = document.querySelector('#journal .side.w [data-nbchip="frontporch"]'); return { chip: !!el, chips: [...document.querySelectorAll('#journal .side.w [data-nbchip]')].map((n) => n.dataset.nbchip) };
    });
    if (chip.chip) await A.click('#journal .side.w [data-nbchip="frontporch"]');
    await A.waitForTimeout(250);
    const spot = await A.evaluate(async () => {
      const g = window.__game, P = g.pencil, h = g.hud, id = P.debug.lakeOfKey('lakeone'), L = g.world.lakes[id - 1];
      if (!g.journal.open || g.journal.side !== 'map') g.journal.showMap();
      h.lookAt(L.cx, L.cz, 5000, 0); h.drawMap(g.player);
      const c = h.canvas, r = c.getBoundingClientRect(), M = await import('/src/map-render.js');
      for (let rad = 0; rad < 200; rad += 8) for (let a = 0; a < 6.28; a += 0.4) {
        const cx = r.left + r.width / 2 + Math.cos(a) * rad, cy = r.top + r.height / 2 + Math.sin(a) * rad;
        const px = ((cx - r.left) / r.width) * c.width, py = ((cy - r.top) / r.height) * c.height, [x, z] = h.worldAt(px, py);
        if (M.lakeAt(g.world, x, z) === id) return { cx, cy, picking: P.picking, side: g.journal.side };
      }
      return { picking: P.picking, side: g.journal.side };
    });
    if (spot.cx) await A.mouse.click(spot.cx, spot.cy);
    await A.waitForTimeout(300);
    const pen = await A.evaluate(() => ({ names: window.__game.pencil.marks().filter((m) => m.kind === 'name').map((n) => [n.nick, n.inked]), ink: window.__game.story.get('ink.frontporch') }));
    await closeBook(A);
    const inn = await walkDoor(A, 31, 'in');
    const k2 = await keeperE(A, 31);
    const r = await dig(A, 'Ever hear a lake called the Front Porch?', { reopen: async () => { await endTalk(A); await A.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, Math.min(17, g.day.hours + 1.1)); window.__L.step(6); }); await keeperE(A, 31); } });
    await hear(A, 3); await endTalk(A);
    const ink = await A.evaluate(() => ({ ink: window.__game.story.get('ink.frontporch'), und: window.__game.story.nbHas('und', 'NB01'), line: window.__game.story.walt().includes('20:5.2.w2') }));
    result('7c the chip clicked, Lake One clicked: the Front Porch pencilled; a keeper asked "Ever hear a lake called the Front Porch?" rings Lake One: inked, NB01 understood', chip.chip && !!spot.cx && pen.names.some(([n]) => n === 'frontporch') && k2.ok && r.ok && ink.ink === 'lakeone' && ink.und && ink.line, { chip, spot, pen, inn, k2, r: r.ok ? 'ok' : r, ink });
    const wp = await A.evaluate(() => {
      const g = window.__game, b = g.book; g.journal.show('pack'); g.journal.setSide('walt'); b.view = 'walt'; b.render(true);
      const el = document.querySelector('#journal .side.w');
      return { head: (el.querySelector('.cb-head') || {}).textContent || '', lines: [...el.querySelectorAll('.cb-line:not(.struck)')].map((n) => n.textContent), struck: [...el.querySelectorAll('.cb-line.struck')].map((n) => n.textContent), heads: [...el.querySelectorAll('.cb-h')].map((n) => n.textContent), nicks: [...el.querySelectorAll('.cb-nick')].map((n) => n.textContent) };
    });
    await shot(A, 'slice-7-walt-page');
    await closeBook(A);
    result('7d the Walt page: "Walt (W.H.)", ten lines or more in their sections, every line in words (none blank, no bare note: "(ringed)" on the crews\' line)', /^Walt/.test(wp.head) && /\(W\.H\.\)/.test(wp.head) && wp.lines.length >= 10 && wp.lines.every((l) => l.trim().length > 3 && !/^\(/.test(l.trim())) && wp.lines.some((l) => /crews' landing.*\(ringed\)$/.test(l)) && wp.heads.includes('People') && wp.heads.includes('Leads'), wp);
  });

  // step 8 (K1a): a co-op guest: no story, the stones read "Stump", no Tauno; nothing breaks for either player -----------
  if (COOP) await run('8', async () => {
    const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Host', shirt: 2 }));
    const B = await openGame('guest');
    await B.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}&story=1&join=${code}`, { timeout: 180000 }); await booted(B);
    await B.waitForFunction(() => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); }, null, { timeout: 120000 });
    await B.fill('#coop-name', 'Ada'); await B.click('#coop-go');
    await B.waitForFunction(() => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.storyLayer, null, { timeout: 150000, polling: 250 });
    await B.evaluate(HELPERS_L); await B.evaluate(HELPERS_T); await B.evaluate(HELPERS_J);
    for (const s of LAYER.steps.filter((q) => q.guest)) await s.run({ page: B, result, shots: SHOTS });
    const g = await B.evaluate(async () => {
      const g = window.__game, home = g.profile.home, T = window.__t;
      const l = g.outfitter.landing(home); await g.player.teleport(l.x, l.z); await window.__L.settle();
      for (let k = 0; k < 120 && !g.outfitter.layout(home); k++) { window.__L.step(10); await window.__L.wait(60); }
      g.day.setClock(g.day.year, g.day.doy, 10); T.walkIn(home); T.walkOut(home); window.__L.step(40);
      return { mode: g.story.mode, staged: T.staged().filter((x) => x.who === 'tauno').length, tab: (() => { const t = document.querySelector('#journal .book-tab.w'); return t ? !t.hidden : false; })(), walt: g.story.walt().length };
    });
    result('8 a co-op guest: its story a mirror; no Tauno on its walkout, no Walt side; the game runs', g.mode === 'mirror' && g.staged === 0 && !g.tab, g);
    const host = await A.evaluate(() => ({ mode: window.__game.story.mode, turn: window.__game.story.has('tauno.turn'), stone: window.__game.story.has('stone.c837') }));
    result('8b the host unchanged by the guest (live, the turn and its stone kept)', host.mode === 'live' && host.turn && host.stone, host);
  });

  // the second season (its own browser): the bundle left on the shelf → R1; the declines → "Changed your mind?" ---------
  await run('declines', async () => {
    const D = await openGame('declines');
    await newSeason(D, ep, 175);
    const ctx = { home: ep };
    for (const s of [T_SHELF, T_R1]) await s.run({ page: D, result, log, ctx });
    await newSeason(D, ep, 176); // (the declines on a season of their own: R1 was this trip's one push, as T's rig plays them)
    await T_DECLINES.run({ page: D, result, log, ctx });
    await D.context().browser().close();
  });
}

// =====================================================================================================================
async function ignore() {
  const A = await openGame('ignore');
  const ep = HOME;
  await newSeason(A, ep, 175);
  // the onboarding as anyone plays it: the gear taken
  await goStore(A, ep);
  const inn = await walkDoor(A, ep, 'in');
  await A.evaluate(() => { const g = window.__game; if (g.onboarding.pending(g.profile.home)) g.onboarding.start(g.profile.home); });
  await A.waitForTimeout(150);
  await hear(A);
  const r = await picks(A, ['I\'ll take it.']);
  for (let k = 0; k < 10; k++) { const c = await A.evaluate(() => window.__t.convo()); if (!c) break; await A.keyboard.press('Digit1'); await A.waitForTimeout(80); }
  await A.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
  const g0 = await A.evaluate(() => ({ boat: !!window.__game.player.boat || window.__game.inventory.containers.length > 0, pack: window.__game.inventory.containers.some((c) => c.item === 'waltpack') }));
  result('I1 the onboarding as anyone plays it: walked in, the gear taken (the bundle is the gear)', inn.ok && r.ok && g0.pack, { inn, r: r.ok ? 'ok' : r, g0 });
  // a night out: the cutscene sat through (a key at its last page), then the morning
  const night = await A.evaluate(async () => {
    const g = window.__game, home = g.outfitter.landing(g.profile.home);
    const c = g.world.campsites.map((q) => ({ q, d: Math.hypot(q.x - home.x, q.z - home.z) })).filter((x) => x.d > 400 && g.campsites.isFree(g.campsites.key(x.q))).sort((a, b) => a.d - b.d)[0].q;
    await g.player.teleport(c.x, c.z); for (let i = 0; i < 60 && (!c.layout || g.player.teleporting); i++) { g.step(1 / 30, 10); await new Promise((r) => setTimeout(r, 100)); }
    const L = c.layout, pad = L.pad, camp = g.camp, inv = g.profile.inventory;
    g.player.standAt({ x: pad.x + pad.fdx * 2.2, z: pad.z + pad.fdz * 2.2, heading: 0, drop: { x: L.fire.x + 1.5, z: L.fire.z + 1.5, heading: 0 } });
    const pack = inv.containers.find((k) => k.item === 'waltpack'); if (pack) { pack.where = 'ground'; pack.at = { x: pad.x + pad.fdx * 1.6, z: pad.z + pad.fdz * 1.6 }; inv.emit('containers'); }
    g.step(1 / 30, 30);
    const tent = camp.tentInReach(); let s = null;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { s = camp.ghostAt(c, tent.def.id, pad.x + dx, pad.z + dz, pad.fdx, pad.fdz); if (s && s.ok) break; }
    camp.stake(s, tent, c); camp.setStage(camp.camp, 4); camp.pitched();
    g.day.setClock(g.day.year, g.day.doy, 21.5); camp.sleep('tent', 'first');
    return { site: g.world.campsites.indexOf(c) };
  });
  let cut = false;
  for (let k = 0; k < 600; k++) {
    await A.evaluate(() => window.__L.step(8));
    const st = await A.evaluate(() => { const g = window.__game, c = g.walt.cut; return { active: !!(c && c.active), beat: c && c.beat, t: c && c.t, night: !!g.camp.night, veil: !!g.veil.active, hours: g.day.hours }; });
    if (st.active) cut = true;
    if (st.active && st.beat === 'cut.11' && st.t > 6) { await A.keyboard.press('Space'); }
    if (cut && !st.active && !st.night && !st.veil) break;
  }
  const morning = await A.evaluate(() => { const g = window.__game; return { hours: g.day.hours, found: g.story.has('nb.found'), cut: !!(g.walt.cut && g.walt.cut.active), paper: !!(g.hud && g.hud.papers && g.hud.papers.size) }; });
  result('I2 night one: the cutscene plays and one key at its last page ends it; the morning comes, nothing left open', cut && morning.found && !morning.cut && morning.hours < 12, { night, morning });
  // the return: in and out of the store; Tauno at the porch foot is walked past (twice: X1), the player free
  await clockTo(A, 10, 1);
  await goStore(A, ep);
  const i2 = await walkDoor(A, ep, 'in');
  const w = await taunoWalkout(A, ep);
  const past = await A.evaluate(() => {
    const g = window.__game, T = window.__t, L = window.__L, st = T.tauno(); if (!st) return null;
    const p = g.player, dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz) || 1;
    for (const r of [8, 15, 22, 30, 40]) { T.standAt(st.x + (dx / d) * r, st.z + (dz / d) * r); L.step(15); }
    return { st, after: T.tauno(), talk: !!T.convo() };
  });
  const free = await A.evaluate(() => { const g = window.__game, p = g.player, x0 = p.x, z0 = p.z; window.__L.look(0); return { x0, z0 }; });
  await A.keyboard.down('w'); await A.evaluate(() => window.__L.step(60)); await A.keyboard.up('w');
  const moved = await A.evaluate((f) => Math.hypot(window.__game.player.x - f.x0, window.__game.player.z - f.z0), free);
  const d1 = await facts(A, ['tauno.porch.declined1', 'tauno.porch.done']);
  result('I3 Tauno at the porch foot, walked past without a word: declined (X1), no talk open, the player walks on (W)', i2.ok && w.t && past && !past.talk && d1['tauno.porch.declined1'] && !d1['tauno.porch.done'] && moved > 2, { i2, w: { ok: w.out.ok, t: w.t && w.t.slot }, past: past && { talk: past.talk }, d1, moved: +moved.toFixed(1) });
  // two more days of an ordinary trip: a night, a morning, the clock and the trip go on; no story card, no Walt UI pushed
  const days = await A.evaluate(async () => {
    const g = window.__game, out = [];
    for (let d = 0; d < 2; d++) {
      g.day.setClock(g.day.year, g.day.doy, 21.5); g.camp.sleep('tent', 'first');
      for (let k = 0; k < 300 && (g.camp.night || g.veil.active); k++) { window.__L.step(10); await window.__L.wait(10); }
      out.push({ doy: g.day.doy, hours: +g.day.hours.toFixed(1), cut: !!(g.walt.cut && g.walt.cut.active), journal: g.journal.open, talk: !!window.__t.convo() });
    }
    return { out, pushes: g.story.beats && g.story.beats.state ? g.story.beats.state() : null };
  });
  result('I4 two more nights: the days go on, no cutscene again, no book or talk opened by the story', days.out.every((d) => !d.cut && !d.journal && !d.talk && d.hours < 12), days);
}

// =====================================================================================================================
try {
  if (MODE === 'slice') await slice(); else await ignore();
} catch (e) { result('the rig ran to its end', false, { error: String(e && e.stack || e).slice(0, 1500) }); }
finally { for (const b of browsers) { try { await b.close(); } catch { /* */ } } }
result('no page errors', errors.length === 0, { errors: errors.slice(0, 10) });
const pass = results.filter((r) => r.pass).length;
writeFileSync(path.join(OUT, `story-slice-${MODE}.json`), JSON.stringify({ mode: MODE, results, errors }, null, 1));
log(`story-slice --${MODE}: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
