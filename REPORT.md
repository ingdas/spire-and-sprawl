# Spire & Sprawl: backlog report

**Status:** all 69 items from the critic backlog (`REVIEW_BACKLOG.md`) are done, in nine batches on branch `cel-shaded-roguelite-game`. Each batch is one commit.

**How it was checked:**

- `tsc` was clean after every batch.
- A scripted playthrough with real mouse and touch input passed at desktop (1440×900) and phone (390×844) sizes. It covers the map, every kind of stop, two flights to new lands, the reward screens and the HUD, with no page errors.
- Each new screen or effect was checked by eye in screenshots.
- The bots play against a software renderer at about 10–20 fps, so motion and frame rate still need a look on real hardware.

## What changed, by batch

| # | Commit | Theme | Items |
|---|---|---|---|
| 1 | `91866c6` | Make the board readable | 2, 12, 14, 17, 19, 38, 39, 45, 47, 52, 58, 59, 62, 68 |
| 2 | `eae6d05` | Give every block its own identity | 1, 3, 5, 6, 7, 10 |
| 3 | `47540f5` | Nights with more to do, an economy that spends | 15, 24–30, 32, 34, 37, 41, 69 |
| 4 | `e99a30d` | HUD and wording clean-up | 16, 22, 40, 46, 48–51, 53–56, 61 |
| 5 | `7ac02a8` | Make the night look and feel finished | 13, 18, 20, 21, 23, 31, 66 |
| 6 | `172c3ad` | Saved runs, settings, music | 11, 63, 64, 65 |
| 7 | `990d189` | Deeper building and spending | 4, 9, 33, 35, 36 |
| 8 | `246317c` | A fuller map and an inspect card | 42, 43, 44, 57 |
| 9 | `9633832` | More unique blocks, founders, a guided first run | 8, 60, 67 |

### Readability

- **Night look:** blocks keep their colours at night and glow faintly, turrets the most.
- **Enemies:** they are 30% bigger. Enemies hidden behind towers show as silhouettes, and arrows at the screen edge point to enemies off screen.
- **Core damage:** every hit shows a floating "−2 Brute" plus a chevron pointing at the attacker. The defeat screen lists what hurt the core and names the worst night.
- **Camera:** it follows tall towers, and the core is never hidden behind buildings.
- **The map:**
  - a "You" token marks where you are, and walks to the spot you choose;
  - spots you can no longer reach fade out;
  - danger dots on nights;
  - the legend covers night types too;
  - a preview of the enemies to expect on the selected night;
  - a run summary.
- **Placing pieces:** the spots where the selected piece fits are outlined. Day-time chevrons show the routes enemies will take. You can undo the last piece placed that day.
- **Inspecting:** hovering a tower opens a card with every block's HP, range, stack bonus, footing and combo.

### Blocks

- **Shapes:** each material has its own shape and face pattern. Stone is bevelled brick, crystal is glassy, ember is a brazier, ward is eight-sided, beacon is a lantern and rock is a boulder.
- **Stone foundations:** stone now has a job. A turret standing on stone or rock gets +1 range.
- **Stacks:** the emblem on top of a stack grows with the stack's height.
- **Visual cues:** beacons draw links to the turrets they power, overhangs get timber beams, and gilded blocks get a gold outline.
- **Combos:** there are 9 combos now (up from 3), and a star shows on any turret with an active combo.
- **Unique blocks:** there are 12 now (up from 6). The new ones are the Ballista, Spike Block, Wind Vane, Root Heart, Lodestone and Hourglass.

### Nights

- **New actions:** Pause, Rally (turrets fire twice as fast for 5 s, once a night), Shore up (+50% HP on one tower, once a night), and a Ranges toggle.
- **Topples:**
  - you earn +1 topple for every 15 kills;
  - aiming accounts for where enemies will be when the tower lands;
  - the counter glows when a topple would crush 3 or more enemies.
- **Atmosphere:**
  - weather you can see: rain, fog and a moon;
  - a night sky for each land;
  - gates where enemies spawn;
  - a boss intro with slow motion;
  - stronger turret effects;
  - a short "Night survived" moment before morning;
  - a flight scene between lands.

### Economy, map and meta

