// chk-c1a.mjs: an adversarial playtest of claude/story-c1 (Round 1, story chapter 1) with ?story=1, as a new player at
// two homes (a moved store each: Bog Lake 67, Moose River North 16). Not a gate: it records every line the game says
// (talk, barks, notes, hints, cards, the cutscene, the pages read, the Walt page) for a story read, and probes the edges
// the slice rig does not: the counter by E, every P1 question, a walkout before night one and after dark, keys pressed
// through the cutscene, the book opened by I and its contents clicked, walking off Tauno mid-scene, the truck to EP 33
// clicked at the counter, the paddle's state after the real drive, the shelf (R1 "No thanks.", R1b, the topic), the
// cold porch (NB45 unread), X1 by keys, R3, Farm by evening and by morning.
//   APP=http://localhost:5661 node scripts/chk-c1a.mjs [--home1 67] [--home2 16] [--only A,B] [--out dir] [--shots dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { section as LAYER, HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T, choose, hear } from './slice/c1-talk.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const H1 = Number(arg('home1', 67)), H2 = Number(arg('home2', 16));
const OUT = path.resolve(String(arg('out', 'out-chk-c1a')));
const SHOTS = arg('shots', null) ? path.resolve(String(arg('shots'))) : null;
const APP = (process.env.APP || 'http://localhost:5661').replace(/\/$/, '');
const RELAY = '';
const ONLY = arg('only', null) ? new Set(String(arg('only')).split(',')) : null;
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [], notes = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };
const note = (name, more = {}) => { notes.push({ name, more }); log('NOTE', name, JSON.stringify(more).slice(0, 2400)); };
mkdirSync(OUT, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const browsers = [];
async function openGame(name, query = 'story=1') {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(browser);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /story|book|walt|layer|pencil|talk|cast/i.test(m.text()))) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  const q = [RELAY ? `relay=${encodeURIComponent(RELAY)}` : '', query].filter(Boolean).join('&');
  await page.goto(`${APP}/${q ? '?' + q : ''}`, { timeout: 180000 });
  await booted(page);
  log(`[${name}] loaded`);
  return page;
}
const booted = (page) => page.waitForFunction(() => window.__game && window.__game.title && window.__game.story && (window.__game.title.state === 'title' || window.__game.title.state === 'game') && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
const newSeason = async (page, home, doy = 175) => {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting && window.__game.storySeams && window.__game.storySeams.feed && window.__game.book && window.__game.storyTalk && window.__game.pencil, null, { timeout: 200000, polling: 250 });
  await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(HELPERS_J);
};
const harnessB = (page, state = {}) => ({
  page, log, result, state,
  step: (n) => page.evaluate((n) => window.__L.step(Math.round(n)), n),
  until: (fn, a, ms = 120000) => page.waitForFunction(fn, a, { timeout: ms, polling: 250 }),
  shot: async (name) => { if (!SHOTS) return; try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch { /* a nicety */ } },
});
const shot = async (page, name) => { if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch { /* a nicety */ } } };
const facts = (page, keys) => page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, window.__game.story.has(k)])), keys);

// --- the join's own helpers in the page (window.__J): walking a route by the keys, E on a person ---------------------
const HELPERS_J = () => {
  const g = window.__game, J = window.__J = {}, L = window.__L, T = window.__t;
  // a store's door as waypoints: from outside (in front of the steps) to the door to inside, or the reverse
  J.route = (ep, dir, side = 0) => {
    const S = g.outfitter.layout(ep); if (!S) return null;
    const a = S.axes.a, b = S.axes.b, d = S.door, f0 = S.stepsFoot || { x: d.x + b.x * 2, z: d.z + b.z * 2 };
    const foot = { x: f0.x + a.x * side, z: f0.z + a.z * side }; // (a step to one side: someone standing at the foot)
    const outside = { x: foot.x + b.x * 2.5, z: foot.z + b.z * 2.5 }, inside = { x: d.x - b.x * 3, z: d.z - b.z * 3 };
    return dir === 'in' ? [outside, foot, d, inside] : [inside, d, foot, { x: foot.x + b.x * 4, z: foot.z + b.z * 4 }];
  };
  // the player as the slice wants them between places: fed and watered, rested (the rig skips the meals; the pack is left
  // where night one left it: on the back, the canoe would not paddle)
  J.refresh = () => {
    const e = g.energy; e.fresh(); e.bunk(); e.value = 1; // (a night in a bunk, breakfast, a full bottle: the bar full again)
    if (g.player.seat) { g.player.seat = null; } // (up off a bench: Farm's porch sat the player down for the turn)
    return +e.value.toFixed(2);
  };
  J.at = () => ({ x: g.player.x, z: g.player.z, inside: !!(g.outfitter.visit && g.outfitter.visit.inside), mode: g.player.mode });
  J.face = (q) => { const yaw = L.yawTo(q); L.look(yaw); g.player.heading = yaw; };
  J.convo = () => T.convo();
  return true;
};
// walk a store's door by the keys (W held, steered at each waypoint): → { ok, inside, via }
async function walkDoor(page, ep, dir) {
  await page.evaluate(() => { const j = window.__game.journal; if (j.open) j.close(); window.__J.refresh(); window.__L.step(2); });
  const tries = [];
  for (const side of [0, 1.3, -1.3]) {
    const route = await page.evaluate(([ep, dir, side]) => window.__J.route(ep, dir, side), [ep, dir, side]);
    if (!route) return { ok: false, why: 'no store layout' };
    await page.evaluate((p) => { window.__L.standAt(p.x, p.z, 0); window.__J.face(p); window.__L.step(4); }, route[0]);
    let st = null, stuck = null;
    for (let w = 1; w < route.length && !stuck; w++) {
      await page.keyboard.down('w');
      let best = Infinity, still = 0;
      for (let k = 0; k < 90; k++) {
        st = await page.evaluate((q) => { window.__J.face(q); window.__L.step(3); const a = window.__J.at(); return { ...a, d: Math.hypot(q.x - a.x, q.z - a.z) }; }, route[w]);
        if (st.d < 0.7) break;
        if (st.d < best - 0.05) { best = st.d; still = 0; } else if (++still > 12) { stuck = { w, d: +st.d.toFixed(2) }; break; }
      }
      await page.keyboard.up('w');
    }
    await page.evaluate(() => window.__L.step(10));
    st = await page.evaluate(() => window.__J.at());
    const ok = dir === 'in' ? st.inside : !st.inside;
    tries.push({ side, stuck, inside: st.inside });
    if (ok) return { ok: true, inside: st.inside, via: side ? `keys (a step to the side: ${side} m)` : 'keys', tries };
  }
  await page.evaluate(([ep, dir]) => (dir === 'in' ? window.__t.walkIn(ep) : window.__t.walkOut(ep)), [ep, dir]);
  return { ok: false, via: 'api (the walk stuck)', tries };
}
// E on a person (the dot on them); the talk opened as E opens it, else through npcs.talkTo: → { ok, via }
async function talkE(page, key) {
  const f = await page.evaluate((key) => { const f = window.__t.figure(key); if (!f) return null; window.__L.face({ x: f.x, z: f.z }, 1.7, f.y + 1.45); window.__L.step(4); return f; }, key);
  if (!f) return { ok: false, why: `no figure ${key}` };
  const want = await page.evaluate((key) => { const n = window.__game.npcs, v = n && typeof n.find === 'function' ? n.find(key) : null; return v ? v.name || null : null; }, key);
  await page.keyboard.press('e');
  let other = null;
  for (let k = 0; k < 10; k++) {
    const c = await page.evaluate(() => { window.__L.step(2); return window.__t.convo(); });
    if (c) { const mine = /^cast:tauno/.test(key) ? /old man|Tauno/i.test(c.who || '') : /^cast:josie/.test(key) ? /Josie/.test(c.who || '') : !want || c.who === want; if (mine) return { ok: true, via: 'E' }; other = c.who; break; }
    await page.waitForTimeout(60);
  }
  if (other) await endTalk(page); // (the dot was on someone else: a visitor stood between)
  await page.evaluate((k) => window.__t.talkTo(k), key);
  for (let k = 0; k < 25; k++) { if (await page.evaluate(() => { window.__L.step(2); return !!window.__t.convo(); })) return { ok: true, via: other ? `api (E found ${other} in the way)` : 'api (E did not open it)' }; await page.waitForTimeout(100); }
  return { ok: false, via: 'neither E nor the API opened it' };
}
// the store's keeper, once the roster has settled (E on them)
async function keeperE(page, ep) {
  let key = null;
  for (let k = 0; k < 40 && !key; k++) { key = await page.evaluate((e) => { window.__L.step(5); return window.__t.keeperKey(e); }, ep); if (!key) await page.waitForTimeout(80); }
  return key ? talkE(page, key) : { ok: false, why: 'no keeper in the roster' };
}
// "Ask about…" shows three story topics, the newest part of the story first (topics.js): the topics above the one wanted
// are asked first, as a player would, each by its number; → { ok, asked: [texts] }
// A keeper draws two rings a conversation at most (topics.js): before a third ring topic the talk is ended and taken up
// again an hour later (reopen), as a player would come back to the counter
const RINGS = /^(Can you ring|And Bald Eagle|Where's Farm|Who goes in at Sawbill|Walt's sister's|Ever hear a lake called)/;
async function dig(page, want, { max = 14, reopen = null } = {}) {
  const asked = [], EXIT = /^(That’s all\.|That's all\.|Goodbye\.|…)$/;
  let rings = 0;
  for (let k = 0; k < max; k++) {
    const c = await page.evaluate(() => window.__t.convo());
    if (!c) return { ok: false, why: 'no conversation', asked };
    const i = c.choices.findIndex((t) => t.startsWith(want));
    if (i >= 0 && RINGS.test(want) && rings >= 2 && reopen) { await reopen(); rings = 0; asked.push('(a new talk)'); continue; }
    if (i >= 0) { await page.keyboard.press(`Digit${i + 1}`); await page.waitForTimeout(60); return { ok: true, asked }; }
    const ask = c.choices.findIndex((t) => /^Ask about/.test(t));
    if (ask >= 0) { await page.keyboard.press(`Digit${ask + 1}`); await page.waitForTimeout(60); continue; }
    if (c.choices.length === 1 && c.choices[0] === '…') { await page.keyboard.press('Digit1'); await page.waitForTimeout(60); continue; }
    const j = c.choices.findIndex((t) => !EXIT.test(t) && !asked.includes(t) && !/^Lake One, Two/.test(t));
    if (j < 0) return { ok: false, why: `no "${want}" in [${c.choices.join(' | ')}]`, asked };
    if (RINGS.test(c.choices[j])) { if (rings >= 2 && reopen) { await reopen(); rings = 0; asked.push('(a new talk)'); continue; } rings++; }
    asked.push(c.choices[j]); await page.keyboard.press(`Digit${j + 1}`); await page.waitForTimeout(60); await hear(page, 6);
  }
  return { ok: false, why: 'too many topics', asked };
}
async function picks(page, list) {
  const out = [];
  for (const p of list) { const r = await choose(page, p); out.push(r); if (!r.ok) return { ok: false, at: p, r, out }; }
  return { ok: true, out };
}
async function endTalk(page) {
  for (let k = 0; k < 10; k++) { const c = await page.evaluate(() => window.__t.convo()); if (!c) break; await page.keyboard.press('Escape'); await page.waitForTimeout(80); }
  await page.evaluate(() => window.__L.step(30)); // (the goodbye said, the person back to their seat, before the next talk or walk)
}
async function readSpread(page, nb, secs = 3.6) {
  await page.evaluate((nb) => { const g = window.__game, b = g.book; if (!g.journal.open) g.journal.show('pack'); g.journal.setSide('walt'); b.view = 'nb'; b.debug.spread(b.debug.spreadOf(nb)); }, nb);
  await page.evaluate((n) => window.__L.step(n), Math.round(secs * 30));
  return page.evaluate((nb) => window.__game.story.nbHas('read', nb), nb);
}
const closeBook = (page) => page.evaluate(() => { const j = window.__game.journal; if (j.open) j.close(); window.__L.step(3); }); // (an open book eats W)
const clockTo = (page, h, dd = 0) => page.evaluate(([h, dd]) => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy + dd, h); window.__L.step(4); }, [h, dd]);
async function goStore(page, ep) {
  await page.evaluate(async (ep) => {
    const g = window.__game, L = window.__L, l = g.outfitter.landing(ep);
    if (Math.hypot(g.player.x - l.x, g.player.z - l.z) > 120) { await g.player.teleport(l.x, l.z); await L.settle(); }
    for (let k = 0; k < 150 && !g.outfitter.layout(ep); k++) { L.step(10); await L.wait(60); }
    const S = g.outfitter.layout(ep); // (the store's own tiles in, its steps and porch collidable, before anyone walks them)
    if (S && g.tiles.ensure) { try { await g.tiles.ensure(S.door.x, S.door.z, 120); } catch { /* */ } }
    for (let k = 0; k < 60 && S && g.tiles.readyAt && !g.tiles.readyAt(S.door.x, S.door.z); k++) { L.step(5); await L.wait(60); }
    L.step(20);
  }, ep);
}
async function taunoWalkout(page, ep) {
  const out = await walkDoor(page, ep, 'out');
  await page.evaluate(() => window.__L.step(30));
  const t = await page.evaluate(() => window.__t.tauno());
  return { out, t };
}

