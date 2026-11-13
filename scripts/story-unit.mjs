// The story core's unit tests (docs/build/campaign-design.md §14.3, stream K1a). Node only, no browser, no game:
//   node --test scripts/story-unit.mjs
// The condition compiler, rule indexing, the v1 → v2 migration (a v1 finder gets its Walt lines), the data-hash re-run,
// decline → re-hook → accept for every door and the porch, grow-only and exclusive facts, locks, lies re-checked late,
// timers, the tick clamp, time atoms, the guest's mirror mode, the v1 getters and echo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, classify } from '../src/story-cond.js';
import { StoryV2, blankDoc, NS1, NS2, META } from '../src/story.js';
import { DOORS, factRow } from '../src/story-data/facts.js';
import { LOCKS } from '../src/story-data/locks.js';

const warn = console.warn; console.warn = () => {}; // (refusals warn by design)
process.on('exit', () => { console.warn = warn; });

const io = (init = {}) => { const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)])); return { map: m, read: (ns, f = null) => (m.has(ns) ? JSON.parse(m.get(ns)) : f), write: (ns, v) => { m.set(ns, JSON.stringify(v)); return true; } }; };
const profile = (id = 'p-1', started = true) => { const fns = []; return { seasonId: id, started, onChange: (fn) => fns.push(fn), fire: (w) => fns.forEach((f) => f(w)) }; };
const make = (opts = {}) => { const s = new StoryV2({ io: opts.io || io(), rules: opts.rules }); s.attach({ profile: opts.profile || profile() }); s.clock({ abs: opts.abs ?? 20600, hours: opts.hours ?? 10 }); return s; };
const abs = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);

// --- the compiler ---------------------------------------------------------------------------------------------------
test('compiler: grammar, precedence, negation', () => {
  const env = (facts) => ({ fact: (k) => facts[k], keys: (p) => Object.entries(facts).filter(([k]) => k.startsWith(p)), derived: () => 0, ppl: () => null, nb: () => false, lead: () => null, since: () => null, sensor: () => undefined });
  const e = env({ a: true, b: true, 'x.y': 'v' });
  assert.equal(compile('f:a & f:b').test(e), true);
  assert.equal(compile('f:a & f:c | f:b').test(e), true);       // & binds tighter
  assert.equal(compile('f:a & (f:c | f:d)').test(e), false);
  assert.equal(compile('!f:c & a').test(e), true);
  assert.equal(compile('f:x.y=v').test(e), true);
  assert.equal(compile('f:x.y!=v').test(e), false);
  assert.equal(compile('x.y').test(e), true);                    // a bare dotted key is a fact
  assert.equal(compile('f:a & (').ok, false);
  assert.equal(compile('f:a & (').test(e), false);
  assert.equal(compile('').test(e), true);
});
test('compiler: atoms of Appendix B and of 70', () => {
  const k = (s) => classify(s);
  assert.deepEqual([k('end:J|JN|M').name, k('end:J|JN|M').vals], ['end', ['J', 'JN', 'M']]);
  assert.equal(k('porch:declined2|done').vals.length, 2);
  assert.equal(k('door:crews=declined|taken').arg, 'crews');
  assert.equal(k('S2-S4').k, 'stagein');
  assert.equal(k('S2').op, '>=');                                // (70: "includes everything after it")
  assert.equal(k('t2').name, 'tier');
  assert.equal(k('any(key.L2*)').prefix, 'key.L2');
  assert.equal(k('any(case.denny.*=hard)').v, 'hard');
  assert.equal(k('count(case.denny.*)>=3').v, 3);
  assert.equal(k('days.since(big2)>=2').fact, 'big2');
  assert.equal(k('trust:aili>=2').who, 'aili');
  assert.equal(k('cold:aili').field, 'cold');
  assert.equal(k('read:NB45').kind, 'read');
  assert.equal(k('knows:stones').fact, 'knows.stones');
  assert.equal(k('ev:watchers@here').name, 'ev@here');
  assert.equal(k('hour:7-10').name, 'hour');
  assert.equal(k('date:08-08..08-15').arg, '08-08..08-15');
  assert.equal(k('wind>=15').op, '>=');
  assert.equal(k('visits:25>=2').arg, '25');
  assert.equal(k('visits ≥ 2'.replace(/ /g, '')).op, '>=');
  assert.equal(k('rain.days>=2').name, 'rain.days');
  assert.equal(k('run.active').k, 'sensor');
  assert.equal(k('carrypair:P255,P256').unknown, true);
  const c = compile('!f:tauno.call & (bigCount>=3 | trips.since(big2)>=2) & person in [marlys,sheila,carol,rene]');
  assert.equal(c.ok, true, c.errors.join());
  assert.ok(c.atoms.some((a) => a.k === 'in' && a.vals.length === 4));
  assert.equal(compile('end:J | north').atoms.length, 2);        // (spaced: two atoms, not a value list)
  assert.ok(compile('f:a.b & any(key.L2*) & tier>=2 & hour:7-10').keys.includes('s'));
});
test('compiler: every lock and core rule compiles', () => {
  for (const l of LOCKS) for (const key of l.keys) assert.equal(compile(key.when).ok, true, `${key.id}: ${compile(key.when).errors}`);
  const s = make();
  assert.deepEqual(s.debug.errors(), []);
});

