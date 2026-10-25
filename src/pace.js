// The pace: how fast the game's clock runs, and how fast the canoe and the walker are seen to move. The owner
// (2026-10-23): "id like the distance i can travel in a real day in bwca to be equal to the game just make the game
// faster. so you paddle faster. unless you set to real mode."
//
// One clock (fb5 C, decision 3 of the owner's third round of 2026-10-25: "I don't know why time has to pass
// differently when you're on land versus when you're in the water. It kind of should just be the same. The only thing
// that makes time different is when you do the times, the 1, 2, 3 speed change. If that means that days are longer
// when you're on land, I think that's fine because you can always sleep through things. Having time pass so quickly
// on land is kind of jarring."): the game clock runs at one rate everywhere at a given pace (`clock`: on the water, on
// a trail, on foot, in camp, standing about, fishing, in a store). Trip pace (the default) runs it at 4 times life,
// what the water had (a game hour in fifteen real minutes); Real pace runs it as in life. The 1/2/3 keys multiply it
// (SPEEDS: Normal, Faster, Fastest; main.js scales dt by player.timeScale). There is no idle rate and no trail rate any
// more: before, standing about ran the clock at 12 and a trail at up to 3, so three pieces of wood gathered at camp cost
// 45 game minutes.
//
// Motion stays believable on its own, and its time-lapse no longer touches the clock (player.boost is cosmetic):
//   - the canoe on open water is seen at the clock's rate (`water`: 4 at Trip, the cruise seen at about 6.4 m/s), so a
//     game hour of steady paddling still covers what an hour covers in life (5.8 km). The boost builds once the stroke
//     is steady and eases off on a slow stroke, a hard turn and in the last few metres of a bank dead ahead (player.js),
//     and while it is down the canoe covers less than life's ground per game hour.
//   - on a portage trail the walker is seen at no more than SEEN (a carry at 2.5 m/s), up to `trail` (3); off a trail,
//     outside a campsite's area, a store and its yard, a walk is seen at `foot` (1.8, about 2.4 m/s); within a site's
//     area, a store and its yard he walks at life. So a carry or a walk covers less than life's ground per game hour (a
//     portage carry about 2.2 km, a walk in the woods about 2.2): days on land run longer, and the Rest dial sleeps
//     through them, as the owner accepted above.
// "Life" has to look like life (the owner, 2026-10-23, at 60 fps: "you say its 4.8 but it feels like 2.4"): true metres,
// a walker stepping about 110 a minute of 0.73 m (canoe.js), a tripper's 5.8 km an hour in strokes of 1.6 m (player.js).
// The user sees no multipliers: describe() names the 1/2/3 state in plain words and a mark ("Faster ▶▶") for the pace
// toast (hints.js) and the corner mark (hud.js).
//
//   paceOf(name) → { clock, water, trail, foot, floor, label }: the clock's rate (before the 1/2/3 keys), and the seen
//     time-lapse of the canoe on open water, at most on a trail, of a walk off a trail, and the least while you travel
//     (1: life). 'life' is the camera's hold while it is up (photo.js): the clock 1:1 and no time-lapse. (`idle` is the
//     clock's old name, kept equal to it for readers from before fb5.)
//   clockOf(name): the clock's rate at a pace, before the 1/2/3 keys (trip.js sets day.rate to it every frame)
//   SPEEDS, speedOf(timeScale), speedOfKey(code): the 1/2/3 keys, { key, code, factor (player.timeScale), name, mark }
//   describe(player) or describe(paceName, timeScale) → { key, name, mark, label, pace, line } (+ life: true for the
//     camera's hold): words without numbers, label "Normal" / "Faster ▶▶" / "Fastest ▶▶▶", with " · Real pace" at Real
//   footHours(lifeHours, paceName, lifeSpeed, seenSpeed, cap): the game hours a stretch on foot takes when walked
//     yourself, from its hours at life (packs.js: a fetch costs what the walk would)
//   LIFE: the paces at life, m/s; SEEN: the most the walker is seen to go on a trail, m/s (the trail's T is SEEN / LIFE)
//   lifeKmh(gear): the canoe's cruise at life in km an hour, with the gear's cruise (shop.js player.gear)
export const PACES = {
  trip: { clock: 4, water: 4, trail: 3, foot: 1.8, floor: 1, label: 'Trip' },
  real: { clock: 1, water: 1, trail: 1, foot: 1, floor: 1, label: 'Real' },
  // not a setting: the camera's (photo.js) while it is raised: life itself, the clock 1:1, whatever the pace
  life: { clock: 1, water: 1, trail: 1, foot: 1, floor: 1, label: 'Life' },
};
for (const P of Object.values(PACES)) P.idle = P.clock; // the clock's old name (hints.js paceWords read it before fb5 E)
export const paceOf = (name) => PACES[name] || PACES.trip;
export const clockOf = (name) => paceOf(name).clock;

