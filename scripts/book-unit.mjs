// book-unit.mjs: stream B's Node checks (Round 1, the book): no browser, about a second.  node scripts/book-unit.mjs
//   the book's shape from nb.json (88 entries, the three stubs where 10 §1 puts them, NB63 split round stub C, the
//   back cover alone on the last right page), the contents strip's headers, the nickname index written out in
//   story-data/notebook.js against the text, the back cover's v9 carries (and found again by name when renumbered),
//   the book's rules in a StoryV2 (the Walt page's lines from reading and from understanding, 205/50 → lock 2 key B),
//   every Walt line id the book writes having words, and items.js's bound / unsellable / kept / page.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = await import(path.join(ROOT, 'src/story-data/notebook.js'));
const { RULES_BOOK } = await import(path.join(ROOT, 'src/story-data/rules-book.js'));
const { RULES_CORE } = await import(path.join(ROOT, 'src/story-data/rules-core.js'));
const { StoryV2 } = await import(path.join(ROOT, 'src/story.js'));
const WL = await import(path.join(ROOT, 'src/story-data/walt-lines.js'));
const I = await import(path.join(ROOT, 'src/items.js'));

const TEXT = path.join(ROOT, 'src/story-data/text');
const nb = JSON.parse(readFileSync(path.join(TEXT, 'nb.json'), 'utf8')).text;
const all = {};
for (const f of readdirSync(TEXT).filter((x) => x.endsWith('.json'))) Object.assign(all, JSON.parse(readFileSync(path.join(TEXT, f), 'utf8')).text || {});

let pass = 0, fail = 0;
const result = (name, ok, more = {}) => { if (ok) pass++; else fail++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(more).slice(0, 900)); };

// --- 1 the book --------------------------------------------------------------------------------------------------------
const book = B.buildBook(nb);
{
  const stubs = book.leaves.filter((l) => l.kind === 'stub').map((l) => l.key);
  const idx = (k) => book.leaves.findIndex((l) => l.key === k);
  result('1a 88 entries, in book order, every one on a spread', book.entries.length === 88 && book.entries[0] === 'NB01' && book.entries[87] === 'NB88' && book.entries.every((e) => Number.isInteger(book.byNb[e])), { n: book.entries.length });
  result('1b the stubs: A after NB39, B after NB46, C inside NB63 between its two days', stubs.join() === 'stub.A,stub.B,stub.C' && idx('stub.A') === idx('NB39') + 1 && idx('stub.B') === idx('NB46') + 1 && idx('stub.C') === idx('NB63') + 1 && idx('NB63.2') === idx('stub.C') + 1
    && /^Oct 12/.test(book.leaves[idx('NB63')].text) && /^Oct 13/.test(book.leaves[idx('NB63.2')].text), { stubs, a: idx('stub.A'), nb39: idx('NB39') });
  const back = book.spreads[book.backSpread];
  result('1c the inside front cover faces NB01; the back cover alone on the last right page, the pocket facing it', book.spreads[0][0].kind === 'cover' && book.spreads[0][1].nb === 'NB01' && back[1] && back[1].kind === 'back' && back[0].kind === 'pocket' && book.last === book.byNb.NB88, { back: back.map((l) => l && l.key), last: book.last });
  const heads = Object.fromEntries(book.contents.map((c) => [c.nb, c.head]));
  result('1d the contents strip: Walt\'s own header line, date and EP, no year', heads.NB01 === 'May 22 — EP 30' && heads.NB20 === 'Oct 12 — EP 33' && heads.NB88 === 'Oct 17.' && book.contents.every((c) => c.head && !/20\d\d/.test(c.head) && c.head.length < 40), { NB01: heads.NB01, NB88: heads.NB88 });
  result('1e the nickname index in story-data/notebook.js is the text\'s (NICK_PAGES = buildBook().nicks)', JSON.stringify(B.NICK_PAGES) === JSON.stringify(book.nicks), { have: B.NICK_PAGES, text: book.nicks });
  const pk = book.leaves.find((l) => l.kind === 'pocket');
  result('1f the back pocket: L1–L9 and P1, P7, P8, P10; the other eight photos tucked at their pages', pk.pages.length === 9 && pk.photos.join() === 'P1,P7,P8,P10' && book.leaves.filter((l) => l.photos && l.kind === 'nb').flatMap((l) => l.photos).sort().join() === ['P2', 'P3', 'P4', 'P5', 'P6', 'P9', 'P11', 'P12'].sort().join(), { pk });
  const parts = B.inkParts('Up at 4. [Later: a second ink.] Done.');
  result('1g [brackets] are the second ink, drawn without them', parts.length === 3 && parts[1].ink2 && parts[1].t === 'Later: a second ink.' && !parts[0].ink2, { parts });
  result('1h the cutscene\'s beats are the doc\'s thirteen, each with nb.json words where it shows any', B.CUT.length === 13 && B.CUT.every((c) => nb[c.id]) && nb['cut.10'] && B.CUT.filter((c) => c.hold).length === 1, {});
  const cutText = B.CUT.map((c) => nb[c.id].text).join(' ');
  result('1i nothing from the checking or watched years is legible in the cutscene but the last page (10 §10.2)', B.CUT.filter((c) => !c.last && c.page !== 'cover').every((c) => { const line = nb[c.id].text; if (!line) return true; const hit = Object.entries(nb).find(([id, e]) => /^NB\d\d$/.test(id) && e.text.includes(line.slice(0, 24))); return !hit || Number(hit[0].slice(2)) <= 51; }) && cutText.includes('Whiskey'), {});
}

