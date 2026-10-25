// The icons of content C's things (items.js "content C"): flat shapes in the game's palette with a soft ink edge, in the
// manner of inv-ui.js's own drawings, each in its design box [w, h] (letterboxed into the item's footprint by inv-ui's
// picture()). Registered with inv-ui.js addIcons at load; a key inv-ui already draws (the net) keeps its drawing.
import { addIcons } from './inv-ui.js';

const INK = '#2a2016';
const PAL = { canvas: '#a58d5c', leather: '#5b3a22', brass: '#c9a24a', blue: '#2f68a8', blueD: '#24528a', cream: '#efe6cf', paper: '#ebe2cb', red: '#b4321f', moss: '#5f7f45',
  green: '#3d6b47', silver: '#c9ced2', steel: '#8e959b', wood: '#b48a58', woodD: '#7a5634', black: '#26231f', orange: '#d9663f', gold: '#dcb469', foil: '#b9bdc0', tin: '#a0a4a8' };
function fill(c, col) { c.fillStyle = col; c.fill(); }
function stroke(c, w = 2.2, col = INK) { c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function shape(c, pts, close = true) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); if (close) c.closePath(); }
function line(c, pts, w = 2, col = INK) { shape(c, pts, false); stroke(c, w, col); }
function label(c, text, x, y, size = 12, col = INK) { c.font = `700 ${size}px "Alegreya Sans SC", "Alegreya Sans", sans-serif`; c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y); }

