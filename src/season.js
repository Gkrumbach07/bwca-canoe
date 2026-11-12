import { smoothstep } from './rng.js';

// A smooth year from twelve monthly means (d1 lakes): a periodic Catmull-Rom through the middles of the months, its
// nodes nudged until each month's mean of the curve is that month's value (a curve through the bare means would come
// out short at the peaks: July a few tenths under). Returns doy -> value; the doy may run past either end of the year.
const MONTH_START = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366];
export function monthlyCurve(values) {
  const mid = MONTH_START.slice(0, 12).map((s, m) => (s + MONTH_START[m + 1]) / 2 - 0.5);
  const nodes = values.slice();
  const at = (doy) => {
    const d = ((((doy - 1) % 365) + 365) % 365) + 1;
    let i = 11;
    while (i > 0 && d < mid[i]) i--;
    if (d < mid[0]) i = 11;
    const a = mid[i], b = i === 11 ? mid[0] + 365 : mid[i + 1], dd = d < a ? d + 365 : d, t = (dd - a) / (b - a);
    const p0 = nodes[(i + 11) % 12], p1 = nodes[i], p2 = nodes[(i + 1) % 12], p3 = nodes[(i + 2) % 12];
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  };
  for (let it = 0; it < 6; it++) {
    const means = values.map((_, m) => { let s = 0; const a = MONTH_START[m], b = MONTH_START[m + 1]; for (let d = a; d < b; d++) s += at(d + 0.5); return s / (b - a); });
    for (let m = 0; m < 12; m++) nodes[m] += values[m] - means[m];
  }
  return at;
}

// d1 lakes: the Kawishiwi River near Ely (USGS 05124480, beside the Lake One start), its monthly means over the gauge's
// record (scripts/lake-facts.mjs prints them): the water's temperature (°C, 12-16 years a month since 1977), for how
// cold a swim is, and its flow (cfs, since 1966), the spring flood five times the late summer's. Its lakes (Garden,
// Farm) go out about 27 April and freeze about 25 November (the DNR's medians), so a lake that goes out later warms
// later by as many days, and one that freezes later cools later.
export const RIVER = {
  tempC: [0.82, 0.51, 1.3, 3.1, 11.28, 19.55, 22.82, 21.95, 17.94, 10.75, 3.81, 1.4],
  flowCfs: [87, 66, 58, 231, 629, 362, 216, 133, 108, 128, 134, 116],
  iceOut: 117, iceIn: 329,
};
const riverTemp = monthlyCurve(RIVER.tempC), riverFlow = monthlyCurve(RIVER.flowCfs);
const FLOW_MEAN = RIVER.flowCfs.reduce((a, b) => a + b, 0) / 12;

// d1 lakes: the lake you are on thaws and freezes on its own days (lake-facts.js iceOf: the DNR's median ice-out and
// ice-in where it has the years, a fit to where a lake is and how big and deep it is elsewhere). main.js (`// d1 lakes:`)
// sets it from the lake under you or nearest, so the day cycle's season (and everything that reads its ice: the water,
// the plants, the loons, the sounds) is that lake's. Days of the year; ice-in past 365 is in January.
export const LOCAL_ICE = { out: 120, in: 329 };
export function setLocalIce(out, inn) {
  if (Number.isFinite(out)) LOCAL_ICE.out = out;
  if (Number.isFinite(inn)) LOCAL_ICE.in = inn;
}

