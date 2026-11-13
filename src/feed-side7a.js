// Round 7 stream 7a in the game (docs/story/60-side-stories.md S2, S3, S4; campaign-design Part 4 Round 7): the side
// stories' people, nights and things on top of the runner (episodes.js, stream E's feed-episodes.js connect). main.js's
// 7a block calls connect7a() under STORY_ON after the e: block; with the flag off nothing imports this file.
//
//   connect7a(t) → { debug }   t: { story, layer, topics, texts, T, SceneRun, loadWords, talk, npcs, scene, photo,
//                              inventory, journal, hud, record, tasks, player, parties, wind, world, tiles, camera, camp,
//                              lamp, audio, day, pointer, weather, energy, guest, E (stream E's connect: episodes,
//                              minigames, show) }
//   · S2: Duane in the Moose River North 16 lot on weekends (his scene, the prints, the frame sold or kept); the sleep at
//     Big Moose's west site breaks at 02:00 and the night plays (minigames/nightwatch.js: the cow and calf on the ridge,
//     the knock, the minute of silence, the bear at the serviceberry; eyeshine; the bluff charge); the frame drawn into a
//     print taken toward the two birches in that minute, lamp off (never in the live view; once a save); tracks on the
//     ridge by day; the snag off the point: Tie off (stream r's 'tieoff' minigame when it is registered, else a hold of
//     our own) and a night afloat (the first stamped)
//   · S3: Elaine at the Slim 6 counter in the afternoons (the sky book; logging; Walt's line at the second; the one
//     light's question mark); the board's forecast card; Fourtown's nights (minigames/skywatch.js: the aurora, the train,
//     the fog lantern, foxfire, the one light) and the waiting night's beat; the red lens (item 'redlens': carried, the
//     headlamp shows red: headlamp.red, stream r's setLens when it is there)
//   · S4: Kari at the store on Fridays (her scene, the tracks on the landing's mud), Lyle in August; the howl survey at the
//     three stakes (minigames/howl.js; Howl and Mark on the dot; pencil.bearing lines; the ring where three cross); the
//     kill with ravens over it; the pups at the meadow in August (seeded 4–6); Kari's report at Leon's counter after
//     15 October
//   · night prints: a picture taken in the dark develops lighter than the eye saw (60 §0.4)
//   · tracks: the dot names prints (S4's vocabulary) once Kari has taught them (tracks.read); window.__game.side7a.tracks
//     lays more (40, 50: boots at landings)
// A co-op guest (story.mode 'mirror' or guest()): none of it moves.
import * as THREE from 'three';
import { minigames as MG0 } from './minigames.js';
import { nightwatch, NIGHT } from './minigames/nightwatch.js';
import { howl, packAt, crossing, bearingDeg, canHowl } from './minigames/howl.js';
import { plan as skyPlan, onelight, subjectsFor as skySubjects, forecast, forecastWords, active as skyActive } from './minigames/skywatch.js';
import { Draw7a } from './side7a-draw.js';
import { play7a } from './sounds-7a.js';
import { pencil } from './pencil.js';
import { defineItem, definePage, itemDef } from './items.js';
import { storeLayout } from './props.js';
import { julianDay, sunPosition, moonPosition, moonIllumination } from './astro.js';

// --- the things (defined only under the flag, as mining-items.js does) ----------------------------------------------------
if (!itemDef('redlens')) defineItem({ id: 'redlens', name: 'Red glass, cut round, wrapped in oilcloth', short: 'Red glass', kind: 'gear', w: 1, h: 1, kg: 0.02, price: 0, sold: false, unique: true, identity: 'Red glass, cut round, wrapped in oilcloth', story: '7a' });
if (!itemDef('foxfire')) defineItem({ id: 'foxfire', name: 'Foxfire', short: 'Foxfire', kind: 'gear', w: 1, h: 1, kg: 0.15, price: 0, sold: false, identity: 'A chunk of rotten birch, glowing green', story: '7a' });
if (!itemDef('page:skysheet')) definePage({ id: 'skysheet', title: 'Elaine\'s sheet', ref: 'S3.skybook', by: 'Elaine' });
if (!itemDef('page:karireport')) definePage({ id: 'karireport', title: 'Kari\'s report', ref: 'S4.kari', by: 'Kari' });

const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const STATIONS = [{ id: 'st1', place: 's4.st1', prop: 's4.stake1' }, { id: 'st2', place: 's4.st2', prop: 's4.stake2' }, { id: 'st3', place: 's4.st3', prop: 's4.stake3' }];
const PACK = { x: -66600, z: -15200, r: 1200 };    // the Agnes pack's range tonight's point is drawn from (west of Agnes)

