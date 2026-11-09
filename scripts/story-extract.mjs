// story-extract.mjs: the story's words, pulled from docs/story/*.md by id (campaign-design Part 2 §13).
//
// The docs stay the text of record. This reads the structure they already have and writes one JSON file per doc to
// src/story-data/text/, each stamped with its source doc's hash. Logic (story-data/*.js) refers to the words by id.
//
//   node scripts/story-extract.mjs            extract, write text/*.json and ids.lock.json, print the report
//   node scripts/story-extract.mjs --check    write nothing; exit 1 when a text file is stale (hash or contents) or
//                                             logic references an orphaned id (for the lint and the rigs)
//   --report <file>   write the full report (every unwired (If: …), every untranslated 70 condition) as JSON
//   --quiet           only the summary
//
// Ids by structure:
//   10-notebook   #### NB20 · …  → NB20;  **Torn page 1** → TP1;  **L3 · …** → L3;  the photo table → P1…P12;
//                 the night-one cutscene table → cut.1…
//   20–50         speaker lines under a scene heading → <doc>:<scene>.<n>  (scene = T3, U5, GY-12, or the heading's
//                 section number, 4.2, or <number>/<slug> for an unnumbered heading); player choices → .c<n>;
//                 Walt-page lines (*"…"* in a Gives) → .w<n>
//   60            S<n>.<scene>.<n>  (scene = the Conversations block letter A, B…, or the heading's slug)
//   70            70.<section>.<n>, with the [condition] translated to the condition grammar (Appendix B)
//   anything else <!-- id: some.id -->  before a block (a code block, a paragraph, a list item, a table row);
//                 <!-- list: some.id --> before a list: each item's quote becomes some.id.1, .2, …
//                 Flags after the id: `hint`, `bark` (length limits), `page` (a Walt page line).
//
// Never changes a doc. Node only, no dependencies.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(ROOT, 'src/story-data/ids.lock.json');
export const EXTRACT_V = 1;

// The game-text docs and the file each one extracts to. 00–03 and 90 are design docs: nothing in them is game text
// (00 says "quote nothing from it into the game"), so an anchor there is an error.
export const DOC_FILES = {
  '10': ['10-notebook.md', 'nb.json'],
  '20': ['20-opening.md', 'opening.json'],
  '30': ['30-mining-years.md', 'mining.json'],
  '31': ['31-guiding-years.md', 'guiding.json'],
  '32': ['32-the-boys.md', 'boys.json'],
  '33': ['33-family.md', 'family.json'],
  '40': ['40-company-and-press.md', 'company.json'],
  '50': ['50-finale.md', 'finale.json'],
  '60': ['60-side-stories.md', 'side.json'],
  '70': ['70-world-texture.md', 'world.json'],
};
const DESIGN_DOCS = ['00-owner-decisions.md', '01-bible.md', '02a-voice-journal.md', '02b-voice-people.md',
  '03-places.md', '90-game-needs.md', 'README.md'];
const ARC_DOCS = new Set(['30', '31', '32', '33']);

// Limits (§13): bark ≤ 180 characters, hint ≤ 80, one long speech per arc.
export const LIMITS = { bark: 180, hint: 80, longSpeech: 420, longPerArc: 1 };

// Bold labels that look like a speaker but are design labels.
const NOT_SPEAKERS = new Set(['Gives', 'Walt page', "Walt's entry", 'Rumour', 'Rumours', 'Hook', 'Close', 'Opener',
  'LIE', 'Lie', 'Lies about', 'Voice', 'Words', 'Trade', 'Then', 'Needs', 'Wants', 'Fears', 'Condition', 'Window',
  'Where', 'When', 'Found', 'Fires', 'Place', 'Person', 'Secret', 'Schedule', 'Trips', 'Week', 'Topics', 'Barks',
  'The choice', 'The notice', 'Trigger', 'Note', 'Example', 'Draft', 'Sign', 'Knew', 'Ring', 'Rings', 'Rule', 'Why',
  'Ollie says', 'First stamped', 'Walt asked Hap about the plane']);

