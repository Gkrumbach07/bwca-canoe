# Drafted lines (build drafts for the writers to replace)

Lines the build needed where no doc has one. Each is a placeholder in the voice of 02a/02b, marked by stream, with its
anchor and where it is used. Replace the words here (or give the line a home in its own doc) and the build follows.

## Stream f (Round 3, the far end)

- `f.dot.pit.empty`: "An empty pit." The dot on the cellar's opened hole after the ending or a walk-out from the dawn
  lot (`cellar.hole`, `dotWhen: f:world.pit.empty`; world.pit.empty is stream n's rule n.pit). Build draft.

## Stream r (the run, Round 3)

| Anchor | Line (draft) | Where it is used |
|---|---|---|
| run.click | "Far off, down toward the bay: a radio, two clicks." | run.js `click()`: the run's first sign (50 §5.3 says it is a sound only; until the audio has a radio click, the HUD note stands in for it) |
| run.tied.kicker | "Tied off" / "in the canoe · cold, cramped" | the Rest dial's kicker and sub tied off (minigames/tieoff.js, run.js `restDial`) |
| run.scanner.prefix | "Scanner · {who}: {line}" | how a scanner line shows when no speaker is pinned (run.js `scanLine`); the lines themselves are 50 §6.8's |

Verbatim lines used from table rows the extractor cannot anchor (no prose changed; the join or the writers may move
them to an anchor): "Not tonight. Not where they'd look." (50 §6.2, No campsites row) in run.js `NOTE_DOWN`.

## Stream n (Round 3: the endings) — build drafts, for the writers to replace

| Anchor | Line | Where it is used |
|---|---|---|
| n.phone.dan | It rings twice. "Dan Marolt." A pause. "Stay there. Twenty minutes." | The dawn lot's permit-box phone, dialled with Dan's card (50 §9.2 says only that he arrives in twenty minutes) — endings.js `phoneLine()` |
| n.tasha.done | Samples bottled and the Secchi read. That's the creek for this month. | Tasha's sampling notice done at the Kettle creek (50 §12.2 has the notice, not the done line) — endings.js `registerSampling()` |
| n.paper.read | STATIONS 7 TO 12. The clipping goes in your book. / The papers existed. The clipping goes in your book. | Reading the Ledger on a counter (the headline is the paper's; the second sentence is the build's) — endings.js `readPaper()` |

Also quoted in code word for word (the extract skips a speaker line with a stage direction before its colon; a writer's
`<!-- id -->` would let them be wired by id): 50 §9.2 Dan's "Hey. You made it. That's a long night." / "Okay. I'm
supposed to say this exactly. The number's gone up." / "I'm asking you."; 50 §9.1 Maggie's readings ("C.B.",
"'Spoken to.'", "L.P. H.V. Two years of it.", "These are originals. …"), Dan's "...I will.", Tauno's "Well. I said if." /
"Good. That's good.", Tom's "You told me once to leave the sled. I left it."; 50 §10's tally words (backticks).

## Stream w (the winter turn, Round 3)

| Anchor | Line | Where it is used |
|---|---|---|
| `w:frozen.card.kicker` | Frozen in | The kicker of the card when the run is caught by ice-in and the season turns by itself (season-turn.js `auto`). |
| `w:frozen.card.text` | Frozen in. Not till the ice goes. | The card's line. **Not drafted:** the pit's own thought in `50` §5 ("15 November to ice-out"), reused here so the run's freeze-up and the pit's say the same thing. |
| `w:frozen.card.sub` | Up at seven on {date}, {year}, the ice out, where you last stopped. | Under it: the day the player wakes (the ice-out at the run's put-in) and that the run resumes at the last checkpoint (`50` §6.14). |
