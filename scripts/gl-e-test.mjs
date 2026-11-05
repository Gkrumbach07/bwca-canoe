// Stream E (gl-e, NPC immersion): the acceptance checks of docs/build/game-loop-brief.md, headless.
//   npx vite --port 5185 --strictPort &   then   node scripts/gl-e-test.mjs [--only 1,2,3,4,6] [--perf]
//   APP=http://localhost:5185 (this build); --perf also needs BASE=http://localhost:<port> serving origin/main
// 1  Moose Lake (25), a July Saturday morning before the first put-in: every party member in the store's roster is of a
//    party going in there today, and that party's whole crew is in the store or at the dock.
// 2  After their put-in they are gone from the store and on the water (party-moves.js); that evening at their camp the
//    greeting remembers the store.
// 3  Over 20 game minutes a visitor's activity changes at least twice; a fresh page (same season) gives the same
//    sequence; talked to, they face you and their activity clock pauses, then resumes.
// 4  A party coming out names only lakes in its stays, and a wind-bound day only when windDay says so.
// 5b At a trailhead's lot (stream B's trailheadLayout; a stand-in here) the parties load and unload.
// 6  No generated name is Walt or Eino; the cedar-minnow arc reads Leif.
// 8  An old save's people (v1) loads as v2 with met {}; met is pruned a week after a party's trip ends.
// 7  (--perf) frame time in a busy store (Moose Lake, a July Saturday) against origin/main, alternating.
import { launch, openGame, seasonAt, step, log, APP } from './gl-e-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = new Set(String(arg('only', '1,2,3,4,5,6,8')).split(',').map(Number));
const PERF = process.argv.includes('--perf');
const YEAR = 2026, DOY = 192, EP = 25, H0 = 7.75; // Saturday 11 July 2026
const results = [];
const check = (name, pass, more = {}) => { results.push({ name, pass: !!pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };
const FPS = 30, MIN = Math.round((60 / 8) * FPS); // frames in a game minute (the one clock, x8)

// step to the next whole game minute (or n minutes), the frames at 1/30 s
async function minutes(page, n = 1) { for (let k = 0; k < n; k++) await step(page, MIN, 1 / FPS, MIN); }
// the activity of a figure over n game minutes, read at each minute
async function sequence(page, key, fig, n = 20) {
  const out = [];
  // (read half way through each game minute, clear of the five-minute steps' edges)
  const off = await page.evaluate(() => { const c = window.__game.smart.clock * 60; return 0.5 - (c - Math.floor(c)); });
  if (off > 0.02) await step(page, Math.round(off * MIN), 1 / FPS, MIN); else if (off < -0.02) await step(page, Math.round((1 + off) * MIN), 1 / FPS, MIN);
  for (let k = 0; k <= n; k++) {
    out.push(await page.evaluate(({ key, fig }) => { const g = window.__game, a = g.smart.activityOf(`${key}#${fig}`); return { m: Math.floor(g.smart.clock * 60), act: a ? `${a.act}@${a.obj}#${a.slot}` : null }; }, { key, fig }));
    if (k < n) await minutes(page, 1);
  }
  return out;
}
const changes = (seq) => seq.reduce((c, x, i) => c + (i && x.act !== seq[i - 1].act ? 1 : 0), 0);

const browser = await launch();
try {
  const A = await openGame(browser);
  log('page A loaded', APP);
  await seasonAt(A, { ep: EP, year: YEAR, doy: DOY, hours: H0 });
  await step(A, 60);
  const seasonId = await A.evaluate(() => window.__game.profile.seasonId);

  // --- 1 -------------------------------------------------------------------------------------------------------
  const r1 = await A.evaluate(({ EP }) => {
    const g = window.__game, P = g.parties, N = g.npcs, T = P.today, h = g.day.hours, L = g.outfitter.visit && g.outfitter.visit.L;
    const ent = P.entering(EP, T).filter((p) => p.stays.length), first = Math.min(...ent.map((p) => p.putIn));
    const roster = N.at(EP), parties = roster.filter((v) => v.inParty), bad = [];
    const near = (f, q, r) => q && Math.hypot(f.x - q.x, f.z - q.z) < r;
    for (const v of parties) {
      const p = ent.find((x) => x.id === v.partyId);
      if (!p) { bad.push(`${v.key}: not entering`); continue; }
      if (v.figs.length !== p.size) bad.push(`${v.key}: ${v.figs.length} of ${p.size}`);
      v.figs.forEach((f, i) => {
        const at = f.goal || f;
        if (f.where === 'store') { if (!(L.inside(at.x, at.z) || near(at, L.door, 6))) bad.push(`${v.key}#${i} store spot outside`); }
        else if (f.where === 'dock') { if (!(near(at, L.dockFoot, 30) || near(at, L.dockDeck, 30))) bad.push(`${v.key}#${i} dock spot far`); }
        else bad.push(`${v.key}#${i} where ${f.where}`);
      });
    }
    return { T, h: +h.toFixed(2), first: +first.toFixed(2), entering: ent.length, inStore: parties.map((v) => `${v.partyId} ${v.crew.map((c) => c.where[0]).join('')}`), locals: roster.filter((v) => !v.inParty && !v.keeper).map((v) => v.arch), bad };
  }, { EP });
  if (ONLY.has(1)) check('1 store visitors are the parties going in, whole crews in the store or at the dock', r1.h < r1.first && r1.inStore.length > 0 && !r1.bad.length, r1);

  // --- 5b: a trailhead's lot (stream B's trailheadLayout; here a stand-in lot by Moose Lake's yard): the parties load there
  if (ONLY.has(5)) {
    await A.evaluate(({ EP, year, doy }) => { const g = window.__game, P = g.parties, ps = P.entering(EP, P.today).filter((p) => p.stays.length).map((p) => p.putIn).sort((a, b) => a - b); g.day.setClock(year, doy, Math.max(g.day.hours, (ps[0] || 9) - 0.45)); }, { EP, year: YEAR, doy: DOY });
    const r5 = await A.evaluate(async () => {
      const g = window.__game, N = g.npcs, L = g.outfitter.visit && g.outfitter.visit.L, p = g.player;
      const lot = { x: L.stepsFoot.x, z: L.stepsFoot.z, heading: 0 }, landing = { x: L.dockFoot.x, z: L.dockFoot.z };
      N.attachParties({ trailheadLayout: (ep) => (ep === 25 ? { lot, landing, sign: lot, box: lot } : null) });
      g.step(1 / 30, 60);
      const list = N.lots.get(25) || [], want = N.storeParties(25, g.parties.today, g.day.hours, { before: 0.75, after: 0.5, parties: 3 });
      const ok = list.length === want.length && list.every((v) => v.figs.every((f) => f.where === 'lot' && Math.hypot(f.x - lot.x, f.z - lot.z) < 12));
      N.trailheadOf = null; N.lots.clear();
      return { ok, parties: list.map((v) => `${v.partyId} ${v.figs.length}`), want: want.length, acts: list.flatMap((v) => v.figs.map((f) => f.act)) };
    });
    check('5b at a trailhead lot the parties load and unload (stand-in lot)', r5.ok && r5.want > 0, r5);
  }

  // the party to follow: one with a site tonight (a party with none is not out on the water), the clock to an hour and a
  // quarter before its put-in; its leader is talked to (3) and met (2)
  await A.evaluate(({ EP, year, doy }) => {
    const g = window.__game, P = g.parties, T = P.today, list = P.entering(EP, T).filter((p) => p.stays.length && P.legPlan(p, 0)).sort((a, b) => b.putIn - a.putIn);
    if (list[0]) g.day.setClock(year, doy, Math.max(g.day.hours, list[0].putIn - 1.3));
  }, { EP, year: YEAR, doy: DOY });
  await step(A, 60);
  const pick = await A.evaluate(({ EP }) => {
    const g = window.__game, N = g.npcs, P = g.parties, list = N.at(EP).filter((v) => v.inParty && v.dir === 'in' && P.legPlan(v.trip, 0)).sort((a, b) => b.trip.putIn - a.trip.putIn); // (one with a site tonight: a party with none is not out on the water)
    const v = list[0]; if (!v) return null;
    const other = N.at(EP).filter((x) => !x.keeper && !x.extra && x !== v).flatMap((x) => x.figs.map((f, i) => ({ key: x.key, i, until: x.until ?? 99, where: f.where || 'store' }))).filter((q) => q.where === 'store' && q.until - g.day.hours > 0.6)[0] || null;
    return { key: v.key, id: v.partyId, putIn: v.trip.putIn, other };
  }, { EP });
  log('following', pick);

  // --- 3b: talked to, they stop and face you; their clock pauses, then resumes ---------------------------------------
  if (ONLY.has(3) && pick) {
    const t0 = await A.evaluate(({ key }) => {
      const g = window.__game, N = g.npcs, v = N.find(key), f = v.figs[0], p = g.player;
      // (the moment: a party member a step away in the store, none met yet)
      if (g.outfitter.visit && g.outfitter.visit.L && g.outfitter.visit.L.inside(f.x, f.z)) { p.x = f.x + 1.2; p.z = f.z; g.step(1 / 30, 2); }
      const moment = g.hints.due('storeparty', {});
      N.talkTo(v, 0);
      return { talking: g.dialogue.talking, clock: g.smart.clock, a: g.smart.activityOf(`${key}#0`), moment, afterMet: N.partyHere() };
    }, { key: pick.key });
    await minutes(A, 10);
    const t1 = await A.evaluate(({ key }) => {
      const g = window.__game, N = g.npcs, s = N.figState(key, 0), p = g.player, want = Math.atan2(-(p.z - s.z), p.x - s.x), off = Math.abs(Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading)));
      return { talking: g.dialogue.talking, a: g.smart.activityOf(`${key}#0`), off: +off.toFixed(2), walking: s.walking, clock: g.smart.clock };
    }, { key: pick.key });
    await A.evaluate(() => { const D = window.__game.dialogue; if (D.talking) D.close(); });
    await minutes(A, 3);
    const t2 = await A.evaluate(({ key }) => { const g = window.__game; return { a: g.smart.activityOf(`${key}#0`), clock: g.smart.clock }; }, { key: pick.key });
    const same = t0.a && t1.a && t0.a.act === t1.a.act && t0.a.obj === t1.a.obj;
    check('3 the moment: a party in the store, none met: once, then never', t0.moment === true && t0.afterMet === false, { moment: t0.moment, afterMet: t0.afterMet });
    check('3 talked to: they face you, the activity clock pauses, then resumes', t0.talking && t1.talking && same && t1.a.paused && t1.off < 0.6 && !t1.walking && t2.a && !t2.a.paused && t2.a.until > t1.clock, { t0, t1, t2 });
  }

  // --- 3a: the activity sequence, and the same on a fresh page ------------------------------------------------------
  let seqA = null;
  const who = pick && pick.other;
  if (ONLY.has(3) && who) {
    const start = await A.evaluate(() => window.__game.day.hours);
    log('A people', await A.evaluate((() => { const g = window.__game; return g.npcs.at(25).filter((v) => !v.keeper).map((v) => `${v.key}:${v.figs.map((f) => f.where || 's').join('')}`).join(' | ') + ` seed ${g.parties.seed}`; })));
    seqA = await sequence(A, who.key, who.i, 20);
    const n = changes(seqA);
    check('3 a visitor\'s activity changes at least twice in 20 game minutes', n >= 2, { who, changes: n, seq: seqA.map((x) => x.act) });
    // a fresh page: the same season (its id), the same clock, the same steps
    const B = await openGame(browser, { quiet: true });
    await seasonAt(B, { ep: EP, year: YEAR, doy: DOY, hours: H0 });
    await B.evaluate(({ id, start, year, doy }) => { const g = window.__game; g.profile.s.id = id; g.parties.forget(); g.smart.memo.clear(); g.day.setClock(year, doy, start); }, { id: seasonId, start, year: YEAR, doy: DOY });
    await step(B, 30);
    log('B people', await B.evaluate((() => { const g = window.__game; return g.npcs.at(25).filter((v) => !v.keeper).map((v) => `${v.key}:${v.figs.map((f) => f.where || 's').join('')}`).join(' | ') + ` seed ${g.parties.seed}`; })));
    const seqB = await sequence(B, who.key, who.i, 20);
    // (the activity is a function of the clock: the same game minute, the same act; compared minute by minute)
    const byMin = new Map(seqB.map((x) => [x.m, x.act])), common = seqA.filter((x) => byMin.has(x.m));
    const sameSeq = common.length >= 15 && common.every((x) => x.act === byMin.get(x.m));
    check('3 a fresh page load gives the same sequence', sameSeq, { minutes: common.length, differ: common.filter((x) => x.act !== byMin.get(x.m)).map((x) => `${x.m}: ${x.act} | ${byMin.get(x.m)}`) });
    await B.close();
  }

  // --- 2: put in, gone from the store, on the water; at their camp that evening they know you ----------------------
  if (ONLY.has(2) && pick) {
    // (met in the store: talked to, if 3 has not)
    await A.evaluate(({ key }) => { const g = window.__game, N = g.npcs, v = N.find(key); if (v && !N.metOf(v.partyId)) { N.talkTo(v, 0); g.dialogue.close(); } }, { key: pick.key });
    const r2a = await A.evaluate(({ id, putIn, year, doy }) => {
      const g = window.__game, h = Math.max(g.day.hours + 0.05, putIn + 0.15);
      g.day.setClock(year, doy, h);
      return { h, met: !!g.npcs.metOf(id) };
    }, { id: pick.id, putIn: pick.putIn, year: YEAR, doy: DOY });
    await step(A, 90);
    const r2b = await A.evaluate(({ id, EP }) => {
      const g = window.__game, N = g.npcs, inStore = N.at(EP).some((v) => v.partyId === id), L = g.moves.active.get(`${id}#0`);
      return { inStore, moving: !!L, seg: L && L.seg ? L.seg.kind : null, boats: L ? L.boats.length : 0 };
    }, { id: pick.id, EP });
    check('2 after their put-in: gone from the store, on the water', r2a.met && !r2b.inStore && r2b.moving && ['paddle', 'drift', 'launch', 'carry', 'landing'].includes(r2b.seg), { ...r2a, ...r2b });
    // their first night's site, at 19:30
    const site = await A.evaluate(async ({ id, year, doy }) => {
      const g = window.__game, P = g.parties, T = P.today, p = P.entering(25, T).find((x) => x.id === id), s = p.stays[0], i = P.block(s.start).site.get(s);
      if (i == null || i < 0) return null;
      const c = g.world.campsites[i], lid = P.stayLake(s), l = lid ? g.world.lakes[lid - 1] : null;
      g.day.setClock(year, doy, 19.5);
      let ok = false;
      for (const d of [45, 30, 60, 80]) { const k = l ? d / Math.max(1, Math.hypot(l.cx - c.x, l.cz - c.z)) : 0; const x = c.x + (l ? (l.cx - c.x) * k : 0), z = c.z + (l ? (l.cz - c.z) * k : 0); ok = await g.player.teleport(x, z); if (ok) break; }
      return { ok, key: P.keyOf[i], x: c.x, z: c.z, lake: lid ? g.world.lakeName(lid) : null };
    }, { id: pick.id, year: YEAR, doy: DOY });
    let r2c = null;
    for (let k = 0; k < 12 && site && site.ok; k++) {
      await step(A, 60);
      r2c = await A.evaluate(({ id }) => {
        const g = window.__game, C = g.partyCamps, D = [...C.drawn.values()].find((x) => x.party.id === id), p = g.player;
        // (the greeting comes when you pass within reach by day: bring the canoe in toward the site)
        if (D && D.d > 60) { const dx = D.site.x - p.x, dz = D.site.z - p.z, d = Math.hypot(dx, dz); p.x += (dx / d) * 15; p.z += (dz / d) * 15; }
        const lines = g.dialogue.history.map((x) => x.text || x);
        return { drawn: !!D, d: D ? Math.round(D.d) : null, greeted: C.greeted.get(id) === g.parties.today, lines: lines.slice(-4), metTold: (g.npcs.metOf(id) || {}).told === g.parties.today };
      }, { id: pick.id });
      if (r2c.greeted) break;
    }
    const said = r2c && r2c.lines.some((t) => /store/.test(JSON.stringify(t)));
    check('2 that evening at their camp, the greeting remembers the store', !!(site && site.ok && r2c && r2c.greeted && r2c.metTold && said), { site, r2c });
  }

  // --- 4: a party coming out names only its own lakes, and a wind-bound day only when the forecast blew -----------------
  if (ONLY.has(4)) {
    const r4 = await A.evaluate(({ year }) => {
      const g = window.__game, P = g.parties, N = g.npcs, W = g.weather, names = [];
      for (const l of g.world.lakes) { const n = l && l.cells >= 30 ? g.world.lakeName(l.id) : null; if (n && !names.includes(n)) names.push(n); }
      names.sort((a, b) => b.length - a.length);
      const named = (text) => { let t = text; const out = []; for (const n of names) { const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'); if (re.test(t)) { out.push(n); t = t.replace(re, '#'); } } return out; };
      const bad = [], ydOf = (abs) => { const d = new Date(abs * 86400000), y = d.getUTCFullYear(); return { y, doy: abs - Math.round(Date.UTC(y, 0, 0) / 86400000) }; };
      let parties = 0, lines = 0, winds = 0;
      for (const ep of [25, 38, 1, 55, 30]) for (let doy = 180; doy <= 200; doy++) {
        g.day.setClock(year, doy, 17.5);
        const T = P.today;
        for (const p of P.leaving(ep, T)) {
          parties++;
          const S = P.storyOf(p, T), own = new Set(S.lakes), list = N.partyLines(p, 'out', T);
          for (const x of list) { lines++; for (const n of named(x.text)) if (!own.has(n)) bad.push(`${p.id}: "${n}" not in its stays (${x.text})`); }
          // the wind: exactly the layover days the forecast blew on, and words for one only then
          const want = [];
          for (const s of p.stays) for (let d = s.start + 1; d < s.end && d <= T; d++) { const { y, doy: dd } = ydOf(d), w = W.windDay(y, dd); if (w.blow || w.peak >= 6.5) want.push(d); }
          const got = S.windbound.map((w) => w.abs);
          if (want.join() !== got.join()) bad.push(`${p.id}: windbound ${got} vs forecast ${want}`);
          const said = list.some((x) => /wind kept/.test(x.text));
          if (said) winds++;
          if (said && !got.length) bad.push(`${p.id}: wind words with no wind-bound day`);
        }
      }
      return { parties, lines, winds, bad: bad.slice(0, 12), nBad: bad.length };
    }, { year: YEAR });
    check('4 a party coming out names only its stays\' lakes; wind-bound only when windDay says so', r4.parties > 20 && r4.lines > 20 && !r4.nBad, r4);
  }

  // --- 8: an old save (people v1, no met) loads; the moment for the first party in a store -------------------------
  if (ONLY.has(8)) {
    const r8 = await A.evaluate(async () => {
      const g = window.__game, N = g.npcs, { save } = await import('/src/save.js'), keep = JSON.parse(JSON.stringify(N.s));
      save.write('people', { v: 1, talked: { 'keeper:25': 3 }, tasks: {}, paid: {}, gifts: {}, names: {}, told: [], chat: {}, asked: {}, arcs: { 25: { b: 1, at: 5 } } });
      const s1 = N.load(), v1 = JSON.parse(JSON.stringify(s1));
      N.s = s1; N.s.met['x-1-0'] = { abs: N.today - 20, ep: 25, where: 'Moose Lake', exit: N.today - 10, told: null }; N.s.met['x-2-0'] = { abs: N.today, ep: 25, where: 'Moose Lake', exit: N.today + 3, told: null };
      N.pruneMet(); N.write();
      const s2 = N.load();
      N.s = keep; N.write();
      return { v1: { v: v1.v, met: v1.met, talked: v1.talked['keeper:25'], arcs: v1.arcs[25] }, after: { v: s2.v, met: Object.keys(s2.met) } };
    });
    check('8 an old people save (v1) loads as v2 with met {}; met is pruned a week after a trip ends', r8.v1.v === 2 && JSON.stringify(r8.v1.met) === '{}' && r8.v1.talked === 3 && r8.v1.arcs && r8.after.met.join() === 'x-2-0', r8);
  }

  // --- 6: the story's names are reserved ----------------------------------------------------------------------------
  if (ONLY.has(6)) {
    const r6 = await A.evaluate(async () => {
      const g = window.__game, P = g.parties, N = g.npcs, RES = /\b(Walt|Eino|Haapala)\b/, bad = [];
      const lists = N.nameLists();
      for (const [k, l] of Object.entries(lists)) for (const n of l) if (RES.test(n)) bad.push(`${k}: ${n}`);
      let people = 0;
      for (const e of g.world.entryPoints) for (let d = P.today - 30; d <= P.today + 30; d += 3) for (const p of P.entering(e.ep, d)) { const v = N.partyPerson(p); people += v.members.length; for (const m of v.members) if (RES.test(m.name)) bad.push(`party ${p.id}: ${m.name}`); if (RES.test(v.last)) bad.push(`party ${p.id}: ${v.last}`); }
      const K = await import('/src/talk-keepers.js');
      const txt = JSON.stringify(K.HAND) + JSON.stringify(K.MANNER) + JSON.stringify(K.RELS);
      if (RES.test(txt)) bad.push('talk-keepers.js names one');
      const leif = /Leif/.test(JSON.stringify(K.HAND[30] || K.HAND));
      // the keepers' own names are stream B's (outfitters.js FIRST): reported, not mine to change
      const keepers = g.world.entryPoints.map((e) => g.outfitterProfile(e.ep)).filter((o) => o && o.keeper && RES.test(o.keeper.name)).map((o) => `${o.ep}: ${o.keeper.name}`);
      const item = g.items.itemDef('lure:cedarminnow');
      return { people, bad, leif, keepersB: keepers, cedarItemC: item ? item.name : null };
    });
    check('6 no generated person is Walt or Eino; the cedar-minnow arc reads Leif', !r6.bad.length && r6.leif, r6);
  }

  // --- 7 (--perf): frame time in a busy store, A/B against origin/main ------------------------------------------------
  if (PERF) {
    const BASE = process.env.BASE;
    if (!BASE) log('--perf needs BASE (origin/main served)');
    else {
      const pages = [];
      for (const url of [APP, BASE]) {
        process.env.APP = url;
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const pg = await ctx.newPage();
        await pg.goto(`${url}/`);
        await pg.waitForFunction(() => window.__game && window.__game.title && window.__game.npcs && window.__game.parties, null, { timeout: 240000, polling: 500 });
        await pg.evaluate(async ({ year, doy }) => { const g = window.__game, t = g.title, e = g.world.entryPoints.find((x) => x.ep === 25); t.setPick('sandbox'); await t.newSeason(e, { confirm: false, start: { year, doy } }); }, { year: YEAR, doy: DOY });
        await pg.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 180000, polling: 300 });
        await pg.evaluate(({ year, doy }) => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); g.day.setClock(year, doy, 8.4); g.renderer.setAnimationLoop(null); }, { year: YEAR, doy: DOY });
        pages.push(pg);
      }
      // the busiest hour in this build's store (the most party members about), the same clock in both
      const busy = await pages[0].evaluate(() => { const g = window.__game, N = g.npcs; let best = 8.4, n = -1; for (let h = 7; h <= 18; h += 0.1) { const k = N.storeParties(25, g.parties.today, h).reduce((a, e) => a + e.party.size, 0); if (k > n) { n = k; best = h; } } return { h: best, n }; });
      for (const pg of pages) await pg.evaluate(({ year, doy, h }) => window.__game.day.setClock(year, doy, h), { year: YEAR, doy: DOY, h: busy.h });
      log('busiest hour', busy);
      // the same seat in the store in both: at the door, looking in
      const seat = async (pg) => pg.evaluate(() => { const g = window.__game, L = g.outfitter.visit && g.outfitter.visit.L; if (L) { g.player.x = L.door.x; g.player.z = L.door.z; g.player.heading = L.door.heading; } g.step(1 / 30, 120); g.step(1 / 30, 600); });
      for (const pg of pages) await seat(pg);
      const timeOf = (pg) => pg.evaluate(() => { const g = window.__game, gl = g.renderer.getContext(), px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t0 = performance.now(); g.step(1 / 30, 4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return (performance.now() - t0) / 4; });
      const ms = [[], []];
      for (let k = 0; k < 40; k++) for (let j = 0; j < 2; j++) ms[j].push(await timeOf(pages[j]));
      const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
      const people = await pages[0].evaluate(() => window.__game.npcs.stats().drawn.length), peopleB = await pages[1].evaluate(() => window.__game.npcs.stats().drawn.length);
      const a = med(ms[0]), b = med(ms[1]);
      check('7 frame time in a busy store within 10 % of origin/main', a <= b * 1.1, { thisMs: +a.toFixed(2), mainMs: +b.toFixed(2), ratio: +(a / b).toFixed(3), drawn: people, drawnMain: peopleB });
    }
  }
} catch (e) {
  log('ERROR', e && e.stack ? e.stack : e);
  results.push({ name: 'driver', pass: false, error: String(e) });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