// --- 2 the back cover ----------------------------------------------------------------------------------------------------
{
  // v9 as it is: the stored indices hold (names and rods as on ben's v9 index, 2026-11-10)
  const v9 = []; for (const r of B.BACK_COVER) for (const c of r.carries) v9[c.v9] = { name: c.name, rods: c.rods };
  const res = B.resolveBackCover(v9);
  result('2a v9: every back-cover carry resolves to its stored index', B.BACK_COVER.every((r) => r.carries.every((c, k) => res[r.n][k] === c.v9)), { res });
  // a later bake that renumbered: found again by name and rods
  const moved = []; for (const r of B.BACK_COVER) for (const c of r.carries) moved[c.v9 + 7] = { name: c.name, rods: c.rods + 1 };
  const res2 = B.resolveBackCover(moved);
  result('2b renumbered: found again by name and rods', B.BACK_COVER.every((r) => r.carries.every((c, k) => res2[r.n][k] === c.v9 + 7)), { res2 });
  const hidden = []; hidden[691] = { name: 'Little Trout Lake – Rum Lake', rods: 64, hidden: true };
  result('2c a hidden carry is never on the back cover', B.resolveBackCover(hidden)['64'][0] === -1, {});
  result('2d bcFor: P289\'s v9 index → the 64; 659 → 205/50 (the pair\'s first)', B.bcFor(691, res).map((h) => h.row.n).join() === '64' && B.bcFor(659, res).map((h) => h.row.n + ':' + h.k).join() === '205/50:0' && B.bcFor(-1, res).length === 0, {});
}

// --- 3 the rules in a story --------------------------------------------------------------------------------------------
{
  const s = new StoryV2({ rules: [...RULES_CORE, ...RULES_BOOK] });
  s.attach({ profile: { seasonId: 'unit', started: false, onChange() {} } });
  s.clock({ abs: 20600, hours: 9 });
  s.found({ abs: 20600, key: 3, lake: 'Lake One' });
  const w0 = s.walt().join();
  s.markRead('NB02');
  const w1 = s.walt().length;
  s.markRead('NB45'); // (Mummo's: a place name of his)
  const nick = s.walt().includes('walt.nb.read.1');
  s.markRead('NB35'); s.markRead('NB04'); s.markRead('NB24'); s.markRead('NB81');
  s.set('nb.stub.seen', true, 'unit');
  const reads = ['walt.nb.read.2', 'walt.nb.read.3', 'walt.nb.read.4', 'walt.nb.read.5'].every((id) => s.walt().includes(id));
  result('3a night one: w.found and w.cellar; reading NB02 adds nothing; the first nickname page (NB45: Mummo\'s), NB35, NB04 with NB24, a stub, NB81 each add their line', w0 === 'w.found,w.cellar' && w1 === 2 && nick && reads, { walt: s.walt() });
  s.set('knows.vwater', true, 'unit'); s.set('ink.twostump', 'tauno', 'unit');
  result('3b understood: NB20 when V.\'s water is told, NB31 when Two Stump is inked; NB01 not yet', s.nbHas('und', 'NB20') && s.nbHas('und', 'NB31') && !s.nbHas('und', 'NB01') && s.when('und:NB20 & und:NB31'), { und: s.doc.nb.und });
  s.set('bc.64', true, 'carry'); s.set('bc.205-50', true, 'pair');
  result('3c the back cover: bc.64 adds 20:2.4.w1; bc.205-50 is lock 2 key B and understands NB53', s.walt().includes('20:2.4.w1') && s.has('key.L2B') && s.nbHas('und', 'NB53') && s.lock(2).keys.includes('L2B'), { walt: s.walt(), lock2: s.lock(2) });
  // a migrated save: the same lines by the quiet re-run (every effect a when:)
  const s2 = new StoryV2({ rules: [...RULES_CORE, ...RULES_BOOK] });
  s2.attach({ profile: { seasonId: 'unit2', started: false, onChange() {} } });
  s2.put('nb.found', true, 'x'); s2.doc.nb.read.NB35 = 1; s2.put('knows.vwater', true, 'x'); s2.doc.data = null;
  s2.checkData();
  result('3d a re-run (a save from other data) gives the same lines and understandings quietly', s2.walt().includes('w.found') && s2.walt().includes('walt.nb.read.2') && s2.nbHas('und', 'NB20'), { walt: s2.walt() });
  // a guest (mirror) writes nothing
  const g = new StoryV2({ rules: [...RULES_CORE, ...RULES_BOOK] });
  g.attach({ profile: { seasonId: 'g', started: false, onChange() {} } }); g.setMode('mirror');
  g.found({ abs: 1 }); g.markRead('NB35'); g.readHere('NB01');
  result('3e a co-op guest\'s book moves nothing (mirror)', !g.has('nb.found') && !g.walt().length && !g.nbHas('read', 'NB35') && !g.nbHas('here', 'NB01'), {});
}

