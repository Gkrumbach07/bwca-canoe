// chk-c2a.mjs: the chapter 2 playtest checker (story Round 2). Plays the second slice as a new player would see it, on the
// slice's own sections (scripts/slice/c2-mining.mjs, c2-director.mjs, c2-episodes.mjs: the state each step leaves is the
// slice's), and between them looks: a screenshot of every scene and paper, the screen's text, every line said or shown
// (dialogue, barks, notes, hints, chips) recorded and checked against the docs' anchors (src/story-data/text/*.json),
// the people on the ground and out of the walls, the dot on each person, the board and the trip card as a player opens
// them (E), the book's journal/Walt/Stories sides, the purse before and after every pay, and what the player has as a
// next step after each one.
//
//   APP=http://localhost:5991 node scripts/chk-c2a.mjs [--shots dir] [--out dir] [--only A|B]
// Writes <out>/chk-c2a.json (looks, lines, findings) and prints a summary. Exit 0 always (a playtest, not a gate) unless
// the rig itself throws.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T } from './slice/c1-talk.mjs';
import { HELPERS_A2, setup as A2_SETUP, steps as A2_STEPS } from './slice/c2-mining.mjs';
import { HELPERS_D, steps as D_STEPS } from './slice/c2-director.mjs';
import { HELPERS_E, steps as E_STEPS } from './slice/c2-episodes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const OUT = path.resolve(String(arg('out', 'chk-c2a-out')));
const SHOTS = path.resolve(String(arg('shots', path.join(OUT, 'shots'))));
const ONLY = arg('only', null);
const APP = (process.env.APP || 'http://localhost:5991').replace(/\/$/, '');
mkdirSync(OUT, { recursive: true }); mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [], looks = [], notes = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };
const note = (sev, where, what, more = {}) => { notes.push({ sev, where, what, more }); log(`NOTE[${sev}] ${where}: ${what}`, JSON.stringify(more).slice(0, 700)); };

function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const browsers = [];
async function openGame(name) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(browser);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /story|mining|kettle|episode|beat|show|talk|cast/i.test(m.text()))) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/?story=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.story && (window.__game.title.state === 'title' || window.__game.title.state === 'game') && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  log(`[${name}] loaded`);
  return page;
}
async function newSeason(page, home, doy) {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting && window.__game.storySeams && window.__game.storySeams.feed && window.__game.book && window.__game.storyTalk && window.__game.pencil, null, { timeout: 200000, polling: 250 });
  await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(RECORDER);
}

// --- in the page: every line said or shown, recorded (window.__C) ------------------------------------------------------
const RECORDER = () => {
  const g = window.__game, C = window.__C = { log: [], step: 'boot', seen: new Set() };
  const clock = () => { const d = g.day; return d ? `${d.doy} ${String(Math.floor(d.hours)).padStart(2, '0')}:${String(Math.floor((d.hours % 1) * 60)).padStart(2, '0')}` : ''; };
  const rec = (kind, who, text) => { if (text == null || text === '') return; text = String(text); const k = `${C.step}|${kind}|${who}|${text}`; if (C.seen.has(k)) return; C.seen.add(k); C.log.push({ step: C.step, kind, who: who || '', text, at: clock() }); };
  C.rec = rec;
  const D = g.dialogue;
  if (D && !D.__c) {
    D.__c = true;
    const rem = D.remember.bind(D); D.remember = (name, role, text) => { rec('line', name, text); return rem(name, role, text); };
    const ren = D.render.bind(D); D.render = () => { const c = D.convo; if (c && c.node) { if (c.node.plain) rec('plain', c.name, c.node.say); for (const o of c.node.choices || []) rec('choice', c.name, o.text); } return ren(); };
  }
  const H = g.hud;
  if (H && !H.__c) {
    H.__c = true;
    if (H.note) { const n0 = H.note.bind(H); H.note = (t, s) => { rec('note', '', typeof t === 'string' ? t : (t && t.textContent) || String(t)); return n0(t, s); }; }
    if (H.showPlace) { const p0 = H.showPlace.bind(H); H.showPlace = (k, n, s, sec) => { rec('place', k || '', [n, s].filter(Boolean).join(' · ')); return p0(k, n, s, sec); }; }
  }
  const Hi = g.hints;
  if (Hi && !Hi.__c) { Hi.__c = true; const s0 = Hi.show.bind(Hi); Hi.show = (m, text, ...r) => { rec('hint', m && m.id || '', String(text || '').replace(/<[^>]+>/g, '')); return s0(m, text, ...r); }; }
  const Ch = g.chip;
  if (Ch && !Ch.__c) { Ch.__c = true; const c0 = Ch.set.bind(Ch); Ch.set = (key, what, icon) => { rec('chip', key || '', typeof what === 'string' ? what : JSON.stringify(what)); return c0(key, what, icon); }; }
  // the veil's cards (rides, cutscenes)
  const V = g.veil;
  if (V && V.card && !V.__c) { V.__c = true; const v0 = V.card.bind(V); V.card = (c) => { rec('card', c && c.kicker || '', [c && c.text, c && c.sub].filter(Boolean).join(' · ')); return v0(c); }; }
  return true;
};

