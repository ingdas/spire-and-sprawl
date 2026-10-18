# Critic's playthrough and backlog

**How this was played:** a fresh save, played on desktop (1440×900) from the title screen to a defeat on night 9 of 12. I made every decision a first-time player would face: the map path, piece picks, shops, camps, forges and topples. I also played the opening on a phone (390×844). The evidence column refers to what I saw in that session.

## Verdict

The core idea holds up. Height against width is a real tension, and toppling a tower onto a crowd is the best moment in the game. The paper-and-stamp menus have character, and the motion pass makes the board feel physical.

Three things hold it back.

1. **The blocks don't read.** Stone, ward, rock and beacon are all pale cubes. At night everything turns the same blue-purple, so by act 2 the fortress is a pile of similar boxes. You can't tell at a glance what a tower does.
2. **The night is mostly watching.** Most of the night you watch, with only a couple of actions. Enemies are small, attacks are thin lines, and when the core takes damage the game doesn't say why. My run went from 8 HP to dead in one night, and I couldn't tell what had happened.
3. **The economy runs dry of choices.** By night 7 I had 134 gold and nothing worth buying. Gold piles up and stops mattering.

The rest is polish, and there's a lot of it. It's listed below.

**Priority:** P1 means fix before anyone else plays it, P2 means it makes the game noticeably better, and P3 is nice to have. **Size:** S is under an hour, M is an afternoon, and L is a day or more.

---

## A. Blocks and materials (the biggest gap)

| # | Problem (evidence) | Change | Pri | Size |
|---|---|---|---|---|
| ✅ 1 | Stone, ward, rock and beacon are all pale grey-beige cubes. In the day 7 screenshot I couldn't pick out the ward towers. | Give each material its own silhouette, not just a colour. Stone: chunky bevelled bricks. Ward: a rune-carved slab with a glowing seam. Beacon: a lantern cage. Rock: a rough, faceted boulder. Crystal: a faceted, glassy shell. Ember: a brazier with a grate. | P1 | M |
| ✅ 2 | At night every block turns blue-purple and crystal, stone and ward become one colour (nights 3–9). | Keep material colours at night: lighten the albedo or add a rim light, and give turret blocks an emissive glow (crystal cyan, ember orange, ward violet) so they're easiest to spot after dark. | P1 | S |
| ✅ 3 | Stone has no job except filler, so most pieces feel like dead draws. | Give stone a real role. For example, *stone under a turret adds +1 range* (a foundation), or *stone walls take half damage from chewing*. Then "stone pillar + crystal crown" becomes a recipe, not a compromise. | P1 | S |
| ✅ 4 | Only 3 combos exist (frost, sparks, smoke), and you only find them by hovering in the day. | Add a combo for every pair of turret and support blocks, around 8 in total. Show a small icon on the block when a combo is active, so combos read on the board itself. | P2 | M |
| ✅ 5 | Turret blocks don't look like turrets. Only a small gem or flame sits on top. | Make the emblem scale with the stacking bonus, and show the stack count as stripes on the side of the block. A 3-crystal stack should look clearly more powerful than 1. | P2 | S |
| ✅ 6 | Beacon and ward effects are invisible. You trust the tooltip. | Draw beacon links: a faint line from the beacon to each turret it boosts. Ward slow fields should shimmer on the ground at night. | P2 | S |
| ✅ 7 | Gilded pieces look like normal ones once they're placed. | Gilded blocks get gold trim edges on the board, not just in the card. | P3 | S |
| ✅ 8 | Unique blocks are rare, and only 6 exist. | Raise it to about 12 unique blocks and make a few common enough to build a run around: a *Siege Ballista* (long range, slow), a *Spike Pit* (floor trap), a *Wind Vane* (turns sandstorms into a weapon), a *Root Heart* (gardens spread). | P2 | L |
| ✅ 9 | Materials have no upgrade path inside a run. | Forge option: "Temper": all crystal blocks in the bag get +10% damage. That makes material choice a build commitment. | P3 | M |
| ✅ 10 | Overhanging blocks look like they're floating (the crystal pair over the core on night 4 read as a bug). | Draw supports: a timber strut or arch under overhangs, so hollows read as bridges and make Vaulted Arches legible. | P2 | M |
| ✅ 11 | Material colours are the only way to tell blocks apart, which fails for colour-blind players. | With item 1, every material gets a distinct face pattern. Add a colour-blind palette option. | P2 | S |

## B. Readability of the battle