// a stuff sack, its drawcord and a band
function sack(c, col, band, w = 100, h = 108) {
  rr(c, w * 0.16, h * 0.14, w * 0.68, h * 0.8, 18); fill(c, col); stroke(c);
  rr(c, w * 0.16, h * 0.62, w * 0.68, h * 0.1, 2); fill(c, band); stroke(c, 1.4);
  shape(c, [w * 0.4, h * 0.14, w * 0.5, h * 0.04, w * 0.6, h * 0.14]); stroke(c, 2, PAL.black);
  ell(c, w * 0.5, h * 0.05, 4, 4); fill(c, PAL.black);
}
function drawBagDown(c) { sack(c, '#2f5f8a', '#24466a', 100, 100); for (const y of [30, 44]) line(c, [24, y, 76, y], 1.3, '#1d3a58'); }
function drawBag3(c) { sack(c, '#4a6a3a', '#33502a'); }
function drawPadAir(c) {
  rr(c, 8, 6, 34, 98, 16); fill(c, '#c96a2a'); stroke(c);
  for (const y of [22, 40, 58, 76]) line(c, [10, y, 40, y], 1.2, '#9a4e1c');
  rr(c, 6, 46, 38, 8, 2); fill(c, PAL.black); stroke(c, 1.2);
  rr(c, 20, 2, 10, 8, 2); fill(c, PAL.steel); stroke(c, 1.2);
}
function drawRodPro(c) {
  line(c, [6, 22, 170, 22], 3.2, '#3f4a38'); line(c, [120, 22, 172, 22], 1.6, '#3f4a38');
  rr(c, 6, 17, 34, 10, 4); fill(c, '#c9a671'); stroke(c, 1.4);
  rr(c, 46, 17, 16, 10, 3); fill(c, '#c9a671'); stroke(c, 1.4);
  rr(c, 40, 26, 10, 10, 2); fill(c, PAL.gold); stroke(c, 1.4); ell(c, 45, 38, 9, 6); fill(c, PAL.gold); stroke(c, 1.6);
  for (const x of [80, 104, 126, 146, 162]) { ell(c, x, 26, 2.4, 2.4); stroke(c, 1.2, PAL.steel); }
}
function drawHeadlamp(c, body = PAL.black, lens = '#f3ecc8') {
  ell(c, 45, 40, 38, 24); stroke(c, 7, '#3a3a36'); ell(c, 45, 40, 38, 24); stroke(c, 1.4);
  rr(c, 28, 44, 34, 24, 6); fill(c, body); stroke(c);
  ell(c, 45, 56, 9, 9); fill(c, lens); stroke(c, 1.6);
}
function drawStove(c) {
  rr(c, 22, 52, 36, 34, 6); fill(c, PAL.blue); stroke(c); rr(c, 22, 60, 36, 8, 1); fill(c, PAL.silver); stroke(c, 1.2);
  rr(c, 32, 40, 16, 14, 3); fill(c, PAL.brass); stroke(c, 1.6);
  for (const s of [-1, 1]) line(c, [40, 40, 40 + s * 26, 22], 2.4, PAL.steel);
  line(c, [40, 40, 40, 18], 2.4, PAL.steel);
  shape(c, [30, 36, 40, 26, 50, 36]); fill(c, '#7fb3e0'); stroke(c, 1.2);
  rr(c, 52, 44, 16, 5, 2); fill(c, PAL.steel); stroke(c, 1.2);
}
function drawFuel(c) {
  ell(c, 40, 76, 30, 10); fill(c, PAL.blueD); stroke(c);
  rr(c, 10, 30, 60, 46, 10); fill(c, PAL.silver); stroke(c);
  rr(c, 10, 46, 60, 14, 1); fill(c, PAL.blue); stroke(c, 1.4);
  ell(c, 40, 30, 30, 9); fill(c, '#dfe3e6'); stroke(c);
  rr(c, 33, 16, 14, 12, 3); fill(c, PAL.steel); stroke(c, 1.6);
}
function drawRainJacket(c) {
  rr(c, 8, 10, 84, 40, 8); fill(c, '#c99a2e'); stroke(c);
  line(c, [8, 28, 92, 28], 1.4, '#8f6a1a'); line(c, [50, 10, 50, 50], 1.4, '#8f6a1a');
  shape(c, [30, 10, 50, 2, 70, 10]); fill(c, '#b5861f'); stroke(c, 1.6);
  for (const x of [20, 80]) { rr(c, x - 6, 34, 12, 8, 2); stroke(c, 1.2, '#8f6a1a'); }
}
function drawHeadNet(c) {
  ell(c, 40, 46, 30, 30); fill(c, 'rgba(38, 35, 31, .78)'); stroke(c);
  for (let i = -24; i <= 24; i += 8) { line(c, [16 + 0, 46 + i, 64, 46 + i], 0.8, 'rgba(160,160,150,.6)'); line(c, [40 + i, 18, 40 + i, 74], 0.8, 'rgba(160,160,150,.6)'); }
  ell(c, 40, 20, 26, 7); fill(c, PAL.moss); stroke(c, 1.6);
}
function drawChair(c) {
  rr(c, 14, 8, 72, 62, 8); fill(c, '#3f5443'); stroke(c);
  rr(c, 14, 76, 72, 62, 8); fill(c, '#3f5443'); stroke(c);
  for (const y of [24, 40, 56, 92, 108, 124]) line(c, [18, y, 82, y], 1.2, '#2c3b2f');
  for (const x of [10, 90]) line(c, [x, 20, x, 128], 2.4, PAL.black);
  rr(c, 4, 66, 92, 14, 3); fill(c, '#33463a'); stroke(c, 1.4);
}
function drawPouch(c, col, band, word) {
  rr(c, 12, 10, 56, 74, 6); fill(c, col); stroke(c);
  rr(c, 12, 10, 56, 12, 2); fill(c, band); stroke(c, 1.4);
  rr(c, 20, 34, 40, 30, 3); fill(c, PAL.paper); stroke(c, 1.2);
  label(c, word, 40, 49, 11);
}
function drawCoffee(c) { drawPouch(c, '#a77a4a', '#7a5634', 'COFFEE'); }
function drawCocoa(c) { drawPouch(c, '#6a3a22', '#4a2414', 'COCOA'); }
function drawKnife(c) {
  shape(c, [24, 6, 30, 6, 32, 58, 24, 58]); fill(c, PAL.silver); stroke(c, 1.6);
  line(c, [26, 10, 27, 54], 1, '#e8ecee');
  rr(c, 20, 58, 16, 36, 5); fill(c, '#c9a46c'); stroke(c);
  for (const y of [68, 78]) { ell(c, 28, y, 2, 2); fill(c, PAL.brass); }
}
const FILLET_COL = { walleye: '#f3e6cf', pike: '#efe8da', smallmouth: '#f1e4cf', laketrout: '#f2c7a8', perch: '#f4e9d2', crappie: '#f3ebdc' };
function drawFillets(c, sp) {
  const col = FILLET_COL[sp] || '#f2e6d0';
  for (const x of [8, 26]) { shape(c, [x + 8, 8, x + 16, 18, x + 16, 82, x + 8, 94, x, 82, x, 18]); fill(c, col); stroke(c, 1.6); line(c, [x + 8, 16, x + 8, 86], 1, '#d9b9a0'); }
}
function drawSpinnerbait(c) {
  line(c, [20, 80, 40, 40, 64, 20], 2, PAL.steel);
  ell(c, 66, 16, 8, 14, 0.6); fill(c, PAL.gold); stroke(c, 1.4);
  ell(c, 20, 76, 9, 9); fill(c, '#e8e2d0'); stroke(c, 1.4);
  for (let i = 0; i < 7; i++) line(c, [18, 82, 6 + i * 4, 92], 1.6, '#b8d03a');
}
function drawJigMinnow(c) {
  ell(c, 18, 30, 12, 12); fill(c, '#d96a2a'); stroke(c);
  shape(c, [28, 30, 46, 22, 86, 26, 96, 30, 86, 34, 46, 38]); fill(c, '#c9ced2'); stroke(c, 1.4);
  ell(c, 14, 27, 3, 3); fill(c, PAL.black);
  line(c, [60, 38, 64, 50, 56, 52], 1.8, PAL.steel);
}
function drawTopwater(c) {
  shape(c, [6, 25, 18, 14, 80, 12, 104, 20, 104, 30, 80, 38, 18, 36]); fill(c, '#e8e2d0'); stroke(c);
  shape(c, [6, 25, 18, 14, 30, 13, 30, 37, 18, 36]); fill(c, PAL.red); stroke(c, 1.4);
  ell(c, 16, 22, 3, 3); fill(c, PAL.black);
  for (const x of [46, 88]) line(c, [x, 38, x, 46, x - 4, 46], 1.8, PAL.steel);
}
function drawCedarMinnow(c) {
  shape(c, [6, 25, 20, 13, 78, 12, 104, 22, 104, 28, 78, 38, 20, 37]); fill(c, '#e9e0c6'); stroke(c);
  shape(c, [20, 13, 78, 12, 104, 22, 70, 22, 20, 22]); fill(c, '#6f8a52'); stroke(c, 1.2);
  ell(c, 18, 22, 3.4, 3.4); fill(c, PAL.black);
  for (let x = 34; x < 80; x += 9) line(c, [x, 24, x + 4, 30], 0.9, '#a39470');
  line(c, [104, 25, 110, 25], 1.6, PAL.steel); for (const x of [46, 86]) line(c, [x, 38, x, 46, x - 4, 46], 1.8, PAL.steel);
}
function drawPackDry(c) {
  rr(c, 14, 18, 72, 84, 12); fill(c, '#5d6b5a'); stroke(c);
  rr(c, 18, 6, 64, 18, 6); fill(c, '#4a5648'); stroke(c); for (const y of [11, 16]) line(c, [22, y, 78, y], 1.2, '#38423a');
  for (const x of [28, 72]) { rr(c, x - 4, 18, 8, 60, 2); fill(c, PAL.black); stroke(c, 1.2); rr(c, x - 6, 74, 12, 8, 2); fill(c, PAL.steel); stroke(c, 1.2); }
  rr(c, 36, 50, 28, 26, 4); fill(c, '#536150'); stroke(c, 1.4);
}
function drawBagFood(c, col, specks, seal = PAL.blue) {
  rr(c, 8, 14, 44, 82, 6); fill(c, 'rgba(239,232,214,.92)'); stroke(c);
  rr(c, 12, 34, 36, 58, 4); fill(c, col);
  c.fillStyle = specks; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(16 + ((i * 7) % 30), 40 + ((i * 13) % 48), 2, 0, Math.PI * 2); c.fill(); }
  rr(c, 8, 14, 44, 8, 2); fill(c, seal); stroke(c, 1.4);
}
function drawPancakes(c) { drawBagFood(c, '#e2c88e', '#c9a46a', PAL.red); rr(c, 38, 60, 14, 26, 4); fill(c, '#9a5a22'); stroke(c, 1.4); }
function drawChili(c) { drawPouch(c, '#a8402e', '#7a2a1e', 'CHILI'); }
function drawBannock(c) { drawBagFood(c, '#efe6cf', '#d8cba8', PAL.green); }
function drawSausage(c) {
  rr(c, 8, 14, 84, 30, 15); fill(c, '#9a2a22'); stroke(c);
  ell(c, 86, 29, 6, 13); fill(c, '#c98a7a'); stroke(c, 1.4);
  line(c, [6, 29, 2, 22], 2, PAL.cream); for (const x of [30, 52, 70]) line(c, [x, 16, x - 4, 42], 1, '#7a1a14');
}
function drawGranola(c) {
  for (const [y, col] of [[44, '#c9a24a'], [30, '#2f68a8'], [16, '#b4321f']]) { rr(c, 8, y, 74, 14, 3); fill(c, col); stroke(c, 1.6); }
  rr(c, 40, 12, 10, 48, 2); fill(c, PAL.paper); stroke(c, 1.2);
}
function drawApricots(c) {
  rr(c, 8, 8, 64, 64, 8); fill(c, 'rgba(239,232,214,.9)'); stroke(c);
  for (const [x, y] of [[24, 28], [44, 26], [30, 46], [52, 46], [40, 60], [22, 60]]) { ell(c, x, y, 9, 7, 0.4); fill(c, '#d98a3a'); stroke(c, 1.2); }
  rr(c, 8, 8, 64, 8, 2); fill(c, PAL.orange); stroke(c, 1.2);
}
function drawTortilla(c) {
  for (const y of [56, 50, 44]) { ell(c, 36, y, 30, 12); fill(c, '#ead9a8'); stroke(c, 1.6); }
  rr(c, 60, 18, 24, 40, 5); fill(c, '#b07a3a'); stroke(c); rr(c, 58, 14, 28, 8, 2); fill(c, PAL.red); stroke(c, 1.4);
}
function drawAxe(c) {
  rr(c, 21, 30, 8, 116, 4); fill(c, '#d8c094'); stroke(c);
  shape(c, [10, 8, 40, 6, 46, 16, 44, 40, 30, 36, 20, 36, 6, 40, 4, 16]); fill(c, '#4a4640'); stroke(c);
  for (const [x, y] of [[14, 20], [34, 24], [24, 14]]) { ell(c, x, y, 2, 2); fill(c, '#6a5a48'); }
  label(c, 'HB', 25, 26, 9, '#8a7a6a');
}
function drawHatchet(c) {
  rr(c, 22, 30, 10, 66, 4); fill(c, PAL.orange); stroke(c);
  rr(c, 22, 78, 10, 18, 3); fill(c, PAL.black); stroke(c, 1.4);
  shape(c, [8, 10, 34, 8, 40, 16, 38, 34, 26, 32, 16, 32, 4, 34, 3, 16]); fill(c, '#3c3f42'); stroke(c);
  line(c, [5, 30, 15, 31], 1.6, PAL.silver);
}
function drawTradeSilver(c) {
  c.beginPath(); c.moveTo(40, 70); c.bezierCurveTo(8, 46, 14, 14, 40, 28); c.bezierCurveTo(66, 14, 72, 46, 40, 70); c.closePath(); fill(c, '#c7c9cc'); stroke(c);
  c.beginPath(); c.moveTo(40, 58); c.bezierCurveTo(22, 44, 26, 26, 40, 36); c.bezierCurveTo(54, 26, 58, 44, 40, 58); c.closePath(); stroke(c, 1.4, '#7d8186');
  line(c, [14, 40, 66, 40], 1.6, '#9a9ea3');
}
function drawBrassReel(c) {
  ell(c, 44, 40, 30, 30); fill(c, '#b8923a'); stroke(c);
  ell(c, 44, 40, 20, 20); fill(c, '#d9b45a'); stroke(c, 1.4);
  ell(c, 44, 40, 5, 5); fill(c, PAL.black);
  line(c, [44, 40, 78, 26], 3, PAL.black); ell(c, 80, 25, 6, 6); fill(c, PAL.black);
  rr(c, 30, 70, 28, 6, 2); fill(c, PAL.steel); stroke(c, 1.2);
}
function drawMatchSafe(c) {
  rr(c, 16, 18, 28, 64, 6); fill(c, '#a0a4a8'); stroke(c);
  rr(c, 13, 10, 34, 14, 3); fill(c, '#8a8e92'); stroke(c); for (let x = 17; x < 46; x += 4) line(c, [x, 11, x, 23], 0.8, '#6a6e72');
  line(c, [20, 40, 26, 46, 34, 44], 1.2, '#7a7e82'); line(c, [22, 64, 40, 62], 1, '#7a7e82');
}
function drawToque(c) {
  c.beginPath(); c.moveTo(10, 60); c.bezierCurveTo(12, 18, 78, 18, 80, 60); c.closePath(); fill(c, '#a8322a'); stroke(c);
  rr(c, 6, 54, 78, 18, 6); fill(c, '#8a2620'); stroke(c); for (let x = 12; x < 82; x += 6) line(c, [x, 56, x, 70], 1, '#6a1a14');
  ell(c, 45, 18, 10, 9); fill(c, '#c94a3a'); stroke(c, 1.6);
}
function drawLuckyCap(c) {
  c.beginPath(); c.moveTo(14, 50); c.bezierCurveTo(16, 12, 74, 10, 78, 50); c.closePath(); fill(c, '#6e2630'); stroke(c);
  shape(c, [70, 46, 98, 52, 96, 60, 66, 56]); fill(c, '#5a1e26'); stroke(c);
  ell(c, 44, 34, 11, 9); fill(c, '#d9b45a'); stroke(c, 1.2); label(c, 'D', 44, 34, 11, '#5a1e26');
  ell(c, 46, 12, 4, 3); fill(c, '#5a1e26');
}
function drawGuideMap(c) {
  rr(c, 6, 8, 88, 86, 3); fill(c, '#e3d6b4'); stroke(c);
  for (const x of [36, 64]) line(c, [x, 8, x, 94], 1, '#c9b78e'); line(c, [6, 50, 94, 50], 1, '#c9b78e');
  c.beginPath(); c.moveTo(16, 70); c.bezierCurveTo(26, 40, 52, 66, 60, 34); c.bezierCurveTo(66, 18, 84, 30, 82, 48); c.bezierCurveTo(80, 70, 50, 84, 16, 70); fill(c, '#9cbcc9'); stroke(c, 1.4, '#5d8fb0');
  ell(c, 62, 44, 9, 8); stroke(c, 2.2, '#5a4a3a'); line(c, [57, 39, 67, 49], 1.6, '#5a4a3a'); line(c, [67, 39, 57, 49], 1.6, '#5a4a3a');
  line(c, [20, 22, 40, 26, 50, 20], 1.2, '#5a4a3a');
}

