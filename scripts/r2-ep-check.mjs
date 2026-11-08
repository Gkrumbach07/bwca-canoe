#!/usr/bin/env node
// Round 2, entry points true to life: every entry point checked against how it starts in real life (src/ep-fixes.json,
// scripts/ep-fixes.mjs; the facts in docs/build/entry-points.md). Prints a table, one row per entry point:
//   lot       a portage-first start's lot on dry ground (the release's shore distance >= LOT_R + 2 at its centre)
//   put-in    the landing on water (shore distance < 0 at the put-in, its lake the record's), within reach of the lot or
//             of the landing: a lake/river/paddle start's within 30 m of water; a share's the host's
//   opening   a portage-first start's opening portage within 150 m of the lot (where the lot joins it), its carry within
//             25 % of the Forest Service's rods (a clipped one, its lot off the map's edge, reported, not failed)
//   lake      the first lake by name: the put-in's lake (or its far side) is the one the permit names
// With --play (the Vite server at APP, default http://localhost:5212): in the game, each portage-first start's trailhead
// built at its lot (a drive there by rides.js toLot), you standing in the lot on dry ground with the canoe set down on
// land, and the trailhead's layout where the table says; then EP 4 played for real: the boat drop at the Burntside end,
// the canoe shouldered, the whole carry walked to Crab Lake, the canoe put in on Crab.
//   node scripts/r2-ep-check.mjs [--play] [--eps 4,19] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { loadData, nearestOn, lineLen, ROOT, RODS } from './ep-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const D = loadData(path.resolve(arg('--data', path.join(ROOT, 'public/data'))));
const F = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/ep-fixes.json'), 'utf8'));
const ONLY = arg('--eps', null) ? new Set(arg('--eps').split(',').map(Number)) : null;
const LOT_R = 7;
if (F.for !== D.index.source.baked) { console.error('ep-fixes.json is for another release'); process.exit(2); }
// the table applied as world.js applyEpFixes applies it
const I = D.index, portages = I.portages.map((p) => ({ ...p })), lakes = new Map();
for (const L of F.lakes) lakes.set(L.id, L.displayName);
const lakeName = (id) => lakes.get(id) || D.lakeName(id);
for (const q of F.portages) { const p = portages[q.i]; if (q.renameOnly) { if (q.name) p.name = q.name; if (q.posted) p.posted = q.posted; } else portages[q.i] = { ...q }; }
const eps = I.entryPoints.map((e) => ({ ...e }));
for (const r of F.entryPoints) { const e = eps.find((q) => q.ep === r.ep); Object.assign(e, { name: r.name, start: r.start }); if (Number.isFinite(r.x)) Object.assign(e, { x: r.x, z: r.z, lake: r.lake }); for (const k of ['lot', 'open', 'shares', 'head', 'drop', 'clipped']) if (r[k] != null) e[k] = r[k]; }
// the first wilderness lake (or river) each permit names (recreation.gov; the research table in docs/build/entry-points.md)
const FIRST = { 1: 'Lake Vermilion|Trout', 4: 'Crab', 6: 'Slim', 7: 'Big Lake', 8: 'Moose River', 9: 'Little Indian Sioux', 12: 'Crane|Little Vermilion', 14: 'Little Indian Sioux', 16: 'Moose River', 19: 'Stuart', 20: 'Angleworm', 22: 'Mudro', 24: 'Fall', 25: 'Moose Lake', 26: 'Wood', 27: 'Snowbank', 29: 'Ojibway|Kawishiwi', 30: 'Lake One', 31: 'Farm', 32: 'Kawishiwi', 33: 'Little Gabbro', 34: 'Island River', 35: 'Isabella', 36: 'Hog Creek', 37: 'Kawishiwi', 38: 'Sawbill', 39: 'Baker', 40: 'Homer', 41: 'Brule', 43: 'Bower Trout', 44: 'Ram', 45: 'Morgan', 47: 'Poplar', 48: 'Poplar', 49: 'Poplar', 50: 'Cross River', 51: 'Round', 52: 'Round', 54: 'Sea ?Gull', 55: 'Gull|Saganaga', 57: 'Gunflint', 58: 'Gunflint', 60: 'West Bearskin', 61: 'West Bearskin', 62: 'Clearwater', 64: 'East Bearskin', 66: 'East Bearskin', 67: 'Bog', 68: 'McFarland', 69: 'Little John', 70: 'Little John', 75: 'Little Isabella', 77: 'South Hegman', 80: 'Larch', 84: 'Snake' };
const OUT = new Set([51, 64, 49, 69, 40, 38, 36, 67, 25, 31, 6, 16, 1, 12]);