| # | Problem (evidence) | Change | Pri | Size |
|---|---|---|---|---|
| ✅ 12 | Enemies are tiny next to the blocks, and shards look like the pink attack arrow and the floating rocks. | Scale enemies up about 30%, give each type an outline colour by threat tier, and recolour the attack arrows so they never share enemy colours. | P1 | S |
| ✅ 13 | Turret shots are hairlines. You can't see who is doing the work. | Thicker beams with a muzzle flash, shells with a trail, and hit sparks on enemies. Each turret type should have its own effect shape. | P1 | M |
| ✅ 14 | When the core loses HP there's no indication which enemy did it or from where (night 9: 8 HP gone, unexplained). | Arrow at the screen edge pointing to the hit direction, plus a floating "−2 Brute" at the core. The end screen lists *what dealt core damage* (the sim already tracks it per type). | P1 | S |
| ✅ 15 | You can't see where enemies will walk, which is the whole point of placing walls. | In the day, faintly animate the path from each attacking side to the core, based on the current board. It updates live as you place pieces. | P1 | M |
| ✅ 16 | Turret ranges are only visible when you hover in the day. | At night, holding a key (or the "eye" button on phones) shows all turret ranges and the slow fields. | P2 | S |
| ✅ 17 | Tall towers poke out behind the top bar (nights 3, 7 and 9), and the core gets hidden behind blocks (day 1, after building). | The camera auto-frames to keep the tallest tower and the core in view. When something blocks the core, show its outline through the blocks (x-ray). | P1 | M |
| ✅ 18 | Enemies off-screen or behind towers are invisible. | Edge-of-screen markers for off-screen enemies, and x-ray outlines for enemies behind blocks. | P2 | M |
| ✅ 19 | The burrowing wyrm is invisible while underground, and the boss bar just says "UNDERGROUND!". | Show a moving dirt ripple and crack trail on the ground while it tunnels, and a warning circle where it will come up. | P1 | S |
| ✅ 20 | Fog has no visual effect (night 7 fog looked identical to a clear night). Full moon has none either. | Fog: real volumetric-looking fog with turret ranges drawn shorter. Moon: a big moon in the sky and a silver tint. Storm: rain streaks and a dark sky. Each weather should change how the scene looks. | P2 | M |
| ✅ 21 | Biome identity disappears at night: Dunes, Glacier and Meadow nights all look the same purple. | Give each biome its own night palette (Dunes: deep teal and amber, Glacier: icy blue and white, Caldera: black and glowing red). | P2 | S |
| ✅ 22 | Enemy HP bars are small slivers. | Larger bars, and only on enemies that are damaged and near your towers. Boss and elite bars get their own style. | P3 | S |
| ✅ 23 | When a guardian arrives there's no build-up; it just walks in. | Guardian intro: the camera pans to the spawn side, a slow-motion beat, and a name card. Only the first time per run. | P2 | M |

## C. Night-time agency and pacing

| # | Problem (evidence) | Change | Pri | Size |
|---|---|---|---|---|
| ✅ 24 | The night is mostly watching. The only actions are one topple, a drop stone and changing the aim. | Add 1–2 more night actions you spend from a small per-night budget: *rally* (turrets near the click fire twice as fast for 3 s), *shore up* (+50% HP to one column), *recall* (cancel a topple charge for gold). | P1 | M |
| ✅ 25 | You get one topple a night, and it's the most fun thing in the game. | Rebuild topples per night: +1 topple for every 15 kills, so good defence pays out more toppling. | P2 | S |
| ✅ 26 | The topple preview counts enemies where they are when you click, but the crush lands 0.4 s later. | Aim the preview ahead: show where the enemies will be when the tower lands, as a ghost marker. | P2 | S |
| ✅ 27 | Drop stone costs 3 gold flat; at 134 gold that's free. | Cost goes up within a night (3, 5, 8, …) and the base cost rises each act. | P2 | S |
| ✅ 28 | Night speed resets to 1× every night. | Remember the chosen speed. Add an explicit pause button (and Esc/P to pause) with the board still inspectable while paused. | P1 | S |
| ✅ 29 | Nights end abruptly and cut to the morning sheet. | A short "Night survived" moment: a dawn light sweep and a tally (enemies, damage taken, best topple), then the sheet. | P2 | S |
| ✅ 30 | Night 1 is trivial (6 shards). Bounty nights can double the count (night 7: 42 enemies). | Smooth the curve. Night 1 should teach one thing (a wall). Cap bounty at +30% enemies but give elites; show the difficulty on the map node (item 39). | P1 | S |
| ✅ 31 | Enemy spawns have no source, they just appear at the edge. | Spawn gates on each attacking side: a portal or tear that opens at dusk and closes when the wave is done. | P3 | M |

