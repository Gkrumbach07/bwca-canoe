// Smart objects (gl-e, the game-loop round's stream E): people act, they don't stand.
//
// The owner: "NPCs act, not stand: browse shelves, pay at the counter, load canoes, fish, cook — Sims-style smart
// objects". The props advertise what can be done at them: in a store (props.js storeLayout) the shelves (browse), the
// counter (pay, and its end: ask), the board (read), the map table and the paddles on the wall (look), the stove (warm)
// and the chair by it (sit), on the porch the bench (sit) and the rail (rail: looking down the lake), and at the dock
// (load, unload, wait: the deck by the berths, the foot of its steps). Anything else can register its own: a camp's grate
// (cook), a shore (fish), a tent's door (sit), a hang tree (hang).
//
// Who does what. A person has wants, a weight per act (a party going in browses and pays; one coming out sits on the
// porch and warms by the stove; the crew at the dock loads), and the clock picks: game time runs in five-minute
// steps, three to a quarter hour, and each step a person ranks the acts by a draw seeded by (who, the quarter hour, the
// step in it, the season), the act they were just at much less likely, then takes the first object of that act with a
// free slot (people taken in order of their keys, so two never share a spot). Nothing is saved and nothing is random:
// a reload, or another co-op client, has everyone at the same thing at the same minute. A person talked to is held: the
// clock stops for them (activityOf says paused) and they keep their spot, and when you leave they go to whatever the
// schedule has them at by then.
//
//   const smart = new Smart({ day, seed })      seed() → the season's number (parties.seed)
//   smart.register({ where, act, x, z, y?, heading, slots?: [{ x, z, y?, heading? }], pose?, data? }) → id
//   smart.unregister(id), smart.clear(where), smart.at(where) → [obj], smart.get(id)
//   smart.assign(where, people, absHours, blocked?) → Map key → { act, obj, slot, from, until, chunk }   people: [{ key, wants }];
//                blocked: a Set of '<obj id>#<slot>' someone else stands in (npcs.js: a person another module put there)
//   smart.activityOf(personKey) → { act, obj, slot, until, paused } | null
//   smart.hold(personKey, on)   while talked to
//   STEP (game hours a step), ACTS (the acts and the pose each takes)
import { mulberry32 } from './rng.js';