// --- facts --------------------------------------------------------------------------------------------------------
test('facts: declared, grow-only, exclusive refused', () => {
  const s = make();
  assert.equal(s.set('nope.thing'), false);                      // undeclared
  assert.equal(s.set('tier.1', 'x'), false);                     // a bool fact is true only
  assert.equal(s.set('case.denny.tuesday', 'maybe'), false);     // enum
  assert.equal(s.set('case.denny.tuesday', 'soft'), true);
  assert.equal(s.set('case.denny.tuesday', 'hard'), false);      // grow-only: the first value stands
  assert.equal(s.get('case.denny.tuesday'), 'soft');
  assert.equal(s.set('choice.denny', 'turn'), true);
  assert.equal(s.set('choice.denny', 'told'), false);            // exclusive
  assert.ok(s.state.log.some((r) => r[3] === 'refused' && /exclusive/.test(r[4].why)));
  const f = s.fact('choice.denny');
  assert.equal(f.abs, 20600); assert.equal(f.src, '?'); assert.ok(f.tick > 0);
  assert.equal(factRow('tauno.porch.done').kind, 'bool');
});
test('polish: dates.since counts the turn of the day (an evening fact is a day old the next morning), days.since 24 h', () => {
  const s = make({ abs: 20600 });
  s.clock({ abs: 20600, hours: 19 }); s.set('nb.found');
  s.clock({ abs: 20601, hours: 9 });
  assert.equal(s.when('dates.since(nb.found)>=1'), true);
  assert.equal(s.when('days.since(nb.found)>=1'), false);
  s.clock({ abs: 20600, hours: 23 });
  assert.equal(s.when('dates.since(nb.found)>=1'), false);
});
test('facts: ticks order, the since() clamp after a rewind', () => {
  const s = make({ abs: 20600 });
  s.set('nb.found');
  s.clock({ abs: 20603, hours: 10 });
  assert.equal(s.when('days.since(nb.found)>=3'), true);
  s.clock({ abs: 20590, hours: 10 });                            // a checkpoint rewinds the clock past the stamp
  assert.equal(s.since('days', 'nb.found'), 0);
  s.set('midpoint');
  assert.ok(s.fact('midpoint').tick > s.fact('nb.found').tick);  // ordering by tick, never abs
});

