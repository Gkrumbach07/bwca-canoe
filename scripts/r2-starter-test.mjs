// The start round's acceptance (2026-11-05: weather at the start, a starter route per outfitter). Headless Chromium
// against a running Vite, each check printed PASS or FAIL:
//   1 the routes: each of the fourteen hosting outfitters has one in src/starter-routes.json, for this release; its site
//     exists, is reached by water from the put-in again (the picker's own search, scripts/r2-starter-routes.mjs PAGE)
//     with the same carries (150 rods at most in all: Round Lake and Poplar Lake have no site short of a carry), 0.8–7
//     km, a quiet site (≤ 36 party nights of 84 a summer: every Moose Lake site is busier than 30); teleported there: a tent pad and a fire ring, and the
//     canoe afloat at its landing
//   2 a new season at three outfitters: the keeper's last word suggests the first night out, the way is pencilled on the
//     map (map-book marks: a starter note with its line; the HUD's marks), the 'starter' notice is held with three days;
//     once only (the keeper's talk at home offers it no more)
//   3 another outfitter, first visit: the keeper's first choice is the first night out; taken; the pencil is there
//   4 the starter trip played at one: pushed off with the first permit, paddled for real toward the site (W held), the
//     site's grate, latrine and pad looked over at their prompts, a night in the tent, back in at the home dock: the tally
//     pays the notice
//   5 the start weather: over 20 seeded season starts some rain or overcast in the first three days, and with the first
//     trip's window no storm and no whitecap wind (the same starts unheld have storms or a hard wind, so the cap bites)
//
//   npx vite --port 5204 --strictPort &
//   APP=http://localhost:5204 node scripts/r2-starter-test.mjs [--shots dir] [--only seasons]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { PAGE } from './r2-starter-routes.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5204';
const SHOTS = arg('shots', null);
const ONLY = arg('only', null); // (iterating: --only seasons skips the routes' and the weather's checks)
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
const shot = async (page, name) => { if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch (e) { log('shot', name, e.message); } } };
const ROUTES = JSON.parse(readFileSync(path.resolve('src/starter-routes.json'), 'utf8'));

const HELPERS = () => {
  const g = window.__game, H = window.__r2 = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  // the talk: choose `pick(node)` (an index; 0 by default) until it ends, the lines said kept
  H.talkThrough = async (pick = () => 0, most = 14) => {
    const d = g.npcs.dialogue, said = [];
    for (let i = 0; i < most && d.convo; i++) { const n = d.convo.node; said.push(`${n.by || d.convo.name}: ${n.say}`); d.choose(pick(n, i)); await H.wait(30); }
    return { said, talking: d.talking };
  };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
async function openGame(name) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log(`[${name}] console`, m.text().slice(0, 300)); });
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.onboarding && window.__game.starter && window.__game.permits && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  log(`[${name}] loaded`);
  return page;
}
// a new season at an outfitter (the start map, July 10), the counter's talk through
async function newSeason(page, ep, doy = 191) {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${ep}"]`);
  await page.evaluate((doy) => { const w = window.__game.title.wizard; w.setDate(doy); w.next(); }, doy);
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  return page.evaluate(async () => {
    const g = window.__game, H = window.__r2, o = g.outfitter;
    if (o.open) o.hide();
    const L = o.layout(g.profile.home), at = L.counter || L.centre;
    H.standAt(at.x, at.z); g.day.setClock(g.day.year, g.day.doy, 9); H.step(30);
    o.openHot('counter', o.visit.landing);
    const r = await H.talkThrough();
    if (g.starter.pending) await g.starter.pending;
    H.step(5);
    const T = g.tasks, t = T.active.find((x) => x.kind === 'starter'), ep = g.profile.home;
    const marks = g.journal && g.journal.map ? g.journal.map.marks() : null, hm = g.hud.marks ? g.hud.marks() : null;
    return { ep, said: r.said, talking: r.talking, open: o.open, offered: g.starter.state.offered, task: t ? { id: t.id, status: t.status, due: T.dueOf(t), today: T.today(), pay: t.pay, site: t.site, from: t.from, title: t.title, text: t.text } : null,
      notes: g.starter.notes().map((n) => ({ kind: n.kind, ep: n.ep, way: n.way.length, by: n.by })), bookNotes: marks ? marks.notes.filter((n) => n.kind === 'starter').length : null, hudNotes: hm ? hm.notes.filter((n) => n.kind === 'starter' && Array.isArray(n.way)).length : null,
      ring: marks ? marks.open.filter((m) => t && m.id === t.id).length : null, gentle: g.weather.gentle, seed: g.weather.seed };
  });
}

