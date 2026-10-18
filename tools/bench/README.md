# Balance bench

A heuristic bot plays whole runs in headless Chrome, fast. 1,000 runs take about two minutes on an 8-worker machine.

```
npm run bench -- tools/bench/experiments/baseline.json
```

The bench builds the game into a private folder first, so you can keep editing the source while it runs. Raw results go to `tools/bench/results/<name>.jsonl`, which git ignores, and a summary is printed at the end. To print the summary again later, run `node tools/bench/summary.mjs tools/bench/results/<name>.jsonl`.

## Experiment files

```json
{
  "name": "styles",
  "runs": 40,
  "metas": ["none", "mid"],
  "heats": [0],
  "styles": ["balanced", "tall", "wide"],
  "workers": 8,
  "variants": {
    "base": {},
    "tougher": { "enemyHpGrowth": 1.22 },
    "arc-up": { "dmg": { "arc": 1.15 } }
  }
}
```

Every combination of variant × meta × heat × style × run is one job. Unlisted fields fall back to defaults.

| Field | Meaning |
|---|---|
| `variants` | Overrides for the knobs in `src/tune.ts`, applied live with no rebuild. Tables such as `dmg` and `weights` merge one level deep. |
| `metas` | Workshop upgrades: `none`, `mid` (about 9 ranks) or `high`. |
| `heats` | Heat levels to play. |
| `runs` | Runs per cell. Run *i* uses seed `seed * 1000 + i`, so every variant faces the same seeds. |
| `workers` | Parallel browsers. 8 is the sweet spot on a 20-thread machine; more doesn't help. |
| `founder` | Starting bag (default `settler`). |
| `args` | Extra Chrome flags. |

## Reading the summary

- **avg night ±SE:** the night reached, where 12 means a win, with its standard error.
- **wins:** the win rate.
- **core lost/run:** the two nights that cost the core the most HP, per run.
- **damage split (`| …`):** how damage is shared between sources: turret materials, `topple`, `core` (the core's own pulse) and `unique`.
- **paired vs "first variant":** each run compared against the same seed under the first variant. This removes most of the luck, so differences of about 0.2 nights are already visible with 120 pairs. Use paired numbers to decide between tweaks.

## Why it's fast and repeatable

- Nights are stepped synchronously inside the page, at a fixed 1/30 s step.
- Game timers run on a virtual clock, and frames are switched off, so nothing is drawn.
- `?bench` (the `HEADLESS` flag in `src/settings.ts`) turns off sound, the HUD, toasts and the layout reads the game uses for animation.
- Chrome runs without GPU compositing or GPU 2D canvas. With either on, all the browsers queue behind a GPU process and the CPU sits idle.
- All game randomness goes through `src/rng.ts`, which the bench seeds. Previews such as the map's "Expect about" panel use `peek()`, so looking at something never changes the dice.
- Every run starts in a freshly loaded page, so nothing leaks between runs: a seed always replays the same run.

## Changing the bot

The bot lives in `bot.mjs` and has three policies:

- `placeAll` places the day's pieces, scored per style;
- `dawn` picks rewards, map nodes, shops and camps;
- `nightPolicy` decides on Rally, Shore up and topples.

Remember that it's a decent player, not a good one. A human who plans should beat its numbers.
