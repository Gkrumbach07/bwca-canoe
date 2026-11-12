// The episodes in the game (Round 2 stream E; docs/build/campaign-design.md §10, Part 4 Round 2 steps 12–14): the feed's
// adapter (story-feed.js: the camera's prints against the episodes' photo targets, the day turn) and connect(), which
// main.js's e: block calls under STORY_ON with the game's pieces. With the flag off nothing imports this file.
//
//   adapter 'episodes'   photo { id, matches, place, print }   a print that fits an episode's target (its matches kept on
//                        the print, episodes.print); the day turn reaches the runner through the story's clock
//   connect(t) → { episodes, minigames, show, stories }   t: { story, layer, topics, texts, talk, npcs, scene, fishing,
//                        photo, inventory, kit, journal, hud, record, tasks, profile, day, pointer, player, outfitter,
//                        parties, wind, world, guest }
//     · the sensors window:<lilac | episode id> and wind
//     · the runner (episodes.js) with every record, the minigames (the snag), show.js's wants, the Stories side
//     · the flyers on the boards (tasks.flyerHook, props.setStoreFlyers): outside the count, no deadline, never paid
//     · S9: fishing.snags (the pot's bail on the bed off Alice's beach rock), the pot into the hand (give:item.*), Gus's
//       line at Moose Lake 25 the first time you come in with it (S9.conv.1–2), the rumour in the keepers' word, the
//       family's kid at C1690 (and the family at C593 on some June days: parties.pinnedFn)
//     · S7: Rose at her table by Moose Lake 25's window on Tuesdays (the stub table until A2's café kit), her scene
//       (S7.conv), "Look at this" with a print of the lilacs at the old camp, the swim off the rock
//     · June's pot's coffee: two cups (kit.brew), nothing said
//     · the stubs the join swaps: PAY_STUB (D's pay: handler), roseTable (A2's café kit)
// A co-op guest (story.mode 'mirror' or guest()): none of it moves: no flyers, no snag, no Rose's scene, no Stories side.
import * as THREE from 'three';
import { feed } from './story-feed.js';
import { episodes } from './episodes.js';
import { minigames } from './minigames.js';
import { snag, overTarget, passes, snagTarget } from './minigames/snag.js';
import { show } from './show.js';
import { installStories } from './stories.js';
import { lilacBloom } from './season.js';
import { EPISODES } from './story-data/episodes/index.js';
import { storeLayout, storeLayouts, setStoreFlyers, setStoreNotices } from './props.js';
import { propMaterial } from './prop-kit.js';
import { kit as propKit, rngFor } from './story-props.js';
import { itemDef } from './items.js';

export const PAY_STUB = true;   // (the join: D's pay: handler takes `pay:<n>@<id>`; until it is there, paid at once)
const ROSE_NEAR = 90;           // m: Rose is seated while you are this near Moose Lake 25's store
const KID_NEAR = 45;            // m: the family's kid speaks up as you come this near their site
const SWIM_R = 7;               // m: a swim this near the flat rock is a swim off it
const ROSE_SCENE = {
  id: 'rose', who: 'rose',
  nodes: {
    open: { say: ['S7.conv.1'], then: ['f:ep.S7.rose'], go: [
      { ask: 'S7.conv.c1', once: 'whose', say: ['S7.conv.2', 'S7.conv.3'] },
      { ask: 'S7.conv.c2', once: 'where', to: 'lilacs' },
    ] },
    // "Where are the lilacs?": a ring on the Inlet Bay shore (the pencil inks Mummo's if it is pencilled: leads-act1 INK)
    lilacs: { say: ['S7.conv.4'], then: ['f:ep.S7.asked', 'ring:s7.inletbay@Rose'], go: [{ ask: 'S7.conv.c3', once: 'boys', say: ['S7.conv.5'], to: 'other' }], hub: 'open' },
    other: { go: [{ ask: 'S7.conv.c4', once: 'other', say: ['S7.conv.6'] }], hub: 'open' },
  },
};

let A = null;
export function episodesAdapter(api) { A = api; return () => { A = null; }; }
feed.register('episodes', episodesAdapter);