export const hashText = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
export const bodyHash = (text) => hashText(JSON.stringify(text));
const h8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);
const slug = (s) => s.toLowerCase().replace(/[*_`"'’()[\]{}]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  .split('-').slice(0, 4).join('-');
const clean = (s) => s.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------------------------------------------
// Blocks: headings, code, tables, paragraphs, list items (with their wrapped lines), anchors.

export function blocks(src) {
  // A blockquote line is a reply: its '>' goes, and the first line of each quote gets the reply mark '⟩'.
  // qg[k] numbers each run of '>' lines, so an anchor before a quote takes all of its paragraphs.
  const qg = [];
  let g = 0;
  const L = src.split('\n').map((l, k, all) => {
    const m = l.match(/^(\s*)>\s?(.*)$/);
    if (!m) { qg.push(0); return l; }
    const prevQ = k > 0 && /^\s*>/.test(all[k - 1]);
    if (!prevQ) g++;
    qg.push(g);
    return m[1] + (prevQ ? '' : '⟩ ') + m[2];
  });
  const out = [];
  let i = 0;
  while (i < L.length) {
    const line = L[i];
    const ln = i + 1;
    let m;
    if (/^\s*```/.test(line)) {
      const ind = line.match(/^\s*/)[0].length;
      const body = [];
      i++;
      while (i < L.length && !/^\s*```/.test(L[i])) { body.push(L[i].slice(Math.min(ind, L[i].match(/^\s*/)[0].length))); i++; }
      i++;
      out.push({ t: 'code', text: body.join('\n'), ln });
      continue;
    }
    if ((m = line.match(/^\s*<!--\s*(id|list|quote|not-text):\s*([A-Za-z0-9_.:\-]*)\s*([^>]*?)\s*-->\s*$/))) {
      out.push({ t: 'anchor', mode: m[1], id: m[2], flags: m[1] === 'not-text' ? [] : m[3].split(/\s+/).filter(Boolean), ln });
      i++; continue;
    }
    if (/^\s*<!--/.test(line)) { while (i < L.length && !/-->/.test(L[i])) i++; i++; continue; }
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { out.push({ t: 'h', level: m[1].length, text: m[2].trim(), ln }); i++; continue; }
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^---+\s*$/.test(line)) { out.push({ t: 'hr', ln }); i++; continue; }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < L.length && /^\s*\|/.test(L[i])) { rows.push(splitRow(L[i])); i++; }
      const sep = rows.length > 1 && rows[1].every((c) => /^:?-+:?$/.test(c));
      out.push({ t: 'table', head: sep ? rows[0] : null, rows: sep ? rows.slice(2) : rows, ln });
      continue;
    }
    if ((m = line.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/))) {
      const ind = m[1].length;
      const parts = [m[2]];
      i++;
      const numbered = /^\s*\d+\./.test(line);
      // A wrapped line ("11. Supports …" after a hard wrap) is not a new item unless it bullets, or numbers at
      // this item's own indent inside a numbered list.
      const starts = (l) => /^\s*[-*+]\s+/.test(l) || (/^\s*\d+\.\s+/.test(l) && (numbered && l.match(/^\s*/)[0].length <= ind || l.match(/^\s*/)[0].length > ind && /^\s*1\.\s/.test(l)));
      while (i < L.length && L[i].trim() && !starts(L[i]) && !/^\s*```/.test(L[i]) &&
        !/^#/.test(L[i]) && !/^\s*\|/.test(L[i]) && !/^\s*<!--/.test(L[i])) {
        parts.push(L[i].trim()); i++;
      }
      out.push({ t: 'item', ind, text: parts.join(' '), ln });
      continue;
    }
    const parts = [line.trim()];
    i++;
    while (i < L.length && L[i].trim() && !/^\s*(?:[-*+]|1\.)\s+/.test(L[i]) && !/^\s*```/.test(L[i]) &&
      !/^#/.test(L[i]) && !/^\s*\|/.test(L[i]) && !/^\s*<!--/.test(L[i])) { parts.push(L[i].trim()); i++; }
    out.push({ t: 'p', text: parts.join(' '), ln, qg: qg[ln - 1] });
  }
  return out;
}

function splitRow(line) {
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cur = '', tick = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '`') tick = !tick;
    if (c === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue; }
    if (c === '|' && !tick) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

// ---------------------------------------------------------------------------------------------------------------
// Tokens inside a block of dialogue. The docs use three notations, all read by one machine:
//   20/30/31/40/50   **Tauno:** "…"   **Tauno** (louder): "…"   *(If warm:)* "…" (a variant)   - **"Sorry?"** → T2
//   32/33            - *"You knew Walt?"* (a choice) then > "…" or → "…" (the reply, said by the scene's person)
//   60               OLLIE: "…"   ▸ "…" (a choice)   → OLLIE: "…"
// Stage directions in [brackets] are skipped; *(…)* and (If: …) are conditions, kept as prose for the wiring.

const TOK = [
  ['spk', /\*\*([A-Z][^*:\n]{0,40}?):\*\*/y],
  ['spkm', /\*\*([A-Z][^*:\n]{0,40}?)\*\*\s*\(([^)]*)\):/y],
  ['caps', /([A-Z][A-Z'.]+(?: [A-Z][A-Z'.]+){0,3}):(?=\s*(?:"|\*\[|\*\(|\[))/y],
  ['choice', /▸/y],
  ['reply', /⟩/y],
  ['bq', /\*\*"([^"]+)"\*\*/y],
  ['bact', /\*\*\[([^\]]+)\]\*\*/y],
  ['iq', /\*"([^"]+)"\*/y],
  ['var', /\*\(([^)]*?):\)\*/y],
  ['cond', /\*\(([^)]*)\)\*/y],
  ['ifp', /\((If|if|needs|Needs):\s*([^)]*)\)/y],
  ['stage', /\*?\[[^\]]*\]\*?/y],
  ['goto', /→\s*((?:[A-Z]{1,3}-?\d+[a-z]?)|end)\b(?!\s*")/y],
  ['arrow', /→/y],
  ['q', /"([^"]+)"/y],
  ['bold', /\*\*[^*]+\*\*/y],
];
const QUOTED_NEXT = /^\s*(?:(?:\*?\[[^\]]*\]\*?|\*\([^)]*\)\*|\([^)]*\))\s*)*"/;
// Labels that may introduce a line said by the scene's person: **Close:** "…", **Opener:** "…".
const LINE_LABELS = new Set(['Close', 'Opener', 'Rumour', 'Bark', 'Hook']);
const NOT_FIRST = /^(The|A|An|On|In|At|To|Tier|After|Before|What|Where|When|Why|Who|How|If|Extra|Little|Four|Tell|Walt's|Name|Every|Each|Any|All|No|Not|One|Two|Three|Week|Day|Night|Then|Also|Or|And|But|From|With|Without|For|Read|Back|Front)\b/;

export function tokens(s, known) {
  const out = [];
  let i = 0, gap = '';
  const flush = () => { if (/[A-Za-z0-9]/.test(gap)) out.push({ k: 'gap', v: gap.trim() }); gap = ''; };
  while (i < s.length) {
    let hit = null;
    for (const [k, re] of TOK) {
      re.lastIndex = i;
      const m = re.exec(s);
      if (m) { hit = { k, m }; break; }
    }
    if (!hit) { gap += s[i]; i++; continue; }
    flush();
    const { k, m } = hit;
    i += m[0].length;
    if (k === 'spk' || k === 'spkm' || k === 'caps') {
      const name = k === 'caps' ? titleCase(m[1].trim()) : m[1].trim();
      const quoted = QUOTED_NEXT.test(s.slice(i));
      if (quoted && isSpeaker(name, known)) out.push({ k: 'spk', v: name, how: k === 'spkm' ? clean(m[2]) : undefined });
      else out.push({ k: 'label', v: name, quoted, how: k === 'spkm' ? clean(m[2]) : undefined });
    } else if (k === 'bold' || k === 'stage') out.push({ k, v: m[0] });
    else if (k === 'ifp') out.push({ k: 'cond', v: clean(m[1] + ': ' + m[2]) });
    else if (k === 'cond' && /^[A-Z][^]*[.!]$/.test(m[1].trim()) && !/^(If|Needs|After|Always|Once|Only)\b/.test(m[1].trim())) out.push({ k: 'stage', v: m[0] });
    else out.push({ k, v: m[1] !== undefined ? clean(m[1]) : m[0] });
  }
  flush();
  return out;
}
const titleCase = (s) => s.toLowerCase().replace(/(^|[ .'-])([a-z])/g, (a, b, c) => b + c.toUpperCase());
function isSpeaker(name, known) {
  if (NOT_SPEAKERS.has(name) || LINE_LABELS.has(name)) return false;
  if (known) return known.has(name);
  return looksLikeName(name);
}
const looksLikeName = (name) => !NOT_FIRST.test(name) && !/[\d"(),`]/.test(name) && name.split(' ').length <= 3 &&
  name.split(' ').every((w) => /^[A-Z]/.test(w));

// Who speaks in these docs: every bold or capitals label followed by a quote that looks like a name (capitalised
// words, no article or design word first). Found in a first pass so the heading's person and a bare label before a
// table resolve to the same set, and a design label ("Tier 1:", "The lie:", "Little Sag:") is never a person.
export function knownSpeakers(srcs) {
  const n = new Map();
  for (const src of srcs) {
    const flat = src.replace(/\n\s*/g, ' ');
    for (const re of [/\*\*([A-Z][^*:\n]{0,40}?):\*\*/g, /\*\*([A-Z][^*:\n]{0,40}?)\*\*\s*\([^)]*\):/g,
      /(?:^|[\s>▸→])([A-Z][A-Z'.]+(?: [A-Z][A-Z'.]+){0,3}):(?=\s*(?:"|\*\[|\*\(|\[))/g]) {
      for (const m of flat.matchAll(re)) {
        const raw = m[1].trim();
        const name = /^[A-Z'. ]+$/.test(raw) && raw.length > 1 ? titleCase(raw) : raw;
        if (!QUOTED_NEXT.test(flat.slice(m.index + m[0].length))) continue;
        if (NOT_SPEAKERS.has(name) || LINE_LABELS.has(name) || !looksLikeName(name)) continue;
        n.set(name, (n.get(name) || 0) + 1);
      }
    }
  }
  return new Set(n.keys());
}

// ---------------------------------------------------------------------------------------------------------------
// 70's bracketed conditions → the condition grammar (Appendix B). What can't be translated stays as prose in `who`
// or `note` and is listed in the report.

export function translate70(raw) {
  const res = { when: [], once: false, rare: false, ground: [], prose: [], side: [] };
  if (!raw) return res;
  let s = raw;
  const ticks = [];
  s = s.replace(/`([^`]+)`\+/g, '`$1`');
  s = s.replace(/`([^`]+)`(?:\s*[–-]\s*`([^`]+)`)?(?:\s*\/\s*`([^`]+)`)?/g, (_, a, b, c) => { ticks.push([a, b, c]); return ' \u0001 '; });
  for (const [a, b, c] of ticks) {
    const t = atom70(a, b, c);
    if (t.when) res.when.push(t.when);
    if (t.once) res.once = true;
    if (t.ground) res.ground.push(...t.ground);
    if (t.prose) res.prose.push(t.prose);
  }
  for (let part of s.split(/[,;]/)) {
    part = part.replace(/\u0001/g, '').trim();
    if (!part) continue;
    // a bare S<n> (no backticks) is a side story's tag (60-side-stories.md: §6.1's rumours, "S8" the sled), not a
    // stage: the doc writes every stage condition in backticks
    if (/^S\d+$/.test(part)) { res.side.push(part); continue; }
    const t = atom70(part);
    if (t.when) res.when.push(t.when);
    else if (t.once) res.once = true;
    else if (/^rare$/i.test(part)) res.rare = true;
    else if (/^any$/i.test(part)) continue;
    else res.prose.push(part);
  }
  res.when = [...new Set(res.when)];
  return res;
}

function atom70(a, b, c) {
  a = a.trim();
  let m;
  if (b && /^S\d$/.test(a) && /^S\d$/.test(b)) return { when: `${a}-${b}` };
  if ((m = a.match(/^S7\s+(J|JN|M)$/))) return { when: c ? `end:${m[1]}|${c}` : `end:${m[1]}` }; // Appendix B's value list
  if (/^S\d$/.test(a)) return { when: `stage>=${a}` };
  if ((m = a.match(/^(S\d)\s*[–-]\s*(S\d)$/))) return { when: `${m[1]}-${m[2]}` };
  if (/^t[1-4]$/.test(a)) return { when: a };
  if (/^(J|JN|M)$/.test(a)) return { when: `end:${a}` };
  if (a === 'north') return { when: 'north' };
  if (a === 'once') return { once: true };
  if (a === 'home' || a === '!home') return { when: a };
  if (a === 'carrying') return { when: 'carrying:waltpack' };
  if ((m = a.match(/^knows:([\w-]+)$/))) return { when: /^N\d+$/.test(m[1]) ? `und:${m[1]}` : `knows.${m[1]}` };
  if ((m = a.match(/^ev:([\w-]+)(@here)?$/))) return { when: `ev.${m[1]}${m[2] || ''}` };
  if ((m = a.match(/^ev:([\w-]+)@(\w+)$/))) return { when: `ev.${m[1]}@${m[2]}` };
  if ((m = a.match(/^prop:([\w.-]+)$/))) return { when: `prop:${m[1]}` };
  if ((m = a.match(/^month:(\d+)(?:\s*[–-]\s*(\d+))?$/))) return { when: m[2] ? `month:${m[1]}-${m[2]}` : `month:${m[1]}` };
  if ((m = a.match(/^needs:([\w,\s-]+)$/))) return { ground: m[1].split(',').map((x) => x.trim()).filter(Boolean) };
  if ((m = a.match(/^(visits|trips)\s*(?:≥|>=)\s*(\d+)$/))) return { when: m[1] === 'visits' ? `visits:here>=${m[2]}` : `trips>=${m[2]}` };
  if ((m = a.match(/^dow:(\w+)$/))) return { when: `dow:${m[1].toLowerCase()}` };
  return { prose: a };
}

// ---------------------------------------------------------------------------------------------------------------
// The extractor proper.

function sceneOf(text) {
  let m;
  if ((m = text.match(/^((?:NB\d+)|(?:[A-Z]{1,3}-[A-Z]?\d+[a-z]?)|(?:[A-Z]{1,2}\d+[a-z]?))\s*(?:[·—:-]|$)/))) return { id: m[1], scene: true };
  if ((m = text.match(/^(\d+(?:\.\d+)*)\.?\s/))) return { id: m[1], num: true };
  return null;
}

// 70's bracket prose that names who says a line ("A retired local on a dock", "An old solo on a carry", "Kid").
const WHO70 = /\b(keepers?|locals?|solos?|hands?|weekenders?|paddlers?|kids?|parents?|partners?|rangers?|anglers?|guides?|party|parties|man|woman|fellas?|canadians?|staffers?|someone|anyone|old-timers?|retired|couple|family|dad|mom|outfitters?|crew)\b/i;
// Builders' sections: rules, checks and continuity notes quote lines as examples; nothing there is game text.
const SKIP_HEAD = /^(?:\d+(?:\.\d+)*\.?\s+)?(?:Checks\b|New details\b|Flags and triggers\b|How to read the conditions|How talk stays grounded|Review notes)/i;
const kindOf = (flags) => (flags.includes('page') ? 'page' : flags.includes('hint') ? 'hint' : flags.includes('bark') ? 'bark' : 'block');

export function extractDoc(key, src, known) {
  const B = blocks(src);
  const ents = {};
  const order = [];
  const notes = { unwired: [], untranslated: [], codeUnanchored: [], dup: [], quotes: [] };
  const put = (id, e, ln) => {
    if (ents[id]) { notes.dup.push({ id, ln }); return null; }
    ents[id] = e; order.push(id);
    Object.defineProperty(e, '_ln', { value: ln, enumerable: false, writable: true });
    return id;
  };
  const counters = new Map();
  const nextN = (base, kind) => { const k = base + '|' + kind; const v = (counters.get(k) || 0) + 1; counters.set(k, v); return v; };

  // ---- heading context
  const heads = [];
  const ctx = { base: `${key}:0`, scene: false, lastSpk: null, person: null, sec70: '0', who70: null, pool: null,
    story60: null, conv60: false, letter: null, blockIf: null };
  const baseId = () => {
    if (key === '70') return `70.${ctx.sec70}`;
    if (key === '60' && ctx.story60) {
      const h = heads[heads.length - 1];
      if (ctx.conv60) return `${ctx.story60}.${ctx.letter || 'conv'}`;
      return h.level <= 2 ? `${ctx.story60}.0` : `${ctx.story60}.${slug(h.text)}`;
    }
    for (let k = heads.length - 1; k >= 0; k--) {
      const sc = sceneOf(heads[k].text);
      if (sc && sc.scene) return `${key}:${sc.id}`;
      if (sc && sc.num) {
        const tail = heads.slice(k + 1).map((h) => slug(h.text)).filter(Boolean);
        return `${key}:${sc.id}${tail.length ? '/' + tail.join('/') : ''}`;
      }
    }
    const h = heads[heads.length - 1];
    return `${key}:${h ? slug(h.text) : '0'}`;
  };
  const isScene = () => {
    if (key === '70') return true;
    if (key === '60') return ctx.conv60 || !!ctx.story60;
    for (let k = heads.length - 1; k >= 0; k--) { const sc = sceneOf(heads[k].text); if (sc) return !!sc.scene || heads[k].level >= 3; }
    return false;
  };
  // A scene's own person: the first name in the heading that is a known speaker ("5.1 Carol, the first time",
  // "GY-03 · Hap on the porch", "8.4 Arvid Strand, Round Lake 51").
  const personOf = () => {
    for (let k = heads.length - 1; k >= 0 && k >= heads.length - 2; k--) {
      const t = heads[k].text.replace(/^[\w.-]+\s*[·—:.]?\s*/, (x) => (sceneOf(heads[k].text) ? '' : x));
      for (const w of t.split(/[\s,:·—()*]+/)) {
        if (!w) continue;
        if (known.has(w)) return w;
        const two = t.match(new RegExp(`\\b${w}\\s+[A-Z][a-z]+`));
        if (two && known.has(two[0])) return two[0];
      }
    }
    return null;
  };
  const setHeading = (b) => {
    while (heads.length && heads[heads.length - 1].level >= b.level) heads.pop();
    heads.push(b);
    ctx.pool = null; ctx.letter = null; ctx.blockIf = null;
    let m;
    if (key === '60') {
      if (b.level <= 2) { ctx.story60 = (m = b.text.match(/^(S\d+)\./)) ? m[1] : null; ctx.conv60 = false; }
      if (b.level === 3) ctx.conv60 = /^Conversations\b/.test(b.text);
    }
    if (key === '70') {
      const sc = sceneOf(b.text);
      if (sc && sc.num) ctx.sec70 = sc.id;
      m = b.text.match(/^8\.\d+\s+([^,(]+)/);
      ctx.who70 = m ? m[1].trim() : null;
    }
    ctx.base = baseId();
    ctx.scene = isScene();
    ctx.person = key === '70' ? ctx.who70 : personOf();
    ctx.lastSpk = null;
  };

  // ---- anchors
  let pending = null;
  // ---- the notebook
  let nbCur = null, nbLoose = null;
  // ---- choices by list indent, so a nested reply knows the choice it answers
  const choiceAt = new Map();

  let skipLevel = 0;
  for (let bi = 0; bi < B.length; bi++) {
    const b = B[bi];
    if (b.t === 'h' && skipLevel && b.level <= skipLevel) skipLevel = 0;
    if (b.t === 'h' && !skipLevel && SKIP_HEAD.test(b.text)) skipLevel = b.level;
    if (skipLevel && b.t !== 'anchor' && !(pending && pending.mode === 'id')) continue;
    if (b.t === 'anchor') { pending = { ...b, n: 0 }; continue; }
    if (b.t === 'h') {
      setHeading(b);
      choiceAt.clear();
      nbCur = null; nbLoose = null;
      if (key === '10' && b.level === 4) {
        const m = b.text.match(/^(NB\d+)\s*·\s*(.*?)(?:\s*·\s*\[(N\d+)\])?\s*$/);
        if (m) { const e = { k: 'nb', title: m[2] }; if (m[3]) e.key = m[3]; e.text = ''; put(m[1], e, b.ln); nbCur = e; }
      }
      if (pending && pending.mode === 'list') pending = null;
      continue;
    }
    if (b.t === 'hr') { if (pending && pending.mode === 'list') pending = null; continue; }

    // ---- anchors: not-text skips the next block; quote checks it against an id; id and list name it
    if (pending && pending.mode === 'not-text') { pending = null; continue; }
    if (pending && pending.mode === 'quote') {
      notes.quotes.push({ of: pending.id, text: b.t === 'code' ? b.text : plain(b.text), ln: b.ln });
      pending = null; continue;
    }
    if (pending && (pending.mode === 'id' || b.t === 'item')) {
      const a = pending;
      if (a.mode === 'id') pending = null;
      const id = a.mode === 'list' ? `${a.id}.${++a.n}` : a.id;
      let e;
      if (b.t === 'item' && (e = speakerItem(b.text))) {
        if (a.flags.includes('bark')) e.bark = true;
      } else {
        let text = b.t === 'code' ? b.text : b.t === 'table' ? b.rows.map((r) => r.join(' | ')).join('\n') : b.t === 'item' ? quotedOr(b.text) : plain(b.text);
        while (b.t === 'p' && b.qg && B[bi + 1] && B[bi + 1].t === 'p' && B[bi + 1].qg === b.qg) text += '\n\n' + plain(B[++bi].text);
        e = { k: kindOf(a.flags), text };
        const cond = b.t === 'item' && b.text.match(/\)\s*$/) && b.text.match(/\(([^()]*)\)\s*$/);
        if (cond) e.if = clean(cond[1]);
      }
      put(id, e, b.ln);
      if (e.if) notes.unwired.push({ id, if: e.if });
      continue;
    }
    if (pending && pending.mode === 'list') pending = null;

    // ---- the notebook (10): entries, torn pages, loose pages, photos, the cutscene
    if (key === '10') {
      if (b.t === 'code' && nbCur) { nbCur.text = nbCur.text ? nbCur.text + '\n\n' + b.text : b.text; continue; }
      if (b.t === 'p') {
        let m;
        if ((m = b.text.match(/^\*\*Torn page (\d)\b/))) { nbLoose = { k: 'nb', title: `torn page ${m[1]}`, text: '' }; put(`TP${m[1]}`, nbLoose, b.ln); continue; }
        if ((m = b.text.match(/^\*\*(L\d+)\s*·\s*([^*]+)\*\*\s*(.*)$/))) {
          nbLoose = { k: 'nb', title: m[2].trim(), text: '' };
          put(m[1], nbLoose, b.ln);
          const after = m[3].replace(/^\*\[[^\]]*\]\*\s*/, '').trim();
          if (after) nbLoose.text = after; else nbLoose._desc = true;
          continue;
        }
        if (nbLoose && nbLoose._desc && !/^\*/.test(b.text)) { nbLoose.text = b.text; nbLoose._desc = false; continue; }
      }
      if (b.t === 'code' && nbLoose) {
        nbLoose.text = nbLoose._code ? nbLoose.text + '\n\n' + b.text : b.text;
        nbLoose._code = true; nbLoose._desc = false; continue;
      }
      if (b.t === 'table' && b.head && /^#$/.test(b.head[0]) && /shows/i.test(b.head[1] || '')) {
        for (const r of b.rows) {
          const id = (r[0].match(/P\d+/) || [])[0];
          if (!id) continue;
          const back = r[1].match(/Back(?:,[^:]*)?:\s*\*([^*]+)\*/);
          const e = { k: 'photo', text: clean(r[1].replace(/\s*Back(?:,[^:]*)?:.*$/, '')), taken: r[2] };
          if (back) e.back = back[1].trim();
          put(id, e, b.ln);
        }
        continue;
      }
      if (b.t === 'table' && b.head && /^Time$/i.test(b.head[0]) && /legible/i.test(b.head.join(' '))) {
        const li = b.head.findIndex((h) => /legible/i.test(h));
        let n = 0;
        for (const r of b.rows) {
          const e = { k: 'cut', at: r[0], picture: clean(r[1]), text: clean((r[li] || '').replace(/`/g, '')), sound: clean(r[li + 1] || '') };
          if (e.text === '—') e.text = '';
          put(`cut.${++n}`, e, b.ln);
        }
        continue;
      }
      continue; // the rest of the notebook doc is builders' prose; its Walt-page drafts take an anchor
    }

    // ---- code blocks outside the notebook are text only when anchored (a verbatim notebook quote is checked)
    if (b.t === 'code') { notes.codeUnanchored.push({ base: ctx.base, ln: b.ln, text: b.text }); continue; }

    // ---- pools and block letters
    if (b.t === 'p') {
      let m;
      if ((m = b.text.match(/^\*\*(Rumours|Barks)\*\*/))) { ctx.pool = m[1] === 'Barks' ? 'bark' : 'rumour'; continue; }
      if (key === '60' && ctx.conv60 && (m = b.text.match(/^\*\*([A-Z])\.\s+([^*]+)\*\*\s*(?:\*\(([^)]*)\)\*)?/))) {
        ctx.letter = m[1]; ctx.base = baseId(); ctx.lastSpk = null; choiceAt.clear();
        ctx.blockIf = m[3] ? clean(m[3]) : null; ctx.blockIfUsed = false;
        continue;
      }
      // a bare speaker label ("**Josie** (by the week):", "**Keeper** (by manner):") names who says the table below
      if ((m = b.text.match(/^\*\*([A-Z][^*:]{0,40}?)(?::\*\*|\*\*\s*(?:\([^)]*\))?:)\s*$/)) && known.has(m[1].trim())) { ctx.lastSpk = m[1].trim(); continue; }
    }
    if (key === '70' && b.t === 'p' && !/^\s*[["]/.test(b.text)) continue;
    if (b.t === 'p' || b.t === 'item') dialogue(b, b.text, {});
    else if (b.t === 'table') table(b);
  }

  // A plain block's words: emphasis marks and the reply mark go, the text stays.
  function plain(text) { return clean(text.replace(/⟩/g, '').replace(/\s*\*?\[[^\]]*\]\*?/g, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')); }
  // An anchored list item said by someone: `One: "…" / Base: "…"`, `Base (04:30): "…"`, `(if …) Base: "…"`, `(r)`.
  function speakerItem(text) {
    const segs = text.split(/\s+\/\s+(?=(?:\([^)]*\)\s*)?[A-Z][\w]*(?: [A-Z][\w]*)?(?: \([^)]*\))?:\s*")/);
    const parts = [];
    let pre = null, repeat = false;
    for (const seg of segs) {
      const m = seg.match(/^(?:\(([^)]*)\)\s*)?([A-Z][\w]*(?: [A-Z][\w]*)?)(?: \(([^)]*)\))?:\s*((?:"[^"]*"(?:\s*\/?\s*\([^)]*\)\s*)*\s*)+)(.*)$/);
      if (!m) return null;
      if (m[1] && !parts.length) pre = clean(m[1]);
      const words = [...m[4].matchAll(/"([^"]+)"/g)].map((x) => x[1]).join(' ');
      if (/\(r\)/.test(m[4] + m[5])) repeat = true;
      const p = { who: m[2], text: clean(words) };
      if (m[3]) p.how = clean(m[3]);
      parts.push(p);
    }
    if (!parts.length) return null;
    const e = { k: 'line', who: parts[0].who, text: parts[0].text };
    if (parts[0].how) e.how = parts[0].how;
    if (pre) e.if = pre;
    if (repeat) e.repeat = true;
    if (parts.length > 1) e.then = parts.slice(1);
    return e;
  }
  function quotedOr(text) {
    const turn = text.match(/^\s*"([^"]+)"\s*→\s*"([^"]+)"/); // a line that turns: "Drowned" → "Went north."
    if (turn) return clean(turn[2]);
    const q = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    return q.length ? clean(q.join(' ')) : clean(text.replace(/^\*+|\*+$/g, ''));
  }

  // A table of lines: a cell that starts with a quote is a line, one that starts with *"…"* a player's choice.
  function table(b) {
    if (!b.head) return;
    for (const r of b.rows) {
      let rowChoice = null;
      for (let ci = 0; ci < r.length; ci++) {
        const cell = r[ci];
        const hd = clean((b.head[ci] || '').replace(/\*/g, ''));
        if (/^\*"/.test(cell) && (ci > 0 || /choice|follow|player|you say|ask/i.test(hd))) {
          const t = cell.match(/^\*"([^"]+)"\*/);
          const e = { k: 'choice', text: clean(t[1]) };
          const ni = b.head.findIndex((h) => /^\**\s*(needs|if|when|shown when)\b/i.test(h));
          if (ni >= 0 && r[ni] && !/^[—-]$/.test(r[ni].trim())) e.if = clean(r[ni]);
          rowChoice = put(`${ctx.base}.c${nextN(ctx.base, 'c')}`, e, b.ln);
          if (e.if) notes.unwired.push({ id: rowChoice, if: e.if });
          continue;
        }
        if (ci === 0 || !/^(?:\*\([^)]*\)\*\s*)?"/.test(cell)) continue;
        const first = hd.split(/[\s']/)[0];
        const h0 = clean(b.head[0].replace(/\*/g, ''));
        const c0 = clean(r[0].replace(/\*/g, ''));
        const paren = c0.match(/\(([A-Z][a-zé]+)\)/);
        const rowWho = /^(who|keeper|person|speaker)\b/i.test(h0) ? c0.replace(/\s*\(.*$/, '') : paren && (known.has(paren[1]) || key === '70') ? paren[1] : null;
        const who = rowWho || (known.has(first) ? first : key === '70' ? null : (ctx.lastSpk || ctx.person));
        const when = rowChoice ? null : `${h0}: ${c0}`;
        const kind = /walt page|the page|book/i.test(hd) ? 'page' : /\bdot\b|verb|label/i.test(hd) ? 'dot' : null;
        dialogue(b, cell, { forceLine: true, when, who, after: rowChoice, kind });
      }
    }
  }

  // One block of dialogue: speaker lines, variants, choices, Walt-page lines.
  function dialogue(b, text, opt) {
    const T = tokens(text, known);
    if (!T.length) return;
    const base = ctx.base;
    const isItem = b.t === 'item';
    let parentChoice = opt.after || undefined;
    if (isItem) {
      const up = [...choiceAt.entries()].filter(([ind]) => ind < b.ind).sort((x, y) => y[0] - x[0])[0];
      if (up) parentChoice = up[1];
      for (const ind of [...choiceAt.keys()]) if (ind >= b.ind) choiceAt.delete(ind);
    }
    const dflt = opt.who || ctx.lastSpk || ctx.person;
    let spk = dflt, how, expect = opt.forceLine ? 'line' : 'idle', cur = null, choice = null, tag = null;
    let when = opt.when || null, of = null, pendIf = null, firstLine = null;
    const pageCtx = /\bGives\b|Walt page/.test(text);
    let cond70 = null, tail70 = null, pre70 = '';
    if (key === '70') {
      const lead = text.match(/^\s*\[([^\]]*)\]/);
      if (lead) cond70 = lead[1];
      const trail = text.match(/"\s*((?:\[[^\]]*\][\s;,.]*)+)$/);
      if (trail) tail70 = [...trail[1].matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]).join(', ');
      expect = 'line';
    }
    // a list item that opens on a quote is a line by the scene's person (60's rotating lines, 32's openers);
    // one that opens on "label: " sets that label as the line's state ("default:", "rock:", "carrying Walt's pack:")
    const firstReal = T.find((t) => t.k !== 'stage' && t.k !== 'cond' && t.k !== 'var');
    if (isItem && ctx.scene && expect === 'idle') {
      if (firstReal && firstReal.k === 'q') expect = 'line';
      if (firstReal && firstReal.k === 'gap' && /^[^"]{1,60}:$/.test(firstReal.v) && T[T.indexOf(firstReal) + 1]?.k === 'q') {
        when = firstReal.v.replace(/:$/, ''); expect = 'line'; firstReal.used = true;
      }
    }
    // 32/33: a list item that opens on *"…"* is the player's choice
    const iqChoice = isItem && firstReal && firstReal.k === 'iq' && T.indexOf(firstReal) <= 1;

    const newLine = (v) => {
      const e = opt.kind ? { k: opt.kind, text: v } : { k: 'line', who: spk || null, text: v };
      if (how) e.how = how;
      if (when) e.when = when;
      if (of) e.of = of;
      if (tag) e.tag = tag;
      const ifs = [pendIf, ctx.blockIf && !ctx.blockIfUsed && !choice && !parentChoice ? ctx.blockIf : null].filter(Boolean);
      if (ctx.blockIf) ctx.blockIfUsed = true;
      if (ifs.length) e.if = ifs.join('; ');
      if (choice || parentChoice) e.after = choice || parentChoice;
      if (ctx.pool) e.pool = ctx.pool;
      if (key === '70') {
        const tr = translate70([cond70, tail70].filter(Boolean).join(', '));
        if (tr.when.length) e.cond = tr.when.join(' & ');
        if (tr.once) e.once = true;
        if (tr.rare) e.rare = true;
        if (tr.ground.length) e.ground = tr.ground;
        if (tr.side.length) e.side = tr.side.join(',');
        if (tr.prose.length) {
          if (!spk && cond70 && cond70.includes(tr.prose[0]) && WHO70.test(tr.prose[0])) e.who = tr.prose.shift();
          const qi = tr.prose.findIndex((x) => /\?$/.test(x));
          if (qi >= 0 && !pre70) e.topic = tr.prose.splice(qi, 1)[0];
          if (tr.prose.length) { e.note = tr.prose.join(', '); notes.untranslated.push({ id: null, note: e.note }); }
        }
        if (pre70) e.topic = pre70;
      }
      const id = put(`${base}.${nextN(base, 'n')}`, e, b.ln);
      if (e.if) notes.unwired.push({ id, if: e.if });
      firstLine = firstLine || id;
      pendIf = null; when = opt.when || null; of = null; tag = null;
      return e;
    };
    const newChoice = (v, act) => {
      const e = { k: 'choice', text: v };
      if (act) e.act = true;
      if (parentChoice) e.after = parentChoice;
      if (pendIf) { e.if = pendIf; pendIf = null; }
      const id = put(`${base}.c${nextN(base, 'c')}`, e, b.ln);
      choice = id; if (isItem) choiceAt.set(b.ind, id);
      expect = 'afterLabel'; cur = null;
      return id;
    };
    for (let ti = 0; ti < T.length; ti++) {
      const t = T[ti];
      switch (t.k) {
        case 'spk': spk = t.v; how = t.how; ctx.lastSpk = spk; expect = 'line'; cur = null; break;
        case 'label':
          if (t.quoted && LINE_LABELS.has(t.v)) { tag = t.v.toLowerCase(); spk = dflt; how = t.how; expect = 'line'; }
          else expect = 'idle';
          cur = null; break;
        case 'var': when = t.v; of = firstLine || lastLineId(base); expect = 'line'; cur = null; break;
        case 'cond':
          if (choice && expect === 'afterLabel') {
            ents[choice].if = ents[choice].if ? ents[choice].if + '; ' + t.v : t.v;
            notes.unwired.push({ id: choice, if: t.v });
          } else if (cur) cur.if = cur.if ? cur.if + '; ' + t.v : t.v;
          else pendIf = t.v;
          break;
        case 'choice': expect = 'label'; cur = null; break;
        case 'bq': case 'bact': newChoice(t.v, t.k === 'bact'); break;
        case 'iq': {
          if (iqChoice && t === firstReal) { newChoice(t.v); spk = dflt; break; }
          if (expect === 'line' && spk && !pageCtx) { cur = newLine(t.v); expect = 'more'; break; }
          if (!pageCtx) break;
          const e = { k: 'page', text: t.v };
          if (choice || parentChoice) e.after = choice || parentChoice;
          put(`${base}.w${nextN(base, 'w')}`, e, b.ln);
          expect = 'idle'; cur = null; break;
        }
        case 'goto': if (choice) ents[choice].to = t.v; expect = 'idle'; cur = null; break;
        case 'arrow': case 'reply':
          expect = 'cont'; cur = null;
          if (t.k === 'reply' || choice) spk = spk || dflt;
          break;
        case 'q':
          if (expect === 'label') newChoice(t.v);
          else if (expect === 'more' && cur) cur.text += ' ' + t.v;
          else if (expect === 'line' || expect === 'cont') {
            if (!spk && expect === 'cont') spk = dflt;
            if (spk || key === '70' || opt.forceLine) { cur = newLine(t.v); expect = 'more'; }
          } else if (key === '70' && firstLine) { of = firstLine; cur = newLine(t.v); expect = 'more'; }
          break;
        case 'stage': break;
        case 'gap':
          if (t.used) break;
          if (key === '70') {
            if (!firstLine) pre70 = t.v.replace(/[:\s]+$/, '').replace(/^\[[^\]]*\]\s*/, '');
            else when = t.v.replace(/^[\];,.\s]+|[:;,\s]+$/g, '') || null;
            cur = null; expect = firstLine ? 'idle' : 'line';
            break;
          }
          cur = null;
          if (expect !== 'afterLabel') expect = 'idle';
          break;
        default: break;
      }
    }
  }
  function lastLineId(base) {
    for (let k = order.length - 1; k >= 0; k--) { const id = order[k]; if (id.startsWith(base + '.') && ents[id].k === 'line') return id; }
    return null;
  }
  return { ents, order, notes };
}

// ---------------------------------------------------------------------------------------------------------------
// The run: every doc, the lock, the report.

export function extractAll({ root = ROOT } = {}) {
  const docs = join(root, 'docs/story');
  const files = {};
  const report = { orphans: [], shifted: [], dup: [], unwired: [], untranslated: [], limits: [], codeUnanchored: [],
    quoteDrift: [], quoteOk: 0, designAnchors: [], counts: {}, bytes: {} };
  const all = {}; // id → {docKey, e}
  const nb = {};
  const quotes = [];
  const norm = (x) => x.replace(/[*⟩]/g, '').replace(/\s+/g, ' ').trim();
  const results = {};
  const srcs = Object.fromEntries(Object.entries(DOC_FILES).map(([key, [file]]) => [key, readFileSync(join(docs, file), 'utf8')]));
  const known = knownSpeakers(Object.values(srcs));
  report.speakers = [...known].sort();
  for (const [key, [file, outName]] of Object.entries(DOC_FILES)) {
    const src = srcs[key];
    const r = extractDoc(key, src, known);
    results[key] = { r, src, file, outName };
    if (key === '10') for (const id of r.order) nb[id] = r.ents[id];
  }
  for (const [key, { r, src, file, outName }] of Object.entries(results)) {
    const text = {};
    for (const id of r.order) {
      const e = r.ents[id];
      for (const f of Object.keys(e)) if (f.startsWith('_') || e[f] === undefined || e[f] === null) delete e[f];
      if (all[id]) report.dup.push({ id, docs: [all[id].key, key] });
      all[id] = { key, e };
      text[id] = e;
    }
    for (const d of r.notes.dup) report.dup.push({ id: d.id, doc: key, ln: d.ln });
    report.unwired.push(...r.notes.unwired.map((u) => ({ doc: key, ...u })));
    report.untranslated.push(...r.notes.untranslated.map((u) => ({ doc: key, ...u })));
    // code blocks: a verbatim quote of the notebook is fine; anything else wants an anchor
    for (const c of r.notes.codeUnanchored) {
      const body = norm(c.text);
      const head = norm(c.text.split('\n').find((l) => l.trim()) || '');
      const exact = Object.values(nb).some((e) => e.text && (norm(e.text) === body || norm(e.text).includes(body)));
      const hit = !exact && head.length > 5 && Object.entries(nb).find(([, e]) => e.text && norm(e.text).startsWith(head));
      if (exact) report.quoteOk++;
      else if (hit) report.quoteDrift.push({ doc: key, ln: c.ln, of: hit[0] });
      else report.codeUnanchored.push({ doc: key, ln: c.ln, base: c.base, first: head.slice(0, 60) });
    }
    quotes.push(...r.notes.quotes.map((q) => ({ doc: key, ...q })));
    // limits
    let long = 0;
    for (const [id, e] of Object.entries(text)) {
      const len = (e.text || '').length;
      if ((e.k === 'bark' || e.bark || e.pool === 'bark') && len > LIMITS.bark) report.limits.push({ id, kind: 'bark', len, max: LIMITS.bark });
      if (e.k === 'hint' && len > LIMITS.hint) report.limits.push({ id, kind: 'hint', len, max: LIMITS.hint });
      if (e.k === 'line' && len > LIMITS.longSpeech) long++;
    }
    if (ARC_DOCS.has(key) && long > LIMITS.longPerArc) report.limits.push({ id: `${key}:*`, kind: 'long speech', count: long, max: LIMITS.longPerArc });
    // $hash: the source doc's; $body: the text's own (a hand edit to the JSON body is caught by the cheap stamp check too)
    const doc = { $doc: `docs/story/${file}`, $hash: hashText(src), $body: bodyHash(text), $v: EXTRACT_V, text };
    files[outName] = JSON.stringify(doc, null, 0).replace(/,"(?=[^"]+":\{"k")/g, ',\n"') + '\n';
    report.counts[key] = Object.keys(text).length;
    report.bytes[outName] = Buffer.byteLength(files[outName]);
  }
  // <!-- quote: id --> blocks must say exactly what the id says
  for (const q of quotes) {
    const e = all[q.of];
    if (!e) report.quoteDrift.push({ doc: q.doc, ln: q.ln, of: q.of, missing: true });
    else if (norm(e.e.text) === norm(q.text)) report.quoteOk++;
    else report.quoteDrift.push({ doc: q.doc, ln: q.ln, of: q.of });
  }
  for (const f of DESIGN_DOCS) {
    const p = join(docs, f);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf8');
    for (const m of src.matchAll(/<!--\s*(?:id|list):\s*([\w.:-]+)/g)) report.designAnchors.push({ doc: f, id: m[1] });
  }
  return { files, all, report };
}

export function readLock(path = LOCK) {
  if (!existsSync(path)) return { $v: 1, ids: {}, orphans: {} };
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Merge this run's ids into the lock. An id that vanished goes to orphans (kept, never silently dropped); one that
// comes back leaves orphans. When an id now holds a different text and its old text turned up under another id,
// that's a shift (positional numbering moved): the writer should anchor the line.
export function nextLock(prev, all, today) {
  const ids = {};
  const byHash = new Map();
  for (const [id, { key, e }] of Object.entries(all)) {
    const h = h8(JSON.stringify([e.who || '', e.text || '', e.title || '']));
    ids[id] = [key, h];
    byHash.set(h, id);
  }
  const orphans = { ...(prev.orphans || {}) };
  const shifted = [];
  for (const [id, v] of Object.entries(prev.ids || {})) {
    if (!ids[id]) orphans[id] = [v[0], v[1], orphans[id]?.[2] || today];
    else if (ids[id][1] !== v[1] && byHash.has(v[1]) && byHash.get(v[1]) !== id) shifted.push({ id, now: byHash.get(v[1]) });
  }
  for (const id of Object.keys(orphans)) if (ids[id]) delete orphans[id];
  const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  return { lock: { $v: 1, ids: sorted(ids), orphans: sorted(orphans) }, shifted };
}

// Text ids that the hand-written logic (src/story-data/**/*.js) references, found as string literals.
export function logicRefs(dir = join(ROOT, 'src/story-data')) {
  const refs = new Map();
  if (!existsSync(dir)) return refs;
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== 'text') walk(p); continue; }
      if (!/\.(m?js)$/.test(f)) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/['"`]([A-Za-z0-9_.:/-]{2,80})['"`]/g)) {
        if (!refs.has(m[1])) refs.set(m[1], relative(ROOT, p));
      }
    }
  };
  walk(dir);
  return refs;
}

export function lockText(lock) {
  const ids = Object.entries(lock.ids).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n');
  const orph = Object.entries(lock.orphans).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n');
  return `{"$v":1,\n"ids":{\n${ids}\n},\n"orphans":{${orph ? '\n' + orph + '\n' : ''}}}\n`;
}

// ---------------------------------------------------------------------------------------------------------------

// One extract (or check) of a tree. Returns the errors, so the rig and the lint can call it without a process.
export function run({ root = ROOT, check = false, today = new Date().toISOString().slice(0, 10) } = {}) {
  const out = join(root, 'src/story-data/text');
  const lockPath = join(root, 'src/story-data/ids.lock.json');
  const { files, all, report } = extractAll({ root });
  const prev = readLock(lockPath);
  const { lock, shifted } = nextLock(prev, all, today);
  report.shifted = shifted;
  report.orphans = Object.entries(lock.orphans).map(([id, v]) => ({ id, doc: v[0], since: v[2] }));
  const refs = logicRefs(join(root, 'src/story-data'));
  const orphanRefs = report.orphans.filter((o) => refs.has(o.id)).map((o) => ({ ...o, in: refs.get(o.id) }));
  const errors = [];
  if (report.quoteDrift.length) errors.push(`${report.quoteDrift.length} quote(s) that differ from their source`);
  if (report.dup.length) errors.push(`${report.dup.length} duplicate id(s): ${report.dup.slice(0, 5).map((d) => d.id).join(', ')}`);
  if (report.designAnchors.length) errors.push(`anchors in design docs: ${report.designAnchors.map((a) => a.doc + ' ' + a.id).join(', ')}`);
  if (orphanRefs.length) errors.push(`logic references orphaned ids: ${orphanRefs.map((o) => `${o.id} (${o.in})`).join(', ')}`);
  if (check) {
    for (const [name, body] of Object.entries(files)) {
      const p = join(out, name);
      if (!existsSync(p)) { errors.push(`${name}: missing (run npm run story:extract)`); continue; }
      const cur = readFileSync(p, 'utf8');
      let stamp = null;
      try { stamp = JSON.parse(cur).$hash; } catch { errors.push(`${name}: not JSON`); continue; }
      const want = JSON.parse(body).$hash;
      if (stamp !== want) errors.push(`${name}: stale, hash ${stamp} ≠ doc ${want} (run npm run story:extract)`);
      else if (cur !== body) errors.push(`${name}: contents differ from a fresh extract (run npm run story:extract)`);
    }
    const lockCur = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : '';
    if (lockCur !== lockText(lock)) errors.push('ids.lock.json: out of date (run npm run story:extract)');
  } else {
    mkdirSync(out, { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(out, name), body);
    writeFileSync(lockPath, lockText(lock));
  }
  return { errors, report, shifted, lock, files };
}

// The stamps alone (cheap; for the lint): every text file's $hash against its doc's hash now, and its $body against
// the hash of the text it holds (a hand edit to the JSON body, the doc untouched). → [{ file, doc, why, got, want }]
export function staleStamps({ root = ROOT } = {}) {
  const bad = [];
  for (const [, [file, outName]] of Object.entries(DOC_FILES)) {
    const p = join(root, 'src/story-data/text', outName);
    const want = hashText(readFileSync(join(root, 'docs/story', file), 'utf8'));
    let j = null;
    try { j = JSON.parse(readFileSync(p, 'utf8')); } catch { /* missing */ }
    const got = j ? j.$hash : null;
    if (got !== want) { bad.push({ file: outName, doc: file, why: 'doc', got, want }); continue; }
    const body = j && j.text && typeof j.text === 'object' ? bodyHash(j.text) : null;
    if (!j.$body || body !== j.$body) bad.push({ file: outName, doc: file, why: 'body', got: body, want: j.$body ?? null });
  }
  return bad;
}

function main() {
  const args = process.argv.slice(2);
  const quiet = args.includes('--quiet');
  const ri = args.indexOf('--report');
  const { errors, report, shifted } = run({ check: args.includes('--check') });
  const total = Object.values(report.counts).reduce((a, b) => a + b, 0);
  const kb = Object.values(report.bytes).reduce((a, b) => a + b, 0) / 1024;
  console.log(`story-extract v${EXTRACT_V}: ${total} ids from ${Object.keys(DOC_FILES).length} docs, ${kb.toFixed(0)} KB` +
    ` (${Object.entries(report.counts).map(([k, n]) => `${k}:${n}`).join(' ')})`);
  console.log(`  orphans ${report.orphans.length} · shifted ${shifted.length} · unwired (If: …) ${report.unwired.length}` +
    ` · untranslated 70 conditions ${report.untranslated.length} · limits ${report.limits.length}` +
    ` · notebook quotes ok ${report.quoteOk}, drift ${report.quoteDrift.length} · code blocks wanting an anchor ${report.codeUnanchored.length}`);
  if (!quiet) {
    for (const o of report.orphans.slice(0, 20)) console.log(`  orphan   ${o.id} (${o.doc}, since ${o.since})`);
    for (const s of shifted.slice(0, 20)) console.log(`  shifted  ${s.id}'s old text is now ${s.now}: anchor it`);
    for (const l of report.limits) console.log(`  limit    ${l.id} ${l.kind} ${l.len ?? l.count} > ${l.max}`);
    for (const d of report.quoteDrift) console.log(`  drift    ${d.doc} line ${d.ln} quotes ${d.of} but ${d.missing ? 'no such id' : 'differs'}`);
    for (const c of report.codeUnanchored) console.log(`  anchor?  ${c.doc} line ${c.ln} (${c.base}) ${c.first}`);
  }
  if (ri >= 0 && args[ri + 1]) writeFileSync(args[ri + 1], JSON.stringify(report, null, 1));
  for (const e of errors) console.log(`  ERROR    ${e}`);
  if (errors.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
