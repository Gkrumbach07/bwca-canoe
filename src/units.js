// Display units. The owner: "I'd like to switch off of metric and use imperial, so miles instead of kilometers, and
// feet and inches instead of meters and centimeters. And we could still use rods for the portages."
// Everything inside the game stays metric (metres, km, cm, kg, °C); only what a player reads goes through here.
// Rods stay rods (a portage rod is 16.5 ft, 5.03 m; see the portage code).

export const FT_PER_M = 3.28084;
export const MI_PER_KM = 0.621371;
export const IN_PER_CM = 0.393701;
export const LB_PER_KG = 2.20462;
export const MPH_PER_MS = 2.23694;

const halves = (x) => { const r = Math.round(x * 2) / 2, w = Math.floor(r); return r - w ? `${w || ''}½` : String(w); };

// a number of miles from km: "2.4", "12"
export const miles = (km) => { const mi = km * MI_PER_KM; return mi < 10 ? mi.toFixed(1) : String(Math.round(mi)); };
// a whole number of feet from metres (one decimal under 3 ft): "23"
export const feet = (m) => { const f = m * FT_PER_M; return f < 3 ? f.toFixed(1) : String(Math.round(f)); };
// "23 ft"
export const fmtFt = (m) => `${feet(m)} ft`;
// a depth: "23 ft"
export const fmtDepth = (m) => `${Math.round(m * FT_PER_M)} ft`;
// a distance from metres, short ones in feet (rounded as a person would), long ones in miles: "about 60 ft", "0.4 mi"
export function fmtDist(m) {
  const f = m * FT_PER_M;
  if (f < 1000) return `${f < 30 ? Math.max(1, Math.round(f)) : f < 200 ? Math.round(f / 5) * 5 : Math.round(f / 10) * 10} ft`;
  return `${miles(m / 1000)} mi`;
}
// a length from cm, to the half inch: "18½ in"
export const inches = (cm) => halves(cm * IN_PER_CM);
export const fmtIn = (cm) => `${inches(cm)} in`;
// a size to beat, rounded up to the half inch (so a fish shown at that length or more passes): "20 in"
export const fmtInUp = (cm) => { const r = Math.ceil(cm * IN_PER_CM * 2 - 1e-6) / 2, w = Math.floor(r); return `${r - w ? `${w || ''}½` : w} in`; };
// feet and inches from metres: "6 ft 4 in"
export function fmtFtIn(m) {
  const t = Math.round(m * FT_PER_M * 12), f = Math.floor(t / 12), i = t - f * 12;
  return f ? `${f} ft${i ? ` ${i} in` : ''}` : `${i} in`;
}
// a weight from kg: a fish "3 lb 4 oz" / "12 oz", gear "44 lb" / "1.5 lb" / "8 oz"
export function fmtLbOz(kg) {
  const oz = Math.round(kg * LB_PER_KG * 16), lb = Math.floor(oz / 16), r = oz - lb * 16;
  return lb ? `${lb} lb${r ? ` ${r} oz` : ''}` : `${Math.max(1, r)} oz`;
}
export function fmtLb(kg) {
  const lb = kg * LB_PER_KG;
  if (lb < 1) return `${Math.max(1, Math.round(lb * 16))} oz`;
  return `${lb < 10 ? (Math.round(lb * 2) / 2).toString() : Math.round(lb)} lb`;
}
// a number of pounds: "44"
export const pounds = (kg) => { const lb = kg * LB_PER_KG; return lb < 10 ? (Math.round(lb * 2) / 2).toString() : String(Math.round(lb)); };
// a temperature from °C: "48 °F"
export const degF = (c) => Math.round(c * 9 / 5 + 32);
export const fmtF = (c) => `${degF(c)} °F`;
// a difference in temperature from °C: "+5 °F"
export const fmtDF = (dc) => `${dc >= 0 ? '+' : '−'}${Math.round(Math.abs(dc) * 9 / 5)} °F`;
// speeds: from km/h and from m/s, "2.5 mph"
export const fmtMphKmh = (kmh) => `${(kmh * MI_PER_KM).toFixed(1)} mph`;
export const fmtMphMs = (ms) => `${Math.round(ms * MPH_PER_MS)} mph`;
// a map scale bar near `want` metres: { m, label }
const BARS = [[100 / FT_PER_M, '100 ft'], [250 / FT_PER_M, '250 ft'], [500 / FT_PER_M, '500 ft'], [1000 / FT_PER_M, '1000 ft'],
  [804.672, '½ mi'], [1609.344, '1 mi'], [3218.688, '2 mi'], [8046.72, '5 mi'], [16093.44, '10 mi'], [32186.88, '20 mi'], [80467.2, '50 mi']];
export function scaleBar(want) {
  let best = BARS[0];
  for (const b of BARS) if (Math.abs(b[0] - want) < Math.abs(best[0] - want)) best = b;
  return { m: best[0], label: best[1] };
}
