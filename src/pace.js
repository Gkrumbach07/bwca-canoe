// The pace: how the game's time follows the trip. The owner (2026-10-23): "id like the distance i can travel in a real
// day in bwca to be equal to the game just make the game faster. so you paddle faster. unless you set to real mode. but
// obv you would want to slow down for certain parts like walking around, fishing".
//
// Everything moves at life pace (LIFE: a solo canoe cruises at 5.8 km an hour, a walk is 3 mph, a portage carry goes
// at 3 km an hour), and while you travel the canoe or the walker and the clock both run at a time-lapse factor T, so a
// game hour always covers what an hour covers in life. Trip pace (the default) time-lapses the travel: T is 4 on open
// water (the canoe seen at about 6.4 m/s, about fifteen real minutes a game hour) and up to 3 on a portage trail (the
// carry seen at about 2.5 m/s: a canoe overhead cannot believably run). Real pace is T = 1 throughout: life, 1:1.
//
// "Life" has to look like life. The owner (same day, at 60 fps): "you say its 4.8 but it feels like 2.4 ... the x2
// feels like 1:1". Two numbers were wrong, not the scale of the world (true metres, a 1.78 m paddler, trees mostly
// 12 to 22 m): the walker stepped about 1.6 times too often, so a 3 mph walk came out in 0.45 m steps and read as a
// shuffle at half the speed (canoe.js now steps as people do, about 110 a minute of 0.73 m); and the canoe's cruise was
// a dawdle of 4 km an hour in 1.2 m strokes (player.js now holds a tripper's 5.8 km an hour, strokes of 1.6 m).
// For a day the 2x floor stood in for these (96b3c81, ce8a1e8); with them fixed, 1:1 is 1:1 again.
// Camp and its chores, fishing, walking about off a trail, swimming, a counter and standing about have no boost and
// run on a gentle clock instead (IDLE: 12 at Trip, an hour of fishing in five real minutes; 1 at Real).
// The canoe's boost builds once the stroke is steady and eases off on a slow stroke or a hard turn, and only in the
// last few metres when the bow runs straight at a bank (so the hull does not hit the shore at speed); along a shore, by
// a landing and into a dock it keeps its speed (the owner did not like it slowing near the shore). The fast keys 1/2/3
// (1×, 2×, 4×) multiply all of it.
//
//   paceOf(name) → { water, trail, floor, idle }: the time-lapse on open water, at most on a trail, at least while you
//     travel (1: life), and the clock's when idle ('life' is the camera's hold while it is up: photo.js)
//   LIFE: the paces at life, m/s; SEEN: the most the walker is seen to go on a trail, m/s (the trail's T is SEEN / LIFE)
//   lifeKmh(gear): the canoe's cruise at life in km an hour, with the gear's cruise (shop.js player.gear)
export const PACES = {
  trip: { water: 4, trail: 3, floor: 1, idle: 12, label: 'Trip' },
  real: { water: 1, trail: 1, floor: 1, idle: 1, label: 'Real' },
  // not a setting: the camera's (photo.js) while it is raised: life itself, the clock 1:1, whatever the pace
  life: { water: 1, trail: 1, floor: 1, idle: 1, label: 'Life' },
};
export const paceOf = (name) => PACES[name] || PACES.trip;

// m/s at life: the aluminium canoe and the ash paddle at a steady stroke (Shift 2.0), a 3 mph walk and a jog, and a
// carry before the load slows it (player.js divides by (kg / 40) ^ 0.6: 55 kg of canoe and pack is 0.83 m/s, 3 km an hour)
export const LIFE = { cruise: 1.6, hustle: 2.0, walk: 1.35, jog: 2.9, carry: 1.0, carryHustle: 1.25 };
// m/s: on a trail the walker is seen at no more than this (the trail's time-lapse is SEEN / the pace at life, up to its T)
export const SEEN = { walk: 2.3, jog: 3.4, carry: 2.5, carryHustle: 2.9 };
export const lifeKmh = (gear = null) => LIFE.cruise * 3.6 * (gear && gear.cruise ? gear.cruise : 1);
