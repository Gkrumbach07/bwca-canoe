// story-c1 contact sheet (docs/build/shots/story-c1-contact.png): twelve shots the slice rig takes with --shots, laid
// out 4 × 3 with a caption each. No game: a page of <img> rendered by headless Chromium.
//   node scripts/story-c1-contact.mjs --shots <dir> [--out docs/build/shots/story-c1-contact.png] [--pick a=file,b=file]
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const SHOTS = path.resolve(String(arg('shots', 'shots/contact')));
const OUT = path.resolve(String(arg('out', 'docs/build/shots/story-c1-contact.png')));
// the twelve, in the slice's order: [file (without .png), caption]
const TILES = [
  ['c1-01-bundle', 'P1: Josie\'s bundle off the high shelf'],
  ['b-cut-cut.3', 'Night one: the cutscene, by headlamp'],
  ['b-book-last', 'The notebook open, the unread dots'],
  ['slice-3-here', '"he was here": NB01 open at C837'],
  ['b-back-cover', 'The back cover: the 64 pencilled'],
  ['c1-06-porch', 'Tauno at the porch foot: "That\'s BRM fourteen."'],
  ['c1-07-again', 'Declined once, a trip on: "You again."'],
  ['c1-08-marked', 'A keeper\'s rings: Ruth beside them in Marked'],
  ['L5-crews.crib+L5-crews.pine', 'The crews\' landing: the crib, the 1977 blaze'],
  ['c1-10-doors', 'The turn: the four doors'],
  ['c1-11-inked', 'The Front Porch inked on Lake One'],
  ['slice-7-walt-page', 'The Walt page'],
];
for (const kv of String(arg('pick', '')).split(',').filter(Boolean)) { const [i, f] = kv.split('='); if (TILES[Number(i)]) TILES[Number(i)][0] = f; }
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// a tile of two shots side by side: 'a+b'
const imgOf = (f, cls = '') => { const p = path.join(SHOTS, `${f}.png`); return existsSync(p) ? `<img class="${cls}" src="data:image/png;base64,${readFileSync(p).toString('base64')}">` : `<div class="miss ${cls}">missing: ${esc(f)}</div>`; };
const missing = (f) => f.split('+').filter((x) => !existsSync(path.join(SHOTS, `${x}.png`)));
const cells = TILES.map(([f, cap], i) => {
  const img = f.includes('+') ? `<div class="two">${f.split('+').map((x) => imgOf(x, 'half')).join('')}</div>` : imgOf(f);
  return `<figure>${img}<figcaption><b>${i + 1}</b> ${esc(cap)}</figcaption></figure>`;
}).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
body { margin: 0; background: #1d1b18; font: 15px/1.35 Georgia, serif; color: #e9e1cf; }
h1 { margin: 14px 18px 4px; font: 600 20px Georgia, serif; } p { margin: 0 18px 10px; color: #b8ad95; font-size: 13px; }
.g { display: grid; grid-template-columns: repeat(4, 480px); gap: 10px; padding: 0 18px 18px; }
figure { margin: 0; background: #2a2723; } img, .miss { width: 480px; height: 300px; object-fit: cover; display: block; }
.miss { display: grid; place-items: center; color: #c86; } .two { display: flex; gap: 2px; } .half { width: 239px; } figcaption { padding: 6px 8px; } b { color: #d9a441; }
</style><h1>Story chapter 1 (claude/story-c1, ?story=1)</h1><p>The slice at Moose Lake 25, steps 1–7, by the rig's input</p><div class="g">${cells}</div>`;
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await (await browser.newContext({ viewport: { width: 1998, height: 1100 } })).newPage();
await page.setContent(html);
mkdirSync(path.dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log('contact sheet', OUT, TILES.flatMap(([f]) => missing(f)).map((f) => `missing ${f}`).join(' ') || 'all 12');
