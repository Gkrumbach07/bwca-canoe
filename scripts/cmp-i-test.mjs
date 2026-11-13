// Campaign stream i (Round 5: the informant; docs/story/32-the-boys.md §5.10–§5.17): the arc in the real game, headless
// Chromium against a running Vite (?story=1), each check PASS or FAIL. A season at Sawbill 38 in July from the chapter-1
// fixture ('turn'):
//   0 flag off: informant-cast.js not fetched, no storyInformant
//   A1 Denny's cabin down the Trail, Denny on the porch at 18:00
//   A2 the canary set: "Where are you headed next?", a lake picked on the map, Denny's two rings on it
//   A3 the trap sprung: two days on the posting is up (watchers.postings' i-canary row), the green Kevlar at the ringed
//      site, seen: the hard piece and the page's line, the watchers paddle off
//   A4 the word of it: a second lake told; the next day at the home counter Josie says what a party said (heard)
//   A5 the tells: tell 2 asked ("When did you last talk to Walt?"), tell 3 at the opener; the reveal opens
//   A6 the Isabella camp: flagging, the can, the sapling, the receipt taken (the item, the page's line, the soft piece)
//   A7 Frank: a lake told only to him comes back empty after five days: "I told Frank {lake}. Nobody came." (cleared)
//   R1–R3 the reveal at the cabin, one choice a page (a reload between): the pad laid down, the follow-up, the silence,
//      the confession, Wade's name and the wrong hill (L2E), then Turn him / Tell the boys / Leave it and its after
//   N the note: no case at all, tier 4 three weeks gone: the note at the counter, the reveal from its silence
//   (and no page errors)
//
//   APP=http://localhost:5360 node scripts/cmp-i-test.mjs [--only off|A|R|N] [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS_T, choose, hear } from './slice/c1-talk.mjs';
import { HELPERS } from './slice/c1-layer.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5360').replace(/\/$/, '');
const ONLY = arg('only', null), SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; for (const base of [path.join(homedir(), 'Library/Caches/ms-playwright'), path.join(homedir(), '.cache/ms-playwright')]) { const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
const browser = await chromium.launch({ executablePath: findChrome(), args: process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist', '--enable-gpu'] });
const errors = [];
const open = async (url) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') log('console', t.slice(0, 300)); else if (/story i|informant|story rule|story scene|story\.set/.test(t)) log('console', t.slice(0, 300)); });
  await page.goto(url, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && (!/story=1/.test(location.search) || (window.__game.storySeams && window.__game.storyTalk && window.__game.storyInformant)) && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS_T); await page.evaluate(HELPERS); await page.evaluate(HELPERS_I);
  return page;
};
const newSeason = async (page, home = 38, doy = 191) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate((d) => { const w = window.__game.title.wizard; w.setDate(d); w.next(); }, doy);
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, T = window.__t; T.step(30); const o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 10); T.step(10); g.story.debug.fixture('turn'); });
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => null); };