// --- rules ----------------------------------------------------------------------------------------------------------
test('rules: indexed by atom; a cascade; once; repeat; quiet', () => {
  let ran = 0;
  const rules = [
    { id: 'a', when: 'f:crews.seen', then: ['f:westpads.heard'] },
    { id: 'b', when: 'f:westpads.heard', then: ['f:westpads.seen', 'scene:x'] },
    { id: 'c', on: 'lake', when: 'lake in [61,63]', then: ['f:ev.lake61=61'], repeat: true },
  ];
  const s = make({ rules });
  s.handle('scene', () => { ran++; });
  const r = s.rules;
  assert.ok(r.byKey.get('f:crews.seen').has(r.rules.get('a')));
  assert.ok(!r.byKey.get('f:crews.seen').has(r.rules.get('b')));
  s.set('crews.seen');
  assert.equal(s.has('westpads.seen'), true);
  assert.equal(ran, 1);
  s.emit('lake', { lake: 12 }); assert.equal(s.has('ev.lake61'), false);
  s.emit('lake', { lake: 61 }); assert.equal(s.get('ev.lake61'), 61);
  // the quiet re-run: state only
  const q = make({ rules: [{ id: 'q', when: 'f:crews.seen', then: ['f:westpads.seen', 'scene:x'] }] });
  let qs = 0; q.handle('scene', () => { qs++; });
  q.state.facts['crews.seen'] = [true, 1, 1, 0, 0, 1];          // (as a migrated document would hold it)
  q.rules.rerun({ quiet: true });
  assert.equal(q.has('westpads.seen'), true);
  assert.equal(qs, 0);
});
test('rules: an after timer fires on the clock, seeded', () => {
  const rules = [{ id: 'leak', on: 'canary:told', after: { days: [1, 3] }, then: ['f:ev.watchers={lake}'] }];
  const s = make({ rules, abs: 20600 });
  s.emit('canary:told', { who: 'denny', lake: 61 });
  assert.equal(s.has('ev.watchers'), false);
  assert.equal(s.state.timers.length, 1);
  const at = s.state.timers[0].at;
  assert.ok(at >= 20601 && at <= 20603.5);
  s.clock({ abs: 20604, hours: 0 });
  assert.equal(s.get('ev.watchers'), 61);
  assert.equal(s.state.timers.length, 0);
});
test('rules: a lie re-checked late', () => {
  const rules = [{ id: 'lie.denny', when: 'f:said.denny.tuesday & f:cal.2019-10-17.thu', then: ['f:lie.denny.tuesday', 'f:case.denny.tuesday=soft'] }];
  const s = make({ rules });
  s.set('said.denny.tuesday', 'tuesday');
  assert.equal(s.has('lie.denny.tuesday'), false);
  s.clock({ abs: 20700, hours: 9 });
  s.set('cal.2019-10-17.thu', true);                              // the calendar found weeks later
  assert.equal(s.has('lie.denny.tuesday'), true);
  assert.equal(s.get('case.denny.tuesday'), 'soft');
});
test('rules: a push waits for the director', () => {
  const s = make({ rules: [{ id: 'p', when: 'f:nb.found', push: true, then: ['f:tauno.met'] }] });
  let allow = false;
  s.beats = { push: () => allow };
  s.set('nb.found');
  assert.equal(s.has('tauno.met'), false);
  allow = true;
  s.clock({ abs: 20601, hours: 8 });                              // (asked again on the tick)
  assert.equal(s.has('tauno.met'), true);
});

