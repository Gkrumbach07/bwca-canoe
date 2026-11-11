// Round 5 final pass (claude/r5-fixes, after chk-r5): the two the checker found still standing.
//   P  the parked truck behind a store: a fresh Sandbox season at each home (the title's buttons), its four tyres read
//      at once and again once the 2 m ground is in under it: every tyre within 0.15 m of the ground both times
//   D  every home store's dock reaches open water by paddling: the season's own canoe (walked to, E "Get in"), then the
//      way out found on the game's own water by the hull's own test (player.js: the middle 1.2 m in, the ends 0.5 m, afloat)
//      on a 2 m lattice, toward the nearest water 40 m from every shore (or, a river or creek start, 1.5 km of it), and
//      paddled along by W (the heading set on the way, the hull's own collision): reached, metres paddled, stuck spots
//      (none for 2 s), rapids passed within 30 m (none)
//   C  the contact sheet's shots (no checks): Sandbox at 67 with its canoe, the start map, the book's map, roads at Ely,
//      on the Gunflint and the Echo Trail, the truck pulling out at 25, the docks of cabins 22 and 7
//   APP=http://localhost:5751 ONLY=P,D [P_HOMES=6,16,...] [D_HOMES=...] node scripts/r5-final-test.mjs [--shots dir]
// (the harness is chk-r5's: claude/chk-r5 scripts/chk-r5.mjs)
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5751';
const SHOTS = path.resolve(arg('shots', 'r5-final-shots'));
const OUT = path.resolve(arg('out', path.join(SHOTS, 'r5-final.json')));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(SHOTS, { recursive: true });
const ONLY = (process.env.ONLY || 'P,D').split(','), on = (k) => ONLY.includes(k);
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const out = {};
const note = (k, v) => { out[k] = v; log('NOTE', k, JSON.stringify(v).slice(0, 6000)); writeFileSync(OUT, JSON.stringify(out, null, 1)); };
const errors = [];
const CABINS = JSON.parse(readFileSync(path.join(root, 'src/cabins.json'), 'utf8')).cabins;
const PLACES = JSON.parse(readFileSync(path.join(root, 'src/outfitter-places.json'), 'utf8')).places;
const OUTFITTERS = [51, 64, 49, 69, 40, 38, 36, 67, 25, 31, 6, 16, 1, 12];

// the roads of src/roads.bin (node side): to snap the looks to a road and to sample the far ones
const { decodePiece } = await import(path.join(root, 'src/roads.js'));
const CHAINS = (() => {
  const buf = readFileSync(path.join(root, 'src/roads.bin')), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(8, true), sl = dv.getUint16(16, true), head = (18 + sl + 3) & ~3, o2 = [], seen = new Set();
  for (let i = 0; i < n; i++) {
    const o = head + i * 12, a = dv.getUint32(o + 4, true), l = dv.getUint32(o + 8, true), raw = zlib.gunzipSync(buf.subarray(a, a + l));
    for (const c of decodePiece(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))) { const k = `${c.id}:${c.s0}`; if (seen.has(k)) continue; seen.add(k); o2.push(c); }
  }
  return o2;
})();
const P0 = { lat0: 48.09, lon0: -91.215, mPerDegLat: 111192.03815877548, mPerDegLon: 74495.49504086988 };
const XZ = (lat, lon) => ({ x: (lon - P0.lon0) * P0.mPerDegLon, z: -(lat - P0.lat0) * P0.mPerDegLat });
const nearChain = (x, z, max = 2500, kinds = [1, 2]) => { let b = null; for (const c of CHAINS) { if (!kinds.includes(c.k) || c.svc) continue; const bb = c.bbox; if (x < bb[0] - max || x > bb[2] + max || z < bb[1] - max || z > bb[3] + max) continue; for (let i = 0; i < c.n; i++) { const d = Math.hypot(c.p[i * 4] - x, c.p[i * 4 + 1] - z); if (!b || d < b.d) b = { d, c, i }; } } return b; };
const samplesNear = (x, z, r, step = 25) => { const o2 = []; for (const c of CHAINS) { const bb = c.bbox; if (x < bb[0] - r || x > bb[2] + r || z < bb[1] - r || z > bb[3] + r) continue; let s = step; for (let i = 1; i < c.n; i++) { s += Math.hypot(c.p[i * 4] - c.p[i * 4 - 4], c.p[i * 4 + 1] - c.p[i * 4 - 3]); if (s < step) continue; s = 0; const px = c.p[i * 4], pz = c.p[i * 4 + 1]; if (c.p[i * 4 + 3] < 0) continue; const d = Math.hypot(px - x, pz - z); if (d <= r) o2.push([+px.toFixed(1), +pz.toFixed(1), c.k, c.hw, c.svc ? 1 : 0, +c.p[i * 4 + 2].toFixed(2), Math.round(d)]); } } return o2; };

