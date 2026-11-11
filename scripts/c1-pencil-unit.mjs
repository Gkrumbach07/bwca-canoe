// c1-pencil-unit: stream P's pencil and leads in Node (no browser): rings and their voices, the talk cap, the saved
// document, nicknames pencilled, rubbed, matched and inked (never without a world confirmation), the leads' lifecycle
// (born → followed → closed, overtaken), the keepers' asks, the guest's mirror, and the data's own rules.
//   node scripts/c1-pencil-unit.mjs
import { StoryV2 } from '../src/story.js';
import { Pencil, SECOND_VOICE, PENCIL_SENSORS } from '../src/pencil.js';
import { Leads } from '../src/leads.js';
import { LAKES, PLACES, LEADS, ASKS, INK, LINES } from '../src/story-data/leads-act1.js';
import { compile, registerSensor } from '../src/story-cond.js';

let pass = 0, fail = 0;
const ok = (c, name, more = '') => { if (c) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, more); } };

// a small world: each LAKES key as a round lake of 1.2 km at its point, with the doc's name; plus the stores
const lakes = Object.entries(LAKES).map(([k, q], i) => ({ id: i + 1, key: k, name: q.name, cx: q.x, cz: q.z, R: k === 'baldeagle' ? 1500 : 1200 }));
lakes.push({ id: lakes.length + 1, name: 'Gull Lake', cx: 60000, cz: 60000, R: 900 }); // (another Gull, far off: not the far end)
const world = { lakes, entryPoints: [{ ep: 33, x: -27900, z: 25100 }, { ep: 31, x: -39185, z: 21815 }, { ep: 25, x: -21225, z: 11115 }, { ep: 38, x: 30000, z: -9000 }, { ep: 12, x: -89005, z: -20325 }] };
const lakeAt = (w, x, z) => { for (const L of w.lakes) if (Math.hypot(x - L.cx, z - L.cz) < L.R) return L.id; return 0; };
const stores = { 31: { x: -39150, z: 21790 }, 25: { x: -21200, z: 11100 }, 38: { x: 30010, z: -9010 }, 12: { x: -89000, z: -20300 } };
const player = { x: 0, z: 0 };

function fresh() {
  const story = new StoryV2();
  story.attach({ profile: { seasonId: 'p-unit', started: true } });
  story.clock({ abs: 20600, hours: 9 });
  const pencil = new Pencil().attach({ story, world, lakeAt, storeOf: (ep) => stores[ep], player });
  const leads = new Leads().attach({ story, pencil });
  return { story, pencil, leads };
}

// 1 the data
{
  for (const k of Object.keys(PENCIL_SENSORS)) registerSensor(k, PENCIL_SENSORS[k]);
  const conds = [...LEADS.flatMap((l) => [l.born, l.followed, l.closes].filter(Boolean)), ...ASKS.map((a) => a.if), ...INK.flatMap((r) => [r.when, r.match && r.match.when].filter(Boolean))];
  const bad = conds.map((c) => [c, compile(c)]).filter(([, c]) => !c.ok || c.warnings.length);
  ok(bad.length === 0, 'data: every condition compiles with no warning', JSON.stringify(bad.map(([s, c]) => [s, c.errors, c.warnings])));
  ok(INK.every((r) => /ringon:|onlake:/.test(r.when)), 'data: every INK row needs a ring or a presence (no metal detector)');
  ok(INK.every((r) => !/^\s*true\s*$/.test(r.when)), 'data: no INK row is just true');
  ok(LEADS.every((l) => l.ring && (l.ring.by || l.ring.ask)), 'data: every lead has ring.by or ring.ask');
  ok(LEADS.every((l) => !!l.subject && (('place' in l.subject) !== ('person' in l.subject)) && (!l.subject.where || l.subject.person)), 'data: one subject each, a where only on a person');
  ok(ASKS.every((a) => PLACES[a.ring]), 'data: every ask rings a known place');
  ok(Object.values(LINES).every((l) => l.text && l.doc && !/\b(then|after that|go to)\b/i.test(l.text)), 'data: lead lines have their doc and no step words');
}

// 2 rings, voices, the talk cap, the saved doc
{
  const { story, pencil } = fresh();
  const r1 = pencil.ring({ place: 'ep33', by: 'Ruth', talk: 't1' });
  ok(r1 && r1.who === 'Ruth' && r1.places.includes('ep33'), 'ring: a keeper rings Little Gabbro', JSON.stringify(r1));
  const r2 = pencil.ring({ x: r1.x + SECOND_VOICE - 20, z: r1.z, by: 'Hap', talk: 't2' });
  ok(r2.id === r1.id && r2.who === 'Ruth; Hap' && pencil.rings().length === 1, 'ring: a second voice within 200 m joins the ring');
  pencil.ring({ place: 'farm31', by: 'Ruth', talk: 't1' });
  const r4 = pencil.ring({ place: 'moose25', by: 'Ruth', talk: 't1' });
  ok(r4 === null && pencil.rings().length === 2, 'ring: one conversation pencils at most two rings');
  ok(story.doc.pencil.rings.length === 2, 'ring: saved in the story document');
  story.flush();
  const s2 = new StoryV2({ io: story.io }); s2.attach({ profile: { seasonId: 'p-unit', started: true } });
  ok(s2.doc.pencil.rings.length === 2 && s2.doc.pencil.rings[0].by.join() === 'Ruth,Hap', 'ring: survives a reload');
  ok(story.when('ringed:ep33') && !story.when('ringed:moose25'), 'sensor ringed:');
}