## D. Economy and decisions

| # | Problem (evidence) | Change | Pri | Size |
|---|---|---|---|---|
| ✅ 32 | Gold piles up: 80 by day 7 and 134 by night 7, with nothing to spend it on between shops. | Add gold sinks you can use any day: buy one extra piece for the day (cost rising per use), a paid reroll of the hand, and a paid extra demolish. | P1 | M |
| ✅ 33 | Shop prices don't scale with how much gold you have, and relic prices only rise by +3 per relic owned. | Prices scale by act, and each act's shop gets a *premium* row (rare relics or unique blocks at 20–30 gold). | P2 | S |
| ✅ 34 | Interest (+1 per 10, max 3) hardly matters once gold piles up. | Remove interest, or turn it into a relic ("Treasury Vault"). The baseline should push you to spend. | P2 | S |
| ✅ 35 | The morning piece pick has no information except shape and material. | Show what the piece *adds*: "+1 crystal turret", "+3 wall", and a mini "fits your build" note if it makes a combo with blocks you already own. | P2 | M |
| ✅ 36 | "Skip: take 2 gold" is never worth it. | Make skipping meaningful: *skip = the bag shrinks* (removes a random stone piece), or skipping gives 1 seal. | P3 | S |
| ✅ 37 | With no cap on bag size, decks bloat (21 pieces by night 9), so good pieces come up rarely. | Hand quality matters: show the bag's composition (material counts) on the bag button, and offer more ways to remove pieces. | P2 | S |

## E. The map

| # | Problem (evidence) | Change | Pri | Size |
|---|---|---|---|---|
| ✅ 38 | **It's not clear where you are on the map.** The current spot only has a thin red ring, and nothing marks "you are here". | Put a small island token on the current node, and draw the walked path as a bold solid line. Grey out everything you can no longer reach. | P1 | S |
| ✅ 39 | Night squares use cryptic icons (◎ ◇ ■ ☁), but the legend only explains "☾ Night". | Show each night type in the legend, plus a difficulty chip on the node (1–3 skulls) and the reward chip (+10 g, relic). | P1 | S |
| ✅ 40 | Weather badges on nodes are tiny glyphs (◐ ≈ ϟ) with no explanation. | A larger badge, and the selected node's info panel explains the weather's effect. | P2 | S |
| ✅ 41 | The map is the first thing a brand-new player sees, before they've played a single night. | Skip the map for night 1 on a player's first run. Show the map after the first morning, with a one-line coach mark. | P1 | S |
| ✅ 42 | The right side of the map screen is empty space on desktop. | Use it: the run so far (relics, bag summary, core HP trend) and a preview of tonight's enemies for a selected night. | P2 | S |
| ✅ 43 | Every act has exactly the same row structure. | Vary it by act: act 2 has an elite fork, act 3 a double-shop row. Add rare hidden nodes (`?` that is a battle or a treasure). | P3 | M |
| ✅ 44 | Choosing a node moves you instantly. | Animate the token travelling along the edge before entering the stop. | P3 | S |

## F. HUD, menus and clarity

