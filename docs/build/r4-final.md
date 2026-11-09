# Round 4 join for main (claude/r4-final)

Built from claude/round4 (aae89a9). Merged into it with `--no-ff`, in this order: claude/loop-r4 (728fb87), claude/r4-loopfix (feb09e3), claude/r4-roadsfix (ba28be6) and claude/r4-cabins (78c9d81).

## Conflicts
- **src/player.js**: the wording at the map's end. Stream A wrote "Past here is off your maps" and stream B wrote "The map ends here". The join keeps A's wording, which is also the one in the plan doc. Check 5 of `r4-roads-test` and the doc's line now expect it.
- **src/props.js**: the imports. Both are kept: `nearRoad` with `roadGap`/`onRoad` from B, and `cabinExclusions`/`tileCabins` from C.

## Seams fixed
- **Cabins.** Stream B regenerated `edge.bin`, and its ways in by water are now 250 m wide. South Lake's way in, along Gunflint, put 2 of the Gunflint cabins inside the doorstep, where the runtime would have skipped them and `r4-cabins-test` check 1 would have failed. The fix was to run `scripts/cabins.mjs` again on the joined `edge.bin`, roads and moved places (the OSM buildings and piers are cached in the scratchpad). 7 of the 30 spots changed (4 on Gunflint, 3 on Vermilion). There are still 30 cabins, all of them out.
- **Notices.** Stream A's `pastNotice` combined with B's `edge.bin` meant a local survey at Moose Lake came back null from `tasks.makeKind`: it drew one place, found it past the edge and gave up. That broke gl-d (the run crashed at its trip) and r2-tickets check 7. `makeKind` now makes up to 6 draws, as the board's own picking already does.

## The seams rig: scripts/r4-final-test.mjs (11/11 on fedora)
- **A.** EP 16, started from the wizard, and EP 67, started from the title, both open at the moved store. Before the talk there is no canoe and no life jacket. The guide's step, its gem and the tracker point at the staffer there. After the loan the jacket counts. The starter route leaves from that store's dock for a site in play, and the truck's stand is behind that store.
- **B.** A ride from 67 to 16 arrives at the moved store's door with the truck leaving. A ride from 67 to the 75 lot (170 m in from the south edge) arrives in the lot with the truck leaving. Walking with W held down the lot's way to the water: no jacket, no over-the-shoulder camera, no edge notice, and the truck is gone.
- **C.** Over 80 nights, no party camps past the band or in Quetico (8,574 camps checked). No Quetico campsite is left in play, and no camp drawn nearby is past the band.
- **D.** In co-op, a guest in Quetico gets only the one notice, "You have left the Boundary Waters", and no Quetico one. The host inside sees no notice. Back in, the guest's notice comes down.

`scripts/loop-r4-all.sh` now also runs the round 4 rigs, and r2-starter and r4-roads each get an hour.
