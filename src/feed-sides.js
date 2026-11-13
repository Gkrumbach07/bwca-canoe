// S1 and S8 in the game (campaign stream S, Round 4; docs/story/60-side-stories.md S1, S8; campaign-design Part 4 Round 4
// "S · Sides"). Loaded only under STORY_ON (main.js's s: block, after E's episodes are connected): with the flag off
// nothing imports this file. The records are on E's runner (story-data/episodes/s1-ollie.js, s8-sled.js); their people
// are data in story-data/sides-s.js; the places and props in story-places.json (s1.*, s8.*).
//
//   connect(t) → { ollie, tom, ostbys, carry, debug }
//     t: { story, layer, topics, texts, T, SceneRun, loadWords, talk, npcs, actors, tiles, pointer, player, inventory, hud,
//          world, parties, episodes, minigames, trip, guest }
//   · Ollie on the Stuart Portage: his walk evenings as a function of the clock (OLLIE), a meeting each way you pass him,
//     "Evening." (60 S1 steps 1–2), the third time he stops (OLLIE_A; "You're on." is the yes), the loaded carry
//     (minigames/timed-carry.js `timedCarry`: road end to river end, canoe and pack, against the squad's 49 minutes; he
//     walks out three minutes after you and is on the rock at 45), his result line, then B at the river end (the log page,
//     the echo with the main story, the lead to Sheila), then "Evening." and one of C's second lines
//   · Tom Becker by his ranger crew's camp (parties.js FIXED_PARTIES 'tom': Lake One Mon–Wed, Insula Thu–Sat), and at the
//     Moose Lake 25 store on Monday mornings (his crew's supply run): his barks (70 §7.2), his scene (TOM)
//   · the Ostbys by the lunch rock 3–9 August (FIXED_PARTIES 'ostbys'): Vern at their fire, on the rock at lunch (OSTBYS)
//   · the keepers' topics (KEEPER_S), the items (Ollie's log and the Ostbys' snapshot as book pages, the tin), a print of
//     the clearing (f:ep.S8.print), the find's stamp, the ambient rumours released (ambient.js s: block)
// A co-op guest (story.mode 'mirror' or guest()): nobody is staged, nothing moves.
import { FieldPerson } from './kettle.js';
import { timedCarry } from './minigames/timed-carry.js';
import { OLLIE, CARRY, OLLIE_A, OLLIE_B, OLLIE_C, EVENING, CARRY_SAYS, TOM, TOM_BARKS, OSTBYS, KEEPER_S } from './story-data/sides-s.js';
import { defineItem, definePage, itemDef } from './items.js';
import { registerSensor } from './story-cond.js';
import { storeLayout } from './props.js';

registerSensor('dayPermit', 'flag');
const TICK = 0.1;            // s: Ollie's place is set this often (the actor eases between)
const STAGE_R = 450;         // m: Ollie is staged while you are this near the trail
const TOM_R = 180;           // m: Tom (and Vern) staged this near their camp
const BARK_R = 22;           // m: Tom's word as you come this near, once a day
const RESULT_R = 40;         // m: Ollie says the carry's result this near
const B_LEAVE = 120;         // m: walk this far from him at the river and he goes home
const hrs = (s) => { const n = s.nowAbs(); return { abs: Math.floor(n), h: (n - Math.floor(n)) * 24, H: n * 24 }; };

