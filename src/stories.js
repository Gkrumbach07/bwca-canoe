// The Stories side of the book (docs/build/campaign-design.md §10.2 "The page"; 60-side-stories.md §0.3; Round 2
// stream E): one page per side story started, in the player's own hand (the Walt page's hand, paper.css), holding what
// is known: the lines the record's page names as they come true, the prints pinned in, and at the end its one last line
// and the trip card's stamp. Never a checklist, a next step or a percentage; a page with a gap reads like a page with a
// gap. Loaded only under STORY_ON (main.js's e: block); the side's tab shows once a story is started (journal.addSide's
// visible()). A co-op guest (mirror) has no Stories side.
//
//   installStories({ journal, episodes, photo, story }) → stories   stories.side · stories.render() · stories.state()
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CSS = `
#journal .side.s.stories.on { display: flex; background: var(--pp-sheet, #efe6cf); }
.stories { gap: 0; padding: 26px 30px; color: var(--ink, #2b2218); font-family: var(--hand, 'Caveat', cursive); }
.stories .st-list { width: 32%; padding-right: 18px; border-right: 1px solid rgba(60, 40, 20, .18); overflow: auto; }
.stories .st-list button { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 6px 4px; font: inherit; font-size: 22px; color: inherit; cursor: pointer; }
.stories .st-list button.on { text-decoration: underline; text-decoration-thickness: 1px; }
.stories .st-page { flex: 1; padding-left: 26px; overflow: auto; font-size: 22px; line-height: 1.45; }
.stories .st-page h3 { font: inherit; font-size: 28px; margin: 0 0 10px; }
.stories .st-page p { margin: 0 0 8px; }
.stories .st-page .st-last { margin-top: 16px; }
.stories .st-page .st-first { margin-top: 10px; font-size: 18px; opacity: .8; }
.stories .st-pins { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; }
.stories .st-pins img { width: 168px; height: 95px; object-fit: cover; box-shadow: 0 2px 5px rgba(20, 10, 0, .35); rotate: -1.2deg; border: 4px solid #f3efe2; }
.stories .st-pins img:nth-child(2n) { rotate: 1.4deg; }
`;
let cssIn = false;
const injectCss = () => { if (cssIn || typeof document === 'undefined') return; cssIn = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); };

export class Stories {
  constructor(t) { this.t = t; this.sel = null; this.sig = ''; this.el = null; }
  get E() { return this.t.episodes; }
  visible() { const s = this.t.story; return !!(s && s.mode !== 'mirror' && this.E && this.E.pages().length); }
  makeSide(el) {
    this.el = el;
    el.classList.add('stories', 'pp');
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-story]'); if (b) { this.sel = b.dataset.story; this.render(true); } });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    return { el, label: 'Stories', visible: () => this.visible(), show: () => this.render(true), hide: () => {}, update: (dt) => this.update(dt) };
  }
  update(dt) { this.acc = (this.acc || 0) + dt; if (this.acc > 0.5) { this.acc = 0; this.render(false); } }
  urlOf(id) { const P = this.t.photo; const r = P && typeof P.prints === 'function' ? P.prints().find((q) => q.id === id) : null; return r ? r.url : null; }
  state() { return this.E ? this.E.pages() : []; }
  render(force = false) {
    if (!this.el) return;
    const pages = this.state();
    if (!pages.length) { this.el.innerHTML = ''; this.sig = ''; return; }
    if (!this.sel || !pages.some((p) => p.id === this.sel)) this.sel = pages[pages.length - 1].id;
    const p = pages.find((q) => q.id === this.sel);
    const sig = JSON.stringify([this.sel, pages.map((q) => [q.id, q.title, q.lines, q.end, q.first, q.prints])]);
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const list = pages.map((q) => `<button type="button" data-story="${esc(q.id)}"${q.id === p.id ? ' class="on"' : ''}>${esc(q.title)}</button>`).join('');
    const pins = p.prints.map((id) => this.urlOf(id)).filter(Boolean).map((u) => `<img src="${esc(u)}" alt="">`).join('');
    this.el.innerHTML = `<nav class="st-list" aria-label="Stories">${list}</nav>
      <article class="st-page" data-page="${esc(p.id)}"><h3>${esc(p.title)}</h3>${p.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
        ${pins ? `<div class="st-pins">${pins}</div>` : ''}${p.end ? `<p class="st-last">${esc(p.end)}</p>` : ''}${p.first ? `<p class="st-first">${esc(p.first)}</p>` : ''}</article>`;
  }
}

export function installStories(t) {
  injectCss();
  const st = new Stories(t), j = t.journal;
  if (j && typeof j.addSide === 'function') {
    const el = document.createElement('div');
    st.side = j.addSide('stories', st.makeSide(el));
    if (t.episodes && typeof t.episodes.on === 'function') { const re = () => { if (typeof j.sideTabs === 'function') j.sideTabs(); st.render(true); }; t.episodes.on('start', re); t.episodes.on('end', re); t.episodes.on('page', re); }
  }
  return st;
}