const rows = [], fails = [];
for (const e of eps) {
  if (ONLY && !ONLY.has(e.ep)) continue;
  const s = e.head ? { ...e.head } : e, R = { ep: e.ep, name: e.name, start: e.start || '?', how: e.shares ? `shares ${e.shares}` : e.head ? 'own start apart from the store' : OUT.has(e.ep) ? 'at the store' : 'trailhead', lot: '', put: '', open: '', lake: '', fail: [] };
  // put-in
  const sd = D.shoreAt(s.x, s.z), lk = D.lakeAt(s.x, s.z);
  const wet = sd < 0 || (D.waterNear(s.x, s.z, 30, 0, 0) || null);
  R.put = `${lakeName(s.lake)} sd ${sd.toFixed(1)}`;
  if (!wet) R.fail.push('put-in not on water');
  if (sd < 0 && lk && lk !== s.lake && D.basinOf(lk) !== D.basinOf(s.lake)) R.fail.push(`put-in on another water (${lk})`);
  if (s.lot) {
    const lsd = D.shoreAt(s.lot.x, s.lot.z);
    R.lot = `${Math.round(s.lot.x)},${Math.round(s.lot.z)} sd ${lsd.toFixed(0)}`;
    if (!(lsd >= LOT_R + 2)) R.fail.push(`lot not dry (sd ${lsd.toFixed(1)})`);
    const o = s.open, p = o && portages[o.i];
    if (!p) R.fail.push('no opening portage');
    else {
      const n = nearestOn(p.pts, s.lot.x, s.lot.z), total = lineLen(p.pts), carry = o.end === 1 ? total - n.along : n.along, rods = carry / RODS;
      const off = o.posted ? (rods - o.posted) / o.posted : 0;
      R.open = `"${p.name}" ${Math.round(rods)}r of ${o.posted}r (${off >= 0 ? '+' : ''}${Math.round(off * 100)}%), ${Math.round(n.d)} m from the lot`;
      if (n.d > 150) R.fail.push(`opening portage ${Math.round(n.d)} m from the lot`);
      if (o.posted && Math.abs(off) > 0.25) (e.clipped ? R.fail.push.bind({ push: () => R.open += ' [clipped by the map edge]' }) : (x) => R.fail.push(x))(`carry ${Math.round(rods)}r against ${o.posted}r`);
      if (e.clipped && Math.abs(off) <= 0.25) R.open += ' [lot clipped to the map edge]';
      const far = p.launch[o.end];
      if (far.road) R.fail.push('the lake end is a road end');
      if (Math.hypot(far.x - s.x, far.z - s.z) > 40) R.fail.push('put-in is not the carry\'s lake end');
    }
  } else if (e.start === 'portage') R.fail.push('portage-first with no lot');
  // first lake
  const want = FIRST[e.ep], got = lakeName(s.lake) || '';
  R.lake = got;
  if (want && !new RegExp(want, 'i').test(got)) R.fail.push(`first lake "${got}", wanted /${want}/`);
  rows.push(R);
  if (R.fail.length) fails.push(R);
}
const pad = (v, n) => String(v).padEnd(n).slice(0, n);
console.log(pad('EP', 4), pad('name', 30), pad('start', 8), pad('how', 22), pad('lot', 22), pad('put-in', 30), 'opening / problems');
for (const R of rows) console.log(pad(R.ep, 4), pad(R.name, 30), pad(R.start, 8), pad(R.how, 22), pad(R.lot, 22), pad(R.put, 30), R.open, R.fail.length ? `  FAIL: ${R.fail.join('; ')}` : '');
const kinds = rows.reduce((m, r) => ((m[r.start] = (m[r.start] || 0) + 1), m), {});
console.log(`\n${rows.length} entry points: ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}; ${rows.length - fails.length} pass, ${fails.length} fail`);

let play = null;
if (process.argv.includes('--play')) play = await playChecks(eps.filter((e) => (e.head || e).lot && (!ONLY || ONLY.has(e.ep))).map((e) => e.ep));
if (arg('--json', null)) fs.writeFileSync(arg('--json'), JSON.stringify({ rows, play }, null, 1));
process.exit(fails.length || (play && play.fails) ? 1 : 0);