// the 1/2/3 keys (main.js): the factor on everything (dt), the clock and the motion alike; named, never numbered
export const SPEEDS = [
  { key: 1, code: 'Digit1', factor: 1, name: 'Normal', mark: '▶' },
  { key: 2, code: 'Digit2', factor: 2, name: 'Faster', mark: '▶▶' },
  { key: 3, code: 'Digit3', factor: 4, name: 'Fastest', mark: '▶▶▶' },
];
export const speedOf = (factor = 1) => SPEEDS.find((s) => s.factor === factor) || (factor > 2 ? SPEEDS[2] : factor > 1 ? SPEEDS[1] : SPEEDS[0]);
export const speedOfKey = (code) => SPEEDS.find((s) => s.code === code) || null;
// the 1/2/3 state in words for the toast and the corner mark, with no multipliers
export function describe(a, b) {
  const obj = !!a && typeof a === 'object', name = obj ? a.pace : a, s = speedOf((obj ? a.timeScale : b) || 1), P = paceOf(name);
  const life = name === 'life', real = P === PACES.real, fast = s.factor > 1;
  const label = (fast ? `${s.name} ${s.mark}` : s.name) + (real ? ' · Real pace' : '');
  const line = life ? 'The clock as in life while the camera is up'
    : fast ? `Time and travel run ${s.factor > 2 ? 'fastest' : 'faster'} · 1 for normal`
      : real ? 'Time as in life' : 'One clock on the water and on land';
  return { key: s.key, name: s.name, mark: s.mark, label, pace: P.label, line, ...(life ? { life: true } : {}) };
}
// the game hours a stretch on foot takes when you walk it yourself, from its hours at life: seen at seenSpeed (no more
// than the pace's `cap` times life) while the clock runs at the pace's rate
export function footHours(lifeHours, name, lifeSpeed, seenSpeed, cap = 'trail') {
  const P = paceOf(name), T = Math.min(P[cap] || 1, Math.max(1, seenSpeed / Math.max(0.1, lifeSpeed)));
  return (lifeHours * P.clock) / T;
}

// m/s at life: the aluminium canoe and the ash paddle at a steady stroke (Shift 2.0), a 3 mph walk and a jog, and a
// carry before the load slows it (player.js divides by (kg / 40) ^ 0.6: 55 kg of canoe and pack is 0.83 m/s, 3 km an hour)
export const LIFE = { cruise: 1.6, hustle: 2.0, walk: 1.35, jog: 2.9, carry: 1.0, carryHustle: 1.25 };
// m/s: on a trail the walker is seen at no more than this (the trail's time-lapse is SEEN / the pace at life, up to its T;
// fb3 A: the walk 2.6, so a trail is never slower than the woods at FOOT);
// off a trail a jog and a loaded carry are held to the same, a walk goes at the full FOOT (about 2.4 m/s)
export const SEEN = { walk: 2.6, jog: 3.4, carry: 2.5, carryHustle: 2.9 };
export const lifeKmh = (gear = null) => LIFE.cruise * 3.6 * (gear && gear.cruise ? gear.cruise : 1);
