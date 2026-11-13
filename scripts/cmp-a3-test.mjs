// Story Round 4, stream A3 (the guiding years, docs/story/31-guiding-years.md): the arc's main path at Moose Lake 25 in
// the real game, headless Chromium against a running Vite (?story=1), each check printed PASS or FAIL. From the end of
// chapter 1's slice (story.debug.fixture('turn'), NB39 read) on a home-25 season:
//   0 flag off: none of A3's modules fetched, no storyGuiding
//   1 Hap on a Saturday: the first sit, "What was he like?", the 1986 day told, his print on loan
//   2 Rick at dawn: "Where does the tow land at Prairie?" (gy.tow.told); the tow landing stood at (the layer's trigger)
//   3 Hap the next weekend: the tow landing set right gently, the real talk: the lake (L2A, the yield)
//   4 Sheila on a Thursday: Walt's search, page two ("He wrote it down."), "Could we see it?"
//   5 the hinge: drift.done (stream m's fact) → "Went north." on the Walt page
//   6 Marlys on a Tuesday: "I'm Marlys.", "'M.' in his notebook." → the loft's favour
//   7 the boathouse loft: up the ladder, the 2020 box: the register, the message, the clipping
//   8 Marlys again: the night asked ("I'll be there.")
//   9 bunk 3's night, played: the Rest dial stops at 18:05, 22:00, 23:40, 01:00, 02:00, 06:00 and nothing else; the
//     pickup walked up to; at six "Tell Sheila."; the close ("It went north. Every time.")
//  10 Sheila's statement the next Thursday (Marlys at the landing): "Wade?"
//   (and no page errors)
//
//   APP=http://localhost:5270 node scripts/cmp-a3-test.mjs [--only off|A] [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS_T, choose, hear } from './slice/c1-talk.mjs';
import { HELPERS } from './slice/c1-layer.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5270').replace(/\/$/, '');
const ONLY = arg('only', null), SHOTS = arg('shots', null), UPTO = Number(arg('upto', 99));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const open = async (url) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') log('console', t.slice(0, 300)); else if (/story A3|guiding|story rule|story\.when|story scene|story\.set/.test(t)) log('console', t.slice(0, 300)); });
  await page.goto(url, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && (!/story=1/.test(location.search) || (window.__game.storySeams && window.__game.storyTalk && window.__game.storyGuiding)) && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS_T); await page.evaluate(HELPERS);
  await page.evaluate(HELPERS_A3);
  return page;
};
const newSeason = async (page, home, doy = 191) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate((d) => { const w = window.__game.title.wizard; w.setDate(d); w.next(); }, doy);
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, T = window.__t; T.step(30); const o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 10); T.step(10); });
};

// the page's helpers (window.__a3)
const HELPERS_A3 = () => {
  const g = window.__game, A = window.__a3 = {}, L = window.__L;
  A.GC = () => g.storyGuiding.guidingCast;
  A.s = () => g.story;
  A.dow = (doy) => new Date(Date.UTC(g.day.year, 0, doy)).getUTCDay();
  // the next day on or after `from` that is that weekday (0 Sunday)
  A.next = (from, dow) => { let d = from; while (A.dow(d) !== dow) d++; return d; };
  A.at = (doy, h) => { g.day.setClock(g.day.year, doy, h); const e = g.energy; if (e) { e.value = 1; e.spentAt = null; e.awakeSince = e.now - 1; try { if (e.needs) { e.needs.food = 1; e.needs.water = 1; e.needs.warmth = 1; } } catch { /* energy's own */ } } L.step(6); g.story.update(); L.step(4); };
  A.store = () => g.outfitter.layout(25);
  A.porch = () => { const S = A.store(); const f = S.stepsFoot || S.door, b = S.axes.b; L.standAt(f.x + b.x * 3, f.z + b.z * 3, 0); L.step(30); };
  A.inside = () => { const S = A.store(); L.standAt(S.centre.x, S.centre.z); L.step(20); return !!(g.outfitter.visit && g.outfitter.visit.inside); };
  A.dock = () => { const S = A.store(); L.standAt(S.dockFoot.x, S.dockFoot.z, 0); L.step(30); };
  A.staged = () => A.GC().staged();
  // (the keeper's hello as you come in can take the talk a moment later: let it pass, close it, then talk)
  A.talk = (who) => { L.step(90); A.endTalk(); const ok = A.GC().talk(who); L.step(3); A.lastTalk = { who, ok, convo: !!(g.dialogue && g.dialogue.convo) }; return ok; };
  A.endTalk = () => { const D = g.dialogue; if (D && D.convo) D.close(false); L.step(4); };
  A.facts = (ks) => Object.fromEntries(ks.map((k) => [k, g.story.has(k) ? g.story.get(k) : false]));
  A.inv = (id) => g.inventory.count(id, { reachable: false });
  A.walt = () => g.story.walt();
};

