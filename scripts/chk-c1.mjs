// chk-c1b: an adversarial check of claude/story-c1 (story Round 1, chapter 1). Headless Chromium against a running Vite,
// ?story=1 (and the relay for --only coop). Sections (--only a,b): order (slice steps out of order, the landing first,
// pages before Tauno names things, pencil before the keepers), decline (decline everything), wit (three of the solver's
// witnesses played in the runtime), saves (R1 state across reloads, flag off/on/off, a main-made season, two slots,
// export/import), coop (a guest). Every line a conversation shows and every Walt-page line is captured and checked against
// the extract (text/*.json) at the end.
//   APP=... [RELAY=...] node scripts/chk-c1.mjs [--only order,decline,wit,saves,coop] [--out dir] [--shots dir] [--season main.json]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T, choose, hear } from './slice/c1-talk.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const OUT = path.resolve(String(arg('out', path.join(process.env.TMPDIR || '/tmp', 'chk-c1-out'))));
const SHOTS = arg('shots', null) ? path.resolve(String(arg('shots'))) : null;
const SEASON = arg('season', '');
const APP = (process.env.APP || 'http://localhost:5671').replace(/\/$/, '');
const RELAY = process.env.RELAY || '';
const ONLY = arg('only', null) ? new Set(String(arg('only')).split(',')) : null;
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [], SAID = [], WALTP = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };
const note = (name, more = {}) => { results.push({ name, pass: null, more }); log('NOTE', name, JSON.stringify(more).slice(0, 1600)); };
mkdirSync(OUT, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = process.argv.includes('--said') ? { chromium: null } : createRequire(import.meta.url)(findPw());
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
// chk-c1b's own helpers
// the text capture: every conversation node shown (who, by, say, choices), kept in the page and pulled by pullSaid
const CAPTURE = () => {
  const g = window.__game, D = g.dialogue;
  window.__said = window.__said || [];
  if (!D || D.__cap) return true;
  D.__cap = true; let last = '';
  const grab = () => {
    const c = D.convo; if (!c || !c.node) return;
    const n = c.node, say = typeof n.say === 'string' ? n.say : JSON.stringify(n.say == null ? '' : n.say);
    const ch = (n.choices || []).map((o) => (typeof o.text === 'string' ? o.text : JSON.stringify(o.text)));
    const k = `${c.name}|${n.by || ''}|${say}|${ch.join('/')}`; if (k === last) return; last = k;
    const s = g.story;
    window.__said.push({ who: c.name || null, by: n.by || null, say, ch, found: !!(s && s.has && s.has('nb.found')), t: Math.round(performance.now()) });
  };
  setInterval(grab, 20);
  const show = D.showNode.bind(D); D.showNode = (x) => { const r = show(x); try { grab(); } catch { /* */ } setTimeout(grab, 0); return r; };
  return true;
};
async function capture(page) { await page.evaluate(CAPTURE); }
async function pullSaid(page, tag) { try { const a = await page.evaluate(() => { const a = window.__said || []; window.__said = []; return a; }); for (const x of a) SAID.push({ ...x, tag }); } catch { /* the page went away */ } }
// the Walt page as drawn (the book's Walt side, walt view): its lines, struck lines, heads, chips
async function waltPage(page, tag) {
  const wp = await page.evaluate(() => {
    const g = window.__game, b = g.book; if (!b) return null;
    const j = g.journal, was = j.open;
    try { j.show('pack'); j.setSide('walt'); } catch { /* */ }
    const on = j.side === 'walt';
    if (on) { b.view = 'walt'; b.render(true); }
    const el = document.querySelector('#journal .side.w');
    const out = el && on ? { head: (el.querySelector('.cb-head') || {}).textContent || '', lines: [...el.querySelectorAll('.cb-line:not(.struck)')].map((n) => n.textContent), struck: [...el.querySelectorAll('.cb-line.struck')].map((n) => n.textContent), heads: [...el.querySelectorAll('.cb-h')].map((n) => n.textContent), chips: [...el.querySelectorAll('[data-nbchip]')].map((n) => n.dataset.nbchip) } : { off: true, side: j.side };
    out.ids = g.story.walt(); out.found = g.story.has('nb.found');
    if (!was) j.close(); else if (on) j.setSide('pack');
    window.__L && window.__L.step(2);
    return out;
  });
  if (wp && wp.lines) for (const l of wp.lines.concat(wp.struck || [])) WALTP.push({ tag, line: l });
  return wp;
}
const F = (page, keys) => page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, window.__game.story.has(k)])), keys);
const storyErrs = (page) => page.evaluate(() => { const d = window.__game.story.debug; return { errors: d.errors().slice(0, 8), warnings: d.warnings().slice(0, 8) }; });
// P1 at the counter by the talk: take the bundle or leave it
async function p1(page, take = true) {
  await page.evaluate(() => { const g = window.__game; if (g.onboarding.pending(g.profile.home)) g.onboarding.start(g.profile.home); });
  for (let k = 0; k < 20 && !(await page.evaluate(() => { window.__L.step(3); return !!window.__t.convo(); })); k++) await page.waitForTimeout(80);
  await hear(page);
  // (ux round 2: no "I'll wait for a rental." any more; the shelf is an old season's: cast.debug.shelve, then the close)
  if (!take) { for (let k = 0; k < 10; k++) { if (!(await page.evaluate(() => window.__t.convo()))) break; await page.keyboard.press('Escape'); await page.waitForTimeout(80); } }
  const r = take ? await picks(page, ['I\'ll take it.']) : await page.evaluate(() => { const g = window.__game; const ok = g.storyTalk.cast.debug.shelve(); g.onboarding.start(g.profile.home); return { ok }; });
  await hear(page, 4);
  for (let k = 0; k < 8; k++) { const c = await page.evaluate(() => window.__t.convo()); if (!c) break; await page.keyboard.press('Digit1'); await page.waitForTimeout(80); }
  await page.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); window.__L.step(5); });
  return r;
}
// night one as walt.js's findStory does it (the cutscene is the slice's step 2; here only what it leaves): the notebook
// in your pockets, story.found
const findNb = (page) => page.evaluate(async () => { const g = window.__game; const put = g.walt.find({ key: 2, lake: 'Lake One' }); window.__L.step(10); await window.__L.wait(200); return { put, found: g.story.has('nb.found'), pockets: g.inventory.pockets && g.inventory.pockets.grid.some((e) => e.id === 'waltnotebook') }; });
// stand at a story prop and E it (the dot): → { t (what the dot named), facts }
async function lookAt(page, prop, d = 2.5, dy = 0.4) {
  const t = await page.evaluate(([prop, d, dy]) => window.__L.faceTo(prop, d, dy), [prop, d, dy]);
  await page.keyboard.press('e'); await page.evaluate(() => window.__L.step(4));
  return { t, face: t && t.ref === `story:${prop}` ? null : await page.evaluate(() => window.__L.lastFace) };
}
async function nearPlace(page, id) {
  const W = await page.evaluate((id) => { const g = window.__game, q = g.storyLayer.place(id); if (!q) return null; if (Number.isFinite(q.x)) return { x: q.x, z: q.z }; const e = q.trailhead != null ? g.world.entryPoints.find((p) => p.ep === q.trailhead) : null; return e ? { x: e.x, z: e.z, trailhead: q.trailhead } : null; }, id);
  if (!W) return null;
  await page.evaluate(async (W) => { await window.__L.near(W.x, W.z); }, W);
  return W;
}
const sceneOf = (page) => page.evaluate(() => { const g = window.__game; return { stage: g.story.stage, tier: g.story.tier, leads: g.leads ? Object.fromEntries(['crews', 'tauno', 'guiding', 'boys', 'family', 'mining'].map((l) => [l, g.leads.state(l)])) : null, rings: g.pencil ? g.pencil.rings().map((r) => r.id || r.label) : null, names: g.pencil ? g.pencil.marks().filter((m) => m.kind === 'name').map((n) => [n.nick, n.lake, n.inked]) : null }; });
// every story topic a keeper offers here now (topics.items on the store's keeper)
const topicsAt = (page, ep) => page.evaluate((ep) => { const g = window.__game, v = (g.npcs.at(ep) || []).find((x) => x.keeper); if (!v) return null; try { return g.storyTalk.topics.items(v).map((t) => t.text); } catch (e) { return 'err:' + e.message; } }, ep);
async function daylight(page, h = 10, dd = 0) { await clockTo(page, h, dd); }
async function walkout(page, ep) { // in and out of the store's door (the API walk: the door by keys is the slice's)
  await goStore(page, ep);
  await page.evaluate((e) => { window.__t.walkIn(e); window.__t.step(10); window.__t.walkOut(e); window.__t.step(30); }, ep);
  return page.evaluate(() => ({ tauno: window.__t.tauno(), staged: window.__t.staged().map((s) => [s.who, s.ep, s.slot && (s.slot.id || s.slot)]) }));
}
// the talk opened as T's own rigs open it (npcs.talkTo: E's own path; E by the keys is the slice's 4c/6a assertion)
async function talkDirect(page, key) {
  await page.evaluate((k) => window.__t.talkTo(k), key);
  for (let k = 0; k < 25; k++) { const c = await page.evaluate(() => { window.__L.step(2); return window.__t.convo(); }); if (c) return { ok: true, via: 'talkTo', convo: c }; await page.waitForTimeout(60); }
  return { ok: false, via: 'talkTo opened nothing' };
}
async function talkTauno(page) {
  const t = await page.evaluate(() => window.__t.tauno());
  if (!t) return { ok: false, why: 'no Tauno staged' };
  // stand beside him first (T's declines rig: 1.6 m), as a player who walks up to him
  await page.evaluate(() => { const g = window.__game, T = window.__t, st = T.tauno(); const f = T.figure(`cast:tauno:${st.ep}`) || st; const p = g.player, dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz) || 1; T.standAt(f.x + (dx / d) * 1.6, f.z + (dz / d) * 1.6, Math.atan2(-(f.z - p.z), f.x - p.x)); T.step(10); });
  const k = await talkDirect(page, `cast:tauno:${t.ep}`);
  return { ...k, t };
}
async function keeperTalk(page, ep) {
  let key = null;
  for (let k = 0; k < 40 && !key; k++) { key = await page.evaluate((e) => { window.__L.step(5); return window.__t.keeperKey(e); }, ep); if (!key) await page.waitForTimeout(80); }
  return key ? talkDirect(page, key) : { ok: false, why: 'no keeper in the roster' };
}
// a trip begun and closed (trip.js), so tripN moves the way a real one does
const aTrip = (page) => page.evaluate(() => { const g = window.__game; try { if (g.trip.active) g.trip.close('completed', 'came in', g.profile.home); g.trip.start({ ep: g.profile.home, foodDays: 1, canoe: 'aluminium' }); g.step(1 / 30, 20); g.trip.close('completed', 'came in', g.profile.home); g.step(1 / 30, 10); return g.story.tripN(); } catch (e) { return 'err:' + e.message; } });

