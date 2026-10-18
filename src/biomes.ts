// Biomes: a run is three acts, and between acts the whole island is carried somewhere new.
import { CORE, N } from './config';
import { rand } from './rng';

export type BiomeId = 'meadow' | 'dunes' | 'glacier' | 'caldera';

export interface BiomeDef {
  id: BiomeId;
  name: string;
  tagline: string;
  /** Plain-language rule cards shown on arrival: [icon, text]. */
  rules: [string, string][];
  tiles: [number, number];
  cliff: number;
  rock: number;
  sky: [string, string];
  // rule knobs
  gardenMult: number;
  enemySpeed: number;
  crystalRange: number;
  emberMult: number;
  groundHp: number; // HP multiplier for blocks on the ground
  gusts: boolean; // sandstorm gusts shear the tops off tall towers
  vents: number; // lava vents that erupt during the night
  outcrops: number; // rock clusters placed on arrival
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  meadow: {
    id: 'meadow', name: 'Meadow', tagline: 'Soft grass and calm skies.',
    rules: [['☘', 'No special rules. Learn the basics here.']],
    tiles: [0xb9d98f, 0xa9cf83], cliff: 0xc99a6b, rock: 0x8c6a55, sky: ['#bfe7f3', '#fbe9c9'],
    gardenMult: 1, enemySpeed: 1, crystalRange: 0, emberMult: 1, groundHp: 1, gusts: false, vents: 0, outcrops: 0,
  },
  dunes: {
    id: 'dunes', name: 'Dunes', tagline: 'Hot sand and howling wind.',
    rules: [
      ['≋', 'Sandstorms blow the top block off tall towers. Stone tops resist the wind.'],
      ['☘', 'Gardens earn half gold.'],
      ['▲', 'Rock outcrops give you free walls to build on.'],
    ],
    tiles: [0xecd29a, 0xe3c68a], cliff: 0xd59a5c, rock: 0xa0704a, sky: ['#f6d9a8', '#fff1d6'],
    gardenMult: 0.5, enemySpeed: 1, crystalRange: 0, emberMult: 1, groundHp: 1, gusts: true, vents: 0, outcrops: 6,
  },
  glacier: {
    id: 'glacier', name: 'Glacier', tagline: 'Everything is frozen solid.',
    rules: [
      ['❄', 'Blocks on the ground are frozen: +50% HP.'],
      ['➶', 'Enemies slide on the ice: 25% faster.'],
      ['◆', 'Crystals shine in the cold: +1 range.'],
    ],
    tiles: [0xe4f1f7, 0xd3e7f0], cliff: 0x9fbfd6, rock: 0x7f9cb6, sky: ['#cfe6f6', '#f4fbff'],
    gardenMult: 1, enemySpeed: 1.25, crystalRange: 1, emberMult: 1, groundHp: 1.5, gusts: false, vents: 0, outcrops: 4,
  },
  caldera: {
    id: 'caldera', name: 'Caldera', tagline: 'The ground itself is angry.',
    rules: [
      ['✹', 'Lava vents erupt at night and blast the base of nearby columns. Enemies near a vent get burned too.'],
      ['△', 'Ember turrets burn hotter: +50% damage.'],
      ['!', 'Watch the glowing cells. Building on them is risky.'],
    ],
    tiles: [0x5b4a4f, 0x524247], cliff: 0x3d2f35, rock: 0x2e2429, sky: ['#f0b49a', '#ffe0c4'],
    gardenMult: 1, enemySpeed: 1, crystalRange: 0, emberMult: 1.5, groundHp: 1, gusts: false, vents: 3, outcrops: 3,
  },
};

export const NIGHTS_PER_ACT = 4;

/** Meadow first, then two different hard biomes in random order. */
export function rollRoute(): BiomeId[] {
  const rest: BiomeId[] = ['dunes', 'glacier', 'caldera'].sort(() => rand() - 0.5) as BiomeId[];
  return ['meadow', rest[0], rest[1]];
}

export const actOf = (day: number) => Math.min(2, Math.floor((day - 1) / NIGHTS_PER_ACT));

/** Random cells at least `minDist` from the core, distinct. */
export function randomCells(n: number, minDist: number, taken: (x: number, y: number) => boolean): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < 400 && out.length < n; i++) {
    const x = 1 + Math.floor(rand() * (N - 2)), y = 1 + Math.floor(rand() * (N - 2));
    if (Math.abs(x - CORE.x) + Math.abs(y - CORE.y) < minDist || taken(x, y)) continue;
    if (out.some(c => Math.abs(c.x - x) + Math.abs(c.y - y) < 3)) continue;
    out.push({ x, y });
  }
  return out;
}