// =====================================================================================================================
// the recorder: every line the game says, in order (talk nodes, barks and talk lines as dialogue remembers them, notes,
// hints, chips, place titles, veil cards)
const REC = () => {
  const g = window.__game; if (window.__REC) return true;
  const R = window.__REC = [];
  const t = () => { const d = g.day; return d ? `${d.doy}:${d.hours.toFixed(2)}` : ''; };
  const wrap = (obj, fn, kind, pick) => { if (!obj || typeof obj[fn] !== 'function' || obj[fn].__rec) return; const f = obj[fn].bind(obj); obj[fn] = (...a) => { try { const v = pick(...a); if (v) R.push([kind, t(), ...v]); } catch { /* */ } return f(...a); }; obj[fn].__rec = 1; };
  const D = g.dialogue;
  wrap(D, 'remember', 'line', (name, role, text) => [name, text]);
  wrap(D, 'showNode', 'node', (n) => (n && typeof n.then !== 'function' ? [n.by || (D.convo && D.convo.name) || '', n.say || '', (n.choices || []).map((c) => c.text)] : null));
  wrap(D, 'choose', 'pick', (i) => { const c = D.convo; const ch = c && c.node && c.node.choices && c.node.choices[i]; return ch ? [ch.text] : null; });
  wrap(g.hud, 'note', 'note', (text) => [String(text)]);
  wrap(g.hud, 'showPlace', 'place', (k, n, s) => [k, n, s]);
  wrap(g.hints, 'show', 'hint', (m, text) => [m && (m.id || m), String(text)]);
  wrap(g.chip, 'set', 'chip', (key, what) => [key, typeof what === 'string' ? what : JSON.stringify(what)]);
  wrap(g.veil, 'card', 'card', (c) => [c.kicker || '', c.text || '', c.sub || '']);
  return true;
};
const recTake = (page) => page.evaluate(() => { const R = window.__REC || []; const out = R.slice(); R.length = 0; return out; });
const transcript = {};
async function rec(page, key) { const r = await recTake(page); (transcript[key] = transcript[key] || []).push(...r); return r; }
const state = (page) => page.evaluate(() => { const g = window.__game, p = g.player; return { x: Math.round(p.x), z: Math.round(p.z), mode: p.mode, speed: +(p.speed || 0).toFixed(2), carry: p.carry ? { drop: !!p.carry.drop, trail: !!p.carry.trail } : null, doy: g.day.doy, h: +g.day.hours.toFixed(2), money: g.profile.money, stage: g.story.stage, journal: g.journal.open, talk: !!(g.dialogue && g.dialogue.convo) }; });
const staged = (page) => page.evaluate(() => window.__t.staged().map((s) => ({ who: s.who, ep: s.ep, slot: s.slot })));
const pressDigitFor = async (page, prefix) => choose(page, prefix);
// a P1 / any talk: press through every "…" and record each node; stop at a node with real choices
async function seeChoices(page) { await hear(page, 14); return page.evaluate(() => window.__t.convo()); }

