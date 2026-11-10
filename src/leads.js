// Leads (docs/build/campaign-design.md §4): something a person or the world pointed at, one person or one place, never
// a step. Born, followed, closed, overtaken; never expired. Nothing shows a lead but three things: one Walt-page line in
// the player's hand, a topic on whoever can speak to it, and a ring only when a person draws it, a keeper is asked, or
// the player pencils the place. There is no list of open leads anywhere, and the word "lead" never appears on screen.
// Stream P, Round 1. Loaded only under STORY_ON (main.js st-p); data in story-data/leads-act1.js.
//
//   leads.attach({ story, pencil, hud?, hints? })       (main.js) the lead states live in the story doc (story.leadState)
//   leads.check()                                       born / followed / closed / overtaken, now (runs on every story
//                                                       event by itself; quiet-safe: only state, Walt lines and pencil marks)
//   leads.state(id) → null | 'open' | 'followed' | 'closed' | 'overtaken'   · leads.list() (rigs and why())
//   leads.asks(ctx = { who: 'keeper', ep, name }) → [{ id, choice, ask, say, lead }]
//       the topics a keeper can take now (T's topics.js shows them; `choice` is the player's line's text id, `ask` the
//       words when it has none yet); plus "Where would I find {name}?" for every open person lead
//   leads.ask(id, ctx = { by, ep, talk }) → { ring, said: [text ids] } | null   the keeper answers and rings (ctx.by is
//                                                       who: "Ruth"); then: its facts and Walt line. Once per season
//   leads.goto(id) → bool                               the Walt page's subject word: turns the map to the lead's ring
//                                                       only if one exists (otherwise does nothing)
//   leads.line(id) → text | null                        a lead's own Walt-page words (LINES, until the K2 anchors)
//   leads.on('born' | 'followed' | 'closed' | 'overtaken' | 'first', fn) → off
import { LEADS, ASKS, LINES, PLACES } from './story-data/leads-act1.js';

const ASKED = 'lead.asked.';
const DOOR_LEADS = new Set(['guiding', 'boys', 'family', 'mining']); // fact prefix: an ask answered (lead.asked.<id>), once a season

class Leads {
  constructor() {
    this.story = null; this.pencil = null; this.hud = null;
    this.handlers = new Map();
    this.busy = false; this.again = false;
    this.offs = [];
  }
  attach({ story = null, pencil = null, hud = null } = {}) {
    for (const off of this.offs) { try { off(); } catch { /* gone */ } }
    this.offs = [];
    Object.assign(this, { story, pencil, hud });
    if (story && typeof story.on === 'function') this.offs.push(story.on('*', (evt) => { if (!String(evt).startsWith('lead:')) this.check(); }));
    if (pencil && typeof pencil.on === 'function') this.offs.push(pencil.on('ring', () => this.check()));
    this.check();
    return this;
  }
  on(kind, fn) { if (!this.handlers.has(kind)) this.handlers.set(kind, new Set()); this.handlers.get(kind).add(fn); return () => this.handlers.get(kind).delete(fn); }
  tell(kind, e) { for (const fn of this.handlers.get(kind) || []) { try { fn(e); } catch (err) { console.warn('leads.on', kind, err); } } }
  live() { const s = this.story; return !!(s && s.doc && s.mode !== 'mirror'); }
  state(id) { const s = this.story; return s && s.doc && s.doc.leads[id] ? s.doc.leads[id].s : null; }
  lead(id) { return LEADS.find((l) => l.id === id) || null; }
  list() { return LEADS.map((l) => ({ id: l.id, state: this.state(l.id), ring: this.pencil ? this.pencil.ringFor(l.id) : null })); }
  line(id) { return LINES[id] ? LINES[id].text : null; }

  // --- the lifecycle ----------------------------------------------------------------------------------------------------
  check() {
    if (!this.live()) return 0;
    if (this.busy) { this.again = true; return 0; }
    const s = this.story, P = this.pencil;
    this.busy = true; let n = 0;
    try {
      for (let pass = 0; pass < 4; pass++) {
        this.again = false;
        for (const L of LEADS) {
          const st = this.state(L.id);
          if (st === 'closed' || st === 'overtaken') continue;
          const closes = !!L.closes && s.when(L.closes);
          if (!st) {
            if (!s.when(L.born)) continue;
            if (closes) { s.leadState(L.id, 'overtaken', 'leads'); this.tell('overtaken', { id: L.id }); n++; continue; } // (its closes came by another key first: quiet, no line of its own)
            const first = !Object.keys(s.doc.leads).length;
            s.leadState(L.id, 'open', 'leads');
            if (L.walt) s.waltLine(L.walt, `lead:${L.id}`);
            this.tell('born', { id: L.id });
            if (first) this.tell('first', { id: L.id });
            n++;
            continue;
          }
          if (closes) {
            s.leadState(L.id, 'closed', 'leads');
            if (L.after) s.waltLine(L.after, `lead:${L.id}`);
            if (P) P.closeLead(L.id);
            this.tell('closed', { id: L.id }); n++;
            continue;
          }
          if (st === 'open' && L.followed && s.when(L.followed)) {
            s.leadState(L.id, 'followed', 'leads');
            if (P) P.followLead(L.id);
            this.tell('followed', { id: L.id }); n++;
          }
        }
        if (!this.again) break;
      }
    } finally { this.busy = false; }
    return n;
  }

