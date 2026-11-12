// The weather's adapter for the story (story Round 2, stream A2; docs/story/30-mining-years.md §4.3; campaign-design §2):
// the rain days, read off weather.js's own seeded forecast (it is built a year at a time, so the days ahead are known as
// a forecast is), as the atoms the story reads. It emits nothing: the rain is a live atom, never a saved fact (a fact
// is grow-only, and a rain comes and goes).
//
//   rain.days(abs) → hours of rain that day (light rain, rain, storm)          rain.isDay(abs) → ≥ KETTLE.rainDay hours
//   rain.spells({ from, to }) → [{ a, b }]   two or more rain days running (abs days, a ≤ b), within [from, to]
//   rain.spellAt(abs) → the spell whose notice window holds `abs` (from the first day to 5 days after the last) | null
//   rain.force({ from, days }) · rain.clear()   a forecast two-day rain set by hand (the rigs; kept in story.doc.dir.a2rain)
//   sensors: rain.days (the spell now or next: its length in days, 0 when none within a week), rained (rain in the last
//   two days), kettlenotice / kettlerun / kettleday (kettle.js reads them through `rain`)
//
// Registered with the feed (story-feed.js), so it attaches only when the feed starts (STORY_ON) and never on a guest
// (the guest's story is a mirror: its sensors read nothing it can act on).
import { feed } from './story-feed.js';
import { registerSensor } from './story-cond.js';
import { KETTLE } from './story-data/mining.js';

const RAIN_STATES = new Set([4, 5, 6]); // weather.js S.lightRain, S.rain, S.storm
const DAY0 = (year) => Math.round(Date.UTC(year, 0, 1) / 86400000) - 1; // (abs day of the year's day 0: absDay(year, doy) = DAY0 + doy)
const ymd = (abs) => { const d = new Date(abs * 86400000), y = d.getUTCFullYear(); return { year: y, doy: abs - DAY0(y) }; };
for (const [k, v] of Object.entries({ rained: 'flag', kettlenotice: 'flag', kettlerun: 'flag', kettleday: 'flag' })) registerSensor(k, v);

class Rain {
  constructor() { this.weather = null; this.story = null; this.cache = new Map(); }
  get forced() { const d = this.story && this.story.doc; return d && d.dir && d.dir.a2rain ? d.dir.a2rain : null; }
  hours(abs) {
    const F = this.forced;
    if (F && abs >= F.from && abs < F.from + F.days) return 24;
    if (!this.cache.has(abs)) {
      const W = this.weather; let n = 0;
      if (W && typeof W._hour === 'function') { const { year, doy } = ymd(abs); for (let h = 0; h < 24; h++) { try { const o = W._hour(year, (doy - 1) * 24 + h); if (o && RAIN_STATES.has(o.s)) n++; } catch { break; } } }
      this.cache.set(abs, n);
      if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value);
    }
    return this.cache.get(abs);
  }
  isDay(abs) { return this.hours(abs) >= KETTLE.rainDay; }
  spells({ from, to }) {
    const out = []; let a = null;
    for (let d = from; d <= to + 1; d++) {
      if (d <= to && this.isDay(d)) { if (a == null) a = d; continue; }
      if (a != null && d - a >= 2) out.push({ a, b: d - 1 });
      a = null;
    }
    return out;
  }
  // the spell whose notice window holds `now` (fractional abs day): from 18:00 of its first day to 5 days after its last
  spellAt(now) {
    const day = Math.floor(now);
    for (const S of this.spells({ from: day - KETTLE.notice.days - 12, to: day + 1 })) {
      const open = S.a + KETTLE.notice.from / 24, close = S.b + 1 + KETTLE.notice.days;
      if (now >= open && now < close) return S;
    }
    return null;
  }
  // the morning after the rain quits, a weekday (Tasha's sampling day): the abs day, or null
  kettleDay(S) {
    if (!S) return null;
    for (let d = S.b + 1; d <= S.b + 1 + KETTLE.notice.days; d++) { const dow = new Date(d * 86400000).getUTCDay(); if (KETTLE.tasha.dows.includes(dow)) return d; }
    return null;
  }
  running(now) { const S = this.spellAt(now); return !!(S && now >= S.b + 1 && now < S.b + 1 + KETTLE.runDays); }
  rained(now) { const day = Math.floor(now); return this.isDay(day) || this.isDay(day - 1) || this.isDay(day - 2); }
  force({ from, days = 2 } = {}) {
    const s = this.story; if (!s || !s.doc || s.mode === 'mirror') return false;
    s.doc.dir.a2rain = { from: Math.floor(from), days: Math.max(2, days | 0) }; s.dirty();
    return true;
  }
  clear() { const s = this.story; if (s && s.doc && s.doc.dir) { delete s.doc.dir.a2rain; s.dirty(); } }
}
export const rain = new Rain();

feed.register('weather', (api) => {
  const s = api.story, mods = api.mods || {};
  rain.story = s;
  rain.weather = mods.weather || (typeof window !== 'undefined' && window.__game && window.__game.weather) || null;
  if (!s || typeof s.sensor !== 'function' || s.mode === 'mirror') return () => {};
  const now = () => s.nowAbs();
  const offs = [
    s.sensor('rain.days', () => { const n = now(), S = rain.spellAt(n) || rain.spells({ from: Math.floor(n), to: Math.floor(n) + 7 })[0]; return S ? S.b - S.a + 1 : 0; }),
    s.sensor('rained', () => rain.rained(now())),
    s.sensor('kettlenotice', () => !!rain.spellAt(now())),
    s.sensor('kettlerun', () => rain.running(now())),
    s.sensor('kettleday', () => { const n = now(), S = rain.spellAt(n), d = rain.kettleDay(S); const h = (n - Math.floor(n)) * 24; return d != null && Math.floor(n) === d && h >= KETTLE.tasha.hours[0] && h < KETTLE.tasha.hours[1]; }),
  ];
  return () => { for (const off of offs) { try { off(); } catch { /* gone */ } } };
});
