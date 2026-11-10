// The --slice rig's book section (stream B, Round 1; campaign-design Part 4 "The first playable slice, exactly"): the
// assertions B owns in steps 1, 2, 3 and 7, as steps the join assembles with the other streams' sections. Each step is
// { id, slice, name, run(h) } where h is the harness:
//   h.page (playwright page, ?story=1) · h.step(n) (n frames of __game.step) · h.until(fn, arg?, ms?) · h.shot(name)
//   h.result(name, pass, more) · h.log(...) · h.state (shared between steps: this section keeps h.state.book)
// A step returns nothing; it reports through h.result. Steps run in order, each on the game as the one before left it:
//   B1 (with T) a new season's bundle: only unsellable until night one; the Walt side not there yet
//   B2 the first overnight with the bundle along: the real cutscene holds the night; the notebook in the book (88
//      entries, the stubs, the pocket, the unread dots), bound in the pockets
//   B3 (join with L, K1b) read NB45: its dot goes; read NB01 at its place: he was here; cross P289: "64" pencilled
//   B7 (with P, T) NB20 and NB31 understood when Tauno's words (or the inks) arrive; the Walt page holds about ten lines
// Where another stream's piece is not in the build yet (the layer's places, Tauno's topics), the step stands it in
// through the Round 0 stubs and says so in its result (stub: true); at the join the real one is used.

const W = (page, fn, arg) => page.evaluate(fn, arg);

// the C837 site (Lake One's island, "the Front Porch"): v3 837 → v9 1031 (src/migrate's v3 table)
export const C837_V9 = 1031;