// =====================================================================================================================
// O: order breaking (one season at Moose Lake 25)
async function order() {
  const A = await openGame('order');
  await newSeason(A, 25, 175); await capture(A);
  const run = async (id, fn) => { log(`--- ${id}`); try { await fn(); } catch (e) { result(`${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 900) }); } await pullSaid(A, id); };
  await run('O0', async () => {
    const r = await p1(A, true);
    const f = await F(A, ['bundle.taken']);
    result('O0 P1 by number: the bundle taken', r.ok && f['bundle.taken'], { r, f });
  });
  // O1 before night one: the Walt side refused, the book's open refused, nothing on the page
  await run('O1', async () => {
    const pre = await A.evaluate(() => {
      const g = window.__game, j = g.journal; j.show('pack'); j.setSide('walt'); const side = j.side;
      let open = null; try { open = g.book.open('nb'); } catch (e) { open = 'err:' + e.message; }
      window.__L.step(3);
      const side2 = j.side, tab = document.querySelector('#journal .book-tab.w'); const r = { side, side2, open: open === undefined ? 'undefined' : String(open), tabHidden: tab ? tab.hidden : 'no tab', walt: g.story.walt(), found: g.story.has('nb.found') };
      if (j.open) j.close(); window.__L.step(3); return r;
    });
    result('O1 before night one: the Walt side and book.open(\'nb\') are refused, the tab hidden, the page empty', pre.side !== 'walt' && pre.side2 !== 'walt' && pre.tabHidden === true && !pre.walt.length, pre);
  });
  // O2 the crews' landing and the EP 33 crew camp first, before night one (no door, no lead, no notebook)
  await run('O2', async () => {
    const at33 = await nearPlace(A, 'ep33.crewcamp');
    const slab = await lookAt(A, 'ep33.slab'), pole = await lookAt(A, 'ep33.pole');
    const f33 = await F(A, ['crews.slab', 'crews.pole']);
    note('O2a the EP 33 crew camp before night one: slab and pole Look (when: true)', { at33, slab: slab.t, pole: pole.t, f33 });
    const W = await nearPlace(A, 'crews.landing');
    const crib = await lookAt(A, 'crews.crib', 3, 0.2), pine = await lookAt(A, 'crews.pine', 2.5, 1.2), grade = await lookAt(A, 'crews.grade', 2.5, 0.1);
    const f = await F(A, ['crews.seen', 'crews.stood', 'landing.crib', 'landing.blaze', 'landing.pink', 'landing.grade', 'nb.found', 'tier.2']);
    const s = await sceneOf(A);
    const walt = await A.evaluate(() => window.__game.story.walt());
    A.__preWalt = walt;
    await shot(A, 'O2-landing');
    result('O2b the crews\' landing before night one: no Walt-page line is written while there is no notebook (C837\'s stone stays "Stump" then; 20 §11.2 lines strike the Leads line)', !walt.length, { W, crib: crib.t, pine: pine.t, grade: grade.t, faces: [crib.face, pine.face, grade.face].map((x) => x && x.slice(0, 3)), f, walt, s });
  });
  // O3 night one, then the page: what the landing wrote, in what order, under which heads
  await run('O3', async () => {
    const nb = await findNb(A);
    const wp = await waltPage(A, 'O3');
    const s = await sceneOf(A);
    result('O3 night one after the landing: the notebook in the pockets; the page has no landing lines without the lead they answer (20 §11.2 "struck through")', nb.found && nb.pockets && !(wp.ids || []).some((i) => /^20:11\.2\.w[2-5]$/.test(i)) , { nb, wp, s });
  });
  // O4 pages read before Tauno names anything: NB20 (V.'s water), NB31 (Two Stump), NB01, NB45
  await run('O4', async () => {
    const r = {};
    for (const nb of ['NB20', 'NB31', 'NB01', 'NB45']) r[nb] = await readSpread(A, nb);
    await closeBook(A);
    const u = await A.evaluate(() => { const s = window.__game.story; return { und20: s.nbHas('und', 'NB20'), und31: s.nbHas('und', 'NB31'), und01: s.nbHas('und', 'NB01'), vw: s.has('knows.vwater'), ts: s.has('knows.twostump'), nicks: window.__game.pencil.nicknames().map((n) => [n.nick, n.matched, n.inked]) }; });
    const wp = await waltPage(A, 'O4');
    result('O4 NB20, NB31, NB01, NB45 read before anyone names them: read, nothing understood, no knows.*', Object.values(r).every(Boolean) && !u.und20 && !u.und31 && !u.und01 && !u.vw && !u.ts, { r, u, chips: wp.chips, ids: wp.ids });
  });
  // O5 the pencil before the keepers: V.'s water on Bald Eagle (Tauno never asked), the Front Porch on the wrong lake
  await run('O5', async () => {
    const p = await A.evaluate(() => {
      const g = window.__game, P = g.pencil, L = (k) => { const id = P.debug.lakeOfKey(k), l = g.world.lakes[id - 1]; return { id, x: l.cx, z: l.cz }; };
      const be = L('baldeagle'), ga = L('gabbro');
      const a = P.pencilAt('vwater', be.x, be.z), b = P.pencilAt('frontporch', ga.x, ga.z);
      P.check(); window.__L.step(4);
      const s = g.story;
      return { vw: a && { lake: a.lake, inked: a.inked }, fp: b && { lake: b.lake, inked: b.inked }, und20: s.nbHas('und', 'NB20'), und01: s.nbHas('und', 'NB01'), ink: s.get('ink.vwater') || null, inkfp: s.get('ink.frontporch') || null, walt: s.walt().filter((i) => /5\.2\.w2|11\.3/.test(i)) };
    });
    result('O5 V.\'s water pencilled on Bald Eagle before Tauno, the Front Porch on Gabbro: pencil only (no ink, nothing understood)', !p.und20 && !p.und01 && !p.ink && !p.inkfp && (!p.vw || !p.vw.inked) && (!p.fp || !p.fp.inked), p);
  });
  // O6 a keeper rings Lake One for the Front Porch while the player's pencil has it on Gabbro
  await run('O6', async () => {
    await daylight(A, 10, 1);
    await goStore(A, 25);
    const inn = await walkDoor(A, 25, 'in');
    const top = await topicsAt(A, 25);
    const k = await keeperTalk(A, 25);
    if (!k.ok) k.dbg = await A.evaluate(() => { const g = window.__game; return { inside: !!(g.outfitter.visit && g.outfitter.visit.inside), open: !!g.outfitter.open, onb: g.onboarding.pending(25), roster: (g.npcs.at(25) || []).map((v) => [v.key, v.name, !!v.keeper]), convo: window.__t.convo(), inn: null }; });
    const d = await dig(A, 'Ever hear a lake called the Front Porch?', { max: 16 });
    await hear(A, 4); await endTalk(A);
    const s = await A.evaluate(() => { const g = window.__game, st = g.story; return { ink: st.get('ink.frontporch') || null, und01: st.nbHas('und', 'NB01'), names: g.pencil.marks().filter((m) => m.kind === 'name').map((n) => [n.nick, n.lake, n.inked]), ring: !!g.pencil.ringFor('lake.lakeone'), walt: st.walt().includes('20:5.2.w2') }; });
    note('O6 the keeper\'s topics before the porch (pages read, no Tauno)', { top });
    result('O6 asked with the Front Porch pencilled on Gabbro: the ring on Lake One, the page matched (NB01 understood); the wrong pencil not inked', k.ok && d.ok && s.ring && s.und01 && !s.names.some(([n, l, i]) => n === 'frontporch' && i && l !== 'lakeone'), { k, d: d.ok ? 'ok' : d, s });
  });
  // O7 skip Tauno: the walkout by daylight stages him; walk away 40 m without a word; the keeper's topics; Farm next morning
  await run('O7', async () => {
    const w = await walkout(A, 25);
    const away = await A.evaluate(() => { const g = window.__game, T = window.__t, st = T.tauno(); if (!st) return null; const p = g.player, dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz) || 1; T.standAt(st.x + (dx / d) * 14, st.z + (dz / d) * 14); T.step(30); const c1 = T.convo(); T.standAt(st.x + (dx / d) * 45, st.z + (dz / d) * 45); T.step(90); return { c1, c2: T.convo(), tauno: T.tauno(), f: Object.fromEntries(['tauno.porch.declined1', 'tauno.talk', 'tauno.porch.done'].map((k) => [k, g.story.has(k)])) }; });
    await endTalk(A);
    const tripN0 = await A.evaluate(() => ({ n: window.__game.story.tripN(), active: !!window.__game.trip.active, d1: window.__game.story.fact('tauno.porch.declined1') }));
    const again = await walkout(A, 25);
    const top = await topicsAt(A, 25);
    await daylight(A, 8, 1);
    const farm = await walkout(A, 31);
    const tripN1 = await A.evaluate(() => ({ n: window.__game.story.tripN(), active: !!window.__game.trip.active }));
    const ft = farm.tauno ? await talkTauno(A) : null;
    await endTalk(A);
    const e = await storyErrs(A);
    note('O7c R3 needs a later trip (trips.since(declined1)>=1, 20 §9.2 "a different trip"): the trip count across the teleport to Farm', { tripN0, tripN1, farmSlot: farm.tauno && farm.tauno.slot });
    result('O7 Tauno skipped: staged on the walkout, walked past and away (no talk forced, no error); later he still has a way back in', w.tauno && away && !e.errors.length, { w, away, again, top, farm, ft: ft && { ok: ft.ok, convo: ft.convo }, e });
    const why = await A.evaluate(() => { const s = window.__game.story; return { turn: s.why('tauno.turn'), door: s.why('door.crews.taken') }; });
    note('O7b story.why after the skip', why);
  });
  const fin = await waltPage(A, 'O-end');
  note('O end: the Walt page', fin);
  await pullSaid(A, 'O-end');
  await A.context().browser().close();
}

// =====================================================================================================================
// D: decline everything (a season at Moose Lake 25): the bundle left, Josie refused, then (found) every porch no
async function decline() {
  const A = await openGame('decline');
  await newSeason(A, 25, 175); await capture(A);
  const run = async (id, fn) => { log(`--- ${id}`); try { await fn(); } catch (e) { result(`${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 900) }); } await pullSaid(A, id); };
  await run('D1', async () => {
    const r = await p1(A, false);
    const f = await F(A, ['bundle.shelf', 'bundle.taken']);
    // the first night out without the bundle: no night one
    const why = await A.evaluate(() => { const g = window.__game, inv = g.inventory, W = ['waltpack', 'walttent', 'waltstove', 'waltnotebook']; const out = []; for (const k of inv.containers) { const r = typeof inv.root === 'function' ? inv.root(k) : k; if (W.includes(k.item)) out.push({ item: k.item, where: k.where, root: r && r.where }); for (const e of k.grid || []) if (W.includes(e.id)) out.push({ id: e.id, in: k.item, where: k.where, root: r && r.where, d: r && r.at ? Math.round(inv.dist(r.at)) : null }); } return out; });
    const night = await A.evaluate(() => { const g = window.__game; const r = g.walt.onSleep ? g.walt.onSleep({ hours: 9, at: { hours: 7 } }) : 'no onSleep'; window.__L.step(10); return { r: r === undefined ? 'undefined' : r, found: g.story.has('nb.found'), due: g.walt.nightOneDue ? g.walt.nightOneDue({ hours: 9, wakeAt: 7 }) : null, carried: g.walt.carried() }; });
    result('D1 the bundle left on the shelf (an old season\'s: shelve): a night out without Walt\'s things is no night one', r.ok && f['bundle.shelf'] && !f['bundle.taken'] && !night.found && !night.carried, { r, f, night, why });
  });
  await run('D2', async () => {
    // (D1 found the notebook through the stove the shelf path hands over: a fresh season, the stove taken away, to play
    // the shelf branch as designed)
    await newSeason(A, 25, 176); await capture(A);
    await p1(A, false);
    const gone = await A.evaluate(() => { const g = window.__game, inv = g.inventory; let n = 0; for (const c of inv.containers) for (const e of (c.grid || []).slice()) if (e.id === 'waltstove') { inv.take(c.id, e.uid, e.qty || 1); n++; } window.__L.step(3); return { n, carried: g.walt.carried() }; });
    const seen = [{ gone }];
    for (let k = 0; k < 4; k++) {
      const n = await aTrip(A);
      await daylight(A, 10, 1);
      await goStore(A, 25);
      const st = await A.evaluate((e) => { window.__t.walkIn(e); window.__t.walkOut(e); window.__t.walkIn(e); window.__t.step(40); return window.__t.staged().map((s) => [s.who, s.slot && (s.slot.id || s.slot.scene || null), s.ep]); }, 25);
      const j = await A.evaluate(() => window.__t.staged().find((x) => x.who === 'josie') || null);
      let c = null, r = null;
      if (j) { await A.evaluate((k) => { const f = window.__t.figure(k); if (f) { const g = window.__game, p = g.player, dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz) || 1; window.__t.standAt(f.x + (dx / d) * 1.8, f.z + (dz / d) * 1.8); window.__t.step(10); } }, `cast:josie:${j.ep}`); const o = await talkDirect(A, `cast:josie:${j.ep}`); c = o.convo || null; r = c ? await choose(A, 'No thanks.') : null; await hear(A, 3); await endTalk(A); }
      seen.push({ trip: n, st, josie: c && c.say, ch: c && c.choices, no: r && r.ok, tripN: await A.evaluate(() => window.__game.story.tripN()) });
      await A.evaluate((e) => { window.__t.walkOut(e); window.__t.step(10); }, 25);
    }
    const f = await F(A, ['rehook.R1', 'rehook.R1b', 'bundle.taken', 'bundle.later', 'nb.found']);
    const e = await storyErrs(A);
    result('D2 four trips refusing Josie: R1 then R1b once each, then she stops pushing (the topic stays); nothing found, no story error', f['rehook.R1'] && !f['bundle.taken'] && !f['nb.found'] && !e.errors.length && seen.filter((x) => x.josie && /old stuff|still/i.test(x.josie)).length <= 2 && seen.some((x) => x.josie), { seen, f, e });
    const why = await A.evaluate(() => ({ nb: window.__game.story.why('nb.found') }));
    note('D2b why nb.found (bundle never taken)', why);
  });
  // found anyway (the story's own debug: T's declines season does it), then no at every porch scene
  await run('D3', async () => {
    await A.evaluate(() => { const g = window.__game; g.story.debug.do('found', { abs: g.story.time().abs }); window.__L.step(4); });
    await daylight(A, 10, 1);
    const w = await walkout(A, 25);
    const t = await talkTauno(A);
    const r1 = await picks(A, ['Keep walking', 'Keep walking']); await hear(A, 3); await endTalk(A);
    await aTrip(A); await daylight(A, 10, 1);
    const w3 = await walkout(A, 25);
    const t3 = w3.tauno ? await talkTauno(A) : null;
    const r3 = t3 ? await choose(A, 'Not today.') : null; await hear(A, 3); await endTalk(A);
    const f = await F(A, ['tauno.porch.declined1', 'tauno.porch.declined2', 'rehook.R3', 'tauno.porch.done']);
    // the next trips: does he ever push again (he must not past declined2, 20 §9.2); Farm's seat "Changed your mind?"
    const later = [];
    for (let k = 0; k < 3; k++) { await aTrip(A); await daylight(A, 10, 1); const x = await walkout(A, 25); later.push(x.tauno ? x.tauno.slot : null); }
    await daylight(A, 8, 1);
    const farm = await walkout(A, 31);
    const tf = farm.tauno ? await talkTauno(A) : null;
    const no = tf ? await picks(A, ['Not today.']) : null; await hear(A, 3); await endTalk(A);
    await daylight(A, 8, 1);
    const farm2 = await walkout(A, 31);
    const e = await storyErrs(A);
    result('D3 X1 (keep walking ×2), R3 "Not today.", later walkouts quiet, the Farm seat\'s "Changed your mind?" refused: no error', t.ok && r1.ok && f['tauno.porch.declined1'] && (!t3 || r3.ok) && !e.errors.length, { w, t: t.convo, r1: r1.ok, t3: t3 && t3.convo, r3, f, later, farm, tf: tf && tf.convo, no, farm2, e });
    const why = await A.evaluate(() => { const s = window.__game.story; return { turn: s.why('tauno.turn'), done: s.why('tauno.porch.done') }; });
    note('D3b after declining everything: story.why', why);
  });
  await waltPage(A, 'D-end');
  await A.context().browser().close();
}

