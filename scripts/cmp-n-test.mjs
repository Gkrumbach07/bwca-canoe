// Stream n (Round 3, the endings): from the run's end facts, each of J, JN and M played to its postcard in the real game,
// headless Chromium against a running Vite (?story=1), each check printed PASS or FAIL. Where r's run is not in the build
// the run is a stub (endings.debug.runStub: run.lifted + the run.active sensor), and says so.
//   per ending: the lot at Lake One 30 staged (Dan, Wade, the loading party; the wagon here or by the call), the edge
//   ("Not with these."), the come-out held, the scene by real keys (Maggie's or Dan's), the ending's facts, the
//   trip's come-out after it; then the world 20 and 31 days on: the paper, the board, the pools, the props, the upcharge,
//   consulting, Tasha's sampling, and the postcard at the home counter from Josie
//   off: the flag off: endings.js never fetched, no hold, no storyMul, no board filter
//
//   APP=http://localhost:5250 node scripts/cmp-n-test.mjs [--only off|J|JN|M]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T, choose, hear } from './slice/c1-talk.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5250').replace(/\/$/, '');
const ONLY = arg('only', null);
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1500)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(query) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /story n|n: /.test(t)) log('console', m.type(), t.slice(0, 300)); });
  await page.goto(`${APP}/${query ? '?' + query : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  return page;
}
async function newSeason(page, home, doy, story = true) {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await page.waitForFunction((story) => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && (!story || (g.storyTalk && g.storyEndings)); }, story, { timeout: 200000, polling: 250 });
}
const LOT = 30, HOME = 25, DOY = 230; // Lake One's lot; home Moose Lake; 18 August (so Tasha's open-water notice is in season 31 days on)

async function ending(E) {
  const page = await open('story=1');
  await newSeason(page, HOME, DOY);
  await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T);
  // the run's end facts: the notebook, Maggie met, the Walt page north (JN), the meeting at Lake One (J and JN), the run
  const pre = await page.evaluate(async ([E, LOT]) => {
    const g = window.__game, s = g.story, en = g.storyEndings, L = window.__L;
    if (g.outfitter.open) g.outfitter.hide();
    s.set('nb.found', true, 'rig'); s.meet('maggie', 'rig');
    if (E === 'JN') s.set('drift.done', true, 'rig');
    if (E !== 'M') s.doc.meeting = { ep: LOT, firstDawn: s.time().abs - 1 };
    const real = !!s.run;
    if (!real) en.debug.runStub(true); else s.set('run.lifted', E !== 'M' ? LOT : 'any', 'rig');
    // to the lot (its tile in, its layout built)
    const e = g.world.entryPoints.find((x) => x.ep === LOT);
    await L.tp(e.x, e.z);
    for (let k = 0; k < 120 && !g.trailhead.trailheadLayout(LOT); k++) { L.step(5); await L.wait(100); }
    const T0 = g.trailhead.trailheadLayout(LOT);
    g.day.setClock(g.day.year, g.day.doy, 7);
    return { real, lot: !!T0, north: s.north, active: s.readSensor('run.active') };
  }, [E, LOT]);
  result(`${E} 1: the run's end (${pre.real ? 'r\'s run' : 'a stub run: r not in this build'}), at Lake One's lot`, pre.lot && pre.active && (E !== 'JN' || pre.north), pre);
  if (!pre.lot) { await page.context().close(); return; }
  // into the gravel: the lot stages; the come-out is held
  const st = await page.evaluate(async () => {
    const g = window.__game, T = window.__t, L = window.__L, en = g.storyEndings, TL = g.trailhead.trailheadLayout(30);
    T.standAt(TL.lot.x, TL.lot.z); for (let k = 0; k < 8; k++) { L.step(10); await L.wait(30); }
    return { staged: en.staged(), hold: g.outfitter.storyHold ? g.outfitter.storyHold(30) : null, arrived: g.story.get('run.arrived'), stage: g.story.stage };
  });
  const S = st.staged || {};
  result(`${E} 2: the dawn lot staged: Dan, Wade and the loading party; the wagon ${E === 'M' ? 'by the morning call' : 'here'}; the come-out held; stage S6`,
    !!st.staged && ['dan', 'wade', 'father', 'son'].every((w) => (S.people || []).includes(w)) && (E === 'M' ? S.wagon === 'call' && !S.maggie : S.maggie) && st.hold === true && st.stage === 'S6', st);
  // the edge toward the landing: "Not with these.", back on the gravel
  const edge = await page.evaluate(async () => {
    const g = window.__game, T = window.__t, L = window.__L, TL = g.trailhead.trailheadLayout(30), d = Math.hypot(TL.landing.x - TL.lot.x, TL.landing.z - TL.lot.z);
    const k = (TL.lot.r + 5) / d; T.standAt(TL.lot.x + (TL.landing.x - TL.lot.x) * k, TL.lot.z + (TL.landing.z - TL.lot.z) * k);
    for (let i = 0; i < 4; i++) { L.step(10); await L.wait(30); }
    const p = g.player, back = Math.hypot(p.x - TL.lot.x, p.z - TL.lot.z);
    T.standAt(TL.lot.x, TL.lot.z); L.step(5);
    return { back: +back.toFixed(1), r: TL.lot.r, note: (document.querySelector('#note, .note, .hud-note') || {}).textContent || null };
  });
  result(`${E} 3: walking down to the landing with the cans is refused (back on the gravel)`, edge.back <= edge.r + 3, edge);
  // M: the call, then the wagon forty minutes on
  if (E === 'M') {
    const w = await page.evaluate(() => { const en = window.__game.storyEndings; en.debug.skip(0.5); en.debug.skip(0.6); return en.staged(); });
    result('M 4: Maggie\'s morning call: the phone rings, her wagon pulls in forty minutes later', w && w.maggie, w);
  }
  // the scene, by keys
  const trail = [];
  if (E === 'M') {
    await page.evaluate(() => window.__game.storyEndings.debug.dan());
    for (const p of ['Deal.', 'Yes.']) { const r = await choose(page, p); trail.push(r); }
    trail.push(await hear(page));
  } else {
    await page.evaluate(() => window.__game.storyEndings.debug.maggie());
    trail.push(await choose(page, 'That\'s it.'));
    if (E === 'JN') { trail.push(await choose(page, 'Walt wrote it')); trail.push(await choose(page, 'I\'m sure.')); }
    else trail.push(await choose(page, 'I don\'t know.'));
    trail.push(await hear(page, 20));
    // (the wagon goes; Dan walks over)
    await page.waitForFunction(() => !!(window.__game.dialogue && window.__game.dialogue.convo), null, { timeout: 15000, polling: 200 }).catch(() => {});
    trail.push(await choose(page, 'It wasn\'t for sale.'));
    trail.push(await hear(page));
  }
  await page.waitForTimeout(3000);
  const after = await page.evaluate(async () => { const g = window.__game, s = g.story, L = window.__L; for (let k = 0; k < 4; k++) { L.step(5); await L.wait(100); } return { end: s.get('end'), J: s.has('end.J'), JN: s.has('end.JN'), M: s.has('end.M'), done: s.get('run.done'), lot: s.get('end.lot'), staged: g.storyEndings.staged(), stage: s.stage, active: s.readSensor('run.active'), pay: (s.doc.dir && s.doc.dir.pay || []).map((p) => [p.amt, p.text]) }; });
  const want = { J: [true, false, false], JN: [true, true, false], M: [false, false, true] }[E];
  result(`${E} 5: the scene played by keys writes end=${E} (end.J ${want[0]}, end.JN ${want[1]}, end.M ${want[2]}), run.done; the run is over (S7)${E === 'M' ? '; $25,000 owed on the tally' : ''}`,
    after.end === E && after.J === want[0] && after.JN === want[1] && after.M === want[2] && after.done === E && after.stage === 'S7' && !after.active && (E !== 'M' || after.pay.some(([a]) => a === 25000)), { after, trail: trail.map((t) => (t && t.ok === false ? t : t && t.ok ? 'ok' : t)) });
  // the world 20 days on: the paper out, on the counter at Moose Lake; the pools; the board; the upcharge; the postcard
  const w20 = await page.evaluate(async ([E, HOME]) => {
    const g = window.__game, s = g.story, L = window.__L, T = window.__t, en = g.storyEndings;
    g.day.setClock(g.day.year, g.day.doy + 20, 10); for (let k = 0; k < 10; k++) { L.step(5); await L.wait(30); }
    const SL = g.outfitter.layout(HOME) || null;
    if (!SL) { const e = g.world.entryPoints.find((x) => x.ep === HOME); await L.tp(e.x, e.z); for (let k = 0; k < 120 && !g.outfitter.layout(HOME); k++) { L.step(5); await L.wait(100); } }
    T.walkIn(HOME); for (let k = 0; k < 8; k++) { L.step(5); await L.wait(60); }
    const amb = g.storyTalk.ambient, rumours = amb.lines('rumour', { ep: 31 }).map((l) => l.id).filter((id) => /^70\.6\.8\./.test(id));
    const board = g.tasks.board(HOME).map((t) => (t ? t.status : null)), mul = g.outfitter.shop ? g.outfitter.shop.priceMul(HOME) : null;
    const tally = typeof s.tallyLines === 'function' ? s.tallyLines({}).map((l) => [l.title, l.pay]) : null;
    return { paper: s.has('world.paper'), photo: s.has('world.walt.photo'), trench: s.has('world.trench.closed'), props: en.debug.props(), rumours, board, mul, tally, due: en.debug.due() };
  }, [E, HOME]);
  const ids = E === 'M' ? ['70.6.8.9', '70.6.8.11'] : ['70.6.8.1', '70.6.8.8'];
  result(`${E} 6: twenty days on: the paper is out; on Moose Lake's counter${E !== 'M' ? ', Walt\'s photo on the wall, the trench closed' : ''}; the S7 pools (${ids.join(', ')})`,
    w20.paper && w20.props.includes('paper:25') && (E === 'M' || (w20.photo && w20.trench && w20.props.includes('photo:25'))) && ids.every((i) => w20.rumours.includes(i)) && (E !== 'JN' || w20.rumours.includes('70.6.8.6')), w20);
  result(`${E} 7: the board and prices: ${E === 'M' ? 'Moose Lake (liked Walt) drops its notices; prices ×1.35; consulting on the tally' : 'Moose Lake\'s board as before; prices unchanged; no consulting'}`,
    E === 'M' ? w20.board.every((t) => t !== 'offered') && w20.mul >= 1.25 && (w20.tally || []).some(([t, p]) => t === 'Consulting' && p === 2500) : w20.board.length === 4 && !(w20.tally || []).some(([t]) => t === 'Consulting'), w20);
  // the postcard: Josie at the home counter
  const pc = await page.evaluate(async () => {
    const g = window.__game, s = g.story, L = window.__L, C = g.storyTalk.cast;
    C.storeEnter(25); for (let k = 0; k < 10; k++) { L.step(5); await L.wait(80); }
    const ok = C.talk('josie') || g.storyEndings.debug.postcardTalk();
    return { ok, staged: C.staged().map((x) => x.who) };
  });
  const said = [await choose(page, 'No.'), await hear(page)];
  const card = await page.evaluate((E) => { const g = window.__game, s = g.story; return { postcard: s.has('world.postcard'), page: g.inventory.has('page:postcard'), walt: s.walt().slice(-2), line: { J: '50:11.4', JN: '50:11.5', M: '50:11.6' }[E] }; }, E);
  result(`${E} 8: the postcard from Josie at the home counter, into the book; its line by ending last on the Walt page`, pc.ok && card.postcard && card.page && card.walt.includes(card.line) && card.walt.includes('50:11.c4'), { pc, said, card });
  // 31 days on: Tasha's sampling at Farm (J) / the survey stakes (M)
  const w31 = await page.evaluate(async (E) => {
    const g = window.__game, s = g.story, L = window.__L;
    g.day.setClock(g.day.year, g.day.doy + 11, 10); for (let k = 0; k < 10; k++) { L.step(5); await L.wait(30); }
    let pinned = null;
    if (E !== 'M') { g.tasks.board(31); for (let k = 0; k < 60 && !pinned; k++) { await L.wait(150); L.step(2); pinned = (g.tasks.board(31) || []).some((t) => t && t.kind === 'tashasampling'); } }
    return { sampling: s.has('world.sampling'), stakes: s.has('world.stakes'), pinned };
  }, E);
  result(`${E} 9: thirty-one days on: ${E === 'M' ? 'the survey stakes on the Kettle creek' : 'Tasha\'s sampling notice pinned at Farm'}`, E === 'M' ? w31.stakes && !w31.sampling : w31.sampling && w31.pinned, w31);
  await page.context().close();
}