| # | Problem (evidence) | Change | Pri | Size |
|---|---|---|---|---|
| ✅ 45 | Relics are a column of abstract icons on the right (10 by night 9), and you can't tell what they are without hovering. | Hover or tap shows a name list, and a "relics" panel on long-press. Icons need distinct colours by category. | P1 | S |
| ✅ 46 | The threat panel's roster is a plain list (7 types on night 9) that doesn't rank danger. | Sort by danger, mark the enemies that counter your build ("counters tall!"), and collapse shards into "+15 small". | P2 | S |
| ✅ 47 | The tooltip got stuck in the top-left corner when a sheet opened (Morning, night 1). | Hide the tooltip whenever a sheet opens, and position it near the hovered element if the mouse hasn't moved. | P1 | S |
| ✅ 48 | The attack arrow on the east side sits under the "Start night" stamp (day 1). | Move the stamp clear of the island, or move the arrows outward so they never overlap the HUD. | P2 | S |
| ✅ 49 | The "DAY" banner covers the middle of the board, right where you're about to build, and floating rocks pass through it. | Smaller banner near the top, behind the HUD layer, and hide the decorative rocks in front of the banner. | P2 | S |
| ✅ 50 | Played cards stay as ghostly 40% cards over the board. | Played cards slide away completely, and the hand compacts. | P2 | S |
| ✅ 51 | Hand drawings are small inside large cards, and long names wrap ("Crystal-crowned pillar"). | Bigger drawings and shorter names ("Crystal Pillar"). Put the material chips on the drawing, not below it. | P3 | S |
| ✅ 52 | "Topples left: 1", the key night resource, is a tiny label above the buttons. | Make topples a big counter in the action bar that pulses when a topple would crush 3+ enemies. | P1 | S |
| ✅ 53 | The words for your base keep changing: "settlement", "fortress", "island" and "core". | Pick one: "fortress" for what you build, "core" for the gem. Fix "Must connect to your settlement". | P2 | S |
| ✅ 54 | The night hint "Drag to look around · F for speed" is noise mid-battle. | At night the hint gives tactical tips instead ("3 enemies under the crystal tower: topple!"), or disappears. | P3 | S |
| ✅ 55 | At dawn the threat panel briefly shows last night's wave as "Tonight" (dawn after night 8). | Hide or clear the threat panel the moment the night ends. | P2 | S |
| ✅ 56 | Top-bar labels are 8.5 px and low-contrast in the dawn and night palette. | Raise the minimum HUD text size to 11 px and check contrast in all three palettes. | P2 | S |
| ✅ 57 | Inspect info shows up as one line of hint text at the bottom. | A small inspect card next to the hovered tower: material stack, range, damage, combos, HP. | P2 | M |
| ✅ 58 | Valid placement spots aren't shown. You only find out by hovering ("Must connect"). | While a piece is selected, faintly outline the cells where it can go. | P1 | S |
| ✅ 59 | No undo, so one misclick costs a piece for the day. | Undo the last placement (once per day, or until the night starts). | P1 | S |

## G. Onboarding and meta

| # | Problem (evidence) | Change | Pri | Size |
|---|---|---|---|---|
| ✅ 60 | How to play is a wall of text, and its numbering jumps around (1, 2, 3, 4, ✦, ◎, ★, ✈, 5, 6, …). | Replace it with a guided first run: day 1 teaches placing, night 1 teaches walls, day 2 teaches height, night 2 teaches topple. Keep How to play as a picture glossary. | P1 | L |
| ✅ 61 | The title screen covers its own 3D demo, and "0 ✠ to spend" uses a glyph nobody knows yet. | A smaller title card on the side so the island shows. Label it "Seals ✠" until the player has earned some. | P3 | S |
| ✅ 62 | The defeat screen doesn't say why you lost. | Add "What hurt you": core damage by enemy type, plus the night it happened, and a snapshot of your final fortress. | P1 | S |
| ✅ 63 | Runs can't be resumed: closing the tab loses the run. | Autosave at every morning (run state to localStorage), and a "Continue" option on the title. | P1 | M |
| ✅ 64 | No settings: volume, music, camera speed, reduced motion and the default night speed can't be changed. | A settings sheet on the title screen and the pause menu. | P2 | M |
| ✅ 65 | There's no music, only sound effects. | Day and night music tracks that crossfade at dusk, plus a boss layer. | P2 | M |
| ✅ 66 | Journeys are just a sheet of text, even though the island flies to a new land. | A 3-second cutscene: the camera pulls back, the island lifts and clouds rush past, then it lands in the new biome's colours. | P2 | M |
| ✅ 67 | Only 5 founders, and the first is forced on a new player. | Make founder differences bigger: each has a starting relic and a signature unique block. | P3 | M |
| ✅ 68 | Portrait phone framing cuts off the island's sides, and the top bar drops Tallest and Area, which matter for tall vs wide. | Zoom the portrait camera out to fit, and show Tallest and Area as small chips under the top bar. | P1 | S |
| ✅ 69 | On phones the hand and actions take a third of the screen, and the night buttons wrap to two rows. | A single-row night bar with icon buttons, and a collapsible hand that can be swiped down. | P2 | M |

---

## Suggested order

1. **Make the board readable (P1, mostly small):** 2, 12, 14, 17, 19, 38, 39, 45, 47, 52, 58, 59, 62, 68.
2. **Give blocks an identity:** 1, 3, 5, 6, 10, 11.
3. **Fix the economy and the nights:** 15, 24, 28, 30, 32, 41.
4. **Make it feel finished:** 13, 20, 21, 23, 29, 60, 63, 65, 66.
5. **Add depth later:** 4, 8, 9, 33–37, 42–44, 67.
