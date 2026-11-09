// r4: the performance baseline (docs/build/perf-baseline.md), before the story adds people, props and scenes. One headless
// Chromium against a running Vite; for each profile x quality a fresh browser context (its own storage, so Auto runs its
// own benchmark), the load timed, a new Adventure season at Moose Lake (ep 25) on Saturday 11 July 2026, then six fixed
// scenes, each settled, warmed and measured frame by frame:
//   store    in the store at its busiest morning hour (npcs.storeParties' fullest), third person
//   dock     the dock with the parties at that hour (r2-npc-perf's spot: off the dock's foot, looking along it)
//   paddle   paddling (W held) across Lake Insula along its longest open line
//   portage  carrying the canoe (W held, steered along the trail) on a portage near home
//   night    a party's camp at 22:30, standing 12 m off their fire
//   map      the dock with the HUD's sheet open over the home country (36 km)
// A frame is one __game.step(1/30, 1) (one simulation step and one draw), the GPU synced by a one-pixel read before
// and after, the page's own animation loop stopped. Per scene: frame ms (median, p90, p99, mean), draw calls and
// triangles a frame (every pass: the renderer's counters reset before each frame), shader programs, geometries and
// textures, the JS heap after a GC (CDP), and what the preset was.
// Profiles: desktop (1920x1080), modest (1280x720, the CPU throttled x4 by CDP while loading and measuring; the scene
// set-up and streaming run unthrottled, so a run takes minutes, not an hour). Qualities: auto (the pick recorded), low.
//
//   APP=http://localhost:5505 node scripts/perf-baseline.mjs [--profiles desktop,modest] [--qualities auto,low]
//        [--scenes store,dock,paddle,portage,night,map] [--frames 240] [--warm 60] [--out perf-baseline.json] [--label <text>]
// For an A/B later: run it on the same host against both builds in turn (or two Vite ports), same arguments, and compare
// the JSON; numbers from different hosts or a loaded host are not comparable (check `uptime` first).
import { createRequire } from 'node:module';
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { homedir, hostname, cpus, totalmem, loadavg } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5505';
const PROFILES = arg('profiles', 'desktop,modest').split(',');
const QUALITIES = arg('qualities', 'auto,low').split(',');
const SCENES = arg('scenes', 'store,dock,paddle,portage,night,map').split(',');
const FRAMES = Number(arg('frames', 240)), WARM = Number(arg('warm', 60));
const OUT = path.resolve(arg('out', 'perf-baseline.json'));
const LABEL = arg('label', '');
const HOME = 25, YEAR = 2026, DOY = 192;
const PROFILE = { desktop: { width: 1920, height: 1080, cpu: 1 }, modest: { width: 1280, height: 720, cpu: 4 } };
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

