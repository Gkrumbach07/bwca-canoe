// r2 (NPC motion): frame time A/B with a busy store crowd and parties near, this build against another (an old commit
// served from its own worktree). Moose Lake, Saturday 11 July 2026, the store yard at its busiest morning hour.
//   APP=http://localhost:5222 OLD=http://localhost:5223 node scripts/r2-npc-perf.mjs
// Both tabs are set up alike, their loops stopped (driven by __game.step only), and timed in turns, a batch of frames
// each, the GPU synced (a pixel read) before and after each frame.
import { launch, seasonAt, step, log } from './gl-e-lib.mjs';
const NEW = process.env.APP || 'http://localhost:5222', OLD = process.env.OLD || 'http://localhost:5223';
const ROUNDS = +(process.env.ROUNDS || 12), BATCH = +(process.env.BATCH || 40);
const browser = await launch();
async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); ctx.setDefaultNavigationTimeout(300000); ctx.setDefaultTimeout(300000);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror', url, e.message));
  await page.goto(url + '/');
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.parties && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
  await seasonAt(page, { ep: 25, year: 2026, doy: 192, hours: 8.6 });
  await page.evaluate(() => {
    const g = window.__game; g.renderer.setAnimationLoop(null);
    // (the people's own cost a frame: the store and camp people, the parties' plan, the actor layer with the hulls)
    g.__cost = { npcs: 0, actors: 0, n: 0 };
    const wrap = (o, k, key) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const r = f(...a); g.__cost[key] += performance.now() - t; return r; }; };
    wrap(g.npcs, 'update', 'npcs'); wrap(g.actors, 'update', 'actors');
  });
  return page;
}
const place = (page) => page.evaluate(() => {
  const g = window.__game, L = g.outfitter.visit.L, p = g.player, q = L.dockFoot, t = L.dockDeck, dl = Math.hypot(t.x - q.x, t.z - q.z) || 1, dx = (t.x - q.x) / dl, dz = (t.z - q.z) / dl;
  g.chase.setMode('third'); p.x = q.x - dx * 4 - dz * 6; p.z = q.z - dz * 4 + dx * 6; const mx = (q.x + t.x) / 2, mz = (q.z + t.z) / 2; p.heading = Math.atan2(-(mz - p.z), mx - p.x);
});
const time = (page, n) => page.evaluate(({ n }) => {
  const g = window.__game, gl = g.renderer.getContext(), px = new Uint8Array(4), out = [];
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  g.__cost.npcs = 0; g.__cost.actors = 0;
  for (let i = 0; i < n; i++) { const t0 = performance.now(); g.step(1 / 30, 1); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.push(performance.now() - t0); }
  const C = g.__cost, people = { npcs: C.npcs / n, actors: C.actors / n };
  const a = g.actors.stats ? g.actors.stats() : null, M = g.moves, near = M ? [...M.active.values()].filter((L) => L.persons.length && M.distTo(L) < 400).length : 0;
  const drawn = g.npcs.bodies.filter((b) => b.who && !b.lent).length + (a ? a.figures : 0);
  return { ms: out, people, near, drawn, hulls: a ? a.near : null };
}, { n });
try {
  const pages = { new: await open(NEW), old: await open(OLD) };
  // the busiest store hour (as the r2 test finds it), then a minute for the crowd and the parties to come
  const h = await pages.new.evaluate(() => { const g = window.__game, N = g.npcs, P = g.parties; let best = 8.4, n = -1; for (let h = 7.5; h <= 11.5; h += 0.05) { const k = N.storeParties(25, P.today, h).filter((e) => e.dir === 'in').reduce((a, e) => a + Math.min(3, e.party.size), 0); if (k > n) { n = k; best = h; } } return best; });
  for (const p of Object.values(pages)) { await p.evaluate(({ h }) => window.__game.day.setClock(2026, 192, h), { h }); await place(p); await step(p, 600); await place(p); await step(p, 60); }
  const res = { new: [], old: [] }, info = {}, ppl = { new: [], old: [] };
  for (let r = 0; r < ROUNDS; r++) for (const k of r % 2 ? ['old', 'new'] : ['new', 'old']) { await place(pages[k]); const o = await time(pages[k], BATCH); res[k].push(...o.ms); ppl[k].push(o.people); info[k] = o; }
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }, p90 = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length * 0.9)]; };
  for (const k of ['old', 'new']) log(k, `frame median ${med(res[k]).toFixed(2)} ms, p90 ${p90(res[k]).toFixed(2)} ms over ${res[k].length} frames; people a frame: store/camp ${med(ppl[k].map((x) => x.npcs)).toFixed(3)} ms, parties + actors ${med(ppl[k].map((x) => x.actors)).toFixed(3)} ms; ${info[k].drawn} figures drawn, ${info[k].hulls} hulls whole, ${info[k].near} parties within 400 m`);
} finally { await browser.close(); }
