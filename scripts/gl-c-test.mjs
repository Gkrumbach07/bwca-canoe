// Stream C's acceptance (docs/build/game-loop-brief.md "Stream C: new save and onboarding"): headless Chromium against a
// running Vite, each check printed PASS or FAIL, a JSON report at the end.
//   1 Title → New season shows the start map: ≥ 13 pins (55 without stream B), gentle ones marked; a pin's card names its
//     country and keeper; ← → move between pins; picking one goes to the date step; Start begins the season there
//   2 At the home store: the door's line, then E at the counter (openHot, what E calls) opens the staffer's talk; after it
//     the canoe holds the old pack with the old tent, the dented stove and the pot, and three days of food; the profile
//     owns the home sheet; with permits (a stand-in for stream A's when the build has none) a $0 first permit at home today
//   3 no 'aframe' and no 'pack3' in a new season's inventory
//   4 pitch the old tent at a site and sleep a night: one 'notebook:found', the notebook in the inventory, the card shown;
//     a nap first and a sleep by day: nothing; a second night: nothing
//   5 the old tent pitches with the A-frame's shape, fly colour of its own and the A-frame's sleep
//   6 an old save boots: no counter scene, the legacy flags set, the old kit kept, nothing thrown
//   7 no new item's identity says what it is for ("for " / "use")
//   (and the notebook's Read opens its paper, the pages turn)
//
//   npx vite --port 5183 --strictPort &
//   APP=http://localhost:5183 node scripts/gl-c-test.mjs [--shots docs/build/shots] [--out dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5183';
const OUT = path.resolve(arg('out', path.join(process.env.TMPDIR || '/tmp', 'gl-c-out')));
const SHOTS = arg('shots', null);
const HOME = Number(arg('home', 31)); // Farm Lake: an outfitter with stream B (Ruth Aho's, moved from Lake One 30, a trailhead now)
mkdirSync(OUT, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

function findPw() {
  if (process.env.PW) return process.env.PW;
  const base = path.join(homedir(), '.npm/_npx');
  for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; }
  return 'playwright-core';
}
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(homedir(), 'Library/Caches/ms-playwright');
  const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : [];
  const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; // (the one the notes found working first)
  for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; }
  return undefined;
}
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more)); };
const errors = [];
const shot = async (page, name) => { if (!SHOTS) return; try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); log('shot', name); } catch (e) { log('shot', name, e.message); } };

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function openGame(name, init = null) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log(`[${name}] console.error`, m.text().slice(0, 300)); });
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.onboarding && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  log(`[${name}] loaded`);
  return { ctx, page };
}
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
// frames in chunks (the notes: under ~3000 a call)
const step = (page, n, dt = 1 / 30) => page.evaluate(([n, dt]) => { const g = window.__game; for (let k = 0; k < n; k += 200) g.step(dt, Math.min(200, n - k)); }, [n, dt]);