// E at the counter with the dot on it, aimed from a few spots inside: → { ok, via, tried }
async function counterE(page) {
  const tried = [];
  for (const [d, side] of [[1.6, 0], [2.2, 0], [1.2, 0], [1.8, 0.8], [1.8, -0.8], [2.6, 0]]) {
    const t = await page.evaluate(([d, side]) => {
      const g = window.__game, v = g.outfitter.visit; if (!v || !v.L) return { why: 'no visit' };
      const h = (v.L.hot || []).find((k) => k.key === 'counter'); if (!h) return { why: 'no counter hotspot', keys: (v.L.hot || []).map((k) => k.key) };
      const c = v.L.centre, ax = c.x - h.x, az = c.z - h.z, n = Math.hypot(ax, az) || 1, ux = ax / n, uz = az / n;
      const x = h.x + ux * (d + (h.hx || 0)) - uz * side, z = h.z + uz * (d + (h.hx || 0)) + ux * side;
      window.__L.standAt(x, z, 0); window.__L.step(4); window.__L.aim({ x: h.x, z: h.z }, h.y); window.__L.step(4);
      const t = g.pointer && g.pointer.target; const p = g.player;
      return { at: [Math.round(x - h.x), Math.round(z - h.z)], inside: !!v.inside, onFoot: p.onFoot, t: t ? { ref: t.ref || null, label: t.label || '', verb: t.e ? t.e.verb : t.verb || null } : null };
    }, [d, side]);
    tried.push({ d, side, ...t });
    if (t && t.t && t.t.ref === 'counter') { await page.keyboard.press('e'); for (let k = 0; k < 20; k++) { if (await page.evaluate(() => { window.__L.step(3); return !!window.__t.convo() || !!window.__game.outfitter.open; })) return { ok: true, via: 'E', tried }; await page.waitForTimeout(60); } return { ok: false, via: 'E pressed, nothing opened', tried }; }
  }
  // E on Josie (the tracker's "Talk to Josie at the counter."), the dot on her
  const sk = await page.evaluate(() => { const g = window.__game, ep = g.outfitter.visit.landing.ep, k = `staffer:${ep}`; return window.__t.figure(k) ? k : null; });
  if (sk) {
    const r = await talkE(page, sk); const c = await page.evaluate(() => window.__t.convo());
    if (c) return { ok: r.via === 'E', via: `E on Josie: ${r.via}`, first: c, tried };
  }
  // E on the keeper, with the dot on them
  const kk = await page.evaluate(() => window.__t.keeperKey(window.__game.outfitter.visit.landing.ep));
  if (kk) {
    const r = await talkE(page, kk); const c = await page.evaluate(() => window.__t.convo());
    // the keeper's own talk: "The counter, please" (as a player would), then is it P1?
    const i = c ? c.choices.findIndex((t) => /^The counter, please/.test(t)) : -1;
    let after = null;
    if (i >= 0) { await page.keyboard.press(`Digit${i + 1}`); for (let k = 0; k < 15; k++) { await page.evaluate(() => window.__L.step(3)); after = await page.evaluate(() => window.__t.convo()); if (after && after.say !== c.say) break; await page.waitForTimeout(60); } }
    const p1 = !!(after && (after.who === 'Josie' || /Josie|Rental/.test(after.say || '')));
    if (!p1) await endTalk(page);
    return { ok: p1, via: `the dot never on the counter; E on the keeper (${r.via}) opens their own talk; "The counter, please" ${p1 ? 'opens P1' : 'does not open P1'}`, keeperTalk: c, after, tried };
  }
  return { ok: false, via: 'the dot never on the counter', tried };
}

async function nightAt(page, { keys = false } = {}) {
  const site = await page.evaluate(async () => {
    const g = window.__game, home = g.outfitter.landing(g.profile.home);
    const near = g.world.campsites.map((c) => ({ c, d: Math.hypot(c.x - home.x, c.z - home.z) })).filter((q) => q.d > 400).sort((a, b) => a.d - b.d).slice(0, 12);
    for (const { c } of near) {
      if (!g.campsites.isFree(g.campsites.key(c))) continue;
      await g.player.teleport(c.x, c.z);
      for (let i = 0; i < 40 && !c.layout; i++) { g.step(1 / 30, 10); await new Promise((r) => setTimeout(r, 100)); }
      if (c.layout && c.layout.pad && g.campsites.isFree(g.campsites.key(c))) return { i: g.world.campsites.indexOf(c), name: c.name || null, lake: c.lake || null };
    }
    return null;
  });
  if (!site) return { error: 'no site' };
  await page.waitForFunction(() => !window.__game.player.teleporting, null, { timeout: 60000 });
  const pitched = await page.evaluate((i) => {
    const g = window.__game, c = g.world.campsites[i], L = c.layout, inv = g.profile.inventory, p = g.player, camp = g.camp, pad = L.pad;
    p.standAt({ x: pad.x + pad.fdx * 2.2, z: pad.z + pad.fdz * 2.2, heading: Math.atan2(-pad.fdx, pad.fdz), drop: { x: L.fire.x + 1.5, z: L.fire.z + 1.5, heading: 0 } });
    const pack = inv.containers.find((k) => k.item === 'waltpack'); if (pack) { pack.where = 'ground'; pack.at = { x: pad.x + pad.fdx * 1.6, z: pad.z + pad.fdz * 1.6 }; inv.emit('containers'); }
    g.step(1 / 30, 30);
    const tent = camp.tentInReach(); if (!tent) return { error: 'no tent in reach', carried: g.walt.carried() };
    let s = null;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1.5, 1.5], [-1.5, -1.5]]) { s = camp.ghostAt(c, tent.def.id, pad.x + dx, pad.z + dz, pad.fdx, pad.fdz); if (s && s.ok) break; }
    if (!s || !s.ok) return { error: `no spot: ${s && s.why}` };
    if (!camp.stake(s, tent, c) || !camp.camp) return { error: 'not staked' };
    camp.setStage(camp.camp, 4); camp.pitched();
    return { item: camp.camp.item, carried: g.walt.carried() };
  }, site.i);
  const before = await state(page);
  await page.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 21.5); g.camp.sleep('tent', 'first'); });
  const beats = [], pressed = [];
  let cut = false;
  for (let k = 0; k < 900; k++) {
    await page.evaluate(() => window.__L.step(6));
    const st = await page.evaluate(() => { const g = window.__game, c = g.walt.cut; return { active: !!(c && c.active), beat: c && c.beat, t: c && c.t, night: !!g.camp.night, veil: !!g.veil.active, lit: (document.querySelector('#nightone .lit') || {}).textContent || '', page: ((document.querySelector('#nightone .no-page') || {}).textContent || '').slice(0, 1400) }; });
    if (st.active) { cut = true; if (!beats.length || beats[beats.length - 1].beat !== st.beat) beats.push({ beat: st.beat, lit: st.lit.slice(0, 300) }); }
    // the adversary: real keys mid-cutscene (the book, Escape, W held, the map, E)
    if (keys && st.active && st.beat === 'cut.5' && !pressed.length) {
      for (const key of ['i', 'Escape', 'm', 'e', 'Tab']) { await page.keyboard.press(key); await page.evaluate(() => window.__L.step(3)); pressed.push({ key, beat: await page.evaluate(() => window.__game.walt.cut.beat), journal: await page.evaluate(() => window.__game.journal.open) }); }
      await page.keyboard.down('w'); await page.evaluate(() => window.__L.step(30)); await page.keyboard.up('w');
      pressed.push({ key: 'w held 1 s', at: await state(page) });
    }
    if (st.active && st.beat === 'cut.11' && st.t > 6) { beats[beats.length - 1].page = st.page; await page.keyboard.press('Space'); }
    if (cut && !st.active && !st.night && !st.veil) break;
  }
  const after = await state(page);
  const f = await page.evaluate(() => ({ found: window.__game.story.has('nb.found'), cut: !!(window.__game.walt.cut && window.__game.walt.cut.active) }));
  return { site, pitched, cut, beats, pressed, before, after, f };
}

