// Stream L's rig (story Round 1, docs/build/campaign-design.md §7.1): the story layer in the game. Headless Chromium
// against a running Vite (and the relay for part 4).
//   1 flag off: main exactly (no layer module fetched, no story clearings, world.portagesPublic() is world.portages)
//   2 flag on: the layer attached (40 places, for this release), the clearings in World.load, the props per tile
//   3 the slice section (scripts/slice/c1-layer.mjs): step 3 (C837, NB01), step 5 (the crews' landing by real input)
//   4 the props drop when their tiles go (far off: none in the scene); the EP 33 lot's slab and pole beside the lot
//   5 co-op (needs RELAY): a guest's layer, slice step 8
//   APP=http://localhost:5631 RELAY=ws://localhost:8631 node scripts/c1-layer-test.mjs [--out dir] [--no-coop]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { section, HELPERS } from './slice/c1-layer.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5631').replace(/\/$/, '');
const RELAY = process.env.RELAY || '';
const COOP = !process.argv.includes('--no-coop') && !!RELAY;
const OUT = path.resolve(arg('out', 'c1-layer-out'));
mkdirSync(OUT, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };
const browsers = [];
async function openGame(name, query = '') {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(browser);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /story|layer/i.test(m.text()))) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  const q = [RELAY ? `relay=${encodeURIComponent(RELAY)}` : '', query].filter(Boolean).join('&');
  await page.goto(`${APP}/${q ? '?' + q : ''}`, { timeout: 180000 });
  await booted(page);
  log(`[${name}] loaded`);
  return page;
}
const booted = (page) => page.waitForFunction(() => window.__game && window.__game.title && window.__game.story && (window.__game.title.state === 'title' || window.__game.title.state === 'game') && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
const inGame = (page) => page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 150000, polling: 250 });
const newSeason = async (page, home = 25, doy = 190) => {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await inGame(page);
  await page.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); if (g.onboarding.pending && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.outfitter.visit ? g.outfitter.visit.ep : 25, false); } });
};
const loaded = (page, rx) => page.evaluate((rx) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => new RegExp(rx).test(n)), rx);
const LAYER_MODS = 'story-(layer|world|places|props)|walt-sites|feed-place|rules-layer';

