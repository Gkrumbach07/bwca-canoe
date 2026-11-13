// One runner for the arcs, the side stories and the mini-campaigns (docs/build/campaign-design.md Part 2 §10; Part 4
// Round 2, stream E). Part 3 #4 wins over §10.2's wording: NO SLOTS. Any number can be open at once; a window is the
// only limit. Pure (no game imports): the game's pieces come in through attach(), so scripts/c2-episodes-unit.mjs runs
// it in Node, and story-data/rules-episodes.js compiles every record's steps into the story's rules at construction
// (all-rules.js: the data hash holds, chk-coop C2).
//
// A record (story-data/episodes/*.js; A2's arc on the same runner with kind 'arc'):
//   { id, kind: 'side'|'mini'|'arc', title, slot: false, region?: { eps }, window?, cast?, doors, started, steps, page?,
//     ends?, later?, first?, feeds?, climax?, yield?, flyer?, places?, bind? }
//   window   { date: 'MM-DD..MM-DD' | months: '6-9' | dows: 'tue|thu' | when: <condition> | always: true, reopen: 'yearly' }
//            judged at day turn (dayTurn): outside it the episode is dormant (its people absent, its flyer down); a
//            started episode whose window closes gets the fact ep.<id>.shut (its `without` end may read it)
//   doors    [{ kind: 'flyer'|'person'|'rumour'|'entry'|'place'|'choice', yes?: true, on?, when?, line?, who?, nb? }]
//            Only a door marked yes starts anything, and only a flyer taken, an accept choice, an entry read at its place
//            (here:NBxx) or the thing done at its place is allowed to be one (story-lint). Meeting a person, a rumour or
//            an entry read elsewhere is a head start: no rule.
//   started  'f:ep.<id>.yes' (story-lint: the explicit-yes atom; only the runner's doors write it)
//   steps    [{ on?, when?, then }]  rules in the shared engine, scoped by ep.<id>.: each needs the yes, and nothing moves
//            during the run (`!run.active`, 60 §0.5). Nothing about a step is ever shown.
//   ends     [{ id, when, line? }]   the first that holds is the end (ep.<id>.end = id); its line closes the page
//   page     [{ when, text }]        the Stories page's lines in order, in the player's hand (no checklist, no next step)
//   first    a text id: the trip card's stamp (record.js first) when it ends
//   flyer    { ep, text, when?, then?, yes?, style? }   a board flyer (tasks.js / props.js hooks): outside the board's
//            count, no deadline, never paid at the tally, up while the window is open and `when` holds
//   places   [layer place id]        where it happens (places(): the director's "an open episode's place", D)
//   bind     (ctx) → {}              reseeding minis: world places resolved at start, saved in eps.<id>.bind
//
//   episodes.register(rec) · records() · record(id) · attach({ story, record, hud, layer, minigames, guest }) → this
//   episodes.yes(id, how) → bool       the only way ep.<id>.yes is written outside the compiled door rules
//   episodes.state(id) → { started, ended, end, win, how, at } · open() → [id] (started, not ended)
//   episodes.window(id) → bool         · dayTurn() (the feed's day turn; also run at attach)
//   episodes.flyers(ep) → [{ id, paper, taken }] · take(flyerId) → bool
//   episodes.places() → [{ id, ep, place, x, z, r, line }]   the open episodes' places in the layer (the day's beat, D:
//                          line its words; story.episodes is this runner, feed-episodes.js connect, the join)
//   episodes.page(id) / pages() → { id, title, lines, end, first, prints }   (stories.js draws them)
//   episodes.print(recId, matches) (a print's place matches, kept per print) · prints(match) → [recId]
//   episodes.hold(reason) → release   no side story moves while held (60 §0.5: the run, Round 3's R)
//   episodes.on(evt, fn) → off        'start' | 'end' | 'window' | 'flyers' | 'page'
//
// A co-op guest (story.mode 'mirror') is a no-op everywhere: no flyers, no yes, no page, nothing written.

export const RUN_GUARD = '!run.active';
const ID_RX = /^[A-Za-z][\w-]*$/;
const KINDS = new Set(['side', 'mini', 'arc']);
const YES_DOORS = new Set(['flyer', 'choice', 'place', 'entry']);

