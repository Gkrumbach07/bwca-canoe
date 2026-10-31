# Crafting: camp actions as a process

The owner (2026-10-31): *"I want to make crafting and using certain things be more of a process … mimic a lot of what
actual backpacking and canoe camping is like … the building blocks are, you have the raw materials, which might be water
or oatmeal. And then you have the tool, which might be a lit fire. And you interact with it … Food goes in pot … don't
make it so fine-grained where it's just like tedious."*

## The model

It works like a furnace in Minecraft, with a pot added:

| Part | What it is in the game | Where |
|---|---|---|
| **Raw materials** | meals, fish and fillets, water (lake water or clean) | `items.js` |
| **Vessel** | a pot (a small container: Small 1 L, Cook 2 L, Big 4 L), or the grate itself for a fish on a stick | `items.js` `def.pot` |
| **Station** | the grate over a lit fire, or the canister stove lit under a pot | `cook.js` `stationOf` |
| **Recipe** | what the vessel's contents turn into, the water each takes, and its game minutes | `recipes.js` `RECIPES` (one table) |

While a vessel sits on a station and what's in it matches the table, it works on the **game clock** (no time skip). Change
what's in the pot and it starts over. When it's done, the cooked food and any leftover water (boiled now: clean, and hot
for an hour) stay **in the pot**. You eat from the pot or take the food out. Several pots can share the grate (it is
4 × 2 cells: a cook pot and a small pot fit side by side), which is the point of carrying a second, smaller pot.

Matching rules (`recipes.js plan`):

- Each raw thing in the pot needs its own water (oatmeal 0.25 L, supper 0.4 L, freeze-dried 0.5 L…). If the pot is short,
  the pot's icon shows the chip "water 0.3 L".
- Two oatmeals and 0.5 L cook together, and the time is the longest of the dishes or the boil.
- Leftover water boils along with the food and ends up clean.
- A pot that holds only water boils it. Boil time is 3 min + 3 min per litre, so a full cook pot takes 9 min. Clean but
  cold water just heats up (coffee needs hot water).
- Fish fries in a **dry** pot. With water in the pot the chip says "tip the water out", and with a meal it says "fish
  apart".
- A whole fish laid straight on the grate cooks on a green stick, with no pot needed. A meal laid straight on the grate
  shows "into a pot".
- On the stove, everything cooks in 0.6 of the fire's time.

## Water

