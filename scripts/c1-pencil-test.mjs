// c1-pencil-test (story Round 1, stream P): the pencil and the leads in the real game, headless Chromium against a
// running Vite, each check printed PASS or FAIL:
//   1 flag off: pencil.js, leads.js and leads-act1.js never loaded, the map's story hooks unset, no story marks; the
//     public portages are the world's own (the same count, the same order)
//   2 flag on: the pencil and the leads attached; story.ui.pickLake is the map's (not the stub)
//   3 the data against the v9 world: every LAKES key finds its lake by name, every PLACES key a spot
//   4 the crews' lead: born on the porch's facts with its Walt line and no ring; a keeper asked rings Little Gabbro, then
//     the west shore (holding the crews' landing without marking it); the ring is on the sheet (a hit under the pointer)
//     and in Marked under who gave it; a second voice joins it ("Ruth; Hap"); followed and closed
//   5 the nickname pencil, by real input: a picked nickname clicked onto Lake One is pencilled there with no ink; a
//     right-click rubs it out; pencilled again, a keeper's ring on Lake One inks it (NB01 understood, the Walt line), and
//     the inked name is drawn; the TEACH moment `pencil` is due with an unmatched nickname and the map side open
//   6 story.ui.pickLake: the map opens; a click on a lake answers { lake, name }; Esc answers null and leaves the book open
//   7 the doors: after the turn, each door's ring when asked, door.<arc>.ringed; saved in story2
//   (and no page errors)
//
//   APP=http://localhost:5621 node scripts/c1-pencil-test.mjs [--home 31] [--shots <dir>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5621').replace(/\/$/, '');
const HOME = Number(arg('home', 31));
const SHOTS = arg('shots', null); if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1400)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

export const HELPERS = () => {
  const g = window.__game, H = window.__c1p = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // the sheet in the book, looking at (x, z) at a span; → the canvas point of (x, z) in client px
  H.look = (x, z, span = 6000) => {
    const h = g.hud;
    if (!g.journal.open || g.journal.side !== 'map') g.journal.showMap();
    h.lookAt(x, z, span, 0);
    h.drawMap(g.player);
    const c = h.canvas, r = c.getBoundingClientRect(), v = h.view;
    const mPerPx = v.span / c.width, px = (x - (v.cx - (c.width / 2) * mPerPx)) / mPerPx, py = (z - (v.cz - (c.height / 2) * mPerPx)) / mPerPx;
    return { cx: r.left + (px / c.width) * r.width, cy: r.top + (py / c.height) * r.height, w: r.width, h: r.height };
  };
  H.hitsOf = (kind) => (g.hud.hits || []).filter((q) => q.kind === kind).map((q) => ({ id: q.ring ? q.ring.id : q.name ? q.name.nick : null, inked: q.name ? q.name.inked : null, who: q.ring ? q.ring.who : null }));
  H.marked = () => { const el = document.querySelector('.mb-marked'); return el ? el.innerText : ''; };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const boot = async (page) => {
  await page.waitForFunction(() => window.__game && window.__game.title && (!/story=1/.test(location.search) || (window.__game.storySeams && window.__game.pencil)) && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
};
const newSeason = async (page, home = HOME) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, H = window.__c1p; H.step(30); const o = g.outfitter; if (o.open) o.hide(); if (g.onboarding && g.onboarding.skip) g.onboarding.skip(); g.day.setClock(g.day.year, g.day.doy, 10); H.step(10); });
};
const open = async (url) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); else if (/story P|story K1b|pencil/.test(m.text())) log('console', m.text().slice(0, 300)); });
  await page.goto(url, { timeout: 180000 });
  await boot(page);
  return page;
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };

