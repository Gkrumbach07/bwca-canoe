// Round 7 stream 7b in the game (docs/story/60-side-stories.md S5, S6; campaign-design Part 4 Round 7): the two side
// stories' people, the dive and the pit on top of the runner (episodes.js; stream E's feed-episodes.js connect). main.js's
// 7b block calls connect7b() under STORY_ON after the e: block; with the flag off nothing imports this file.
//
//   connect7b(t) → { debug }   t: { story, layer, topics, texts, T, SceneRun, loadWords, talk, npcs, scene, inventory, hud,
//                              record, player, wind, world, tiles, camera, lamp, audio, day, pointer, weather, energy,
//                              input, guest, E (stream E's connect: episodes, minigames, show) }
//   · S5: Pete at the Round Lake 51 counter (his scene; "Is that—" with the case); the wreck read from the canoe only on a
//     calm, bright day (minigames/dive.js seeing: wind under 5 mph, 10:00–15:00, a clear sky, within 15 m); E Dive from
//     the canoe (over the side: the canoe left floating where it was, drifting with any wind), Q Dive again from the water
//     over it; under: the view goes down to the wreck, narrows as the breath goes, the heart comes up; hold E on the case
//     (from the second dive); Space up; cold (wet through, the warmth down); Get in from the water is the swim's own E.
//     The case: item mapcase and the chart (page:pilotchart). Pete: "It's yours" (the chart framed on the Round Lake wall,
//     $60) or kept. Pete told "north" finds it on the next calm bright day; without you, the first after 20 August, by
//     Labor Day at the latest: the chart on the wall either way (Look at it: the page). In Gull's east bay with the
//     chart in the book, the notch looked at: s5.notch (rules-side7b.js: ep.S5.chart, lock 2 key D and lock 3 key D)
//   · S6: Orrin at the Little Vermilion 12 counter in the afternoons (his scene: the route and the ring on Bootleg, the
//     sale, the bottle); René's topics (story-data/sides-7b.js KEEPER_7B) and his words after (the card by his till,
//     the twelve hundred, a stranger's dig); Leon's one line; the cut line's blazes (s6.blazes); the pit (the layer's
//     verbs: Clear the moss, Pull, Take) and its first; the dot on the cellar's moss once the eye is taught (S6.pitdot)
// A co-op guest (story.mode 'mirror' or guest()): none of it moves.
import * as THREE from 'three';
import { minigames as MG0 } from './minigames.js';
import { dive, seeing, pitOpen, pitState, DIVE } from './minigames/dive.js';
import { PETE, ORRIN, KEEPER_7B } from './story-data/sides-7b.js';
import { defineItem, definePage, itemDef } from './items.js';
import { storeLayout } from './props.js';
import { kit } from './story-props.js';
import { propMaterial } from './prop-kit.js';
import { env } from './audio-kit.js';

// --- the things (defined only under the flag) --------------------------------------------------------------------------
if (!itemDef('mapcase')) defineItem({ id: 'mapcase', name: 'Leather map case, swollen, a pilot\'s', short: 'Map case', kind: 'gear', w: 1, h: 2, kg: 0.6, price: 0, sold: false, unique: true, hand: true, identity: 'Leather map case, swollen, a pilot\'s', story: '7b' });
if (!itemDef('rye1928')) defineItem({ id: 'rye1928', name: 'Rye, 1928, seal on', short: 'Rye, 1928', kind: 'gear', w: 1, h: 2, kg: 1.2, price: 0, sold: false, unique: true, hand: true, identity: 'Rye, 1928, seal on', story: '7b' });
if (!itemDef('page:pilotchart')) definePage({ id: 'pilotchart', title: 'The pilot\'s chart', ref: 'S5.chart.page', by: 'Arne Haldane' });
if (!itemDef('page:ledger1928')) definePage({ id: 'ledger1928', title: 'A runner\'s book, 1928', ref: 'S6.ledger', by: 'the outfit' });

const BEAT = (au, size = 1) => {
  // a heartbeat, head-locked: two low thumps
  try {
    if (!au || typeof au.voice !== 'function') return;
    const v = au.voice({ at: 0, gain: 0.75 * size, pri: 2 }); if (!v) return;
    for (const k of [0, 0.19]) { const s = v.t + k, o = v.osc('sine', k ? 48 : 56, s, s + 0.3), g = v.gain(0); v.chain(o, g); env(g.gain, s, 0.012, k ? 0.7 : 1, 0, 0.16); }
    v.until(v.t + 0.6);
  } catch { /* the audio's own */ }
};

