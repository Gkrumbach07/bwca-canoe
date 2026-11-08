# Voice guide: the people

How the people of the north country talk in this game: the outfitter staff, old guides, ex-miners, retired locals,
weekend paddlers, families, Walt's boys and family, the company man, the journalist, and the Canadians across the
line. It is a writers' tool. Nothing in it is on-screen text until a story file uses it.

Read with: `00-owner-decisions.md` (canon), `02a-voice-journal.md` (Walt's hand), `docs/plans/bwca-history-research.md`
(what people remember). The existing lines in `src/talk-keepers.js`, `talk-visitors.js` and `talk-rumours.js` are
already in this voice; match them.

---

## 1. The ten rules

1. **Short and plain.** Most lines are one or two sentences. People here say less than they mean. The game's
   existing keepers prove it: a father, a pike he "lied about for forty years", and the line ends.
2. **Understatement carries the feeling.** A blowdown that flattened a lake is "a wild afternoon". A man who lost his
   business is "not real happy about it". The bigger the thing, the smaller the words.
3. **History is dropped, never explained.** "Back before the bill." "When they bought out the resorts." "The spring
   the Pioneer shut." The speaker assumes you know. If the player asks, the next line gives one more fact, not a
   lecture (see §4).
4. **No phonetic accents.** Never write "yah, sure, you betcha", "dontcha know", "ja" or dropped g's for colour. No
   *Fargo*. Regional speech lives in **word choice and rhythm**, not spelling. One "oh, for sure" per conversation
   at most, and only from someone who'd say it.
5. **No exposition dumps.** Nobody tells the player what the player already knows, and nobody tells another character
   what both of them know. If a line starts "As you know", cut it.
6. **People talk about the practical thing.** Wind, water level, which site's open, how the carry is, what the walleye
   are doing. Feeling comes out sideways through the practical thing.
7. **Items and mechanics are never explained by people** (the owner's rule). A keeper may say "The leeches go in the
   shade", once, at the moment it matters. Nobody says "Press E" or "this restores energy".
8. **Everybody has a side and a reason.** On mining, wilderness, motors, outsiders: decent people stand everywhere.
   Nobody is a mouthpiece. The villains are particular men, and even they talk like neighbours.
9. **Humour is dry and aimed at oneself or the weather.** Never at the player's expense more than once, never mean.
   "Winters I teach fourth grade. Summers I sell leeches. It's similar work." is the standard.
10. **Real public history only as texture.** People may mention the airban, the hearings, the blowdown, the fires,
    the Pioneer closing, Dorothy's root beer, by allusion. They never name real private people, never quote real
    people, and never narrate a real tragedy's victims. All persons, companies and crimes in the story are fictional.

---

## 2. The country's speech

### 2.1 Roots

The towns along the edge were built by Finnish, Slovene, Italian, Croatian, Cornish, Swedish and Norwegian miners and
loggers. Three or four generations on, nobody has an accent you'd write down, but the families keep:

- **Food words as identity.** Potica (Slovene nut roll, at Christmas and funerals), pasties (Cornish, the Range lunch),
  porketta (Italian Range pork), mojakka (Finnish fish stew), sauna (and an opinion on how to say it), pannukakku,
  rice hotdish at a church basement. "Bars" means pan desserts. Pop, not soda.
- **Grandparents' words dropped in whole.** A Finn says *sisu* about someone stubborn and brave and won't define it.
  Someone's *nonna* or *baka* (Slovene grandmother) is quoted. Use one word, once, unexplained.
- **The Range as a people.** "Rangers" (Iron Rangers) is what they call themselves. "Up on the Range", "a Range
  kid". The mines are "the mine" (the one that fed your family), the union is "the union" or "the Steelworkers".
- **Lutheran and Catholic manners.** Don't make a fuss. Don't brag. Bring food when someone dies. Fix it yourself.
  Complaining is done about the weather, the Cities, or the government, rarely about a neighbour to their face.

### 2.2 Minnesota turns of phrase (use lightly)

These are real, common and safe. Spread them across characters; never stack them.

| Phrase | Meaning / how it's used |
|---|---|
| Oh, for sure. | Yes; also "I hear you, but". |
| That's different. | Polite disapproval. A good way to say "that's a bad idea". |
| Could be worse. / Not too bad. | Anything from fine to grim. |
| You bet. | You're welcome; certainly. |
| Ope. | Sorry, moving past you. (Rare; a store-aisle word.) |
| Come with? / You want to go with? | Come along. |
| Up north / up the lake / up the Trail | Going toward the wilderness; the Gunflint Trail is "the Trail". |
| Down in the Cities / the Cities | Minneapolis–St. Paul. Never "the Twin Cities" from a local. |
| A guy could… | A suggestion, disguised as a hypothesis. "A guy could try the far side." |
| …then? | Closing a question softly. "You're going in tomorrow, then?" |
| Real quick | Any length of time. |
| Kind of / a little / a bit | Softeners on everything. "It's a little breezy" in whitecaps. |
| Jeez. / Holy buckets. | Mild surprise. Holy buckets is rare and older. |
| I s'pose. | Reluctant yes. Spell it "I suppose" in text (rule 4); the rhythm does the work. |
| Borrow me / Lend me | Range idiom; "Can you borrow me a lighter?" Use once, from an old Ranger, as flavour. |
| Hotdish, bars, lunch | "Lunch" can be a late-night snack after cards. |
| Uff da | Scandinavian, more southern MN. A Swede on the Gunflint might say it. Iron Rangers mostly don't. |

### 2.3 How locals say places

The way a person names a place tells you who they are. Lifers shorten, weekenders spell it out.

| Lifer says | Weekender / map says |
|---|---|
| the Boundary Waters, the BW, "in the woods", "up the lake", "inside" | the BWCA, the B-dub, BWCAW, "the Boundary Waters Canoe Area" |
| the Quetico (with "the") | Quetico |
| Sag | Saganaga |
| the Kek | Kekekabic |
| One, Two, Three ("out on Two") | Lake One, Lake Two |
| the Kawishiwi (KAH-wish-ih-wee), the South Kawishiwi | |
| the Trail | the Gunflint Trail |
| the Echo | the Echo Trail |
| the Fernberg | Fernberg Road, County 18 |
| the Shore | the North Shore |
| the Range | the Iron Range |
| the Lakehead (Canadian) | Thunder Bay |
| the Four Mile | Four Mile Portage |
| Prairie | Prairie Portage |
| the Falls (meaning International Falls, or whichever falls is nearest) | |
| "town" (meaning Ely, Grand Marais, Atikokan, whichever is theirs) | |

Pronunciations a character may correct once, gently, never in phonetic spelling: Ely (EE-lee), Tofte (TOFF-tee),
Grand Marais (mar-AY), Atikokan (at-ih-KOH-kan), Kawishiwi, Lac La Croix (la CROY, not "la krwa"). A correction is a
small kindness, not a joke: "Ely. Like the name. You'll get it."

Entry points: weekenders say "EP 25" or "the 25". Locals say "Moose Lake" or "out of Moose". Portages are in
**rods** to everyone who's carried one ("a 105-rod into Alpine"); a weekender may still say "the half-mile one".

### 2.4 The edge towns are not one place

- **Ely and the Echo Trail.** Mining town that became a canoe town and never fully agreed to. The deepest grudges, the
  most yard signs, the most families split over the mine. Outfitters who are miners' grandchildren. Proud, wry,
  defensive with outsiders, warm once you've been back twice.
- **The Gunflint Trail.** Lodge families, fire people. Fewer mines, more fires: the Ham Lake fire and the '99
  blowdown are their calendar. Swedes and Norwegians, resort kids, an independence that comes from being an hour
  up a dead-end road. "The road ends at my door."
- **Tofte / Sawbill.** North Shore and forest. Teachers, Forest Service families, cabin people, a quieter
  "we just like it here" voice. Less politics on the surface.
- **Crane Lake.** The end of the road on the border; the people whose businesses moved there when the resorts were
  bought out. Motorboats, fishing, Voyageurs Park next door. Least sentimental about canoes.
- **Atikokan and the Quetico side.** A mining town too: the iron mines there shut around 1980, and people will
  say so, flatly. Rangers, outfitters, fly-in camp people, Lac La Croix guides (see §6.11). A different country with
  a near-identical landscape and a different temperament (see §3.5).

---

## 3. Who talks how

### 3.1 Lifers and weekenders

| | Lifer | Weekender |
|---|---|---|
| Distance | Days, carries, "a long day" | Miles, kilometres, "we did 14 today" |
| Gear | Old, named by use ("the green pack"), brand only as a grudge | Brand and weight ("my 38-ounce tarp") |
| Danger | Offhand: "It gets a little lumpy past the point." | Wide-eyed: "Is it safe to cross?" |
| Bears | "Hang your food." | Long stories about a noise at 2 a.m. |
| Fish | Where and when, never how big | How big, and a photo |
| Weather | Always; the day's first sentence | When it ruins plans |
| Time | Seasons and years ("the year it burned") | Dates and permits ("our August permit") |
| The place | "In the woods", "up there", "inside" | "The BWCA", "bucket list", "unplugged" |
| Secrets | Keep their spots; won't mark a map | Share everything, ask for everything |

The forum culture is useful: old hands argue about whether a rusted sled at a lunch spot is history or junk, tell
each other not to post exact spots, compare permit systems from the '70s, and remember storms by where they were
camped. Weekenders count portages, plan by entry-point numbers and mail lists of gear. Both are affectionate about
the place; neither is wrong.

### 3.2 How old-timers drop history

They name an event as a date. They never say what it was for, who won, or why it mattered. The listener catches up or
doesn't.

Markers a writer can use (all real public history, all allusion):

- "before the bill" / "before '78" / "when they took the motors off" (1978 Act)
- "when they bought out the resorts" / "when the cabins went out on the ice" (1950s–60s buyouts)
- "after the airban" / "when the planes stopped" (1949–52)
- "the spring the Pioneer shut" / "after the mine closed" (Ely, 1967); in Atikokan, "when Steep Rock went"
- "the hearings" / "that summer with the trucks in town" (1977)
- "the blowdown" / "the Fourth of July storm" (1999)
- "Ham Lake" / "the '07 fire" / "Pagami" / "the year it burned to Insula"
- "when Dorothy was still on Knife" (the root-beer island; public figure, allusion only)
- "when the tow boats ran to Prairie" / "when the Four Mile had trucks on it"
- "back when you just picked up a permit" / "before the lottery" / "when we marked our own sites on the maps"
- "the ban on cans" (old youth-camp guides remember having to rewrite their menus)
- "the Remote Area permit" (for Canadian crossings; recently ended; a current gripe)

The fictional story adds its own markers, used the same way (writers choose the specifics in the bible):

- "when the drill crews were out" / "the core camp" / "the summer the company came the first time"
- "after Walt's canoe" / "the year they found the canoe"
- "the brother" (people who knew avoid his name; see §5)

**Pattern:**

> "My dad had a cabin on the far end of Basswood. Before they bought everybody out."
> *(Player asks.)*
> "Government paid him. Not much. We burned it ourselves, on the ice, in February. Better than watching someone
> else do it."

One fact per beat. The feeling comes from what he didn't say.

### 3.3 How the guarded, paranoid and guilty talk

The mystery runs on people who won't say things. Each kind of withholding should sound different, so the player can
learn to read them. Writers: decide *why* each person withholds before writing a word.

**The frightened (Walt's family, the old crewman at first).**
- Answer a narrower question than the one asked. "Did Walt drown?" → "They found his canoe."
- Hospitality as a wall: offer coffee, bars, a chair, anything instead of the answer.
- Sudden practical task: "I have to get the wash in."
- Speak of the dead in the present tense by accident, and correct it.
- "We've said what we have to say." / "That was all a long time ago."
- Never lie outright; they omit. A player who asks the exact right question gets a pause, then a true small thing.

**The paranoid (the old crewman, the man who stops you on the porch).**
- Talks about the weather while watching the parking lot.
- Answers questions with questions: "Who sent you in here?" "Whose pack is that?"
- Talks in "they" without a noun. "They were out on that lake that whole summer."
- Gives a place, never a reason. "Look at the old Forest Service map. The one with the drill roads."
- Ends early: "That's enough for today."
- Tests the player with a small falsehood and watches whether they correct it.

**The guilty (the informant among the boys).**
- Warmer than the others, quicker to help, quicker to put a ring on your map: guilt overpays.
- Over-explains small things nobody asked about ("I wasn't even on that trip, I was in Duluth for my sister's
  thing, it was a Tuesday") and goes vague on the big ones.
- Uses Walt's memory as a shield: "He was my best friend. You think I don't miss him?"
- Steers you toward the wrong group: "You want to talk to the mine guys. They'd know."
- Laughs at the right moments a half-beat early.
- Never cracks on screen until the story says so. Writers: plant two or three tells across the campaign that only
  read as tells on a second play.

**The company's people (decent or not).**
- Pleasant, local, never threatening in words. They know your name before you say it.
- Frame everything as care: "Some of those old roads aren't safe." "A lot of folks get turned around up there."
- Talk about jobs and kids and the town. The decent ones mean it; the corrupt ones also mean it, which is the
  unnerving part.
- Never say "the cache", never say "Walt" first.

**Plain liars** are rare and should sound like everyone else. Nobody "shifts uneasily". The tell is in what they
say, not in stage directions.

### 3.4 How people talk about mining and the wilderness

This is the region's live wound. Rules for writers:

- **Nobody argues in policy terms.** No acreage, no statutes, no lease numbers. People say "the mine", "the
  leases", "the Cities people", "the environmentalists", "the company", "Washington", "the governor".
- **Everyone has a reason with a face.** For: "My son had to move to North Dakota to find work." "We dug ore for a
  hundred years and the water's fine." "They'll mine it somewhere; I'd rather it be here, with our rules." Against:
  "My dad worked the mine. He also fished that river." "It's not the mining, it's where." "You can't put this back."
- **People on the same side disagree.** A retired miner against the copper mine; an outfitter's brother driving
  truck for the company; a Tower man who'd take the job if it was safe.
- **Yard signs are shorthand.** "Saw your sign" is an opener. Characters may mention whose sign is up without
  saying what it says. Never quote real campaign slogans.
- **Old bitterness:** Ely people may say the town was told what to do by outsiders for fifty years. Writers can let
  that line stand unanswered. The other side's grief (a place that came within a vote of being logged, dammed,
  flown into) also stands unanswered.
- **The fictional company** is "the company" in almost every mouth, the way real towns say it. Its name is said only
  by people who work for it or write about it.

### 3.5 The Canadian voice

Close kin, different temperature. Writers should make Canadians recognisably themselves without "eh" every line.

- **Spelling and words:** colour, toque, washroom, "the park" (Quetico), "camp" for a cabin, "the States", "down
  south" (meaning the U.S. or southern Ontario), "Ministry" for the park authority, "a two-four", "Timmies", "the
  Lakehead", "Fort" (Fort Frances), loonie and toonie, kilometres (but older people still use miles and pounds).
- **Rhythm:** a touch more formal and more ironic. Understatement is the same; the irony aims at Americans.
  "Americans like a rule. We like a rule we don't have to enforce."
- **"Eh"** at most once per conversation, as a real question tag, never as decoration.
- **Their history markers:** "when the mines closed" (Atikokan, around 1980), "when they brought in the barbless
  rule", "since they took the live bait away", "when the crossing station was still on Sag", "the Remote Area
  permit". The park's taking of Lac La Croix land is a grievance a Lac La Croix person may mention as fact, plainly,
  never as a lesson.
- **Attitude to the Boundary Waters:** fond, faintly superior about crowds. "You'll see more people on Basswood in an
  afternoon than I see in a week."
- **Attitude to Americans:** warm, amused, wary of loud ones. They'll help, and they'll tell you the rule twice.

---

## 4. How a conversation moves

The game's conversations are Witcher-style: an opener, a few topics, follow-ups. Write each beat to this shape.

- **Opener:** one line, grounded in the moment (weather, what you're carrying, how long since they saw you).
  "Back already? Must've been windy."
- **Topic answer:** two or three sentences at most. Ends on something concrete: a lake, a site, a rumour, a ring on
  the map. "Swamp Lake. The far site. Tell me if the beaver's still in."
- **Follow-up:** adds one fact or one feeling, not both.
- **Close:** short, often practical. "Go on, you're losing light." "Hang your food."
- **Leads:** when a person gives a lead, they name a person or a place, and the keeper pencils a ring. They don't
  say "go there next". "Rauha lives out past the Fernberg. She doesn't like visitors. Bring something."
- **Silence is a line.** "…" or a short action ("He looks at the door.") is allowed, sparingly, once a conversation.
  Stage directions stay physical and brief; no adverbs about feelings.

---

## 5. The story's own language (canon-safe)

How people inside the mystery refer to its pieces. Keep consistent across all writers.

- **Walt:** "Walt" to everyone who knew him; "the old guy who drowned" to people who didn't; "your fella" to a
  suspicious keeper. Family may use a family name the bible chooses. Nobody says he's alive except, eventually,
  the family, and then only in a way that can be denied.
- **The brother:** people who knew avoid his name. "His brother." "What happened to his brother." The old crewman
  says the name once, and it should land. (Note for the bible: an existing keeper in `talk-keepers.js` has a paddle-
  carving brother named Eino; pick the brother's name with that in mind.)
- **The drowning:** "They found his canoe." "Swamped, no paddle." "No foul play." Locals repeat the official words
  with a slight distance, the way people quote something they never believed.
- **The company:** "the company". Old crewmen: "the outfit", "the office", "the men from the office". Its earlier
  name may be said by old men; its new name by young people.
- **The cache:** nobody says "cache" except Walt's notebook and, late, the journalist. Others: "what he had",
  "the papers", "whatever it was", "that business".
- **The boys:** they call themselves "the guys", "we", "the crew"; others call them "Walt's bunch" or "the fellas he
  tripped with".
- **The informant's betrayal:** never named as such by anyone until the story turns. Before that, others may say
  "Somebody was talking." "There's always somebody talking."

---

## 6. Sample palettes

Every line below is original. Use them as tone references, adapt freely, and don't reuse a line verbatim in more
than one place. `{lake}`, `{site}`, `{rods}` follow the existing template tokens.

### 6.1 Outfitter staff: the seasonal kid (19–24, from the Cities or a college, here for the summer)

1. "Hi! Are you checked in? No? Perfect, me neither, I just got here."
2. "We're out of Kevlar till Thursday. I can do you a Grumman. It's loud but it's basically indestructible."
3. "Permit's on the counter. Watch the video, it's like nine minutes. The ranger lady's great."
4. "Honestly, the far site on {lake} is the one. I'm not supposed to have favourites."
5. "I did my first trip out of here in June. I cried on the 140. Not proud."
6. "Bugs are bad. Like, bad bad. The head nets are by the register."
7. "You want leeches or crawlers? Leeches. Everyone wants leeches."
8. "I'm from Edina. Everyone here makes fun of me for it, which, fair."
9. "Sorry, the boss does the maps. He gets weird about people's spots."
10. "Rain's coming in tonight. Not, like, a lot. Maybe a lot."
11. "There's a guy who sits on the porch most mornings. He's harmless. I think."
12. "Back room's mostly old stuff. Nobody rents it. It works, it's just heavy."
13. "If you're not going to need it, you can just take it. Seriously. It's been there since before me."
14. "Did you see a moose? Everyone asks me that. I haven't seen one. Three summers."
15. "Shuttle to Moose leaves at seven. Like seven-seven. He doesn't wait."
16. "Fill out the return sheet? Just where you went and if anything broke. You don't have to be specific."

### 6.2 Outfitter staff: the lifer behind the counter (50s–70s, grew up in town)

1. "You're going in tomorrow, then? Wind's supposed to lay down by noon. I'd wait for it."
2. "That's a long day for a first day. A guy could stop on Two and nobody'd think less of him."
3. "My grandpa was underground forty years. My dad guided. I sell bug dope. That's progress, I guess."
4. "The board's there. Pays what it pays. Deb's fish money is the only sure thing in this town."
5. "I'll ring the site for you. Don't tell people where you got it."
6. "We had a Grumman go over the falls in '88. Came back with a dent and a better story than the guys in it."
7. "Hang your food. I say it to everybody. I'll say it to you twice."
8. "Back before the bill this was a bait shop and a gas pump. Mom ran it. Dad fished."
9. "No, I didn't know the fella. Before my time here. Ask around, I suppose."
10. "People from the Cities come up and tell me what this place is. I let 'em. They tip better that way."
11. "It's a little breezy out past the point. You'll see what I mean."
12. "That pack? That's older than you. Canvas holds up, you just can't get it wet. Or you can, it just stays wet."
13. "Saw your sign," (to a regular). "Well. You know where mine is."
14. "Short season this year. Ice went out late, it'll come in early. It always does when you need the money."
15. "You came back with all your gear and most of your sense. That's a good trip."
16. "Store closes at eight. I'm here till ten. Knock on the side door."

### 6.3 The old guide (70s–80s; guided from the '60s on; lifelong)

1. "Forty-some years of other people's fish. I don't keep any. I've eaten enough walleye for three men."
2. "We marked our own sites on the maps back then. Pencil. Nobody had to tell you where to sleep."
3. "First thing they did was take the cans away. Had to throw out a whole summer's menu."
4. "Basswood used to have lights on it at night. Lodges, all down the shore. You'd paddle home by them."
5. "Wind on Sag will put you in the water and not feel bad about it."
6. "I don't say where. I'll tell you what bay. You'll do the rest or you won't."
7. "Fella asked me once was I ever scared out there. Twice. Both times on land."
8. "The blowdown? I was on Knife. The tent went one way and I went the other. Lost a good coffee pot."
9. "That carry's {rods} rods if you believe the map. I never did."
10. "Walt? He guided out of three places I know of. Never stayed. Good with the clients, didn't like the owners."
11. "He'd go out alone in October. People said he was strange. I said he liked October."
12. "There's a lot of old junk in the woods. Some of it's history. Most of it's somebody's lunch."
13. "Don't trust a calm lake after two in the afternoon."
14. "The boys he tripped with, they were a bunch. Loud. I liked 'em fine. Well. Most of 'em."
15. "My knees are done. I sit here and tell people where the fish were in 1974. Nobody checks."
16. "Kids now plan the whole trip on the phone. Then the wind comes up and the phone doesn't know."
17. "You found his gear. Huh." *(Long pause.)* "Well. It's yours now, isn't it."

### 6.4 The ex-miner / old exploration crewman (the porch man; paranoid, secretive, decent)

1. "You came out of there with Walt's pack. I'd know that patch anywhere."
2. "Don't stand there. Walk with me. To the truck. Like we're talking about bait."
3. "We drilled cores up past the river every summer. Core in the boxes, boxes on the truck. Nobody asked."
4. "His brother wanted to make a fuss. Walt told him not to. You know how that went."
5. "They called it an accident. I've seen men drown. They don't fold their jacket first."
6. "I don't believe Walt's at the bottom of anything. I've thought that a long time."
7. "Who've you talked to? Don't tell me. Better I don't know."
8. "Some of the same men are still around. Older. Nicer cars."
9. "I'm not saying anything. I'm telling you where the old drill roads went. That's public."
10. "Look at a map from before the bill. The ones with the logging roads still on them."
11. "That's enough for today. Come back when you've been somewhere."
12. "You catch anything? Say yes. Say you got a walleye off the reef. Somebody's listening."
13. "I worked for them nine years. Paid for my house. I'm not sorry about the house."
14. "Mining's not the problem. Men are the problem. Same as anything."
15. "If anyone asks, I talked to you about the weather. Which I did. It's going to rain."
16. "You're in it now. I'm sorry about that. I mean it."

### 6.5 Retired locals (the café, the bait shop, the church basement, the bar)

1. "My dad's cabin went out on the ice in '62. Burned it ourselves. Better than watching."
2. "Took me thirty years to be glad they did it. Took my dad longer. He never got there."
3. "The spring the mine shut, half my class moved to the Cities. I stayed. Somebody had to."
4. "Potica's for Christmas and funerals. This is a funeral, so eat."
5. "Ice went out on the twenty-ninth. I've written it down every year since 1971."
6. "The Cities people mean well. That's the trouble with them."
7. "You're the one with Walt's tent. Small town. Sit down."
8. "He came in for coffee every morning he wasn't out. Black. Paid in quarters. Then he stopped coming."
9. "I don't do politics at the counter. Pie, coffee, weather. Pick one."
10. "That storm in '99, the sky went green. I thought it was the end of the world. It was a Sunday."
11. "My grandson works for the company. Good job. I don't ask him about it and he doesn't tell me."
12. "My brother hasn't spoken to me since the hearings. That's forty-some years. We wave."
13. "Rhubarb's still coming up where the old lodge was. Nobody planted it in sixty years."
14. "Root beer used to come from an island. Now it comes from a truck. Same with everything."
15. "You'll want to talk to his sister. You won't get anywhere. But you'll want to."
16. "Uff da, look at the sky." *(A Gunflint Swede; once.)*

### 6.6 Weekend paddlers (the Cities, Chicago, Iowa, Madison; in groups of two to six)

1. "We did fourteen miles today. Ten portages. Kyle cried on the last one."
2. "Is this site taken? Sorry. Obviously it's taken. Your tent's on it."
3. "Have you seen a blue dry bag? It's got literally all our toilet paper in it."
4. "First time up? Same. We've been planning since January. I have a spreadsheet."
5. "Our permit's for EP 25. Is that this one? Please say this is this one."
6. "We heard a bear. Or a moose. Or Dave. It was probably Dave."
7. "I've never been this happy and this tired at the same time."
8. "Do you know if the fish are biting? We have, like, four hundred dollars of lures."
9. "No signal since Tuesday. I thought I'd hate it. I don't hate it."
10. "We saw a loon carrying a baby on its back. I'm still not over it."
11. "The guy at the outfitter said 'a little breezy'. It was not a little breezy."
12. "Hi! We're from Iowa. We get that a lot."
13. "Bucket list, man. My dad always wanted to come. So I brought him." *(Taps the pack.)*
14. "How far's the next portage? In, like, actual distance, not rods."
15. "Eight days and I'd go back tomorrow. After a shower."
16. "We're the guys with the hammock. Sorry about the hammock."

### 6.7 Families (a parent, kids 8–15; base-campers and first-timers)

1. *(Kid)* "Do you want to see my fish? You can't hold it."
2. *(Kid)* "I'm not tired. I'm bored. It's different."
3. *(Kid)* "Dad says it's a perch. I think it's a perch."
4. *(Kid)* "There's a frog in the latrine. I'm not going back in there."
5. *(Kid)* "Are you a ranger? You look like a ranger."
6. *(Kid)* "My sister saw a moose and I was asleep. I'm never sleeping again."
7. *(Parent)* "We picked the easy entry. Turns out there's no easy entry."
8. *(Parent)* "My dad brought me here when I was ten. Same lake. The site's smaller than I remember."
9. *(Parent)* "Do you know if the swimming's okay off the rocks? They'll do it either way."
10. *(Parent)* "Day four. Nobody's asked for a screen in two days. I'm counting it as a win."
11. *(Parent)* "We lost a paddle. Well. The paddle lost us."
12. *(Parent)* "They complain every portage and they'll talk about it for twenty years. I did."
13. *(Parent)* "Are you out here by yourself? That's brave. Or something."
14. *(Kid)* "We found a old nail by the fire ring. A square one. Mom says it's history."
15. *(Kid)* "If a bear comes, Dad says we make ourselves big. I'm already big."

### 6.8 The boys (Walt's trip friends; 60s–70s now; loud, loving, unreliable)

Write them as a group first: shared jokes, shared trips, shared grief. One of them is the informant (§3.3). The
lines below are mixed; writers decide who says what.

1. "We went in every August for twenty-six years. Missed one. Frank's girl's wedding. We still hold it against him."
2. "Walt cooked. Walt always cooked. Nobody else was allowed near the pan."
3. "You want to know about Walt, you buy the first round. That's the rule. He made it."
4. "Last trip with all of us was the year it was so dry. After that he went alone."
5. "He'd go quiet on the last night. Every trip. Sit on the rock. We left him be."
6. "Swamped, no paddle. Walt? Walt didn't lose paddles. He lost sunglasses. Not paddles."
7. "I was in Duluth that week. My sister's thing. I was at my sister's." *(Nobody asked.)*
8. "Leave his family out of this. They've had enough people knocking."
9. "We had a name for the bay he liked. Don't ask me where it is. I was always in the back of the canoe."
10. "You think I don't miss him? He was my best friend. He was all our best friend."
11. "Talk to the mining guys. They knew him longer. They'd know more than us."
12. "He made us swear off one lake. Wouldn't say why. Said the fishing was lousy. The fishing was not lousy."
13. "If you find anything of his, you'd bring it to us first. Right? We're his guys."
14. "Somebody talked. Back then. I've always thought somebody talked." *(Writers: give this to the wrong one.)*
15. "Here, I'll ring it for you. And this one. And there's a carry near there, I'll ring that too."
16. "He'd hate this. Us sitting around talking about him like he's a story."

### 6.9 Walt's family (siblings, a niece or nephew, a cousin; know he got out; frightened)

1. "We've had people ask. We've said what we have to say."
2. "Coffee? There's bars. Sit. I'm not going to talk about him, but sit."
3. "They found his canoe. That's what there is."
4. "My brother is—was a careful man. People forget that about him."
5. "You have his tent. Is it all right? The tent. Is it holding up?"
6. "Don't put us in whatever you're doing. Please."
7. "Mom kept his room. Then Mom died. Now it's a sewing room."
8. "He sent—" *(Stops.)* "He used to send cards at Christmas. Before."
9. "If you're asking whether I believe it, I don't answer that. Not here. Not anywhere."
10. "There were men at the funeral nobody knew. Nice suits. They signed the book."
11. "I'll tell you one thing and then you'll go. He always landed where the cedar leaned. That's all. Go."
12. "We don't say his name at the store. People look at you."
13. "His brother first. Then him. You don't know what that does to a family."
14. "If you do find something, don't tell me. I mean it. I don't want to know where."
15. "You look tired. Eat something before you go back out."
16. "He'd like you, I think. That's not a compliment. He liked trouble."

### 6.10 The company man (local-born, friendly, polished; the bible decides if he's one of the corrupt men)

1. "You must be the one with the old outfitter gear. Small town. I'm Dan. I'm with the company."
2. "We're good neighbours up here. We sponsor the hockey team. Ask anybody."
3. "I grew up six blocks from here. My grandpa was underground. I'm not some guy from the Cities."
4. "A lot of folks get turned around on those old roads. Some of them aren't safe. I'd hate to see that."
5. "There's a lot of old stories about the company. Most of them are about men who're dead now."
6. "Walt? Sure, I knew of him. Sad thing. Those big lakes in October."
7. "Can I buy you a coffee? No? Another time. I'm around."
8. "If you ever came across anything from the old exploration days, we'd want it back. For the history."
9. "We'd pay, of course. Fair price. More than fair."
10. "I'm on your side. I'm on everybody's side. That's the job."
11. "Jobs, schools, a hospital that stays open. That's all this is about. People forget that."
12. "My kids want to stay up here. You know what that takes? It takes work."
13. "You've been up on that end a lot. Fishing good?" *(He knows where you've been.)*
14. "Funny thing, people saying the company's the bad guy. We're the only ones still hiring."
15. "You're too deep in something you don't understand. I say that as a friend."
16. "Offer's good till the snow. After that I can't promise anything. Not up to me."

### 6.11 The journalist (from the Cities or Duluth; regional paper or freelance; dogged, careful, not a crusader)

1. "I'm not here to fish. I'm here because you've been asking the same questions I have."
2. "I've written about the leases for six years. Nobody reads past the second paragraph."
3. "Don't call me at the paper. Don't email. Leave a note at the counter at {outfitter}. Under 'leech order'."
4. "I need paper. Signatures, dates, numbers. A story about a story doesn't run."
5. "I'm not going to tell you it's safe. I don't know that it's safe."
6. "You don't owe me anything. I'm saying, if you find it, I'm the one who'll know what it is."
7. "Every reporter up here gets called an outsider. I grew up in Virginia. The Range one."
8. "Half the people I talk to are for the mine. Most of them are decent. That's not the story."
9. "The story's about four or five men. Not the mine. Not the town. Men."
10. "His canoe was found swamped. The sheriff's report is two pages. Two pages for a man."
11. "I can meet you at {entry point}. Not in town. Too many trucks I recognise."
12. "If they're watching you, don't change anything. Fish. Buy bait. Be boring."
13. "I've been doing this long enough to know when people are scared. Everyone you've named is scared."
14. "I'll be there. If I'm not, something's wrong. Don't wait more than a day."
15. "You did the hard part. I just type."

### 6.12 Canadians: Quetico ranger, Atikokan outfitter, fly-in camp man, Lac La Croix guide

Lac La Croix characters are people with jobs: guides, outfitters, ranger staff, a family running a camp. They talk
about work, weather, rights and history as plain fact. No sacred material, no spiritual framing, no "wisdom".

1. *(Ranger)* "Remote Area permits are done this year, so you'll check in properly. Sorry. Not my idea."
2. *(Ranger)* "Barbless hooks, no live bait. I'll say it twice, you'll still have leeches in the cooler."
3. *(Ranger)* "No designated sites on this side. Pick a spot that looks like nobody's picked it."
4. *(Ranger)* "We don't burn the old cabins on this side. Leave them be. They were here first, in a manner of speaking."
5. *(Atikokan outfitter)* "This was a mine town too. They closed around '80. We know how that goes."
6. *(Atikokan outfitter)* "You'll see more people on Basswood in an afternoon than I'll see on Kawnipi in a week."
7. *(Atikokan outfitter)* "Bring a toque. Yes, in August."
8. *(Atikokan outfitter)* "Americans love a rule. We love a rule we never have to enforce."
9. *(Fly-in camp man)* "The Beaver comes Tuesdays if the weather's good. It's never good on Tuesday."
10. *(Fly-in camp man)* "An old fella came through here a few falls back. American. Paid cash. Didn't fish. I noticed."
11. *(Lac La Croix guide)* "My grandfather guided out of here. Then my dad. Now me. Motors on six lakes, ten horse. That was a long fight."
12. *(Lac La Croix guide)* "The park took land from us. They said sorry in '91. We still guide."
13. *(Lac La Croix guide)* "You want walleye or you want to paddle? It's not the same trip."
14. *(Lac La Croix guide)* "Wind's from the northwest. You'll want to be across before lunch."
15. *(Any)* "Thunder Bay? That's the Lakehead. Nobody calls it that anymore except everybody."
16. *(Any)* "You're a long way from your car, eh." *(The one "eh".)*

### 6.13 Decent people on both sides of the mine (for side conversations, yard-sign moments)

Samples of register only. The arc files write their own lines; don't reuse these verbatim (#1's Williston beat
now belongs to Frank's Bakken line in `32-the-boys.md`).

1. *(For)* "My boy's in Williston. Drives four hours to see his kids on weekends. You tell me about wilderness."
2. *(For)* "We dug iron for a hundred years and the walleye are still in the lake."
3. *(For)* "If it's done right, with our rules, I'm for it. If it's not, I'll be the first one yelling."
4. *(For)* "Every phone in America has copper in it. It's coming out of the ground somewhere."
5. *(For)* "Canoe people buy a sandwich and a T-shirt and go home. Miners buy houses."
6. *(Against)* "My dad was underground thirty years. He'd hate this one. It's not the mining, it's where."
7. *(Against)* "Water goes downhill. That's the whole argument. That's it."
8. *(Against)* "I've got neighbours who'd get those jobs. I know what I'm asking them to give up."
9. *(Against)* "You can't put a lake back."
10. *(Either)* "I don't talk about it at Thanksgiving anymore. We tried."
11. *(Either)* "Ask me in ten years. I'll tell you if I was right."
12. *(Either)* "Everybody wants it their way. Including me."

---

## 7. Do and don't

| Do | Don't |
|---|---|
| "It's a little breezy past the point." | "Holy cow, dontcha know, it's real windy out dere!" |
| "Before the bill this was a bait shop." | "Before the 1978 Boundary Waters Canoe Area Wilderness Act, which restricted motors…" |
| "They found his canoe." | "As you know, Walt's canoe was found swamped without a paddle and he was presumed drowned." |
| "That's different." (disapproval) | "That's a terrible idea and you'll die." |
| One regional word, unexplained (*sisu*, potica). | A glossary in someone's mouth. |
| A pro-mine character with a son in North Dakota. | A pro-mine character who's greedy or stupid. |
| A villain who's pleasant and sponsors the hockey team. | A villain who threatens in so many words or twirls anything. |
| A guilty man who over-helps. | A guilty man who "shifts uneasily" or "avoids eye contact". |
| Fear shown as hospitality and a narrow answer. | Fear shown as trembling, sobbing, or exposition. |
| A Lac La Croix guide talking about motors, wind and walleye. | Any Ojibwe character as a spiritual guide, mystic or source of legends. |
| Real events alluded to by name ("the blowdown"). | Real private people named, quoted or used as characters. |
| A Canadian with one "eh". | A Canadian with three "eh"s and an apology per line. |
| Kids who sound like kids (blunt, literal, funny). | Kids who sound like greeting cards. |
| Weekenders who are earnest and a bit much. | Weekenders mocked; they're the player's people too. |
| People who teach a thing once, at the moment you need it. | People who explain items or controls. |

---

## 8. Sources read (paraphrased; no passage over 15 words copied)

Forum threads (bwca.com, fetched with curl on 2026-11-05):

- "What's the strangest thing you've seen in the woods?":
  https://www.bwca.com/index.cfm?fuseaction=forum.thread&threadId=1353366&forumID=12&confID=1
  (lights over lakes, a lake that "felt off", lynx swimming, odd objects in the woods; how old hands tell an
  uncanny story plainly)
- "Time flies and so did the July 4th blowdown… where were you?":
  https://www.bwca.com/index.cfm?fuseaction=forum.thread&threadId=1374836&forumID=12&confID=1
  (memory by place and date, understatement about the storm, the green sky, chainsaws left on portages)
- "10 years later Pagami fire recount":
  https://www.bwca.com/index.cfm?fuseaction=forum.thread&threadId=1357304&forumID=12&confID=1
  (a solo paddler's premonition and plain telling; arguments over the Forest Service)
- "Dorothy Molter story":
  https://www.bwca.com/index.cfm?fuseaction=forum.thread&threadId=1378965&forumID=12&confID=1
  (how the public inholder legend is retold; allusion only)
- "BWCA history question" (when permits began):
  https://www.bwca.com/index.cfm?fuseaction=forum.thread&threadId=1374291&forumID=12&confID=1
  (an old youth-camp guide's timeline: no permits, can ban, marking sites in pencil, Quetico's strictness)
- "It must be November":
  https://www.bwca.com/index.cfm?fuseaction=forum.thread&threadId=1123572&forumID=17&confID=1
  (off-season banter, long solo Quetico trips told briefly)
- "Weird sled on Jean Lake":
  https://www.bwca.com/index.cfm?fuseaction=forum.thread&threadId=1032326&forumID=17&confID=1
  (relic-or-junk argument, "don't post specific details", Quetico vs BWCA removal policies)
- "old resorts": https://www.bwca.com/index.cfm?fuseaction=forum.thread&threadId=475343&forumID=12&confID=1
  (resort memories, wild garden vegetables, fly-in camps mooring outside the line)
- "Family basecamp entry points": https://www.bwca.com/index.cfm?fuseaction=forum.thread&threadId=1310948&forumID=16&confID=1
  (how families and weekenders plan: entry-point numbers, permit day, black flies, gold-mine trail rumour)

Repo research:

- `docs/plans/bwca-history-research.md` (airban, buyouts, the 1977 hearing, the Pioneer closing, copper-nickel
  sides, the cross-cutters)
- `docs/research/research_notes/BWCA history and local sentiment/*.md` (outfitters_lodges_towns, wilderness_acts_buyouts,
  mining_copper_nickel, early_history_to_1960, searches_fires_story_details): local sentiment, resort families'
  mixed feelings, "the day the town died", the Ely–Atikokan races, Lac La Croix motor rights
- Existing dialogue: `src/talk-keepers.js`, `src/talk-visitors.js`, `src/talk-rumours.js`

## 9. Open notes for the bible

- **Spelling:** the existing game text leans British (grey, neighbours, colour). This guide's samples follow that
  house style. Canadians would spell that way anyway; if the owner prefers American spelling for Minnesotans, change
  it in one pass.
- **Names:** use invented names. Fitting first names: Finnish (Tauno, Rauha, Aino, Eero, Toivo), Slovene (Frank,
  Joe, Stanley, Mary, Rose, Ludvik), Italian (Angelo, Rocco, Gina), Scandinavian (Arne, Ingrid, Lars). Avoid the real
  families named in the research (resort, outfitter and political names) as surnames.
- **The brother's name:** `talk-keepers.js` already has a keeper's brother named Eino (a paddle carver). Pick the
  dead brother's name so the two don't collide, or rename the keeper's brother.