// --- the look: a screenshot, the screen's words, the state a player would care about ----------------------------------
const STATE = () => {
  const g = window.__game, p = g.player, s = g.story, d = g.day;
  const dow = new Date(Date.UTC(d.year, 0, d.doy)).getUTCDay();
  const tasks = [...(g.tasks.ads ? g.tasks.ads.values() : [])].filter((t) => t && !['done', 'expired', 'gone'].includes(t.status)).map((t) => `${t.title || t.kind} [${t.status}${t.pay ? ` $${t.pay}` : ''}]`);
  const leads = g.leads ? g.leads.list().filter((l) => l.state && l.state !== 'closed' && l.state !== 'done').map((l) => `${l.id}:${l.state}${l.ring ? ' (ring)' : ''}`) : [];
  const rings = g.storySeams && g.storySeams.pencil ? g.storySeams.pencil.marks().filter((m) => m.kind === 'ring').map((m) => `${m.label || ''}${m.who ? ` (${m.who})` : ''}`) : [];
  const near = [];
  const npc = g.npcs;
  const blocked = (x, z, y) => { try { const nr = g.tiles.treesNear(x, z, 2.5); return p.blockedAt(x, z, y, nr) ? nr.filter((t) => (t.box ? Math.abs((x - t.x) * t.ux + (z - t.z) * t.uz) < t.hx + 0.3 && Math.abs(-(x - t.x) * t.uz + (z - t.z) * t.ux) < t.hz + 0.3 : Math.hypot(x - t.x, z - t.z) < (t.r || 0.5) + 0.3)).map((t) => t.kind || (t.box ? 'box' : t.shape ? 'rock' : 'trunk')).slice(0, 3) : null; } catch { return 'err'; } };
  // the surface under a figure: a ray down from 1.2 m over its feet onto whatever is drawn there (a store's floor, the
  // dock's deck, a bench), the figure's own meshes skipped; else the terrain
  const TH = g.THREE, rc = TH ? new TH.Raycaster() : null;
  const under = (x, y, z, self) => { try { return under0(x, y, z, self); } catch (e) { window.__C.underErr = String(e && e.message || e); return p.groundAt(x, z); } };
  const under0 = (x, y, z, self) => {
    if (!rc) return p.groundAt(x, z);
    rc.set(new TH.Vector3(x, y + 1.2, z), new TH.Vector3(0, -1, 0)); rc.far = 4; rc.camera = g.camera; // (sprites want the camera)
    const own = (o) => { for (let q = o; q; q = q.parent) if (q === self) return true; return false; };
    const hits = rc.intersectObjects(g.scene.children, true).filter((h) => h.object.visible && !own(h.object) && !h.object.isSkinnedMesh && !(h.object.material && h.object.material.transparent && h.object.material.opacity < 0.5));
    const gy = p.groundAt(x, z);
    return hits.length ? Math.max(hits[0].point.y, gy) : gy;
  };
  if (npc && npc.rosters) for (const list of npc.rosters.values()) for (const v of list) {
    const f = v.figs && v.figs[0]; if (!f) continue;
    const dd = Math.hypot(f.x - p.x, f.z - p.z); if (dd > 60) continue;
    const b = npc.bodies.find((x) => x.who && x.who.person === v);
    const gy = under(f.x, f.y, f.z, b && b.group);
    const sit = !!((f.spec && f.spec.pose === 'sit') || f.seat || f.sitting || (v.slot && /bench|seat|table|chair/.test(String(v.slot.at || v.slot.id || v.at || ''))) || /sit/.test(String(f.pose || f.anim || '')));
    near.push({ who: v.name || v.key, key: v.key, d: Math.round(dd), dy: +(f.y - gy).toFixed(2), drawn: !!(b && b.group.visible), sit, in: sit ? null : blocked(f.x, f.z, f.y) });
  }
  const M = g.storyMining;
  const field = [];
  if (M) {
    const fp = (f, tag) => { if (!f) return; const ay = f.a && f.a.group ? f.a.group.position.y : null; const gy = under(f.x, ay != null ? ay : f.groundY(), f.z, f.a && f.a.group); field.push({ who: tag, d: Math.round(Math.hypot(f.x - p.x, f.z - p.z)), dy: ay != null ? +(ay - gy).toFixed(2) : null, in: blocked(f.x, f.z, gy) }); };
    try { fp(M.kettle.tasha && M.kettle.tasha(), 'tasha@kettle'); } catch { /* */ }
    const S = M.miningCast.slab; if (S) { fp(S.tauno, 'tauno@slab'); fp(S.tasha, 'tasha@slab'); }
  }
  const t = g.pointer && g.pointer.target;
  const paper = g.hud.paper || null;
  return {
    clock: `${d.year}-${d.doy} (dow ${dow}) ${d.hours.toFixed(2)}`, money: g.profile.s.money, at: [Math.round(p.x), Math.round(p.z)], mode: p.mode, onFoot: !!p.onFoot,
    trip: g.trip.active ? { n: s.tripN, day: g.trip.days || null } : null, inside: !!(g.outfitter.visit && g.outfitter.visit.inside), visit: g.outfitter.visit ? g.outfitter.visit.ep : null,
    title: g.title.state, paper, convo: g.dialogue.convo ? { who: g.dialogue.convo.name, say: g.dialogue.convo.node && g.dialogue.convo.node.say } : null,
    dot: t ? { label: t.label || '', verb: t.e ? t.e.verb : t.verb || null, ref: t.ref || null } : null,
    stage: s.stage, tier: s.tier, tasks, leads, rings: rings.slice(-8), nRings: rings.length, near, field,
    eps: s.episodes && s.episodes.open ? s.episodes.open().map((e) => e.id || e) : null,
  };
};
const SCREEN = () => {
  // the words on screen, top-level visible text only (innerText skips display:none), split to lines, de-duplicated
  const t = (document.body.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return [...new Set(t)].slice(0, 160);
};

// where a store person stands as a player looks from outside: the figure against the porch bench's seats, the door, the
// café's spots; its pose
const WHERE = (key) => {
  const g = window.__game, S = g.outfitter.layout(31), n = g.npcs; let v = null;
  for (const list of n.rosters.values()) for (const q of list) if (q.key === key) v = q;
  if (!v || !S) return { none: key };
  const f = v.figs[0], d = (q) => (q ? +Math.hypot(f.x - q.x, f.z - q.z).toFixed(2) : null);
  const c = S.centre, a = S.axes.a, b = S.axes.b, rel = { a: +((f.x - c.x) * a.x + (f.z - c.z) * a.z).toFixed(2), b: +((f.x - c.x) * b.x + (f.z - c.z) * b.z).toFixed(2) };
  const dr = { a: +((S.door.x - c.x) * a.x + (S.door.z - c.z) * a.z).toFixed(2), b: +((S.door.x - c.x) * b.x + (S.door.z - c.z) * b.z).toFixed(2) };
  const cafe = S.cafe ? Object.fromEntries(Object.entries(S.cafe).filter(([, q]) => q && Number.isFinite(q.x)).map(([k, q]) => [k, d(q)])) : null;
  return { key, pose: f.spec && f.spec.pose, slot: v.slot ? v.slot.id || v.slot.at : v.at || null, y: +f.y.toFixed(2), floorY: S.floorY, seats: (S.seats || []).map(d), door: d(S.door), rel, doorRel: dr, cafe };
};
let lookN = 0;
async function look(page, name, { book = null } = {}) {
  const id = `${String(++lookN).padStart(2, '0')}-${name}`;
  await page.evaluate(() => { if (window.__L) window.__L.step(12); });
  await page.waitForTimeout(700);
  let st = null, screen = null;
  try { st = await page.evaluate(STATE); } catch (e) { st = { error: String(e).slice(0, 400) }; log('STATE threw', st.error); }
  try { screen = await page.evaluate(SCREEN); } catch { /* */ }
  try { await page.screenshot({ path: path.join(SHOTS, `${id}.png`) }); } catch { /* a nicety */ }
  const L = { id, name, st, screen };
  if (book) L.book = await bookLook(page, id, book);
  looks.push(L);
  // the rules a look can judge by itself
  if (st && st.near) for (const q of st.near) {
    if (q.drawn && Math.abs(q.dy) > 0.35 && !q.sit) note('broken', id, `${q.who} off the ground by ${q.dy} m`, q);
    if (q.drawn && q.in && q.in !== 'err' && q.in.length) note('polish', id, `${q.who} inside/against ${q.in.join(', ')}`, q);
  }
  if (st && st.field) for (const q of st.field) { if (q.dy != null && Math.abs(q.dy) > 0.35) note('broken', id, `${q.who} off the ground by ${q.dy} m`, q); if (q.in && q.in !== 'err' && q.in.length) note('polish', id, `${q.who} inside/against ${q.in.join(', ')}`, q); }
  if (st && st.error) log(`LOOK ${id} STATE error`, st.error);
  log(`LOOK ${id}`, JSON.stringify({ underErr: await page.evaluate(() => window.__C.underErr || null), clock: st && st.clock, money: st && st.money, at: st && st.at, paper: st && st.paper, dot: st && st.dot, tasks: st && st.tasks, leads: st && st.leads, nRings: st && st.nRings, near: st && st.near && st.near.map((q) => `${q.who}:${q.d}m dy${q.dy}${q.in && q.in.length ? ' IN ' + q.in : ''}`) }).slice(0, 1200));
  return L;
}
// the book as a player opens it (I): the sides asked for, each screenshotted with its words
async function bookLook(page, id, sides) {
  const out = {};
  for (const side of sides) {
    const words = await page.evaluate((side) => {
      const g = window.__game, j = g.journal, view = side === 'walt' ? 'walt' : side === 'pages' ? 'pages' : null;
      if (view) side = 'walt';
      try { if (!j.open) j.show(side); else j.setSide(side); } catch (e) { return `(no side ${side}: ${e.message})`; }
      window.__L.step(6);
      if (view) { const b = document.querySelector(`#journal [data-nbv="${view}"]`); if (b) b.click(); else return `(no ${view} tab on the Walt side)`; window.__L.step(6); } // (the tab clicked, as a player does)
      const el = document.getElementById('journal') || document.querySelector('.journal');
      return el ? el.innerText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 120) : null;
    }, side);
    await page.waitForTimeout(500);
    try { await page.screenshot({ path: path.join(SHOTS, `${id}-book-${side}.png`) }); } catch { /* */ }
    out[side] = words;
  }
  await page.evaluate(() => { const j = window.__game.journal; if (j.open) j.close(); window.__L.step(3); });
  return out;
}
const setStep = (page, s) => page.evaluate((s) => { if (window.__C) window.__C.step = s; }, s);
async function dismissPapers(page) {
  await page.evaluate(() => { const g = window.__game, o = g.outfitter; if (g.title.state === 'pause') g.title.resume(); if (o && o.open) o.hide(); if (g.record && g.record.shown) g.record.close(); if (g.dialogue && g.dialogue.convo) g.dialogue.close(false); const j = g.journal; if (j.open) j.close(); window.__L.step(4); });
}
// the dot on a person (as a player aims at them): the label and the verb the dot shows
async function dotOn(page, key) {
  return page.evaluate((key) => {
    const g = window.__game, f = window.__t.figure(key); if (!f) return { none: key };
    window.__L.face({ x: f.x, z: f.z }, 1.8, f.y + 1.45); window.__L.step(4);
    const t = g.pointer && g.pointer.target;
    return { key, label: t ? t.label : null, verb: t ? (t.e ? t.e.verb : t.verb) : null, q: t && t.q ? (t.q.verb || t.q.label || true) : null, ref: t ? t.ref : null };
  }, key);
}
// the board as a player opens it: inside the store, face the cork, E
async function boardE(page, ep) {
  const r = await page.evaluate((ep) => {
    const g = window.__game, S = g.outfitter.layout(ep); if (!S) return { none: true };
    window.__L.standAt(S.centre.x, S.centre.z); window.__L.step(10);
    const h = (S.hot || []).find((q) => q.key === 'board'); if (!h) return { noHot: true };
    window.__L.face({ x: h.x, z: h.z }, 1.7, h.y); window.__L.step(4);
    const t = g.pointer && g.pointer.target;
    return { dot: t ? { label: t.label, verb: t.e ? t.e.verb : t.verb, ref: t.ref } : null };
  }, ep);
  if (r.dot && r.dot.ref === 'board') { await page.keyboard.press('e'); await page.evaluate(() => window.__L.step(4)); } else await page.evaluate((ep) => { const o = window.__game.outfitter; o.openHot('board', o.visit && o.visit.landing); window.__L.step(4); }, ep);
  await page.waitForTimeout(600);
  r.open = await page.evaluate(() => { const o = window.__game.outfitter; return { open: !!o.open, tab: o.tab }; });
  r.flyers = await page.evaluate(() => [...document.querySelectorAll('.pin.flyer')].map((f) => f.innerText.replace(/\s+/g, ' ').trim()));
  return r;
}

