// chk-s: a co-op guest's story under the flag. The guest has their own season with a v2 story (nb.found, a fact) first;
// joins the host; plays a while (a trip, a sleep, walt.onSleep, a store door); leaves; their own story is as it was.
//   APP=... RELAY=... node scripts/chk-coop.mjs --out <dir>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5442').replace(/\/$/, ''), RELAY = process.env.RELAY;
const OUT = path.resolve(arg('out', '/tmp/chk-coop')); mkdirSync(OUT, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1500)); };
const browsers = [];
async function fresh(name) {
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(b);
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /story/i.test(m.text()))) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  return page;
}
const booted = (page) => page.waitForFunction(() => window.__game && window.__game.title && window.__game.story && (window.__game.title.state === 'title' || window.__game.title.state === 'game') && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
const go = async (page, q) => { await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${q ? '&' + q : ''}`, { timeout: 180000 }); await booted(page); };
const inGame = (page) => page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 150000, polling: 250 });
const newSeason = async (page, home, doy) => { await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]); await inGame(page); };
const raw2 = (page) => page.evaluate(() => window.__game.store.getItem('bwca-canoe:story2'));
try {
  // the guest's own season first, flag on: nb.found + a fact
  const B = await fresh('guest');
  await go(B, 'story=1'); await newSeason(B, 31, 190);
  await B.evaluate(async () => { const g = window.__game; g.walt.find({ key: 1, lake: 'Guest Own Lake' }); await new Promise((r) => setTimeout(r, 200)); g.story.debug.set('crews.seen'); g.story.flush(); g.slots.flush(); await new Promise((r) => setTimeout(r, 500)); });
  const own0 = await raw2(B);
  const ownSeason = await B.evaluate(() => window.__game.profile.seasonId);
  // the host
  const A = await fresh('host');
  await go(A, 'story=1'); await newSeason(A, 25, 166);
  await A.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); if (g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(25, false); } });
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Host', shirt: 2 }));
  // the guest joins from their own game (pause card's join: the title's join card)
  await B.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}&story=1&join=${code}`, { timeout: 180000 }); await booted(B);
  await B.waitForFunction(() => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); }, null, { timeout: 120000 });
  const pre = await B.evaluate(() => { const g = window.__game, f = g.storySeams.feed; return { mode: g.story.mode, facts: Object.keys(g.story.facts()), stats: f && f.stats() }; });
  await B.fill('#coop-name', 'Ada'); await B.click('#coop-go');
  await B.waitForFunction(() => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 150000, polling: 250 });
  const g1 = await B.evaluate(async () => {
    const g = window.__game, s = g.story, f = g.storySeams.feed, ev = [];
    s.on('*', (e) => ev.push(e));
    g.step(1 / 30, 120);
    const sleep = g.walt.onSleep({ hours: 9, at: { hours: 7 } });
    let tr = null; try { g.trip.start({ ep: 25, foodDays: 1, canoe: 'aluminium' }); g.step(1 / 30, 30); g.trip.close('completed', 'came in', 25); tr = 'ok'; } catch (e) { tr = e.message; }
    try { g.outfitter.emit('store:enter', { ep: 25 }); g.outfitter.emit('walkout', { ep: 25 }); } catch { /* */ }
    g.step(1 / 30, 60);
    const book = (() => { try { return { found: g.walt.found, nb: s.state.notebook, inv: g.profile.inventory.count('waltnotebook', { reachable: false }) }; } catch (e) { return 'err:' + e.message; } })();
    return { mode: s.mode, facts: Object.keys(s.facts()), sleep, tr, ev: [...new Set(ev)], stats: f.stats(), book, stage: s.stage, flush: s.flush(), stored: g.store.getItem('bwca-canoe:story2') };
  });
  result('C1 the guest\'s story in the room: mirror, no facts, walt.onSleep refuses, nothing flushed', g1.mode === 'mirror' && !g1.facts.length && !g1.sleep && g1.flush === false, { pre, g1: { ...g1, stored: g1.stored && g1.stored.slice(0, 200) } });
  result('C2 the guest\'s own story2 untouched while visiting', g1.stored === own0, { same: g1.stored === own0 });
  const host = await A.evaluate(() => ({ mode: window.__game.story.mode, facts: Object.keys(window.__game.story.facts()) }));
  result('C3 the host stays live (its own facts only)', host.mode === 'live' && !host.facts.includes('crews.seen'), host);
  // the guest leaves: the reload into their own season, its story as it was
  const nav = B.waitForNavigation({ timeout: 120000 }).catch(() => null);
  await B.evaluate(() => window.__game.coop.leave()); await nav; await booted(B);
  await B.waitForTimeout(1500);
  const back = await B.evaluate(() => { const g = window.__game, s = g.story; return { v: s.v, mode: s.mode, season: g.profile.seasonId, found: s.has && s.has('nb.found'), crews: s.has && s.has('crews.seen'), role: g.coop.role, url: location.search, stored: g.store.getItem('bwca-canoe:story2') }; });
  result('C4 the guest back home: live, own season, nb.found + crews.seen', back.v === 2 && back.mode === 'live' && back.season === ownSeason && back.found && back.crews, { ...back, stored: back.stored && back.stored.slice(0, 150) });
} catch (e) { result('rig ran to the end', false, { error: String(e && e.stack || e).slice(0, 1500) }); }
finally { for (const b of browsers) { try { await b.close(); } catch { /* */ } } }
result('no page errors', !errors.length, { errors: errors.slice(0, 10) });
const pass = results.filter((r) => r.pass).length;
writeFileSync(path.join(OUT, 'chk-coop.json'), JSON.stringify({ pass, total: results.length, results }, null, 1));
log(`chk-coop: ${pass}/${results.length} PASS`);
