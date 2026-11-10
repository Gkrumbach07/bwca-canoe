// Walt's notebook as a book (stream B, Round 1; docs/story/10-notebook.md §1, §6, §10, §11; campaign-design §6). Pure
// data and pure functions, no game imports: notebook.js (the reader) builds the book from the extracted words
// (story-data/text/nb.json, scripts/story-extract.mjs), and scripts/book-unit.mjs does the same in Node.
//
// The words are never here: every page's text is nb.json's, by id. What is here is the book's shape (the order the
// leaves fall in, the stubs, the back pocket, the photos tucked at their pages), the back cover's carries (v3 ids from
// 10 §1, resolved to v9 by scripts/migrate's table and checked at run time by name and ends), and what makes a page
// understood (10 §11.2: the condition, the margin note in the player's pencil and the words underlined).
//
//   buildBook(text) → { leaves, spreads, entries, byNb, contents, nicks }   text: nb.json's `text`
//     leaves   [{ key, kind: 'cover'|'nb'|'stub'|'blank'|'pocket'|'back', nb?, part?, stub?, text?, title?, photos? }]
//     spreads  [[leafA, leafB]] two leaves a spread (the inside front cover faces NB01)
//     contents [{ nb, head, spread }] the contents strip: Walt's own header line, no year, book order
//   headOf(text) → 'May 22 — EP 30' (date and EP; the first line up to its second dash, else its first sentence)
//   inkParts(text) → [{ t, ink2 }] Walt's text split at [square brackets] (always the second ink, 10 "How to read")
//   nicksIn(text) → nick ids · BACK_COVER · bcFor(i, portages) · resolveBackCover(portages) → { '64': [691], … }
//   UND · NICKS · STUBS · POCKET · CUT (the cutscene's beats, 10 §10.2: cut.1 … cut.13)

// --- the book's shape (10 §1) --------------------------------------------------------------------------------------------
// Three pages torn out close to the spine: A after NB39, B after NB46, C inside NB63 between its first day and its second
export const STUBS = [{ id: 'A', after: 'NB39' }, { id: 'B', after: 'NB46' }, { id: 'C', inside: 'NB63', torn: 'TP3' }];
// stub → its torn page (10 §4: torn page 1 to stub A, 2 to B, 3 to C; the coffee can tapes each back, nb.torn)
export const STUB_PAGE = { A: 'TP1', B: 'TP2', C: 'TP3' };
// the back pocket: the nine loose pages and four of the photographs (10 §1, §5, §6)
export const POCKET = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];
export const POCKET_PHOTOS = ['P1', 'P7', 'P8', 'P10'];
// the photographs and the pages they belong to (10 §6 "Tucked at"); those in the pocket are listed there too
export const PHOTO_AT = { P1: 'NB35', P2: 'NB24', P3: 'NB01', P4: 'NB28', P5: 'NB49', P6: 'NB42', P7: 'NB06', P8: 'NB16', P9: 'NB29', P10: 'NB26', P11: 'NB37', P12: 'NB44' };

