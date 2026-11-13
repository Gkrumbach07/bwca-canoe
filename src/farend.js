// The far end in the game (story Round 3, stream F; docs/story/50-finale.md §2–§5, §6.9; campaign-design §7.2). The
// places, props, verbs and triggers are story-places.json's (scripts/far-places.mjs) and the rules rules-farend.js's;
// this is the glue the data can't say: main.js's f: block calls connect() under STORY_ON (with the flag off nothing
// imports this file).
//
//   connect(t) → far    t: { story, layer, pencil, inventory, hud, player, pointer, tiles, world, guest }
//     · the sensors lowwater (15 Sep → ice-in: the fall low water bares the step and the rod, 50 §2.2) and iceseason
//       (15 Nov → ice-out: "Never the far end in November", the pit's verb absent, NB56), unless someone has them
//     · what the dot rests on (SEEN): the stone at the dam, the rod, the boots, the pencil sun, the pit ("Frozen in"),
//       the paddle's stone — a fact or a line, never a verb (items never say their use)
//     · the camp's walls to the walker (tiles.dynamic, while the cabin is built), its door gaps open
//     · the hidden carry pencilled as it is walked and inked at the camp (pencil.walk / inkWalked, §4.1)
//     · the verbs' game side: the cot's Sit, the shelf's pencilled line and the core boxes' stencils (as thoughts),
//       Eino's note → the run (story.run.start), the stashes' checkpoints, the Grumman's Get under (run.under)
//     · the far end's items: the spare paddle, the shelf's matches, socks and a 2017 tin; the pages (the 1976
//       photograph, June's note, Eino's note) go into the book (give:page.*)
// A co-op guest (story.mode 'mirror' or guest()): nothing here acts; the props stand (the layer's own rule).
import { defineItem, definePage, itemDef } from './items.js';
import { farSeason, CAMP } from './story-props-far.js';
import { loadWords } from './story-data/words.js';
import * as WORDS from './story-data/words.js';

export const FAR = {
  carry: 'story:gullcarry',
  walkR: 9,           // m: on the hidden carry's tread while this near its line
  seenEvery: 0.25,    // s: the dot read this often
  pitWait: 60,        // s: "Frozen in." at most this often
};

// what the dot resting on a prop does (once each: the rules make the line once anyway)
const SEEN = [
  { prop: 'gull.stone', then: ['f:gull.stone.seen'] },
  { prop: 'gull.rod', then: ['f:gull.rod.seen'] },
  { prop: 'waltcamp.boots', then: ['f:camp.boots', 'walt:50:4.3.w.boots'] },
  { prop: 'waltcamp.sun', when: 'f:nb.torn', then: ['f:camp.sun', 'walt:50:4.3.w.sun'] },
  { prop: 'stash.paddle.stone', then: ['f:stash.paddle.found'] },
  { prop: 'cellar.pit', when: 'any(key.L6*)', then: ['f:pit.seen'] },
];

let defined = false;
function defineFarItems(T) {
  if (defined) return; defined = true;
  // 50 §6.9 the spare paddle (N28): a second paddle, plain ash, old
  if (!itemDef('sparepaddle')) defineItem({ id: 'sparepaddle', name: 'Spare paddle', short: 'Paddle', kind: 'long', w: 1, h: 6, kg: 1.1, price: 0, sold: false, slot: 'paddle', long: 'paddle', icon: 'paddle', identity: '', story: 'f' });
  // 50 §4.3 the shelf: the matches (a tobacco tin, wax-sealed), wool socks, a 2017 tin (items never say their use)
  defineItem({ id: 'waltmatches', name: 'Tobacco tin of matches', short: 'Matches', kind: 'tool', w: 1, h: 1, kg: 0.08, price: 0, sold: false, identity: '', story: 'f' });
  defineItem({ id: 'woolsocks', name: 'Wool socks', short: 'Socks', kind: 'gear', w: 1, h: 1, kg: 0.12, price: 0, sold: false, identity: '', story: 'f' });
  defineItem({ id: 'oldtin', name: 'A tin, 2017', short: 'Tin', kind: 'food', w: 1, h: 1, kg: 0.45, price: 0, sold: false, servings: 1, identity: '', story: 'f' });
  // the pages into the book (notebook.js givePage: kept, the Walt side's Pages tab)
  definePage({ id: 'flycamp', title: 'A photograph, 1976', ref: '50:4.3.t.back' });
  definePage({ id: 'junenote', title: 'A note from June', ref: 'note.june' });
  definePage({ id: 'einonote', title: 'Eino\'s note', ref: 'note.eino' });
  void T;
}