- **E at the shore** fills the bottle with lake water as it comes. No tablet goes in by itself any more.
- To make it safe, pick one:
  - **Treat it** (the bottle's or the tablets' right-click): one tablet, drinkable in 30 min.
  - **Pour into a pot** (the bottle's right-click) and boil it on the fire or the stove. Then **Pour into the bottle**
    (the water's right-click in the pot) puts it back, safe. The other way to get water into a pot is **Fill it at the
    water** on the pot itself, at the shore.
  - **Pump** or **gravity bag**: if you have one, a **Q** at the shore runs the water through the filter.
- Drinking untreated water uses the existing risk: each litre may upset your stomach (energy.js `UPSET`). The upset
  starts 0.4–1.2 h later, lasts 10 h, takes a chunk off the bar's ceiling, and makes you hungry and thirsty faster.
- A drop of lake water makes the whole bottle (or pot) lake water, as before. Clean water won't pour into a bottle that
  has lake water in it (the verb greys and says why).
- Coffee and cocoa (**Brew a cup**) take 0.25 L of **hot** water from a pot in reach. They used to take water from the
  bottle and heat it over any fire nearby.

## The sweep: what each action requires, and the call

| Action | Requires | Decision and why |
|---|---|---|
| **Cook a meal** | a pot · the meal in the pot · its water in the pot · the pot on the grate · a lit fire (or the lit stove) | **New process** (this round). The owner's own example. Each piece is something you do or carry, and none of them is a busywork click. |
| **Fry a fish** | a dry pot on the grate, or nothing (a stick on the grate) · a lit fire | The stick stays: a fish on a green stick is real, and it means catching supper never depends on having a pot free. |
| **Boil water** | water in a pot · the pot over a lit fire or the stove | **New process**. This is the free alternative to tablets that the owner asked for. It costs time and wood. |
| **Treat water (tablet)** | untreated water in the bottle · a tablet in reach | **Made explicit** (it was automatic on every fill). Now it's a choice you make, as the owner asked. |
| **Filter water** | the pump or the gravity bag with you · the water's edge | Its own Q at the shore. A filter is the way you fill, so one press is enough. The gravity bag no longer treats the bottle by itself at camp. |
| **Coffee / cocoa** | the packet · hot water in a pot | **Now part of the chain**: boil first, then brew. Before, it skipped the boil. |
| **Stove** | the stove · fuel (one use per light, up to 45 game min) · a pot set down (not in a pack) holding something to cook or boil | Now a station like the fire. The chore that skipped the clock is gone. The rule to set the pot down first is the one extra step, and it's how a stove is really used. |
| **Light the fire** | dry wood in the ring: a dead branch plus 3 dry pieces (2 with the tin match safe) | **No change.** Matches aren't an item: you'd never leave without them, and running out would just be a gotcha. Wet wood is already the real constraint. |
| **Douse the fire** | the held action | **No water required.** The hold's three phases (drown, stir, drown again) stand for fetching the water. Making you carry a full pot to the ring every time you break camp would be the tedious kind of realism. Worth revisiting if the owner wants it. |
| **Hang the bear barrel** | the barrel · a tree with a limb 4–7.5 m up | **No rope or rock to collect.** The owner said so: the barrel kit comes with its rope. The real choices are the tree and the limb, and the game already has both. (hang.js belongs to another stream; it's only read here.) |
| **Pitch the tarp** | the tarp (its lines come with it) · two trees, a tree and 2 poles, or 4 poles | **No change.** The owner's example of the right line: the tarp brings its rope, not its wood. Poles are found or cut with the saw. |
| **Cut a pole / saw logs** | the folding saw (or the found hatchet) · a down log | No change. You need the tool, and the wood is in the world. |
| **Pitch the tent** | the tent · a campsite’s tent pad | No change. The tent rides in a pack, and the pegs and poles come with it. (Another stream is making the tent a container.) |
| **Sleep** | the tent · the sleeping bag in reach (else 60 % of the night's rest) · a pad (optional, warmer) | No change. This is the "things should be used and have a reason to be used" pattern the owner pointed to. |
| **Change clothes** | the clothes bag (one dry set) | No change. It dries by a fire. |
| **Fillet a fish** | the fillet knife · a whole fish | No change. Fillets are lighter, cook faster (6 min), and fit the small pot and the cook pot (a whole fish needs the big pot or a stick). |
| **Fish** | the rod · a lure or leeches tied on (leeches live in the bucket) | No change. |
| **Portage** | the canoe · yoke pads (optional, effort ×0.85) | No change. |
| **Eat a snack** | the snack, standing still | No change. Snacks are the no-fire option. |
| **Eat a cooked meal** | the hot food (in the pot, or taken out) | It goes off after `keep` hours, as before. |

The line I held to: **require the things you would really forget, run out of, or have to choose between** (a pot free,
water treated, wood dry, fuel, a second pot). **Bundle what always travels together** (the barrel's rope, the tarp's
lines, the tent's pegs, the matches).

## Where it lives

- `src/recipes.js`: the table (`RECIPES`), the matcher (`plan`), and the water ids and boil times.
- `src/cook.js`: the per-vessel jobs on the clock, the pots drawn at their cells on the grate, the pot and water verbs
  (`Into the pot`, `Onto the grate`, `Fill it at the water`, `Pour into a pot`, `Pour into the bottle`, `Tip it out`, the
  stove's `Light it under the pot`), and the states and chips.
- `src/items.js`: the three pots (`def.pot`), the water items, the verbs.
- `src/energy.js`: `fillRaw`, `addClean`, `pourOut` for the bottle.
- `src/kit.js`: the shore's filter (Q), brewing from a pot.
- The fire card (`nearby.js` fire object, `inv-ui.js` firePanel) shows each pot on the grate as its own grid with its own
  progress bar.

Older saves: the cook pot stored as a plain item becomes a container wherever it is (`cook.migratePots`). A meal that
was cooking under the old model goes back on its grate raw.