export const STEP = 1 / 12;   // game hours: five minutes
const PER_Q = 3;              // steps in a quarter hour
const HOUR = 12;              // steps in an hour
export const ACTS = {
  browse: { pose: 'browse' }, pay: { pose: 'counter' }, ask: { pose: 'stand' }, read: { pose: 'read' }, look: { pose: 'look' },
  wall: { pose: 'read' }, warm: { pose: 'stand' }, sit: { pose: 'sit' }, rail: { pose: 'stand' }, load: { pose: 'stoop' },
  unload: { pose: 'stoop' }, wait: { pose: 'stand' }, fish: { pose: 'stand' }, cook: { pose: 'stoop' }, hang: { pose: 'stand' },
};
const hashStr = (s) => { let h = 2166136261; for (const c of String(s || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const seeded = (...n) => mulberry32(n.reduce((h, x, i) => (Math.imul(h ^ ((x | 0) + i * 0x9e3779b9), 2654435761) >>> 0), 0x5a7a11) >>> 0);

export class Smart {
  constructor({ day = null, seed = null } = {}) {
    this.day = day; this.seed = typeof seed === 'function' ? seed : () => 0;
    this.objs = new Map();     // id -> obj
    this.byWhere = new Map();  // where -> [obj]
    this.now = new Map();      // person key -> their activity as last assigned
    this.held = new Map();     // person key -> the activity held while talked to
    this.memo = new Map();     // `${where}|${chunk}|${people}` -> the assignment
    this.n = 0;
    this.nIn = new Map();      // where -> objects numbered there since its last clear
  }
  register(o) {
    // (the join: numbered within its place, so the same store's objects have the same ids whatever registered before it,
    // on a reload and on every co-op client; clear(where) starts the count again)
    const k = this.nIn.get(o.where) || 0; this.nIn.set(o.where, k + 1); this.n++;
    const id = o.id || `${o.where}:${o.act}:${k}`;
    const obj = { ...o, id, slots: o.slots && o.slots.length ? o.slots : [{ x: o.x, z: o.z, y: o.y, heading: o.heading }] };
    if (this.objs.has(id)) this.unregister(id);
    this.objs.set(id, obj);
    let l = this.byWhere.get(obj.where); if (!l) this.byWhere.set(obj.where, (l = [])); l.push(obj);
    this.memo.clear();
    return id;
  }
  unregister(id) {
    const o = this.objs.get(id); if (!o) return;
    this.objs.delete(id);
    const l = this.byWhere.get(o.where); if (l) { const i = l.indexOf(o); if (i >= 0) l.splice(i, 1); if (!l.length) this.byWhere.delete(o.where); }
    this.memo.clear();
  }
  clear(where) { for (const o of [...(this.byWhere.get(where) || [])]) this.unregister(o.id); this.nIn.delete(where); }
  at(where) { return (this.byWhere.get(where) || []).slice(); }
  get(id) { return this.objs.get(id) || null; }
  get clock() { const d = this.day; return d ? Math.round(Date.UTC(d.year, 0, d.doy) / 86400000) * 24 + d.hours : 0; }

  // the acts a person ranks at a step, best first: a weighted draw without replacement, seeded; `avoid` much less likely
  rank(key, chunk, wants, avoid = null) {
    const q = Math.floor(chunk / PER_Q), k = chunk - q * PER_Q, r = seeded(hashStr(key), q, k, this.seed() | 0);
    const list = Object.entries(wants || {}).filter(([, w]) => w > 0).map(([a, w]) => [a, a === avoid ? w * 0.12 : w]), out = [];
    while (list.length) {
      const tot = list.reduce((s, x) => s + x[1], 0); let x = r() * tot, j = 0;
      for (; j < list.length - 1; j++) { x -= list[j][1]; if (x <= 0) break; }
      out.push(list.splice(j, 1)[0][0]);
    }
    return { acts: out, r };
  }
  // a person's first liking at a step, free of anyone else (what the next step steers away from)
  top(key, chunk, wants) { return this.rank(key, chunk, wants).acts[0] || null; }
  // Everyone at `where` at abs game hour t: who is at what, in a slot of their own
  assign(where, people, t = this.clock, blocked = null) {
    const chunk = Math.floor(t / STEP), sig = people.map((p) => p.key).join(',') + (blocked && blocked.size ? `|-${[...blocked].join(',')}` : '');
    const m = this.assignAt(where, people, chunk, sig, blocked);
    for (const [k, a] of m) this.now.set(k, this.held.has(k) ? { ...this.held.get(k), paused: true } : a);
    return m;
  }
  // a step's assignment: each person steers off what they were actually at the step before (worked out from the hour's
  // first step, where they steer off their own first liking: so a step's answer is the same whichever is asked first)
  assignAt(where, people, chunk, sig, blocked = null) {
    const mk = `${where}|${chunk}|${sig}`;
    let m = this.memo.get(mk);
    if (!m) {
      const prev = chunk % HOUR ? this.assignAt(where, people, chunk - 1, sig, blocked) : null;
      m = new Map();
      const objs = this.at(where), taken = new Set(blocked || []), ordered = people.slice().sort((a, b) => (a.key < b.key ? -1 : 1));
      // the held keep their spot (and nobody takes it)
      for (const p of ordered) { const h = this.held.get(p.key); if (h && h.obj && objs.includes(h.obj)) { taken.add(`${h.obj.id}#${h.slot}`); m.set(p.key, h); } }
      for (const p of ordered) {
        if (m.has(p.key)) continue;
        const was = prev && prev.get(p.key), { acts, r } = this.rank(p.key, chunk, p.wants, was ? was.act : this.top(p.key, chunk - 1, p.wants));
        let got = null;
        for (const act of acts) {
          const list = objs.filter((o) => o.act === act);
          if (!list.length) continue;
          const start = Math.floor(r() * list.length);
          for (let i = 0; i < list.length && !got; i++) {
            const o = list[(start + i) % list.length];
            for (let s = 0; s < o.slots.length; s++) if (!taken.has(`${o.id}#${s}`)) { got = { act, obj: o, slot: s }; break; }
          }
          if (got) break;
        }
        if (!got) continue;
        taken.add(`${got.obj.id}#${got.slot}`);
        m.set(p.key, { ...got, from: chunk * STEP, until: (chunk + 1) * STEP, chunk });
      }
      if (this.memo.size > 400) this.memo.delete(this.memo.keys().next().value);
      this.memo.set(mk, m);
    }
    return m;
  }
  activityOf(key) {
    const a = this.held.get(key) || this.now.get(key);
    if (!a) return null;
    return { act: a.act, obj: a.obj ? a.obj.id : null, slot: a.slot, until: a.until, paused: this.held.has(key) };
  }
  hold(key, on) {
    if (on) { if (!this.held.has(key)) { const a = this.now.get(key); if (a) { this.held.set(key, a); this.memo.clear(); } } }
    else if (this.held.has(key)) { this.held.delete(key); this.memo.clear(); }
  }
  forget(prefix) { for (const k of [...this.now.keys()]) if (k.startsWith(prefix)) this.now.delete(k); }
  stats() { return { objects: this.objs.size, places: [...this.byWhere.keys()], people: this.now.size, held: [...this.held.keys()] }; }
}
