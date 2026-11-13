// Stream x's unit checks (the campaign run: chapter 2's finish with the owner's calls). Node, no browser.
//   node scripts/cmp-x-unit.mjs
//   kettle    one 4-hour wet day is the spell; the latest spell's window wins; the notice re-posts on a later rain and
//             can be taken again (episodes.js flyer.posting), and it is down once the Kettle day is done
//   pay       story pay with no trip on is paid at once (into the purse, the line kept as paid); on a trip it waits for
//             the tally; a $0 line pays nothing
//   page      a taken notice heads its episode's page (S7); the arc's taken Kettle notice keeps its own page; S7/S9's
//             drafted page lines come true by their facts
//   places    the mining arc offers the Kettle pad as a beat place from "The pads" until the day is done
//   lines     every d95.* id the code names is in drafted.json; Len's and Mary's later talks open with their lines
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { StoryV2 } = await import(path.join(ROOT, 'src/story.js'));
const { Episodes } = await import(path.join(ROOT, 'src/episodes.js'));
const { EPISODES } = await import(path.join(ROOT, 'src/story-data/episodes/index.js'));
const { Beats } = await import(path.join(ROOT, 'src/beats.js'));
const { rain } = await import(path.join(ROOT, 'src/feed-weather.js'));
const { texts, T, SceneRun, topics } = await import(path.join(ROOT, 'src/topics.js'));
const M = await import(path.join(ROOT, 'src/story-data/mining.js'));
const { registerSensor } = await import(path.join(ROOT, 'src/story-cond.js'));
for (const [k, v] of Object.entries(M.A2_SENSORS)) registerSensor(k, v);
const TEXT = path.join(ROOT, 'src/story-data/text');
const ALL = {};
for (const f of readdirSync(TEXT).filter((x) => x.endsWith('.json'))) { const j = JSON.parse(readFileSync(path.join(TEXT, f), 'utf8')); texts.add(j); Object.assign(ALL, j.text); }
const words = (id) => (ALL[id] ? ALL[id].text : null);
const warn = console.warn; console.warn = (...a) => { if (!/story\.set|story rule|episodes/.test(String(a[0]))) warn(...a); };
let pass = 0, fail = 0;
const ok = (name, cond, more = {}) => { if (cond) pass++; else fail++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : JSON.stringify(more).slice(0, 900)); };
const absOf = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);

function world({ y = 2026, m = 7, d = 14, h = 19, trip = null } = {}) {
  const s = new StoryV2();
  const earned = [];
  const profile = { seasonId: 'x', started: true, home: 31, money: 100, earn(n) { this.money += n; earned.push(n); }, onChange() {} };
  s.attach({ profile });
  if (trip) { s.ctx.trip = trip; s.ctx.tripN = () => trip.n; }
  s.clock({ abs: absOf(y, m, d), hours: h });
  const E = new Episodes();
  for (const r of EPISODES) E.register(r);
  E.attach({ story: s, record: { first: () => true }, text: words });
  return { s, E, profile, earned };
}

