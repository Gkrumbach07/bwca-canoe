// Round 7 stream 7a: the three minigames (nightwatch, howl, skywatch) and the records, in Node. node scripts/cmp-7a-unit.mjs
import { nightwatch, NIGHT } from '../src/minigames/nightwatch.js';
import { howl, packAt, crossing, bearingDeg, canHowl } from '../src/minigames/howl.js';
import { strongNights, trainNights, forecast, forecastWords, plan, onelight, subjectsFor } from '../src/minigames/skywatch.js';
import { EPISODES } from '../src/story-data/episodes/index.js';
import { checkRecord, compileEpisode } from '../src/episodes.js';

let fails = 0;
const ok = (c, what, more = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${what}${more ? ` ${more}` : ''}`); if (!c) fails++; };

// --- nightwatch -------------------------------------------------------------------------------------------------------
{
  const said = [];
  const api = { emit: (r) => said.push(r), done: (r) => said.push(`done:${r}`) };
  const h = nightwatch({ ridge: { a: { x: -30, z: 40 }, b: { x: 30, z: 40 } }, tent: { x: 0, z: 0 }, berry: { x: 30, z: 42 }, birches: { x: 0, z: 45 }, hung: true, hours: 2 }, api);
  let steps = 0, knocks = 0;
  for (let t = 2; t < 2.21; t += 1 / 3600 * 8) { h.update(1 / 60, { hours: t, player: { x: 0, z: 0, onFoot: true }, lamp: 'off' }); for (const c of h.cues.splice(0)) { if (c.kind === 'step') steps++; if (c.kind === 'knock') knocks++; } }
  ok(steps >= 4 && knocks === 1, 'nightwatch: the cow\'s steps and the calf\'s knock', `steps ${steps} knocks ${knocks}`);
  ok(said.includes('bear') && said.includes('done:done'), 'nightwatch: the bear at the berries, then done', said.join(','));
  // the frame: in the quiet minute, lamp off, at the birches
  const h2 = nightwatch({ ridge: { a: { x: -30, z: 40 }, b: { x: 30, z: 40 } }, tent: { x: 0, z: 0 }, birches: { x: 0, z: 45 }, hours: 2 }, {});
  h2.update(0, { hours: 2.075, player: { x: 0, z: 0, onFoot: true } });
  ok(h2.frameOk({ eye: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, lamp: 'off' }), 'nightwatch: the frame in the silent minute');
  ok(!h2.frameOk({ eye: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, lamp: 'white' }), 'nightwatch: never with the lamp white');
  ok(!h2.frameOk({ eye: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, lamp: 'off' }), 'nightwatch: never off the birches');
  // the charge: on foot near the calf, lamp off
  const s3 = []; const h3 = nightwatch({ ridge: { a: { x: -30, z: 40 }, b: { x: 30, z: 40 } }, tent: { x: 0, z: 0 }, hours: 2 }, { emit: (r) => s3.push(r) });
  h3.update(0, { hours: 2.01 }); const c = h3.calf();
  h3.update(0.1, { hours: 2.011, player: { x: c.x + 3, z: c.z, onFoot: true }, lamp: 'off' });
  ok(s3.includes('charged'), 'nightwatch: the bluff charge near the calf', s3.join(','));
  // lit: eyeshine, freeze, the print clear within 25 m
  const s4 = []; const h4 = nightwatch({ ridge: { a: { x: -30, z: 40 }, b: { x: 30, z: 40 } }, tent: { x: 0, z: 0 }, hours: 2 }, { emit: (r) => s4.push(r) });
  h4.update(0, { hours: 2.01 }); const m = h4.moose();
  h4.update(0.1, { hours: 2.011, player: { x: m.x, z: m.z - 15, onFoot: true }, lamp: 'white', face: { x: 0, z: 1 } });
  ok(s4.includes('lit') && h4.subjectsFor({ eye: { x: m.x, z: m.z - 15 }, dir: { x: 0, z: 1 }, lamp: 'white' }).includes('s2.moose'), 'nightwatch: lit, the moose print', s4.join(','));
  ok(NIGHT.end > NIGHT.bear[0], 'nightwatch: the table in order');
}

// --- howl ----------------------------------------------------------------------------------------------------------------
{
  ok(canHowl(23.5) && canHowl(3) && !canHowl(12), 'howl: 23:00 to 04:00');
  ok(Math.round(bearingDeg(0, -1)) === 0 && Math.round(bearingDeg(1, 0)) === 90, 'howl: bearings north 0, east 90');
  const p = packAt({ year: 2026, doy: 200, seed: 'x', range: { x: 0, z: -2000, r: 500 } });
  ok(Math.hypot(p.x, p.z + 2000) <= 500, 'howl: the pack inside its range');
  let answered = 0, marked = 0;
  for (let n = 0; n < 40; n++) {
    const res = [];
    const h = howl({ station: { id: 'st1', x: 0, z: 0 }, pack: { x: 0, z: -2000 }, month: 8, seed: n, hours: 3 }, { emit: (r) => res.push(r), done: (r) => res.push(`done:${r}`) });
    for (let k = 0; k < 400 && !h.done; k++) { h.update(1 / 60, { hours: 3 + k / 3600 }); if (h.phase === 'listen') { h.mark(2); } }
    if (res.includes('answered')) answered++;
    if (res.includes('done:marked')) marked++;
  }
  ok(answered > 25 && marked === answered, 'howl: answered near 03:00 and marked', `${answered}/40, marked ${marked}`);
  const far = howl({ station: { id: 'st1', x: 0, z: 0 }, pack: { x: 0, z: -9000 }, seed: 1, hours: 3 }, {});
  for (let k = 0; k < 400 && !far.done; k++) far.update(1 / 60, { hours: 3 + k / 3600 });
  ok(far.done && far.done.result === 'silent', 'howl: out of hearing, silence');
  const X = crossing([{ x: 0, z: 0, deg: 315 }, { x: -2000, z: 0, deg: 45 }, { x: -1000, z: -2000, deg: 180 }]);
  ok(X && Math.abs(X.x + 1000) < 50 && Math.abs(X.z + 1000) < 50, 'howl: three lines cross', JSON.stringify(X));
}

// --- skywatch ------------------------------------------------------------------------------------------------------------
{
  const S = strongNights(2026, 'x');
  ok(S.length >= 4 && S.length <= 6, 'skywatch: 2–3 strong nights a month, Sept and Oct', S.join(','));
  ok(trainNights(2026, 'x').length >= 6, 'skywatch: the train dates');
  const f = forecast(2026, S[0] - 3, 'x');
  ok(f && /^NORTHERN LIGHTS: (Sept|Oct) \d+–\d+, strong$/.test(forecastWords(f, 2026)), 'skywatch: the forecast card', forecastWords(f, 2026));
  const P = plan({ year: 2026, doy: S[0], seed: 'x', clear: true, calm: true, moon: 0.1, logged: 0 });
  ok(P.events.some((e) => e.kind === 'aurora') && P.beat, 'skywatch: a strong night has the aurora and a beat');
  const P2 = plan({ year: 2026, doy: S[0], seed: 'x', clear: true, calm: true, moon: 0.1, logged: 2 });
  ok(P2.events.some((e) => e.kind === 'onelight') && !P2.beat, 'skywatch: two logged, calm, dark: the one light (no beat)');
  ok(!plan({ year: 2026, doy: 250, seed: 'x', calm: true, moon: 0.1, logged: 2, partyNorth: true }).events.some((e) => e.kind === 'onelight'), 'skywatch: never with a party at the north end');
  let beats = new Set(), last = null;
  for (let d = 245; d < 300; d++) { const q = plan({ year: 2026, doy: d, seed: 'x', calm: true, moon: 0.8, lastBeat: last }); if (q.beat) { ok(q.beat.kind !== last, `skywatch: no beat twice running (${d})`); last = q.beat.kind; beats.add(q.beat.kind); } }
  ok(beats.size === 4, 'skywatch: all four beats come round', [...beats].join(','));
  const res = [];
  const o = onelight({ at: { x: 0, z: -800 }, wind: { x: 0, z: 1 } }, { emit: (r) => res.push(r), done: (r) => res.push(`done:${r}`) });
  o.update(1, { player: { x: 0, z: 0 }, lamp: 'off', face: { x: 0, z: -1 } });
  ok(o.z < -800, 'skywatch: the one light drifts upwind');
  o.update(0.1, { player: { x: 0, z: 0 }, lamp: 'white', face: { x: 0, z: -1 } });
  ok(res.includes('done:out'), 'skywatch: out the moment the lamp shows white', res.join(','));
  ok(subjectsFor({ eye: { x: 0, z: 0 }, dir: { x: 0, y: 0.2, z: -1 }, events: [{ kind: 'aurora', from: 23, to: 26 }], hours: 24.5 }).includes('s3.aurora'), 'skywatch: an aurora print faces north');
}

// --- the records ------------------------------------------------------------------------------------------------------------
for (const id of ['S2', 'S3', 'S4']) {
  const E = EPISODES.find((e) => e.id === id);
  ok(E && !checkRecord(E).length, `record ${id}`, E ? checkRecord(E).join('; ') : 'missing');
  ok(E && !E.slot && compileEpisode(E).length > 2, `record ${id}: compiles, no slot`);
}
ok(!EPISODES.find((e) => e.id === 'S2').ends.some((e) => /shut/.test(e.when)), 'S2: never closes by itself (Part 3 #4)');

console.log(fails ? `cmp-7a-unit: ${fails} FAIL` : 'cmp-7a-unit: all pass');
process.exit(fails ? 1 : 0);
