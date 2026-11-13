// 7c: the mini-campaigns in the game (docs/build/campaign-design.md §10.3; Part 4 Round 7 7C). connect() is called by
// main.js's 7c block under STORY_ON, after stream E's episodes are attached (the records are already on the runner:
// story-data/episodes/index.js MINIS). With the flag off nothing imports this file.
//
//   connect(t) → { debug }   t: { story, episodes, minigames, layer, topics, texts, T, talk, npcs, scene, photo, tasks,
//                 record, profile, day, player, parties, world, hud, trip, camp, bear, lamp, mist, canoe, partyCamps, guest }
//
//   every mini   its drafted words (text/drafts-7c.json) into talk's table; its counter topics (topics.add); the cycle
//                (minis.js: the k-th record is the year after k winter turns): `year.turned.*` or stream w's year:open
//                judges the windows again and rebinds the year's places
//   M1           the chain's three sign sites as layer places (bearClaw, bearScat, bearBarrel kits; E Look); the bear's
//                nights at the chain's party camps (partyFed) and at yours (bear.js's own log), counted as ep.M1_k.fed.<n>;
//                a chain party's word (party-camps storyHook): its torn pack before you start, your teaching after; the
//                night watch at the first sign site (bearsign): seen, or a picture while it is in: photo; the bear's
//                lake activity up on the chain while the window is open
//   M2           the logbook boxes at the five falls (logBox kit, E Read); fogvoices on Lac La Croix (and the route's lakes
//                once started) at dawn in fog, Jun–Sep, once a day; the keeper's word after the fifth box
//   M3           the year's soloist at the home dock (npcs.extraAt), his talk (the yes, his list, the pictures shown);
//                a print taken on one of his lakes is a shot (episodes.print)
//   M4           Tom (and the year's partner) at the Moose Lake 25 or Farm 31 counter on one day in three, Jun–Oct, his
//                favours as board notices held at once (tasks.makeKind + take), their done → ep.M4_k.done.<n>; stream s's
//                fixed party `tom` on the water: his line as you pass their camp (no second Tom: their FIXED_PARTIES)
//   M5           the route's lakes paddled; skim ice (skimice) when the lake skins over (season.js ice 0.04–0.6 after
//                October); the landing's ice-in → iced
//   M6           the stay's counts from its start (explored lakes, species in the catch log, prints, nights on a trip);
//                half, done, over (30 days); store visits as resupplies
// A co-op guest: nothing moves (live() false), as feed-episodes.js.
import { storeLayout } from './props.js';
import * as PARTIES_M from './parties.js'; // (stream s's FIXED_PARTIES and fixedDay, read if there: the join)
import { storyHook } from './party-camps.js';
import { explored } from './explored.js';
import { seasonAt } from './season.js';
import { isPast } from './edge.js';
import OUT_PLACES from './outfitter-places.json';
import DRAFTS from './story-data/text/drafts-7c.json';
import { MINIS } from './story-data/episodes/index.js';
import { CYCLES, cycleOf, idOf, bearChain, bearHours, SIGNS, partyFed, soloist, rangers, FAVOURS, FAVOUR_EP, freezeRoute, FOG_ROUTE, FOG_LAKE, FOG_HOURS, LONG, LONG_PROJECTS, longStay, pickN, seedOf, hashStr } from './minis.js';
import { bearsign } from './minigames/bearsign.js';
import { fogvoices } from './minigames/fogvoices.js';
import { skimice } from './minigames/skimice.js';

const TICK = 0.5;              // s between polls
const TOM_EPS = [25, 31];      // the counters the ranger crew comes in to
const TOM_NEAR = 45;           // m: passing the fixed party's camp is a meeting (stream s's `tom`)
const SIGN_OFF = 9;            // m inland of a site's fire ring: where its sign lies
const WATCH_R = 45;            // m: the night watch's reach round the first sign site
const LOG_OFF = 7;             // m off a carry's end: the logbook's post

