// Round 3 final join (claude/r3-final = r3-replay + r2-npc-motion-2): the seams between the empty-handed start, the
// guide's golden gem and the NPC motion pass, headless Chromium against a running Vite, each check PASS or FAIL:
//   1 the empty dock: before the staff talk no canoe is drawn at your berth, and on the store's busiest morning hour
//     nobody of the store's loads, unloads or fishes on your berth's deck, no party canoe lies in it and none of a
//     party's people stand on it (they keep to their own stretch of the beach)
//   2 the staffer stands where the gem points: drawn, on their spot (not walked off it by the store's people), the
//     gem over them within 0.6 m in x/z, its point never into their head or hat through the idle poses (a long watch)
//   3 the talk opens from the staffer (E on them: npcs.extraTalk) and the gem is hidden while it lasts
//   4 the door at the busiest hour: you walk in from the foot of the steps to the staffer (W, steered) and get there;
//     nobody walking passes through you (>= 0.3 m)
//   5 after the talk the loaned canoe is at your berth and still nobody of the store's stands on its deck
//   6 the starter night: at the starter site in the evening no party camps on it or stands on it, the neighbours'
//     people are drawn on the ground (standing feet within 0.15 m of it)
//   7 no page errors
//   8 the latrine down its trail, 60 m and more from the site's middle, checked by the dot's E like the grate and the
//     pad: the starter job ends from the keys (the checker: the dot offered only the latrine's seat)
//   9 a crowded store (the pool short: bodies lent out, you at the door, more people than bodies): the staffer and the
//     keeper drawn every frame (the checker: an 8-person party took every body, the gem over empty air)
//  10 the staffer's door line placed clear of her gem on screen (the checker: "Got a minute?" lay over it)
//  (and in 1/5: nobody of the store's loading within 1.1 m of your berth's deck; in 2 and 5b: nobody of the store's
//   standing by the main path's step: the staffer, the food shelf)
//
//   APP=http://localhost:5301 node scripts/r3-final-test.mjs [--home 31] [--shots <dir>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5301';
const HOME = Number(arg('home', 31));
const SHOTS = arg('shots', path.join(tmpdir(), 'r3-final-shots'));
mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1500)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, T = g.THREE, H = window.__r3f = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.look = (yaw, pitch = 0.05) => { const ch = g.chase; if (ch) { ch.viewYaw = yaw; ch.forwardYaw = yaw; ch.viewPitch = pitch; } };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround(); H.look(heading);
  };
  H.face = (q, d, pitch = 0.05) => { const p = g.player, a = Math.atan2(p.z - q.z, p.x - q.x), x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d; H.standAt(x, z, Math.atan2(-(q.z - z), q.x - x)); H.look(Math.atan2(-(q.z - z), q.x - x), pitch); };
  const shown = (o) => { for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === g.scene) return true; } return false; };
  // the store's people drawn (npcs.js bodies), with their figure records
  H.storeFigs = () => {
    const out = [];
    for (const b of g.npcs.bodies) {
      if (!b.who || b.lent || !shown(b.group)) continue;
      const v = b.who.person, f = v.figs[b.who.fig]; if (!f) continue;
      out.push({ key: `${v.key}#${b.who.fig}`, v, f, b, party: !!v.party, extra: !!v.extra, walking: !!(f.path && f.path.length) || (f.spec && f.spec.pose === 'walk') });
    }
    return out;
  };
  H.partyPeople = () => g.actors.people.filter((p) => p.bind && p.bind.body && p.bind.body.fig && shown(p.bind.body.fig.group));
  H.berth = () => { const o = g.outfitter, L = o.layout(g.profile.home), b = (o.visit && o.visit.berth) || { side: L.dockSide, deck: L.dockDeck }; return { side: b.side && { x: b.side.x, z: b.side.z }, deck: b.deck && { x: b.deck.x, z: b.deck.z } }; };
  // the body's top (skinned, the hat included) and its root
  const box = new T.Box3(), R = new T.Vector3();
  H.top = (b) => { b.group.updateWorldMatrix(true, true); box.setFromObject(b.group, true); b.fig.bones.root.getWorldPosition(R); return { top: box.max.y, x: R.x, z: R.z }; };
  H.staffer = () => { const h = g.onboarding.extra, v = h && h.person; if (!v) return null; const f = H.storeFigs().find((q) => q.v === v || q.v.key === v.key); return f || { v, undrawn: true }; }; // (by key: the roster's record can be made afresh)
  H.gem = (id) => g.locator.shown().find((q) => q.id === id && !q.gone) || null;
  // a watch of n frames at the store: who stands on the berth's deck, party hulls in it, party people on it
  H.dockWatch = async (n) => {
    const B = H.berth(), out = { frames: 0, onDeck: 0, deckEv: [], hullIn: 0, hullEv: [], partyOn: 0, store: 0, loaders: 0, minHull: 99, minParty: 99 };
    for (let k = 0; k < n; k++) {
      g.step(1 / 30, 1); out.frames++;
      const fs = H.storeFigs().filter((q) => !q.extra && !q.v.keeper);
      out.store = Math.max(out.store, fs.length);
      for (const q of fs) {
        if (q.f.act === 'load' || q.f.act === 'unload' || q.f.act === 'fish') out.loaders++;
        if (B.deck && !q.walking && Math.hypot(q.f.x - B.deck.x, q.f.z - B.deck.z) < 0.6) { out.onDeck++; if (out.deckEv.length < 5) out.deckEv.push({ k, key: q.key, act: q.f.act, at: q.f.at }); }
      }
      for (const b of g.actors.boats) { const d = Math.hypot(b.x - B.side.x, b.z - B.side.z); out.minHull = Math.min(out.minHull, +d.toFixed(2)); if (d < 3) { out.hullIn++; if (out.hullEv.length < 5) out.hullEv.push({ k, key: b.key, d: +d.toFixed(2) }); } }
      for (const p of H.partyPeople()) { const d = B.deck ? Math.hypot(p.x - B.deck.x, p.z - B.deck.z) : 99; out.minParty = Math.min(out.minParty, +d.toFixed(2)); if (d < 0.8) out.partyOn++; }
      if (k % 30 === 0) await H.wait(2);
    }
    out.loaders = Math.round(out.loaders / Math.max(1, out.frames));
    return out;
  };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  const shot = async (name) => { await page.evaluate(() => window.__r3f.step(2)); const f = path.join(SHOTS, `r3-final-${name}.png`); await page.screenshot({ path: f }); log('shot', f); };
  const ev = (fn, a) => page.evaluate(fn, a);
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.locator && g.onboarding && g.npcs && g.actors && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await ev(HELPERS);

  // a new season at home, on its busiest morning hour at the store
  await ev(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await ev(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  const hour = await ev(() => {
    const g = window.__game, N = g.npcs, P = g.parties, ep = g.profile.home;
    if (g.outfitter.open) g.outfitter.hide();
    let best = 9, n = -1;
    for (let h = 7.5; h <= 11.5; h += 0.05) { const k = N.storeParties(ep, P.today, h).reduce((a, e) => a + Math.min(3, e.party.size), 0); if (k > n) { n = k; best = h; } }
    g.day.setClock(g.day.year, g.day.doy, best - 0.15); window.__r3f.step(60);
    return { best: +best.toFixed(2), n };
  });
  log('busiest hour', JSON.stringify(hour));

  // 1 the empty dock
  const one = await ev(async () => {
    const g = window.__game, H = window.__r3f, L = g.outfitter.layout(g.profile.home), foot = L.dockFoot || L.dockLand || L.door;
    H.standAt(foot.x, foot.z); const B = H.berth(); H.face(B.side, 8, -0.15); H.step(30);
    const hull = g.player.canoe.hull.visible, done = g.onboarding.state && g.onboarding.state.done;
    const w = await H.dockWatch(3600);
    return { hull, done, berth: B, ...w };
  });
  await shot('1-empty-dock');
  result('1 the empty dock: no canoe before the talk, nobody on your berth, no party canoe in it', !one.hull && !one.done && one.onDeck === 0 && one.hullIn === 0 && one.partyOn === 0 && one.store > 0, one);

  // 2 the staffer and the gem, a long watch through the idle poses
  const two = await ev(async () => {
    const g = window.__game, H = window.__r3f, sp = g.onboarding.spot(g.profile.home);
    g.guide.sync(); const cur = g.guide.current();
    const r = cur && g.guide.reach(cur); if (r) H.face(r.pos, 3.4, 0.12);
    H.step(30);
    const out = { cur: cur && cur.id, frames: 0, drawn: 0, minClear: 99, maxOff: 0, maxDrift: 0, gemFrames: 0, clipEv: [] };
    for (let k = 0; k < 1800; k++) {
      g.step(1 / 30, 1); out.frames++;
      const s = H.staffer(); if (!s || s.undrawn) continue;
      out.drawn++;
      const t = H.top(s.b); out.maxDrift = Math.max(out.maxDrift, +Math.hypot(t.x - sp.x, t.z - sp.z).toFixed(3));
      const gm = H.gem('story:onboard:talk'); if (!gm) continue;
      out.gemFrames++;
      const low = gm.y - 0.62 * gm.s, clear = low - t.top, off = Math.hypot(gm.x - t.x, gm.z - t.z);
      out.maxOff = Math.max(out.maxOff, +off.toFixed(3));
      if (clear < out.minClear) out.minClear = +clear.toFixed(3);
      if (clear < 0 && out.clipEv.length < 5) out.clipEv.push({ k, low: +low.toFixed(3), top: +t.top.toFixed(3) });
      if (k % 60 === 0) await H.wait(2);
    }
    const s = H.staffer();
    out.name = s && s.v.name; out.spot = sp && { x: +sp.x.toFixed(2), z: +sp.z.toFixed(2) };
    return out;
  });
  await shot('2-staffer-gem');
  result('2 the staffer stands where the gem points; the gem never into their head through the idles', two.cur === 'story:onboard:talk' && two.drawn > 1700 && two.gemFrames > 1700 && two.maxOff < 0.6 && two.minClear >= 0 && two.maxDrift < 0.35, two);

  // 3 E on the staffer opens the talk, the gem hidden while it lasts; escaped
  const three = await ev(() => {
    const g = window.__game, H = window.__r3f, s = H.staffer();
    if (!s || !s.v) return { none: true };
    g.npcs.extraTalk(s.v); H.step(6);
    const talking = g.npcs.dialogue.talking, gem = !!H.gem('story:onboard:talk');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); H.step(6);
    if (g.outfitter.open) g.outfitter.hide();
    H.step(30); g.guide.sync();
    return { talking, gemInTalk: gem, after: g.npcs.dialogue.talking, cur: g.guide.current() && g.guide.current().id, gemBack: !!H.gem('story:onboard:talk') };
  });
  result('3 the talk opens from the staffer, the gem hidden in it and back after an escape', three.talking && !three.gemInTalk && !three.after && three.cur === 'story:onboard:talk' && three.gemBack, three);

  // 4 the door at the busiest hour: walked in to the staffer with W
  await ev(({ h }) => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, h - 0.1); window.__r3f.step(30); }, { h: hour.best });
  const startAt = await ev(() => {
    const g = window.__game, H = window.__r3f, L = g.outfitter.layout(g.profile.home), from = L.stepsFoot || L.door;
    const c = L.centre || L.door, dx = from.x - c.x, dz = from.z - c.z, n = Math.hypot(dx, dz) || 1;
    H.standAt(from.x + (dx / n) * 1.5, from.z + (dz / n) * 1.5); H.step(10);
    if (g.chase.setMode) g.chase.setMode('first');
    // (in when someone of the store's is on their way through the door or the yard by it: up to 3 game minutes)
    let wait = 0; for (; wait < 5400; wait++) { g.step(1 / 30, 1); if (H.storeFigs().some((f) => f.walking && !f.extra && Math.hypot(f.f.x - L.door.x, f.f.z - L.door.z) < 6)) break; }
    return { x: g.player.x, z: g.player.z, wait };
  });
  await page.keyboard.down('KeyW');
  const four = await ev(async () => {
    const g = window.__game, H = window.__r3f, p = g.player, L = g.outfitter.layout(g.profile.home), sp = g.onboarding.spot(g.profile.home);
    // the way in: the foot of the steps, the porch before the door, the door, inside, then to the staffer
    const fr = (q) => q && { x: q.x, z: q.z };
    const c = L.centre || L.door, d = L.door, dx = c.x - d.x, dz = c.z - d.z, n = Math.hypot(dx, dz) || 1;
    const way = [fr(L.stepsFoot), { x: d.x - (dx / n) * 1.2, z: d.z - (dz / n) * 1.2 }, fr(d), { x: d.x + (dx / n) * 1.4, z: d.z + (dz / n) * 1.4 }, { x: sp.x, z: sp.z }].filter(Boolean);
    const out = { frames: 0, reached: false, minWalker: 99, through: 0, ev: [], way: way.length, stuck: 0 };
    let i = 0, lastD = Infinity, lastK = 0;
    for (let k = 0; k < 2400 && !out.reached; k++) {
      while (i < way.length - 1 && Math.hypot(way[i].x - p.x, way[i].z - p.z) < 0.7) i++;
      const q = way[i]; H.look(Math.atan2(-(q.z - p.z), q.x - p.x), 0.02); p.heading = g.chase.viewYaw;
      g.step(1 / 30, 1); out.frames++;
      const ds = Math.hypot(sp.x - p.x, sp.z - p.z);
      if (ds < 1.6) out.reached = true;
      if (ds < lastD - 0.2) { lastD = ds; lastK = k; } else if (k - lastK > 300) { out.stuck++; lastK = k; }
      for (const f of H.storeFigs()) {
        if (!f.walking || f.extra) continue;
        const dd = Math.hypot(f.f.x - p.x, f.f.z - p.z); out.minWalker = Math.min(out.minWalker, +dd.toFixed(2));
        if (dd < 0.3) { out.through++; if (out.ev.length < 6) out.ev.push({ k, key: f.key, d: +dd.toFixed(2) }); }
      }
      if (k % 30 === 0) await H.wait(2);
    }
    out.at = { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }; out.left = +Math.hypot(sp.x - p.x, sp.z - p.z).toFixed(2);
    return out;
  });
  await page.keyboard.up('KeyW');
  await shot('4-walked-in');
  result('4 at the busiest hour you walk in at the door to the staffer, and nobody walks through you', four.reached && four.through === 0, { from: startAt, ...four });

  // 5 the talk through; the loaned canoe in your berth, and nobody of the store's on its deck
  const five = await ev(async () => {
    const g = window.__game, H = window.__r3f, o = g.outfitter, d = g.npcs.dialogue;
    if (o.open) o.hide();
    o.openHot('counter', o.visit.landing); H.step(4);
    for (let i = 0; i < 20 && d.convo; i++) { d.choose(0); H.step(3); await H.wait(40); if (g.starter && g.starter.pending) await g.starter.pending; }
    if (o.open) o.hide();
    H.step(40);
    const B = H.berth(), drop = g.player.carry && g.player.carry.drop;
    H.face(B.side, 8, -0.15); H.step(20);
    const w = await H.dockWatch(2400);
    return { done: g.onboarding.state.done, hull: g.player.canoe.hull.visible, dropAt: drop && B.side ? +Math.hypot(drop.x - B.side.x, drop.z - B.side.z).toFixed(2) : null, ...w };
  });
  await shot('5-loaned-canoe');
  result('5 after the talk the loaned canoe lies in your berth, nobody of the store\'s on its deck, no party canoe in it', five.done && five.hull && five.dropAt != null && five.dropAt < 1.5 && five.onDeck === 0 && five.hullIn === 0 && five.partyOn === 0, five);

  // 6 the starter night: the site to yourself, the neighbours on the ground
  const six = await ev(async () => {
    const g = window.__game, H = window.__r3f, home = g.profile.home;
    if (!g.starter || typeof g.starter.route !== 'function') return { none: 'no starter' };
    const R = g.starter.route(home), s = R && R.siteRec; if (!s) return { none: 'no site' };
    g.day.setClock(g.day.year, g.day.doy, 19.5);
    const A = s.access, lx = A && A.landing ? A.landing[0] : s.x, lz = A && A.landing ? A.landing[1] : s.z;
    await g.player.teleport(lx, lz); await H.settle();
    for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); }
    H.standAt(s.x + 3, s.z + 3); H.step(30);
    const out = { site: s.key || s.id || null, frames: 0, campsOn: 0, onSite: 0, onEv: [], camps: 0, neighbours: 0, standing: 0, floating: 0, worst: 0, fev: [] };
    const G = (x, z) => g.tiles.groundAt(x, z), T = g.THREE, A0 = new T.Vector3(), B0 = new T.Vector3();
    for (let k = 0; k < 1500; k++) {
      g.step(1 / 30, 1); out.frames++;
      if (k % 10) continue;
      out.camps = Math.max(out.camps, g.partyCamps.drawn.size);
      for (const D of g.partyCamps.drawn.values()) { const st = D.site || (D.c && D.c.site); if (st && Math.hypot(st.x - s.x, st.z - s.z) < 5) out.campsOn++; }
      for (const f of H.storeFigs()) {
        if (!f.party) continue;
        out.neighbours++;
        if (Math.hypot(f.f.x - s.x, f.f.z - s.z) < 10) { out.onSite++; if (out.onEv.length < 4) out.onEv.push({ k, key: f.key }); }
        if (f.walking || (f.f.spec && f.f.spec.pose === 'sit') || f.b.floorY != null) continue;
        const bn = f.b.fig.bones; f.b.group.updateWorldMatrix(true, true); bn.footL.getWorldPosition(A0); bn.footR.getWorldPosition(B0);
        const lo = Math.min(A0.y - G(A0.x, A0.z), B0.y - G(B0.x, B0.z)); out.standing++;
        if (Math.abs(lo) > out.worst) out.worst = +Math.abs(lo).toFixed(3);
        if (Math.abs(lo) > 0.15) { out.floating++; if (out.fev.length < 4) out.fev.push({ k, key: f.key, lo: +lo.toFixed(2) }); }
      }
      for (const p of H.partyPeople()) if (Math.hypot(p.x - s.x, p.z - s.z) < 10) { out.onSite++; if (out.onEv.length < 4) out.onEv.push({ k, key: p.key, actor: true }); }
      if (k % 60 === 0) await H.wait(2);
    }
    // the nearest neighbour's camp, from beside it (their people are drawn within 60 m): standing feet on the ground
    let best = null, bd = Infinity;
    for (const D of g.partyCamps.drawn.values()) { const c = g.parties.live.get(D.key), st = c && c.site; if (st) { const d = Math.hypot(st.x - s.x, st.z - s.z); if (d < bd) { bd = d; best = st; } } }
    out.neighbourAt = best ? Math.round(bd) : null;
    if (best) {
      if (bd > 300) { await g.player.teleport(best.x + 12, best.z + 12); await H.settle(); } else H.standAt(best.x + 12, best.z + 12);
      for (let k = 0; k < 900; k++) {
        g.step(1 / 30, 1);
        if (k % 10) continue;
        for (const f of H.storeFigs()) {
          if (!f.party) continue;
          out.neighbours++;
          if (f.walking || (f.f.spec && f.f.spec.pose === 'sit') || f.b.floorY != null) continue;
          const bn = f.b.fig.bones; f.b.group.updateWorldMatrix(true, true); bn.footL.getWorldPosition(A0); bn.footR.getWorldPosition(B0);
          const lo = Math.min(A0.y - G(A0.x, A0.z), B0.y - G(B0.x, B0.z)); out.standing++;
          if (Math.abs(lo) > out.worst) out.worst = +Math.abs(lo).toFixed(3);
          if (Math.abs(lo) > 0.15) { out.floating++; if (out.fev.length < 4) out.fev.push({ k, key: f.key, lo: +lo.toFixed(2) }); }
        }
        if (k % 60 === 0) await H.wait(2);
      }
    }
    return out;
  });
  await shot('6-starter-night');
  if (six.none) result(`6 the starter night (${six.none}: skipped)`, true, six);
  else result('6 the starter night: no party on your site, the neighbours\' people on the ground', six.campsOn === 0 && six.onSite === 0 && (six.neighbourAt == null || six.standing > 0) && six.floating <= Math.max(2, six.standing * 0.01), six);

  // 8 the site's three parts by the dot's E (stood 2 m off each, first person, aimed at it): the latrine down its trail too
  const eight = [];
  await ev(async () => {
    const g = window.__game, H = window.__r3f, t = g.tasks.active.find((x) => x.kind === 'starter'), s = t && g.world.campsites[t.site];
    if (s && Math.hypot(s.x - g.player.x, s.z - g.player.z) > 150) { await g.player.teleport(s.x + 3, s.z + 3); await H.settle(); for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); } }
  });
  for (const k of ['latrine', 'grate', 'pad']) {
    const pr = await ev((k) => {
      const g = window.__game, H = window.__r3f, t = g.tasks.active.find((x) => x.kind === 'starter'); if (!t) return { none: 'no job' };
      g.day.setClock(g.day.year, g.day.doy, 18);
      const s = g.world.campsites[t.site], q = g.guide.partsOf(t) && g.guide.partsOf(t)[k]; if (!q) return { none: 'no part' };
      if (g.chase.setMode && g.chase.mode !== 'first') g.chase.setMode('first');
      H.face({ x: q.x, z: q.z }, 2.0, -0.5); H.step(30);
      const cam = g.camera, gy = g.player.groundAt(q.x, q.z), dd = Math.hypot(q.x - cam.position.x, q.z - cam.position.z), yaw = Math.atan2(-(q.z - g.player.z), q.x - g.player.x);
      g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw; g.player.heading = yaw; g.chase.viewPitch = Math.atan2(gy + 0.25 - cam.position.y, dd); H.step(6);
      const tg = g.pointer.target;
      return { fromSite: +Math.hypot(q.x - s.x, q.z - s.z).toFixed(1), target: tg ? `${tg.kind}:${tg.ref || ''}` : null };
    }, k);
    if (pr.none) { eight.push({ k, ...pr }); continue; }
    await page.keyboard.press('KeyE'); await ev(() => window.__r3f.step(20));
    pr.after = await ev((k) => { const g = window.__game, t = g.tasks.active.find((x) => x.kind === 'starter'); return { checked: !!(t && t.checks && t.checks[k]), status: t && t.status, mode: g.player.mode, sat: !!(g.player.sit || g.player.seated) }; }, k);
    if (pr.after.sat || pr.after.mode === 'sit') { await page.keyboard.press('KeyE'); await ev(() => window.__r3f.step(20)); }
    eight.push({ k, ...pr });
  }
  await ev(() => { const g = window.__game; if (g.chase.setMode && g.chase.mode !== 'third') g.chase.setMode('third'); });
  result('8 the site\'s three parts checked by the dot\'s E, the latrine down its trail too: the starter job done', eight.length === 3 && eight.every((q) => q.after && q.after.checked && /^sitepart:/.test(q.target || '')) && eight[2].after.status === 'done', eight);

  result('7 no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('the run', false, { error: String((e && e.stack) || e).slice(0, 1500) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