// 3 nicknames: pencilled, no feedback, rubbed, matched by a keeper's ring, inked only when confirmed
{
  const { story, pencil, leads } = fresh();
  ok(pencil.unmatched().length === 0, 'nick: nothing before it is seen');
  story.markRead('NB01');
  ok(pencil.unmatched().map((n) => n.nick).join() === 'frontporch' && story.when('nickseen:frontporch'), 'nick: reading NB01 puts the Front Porch on the page, unmatched');
  const wrong = pencil.pencilAt('frontporch', LAKES.kek.x, LAKES.kek.z);
  ok(wrong && !wrong.inked && !story.has('ink.frontporch'), 'nick: a wrong lake stays pencil');
  ok(pencil.pencilAt('frontporch', 0, 50000) === null, 'nick: off any lake pencils nothing');
  ok(pencil.rubAt(LAKES.kek.x, LAKES.kek.z) && pencil.marks().filter((m) => m.kind === 'name').length === 0, 'nick: right-click rubs it out');
  const right = pencil.pencilAt('frontporch', LAKES.lakeone.x + 100, LAKES.lakeone.z);
  ok(right && !right.inked && !story.has('ink.frontporch'), 'nick: the right lake alone inks nothing (no metal detector)');
  const asks = leads.asks({ who: 'keeper', ep: 25 });
  ok(asks.some((a) => a.id === 'nick.frontporch' && a.choice === '20:5.2.c5'), 'ask: "Ever hear a lake called the Front Porch?" offered', JSON.stringify(asks));
  leads.ask('nick.frontporch', { by: 'Ruth', ep: 25, talk: 'c1' });
  ok(story.has('ink.frontporch') && story.get('ink.frontporch') === 'lakeone', 'ink: the keeper\'s ring on Lake One inks the pencil already there');
  ok(story.nbHas('und', 'NB01') && story.walt().includes('20:5.2.w2'), 'ink: NB01 understood and the Walt line "The Front Porch is Lake One."');
  ok(!leads.asks({ ep: 25 }).some((a) => a.id === 'nick.frontporch'), 'ask: once');
  // match without a pencil: the Kek
  story.markRead('NB29');
  leads.ask('nick.kek', { by: 'Gus', ep: 31 });
  ok(story.nbHas('und', 'NB29') && !story.has('ink.kek'), 'match: a keeper\'s ring understands the Kek, but inks nothing until pencilled');
  pencil.pencilAt('kek', LAKES.kek.x, LAKES.kek.z);
  ok(story.has('ink.kek'), 'ink: the pencil dropped on a rung lake inks at once');
  ok(pencil.marks().filter((m) => m.kind === 'name' && m.inked).length === 2, 'marks: inked names drawn');
}

// 4 the far end: only with an L2 key, on Gull (the right Gull)
{
  const { story, pencil } = fresh();
  player.x = LAKES.gull.x; player.z = LAKES.gull.z; story.clock({ abs: 20601, hours: 10 });
  ok(!story.has('ink.farend'), 'far end: on Gull with no key: nothing');
  player.x = 60000; player.z = 60000; story.set('key.L2B'); story.clock({ abs: 20601, hours: 11 });
  ok(!story.has('ink.farend'), 'far end: a key on another Gull: nothing');
  player.x = LAKES.gull.x; player.z = LAKES.gull.z; story.clock({ abs: 20601, hours: 12 });
  ok(story.get('ink.farend') === 'gull' && story.lock(2).solved && story.nbHas('und', 'NB21'), 'far end: entering Gull with an L2 key inks it (lock 2 solved), pencil or not');
  ok(pencil.marks().some((m) => m.kind === 'name' && m.nick === 'farend' && m.inked), 'far end: drawn in ink');
  player.x = 0; player.z = 0;
}