// --- derived values -------------------------------------------------------------------------------------------------
test('derived: stages in order', () => {
  const s = make();
  const at = () => s.stage;
  assert.equal(at(), 'S0');
  s.found({ abs: 20600, key: 3, lake: 'Lake One' }); assert.equal(at(), 'S1');
  assert.deepEqual(s.walt(), ['w.found', 'w.cellar']);
  s.set('door.crews.declined'); assert.equal(at(), 'S1');         // a decline is not S2
  s.set('tauno.porch.done'); assert.equal(at(), 'S2');
  s.set('tauno.turn'); assert.equal(at(), 'S3');
  s.set('ev.search', 'C1544'); assert.equal(at(), 'S4');
  s.set('ev.adrift', true); assert.equal(at(), 'S5');
  s.set('end', 'J'); assert.equal(at(), 'S7');
  assert.equal(s.when('end:J|JN'), true);
  assert.equal(s.when('S2-S4'), false);
});
test('derived: tiers from the core rules (asked, never met), tier 4 on the clock, the cap', () => {
  const s = make({ abs: abs(2026, 7, 10) });
  s.meet('len');
  assert.equal(s.tier, 0);
  s.set('asked.boreal.2'); assert.equal(s.tier, 1);
  s.set('crews.seen'); assert.equal(s.tier, 2);
  s.set('midpoint'); assert.equal(s.tier, 3);
  s.clock({ abs: abs(2026, 8, 30), hours: 12 }); assert.equal(s.tier, 3);
  s.clock({ abs: abs(2026, 9, 1), hours: 12 }); assert.equal(s.tier, 4); // (September, after tier 3)
  s.set('choice.brekke', 'needle'); assert.equal(s.tier, 4);       // capped at 4 before the run
  s.set('run.lifted', true); assert.equal(s.tier, 5);
});
test('derived: big findings, north', () => {
  const s = make();
  s.set('door.mining.yield'); s.set('door.boys.yield');
  assert.equal(s.bigCount, 2); assert.equal(s.big.mining, true); assert.equal(s.when('bigCount>=2'), true);
  assert.equal(s.north, false);
  s.set('cards.seen'); s.set('gord.told');
  assert.equal(s.north, true);
});
test('doors and the porch: decline → re-hook → accept, taken beats declined', () => {
  for (const d of DOORS) {
    const s = make();
    assert.equal(s.door(d), 'none');
    s.set(`door.${d}.declined`); assert.equal(s.door(d), 'declined'); assert.equal(s.when(`door:${d}=declined`), true);
    s.set(`door.${d}.taken`); assert.equal(s.door(d), 'taken'); assert.equal(s.when(`door:${d}=taken`), true);
    assert.equal(s.has(`door.${d}.declined`), true);               // the decline stays; taken wins
  }
  const s = make();
  s.set('tauno.porch.declined1'); assert.equal(s.porch, 'declined1');
  s.set('tauno.porch.declined2'); assert.equal(s.porch, 'declined2');
  s.set('tauno.porch.done'); assert.equal(s.porch, 'done'); assert.equal(s.when('porch:done'), true);
});
test('locks: keys gained the moment they hold, lock 2 by the far end inked, gates read the whole lock', () => {
  const s = make();
  s.set('bc.205-50');
  assert.equal(s.has('key.L2B'), true);
  assert.deepEqual(s.lock(2).keys, ['L2B']);
  assert.equal(s.lock(2).solved, false);
  assert.equal(s.when('any(key.L2*)'), true);
  s.set('ink.farend', 'gull');
  assert.equal(s.lock(2).solved, true); assert.equal(s.when('lock:2'), true);
  s.set('aili.stone');
  assert.equal(s.lock(4).solved, true);
  // a key never taken back: the producer fact has nothing to undo, and the key's fact stays
  assert.equal(s.set('key.L2B', true), false);
  assert.equal(s.has('key.L2B'), true);
});
test('people: trust and fear clamped, cold up and down', () => {
  const s = make();
  s.person('aili', 'trust', '+', 5); assert.equal(s.state.ppl.aili.trust, 3);
  s.person('aili', 'fear', '-', 2); assert.equal(s.state.ppl.aili.fear, 0);
  s.person('aili', 'cold', '=', true); assert.equal(s.when('cold:aili'), true);
  s.person('aili', 'cold', '=', false); assert.equal(s.when('cold:aili'), false);
  assert.equal(s.when('trust:aili>=2'), true);
  assert.equal(s.when('met:aili'), false);
  s.meet('aili'); assert.equal(s.when('met:aili>=1'), true);
});
test('time atoms: month, date, dow, hour, daylight', () => {
  const s = make({ abs: abs(2026, 8, 13), hours: 21.5 });         // a Thursday
  assert.equal(s.when('month:6-9'), true);
  assert.equal(s.when('month:10'), false);
  assert.equal(s.when('date:08-08..08-15'), true);
  assert.equal(s.when('dow:tue|thu'), true);
  assert.equal(s.when('hour:20-23'), true);
  assert.equal(s.when('hour:7-10'), false);
  assert.equal(s.when('hour:22-4'), false);
  assert.equal(s.when('dark'), true);
  s.clock({ abs: abs(2026, 8, 13), hours: 12 });
  assert.equal(s.when('daylight'), true);
  assert.equal(s.when('year>=2026'), true);
});