// =====================================================================================================================
// W: three of the solver's witnesses, played in the runtime
async function wit() {
  // W1 "the porch, not warm (NB45 unread): the turn all the same" (17 moves): P1 take; night; into the store at 25;
  // T1 Sorry? T2 Walk with him; walk off at T3; Farm morning resume: T4 "What do you want from me?", T5 "I'll go look.";
  // the crib alone; Farm morning U1: "The crib's still there.", "That's all.", U3 "Away from the west shore", walk off U3b
  {
    const A = await openGame('w1');
    await newSeason(A, 25, 175); await capture(A);
    const run = async (id, fn) => { log(`--- ${id}`); try { await fn(); } catch (e) { result(`${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 900) }); } await pullSaid(A, id); };
    await run('W1', async () => {
      const steps = {};
      steps.p1 = (await p1(A, true)).ok;
      steps.night = await findNb(A);
      await daylight(A, 10, 1);
      await goStore(A, 25);
      steps.in = await walkDoor(A, 25, 'in');
      steps.armed = (await F(A, ['tauno.armed']))['tauno.armed'];
      steps.out = await walkDoor(A, 25, 'out');
      await A.evaluate(() => window.__L.step(30));
      const t = await talkTauno(A); steps.t1 = t.convo;
      steps.a = await picks(A, ['Sorry?', 'Walk with him']);
      steps.t3 = await A.evaluate(() => window.__t.convo());
      await endTalk(A); // walk off at T3 (Escape)
      steps.f1 = await F(A, ['tauno.porch.done', 'tauno.porch.warm', 'knows.walt']);
      await daylight(A, 8, 1);
      steps.farm = await walkout(A, 31);
      const tf = await talkTauno(A); steps.resume = tf.convo;
      steps.b = await picks(A, ['What do you want from me?', 'I\'ll go look.']); await hear(A, 4); await endTalk(A);
      steps.f2 = await F(A, ['door.crews.taken']);
      await nearPlace(A, 'crews.landing');
      steps.crib = (await lookAt(A, 'crews.crib', 3, 0.2)).t;
      steps.f3 = await F(A, ['landing.crib', 'crews.seen', 'landing.pink', 'landing.grade']);
      await daylight(A, 8, 1);
      steps.farm2 = await walkout(A, 31);
      const tu = await talkTauno(A); steps.u1 = tu.convo;
      steps.c = await picks(A, ['The crib\'s still there.', 'That\'s all.', 'Away from the west shore']);
      steps.u3b = await A.evaluate(() => window.__t.convo());
      await endTalk(A); // walk off at U3b
      const f = await F(A, ['tauno.turn', 'tauno.porch.warm', 'knows.eino', 'tauno.killed']);
      const e = await storyErrs(A);
      result('W1 the cold porch played in the runtime: the turn (tauno.turn) and not warm, as the solver\'s witness says', f['tauno.turn'] && !f['tauno.porch.warm'] && !e.errors.length, { steps, f, e, stage: await A.evaluate(() => window.__game.story.stage) });
    });
    await waltPage(A, 'W1-end');
    await A.context().browser().close();
  }
  // W2 the re-entry "X2: the door declined ("Not my business.")": T5 "I'm just here to paddle." → X2; three trips on
  // R5 "Still just here to paddle?"; then the door taken all the same
  {
    const A = await openGame('w2');
    await newSeason(A, 25, 176); await capture(A);
    const run = async (id, fn) => { log(`--- ${id}`); try { await fn(); } catch (e) { result(`${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 900) }); } await pullSaid(A, id); };
    await run('W2', async () => {
      const steps = {};
      steps.p1 = (await p1(A, true)).ok;
      steps.night = await findNb(A);
      await daylight(A, 10, 1);
      steps.w = await walkout(A, 25);
      const t = await talkTauno(A); steps.t1 = t.convo;
      steps.a = await picks(A, ['Sorry?', 'Walk with him', 'Who\'s Walt?', 'What do you want from me?', 'I\'m just here to paddle.']);
      await hear(A, 4); await endTalk(A);
      steps.f1 = await F(A, ['door.crews.declined', 'tauno.porch.done']);
      steps.leads1 = (await sceneOf(A)).leads;
      const tries = [];
      for (let k = 0; k < 4; k++) {
        steps[`trip${k}`] = await aTrip(A);
        await daylight(A, 10, 1);
        const x = await walkout(A, 25);
        tries.push({ k, tauno: x.tauno && { slot: x.tauno.slot, ep: x.tauno.ep } });
        if (x.tauno && x.tauno.slot === 'R5') break;
      }
      steps.tries = tries;
      const t5 = await talkTauno(A); steps.r5 = t5.convo;
      steps.b = await picks(A, ['Maybe not.', 'I\'ll go look.']); await hear(A, 4); await endTalk(A);
      const f = await F(A, ['door.crews.declined', 'door.crews.taken', 'rehook.R5']);
      const e = await storyErrs(A);
      result('W2 X2 then R5 three trips on: "Still just here to paddle?" and the door taken all the same', f['door.crews.declined'] && f['door.crews.taken'] && /paddle/i.test((steps.r5 && steps.r5.say) || '') && !e.errors.length, { steps, f, e });
    });
    await A.context().browser().close();
  }
  // W3 the fallbacks: after dark nobody stops you, the next daylight walkout does; a store with no porch: his truck
  {
    const A = await openGame('w3');
    await newSeason(A, 25, 177); await capture(A);
    const run = async (id, fn) => { log(`--- ${id}`); try { await fn(); } catch (e) { result(`${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 900) }); } await pullSaid(A, id); };
    await run('W3', async () => {
      await p1(A, true); await findNb(A);
      await clockTo(A, 22.5, 1);
      const dark = await walkout(A, 25);
      const darkF = await F(A, ['tauno.armed']);
      await clockTo(A, 10, 1);
      const day = await walkout(A, 25);
      result('W3a after dark nobody stops you; the next daylight walkout does', !dark.tauno && day.tauno && day.tauno.ep === 25, { dark, darkF, day });
      // a store with no porch, as home (Tauno's first walkout there: one push a trip, so a season of its own)
      const np = await A.evaluate(async () => { const g = window.__game, O = await import('/src/outfitters.js'); return g.world.entryPoints.filter((e) => O.isOutfitter(e.ep)).map((e) => e.ep); });
      let found = null;
      for (const ep of np) {
        if (ep === 25) continue;
        await goStore(A, ep);
        const look = await A.evaluate((e) => { const L = window.__game.outfitter.layout(e); return L ? { porch: !!(L.look && L.look.porch) } : null; }, ep);
        if (look && !look.porch) { found = ep; break; }
      }
      if (!found) { note('W3b no outfitter without a porch', { np }); return; }
      await newSeason(A, found, 178); await capture(A);
      await p1(A, true); await findNb(A);
      await clockTo(A, 10, 1);
      const w = await walkout(A, found);
      const fig = w.tauno ? await A.evaluate((k) => window.__t.figure(k), `cast:tauno:${w.tauno.ep}`) : null;
      await shot(A, 'W3-truck');
      result(`W3b a home store with no porch (EP ${found}): the first walkout after the return, Tauno at his truck, drawn, on the ground`, w.tauno && w.tauno.slot !== 'porch' && fig && fig.drawn && Math.abs(fig.y - fig.ground) < 0.4, { found, w, fig });
      const t = w.tauno ? await talkTauno(A) : null;
      note('W3c at the truck: his first line', { convo: t && t.convo });
      await endTalk(A);
    });
    await A.context().browser().close();
  }
}

// =====================================================================================================================
// S: saves with Round 1's state
const flushAll = (page) => page.evaluate(async () => { const g = window.__game, s = g.story; try { s.flush && s.flush(); } catch { /* */ } try { g.inventory && g.inventory.write && g.inventory.write(); } catch { /* */ } try { g.saver && g.saver.write && g.saver.write(); } catch { /* */ } try { g.slots.flush(); } catch { /* */ } await new Promise((r) => setTimeout(r, 150)); if (g.store.flush) await g.store.flush(); await new Promise((r) => setTimeout(r, 400)); });
async function reopen(page, q) {
  await page.goto(`${APP}/${q ? '?' + q : ''}`, { timeout: 180000 }); await booted(page);
  await page.evaluate(() => { const g = window.__game; if (g.title.state === 'title' && g.profile.started) g.title.continueTrip(); });
  await page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 200000, polling: 250 });
  if (q && q.includes('story=1')) await page.waitForFunction(() => !!(window.__game.storySeams && window.__game.storySeams.feed && window.__game.book && window.__game.storyTalk && window.__game.pencil), null, { timeout: 60000, polling: 250 }).catch(() => null);
  await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(HELPERS_J); await capture(page);
  await page.evaluate(() => window.__L.step(30));
}
const snap = (page) => page.evaluate(() => {
  const g = window.__game, s = g.story, inv = g.inventory, nbAt = [];
  for (const c of inv.containers) for (const e of c.grid || []) if (e.id === 'waltnotebook') nbAt.push(c.item || c.where);
  const on = s.v === 2;
  return {
    v: s.v ?? 1, live: g.slots.live, season: g.profile.seasonId, trip: !!(g.trip && g.trip.active), nbAt,
    facts: on ? Object.keys(s.facts()).sort() : null, walt: on ? s.walt() : null, read: on ? ['NB01', 'NB45', 'NB20', 'NB31'].filter((n) => s.nbHas('read', n)) : (s.state && s.state.read ? s.state.read.slice() : null),
    pencil: on && g.pencil ? g.pencil.marks().map((m) => [m.kind, m.nick || m.id || m.label || m.nb || '', !!m.inked]).sort() : null,
    leads: on && g.leads ? Object.fromEntries(['crews', 'tauno'].map((l) => [l, g.leads.state(l)])) : null,
    v1: on ? null : s.state && s.state.notebook, cut: !!(g.walt.cut && g.walt.cut.active), paper: g.hud && g.hud.paper ? String(g.hud.paper) : null,
    tab: (() => { const t = document.querySelector('#journal .book-tab.w'); return t ? !t.hidden : null; })(), errs: on ? s.debug.errors().slice(0, 5) : null,
  };
});
async function saves() {
  const A = await openGame('saves');
  await newSeason(A, 25, 175); await capture(A);
  const run = async (id, fn) => { log(`--- ${id}`); try { await fn(); } catch (e) { result(`${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 900) }); } await pullSaid(A, id); };
  let s0 = null;
  await run('S1', async () => {
    await p1(A, true); await findNb(A);
    await readSpread(A, 'NB45'); await readSpread(A, 'NB01'); await closeBook(A);
    await A.evaluate(() => { const g = window.__game, P = g.pencil, id = P.debug.lakeOfKey('lakeone'), l = g.world.lakes[id - 1]; P.pencilAt('frontporch', l.cx, l.cz); P.ring({ place: 'ep33', label: 'Little Gabbro', by: 'Chk', lead: 'crews' }); window.__L.step(5); });
    await A.evaluate(() => { const g = window.__game; g.trip.start({ ep: g.profile.home, foodDays: 2, canoe: 'aluminium' }); g.step(1 / 30, 30); });
    await flushAll(A);
    s0 = await snap(A);
    await reopen(A, 'story=1');
    const s1 = await snap(A);
    const same = JSON.stringify({ ...s0, cut: 0, paper: 0, errs: 0 }) === JSON.stringify({ ...s1, cut: 0, paper: 0, errs: 0 });
    result('S1 mid-trip, the notebook read in part, a name pencilled and a ring: reload under the flag keeps all of it, no cutscene replay', same && s1.trip && !s1.cut && s1.nbAt.includes('pockets'), { s0, s1 });
  });
  await run('S2', async () => {
    await reopen(A, '');
    const off = await snap(A);
    // flag off: main's game; the notebook (bound only with the story on) set down at the player's feet, then the pack
    const drop = await A.evaluate(() => { const g = window.__game, inv = g.inventory, pk = inv.pockets, e = pk.grid.find((q) => q.id === 'waltnotebook'); if (!e) return 'no notebook'; let r = null; try { r = inv.drop ? inv.drop(pk.id, e.uid) : 'no drop'; } catch (err) { r = 'err:' + err.message; } window.__L.step(5); return { r: r && typeof r === 'object' ? { ok: r.ok, why: r.why } : r, at: inv.containers.filter((c) => (c.grid || []).some((q) => q.id === 'waltnotebook')).map((c) => c.item) }; });
    await flushAll(A);
    await reopen(A, 'story=1');
    const on2 = await snap(A);
    const wp = await waltPage(A, 'S2');
    await flushAll(A);
    await reopen(A, '');
    const off2 = await snap(A);
    result('S2 flag off → on → off: the v1 echo has the notebook found; back on, the story\'s facts, reads, pencil and leads as they were; off again, no error', off.v === 1 && off.v1 && off.v1.found && JSON.stringify(on2.facts) === JSON.stringify(s0.facts) && JSON.stringify(on2.pencil) === JSON.stringify(s0.pencil) && JSON.stringify(on2.read) === JSON.stringify(s0.read) && off2.v1 && off2.v1.found && !(on2.errs || []).length, { off, drop, on2, wp: wp && { off: wp.off, n: (wp.lines || []).length }, off2 });
    note('S2b the notebook set down with the flag off, then the flag on: where it is, and the Walt side', { drop, nbAt: on2.nbAt, tab: on2.tab });
  });
  await run('S3', async () => {
    await reopen(A, 'story=1');
    const before = await snap(A);
    const ex = await A.evaluate(async () => { const g = window.__game; g.slots.flush(); await new Promise((r) => setTimeout(r, 300)); const r = await g.slots.exportSeason(g.slots.live); return r && r.text; });
    writeFileSync(path.join(OUT, 'season-c1-on.json'), ex || '');
    await A.evaluate(async (t) => window.__game.slots.importSeason(t, 3), ex);
    await A.waitForTimeout(2500); await booted(A);
    const nav = A.waitForNavigation({ timeout: 120000 }).catch(() => null); await A.evaluate(() => window.__game.slots.play(3)); await nav; await booted(A);
    await reopen(A, 'story=1');
    const three = await snap(A);
    result('S3 export (flag on) → import into slot 3 → played: the facts, the Walt lines, the pencil, the leads travel with it', three.live === 3 && JSON.stringify(three.facts) === JSON.stringify(before.facts) && JSON.stringify(three.pencil) === JSON.stringify(before.pencil) && JSON.stringify(three.walt) === JSON.stringify(before.walt), { before, three });
    // two slots: slot 1 back, untouched by slot 3's play
    await A.evaluate(() => { const g = window.__game; g.story.debug.set('crews.slab'); g.story.flush(); });
    await flushAll(A);
    const nav2 = A.waitForNavigation({ timeout: 120000 }).catch(() => null); await A.evaluate(() => window.__game.slots.play(1)); await nav2; await booted(A);
    await reopen(A, 'story=1');
    const one = await snap(A);
    result('S3b two slots: slot 1 back keeps its own story (slot 3\'s new fact not in it)', one.live === 1 && !one.facts.includes('crews.slab') && one.facts.includes('nb.found'), { one });
  });
  // S4 a main-made season (v1 story, the notebook found in main and page 0 read, a flag) imported and played under the flag
  if (SEASON && existsSync(SEASON)) await run('S4', async () => {
    const text = readFileSync(SEASON, 'utf8');
    await A.evaluate(async (t) => window.__game.slots.importSeason(t, 2), text);
    await A.waitForTimeout(2500); await booted(A);
    const nav = A.waitForNavigation({ timeout: 120000 }).catch(() => null); await A.evaluate(() => window.__game.slots.play(2)); await nav; await booted(A);
    await reopen(A, 'story=1');
    const s = await snap(A);
    const wp = await waltPage(A, 'S4');
    const rd = await readSpread(A, 'NB45'); await closeBook(A);
    await daylight(A, 10, 1);
    const w = await walkout(A, 25);
    const armed = await F(A, ['tauno.armed']);
    const t = w.tauno ? await talkTauno(A) : null; await endTalk(A);
    result('S4 a main-made season under the flag: v2 from v1, nb.found, the Walt side and page, a page read, the return arms the porch and Tauno stops you', s.v === 2 && s.facts.includes('nb.found') && s.tab && wp && !wp.off && rd && armed['tauno.armed'] && !!w.tauno && !(s.errs || []).length, { s, wp: wp && { lines: wp.lines, off: wp.off }, rd, w, armed, t: t && t.convo });
    note('S4b where main put the notebook, as the flag-on game sees it (bound: pockets or a hand only)', { nbAt: s.nbAt });
  });
  await A.context().browser().close();
}