// the line the director's day's beat says for an open episode's place (D: beats.js reads places()[].line; the join): the
// record's own `beat`, else its first rumour door's line (S7: 70.6.1.11, S9: S9.rumour)
const beatLine = (rec) => rec.beat || ((rec.doors || []).find((d) => d.kind === 'rumour' && d.line) || {}).line || null;

// --- the records → rules ---------------------------------------------------------------------------------------------
export const startedOf = (id) => `f:ep.${id}.yes`;
const and = (...xs) => xs.filter((x) => x && String(x).trim() && x !== 'true').map((x) => (/[|&]/.test(x) ? `(${x})` : x)).join(' & ') || 'true';

// one record's rules: its yes doors, its steps, its ends (ids ep.<id>.door<n> | .s<n> | .end.<end>)
export function compileEpisode(E) {
  const out = [], id = E.id, yes = E.started || startedOf(id);
  (E.doors || []).forEach((d, i) => {
    if (!d.yes || d.kind === 'flyer' || d.kind === 'choice') return; // (a flyer's yes is take(), a choice's its scene's own then)
    if (d.kind === 'entry' && d.nb) out.push({ id: `ep.${id}.door${i}`, when: and(`here:${d.nb}`, d.when), then: [`f:ep.${id}.yes`], ep: id });
    else if (d.on || d.when) out.push({ id: `ep.${id}.door${i}`, ...(d.on ? { on: d.on } : {}), when: and(d.when), then: [`f:ep.${id}.yes`], ep: id });
  });
  (E.steps || []).forEach((s, i) => {
    out.push({ id: `ep.${id}.s${i}`, ...(s.on ? { on: s.on } : {}), when: and(yes, s.when, RUN_GUARD), then: [...(s.then || [])], ep: id });
  });
  for (const e of E.ends || []) out.push({ id: `ep.${id}.end.${e.id}`, when: and(yes, e.when), then: [`f:ep.${id}.end=${e.id}`], ep: id });
  // (on: rules carry their condition as when: too; a when-less on: rule gets 'true' dropped by the engine)
  for (const r of out) if (r.when === 'true') delete r.when;
  return out;
}
export function compileEpisodes(list) { return (list || []).flatMap(compileEpisode); }

// a record's own check (the unit test and the lint): → [why]
export function checkRecord(E) {
  const bad = [];
  if (!E || !ID_RX.test(E.id || '')) return ['no id'];
  if (!KINDS.has(E.kind)) bad.push(`${E.id}: kind '${E.kind}'`);
  if (E.slot) bad.push(`${E.id}: slot (Part 3 #4: no slots)`);
  if ((E.started || startedOf(E.id)) !== startedOf(E.id)) bad.push(`${E.id}: started must be ${startedOf(E.id)} (the explicit yes)`);
  for (const d of E.doors || []) if (d.yes && !YES_DOORS.has(d.kind)) bad.push(`${E.id}: a ${d.kind} door can't be a yes (meeting a person or hearing a rumour starts nothing)`);
  for (const d of E.doors || []) if (d.yes && d.kind === 'entry' && !d.nb) bad.push(`${E.id}: an entry yes needs its nb (read at the place)`);
  if (!(E.doors || []).some((d) => d.yes) && !E.flyer && E.kind !== 'arc') bad.push(`${E.id}: no door says yes`);
  if (E.flyer && !E.flyer.ep) bad.push(`${E.id}: a flyer needs its board (ep)`);
  return bad;
}

// --- windows -----------------------------------------------------------------------------------------------------------
const MD = (s) => { const m = /^(\d\d)-(\d\d)$/.exec(s); return m ? +m[1] * 100 + +m[2] : null; };
// a window, judged on a date ({ month, day, dow }) and the story (its `when`) → bool
export function inWindow(w, dt, when = () => true) {
  if (!w || w.always) return true;
  if (w.date) {
    const [a, b] = String(w.date).split('..').map(MD), v = dt.month * 100 + dt.day;
    if (a != null && b != null && !(a <= b ? v >= a && v <= b : v >= a || v <= b)) return false;
  }
  if (w.months) {
    const [a, b] = String(w.months).split(/-|\.\./).map(Number), m = dt.month, hi = Number.isFinite(b) ? b : a;
    if (!(a <= hi ? m >= a && m <= hi : m >= a || m <= hi)) return false;
  }
  if (w.when && !when(w.when)) return false;
  return true;
}

