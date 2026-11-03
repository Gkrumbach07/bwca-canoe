#!/usr/bin/env node
// d2 join: every table in src/migrate.js (src/migrate/*.json, scripts/migrate-table.mjs) checked against the releases
// it joins (docs/migration.md). For each live release a season may come from (v3, v4, v5, v6, v7-water, v8) it checks the whole table
// against the two indices (every mapped lake the same water: its OpenStreetMap id, or under the old one's cells; every
// site at its place; every trail with its ends), then builds a season as the game writes it on that release (Lake One
// and its neighbours paddled and inked, nights at Lake One sites and at one the new bake moved, portages walked, a
// catch, notices on the board, the record, a pack set down at a portage), runs it through migrateSeason with a
// stand-in localStorage and the new index, and checks that every lake, site and trail it names is the same one there.
// Then: Lake One's id in each release; a second load leaves a season alone; the damaged seasons (v3 and v4 numbers
// stamped v6, and a stamp no table knows) carried by their names; a season whose release has no table to the one
// loaded left as it is and NOT stamped; a rebake of the new release with the same numbers.
//
//   node scripts/migrate-check.mjs --v3 <dir> --v4 <dir> --v5 <dir> --v6 <dir> --v7 <dir> --v8 <dir> --to <dir>   (each: a dir with index.json)
//     [--fixture out.json]   (the v4 season's keys stamped v4, for a browser check with the save in localStorage)
import fs from 'node:fs';
import path from 'node:path';
import { migrateSeason, migrateKeys, mapperOf, MARK, TABLES, seasonNames } from '../src/migrate.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const here = path.dirname(new URL(import.meta.url).pathname);
const readIdx = (d) => JSON.parse(fs.readFileSync(fs.statSync(d).isDirectory() ? path.join(d, 'index.json') : d, 'utf8'));
const need = ['--v3', '--v4', '--v5', '--v6', '--v7', '--v8', '--to'];
if (need.some((k) => !arg(k))) { console.error(`usage: node scripts/migrate-check.mjs ${need.map((k) => `${k} <dir>`).join(' ')} [--fixture out.json]`); process.exit(1); }
const R = { v3: readIdx(arg('--v3')), v4: readIdx(arg('--v4')), v5: readIdx(arg('--v5')), v6: readIdx(arg('--v6')), v7: readIdx(arg('--v7')), v8: readIdx(arg('--v8')) };
const B = readIdx(arg('--to'));
const fixes = JSON.parse(fs.readFileSync(path.join(here, '../src/world-fixes.json'), 'utf8'));
const fileFor = (baked) => `${String(baked).replace(/[:.]/g, '-')}.json`;
const tableOf = (e) => JSON.parse(fs.readFileSync(path.join(here, '../src/migrate', fileFor(e.from.baked)), 'utf8'));
const load = (e) => tableOf(e); // migrateSeason's loader (the game's is a dynamic import)
const stamp = (I) => ({ version: I.version, baked: I.source.baked });
const world = (I) => (fixes.for === I.source.baked ? { P: [...I.portages, ...fixes.portages], C: [...I.campsites, ...fixes.campsites] } : { P: I.portages, C: I.campsites });
const key = (c) => `${Math.round(c.x)}:${Math.round(c.z)}`;
const nm = (l) => (l ? l.displayName || l.name || null : null);
const bits = (ids) => { const n = Math.max(...ids); const a = new Uint8Array((n >> 3) + 1); for (const i of ids) a[i >> 3] |= 1 << (i & 7); return btoa(String.fromCharCode(...a)); };
const unbits = (s) => { const t = atob(s || ''), out = []; for (let k = 0; k < t.length; k++) for (let b = 0; b < 8; b++) if ((t.charCodeAt(k) >> b) & 1) out.push(k * 8 + b); return out; };
class Store { constructor(o) { this.m = new Map(Object.entries(o)); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }

let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const head = (s) => console.log(`\n--- ${s} ${'-'.repeat(Math.max(0, 100 - s.length))}`);

// --- the tables in src/migrate.js, one per release ---------------------------------------------------------------------
head('the tables');
ok(TABLES.map((e) => e.name).join() === 'v3,v4,v5,v6,v7,v8', `TABLES: ${TABLES.map((e) => `${e.name} (${e.from.baked})`).join(', ')}`);
for (const e of TABLES) {
  const I = R[e.name], t = tableOf(e), size = fs.statSync(path.join(here, '../src/migrate', fileFor(e.from.baked))).size;
  ok(JSON.stringify(t.from) === JSON.stringify(stamp(I)) && JSON.stringify(t.to) === JSON.stringify(stamp(B)) && JSON.stringify(e.from) === JSON.stringify(t.from) && JSON.stringify(e.to) === JSON.stringify(t.to),
    `${e.name}: src/migrate/${fileFor(e.from.baked)} (${(size / 1024).toFixed(1)} KB) goes ${t.from.baked} → ${t.to.baked}`);
}
const lakeOne = (I) => I.lakes.filter((l) => l && l.name === 'Lake One').sort((a, b) => b.cells - a.cells)[0].id;
const ONE = lakeOne(B); // (v8, the fresh extract: 104; v9 the same)
ok(lakeOne(R.v3) === 78 && lakeOne(R.v4) === 103 && lakeOne(R.v5) === 103 && lakeOne(R.v6) === 103 && lakeOne(R.v7) === 103 && lakeOne(R.v8) === 104 && TABLES.every((e) => mapperOf(tableOf(e)).lake(lakeOne(R[e.name])) === ONE),
  `Lake One: v3 ${lakeOne(R.v3)}, v4 ${lakeOne(R.v4)}, v5 ${lakeOne(R.v5)}, v6 ${lakeOne(R.v6)}, v7 ${lakeOne(R.v7)}, v8 ${lakeOne(R.v8)} → ${TABLES.map((e) => mapperOf(tableOf(e)).lake(lakeOne(R[e.name]))).join(', ')} (new: ${ONE} ${nm(B.lakes[ONE - 1])})`);

// --- per release: the whole table, then a season made on it -------------------------------------------------------------
const seasons = {};
for (const e of TABLES) {
  const I = R[e.name], table = tableOf(e), M = mapperOf(table), { P: PA, C: CA } = world(I), PB = B.portages, CB = B.campsites;
  head(`${e.name} (${I.source.baked}) → ${B.source.baked}`);
  const sameLake = (a, b) => { const p = I.lakes[a - 1], q = b > 0 ? B.lakes[b - 1] : null; return !!(p && q && (p.osm === q.osm || Math.hypot(p.cx - q.cx, p.cz - q.cz) < 2000 || (nm(p) && nm(p) === nm(q)) || q.cells >= 50 * p.cells)); }; // (a few cells of a big lake's edge: its middle is far; v9: water NHDPlus HR draws as part of a lake 50 times its size or more, a sliver of channel or a bay)
  const sameSite = (i, j) => j >= 0 && Math.hypot(CA[i].x - CB[j].x, CA[i].z - CB[j].z) < 100;
  const sameTrail = (i, j) => { if (j < 0) return false; const p = PA[i].launch, q = PB[j].launch, d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z); return Math.min(d(p[0], q[0]) + d(p[1], q[1]), d(p[0], q[1]) + d(p[1], q[0])) < 80
    || (Math.min(d(p[0], q[0]), d(p[0], q[1]), d(p[1], q[0]), d(p[1], q[1])) < 30 && (PA[i].pts.every(([x, z]) => PB[j].pts.some(([u, v]) => Math.hypot(x - u, z - v) < 25)) || PB[j].pts.every(([x, z]) => PA[i].pts.some(([u, v]) => Math.hypot(x - u, z - v) < 25)) || PA[i].name === PB[j].name)); }; // (the season round: or carried on to other water, its old line all on the new; v9: or cut short at water on the way, its new line all on the old)
  {
    let lk = 0, lbad = 0, n = 0; for (const l of I.lakes) { if (!l) continue; n++; const to = M.lake(l.id); if (to) { lk++; if (!sameLake(l.id, to)) lbad++; } }
    ok(lbad === 0, `every mapped lake is the same water (${lk} of ${n} mapped, ${lbad} not; the rest have no water under them in the new bake)`);
    let sb = 0; CA.forEach((c, i) => { if (!sameSite(i, M.site(i))) sb++; }); ok(sb === 0, `every site is found at its place (${CA.length - sb} of ${CA.length})`);
    let pb = 0, pk = 0; PA.forEach((p, i) => { const j = M.portage(i); if (j >= 0) { pk++; if (!sameTrail(i, j)) pb++; } }); ok(pb === 0 && pk >= PA.length - 3, `every mapped trail has the same ends (${pk} of ${PA.length} mapped)`);
  }

