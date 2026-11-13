// Stream w's unit checks (the winter turn's story side, feed-season.js): node --test scripts/cmp-w-unit.mjs
// The turn's wake: the year.turned.<y> fact, the story event year:open (the minis' reseed hook), the winter's due timers
// run once and quietly (state actions only), a guest's mirror untouched, the run's field hook, R7 armed by the turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { StoryV2 } from '../src/story.js';
import { feed } from '../src/story-feed.js';
import { winter } from '../src/feed-season.js';
import { RULES_ALL } from '../src/story-data/all-rules.js';

const warn = console.warn; console.warn = () => {};
process.on('exit', () => { console.warn = warn; });
const abs = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
const profile = (id = 'p-w') => ({ seasonId: id, started: true, onChange: () => {} });

// a stand-in for season-turn.js: on/emit and the field hooks, as the real one has them
class FakeTurn {
  constructor() { this.h = new Map(); this.fields = new Set(); }
  on(evt, fn) { if (!this.h.has(evt)) this.h.set(evt, new Set()); this.h.get(evt).add(fn); return () => this.h.get(evt).delete(fn); }
  emit(evt, e) { for (const fn of this.h.get(evt) || []) fn(e, evt); }
  field(fn) { this.fields.add(fn); return () => this.fields.delete(fn); }
  fieldNow() { for (const fn of this.fields) { const r = fn(); if (r) return r; } return null; }
}
const TEST_RULE = { id: 'w.test.timer', on: 'w:test', after: { days: 30 }, then: ['f:asked.wtest.1', 'line:w.test'] };

function setup({ mirror = false } = {}) {
  const s = new StoryV2({ rules: [...RULES_ALL, TEST_RULE] });
  s.attach({ profile: profile() });
  s.newSeason('p-w');
  s.clock({ abs: abs(2026, 11, 10), hours: 10 });
  const T = new FakeTurn();
  const lines = []; s.handle('line', (arg) => lines.push(arg));
  const heard = []; s.on('year:open', (e) => heard.push(e));
  if (mirror) s.setMode('mirror');
  feed.start({ story: s, mods: { seasonTurn: T } });
  return { s, T, lines, heard };
}

test('the wake writes year.turned.<y> and says year:open once', () => {
  const { s, T, heard } = setup();
  s.clock({ abs: abs(2027, 5, 2), hours: 7 });
  T.emit('wake', { year: 2027, from: 2026, abs: abs(2027, 5, 2), auto: false });
  assert.equal(s.has('year.turned.2027'), true);
  assert.equal(heard.length, 1);
  assert.deepEqual([heard[0].year, heard[0].from, heard[0].auto], [2027, 2026, false]);
  assert.equal(s.when('any(year.turned.*)'), true);
  assert.equal(winter.last().year, 2027);
  feed.stop();
});

test('the winter\'s due timers fire once, quietly (state only), before the next tick', () => {
  const { s, T, lines } = setup();
  s.emit('w:test', {});
  assert.equal(s.doc.timers.length, 1);
  s.clock({ abs: abs(2027, 5, 2), hours: 7 }); // (the clock is moved: the tick would play the line; the wake runs first in the game)
  // undo the tick's own firing to check the wake path: re-arm
  s.doc.timers = [{ rule: TEST_RULE.id, at: abs(2026, 12, 10), args: {} }];
  delete s.doc.facts['asked.wtest.1']; lines.length = 0;
  T.emit('wake', { year: 2027, from: 2026, abs: abs(2027, 5, 2) });
  assert.equal(s.has('asked.wtest.1'), true, 'the state action ran');
  assert.equal(lines.length, 0, 'the line waited for no one');
  assert.equal(s.doc.timers.length, 0);
  assert.deepEqual(winter.last().timers, [TEST_RULE.id]);
  s.clock({ abs: abs(2027, 5, 2), hours: 8 });
  assert.equal(lines.length, 0, 'not played again on the tick');
  feed.stop();
});

test('two years turned at once write both', () => {
  const { s, T } = setup();
  s.clock({ abs: abs(2028, 5, 2), hours: 7 });
  T.emit('wake', { year: 2028, from: 2026, abs: abs(2028, 5, 2) });
  assert.equal(s.has('year.turned.2027') && s.has('year.turned.2028'), true);
  feed.stop();
});

test('a guest\'s mirror: nothing written, no hook', () => {
  const { s, T, heard } = setup({ mirror: true });
  T.emit('wake', { year: 2027, from: 2026, abs: abs(2027, 5, 2) });
  assert.equal(s.has('year.turned.2027'), false);
  assert.equal(heard.length, 0);
  assert.equal(T.fields.size, 0);
  feed.stop();
});

test('the run\'s field hook: on while run.active reads true, off with the feed', () => {
  const { s, T } = setup();
  assert.equal(T.fieldNow(), null);
  const off = s.sensor('run.active', () => true);
  assert.deepEqual(T.fieldNow(), { ep: null });
  off();
  feed.stop();
  assert.equal(T.fields.size, 0);
});

test('R7 ("Ice is out") reads the turn', () => {
  const { s, T } = setup();
  assert.equal(s.when('any(year.turned.*) & !f:rehook.R7'), false);
  s.clock({ abs: abs(2027, 5, 2), hours: 7 });
  T.emit('wake', { year: 2027, from: 2026, abs: abs(2027, 5, 2) });
  assert.equal(s.when('any(year.turned.*) & !f:rehook.R7'), true);
  feed.stop();
});