export async function connect(t) {
  const { story, layer, topics, texts, talk, npcs, scene, fishing, photo, inventory, kit, journal, hud, record, tasks, profile, day, pointer, player, parties, wind, world } = t;
  const guest = () => { try { return !!(t.guest && t.guest()) || story.mode === 'mirror'; } catch { return story.mode === 'mirror'; } };
  const live = () => !!(story && story.doc) && !guest();
  // the words: the side stories' extract (side.json), through topics.js's T
  if (t.loadWords) { const W = await t.loadWords(['side']); if (W.side) texts.add(W.side); }
  const T = (id) => (topics && t.T ? t.T(id) : null);
  const note = (w, s = 5) => { if (w && hud && typeof hud.note === 'function') hud.note(w, s); };
  const apply = (then, why) => { if (live()) story.rules.apply({ id: `e:${why}`, then }, {}); };

  // --- the sensors -------------------------------------------------------------------------------------------------------
  story.sensor('window', (arg) => {
    if (arg === 'lilac') { const d = story.date(); return lilacBloom(d.year, (story.doc && story.doc.season) || '').open(d.doy); }
    return episodes.window(String(arg));
  });
  if (!story.sensors.has('wind') && wind) story.sensor('wind', () => wind.speed);

  // --- the runner, the minigames, show, the Stories side ------------------------------------------------------------------
  for (const r of EPISODES) episodes.register(r);
  episodes.attach({ story, record, hud, layer, text: T, guest });
  minigames.attach({ story, held: () => episodes.held(), guest });
  minigames.register('snag', snag);
  show.attach({ story, photo, inventory, text: T, episodes, itemName: (id) => (itemDef(id) || {}).name || id, talkTo: (who, o) => talkTo(who, o) });
  for (const E of EPISODES) for (const w of E.wants || []) show.want({ ...w, id: `${E.id}:${w.who}:${w.print || w.item}` });
  const stories = journal ? installStories({ journal, episodes, photo, story }) : null;

  // --- D's pay: (the stub until the join) and the give:item.* handler -----------------------------------------------------
  if (PAY_STUB && !story.actions.has('pay')) {
    story.handle('pay', (arg) => {
      const [n] = String(arg).split('@'), v = Number(n);
      if (!(v > 0) || !profile || typeof profile.earn !== 'function') return false;
      profile.earn(v, 'story'); note(`+$${v}`, 3); return true;
    });
  }
  const give0 = story.actions.get('give');
  story.handle('give', (arg, meta, s) => {
    const m = /^item\.(.+)$/.exec(String(arg));
    if (!m) return give0 ? give0(arg, meta, s) : false;
    if (!inventory || !itemDef(m[1])) return false;
    let r = typeof inventory.toHandNew === 'function' ? inventory.toHandNew(m[1]) : null;
    if (!(r && r.ok) && typeof inventory.place === 'function') r = inventory.place(m[1], 1, {}); // (both hands full: into a pack with you, as a kept fish goes)
    if (!(r && r.ok) && typeof inventory.place === 'function') r = inventory.place(m[1], 1, { crate: true });
    return !!(r && r.ok);
  });

  // --- the flyers on the boards ---------------------------------------------------------------------------------------------
  if (tasks) tasks.flyerHook = { flyers: (ep) => (live() ? episodes.flyers(ep) : []), take: (id) => { const ok = live() && episodes.take(id); if (ok) redraw(); return ok; } };
  setStoreFlyers((ep) => (live() ? episodes.flyers(ep) : []));
  const redraw = () => { for (const L of storeLayouts()) if (tasks && tasks.boards && tasks.boards[L.ep]) setStoreNotices(L.ep, tasks.board(L.ep)); if (tasks && tasks.boardChanged) tasks.boardChanged(); };
  episodes.on('flyers', redraw); episodes.on('window', redraw);
  redraw();

  // --- the camera: a print against the episodes' targets (the layer's props) -------------------------------------------------
  const deg = (r) => (r * 180) / Math.PI;
  if (photo && typeof photo.onShot === 'function') photo.onShot(({ rec, eye, dir }) => {
    if (!live() || !rec || !eye || !dir) return;
    const matches = [];
    for (const E of EPISODES) for (const P of E.photo || []) {
      if (P.when && !story.when(P.when)) continue;
      const hit = (P.props || []).some((id) => {
        const q = layer && layer.prop(id); if (!q || !Number.isFinite(q.prop.x)) return false;
        const dx = q.prop.x - eye.x, dz = q.prop.z - eye.z, d = Math.hypot(dx, dz); if (d > (P.d || 60) || d < 0.5) return false;
        const off = Math.abs(deg(Math.atan2(dx, dz) - Math.atan2(dir.x, dir.z)));
        return Math.min(off, 360 - off) <= (P.deg || 20);
      });
      if (hit) matches.push(P.id);
    }
    if (!matches.length) return;
    episodes.print(rec.id, matches);
    if (A) A.emit('photo', { id: matches[0], matches, place: null, print: rec.id });
  });

  // --- S9: the snag on the pot's bail -------------------------------------------------------------------------------------
  const S9 = EPISODES.find((e) => e.id === 'S9');
  let potT = null;
  const potTarget = () => {
    if (!S9 || !S9.snag || !live() || episodes.held() || !episodes.window('S9') || story.has('ep.S9.pot')) return null;
    const q = layer && layer.prop(S9.snag.prop); if (!q || !Number.isFinite(q.prop.x)) return null;
    if (!potT || potT.x !== q.prop.x) potT = snagTarget({ id: S9.snag.prop, x: q.prop.x, z: q.prop.z, r: S9.snag.r, chance: S9.snag.chance });
    return potT;
  };
  if (fishing) fishing.snags = {
    targets: () => { const p = potTarget(); return p ? [p] : []; },
    over: (T2, l, def) => overTarget(T2, l, def),
    passes: (T2, seed) => passes(T2, `${story.doc && story.doc.season}:${seed}`),
    start: (T2, o) => { const h = minigames.start('snag', { target: T2, ...o }); if (h) kidSays('S9.kid.2'); return h; },
    landed: () => { kidSays('S9.kid.3.1'); return T('S9.pot.dot'); },
    snapped: () => {},
  };
  // Gus, the first time you walk into Moose Lake 25 with it (S9.conv.1–2)
  story.on('store:enter', (e) => {
    if (!live() || !e || Number(e.ep) !== 25 || !story.has('ep.S9.pot') || story.has('ep.S9.gus')) return;
    if (!inventory || !(inventory.count('junespot', { reachable: true }) > 0)) return;
    apply(['f:ep.S9.gus'], 'gus');
    const said = [T('S9.conv.1'), T('S9.conv.2')].filter(Boolean);
    let k = 0; const next = () => { if (k >= said.length) return; const w = said[k++]; const ok = npcs && typeof npcs.keeperSays === 'function' && npcs.keeperSays(25, w, 'return'); if (!ok) note(`Gus: “${w}”`, 6); setTimeout(next, 3800); };
    setTimeout(next, 1800);
  });
  // the rumour: a keeper's word at Moose Lake 25 or Lake One (S9.rumour); starts nothing
  if (npcs && typeof npcs.addPool === 'function') npcs.addPool('word', (c) => {
    if (!live() || !S9 || !S9.region.eps.includes(Number(c.ep)) || story.has('ep.S9.yes')) return null;
    const t0 = story.time(); if (story.hash(`S9.rumour:${c.ep}:${Math.floor(t0.abs / 3)}`) % 3) return null;
    const w = T('S9.rumour'); return w ? { id: 'S9.rumour', text: w } : null;
  });

  // --- the families at C1690 and C593 (parties.pinnedFn) and the kid's words ------------------------------------------------
  const siteNear = (x, z, r = 160) => { let best = -1, bd = r; (world.campsites || []).forEach((c, i) => { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = i; } }); return best; };
  const FAMS = [{ at: [-237.4, 15082.4], months: [6, 8], n: 3, salt: 'c1690' }, { at: [-17635, 3577], months: [6, 6], n: 2, salt: 'c593' }].map((f) => ({ ...f, i: siteNear(f.at[0], f.at[1]) })).filter((f) => f.i >= 0);
  const famOn = (f, T2) => { const d = new Date(T2 * 86400000), m = d.getUTCMonth() + 1; return m >= f.months[0] && m <= f.months[1] && story.hash(`${f.salt}:${story.doc && story.doc.season}:${T2}`) % f.n === 0; };
  const famCache = new Map();
  const family = (f, T2) => {
    const k = `${f.salt}:${T2}`; if (famCache.has(k)) return famCache.get(k);
    const id = `story-${f.salt}-${T2}`;
    const party = { id, holder: `party:${id}`, ep: 25, day: T2, slot: 99, kind: 'family', size: 3, members: [{ female: true, age: 'adult' }, { female: false, age: 'kid' }, { female: true, age: 'kid' }], canoes: 1, tents: 1, nights: 1, stays: [], putIn: 9, look: (story.hash(id) % 1000) / 1000, story: true };
    const stay = { id: `${id}/0`, party, basin: -1, start: T2, end: T2 + 1, land: 14.5, leave: 9.5, in: null, out: null, seed: story.hash(id), oi: 0, viaIn: [] };
    party.stays = [stay]; party.exit = T2 + 1; party.viaOut = [];
    const v = { stay, party, i: f.i }; famCache.set(k, v); if (famCache.size > 40) famCache.delete(famCache.keys().next().value);
    return v;
  };
  if (parties) parties.pinnedFn = (T2) => (live() ? FAMS.flatMap((f) => [T2 - 1, T2].filter((d) => famOn(f, d)).map((d) => family(f, d))) : []);
  const famHere = (salt) => { if (!parties) return false; const f = FAMS.find((q) => q.salt === salt); if (!f) return false; const t0 = story.time(); return parties.campsAt(t0.abs, t0.hours || 0).some((c) => c.i === f.i && (c.party.kind === 'family')); };
  const kidSays = (id) => { if (!live() || !famHere('c1690')) return; const w = T(id); if (w) note(`Kid: “${w}”`, 5); };
  let kidNear = false, kid593 = new Set();
  const famTick = () => {
    if (!live() || !player) return;
    const pot = layer && layer.prop('s9.rock'), d = pot ? Math.hypot(pot.prop.x - player.x, pot.prop.z - player.z) : Infinity;
    if (d < KID_NEAR && !kidNear) { kidNear = true; if (!story.has('ep.S9.pot')) kidSays('S9.kid.1'); } else if (d > KID_NEAR + 40) kidNear = false;
    // the kid at C593 (60 S7 The set piece): the bed in the woods, then at the swimming rock
    if (famHere('c593')) for (const [prop, lines] of [['s7.bed', ['S7.the-set-piece.1', 'S7.the-set-piece.2', 'S7.the-set-piece.3']], ['s7.rock', ['S7.the-set-piece.4']]]) {
      const q = layer && layer.prop(prop); if (!q || kid593.has(prop)) continue;
      if (Math.hypot(q.prop.x - player.x, q.prop.z - player.z) < 12) { kid593.add(prop); lines.forEach((id, k) => setTimeout(() => { const w = T(id); const who = (SIDE_WHO[id] || 'Kid'); if (w) note(`${who}: “${w}”`, 5); }, k * 3200)); }
    }
  };
  const SIDE_WHO = { 'S7.the-set-piece.2': 'Parent' };

  // --- S7: Rose at her table by the window (the stub table until A2's café kit) -----------------------------------------
  const S7 = EPISODES.find((e) => e.id === 'S7');
  let rose = null;
  const roseSpot = (L) => {
    const A2 = L.axes.a, B = L.axes.b, c = L.centre, iW = L.size.iW, iD = L.size.iD;
    const doorA = (L.door.x - c.x) * A2.x + (L.door.z - c.z) * A2.z, a = -(Math.sign(doorA) || 1) * iW * 0.55, b = iD - 0.8;
    const x = c.x + A2.x * a + B.x * b, z = c.z + A2.z * a + B.z * b;
    return { table: { x, z, rot: Math.atan2(B.x, B.z) }, seat: { x: x + B.x * 0.6, z: z + B.z * 0.6, y: L.floorY, heading: Math.atan2(B.z, -B.x) } };
  };
  const roseHere = () => !!(S7 && live() && !episodes.held() && episodes.window('S7') && story.when(S7.rose.when));
  const unstageRose = () => {
    if (!rose) return;
    try { if (rose.h && rose.h.remove) rose.h.remove(); } catch { /* */ }
    if (rose.mesh) { if (rose.mesh.parent) rose.mesh.parent.remove(rose.mesh); rose.mesh.geometry.dispose(); }
    rose = null;
  };
  const stageRose = (L) => {
    const sp = roseSpot(L), k = propKit('roseTable').build({ rng: rngFor('rose.table') });
    const mesh = new THREE.Mesh(k.geo, propMaterial());
    mesh.name = 'story rose.table'; mesh.position.set(sp.table.x, L.floorY, sp.table.z); mesh.rotation.y = sp.table.rot; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.updateMatrixWorld(true);
    if (scene) scene.add(mesh);
    const h = npcs && typeof npcs.extraAt === 'function' ? npcs.extraAt(25, { key: 'cast:rose:25', name: story.has('ep.S7.rose') ? 'Rose' : 'Rose G.', role: '', look: { age: 'old', shirt: 0x6a4c6e, pants: 0x3a3a40, hat: null, hair: 0xd8d4cc, female: true }, spot: sp.seat, talk: () => (roseTalk() ? true : null) }) : null;
    rose = { h, mesh, at: sp };
  };
  const roseTick = () => {
    const L = storeLayout(25);
    const near = L && player && Math.hypot(L.centre.x - player.x, L.centre.z - player.z) < ROSE_NEAR;
    if (near && roseHere()) { if (!rose) stageRose(L); } else if (rose && !(talk && talk.convo && talk.convo.speaker && talk.convo.speaker.key === 'cast:rose:25')) unstageRose();
  };
  const SR = t.SceneRun;
  function roseTalk(o = {}) {
    if (!rose || !rose.h || !talk || !SR || !live()) return false;
    const run = new SR(topics, ROSE_SCENE, { who: 'rose', args: { ep: 25 }, mark: npcs && npcs.mark ? (w) => npcs.mark(w) : null, show: (r, from) => show.choice('rose', r, from) });
    story.meet('rose', 'e');
    const plain = () => ({ say: T('S7.conv.10') || '…', choices: [{ text: 'Goodbye.', kind: 'bye', go: () => null }] }); // (before the notice is taken: her close, and nothing starts)
    const start = () => {
      if (o.give) return show.answer(o.give, { kind: 'item', id: o.give.item }, () => run.choices('open'));
      return episodes.started('S7') ? run.node('open') : plain();
    };
    return talk.open({ speaker: rose.h.speaker, name: story.has('ep.S7.rose') ? 'Rose' : 'Rose G.', role: '', room: 25, start, bye: () => (episodes.started('S7') ? T('S7.conv.10') : null) });
  }
  function talkTo(who, o) { if (who === 'rose') return roseTalk(o); return false; }

  // --- June's pot: coffee made in it comes out as two cups (nothing says so) ----------------------------------------------
  if (kit && typeof kit.brew === 'function') {
    const brew0 = kit.brew.bind(kit);
    kit.brew = (hit, d, w) => (live() && w && w.c && w.c.item === 'junespot' && d && d.id === 'coffee' && d.brew
      ? brew0(hit, { ...d, brew: { ...d.brew, rest: (d.brew.rest || 0) * 2, lift: (d.brew.lift || 0) * 2 } }, w) : brew0(hit, d, w));
  }

  // --- the dot's Give on a person carrying what they want (show.js; A2's Mary and Leo's lid) ---------------------------------
  if (pointer && typeof pointer.setTarget === 'function') {
    const set0 = pointer.setTarget.bind(pointer);
    pointer.setTarget = (tg) => {
      if (tg && tg.kind === 'person' && !tg.q && live()) { const q = show.giveFor(tg.ref); if (q) tg = { ...tg, q }; }
      return set0(tg);
    };
  }

  // --- the swim off the rock (S7: the main story's line), the poll ---------------------------------------------------------
  const swimTick = () => {
    if (!live() || !player || player.mode !== 'swim' || story.has('ep.S7.swam')) return;
    const q = layer && layer.prop('s7.rock'); if (q && Math.hypot(q.prop.x - player.x, q.prop.z - player.z) < SWIM_R) apply(['f:ep.S7.swam'], 'swim');
  };
  const timer = setInterval(() => { try { roseTick(); famTick(); swimTick(); } catch (e) { if (!timer.warned) { timer.warned = true; console.warn('episodes: the tick', e); } } }, 500);

  story.on('season', () => { unstageRose(); kid593 = new Set(); });
  return { episodes, minigames, show, stories, rose: () => rose, roseTalk, debug: { potTarget, famHere, FAMS, roseSpot: () => (storeLayout(25) ? roseSpot(storeLayout(25)) : null), stageRose: () => { const L = storeLayout(25); if (L && !rose) stageRose(L); return !!rose; }, unstageRose } };
}
