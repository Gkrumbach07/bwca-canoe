#!/usr/bin/env node
// d2 join: a v3 season carried to v4 (src/migrate.js with src/migrate-v3-v4.json), checked against the two releases.
// It builds a season as the game writes it on data-v3 (Lake One and its neighbours paddled and inked, a night at a
// Lake One site and one at a site the v4 bake moved, portages walked, a catch, notices on the board, the record), runs
// it through migrateSeason with a stand-in localStorage and the v4 index, and checks that every lake, site and trail
// it names is the same one in v4: a lake by its OpenStreetMap id (or under the old one's cells), a site by its place,
// a trail by its ends. Then that a second load leaves it alone, and that a v3 load only stamps it.
//
//   node scripts/migrate-check.mjs --v3 <dir with index.json> --v4 <dir with index.json> [--fixture out.json]
// (--fixture writes the v3 season's keys, for a browser check with the save in localStorage)
import fs from 'node:fs';
import path from 'node:path';
import { migrateSeason, migrateKeys, mapperOf, MARK } from '../src/migrate.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const here = path.dirname(new URL(import.meta.url).pathname);
const A = JSON.parse(fs.readFileSync(path.join(arg('--v3'), 'index.json'), 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(arg('--v4'), 'index.json'), 'utf8'));
const fixes = JSON.parse(fs.readFileSync(path.join(here, '../src/world-fixes.json'), 'utf8'));
const table = JSON.parse(fs.readFileSync(path.join(here, '../src/migrate-v3-v4.json'), 'utf8'));
const P3 = [...A.portages, ...fixes.portages], C3 = [...A.campsites, ...fixes.campsites];
const key = (c) => `${Math.round(c.x)}:${Math.round(c.z)}`;
const lake3 = (name) => A.lakes.filter((l) => l && l.name === name).sort((a, b) => b.cells - a.cells)[0].id;

