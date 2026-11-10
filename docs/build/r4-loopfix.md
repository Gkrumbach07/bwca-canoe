# Round 4 loop fixes, stream A (claude/r4-loopfix)

The adversarial check's gameplay defects on claude/loop-r4 (728fb87), and the owner's later call on Quetico. Rig:
`scripts/r4-loopfix-test.mjs` (D1, D4, D6); Quetico and the board's notices are `edge-test.mjs` step 6 and
`loop-r4-test.mjs` P4.

## Quetico is plain out of bounds

The owner, after the edge decisions of 2026-11-08: "Quetico is DLC for now - keep it as unplayable like we do with the
other out of bounds areas."

- `src/edge.js` reads the table's zone 3 (Quetico) as any land past the wilderness (`remapQuetico`, at decode): within
  the band (400 m) of a wild cell a doorstep, else out. On the current `edge.bin` that is 888,150 cells out and 14,375 a
  doorstep (the Canadian half of the border lakes near the line, as the band round the rest of the wilderness). A
  table with no zone 3 is left as it is, so a rebake by stream B that writes Quetico as out needs nothing here.
- One notice: "You have left the Boundary Waters". The Quetico notice, its map tag and its green sign are gone.
- No Quetico permit, no $50 ticket (`PRICES.quetico`, `queticoNight`, `holdsQuetico` removed), no off-site camping
  there. An unpaid Quetico ticket in a save from a build that had them is torn up on load.
- The map washes Quetico as it washes the rest past the edge (`EDGE.qWash`, row runs of the cells that became out); its
  dashed outline stays as geography. `inQuetico(x, z)` answers "inside the park's outline" for the rigs.
- No campsite, party camp or board notice in it: campsites there are `past` like any other, and no notice is written
  whose exact place (a spot, a dam, a station, a tight ring) is past the edge, or whose area (a lake's hint, a loose
  ring) is wholly past it (`tasks.pastNotice`, in the board's own picking, `makeKind` and a visitor's lost-item and
  photo asks; an offered one written before comes down with the day's change). A lake the edge cuts stays fair game:
  Snowbank's south shore is private land, its lakers are still asked for.

## D1 next year's permit: charged, the season never turned

Picked: **offer only days the turn will accept** (not "turn on the permit lake's terms"). The turn wakes you at the
store whose desk sold the permit, so a day its own lake is still iced is no day to wake to: next year's months start
from the later of the two ice-outs and end at the earlier ice-in, a day either lake is iced reads "ice" and can't be
picked, and `permits.refusal` refuses it ('wake': "The lake here is still iced in then: you would wake to the ice.")
before any money moves. Belt and braces: a skip or a turn that does not happen after the sale refunds it
(`permits.refund`: off the held list, the price back). The held line says the year of a permit in another year.

## D4 a done notice of a cut kind

An old save's notice of a kind cut from the boards that was already done (taken, waiting to be handed in) stays on the
list as done (`t.cut`) and is paid as any done notice is, when you come in; the journal and the tracker say "No longer
posted, still paid when you come in", and the line when it is paid adds "No longer posted, paid all the same."

## D6 no "turn back"

The stop at the world's own end (no terrain past the baked box) stays, worded "Past here is off your maps". EP 75's
and EP 84's lots are 60 m from the south end on this branch: not pinned (a walk north goes), the stop 40 m in.
