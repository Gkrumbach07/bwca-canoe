// Stream g (story wave 2: the end games), headless Chromium against a running Vite (?story=1), each check PASS or FAIL.
//   J  the journalist ending set: fourteen days on, Ruth Aho at Farm Lake has a word (her bark, the gold choice); she tells
//      of the pike in Pipestone Bay and "I'll go and look." takes it on (secret.pike.given, E's runner started, a ring on
//      the map); at Pipestone Bay the spot is worked out from the tiles; the bite rule (in the spot, in the hours, a spoon:
//      the giant; at noon or on a jig: not) and the real startBite wrapped (a bite there becomes the 124 cm pike); landed;
//      back at Farm "He's real." → her thanks, $150, secret.pike.done, the episode ended. A month on, Lise's cave:
//      Winchell's north wall worked out, the cave's prop standing, E's verb there → the copper kettle in hand. Thea's
//      falls: a picture at Johnson Falls finds it
//   M  the money ending set: a week on, Gus at Moose Lake asks a job ("Anything I can do for you?" → "All right." → a
//      board job taken on as his, no pay); prices ×1.35 everywhere; the job done → owner.25.softened: Gus's prices back,
//      Ruth's still up; twelve days on Ruth's donation at the counter softens her too
//   off  the flag off: endgames.js is never fetched
//
//   APP=http://localhost:5330 node scripts/cmp-g-test.mjs [--only J|M|off]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T } from './slice/c1-talk.mjs';
const SNAP_DIR = process.env.SHOTS || null; // final join: the contact sheet's shots (env SHOTS=dir)
const snap = async (pg, name) => { if (!SNAP_DIR) return; try { (await import('node:fs')).mkdirSync(SNAP_DIR, { recursive: true }); await pg.screenshot({ path: `${SNAP_DIR}/${name}.png` }); } catch { /* a nicety */ } };

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5330').replace(/\/$/, '');
const ONLY = arg('only', null);
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1400)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(query) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /story g|g: /.test(t)) log('console', m.type(), t.slice(0, 300)); });
  await page.goto(`${APP}/${query ? '?' + query : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  return page;
}
async function newSeason(page, home, doy, story = true) {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await page.waitForFunction((story) => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && (!story || (g.storyTalk && g.storyEndgames)); }, story, { timeout: 200000, polling: 250 });
  await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T);
  // page-side helpers: to a store (its layout in), days on, a keeper's talk through to its choices
  await page.evaluate(() => {
    const g = window.__game, L = window.__L, G = g.storyEndgames;
    window.__g = {
      toStore: async (ep) => {
        if (g.outfitter.open) g.outfitter.hide();
        if (!g.outfitter.layout(ep)) { const e = g.world.entryPoints.find((x) => x.ep === ep); await L.tp(e.x, e.z); await L.settle(); for (let k = 0; k < 150 && !g.outfitter.layout(ep); k++) { L.step(5); await L.wait(100); } }
        window.__t.walkIn(ep); for (let k = 0; k < 8; k++) { L.step(5); await L.wait(60); }
        return !!g.outfitter.layout(ep);
      },
      days: async (n, h = 10) => { g.day.setClock(g.day.year, g.day.doy + n, h); for (let k = 0; k < 6; k++) { L.step(5); await L.wait(30); } try { g.story.update(); } catch { /* */ } },
      talk: (ep, picks) => {
        const D = G.debug, said = [];
        const thru = (n) => { let k = 0; while (n && n.say) { said.push(n.say); if (n.choices && n.choices.length === 1 && n.choices[0].text === '…' && k++ < 12) n = n.choices[0].go(); else break; } return n; };
        let n = D.open(ep); if (!n) return { ok: false, said };
        n = thru(n); for (const p of picks) { n = thru(D.pick(n, p)); }
        return { ok: true, said, last: n && n.choices ? n.choices.map((c) => c.text) : null };
      },
      toPlace: async (x, z) => { await L.tp(x, z); await L.settle(); for (let k = 0; k < 40; k++) { L.step(5); await L.wait(80); if (g.world.isReady(x, z)) break; } },
    };
  });
}
const DOY = 196; // 15 July (the pike's months, the berries' too)

async function J() {
  const page = await open('story=1');
  await newSeason(page, 31, DOY);
  const r0 = await page.evaluate(async () => {
    const g = window.__game, s = g.story, G = g.storyEndgames;
    s.set('nb.found', true, 'rig'); s.set('end', 'J', 'rig'); s.set('end.J', true, 'rig');
    const before = { ready: G.debug.state().ready, choice: G.debug.choice(31) };
    await window.__g.days(14);
    await window.__g.toStore(31);
    return { before, ready: G.debug.state().ready, choice: G.debug.choice(31), money: g.profile.money };
  });
  result('J 1: nothing on the ending\'s day; fourteen days on, Ruth at Farm Lake has a word (the gold choice)', !r0.before.ready && !r0.before.choice && r0.ready && r0.choice === 'You wanted a word?', r0);
  const r1 = await page.evaluate(() => {
    const g = window.__game, s = g.story, G = g.storyEndgames, E = g.storyEpisodes && g.storyEpisodes.episodes;
    const rings0 = (s.pencil().rings || []).length;
    const t = window.__g.talk(31, ['I\'ll go and look.']);
    return { t, state: G.debug.state().secrets.pike, ep: E ? E.state('G_pike') : null, rings: (s.pencil().rings || []).length - rings0, page: E ? E.page('G_pike') : null, next: G.debug.choice(31), lise: G.debug.state().ready };
  });
  result('J 2: she tells of the pike in Pipestone Bay; "I\'ll go and look." takes it on (secret.pike.given, the runner\'s episode started, a ring on the map, its Stories page); nothing more for a month',
    r1.state === 'given' && r1.ep && r1.ep.started && r1.rings >= 1 && r1.page && r1.page.lines.length === 1 && !r1.next && !r1.lise && /pike in Pipestone Bay/.test(r1.t.said.join(' ')), r1);
  const r2 = await page.evaluate(async () => {
    const g = window.__game, G = g.storyEndgames, f = g.fishing;
    await window.__g.toPlace(-36388, 7455);
    let at = null; for (let k = 0; k < 30 && !at; k++) { at = G.debug.resolve('pike'); if (!at) { window.__L.step(10); await window.__L.wait(200); } }
    if (!at) return { at };
    const W = g.world, depth = W.levelAt(at.x, at.z) - W.heightAt(at.x, at.z);
    const yes = G.debug.giant('pike'), noon = G.debug.giant('pike', { hours: 13 }), jig = G.debug.giant('pike', { lure: 'jig' }), far = G.debug.giant('pike', { x: at.x + 400 });
    // the real startBite, wrapped: the lure at the spot, a spoon, at dawn, the roll in
    g.day.setClock(g.day.year, g.day.doy, 6);
    const li = (f.lures || []).findIndex((l) => l.id === 'spoon'), was = { lure: f.lure, idx: f.lureIndex, state: f.state }, R = Math.random;
    let bite = null;
    try { f.lureIndex = li >= 0 ? li : f.lureIndex; f.lure = { ...(f.lure || {}), x: at.x, z: at.z, depth: 2 }; Math.random = () => 0.01; f.startBite('perch'); bite = f.bite ? { species: f.bite.species, cm: Math.round(f.bite.length), giant: f.bite.giant } : null; }
    finally { Math.random = R; f.bite = null; f.state = was.state === 'bite' ? 'ready' : was.state; f.lure = was.lure; f.lureIndex = was.idx; }
    return { at, depth: +depth.toFixed(1), yes, noon, jig, far, bite };
  });
  result('J 3: at Pipestone Bay the spot is worked out from the tiles; the bite rule (the spot, dawn, a spoon: the giant; noon, a jig, 400 m off: not); the real startBite there becomes the 124 cm pike',
    r2.at && r2.yes === 'pike' && !r2.noon && !r2.jig && !r2.far && r2.bite && r2.bite.species === 'pike' && r2.bite.cm === 124 && r2.bite.giant === 'pike', r2);
  const r3 = await page.evaluate(async () => {
    const g = window.__game, s = g.story, G = g.storyEndgames, E = g.storyEpisodes && g.storyEpisodes.episodes;
    G.debug.land('pike');
    const found = G.debug.state().secrets.pike;
    await window.__g.toStore(31);
    const m0 = g.profile.money, choice = G.debug.choice(31);
    const t = window.__g.talk(31, []);
    return { found, choice, t, done: G.debug.state().secrets.pike, paid: g.profile.money - m0, end: s.get('ep.G_pike.end'), ep: E ? E.state('G_pike') : null };
  });
  result('J 4: landed, it is found; back at Farm "He\'s real." → Ruth\'s thanks, $150, secret.pike.done, the episode ended on the runner',
    r3.found === 'found' && /He’s real|He's real/.test(r3.choice || '') && r3.done === 'done' && r3.paid === 150 && r3.end === 'told', r3);
  // a month on: Lise's cave (the place, the prop, E's verb → the kettle)
  const r4 = await page.evaluate(async () => {
    const g = window.__game, G = g.storyEndgames, L = window.__L;
    await window.__g.days(31);
    const ready = G.debug.state().ready;
    await window.__g.toStore(64);
    const choice = G.debug.choice(64), t = window.__g.talk(64, ['I\'ll go and look.']);
    await window.__g.toPlace(45533, 10450);
    let at = null; for (let k = 0; k < 40 && !at; k++) { at = G.debug.resolve('cave'); if (!at) { L.step(10); await L.wait(250); } }
    const W = g.world, inland = at ? +W.shoreAt(at.x, at.z).toFixed(1) : null;
    if (at) { await L.tp(at.x + 8, at.z + 8); await L.settle(); }
    const props = G.debug.tick(), prop = G.debug.prop('cave');
    const ok = G.debug.find('cave');
    return { ready, choice, given: t.ok, at, inland, props, prop, ok, state: G.debug.state().secrets.cave, kettle: g.inventory.count('tradekettle', { reachable: true }) };
  });
  await snap(page, 'g-cave');
  result('J 5: a month on, Lise at Cub Creek has the next; Winchell\'s north wall worked out (on land, by the water), the cave\'s prop standing; its verb → found, the copper kettle in hand',
    r4.ready && r4.choice === 'You wanted a word?' && r4.at && r4.inland > 0 && r4.props.includes('cave') && r4.ok && r4.state === 'found' && r4.kettle >= 1, r4);
  // the falls for the camera (taken on directly: the order of owners is the player's)
  const r5 = await page.evaluate(async () => {
    const g = window.__game, G = g.storyEndgames;
    G.debug.give('falls');
    const before = G.debug.state().secrets.falls;
    const hits = G.debug.shoot('falls');
    return { before, hits, state: G.debug.state().secrets.falls };
  });
  result('J 6: Thea\'s falls: a picture at Johnson Falls (in range, facing it) finds it', r5.before === 'given' && r5.hits.includes('falls') && r5.state === 'found', r5);
  const m = await page.evaluate(() => ({ soft: window.__game.storyEndgames.debug.choice(25), mul: window.__game.outfitter.shop ? window.__game.outfitter.shop.priceMul(25) : null }));
  result('J 7: no softening asks and no upcharge after the journalist ending', !m.soft || m.soft !== 'Anything I can do for you?', m);
  await page.context().close();
}

async function M() {
  const page = await open('story=1');
  await newSeason(page, 25, DOY);
  const r0 = await page.evaluate(async () => {
    const g = window.__game, s = g.story, G = g.storyEndgames, sh = g.outfitter.shop;
    const base25 = sh.priceMul(25), base31 = sh.priceMul(31);
    s.set('nb.found', true, 'rig'); s.set('end', 'M', 'rig'); s.set('end.M', true, 'rig');
    const up25 = sh.priceMul(25), up31 = sh.priceMul(31);
    const early = G.debug.choice(25);
    await window.__g.days(8);
    await window.__g.toStore(25);
    g.profile.earn(500, 'rig');
    return { base25, base31, up25, up31, early, choice: G.debug.choice(25), secret: G.debug.state().ready };
  });
  result('M 1: the money ending: every owner ×1.35; nothing asked the first week; a week on Gus asks (and no secrets)',
    Math.abs(r0.up25 / r0.base25 - 1.35) < 0.01 && Math.abs(r0.up31 / r0.base31 - 1.35) < 0.01 && !r0.early && r0.choice === 'Anything I can do for you?' && !r0.secret, r0);
  const r1 = await page.evaluate(async () => {
    const g = window.__game, G = g.storyEndgames, L = window.__L;
    const t = window.__g.talk(25, ['All right.']);
    let job = null; for (let k = 0; k < 60 && !job; k++) { job = g.tasks.active.find((x) => x.gOwner === 25) || null; if (!job) await L.wait(100); }
    return { t, job: job ? { id: job.id, kind: job.kind, status: job.status, pay: job.pay, npcName: job.npcName } : null, asked: g.story.get('owner.25.asked'), next: G.debug.choice(31), soft: G.debug.state().soft };
  });
  result('M 2: "All right." takes on a board job as Gus\'s (open, no pay); Ruth waits her turn', r1.job && r1.job.status === 'open' && r1.job.pay === 0 && r1.job.npcName === 'Gus Lindgren' && !!r1.asked && !(r1.t.last || []).includes('Anything I can do for you?'), r1);
  const r2 = await page.evaluate(async () => {
    const g = window.__game, s = g.story, G = g.storyEndgames, sh = g.outfitter.shop, L = window.__L;
    const job = g.tasks.active.find((x) => x.gOwner === 25);
    if (job) job.status = 'done';
    for (let k = 0; k < 20 && !s.has('owner.25.softened'); k++) { L.step(5); await L.wait(100); }
    return { softened: s.has('owner.25.softened'), mul25: sh.priceMul(25), mul31: sh.priceMul(31), choice: G.debug.choice(25) };
  });
  result('M 3: the job done → owner.25.softened: Gus\'s prices back, Ruth\'s still ×1.35; Gus asks nothing more', r2.softened && Math.abs(r2.mul25 / r0.base25 - 1) < 0.01 && Math.abs(r2.mul31 / r0.base31 - 1.35) < 0.01 && !r2.choice, r2);
  const r3 = await page.evaluate(async () => {
    const g = window.__game, s = g.story, G = g.storyEndgames, sh = g.outfitter.shop;
    await window.__g.days(12);
    await window.__g.toStore(31);
    const m0 = g.profile.money, choice = G.debug.choice(31);
    const t = window.__g.talk(31, ['Here.']);
    return { choice, t, paid: m0 - g.profile.money, softened: s.has('owner.31.softened'), mul31: sh.priceMul(31), mul38: sh.priceMul(38), count: G.debug.state().softened };
  });
  result('M 4: twelve days on, Ruth\'s donation at the counter ($40) softens her; Bev\'s prices still up', r3.choice === 'Anything I can do for you?' && r3.paid === 40 && r3.softened && Math.abs(r3.mul31 / r0.base31 - 1) < 0.01 && r3.count.length === 2, r3);
  await page.context().close();
}

async function off() {
  const page = await open('story=0'); // (the story is on by default since 2026-11-13: off is ?story=0)
  await newSeason(page, 25, DOY, false);
  const r = await page.evaluate(() => { const mods = performance.getEntriesByType('resource').map((e) => e.name.split('/').pop().split('?')[0]); return { mine: mods.filter((n) => /^endgames\.js$|drafts-g\.json/.test(n)), eg: !window.__game.storyEndgames }; });
  result('off: the flag off: endgames.js never fetched, nothing hung', !r.mine.length && r.eg, r);
  await page.context().close();
}

for (const [k, fn] of [['off', off], ['J', J], ['M', M]]) {
  if (ONLY && ONLY !== k) continue;
  try { await fn(); } catch (e) { result(`${k}: ran to the end`, false, { e: String(e && e.stack || e).slice(0, 800) }); }
}
await browser.close();
const pass = results.filter((r) => r.pass).length;
log(`cmp-g-test: ${pass}/${results.length} PASS${errors.length ? ` · ${errors.length} page errors` : ''}`);
process.exit(pass === results.length && !errors.length ? 0 : 1);
