import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://localhost:5207';
const RELAY = process.env.RELAY || 'ws://localhost:8807';
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const browsers = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1500)); };
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
const HOME = 25, R = 10000, YEAR = new Date().getFullYear(), DOY = 203;

async function openGame(name, query = '') {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(browser);
  const page = await (await browser.newContext({ viewport: { width: 960, height: 600 } })).newPage();
  page.on('pageerror', (e) => log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${query}`, { timeout: 180000 });
  await loaded(page);
  await notes(page);
  log(`[${name}] game loaded`);
  return page;
}
const loaded = (page) => page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title && window.__game.parties && window.__game.coopGive && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
// what the HUD said, kept for a failure's log
const notes = (page) => page.evaluate(() => { const h = window.__game.hud, f = h.note.bind(h); window.__notes = []; h.note = (t, ...a) => { window.__notes.push(`${window.__game.day.doy} ${window.__game.day.hours.toFixed(2)} ${t}`); if (window.__notes.length > 30) window.__notes.shift(); return f(t, ...a); }; });
// a season of the page's own first (a guest's own world: its own seasonId), and its own Traffic
async function ownSeason(P, traffic) {
  await P.evaluate(async ([home, year, doy, traffic]) => {
    const g = window.__game, t = g.title;
    t.setPick('adventure');
    await t.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year, doy } });
    if (g.settings && g.settings.set) g.settings.set('traffic', traffic);
  }, [HOME, YEAR, DOY, traffic]);
  await until(P, () => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 300000);
  await P.evaluate((home) => { const g = window.__game, o = g.outfitter; if (o.open) o.hide(); if (g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(home, false); } }, HOME);
}
// each page's view of the sites round (hx, hz): the schedule's camp and the registry's holder, by key
const SNAP = ([hx, hz, R]) => {
  const g = window.__game, P = g.parties, reg = g.campsites, d = g.day, T = P.today, h = d.hours, sched = new Map();
  for (const c of P.campsAt(T, h)) sched.set(c.key, c.party.id);
  const out = {};
  for (const c of g.world.campsites) {
    if (Math.hypot(c.x - hx, c.z - hz) > R) continue;
    const key = reg.key(c), hd = reg.holder(key);
    out[key] = { s: sched.get(key) || '', r: hd == null ? '' : String(hd).startsWith('party:') ? hd : 'player', x: c.x, z: c.z };
  }
  return { cp: g.coopParties ? g.coopParties.stats() : null, T, h: +h.toFixed(3), doy: d.doy, seed: P.seed, traffic: P.traffic, mine: P.mineSig, me: { x: g.player.x, z: g.player.z }, sites: out };
};
let disagreeTotal = 0;

// the host's clock moved; the guests follow (the coop clock), every page's claims settled
async function clockTo(pages, doy, hours) {
  // (fed and rested: the rig's jumps of the clock are not a trip spent, so nobody is evacuated and their tent struck)
  for (const P of pages) await P.evaluate(() => { const e = window.__game.energy; if (e && e.arrive) e.arrive(); });
  await pages[0].evaluate(([y, doy, h]) => { window.__game.day.setClock(y, doy, h); }, [YEAR, doy, hours]);
  for (const P of pages.slice(1)) {
    try { await until(P, ([doy, h]) => { const d = window.__game.day; return d.doy === doy && Math.abs(d.hours - h) < 0.2; }, [doy, hours], 20000); } catch (e) {
      log('a guest\'s clock did not follow', await P.evaluate(() => { const g = window.__game, d = g.day; return { doy: d.doy, h: d.hours, night: g.coopNight && g.coopNight.stats ? g.coopNight.stats() : null }; }));
      throw e;
    }
  }
  for (const P of pages) await P.evaluate(() => { const e = window.__game.energy; if (e && e.arrive) e.arrive(); });
  await sleep(2500);
}

// r2 replay, co-op: three pages (a host and two guests by the link, one with a season of its own, one with none), the
// guest's starter kit, ten campsites spot-checked on every page (who the parties have camped there, who holds it), and
// four players at most: a fourth client in the room, then a fifth page's join refused in the four-player line.
//   APP=http://localhost:5207 RELAY=ws://localhost:8807 node scripts/coop/r2-replay.mjs [--shots dir]
import { mkdirSync } from 'node:fs';
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (P, name) => { if (SHOTS) try { await P.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch (e) { log('shot', e.message); } };
async function joinAs(P, code, name) {
  await P.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}&join=${code}`, { timeout: 180000 });
  await loaded(P); await notes(P);
  await until(P, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); }, null, 60000);
  await P.fill('#coop-name', name);
  await P.click('#coop-go');
}
try {
  const A = await openGame('host');
  await ownSeason(A, 'usual');
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
  log('code', code);
  const guests = [];
  for (const name of ['Ada', 'Bo']) {
    const P = await openGame(name.toLowerCase());
    if (name === 'Ada') { await ownSeason(P, 'busy'); await P.evaluate(() => { const g = window.__game; if (g.save && g.save.flush) g.save.flush(); }); await sleep(1500); }
    await joinAs(P, code, name);
    await until(P, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 300000);
    await until(P, () => window.__game.coopGive && window.__game.coopGive.mine, null, 300000);
    await P.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
    guests.push({ P, name });
  }
  const pages = [A, ...guests.map((g) => g.P)];
  await sleep(3000);
  // the guest's kit: Bo came with no season (a fresh guest); Ada brought her own season's things
  const kit = await guests[1].P.evaluate(() => { const inv = window.__game.profile.inventory; return { cs: inv.containers.filter((c) => !['pockets', 'crate'].includes(c.item)).map((c) => ({ item: c.item, where: c.where, n: (c.grid || []).length, ids: (c.grid || []).map((e) => e.id) })), long: inv.long.map((l) => [l.id, l.where]), money: window.__game.profile.money }; });
  const ids = kit.cs.flatMap((c) => c.ids);
  result('a fresh guest has a starter kit: a pack with a tent, bag and pad, food, a paddle', kit.cs.length >= 2 && ids.some((i) => /tent|aframe|dome/.test(i)) && ids.includes('sleepingbag') && ids.includes('pad') && ids.some((i) => /^meal:/.test(i)) && kit.long.some(([i]) => /paddle|ash/.test(i)), kit);
  // everyone on Moose Lake by the host
  const lake = await A.evaluate((home) => { const g = window.__game, e = g.outfitter.entry(home), l = g.world.lakes[e.lake - 1]; return { x: l.cx, z: l.cz }; }, HOME);
  for (let k = 0; k < 3; k++) await pages[k].evaluate(async ([x, z]) => { await window.__game.player.teleport(x, z); }, [lake.x + k * 40, lake.z]);
  for (const P of pages) await until(P, () => !window.__game.player.teleporting, null, 60000);
  await sleep(2000);
  // ten sites nearest the host, at two hours: the same parties and the same holders on all three pages
  for (const h of [10.0, 19.5]) {
    await clockTo(pages, DOY, h);
    const snaps = await Promise.all(pages.map((P) => P.evaluate(SNAP, [lake.x, lake.z, 10000])));
    const keys = Object.keys(snaps[0].sites).sort((a, b) => { const s = snaps[0].sites; return Math.hypot(s[a].x - lake.x, s[a].z - lake.z) - Math.hypot(s[b].x - lake.x, s[b].z - lake.z); }).slice(0, 10);
    const rows = keys.map((k) => snaps.map((s) => s.sites[k] ? `${s.sites[k].s || '-'}/${s.sites[k].r || '-'}` : 'missing'));
    const bad = rows.filter((r) => r.some((v) => v !== r[0]));
    result(`${h}:00 ten sites by the host, the same on all three pages (${rows.filter((r) => r[0] !== '-/-').length} camped or held)`, keys.length === 10 && bad.length === 0, { rows });
  }
  await shot(A, 'coop-host'); await shot(guests[1].P, 'coop-guest');
  // a fourth in the room (a bare client), then a fifth page: refused, in the four-player line
  const ws4 = new WebSocket(`${RELAY}/room/${code}?role=guest&name=Cy`);
  const w4 = await new Promise((r) => { ws4.onmessage = (e) => { try { r(JSON.parse(e.data)); } catch { r(null); } }; setTimeout(() => r(null), 15000); });
  result('a fourth player joins the room', w4 && w4.t === 'welcome' && w4.peers.length === 3, { w4: w4 && { t: w4.t, peers: w4.peers && w4.peers.length } });
  const E = await openGame('fifth');
  await joinAs(E, code, 'Dee');
  let refused = '';
  try { await until(E, () => /four at most/.test((document.getElementById('coop-card') || {}).innerText || ''), null, 60000); refused = await E.evaluate(() => document.getElementById('coop-card').innerText); } catch { refused = await E.evaluate(() => (document.getElementById('coop-card') || {}).innerText || ''); }
  await shot(E, 'coop-fifth');
  const role = await E.evaluate(() => window.__game.coop.role || null);
  result('a fifth is refused: "That trip is full (four at most)."', /That trip is full \(four at most\)\./.test(refused) && !role, { refused: refused.slice(0, 300), role });
  ws4.close();
} catch (e) { log('ERROR', e && e.stack || e); results.push({ name: 'run', pass: false }); }
finally {
  for (const b of browsers) await b.close().catch(() => {});
  log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
  process.exitCode = results.every((r) => r.pass) ? 0 : 1;
}