// --- the v3 season ----------------------------------------------------------------------------------------------------
const L = { one: lake3('Lake One'), two: lake3('Lake Two'), three: lake3('Lake Three'), four: lake3('Lake Four'), insula: lake3('Lake Insula'), harbor: lake3('Harbor Lake') };
const goneLake = 1675;                         // an unnamed pond v4 has no water under (scripts/migrate-v3-v4.mjs: gone)
const site = { lakeOne: 840, lakeOne2: 2190, moved: 859 };   // 2190: an official site world-fixes.json appended; 859: moved 57 m in v4
const trail = { kawishiwi: 235, kawishiwi2: 525, two: 233, gone: 989 };  // 233: redrawn in v4; 989: a v3 connector with no v4 line
const bits = (ids) => { const n = Math.max(...ids); const a = new Uint8Array((n >> 3) + 1); for (const i of ids) a[i >> 3] |= 1 << (i & 7); return btoa(String.fromCharCode(...a)); };
const at = { year: 2026, doy: 170, hours: 9.5 };
const v3keys = {
  'bwca-canoe:profile': { v: 1, id: 'stest', started: true, mode: 'adventure', home: 25, money: 40, earned: 60, spent: 20, owned: ['aluminium', 'ash', 'pack', 'aframe', 'tablets'], kit: { canoe: 'aluminium', paddle: 'ash', tent: 'aframe', filter: 'tablets', packs: 1 }, known: [25], rep: {}, ledger: [], migrated: null, told: [], sheets: [] },
  'bwca-canoe:explored': { v: 1, season: 'stest', lakes: bits([L.one, L.two, L.three, L.four, L.harbor, goneLake]), portages: bits([trail.kawishiwi, trail.kawishiwi2, trail.two, trail.gone]), camps: bits([site.lakeOne, site.lakeOne2, site.moved]), route: '' },
  'bwca-canoe:logbook': { trips: [{ id: 't1', from: 25, to: 25, k: 'home', days: 3, km: 21.4, portages: 3, lakes: 4, nights_out: 2, fish: 1 }],
    seen: { lakes: [L.one, L.two, L.three, L.four, goneLake], camps: [key(C3[site.lakeOne]), key(C3[site.moved])], eps: [25], portages: [key(P3[trail.kawishiwi].launch[0]), key(P3[trail.two].launch[0]), 'Lake One-Confusion Trail'] } },
  'bwca-canoe:stats': { v: 1, km: 21.4, rods: 160, portages: 3, drops: 0, lakes: [{ id: L.one, name: 'Lake One', doy: 170 }, { id: L.two, name: 'Lake Two', doy: 170 }, { id: L.three, name: 'Lake Three', doy: 171 }],
    nights: [{ doy: 170, where: 'the campsite on Lake One', key: key(C3[site.lakeOne]), lake: 'Lake One' }, { doy: 171, where: 'a campsite', key: key(C3[site.moved]), lake: null }], days: {}, lastDoy: 172 },
  'bwca-canoe-trip': { v: 3, trip: { active: true, ep: 25, days: 7 }, pos: { x: -19700, z: 18900, heading: 0 }, energy: null,
    core: { v: 3, id: '25-x', mode: 'adventure', active: true, since: at, from: 25, packs: { count: 1, canoe: 'aluminium', foodDays: 3 }, wet: false, offsite: 0, outcome: null,
      camp: { key: key(C3[site.moved]), pitched: true, stage: 4, item: 'aframe', x: C3[site.moved].x + 3, z: C3[site.moved].z + 2, fdx: 1, fdz: 0, since: 0 },
      chores: { v: 2, piles: { [key(C3[site.moved])]: { 'wood:branch': 2 } }, pints: 0, latrine: null, taken: {}, sawn: {}, dropped: [], fires: [{ key: key(C3[site.moved]), at: { x: 0, y: 0, z: 0, a: 0 }, lit: false, until: 0, laid: 1 }], cook: null, tarps: [] },
      log: [{ k: 'start', at }, { k: 'lake', at, id: L.one, name: 'Lake One' }, { k: 'lake', at, id: L.two, name: 'Lake Two' }, { k: 'portage', at, name: P3[trail.kawishiwi].name, rods: P3[trail.kawishiwi].rods },
        { k: 'camp', at, key: key(C3[site.lakeOne]) }, { k: 'sleep', at, key: key(C3[site.lakeOne]), q: 0.8, hours: 8 }, { k: 'lake', at, id: L.three, name: 'Lake Three' }, { k: 'camp', at, key: key(C3[site.moved]) }] },
    tasks: { v: 3, seed: 1, nextId: 8, purse: 0, earned: 0, claimed: [], tally: {}, unlocks: [],
      ads: [
        { id: 1, kind: 'item', from: 25, status: 'open', key: site.lakeOne, site: site.lakeOne, lakeId: L.one, item: 'x', title: 'Lost: a knife' },
        { id: 2, kind: 'survey', from: 25, status: 'open', key: trail.kawishiwi2, portage: trail.kawishiwi2, lakeId: L.one, title: 'Portage report wanted' },
        { id: 3, kind: 'secchi', from: 25, status: 'offered', key: L.three, lakeId: L.three, title: 'Secchi' },
        { id: 4, kind: 'report', from: 25, status: 'open', key: [L.one, L.two, L.three].join('>'), lakeId: L.one, route: [{ id: L.one, name: 'Lake One' }, { id: L.two, name: 'Lake Two' }, { id: L.three, name: 'Lake Three' }], title: 'Route report' },
        { id: 5, kind: 'photo', from: 25, status: 'open', key: `sunset:${L.four}`, target: { type: 'sunset', lake: L.four, name: 'Lake Four' }, title: 'Sunset' },
        { id: 6, kind: 'deadfall', from: 25, status: 'open', key: trail.gone, portage: trail.gone, lakeId: lake3('Meadows Lake'), title: 'Deadfall' },
        { id: 7, kind: 'fish', from: 25, status: 'open', species: 'laketrout', lakeHint: L.insula, title: 'A big laker' },
      ],
      boards: { 25: { slots: [1, 2, 3, 6], day: 170, n: 4, pending: [] } } } },
  'bwca-canoe:record': { v: 1, season: 'stest', since: 168, built: null,
    lakes: { [`l${L.one}`]: { id: L.one, name: 'Lake One', y: 2026, d: 170, n: 2 }, [`l${L.two}`]: { id: L.two, name: 'Lake Two', y: 2026, d: 170, n: 1 }, [`l${goneLake}`]: { id: goneLake, name: null, y: 2026, d: 170, n: 1 }, 'n:Lake Nowhere': { id: 0, name: 'Lake Nowhere', n: 1 } },
    trips: [{ id: 't1', n: 1, k: 'home', lakes: [{ id: L.one, name: 'Lake One' }, { id: L.two, name: 'Lake Two' }], nights: [{ doy: 170, where: 'x', key: key(C3[site.moved]), lake: null }], camps: [{ key: key(C3[site.moved]), lake: null, nights: 1 }], portages: [{ name: P3[trail.kawishiwi].name, rods: 10, n: 1 }] }],
    fish: {}, fishSeen: 1, portages: {}, seen: {}, camps: { [key(C3[site.moved])]: { key: key(C3[site.moved]), words: 'a campsite', lake: null, nights: 1 } }, stories: [], storyDone: {}, photos: { n: 0, next: 1 }, notices: { done: [], paid: [], base: true }, firsts: [], draft: null, pending: null, bearVisits: 0 },
  'bwca-canoe:bear': { v: 1, season: 'stest', nights: 2, visits: 0, night: { key: key(C3[site.moved]), kind: 'hung' }, last: null, mess: [] },
  'bwca-canoe-catchlog': { catches: [{ species: 'walleye', name: 'Walleye', length: 48, weight: 1.2, lake: 'Lake One', doy: 170, year: 2026, kept: true }], bests: { walleye: 48 } },
  'bwca-canoe:inventory': { v: 1, season: 'stest', n: 3, defs: {},
    containers: [{ id: 1, item: 'pack', name: 'Pack', grid: [], where: 'ground', at: { x: P3[trail.two].pts[0][0] + 2, z: P3[trail.two].pts[0][1], y: 0, heading: 0, trail: { i: trail.two, x: Math.round(P3[trail.two].pts[0][0]), z: Math.round(P3[trail.two].pts[0][1]), name: P3[trail.two].name } } },
      { id: 2, item: 'pile', name: 'Pile', grid: [], where: 'ground', at: { x: C3[site.moved].x, z: C3[site.moved].z, y: 0, heading: 0, left: true, camp: key(C3[site.moved]) } }],
    long: [{ uid: 'u1', id: 'canoe', where: 'ground', at: { x: 0, z: 0, y: 0, heading: 0, trail: { i: trail.gone, x: 0, z: 0, name: 'x' } } }] },
  'bwca-canoe:trip': { v: 1, x: -19700, z: 18900, heading: 0.4, mode: 'paddle', year: 2026, doy: 172, hours: 10, running: true, camera: 'chase', savedAt: 0 },
};
const raw = Object.fromEntries(Object.entries(v3keys).map(([k, v]) => [k, JSON.stringify(v)]));
if (arg('--fixture')) { fs.writeFileSync(arg('--fixture'), JSON.stringify({ keys: raw, lakes: L, gone: goneLake }, null, 1)); console.log(`fixture: ${arg('--fixture')}`); }