- **Gold sinks:** you can buy an extra piece or an extra demolish, and the emergency stone gets pricier each time. Interest moved into a Treasury Vault relic. Shops have a premium shelf, and relic prices rise in later acts.
- **Forge:** a new Temper option. Skipping the morning piece now also throws away a plain stone piece.
- **Choosing pieces:** morning pieces say what they add and which combos they would make with your bag.
- **The map:**
  - in act 2, every row of nights includes a hard one;
  - act 3 puts two shops before the final boss;
  - a brand-new player plays night 1 before seeing the map.
- **Starting bags:** each founder brings a signature unique block, and most bring a starting relic.
- **Saving and settings:**
  - the run saves on every visit to the map, and the title screen has Continue;
  - settings: sound and music volume, camera speed, reduce motion and a colour-blind palette;
  - generated music for day, night and bosses.
- **First run:** one-time coach notes, and How to play is renumbered and up to date.

## Known limits

- **Save point:** if you reload in the middle of a day, the run resumes from the last map visit, so that day's placements are lost.
- **Phone layout:** the inspect card only appears when hovering with a mouse, so phones don't get it. The map panel also hides the enemy preview and run summary on phones.
- **Music:** it's a simple generated loop, a placeholder until there's a real soundtrack.

## Balance

A bot played full runs against a frozen build in performance mode (`?debug&perf`, 10× night speed). It ran three styles (balanced, tall, wide), each with no workshop upgrades and with "mid" upgrades (about 9 ranks: Foundations 2, Treasury 2, Lens, Kiln, Leverage, Draughtsman, Masonry). The bot plays reasonably but not cleverly, so a good human should do better than these numbers.

**Targets.** Without upgrades, most runs end around nights 7 to 10 and wins are rare. With mid upgrades, 30–50% of runs are won. The three styles end within about 1.5 nights of each other, and no single night is a wall.

**Average night reached (12 = a win).**

| Upgrades | Style | Before | Round 1 | Round 2 | Round 3 | Final (round 4) |
|---|---|---|---|---|---|---|
| None | Balanced | 9.4 | 7.6 | 10.0 | 9.0 | 9.7 |
| None | Tall | 8.4 | 9.0 | 9.5 | 10.4 | 9.5 |
| None | Wide | 10.8 | 9.6 | 10.3 | 11.0 | 10.0 |
| Mid | Balanced | 9.0 | 9.2 | 10.7 | 10.5 | 10.8 |
| Mid | Tall | 9.6 | 10.0 | 11.0 | 11.1 | 10.7 |
| Mid | Wide | 10.8 | 10.4 | 11.8 | 11.6 | 11.7 |

**Wins in the final round:** 3 of 30 without upgrades (10%) and 13 of 30 with mid upgrades (43%). Rounds 1 to 3 used 5 to 8 runs per style; the final round used 10.

**What the bot found, and the fix for each.**

- **Fliers did most of the core damage, and walls can't stop them.**
  - Crystals 3 or more blocks up now deal +60% damage to flying enemies. This gives tall builds a clear job.
  - The base flier weight dropped from 1.4 to 1.2.
  - Wide fortresses (30+ cells) now draw more fliers, so sprawling isn't a free win.
- **Night 9 was a wall.** It comes straight after the second journey, which already cuts blocks off the island. The first night in a new land is now lighter: ×0.85 on night 5 and ×0.75 on night 9.
- **Late enemies outscaled every build.** Enemy HP growth went from 1.21× to 1.2× per night, and the multiplier cap from 2.6 to 2.4.
- **The workshop didn't move the needle.**
  - Foundations give +3 core HP per rank (was +2).
  - Lens Grinding and Kiln give +15% per rank (was +10%).
- **Tall builds died to bulwarks; wide builds won too often.**
  - Bulwarks still scale with the number of turrets, but more gently (+8% per turret, was +12%).
  - Garden income dropped from 2.5×√gardens to 1.85×√gardens.

**Still open.**

- Wide is still the strongest style with upgrades (7 of 10 wins), but only about 1 night ahead of the others.
- Nights 9 and 10 are still where most runs end. That's the start of the last act, so it's partly by design.
- With 10 runs per cell, a single result moves by about ±0.5 night, so small differences are noise.

## Round 2: a faster bench, a new tower, the heat ladder and a new map

### A balance bench that's about 1,000× faster

