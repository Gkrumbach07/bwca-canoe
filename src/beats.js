// The director (docs/build/campaign-design.md §12, "never forced, never stuck"; bible 6.1). Round 1 (stream T) built the
// re-hooks and the push budget; Round 2 (stream D) adds the day's beat, climax spacing, stall relief, the set-piece cap
// and the trip's story line and pay. Loaded only under STORY_ON (main.js st-t imports it; feed-beats.js wires it to the
// world). No game imports: scripts/c2-director-unit.mjs runs it in Node.
//
// The push budget (Round 1). Only these stops are story-initiated, and every one goes through push(): Tauno's porch
// (once, plus R3), the re-hooks (R1–R9, each once ever: its rehook.<id> fact), Josie's R1/R1b, the counter notes and the
// staged menace (later rounds), and (Round 2) stall relief's rumour at a counter (STOPS below). The budget: at most one
// push a trip; at most one per three trips unless the player engaged in the last two (a door taken, an `asked.*`, a story
// topic chosen, talking with a named person, a notebook page read).
//
//   beats.attach(story) (story.beats = beats: the rules' push: true goes through it)
//   beats.can(id) → bool         would a push go now (nothing spent: a slot asks before it stages anyone)
//   beats.push(rule | id) → bool spends it when it goes; refused pushes are logged (why)
//   beats.engage(why)            an engagement this trip (feed-talk.js and the fact listener call it)
//   beats.state() → { pushes, engaged, trip }    beats.log (the last 40 asks, rigs)
//
// Round 2 (stream D):
//   The day's beat. At 19:00 on a trip day with no story beat yet (no fact, notebook mark or Walt line that day), the
//   director may offer one small beat, said by a party camped at the next site (the only voice a trip day has: the book
//   gives no tell, 10 §11), in §12's order: (0) a held climax's person named in a rumour; (1) a Walt place within the
//   day's travel whose entry is not yet read there; (2) the trip's outfitter's beats (beats-by-outfitter.js) whose place
//   stands in the layer; (3) an open episode's place (episodes.places(), stream E); (4) fallback lore: a scheduled
//   party's line, from the Walt pool after nb.found (the history pool before it, or while the porch or the door is
//   declined with no door taken), never two trip days running. A beat never carries a key; quiet days are allowed.
//     rule d.evening (on trip:evening, feed-beats.js) → beat:day → beats.offerDay() → the armed line
//     partyCamps (storyHook.line) → beats.partyLine(party, how) → the line, once, by the party it was armed for
//   Climax spacing. beats.climax(arc, rec?) → { ok, why }: an arc's climax passes only if no other arc's climax opened
//     this trip or the last; one whose window closes within PACE.climaxWindowDays goes ahead. A held climax isn't silent:
//     the day's beat names its person (a party's rumour; a keeper's line at the next counter when no party line fits).
//     The sensor `climax:<arc>` reads the same for a rule; `door.<arc>.climax` facts (or beats.climaxOpened(arc)) open it.
//   Stall relief. Engaged (stage ≥ S3) with no new fact for PACE.stallTrips trips: one rumour at the next counter names
//     the least-explored lock's people-key person (STALL), once per lock, through the push budget (stop stall.<lock>).
//     rule d.counter (on store:enter) → beat:stall; ambient.front → beats.counterLine('rumour', { ep }) (npcs' word pool)
//   beats.setPiece(id) → bool       at most one set piece a trip (R's run, F's camp, E's minigames ask first)
//   beats.quiet(reason, on = true)  no beats while any reason holds (R's run; S6 is quiet by itself)
//   The trip's story (record.js d-blocks read these off the story):
//     story.tripLine({ all }?) → the trip card's story line (the `card:<text id>` actions of this trip, in order)
//     story.tripBeats() → [{ abs, what: [...] }] the trip's days with a story beat ("story beats found this trip")
//     story.tallyLines({ trip }) → [{ id, title, pay, kind: 'story' }] the `pay:` lines owed, paid into the purse now
//   Actions handled here: beat:day | beat:stall | beat:tripend · card:<text id> · pay:<amount> <text id | words>
import { compile } from './story-cond.js';
import { T, texts } from './topics.js';
import { ambient, WALT_LORE, BANNED } from './ambient.js';
import { BEATS, beatsOf, offerable, DOORS } from './beats-by-outfitter.js';
import { LOCKS } from './story-data/locks.js';

export const PACE = {
  fallbackEveryDays: 2, climaxGapTrips: 1, rehookPerTrip: 1, ringsPerTalk: 2, setPiecePerTrip: 1,
  pushBudget: { per: 3, trips: 1, unlessEngagedWithin: 2 },
  stallTrips: 4, episodeIdleTrips: 4, climaxWindowDays: 14, ambientShare: 0.25,
};
// the director's own measures (stream D)
export const DIR = {
  hour: 19,          // the day's beat is weighed at this hour of a trip day (§12)
  reachM: 6000,      // m: "within the day's travel": a place this near any point of today's track (or the player now)
  partyR: 4000,      // m: "the next site": a party camped this near the player at the evening
  sameLakeR: 2500,   // m: a place's voice is a party on its lake (by name or id), else one camped this near it
  until: 12,         // the armed line waits until this hour the next day, then lapses (the day stays quiet)
  keepTrips: 12,     // trip records kept
  keepDays: 40,      // trip days kept (the fallback's rate)
};
// the facts that are the player engaging (§12 lint: f:door.*.taken | f:asked.* | f:<cast>.talk | f:nb.read.k)
const ENGAGE = /^(door\.[a-z]+\.taken|asked\.|[a-z]+\.talk$|knows\.)/;

