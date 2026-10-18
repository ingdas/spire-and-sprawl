# Brief: expand Heat levels

## Goal
The player asked for "heat" levels that make the game harder. A basic version already exists, but it's easy to miss and only has 5 levels. Turn it into a proper, visible difficulty ladder that a player who has won the game wants to climb.

## What exists today (read these first)

**`src/meta.ts`**

| Name | What it is |
|---|---|
| `HEATS: string[]` | Five rule texts. Each level adds its rule on top of the ones below it. |
| `Meta.heatWon` | The highest level won. It is saved, and `-1` means no win yet. |
| `Meta.heat` | The level chosen for this session. It is not saved. |
| `maxHeat()` | Returns `heatWon + 1`, capped at the number of levels. |

**`src/game.ts`**

- **`showFounders()`:** draws the Heat chip row (`.heat` and `.chip`) above the starting-bag cards. The row only appears once `maxHeat() > 0`, i.e. after a first win.
- **`startRun()`:** copies `meta.heat` into `run.heat` and applies level 2 (−3 gold, −3 core HP).
- **`endRun()`:** adds a seal bonus of +20% per level and raises `heatWon` after a win.
- **The map:** `makeMap(..., { treasure: run.heat < 5 })` applies level 5.

**`src/sim.ts`, in `spawn()`:**

| Level | Rule | Where in `spawn()` |
|---|---|---|
| 1 | Enemies get +20% HP | `heat >= 1` |
| 3 | Elites come from night 2, at double the rate | `heat >= 3` |
| 4 | Bosses get +50% HP | `heat >= 4` |

## What to build

1. **About 10 levels, each with one clear rule a 14-year-old can understand.** Keep the existing 5. Candidate rules that use systems added recently:
   - The emergency stone costs more, Rally and Shore up are lost, or you get one topple fewer.
   - Map: every battle row has at least one danger-3 night (see `DANGER` in `src/map.ts`), or there's one camp fewer per act.
   - Enemies chew 25% faster (`def.chew`), or fliers come a night earlier (`minNight`).
   - The journey cap drops from 10 to 8 (`JOURNEY_MAX_H` in `game.ts`), or more rim is lost.
   - Shops cost +25%, or there are no premium shelves.
   - The final boss has an extra phase (it's the `boss` enemy in `config.ts` and `sim.ts`).
2. **Make heat visible:**
   - show the heat level in the top bar during a run;
   - add a heat badge on the title screen and the end screen;
   - mention it in How to play;
   - on the starting-bag screen, show the new rule for the selected level in bold and the earlier ones greyed out.
3. **Unlock flow:** keep "win at level N to unlock N+1". Remember the chosen level across sessions by saving `Meta.heat`, and migrate old saves.
4. **Rewards:** keep +20% seals per level. Consider a small cosmetic marker per level beaten, for example a coloured flag on the core. Don't add new progression systems.

## Constraints and conventions

- **Read first:** `README.md`, `REVIEW_BACKLOG.md` and `REPORT.md`.
- **Language:** plain words throughout; the audience is around 14 years old.
- **Motion:** every new UI element animates in and out. Nothing just appears; there's a `fade()` helper and the `.anim-in` / `.anim-out` CSS.
- **Editing on Windows:** use the Edit tool, or Python with `newline=''`, and normalise CRLF line endings before matching. Don't use PowerShell `Get-Content`/`Set-Content` on the sources (see the memory note on Windows text-editing pitfalls).
- **Checks:** `npx tsc --noEmit` must stay clean. Commit per logical step on branch `cel-shaded-roguelite-game`.

## How to verify

- **Balance bot:** `bal2.mjs` lives in the session scratchpad. If it's gone, copy the approach: playwright-core with system Chrome and `?debug`, driving `window.game`. Run it against a frozen build (`vite build --outDir <dir>`, then `vite preview --port 5200`).
- **Performance mode:** add `?perf` to the URL to skip most rendering and allow 10× / 30× night speed (see README).
- **Targets:** every heat level should still be winnable by a good player. Each step should cost a mid-upgrade bot roughly 0.5 to 1 night of average survival. Report the curve in `REPORT.md`.
