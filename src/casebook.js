// The Walt page (stream B, Round 1; campaign-design §6.3; docs/story/10-notebook.md §11.3, 20 §7.1): the player's own
// notes on Walt, a line at a time, in the player's pencil. Part of the book's Walt side (notebook.js); loaded only under
// STORY_ON.
//
// The heading is "W.H." until someone names him (knows.walt, or the porch's "Walt Haapala" line, 20:T3.w1), then
// "Walt" with "(W.H.)" beside it. The sections (walt-lines.js WALT_SECTIONS) show only once they have a line, in the order
// the lines were earned (story.walt()). A line that `replaces` another draws the old one crossed out above it. Every
// line's words are the docs' (story-data/words.js, by id). A lead with a `done` that holds is struck where it stands. The strip beside the page holds the nicknames gathered so far,
// unmatched as chips (a place's chip, clicked, is handed to the map's pencil when P's pencil takes it: pencil.pick), and
// matched with the player's note beside them. Nothing on the page says what to do, and nothing announces a line.
//
//   new Casebook(book) · render() → { strip, left, right } · lines() → [{ id, section, text, struck? }] · heading()
//   chip(nick) · seen() (the page looked at: the waltpage moment is done) · looked
import { WALT_SECTIONS, waltRow, sectionOf } from './story-data/walt-lines.js';
import { NICKS, UND, CUT } from './story-data/notebook.js';
import { say, text as textOf } from './story-data/words.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// a line's words, *emphasis* as the docs write it
const words = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