export async function connect7b(t) {
  const { story, layer, topics, texts, SceneRun, loadWords, talk, npcs, scene, inventory, hud, record, player, wind, world, camera, lamp, audio, day, pointer, weather, energy, input } = t;
  const E = t.E || {}, episodes = E.episodes, show = E.show, minigames = E.minigames || MG0;
  const guest = () => { try { return !!(t.guest && t.guest()) || story.mode === 'mirror'; } catch { return story.mode === 'mirror'; } };
  const live = () => !!(story && story.doc) && !guest();
  if (loadWords) { const W = await loadWords(['side', 'drafted']); if (W.side) texts.add(W.side); if (W.drafted) texts.add(W.drafted); }
  const T = (id) => (t.T ? t.T(id) : null);
  // the chart's page: the doc's pencilled labels in the order 60 S5 lists them (S5.chart.*), one composed entry
  {
    const parts = ['S5.chart.head.1', 'S5.chart.head.2', 'S5.chart.ice', 'S5.chart.cut.1', 'S5.chart.cut.2'].map((id) => T(id)).filter(Boolean);
    if (parts.length) texts.add({ text: { 'S5.chart.page': { k: 'block', text: `1949\n${parts.join('\n')}`, doc: '60 S5 "The pilot\'s chart": its labels, composed' } } });
  }
  const note = (w, s = 5) => { if (w && hud && typeof hud.note === 'function') hud.note(w, s); };
  const apply = (then, why) => { if (live()) story.rules.apply({ id: `7b:${why}`, then }, {}); };
  const has = (k) => !!(story && story.has(k));
  const doc = () => { const d = story.doc; if (!d.s7b || typeof d.s7b !== 'object') d.s7b = {}; return d.s7b; };
  const dirty = () => { if (typeof story.dirty === 'function') story.dirty(); };
  const P = (id) => { const q = layer && layer.prop(id); return q && Number.isFinite(q.prop.x) ? q.prop : null; };
  const PL = (id) => { const q = layer && layer.place(id); return q && Number.isFinite(q.x) ? q : null; };
  const near = (o, r) => !!(o && player && Math.hypot(o.x - player.x, o.z - player.z) < r);
  const hours = () => (day ? day.hours : 12);
  const dateNow = () => story.date();
  const md = () => { const d = dateNow(); return d.month * 100 + d.day; };
  const firstStamp = (id) => { try { const w = T(id); if (record && typeof record.first === 'function' && w) record.first('story', id, w.replace(/^First stamped:\s*/i, ''), null); } catch (e) { console.warn('7b: first', e); } };
  const cloud = () => { try { const L = weather && weather.look; return L ? Math.max(L.cover || 0, L.deck || 0, (L.rain || 0) * 2) : 0; } catch { return 0; } };
  const calmBright = () => !!wind && wind.speed < DIVE.wind && hours() >= DIVE.hours[0] && hours() <= DIVE.hours[1] && cloud() <= 0.35;

  // --- the minigames ---------------------------------------------------------------------------------------------------
  minigames.register('dive', dive);
  minigames.register('pitOpen', pitOpen);
  if (topics && typeof topics.add === 'function') topics.add(KEEPER_7B);

  // --- the people at the counters ------------------------------------------------------------------------------------------
  const REC = Object.fromEntries((episodes ? episodes.records() : []).map((r) => [r.id, r]));
  const LOOKS = {
    pete: { age: 'mid', shirt: 0x2f5a7a, pants: 0x3a3a34, hat: 0x8a2a22, hair: 0x6a5038 },
    orrin: { age: 'old', shirt: 0xb8a070, pants: 0x5a5448, hat: 0x6a6a5a, hair: 0xd8d4cc },
  };
  const PEOPLE = {
    pete: { ep: 51, rec: 'S5', when: () => episodes.window('S5') && story.when(REC.S5.pete.when), name: () => (has('pete.met') ? 'Pete' : 'A man in a wetsuit top'), scene: PETE, at: [1.6, 2.4] },
    orrin: { ep: 12, rec: 'S6', when: () => episodes.window('S6') && story.when(REC.S6.orrin.when), name: () => (has('orrin.met') ? 'Orrin' : 'An old man with a coffee'), scene: ORRIN, at: [1.5, 2.7] },
  };
  const staged = new Map();
  const spotOf = (who, L) => {
    const A = L.axes.a, B = L.axes.b, Cn = L.centre, [a, b] = PEOPLE[who].at;
    return { x: Cn.x + A.x * a + B.x * b, z: Cn.z + A.z * a + B.z * b, y: L.floorY, heading: Math.atan2(-(B.z), B.x) };
  };
  const stage = (who) => {
    const p = PEOPLE[who], L = storeLayout(p.ep); if (!L || !npcs || typeof npcs.extraAt !== 'function') return;
    const h = npcs.extraAt(p.ep, { key: `cast:${who}:${p.ep}`, name: p.name(), role: '', look: LOOKS[who], spot: spotOf(who, L), talk: () => (talkTo(who) ? true : null) });
    if (h) staged.set(who, { h });
  };
  const unstage = (who) => { const s = staged.get(who); if (!s) return; try { if (s.h && s.h.remove) s.h.remove(); } catch { /* */ } staged.delete(who); };
  const peopleTick = () => {
    for (const [who, p] of Object.entries(PEOPLE)) {
      const L = storeLayout(p.ep), here = L && player && Math.hypot(L.centre.x - player.x, L.centre.z - player.z) < 110;
      let want = false; try { want = !!(here && live() && episodes && !episodes.held() && p.when()); } catch { want = false; }
      if (want && !staged.has(who)) stage(who);
      else if (!want && staged.has(who) && !(talk && talk.convo && talk.convo.speaker && talk.convo.speaker.key === `cast:${who}:${p.ep}`)) unstage(who);
    }
  };
  const hooks = {
    yes: (run) => { const id = PEOPLE[run.who] && PEOPLE[run.who].rec; if (id && episodes && !episodes.started(id)) episodes.yes(id, 'choice'); },
    given: () => { try { if (inventory && inventory.count('mapcase', { reachable: false }) > 0) inventory.remove('mapcase', 1); } catch (e) { console.warn('7b: the case to Pete', e); } wall.build(); },
    sold: () => { try { if (inventory && inventory.count('page:ledger1928', { reachable: false }) > 0) inventory.remove('page:ledger1928', 1); } catch (e) { console.warn('7b: the book to Orrin', e); } const d = doc(); d.soldYear = dateNow().year; dirty(); },
    bottle: () => { try { if (inventory && inventory.count('rye1928', { reachable: false }) > 0) inventory.remove('rye1928', 1); } catch (e) { console.warn('7b: the bottle', e); } },
    ring: () => { try { if (topics && typeof topics.ring === 'function') topics.ring({ lake: 'Bootleg Lake', place: 's6.bootleg' }, { by: 'Orrin', label: 'Bootleg Lake' }); } catch (e) { console.warn('7b: the ring', e); } },
  };
  function talkTo(who, o = {}) {
    const s = staged.get(who), p = PEOPLE[who];
    if (!s || !s.h || !talk || !SceneRun || !live()) return false;
    const run = new SceneRun(topics, p.scene, { who, args: { ep: p.ep }, hooks, mark: npcs && npcs.mark ? (w) => npcs.mark(w) : null, show: show ? (r, from) => show.choice(who, r, from) : null });
    story.meet(who, '7b');
    const start = () => {
      if (o.give && show) return show.answer(o.give, { kind: 'item', id: o.give.item }, () => run.choices('open'));
      return run.node('open');
    };
    const bye = { pete: 'S5.conv.10' }[who];
    return talk.open({ speaker: s.h.speaker, name: p.name(), role: '', room: p.ep, start, bye: () => (bye ? T(bye) : null) });
  }
  if (show) for (const who of Object.keys(PEOPLE)) show.talker(who, (o) => talkTo(who, o));

  // the counters' words: Pete to everyone at 51 (60 S5 "How it starts"), René and Leon after the ledger (60 S6 "The choice",
  // "Keepers split"), René the season after a sale, René on a stranger's dig, the card by René's till
  if (npcs && typeof npcs.addPool === 'function') {
    npcs.addPool('remark', (c) => (live() && Number(c.ep) === 51 && staged.has('pete') && !has('pete.met') ? { id: 'S5.pete', text: T('S5.pete') } : null));
    npcs.addPool('word', (c) => {
      if (!live()) return null;
      const ep = Number(c.ep), d = doc(), yr = dateNow().year;
      if (ep === 12 && has('ep.S6.society')) { if (!d.cardSaid) { d.cardSaid = true; dirty(); } return { id: 'S6.society.2', text: T('S6.society.2') }; }
      if (ep === 12 && has('ep.S6.sold') && d.soldYear != null && yr > d.soldYear) return { id: 'S6.sell.3', text: [T('S6.sell.3'), T('S6.sell.4')].filter(Boolean).join(' ') };
      if (ep === 12 && has('s6.dug') && !has('s6.moss')) return { id: 'S6.without', text: T('S6.without') };
      if (ep === 12 && has('s6.ledger') && !has('s6.split.rene')) { apply(['f:s6.split.rene'], 'split.rene'); return { id: 'S6.split.1', text: T('S6.split.1') }; }
      if (ep === 16 && has('s6.ledger') && !has('s6.split.leon')) { apply(['f:s6.split.leon'], 'split.leon'); return { id: 'S6.split.2', text: T('S6.split.2') }; }
      return null;
    });
  }

  // --- S5: the wreck from the canoe, the dive ----------------------------------------------------------------------------
  // the wreck seated on the game's own bed in 12 ft (60 S5: 3.7 m): the resolved spot is 22 m off the shore in the tiles'
  // data, but the drawn bed there (tiles.groundAt) is deeper; walk in toward the shore anchor to the first spot between
  // 2.8 and 4.2 m, and build it there (done once its tiles are in; the same every load: it reads only the terrain)
  let seated = false;
  const seatWreck = () => {
    if (seated || !layer || !world) return;
    const q = layer.prop('s5.wreck'), pl = q && q.place; if (!q || !Number.isFinite(q.prop.x)) return;
    const T0 = t.tiles; if (T0 && typeof T0.readyAt === 'function' && (!T0.readyAt(q.prop.x, q.prop.z) || !T0.readyAt(pl.x, pl.z))) return;
    const gAt = (x, z) => (T0 && typeof T0.groundAt === 'function' ? T0.groundAt(x, z) : world.heightAt(x, z));
    const x0 = q.prop.x, z0 = q.prop.z, dx = pl.x - x0, dz = pl.z - z0, L = Math.hypot(dx, dz) || 1;
    let best = null;
    for (let s = 0; s <= L + 0.01 && !best; s += 0.5) {
      for (const off of [0, 3, -3, 6, -6]) {
        const x = x0 + (dx / L) * s + (-dz / L) * off, z = z0 + (dz / L) * s + (dx / L) * off;
        if (!world.isWater(x, z)) continue;
        const dep = world.levelAt(x, z) - gAt(x, z);
        if (dep >= 2.8 && dep <= 4.2 && world.shoreAt(x, z) < -6) { best = { x, z, dep }; break; }
      }
    }
    seated = true;
    if (!best) return;
    q.prop.x = best.x; q.prop.z = best.z;
    try { if (typeof layer.dropProp === 'function') layer.dropProp(pl.id, 's5.wreck'); } catch { /* rebuilt on the next poll */ }
  };
  const wreckAt = () => { const w = P('s5.wreck'); if (!w || !world) return null; const g = layer.groundAt ? layer.groundAt(w.x, w.z) : world.heightAt(w.x, w.z), lv = world.levelAt(w.x, w.z); return { x: w.x, z: w.z, bed: g, level: lv, depth: Math.max(0, lv - g), heading: w.heading || 0 }; };
  const secchi = () => { try { const id = world.lakeIdAt ? world.lakeIdAt(player.x, player.z) : 0, l = id > 0 && world.lakes ? world.lakes[id - 1] : null; return (l && l.secchi) || 4.3; } catch { return 4.3; } };
  const readsNow = (W, dist) => seeing({ wind: wind ? wind.speed : 0, hour: hours(), cloud: cloud(), dist, depth: W.depth, secchi: secchi(), month: dateNow().month });
  let dv = null;              // the dive's handle while it runs
  let under = null;           // { from: camera pose, t } while the view is down
  const diveOk = () => live() && episodes && !episodes.held() && !has('s5.case') && !has('s5.pete.found');
  // E Dive from the canoe: over the side, the canoe left floating where it lies
  const overSide = () => {
    if (!player || player.mode !== 'paddle') return false;
    const h = player.heading, f = { x: Math.cos(h), z: -Math.sin(h) }, side = (player.canoe && player.canoe.state && player.canoe.state.side) || 1;
    player.carry = { trail: null, drop: { x: player.x, z: player.z, heading: h }, hitCooldown: 0, from: null, choice: false };
    if (player.canoe && player.canoe.state) { player.canoe.state.stroke = 0; player.canoe.state.power = 0; }
    player.speed = 0; player.yawRate = 0;
    try { player.restHull(player.x, player.z, h); } catch (e) { console.warn('7b: the canoe left floating', e); }
    player.x += -f.z * side * 1.2; player.z += f.x * side * 1.2;
    player.enterSwim();
    return true;
  };
  const startDive = () => {
    const W = wreckAt(); if (!W || dv || !diveOk()) return false;
    if (player.mode === 'paddle' && !overSide()) return false;
    if (player.mode !== 'swim') return false;
    const d = doc();
    dv = minigames.start('dive', { dives: d.dives || 0, work0: d.work || 0, seen0: !!d.seen, month: dateNow().month });
    if (!dv) return false;
    // (the canoe is put out of the swim's reach while you are under: E works the case, it never climbs you in)
    under = { t: 0, spot: { x: player.x, z: player.z }, beat: 0, drop: player.carry ? player.carry.drop : null };
    if (player.carry) player.carry.drop = null;
    if (!has('s5.dived')) apply(['f:s5.dived'], 'dived');
    if (!d.coldSaid) { d.coldSaid = true; dirty(); setTimeout(() => note(T('d95.7b.S5.cold'), 4), 3500); }
    overlay(true);
    return true;
  };
  // the water's dot from the canoe: "Red and cream, down in the water" with E Dive, only when it reads (or seen before
  // and the water still calm enough to find it again)
  const wreckTarget = (ray, nr) => {
    if (!diveOk() || !player || player.mode !== 'paddle') return null;
    const W = wreckAt(); if (!W) return null;
    const dist = Math.hypot(W.x - player.x, W.z - player.z);
    if (dist > DIVE.near || !readsNow(W, dist)) return null;
    const hit = nr.sphere(W.x, W.level - 0.2, W.z, 4.5); if (!hit) return null;
    return [{ dist: hit.t, miss: hit.miss, target: { kind: 'prop', ref: 'story:s5.wreck', label: 'Red and cream, down in the water', e: { verb: 'Dive', run: () => startDive() } } }];
  };
  if (pointer && typeof pointer.registerWater === 'function') pointer.registerWater((ray, nr) => wreckTarget(ray, nr));
  // the view under: down over the wreck, looking at the cabin door; a blue-green dark over it, closing in at the edges
  let ov = null, ceil = null;
  const overlay = (on) => {
    if (typeof document === 'undefined') return;
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'dive7b';
      ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;opacity:0;transition:opacity .6s;background:radial-gradient(circle at 50% 50%, rgba(30,70,64,.18) 0%, rgba(10,34,30,.55) var(--r,60%), rgba(2,8,8,.97) calc(var(--r,60%) + 18%));';
      document.body.appendChild(ov);
    }
    ov.style.opacity = on ? '1' : '0';
    if (scene && !ceil) {
      ceil = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x3f7a70, transparent: true, opacity: 0.82, side: THREE.DoubleSide, fog: false, depthWrite: false }));
      ceil.rotation.x = -Math.PI / 2; ceil.name = '7b dive ceiling'; ceil.visible = false; scene.add(ceil);
    }
    if (ceil) ceil.visible = !!on;
  };
  const camUnder = (dt) => {
    const W = wreckAt(); if (!W || !camera || !dv) return;
    const ph = dv.phase, k = ph === 'down' ? Math.min(1, dv.t / DIVE.down) : ph === 'up' ? 1 - Math.min(1, dv.t / DIVE.up) : 1;
    const top = new THREE.Vector3(under.spot.x, W.level + 0.3, under.spot.z);
    // the diver's eye: 2.5 m off the cabin door, a metre over the bed, drifting a little with the breath
    const door = new THREE.Vector3(W.x + Math.sin(W.heading) * 0.6, W.bed + 0.6, W.z + Math.cos(W.heading) * 0.6);
    const eye = new THREE.Vector3(door.x + Math.sin(W.heading) * 2.4 + Math.sin(under.t * 0.7) * 0.15, W.bed + 1.4 + Math.sin(under.t * 0.5) * 0.08, door.z + Math.cos(W.heading) * 2.4);
    camera.position.copy(top.lerp(eye, k));
    camera.lookAt(door);
    camera.updateMatrixWorld();
    if (ceil) { ceil.position.set(W.x, W.level - 0.06, W.z); ceil.updateMatrixWorld(); }
    if (ov) ov.style.setProperty('--r', `${Math.round(62 - dv.narrow * 50)}%`);
  };
  const diveTick = (dt) => {
    if (!dv) return;
    under.t += dt;
    // held where you went down; the canoe drifts with any wind while you are under (60 S5: why Walt wrote "Calm.")
    if (player.mode === 'swim') { player.x = under.spot.x; player.z = under.spot.z; player.speed = 0; }
    const atCase = dv.phase === 'under';
    const r = dv.update(dt, { hold: !!(input && input.held && input.held('KeyE')), up: !!(input && input.pressed && input.pressed('Space')), atCase });
    if (dv && dv.phase === 'under') {
      under.beat -= dt; if (under.beat <= 0) { under.beat = 60 / dv.heart; BEAT(audio, 0.6 + dv.at * 0.6); }
      player.prompt = dv.reach && doc().seen ? { key: 'E', text: 'Hold — work the case free · Space up' } : { key: 'Space', text: 'Up' };
      if (dv.seen && !doc().seen) { doc().seen = true; dirty(); }
    }
    camUnder(dt);
    if (r && r.done) endDive(r.result);
  };
  const endDive = (result) => {
    const d = doc(); d.dives = (d.dives || 0) + 1; d.work = dv ? dv.work : d.work; if (dv && dv.seen) d.seen = true; dirty();
    if (under && under.drop && player.carry) player.carry.drop = under.drop;
    dv = null; under = null; overlay(false);
    // cold: wet through, the warmth down (more in May and October)
    try { if (energy) { energy.soaked = 1; if (energy.need && Number.isFinite(energy.need.warmth)) energy.need.warmth = Math.max(0, energy.need.warmth - ([5, 10].includes(dateNow().month) ? 0.12 : 0.05)); } } catch { /* */ }
    if (d.dives === 1) firstStamp('S5.first');
    if (result === 'brought') note(T('d95.7b.S5.up'), 4);
    if (result === 'case') { apply(['f:s5.case', 'give:item.mapcase', 'give:page.pilotchart'], 'case'); }
  };
  // the canoe left floating drifts downwind while you swim (the capsize's own rate), and Q Dive again over the wreck
  const swimTick = (dt) => {
    const c = (under && under.drop) || (player && player.carry && player.carry.drop);
    if (!player || player.mode !== 'swim' || !c) return;
    const W = wreckAt(); if (!W || Math.hypot(W.x - player.x, W.z - player.z) > 120) return;
    const U = wind ? wind.speed : 0, wd = wind ? wind.dir : { x: 0, z: 0 };
    if (U > 0.6) {
      const nx = c.x + wd.x * 0.035 * U * dt, nz = c.z + wd.z * 0.035 * U * dt;
      if (world.shoreAt(nx, nz) < -1.5) { c.x = nx; c.z = nz; try { player.restHull(c.x, c.z, c.heading); } catch { /* */ } }
    }
    if (dv) return;
    const over = Math.hypot(W.x - player.x, W.z - player.z) < 7, canoeNear = Math.hypot(c.x - player.x, c.z - player.z) < 3.4;
    if (over && diveOk() && !canoeNear) player.prompt = { key: 'Q', text: 'Dive' };
    else if (over && diveOk() && canoeNear) player.prompt = { key: 'E', text: `${(player.prompt && player.prompt.text) || 'Climb into the canoe'} · Q Dive` };
    if (over && diveOk() && input && input.pressed && input.pressed('KeyQ')) startDive();
  };
  // the case into your things once you are out of the water (a swimmer's hands have no room for it: give:item fails there)
  const caseTick = () => {
    if (!live() || !has('s5.case') || has('ep.S5.given') || doc().caseItem || !inventory) return;
    if (inventory.count('mapcase', { reachable: false }) > 0) { doc().caseItem = true; dirty(); return; }
    if (player && player.mode !== 'swim') { apply(['give:item.mapcase'], 'case.item'); if (inventory.count('mapcase', { reachable: false }) > 0) { doc().caseItem = true; dirty(); } }
  };
  // the place door: the wreck read through calm water from the canoe (the first time it is seen)
  const seenTick = () => {
    if (!live() || has('s5.wreck.seen') || !player || player.mode !== 'paddle') return;
    const W = wreckAt(); if (!W) return;
    const dist = Math.hypot(W.x - player.x, W.z - player.z);
    if (dist <= DIVE.near && readsNow(W, dist)) apply(['f:s5.wreck.seen'], 'seen');
  };
  // Pete: told, the next calm bright day; without you, the first after 20 August, Labor Day (7 September) at the latest
  const inGame = () => { try { const tl = typeof window !== 'undefined' && window.__game && window.__game.title; return !tl || tl.state === 'game'; } catch { return true; } };
  const peteTick = () => {
    if (!live() || !inGame() || has('s5.pete.found') || has('s5.case')) return; // (never behind the title card: its clock is the real one)
    const d = doc(), today = dateNow(), key = `${today.year}:${today.doy}`;
    if (has('ep.S5.told') && d.toldDay == null) { d.toldDay = key; dirty(); }
    const after = md() > 820, last = md() >= 907, toldOk = has('ep.S5.told') && d.toldDay !== key;
    if (last || ((after || toldOk) && calmBright())) { apply(['f:s5.pete.found', 'f:s5.wall'], 'pete'); wall.build(); }
  };

  // --- the framed chart on the Round Lake wall --------------------------------------------------------------------------------
  const wall = {
    mesh: null, at: null,
    spot() { const L = storeLayout(51); if (!L) return null; const A = L.axes.a, B = L.axes.b, Cn = L.centre; return { x: Cn.x + A.x * 1.2 + B.x * -3.78, z: Cn.z + A.z * 1.2 + B.z * -3.78, y: L.floorY + 1.55, heading: Math.atan2(B.x, B.z) }; },
    build() {
      if (this.mesh || !scene || !(has('s5.wall') || has('ep.S5.given'))) return;
      const s = this.spot(); if (!s) return;
      const k = kit('chartFrame'); if (!k) return;
      const r = k.build({}); this.mesh = new THREE.Mesh(r.geo, propMaterial()); this.mesh.name = '7b the pilot\'s chart';
      this.mesh.position.set(s.x, s.y, s.z); this.mesh.rotation.y = s.heading; this.mesh.updateMatrixWorld(true); scene.add(this.mesh); this.at = s;
    },
  };
  const wallTarget = (ray, nr) => {
    if (!live() || !wall.mesh || !wall.at || !player || !player.onFoot) return null;
    if (nr.flat(wall.at.x, wall.at.z) > 3.2) return null;
    const hit = nr.sphere(wall.at.x, wall.at.y, wall.at.z, 0.5); if (!hit) return null;
    return [{ dist: hit.t, miss: hit.miss, target: { kind: 'prop', ref: 'story:s5.wallchart', label: 'The pilot\'s chart, framed', e: { verb: 'Look', run: () => {
      apply(['f:s5.wall.read'], 'wall');
      note(T('S5.conv.w1'), 4);
      if (has('ep.S5.helped')) setTimeout(() => note(`“${T('d95.7b.S5.card')}”`, 4), 4200);
    } } } }];
  };

  // --- Gull's east bay: the notch looked at with the chart in the book ----------------------------------------------------------
  const notchTick = () => {
    if (!live() || has('s5.notch') || !has('nb.page.pilotchart') || !camera || !player) return;
    const bay = PL('gull.sign'), n = P('gull.notch'); if (!bay || !n || !near(bay, 700)) return;
    const f = camera.getWorldDirection(new THREE.Vector3()), dx = n.x - player.x, dz = n.z - player.z, d = Math.hypot(dx, dz) || 1;
    const cos = (f.x * dx + f.z * dz) / (Math.hypot(f.x, f.z) * d || 1);
    if (cos > Math.cos(22 * Math.PI / 180)) apply(['f:s5.notch'], 'notch');
  };

  // --- S6: the cut line, the pit, the eye after -------------------------------------------------------------------------------
  const blazeTick = () => {
    if (!live() || has('s6.blazes') || !player || !player.onFoot) return;
    for (const id of ['s6.blaze.1', 's6.blaze.2', 's6.blaze.3']) if (near(P(id), 5)) { apply(['f:s6.blazes'], 'blazes'); return; }
  };
  let pit = null;
  const pitTick = () => {
    if (!live()) return;
    if (has('s6.moss') && !has('ep.S6.done') && !pit) pit = minigames.start('pitOpen', { has: (k) => has(k) });
    if (pit) { const r = pit.update(0); if (r && r.done) pit = null; }
    // a story started and the pit not opened by freeze-up: a stranger digs it the next spring (60 S6, the window)
    const d = doc(), today = dateNow();
    if (has('ep.S6.shut') && !has('s6.ledger') && d.dugYear == null) { d.dugYear = today.year + 1; dirty(); }
    if (d.dugYear != null && !has('s6.dug') && !has('s6.moss') && today.year >= d.dugYear && today.month >= 5) apply(['f:s6.dug'], 'dug');
  };
  // the cellar's moss reads as a pit to someone S6 taught (lock 6 key C): the doc's own words for it
  if (layer && typeof layer.dotName === 'function' && !layer.dot7b) {
    layer.dot7b = true; const d0 = layer.dotName.bind(layer);
    layer.dotName = (id) => (id === 'cellar.pit' && live() && has('ep.S6.done') && !has('pit.cleared') && T('S6.pitdot') ? T('S6.pitdot') : d0(id));
  }
  story.on('fact', ({ key }) => {
    if (!live()) return;
    if (key === 'ep.S6.done') firstStamp('S6.first');
    if (key === 's6.moss' && !has('ep.S6.done') && !has('key.L6C') && !doc().knowSaid) { doc().knowSaid = true; dirty(); note(T('d95.7b.S6.know'), 4); }
    if (key === 's5.wall' || key === 'ep.S5.given') wall.build();
    if (key === 'ep.S6.society') { try { if (inventory && inventory.count('page:ledger1928', { reachable: false }) > 0) inventory.remove('page:ledger1928', 1); } catch (e) { console.warn('7b: the book to René', e); } }
  });

  if (pointer && typeof pointer.register === 'function') pointer.register((ray, nr) => wallTarget(ray, nr));

  // --- the tick ------------------------------------------------------------------------------------------------------------
  // (the game's own frame, through the lamp's update, which main.js runs after the camera every frame and __game.step runs
  // too: the view under the water is set after the chase camera)
  let slow = 0, warned = false;
  const frame = (dt0) => {
    const dt = Math.min(0.1, Number.isFinite(dt0) ? dt0 : 1 / 60);
    try {
      if (live()) { diveTick(dt); swimTick(dt); }
      slow += dt;
      if (slow > 0.5) { slow = 0; peopleTick(); seatWreck(); seenTick(); caseTick(); peteTick(); notchTick(); blazeTick(); pitTick(); if (!wall.mesh) wall.build(); }
    } catch (e) { if (!warned) { warned = true; console.warn('7b: the tick', e); } }
  };
  if (lamp && typeof lamp.update === 'function') { const u0 = lamp.update.bind(lamp); lamp.update = (dt) => { u0(dt); frame(dt); }; }
  else { let lastT = performance.now(); const raf = () => { const now = performance.now(); frame((now - lastT) / 1000); lastT = now; requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
  story.on('season', () => { for (const w of Object.keys(PEOPLE)) unstage(w); if (dv) { if (under && under.drop && player.carry) player.carry.drop = under.drop; dv = null; under = null; overlay(false); } });

  return {
    debug: {
      doc, stage, staged: () => [...staged.keys()], talkTo, scene: (who) => new SceneRun(topics, PEOPLE[who].scene, { who, args: { ep: PEOPLE[who].ep }, hooks }),
      wreck: wreckAt, reads: () => { const W = wreckAt(); return W && player ? readsNow(W, Math.hypot(W.x - player.x, W.z - player.z)) : false; },
      calmBright, seatWreck, seated: () => seated, overSide, startDive, dive: () => dv, endDive, wall, pit: () => pitState((k) => has(k)), peteTick, notchTick,
    },
  };
}