// the page's helpers (window.__i)
const HELPERS_I = () => {
  const g = window.__game, I = window.__i = {}, L = window.__L;
  I.IC = () => g.storyInformant.informantCast;
  I.s = () => g.story;
  I.tick = () => { I.IC().debug.tick(); L.step(3); I.IC().debug.tick(); };
  I.at = (doy, h) => { g.day.setClock(g.day.year, doy, h); const e = g.energy; if (e) { e.value = 1; try { if (e.needs) { e.needs.food = 1; e.needs.water = 1; e.needs.warmth = 1; } } catch { /* */ } } L.step(6); g.story.update(); L.step(4); I.tick(); };
  I.paper = () => { for (let k = 0; k < 4 && g.hud.paper; k++) { try { if (g.record && typeof g.record.close === 'function') g.record.close(); } catch { /* */ } L.step(10); } };
  I.endTalk = () => { const D = g.dialogue; if (D && D.convo) D.close(false); L.step(4); };
  I.talk = (who) => { I.paper(); I.endTalk(); const ok = I.IC().talk(who); L.step(3); return { ok, convo: !!(g.dialogue && g.dialogue.convo) }; };
  I.cabin = async () => { const c = I.IC().cabinAt(); if (!c) return null; await L.near(c.x + 6, c.z + 6); I.tick(); return c; };
  I.lake = (name) => { const L0 = g.world.lakes.find((l) => l && l.name === name); return L0 ? { lake: L0.id, name: L0.name } : null; };
  // the map's lake-pick (map-book.js pickLake: the map open, a click on a lake answers): answered as a click would
  I.pick = async (v) => { const M = g.journal && g.journal.map; for (let k = 0; k < 40 && !(M && M.pick); k++) await L.wait(50); if (!M || !M.pick) { if (g.story.ui.stub) g.story.ui.debug.answer(v); return 'stub'; } const done = M.pick; M.pick = null; done(v); await L.wait(80); try { g.journal.close(); } catch { /* */ } L.step(4); return 'map'; };
  I.facts = (ks) => Object.fromEntries(ks.map((k) => [k, g.story.has(k) ? g.story.get(k) : false]));
  I.inv = (id) => g.inventory.count(id, { reachable: false });
  I.walt = () => g.story.walt();
  I.rings = () => { const P = g.storySeams && g.storySeams.pencil; return P ? P.marks().filter((m) => m.kind === 'ring' && /Denny/.test(m.who || m.by || '')) : []; };
};
const step = async (title, fn) => { log(`-- ${title}`); try { await fn(); } catch (e) { result(`${title}: threw`, false, { e: String(e && e.stack || e).slice(0, 600) }); } };
const say = async (page, prefix) => { const r = await choose(page, prefix); if (!r.ok) log('choose', prefix, r.why || ''); return r; };
// to Denny at 18:00 on the porch: the talk open
const toDenny = async (page, doy) => {
  await page.evaluate(async (d) => { const I = window.__i; I.at(d, 18); await I.cabin(); I.at(d, 18); }, doy);
  return page.evaluate(() => { const I = window.__i; return { staged: I.IC().debug.staged(), talk: I.talk('denny') }; });
};
// the reveal set up as the case would leave it: the pad (a3's), the nicknames (b5's), tell 2, Denny met twice
const caseUp = (page) => page.evaluate(() => { const s = window.__game.story; s.set('case.denny.message', 'hard', 'rig:a3'); s.set('case.denny.nicknames', 'soft', 'rig:b5'); s.set('denny.tell2', true, 'rig'); s.set('denny.card', true, 'rig:b5'); s.meet('denny', 'rig'); s.meet('denny', 'rig'); return { open: s.has('denny.reveal.open') }; });
// the reveal from the opener to the choice; returns what was said
const reveal = async (page, choice, after = []) => {
  const said = [...await hear(page)];
  await say(page, 'You called the bunkhouse that night'); said.push(...await hear(page));
  await say(page, 'It was a Thursday'); said.push(...await hear(page));
  await say(page, 'Go on'); said.push(...await hear(page, 30));
  await say(page, choice); said.push(...await hear(page, 12));
  for (const a of after) { await say(page, a); said.push(...await hear(page, 12)); }
  return said;
};