// =====================================================================================================================
// C: a co-op guest (needs RELAY): the guest's own season found the notebook; the host's story is further on
async function coop() {
  if (!RELAY) { note('coop skipped: no RELAY'); return; }
  const B = await openGame('guest');
  await newSeason(B, 31, 180); await capture(B);
  await p1(B, true); await findNb(B);
  await readSpread(B, 'NB45'); await closeBook(B);
  await flushAll(B);
  const own = await B.evaluate(() => ({ s2: window.__game.store.getItem('bwca-canoe:story2'), season: window.__game.profile.seasonId }));
  const A = await openGame('host');
  await newSeason(A, 25, 176); await capture(A);
  await p1(A, true); await findNb(A);
  await daylight(A, 10, 1);
  await goStore(A, 25); await A.evaluate((e) => { window.__t.walkIn(e); window.__t.step(20); }, 25);
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Host', shirt: 2 }));
  await B.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}&story=1&join=${code}`, { timeout: 180000 }); await booted(B);
  await B.waitForFunction(() => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); }, null, { timeout: 120000 });
  await B.fill('#coop-name', 'Ada'); await B.click('#coop-go');
  await B.waitForFunction(() => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.storyLayer, null, { timeout: 150000, polling: 250 });
  await B.evaluate(HELPERS_L); await B.evaluate(HELPERS_T); await B.evaluate(HELPERS_J); await capture(B);
  const run = async (id, fn) => { log(`--- ${id}`); try { await fn(); } catch (e) { result(`${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 900) }); } await pullSaid(A, `${id}-host`); await pullSaid(B, `${id}-guest`); };
  await run('C1', async () => {
    const g = await B.evaluate(() => { const g = window.__game, l = g.storyLayer, tab = document.querySelector('#journal .book-tab.w'); return { mode: g.story.mode, found: g.story.has('nb.found'), tab: tab ? !tab.hidden : null, nb: g.inventory.containers.some((c) => (c.grid || []).some((e) => e.id === 'waltnotebook')), stump: l.dotName ? l.dotName('ws.c837.stump') : null, verbs: l.verbs ? l.verbs('ws.c837.stump').length : null, cribVerbs: l.verbs ? l.verbs('crews.crib').length : null, rings: g.pencil ? g.pencil.marks().length : null, hostCast: !!(g.storyTalk) }; });
    const side = await B.evaluate(() => { const g = window.__game, j = g.journal; j.show('pack'); j.setSide('walt'); const on = j.side === 'walt'; let lines = null, nb = null; if (on && g.book) { g.book.view = 'walt'; g.book.render(true); const el = document.querySelector('#journal .side.w'); lines = el ? [...el.querySelectorAll('.cb-line')].map((n) => n.textContent).slice(0, 12) : null; g.book.view = 'nb'; g.book.render(true); nb = el ? el.innerText.slice(0, 300) : null; } j.close(); window.__L.step(3); return { on, lines, nb, opened: g.book && g.book.opened }; });
    await shot(B, 'C1-guest-walt');
    g.side = side;
    result('C1 the guest (its own season found the notebook): mirror; no Walt side, no notebook in the visit\'s things; the stone reads "Stump", no verb; nothing pencilled', g.mode === 'mirror' && !g.tab && !side.on && !g.nb && g.stump === 'Stump' && g.verbs === 0 && !g.rings, g);
  });
  await run('C2', async () => {
    // both at Moose Lake by day: the host walks out (Tauno for the host); the guest walks out too
    const h = await walkout(A, 25);
    const gw = await walkout(B, 25);
    const ht = h.tauno ? await talkTauno(A) : null;
    const r = ht ? await picks(A, ['Sorry?', 'Walk with him']) : null; await endTalk(A);
    const gs = await B.evaluate(() => ({ staged: window.__t.staged().map((s) => s.who), convo: window.__t.convo(), facts: Object.keys(window.__game.story.facts()).length }));
    const hf = await F(A, ['tauno.porch.done', 'knows.walt']);
    result('C2 host and guest walk out together: Tauno stops the host only (the host\'s porch moves); the guest has no cast and no facts', h.tauno && !gw.tauno && ht && ht.ok && r && r.ok && hf['tauno.porch.done'] && !gs.staged.includes('tauno') && gs.facts === 0, { h, gw, ht: ht && ht.convo, r, gs, hf });
  });
  await run('C3', async () => {
    // the guest at the crews' landing looks at the crib: the host's story does not move, the guest's does not either
    await nearPlace(B, 'crews.landing');
    const look = await lookAt(B, 'crews.crib', 3, 0.2);
    const hf = await F(A, ['crews.seen', 'landing.crib']);
    const gf = await B.evaluate(() => Object.keys(window.__game.story.facts()));
    result('C3 the guest Looks at the crib: neither story moves', !hf['crews.seen'] && !gf.length, { look: look.t, hf, gf });
  });
  await run('C4', async () => {
    const nav = B.waitForNavigation({ timeout: 120000 }).catch(() => null);
    await B.evaluate(() => window.__game.coop.leave()); await nav; await booted(B); await B.waitForTimeout(2000);
    const back = await B.evaluate(() => ({ s2: window.__game.store.getItem('bwca-canoe:story2'), season: window.__game.profile.seasonId, mode: window.__game.story.mode }));
    result('C4 the guest back home: its own story2 byte for byte, live', back.s2 === own.s2 && back.season === own.season && back.mode === 'live', { same: back.s2 === own.s2, season: [own.season, back.season], mode: back.mode });
  });
  await A.context().browser().close(); await B.context().browser().close();
}