// i: begin (the canary's Walt-page lines name their lake: Denny's told lake that came back, or the one told Frank / Bob)
function iVars(s, id, v) {
  if (!/^(32:5\.11\.|d95\.i\.clear)/.test(id) || !s || !s.get) return v;
  const lake = id === '32:5.11.clear' ? s.get('canary.clear.frank') : id === 'd95.i.clear.bob' ? s.get('canary.clear.bob') : id === '32:5.11.shared' ? s.get('canary.shared') : s.get('canary.hard');
  return lake ? { ...v, lake } : v;
}
// i: end
export class Casebook {
  constructor(book) { this.book = book; this.looked = false; }
  get story() { return this.book.story; }
  seen() { this.looked = true; }
  named() { const s = this.story; return !!s && (s.has('knows.walt') || s.walt().includes('20:T3.w1') || s.walt().includes('20:T4.w11')); }
  heading() { return this.named() ? 'Walt' : 'W.H.'; }
  vars() {
    const t = this.book.t, o = t.outfitter, ts = t.tasks;
    let name = null;
    try { const g = this.story && this.story.get ? Number(this.story.get('walt.gear')) : NaN; const ep = Number.isFinite(g) && g > 0 ? g : o && o.profile ? o.profile.home : null; // (the store asked: T's walt.gear=<ep>)
      const L = ep != null && ts && ts.landing ? ts.landing(ep) : null; name = L ? L.name : null; } catch { name = null; }
    return { outfitter: name || 'the outfitter', I: 'I' };
  }
  // the lines in the order earned, each with its section and words; a replaced line moves above the one that turned it
  lines() {
    const s = this.story; if (!s) return [];
    const ids = s.walt(), have = new Set(ids), v = this.vars(), out = [], turned = new Set();
    for (const id of ids) { const r = waltRow(id); if (r && r.replaces && have.has(r.replaces)) turned.add(r.replaces); }
    for (const id of ids) {
      if (turned.has(id)) continue;
      const r = waltRow(id), t = say((r && r.ref) || id, iVars(s, id, v)) || (r && r.text) || ''; // i: (iVars: the canary's {lake}) // c: a build draft's own words (walt-lines.js `text`) until the writers anchor it
      if (!t) continue;
      const line = { id, section: sectionOf(id), text: t };
      if (r && r.done) { try { line.done = !!s.when(r.done); } catch { line.done = false; } } // (a lead followed up: struck where it stands)
      if (r && r.replaces && have.has(r.replaces)) line.struck = say(waltRow(r.replaces) && waltRow(r.replaces).ref || r.replaces, v);
      if (r && r.annotates) { const host = out.find((q) => q.id === r.annotates); if (host) { host.text = `${host.text} ${t}`; continue; } if (have.has(r.annotates)) { line.after = r.annotates; } }
      out.push(line);
    }
    // (the join) a note written before the line it belongs to joins it once that line is there
    for (const l of out.filter((q) => q.after)) { const host = out.find((q) => q.id === l.after); if (host) { host.text = `${host.text} ${l.text}`; out.splice(out.indexOf(l), 1); } }
    return out;
  }
  // the nicknames seen so far: those the cutscene showed (night one), and those on any page read; matched once their
  // page is understood or their nickname inked (pencil.js ink.<nick>) or told (knows.<nick>)
  nicks() {
    const s = this.story, data = this.book.data, read = (nb) => s.nbHas('read', nb);
    const cut = s.has('nb.found') ? CUT.map((c) => (textOf(c.id) || {}).text || '').join('\n') : '';
    return NICKS.map((n) => {
      const u = UND.find((q) => q.nick === n.nick);
      const matched = s.has(`ink.${n.nick}`) || s.has(`knows.${n.nick}`) || !!(u && s.nbHas('und', u.nb));
      const seen = matched || cut.includes(n.match) || (data.nicks[n.nick] || []).some(read); // (a nickname someone explained is known, read or not)
      return seen ? { ...n, matched, note: matched && u ? u.note || (u.noteId ? say(u.noteId) || null : null) : null } : null; // (x: a drafted note by id)
    }).filter(Boolean);
  }
  // a chip only where the pencil has the nickname's lake (pencil.js INK): a chip that does nothing is not shown
  inkable(nick) { const P = this.book.t.pencil; return !!(P && typeof P.row === 'function' && P.row(nick)); }
  chip(nick) {
    const n = NICKS.find((q) => q.nick === nick), P = this.book.t.pencil, j = this.book.t.journal;
    if (!n || n.kind !== 'place' || !P || typeof P.pick !== 'function') return false; // (P's pencil mode: nothing until it takes it)
    let ok = false;
    try { ok = !!P.pick(n.nick); } catch (e) { console.warn('casebook: pencil.pick', e); } // (the join: pencil.pick(nick))
    if (ok && j && typeof j.setSide === 'function') j.setSide('map');
    return ok;
  }
  render() {
    const lines = this.lines(), by = new Map();
    for (const l of lines) { if (!by.has(l.section)) by.set(l.section, []); by.get(l.section).push(l); }
    const sec = (key, label) => {
      const ls = by.get(key); if (!ls || !ls.length) return '';
      return `<div class="cb-sec">${label ? `<div class="cb-h">${esc(label)}</div>` : ''}${ls.map((l) => `${l.struck ? `<div class="cb-line struck">${words(l.struck)}</div>` : ''}<div class="cb-line${l.done ? ' struck' : ''}" data-walt="${esc(l.id)}">${words(l.text)}</div>`).join('')}</div>`;
    };
    // the page in two halves: who he was on the left, what the player has on him on the right
    const leftKeys = ['walt', 'people', 'places', 'names'], rightKeys = ['years', 'odd', 'leads', 'farend'];
    const labelOf = new Map(WALT_SECTIONS);
    const head = `<div class="cb-head nbw-mine">${esc(this.heading())}${this.named() ? ' <span class="cb-wh">(W.H.)</span>' : ''}</div>`;
    const left = `<div class="nbw-scroll cb-page">${head}${leftKeys.map((k) => sec(k, labelOf.get(k))).join('')}</div>`;
    const right = `<div class="nbw-scroll cb-page">${rightKeys.map((k) => sec(k, labelOf.get(k))).join('')}</div>`;
    const nicks = this.nicks();
    const strip = `<div class="nbw-sc">Nicknames</div>${nicks.length ? nicks.map((n) => n.matched
      ? `<div class="cb-nick matched"><span class="w">${esc(n.word)}</span>${n.note ? ` <span class="nbw-mine">${esc(n.note)}</span>` : ''}</div>`
      : n.kind === 'place' && this.inkable(n.nick) ? `<button type="button" class="cb-nick chip" data-nbchip="${esc(n.nick)}">${esc(n.word)}</button>` : `<div class="cb-nick">${esc(n.word)}</div>`).join('') : ''}`;
    return { strip, stripLabel: 'Nicknames', left, right };
  }
}
