// The speeds: one game clock for everyone, and how fast each thing you do is seen to move. The owner tunes them here.
//
//   what        constant         value    what it gives
//   clock       CLOCK            8        a game hour in 7½ real minutes, a game day in 3 real hours; every player alike
//   canoe       CANOE.cruise     12.5     m/s seen at a steady stroke (the hull at life's 1.6, times 7.8)
//               CANOE.hustle     15       m/s seen with Shift (life's 2.0, times 7.5)
//               CANOE.stroke     1        the paddle's cadence over life's (about 57 strokes a minute): calm, a long glide
//   carry       CARRY.seen       8        m/s seen with the canoe overhead, on a trail or off it
//               CARRY.hustle     9        m/s seen with Shift
//   trail       TRAIL.walk       5        m/s seen on foot on a portage trail without the canoe (the walk back, a pack)
//               TRAIL.jog        7        m/s seen with Shift
//   walk        WALK.seen        3.5      m/s seen on foot on open land (the woods, a shore, a burn)
//               WALK.jog         6        m/s seen with Shift
//   camp        CAMP.seen        3        m/s seen within a campsite's area, in a store and its yard
//               CAMP.jog         4.5      m/s seen with Shift
//   swim        SWIM_LAPSE       1.5      the swimmer's time-lapse (0.8 m/s at life is seen at 1.2), wading eased toward it
//
// Why (the owner, 2026-10-26, with multiplayer planned): one player cannot be allowed to change the clock, so the 1/2/3
// keys are gone. They had multiplied everything by 1, 2 or 4 (the clock, the motion and the paddle's stroke); the owner
// played walking at 1-2, portaging at 3 and canoeing at 3, "really unrealistically fast" (about 26 m/s, a frantic
// stroke). Now the clock runs at CLOCK for everyone, and each activity has its own seen speed, decoupled from the clock.
// The Rest dial and sleeping are the only time skips.
//
// How it works: the hull and the walker move at true speeds at life (LIFE; the paddle's thrust and drag in player.js,
// the gear's cruise on top), and are seen to move at that times a time-lapse (player.boost), which is how they are seen
// and nothing more. On the water the time-lapse is the seen cruise over life's (so the gear still shows: a Kevlar hull
// cruises faster seen as at life); it builds once the stroke is steady and eases off on a slow stroke, a hard turn and
// in the last few metres of a bank dead ahead (player.js). On foot it is the seen speed over the walk's own speed at
// life (so a load does not slow what is seen, as on the old trails, but a hill and the water still do), never above
// MAX_LAPSE. The paddle's stroke and the walker's legs run on real seconds, so the stroke stays calm.
//
// Ground covered a game hour (the clock against the seen speed): the canoe about 5.6 km, as in life (12.5 m/s for 450 s);
// a carry about 3.6 km; a walk in the woods about 1.6 km, round camp 1.35. Days on land run longer than in life, and the
// Rest dial sleeps through them (the owner's call of 2026-10-25).
//
// 'Real' is kept as a developer option (Settings › Developer › Real pace): the clock 1:1 and everything at life. 'life'
// is the camera's hold while it is raised (photo.js): the clock 1:1 and no time-lapse, whatever the pace.
//
//   paceOf(name) → { clock, lapse, label }: the clock's rate at a pace, and whether it time-lapses travel (lapse false: life)
//   clockOf(name): the clock's rate at a pace (trip.js sets day.rate to it every frame)
//   canoeLapse(hustle), footSeen(where, carrying, hustle): the time-lapse on the water, the seen speed on foot
//   footHours(lifeHours, paceName, lifeSpeed, seenSpeed): the game hours a stretch on foot takes when walked yourself, from
//     its hours at life (packs.js: a fetch costs what the walk would)
//   LIFE: the paces at life, m/s; lifeKmh(gear): the canoe's cruise at life in km an hour, with the gear's cruise
export const CLOCK = 8;
export const CANOE = { cruise: 12.5, hustle: 15, stroke: 1 };
export const CARRY = { seen: 8, hustle: 9 };
export const TRAIL = { walk: 5, jog: 7 };
export const WALK = { seen: 3.5, jog: 6 };
export const CAMP = { seen: 3, jog: 4.5 };
export const SWIM_LAPSE = 1.5;
// the most the walker is ever time-lapsed: a carry with the heaviest load still reads as a carry
export const MAX_LAPSE = 12;

// m/s at life: the aluminium canoe and the ash paddle at a steady stroke (Shift 2.0), a 3 mph walk and a jog, and a
// carry before the load slows it (player.js divides by (kg / 40) ^ 0.6: 55 kg of canoe and pack is 0.83 m/s, 3 km an hour)
export const LIFE = { cruise: 1.6, hustle: 2.0, walk: 1.35, jog: 2.9, carry: 1.0, carryHustle: 1.25 };

export const PACES = {
  trip: { clock: CLOCK, lapse: true, label: 'Trip' },
  // a developer option (Settings › Developer): the clock as in life and everything at life
  real: { clock: 1, lapse: false, label: 'Real' },
  // not a setting: the camera's (photo.js) while it is raised: life itself, the clock 1:1, whatever the pace
  life: { clock: 1, lapse: false, label: 'Life' },
};
export const paceOf = (name) => PACES[name] || PACES.trip;
export const clockOf = (name) => paceOf(name).clock;

// the canoe's time-lapse on open water at a steady stroke: the seen speed over life's
export const canoeLapse = (hustle = false) => (hustle ? CANOE.hustle / LIFE.hustle : CANOE.cruise / LIFE.cruise);
// the seen speed on foot, m/s: where is 'trail' | 'camp' (a site's area, a store and its yard) | 'land'
export function footSeen(where, carrying, hustle) {
  if (carrying) return where === 'camp' ? (hustle ? CAMP.jog : CAMP.seen) : hustle ? CARRY.hustle : CARRY.seen;
  if (where === 'trail') return hustle ? TRAIL.jog : TRAIL.walk;
  if (where === 'camp') return hustle ? CAMP.jog : CAMP.seen;
  return hustle ? WALK.jog : WALK.seen;
}
// the game hours a stretch on foot takes when you walk it yourself, from its hours at life: seen at seenSpeed while the
// clock runs at the pace's rate
export function footHours(lifeHours, name, lifeSpeed, seenSpeed) {
  const P = paceOf(name), T = P.lapse ? Math.min(MAX_LAPSE, Math.max(1, seenSpeed / Math.max(0.1, lifeSpeed))) : 1;
  return (lifeHours * P.clock) / T;
}
export const lifeKmh = (gear = null) => LIFE.cruise * 3.6 * (gear && gear.cruise ? gear.cruise : 1);
