// Stream L's unit checks (story Round 1, docs/build/campaign-design.md §7.1): the story layer in Node against K1a's real
// story (story.js), a stand-in world and scene. No browser.   node scripts/c1-layer-unit.mjs
//   data       story-places.json and walt-sites.js load for v9; stale on another release; the clearings are lawns only
//   build      nothing far off; the props come in near (tile ready), are dropped on evict and come back, and go far
//   dot        names by the story (Stump → A white stone on a stump after night one); verbs absent when their when fails
//   verbs      the crib, the grade, the tree: their facts and Walt lines (20 §11.2); a 'use' fired
//   triggers   enter (crews.stood); readHere NB20 at the landing and at C902 (20 §11.3); "he was here" at C837 (NB01)
//   rules      three stones → knows.stones → key.L4B; crews.seen at tier 1 → tier 2; L1C
//   sensors    at:, near:, prop: through story.when
//   guest      a mirror: plain names, no verbs, no trigger, no write
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { StoryV2 } from '../src/story.js';
import { StoryLayer } from '../src/story-layer.js';
import { storyPlaces, storyClearings } from '../src/story-world.js';
import { WALT_SITES } from '../src/walt-sites.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACES = JSON.parse(readFileSync(path.join(ROOT, 'src', 'story-places.json'), 'utf8'));
const warn = console.warn; console.warn = () => {};
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 700)); };

const io = () => { const m = new Map(); return { read: (ns, f = null) => (m.has(ns) ? JSON.parse(m.get(ns)) : f), write: (ns, v) => { m.set(ns, JSON.stringify(v)); return true; } }; };
const profile = { seasonId: 'c1-layer', started: true, onChange: () => {} };
function makeStory() { const s = new StoryV2({ io: io() }); s.attach({ profile }); s.clock({ abs: 20640, hours: 11 }); return s; }
// a world: flat ground at 400 m, water where the resolver said (sd < 0) near the crews' landing, 1000 m tiles
function makeWorld(baked = PLACES.resolved.for) {
  return {
    meta: { source: { baked } },
    heightAt: () => 400, levelAt: () => 400.6, isWater: () => false,
    tileOf: (x, z) => [Math.floor(x / 1000), Math.floor(z / 1000)],
  };
}
function makeTiles() {
  const fns = new Set(), off = new Set();
  return { offTiles: off, groundAt: (x, z) => (off.has(`${Math.floor(x / 1000)},${Math.floor(z / 1000)}`) ? NaN : 400), readyAt: (x, z) => !off.has(`${Math.floor(x / 1000)},${Math.floor(z / 1000)}`), onEvict: (fn) => { fns.add(fn); return () => fns.delete(fn); }, evict(tx, ty) { off.add(`${tx},${ty}`); for (const fn of fns) fn(tx, ty); }, back(tx, ty) { off.delete(`${tx},${ty}`); } };
}
function makePointer() { const P = { fns: new Set(), register(fn) { P.fns.add(fn); return () => P.fns.delete(fn); } }; return P; }
// the dot's targets for a ray from (x, eyeY, z) toward (tx, ty, tz)
function aim(P, player, to) {
  const o = new THREE.Vector3(player.x, 401.6, player.z), d = new THREE.Vector3(to.x, to.y, to.z).sub(o).normalize(), ray = new THREE.Ray(o, d);
  const near = {
    reach: 2.6, flat: (x, z) => Math.hypot(x - player.x, z - player.z),
    sphere: (x, y, z, r) => { const v = new THREE.Vector3(x, y, z).sub(o), t = v.dot(d); if (t < 0) return null; const m = v.clone().sub(d.clone().multiplyScalar(t)).length(); return m > r ? null : { t, miss: m / r }; },
  };
  const out = []; for (const fn of P.fns) out.push(...(fn(ray, near) || []));
  return out.sort((a, b) => a.miss - b.miss);
}

const story = makeStory(), world = makeWorld(), tiles = makeTiles(), pointer = makePointer(), scene = new THREE.Scene();
const player = { x: 0, z: 0, onFoot: true };
let guest = false;
const S = storyPlaces(world, PLACES);
world.storyPlaces = S;
const material = new THREE.MeshBasicMaterial({ name: 'look-prop' });
const layer = new StoryLayer().attach({ story, world, tiles, scene, player, pointer, material, guest: () => guest });
clearInterval(layer.timer); // (the poll by hand)
const fired = []; layer.on('*', (e, d) => fired.push([e, d.place, d.prop || d.nb || '']));
const P = (id) => layer.prop(id).prop;
const go = (x, z) => { player.x = x; player.z = z; layer.poll(); };
const meshOf = (id) => scene.children.find((m) => m.name === `story ${id}`);