// the book by real input: I, the Walt tab, the contents row clicked; the page held open `secs`
async function readByClicks(page, nb, secs = 3.6) {
  const out = {};
  out.open0 = await page.evaluate(() => window.__game.journal.open);
  if (!out.open0) { await page.keyboard.press('i'); await page.evaluate(() => window.__L.step(4)); }
  out.open = await page.evaluate(() => window.__game.journal.open);
  const tab = await page.$('#journal .book-tab.w');
  out.tab = !!tab && await tab.isVisible();
  if (out.tab) { await tab.click(); await page.evaluate(() => window.__L.step(3)); }
  out.side = await page.evaluate(() => window.__game.journal.side);
  // the notebook view (the Walt page may be what opens)
  await page.evaluate(() => { const b = window.__game.book; if (b.view !== 'nb') { const t = document.querySelector('#journal .side.w [data-view="nb"], #journal .side.w .nbw-tonb'); if (t) t.click(); else { b.view = 'nb'; b.render(true); } } window.__L.step(2); });
  const spread = await page.evaluate((nb) => window.__game.book.debug.spreadOf(nb), nb);
  const row = await page.$(`#journal .side.w .nbw-strip [data-nbgo="${spread}"]`);
  out.row = !!row;
  if (row) { await row.scrollIntoViewIfNeeded().catch(() => {}); await row.click().catch((e) => { out.clickErr = String(e).slice(0, 200); }); }
  await page.evaluate((n) => window.__L.step(n), Math.round(secs * 30));
  out.read = await page.evaluate((nb) => window.__game.story.nbHas('read', nb), nb);
  out.text = await page.evaluate((nb) => { const el = document.querySelector(`#journal .side.w [data-nb="${nb}"]`); return el ? el.innerText.slice(0, 1800) : null; }, nb);
  out.label = await page.evaluate((s) => { const el = document.querySelector(`#journal .side.w .nbw-strip [data-nbgo="${s}"]`); return el ? el.innerText.trim().slice(0, 120) : null; }, spread);
  return out;
}

const waltPage = (page) => page.evaluate(() => {
  const g = window.__game, b = g.book; g.journal.show('pack'); g.journal.setSide('walt'); b.view = 'walt'; b.render(true);
  const el = document.querySelector('#journal .side.w');
  const r = { head: (el.querySelector('.cb-head') || {}).textContent || '', text: el.innerText.slice(0, 5000), lines: [...el.querySelectorAll('.cb-line')].map((n) => (n.classList.contains('struck') ? '~' : '') + n.textContent), chips: [...el.querySelectorAll('[data-nbchip]')].map((n) => n.dataset.nbchip) };
  g.journal.close(); return r;
});
const markedTab = (page) => page.evaluate(() => { const g = window.__game, mb = g.journal.map; g.journal.showMap(); mb.tab = 'marked'; mb.render(true); const el = document.querySelector('.mb-marked'); const t = el ? el.innerText : ''; g.journal.close(); return t.slice(0, 2500); });

// the store reached with the frames stepped while the teleport waits (a plain await hung in season A after the book was
// opened by I): → { ok, ms, stepped, state }
async function goStore2(page, ep) {
  return page.evaluate(async (ep) => {
    const g = window.__game, L = window.__L, l = g.outfitter.landing(ep), t0 = performance.now();
    const st = () => ({ tele: g.player.teleporting, title: g.title.state, journal: g.journal.open, veil: !!(g.veil && g.veil.active), mode: g.player.mode, paused: !!(g.player.input && g.player.input.paused), talk: !!(g.dialogue && g.dialogue.convo), open: !!g.outfitter.open });
    const before = st();
    let done = false, stepped = 0;
    if (Math.hypot(g.player.x - l.x, g.player.z - l.z) > 120) {
      const pr = g.player.teleport(l.x, l.z).then(() => { done = true; }, () => { done = true; });
      for (let k = 0; k < 1200 && !done; k++) { await L.wait(50); if (k > 20) { L.step(2); stepped++; } }
      void pr;
    } else done = true;
    await L.settle();
    for (let k = 0; k < 150 && !g.outfitter.layout(ep); k++) { L.step(10); await L.wait(60); }
    const S = g.outfitter.layout(ep);
    if (S && g.tiles.ensure) { try { await Promise.race([g.tiles.ensure(S.door.x, S.door.z, 120), L.wait(20000)]); } catch { /* */ } }
    L.step(20);
    return { ok: done && !!S, ms: Math.round(performance.now() - t0), stepped, before, after: st() };
  }, ep);
}

