# Round 4 join for main (claude/r4-final)

Built from claude/round4 (aae89a9). Merged into it with `--no-ff`, in this order: claude/loop-r4 (728fb87), claude/r4-loopfix (feb09e3), claude/r4-roadsfix (ba28be6) and claude/r4-cabins (78c9d81).

## Conflicts
- **src/player.js**: the wording at the map's end. Stream A wrote "Past here is off your maps" and stream B wrote "The map ends here". The join keeps A's wording, which is also the one in the plan doc. Check 5 of `r4-roads-test` and the doc's line now expect it.
- **src/props.js**: the imports. Both are kept: `nearRoad` with `roadGap`/`onRoad` from B, and `cabinExclusions`/`tileCabins` from C.

## Seams fixed
- **Cabins.** Stream B regenerated `edge.bin`, and its ways in by water are now 250 m wide. South Lake's way in, along Gunflint, put 2 of the Gunflint cabins inside the doorstep, where the runtime would have skipped them and `r4-cabins-test` check 1 would have failed. The fix was to run `scripts/cabins.mjs` again on the joined `edge.bin`, roads and moved places (the OSM buildings and piers are cached in the scratchpad). 7 of the 30 spots changed (4 on Gunflint, 3 on Vermilion). There are still 30 spots, all of them out, but only 25 cabins are built: the runtime's ground check (`buildCabin`, src/cabins.js) skips 12, 13 and 14 on Burntside, 20 on Gunflint and 27 on White Iron as too steep or too near the shore (chk-r4b). Left as it is; see the final pass below.
- **Notices.** Stream A's `pastNotice` combined with B's `edge.bin` meant a local survey at Moose Lake came back null from `tasks.makeKind`: it drew one place, found it past the edge and gave up. That broke gl-d (the run crashed at its trip) and r2-tickets check 7. `makeKind` now makes up to 6 draws, as the board's own picking already does.

## The seams rig: scripts/r4-final-test.mjs (11/11 on fedora)
- **A.** EP 16, started from the wizard, and EP 67, started from the title, both open at the moved store. Before the talk there is no canoe and no life jacket. The guide's step, its gem and the tracker point at the staffer there. After the loan the jacket counts. The starter route leaves from that store's dock for a site in play, and the truck's stand is behind that store.
- **B.** A ride from 67 to 16 arrives at the moved store's door with the truck leaving. A ride from 67 to the 75 lot (170 m in from the south edge) arrives in the lot with the truck leaving. Walking with W held down the lot's way to the water: no jacket, no over-the-shoulder camera, no edge notice, and the truck is gone.
- **C.** Over 80 nights, no party camps past the band or in Quetico (8,574 camps checked). No Quetico campsite is left in play, and no camp drawn nearby is past the band.
- **D.** In co-op, a guest in Quetico gets only the one notice, "You have left the Boundary Waters", and no Quetico one. The host inside sees no notice. Back in, the guest's notice comes down.

`scripts/loop-r4-all.sh` now also runs the round 4 rigs, and r2-starter and r4-roads each get an hour.

## Final pass (the two checkers: chk-r4a playtest, chk-r4b defects/saves/perf)
Fixed:
- **EP 16 "E won't get in" (major): the rig's aim, not the game.** At the moved dock the berth sits a little above the bank you stand on. The rig aimed under your own feet in third person, and the ray passed the stern. A pitch sweep found the canoe under the dot at every pitch from level down to the default third-person look. Only the rig's steep aim missed it. `r3-final-play` now looks at the canoe the way a player would (a little down, then at its gunwales, then the old aim) and logs the state before E. It gets in at 16 now (19/19 passes at 31 on rerun; 16's only misses are the party checks below).
- The truck's rack is bare once it has left your canoe in a lot or comes to fetch you. A truck parked behind a store keeps one of its own (truck.js `setRack`, a draw range: no new mesh).
- No "0 rods to go" at the end of a trail: when you face out of the trail from its end, the bar counts the whole carry (player.js).
- The prompt at the carry's far end names two things, then "and N more things" (packs.js `namesBrief`). Four names had pushed its Q off the screen.
- The "Unload it" teaching line comes down once the canoe is empty or shouldered (`hints.next` has `until`), and "the ground" is lower-case. "…set out beside the canoe" is now said once: inv-ui's setOutAll and runNear had both said it.
- Edge notice in Quetico: the same title, and on the first time the second line drops "Private land, cabins and the roads to town" (`WORDS.out.bare`). Elsewhere it is unchanged.
- The loaned canoe's step ends when a ride takes the canoe more than 600 m from the home landing (onboarding.js `canoeAway`). Food and leeches stay listed, as they do when you paddle off without them ("at an outfitter's shelf").
- The board footer for the firewood kind is "Firewood wanted" (it had read "Wood for the stove" under "Wood for the smoker").
- Keepers no longer offer a Quetico permit: "your permit stops at the line" (outfitters.js, talk-keepers.js).
- Old saves: a trip under way at a moved store's old landing now carries on at the store where it stands now (outfitter.js boot reads `fromMovedStore` for `d.pos`). An on-foot save where a lot used to be (old 75, 59 m from the south end) now stands you in the nearest lot within 800 m with the canoe beside you, not afloat on a trip (main.js `standInLot`). chk-r4b's SVLOAD now passes for lot75 and store16-dock.

Tried and taken out: a ramp past each bridge deck's end (roads.js `deckAt`). The truck's roll at EP 40's bridge end stayed at 0.85 m, and it added one at EP 34's Tomahawk Road crossing.

Left, and why:
- **EP 40 bridge end, EP 50 and 80 wheels, EP 50/49/80 road grade, the trunk on road 1, and the two-track over water at (-37700, 15276)**: these are the round's known road and wheel spots (r4-roads checks 2 and 3 fail as they did on the base). The 40 bridge end is a mismatch in the bank's grade: the shore fades the road grade out at the bank. It needs a grading change in road-grade.js and a ground rerun, not a runtime patch.
- **25 of the 30 cabins built**: `buildCabin` skips 12, 13 and 14 (Burntside), 20 (Gunflint) and 27 (White Iron) on the ground. Moving them takes `scripts/cabins.mjs` checking slope and shore, run on a host.
- **No party setting out or camped near at 16 and 67 (r3-final-play 12 and 15)**: real quotas (67 has 1 a day) and the rig's clock, which is past 9 am at the moved stores. July has 2–3 parties a day at 16 and 0–1 at 67.
- **The push-off on Bush Creek (67) moves 1.8 m in 2.5 s**: the creek is shallow, and the shallow-water drag is by design. You are in the canoe and under way.
- r2-ep-check (EP 6/77 carries) is known. r4-final-test's 80-night camps section loses the page on ben (three times); on fedora the fixed head passes 11/11.