// --- the save -------------------------------------------------------------------------------------------------------
test('save: v2 under story2, the v1 echo, a reload, a new season', () => {
  const store = io(), pr = profile('p-1');
  const s = new StoryV2({ io: store }); s.attach({ profile: pr }); s.clock({ abs: 20600, hours: 22 });
  s.found({ abs: 20600, key: 4, lake: 'Lake One' });
  s.read(0); s.read(1);
  s.flush();
  const d2 = store.read(NS2), d1 = store.read(NS1);
  assert.equal(d2.v, 2); assert.ok(d2.facts['nb.found']); assert.equal(d2.data, s.data);
  assert.equal(d2.notebook, undefined);                            // (the v1 getters are not saved)
  assert.equal(d1.v, 1); assert.equal(d1.notebook.found, true); assert.deepEqual(d1.read, [0, 1]);
  const t = new StoryV2({ io: store }); t.attach({ profile: profile('p-1') });
  assert.equal(t.state.notebook.found, true); assert.equal(t.state.notebook.lake, 'Lake One');
  assert.deepEqual(t.state.read, [0, 1]); assert.deepEqual(t.walt(), ['w.found', 'w.cellar']);
  pr.fire('season');                                               // (the same season id: still a blank, as v1)
  assert.equal(s.has('nb.found'), false);
  const u = new StoryV2({ io: store }); u.attach({ profile: profile('p-2') }); // another season's keys: blank
  assert.equal(u.has('nb.found'), false);
  assert.equal(u.state.season, 'p-2');
});
test('migration v1 → v2: a v1 finder gets nb.found and the Walt lines; flags under legacy.*; read[] kept', () => {
  const v1 = { v: 1, season: 'p-1', legacy: true, notebook: { found: true, abs: 20500, key: 7, lake: 'Farm Lake' }, read: [0, 2], flags: { tried: 3 } };
  const store = io({ [NS1]: v1 });
  const s = new StoryV2({ io: store }); s.attach({ profile: profile('p-1') });
  assert.equal(s.has('nb.found'), true); assert.equal(s.fact('nb.found').abs, 20500);
  assert.deepEqual(s.walt(), ['w.found', 'w.cellar']);             // through the night1 when: rule, quietly
  assert.equal(s.legacy, true); assert.equal(s.get('legacy.tried'), 3); assert.equal(s.flag('tried'), 3);
  assert.deepEqual(s.state.read, [0, 2]);
  assert.deepEqual(store.read(NS1).read, [0, 2]);                 // (the echo gives the pages back to a v1 build)
  assert.equal(s.meta().nightOneSeen, false);
  assert.ok(store.read(NS2));
  // an old season with no document at all: legacy, blank
  const t = new StoryV2({ io: io() }); t.attach({ profile: profile('p-1', true) });
  assert.equal(t.legacy, true); assert.equal(t.has('nb.found'), false);
  // a fresh season: not legacy
  const u = new StoryV2({ io: io() }); u.attach({ profile: profile('p-1', false) });
  assert.equal(u.legacy, false);
  // a v1 document of another season (a slot out of step): not migrated
  const w = new StoryV2({ io: io({ [NS1]: v1 }) }); w.attach({ profile: profile('p-9') });
  assert.equal(w.has('nb.found'), false);
});
test('the flag off then on: what a v1 build added this season is merged, never overwritten by the echo', () => {
  const store = io();
  const s = new StoryV2({ io: store }); s.attach({ profile: profile('p-1') }); s.flag('kept', 1); s.read(0); s.flush();
  // the flag off: the v1 build plays on (finds the notebook, reads page 1, sets a flag) on the same season's echo
  const v1 = store.read(NS1);
  v1.notebook = { found: true, abs: 20610, key: 3, lake: 'Lake One' }; v1.read.push(1); v1.flags.tried = 2;
  store.write(NS1, v1);
  // the flag on again
  const t = new StoryV2({ io: store }); t.attach({ profile: profile('p-1') });
  assert.equal(t.has('nb.found'), true); assert.equal(t.fact('nb.found').abs, 20610);
  assert.equal(t.state.notebook.lake, 'Lake One');
  assert.deepEqual(t.state.read, [0, 1]);
  assert.equal(t.flag('tried'), 2); assert.equal(t.flag('kept'), 1); assert.equal(t.get('legacy.tried'), 2);
  assert.deepEqual(t.walt(), ['w.found', 'w.cellar']);             // (the rules re-run quietly, as after a migration)
  const e = store.read(NS1);
  assert.equal(e.notebook.found, true); assert.deepEqual(e.read, [0, 1]); assert.equal(e.flags.tried, 2);
  // nothing moved on: no merge, no re-run
  const u = new StoryV2({ io: store }); u.attach({ profile: profile('p-1') });
  assert.equal(u.state.log.filter((r) => r[3] === 'merge').length, 1);
  // a season begun on the v1 build: that season's v1 document is migrated, not blanked
  store.write(NS1, { v: 1, season: 'p-2', notebook: { found: true, abs: 20700, key: null, lake: null }, read: [2], flags: {} });
  const w = new StoryV2({ io: store }); w.attach({ profile: profile('p-2') });
  assert.equal(w.state.season, 'p-2'); assert.equal(w.has('nb.found'), true); assert.deepEqual(w.state.read, [2]);
  // another season's v1 document never merges in
  const x = new StoryV2({ io: io({ [NS2]: store.read(NS2), [NS1]: { v: 1, season: 'p-9', notebook: { found: false }, read: [0, 1, 2], flags: { z: 1 } } }) });
  x.attach({ profile: profile('p-2') });
  assert.deepEqual(x.state.read, [2]); assert.equal(x.flag('z'), undefined);
});
test('the data hash: other story data on load re-runs the rules quietly', () => {
  const store = io(), rules1 = [{ id: 'x', on: 'nothing', then: [] }];
  const s = new StoryV2({ io: store, rules: rules1 }); s.attach({ profile: profile() });
  s.set('crews.seen'); s.flush();
  const rules2 = [{ id: 'y', when: 'f:crews.seen', then: ['f:westpads.seen', 'line:hi'] }];
  const t = new StoryV2({ io: store, rules: rules2 });
  let lines = 0; t.handle('line', () => { lines++; });
  assert.notEqual(t.data, s.data);
  t.attach({ profile: profile() });
  assert.equal(t.has('westpads.seen'), true);
  assert.equal(lines, 0);                                          // (quiet: no lines)
  assert.equal(t.state.data, t.data);
  assert.ok(t.state.log.some((r) => r[3] === 'data'));
});
test('story-meta is its own document', () => {
  const store = io(), s = new StoryV2({ io: store }); s.attach({ profile: profile() });
  s.setMeta({ nightOneSeen: true });
  assert.equal(store.read(META).nightOneSeen, true);
  assert.deepEqual(s.meta().endings, []);
});