try {
  const EPS = [51, 64, 49, 69, 40, 38, 36, 67, 25, 31, 6, 16, 1, 12];
  // --- 1 the routes ----------------------------------------------------------------------------------------------------
  const page = await openGame('routes');
  const meta = await page.evaluate(() => ({ eps: window.__game.outfitters.OUTFITTER_EPS.slice(), baked: window.__game.world.meta.source.baked }));
  result('1a a route for each of the fourteen hosting outfitters, for this release', meta.eps.length === 14 && meta.eps.every((e) => ROUTES.routes[e]) && ROUTES.for === meta.baked, { missing: meta.eps.filter((e) => !ROUTES.routes[e]), for: ROUTES.for, baked: meta.baked });
  await page.evaluate(PAGE);
  const checks = [];
  for (const ep of ONLY === 'seasons' ? [] : meta.eps.length ? meta.eps : EPS) {
    const r = ROUTES.routes[ep];
    if (!r) { checks.push({ ep, ok: false, why: 'no route' }); continue; }
    const c = await page.evaluate(async ([ep, r]) => {
      const g = window.__game, w = g.world, S = window.__starter, e = w.entryPoints.find((x) => x.ep === ep), s = w.campsites[r.site], H = window.__r2;
      if (!s) return { ok: false, why: 'no site' };
      const key = s.key || `${Math.round(s.x)}:${Math.round(s.z)}`;
      await S.search({ x: e.x, z: e.z }, 6500);
      const A = s.access, way = S.wayTo(A && A.landing ? A.landing[0] : s.x, A && A.landing ? A.landing[1] : s.z);
      if (!way) return { ok: false, why: 'not reached by water' };
      // there: the layout (a tent pad, a fire ring), and the canoe afloat at its landing
      if (g.title.state === 'title') g.title.close();
      if (g.outfitter.open) g.outfitter.hide();
      const lx = A && A.landing ? A.landing[0] : s.x, lz = A && A.landing ? A.landing[1] : s.z;
      await g.player.teleport(lx, lz); await H.settle();
      for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); }
      const L = s.layout, p = g.player;
      return { ok: true, key, keyOk: key === r.key, km: way.km, carries: way.portages.map((q) => q.rods), carriesData: (r.portages || []).map((q) => q.rods), pad: !!(L && L.pad), fire: !!(L && L.fire), afloat: p.mode === 'paddle', dGot: Math.round(Math.hypot(p.x - lx, p.z - lz)), lake: r.lake, nights: r.nights };
    }, [ep, r]);
    c.ep = ep;
    c.pass = c.ok && c.keyOk && c.pad && c.fire && c.afloat && c.km >= 0.8 && c.km <= 7 && c.carries.length === c.carriesData.length && c.carries.reduce((a, b) => a + b, 0) <= 150 && r.nights <= 36;
    checks.push(c);
    log('  route', ep, JSON.stringify(c));
  }
  if (ONLY !== 'seasons') result('1b every route: the site there, reached by water again with the same carries (150 rods at most in all), 0.8–7 km, a quiet site; a tent pad and a fire ring; afloat at its landing', checks.every((c) => c.pass), { bad: checks.filter((c) => !c.pass) });
  if (ONLY !== 'seasons') result('1c most routes have no carry at all, and at most one where its water has a site past one short carry', checks.filter((c) => c.carries && !c.carries.length).length >= 10, { carries: checks.map((c) => [c.ep, c.carries]) });

  // --- 5 the start weather ---------------------------------------------------------------------------------------------
  const wx = await page.evaluate(() => {
    const g = window.__game, W = g.weather, seed0 = W.seed, g0 = W.gentle, out = [];
    const DAY0 = (y) => Math.round(Date.UTC(y, 0, 1) / 86400000);
    const NAMES = ['clear', 'fair', 'overcast', 'fog', 'light-rain', 'rain', 'storm', 'building'];
    for (let k = 0; k < 20; k++) {
      const year = 2026, doy = 140 + k * 6, from = (DAY0(year) + doy - 1) * 24;
      W.setSeed(1000 + k * 7919);
      const sample = (gentle) => {
        W.gentle = gentle ? { from, to: from + 72 } : null;
        const states = new Set(); let storm = 0, maxWind = 0, wet = 0;
        for (let h = 0; h < 72; h++) {
          const hy = (doy - 1) * 24 + h, f = W._hour(year, hy), dd = doy + Math.floor(h / 24), hr = h % 24;
          const base = W.dayBreeze(year, dd, hr), wind = Math.max(f.min, base * f.mul);
          states.add(NAMES[f.s]); if (f.s === 6 || f.s === 7) storm++; if (f.s === 4 || f.s === 5 || f.s === 2 || f.s === 3) wet++;
          maxWind = Math.max(maxWind, wind * (1 + 0.25 * (f.gust || 1)));
        }
        return { states: [...states], storm, wet, maxWind: +maxWind.toFixed(1) };
      };
      out.push({ k, doy, held: sample(true), free: sample(false) });
    }
    W.setSeed(seed0); W.gentle = g0;
    return out;
  });
  const anyWet = wx.filter((s) => s.held.wet > 0).length, stormsHeld = wx.reduce((a, s) => a + s.held.storm, 0), maxHeld = Math.max(...wx.map((s) => s.held.maxWind));
  const freeBad = wx.filter((s) => s.free.storm > 0 || s.free.maxWind > 8).length;
  result('5a over 20 seeded season starts some begin grey, wet or foggy', anyWet >= 4, { anyWet, starts: wx.map((s) => `${s.doy}:${s.held.states.join('/')}`) });
  result('5b and with the first trip held kind: no storm, the wind under whitecaps (≤ 7 m/s with its gusts)', stormsHeld === 0 && maxHeld <= 7, { stormsHeld, maxHeld, freeBad, freeMax: Math.max(...wx.map((s) => s.free.maxWind)) });
  await page.context().close();

  // --- 2 new seasons at three outfitters; 3 another outfitter's keeper; 4 the starter trip at one ----------------------
  let played = false;
  for (const ep of [25, 38, 31]) {
    const P = await openGame(`season ${ep}`);
    const s = await newSeason(P, ep);
    const told = s.said.some((l) => /First night out\?/.test(l));
    result(`2 ${ep}: the keeper suggests the first night out; the way pencilled; the notice held, three days`, told && s.offered[ep] != null && s.task && s.task.status === 'open' && s.task.from === ep && s.task.due === s.task.today + 3 && s.notes.length === 1 && s.notes[0].way > 2 && s.bookNotes === 1 && s.hudNotes === 1 && s.ring === 1 && !s.talking && s.open, s);
    result(`2 ${ep}: the season's own sky, kind over the first days`, s.gentle && s.gentle.to - s.gentle.from === 72 && s.seed !== 23, { gentle: s.gentle, seed: s.seed });
    if (SHOTS) { await P.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); g.hud.openMap && g.hud.openMap(); window.__r2.step(5); }); await shot(P, `r2-map-${ep}`); }
    const again = await P.evaluate(() => { const g = window.__game, v = (g.npcs.roster(g.profile.home) || []).find((q) => q.keeper); return v ? g.npcs.kChoices(v).map((c) => c.text) : null; });
    result(`2 ${ep}: once only (the keeper offers it no more)`, Array.isArray(again) && !again.some((t) => /easy for a night/.test(t)), { again });

    if (ep === 38) {
      // 3 another outfitter: Sawbill's season, first visit to Homer Lake's keeper (40)
      const other = await P.evaluate(async () => {
        const g = window.__game, H = window.__r2, o = g.outfitter, ep = 40, e = o.entry ? o.entry(ep) : g.world.entryPoints.find((x) => x.ep === ep);
        if (o.open) o.hide();
        await o.onTeleport(e.x, e.z); await H.settle();
        for (let i = 0; i < 60 && !(g.npcs.roster(ep) || []).some((q) => q.keeper); i++) { H.step(15); await H.wait(60); }
        const v = (g.npcs.roster(ep) || []).find((q) => q.keeper);
        if (!v) return { error: 'no keeper' };
        const ch = g.npcs.kChoices(v), first = ch[0];
        const avail = g.starter.available(ep);
        const n1 = first.go();
        const d = { said: [n1.say], picks: [] };
        let n = n1.choices[0].go(); d.said.push(n.say); n = n.choices[0].go(); d.said.push(n.say);
        if (g.starter.pending) await g.starter.pending;
        const t = g.tasks.active.find((x) => x.kind === 'starter' && x.from === ep);
        return { avail, first: first.text, said: d.said, task: t ? { status: t.status, pay: t.pay } : null, notes: g.starter.notes().map((q) => q.ep), after: g.npcs.kChoices(v).map((c) => c.text) };
      });
      result('3 another outfitter, first visit: the keeper\'s first choice is the first night out, taken, pencilled', other.avail && /First time here/.test(other.first) && /First night out\?/.test(other.said[0]) && other.task && other.task.status === 'open' && other.notes.includes(40) && other.notes.includes(38) && !other.after.some((t) => /easy for a night/.test(t)), other);
    }

    if (ep === 25 && !played) {
      played = true;
      // 4 the starter trip: pushed off with the first permit, paddled for real toward the site
      const out = await P.evaluate(async () => {
        const g = window.__game, H = window.__r2, o = g.outfitter, home = g.profile.home, r = g.starter.route(home);
        if (o.open) o.hide();
        o.port = o.landing(home);
        const w0 = r.way[Math.min(2, r.way.length - 1)];
        await g.player.teleport(w0[0], w0[1]); await H.settle(); H.step(30);
        const p = g.player, x0 = p.x, z0 = p.z, inp = p.input, held = inp.held.bind(inp);
        // paddle along the pencilled way: steer at the next point, W held (60 game seconds a call, real frames)
        let k = 3, steps = 0;
        inp.held = (...c) => c.includes('KeyW') || held(...c);
        for (; steps < 40 && k < r.way.length; steps++) {
          const [tx, tz] = r.way[k]; if (Math.hypot(tx - p.x, tz - p.z) < 40) { k++; continue; }
          const want = Math.atan2(-(tz - p.z), tx - p.x); p.heading = want; p.yawRate = 0;
          H.step(30); await H.wait(5);
        }
        inp.held = held;
        return { active: g.trip.active, permit: g.trip.state.permit && g.trip.state.permit.id, dayUse: g.trip.state.dayUse, moved: Math.round(Math.hypot(p.x - x0, p.z - z0)), mode: p.mode, along: k, of: r.way.length };
      });
      result('4a pushed off with the first permit, paddled for real along the pencilled way', out.active && out.permit && !out.dayUse && out.moved > 80, out);
      const site = await P.evaluate(async () => {
        const g = window.__game, H = window.__r2, home = g.profile.home, r = g.starter.route(home), s = r.siteRec, A = s.access;
        await g.player.teleport(A && A.landing ? A.landing[0] : s.x, A && A.landing ? A.landing[1] : s.z); await H.settle();
        for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); }
        const t = g.tasks.active.find((x) => x.kind === 'starter' && x.from === home), L = s.layout, lat = L.latrine || (A && A.latrine);
        const parts = { grate: L.fire, latrine: lat, pad: L.pad }, prompts = {};
        for (const [k, q] of Object.entries(parts)) {
          if (!q) continue;
          H.standAt(q.x + 1.2, q.z + 0.6); g.player.prompt = null; H.step(4);
          prompts[k] = g.player.prompt ? g.player.prompt.text : null;
          if (g.tasks.inReach === t) { g.tasks.inReach = null; window.__game.taskKinds2.checkPart(t, k === 'grate' ? 'grate' : k); }
          else window.__game.taskKinds2.checkPart(t, k);
        }
        return { prompts, status: t.status, checks: t.checks, free: g.campsites.isFree(g.campsites.key(s)), i: r.site };
      });
      result('4b at the site: its grate, latrine and pad looked over (each its prompt), the notice done; the site free', site.status === 'done' && Object.values(site.prompts).filter((x) => /^Check the/.test(x || '')).length >= 2 && site.free, site);
      const night = await P.evaluate(async (i) => {
        const g = window.__game, H = window.__r2, c = g.world.campsites[i], L = c.layout, inv = g.profile.inventory, camp = g.camp, pad = L.pad;
        g.player.standAt({ x: pad.x + pad.fdx * 2.2, z: pad.z + pad.fdz * 2.2, heading: Math.atan2(-pad.fdx, pad.fdz), drop: { x: L.fire.x + 1.5, z: L.fire.z + 1.5, heading: 0 } });
        const pack = inv.containers.find((k) => k.item === 'waltpack'); pack.where = 'ground'; pack.at = { x: pad.x + pad.fdx * 1.6, z: pad.z + pad.fdz * 1.6 }; inv.emit('containers');
        H.step(30);
        const tent = camp.tentInReach(); if (!tent) return { error: 'no tent' };
        let s = null;
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1.5, 1.5], [-1.5, -1.5]]) { s = camp.ghostAt(c, tent.def.id, pad.x + dx, pad.z + dz, pad.fdx, pad.fdz); if (s && s.ok) break; }
        if (!s || !s.ok) return { error: 'no spot' };
        camp.stake(s, tent, c); camp.setStage(camp.camp, 4); camp.pitched();
        // (a wet first night: the notebook's night in the rain, the card read by headlamp)
        g.weather.set('rain'); H.step(5);
        g.energy.value = 1; g.day.setClock(g.day.year, g.day.doy, 21.5); g.camp.sleep('tent', 'first');
        let card = '';
        for (let k = 0; k < 40; k++) { H.step(60); await H.wait(10); const kick = document.getElementById('veil-kicker'); if (kick && /by headlamp/.test(kick.textContent)) card = document.getElementById('veil-text').textContent; if (!g.veil.active && !g.camp.night) break; }
        const rain = g.weather.state; g.weather.release();
        return { active: g.trip.active, hours: +g.day.hours.toFixed(1), notebook: g.story.state.notebook.found, rain, card: card.slice(0, 80) };
      }, site.i);
      result('4c a wet night in the tent at the site: the notebook found, its card read, the trip goes on', night.active && night.notebook && night.rain === 'rain' && night.card.length > 10, night);
      const back = await P.evaluate(async () => {
        const g = window.__game, H = window.__r2, o = g.outfitter, home = g.profile.home, m0 = g.profile.money, T = g.tasks, t = T.active.find((x) => x.kind === 'starter' && x.from === home);
        const r = g.starter.route(home), w1 = r.way[1];
        await g.player.teleport(w1[0], w1[1]); await H.settle(); H.step(30);
        // in at the home landing: ashore at the dock (as trip.comeIn when you land there)
        const l = o.landing(home);
        if (!o.visit || o.visit.ep !== home) { await o.onTeleport(l.x, l.z); await H.settle(); }
        H.step(30);
        if (g.trip.active && typeof g.trip.comeIn === 'function') g.trip.comeIn(home);
        for (let k = 0; k < 40 && !g.record.shown; k++) { H.step(30); await H.wait(30); }
        const c = g.record.s.trips.slice(-1)[0];
        return { active: g.trip.active, shown: !!g.record.shown, paid: g.profile.money - m0, pay: t ? t.pay : null, status: t ? t.status : 'gone', tally: c && c.tally ? { pay: c.tally.pay, total: c.tally.total } : null, gentle: g.weather.gentle, firstOut: g.starter.state.firstOut };
      });
      result('4d back in at home: the tally pays the first night\'s notice; the kind weather ends with the first trip', !back.active && back.shown && back.pay > 0 && back.paid >= back.pay && back.firstOut != null && back.gentle && back.gentle.to <= back.firstOut + 0.01, back);
      await shot(P, 'r2-tally');
    }
    await P.context().close();
  }
  result('no page errors', errors.length === 0, { errors });
} catch (e) {
  log('ERROR', e.stack || e.message);
  result('the run finished', false, { error: e.message });
} finally {
  const failed = results.filter((r) => !r.pass);
  log(`${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exitCode = failed.length ? 1 : 0;
}
