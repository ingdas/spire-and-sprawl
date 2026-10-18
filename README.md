# Spire & Sprawl

A cel-shaded 3D roguelite about building **tall or wide**. You drop polycube pieces onto a floating island to defend a core across 12 nights and 3 lands. Built with Three.js; everything is procedural geometry, and the only bundled assets are two fonts.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static HTML5 export in dist/
npm run preview  # serve the built export
npm run bench -- tools/bench/experiments/baseline.json   # balance bench, see tools/bench/README.md
```

**Balancing:** the bench plays about 8 runs a second, headless and seeded. Balance numbers live in `src/tune.ts`, and experiment files can override them per variant without a rebuild. See `tools/bench/README.md`.

**Performance mode:** add `?perf` to the URL, or turn it on in Settings and reload. It switches to low resolution with no shadows or effects, and redraws about 4 times a second. The night-speed button also gets 1× / 3× / 10× / 30× steps. Use it for balancing runs (`?debug&perf` exposes `window.game` to scripts) or on weak machines. A small badge in the corner shows when it's on.

`dist/` is a self-contained static site (fonts are bundled, so it works offline). Zip it and upload it to itch.io (or any static host) as an HTML5 game. Browsers block ES modules on `file://`, so open it through a web server. On phones it goes fullscreen when you press Play, and browser gestures (zoom, pull-to-refresh, text selection, long-press menus) are switched off so it plays like an app.

## The loop

- **Day:** draw 4 pieces and place them. A piece lands on whatever is under it, so stacking builds up and spreading claims ground. You can **keep** one piece for tomorrow, **demolish** 2 blocks, and starting the night early pays +1 gold per unused piece.
- **Night:** enemies come from the red sides and chew the *bottom* of your columns. Click a tower to **topple** it: it falls in a line and crushes everything it lands on, and if it hits another tower that one falls too. In an emergency you can drop a stone block for 3 gold. The Aim setting picks what turrets shoot first.
- **Morning:** collect gold (with interest on savings) and pick one free piece (sometimes gilded or unique). Sky raids also give a relic.
- **Map:** each act is a branching map, read from bottom to top. Red squares are nights and show the night's type (normal, quiet, bounty, sky raid, siege) and weather, so harder nights are a choice. Between nights are stops, and each stop does one thing:

  | Stop | What it does |
  |---|---|
  | Shop | Relics, pieces, core repair, remove a piece |
  | Camp | Heal the core, mend every block, or raise the core pulse |
  | Forge | Gild or transmute a piece, or throw one away |
  | Treasure | 1 of 3 relics |
  | Rare block | 1 of 2 unique blocks |
  | Mystery | An event |

  Every act has at least one shop, one rare block and one treasure, and a camp sits right before the boss. Tap any spot to read it.

## Acts and biomes

A run is 3 acts of 4 nights. Each act ends with a guardian:

| Night | Guardian |
|---|---|
| 4 | Burrowing Wyrm (tunnels under walls) |
| 8 | Sky Leviathan (rips the tops off towers) |
| 12 | The Dodecarch |

After nights 4 and 8 the island flies to a new land. On the way the rim breaks off and towers over 10 lose their tops.

| Biome | Rules |
|---|---|
| Meadow | No special rules |
| Dunes | Sandstorms knock the top block off tall towers unless it's stone; gardens earn half; rock outcrops |
| Glacier | Ground blocks +50% HP; enemies 25% faster; crystals +1 range |
| Caldera | Lava vents blast column bases; ember turrets +50% damage |

Weather (fog, thunderstorm, full moon) can roll on any non-guardian night.

## Height vs. width

| | Tall | Wide |
|---|---|---|
| Gives | Turret range, anti-air, stacking bonus (+25% per same-material block below), topple power | Garden gold, walls everywhere |
| Punished by | Sappers, Bombers, sandstorms, lightning, the journey's height cap | Brutes, Climbers (walk over walls), the journey's rim loss |

## Materials

| Kind | Material | What it does |
|---|---|---|
| Basic | Stone | Filler |
| Basic | Garden | Earns gold |
| Basic | Crystal | Beam turret; can hit fliers when raised |
| Basic | Ember | Splash turret |
| Basic | Ward | Slows enemies |
| Basic | Arc | Chain lightning: jumps between up to 3 nearby enemies, fliers too. Short range, so it suits low walls |
| Basic | Beacon | Damage buff |
| Basic | Rock | Terrain |
| Unique | Anvil | Crushes harder when it falls |
| Unique | Bell | Stuns nearby enemies |
| Unique | Powder Keg | Explodes |
| Unique | Omen Stone | Nearby enemies take +50% damage |
| Unique | Fountain | Repairs nearby blocks |
| Unique | Mirror | Faster crystals |

