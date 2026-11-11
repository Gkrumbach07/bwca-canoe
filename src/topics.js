// Story talk (docs/build/campaign-design.md §5, Part 4 Round 1 stream T): the words by id, story topics on the keepers,
// and the scenes people play with you (Tauno's porch, the turn, Josie's counter). Loaded only under STORY_ON (main.js's
// st-t block imports it), so with the flag off none of this exists.
//
// The words are the docs' (the extract's JSON, scripts/story-extract.mjs, loaded by story-data/words.js): a line is named by its
// id, never written here. An id may name one quote of an anchored table row: '20:9.2#R3.0' is the first quote in the
// Lines cell of row R3 of the table anchored 20:9.2 (the re-hooks).
//
//   texts.add(json) · texts.entry(id) · T(id, vars?) → the words (null when the id is missing: a rig and the lint fail
//                 it, the game says nothing) · rowQuotes(id, row) → [quotes]
//   MANNERS       the keepers' manners in the docs' order (warm, dry, gruff, old hand, keen, precise)
//   TALK_SENSORS  the condition names a topic reads from its own context (registered with story-cond, for the lint)
//
//   const topics = new Topics()
//   topics.attach({ story, npcs, talk, pencil, outfitter, world, day, profile, hud, beats, ambient })
//   topics.items(v) → [{ id, text, pri, tag, go }]     npcs.addTalkSource: a keeper's story topics, under "Ask about…"
//   topics.top(v) → choice | null                      npcs.extraChoices: the one gold topic at the top (20 §5.2)
//   topics.add(list) → off                             another stream's keeper topics (the same shape as topics-act1.js)
//   topics.scene(def, start, ctx) → node                a scene of story-data (the porch, the turn, Josie) as dialogue
//   topics.run(actions, args)                          f: walt: ppl: lead: und: (story-rules.js apply), as a topic's Gives
//   topics.ring(target, { by, lead, label })           a ring a person draws (pencil.ring; second voice; ≤ 2 a talk)
//   topics.on('topic', fn) → off                       a topic chosen: { who, id, ep } (feed-talk.js: the 'topic' event)
//
// Every line a topic says goes through npcs.mark (no repeat within a visit) and is the doc's own; a topic never says
// what to do, and a ring is drawn only when the player asked for it.
import { registerSensor } from './story-cond.js';

export const MANNERS = ['warm', 'dry', 'gruff', 'old hand', 'keen', 'precise'];
// the names a scene's or a topic's condition reads from its own context (args): registered so story-cond knows them
export const TALK_SENSORS = { cold: 'flag', raining: 'flag', snowing: 'flag', farm: 'flag', homefarm: 'flag', porch: 'flag', first: 'flag', manner: 'arg', keeper: 'arg' };
for (const [k, kind] of Object.entries(TALK_SENSORS)) registerSensor(k, kind);

