// The co-op parties' rig (src/coop-parties.js): three headless Chromiums (one browser process each) through `wrangler
// dev`, an Adventure season at Moose Lake (25) in late July (the busy weeks). The host invites; two guests join by the
// link (one with a season of its own first, the other with none, each its own Traffic, so nothing matches by luck).
// Then, at several hours over two game days (the host's clock moved, the guests following it), on every page:
//   - every campsite within 10 km of the host: who the schedule has camped there now (parties.campsAt), and who the
//     campsite registry says holds it (a party, a player, nobody) for the sites within the claims' reach of everyone
//   - compared across the three pages: 0 disagreements
// The host and a guest each pitch a tent at a site in between (a party never lands on either, on any page), and in the
// end a guest leaves: its own parties again (its own seed and Traffic).
//   APP=http://localhost:5203 RELAY=ws://localhost:8803 node scripts/coop/parties.mjs
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://localhost:5203';
const RELAY = process.env.RELAY || 'ws://localhost:8803';
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
async function snapAll(pages, at) {
  const hp = await pages[0].evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
  const snaps = await Promise.all(pages.map((P) => P.evaluate(SNAP, [hp.x, hp.z, R])));
  const reach = 6500 - 600; // the registry holds the camps within claimR of each page's player
  let n = 0, sched = 0, regd = 0, camped = 0, checkedReg = 0;
  const bad = [];
  for (const key of Object.keys(snaps[0].sites)) {
    const all = snaps.map((s) => s.sites[key]);
    if (all.some((v) => !v)) { bad.push({ key, missing: true }); continue; }
    n++;
    if (all[0].s) camped++;
    if (all.some((v) => v.s !== all[0].s)) { sched++; bad.push({ key, s: all.map((v) => v.s) }); }
    const inReach = snaps.every((s) => Math.hypot(all[0].x - s.me.x, all[0].z - s.me.z) < reach);
    if (inReach) {
      checkedReg++;
      if (all.some((v) => v.r !== all[0].r)) { regd++; bad.push({ key, r: all.map((v) => v.r) }); }
    }
  }
  disagreeTotal += sched + regd;
  if (sched + regd) for (const P of pages) log('notes', await P.evaluate(() => ({ notes: window.__notes.slice(-8), camp: !!window.__game.camp.camp, trip: window.__game.trip.active, veil: !!(window.__game.veil && window.__game.veil.active), running: window.__game.day.running })));
  const head = snaps.map((s) => ({ cp: s.cp, T: s.T, h: s.h, seed: s.seed, traffic: s.traffic, mine: s.mine }));
  result(`${at}: every site within 10 km of the host the same on all three pages (${n} sites, ${camped} camped, registry ${checkedReg})`, sched === 0 && regd === 0 && n > 20, { sched, regd, head, bad: bad.slice(0, 8) });
  return { snaps, sched, regd };
}
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
// pitch a tent at the nearest free site with a layout (as gl-c-test does), on this page
async function pitchNear(P, x0, z0, avoid = []) {
  const site = await P.evaluate(async ([x0, z0, avoid]) => {
    const g = window.__game, near = g.world.campsites.map((c, i) => ({ c, i, d: Math.hypot(c.x - x0, c.z - z0) })).filter((q) => q.d > 300 && !avoid.includes(q.i)).sort((a, b) => a.d - b.d).slice(0, 12);
    for (const { c, i } of near) {
      if (!g.campsites.isFree(g.campsites.key(c))) continue;
      await g.player.teleport(c.x, c.z);
      for (let k = 0; k < 40 && !c.layout; k++) { g.step(1 / 30, 10); await new Promise((r) => setTimeout(r, 100)); }
      if (c.layout && c.layout.pad && g.campsites.isFree(g.campsites.key(c))) return i;
    }
    return -1;
  }, [x0, z0, avoid]);
  if (site < 0) return { error: 'no free site with a layout' };
  await until(P, () => !window.__game.player.teleporting);
  return P.evaluate((i) => {
    const g = window.__game, c = g.world.campsites[i], L = c.layout, p = g.player, camp = g.camp, pad = L.pad;
    p.standAt({ x: pad.x + pad.fdx * 2.2, z: pad.z + pad.fdz * 2.2, heading: Math.atan2(-pad.fdx, pad.fdz), drop: { x: L.fire.x + 1.5, z: L.fire.z + 1.5, heading: 0 } });
    g.step(1 / 30, 30);
    const tent = camp.tentInReach();
    if (!tent) return { error: 'no tent in reach', i };
    let s = null;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1.5, 1.5], [-1.5, -1.5]]) { s = camp.ghostAt(c, tent.def.id, pad.x + dx, pad.z + dz, pad.fdx, pad.fdz); if (s && s.ok) break; }
    if (!s || !s.ok) return { error: `no spot: ${s && s.why}`, i };
    if (!camp.stake(s, tent, c) || !camp.camp) return { error: 'not staked', i };
    camp.setStage(camp.camp, 4); camp.pitched();
    return { i, key: camp.camp.key, since: camp.camp.since };
  }, site);
}