// --- co-op: the guest's mirror (Part 3 call 7) -----------------------------------------------------------------------
test('mirror: a guest\'s own story never moves; only world facts come in; nothing is written', () => {
  const store = io(), pr = profile('p-guest');
  const s = new StoryV2({ io: store }); s.attach({ profile: pr }); s.set('crews.seen'); s.flush();
  const saved = store.map.get(NS2);
  let lines = 0; s.handle('line', () => { lines++; });
  s.addRules([{ id: 'm', on: 'walkout', then: ['line:tauno'] }]);
  s.setMode('mirror');
  assert.equal(s.mode, 'mirror');
  assert.equal(s.has('crews.seen'), false);                        // the guest's book is not their own story here
  assert.equal(s.set('tier.1'), false);
  assert.equal(s.found({ abs: 1 }), false);
  s.emit('walkout', { ep: 25 }); assert.equal(lines, 0);           // no rule runs
  s.clock({ abs: 20700 });
  pr.fire('season'); assert.equal(s.state.mirror, true);          // a season change stays in memory
  s.read(0); s.flag('a', 1); s.person('aili', 'trust', '+', 1); s.waltLine('w.x');
  assert.equal(s.applyMirror({ rev: 9, f: { 'nb.found': true, 'tier.2': true, 'tauno.porch.done': true, 'ink.farend': 'gull' } }), 3); // (porch is not a world fact)
  assert.equal(s.has('nb.found'), true); assert.equal(s.has('tauno.porch.done'), false);
  assert.equal(s.state.notebook.found, true);                      // the host's notebook, readable
  s.flush(); s.dirty();
  assert.equal(store.map.get(NS2), saved);                         // the guest's own document as it lay
});
test('the host side: world facts out', () => {
  const s = make(); s.set('nb.found'); s.set('tauno.porch.done'); s.set('tier.1');
  assert.deepEqual(Object.keys(s.worldFacts()).sort(), ['nb.found', 'tier.1']);
});
test('compile warns on a bare undeclared fact and an unknown sensor; the core rules and locks warn about nothing', () => {
  assert.ok(compile('wibble').warnings.some((w) => /undeclared fact "wibble"/.test(w)));
  assert.ok(compile('lead:nosuch').warnings.some((w) => /unknown sensor "lead:nosuch"/.test(w)));
  assert.ok(compile('days.since(nosuch.fact)>=2').warnings.some((w) => /nosuch\.fact/.test(w)));
  assert.deepEqual(compile('f:nb.found & days.since(tier.4)>=21 & any(key.L4*) & hour:7-10').warnings, []);
  const s = make();
  assert.deepEqual(s.debug.warnings(), []);
  s.addRules([{ id: 'probe.wibble', when: 'wibble', then: ['f:tier.1'] }]);
  assert.equal(s.debug.warnings().length, 1);
  assert.equal(s.has('tier.1'), false);
});
test('why and can', () => {
  const s = make();
  s.set('bc.205-50', true, 'carry:P256');
  const w = s.why('key.L2B');
  assert.equal(w.src, 'rule:lock.L2B');
  assert.ok(s.why('bc.205-50').log.length >= 1);
  const c = s.can('key.L1C');
  assert.equal(c[0].rule, 'lock.L1C'); assert.equal(c[0].ok, false);
  assert.deepEqual(c[0].lacks, ['f:crews.seen', 'f:westpads.seen']);
  assert.ok(blankDoc().v === 2);
});
