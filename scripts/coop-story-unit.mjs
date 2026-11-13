// coop-story-unit.mjs: Node checks of src/coop-story.js (stream c, Round 3) with two fake rooms' ends wired together,
// no browser: the mirror (the host's notebook, Walt page and facts on the guest, the guest's own store untouched), the
// story's people stood on the guest, guest credit (near and far), the pit with company and N42, the run shutting the
// room, the bound things stripped, night one's wait.   node scripts/coop-story-unit.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StoryV2 } from '../src/story.js';
import { CoopStory, CREDIT_R } from '../src/coop-story.js';

const memIO = () => { const m = new Map(); return { read: (ns, f = null) => (m.has(ns) ? JSON.parse(m.get(ns)) : f), write: (ns, v) => { m.set(ns, JSON.stringify(v)); return true; }, map: m }; };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

let T = 0;
// a room: two coops whose send() lands in the other's handlers (to: routed)
function room() {
  const mk = (role, id) => {
    const c = { role, id, live: true, handlers: new Map(), peerFns: new Set(), tickFns: new Set(), remotes: new Map(), visitor: { name: role === 'host' ? 'Ada' : 'Bo' }, sent: [], g: { player: { x: 0, z: 0 }, trip: { active: true, book: { trips: [1, 2] } } } };
    c.on = (t, fn) => { if (!c.handlers.has(t)) c.handlers.set(t, new Set()); c.handlers.get(t).add(fn); return () => {}; };
    c.onPeers = (fn) => { c.peerFns.add(fn); };
    c.tick = (fn) => { c.tickFns.add(fn); };
    c.peers = () => (c.other ? [{ id: c.other.id, name: c.other.visitor.name, host: c.other.role === 'host', x: c.other.g.player.x, z: c.other.g.player.z }] : []);
    c.send = (m) => { c.sent.push(m); const o = c.other; if (!o || (m.to != null && m.to !== o.id)) return true; for (const fn of o.handlers.get(m.t) || []) fn({ ...m, from: c.id }); return true; };
    c.lost = (why) => { c.lostWhy = why; };
    c.run = (n = 1) => { for (let i = 0; i < n; i++) { T += 1000; for (const fn of c.tickFns) fn(T); } };
    return c;
  };
  const host = mk('host', 1), guest = mk('guest', 2);
  host.other = guest; guest.other = host; host.remotes.set(2, {}); guest.remotes.set(1, {});
  return { host, guest };
}
function fakeNpcs() {
  const n = { stood: [] };
  n.extraAt = (ep, rec) => { const h = { rec, ep, removed: false, remove() { this.removed = true; n.stood = n.stood.filter((q) => q !== h); } }; n.stood.push(h); return h; };
  return n;
}
function fakeLayer() {
  const props = { 'cellar.pit': { place: { id: 'cellar' }, prop: { id: 'cellar.pit', kit: 'pit' } }, 'gull.stone': { place: { id: 'gull.sign' }, prop: { id: 'gull.stone', kit: 'stone' } } };
  return { prop: (id) => props[id] || null, verbs: (id) => (props[id] ? [{ verb: 'x', prop: id }] : []), dotName: (id) => id, trig: [], creditTrigger(place, on, i) { this.trig.push([place, on, i]); return true; }, shot() {} };
}
function pair() {
  const { host, guest } = room();
  const hio = memIO(), gio = memIO();
  const hs = new StoryV2({ io: hio }).attach({ profile: { seasonId: 's-host', started: true } });
  gio.write('story2', { v: 2, season: 's-guest', facts: { 'nb.found': [true, 1, 0, 0, 0, 1] } }); // the guest's own story
  const gs = new StoryV2({ io: gio }).attach({ profile: { seasonId: 's-guest', started: true } });
  const gioBefore = JSON.stringify([...gio.map]);
  gs.setMode('mirror');
  const hn = fakeNpcs(), gn = fakeNpcs();
  const feedIn = [];
  const hc = new CoopStory(host, { story: hs, npcs: hn, layer: fakeLayer() });
  hc.useFeed({ emit: (evt, data) => { feedIn.push([evt, data]); return true; }, tap() {} });
  const gc = new CoopStory(guest, { story: gs, npcs: gn, layer: fakeLayer(), inventory: null });
  return { host, guest, hs, gs, hc, gc, hn, gn, gio, gioBefore, feedIn };
}

test('the mirror: the host\'s notebook, Walt page and facts on the guest; the guest\'s own store untouched', () => {
  const P = pair();
  P.hs.found({ abs: 20000, key: 1, lake: 'Lake One' });
  P.hs.waltLine('w.found', 'unit');
  P.hs.markRead('NB01', 'unit');
  P.host.run();
  assert.ok(P.gs.has('nb.found'), 'nb.found mirrored');
  assert.ok(P.gs.walt().includes('w.found'), 'the Walt line mirrored');
  assert.ok(P.gs.nbHas('read', 'NB01'), 'a page read mirrored');
  assert.equal(P.gs.doc.hostMirror, true);
  assert.equal(P.gs.mode, 'mirror');
  assert.equal(P.gs.set('nb.burntpoint', true, 'unit'), false, 'a guest writes nothing');
  assert.equal(JSON.stringify([...P.gio.map]), P.gioBefore, 'the guest\'s own store unchanged');
  const pubs = P.hc.n.pubs; P.host.run(); assert.equal(P.hc.n.pubs, pubs, 'nothing new: nothing sent');
});