// probe: why a talk does not open
async function probe() {
  const A = await openGame('probe');
  await newSeason(A, 25, 175); await capture(A);
  await p1(A, true); await findNb(A);
  await daylight(A, 10, 1);
  const w = await walkout(A, 25);
  const dbg = async (key) => A.evaluate((key) => { const g = window.__game, n = g.npcs, v = n.find(key); if (!v) return { none: true }; let sp = null; try { sp = n.speakerOf(v); } catch (e) { sp = 'err:' + e.message; } return { extra: !!v.extra, keeper: !!v.keeper, sp: sp && (sp.name || sp), talk: typeof (v.extra && v.extra.talk), convo: window.__t.convo(), j: g.journal.open, o: !!g.outfitter.open, paper: g.hud && g.hud.paperOpen ? g.hud.paperOpen() : null, title: g.title.state }; }, key);
  const t = w.tauno;
  const before = t ? await dbg(`cast:tauno:${t.ep}`) : null;
  const r = t ? await A.evaluate((k) => { const x = window.__t.talkTo(k); return x === undefined ? 'undefined' : JSON.stringify(x).slice(0, 200); }, `cast:tauno:${t.ep}`) : null;
  await A.evaluate(() => window.__L.step(10)); await A.waitForTimeout(200);
  const after = t ? await dbg(`cast:tauno:${t.ep}`) : null;
  for (let k = 0; k < 6; k++) await A.evaluate(() => window.__L.step(30));
  const r2 = t ? await A.evaluate((k) => { const x = window.__t.talkTo(k); return x === undefined ? 'undefined' : JSON.stringify(x).slice(0, 200); }, `cast:tauno:${t.ep}`) : null;
  await A.waitForTimeout(200);
  const after2 = t ? await dbg(`cast:tauno:${t.ep}`) : null;
  note('probe Tauno talk', { w, before, r, after, r2, after2 });
  await A.context().browser().close();
}