export async function connect(t) {
  const { story, episodes, minigames, layer, topics, texts, talk, npcs, photo, tasks, record, profile, player, parties, world, hud } = t;
  const G = () => (typeof window !== 'undefined' && window.__game) || {};
  const dbg = { fog: false, fogNow: false, bearNow: false, tomEp: null, skim: false, stroke: false }; // (the rig's levers)
  const guest = () => { try { return !!(t.guest && t.guest()) || story.mode === 'mirror'; } catch { return story.mode === 'mirror'; } };
  const live = () => !!(story && story.doc) && !guest();
  if (texts && typeof texts.add === 'function') texts.add(DRAFTS);
  const T = (id) => { try { return t.T ? t.T(id) : null; } catch { return null; } };
  const note = (w, s = 5) => { if (w && hud && typeof hud.note === 'function') hud.note(w, s); };
  const apply = (then, why) => { if (live() && story.rules) story.rules.apply({ id: `7c:${why}`, then }, {}); };
  const has = (k) => story.has(k);
  const cyc = () => cycleOf(story);
  const rec = (base) => episodes.record(idOf(base, cyc()));
  const open = (id) => episodes.started(id) && !episodes.ended(id);
  const absNow = () => story.time().abs;
  const hoursNow = () => story.nowAbs() * 24;
  const dateNow = () => story.date();
  const lakeNameAt = (x, z) => { try { const id = world.lakeIdAt(x, z) || (tasks && tasks.lakeNear ? tasks.lakeNear(x, z, 30) : 0); return id ? world.lakeName(id) : null; } catch { return null; } };
  const lakeIdAt = (x, z) => { try { return world.lakeIdAt(x, z) || (tasks && tasks.lakeNear ? tasks.lakeNear(x, z, 30) : 0) || 0; } catch { return 0; } };
  const st = (id) => episodes.st(id) || {};
  const pos = () => (player ? { x: player.x, z: player.z } : null);

  // the fog sensor (story-cond's `fog` flag): mist.js's amount, unless another stream reads it already
  const mist = t.mist || G().mist;
  if (!story.sensors.has('fog')) story.sensor('fog', () => !!(dbg.fog || (mist && mist.amount > 0.25)));

  // --- lakes by name ------------------------------------------------------------------------------------------------------
  const byName = new Map();
  try { for (const l of world.lakes || []) { if (!l) continue; const n = world.lakeName(l.id); if (!n) continue; if (!byName.has(n)) byName.set(n, []); byName.get(n).push(l.id); } } catch (e) { console.warn('7c: lakes by name', e); }
  const lakeIds = (name) => byName.get(name) || [];
  const sitesOn = (ids) => {
    const S = new Set(ids), out = [];
    (world.campsites || []).forEach((c, i) => { if (c.past) return; const l = parties && parties.siteLake ? parties.siteLake[i] : lakeIdAt(c.x, c.z); if (S.has(l)) out.push(i); });
    return out;
  };
  const inland = (x, z, m) => { try { const d = world.deeperDir(x, z); const l = Math.hypot(d.x, d.z) || 1; return { x: x - (d.x / l) * m, z: z - (d.z / l) * m }; } catch { return { x: x + m, z }; } };

  // --- layer places added at runtime (the year's) ----------------------------------------------------------------------------
  const added = new Set();
  const setAt = (pl, x, z) => { pl.x = x; pl.z = z; for (const pr of pl.props || []) { const a = pr.at || [0, 0]; pr.x = x + a[0]; pr.z = z + a[1]; } };
  const addPlace = (pl) => {
    if (!layer || !layer.byId || layer.byId.has(pl.id)) return;
    pl.r = pl.r || 40; pl.triggers = pl.triggers || []; pl.photo = pl.photo || [];
    setAt(pl, pl.x, pl.z); // (the layer builds a prop at its own x, z)
    layer.list.push(pl); layer.byId.set(pl.id, pl);
    for (const pr of pl.props || []) layer.propIx.set(pr.id, { place: pl, prop: pr });
    layer.bin(pl); added.add(pl.id);
  };
  // a place set from an anchor at the water's edge (a site's ring, a carry's end): moved `off` m inland on dry ground once
  // its tiles are in (the shore's direction is the tiles'), before its props are built
  const refit = () => {
    const tiles = G().tiles; if (!layer || !tiles || typeof tiles.readyAt !== 'function') return;
    for (const id of added) {
      const pl = layer.byId.get(id); if (!pl || pl.fitted || !pl.anchor) continue;
      if (player && Math.hypot(pl.anchor.x - player.x, pl.anchor.z - player.z) > 600) continue;
      if (!tiles.readyAt(pl.anchor.x, pl.anchor.z)) continue;
      let best = null;
      for (const m of [pl.off, pl.off * 0.6, pl.off * 1.5, pl.off * 0.3]) { const q = inland(pl.anchor.x, pl.anchor.z, m); let wet = false; try { wet = world.isWater(q.x, q.z); } catch { wet = false; } if (!wet) { best = q; break; } }
      pl.fitted = true; if (!best) continue;
      const cell = layer.grid.get(layer.cellKey(pl.x, pl.z)); if (cell) { const j = cell.indexOf(pl); if (j >= 0) cell.splice(j, 1); }
      try { layer.dropPlace(id); } catch { /* not built */ }
      setAt(pl, best.x, best.z); layer.bin(pl);
    }
  };
  const dropPlaces = (prefix) => {
    if (!layer || !layer.byId) return;
    for (const id of [...added]) {
      if (!id.startsWith(prefix)) continue;
      try { layer.dropPlace(id); } catch { /* not built */ }
      const pl = layer.byId.get(id); if (!pl) continue;
      layer.byId.delete(id); for (const pr of pl.props || []) layer.propIx.delete(pr.id);
      const i = layer.list.indexOf(pl); if (i >= 0) layer.list.splice(i, 1);
      const cell = layer.grid.get(layer.cellKey(pl.x, pl.z)); if (cell) { const j = cell.indexOf(pl); if (j >= 0) cell.splice(j, 1); }
      added.delete(id);
    }
  };

  // --- counter topics (each record's own, every cycle's: their `when` reads the cycle's facts) ---------------------------------
  const topicList = MINIS.flatMap((r) => r.topics || []);
  if (topics && typeof topics.add === 'function' && topicList.length) topics.add(topicList);
  // (the explicit yes of a choice door: M3's "I'll go.", M4's first favour, are said in their talks below)

  // ========================================================================================================================
  // M1 · the raspberry bear
  // ========================================================================================================================
  let M1 = null; // { id, k, lakes: [ids], names, sites: [i], signs: [{ sign, i, x, z }], watch: { x, z } }
  const bindM1 = () => {
    dropPlaces('m1.');
    const k = cyc(), id = idOf('M1', k), ch = bearChain(k, (n) => lakeIds(n).length > 0);
    const ids = ch.lakes.flatMap(lakeIds), sites = sitesOn(ids);
    if (!sites.length) { M1 = { id, k, lakes: ids, names: ch.lakes, sites: [], signs: [], watch: null }; return; }
    const pickS = pickN(sites, SIGNS.length, seedOf('M1', k), 'signs');
    const signs = SIGNS.map((sign, j) => {
      const i = pickS[j % pickS.length], c = world.campsites[i], f = (c.layout && c.layout.fire) || c;
      return { sign, i, x: f.x, z: f.z, anchor: { x: f.x, z: f.z } };
    });
    for (const s of signs) {
      const pid = `m1.${k}.${s.sign}`, kitName = { claw: 'bearClaw', scat: 'bearScat', barrel: 'bearBarrel' }[s.sign];
      addPlace({ id: pid, name: 'A bear\'s sign', x: s.x, z: s.z, r: 40, kind: 'mini', anchor: s.anchor, off: SIGN_OFF,
        props: [{ id: `${pid}.p`, kit: kitName, at: [0, 0], show: 'true', dot: [{ name: T(`m1.dot.${s.sign}`) || 'Sign', when: 'true' }] }],
        verbs: [{ prop: `${pid}.p`, verb: 'Look', when: `f:ep.${id}.yes & !f:ep.${id}.sign.${s.sign}`, then: [`f:ep.${id}.sign.${s.sign}`] }] });
    }
    M1 = { id, k, lakes: ids, names: ch.lakes, sites, signs, watch: { x: signs[0].x, z: signs[0].z } };
  };
  const onChain = (x, z) => !!(M1 && M1.lakes.includes(lakeIdAt(x, z)));
  const m1Live = () => !!(M1 && live() && episodes.window(M1.id) && !episodes.ended(M1.id));
  // the nights it was fed: written as thresholds (ep.M1_k.fed.<n>), the count kept on the episode's own state
  const fedOnce = (why, mine = false) => {
    if (!m1Live()) return;
    const s = st(M1.id); s.fed = (s.fed || 0) + 1; episodes.dirty();
    apply([`f:ep.${M1.id}.fed.${Math.min(9, s.fed)}`, ...(mine ? [`f:ep.${M1.id}.fedme`] : [])], `m1.fed.${why}`);
  };
  let fedDay = null;
  const m1DayTurn = () => {
    if (!m1Live() || !parties || typeof parties.campsAt !== 'function') return;
    const T0 = absNow(); if (fedDay === T0) return; fedDay = T0;
    const s = st(M1.id); if (s.fedDay === T0) return; s.fedDay = T0;
    // last night's camps on the chain: a seeded one in FED was raided (the party's own torn pack tomorrow)
    let raided = 0;
    try { for (const c of parties.campsAt(T0 - 1, 23)) if (M1.lakes.includes(parties.siteLake ? parties.siteLake[c.i] : 0) && partyFed(c.party.id, T0 - 1, M1.k)) raided++; } catch { raided = 0; }
    for (let n = 0; n < raided; n++) fedOnce('party');
  };
  // your camp raided on the chain (bear.js logs every visit: raid, live, tent)
  const bear = t.bear || G().bear || null;
  if (bear && typeof bear.log === 'function') {
    const log0 = bear.log.bind(bear);
    bear.log = (data) => { const r = log0(data); try { if (data && /raid|live|tent|away/.test(data.how || '') && !(data.scared) && player && onChain(player.x, player.z)) fedOnce('yours', true); } catch { /* */ } return r; };
  }
  // the chain's lakes have a bear on them while it is open (bear.js activityAt: twice the lake's own)
  if (bear && typeof bear.activityAt === 'function') {
    const act0 = bear.activityAt.bind(bear);
    bear.activityAt = (x, z) => { const a = act0(x, z); try { if (m1Live() && onChain(x, z)) return { ...a, k: Math.max(a.k * 2, 2) }; } catch { /* */ } return a; };
  }
  // a chain party's word: their torn pack (before you start, or after a raid), your teaching (started)
  const hook0 = storyHook.line;
  storyHook.line = (party, kind) => {
    const prev = hook0 ? hook0(party, kind) : null; if (prev) return prev;
    if (kind !== 'word' || !m1Live() || !party || !parties) return null;
    let lake = 0; try { const T0 = absNow(), s = (party.stays || []).find((q) => q.start <= T0 && q.end >= T0); lake = s && parties.stayLake ? parties.stayLake(s) : 0; } catch { lake = 0; }
    if (!M1.lakes.includes(lake)) return null;
    const P = `ep.${M1.id}`;
    if (episodes.started(M1.id) && !has(`${P}.taught.${String(party.id).replace(/[^\w]/g, '_')}`) && !has(`${P}.relocate`)) {
      note(T('m1.teach'), 4);
      apply([`f:${P}.taught.${String(party.id).replace(/[^\w]/g, '_')}`], 'm1.teach');
      return T('m1.taught');
    }
    const raided = [1, 2, 3].some((d) => partyFed(party.id, absNow() - d, M1.k));
    return raided || !episodes.started(M1.id) ? T('m1.bark.torn') : null;
  };
  // the keepers' word at 25 and 31 (starts nothing)
  if (npcs && typeof npcs.addPool === 'function') npcs.addPool('word', (c) => {
    if (!m1Live() || ![25, 31].includes(Number(c.ep)) || episodes.started(M1.id)) return null;
    if (story.hash(`m1.rumour:${c.ep}:${Math.floor(absNow() / 2)}`) % 3) return null;
    const w = T('m1.rumour'); return w ? { id: 'm1.rumour', text: w } : null;
  });
  // the night watch
  let watch = null;
  const m1Watch = () => {
    if (!m1Live() || !episodes.started(M1.id) || !M1.watch || !player) return;
    const P = `ep.${M1.id}`;
    if (has(`${P}.seen`) && has(`${P}.photo`)) return;
    { const pl = layer && layer.byId && layer.byId.get(`m1.${M1.k}.${M1.signs[0].sign}`); if (pl) M1.watch = { x: pl.x, z: pl.z }; }
    const d = Math.hypot(player.x - M1.watch.x, player.z - M1.watch.z);
    if (!watch) {
      if (d > WATCH_R || !story.when('dark')) return;
      const [a] = bearHours(M1.k), H = hoursNow(), day0 = Math.floor(H / 24) * 24;
      let hour0 = day0 + a; if (hour0 < H - 3) hour0 += 24; if (a < 12 && H % 24 > 12) hour0 = day0 + 24 + a;
      if (dbg.bearNow) hour0 = H + 0.05;
      watch = minigames.start('bearsign', { site: M1.watch, hour0, r: WATCH_R });
      if (watch) { watch.m1 = M1.id; watch.last = { x: player.x, z: player.z }; }
      return;
    }
    const moved = Math.hypot(player.x - watch.last.x, player.z - watch.last.z) > 0.6 * TICK; watch.last = { x: player.x, z: player.z };
    const lampOn = !!((t.lamp || G().lamp || {}).on);
    const r = watch.update(TICK, { abs: hoursNow(), x: player.x, z: player.z, lamp: lampOn, moving: moved });
    if (watch.phase === 'in' && !watch.said) { watch.said = true; note(T('m1.watch.come'), 6); try { if (bear && typeof bear.nightSounds === 'function') bear.nightSounds('live', M1.watch); } catch { /* */ } }
    if (r) {
      if (r.result === 'seen' || r.result === 'photo') { apply([`f:${P}.seen`, ...(r.result === 'photo' ? [`f:${P}.photo`] : [])], `m1.watch.${r.result}`); note(T('m1.watch.gone'), 5); }
      watch = null;
    }
  };
  minigames.register('bearsign', bearsign);

  // ========================================================================================================================
  // M2 · singing in the fog
  // ========================================================================================================================
  const FOGP = FOG_ROUTE.map((r) => {
    const end = r.ends.find((e) => { try { return !isPast(e[0], e[1]); } catch { return true; } }) || r.ends[0];
    return { ...r, x: end[0], z: end[1] };
  });
  for (const r of FOGP) {
    const pid = `m2.${r.id}`;
    addPlace({ id: pid, name: r.name, x: r.x, z: r.z, r: 40, kind: 'mini', anchor: { x: r.x, z: r.z }, off: LOG_OFF,
      props: [{ id: `${pid}.box`, kit: 'logBox', at: [0, 0], show: 'true', dot: [{ name: T('m2.dot.box') || 'Logbook', when: 'true' }] }],
      verbs: [{ prop: `${pid}.box`, verb: 'Read', when: `!f:ep.M2.log.${r.id}${r.id === 'loon' ? '' : ' & f:ep.M2.yes'}`, then: [`f:ep.M2.log.${r.id}`] }] });
  }
  if (layer && typeof layer.on === 'function') layer.on('use', (e) => {
    if (!e || !live()) return;
    const m = /^m2\.(\w+)$/.exec(e.place || ''); if (m) note(T(`m2.page.log.${m[1]}`), 7);
    const b = /^m1\.\d+\.(\w+)$/.exec(e.place || ''); if (b) note(T(`m1.page.${b[1]}`), 6);
  });
  minigames.register('fogvoices', fogvoices);
  let fog = null, fogDay = null;
  const ROUTE_LAKES = ['Iron Lake', 'Crooked Lake', 'Basswood Lake'];
  const m2Fog = () => {
    if (!live() || !player || episodes.ended('M2')) return;
    if (fog) {
      const r = fog.update(TICK, { x: player.x, z: player.z, fog: story.when('fog') });
      if (fog.near && !fog.saidNear) { fog.saidNear = true; note(T('m2.voices.near'), 5); }
      if (r) {
        if (r.result === 'heard' || r.result === 'close') apply(['f:ep.M2.heard', ...(r.result === 'close' ? ['f:ep.M2.close'] : [])], `m2.${r.result}`);
        note(T('m2.voices.gone'), 5); fog = null;
      }
      return;
    }
    const d = dateNow(), h = d.hours;
    if (!dbg.fogNow && (d.month < 6 || d.month > 9 || h < FOG_HOURS[0] || h > FOG_HOURS[1] || !story.when('fog'))) return;
    if (fogDay === absNow() && !dbg.fogNow) return;
    const lake = lakeNameAt(player.x, player.z);
    if (lake !== FOG_LAKE && !(episodes.started('M2') && ROUTE_LAKES.includes(lake))) return;
    fogDay = absNow(); dbg.fogNow = false;
    fog = minigames.start('fogvoices', { x: player.x, z: player.z, east: { x: 1, z: 0 } });
    if (fog) note(T('m2.voices'), 6);
  };
  // after the fifth box: a keeper's word at the next counter (the brigade passed Grand Portage)
  story.on('store:enter', (e) => {
    if (!live() || !e) return;
    if (has('ep.M2.filled') && !has('ep.M2.told')) {
      const w = T('m2.keeper.passed');
      setTimeout(() => { const ok = npcs && typeof npcs.keeperSays === 'function' && npcs.keeperSays(Number(e.ep), w, 'return'); if (!ok) note(w, 7); apply(['f:ep.M2.told'], 'm2.told'); }, 1600);
    }
    m6Store(e);
  });
  if (npcs && typeof npcs.addPool === 'function') npcs.addPool('word', (c) => {
    if (!live() || ![12, 80].includes(Number(c.ep)) || episodes.started('M2')) return null;
    if (story.hash(`m2.rumour:${c.ep}:${Math.floor(absNow() / 3)}`) % 3) return null;
    const w = T('m2.rumour'); return w ? { id: 'm2.rumour', text: w } : null;
  });

  // ========================================================================================================================
  // M3 · the trip not taken
  // ========================================================================================================================
  let solo = null; // { ep, h, id, S }
  const homeEp = () => { const pr = profile || G().profile; return pr && pr.home ? Number(pr.home) : 25; };
  const soloHere = () => { const r = rec('M3'); return !!(r && live() && episodes.window(r.id) && !episodes.ended(r.id)); };
  const dockSpot = (ep) => { const P = OUT_PLACES[String(ep)], L = storeLayout(ep); if (!P || !P.dockLand) return 'counterEnd'; return { x: P.dockLand[0], z: P.dockLand[1], y: L ? L.floorY - 0.6 : undefined, heading: P.dockHeading || 0 }; };
  const stageSolo = () => {
    const r = rec('M3'); if (!r || !npcs || typeof npcs.extraAt !== 'function') return;
    const ep = homeEp(), S = soloist(cyc());
    const h = npcs.extraAt(ep, { key: `cast:soloist:${r.id}`, name: S.name, role: '', look: S.look, spot: dockSpot(ep), talk: () => (soloTalk() ? true : null) });
    solo = { ep, h, id: r.id, S };
  };
  const unstageSolo = () => { if (!solo) return; try { if (solo.h && solo.h.remove) solo.h.remove(); } catch { /* */ } solo = null; };
  const soloNodes = () => {
    const id = solo.id, P = `ep.${id}`, S = solo.S, bye = { text: 'Goodbye.', kind: 'bye', go: () => null };
    if (!episodes.started(id)) {
      const ask = () => ({ say: T('m3.ask'), choices: [
        { text: T('m3.c.yes'), go: () => { episodes.yes(id, 'choice'); return { say: T(`m3.list.${S.r}`), choices: [bye] }; } },
        { text: T('m3.c.no'), go: () => null },
      ] });
      return { say: T(`m3.hello.${S.s}`), choices: [{ text: '…', go: ask }] };
    }
    if (has(`${P}.all`) && !has(`${P}.back`)) return { say: T('m3.wait'), choices: [{ text: T('m3.c.show'), go: () => { apply([`f:${P}.back`], 'm3.back'); return { say: T('m3.back'), choices: [bye] }; } }, bye] };
    return { say: T('m3.wait'), choices: [bye] };
  };
  function soloTalk() {
    if (!solo || !solo.h || !talk || !live()) return false;
    return talk.open({ speaker: solo.h.speaker, name: solo.S.name, role: '', room: solo.ep, start: () => soloNodes(), bye: () => null });
  }
  // a print: his lakes (M3), the bear at night (M1), the long stay's series (M6 counts prints itself)
  if (photo && typeof photo.onShot === 'function') photo.onShot(({ rec: pr, eye }) => {
    if (!live() || !eye) return;
    if (watch && watch.phase === 'in' && typeof watch.shot === 'function') watch.shot();
    const r = rec('M3'); if (!r || !open(r.id)) return;
    const lake = lakeNameAt(eye.x, eye.z), S = soloist(cyc());
    const hit = S.route.find((q) => q.lake === lake);
    if (!hit || has(`ep.${r.id}.shot.${hit.i}`)) return;
    apply([`f:ep.${r.id}.shot.${hit.i}`], `m3.shot.${hit.i}`);
    if (pr) episodes.print(pr.id, [`m3.${r.id}.${hit.i}`]);
    // a lake of his list the world doesn't name (or names otherwise): counted with the next of his you get (never stuck)
    for (const q of S.route) if (!lakeIds(q.lake).length && !has(`ep.${r.id}.shot.${q.i}`)) apply([`f:ep.${r.id}.shot.${q.i}`], `m3.shot.${q.i}`);
  });

  // ========================================================================================================================
  // M4 · the ranger crew
  // ========================================================================================================================
  let tom = null; // { ep, h, id }
  const tomDay = (T0) => hashStr(`m4:${T0}`) % 3 === 0;
  const tomEpOn = (T0) => TOM_EPS[hashStr(`m4ep:${T0}`) % TOM_EPS.length];
  const tomHere = () => { const r = rec('M4'); if (!r || !live() || !episodes.window(r.id) || episodes.ended(r.id)) return null; const T0 = absNow(), h = dateNow().hours; return (dbg.tomEp || ((tomDay(T0) && h >= 8 && h < 17) ? tomEpOn(T0) : null)); };
  const stageTom = (ep) => {
    const r = rec('M4'); if (!r || !npcs || typeof npcs.extraAt !== 'function') return;
    const h = npcs.extraAt(ep, { key: `cast:tom:${r.id}`, name: has(`ep.${r.id}.met.2`) ? 'Tom' : 'A ranger', role: 'Forest Service', look: { age: 'adult', shirt: 0x8a8a5a, pants: 0x3a4a2e, hat: 0x6a6a4a, hair: 0x5a4030 }, talk: () => (tomTalk() ? true : null) });
    tom = { ep, h, id: r.id };
  };
  const unstageTom = () => { if (!tom) return; try { if (tom.h && tom.h.remove) tom.h.remove(); } catch { /* */ } tom = null; };
  const favourN = (id) => [1, 2, 3, 4].filter((n) => has(`ep.${id}.favour.${n}`)).length;
  const openFavour = (id) => [1, 2, 3, 4].some((n) => has(`ep.${id}.favour.${n}`) && !has(`ep.${id}.done.${n}`));
  async function giveFavour(id, n) {
    const kind = FAVOURS[n - 1];
    let tk = null;
    // (the board's bands: local, medium, far; Lake One's landing first, then the counter he is at, near first)
    const here = tom ? tom.ep : 25;
    for (const [ep, band] of [[FAVOUR_EP, 'local'], [here, 'local'], [FAVOUR_EP, 'medium'], [here, 'medium'], [FAVOUR_EP, 'far'], [here, 'far']]) {
      if (tk || !tasks || typeof tasks.makeKind !== 'function') break;
      try { tk = await tasks.makeKind(kind, ep, band); } catch (e) { console.warn('7c: a favour', kind, ep, band, e); tk = null; }
    }
    if (tk && tasks.take(tk.id)) { const s = st(id); (s.fav || (s.fav = {}))[tk.id] = n; episodes.dirty(); }
    else apply([`f:ep.${id}.done.${n}`], `m4.nofavour.${n}`); // (no notice could be written there: the favour is done as asked, never stuck)
    if (tasks && tasks.changed) tasks.changed();
  }
  const tomNodes = () => {
    const id = tom.id, P = `ep.${id}`, R = rangers(cyc()), bye = { text: 'Goodbye.', kind: 'bye', go: () => null };
    const n = favourN(id), m = dateNow().month;
    const hello = T(n === 0 ? '70.7.2.22' : '70.7.2.23') || '…';
    if (openFavour(id)) return { say: T('m4.busy'), choices: [bye] };
    const offer = (k, extra = []) => ({ say: T(`m4.ask.${k}`), choices: [
      { text: T('m4.c.yes'), go: () => { if (k === 1) episodes.yes(id, 'choice'); apply([`f:${P}.met.${Math.min(3, k)}`, `f:${P}.favour.${k}`, ...(k === 4 ? [`f:${P}.last`] : []), ...extra], `m4.favour.${k}`); giveFavour(id, k); return k === 2 ? { say: T(`m4.name.${R.p}`), choices: [bye] } : null; } },
      { text: T('m4.c.no'), go: () => null },
    ] });
    if (n < 3 && m <= 9) return { say: hello, choices: [{ text: '…', go: () => offer(n + 1) }] };
    if (n === 3 && has(`${P}.three`) && m >= 10) return { say: hello, choices: [{ text: '…', go: () => offer(4) }] };
    // j1: one Tom (stream s's S8 Tom Becker and this crew's): with no favour to ask, the talk is s's own scene (TOM)
    const sides = window.__game && window.__game.storySides;
    if (sides && typeof sides.tomTalkAt === 'function' && tom && tom.h) return { say: hello, choices: [{ text: '…', go: () => { const h = tom.h; setTimeout(() => { try { sides.tomTalkAt({ speaker: h.speaker, name: has(`ep.${tom.id}.met.2`) ? 'Tom' : 'A ranger', talking: false }); } catch (e) { console.warn('j1: Tom', e); } }, 0); return null; } }, bye] };
    return { say: hello, choices: [bye] };
  };
  function tomTalk() {
    if (!tom || !tom.h || !talk || !live()) return false;
    return talk.open({ speaker: tom.h.speaker, name: has(`ep.${tom.id}.met.2`) ? 'Tom' : 'A ranger', role: 'Forest Service', room: tom.ep, start: () => tomNodes(), bye: () => null });
  }
  if (tasks && typeof tasks.on === 'function') tasks.on('done', (tk) => {
    if (!live() || !tk) return;
    for (let k = 0; k < CYCLES; k++) { const id = idOf('M4', k), f = (st(id).fav || {})[tk.id]; if (f) apply([`f:ep.${id}.done.${f}`], `m4.done.${f}`); }
  });
  // stream s's fixed party `tom` on the water: passing their camp, his line (no second Tom)
  let tomPassed = null;
  const m4Water = () => {
    const r = rec('M4'); if (!r || !live() || !episodes.window(r.id) || !parties || !player || typeof parties.campsAt !== 'function') return;
    const T0 = absNow(); if (tomPassed === T0) return;
    let near = null;
    try { near = parties.campsAt(T0, dateNow().hours).find((c) => (c.party.fixed === 'tom' || /^fixed-tom-/.test(String(c.party.id))) && Math.hypot(c.site.x - player.x, c.site.z - player.z) < TOM_NEAR); } catch { near = null; }
    // by day the crew is about the day's site (stream s: fixedDay(entry, abs) → the site index), not in camp
    if (!near && typeof PARTIES_M.fixedDay === 'function' && Array.isArray(PARTIES_M.FIXED_PARTIES)) {
      try { const e = PARTIES_M.FIXED_PARTIES.find((q) => q.id === 'tom'), i = e ? PARTIES_M.fixedDay(e, T0) : -1, c = i >= 0 ? world.campsites[i] : null; if (c && Math.hypot(c.x - player.x, c.z - player.z) < TOM_NEAR * 3) near = { site: c }; } catch { near = null; }
    }
    if (!near) return;
    tomPassed = T0; note(`Tom: “${T(episodes.started(r.id) ? '70.7.2.23' : '70.7.2.22')}”`, 5);
  };

  // ========================================================================================================================
  // M5 · the freeze-up run
  // ========================================================================================================================
  minigames.register('skimice', skimice);
  let skim = null, skimLake = null;
  const m5Tick = () => {
    const r = rec('M5'); if (!r || !live() || !open(r.id) || !player) return;
    const P = `ep.${r.id}`, R = freezeRoute(cyc()), lake = lakeNameAt(player.x, player.z), i = R.lakes.indexOf(lake);
    if (i >= 0 && !has(`${P}.lake.${i}`)) apply([`f:${P}.lake.${i}`], `m5.lake.${i}`);
    // a route lake the world doesn't name: counted with the next one paddled (never stuck)
    if (i >= 0) R.lakes.forEach((n, j) => { if (!lakeIds(n).length && !has(`${P}.lake.${j}`)) apply([`f:${P}.lake.${j}`], `m5.lake.${j}`); });
    // skim ice: the lake skinning over (season.js), in the canoe on a route lake
    const d = dateNow(), ice = dbg.skim ? 0.3 : seasonAt(d.doy).ice, inCanoe = player.mode === 'canoe' || player.mode === 'paddle' || (G().canoe && G().canoe.occupied);
    if (!skim && i >= 0 && d.month >= 10 && ice > 0.04 && ice < 0.6 && (inCanoe || dbg.skim) && skimLake !== `${lake}:${absNow()}`) {
      skimLake = `${lake}:${absNow()}`;
      skim = minigames.start('skimice', {}); if (skim) { skim.last = { x: player.x, z: player.z }; if (!has(`${P}.skim`)) note(T('m5.skim'), 5); }
    }
    if (skim) {
      const moved = Math.hypot(player.x - skim.last.x, player.z - skim.last.z); skim.last = { x: player.x, z: player.z };
      const res = skim.update(TICK, { stroke: dbg.stroke || moved > 0.4, out: i < 0 });
      if (res) { if (res.result === 'through') { apply([`f:${P}.skim`], 'm5.skim'); note(T('m5.skim.through'), 4); } skim = null; }
    }
  };
  const m5DayTurn = () => {
    const r = rec('M5'); if (!r || !live() || !episodes.started(r.id) || episodes.ended(r.id)) return;
    const d = dateNow(); if (d.month >= 11 && seasonAt(d.doy).ice >= 0.9) apply([`f:ep.${r.id}.iced`], 'm5.iced');
  };

  // ========================================================================================================================
  // M6 · the long stay
  // ========================================================================================================================
  const nowYMD = () => { const d = dateNow(); return { year: d.year, doy: d.doy, hours: d.hours }; };
  const longCounts = (from) => {
    const R = record || G().record;
    let species = 0, photos = 0;
    try { species = R && from ? R.fishOf(from, null).sp.length : 0; } catch { species = 0; }
    try { photos = R && from ? R.printsIn(from, null).length : 0; } catch { photos = 0; }
    return { lakes: explored && explored.lakes ? explored.lakes.count : 0, species, photos };
  };
  const m6Start = () => {
    const s = st('M6'); if (s.long) return;
    const P = LONG_PROJECTS.find((p) => has(`ep.M6.p.${p.id}`));
    s.long = { project: P ? P.id : 'nights', from: nowYMD(), abs: absNow(), base: { lakes: explored && explored.lakes ? explored.lakes.count : 0, species: 0, photos: 0, nights: 0 }, nights: 0, last: absNow() };
    episodes.dirty();
  };
  const m6DayTurn = () => {
    if (!live() || !open('M6')) return;
    m6Start();
    const s = st('M6'), L = s.long, T0 = absNow();
    const tr = t.trip || G().trip;
    if (T0 > L.last) { if (tr && tr.active) L.nights += T0 - L.last; L.last = T0; episodes.dirty(); }
    const c = longCounts(L.from), now = { lakes: c.lakes, species: c.species, photos: c.photos, nights: L.nights };
    const base = { ...L.base, species: 0, photos: 0, nights: 0 };
    const p = longStay(L.project, base, now);
    if (p.got * 2 >= p.n) apply(['f:ep.M6.half'], 'm6.half');
    if (p.done && T0 - L.abs <= LONG.days) apply(['f:ep.M6.done'], 'm6.done');
    if (T0 - L.abs >= LONG.days) apply(['f:ep.M6.over'], 'm6.over');
    L.got = p.got; L.n = p.n;
  };
  function m6Store() {
    if (!live() || !open('M6')) return;
    const s = st('M6'); if (!s.long) return;
    const T0 = absNow(); if (s.long.lastStore === T0) return; s.long.lastStore = T0;
    const k = (s.long.stores = (s.long.stores || 0) + 1); episodes.dirty();
    if (k <= LONG.resupplies + 1) apply([`f:ep.M6.resupply.${Math.min(2, k)}`], `m6.resupply.${k}`);
  }
  story.on('fact', ({ key } = {}) => { if (/^ep\.M6\.yes$/.test(key || '')) m6Start(); });

  // ========================================================================================================================
  // the cycle: a winter turn (stream w: year.turned.<y>, year:open) judges the windows again and rebinds the year
  // ========================================================================================================================
  let lastCycle = cyc();
  const turned = () => {
    const k = cyc(); if (k === lastCycle) return;
    lastCycle = k; unstageSolo(); unstageTom(); watch = null; skim = null; fedDay = null;
    bindM1(); episodes.dayTurn(true);
  };
  story.on('fact', ({ key } = {}) => { if (/^year\.turned\./.test(key || '')) turned(); });
  story.on('year:open', () => turned());

  // --- the poll ------------------------------------------------------------------------------------------------------------
  let lastDay = null;
  const poll = () => {
    if (!live()) return;
    const T0 = absNow();
    if (T0 !== lastDay) { lastDay = T0; m1DayTurn(); m5DayTurn(); m6DayTurn(); }
    // the soloist at the home dock, Tom at a counter: staged near their store, while their window is open
    const near = (ep) => { const L = storeLayout(ep); return !!(L && player && Math.hypot(L.centre.x - player.x, L.centre.z - player.z) < 120); };
    if (soloHere() && near(homeEp())) { if (!solo || solo.id !== (rec('M3') || {}).id) { unstageSolo(); stageSolo(); } } else if (solo && !(talk && talk.convo && talk.convo.speaker && /^cast:soloist/.test(talk.convo.speaker.key || ''))) unstageSolo();
    const te = tomHere();
    if (te && near(te)) { if (!tom || tom.ep !== te) { unstageTom(); stageTom(te); } } else if (tom && !(talk && talk.convo && talk.convo.speaker && /^cast:tom/.test(talk.convo.speaker.key || ''))) unstageTom();
    refit(); m1Watch(); m2Fog(); m4Water(); m5Tick();
  };
  bindM1();
  const timer = setInterval(() => { try { poll(); } catch (e) { if (!timer.warned) { timer.warned = true; console.warn('7c: the minis\' poll', e); } } }, TICK * 1000);
  story.on('season', () => { unstageSolo(); unstageTom(); watch = null; fog = null; skim = null; bindM1(); });

  const debug = {
    dbg, poll, bindM1, refit, M1: () => M1, FOGP, cycle: cyc, rec: (b) => (rec(b) || {}).id || null,
    stageSolo: () => { unstageSolo(); stageSolo(); return !!solo; }, soloTalk, solo: () => solo, soloNodes: () => (solo ? soloNodes() : null), tomNodes: () => (tom ? tomNodes() : null),
    stageTom: (ep = 25) => { dbg.tomEp = ep; unstageTom(); stageTom(ep); return !!tom; }, tomTalk, tom: () => tom,
    watch: () => watch, fog: () => fog, skim: () => skim, m6: () => st('M6').long || null,
    turned, dayTurn: () => { lastDay = null; poll(); },
  };
  return { debug, tomAt: () => (tom ? tom.ep : null) }; // j1: where 7c's Tom stands today (s's steps Tom yields to him)
}