const step = async (page, title, fn) => { log(`-- ${title}`); try { await fn(); } catch (e) { result(`${title}: threw`, false, { e: String(e && e.stack || e).slice(0, 600) }); } };
const say = async (page, prefix) => { const r = await choose(page, prefix); if (!r.ok) log('choose', prefix, r.why || ''); return r; };

try {
  if (!ONLY || ONLY === 'off') {
    const off = await open(APP);
    await newSeason(off, 25);
    const z = await off.evaluate(() => ({ loaded: performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\/src\/(guiding-cast|guiding-items|story-data\/(guiding|rules-guiding|leads-guiding|drafts-a3))\.js/.test(n)), guiding: window.__game.storyGuiding ?? null }));
    // (rules-guiding and leads-guiding ride in story-data's own imports, as rules-mining does: only the runtime modules)
    const rt = z.loaded.filter((n) => /guiding-cast|guiding-items|story-data\/guiding\.js|drafts-a3/.test(n));
    result('0 flag off: A3\'s runtime not fetched, no storyGuiding', rt.length === 0 && z.guiding === null, { rt, all: z.loaded });
    await off.close();
  }
  if (!ONLY || ONLY === 'A') {
    const a = await open(`${APP}/?story=1`);
    await newSeason(a, 25, 191);
    const d0 = await a.evaluate(() => { const g = window.__game; g.story.debug.fixture('turn'); g.story.markRead('NB39', 'rig'); return g.day.doy; });
    const ctx = {};

    await step(a, '1 Hap on a Saturday: the day', async () => {
      ctx.sat = await a.evaluate((d0) => { const A = window.__a3; const d = A.next(d0, 6); A.at(d, 11); A.porch(); return d; }, d0);
      const st = await a.evaluate(() => window.__a3.staged());
      result('1a Hap on the bench, Nate on the rail (Saturday 11:00)', st.some((x) => x.who === 'hap') && st.some((x) => x.who === 'nate'), { st });
      await a.evaluate(() => window.__a3.talk('hap'));
      const first = await hear(a); await say(a, 'Did you know Walt?'); await hear(a);
      await say(a, 'What was he like?'); const day = await hear(a, 20);
      const f = await a.evaluate(() => ({ ...window.__a3.facts(['hap.met', 'hap.day', 'door.guiding.open']), print: window.__a3.inv('page:happrint') }));
      result('1b the first sit and the 1986 day told; the print on loan', f['hap.met'] && f['hap.day'] && f.print > 0 && day.some((t) => /August of '86/.test(t)) && !day.some((t) => /^HAP:|"/.test(t)), { first: first.slice(0, 2), day: day.slice(0, 3), f });
      await a.evaluate(() => window.__a3.endTalk());
    });

    await step(a, '2 Rick at dawn; the tow landing', async () => {
      await a.evaluate((d) => { const A = window.__a3; A.at(d + 1, 6); A.inside(); }, ctx.sat);
      const st = await a.evaluate(() => window.__a3.staged());
      await a.evaluate(() => window.__a3.talk('rick'));
      await hear(a); await say(a, 'Where does the tow land'); const r = await hear(a);
      const f = await a.evaluate(() => window.__a3.facts(['rick.met', 'gy.tow.told']));
      result('2a Rick in the store at 06:00: the tow lands on the right (gy.tow.told)', st.some((x) => x.who === 'rick') && f['gy.tow.told'], { st, r: r.slice(0, 2), f });
      await a.evaluate(() => window.__a3.endTalk());
      const t = await a.evaluate(async () => { const L = window.__L, g = window.__game; const q = L.layer().place('gy.tow'); if (!q) return { none: true }; await L.near(q.x, q.z); L.step(30); return { at: [q.x, q.z], tow: g.story.has('gy.tow'), built: g.storyLayer.builtList().filter((b) => /^gy\./.test(b.prop)).map((b) => b.prop) }; });
      result('2b the tow landing stood at (P194\'s Sucker end: gy.tow; the landing prop built)', t.tow, t);
    });

    await step(a, '3 Hap the next weekend: the tow set right, the lake', async () => {
      await a.evaluate((d) => { const A = window.__a3, L = window.__L, g = window.__game; const l = g.outfitter.landings.find((x) => x.ep === 25); return L.tp(l.x, l.z).then(() => L.settle()).then(() => { A.at(d + 7, 11); A.porch(); }); }, ctx.sat);
      await a.evaluate(() => window.__a3.talk('hap'));
      const q = await hear(a);
      await say(a, 'It\'s on the right now'); await hear(a); await say(a, 'Say nothing'); const far = await hear(a, 10);
      await say(a, 'Why are you telling me?'); const end = await hear(a);
      const f = await a.evaluate(() => ({ ...window.__a3.facts(['hap.tow.right', 'hap.farend', 'door.guiding.yield', 'key.L2A']), walt: window.__a3.walt().filter((w) => /^31:/.test(w)) }));
      result('3 "It\'s on the right now." → the real talk: hap.farend, key.L2A, the yield, the far-end line', f['hap.farend'] && f['key.L2A'] && f['door.guiding.yield'] && f.walt.includes('31:GY-06.gives'), { q: q.slice(0, 1), far: far.slice(0, 2), end: end.slice(-1), f });
      await a.evaluate(() => window.__a3.endTalk());
    });

    await step(a, '4 Sheila: page two', async () => {
      ctx.thu = await a.evaluate((d) => { const A = window.__a3; const t = A.next(d + 8, 4); A.at(t, 14); A.dock(); return t; }, ctx.sat);
      const st = await a.evaluate(() => window.__a3.staged());
      await a.evaluate(() => window.__a3.talk('sheila'));
      await hear(a); await say(a, 'Walt\'s search.'); await hear(a); await say(a, 'I\'d read page two.'); await hear(a);
      await say(a, 'South-south-east'); await hear(a); await say(a, 'He wrote it down.'); await hear(a);
      const f = await a.evaluate(() => ({ ...window.__a3.facts(['sheila.report', 'sheila.wrote']), page: window.__a3.inv('page:sheilareport') }));
      result('4a Sheila at the landing (Thursday 14:00): page two from the box ("He wrote it down.")', st.some((x) => x.who === 'sheila') && f['sheila.report'] && f['sheila.wrote'] && f.page > 0, { st, f });
      const c = await a.evaluate(() => window.__t.convo());
      const r = await say(a, 'Could we see it?'); const w = await hear(a);
      const g2 = await a.evaluate(() => ({ ...window.__a3.facts(['drift.arranged']), south: window.__a3.GC().southNight() }));
      result('4b "Could we see it?": a south night named (drift.arranged) or "Not this week."', r.ok && (g2['drift.arranged'] !== false || w.some((t) => /Not this week/.test(t))), { choices: c && c.choices, w, g2 });
      await a.evaluate(() => window.__a3.endTalk());
    });

    await step(a, '5 the hinge', async () => {
      const f = await a.evaluate(() => { const g = window.__game; g.story.set('drift.done', true, 'rig:m'); window.__L.step(4); return { north: g.story.north, walt: window.__a3.walt().includes('walt.nb.und.6') }; });
      result('5 drift.done (stream m) → story.north, "Went north." on the Walt page', f.north && f.walt, f);
    });

    await step(a, '6 Marlys: the loft asked', async () => {
      ctx.tue = await a.evaluate((d) => { const A = window.__a3; const t = A.next(d + 1, 2); A.at(t, 10); A.inside(); return t; }, ctx.thu);
      const st = await a.evaluate(() => window.__a3.staged());
      const pre = await a.evaluate(() => ({ met: window.__game.story.has('marlys.met'), entry: null }));
      const trace = await a.evaluate(() => { const g = window.__game, L = window.__L, A = window.__a3; L.step(90); A.endTalk(); const ok = A.GC().talk('marlys'); const out = [{ ok, convo: !!g.dialogue.convo, say: g.dialogue.convo && g.dialogue.convo.node && g.dialogue.convo.node.say }]; for (let k = 0; k < 4 && g.dialogue.convo; k++) { L.step(1); out.push({ k, convo: !!g.dialogue.convo, paper: g.hud.paper || null, big: !!g.hud.big, onFoot: g.player.onFoot, tp: g.player.teleporting }); } return out; });
      log('marlys trace', JSON.stringify(trace));
      const lt = await a.evaluate(() => ({ ...window.__a3.lastTalk, now: window.__t.convo(), outOpen: !!window.__game.outfitter.open, visit: !!(window.__game.outfitter.visit && window.__game.outfitter.visit.inside) }));
      log('marlys talk', JSON.stringify({ pre, lt }));
      const hi = await hear(a); await say(a, '\'M.\' in his notebook.'); const m = await hear(a); await say(a, 'I\'ll go up.'); await hear(a);
      const f = await a.evaluate(() => window.__a3.facts(['marlys.met', 'marlys.loft']));
      result('6 Marlys at the counter (Tuesday 10:00): "I\'m Marlys.", "\'M.\'", the register in the loft', st.some((x) => x.who === 'marlys') && f['marlys.met'] && f['marlys.loft'], { st, hi: hi.slice(0, 2), m: m.slice(0, 2), f });
      await a.evaluate(() => window.__a3.endTalk());
    });

    if (UPTO < 7) throw new Error('upto');
    await step(a, '7 the loft', async () => {
      const r = await a.evaluate(async () => {
        const A = window.__a3, L = window.__L, g = window.__game, GC = A.GC();
        const B = GC.debug.built(); if (!B || !B.boat) return { built: B };
        const lad = GC.debug.spot('boat.ladder'); L.standAt(lad.x + 0.6, lad.z + 0.6, 0); L.step(10);
        const up = GC.debug.climb(); for (let k = 0; k < 60 && !(g.player.seat && g.player.seat.phase === 'sat'); k++) { L.step(5); await L.wait(20); }
        const seat = g.player.seat ? { id: g.player.seat.id, phase: g.player.seat.phase, y: +g.player.seat.y.toFixed(2) } : null;
        GC.debug.box(2009); GC.debug.box(2020); L.step(6);
        return { up, seat, facts: A.facts(['gy.register', 'knows.message']), pages: ['register2019', 'message', 'clipping2019'].map((id) => (g.story.has(`nb.page.${id}`) ? 1 : 0)), walt: A.walt().filter((w) => /GY-12/.test(w)) };
      });
      result('7 up the ladder into the loft; the 2020 box: the register, the message, the clipping; the two W.H.s', r.seat && r.seat.id === 'a3:loft' && r.facts['gy.register'] && r.pages.every((n) => n > 0) && r.walt.includes('31:GY-12.5'), r);
      await a.evaluate(() => { const g = window.__game; if (g.player.seat) g.player.stand(); window.__L.step(40); });
    });

    await step(a, '8 Marlys: the night asked', async () => {
      await a.evaluate((d) => { const A = window.__a3; A.at(d, 15); A.inside(); }, ctx.tue);
      await a.evaluate(() => window.__a3.talk('marlys'));
      const w = await hear(a); await say(a, 'I\'ll be there.'); await hear(a);
      const f = await a.evaluate(() => window.__a3.facts(['marlys.night']));
      result('8 "Stay the night in three." → "I\'ll be there." (marlys.night)', f['marlys.night'] !== false && w.some((t) => /Stay the night in three/.test(t)), { w: w.slice(0, 2), f });
      await a.evaluate(() => window.__a3.endTalk());
    });

    await step(a, '9 bunk 3\'s night', async () => {
      const t0 = await a.evaluate((d) => { const A = window.__a3, L = window.__L, GC = A.GC(); A.at(d, 17.9); const b = GC.debug.spot('bunk.bunk3'); L.standAt(b.x + 0.5, b.z + 0.5, 0); L.step(10); return GC.debug.takeBunk(); }, ctx.tue);
      const heard = []; const stops = [];
      // 17:50 first; then the dial: each confirm stops at her next hour, whatever hour is chosen (7:00 here)
      for (let k = 0; k < 9; k++) {
        await a.waitForTimeout(300);
        const c = await a.evaluate(() => window.__t.convo());
        if (c) {
          const said = await hear(a, 20); heard.push(...said);
          const cc = await a.evaluate(() => window.__t.convo());
          if (cc && cc.choices.some((t) => t.startsWith('Who was the friend'))) { await say(a, 'Who was the friend'); heard.push(...await hear(a)); }
          else if (cc && cc.choices.some((t) => t.startsWith('What did you do'))) { await say(a, 'What did you do'); heard.push(...await hear(a, 20)); await say(a, 'Tell Sheila'); heard.push(...await hear(a)); const c3 = await a.evaluate(() => window.__t.convo()); if (c3 && c3.choices.some((t) => t.startsWith('I swamped'))) { await say(a, 'I swamped'); heard.push(...await hear(a)); } }
          await a.evaluate(() => window.__a3.endTalk());
        }
        const n = await a.evaluate(async () => {
          const g = window.__game, GC = window.__a3.GC(), D = g.camp.dial, L = window.__L;
          const night = GC.debug.night(); if (!night) return { over: true };
          if (night.at === 'n2340' && !night.looked) GC.debug.walkUp();
          for (let k = 0; k < 20 && !(D && D.open); k++) { L.step(3); await L.wait(60); }
          if (!(g.camp.dial && g.camp.dial.open)) return { nodial: true, night };
          g.camp.dial.set(7); g.camp.dial.confirm();
          for (let k = 0; k < 80 && (g.veil && g.veil.active); k++) { L.step(5); await L.wait(40); }
          L.step(6);
          return { h: +g.day.hours.toFixed(2), night: GC.debug.night() };
        });
        stops.push(n.h ?? n);
        if (n.over || n.nodial) break;
      }
      const f = await a.evaluate(() => ({ ...window.__a3.facts(['door.guiding.climax', 'door.guiding.done', 'choice.sheila', 'sheila.in', 'marlys.north', 'gy.truck.looked']), hours: window.__game.day.hours }));
      const want = [18.08, 22, 23.67, 1, 2, 6];
      const hit = want.every((h) => stops.some((x) => typeof x === 'number' && Math.abs(x - h) < 0.1));
      result('9a the Rest dial stops only at Marlys\'s hours (18:05, 22:00, 23:40, 01:00, 02:00, 06:00)', t0 && hit, { stops });
      result('9b her night told, the pickup walked up to, the choice at six: Sheila; the close (went north)', f['door.guiding.climax'] && f['choice.sheila'] === 'in' && f['marlys.north'] && f['gy.truck.looked'] && heard.some((t) => /five past six/.test(t)), { f, heard: heard.filter((t) => t !== '…').slice(0, 12) });
    });

    await step(a, '10 the statement', async () => {
      const st = await a.evaluate((d) => { const A = window.__a3; const t = A.next(d + 1, 4); A.at(t, 14); A.dock(); return A.staged(); }, ctx.tue);
      await a.evaluate(() => window.__a3.talk('sheila'));
      const w = await hear(a); await say(a, 'Wade?'); const w2 = await hear(a);
      const f = await a.evaluate(() => ({ ...window.__a3.facts(['sheila.statement', 'knows.wade.office']), walt: window.__a3.walt().filter((x) => /GY-13/.test(x)) }));
      result('10 Marlys at the landing with Sheila; "Wade?": the statement, both Walt lines', st.some((x) => x.who === 'marlys' && x.slot === 'statement') && f['sheila.statement'] && f.walt.length >= 2, { st, w: w.slice(0, 1), w2: w2.slice(0, 1), f });
      await a.evaluate(() => window.__a3.endTalk());
    });
    await a.close();
  }
} finally {
  await browser.close();
}
result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
const fail = results.filter((r) => !r.pass);
log(`cmp-a3-test: ${results.length - fail.length}/${results.length} PASS`);
process.exit(fail.length ? 1 : 0);
