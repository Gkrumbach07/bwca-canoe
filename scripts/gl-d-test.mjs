// The game-loop round, stream D (the trip-end tally and the board): the acceptance checks of docs/build/game-loop-brief.md
// "Stream D", run headless on one page.
//   1 no cap on notices: a sixth and a seventh are taken like the first (the owner's call 2026-11-05)
//   2 a fish notice taken, the clock four days on: gone, its line in missed, and the next tally shows it
//   3 no canoe kind; an old save holding a rental notice loads without it (and an open v3 notice gets a deadline)
//   4 each new kind: made at a fitting outfitter and date, and done by its scripted path
//   5 two notices done on a trip and the trip in: the money rises at the settle, the tally counts up on the card and
//     ends on the purse; nothing is paid at the board on the trip
//   6 injected logs stamp each of the four firsts once; the milestones move
//   7 the journal's Tasks page shows the days left on each notice held (nine of them, every one reachable)
//   + a v1 record loads as v2; the screenshots (--shots: docs/build/shots/d-*.png)
//
//   npx vite --port 5184 --strictPort
//   APP=http://localhost:5184 node scripts/gl-d-test.mjs [--shots]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://localhost:5184';
const SHOTS = process.argv.includes('--shots');
const OUT = path.resolve('docs/build/shots');
if (SHOTS) mkdirSync(OUT, { recursive: true });

