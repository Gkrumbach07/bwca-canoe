// Co-op phase 3 round 2, stream D (how a friend is drawn): two headless Chromiums (one browser process each) in one room
// through `wrangler dev`, the host in a Sandbox season at Lake One, the guest beside them. Each check makes the host do
// a thing on their screen and looks at how the guest's screen draws them:
//   1 the host on the dock's deck: drawn at their own feet's height (within 5 cm), the feet on the deck, not the lake bed
//   2 the host on top of a rock: the same (the owner: "it just looks like I'm standing inside the rock")
//   3 a climb onto that rock: the move's fields arrive and the friend's figure climbs (poses.js makeMoves), then stands on top
//   4 the canoe set down on a slope: drawn at the owner's height (5 cm) and tilt (1°)
//   5 a saw in the right hand: drawn in the friend's fist, the arm hanging with it
//   5b (round 3, "Containers in a friend's hand aren't drawn") a bucket in the left hand and a paddle in the right: drawn
//     as ours are (containers.js inHand), the bucket hanging from the fist by its bail, the paddle carried by the middle
//   6 a held job (pitching), a bite of food, the camera up: the arms (poses.js workArms) and the camera at the face
//   7 afloat: the canoe on the water's level the host's screen has; the rod up and a cast: the line from the friend's rod
//     tip to where the host's lure is (within 0.3 m); a fish landed held up in their hands
//   8 the poses stay small (well under 300 bytes)
//
//   cd server/room && npx wrangler dev --port 8891 --var DELAY_MS:100
//   npx vite --port 5391 --strictPort
//   APP=http://localhost:5391 RELAY=ws://localhost:8891 node scripts/coop/anim.mjs [--out dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5391';
const RELAY = process.env.RELAY || 'ws://localhost:8891';
const OUT = path.resolve(arg('out', 'coop-anim-out'));
mkdirSync(OUT, { recursive: true });

function findPw() {
  if (process.env.PW) return process.env.PW;
  const base = path.join(homedir(), '.npm/_npx');
  for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; }
  return 'playwright-core';
}
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(homedir(), 'Library/Caches/ms-playwright');
  const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; }
  return undefined;
}
const { chromium } = createRequire(import.meta.url)(findPw());
const launch = () => chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const browsers = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more)); };