try {
  // 7 the words, from the module itself (items.js imports nothing)
  {
    const I = await import(pathToFileURL(path.resolve('src/items.js')).href);
    const bad = I.WALT_IDS.map((id) => [id, I.itemDef(id).identity]).filter(([, w]) => /\bfor\b|\buse/i.test(w || ''));
    result('7 no new identity says what the item is for', !bad.length && I.WALT_IDS.length === 4, { identities: Object.fromEntries(I.WALT_IDS.map((id) => [id, I.itemDef(id).identity])), bad });
    result('reserved name: the cedar minnow reads Oskar', /^Oskar/.test(I.itemDef('lure:cedarminnow').name), { name: I.itemDef('lure:cedarminnow').name });
    const kit = JSON.stringify(I.STARTER_KIT);
    result('3a STARTER_KIT has no aframe, pack3 or pot', !/"aframe"|"pack3"|"pot"/.test(kit), { kit: I.STARTER_KIT });
  }

  // --- a fresh browser: a new season ------------------------------------------------------------------------------------
  const { page: A } = await openGame('fresh');
  const fresh = await A.evaluate(() => { const g = window.__game; return { onboard: g.onboarding.state, legacy: g.story.state.legacy || false, started: g.profile.started }; });
  result('a fresh browser is not legacy', !fresh.started && !fresh.legacy && fresh.onboard === null, fresh);

  // 1 the start map
  await A.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(A, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await A.waitForTimeout(600);
  const map = await A.evaluate(() => {
    const g = window.__game, pins = [...document.querySelectorAll('.startmap .pin')], B = typeof g.title.wizard.map.homes[0].reach === 'object';
    return { pins: pins.length, gentle: pins.filter((b) => b.classList.contains('gentle')).length, eps: g.world.entryPoints.length, step: g.title.wizard.step, B, homes: g.title.wizard.map.homes.length };
  });
  result('1a the start map has ≥ 13 pins, gentle ones marked', map.pins >= 13 && map.pins <= map.eps && map.gentle > 0 && map.step === 0, map);
  await A.hover(`.startmap .pin[data-ep="${HOME}"]`);
  await A.waitForTimeout(300);
  const card = await A.evaluate((ep) => { const g = window.__game, h = g.title.wizard.map.home(ep); return { text: document.querySelector('.startmap .scard').innerText, keeper: h.keeper.name, country: h.country, hot: g.title.wizard.map.hot }; }, HOME);
  result('1b a pin\'s card names its country and keeper', card.hot === HOME && card.keeper && card.text.includes(card.keeper) && card.text.toLowerCase().includes(String(card.country).split(/[–-]/)[0].trim().toLowerCase()), card);
  await shot(A, 'c-startmap');
  // the keys: focus the pin, → steps to the next one east, ← back
  const keys = await A.evaluate(async (ep) => {
    const m = window.__game.title.wizard.map; m.focus(ep);
    const at0 = m.hot;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    const at1 = m.hot;
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }));
    return { at0, at1, at2: m.hot, focusIsPin: document.activeElement && document.activeElement.classList.contains('pin') };
  }, HOME);
  result('1c ← → move between the pins', keys.at0 === HOME && keys.at1 !== HOME && keys.at2 === HOME && keys.focusIsPin, keys);
  await A.click(`.startmap .pin[data-ep="${HOME}"]`);
  const picked = await A.evaluate(() => { const w = window.__game.title.wizard; return { step: w.step, ep: w.ep && w.ep.ep }; });
  result('1d picking a pin goes to the date step', picked.step === 1 && picked.ep === HOME, picked);
  await A.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); }); // (July 10: the bugs and the berries, a long day)
  const sum = await A.evaluate(() => document.querySelector('.wsum').innerText);
  await A.click('#btn-start');
  await until(A, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  const begun = await A.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); return { home: g.profile.home, started: g.profile.started, visit: g.outfitter.visit.ep, onboard: g.onboarding.state, story: g.story.state }; });
  result('1e Start begins the season at that home', begun.started && begun.home === HOME && begun.visit === HOME && begun.onboard && begun.onboard.step === 'door' && !begun.story.legacy, { ...begun, sum });

  // 3 the new season's kit
  const kit = await A.evaluate(() => {
    const inv = window.__game.profile.inventory, ids = [];
    for (const c of inv.containers) { ids.push(c.item); for (const e of c.grid) if (!e.box) ids.push(e.id); }
    for (const l of inv.long) ids.push(l.id);
    return { ids, crate: inv.crate.grid.map((e) => e.id) };
  });
  result('3 no aframe and no pack3 in a new season', !kit.ids.includes('aframe') && !kit.ids.includes('pack3') && !kit.ids.includes('pot') && kit.crate.includes('sleepingbag'), kit);

  // 2 the door's line, then E at the counter
  await A.evaluate(() => {
    const g = window.__game;
    window.__glc = { events: [] };
    g.story.on('*', (evt, data) => window.__glc.events.push({ evt, data }));
    // stream A's permits, a stand-in when the build has none (its grant's contract: docs/build/game-loop-brief.md)
    if (!g.permits) { window.__glc.stub = true; g.permits = { granted: [], grant(o) { const p = { id: this.granted.length + 1, kind: 'overnight', price: 0, ...o }; this.granted.push(p); return p; }, held() { return this.granted; } }; }
    const L = g.outfitter.layout(g.profile.home), p = g.player, at = L.counter || L.centre;
    p.x = at.x; p.z = at.z; p.heading = (L.keeper && L.keeper.heading != null ? L.keeper.heading + Math.PI : p.heading); p.placeOnGround();
    window.__glc.insideAtNudge = null;
    const upd = g.onboarding.update.bind(g.onboarding);
    g.onboarding.update = (dt) => { const was = g.onboarding.state.nudged; upd(dt); if (!was && g.onboarding.state.nudged) window.__glc.insideAtNudge = !!(g.outfitter.visit && g.outfitter.visit.inside); };
  });
  await step(A, 90);
  const door = await A.evaluate(() => { const g = window.__game; const lines = [...(g.npcs && g.npcs.dialogue ? g.npcs.dialogue.history : [])].map((h) => h.text); return { inside: window.__glc.insideAtNudge, nudged: g.onboarding.state.nudged, lines, queued: g.npcs.dialogue.queue.map((q) => q.text), on: g.npcs.dialogue.on.map((b) => b.text) }; });
  result('2a the staffer\'s line at the door', door.inside && door.nudged && [...door.lines, ...door.queued, ...door.on].some((l) => /Come to the counter/.test(l)), door);
  const talk0 = await A.evaluate(() => { const g = window.__game, o = g.outfitter; o.openHot('counter', o.visit.landing); const d = g.npcs.dialogue, c = d.convo; return { talking: d.talking, key: c && c.speaker.key, name: c && c.name, say: c && c.node && c.node.say, open: o.open }; });
  result('2b E at the home counter opens the staffer\'s talk', talk0.talking && /^staffer:/.test(talk0.key) && !talk0.open, talk0);
  await step(A, 30);
  await A.waitForTimeout(900); // (the panel's fade is real time)
  await step(A, 2);
  await shot(A, 'c-staffer');
  const talked = await A.evaluate(async () => {
    const g = window.__game, d = g.npcs.dialogue, said = [];
    for (let i = 0; i < 10 && d.convo; i++) { said.push(`${d.convo.node.by || d.convo.name}: ${d.convo.node.say}`); d.choose(0); await new Promise((r) => setTimeout(r, 30)); }
    return { said, talking: d.talking, open: g.outfitter.open, tab: g.outfitter.tab };
  });
  result('2c the talk ends at the counter', !talked.talking && talked.open && talked.tab === 'counter', talked);
  const gift = await A.evaluate(() => {
    const g = window.__game, inv = g.profile.inventory, pack = inv.containers.find((c) => c.item === 'waltpack');
    const inPack = pack ? pack.grid.map((e) => e.id) : [];
    const barrel = inv.containers.find((c) => /^barrel/.test(c.item));
    const meals = (id) => inv.containers.reduce((n, c) => n + c.grid.filter((e) => e.id === id).reduce((m, e) => m + e.qty, 0), 0);
    const P = g.permits, today = Math.round(Date.UTC(g.day.year, 0, g.day.doy) / 86400000);
    return { pack: pack && pack.where, inPack, barrel: barrel && barrel.grid.map((e) => e.id), breakfasts: meals('meal:breakfast'), suppers: meals('meal:supper'), sheets: g.profile.sheets(), permits: P && P.held ? P.held() : null, stub: !!window.__glc.stub, today, home: g.profile.home, onboard: g.onboarding.state, events: window.__glc.events.map((e) => e.evt), crateLeft: inv.crate.grid.map((e) => e.id) };
  });
  result('2d the canoe holds the old pack with the tent, the stove and the pot', gift.pack === 'canoe' && ['walttent', 'waltstove', 'pot', 'sleepingbag', 'pad', 'clothes', 'tarp', 'tablets', 'tacklebox'].every((id) => gift.inPack.includes(id)), { inPack: gift.inPack, crateLeft: gift.crateLeft });
  result('2e food for three days', gift.breakfasts === 3 && gift.suppers === 3, { breakfasts: gift.breakfasts, suppers: gift.suppers, barrel: gift.barrel });
  result('2f the profile owns the home sheet', gift.sheets.length >= 1, { sheets: gift.sheets });
  const pm = (gift.permits || [])[0] || null;
  result(`2g a $0 first permit at home today${gift.stub ? ' (stand-in for stream A)' : ''}`, pm && pm.ep === gift.home && pm.abs === gift.today && pm.from === gift.home && (pm.price || 0) === 0 && (gift.stub ? pm.why === 'first' : true), { permit: pm, today: gift.today });
  result('2h gear:given said once, the scene done', gift.events.filter((e) => e === 'gear:given').length === 1 && gift.onboard.done && gift.onboard.step === 'done', { events: gift.events, onboard: gift.onboard });
  const again = await A.evaluate(() => { const g = window.__game, o = g.outfitter; o.hide(); o.openHot('counter', o.visit.landing); const r = { talking: g.npcs.dialogue.talking, open: o.open }; o.hide(); return r; });
  result('2i the counter again: no second scene', !again.talking && again.open, again);

  // 4/5 the old tent at a site, the nights
  const site = await A.evaluate(async () => {
    const g = window.__game, home = g.outfitter.landing(g.profile.home);
    const near = g.world.campsites.map((c) => ({ c, d: Math.hypot(c.x - home.x, c.z - home.z) })).filter((q) => q.d > 400).sort((a, b) => a.d - b.d).slice(0, 8);
    for (const { c } of near) {
      if (!g.campsites.isFree(g.campsites.key(c))) continue; // (a party's site: not ours to pitch at)
      await g.player.teleport(c.x, c.z);
      for (let i = 0; i < 40 && !c.layout; i++) { g.step(1 / 30, 10); await new Promise((r) => setTimeout(r, 100)); }
      if (c.layout && c.layout.pad && g.campsites.isFree(g.campsites.key(c))) return { x: c.x, z: c.z, key: g.camp.siteName ? g.camp.siteName(c) : null, i: g.world.campsites.indexOf(c) };
    }
    return null;
  });
  if (!site) throw new Error('no campsite with a layout near home');
  await until(A, () => !window.__game.player.teleporting);
  const pitched = await A.evaluate((i) => {
    const g = window.__game, c = g.world.campsites[i], L = c.layout, inv = g.profile.inventory, p = g.player, camp = g.camp;
    const pad = L.pad, drop = { x: L.fire.x + 1.5, z: L.fire.z + 1.5, heading: 0 };
    p.standAt({ x: pad.x + pad.fdx * 2.2, z: pad.z + pad.fdz * 2.2, heading: Math.atan2(-pad.fdx, pad.fdz), drop });
    // the old pack set down by the pad (as a carry and a set-down would leave it)
    const pack = inv.containers.find((k) => k.item === 'waltpack'); pack.where = 'ground'; pack.at = { x: pad.x + pad.fdx * 1.6, z: pad.z + pad.fdz * 1.6 }; inv.emit('containers');
    g.step(1 / 30, 30);
    const tent = camp.tentInReach();
    if (!tent) return { error: 'no tent in reach' };
    let s = null;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1.5, 1.5], [-1.5, -1.5]]) { s = camp.ghostAt(c, tent.def.id, pad.x + dx, pad.z + dz, pad.fdx, pad.fdz); if (s && s.ok) break; }
    if (!s || !s.ok) return { error: `no spot: ${s && s.why}` };
    const why = camp.pitchRefused(tent);
    const staked = camp.stake(s, tent, c);
    if (!staked || !camp.camp) return { error: 'not staked', why, staked };
    camp.setStage(camp.camp, 4); camp.pitched();
    const T = camp.camp, q = camp.tentQuality(), night = camp.nightQuality(true, false);
    T.item = 'aframe'; const qA = camp.tentQuality(), nightA = camp.nightQuality(true, false); T.item = 'walttent'; // (the same night in the A-frame)
    return { item: T.item, kind: T.stages.kind, colour: T.colour, stage: T.stage, refused: why, q, qA, night, nightA };
  }, site.i);
  const I = await import(pathToFileURL(path.resolve('src/items.js')).href);
  const rest = (I.itemDef('walttent').onYou || []).find((o) => o.need === 'rest');
  result('5 the old tent pitches with the A-frame\'s shape and sleep', pitched.item === 'walttent' && pitched.kind === 'aframe' && pitched.colour === 0x8d8462 && pitched.q === pitched.qA && pitched.night === pitched.nightA && rest && rest.add === Math.round(I.AFRAME_SLEEP * 100), { ...pitched, rest, aframeSleep: I.AFRAME_SLEEP });

  const sleepNow = async (hours, choice) => {
    await A.evaluate(([h, ch]) => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, h); g.camp.sleep('tent', ch); }, [hours, choice]);
    let saw = '';
    for (let k = 0; k < 30; k++) {
      await step(A, 60);
      const st = await A.evaluate(() => { const g = window.__game; return { veil: g.veil.active, night: !!g.camp.night, text: document.getElementById('veil-text').textContent, kicker: document.getElementById('veil-kicker').textContent, dark: g.veil.dark }; });
      if (/by headlamp/.test(st.kicker)) { saw = st.text; if (st.dark && SHOTS && !sleepNow.shot) { sleepNow.shot = true; await shot(A, 'c-notebook-card'); } }
      if (!st.veil && !st.night) break;
    }
    return A.evaluate((saw) => { const g = window.__game, inv = g.profile.inventory; return { found: g.story.state.notebook.found, events: window.__glc.events.filter((e) => e.evt === 'notebook:found').length, notebooks: inv.count('waltnotebook', { reachable: false }), saw, clock: g.day.hours }; }, saw);
  };
  const nap = await sleepNow(13, 14.5);
  result('4a a nap in the old tent: nothing', !nap.found && nap.events === 0 && nap.notebooks === 0, nap);
  const byDay = await sleepNow(13.2, 'first');
  result('4b a sleep by day: nothing', !byDay.found && byDay.events === 0, byDay);
  const n1 = await sleepNow(21.5, 'first');
  const pages = await A.evaluate(() => window.__game.story.pages());
  result('4c the first night: one notebook:found, the notebook, the card', n1.found && n1.events === 1 && n1.notebooks === 1 && n1.saw === pages[0].text, n1);
  const where = await A.evaluate(() => { const inv = window.__game.profile.inventory; const c = inv.containers.find((k) => k.grid.some((e) => e.id === 'waltnotebook')); return c ? { item: c.item, where: c.where } : null; });
  // (play d7db6c3: the notebook goes into your pockets first, the tent's pile only when they are full)
  result('4d the notebook is in your pockets (or the tent, pockets full)', where && (where.where === 'pockets' || where.where === 'tent'), where);
  // the notebook's Read: its paper, the pages turn, the story hears
  const read = await A.evaluate(() => {
    const g = window.__game, inv = g.profile.inventory;
    let ref = null;
    for (const c of inv.containers) for (const e of c.grid) if (e.id === 'waltnotebook') ref = { cId: c.id, uid: e.uid };
    const v = inv.verb('read', ref); const r = v && v.enabled ? v.run() : null;
    const open = g.walt.paperOpen, h1 = document.querySelector('#notebook h2').textContent;
    document.querySelector('#notebook [data-n="next"]').click();
    const h2 = document.querySelector('#notebook h2').textContent;
    return { enabled: !!(v && v.enabled), ok: r && r.ok, open, h1, h2, paper: g.hud.paper, read: g.story.state.read.slice(), events: window.__glc.events.filter((e) => e.evt === 'notebook:read').length };
  });
  await A.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 21.6); if (g.lamp && !g.lamp.on) g.lamp.toggle(true); });
  await step(A, 4);
  await shot(A, 'c-notebook-read');
  const closed = await A.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); const g = window.__game; return { open: g.walt.paperOpen, paper: g.hud.paper }; });
  result('the notebook reads as a paper of the story\'s pages', read.enabled && read.ok && read.open && read.h1 && read.h1 !== read.h2 && read.read.length >= 2 && read.events >= 2 && read.paper === 'notebook' && !closed.open && !closed.paper, { read, closed });

  const n2 = await sleepNow(21.5, 'first');
  result('4e a second night: nothing', n2.events === 1 && n2.notebooks === 1, n2);
  const saved = await A.evaluate(() => ({ onboard: window.__game.store.getItem('bwca-canoe:onboard'), story: window.__game.store.getItem('bwca-canoe:story') }));
  result('the onboarding and the story are saved', /"done":true/.test(saved.onboard || '') && /"found":true/.test(saved.story || ''), saved);

  // 6 an old season boots: no scene, legacy, the old kit kept
  const old = {
    profile: { v: 1, id: 'sOldSeason', started: true, mode: 'adventure', home: HOME, permit: null, money: 63, earned: 23, spent: 0, owned: ['aluminium', 'ash', 'pack', 'aframe', 'tablets', 'lure:jig', 'lure:mepps', 'leeches'], kit: { canoe: 'aluminium', paddle: 'ash', tent: 'aframe', filter: 'tablets', packs: 1 }, known: [HOME], rep: {}, ledger: [], migrated: null, told: [], sheets: [] },
  };
  const { page: B } = await openGame('old', { fn: (o) => { try { if (!sessionStorage.getItem('glc-seeded')) { sessionStorage.setItem('glc-seeded', '1'); localStorage.setItem('bwca-canoe:profile', JSON.stringify(o.profile)); } } catch { /* no storage */ } }, arg: old });
  const legacy = await B.evaluate(() => { const g = window.__game; return { started: g.profile.started, home: g.profile.home, onboard: g.onboarding.state, story: g.story.state }; });
  await B.evaluate(() => window.__game.title.continueTrip());
  await until(B, () => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
  await step(B, 60);
  const oldScene = await B.evaluate(() => {
    const g = window.__game, o = g.outfitter, l = o.landing(g.profile.home);
    o.hide(); o.show(l, 'counter');
    const r = { talking: g.npcs.dialogue.talking, open: o.open, pending: g.onboarding.pending(), ids: [] };
    for (const c of g.profile.inventory.containers) { r.ids.push(c.item); for (const e of c.grid) r.ids.push(e.id); }
    o.hide();
    return r;
  });
  const oldErr = errors.filter((e) => e.startsWith('[old]'));
  result('6 an old save: no counter scene, legacy flags, its kit kept, nothing thrown', legacy.started && legacy.onboard && legacy.onboard.legacy && legacy.onboard.done && legacy.story.legacy && !oldScene.talking && oldScene.open && !oldScene.pending && oldScene.ids.includes('aframe') && oldScene.ids.includes('pack3') && !oldErr.length, { legacy, oldScene: { ...oldScene, ids: oldScene.ids.filter((x) => /aframe|pack|walt/.test(x)) }, oldErr });
} catch (e) {
  result('the run', false, { error: e.message, stack: String(e.stack).split('\n').slice(0, 4).join(' | ') });
} finally {
  const pass = results.filter((r) => r.pass).length;
  log(`${pass} of ${results.length} passed; ${errors.length} page errors`);
  writeFileSync(path.join(OUT, 'gl-c-report.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  process.exit(pass === results.length && !errors.length ? 0 : 1);
}
