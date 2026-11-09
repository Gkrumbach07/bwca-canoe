// k2-test.mjs: the story extractor's rig (stream K2). Node only, no browser, about a second.
//
//   node scripts/k2-test.mjs
//
// Checks: the committed text files are fresh (hash stamps and contents); the extract is deterministic and never
// touches a doc; the ids the logic will use exist with the right words; a doc edit makes the text stale; a vanished
// id becomes an orphan and an orphan referenced by logic is an error; a renumbered line is reported as shifted; the
// four anchor modes; 70's conditions translate; the limits; nothing in src/ outside story-data loads the text (so the
// game with the story flag off is unchanged).

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as X from './story-extract.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
const ok = (name, pass, info = '') => { rows.push([name, !!pass, info]); };
const text = (f) => JSON.parse(readFileSync(join(ROOT, 'src/story-data/text', f), 'utf8')).text;
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// 1. the committed files are what a fresh extract makes
{
  const r = X.run({ check: true });
  ok('fresh: --check is clean on the committed tree', r.errors.length === 0, r.errors.join('; '));
  ok('stamps: every text file carries its doc hash', X.staleStamps().length === 0, JSON.stringify(X.staleStamps()));
  const total = Object.values(r.report.counts).reduce((a, b) => a + b, 0);
  ok('size: over 2,000 ids, text under 400 KB, no file over 80 KB', total > 2000 &&
    Object.values(r.report.bytes).reduce((a, b) => a + b, 0) < 400 * 1024 && Math.max(...Object.values(r.report.bytes)) < 80 * 1024,
    `${total} ids, ${JSON.stringify(r.report.bytes)}`);
  ok('clean: no duplicate ids, no quote drift, no unanchored finished text', !r.report.dup.length && !r.report.quoteDrift.length &&
    !r.report.codeUnanchored.length, `dup ${r.report.dup.length} drift ${r.report.quoteDrift.length} code ${r.report.codeUnanchored.length}`);
}

// 2. deterministic, and the docs are never written
{
  const docs = readdirSync(join(ROOT, 'docs/story')).map((f) => [f, sha(join(ROOT, 'docs/story', f))]);
  const a = X.extractAll().files, b = X.extractAll().files;
  ok('deterministic: two extracts are byte-identical', JSON.stringify(a) === JSON.stringify(b));
  X.run({ check: true });
  ok('read-only: the docs are unchanged by an extract', docs.every(([f, h]) => sha(join(ROOT, 'docs/story', f)) === h));
}