  // the season: lakes by name in this release, sites and trails round Lake One, the ones the new bake moved or lost
  const byName = (name) => { const l = I.lakes.filter((q) => q && q.name === name).sort((a, b) => b.cells - a.cells)[0]; return l ? l.id : 0; };
  const L = { one: byName('Lake One'), two: byName('Lake Two'), three: byName('Lake Three'), four: byName('Lake Four'), insula: byName('Lake Insula'), meadows: byName('Meadows Lake') };
  const lo = I.lakes[L.one - 1];
  const goneLake = (I.lakes.find((l) => l && l.cells > 20 && !M.lake(l.id)) || I.lakes.find((l) => l && !M.lake(l.id))).id; // (v8 → v9 loses no lake over 20 cells: a sliver)
  const nearest = (arr, at, f) => arr.map((c, i) => [i, Math.hypot(f(c)[0] - at[0], f(c)[1] - at[1])]).sort((a, b) => a[1] - b[1]).map((q) => q[0]);
  const sitesNear = nearest(CA, [lo.cx, lo.cz], (c) => [c.x, c.z]);
  const movedSite = CA.findIndex((c) => table.campKeys[key(c)]);
  const site = { lakeOne: sitesNear[0], lakeOne2: sitesNear[1], moved: movedSite >= 0 ? movedSite : sitesNear[2] };
  const trailsNear = nearest(PA, [lo.cx, lo.cz], (p) => [p.launch[0].x, p.launch[0].z]);
  const redrawn = PA.findIndex((p, i) => M.portage(i) >= 0 && JSON.stringify(p.pts) !== JSON.stringify(PB[M.portage(i)].pts));
  const goneTrail = PA.findIndex((p, i) => M.portage(i) < 0);
  const trail = { a: trailsNear[0], b: trailsNear[1], two: redrawn >= 0 ? redrawn : trailsNear[2], gone: goneTrail };
  const C = (i) => CA[i], movedKey = key(CB[M.site(site.moved)]);
  console.log(`     lakes ${JSON.stringify(L)}, gone ${goneLake}; sites ${JSON.stringify(site)}${movedSite >= 0 ? ` (${key(C(site.moved))} moved to ${movedKey})` : ''}; trails ${JSON.stringify(trail)}`);
  const at = { year: 2026, doy: 170, hours: 9.5 };
  const keys = {
    'bwca-canoe:profile': { v: 1, id: 'stest', started: true, mode: 'adventure', home: 25, money: 40, earned: 60, spent: 20, owned: ['aluminium', 'ash', 'pack', 'aframe', 'tablets'], kit: { canoe: 'aluminium', paddle: 'ash', tent: 'aframe', filter: 'tablets', packs: 1 }, known: [25], rep: {}, ledger: [], migrated: null, told: [], sheets: [] },
    'bwca-canoe:explored': { v: 1, season: 'stest', lakes: bits([L.one, L.two, L.three, L.four, goneLake]), portages: bits([trail.a, trail.b, trail.two, ...(trail.gone >= 0 ? [trail.gone] : [])]), camps: bits([site.lakeOne, site.lakeOne2, site.moved]), route: '' },
    'bwca-canoe:logbook': { trips: [{ id: 't1', from: 25, to: 25, k: 'home', days: 3, km: 21.4, portages: 3, lakes: 4, nights_out: 2, fish: 1 }],
      seen: { lakes: [L.one, L.two, L.three, L.four, goneLake], camps: [key(C(site.lakeOne)), key(C(site.moved))], eps: [25], portages: [key(PA[trail.a].launch[0]), key(PA[trail.two].launch[0]), 'Lake One-Confusion Trail'] } },
    'bwca-canoe:stats': { v: 1, km: 21.4, rods: 160, portages: 3, drops: 0, lakes: [{ id: L.one, name: 'Lake One', doy: 170 }, { id: L.two, name: 'Lake Two', doy: 170 }, { id: L.three, name: 'Lake Three', doy: 171 }],
      nights: [{ doy: 170, where: 'the campsite on Lake One', key: key(C(site.lakeOne)), lake: 'Lake One' }, { doy: 171, where: 'a campsite', key: key(C(site.moved)), lake: null }], days: {}, lastDoy: 172 },
    'bwca-canoe-trip': { v: 3, trip: { active: true, ep: 25, days: 7 }, pos: { x: -19700, z: 18900, heading: 0 }, energy: null,
      core: { v: 3, id: '25-x', mode: 'adventure', active: true, since: at, from: 25, packs: { count: 1, canoe: 'aluminium', foodDays: 3 }, wet: false, offsite: 0, outcome: null,
        camp: { key: key(C(site.moved)), pitched: true, stage: 4, item: 'aframe', x: C(site.moved).x + 3, z: C(site.moved).z + 2, fdx: 1, fdz: 0, since: 0 },
        chores: { v: 2, piles: { [key(C(site.moved))]: { 'wood:branch': 2 } }, pints: 0, latrine: null, taken: {}, sawn: {}, dropped: [], fires: [{ key: key(C(site.moved)), at: { x: 0, y: 0, z: 0, a: 0 }, lit: false, until: 0, laid: 1 }], cook: null, tarps: [] },
        log: [{ k: 'start', at }, { k: 'lake', at, id: L.one, name: 'Lake One' }, { k: 'lake', at, id: L.two, name: 'Lake Two' }, { k: 'portage', at, name: PA[trail.a].name, rods: PA[trail.a].rods },
          { k: 'camp', at, key: key(C(site.lakeOne)) }, { k: 'sleep', at, key: key(C(site.lakeOne)), q: 0.8, hours: 8 }, { k: 'lake', at, id: L.three, name: 'Lake Three' }, { k: 'camp', at, key: key(C(site.moved)) }] },
      tasks: { v: 3, seed: 1, nextId: 8, purse: 0, earned: 0, claimed: [], tally: {}, unlocks: [],
        ads: [
          { id: 1, kind: 'item', from: 25, status: 'open', key: site.lakeOne, site: site.lakeOne, lakeId: L.one, item: 'x', title: 'Lost: a knife' },
          { id: 2, kind: 'survey', from: 25, status: 'open', key: trail.b, portage: trail.b, lakeId: L.one, title: 'Portage report wanted' },
          { id: 3, kind: 'secchi', from: 25, status: 'offered', key: L.three, lakeId: L.three, title: 'Secchi' },
          { id: 4, kind: 'report', from: 25, status: 'open', key: [L.one, L.two, L.three].join('>'), lakeId: L.one, route: [{ id: L.one, name: 'Lake One' }, { id: L.two, name: 'Lake Two' }, { id: L.three, name: 'Lake Three' }], title: 'Route report' },
          { id: 5, kind: 'photo', from: 25, status: 'open', key: `sunset:${L.four}`, target: { type: 'sunset', lake: L.four, name: 'Lake Four' }, title: 'Sunset' },
          ...(trail.gone >= 0 ? [{ id: 6, kind: 'deadfall', from: 25, status: 'open', key: trail.gone, portage: trail.gone, lakeId: L.meadows, title: 'Deadfall' }] : []),
          { id: 7, kind: 'fish', from: 25, status: 'open', species: 'laketrout', lakeHint: L.insula, title: 'A big laker' },
        ],
        boards: { 25: { slots: [1, 2, 3, 6], day: 170, n: 4, pending: [] } } } },
    'bwca-canoe:record': { v: 1, season: 'stest', since: 168, built: null,
      lakes: { [`l${L.one}`]: { id: L.one, name: 'Lake One', y: 2026, d: 170, n: 2 }, [`l${L.two}`]: { id: L.two, name: 'Lake Two', y: 2026, d: 170, n: 1 }, [`l${goneLake}`]: { id: goneLake, name: null, y: 2026, d: 170, n: 1 }, 'n:Lake Nowhere': { id: 0, name: 'Lake Nowhere', n: 1 } },
      trips: [{ id: 't1', n: 1, k: 'home', lakes: [{ id: L.one, name: 'Lake One' }, { id: L.two, name: 'Lake Two' }], nights: [{ doy: 170, where: 'x', key: key(C(site.moved)), lake: null }], camps: [{ key: key(C(site.moved)), lake: null, nights: 1 }], portages: [{ name: PA[trail.a].name, rods: 10, n: 1 }] }],
      fish: {}, fishSeen: 1, portages: {}, seen: {}, camps: { [key(C(site.moved))]: { key: key(C(site.moved)), words: 'a campsite', lake: null, nights: 1 } }, stories: [], storyDone: {}, photos: { n: 0, next: 1 }, notices: { done: [], paid: [], base: true }, firsts: [], draft: null, pending: null, bearVisits: 0 },
    'bwca-canoe:bear': { v: 1, season: 'stest', nights: 2, visits: 0, night: { key: key(C(site.moved)), kind: 'hung' }, last: null, mess: [] },
    'bwca-canoe-catchlog': { catches: [{ species: 'walleye', name: 'Walleye', length: 48, weight: 1.2, lake: 'Lake One', doy: 170, year: 2026, kept: true }], bests: { walleye: 48 } },
    'bwca-canoe:inventory': { v: 1, season: 'stest', n: 3, defs: {},
      containers: [{ id: 1, item: 'pack', name: 'Pack', grid: [], where: 'ground', at: { x: PA[trail.two].pts[0][0] + 2, z: PA[trail.two].pts[0][1], y: 0, heading: 0, trail: { i: trail.two, x: Math.round(PA[trail.two].pts[0][0]), z: Math.round(PA[trail.two].pts[0][1]), name: PA[trail.two].name } } },
        { id: 2, item: 'pile', name: 'Pile', grid: [], where: 'ground', at: { x: C(site.moved).x, z: C(site.moved).z, y: 0, heading: 0, left: true, camp: key(C(site.moved)) } }],
      long: trail.gone >= 0 ? [{ uid: 'u1', id: 'canoe', where: 'ground', at: { x: 0, z: 0, y: 0, heading: 0, trail: { i: trail.gone, x: 0, z: 0, name: 'x' } } }] : [] },
    'bwca-canoe:trip': { v: 1, x: -19700, z: 18900, heading: 0.4, mode: 'paddle', year: 2026, doy: 172, hours: 10, running: true, camera: 'chase', savedAt: 0 },
  };
  const raw = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, JSON.stringify(v)]));
  const own = e.name === 'v3' ? {} : { [MARK]: JSON.stringify(stamp(I)) }; // (a v3 season has no stamp)
  seasons[e.name] = { raw, own, L, M };
  if (e.name === 'v4' && arg('--fixture')) { fs.writeFileSync(arg('--fixture'), JSON.stringify({ keys: { ...raw, ...own }, lakes: L, to: Object.fromEntries(Object.entries(L).map(([k, id]) => [k, M.lake(id)])), gone: goneLake }, null, 1)); console.log(`     fixture: ${arg('--fixture')}`); }

  const store = new Store({ ...raw, ...own, 'bwca-canoe:settings': '{"x":1}' });
  const r = await migrateSeason(B, store, load);
  ok(r && r.did && r.via === e.name && !r.damaged, `carried via ${r && r.via}: ${r ? JSON.stringify(r.report) : 'null'}`);
  const J = (k) => JSON.parse(store.getItem(k));
  ok(JSON.stringify(J(MARK)) === JSON.stringify(stamp(B)), `stamped ${store.getItem(MARK)}`);
  const ex = J('bwca-canoe:explored'), exL = unbits(ex.lakes), exP = unbits(ex.portages), exC = unbits(ex.camps);
  console.log('     inked lakes:', exL.map((id) => `${id} ${nm(B.lakes[id - 1])}`).join(', '));
  ok(exL.includes(ONE) && exL.length === 4 && [L.one, L.two, L.three, L.four].every((id) => exL.includes(M.lake(id)) && nm(B.lakes[M.lake(id) - 1]) === nm(I.lakes[id - 1])), `the ink: Lake One is ${ONE}, the four paddled lakes by name, the gone pond dropped`);
  const walked = [trail.a, trail.b, trail.two];
  ok(walked.every((i) => exP.includes(M.portage(i)) && sameTrail(i, M.portage(i))) && exP.length === 3, `the ink: the portages ${exP.join(', ')} (${exP.map((j) => PB[j].name).join('; ')})${trail.gone >= 0 ? ', the gone one dropped' : ''}`);
  ok(exC.length === 3 && [site.lakeOne, site.lakeOne2, site.moved].every((i) => exC.includes(M.site(i)) && sameSite(i, M.site(i))), `the ink: the sites ${exC.join(', ')}`);
  const lb = J('bwca-canoe:logbook');
  ok(JSON.stringify(lb.seen.lakes) === JSON.stringify([L.one, L.two, L.three, L.four].map(M.lake)), `the logbook's lakes: ${lb.seen.lakes.join(', ')}`);
  ok(lb.seen.camps[1] === movedKey && lb.seen.camps[0] === key(CB[M.site(site.lakeOne)]), `the logbook's sites: ${lb.seen.camps.join(', ')}`);
  ok(lb.seen.portages[0] === key(PB[M.portage(trail.a)].launch[0]) && lb.seen.portages[1] === key(PB[M.portage(trail.two)].launch[0]) && lb.seen.portages[2] === 'Lake One-Confusion Trail', `the logbook's portages: ${lb.seen.portages.join(', ')}`);
  const tr = J('bwca-canoe-trip'), log = tr.core.log;
  ok(log.filter((q) => q.k === 'lake').every((q) => nm(B.lakes[q.id - 1]) === q.name), `the trip's log: lakes ${log.filter((q) => q.k === 'lake').map((q) => `${q.id} ${q.name}`).join(', ')}`);
  ok(tr.core.camp.key === movedKey && log.filter((q) => q.k === 'camp')[1].key === movedKey && tr.core.chores.piles[movedKey] && tr.core.chores.fires[0].key === movedKey, `the tent, its log, the wood pile and the fire ring at ${tr.core.camp.key}`);
  const ads = new Map(tr.tasks.ads.map((t) => [t.id, t]));
  ok(ads.get(1).site === M.site(site.lakeOne) && ads.get(1).key === ads.get(1).site && ads.get(1).lakeId === ONE, `notice 1 (item): site ${site.lakeOne} → ${ads.get(1).site}, lake ${ads.get(1).lakeId}`);
  ok(ads.get(2).portage === M.portage(trail.b) && ads.get(2).key === ads.get(2).portage, `notice 2 (survey): trail ${trail.b} → ${ads.get(2).portage} (${PB[ads.get(2).portage].name})`);
  ok(ads.get(3).key === M.lake(L.three) && nm(B.lakes[ads.get(3).lakeId - 1]) === 'Lake Three', `notice 3 (secchi): lake ${L.three} → ${ads.get(3).lakeId}`);
  ok(ads.get(4).route.every((l) => nm(B.lakes[l.id - 1]) === l.name) && ads.get(4).key === ads.get(4).route.map((l) => l.id).join('>'), `notice 4 (report): route ${ads.get(4).key}`);
  ok(ads.get(5).key === `sunset:${M.lake(L.four)}` && nm(B.lakes[ads.get(5).target.lake - 1]) === 'Lake Four', `notice 5 (photo): ${ads.get(5).key}`);
  if (trail.gone >= 0) ok(!ads.has(6), 'notice 6 (deadfall on a trail with no line in the new bake) dropped');
  ok(ads.get(7).lakeHint === M.lake(L.insula) && nm(B.lakes[ads.get(7).lakeHint - 1]) === 'Lake Insula', `notice 7 (fish): its hint lake → ${ads.get(7).lakeHint}`);
  const st = J('bwca-canoe:stats');
  ok(st.lakes.every((l) => nm(B.lakes[l.id - 1]) === l.name) && st.nights[1].key === movedKey, `the tally: lakes ${st.lakes.map((l) => l.id).join(', ')}; nights at ${st.nights.map((n) => n.key).join(', ')}`);
  const rec = J('bwca-canoe:record');
  ok(rec.lakes[`l${ONE}`] && rec.lakes[`l${ONE}`].name === 'Lake One' && rec.lakes[`l${M.lake(L.two)}`] && rec.lakes['n:Lake Nowhere'] && Object.keys(rec.lakes).length === 3, `the record's lakes: ${Object.keys(rec.lakes).join(', ')}`);
  ok(rec.trips[0].lakes.every((l) => nm(B.lakes[l.id - 1]) === l.name) && rec.trips[0].camps[0].key === movedKey && rec.camps[movedKey], `the record's trip and sites`);
  {
    const inv = J('bwca-canoe:inventory'), t2 = inv.containers[0].at.trail, j2 = M.portage(trail.two), q0 = PB[j2].pts[0];
    ok(t2.i === j2 && t2.x === Math.round(q0[0]) && t2.z === Math.round(q0[1]) && inv.containers[1].at.camp === movedKey && (trail.gone < 0 || !inv.long[0].at.trail), `the pack set down on trail ${trail.two} → ${t2.i} (${t2.x}:${t2.z}), the pile at ${inv.containers[1].at.camp}`);
  }
  ok(J('bwca-canoe:bear').night.key === movedKey, "the bear's night");
  ok(store.getItem('bwca-canoe-catchlog') === raw['bwca-canoe-catchlog'] && store.getItem('bwca-canoe:profile') === raw['bwca-canoe:profile'] && store.getItem('bwca-canoe:settings') === '{"x":1}', 'the catch log (by name), the profile and the settings as they were');
  const before = JSON.stringify([...store.m]);
  const r2 = await migrateSeason(B, store, load);
  ok(r2 && !r2.did && JSON.stringify([...store.m]) === before, 'a second load leaves it alone');
  seasons[e.name].after = before;
}

