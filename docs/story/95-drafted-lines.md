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

## Stream c (co-op mirror, Round 3)

| Anchor | Line | Where it's used |
|---|---|---|
| `c.walt.n42` | Not with company on the lake. | The Walt page, "The far end", written once the first time a player with an L6 key points at the pit with a friend in the room (campaign-design §7.2). It quotes NB72 (N42) word for word; `src/story-data/walt-lines.js` holds it as the row's `text`. |
| `c.coop.reading` | {host} is reading by headlamp. | The one card a guest sees on a shared night while the host's night-one cutscene plays (campaign-design §6.1); `src/coop-story.js` WORDS.reading. |
| `c.coop.shut` | Out on the water tonight. | A guest's join or Rejoin refused while the host's run is on (campaign-design §8.3 "No company"); `src/coop.js` SHUT_WORDS and `src/coop-story.js` WORDS.shut. |
| `c.coop.nod` | … | A story person (Tauno, the Farm people …) stood on a guest's screen, E on them: a look up, no words (as cast.js's Josie with no word). Josie says her own 70 §4.4 lines. |

## Stream m (mechanics, campaign Round 4)

| Anchor | Line | Where it is used |
|---|---|---|
| `m:squad.ride` | Up Moose, Newfound and Sucker in the dark, about fifty minutes: the motor and the wake, your canoe and the squad's old aluminium spare on a line behind. At the bypass the motor stops. Two carries: your canoe, then the spare. | The squad night's ride card (src/drift-night.js squadNight, the card's sub), 31 GY-11 "The ride", folded with the bypass's two carries |
| `m:squad.back` | Back down the chain in the dark: the motor and nothing else. | The ride back's card (drift-night.js rideBack), after 31 GY-11 "The ride back is the motor and nothing else." |
| `m:rescue.ride` | The canoe on a line behind, {time} on the water to {place}. {fee} | The rescue-boat ride's card (src/rescue.js ride, the sub), when the caller gives no words of its own |
| `m:rescue.kicker` | The rescue squad → {place} / The outfitter's boat → {place} | The same card's kicker |

## Stream 7a (campaign run, Round 7: S2 the Squatch night, S3 Lights over Four Towns, S4 the wolves)

### Big Moose: the Squatch night (S2)

<!-- id: d95.7a.S2.page.duane -->
```
Duane, the Tattler. Weekends in the lot at Moose River North: a green pickup, a lawn chair, a plaster cast.
```
Used: S2's page, once Duane is met.

<!-- id: d95.7a.S2.page.site -->
```
The west site on Big Moose, under the ridge. Two stars, a bad landing. Nobody wants it.
```
Used: S2's page, once Duane says where to camp.

<!-- id: d95.7a.S2.page.walt -->
```
Walt slept out there in his canoe, tied to a snag off the point.
```
Used: S2's page, N14 (NB36) read at the site.

<!-- id: d95.7a.S2.page.night -->
```
Two in the morning on Big Moose. Steps on the ridge, a knock on wood, twice. Then nothing for a minute.
```
Used: S2's page, after the night.

<!-- id: d95.7a.S2.page.tracks -->
```
In the morning, up on the ridge: a moose and a calf, and the serviceberry stripped.
```
Used: S2's page, the ridge seen by day after the night.

<!-- id: d95.7a.S2.page.frame -->
```
One picture from 2:04. Two birches, and something between them. Nothing there by day.
```
Used: S2's page, the unexplained frame taken.

<!-- id: d95.7a.S2.end.solved -->
```
A moose in the deadfall and a bear in the berries. Duane ran it anyway.
```
Used: S2's last line: a moose, bear or tracks print shown to Duane.

<!-- id: d95.7a.S2.end.sold -->
```
Sold to the Tattler.
```
Used: S2's last line, the frame sold (the doc's words for the print's mark, 60 S2).

<!-- id: d95.7a.S2.end.kept -->
```
Kept the picture. Haven't shown anybody.
```
Used: S2's last line, the frame kept.

<!-- id: d95.7a.S2.pay.20 -->
```
$20 from Duane.
```
Used: the tally, a clear print of the moose or the bear.

<!-- id: d95.7a.S2.pay.10 -->
```
$10 from Duane.
```
Used: the tally, a print of the tracks only.

<!-- id: d95.7a.S2.pay.200 -->
```
$200 from the Tattler.
```
Used: the tally, the frame sold.

<!-- id: d95.7a.S2.wake -->
```
Two in the morning. You come awake. Something heavy on the ridge behind the tent.
```
Used: the night card at the west site (the sleep breaks at 02:00).

<!-- id: d95.7a.S2.charge -->
```
The cow lays her ears back, stamps, and comes three strides at you. Then she's gone, crashing.
```
Used: the bluff charge, a note.

<!-- id: d95.7a.S2.eyes -->
```
Two eyes in the lamp, green-gold, two metres up. Then a long face. Then they go.
```
Used: the lamp turned on the ridge in the night, a note.

<!-- id: d95.7a.S2.cast -->
```
Bear. Hind foot over the front.
```
Used: the dot on Duane's cast once tracks are read (60 S2's own words).

