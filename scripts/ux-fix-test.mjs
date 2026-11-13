// The UX pass's six fix-first items (2026-11-13), in the real game, the story on (no ?story=), a new season at Moose Lake
// 25 at the store's busiest morning hour:
//   1 the tutorial card shrinks to its line after 8 s ("Talk to Josie at the counter")
//   2 the opening talk at the counter: nobody of the store's within 3 m of the counter after a few seconds; the name tag
//     over the speaker's head; nobody near says a passing line while it is open
//   3 one prompt: walking the store with the dot on, the bottom line never says "Talk to …" (the dot's label does)
//   4 the shelf you face is cleared: whoever browses in front of the tackle shelf moves off; the dot meets the shelf
//   5 the shopping steps let go once you set out: in the loaned canoe 200 m off the landing, no onboarding step is current
//   6 Tauno at the walkout turns to face you as you talk; his name tag shows (as "An old man")
//   7 the watchers' beam is the soft shader (a ShaderMaterial, additive, no fog)
//   8 no page errors
//   APP=http://localhost:5400 node scripts/ux-fix-test.mjs [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS_T } from './slice/c1-talk.mjs';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';

const APP = (process.env.APP || 'http://localhost:5400').replace(/\/$/, '');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg('shots', null); if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push(!!pass); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1400)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  const ev = (fn, a) => page.evaluate(fn, a);
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `fix-${n}.png`) }); };
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  await ev(async () => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === 25), { confirm: false, start: { year: 2027, doy: 191 } }); });
  await page.waitForFunction(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, { timeout: 240000, polling: 250 });
  await ev(HELPERS_T); await ev(HELPERS_L);
  await ev(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); });
  // the busiest hour (as r3-final-play)
  await ev(() => {
    const g = window.__game, N = g.npcs, P = g.parties, ep = 25; let best = 9, n = -1;
    for (let h = 8; h <= 11.5; h += 0.05) { const k = N.storeParties(ep, P.today, h).reduce((a, e) => a + Math.min(3, e.party.size), 0); if (k > n) { n = k; best = h; } }
    g.day.setClock(g.day.year, g.day.doy, best); window.__t.step(90);
  });
  const run = (secs) => ev(async (secs) => { const g = window.__game; for (let k = 0; k < secs * 30; k += 15) { g.step(1 / 30, 15); await new Promise((r) => setTimeout(r, 15)); } }, secs);

  // 1 the tutorial card shrinks
  await run(1);
  const c0 = await ev(() => ({ cls: document.getElementById('tracker').className, text: window.__game.tracker.state().text }));
  await run(9);
  const c1 = await ev(() => ({ cls: document.getElementById('tracker').className, h: Math.round(document.getElementById('tracker').getBoundingClientRect().height), text: window.__game.tracker.state().text }));
  result('1 the tutorial card shrinks to its line after 8 s', !/small/.test(c0.cls) && /small/.test(c1.cls) && c1.h < 60 && /Josie/.test(c1.text), { c0, c1 });
  await shot('1-card-small');

  // 2 the opening talk: the counter cleared, the tag, the room hushed
  const before = await ev(() => { const g = window.__game, L = g.outfitter.layout(25), c = L.counter; return g.npcs.bodies.filter((b) => b.who && !b.lent && b.group.visible && !b.who.person.keeper && !b.who.person.extra).map((b) => { const f = b.who.person.figs[b.who.fig]; return f ? +Math.hypot(f.x - c.x, f.z - c.z).toFixed(1) : 99; }).filter((d) => d < 3).length; });
  await ev(() => { const g = window.__game, L = g.outfitter.layout(25); window.__t.standAt(L.counter.x, L.counter.z, L.counter.heading); window.__t.step(4); g.onboarding.start(25); window.__said = []; const D = g.dialogue, sh = D.show.bind(D); D.show = (q) => { window.__said.push({ who: q.sp.name, d: +D.distTo(q.sp).toFixed(1) }); return sh(q); }; });
  await run(12);
  const talk = await ev(() => {
    const g = window.__game, L = g.outfitter.layout(25), c = L.counter, D = g.dialogue, t = document.querySelector('#talk .tag');
    const near = g.npcs.bodies.filter((b) => b.who && !b.lent && b.group.visible && !b.who.person.keeper && !b.who.person.extra).map((b) => { const f = b.who.person.figs[b.who.fig]; return f ? { n: b.who.person.name, d: +Math.hypot(f.x - c.x, f.z - c.z).toFixed(1), walking: !!f.path } : null; }).filter((x) => x && x.d < 3 && !x.walking);
    return { talking: D.talking, near, tag: t && t.classList.contains('on') ? t.textContent : null, by: D.convo && (D.convo.node.by || D.convo.name), said: window.__said.filter((s) => s.d < 15) };
  });
  await shot('2-opening-talk');
  result('2 the opening talk: the counter cleared of visitors, the speaker\'s name over their head, nobody near speaks', talk.talking && talk.near.length === 0 && talk.tag && talk.tag === talk.by && talk.said.length === 0, { before, ...talk });
  // through the talk, taking the bundle
  for (let i = 0; i < 30; i++) {
    const c = await ev(() => { const d = window.__game.dialogue.convo; return d ? (d.node.choices || []).map((o) => o.text) : null; });
    if (!c) break;
    let k = c.findIndex((x) => x.startsWith('I\'ll take it.')); if (k < 0) k = 0;
    await page.keyboard.press(`Digit${k + 1}`); await run(0.4);
  }
  await ev(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); window.__t.step(10); });

  // 3 one prompt: walking the store, the bottom line never says "Talk to"
  const walk = await ev(async () => {
    const g = window.__game, L = g.outfitter.layout(25), p = g.player, bad = [], dots = new Set();
    const c = L.centre;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, x = c.x + Math.cos(a) * 1.2, z = c.z + Math.sin(a) * 1.2;
      window.__t.standAt(x, z, a + Math.PI * 0.7); g.chase.viewYaw = p.heading; g.chase.forwardYaw = p.heading; g.step(1 / 30, 8);
      const pr = p.prompt && p.prompt.text, t = g.pointer.target;
      if (t) dots.add(`${t.kind}:${t.label}`);
      if (g.pointer.on && pr && /Talk to|A word with/.test(pr)) bad.push(pr.slice(0, 60));
      await new Promise((r) => setTimeout(r, 10));
    }
    return { bad, dots: [...dots].slice(0, 10) };
  });
  result('3 one prompt: with the dot on, the bottom line never names a talk (the dot does)', walk.bad.length === 0 && walk.dots.some((d) => /^person:/.test(d)), walk);

  // 4 the shelf you face is cleared
  const shelf = await ev(async () => {
    const g = window.__game, L = g.outfitter.layout(25), hot = L.hot || [], q = hot.find((h) => h.key === 'tackle') || hot.find((h) => /tackle|shelf/.test(h.key));
    if (!q) return { none: hot.map((h) => h.key) };
    // a visitor put in front of it, browsing (as Sue stood)
    const v = g.npcs.bodies.map((b) => b.who && !b.lent && !b.who.person.keeper && !b.who.person.extra ? b.who : null).find(Boolean);
    const dx = q.x - L.centre.x, dz = q.z - L.centre.z, n = Math.hypot(dx, dz) || 1;
    const front = { x: q.x - dx / n * 0.8, z: q.z - dz / n * 0.8 }, me = { x: q.x - dx / n * 2.3, z: q.z - dz / n * 2.3 };
    let placed = null;
    if (v) { const f = v.person.figs[v.fig]; f.x = front.x; f.z = front.z; f.path = null; placed = v.person.name; }
    const yaw = Math.atan2(-(q.z - me.z), q.x - me.x);
    window.__t.standAt(me.x, me.z, yaw); g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw; g.chase.viewPitch = -0.15;
    for (let k = 0; k < 300; k++) { g.step(1 / 30, 1); window.__t.standAt(me.x, me.z, yaw); g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw; if (k % 30 === 0) await new Promise((r) => setTimeout(r, 10)); }
    const near = g.npcs.bodies.filter((b) => b.who && !b.lent && b.group.visible && !b.who.person.keeper && !b.who.person.extra).map((b) => { const f = b.who.person.figs[b.who.fig]; return f ? { n: b.who.person.name, d: +Math.hypot(f.x - front.x, f.z - front.z).toFixed(2), walking: !!f.path } : null; }).filter((x) => x && x.d < 0.7);
    const t = g.pointer.target;
    return { placed, near, target: t ? `${t.kind}:${t.label}` : null };
  });
  await shot('4-shelf');
  result('4 the shelf you face is cleared: the browser in front of the tackle shelf moved off', !shelf.none && shelf.placed && shelf.near.filter((x) => !x.walking).length === 0, shelf);

  // 5 the shopping steps let go once you set out (no food, no leeches bought)
  const off = await ev(async () => {
    const g = window.__game, p = g.player, L = g.outfitter.landing(25), d = p.carry && p.carry.drop;
    if (!d) return { none: 'no canoe' };
    window.__t.standAt(d.x + 1.2, d.z + 1.2); g.step(1 / 30, 10);
    // in, as E gets in (the canoe's verb), then out 200 m on the water
    const a = g.packs && g.packs.hullAction ? g.packs.hullAction() : null; if (a && a.e && a.e.run) a.e.run({ key: 'KeyE' });
    for (let k = 0; k < 40 && p.mode !== 'paddle'; k++) { g.step(1 / 30, 5); await new Promise((r) => setTimeout(r, 20)); }
    const W = g.world; let spot = null;
    for (let r = 150; r <= 400 && !spot; r += 50) for (let i = 0; i < 16 && !spot; i++) { const x = L.x + Math.cos(i / 16 * 6.283) * r, z = L.z + Math.sin(i / 16 * 6.283) * r; if (W.shoreAt(x, z) < -10) spot = { x, z }; }
    if (p.mode === 'paddle' && spot) { p.x = spot.x; p.z = spot.z; }
    for (let k = 0; k < 60; k++) { g.step(1 / 30, 5); await new Promise((r) => setTimeout(r, 10)); }
    g.guide.sync();
    const cur = g.guide.current(), pa = g.onboarding.state.path;
    return { mode: p.mode, d: Math.round(Math.hypot(p.x - L.x, p.z - L.z)), cur: cur ? cur.id : null, next: cur ? cur.next : null, path: pa, tracker: g.tracker.state().text };
  });
  result('5 set out without food or leeches: the shopping steps let go, the card goes to the trip', off.mode === 'paddle' && off.d > 80 && !/^story:onboard/.test(off.cur || '') && off.path && off.path.food === 'skipped' && off.path.leeches === 'skipped', off);

  // 6 Tauno at the walkout turns to you; his tag
  const tau = await ev(async () => {
    const g = window.__game, s = g.story, T = window.__t, ep = 25;
    await g.player.teleport(g.outfitter.landing(ep).x, g.outfitter.landing(ep).z); await T.settle();
    s.debug.do('found', { abs: s.time().abs }); s.markRead('NB45', 'rig'); g.day.setClock(g.day.year, g.day.doy + 1, 10); T.step(4);
    T.walkOut(ep); T.walkIn(ep); T.walkOut(ep); T.step(30);
    const t = T.tauno(); if (!t) return { none: 'not staged', staged: T.staged() };
    const key = `cast:tauno:${t.ep}`;
    // stand off to his side, so he must turn
    const fig = (() => { for (const list of g.npcs.rosters.values()) for (const v of list) if (v.key === key) return v.figs[0]; return null; })();
    if (!fig) return { none: 'no figure' };
    const side = fig.heading + Math.PI / 2, px = fig.x + Math.cos(side) * 1.8, pz = fig.z - Math.sin(side) * 1.8;
    T.standAt(px, pz, Math.atan2(-(fig.z - pz), fig.x - px)); T.step(4);
    const want = () => Math.atan2(-(g.player.z - fig.z), g.player.x - fig.x), off0 = Math.abs(Math.atan2(Math.sin(want() - fig.heading), Math.cos(want() - fig.heading)));
    T.talkTo(key);
    for (let k = 0; k < 75; k++) { g.step(1 / 30, 1); if (k % 15 === 0) await new Promise((r) => setTimeout(r, 10)); }
    const off1 = Math.abs(Math.atan2(Math.sin(want() - fig.heading), Math.cos(want() - fig.heading)));
    const tag = document.querySelector('#talk .tag');
    return { talking: g.dialogue.talking, off0: +off0.toFixed(2), off1: +off1.toFixed(2), tag: tag && tag.classList.contains('on') ? tag.textContent : null, name: g.dialogue.convo && g.dialogue.convo.name };
  });
  await shot('6-tauno');
  result('6 Tauno turns to face you as you talk; his name tag shows', !tau.none && tau.talking && tau.off0 > 1.0 && tau.off1 < 0.35 && tau.tag && tau.tag === tau.name, tau);
  await ev(() => { const g = window.__game; while (g.dialogue.convo) g.dialogue.close(); });

  // 7 the beam's material
  const beam = await ev(async () => { const m = await import('/src/watchers.js').catch(() => null); const W = m && m.watchers; if (!W) return { none: true }; const T = window.__game.THREE; W.c = W.c || {}; const sc = W.c.scene; W.c.scene = window.__game.scene; W.beam({ id: 'test', x: 0, z: 0, light: true, cone: 0 }, { day: false }, false); const b = W.beams.get('test'); const r = b ? { shader: b.material.type, additive: b.material.blending === T.AdditiveBlending, fog: b.material.fog } : null; if (b) { b.visible = false; b.userData.dot.visible = false; } W.c.scene = sc; return r; });
  result('7 the watchers\' beam is the soft shader', beam && beam.shader === 'ShaderMaterial' && beam.additive && beam.fog === false, beam);
  result('8 no page errors', errors.length === 0, errors.slice(0, 4));
} catch (e) {
  result('the run', false, { error: String((e && e.stack) || e).slice(0, 1500) });
} finally { await browser.close(); }
const ok = results.every(Boolean);
log(`ux-fix-test: ${results.filter(Boolean).length}/${results.length} ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
