// Round A-D: the title's Seasons (save.js slots). Three rows, one a slot: its number, its line (where, when, the way,
// the money) and what can be done with it. The one being played says Continue (Paddle on in the pause card); a parked
// one Play, which reloads into it; an occupied one Copy (into the first empty slot), Export (a .json download) and
// Delete (asked once, in the row); an empty one New (the way to travel and home, then the reload) and Import (the
// file picker). One line under the rows says what happened, or why not. Keyboard: the buttons are the right column's
// items, top to bottom (title.js columns).
import './seasons.css';
import { slots } from './save.js';
import { clock12, shortDate } from './hud.js';

const WORD = ['', 'one', 'two', 'three'];
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'season';

export class SeasonsPanel {
  constructor(title, host) {
    this.t = title;
    this.asking = 0;      // the slot whose Delete is being asked
    this.busy = false;
    const el = this.el = document.createElement('div');
    el.className = 'seasons'; el.id = 'seasons-card'; el.hidden = true;
    el.innerHTML = '<div class="sc kicker">Seasons</div><ol class="slots" role="list"></ol><p class="status" aria-live="polite"></p>';
    this.list = el.querySelector('ol'); this.status = el.querySelector('.status');
    this.file = document.createElement('input');
    this.file.type = 'file'; this.file.accept = '.json,application/json'; this.file.hidden = true;
    this.file.addEventListener('change', () => this.imported());
    el.appendChild(this.file);
    host.appendChild(el);
    el.addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b && !b.disabled) this.act(b.dataset.act, Number(b.dataset.n)); });
  }
  get shown() { return !this.el.hidden; }
  show(on) { this.el.hidden = !on; if (on) { this.asking = 0; this.render(); } }
  say(text) { this.status.textContent = text || ''; }
  // the slot's line: the live one's from the game now, a parked one's as it was last written (or built from its facts)
  words(s) {
    if (s.live) return this.t.lineNow() || 'A season begun';
    const m = s.meta || {};
    if (m.words) return m.words;
    const f = m.facts || {};
    const bits = [];
    if (Number.isFinite(f.x)) bits.push(this.t.placeAt(f.x, f.z));
    if (Number.isFinite(f.doy)) bits.push(`${shortDate(f.year, f.doy)}${Number.isFinite(f.hours) ? `, ${clock12(f.hours)}` : ''}`);
    bits.push(f.mode === 'sandbox' ? 'Sandbox' : 'Adventure');
    if (Number.isFinite(f.money)) bits.push(`$${f.money}`);
    return bits.filter(Boolean).join(' · ');
  }
  render() {
    const all = slots.list(), pause = this.t.state === 'pause', empty = slots.firstEmpty();
    const rows = all.map((s) => {
      const n = s.n, li = document.createElement('li');
      li.className = `slot${s.live ? ' live' : ''}${s.empty ? ' empty' : ''}`;
      const num = document.createElement('span'); num.className = 'n'; num.textContent = String(n);
      const words = document.createElement('span'); words.className = 'words';
      words.textContent = s.empty ? 'Empty' : this.words(s);
      // a word after the line: the one Continue goes on with, and where a parked one came from
      const from = s.meta && !s.live ? s.meta.from : null, copied = /^copy:(\d)$/.exec(from || '');
      const tag = s.empty ? '' : s.live ? (pause ? '' : 'last played') : from === 'import' ? 'imported' : copied ? 'a copy' : '';
      if (tag) { const t = document.createElement('small'); t.textContent = ` · ${tag}`; words.appendChild(t); }
      const acts = document.createElement('div'); acts.className = 'acts';
      const btn = (act, label, off = false) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.act = act; b.dataset.n = String(n); b.textContent = label; b.disabled = off || this.busy || slots.stale; acts.appendChild(b); return b; };
      if (this.asking === n) {
        const ask = document.createElement('span'); ask.className = 'ask'; ask.textContent = 'Delete this season? It can’t be brought back.';
        acts.appendChild(ask); acts.classList.add('asking');
        btn('delete-yes', 'Delete it'); btn('delete-no', 'Keep it');
      } else if (s.empty) {
        btn('new', 'New'); btn('import', 'Import');
      } else {
        btn(s.live ? 'continue' : 'play', s.live ? (pause ? 'Paddle on' : 'Continue') : 'Play');
        if (empty && empty !== n) btn('copy', 'Copy');
        btn('export', 'Export'); btn('delete', 'Delete');
      }
      li.append(num, words, acts);
      return li;
    });
    this.list.replaceChildren(...rows);
    if (slots.stale) this.say('Another tab changed seasons. Reload this one to carry on.');
  }
  // the right column's items, top to bottom
  focusables() { return [...this.el.querySelectorAll('button:not([disabled])')].filter((b) => b.offsetParent !== null); }
  focusFirst() {
    const live = this.list.querySelector('li.live button:not([disabled])'), b = live || this.focusables()[0];
    if (b) b.focus();
  }
  // Esc inside the panel: a Delete being asked goes back to the row first
  back() { if (this.asking) { const n = this.asking; this.asking = 0; this.render(); this.refocus('delete', n); return true; } return false; }
  refocus(act, n) { const b = this.list.querySelector(`button[data-act="${act}"][data-n="${n}"]`) || this.focusables()[0]; if (b) b.focus(); }

  async act(act, n) {
    const t = this.t;
    if (this.busy || t.busy) return;
    if (act === 'continue') { t.showRight(null); if (t.state === 'pause') t.resume(); else t.continueTrip(); return; }
    if (act === 'delete') { this.asking = n; this.render(); this.refocus('delete-no', n); return; }
    if (act === 'delete-no') { this.back(); return; }
    if (act === 'new') { t.newIn = n; t.newVia = 'seasons'; t.showRight('entries'); return; }
    if (act === 'import') { this.importTo = n; this.file.value = ''; this.file.click(); return; }
    this.busy = true; this.render();
    let r = null;
    try {
      if (act === 'play') { this.say(`Opening season ${WORD[n]}…`); t.describeLive(); r = await slots.play(n); }
      else if (act === 'delete-yes') {
        this.asking = 0;
        const live = n === slots.live;
        this.say(live ? 'Deleting it…' : '');
        r = await slots.remove(n);
        if (r.ok && !r.reload) this.say(`Season ${WORD[n]} is gone.`);
      } else if (act === 'copy') {
        const to = slots.firstEmpty();
        t.describeLive();
        r = await slots.copy(n, to);
        if (r.ok && !r.reload) this.say(`Copied into slot ${WORD[to]}.`);
      } else if (act === 'export') {
        t.describeLive();
        r = await slots.exportSeason(n);
        if (r.ok) { const name = this.download(r); this.say(`Saved as ${name}, in your downloads.`); }
      }
    } catch (e) { console.warn('seasons', e); r = { ok: false, why: 'That didn’t work. Nothing was changed.' }; }
    this.busy = false;
    if (r && !r.ok) this.say(r.why);
    if (r && r.reload) { this.say('Opening it…'); return; } // the page goes and comes back
    this.render(); this.refocus(act === 'delete-yes' ? 'new' : act, act === 'copy' ? n : n);
  }
  // the file as a download: "bwca-canoe-season-lake-one-2026-10-26.json"
  download(r) {
    const place = String(r.file.words || '').split(' · ')[0] || this.t.placeAt(r.file.facts.x, r.file.facts.z);
    const name = `bwca-canoe-season-${slug(place)}-${new Date().toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(new Blob([r.text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.lastExport = { name, size: r.text.length };
    return name;
  }
  async imported() {
    const f = this.file.files && this.file.files[0], n = this.importTo;
    if (!f || !n) return;
    this.busy = true; this.render(); this.say('Reading it…');
    let r;
    try { r = await this.importText(await f.text(), n); } catch (e) { console.warn('seasons import', e); r = { ok: false, why: 'That file couldn’t be read.' }; }
    this.busy = false;
    if (r.reload) { this.say('Opening it…'); return; }
    this.render();
    this.say(r.ok ? `Imported into slot ${WORD[n]}.` : r.why);
    this.refocus(r.ok ? 'play' : 'import', n);
  }
  // (the file's text, as the picker gives it; the tests call this with a string)
  importText(text, n) { return slots.importSeason(text, n); }
}
