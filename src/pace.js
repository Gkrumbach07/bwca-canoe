// The pace: how the game's time follows the trip. The owner (2026-10-23): "id like the distance i can travel in a real
// day in bwca to be equal to the game just make the game faster. so you paddle faster. unless you set to real mode. but
// obv you would want to slow down for certain parts like walking around, fishing".
//
// Everything moves at life pace (LIFE: a loaded solo canoe cruises at 4 km an hour, a portage carry goes at 3), and
// while you travel the canoe or the walker and the clock both run at a time-lapse factor T, so a game hour always
// covers what an hour covers in life: 4 km paddled (times the gear's cruise), 3 km carried. Trip pace (the default)
// time-lapses the travel: T is 6 on open water (the canoe seen at about 6.7 m/s, ten real minutes a game hour) and up to
// 3 on a portage trail (the carry seen at about 2.5 m/s: a canoe overhead cannot believably run). Real pace is T = 1.
// The slow parts (camp and its chores, fishing and trolling, walking off a trail, swimming, a counter, standing about)
// have no boost and run on a gentle clock instead (IDLE: 12 at Trip, an hour of fishing in five real minutes; 1 at Real).
// The boost on the water fades near a shore ahead and near landings, when paddling slowly and when steering hard
// (player.js), so docking and beaching stay at life. The fast keys 1/2/3 (1×, 2×, 4×) multiply all of it.
//
//   paceOf(name) → { water, trail, idle }: the time-lapse on open water, at most on a trail, and the clock's when idle
//   LIFE: the paces at life, m/s; SEEN: the most the walker is seen to go on a trail, m/s (the trail's T is SEEN / LIFE)
//   lifeKmh(gear): the canoe's cruise at life in km an hour, with the gear's cruise (shop.js player.gear)
export const PACES = {
  trip: { water: 6, trail: 3, idle: 12, label: 'Trip' },
  real: { water: 1, trail: 1, idle: 1, label: 'Real' },
};
export const paceOf = (name) => PACES[name] || PACES.trip;

// m/s at life: the aluminium canoe and the ash paddle at a steady stroke (Shift 1.41), a walk and a jog, and a carry
// before the load slows it (player.js divides by (kg / 40) ^ 0.6: 55 kg of canoe and pack is 0.83 m/s, 3 km an hour)
export const LIFE = { cruise: 1.11, hustle: 1.41, walk: 1.35, jog: 2.9, carry: 1.0, carryHustle: 1.25 };
// m/s: on a trail the walker is seen at no more than this (the trail's time-lapse is SEEN / the pace at life, up to its T)
export const SEEN = { walk: 2.3, jog: 3.4, carry: 2.5, carryHustle: 2.9 };
export const lifeKmh = (gear = null) => LIFE.cruise * 3.6 * (gear && gear.cruise ? gear.cruise : 1);