  // --- the keepers' topics (T shows them) ---------------------------------------------------------------------------------
  asks(ctx = {}) {
    if (!this.live()) return [];
    const s = this.story, args = { ep: ctx.ep != null ? String(ctx.ep) : undefined }, out = [];
    for (const a of ASKS) {
      if (a.once && s.has(ASKED + a.id)) continue;
      if (this.pencil && this.pencil.has(a.ring)) continue; // (rung already, by anyone)
      if (!s.when(a.if, args)) continue;
      out.push({ id: a.id, choice: a.choice, ask: a.ask || null, say: a.say, lead: this.leadOf(a), place: a.ring });
    }
    // "Where would I find {name}?" (§4): every open person lead, at every keeper
    for (const L of LEADS) {
      const st = this.state(L.id), sub = L.subject || {};
      if (!sub.person || !sub.where || !['open', 'followed'].includes(st)) continue;
      const place = sub.where.store != null ? storePlace(sub.where.store) : null;
      if (!place || (this.pencil && this.pencil.has(place))) continue;
      if (ctx.ep != null && Number(ctx.ep) === sub.where.store) continue; // (you're standing in it)
      if (out.some((q) => q.lead === L.id || q.place === place)) continue;
      out.push({ id: `where.${L.id}`, choice: null, ask: `Where would I find ${cap(sub.person)}?`, say: null, words: sub.where.words || null, lead: L.id, place, where: true });
    }
    return out;
  }
  ask(id, ctx = {}) {
    if (!this.live()) return null;
    const s = this.story, P = this.pencil;
    let a = ASKS.find((q) => q.id === id), place = a ? a.ring : null, lead = a ? this.leadOf(a) : null;
    if (!a && id.startsWith('where.')) { const L = this.lead(id.slice(6)); if (L && L.subject && L.subject.where) { place = storePlace(L.subject.where.store); lead = L.id; } }
    if (!place) return null;
    if (a && a.once && s.has(ASKED + a.id)) return null;
    const ring = P ? P.ring({ place, by: ctx.by || null, lead, talk: ctx.talk != null ? ctx.talk : null }) : null;
    if (P && !ring) return { ring: null, said: [] }; // (refused: two rings this talk already; asked again another time)
    if (ring && lead && DOOR_LEADS.has(lead) && s.has(`door.${lead}.named`)) s.set(`door.${lead}.ringed`, true, `ask:${id}`); // (20 §12.4: the door is 'ringed')
    if (a) {
      s.set(ASKED + a.id, true, `ask:${ctx.by || 'keeper'}`);
      for (const t of a.then || []) {
        const i = t.indexOf(':'), k = t.slice(0, i), v = t.slice(i + 1);
        if (k === 'f') s.set(v, true, `ask:${a.id}`); else if (k === 'walt') s.waltLine(v, `ask:${a.id}`); else if (k === 'und') s.understand(v, `ask:${a.id}`);
      }
    }
    this.check();
    return { ring, said: a && a.say ? [a.say] : [] };
  }

  // the lead an ask's ring is for: the first of its leads that is open (ring.farm: Tauno's porch, then the mining door)
  leadOf(a) {
    const ls = Array.isArray(a.lead) ? a.lead : a.lead ? [a.lead] : [];
    return ls.find((l) => ['open', 'followed'].includes(this.state(l))) || ls[0] || null;
  }
  // the Walt page's subject word: the map turned to the lead's ring, only if one is there
  goto(id) {
    const P = this.pencil, g = P ? P.ringFor(id) : null, h = this.hud;
    if (!g || !h) return false;
    if (h.bookHost && typeof h.bookHost.showMap === 'function') h.bookHost.showMap();
    if (typeof h.lookAt === 'function') h.lookAt(g.x, g.z, Math.max(3000, g.r * 6), g.r);
    return true;
  }
}

const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w);
function storePlace(ep) { for (const [k, p] of Object.entries(PLACES)) if (p.store === ep) return k; return null; }

export const leads = new Leads();
export { Leads };