// 3. the words by id
{
  const nb = text('nb.json'), op = text('opening.json'), side = text('side.json'), w = text('world.json');
  const fin = text('finale.json'), guid = text('guiding.json'), boys = text('boys.json');
  const nbIds = Object.keys(nb);
  ok('notebook: NB01–NB88, TP1–3, L1–L9, P1–P12, the cutscene', [...Array(88)].every((_, i) => nb[`NB${String(i + 1).padStart(2, '0')}`]?.text) &&
    ['TP1', 'TP2', 'TP3'].every((k) => nb[k]?.text) && [...Array(9)].every((_, i) => nb[`L${i + 1}`]?.text) &&
    [...Array(12)].every((_, i) => nb[`P${i + 1}`]?.text) && nbIds.some((k) => k.startsWith('cut.')), `${nbIds.length} notebook ids`);
  ok('notebook: NB01 is the header line, NB88 the last page verbatim', nb.NB01.text.startsWith('May 22 — EP 30 — solo, 7 days food, the old tent.') &&
    nb.NB01.key === 'N01' && nb.NB88.text.split('\n').at(-1) === 'If you are reading this' && nb.NB88.text.split('\n').length === 7);
  ok('notebook: a second code block joins its entry (NB63), a drawn page keeps its words (L1)',
    nb.NB63.text.includes('Oct 13. Looked in on the cellar') && nb.L1.text.startsWith("A child's map of a shore"));
  ok('notebook: a photo keeps its back (P3 "Front Porch. 1st night.")', nb.P3.back === 'Front Porch. 1st night.');
  ok('scene: 20:T1.1 is Tauno, "That\'s BRM fourteen." with its cab variant', op['20:T1.1']?.who === 'Tauno' &&
    op['20:T1.1'].text === "That's BRM fourteen." && op['20:T1.2']?.of === '20:T1.1');
  ok('scene: [Keep walking] is an act choice to T1b; a reply knows its choice', op['20:T1.c3']?.act && op['20:T1.c3'].to === 'T1b' &&
    op['20:T3.4']?.after === '20:T3.c1');
  ok('scene: (If: …) is kept as prose for the wiring', /notebook page with a Finnish word/.test(op['20:T3.c1']?.if || ''));
  ok('scene: the Walt page line under Gives (20:T3.w1)', op['20:T3.w1']?.k === 'page' && /Walt Haapala, a Finn from Ely/.test(op['20:T3.w1'].text));
  ok('scene: a table of lines by manner (20:1.2.1 warm keeper)', op['20:1.2.1']?.who === 'Keeper' && op['20:1.2.1'].when === 'Manner: warm');
  ok('scene: 32 notation, *"choice"* then the scene\'s person (Carol)', boys['32:5.1.c1']?.k === 'choice' && boys['32:5.1.4']?.who === 'Carol' &&
    boys['32:5.1.4'].after === '32:5.1.c1');
  ok('side: S1.A.1 is Ollie, with the block\'s needs', side['S1.A.1']?.who === 'Ollie' && side['S1.A.1'].if === 'needs: met twice' &&
    !side['S1.A.19']?.if);
  ok('side: ▸ choices nest (S1.A.c9 answers S1.A.c8)', side['S1.A.c9']?.after === 'S1.A.c8');
  ok('world: keepers by section (70.8.1.* Ruth Aho), a rumour pool, a bark pool', Object.entries(w).some(([k, e]) => k.startsWith('70.8.1.') && e.who === 'Ruth Aho') &&
    Object.values(w).some((e) => e.pool === 'rumour') && Object.values(w).some((e) => e.pool === 'bark'));
  ok('world: conditions translated (S7 J/JN → end:J|JN, a bare S8 a side story, carrying, month)', Object.values(w).some((e) => e.cond === 'end:J|JN') && Object.values(w).some((e) => e.side === 'S8' && !/S8/.test(e.cond || '')) &&
    Object.values(w).some((e) => /carrying:waltpack/.test(e.cond || '')) && Object.values(w).some((e) => /month:\d+-\d+/.test(e.cond || '')));
  ok('anchors: Eino\'s note, the scanner, Sheila\'s report, the Walt page drafts', fin['note.eino']?.text === 'W. — Saturday.\nBring the good coffee.\nEino.' &&
    fin['scanner.quiet.1']?.who === 'One' && fin['scanner.quiet.1'].repeat && fin['scanner.dawn.2']?.then?.[0]?.who === 'Base' &&
    /^Page one\. Incident/.test(guid['sheila.report']?.text || '') && /Page two\./.test(guid['sheila.report'].text) &&
    nb['walt.nb.und.6']?.k === 'page' && nb['walt.nb.und.6'].text === 'Went north.');
  const all = [nb, op, side, w, fin, guid, boys, text('mining.json'), text('family.json'), text('company.json')];
  const bad = all.flatMap((t) => Object.entries(t).filter(([, e]) => ['line', 'choice', 'page', 'nb', 'block'].includes(e.k) && !e.text)).map(([k]) => k);
  ok('every line, choice, page and entry has words', bad.length === 0, bad.slice(0, 5).join(', '));
  const junk = all.flatMap((t) => Object.values(t)).filter((e) => e.k === 'line' && e.who && /^(The|On|Tier|After|What|Where)\b/.test(e.who));
  ok('no design label taken for a speaker', junk.length === 0, junk.slice(0, 3).map((e) => e.who).join(', '));
}

