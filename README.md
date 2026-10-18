# Spire & Sprawl

A cel-shaded 3D roguelite about building **tall or wide**. You drop polycube pieces onto a floating island to defend a core across 12 nights and 3 lands. Built with Three.js; everything is procedural geometry, and the only bundled assets are two fonts.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static HTML5 export in dist/
npm run preview  # serve the built export
```

`dist/` is a self-contained static site (fonts are bundled, so it works offline). Zip it and upload it to itch.io (or any static host) as an HTML5 game. Browsers block ES modules on `file://`, so open it through a web server. On phones it goes fullscreen when you press Play, and browser gestures (zoom, pull-to-refresh, text selection, long-press menus) are switched off so it plays like an app.

## The loop

- **Day:** draw 4 pieces and place them. A piece lands on whatever is under it, so stacking builds up and spreading claims ground. You can **keep** one piece for tomorrow, **demolish** 2 blocks, and starting the night early pays +1 gold per unused piece.
- **Night:** enemies come from the red sides and chew the *bottom* of your columns. Click a tower to **topple** it: it falls in a line and crushes everything it lands on, and if it hits another tower that one falls too. In an emergency you can drop a stone block for 3 gold. The Aim setting picks what turrets shoot first.
- **Dawn:** collect gold (with interest on savings), take a free piece (sometimes gilded or unique), shop for relics and pieces, forge a piece, patch walls, upgrade the core pulse, and **pick tonight's contract** for more risk and more reward. Some mornings bring a small event.

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

**Topple landings** depend on the material: ember splashes fire, crystal shatters, ward leaves a slow field, garden drops gold.

## Design language: The Surveyor's Folio (simplified)

Every UI surface is a sheet of paper on the drafting table, kept simple enough for a 14-year-old to read at a glance:

- sheets, not panels;
- two inks (graphite, plus red only for costs and danger);
- plain words, one job per sheet;
- the main action is a rubber stamp;
- vellum by day, blueprint by night.

Type is Big Shoulders Display for headings and Rubik for text.

## Meta progression

- **Seals and the Workshop.** Every run pays seals, win or lose. Spend them in the Workshop on 13 permanent upgrade tracks; some stay locked until a challenge is done.
- **Challenges.** 14 challenges, each asking you to play a different way. They unlock relics, founders and workshop tracks.
- **Heat.** After a win, Heat levels add stacking difficulty for +20% seals per level.

## Code map

| File | What it holds |
|---|---|
| `src/config.ts` | Tuning: materials, unique blocks, turrets, enemies, guardians |
| `src/biomes.ts` | Biomes, route, act helpers |
| `src/pieces.ts` | Polycube shapes, generation, founders, card drawings |
| `src/board.ts` | Column stacking, collapse, topple, journey damage, exposure, flow field |
| `src/sim.ts` | Night simulation: turrets, reactions, enemies, guardians, weather, hazards; plus waves and contracts |
| `src/render.ts` | Toon shading, outlines, effects, picking |
| `src/meta.ts` | Relics, challenges, workshop, heat, save data |
| `src/ui.ts` | Paper UI components |
| `src/game.ts` | State machine, HUD, screens, input |
| `src/audio.ts` | WebAudio synth sound effects |

See `BACKLOG.md` for the 30-item gameplay backlog and its status.