### Fourtown: the lights (S3)

<!-- id: d95.7a.S3.page.elaine -->
```
Elaine Sundquist keeps the sky book at Slim. Everything's something, she says.
```
Used: S3's page, Elaine met.

<!-- id: d95.7a.S3.page.aurora -->
```
Northern lights over Fourtown, low in the north. In the book.
```
Used: S3's page, the aurora logged.

<!-- id: d95.7a.S3.page.train -->
```
A string of lights climbing out of the west, one after another. Satellites. In the book.
```
Used: S3's page, the train logged.

<!-- id: d95.7a.S3.page.lantern -->
```
A light floating at the north end in the fog. Somebody's lantern. In the book.
```
Used: S3's page, the lantern logged.

<!-- id: d95.7a.S3.page.foxfire -->
```
Foxfire off the north shore, a green chunk of birch. Elaine turned the shop lights off for it.
```
Used: S3's page, the foxfire logged.

<!-- id: d95.7a.S3.page.square -->
```
Walt wrote in her book in 2012. 'Kept the red on.' She wrote 'boat?' beside it.
```
Used: S3's page, Walt's line in the binder found.

<!-- id: d95.7a.S3.page.tin -->
```
Under the loose stone at the long rock: a tobacco tin. Red glass in oilcloth, three matches.
```
Used: S3's page, the tin lifted.

<!-- id: d95.7a.S3.page.one -->
```
A light over the north bay. Low, steady. It drifted against the wind and went out when I showed white.
```
Used: S3's page, the one light seen.

<!-- id: d95.7a.S3.end -->
```
Elaine wrote a question mark in red. Her first.
```
Used: S3's last line.

<!-- id: d95.7a.S3.foxfire.out -->
```
The foxfire has gone dark.
```
Used: a note, the morning after a foxfire chunk is carried.

### Agnes: the wolves (S4)

<!-- id: d95.7a.S4.page.kari -->
```
Kari Vang counts wolves on Agnes. Three places, three lines, they cross where the wolves are.
```
Used: S4's page, Kari met.

<!-- id: d95.7a.S4.page.tracks -->
```
Kari at the landing: front foot, toes tight, like it's going somewhere. A dog's go everywhere.
```
Used: S4's page, the tracks taught.

<!-- id: d95.7a.S4.page.st1 -->
```
Nina Moose, the north end, three in the morning. They answered.
```
Used: S4's page, station 1 marked.

<!-- id: d95.7a.S4.page.st2 -->
```
The Agnes inlet. They answered.
```
Used: S4's page, station 2 marked.

<!-- id: d95.7a.S4.page.st3 -->
```
Walt's site on Agnes, the sand landing. They answered.
```
Used: S4's page, station 3 marked.

<!-- id: d95.7a.S4.page.ring -->
```
The three lines cross west of Agnes, in the primitive area.
```
Used: S4's page, the ring pencilled.

<!-- id: d95.7a.S4.page.kill -->
```
Ravens over a kill. A deer, mostly hair and bones.
```
Used: S4's page, a print of the kill.

<!-- id: d95.7a.S4.page.count -->
```
The meadow from the ridge at dusk. Pups at the edge of the alders.
```
Used: S4's page, the pup print.

<!-- id: d95.7a.S4.page.told -->
```
I told someone where the meadow is.
```
Used: S4's page, the ring given away.

<!-- id: d95.7a.S4.pay.station -->
```
$15 from Kari, a night at a station.
```
Used: the tally, a station night.

<!-- id: d95.7a.S4.pay.count -->
```
$40 from Kari, for the count.
```
Used: the tally, the pups counted.

<!-- id: d95.7a.S4.pay.lyle -->
```
$60 from Lyle.
```
Used: the tally, the ring sold to Lyle.

<!-- id: d95.7a.S4.lyle2 -->
```
Me again. Sixty-five for a ring on my map. Last time I'll ask.
```
Used: Lyle's second ask, a week on (60 S4 gives only the stage direction).

<!-- id: d95.7a.S4.give -->
```
Show him the ring on the map.
```
Used: the player's choice to give Lyle the ring.

<!-- id: d95.7a.S4.howl.hint -->
```
Wait for an answer. Face it, then {E} Mark.
```
Used: teaching moment after a first howl (hint, ≤ 80).

<!-- id: d95.7a.tracks -->
```
Tracks
```
Used: the dot on prints before Kari teaches them.

<!-- id: d95.7a.S4.answered -->
```
Far off, the wolves answer.
```
Used: a note after an answered howl, once.

<!-- id: d95.7a.S4.silent -->
```
Nothing answers. Only the water.
```
Used: a note after a howl nobody answers.