// =====================================================================================================================
async function seasonA() {
  const A = await openGame('A');
  const ep = H1;
  await newSeason(A, ep, 175); await A.evaluate(REC);
  const run = async (id, fn) => { if (ONLY && !ONLY.has('A') && !ONLY.has(id)) return; log(`--- A.${id}`); try { await fn(); } catch (e) { result(`A.${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 900) }); } await rec(A, `A.${id}`); };

  await run('p1', async () => {
    await goStore(A, ep);
    const door = await walkDoor(A, ep, 'in');
    const ce = await counterE(A);
    if (!(await A.evaluate(() => !!window.__t.convo()))) { await A.evaluate(() => { const g = window.__game, o = g.outfitter; if (o.open) o.hide(); if (g.onboarding.pending(g.profile.home)) g.onboarding.start(g.profile.home); }); await A.waitForTimeout(150); }
    result(`A.p1a ${ep}: in by the door (W), E at the counter opens P1`, door.ok && ce.ok, { door: door.via, ce });
    const asked = [];
    let c = await seeChoices(A);
    const first = c;
    for (const q of ['Does it work?', 'Whose was it?', 'What\'s BRM-14?', 'How much?']) {
      const r = await choose(A, q); const said = await hear(A, 8); c = await A.evaluate(() => window.__t.convo());
      asked.push({ q, ok: r.ok, why: r.why, said, after: c && c.choices });
    }
    const once = asked.find((a) => a.q === 'What\'s BRM-14?'), whose = asked.find((a) => a.q === 'Whose was it?');
    result('A.p1b every P1 question answered; "Whose was it?" and "What\'s BRM-14?" once only; "How much?" → the keeper\'s one line, then take / wait', asked.every((a) => a.ok) && !(once.after || []).some((t) => t.startsWith('What\'s BRM')) && !(asked[3].after || []).some((t) => t.startsWith('Whose was it')), { first, asked });
    const r = await choose(A, 'I\'ll take it.'); const said = await hear(A, 6);
    for (let k = 0; k < 10; k++) { const cc = await A.evaluate(() => window.__t.convo()); if (!cc) break; await A.keyboard.press('Digit1'); await A.waitForTimeout(80); }
    await A.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
    const card = await A.evaluate(() => { const g = window.__game, inv = g.profile.inventory, pk = inv.containers.find((k) => k.item === 'waltpack'); return { pack: !!pk, taken: g.story.has('bundle.taken') }; });
    result('A.p1c "I\'ll take it." → the pack', r.ok && card.pack && card.taken, { said, card });
  });

  await run('pre', async () => {
    await A.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 11); window.__L.step(4); });
    const out = await walkDoor(A, ep, 'out');
    await A.evaluate(() => window.__L.step(60));
    const s = await staged(A);
    result('A.pre a walkout by daylight before night one: no Tauno', out && !s.some((x) => x.who === 'tauno'), { out: out.via, staged: s });
  });

  await run('night', async () => {
    const n = await nightAt(A, { keys: true });
    const moved = n.before && n.after ? Math.hypot(n.after.x - n.before.x, n.after.z - n.before.z) : null;
    result('A.night night one at a site: the cutscene plays through; I/Esc/M/E/Tab and W held mid-cutscene neither open the book nor walk the player; the notebook found', n.cut && n.f.found && n.pressed.slice(0, 5).every((p) => !p.journal) && (moved == null || moved < 3), { site: n.site, pitched: n.pitched, pressed: n.pressed, moved, after: n.after, beats: n.beats.map((b) => [b.beat, b.lit.slice(0, 80)]) });
    note('A.night the cutscene, beat by beat', n.beats);
    const morning = await A.evaluate(() => { const g = window.__game; return { journal: g.journal.open, side: g.journal.side, view: g.book && g.book.view }; });
    note('A.night the morning: what is open', morning);
    await A.evaluate(() => { const g = window.__game; if (g.camp.camp) g.camp.strike({ quiet: true }); window.__J.refresh(); if (g.journal.open) g.journal.close(); });
  });

  await run('read', async () => {
    const r45 = await readByClicks(A, 'NB45');
    result('A.read NB45 by I, the Walt tab and its contents row clicked: read after 3 s', r45.open && r45.tab && r45.row && r45.read, r45);
    const pages = {};
    for (const nb of ['NB01', 'NB15', 'NB20', 'NB31', 'NB88']) pages[nb] = (await readByClicks(A, nb, 3.6));
    note('A.read the pages as shown', Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, { label: v.label, read: v.read, text: v.text }])));
    await closeBook(A);
  });

  await run('c837', async () => {
    const W = await A.evaluate(() => { const q = window.__game.storyLayer.place('ws.c837'); return { x: q.x, z: q.z }; });
    await A.evaluate(async (W) => { await window.__L.near(W.x, W.z); }, W);
    const t = await A.evaluate(() => window.__L.faceTo('ws.c837.stump', 2.5, 0.4));
    await A.keyboard.press('e'); await A.evaluate(() => window.__L.step(3));
    // the notebook opened by I at NB01 (clicked), then E on the page
    const r = await readByClicks(A, 'NB01', 1);
    await A.keyboard.press('e'); await A.evaluate(() => window.__L.step(4));
    const here = await A.evaluate(() => { const g = window.__game, el = document.querySelector('#journal .side.w .nbw-here'); return { here: g.story.nbHas('here', 'NB01'), mark: el ? el.textContent : null, stone: g.story.has('stone.c837') }; });
    result('A.c837 the stone by E Look; NB01 opened by clicks at C837, E: he was here', t && t.verb === 'Look' && here.stone && here.here, { t, r: { row: r.row, side: r.side }, here });
    await closeBook(A);
    const c64 = await A.evaluate(() => { const g = window.__game, tr = g.trip, i = g.book.debug.resolved()['64'][0], p = g.world.portages[i]; tr.log('portage', { i, name: p.name, rods: p.rods }); return { name: p.name, rods: p.rods, bc: g.story.has('bc.64') }; });
    note('A.c837 P289 crossed (logged): the back cover', c64);
  });

  await run('porch', async () => {
    // back at the store after dark: in, then out; nobody should stop you
    await clockTo(A, 12, 0); // (the slice's order: the clock on, then the store; a goStore straight from C837 at dawn hung twice)
    log('A.porch: to the store'); const gs = await goStore2(A, ep); note('A.porch: the store reached', gs);
    await A.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 22.6); window.__L.step(4); });
    await walkDoor(A, ep, 'in');
    const armedN = await facts(A, ['tauno.armed']);
    const outN = await walkDoor(A, ep, 'out'); await A.evaluate(() => window.__L.step(60));
    const sN = await staged(A);
    result('A.porch1 after dark: in arms the porch, out by the door: no Tauno (he is a daylight man)', !sN.some((x) => x.who === 'tauno'), { armedN, outN: outN.via, sN });
    // the next morning: in (the counter's gold topic), out: Tauno
    await clockTo(A, 10, 1);
    await walkDoor(A, ep, 'in');
    const k1 = await keeperE(A, ep);
    const gold = await A.evaluate(() => window.__t.convo());
    const g1 = await choose(A, 'Whose gear was this?'); const gearSaid = await hear(A, 6);
    const more = await A.evaluate(() => window.__t.convo());
    await endTalk(A);
    note('A.porch the counter after night one', { k1, gold, g1, gearSaid, more });
    const w = await taunoWalkout(A, ep);
    const where = w.t ? await A.evaluate((k) => window.__t.figure(k), `cast:tauno:${w.t.ep}`) : null;
    const layout = await A.evaluate((ep) => { const S = window.__game.outfitter.layout(ep); return { porch: !!(S && S.look && S.look.porch), stepsFoot: !!(S && S.stepsFoot) }; }, ep);
    result(`A.porch2 out of ${ep}'s door by daylight: Tauno (porch foot, or his truck with no porch)`, !!w.t, { out: w.out.via, t: w.t, where, layout });
    if (!w.t) return;
    const k = await talkE(A, `cast:tauno:${w.t.ep}`);
    const t1 = await A.evaluate(() => window.__t.convo());
    const r1 = await picks(A, ['Sorry?', 'Walk with him']);
    const t3 = await seeChoices(A);
    // walk off mid-scene: Escape at T3
    await A.keyboard.press('Escape'); await A.evaluate(() => window.__L.step(20));
    const afterEsc = { convo: await A.evaluate(() => window.__t.convo()), f: await facts(A, ['tauno.porch.done', 'tauno.porch.declined1', 'tauno.walked', 'tauno.talk']), staged: await staged(A) };
    result('A.porch3 E on him, T1→T2 by number; Escape at T3 ends the talk without a crash', k.ok && r1.ok && !afterEsc.convo, { k, t1, r1: r1.ok ? 'ok' : r1, t3, afterEsc });
    // back to him at once: what does he say now?
    await A.evaluate(() => window.__L.step(60));
    const k2 = await talkE(A, `cast:tauno:${w.t.ep}`);
    const again = await A.evaluate(() => window.__t.convo());
    note('A.porch4 E on him again straight after walking off', { k2, again });
    if (!again) {
      await walkDoor(A, ep, 'in'); const w2 = await taunoWalkout(A, ep); note('A.porch4b in and out again', { t: w2.t });
      if (w2.t) await talkE(A, `cast:tauno:${w2.t.ep}`);
    }
    // the rest of the scene, warm: whatever he opens with, the scene's choices by number
    const path = ['Sorry?', 'Walk with him', 'A Swede?', 'You knew him?', 'Doing what?', 'What\'s BRM?', 'Who are you?', 'What do you want from me?', 'I\'ll go look.'];
    const done = [];
    for (const p of path) { const c = await A.evaluate(() => window.__t.convo()); if (!c) break; const i = c.choices.findIndex((t) => t.startsWith(p)); if (i < 0) { if (c.choices.length === 1) { await A.keyboard.press('Digit1'); await A.waitForTimeout(60); } continue; } await A.keyboard.press(`Digit${i + 1}`); await A.waitForTimeout(60); done.push(p); await hear(A, 6); }
    await hear(A, 6); await endTalk(A);
    const f = await facts(A, ['tauno.porch.done', 'tauno.porch.warm', 'knows.walt', 'knows.haapala', 'knows.boreal', 'knows.tauno', 'door.crews.taken']);
    const rings = await A.evaluate(() => window.__game.pencil.rings().length);
    result('A.porch5 the scene finished after the walk-off: the door taken, no ring', f['door.crews.taken'] && rings === 0, { done, f, rings, stage: await A.evaluate(() => window.__game.story.stage) });
  });

  await run('rings', async () => {
    await walkDoor(A, ep, 'in');
    const k = await keeperE(A, ep);
    const c0 = await A.evaluate(() => window.__t.convo());
    const r0 = await choose(A, 'Ask about'); const topics = await A.evaluate(() => window.__t.convo());
    const r = await choose(A, 'Can you ring Little Gabbro'); const s1 = await hear(A, 6);
    const r2 = await choose(A, 'And Bald Eagle'); const s2 = await hear(A, 6);
    const after = await A.evaluate(() => window.__t.convo());
    await endTalk(A);
    const marked = await markedTab(A);
    result('A.rings the keeper rings Little Gabbro and Bald Eagle\'s west shore; Marked names the keeper', k.ok && r.ok && r2.ok && /Little Gabbro|33/.test(marked), { c0, topics, s1, s2, after, marked });
  });

  await run('drive', async () => {
    // the truck from the counter to EP 33, clicked
    await walkDoor(A, ep, 'in');
    await A.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 8.5); window.__L.step(3); });
    const ce = await counterE(A);
    if (!(await A.evaluate(() => window.__game.outfitter.open))) await A.evaluate(() => { const o = window.__game.outfitter; o.openHot('counter', o.visit.landing); });
    await A.evaluate(() => window.__L.step(4));
    const row = await A.evaluate(() => { const li = document.querySelector('.rides li[data-ep="33"]'); const b = li && li.querySelector('button[data-act="ride"]'); return li ? { text: li.innerText.replace(/\s+/g, ' '), disabled: b ? b.disabled : null } : null; });
    const money = await A.evaluate(() => window.__game.profile.money);
    let took = false;
    if (row && !row.disabled) { await A.click('.rides li[data-ep="33"] button[data-act="ride"]').then(() => { took = true; }, () => {}); }
    for (let k = 0; k < 200 && took; k++) { await A.evaluate(() => window.__L.step(10)); const busy = await A.evaluate(() => !!(window.__game.rides && window.__game.rides.busy) || window.__game.player.teleporting || window.__game.veil.active); if (!busy && k > 5) break; await A.waitForTimeout(50); }
    await A.evaluate(async () => { await window.__L.settle(); window.__L.step(30); });
    const at = await A.evaluate(() => { const g = window.__game, l = g.outfitter.landing(33) || (g.outfitter.entry && g.outfitter.entry(33)); const p = g.player; return { d: l ? Math.round(Math.hypot(p.x - l.x, p.z - l.z)) : null, mode: p.mode, carry: p.carry ? { drop: !!p.carry.drop } : null, canoe: (g.profile.inventory.long || []).map((x) => [x.id, x.where]), h: +g.day.hours.toFixed(2) }; });
    result('A.drive the counter opened by E, the truck to EP 33 clicked: at Little Gabbro\'s landing', ce.ok && row && took && at.d != null && at.d < 150, { ce: ce.via, row, money, took, at });
    await A.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
  });

  await run('paddle', async () => {
    // the slice's step 5 (L), after the real drive (the open item: W gives no way)
    const pre = await state(A);
    for (const s of LAYER.steps.filter((q) => q.step === 5)) await s.run({ page: A, result: (n, p, m) => result(`A.paddle ${n}`, p, m), shots: SHOTS });
    const post = await state(A);
    note('A.paddle state before/after', { pre, post });
    const lead = await A.evaluate(() => ({ lead: window.__game.leads.state('crews'), seen: window.__game.story.has('crews.seen') }));
    if (!lead.seen) {
      // diagnose: on the water by the landing, W pressed; then the same with the walk's canoe-set-down state cleared
      const diag = await A.evaluate(async () => {
        const g = window.__game, L = window.__L, q = g.storyLayer.place('crews.landing'), p = g.player;
        await p.teleport(q.x - q.n[0] * 120, q.z - q.n[1] * 120); await L.settle();
        return { mode: p.mode, carry: p.carry ? JSON.stringify(p.carry).slice(0, 200) : null, boat: !!p.boat, seat: p.seat || null, landing: !!p.landing, ashore: !!p.ashore, swim: !!p.swim, foot: !!p.foot };
      });
      await A.keyboard.down('w'); await A.evaluate(() => window.__L.step(60)); await A.keyboard.up('w');
      const s1 = await state(A);
      await A.evaluate(() => { const p = window.__game.player; p.carry = null; });
      await A.keyboard.down('w'); await A.evaluate(() => window.__L.step(60)); await A.keyboard.up('w');
      const s2 = await state(A);
      note('A.paddle diagnosis: W on the water, then again with player.carry cleared', { diag, s1, s2 });
    }
  });

  await run('turn', async () => {
    await clockTo(A, 8, 1);
    note("A.turn: Farm reached", await goStore2(A, 31));
    await A.evaluate(() => { const g = window.__game, S = g.outfitter.layout(31), b = S.axes.b, f = S.stepsFoot || S.door; window.__L.standAt(f.x + b.x * 4, f.z + b.z * 4, 0); window.__L.step(60); });
    const t = await A.evaluate(() => window.__t.tauno());
    let k = t ? await talkE(A, `cast:tauno:${t.ep}`) : { ok: false };
    if (t && !k.ok) { await A.evaluate(() => window.__L.step(90)); k = await talkE(A, `cast:tauno:${t.ep}`); }
    const u1 = await A.evaluate(() => window.__t.convo());
    const seen = await A.evaluate(() => window.__game.story.has('crews.seen'));
    const r = await picks(A, ['The crib\'s still there.', 'Somebody\'s flagged the grade.', 'Pink. New.', 'Measuring for who?', 'Away from the west shore', 'Somebody killed him.', 'Marlys?', 'I\'ll go.']);
    await hear(A, 6); await endTalk(A);
    const f = await facts(A, ['knows.eino', 'tauno.turn', 'door.guiding.named', 'door.boys.named', 'door.family.named', 'door.mining.named']);
    result('A.turn Farm\'s porch of a morning: U1–U6 (crews seen ' + seen + ')', !!t && k.ok && r.ok && f['tauno.turn'], { t, u1, r: r.ok ? 'ok' : r, f, stage: await A.evaluate(() => window.__game.story.stage) });
    // the seat: V.'s water, Two Stump
    await A.evaluate(() => window.__L.step(30));
    const k2 = t ? await talkE(A, `cast:tauno:${t.ep}`) : { ok: false };
    const c2 = await A.evaluate(() => window.__t.convo());
    note('A.turn E on him again at Farm after the turn', { k2, c2 });
    await endTalk(A);
    // the doors' rings at Farm's counter
    await walkDoor(A, 31, 'in');
    const k3 = await keeperE(A, 31);
    await choose(A, 'Ask about'); const topics = await A.evaluate(() => window.__t.convo());
    note('A.turn Farm\'s keeper: the topics', { k3, topics });
    await endTalk(A);
  });

  await run('page', async () => {
    const wp = await waltPage(A);
    const marked = await markedTab(A);
    note('A.page the Walt page and Marked at the end', { wp, marked });
    result('A.page the Walt page has lines, none blank', wp.lines.length >= 8 && wp.lines.every((l) => l.replace('~', '').trim().length > 3), { n: wp.lines.length });
  });
  await A.context().browser().close();
}