try {
  // 1 flag off --------------------------------------------------------------------------------------------------------
  {
    const A = await openGame('off');
    await newSeason(A);
    await A.evaluate(() => window.__game.step(1 / 30, 30));
    const off = await A.evaluate(() => { const g = window.__game, w = g.world; return { clear: w.storyClear === undefined, places: w.storyPlaces === undefined, pub: w.portagesPublic() === w.portages && w.portagesAll() === w.portages, hidden: w.hiddenFrom ?? null, layer: g.storyLayer === undefined, n: w.portages.length }; });
    off.mods = await loaded(A, LAYER_MODS);
    result('1 flag off: no layer module fetched, no story clearings, portagesPublic() is world.portages, no layer on __game', off.clear && off.places && off.pub && off.hidden === null && off.layer && !off.mods.length, off);
    await A.context().browser().close();
  }
  // 2 flag on ---------------------------------------------------------------------------------------------------------
  const A = await openGame('on', 'story=1');
  await newSeason(A, 25, 190);
  await A.waitForFunction(() => !!(window.__game.storyLayer && window.__game.storySeams && window.__game.storySeams.feed), null, { timeout: 60000 });
  await A.evaluate(HELPERS);
  {
    const on = await A.evaluate(() => { const g = window.__game, l = g.storyLayer, w = g.world; return { st: l.state(), clear: (w.storyClear || []).length, lawns: (w.storyClear || []).every((s) => s[4] < 0), feed: g.storySeams.feed.names(), pub: w.portagesPublic() === w.portages, stub: l.stub }; });
    on.mods = await loaded(A, LAYER_MODS);
    result('2 flag on: the layer attached (40 places, this release), World.load\'s clearings (lawns), the place adapter in the feed', on.st.places === 40 && !on.st.stale && on.clear >= 80 && on.lawns && on.feed.includes('place') && on.pub && on.stub === false, on);
  }
  // 3 the slice section -----------------------------------------------------------------------------------------------
  for (const s of section.steps.filter((x) => !x.guest)) {
    log(`slice step ${s.step}: ${s.name}`);
    try { await s.run({ page: A, result, shots: OUT }); } catch (e) { result(`slice ${s.step} (L) ran`, false, { error: String(e.stack || e).slice(0, 800) }); }
  }
  // 4 drops, and the lot's props ------------------------------------------------------------------------------------------
  {
    const far = await A.evaluate(async () => {
      const g = window.__game, L = window.__L, ep = g.world.entryPoints.find((e) => e.ep === 1);
      await L.near(ep.x, ep.z); for (let k = 0; k < 20; k++) { L.step(10); await L.wait(30); } g.storyLayer.poll();
      const inScene = g.scene.children.filter((m) => /^story /.test(m.name)).map((m) => m.name);
      return { built: g.storyLayer.builtList().filter((b) => b.place === 'crews.landing' || b.place === 'ws.c837').length, inScene };
    });
    result('4 far off (Trout Lake): the landing\'s and C837\'s props are dropped, out of the scene', far.built === 0 && !far.inScene.some((n) => /crews|c837/.test(n)), far);
    const lot = await A.evaluate(async () => {
      const g = window.__game, L = window.__L, ep = g.world.entryPoints.find((e) => e.ep === 33);
      await L.near(ep.x, ep.z);
      let pl = g.storyLayer.place('ep33.crewcamp');
      for (let k = 0; k < 150 && !Number.isFinite(pl.x); k++) { L.step(10); await L.wait(100); }
      const lotD = Number.isFinite(pl.x) ? Math.round(Math.hypot(pl.x - ep.x, pl.z - ep.z)) : null;
      if (Number.isFinite(pl.x)) { await g.tiles.ensure(pl.x, pl.z, 130); L.standAt(pl.x + 4, pl.z + 4); for (let k = 0; k < 40; k++) { L.step(5); await L.wait(40); g.storyLayer.poll(); if (g.storyLayer.builtList().filter((b) => b.place === 'ep33.crewcamp').length === 2) break; } }
      pl = g.storyLayer.place('ep33.crewcamp'); const b = g.storyLayer.builtList().filter((q) => q.place === 'ep33.crewcamp');
      return { placed: Number.isFinite(pl.x), lotD, built: b.map((q) => q.prop), names: [g.storyLayer.dotName('ep33.slab'), g.storyLayer.dotName('ep33.pole')], verbs: g.storyLayer.verbs('ep33.slab').map((v) => v.verb) };
    });
    result('4 the EP 33 lot: the slab and the pole beside it once the lot is built; the dot reads Slab / Pole, Look only', lot.placed && lot.built.length === 2 && lot.names.join() === 'Slab,Pole' && lot.verbs.join() === 'Look', lot);
    if (lot.placed) { await A.evaluate(() => { const L = window.__L, q = L.prop('ep33.pole'); L.face(q, 6, q.y + 2.5); L.step(10); }); await A.screenshot({ path: path.join(OUT, 'L4-ep33-lot.png') }); }
  }
  // 5 co-op ---------------------------------------------------------------------------------------------------------------
  if (COOP) {
    const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Host', shirt: 2 }));
    const B = await openGame('guest', 'story=1');
    await B.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}&story=1&join=${code}`, { timeout: 180000 }); await booted(B);
    await B.waitForFunction(() => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); }, null, { timeout: 120000 });
    await B.fill('#coop-name', 'Ada'); await B.click('#coop-go');
    await B.waitForFunction(() => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.storyLayer, null, { timeout: 150000, polling: 250 });
    await B.evaluate(HELPERS);
    for (const s of section.steps.filter((x) => x.guest)) { try { await s.run({ page: B, result, shots: OUT }); } catch (e) { result(`slice ${s.step} (L) ran`, false, { error: String(e.stack || e).slice(0, 800) }); } }
    const host = await A.evaluate(() => ({ mode: window.__game.story.mode, stone: window.__game.story.has('stone.c837'), crib: window.__game.story.has('landing.crib') }));
    result('5 the host unchanged by the guest (live, its stone still counted)', host.mode === 'live' && host.stone && host.crib, host);
  }
} catch (e) { result('rig ran to the end', false, { error: String(e && e.stack || e).slice(0, 1500) }); }
finally { for (const b of browsers) { try { await b.close(); } catch { /* */ } } }

result('no page errors', errors.length === 0, { errors: errors.slice(0, 10) });
const pass = results.filter((r) => r.pass).length;
writeFileSync(path.join(OUT, 'c1-layer-test.json'), JSON.stringify({ results, errors }, null, 1));
log(`c1-layer-test: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
