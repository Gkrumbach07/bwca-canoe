// chk-c2b: the break checker for story chapter 2 (Round 2: the mining crew, the director, the runner), flag on. The
// happy path is --slice2's and the solver's; this goes off it: order and timing, declines and re-entry, reloads mid-way,
// saves, money, the flag off, a co-op guest. One check per idea (B1, B2, …), each PASS / FAIL / WARN with what it saw.
//
//   APP=... [RELAY=...] node scripts/chk-c2b.mjs [--only A,F,S,C] [--out dir]
//   groups: A the arc off its path (one season, home 31) · F the flag off mid-arc · S saves (export/import, old data)
//           C a co-op guest mid-arc (needs RELAY)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS_T } from './slice/c1-talk.mjs';
import { HELPERS } from './slice/c1-layer.mjs';
import { HELPERS_A2 } from './slice/c2-mining.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5993').replace(/\/$/, ''), RELAY = process.env.RELAY || null;
const ONLY = (arg('only', 'A,F,S,C') || '').split(',');
const OUT = path.resolve(arg('out', 'chk-c2b-out')); mkdirSync(OUT, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [];
// kind: true → PASS, false → FAIL, 'warn' → WARN (works, but something an owner or writer should see)
const result = (name, pass, more = {}) => { const k = pass === 'warn' ? 'WARN' : pass ? 'PASS' : 'FAIL'; results.push({ name, k, more }); log(k, name, JSON.stringify(more).slice(0, 2400)); };
const browsers = [];
async function fresh(name) {
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(b);
  const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /story|mining|episod|beats/i.test(m.text()))) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  return page;
}
const booted = (page) => page.waitForFunction(() => window.__game && window.__game.title && window.__game.story && (window.__game.title.state === 'title' || window.__game.title.state === 'game') && typeof window.__game.step === 'function' && (!/story=1/.test(location.search) || (window.__game.storySeams && window.__game.storyMining)), null, { timeout: 300000, polling: 500 });
const inGame = (page) => page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 180000, polling: 250 });
const inject = async (page) => { await page.evaluate(HELPERS_T); await page.evaluate(HELPERS); if (await page.evaluate(() => !!window.__game.storyMining)) await page.evaluate(HELPERS_A2); };
async function go(page, q = 'story=1') { await page.goto(`${APP}/${q ? '?' + q : ''}`, { timeout: 180000 }); await booted(page); }
async function newSeason(page, home = 31, doy = 191) {
  await page.evaluate(async ([home, doy]) => { const g = window.__game, t = g.title; t.setPick('adventure'); await t.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await inGame(page);
  await page.evaluate((home) => { const g = window.__game; g.step(1 / 30, 30); if (g.outfitter.open) g.outfitter.hide(); if (g.onboarding.pending && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(home, false); } g.step(1 / 30, 10); }, home);
  await inject(page);
}
const flushAll = (page) => page.evaluate(async () => { const g = window.__game, s = g.story; try { s.flush && s.flush(); } catch { /* */ } try { g.inventory && g.inventory.write && g.inventory.write(); } catch { /* */ } try { g.slots.flush(); } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); if (g.store.flush) await g.store.flush(); await new Promise((r) => setTimeout(r, 300)); });
// a reload as a player does it (the tab closed and opened again; Continue on the title): pagehide's own writes only,
// unless flush is asked for
async function reload(page, q = 'story=1', { flush = true } = {}) {
  if (flush) await flushAll(page);
  await go(page, q);
  await page.evaluate(() => { const g = window.__game; if (g.title.state === 'title' && g.profile.started) g.title.continueTrip(); });
  await inGame(page).catch(() => null);
  await page.evaluate(() => { const g = window.__game; g.step(1 / 30, 30); if (g.outfitter.open) g.outfitter.hide(); g.step(1 / 30, 5); });
  await inject(page);
}
const ev = (page, fn, a) => page.evaluate(fn, a);
const convo = (page) => ev(page, () => window.__t.convo());
// the '…' lines pressed through (the dialogue's own choose(0), as a click)
async function hear(page, n = 10) { const said = []; for (let k = 0; k < n; k++) { const c = await convo(page); if (!c) break; said.push(c.say); if (!(c.choices.length === 1 && c.choices[0] === '…')) break; await ev(page, () => { window.__game.dialogue.choose(0); window.__L.step(3); }); } return said; }
// a choice by its words' start (the click path: dialogue.choose(i))
async function pick(page, prefix) { const c = await convo(page); const i = c ? c.choices.findIndex((t) => t.startsWith(prefix)) : -1; if (i < 0) return { ok: false, prefix, c }; await ev(page, (i) => { window.__game.dialogue.choose(i); window.__L.step(3); }, i); await page.waitForTimeout(60); return { ok: true, said: c.say }; }
const endTalk = (page) => ev(page, () => window.__a2.endTalk());
const facts = (page, ks) => ev(page, (ks) => window.__a2.facts(ks), ks);
async function talkTauno(page) {
  await ev(page, async () => { const A = window.__a2; await A.toFarm(); window.__L.step(40); });
  let st = await ev(page, () => window.__t.tauno());
  if (!st) st = await ev(page, () => { const C = window.__game.storyTalk.cast; try { C.debug.stage('tauno', 31, 'farmhub', 'bench'); } catch { /* */ } window.__L.step(6); return window.__t.tauno(); });
  await ev(page, () => { window.__t.talkTo('cast:tauno:31'); window.__L.step(3); });
  await page.waitForTimeout(100);
  return { st, c: await convo(page) };
}
// the next day of the week (0 Sun … 6 Sat) on or after doy
const nextDow = (page, from, dow) => ev(page, ([from, dow]) => { let d = from; while (window.__a2.dow(d) !== dow) d++; return d; }, [from, dow]);
const tripOnce = (page, ep = 31) => ev(page, (ep) => {
  const g = window.__game, m0 = g.profile.money;
  try { if (g.trip.active) g.trip.close('completed', 'came in', ep); } catch { /* */ }
  try { g.trip.start({ ep, foodDays: 1, canoe: 'aluminium' }); g.step(1 / 30, 30); g.trip.close('completed', 'came in', ep); g.step(1 / 30, 10); } catch (e) { return { err: e.message }; }
  const c = g.record.s.trips[g.record.s.trips.length - 1], t = c && c.tally;
  try { if (g.record.close) g.record.close(); } catch { /* */ }
  const lines = t ? (t.pay || []).map((l) => ({ title: l.title, pay: l.pay, kind: l.kind })) : null;
  return { m0, m1: g.profile.money, story: lines ? lines.filter((l) => l.kind === 'story') : null, tally: t ? Object.keys(t) : null };
}, ep);
const pays = (page) => ev(page, () => { const d = window.__game.story.doc.dir; return (d.pay || []).map((p) => ({ amt: p.amt, line: p.line, paid: !!p.paid })); });

// ------------------------------------------------------------------------------------------------------------------------
// group A: the arc off its path (home 31, from 10 July, the turn fixture)
async function groupA() {
  const P = await fresh('A');
  await go(P); await newSeason(P, 31, 191);
  const d0 = await ev(P, () => { const g = window.__game, A = window.__a2; g.story.debug.fixture('turn'); window.__L.step(6); let d = g.day.doy + 1; while (A.dow(d) !== 2) d++; A.at(d, 7.6); return d; });
  log('d0', d0);

  // B1 the Kettle pad before the notice (and before "The pads"): the hollow walked into; no Tasha, no Fill, the lid there
  try {
    const r = await ev(P, async () => {
      const g = window.__game, A = window.__a2, L = window.__L, M = A.M(), K = A.place('kettle');
      await L.near(K.x, K.z); L.standAt(K.x, K.z, 0); L.step(10); g.storyLayer.poll(); L.step(10); g.storyLayer.poll(); M.kettle.update(1); L.step(4);
      const lay = g.storyLayer;
      return { at: [Math.round(g.player.x), Math.round(g.player.z)], K: [K.x, K.z], f: A.facts(['kettle.visited', 'westpads.seen', 'kettle.notice', 'tauno.said.pads']), tasha: !!M.kettle.tasha(), up: lay.verbs('kettle.up'), dam: lay.verbs('kettle.dam'), lid: lay.verbs('kettle.lid') };
    });
    const m = await ev(P, async () => { const s = window.__game.story; s.set('tauno.farm.met', true, 'chk'); s.set('door.mining.open', true, 'chk'); const M = await import('/src/story-data/mining.js'); return M.farmEntry(s, {}); });
    result('B1 the Kettle pad before the notice: walked in → kettle.visited + westpads.seen (L1C); no Tasha, no Fill, no Secchi; the lid takeable; Tauno\'s test comes next ("well")',
      r.f['kettle.visited'] && r.f['westpads.seen'] && !r.tasha && !r.up.length && !r.dam.length && r.lid.length === 1 && m === 'well', { ...r, farmEntry: m });
  } catch (e) { result('B1 threw', false, { e: String(e.stack || e).slice(0, 800) }); }

  // B2 the notice: none before "The pads" even in the rain; up after; taken once; a second take refused; never up again
  let kday = null;
  try {
    const r = await ev(P, (d0) => {
      const g = window.__game, A = window.__a2, M = A.M(), s = g.story, out = {};
      M.kettle.rain.clear(); M.kettle.rain.force({ from: A.abs(d0 + 1), days: 2 }); A.at(d0 + 1, 19);
      const board = () => (g.tasks.flyers ? g.tasks.flyers(31) : []).filter((f) => /FIELD HELP/.test(JSON.stringify(f)) && !f.taken).length;
      out.prePads = { flyers: M.kettle.flyers(31).length, board: board(), win: !!M.kettle.day().notice };
      s.set('tauno.said.pads', true, 'chk');
      out.post = { flyers: M.kettle.flyers(31).length, board: board() };
      const F = M.kettle.flyers(31);
      out.take1 = F[0] ? F[0].take() : null; out.take2 = F[0] ? F[0].take() : null;
      out.take3 = g.storyEpisodes ? g.storyEpisodes.episodes.take('ep:mining') : 'no runner';
      out.take4 = g.tasks.flyerHook ? g.tasks.flyerHook.take('ep:mining') : 'no hook';
      window.__L.step(6);
      out.after = { flyers: M.kettle.flyers(31).length, board: board(), notice: s.has('kettle.notice'), ring: A.ringed('kettle'), fired: s.debug && s.debug.why ? null : null };
      out.day = M.kettle.day();
      return out;
    }, d0);
    kday = r.day && r.day.day;
    result('B2 the notice: no notice in the rain before "The pads"; up after; taken once (kettle.notice, the pad rung); a second take refused by every path; never up again',
      r.prePads.flyers === 0 && r.prePads.board === 0 && r.prePads.win && r.post.flyers === 1 && r.post.board === 1 && r.take1 === true && r.take2 === false && r.take3 === false && r.take4 === false && r.after.flyers === 0 && r.after.board === 0 && r.after.notice && r.after.ring, r);
  } catch (e) { result('B2 threw', false, { e: String(e.stack || e).slice(0, 800) }); }

  // B3 the Kettle day missed (the notice taken, the player there after 14:00 or a day late): Tasha only on a later rain;
  // the notice never shows again (what tells the player the second chance?)
  let k2 = null;
  try {
    const r = await ev(P, (kday) => {
      const g = window.__game, A = window.__a2, M = A.M(), s = g.story, out = {};
      const doyOf = (abs) => abs - A.abs(0);
      out.kday = kday; out.kdoy = doyOf(kday);
      A.at(out.kdoy, 15); out.late = { here: M.kettle.day().here, due: M.kettle.tashaDue() };
      A.at(out.kdoy + 1, 8); out.next = { here: M.kettle.day().here, due: M.kettle.tashaDue(), flyers: M.kettle.flyers(31).length };
      // the forecast's own two-day rains to the end of October (none forced)
      M.kettle.rain.clear();
      const R = M.kettle.rain, now = Math.floor(s.nowAbs());
      out.natural = R.spells({ from: now, to: A.abs(304) }).map((q) => ({ a: doyOf(q.a), b: doyOf(q.b) }));
      out.season = R.spells({ from: A.abs(152), to: A.abs(304) }).length;
      // a forced second rain: Tasha's day comes round again, with no new notice
      R.force({ from: now + 3, days: 2 });
      const S2 = R.spellAt(now + 3.9), kd2 = R.kettleDay(S2);
      out.k2 = kd2; A.at(doyOf(kd2) - 1, 19); out.flyerEve = M.kettle.flyers(31).length;
      A.at(doyOf(kd2), 8); out.second = { here: M.kettle.day().here, due: M.kettle.tashaDue(), flyers: M.kettle.flyers(31).length, board: (g.tasks.flyers ? g.tasks.flyers(31) : []).length };
      return out;
    }, kday);
    k2 = r.k2;
    const back = r.second.due;
    result('B3 the Kettle day missed: no Tasha after 14:00 or the day after; she is due again on the next two-day rain\'s morning', !r.late.due && !r.next.due && back, r);
    result('B3w … but nothing shows the second chance: the notice stays down (kettle.notice is grow-only) while Tasha waits for a rain the player can\'t see coming; natural two-day rains to 31 Oct listed', r.flyerEve === 0 && r.second.flyers === 0 ? 'warn' : true, { natural: r.natural, seasonSpells: r.season, flyerEve: r.flyerEve });
  } catch (e) { result('B3 threw', false, { e: String(e.stack || e).slice(0, 800) }); }

  // B4 Tasha met, the bottles and her Secchi disk taken, then the player leaves (>700 m) and comes back that afternoon
  try {
    const r = await ev(P, async (k2) => {
      const g = window.__game, A = window.__a2, M = A.M(), L = window.__L, s = g.story, out = {};
      const doy = k2 - A.abs(0); A.at(doy, 8.2);
      const K = A.place('kettle'); await L.near(K.x + 2, K.z + 160); M.kettle.update(1); L.step(6);
      const f = M.kettle.tasha(); out.staged = !!f;
      if (f) { L.standAt(f.x + 1.8, f.z, Math.PI); L.step(4); f.onTalk(f); L.step(3); }
      out.c = window.__t.convo();
      return out;
    }, k2);
    const said = await hear(P, 3); await endTalk(P);
    const r2 = await ev(P, async (k2) => {
      const g = window.__game, A = window.__a2, M = A.M(), L = window.__L, out = {};
      out.got = { bottles: A.inv('samplebottle'), secchi: A.inv('secchi'), f: A.facts(['tasha.met', 'kettle.bottles']) };
      await A.toFarm(); M.kettle.update(1); out.away = !!M.kettle.tasha();
      const doy = k2 - A.abs(0); A.at(doy, 15);
      const K = A.place('kettle'); await L.near(K.x + 2, K.z + 160); M.kettle.update(1); L.step(4);
      out.back = { tasha: !!M.kettle.tasha(), due: M.kettle.tashaDue(), bottles: A.inv('samplebottle'), secchi: A.inv('secchi'), done: window.__game.story.has('kettle.done'), fillUp: g.storyLayer.verbs('kettle.up') };
      A.at(doy + 1, 9); M.kettle.update(1); out.nextDay = { tasha: !!M.kettle.tasha(), due: M.kettle.tashaDue() };
      return out;
    }, k2);
    result('B4 Tasha met and left (the player walked off, back at 15:00 or next day): she is still somewhere to hand the bottles back to (kettle.done reachable this rain)',
      r.staged && r2.got.bottles === 3 && (r2.back.tasha || r2.nextDay.tasha), { r, said, r2 });
  } catch (e) { result('B4 threw', false, { e: String(e.stack || e).slice(0, 800) }); }

  // B5 Leo's lid: taken (no Tasha needed), given to Mary once; a second give refused; the lid gone from you; the talk
  // closed at her first line and the page reloaded mid-table: her back table resumes at "papers", the lid on her table
  try {
    const r = await ev(P, async () => {
      const g = window.__game, A = window.__a2, L = window.__L, out = {};
      const K = A.place('kettle'); await L.near(K.x - 30, K.z + 8); L.standAt(K.x - 31, K.z + 8, 0); g.storyLayer.poll(); L.step(4);
      out.take1 = g.storyLayer.look('kettle.lid'); L.step(4); out.take2 = g.storyLayer.look('kettle.lid');
      out.lid = A.inv('leolid'); out.f = A.facts(['kettle.lid']);
      return out;
    });
    const tue = await nextDow(P, (await ev(P, () => window.__game.day.doy)) + 1, 2);
    const m = await ev(P, async (tue) => {
      const g = window.__game, A = window.__a2, L = window.__L, M = A.M(), out = {};
      A.at(tue, 9.4); await A.toFarm(); A.inside(); for (let k = 0; k < 10; k++) { L.step(20); await L.wait(30); }
      out.staged = M.miningCast.staged().map((q) => q.who);
      out.wants = M.miningCast.wants('mary');
      out.give1 = M.miningCast.give('mary', 'leolid'); L.step(3);
      for (let k = 0; k < 10 && !window.__t.convo(); k++) { await L.wait(60); L.step(2); }
      out.c = window.__t.convo();
      return out;
    }, tue);
    await endTalk(P);
    const m2 = await ev(P, () => { const A = window.__a2, M = A.M(); return { give2: M.miningCast.give('mary', 'leolid'), wants: M.miningCast.wants('mary'), lid: A.inv('leolid'), f: A.facts(['mary.lid.given', 'mary.table.begun', 'mary.table', 'mary.farend']) }; });
    result('B5a Leo\'s lid: taken once (no Tasha needed; the second Take refused); given to Mary once; a second give refused; the lid gone from you',
      r.take1 && !r.take2 && r.lid === 1 && m.give1 && m.c && /L\.P\. Three/.test(m.c.say || '') && !m2.give2 && m2.lid === 0 && m2.f['mary.lid.given'], { r, m, m2 });
    await reload(P);
    const m3 = await ev(P, async (tue) => {
      const g = window.__game, A = window.__a2, L = window.__L, M = A.M(), out = {};
      A.at(tue, 9.8); await A.toFarm(); A.inside(); for (let k = 0; k < 10; k++) { L.step(20); await L.wait(30); }
      out.staged = M.miningCast.staged().map((q) => q.who); out.lidMesh = !!(M.miningCast.cafe && M.miningCast.cafe.lid);
      window.__t.talkTo('cast:mary:31'); L.step(3); out.c = window.__t.convo();
      return out;
    }, tue);
    await hear(P, 2);
    const p1 = await pick(P, 'Would you know something typed');
    await hear(P, 3);
    const p2 = await pick(P, 'If it comes out, I\'ll make sure'); const p2b = p2;
    await hear(P, 4); await endTalk(P);
    const f3 = await facts(P, ['mary.farend', 'mary.table', 'key.L2A']);
    result('B5b reloaded mid-table: Mary resumes at "papers" (30:4.4.5), the lid on her table; Far End reached (L2A)', m3.c && /^If you're looking for what the Haapala boys had/.test(m3.c.say || '') && m3.lidMesh && f3['mary.farend'], { m3, p1, p2: p2.ok ? 'ok' : p2b, f3 });
  } catch (e) { result('B5 threw', false, { e: String(e.stack || e).slice(0, 800) }); }

  // B6 no rain at all (kettle.rain never written): the test's second answer is the dry one; "North of Gabbro, yes." first,
  // the test again the same visit, then the crew map (the yield) with no Kettle day done
  let yday = null;
  try {
    yday = await ev(P, () => { const g = window.__game, A = window.__a2; A.M().kettle.rain.clear(); const d = g.day.doy + 1; A.at(d, 8); return d; });
    const t1 = await talkTauno(P);
    await hear(P, 1);
    const w1 = await pick(P, 'North of Gabbro, yes.'); await hear(P, 3); await endTalk(P);
    const t2 = await ev(P, () => { window.__t.talkTo('cast:tauno:31'); window.__L.step(3); return window.__t.convo(); });
    const c1 = await pick(P, 'No. South-west of Bald Eagle.');
    await hear(P, 1);
    const ch = await convo(P);
    const c2 = await pick(P, 'The stones are orange.');
    await hear(P, 4); await endTalk(P);
    const f = await facts(P, ['tauno.kettle.wrong', 'kettle.rain', 'door.mining.yield', 'tauno.e7sketch', 'tauno.crewmap']);
    const page = await ev(P, () => window.__a2.inv('page:crewmap'));
    result('B6 no rain all season: "North of Gabbro, yes." ends it; asked again, "No. South-west…" offers only the dry answer ("The stones are orange."); the crew map, the yield, L6B',
      t1.c && /^Well\? Kettle pad/.test(t1.c.say || '') && w1.ok && t2 && /^Well\? Kettle pad/.test(t2.say || '') && c1.ok && ch && ch.choices.length === 1 && /^The stones are orange/.test(ch.choices[0]) && c2.ok && f['door.mining.yield'] && f['tauno.e7sketch'] && !f['kettle.rain'] && page >= 1, { t1: t1.c && t1.c.say, st: t1.st, ch, f, page });
  } catch (e) { result('B6 threw', false, { e: String(e.stack || e).slice(0, 800) }); }

  // B7 the clean book: "Not today." (the ask ends), the same day no ask, next day the ask again in the same words; then
  // "Let's go." with the purse at $0 (the fee his: refunded or not charged); B8 the page reloaded at the road end before
  // the slab's talk: is there still a way to the climax?
  try {
    const a1 = await ev(P, (yday) => { window.__a2.at(yday + 1, 8); return true; }, yday);
    const t1 = await talkTauno(P);
    const n1 = await pick(P, 'Not today.'); await hear(P, 2); await endTalk(P);
    const t2 = await ev(P, () => { window.__t.talkTo('cast:tauno:31'); window.__L.step(3); return window.__t.convo(); }); await endTalk(P);
    await ev(P, (yday) => window.__a2.at(yday + 2, 8), yday);
    const t3 = await talkTauno(P);
    const m0 = await ev(P, () => { const pr = window.__game.profile; pr.s.money = 0; pr.write && pr.write(); return pr.money; });
    const go1 = await pick(P, 'Let\'s go.');
    const lot = await ev(P, async () => { const L = window.__L, g = window.__game, M = window.__a2.M().miningCast; for (let k = 0; k < 90 && !(g.rides && !g.rides.busy && g.rides.last && g.rides.last.to === 33); k++) { L.step(10); await L.wait(120); } for (let k = 0; k < 120 && !(M.slab && M.slab.tauno); k++) { L.step(10); g.storyLayer.poll(); await L.wait(100); } return { last: g.rides.last && { to: g.rides.last.to, price: g.rides.last.price }, money: g.profile.money, slab: !!(M.slab && M.slab.tauno), ride: g.story.has('tauno.ride'), pays: (g.story.doc.dir.pay || []).map((p) => `${p.line}:${p.amt}:${p.paid}`) }; });
    result('B7 "Not today." then no ask that day, the same ask the next; "Let\'s go." with $0: the ride goes (he pays), the purse never below $0, "Gas, Tauno" owed',
      t1.c && /^You doing anything this morning\?/.test(t1.c.say || '') && n1.ok && t2 && !/^You doing anything/.test(t2.say || '') && t3.c && t3.c.say === t1.c.say && go1.ok && lot.last && lot.last.to === 33 && lot.money >= 0 && lot.slab && lot.pays.some((p) => p.startsWith('30:4.9.gas')), { t1: t1.c && t1.c.say, t2: t2 && t2.say, t3: t3.c && t3.c.say, m0, lot });
    if (lot.pays.some((p) => /^30:4\.9\.gas:0:/.test(p))) result('B7w the $0 fare leaves a "Gas, Tauno · $0" line owed for the tally (D\'s pay:0 form): a tally line that pays nothing', 'warn', { pays: lot.pays });
    // B8: the tab closed at the road end, before the slab's talk
    await reload(P);
    const b8 = await ev(P, async () => {
      const g = window.__game, A = window.__a2, M = A.M().miningCast, L = window.__L; L.step(30);
      const out = { at: [Math.round(g.player.x), Math.round(g.player.z)], slab: !!(M.slab && M.slab.tauno), f: A.facts(['tauno.ride', 'tauno.slab', 'door.mining.climax', 'door.mining.done']) };
      const m = await import('/src/story-data/mining.js');
      out.next = m.farmEntry(g.story, { porchVisit: true });
      return out;
    });
    const nd = await ev(P, () => { const g = window.__game; window.__a2.at(g.day.doy + 1, 8); return g.day.doy; });
    const t4 = await talkTauno(P);
    const hub = t4.c ? await hear(P, 1) : [];
    const c4 = await convo(P); await endTalk(P);
    result('B8 the page reloaded after "Let\'s go." (at the road end, before the slab): Tauno at the slab again, or the ask again at Farm — some way to door.mining.climax',
      b8.slab || (t4.c && /^You doing anything this morning\?/.test(t4.c.say || '')) || (c4 && c4.choices.some((t) => /record/i.test(t))), { b8, nd, t4: t4.c && t4.c.say, c4 });
  } catch (e) { result('B7/B8 threw', false, { e: String(e.stack || e).slice(0, 800) }); }

  // B9 the pay owed and the tally: owed, a trip ends (paid once, the purse up), the page reloaded at once (no flush),
  // another trip: never paid twice
  try {
    await ev(P, () => { const s = window.__game.story; s.rules.apply({ id: 'chk:pay', then: ['pay:35@30:4.3.pay.1'] }, {}); });
    const p0 = await pays(P);
    const t1 = await tripOnce(P);
    const p1 = await pays(P);
    await P.waitForTimeout(Number(arg('b9wait', '0')));
    await reload(P, 'story=1', { flush: false });
    const m1 = await ev(P, () => window.__game.profile.money);
    const p2 = await pays(P);
    const t2 = await tripOnce(P);
    const owed = p0.filter((p) => !p.paid).reduce((a, p) => a + p.amt, 0);
    result('B9 the pay owed: paid at the next trip\'s tally with its line, the purse up by it; reloaded at once: kept; the next trip pays none of it again',
      t1.m1 - t1.m0 >= owed && t1.story && t1.story.some((l) => /Field help/.test(l.title)) && m1 === t1.m1 && p2.every((p) => p.paid) && t2.m1 === t2.m0 && !(t2.story || []).length, { p0, t1, p1, m1, p2, t2 });
  } catch (e) { result('B9 threw', false, { e: String(e.stack || e).slice(0, 800) }); }
  await P.context().browser().close();
}

// ------------------------------------------------------------------------------------------------------------------------
// group F: the flag off mid-arc (a dev or a tester switching ?story=1 off and on, as chk-save's S2 does for chapter 1)
async function groupF() {
  const P = await fresh('F');
  await go(P); await newSeason(P, 31, 191);
  const a = await ev(P, () => {
    const g = window.__game, s = g.story, A = window.__a2, M = A.M();
    s.debug.fixture('turn'); s.set('tauno.said.pads', true, 'chk');
    s.rules.apply({ id: 'chk:items', then: ['f:kettle.lid', 'give:item.leolid', 'give:page.crewmap', 'f:door.mining.yield', 'give:item.shovelblade'] }, {});
    s.rules.apply({ id: 'chk:pay', then: ['pay:35@30:4.3.pay.1'] }, {});
    M.kettle.rain.force({ from: Math.floor(s.nowAbs()), days: 2 }); A.at(g.day.doy, 19);
    return { lid: A.inv('leolid'), map: A.inv('page:crewmap'), blade: A.inv('shovelblade'), flyers: M.kettle.flyers(31).length, m: g.profile.money };
  });
  await reload(P, '');
  const off = await ev(P, () => {
    const g = window.__game, inv = g.inventory, cnt = (id) => { try { return inv.count(id, { reachable: false }); } catch { return 'err'; } };
    const cafe = g.scene.children.filter((m) => /^a2 /.test(m.name || '')).map((m) => m.name);
    return { mining: !!g.storyMining, flyers: g.tasks.flyers ? g.tasks.flyers(31).length : 0, cafe, lid: cnt('leolid'), map: cnt('page:crewmap'), def: !!(g.items && g.items.itemDef && g.items.itemDef('leolid')), raw: (g.store.getItem('bwca-canoe:inventory') || '').includes('leolid') };
  });
  const t = await tripOnce(P);
  await ev(P, () => { const g = window.__game; g.step(1 / 30, 60); try { g.inventory.write(); } catch { /* */ } });
  const offRaw = await ev(P, () => (window.__game.store.getItem('bwca-canoe:inventory') || '').includes('leolid'));
  result('B10a the flag off on a mid-arc save: no story module, no Kettle flyer, no café or Kettle meshes, no story pay on the tally', !off.mining && off.flyers === 0 && !off.cafe.length && !(t.story || []).length, { a, off, t });
  await reload(P, 'story=1');
  const on = await ev(P, () => { const A = window.__a2; return { lid: A.inv('leolid'), map: A.inv('page:crewmap'), blade: A.inv('shovelblade'), f: A.facts(['kettle.lid', 'mary.lid.given']), want: A.M().miningCast.wants('mary'), owed: (window.__game.story.doc.dir.pay || []).filter((p) => !p.paid).map((p) => p.amt) }; });
  result('B10b … and on again: Leo\'s lid, the crew map page and the blade still yours (a flag-off build drops items it has no definition for, and its next write makes it stick; kettle.lid is set and the lid\'s prop is gone, so Mary\'s back table — L2A — could never be reached)',
    on.lid === 1 && on.map === 1 && on.blade === 1, { offRaw, on });
  const t2 = await tripOnce(P);
  result('B10c the pay owed while the flag was off: paid once, flag on again, at the next tally', (t2.story || []).some((l) => /Field help/.test(l.title)) && t2.m1 - t2.m0 >= 35, { t2 });
  await P.context().browser().close();
}

// ------------------------------------------------------------------------------------------------------------------------
// group S: saves (export/import mid-arc; an old save whose data hash is chapter 1's)
async function groupS() {
  const P = await fresh('S');
  await go(P); await newSeason(P, 31, 191);
  const a = await ev(P, () => {
    const g = window.__game, s = g.story, A = window.__a2, M = A.M();
    s.debug.fixture('turn'); s.set('tauno.said.pads', true, 'chk'); s.set('tauno.farm.met', true, 'chk'); s.set('door.mining.open', true, 'chk');
    M.kettle.rain.force({ from: Math.floor(s.nowAbs()), days: 2 }); A.at(g.day.doy, 19);
    const F = M.kettle.flyers(31); const took = F[0] ? F[0].take() : null;
    s.rules.apply({ id: 'chk:items', then: ['f:kettle.lid', 'give:item.leolid', 'f:mary.lid.asked'] }, {});
    try { M.mtasks && M.mtasks.offerLen && M.mtasks.offerLen(31); } catch { /* */ }
    s.rules.apply({ id: 'chk:pay', then: ['pay:35@30:4.3.pay.1'] }, {});
    return { took, facts: Object.keys(s.facts()).sort(), dir: { pay: s.doc.dir.pay, a2rain: s.doc.dir.a2rain }, eps: JSON.parse(JSON.stringify(s.doc.eps || {})), lid: A.inv('leolid'), live: g.slots.live, len: A.task('lenphotos'), rings: A.ringed('kettle') };
  });
  await flushAll(P);
  const ex = await ev(P, async () => { const g = window.__game; g.slots.flush(); await new Promise((r) => setTimeout(r, 200)); const r = await g.slots.exportSeason(g.slots.live); return r && r.text; });
  const imp = await ev(P, async (t) => window.__game.slots.importSeason(t, 3), ex);
  await P.waitForTimeout(2000); await booted(P);
  const nav = P.waitForNavigation({ timeout: 120000 }).catch(() => null); await ev(P, () => window.__game.slots.play(3)); await nav; await booted(P);
  await P.evaluate(() => { const g = window.__game; if (g.title.state === 'title' && g.profile.started) g.title.continueTrip(); }); await inGame(P).catch(() => null); await inject(P);
  const b = await ev(P, () => { const g = window.__game, s = g.story, A = window.__a2, M = A.M(); return { live: g.slots.live, facts: Object.keys(s.facts()).sort(), dir: { pay: s.doc.dir.pay, a2rain: s.doc.dir.a2rain }, eps: JSON.parse(JSON.stringify(s.doc.eps || {})), lid: A.inv('leolid'), flyers: M.kettle.flyers(31).length, len: A.task('lenphotos'), rings: A.ringed('kettle'), errs: s.debug.errors ? s.debug.errors() : null }; });
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  result('B11 export mid-arc → import into slot 3: the facts, the pay owed, the forced rain, the runner\'s state, the lid, Len\'s favour and the pad\'s ring all travel; the notice stays taken',
    b.live === 3 && same(a.facts, b.facts) && same(a.dir, b.dir) && same(a.eps, b.eps) && b.lid === a.lid && b.flyers === 0 && (!a.len || (b.len && b.len.status === a.len.status)) && b.rings === a.rings, { imp, a: { ...a, facts: a.facts.length }, b: { ...b, facts: b.facts.length }, missing: a.facts.filter((k) => !b.facts.includes(k)) });
  // an older data hash (a save last written by a chapter 1 build): the rules re-run quietly on load; no rings, gifts or
  // pay replayed; nothing thrown
  const c = await ev(P, async () => {
    const g = window.__game, s = g.story; s.doc.data = 'sd-chapter1'; s.flush(); g.slots.flush(); await new Promise((r) => setTimeout(r, 200)); await g.store.flush();
    return { pays: (s.doc.dir.pay || []).length, lid: window.__a2.inv('leolid'), marks: window.__t.marks().length };
  });
  await reload(P, 'story=1', { flush: false });
  const d = await ev(P, () => { const g = window.__game, s = g.story; return { data: s.doc.data, cur: s.data, pays: (s.doc.dir.pay || []).length, lid: window.__a2.inv('leolid'), marks: window.__t.marks().length, errs: s.debug.errors ? s.debug.errors() : null, facts: Object.keys(s.facts()).length }; });
  result('B12 a save with chapter 1\'s data hash loaded by chapter 2: re-run quietly (the hash updated), no pay or gift replayed, no ring doubled, no errors',
    d.data === d.cur && d.pays === c.pays && d.lid === c.lid && d.marks === c.marks && !(d.errs || []).length, { c, d });
  // a new season in the same slot with the pay still owed: no throw, the new story blank (the old owed pay goes with its season)
  const nav2 = P.waitForNavigation({ timeout: 120000 }).catch(() => null);
  await ev(P, () => window.__game.slots.startNew(3, { ep: 31, mode: 'adventure', start: { year: 2026, doy: 200 } })); await nav2; await booted(P); await inGame(P).catch(() => null); await inject(P);
  const e = await ev(P, () => { const g = window.__game, s = g.story; return { live: g.slots.live, facts: Object.keys(s.facts()).length, pays: (s.doc.dir && s.doc.dir.pay || []).length, lid: window.__a2.inv('leolid'), flyers: window.__a2.M().kettle.flyers(31).length }; });
  result('B13 a new season over the slot with pay owed: a blank story, nothing owed, no lid, no notice', e.facts === 0 && e.pays === 0 && e.lid === 0 && e.flyers === 0, e);
  await P.context().browser().close();
}

// ------------------------------------------------------------------------------------------------------------------------
// group C: a co-op guest mid-arc (the host's notice up, Mary at her window, the Kettle day): the guest sees no story and
// its own story2 never moves. (The tauno.armed race at the guest's boot is claude/c2-fix's; not this group's.)
async function groupC() {
  if (!RELAY) { result('C skipped: no RELAY', 'warn'); return; }
  const goC = async (page, q) => { await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${q ? '&' + q : ''}`, { timeout: 180000 }); await booted(page); };
  const B = await fresh('guest');
  await goC(B, 'story=1'); await newSeason(B, 31, 190);
  await ev(B, async () => { const g = window.__game; g.walt.find({ key: 1, lake: 'Guest Own Lake' }); await new Promise((r) => setTimeout(r, 200)); g.story.debug.set('crews.seen'); g.story.flush(); g.slots.flush(); await new Promise((r) => setTimeout(r, 500)); });
  const own0 = await ev(B, () => window.__game.store.getItem('bwca-canoe:story2'));
  const inv0 = await ev(B, () => window.__game.store.getItem('bwca-canoe:inventory'));
  const A = await fresh('host');
  await goC(A, 'story=1'); await newSeason(A, 31, 191);
  const h = await ev(A, () => {
    const g = window.__game, s = g.story, A2 = window.__a2, M = A2.M();
    s.debug.fixture('turn'); s.set('tauno.said.pads', true, 'chk'); s.set('tauno.farm.met', true, 'chk');
    let d = g.day.doy + 1; while (A2.dow(d) !== 2) d++;
    M.kettle.rain.force({ from: A2.abs(d) - 2, days: 2 }); A2.at(d, 9.4);
    return { d, flyers: M.kettle.flyers(31).length, day: M.kettle.day() };
  });
  const code = await ev(A, () => window.__game.coop.invite({ name: 'Host', shirt: 2 }));
  await B.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}&story=1&join=${code}`, { timeout: 180000 }); await booted(B);
  await B.waitForFunction(() => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); }, null, { timeout: 120000 });
  await B.fill('#coop-name', 'Ada'); await B.click('#coop-go');
  await B.waitForFunction(() => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 150000, polling: 250 });
  await inject(B);
  // the host at Farm on a Tuesday 9:30 (Mary at her window), the guest beside them
  await ev(A, async () => { const A2 = window.__a2; await A2.toFarm(); A2.inside(); for (let k = 0; k < 10; k++) { window.__L.step(20); await window.__L.wait(40); } });
  const hs = await ev(A, () => ({ staged: window.__a2.M().miningCast.staged().map((q) => q.who), flyers: window.__a2.M().kettle.flyers(31).length, board: window.__game.tasks.flyers(31).length }));
  const g1 = await ev(B, async () => {
    const g = window.__game, L = window.__L, S = g.outfitter.layout(31);
    if (S) { await L.tp(S.centre.x + 20, S.centre.z + 20); await L.settle(); L.standAt(S.centre.x, S.centre.z); }
    for (let k = 0; k < 10; k++) { L.step(20); await L.wait(40); }
    const M = g.storyMining;
    return { mode: g.story.mode, staged: M ? M.miningCast.staged().map((q) => q.who) : 'none', flyers: M ? M.kettle.flyers(31).length : 'none', board: g.tasks.flyers ? g.tasks.flyers(31).length : 0, take: M ? M.kettle.takeNotice() : 'none', cafe: g.scene.children.filter((m) => /^a2 cafe/.test(m.name || '')).length, give: M ? M.miningCast.give('mary', 'leolid') : 'none' };
  });
  result('C1 the guest at Farm on the host\'s Tuesday morning, the host\'s notice up and Mary at her window: the guest sees no flyer (and can\'t take it), no Farm cast, no café; the host sees theirs',
    g1.mode === 'mirror' && Array.isArray(g1.staged) && !g1.staged.length && g1.flyers === 0 && g1.board === 0 && g1.take === false && g1.cafe === 0 && hs.flyers === 1, { hs, g1 });
  // the guest walks into the Kettle hollow on the Kettle day and tries the lid; nothing is written to its story or bag
  const g2 = await ev(B, async () => {
    const g = window.__game, L = window.__L, M = g.storyMining, lay = g.storyLayer, K = lay && lay.place ? lay.place('kettle') : null;
    if (!K) return { noLayer: true };
    await L.near(K.x - 30, K.z + 8); lay.poll(); L.step(10); lay.poll(); if (M) M.kettle.update(1);
    let look = null; try { look = lay.look('kettle.lid'); } catch (e) { look = 'threw:' + e.message; }
    return { look, verbs: lay.verbs('kettle.lid'), tasha: M ? !!M.kettle.tasha() : 'none', facts: Object.keys(g.story.facts()), lid: g.inventory.count('leolid', { reachable: false }), at: [Math.round(g.player.x), Math.round(g.player.z)] };
  });
  await ev(A, () => { const g = window.__game; g.step(1 / 30, 60); });
  const hostF = await ev(A, () => window.__a2.facts(['kettle.visited', 'kettle.lid']));
  const now2 = await ev(B, async () => { const g = window.__game; try { g.story.flush(); } catch { /* */ } try { g.slots.flush(); } catch { /* */ } await new Promise((r) => setTimeout(r, 300)); return { s2: g.store.getItem('bwca-canoe:story2') }; });
  result('C2 the guest in the Kettle hollow: no Tasha, the lid not taken, no fact on the guest; the guest\'s own story2 as it was (the host\'s facts its own)',
    !g2.noLayer && !g2.tasha && !g2.lid && !g2.facts.length && now2.s2 === own0 && !hostF['kettle.lid'], { g2, hostF, same: now2.s2 === own0 });
  // the guest leaves: back home its own story and bag as before
  const nav = B.waitForNavigation({ timeout: 120000 }).catch(() => null);
  await ev(B, () => window.__game.coop.leave()); await nav; await booted(B); await B.waitForTimeout(1500);
  const back = await ev(B, () => { const g = window.__game; return { mode: g.story.mode, s2: g.store.getItem('bwca-canoe:story2'), inv: g.store.getItem('bwca-canoe:inventory'), lid: g.inventory.count('leolid', { reachable: false }) }; });
  result('C3 the guest home again: its own story2 unchanged, no lid in its bag', back.mode === 'live' && back.s2 === own0 && !back.lid, { mode: back.mode, same: back.s2 === own0, invSame: back.inv === inv0, lid: back.lid });
  for (const p of [A, B]) { try { await p.context().browser().close(); } catch { /* */ } }
}

try {
  if (ONLY.includes('A')) await groupA();
  if (ONLY.includes('F')) await groupF();
  if (ONLY.includes('S')) await groupS();
  if (ONLY.includes('C')) await groupC();
} catch (e) { result('rig ran to the end', false, { error: String(e && e.stack || e).slice(0, 1500) }); }
finally { for (const b of browsers) { try { await b.close(); } catch { /* */ } } }
result('no page errors', !errors.length, { errors: errors.slice(0, 10) });
const n = (k) => results.filter((r) => r.k === k).length;
writeFileSync(path.join(OUT, 'chk-c2b.json'), JSON.stringify({ pass: n('PASS'), fail: n('FAIL'), warn: n('WARN'), results }, null, 1));
log(`chk-c2b: ${n('PASS')} PASS, ${n('FAIL')} FAIL, ${n('WARN')} WARN of ${results.length}`);
process.exit(n('FAIL') ? 1 : 0);
