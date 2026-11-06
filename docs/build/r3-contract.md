# Round 3: the shared contract (the guide)

The owner's words of 2026-11-05 (tasks in the journal, a golden locator, a pop-up tracker, an empty-handed start) are
built by three builders in parallel on `claude/r3-base`. They all build against one small module, `src/guide.js`,
so none of them has to read another's code while it is being written. This page is the API, what feeds it, who owns
which files, and the test each builder adds.

The guide is already in the base: `window.__game.guide`, wired in `main.js`, with its rig `scripts/r3-guide-test.mjs`
(13/13).

## 1. What the guide is

The guide is a registry of everything the player has on the go, with one entry per thing. It is never saved. A few
times a second it rebuilds every entry from the module that owns it (its **source**) and emits an event for each
change. It draws nothing itself:
- the journal's Tasks page draws the entries (B);
- the tracker card shows the events (B);
- the locator draws a gem over the targets (C).

```js
import { guide, GUIDE, GUIDE_KINDS } from './guide.js';   // also window.__game.guide
```

### An entry

```js
{
  id: 'story:onboard:talk',            // unique, stable across syncs
  kind: 'story' | 'side' | 'starter' | 'ticket' | 'board',
  title: 'Talk to Brooke',             // the line in the journal's list
  next: 'Talk to Brooke at the counter.', // one plain line: what to do now (capitalised, full stop added)
  target: null | {
    kind: 'person' | 'place' | 'thing',
    key: 'staffer:31',                 // changes when the target moves on (grate → latrine): a 'target' event
    label: 'Brooke',
    pos: () => ({ x, y, z }) | null,   // the TOP of the thing in world metres; the locator floats its gem above it
    near: 30,                          // m: shown within this flat distance (capped at GUIDE.nearMax = 120)
    store: 31 | 'any' | null,          // also shown anywhere in or about that store (outfitter.visit.ep), ≤ GUIDE.storeR
  },
  tutorial: true,                      // a tutorial step: the tracker is always on for it
  order: 0,                            // within a kind: lower first (a notice's due day; a step's place in the path)
  done: false,                         // done but still listed (a notice done and not yet paid)
  source: 'onboarding',                // the source's name
  ref: 'onboard',                      // the owner's own id (a task id, a fine id)
  added: 12345.6,                      // performance.now() when first seen
}
```

### The API

| call | what it does |
|---|---|
| `guide.source(name, fn) → off` | registers a source: `fn()` returns `[spec]`, where a spec is an entry with `id` required. A name that is already there is **replaced**. The built-in sources are `'board'`, `'tickets'` and `'onboarding'`. `off()` removes the source. |
| `guide.add(spec)`, `guide.finish(id)`, `guide.remove(id)` | a hand-held entry, kept until it is removed and not saved. Use it for something that has no saved state of its own. |
| `guide.sync()` | rebuilds the entries now. `update` calls it every `GUIDE.syncS` (0.25 s). |
| `guide.update(dt)` | called each frame in the game, after `tasks.update`, through the wrap in main.js. It syncs and fires the near and far edges. |
| `guide.list({ done = true })` | the entries in the journal's order: open ones first, then by kind (story, side, starter, ticket, board), then tutorial steps, then `order`, then `added`. |
| `guide.get(id)` | one entry, or null. |
| `guide.current()` | the main path's step: the first open `story` entry (tutorial steps first, then `order`). Null when there is none. |
| `guide.reach(entry)` | `{ pos, d, show, fade, inStore }`, or null when the entry has no target or its pos is null. `show` is the rule below. `fade` is 1 inside 60 % of the reach and falls to 0 at its edge. |
| `guide.marks()` | what the locator draws this frame: `[{ id, entry, pos, fade, main, d }]`. The main path's step comes first (`main: true`), then other open entries that are in reach, by kind. At most `GUIDE.marksMax` (3). |
| `guide.spot(ep, key)` | a pos function for one of a store's spots: `'counter'`, `'keeper'`, `'board'`, `'wall'`, `'maps'`, `'food'`, `'tackle'`, `'gear'`, `'door'`, `'dock'` (the berth), or `'canoe'` (wherever the hull lies: `player.carry.drop`). |
| `guide.speakerPos(speaker)` | a pos function for the point over a talk speaker's head (`onboarding.speaker(ep)` or an `npcs.js` handle's `speaker`). |
| `guide.on(evt, fn) → off` | `fn(entry, detail)`. The events are listed below. |
| `guide.stats()` | `{ open, done, story, current, marks, sources }`, for the rigs. |