// =====================================================================================================================
async function seasonB() {
  const B = await openGame('B');
  const ep = H2;
  await newSeason(B, ep, 175); await B.evaluate(REC);
  const run = async (id, fn) => { if (ONLY && !ONLY.has('B') && !ONLY.has(id)) return; log(`--- B.${id}`); try { await fn(); } catch (e) { result(`B.${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 900) }); } await rec(B, `B.${id}`); };
  const nextTrip = (n = 1) => B.evaluate((n) => { const s = window.__game.story; const t = s.tripN(); s.ctx.tripN = () => t + n; }, n);

  await run('shelf', async () => {
    await goStore(B, ep);
    const door = await walkDoor(B, ep, 'in');
    const ce = await counterE(B);
    if (!(await B.evaluate(() => !!window.__t.convo()))) { await B.evaluate(() => { const g = window.__game, o = g.outfitter; if (o.open) o.hide(); if (g.onboarding.pending(g.profile.home)) g.onboarding.start(g.profile.home); }); await B.waitForTimeout(150); }
    const c = await seeChoices(B);
    const r = await choose(B, 'I\'ll wait for a rental.'); const said = await hear(B, 6);
    for (let k = 0; k < 10; k++) { const cc = await B.evaluate(() => window.__t.convo()); if (!cc) break; await B.keyboard.press('Digit1'); await B.waitForTimeout(80); }
    await B.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
    const inv = await B.evaluate(() => { const g = window.__game, inv = g.profile.inventory; return { packs: inv.containers.map((k) => k.item), tents: inv.containers.flatMap((k) => k.grid.filter((e) => /tent/.test(e.id)).map((e) => e.id)), money: g.profile.money, shelf: g.story.has('bundle.shelf') }; });
    result(`B.shelf ${ep}: E at the counter; "I'll wait for a rental." → the shelf; what the player has to camp with`, r.ok && inv.shelf, { door: door.via, ce: ce.via, c, said, inv });
  });

  await run('r1', async () => {
    await nextTrip(1);
    await B.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy + 1, 9); window.__L.step(4); });
    await walkDoor(B, ep, 'out'); await walkDoor(B, ep, 'in'); await B.evaluate(() => window.__L.step(40));
    const s = await staged(B); const j = s.find((x) => x.who === 'josie');
    let c = null; if (j) { await talkE(B, `cast:josie:${j.ep}`); c = await B.evaluate(() => window.__t.convo()); }
    const r = await choose(B, 'No thanks.'); const said = await hear(B, 4); await endTalk(B);
    result('B.r1 a trip later at the home counter: Josie R1, "No thanks." → "It\'s not going anywhere…"', !!j && c && /never took/.test(c.say || '') && r.ok, { s, c, said });
    // two trips on: R1b
    await nextTrip(3);
    await walkDoor(B, ep, 'out'); await walkDoor(B, ep, 'in'); await B.evaluate(() => window.__L.step(40));
    const s2 = await staged(B); const j2 = s2.find((x) => x.who === 'josie');
    let c2 = null; if (j2) { await talkE(B, `cast:josie:${j2.ep}`); c2 = await seeChoices(B); }
    note('B.r1b R1b', { s2, c2 });
    // decline it too if offered, then the topic that stays
    if (c2) { const nn = c2.choices.findIndex((t) => /No|Not/.test(t)); if (nn >= 0) { await B.keyboard.press(`Digit${nn + 1}`); await hear(B, 4); } await endTalk(B); }
    await nextTrip(4);
    await walkDoor(B, ep, 'out'); await walkDoor(B, ep, 'in'); await B.evaluate(() => window.__L.step(40));
    const s3 = await staged(B); const j3 = s3.find((x) => x.who === 'josie');
    let c3 = null; if (j3) { await talkE(B, `cast:josie:${j3.ep}`); c3 = await seeChoices(B); }
    let took = null;
    if (c3) { const i = c3.choices.findIndex((t) => /old pack still/.test(t)); if (i >= 0) { await B.keyboard.press(`Digit${i + 1}`); const sd = await hear(B, 4); const t2 = await choose(B, 'I\'ll take it'); took = { via: 'topic', sd, t2, after: await hear(B, 4) }; } else { const t2 = await choose(B, 'I\'ll take it'); took = { via: 'opened on the answer', t2, after: await hear(B, 4) }; } }
    await endTalk(B);
    const pack = await B.evaluate(() => ({ pack: window.__game.profile.inventory.containers.some((k) => k.item === 'waltpack'), later: window.__game.story.has('bundle.later') }));
    result('B.r1c after R1b, "That old pack still in back?" at the counter → the take', pack.pack, { s3, c3, took, pack });
  });

  await run('cold', async () => {
    const n = await nightAt(B, {});
    result('B.cold night one with the late-taken bundle: the cutscene, the notebook', n.cut && n.f.found, { site: n.site, pitched: n.pitched, f: n.f });
    await B.evaluate(() => { const g = window.__game; if (g.camp.camp) g.camp.strike({ quiet: true }); window.__J.refresh(); if (g.journal.open) g.journal.close(); });
    await nextTrip(5);
    await clockTo(B, 10, 1);
    await goStore(B, ep);
    await walkDoor(B, ep, 'in');
    const w = await taunoWalkout(B, ep);
    const dist = w.t ? await B.evaluate((ep) => { const g = window.__game, st = window.__t.tauno(), S = g.outfitter.layout(ep), f = S.stepsFoot || S.door, p = g.player; return { player: Math.round(Math.hypot(p.x - st.x, p.z - st.z)), foot: Math.round(Math.hypot(f.x - st.x, f.z - st.z)), door: Math.round(Math.hypot(S.door.x - st.x, S.door.z - st.z)), barked: st.barked }; }, ep) : null;
    result(`B.cold out of ${ep}'s door by daylight: Tauno, within his first word's 9 m of the way out`, !!w.t && dist && dist.foot < 9, { out: w.out.via, t: w.t, dist });
    if (!w.t) return;
    // walk away from him by the keys (W), past T1b; then back and E: [Keep walking] twice
    const away = await B.evaluate(() => { const g = window.__game, T = window.__t, st = T.tauno(), p = g.player; const yaw = Math.atan2(-(p.z - st.z), p.x - st.x); window.__L.look(yaw); return { yaw }; });
    await B.keyboard.down('w'); await B.evaluate(() => window.__L.step(150)); await B.keyboard.up('w');
    const far = await B.evaluate(() => { const g = window.__game, st = window.__t.tauno(); return { d: st ? Math.round(Math.hypot(g.player.x - st.x, g.player.z - st.z)) : null, st }; });
    const f0 = await facts(B, ['tauno.porch.declined1', 'tauno.talk']);
    note('B.cold walked away by W', { away, far, f0 });
    const k = await talkE(B, `cast:tauno:${w.t.ep}`);
    const t1 = await B.evaluate(() => window.__t.convo());
    // the first word heard? then the choices: Keep walking twice (X1), unless walking past already declined
    const kw = [];
    const t1now = await B.evaluate(() => window.__t.convo());
    for (let i = 0; i < 4 && t1now; i++) { const c = await B.evaluate(() => window.__t.convo()); if (!c) break; const j = c.choices.findIndex((t) => /^Keep walking|^\[Keep walking/.test(t)); if (j < 0) { if (c.choices.length === 1) { await B.keyboard.press('Digit1'); await B.waitForTimeout(60); continue; } break; } kw.push(c.choices[j]); await B.keyboard.press(`Digit${j + 1}`); await B.waitForTimeout(60); await hear(B, 3); }
    await endTalk(B);
    const c2 = { t1: t1now, k };
    const d1 = await facts(B, ['tauno.porch.declined1', 'tauno.porch.done']);
    result('B.x1 Keep walking twice: X1', d1['tauno.porch.declined1'] && !d1['tauno.porch.done'], { c2, kw, d1 });
  });

  await run('r3', async () => {
    // the same trip: in and out again: he should not be back
    await walkDoor(B, ep, 'in'); const same = await taunoWalkout(B, ep);
    note('B.r3 the same trip, out again after X1', { t: same.t });
    await nextTrip(6);
    await clockTo(B, 10, 1);
    await walkDoor(B, ep, 'in'); const w = await taunoWalkout(B, ep);
    if (w.t) await talkE(B, `cast:tauno:${w.t.ep}`);
    const c = await B.evaluate(() => window.__t.convo());
    const r = await choose(B, 'Not today.'); await hear(B, 4); await endTalk(B);
    const f = await facts(B, ['tauno.porch.declined2', 'rehook.R3']);
    result('B.r3 a later trip: R3 "You again." → "Not today." (declined2)', !!w.t && c && /You again/.test(c.say || '') && r.ok && f['tauno.porch.declined2'], { t: w.t, c, f });
    // a later trip again, home: nobody (only Farm now)
    await nextTrip(7); await clockTo(B, 10, 1);
    await walkDoor(B, ep, 'in'); const w3 = await taunoWalkout(B, ep);
    result('B.r3b after declined2, a walkout at home: no Tauno', !w3.t, { t: w3.t });
  });

  await run('farm', async () => {
    await B.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 18.5); window.__L.step(4); });
    await goStore(B, 31);
    const seat = async () => { await B.evaluate(() => { const g = window.__game, S = g.outfitter.layout(31), b = S.axes.b, f = S.stepsFoot || S.door; window.__L.standAt(f.x + b.x * 4, f.z + b.z * 4, 0); window.__L.step(60); }); return B.evaluate(() => window.__t.tauno()); };
    const ev = await seat();
    result('B.farm1 Farm of an evening: no Tauno (mornings)', !ev, { ev });
    await clockTo(B, 8, 1);
    const mo = await seat();
    let k = mo ? await talkE(B, `cast:tauno:${mo.ep}`) : { ok: false };
    for (let r = 0; r < 2 && mo && !k.ok; r++) { await B.evaluate(() => window.__L.step(90)); k = await talkE(B, `cast:tauno:${mo.ep}`); k.again = r + 1; }
    const c = await B.evaluate(() => window.__t.convo());
    const said = [];
    const path = ['Walk with him', 'Who\'s Walt?', 'You knew him?', 'Doing what?', 'What\'s BRM?', 'Who are you?', 'What do you want from me?', 'I\'ll go look.'];
    for (const p of path) { const cc = await B.evaluate(() => window.__t.convo()); if (!cc) break; const i = cc.choices.findIndex((t) => t.startsWith(p)); if (i < 0) { if (cc.choices.length === 1) { await B.keyboard.press('Digit1'); await B.waitForTimeout(60); } continue; } await B.keyboard.press(`Digit${i + 1}`); await B.waitForTimeout(60); said.push(p); await hear(B, 6); }
    await hear(B, 6); await endTalk(B);
    const f = await facts(B, ['tauno.porch.done', 'door.crews.taken', 'knows.walt']);
    result('B.farm2 Farm of a morning: "Changed your mind?" → the door taken', !!mo && c && /Changed your mind/.test(c.say || '') && f['door.crews.taken'], { mo, k, c, said, f });
    const wp = await waltPage(B);
    note('B.farm the Walt page (cold path)', wp);
  });
  await B.context().browser().close();
}

// =====================================================================================================================
// season C: walked off after T3 (Escape), then "Keep walking" twice on the next E: where does that leave the door?
async function seasonC() {
  const C = await openGame('C');
  const ep = H1;
  await newSeason(C, ep, 176); await C.evaluate(REC);
  const run = async (id, fn) => { log(`--- C.${id}`); try { await fn(); } catch (e) { result(`C.${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 900) }); } await rec(C, `C.${id}`); };
  await run('walkoff', async () => {
    await goStore(C, ep);
    const door = await walkDoor(C, ep, 'in'); const ce = await counterE(C);
    note(`C.counter ${ep}: E at the counter`, { door: door.via, ce });
    await C.evaluate(() => { const g = window.__game; if (!window.__t.convo() && g.onboarding.pending(g.profile.home)) { const o = g.outfitter; if (o.open) o.hide(); g.onboarding.start(g.profile.home); } });
    await hear(C, 10); await choose(C, 'I\'ll take it.');
    for (let k = 0; k < 10; k++) { const cc = await C.evaluate(() => window.__t.convo()); if (!cc) break; await C.keyboard.press('Digit1'); await C.waitForTimeout(80); }
    await C.evaluate(() => { const g = window.__game, o = g.outfitter; if (o.open) o.hide(); g.story.debug.do('found', { abs: g.story.time().abs }); g.day.setClock(g.day.year, g.day.doy + 1, 10); window.__t.step(4); });
    await walkDoor(C, ep, 'out'); await walkDoor(C, ep, 'in');
    const w = await taunoWalkout(C, ep);
    if (!w.t) { result('C.walkoff Tauno at the walkout', false, { w }); return; }
    await talkE(C, `cast:tauno:${w.t.ep}`);
    const r = await picks(C, ['Sorry?', 'Walk with him']); const t3 = await seeChoices(C);
    await C.keyboard.press('Escape'); await C.evaluate(() => window.__L.step(20));
    const f0 = await facts(C, ['tauno.porch.done', 'tauno.porch.declined1', 'door.crews.taken']);
    await C.evaluate(() => window.__L.step(60));
    const k2 = await talkE(C, `cast:tauno:${w.t.ep}`);
    const again = await C.evaluate(() => window.__t.convo());
    const kw = [];
    for (let i = 0; i < 4; i++) { const c = await C.evaluate(() => window.__t.convo()); if (!c) break; const j = c.choices.findIndex((t) => /^Keep walking/.test(t)); if (j < 0) break; kw.push(c.choices[j]); await C.keyboard.press(`Digit${j + 1}`); await C.waitForTimeout(60); await hear(C, 3); }
    await endTalk(C);
    const f1 = await facts(C, ['tauno.porch.done', 'tauno.porch.declined1', 'door.crews.taken']);
    result('C.walkoff1 Escape after T3, E again: he picks up ("Where was I."), not T1 over again', again && !/BRM fourteen/.test(again.say || ''), { r: r.ok, t3, f0, k2, again, kw, f1 });
    // the next trip: home walkout, then Farm by morning
    await C.evaluate(() => { const s = window.__game.story, t = s.tripN(); s.ctx.tripN = () => t + 2; });
    await clockTo(C, 10, 1);
    await walkDoor(C, ep, 'in'); const w2 = await taunoWalkout(C, ep);
    let c2 = null; if (w2.t) { await talkE(C, `cast:tauno:${w2.t.ep}`); c2 = await C.evaluate(() => window.__t.convo()); await endTalk(C); }
    note('C.walkoff2 a later trip\'s walkout at home', { t: w2.t, c2 });
    await clockTo(C, 8, 1);
    await goStore(C, 31);
    await C.evaluate(() => { const g = window.__game, S = g.outfitter.layout(31), b = S.axes.b, f = S.stepsFoot || S.door; window.__L.standAt(f.x + b.x * 4, f.z + b.z * 4, 0); window.__L.step(60); });
    const t = await C.evaluate(() => window.__t.tauno());
    let k = t ? await talkE(C, `cast:tauno:${t.ep}`) : { ok: false };
    for (let r = 0; r < 3 && t && !k.ok; r++) { await C.evaluate(() => window.__L.step(90)); k = await talkE(C, `cast:tauno:${t.ep}`); k.again = r + 1; }
    const c3 = await C.evaluate(() => window.__t.convo());
    const why = await C.evaluate(() => { try { return window.__game.storyTalk.cast.debug.why(31); } catch (e) { return String(e).slice(0, 200); } });
    const path = ['Walk with him', 'Who\'s Walt?', 'I wouldn\'t know', 'You knew him?', 'What do you want from me?', 'I\'ll go look.'];
    for (const p of path) { const cc = await C.evaluate(() => window.__t.convo()); if (!cc) break; const i = cc.choices.findIndex((x) => x.startsWith(p)); if (i < 0) { if (cc.choices.length === 1) { await C.keyboard.press('Digit1'); await C.waitForTimeout(60); } continue; } await C.keyboard.press(`Digit${i + 1}`); await C.waitForTimeout(60); await hear(C, 6); }
    await endTalk(C);
    const f2 = await facts(C, ['tauno.porch.done', 'door.crews.taken']);
    result('C.walkoff3 Farm of a morning after that: Tauno talks and the door can still be taken', k.ok && f2['door.crews.taken'], { t, k, c3, why, f2 });
  });
  await C.context().browser().close();
}