// --- 4 the Walt page's words ---------------------------------------------------------------------------------------------
{
  const ids = new Set();
  for (const r of [...RULES_CORE, ...RULES_BOOK]) for (const a of r.then || []) { const m = /^walt:(.+)$/.exec(a); if (m) ids.add(m[1]); }
  for (const w of WL.WALT_LINES) ids.add(w.id);
  const missing = [...ids].filter((id) => { const r = WL.waltRow(id); const e = all[(r && r.ref) || id]; return !e || !e.text; });
  result('4a every Walt line the book names has the docs\' words (a ref or its own id in text/*.json)', missing.length === 0, { missing });
  const secs = new Set(WL.WALT_SECTIONS.map(([k]) => k));
  result('4b every line\'s section is one of the page\'s', [...ids].every((id) => secs.has(WL.sectionOf(id))) && WL.sectionOf('20:11.2.w1') === 'leads' && WL.sectionOf('20:T4.w3') === 'people' && WL.sectionOf('w.found') === 'walt', {});
  const replaced = WL.WALT_LINES.filter((w) => w.replaces);
  result('4c a line that replaces another names one with words', replaced.every((w) => all[w.replaces]), { replaced });
  result('4d the understood notes are the doc\'s own (10 §11.2) and each row\'s nick is a nickname', B.UND.every((u) => u.note && (!u.nick || B.NICKS.some((n) => n.nick === u.nick))) && B.UND.find((u) => u.nb === 'NB01').note === '= Lake One', {});
}

// --- 5 items ---------------------------------------------------------------------------------------------------------------
{
  I.boundFound.fn = () => false;
  const before = { nb: I.bound('waltnotebook', { verb: 'sell' }), pack: I.bound('waltpack', { verb: 'sell' }), tent: I.bound('walttent', { verb: 'trade' }), stove: I.bound('waltstove', { verb: 'sell' }), packGive: I.bound('waltpack', { verb: 'drop' }) };
  I.boundFound.fn = () => true;
  const after = { pack: I.bound('waltpack', { verb: 'sell' }), nb: I.bound('waltnotebook', { verb: 'stash' }) };
  result('5a bound: the notebook always; unsellable: the pack and tent until night one, for selling only; the stove never', before.nb === 'bound' && before.pack === 'unsellable' && before.tent === 'unsellable' && before.stove === null && before.packGive === null && after.pack === null && after.nb === 'bound', { before, after });
  const p = I.definePage({ id: 'unit.test', title: 'A test page', ref: 'L9', by: 'Unit' });
  const loan = I.definePage({ id: 'unit.loan', title: 'A loan', loan: { back: 'hap' } });
  result('5b a page: kind page, 1 × 1, kept (a loan is not): not sold, given or lost; stashed and dropped', p.kind === 'page' && p.kept && !loan.kept && I.bound(p.id, { verb: 'give' }) === 'kept' && I.bound(p.id, { verb: 'stash' }) === null && I.bound(loan.id, { verb: 'give' }) === null, { p });
}

console.log(`book-unit: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