const HELPERS = async () => {
  const g = window.__game, H = window.__q = { notes: [], says: [] };
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 60000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.tileReady = (x, z) => { const e = g.tiles.tiles.get(g.tiles.key(...g.world.tileOf(x, z))); return !!(e && e.state === 'ready'); };
  H.ready = async (x, z, ms = 90000) => { const t0 = performance.now(); if (g.tiles.ensure) await g.tiles.ensure(x, z, 200); while (performance.now() - t0 < ms) { H.step(4); await H.wait(40); if (H.tileReady(x, z)) break; } H.step(10); };
  H.det = (x, z) => ((g.tiles.detail && g.tiles.detail.at(x, z)) || {}).r || 10;
  H.look = (yaw, pitch = 0.05) => { const ch = g.chase; if (g.player.mode === 'paddle') { g.player.heading = yaw; g.player.yawRate = 0; } if (ch) { ch.viewYaw = yaw; ch.forwardYaw = yaw; ch.viewPitch = pitch; if (ch.snap) ch.snap(); } };
  H.yawTo = (q) => { const p = g.player; return Math.atan2(-(q.z - p.z), q.x - p.x); };
  H.aimAt = (q, y) => { const p = g.player, cam = g.camera, d = Math.hypot(q.x - cam.position.x, q.z - cam.position.z); const yaw = H.yawTo(q); g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw; p.heading = yaw; if (y != null) g.chase.viewPitch = Math.atan2(y - cam.position.y, d); };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround(); H.look(heading);
  };
  H.goNear = async (x, z, want = 2, ms = 60000) => { H.standAt(x, z); await H.ready(x, z); const t0 = performance.now(); while (H.det(x, z) > want && performance.now() - t0 < ms) { H.step(3); await H.wait(40); } H.step(6); };
  H.closeAll = () => { try { if (g.title.state === 'pause') g.title.resume(); } catch { /* */ } const o = g.outfitter; if (o && o.open) o.hide(); try { const hm = g.hud.mode; if (hm === 'sheet' || hm === 'glance') g.hud.setMode('hidden'); } catch { /* */ } if (g.journal && g.journal.open) g.journal.close(); try { if (g.record && g.record.shown && g.record.close) g.record.close(); } catch { /* */ } };
  H.tp = async (x, z) => { H.closeAll(); const ok = await g.player.teleport(x, z); await H.settle(); return ok; };
  H.target = () => (g.pointer && g.pointer.target ? `${g.pointer.target.kind}:${g.pointer.target.label || ''}` : null);
  H.sign = () => { const el = document.getElementById('edge-sign'); return { shown: !!(el && el.classList.contains('show')), text: el ? el.textContent.replace(/\s+/g, ' ').trim() : '' }; };
  const byUrl = (name) => { const e = performance.getEntriesByType('resource').map((r) => r.name).find((n) => new RegExp(`/src/${name}\\.js(\\?|$)`).test(n)); return import(e || `/src/${name}.js`); };
  H.mod = byUrl;
  H.R = await byUrl('roads'); H.E = await byUrl('edge'); H.RP = await byUrl('rapids'); H.PR = await byUrl('props');
  H.G = (x, z) => { const a = g.tiles.groundAt(x, z), d = H.R.deckAt(g.world, x, z); return Number.isFinite(a) ? Math.max(a, d) : d; };
  // the meshes drawn now by name, and a ray straight down onto them: the top hit's y (or null)
  const T3 = g.THREE, rc = new T3.Raycaster(), V = new T3.Vector3(), D = new T3.Vector3(0, -1, 0);
  H.meshes = (re) => { const L = []; g.scene.traverseVisible((o) => { if (o.isMesh && re.test(o.name || '')) L.push(o); }); return L; };
  H.rayY = (x, z, list, top = 2000) => { V.set(x, top, z); rc.set(V, D); rc.far = 4000; const h = rc.intersectObjects(list, false); return h.length ? h[0].point.y : null; };
  // the truck's four tyres' contact points as drawn: { gaps: [fl, fr, bl, br] over G, rays (vs the drawn meshes, when asked) }
  H.tyres = (ray = false, list = null) => {
    const T = g.truck, m = T.mesh; if (!m || !m.visible) return null;
    const e = m.matrix.elements, P = (lx, lz) => [e[0] * lx + e[8] * lz + e[12], e[1] * lx + e[9] * lz + e[13], e[2] * lx + e[10] * lz + e[14]];
    const o2 = { gaps: [], rays: [], at: [Math.round(T.x), Math.round(T.z)] };
    for (const a of [1.72, -1.63]) for (const sd of [-0.93, 0.93]) { const [x, y, z] = P(sd, a); o2.gaps.push(+(y - H.G(x, z)).toFixed(3)); if (ray) { const r = H.rayY(x, z, list); o2.rays.push(r == null ? null : +(y - r).toFixed(3)); } }
    return o2;
  };
  if (g.hud && g.hud.note) { const n0 = g.hud.note.bind(g.hud); g.hud.note = (t, ...a) => { H.notes.push(`${g.day.doy} ${g.day.hours.toFixed(2)} ${String(t).replace(/<[^>]+>/g, '')}`); return n0(t, ...a); }; }
  if (g.player && g.player.say) { const s0 = g.player.say.bind(g.player); g.player.say = (t, ...a) => { const s = String(t || '').replace(/<[^>]+>/g, ''); if (s && H.says[H.says.length - 1] !== s) H.says.push(s); return s0(t, ...a); }; }
  H.hullOk = (x, z, h) => { const w = g.world, p = g.player, fx = Math.cos(h), fz = -Math.sin(h); return w.isReady(x, z) && w.shoreAt(x, z) < -1.2 && w.shoreAt(x + fx * 2.3, z + fz * 2.3) < -0.5 && w.shoreAt(x - fx * 2.3, z - fz * 2.3) < -0.5 && p.floats(x, z); };
  // the way out by the hull's own test: a 2 m lattice from (sx, sz) to the nearest point 40 m from every shore, or (a
  // river or a creek start) RIVER m of water paddled from the dock (a centre preference: cells under 2.5 m from a shore
  // cost 3)
  H.hullWay = (sx, sz, R = 2500, open = 40, RIVER = 1500) => {
    const w = g.world, C = 2, N = Math.round(2 * R / C), key = (i, j) => j * N + i, ox = sx - R, oz = sz - R;
    const cost = new Float32Array(N * N).fill(Infinity), prev = new Int32Array(N * N).fill(-1), dist = new Float32Array(N * N);
    const i0 = Math.round((sx - ox) / C), j0 = Math.round((sz - oz) / C); cost[key(i0, j0)] = 0;
    // a bucket queue (costs in whole steps)
    const B = [[i0, j0]]; let goal = null, nodes = 0;
    const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let c = 0; c < B.length && !goal && nodes < 900000; c++) {
      const bucket = B[c]; if (!bucket) continue;
      for (let b = 0; b < bucket.length && !goal; b += 2) {
        const i = bucket[b], j = bucket[b + 1], k = key(i, j); if (cost[k] < c) continue; nodes++;
        const x = ox + i * C, z = oz + j * C;
        if (w.shoreAt(x, z) <= -open || dist[k] >= RIVER) { goal = k; break; }
        for (const [a, d] of D8) {
          const ni = i + a, nj = j + d; if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const nk = key(ni, nj), nx = ox + ni * C, nz = oz + nj * C, h = Math.atan2(-d, a);
          if (!H.hullOk(nx, nz, h)) continue;
          const nc = c + (a && d ? 1.4 : 1) * (w.shoreAt(nx, nz) > -2.5 ? 3 : 1), ci = Math.ceil(nc);
          if (ci >= cost[nk]) continue; cost[nk] = ci; prev[nk] = k; dist[nk] = dist[k] + C * Math.hypot(a, d); (B[ci] || (B[ci] = [])).push(ni, nj);
        }
      }
    }
    if (goal == null) return { open: false, nodes };
    const pts = []; for (let k = goal; k !== -1; k = prev[k]) pts.push([ox + (k % N) * C, oz + Math.floor(k / N) * C]); pts.reverse();
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const gx = ox + (goal % N) * C, gz = oz + Math.floor(goal / N) * C;
    return { open: true, river: w.shoreAt(gx, gz) > -open, nodes, len: Math.round(len), pts };
  };
  // along a hull way by W (held by the rig): the heading set on a point 6 m ahead each frame, frames run by advance
  H.paddleWay = (pts, frames) => {
    const p = g.player, w = g.world; let k = 0, still = 0, stuck = [], last = [p.x, p.z], walked = 0, white = new Set();
    for (let f = 0; f < frames; f++) {
      while (k < pts.length - 1 && Math.hypot(pts[k][0] - p.x, pts[k][1] - p.z) < 6) k++;
      const q = pts[k], yaw = Math.atan2(-(q[1] - p.z), q[0] - p.x); p.heading = yaw; p.yawRate = 0;
      if (f % 20 === 19) g.step(1 / 30, 1); else g.advance(1 / 30, 1);
      if (p.mode !== 'paddle') return { k, of: pts.length, end: 'mode ' + p.mode, walked: Math.round(walked), stuck };
      const d = Math.hypot(p.x - last[0], p.z - last[1]); walked += d; last = [p.x, p.z];
      for (const q2 of (H.RP.whiteNear(p.x, p.z, 30) || [])) white.add(q2.w.id);
      if (d < 0.01) { if (++still === 60) stuck.push([Math.round(p.x), Math.round(p.z), k]); if (still > 600) return { k, of: pts.length, end: 'stuck', walked: Math.round(walked), stuck, white: [...white] }; } else still = 0;
      if (k === pts.length - 1 && Math.hypot(q[0] - p.x, q[1] - p.z) < (pts.length > 1 && window.__q.way && window.__q.way.river ? 8 : 5)) return { k, of: pts.length, end: 'reached', walked: Math.round(walked), stuck, white: [...white], sd: +w.shoreAt(p.x, p.z).toFixed(1), lake: w.lakeName(w.lakeIdAt(p.x, p.z)) };
    }
    return { k, of: pts.length, end: 'frames', walked: Math.round(walked), stuck, white: [...white] };
  };
  return true;
};


