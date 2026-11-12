// "Look at this" (docs/story/60-side-stories.md §0.4 "Show a print to a person", S7; 90 §5; campaign-design Part 4
// Round 2, stream E): a print shown, or a thing given, to a person who wants it. Loaded only under STORY_ON. Nothing
// says what anyone wants: the choice is there in talk whenever you have a print or a thing to show, and a print nobody
// wanted gets a look and goes back ("…"); the dot's Give on a person shows only while you carry what they want (A2's
// Mary and Leo's lid), the way any verb on the dot does.
//
//   show.attach({ story, photo, inventory, text: (id) → words, hud }) → show
//   show.want({ id?, who, print?, item?, when?, say?: [text id], then?: [action], give?: true, run?(ctx) }) → off
//                          print: a layer photo match ('s7.lilacs.camp'); item: an item id (Leo's lid: 'leolid')
//   show.wanted(who) → [want]       the wants of a person that hold now (story.when)
//   show.choice(who, run, from) → a dialogue choice "Look at this…" | null   SceneRun ctx.show (topics.js // e:)
//   show.giveFor(personKey) → { verb: 'Give', run } | null   the dot's Q on a person carrying what they want
//   show.prints() → [{ id, caption, url, matches }]   show.matches(printId) → [match]   (episodes.js keeps the matches)
// A co-op guest (story.mode 'mirror'): no choice, no Give.
export const LOOK = 'Look at this…';

export class Show {
  constructor() { this.c = {}; this.list = []; this.n = 0; }
  attach(c = {}) { Object.assign(this.c, c); return this; }
  get story() { return this.c.story || null; }
  get live() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror'); }
  when(expr) { const s = this.story; if (!expr || expr === 'true') return true; try { return !!(s && s.when(expr)); } catch { return false; } }
  want(w) { const r = { id: w.id || `want:${++this.n}`, ...w }; this.list.push(r); return () => { this.list = this.list.filter((x) => x !== r); }; }
  wanted(who) { return this.live ? this.list.filter((w) => w.who === who && this.when(w.when)) : []; }
  words(id) { const T = this.c.text; return typeof T === 'function' ? T(id) : null; }
  matches(printId) { const E = this.c.episodes; return E && typeof E.matchesOf === 'function' ? E.matchesOf(printId) : []; }
  prints() {
    const P = this.c.photo; if (!P || typeof P.prints !== 'function') return [];
    return P.prints().map((r) => ({ id: r.id, caption: r.caption || 'A print', url: r.url || null, matches: this.matches(r.id) }));
  }
  carried(item) { const inv = this.c.inventory; return !!(inv && typeof inv.count === 'function' && inv.count(item, { reachable: true }) > 0); }
  // what you could show: your prints, and the things a want of this person names that you have with you
  showable(who) {
    const out = this.prints().map((p) => ({ kind: 'print', id: p.id, label: p.caption, matches: p.matches }));
    for (const w of this.wanted(who)) if (w.item && this.carried(w.item)) { const inv = this.c.inventory, f = inv.find ? inv.find(w.item) : null; void f; out.push({ kind: 'item', id: w.item, label: (this.c.itemName && this.c.itemName(w.item)) || w.item }); }
    return out;
  }
  // the choice in a talk: "Look at this…", then your prints (and the wanted things you carry) to pick from
  choice(who, run, from) {
    if (!this.live) return null;
    const things = this.showable(who);
    if (!things.length) return null;
    // (dialogue.js's own show list: the things as choices and its "Never mind."; go(thing) for the one chosen)
    return { text: LOOK, kind: 'show', show: things.slice(0, 8).map((t) => ({ id: `${t.kind}:${t.id}`, label: t.label, t })), go: (pick) => this.shown(who, (pick && pick.t) || things[0], run, from) };
  }
  picker(who, run, from, things) {
    const back = () => (run && typeof run.choices === 'function' ? run.choices(from) : [{ text: '…', kind: 'bye', go: () => null }]);
    const choices = things.slice(0, 8).map((t) => ({ text: t.label, go: () => this.shown(who, t, run, from) }));
    choices.push({ text: '…', go: () => ({ say: '…', filler: true, choices: back() }) });
    return { say: '…', filler: true, choices };
  }
  // a thing shown: the want it answers (its lines one at a time, then its Gives), else a look and back
  shown(who, thing, run, from) {
    const w = this.wanted(who).find((x) => (thing.kind === 'print' ? x.print && (thing.matches || []).includes(x.print) : x.item === thing.id));
    const back = () => (run && typeof run.choices === 'function' ? run.choices(from) : [{ text: '…', kind: 'bye', go: () => null }]);
    if (!w) return { say: '…', filler: true, choices: back() };
    return this.answer(w, thing, back);
  }
  answer(w, thing, back) {
    const lines = (w.say || []).map((id) => this.words(id)).filter(Boolean);
    const act = () => {
      if (w.give && thing.kind === 'item') this.takeFromYou(thing.id);
      const s = this.story;
      if (w.then && w.then.length && s && s.rules) s.rules.apply({ id: `show:${w.id}`, then: w.then }, { who: w.who, print: thing.kind === 'print' ? thing.id : null, item: thing.kind === 'item' ? thing.id : null });
      if (typeof w.run === 'function') { try { w.run({ thing, story: s }); } catch (e) { console.warn('show: run', e); } }
      if (s && typeof s.emit === 'function') s.emit('shown', { who: w.who, kind: thing.kind, id: thing.id, want: w.id });
    };
    if (!lines.length) { act(); return { say: '…', filler: true, choices: back() }; }
    const step = (i) => {
      const last = i === lines.length - 1;
      if (last) act();
      return { say: lines[i], choices: last ? back() : [{ text: '…', go: () => step(i + 1) }] };
    };
    return step(0);
  }
  takeFromYou(item) {
    const inv = this.c.inventory; if (!inv) return false;
    for (const c of inv.reachable ? inv.reachable() : inv.containers || []) for (const e of c.grid || []) if (e.id === item && !e.box) { inv.take(c.id, e.uid, 1); return true; }
    return false;
  }
  // the dot's Q on a person (cast:<who>:<ep>): Give, while you carry a thing they want (and only then)
  giveFor(key) {
    if (!this.live) return null;
    const m = /^cast:([\w-]+):/.exec(String(key || '')); if (!m) return null;
    const w = this.wanted(m[1]).find((x) => x.item && x.give && this.carried(x.item));
    if (!w) return null;
    return { verb: 'Give', run: () => { const T = this.c.talkTo; if (typeof T === 'function') T(m[1], { give: w }); else this.answer(w, { kind: 'item', id: w.item }, () => []); } };
  }
}

export const show = new Show();