// --- the back cover (10 §1; campaign-design §6.2) --------------------------------------------------------------------------
// Each number, the carry or carries it is (v3 portage ids from the doc; v9 indices from src/migrate's v3 table; `ends`
// the trail's two ends in metres, the same in every release), the entry a first-trip crossing gives "he was here", and
// the lake pair the player pencils beside it once understood. `pair`: both carries back to back on one trip, either
// order (205/50: lock 2 key B). `line`: the Walt page line the crossing adds (20 §2.4, only 64's is written). `rods` and
// `name` are the data's (index.json): the running world renames trails (names.js) and recounts some rods (P255 runs
// 188 r in the game, P645 148 r), so a carry is found by its ends, never by its name or rods.
export const BACK_COVER = [
  { n: '64', ink: 'blue', carries: [{ v3: 289, v9: 691, rods: 64, name: 'Little Trout Lake – Rum Lake', ends: [[54979.5, 13905.3], [55228, 14068.4]] }], nb: 'NB15', pairWords: 'Little Trout to Rum', line: '20:2.4.w1' },
  { n: '140', ink: 'blue', carries: [{ v3: 645, v9: 1000, rods: 140, name: 'Disappointment Lake – Snowbank Lake', ends: [[-12410.5, 13101.5], [-12821, 12596.7]] }], nb: 'NB04', pairWords: 'Snowbank to Disappointment' },
  { n: '186', ink: 'blue', carries: [{ v3: 188, v9: 595, rods: 185, name: 'Grandpa Lake – Sea Gull Lake', ends: [[21630.2, -8096.1], [22256.3, -7410.5]] }], nb: 'NB18', pairWords: 'Grandpa to Sea Gull' },
  { n: '205/50', ink: 'blue2', pair: true, carries: [{ v3: 255, v9: 659, rods: 205, name: 'Bald Eagle Lake – Gull Lake', ends: [[-24416.9, 28709], [-23545.1, 28693.6]] }, { v3: 256, v9: 660, rods: 50, name: 'Gull Lake – Gull Lake', ends: [[-23350.7, 28207.1], [-23227.5, 28009.4]] }], fact: 'bc.205-50', pairWords: 'Bald Eagle to Gull' },
  { n: '50', ink: 'hard', carries: [{ v3: 530, v9: 895, rods: 50, name: 'Pietro Lake – Gull Lake', ends: [[-22708.3, 26891.1], [-22741.3, 27130.8]] }], pairWords: 'Pietro to Gull' },
  { n: '63', ink: 'hard', carries: [{ v3: 27, v9: 447, rods: 63, name: 'Pietro Lake – Camdre Lake', ends: [[-22211.6, 25435.8], [-22195.4, 25118.5]] }], pairWords: 'Pietro to Camdre' },
  { n: '121', ink: 'hard', carries: [{ v3: 24, v9: 444, rods: 121, name: 'Camdre Lake – Clearwater Lake', ends: [[-22270.1, 24725.8], [-21983.6, 24209.5]] }], pairWords: 'Camdre to Clearwater' },
  { n: '214', ink: 'hard', carries: [{ v3: 26, v9: 446, rods: 214, name: 'Clearwater Lake – Rock Island Lake', ends: [[-21181.8, 23400.2], [-20492.5, 22628.3]] }], pairWords: 'Clearwater to Rock Island' },
  { n: '45', ink: 'soft', carries: [{ v3: 47, v9: 76, rods: 45, name: 'Carp Portage', ends: [[-10265.9, 2118.1], [-10054.4, 2048.7]] }], pairWords: 'Carp' },
  { n: '15', ink: 'soft', carries: [{ v3: 46, v9: 461, rods: 15, name: 'Sucker Lake – Birch Lake', ends: [[-14528.9, 4783], [-14460, 4750.9]] }], pairWords: 'Sucker to Birch' },
];
export const bcFact = (row) => row.fact || `bc.${row.n}`;
// a world's portage index for each back-cover carry: the v9 index when its ends are still there, else the portage with
// those ends (a later bake renumbered), else none. portages: world.portages (a hidden carry is never on the back cover)
export function resolveBackCover(portages) {
  const out = {};
  const ok = (p, c) => !!p && !p.hidden && endsMatch(p, c.ends);
  for (const row of BACK_COVER) {
    out[row.n] = row.carries.map((c) => {
      if (!Array.isArray(portages)) return -1;
      if (ok(portages[c.v9], c)) return c.v9;
      for (let i = 0; i < portages.length; i++) if (ok(portages[i], c)) return i; // (a later bake renumbered: found by its ends)
      return -1;
    });
  }
  return out;
}
export const ENDS_M = 30; // m: a trail's ends this near the stored ones are that carry (either way round)
function endsMatch(p, ends) {
  const pts = p && p.pts;
  if (!Array.isArray(ends) || !Array.isArray(pts) || pts.length < 2) return false;
  const a = pts[0], b = pts[pts.length - 1], d = (q, e) => Math.hypot(q[0] - e[0], q[1] - e[1]);
  return (d(a, ends[0]) <= ENDS_M && d(b, ends[1]) <= ENDS_M) || (d(a, ends[1]) <= ENDS_M && d(b, ends[0]) <= ENDS_M);
}
// the rows a carry (a world portage index) belongs to → [{ row, k }] (k: which of the row's carries)
export function bcFor(i, resolved) {
  const out = [];
  if (!Number.isInteger(i) || i < 0) return out;
  for (const row of BACK_COVER) (resolved[row.n] || []).forEach((v, k) => { if (v === i) out.push({ row, k }); });
  return out;
}

// --- understood (10 §11.2): when a page is understood, the margin note in the player's pencil, the words underlined -----
// `when` is a condition (story-cond.js); a row without one is not wired yet (its producer is a later round's). The
// facts each `when` reads are the contract with the streams that write them (Round 1):
//   ink.<nick>      P (pencil.js): the nickname inked on its lake (a keeper's ring there, etc.)
//   knows.<nick>    T (topics.js): a person said what it is (Tauno names Two Stump and V.'s water at the turn)
//   nbphoto:<P>     L (photo.js targets): the photo matched
export const UND = [
  { nb: 'NB01', when: 'f:ink.frontporch | f:knows.frontporch | nbphoto:P3', note: '= Lake One', words: ['Front Porch'], nick: 'frontporch' },
  { nb: 'NB20', when: 'f:ink.vwater | f:knows.vwater', note: 'Bald Eagle. Where they found Eino.', words: ['V.\'s water'], nick: 'vwater' },
  { nb: 'NB31', when: 'f:ink.twostump | f:knows.twostump', note: 'Gabbro. The crews\' winter road.', words: ['Two Stump'], nick: 'twostump' },
  { nb: 'NB35', when: 'f:ink.mummos | f:knows.mummos | nbphoto:P1', note: 'His grandmother\'s place. Basswood, past Prairie.', words: ['Mummo\'s'], nick: 'mummos' },
  { nb: 'NB21', when: 'f:ink.farend', note: 'Gull. The east end.', words: ['far end'], nick: 'farend' },
  { nb: 'NB53', when: 'f:ink.farend | f:bc.205-50', note: 'Bald Eagle to Gull. 205, then 50.', words: [] },
];
// (every note is 10 §11.2's own words; the easy nicknames other than the Front Porch have no note written there yet, so
// they underline nothing until the writers give one: a leftover for the owner, not invented here)