// --- the scenes (topics.js SceneRun: the doc's words by id) ------------------------------------------------------------------
const DUANE = { id: 'duane', who: 'duane', nodes: {
  open: { say: [{ first: [{ id: 'S2.sold.5', when: 'f:ep.S2.sold' }, { id: 'S2.slowyear', when: 'month:9 & f:duane.met' }, { id: 'S2.conv.17', when: 'f:ep.S2.night & !f:ep.S2.frame & !f:ep.S2.shown.moose & !f:ep.S2.shown.bear & !f:ep.S2.shown.tracks' }, { id: 'S2.conv.1' }] }],
    then: ['f:duane.met'],
    go: [
      { ask: 'S2.conv.c1', once: 'tattler', say: ['S2.conv.2'] },
      { ask: 'S2.conv.c2', once: 'ridge', say: ['S2.conv.3', 'S2.conv.4'], to: 'cast' },
      { ask: 'S2.conv.c4', once: 'seen', say: [{ id: 'S2.conv.6', strip: ' Once in \'09. Taller than the tent, easy.' }] },
      { ask: 'S2.conv.c4', when: 'f:duane.said.seen & f:ep.S2.night', once: 'seen2', say: [{ id: 'S2.conv.6', strip: 'Twice. Once in \'09, two in the morning. Tall as the tent. ' }] },
      { ask: 'S2.conv.c5', once: 'pay', say: ['S2.conv.7'], then: ['do:yes'] },
      { ask: 'S2.conv.c6', once: 'where', say: ['S2.conv.8'], then: ['do:yes'] },
      { ask: 'S2.conv.c7', once: 'tent', say: ['S2.conv.9'] },
    ] },
  cast: { go: [{ ask: 'S2.conv.c3', when: 'f:tracks.read', once: 'cast', say: ['S2.conv.5'] }], hub: 'open' },
  frame: { go: [{ ask: 'S2.conv.c8', say: ['S2.conv.19', 'S2.conv.20'], to: 'sell' }] },
  sell: { go: [
    { ask: 'S2.sold.1', say: ['S2.sold.2'], then: ['f:ep.S2.sold', 'do:sold'], to: 'open' },
    { ask: 'S2.conv.c9', say: ['S2.conv.21'], then: ['f:ep.S2.kept'], to: 'open' },
  ] },
} };
const ELAINE = { id: 'elaine', who: 'elaine', nodes: {
  open: { say: [{ first: [{ id: 'S3.iceout', when: 'month:10 & f:ep.S3.mark' }, { id: 'S3.conv.1' }] }], then: ['f:elaine.met'],
    go: [
      { ask: 'S3.conv.c1', once: 'out', say: ['S3.conv.2', 'S3.conv.3'], then: ['do:sheet'] },
      { ask: 'S3.conv.c2', once: 'known', say: [{ first: [{ id: 'S3.conv.4', when: 'f:ep.S3.square', strip: '' }, { id: 'S3.conv.4', strip: ' Once, sort of. I wrote \'boat\' on it. I\'m not proud of \'boat\'.' }] }] },
      { ask: 'S3.conv.c3', once: 'why', say: ['S3.conv.5', 'S3.conv.6'], then: ['do:sheet'] },
      { ask: 'S3.red-herrings.c1', when: 'f:ep.S3.square', once: 'red', say: ['S3.conv.27'] },
    ] },
  // the second light logged: Walt's line in the binder (once)
  square: { say: ['S3.conv.22', { hook: 'square' }, 'S3.conv.23'], then: ['f:ep.S3.square', { when: 'f:nb.found', then: ['walt:S3.conv.w1'] }], go: [
    { ask: 'S3.conv.c8', once: 'w', say: ['S3.conv.24', 'S3.conv.25', 'S3.conv.26'], to: 'square2' },
    { ask: 'S3.conv.c9', once: 'red2', say: ['S3.conv.27'], to: 'square2' },
  ] },
  square2: { go: [{ ask: 'S3.conv.c8', once: 'w', say: ['S3.conv.24', 'S3.conv.25', 'S3.conv.26'] }, { ask: 'S3.conv.c9', once: 'red2', say: ['S3.conv.27'] }], hub: 'open' },
  // the one light (show.js want to: 'one'): she tries three things, then writes the question mark
  one: { go: [
    { ask: 'S3.conv.c4', once: 'one.low', say: ['S3.conv.12', 'S3.conv.13'], to: 'one' },
    { ask: 'S3.conv.c5', once: 'one.up', say: ['S3.conv.14', 'S3.conv.15'], to: 'one' },
    { ask: 'S3.conv.c6', once: 'one.lamp', say: ['S3.conv.16', 'S3.conv.17'], to: 'mark' },
  ] },
  mark: { say: [{ text: '[?]' }, 'S3.conv.18', 'S3.conv.19'], then: ['f:ep.S3.mark'], go: [{ ask: 'S3.conv.c7', when: 'read:NB26', once: 'walt', say: ['S3.conv.20', 'S3.conv.21'] }], hub: 'open' },
} };
const KARI = { id: 'kari', who: 'kari', nodes: {
  open: { say: [{ first: [{ hook: 'beach', when: 'f:ep.S4.yes & !f:ep.S4.tracks' }, { id: 'S4.conv.15', when: 'f:ep.S4.ring & !f:kari.said.ring' }, { id: 'S4.moved.1', when: 'f:ep.S4.moved & !f:kari.said.moved' }, { id: 'S4.conv.1' }] }], then: ['f:kari.met', 'do:open'],
    go: [
      { ask: 'S4.conv.c1', once: 'job', say: ['S4.conv.2', 'S4.conv.3'], then: ['do:yes'] },
      { ask: 'S4.conv.c2', once: 'howl', say: ['S4.conv.4'], then: ['do:howl'] },
      { ask: 'S4.conv.c3', once: 'safe', say: ['S4.conv.5'] },
      { ask: 'S4.conv.c4', once: 'care', say: ['S4.conv.6'], to: 'argue' },
      { ask: 'S4.conv.c6', once: 'tell', say: ['S4.conv.8'] },
      { ask: 'S4.conv.c7', when: 'read:NB44', once: 'loons', say: ['S4.conv.9'], to: 'loons' },
    ] },
  argue: { go: [{ ask: 'S4.conv.c5', once: 'argue', say: ['S4.conv.7'] }], hub: 'open' },
  loons: { go: [{ ask: 'S4.conv.c8', once: 'when', say: ['S4.conv.10', 'S4.conv.11'] }], hub: 'open' },
  count: { say: [{ hook: 'count' }], hub: 'open' },
} };
const LYLE = { id: 'lyle', who: 'lyle', nodes: {
  open: { say: [{ first: [{ id: 'd95.7a.S4.lyle2', when: 'f:lyle.said.no & days.since(lyle.said.no)>=7' }, { id: 'S4.conv.18' }] }], then: ['f:lyle.met'],
    go: [
      { ask: 'S4.conv.c9', when: '!f:lyle.said.no | days.since(lyle.said.no)>=7', once: 'no', say: ['S4.conv.19'], end: true },
      { ask: 'd95.7a.S4.give', when: 'f:ep.S4.ring & !f:ep.S4.lyle', say: ['S4.conv.20'], then: ['f:ep.S4.lyle'], end: true },
    ] },
} };