// --- checks -------------------------------------------------------------------------------------------------------------
let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fails++; };
const sameLake = (a, b) => { const p = A.lakes[a - 1], q = b > 0 ? B.lakes[b - 1] : null; return !!(p && q && (p.osm === q.osm || Math.hypot(p.cx - q.cx, p.cz - q.cz) < 2000)); };
const sameSite = (i, j) => j >= 0 && Math.hypot(C3[i].x - B.campsites[j].x, C3[i].z - B.campsites[j].z) < 100;
const ends = (p) => p.launch.map((l) => key(l)).sort().join(' ');
const sameTrail = (i, j) => { if (j < 0) return false; const p = P3[i], q = B.portages[j]; return Math.hypot(p.launch[0].x - q.launch[0].x, p.launch[0].z - q.launch[0].z) + Math.hypot(p.launch[1].x - q.launch[1].x, p.launch[1].z - q.launch[1].z) < 80 || Math.hypot(p.launch[0].x - q.launch[1].x, p.launch[0].z - q.launch[1].z) + Math.hypot(p.launch[1].x - q.launch[0].x, p.launch[1].z - q.launch[0].z) < 80; };
const unbits = (s) => { const t = atob(s || ''), out = []; for (let k = 0; k < t.length; k++) for (let b = 0; b < 8; b++) if ((t.charCodeAt(k) >> b) & 1) out.push(k * 8 + b); return out; };
const M = mapperOf(table);

// the whole table, against the two indices
{
  let lk = 0, lbad = 0; for (const l of A.lakes) { if (!l) continue; const to = M.lake(l.id); if (to) { lk++; if (!sameLake(l.id, to)) lbad++; } }
  ok(lbad === 0, `every mapped lake is the same water (${lk} of ${A.lakes.filter(Boolean).length} mapped, ${lbad} not)`);
  let sb = 0; C3.forEach((c, i) => { if (!sameSite(i, M.site(i))) sb++; }); ok(sb === 0, `every v3 site is found in v4 at its place (${C3.length - sb} of ${C3.length})`);
  let pb = 0, pk = 0; P3.forEach((p, i) => { const j = M.portage(i); if (j >= 0) { pk++; if (!sameTrail(i, j)) pb++; } }); ok(pb === 0, `every mapped trail has the same ends (${pk} of ${P3.length} mapped)`);
}
ok(L.one === 78 && M.lake(78) === 103 && B.lakes[102].name === 'Lake One', `Lake One: v3 ${L.one} → v4 ${M.lake(L.one)} (${B.lakes[M.lake(L.one) - 1].name})`);