// --- the damaged seasons: older numbers stamped v6 ----------------------------------------------------------------------
head('the damaged seasons (stamped v6 while they kept older numbers)');
const v6stamp = JSON.stringify(stamp(R.v6));
const docs = (s) => JSON.stringify([...s.m].filter(([k]) => k !== MARK).sort());
for (const from of ['v3', 'v4', 'v5']) {
  const s = seasons[from], store = new Store({ ...s.raw, [MARK]: v6stamp, 'bwca-canoe:settings': '{"x":1}' });
  const names = seasonNames(s.raw);
  const r = await migrateSeason(B, store, load);
  const right = new Store(Object.fromEntries(JSON.parse(s.after)));
  ok(r && r.did && r.damaged && (r.via === from || (from !== 'v3' && ['v4', 'v5'].includes(r.via))) && docs(store) === docs(right) && store.getItem(MARK) === JSON.stringify(stamp(B)),
    `a ${from} season stamped v6: carried via ${r && r.via} (${r && r.damaged ? `${r.damaged.hits} of ${r.damaged.of} names and sites right` : 'not seen as damaged'}; ${names.size} names), the same as the ${from} season carried itself`);
}
{
  const s = seasons.v6, store = new Store({ ...s.raw, [MARK]: v6stamp });
  const r = await migrateSeason(B, store, load);
  ok(r && r.did && r.via === 'v6' && !r.damaged, 'a season made on v6 (its own numbers): carried via v6, not seen as damaged');
}
// the names gone (a season with too few to tell): its stamp's table
const noNames = (raw) => {
  const o = { ...raw };
  for (const k of ['bwca-canoe-trip', 'bwca-canoe:stats', 'bwca-canoe:record']) o[k] = JSON.stringify(JSON.parse(o[k]), (kk, v) => (kk === 'name' ? null : v));
  return o;
};
{
  const store = new Store({ ...noNames(seasons.v4.raw), [MARK]: v6stamp });
  const r = await migrateSeason(B, store, load);
  ok(r && r.did && r.via === 'v6' && !r.damaged, 'a v4 season stamped v6 with no lake names to tell by: carried via v6, its stamp (the test cannot see it)');
}
// only names both tables get right (Lake One, Three, Four keep their ids in v6): nothing to tell by, via v6; one name
// that only the v4 table gets right (Lake Two: v4 166, in v6 another water): via v4
const oneName = (name, id) => {
  const raw = noNames(seasons.v4.raw), t = JSON.parse(raw['bwca-canoe-trip']);
  t.core.log.find((q) => q.k === 'lake' && q.id === id).name = name; raw['bwca-canoe-trip'] = JSON.stringify(t);
  return raw;
};
{
  const raw = { ...oneName('Lake One', seasons.v4.L.one) }, t = JSON.parse(raw['bwca-canoe-trip']);
  t.core.log.find((q) => q.k === 'lake' && q.id === seasons.v4.L.three).name = 'Lake Three'; raw['bwca-canoe-trip'] = JSON.stringify(t);
  const r = await migrateSeason(B, new Store({ ...raw, [MARK]: v6stamp }), load);
  ok(r && r.via === 'v6' && !r.damaged, 'a v4 season stamped v6 naming only lakes whose ids v6 kept (Lake One, Lake Three): via v6');
  const r2 = await migrateSeason(B, new Store({ ...oneName('Lake Two', seasons.v4.L.two), [MARK]: v6stamp }), load);
  ok(r2 && r2.via === 'v4' && r2.damaged, `naming Lake Two (v4 ${seasons.v4.L.two}; under the v6 table another lake): via ${r2 && r2.via}`);
}
// no names, but a night at a Lake Two site (kept by place): the v4 table finds Lake Two among the season's lakes, the
// v6 table does not
{
  const raw = noNames(seasons.v4.raw), st = JSON.parse(raw['bwca-canoe:stats']), two = seasons.v4.M.lake(seasons.v4.L.two);
  const s2 = B.campsites.find((c) => c.lake === two);
  st.nights.push({ doy: 172, where: 'a campsite', key: key(s2), lake: null }); raw['bwca-canoe:stats'] = JSON.stringify(st);
  const r = await migrateSeason(B, new Store({ ...raw, [MARK]: v6stamp }), load);
  ok(r && r.via === 'v4' && r.damaged, `no names, a night at a site on Lake Two (${key(s2)}): via ${r && r.via}`);
}
// a season played on after v6 shipped (mixed): its old lakes in v4 numbers, then a lake reached since in v6's. One
// telling name each way: no clear evidence, so its stamp (v6); with a second v6 one as well, still v6
{
  const M4 = seasons.v4.M, M6 = seasons.v6.M;
  const telling = R.v6.lakes.filter((l) => l && l.name && l.cells > 2000 && nm(B.lakes[M6.lake(l.id) - 1]) === nm(l) && nm(B.lakes[M4.lake(l.id) - 1]) !== nm(l)).slice(0, 2);
  const raw = { ...seasons.v4.raw }, t = JSON.parse(raw['bwca-canoe-trip']);
  t.core.log.push({ k: 'lake', at: {}, id: telling[0].id, name: nm(telling[0]) }); raw['bwca-canoe-trip'] = JSON.stringify(t);
  const r = await migrateSeason(B, new Store({ ...raw, [MARK]: v6stamp }), load);
  ok(r && r.via === 'v6' && !r.damaged, `v4 numbers and one v6 lake since (${telling[0].id} ${nm(telling[0])}): one name each way, its stamp: via ${r && r.via}`);
}

