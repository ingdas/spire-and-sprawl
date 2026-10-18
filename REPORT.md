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

See the balancing section below. It's filled in after the balancing run.