// the season, through migrateSeason with a stand-in localStorage
class Store { constructor(o) { this.m = new Map(Object.entries(o)); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }
const store = new Store({ ...raw, 'bwca-canoe:settings': '{"x":1}' });
const r = await migrateSeason(B, store, table);
ok(r && r.did, `migrated: ${r ? JSON.stringify(r.report) : 'null'}`);
const J = (k) => JSON.parse(store.getItem(k));
ok(JSON.stringify(J(MARK)) === JSON.stringify({ version: B.version, baked: B.source.baked }), `stamped ${store.getItem(MARK)}`);

const ex = J('bwca-canoe:explored'), exL = unbits(ex.lakes), exP = unbits(ex.portages), exC = unbits(ex.camps);
console.log('     inked lakes v4:', exL.map((id) => `${id} ${B.lakes[id - 1].name}`).join(', '));
ok(exL.includes(103) && !exL.includes(78), 'the ink: Lake One is lake 103 (78 is not inked: in v4 it is another lake)');
ok([L.one, L.two, L.three, L.four, L.harbor].every((id) => exL.includes(M.lake(id))) && exL.length === 5, 'the ink: the five paddled lakes, the gone pond dropped');
ok([trail.kawishiwi, trail.kawishiwi2, trail.two].every((i) => exP.includes(M.portage(i))) && exP.length === 3 && [trail.kawishiwi, trail.kawishiwi2, trail.two].every((i) => sameTrail(i, M.portage(i))), `the ink: the portages ${exP.join(', ')} (${exP.map((j) => B.portages[j].name).join('; ')}), the gone connector dropped`);
ok(exC.length === 3 && [site.lakeOne, site.lakeOne2, site.moved].every((i) => exC.includes(M.site(i)) && sameSite(i, M.site(i))), `the ink: the sites ${exC.join(', ')} (${exC.map((j) => B.campsites[j].name || key(B.campsites[j])).join('; ')})`);

const lb = J('bwca-canoe:logbook');
ok(JSON.stringify(lb.seen.lakes) === JSON.stringify([L.one, L.two, L.three, L.four].map(M.lake)), `the logbook's lakes: ${lb.seen.lakes.join(', ')}`);
const movedKey = key(B.campsites[M.site(site.moved)]);
ok(lb.seen.camps[1] === movedKey && lb.seen.camps[0] === key(C3[site.lakeOne]), `the logbook's sites: ${lb.seen.camps.join(', ')} (the moved one ${key(C3[site.moved])} → ${movedKey})`);
ok(lb.seen.portages[0] === key(B.portages[M.portage(trail.kawishiwi)].launch[0]) && lb.seen.portages[1] === key(B.portages[M.portage(trail.two)].launch[0]) && lb.seen.portages[2] === 'Lake One-Confusion Trail', `the logbook's portages: ${lb.seen.portages.join(', ')}`);

const tr = J('bwca-canoe-trip'), log = tr.core.log;
ok(log.filter((e) => e.k === 'lake').map((e) => e.id).join() === [L.one, L.two, L.three].map(M.lake).join(), `the trip's log: lakes ${log.filter((e) => e.k === 'lake').map((e) => `${e.id} ${e.name}`).join(', ')}`);
ok(tr.core.camp.key === movedKey && log.filter((e) => e.k === 'camp')[1].key === movedKey && tr.core.chores.piles[movedKey] && tr.core.chores.fires[0].key === movedKey, `the tent, its log, the wood pile and the fire ring at the moved site: ${tr.core.camp.key}`);
const ads = new Map(tr.tasks.ads.map((t) => [t.id, t]));
ok(ads.get(1).site === M.site(site.lakeOne) && ads.get(1).key === ads.get(1).site && ads.get(1).lakeId === 103 && sameSite(site.lakeOne, ads.get(1).site), `notice 1 (item): site ${site.lakeOne} → ${ads.get(1).site}, lake ${ads.get(1).lakeId}`);
ok(ads.get(2).portage === M.portage(trail.kawishiwi2) && ads.get(2).key === ads.get(2).portage && sameTrail(trail.kawishiwi2, ads.get(2).portage), `notice 2 (survey): trail ${trail.kawishiwi2} → ${ads.get(2).portage} (${B.portages[ads.get(2).portage].name})`);
ok(ads.get(3).key === M.lake(L.three) && ads.get(3).lakeId === M.lake(L.three), `notice 3 (secchi): lake ${L.three} → ${ads.get(3).lakeId} (${B.lakes[ads.get(3).lakeId - 1].name})`);
ok(ads.get(4).key === [L.one, L.two, L.three].map(M.lake).join('>') && ads.get(4).route.every((l, k) => l.id === M.lake([L.one, L.two, L.three][k])), `notice 4 (report): route ${ads.get(4).key}`);
ok(ads.get(5).key === `sunset:${M.lake(L.four)}` && ads.get(5).target.lake === M.lake(L.four), `notice 5 (photo): ${ads.get(5).key}`);
ok(!ads.has(6), 'notice 6 (deadfall on the trail v4 has no line for) dropped');
ok(ads.get(7).lakeHint === M.lake(L.insula), `notice 7 (fish): its hint lake ${L.insula} → ${ads.get(7).lakeHint} (${B.lakes[ads.get(7).lakeHint - 1].name})`);

const st = J('bwca-canoe:stats');
ok(st.lakes.map((l) => l.id).join() === [L.one, L.two, L.three].map(M.lake).join() && st.nights[1].key === movedKey && st.nights[0].key === key(C3[site.lakeOne]), `the tally: lakes ${st.lakes.map((l) => l.id).join(', ')}; nights at ${st.nights.map((n) => n.key).join(', ')}`);
const rec = J('bwca-canoe:record');
ok(rec.lakes.l103 && rec.lakes.l103.id === 103 && rec.lakes.l103.name === 'Lake One' && !rec.lakes.l78 && rec.lakes[`l${M.lake(L.two)}`] && rec.lakes['n:Lake Nowhere'] && !rec.lakes['n:null'] && Object.keys(rec.lakes).length === 3, `the record's lakes: ${Object.keys(rec.lakes).join(', ')}`);
ok(rec.trips[0].lakes.map((l) => l.id).join() === [103, M.lake(L.two)].join() && rec.trips[0].camps[0].key === movedKey && rec.camps[movedKey] && rec.camps[movedKey].key === movedKey, `the record's trip and sites: ${rec.trips[0].lakes.map((l) => l.id).join(', ')}; ${Object.keys(rec.camps).join(', ')}`);
{
  const inv = J('bwca-canoe:inventory'), t2 = inv.containers[0].at.trail, j2 = M.portage(trail.two), q0 = B.portages[j2].pts[0];
  ok(t2.i === j2 && t2.x === Math.round(q0[0]) && t2.z === Math.round(q0[1]) && inv.containers[1].at.camp === movedKey && !inv.long[0].at.trail, `the pack set down on trail ${trail.two} → ${t2.i} (${t2.x}:${t2.z}), the pile at the moved site, the canoe on the gone trail just lies there`);
}
ok(J('bwca-canoe:bear').night.key === movedKey, "the bear's night at the moved site");
ok(store.getItem('bwca-canoe-catchlog') === raw['bwca-canoe-catchlog'] && store.getItem('bwca-canoe:profile') === raw['bwca-canoe:profile'] && store.getItem('bwca-canoe:settings') === '{"x":1}', 'the catch log (by name), the profile and the settings as they were');

// once only; on v3 only a stamp; a damaged document left as it was
const before = JSON.stringify([...store.m]);
const r2 = await migrateSeason(B, store, table);
ok(r2 && !r2.did && JSON.stringify([...store.m]) === before, 'a second load leaves it alone');
const s3 = new Store({ ...raw });
const r3 = await migrateSeason(A, s3, table);
ok(r3 && !r3.did && s3.getItem('bwca-canoe:explored') === raw['bwca-canoe:explored'] && JSON.parse(s3.getItem(MARK)).version === 3, 'on v3 data: stamped v3, nothing changed');
const r3b = await migrateSeason(B, s3, table);
ok(r3b && r3b.did && unbits(JSON.parse(s3.getItem('bwca-canoe:explored')).lakes).includes(103), 'stamped v3, then loaded on v4: carried over');
const bad = migrateKeys({ ...raw, 'bwca-canoe:record': '{not json' }, table);
ok(bad.keys['bwca-canoe:record'] === '{not json' && bad.report.failed.includes('bwca-canoe:record') && bad.keys['bwca-canoe:stats'] !== raw['bwca-canoe:stats'], 'a damaged document is left as it was, the rest carried over');
const empty = new Store({ 'bwca-canoe:settings': '{}' });
await migrateSeason(B, empty, table);
ok(JSON.parse(empty.getItem(MARK)).version === 4, 'a new season (nothing kept) is stamped with the data it starts on');

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
