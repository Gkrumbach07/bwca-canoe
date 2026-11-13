// cmp-final contact sheet: sixteen shots the stream rigs take (--shots / env SHOTS), laid
// out 4 × 4 with a caption each. No game: a page of <img> rendered by headless Chromium.
//   node scripts/story-c1-contact.mjs --shots <dir> [--out docs/build/shots/story-c1-contact.png] [--pick a=file,b=file]
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const SHOTS = path.resolve(String(arg('shots', 'shots/contact')));
const OUT = path.resolve(String(arg('out', 'cmp-contact.png')));
// the twelve, in the slice's order: [file (without .png), caption]
const TILES = [
  ['f2-dam', 'The far end: up the dam, east bank (f)'],
  ['f5-camp', 'Walt\'s camp (f)'],
  ['f6-cellar', 'The cellar: the lid, Eino\'s note (f)'],
  ['j1-run-night', 'The run: the night down the route (r, j1)'],
  ['j1-dawn-lot', 'The dawn lot at Lake One 30 (n)'],
  ['n-postcard-J', 'The postcard from Josie (n)'],
  ['1-motel', 'Aili\'s motel beside Little Vermilion (a4)'],
  ['7-porch', 'The back porch: the can (a4)'],
  ['b5-yard', 'The boys in the Sawbill yard (b5)'],
  ['b5-slides', 'Carol\'s slides (b5)'],
  ['s5-dive', 'The plane on the Kek: the dive (7b)'],
  ['s6', 'The whiskey road: the pit (7b)'],
  ['s4-meadow', 'The wolves\' meadow (7a)'],
  ['g-cave', 'A secret mission: Winchell\'s cave (g)'],
  ['7-maggie', 'Maggie at Hog Creek 36 (p)'],
  ['1-sighting', 'A sighting: the green Kevlar (p)'],
];
for (const kv of String(arg('pick', '')).split(',').filter(Boolean)) { const [i, f] = kv.split('='); if (TILES[Number(i)]) TILES[Number(i)][0] = f; }
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// a tile of two shots side by side: 'a+b'; a crop of the 1440 × 900 shot: 'file@x,y,w' (the height by the tile's shape)
const SW = 1440, SH = 900;
const imgOf = (spec, cls = '', tw = 480, th = 300) => {
  const [f, crop] = spec.split('@'), p = path.join(SHOTS, `${f}.png`);
  if (!existsSync(p)) return `<div class="miss ${cls}">missing: ${esc(f)}</div>`;
  const src = `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  if (!crop) return `<img class="${cls}" src="${src}">`;
  const [x, y, w] = crop.split(',').map(Number), k = tw / w;
  return `<div class="${cls} crop" style="width:${tw}px;height:${th}px;background-image:url(${src});background-size:${SW * k}px ${SH * k}px;background-position:${-x * k}px ${-y * k}px"></div>`;
};
const missing = (f) => f.split('+').map((x) => x.split('@')[0]).filter((x) => !existsSync(path.join(SHOTS, `${x}.png`)));
const cells = TILES.map(([f, cap], i) => {
  const img = f.includes('+') ? `<div class="two">${f.split('+').map((x) => imgOf(x, 'half', 239, 300)).join('')}</div>` : imgOf(f);
  return `<figure>${img}<figcaption><b>${i + 1}</b> ${esc(cap)}</figcaption></figure>`;
}).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
body { margin: 0; background: #1d1b18; font: 15px/1.35 Georgia, serif; color: #e9e1cf; }
h1 { margin: 14px 18px 4px; font: 600 20px Georgia, serif; } p { margin: 0 18px 10px; color: #b8ad95; font-size: 13px; }
.g { display: grid; grid-template-columns: repeat(4, 480px); gap: 10px; padding: 0 18px 18px; }
figure { margin: 0; background: #2a2723; } img, .miss { width: 480px; height: 300px; object-fit: cover; display: block; }
.miss { display: grid; place-items: center; color: #c86; } .two { display: flex; gap: 2px; } .half { width: 239px; } .crop { background-repeat: no-repeat; } figcaption { padding: 6px 8px; } b { color: #d9a441; }
</style><h1>The campaign, final join (claude/cmp-final, ?story=1)</h1><p>Rounds 3–7 by the stream rigs' input, fedora + ben (polish: the dawn lot and the dive reshot on ben)</p><div class="g">${cells}</div>`;
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await (await browser.newContext({ viewport: { width: 1998, height: 1100 } })).newPage();
await page.setContent(html);
mkdirSync(path.dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log('contact sheet', OUT, TILES.flatMap(([f]) => missing(f)).map((f) => `missing ${f}`).join(' ') || 'all 16');