// Snow on the ground, by the date: NOAA GHCN daily snow depth at Ely (USC00212543 1997-2010, USC00212561 2011-2026) and
// Ely 25E beside Lake One (USC00212555, 1998-2026), every day of the record pooled by its day of the year (five-day
// windows, ~230 readings each). [doy, median depth cm, share of days with an inch or more]. The first inch lies on
// one day in ten from late October, on half of them by 20 November, on nearly all from early December; the pack
// deepens to 45 cm by early March, is going through April (5 cm median by the 11th, an inch on a day in four by the
// 21st) and gone by early May. The record's own numbers (scratchpad season-S/normals.py made them).
const SNOW_NORMALS = [
  [1, 25, 0.98], [31, 38, 1], [61, 46, 0.92], [76, 36, 0.9], [86, 28, 0.81], [96, 15, 0.8], [101, 5, 0.59],
  [106, 1.5, 0.46], [111, 0.4, 0.27], [116, 0, 0.18], [121, 0, 0.1], [128, 0, 0.01], [135, 0, 0],
  [276, 0, 0], [286, 0, 0.05], [296, 0, 0.08], [306, 0, 0.13], [311, 0.3, 0.2], [316, 1, 0.43], [326, 2.5, 0.54],
  [331, 7.6, 0.78], [336, 10, 0.89], [346, 15, 0.9], [356, 18, 0.97], [366, 25, 0.98],
];
function snowNormal(doy) {
  const d = ((((doy - 1) % 365) + 365) % 365) + 1, T = SNOW_NORMALS;
  if (d <= T[0][0]) return [T[0][1], T[0][2]];
  for (let i = 1; i < T.length; i++) {
    if (d > T[i][0]) continue;
    const a = T[i - 1], b = T[i], t = smoothstep(0, 1, (d - a[0]) / (b[0] - a[0]));
    return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  return [0, 0];
}
// snowAt(doy): the ground's snow on the date. cover 0..1 how much of the open, flat ground it lies on (the share of the
// record's days with an inch down: in the fall the first patches, in the spring the last), depthCm the pack where it
// lies (the median), melt 0..1 how far the spring's melt has gone (south slopes and open ground first, the north
// slopes and the shade under the conifers last; 0 outside the spring). snow.js draws it, player.js wades it, the
// title's date picker reads it.
export function snowAt(doy) {
  const [depthCm, cover] = snowNormal(doy), d = ((((doy - 1) % 365) + 365) % 365) + 1;
  const melt = d < 200 ? smoothstep(66, 100, d) : 0;
  return { cover, depthCm, melt };
}

// The year in the Boundary Waters, from a day of the year. Dates are typical for the Ely area: ice-out
// around the end of April (the lake's own, above), birch and aspen leafing out mid-May, fireweed in high summer, colour in
// the last two weeks of September, bare by the end of October, freeze-up toward the end of November (the lake's own).
// Every value is 0..1 and changes smoothly over a week or two, so nothing pops.
export function seasonAt(doy, lake = LOCAL_ICE) {
  const io = lake.out, ii = lake.in;
  const ice = Math.max(1 - smoothstep(io - 8, io + 1, doy), smoothstep(ii - 10, ii + 2, doy)); // lakes frozen (the first term holds January)
  const leaf = smoothstep(128, 146, doy);                                                   // leaf-out, spring green first
  const spring = leaf * (1 - smoothstep(146, 175, doy));                                    // the pale fresh-leaf weeks
  const fall = smoothstep(258, 280, doy) * (1 - smoothstep(292, 304, doy));                 // gold and red
  const bare = smoothstep(290, 304, doy);                                                   // leaves down
  const grass = 1 - smoothstep(255, 290, doy) * 0.85 + (1 - smoothstep(130, 160, doy)) * 0; // green until September, then tawny
  const pads = smoothstep(152, 166, doy) * (1 - smoothstep(262, 276, doy));                 // lily pads on the surface
  const flower = smoothstep(184, 196, doy) * (1 - smoothstep(226, 240, doy));               // fireweed
  const loons = smoothstep(io - 2, io + 6, doy) * (1 - smoothstep(292, 304, doy));          // on the lakes (in as the ice goes out)
  const cold = 1 - Math.sin(Math.PI * smoothstep(120, 320, doy));                           // 0 in high summer, 1 at the edges
  // d1 lakes: the surface water, °C: the Kawishiwi's by the date, moved by as many days as this lake's ice-out is from
  // the river's lakes' in the spring (and its ice-in in the fall), near freezing under the ice. (It was a sine: 4 °C in
  // mid-May where the river runs 11, 17 in mid-July where it runs 23.)
  const shift = (io - RIVER.iceOut) * (1 - smoothstep(190, 240, doy)) + (ii - RIVER.iceIn) * smoothstep(190, 240, doy);
  const waterTemp = riverTemp(doy - shift) * (1 - ice) + 0.8 * ice;
  // the river's flow against its mean for the year (0.3 in late winter, 1.2 at ice-out, 3.3 in May, 0.6 in September),
  // the spring flood moved with the ice: d1 rapids reads it for the white water and the roar
  const flow = Math.max(0.2, riverFlow(doy - (io - RIVER.iceOut) * (1 - smoothstep(190, 240, doy))) / FLOW_MEAN);
  // golden grass and shrub tints for the ground cover and the deciduous foliage
  const grassTint = fall > 0 || bare > 0
    ? [1 + 0.2 * Math.max(fall, bare), 1 - 0.15 * Math.max(fall, bare), 1 - 0.45 * Math.max(fall, bare)]
    : spring > 0 ? [1 - 0.08 * spring, 1 + 0.04 * spring, 1 - 0.25 * spring] : [1, 1, 1];
  const sn = snowAt(doy);
  return { doy, snow: sn.cover, snowCm: sn.depthCm, snowMelt: sn.melt, ice, leaf, spring, fall, bare, grass, pads, flower, loons, cold, waterTemp, flow, grassTint, leafOn: leaf > 0.5 && bare < 0.5 ? 1 : 0 };
}

export function seasonName(doy) {
  if (doy < 60 || doy >= 335) return 'winter';
  if (doy < 152) return 'spring';
  if (doy < 244) return 'summer';
  return 'fall';
}

// e: the lilacs' bloom (docs/story/60-side-stories.md S7 and §0.6: "about 1–20 June", seeded ± 5 days a year; Round 2
// stream E). A pure function of the year and a season's seed, read by the story only (the layer's window:lilac on
// Mummo's thickets and the camera's "the lilacs at the old camp"); nothing in the game reads it with the story off.
// → { start, end } days of the year (end inclusive), open(doy)
export function lilacBloom(year, seed = '') {
  let h = 0x811c9dc5; const s = `lilac:${year}:${seed}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0, june1 = 152 + (leap ? 1 : 0);
  const start = june1 + ((h % 11) - 5), end = start + 19;
  return { start, end, open: (doy) => doy >= start && doy <= end };
}
// /e
