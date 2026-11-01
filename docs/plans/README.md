# Plans: people, companions, co-op

Three design plans for features the owner asked for on 2026-10-25 and deliberately put off until the core game is
settled: "lets get it working first before we add it". Plans only, no code; each is a ten-minute read with the
player-facing design, a technical design read from the code as it stands at main `b7d927d`, a phased build with
rough effort, risks, and open questions with one recommended answer each.

| Order | Plan | What | Effort after the one before |
|---|---|---|---|
| 1 | [people.md](people.md) | parties at sites, on portages and crossing lakes; anglers, a guide, the ranger, someone in trouble; rumours, trades, tasks and help | ~3 B tokens · 4–5 rounds · 2 days |
| 2 | [companions.md](companions.md) | a tripper in your bow or in their own canoe; the carry split, the camp shared, their needs and moods, the fire talk; joining and leaving | ~2.5 B · 4 rounds · 1.5 days |
| 3 | [coop.md](coop.md) | two to four friends on one season through a small relay room on Cloudflare; the host owns the season; one clock, rest by agreement; a phased path from a Sandbox paddle to a shared season | ~3.5–4 B · 5–6 rounds · 2–3 days |

All three: about 9 B tokens over 14 or 15 rounds, a week of building at the pace of the last five days, about $2,500
at Opus 5.5 list prices. Add roughly 40 % for the session that writes the briefs, runs the joins and talks to you.

## How the effort is estimated

Measured from the 123 transcripts of this project (2026-10-21 to 10-25, deduplicated; `~/.claude/projects/*bwca*`),
20.6 B tokens in all for 49,700 lines of `src/`:

| Unit | What it is | Measured |
|---|---|---|
| **Stream** | one build session in its own worktree, from a brief to a commit, headless tests included | 72 of them: median 131 M tokens (99 % cache reads, ~210 k output), 340 turns, 0.8 h; range 40–440 M; 120–1,800 lines merged, median ~650 |
| **Join** | the session that merges a phase's streams and plays it through, fixing as it goes | 9: median 231 M, 575 turns, 0.8–1.3 h |
| **Round** | a phase: its streams in parallel, then the join, then the owner plays it | 2–3 h of wall clock; the project has run about three a day |
| **Day** | 10-23 (hubs phases 1–3, the pace, the trip core) | 9.1 B tokens, 135 commits, +16,700 lines |

Prices (October 2026): Opus 5.5 cache reads $0.20, input $4, output $20 per million; Fable 5.1 $0.25 / $10 / $50. A
median stream is about $35 at Opus 5.5 list, a join about $55, a billion tokens of this mix about $280; the owner is
on the Max plan, where the 8.1 B tokens since the window opened on 10-24 read as 63 % of the weekly allowance, so a
week's allowance is roughly 13 B tokens of this mix. The
estimates above assume the same way of working: a brief per stream, Opus 5.5 in the streams, three to four streams
a round. Co-op's first phase carries the only unmeasured items (a Worker deploy and a two-browser rig) and is
padded for them.

## Build them in that order

- **People first.** It is the owner's first wish, it grows straight out of what exists (`npcs.js` already seeds a
  party with a route and reserves `JOIN_US`; `CampRegistry` already reads *Taken*), and its phase 2 builds the one
  piece the other two plans cannot do without: **the actor layer** (`actors.js`, `poses.js`): a figure and a hull that
  walk, carry and paddle from state handed to them, with the stroke and the walk lifted out of `canoe.js` so any body
  can use them. A companion is an actor the host plans for; a remote player is an actor the network feeds.
- **Companions second.** They need the actor layer and they force the two data changes co-op needs most: an owner on
  every body place in the inventory (`at: id`) and a list of tents at a camp instead of one. Doing those for a
  companion, in single player, is far cheaper than doing them for the first time across a network.
- **Co-op last**, as the owner said. It is the widest change in the game (twenty modules assume one player) and it
  should land only once `inventory.js`, `packs.js` and `camp.js` have stopped being rewritten weekly. Its phase 1 (two
  friends on one lake in Sandbox, nothing shared but the water) can ship early as a test of the relay and the actor.

## Before any of them

Finish the order the owner chose on 2026-10-25: content pass 1, then consequences (the bear, wind-bound days, the
bugs), then the season's balance. None of these plans should start while the core is still moving under the feedback
rounds; each plan names the files it leans on so the start date can be judged from how often those files change.

## What they share

The owner's rules of 2026-10-25 are applied in each: teach once at the moment of need, the thing that needs something
says so, show only what is missing, quiet by default with few numbers, the world shows state first, and everything
real to BWCA practice (nine to a group, four canoes, one party per site, the loaded carry has the trail, food hung,
fires in the grates).