export async function connect(t) {
  const { story, layer, topics, talk, actors, tiles, pointer, player, inventory, hud, world, parties, episodes, minigames, trip, SceneRun } = t;
  const guest = () => { try { return !!(t.guest && t.guest()) || story.mode === 'mirror'; } catch { return story.mode === 'mirror'; } };
  const live = () => !!(story && story.doc) && !guest();
  if (t.loadWords) { try { const W = await t.loadWords(['side', 'drafted']); for (const k of ['side', 'drafted']) if (W[k] && t.texts) t.texts.add(W[k]); } catch (e) { console.warn('sides: words', e); } }
  const T = (id) => (t.T ? t.T(id) : null);
  const apply = (then, why) => { if (live()) story.rules.apply({ id: `s:${why}`, then }, {}); };
  const note = (w, s = 5) => { if (w && hud && typeof hud.note === 'function') hud.note(w, s); };
  const near = (a, r) => !!(player && a && Math.hypot(player.x - a.x, player.z - a.z) < r);
  const C = { actors, tiles, pointer, talk, hud };

  // --- the things ------------------------------------------------------------------------------------------------------
  if (!itemDef('page:ollielog')) definePage({ id: 'ollielog', title: 'Ollie\'s search log', ref: 'S1.log', by: 'Ollie' });
  if (!itemDef('page:ostbysnap')) definePage({ id: 'ostbysnap', title: 'A snapshot', ref: 'S8.conv.w1', by: 'Lloyd' });
  if (!itemDef('ertin')) defineItem({ id: 'ertin', name: 'Tobacco tin', short: 'Tin', kind: 'gear', w: 1, h: 1, kg: 0.08, price: 0, sold: false, unique: true, identity: T('S8.the-place.c1') || '', story: 's' });

  // --- sensors, the minigame, the fixed parties, the keepers -------------------------------------------------------------
  story.sensor('dayPermit', () => { try { return !!(trip && trip.active && trip.state && trip.state.dayUse); } catch { return false; } });
  if (minigames) minigames.register('timedCarry', timedCarry);
  if (parties) parties.fixedLive = () => live();
  if (topics && typeof topics.add === 'function') topics.add(KEEPER_S);

  // --- the Stuart Portage ------------------------------------------------------------------------------------------------
  // (the carry by name and its road end's x/z in the public list: a world-fixes carry, not in the v3 data the layer's
  // named portages resolve from; scripts/cmp-s-data.mjs check 1)
  const pub = world && typeof world.portagesPublic === 'function' ? world.portagesPublic() : [];
  const si = pub.findIndex((q) => q && q.name === 'Stuart Portage' && q.pts && q.pts.length > 1 && [q.pts[0], q.pts[q.pts.length - 1]].some((e) => Math.hypot(e[0] + 57783, e[1] + 196) < 400));
  const stuart = si >= 0 ? pub[si] : null;
  // the trail from the road end (d = 0) to the river (d = len), and a point at d
  const line = stuart ? (stuart.pts[0][1] < stuart.pts[stuart.pts.length - 1][1] ? [...stuart.pts].reverse() : stuart.pts).map((p) => [p[0], p[1]]) : null;
  const cum = [0]; if (line) for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const LEN = line ? cum[cum.length - 1] : 0;
  const at = (d) => {
    if (!line) return null; d = Math.max(0, Math.min(LEN, d));
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const k = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), [ax, az] = line[i - 1], [bx, bz] = line[i];
    return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, heading: Math.atan2(-(bz - az), bx - ax) };
  };
  const ROAD = line ? { x: line[0][0], z: line[0][1] } : null, RIVER = line ? { x: line[line.length - 1][0], z: line[line.length - 1][1] } : null;
  const nearTrail = (r) => { if (!line || !player) return false; for (let i = 0; i < line.length; i += 3) if (Math.hypot(line[i][0] - player.x, line[i][1] - player.z) < r) return true; return false; };

  // --- Ollie's evening -------------------------------------------------------------------------------------------------
  const S1st = () => (episodes ? episodes.st('S1') : null) || {};
  const walkEvening = () => story.when(`dow:${OLLIE.days} & window:S1`);
  const carryArmed = () => story.has('ep.S1.yes') && !story.has('ep.S1.log') && !story.has('ep.S1.beat') && !story.has('ep.S1.twice');
  const vWalk = LEN / ((OLLIE.rock[0] - OLLIE.walks) || 0.66);           // m per game hour, road to river
  const vBack = LEN / ((OLLIE.lot - OLLIE.rock[1]) || 0.75);
  const O = { f: null, stop: 0, legs: new Set(), said: null, paused: 0, pauseAt: null, B: false, lastPos: null };
  // where he is now: { d, mode: 'stand' | 'walk' | 'sit', facing: +1 north | -1 back } or null (not on the trail)
  function ollieAt() {
    const { abs, h, H } = hrs(story), st = S1st(), c = st.carry;
    if (c && c.day === abs) {
      // the carry evening: he waits with the watch, walks out after you, is on the rock at 45, waits there for you
      const t0 = c.t0 / 1, lag = t0 + OLLIE.carry.lag, arr = t0 + OLLIE.carry.arrive, home = c.home || null;
      if (H < lag) return { d: 0, mode: 'stand', facing: 1 };
      if (H < arr) return { d: LEN * (H - lag) / (arr - lag), mode: 'walk', facing: 1 };
      if (!home) return { d: LEN, mode: 'stand', facing: -1 };
      const d = LEN - (H - home) * vBack; return d > 0 ? { d, mode: 'walk', facing: -1 } : null;
    }
    if (!walkEvening()) return null;
    // on an evening after the yes, with you by the road end, he waits there with his watch (until the rock's hour)
    if (carryArmed() && h >= OLLIE.armed[0] && h < OLLIE.armed[1] && ROAD && near(ROAD, 220) && !(c && c.day === abs)) return { d: 0, mode: 'stand', facing: 1, armed: true };
    const hp = h - O.paused;
    if (hp < OLLIE.parks || hp >= OLLIE.lot) return null;
    if (hp < OLLIE.walks) return { d: 0, mode: 'stand', facing: 1 };
    if (hp < OLLIE.rock[0]) return { d: (hp - OLLIE.walks) * vWalk, mode: 'walk', facing: 1, leg: 'out' };
    if (hp < OLLIE.rock[1]) return { d: LEN, mode: 'sit', facing: -1 };
    return { d: Math.max(0, LEN - (hp - OLLIE.rock[1]) * vBack), mode: 'walk', facing: -1, leg: 'back' };
  }
  function stageOllie() {
    if (O.f) return O.f;
    O.f = new FieldPerson(C, 'ollie', { x: ROAD.x, z: ROAD.z, heading: 0, name: story.has('ollie.stopped') ? 'Ollie' : 'Old man' });
    O.f.onTalk = () => ollieTalk();
    return O.f;
  }
  function unstageOllie() { if (O.f && !O.f.talking) { O.f.remove(); O.f = null; O.lastPos = null; } }
  // a meeting: passing him on the trail, one each way an evening (60 S1 steps 1–3)
  function meet(pos, now) {
    const key = `${now.abs}:${pos.leg || pos.mode}`;
    if (O.legs.has(key)) return;
    O.legs.add(key); if (O.legs.size > 20) O.legs.delete(O.legs.values().next().value);
    story.meet('ollie', 'pass');
    if (story.has('ep.S1.log')) { sayC(); return; }
    if (story.when('met:ollie>=3') && !story.has('ollie.a')) { O.stop = performance.now(); O.pauseAt = now.h; O.f.say(T('S1.A.1')); return; }
    O.f.say(T(EVENING));
  }
  // C: "Evening." and a second line, rotating (60 S1 C)
  function sayC() {
    if (!O.f) return;
    const st = S1st(); st.c = st.c || [];
    const pick = OLLIE_C.find((c) => (!c.when || story.when(c.when)) && !(c.once && story.has('ollie.c4')) && !st.c.includes(c.id)) || OLLIE_C.find((c) => (!c.when || story.when(c.when)) && !(c.once && story.has('ollie.c4')));
    O.f.say(T(EVENING));
    if (pick) { setTimeout(() => { if (O.f) O.f.say(T(pick.id)); }, 2600); st.c.push(pick.id); if (st.c.length > 3) st.c.shift(); if (pick.once) apply(['f:ollie.c4'], 'c4'); }
  }
  // E on him
  function ollieTalk() {
    if (!live() || !O.f || !talk || !SceneRun) return false;
    const bReady = (story.has('ep.S1.beat') || story.has('ep.S1.twice')) && (!story.has('ep.S1.log') || (O.atRiver && !O.B));
    if (bReady) return openScene(OLLIE_B, 'open', () => { O.B = true; });
    if (story.has('ep.S1.log')) { sayC(); return true; }
    if (story.when('met:ollie>=3') && (!story.has('ollie.a') || !story.has('ep.S1.yes') || O.stop)) return openScene(OLLIE_A, story.has('ollie.a') ? 'topics' : 'open');
    O.f.say(T(EVENING)); // (over his shoulder: the first meetings)
    return true;
  }
  function openScene(def, start, onEnd = null) {
    const fig = def.fig || def.who, f = fig === 'ollie' ? O.f : fig === 'tom' ? TM.f : OS.f;
    if (!f) return false;
    if (fig === 'ollie' || fig === 'tom') story.meet(fig, 'e');
    const run = new SceneRun(topics, def, { who: def.who, args: {},
      hooks: {
        yes: () => { if (episodes) episodes.yes('S1', 'choice'); },
        walkOn: () => { O.stop = 0; resumeOllie(); },
        met: () => { if (story.when('met:tom>=2')) apply(['f:tom.met2'], 'tom2'); },
        takeTin: () => { try { if (inventory && inventory.remove('ertin', 1) && inventory.write) inventory.write(); } catch { /* the inventory's own */ } },
      },
      onEnd: () => { f.talking = false; if (onEnd) onEnd(); } });
    f.talking = true;
    return talk.open({ speaker: f.speaker, name: f.name, role: '', room: null, start: () => run.node(start),
      bye: () => { f.talking = false; if (onEnd) onEnd(); if (def === OLLIE_A) { O.stop = 0; resumeOllie(); } return def.bye ? T(def.bye) : null; } });
  }
  function resumeOllie() { if (O.pauseAt != null) { O.paused += Math.max(0, hrs(story).h - O.pauseAt); O.pauseAt = null; } }

  // --- the loaded carry (60 S1 "The set piece") ----------------------------------------------------------------------------
  const K = { h: null };
  const probe = () => {
    if (typeof K.probe === 'function') return K.probe(); // (a rig's stand-in walker: scripts/cmp-s-test.mjs)
    let pack = false; try { pack = !!(inventory && inventory.worn && inventory.worn('back')); } catch { pack = false; }
    return { x: player.x, z: player.z, hours: hrs(story).H, carrying: player.mode === 'carry', pack };
  };
  function carryTick(pos) {
    const now = hrs(story), st = S1st();
    // armed: he's at the road end with his watch, you're there with the canoe and a pack
    if (!K.h && pos && pos.armed && near(ROAD, CARRY.startR + 30) && minigames) {
      K.h = minigames.start('timedCarry', { start: ROAD, end: RIVER, pts: line, record: CARRY.record, probe, tune: CARRY });
    }
    if (!K.h) return;
    const r = K.h.update(TICK);
    if (K.h.state === 'running' && !(st.carry && st.carry.day === now.abs && st.carry.t0 === K.h.t0)) { st.carry = { day: now.abs, t0: K.h.t0 }; story.dirty && story.dirty(); }
    if (K.h.state === 'armed' && !(pos && pos.armed)) { K.h.cancel(); K.h = null; return; } // (he walked on: another evening)
    if (!r) return;
    K.h = null;
    st.tries = (st.tries || 0) + 1;
    if (st.carry) { st.carry.result = r.result; st.carry.mins = r.mins; }
    let say = CARRY_SAYS[r.result] || null;
    if (r.result === 'missed' && st.tries < 2) apply(['f:ep.S1.missed'], 'missed');
    if (r.result !== 'beat' && st.tries >= 2) { apply(['f:ep.S1.missed', 'f:ep.S1.try2'], 'try2'); if (r.result === 'missed') say = CARRY_SAYS.twice; }
    O.pending = say; story.dirty && story.dirty();
  }
  // he says the result as you're by him at the river, then B (E on him)
  function resultTick() {
    if (!O.pending || !O.f || !near(O.f, RESULT_R)) return;
    const w = T(O.pending); O.pending = null; if (w) O.f.say(w);
  }

  // --- the tick: Ollie ---------------------------------------------------------------------------------------------------
  function ollieTick() {
    if (!live() || !line || !player || (episodes && episodes.held())) { unstageOllie(); return; }
    const pos = nearTrail(STAGE_R) ? ollieAt() : null;
    carryTick(pos);
    resultTick();
    if (!pos) { unstageOllie(); return; }
    const f = stageOllie(), now = hrs(story);
    let p = at(pos.d), stopped = false;
    // from the third meeting on he stops for you (A), until you walk on
    if (O.stop && O.lastPos) { if (near(O.lastPos, 30) || f.talking) { p = O.lastPos; stopped = true; } else { O.stop = 0; resumeOllie(); } }
    if (f.talking && O.lastPos) { p = O.lastPos; stopped = true; }
    const heading = stopped ? Math.atan2(-(player.z - p.z), player.x - p.x) : p.heading + (pos.facing < 0 ? Math.PI : 0);
    const moving = !stopped && pos.mode === 'walk';
    const v = moving && O.lastPos ? Math.min(12, Math.hypot(p.x - O.lastPos.x, p.z - O.lastPos.z) / TICK) : 0;
    if (f.a && typeof f.a.drive === 'function') f.a.drive({ x: p.x, z: p.z, heading, v, mode: moving ? 'walk' : 'stand' }); else f.moveTo(p.x, p.z, heading);
    f.x = p.x; f.z = p.z; f.heading = heading;
    O.lastPos = { x: p.x, z: p.z, heading: p.heading };
    O.atRiver = pos.d >= LEN - 5;
    if (moving && near(p, OLLIE.meetR)) meet(pos, now);
    // after B: he walks home once you go (the carry evening)
    const st = S1st(); if (st.carry && st.carry.day === now.abs && !st.carry.home && O.atRiver && (O.B || st.carry.result) && !near(p, B_LEAVE) && !O.pending) { st.carry.home = now.H; story.dirty && story.dirty(); }
  }

  // --- Tom and the Ostbys ----------------------------------------------------------------------------------------------
  const TM = { f: null, barked: new Map(), where: null }, OS = { f: null, where: null };
  const fixedCamp = (id) => {
    if (!parties || typeof parties.campsAt !== 'function') return null;
    const n = hrs(story); let c = null;
    try { c = parties.campsAt(n.abs, n.h).find((q) => q.party && q.party.fixed === id) || null; } catch { c = null; }
    return c && c.site ? { x: c.site.x, z: c.site.z, i: c.i } : null;
  };
  function tomSpot() {
    const n = hrs(story), d = story.date();
    // Monday mornings at the Moose Lake 25 store (his crew's supply run), by the steps
    if (d.dow === 1 && n.h >= 8 && n.h < 12 && d.month >= 6 && d.month <= 9) { const L = storeLayout(25); if (L) { const f = L.stepsFoot || L.door; return { x: f.x + L.axes.b.x * 3.5 + L.axes.a.x * 2, z: f.z + L.axes.b.z * 3.5 + L.axes.a.z * 2, store: true }; } }
    if (n.h < 7 || n.h >= 21) return null;
    const c = fixedCamp('tom'); return c ? { x: c.x + 3, z: c.z + 2 } : null;
  }
  function ostbySpot() {
    const n = hrs(story);
    if (n.h < 7 || n.h >= 21) return null;
    const c = fixedCamp('ostbys'); if (!c) return null;
    // they eat lunch on the rock (60 S8)
    if (n.h >= 12 && n.h < 13.2 && layer) { const q = layer.prop('s8.lunchrock'); if (q && Number.isFinite(q.prop.x)) return { x: q.prop.x + 1.2, z: q.prop.z + 1.6 }; }
    return { x: c.x + 2.5, z: c.z - 1.5 };
  }
  function personTick(P, who, name, spot, onTalk) {
    if (!live() || !player || (episodes && episodes.held())) spot = null;
    if (spot && !near(spot, TOM_R)) spot = null;
    if (!spot) { if (P.f && !P.f.talking) { P.f.remove(); P.f = null; } return; }
    if (!P.f) { P.f = new FieldPerson(C, who, { x: spot.x, z: spot.z, heading: 0, name }); P.f.onTalk = onTalk; }
    if (!P.f.talking && (Math.abs(P.f.x - spot.x) + Math.abs(P.f.z - spot.z) > 0.5)) P.f.moveTo(spot.x, spot.z, Math.atan2(-(player.z - spot.z), player.x - spot.x));
  }
  function tomTick() {
    personTick(TM, 'tom', story.has('tom.met') ? 'Tom' : 'Ranger', tomSpot(), () => openScene(TOM, 'open'));
    if (!TM.f || TM.f.talking || !near(TM.f, BARK_R)) return;
    const d = hrs(story).abs; if (TM.barked.get('d') === d) return;
    TM.barked.set('d', d);
    const b = TOM_BARKS.find((x) => !x.when || story.when(x.when));
    if (b) { TM.f.say(T(b.id)); if (b.then) apply(b.then, 'tom.bark'); }
  }
  function ostbyTick() { personTick(OS, 'vern', 'Vern', ostbySpot(), () => openScene(OSTBYS, 'open')); }

  // --- S8's prints and the find's stamp -------------------------------------------------------------------------------------
  if (episodes) episodes.on('page', (e) => { if (e && (e.matches || []).includes('s8.clearing')) apply(['f:ep.S8.print'], 'print'); });
  story.on('fact', ({ key }) => {
    if (key === 'ep.S8.found' && episodes && live()) { const st = episodes.st('S8'); if (st && !st.first) { st.first = 'S8.first'; episodes.stamp('S8.first'); story.dirty && story.dirty(); } }
  });

  const TK = { n: 0, w1: false, w2: false }; // (setInterval's id is a number in the browser: no properties on it)
  setInterval(() => {
    try { ollieTick(); } catch (e) { if (!TK.w1) { TK.w1 = true; console.warn('sides: Ollie', e); } }
    if (++TK.n % 5) return; // (Tom and the Ostbys every half second)
    try { tomTick(); ostbyTick(); } catch (e) { if (!TK.w2) { TK.w2 = true; console.warn('sides: Tom', e); } }
  }, TICK * 1000);
  story.on('season', () => { unstageOllie(); if (TM.f) { TM.f.remove(); TM.f = null; } if (OS.f) { OS.f.remove(); OS.f = null; } O.legs.clear(); O.paused = 0; if (K.h) { K.h.cancel(); K.h = null; } });

  return {
    ollie: () => O.f, tom: () => TM.f, ostbys: () => OS.f, carry: () => K.h,
    ollieTalk, tomTalk: () => (TM.f ? openScene(TOM, 'open') : false), ostbyTalk: () => (OS.f ? openScene(OSTBYS, 'open') : false),
    debug: { line: () => line, LEN, ROAD, RIVER, ollieAt, at, O, K, S1st, fixedCamp, tomSpot, ostbySpot, stuartIndex: si },
  };
}