test('the story\'s people stand on the guest where the host\'s do, with only a look', () => {
  const P = pair();
  P.hn.extraAt(31, { key: 'cast:tauno:31', name: 'Tauno', look: { shirt: 1 }, spot: { x: 1, z: 2, heading: 0 } });
  P.hn.extraAt(31, { key: 'staffer:31', name: 'Kim' }); // (not a story person)
  P.host.run();
  assert.deepEqual(P.gn.stood.map((h) => h.rec.key), ['mirror:cast:tauno:31']);
  assert.deepEqual(P.gn.stood[0].rec.lines, ['…']);
  P.hn.stood.find((h) => h.rec.key === 'cast:tauno:31').remove();
  P.host.run();
  assert.equal(P.gn.stood.length, 0, 'gone on the guest when gone on the host');
});

test('guest credit: a carry near the host is the host\'s (its trip), a far one is refused', () => {
  const P = pair();
  P.guest.g.player.x = 50;
  P.gc.creditOut('ev', { evt: 'carry', data: { i: 12, rods: 64, trip: 9, seq: 1 } });
  assert.equal(P.feedIn.length, 1);
  assert.equal(P.feedIn[0][0], 'carry'); assert.equal(P.feedIn[0][1].trip, 3); assert.equal(P.feedIn[0][1].i, 12);
  P.guest.g.player.x = CREDIT_R + 5;
  P.gc.creditOut('ev', { evt: 'carry', data: { i: 13 } });
  assert.equal(P.feedIn.length, 1, 'far: refused');
  P.guest.g.player.x = 10;
  P.gc.creditOut('trig', { place: 'gull.sign', on: 'enter', i: 0 });
  assert.equal(P.hc.t.layer.trig.length, 1, 'a place trigger applied on the host');
  P.gc.creditOut('ev', { evt: 'walkout', data: {} });
  assert.equal(P.feedIn.length, 1, 'a push never credited');
});

test('the pit with company: no verb, N42 once with an L6 key; alone the verb is back', () => {
  const P = pair();
  const L = P.hc.t.layer;
  assert.deepEqual(L.verbs('cellar.pit'), [], 'no verb with a friend in');
  assert.equal(L.verbs('gull.stone').length, 1, 'other props keep theirs');
  L.dotName('cellar.pit');
  assert.ok(!P.hs.walt().includes('c.walt.n42'), 'no L6 key: no line');
  P.hs.set('key.L6A', true, 'unit');
  L.dotName('cellar.pit'); L.dotName('cellar.pit');
  assert.equal(P.hs.walt().filter((w) => w === 'c.walt.n42').length, 1, 'N42 once');
  assert.equal(P.hs.readSensor('peers'), 1);
  P.host.other = null; P.host.remotes.clear();
  assert.equal(L.verbs('cellar.pit').length, 1, 'alone: the verb');
  assert.equal(P.hs.readSensor('peers'), 0);
});

test('the run on: the clock shuts the room, a joiner is sent away', () => {
  const P = pair();
  assert.equal(P.host.clockExtra(), null);
  P.hs.sensor('run.active', () => true);
  assert.deepEqual(P.host.clockExtra(), { shut: 'run' });
  for (const fn of P.host.peerFns) fn('join', { id: 2, name: 'Bo' });
  assert.equal(P.guest.lostWhy, 'run');
});

test('night one on a shared night: the guest\'s card, its wake waits for the host', async () => {
  const P = pair();
  let woke = 0, played = null;
  const walt = { playNightOne: () => new Promise((r) => { played = r; }) };
  const camp = { wake: () => { woke++; } };
  const hc = new CoopStory(P.host, { story: P.hs, walt });
  const gc = new CoopStory(P.guest, { story: P.gs, camp });
  void hc;
  const p = walt.playNightOne();
  assert.ok(gc.reading, 'the guest sees the host reading');
  const w = camp.wake();
  await Promise.resolve();
  assert.equal(woke, 0, 'the guest\'s night waits');
  played(true); await p; await w;
  assert.equal(woke, 1); assert.equal(gc.reading, null);
});

test('a guest\'s bound things are stripped from the visit\'s inventory', () => {
  const P = pair();
  const took = [];
  const inv = { containers: [{ id: 'pk', grid: [{ id: 'waltnotebook', uid: 'u1', qty: 1 }, { id: 'bottle', uid: 'u2', qty: 1 }] }], take(k, uid) { took.push(uid); }, on() {} };
  P.gc.t.inventory = inv;
  assert.equal(P.gc.strip(), 1); assert.deepEqual(took, ['u1']);
});
