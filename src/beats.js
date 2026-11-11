// The director, Round 1's part (docs/build/campaign-design.md §12; stream T: the re-hooks and the push budget only; the
// day's beat, climax spacing and stall relief are stream D's, Round 2). Loaded only under STORY_ON.
//
// Only these stops are story-initiated, and every one goes through push(): Tauno's porch (once, plus R3), the re-hooks
// (R1–R9, each once ever: its rehook.<id> fact), Josie's R1/R1b, the counter notes and the staged menace (later rounds).
// The budget: at most one push a trip; at most one per three trips unless the player engaged in the last two (a door
// taken, an `asked.*`, a story topic chosen, talking with a named person, a notebook page read).
//
//   beats.attach(story) (story.beats = beats: the rules' push: true goes through it)
//   beats.can(id) → bool         would a push go now (nothing spent: a slot asks before it stages anyone)
//   beats.push(rule | id) → bool spends it when it goes; refused pushes are logged (why)
//   beats.engage(why)            an engagement this trip (feed-talk.js and the fact listener call it)
//   beats.state() → { pushes, engaged, trip }    beats.log (the last 40 asks, rigs)
export const PACE = {
  fallbackEveryDays: 2, climaxGapTrips: 1, rehookPerTrip: 1, ringsPerTalk: 2, setPiecePerTrip: 1,
  pushBudget: { per: 3, trips: 1, unlessEngagedWithin: 2 },
  stallTrips: 4, episodeIdleTrips: 4, climaxWindowDays: 14, ambientShare: 0.25,
};
// the facts that are the player engaging (§12 lint: f:door.*.taken | f:asked.* | f:<cast>.talk | f:nb.read.k)
const ENGAGE = /^(door\.[a-z]+\.taken|asked\.|[a-z]+\.talk$|knows\.)/;

export class Beats {
  constructor() { this.story = null; this.log = []; this.offs = []; }
  attach(story) {
    this.detach();
    this.story = story;
    if (story) {
      story.beats = this;
      this.offs.push(story.on('fact', ({ key }) => { if (ENGAGE.test(key)) this.engage(`fact:${key}`); }));
      this.offs.push(story.on('read', () => this.engage('read')));
      this.offs.push(story.on('topic', () => this.engage('topic')));
    }
    return this;
  }
  detach() { for (const o of this.offs) { try { o(); } catch { /* gone */ } } this.offs = []; }
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
    this.log.push({ id, trip: this.trip(), ...r }); if (this.log.length > 40) this.log.shift();
    if (!r.ok) return false;
    const D = this.dir, t = this.trip();
    const last = D.pushes[D.pushes.length - 1];
    if (!(last && last.trip === t && last.id === id)) { D.pushes.push({ id, trip: t, abs: this.story.time().abs }); if (D.pushes.length > 40) D.pushes.shift(); this.story.dirty(); }
    return true;
  }
  state() { const D = this.dir; return D ? { pushes: D.pushes.slice(), engaged: D.engaged.slice(), trip: this.trip() } : null; }
}

export const beats = new Beats();