const FILLETS = Object.fromEntries(['walleye', 'pike', 'smallmouth', 'laketrout', 'perch', 'crappie'].map((sp) => [`fillet:${sp}`, [50, 100, (c) => drawFillets(c, sp)]]));
addIcons({
  bag3: [100, 108, drawBag3], bagdown: [100, 100, drawBagDown], padair: [50, 110, drawPadAir], rodpro: [176, 44, drawRodPro],
  headlamp2: [90, 76, (c) => drawHeadlamp(c)], headlamp3: [90, 76, (c) => drawHeadlamp(c, PAL.red, '#fff4d0')],
  stove: [80, 90, drawStove], fuel: [80, 90, drawFuel], rainjacket: [100, 56, drawRainJacket], headnet: [80, 80, drawHeadNet], chair: [100, 146, drawChair],
  coffee: [80, 92, drawCoffee], cocoa: [80, 92, drawCocoa], knife: [56, 100, drawKnife], fillet: [50, 100, (c) => drawFillets(c, 'walleye')], ...FILLETS,
  spinnerbait: [80, 96, drawSpinnerbait], jigminnow: [100, 56, drawJigMinnow], topwater: [110, 50, drawTopwater], cedarminnow: [112, 50, drawCedarMinnow],
  packdry: [100, 108, drawPackDry], pancakes: [60, 104, drawPancakes], chili: [80, 92, drawChili], bannock: [60, 104, drawBannock],
  sausage: [100, 56, drawSausage], granola: [90, 70, drawGranola], apricots: [80, 80, drawApricots], tortilla: [90, 80, drawTortilla],
  axehead: [50, 150, drawAxe], hatchet: [44, 100, drawHatchet], tradesilver: [80, 80, drawTradeSilver], brassreel: [90, 82, drawBrassReel], matchsafe: [60, 90, drawMatchSafe],
  toque: [90, 80, drawToque], luckycap: [100, 70, drawLuckyCap], guidemap: [100, 102, drawGuideMap],
});
