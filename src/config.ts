// Core tuning values and static definitions.
import { TUNE } from './tune';

export const N = 13; // board is N x N cells
export const CORE = { x: 6, y: 6 };
export const MAX_HEIGHT = 16;
export const NIGHTS = 12;
export const START_CORE_HP = 15;
export const START_GOLD = 4;
export const HAND_SIZE = 4;

export type MatId = 'stone' | 'garden' | 'crystal' | 'ember' | 'ward' | 'arc' | 'beacon' | 'rock' | UniqueId;
export type UniqueId = 'anvil' | 'bell' | 'keg' | 'omen' | 'fountain' | 'mirror' | 'ballista' | 'spikes' | 'vane' | 'rootheart' | 'lodestone' | 'hourglass';
export const UNIQUES: UniqueId[] = ['anvil', 'bell', 'keg', 'omen', 'fountain', 'mirror', 'ballista', 'spikes', 'vane', 'rootheart', 'lodestone', 'hourglass'];

export interface MatDef {
  id: MatId;
  name: string;
  color: number;
  hp: number;
  turret: boolean;
  desc: string;
  /** Part of the landscape: never offered as a piece. */
  terrain?: boolean;
  /** One-of-a-kind block with its own rule; offered as a single-block piece. */
  unique?: boolean;
}

export const MATS: Record<MatId, MatDef> = {
  stone: {
    id: 'stone', name: 'Stone', color: 0xd8cbb3, hp: 10, turret: false,
    desc: 'Sturdy wall. A turret standing on stone shoots 1 cell further.',
  },
  garden: {
    id: 'garden', name: 'Garden', color: 0x86d16f, hp: 4, turret: false,
    desc: `Makes gold each dawn while on the ground (diminishing: 4 gardens = ${Math.floor(TUNE.gardenGold * 2)} gold, 16 = ${Math.floor(TUNE.gardenGold * 4)}).`,
  },
  crystal: {
    id: 'crystal', name: 'Crystal', color: 0x5fd8ec, hp: 5, turret: true,
    desc: 'Fires beams. Range grows with height. Raised off the ground, it can also hit fliers.',
  },
  ember: {
    id: 'ember', name: 'Ember', color: 0xf38b4a, hp: 5, turret: true,
    desc: 'Lobs splash shells. Range grows with height. Cannot hit fliers.',
  },
  ward: {
    id: 'ward', name: 'Ward', color: 0xae8cf5, hp: 6, turret: true,
    desc: 'Slows nearby enemies by 40% (fliers too, if raised). Radius grows with height.',
  },
  arc: {
    id: 'arc', name: 'Arc', color: 0xb8e04a, hp: 5, turret: true,
    desc: 'Zaps lightning that jumps between up to 3 nearby enemies, fliers too. Short range that barely grows with height. Each arc stacked below adds a jump.',
  },
  beacon: {
    id: 'beacon', name: 'Beacon', color: 0xf7d55c, hp: 5, turret: false,
    desc: 'Adjacent turret blocks (incl. above/below) deal +40% damage.',
  },
  rock: {
    id: 'rock', name: 'Rock', color: 0x9b8d84, hp: 30, turret: false, terrain: true,
    desc: 'Natural outcrop. Very tough, and you can build on top of it.',
  },
  // ---- unique blocks: one block, one big rule ----
  anvil: {
    id: 'anvil', name: 'Anvil', color: 0x55566a, hp: 14, turret: false, unique: true,
    desc: 'Super heavy. When it falls or gets toppled it crushes 3× as hard and hits the cells around it too. Put it on top of a tower.',
  },
  bell: {
    id: 'bell', name: 'Bell', color: 0xe0b14a, hp: 6, turret: false, unique: true,
    desc: 'Rings every 5 seconds at night and stuns nearby enemies. The higher it hangs, the further it rings.',
  },
  keg: {
    id: 'keg', name: 'Powder Keg', color: 0xc8433a, hp: 4, turret: false, unique: true,
    desc: 'Explodes when it breaks or gets toppled, blasting every enemy nearby. Let them chew on it!',
  },
  omen: {
    id: 'omen', name: 'Omen Stone', color: 0x4b3f72, hp: 8, turret: false, unique: true,
    desc: 'Enemies within 2 cells of it take +50% damage from everything.',
  },
  fountain: {
    id: 'fountain', name: 'Fountain', color: 0x7fd9e8, hp: 6, turret: false, unique: true,
    desc: 'Every morning it fully repairs blocks within 2 cells and heals the core by 1.',
  },
  mirror: {
    id: 'mirror', name: 'Mirror', color: 0xe7edf3, hp: 5, turret: false, unique: true,
    desc: 'Crystal blocks touching it (sides, above or below) fire 60% faster.',
  },
  ballista: {
    id: 'ballista', name: 'Ballista', color: 0xa0703c, hp: 8, turret: false, unique: true,
    desc: 'A giant crossbow: every 2.5 seconds it fires a bolt that hits hard and pierces shields. Very long range, longer when placed high.',
  },
  spikes: {
    id: 'spikes', name: 'Spike Block', color: 0x6d6a78, hp: 22, turret: false, unique: true,
    desc: 'A tough wall covered in spikes. Enemies standing next to it take damage every second.',
  },
  vane: {
    id: 'vane', name: 'Wind Vane', color: 0xd8e6f0, hp: 6, turret: false, unique: true,
    desc: 'Every 6 seconds a gust blows walking enemies within 3 cells one step back, away from the core.',
  },
  rootheart: {
    id: 'rootheart', name: 'Root Heart', color: 0x4f9a3c, hp: 10, turret: false, unique: true,
    desc: 'Gardens within 2 cells count double for morning gold.',
  },
  lodestone: {
    id: 'lodestone', name: 'Lodestone', color: 0x8a3346, hp: 9, turret: false, unique: true,
    desc: 'Pulls at flying enemies: fliers within 3 cells are slowed by half and take double damage.',
  },
  hourglass: {
    id: 'hourglass', name: 'Hourglass', color: 0xf0d79a, hp: 6, turret: false, unique: true,
    desc: 'For the first 15 seconds of every night, enemies within 3 cells move at half speed.',
  },
};

