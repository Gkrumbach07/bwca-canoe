// Stream g's drafted lines (story wave 2: the end games): story-data/endgames.js LINES → src/story-data/text/drafts-g.json
// (the words by id, for the lint and the game's text table) and docs/story/95-drafted-lines.md's "Stream g" section
// (anchor, line, where it is used), marked as build drafts for the writers to replace. Run after editing LINES:
//   node scripts/cmp-g-lines.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES, SECRETS, SOFTEN, OWNERS } from '../src/story-data/endgames.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const JSONF = path.join(ROOT, 'src/story-data/text/drafts-g.json');
const DOC = path.join(ROOT, 'docs/story/95-drafted-lines.md');

const whoOf = (id) => {
  const m = /^g\.(\w+)\./.exec(id); if (!m) return null;
  const S = SECRETS.find((s) => s.id === m[1]); if (S) return /\.(page|end|first|back)/.test(id) ? null : OWNERS[S.owner].name;
  const k = /^g\.soft\.(\d+)\./.exec(id); if (k) return OWNERS[k[1]].name;
  return null;
};
const json = { $doc: 'docs/story/95-drafted-lines.md#stream-g', $v: 1, text: Object.fromEntries(Object.entries(LINES).map(([id, text]) => [id, { k: 'line', who: whoOf(id), text }])) };
const out = `${JSON.stringify(json, null, 0).replace(/\},"/g, '},\n"')}\n`;

const where = (id) => {
  if (/^g\.ask\./.test(id)) return 'the player\'s choice in a keeper\'s talk (endgames.js)';
  if (/^g\.hook\./.test(id)) return 'the keeper\'s bark as you come in, a secret waiting with them (by manner)';
  if (/^g\.point\./.test(id)) return 'a keeper\'s bark naming another owner with a secret waiting (by manner)';
  if (/^g\.cold\./.test(id)) return 'the money ending: an unsoftened keeper\'s first sight of you (by manner)';
  if (/^g\.soft\.\d+\.ask/.test(id)) return 'the owner\'s small ask ("Anything I can do for you?")';
  if (/^g\.soft\.\d+\.job/.test(id)) return 'the owner, as the job is taken on';
  if (/^g\.soft\.\d+\.done/.test(id)) return 'the owner\'s thanks; their prices are back (owner.<ep>.softened)';
  if (/^g\.soft\./.test(id)) return 'the owner, a donation short or declined';
  if (id === 'g.survey') return 'the page copied from the survey tin on Eagle Mountain';
  const m = /^g\.(\w+)\.(.+)$/.exec(id); if (!m) return '';
  const b = m[2];
  return { 'tell.1': 'the owner tells the secret', 'tell.2': 'the owner tells the secret (2)', go: 'the owner, as you say you will go', back: 'the player: the gold choice once it is found',
    'thanks.1': 'the owner\'s thanks', 'thanks.2': 'the owner hands over the reward', find: 'the note as you do the verb at the place', 'page.1': 'the Stories page (taken on)', 'page.2': 'the Stories page (found)',
    end: 'the Stories page\'s closing line', first: 'the trip card\'s stamp' }[b] || '';
};
const rows = Object.entries(LINES).map(([id, t]) => `| ${id} | ${t.replace(/\|/g, '\\|')} | ${where(id)} |`);
const section = `## Stream g (wave 2: the end games after the endings) — build drafts, for the writers to replace

Part 3 #5 (the journalist ending's secret missions: eleven owners, a month apart) and #6 (the money ending: each of the
fourteen owners' one small ask that brings their prices back) have no lines in the docs. Every line below is a build draft
in the keepers' manners (talk-keepers.js; 02b). Source of truth: src/story-data/endgames.js LINES (scripts/cmp-g-lines.mjs
writes this table and src/story-data/text/drafts-g.json). Secrets: ${SECRETS.map((s) => `${s.id} (${OWNERS[s.owner].name})`).join(', ')}.
Softening: ${SOFTEN.map((x) => `${x.ep} ${x.kind}`).join(', ')}.

| Anchor | Line | Where it is used |
|---|---|---|
${rows.join('\n')}
`;
const doc = readFileSync(DOC, 'utf8');
const start = doc.indexOf('## Stream g ');
let next = start >= 0 ? doc.indexOf('\n## ', start + 5) : -1;
const newDoc = start < 0 ? `${doc.replace(/\s*$/, '')}\n\n${section}` : `${doc.slice(0, start)}${section}${next >= 0 ? doc.slice(next + 1) : ''}`;
if (check) {
  let had = ''; try { had = readFileSync(JSONF, 'utf8'); } catch { had = ''; }
  const ok = had === out && newDoc === doc;
  console.log(ok ? 'cmp-g-lines: fresh' : 'cmp-g-lines: STALE (run node scripts/cmp-g-lines.mjs)');
  process.exit(ok ? 0 : 1);
}
writeFileSync(JSONF, out);
writeFileSync(DOC, newDoc);
console.log(`cmp-g-lines: ${Object.keys(LINES).length} lines → ${path.relative(ROOT, JSONF)} and ${path.relative(ROOT, DOC)}`);