// --- the runner --------------------------------------------------------------------------------------------------------
export class Episodes {
  constructor() {
    this.recs = new Map();
    this.c = {};
    this.holds = new Map();
    this.wins = new Map();    // id → the window as judged at the last day turn (memory only: a load judges it afresh)
    this.handlers = new Map();
    this.offs = [];
    this.lastDay = null;
    this.printQ = null;
    this.debug = { dayTurn: () => this.dayTurn(true), doc: () => this.doc, held: () => [...this.holds.values()] };
  }
  register(rec) {
    const why = checkRecord(rec);
    if (why.length) { console.warn('episodes.register', why.join('; ')); return false; }
    this.recs.set(rec.id, rec);
    const s = this.story;
    // (the steps must be in the story's data from its construction: story-data/rules-episodes.js. A record registered
    // later without them is said once, loudly: its rules would change the data hash, chk-coop C2)
    if (s && s.rules && s.rules.rules instanceof Map && rec.steps && rec.steps.length && !s.rules.rules.has(`ep.${rec.id}.s0`)) console.warn(`episodes: ${rec.id}'s steps are not in the story's rules (add it to story-data/episodes/index.js)`);
    if (this.attached) this.judge(rec, this.dateNow());
    return true;
  }
  records() { return [...this.recs.values()]; }
  record(id) { return this.recs.get(id) || null; }
  on(evt, fn) { if (!this.handlers.has(evt)) this.handlers.set(evt, new Set()); this.handlers.get(evt).add(fn); return () => this.handlers.get(evt).delete(fn); }
  emit(evt, data) { for (const fn of this.handlers.get(evt) || []) { try { fn(data); } catch (e) { console.warn('episodes.on', evt, e); } } }

  get story() { return this.c.story || null; }
  get live() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror') && !this.guest(); }
  guest() { const g = this.c.guest; try { return typeof g === 'function' ? !!g() : false; } catch { return false; } }
  get doc() { const s = this.story; if (!s || !s.doc) return null; if (!s.doc.eps || typeof s.doc.eps !== 'object') s.doc.eps = {}; return s.doc.eps; }
  st(id) { const d = this.doc; if (!d) return null; return d[id] || (d[id] = {}); }
  dirty() { const s = this.story; if (s && typeof s.dirty === 'function') s.dirty(); }

  attach(c = {}) {
    for (const off of this.offs) { try { off(); } catch { /* gone */ } }
    this.offs = [];
    Object.assign(this.c, c);
    const s = this.story;
    this.attached = true;
    if (s && typeof s.on === 'function') {
      this.offs.push(s.on('fact', ({ key }) => this.onFact(key)));
      this.offs.push(s.on('clock', () => this.tick()));
      this.offs.push(s.on('season', () => { this.lastDay = null; this.dayTurn(true); }));
    }
    this.dayTurn(true);
    // a story already under way (a load): the started and the ended as they lie
    if (this.live) for (const rec of this.recs.values()) { this.onFact(`ep.${rec.id}.yes`); const e = s.get(`ep.${rec.id}.end`); if (e) this.onFact(`ep.${rec.id}.end`); }
    return this;
  }
  detach() { for (const off of this.offs) { try { off(); } catch { /* gone */ } } this.offs = []; this.attached = false; }

  // --- time ----------------------------------------------------------------------------------------------------------
  dateNow() { const s = this.story; if (s && typeof s.date === 'function') return s.date(); return { year: 2026, month: 6, day: 15, dow: 2, doy: 166, hours: 9 }; }
  tick() { const s = this.story; if (!s) return; const t = s.time(); if (t.abs !== this.lastDay) this.dayTurn(); }
  // windows are judged at day turn (and once at attach), kept in memory (wins); a window that closed on a started episode
  dayTurn(force = false) {
    const s = this.story; if (!s || !s.doc) return;
    const t = s.time();
    if (!force && t.abs === this.lastDay) return;
    this.lastDay = t.abs;
    const dt = this.dateNow();
    let changed = false;
    for (const rec of this.recs.values()) changed = this.judge(rec, dt) || changed;
    if (changed) { this.emit('flyers', {}); this.dirty(); }
  }
  // (nothing saved: the window is a function of the date and the story, judged again on load; a started episode out of its
  // window has ep.<id>.shut, written once, the first day turn that finds it so)
  judge(rec, dt) {
    const was = this.wins.get(rec.id), now = inWindow(rec.window, dt, (w) => this.when(w));
    if (!now && this.live && this.started(rec.id) && !this.ended(rec.id) && !this.story.has(`ep.${rec.id}.shut`)) this.apply(rec.id, [`f:ep.${rec.id}.shut`], 'window');
    if (was === now) return false;
    this.wins.set(rec.id, now);
    this.emit('window', { id: rec.id, open: now });
    return true;
  }
  window(id) {
    if (this.wins.has(id)) return this.wins.get(id);
    const rec = this.recs.get(id); return rec ? inWindow(rec.window, this.dateNow(), (w) => this.when(w)) : false;
  }
  when(expr, args) { const s = this.story; if (!expr || expr === 'true') return true; try { return !!(s && s.when(expr, args)); } catch { return false; } }