// =====================================================================================================================
// the door probe: where Tauno and his truck stand at a store, against its door and steps, and whether the door still walks
async function doorProbe(ep) {
  const P = await openGame(`door${ep}`);
  await newSeason(P, ep, 176);
  await goStore(P, ep);
  const geo0 = await P.evaluate((ep) => { const g = window.__game, S = g.outfitter.layout(ep), r = (q) => q && [Math.round(q.x), Math.round(q.z)]; return { door: r(S.door), foot: r(S.stepsFoot), centre: r(S.centre), porch: !!(S.look && S.look.porch), b: [+S.axes.b.x.toFixed(2), +S.axes.b.z.toFixed(2)], rideTruck: g.truck ? { x: Math.round(g.truck.x || 0), z: Math.round(g.truck.z || 0), visible: !!(g.truck.mesh && g.truck.mesh.visible) } : null }; }, ep);
  const in0 = await walkDoor(P, ep, 'in'), out0 = await walkDoor(P, ep, 'out');
  await P.evaluate(() => { const g = window.__game; g.story.debug.do('found', { abs: g.story.time().abs }); g.day.setClock(g.day.year, g.day.doy + 1, 10); window.__t.step(4); });
  const in1 = await walkDoor(P, ep, 'in');
  const out1 = await walkDoor(P, ep, 'out');
  await P.evaluate(() => window.__L.step(20));
  const geo1 = await P.evaluate((ep) => {
    const g = window.__game, S = g.outfitter.layout(ep), st = window.__t.tauno(), p = g.player, T = g.storyTalk.cast.ownTruck;
    const d = (a, b) => (a && b ? Math.round(Math.hypot(a.x - b.x, a.z - b.z)) : null);
    return { tauno: st && { x: Math.round(st.x), z: Math.round(st.z), barked: st.barked, truck: st.truck }, truck: T ? { x: Math.round(T.x), z: Math.round(T.z) } : null, dDoorTauno: d(S.door, st), dFootTauno: d(S.stepsFoot || S.door, st), dPlayerTauno: d(p, st), dDoorTruck: T ? d(S.door, T) : null, dFootTruck: T ? d(S.stepsFoot || S.door, T) : null };
  }, ep);
  // can you see him from the foot of the steps, looking out? a shot
  await P.evaluate((ep) => { const g = window.__game, S = g.outfitter.layout(ep), f = S.stepsFoot || S.door, b = S.axes.b; window.__L.standAt(f.x + b.x * 1.5, f.z + b.z * 1.5, 0); window.__L.look(Math.atan2(-b.z, b.x)); window.__L.step(10); }, ep);
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await P.screenshot({ path: path.join(SHOTS, `door-${ep}-out.png`) }); }
  const in2 = await walkDoor(P, ep, 'in');
  const out2 = await walkDoor(P, ep, 'out');
  if (SHOTS) await P.screenshot({ path: path.join(SHOTS, `door-${ep}-after.png`) });
  result(`D.${ep} the door walks by the keys before and after Tauno and his truck are staged; he stands within 9 m of the way out`, in0.ok && out0.ok && in1.ok && out1.ok && in2.ok && out2.ok && geo1.dFootTauno != null && geo1.dFootTauno < 9,
    { geo0, geo1, walks: { in0: in0.via, out0: out0.via, in1: in1.via, out1: out1.via, in2: in2.via, out2: out2.via }, stuck: [in1, out1, in2, out2].filter((w) => !w.ok).map((w) => w.tries) });
  await P.context().browser().close();
}
const DOORS = String(arg('doors', '')).split(',').filter(Boolean).map(Number);
for (const ep of DOORS) { try { await doorProbe(ep); } catch (e) { result(`D.${ep} ran`, false, { error: String(e && e.stack || e).slice(0, 800) }); } }

try {
  if (!ONLY || ONLY.has('A')) await seasonA();
} catch (e) { result('season A ran to its end', false, { error: String(e && e.stack || e).slice(0, 1500) }); }
try {
  if (!ONLY || ONLY.has('B')) await seasonB();
  if (!ONLY || ONLY.has('C')) await seasonC();
} catch (e) { result('season B ran to its end', false, { error: String(e && e.stack || e).slice(0, 1500) }); }
finally { for (const b of browsers) { try { await b.close(); } catch { /* */ } } }
result('no page errors', errors.length === 0, { errors: errors.slice(0, 10) });
const pass = results.filter((r) => r.pass).length;
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'chk-c1a.json'), JSON.stringify({ results, notes, errors, transcript }, null, 1));
log(`chk-c1a: ${pass}/${results.length}`);
process.exit(0);