try {
  // --- data -----------------------------------------------------------------------------------------------------------
  {
    const ids = S.places.map((p) => p.id), stale = storyPlaces(makeWorld('1999'), PLACES);
    const clear = storyClearings(S.places), points = clear.filter((s) => s[0] === s[2] && s[1] === s[3]);
    result('data: 3 places + 37 starred sites for v9 (NB15 Rum held); another release places nothing', S.places.length === 40 && ids.includes('crews.landing') && ids.includes('ws.c837') && !ids.includes('ws.c940') && WALT_SITES.length === 38 && stale.stale && stale.places.length === 0, { n: S.places.length, stale: stale.places.length });
    result('data: the clearings are lawns (no positive-radius point: site.js reads those as campsites); the grade is a 140 m lane', clear.length > 40 && clear.every((s) => s[4] < 0) && points.every((s) => s[4] < 0) && clear.some((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) > 139), { n: clear.length });
    result('data: the portages the story names resolve (bc.64 = v9 691, the pair 659/660)', layer.portage('bc.64') === 691 && layer.portage('pair.205') === 659 && layer.portage('pair.50') === 660 && layer.portage('nope') === null, layer.state().portages);
  }
  // --- build ----------------------------------------------------------------------------------------------------------
  const C = layer.place('crews.landing');
  {
    go(0, 0);
    const none = layer.builtList().length;
    go(C.x + 30, C.z + 30);
    const b = layer.builtList(), ids = b.map((q) => q.prop).sort();
    const crib = meshOf('crews.crib');
    result('build: nothing far off; at the landing the crib, the rock, both pines and the grade (a dot only)', none === 0 && ['crews.crib', 'crews.grade', 'crews.pine', 'crews.pine2', 'crews.rock'].every((k) => ids.includes(k)) && !!crib && !meshOf('crews.grade') && crib.material && crib.material.name === 'look-prop', { ids, tris: b.map((q) => q.tris) });
    const [tx, ty] = world.tileOf(C.x, C.z);
    tiles.evict(tx, ty);
    const after = layer.builtList().filter((q) => q.place === 'crews.landing').length, inScene = !!meshOf('crews.crib');
    layer.poll(); const whileOut = layer.builtList().filter((q) => q.place === 'crews.landing').length;
    tiles.back(tx, ty); layer.poll();
    const again = layer.builtList().filter((q) => q.place === 'crews.landing').length;
    go(C.x + 2000, C.z); const far = layer.builtList().filter((q) => q.place === 'crews.landing').length;
    result('build: a tile evicted drops its props (out of the scene), nothing while it is out, back when it is in; far → dropped', after === 0 && !inScene && whileOut === 0 && again === 5 && far === 0, { after, whileOut, again, far });
  }
  // --- dot and verbs ----------------------------------------------------------------------------------------------------
  const W = layer.place('ws.c837'), stump = `ws.c837.stump`;
  {
    go(W.x + 1.5, W.z);
    const before = { name: layer.dotName(stump), verbs: layer.verbs(stump).length, look: layer.look(stump) };
    const t = aim(pointer, player, { x: W.x, y: 400.3, z: W.z })[0];
    story.found({ abs: 20640, key: 2, lake: 'Lake One' }); story.emit('notebook:found', {});
    const after = { name: layer.dotName(stump), verbs: layer.verbs(stump).map((v) => v.verb), nb: story.has('nb.found') };
    result('dot: the stump reads "Stump" with no verb before night one (no Walt lore), the stone and its stump both built', before.name === 'Stump' && before.verbs === 0 && before.look === false && t && t.target.label === 'Stump' && t.target.e === null && !!meshOf('ws.c837.stone'), { before, t: t && t.target.label });
    result('dot: after night one "A white stone on a stump", Look offered', after.nb && after.name === 'A white stone on a stump' && after.verbs.join() === 'Look', after);
    const t2 = aim(pointer, player, { x: W.x, y: 400.3, z: W.z })[0];
    t2.target.e.run();
    result('verbs: Look at the stone counts it (stone.c837) and writes 20 §2.4\'s Walt line; a use fired', story.has('stone.c837') && story.walt().includes('20:2.4.w2') && fired.some(([e, , p]) => e === 'use' && p === stump), { walt: story.walt() });
    // he was here: NB01 open at C837
    const pl = layer.readHere('NB01'), far = layer.readHere('NB01', { x: W.x + 500, z: W.z });
    result('triggers: NB01 read at C837 marks it read here (he was here), once; not 500 m off', pl && pl.id === 'ws.c837' && story.nbHas('here', 'NB01') && far === null && fired.filter(([e, p, nb]) => e === 'readHere' && p === 'ws.c837' && nb === 'NB01').length === 1, { here: story.doc.nb.here });
  }
  {
    // the crews' landing, by the dot
    go(C.x + 1, C.z + 1);
    const enter = story.has('crews.stood');
    const st = (id, y) => { const q = P(id); player.x = q.x + 1.2; player.z = q.z + 0.8; return aim(pointer, player, { x: q.x, y, z: q.z })[0]; };
    const crib = st('crews.crib', 400.5), pine = st('crews.pine', 401.35), grade = st('crews.grade', 400.35);
    const names = [crib && crib.target.label, pine && pine.target.label, grade && grade.target.label];
    for (const t of [crib, pine, grade]) if (t && t.target.e) t.target.e.run();
    const f = ['landing.crib', 'landing.grade', 'landing.blaze', 'landing.pink', 'crews.seen'].filter((k) => story.has(k));
    const w = ['20:11.2.w2', '20:11.2.w3', '20:11.2.w4', '20:11.2.w5'].filter((k) => story.walt().includes(k));
    result('triggers: standing at the crews\' landing (45 m) sets crews.stood', enter, {});
    result('verbs: the crib, the tree and the grade by the dot: Crib / Blaze · Pink flagging / Grade, Look each; their facts and Walt lines (20 §11.2)', names.join('|') === 'Crib|Blaze · Pink flagging|Grade' && f.length === 5 && w.length === 4 && story.has('key.L1C'), { names, f, w });
    story.set('tauno.orange', true, 'test');
    result('dot: once Tauno has told of the orange, the tree reads "Old blaze. Orange." (20 §11.2)', layer.dotName('crews.pine').startsWith('Old blaze. Orange.') && layer.dotName('crews.pine2') === 'Old blaze. Orange.', { n: layer.dotName('crews.pine') });
    // NB20 at the landing
    go(C.x, C.z);
    layer.setReading(() => 'NB20'); layer.poll(); layer.setReading(null);
    result('triggers: NB20 open at the landing (polled): landing.nb20 and 11.3\'s second-ink line', story.has('landing.nb20') && story.walt().includes('20:11.3.w2') && story.nbHas('here', 'NB20'), { walt: story.walt().slice(-3) });
    const c902 = layer.place('bald.c902');
    go(c902.x, c902.z); layer.readHere('NB20');
    result('triggers: NB20 read at C902: 11.3\'s "He came in the way I did" line', story.walt().includes('20:11.3.w1'), {});
  }
  // --- rules ------------------------------------------------------------------------------------------------------------
  {
    const tier0 = story.tier;
    story.set('asked.boreal.2', true, 'test');
    result('rules: crews.seen at tier 1 moves the watchers to tier 2 (20 §11.5)', tier0 === 0 && story.tier === 2, { tier: story.tier });
    for (const id of ['ws.c1655', 'ws.c1088']) { const q = layer.place(id); go(q.x + 1, q.z); layer.look(`${id}.stump`); }
    result('rules: three different stones looked at → knows.stones → lock 4 key B', story.has('stone.c1655') && story.has('knows.stones') && story.has('key.L4B'), { stones: story.keys('stone.').map(([k]) => k) });
  }
  // --- sensors ----------------------------------------------------------------------------------------------------------
  {
    go(C.x + 10, C.z);
    const a = [story.when('at:crews.landing'), story.when('near:crews.crib/30'), story.when('near:crews.crib/2'), story.when('prop:crews.crib'), story.when('prop:nope')];
    go(C.x + 5000, C.z);
    const b = story.when('at:crews.landing');
    result('sensors: at:, near:<prop>/<m>, prop: read the live world', a.join() === 'true,true,false,true,false' && b === false, { a, b });
  }
  // --- guest ------------------------------------------------------------------------------------------------------------
  {
    const g = makeStory(); g.setMode('mirror');
    const gl = new StoryLayer().attach({ story: g, world, tiles, scene: new THREE.Scene(), player, pointer: makePointer(), material, guest: () => true }); clearInterval(gl.timer);
    const q = gl.place('ws.c1210'); player.x = q.x + 1; player.z = q.z; gl.poll();
    const cl = gl.place('crews.landing'); player.x = cl.x; player.z = cl.z; gl.poll();
    const r = { stump: gl.dotName('ws.c1210.stump'), verbs: gl.verbs('ws.c1210.stump').length + gl.verbs('crews.crib').length, look: gl.look('crews.crib'), here: gl.readHere('NB20'), built: gl.builtList().length, facts: Object.keys(g.doc ? g.doc.facts : {}).length, pine: gl.dotName('crews.pine') };
    result('guest: a mirror\'s layer stands the props but reads "Stump", offers no verb, fires no trigger, writes nothing', r.stump === 'Stump' && r.verbs === 0 && r.look === false && r.here === null && r.built > 0 && r.facts === 0 && r.pine === 'Blaze · Pink flagging', r);
    gl.detach();
  }
  layer.detach();
  result('detach: every prop out of the scene', scene.children.filter((m) => /^story /.test(m.name)).length === 0, {});
} catch (e) { console.log('FAIL (threw)', e.stack); results.push({ name: 'threw', pass: false }); }

console.warn = warn;
const pass = results.filter((r) => r.pass).length;
console.log(`c1-layer-unit: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
