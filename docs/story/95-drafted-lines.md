# Drafted lines (build drafts, for the writers to replace)

Every line in this file is a **build draft**: the game needed words where the writers' docs (10–70) have none, so a
build stream wrote a stand-in in the voice of `02a-voice-journal.md` and `02b-voice-people.md`. None of it is canon.
Writers: replace any line here by writing the real one into your own doc with the same `<!-- id: -->` anchor (or a new
anchor, and tell the builders), then delete the draft. Nothing in the writers' files was changed to make room for these.

Each entry: the anchor, the line, and where the game uses it. `story-extract.mjs` reads this file into
`src/story-data/text/drafted.json`, like the others.

---

## Stream x (campaign run, chapter 2: the mining years, Rose S7, Coffee Lake S9)

### Len and Mary at Farm's café

<!-- id: d95.len.again -->
```
There they are. Sit, sit. Kim, another coffee over here.
```
Used: Len's opener on every talk after the first (`mining.js` LEN `again`); was a bare "…".

<!-- id: d95.mary.again -->
```
You're in my light again. Sit. The bars are still lemon.
```
Used: Mary's opener on every talk after the first (`mining.js` MARY `again`); was a bare "…".

<!-- id: d95.len.thanks -->
```
That's the crib. That's it exactly. And a casing, standing up like that. They'll go right up front at the open house. Thank you.
```
Used: Len, as the two pictures for his favour are handed in (`mining-cast.js` talk, 30 §4.2.1); the $40 is on the tally.

<!-- id: d95.len.east.ask -->
```
Anything east of Bald Eagle? Gull, Pietro?
```
Used: the player's question for Len's "Gull" / "Pietro" / "east of Bald Eagle" topic (30 §4.2: the doc gives his
answer, 30:4.2/len-saari-first-meeting.5, but no words for the asking). Offered once the player has a reason to name
the east: the crew map, the far end, or Pietro's dig.

<!-- id: d95.mary.saynothing -->
```
(Say nothing.)
```
Used: the third choice at Mary's back table (30 §4.4 "[Say nothing.]"); she waits, nods, and goes on to the radio.

### The Walt page and the notebook

<!-- id: d95.lead.pads page -->
```
Tauno: up the grade from the crews' landing to the west pads. The big one's in a hollow, the Kettle. Go after a rain and see if the creek still runs orange.
```
Used: the Walt page's Leads line for Tauno's "The pads" (`walt-lines.js` w.lead.pads; was his spoken line whole).

<!-- id: d95.und.backdoor -->
```
Pietro. The hill E-7 was filed on.
```
Used: the margin note on NB70 once "the back door" is understood or inked (`notebook.js` UND, 10 §11.2's form).

### Rose (S7, Mummo's)

<!-- id: d95.S7.rose.again -->
```
There you are. Sit down, I saved you the chair. What's the lake doing?
```
Used: Rose's opener on every Tuesday after the first (`feed-episodes.js` ROSE_SCENE); she used to say S7.conv.1 again.

<!-- id: d95.S7.pay -->
```
Lilacs for Rose's calendar
```
Used: the tally's line for Rose's $25 (or the short note when it is paid with no trip on); replaces "$25 from Rose.".

<!-- id: d95.S7.page.rose -->
```
Rose Gornik. Tuesdays at Moose Lake, the table by the window. She wants June lilacs for the church calendar.
```
<!-- id: d95.S7.page.whose -->
```
Her family's resort was on the big part of Basswood. Bought out in '64, burned on the ice the next February.
```
<!-- id: d95.S7.page.where -->
```
Lilacs past Prairie, on the US side of the bay. An old Finn fish camp. The boys there called the old lady Mummo.
```
<!-- id: d95.S7.page.boys -->
```
The boys were Haapalas. The young one drowned. The other one guided. Walt.
```
<!-- id: d95.S7.page.step -->
```
Three flat stones up from the water to nothing. A foundation in the grass. Somebody's lilacs.
```
Used: the S7 page in Stories, each as it comes true (meeting Rose, "Whose places?", "Where are the lilacs?", "The two
boys?", the stone step seen). 60 §0.3: the page lines were never written.

### Coffee Lake (S9)

<!-- id: d95.S9.page.hooked -->
```
Off the Alice beach rock, a jig dragged on the sand caught something heavy. Not a fish.
```
<!-- id: d95.S9.page.nb06 -->
```
Coffee Lake is Alice. Walt lost something off the beach rock in '88, in eight feet of water.
```
<!-- id: d95.S9.end -->
```
It came up by the bail. A blue enamel pot, a chip on the lip, full of sand.
```
Used: the S9 page in Stories (the hook-up, NB06 read, and its last line once the pot is up).

### The Kettle notice (30 §4.3)

<!-- id: d95.kettle.page.done -->
```
Worked the Kettle creek with Tasha. Three bottles and the disk. The water's orange-brown under a metre.
```
Used: the last line under the Kettle notice's words on its page in Stories (the notice taken; the day done).

### The day's beat in Farm's reach (30 §9)

<!-- id: d95.beat.whitestone -->
```
There's a white stone on a flat rock at a site on Bald Eagle. Somebody put it there. We left it.
```
Used: the director's fallback lore in Farm's reach, in place of 30:9.beat.2 ("a white rock on a stump"), which
disagrees with 30 §9's own place note for C902 ("a white stone on a flat rock at the landing"). The stone is now built
at C902's landing (`story-places.json` bald.c902), unstarred as walt-sites.js keeps it. Writers: settle which it is.
