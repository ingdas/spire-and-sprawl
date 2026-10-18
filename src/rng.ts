// Game dice: everything that can change an outcome rolls here, never Math.random directly.
// Normally this is just Math.random. The balance bench seeds it so a run replays exactly,
// which three.js (it rolls Math.random for its own ids) would otherwise disturb.

let seeded: (() => number) | null = null;
/** how many seeded rolls so far (the bench uses it to find where two runs part ways) */
export const rolls = { n: 0 };

export function rand() {
  if (!seeded) return Math.random();
  rolls.n++;
  return seeded();
}

/** Seed the dice (mulberry32), or pass null to go back to Math.random. */
export function seedRandom(seed: number | null) {
  if (seed === null) { seeded = null; return; }
  let s = seed >>> 0 || 1;
  seeded = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run fn on throwaway dice (Math.random), e.g. for previews, so looking never changes what happens. */
export function peek<T>(fn: () => T): T {
  const keep = seeded;
  seeded = null;
  try { return fn(); } finally { seeded = keep; }
}
