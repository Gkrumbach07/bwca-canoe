// The dive (docs/story/60-side-stories.md S5 "The set piece: seeing and diving"; campaign-design Part 4 Round 7, 7B).
// Pure: no game imports (scripts/cmp-7b-unit.mjs runs it in Node). feed-side7b.js drives it: the player over the side,
// the view under, the heartbeat, the cold.
//
//   seeing({ wind, hour, cloud, dist, depth, secchi, month }) → bool   the wreck reads from the canoe: wind under 5 mph
//                         (2.2 m/s: no ripple to break the view), the sun high (10:00–15:00 in summer), a clear sky, within
//                         about 15 m, and the bed inside the water's clarity (depth ≤ the Secchi depth). Any of it not so:
//                         green water
//   breathOf(month, dives) → s   how long a breath lasts down there: colder water, a shorter one (May numbing), and a
//                         little less each dive after the first (tired)
//   dive(opts, api) → handle      one dive: { phase: 'down' | 'under' | 'up', t, breath, at (0..1 how far in the breath),
//                         heart (beats a minute), narrow (0..1 the view closing in), seen, work (s of E held on the case),
//                         reach (at the case) }
//     handle.update(dt, { hold (E held), up (Space), atCase (in reach of it) }) → null | { done, result }
//       result: 'case' (the case came free: the third time if the second ran out), 'up' (came up on your own),
//       'brought' (the breath ran out: brought up)
//     opts: { dives (before this one), work0 (s already worked on the case), seen0 (seen it on a dive before), month }
// No breath bar: the view narrows and the heart comes up (60 S5: "No breath bar"). The case wants WORK seconds of E held
// in all, across dives (the swollen leather works loose a little each time).
export const DIVE = {
  wind: 2.2,            // m/s: under 5 mph
  hours: [10, 15],      // the sun high enough to light the bed
  near: 15,             // m: read from the canoe within this
  down: 2.2,            // s: going down
  up: 1.8,              // s: coming up
  breath: { 5: 22, 6: 30, 7: 36, 8: 36, 9: 30, 10: 24 }, // s a breath lasts at 12 ft, by month (cold water: shorter)
  tired: 0.12,          // each dive after the first, this much less
  work: 7,              // s of E held on the case, in all, to work it free
  heart: [72, 150],     // beats a minute, from calm to the last of the breath
  seeT: 2.5,            // s under before the first dive has seen it (the wing, the body, the door)
};

export function seeing({ wind = 0, hour = 12, cloud = 0, dist = 0, depth = 3.5, secchi = 4.3, month = 7 } = {}) {
  if (!(wind < DIVE.wind)) return false;
  if (hour < DIVE.hours[0] || hour > DIVE.hours[1]) return false;
  if (cloud > 0.35) return false;
  if (dist > DIVE.near) return false;
  if (depth > secchi) return false;
  return month >= 5 && month <= 10;
}

export function breathOf(month = 7, dives = 0) {
  const b = DIVE.breath[month] || 24;
  return b * Math.max(0.6, 1 - DIVE.tired * Math.max(0, dives));
}

export function dive(opts = {}, api = {}) {
  const B = breathOf(opts.month || 7, opts.dives || 0);
  const h = {
    phase: 'down', t: 0, breath: B, under: 0, at: 0, heart: DIVE.heart[0], narrow: 0,
    seen: !!opts.seen0, work: opts.work0 || 0, reach: false, result: null, cold: (opts.month || 7) <= 5 || (opts.month || 7) >= 10,
    update(dt, inp = {}) {
      if (h.result) return { done: true, result: h.result };
      h.t += dt;
      if (h.phase === 'down') { if (h.t >= DIVE.down) { h.phase = 'under'; h.t = 0; } return null; }
      if (h.phase === 'under') {
        h.under += dt; h.at = Math.min(1, h.under / h.breath);
        // the heart comes up with the breath spent, faster past halfway; the view closes in over the last third
        h.heart = DIVE.heart[0] + (DIVE.heart[1] - DIVE.heart[0]) * Math.pow(h.at, 1.6);
        h.narrow = Math.max(0, (h.at - 0.62) / 0.38);
        if (!h.seen && h.under >= DIVE.seeT) { h.seen = true; if (api.emit) api.emit('seen', { dives: opts.dives || 0 }); }
        // the case: only once it has been seen on a dive before this one (the first dive is to see it)
        h.reach = !!inp.atCase && !!opts.seen0;
        if (h.reach && inp.hold) h.work += dt;
        if (h.work >= DIVE.work) return h.finish('case');
        if (inp.up) { h.phase = 'up'; h.t = 0; h.why = 'up'; return null; }
        if (h.at >= 1) { h.phase = 'up'; h.t = 0; h.why = 'brought'; return null; }
        return null;
      }
      if (h.phase === 'up' && h.t >= DIVE.up) return h.finish(h.why || 'up');
      return null;
    },
    finish(result) { h.result = result; h.phase = 'done'; if (api.done) api.done(result, { work: h.work, seen: h.seen }); return { done: true, result }; },
    cancel() { h.result = h.result || 'up'; },
  };
  return h;
}

// the pit at Bootleg, opened plank by plank (60 S6 "The pit"; the minigame `pitOpen`'s bookkeeping): the order the planks
// come out in (any order: each one the player pulls), one already fallen in (the gap Walt saw through), the hole open
// from above a plank's width at a time; the crate reached once every plank is out
export const PIT = { planks: 5, fallen: 3 }; // (plank 3 has already fallen in: it shows as the gap, and counts as out)
export function pitState(has = () => false) {
  const out = [];
  for (let i = 1; i <= PIT.planks; i++) if (i === PIT.fallen || has(`s6.plank.${i}`)) out.push(i);
  return { moss: has('s6.moss'), out, left: PIT.planks - out.length, open: has('s6.moss') && out.length === PIT.planks };
}
export function pitOpen(opts = {}, api = {}) {
  // a handle for the minigames runner: each update reads the facts; done when the last plank is out
  const h = { update() { const s = pitState(opts.has); if (s.open) { if (api.done) api.done('open', {}); return { done: true, result: 'open' }; } return null; }, cancel() {} };
  return h;
}
