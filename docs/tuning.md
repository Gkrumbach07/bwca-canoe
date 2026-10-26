# Tuning: the season balance (2026-10-25)

The owner asked on 2026-10-25: "also once content is in, do tunning". This page sets out:

- the season as measured after content pass 1 and the one clock (fb5 C: Trip ×4 everywhere, the 1/2/3 keys ×1, ×2 and ×4)
- what was clearly off, and the change made to it
- what is left as a matter of taste

The pass changed numbers only, and added no new mechanics.

## How it was measured

The season was played in the headless driver, at 1440 × 900 on Adventure. It ran from EP 30 on July 12 and was played
twice. Everything a player does goes through the game's own systems:

- keys and the dot for the landings, the portages, the tent and the fishing
- the book's own moves for setting things down and putting them on the grate
- the Rest dial's pick for the nights

The two runs:

- **Exploring (by hand, step by step, on the base 4a10a25).** Five game days and three trips, with the board's own notices:
  - Trip 1: Lake One's rental canoe and Secchi reading, then a night on Lake Two.
  - Trip 2: the loon count on Gabbro over three portages, and a night.
  - Trip 3: a landing report and a lost locket, and a night on Lake Four.
  - Along the way: three capsizes, one evacuation, and a rainy morning with no stove.
- **The scripted season (`season.mjs`), the same on the base and on the tuned code.** The boards are seeded alike, and the
  weather is seeded by its date. The trips:
  1. Lake One's local notices, then Lake Two (site 827) and a night.
  2. The notices, then Gabbro over three portages (site 1534) and a night.
  3. The notices, then Lake Four (site 1617) and a night, Hudson Lake (site 1627) and a night.

  Each camp follows the same routine:
  - **Arriving:** the afternoon fished off the site until 4 pm.
  - **The evening:** pitch, gather wood, fill the bottle, then supper and a fish on the grate, rest to dusk and the night.
  - **The morning:** breakfast (on the stove when the wood is wet), douse, strike, load, push off, and an hour's fishing.
  - **The needs:** a drink when thirst shows (under 60), a snack's serving when hunger does (under 45).

A logger (`tune.js`) adds up each frame's real seconds at Normal (dt × the 1/2/3 factor) by activity. It also records:

- game hours
- money in and out
- the bar and each need at each step
- what was eaten
- each bite and catch
- each piece of wood the fire took

Held jobs (pitching, sawing, striking, dousing) pass their game minutes in a second or two of real time. So their real
minutes are small by design.

## The table: current, target, why

