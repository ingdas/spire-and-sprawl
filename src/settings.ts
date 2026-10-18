/** Player settings, kept in local storage. */
export interface Settings { sfx: number; music: number; camSpeed: number; reduceMotion: boolean; colorBlind: boolean }

const KEY = 'spire-sprawl-settings';
const DEFAULTS: Settings = { sfx: 1, music: 0.5, camSpeed: 1, reduceMotion: false, colorBlind: false };

export function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* fine */ }
}