// Turret stats: range = base + perLevel * z
export const TURRET = {
  crystal: { dmg: 1.2, cd: 0.7, range: 2.2, perLevel: 0.36 },
  ember: { dmg: 2.6, cd: 2.1, range: 2.8, perLevel: 0.3, splash: 0.95 },
  ward: { slow: 0.4, range: 1.6, perLevel: 0.25 },
  /** chain lightning: hits the first enemy, then jumps to the nearest unhit one within `hop` */
  arc: { dmg: 1.5, cd: 1.3, range: 2.2, perLevel: 0.1, jumps: 3, hop: 1.7, falloff: 0.8 },
};

export type EnemyId = 'shard' | 'runner' | 'brute' | 'flier' | 'sapper' | 'climber' | 'bomber' | 'bulwark' | 'wyrm' | 'leviathan' | 'boss';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  speed: number; // cells per second
  chew: number; // damage per second to blocks
  coreDmg: number;
  bounty: number;
  cost: number; // wave budget cost
  minNight: number;
  color: number;
  size: number;
  desc: string;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  shard: {
    id: 'shard', name: 'Shard', hp: 4, speed: 1.3, chew: 1.2, coreDmg: 1, bounty: 0, cost: 1, minNight: 1,
    color: 0xe8475e, size: 0.36, desc: 'Walks to the core, chewing through blocks.',
  },
  runner: {
    id: 'runner', name: 'Runner', hp: 2.4, speed: 2.5, chew: 0.7, coreDmg: 1, bounty: 0, cost: 1, minNight: 2,
    color: 0xff9ac0, size: 0.28, desc: 'Fast and fragile.',
  },
  flier: {
    id: 'flier', name: 'Flier', hp: 5, speed: 1.5, chew: 0, coreDmg: 1, bounty: 1, cost: 2, minNight: 3,
    color: 0xb455e8, size: 0.34, desc: 'Flies over everything. Only raised crystals can hit it, and crystals 3+ blocks up hit it much harder. More come when you build wide.',
  },
  brute: {
    id: 'brute', name: 'Brute', hp: 15, speed: 0.7, chew: 3, coreDmg: 3, bounty: 2, cost: 5, minNight: 4,
    color: 0x8a3f6a, size: 0.55, desc: 'Slow, tough, chews fast. More appear when you sprawl wide.',
  },
  sapper: {
    id: 'sapper', name: 'Sapper', hp: 7, speed: 1.15, chew: 1, coreDmg: 2, bounty: 1, cost: 3, minNight: 5,
    color: 0xffb02e, size: 0.38, desc: 'Burrows to your TALLEST column and blasts 3 blocks from its base. More appear when you build tall.',
  },
  climber: {
    id: 'climber', name: 'Climber', hp: 9, speed: 0.9, chew: 0, coreDmg: 2, bounty: 1, cost: 3, minNight: 6,
    color: 0x5fbf6a, size: 0.34, desc: 'Walks straight over your walls instead of chewing through them. More appear when you build wide.',
  },
  bomber: {
    id: 'bomber', name: 'Bomber', hp: 8, speed: 1.2, chew: 0, coreDmg: 1, bounty: 1, cost: 3, minNight: 7,
    color: 0x2f8fd8, size: 0.34, desc: 'Flies to your TALLEST tower and blows itself up on it, knocking the top 2 blocks off. More appear when you build tall.',
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark', hp: 14, speed: 0.6, chew: 2, coreDmg: 3, bounty: 2, cost: 6, minNight: 8,
    color: 0x9aa3b5, size: 0.5, desc: 'Shielded: turrets only do half damage. Crush it, blow it up, or let the core pulse it.',
  },
  // ---- act guardians ----
  wyrm: {
    id: 'wyrm', name: 'Burrowing Wyrm', hp: 90, speed: 0.55, chew: 0, coreDmg: 4, bounty: 8, cost: 0, minNight: 99,
    color: 0xc77d3a, size: 0.62, desc: 'Tunnels under your walls. It surfaces every few seconds and rips out the block above it. You can only hit it while it is up!',
  },
  leviathan: {
    id: 'leviathan', name: 'Sky Leviathan', hp: 160, speed: 0.38, chew: 0, coreDmg: 4, bounty: 10, cost: 0, minNight: 99,
    color: 0x3a6fb5, size: 0.85, desc: 'A huge flier. Only raised turrets reach it. It tears the top blocks off nearby towers as it drifts in.',
  },
  boss: {
    id: 'boss', name: 'Dodecarch', hp: 700, speed: 0.42, chew: 8, coreDmg: 12, bounty: 10, cost: 0, minNight: 99,
    color: 0x3f2a5e, size: 1.0, desc: 'Sheds shards as it walks.',
  },
};

export const PALETTE = {
  outline: 0x221a33,
  core: 0xff6f9f,
  coreGlow: 0xffd1e0,
  tileA: 0xb9d98f,
  tileB: 0xa9cf83,
  cliff: 0xc99a6b,
  rock: 0x8c6a55,
  ghostOk: 0x7af0c0,
  ghostBad: 0xff5a6a,
};

/** Okabe-Ito based colours for the materials that are easy to confuse, used by the colour-blind setting. */
export const CB_COLORS: Partial<Record<MatId, number>> = {
  garden: 0x009e73, crystal: 0x56b4e9, ember: 0xe69f00, ward: 0xcc79a7, arc: 0x009e9e, beacon: 0xf0e442, stone: 0xd8d2c4,
};
const BASE_COLORS = Object.fromEntries(Object.entries(MATS).map(([k, m]) => [k, m.color])) as Record<MatId, number>;
export function applyColorBlind(on: boolean) {
  for (const k of Object.keys(MATS) as MatId[]) MATS[k].color = on && CB_COLORS[k] !== undefined ? CB_COLORS[k]! : BASE_COLORS[k];
}