// --- the words ---------------------------------------------------------------------------------------------------------
const maps = [];
const rows = new Map(); // `${id}#${row}` → [quotes]
export const texts = {
  add(json) { const t = json && json.text ? json.text : json; if (t && typeof t === 'object') maps.push(t); return texts; },
  clear() { maps.length = 0; rows.clear(); },
  entry(id) { for (const m of maps) if (m[id]) return m[id]; return null; },
  has(id) { return T(id) != null; },
};
// an anchored table's row: the quotes of its last cell, in order (the table's text is "cell | cell | …" per line)
export function rowQuotes(id, row) {
  const k = `${id}#${row}`;
  if (rows.has(k)) return rows.get(k);
  const e = texts.entry(id);
  let out = [];
  if (e && typeof e.text === 'string') {
    for (const line of e.text.split('\n')) {
      const cells = line.split(' | ');
      if (cells[0].replace(/\*/g, '').trim() !== row) continue;
      out = [...cells[cells.length - 1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      break;
    }
  }
  rows.set(k, out);
  return out;
}
// the words of an id, with {tokens} filled from vars (a token left unfilled stays as the doc wrote it)
export function T(id, vars = null) {
  if (!id) return null;
  let s = null;
  const h = String(id).indexOf('#');
  if (h > 0) {
    const [row, n] = id.slice(h + 1).split('.');
    const q = rowQuotes(id.slice(0, h), row);
    s = q[Number(n) || 0] ?? null;
  } else {
    const e = texts.entry(id);
    s = e && typeof e.text === 'string' ? e.text : null;
  }
  if (s == null) return null;
  if (vars) s = s.replace(/\{([\w.]+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}
// every text id a piece of data names (the lint and the unit check: each must resolve)
export function textIds(x, out = new Set()) {
  if (typeof x === 'string') { if (/^(?:\d\d:|70\.|NB\d)/.test(x) && !/\s/.test(x)) out.add(x); return out; }
  if (Array.isArray(x)) { for (const y of x) textIds(y, out); return out; }
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k === 'when' || k === 'then' || k === 'once') continue; textIds(v, out); }
  return out;
}

// --- a scene: data → dialogue nodes ------------------------------------------------------------------------------------
// A scene (story-data/porch-act1.js) is { who, nodes: { id: node } }. A node:
//   say:   [line]       said in order, one at a time ("…" between); a line is an id, { id, when }, { first: [line…] }
//                       (the first whose when holds) or { id, strip: 'words' } (said without those words)
//   then:  [action]     on entering it (f: walt: ppl: lead: und:, and do:<hook> for the scene's own code)
//   go:    [choice]     choices; hub: 'X' adds node X's choices after its own (a reply that keeps the hub)
//   to:    'X'          no choices: straight on to X once its lines are said
//   end:   true         the scene ends after its lines (the speaker's goodbye is not said)
// A choice: { ask: id, when?, once?: key (gone once chosen: f:<who>.said.<key>), then?: [action], to?: node, say?: [line]
//   (a reply, then `to` or back to the node it was chosen from), end?: true, kind? }
// Conditions read the story (story.when) with the scene's context as args (TALK_SENSORS, ep, home…).
export class SceneRun {
  constructor(topics, def, ctx = {}) { this.t = topics; this.def = def; this.ctx = ctx; this.who = def.who || ctx.who || 'x'; this.at = null; }
  when(expr) { if (!expr) return true; const s = this.t.story; return !!(s && s.when(expr, this.ctx.args || {})); }
  said(key) { const s = this.t.story; return !!(s && s.has(`${this.who}.said.${key}`)); }
  // the words of a node's lines → [{ text, by }] (a hook's line is the scene's own code: { hook } → an id or { id, by })
  lines(list) {
    const out = [];
    const one = (l) => {
      if (typeof l === 'string') return { id: l };
      if (!l) return null;
      if (l.first) { const f = l.first.find((x) => typeof x === 'string' || !x.when || this.when(x.when)); return f ? one(typeof f === 'string' ? f : { ...f, when: null }) : null; }
      if (l.when && !this.when(l.when)) return null;
      if (l.hook) { const fn = this.ctx.hooks && this.ctx.hooks[l.hook]; let r = null; try { r = typeof fn === 'function' ? fn(this) : null; } catch (e) { console.warn('story scene line', l.hook, e); } return typeof r === 'string' ? { id: r } : r; }
      return l;
    };
    for (const l of list || []) {
      const x = one(l); if (!x) continue;
      let w = x.text != null ? x.text : T(x.id, this.ctx.vars);
      if (w && x.strip) w = w.replace(x.strip, '').trim();
      if (w) out.push({ text: w, by: x.by || null });
    }
    return out;
  }
  act(list, args = {}) {
    for (const a of list || []) {
      if (a && typeof a === 'object') { if (!a.when || this.when(a.when)) this.act(a.then, args); continue; } // { when, then }
      const m = /^do:(\w+)$/.exec(a);
      if (m) { const fn = this.ctx.hooks && this.ctx.hooks[m[1]]; if (typeof fn === 'function') { try { fn(this, args); } catch (e) { console.warn('story scene', m[1], e); } } continue; }
      this.t.run([a], { ...(this.ctx.args || {}), ...args }, `scene:${this.def.id || this.who}`);
    }
  }
  // a node with no lines of its own that offers choices (a hub, a follow-up): entered quietly under the last line
  silent(id) { const N = this.def.nodes[id]; return !!(N && !(N.say && N.say.length) && !N.to && !N.end); }
  enter(id) {
    const N = this.def.nodes[id];
    this.at = id;
    if (this.ctx.onNode) { try { this.ctx.onNode(id, this); } catch (e) { console.warn('story scene onNode', e); } }
    this.act(N.then);
    return this.choices(id);
  }
  // the scene's end: the context's way on (P1: the keeper's part of the onboarding), else the talk closes quietly
  ending(at) {
    if (typeof this.ctx.cont === 'function') { try { const n = this.ctx.cont(at, this); if (n !== undefined) return n; } catch (e) { console.warn('story scene cont', e); } }
    return { end: true, after: () => { if (this.ctx.onEnd) this.ctx.onEnd(at, this); } };
  }
  // the node, said: its lines one at a time, then its choices (or straight on)
  node(id) {
    const N = this.def.nodes[id];
    if (!N) return null;
    this.at = id;
    if (this.ctx.onNode) { try { this.ctx.onNode(id, this); } catch (e) { console.warn('story scene onNode', e); } }
    const lines = this.lines(N.say); // (said as the node is entered, then its Gives: a line may read what they will change)
    this.act(N.then);
    const tail = () => {
      if (N.end) return this.ending(id);
      if (N.to) return this.node(N.to);
      return null;
    };
    const finalChoices = () => this.choices(id);
    if (N.to && !N.end && lines.length && this.silent(N.to)) return this.chain(lines, () => this.enter(N.to), tail); // (straight into a hub: its choices under the last line)
    return this.chain(lines, N.end || N.to ? null : finalChoices, tail);
  }
  // lines said one after another; the last carries the choices (or goes on, or ends)
  chain(lines, choicesFn, tail) {
    const by0 = this.ctx.by || null, mark = this.ctx.mark;
    const step = (i) => {
      if (i >= lines.length) return tail();
      const last = i === lines.length - 1, l = lines[i], by = l.by || by0;
      if (typeof mark === 'function') { try { mark(l.text); } catch { /* the visit's said lines */ } }
      const node = { say: l.text, by, byRole: l.by ? l.role || '' : undefined };
      if (!last) node.choices = [{ text: '…', go: () => step(i + 1) }];
      else if (choicesFn) node.choices = choicesFn();
      else node.choices = [{ text: '…', go: () => tail() }]; // (lazily: the next node's Gives wait for the press)
      return node;
    };
    if (!lines.length) { if (choicesFn) return { say: '…', by: by0, filler: true, choices: choicesFn() }; return tail(); }
    return step(0);
  }
  choices(id) {
    const N = this.def.nodes[id], list = [...(N.go || [])];
    if (N.hub && this.def.nodes[N.hub]) list.push(...(this.def.nodes[N.hub].go || []));
    const out = [];
    for (const c of list) {
      if (c.when && !this.when(c.when)) continue;
      if (c.once && this.said(c.once)) continue;
      const text = T(c.ask, this.ctx.vars);
      if (!text) continue;
      out.push({ text, kind: c.kind, tag: c.tag, go: () => this.pick(c, id) });
    }
    if (!out.length) out.push({ text: '…', kind: 'bye', go: () => null });
    return out;
  }
  pick(c, from) {
    if (c.once) this.t.run([`f:${this.who}.said.${c.once}`], this.ctx.args, `scene:${this.def.id || this.who}`);
    this.act(c.then);
    this.t.emit('topic', { who: this.who, id: `${this.def.id || 'scene'}:${c.once || c.ask}`, ep: this.ctx.args && this.ctx.args.ep });
    const back = c.to || (c.end ? null : from);
    const tail = () => (c.end ? this.ending(from) : this.node(back));
    if (c.say) {
      const lines = this.lines(c.say);
      if (lines.length) {
        // a reply that returns to the node it came from: its lines, then that node's choices again (not its lines)
        if (!c.to && !c.end) return this.chain(lines, () => this.choices(from), tail);
        if (c.to && this.silent(c.to)) return this.chain(lines, () => this.enter(c.to), tail); // (a reply into a node with no lines of its own)
        return this.chain(lines, null, tail);
      }
    }
    if (!c.to && !c.end) return { say: '…', by: this.ctx.by || null, filler: true, choices: this.choices(from) };
    return tail();
  }
}

// a topic's question: its id's words, an id with a phrase swapped (the doc's "and the other easy nicknames"), or a label
export function askText(t, vars = null) {
  if (!t) return null;
  if (t.ask && typeof t.ask === 'object') { const w = T(t.ask.from, vars); return w && t.ask.swap ? w.replace(t.ask.swap[0], t.ask.swap[1]) : w; }
  return (t.ask ? T(t.ask, vars) : null) || t.label || null;
}

// --- topics on the keepers ---------------------------------------------------------------------------------------------
export class Topics {
  constructor() {
    this.c = {};
    this.handlers = new Map();
    this.ringsThisTalk = 0;
    this.talkKey = null;
    this.data = { keeper: [], floor: null };
  }
  attach(c = {}) { Object.assign(this.c, c); return this; }
  get story() { return this.c.story || null; }
  use({ keeper = [], floor = null } = {}) { this.data.keeper = keeper; this.data.floor = floor; return this; }
  // another stream's keeper topics (P's "Where would I find {name}?" for a person lead, an arc's own), in this shape;
  // an id already there is replaced. → off
  add(list) {
    const L = (Array.isArray(list) ? list : [list]).filter((t) => t && t.id);
    this.data.keeper = [...this.data.keeper.filter((t) => !L.some((x) => x.id === t.id)), ...L];
    return () => { this.data.keeper = this.data.keeper.filter((t) => !L.includes(t)); };
  }
  on(evt, fn) { if (!this.handlers.has(evt)) this.handlers.set(evt, new Set()); this.handlers.get(evt).add(fn); return () => this.handlers.get(evt).delete(fn); }
  emit(evt, data) { for (const fn of this.handlers.get(evt) || []) { try { fn(data); } catch (e) { console.warn('topics.on', evt, e); } } }

  // the keeper's context: who, their manner, the store, and the condition args
  ctxOf(v) {
    const n = this.c.npcs, ch = n && typeof n.charOf === 'function' ? n.charOf(v.ep) : null;
    const pr = this.c.profile, home = pr && pr.started ? Number(pr.home) : null, ep = Number(v.ep);
    const manner = ch ? ch.manner : 'warm';
    const name = String(v.name || 'The keeper');
    return { ep, home: ep === home, manner, keeper: name, first: name.split(' ')[0], args: { ep, home: ep === home, manner, keeper: name, farm: ep === 31, homefarm: home === 31 } };
  }
  when(expr, args) { const s = this.story; return !expr || !!(s && s.when(expr, args)); }
  run(actions, args = {}, src = 'topic') {
    const s = this.story; if (!s || s.mode === 'mirror' || !actions || !actions.length) return;
    s.rules.apply({ id: src, then: actions }, args || {});
  }
  // a keeper's lines for a topic: by keeper (70 §8, the topic's label), else by manner, else the plain id
  sayFor(t, K) {
    const ids = [];
    if (t.byKeeper) { const k = this.keeperLines(K.keeper, t.byKeeper); if (k.length) return k; }
    if (t.manner) { const i = MANNERS.indexOf(K.manner); const id = t.manner[Math.max(0, i)] || t.manner[0]; if (id) ids.push(id); }
    if (t.at && t.at[K.ep]) ids.splice(0, ids.length, ...[].concat(t.at[K.ep]));
    if (!ids.length && t.say) ids.push(...[].concat(t.say));
    return ids;
  }
  // 70 §8: the keeper's own lines on a topic (its label), and the "Go on" after it
  keeperLines(name, label) {
    const out = [];
    for (const m of maps) {
      const ids = Object.keys(m);
      for (let i = 0; i < ids.length; i++) {
        const e = m[ids[i]];
        if (!e || e.who !== name || e.topic !== label || !/^70\.8\./.test(ids[i])) continue;
        if (e.cond && !this.when(e.cond, {})) continue;
        out.push(ids[i]);
        const nx = m[ids[i + 1]];
        if (nx && nx.who === name && nx.topic === 'Go on') out.push(ids[i + 1]);
        return out;
      }
    }
    return out;
  }
  // a keeper's story topics, for "Ask about…" (npcs.addTalkSource)
  items(v) {
    const s = this.story; if (!s || s.mode === 'mirror' || !v || !v.keeper) return [];
    const K = this.ctxOf(v), out = [];
    for (const t of this.data.keeper) {
      if (t.top) continue;
      if (!this.ready(t, K)) continue;
      out.push({ id: `story:${t.id}`, text: askText(t, K), pri: t.pri ?? 3.5, tag: t.tag === undefined ? 'new' : t.tag, story: true, go: () => this.say(v, t, K) });
    }
    const f = this.data.floor;
    if (f && this.when(f.when, K.args)) out.push({ id: 'story:floor', text: T(f.ask) || f.label, pri: 0.9, story: true, go: () => this.floor(v, K) });
    return out;
  }
  // the one topic in gold at the top of a keeper's choices (the return's "Whose gear was this?", 20 §5.2)
  top(v) {
    const s = this.story; if (!s || s.mode === 'mirror' || !v || !v.keeper) return null;
    const K = this.ctxOf(v);
    for (const t of this.data.keeper) if (t.top && this.ready(t, K)) return { text: askText(t, K), kind: 'arc', go: () => this.say(v, t, K) };
    return null;
  }
  ready(t, K) {
    const s = this.story;
    if (t.once && s.has(`asked.walt.${t.id}`)) return false;
    if (!this.when(t.when, K.args)) return false;
    return !!askText(t, K);
  }
  // a topic said: the keeper's words (one at a time), Josie's after them at home, the Gives, a ring if it has one
  say(v, t, K = this.ctxOf(v)) {
    const n = this.c.npcs, s = this.story;
    this.newTalk(v);
    const ids = this.sayFor(t, K);
    const vars = { ...K, outfitter: K.keeper };
    const lines = ids.map((id) => T(id, vars)).filter(Boolean);
    if (K.home && t.josie) { const j = T(t.josie, vars); if (j) lines.push({ by: 'Josie', text: j }); }
    if (t.extra) for (const x of t.extra) if (this.when(x.when, K.args)) { const w = T(x.id, vars); if (w) lines.push(w); }
    if (t.once) this.run([`f:asked.walt.${t.id}`], K.args, `topic:${t.id}`);
    this.run(t.then || [], { ...K.args }, `topic:${t.id}`);
    if (t.ring && this.when(t.ringWhen, K.args)) this.ring(t.ring, { by: K.first, lead: t.lead || null, label: t.label || null, fact: t.ringFact });
    this.emit('topic', { who: 'keeper', id: t.id, ep: K.ep });
    const back = () => (n && typeof n.askChoices === 'function' ? n.askChoices(v) : []);
    const step = (i) => {
      const l = lines[i];
      if (l == null) return { say: '…', filler: true, choices: back() };
      const say = typeof l === 'string' ? l : l.text, by = typeof l === 'string' ? null : l.by;
      if (n && typeof n.mark === 'function') n.mark(say);
      const node = { say, by, byRole: by ? 'the summer help' : undefined };
      node.choices = i < lines.length - 1 ? [{ text: '…', go: () => step(i + 1) }] : back();
      return node;
    };
    return step(0);
  }
  // "Who'd know about Walt?" (§5.1 the floor): player-pulled, never spent
  floor(v, K = this.ctxOf(v)) {
    const f = this.data.floor, n = this.c.npcs;
    this.newTalk(v);
    let pick = null;
    for (const a of f.answers) if (this.when(a.when, K.args)) { pick = a; break; }
    const ids = pick ? this.sayFor(pick, K) : [];
    const say = ids.map((id) => T(id, K)).filter(Boolean)[0] || '…';
    if (n && typeof n.mark === 'function') n.mark(say);
    if (pick && pick.then) this.run(pick.then, K.args, 'topic:floor');
    this.emit('topic', { who: 'keeper', id: 'floor', ep: K.ep });
    const back = () => (n && typeof n.askChoices === 'function' ? n.askChoices(v) : []);
    return { say, choices: back() };
  }
  newTalk(v) { const k = `${v.key}:${this.c.day ? `${this.c.day.year}-${this.c.day.doy}-${Math.floor(this.c.day.hours)}` : ''}`; if (k !== this.talkKey) { this.talkKey = k; this.ringsThisTalk = 0; } }

  // --- rings ---------------------------------------------------------------------------------------------------------
  // where a ring target is: { ep } a landing, { lake: name } a lake (its middle, its size), { x, z, r } a place
  where(target) {
    if (!target) return null;
    if (Number.isFinite(target.x) && Number.isFinite(target.z)) return { x: target.x, z: target.z, r: target.r || 220, lake: target.lakeId || null };
    const w = this.c.world, n = this.c.npcs;
    if (target.ep != null) {
      let L = n && typeof n.landingOf === 'function' ? n.landingOf(target.ep) : null;
      if (!L && w && w.entryPoints) L = w.entryPoints.find((e) => e.ep === Number(target.ep)) || null;
      return L && Number.isFinite(L.x) ? { x: L.x, z: L.z, r: target.r || 260, lake: L.lake || null } : null;
    }
    if (target.lake && w && Array.isArray(w.lakes)) {
      let best = null;
      const lx = (l) => (Number.isFinite(l.x) ? l.x : l.cx), lz = (l) => (Number.isFinite(l.z) ? l.z : l.cz); // (the world's lakes carry cx/cz)
      for (const l of w.lakes) if (l && (l.name === target.lake || l.displayName === target.lake) && Number.isFinite(lx(l)) && (!best || (l.cells || 0) > (best.cells || 0))) best = l;
      if (!best) return null;
      return { x: lx(best), z: lz(best), r: Math.round(Math.max(500, Math.sqrt(((best.cells || 3000) * 100) / Math.PI) * 1.2 + 250)), lake: best.id };
    }
    return null;
  }
  // a person draws a ring (asked): at most two a conversation (§12 ringsPerTalk); pencil.js does the second voice
  ring(target, { by = null, lead = null, label = null, fact = null } = {}) {
    const P = this.c.pencil, at = this.where(target);
    if (!P || typeof P.ring !== 'function' || !at) return null;
    if (this.ringsThisTalk >= 2) return null;
    this.ringsThisTalk++;
    const ring = P.ring({ x: Math.round(at.x), z: Math.round(at.z), r: at.r, label: label || target.label || target.lake || '', by, lead, lake: at.lake, place: target.place || null }); // (place: leads-act1.js PLACES, so ringed:<place> and the leads see it)
    if (fact) this.run([`f:${fact}=${String(by || 'keeper').replace(/[\s:]/g, '_')}`], {}, 'topic:ring');
    const hud = this.c.hud;
    if (ring && hud && typeof hud.note === 'function' && by) hud.note(`${by} pencils it on your map.`, 4);
    return ring;
  }
}

export const topics = new Topics();
