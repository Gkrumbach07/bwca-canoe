# Round 4, stream TUT: the tutorial polish (2026-11-08)

Branch `claude/r4-tut` from main `aeaffbb` (round 3 live). Two jobs: the teaching moments (`src/hints.js` and the
moments the other modules register through `main.js`) reviewed against round 3's empty-handed start, and the gold gem
over the store's shelves kept clear of the HUD's top bar. Rig: `scripts/r4-tut-test.mjs`.

## What a new season's first two days look like now

You start at the home store's door with $40, the bottle and nothing else; your own things (bag, pad, clothes, tarp,
tablets) wait in the crate. The tracker card says "New task: Talk to <staffer> at the counter" and the gem is over
them; their line comes as you step in ("Got a minute? Come to the counter."). The talk lends the canoe (paddle, life
jacket, barrel, stringer, rod) and gives the old gear; the keeper gives the first permit and pencils the first night's
way. Then the main path: food and leeches at the shelves (gems over them), the canoe at the dock (gem), the push-off.
The first night is at the pencilled site, with the small job to look over its grate, latrine and pad.

## Every moment that can fire in the first two days

Order is the order the review expects them in a usual first season. "Changed" says how.

| Moment | When | Verdict | Why |
|---|---|---|---|
| (all teaching lines) | the store's first seconds | **changed** | No teaching line until the staffer has spoken at the door and for 6 s after (or 14 s at the store if they have not spoken yet: a season starts outside). The tracker card and the gem have the first word. Before: "V change the view" came 3 s in, over the "New task" card. |
| `view` "{V} change the view" | 1 s on foot | keep | after the hush |
| `jog` "{Shift} jog" | 6 s walking | keep | |
| `shelf` "{E} look at the shelf" | in reach of a shelf | **changed** | Waits until the talk is done (the gem is on the staffer), unless the dot is on a shelf (then its key is the thing). |
| `storeparty` "Going in or just out, they know the water. E to talk." | a party in the store, none met | **changed** | Waits until the talk is done at the home store. |
| `maps` "The map table sells the map of these lakes…" | in a store with no sheet | keep | Never fires at home now (the home sheet comes with the season), so it stays for a player far from home. |
| `grey` "{right-click} a thing in the book to see why" | the dot 2.5 s on a greyed verb | keep | |
| `book` "{I} your pack and what's around you" | beside the canoe, your things on the ground | **changed** | Not while the dock is empty (the hidden hull counted as "beside your canoe"). |
| `hungry` | hungry | **changed** | In a store with nothing to eat: "Hungry, and no food with you. The provisions shelf has it." (was "An outfitter sells it", standing in one). |
| `nofood` | the energy's warning | **changed** | In a store: "No food, and not much left in you. The provisions shelf, now." |
| `thirsty`, `bottle`, `cold`, `wet`, `tired`, `treating`, `untreated` | the body | keep | The bottle is always yours; tablets, clothes and the bag come out of the crate with the old pack. |
| `spent`, `nearly`, `donein` | the danger | keep | |
| (I with a {I} line up) | any line saying {I} | **changed** | While the tracker's tutorial card is up, the first I opened the journal at the task, not the pack the line on screen names. Now a line that says {I} gets its I (journal.taskPeek asks hints.wantsKey). |
| `starter:ask` | a new store, not home | keep | Never at home. |
| `start` "Your first night's way is pencilled on your map: {M}." | 3 s under way | keep | Already the pencilled line when the keeper suggested the route. |
| `dayuse` | a day-use trip near sunset | keep | The first permit is overnight, so not on the first trip. |
| `evening` | 2 h to 45 min before sunset, under way | **changed** | Names the pencilled site ("Before dark: your site is pencilled on your map, 1.9 mi east. {M}") instead of the nearest free one, which could be a different site from the one the keeper held and the job is at. Without a pencilled way, as before. |
| `dusk` "Dark soon. Make camp." | the last 45 min, away from a site | keep | |
| `portage`, `unload` | a portage | keep | The starter routes avoid carries, but the lines still hold. |
| `whitecaps`, `swamping`, `castwind` | wind | keep | The first trip's weather is gentle (no whitecaps). |
| `fish` "{F} to fish" | still afloat 6 s, the rod in the canoe | keep | The rod is the loan's. |
| `bait` "Bait: leeches from the bucket, within reach." | the bobber rig, no leech in reach | keep | Leeches always come with a bucket in r3 (shop.js). |
| `site` "A campsite. Before dark: a fire, the tent, your food hung up." | at a site on a trip | keep | Not a double of the tracker: the tracker says the job ("Look over the grate"), this the camp. |
| `ringempty`, `ringwood`, `lit`, `cooked`, `low`, `coals`, `wetwood`, `mealwater` | the fire | keep | The pot comes in the old pack. |
| `tarpred` | the tarp's ghost goes red | keep | |
| `bears` "Bears: hang your food…" | dusk at camp, food out | keep | The barrel is the loan's. |
| `bearnoise`, `bearback` | a bear | keep | |
| `bugs`, `blackflies` | bugs | keep | Names the head net, which you don't own yet; it's the shop's answer to the bugs, not a line about an item's use. |
| `lamp` "Dark. {H} for your headlamp." | dark, the lamp off | keep | The headlamp is on the hat, never an item. |
| `rain` | rain on a trip | keep | |
| `notebook` "The notebook: {I}, right-click it, Read." | the first night in the old tent | keep (and its I now opens the pack) | |
| `coldnight`, `side`, `remains` | kit | keep | |
| `push` "Beached. Hold {E} to push it off." | the next morning at the site | keep | Never at the dock (there it's "Get in"). |
| `paylater` "Done. Notices pay when you come in." | the first notice done on a trip | **removed while the tracker is on** | The tracker's own Done card says "Paid when you come in". It still shows if Settings › HUD › Task pop-ups is off. |
| `record`, `tally` | the trip's end, the first count | keep | |
| `gl-b:pickup`, `gl-b:landing`, `partytrail`, `lowCreek`, task-kind moments (`deadfall`, `litter`, `secchi`, `loons`), `artifact` | elsewhere | keep | Can't fire on the starter route's first two days unless you go looking. |

## The shelf gems and the top bar

The food and tackle gondolas stand 1.45 m tall, with their `at` 0.8 m up; the guide put the gem's target a metre over
that, so its point was at 2.1 m and the gem was pushed against the 2.38 m beam line. Standing at a shelf, the view put
it at the top of the screen, behind the energy bar (the "status bar" at the top left) or above the screen altogether.

- `guide.js` `SHELF_UP`: the target is a hand over the gondola's top (0.75 m over `at`) and in front of the gear wall's
  upper shelves (0.4 m), under the beams.
- `locator.js` `underBar`: every place's or thing's gem (never a person's) is lowered on the screen until its top is
  10 px under the lowest edge of the top bar's pieces that are up (`#energy`, `#strip`, `#compass`), its point no more
  than 0.45 m under the target's top. The bar is read four times a second.

Measured in the rig, the food shelf's gem top against the bar's bottom (149 px), px from the top of the screen:

| View | Distance | Before (the new spot, no keep-clear) | Now |
|---|---|---|---|
| 1280x720 first person | 1.2 / 1.8 / 2.6 m | -188 / -1 / 113 | 159 / 159 / 159 |
| 1280x720 third person | 1.2 / 1.8 / 2.6 m | 136 / 146 / 133 | 159 / 159 / 159 |
| 1920x1080 first person | 1.2 / 1.8 / 2.6 m | -355 / -21 / 186 | 159 / 159 / 190 |
| 1920x1080 third person | 1.2 / 1.8 / 2.6 m | 195 / 194 / 189 | 197 / 192 / 191 |
