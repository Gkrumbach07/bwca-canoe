// The pace: how the game's time follows the trip. The owner (2026-10-23): "id like the distance i can travel in a real
// day in bwca to be equal to the game just make the game faster. so you paddle faster. unless you set to real mode. but
// obv you would want to slow down for certain parts like walking around, fishing".
//
// Everything moves at life pace (LIFE: a loaded solo canoe cruises at 4 km an hour, a portage carry goes at 3), and
// while you travel the canoe or the walker and the clock both run at a time-lapse factor T, so a game hour always
// covers what an hour covers in life: 4 km paddled (times the gear's cruise), 3 km carried. Trip pace (the default)
// time-lapses the travel: T is 6 on open water (the canoe seen at about 6.7 m/s, ten real minutes a game hour) and up to
// 3 on a portage trail (the carry seen at about 2.5 m/s: a canoe overhead cannot believably run). Real pace is the floor.
//
// Life itself reads too slow on a screen. The owner tried it (same day, at 60 fps): a walk at a true 4.8 km an hour
// "just cant be the right scale" for how the ground goes by, and "the x2 feels more like the 1:1 should be"; the canoe
// the same. So at either pace nothing that travels is shown below twice life (floor): the canoe from its first stroke
// and the walker anywhere (SEEN: a walk at 2.7 m/s, a jog at 4.2), and the clock keeps step whenever you travel, so the
// readout's km an hour stays true. Real pace is that base and nothing more (no time-lapse on the water, the clock 1:1
// when you stop); Trip adds the time-lapse above it. Camp and its chores, fishing, swimming, a counter and standing
// about run on a gentle clock instead (IDLE: 12 at Trip, an hour of fishing in five real minutes; 1 at Real).
// The canoe's boost builds once the stroke is steady and eases off on a slow stroke or a hard turn, and only in the
// last few metres when the bow runs straight at a bank (so the hull does not hit the shore at speed); along a shore, by
// a landing and into a dock it keeps its speed (the owner did not like it slowing near the shore). The fast keys 1/2/3
// (1×, 2×, 4×) multiply all of it.
//
//   paceOf(name) → { water, trail, floor, idle }: the time-lapse on open water, at most on foot, at least while you
//     travel, and the clock's when idle
//   LIFE: the paces at life, m/s; SEEN: the speed the walker is seen at, m/s (his time-lapse is SEEN / the pace at life,
//     from 1 up to the pace's trail T)
//   lifeKmh(gear): the canoe's cruise at life in km an hour, with the gear's cruise (shop.js player.gear)
export const PACES = {
  trip: { water: 6, trail: 3, floor: 2, idle: 12, label: 'Trip' },
  real: { water: 2, trail: 2, floor: 2, idle: 1, label: 'Real' },
};
export const paceOf = (name) => PACES[name] || PACES.trip;

// m/s at life: the aluminium canoe and the ash paddle at a steady stroke (Shift 1.41), a walk and a jog, and a carry
// before the load slows it (player.js divides by (kg / 40) ^ 0.6: 55 kg of canoe and pack is 0.83 m/s, 3 km an hour)
export const LIFE = { cruise: 1.11, hustle: 1.41, walk: 1.35, jog: 2.9, carry: 1.0, carryHustle: 1.25 };
// m/s: the speed the walker is seen at, on a trail or off it (a walk at twice life; a jog and a carry less, since a
// runner or a canoe overhead at twice life would look like a sprint)
export const SEEN = { walk: 2.7, jog: 4.2, carry: 2.5, carryHustle: 2.9 };
export const lifeKmh = (gear = null) => LIFE.cruise * 3.6 * (gear && gear.cruise ? gear.cruise : 1);