// the stops D stages (the push-budget lint reads these: each pushes, and its `when` carries an engagement atom)
export const STOPS = [
  { id: 'stall', at: 'counter', push: 'stall.<lock>', when: 'stage>=S3 & f:tauno.talk', doc: '§12 stall relief: a rumour at the next counter, once per lock' },
];
// stall relief's lines: only existing lines that name the person (doc gaps: no per-lock rumour is written yet; 30 §9's
// Farm lines and 70 §8). `ep`: a keeper's own line, said only at that counter; none: any counter whose condition holds
export const STALL = {
  L1: { person: 'tauno', name: /\bTauno\b/, lines: [{ id: '70.6.3.1', eps: [31, 25] }, { id: '70.8.1.5', ep: 31 }, { id: '30:9.farm.1', ep: 31 }] },
  L2: { person: 'mary', name: /\b(Mary|Hap)\b/, lines: [{ id: '70.8.1.6', ep: 31, who: 'mary' }, { id: '70.8.2.5', ep: 25, who: 'hap' }, { id: '70.8.8.4', ep: 6, who: 'hap' }] },
  L3: { person: 'bob', name: /\b(Walt's bunch|the guys|Bob|Frank)\b/i, lines: [{ id: '70.6.3.3', eps: [38] }, { id: '70.8.3.5', ep: 38 }] },
  L4: { person: 'aili', name: /\bAili\b/, lines: [{ id: '70.8.9.4', ep: 12 }] },
};
// a held climax's person, named (the same rule: existing lines only). An arc's record may bring its own (beats.climax)
export const CLIMAX = {
  mining: { person: 'tauno', rumour: [{ id: '70.6.3.1', eps: [31, 25] }, { id: '70.8.1.5', ep: 31 }, { id: '30:9.farm.1', ep: 31 }] },
  guiding: { person: 'hap', rumour: [{ id: '70.8.2.5', ep: 25 }, { id: '70.8.8.4', ep: 6 }] },
  boys: { person: 'bob', rumour: [{ id: '70.6.3.3', eps: [38] }, { id: '70.8.3.5', ep: 38 }] },
  family: { person: 'aili', rumour: [{ id: '70.8.9.4', ep: 12 }] },
};
// a keeper's own line is said at that counter (70 §8's speakers; 30 §9's Farm keeper)
const KEEPER_EP = { 'Ruth Aho': 31, 'Gus Lindgren': 25, 'Bev Kangas': 38, 'Arvid Strand': 51, 'Lise Thibodeau': 64, 'Leon Zupancic': 16, 'Hal Vukelich': 1,
  'Joanne Perko': 6, 'René Belanger': 12, 'Myrna Sether': 36, 'Merle Ostrom': 40, 'Inga Bratvold': 49, 'Norm Kovach': 67, 'Thea Lundeen': 69 };
// the day's beat's place lines (70 §9): a starred site; a nickname lake (an old local); Bald Eagle's west shore (S2+)
const PLACE_LINE = { site: '70.9.1', nick: '70.9.2', crews: '70.9.5' };
const OLD_LOCAL = ['pair', 'solo'];
// fallback lore in Farm's reach (30 §9 "The day's beat in Farm's reach"): the history side (the Walt side's "white rock on
// a stump at a site on Bald Eagle" waits: walt-sites.js leaves C902 unstarred, so no stone stands there to find)
export const FARM_LORE = [{ id: '30:9.beat.1', eps: [31] }, { id: '30:9.beat.3', eps: [31] }, { id: '30:9.beat.4', eps: [31] }];

const hashS = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const nbsOf = (pl) => { const out = new Set(); for (const n of [].concat(pl.nb || [])) if (n) out.add(n); for (const t of pl.triggers || []) if (t.on === 'readHere' && t.nb) out.add(t.nb); return [...out]; };
const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) <= r;
const sameLake = (pl, party) => (pl.lakeId && party.lakeId ? pl.lakeId === party.lakeId : pl.lake && party.lake ? pl.lake === party.lake : near(pl, party, DIR.sameLakeR));

export class Beats {
  constructor() { this.story = null; this.log = []; this.offs = []; this.world = null; this.arcs = new Map(); this.quiets = new Set(); }
  attach(story) {
    this.detach();
    this.story = story;
    if (story) {
      story.beats = this;
      this.offs.push(story.on('fact', ({ key }) => { if (ENGAGE.test(key)) this.engage(`fact:${key}`); }));
      this.offs.push(story.on('read', () => this.engage('read')));
      this.offs.push(story.on('topic', () => this.engage('topic')));
      // d: the trip's story (the beats found, the card's line), climaxes opened, the actions D takes
      for (const evt of ['fact', 'read', 'nb:here', 'nb:understood', 'walt:line']) this.offs.push(story.on(evt, (d) => this.noteBeat(evt, d)));
      this.offs.push(story.on('fact', ({ key }) => { const m = /^door\.([\w-]+)\.climax$/.exec(key); if (m) this.climaxOpened(m[1]); }));
      this.offs.push(story.on('trip:start', (d) => this.tripStart(d)));
      this.offs.push(story.on('trip:end', (d) => this.tripEnd(d)));
      if (typeof story.handle === 'function') {
        this.offs.push(story.handle('beat', (arg, meta) => this.beatAction(arg, meta)));
        this.offs.push(story.handle('card', (arg) => this.card(arg)));
        this.offs.push(story.handle('pay', (arg, meta) => this.pay(arg, meta)));
      }
      if (typeof story.sensor === 'function') {
        this.offs.push(story.sensor('climax', (arc) => this.climax(String(arc)).ok));
        this.offs.push(story.sensor('setpiece', (id) => this.canSetPiece(String(id))));
      }
      story.tripLine = (o) => this.tripLine(o);
      story.tripBeats = () => this.tripBeats();
      story.tallyLines = (o) => this.tallyLines(o);
      // /d
    }
    return this;
  }
  detach() {
    for (const o of this.offs) { try { o(); } catch { /* gone */ } }
    this.offs = [];
    const s = this.story;
    if (s) for (const k of ['tripLine', 'tripBeats', 'tallyLines']) if (s[k]) delete s[k];
  }
  get dir() {
    const d = this.story && this.story.doc;
    if (!d) return null;
    if (!d.dir || typeof d.dir !== 'object') d.dir = {};
    if (!Array.isArray(d.dir.pushes)) d.dir.pushes = [];
    if (!Array.isArray(d.dir.engaged)) d.dir.engaged = [];
    return d.dir;
  }
  trip() { return this.story ? this.story.tripN() : 0; }
  engage(why = '?') {
    const D = this.dir; if (!D || this.story.mode === 'mirror') return;
    const t = this.trip();
    if (!D.engaged.includes(t)) { D.engaged.push(t); if (D.engaged.length > 20) D.engaged.shift(); this.story.dirty(); }
    void why;
  }
  // the budget's answer, and why
  check(id) {
    const D = this.dir; if (!D) return { ok: false, why: 'no story' };
    if (this.story.mode === 'mirror') return { ok: false, why: 'mirror' };
    const t = this.trip(), last = D.pushes.length ? D.pushes[D.pushes.length - 1] : null, B = PACE.pushBudget;
    if (last && last.trip === t && last.id !== id) return { ok: false, why: `one push a trip (${last.id} this trip)` };
    if (last && last.trip === t && last.id === id) return { ok: true, why: 'the same push again this trip' }; // (a re-staging of the same stop)
    if (!last) return { ok: true, why: 'the first push' };
    if (D.engaged.some((e) => t - e <= B.unlessEngagedWithin && e <= t)) return { ok: true, why: 'engaged in the last two trips' };
    if (t - last.trip >= B.per) return { ok: true, why: `${t - last.trip} trips since the last` };
    return { ok: false, why: `budget: ${t - last.trip} of ${B.per} trips since ${last.id}` };
  }
  can(id) { return this.check(String(id)).ok; }
  push(rule, args) {
    void args;
    const id = String(rule && typeof rule === 'object' ? rule.push && rule.push !== true ? rule.push : rule.id : rule);
    const r = this.check(id);
    this.note({ id, trip: this.trip(), ...r });
    if (!r.ok) return false;
    const D = this.dir, t = this.trip();
    const last = D.pushes[D.pushes.length - 1];
    if (!(last && last.trip === t && last.id === id)) { D.pushes.push({ id, trip: t, abs: this.story.time().abs }); if (D.pushes.length > 40) D.pushes.shift(); this.story.dirty(); }
    return true;
  }
  state() { const D = this.dir; return D ? { pushes: D.pushes.slice(), engaged: D.engaged.slice(), trip: this.trip() } : null; }
  note(row) { this.log.push(row); if (this.log.length > 40) this.log.shift(); }

  // =====================================================================================================================
  // d: stream D (Round 2)
  live() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror'); }
  today() { return this.story.time().abs; }
  hours() { return this.story.time().hours || 0; }
  onTrip() { const s = this.story, tr = s && s.ctx && s.ctx.trip; return tr ? !!tr.active : !!(this.dir && this.dir.cur && !this.dir.cur.ended); }
  text(id) { return T(id); }
  entry(id) { try { return texts.entry(id); } catch { return null; } }
  holds(id, args = {}) { const e = this.entry(id), c = e && e.cond; if (!c) return true; return !!this.story.when(c, args); }
  quiet(reason = 'quiet', on = true) { if (on) this.quiets.add(String(reason)); else this.quiets.delete(String(reason)); return this.quiets.size > 0; }
  quieted() { if (this.quiets.size) return [...this.quiets].join(', '); if (this.story && this.story.stageN >= 6) return 'the run (S6)'; return null; }

  // --- the trip's record: the days with a beat, the card's lines --------------------------------------------------------
  cur() {
    const D = this.dir; if (!D) return null;
    const n = this.trip();
    if (!D.cur || (this.onTrip() && D.cur.n !== n)) this.tripStart({ n });
    return D.cur;
  }
  tripStart({ n } = {}) {
    const D = this.dir; if (!D || !this.live()) return;
    if (D.cur && !D.cur.ended && D.cur.n === (n ?? this.trip())) return;
    if (D.cur) this.keepTrip(D.cur);
    D.cur = { n: n ?? this.trip(), abs0: this.today(), days: {}, cards: (D.cards || []).splice(0), ended: false };
    D.cards = [];
    this.story.dirty();
  }
  tripEnd() {
    const D = this.dir; if (!D || !this.live() || !D.cur) return;
    D.cur.ended = true; D.cur.abs1 = this.today();
    if (D.armed && D.armed.trip === D.cur.n) { this.note({ lapse: D.armed.id, why: 'the trip ended' }); D.armed = null; }
    this.story.dirty();
  }
  keepTrip(c) { const D = this.dir; if (!Array.isArray(D.trips)) D.trips = []; if (!D.trips.some((q) => q.n === c.n)) D.trips.push(c); if (D.trips.length > DIR.keepTrips) D.trips.shift(); }
  noteBeat(evt, d = {}) {
    if (!this.live() || !this.onTrip()) return;
    if (evt === 'fact' && /^legacy\./.test(d.key || '')) return;
    const c = this.cur(); if (!c) return;
    const k = this.today(), what = evt === 'fact' ? `f:${d.key}` : `${evt}:${d.id ?? ''}`;
    const L = c.days[k] || (c.days[k] = []);
    if (!L.includes(what) && L.length < 12) { L.push(what); this.story.dirty(); }
  }
  beatToday() { const c = this.dir && this.dir.cur; return !!(c && !c.ended && c.days[this.today()] && c.days[this.today()].length); }
  tripLine({ all = false } = {}) { const c = this.dir && this.dir.cur; const L = c ? c.cards.map((q) => q.text).filter(Boolean) : []; return all ? L : L[0] || null; }
  tripBeats() { const c = this.dir && this.dir.cur; return c ? Object.entries(c.days).filter(([, w]) => w.length).map(([abs, what]) => ({ abs: +abs, what: what.slice() })) : []; }
  card(id) {
    const D = this.dir; if (!D || !this.live()) return false;
    const text = this.text(id);
    if (!text) { this.note({ card: id, why: 'no text' }); return false; }
    const c = this.onTrip() ? this.cur() : null, L = c ? c.cards : (D.cards || (D.cards = []));
    if (!L.some((q) => q.id === id)) L.push({ id, text });
    this.story.dirty();
    return true;
  }
  // pay:<amount> <text id | words>: owed now, paid at the trip-end tally with its line
  pay(arg, meta = {}) {
    const D = this.dir; if (!D || !this.live()) return false;
    const m = /^\s*(-?\d+(?:\.\d+)?)\s+(.+)$/.exec(String(arg || ''));
    if (!m) { this.note({ pay: arg, why: 'not "<amount> <line>"' }); return false; }
    const line = m[2].trim(), text = this.text(line) || line;
    if (!Array.isArray(D.pay)) D.pay = [];
    D.pay.push({ amt: +m[1], line, text, trip: this.trip(), abs: this.today(), rule: meta.rule || null, paid: false });
    this.story.dirty();
    return true;
  }
  tallyLines() {
    const D = this.dir; if (!D || !this.live() || !Array.isArray(D.pay)) return [];
    const out = [], prof = this.story.profile || (this.story.ctx && this.story.ctx.profile) || null;
    D.pay.forEach((p, i) => {
      if (p.paid) return;
      p.paid = true; p.paidAbs = this.today();
      if (p.amt > 0 && prof && typeof prof.earn === 'function') { try { prof.earn(p.amt, 'story'); } catch (e) { console.warn('beats: pay', e); } }
      out.push({ id: `story:${p.rule || i}:${p.abs}`, title: p.text, pay: p.amt, kind: 'story', from: null });
    });
    if (D.pay.length > 40) D.pay = D.pay.filter((p) => !p.paid || this.today() - p.paidAbs < 60);
    if (out.length) this.story.dirty();
    return out;
  }

  // --- the actions the rules hand D ----------------------------------------------------------------------------------
  beatAction(arg, meta = {}) {
    const a = meta.args || {};
    if (arg === 'day') return !!this.offerDay();
    if (arg === 'stall') return !!this.stallCheck(a);
    if (arg === 'tripend') { this.tripEnd(a); return true; }
    this.note({ beat: arg, why: 'unknown' });
    return false;
  }

  // --- set pieces ----------------------------------------------------------------------------------------------------
  canSetPiece(id) { const D = this.dir; if (!D || !this.live()) return false; const t = this.trip(), L = D.sets || []; return !L.some((q) => q.trip === t && q.id !== id); }
  setPiece(id) {
    if (!this.canSetPiece(id)) { this.note({ setPiece: id, ok: false, why: 'one set piece a trip' }); return false; }
    const D = this.dir, t = this.trip();
    if (!Array.isArray(D.sets)) D.sets = [];
    if (!D.sets.some((q) => q.trip === t && q.id === id)) { D.sets.push({ trip: t, id }); if (D.sets.length > 20) D.sets.shift(); this.story.dirty(); }
    return true;
  }

  // --- climax spacing --------------------------------------------------------------------------------------------------
  climaxes() {
    const D = this.dir, out = (D && Array.isArray(D.climaxes) ? D.climaxes : []).map((q) => ({ ...q }));
    for (const [k] of this.story.keys('door.')) {
      const m = /^door\.([\w-]+)\.climax$/.exec(k); if (!m || out.some((q) => q.arc === m[1])) continue;
      const f = this.story.fact(k); out.push({ arc: m[1], trip: f ? f.trip : 0 });
    }
    return out;
  }
  climaxOpened(arc) {
    const D = this.dir; if (!D || !this.live()) return false;
    if (!Array.isArray(D.climaxes)) D.climaxes = [];
    if (D.climaxes.some((q) => q.arc === arc)) return false;
    D.climaxes.push({ arc, trip: this.trip(), abs: this.today() });
    if (D.held) delete D.held[arc];
    this.story.dirty();
    return true;
  }
  arc(arc) { return this.arcs.get(arc) || CLIMAX[arc] || null; }
  windowLeft(arc) {
    const r = this.arc(arc); if (!r || r.window == null) return null;
    let w = r.window;
    try { if (typeof w === 'function') w = w(this.story); } catch { w = null; }
    if (w == null) return null;
    const close = typeof w === 'object' ? (Number.isFinite(w.abs) ? w.abs : Number.isFinite(w.days) ? this.today() + w.days : null) : Number(w);
    return Number.isFinite(close) ? close - this.story.nowAbs() : null;
  }
  climax(arc, rec = null) {
    if (rec && typeof rec === 'object') this.arcs.set(arc, { ...(this.arc(arc) || {}), ...rec });
    const D = this.dir; if (!D) return { ok: false, why: 'no story' };
    if (this.story.mode === 'mirror') return { ok: false, why: 'mirror' };
    const t = this.trip(), opened = this.climaxes();
    if (opened.some((q) => q.arc === arc)) return { ok: true, why: 'opened already' };
    const close = opened.filter((q) => q.arc !== arc && t - q.trip <= PACE.climaxGapTrips && t >= q.trip);
    if (!close.length) return { ok: true, why: 'spacing holds' };
    const left = this.windowLeft(arc);
    if (left != null && left <= PACE.climaxWindowDays) return { ok: true, why: `its window closes in ${Math.max(0, Math.round(left))} days: ahead of spacing` };
    if (!D.held || typeof D.held !== 'object') D.held = {};
    if (D.held[arc] == null) { D.held[arc] = t; this.story.dirty(); }
    return { ok: false, why: `spacing: ${close[0].arc}'s climax opened on trip ${close[0].trip}`, held: true };
  }
  heldArcs() { const D = this.dir; if (!D || !D.held) return []; const open = new Set(this.climaxes().map((q) => q.arc)); return Object.keys(D.held).filter((a) => !open.has(a)); }

  // --- the day's beat ------------------------------------------------------------------------------------------------
  eveningDue(abs) { const D = this.dir; return !!(D && this.live() && D.evening !== abs); }
  markEvening(abs) { const D = this.dir; if (D) { D.evening = abs; this.story.dirty(); } }
  ctx() { try { return (this.world && typeof this.world.ctx === 'function' ? this.world.ctx() : this.world) || {}; } catch (e) { console.warn('beats: the world', e); return {}; } }
  declined() { const s = this.story, taken = s.keys('door.').some(([k]) => /\.taken$/.test(k)); return !taken && (s.porch === 'declined2' || s.door('crews') === 'declined'); }
  // where a line may be said: a party's kind, the trip's outfitter (a line's region), its own condition (a party: never home)
  fits(row, party, host) {
    if (row.kinds && party && !row.kinds.includes(party.kind)) return false;
    if (row.eps && host != null && !row.eps.includes(Number(host))) return false;
    if (row.eps && host == null) return false;
    const text = this.text(row.id); if (!text || BANNED.test(text)) return false;
    return this.holds(row.id, { home: false });
  }
  inReach(pl, cx) {
    const pts = [...(cx.track || []), ...(cx.player ? [cx.player] : [])];
    return Number.isFinite(pl.x) && pts.some((p) => near(pl, p, DIR.reachM));
  }
  // the candidates, in §12's order; → { kind, id, line, text, party, why } | { none: why }
  dayBeat(cx = this.ctx()) {
    if (!this.live()) return { none: 'no story' };
    const q = this.quieted(); if (q) return { none: `quiet: ${q}` };
    if (!this.onTrip()) return { none: 'not a trip day' };
    if (this.beatToday()) return { none: 'a story beat today already' };
    const parties = (cx.parties || []).slice().sort((a, b) => (a.d ?? 0) - (b.d ?? 0));
    if (!parties.length) return { none: 'no party at the next site' };
    const s = this.story, D = this.dir, t = this.trip(), abs = this.today(), host = cx.host ?? null, offered = D.offered || {};
    const said = new Set(D.lines || []);
    const voice = (pl, kinds) => parties.find((p) => (!kinds || kinds.includes(p.kind)) && (!pl || sameLake(pl, p))) || null;
    const make = (kind, id, line, party, why, extra = {}) => ({ kind, id, line, text: this.text(line), party: party ? String(party.id) : null, partyKind: party ? party.kind : null, why, ...extra });
    // (0) a held climax: its person, named (a party's rumour; else the next counter, beats.counterLine)
    for (const arc of this.heldArcs()) {
      if ((D.heldSaid || {})[arc] === t) continue;
      const r = this.arc(arc) || {};
      for (const row of r.rumour || []) {
        const id = typeof row === 'string' ? row : row.id, e = this.entry(id);
        if ((e && e.who) || (typeof row === 'object' && row.ep != null)) continue; // (a keeper's own words: the counter's)
        const p = parties[0]; if (!p || !this.fits({ id, eps: typeof row === 'object' ? row.eps : null }, p, host)) continue;
        return make('climax', `climax.${arc}`, id, p, `${arc}'s climax held: its person named`, { arc });
      }
    }
    // (1) a Walt place within the day's travel, its entry not read there yet
    if (s.has('nb.found')) {
      const places = (cx.places || []).filter((pl) => pl && pl.id && this.inReach(pl, cx) && !offered[pl.id]);
      places.sort((a, b) => this.distTo(a, cx) - this.distTo(b, cx));
      for (const pl of places) {
        const nbs = nbsOf(pl).filter((nb) => !s.nbHas('here', nb));
        if (!nbs.length) continue;
        const line = pl.kind === 'site' ? PLACE_LINE.site : pl.id === 'crews.landing' ? PLACE_LINE.crews : pl.nick ? PLACE_LINE.nick : null;
        if (!line || !this.holds(line, { home: false })) continue;
        const p = voice(pl, line === PLACE_LINE.nick ? OLD_LOCAL : null);
        if (p) return make('walt', pl.id, line, p, `a Walt place in reach (${nbs.join(', ')} not read there)`, { place: pl.id, nb: nbs[0] });
      }
    }
    // (2) the trip's outfitter's beats (bible 6.1), their place in the layer and in reach
    const hasPlace = typeof cx.hasPlace === 'function' ? cx.hasPlace : (id) => (cx.places || []).some((pl) => pl.id === id);
    const placeOf = (id) => (cx.places || []).find((pl) => pl.id === id) || (typeof cx.place === 'function' ? cx.place(id) : null);
    for (const b of host != null && s.has('nb.found') ? beatsOf(host) : []) { // (Walt's places mean nothing before the notebook)
      if (!offerable(b) || offered[b.id] || !hasPlace(b.place)) continue;
      const pl = placeOf(b.place); if (!pl || !this.inReach(pl, cx)) continue;
      if (b.nb && s.nbHas('here', b.nb)) continue;
      if (!this.holds(b.line, { home: false })) continue;
      const p = voice(pl, b.kinds || null);
      if (p) return make('outfitter', b.id, b.line, p, `${b.what} (Outfitter ${b.ep})`, { place: b.place });
    }
    // (3) an open episode's place (stream E: episodes.places())
    for (const ep of cx.episodes || []) {
      if (!ep || !ep.id || (D.epSaid || {})[ep.id] === t) continue;
      if (Number.isFinite(ep.x) && !this.inReach(ep, cx)) continue;
      const line = ep.line || null; if (!line || !this.text(line) || !this.holds(line, { home: false })) continue;
      const p = ep.lake || ep.lakeId ? voice(ep, ep.kinds || null) : parties.find((x) => !ep.kinds || ep.kinds.includes(x.kind));
      if (p) return make('episode', `ep.${ep.id}`, line, p, `an open episode's place (${ep.id})`, { episode: ep.id });
    }
    // (4) fallback lore, never two trip days running
    const days = (D.tripDays || []).filter((d) => d < abs), prev = days.length ? days[days.length - 1] : null;
    const prevSaid = prev != null && D.said && D.said[prev] && D.said[prev].fallback;
    if (prevSaid) return { none: 'fallback: not two trip days running' };
    const walt = s.has('nb.found') && !this.declined();
    const pools = walt ? ['lore', 'history'] : ['history'];
    for (const pool of pools) {
      for (const p of parties) {
        const L = this.lorePool(pool, p, host).filter((r) => !said.has(r.id));
        if (!L.length) continue;
        const r = L[hashS(`${abs}:${p.id}:${pool}`) % L.length];
        return make('lore', `lore.${pool}`, r.id, p, `fallback lore (${pool === 'lore' ? 'the Walt pool' : 'the history pool'})`, { pool, fallback: true });
      }
      if (pool === 'lore') continue; // (no Walt line holds for anyone here: the history pool)
    }
    return { none: 'nothing fits: a quiet day' };
  }
  distTo(pl, cx) { const p = cx.player || (cx.track && cx.track[cx.track.length - 1]); return p ? Math.hypot(pl.x - p.x, pl.z - p.z) : 0; }
  // the fallback's pools for a party (ambient.js 'lore' and 'history'; 30 §9's Farm lines in Farm's reach)
  lorePool(pool, party, host) {
    const ctx = { kind: party.kind, host, home: false };
    let L = [];
    try { L = ambient.lines(pool, ctx).map((l) => ({ id: l.id, walt: l.walt })); } catch { L = []; }
    if (pool === 'history') for (const r of FARM_LORE) if (this.fits(r, party, host)) L.push({ id: r.id, walt: false });
    // never Walt lore before the notebook, nor in the history pool at all
    return L.filter((r) => { const t = this.text(r.id); return t && (pool === 'lore' ? this.story.has('nb.found') : !WALT_LORE.test(t)); });
  }
  // at the evening (rule d.evening): weigh and arm the day's beat
  offerDay(cx = this.ctx()) {
    const D = this.dir; if (!D || !this.live()) return null;
    const abs = this.today();
    if (this.onTrip()) { if (!Array.isArray(D.tripDays)) D.tripDays = []; if (!D.tripDays.includes(abs)) { D.tripDays.push(abs); if (D.tripDays.length > DIR.keepDays) D.tripDays.shift(); } }
    D.evening = abs;
    const b = this.dayBeat(cx);
    this.note({ day: abs, ...b });
    if (b.none) { this.story.dirty(); return null; }
    D.armed = { abs, trip: this.trip(), kind: b.kind, id: b.id, line: b.line, text: b.text, party: b.party, partyKind: b.partyKind, until: abs + 1 + DIR.until / 24, fallback: !!b.fallback, arc: b.arc || null, episode: b.episode || null, place: b.place || null };
    if (b.place) (D.offered || (D.offered = {}))[b.kind === 'outfitter' ? b.id : b.place] = abs;
    if (b.arc) (D.heldSaid || (D.heldSaid = {}))[b.arc] = this.trip();
    if (b.episode) (D.epSaid || (D.epSaid = {}))[b.episode] = this.trip();
    this.story.dirty();
    this.story.emit('beat:armed', { ...D.armed });
    return D.armed;
  }
  // a party met (party-camps.js: a greeting as you pass, or E on one of them): the armed line, by its party, once; else
  // (E only) one story line in four from the party pool (70 §7.2 by kind, §6.3's word at their fire), once a visit
  partyLine(party, how = 'word') {
    const D = this.dir; if (!D || !this.live() || !party) return null;
    if (this.quieted()) return null;
    const now = this.story.nowAbs(), A = D.armed;
    if (A && now > A.until) { this.note({ lapse: A.id, why: 'nobody met at the next site' }); D.armed = null; this.story.dirty(); }
    const B = D.armed, pid = String(party.id);
    if (B && B.party === pid && B.text) {
      D.armed = null;
      if (!D.said || typeof D.said !== 'object') D.said = {};
      D.said[B.abs] = { kind: B.kind, id: B.id, line: B.line, fallback: B.fallback, party: pid, at: +now.toFixed(3) };
      const ks = Object.keys(D.said).map(Number).sort((a, b) => a - b); while (ks.length > DIR.keepDays) delete D.said[ks.shift()];
      if (!Array.isArray(D.lines)) D.lines = [];
      if (!D.lines.includes(B.line)) D.lines.push(B.line);
      (D.party || (D.party = {}))[`${pid}:${this.today()}`] = true;
      this.noteBeat('beat', { id: B.id });
      this.note({ said: B.id, line: B.line, party: pid, how });
      this.story.dirty();
      this.story.emit('beat:said', { ...D.said[B.abs], abs: B.abs });
      return B.text;
    }
    if (how !== 'word') return null;
    const key = `${pid}:${this.today()}`;
    if ((D.party || {})[key]) return null;
    (D.party || (D.party = {}))[key] = true;
    const ks = Object.keys(D.party); if (ks.length > 60) for (const k of ks.slice(0, ks.length - 60)) delete D.party[k];
    if (hashS(key) / 4294967296 >= PACE.ambientShare) return null;
    let L = [];
    try { L = ambient.lines('party', { kind: party.kind, home: false }); } catch { L = []; }
    L = L.filter((l) => !(D.lines || []).includes(l.id));
    if (!L.length) return null;
    const l = L[hashS(`${key}:party`) % L.length];
    if (l.once) ambient.said(l.id);
    this.story.dirty();
    return l.text;
  }

  // --- stall relief and a held climax's counter line ----------------------------------------------------------------------
  lastFactTrip() { let t = 0; const d = this.story.doc; for (const [k, r] of Object.entries(d.facts || {})) if (!/^legacy\./.test(k) && r[3] > t) t = r[3]; return t; }
  stalled() {
    const D = this.dir; if (!D) return false;
    const st = D.stall || {}, last = Math.max(this.lastFactTrip(), st.last || 0);
    return this.story.stageN >= 3 && this.trip() - last >= PACE.stallTrips;
  }
  explored(L) {
    let n = 0;
    for (const k of L.keys) { if (this.story.has(`key.${k.id}`)) n += 10; const c = compile(k.when); for (const a of c.atoms || []) if (a.k === 'fact' && this.story.has(a.fact)) n++; }
    return n;
  }
  leastLock() {
    const D = this.dir, done = new Set(((D && D.stall) || {}).done || []);
    const cand = LOCKS.filter((L) => STALL[L.id] && L.keys.some((k) => k.kind === 'people') && !done.has(L.id) && !(this.story.lock(L.id) || {}).solved);
    if (!cand.length) return null;
    return cand.map((L, i) => ({ L, n: this.explored(L), i })).sort((a, b) => a.n - b.n || a.i - b.i)[0].L;
  }
  // a line of these that this counter can say now: → { id, text } | null
  counterPick(ids, ep) {
    const home = this.story.profile ? this.story.profile.home : null;
    for (const r of ids) {
      const id = typeof r === 'string' ? r : r.id, e = this.entry(id), text = this.text(id);
      if (!text) continue;
      const own = typeof r === 'object' && r.ep != null ? r.ep : e && e.who ? KEEPER_EP[e.who] : null;
      if (own != null && Number(own) !== Number(ep)) continue;
      if (typeof r === 'object' && r.eps && !r.eps.includes(Number(ep))) continue;
      if (!this.holds(id, { home: home != null && Number(home) === Number(ep), ep })) continue;
      return { id, text };
    }
    return null;
  }
  // at a counter (rule d.counter, store:enter): arm the stall rumour (or a held climax's counter line) for this counter
  stallCheck({ ep } = {}) {
    const D = this.dir; if (!D || !this.live() || ep == null) return null;
    if (this.quieted()) return null;
    if (!D.stall || typeof D.stall !== 'object') D.stall = { done: [], last: 0, armed: null };
    const S = D.stall, abs = this.today();
    if (S.armed && S.armed.staged && S.armed.abs !== abs) S.armed = null; // (said yesterday or before: gone)
    // a held climax whose person no party could name: a keeper names them at the next counter
    for (const arc of this.heldArcs()) {
      if ((D.heldSaid || {})[arc] === this.trip()) continue;
      const r = this.arc(arc) || {}, pick = this.counterPick(r.rumour || [], ep);
      if (pick) { D.counter = { kind: 'climax', arc, ep: Number(ep), abs, ...pick }; (D.heldSaid || (D.heldSaid = {}))[arc] = this.trip(); this.story.dirty(); return D.counter; }
    }
    if (!this.stalled() || (S.armed && S.armed.staged)) return null;
    const L = this.leastLock(); if (!L) return null;
    const pick = this.counterPick(STALL[L.id].lines, ep);
    if (!pick) { this.note({ stall: L.id, ep, why: 'no line of its person at this counter: the next one' }); return null; }
    if (!this.push(`stall.${L.id}`)) return null;
    S.armed = { lock: L.id, person: STALL[L.id].person, ep: Number(ep), abs, trip: this.trip(), staged: false, ...pick };
    this.story.dirty();
    return S.armed;
  }
  // ambient.front (npcs' word pool at a counter): the armed counter line for this counter, today
  counterLine(kind, ctx = {}) {
    const D = this.dir; if (!D || !this.live() || kind !== 'rumour' || ctx.ep == null) return null;
    const ep = Number(ctx.ep), abs = this.today();
    const C = D.counter; if (C && C.ep === ep && C.abs === abs) return { id: C.id, text: C.text, kind: 'story' };
    const S = D.stall && D.stall.armed;
    if (!S || S.ep !== ep || S.abs !== abs) return null;
    if (!S.staged) {
      S.staged = true;
      if (!D.stall.done.includes(S.lock)) D.stall.done.push(S.lock);
      D.stall.last = this.trip();
      this.note({ stall: S.lock, said: S.id, ep });
      this.story.dirty();
      this.story.emit('beat:stall', { lock: S.lock, person: S.person, id: S.id, ep });
    }
    return { id: S.id, text: S.text, kind: 'story' };
  }
  // for rigs and the lint
  debugState() {
    const D = this.dir || {};
    return { trip: this.trip(), quiet: this.quieted(), armed: D.armed || null, said: D.said || {}, tripDays: (D.tripDays || []).slice(), lines: (D.lines || []).slice(), held: { ...(D.held || {}) },
      climaxes: this.story ? this.climaxes() : [], sets: (D.sets || []).slice(), stall: D.stall ? JSON.parse(JSON.stringify(D.stall)) : null, counter: D.counter || null, cur: D.cur ? JSON.parse(JSON.stringify(D.cur)) : null,
      pay: (D.pay || []).slice(), offered: { ...(D.offered || {}) }, log: this.log.slice(-20) };
  }
  // /d
}

export { BEATS, DOORS };
export const beats = new Beats();