The events:

| event | when | detail |
|---|---|---|
| `add` | a new entry | `{ initial }` is true for entries a page load restores: the first sync in the game, or any sync while the title is up. A new season's entries are never initial. The tracker skips initial adds. |
| `change` | its title or next line changed | `{ fields: ['next'] }` |
| `target` | its target's `kind:key` changed, appeared or went | |
| `done` | it turned done (it stays listed) | |
| `gone` | it left its source (paid, dropped, missed, the step passed) | |
| `near`, `far` | `reach().show` turned true, or false | `near` carries `{ d }` |
| `*` | every event | `fn(evt, entry, detail)` |

**The show rule (never across the wilderness).** A target shows in either case:
- the flat distance is at most `target.near`, which is never more than 120 m;
- the player is in or about the target's `store` (that is, `outfitter.visit.ep` matches, or the store is `'any'`) and
  the target is within 55 m.

A target whose pos is null never shows.

`GUIDE` holds the tuning: `syncS 0.25`, `near 30`, `nearMax 120`, `storeR 55`, `full 0.6`, `marksMax 3` and
`siteNear 60`.

## 2. What feeds it today (the built-in sources)

| source | reads | entries |
|---|---|---|
| `'board'` | `tasks.active` (tasks.js), meaning the notices that are open or done and not yet paid | id `task:<t.id>`. The kind is `'starter'` for the starter job and `'board'` for everything else (visitors' asks too). For **next**: "Paid when you come in." when done. Otherwise a kind's own `next(T, t)` if it has one. Campsite checks and the starter job get "Paddle to the site on the point on South Farm Lake.", then "Look over the grate." and so on. A fish to hand in gets "Hand it over at the board at …". Anything else gets the kind's `progress()` words. For **target**: campsite checks and the starter job point at the **next unchecked part** (grate, then latrine, then tent pad), as a thing within 60 m; when the site's layout isn't in yet, they point at the site. A fish notice in hand points at the board of its store. Anything else points at `tasks.spotOf(t)`, within 40 m. A kind may name its own target with `guideTarget(T, t, guide)`. |
| `'tickets'` | `permits.tickets()` | id `ticket:<f.id>`, kind `'ticket'`. Next is "Pay $20 in your journal (I)." or "$20 to pay; you have $12.". The target is the counter of whatever store you are in (`store: 'any'`). |
| `'onboarding'` | `onboarding.pending()` | id `story:onboard:talk`, kind `'story'`, tutorial. Next is "Talk to <staffer> at the counter.", where the name is "the summer help" until the staffer stands. The target is the staffer (`onboarding.speaker(ep)`) with `store: home`. **This is a placeholder: builder A replaces it.** |

`task-kinds-2.js` now also exposes `__game.taskKinds2.partsOf(t)`, which gives where a site check's grate, latrine and
pad are. The guide reads it.

## 3. The main path's ids (builder A writes them; B and C test against them)

Builder A replaces the `'onboarding'` source with its own: `guide.source('onboarding', () => specs)`, built from
onboarding.js's **saved** state, so the path comes back after a reload. Every step is `kind: 'story'`,
`tutorial: true`, with `order` as below. A may add steps but keeps these ids:

| order | id | next (A's words may differ) | target |
|---|---|---|---|
| 0 | `story:onboard:talk` | Talk to <staffer> at the counter. | person: `guide.speakerPos(onboarding.speaker(home))`, `store: home` |
| 1 | `story:onboard:food` | Buy food at the food shelf. | place: `guide.spot(home, 'food')`, `store: home` |
| 2 | `story:onboard:leeches` | Buy leeches at the tackle shelf. | place: `guide.spot(home, 'tackle')`, `store: home` |
| 3 | `story:onboard:canoe` | Your canoe is at the dock. | thing: `guide.spot(home, 'canoe')`, `store: home`, near 40 |

- A step that is done drops out of the source. That fires `gone`, and the next step becomes `current()`.
- **Escape-proof.** Escaping a talk never moves the step on. `story:onboard:talk` stays current until the gear is
  given, so the locator stays on the staffer and the tracker says the next line.
- Food and leeches may be bought in either order. Both stay open until bought, and `current()` picks the lower order.
- The co-op guest's starter kit is unchanged, and a guest gets no onboarding entries: `onboarding.skip()` makes
  `pending()` false.
- Later story and side stories, from the campaign's `episodes.js`, register their own sources (`'story'`, `'side'`)
  the same way. The campaign rule still holds: past the tutorial a story entry names a person or a place, never the
  steps to a solution.

## 4. Who owns which files

No two builders edit the same file. The one exception is `src/main.js`, where each builder adds **one block** under
its own marker. The markers are already there, after the guide's block and before `window.__game.siteFeature`:

```
  // ==== r3 A (start + onboarding): its one block goes below this line ====
  // ==== r3 B (journal + tracker): its one block goes below this line ====
  // ==== r3 C (golden locator): its one block goes below this line ====
```

Put the block directly under your marker and leave the blank line before the next marker in place. Then git merges
the three blocks without a conflict.

`src/guide.js` belongs to none of the three. If a builder needs a change to it, the builder asks the join for it and
works around it meanwhile: a source of your own, a kind's `next` or `guideTarget`, or `guide.add`. Do not edit it.

| builder | owns (edits only these, plus its main.js block) |
|---|---|
| **A: start and onboarding** | `src/onboarding.js`, `src/inventory.js` (the new season's kit), `src/items.js` (STARTER_KIT, OWN_KIT, any loaner item defs), `src/profile.js` (the starting money), `src/shop.js` (food, leeches, the season's bait state), `src/outfitter.js` (no canoe at the dock until the talk; the loan's canoe tied up then), `src/packs.js`, `src/dialogue.js` (escape and resume), `src/npcs.js` (the staffer), `src/starter.js`, `src/hints.js` (the tutorial's moments), `src/title.js`, a new `src/guide-story.js` (the main path's source, if A keeps it out of onboarding.js), and **every existing rig that assumed the starting gear** (`scripts/gl-*.mjs`, `glf-*`, `r2-*`, `scripts/coop/*`) |
| **B: journal and tracker** | `src/journal.js`, `src/paper.css`, `src/book.css`, `src/flyers.js` / `src/flyers.css` (only if the Tasks page needs them), `src/settings.js` (one new HUD toggle, `tracker: true`, "Task pop-ups"), a new `src/tracker.js` and `src/tracker.css` (its own DOM node on the left; it does not touch `hud.js`) |
| **C: golden locator** | a new `src/locator.js` (one shared mesh and material, drawing `guide.marks()` each frame), `src/quality.js` (the prewarm, only if the gem needs a program the prewarm lacks) |

Things nobody edits this round: `src/guide.js`, `src/tasks.js`, `src/task-kinds*.js`, `src/permits.js`, `src/hud.js`,
`src/pointer.js` and `src/coop-give.js`. The co-op guest's kit stays as it is. If one of these files has to change,
say so at the join.

## 5. How each builder uses the guide

**A** registers the main path (section 3). It gives the gear at the staff talk:
- Walt's old pack and tent;
- the outfitter's loan of a canoe, a paddle and a PFD, with the canoe appearing at the dock at that moment;
- a basic rod. This is A's **assumption**, from the owner's "not a full set"; A reports it.

There is no food and no fishing kit beyond the rod, and the starting money must cover a basic food buy plus leeches.
The buy-food gate follows "show only what's missing": the staffer's line and the step's `next` say that food is
missing. A does not hard-block the push-off unless the existing loop already does.

**B** draws the Tasks page from `guide.list()`. The tickets keep their own paper (`journal.permits`), and B maps
`ticket:` entries onto it. Each kind gets its own icon and ink:
- story: a deeper amber or ochre ink on the cream paper, with WCAG contrast of at least 4.5:1 against the paper's
  colour (measure it);
- side: a third style;
- starter, ticket and board: as they are now.

Each entry shows its `next` line. The tracker listens to `add` (skipping `initial`), to `near` and to `change` on
`current()`. During tutorial steps (`current().tutorial`) it is always shown, saying `current().next`, for example
"Talk to Brooke at the counter · I for your journal". Afterwards it shows only on those events and fades out after a
few seconds. It is never permanent, and the setting turns it off.

**C** draws `guide.marks()` each frame: a small faceted golden gem bobbing about 0.5 m over `pos`, with its opacity
set to `fade`. The main mark is a little larger. C uses one shared geometry and material and a few meshes. Count the
programs (`renderer.info.programs.length` after the prewarm) and keep the count the same, or note how it changed. A
mark disappears when its entry goes, because it is simply no longer in `marks()`.

## 6. The test each builder adds

Each rig runs against its own Vite: `APP=http://localhost:<port> node scripts/<rig>.mjs`. Each one prints PASS or
FAIL per check, ends with `n/m passed`, and exits non-zero on a failure.

| builder | rig | checks |
|---|---|---|
| (base) | `scripts/r3-guide-test.mjs` | the guide itself: the staffer's step and its mark, an escape keeps the step, the talk ends it, the starter job's line and its next part (grate, then latrine), nothing shown from 200 m, a ticket entry, the list's order, hand-held and replaced sources |
| **A** | `scripts/r3-start-test.mjs` | **the empty start:** a new season has no paddle, leech bucket, canoe at the dock or barrel; the crate holds only the player's own things. **The gear at the talk:** the pack, the tent, the loan's canoe at the dock, the paddle, the PFD and the rod. **No food.** The starting money covers a food buy plus a dozen leeches. **The path:** `story:onboard:talk` → food → leeches → canoe, each step `current()` in turn and each gone when it is done. **Escape:** at every node of the talk, escape and come back, and the step and its next line are still there. **A reload** in the middle of the path brings the same `current()` back. **The food gate:** pushing off for an overnight without food shows the missing-food line and does not block, unless the old loop blocked. **The rigs updated** for the empty start: gl-c and the others pass again. |
| **B** | `scripts/r3-journal-test.mjs` | the Tasks page lists one story, one starter, one ticket and one board entry (add a `side` entry with `guide.add`), each with its icon class and its `next` line. **Contrast:** for each kind's ink, the computed `color` against the page's background is at least 4.5:1, worked out in the page. **Tracker:** a new entry shows the card ("New task: …"); an initial add doesn't; coming in reach (`near`) shows it; during tutorial steps it stays up; past the tutorial it hides after its seconds; `settings.set('tracker', false)` keeps it hidden. |
| **C** | `scripts/r3-locator-test.mjs` | **On each step**, the gem is over the target (within 0.6 m of `pos` in x/z): the staffer, the food shelf, the tackle shelf, the canoe at the dock. Use A's steps once they are merged; before that, use `guide.add` stand-ins with the same ids and `guide.spot`. **Fade:** it fades with distance and is gone past the reach; a site's grate shows at the site and not from 200 m. **Done:** it disappears when its step is done. **Programs:** the program count after the prewarm is the same as on the base (record the base number), or the change is noted. **No page errors.** |

The regression rigs listed in the round's brief must still pass. The one exception is any rig that assumed the
starting gear: A updates those. gl-join and coop/give are flaky on a loaded machine, so rerun a failure before calling
it real.

## 7. Setup notes

- **Ports.** The base used 5244–5245. Each builder takes its own pair from the orchestrator.
- **The data link.** `ln -s /Users/gkrumbac/Documents/bwca-canoe/public-data-v9 public/data`. Make sure there is no
  `public/data/data` link inside it.
- **Lint.** `npx -y eslint@8 --no-eslintrc --parser-options=ecmaVersion:latest,sourceType:module --env browser,es2022 --rule 'no-undef: error' src/`
- **Servers.** Kill only your own servers, by PID.
