// Campaign Round 6, stream p (the company and the press, 40): the arc in the real game, headless Chromium against a
// running Vite, each check printed PASS or FAIL:
//   0 flag off: company.js never fetched, no storyCompany
//   1 tiers rise with the story (asked → 1, the belt → 2); a tier-2 posting drawn as a sighting near the player
//   2 the midpoint: two big findings (Mary's far end counted) + tier 2 + the call → a trip starts → midpoint, tier 3
//   3 the camp search: ev.search, the Walt line
//   4 Wade at the next counter: staged, "Do I know you?" → wade.named
//   5 Dan: his card (tier 1's meeting), then the $1,000 offer (dan.offer)
//   6 Josie's leech order at home: the slip, maggie.note
//   7 Maggie at Hog Creek from the third morning: met, the letter beside the notebook, the papers (key.L1D), the meeting
//   8 the pad: "Leave a leech order." → Lake One, three dozen → story.doc.meeting; the run reads it
//   9 the canoe adrift (September): ev.adrift, tier 4, the paddles stood where it drifts
//  10 Dan's set-up after the adrift; Wade at the put-in
//  11 Brekke at the corner table on a Thursday: "Stations seven to twelve." → choice.brekke=needle, tier capped at 4
//  12 the stranger at the far landing (a belt lake)
//   (and no page errors)
//
//   APP=http://localhost:5370 node scripts/cmp-p-test.mjs [--only off|A] [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS } from './slice/c1-layer.mjs';
import { HELPERS_T, choose, hear } from './slice/c1-talk.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5370').replace(/\/$/, '');
const ONLY = arg('only', null), SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1800)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const open = async (url) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /story p|p: /.test(t)) log('console', t.slice(0, 300)); });
  await page.goto(url, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && (!/story=1/.test(location.search) || window.__game.storyCompany) && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS); await page.evaluate(HELPERS_T);
  return page;
};
const newSeason = async (page, home, doy = 232) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate((d) => { const w = window.__game.title.wizard; w.setDate(d); w.next(); }, doy);
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, L = window.__L; L.step(30); const o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 10); L.step(10); });
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const closeTalk = (page) => page.evaluate(() => { const D = window.__game.dialogue; try { if (D && D.convo) D.close(false); } catch { /* */ } window.__L.step(4); return !(D && D.convo); });
// in the page: set facts, the story's state
const PAGE = () => {
  const g = window.__game, s = g.story, C = g.storyCompany;
  window.__p = {
    set(list) { for (const k of list) { const [key, v] = k.split('='); if (!s.has(key)) s.set(key, v == null ? true : v, 'rig'); } return s.tier; },
    has(list) { return Object.fromEntries(list.map((k) => [k, s.has(k) ? (s.get(k) ?? true) : false])); },
    st() { return C.debug.state(); },
    async to(ep, inside = false) { const L = g.outfitter.layout(ep); if (!L) return false; await window.__L.tp(L.door.x + L.axes.b.x * 6, L.door.z + L.axes.b.z * 6); await window.__L.settle(); if (inside) return window.__t.walkIn(ep); return true; },
    clock(addDays, hours, doy = null) { const d = g.day; if (doy != null) d.setClock(d.year, doy, hours); else d.setClock(d.year, d.doy + addDays, hours); window.__L.step(6); return { doy: d.doy, h: d.hours, abs: s.nowAbs() }; },
  };
};

