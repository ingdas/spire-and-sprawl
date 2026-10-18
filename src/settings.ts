/** Player settings, kept in local storage. */
export interface Settings { sfx: number; music: number; camSpeed: number; reduceMotion: boolean; colorBlind: boolean; perf: boolean }

const KEY = 'spire-sprawl-settings';
const DEFAULTS: Settings = { sfx: 1, music: 0.5, camSpeed: 1, reduceMotion: false, colorBlind: false, perf: false };

export function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* fine */ }
}

/**
 * Performance mode: low resolution, no shadows or effects, rare redraws and very fast nights.
 * Meant for balancing runs and weak machines. On with ?perf in the URL or the setting (after a reload).
 */
export const PERF = location.search.includes('perf') || loadSettings().perf;

/**
 * Headless mode for the balance bench (?bench): no sound, no HUD, hints or toasts. Only the game
 * logic and the overlay sheets (which the bot clicks through) still run.
 */
export const HEADLESS = location.search.includes('bench');