The old bot took about 2 minutes per run. The new bench (`npm run bench -- <experiment.json>`, see `tools/bench/README.md`) plays about 8 runs a second on 8 workers, so 1,320 runs take about 2.5 minutes.

| Change | Effect |
|---|---|
| Nights stepped synchronously at 1/30 s, game timers on a virtual clock, no frames | No real waiting at all |
| `?bench` headless mode: no sound, HUD, toasts or layout reads | 4× less work per run |
| Chrome without GPU compositing or GPU 2D canvas | Workers scale; before, they queued behind the GPU process with the CPU idle |
| Every random roll goes through `src/rng.ts`, which the bench seeds; previews use `peek()` | The same seed replays the same run exactly, on any worker |
| Balance knobs gathered in `src/tune.ts` and overridable per variant | A tweak needs no rebuild |
| Paired comparison against the first variant on the same seeds | 0.2-night differences show up with 120 pairs |
| Damage tracked by source | You can see which towers pull their weight |

### New tower: Arc

Arc fires chain lightning that hits one enemy, then jumps up to 3 times to the nearest unhit enemy. Each jump is weaker, and it can hit fliers. Its range is short and barely grows with height, so it suits low walls and wide builds, while crystals stay the tall, long-range answer to fliers. It also has two combos:

- **Static (Arc + ward):** each zap stuns ground enemies briefly.
- **Grounded (Arc + stone):** 2 more jumps.

Arc is in the starting pool and in the Settler and Sprawler bags, and the forge can temper it. It deals about 12% of all damage, against crystal 37%, ember 29% and topples 16%.

### Balance now (40 runs per cell)

| Upgrades | Balanced | Tall | Wide | Wins |
|---|---|---|---|---|
| None | 9.2 | 9.9 | 9.8 | 15% |
| Mid | 10.5 | 10.7 | 10.7 | 35% |

The three styles now end within 0.7 nights of each other, against about 1.5 before. The changes that did it:

- Crystals 3 or more blocks up hit fliers ×2 (was ×1.6), which lifted tall from 7% to 33% wins with mid upgrades.
- Big footprints draw a few more fliers.
- Gardens pay slightly less.

### Heat ladder (mid upgrades, 120 runs per level)

| Heat | New rule | Avg night | Step | Wins |
|---|---|---|---|---|
| 0 | none | 10.64 | | 35% |
| 1 | Enemies have +15% HP | 10.43 | −0.21 | 25% |
| 2 | 3 less gold and 3 less core HP at the start | 10.07 | −0.36 | 23% |
| 3 | Elites from night 2, three times as often | 9.59 | −0.48 | 10% |
| 4 | Act guardians have double HP | 9.56 | −0.03 | 10% |
| 5 | Treasure spots become events | 9.00 | −0.56 | 3% |
| 6 | Shops cost 25% more | 8.94 | −0.06 | 5% |
| 7 | Enemies move 15% faster | 8.22 | −0.72 | 3% |
| 8 | 5% more enemies every night | 7.87 | −0.35 | 1% |
| 9 | Fliers from night 1, 50% more often | 7.55 | −0.32 | 0% |
| 10 | The final boss gets back up once | 7.55 | 0 | 0% |

The first measurement showed that heats 3, 4 and 7 to 9 barely bit; "one topple fewer" even helped the bot, because its toppling knocks over its own towers. Those levels were replaced or strengthened, and each level now costs about 0.2 to 0.7 nights. Heats 4, 6 and 10 hardly show for the bot, because it rarely reaches the guardian or final boss in good shape and barely uses shops. They still matter to human players.

The bot stops winning from about heat 5. A player who plans should get much further, but whether heat 10 is winnable by a good player has to be checked by hand.

### The map

The act map is now a surveyor's chart on a desk (`src/chart.ts`):

- an inked parchment sheet with deckled edges, a lamp-lit desk with a flickering vignette, biome doodles, a compass and a title cartouche;
- red wax seals with danger notches and Roman night numbers for nights, and line-drawn stops;
- dotted trails ahead and the walked trail in red ink;
- a pawn that hops along while the new trail inks itself in;
- fog over the rows far ahead;
- the sheet unrolls when an act begins, and the view follows the pawn;
- the detail panel is a pinned note card with the same art, and the legend is a collapsible map key.
