// K1b's Node checks (no browser; light enough for any machine): the feed, its two adapters over fake modules, the stub
// seams, the flag, and the story lint against fixture trees. Each check prints PASS or FAIL; exit 1 on any FAIL.
//   node scripts/k1b-unit.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };

const { Feed, HOST_ONLY } = await import('../src/story-feed.js');
const { tripAdapter } = await import('../src/feed-trip.js');
const { outfitterAdapter } = await import('../src/feed-outfitter.js');
const { storyOn, STORY_ON } = await import('../src/story-flag.js');
const { ui } = await import('../src/story-ui.js');
const { allows } = await import('../src/story-allows.js');
const { pencil } = await import('../src/pencil.js');
const { layer } = await import('../src/story-layer.js');
const { installSeams } = await import('../src/story-seams.js');

// a module with trip.js's / outfitter.js's on(kind, fn) → off
class Bus {
  constructor() { this.handlers = new Map(); }
  on(k, fn) { if (!this.handlers.has(k)) this.handlers.set(k, new Set()); this.handlers.get(k).add(fn); return () => this.handlers.get(k).delete(fn); }
  fire(k, e) { for (const fn of this.handlers.get(k) || []) fn(e); }
  get count() { let n = 0; for (const s of this.handlers.values()) n += s.size; return n; }
}
const fakeTrip = () => Object.assign(new Bus(), { book: { trips: [] }, active: false, state: { from: null } });
const fakeStory = () => { const got = []; return { got, mode: 'full', emit(evt, data) { got.push([evt, data]); } }; };

// --- 1 the flag ------------------------------------------------------------------------------------------------------
result('flag: on by default, production and dev alike (owner 2026-11-13)', storyOn('') === true && storyOn('?story=1') === true && storyOn('?x=1') === true);
result('flag: off with ?story=0', storyOn('?story=0') === false && storyOn('?x=1&story=0') === false);
result('flag: off in Node (no Vite env)', STORY_ON === false);

// --- 2 the feed over the trip and outfitter adapters --------------------------------------------------------------------
{
  const feed = new Feed(), trip = fakeTrip(), outfitter = new Bus(), story = fakeStory();
  let guest = false;
  feed.register('trip', tripAdapter).register('outfitter', outfitterAdapter);
  result('feed: nothing attached before start', trip.count === 0 && outfitter.count === 0 && !feed.running);
  feed.start({ story, mods: { trip, outfitter }, guest: () => guest });
  result('feed: start attaches both adapters', feed.running && trip.count > 0 && outfitter.count === 2, { names: feed.names(), trip: trip.count });
  // a trip: push off, two carries over the same trail (a double portage), another, then come in
  trip.active = true; trip.fire('start', { ep: 31 });
  trip.fire('lake', { id: 61, name: 'Farm Lake' });
  trip.fire('portage', { i: 255, name: 'A – B', rods: 50 });
  trip.fire('portage', { i: 255, name: 'A – B', rods: 50 });
  trip.fire('portage', { i: 256, name: 'B – C', rods: 205 });
  trip.fire('camp', { key: 'C837', x: 1, z: 2, offsite: false });
  trip.fire('sleep', { kind: 'tent', key: 'C837', hours: 9 });
  trip.fire('capsize', {});
  trip.book.trips.push({}); trip.active = false; trip.fire('exit', { outcome: { k: 'completed', ep: 31 } });
  const ev = story.got.map(([e]) => e), carries = story.got.filter(([e]) => e === 'carry').map(([, d]) => d), pairs = story.got.filter(([e]) => e === 'carrypair').map(([, d]) => d);
  result('trip: trip:start { n: 1, ep }', story.got[0][0] === 'trip:start' && story.got[0][1].n === 1 && story.got[0][1].ep === 31, story.got[0]);
  result('trip: carry carries the portage index, seq 1..3 on trip 1', carries.length === 3 && carries.every((c, k) => c.seq === k + 1 && c.trip === 1) && carries[2].i === 256 && carries[2].rods === 205, carries);
  result('trip: one carrypair, 255 then 256 (the walk back over 255 does not break it)', pairs.length === 1 && pairs[0].a === 255 && pairs[0].b === 256, pairs);
  result('trip: lake, camp, sleep, capsize, trip:end in the vocabulary', ['lake', 'camp', 'sleep', 'capsize', 'trip:end'].every((e) => ev.includes(e)) && story.got.find(([e]) => e === 'trip:end')[1].n === 1 && story.got.find(([e]) => e === 'trip:end')[1].outcome === 'completed', ev);
  // the next trip numbers on, and a pair never spans two trips
  trip.active = true; trip.fire('leave', { ep: 31 }); trip.fire('portage', { i: 300, rods: 10 });
  const t2 = story.got.filter(([e]) => e === 'trip:start').pop()[1], c2 = story.got.filter(([e]) => e === 'carry').pop()[1];
  result('trip: the second trip is n 2, its first carry seq 1, no pair across trips', t2.n === 2 && c2.seq === 1 && c2.trip === 2 && story.got.filter(([e]) => e === 'carrypair').length === 1, { t2, c2 });
  // the store's door
  outfitter.fire('store:enter', { ep: 31 }); outfitter.fire('walkout', { ep: 31 });
  result('outfitter: store:enter and walkout { ep } reach the story', story.got.some(([e, d]) => e === 'walkout' && d.ep === 31) && story.got.some(([e]) => e === 'store:enter'));
  // a guest: host-only events dropped, the rest pass
  guest = true; const n0 = story.got.length;
  outfitter.fire('walkout', { ep: 25 }); outfitter.fire('store:enter', { ep: 25 }); trip.fire('sleep', { kind: 'tent' }); trip.fire('lake', { id: 9 });
  const after = story.got.slice(n0).map(([e]) => e);
  result('guest: walkout, store:enter and sleep dropped; lake passes', after.length === 1 && after[0] === 'lake' && feed.stats().dropped.guest === 3 && [...HOST_ONLY].sort().join() === 'sleep,store:enter,walkout', { after, stats: feed.stats() });
  // mirror mode: nothing passes
  guest = false; story.mode = 'mirror'; const n1 = story.got.length;
  trip.fire('lake', { id: 10 }); outfitter.fire('walkout', { ep: 31 });
  result('mirror: a guest engine in mirror mode takes nothing', story.got.length === n1 && feed.stats().dropped.mirror === 2);
  story.mode = 'full';
  // ingest preferred over emit when the story has it (K1a's v2)
  const ing = []; story.ingest = (e, d) => ing.push([e, d]); const n2 = story.got.length;
  trip.fire('lake', { id: 11 });
  result('feed: story.ingest is used when there', ing.length === 1 && story.got.length === n2);
  // a throwing adapter handler doesn't break the trip's own log
  feed.register('boom', (api) => { api.on(trip, 'lake', () => { throw new Error('boom'); }); });
  let ok = true; const warn = console.warn; console.warn = () => {}; try { trip.fire('lake', { id: 12 }); } catch { ok = false; } console.warn = warn;
  result('feed: an adapter registered while running attaches; its throw is caught', ok && feed.names().includes('boom'));
  feed.register('boom', () => null); // (re-registered: the old one's listeners go)
  // a tap sees how each event went
  const seen = []; const off = feed.tap((e, d, how) => seen.push(how)); guest = true; outfitter.fire('walkout', {}); guest = false; trip.fire('lake', { id: 13 }); off();
  result('feed: tap reports in / guest', seen.join() === 'guest,in', seen);
  feed.stop();
  result('feed: stop detaches every listener', trip.count === 0 && outfitter.count === 0 && !feed.running, { trip: trip.count, outfitter: outfitter.count });
  result('feed: emit after stop is refused', feed.emit('lake', {}) === false);
}