// 5 the crews' lead: born, rung, followed, closed; the doors
{
  const { story, pencil, leads } = fresh();
  ok(leads.asks({ ep: 25 }).every((a) => !a.id.startsWith('ring.')), 'leads: no rings before the porch');
  story.set('tauno.porch.done'); story.set('door.crews.taken');
  story.set('tauno.said.t5'); story.set('knows.tauno'); // (chk-c1a: the Farm-mornings lead is born once he has said it and his name is known)
  ok(leads.state('crews') === 'open' && story.walt().includes('20:11.2.w1') && pencil.rings().length === 0, 'lead crews: born, its Walt line, no ring (Tauno marks nothing)');
  ok(leads.state('tauno') === 'open' && story.walt().includes('20:7.1.lead.tauno'), 'lead tauno: Farm mornings');
  let a = leads.asks({ ep: 25 }).map((q) => q.id);
  ok(a.includes('ring.ep33') && a.includes('ring.farm') && !a.includes('ring.baldeagle'), 'asks: Little Gabbro and Farm, not yet the west shore', a.join());
  ok(!leads.asks({ ep: 31 }).some((q) => q.id === 'ring.farm'), 'asks: no "Where\'s Farm?" at Farm');
  ok(!leads.goto('crews'), 'goto: nothing without a ring');
  leads.ask('ring.ep33', { by: 'Ruth', ep: 25, talk: 'k' });
  a = leads.asks({ ep: 25 }).map((q) => q.id);
  ok(a.includes('ring.baldeagle') && !a.includes('ring.ep33'), 'asks: then the west shore', a.join());
  const res = leads.ask('ring.baldeagle', { by: 'Ruth', ep: 25, talk: 'k' });
  ok(res && res.ring && res.ring.lakes.includes('baldeagle') && story.has('door.crews.ringed') && story.walt().includes('20:7.3.w1'), 'ask: the west shore ringed, "(ringed)"');
  const landing = PLACES['crews.landing'], g = pencil.ringFor('baldeagle.west');
  ok(g && Math.hypot(g.x - landing.x, g.z - landing.z) < g.r && Math.hypot(g.x - landing.x, g.z - landing.z) > 200, 'ring: the west shore holds the crews\' landing without marking it');
  ok(leads.ask('ring.farm', { by: 'Ruth', ep: 25, talk: 'k' }).ring === null, 'ask: a third ring in one talk is refused');
  story.sensor('near', (arg) => arg === 'crews.landing/300'); story.clock({ abs: 20602, hours: 13 });
  ok(leads.state('crews') === 'followed' && pencil.ringFor('crews').followed, 'lead crews: followed (a pencil dot)');
  story.set('crews.seen');
  ok(leads.state('crews') === 'closed' && pencil.ringFor('crews').closed && story.walt().includes('20:11.2.w2'), 'lead crews: closed (ticked, faint), the after line');
  // the turn: the doors
  story.set('tauno.turn');
  ok(leads.state('tauno') === 'closed', 'lead tauno: closed at the turn');
  for (const d of ['guiding', 'boys', 'family', 'mining']) story.set(`door.${d}.named`);
  ok(['guiding', 'boys', 'family', 'mining'].every((d) => leads.state(d) === 'open') && story.walt().includes('w.door.guiding'), 'doors: four leads open, their lines');
  a = leads.asks({ ep: 64 }).map((q) => q.id);
  ok(['ring.moose', 'ring.sawbill', 'ring.lv', 'ring.farm'].every((x) => a.includes(x)) && !a.some((x) => x.startsWith('where.')), 'asks: the four doors rung when asked (no duplicate "Where would I find")', a.join());
  for (const id of ['ring.moose', 'ring.sawbill']) leads.ask(id, { by: 'Carol', ep: 64, talk: 'd1' });
  for (const id of ['ring.lv', 'ring.farm']) leads.ask(id, { by: 'Carol', ep: 64, talk: 'd2' });
  ok(['guiding', 'boys', 'family', 'mining'].every((d) => story.has(`door.${d}.ringed`)), 'doors: ringed', JSON.stringify(story.keys('door.')));
  ok(story.stage === 'S3', 'stage S3 at the turn');
}

// 6 overtaken: the closes came first
{
  const { story, leads } = fresh();
  story.set('crews.seen');
  story.set('door.crews.declined');
  ok(leads.state('crews') === 'overtaken' && !story.walt().includes('20:11.2.w1'), 'lead: overtaken quietly, no line of its own');
}

// 7 a guest pencils nothing
{
  const { story, pencil, leads } = fresh();
  story.setMode('mirror');
  ok(pencil.ring({ place: 'ep33', by: 'Ruth' }) === null && leads.asks({ ep: 25 }).length === 0 && pencil.pencilAt('kek', LAKES.kek.x, LAKES.kek.z) === null, 'mirror: a guest\'s pencil and leads are off');
}

// 8 a rule's ring: action
{
  const { story, pencil } = fresh();
  story.action('ring', 'lv12@Maggie', { rule: 'x' });
  ok(pencil.ringFor('lv12') && pencil.ringFor('lv12').who === 'Maggie', 'action ring:<place>@<who>');
}

console.log(`\nc1-pencil-unit: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