try {
  if (!ONLY || ONLY === 'off') {
    const page = await open('');
    await newSeason(page, HOME, DOY, false);
    const r = await page.evaluate(() => {
      const g = window.__game, mods = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\//.test(n)).map((n) => n.replace(/^.*\/src\//, '').replace(/\?.*$/, ''));
      return { mine: mods.filter((n) => /^endings\.js$|story-data\/(endings|rules-endings)\.js/.test(n)), hold: g.outfitter.storyHold === undefined, mul: !g.outfitter.shop || g.outfitter.shop.storyMul === undefined, filter: g.tasks.boardFilterFn === undefined, en: !g.storyEndings };
    });
    result('off: the flag off: endings.js never fetched; no come-out hold, no upcharge hook, no board filter', r.mine.length === 0 && r.hold && r.mul && r.filter && r.en, r);
    await page.context().close();
  }
  for (const E of ['J', 'JN', 'M']) if (!ONLY || ONLY === E) { try { await ending(E); } catch (e) { result(`${E}: threw`, false, { e: String((e && e.stack) || e).slice(0, 800) }); } }
} finally {
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
  await browser.close();
  const fails = results.filter((r) => !r.pass).length;
  log(`cmp-n-test: ${results.length - fails}/${results.length}${fails ? ' FAIL' : ' PASS'}`);
  process.exit(fails ? 1 : 0);
}