// =====================================================================================================================
// the text check: every captured line against the extract
function textCheck() {
  const DIR = path.join(ROOT, 'src/story-data/text');
  const norm = (s) => String(s || '').replace(/[’‘]/g, '\'').replace(/[“”]/g, '"').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  const exact = new Set(), tmpl = [];
  const reOf = (n) => new RegExp('^' + n.split(/\{[^}]+\}/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?') + '$');
  const addC = (t) => { const n = norm(t); if (!n) return; if (/\{[^}]+\}/.test(n)) { tmpl.push(reOf(n)); if (/ behind the \{/.test(n)) tmpl.push(reOf(n.replace(/ behind the \{/, ' {'))); } else exact.add(n); };
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(path.join(DIR, f), 'utf8')).text || {};
    for (const e of Object.values(j)) {
      if (!e || typeof e.text !== 'string') continue;
      addC(e.text);
      for (const m of e.text.matchAll(/"([^"]+)"/g)) addC(m[1]);
      for (const line of e.text.split('\n')) addC(line);
    }
  }
  const corpus = [...exact].join('\n');
  // a line is the extract's when it is an entry (or a quote in one), a template filled, or (a line put together from
  // pieces: P1's back room, a row's quotes) every sentence of it is somewhere in the extract
  const known = (s) => { const n = norm(s); if (!n) return true; if (exact.has(n)) return true; if (tmpl.some((r) => r.test(n))) return true;
    const parts = n.split(/(?<=[.?!])\s+/).map((x) => x.replace(/^[…."]+|[…"]+$/g, '').trim()).filter((x) => x.length > 6);
    return parts.length > 0 && parts.every((x) => corpus.includes(x) || corpus.includes(x.replace(/[.?!]$/, ''))); };
  const bad = [], unk = [], seenStory = new Set(), game = new Set();
  const GAME = ['onboarding.js', 'starter.js', 'npcs.js'].map((f) => { try { return readFileSync(path.join(ROOT, 'src', f), 'utf8'); } catch { return ''; } }).join('\n'); // (the game's own lines, said by the cast in the onboarding)
  const STORYWHO = /Tauno|old man|Josie/i;
  for (const x of SAID) {
    const all = [x.say, ...(x.ch || [])];
    for (const t of all) if (/\{[\w.]+\}|undefined|\bnull\b|NaN|\[object/.test(String(t))) bad.push({ tag: x.tag, who: x.who, t });
    if ((STORYWHO.test(x.who || '') && (!x.by || STORYWHO.test(x.by))) || STORYWHO.test(x.by || '')) {
      for (const t of all) { if (!t || t === '…' || /^(Goodbye\.|Bye\.|That’s all\.|That's all\.)$/.test(t)) continue; seenStory.add(t); if (GAME.includes(String(t).slice(0, 40))) { game.add(t); continue; } if (!known(t)) unk.push({ tag: x.tag, who: x.who, by: x.by, t: String(t).slice(0, 200) }); }
    }
  }
  const wl = [];
  for (const w of WALTP) { const base = norm(w.line).replace(/\s*\((ringed)\)$/, ''); if (!known(base) && !known(norm(w.line))) wl.push(w); }
  result('text: no captured line shows a raw {token}, undefined, null or NaN', !bad.length, { n: SAID.length, bad: bad.slice(0, 20) });
  result('text: every line Tauno or Josie said (and every choice offered in their talks) is the extract\'s words', !unk.length, { lines: seenStory.size, gameLines: [...game].map((t) => String(t).slice(0, 80)), unknown: [...new Map(unk.map((u) => [u.t, u])).values()].slice(0, 30) });
  result('text: every Walt-page line drawn is the extract\'s words', !wl.length, { lines: WALTP.length, unknown: [...new Map(wl.map((u) => [u.line, u])).values()].slice(0, 30) });
}

// =====================================================================================================================
if (arg('said', null)) { // the text check alone, on a run's chk-c1-said.json (no browser)
  const j = JSON.parse(readFileSync(String(arg('said')), 'utf8')); SAID.push(...j.said); WALTP.push(...j.walt);
  textCheck(); for (const r of results) if (r.pass === false) console.log(JSON.stringify(r.more, null, 1).slice(0, 6000));
  process.exit(0);
}
try {
  for (const [id, fn] of [['order', order], ['decline', decline], ['wit', wit], ['saves', saves], ['coop', coop], ['probe', probe]]) {
    if (ONLY && !ONLY.has(id)) continue;
    log(`=== ${id}`);
    try { await fn(); } catch (e) { result(`${id} ran to its end`, false, { error: String(e && e.stack || e).slice(0, 1500) }); }
    for (const b of browsers.splice(0)) { try { await b.close(); } catch { /* */ } }
  }
  if (SAID.length || WALTP.length) textCheck();
} finally { for (const b of browsers) { try { await b.close(); } catch { /* */ } } }
result('no page errors', !errors.length, { errors: errors.slice(0, 12) });
writeFileSync(path.join(OUT, 'chk-c1-said.json'), JSON.stringify({ said: SAID, walt: WALTP }, null, 1));
const pass = results.filter((r) => r.pass === true).length, fail = results.filter((r) => r.pass === false).length;
writeFileSync(path.join(OUT, 'chk-c1.json'), JSON.stringify({ pass, fail, results }, null, 1));
log(`chk-c1: ${pass} PASS, ${fail} FAIL, ${results.length - pass - fail} NOTE`);
process.exit(0);