// --- a stamp no table knows (the first v5, wetlands round 1, whose index is gone) ---------------------------------------
head('a stamp no table knows');
const unknown = JSON.stringify({ version: 4, baked: '2026-10-31T20:00:00.000Z' });
{
  const store = new Store({ ...seasons.v4.raw, [MARK]: unknown });
  const r = await migrateSeason(B, store, load);
  ok(r && r.did && ['v4', 'v5'].includes(r.via) && r.damaged, `a v4 season with an unknown stamp: carried via ${r && r.via} by its names`);
}
{
  const raw = noNames(seasons.v4.raw), store = new Store({ ...raw, [MARK]: unknown });
  const r = await migrateSeason(B, store, load);
  ok(r && !r.did && r.left && store.getItem(MARK) === unknown && Object.keys(raw).every((k) => store.getItem(k) === raw[k]), 'an unknown stamp and no names: left as it is, NOT stamped');
}

// --- no table to the release loaded: left, not stamped ------------------------------------------------------------------
head('no table to the release loaded');
for (const from of ['v3', 'v4']) {
  const s = seasons[from], store = new Store({ ...s.raw, ...s.own });
  const r = await migrateSeason(R.v6, store, load);
  ok(r && !r.did && r.left && store.getItem(MARK) === (s.own[MARK] ?? null) && Object.keys(s.raw).every((k) => store.getItem(k) === s.raw[k]), `a ${from} season loaded on v6 (no table to it): left as it is, the stamp ${store.getItem(MARK) || 'none'} kept`);
}
{
  const store = new Store({ ...seasons.v6.raw, [MARK]: v6stamp });
  const r = await migrateSeason(R.v6, store, load);
  ok(r && !r.did && !r.left, 'a v6 season on v6: nothing to do');
}