// --- the page side ------------------------------------------------------------------------------------------------------
const HELPERS = () => {
  const g = window.__game, H = window.__pb = { hold: null, tick: null };
  H.step = (n = 30, dt = 1 / 30) => { for (let left = n; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 60000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.look = (yaw, pitch = 0.02) => { const ch = g.chase; if (ch) { ch.viewYaw = yaw; ch.forwardYaw = yaw; ch.viewPitch = pitch; if (ch.snap) ch.snap(); } };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround(); H.look(heading);
  };
  // a teleport stepped along (the tiles stream in on the game's own frames: an await on it alone waits for ever far off)
  H.go = async (x, z) => { const t = g.player.teleport(x, z); for (let i = 0; i < 3000 && g.player.teleporting; i++) { H.step(4); await H.wait(20); } return t; };
  H.yawTo = (q) => { const p = g.player; return Math.atan2(-(q.z - p.z), q.x - p.x); };
  H.reset = () => {
    const p = g.player; if (H.hold) p.input.down.delete(H.hold); H.hold = null; H.tick = null;
    if (g.hud.mode === 'sheet') g.hud.setMode('hidden');
    if (g.outfitter.open) g.outfitter.hide();
    if (g.journal && g.journal.open) g.journal.close();
    if (g.chase.mode !== 'third') g.chase.setMode('third');
    if (g.weather && g.weather.set) { g.weather.set('clear'); g.weather._strikeIn = 1e9; }
    if (g.wind) { g.wind.override = 2; g.wind.speed = 2; }
  };
  H.busiest = () => { const N = g.npcs, P = g.parties; let best = 8.4, n = -1; for (let h = 7.5; h <= 11.5; h += 0.05) { const k = N.storeParties(HOME, P.today, h).filter((e) => e.dir === 'in').reduce((a, e) => a + Math.min(3, e.party.size), 0); if (k > n) { n = k; best = h; } } return { h: best, n }; };
  H.home = async () => { const l = g.outfitter.landing(HOME); if (Math.hypot(g.player.x - l.x, g.player.z - l.z) > 150) { H.go(l.x, l.z); await H.settle(); } for (let k = 0; k < 80 && !g.outfitter.layout(HOME); k++) { H.step(10); await H.wait(50); } return g.outfitter.layout(HOME); };
  const HOME = 25;
  H.scenes = {
    async store() {
      const L = await H.home(), b = H.busiest(); g.day.setClock(g.day.year, g.day.doy, b.h);
      const c = L.counter || L.centre || L.door, d = L.door;
      H.standAt(d.x + (c.x - d.x) * 0.35, d.z + (c.z - d.z) * 0.35); H.step(240);
      H.standAt(d.x + (c.x - d.x) * 0.35, d.z + (c.z - d.z) * 0.35); H.look(H.yawTo(c), -0.05); H.step(30);
      return { hour: +b.h.toFixed(2), partyPeople: b.n, inside: !!(g.outfitter.visit && g.outfitter.visit.inside) };
    },
    async dock() {
      const L = await H.home(), b = H.busiest(); g.day.setClock(g.day.year, g.day.doy, b.h);
      const p = g.player, q = L.dockFoot, t = L.dockDeck, dl = Math.hypot(t.x - q.x, t.z - q.z) || 1, dx = (t.x - q.x) / dl, dz = (t.z - q.z) / dl;
      const x = q.x - dx * 4 - dz * 6, z = q.z - dz * 4 + dx * 6, mx = (q.x + t.x) / 2, mz = (q.z + t.z) / 2;
      H.standAt(x, z); H.look(Math.atan2(-(mz - p.z), mx - p.x)); H.step(240); H.standAt(x, z); H.look(Math.atan2(-(mz - p.z), mx - p.x)); H.step(30);
      return { hour: +b.h.toFixed(2), partyPeople: b.n };
    },
    async paddle() {
      const w = g.world, named = w.lakes.filter((l) => l && l.name === 'Lake Insula').sort((a, b) => b.cells - a.cells)[0];
      const lake = named || w.lakes.filter((l) => l && l.name).sort((a, b) => b.cells - a.cells)[0], id = w.lakes.indexOf(lake) + 1;
      g.day.setClock(g.day.year, g.day.doy, 14);
      H.go(lake.cx, lake.cz); await H.settle();
      for (let k = 0; k < 60; k++) { H.step(10); await H.wait(30); }
      const p = g.player, water = (x, z) => w.isReady(x, z) && w.shoreAt(x, z) < -20;
      let best = 0, run = 0;
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; let r = 0; for (let s = 40; s < 6000 && water(p.x + Math.cos(a) * s, p.z - Math.sin(a) * s); s += 40) r = s; if (r > run) { run = r; best = a; } }
      p.heading = best; H.look(best, -0.02);
      H.hold = 'KeyW'; p.input.down.add('KeyW');
      H.tick = () => { p.heading = best; };
      H.step(150);
      return { lake: lake.name, id, openRunM: run, mode: p.mode };
    },
    async portage() {
      const w = g.world, l = g.outfitter.landing(HOME), L = await import('/src/lookboard.js');
      const ps = w.portages.map((q, i) => ({ q, i, d: q && q.pts ? Math.hypot(q.pts[0][0] - l.x, q.pts[0][1] - l.z) : Infinity })).filter((e) => e.q && e.q.lengthM > 250 && e.q.lengthM < 1500).sort((a, b) => a.d - b.d);
      const P = ps[0].q, pts = P.pts, a = pts[Math.min(2, pts.length - 1)], b = pts[Math.min(5, pts.length - 1)];
      g.day.setClock(g.day.year, g.day.doy, 15);
      H.go(a[0], a[1]); await H.settle();
      for (let k = 0; k < 60; k++) { H.step(10); await H.wait(30); }
      const hd = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      L.place(g, { mode: 'walk', canoe: 'carry', x: a[0], z: a[1], heading: hd });
      H.step(30); L.place(g, { mode: 'walk', canoe: 'carry', x: a[0], z: a[1], heading: hd }); H.look(hd, -0.05);
      const p = g.player;
      H.hold = 'KeyW'; p.input.down.add('KeyW');
      H.tick = () => { // steer along the trail: the point 3 on from the nearest
        let k = 0, bd = Infinity; for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - p.x, pts[i][1] - p.z); if (d < bd) { bd = d; k = i; } }
        const t = pts[Math.min(pts.length - 1, k + 3)]; if (Math.hypot(t[0] - p.x, t[1] - p.z) > 2) p.heading = Math.atan2(-(t[1] - p.z), t[0] - p.x);
      };
      H.step(60);
      return { portage: P.name || `#${ps[0].i}`, lengthM: Math.round(P.lengthM), mode: p.mode, fromHomeM: Math.round(ps[0].d) };
    },
    async night() {
      const l = g.outfitter.landing(HOME);
      g.day.setClock(g.day.year, g.day.doy, 22.5); H.step(30);
      let best = null, bd = Infinity;
      for (const c of g.parties.live.values()) { const st = c && c.site; if (st && Number.isFinite(st.x)) { const d = Math.hypot(st.x - l.x, st.z - l.z); if (d < bd && d > 300) { bd = d; best = st; } } }
      if (!best) return { none: true };
      H.go(best.x, best.z); await H.settle();
      for (let k = 0; k < 60 && !(best.layout); k++) { H.step(10); await H.wait(50); }
      const fire = best.layout && best.layout.fire ? best.layout.fire : best;
      let at = null; for (const r of [12, 9, 15]) { for (let i = 0; i < 16 && !at; i++) { const a = (i / 16) * Math.PI * 2, x = fire.x + Math.cos(a) * r, z = fire.z + Math.sin(a) * r; if (g.world.shoreAt(x, z) > 1.5 && Math.abs(g.player.groundAt(x, z) - g.player.groundAt(fire.x, fire.z)) < 2.5) at = { x, z }; } if (at) break; }
      at = at || { x: fire.x + 12, z: fire.z };
      H.standAt(at.x, at.z); H.look(H.yawTo(fire), -0.05); H.step(240); H.standAt(at.x, at.z); H.look(H.yawTo(fire), -0.05); H.step(30);
      const drawn = g.partyCamps.drawn.size, ppl = g.actors && g.actors.people ? g.actors.people.length : null;
      return { fromHomeM: Math.round(bd), campsDrawn: drawn, actors: ppl, hour: +g.day.hours.toFixed(2) };
    },
    async map() {
      const r = await H.scenes.dock();
      const l = g.outfitter.landing(HOME);
      g.hud.setMode('sheet'); g.hud.lookAt(l.x, l.z, 36000);
      for (let i = 0; i < 40; i++) { H.step(3); await H.wait(100); const b = g.hud.base; if (b && !b.pending && i > 6) break; }
      return { ...r, sheet: g.hud.mode };
    },
  };
  // frames measured one at a time, the GPU synced either side; draw calls and triangles over every pass of the frame
  H.measure = (n) => {
    const R = g.renderer, gl = R.getContext(), px = new Uint8Array(4), ms = [], calls = [], tris = [];
    const was = R.info.autoReset; R.info.autoReset = false;
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (let i = 0; i < n; i++) {
      if (H.tick) H.tick();
      R.info.reset();
      const t0 = performance.now();
      g.step(1 / 30, 1);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      ms.push(performance.now() - t0); calls.push(R.info.render.calls); tris.push(R.info.render.triangles);
    }
    R.info.autoReset = was;
    return { ms, calls, tris, programs: R.info.programs ? R.info.programs.length : null, geometries: R.info.memory.geometries, textures: R.info.memory.textures };
  };
  H.preset = () => { const v = g.settings.values; return { quality: v.quality, autoPick: v.autoPick || null, shadows: v.shadows, shadowReach: v.shadowReach, lod: v.lod, vegDensity: v.vegDensity, reflections: v.reflections, antialias: v.antialias, godRays: v.godRays, renderScale: v.renderScale }; };
  return true;
};