// --- kettle: the spell, its window, the re-post ----------------------------------------------------------------------
{
  const { s, E } = world();
  rain.story = s; rain.cache.clear();
  // a weather with rain 05:00–08:59 on two days a week apart (4 hours each), fair otherwise
  const d1 = absOf(2026, 7, 14), d2 = absOf(2026, 7, 21);
  const DAY0 = (yy) => Math.round(Date.UTC(yy, 0, 1) / 86400000) - 1;
  rain.weather = { _hour: (yy, hr) => { const abs = DAY0(yy) + Math.floor(hr / 24) + 1, h = hr % 24; return { s: (abs === d1 || abs === d2) && h >= 5 && h < 9 ? 5 : 1 }; } };
  const S1 = rain.spellAt(d1 + 0.8);
  ok('kettle: one 4-hour wet day is the spell (was two 6-hour days running)', S1 && S1.a === d1 && S1.b === d1, { S1, hours: rain.hours(d1) });
  ok('kettle: a 3-hour day is not', (() => { const keep = rain.weather; rain.cache.clear(); rain.weather = { _hour: (yy, hr) => ({ s: Math.floor(hr / 24) + 1 + DAY0(yy) === d1 && hr % 24 < 3 ? 5 : 1 }) }; const r = rain.spellAt(d1 + 0.8); rain.weather = keep; rain.cache.clear(); return r === null; })(), {});
  const S2 = rain.spellAt(d2 + 0.8);
  ok('kettle: a later rain is the spell that counts (the latest window)', S2 && S2.a === d2, { S2 });
  s.sensor('kettlenotice', () => !!rain.spellAt(s.nowAbs()));
  s.sensor('kettlespell', () => { const S = rain.spellAt(s.nowAbs()); return S ? S.a : 0; });
  s.set('tauno.said.pads', true);
  s.clock({ abs: d1, hours: 19 }); E.dayTurn(true);
  const KF = (ep) => E.flyers(ep).filter((f) => f.id === 'ep:mining'); // j1: only the Kettle notice (7c's M1 flyer is on Farm's board too)
  const F1 = KF(31), took1 = F1[0] ? E.take(F1[0].id) : false, after1 = KF(31);
  ok('kettle: the notice up the first evening of the rain; taken, it reads taken (kettle.notice)', F1.length === 1 && !F1[0].taken && took1 && after1[0] && after1[0].taken && s.has('kettle.notice'), { F1, after1 });
  s.clock({ abs: d2, hours: 19 }); E.dayTurn(true);
  const F2 = KF(31);
  ok('kettle: on the later rain the notice is up again, untaken (the Kettle day not done)', F2.length === 1 && !F2[0].taken, { F2 });
  const took2 = E.take(F2[0].id);
  ok('kettle: a re-posted notice can be taken again (no second yes: the arc\'s yes is the bench)', took2 && E.flyers(31)[0].taken && !E.started('mining'), {});
  s.set('kettle.done', true);
  ok('kettle: down once the Kettle day is done', KF(31).length === 0, {});
  rain.clear();
}

// --- pay: at once off a trip; at the tally on one; $0 says nothing ---------------------------------------------------
{
  const trip = { n: 2, active: false };
  const { s, profile, earned } = world({ trip });
  const b = new Beats().attach(s);
  s.action('pay', '25@d95.S7.pay', { rule: 'ep.S7.s0' });
  const D = s.doc.dir;
  ok('pay: no trip on: paid at once into the purse, the line kept as paid', earned.join() === '25' && profile.money === 125 && D.pay.length === 1 && D.pay[0].paid && D.pay[0].text === words('d95.S7.pay'), { earned, pay: D.pay });
  s.action('pay', '0@30:4.9.gas', { rule: 'a2:gas' });
  ok('pay: a $0 line pays nothing', earned.join() === '25', { earned });
  trip.active = true;
  s.action('pay', '35@30:4.3.pay.1', { rule: 'a2.kettle' });
  ok('pay: on a trip it is owed, not paid', earned.join() === '25' && D.pay.filter((p) => !p.paid).length === 1, { pay: D.pay });
  const lines = b.tallyLines({});
  ok('pay: the trip-end tally pays it, once (the paid-at-once lines are not paid again)', lines.length === 1 && lines[0].pay === 35 && earned.join() === '25,35', { lines, earned });
}