// --- 3 the stub seams -------------------------------------------------------------------------------------------------
{
  pencil.reset();
  const a = pencil.ring({ x: 100, z: 100, label: "the crews' landing", by: 'Ruth', lead: 'crews' });
  const b = pencil.ring({ x: 220, z: 150, by: 'Hap' }); // 130 m off: a second voice
  const c = pencil.ring({ x: 2000, z: 100, by: 'Len' });
  const m = pencil.marks();
  result('pencil: a ring within 200 m adds its speaker ("Ruth; Hap"); farther draws a new one', m.length === 2 && a.id === b.id && m[0].by.join('; ') === 'Ruth; Hap' && m[1].id === c.id && m[0].kind === 'ring' && m[0].r === 220, m);
  pencil.follow(a.id); pencil.close(a.id);
  result('pencil: follow and close mark the ring', pencil.marks()[0].followed && pencil.marks()[0].closed);
  result('pencil: a ring with no place is refused', pencil.ring({ by: 'x' }) === null);
}
{
  result('allows: yes to everything with no rule', allows('pitch') && allows('light', { site: 1 }) && allows.rules() === 0);
  const off = allows.add((v) => (v === 'pitch' ? false : undefined));
  const off2 = allows.add(() => { throw new Error('x'); });
  const warn = console.warn; console.warn = () => {};
  const r = [allows('pitch'), allows('light')]; console.warn = warn;
  off(); off2();
  result('allows: a rule refuses its verb only; a thrown rule is no say; off removes it', r[0] === false && r[1] === true && allows('pitch') && allows.rules() === 0, r);
}
{
  const r0 = await ui.pickLake({ who: 'denny' });
  ui.debug.answer({ lake: 61, name: 'Farm Lake' });
  const r1 = await ui.pickLake({ who: 'denny' });
  const pickB = ui.pickLake;
  ui.provide('pickLake', async () => ({ lake: 7 })); const r2 = await ui.pickLake({});
  result('ui.pickLake: null by default, a queued answer for rigs, provide() installs the real one', r0 === null && r1 && r1.lake === 61 && r2.lake === 7 && ui.calls.length === 3 && ui.stub === false && pickB === ui.pickLake, { r0, r1, r2 });
  let threw = false; try { ui.provide('nope', () => 1); } catch { threw = true; }
  result('ui.provide refuses an unknown ask', threw);
}
{
  const got = []; const off = layer.on('enter', (d) => got.push(d.place)); const offAll = layer.on('*', (e) => got.push(`*${e}`));
  layer.debug.fire('enter', { place: 'crews.landing' }); off(); offAll(); layer.debug.fire('enter', { place: 'x' });
  let threw = false; try { layer.on('nope', () => {}); } catch { threw = true; }
  result('layer.on: a trigger reaches its listener and *; off works; an unknown event refused; no places', got.join() === 'crews.landing,*enter' && threw && layer.places().length === 0, got);
}
{
  const s = { emit() {} }; const seams = installSeams(s);
  const own = { ui: 'mine', allows: 'mine' }; installSeams(own);
  result('installSeams: hangs story.ui and story.allows, never over the story\'s own', s.ui === ui && s.allows === allows && own.ui === 'mine' && own.allows === 'mine' && seams.pencil === pencil && seams.layer === layer);
}

