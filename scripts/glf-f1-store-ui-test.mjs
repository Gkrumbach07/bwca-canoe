// Fix stream f1-store-ui (the game-loop playthrough's store and HUD problems), headless against a running Vite:
//   npx vite --port 5191 --strictPort &   then   APP=http://localhost:5191 node scripts/glf-f1-store-ui-test.mjs [--eps 25,31] [--shots dir]
// 7  the new-season wizard's last page says the season starts at the store's door (no "put in")
// 8  the start map is backed: its box is opaque over the scene behind the title
// 1  walking straight up from the dock (either berth on its deck, its land end) reaches the store's door, at every
//    outfitter (--eps for fewer)
// 2  over a July Saturday morning at Moose Lake the store's people and the parties' crews never stand in the way from the
//    dock up to the door (the flight, the porch before the door, the doorway), the waiting spots are in the yard
// 6  nobody at a store's dock or a trailhead's lot stoops with no canoe drawn by them
// 3  the counter or the Rest dial up: one time bar on screen (the strip), not the strip and the Air's bar
// 4  no "The canoe is … away" line in the store, and no action line over a veil's card
// 5  the people you can meet at once have one name each, none a keeper's, the summer help's or the story's
// 9  one name per thing: the cook pot's tile says "Cook pot" as its grid's header does; setting out says "Blue barrel, 30 L"
// Exit code: the number of failed checks.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch, openGame, step, log, APP } from './gl-e-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const HOME = 25, DOY = 192; // Moose Lake; Saturday 11 July
const results = [];
const check = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };
const shot = async (page, name) => { if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch (e) { log('shot', name, e.message); } } };

const HELPERS = () => {
  const g = window.__game, H = window.__f1 = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.built = async (ep, ms = 90000) => { const t0 = performance.now(); for (;;) { if (g.props.storeLayout(ep)) return true; if (performance.now() - t0 > ms) return false; H.step(15); await H.wait(40); } };
  H.standAt = (x, z, h = 0, y = null) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.x = x; p.z = z; p.heading = h; p.foot = { y: y ?? p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null }; p.placeOnGround();
    const ch = p.chase; if (ch) { ch.viewYaw = h; ch.forwardYaw = h; ch.viewPitch = -0.1; if (ch.snap) ch.snap(); }
  };
  // hold W toward the door (`steer`: re-aimed every frame; else the bearing from the start) for up to `secs`
  H.walkTo = (to, secs = 20, steer = false) => {
    const p = g.player, inp = p.input, held = inp.held.bind(inp), h0 = Math.atan2(-(to.z - p.z), to.x - p.x);
    inp.held = (...c) => c.includes('KeyW') || held(...c);
    let best = Infinity, t = 0;
    try {
      for (; t < secs * 30; t++) {
        const h = steer ? Math.atan2(-(to.z - p.z), to.x - p.x) : h0, ch = p.chase;
        if (ch) { ch.viewYaw = h; ch.forwardYaw = h; }
        g.step(1 / 30, 1);
        best = Math.min(best, Math.hypot(p.x - to.x, p.z - to.z));
        if (best < 0.8) break;
      }
    } finally { inp.held = held; }
    g.step(1 / 30, 2);
    return { best: +best.toFixed(2), secs: +(t / 30).toFixed(1), reached: best < 0.8 };
  };
  H.shown = (el) => { if (!el) return false; const c = getComputedStyle(el); return c.display !== 'none' && c.visibility === 'visible' && Number(c.opacity) > 0.5; };
  return true;
};