function findPw() {
  if (process.env.PW) return process.env.PW;
  const base = path.join(homedir(), '.npm/_npx');
  for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; }
  return 'playwright-core';
}
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(homedir(), 'Library/Caches/ms-playwright');
  const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; }
  return undefined;
}
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };
const errors = [];

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || /gl-d|tasks\.on|record:/.test(m.text())) log(m.type(), m.text().slice(0, 300)); });
  await page.goto(APP);
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.tasks && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
  log('game loaded');
  const step = (n = 60) => page.evaluate(async (n) => { const g = window.__game; for (let k = 0; k < n; k += 600) { g.step(1 / 60, Math.min(600, n - k)); await new Promise((r) => setTimeout(r, 0)); } }, n);
  // a new Adventure season at Moose Lake (25), 10 July, in at the counter
  await page.evaluate(async () => {
    const g = window.__game, t = g.title;
    const ep = g.world.entryPoints.find((e) => e.ep === 25);
    t.setPick('adventure');
    await t.newSeason(ep, { confirm: false, start: { year: 2026, doy: 191 } });
    // (the join: the home counter's first-visit talk is stream C's, tested by gl-c-test; here it is over)
    if (g.onboarding && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.onboarding.home, false); } // (r3: the talk's gear and the loaned canoe first)
  });
  await page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 120000, polling: 250 });
  await step(120);
  await page.evaluate(() => { const g = window.__game; g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide(); g.saver && (g.saver.enabled = false); });
  await step(30);
  log('in the game', await page.evaluate(() => ({ money: window.__game.profile.money, doy: window.__game.day.doy, active: window.__game.trip.active })));
  // the notes said, caught
  await page.evaluate(() => { const g = window.__game, T = g.tasks; window.__notes = []; const n = T.onNote; T.onNote = (t) => { window.__notes.push(t); if (n) n(t); }; });

  // --- 1: no cap: seven held --------------------------------------------------------------------------------------
  const r1 = await page.evaluate(async () => {
    const g = window.__game, T = g.tasks;
    for (const ep of [25, 30, 31]) { T.board(ep); await T.write(ep); }
    const offered = [25, 30, 31].flatMap((ep) => T.board(ep)).filter((t) => t && t.status === 'offered');
    const took = [];
    window.__notes.length = 0;
    for (const t of offered.slice(0, 7)) if (T.take(t.id)) took.push(t.id);
    return { offered: offered.length, took: took.length, held: T.held().length, lines: window.__notes.slice(), LIMIT: T.LIMIT };
  });
  result('1 no cap: a sixth and a seventh notice taken, no refusal line', r1.offered >= 7 && r1.took === 7 && r1.held === 7 && r1.LIMIT === undefined && !r1.lines.some((l) => /You hold/.test(l)), r1);

  // --- 2: a fish notice past its day ------------------------------------------------------------------------------------------
  const r2a = await page.evaluate(async () => {
    const g = window.__game, T = g.tasks;
    // let two go to make room, then a fish notice
    for (const t of T.held().slice(0, 2)) T.drop(t.id);
    const t = await T.makeKind('fish', 25, 'local');
    const ok = T.take(t.id);
    return { id: t.id, ok, due: T.dueOf(t), today: T.today(), left: T.daysLeft(t), KIND_DAYS: T.daysFor(t), title: t.title, sign: t.sign };
  });
  await page.evaluate(() => window.__game.day.advance(24 * 4));
  await step(3);
  const r2 = await page.evaluate((id) => {
    const T = window.__game.tasks, m = T.missed.find((x) => x.id === id);
    return { gone: !T.ads.has(id), missed: m || null, today: T.today() };
  }, r2a.id);
  result('2 a fish notice taken, four days on: gone with a line', r2a.ok && r2a.left === 3 && r2.gone && !!(r2.missed && r2.missed.line), { ...r2a, ...r2 });

  // --- 3: no canoe kind; an old save with a rental notice ---------------------------------------------------------------------
  const r3 = await page.evaluate(() => {
    const g = window.__game, T = g.tasks, keep = JSON.parse(JSON.stringify(T.serialize()));
    const old = { v: 3, seed: 7, nextId: 902, ads: [
      { id: 900, kind: 'canoe', from: 25, band: 'medium', status: 'open', posted: T.today() - 2, taken: T.today() - 2, title: 'A rental left behind', pay: 30, make: 'grumman', number: 12 },
      { id: 901, kind: 'survey', from: 25, band: 'local', status: 'open', posted: T.today() - 20, taken: T.today() - 20, title: 'Portage report wanted', pay: 14, rods: 40, portage: 3, target: { x: 0, z: 0 } },
    ], boards: { 25: { slots: [900, 901, null, null], day: T.today(), n: 2, pending: [] } }, claimed: [], tally: {}, unlocks: [] };
    T.restore(old);
    const out = { kindsCanoe: typeof T.kinds.canoe, hasCanoe: T.ads.has(900), slot0: T.boards[25] ? T.boards[25].slots[0] : 'none', survey: T.ads.has(901), surveyDue: T.ads.get(901) ? T.ads.get(901).due : null, today: T.today() };
    T.restore(keep);
    return out;
  });
  result('3 no canoe kind; an old save drops its rental notice, an old open one gets a deadline from today', r3.kindsCanoe === 'undefined' && !r3.hasCanoe && r3.slot0 === null && r3.survey && r3.surveyDue === r3.today + 10, r3);

  // --- 4: each new kind ---------------------------------------------------------------------------------------------------------
  // let go of what is held, so each new one can be taken
  await page.evaluate(() => { const T = window.__game.tasks; for (const t of T.held()) T.drop(t.id); });
  const mk = (kind, ep, doy, band = 'medium', extra = null) => page.evaluate(async ({ kind, ep, doy, band, extra }) => {
    const g = window.__game, T = g.tasks;
    if (doy) g.day.setClock(2026, doy, 11);
    if (extra === 'permits') g.permits = g.permits || { pmas: () => { const L = g.world.entryPoints.find((e) => e.ep === ep); const x = L.x + 4000, z = L.z - 3000, r = 2500; return [{ id: 'test-pma', name: 'Test Lake', near: ep, approx: true, poly: [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]] }]; } };
    let t = null;
    for (const b of [band, 'local', 'medium', 'far']) { t = await T.makeKind(kind, ep, b); if (t) break; }
    if (!t) return { kind, made: false };
    const took = T.take(t.id);
    return { kind, made: true, id: t.id, took, title: t.title, pay: t.pay, due: t.due - T.today(), text: t.text.slice(0, 140) };
  }, { kind, ep, doy, band, extra });
  const done = (id) => page.evaluate((id) => { const t = window.__game.tasks.ads.get(id); return t ? t.status : 'gone'; }, id);
  const kinds = {};
  // creel: three parties' words
  kinds.creel = await mk('creel', 25, 191);
  if (kinds.creel.made) kinds.creel.status = await page.evaluate((id) => {
    const T = window.__game.tasks, t = T.ads.get(id);
    for (const k of [1, 2, 3]) T.onEvent({ type: 'talk', kind: 'party', partyId: `test-${k}`, party: { id: `test-${k}` }, lakeId: t.lakeId });
    return { status: t.status, asked: t.asked.length, heard: t.heard };
  }, kinds.creel.id);
  // creel's own fallback: E near a party's camp on the lake (a camp stood in parties.live by hand)
  if (kinds.creel.made) kinds.creel.fallback = await page.evaluate(async () => {
    const g = window.__game, T = g.tasks, P = g.parties;
    const t = await T.makeKind('creel', 25, 'medium'); if (!t) return null;
    t.status = 'open'; t.taken = T.today(); t.due = T.today() + 10;
    const site = g.world.campsites.find((s) => T.lakeNear(s.x, s.z) && T.lakeName(T.lakeNear(s.x, s.z)) === T.lakeName(t.lakeId));
    if (!site) { T.ads.delete(t.id); return { site: false }; }
    const px = g.player.x, pz = g.player.z, hours = g.day.hours;
    P.live.set('test-camp', { site, party: { id: 'test-near' } });
    g.player.x = site.x + 6; g.player.z = site.z; g.day.hours = 12; g.player.prompt = null;
    T.update(0);
    const prompt = g.player.prompt && g.player.prompt.text, reach = T.inReach === t;
    if (reach) T.kinds.creel.use(T, t);
    P.live.delete('test-camp'); g.player.x = px; g.player.z = pz; g.day.hours = hours;
    const asked = (t.asked || []).length; T.ads.delete(t.id);
    return { prompt, reach, asked };
  });
  // campsite: three checks
  kinds.campsite = await mk('campsite', 25, 191);
  if (kinds.campsite.made) kinds.campsite.status = await page.evaluate((id) => { const T = window.__game.tasks, t = T.ads.get(id); for (const p of ['grate', 'latrine', 'pad']) T.kinds.campsite.check(T, t, p); return { status: t.status, checks: t.checks, words: T.kinds.campsite.doneWords(t) }; }, kinds.campsite.id);
  // beaver (fall): by each dam
  kinds.beaver = await mk('beaver', 25, 250);
  if (kinds.beaver.made) kinds.beaver.status = await page.evaluate((id) => {
    const g = window.__game, T = g.tasks, t = T.ads.get(id), px = g.player.x, pz = g.player.z;
    for (const d of t.dams) { g.player.x = d.x + 5; g.player.z = d.z; T.update(0); }
    g.player.x = px; g.player.z = pz;
    return { status: t.status, dams: t.dams.map((d) => d.state) };
  }, kinds.beaver.id);
  // iceout: at the outfitter's lake, a few days after its ice-out; a laker handed in
  const iceDoy = await page.evaluate(() => { const g = window.__game, L = g.tasks.landing(25), ic = g.world.facts && g.world.facts.iceOf(L.lake); return (ic && ic.out ? ic.out : 120) + 5; });
  kinds.iceout = await mk('iceout', 25, iceDoy);
  if (kinds.iceout.made) kinds.iceout.status = await page.evaluate((id) => {
    const g = window.__game, T = g.tasks, t = T.ads.get(id), inv = g.inventory;
    let put = false;
    try { for (const c of inv.reachable()) if (inv.put(c.id, 'fish:laketrout', { data: { length: 55, lake: t.lakeHint } })) { put = c.id; break; } } catch (e) { put = String(e); }
    const f = T.fishFor(t), r = f ? T.deliver(t, f) : null;
    if ((t.cooler || []).length >= (t.need || 1)) t.status = 'done';
    return { put, fits: !!f, delivered: r && r.n, status: t.status };
  }, kinds.iceout.id);
  // colour (late September): the camera hears it as a place notice; a picture there does it
  kinds.colour = await mk('colour', 25, 262);
  if (kinds.colour.made) kinds.colour.status = await page.evaluate(async (id) => {
    const g = window.__game, T = g.tasks, t = T.ads.get(id), ph = g.photo || (g.journal && g.journal.photos);
    if (!ph) return { photo: false };
    const onTheGo = ph.onTheGo().some((q) => q.id === id);
    const pf = ph.placeFits; ph.placeFits = (target) => target === t.target;
    try { ph.capture(); } catch (e) { return { onTheGo, err: String(e) }; } finally { ph.placeFits = pf; }
    return { onTheGo, status: t.status, photo: t.photo || null };
  }, kinds.colour.id);
  // lastcheck (October): by each site
  kinds.lastcheck = await mk('lastcheck', 25, 290);
  if (kinds.lastcheck.made) kinds.lastcheck.status = await page.evaluate((id) => {
    const g = window.__game, T = g.tasks, t = T.ads.get(id), px = g.player.x, pz = g.player.z;
    for (const i of t.sites) { const s = g.world.campsites[i]; g.player.x = s.x + 4; g.player.z = s.z; T.update(0); }
    g.player.x = px; g.player.z = pz;
    return { status: t.status, sites: t.sites.length };
  }, kinds.lastcheck.id);
  // pma: not offered without the permits (stream A); with a stand-in, made, and walked on a PMA permit
  kinds.pmaNone = await page.evaluate(async () => { const g = window.__game; g.day.setClock(2026, 200, 11); const had = g.permits; delete g.permits; const t = await g.tasks.makeKind('pma', 25, 'far'); if (had) g.permits = had; return { made: !!t }; });
  kinds.pma = await mk('pma', 25, 200, 'far', 'permits');
  if (kinds.pma.made) kinds.pma.status = await page.evaluate((id) => {
    const g = window.__game, T = g.tasks, t = T.ads.get(id), px = g.player.x, pz = g.player.z, mode = g.player.mode, tr = g.trip;
    const s = tr.state, keep = { active: s.active, permit: s.permit };
    // first without the permit: nothing counts
    s.active = true; s.permit = null; g.player.mode = 'walk';
    g.player.x = t.pts[0].x; g.player.z = t.pts[0].z; T.update(0);
    const without = t.pts[0].seen;
    s.permit = { id: 'p-test', kind: 'pma', pma: t.pma };
    for (const q of t.pts) { g.player.x = q.x; g.player.z = q.z; T.update(0); }
    g.player.x = px; g.player.z = pz; g.player.mode = mode; s.active = keep.active; s.permit = keep.permit;
    return { without, status: t.status };
  }, kinds.pma.id);
  for (const [k, v] of Object.entries(kinds)) if (k !== 'pmaNone') log('kind', k, JSON.stringify(v).slice(0, 400));
  const doneK = (k) => kinds[k] && kinds[k].made && kinds[k].status && kinds[k].status.status === 'done';
  result('4 creel: made in July, three parties asked', doneK('creel'), kinds.creel);
  result('4 creel: the fallback (E by a party camp on the lake)', !!(kinds.creel.fallback && kinds.creel.fallback.reach && kinds.creel.fallback.asked === 1), kinds.creel.fallback || {});
  result('4 campsite: three checks', doneK('campsite'), kinds.campsite);
  result('4 beaver: made in the fall, every dam logged', doneK('beaver'), kinds.beaver);
  result('4 iceout: made after ice-out, a laker handed in', doneK('iceout'), kinds.iceout);
  result('4 colour: made in late September, the picture does it', doneK('colour'), kinds.colour);
  result('4 lastcheck: made in October, every site visited', doneK('lastcheck'), kinds.lastcheck);
  result('4 pma: not offered without permits; with them, only on a PMA permit', !kinds.pmaNone.made && doneK('pma') && kinds.pma.status.without === false, { none: kinds.pmaNone, pma: kinds.pma });

  // --- 5 and 6: a trip with two notices done, the firsts, and the tally -------------------------------------------------------
  // the kinds' done notices from 4 are paid between trips (a day turn): clear them first, then back to July
  await page.evaluate(() => { const g = window.__game, T = g.tasks; for (const t of T.held()) { T.ads.delete(t.id); } g.day.setClock(2026, 196, 9); });
  await step(5);
  const r5a = await page.evaluate(async () => {
    const g = window.__game, T = g.tasks, tr = g.trip;
    // the missed fish notice (2) waits for this tally
    const told = T.missed.filter((m) => !m.told).map((m) => m.title);
    const a = await T.makeKind('survey', 25, 'local'), b = await T.makeKind('item', 25, 'local') || await T.makeKind('survey', 25, 'medium');
    T.take(a.id); T.take(b.id);
    tr.start({ ep: 25, foodDays: 3, canoe: 'aluminium' });
    const m0 = g.profile.money;
    a.status = 'done'; b.status = 'done';
    return { a: a.id, b: b.id, pays: [a.pay, b.pay], titles: [a.title, b.title], m0, active: tr.active, told };
  });
  // (the board's frames on the trip: nothing is paid. Not the game's frames: standing at the landing it left, the trip
  // would be taken back, outfitter.js updateTrip)
  const r5mid = await page.evaluate(() => { const T = window.__game.tasks; for (let k = 0; k < 5; k++) T.update(1 / 60); return { money: window.__game.profile.money, held: T.held().map((t) => t.status) }; });
  // 6: the four firsts, injected while on the trip
  const r6 = await page.evaluate(() => {
    const g = window.__game, R = g.record, tr = g.trip, F = g.fishing, w = g.world, P = g.parties;
    const before = R.milestones().map((m) => ({ key: m.key, n: m.n }));
    const d = g.day;
    // a laker in the catch log
    F.log.push({ species: 'laketrout', name: 'Lake trout', length: 58, weight: 2.1, kept: false, year: d.year, doy: d.doy, hours: d.hours, lake: 'Snowbank Lake' });
    R.watchFish();
    // a 210-rod carry
    tr.log('portage', { name: 'Test carry', rods: 210 });
    tr.log('portage', { name: 'Test carry 2', rods: 230 });
    // a night alone: a site on a lake no party is on last night (asleep logged in the morning, before noon)
    d.hours = 7.5;
    const night = R.today - 1;
    let site = null;
    for (const s of w.campsites) { if (Math.hypot(s.x - g.player.x, s.z - g.player.z) > 15000) continue; const id = g.player.nearWater(s.x, s.z, 12); if (id > 0 && !P.partiesOn(id, night).length) { site = s; break; } }
    if (site) { tr.log('sleep', { kind: 'dome', key: `${Math.round(site.x)}:${Math.round(site.z)}` }); tr.log('sleep', { kind: 'dome', key: `${Math.round(site.x)}:${Math.round(site.z)}` }); }
    // a wind-bound day: the trip out since three days ago, a big lake, the windiest of those days
    const since = tr.state.since, keep = { ...since };
    const abs0 = R.today; const dd = new Date((abs0 - 3) * 86400000); since.year = dd.getUTCFullYear(); since.doy = d.doy - 3;
    let big = null; for (const l of w.lakes) if (l && l.name && (!big || l.cells > big.cells) && Math.hypot(l.cx - g.player.x, l.cz - g.player.z) < 20000) big = l;
    let wb = false; for (let a = abs0 - 2; a < abs0 && !wb; a++) wb = R.windbound(a, big.id);
    const wb2 = R.windbound(abs0 - 1, big.id);
    Object.assign(since, keep);
    const feats = R.s.firsts.filter((f) => f.k === 'feat' || (f.k === 'fish' && f.key === 'laketrout'));
    return { firsts: feats.map((f) => f.words), wb, wb2, site: !!site, before,
      counts: ['first laker', 'first 200-rod carry', 'first night alone on a lake', 'first wind-bound day'].map((w2) => R.s.firsts.filter((f) => f.words === w2).length) };
  });
  result('6 the four firsts stamped once each', r6.counts.every((n) => n === 1) && r6.wb2 === false, r6);
  // in: the settle and the tally
  const r5 = await page.evaluate(() => {
    const g = window.__game, tr = g.trip, before = g.profile.money;
    g.trip.comeIn(25);
    const after = g.profile.money, R = g.record, c = R.s.trips[R.s.trips.length - 1];
    return { before, after, tally: c && c.tally, pending: R.s.pending, active: tr.active };
  });
  // the card comes up once free; the count runs in real time
  await page.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); g.outfitter.arrival = null; });
  let shown = false;
  for (let k = 0; k < 20 && !shown; k++) { await step(30); shown = await page.evaluate(() => !!window.__game.record.shown); }
  await sleep(700);
  const early = await page.evaluate(() => ({ on: document.querySelectorAll('#tripcard .tl-l.on').length, all: document.querySelectorAll('#tripcard .tl-l').length, purse: (document.querySelector('#tripcard [data-purse]') || {}).textContent }));
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'd-tally-counting.png') });
  await sleep(9000);
  const late = await page.evaluate(() => ({ on: document.querySelectorAll('#tripcard .tl-l.on').length, all: document.querySelectorAll('#tripcard .tl-l').length, purse: (document.querySelector('#tripcard [data-purse]') || {}).textContent,
    lines: [...document.querySelectorAll('#tripcard .tl-l')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()), counted: !!document.querySelector('#tripcard .tc-tally.counted') }));
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'd-tally.png') });
  const want = r5a.pays[0] + r5a.pays[1], T5 = r5.tally || {};
  result('5 nothing paid at the board on the trip', r5mid.money === r5a.m0 && r5mid.held.every((s) => s === 'done'), { m0: r5a.m0, mid: r5mid });
  result('5 the money lands at the settle, before the card', r5.after - r5.before === want && T5.total === want, { before: r5.before, after: r5.after, want, total: T5.total });
  result('5 the tally counts up and ends on the purse', shown && early.on < early.all && late.on === late.all && late.purse === `$${Math.round(r5.after)}` && late.counted
    && r5a.titles.every((t) => late.lines.some((l) => l.includes(t))), { early, late: { ...late, lines: late.lines.slice(0, 14) }, purse: r5.after });
  result('2 the next tally shows the missed notice', (T5.missed || []).some((m) => m.title === r2a.title && m.line), { missed: T5.missed, told: r5a.told });
  const r6b = await page.evaluate((before) => { const after = window.__game.record.milestones(); return { moved: after.filter((m) => m.n > (before.find((b) => b.key === m.key) || { n: 0 }).n).map((m) => `${m.key} ${m.n}/${m.of}`), tally: (window.__game.record.s.trips.slice(-1)[0].tally || {}).milestones, firsts: (window.__game.record.s.trips.slice(-1)[0].tally || {}).firsts }; }, r6.before);
  result('6 the milestones move, and the tally shows one or two', r6b.moved.length >= 1 && (r6b.tally || []).length >= 1 && (r6b.tally || []).length <= 2 && ['first laker', 'first 200-rod carry'].every((f) => (r6b.firsts || []).includes(f)), r6b);
  // E finishes, E again puts it away
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true })); });
  await step(5);
  const closed = await page.evaluate(() => !window.__game.record.shown);
  result('5 E puts the counted card away', closed, {});

  // --- 7: the journal's Tasks page, the days left ------------------------------------------------------------------------------
  const r7 = await page.evaluate(async () => {
    const g = window.__game, T = g.tasks, J = g.journal;
    for (const t of T.held()) T.drop(t.id);
    const made = [];
    // (no cap: nine held, the page lays them out; the owner's call 2026-11-05)
    for (const k of ['fish', 'survey', 'item', 'firewood', 'berries', 'litter', 'deadfall', 'report', 'photo', 'fish', 'item', 'litter']) {
      if (made.length >= 9) break;
      const t = await T.makeKind(k, 25, 'local'); if (t && T.take(t.id)) made.push({ id: t.id, left: T.daysLeft(t), title: t.title });
    }
    J.tab = 'tasks'; J.show('journal'); if (J.side !== 'journal' && J.setSide) J.setSide('journal'); J.render(true);
    await new Promise((r) => setTimeout(r, 300));
    const todos = [...document.querySelectorAll('#journal button.pp-todo')];
    const dues = todos.map((e) => (e.querySelector('.due') || {}).textContent).filter(Boolean);
    // the last card is on screen, or inside a box that scrolls to it
    const last = todos[todos.length - 1];
    let reach = false;
    if (last) {
      const r = last.getBoundingClientRect();
      if (r.bottom <= innerHeight && r.right <= innerWidth) reach = true;
      for (let e = last.parentElement; e && !reach; e = e.parentElement) { const cs = getComputedStyle(e); if (/auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight) reach = true; }
    }
    return { made, dues, todos: todos.length, reach, missed: document.querySelectorAll('#journal .pp-todo.missed').length };
  });
  if (SHOTS) { await sleep(1500); await page.screenshot({ path: path.join(OUT, 'd-journal-tasks.png') }); }
  result('7 the journal shows the days left on each notice held (nine held, every one reachable)', r7.made.length >= 8 && r7.reach && r7.dues.length === r7.made.length && r7.dues.every((d) => /days? left|last day/.test(d)), r7);
  if (SHOTS) {
    await page.evaluate(() => { const J = window.__game.journal; J.tab = 'trips'; J.render(true); });
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'd-journal-milestones.png') });
  }
  await page.evaluate(() => window.__game.journal.close());
  // the board at the counter: eight or more held, no claim buttons, no cap line, the pile scrolls inside its panel
  const rb = await page.evaluate(async () => {
    const g = window.__game, T = g.tasks, o = g.outfitter, L = o.landings.find((l) => l.ep === 25);
    for (const ep of [25, 30]) { T.board(ep); await T.write(ep); }
    const offered = [25, 30].flatMap((ep) => T.board(ep)).filter((t) => t && t.status === 'offered');
    for (const ep of [31, 32, 33]) { try { T.board(ep); await T.write(ep); } catch { /* not a board */ } }
    const more = [25, 30, 31, 32, 33].flatMap((ep) => T.board(ep) || []).filter((t) => t && t.status === 'offered');
    for (const t of [...offered, ...more]) { if (T.held().length >= 9) break; T.take(t.id); }
    // the pile is the board's own notices: move every held one onto board 25 for the look (8+ cards in one pile)
    const moved = T.held().map((t) => [t, t.from]); for (const [t] of moved) t.from = 25;
    o.show(L, 'board');
    await new Promise((r) => setTimeout(r, 400));
    const el = document.getElementById('outfitter'), pile = el && el.querySelector('.bd-pile .pile'), panel = el && el.querySelector('.board');
    const pr = pile ? pile.getBoundingClientRect() : null, vr = { w: innerWidth, h: innerHeight };
    const cards = pile ? pile.children.length : 0;
    const look = { cards, pileH: pr && Math.round(pr.height), scrollH: pile && pile.scrollHeight, overflowY: pile && getComputedStyle(pile).overflowY, bottom: pr && Math.round(pr.bottom), vh: vr.h, boardBottom: panel && Math.round(panel.getBoundingClientRect().bottom) };
    for (const [t, f] of moved) t.from = f;
    const res = { open: o.open, claimBtns: el ? el.querySelectorAll('[data-id^="claim"]').length : -1, capLine: !!(el && /You hold/.test(el.textContent)), held: T.held().length, look };
    return res;
  });
  if (SHOTS) { await sleep(500); await page.screenshot({ path: path.join(OUT, 'd-board.png') }); }
  result('the board has no claim buttons and no cap line with 8+ held; the pile of 8+ fits on screen (it scrolls)', rb.open && rb.claimBtns === 0 && !rb.capLine && rb.held >= 8 && rb.look.cards >= 8 && rb.look.bottom <= rb.look.vh + 1 && (rb.look.scrollH <= rb.look.pileH + 1 || /auto|scroll/.test(rb.look.overflowY)), rb);
  await page.evaluate(() => window.__game.outfitter.hide());

  // --- a v1 record loads as v2 -------------------------------------------------------------------------------------------------
  const rv = await page.evaluate(async () => {
    const g = window.__game, R = g.record, { save } = await import('/src/save.js');
    const keep = JSON.parse(JSON.stringify(R.s));
    const v1 = JSON.parse(JSON.stringify(R.s)); v1.v = 1; delete v1.milestones; delete v1.titles; for (const t of v1.trips) delete t.tally;
    save.write('record', v1);
    R.load();
    const out = { v: R.s.v, milestones: Object.keys(R.s.milestones).length, titles: Array.isArray(R.s.titles), trips: R.s.trips.length, html: R.pageHtml(R.s.trips[R.s.trips.length - 1]).length > 100 };
    R.s = keep; R.write();
    return out;
  });
  result('a v1 record loads as v2 (milestones as they stand, cards with no tally still drawn)', rv.v === 2 && rv.milestones >= 5 && rv.titles && rv.html, rv);
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