  // --- the yes, the start, the end -------------------------------------------------------------------------------------
  held() { return this.holds.size > 0; }
  hold(reason = 'hold') { const k = Symbol(reason); this.holds.set(k, reason); return () => this.holds.delete(k); }
  started(id) { const s = this.story; return !!(s && s.has(`ep.${id}.yes`)); }
  ended(id) { const s = this.story; return !!(s && s.has(`ep.${id}.end`)); }
  state(id) {
    const st = (this.doc && this.doc[id]) || {}, s = this.story;
    return { started: this.started(id), ended: this.ended(id), end: s ? s.get(`ep.${id}.end`) || null : null, win: this.window(id), how: st.how || null, at: st.at ?? null };
  }
  open() { return this.records().filter((r) => this.started(r.id) && !this.ended(r.id)).map((r) => r.id); }
  // the explicit yes (a flyer taken, an accept choice): the one write of ep.<id>.yes outside the compiled door rules
  yes(id, how = 'yes') {
    const rec = this.recs.get(id);
    if (!rec || !this.live || this.held() || this.started(id)) return false;
    if (!this.window(id) && rec.kind !== 'arc') return false;
    const st = this.st(id); st.how = how;
    this.apply(id, [`f:ep.${id}.yes`], `yes:${how}`);
    return this.started(id);
  }
  apply(id, then, why) {
    const s = this.story; if (!s || !s.rules || !this.live) return;
    s.rules.apply({ id: `ep:${id}:${why}`, then }, {});
  }
  onFact(key) {
    const m = /^ep\.([\w-]+)\.(yes|end)$/.exec(key || ''); if (!m) return;
    const rec = this.recs.get(m[1]), s = this.story; if (!rec || !this.live || !s.has(key)) return; // (attach asks of every record: only a fact that is there)
    const st = this.st(rec.id);
    if (m[2] === 'yes' && !st.at) {
      st.at = s.time().abs; if (!st.how) st.how = 'door';
      if (typeof rec.bind === 'function' && !st.bind) { try { st.bind = rec.bind({ story: s, ...this.c }) || {}; } catch (e) { console.warn('episodes: bind', rec.id, e); st.bind = {}; } }
      this.dirty();
      this.emit('start', { id: rec.id, how: st.how });
      if (typeof s.emit === 'function') s.emit('episode:start', { id: rec.id, how: st.how });
    }
    if (m[2] === 'end' && !st.ended) {
      st.ended = s.time().abs;
      const end = (rec.ends || []).find((e) => e.id === s.get(key));
      if (end && end.line) st.last = end.line;
      if (rec.first) this.stamp(rec.first);
      this.dirty();
      this.emit('end', { id: rec.id, end: end ? end.id : s.get(key) });
      if (typeof s.emit === 'function') s.emit('episode:end', { id: rec.id, end: end ? end.id : null });
    }
  }
  // a `first` on the trip card (record.js): its words, stamped once
  stamp(textId) {
    const R = this.c.record, words = (this.words(textId) || '').replace(/^First stamped:\s*/i, ''); // (60's "First stamped: …" items, anchored whole)
    if (!R || typeof R.first !== 'function' || !words) return false;
    try { return R.first('story', String(textId), words, null); } catch (e) { console.warn('episodes: first', e); return false; }
  }
  words(id) { const T = this.c.text; if (typeof T === 'function') { const w = T(id); if (w) return w; } return null; }

