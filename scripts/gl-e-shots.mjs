// Stream E (gl-e): screenshots of the people (docs/build/shots/e-*.png). Moose Lake, Saturday 11 July 2026.
//   npx vite --port 5185 --strictPort &   node scripts/gl-e-shots.mjs [--out docs/build/shots]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch, openGame, seasonAt, step, log } from './gl-e-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('out', 'docs/build/shots'));
mkdirSync(OUT, { recursive: true });
const YEAR = 2026, DOY = 192;
const browser = await launch();
try {
  const page = await openGame(browser, { width: 1440, height: 900, quiet: true });
  await seasonAt(page, { ep: 25, year: YEAR, doy: DOY, hours: 7.5 });
  // the busiest morning hour in the store, and a party with a site tonight to follow
  const busy = await page.evaluate(({ year, doy }) => {
    const g = window.__game, N = g.npcs, P = g.parties; let best = 8.4, n = -1;
    for (let h = 7.5; h <= 11.5; h += 0.05) { const k = N.storeParties(25, P.today, h).filter((e) => e.dir === 'in').reduce((a, e) => a + Math.min(3, e.party.size), 0); if (k > n) { n = k; best = h; } }
    g.day.setClock(year, doy, best); return { h: best, n };
  }, { year: YEAR, doy: DOY });
  log('busiest', busy);
  await step(page, 400);
  // 1 the store: first person, a step inside the door, looking toward the counter
  await page.evaluate(() => { const g = window.__game, L = g.outfitter.visit.L, p = g.player, X = L.axes.a, Z = L.axes.b; g.chase.setMode('first'); p.x = L.centre.x + Z.x * 3.3 + X.x * -0.25; p.z = L.centre.z + Z.z * 3.3 + X.z * -0.25; p.heading = L.door.heading - 0.12; g.step(1 / 30, 90); });
  await step(page, 240);
  await page.screenshot({ path: path.join(OUT, 'e-store.png') }); log('e-store.png');
  // 3 the dock: third person on the yard, the rest of a crew loading
  await page.evaluate(() => {
    const g = window.__game, L = g.outfitter.visit.L, p = g.player, q = L.dockFoot, t = L.dockDeck, dl = Math.hypot(t.x - q.x, t.z - q.z) || 1, dx = (t.x - q.x) / dl, dz = (t.z - q.z) / dl;
    g.chase.setMode('third'); p.x = q.x - dx * 3 - dz * 7; p.z = q.z - dz * 3 + dx * 7; const mx = (q.x + t.x) / 2, mz = (q.z + t.z) / 2; p.heading = Math.atan2(-(mz - p.z), mx - p.x); g.step(1 / 30, 60);
  });
  await step(page, 240);
  await page.screenshot({ path: path.join(OUT, 'e-dock.png') }); log('e-dock.png');
  // 2 a word with one of them on the dock, over your shoulder: where they are headed (their own trip)
  const talk = await page.evaluate(() => {
    const g = window.__game, N = g.npcs, p = g.player, all = [];
    for (const v of N.at(25)) if (v.inParty) v.figs.forEach((f, i) => { if (f.where === 'dock' && !f.path) all.push({ v, i, d: Math.hypot(f.x - p.x, f.z - p.z) }); });
    all.sort((a, b) => a.d - b.d);
    const c = all[0]; if (!c) return null;
    const f = c.v.figs[c.i], k = 2.2 / Math.max(0.1, c.d); p.x = f.x + (p.x - f.x) * k; p.z = f.z + (p.z - f.z) * k; p.heading = Math.atan2(-(f.z - p.z), f.x - p.x); g.step(1 / 30, 20);
    N.talkTo(c.v, c.i); g.step(1 / 30, 30); g.dialogue.choose(0); return { key: c.v.key, id: c.v.partyId, fig: c.i };
  });
  await step(page, 150);
  log('talk state', await page.evaluate(({ key, fig }) => { const g = window.__game, s = g.npcs.figState(key, fig), p = g.player; return { act: s.act, held: s.held, d: Math.hypot(s.x - p.x, s.z - p.z) }; }, { key: talk && talk.key, fig: talk && talk.fig }));
  await page.screenshot({ path: path.join(OUT, 'e-talk.png') }); log('e-talk.png', talk);
  await page.evaluate(() => { const D = window.__game.dialogue; if (D.talking) D.close(); });
  // 4 that evening at their camp: they know you from the store
  const camp = await page.evaluate(async ({ id, year, doy }) => {
    const g = window.__game, P = g.parties, p = P.entering(25, P.today).find((x) => x.id === id) || P.entering(25, P.today).find((x) => x.stays.length && P.block(x.stays[0].start).site.get(x.stays[0]) >= 0);
    const s = p.stays[0], i = P.block(s.start).site.get(s); if (i == null || i < 0) return null;
    if (!g.npcs.metOf(p.id)) g.npcs.s.met[p.id] = { abs: P.today, ep: 25, where: 'Moose Lake', exit: p.exit, told: null };
    const c = g.world.campsites[i], lid = P.stayLake(s), l = g.world.lakes[lid - 1];
    g.day.setClock(year, doy, 19.3);
    const k = 50 / Math.max(1, Math.hypot(l.cx - c.x, l.cz - c.z)), x = c.x + (l.cx - c.x) * k, z = c.z + (l.cz - c.z) * k;
    const ok = await g.player.teleport(x, z); g.player.heading = Math.atan2(-(c.z - g.player.z), c.x - g.player.x);
    return { ok, id: p.id };
  }, { id: talk && talk.id, year: YEAR, doy: DOY });
  for (let k = 0; k < 14 && camp && camp.ok; k++) {
    await step(page, 45);
    const r = await page.evaluate(({ id }) => { const g = window.__game, C = g.partyCamps, D = [...C.drawn.values()].find((x) => x.party.id === id), p = g.player; if (D && D.d > 45) { const dx = D.site.x - p.x, dz = D.site.z - p.z, d = Math.hypot(dx, dz); p.x += (dx / d) * 8; p.z += (dz / d) * 8; p.heading = Math.atan2(-dz, dx); } return { greeted: C.greeted.get(id) === g.parties.today, d: D ? D.d : null }; }, { id: camp.id });
    if (r.greeted) { await step(page, 20); break; }
  }
  await page.screenshot({ path: path.join(OUT, 'e-camp.png') }); log('e-camp.png', camp);
} finally {
  await browser.close();
}