export async function connect7a(t) {
  const { story, layer, topics, texts, SceneRun, loadWords, talk, npcs, scene, photo, inventory, hud, record, player, parties, wind, world, tiles, camera, camp, lamp, audio, day, pointer, weather, energy } = t;
  const E = t.E || {}, episodes = E.episodes, show = E.show, minigames = E.minigames || MG0;
  const guest = () => { try { return !!(t.guest && t.guest()) || story.mode === 'mirror'; } catch { return story.mode === 'mirror'; } };
  const live = () => !!(story && story.doc) && !guest();
  if (loadWords) { const W = await loadWords(['side', 'drafted']); if (W.side) texts.add(W.side); if (W.drafted) texts.add(W.drafted); }
  const T = (id) => (t.T ? t.T(id) : null);
  const note = (w, s = 5) => { if (w && hud && typeof hud.note === 'function') hud.note(w, s); };
  const apply = (then, why) => { if (live()) story.rules.apply({ id: `7a:${why}`, then }, {}); };
  const has = (k) => !!(story && story.has(k));
  const doc = () => { const d = story.doc; if (!d.s7a || typeof d.s7a !== 'object') d.s7a = {}; return d.s7a; };
  const dirty = () => { if (typeof story.dirty === 'function') story.dirty(); };
  const D = new Draw7a({ scene, world, tiles, camera });
  const P = (id) => { const q = layer && layer.prop(id); return q && Number.isFinite(q.prop.x) ? q.prop : null; };
  const PL = (id) => { const q = layer && layer.place(id); return q && Number.isFinite(q.x) ? q : null; };
  const near = (o, r) => !!(o && player && Math.hypot(o.x - player.x, o.z - player.z) < r);
  const hours = () => (day ? day.hours : 12);
  const dateNow = () => story.date();
  const dark = () => !!(day && day.elevation < -6);
  const firstStamp = (key, words) => { try { if (record && typeof record.first === 'function' && words) record.first('story', key, words.replace(/^First stamped:\s*/i, ''), null); } catch (e) { console.warn('7a: first', e); } };
  const stampPart = (id, i) => { const w = T(id); if (!w) return; const parts = w.replace(/^First stamped:\s*/i, '').replace(/\.$/, '').split(/;\s*/); const p = (parts[i] || '').replace(/\s*\(.*\)$/, '').trim(); if (p) firstStamp(`${id}#${i}`, `${p}.`); };
  const say = (who, ids, gap = 3600) => { ids.filter(Boolean).forEach((id, k) => setTimeout(() => { const w = T(id) || id; note(`${who}: “${w}”`, 5); }, k * gap)); };

  // --- the minigames ---------------------------------------------------------------------------------------------------
  minigames.register('nightwatch', nightwatch);
  minigames.register('howl', howl);
  minigames.register('skywatch', onelight);

  // --- the lamp's red lens (S3; the run's red light, stream r: headlamp.red / setLens) -------------------------------------
  const lensOn = () => live() && inventory && typeof inventory.count === 'function' && inventory.count('redlens', { reachable: true }) > 0;
  // (j1: one lens. headlamp.js's setLens colours the beam (stream r); this is the only place that fits it: red while the
  // glass is carried, on the run and off it. 7a's own fallback colouring is gone)
  const lampMode = () => (lamp && lamp.on ? (lamp.red ? 'red' : 'white') : 'off');
  const lensTick = () => {
    if (!lamp) return;
    const on = lensOn();
    if (typeof lamp.setLens === 'function' && (lamp.lens === 'red') !== on) lamp.setLens(on ? 'red' : 'white'); // j1: one lens
    if (on && !has('lens.red')) apply(['f:lens.red'], 'lens');
  };

  // --- the people at the counters and the lot ----------------------------------------------------------------------------
  const REC = Object.fromEntries((episodes ? episodes.records() : []).map((r) => [r.id, r]));
  const LOOKS = {
    duane: { age: 'old', shirt: 0x3f6a3a, pants: 0x3a4a5e, hat: 0x2f4a2a, hair: 0x9a948a },
    elaine: { age: 'old', shirt: 0x7a5a8a, pants: 0x34343a, hat: null, hair: 0xcfc9c0, female: true },
    kari: { age: 'young', shirt: 0x8a3a2a, pants: 0x4a4a3e, hat: 0x2a3a5a, hair: 0x8a6a3a, female: true },
    lyle: { age: 'mid', shirt: 0x6a6a4a, pants: 0x4a4436, hat: 0x6a5a3a, hair: 0x6a5a4a },
  };
  const PEOPLE = {
    duane: { ep: 16, rec: 'S2', when: () => episodes.window('S2') && story.when(REC.S2.duane.when), name: () => (has('duane.met') ? 'Duane' : 'A man with a cooler'), scene: DUANE, outside: true },
    elaine: { ep: 6, rec: 'S3', when: () => { const m = dateNow().month; return m >= 6 && m <= 10 && story.when(REC.S3.elaine.when); }, name: () => (has('elaine.met') ? 'Elaine' : 'A woman with a binder'), scene: ELAINE },
    kari: { ep: 16, rec: 'S4', when: () => episodes.window('S4') && story.when(REC.S4.kari.when), name: () => (has('kari.met') ? 'Kari' : 'A young woman with a notebook'), scene: KARI, spot: 'counterEnd' },
    lyle: { ep: 16, rec: 'S4', when: () => episodes.window('S4') && has('kari.met') && story.when(REC.S4.lyle.when), name: () => (has('lyle.met') ? 'Lyle' : 'A man with a long lens'), scene: LYLE },
  };
  const staged = new Map();
  const spotOf = (who, L) => {
    const A = L.axes.a, B = L.axes.b, Cn = L.centre, at = (a, b) => ({ x: Cn.x + A.x * a + B.x * b, z: Cn.z + A.z * a + B.z * b });
    if (who === 'duane') { const d = L.door || at(0, 3.9), p = { x: d.x + B.x * 7 + A.x * 3, z: d.z + B.z * 7 + A.z * 3 }; return { ...p, heading: Math.atan2(B.z, -B.x) }; } // (out in the lot, in his lawn chair by the pickup)
    if (who === 'elaine') return { ...at(1.5, 2.6), y: L.floorY, heading: Math.atan2(-(B.z), B.x) };
    if (who === 'lyle') return { ...at(-1.8, 1.4), y: L.floorY, heading: Math.atan2(-(A.z), A.x) };
    return 'counterEnd';
  };
  const stage = (who) => {
    const p = PEOPLE[who], L = storeLayout(p.ep); if (!L || !npcs) return;
    const sp = spotOf(who, L), rec = { key: `cast:${who}:${p.ep}`, name: p.name(), role: '', look: LOOKS[who], talk: () => (talkTo(who) ? true : null) };
    let h = null;
    if (p.outside && typeof npcs.standAt === 'function' && typeof sp === 'object') h = npcs.standAt(sp, { ...rec, ep: p.ep });
    else if (typeof npcs.extraAt === 'function') h = npcs.extraAt(p.ep, { ...rec, spot: sp });
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
    sold: () => { const d = doc(); d.sold = true; dirty(); },
    sheet: () => { if (episodes && !episodes.started('S3')) episodes.yes('S3', 'choice'); if (!has('nb.page.skysheet')) story.rules.apply({ id: '7a:sheet', then: ['give:page.skysheet'] }, {}); },
    square: () => ({ text: T('S3.walt.square') || '' }),
    open: (run) => { if (run.who === 'kari' && has('ep.S4.ring')) apply(['f:kari.said.ring'], 'kari.ring'); if (run.who === 'kari' && has('ep.S4.moved')) apply(['f:kari.said.moved'], 'kari.moved'); },
    howl: () => { play7a(audio, 'myhowl', null, 0.8); },
    beach: () => {
      // the tracks taught, on the landing's mud (owner default 7a: her Fridays at the post; the wolves walk the landing)
      apply(['f:ep.S4.tracks', 'f:tracks.read'], 'tracks'); layLandingTracks();
      const a = T('S4.conv.13'), b = T('S4.conv.14'); return { text: [a, b].filter(Boolean).join(' ') };
    },
    count: () => { const n = doc().pups || 5, w = (T('S4.conv.17') || '').replace(/Five/g, cap(WORD[n] || String(n))); return { text: w }; },
  };
  function talkTo(who, o = {}) {
    const s = staged.get(who), p = PEOPLE[who];
    if (!s || !s.h || !talk || !SceneRun || !live()) return false;
    const run = new SceneRun(topics, p.scene, { who, args: { ep: p.ep }, hooks, mark: npcs && npcs.mark ? (w) => npcs.mark(w) : null, show: show ? (r, from) => show.choice(who, r, from) : null });
    story.meet(who, '7a');
    const start = () => {
      if (o.give && show) return show.answer(o.give, { kind: 'item', id: o.give.item }, () => run.choices('open'));
      if (who === 'elaine' && has('ep.S3.two') && !has('ep.S3.square')) return run.node('square');
      return run.node('open');
    };
    const bye = { duane: 'S2.conv.10', elaine: 'S3.conv.28', kari: 'S4.conv.12' }[who];
    return talk.open({ speaker: s.h.speaker, name: p.name(), role: '', room: p.ep, start, bye: () => (bye ? T(bye) : null) });
  }
  if (show) for (const who of Object.keys(PEOPLE)) show.talker(who, (o) => talkTo(who, o));
  // the first light logged: Elaine's one sentence (once); the second: Walt's line (her 'square' node, next talk)
  story.on('fact', ({ key }) => {
    if (!live()) return;
    if (/^ep\.S3\.log\./.test(key)) {
      if (!doc().match) { doc().match = true; dirty(); setTimeout(() => say('Elaine', ['S3.match']), 4200); }
      if (key === 'ep.S3.log.aurora') stampPart('S3.first2', 0);
    }
    if (key === 'ep.S3.mark') stampPart('S3.first2', 1);
    if (key === 'ep.S2.sold') doc().soldAt = story.time().abs;
    if (key === 'ep.S4.counted') stampPart('S4.first', 1);
  });
  // the Tattler at the counters for the rest of that season (S2.sold.3/.4), a bark now and then
  if (npcs && typeof npcs.addPool === 'function') npcs.addPool('word', (c) => {
    if (!live() || !has('ep.S2.sold')) return null;
    const d = doc(); if (d.soldYear != null && d.soldYear !== dateNow().year) return null;
    if (d.soldYear == null) { d.soldYear = dateNow().year; dirty(); }
    const t0 = story.time(); if (story.hash(`7a.tattler:${c.ep}:${t0.abs}`) % 4) return null;
    const id = story.hash(`7a.tattler.w:${t0.abs}`) % 2 ? 'S2.sold.3' : 'S2.sold.4', w = T(id); return w ? { id, text: w } : null;
  });

  // --- the forecast card on Slim 6's board (S3) ---------------------------------------------------------------------------
  if (episodes && typeof episodes.paper === 'function' && !episodes.paper7a) {
    const p0 = episodes.paper.bind(episodes); episodes.paper7a = true;
    episodes.paper = (rec) => { const p = p0(rec); if (rec && rec.id === 'S3') { const d = dateNow(), f = forecastWords(forecast(d.year, d.doy, `${story.doc.season}`), d.year); if (f) p.text = `${p.text} ${f}`.trim(); } return p; };
  }

  // --- S2: the night at two on Big Moose ----------------------------------------------------------------------------------
  let nw = null;      // the nightwatch handle while it runs
  const animals = { moose: null, calf: null, bear: null };
  const ridgeOf = () => {
    const pl = PL('s2.ridge'), bir = P('s2.birches'), berry = P('s2.berry'), logp = P('s2.log');
    if (!pl || !bir || !berry) return null;
    // the ridge line, west → east, through the log and the berry (40 m behind the tent)
    return { a: logp ? { x: logp.x - (berry.x - logp.x) * 0.6, z: logp.z - (berry.z - logp.z) * 0.6 } : { x: bir.x - 30, z: bir.z }, b: { x: berry.x, z: berry.z } };
  };
  const atSite = () => { const pl = PL('s2.ridge'); return pl && near(pl, 90); };
  const nightDue = () => {
    if (!live() || !episodes || !episodes.window('S2') || episodes.held()) return false;
    const d = doc(); return d.nightYear !== dateNow().year;
  };
  if (camp && typeof camp.wakeTime === 'function' && !camp.wake7a) {
    camp.wake7a = true; const w0 = camp.wakeTime.bind(camp);
    camp.wakeTime = (choice) => {
      const W = w0(choice);
      try {
        const h = hours();
        if (!W.day && !W.nap && atSite() && nightDue() && (h >= 18 || h < 1.9)) {
          const to2 = ((NIGHT.start - h) % 24 + 24) % 24;
          if (to2 > 0.25 && to2 < W.hours) { doc().pending = true; dirty(); return { ...W, at: NIGHT.start, hours: to2 }; }
        }
      } catch (e) { console.warn('7a: the night at two', e); }
      return W;
    };
  }
  // tied off: a sleep here is a night afloat (the first stamped)
  if (camp && typeof camp.sleep === 'function' && !camp.sleep7a) {
    camp.sleep7a = true; const s0 = camp.sleep.bind(camp);
    camp.sleep = (kind, choice, shared) => {
      const afloat = !!tied || (minigames.active || []).some((h) => h.kind === 'tieoff');
      const r = s0(kind, choice, shared);
      if (afloat && live()) { if (tied && camp.night) camp.night.q *= 0.72; firstStamp('S2.first', T('S2.first')); } // (cold, cramped: 50 6.2; stream r's dial keeps its own ceiling)
      return r;
    };
  }
  const startNight = () => {
    const R = ridgeOf(), pl = PL('s2.ridge'), bir = P('s2.birches'), berry = P('s2.berry'), logp = P('s2.log');
    if (!R || !pl) return;
    const hung = (() => { try { const b = t.bear; if (!b || typeof b.exposed !== 'function') return true; return !b.exposed(player.x, player.z, { asleep: true }).length; } catch { return true; } })();
    const d = doc(); d.pending = false; d.nightYear = dateNow().year; dirty();
    nw = minigames.start('nightwatch', { ridge: R, tent: { x: player.x, z: player.z }, berry, birches: bir, logAt: logp, hung, raid: false, hours: hours(), seed: `${story.doc.season}:${d.nightYear}` });
    if (!nw) return;
    if (!episodes.started('S2')) { /* the place door: mg:nightwatch writes the yes (the compiled rule) */ }
    note(T('d95.7a.S2.wake'), 6);
    for (const k of ['moose', 'calf', 'bear']) if (!animals[k]) animals[k] = D.creature(k);
  };
  const nightTick = (dt) => {
    const d = doc();
    if (!nw && d.pending && live() && hours() >= NIGHT.start && hours() < NIGHT.start + 0.1 && !(camp && camp.night) && atSite()) startNight();
    if (!nw) return;
    const face = camera ? camera.getWorldDirection(new THREE.Vector3()) : null;
    const r = nw.update(dt, { hours: hours() < 12 ? hours() : hours() - 24, player: { x: player.x, z: player.z, onFoot: !!player.onFoot }, lamp: lampMode(), face: face ? { x: face.x, z: face.z } : null });
    for (const c of nw.cues.splice(0)) play7a(audio, c.kind === 'rip' ? 'rip' : c.kind, { x: c.x, y: D.ground(c.x, c.z) + 1, z: c.z }, 1);
    const tt = performance.now() / 1000;
    for (const [k, fn] of [['moose', 'moose'], ['calf', 'calf'], ['bear', 'bear']]) { const s = nw[fn](), g = animals[k]; if (s.show) D.put(g, s.x, s.z, s.heading, { pose: s.pose, t: tt }); else D.hide(g); }
    // eyeshine, two metres up, when the white lamp is on the cow
    const m = nw.moose(); D.eyes(lampMode() === 'white' && nw.flags.eyes && m.show && m.pose !== 'flee', { x: m.x + Math.cos(m.heading) * 1.9, y: D.ground(m.x, m.z) + 2.0, z: m.z - Math.sin(m.heading) * 1.9, heading: m.heading });
    if (nw.flags.charged && !d.chargedSaid) { d.chargedSaid = true; note(T('d95.7a.S2.charge'), 5); try { if (energy && Number.isFinite(energy.value)) energy.value = Math.max(0, energy.value - 0.04); } catch { /* */ } }
    if (nw.flags.eyes && !d.eyesSaid) { d.eyesSaid = true; note(T('d95.7a.S2.eyes'), 5); }
    if (r && r.done) {
      nw = null; D.eyes(false); for (const g of Object.values(animals)) D.hide(g);
      layRidgeTracks(); d.eyesSaid = false; d.chargedSaid = false; dirty();
    }
  };
  const layRidgeTracks = () => {
    const R = ridgeOf(), berry = P('s2.berry'); if (!R) return;
    const h = Math.atan2(-(R.b.z - R.a.z), R.b.x - R.a.x);
    D.tracks('s2.moose', 'moose', R.a.x, R.a.z, h, 14);
    D.tracks('s2.calf', 'moose', R.a.x + 1.2, R.a.z + 1.2, h, 10);
    if (berry) D.tracks('s2.bear', 'bear', berry.x - 3, berry.z - 1, 0.3, 6);
    doc().ridgeTracks = dateNow().year; dirty();
  };
  const TRACK_WORDS = { moose: 'S4.the-set-pieces.c3', bear: 'S4.the-set-pieces.c4', wolf: 'S4.the-set-pieces.c1', pup: 'S4.the-set-pieces.c2', boots: 'S4.the-set-pieces.c5', wait: 'S4.the-set-pieces.c6', yours: 'S4.the-set-pieces.c7' };
  const trackWords = (set) => (has('tracks.read') ? T(TRACK_WORDS[set.words || set.kind]) || T('d95.7a.tracks') : T('d95.7a.tracks'));

  // --- S2: Tie off at the snag (stream r's 'tieoff' when there; else our own hold) ----------------------------------------
  let tied = null;
  const snagTarget = (ray, nr) => {
    if (!live() || !player || player.onFoot || player.mode === 'swim') return null;
    const s = P('s2.snag'); if (!s || nr.flat(s.x, s.z) > 6) return null;
    const hit = nr.sphere(s.x, D.ground(s.x, s.z) + 0.6, s.z, 1.4); if (!hit) return null;
    const firstNight = has('ep.S2.yes') || here36();
    if (!firstNight && !has('tieoff.learned')) return null;
    if (tied) return [{ dist: hit.t, miss: hit.miss, target: { kind: 'snag', ref: 'story:s2.snag', label: 'Snag', e: { verb: 'Sleep', run: () => { try { camp.sleep('canoe', 'first'); } catch (e) { console.warn('7a: sleep afloat', e); } } }, q: { verb: 'Untie', run: () => { tied = null; } } } }];
    return [{ dist: hit.t, miss: hit.miss, target: { kind: 'snag', ref: 'story:s2.snag', label: 'Snag', e: { verb: 'Tie off', run: () => tieOff(s) } } }];
  };
  const here36 = () => has('ep.S2.here36');
  const tieOff = (s) => {
    if ((minigames.kinds() || []).includes('tieoff')) { const h = minigames.start('tieoff', { snag: { x: s.x, z: s.z }, why: 'S2' }); if (h) return; }
    tied = { x: player.x, z: player.z, heading: player.heading };
    if (!has('tieoff.learned')) apply(['f:tieoff.learned'], 'tieoff');
  };
  const tieTick = () => { if (!tied || !player) return; if (player.onFoot || player.mode === 'swim') { tied = null; return; } player.speed = 0; if (Math.hypot(player.x - tied.x, player.z - tied.z) > 0.8) { player.x += (tied.x - player.x) * 0.2; player.z += (tied.z - player.z) * 0.2; } };
  if (layer && typeof layer.on === 'function') layer.on('readHere', (e) => { if (e && e.nb === 'NB36') apply(['f:ep.S2.here36'], 'here36'); if (e && e.nb === 'NB44') { doc().loons = true; dirty(); } });
  if (pointer && typeof pointer.registerWater === 'function') pointer.registerWater((ray, nr) => snagTarget(ray, nr));

  // --- S3: Fourtown's nights ------------------------------------------------------------------------------------------------
  let sky = null, one = null;
  const moonNow = () => {
    try { const d = dateNow(), jd = julianDay(d.year, d.month, d.day) + (d.hours - 5) / 24 + 0.25; const pl = day.place || { lat: 47.9, lon: -91.8 }; return moonIllumination(sunPosition(jd, pl.lat, pl.lon), moonPosition(jd, pl.lat, pl.lon)); } catch { return 0.5; }
  };
  const onFourtown = () => { const a = PL('s3.northbay'), b = PL('s3.longrock'); return (a && near(a, 4000)) || (b && near(b, 2500)); };
  const partyNorth = () => { try { const tt = story.time(), nb = PL('s3.northbay'); return !!(parties && nb && parties.campsAt(tt.abs, tt.hours || 0).some((c) => c.site && Math.hypot(c.site.x - nb.x, c.site.z - nb.z) < 1300)); } catch { return false; } };
  const skyTick = (dt) => {
    if (!live()) { D.aurora(false); D.train(false); return; }
    const h = hours(), d = dateNow(), eve = h < 12 ? d.doy - 1 : d.doy, key = `${d.year}:${eve}`;
    if (!dark()) { sky = null; D.aurora(false); D.train(false); D.glow('lantern', false); D.glow('foxfire', false); if (one) { one.cancel(); one = null; D.glow('one', false); } return; }
    const inWin = episodes && episodes.window('S3');
    if (!sky || sky.key !== key) {
      const dd = doc(), logged = ['aurora', 'train', 'lantern', 'foxfire'].filter((k) => has(`ep.S3.log.${k}`)).length;
      let wet = false; try { wet = story.when('rain.days>=2'); } catch { wet = false; }
      const st = weather ? weather.state : 'clear', clear = !/rain|storm|overcast|fog/.test(st), calm = !wind || wind.speed < 3;
      sky = { key, eve, ...skyPlan({ year: d.year, doy: eve, seed: `${story.doc.season}`, moon: moonNow(), clear, calm, wet, warm: d.month === 9, partyNorth: partyNorth(), logged, oneSeen: !!dd.oneSeen, lastOne: dd.oneAt ?? -99, lastBeat: dd.lastBeat || null, dusk: day.sunriseSunset && day.sunriseSunset.set != null ? day.sunriseSunset.set : 20 }), beatDone: false };
      if (!inWin || !(has('ep.S3.yes') || onFourtown())) { sky.events = sky.events.filter((e) => e.kind === 'aurora' || e.kind === 'train'); sky.beat = null; }
      if (sky.beat) { dd.lastBeat = sky.beat.kind; dirty(); }
    }
    const H = h < 12 ? h + 24 : h, ev = sky.events;
    const aur = skyActive(ev, H, 'aurora'); D.aurora(!!aur, aur ? Math.min(1, (H - aur.from) * 2, (aur.to - H) * 2) : 0);
    const tr = skyActive(ev, H, 'train'); D.train(!!tr, tr ? (H - tr.from) / (tr.to - tr.from) * 1.35 : 0);
    const nb = PL('s3.northbay'), log = P('s3.birchlog');
    const ln = skyActive(ev, H, 'lantern'); D.glow('lantern', !!(ln && nb), nb ? { x: nb.x + 30, y: D.ground(nb.x + 30, nb.z + 25) + 2.2, z: nb.z + 25, color: 0xffd08a, size: 1.6, a: 0.9 } : {});
    const fx = skyActive(ev, H, 'foxfire'); D.glow('foxfire', !!(fx && log && !doc().foxTaken), log ? { x: log.x, y: D.ground(log.x, log.z) + 0.25, z: log.z, color: 0x6aff8a, size: 1.2, a: 0.45 } : {});
    // the one light
    const ol = skyActive(ev, H, 'onelight');
    if (ol && !one && nb && near(nb, 3500) && !doc().oneTonight) {
      doc().oneTonight = sky.key; const wb = ((wind ? wind.from : 300) + 180) * Math.PI / 180;
      one = minigames.start('skywatch', { at: { x: nb.x - 200, z: nb.z + 150 }, wind: { x: Math.sin(wb), z: -Math.cos(wb) }, hours: H, seed: sky.key, gameT: () => ((hours() < 12 ? hours() + 24 : hours()) - ol.from) });
      if (one) one.seen = false;
    }
    if (one) {
      const face = camera ? camera.getWorldDirection(new THREE.Vector3()) : null;
      const r = one.update(dt, { player: { x: player.x, z: player.z }, lamp: lampMode(), face: face ? { x: face.x, z: face.z } : null });
      const q = one.pos(); D.glow('one', q.a > 0.01, { x: q.x, y: D.ground(q.x, q.z) + q.y, z: q.z, color: 0xfff1d8, size: 2.4, a: q.a });
      if (one.seen && !has('ep.S3.onelight')) { apply(['f:ep.S3.onelight'], 'onelight'); const dd = doc(); dd.oneSeen = true; dd.oneAt = sky.eve; dirty(); }
      if (r && r.done) { one = null; D.glow('one', false); }
    }
    if (doc().oneTonight && doc().oneTonight !== sky.key) { doc().oneTonight = null; }
    // the waiting night's beat (one a night, 21:00–01:00, rotating)
    if (sky.beat && !sky.beatDone && H >= sky.beat.at && onFourtown()) { sky.beatDone = true; playBeat(sky.beat.kind); }
  };
  const playBeat = (kind) => {
    const nb = PL('s3.northbay'), lr = PL('s3.longrock'); if (!nb || !lr) return;
    const mid = (k) => ({ x: nb.x + (lr.x - nb.x) * k, z: nb.z + (lr.z - nb.z) * k });
    const at = (p, dt2 = 0) => ({ x: p.x, y: D.ground(p.x, p.z) + 0.5, z: p.z, at: dt2 });
    if (kind === 'beaver') { play7a(audio, 'slap', at(nb), 1.2); play7a(audio, 'slap', at(mid(0.6), 9), 1); }
    else if (kind === 'owl') { play7a(audio, 'owl', at({ x: lr.x + 60, z: lr.z + 40 }), 1); play7a(audio, 'owl', at({ x: lr.x - 700, z: lr.z - 500 }, 4), 0.8); }
    else if (kind === 'moose') play7a(audio, 'splash', at(mid(0.45)), 1);
    else if (kind === 'voices') { const q = (T('S3.voices') || '').split('\n')[0].match(/"([^"]+)"/g) || []; q.forEach((w, k) => setTimeout(() => note(w.replace(/\*/g, '').replace(/"/g, '“').replace(/“$/, '”'), 5), k * 4200)); }
  };
  // foxfire: E on the glowing log takes a chunk (a wet week's night); it is dark by the next morning but one
  const foxTarget = (ray, nr) => {
    if (!live() || !player || !player.onFoot) return null;
    const log = P('s3.birchlog'); if (!log || nr.flat(log.x, log.z) > 3.5 || !sky) return null;
    const H = hours() < 12 ? hours() + 24 : hours(); if (!skyActive(sky.events, H, 'foxfire') || doc().foxTaken === sky.key) return null;
    const hit = nr.sphere(log.x, D.ground(log.x, log.z) + 0.2, log.z, 1.1); if (!hit) return null;
    return [{ dist: hit.t, miss: hit.miss, target: { kind: 'prop', ref: 'story:s3.foxfire', label: 'Foxfire', e: { verb: 'Take', run: () => { doc().foxTaken = sky.key; dirty(); story.rules.apply({ id: '7a:foxfire', then: ['give:item.foxfire'] }, {}); } } } }];
  };
  // a lantern site's party, when the player paddles toward it (60 S3: "Oh, hey. Are you the lights guy?")
  const lanternTick = () => {
    const nb = PL('s3.northbay'); if (!sky || !nb) return;
    const H = hours() < 12 ? hours() + 24 : hours();
    if (skyActive(sky.events, H, 'lantern') && near({ x: nb.x + 30, z: nb.z + 25 }, 60) && doc().lanternSaid !== sky.key) {
      doc().lanternSaid = sky.key; dirty(); const q = ((T('S3.lantern') || '').split('\n')[0].match(/"([^"]+)"/) || [])[1]; if (q) note(`“${q}”`, 5);
    }
  };

  // --- S4: the howl survey -------------------------------------------------------------------------------------------------
  let hw = null, hwSt = null;
  const tonight = () => { const d = dateNow(), h = hours(); return `${d.year}:${h < 12 ? d.doy - 1 : d.doy}`; };
  const stakeTarget = (ray, nr) => {
    if (!live() || !player || !player.onFoot || !has('ep.S4.yes')) return null;
    const out = [];
    for (const S of STATIONS) {
      const s = P(S.prop); if (!s || nr.flat(s.x, s.z) > 3.2) continue;
      const hit = nr.sphere(s.x, D.ground(s.x, s.z) + 0.6, s.z, 0.7); if (!hit) continue;
      const ok = canHowl(hours()) && !hw && episodes.window('S4') && doc()[`howl.${S.id}`] !== tonight();
      out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'prop', ref: `story:${S.prop}`, label: 'Survey stake', e: ok ? { verb: 'Howl', run: () => startHowl({ ...S, x: s.x, z: s.z }) } : null } });
    }
    // Mark: the answer's bearing, wherever you face (the dot shows it only while an answer can be marked)
    if (hw && (hw.phase === 'answer' || hw.phase === 'listen')) out.push({ dist: 30, miss: 0.97, target: { kind: 'water', ref: 'story:s4.answer', label: 'the answer', e: { verb: 'Mark', run: () => markHowl() } } });
    return out;
  };
  const startHowl = (S) => {
    const d = dateNow(); doc()[`howl.${S.id}`] = tonight(); dirty();
    play7a(audio, 'myhowl', null, 1);
    const pack = packAt({ year: d.year, doy: d.doy, seed: `${story.doc.season}`, range: PACK });
    hw = minigames.start('howl', { station: { id: S.id, x: S.x, z: S.z }, pack, month: d.month, seed: `${story.doc.season}:${tonight()}`, hours: hours() });
    hwSt = S;
  };
  const markHowl = () => {
    if (!hw || !camera) return;
    const f = camera.getWorldDirection(new THREE.Vector3()), deg = bearingDeg(f.x, f.z);
    const r = hw.mark(deg); if (!r) return;
    pencil.bearing({ x: hwSt.x, z: hwSt.z, deg, ep: 16 });
    const lines = doc().lines || (doc().lines = {}); lines[hwSt.id] = { x: hwSt.x, z: hwSt.z, deg }; dirty();
    apply([`f:ep.S4.${hwSt.id}`], `mark.${hwSt.id}`);
    if (Object.keys(lines).length >= 3 && !doc().ring) {
      const X = crossing(Object.values(lines));
      if (X) { doc().ring = X; dirty(); try { pencil.ring({ id: 's4.ring', x: X.x, z: X.z, r: Math.min(1500, X.r), label: 'Wolves', by: null }); } catch (e) { console.warn('7a: the ring', e); } }
    }
    hw = null;
  };
  const howlTick = (dt) => {
    if (!hw) return;
    const r = hw.update(dt, { hours: hours() });
    for (const c of hw.cues.splice(0)) {
      const a = (c.deg * Math.PI) / 180, dist = 500, x = hwSt.x + Math.sin(a) * dist, z = hwSt.z - Math.cos(a) * dist, pos = { x, y: D.ground(x, z) + 2, z, at: c.delay || 0 };
      play7a(audio, 'howl', pos, Math.max(0.25, c.loud));
      if (c.pups) play7a(audio, 'yips', { ...pos, at: (c.delay || 0) + 1.2 }, Math.max(0.2, c.loud * 0.8));
      if (!c.echo && !c.delay) {
        if (!doc().answeredSaid) { doc().answeredSaid = true; dirty(); note(T('d95.7a.S4.answered'), 4); setTimeout(() => note(T('d95.7a.S4.howl.hint'), 6), 4500); stampPart('S4.first', 0); }
        // the loons answer them, the night Walt's entry was read at his site (once a save)
        if (doc().loons && !doc().loonsDone && hwSt.id !== 'st1') { doc().loonsDone = true; dirty(); const p = PL('s4.st3'); if (p) play7a(audio, 'loons', { x: p.x - 300, y: D.ground(p.x, p.z) + 1, z: p.z - 200, at: 5 }, 1); }
      }
    }
    if (r && r.done) { if (r.result === 'silent') note(T('d95.7a.S4.silent'), 4); hw = null; }
  };
  // the kill: ravens over it by day; a print of it
  let killG = false;
  const killTick = () => { const k = PL('s4.kill'); const on = !!(k && live() && has('ep.S4.yes') && !dark() && near(k, 900)); if (on || killG) { D.ravens(k ? { x: k.x, y: D.ground(k.x, k.z), z: k.z } : null, on); killG = on; } };
  // the meadow in August: adults in the grass, pups at the alders' edge; too close and it empties
  const wolves = [];
  const meadowTick = () => {
    const m = PL('s4.meadow'), d = dateNow(), dd = doc();
    const on = !!(m && live() && has('ep.S4.yes') && d.month === 8 && !has('ep.S4.moved') && !dd.spooked && near(m, 1500));
    if (!on) { for (const g of wolves) D.hide(g); return; }
    if (!dd.pups) { dd.pups = 4 + (story.hash(`pups:${story.doc.season}:${d.year}`) % 3); dirty(); }
    const n = 3 + dd.pups; while (wolves.length < n) wolves.push(D.creature(wolves.length < 3 ? 'wolf' : 'pup'));
    const tt = performance.now() / 1000;
    wolves.forEach((g, i) => {
      if (i < 3) D.put(g, m.x - 12 + i * 9, m.z + (i % 2) * 6, i * 1.7, { pose: i === 2 ? null : 'lie', t: tt });
      else { const k = i - 3, a = tt * 0.4 + k * 1.3; D.put(g, m.x + 22 + Math.cos(a) * 4 + k * 2.5, m.z - 8 + Math.sin(a * 1.3) * 3, a + Math.PI / 2, { pose: 'tumble', t: tt + k }); }
    });
    if (near(m, 200)) { dd.spooked = true; dirty(); apply(['f:ep.S4.spooked'], 'spooked'); }
  };
  // Kari's report at Leon's counter after her grant ends (helped: a station at least)
  story.on('store:enter', (e) => {
    if (!live() || !e || Number(e.ep) !== 16 || !has('ep.S4.shut') || has('ep.S4.report')) return;
    if (!(has('ep.S4.st1') || has('ep.S4.st2') || has('ep.S4.st3'))) return;
    story.rules.apply({ id: '7a:report', then: ['give:page.karireport', 'f:ep.S4.report'] }, {});
    const leon = has('ep.S4.lyle') ? 'S4.moved.2' : 'S4.kept.2', w = T(leon);
    setTimeout(() => { const ok = npcs && typeof npcs.keeperSays === 'function' && npcs.keeperSays(16, w, 'return'); if (!ok && w) note(`Leon: “${w}”`, 6); if (has('ep.S4.moved') && !has('ep.S4.counted')) note(T('S4.abandoned'), 6); }, 1800);
  });
  // the tracks on the landing's mud at 16 (the teaching)
  const layLandingTracks = () => {
    const L = storeLayout(16), ep = (world.entryPoints || []).find((e) => Number(e.ep) === 16); if (!L || !ep) return;
    const dx = L.centre.x - ep.x, dz = L.centre.z - ep.z, dd = Math.hypot(dx, dz) || 1, ux = dx / dd, uz = dz / dd; // (from the landing up toward the store)
    D.tracks('s4.landing', 'wolf', ep.x + ux * 5 - uz * 3, ep.z + uz * 5 + ux * 3, Math.atan2(-ux, -uz), 10);
    const set = D.trackSets.get('s4.landing'); if (set) set.words = 'wolf';
  };
  // the sand landing at C698 (NB44's "Same site. Same sand."): wolves and pups, in August mornings
  const beachTick = () => {
    const p = PL('s4.st3'), s = P('s4.stake3'); if (!p || !s) return;
    const d = dateNow(), want = live() && has('ep.S4.yes') && d.month === 8 && near(p, 300);
    if (want && !D.trackSets.has('s4.beach')) { D.tracks('s4.beach', 'wolf', s.x + 4, s.z + 2, 0.6, 8); const t2 = D.tracks('s4.beach.pups', 'pup', s.x + 5, s.z + 3.5, 0.9, 10); D.trackSets.get('s4.beach').words = 'pup'; if (t2) t2.words = 'pup'; }
    else if (!want && D.trackSets.has('s4.beach')) { D.dropTracks('s4.beach'); D.dropTracks('s4.beach.pups'); }
  };
  // the dot on tracks: what made them, once Kari has taught it
  const tracksTarget = (ray, nr) => {
    if (!live() || !player || !player.onFoot) return null;
    const out = [];
    for (const [id, set] of D.trackSets) {
      if (nr.flat(set.x, set.z) > 14) continue;
      let best = null;
      for (const q of set.pts) { if (nr.flat(q.x, q.z) > 3.4) continue; const h = nr.sphere(q.x, D.ground(q.x, q.z) + 0.05, q.z, 0.45); if (h && (!best || h.miss < best.miss)) best = h; }
      if (!best) continue;
      out.push({ dist: best.t, miss: best.miss, target: { kind: 'prop', ref: `story:tracks:${id}`, label: trackWords(set), e: { verb: 'Look', run: () => { if (/^s2\./.test(id)) apply(['f:ep.S2.tracks.seen'], 'ridge'); } } } });
    }
    return out;
  };
  if (pointer && typeof pointer.register === 'function') pointer.register((ray, nr) => { const a = stakeTarget(ray, nr) || [], b = foxTarget(ray, nr) || [], c = tracksTarget(ray, nr) || []; const all = [...a, ...b, ...c]; return all.length ? all : null; });

  // --- prints: what a picture holds of these stories; night prints lifted; the frame --------------------------------------
  if (photo && typeof photo.onShot === 'function') photo.onShot(({ rec, eye, dir, camera: cam }) => {
    if (!live() || !rec || !eye || !dir) return;
    const matches = [], byRec = {};
    const add = (recId, m) => { (byRec[recId] || (byRec[recId] = [])).push(m); matches.push(m); };
    const lm = lampMode();
    if (nw) for (const m of nw.subjectsFor({ eye, dir, lamp: lm })) add('S2', m);
    let frame = false;
    if (nw && !doc().frame && nw.frameOk({ eye, dir, lamp: lm, hours: hours() < 12 ? hours() : hours() - 24 })) { frame = true; doc().frame = true; dirty(); add('S2', 's2.frame'); apply(['f:ep.S2.frame'], 'frame'); }
    // the ridge's tracks by day
    if (!dark()) for (const id of ['s2.moose', 's2.bear']) { const set = D.trackSets.get(id); if (set && Math.hypot(set.x - eye.x, set.z - eye.z) < 18) { add('S2', 's2.tracks'); break; } }
    if (sky) { const H = hours() < 12 ? hours() + 24 : hours(), nb = PL('s3.northbay'); for (const m of skySubjects({ eye, dir, events: sky.events, hours: H, lantern: nb ? { x: nb.x + 30, z: nb.z + 25 } : null, one: one ? one.pos() : null })) add('S3', m); }
    const k = PL('s4.kill'); if (k && Math.hypot(k.x - eye.x, k.z - eye.z) < 45) { add('S4', 's4.kill'); apply(['f:ep.S4.kill'], 'kill'); }
    const m = PL('s4.meadow'); if (m && wolves.some((g) => g.visible)) { const dx = m.x + 22 - eye.x, dz = m.z - 8 - eye.z, dd = Math.hypot(dx, dz), c = (dx * dir.x + dz * dir.z) / (dd * Math.hypot(dir.x, dir.z) || 1); if (dd > 150 && dd < 800 && c > Math.cos(0.12)) add('S4', 's4.pups'); }
    const uniq = [...new Set(matches)];
    if (uniq.length && episodes) episodes.print(rec.id, uniq);
    if (frame) rec.caption = `Big Moose Lake, ${monthName(dateNow())}, 2:04 a.m.`;
    if (dark()) develop(rec, frame ? { cam, birches: P('s2.birches') } : null);
  });
  const monthName = (d) => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.month - 1]} ${d.day}`;
  // the night print: lighter than the eye saw (60 §0.4); with the frame, the tall dark shape between the birches
  const develop = (rec, frame) => {
    const url = photo.urls && photo.urls.get(rec.id); if (!url || typeof document === 'undefined') return;
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.filter = 'brightness(2.1) contrast(0.85) saturate(0.7)'; g.drawImage(img, 0, 0); g.filter = 'none';
        if (frame && frame.cam && frame.birches) {
          const v = new THREE.Vector3(frame.birches.x, D.ground(frame.birches.x, frame.birches.z) + 2.6, frame.birches.z).project(frame.cam);
          const aspect = frame.cam.aspect || 16 / 9, cut = Math.min(1, aspect / (16 / 9)); // (the print is the frame's 16:9 middle)
          const px = ((v.x / cut) * 0.5 + 0.5) * c.width, py = (-v.y * 0.5 + 0.5) * c.height, hgt = c.height * 0.3, wid = hgt * 0.32;
          const gr = g.createRadialGradient(px, py, wid * 0.2, px, py, hgt * 0.7);
          gr.addColorStop(0, 'rgba(12,10,9,0.92)'); gr.addColorStop(0.5, 'rgba(12,10,9,0.55)'); gr.addColorStop(1, 'rgba(12,10,9,0)');
          g.save(); g.translate(px, py); g.scale(1, 1); g.fillStyle = gr; g.beginPath(); g.ellipse(0, hgt * 0.1, wid, hgt * 0.5, 0, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.ellipse(wid * 0.18, -hgt * 0.42, wid * 0.42, wid * 0.5, 0.35, 0, Math.PI * 2); g.fill(); g.restore(); // (the top turned, as if looking)
        }
        const out = c.toDataURL('image/jpeg', 0.86);
        photo.urls.set(rec.id, out); if (photo.store && photo.store.put) photo.store.put(rec.id, out); photo.version = (photo.version || 0) + 1;
      } catch (e) { console.warn('7a: the night print', e); }
    };
    img.src = url;
  };

  // --- the tick ------------------------------------------------------------------------------------------------------------
  // (the game's own frame, through the lamp's update, which main.js runs every frame and __game.step runs too: the
  // rigs' stepped frames move the night as the live loop does)
  let slow = 0, warned = false;
  const frame = (dt0) => {
    const dt = Math.min(0.1, Number.isFinite(dt0) ? dt0 : 1 / 60);
    try {
      if (live()) { nightTick(dt); skyTick(dt); howlTick(dt); tieTick(); meadowTick(); }
      D.update(dt);
      slow += dt;
      if (slow > 0.5) { slow = 0; peopleTick(); lensTick(); killTick(); lanternTick(); beachTick(); ridgeKeep(); }
    } catch (e) { if (!warned) { warned = true; console.warn('7a: the tick', e); } }
  };
  // the ridge's tracks stay for the season after the night (built again near it)
  const ridgeKeep = () => { const pl = PL('s2.ridge'); if (pl && doc().ridgeTracks === dateNow().year && near(pl, 300) && !D.trackSets.has('s2.moose') && !nw) layRidgeTracks(); };
  if (lamp && typeof lamp.update === 'function') { const u0 = lamp.update.bind(lamp); lamp.update = (dt) => { u0(dt); frame(dt); }; }
  else { let lastT = performance.now(); const raf = () => { const now = performance.now(); frame((now - lastT) / 1000); lastT = now; requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
  story.on('season', () => { for (const w of Object.keys(PEOPLE)) unstage(w); nw = null; hw = null; tied = null; for (const id of [...D.trackSets.keys()]) D.dropTracks(id); });

  return { draw: D, tracks: { lay: (id, kind, x, z, heading, n, words) => { const s = D.tracks(id, kind, x, z, heading, n); if (s && words) s.words = words; return !!s; }, drop: (id) => D.dropTracks(id), words: (kind) => trackWords({ kind }) },
    debug: { scene: (who) => new SceneRun(topics, PEOPLE[who].scene, { who, args: { ep: PEOPLE[who].ep }, hooks, show: show ? (r, from) => show.choice(who, r, from) : null }), doc, startNight, nw: () => nw, hw: () => hw, sky: () => sky, one: () => one, staged: () => [...staged.keys()], stage, talkTo, startHowl, markHowl, stations: () => STATIONS.map((S) => ({ ...S, at: P(S.prop) })), layRidgeTracks, layLandingTracks, tied: () => tied, tieOff: () => { const s = P('s2.snag'); if (s) tieOff(s); return !!tied; }, lampMode, playBeat } };
}