export async function connect(t) {
  const { story, layer, pencil, inventory, hud, player, pointer, tiles } = t;
  const guest = () => { try { return !!(t.guest && t.guest()) || story.mode === 'mirror'; } catch { return story.mode === 'mirror'; } };
  const live = () => !!(story && story.doc) && !guest();
  let FIN = {};
  try { const w = await loadWords(['finale']); FIN = (w.finale && w.finale.text) || {}; } catch { /* (then the book's table) */ }
  const T = (id) => { const e = FIN[id] || WORDS.text(id); return e && typeof e.text === 'string' ? e.text : null; };
  const note = (w, s = 6) => { if (w && hud && typeof hud.note === 'function') hud.note(w, s); };
  const apply = (then, why) => { if (live() && story.rules) story.rules.apply({ id: `far:${why}`, then }, {}); };
  defineFarItems(T);

  // --- the sensors -----------------------------------------------------------------------------------------------------
  const md = () => { const d = story.date(); return d.month * 100 + d.day; };
  if (!story.sensors.has('lowwater')) story.sensor('lowwater', () => { const v = md(); return v >= 915 && v < 1125; }); // (fall low water to freeze-up)
  if (!story.sensors.has('iceseason')) story.sensor('iceseason', () => { const v = md(); return v >= 1115 || v < 501; }); // (15 Nov to ice-out, early May at the far end)
  const season = () => { const m = story.date().month; const fall = m === 9 || m === 10; if (fall !== farSeason.fall) farSeason.fall = fall; };

  // --- the camp's walls to the walker ----------------------------------------------------------------------------------
  let walls = null;
  const wallsFor = (pr, y) => {
    const yaw = pr.yaw || 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (lx, lz) => ({ x: pr.x + lx * c + lz * s, z: pr.z - lx * s + lz * c });
    const fwd = { ux: s, uz: c }, side = { ux: c, uz: -s }; // (the box's own axes: its x along ux,uz)
    const top = y + CAMP.eave + 0.1, t2 = CAMP.wall, out = [];
    const seg = (x0, z0, x1, z1) => { const m = W((x0 + x1) / 2, (z0 + z1) / 2), along = x0 === x1 ? fwd : side, h = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) / 2; out.push({ x: m.x, z: m.z, box: true, ux: along.ux, uz: along.uz, hx: h, hz: t2, top, story: 'waltcamp' }); };
    const { hx, hz, door: fd, back: bd } = CAMP;
    seg(-hx, -hz, -fd, -hz); seg(fd, -hz, hx, -hz);           // the front wall, its door
    seg(-hx, hz, bd[0], hz); seg(bd[1], hz, hx, hz);          // the back wall, its door
    seg(-hx, -hz, -hx, hz); seg(hx, -hz, hx, hz);              // the sides
    return out;
  };
  layer.on('build', (d) => {
    if (d.prop !== 'waltcamp.cabin' || !tiles) return;
    const q = layer.prop(d.prop), b = q && layer.built.get(d.place) && layer.built.get(d.place).get(d.prop); if (!q || !b) return;
    const dyn = tiles.dynamic || (tiles.dynamic = []);
    if (walls) for (const o of walls) { const i = dyn.indexOf(o); if (i >= 0) dyn.splice(i, 1); }
    walls = wallsFor(q.prop, b.y); for (const o of walls) dyn.push(o);
  });
  layer.on('drop', (d) => {
    if (d.prop !== 'waltcamp.cabin' || !walls || !tiles || !tiles.dynamic) return;
    for (const o of walls) { const i = tiles.dynamic.indexOf(o); if (i >= 0) tiles.dynamic.splice(i, 1); }
    walls = null;
  });

  // --- the verbs' game side -----------------------------------------------------------------------------------------------
  const run = () => story.run || null;
  let under = false;
  layer.on('use', (d) => {
    if (!live()) return;
    const r = run();
    switch (d.prop) {
      case 'waltcamp.cot': { const q = layer.prop(d.prop); if (q && player && typeof player.sitAt === 'function') player.sitAt({ x: q.prop.x, z: q.prop.z, kind: 'cot', id: 'waltcamp.cot' }); break; }
      case 'waltcamp.shelf': if (story.has('camp.shelf.taken')) break; note(T('50:4.3.t.shelf'), 8); break; // (Look: the pencilled line on the shelf's edge)
      case 'waltcamp.corebox': note([T('50:4.3.t.box1'), T('50:4.3.t.box2')].filter(Boolean).join('   ·   '), 8); break;
      case 'waltcamp.photo': note(T('50:4.3.t.back'), 6); break;
      case 'waltcamp.note': note(T('note.june'), 10); break;
      case 'waltcamp.marks': note([T('50:4.3.t.years'), T('50:4.3.t.tally')].filter(Boolean).join('      '), 9); break;
      case 'cellar.note':
        note(T('note.eino'), 10);
        if (r && typeof r.start === 'function') { try { r.start({ from: 'pit' }); } catch (e) { console.warn('far: run.start', e); } } // (R also starts on pit.note)
        break;
      case 'stash.paddle': if (r && typeof r.checkpoint === 'function') r.checkpoint('stash', 'paddle'); break;
      case 'stash.drybag': if (r && typeof r.checkpoint === 'function') r.checkpoint('stash', 'drybag'); break;
      case 'stash.grumman':
        under = !under;
        if (r && typeof r.under === 'function') r.under(under);
        if (r && typeof r.checkpoint === 'function' && under) r.checkpoint('stash', 'grumman');
        if (player) player.input && (player.input.paused = false);
        break;
    }
  });

  // --- what the dot rests on -------------------------------------------------------------------------------------------
  const seen = new Set(); let pitSaid = -1e9;
  const look = () => {
    const tg = pointer && pointer.target; const ref = tg && tg.ref;
    if (!ref || !String(ref).startsWith('story:')) return;
    const id = String(ref).slice(6);
    for (const S of SEEN) {
      if (S.prop !== id || seen.has(id)) continue;
      if (S.when && !story.when(S.when)) continue;
      seen.add(id); apply(S.then, `seen.${id}`);
    }
    // 50 §5.2: 15 November to ice-out, "Old pit" and one thought
    if (id === 'cellar.pit' && story.when('any(key.L6*) & iceseason') && performance.now() / 1000 - pitSaid > FAR.pitWait) { pitSaid = performance.now() / 1000; note(T('50:5.2.frozen'), 5); }
  };

  // --- the hidden carry: pencilled as it is walked, inked at the camp (§4.1, 50 §3.1) --------------------------------------
  const carryIx = () => { const w = t.world; if (!w) return -1; for (let i = w.portages.length - 1; i >= 0 && w.portages[i].hidden; i--) if (w.portages[i].id === FAR.carry) return i; return -1; }; // (the hidden are the tail: world.js)
  let walked = null;
  const walk = () => {
    if (!pencil || !player || !player.onFoot) return;
    const i = carryIx(); if (i < 0) return;
    const pts = t.world.portages[i].pts;
    let best = Infinity, k = -1;
    for (let j = 0; j < pts.length; j++) { const d = Math.hypot(pts[j][0] - player.x, pts[j][1] - player.z); if (d < best) { best = d; k = j; } }
    if (best > FAR.walkR) return;
    walked = walked || new Set((((pencil.doc && pencil.doc.walked) || []).find((q) => q.portage === FAR.carry) || { pts: [] }).pts.map(([x, z]) => `${x},${z}`));
    const key = `${Math.round(pts[k][0])},${Math.round(pts[k][1])}`;
    if (walked.has(key)) return;
    walked.add(key);
    const along = pts.filter(([x, z]) => walked.has(`${Math.round(x)},${Math.round(z)}`));
    pencil.walk({ portage: FAR.carry, pts: along });
  };
  const ink = () => { if (pencil && story.has('camp.found') && typeof pencil.inkWalked === 'function') pencil.inkWalked(FAR.carry); };

  // --- the tick --------------------------------------------------------------------------------------------------------------
  let acc = 0, slow = 0;
  const timer = setInterval(() => {
    if (!live()) return;
    try {
      look();
      acc += FAR.seenEvery;
      if (acc >= 1) { acc = 0; walk(); ink(); if (++slow % 30 === 1) season(); }
    } catch (e) { if (!FAR.warned) { FAR.warned = true; console.warn('far: the tick', e); } }
  }, FAR.seenEvery * 1000);

  const far = {
    on: true, FAR, SEEN,
    under: () => under,
    stop: () => clearInterval(timer),
    debug: { look, walk, ink, carry: () => carryIx(), walls: () => walls, season },
  };
  story.far = far;
  return far;
}