const browser = await launch();
try {
  const page = await openGame(browser, { width: 1280, height: 800 });
  await page.waitForFunction(() => window.__game.title.state === 'title' && window.__game.outfitters && window.__game.npcs, null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  log('game loaded', APP);

  // --- 8, 7: the start map and the wizard's last page ---------------------------------------------------------------
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await page.waitForFunction(() => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0, null, { timeout: 120000, polling: 250 });
  await page.waitForTimeout(600);
  const map = await page.evaluate(() => { const m = document.querySelector('.smap'), c = getComputedStyle(m).backgroundColor, a = /rgba?\(([^)]+)\)/.exec(c); const parts = a ? a[1].split(',').map(Number) : []; return { bg: c, alpha: parts.length === 4 ? parts[3] : parts.length === 3 ? 1 : 0 }; });
  check('8 the start map is backed: its box opaque over the scene', map.alpha === 1, map);
  await shot(page, 'f1-startmap');
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate((doy) => { const w = window.__game.title.wizard; w.setDate(doy); w.next(); }, DOY);
  await page.waitForTimeout(300);
  const sum = await page.evaluate(() => { const p = document.querySelector('.wstep[data-step="sum"]'); return { q: p.querySelector('.wq').textContent, sum: p.querySelector('.wsum').textContent, aria: document.querySelector('.cal').getAttribute('aria-label') }; });
  check('7 the wizard\'s last page: the season starts at the store\'s door, no "put in"', !/put(ting)?\s+in/i.test(`${sum.q} ${sum.sum} ${sum.aria}`) && /store/.test(sum.sum), sum);
  await shot(page, 'f1-wizard-sum');
  await page.click('#btn-start');
  await page.waitForFunction(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, { timeout: 240000, polling: 250 });
  await page.evaluate(() => { const g = window.__game; if (g.onboarding && g.onboarding.pending()) g.onboarding.finish(g.onboarding.home, false); if (g.outfitter.open) g.outfitter.hide(); window.__f1.step(60); });
  const year = await page.evaluate(() => window.__game.day.year);

  // --- 1: the way up from the dock, at each outfitter ----------------------------------------------------------------
  const eps = String(arg('eps', '')).split(',').map(Number).filter(Boolean);
  const list = eps.length ? eps : await page.evaluate(() => window.__game.outfitters.OUTFITTER_EPS.slice());
  const walks = [];
  for (const ep of list) {
    const r = await page.evaluate(async (ep) => {
      const g = window.__game, H = window.__f1, e = g.world.entryPoints.find((x) => x.ep === ep);
      if (!g.props.storeLayout(ep)) { await g.outfitter.onTeleport(e.x, e.z); await H.settle(); }
      if (!(await H.built(ep))) return { ep, built: false };
      // (a dock off to the side of the store, beyond its porch's end, has no straight way up: from there the walker
      // steers for the door as a player would)
      const L = g.props.storeLayout(ep), side = Math.abs(L.site.ao || 0) > 3.1, out = { ep, porch: !!L.look.porch, stairs: L.stairs, ao: L.site.ao, steer: side, from: {} };
      const starts = { deck: L.dockDeck, deck2: L.dockBerths && L.dockBerths[1] && L.dockBerths[1].deck, land: L.dockLand };
      for (const [k, s] of Object.entries(starts)) {
        if (!s) continue;
        H.standAt(s.x, s.z, Math.atan2(-(L.door.z - s.z), L.door.x - s.x)); H.step(3);
        out.from[k] = H.walkTo(L.door, 25, side);
      }
      return out;
    }, ep);
    walks.push(r);
    log('walk', JSON.stringify(r));
  }
  const bad = walks.filter((w) => w.built === false || Object.values(w.from || {}).some((x) => !x.reached));
  check('1 straight up from the dock (both berths on the deck, its land end) to the door, every outfitter (steering, where the dock is off to the side)', walks.length && !bad.length, { n: walks.length, bad: bad.map((w) => ({ ep: w.ep, built: w.built, from: w.from })) });

  // --- back home: a July Saturday morning -------------------------------------------------------------------------
  await page.evaluate(async (home) => { const g = window.__game, H = window.__f1, e = g.world.entryPoints.find((x) => x.ep === home); await g.outfitter.onTeleport(e.x, e.z); await H.settle(); await H.built(home); H.step(30); }, HOME);
  await page.evaluate(({ year, doy }) => { const g = window.__game, L = g.props.storeLayout(25); g.day.setClock(year, doy, 6.5); window.__f1.standAt(L.dockLand.x, L.dockLand.z, 0); window.__f1.step(60); }, { year, doy: DOY });

  // --- 2, 6, 5: the store's people over the morning ------------------------------------------------------------------
  const samples = [];
  for (let h = 6.5; h <= 11.5; h += 1 / 3) {
    const s = await page.evaluate(({ year, doy, h, home }) => {
      const g = window.__game, N = g.npcs, L = g.props.storeLayout(home);
      g.day.setClock(year, doy, h); window.__f1.step(45);
      const list = N.rosters.get(home) || [], inLane = [], stoop = [], all = [];
      for (const v of list) {
        if (v.keeper || v.extra) continue;
        v.figs.forEach((f, i) => {
          all.push(`${v.key}#${i}`);
          if (!f.path && N.inLane(L, f.x, f.z)) inLane.push({ who: `${v.key}#${i}`, act: f.act || null, where: f.where || null });
          if (f.spec && f.spec.pose === 'stoop') stoop.push({ who: `${v.key}#${i}`, act: f.act });
        });
      }
      // (the people about: the store's, and the parties' camps drawn near; a party in the store is one of its people)
      const names = [], keepers = [], seen = new Set();
      for (const v of list) { if (v.keeper) { keepers.push(v.first); continue; } if (v.partyId != null) seen.add(String(v.partyId)); for (const n of v.figNames || [v.first]) names.push(n); }
      for (const D of (g.partyCamps && g.partyCamps.drawn ? [...g.partyCamps.drawn.values()] : [])) { if (seen.has(String(D.party.id))) continue; seen.add(String(D.party.id)); const pv = N.partyPerson(D.party); for (const n of pv.figNames) names.push(n); }
      names.push(...keepers);
      return { h: +h.toFixed(2), people: all.length, inLane, stoop, names };
    }, { year, doy: DOY, h, home: HOME });
    samples.push(s);
  }
  const most = samples.reduce((m, s) => Math.max(m, s.people), 0);
  const laneBad = samples.filter((s) => s.inLane.length);
  check('2 nobody of the store stands in the way up from the dock to the door (a July Saturday morning)', most >= 4 && !laneBad.length, { most, bad: laneBad.slice(0, 4) });
  const yard = await page.evaluate((home) => { const g = window.__game, N = g.npcs, L = g.props.storeLayout(home), S = N.smart.at(`store:${home}`); const waits = S.filter((o) => o.act === 'wait' || o.act === 'rail').flatMap((o) => o.slots); return { n: waits.length, inLane: waits.filter((q) => N.inLane(L, q.x, q.z)).length }; }, HOME);
  check('2 the waiting and rail spots are out of the way', yard.n >= 4 && yard.inLane === 0, yard);
  const stoopBad = samples.filter((s) => s.stoop.length);
  check('6 nobody at the store or its dock stoops with no canoe drawn', !stoopBad.length, { bad: stoopBad.slice(0, 3) });
  const dupes = samples.map((s) => ({ h: s.h, d: s.names.filter((n, i) => s.names.indexOf(n) !== i) })).filter((x) => x.d.length);
  const reserved = await page.evaluate(() => [...window.__game.npcs.names.reserved]);
  const keeperNames = await page.evaluate(() => (window.__game.npcs.rosters.get(25) || []).filter((v) => v.keeper).map((v) => v.first));
  const taken = samples.flatMap((s) => s.names.filter((n) => reserved.includes(n) && !keeperNames.includes(n)));
  check('5 one name per person about (the store, its dock, the camps near), none a keeper\'s, the help\'s or the story\'s', !dupes.length && !taken.length, { dupes: dupes.slice(0, 3), taken: [...new Set(taken)], n: samples.reduce((m, s) => Math.max(m, s.names.length), 0) });
  const book = await page.evaluate(() => { const B = window.__game.npcs.names, now = B.now; B.now = () => now() + 10; const a = B.claim('f1:a#0', 'Rosa', [['Rosa', 'Nell']]), b = B.claim('f1:b#0', 'Rosa', [['Rosa', 'Nell']]), c = B.claim('f1:c#0', 'Walt', [['Walt', 'Rolf']]), d = B.claim('f1:d#0', 'Rosa', [['Rosa', 'Nell']]); B.now = now; return { a, b, c, d }; });
  check('5 a name drawn twice goes to the first; the next takes the next free (then an initial), a story name never', book.a === 'Rosa' && book.b === 'Nell' && book.c === 'Rolf' && /^Rosa [A-Z]\.$/.test(book.d), book);

  // 6 at a trailhead's lot: a party loading before its put-in, no canoe drawn there
  const lot = await page.evaluate(async ({ year, doy }) => {
    const g = window.__game, H = window.__f1, N = g.npcs, TH = g.trailhead && g.trailhead.trailheadLayout;
    for (const ep of [30, 27, 33, 37]) {
      const e = g.world.entryPoints.find((x) => x.ep === ep); if (!e) continue;
      const ent = g.parties.entering(ep, g.permits ? g.permits.today : N.today).filter((p) => p.stays && p.stays.length).map((p) => p.putIn).sort((a, b) => a - b);
      if (!ent.length) continue;
      await g.outfitter.onTeleport(e.x, e.z); await H.settle();
      let T = null; for (let k = 0; k < 60 && !T; k++) { T = TH ? TH(ep) : null; if (!T) { H.step(15); await H.wait(40); } }
      if (!T) continue;
      g.day.setClock(year, doy, ent[0] - 0.35); H.standAt(T.lot.x + 4, T.lot.z + 4, 0); H.step(90);
      const l = N.lots.get(ep) || [], figs = l.flatMap((v) => v.figs);
      return { ep, people: figs.length, stoop: figs.filter((f) => f.spec && f.spec.pose === 'stoop').length, poses: [...new Set(figs.map((f) => f.spec && f.spec.pose))] };
    }
    return { ep: null };
  }, { year, doy: DOY });
  check('6 nobody at a trailhead\'s lot stoops over a canoe that is not there', lot.ep == null || lot.stoop === 0, lot);

  // --- back in the store: 3 and 4 -------------------------------------------------------------------------------------
  await page.evaluate(async ({ year, doy, home }) => { const g = window.__game, H = window.__f1, e = g.world.entryPoints.find((x) => x.ep === home); await g.outfitter.onTeleport(e.x, e.z); await H.settle(); await H.built(home); g.day.setClock(year, doy, 13); const L = g.props.storeLayout(home), at = L.counter || L.centre; H.standAt(at.x, at.z, L.counter.heading || 0, L.floorY); H.step(40); for (let k = 0; k < 5; k++) { if (g.outfitter.open) g.outfitter.hide(); if (g.record && g.record.close) g.record.close(); if (g.journal && g.journal.open && g.journal.close) g.journal.close(); H.step(10); } }, { year, doy: DOY, home: HOME });
  const bars = async () => { await page.waitForTimeout(700); return page.evaluate(() => { const H = window.__f1; const g = window.__game; return { air: H.shown(document.getElementById('energy')), strip: H.shown(document.getElementById('strip')), paper: g.hud.paper || null, also: !!(g.hud.stripAlso && g.hud.stripAlso()) }; }); };
  await page.evaluate(async () => { const g = window.__game; for (let k = 0; k < 6; k++) { if (g.record && g.record.close) g.record.close(); if (g.outfitter.open) g.outfitter.hide(); if (g.hud.paper && g.hud.closePaper) g.hud.closePaper(g.hud.paper); window.__f1.step(5); await window.__f1.wait(150); } });
  const play = await bars();
  await page.evaluate(() => { const g = window.__game, o = g.outfitter; o.openHot('counter', o.visit.landing); window.__f1.step(10); });
  const counter = await bars();
  await shot(page, 'f1-counter');
  await page.evaluate(() => { const g = window.__game; g.outfitter.hide(); window.__f1.step(10); g.camp.dial = { open: true }; window.__f1.step(10); });
  const dial = await bars();
  await page.evaluate(() => { const g = window.__game; g.camp.dial = null; window.__f1.step(10); });
  check('3 one time bar: the Air\'s in play; the strip alone with the counter or the Rest dial up', play.air && !play.strip && counter.strip && !counter.air && dial.strip && !dial.air, { play, counter, dial });

  const inside = await page.evaluate(() => {
    const g = window.__game, H = window.__f1, L = g.props.storeLayout(25), p = g.player;
    H.standAt(L.counter.x, L.counter.z, 0, L.floorY); H.step(40);
    const d = p.carry && p.carry.drop, far = d ? Math.hypot(d.x - p.x, d.z - p.z) : null;
    const el = document.getElementById('prompt');
    return { far: far && +far.toFixed(1), inside: !!(g.outfitter.visit && g.outfitter.visit.inside), inStore: L.inside(p.x, p.z), visit: g.outfitter.visit ? g.outfitter.visit.ep : null, prompt: p.prompt ? p.prompt.text : null, shown: el && el.classList.contains('show') ? el.textContent : '' };
  });
  check('4 in the store no "The canoe is … away"', inside.inside && !/canoe is .*away/i.test(`${inside.prompt} ${inside.shown}`), inside);
  const veil = await page.evaluate(async () => {
    const g = window.__game, H = window.__f1, p = g.player, el = document.getElementById('prompt');
    g.veil.card({ kicker: 'test', text: 'a card', fadeIn: 0.3, hold: 2, fadeOut: 0.3 });
    H.step(20);
    const was = p.prompt;
    p.prompt = { key: null, text: 'a line under the card' }; g.hud.updatePrompt({ player: p, fishing: null });
    const over = el.classList.contains('show'), cur = !!g.veil.cur;
    p.prompt = was;
    for (let k = 0; k < 40 && g.veil.cur; k++) { H.step(10); await H.wait(10); }
    p.prompt = { key: null, text: 'a line in play' }; g.hud.updatePrompt({ player: p, fishing: null });
    const after = el.classList.contains('show');
    p.prompt = was;
    return { cur, over, after, gone: !g.veil.cur };
  });
  check('4 no action line over a veil\'s card (and back after it)', veil.cur && !veil.over && veil.after, veil);

  // --- 9: one name per thing ---------------------------------------------------------------------------------------
  const names = await page.evaluate(async () => {
    const g = window.__game, I = await import('/src/inv-ui.js'), A = await import('/src/items.js');
    const pot = A.itemDef('pot'), b30 = A.itemDef('barrel30');
    return { potTile: I.gridName(pot, pot.w), potName: pot.name, barrelTile: I.gridName(b30, b30.w), barrelName: b30.name };
  });
  const setOut = await page.evaluate(() => {
    const g = window.__game, H = window.__f1, L = g.props.storeLayout(25), p = g.player, inv = g.inventory || (g.packs && g.packs.inv);
    // the starting barrel in the canoe at the dock, and you on the deck beside it
    // (the canoe, wherever the walks above left it, tied at the dock's side by you on its deck)
    const q = L.dockDeck; H.standAt(q.x, q.z, L.dockHeading || 0, q.y); H.step(2);
    const d = p.carry.drop; d.x = L.dockSide.x; d.z = L.dockSide.z; d.heading = L.dockHeading || 0; H.step(3);
    const r = g.packs.setOutAll();
    return { words: r.words, n: r.n, mode: p.mode, drop: !!(p.carry && p.carry.drop), inCanoe: inv ? inv.containers.filter((c) => c.where === 'canoe').map((c) => c.item) : null };
  });
  check('9 one name per thing: the pot\'s tile is "Cook pot", the barrel\'s "Blue barrel, 30 L"; setting out names it so', names.potTile === names.potName && names.barrelTile === names.barrelName && !/small barrel/.test(setOut.words || '') && setOut.n > 0 && /[Bb]lue barrel, 30 L/.test(setOut.words || ''), { names, setOut });
} catch (e) {
  log('ERROR', e && e.stack || e);
  results.push({ name: 'run', pass: false });
} finally {
  await browser.close();
}
const fails = results.filter((r) => !r.pass).length;
log(`${results.length - fails}/${results.length} passed`);
process.exit(fails);