// --- 4 the lint on fixtures ---------------------------------------------------------------------------------------------
const lint = (src, base) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/story-lint.mjs')], { env: { ...process.env, STORY_LINT_SRC: src, STORY_LINT_BASELINE: base }, encoding: 'utf8' });
{
  const dir = mkdtempSync(path.join(tmpdir(), 'k1b-lint-'));
  try {
    const src = path.join(dir, 'src'), base = path.join(dir, 'base.json'); mkdirSync(path.join(src, 'story-data'), { recursive: true });
    writeFileSync(base, JSON.stringify({ hits: [] }));
    writeFileSync(path.join(src, 'ok.js'), 'const p = world.portages[i]; const n = stats.portages + 1; for (const q of world.portagesPublic()) use(q);\n');
    writeFileSync(path.join(src, 'trip.js'), 'for (const p of world.portages) walk(p);\n'); // allowlisted
    let r = lint(src, base);
    result('lint fixture: indexed reads, stats counts, portagesPublic and the allowlist pass', r.status === 0, { out: r.stdout.split('\n').filter((l) => /^(FAIL|PASS)/.test(l)).slice(0, 3) });
    writeFileSync(path.join(src, 'bad.js'), 'export const f = (w) => w.portages.forEach((p) => draw(p));\nfor (const p of this.world.portages) x(p);\nconst q = (world.portages || []).find((t) => t.name);\n');
    r = lint(src, base);
    result('lint fixture: three raw iterations fail', r.status === 1 && /"line":1/.test(r.stdout) && /"line":2/.test(r.stdout) && /"line":3/.test(r.stdout), { out: r.stdout.split('\n')[0].slice(0, 300) });
    writeFileSync(path.join(src, 'parties.js'), 'w.portages.forEach((p, i) => {\n  if (p.hidden) return;\n});\n');
    rmSync(path.join(src, 'bad.js'));
    r = lint(src, base);
    result('lint fixture: a skipper that checks hidden passes', r.status === 0, { out: r.stdout.split('\n')[0].slice(0, 300) });
    writeFileSync(path.join(src, 'story-data', 'facts.js'), "export const FACTS = [{ key: 'nb.found', kind: 'bool' }, { key: 'tauno.porch.*', kind: 'bool' }, { key: 'key.*', kind: 'bool' }];\n");
    writeFileSync(path.join(src, 'story-data', 'rules-k1b.js'), "export const RULES = [\n { id: 'a', on: 'notebook:found', then: ['f:nb.found'] },\n { id: 'b', when: 'f:nb.found & daylight & hour:9-11', then: ['f:tauno.porch.done'] } ];\n");
    r = lint(src, base);
    result('lint fixture: declared facts, a known event and a good condition pass', r.status === 0, { out: r.stdout.split('\n').filter((l) => /schema|conditions: every/.test(l)) });
    writeFileSync(path.join(src, 'story-data', 'rules-k1b.js'), "export const RULES = [\n { id: 'a', on: 'notebook:lost', then: ['f:nb.gone', 'zap:x'] },\n { id: 'a', when: 'month:6 & dark & hour:20', then: ['f:nb.found'] },\n { id: 'c', when: 'f:nb.found & (wibble', then: ['f:nb.found'] } ];\n");
    r = lint(src, base);
    const out = r.stdout;
    result('lint fixture: a bad event, an undeclared fact, an unknown action, a twice-used id, a June-dark-20h clause and a broken bracket all fail',
      r.status === 1 && /notebook:lost/.test(out) && /undeclared fact 'nb.gone'/.test(out) && /unknown action 'zap:x'/.test(out) && /used twice/.test(out) && /can never hold/.test(out) && /no '\)'/.test(out), { out: out.split('\n').filter((l) => /FAIL/.test(l)).map((l) => l.slice(0, 400)) });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const fails = results.filter((r) => !r.pass).length;
console.log(`k1b-unit: ${results.length - fails}/${results.length} PASS`);
process.exit(fails ? 1 : 0);