try {
  if (!ONLY || ONLY === 'off') {
    const off = await open(APP);
    await newSeason(off, 38).catch(() => null);
    const z = await off.evaluate(() => ({ loaded: performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /informant|story-props-i/.test(n)), i: window.__game.storyInformant ?? null }));
    const rt = z.loaded.filter((n) => /informant-cast|story-data\/informant\.js/.test(n));
    result('0 flag off: informant-cast.js not fetched, no storyInformant', rt.length === 0 && z.i === null, { rt });
    await off.close();
  }
  if (!ONLY || ONLY === 'A') {
    const a = await open(`${APP}/?story=1`);
    await newSeason(a, 38, 191);
    const ctx = { d0: await a.evaluate(() => window.__game.day.doy) };
    await step('A1 the cabin and Denny', async () => {
      const r = await toDenny(a, ctx.d0);
      await shot(a, 'A1-cabin');
      result('A1 Denny\'s cabin down the Trail, Denny on the porch at 18:00, the talk opens', r.staged.cabin && r.staged.denny && r.talk.convo, r);
      ctx.hello = await hear(a);
    });
    await step('A2 the canary set', async () => {
      const lk = await a.evaluate(() => window.__i.lake('Alton Lake') || window.__i.lake('Sawbill Lake'));
      ctx.lakeA = lk;
      const r = await say(a, 'Where are you headed next?');
      ctx.how = await a.evaluate((v) => window.__i.pick(v), lk);
      const told = await hear(a);
      const f = await a.evaluate((id) => ({ told: window.__game.story.get(`canary.denny.${id}`), ring: window.__game.story.get(`canary.ring.${id}`), rings: window.__i.rings().length, ppl: window.__game.story.doc.ppl.denny }), lk.lake);
      result('A2 "Where are you headed next?", a lake picked: Denny\'s line, the told day, his two rings on it', r.ok && told.some((t) => /Good one/.test(t)) && f.told != null && Array.isArray(f.ring) && f.rings >= 2, { lk, told, f });
      await a.evaluate(() => window.__i.endTalk());
    });
    await step('A3 the trap sprung: seen', async () => {
      const pre = await a.evaluate((d) => { const I = window.__i; I.at(d + 2, 10); return { post: I.IC().debug.posting(), wp: I.IC().debug.wp() }; }, ctx.d0);
      const ring = await a.evaluate((id) => window.__game.story.get(`canary.ring.${id}`), ctx.lakeA.lake);
      await a.evaluate(async (R) => { const L = window.__L; await L.near(R[0] + 220, R[1] + 220); window.__i.tick(); L.step(10); window.__i.tick(); }, ring);
      const w0 = await a.evaluate(() => window.__i.IC().debug.watch());
      await a.evaluate(async (R) => { const L = window.__L; await L.near(R[0] + 60, R[1] + 60); for (let k = 0; k < 4; k++) { window.__i.tick(); L.step(10); } }, ring);
      await shot(a, 'A3-seen');
      const f = await a.evaluate((id) => ({ ...window.__i.facts(['case.denny.canary', 'canary.how', 'canary.hard', `canary.seen.${id}`, `ev.watchers@${id}`]), seenLine: window.__i.walt().includes('32:5.11.seen'), watch: window.__i.IC().debug.watch() }), ctx.lakeA.lake);
      result('A3a the posting is up two days on (the i-canary row in watchers.postings)', pre.post.length >= 1 && Array.isArray(pre.wp) && pre.wp.some((q) => /^i-canary/.test(q.id)), pre);
      result('A3b the green Kevlar at the ringed site; in sight: seen, the hard piece, the page\'s line, they paddle off', f['case.denny.canary'] === 'hard' && f['canary.how'] === 'seen' && f.seenLine && f[`ev.watchers@${ctx.lakeA.lake}`] !== false && (w0.length > 0 || f.watch.some((q) => q.leaving)), { w0, f });
    });
    await step('A4 the word at the counter: heard', async () => {
      const lk = await a.evaluate(() => window.__i.lake('Kelso Lake') || window.__i.lake('Smoke Lake'));
      await toDenny(a, ctx.d0 + 3); await hear(a);
      await say(a, 'Where are you headed next?'); await a.evaluate((v) => window.__i.pick(v), lk); await hear(a); await a.evaluate(() => window.__i.endTalk());
      const r = await a.evaluate(async ([d, id]) => { const g = window.__game, I = window.__i, T = window.__t, L = window.__L; I.at(d + 4, 10); const S = g.outfitter.layout(38); await L.near(S.centre.x + 20, S.centre.z + 20); T.walkOut(38); T.walkIn(38); L.step(10); return { counter: I.IC().lastCounter, heard: g.story.get(`canary.heard.${id}`) }; }, [ctx.d0, lk.lake]);
      result('A4 a second lake told; the next day Josie: "Party came off {lake}…" (heard)', r.heard != null && r.counter && /Party came off/.test(r.counter.text) && r.counter.text.includes(lk.name), { lk, r });
    });
    await step('A5 tells 2 and 3; the reveal opens', async () => {
      await toDenny(a, ctx.d0 + 5); await hear(a);
      const r2 = await say(a, 'When did you last talk to Walt?'); const t2 = await hear(a); await a.evaluate(() => window.__i.endTalk());
      await toDenny(a, ctx.d0 + 6); const t3 = await hear(a); await a.evaluate(() => window.__i.endTalk());
      const f = await a.evaluate(() => ({ ...window.__i.facts(['denny.tell2', 'denny.tell3', 'case.denny.inallweek', 'case.denny.talked', 'denny.reveal.open']), met: window.__game.story.doc.ppl.denny.met, w: ['32:5.12.w2', '32:5.12.w3'].filter((x) => window.__i.walt().includes(x)) }));
      result('A5a tell 2 asked: "He said he was in all week" (the soft piece, the page\'s line)', r2.ok && t2.some((t) => /in all week/.test(t)) && f['case.denny.inallweek'] === 'soft', { t2, f });
      result('A5b tell 3 at the opener: "Somebody talked"; three pieces, one hard, met twice: the reveal opens', t3.some((t) => /somebody talked/i.test(t)) && f['denny.tell3'] && f['denny.reveal.open'], { t3, f });
    });
    await step('A6 the Isabella camp', async () => {
      const r = await a.evaluate(async () => { const g = window.__game, L = window.__L, s = g.story; s.set('denny.rings', true, 'rig:b5'); const pl = g.storyLayer.place('i.isabella'); if (!pl) return { no: true }; await L.near(pl.x, pl.z); g.storyLayer.poll(); L.step(5);
        const out = {}; for (const id of ['i.flag1', 'i.can', 'i.aerial', 'i.receipt']) out[id] = g.storyLayer.look(id); L.step(5);
        return { out, f: window.__i.facts(['isabella.flagging', 'isabella.can', 'isabella.aerial', 'isabella.receipt', 'case.denny.isabella']), receipt: window.__i.inv('receipt19'), w: window.__i.walt().includes('32:5.10.w'), built: g.storyLayer.builtList().filter((b) => /^i\./.test(b.prop)).length }; });
      await shot(a, 'A6-isabella');
      result('A6 the Isabella camp: flagging, the can, the aerial, the receipt taken (item, the page\'s line, the soft piece)', r.f && r.f['isabella.receipt'] && r.f['isabella.flagging'] && r.f['isabella.aerial'] && r.receipt > 0 && r.w && r.f['case.denny.isabella'] === 'soft', r);
    });
    await step('A7 Frank: a lake told only to him comes back empty', async () => {
      const lk = await a.evaluate(() => window.__i.lake('Cherokee Lake') || window.__i.lake('Brule Lake'));
      await a.evaluate((d) => window.__i.at(d + 7, 7), ctx.d0);
      await a.evaluate(() => window.__i.talk('frank')); await hear(a);
      const r = await say(a, 'Where are you headed next?'); await a.evaluate((v) => window.__i.pick(v), lk); const fl = await hear(a); await a.evaluate(() => window.__i.endTalk());
      const f = await a.evaluate((d) => { window.__i.at(d + 13, 10); return { ...window.__i.facts(['canary.clear.frank', 'frank.cleared']), w: window.__i.walt().includes('32:5.11.clear') }; }, ctx.d0);
      result('A7 Frank told a lake ("Suit yourself." / "Good walleye."); five days on: "I told Frank {lake}. Nobody came." (Frank cleared)', r.ok && fl.some((t) => /Suit yourself|Good walleye/.test(t)) && f['canary.clear.frank'] === lk.name && f['frank.cleared'] && f.w, { lk, fl, f });
    });
    await a.close();
  }
  if (!ONLY || ONLY === 'R') {
    const CH = [
      ['R1 Turn him', 'When they ask, you tell them what I tell you.', ['The river.', 'He knew.', 'He won\'t.'], 'turn', 'denny.turned'],
      ['R2 Tell the boys', 'Bob and Frank are going to know.', ['Go on.'], 'told', 'denny.toldon'],
      ['R3 Leave it', 'I\'m not going to say anything.', [], 'left', 'denny.left'],
    ];
    for (const [title, choice, after, val, fact] of CH) {
      // (a reload between: a fresh page and a fresh season each choice)
      const p = await open(`${APP}/?story=1`);
      await newSeason(p, 38, 200);
      await step(title, async () => {
        const c = await caseUp(p);
        const d = await p.evaluate(() => window.__game.day.doy);
        const t = await toDenny(p, d);
        const said = await reveal(p, choice, after);
        await p.evaluate(() => window.__i.endTalk());
        const f = await p.evaluate(() => ({ ...window.__i.facts(['denny.revealed', 'key.L2E', 'choice.denny', 'denny.turned', 'denny.toldon', 'denny.left', 'denny.wade', 'denny.told.scene']), w: ['32:5.15.call', '32:5.15.hill', '32:5.15.resolved'].filter((x) => window.__i.walt().includes(x)) }));
        result(`${title}: the reveal (the pad, "It was a Thursday.", the silence, the confession, Wade's name, the wrong hill: L2E)`, c.open && t.talk.convo && said.some((x) => /Come up\. I've got coffee/.test(x)) && said.some((x) => /Matt was thirty/.test(x)) && said.some((x) => /Wade Helstrom/.test(x)) && f['denny.revealed'] && f['key.L2E'] && f.w.length === 3, { said: said.slice(0, 6), f });
        result(`${title}: choice.denny=${val} and ${fact}`, f['choice.denny'] === val && f[fact] !== false, { f, tail: said.slice(-4) });
        if (val === 'turn') {
          const r = await p.evaluate(async (d0) => { const g = window.__game, I = window.__i, T = window.__t, L = window.__L; I.at(d0 + 3, 10); const S = g.outfitter.layout(38); await L.near(S.centre.x + 20, S.centre.z + 20); T.walkOut(38); T.walkIn(38); L.step(10); return I.IC().lastCounter; }, d);
          result('R1b turned: Josie, a few days later: "…the fishing\'s lousy on the river."', r && /lousy on the river/.test(r.text), { r });
        }
        if (val === 'told') result('R2b told: the boys told (Denny tells them; Frank and Bob\'s lines)', f['denny.told.scene'] && said.some((x) => /It was you/.test(x)) && said.some((x) => /Nobody's on the water alone/.test(x)), { tail: said.slice(-7) });
        if (val === 'left') {
          await toDenny(p, d + 1); const hi = await hear(p); await p.evaluate(() => window.__i.endTalk());
          result('R3b left: at every meeting after, "Hi."', hi.includes('Hi.'), { hi });
        }
      });
      await p.close();
    }
  }
  if (!ONLY || ONLY === 'N') {
    const n = await open(`${APP}/?story=1`);
    await newSeason(n, 38, 230);
    await step('N the note', async () => {
      const r = await n.evaluate(async () => { const g = window.__game, I = window.__i, T = window.__t, L = window.__L, s = g.story;
        s.set('tier.4', true, 'rig'); s.debug.do('wait', { days: 22 }); L.step(10); s.update(); L.step(5);
        const due = s.has('denny.note.due');
        const S = g.outfitter.layout(38); await L.near(S.centre.x + 20, S.centre.z + 20); T.walkOut(38); T.walkIn(38); L.step(10);
        return { due, note: s.has('denny.note'), page: I.inv('page:dennynote2') + I.inv('page:dennynote'), counter: I.IC().lastCounter, open: s.has('denny.reveal.open'), doy: g.day.doy }; });
      result('N1 no case, tier 4 three weeks gone: the note due; at the counter Josie hands it over ("I\'m sorry. Watch who you tell.")', r.due && r.note && r.page > 0 && r.open && r.counter && /I'm sorry/.test(r.counter.text), r);
      const t = await toDenny(n, r.doy);
      const said = [...await hear(n)];
      await say(n, 'Go on'); said.push(...await hear(n, 30));
      await say(n, 'I\'m not going to say anything.'); said.push(...await hear(n, 8));
      const f = await n.evaluate(() => window.__i.facts(['denny.revealed', 'choice.denny', 'key.L2E', 'case.denny.note']));
      result('N2 the cabin: "You got my note.", the confession from its silence, the choice', t.talk.convo && said.some((x) => /You got my note/.test(x)) && said.some((x) => /Matt was thirty/.test(x)) && f['denny.revealed'] && f['choice.denny'] === 'left' && f['key.L2E'], { said: said.slice(0, 4), f });
    });
    await n.close();
  }
} catch (e) { result('the rig threw', false, { e: String(e && e.stack || e).slice(0, 900) }); } finally {
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
  await browser.close();
  const fails = results.filter((r) => !r.pass);
  console.log(`cmp-i-test: ${results.length - fails.length}/${results.length} PASS`);
  for (const f of fails) console.log('FAIL', f.name);
  process.exit(fails.length ? 1 : 0);
}
