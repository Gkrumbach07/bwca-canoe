// Stream c's rig (Round 3: src/coop-story.js; campaign-design §11 read through Part 3 calls 1 and 7): co-op and the story,
// two (then three) headless Chromiums through `wrangler dev`, ?story=1. The guest has their own season first (a fact of
// their own); the host's Adventure season finds the notebook; the guest joins:
//   M1 the guest's story is the host's: the host's facts, the notebook found, the Walt page's lines (mirrored, read-only)
//   M2 the guest's book has the Walt side and opens on the host's notebook; the Walt page lists the host's lines; the
//      notebook is in the host's pockets and nowhere in the guest's inventory
//   M3 the stones and props read as the host's (every story prop's dot name the same on both screens)
//   M4 the story's people the host's game stands are stood on the guest's screen (Tauno staged on the host)
//   M5 the host's tasks: a notice the host takes shows taken (open) in the guest's tasks (journal and tracker)
//   M6 a guest's deed is the host's: a picture credited near the host lands in the host's feed (by: guest)
//   M7 the pit with a friend in: no verb; N42 on the Walt page once with an L6 key (and mirrored to the guest)
//   M8 a join refused while the run is on ("Out on the water tonight."), the room fine again after
//   M9 the guest leaves: back home, their own story as it was (their fact, none of the host's), story2 untouched
//   APP=... RELAY=... node scripts/coop/story-mirror.mjs [--out dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5260').replace(/\/$/, ''), RELAY = process.env.RELAY || 'ws://localhost:8860';
const OUT = path.resolve(arg('out', 'coop-story-out')); mkdirSync(OUT, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [], errors = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1500)); };
const browsers = [];
async function fresh(name) {
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(b);
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /story|coop/i.test(m.text()))) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  return page;
}
const booted = (page) => page.waitForFunction(() => window.__game && window.__game.title && window.__game.story && (window.__game.title.state === 'title' || window.__game.title.state === 'game') && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
const go = async (page, q) => { await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${q ? '&' + q : ''}`, { timeout: 180000 }); await booted(page); };
const inGame = (page) => page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 150000, polling: 250 });
const newSeason = async (page, home, doy) => { await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]); await inGame(page); };
const raw2 = (page) => page.evaluate(() => window.__game.store.getItem('bwca-canoe:story2'));
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
const HOME = 25;

try {
  // --- the guest's own season first, flag on: a fact of their own ------------------------------------------------------
  const B = await fresh('guest');
  await go(B, 'story=1'); await newSeason(B, 31, 190);
  await B.evaluate(async () => { const g = window.__game; g.story.debug.set('knows.guestown'); g.story.flush(); g.slots.flush(); g.title.open('pause'); await new Promise((r) => setTimeout(r, 400)); g.story.flush(); g.slots.flush(); });
  const own0 = await raw2(B);
  const ownSeason = await B.evaluate(() => window.__game.profile.seasonId);

  // --- the host: an Adventure season, the notebook found, a Walt line, a fact of its own ----------------------------------
  const A = await fresh('host');
  await go(A, 'story=1'); await newSeason(A, HOME, 166);
  await A.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); if (g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(25, false); } });
  await until(A, () => !!window.__game.coopStory, null, 60000);
  await A.evaluate(() => { const g = window.__game, s = g.story; g.walt.find({ key: 1, lake: 'Moose Lake' }); s.debug.set('knows.hostonly'); s.waltLine('w.found', 'rig'); });
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Host', shirt: 2 }));
  log('[host] code', code);

  // --- the guest joins ------------------------------------------------------------------------------------------------------
  await B.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}&story=1&join=${code}`, { timeout: 180000 }); await booted(B);
  await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); }, null, 120000);
  await B.fill('#coop-name', 'Ada'); await B.click('#coop-go');
  await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 150000);
  await until(B, () => window.__game.coopStory && window.__game.coopStory.heard > 0 && window.__game.story.has('nb.found'), null, 60000).catch(() => null);

  const g1 = await B.evaluate(() => { const g = window.__game, s = g.story; return { mode: s.mode, hostMirror: !!(s.doc && s.doc.hostMirror), found: s.has('nb.found'), hostonly: s.has('knows.hostonly'), own: s.has('knows.guestown'), walt: s.walt(), facts: Object.keys(s.facts()).length, cs: g.coopStory.stats(), flush: s.flush() }; });
  const hostF = await A.evaluate(() => Object.keys(window.__game.story.facts()).length);
  result('M1 the guest\'s story is the host\'s (facts, notebook found, Walt lines), read-only', g1.mode === 'mirror' && g1.hostMirror && g1.found && g1.hostonly && !g1.own && g1.walt.includes('w.found') && g1.flush === false && g1.facts > 0 && g1.facts <= hostF, { g1: { ...g1, cs: undefined }, hostF, heard: g1.cs.heard });

  // M2 the book's Walt side on the guest: the host's notebook, the Walt page; the notebook not in the guest's inventory
  const g2 = await B.evaluate(async () => {
    const g = window.__game, book = g.book, inv = g.inventory;
    const has = (I) => (I.containers || []).some((k) => (k.grid || []).some((e) => e.id === 'waltnotebook'));
    const visible = !!(book && book.visible());
    const opened = !!(book && book.open('nb'));
    await new Promise((r) => setTimeout(r, 400));
    const side = g.journal.side, nbHtml = book && book.el ? book.el.innerText.length : 0;
    book.view = 'walt'; book.render(true);
    const lines = book.case.lines().map((l) => l.id);
    const pageText = book.el ? book.el.innerText.slice(0, 300) : '';
    g.journal.hide && g.journal.hide();
    return { visible, opened, side, nbHtml, lines, pageText, guestHas: has(inv) };
  });
  const hostHas = await A.evaluate(() => (window.__game.inventory.containers || []).some((k) => (k.grid || []).some((e) => e.id === 'waltnotebook')));
  result('M2 the guest reads the host\'s notebook and Walt page in the book; the notebook is the host\'s, never in the guest\'s inventory', g2.visible && g2.opened && g2.side === 'walt' && g2.nbHtml > 0 && g2.lines.includes('w.found') && !g2.guestHas && hostHas, { ...g2, hostHas });

  // M3 the stones and props read as the host's
  const dotsOf = (page) => page.evaluate(() => { const L = window.__game.storyLayer, out = {}; for (const [id, q] of L.propIx) if (q.prop.dot && q.prop.dot.length > 1) out[id] = L.dotName(id); return out; });
  const dA = await dotsOf(A), dB = await dotsOf(B);
  const diff = Object.keys(dA).filter((k) => dA[k] !== dB[k]);
  result('M3 every story prop\'s dot name on the guest is the host\'s', Object.keys(dA).length > 0 && !diff.length, { n: Object.keys(dA).length, diff: diff.slice(0, 8).map((k) => [k, dA[k], dB[k]]) });

  // M4 the story's people: Tauno staged on the host stands on the guest's screen
  const staged = await A.evaluate((ep) => { const c = window.__game.storyTalk && window.__game.storyTalk.cast; return c ? c.debug.stage('tauno', ep, 'farm', 'foot') : null; }, HOME);
  await until(B, () => window.__game.coopStory.stats().mirCast.some((k) => /^cast:tauno:/.test(k)), null, 15000).catch(() => null);
  const g4 = await B.evaluate(() => ({ mir: window.__game.coopStory.stats().mirCast, extras: [...(window.__game.npcs.extrasAt.values())].flat().map((r) => r.key) }));
  result('M4 a story person the host\'s game stands is stood on the guest\'s screen', !!staged && g4.mir.some((k) => /^cast:tauno:/.test(k)) && g4.extras.some((k) => /^mirror:cast:tauno:/.test(k)), { staged: staged && staged.map((s) => s.who), ...g4 });

  // M5 the host's tasks in the guest's journal and tracker
  let g5 = { none: true };
  try {
    await until(A, (ep) => window.__game.tasks.board(ep).some((t) => t && t.status === 'offered'), HOME, 60000);
    const pick = await A.evaluate((ep) => { const T = window.__game.tasks, t = T.board(ep).find((q) => q && q.status === 'offered'); T.take(t.id); return { id: t.id, title: t.title }; }, HOME);
    await until(B, (id) => { const t = window.__game.tasks.ads.get(id); return t && t.status === 'open'; }, pick.id, 30000).catch(() => null);
    g5 = await B.evaluate((id) => { const T = window.__game.tasks, t = T.ads.get(id); return { id, status: t && t.status, active: (T.active || []).map((q) => (q && q.id) || q).includes(id), mirrored: window.__game.coopTrip.mirrored }; }, pick.id);
    g5.title = pick.title;
  } catch (e) { g5 = { err: String(e.message).slice(0, 200) }; }
  result('M5 the host\'s notice, taken, shows in the guest\'s tasks (journal and tracker)', g5.status === 'open' && g5.active, g5);

  // M6 guest credit: a picture by the guest, near the host, is the host's
  await A.evaluate(() => { const g = window.__game, B = g.coopStory; g.__rigCredit = B.n.creditsTaken; });
  await B.evaluate(() => window.__game.coopStory.debug.credit('ev', { evt: 'photo', data: { id: 'rig.c', matches: ['rig.c'], place: null } }));
  await until(A, () => window.__game.coopStory.n.creditsTaken > window.__game.__rigCredit, null, 10000).catch(() => null);
  const g6 = await A.evaluate(() => { const g = window.__game, f = g.storySeams.feed; return { taken: g.coopStory.n.creditsTaken - g.__rigCredit, recent: f ? f.recent.filter((r) => r.evt === 'photo').map((r) => ({ by: r.data && r.data.by, how: r.how })) : null, n: g.coopStory.n }; });
  result('M6 a guest\'s picture near the host lands in the host\'s story (by: guest)', g6.taken >= 1 && g6.recent && g6.recent.some((r) => r.by === 'guest' && r.how === 'in'), g6);

  // M7 the pit with a friend in (stream F's `cellar.pit`, kit 'pit'; a stand-in where F's prop is not on this branch)
  const g7 = await A.evaluate(() => {
    const g = window.__game, L = g.storyLayer, s = g.story;
    if (!L.prop('cellar.pit')) L.propIx.set('cellar.pit', { place: { id: 'cellar', verbs: [{ prop: 'cellar.pit', verb: 'moss', label: 'Clear the moss', when: '' }] }, prop: { id: 'cellar.pit', kit: 'pit', dot: [{ name: 'Ground' }] } });
    const before = L.verbs('cellar.pit').length;
    L.dotName('cellar.pit'); const noKey = s.walt().includes('c.walt.n42');
    s.debug.set('key.L6A');
    L.dotName('cellar.pit'); L.dotName('cellar.pit');
    return { peers: s.readSensor('peers'), verbs: before, noKey, n42: s.walt().filter((w) => w === 'c.walt.n42').length, lines: g.book.case.lines().filter((l) => l.id === 'c.walt.n42').map((l) => l.text) };
  });
  await until(B, () => window.__game.story.walt().includes('c.walt.n42'), null, 10000).catch(() => null);
  const g7b = await B.evaluate(() => window.__game.story.walt().includes('c.walt.n42'));
  result('M7 the pit has no verb with a friend in; N42 written once with an L6 key, in the host\'s and the guest\'s book', g7.peers >= 1 && g7.verbs === 0 && !g7.noKey && g7.n42 === 1 && g7.lines[0] === 'Not with company on the lake.' && g7b, { ...g7, guestSees: g7b });

  // M8 the run on: a third browser's join is refused; off again, the room takes joins
  await A.evaluate(() => { const g = window.__game; g.__rigRunOff = g.story.sensor('run.active', () => true); });
  await sleep(2500); // (the next clock carries shut: 'run')
  const C = await fresh('third');
  await go(C, 'story=1');
  const j1 = await C.evaluate((code) => window.__game.coop.join(code, { name: 'Cy', shirt: 1 }).then(() => 'in', (e) => e.message), code);
  await A.evaluate(() => { const g = window.__game; g.__rigRunOff(); });
  await sleep(2500);
  const j2 = await C.evaluate((code) => window.__game.coop.join(code, { name: 'Cy', shirt: 1 }).then(() => 'in', (e) => e.message), code);
  result('M8 a join refused while the run is on ("Out on the water tonight."), taken again after', j1 === 'Out on the water tonight.' && j2 === 'in', { j1, j2 });
  if (j2 === 'in') { await C.evaluate(() => { try { window.__game.coop.disconnect(); } catch { /* */ } }); }

  // M9 the guest leaves: home, their own story as it was
  const visiting = await raw2(B);
  const nav = B.waitForNavigation({ timeout: 120000 }).catch(() => null);
  await B.evaluate(() => window.__game.coop.leave()); await nav; await booted(B);
  await sleep(1500);
  const back = await B.evaluate(() => { const g = window.__game, s = g.story; return { mode: s.mode, season: g.profile.seasonId, own: s.has('knows.guestown'), hostonly: s.has('knows.hostonly'), found: s.has('nb.found'), n42: s.walt().includes('c.walt.n42'), stored: g.store.getItem('bwca-canoe:story2') }; });
  result('M9 the guest back home: their own story as it was (theirs, none of the host\'s), story2 untouched by the visit', visiting === own0 && back.mode === 'live' && back.season === ownSeason && back.own && !back.hostonly && !back.found && !back.n42, { sameWhileVisiting: visiting === own0, ...back, stored: back.stored && back.stored.slice(0, 120) });
} catch (e) { result('rig ran to the end', false, { error: String(e && e.stack || e).slice(0, 1500) }); }
finally { for (const b of browsers) { try { await b.close(); } catch { /* */ } } }
result('no page errors', !errors.length, { errors: errors.slice(0, 10) });
const pass = results.filter((r) => r.pass).length;
writeFileSync(path.join(OUT, 'story-mirror.json'), JSON.stringify({ pass, total: results.length, results }, null, 1));
log(`coop/story-mirror: ${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