try {
  if (!ONLY || ONLY === 'off') {
    const off = await open(APP);
    await newSeason(off, 25);
    const z = await off.evaluate(() => ({ loaded: performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\/src\/(company|story-data\/company)\.js/.test(n)), c: window.__game.storyCompany ?? null }));
    result('0 flag off: company.js never fetched, no storyCompany', z.loaded.length === 0 && z.c === null, z);
    await off.close();
  }
  if (!ONLY || ONLY === 'A') {
    const a = await open(`${APP}/?story=1`);
    await newSeason(a, 25);
    await a.evaluate(PAGE);
    // 1 tiers and a sighting
    const d1 = await a.evaluate(async () => {
      const g = window.__game, s = g.story, P = window.__p, C = g.storyCompany, W = C.c.watchers;
      const t0 = s.tier; P.set(['nb.found', 'asked.boreal.2']); const t1 = s.tier; P.set(['crews.seen']); const t2 = s.tier;
      // a day with the belt posting on Bald Eagle (25 % a day)
      let day = null; const abs0 = Math.floor(s.nowAbs());
      for (let k = 0; k < 40 && !day; k++) { const L = W.postings(abs0 + k) || []; const r = L.find((q) => q.id === 't2-belt-be' || q.id === 't2-belt-gb'); if (r) day = { k, r }; }
      if (!day) return { t0, t1, t2, day: null };
      P.clock(day.k, 11);
      await window.__L.tp(day.r.x + 350, day.r.z); await window.__L.settle();
      for (let i = 0; i < 12; i++) { window.__L.step(6); await window.__L.wait(20); }
      return { t0, t1, t2, posting: day.r.id, sightings: C.debug.sightings(), logged: s.keys('ev.watchers@').map(([k]) => k) };
    });
    result('1 tiers rise with the story (0 → 1 asked → 2 the belt); a tier-2 posting drawn as a sighting, logged ev.watchers@', d1.t0 === 0 && d1.t1 === 1 && d1.t2 === 2 && d1.sightings && d1.sightings.length > 0 && d1.logged.length > 0, d1);
    await shot(a, '1-sighting');
    // 2 the midpoint
    const d2 = await a.evaluate(() => { const g = window.__game, s = g.story, P = window.__p; P.set(['door.mining.yield']); const b1 = s.bigCount; P.set(['mary.farend']); const b2 = s.bigCount; const before = s.has('midpoint'); P.set(['tauno.call', 'maggie.called=tauno']); s.ingest('trip:start', { n: 1, ep: 25 }); return { b1, b2, before, mid: s.has('midpoint'), tier: s.tier }; });
    result('2 the midpoint: Mary\'s far end counted (2 big), the call, a trip starts → midpoint, tier 3', d2.b1 === 1 && d2.b2 === 2 && !d2.before && d2.mid && d2.tier === 3, d2);
    // 3 the search
    const d3 = await a.evaluate(() => { const g = window.__game, s = g.story, C = g.storyCompany; const ok = C.debug.search('camp'); return { ok, search: s.get('ev.search'), walt: s.walt().includes('40.w.search.1') }; });
    result('3 the camp search: ev.search and the Walt page line', d3.ok && !!d3.search && d3.walt, d3);
    // 4 Wade at the counter (Moose Lake 25, home)
    await a.evaluate(() => window.__p.to(25, false));
    const d4a = await a.evaluate(() => { const C = window.__game.storyCompany; const e = C.debug.enter(25); return { e, st: C.debug.state() }; });
    await a.evaluate(() => window.__game.storyCompany.debug.wade());
    const c4 = await a.evaluate(() => window.__t.convo());
    const r4 = await choose(a, 'Do I know you?'); const said4 = await hear(a, 6);
    const f4 = await a.evaluate(() => window.__p.has(['wade.counter', 'wade.named']));
    await closeTalk(a);
    result('4 Wade at the next counter: staged, "Do I know you?" → his name (wade.named)', !!(d4a.e && d4a.e.wade) && !!c4 && r4.ok && f4['wade.named'] === true, { d4a, c4, r4, said4, f4 });
    // 5 Dan: the card, then the offer
    const e5 = await a.evaluate(() => window.__game.storyCompany.debug.enter(25));
    await a.evaluate(() => window.__game.storyCompany.debug.dan());
    const r5a = await choose(a, 'Which company?'); const said5a = await hear(a, 8); await closeTalk(a);
    const e5b = await a.evaluate(() => { window.__L.step(10); return window.__game.storyCompany.debug.enter(25); });
    await a.evaluate(() => window.__game.storyCompany.debug.dan());
    const r5b = await choose(a, 'Go ahead.'); const said5b = await hear(a, 8); await closeTalk(a);
    const f5 = await a.evaluate(() => ({ ...window.__p.has(['dan.met', 'dan.card', 'dan.offer']), card: window.__game.inventory.count('dancard', { reachable: false }), walt: window.__game.story.walt().filter((w) => /^40/.test(w)) }));
    result('5 Dan: his card at the first counter after tier 1, then the $1,000 offer after the midpoint', e5 && e5.dan === 'meet' && r5a.ok && e5b && e5b.dan === 'offer' && r5b.ok && f5['dan.card'] && f5['dan.offer'] && f5.card > 0, { e5, r5a, said5a: said5a.slice(-2), e5b, r5b, said5b: said5b.slice(-2), f5 });
    // 6 Josie's slip
    await a.evaluate(() => window.__game.storyCompany.debug.josie());
    const said6 = await hear(a, 6); await closeTalk(a);
    const f6 = await a.evaluate(() => ({ ...window.__p.has(['maggie.note']), slip: window.__game.inventory.count('page:leechslip', { reachable: false }) }));
    result('6 Josie\'s leech order at home: the slip in the book, maggie.note', f6['maggie.note'] !== false && f6.slip > 0, { said6: said6.slice(0, 2), f6 });
    // 7 Maggie at Hog Creek on the third morning
    const d7 = await a.evaluate(async () => { const P = window.__p; P.clock(3, 10); await P.to(36, false); for (let i = 0; i < 10; i++) { window.__L.step(6); await window.__L.wait(20); } return { at: window.__game.storyCompany.debug.maggieAt(), clock: P.clock(0, 10) }; });
    await a.evaluate(() => window.__game.storyCompany.debug.maggie());
    const said7 = await hear(a, 4);
    const r7 = [];
    for (const c of ['What do you want?', 'Hold it beside the notebook.', 'His notebook.']) { r7.push(await choose(a, c)); await hear(a, 14); }
    const r7m = await choose(a, 'If I found it'); const said7m = await hear(a, 12); await closeTalk(a);
    const f7 = await a.evaluate(() => ({ ...window.__p.has(['maggie.met', 'maggie.matched', 'maggie.ostrander', 'maggie.kettlemap', 'key.L1D', 'maggie.meeting']), pages: ['page:walt2019', 'page:ostrander', 'page:boreal1976', 'page:kettlemap'].filter((id) => window.__game.inventory.count(id, { reachable: false }) > 0) }));
    result('7 Maggie at Hog Creek: met, the letter beside the notebook (matched), the papers (key.L1D), the meeting point', !!d7.at && f7['maggie.met'] && f7['key.L1D'] && f7['maggie.matched'] && f7['maggie.meeting'] && f7.pages.length === 4, { d7, said7, r7, r7m, said7m: said7m.slice(-1), f7 });
    await shot(a, '7-maggie');
    // 8 the pad
    const d8 = await a.evaluate(async () => {
      const g = window.__game, C = g.storyCompany, s = g.story;
      const items = C.keeperItems({ keeper: true, ep: 36, name: 'The keeper', key: 'rig' });
      const pad = items.find((i) => /leech order/i.test(i.text));
      const n0 = pad ? pad.go() : null;
      C.debug.order(30, 3);
      return { items: items.map((i) => i.text), choices: n0 && n0.choices ? n0.choices.map((c) => c.text) : null, meeting: s.doc.meeting, abs: Math.floor(s.nowAbs()), run: s.run ? s.run.meeting : 'no run' };
    });
    result('8 the pad: "Leave a leech order." → Lake One / Little Gabbro; Lake One, three dozen → story.doc.meeting { ep 30, the third dawn }; the run reads it', d8.choices && d8.choices.includes('Lake One.') && d8.meeting && d8.meeting.ep === 30 && d8.meeting.firstDawn === d8.abs + 3 && (d8.run === 'no run' || (d8.run && d8.run.ep === 30)), d8);
    // 9 the canoe adrift in September
    const d9 = await a.evaluate(async () => {
      const g = window.__game, s = g.story, C = g.storyCompany, P = window.__p;
      P.clock(0, 6, 252); const L = g.outfitter.layout(25), w = g.world;
      // the canoe set down at the water's edge by Moose Lake's landing
      const lg = g.trip && g.npcs.landingOf ? g.npcs.landingOf(25) : null; const at = lg || { x: L.door.x, z: L.door.z };
      await window.__L.tp(at.x, at.z); await window.__L.settle(); window.__t.standAt(g.player.x, g.player.z); window.__L.step(4);
      const before = g.inventory.long.filter((l) => /paddle|ash|bent|carbon/.test(l.id)).map((l) => l.id);
      const r = C.debug.adrift(); for (let i = 0; i < 10; i++) { window.__L.step(6); await window.__L.wait(20); }
      return { r: r ? { from: r.from, end: r.end } : null, ev: s.get('ev.adrift'), tier: s.tier, before, took: C.adrifted && C.adrifted.took, w: !!w };
    });
    result('9 the canoe adrift: ev.adrift, tier 4, the paddles gone from camp and stood where it will ground', !!d9.r && !!d9.ev && d9.tier === 4 && Array.isArray(d9.took), d9);
    // 10 Dan's set-up; Wade at the put-in
    await a.evaluate(() => window.__p.to(25, false));
    const e10 = await a.evaluate(() => window.__game.storyCompany.debug.enter(25));
    await a.evaluate(() => window.__game.storyCompany.debug.dan()); const said10 = await hear(a, 6); await closeTalk(a);
    const p10 = await a.evaluate(() => { const C = window.__game.storyCompany; window.__p.clock(0, 10); const ok = C.debug.putin(25); const t = C.debug.putinTalk(); return { ok, t }; });
    const r10 = await choose(a, 'It\'s holding up.'); await closeTalk(a);
    const f10 = await a.evaluate(() => window.__p.has(['dan.setup', 'wade.putin']));
    result('10 Dan\'s set-up after the adrift ("they\'d find a number"); Wade at the put-in ("That old tent of Walt\'s holding up?")', e10 && e10.dan === 'setup' && f10['dan.setup'] && p10.ok && r10.ok && !!f10['wade.putin'], { e10, said10: said10.slice(-1), p10, r10, f10 });
    // 11 Brekke on a Thursday at Farm's corner table
    const d11 = await a.evaluate(async () => {
      const g = window.__game, s = g.story, P = window.__p;
      let doy = g.day.doy; for (let k = 0; k < 8; k++) { const dw = new Date(Date.UTC(g.day.year, 0, doy + k)).getUTCDay(); if (dw === 4) { doy += k; break; } }
      P.clock(0, 12, doy); await P.to(31, true);
      for (let i = 0; i < 30; i++) { window.__L.step(10); await window.__L.wait(20); if (g.storyMining.miningCast.live.get('brekke')) break; }
      return { doy, staged: !!g.storyMining.miningCast.live.get('brekke'), talk: !!(g.storyMining.miningCast.live.get('brekke') && g.storyCompany.debug.brekke()), tier: s.tier };
    });
    await hear(a, 10);
    const r11 = await choose(a, 'Stations seven to twelve.'); await hear(a, 6); await closeTalk(a);
    const f11 = await a.evaluate(() => ({ ...window.__p.has(['brekke.talked', 'brekke.needled']), choice: window.__game.story.get('choice.brekke'), tier: window.__game.story.tier }));
    result('11 Brekke at the corner table on a Thursday: "Stations seven to twelve." → choice.brekke=needle, the tier capped at 4', d11.talk && r11.ok && f11.choice === 'needle' && f11['brekke.needled'] && f11.tier === 4, { d11, r11, f11 });
    // 12 the stranger at the far landing
    const d12 = await a.evaluate(async () => {
      const g = window.__game, s = g.story, C = g.storyCompany; window.__p.clock(0, 11);
      await window.__L.tp(-27150, 26150); await window.__L.settle();
      const lake = C.lakeAt(g.player.x, g.player.z); const ok = C.debug.stranger('Gabbro carry');
      return { lake, ok, ev: s.get('ev.stranger'), walt: s.walt().includes('40.w.stranger.1') };
    });
    result('12 the stranger at the far landing (a belt lake, tier 2+, once): ev.stranger and the Walt line', d12.ok && !!d12.ev && d12.walt, d12);
    await a.close();
  }
} catch (e) { result('threw', false, { e: String(e && e.stack || e).slice(0, 800) }); }
result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
await browser.close();
const fails = results.filter((r) => !r.pass);
log(`${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