// --- nicknames (10 §2.1, §2.2): Walt's words the Walt page gathers, unmatched, as their pages are read ------------------
// place: a pencil chip the player can drop on a lake (P's pencil mode); person: a plain line
export const NICKS = [
  { nick: 'frontporch', word: 'the Front Porch', match: 'Front Porch', kind: 'place' },
  { nick: 'frontroom', word: 'the Front Room', match: 'Front Room', kind: 'place' },
  { nick: 'kitchen', word: 'the Kitchen', match: 'the Kitchen', kind: 'place' },
  { nick: 'coffeelake', word: 'Coffee Lake', match: 'Coffee Lake', kind: 'place' },
  { nick: 'kek', word: 'the Kek', match: 'the Kek', kind: 'place' },
  { nick: 'littlesag', word: 'Little Sag', match: 'Little Sag', kind: 'place' },
  { nick: 'genes', word: 'Gene\'s', match: 'Gene\'s', kind: 'place' },
  { nick: 'longroom', word: 'the Long Room', match: 'Long Room', kind: 'place' },
  { nick: 'fourtowns', word: 'Four Towns', match: 'Four Towns', kind: 'place' },
  { nick: 'mummos', word: 'Mummo\'s', match: 'Mummo\'s', kind: 'place' },
  { nick: 'twostump', word: 'Two Stump', match: 'Two Stump', kind: 'place' },
  { nick: 'vwater', word: 'V.\'s water', match: 'V.\'s water', kind: 'place' },
  { nick: 'farend', word: 'the far end', match: 'far end', kind: 'place' },
  { nick: 'deacon', word: 'Deacon', match: 'Deacon', kind: 'person' },
  { nick: 'teach', word: 'Teach', match: 'Teach', kind: 'person' },
  { nick: 'sparky', word: 'Sparky', match: 'Sparky', kind: 'person' },
  { nick: 'whiskey', word: 'Whiskey', match: 'Whiskey', kind: 'person' },
];
// the entries each nickname is on (buildBook(text).nicks, written out so the rules load in Node without the words;
// scripts/book-unit.mjs fails when the text moves away from it)
export const NICK_PAGES = {"frontporch":["NB01","NB68"],"kitchen":["NB03","NB06"],"coffeelake":["NB06"],"littlesag":["NB07","NB16"],"deacon":["NB16","NB25","NB48"],"teach":["NB16","NB48","NB80"],"sparky":["NB16","NB25","NB48","NB64","NB76","NB78"],"whiskey":["NB16","NB48","NB78"],"vwater":["NB20","NB27","NB39","NB46","NB53","NB63","NB72"],"farend":["NB21","NB27","NB32","NB33","NB39","NB46","NB56","NB72","NB77"],"fourtowns":["NB22","NB26"],"longroom":["NB24"],"twostump":["NB31"],"frontroom":["NB35","NB65","NB75","NB85"],"mummos":["NB35","NB45"],"genes":["NB60"],"kek":["NB78","NB79"]};
export const nicksIn = (text) => NICKS.filter((n) => String(text || '').includes(n.match)).map((n) => n.nick);

// --- the cutscene (10 §10.2) ----------------------------------------------------------------------------------------------
// the beats in order: cut.1 … cut.13. `hold` beats wait for a key (the last page). The legible text is nb.json's cut.<n>;
// at 1:03 the page is the last page itself (NB88). Seconds are the doc's timeline.
export const CUT = [
  { id: 'cut.1', t: 0, page: 'dark' },
  { id: 'cut.2', t: 5, page: 'cover' },
  { id: 'cut.3', t: 10, page: 'NB01' },
  { id: 'cut.4', t: 17, page: 'leaf' },
  { id: 'cut.5', t: 24, page: 'leaf' },
  { id: 'cut.6', t: 32, page: 'leaf' },
  { id: 'cut.7', t: 41, page: 'leaf' },
  { id: 'cut.8', t: 48, page: 'riffle' },
  { id: 'cut.9', t: 56, page: 'riffle' },
  { id: 'cut.10', t: 63, page: 'NB88', last: true },
  { id: 'cut.11', t: 63, page: 'NB88', last: true, hold: true },
  { id: 'cut.12', t: 0, page: 'close' },
  { id: 'cut.13', t: 3, page: 'black' },
];
export const CUT_MIN_PAGE = 2; // s: any key turns sooner, never faster than this (10 §10.2)