// --- the node side ------------------------------------------------------------------------------------------------------
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
const sum = (ms) => ({ median: +q(ms, 0.5).toFixed(2), p90: +q(ms, 0.9).toFixed(2), p99: +q(ms, 0.99).toFixed(2), mean: +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2), max: +Math.max(...ms).toFixed(2) });
const report = { app: APP, label: LABEL, when: new Date().toISOString(), host: { name: hostname(), cpu: cpus()[0] && cpus()[0].model, cores: cpus().length, memGB: +(totalmem() / 2 ** 30).toFixed(1), load: loadavg().map((x) => +x.toFixed(2)) }, frames: FRAMES, warm: WARM, runs: [] };
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
try {
  for (const prof of PROFILES) for (const qual of QUALITIES) {
    const P = PROFILE[prof]; if (!P) throw new Error(`no profile ${prof}`);
    const run = { profile: prof, quality: qual, viewport: `${P.width}x${P.height}`, cpuThrottle: P.cpu, scenes: {} };
    report.runs.push(run);
    const ctx = await browser.newContext({ viewport: { width: P.width, height: P.height } });
    ctx.setDefaultTimeout(600000);
    const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
    const errors = []; page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
    const throttle = (on) => cdp.send('Emulation.setCPUThrottlingRate', { rate: on ? P.cpu : 1 });
    await cdp.send('HeapProfiler.enable').catch(() => {});
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); const h = await cdp.send('Runtime.getHeapUsage'); return +(h.usedSize / 2 ** 20).toFixed(1); };
    log(`== ${prof} / ${qual} (${run.viewport}, CPU x${P.cpu})`);
    // the load: to the title card, the world in
    await throttle(true);
    const t0 = Date.now();
    await page.goto(APP, { timeout: 600000 });
    await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.title.state === 'title' && g.world && g.parties && typeof g.step === 'function'; }, null, { timeout: 600000, polling: 100 });
    const tTitle = Date.now() - t0;
    const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0] || {}, rs = performance.getEntriesByType('resource'); return { domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0), requests: rs.length, transferMB: +(rs.reduce((a, r) => a + (r.transferSize || 0), 0) / 2 ** 20).toFixed(1), gpu: (() => { const gl = window.__game.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })() }; });
    // the quality: Auto's own benchmark at the title (a fresh context has no pick), or Low
    if (qual === 'auto') await page.waitForFunction(() => !!window.__game.settings.values.autoPick, null, { timeout: 120000, polling: 250 }).catch(() => log('Auto made no pick in 120 s'));
    else await page.evaluate((v) => window.__game.settings.set('quality', v), qual);
    // a new Adventure season at home, the talk over, into the game (timed: the start button to the first frame afloat)
    await throttle(false);
    const t1 = Date.now();
    await page.evaluate(async ({ ep, year, doy }) => {
      const g = window.__game, t = g.title, e = g.world.entryPoints.find((x) => x.ep === ep);
      t.setPick('adventure');
      await t.newSeason(e, { confirm: false, start: { year, doy } });
      if (g.onboarding && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.onboarding.home, false); }
    }, { ep: HOME, year: YEAR, doy: DOY });
    await page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 600000, polling: 200 });
    const tGame = Date.now() - t1;
    await page.evaluate(HELPERS);
    await page.evaluate(() => { const g = window.__game; g.renderer.setAnimationLoop(null); if (g.saver) g.saver.enabled = false; window.__pb.reset(); });
    run.load = { toTitleMs: tTitle, ...nav, seasonToGameMs: tGame, throttledToTitle: P.cpu > 1, heapAtGameMB: await heap() };
    run.gpu = nav.gpu;
    log('load', JSON.stringify(run.load));
    for (const sc of SCENES) {
      try {
        await page.evaluate(() => window.__pb.reset());
        const setup = await page.evaluate((sc) => Promise.race([window.__pb.scenes[sc](), new Promise((_, no) => setTimeout(() => no(new Error(`${sc}: set-up over 240 s`)), 240000))]), sc);
        if (setup && setup.none) { run.scenes[sc] = { skipped: setup }; log(sc, 'skipped', JSON.stringify(setup)); continue; }
        await page.evaluate((n) => window.__pb.step(n), 20);
        await throttle(true);
        await page.evaluate((n) => window.__pb.measure(n), WARM);
        const m = await page.evaluate((n) => window.__pb.measure(n), FRAMES);
        await throttle(false);
        const preset = await page.evaluate(() => window.__pb.preset());
        const r = { setup, frameMs: sum(m.ms), calls: { median: q(m.calls, 0.5), max: Math.max(...m.calls) }, trianglesK: { median: Math.round(q(m.tris, 0.5) / 1000), max: Math.round(Math.max(...m.tris) / 1000) }, programs: m.programs, geometries: m.geometries, textures: m.textures, heapMB: await heap(), preset };
        run.scenes[sc] = r;
        log(sc, JSON.stringify(r));
      } catch (e) { await throttle(false).catch(() => {}); run.scenes[sc] = { error: String(e.message || e).slice(0, 400) }; log(sc, 'ERROR', e.message); }
    }
    run.errors = errors.slice(0, 5);
    writeFileSync(OUT, JSON.stringify(report, null, 1));
    await ctx.close();
  }
} finally {
  writeFileSync(OUT, JSON.stringify(report, null, 1));
  await browser.close();
}
// a table to paste
const rows = [];
for (const r of report.runs) for (const [k, s] of Object.entries(r.scenes)) {
  if (!s.frameMs) { rows.push(`| ${r.profile} | ${r.quality} | ${k} | ${s.skipped ? 'skipped' : 'error'} | | | | | | |`); continue; }
  rows.push(`| ${r.profile} | ${r.quality}${s.preset && s.preset.autoPick && r.quality === 'auto' ? ` (${s.preset.autoPick})` : ''} | ${k} | ${s.frameMs.median} | ${s.frameMs.p90} | ${s.frameMs.p99} | ${s.calls.median} | ${s.trianglesK.median} k | ${s.programs} | ${s.heapMB} |`);
}
console.log(['| profile | quality | scene | median ms | p90 | p99 | calls | triangles | programs | heap MB |', '|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n'));
for (const r of report.runs) console.log(`${r.profile}/${r.quality} load: title ${r.load && r.load.toTitleMs} ms, season to game ${r.load && r.load.seasonToGameMs} ms, ${r.load && r.load.requests} requests, ${r.load && r.load.transferMB} MB`);