// --- a rebake of the new release with the same numbers --------------------------------------------------------------------
head('a rebake of the new release (a new bake time, the same numbers)');
{
  const B2 = { ...B, source: { ...B.source, baked: '2026-11-02T00:00:00.000Z' } };
  const s = seasons.v4, store = new Store({ ...s.raw, ...s.own });
  const r = await migrateSeason(B2, store, load);
  ok(r && r.did && r.via === 'v4' && JSON.parse(store.getItem(MARK)).baked === B2.source.baked, 'a v4 season on the rebake: carried via v4, stamped with the rebake');
  const s7 = new Store(Object.fromEntries(JSON.parse(seasons.v4.after)));
  const before = docs(s7), r7 = await migrateSeason(B2, s7, load);
  ok(r7 && !r7.did && docs(s7) === before && JSON.parse(s7.getItem(MARK)).baked === B2.source.baked, 'a season already on the new release, loaded on its rebake: only stamped');
}

// --- the rest -------------------------------------------------------------------------------------------------------------
head('the rest');
{
  const s = seasons.v3, bad = migrateKeys({ ...s.raw, 'bwca-canoe:record': '{not json' }, tableOf(TABLES[0]));
  ok(bad.keys['bwca-canoe:record'] === '{not json' && bad.report.failed.includes('bwca-canoe:record') && bad.keys['bwca-canoe:stats'] !== s.raw['bwca-canoe:stats'], 'a damaged document is left as it was, the rest carried over');
  const empty = new Store({ 'bwca-canoe:settings': '{}' });
  await migrateSeason(B, empty, load);
  ok(empty.getItem(MARK) === JSON.stringify(stamp(B)), 'a new season (nothing kept) is stamped with the data it starts on');
  const s3 = new Store({ ...seasons.v3.raw });
  const r3 = await migrateSeason(R.v3, s3, load);
  ok(r3 && !r3.did && JSON.parse(s3.getItem(MARK)).version === 3 && s3.getItem('bwca-canoe:explored') === seasons.v3.raw['bwca-canoe:explored'], 'an unstamped season on v3 data: stamped v3, nothing changed');
  const r3b = await migrateSeason(B, s3, load);
  ok(r3b && r3b.did && r3b.via === 'v3', 'stamped v3, then loaded on the new release: carried via v3');
  const failing = new Store({ ...seasons.v4.raw, ...seasons.v4.own });
  const rf = await migrateSeason(B, failing, () => { throw new Error('offline'); });
  ok(rf && !rf.did && failing.getItem(MARK) === seasons.v4.own[MARK], 'a table that does not load: left, not stamped (tried again next load)');
}

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
