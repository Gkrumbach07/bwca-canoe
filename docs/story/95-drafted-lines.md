# Drafted lines (build drafts for the writers to replace)

Lines the build needed where the writers' docs have none. Each is a build draft: the writers replace it here and give
it an anchor in their own doc; the code then reads the anchored words. Nothing here is canon.

## Stream c (co-op mirror, Round 3)

| Anchor | Line | Where it's used |
|---|---|---|
| `c.walt.n42` | Not with company on the lake. | The Walt page, "The far end", written once the first time a player with an L6 key points at the pit with a friend in the room (campaign-design §7.2). It quotes NB72 (N42) word for word; `src/story-data/walt-lines.js` holds it as the row's `text`. |
| `c.coop.reading` | {host} is reading by headlamp. | The one card a guest sees on a shared night while the host's night-one cutscene plays (campaign-design §6.1); `src/coop-story.js` WORDS.reading. |
| `c.coop.shut` | Out on the water tonight. | A guest's join or Rejoin refused while the host's run is on (campaign-design §8.3 "No company"); `src/coop.js` SHUT_WORDS and `src/coop-story.js` WORDS.shut. |
| `c.coop.nod` | … | A story person (Tauno, the Farm people …) stood on a guest's screen, E on them: a look up, no words (as cast.js's Josie with no word). Josie says her own 70 §4.4 lines. |
