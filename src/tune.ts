// Balance knobs in one place. Game code reads them at use time, so a debug build can change them live:
// ?tune={"enemyHpGrowth":1.22} in the URL, or window.game.tune.enemyHpGrowth = 1.22 from a balance bot.

export const TUNE = {
  // ---- waves ----
  /** enemy HP multiplies by this every night */
  enemyHpGrowth: 1.2,
  /** extra HP ramp from night 3 (+30%/night), capped here */
  enemyHpCap: 2.4,
  /** wave budget = 2 + night * linear + night² * quad */
  budgetLinear: 3.5,
  budgetQuad: 0.6,
  /** guardian nights keep this share of the regular wave */
  guardianNightBudget: 0.6,
  /** the first night in a new land is lighter (nights 5 and 9) */
  landingNight5: 0.85,
  landingNight9: 0.75,
  /** base spawn weights */
  weights: { shard: 3, runner: 2, flier: 1.2, brute: 0.7, sapper: 0.8, climber: 0.5, bomber: 0.45, bulwark: 0.35 } as Record<string, number>,
  /** extra fliers per footprint cell above 29 */
  flierPerCell: 0.07,
  /** extra bulwarks per turret above 7 */
  bulwarkPerTurret: 0.08,

  // ---- towers ----
  /** crystals at this height or higher hit fliers harder */
  highAA: 3,
  highAAMult: 2,
  /** flat damage multipliers per turret type */
  dmg: { crystal: 1, ember: 1, arc: 1 } as Record<string, number>,

  // ---- economy ----
  startGold: 4,
  startCoreHp: 15,
  /** garden gold each dawn = gardenGold * sqrt(gardens) */
  gardenGold: 1.7,
  campHeal: 6,
  killsPerTopple: 15,

  // ---- heat ----
  heatEnemyHp: 1.15,
  /** heat 3: elites from night 2, this many times as often */
  heatElites: 3,
  heatGuardianHp: 2,
  heatPrices: 1.25,
  /** heat 7: enemy speed multiplier */
  heatSpeed: 1.15,
  /** heat 8: more enemies every night */
  heatBudget: 1.05,
  /** heat 9: fliers from night 1, this much more often */
  heatFliers: 1.5,
  heatBossRise: 0.5,
};

export type Tune = typeof TUNE;

// debug builds may override knobs from the URL
try {
  const q = new URLSearchParams(location.search);
  const raw = q.has('debug') || import.meta.env.DEV ? q.get('tune') : null;
  if (raw) applyTune(JSON.parse(raw));
} catch { /* bad JSON: keep the defaults */ }

/** Merge overrides into TUNE (one level deep for the tables). */
export function applyTune(over: Partial<Record<keyof Tune, unknown>>) {
  for (const [k, v] of Object.entries(over)) {
    const cur = (TUNE as Record<string, unknown>)[k];
    if (cur && typeof cur === 'object' && v && typeof v === 'object') Object.assign(cur, v);
    else (TUNE as Record<string, unknown>)[k] = v;
  }
}