try {
  const A = await openGame('host');
  await ownSeason(A, 'usual');
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
  // the guests: each a season and a Traffic of its own first, then in by the link
  const guests = [];
  for (const [name, traffic] of [['Ada', 'busy'], ['Bo', 'quiet']]) {
    const P = await openGame(name.toLowerCase());
    // (Ada a season of her own; Bo none yet, only his own Traffic: the seed of no season)
    if (name === 'Ada') await ownSeason(P, traffic); else await P.evaluate((v) => window.__game.settings.set('traffic', v), traffic);
    const own = await P.evaluate(() => ({ seed: window.__game.parties.seed, traffic: window.__game.parties.traffic }));
    await P.evaluate(() => { const g = window.__game; if (g.save && g.save.flush) g.save.flush(); });
    await sleep(1500);
    await P.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}&join=${code}`, { timeout: 180000 });
    await loaded(P);
    await notes(P);
    await until(P, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); }, null, 60000);
    await P.fill('#coop-name', name);
    await P.click('#coop-go');
    await until(P, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 300000);
    await until(P, () => window.__game.coopGive && window.__game.coopGive.mine, null, 300000);
    await P.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
    guests.push({ P, name, own });
  }
  const pages = [A, ...guests.map((g) => g.P)];
  const hostSeed = await A.evaluate(() => ({ seed: window.__game.parties.seed, traffic: window.__game.parties.traffic }));
  log('own seeds', guests.map((g) => g.own), 'host', hostSeed);
  await sleep(3000);

  // everyone out on Moose Lake near the host
  const lake = await A.evaluate((home) => { const g = window.__game, e = g.outfitter.entry(home), l = g.world.lakes[e.lake - 1]; return { x: l.cx, z: l.cz }; }, HOME);
  const together = async (ks) => {
    for (const k of ks) await pages[k].evaluate(async ([x, z]) => { await window.__game.player.teleport(x, z); }, [lake.x + k * 40, lake.z]);
    for (const P of pages) await until(P, () => !window.__game.player.teleporting, null, 60000);
  };
  await together([0, 1, 2]);

  // day 1: morning, afternoon, evening (a camp landed), night
  await clockTo(pages, DOY, 9.0); await snapAll(pages, 'day 1, 9:00');
  await clockTo(pages, DOY, 14.0); await snapAll(pages, 'day 1, 14:00');
  // the host and the first guest each pitch at a site near the lake (from 14:00: parties landing later go elsewhere)
  const hostCamp = await pitchNear(A, lake.x, lake.z);
  const guestCamp = await pitchNear(guests[0].P, lake.x, lake.z, hostCamp.i >= 0 ? [hostCamp.i] : []);
  result('the host and a guest each pitch a tent at a site', !hostCamp.error && !guestCamp.error, { hostCamp, guestCamp });
  await together([2]);
  await sleep(3000);
  await clockTo(pages, DOY, 19.5); const ev = await snapAll(pages, 'day 1, 19:30 (two tents up)');
  // on no page is a party camped at either tent's site
  const tentKeys = [hostCamp.key, guestCamp.key].filter(Boolean);
  const onTents = ev.snaps.map((s) => tentKeys.map((k) => s.sites[k] && s.sites[k].s).filter(Boolean)).flat();
  // and the sweep's sites are the room's on every page: both tents in each page's list
  const inAll = ev.snaps.every((s) => [hostCamp.i, guestCamp.i].every((i) => s.mine.split(',').some((m) => m.startsWith(`${i}@`))));
  result('no party camps at the host\'s or the guest\'s tent on any page, and every page sweeps with both', tentKeys.length === 2 && onTents.length === 0 && inAll, { tentKeys, onTents, mine: ev.snaps.map((s) => s.mine) });
  await clockTo(pages, DOY, 23.0); await snapAll(pages, 'day 1, 23:00');
  // day 2
  await clockTo(pages, DOY + 1, 7.0); await snapAll(pages, 'day 2, 7:00');
  await clockTo(pages, DOY + 1, 11.0); await snapAll(pages, 'day 2, 11:00');
  await clockTo(pages, DOY + 1, 16.5); await snapAll(pages, 'day 2, 16:30');
  await clockTo(pages, DOY + 1, 21.0); await snapAll(pages, 'day 2, 21:00');
  log('disagreements in all', disagreeTotal);

  // the room's parties: every guest on the host's seed and Traffic
  const seeds = await Promise.all(pages.map((P) => P.evaluate(() => ({ seed: window.__game.parties.seed, traffic: window.__game.parties.traffic }))));
  result('every guest on the host\'s parties (seed and Traffic), whatever its own', seeds.every((s) => s.seed === hostSeed.seed && s.traffic === hostSeed.traffic) && guests.every((g) => g.own.seed !== hostSeed.seed), { seeds, own: guests.map((g) => g.own) });

  // the second guest leaves: its own parties again (Leave the trip reloads into its own season)
  const B2 = guests[1].P;
  await B2.evaluate(() => { window.__game.coop.leave(); });
  await sleep(4000);
  await B2.waitForFunction(() => window.__game && window.__game.parties && window.__game.coop && !window.__game.coop.role && window.__game.profile && window.__game.profile.seasonId, null, { timeout: 240000, polling: 500 }).catch(() => {});
  await sleep(2000);
  const back = await B2.evaluate(() => ({ role: window.__game.coop.role, seed: window.__game.parties.seed, traffic: window.__game.parties.traffic }));
  result('a guest who leaves is on its own parties again', !back.role && back.seed === guests[1].own.seed && back.traffic === guests[1].own.traffic, { back, own: guests[1].own });
} catch (e) { log('ERROR', e && e.stack || e); results.push({ name: 'run', pass: false }); }
finally {
  for (const b of browsers) await b.close().catch(() => {});
  log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
  process.exitCode = results.every((r) => r.pass) ? 0 : 1;
}