// --- in the game ---------------------------------------------------------------------------------------------------
async function playChecks(lotEps) {
  process.env.APP = process.env.APP || 'http://localhost:5212'; // (the stream's port; APP for another)
  const { launch, openGame, seasonAt, step, log } = await import('./gl-e-lib.mjs');
  const browser = await launch();
  const res = { lots: [], ep4: null, fails: 0 };
  try {
    const page = await openGame(browser, { quiet: true });
    await seasonAt(page, { ep: 6, year: 2026, doy: 180, hours: 9 });
    // each lot: driven there (rides.js toLot), the arrival puts you in the lot with the canoe dry beside you
    for (const n of lotEps) {
      const r = await page.evaluate(async (n) => {
        const g = window.__game, o = g.outfitter, R = g.rides, we = g.world.entryPoints.find((q) => q.ep === n);
        // (an outfitter's entry point's own start: a drive goes to its store, so you are set in its lot to see it built)
        const head = !!we.head, to = head ? { ...o.entry(n), lot: we.head.lot } : o.entry(n);
        const ok = to.lot ? await R.toLot(to) : await R.teleport(to.x, to.z);
        if (!head) o.arrival = { why: 'ride', ep: n, t: 0 };
        return { ok, lot: to.lot, head };
      }, n);
      // the tiles' props in (the trailhead's layout), the arrival done
      let st = null;
      for (let k = 0; k < 40; k++) {
        await step(page, 30, 1 / 30);
        st = await page.evaluate((n) => {
          const g = window.__game, T = g.trailhead.trailheadLayout(n), p = g.player, w = g.world;
          if (!T || g.outfitter.arrival) return { wait: true };
          const hull = p.carry && p.carry.drop;
          return { T: { lot: T.lot, water: T.water, sign: T.sign, start: T.start, drop: T.drop }, me: { x: p.x, z: p.z, mode: p.mode, sd: w.shoreAt(p.x, p.z) }, hull: hull ? { x: hull.x, z: hull.z, sd: w.shoreAt(hull.x, hull.z) } : null, at: g.trailhead.trailheadAt(p.x, p.z) ? g.trailhead.trailheadAt(p.x, p.z).where : null };
        }, n);
        if (!st.wait) break;
      }
      const f = [];
      if (st.wait) f.push('no trailhead built / arrival not done');
      else {
        if (r.head) { if (!st.T.water.dry) f.push('the head\'s canoe spot is not dry'); }
        else if (st.me.mode !== 'walk') f.push(`mode ${st.me.mode}`);
        if (!(st.me.sd > 0.5)) f.push(`standing in water (sd ${st.me.sd})`);
        if (st.at !== 'lot' && !r.head) f.push(`not in the lot (${st.at})`);
        if (r.lot && !r.head && !(st.hull && st.hull.sd > 0.3)) f.push('canoe not on dry ground');
        if (r.lot && Math.hypot(st.T.lot.x - r.lot.x, st.T.lot.z - r.lot.z) > 1) f.push('lot not at the table\'s');
      }
      res.lots.push({ ep: n, ok: !f.length, f, st });
      if (f.length) res.fails++;
      log(`EP ${n}: ${f.length ? 'FAIL ' + f.join('; ') : 'ok'} ${st && st.me ? `you (${st.me.x.toFixed(0)},${st.me.z.toFixed(0)}) sd ${st.me.sd.toFixed(1)}, canoe sd ${st.hull ? st.hull.sd.toFixed(1) : '-'}` : ''}`);
    }
    if (!ONLY || ONLY.has(4)) res.ep4 = await playEp4(page, step, log);
    if (res.ep4 && !res.ep4.ok) res.fails++;
  } finally { await browser.close(); }
  return res;
}
// EP 4 for real: the drive (a counter's ride, rides.js arrive), the canoe shouldered (Q on the hull), walked along the
// Crab Lake portage at the walker's own pace, launched onto Crab at its end (E)
async function playEp4(page, step, log) {
  const out = { ok: false, steps: [] };
  const say = (s) => { out.steps.push(s); log('EP 4:', s); };
  const a = await page.evaluate(async () => {
    const g = window.__game, o = g.outfitter, R = g.rides, from = o.entry(6), to = o.entry(4);
    const ok = await R.arrive(from, to, { km: 20, hours: 0.5, price: 0 }, null);
    return { ok, to: { lot: to.lot, name: to.name } };
  });
  say(`the drive: ${a.ok ? 'arrived' : 'refused'} at ${a.to.name}`);
  for (let k = 0; k < 40; k++) { await step(page, 30, 1 / 30); if (await page.evaluate(() => !window.__game.outfitter.arrival && !!window.__game.trailhead.trailheadLayout(4))) break; }
  let s = await page.evaluate(() => { const g = window.__game, p = g.player, d = p.carry && p.carry.drop; return { mode: p.mode, x: p.x, z: p.z, drop: d, sd: g.world.shoreAt(p.x, p.z), note: g.hud && g.hud.lastNote ? g.hud.lastNote : null }; });
  say(`in the lot: mode ${s.mode}, at (${s.x.toFixed(0)},${s.z.toFixed(0)}) sd ${s.sd.toFixed(1)}, canoe ${s.drop ? `on the ground at (${s.drop.x.toFixed(0)},${s.drop.z.toFixed(0)})` : 'missing'}`);
  if (s.mode !== 'walk' || !s.drop) return out;
  // walk to the hull and shoulder it (Q, as a player does); a trip card the drive left up put away first
  await page.evaluate(() => { const g = window.__game, p = g.player; if (g.record && g.record.shown) g.record.close(); if (g.cards && g.cards.shown && g.cards.close) g.cards.close(); });
  await page.evaluate(() => { const g = window.__game, p = g.player, d = p.carry.drop; p.x = d.x - Math.cos(d.heading) * 0.2; p.z = d.z + Math.sin(d.heading) * 0.2; p.placeOnGround(); p.pickUpHull(); });
  s = await page.evaluate(() => window.__game.player.mode);
  say(`shouldered: mode ${s}`);
  if (s !== 'carry') return out;
  // walk the trail: the keys held, the heading set toward the next point along the portage each frame chunk
  const tr = await page.evaluate(() => { const g = window.__game, p = g.player, w = g.world, P = w.portages[591], t = p.trailFor(P); return { n: t.pts.length, len: t.length, rods: P.rods, posted: P.posted, name: P.name }; });
  say(`the carry: "${tr.name}", ${tr.posted || tr.rods} rods posted, ${Math.round(tr.len)} m drawn`);
  let walked = 0, t0 = await page.evaluate(() => window.__game.day.hours), last = null, stuck = 0;
  for (let k = 0; k < 400; k++) {
    const r = await page.evaluate(() => {
      const g = window.__game, p = g.player, w = g.world, P = w.portages[591], t = p.trailFor(P), n = p.nearestOnTrail(t, p.x, p.z);
      // the point 6 m on toward the Crab Lake end (pts[0] is Crab's: the trail runs Crab → Burntside)
      const along = Math.max(0, n.along - 6); let i = 0; while (i < t.cum.length - 1 && t.cum[i] < along) i++;
      const q = t.pts[i]; p.heading = Math.atan2(-(q[1] - p.z), q[0] - p.x);
      if (p.chase) { p.chase.viewYaw = p.heading; p.chase.forwardYaw = p.heading; }
      p.input.down.add('KeyW'); if (g.record && g.record.shown) g.record.close();
      g.step(1 / 30, 30);
      return { x: p.x, z: p.z, mode: p.mode, along: n.along, d: n.dist, left: n.along };
    });
    if (r.mode !== 'carry') { say(`the canoe came down on the way (mode ${r.mode}) at ${Math.round(r.left)} m from Crab Lake`); break; }
    if (last) { walked += Math.hypot(r.x - last.x, r.z - last.z); stuck = Math.hypot(r.x - last.x, r.z - last.z) < 0.2 ? stuck + 1 : 0; }
    last = r;
    if (stuck > 8) { say(`stuck at ${Math.round(r.left)} m from Crab (${r.x.toFixed(0)},${r.z.toFixed(0)}), ${r.d.toFixed(1)} m off the trail`); break; }
    if (r.left < 4) break;
  }
  await page.evaluate(() => window.__game.player.input.down.delete('KeyW'));
  const h1 = await page.evaluate(() => window.__game.day.hours);
  s = await page.evaluate(() => { const g = window.__game, p = g.player; return { mode: p.mode, x: p.x, z: p.z, prompt: p.prompt ? p.prompt.text || JSON.stringify(p.prompt) : null }; });
  say(`at the Crab end: walked ${Math.round(walked)} m in ${((h1 - t0) * 60).toFixed(0)} game minutes, mode ${s.mode}, prompt ${JSON.stringify(s.prompt)}`);
  // E: launch onto Crab Lake
  await page.evaluate(() => { const g = window.__game; g.player.input.once.add('KeyE'); g.player.input.down.add('KeyE'); g.step(1 / 30, 2); g.player.input.down.delete('KeyE'); g.step(1 / 30, 30); });
  s = await page.evaluate(() => { const g = window.__game, p = g.player, w = g.world, id = w.lakeIdAt(p.x, p.z); return { mode: p.mode, lake: id, name: w.lakeName(id) }; });
  say(`put in: mode ${s.mode} on ${s.name}`);
  out.ok = s.mode === 'paddle' && /Crab/.test(s.name || '') && walked > 1500;
  out.walked = Math.round(walked); out.minutes = +((h1 - t0) * 60).toFixed(0);
  return out;
}