// --- the header line in the contents strip (10 §11.1: date and EP as Walt wrote it, no year) ------------------------------
export function headOf(text) {
  const first = String(text || '').split('\n')[0].trim();
  const parts = first.split(' — ');
  if (parts.length >= 2) return `${parts[0]} — ${parts[1]}`.replace(/[.,;]$/, '');
  const m = /^(.*?\.)\s/.exec(first + ' ');
  return (m ? m[1] : first).trim();
}
// [square brackets] are the second ink, always (10 "How to read this file"); the brackets themselves are not drawn
export function inkParts(text) {
  const out = [], s = String(text || '');
  let i = 0;
  while (i < s.length) {
    const a = s.indexOf('[', i);
    if (a < 0) { out.push({ t: s.slice(i), ink2: false }); break; }
    if (a > i) out.push({ t: s.slice(i, a), ink2: false });
    const b = s.indexOf(']', a + 1);
    if (b < 0) { out.push({ t: s.slice(a + 1), ink2: true }); break; }
    out.push({ t: s.slice(a + 1, b), ink2: true });
    i = b + 1;
  }
  return out.filter((p) => p.t.length);
}
// NB63 runs across stub C: its first day, the stub, then its second day (10 §1)
const DATE_RX = /\n\n(?=(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.? \d)/g;
export function splitAtSecondDay(text) {
  const s = String(text || '');
  DATE_RX.lastIndex = 0;
  const m = DATE_RX.exec(s);
  return m ? [s.slice(0, m.index), s.slice(m.index + 2)] : [s, ''];
}

// --- the book ---------------------------------------------------------------------------------------------------------------
export function buildBook(text = {}) {
  const leaves = [], entries = [];
  const T = (id) => (text[id] && text[id].text) || '';
  const photosAt = {};
  for (const [p, nb] of Object.entries(PHOTO_AT)) if (!POCKET_PHOTOS.includes(p)) (photosAt[nb] || (photosAt[nb] = [])).push(p);
  leaves.push({ key: 'cover', kind: 'cover' });
  const nbIds = Object.keys(text).filter((k) => /^NB\d\d$/.test(k)).sort();
  for (const nb of nbIds) {
    entries.push(nb);
    const stub = STUBS.find((s) => s.inside === nb);
    if (stub) {
      const [a, b] = splitAtSecondDay(T(nb));
      leaves.push({ key: nb, kind: 'nb', nb, part: 1, text: a, title: text[nb].title, photos: photosAt[nb] || [] });
      leaves.push({ key: `stub.${stub.id}`, kind: 'stub', stub: stub.id });
      if (b) leaves.push({ key: `${nb}.2`, kind: 'nb', nb, part: 2, text: b, title: text[nb].title, photos: [] });
    } else {
      leaves.push({ key: nb, kind: 'nb', nb, text: T(nb), title: text[nb].title, photos: photosAt[nb] || [] });
    }
    for (const s of STUBS) if (s.after === nb) leaves.push({ key: `stub.${s.id}`, kind: 'stub', stub: s.id });
  }
  // the rest of the 192 pages are blank after the last one (one blank leaf stands for them), then the back pocket, then
  // the inside back cover; an even count so the back cover sits on a right page, alone
  leaves.push({ key: 'blank', kind: 'blank' });
  leaves.push({ key: 'pocket', kind: 'pocket', pages: POCKET.filter((id) => text[id]), photos: POCKET_PHOTOS.filter((id) => text[id]) });
  if (leaves.length % 2 === 0) leaves.push({ key: 'blank2', kind: 'blank' });
  leaves.push({ key: 'back', kind: 'back' });
  const spreads = [];
  for (let i = 0; i < leaves.length; i += 2) spreads.push([leaves[i], leaves[i + 1] || null]);
  const byNb = {};
  spreads.forEach((sp, n) => sp.forEach((l) => { if (l && l.nb && byNb[l.nb] == null) byNb[l.nb] = n; if (l) l.spread = n; }));
  const contents = entries.map((nb) => ({ nb, head: headOf(T(nb)), spread: byNb[nb] }));
  const nicks = {};
  for (const nb of entries) for (const k of nicksIn(T(nb))) (nicks[k] || (nicks[k] = [])).push(nb);
  return { leaves, spreads, entries, byNb, contents, nicks, last: byNb.NB88 ?? spreads.length - 1, backSpread: spreads.length - 1 };
}