export const steps = [
  { id: 'B1', slice: 1, name: 'the bundle: unsellable until night one, no leash; no Walt side yet', async run(h) {
    const r = await W(h.page, () => {
      const g = window.__game, b = g.book, inv = g.profile.inventory;
      const pack = inv.containers.find((c) => c.item === 'waltpack');
      const tentIn = inv.containers.some((c) => c.grid.some((e) => e.id === 'walttent'));
      const bound = b.debug.bound;
      return { pack: !!pack, tentIn, sell: bound('waltpack', { verb: 'sell' }), tentSell: bound('walttent', { verb: 'trade' }), drop: bound('waltpack', { verb: 'drop' }), stash: bound('waltpack', { verb: 'stash' }),
        tab: (() => { const t = document.querySelector('#journal .book-tab.w'); return t ? !t.hidden : null; })(), side: (g.journal.setSide('walt'), g.journal.side), found: g.story.has('nb.found'), lore: g.story.walt().length };
    });
    h.result('B1 the bundle is only unsellable before night one (no leash: it can be set down or stashed); no Walt side, no Walt lore', r.pack && r.tentIn && r.sell === 'unsellable' && r.tentSell === 'unsellable' && r.drop === null && r.stash === null && r.tab === false && r.side !== 'walt' && !r.found && r.lore === 0, r);
  } },

  { id: 'B2', slice: 2, name: 'night one: the cutscene; the notebook in the book', async run(h) {
    const site = h.state.site; // (the harness pitched the old tent there and set the pack down by the pad)
    await W(h.page, () => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 21.5); g.camp.sleep('tent', 'first'); });
    // the night card goes dark, then the cutscene holds it: the clock does not jump while it plays
    let st = null;
    for (let k = 0; k < 40; k++) { await h.step(20); st = await W(h.page, () => { const g = window.__game, c = g.walt.cut; return { active: !!(c && c.active), beat: c && c.beat, hours: g.day.hours, dark: g.veil.dark }; }); if (st.active) break; }
    h.result('B2a at full dark of the first night with the bundle along, the cutscene begins (the clock held at bedtime)', st && st.active && st.beat === 'cut.1' && st.dark && st.hours < 22, { st, site });
    // the beats by time: the circle on the inside cover, the first page, the page turns; a key turns sooner (after 2 s)
    const seen = [];
    for (let k = 0; k < 400; k++) {
      await h.step(6);
      const b = await W(h.page, () => { const c = window.__game.walt.cut; return c && c.active ? { beat: c.beat, t: c.t, lit: (document.querySelector('#nightone .lit') || {}).textContent || '', soft: (document.querySelector('#nightone .soft') || {}).textContent || '' } : null; });
      if (!b) break;
      if (!seen.length || seen[seen.length - 1].beat !== b.beat) { seen.push(b); if (b.beat === 'cut.3' || b.beat === 'cut.11') await h.shot(`b-cut-${b.beat}`); }
      if (b.beat === 'cut.11' && b.t > 12) break; // held: the last page waits for a key
    }
    const held = await W(h.page, () => { const g = window.__game, c = g.walt.cut; return { active: c.active, beat: c.beat, page: (document.querySelector('#nightone .no-page') || {}).textContent || '', hours: g.day.hours }; });
    const order = seen.map((b) => b.beat);
    h.result('B2b the beats in the doc\'s order, a lit line on a real page, the last page held whole until a key', order.join() === 'cut.1,cut.2,cut.3,cut.4,cut.5,cut.6,cut.7,cut.8,cut.9,cut.10,cut.11' && held.active && held.beat === 'cut.11' && /If you are reading this/.test(held.page) && /Pack stays\. Tent stays\./.test(held.page)
      && seen.find((b) => b.beat === 'cut.4').lit.startsWith('Up 4:50') && seen.find((b) => b.beat === 'cut.4').soft.length > 10 && held.hours < 22, { order, seen: seen.map((b) => [b.beat, b.lit.slice(0, 30), b.soft.length]), held: { ...held, page: held.page.slice(-120) } });
    // Esc does not skip a first viewing; any key goes on
    await W(h.page, () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); });
    await h.step(2);
    const esc = await W(h.page, () => window.__game.walt.cut.beat);
    await W(h.page, () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true })); });
    for (let k = 0; k < 40; k++) { await h.step(30); const done = await W(h.page, () => { const g = window.__game; return !g.walt.cut.active && !g.veil.active && !g.camp.night; }); if (done) break; }
    const after = await W(h.page, () => {
      const g = window.__game, s = g.story, inv = g.profile.inventory, b = g.book;
      const where = (() => { for (const c of inv.containers) if (c.grid.some((e) => e.id === 'waltnotebook')) return c.item; return null; })();
      return { found: s.has('nb.found'), walt: s.walt(), where, n: inv.count('waltnotebook', { reachable: false }), hours: g.day.hours, meta: s.meta().nightOneSeen,
        entries: b.data.entries.length, stubs: b.data.leaves.filter((l) => l.kind === 'stub').length, pocket: (b.data.leaves.find((l) => l.kind === 'pocket') || {}).pages, log: g.walt.cut.log };
    });
    h.result('B2c Esc does not skip a first night one; a key ends it; the night passes; the notebook found, in your pockets, nightOneSeen', esc === 'cut.11' && after.found && after.where === 'pockets' && after.n === 1 && after.hours < 12 && after.meta && after.log.join().endsWith('cut.11,cut.12,cut.13') && after.walt.join() === 'w.found,w.cellar', after);
    // the book: the Walt side, opened at the last page, the contents strip with a dot on every unread entry
    const book = await W(h.page, () => {
      const g = window.__game, j = g.journal; j.show('pack'); j.setSide('walt');
      const el = document.querySelector('#journal .side.w');
      return { side: j.side, tab: !document.querySelector('#journal .book-tab.w').hidden, at: g.book.at, last: g.book.data.last, rows: el.querySelectorAll('.nbw-c').length, dots: el.querySelectorAll('.nbw-strip .nbw-dot').length,
        right: (el.querySelector('.pp-page.left .nbw-hand') || {}).textContent || '' };
    });
    await h.shot('b-book-last');
    h.result('B2d the book\'s Walt side opens at the last page; the strip lists all 88 headers, each with an unread dot', book.side === 'walt' && book.tab && book.at === book.last && book.rows === 89 && book.dots === 88 && /If you are reading this/.test(book.right), book);
    // bound: it stays in your pockets
    const bound = await W(h.page, () => {
      const g = window.__game, inv = g.profile.inventory, pk = inv.pockets, e = pk.grid.find((q) => q.id === 'waltnotebook');
      const pack = inv.containers.find((c) => c.item === 'waltpack');
      const moved = inv.move(pk.id, e.uid, pack.id, 0, 0);
      const drop = inv.drop(pk.id, e.uid);
      return { moved, drop: drop && drop.words, still: pk.grid.some((q) => q.id === 'waltnotebook') };
    });
    h.result('B2e bound: the notebook won\'t go into a pack or onto the ground ("Not leaving those.")', !bound.moved && bound.drop === 'Not leaving those.' && bound.still, bound);
  } },

  { id: 'B3', slice: 3, name: 'read NB45; NB01 read where he wrote it; P289 pencils 64', async run(h) {
    // NB45: the spread open 3 s, the dot goes
    const n45 = await W(h.page, () => { const b = window.__game.book; return b.debug.spread(b.debug.spreadOf('NB45')); });
    await h.step(30 * 2); // (2 s: not yet)
    const early = await W(h.page, () => window.__game.story.nbHas('read', 'NB45'));
    await h.step(30 * 1.5);
    const r45 = await W(h.page, () => { const g = window.__game, el = document.querySelector('#journal .side.w'); const row = [...el.querySelectorAll('.nbw-c')].find((b) => b.classList.contains('on') && /Sept 15/.test(b.textContent)); return { read: g.story.nbHas('read', 'NB45'), when: g.story.when('read:NB45'), dot: row ? !!row.querySelector('.nbw-dot') : null, dots: el.querySelectorAll('.nbw-strip .nbw-dot').length }; });
    h.result('B3a NB45\'s spread open 3 s: read:NB45, its dot gone (not at 2 s)', n45 >= 0 && !early && r45.read && r45.when && r45.dot === false && r45.dots < 88, { early, ...r45 });
    // NB01 at C837: the layer's place for NB01 (L's; the stub has none, so one stands in at the v9 site)
    const pl = await W(h.page, (C837) => {
      const g = window.__game, L = g.storySeams.layer;
      let p = (L.places() || []).find((q) => [].concat(q.nbs || q.nb || []).includes('NB01'));
      let stub = false;
      if (!p) { const c = g.world.campsites[C837]; p = { id: 'stand-in:C837', nb: 'NB01', x: c.x, z: c.z, r: 60 }; const prev = L.places.bind(L); L.places = () => [...prev(), p]; stub = true; }
      return { ...p, stub };
    }, C837_V9);
    const tryAt = (x, z, nb) => W(h.page, ([x, z, nb]) => { const g = window.__game, p = g.player, b = g.book; const was = [p.x, p.z]; p.x = x; p.z = z; b.debug.spread(b.debug.spreadOf(nb)); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true })); const r = g.story.nbHas('here', 'NB01'); p.x = was[0]; p.z = was[1]; return r; }, [x, z, nb]);
    const far = await tryAt(pl.x + 400, pl.z, 'NB01');
    const wrong = await tryAt(pl.x, pl.z, 'NB02');
    const right = await tryAt(pl.x + 10, pl.z, 'NB01');
    await h.step(4);
    const mark = await W(h.page, () => { const el = document.querySelector('#journal .side.w .nbw-here'); return el ? el.textContent : null; });
    await h.shot('b-here-nb01');
    h.result(`B3b E on NB01 within its place: he was here; far off, or another page there: nothing${pl.stub ? ' (L\'s place stood in)' : ''}`, !far && !wrong && right && mark === 'he was here', { far, wrong, right, mark, place: pl });
    // P289: the carry logged as trip.js logs it (i: its v9 index) → carry → bc.64, NB15 he was here, the Walt line
    const c64 = await W(h.page, () => {
      const g = window.__game, tr = g.trip, i = g.book.debug.resolved()['64'][0], p = g.world.portages[i];
      tr.log('portage', { i, name: p.name, rods: p.rods });
      const s = g.story;
      return { i, name: p.name, rods: p.rods, bc: s.has('bc.64'), here: s.nbHas('here', 'NB15'), line: s.walt().includes('20:2.4.w1'), bcList: s.doc.nb.bc.slice() };
    });
    const back = await W(h.page, () => { const b = window.__game.book; b.debug.spread(b.data.backSpread); const r = [...document.querySelectorAll('#journal .side.w .nbw-rod')].map((n) => n.textContent.trim()); return r; });
    await h.step(30 * 3.5);
    const backRead = await W(h.page, () => [...document.querySelectorAll('#journal .side.w .nbw-rod')].map((n) => n.textContent.trim()));
    await h.shot('b-back-cover');
    h.result('B3c crossing P289 (Little Trout–Rum, 64 r): "64" pencilled on the back cover, NB15 he was here, the Walt line; the lake pair once the back cover is read', c64.rods === 64 && /Little Trout/.test(c64.name) && c64.bc && c64.here && c64.line && back[0].includes('✓') && !back[0].includes('Rum') && backRead[0].includes('Little Trout to Rum'), { c64, back: back.slice(0, 2), backRead: backRead.slice(0, 2) });
  } },

  { id: 'B7', slice: 7, name: 'NB20 and NB31 understood via Tauno; the Walt page about ten lines', async run(h) {
    // Tauno's words at the turn (T's topics write knows.vwater / knows.twostump, or P inks them: the book's contract)
    const r = await W(h.page, () => {
      const g = window.__game, s = g.story, T = g.storySeams && g.storySeams.topics;
      const stub = !T; // (T's topics not in this build: the facts Tauno's lines write, set as he would)
      if (!s.has('knows.vwater')) s.set('knows.vwater', true, 'tauno:U3');
      if (!s.has('knows.twostump')) s.set('knows.twostump', true, 'tauno:U3');
      // the porch's lines (T's): the old man knew him, he is Tauno
      for (const id of ['20:T3.w1', '20:T4.w1', '20:T4.w5', '20:T4.w10', '20:T4.w11', '20:5.2.w1']) s.waltLine(id, 'stand-in:T');
      const b = g.book; b.debug.spread(b.debug.spreadOf('NB20'));
      return { stub, und20: s.nbHas('und', 'NB20'), und31: s.nbHas('und', 'NB31') };
    });
    await h.step(6);
    const page = await W(h.page, () => {
      const el = document.querySelector('#journal .side.w');
      const left = el.querySelector('.pp-page.left'), right = el.querySelector('.pp-page.right');
      return { margin: [...el.querySelectorAll('.nbw-margin')].map((n) => n.textContent), dec: [...el.querySelectorAll('u.dec')].map((n) => n.textContent), leftNb: (left.querySelector('[data-nb]') || {}).dataset?.nb, rightNb: (right.querySelector('[data-nb]') || {}).dataset?.nb };
    });
    await h.shot('b-nb20-understood');
    const other = await W(h.page, () => { const b = window.__game.book; b.debug.spread(b.debug.spreadOf('NB63')); return [...document.querySelectorAll('#journal .side.w u.dec')].map((n) => n.textContent); });
    h.result(`B7a NB20 and NB31 understood: the margin note in the player's pencil, "V.'s water" underlined on every page it is on${r.stub ? ' (Tauno\'s facts stood in)' : ''}`, r.und20 && r.und31 && page.margin.includes('Bald Eagle. Where they found Eino.') && page.dec.includes('V.\'s water') && other.includes('V.\'s water'), { r, page, other });
    const wp = await W(h.page, () => {
      const g = window.__game, b = g.book; b.view = 'walt'; b.render(true);
      const el = document.querySelector('#journal .side.w');
      return { head: (el.querySelector('.cb-head') || {}).textContent || '', lines: [...el.querySelectorAll('.cb-line:not(.struck)')].map((n) => n.textContent), heads: [...el.querySelectorAll('.cb-h')].map((n) => n.textContent), nicks: [...el.querySelectorAll('.cb-nick')].map((n) => n.textContent) };
    });
    await h.shot('b-walt-page');
    h.result('B7b the Walt page: "Walt (W.H.)", about ten lines in sections, the nicknames gathered (matched ones with the note)', /^Walt/.test(wp.head) && /\(W\.H\.\)/.test(wp.head) && wp.lines.length >= 9 && wp.lines.length <= 16 && wp.heads.includes('People') && wp.lines.some((l) => /A guide's notebook, found in the old tent/.test(l)) && wp.lines.some((l) => /64\. The first number/.test(l)) && wp.nicks.some((n) => /V\.'s water/.test(n)) && wp.nicks.some((n) => /Whiskey/.test(n)), wp);
  } },
];