async function openGame(name, query = '') {
  const browser = await launch(); browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /coop|actor/i.test(m.text())) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${query}`);
  await page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title && window.__game.coopAnim && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
  log(`[${name}] game loaded`);
  return page;
}
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 100 });
// the guest drawing the host at (x, z), drawn and still there a moment (a loaded machine draws few frames)
const seenAt = async (B, x, z, also = '') => { await B.waitForFunction(([x, z, also]) => { const r = [...window.__game.coop.remotes.values()][0]; if (!(r && r.person && Math.hypot(r.person.x - x, r.person.z - z) < 0.05 && r.person.bind && r.person.v < 0.05)) return false; return also === 'laid' ? !!r.boat.rest : also === 'hand' ? window.__game.coopAnim.stats().hands.some((h) => h.R) : true; }, [x, z, also], { timeout: 15000, polling: 100 }).catch(() => log('seenAt: not yet', x, z)); await sleep(1200); }; // (then the feet a moment to settle)
const step = async (run) => { try { await run(); } catch (e) { log('ERROR', e && e.stack || e); results.push({ name: 'a step threw', pass: false, error: String(e).slice(0, 300) }); } };
// a close look at the friend from the guest's screen: the part of the page round their name tag
const near = async (page, name) => { const r = await page.evaluate(() => { const t = [...document.querySelectorAll('#coop-names .tag')].find((e) => !e.hidden); if (!t) return null; const b = t.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height }; }); if (!r) { await page.screenshot({ path: path.join(OUT, name) }); return; } const x = Math.max(0, Math.min(1280 - 480, r.x - 240)), y = Math.max(0, Math.min(800 - 360, r.y - 40)); await page.screenshot({ path: path.join(OUT, name), clip: { x, y, width: 480, height: 360 } }); };

// --- in the pages -----------------------------------------------------------------------------------------------------
// the host stands at (x, z) on whatever is highest there within 3 m over the ground (a deck, a rock), as the walker would
const standOn = ({ x, z, h }) => {
  const g = window.__game, p = g.player, w = g.world;
  const near = w.tiles.treesNear(x, z, 4.5), ground = p.groundAt(x, z), top = p.supportAt(x, z, ground + 3, near);
  p.x = x; p.z = z; if (Number.isFinite(h)) p.heading = h; p.speed = 0; p.act = null;
  p.foot = { y: top, vy: 0, air: false, t: 0, land: 0, near, peak: top };
  for (let i = 0; i < 20; i++) g.step(1 / 60, 1);
  return { foot: +p.foot.y.toFixed(3), rig: +(g.canoe.rig.position.y - 0.1).toFixed(3), ground: +ground.toFixed(3), top: +top.toFixed(3), x: p.x, z: p.z };
};
// the guest a few metres off the host, on foot, facing them (so the figure is drawn and in view)
const besideOnFoot = async ({ x, z, d = 4, a = 2.2 }) => {
  const g = window.__game, p = g.player;
  if (p.mode === 'paddle') { await p.teleport(x, z); for (let i = 0; i < 3; i++) g.step(1 / 60, 1); if (p.mode === 'paddle') p.stepOut(); for (let i = 0; i < 3; i++) g.step(1 / 60, 1); }
  let best = null;
  for (let k = 0; k < 16 && !best; k++) {
    const ang = a + (k * Math.PI) / 8, px = x + Math.cos(ang) * d, pz = z + Math.sin(ang) * d;
    if (g.world.shoreAt(px, pz) > 1) best = [px, pz];
  }
  if (best) { p.x = best[0]; p.z = best[1]; }
  p.foot = null; p.placeOnGround();
  p.heading = Math.atan2(-(z - p.z), x - p.x); p.speed = 0;
  const ch = g.chase; if (ch && ch.snap) ch.snap();
  for (let i = 0; i < 20; i++) g.step(1 / 60, 1);
  return { mode: p.mode, x: +p.x.toFixed(1), z: +p.z.toFixed(1), d: +Math.hypot(p.x - x, p.z - z).toFixed(1) };
};
// how the guest draws the host: the person's height, the drawn feet, and the host's own feet for the same frame later
const seen = () => {
  const g = window.__game, r = [...g.coop.remotes.values()][0];
  if (!r) return null;
  const P = r.person, B = P.bind, v = (o) => { const q = o.getWorldPosition(new o.position.constructor()); return +q.y.toFixed(3); };
  const fw = B ? ["footL", "footR"].map((k) => { const q = B.body.fig.bones[k].getWorldPosition(new B.root.position.constructor()); return { x: +(q.x - P.x).toFixed(2), z: +(q.z - P.z).toFixed(2), under: +P.groundAt(q.x, q.z).toFixed(3) }; }) : null;
  return { feetAt: fw, onThing: P.onThing, sc: B ? B.s : null, y: +P.y.toFixed(3), footY: P.footY, drawn: !!B, feet: B ? [v(B.body.fig.bones.footL), v(B.body.fig.bones.footR)] : null, mode: P.mode, terrain: +g.world.tiles.groundAt(P.x, P.z).toFixed(3), sy: r.seen && r.seen.y, moveN: P.moveN || 0, armsN: P.armsN || 0, arms: P.arms ? P.arms.kind : null, held: P.state && P.state.held ? { ...P.state.held } : null, anim: r.seen && r.seen.an ? Object.keys(r.seen.an) : [] };
};
const ownFeet = () => { const b = window.__game.canoe.figure.bones, v = (o) => +o.getWorldPosition(new o.position.constructor()).y.toFixed(3); return [v(b.footL), v(b.footR)]; };
const poseLen = () => { const c = window.__game.coop; return JSON.stringify(c.poseMsg()).length; };

try {
  const A = await openGame('host');
  await A.evaluate(async () => {
    const g = window.__game, t = g.title;
    const ep = g.world.entryPoints.find((e) => e.name === 'Lake One') || g.world.entryPoints[0];
    t.setPick('sandbox');
    await t.newSeason(ep, { confirm: false });
  });
  await until(A, () => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 180000);
  await A.evaluate(() => { const g = window.__game, o = g.outfitter; if (o.open) o.hide(); g.day.hours = 13; }); // (midday, for the pictures: the host's clock is the room's)
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
  const B = await openGame('guest', `&join=${code}`);
  await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
  await B.fill('#coop-name', 'Ada');
  await B.click('#coop-go');
  await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 180000);
  await until(B, () => window.__game.coop.remotes.size === 1 && [...window.__game.coop.remotes.values()][0].drawnAt, null, 30000);
  const sizes = [];
  sizes.push(['standing', await A.evaluate(poseLen)]);

  // --- 1. the dock's deck -----------------------------------------------------------------------------------------------
  await step(async () => {
    const deck = await A.evaluate(() => {
      const g = window.__game, o = g.outfitter, p = g.player, L = o.layout(o.visit.ep);
      const b0 = o.berths(L)[0].side, near = g.world.tiles.treesNear(b0.x, b0.z, 30);
      // the deck: a box standing well over the ground (the lake bed) near the berth
      const boxes = near.filter((t) => t.box && Number.isFinite(t.top) && t.top - p.groundAt(t.x, t.z) > 0.3).sort((a, b) => Math.hypot(a.x - b0.x, a.z - b0.z) - Math.hypot(b.x - b0.x, b.z - b0.z));
      return boxes.length ? { x: boxes[0].x, z: boxes[0].z, top: boxes[0].top, n: boxes.length } : null;
    });
    if (!deck) { result('1. on the dock\'s deck: drawn at their height', false, { why: 'no deck found' }); return; }
    const host = await A.evaluate(standOn, { x: deck.x, z: deck.z });
    await B.evaluate(besideOnFoot, { x: host.x, z: host.z, d: 5 });
    await seenAt(B, host.x, host.z);
    const [s, feet] = [await B.evaluate(seen), await A.evaluate(ownFeet)];
    const dy = Math.abs(s.y - host.foot), mean = (f) => (f[0] + f[1]) / 2, df = s.feet ? Math.abs(mean(s.feet) - mean(feet)) : 9; // (the feet: their mean, a sloped top plants them apart)
    result('1. on the dock\'s deck: drawn at their own feet\'s height (5 cm), the feet on the deck', host.foot - host.ground > 0.3 && dy < 0.05 && df < 0.05 && s.drawn, { deck: deck.top, host, guestSees: s, hostFeet: feet, dy: +dy.toFixed(3), dFeet: +df.toFixed(3), wasAt: +(host.foot - host.ground).toFixed(2) });
    await near(B, '1-host-on-the-deck.png');
  });

  // --- 2. a rock --------------------------------------------------------------------------------------------------------
  let rock = null;
  await step(async () => {
    rock = await A.evaluate(() => {
      const g = window.__game, p = g.player, w = g.world;
      // a rock 0.5 to 1.6 m over the ground, on land, within 150 m of the store, with a flat enough top to stand on
      const o = g.outfitter, L = o.layout(o.visit.ep), c = o.berths(L)[0].side;
      for (let R = 20; R <= 160; R += 20) {
        for (const t of w.tiles.treesNear(c.x, c.z, R)) {
          if (!t.shape || w.shoreAt(t.x, t.z) < 3) continue;
          const g0 = p.groundAt(t.x, t.z), h = t.shape.heightAt(t.x, t.z);
          if (!(h - g0 > 0.5 && h - g0 < 1.6)) continue;
          const near = w.tiles.treesNear(t.x, t.z, 4.5);
          if (p.rockSlope(t.x, t.z, h + 0.02, near) > 0.5) continue;
          return { x: t.x, z: t.z, top: h, ground: g0 };
        }
      }
      return null;
    });
    if (!rock) { result('2. on a rock: drawn at their height', false, { why: 'no rock found' }); return; }
    const host = await A.evaluate(standOn, { x: rock.x, z: rock.z });
    await B.evaluate(besideOnFoot, { x: host.x, z: host.z, d: 5 });
    await seenAt(B, host.x, host.z);
    const [s, feet] = [await B.evaluate(seen), await A.evaluate(ownFeet)];
    const dy = Math.abs(s.y - host.foot), mean = (f) => (f[0] + f[1]) / 2, df = s.feet ? Math.abs(mean(s.feet) - mean(feet)) : 9; // (the feet: their mean, a sloped top plants them apart)
    result('2. on top of a rock: drawn at their own feet\'s height (5 cm), the feet on the rock', host.foot - host.ground > 0.4 && dy < 0.05 && df < 0.05 && s.drawn, { rock, host, guestSees: s, hostFeet: feet, dy: +dy.toFixed(3), dFeet: +df.toFixed(3) });
    await near(B, '2-host-on-a-rock.png');
    await A.screenshot({ path: path.join(OUT, '2-host-own-screen.png') });
  });

  // --- 3. a climb onto it -----------------------------------------------------------------------------------------------
  await step(async () => {
    if (!rock) { result('3. a climb: the friend climbs', false, { why: 'no rock' }); return; }
    const before = await B.evaluate(seen);
    const go = await A.evaluate((rk) => {
      const g = window.__game, p = g.player, w = g.world;
      // a climb onto it from the bare ground round it, else a vault over it
      for (const want of ['climb', 'vault']) for (let k = 0; k < 16; k++) {
        const ang = (k * Math.PI) / 8;
        for (let d = 1.2; d <= 6; d += 0.4) {
          const x = rk.x + Math.cos(ang) * d, z = rk.z + Math.sin(ang) * d, near = w.tiles.treesNear(x, z, 4.5), gy = p.groundAt(x, z);
          if (p.supportAt(x, z, gy + 0.2, near) > gy + 0.05) continue; // (on the bare ground)
          const mx = -Math.cos(ang), mz = -Math.sin(ang);
          const a = p.traverseAhead(x, z, gy, mx, mz, near);
          if (a && a.kind === want) {
            p.x = x; p.z = z; p.heading = Math.atan2(-mz, mx); p.speed = 0; p.foot = { y: gy, vy: 0, air: false, t: 0, land: 0, near, peak: gy };
            g.step(1 / 60, 2);
            const a2 = p.traverseAhead(p.x, p.z, p.foot.y, mx, mz, p.foot.near || near) || a;
            p.startAct(a2, p.foot.y);
            g.step(1 / 60, 1);
            return { ok: true, kind: a2.kind, dur: a2.dur, top: a2.top, from: [+x.toFixed(2), +z.toFixed(2)], size: JSON.stringify(g.coop.poseMsg()).length };
          }
        }
      }
      return { ok: false };
    }, rock);
    if (!go.ok) { result('3. a climb: the friend climbs', false, { why: 'no climb found round the rock', go }); return; }
    sizes.push(['in a move', go.size]);
    // the guest's figure in the move (a loaded machine draws few frames: looked for up to 15 s)
    await B.waitForFunction((n) => { const r = [...window.__game.coop.remotes.values()][0]; return r && (r.person.moveN || 0) > n; }, before.moveN, { timeout: 15000, polling: 20 }).catch(() => {});
    const mid = await B.evaluate(seen);
    await near(B, '3-host-in-the-move.png');
    await until(A, () => !window.__game.player.act, null, 15000).catch(() => {});
    const host = await A.evaluate(() => { const p = window.__game.player; return { x: p.x, z: p.z, foot: +p.foot.y.toFixed(3), act: !!p.act, ground: +p.groundAt(p.x, p.z).toFixed(3) }; });
    await seenAt(B, host.x, host.z);
    await B.waitForFunction((y) => { const r = [...window.__game.coop.remotes.values()][0]; return Math.abs(r.person.y - y) < 0.05; }, host.foot, { timeout: 8000, polling: 100 }).catch(() => {});
    const after = await B.evaluate(seen);
    result(`3. a ${go.kind} onto/over the rock: the move arrives, the friend's figure makes it (poses.js makeMoves), then stands where the host does (5 cm)`, !!mid && mid.moveN > before.moveN && !host.act && Math.abs(after.y - host.foot) < 0.05 && (go.kind !== 'climb' || host.foot - host.ground > 0.3), { go, mid, framesInMove: after.moveN - before.moveN, host, after });
  });

  // --- 4. the canoe set down on a slope -----------------------------------------------------------------------------------
  await step(async () => {
    const laid = await A.evaluate(() => {
      const g = window.__game, p = g.player, w = g.world, o = g.outfitter, L = o.layout(o.visit.ep), c = o.berths(L)[0].side;
      let best = null;
      for (let i = 0; i < 400 && !best; i++) {
        const a = i * 2.39996, r = 8 + i * 0.25, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (w.shoreAt(x, z) < 4) continue;
        const sl = Math.abs(p.groundAt(x + 2, z) - p.groundAt(x - 2, z)) / 4 + Math.abs(p.groundAt(x, z + 2) - p.groundAt(x, z - 2)) / 4;
        if (sl > 0.12) best = { x, z, sl };
      }
      if (!best) return null;
      const h = 0.7;
      p.x = best.x - 3; p.z = best.z; p.foot = null; p.placeOnGround();
      p.carry.drop = { x: best.x, z: best.z, heading: h };
      p.restHull(best.x, best.z, h);
      for (let i = 0; i < 10; i++) g.step(1 / 60, 1);
      const hull = g.canoe.hull, P = hull.getWorldPosition(new hull.position.constructor()), Q = hull.getWorldQuaternion(new hull.quaternion.constructor());
      return { at: best, y: P.y, q: [Q.x, Q.y, Q.z, Q.w], me: { x: p.x, z: p.z } };
    });
    if (!laid) { result('4. the canoe set down on a slope', false, { why: 'no slope found' }); return; }
    await B.evaluate(besideOnFoot, { x: laid.at.x, z: laid.at.z, d: 6 });
    await seenAt(B, laid.me.x, laid.me.z, 'laid');
    const s = await B.evaluate(() => {
      const r = [...window.__game.coop.remotes.values()][0], b = r.boat, R = b.root;
      R.updateMatrixWorld(true);
      const P = R.getWorldPosition(new R.position.constructor()), Q = R.getWorldQuaternion(new R.quaternion.constructor());
      return { hidden: b.hidden, near: !!b.near, rest: !!b.rest, y: P.y, q: [Q.x, Q.y, Q.z, Q.w], guess: window.__game.world.levelAt(b.x, b.z) };
    });
    const dot = Math.abs(s.q[0] * laid.q[0] + s.q[1] * laid.q[1] + s.q[2] * laid.q[2] + s.q[3] * laid.q[3]), ang = 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
    result('4. the canoe set down on a slope: drawn at the owner\'s height (5 cm) and tilt (1°)', !s.hidden && s.rest && Math.abs(s.y - laid.y) < 0.05 && ang < 1, { slope: +laid.at.sl.toFixed(2), hostY: +laid.y.toFixed(3), guestY: +s.y.toFixed(3), degrees: +ang.toFixed(2), drawnWhole: s.near });
    await near(B, '4-canoe-on-a-slope.png');
    sizes.push(['canoe set down', await A.evaluate(poseLen)]);
  });

  // --- 5. a saw in the right hand ---------------------------------------------------------------------------------------
  await step(async () => {
    const host = await A.evaluate(() => { const g = window.__game, p = g.player; p.foot = null; p.placeOnGround(); const r = g.inventory.toHandNew('saw', { hand: 0 }); for (let i = 0; i < 10; i++) g.step(1 / 60, 1); return { put: r, held: g.canoe.state.held, x: p.x, z: p.z }; });
    await B.evaluate(besideOnFoot, { x: host.x, z: host.z, d: 4 });
    await seenAt(B, host.x, host.z, 'hand');
    const s = await B.evaluate(() => {
      const g = window.__game, r = [...g.coop.remotes.values()][0], st = g.coopAnim.stats(), B = r.person.bind;
      const h = B ? B.body.fig.bones.handR.getWorldPosition(new B.root.position.constructor()) : null, at = st.hands[0] && st.hands[0].at;
      return { hands: st.hands, held: r.person.state.held, toHand: h && at ? +Math.hypot(h.x - at[0], h.y - at[1], h.z - at[2]).toFixed(3) : null, hd: r.seen.an && r.seen.an.hd };
    });
    result('5. a saw in the right hand: drawn in the friend\'s fist, that arm hanging with it', s.hands.some((h) => h.R) && s.held && s.held.R && s.toHand !== null && s.toHand < 0.35, { host, guestSees: s });
    await near(B, '5-saw-in-hand.png');
    sizes.push(['a saw in hand', await A.evaluate(poseLen)]);
  });

  // --- 5b. round 3: a container (the bucket) in the left hand and a paddle in the right ---------------------------------
  await step(async () => {
    const host = await A.evaluate(() => {
      const g = window.__game, inv = g.inventory, p = g.player;
      for (const c of inv.containers.filter((k) => k.where === 'hands')) inv.setDown(c.id, { x: p.x + 1.5, z: p.z + 1.5, heading: 0 }, { force: true, quiet: true });
      for (const l of inv.long.filter((k) => k.where === 'hands')) inv.setDown(l.uid, { x: p.x + 1.5, z: p.z - 1.5, heading: 0 }, { force: true, quiet: true });
      const b = inv.addContainer('bucket', 'hands', null, { hand: 1 }), pd = inv.addLong('ash', 'hands', null, { hand: 0 });
      inv.emit('containers');
      for (let i = 0; i < 10; i++) g.step(1 / 60, 1);
      return { bucket: !!b, paddle: !!pd, held: g.canoe.state.held, x: p.x, z: p.z };
    });
    await B.waitForFunction(() => { const h = window.__game.coopAnim.stats().hands[0]; return h && h.box && h.box.L === 'bucket' && /^paddle/.test(h.box.R || ''); }, null, { timeout: 15000, polling: 100 }).catch(() => log('5b: not yet'));
    await sleep(600);
    const s = await B.evaluate(() => {
      const g = window.__game, r = [...g.coop.remotes.values()][0], st = g.coopAnim.stats().hands[0], B = r.person.bind, V = B.root.position.constructor;
      const hL = B.body.fig.bones.handL.getWorldPosition(new V()), hR = B.body.fig.bones.handR.getWorldPosition(new V()), bx = st.box || {};
      const d = (a, b) => (a && b ? +Math.hypot(a[0] - b.x, a[1] - b.y, a[2] - b.z).toFixed(3) : null);
      const gL = bx.gripL, aL = bx.atL, gR = bx.gripR, aR = bx.atR;
      return { box: { R: bx.R, L: bx.L }, boxN: st.boxN, held: r.person.state.held, gripToHandL: d(gL, hL), gripToHandR: d(gR, hR),
        bucketBelowFist: gL && aL ? +(gL[1] - aL[1]).toFixed(3) : null, bucketAside: gL && aL ? +Math.hypot(gL[0] - aL[0], gL[2] - aL[2]).toFixed(3) : null,
        paddleFromFist: gR && aR ? +Math.hypot(gR[0] - aR[0], gR[1] - aR[1], gR[2] - aR[2]).toFixed(3) : null, hd: r.seen.an && r.seen.an.hd };
    });
    result('5b. a bucket in the left hand and a paddle in the right: drawn at the friend\'s fists as ours are, both arms holding',
      s.box.L === 'bucket' && /^paddle/.test(s.box.R || '') && s.boxN > 0 && s.held && s.held.L && s.held.R && s.gripToHandL < 0.15 && s.gripToHandR < 0.15 && s.bucketBelowFist > 0.2 && s.bucketBelowFist < 0.5 && s.bucketAside < 0.2 && Math.abs(s.paddleFromFist - 0.75) < 0.05,
      { host, guestSees: s });
    await near(B, '5b-bucket-and-paddle.png');
    sizes.push(['bucket and paddle in hand', await A.evaluate(poseLen)]);
    await A.evaluate(() => { const g = window.__game, inv = g.inventory, p = g.player; for (const c of inv.containers.filter((k) => k.where === 'hands')) inv.setDown(c.id, { x: p.x + 1.5, z: p.z + 1.5, heading: 0 }, { force: true, quiet: true }); for (const l of inv.long.filter((k) => k.where === 'hands')) inv.setDown(l.uid, { x: p.x + 1.5, z: p.z - 1.5, heading: 0 }, { force: true, quiet: true }); inv.emit('containers'); });
  });

  // --- 6. the arms: a held job, eating, the camera up -------------------------------------------------------------------
  await step(async () => {
    await A.evaluate(() => { const g = window.__game; g.coop.g.hold.begin({ id: 'tent', label: 'Pitching the tent', phases: [{ name: 'Staked', seconds: 30 }], auto: true, still: false }); for (let i = 0; i < 5; i++) g.step(1 / 60, 1); });
    // (each looked for on the guest for a few seconds: a loaded machine draws few frames)
    const arms = (k) => B.waitForFunction((want) => { const r = [...window.__game.coop.remotes.values()][0]; return r && r.person.arms && r.person.arms.kind === want && r.person.armsW > 0.3; }, k, { timeout: 6000, polling: 50 }).catch(() => null);
    await arms('pitch');
    const job = await B.evaluate(seen);
    sizes.push(['pitching', await A.evaluate(poseLen)]);
    await near(B, '6-pitching.png');
    await A.evaluate(() => { const g = window.__game; g.coop.g.hold.cancel(); });
    await sleep(600);
    await A.evaluate(() => window.__game.coop.g.energy.eatItem({ food: 0.05 }, 'trail mix'));
    await arms('eat');
    const eat = await B.evaluate(seen);
    await near(B, '6-eating.png');
    await sleep(1800);
    await A.evaluate(() => { window.__game.photo.raise(); });
    await arms('photo');
    const cam = await B.evaluate(() => { const s = window.__game.coopAnim.stats(); return { hands: s.hands }; });
    const camSeen = await B.evaluate(seen);
    await near(B, '6-camera-up.png');
    await A.evaluate(() => window.__game.photo.lower());
    result('6. the arms: pitching, a bite of food, the camera up at the face', job.arms === 'pitch' && eat.arms === 'eat' && camSeen.arms === 'photo' && cam.hands.some((h) => h.cam), { job: { arms: job.arms, armsN: job.armsN }, eat: { arms: eat.arms, armsN: eat.armsN }, cam: { arms: camSeen.arms, hands: cam.hands } });
  });

  // --- 7. afloat: the level, the line, the fish ------------------------------------------------------------------------
  await step(async () => {
    const hp = await A.evaluate(async () => {
      const g = window.__game, p = g.player;
      const o = g.outfitter, L = o.layout(o.visit.ep), b0 = o.berths(L)[0].side, dd = g.world.deeperDir(b0.x, b0.z);
      await p.teleport(b0.x + dd.x * 30, b0.z + dd.z * 30);
      for (let i = 0; i < 30 && p.mode !== 'paddle'; i++) g.step(1 / 30, 1);
      for (let i = 0; i < 30; i++) g.step(1 / 60, 1);
      return { mode: p.mode, x: p.x, z: p.z, h: p.heading, level: p.level, rig: g.canoe.rig.position.y };
    });
    await B.evaluate(async (h) => {
      const g = window.__game, p = g.player;
      await p.teleport(h.x + Math.sin(h.h) * 9, h.z + Math.cos(h.h) * 9);
      for (let i = 0; i < 30 && p.mode !== 'paddle'; i++) g.step(1 / 30, 1);
      p.heading = Math.atan2(-(h.z - p.z), h.x - p.x); p.speed = 0; const ch = g.chase; if (ch && ch.snap) ch.snap();
      for (let i = 0; i < 20; i++) g.step(1 / 60, 1);
    }, hp);
    await sleep(1200);
    const lv = await B.evaluate(() => { const r = [...window.__game.coop.remotes.values()][0], b = r.boat; return { level: b.ext && b.ext.level, y: b.y, here: window.__game.world.levelAt(b.x, b.z) }; });
    const hNow = await A.evaluate(() => ({ level: window.__game.player.level, rig: window.__game.canoe.rig.position.y }));
    result('7a. afloat: the friend\'s canoe on the water\'s level the host\'s screen has', hp.mode === 'paddle' && Number.isFinite(lv.level) && Math.abs(lv.level - hNow.level) < 0.02 && Math.abs(lv.y - hNow.rig) < 0.1, { host: hNow, guestSees: lv });
    // the rod up and a cast
    await A.evaluate(() => { const g = window.__game, F = g.fishing; F.raise(); for (let i = 0; i < 20; i++) g.step(1 / 60, 1); g.player.speed = 0; F.pending = { power: 0.85 }; F.launch(); });
    await until(A, () => ['inwater', 'bite', 'fight'].includes(window.__game.fishing.state), null, 15000).catch(() => {});
    // the lure sinks as it lies there: the two looked at together, the guest's a quarter second behind, for up to 8 s
    let lure = null, ln = null, d = 99;
    for (let i = 0; i < 40 && (d >= 0.3 || !lure || !['inwater', 'bite'].includes(lure.state)); i++) {
      await sleep(200);
      lure = await A.evaluate(() => { const F = window.__game.fishing, P = F.linePos, e = (F.LINE_N - 1) * 3; return { state: F.state, end: [P[e], P[e + 1], P[e + 2]], lure: [F.lure.x, F.lure.y, F.lure.z] }; });
      ln = await B.evaluate(() => window.__game.coopAnim.stats().rods[0] || null);
      d = ln && ln.lineEnd ? Math.hypot(ln.lineEnd[0] - lure.end[0], ln.lineEnd[1] - lure.end[1], ln.lineEnd[2] - lure.end[2]) : 99;
    }
    sizes.push(['the line out', await A.evaluate(poseLen)]);
    result('7b. a cast: the line from the friend\'s rod tip to where their lure is (0.3 m)', !!ln && ln.visible && ln.line && d < 0.3 && ['inwater', 'bite'].includes(lure.state), { host: lure, guest: ln, d: +d.toFixed(3) });
    await near(B, '7-line-out.png');
    await B.screenshot({ path: path.join(OUT, '7-line-out-wide.png') });
    // a fish landed and held up
    // (as fishing.js land leaves it, without the log: a walleye of 46 cm held up)
    await A.evaluate(() => { const g = window.__game, F = g.fishing, m = F.fishMeshes.walleye; F.fish = null; F.bite = null; F.state = 'landed'; F.landed = { species: 'walleye', length: 46, weight: 1.1, t: 0, entry: {} }; F.heldFish = m; g.canoe.paddler.add(m); m.visible = true; m.scale.setScalar(0.46); for (const q of F.lureMeshes) q.visible = false; for (let i = 0; i < 5; i++) g.step(1 / 60, 1); });
    await B.waitForFunction(() => { const R = window.__game.coopAnim.stats().rods[0]; return R && R.fish; }, null, { timeout: 8000, polling: 100 }).catch(() => {});
    const fish = await B.evaluate(() => window.__game.coopAnim.stats().rods[0] || null);
    sizes.push(['a fish held up', await A.evaluate(poseLen)]);
    await near(B, '7-fish-held-up.png');
    result('7c. a fish landed: held up in the friend\'s hands', !!fish && fish.fish && fish.fishN > 0, { fish });
    await A.evaluate(() => { const F = window.__game.fishing; if (F.state === 'landed') F.release(false); F.stow(); });
  });

  // --- 8. the size ------------------------------------------------------------------------------------------------------
  const most = Math.max(...sizes.map((s) => s[1]));
  result('8. the poses stay small (under 300 bytes each)', most < 300, { sizes });
} catch (e) { log('ERROR', e && e.stack || e); results.push({ name: 'run', pass: false, error: String(e) }); }
finally {
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  for (const b of browsers) await b.close().catch(() => {});
  log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}