// --- after the run: every recorded line checked against the docs' anchors ---------------------------------------------
function loadTexts() {
  const dir = path.join(ROOT, 'src/story-data/text'), all = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    for (const [id, v] of Object.entries(j.text || {})) { const t = typeof v === 'string' ? v : v.text; if (t) all.push({ id, t: String(t), file: f }); if (v && Array.isArray(v.items)) for (const x of v.items) all.push({ id, t: String(x), file: f }); }
  }
  return all;
}
const norm = (s) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/…/g, '...').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const STORY_WHO = /Tauno|old man|Len|Mary|old woman|Tasha|woman with a tablet|Brekke|Rose|Gus|June|kid|Walt|An old|A man/i;
function checkLines(rec) {
  const texts = loadTexts().map((x) => ({ ...x, n: norm(x.t) }));
  const out = { ok: 0, game: 0, unanchored: [], leaks: [] };
  for (const r of rec) {
    const n = norm(r.text);
    if (/\b\d\d:\d+(\.\d+)+\b|\bS\d\.[a-z]|\{[a-z]|\bundefined\b|\bnull\b|\[object|NaN|\[If /i.test(r.text)) out.leaks.push(r);
    if (n.length < 4) continue;
    const hit = texts.find((x) => x.n === n || (n.length > 12 && x.n.includes(n)) || (x.n.length > 20 && n.includes(x.n)));
    if (hit) { out.ok++; r.id = hit.id; continue; }
    // the ordinary game (keepers, chips, hints) is not anchored: flagged only for a story speaker's line or a story step's note
    if ((r.kind === 'line' && STORY_WHO.test(r.who)) || r.kind === 'plain') out.unanchored.push(r); else out.game++;
  }
  return out;
}

// =====================================================================================================================
async function seasonA() {
  const A = await openGame('A');
  await newSeason(A, 31, 191);
  await A.evaluate(() => { const g = window.__game, o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 10); window.__L.step(10); });
  await A.evaluate(HELPERS_A2); await A.evaluate(HELPERS_D);
  // the slice's clock jumps (A.at) skip the nights a player sleeps: woken fresh at each jump, as after a night in a bunk
  await A.evaluate(() => { const g = window.__game, A2 = window.__a2, at0 = A2.at; A2.at = (doy, h) => { g.day.setClock(g.day.year, doy, h); const e = g.energy; if (e) { e.awakeSince = e.now - 1; e.wokeAt = e.now - 1; } return at0(doy, h); }; });
  const ctx = { home: 31, join: true, shots: SHOTS };
  const a2 = (id) => A2_STEPS.find((q) => q.id === id), d = (id) => D_STEPS.find((q) => q.id === id);
  const run = async (s, who) => {
    await setStep(A, `A:${s.id}`);
    const paused = await A.evaluate(() => { const t = window.__game.title; if (t.state !== 'pause') return false; t.resume(); window.__L.step(4); return true; });
    if (paused) note('confusing', `A:${s.id}`, 'the pause card was up when this step began (a step before left the game paused)');
    // a player sleeps: the slice's days skip the nights (A.at), so the walker is rested here as a night in a bunk would
    // (else "too long awake" evacuates him mid-step: run 1 lost the clean book's ride to it)
    await A.evaluate(() => { const e = window.__game.energy; if (e) { try { e.fresh(); e.bunk(); } catch { /* */ } e.value = 1; } });
    log(`-- ${who} ${s.step} ${s.id}`);
    try { await s.run({ page: A, result, log, ctx, shots: SHOTS }); } catch (e) { result(`${s.step} ${s.id}: threw`, false, { e: String(e && e.stack || e).slice(0, 900) }); }
  };
  await setStep(A, 'A:setup');
  try { await A2_SETUP({ page: A, result, log, ctx }); } catch (e) { result('setup threw', false, { e: String(e && e.stack || e).slice(0, 900) }); }
  await dismissPapers(A);
  await look(A, 'A-turn', { book: ['journal', 'walt'] });

  // 1 the porch
  await run(a2('porch'), 'A2');
  await look(A, 'A1-porch-after');
  // the dot on Tauno, on the bench (7:30–10): what a player aims at
  const t1 = await A.evaluate(() => { const t = window.__t.tauno(); return t ? `cast:tauno:${t.ep}` : null; });
  if (t1) {
    const w = await A.evaluate(WHERE, t1); log('Tauno where', JSON.stringify(w));
    // from the yard, facing the bench under the window (as a player walking up)
    await A.evaluate(() => { const g = window.__game, S = g.outfitter.layout(31), q = S.seats[0] || S.door, f = S.stepsFoot || S.door, b = S.axes.b; window.__L.standAt(f.x + b.x * 6, f.z + b.z * 6, 0); window.__L.step(4); window.__L.face({ x: q.x, z: q.z }, 6, S.floorY + 1.0); window.__L.step(6); });
    await look(A, 'A1-porch-from-yard');
    const dt = await dotOn(A, t1); log('dot on Tauno', JSON.stringify(dt)); if (!dt.verb) note('broken', 'A1 porch', 'the dot on Tauno on the bench offers no verb', dt); await look(A, 'A1-dot-tauno');
  }
  else note('confusing', 'A1 porch', 'Tauno not staged after the porch step');
  // 2 the café and the dock
  await run(a2('cafe'), 'A2');
  await look(A, 'A2-dock-len', { book: ['journal'] });
  log('Len where', JSON.stringify(await A.evaluate(WHERE, 'cast:len:31')));
  const dl = await dotOn(A, 'cast:len:31'); log('dot on Len', JSON.stringify(dl));
  if (dl.none || !dl.verb) note('confusing', 'A2 dock', 'the dot on Len offers no verb (or Len not there)', dl);
  // Mary at the window: the dot (9–11 Tue/Fri), the café as a player sees it
  await A.evaluate((d0) => { window.__a2.at(d0, 9.6); window.__a2.inside(); window.__L.step(30); }, ctx.d0);
  log('Mary where', JSON.stringify(await A.evaluate(WHERE, 'cast:mary:31')));
  const tw = await A.evaluate(() => { const t = window.__t.tauno(); return t ? `cast:tauno:${t.ep}` : null; });
  if (tw) log('Tauno where (9:36)', JSON.stringify(await A.evaluate(WHERE, tw)));
  const dm = await dotOn(A, 'cast:mary:31'); log('dot on Mary', JSON.stringify(dm));
  if (dm.none || !dm.verb) note('confusing', 'A2 café', 'the dot on Mary offers no verb (or Mary not there)', dm);
  await look(A, 'A2-cafe-mary');
  // 3 the board on the evening of the rain, as a player opens it (E on the cork)
  await setStep(A, 'A:board');
  await A.evaluate((d0) => { window.__a2.at(d0, 19); window.__L.step(10); }, ctx.d0);
  const b = await boardE(A, 31);
  log('the board', JSON.stringify(b).slice(0, 1500));
  await look(A, 'A3-board');
  if (!b.flyers || b.flyers.length !== 1) note('broken', 'A3 board', 'the Kettle notice is not on Farm\'s board as a flyer the evening of the rain', b);
  // the keeper's two lines about the notice: does anything in the store say them?
  const kl = await A.evaluate(() => { const M = window.__game.storyMining, F = M.kettle.flyers(31); return F[0] ? F[0].keeper : null; });
  await dismissPapers(A);
  const k = await A.evaluate(() => window.__t.keeperKey(31));
  if (k) {
    await A.evaluate((k) => window.__t.talkTo(k), k); await A.waitForTimeout(150);
    const c = await A.evaluate(() => window.__t.convo());
    const heard = await A.evaluate((kl) => (window.__C.log || []).filter((r) => kl && kl.some((x) => r.text.includes(String(x).slice(0, 20)))).length, kl);
    log('keeper at the notice', JSON.stringify({ kl, c, heard }));
    if (kl && !heard) note('confusing', 'A3 board', 'the keeper\'s two lines about the Kettle notice (30:4.3.keeper.1–2) are never said: E on the keeper with the notice up gives the ordinary talk', { kl, c });
    await A.evaluate(() => { const g = window.__game; if (g.dialogue.convo) g.dialogue.close(false); window.__L.step(3); });
  }
  await run(a2('notice'), 'A2');
  await A.evaluate(() => window.__L.step(240)); // (the keeper's two lines, one after the other)
  const kh = await A.evaluate((kl) => (window.__C.log || []).filter((r) => r.kind === 'line' && kl && kl.some((x) => r.text === x)).map((r) => `${r.who}: ${r.text}`), kl);
  log('the keeper as the notice is taken', JSON.stringify(kh));
  if (kl && kh.length < 2) note('confusing', 'A3 notice', `the keeper's two lines about the Kettle notice are not said as it is taken (${kh.length} of 2)`, { kh });
  await look(A, 'A3-notice-taken', { book: ['journal', 'walt', 'stories'] });
  // the board again: is the taken notice kept anywhere a player can read it again (the pile, the journal)?
  const b2 = await boardE(A, 31);
  const pile = await A.evaluate(() => [...document.querySelectorAll('.pile, .taken, [class*=pile]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 1200));
  log('the board after the take', JSON.stringify({ flyers: b2.flyers, pile }));
  await look(A, 'A3-board-after');
  if (!/FIELD HELP|Kettle/i.test(pile)) note('confusing', 'A3 notice', 'once taken, the Kettle notice is nowhere to read again (not in the board\'s pile of what you tore off, not in the journal): its when and where (the morning after the rain; the crews\' landing, the grade; T. Strand) go with it', { pile });
  await dismissPapers(A);
  // 4 the Kettle day
  await run(a2('kettle'), 'A2');
  await look(A, 'A4-kettle-after');
  // 5 the trip's end: a trip under way (a day out on foot), Len's pictures, the tally
  await A.evaluate(() => { const g = window.__game; if (!g.trip.active) window.__d.trip(31); });
  const m5 = await A.evaluate(() => window.__game.profile.s.money);
  await run(a2('tally'), 'A2'); await run(d('tally'), 'D');
  const m5b = await A.evaluate(() => window.__game.profile.s.money);
  const card = await A.evaluate(() => { const g = window.__game; return { paper: g.hud.paper, text: [...document.querySelectorAll('.tripcard, #tripcard, .record-card, [class*=tripcard]')].map((e) => e.innerText).join('\n').slice(0, 2500) }; });
  log('the trip card', JSON.stringify({ m5, m5b, card }).slice(0, 3000));
  if (m5b - m5 !== 75) note('broken', 'A5 tally', `the purse moved by $${m5b - m5} over the Kettle trip's end, not $75 ($35 Tasha + $40 Len)`, { m5, m5b });
  await look(A, 'A5-tripcard');
  await dismissPapers(A);
  // 6 Mary's back table
  await run(a2('table'), 'A2');
  await look(A, 'A6-table');
  // 7 the porch: the test, the crew map
  await run(a2('map'), 'A2');
  await look(A, 'A7-map', { book: ['walt', 'journal'] });
  // 8 Pietro
  await run(a2('pietro'), 'A2');
  await look(A, 'A8-pietro');
  // 9 the clean book: watch the ride's landing against the slab (every move of the player recorded: the teleports, the
  // ride's arrival, a store's arrival)
  const pre9 = await A.evaluate(() => {
    const g = window.__game, p = g.player, o = g.outfitter, W = window.__W = [];
    const at = () => [Math.round(p.x), Math.round(p.z)];
    if (!p.__w) { p.__w = true; const t0 = p.teleport.bind(p); p.teleport = async (x, z, ...r) => { W.push({ k: 'teleport', to: [Math.round(x), Math.round(z)], from: at(), why: (new Error().stack || '').split('\n').slice(2, 6).map((l) => l.trim().replace(/https?:\/\/[^/]+/, '')).join(' < ') }); return t0(x, z, ...r); }; }
    const R = g.rides; if (R && !R.__w) { R.__w = true; const a0 = R.arrive.bind(R); R.arrive = async (...a) => { const r = await a0(...a); W.push({ k: 'arrive', to: a[1] && a[1].ep, ok: r, at: at(), arrival: o.arrival ? { ...o.arrival } : null }); return r; }; }
    if (!o.__w) { o.__w = true; const u0 = o.updateArrival.bind(o); o.updateArrival = (dt) => { const b = at(), a = o.arrival ? { why: o.arrival.why, ep: o.arrival.ep } : null; const r = u0(dt); const c = at(); if (c[0] !== b[0] || c[1] !== b[1]) W.push({ k: 'updateArrival moved', from: b, to: c, arrival: a }); return r; }; }
    return { arrival: o.arrival ? { why: o.arrival.why, ep: o.arrival.ep, pending: o.arrival.pending } : null, at: at(), trip: !!g.trip.active };
  });
  log('before the clean book', JSON.stringify(pre9));
  const m9 = await A.evaluate(() => window.__game.profile.s.money);
  await run(a2('clean'), 'A2');
  const m9b = await A.evaluate(() => window.__game.profile.s.money);
  const ride = await A.evaluate(() => { const g = window.__game, l = g.rides.last, lot = g.rides.landing(33), pl = g.storyLayer.place('ep33.crewcamp'), sl = g.storyLayer.prop('ep33.slab'), e33 = g.world.entryPoints.find((e) => e.ep === 33); return { last: l && { from: l.from, to: l.to, price: l.price }, landing33: lot && { x: Math.round(lot.x), z: Math.round(lot.z), name: lot.name }, crewcamp: pl && [Math.round(pl.x), Math.round(pl.z)], slab: sl && [Math.round(sl.prop.x), Math.round(sl.prop.z)], ep33: e33 && { x: Math.round(e33.x), z: Math.round(e33.z), name: e33.name }, km: lot && pl ? +(Math.hypot(lot.x - pl.x, lot.z - pl.z) / 1000).toFixed(2) : null }; });
  log('the ride', JSON.stringify({ ride, m9, m9b }));
  log('the moves over the clean book', JSON.stringify(await A.evaluate(() => window.__W)).slice(0, 4000));
  if (ride.km != null && ride.km > 0.5) note('broken', 'A9 clean book', `Tauno's ride sets the player down at EP 33's landing (${ride.landing33 && ride.landing33.name}), ${ride.km} km from the road end where he and the slab are`, ride);
  await look(A, 'A9-home', { book: ['walt', 'journal'] });
  // between A2's section and D's (story-slice's own block): up, no paper, rested
  await A.evaluate(async () => { const g = window.__game, p = g.player, o = g.outfitter; if (g.title.state === 'pause') g.title.resume(); if (g.dialogue && g.dialogue.convo) g.dialogue.close(false); if (p.seat && typeof p.stand === 'function') p.stand(); p.seat = null; if (g.record && g.record.shown) g.record.close(); if (o.open) o.hide(); for (let k = 0; k < 100 && p.teleporting; k++) { window.__L.step(10); await window.__L.wait(50); } const e = g.energy; e.fresh(); e.bunk(); e.value = 1; window.__L.step(10); });
  for (const id of ['day-beat', 'episode-beat', 'stall', 'climax']) { await run(d(id), 'D'); await look(A, `A-D-${id}`); }
  // the trip card at the end of the D trips, as a player sees it
  await look(A, 'A-end', { book: ['journal', 'walt'] });
  const lines = await A.evaluate(() => window.__C.log);
  return lines;
}

async function seasonB() {
  const B = await openGame('B');
  await newSeason(B, 25, 160);
  await B.evaluate(HELPERS_E);
  // (--b-no-fixture: season B as E's own rig starts it; the snag under the turn fixture is claude/c2-fix's)
  await B.evaluate((fx) => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); if (fx) g.story.debug.fixture('turn'); window.__L.step(20); }, !argv.includes('--b-no-fixture'));
  await setStep(B, 'B:turn');
  await look(B, 'B-turn', { book: ['journal'] });
  const ctx = { home: 25, join: true, shots: SHOTS };
  for (const s of E_STEPS) {
    await setStep(B, `B:${s.id}`);
    const paused = await B.evaluate(() => { const t = window.__game.title; if (t.state !== 'pause') return false; t.resume(); window.__L.step(4); return true; });
    if (paused) note('confusing', `B:${s.id}`, 'the pause card was up when this step began');
    const m0 = await B.evaluate(() => window.__game.profile.s.money);
    log(`-- E ${s.step} ${s.id}`);
    try { await s.run({ page: B, result, log, ctx, shots: SHOTS }); } catch (e) { result(`${s.step} ${s.id}: threw`, false, { e: String(e && e.stack || e).slice(0, 900) }); }
    const m1 = await B.evaluate(() => window.__game.profile.s.money);
    if (m1 !== m0) log(`   money ${m0} → ${m1} over ${s.id}`);
    await look(B, `B-${s.id}`, { book: /E13c|E12|E13b/.test(s.id) ? ['journal', 'stories'] : null });
    if (s.id === 'E13b') {
      // the trip's end as a player has it (in by the door at Moose Lake): the tally pays Rose's $25 with its line?
      const t = await B.evaluate(async () => { const g = window.__game, m0 = g.profile.s.money, tr = g.trip, was = !!tr.active; if (g.dialogue.convo) g.dialogue.close(false); window.__t.walkOut(25); window.__L.step(20); window.__t.walkIn(25); for (let k = 0; k < 20; k++) { window.__L.step(10); await window.__L.wait(60); } const open = g.hud.paper; const card = [...document.querySelectorAll('.tripcard, #tripcard, [class*=tripcard], .record-card')].map((e) => e.innerText).join('\n').slice(0, 1800); return { was, active: !!tr.active, open, card, m0, m1: g.profile.s.money }; });
      log('S7 trip end', JSON.stringify(t));
      await look(B, 'B-S7-tripend');
      if (t.m1 - t.m0 !== 25 && !/Rose/.test(t.card || '')) note('broken', 'B S7 tally', `Rose's $25 not paid at the trip's end (purse ${t.m0} → ${t.m1}; trip was ${t.was ? 'on' : 'off'})`, t);
      await dismissPapers(B);
    }
  }
  return B.evaluate(() => window.__C.log);
}

let recA = [], recB = [];
try {
  if (!ONLY || ONLY === 'A') recA = await seasonA();
  if (!ONLY || ONLY === 'B') recB = await seasonB();
} catch (e) { result('the rig ran to its end', false, { error: String(e && e.stack || e).slice(0, 1500) }); }
finally { for (const b of browsers) { try { await b.close(); } catch { /* */ } } }
const rec = [...recA, ...recB];
const chk = checkLines(rec);
for (const r of chk.leaks) note('broken', r.step, `a line shows a raw id, placeholder or stage direction: "${r.text.slice(0, 160)}"`, r);
for (const r of chk.unanchored) note('confusing', r.step, `a story line with no anchor in src/story-data/text: ${r.who}: "${r.text.slice(0, 200)}"`, r);
result('no page errors', errors.length === 0, { errors: errors.slice(0, 10) });
writeFileSync(path.join(OUT, 'chk-c2a.json'), JSON.stringify({ results, notes, looks, lines: rec, check: { ok: chk.ok, game: chk.game, unanchored: chk.unanchored.length, leaks: chk.leaks.length }, errors }, null, 1));
writeFileSync(path.join(OUT, 'chk-c2a-lines.txt'), rec.map((r) => `${r.step}\t${r.at}\t${r.kind}\t${r.who}\t${r.id || '-'}\t${r.text}`).join('\n'));
const pass = results.filter((r) => r.pass).length;
log(`lines: ${rec.length} recorded, ${chk.ok} anchored, ${chk.game} ordinary game words, ${chk.unanchored.length} story lines unanchored, ${chk.leaks.length} leaks`);
log(`notes: ${notes.length} (${notes.filter((n) => n.sev === 'broken').length} broken)`);
log(`chk-c2a: slice checks ${pass}/${results.length}`);
process.exit(0);
