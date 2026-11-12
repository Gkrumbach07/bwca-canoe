// The mining years' favours (story Round 2, stream A2; docs/story/30-mining-years.md §4.2, §4.2.1): two jobs a person
// asks of you in talk, never posted on a board, kept in the journal with the board's own notices (tasks.js): Len's
// pictures for the history wall (two place-matched photos, $40 at the trip's end, 10 days) and "A lid for Mary" (no pay:
// done when the lid is given). Loaded only under STORY_ON (main.js's a2 block).
//
//   attachMiningTasks({ tasks, layer, story, hud }) → { offerLen(ep), offerMary(ep), handIn(who) → 'paid' | 'wrong' | null,
//                                                    lidGiven(), lenTask(), maryTask() }
//   Photos: the story layer's photo targets (story-places.json crews.landing `crib`, westpads `casing`): layer.on('photo')
//   marks the favour's two; a picture near either place that matches neither is the "wrong photo" (30:4.2.1.wrong)
import { registerKind, KINDS } from './tasks.js';

export const LEN_TASK = { kind: 'lenphotos', title: 'Pictures for the history wall', pay: 40, days: 10, npc: 'cast:len', name: 'Len Saari', targets: ['crib', 'casing'] };
export const MARY_TASK = { kind: 'marylid', title: 'A lid for Mary', pay: 0, npc: 'cast:mary', name: 'Mary Pelto' };
// a picture within this of a target's place that matches neither is "a nice rock"
const NEAR_TARGET = 300;

let registered = false;
function register() {
  if (registered || KINDS.lenphotos) { registered = true; return; }
  registered = true;
  // (no make: never on a board; weight 0 everywhere)
  // (the final pass: a favour asked in talk, `story` on its kind, is the journal's, not the board's: never in a counter's
  // pile "Taken from this board", never thanked in the keeper's hello as a board job; tasks.js / npcs.js read KINDS[k].story)
  registerKind(LEN_TASK.kind, {
    label: 'a favour', story: true, weight: { local: 0, medium: 0, far: 0 },
    pay() { return LEN_TASK.pay; },
    progress(t) { const n = (t.got || []).length; return n >= 2 ? 'both pictures, for Len' : n === 1 ? `the ${t.got.includes('crib') ? 'casing' : 'crib'} still wanted` : 'the crib and a casing'; },
    fraction(t) { return t.status === 'done' ? 1 : ((t.got || []).length) / 2; },
  });
  registerKind(MARY_TASK.kind, {
    label: 'a favour', story: true, weight: { local: 0, medium: 0, far: 0 },
    pay() { return 0; },
    progress(t) { return t.status === 'done' ? 'given' : 'a lid, with his letters on it'; },
  });
}

export function attachMiningTasks({ tasks, layer = null, story = null, hud = null } = {}) {
  register();
  const T = tasks;
  const find = (kind) => (T ? [...T.ads.values()].find((t) => t.kind === kind && t.status !== 'gone') || null : null);
  const make = (spec, ep, extra = {}) => {
    if (!T) return null;
    const had = find(spec.kind); if (had) return had;
    const L = T.landing(Number(ep));
    const t = { id: T.nextId++, kind: spec.kind, from: Number(ep), fromName: L ? L.name : 'Farm Lake', band: 'local', status: 'open', posted: T.today(), taken: T.today(),
      npc: spec.npc, npcName: spec.name, sign: spec.name, title: spec.title, text: spec.title, pay: spec.pay, ...extra };
    if (spec.days) t.due = t.taken + spec.days; else t.noDue = true; // (chk-c2a: Mary's lid waits on the Kettle day, which waits on a rain: no deadline, never "gone")
    t.clue = t.text;
    T.ads.set(t.id, t);
    T.changed(); T.boardChanged();
    return t;
  };
  const api = {
    lenTask: () => find(LEN_TASK.kind),
    maryTask: () => find(MARY_TASK.kind),
    offerLen(ep = 31) { const t = make(LEN_TASK, ep, { got: [], wrong: 0 }); if (t && hud) hud.note(`Taken on: “${t.title}” · $${t.pay} · paid by Len or at ${t.fromName}`, 7); return t; },
    offerMary(ep = 31) { const t = make(MARY_TASK, ep); if (t && hud) hud.note(`Taken on: “${t.title}”`, 6); return t; },
    // E with Len, both pictures taken: the favour done (paid at the trip's end, tasks.settle). → 'paid' | 'wrong' | null
    handIn(who) {
      if (who === 'len') {
        const t = api.lenTask(); if (!t || t.status !== 'open') return null;
        if ((t.got || []).length >= 2) { t.status = 'done'; T.changed(); if (story && !story.has('len.photos')) story.set('len.photos', true, 'task:len'); if (hud) hud.note(`Handed in: “${t.title}”`, 5); return 'paid'; }
        if (t.wrong > (t.told || 0)) { t.told = t.wrong; T.changed(); return 'wrong'; }
        return null;
      }
      return null;
    },
    lidGiven() { const t = api.maryTask(); if (!t) return; t.status = 'gone'; T.ads.delete(t.id); T.changed(); T.boardChanged(); },
    // a picture (layer.on('photo') with the places near the eye): the favour's targets marked
    shot(ev) {
      const t = api.lenTask(); if (!t || t.status !== 'open') return;
      const m = (ev && ev.matches) || [];
      let hit = false;
      for (const id of LEN_TASK.targets) if (m.includes(id) && !t.got.includes(id)) { t.got.push(id); hit = true; story && story.set(`photo.${id}`, true, 'photo'); }
      if (hit) { T.changed(); return; }
    },
    // a picture that matched nothing, near the places the favour names (photo.js's own onShot, through kettle.js)
    miss({ eye } = {}) {
      const t = api.lenTask(); if (!t || t.status !== 'open' || !eye || !layer) return;
      for (const id of ['crews.landing', 'westpads']) { const pl = layer.place(id); if (pl && Math.hypot(pl.x - eye.x, pl.z - eye.z) < NEAR_TARGET) { t.wrong = (t.wrong || 0) + 1; T.changed(); return; } }
    },
  };
  if (layer && typeof layer.on === 'function') layer.on('photo', (ev) => api.shot(ev));
  return api;
}