**Combos** between touching blocks:

| Combo | Effect |
|---|---|
| Crystal + ward | Frost beams |
| Crystal + ember | Spark beams |
| Ember + garden | Smoke shells |
| Arc + ward | Static: zaps stun for a moment |
| Arc + stone | Grounded: 2 more jumps |

**Topple landings** depend on the material: ember splashes fire, crystal shatters, ward leaves a slow field, garden drops gold.

## Design language: The Surveyor's Folio (simplified)

Every UI surface is a sheet of paper on the drafting table, kept simple enough for a 14-year-old to read at a glance:

- sheets, not panels;
- two inks (graphite, plus red only for costs and danger);
- plain words, one job per sheet;
- the main action is a rubber stamp;
- vellum by day, blueprint by night.

Type is Big Shoulders Display for headings and Rubik for text.

## Motion

Nothing just appears.

- **Blocks:** they fall with gravity, stretch while falling, squash on landing and settle on a spring.
- **Toppled towers:** they swing around their base edge as one rigid piece. The crush happens when the tower lands (`TOPPLE_SWING`). Blocks that tip past the island edge drop away into the sky.
- **Destroyed blocks:** they swell for a beat before bursting.
- **Enemies:** they pop up out of the ground and hop with squash on every step. They flinch when hit, and stretch upward before they burst. A white chip trails the HP bar.
- **Turrets:** they recoil when they fire.
- **Sheets:** they slide in and deal their cards with a little overshoot, and lift off before they leave. Re-rendering the same sheet only pops what changed.
- **Numbers:** gold and HP count up or down.
- **Hand:** cards are dealt in, and played cards fly off.
- **Leaving, as well as arriving:**
  - The placement ghost fades in and out, and spins when you rotate.
  - Range rings, attack arrows, lava vents and covered emblems shrink away.
  - A new run clears the old board in a ripple from the centre.
  - New lands and day/night tween both the island and the sky (the sky colours are typed `@property`s).
- **HUD:** panels slide in from their own edge, and slide back out when a sheet opens or the phase changes. The old action buttons drop away while the new ones rise. The hint crossfades, new relics pop in, and dialogs and banners fade out instead of being cut off.
- **Reduced motion:** `prefers-reduced-motion` turns off the menu and HUD animations.

## Meta progression

- **Seals and the Workshop.** Every run pays seals, win or lose. Put them into 13 upgrade tracks in the Workshop; some stay locked until a challenge is done. Upgrades can be refunded in full at any time between runs (one rank, or everything), so you can try different builds.
- **Challenges.** 14 challenges, each asking you to play a different way. They unlock relics, founders and workshop tracks.
- **Heat.** After a win you can raise the heat (0–10) on the starting-bag screen. Each level adds one rule on top of the ones below it and pays +20% seals. Win at a level to unlock the next; the chosen level is remembered, shows in the top bar, and every level beaten adds a flag to the core.

  | Heat | Rule |
  |---|---|
  | 1 | Enemies have +15% HP |
  | 2 | Start with 3 less gold and 3 less core HP |
  | 3 | Elites from night 2, three times as often |
  | 4 | Act guardians have double HP |
  | 5 | Treasure spots become events |
  | 6 | Shops, relics and the premium shelf cost 25% more |
  | 7 | Enemies move 15% faster |
  | 8 | Every night brings 5% more enemies |
  | 9 | Fliers come from the first night, and 50% more often |
  | 10 | The final boss gets back up once with half HP |

## Code map

| File | What it holds |
|---|---|
| `src/config.ts` | Materials, unique blocks, turrets, enemies, guardians |
| `src/tune.ts` | Balance knobs (waves, tower damage, economy, heat), overridable live for the bench |
| `src/rng.ts` | Game dice: seedable, plus `peek()` for previews that must not move the dice |
| `src/biomes.ts` | Biomes, route, act helpers |
| `src/map.ts` | Act map generation: rows, lanes, stops, night types |
| `src/pieces.ts` | Polycube shapes, generation, founders, card drawings |
| `src/board.ts` | Column stacking, collapse, topple, journey damage, exposure, flow field |
| `src/sim.ts` | Night simulation: turrets, reactions, enemies, guardians, weather, hazards; plus waves and contracts |
| `src/render.ts` | Toon shading, outlines, effects, picking |
| `src/meta.ts` | Relics, challenges, workshop, heat, save data |
| `src/ui.ts` | Paper UI components |
| `src/game.ts` | State machine, HUD, screens, input |
| `src/audio.ts` | WebAudio synth sound effects |
| `tools/bench/` | Balance bench: headless bot, experiments, summaries |

See `BACKLOG.md` for the 30-item gameplay backlog and its status.