try {
  // 1 flag off
  const off = await open(APP);
  await newSeason(off);
  const one = await off.evaluate(async () => {
    const g = window.__game, mb = g.journal.map, S = await import('/src/sheets.js');
    g.journal.showMap(); window.__c1p.step(5);
    const loaded = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\/src\/(pencil|leads|story-data\/leads-act1)\.js/.test(n));
    const pub = S.publicPortages(g.world), same = pub.length === g.world.portages.length && pub.every((q, k) => q.i === k && q.p === g.world.portages[k]);
    const m = mb.marks();
    g.journal.close();
    return { loaded, pencil: mb.pencil ?? null, hooks: ['storyClick', 'storyRub', 'storyEsc', 'storyDrop', 'storyCursor'].filter((k) => typeof g.hud[k] === 'function'), story: 'story' in m, gPencil: g.pencil ?? null, pubSame: same, n: pub.length };
  });
  result('1 flag off: no pencil/leads modules, no map hooks, no story marks; the public portages are the world\'s', one.loaded.length === 0 && one.pencil === null && one.hooks.length === 0 && !one.story && one.gPencil === null && one.pubSame, one);
  await off.context().close();

  // 2 flag on
  const page = await open(`${APP}/?story=1`);
  await newSeason(page);
  const two = await page.evaluate(() => { const g = window.__game, P = g.pencil; return { stub: P.stub, leads: !!g.leads, ui: g.story.ui && g.story.ui.stub, hooks: ['storyClick', 'storyRub', 'storyEsc', 'storyDrop'].filter((k) => typeof g.hud[k] === 'function').length, v: g.story.v }; });
  result('2 flag on: the pencil and the leads attached, pickLake is the map\'s', two.stub === false && two.leads && two.ui === false && two.hooks === 4 && two.v === 2, two);

  // 3 the data against the world
  const three = await page.evaluate(() => {
    const g = window.__game, P = g.pencil, D = P.debug, out = { lakes: {}, places: {} };
    for (const k of Object.keys(D.lakes)) { const id = D.lakeOfKey(k), L = id > 0 ? g.world.lakes[id - 1] : null; out.lakes[k] = L ? `${id} ${L.name}` : null; }
    for (const k of Object.keys(D.places)) { const p = D.xz(k); out.places[k] = p ? [Math.round(p.x), Math.round(p.z)] : null; }
    return out;
  });
  result('3 data: every LAKES key finds its lake by name, every place a spot', Object.values(three.lakes).every(Boolean) && Object.values(three.places).every(Boolean), three);

  // 4 the crews' lead and the keepers' rings
  const four = await page.evaluate(async () => {
    const g = window.__game, s = g.story, P = g.pencil, Ld = g.leads, H = window.__c1p;
    s.set('nb.found'); s.set('tauno.porch.done'); s.set('door.crews.taken');
    const born = { state: Ld.state('crews'), line: s.walt().includes('20:11.2.w1'), rings: P.rings().length };
    const asks0 = Ld.asks({ who: 'keeper', ep: g.profile.home }).map((q) => q.id);
    Ld.ask('ring.ep33', { by: 'Ruth', ep: g.profile.home, talk: 'k1' });
    const asks1 = Ld.asks({ who: 'keeper', ep: g.profile.home }).map((q) => q.id);
    Ld.ask('ring.baldeagle', { by: 'Ruth', ep: g.profile.home, talk: 'k1' });
    const west = P.ringFor('baldeagle.west'), lx = -25825, lz = 29925, dl = west ? Math.hypot(west.x - lx, west.z - lz) : null;
    // on the sheet: the west shore's ring under the pointer, and in Marked
    H.look(west.x, west.z, 7000); await H.wait(300); H.step(3); g.hud.drawMap(g.player);
    const hits = H.hitsOf('pring');
    g.journal.map.tab = 'marked'; g.journal.map.render(true);
    const marked = H.marked();
    // a second voice
    const ep33 = P.ringFor('ep33'); P.ring({ x: ep33.x + 120, z: ep33.z, by: 'Hap', talk: 'k2' });
    const voices = P.ringFor('ep33').who;
    // followed, closed
    s.sensor('near', (a) => a === 'crews.landing/300'); s.clock({});
    const followed = Ld.state('crews');
    s.set('crews.seen');
    return { born, asks0, asks1, west: !!west, dl, r: west && west.r, lakes: west && west.lakes, hits, marked: marked.slice(0, 400), voices, followed, closed: Ld.state('crews'), faint: P.ringFor('ep33').closed, after: s.walt().includes('20:11.2.w2') };
  });
  await shot(page, 'c1p-4-west-shore');
  result('4a the crews\' lead: born with its Walt line and no ring', four.born.state === 'open' && four.born.line && four.born.rings === 0, four.born);
  result('4b a keeper asked rings Little Gabbro, then the west shore (the landing inside, unmarked)', four.asks0.includes('ring.ep33') && !four.asks0.includes('ring.baldeagle') && four.asks1.includes('ring.baldeagle') && four.west && four.dl > 200 && four.dl < four.r && (four.lakes || []).includes('baldeagle'), four);
  result('4c the ring on the sheet and in Marked under who gave it', four.hits.some((q) => q.id === 'r.baldeagle.west') && /Bald Eagle, west shore/.test(four.marked) && /Ruth/.test(four.marked), { hits: four.hits, marked: four.marked });
  result('4d a second voice joins the ring; followed, then closed (faint) with the after line', four.voices === 'Ruth; Hap' && four.followed === 'followed' && four.closed === 'closed' && four.faint && four.after, four);

  // 5 the nickname pencil by real input
  const lk = await page.evaluate(() => { const g = window.__game, s = g.story, P = g.pencil; s.markRead('NB01'); const id = P.debug.lakeOfKey('lakeone'), L = g.world.lakes[id - 1]; g.pencil.pick('frontporch'); const at = window.__c1p.look(L.cx, L.cz, 5000); const lake = g.hud.worldAt ? null : null; return { id, x: L.cx, z: L.cz, at, unmatched: P.unmatched().map((n) => n.nick), due: g.hints && typeof g.hints.due === 'function' ? !!g.hints.due('pencil', {}) : null, lake }; });
  // the lake's middle may be an island: find a water pixel near it
  const spot = await page.evaluate(async ({ id }) => {
    const g = window.__game, h = g.hud, c = h.canvas, r = c.getBoundingClientRect(), M = await import('/src/map-render.js');
    for (let rad = 0; rad < 200; rad += 8) for (let a = 0; a < 6.28; a += 0.4) {
      const cx = r.left + r.width / 2 + Math.cos(a) * rad, cy = r.top + r.height / 2 + Math.sin(a) * rad;
      const px = ((cx - r.left) / r.width) * c.width, py = ((cy - r.top) / r.height) * c.height, [x, z] = h.worldAt(px, py);
      if (M.lakeAt(g.world, x, z) === id) return { cx, cy, x, z };
    }
    return null;
  }, lk);
  await page.mouse.click(spot.cx, spot.cy);
  await page.waitForTimeout(300);
  const five = await page.evaluate(() => { const g = window.__game, P = g.pencil; return { names: P.marks().filter((m) => m.kind === 'name'), picking: P.picking, ink: g.story.has('ink.frontporch') }; });
  await page.mouse.click(spot.cx, spot.cy, { button: 'right' });
  await page.waitForTimeout(200);
  const rubbed = await page.evaluate(() => window.__game.pencil.marks().filter((m) => m.kind === 'name').length);
  await page.evaluate(() => window.__game.pencil.pick('frontporch'));
  await page.mouse.click(spot.cx, spot.cy);
  await page.waitForTimeout(200);
  const inked = await page.evaluate(async () => {
    const g = window.__game, s = g.story, Ld = g.leads, H = window.__c1p;
    const before = s.has('ink.frontporch');
    const offered = Ld.asks({ who: 'keeper', ep: g.profile.home }).some((q) => q.id === 'nick.frontporch');
    Ld.ask('nick.frontporch', { by: 'Ruth', ep: g.profile.home, talk: 'k3' });
    g.hud._marks = null; g.hud.drawMap(g.player); await H.wait(100);
    return { before, offered, ink: s.get('ink.frontporch'), und: s.nbHas('und', 'NB01'), line: s.walt().includes('20:5.2.w2'), drawn: H.hitsOf('pname') };
  });
  await shot(page, 'c1p-5-front-porch');
  result('5a a picked nickname clicked onto Lake One is pencilled there, no ink, the pencil put away', five.names.length === 1 && five.names[0].nick === 'frontporch' && !five.names[0].inked && !five.picking && !five.ink && lk.unmatched.includes('frontporch'), { five, lk });
  result('5b right-click rubs it out', rubbed === 0, { rubbed });
  result('5c a keeper\'s ring on Lake One inks the pencil: NB01 understood, the Walt line, drawn in ink', !inked.before && inked.offered && inked.ink === 'lakeone' && inked.und && inked.line && inked.drawn.some((q) => q.id === 'frontporch' && q.inked), inked);
  result('5d the TEACH moment pencil is due with an unmatched nickname and the map side open', lk.due === true, { due: lk.due });

  // 6 pickLake
  await page.evaluate(() => { const g = window.__game; g.journal.close(); window.__c1p.pick = g.story.ui.pickLake({ who: 'denny', prompt: 'Where are you headed next?' }); });
  await page.waitForTimeout(400);
  const six0 = await page.evaluate(({ x, z }) => { const g = window.__game; window.__c1p.look(x, z, 5000); return { open: g.journal.open, side: g.journal.side, banner: window.__c1p.marked().slice(0, 120) }; }, lk);
  await page.mouse.click(spot.cx, spot.cy);
  const six1 = await page.evaluate(async () => { const v = await Promise.race([window.__c1p.pick, new Promise((r) => setTimeout(() => r('timeout'), 3000))]); return v; });
  await page.evaluate(() => { window.__c1p.pick = window.__game.story.ui.pickLake({ prompt: 'Where?' }); });
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  const six2 = await page.evaluate(async () => { const v = await Promise.race([window.__c1p.pick, new Promise((r) => setTimeout(() => r('timeout'), 3000))]); return { v, open: window.__game.journal.open }; });
  result('6 pickLake: the map opens; a lake clicked answers it; Esc answers null with the book left open', six0.open && six0.side === 'map' && /headed next/.test(six0.banner) && six1 && six1.lake === lk.id && six2.v === null && six2.open, { six0, six1, six2 });

  // 7 the doors after the turn, and the save
  const seven = await page.evaluate(() => {
    const g = window.__game, s = g.story, Ld = g.leads;
    s.set('tauno.turn'); for (const d of ['guiding', 'boys', 'family', 'mining']) s.set(`door.${d}.named`);
    const asks = Ld.asks({ who: 'keeper', ep: 64 }).map((q) => q.id);
    Ld.ask('ring.moose', { by: 'Gus', ep: 64, talk: 'd1' }); Ld.ask('ring.sawbill', { by: 'Gus', ep: 64, talk: 'd1' });
    Ld.ask('ring.lv', { by: 'Gus', ep: 64, talk: 'd2' }); Ld.ask('ring.farm', { by: 'Gus', ep: 64, talk: 'd2' });
    s.flush();
    const saved = s.io.read('story2');
    return { asks, ringed: ['guiding', 'boys', 'family', 'mining'].filter((d) => s.has(`door.${d}.ringed`)), stage: s.stage, savedRings: saved && saved.pencil ? saved.pencil.rings.length : null, savedNames: saved && saved.pencil ? saved.pencil.names.length : null, leads: Ld.list() };
  });
  result('7 the doors rung when asked after the turn (S3), all of it in story2', seven.ringed.length === 4 && seven.stage === 'S3' && seven.savedRings >= 7 && seven.savedNames === 1, seven);
  await shot(page, 'c1p-7');
  await page.context().close();

  // 8 the --slice section (scripts/slice/c1-pencil.mjs) on a fresh season, the earlier steps' facts set by hand
  const sl = await open(`${APP}/?story=1`);
  await newSeason(sl);
  const { steps } = await import('./slice/c1-pencil.mjs');
  await sl.evaluate(() => { const s = window.__game.story; s.set('nb.found'); s.markRead('NB01'); s.set('tauno.porch.done'); s.set('door.crews.taken'); });
  for (const st of steps) {
    if (st.step === 6) await sl.evaluate(() => { const s = window.__game.story; s.set('tauno.turn'); s.set('door.guiding.named'); });
    const r = await st.run(sl, {});
    result(`8 slice ${st.id} (step ${st.step}, ${st.owners.join('+')}): ${st.name}`, r.pass, r.more);
  }
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('the rig ran', false, { error: String(e && e.stack || e).slice(0, 800) });
} finally {
  await browser.close();
}
const n = results.filter((r) => r.pass).length;
console.log(`\nc1-pencil-test: ${n}/${results.length}`);
process.exit(n === results.length ? 0 : 1);