  // --- flyers (tasks.js board / props.js setStoreNotices hooks) ---------------------------------------------------------
  flyerOf(rec) { return rec && rec.flyer ? { ...rec.flyer, id: `ep:${rec.id}`, ep: rec.id } : null; }
  flyers(ep) {
    if (!this.live || this.held()) return [];
    const out = [];
    for (const rec of this.recs.values()) {
      const f = rec.flyer; if (!f || ![].concat(f.ep).map(Number).includes(Number(ep))) continue; // 7c: a flyer on more than one board (M1: 25 and 31)
      if (!this.window(rec.id) || this.ended(rec.id) || !this.when(f.when)) continue;
      const taken = this.taken(rec.id);
      out.push({ id: `ep:${rec.id}`, ep: Number(ep), taken, paper: this.paper(rec) });
    }
    return out;
  }
  taken(id) { const s = this.story; return !!(s && s.has(`ep.${id}.flyer`)); }
  // the paper as flyers.js draws it: the notice's own words, its last "— " line the sign (no pay: never paid at the tally)
  paper(rec) {
    const f = rec.flyer, raw = this.words(f.text) || '';
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const signAt = lines.findIndex((l) => /^—\s/.test(l));
    const sign = signAt >= 0 ? lines[signAt].replace(/^—\s*/, '') : '';
    const body = signAt >= 0 ? lines.slice(0, signAt) : lines;
    return { id: `ep:${rec.id}`, kind: f.style || 'notice', want: f.want || null, title: body[0] || rec.title || '', text: body.slice(1).join(' '), sign, story: true, flyer: true };
  }
  take(flyerId) {
    const id = String(flyerId || '').replace(/^ep:/, ''), rec = this.recs.get(id);
    if (!rec || !rec.flyer || !this.live || this.held() || this.taken(id)) return false;
    if (!this.window(id)) return false;
    this.apply(id, [`f:ep.${id}.flyer`, ...(rec.flyer.then || [])], 'flyer');
    if (rec.flyer.yes !== false && !rec.flyer.noYes) this.yes(id, 'flyer');
    this.emit('flyers', { id, taken: true });
    return true;
  }

  // --- places (the director reads them for the day's beat) ---------------------------------------------------------------
  places() {
    if (!this.live) return [];
    const L = this.c.layer, out = [];
    for (const id of this.open()) {
      const rec = this.recs.get(id); if (!this.window(id) || !rec.places) continue;
      for (const pid of rec.places) {
        const pl = L && typeof L.place === 'function' ? L.place(pid) : null;
        if (pl && Number.isFinite(pl.x)) out.push({ id: pid, ep: id, place: pid, x: pl.x, z: pl.z, r: pl.r || 60, line: beatLine(rec) });
      }
    }
    return out;
  }

  // --- prints (a picture's matches against the layer's photo targets, kept per print) ---------------------------------
  print(recId, matches = []) {
    if (!this.live || recId == null || !matches.length) return false;
    const d = this.doc, P = d.$prints || (d.$prints = {});
    P[recId] = [...new Set([...(P[recId] || []), ...matches])];
    this.dirty();
    this.emit('page', { print: recId, matches });
    return true;
  }
  prints(match) { const P = (this.doc && this.doc.$prints) || {}; return Object.keys(P).filter((k) => P[k].includes(match)).map(Number); }
  matchesOf(recId) { const P = (this.doc && this.doc.$prints) || {}; return P[recId] || []; }

  // --- the page (stories.js) ---------------------------------------------------------------------------------------------
  page(id) {
    const rec = this.recs.get(id); if (!rec || !this.started(id)) return null;
    const st = this.st(id) || {}, lines = [];
    for (const p of rec.page || []) if (this.when(p.when)) { const w = this.words(p.text); if (w && !lines.includes(w)) lines.push(w); }
    const end = this.ended(id) ? this.words(st.last || ((rec.ends || []).find((e) => e.id === this.story.get(`ep.${id}.end`)) || {}).line) : null;
    const first = this.ended(id) && rec.first ? (this.words(rec.first) || '').replace(/^First stamped:\s*/i, '') || null : null;
    const title = ((rec.titles || []).find((t) => this.when(t.when)) || {}).title || rec.title || id;
    const prints = (rec.pins || []).flatMap((m) => this.prints(m));
    return { id, title, kind: rec.kind, lines, end, first, prints, since: st.at ?? null };
  }
  pages() { if (!this.live) return []; return this.records().filter((r) => r.kind !== 'arc' && this.started(r.id)).sort((a, b) => (this.st(a.id).at || 0) - (this.st(b.id).at || 0)).map((r) => this.page(r.id)).filter(Boolean); }
}

export const episodes = new Episodes();