// 4. a temporary tree: edit, orphan, shift, refs
const tmp = mkdtempSync(join(tmpdir(), 'k2-'));
try {
  mkdirSync(join(tmp, 'docs'), { recursive: true });
  mkdirSync(join(tmp, 'src'), { recursive: true });
  cpSync(join(ROOT, 'docs/story'), join(tmp, 'docs/story'), { recursive: true });
  cpSync(join(ROOT, 'src/story-data'), join(tmp, 'src/story-data'), { recursive: true });
  ok('tmp: a copy of the tree checks clean', X.run({ root: tmp, check: true }).errors.length === 0);
  const op = join(tmp, 'docs/story/20-opening.md');
  const src = readFileSync(op, 'utf8');
  // a doc edit without a re-extract is stale
  writeFileSync(op, src.replace('**Tauno:** "That\'s BRM fourteen."', '**Tauno:** "That\'s BRM fourteen, that is."'));
  const st = X.run({ root: tmp, check: true });
  ok('stale: a doc edit without a re-extract fails --check', st.errors.some((e) => /opening\.json: stale/.test(e)) &&
    X.staleStamps({ root: tmp }).some((b) => b.file === 'opening.json'));
  X.run({ root: tmp });
  ok('re-extract: the edit is fresh again', X.run({ root: tmp, check: true }).errors.length === 0);
  // a line removed: the ids after it shift; the last becomes an orphan
  writeFileSync(op, readFileSync(op, 'utf8').replace(/\*\*Tauno:\*\* "Leeches are slow this week\. A guy could try a jig and a minnow\."\n/, ''));
  const rr = X.run({ root: tmp });
  ok('orphan: a vanished id is kept as an orphan, never dropped', rr.lock.orphans['20:T3.7'] && rr.report.orphans.some((o) => o.id === '20:T3.7'),
    JSON.stringify(rr.report.orphans.slice(0, 3)));
  ok('shift: a renumbered line is reported (20:T3.1 → its text now at another id)', rr.shifted.length > 0, JSON.stringify(rr.shifted.slice(0, 2)));
  // logic that references an orphan is an error
  writeFileSync(join(tmp, 'src/story-data/topics-k2.js'), "export default { porch: ['20:T3.7'] };\n");
  const re = X.run({ root: tmp, check: true });
  ok('orphan ref: logic using an orphaned id fails', re.errors.some((e) => /orphaned ids: 20:T3\.7/.test(e)));
  rmSync(join(tmp, 'src/story-data/topics-k2.js'));
  // an anchor in a design doc is an error
  const bib = join(tmp, 'docs/story/01-bible.md');
  writeFileSync(bib, readFileSync(bib, 'utf8') + '\n<!-- id: not.here -->\n"x"\n');
  ok('design docs: an anchor in 01-bible fails', X.run({ root: tmp, check: true }).errors.some((e) => /design docs/.test(e)));
} finally { rmSync(tmp, { recursive: true, force: true }); }

// 5. anchor modes and limits on a synthetic doc
{
  const known = new Set(['Tauno', 'Ollie']);
  const doc = [
    '## 3. A scene', '', '#### T9 — Test', '',
    '**Tauno:** "One." [Beat.] "Two."', '',
    '<!-- id: test.block -->', '```', 'A NOTE', '```', '',
    '<!-- not-text: diagram -->', '```', 'A ─▶ B', '```', '',
    '<!-- list: test.list page -->', '- "First." (when it rains)', '- "Second."', '',
    '<!-- quote: test.block -->', '```', 'A NOTE', '```', '',
  ].join('\n');
  const r = X.extractDoc('20', doc, known);
  ok('synthetic: a line\'s quotes join across a stage direction', r.ents['20:T9.1']?.text === 'One. Two.');
  ok('synthetic: id, list (with flag and condition), not-text, quote', r.ents['test.block']?.text === 'A NOTE' &&
    r.ents['test.list.1']?.k === 'page' && r.ents['test.list.1'].if === 'when it rains' && r.ents['test.list.2']?.text === 'Second.' &&
    r.notes.codeUnanchored.length === 0 && r.notes.quotes.length === 1);
  const t = X.translate70('`S2`+, `t2`, `month:6–8`, `once`, `needs:porch,cafe`, Whose gear?');
  ok('translate70: stage, tier, month, once, ground, a topic left as prose', t.when.join(' & ') === 'stage>=S2 & t2 & month:6-8' &&
    t.once && t.ground.join() === 'porch,cafe' && t.prose.join() === 'Whose gear?');
  const long = 'x'.repeat(200);
  const w = X.extractDoc('70', `## 6. Rumours\n\n### 6.1 Always\n\n**Barks**\n- [A keeper] "${long}"\n`, known);
  const bark = Object.values(w.ents)[0];
  ok('limits: a 70 bark is a bark, 180 its limit', bark?.pool === 'bark' && bark.text.length > X.LIMITS.bark && X.LIMITS.bark === 180 && X.LIMITS.hint === 80);
}

// 6. the flag-off guarantee: nothing outside story-data loads the text
{
  const hits = [];
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) { if (f.name !== 'story-data') walk(p); continue; }
      if (/\.(m?js|html)$/.test(f.name) && /story-data\/text|ids\.lock/.test(readFileSync(p, 'utf8'))) hits.push(p.slice(ROOT.length + 1));
    }
  };
  walk(join(ROOT, 'src'));
  if (existsSync(join(ROOT, 'index.html')) && /story-data\/text/.test(readFileSync(join(ROOT, 'index.html'), 'utf8'))) hits.push('index.html');
  ok('flag off: no game module imports story-data/text (the build is unchanged)', hits.length === 0, hits.join(', '));
}

let fails = 0;
for (const [name, pass, info] of rows) {
  if (!pass) fails++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && info ? `  [${info}]` : ''}`);
}
console.log(`k2-test: ${rows.length - fails}/${rows.length}`);
process.exitCode = fails ? 1 : 0;