const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let page;
const shot = async (name, el = null) => { const f = path.join(SHOTS, `r5-final-${name}.png`); try { if (el) await page.locator(el).screenshot({ path: f }); else await page.screenshot({ path: f }); } catch (e) { log('shot failed', name, String(e).slice(0, 200)); } log('shot', f); return f; };
const ev = (fn, a) => page.evaluate(fn, a);
const real = (ms) => page.waitForTimeout(ms);
const until = (fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
const boot = async () => {
  await until(() => { const g = window.__game; return g && g.title && g.onboarding && g.truck && g.rides && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, 300000);
  await ev(HELPERS);
};
const inGame = async () => {
  await until(() => { const g = window.__game; return g && g.title && g.player && g.prewarmed && g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 300000);
  if (await ev(() => !window.__q)) await ev(HELPERS);
  if (await ev(() => window.__game.outfitter.open)) { await page.keyboard.press('Escape'); await real(300); }
  await ev(() => window.__q.step(20));
};
// a new season by the title's own buttons: Sandbox (the quiet button) or New season; the pin; the date; Start
const season = async (mode, home, doy = 191, tag = '') => {
  if (await ev(() => window.__game.title.state === 'game')) { await page.keyboard.press('Escape'); await real(700); }
  if (await ev(() => window.__game.title.state !== 'title')) await ev(() => window.__game.title.open('title'));
  await real(400);
  const btn = mode === 'sandbox' ? '#btn-sandbox' : '#btn-new';
  const vis = await ev((b) => { const e = document.querySelector(b); return !!(e && e.offsetParent !== null); }, btn);
  if (vis) await page.click(btn, { timeout: 8000 }).catch(() => ev((b) => document.querySelector(b).click(), btn)); else await ev((m) => window.__game.title.askNewSeason(m), mode);
  await real(600);
  if (await ev(() => window.__game.title.right === 'confirm')) { const c = await page.$('#btn-confirm, .confirm button'); if (c && await c.isVisible().catch(() => false)) await c.click(); else await ev(() => window.__game.title.confirmed()); await real(500); }
  await until(() => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0, null, 60000);
  await real(1500);
  const pins = await ev(() => [...document.querySelectorAll('.startmap .pin')].map((b) => Number(b.dataset.ep)));
  await shot(`startmap-${mode}${tag}`);
  await page.click(`.startmap .pin[data-ep="${home}"]`, { timeout: 8000 }).catch(() => ev((h) => document.querySelector(`.startmap .pin[data-ep="${h}"]`).click(), home));
  await ev((d) => { const w = window.__game.title.wizard; w.setDate(d); w.next(); }, doy);
  await real(400);
  await shot(`wizard-${mode}${tag}`);
  await page.click('#btn-start', { timeout: 8000 }).catch(() => ev(() => document.getElementById('btn-start').click()));
  await inGame();
  return { pins: pins.length, pinList: pins.slice(0, 120) };
};
const kit = () => ev(() => {
  const g = window.__game, inv = g.inventory, ob = g.onboarding, s = ob.state || {};
  try { g.guide.sync(); } catch { /* */ }
  const cur = g.guide.current ? g.guide.current() : null, list = g.guide.list ? g.guide.list() : [];
  let tr = null; try { tr = g.tracker.state(); } catch { /* */ }
  const cnt = (id) => inv.count(id, { reachable: false });
  return {
    mode: g.profile.mode, home: g.profile.home, loan: !!s.loan, done: !!s.done, step: s.step, noCanoe: ob.noCanoe, noPfd: g.canoe.noPfd ? !!g.canoe.noPfd() : null, pending: ob.pending(g.profile.home),
    hull: !!g.player.canoe.hull.visible, canoe: inv.containers.filter((c) => c.where === 'canoe').map((c) => c.item), containers: inv.containers.map((c) => `${c.item}@${c.where}`), long: inv.long.map((l) => `${l.id}@${l.where}`),
    pfd: cnt('pfd'), paddle: inv.long.filter((l) => /paddle|^ash|^bent|^beaver/.test(l.id)).length, meals: ob.meals(), leeches: cnt('leeches'), tent: cnt('aframe') + cnt('walttent'), stove: cnt('stove') + cnt('waltstove'), pot: cnt('pot'), bag: cnt('sleepingbag'), rod: inv.long.filter((l) => /^rod/.test(l.id)).length,
    money: g.profile.money, cur: cur ? `${cur.id}${cur.tutorial ? ' (tutorial)' : ''}` : null, list: list.map((e) => e.id).slice(0, 12), tracker: tr ? { shown: tr.shown, mode: tr.mode, text: (tr.text || '').slice(0, 140) } : null,
    chips: [...document.querySelectorAll('#chip, .chip, #hint, .hint-card, #tracker')].filter((e) => e.offsetParent !== null).map((e) => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 140)).filter(Boolean),
  };
});
const truckHome = () => ev(async () => {
  const g = window.__game, H = window.__q, T = g.truck, h = g.profile.home, S = T.spot(h);
  const o2 = { home: h, job: T.job && T.job.kind, parked: T.parkedAt, det0: S ? H.det(S.x, S.z) : null, t0: H.tyres() };
  if (!S) return o2;
  const t0 = performance.now(); while (H.det(S.x, S.z) > 2 && performance.now() - t0 < 40000) { H.step(3); await H.wait(40); }
  H.step(20);
  o2.det1 = H.det(S.x, S.z); o2.t1 = H.tyres(true, H.meshes(/^(terrain|trail)$/)); o2.worst = o2.t1 ? Math.max(...o2.t1.gaps.map(Math.abs)) : null;
  return o2;
});
const walkTo = async (q, stopAt = 1.6, maxMs = 25000) => {
  await page.keyboard.down('KeyW');
  const t0 = Date.now(); let r, prev = null, still = 0; const stuck = [];
  while (Date.now() - t0 < maxMs) {
    r = await ev(([q, stopAt]) => { const g = window.__game, H = window.__q, p = g.player; const y = H.yawTo(q); if (p.mode !== 'paddle') { g.chase.viewYaw = y; g.chase.forwardYaw = y; } else { p.heading = y; p.yawRate = 0; g.chase.viewYaw = y; g.chase.forwardYaw = y; } const d = Math.hypot(q.x - p.x, q.z - p.z); return { d: +d.toFixed(1), done: d < stopAt, mode: p.mode, x: +p.x.toFixed(1), z: +p.z.toFixed(1), sp: +(p.speed || 0).toFixed(2) }; }, [q, stopAt]);
    if (r.done) break;
    if (prev && Math.hypot(r.x - prev.x, r.z - prev.z) < 0.05) { still++; if (still === 20) stuck.push({ x: r.x, z: r.z, d: r.d }); } else still = 0;
    prev = r;
    await real(80);
  }
  await page.keyboard.up('KeyW'); await real(200);
  return { ...r, stuck, ms: Date.now() - t0 };
};
// along a list of waypoints by W (afloat or afoot): the furthest got, stuck spots, rapids passed near, notes said
const followBy = async (pts, maxMs = 90000, stopAt = 8) => {
  const t0 = Date.now(); const legs = [];
  await ev(() => { window.__q.notes.length = 0; window.__q.says.length = 0; window.__q.whiteHit = []; });
  for (const q of pts) {
    const left = maxMs - (Date.now() - t0); if (left <= 0) break;
    const r = await walkTo({ x: q[0], z: q[1] }, stopAt, Math.min(left, 30000));
    const w = await ev(() => { const g = window.__game, H = window.__q, p = g.player, wn = H.RP.whiteNear(p.x, p.z, 40) || []; return { white: wn.length, mode: p.mode, lake: g.world.lakeName(g.world.lakeIdAt(p.x, p.z)) || null }; });
    legs.push({ to: q.map(Math.round), d: r.d, stuck: r.stuck.length, ...w });
    if (r.stuck.length && r.d > stopAt * 2) break;
  }
  const after = await ev(() => ({ notes: window.__q.notes.slice(-6), says: window.__q.says.slice(-6), sign: window.__q.sign() }));
  return { legs, ms: Date.now() - t0, ...after };
};

const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2500)); };
try {
  page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(APP, { timeout: 180000 });
  await boot();
  // ======================== P: the parked truck, at once and on the 2 m ground ========================
  if (on('P')) {
    for (const home of (process.env.P_HOMES || '67,6,16,69,36,38,51,12,1').split(',').map(Number)) {
      await season('sandbox', home, 196, `-p-${home}`);
      if (await ev((h) => !window.__game.truck.spot(h), home)) { result(`P ${home}: no road to this store (no truck)`, true, {}); continue; }
      const r = await truckHome();
      const g0 = r.t0 ? Math.max(...r.t0.gaps.map(Math.abs)) : null;
      await ev(() => { const g = window.__game, T = g.truck, H = window.__q; if (T.mesh && T.mesh.visible) { const a = T.job && T.job.path ? 1 : 0; void a; H.standAt(T.x + 9, T.z + 9); H.aimAt({ x: T.x, z: T.z }, g.tiles.groundAt(T.x, T.z) + 0.8); H.step(8); } });
      await shot(`p-${home}`);
      result(`P ${home}: the parked truck on its tyres (at once ${g0}, on the 2 m ground ${r.worst})`, r.parked === String(home) && g0 != null && g0 <= 0.15 && r.worst != null && r.worst <= 0.15, r);
    }
  }
  // ======================== D: every home dock out to open water by paddling ========================
  if (on('D')) {
    for (const home of (process.env.D_HOMES || '6,16,36,67,69,1,12,25,31,38,40,49,51,64').split(',').map(Number)) {
      const r = { home };
      await season('sandbox', home, 196, `-d-${home}`);
      await real(1200);
      await ev(() => window.__q.closeAll());
      r.canoeAt = await ev(() => { const g = window.__game, d = g.player.carry && g.player.carry.drop, p = g.player, w = g.world; return d ? { x: +d.x.toFixed(1), z: +d.z.toFixed(1), from: Math.round(Math.hypot(d.x - p.x, d.z - p.z)), sd: +w.shoreAt(d.x, d.z).toFixed(1), lake: w.lakeName(w.lakeIdAt(d.x, d.z)) } : null; });
      if (!r.canoeAt) { result(`D ${home}: the canoe at the dock`, false, r); continue; }
      r.walk = await walkTo(r.canoeAt, 2.2, 40000);
      for (let t = 0; t < 3; t++) {
        await ev(() => { const g = window.__game, H = window.__q, d = g.player.carry.drop, p = g.player; H.aimAt(d, p.groundAt(d.x, d.z) + 0.2); H.step(6); });
        await page.keyboard.press('KeyE'); await real(1500);
        r.mode = await ev(() => window.__game.player.mode);
        if (r.mode === 'paddle') break;
        await ev(() => { const g = window.__game, H = window.__q, d = g.player.carry.drop; H.standAt(d.x + 1.5 * Math.cos(d.heading + Math.PI / 2), d.z - 1.5 * Math.sin(d.heading + Math.PI / 2)); H.step(4); });
      }
      if (r.mode !== 'paddle') { await shot(`d-${home}-board`); result(`D ${home}: into the canoe at the dock`, false, r); continue; }
      r.way = await ev(() => { const g = window.__game, p = g.player, W = window.__q.hullWay(p.x, p.z); window.__q.way = W; return W.open ? { open: true, river: W.river, len: W.len, nodes: W.nodes, lakes: [...new Set(W.pts.filter((_, i) => i % 10 === 0).map(([x, z]) => g.world.lakeName(g.world.lakeIdAt(x, z)) || String(g.world.lakeIdAt(x, z))))].slice(0, 8) } : W; });
      if (!r.way.open) { await shot(`d-${home}-in`); result(`D ${home}: a way out to open water from the dock`, false, r); continue; }
      await page.keyboard.down('KeyW');
      try { r.paddle = await ev((n) => window.__q.paddleWay(window.__q.way.pts, n), Math.min(30000, 600 + r.way.len * 25)); } finally { await page.keyboard.up('KeyW'); }
      await ev(() => { const g = window.__game; g.chase.viewPitch = 0.02; window.__q.step(4); });
      await shot(`d-${home}-out`);
      // (open water within 1.5 km of paddling, or a river or creek start paddled 1.5 km: Hog Creek, the Moose River; no
      // rapids passed within 30 m, never stuck for 2 s)
      result(`D ${home}: from the dock ${r.way.river ? '1.5 km down its river or creek' : 'out to open water'} by paddling (${r.way.len} m${r.way.lakes ? ', ' + r.way.lakes.join(' / ') : ''})`, r.paddle.end === 'reached' && !(r.paddle.white || []).length && !r.paddle.stuck.length, r);
    }
  }
  // ======================== B: a probe (no checks): the ground along a ride's way out, by its bridges ========================
  if (on('B')) {
    if (await ev(() => window.__game.title.state !== 'game')) await season('sandbox', 31, 196, '-b');
    for (const key of (process.env.B_KEYS || '80').split(',')) {
      const r = await ev(async (key) => {
        const g = window.__game, H = window.__q, T = g.truck, S = T.spot(key, true); if (!S) return { key, none: true };
        await H.tp(S.x, S.z); await H.goNear(S.x, S.z, 2, 40000);
        const out = [], R = H.R, P = S.path;
        let prev = null, worst = null;
        for (let s = S.s0; s < Math.min(P.len, S.s0 + 160); s += 0.5) {
          // the point s along: where the truck's wheels sample
          let lo = 0; while (lo < P.cum.length - 2 && P.cum[lo + 1] < s) lo++;
          const t = (s - P.cum[lo]) / Math.max(1e-6, P.cum[lo + 1] - P.cum[lo]), x = P.pts[lo][0] + (P.pts[lo + 1][0] - P.pts[lo][0]) * t, z = P.pts[lo][1] + (P.pts[lo + 1][1] - P.pts[lo][1]) * t;
          const gr = g.tiles.groundAt(x, z), dk = R.deckAt(g.world, x, z), y = Math.max(gr, dk);
          if (prev != null && (!worst || Math.abs(y - prev) > worst.step)) worst = { step: +Math.abs(y - prev).toFixed(2), s: +s.toFixed(1), x: Math.round(x), z: Math.round(z), ground: +gr.toFixed(2), deck: Number.isFinite(dk) ? +dk.toFixed(2) : null };
          prev = y;
          if (Math.round(s * 2) % 4 === 0) out.push([+s.toFixed(1), +gr.toFixed(2), Number.isFinite(dk) ? +dk.toFixed(2) : null]);
        }
        // the truck posed along it, its tyres read off its matrix against the ground there (as chk-r5's TR reads them)
        const sinks = [];
        for (let s = S.s0; s < Math.min(P.len, S.s0 + 600); s += 0.25) {
          T.pose(P, s);
          const e = T.mesh.matrix.elements, Q = (lx, lz) => [e[0] * lx + e[8] * lz + e[12], e[1] * lx + e[9] * lz + e[13], e[2] * lx + e[10] * lz + e[14]];
          const gaps = []; for (const a of [1.72, -1.63]) for (const sd of [-0.93, 0.93]) { const [x, y, z] = Q(sd, a); const gr = g.tiles.groundAt(x, z), dk = R.deckAt(g.world, x, z); gaps.push(+(y - (Number.isFinite(gr) ? Math.max(gr, dk) : dk)).toFixed(2)); }
          if (Math.min(...gaps) < -0.2) sinks.push([+s.toFixed(2), Math.round(T.x), Math.round(T.z), H.det(T.x, T.z), gaps, T.wheelY && T.wheelY.map((v) => +v.toFixed(2)), Number.isFinite(R.deckAt(g.world, T.x, T.z)) ? 'deck' : '']);
        }
        T.hide();
        return { key, det: H.det(S.x, S.z), worst, sinks: sinks.slice(0, 12), nSinks: sinks.length, prof: out.filter((q) => q[2] != null || out.some((w) => w[2] != null && Math.abs(w[0] - q[0]) < 8)) };
      }, key);
      log('B', JSON.stringify(r).slice(0, 4000));
    }
  }
  // ======================== R: rides and back home (chk-r5's TR hung going home after a ride, twice) ========================
  if (on('R')) {
    const home = Number(process.env.R_HOME || 67);
    await season('sandbox', home, 196, '-r');
    // a page that stops answering: paused by the debugger, its stack logged (the main thread busy in a loop)
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Debugger.enable');
    let stack = null;
    cdp.on('Debugger.paused', (e) => { stack = e.callFrames.slice(0, 18).map((f) => `${f.functionName || '(anon)'} ${String(f.url).replace(/^.*\/src\//, '')}:${f.location.lineNumber + 1}`); cdp.send('Debugger.resume').catch(() => null); });
    const timed = async (p, ms) => { let t; const r = await Promise.race([p, new Promise((ok) => { t = setTimeout(() => ok('node-timeout'), ms); })]); clearTimeout(t); if (r === 'node-timeout') { await cdp.send('Debugger.pause').catch(() => null); await real(3000); log('R stuck: the stack', JSON.stringify(stack)); } return r; };
    const state = () => ev(() => { const g = window.__game, p = g.player, t = g.tiles, w = g.world; const [tx, ty] = w.tileOf(p.x, p.z); let raf = 0; return { t: Math.round(performance.now()), mode: p.mode, tp: !!p.teleporting, title: g.title.state, veil: !!g.veil.active, card: !!(g.record && g.record.shown), open: !!g.outfitter.open, q: t.queue.length, pend: t.pending.length, ensured: [...t.tiles.values()].filter((e) => e.ensured).map((e) => `${e.key}:${e.state}`).slice(0, 6), drawn: g.renderer ? g.renderer.info.render.frame : null, truck: g.truck.job ? g.truck.job.kind : null, at: [Math.round(p.x), Math.round(p.z)], raf }; });
    for (const to of (process.env.R_EPS || '50,75,80,62').split(',').map(Number)) {
      const r = { to };
      // home: the counter, Drive to <to>
      r.home = await timed(ev(async () => { const g = window.__game, H = window.__q, L = g.outfitter.landing(g.profile.home); g.truck.hide(); const t0 = performance.now(); const ok = await Promise.race([H.tp(L.x, L.z).then(() => 'ok'), H.wait(120000).then(() => 'timeout')]); return { ok, ms: Math.round(performance.now() - t0) }; }), 150000);
      if (r.home === 'node-timeout') { r.stack = stack; result(`R home before the ride to ${to}: the page stopped answering`, false, r); break; }
      if (r.home.ok !== 'ok') { r.stuck = await state(); await real(3000); r.stuck2 = await state(); result(`R home before the ride to ${to}`, false, r); break; }
      await ev(() => { const g = window.__game, o = g.outfitter; o.show(o.landing(g.profile.home), 'counter'); window.__q.step(4); });
      await real(900);
      const btn = await page.$(`.rides button[data-act="ride"][data-id="${to}"]`);
      if (!btn) { result(`R no ride button to ${to}`, false, r); await page.keyboard.press('Escape'); continue; }
      await btn.scrollIntoViewIfNeeded().catch(() => null); await btn.click();
      await until(() => window.__game.veil.active || window.__game.player.teleporting, null, 20000).catch(() => null);
      await until(() => !window.__game.veil.active && !window.__game.player.teleporting, null, 240000).catch(() => null);
      r.arrived = await state();
      // the truck pulls out, frames by step (as chk-r5's TR)
      // (at about the wall clock's pace: 15 frames, then the page's own 0.4 s, so the chunks' builds land as in play)
      r.drive = await ev(async () => {
        const g = window.__game, H = window.__q, T = g.truck, R = H.R, o = { frames: 0, held: 0, sunk20: 0, worstSink: 0, worstAt: null, float10: 0 };
        for (let f = 0; f < 2400; f++) {
          if (f % 15 === 14) { g.step(1 / 30, 1); await H.wait(400); } else g.advance(1 / 30, 1);
          if (!T.job || T.job.kind !== 'leave' || !T.mesh.visible) break;
          if (T.job.wait > 0) continue;
          o.frames++; if (T.job.s <= (T.job.s0 ?? T.job.s) + 0.01 && T.job.v === 0) o.held++;
          const e = T.mesh.matrix.elements, gaps = [];
          for (const a of [1.72, -1.63]) for (const sd of [-0.93, 0.93]) { const x = e[0] * sd + e[8] * a + e[12], y = e[1] * sd + e[9] * a + e[13], z = e[2] * sd + e[10] * a + e[14], gr = g.tiles.groundAt(x, z), dk = R.deckAt(g.world, x, z); gaps.push(y - (Number.isFinite(gr) ? Math.max(gr, dk) : dk)); }
          const mn = Math.min(...gaps); if (mn < -0.2) o.sunk20++; if (mn > 0.1) o.float10++; if (mn < o.worstSink) { o.worstSink = +mn.toFixed(2); o.worstAt = [Math.round(T.job.s), Math.round(T.x), Math.round(T.z), H.det(T.x, T.z)]; }
        }
        return o;
      });
      r.after = await state();
      result(`R ride to ${to} and the truck away on its tyres (sunk past 0.2 m ${r.drive.sunk20} frames, afloat past 0.1 m ${r.drive.float10})`, r.drive.sunk20 <= 2 && r.drive.float10 <= 2, r);
    }
    // and home once more
    const fin = await ev(async () => { const g = window.__game, H = window.__q, L = g.outfitter.landing(g.profile.home); const ok = await Promise.race([H.tp(L.x, L.z).then(() => 'ok'), H.wait(120000).then(() => 'timeout')]); return ok; });
    result('R home at the end', fin === 'ok', { fin, state: await state() });
  }
  // ======================== C: the contact sheet's shots (no checks) ========================
  if (on('C')) {
    const third = () => ev(() => { const g = window.__game; if (g.chase.mode !== 'third' && g.chase.setMode) g.chase.setMode('third'); });
    const noon = () => ev(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 11.5); window.__q.step(30); });
    // a Sandbox season at Pitcher Plant (67, moved onto Bog Lake): the store's dock, the canoe at it, the lake ahead
    await season('sandbox', 67, 196, '-c');
    await real(1500); await ev(() => window.__q.closeAll()); await third(); await noon();
    await ev(async () => { const g = window.__game, H = window.__q, d = g.player.carry.drop, L = g.outfitter.landing(67); const back = Math.atan2(-(L.z - d.z), L.x - d.x); H.standAt(d.x - Math.cos(back) * 7 + 2, d.z + Math.sin(back) * 7); H.aimAt(L, g.tiles.groundAt(d.x, d.z) - 1); g.chase.viewPitch = -0.12; H.step(40); });
    await shot('c-sandbox-67');
    // the start map (the season wizard's) and the book's map
    await page.keyboard.press('KeyI'); await real(900);
    await ev(() => { const b = [...document.querySelectorAll('button, [role=tab], .tab')].find((e) => e.offsetParent !== null && e.textContent.trim().toLowerCase() === 'map'); if (b) b.click(); });
    await real(1800);
    await shot('c-map-book');
    await page.keyboard.press('KeyI'); await real(500);
    if (await ev(() => window.__game.title.state === 'pause')) await ev(() => window.__game.title.resume());
    await ev(() => window.__q.closeAll());
    // stood on land by the helpers alone (no teleport: that puts you afloat in your canoe), the canoe left at the dock
    const standLook = (a, f, pitch = -0.08) => ev(async ([a, f, pitch]) => { const g = window.__game, H = window.__q; H.closeAll(); await H.goNear(a[0], a[1], 2, 45000); for (let k = 0; k < 20; k++) { H.step(4); await H.wait(30); } H.standAt(a[0], a[1]); H.aimAt({ x: f[0], z: f[1] }, null); g.chase.viewPitch = pitch; g.day.setClock(g.day.year, g.day.doy, 11.5); H.step(40); return { mode: g.player.mode, at: [Math.round(g.player.x), Math.round(g.player.z)] }; }, [a, f, pitch]);
    // the roads outside the wilderness: Ely's streets and the Gunflint Trail, stood on the road and looking along it
    for (const [tag, lat, lon, k] of [['ely', 47.9033, -91.8668, 14], ['gunflint', 47.988, -90.349, 14], ['echo', 47.949, -91.874, 14]]) {
      const q = XZ(lat, lon), b = nearChain(q.x, q.z, 2500, [1, 2]);
      if (!b) { log('no road at', tag); continue; }
      const c = b.c, i = Math.min(b.i, c.n - 1 - k), a = [c.p[i * 4], c.p[i * 4 + 1]], f = [c.p[(i + k) * 4], c.p[(i + k) * 4 + 1]];
      log('road', tag, JSON.stringify(await standLook(a, f)));
      await third(); await real(400);
      await shot(`c-road-${tag}`);
    }
    // the truck on its road close up: set on Ely's road (the pose the game gives it, on its four wheels), seen from beside
    {
      const q = XZ(47.9033, -91.8668), b = nearChain(q.x, q.z, 2500, [1, 2]), c = b.c, i = Math.min(b.i, c.n - 1 - 20), pts = [];
      for (let k = i; k <= i + 20; k++) pts.push([c.p[k * 4], c.p[k * 4 + 1]]);
      const r = await ev(async (pts) => {
        const g = window.__game, H = window.__q, T = g.truck, cum = [0];
        for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
        const path = { pts, cum, len: cum[cum.length - 1] }, s = path.len / 2;
        T.hide(); T.setRack(true); T.pose(path, s); T.job = { kind: 'park', key: 'look', path, s, v: 0 }; T.parkedAt = 'look';
        const fx = pts[pts.length - 1][0] - pts[0][0], fz = pts[pts.length - 1][1] - pts[0][1], L = Math.hypot(fx, fz), ux = fx / L, uz = fz / L;
        const vx = T.x - ux * 7 + uz * 6, vz = T.z - uz * 7 - ux * 6;
        H.closeAll(); await H.goNear(vx, vz, 2, 45000); for (let k = 0; k < 20; k++) { H.step(4); await H.wait(30); }
        H.standAt(vx, vz); H.aimAt({ x: T.x, z: T.z }, g.tiles.groundAt(T.x, T.z) + 0.6); g.chase.viewPitch = -0.12; g.day.setClock(g.day.year, g.day.doy, 11.5); H.step(40);
        return { at: [Math.round(T.x), Math.round(T.z)], gap: T.gap, visible: T.mesh.visible };
      }, pts);
      log('truck', JSON.stringify(r));
      await third(); await real(400);
      await shot('c-truck');
    }
    // two cabins' docks, from the bank by the dock's foot, the open water ahead
    for (const i of [22, 3]) {
      const c = CABINS[i], D = c.dock; if (!D) continue;
      log('cabin', i, JSON.stringify(await standLook([D.x - D.dx * 2 + D.dz * 3, D.z - D.dz * 2 - D.dx * 3], [D.x + D.dx * 40, D.z + D.dz * 40], -0.1)));
      await third(); await real(300);
      await shot(`c-cabin-${i}`);
    }
  }
} catch (e) {
  log('ERROR', e && e.stack || e);
  result('the run', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  result('no page errors', !errors.length, { errors: errors.slice(0, 5) });
  writeFileSync(OUT, JSON.stringify({ results, errors }, null, 1));
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
log(`r5-final: ${results.length - failed.length}/${results.length} pass`);
process.exit(failed.length ? 1 : 0);