// --- the page: the notice's words; the arc's notice page; the drafted lines -----------------------------------------
{
  const { s, E } = world({ m: 6, d: 9, h: 11 });
  E.dayTurn(true);
  E.take('ep:S7');
  const p0 = E.page('S7');
  const notice = words('S7.notice').replace(/\s*\n\s*/g, ' ');
  ok('page: a taken notice heads its page (Rose\'s S7)', p0 && p0.lines[0] === notice, { p0 });
  s.set('ep.S7.rose', true); s.set('rose.said.whose', true); s.set('ep.S7.asked', true); s.set('rose.said.boys', true); s.set('ep.S7.step', true);
  const p1 = E.page('S7');
  ok('page: S7\'s drafted lines come true by their facts, never a bare "Mummo\'s"', p1.title === 'Mummo\'s' && ['d95.S7.page.rose', 'd95.S7.page.whose', 'd95.S7.page.where', 'd95.S7.page.boys', 'd95.S7.page.step'].every((id) => p1.lines.includes(words(id))), { p1 });
  // the arc's Kettle notice: a page of its own once taken
  const W = world();
  W.s.sensor('kettlenotice', () => true); W.s.set('tauno.said.pads', true); W.E.dayTurn(true);
  const none = W.E.pages().length;
  W.E.take('ep:mining');
  const P = W.E.pages(), K = P.find((q) => q.id === 'mining');
  ok('page: the taken Kettle notice keeps a page in Stories, under the tally\'s name for the day', none === 0 && K && K.title === words('30:4.3.pay.1') && K.lines[0] === words('30:4.3.notice'), { none, P });
  W.s.set('kettle.done', true);
  ok('page: the Kettle day done adds its last line', W.E.page('mining').lines.includes(words('d95.kettle.page.done')), { page: W.E.page('mining') });
  // S9
  const Z = world({ m: 7, d: 10, h: 12 });
  Z.E.yes('S9', 'unit'); Z.s.set('mg.snag.hooked', true);
  ok('page: S9\'s hook-up line', Z.E.page('S9') && Z.E.page('S9').lines.includes(words('d95.S9.page.hooked')), { page: Z.E.page('S9') });
}

// --- places: the Kettle pad as the arc's beat place --------------------------------------------------------------------
{
  const { s, E } = world();
  const layer = { place: (id) => (id === 'kettle' ? { x: -26950, z: 30600, r: 360 } : null) };
  E.c.layer = layer;
  s.set('ep.mining.yes', true);
  const a = E.places();
  s.set('tauno.said.pads', true);
  const b = E.places();
  s.set('kettle.done', true);
  const c = E.places();
  ok('places: the Kettle pad offered only from "The pads" until the day is done, with the orange-creek line', a.length === 0 && b.length === 1 && b[0].place === 'kettle' && b[0].line === '30:9.beat.4' && c.length === 0, { a, b, c });
}

// --- lines: the drafted ids are all there; the repeat openers ----------------------------------------------------------
{
  const src = ['src/story-data/mining.js', 'src/mining-cast.js', 'src/feed-episodes.js', 'src/story-data/walt-lines.js', 'src/story-data/notebook.js', 'src/beats.js',
    'src/story-data/episodes/s7-mummos.js', 'src/story-data/episodes/s9-coffee.js', 'src/story-data/episodes/arc-mining.js'].map((f) => readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const ids = [...new Set(src.match(/d95\.[\w.]+/g) || [])].map((x) => x.replace(/\.$/, ''));
  const missing = ids.filter((id) => !words(id));
  ok('lines: every drafted id the code names has its words (docs/story/95 → drafted.json)', ids.length >= 18 && !missing.length, { ids, missing });
  const s = new StoryV2(); s.attach({ profile: { seasonId: 'y', started: true, onChange() {} } });
  topics.attach({ story: s });
  s.set('len.met', true); s.set('mary.met', true);
  const nodeOf = (def, who, start) => new SceneRun(topics, def, { who, args: { ep: 31 } }).node(start);
  const l = nodeOf(M.LEN, 'len', M.lenEntry(s)), m = nodeOf(M.MARY, 'mary', M.maryEntry(s));
  ok('lines: Len\'s and Mary\'s later talks open with a line, not "…"', l && l.say === T('d95.len.again') && m && m.say === T('d95.mary.again') && l.choices.length > 0, { l: l && l.say, m: m && m.say });
}

console.log(`cmp-x-unit: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