"Current" is the base (4a10a25), measured. ✔ means changed in this pass, and the change is in the last column.
Real minutes are at Normal (the 1/2/3 keys' ×1). At Faster they are half, and at Fastest a quarter.

### The clock and real time

| What | Current | Target | Why | Change |
|---|---|---|---|---|
| A game day | 90–180 real min (06:00 to 21:00 awake), most of it paddling and fishing | as it is | The owner accepted that days on land run longer and that you can sleep through things; the 1/2/3 keys are there | — |
| A travel day | 12–20 km and 2–3 portages: 60–75 real min paddling, 10–17 on the portages | as it is | A game hour on open water covers 5.1–5.8 km, as life does | — |
| A portage | 27 rods: 7 game min, 1.8 real. 117 rods in one carry: 20 game min, 5 real. With a fetch back for what was left: 60 game min, 7.6 real (the fetch passes behind a fade) | as it is | 2.2 km a game hour on a trail, a third of the water's | — |
| An evening at camp (pitch, wood, water, supper, a fish) | 15–18 real min, then the Rest dial | 12–15 | Pitching 1 real min (a hold of 16–19 game min); wood 4–9 real min (14 pieces, walked for); filling the bottle 0.6; supper 3.8 stood at the grate; a fish 2.5 | ✔ cooking |
| Cooking a supper | 15 game min, 3¾ real | 10 game min, 2½ real | Nothing is left to do while it cooks: the tent's hold is a minute, the wood is in by then | ✔ `cook.js COOK`, kit.js's meals ×⅔ |
| Breakfast, freeze-dried, a fish | 10 game min, 2½ real | 7 game min, under 2 | As supper | ✔ |
| Treating water (tablets) | 30 game min, 7½ real | as it is | It's a timer, and you paddle or cook meanwhile; real iodine takes 30 min; the pump ($35) is the upgrade that drinks at once | — (taste: 20 min if it drags) |
| A log's burn | 1.5 game h, 22 real min; a branch 0.6 h, 9 real; a pole as a log | as it is | An evening's 8–14 pieces burn 4–6 game hours | — |
| A night | a card of a few seconds, the clock to first light | as it is | | — |
| The camp clock | one clock: every chore runs at the clock's 4, the held jobs (pitch, strike, douse, saw) pass their minutes in a second or two | holds | Checked: no per-place rate left | — |

### Energy and the needs, a travel day

| What | Current | Target | Why | Change |
|---|---|---|---|---|
| The bar on a travel day | −0.06 a game hour paddling (0.011 a km), 1.0 to about 0.5 by the evening of a 15–20 km day | as it is | The pacing's target (0.85 to 0.4 on a 23 km day) | — |
| Food | −1/24 an hour awake, a third asleep: −0.65 a day, −0.12 a night. Supper +60, breakfast +50, a snack's serving +6 | as it is | Two meals a day keep you fed | — |
| Water | −1/8 an hour (3/16 hard), a third asleep. The 2 L bottle is +150. A day takes 2.5–3 L, 7–14 drinks | as it is | You wake at about 0.3 if you went to bed at 0.65, and at 0.64 if you went to bed full | — |
| Warmth | July: nothing but a capsize or a soaking | as it is | | — |
| Rest a night | A-frame 0.85, dome and four-season 1.0, the pad +0.05; no bag in reach ×0.6; a bag colder than its rating −0.035 a °C | A-frame 0.92 | At 0.85 every morning of a season began 15 % tired, and the rest ceiling took it lower all day | ✔ `items.js AFRAME_SLEEP` |
| A short night | A rest of 4 h that crossed dusk counted as a 4 h night: the rest need went from 0.77 to 0.48 | never below bedtime | Sleeping can't leave you more tired than you lay down | ✔ `energy.js sleep` |
| Portage energy | 0.04 of the bar a km of trail in one carry, 0.07 with the walk back: 4–6× a km of paddling | as it is | Up 1.6–2.1× since the one clock, but a carry should cost more than a paddle | — |
| A capsize | −0.25 of the bar (−0.5 in cold water), a meal spoiled, soaked: three in five days of the exploring run | lighter, rarer | cons-wind made them rarer (rod-up and Fastest fixes); the cost is in trip.js | ✔ taste call: only a meal outside a sealed container (below) |
| Sitting still fishing | the bar follows the ceiling, as idle or paddling: −0.07 a game hour, 0.78 to 0.55 over five hours in the lee | far less than paddling | The needs fall by the clock whatever you do, so a sit cost what a paddle did | ✔ taste call: light work (below) |

### Fishing

| What | Current | Target | Why | Change |
|---|---|---|---|---|
| Catch a game hour | 14–23 a game hour on a jig off a good shore (16 over the scripted afternoons), 22 on leeches, 1–10 on a spinner, 1 in deep water at midday | near the old clock's, about 5 | Bites come per real second. The one clock made a game hour 3× its real seconds, and the fight and the catch card (about 35 real s a fish) a third of the game minutes they were. A third of the bites still landed 9 a game hour; a fifth lands about 5 | ✔ `fishing.js TUNING.base` 1/80 → 1/400 |
| Leeches | a dozen gone in 32 game min (one a bite) | a few game hours | follows the bite rate | ✔ (by the same) |
| Big fish | one pike in six over a metre (length = range × random^1.7): three of 104–115 cm in an hour | rarer | A metre pike is a trophy | — (taste: `LENGTH_SKEW` 2.5) |
| The landing net | 1.5–5 kg fish throw the hook at the side up to 35 % without it | as it is | The net is worth its $20 while big fish are common | — |
| Lures against species | the takes read as words (Neutral … Excellent); a jig fished everything well | as it is | Nothing clearly off | — |
| Casting in a blow | the lure flew as in still air and came down on the ring in any wind | carried by the wind; blown back only in whitecaps, with a reason | The owner's taste call | ✔ `fishing.js CAST_WIND` (below) |
| A fish's food | +30 whatever its size: an 18 cm crappie +30 | by weight | Half a supper for an eating-sized fish | ✔ `items.js fishEat`: 18 cm crappie +7, 25 cm perch +12, 45 cm walleye +30, a metre pike +45 |

### The economy

| What | Current | Target | Why | Change |
|---|---|---|---|---|
| The start | $40: food for a night $11–14, $26–29 left | as it is | Enough for the saw, or the head net and a lure | — |
| Notices' pay | 240 sampled at six outfitters: local $18 on average (6–44), medium $24 (6–37), far $38 (12–55) | as it is | Two local notices pay a night's food and an upgrade's share | — |
| How far a band lies | local up to 12.2 km out ("close by"), medium up to 12.8 km ("a day trip"; the deadfall's $45 from 13 km), far up to 16.9 | local within 7 km, medium within 9 | Close by is an hour or so each way at the pace, a day trip out and back in a day (20 km) | ✔ `tasks.js BAND_KM` |
| A trip's money | Exploring: $108 over three trips (two local notices a trip and one far one), against $11–17 of food a trip. Scripted (only the local notices the script can do): $54 | as it is | $20–35 net a trip buys about one small upgrade a trip early on. Trip 1's money bought the stove ($41), and a third trip's would buy the dome ($50) | — |
| The upgrade path | stove $41, dome $50, bent-shaft $40, rain jacket $30, pump $35, 3-season bag $45; Royalex $160, carbon $110, Kevlar $240 | Kevlar $200 | At $20–35 net a trip the Kevlar came after 8–10 trips of saving, and after the small upgrades nearer 20 trips. At $200 it is 7–8 trips, or about 18 after the small upgrades: still late in a season | ✔ taste call: `shop.js` Kevlar $200 ($180–210 by counter) |
| The bunk | $8: a bed, breakfast, a full bar, up at 7:00 | as it is | The cheap answer to coming home spent | — |
| Rides | the outfitters you know and the next unknown one only: Saganaga four rides from Moose on $29 | the three nearest unknown | Fewer rides to reach a new country | ✔ `rides.js UNKNOWN_RIDES 3` |

### Travel and the fire

| What | Current | Target | Why | Change |
|---|---|---|---|---|
| Canoes | aluminium 34 kg; Royalex 29 kg, ×0.97 speed, ×1.3 steady; Kevlar 20 kg, ×1.04 | as it is | Each has its reason: steady, light | — |
| Paddles | ash; bent-shaft ×1.05 cruise, ×0.95 effort; carbon ×1.09, ×0.9 | as it is | | — |
| Wind drift | 0.022 × wind × the boost | as it is | cons-wind adds the lee | — |
| "Two trips with the gear" | gone: it matched "^Portage: ", and the landing reads "Go ashore · Portage: …" | back, counted right | A pack on the back and one on the chest, a thing in each hand: a barrel on the chest is no second carry | ✔ `packs.js CARRY_EACH` |
| The landing at a portage | The hull beached 8.1 m from the trail at Lake One's 23-rod portage (its end 7.9 m up the bank), 6.3 m at its Kawishiwi end | 1.5–6 m | The carry should start at the hull | ✔ `player.js TRAIL_TO_WATER`: the trail runs on down to the waterline |
| Wood an evening | 8–14 pieces picked up; the ring holds 5–6 at once | as it is | | — |
| Lighting | three dry pieces, a branch among them | as it is | | — |
| Deadwood after rain | the pieces lying out stayed dry, so a fire lit right after a night of rain | wet for the hours a piece takes to dry | Rain is what makes the tarp and the stove worth carrying | ✔ `chores.js` (RAIN.wetAfter, WOOD_DRY.air) |

### The content playthrough's small leftovers

| Leftover | Change |
|---|---|
| A fish's food ignores its size | ✔ by weight (above) |
| The deadfall pays $45 from 13 km out, as "a day trip" | ✔ a medium notice lies within 9 km |
| The A-frame's night leaves rest at 0.85 | ✔ 0.92 |
| Rides reach only the next unknown outfitter | ✔ the three nearest |
| Coffee says "Needs hot water" beside a just-lit fire | ✔ `kit.js fireBeside` reads the fire's game heat. With the book up, the match's drawn flare stayed low for 45 s |
| "RAW cm" overlaps in a fish's cell | ✔ the length a line above the mark (`.ig-qty.ig-len`) |
| Two rumours on one lake overlap their labels | ✔ a label that would lie on one already written goes a line lower (`hud.js LABEL_TRIES`) |
| Arvid's map opens on blank paper | ✔ Look at the map owns the sheet its site lies on (it is "an old Fisher sheet") |
| The Sea Gull site's pad on a 19° slope | ✔ a pad steeper than 0.6 m across is looked for again 6–10 m round the ring (`props.js PAD_STEEP`) |
| Sue blocks the Lake One aisle | ✔ the "aisle" spot moved to the aisle's dead end by the counter (`npcs.js SPOTS`) |
| (coordinator) the portage landing 8.1 m off | ✔ (above) |
| (coordinator) a branch's right-click by the fire offers only Put in hand | ✔ "Put it on the fire" first, the ring's own action |

## Before and after: the season re-run

The scripted season ran on the base (4a10a25) and on the tuned code (1c83b8c and ee63ef4). Both runs had the same
boards, the same weather and the same steps, from July 12, 07:40 to July 16, 10:00:

- **Notices:** the rental canoe, a fish, and a lost dry bag, worth $54.
- **Purchases:** the stove after trip 1.
- **The nights:** a rainy first morning without a stove, then four nights at four sites.

Real minutes are at Normal. Cooking times show real/game minutes for each evening or morning in turn.

| | Before | After |
|---|---|---|
| Game days | 5 | 5 |
| Real minutes, all | 557 | 556 |
| · paddling | 211 | 211 |
| · portages | 36 | 36 |
| · fishing | 190 | 205 |
| · gathering wood | 33 | 34 |
| · cooking | 36 | 24 |
| · pitching, water, breaking camp | 13 | 13 |
| Game hours fished | 12.6 | 13.7 |
| Fish landed | 199 | 54 |
| **Fish a game hour** | **15.8** | **4.0** |
| Food each fried fish gave | +30 +30 +30 +30 | +27 +20 +23 +22 |
| Meals and fish eaten, snacks | 11, 2 | 11, 3 |
| Drinks from the bottle | 46 | 44 |
| Wood burnt | 35 pieces, 28 h | 35 pieces, 27 h |
| **Rest after each night** | **0.85** every night | **0.92** every night |
| The bar at each waking | 0.75 0.74 0.64 0.58 0.59 0.72 | 0.69 0.73 0.59 0.60 0.64 0.78 |
| The bar at each day's end | 0.74 0.64 0.58 0.72 0.53 | 0.73 0.59 0.60 0.78 0.60 |
| Money earned, spent, left | $54, $78, $16 | $54, $78, $16 |
| Pitching the tent | 1.0 / 19 each night | 1.0 / 19 |
| **Supper** | **4.0 / 16** each evening | **2.8 / 11** |
| A fish on the grate | 3.0 / 12 | 2.2 / 9 |
| Breakfast | 2.5 / 10 | 1.8 / 7 |
| Dousing, striking, loading | 0.1 / 9, 0.5 / 13, 0.3 / 2 | the same |

What moved is what was changed:

- the catch is a quarter of what it was
- supper and breakfast take two thirds of the time
- each night rests to 0.92
- fish feed by their size

The rest held: the day's real minutes, the travel, the portages, the money and the bar's shape. The bar ends each day a
little higher with the better night.

### The leftovers, checked in the page (`verify.mjs`)

| Check | Before | After |
|---|---|---|
| Food from a fried 18 cm crappie, 25 cm perch, 45 cm walleye, 104 cm pike | +30 each | +7, +12, +30, +45 |
| Rides offered at Lake One | 1 (Piragis) | 3 (Piragis, LaTourell's, Ely Outfitting) |
| A 4 h rest crossing dusk, 11 h awake | the rest need to 0.53 | stays at 0.68, what it was at bed |
| The Sea Gull site's pad | 16.5° (1.0 m of rise) | 4.1° (0.24 m), 10 m from the ring |
| The beached hull to the trail, Lake One's 23-rod portage | 8.1 m (Lake One end), 6.3 m (river end) | 1.0 m, 0.8 m |
| The same, Hudson Lake – Lake Four (22 rods) | 19.1 m | 0.5 m |
| "Two trips with the gear" off a landing with a second pack | no word; the count said 2 for pack + pack + barrel | "· two trips with the gear" when it is (one for a pack on the back, one on the chest, a barrel and a bucket in hand) |
| Arvid's map, Look at the map | sheet F-9 not owned (blank paper) | owned |
| Coffee by a fire just lit, the book up | the drawn heat 0.1: "Needs hot water" | ready (the game heat) |
| A fish's cell | "RAW" and "42 cm" on the same line | 42 cm at 449–461 px, the mark at 463–474 |
| A branch's right-click by a ring | Put in hand | Put it on the fire, Put in hand |
| Medium notices beyond 9 km (240 sampled) | 3 of 60 (to 12.8 km); local to 12.2 km | 1 of 60; local within 7.2 |
| Console errors over the season | none | none |

The Hudson – Lake Four carry still sticks about 10 m up from the water on that end, both before and after. The bank
there is too steep to walk: a world-data seam like the Jasper–Moose end. In the exploring run, the scripted landings at
Lake One's 23-rod portage once ended 53 m off, from a plain "Go ashore" at the edge of the portage's 28 m. A player who
waits for "Portage:" in the prompt lands at the put-in.

## Left for the owner's taste

These are recommendations; nothing here was changed in this pass. The owner's answers of 2026-10-26 follow the list.

- **The bar between trips.** Coming in doesn't rest you. A trip that comes home at noon and sets off again starts at the
  bar it came in with. In the exploring run that was 0.34, and a capsize then made it an evacuation. The $8 bunk
  answers it, at the cost of the rest of the day. The scripted season takes the bunk below 0.45. Two options:
  - let the counter's tap and an hour in the store bring the bar up a little
  - have a keeper say "you look done in" once

  (Kept as it is, 2026-10-26: the bunk is the answer.)
- **Big fish.** One pike in six is over a metre (`fishing.js startBite`: length = the range × random^1.7), and the size
  notices ask for the 60th–75th percentile. 2.5 would make a metre pike one in nine or ten. `tasks.js LENGTH_SKEW`
  has to move with it. (Kept, 2026-10-26.)
- **The capsize's cost.** It takes 0.25 of the bar (0.5 in cold water) and up to half a day of food, wherever the food
  is. Food in a sealed blue barrel should come through dry, as the barrel's own words say. The 0.25 seems fair now that
  cons-wind makes capsizes rarer and swamping comes first. (Taken, 2026-10-26: below.)
- **Treating water.** Tablets take 30 game minutes, which is 7½ real minutes. It's a timer, not a wait, unless the bottle
  is dry. If it drags, 20 minutes keeps the pump ($35, 5 min) worth having.
- **Real time on land.** A game day is 1½ to 3 real hours at Normal, and two thirds of that is the water and the
  fishing. The owner accepted long days on land. If evenings still feel long, the Rest dial's 4 pm and Dusk stops are
  the lever, not a faster camp clock.
- **The far notices pay least by the hour.** A local notice pays $14–24 for an hour or two. A far one pays $31–45 for a
  day and more, with three portages each way. The km pay could go up a little for the far band only (`KM_PAY` and the
  kinds' 1.5–2 a km). That would bring the Kevlar sooner, which the brief didn't want.
- **The Kevlar** came after 8–10 trips of saving, or near 20 trips after the small upgrades. That is late in a season
  of steady work, as asked. If it feels too far, $200 is the number to try. (Taken: below.)

## The owner's taste calls (2026-10-26)

The owner answered the list above with yes, no or ok, read as "is it fine as it is?".

**Kept as they are:**
- coming home doesn't rest you (the $8 bunk does)
- metre-long pike
- rain with no stove means no breakfast
- the head net works from a pack within 3 m

**Changed.** Each was measured before and after in the headless driver at 1440 × 900, with real keys and the real
mouse. The scripts are in session e939fbdb's scratchpad, `taste/`.

1. **A capsize spares the food in a sealed container.**
   - Before, the capsize took a meal from whatever food was in reach, sealed or not. A barrel holding three meals, and
     a breakfast loose in the Duluth pack, came out with two in the barrel and the loose one kept.
   - Now only a meal outside a sealed container is spoiled. A sealed container is a barrel (its screw lid is always on:
     `items.js sealed`), the waterproof portage pack (`dry`), or anything inside either (`inventory.sealed`).
   - The same capsize now leaves three meals in the barrel and loses the loose breakfast: "Half a day of food is
     spoiled; the food in the barrel stayed dry." With only the barrel's food, or the rest in the dry pack, nothing is
     lost: "The food stayed dry in the barrel." The bar's cost is unchanged.
2. **Casting in a blow** (`fishing.js CAST_WIND`).
   - Before, the lure flew as in still air. Every cast came down on the ring, 12.8–13.1 m out with no drift, in 4, 8
     and 12 m/s and in waves to 0.64 m. The join's "casts don't land" (8 tries at 0.8 m waves) didn't come up again in
     30-odd casts at 4–15 m/s, with frames drawn or stepped as the join's script stepped them.
   - Now the lure feels the wind where you cast: the wind's speed × the lee's shelter. The drag against the moving air
     is less the still air's, so a calm cast still lands on the ring. A tail wind carries it on by half its push.
   - Results for a 12.9 m cast, against 4 / 8 / 12 m/s:
     - into the wind: 11.0, 8.8 and 6.4 m (−15 %, −32 %, −50 %)
     - with it: 13.6, 13.9 and 14.0 m
     - across it: drifted 0.9, 2.1 and 3.8 m
   - In the lee under a windward shore at 12 m/s (a fetch of 50 m, 4.5 m/s felt), into the wind: 10.6 m.
   - Past 0.5 m of wind-wave where you cast (`caps`: whitecaps on open water) the cast is blown back to the rod.
     Snowbank's open water at 12 m/s (0.64 m) blew back all three casts. Lake Two at 12 m/s (0.49 m, 530 m of fetch)
     still landed.
   - Every cast blown back says "Blown back by the wind" on the action line. The first one also brings the moment
     'castwind': "Too windy to cast here. Fish the lee."
   - From the shore at 4–12 m/s the casts land too. On a 26 m cast with the wind 70° off they drift 2, 4.3 and 6.6 m
     from where the same cast lands in still air.
3. **Sitting still fishing is light work** (`energy.js FISHING`).
   - The bar sits at the ceiling the needs allow, so an hour costs what the needs lose in it, whatever you do.
   - Now, with the rod up and the canoe still, or standing to fish from the shore:
     - the hours awake count a third of themselves for the rest need (`awake` 0.35: awakeSince moves on, as a nap's or
       a coffee's does)
     - hunger falls at half the rate (`food` 0.5), thirst at 0.4 (`water`)
   - A fish on the line costs a little more while the fight lasts: the needs at the full rate, and 0.03 of the bar a
     game hour of effort (`fight`) with no rest.
   - Each case ran a game hour from the same start, with the bar at the ceiling and the water full:

     | | Before | After |
     |---|---|---|
     | Fishing afloat at dawn (Lake Two, 06:24, a jig, 6–8 fish, a quarter of the hour in fights) | −0.074 | −0.040 |
     | Fishing from the shore mid-morning (10:08) | −0.071 (the ceiling −0.100) | −0.040 |
     | Sitting idle afloat, the rod down | −0.070 | −0.070 |
     | Paddling, 5.5 km | −0.091 | −0.091 |

   - By these rates the join's five hours in the lee would take the bar from 0.78 to about 0.68, not 0.55. Idling with
     the rod down is as it was. Whether sitting on the bench or in the canoe should count as light work too is the
     owner's call.
4. **The Kevlar costs $200** (`shop.js`, `inv-ui.js`; it was $240). At the home counter (EP 30) the shelf's tag and the
   tooltip read $200. Other counters' prices run $180–210.

## How to measure again

The scripts are in session e939fbdb's scratchpad, `tuning/`. The driver is the content join's, on port 5558, with Vite
on 5557.

- **`tune.js`** is the logger, a driver helper. `window.__tune.report()` gives the per-day table.
- **`sea.mjs`** holds the steps: the store, the launch, travel with portages, fishing (`fish3.js`), landing at a site,
  the evening, the morning and the Rest dial.
- **`season.mjs`** is the scripted season: `RUN=before|after node season.mjs [step]`.
  - Each step saves `save-<RUN>-<n>.json`, so a run can resume with `node restore.mjs save-… && node season.mjs n+1`.
  - `compare.mjs` prints the before/after table.
- **`verify.mjs`** checks each change in the page:
  - fish, rides, econ (`econ.js` samples the boards by seed)
  - the pad, the landing (`land-test.js`), the trips, the short night, the coffee, Arvid's map
- **The before code** is an archive of 4a10a25 in `tuning/base/`. Serve it with Vite on the same port.
