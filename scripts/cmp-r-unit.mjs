// cmp-r unit checks (Node): the detection table (50 §6.4), the states, the catch rules, the legs, the tie-off's stops.
//   node --test scripts/cmp-r-unit.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { sightRange, hearRange, Stealth, RUN_TUNE } from '../src/stealth.js';
import { ROUTES, routeFor, legAt, PT } from '../src/run-legs.js';
import { tieoff, tieoffSpot } from '../src/minigames/tieoff.js';

test('sight ranges are the doc table', () => {
  assert.equal(sightRange({ lamp: 'white', cover: 'open' }), 800);
  assert.equal(sightRange({ lamp: 'white', cover: 'shore' }), 250);
  assert.equal(sightRange({ lamp: 'red', cover: 'open' }), 80);
  assert.equal(sightRange({ lamp: 'off', moon: true, cover: 'open' }), 120);
  assert.equal(sightRange({ lamp: 'off', moon: false, cover: 'open' }), 50);
  assert.equal(sightRange({ lamp: 'off', moon: true, cover: 'open', moving: false }), 60);
  assert.equal(sightRange({ lamp: 'off', cover: 'reeds', moving: false }), 3);
  assert.equal(sightRange({ lamp: 'white', cover: 'under' }), 0);
  assert.equal(sightRange({ day: true, cover: 'open' }), 1500);
  assert.equal(sightRange({ lamp: 'white', cover: 'open', fog: 0.8 }), 400);
  assert.equal(sightRange({ lamp: 'off', moon: true, cover: 'open', fog: 0.8, dawnFog: true }), 30);
});
test('hearing ranges by wind', () => {
  assert.equal(hearRange('paddle', 0), 80); assert.equal(hearRange('paddle', 10), 30); assert.equal(hearRange('paddle', 20), 0);
  assert.equal(hearRange('grumman', 0), 400); assert.equal(hearRange('pack', 20), 50);
});
test('states: noticed, seen after 2 s, lost after 10 game minutes; caught by a held light', () => {
  const S = new Stealth(), w = { id: 'two', x: 0, z: 0, light: true, cone: 0 };
  const sig = { x: 100, z: 0, lamp: 'white', moving: true, moon: false, day: false, cover: 'open' };
  assert.equal(S.judge(w, sig, 0.5, 1), null); assert.equal(S.state('two'), 'noticed');
  S.judge(w, sig, 1.0, 1.001); S.judge(w, sig, 1.0, 1.002); assert.equal(S.state('two'), 'seen');
  const dark = { ...sig, x: 5000 };
  S.judge(w, dark, 0.1, 1.2); assert.equal(S.state('two'), 'lost');
  // held in the light within 25 m for 3 s
  const S2 = new Stealth(), near = { ...sig, x: 20, lamp: 'off' };
  let r = null; for (let k = 0; k < 40 && !r; k++) r = S2.judge(w, near, 0.1, 2 + k * 0.0001);
  assert.equal(r, 'caught');
  // a still, dark player in reeds is never caught by the sweep at close range (the last pass)
  const S3 = new Stealth(), reeds = { ...near, moving: false, cover: 'reeds' };
  r = null; for (let k = 0; k < 60 && !r; k++) r = S3.judge(w, { ...reeds, x: 6 }, 0.1, 3 + k * 0.0001);
  assert.equal(r, null);
  // landing within 10 m of a posted watcher
  const S4 = new Stealth();
  assert.equal(S4.judge({ ...w, posted: true }, { ...sig, x: 8, landing: true }, 0.1, 4), 'caught');
});
test('a sound is noticed by a watcher in range', () => {
  const S = new Stealth(), w = { id: 'one', x: 0, z: 0 };
  assert.equal(S.hear('pack', 250, 0, 0, [w], 1), 1); assert.equal(S.state('one'), 'noticed');
  assert.equal(S.hear('paddle', 250, 0, 0, [{ id: 'x', x: 0, z: 0 }], 1), 0);
});
test('routes and legs', () => {
  assert.equal(routeFor({ ep: 30 }).id, 'lakeone'); assert.equal(routeFor({ ep: 33 }).id, 'gabbro'); assert.equal(routeFor(null).id, 'any');
  const R = ROUTES.lakeone;
  assert.equal(legAt(R, PT.dam[0], PT.dam[1], 0).leg.id, 'bay');
  assert.equal(legAt(R, PT.p26w[0] + 300, PT.p26w[1] - 300, 4).leg.id, 'p26');
  assert.equal(legAt(R, PT.dam[0], PT.dam[1], 6).i >= 5, true); // never thrown back to the bay
  assert.ok(RUN_TUNE.cpClear === 400 && RUN_TUNE.caughtLight === 25);
});
test('tie-off: a spot at the edge; the rest stops at the caller\'s stop', async () => {
  const world = { shoreAt: (x) => -x };
  assert.ok(tieoffSpot({ world }, 2, 0)); assert.equal(tieoffSpot({ world }, 20, 0), null); assert.equal(tieoffSpot({ world }, -1, 0), null);
  const day = { hours: 22, advance(h) { this.hours = (this.hours + h) % 24; this.adv = h; } };
  let slept = 0; const energy = { sleep: (q, h) => { slept = h; } };
  const p = { x: 0, z: 0, mode: 'paddle', speed: 0 };
  const h = tieoff({ snag: { x: 0, z: 0 }, ctx: { player: p, day, energy, stopAt: () => 24 + 4.5 } }, {});
  const r = await h.rest(7);
  assert.equal(Math.round(r.hours * 10) / 10, 6.5); assert.equal(r.stopped, true); assert.equal(slept, r.hours);
  p.mode = 'walk'; assert.deepEqual(h.update(0.1), { done: true, result: 'untied' });
});
