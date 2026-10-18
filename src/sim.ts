import * as THREE from 'three';
import { sfx } from './audio';
import { BiomeDef } from './biomes';
import { Block, Board } from './board';
import { CORE, ENEMIES, EnemyDef, EnemyId, MATS, MatId, N, TURRET } from './config';
import { RelicId } from './meta';
import { EnemyView, Renderer, world } from './render';

export interface SpawnSpec { t: number; type: EnemyId; side: number }
export interface Wave { sides: number[]; spawns: SpawnSpec[]; hpScale: number; elite: boolean; boss: boolean; guardian: EnemyId | null; weather: WeatherId | null; night: number }

/** A turret standing directly on stone or rock shoots this much further. */
export const FOUNDATION_RANGE = 1;
export const isFoundation = (mat: MatId | undefined) => mat === 'stone' || mat === 'rock';

export function turretRange(mat: MatId, z: number, has: (r: RelicId) => boolean, bonus = 0): number {
  const spec = TURRET[mat as 'crystal' | 'ember' | 'ward'];
  if (!spec) return 0;
  // height pays off strongly up to level 6, then with diminishing returns
  const lvl = z <= 6 ? z : 6 + (z - 6) * 0.15;
  let range = spec.range + spec.perLevel * lvl;
  if (has('spyglass') && mat !== 'ward') range += 1;
  if (mat !== 'ward') range += bonus;
  if (has('tapestry') && z === 0) range += 1;
  return range;
}

export type Aim = 'first' | 'strong' | 'air';
export const AIMS: Record<Aim, string> = { first: 'First', strong: 'Strongest', air: 'Fliers' };

export type Affix = 'armored' | 'hasted' | 'regen' | 'splitting';
export const AFFIXES: Affix[] = ['armored', 'hasted', 'regen', 'splitting'];

export type WeatherId = 'fog' | 'storm' | 'moon';
export const WEATHER: Record<WeatherId, { name: string; icon: string; desc: string }> = {
  fog: { name: 'Fog', icon: '≈', desc: 'Turrets see 1 cell less far.' },
  storm: { name: 'Thunderstorm', icon: 'ϟ', desc: 'Lightning hits your tallest tower. A crystal on top turns it into a blast at the enemies; anything else loses its top block.' },
  moon: { name: 'Full moon', icon: '◐', desc: 'Enemies are 15% faster, but every kill pays +1 gold.' },
};

export type ContractId = 'standard' | 'calm' | 'bounty' | 'skyward' | 'siege';

export interface ContractDef {
  id: ContractId;
  name: string;
  icon: string;
  desc: string;
  budget: number;
  weights?: Partial<Record<EnemyId, number>>;
  gold?: number;
  relic?: boolean;
  topple?: number;
}

/** Night types: shown on the map's night squares, so you choose your risk by choosing your path. */
export const CONTRACTS: Record<ContractId, ContractDef> = {
  standard: { id: 'standard', name: 'Normal night', icon: '☾', desc: 'No surprises.', budget: 1 },
  calm: { id: 'calm', name: 'Quiet night', icon: '☁', desc: '30% fewer enemies. No reward.', budget: 0.7 },
  bounty: { id: 'bounty', name: 'Bounty hunt', icon: '◎', desc: '30% more enemies. Earn +10 gold if you survive.', budget: 1.3, gold: 10 },
  skyward: { id: 'skyward', name: 'Sky raid', icon: '◇', desc: 'Mostly fliers and bombers. Pick a free relic next morning.', budget: 1.1, weights: { flier: 5, bomber: 3 }, relic: true },
  siege: { id: 'siege', name: 'Siege', icon: '■', desc: 'Brutes and bulwarks march in. You get +1 topple tonight and +6 gold.', budget: 1.15, weights: { brute: 3, bulwark: 3 }, gold: 6, topple: 1 },
};

/** Waves adapt to the board: tall builds draw sappers, sprawling ones draw brutes. */
export function makeWave(night: number, board?: { tallest: number; footprint: number; turrets: number }, contract: ContractDef = CONTRACTS.standard): Wave {
  // guardian nights trade part of the regular wave for the guardian itself
  // the first night in a new land is a little lighter: the journey already cost you blocks
  const budgetBase = (2 + night * 3.5 + night * night * 0.6) * contract.budget * (night === 4 || night === 8 ? 0.6 : 1) * (night === 5 ? 0.85 : night === 9 ? 0.75 : 1);
  const hpScale = Math.pow(1.2, night - 1) * Math.min(2.4, 1 + 0.3 * Math.max(0, night - 2));
  const sideCount = night <= 2 ? 1 : night <= 6 ? 1 + (Math.random() < 0.55 ? 1 : 0) : 2 + (Math.random() < 0.45 ? 1 : 0);
  const sides = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, sideCount).sort();
  const weights: Partial<Record<EnemyId, number>> = { shard: 3, runner: 2, flier: 1.2, brute: 0.7, sapper: 0.8, climber: 0.5, bomber: 0.45, bulwark: 0.35 };
  if (board && board.tallest >= 7) weights.sapper! *= 1 + (board.tallest - 6) * 0.35;
  if (board && board.footprint >= 30) weights.brute! *= 1 + (board.footprint - 29) * 0.05;
  // counter-enemies: each one leans on a different dominant build
  if (board && board.footprint >= 24) weights.climber! *= 1 + (board.footprint - 23) * 0.06;
  // walls can't stop fliers, so a sprawling fortress draws more of them
  if (board && board.footprint >= 30) weights.flier! *= 1 + (board.footprint - 29) * 0.045;
  if (board && board.tallest >= 6) weights.bomber! *= 1 + (board.tallest - 5) * 0.2;
  if (board && board.turrets >= 8) weights.bulwark! *= 1 + (board.turrets - 7) * 0.08;
  for (const [id, w] of Object.entries(contract.weights ?? {})) weights[id as EnemyId] = (weights[id as EnemyId] ?? 1) * w;
  // a contract can bring its featured enemies a few nights early
  const pool = (Object.values(ENEMIES) as EnemyDef[]).filter(e => e.cost > 0 && e.minNight <= night + (contract.weights?.[e.id] ? 3 : 0));
  const types: EnemyId[] = [];
  let budget = budgetBase;
  while (budget >= 1) {
    const avail = pool.filter(e => e.cost <= budget);
    const total = avail.reduce((s, e) => s + (weights[e.id] ?? 1), 0);
    let r = Math.random() * total;
    let pick = avail[0];
    for (const e of avail) { r -= weights[e.id] ?? 1; if (r <= 0) { pick = e; break; } }
    types.push(pick.id);
    budget -= pick.cost;
  }
  // each act ends with an elite night; the last act ends with the boss
  const elite = night === 4 || night === 8;
  const boss = night === 12;
  // enemies arrive in packs so defenses get tested by bursts rather than a trickle
  const dur = Math.min(32, 5 + types.length * 0.55);
  const spawns: SpawnSpec[] = [];
  const order = types.sort(() => Math.random() - 0.5);
  for (let i = 0; i < order.length;) {
    const size = 3 + Math.floor(Math.random() * 4);
    const t = Math.random() * dur;
    const side = sides[Math.floor(Math.random() * sides.length)];
    for (const type of order.slice(i, i + size)) spawns.push({ t: t + Math.random() * 1.2, type, side });
    i += size;
  }
  // every act ends with a guardian; the last one is the Dodecarch
  const guardian: EnemyId | null = night === 4 ? 'wyrm' : night === 8 ? 'leviathan' : boss ? 'boss' : null;
  if (guardian) spawns.push({ t: 5, type: guardian, side: sides[0] });
  spawns.sort((a, b) => a.t - b.t);
  // weather from night 2 on, never on guardian nights
  const weather: WeatherId | null = night >= 2 && !guardian && Math.random() < 0.35 ? (['fog', 'storm', 'moon'] as WeatherId[])[Math.floor(Math.random() * 3)] : null;
  return { sides, spawns, hpScale, elite, boss, guardian, weather, night };
}

interface Enemy {
  type: EnemyId;
  def: EnemyDef;
  hp: number;
  maxHp: number;
  pos: THREE.Vector2; // grid space (x, y)
  alt: number;
  cur: { x: number; y: number } | null;
  next: { x: number; y: number } | null;
  mode: 'walk' | 'fly' | 'burrow' | 'climb';
  sapTarget: { x: number; y: number } | null;
  slow: number;
  flash: number;
  view: EnemyView;
  dead: boolean;
  t: number;
  shed: number;
  chewing: { x: number; y: number } | null;
  stun: number;
  /** underground: cannot be targeted or hurt */
  hidden: boolean;
  /** pulled by a lodestone: takes double damage while > 0 */
  marked: number;
  /** seconds of slow left from frost beams / smoke */
  chill: number;
  affix: Affix | null;
}

interface Turret { x: number; y: number; z: number; b: Block; mat: MatId; range: number; dmgMult: number; cdMult: number; cd: number; hitsAir: boolean; stack: number; react: Reaction | null }

/** Material reactions between touching blocks (sides, above or below). */
const UNIQUE_SPOTS: MatId[] = ['ballista', 'spikes', 'vane', 'lodestone', 'hourglass'];

export type Reaction = 'frost' | 'smoke' | 'sparks' | 'bloom' | 'wildfire' | 'shrapnel' | 'bramble' | 'deepchill' | 'glint';
/** Combos: a turret touching (side, above or below) a certain block gets a twist. First match wins. */
export const REACTIONS: Record<Reaction, { name: string; desc: string; turret: MatId; with: MatId; icon: string }> = {
  frost: { name: 'Frost beam', desc: 'crystal touching ward: beams slow enemies', turret: 'crystal', with: 'ward', icon: '❄' },
  sparks: { name: 'Spark beam', desc: 'crystal touching ember: beams splash fire', turret: 'crystal', with: 'ember', icon: '✸' },
  bloom: { name: 'Bloom beam', desc: 'crystal touching garden: every kill drops 1 gold', turret: 'crystal', with: 'garden', icon: '❀' },
  glint: { name: 'Glint beam', desc: 'crystal touching beacon: beams pierce to a second enemy', turret: 'crystal', with: 'beacon', icon: '✦' },
  smoke: { name: 'Smoke shells', desc: 'ember touching garden: shells slow enemies', turret: 'ember', with: 'garden', icon: '☁' },
  wildfire: { name: 'Wildfire', desc: 'ember touching ward: shells leave burning ground', turret: 'ember', with: 'ward', icon: '♨' },
  shrapnel: { name: 'Shrapnel', desc: 'ember touching stone: +30% blast radius', turret: 'ember', with: 'stone', icon: '✱' },
  bramble: { name: 'Brambles', desc: 'ward touching garden: enemies in the field take damage', turret: 'ward', with: 'garden', icon: '♣' },
  deepchill: { name: 'Deep chill', desc: 'ward touching crystal: the field slows much harder', turret: 'ward', with: 'crystal', icon: '❅' },
};

export function reactionOf(mat: MatId, touching: Set<MatId>): Reaction | null {
  for (const [id, r] of Object.entries(REACTIONS) as [Reaction, (typeof REACTIONS)[Reaction]][]) if (r.turret === mat && touching.has(r.with)) return id;
  return null;
}

/** Each block of the same material directly underneath a turret makes it this much stronger. */
export const STACK_BONUS = 0.25;
/** seconds a toppled tower takes to swing down (the renderer animates the same swing) */
export const TOPPLE_SWING = 0.4;
/** crystals at this height or higher deal +60% damage to flying enemies */
export const HIGH_AA = 3;
/** Damage per toppled block landing on an enemy, before the night's HP scaling. */
export const TOPPLE_DMG = 5;

/** How many blocks of the same material sit directly under (x,y,z) in an unbroken run. */
export function stackBelow(board: Board, x: number, y: number, z: number): number {
  const col = board.col(x, y);
  const mat = col[z]?.mat;
  let n = 0;
  while (z - n - 1 >= 0 && col[z - n - 1]?.mat === mat) n++;
  return n;
}

interface Shell { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; dmg: number; radius: number; smoke: boolean; fire: boolean }

export interface Mods { crystal: number; ember: number; range: number; crystalRange: number; wardRange?: number }

/** Range bonus a turret of this material gets from workshop + biome. */
export const rangeBonus = (m: Mods, mat: MatId) => m.range + (mat === 'crystal' ? m.crystalRange : 0);

export interface SimHooks {
  has: (r: RelicId) => boolean;
  /** workshop + biome modifiers */
  mods: Mods;
  biome: BiomeDef;
  /** heat level of the run (0 = none) */
  heat: number;
  /** core pulse upgrades taken at camps */
  coreLevel: number;
  /** a chain of n towers just toppled */
  chain: (n: number) => void;
  /** turret targeting priority, can change mid-night */
  aim: () => Aim;
  vents: { x: number; y: number }[];
  gold: (n: number, at?: THREE.Vector3) => void;
  coreDamage: (n: number, by: EnemyId, at: THREE.Vector3) => void;
  onKill: (fall: boolean) => void;
  boardChanged: () => void;
}


export class Night {
  enemies: Enemy[] = [];
  private shells: Shell[] = [];
  private queue: SpawnSpec[];
  private t = 0;
  private turrets: Turret[] = [];
  private turretVersion = -1;
  private coreCd = 1;
  private rodCd = 2.5;
  private wardPulse = 0;
  private gustCd = 7;
  private stormCd = 5;
  private dominoes: { x: number; y: number; d: number; t: number; chain: number }[] = [];
  /** seconds of Rally left: turrets reload twice as fast */
  rally = 0;
  /** toppled towers still swinging down; they crush when they land */
  private impacts: { cells: { x: number; y: number; z: number; mat: MatId }[]; d: number; chain: number; t: number }[] = [];
  private bellCd = 2;
  private bells: { x: number; y: number; z: number }[] = [];
  private omens: { x: number; y: number }[] = [];
  /** lingering slow fields left by toppled ward blocks */
  private zones: { x: number; y: number; r: number; t: number }[] = [];
  /** unique blocks that act on their own each night */
  private specials: { x: number; y: number; z: number; mat: MatId; cd: number }[] = [];
  /** burning ground from wildfire shells */
  private fires: { x: number; y: number; r: number; t: number; dps: number }[] = [];
  private ventCd = 6;
  done = false;
  bossRef: Enemy | null = null;
  /** heat 10: the final boss has already got back up */
  private bossRose = false;

  constructor(private board: Board, private r: Renderer, readonly wave: Wave, private hooks: SimHooks) {
    this.queue = [...wave.spawns];
  }

  get remaining() { return this.queue.length + this.enemies.length; }

  private spawn(s: SpawnSpec) {
    const def = ENEMIES[s.type];
    const k = Math.floor(Math.random() * N);
    const edge = [{ x: k, y: 0 }, { x: N - 1, y: k }, { x: k, y: N - 1 }, { x: 0, y: k }][s.side];
    const out = [{ x: k, y: -1.3 }, { x: N + 0.3, y: k }, { x: k, y: N + 0.3 }, { x: -1.3, y: k }][s.side];
    // guardians have hand-tuned HP; everything else scales with the night
    const heat = this.hooks.heat;
    const hp = def.minNight >= 99 ? def.hp * (heat >= 4 ? 1.5 : 1) : def.hp * this.wave.hpScale * (heat >= 1 ? 1.2 : 1);
    const e: Enemy = {
      type: s.type, def, hp, maxHp: hp, pos: new THREE.Vector2(out.x, out.y), alt: 0,
      cur: null, next: edge, mode: s.type === 'flier' || s.type === 'bomber' || s.type === 'leviathan' ? 'fly' : s.type === 'climber' ? 'climb' : 'walk', sapTarget: null,
      slow: 0, flash: 0, view: this.r.makeEnemy(s.type), dead: false, t: Math.random() * 10, shed: 3, chewing: null, stun: 0, hidden: false, chill: 0, affix: null, marked: 0,
    };
    if (s.type === 'sapper') this.retargetSapper(e);
    if (s.type === 'wyrm') e.hidden = true;
    // elites: from night 5 some regulars roll a trait
    const hot = this.hooks.heat >= 3;
    if (def.minNight < 99 && this.wave.night >= (hot ? 2 : 5) && Math.random() < (0.07 + 0.012 * this.wave.night) * (hot ? 2 : 1)) {
      e.affix = AFFIXES[Math.floor(Math.random() * AFFIXES.length)];
      if (e.affix === 'armored') { e.hp *= 2; e.maxHp *= 2; }
      this.r.markElite(e.view);
    }
    if (s.type === 'bomber') { const st = this.board.stats(); if (st.tallest >= 3) e.sapTarget = st.tallestAt; }
    if (def.minNight >= 99) this.bossRef = e;
    this.enemies.push(e);
  }

  private spawnAt(type: EnemyId, from: Enemy) {
    const def = ENEMIES[type];
    const hp = def.hp * this.wave.hpScale;
    this.enemies.push({
      type, def, hp, maxHp: hp, pos: from.pos.clone(), alt: 0, cur: from.cur, next: from.next, mode: 'walk',
      sapTarget: null, slow: 0, flash: 0, view: this.r.makeEnemy(type), dead: false, t: 0, shed: 0, chewing: null, stun: 0, hidden: false, chill: 0, affix: null, marked: 0,
    });
  }

  private retargetSapper(e: Enemy) {
    const s = this.board.stats();
    if (s.tallest >= 3) { e.mode = 'burrow'; e.sapTarget = s.tallestAt; } else if (e.mode === 'burrow') {
      e.mode = 'walk';
      e.sapTarget = null;
      e.cur = { x: Math.round(Math.max(0, Math.min(N - 1, e.pos.x))), y: Math.round(Math.max(0, Math.min(N - 1, e.pos.y))) };
      e.next = null;
    }
  }

  private rebuildTurrets() {
    const b = this.board;
    const has = this.hooks.has;
    this.turrets = [];
    this.bells = [];
    this.omens = [];
    this.specials = [];
    for (const { x, y, z, b: blk } of b.blocks()) {
      if (blk.mat === 'bell') this.bells.push({ x, y, z });
      if (blk.mat === 'omen') this.omens.push({ x, y });
      if (UNIQUE_SPOTS.includes(blk.mat)) this.specials.push({ x, y, z, mat: blk.mat, cd: blk.mat === 'ballista' ? 1 : 6 });
      if (!MATS[blk.mat].turret || !b.exposed.has(blk.id)) continue;
      const footing = isFoundation(b.blockAt(x, y, z - 1)?.mat) ? FOUNDATION_RANGE : 0;
      const range = Math.max(1.2, turretRange(blk.mat, z, has, rangeBonus(this.hooks.mods, blk.mat)) + footing - (this.wave.weather === 'fog' ? 1 : 0));
      let dmgMult = 1;
      const touching = new Set<MatId>();
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue;
        const nb = b.blockAt(x + dx, y + dy, z + dz);
        if (!nb) continue;
        if (nb.mat === 'beacon') dmgMult += 0.4;
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 1) touching.add(nb.mat);
      }
      if (has('mosaic')) dmgMult += 0.15 * touching.size;
      if (has('plumb_line') && z >= 4) dmgMult *= 2;
      const stack = stackBelow(b, x, y, z);
      dmgMult += STACK_BONUS * stack;
      const cdMult = (has('focus_lens') && blk.mat === 'crystal' ? 1 / 1.35 : 1) * (blk.mat === 'crystal' && touching.has('mirror') ? 1 / 1.6 : 1);
      this.turrets.push({
        x, y, z, b: blk, mat: blk.mat, range: range + (blk.mat === 'ward' ? 0.3 * stack + (this.hooks.mods.wardRange ?? 0) : 0), dmgMult, cdMult, stack,
        cd: Math.random() * 0.5, hitsAir: blk.mat !== 'ember' && z >= 1, react: reactionOf(blk.mat, touching),
      });
    }
    this.turretVersion = b.version;
  }

  private enemyWorld(e: Enemy) {
    return world(e.pos.x, e.pos.y, e.alt + e.def.size * (e.type === 'sapper' ? 0.4 : 1) + (e.type === 'boss' ? 0.1 : 0.05));
  }

  /** pierce hits shielded enemies at full strength (crushes, blasts, the core). */
  damage(e: Enemy, dmg: number, fall = false, pierce = fall) {
    if (e.dead || e.hidden) return;
    if (this.omens.some(o => Math.hypot(e.pos.x - o.x, e.pos.y - o.y) <= 2.2)) dmg *= 1.5;
    if (e.type === 'bulwark' && !pierce) dmg *= 0.5;
    if (e.marked > 0) dmg *= 2;
    e.hp -= dmg;
    e.flash = 0.12;
    if (e.hp <= 0 && e === this.bossRef && e.type === 'boss' && this.hooks.heat >= 10 && !this.bossRose) {
      // heat 10: the boss gets back up once with half its HP
      this.bossRose = true;
      e.hp = e.maxHp * 0.5;
      e.stun = 1.2;
      this.r.shakeCam(0.5);
      this.r.ring(this.enemyWorld(e), 3, 0xff5a3a, 0.7);
      this.r.floatText(this.enemyWorld(e), 'It gets back up!', '#ff8a6a');
      return;
    }
    if (e.hp <= 0) {
      e.dead = true;
      sfx.kill();
      const bounty = e.def.bounty + (this.wave.weather === 'moon' ? 1 : 0) + (e.affix ? 1 : 0);
      if (e.affix === 'splitting') for (let i = 0; i < 2; i++) { this.spawnAt('shard', e); const k = this.enemies[this.enemies.length - 1]; k.pos.x += (i - 0.5) * 0.4; }
      if (bounty) this.hooks.gold(bounty, this.enemyWorld(e));
      this.hooks.onKill(fall);
      if (e === this.bossRef) { this.r.shakeCam(0.6); this.r.ring(this.enemyWorld(e), 4, 0xffffff, 0.8); }
    }
  }

  /** Destroy a block, crush whoever is under/next to a falling stack. */
  destroyBlock(x: number, y: number, z: number) {
    const mat = this.board.blockAt(x, y, z)?.mat;
    const ev = this.board.destroy(x, y, z);
    sfx.crumble();
    this.hooks.boardChanged();
    if (mat === 'keg') this.explode(x, y, z);
    if (!ev) return;
    const gw = this.hooks.has('gravity_well');
    const dmg = 1.6 * ev.count * Math.min(3, ev.drop) * (gw ? 3 : 1) * (ev.heavy ? 3 : 1);
    const wide = gw || ev.heavy;
    this.r.shakeCam(0.12 + ev.count * 0.03 + (ev.heavy ? 0.3 : 0));
    this.r.ring(world(x, y, 0.05), wide ? 1.8 : 1, ev.heavy ? 0x8f93b3 : 0xfff0c0, 0.35);
    for (const e of this.enemies) {
      if (e.dead || e.mode === 'fly') continue;
      const ex = Math.round(e.pos.x), ey = Math.round(e.pos.y);
      const near = wide ? Math.max(Math.abs(ex - x), Math.abs(ey - y)) <= 1 : (ex === x && ey === y);
      const chewing = e.chewing && e.chewing.x === x && e.chewing.y === y;
      if (near || chewing) this.damage(e, dmg, true);
    }
  }

  /** Powder keg blast: hurts every enemy nearby, fliers included. */
  private explode(x: number, y: number, z: number) {
    const at = world(x, y, z + 0.5);
    this.r.ring(world(x, y, 0.1), 2, 0xff7a3a, 0.5);
    this.r.debris(at, 0xff7a3a, 16);
    this.r.shakeCam(0.45);
    sfx.boom();
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.pos.x - x, e.pos.y - y) <= 2) this.damage(e, 9 * this.wave.hpScale, false, true);
  }

  /** A block dropped from the sky: crushes ground enemies on its cell. */
  crushAt(x: number, y: number) {
    this.hooks.boardChanged();
    this.r.ring(world(x, y, 0.05), 0.9, 0xfff0c0, 0.35);
    this.r.shakeCam(0.15);
    sfx.place();
    for (const e of this.enemies) {
      if (!e.dead && e.mode !== 'fly' && Math.hypot(e.pos.x - x, e.pos.y - y) < 0.75) this.damage(e, TOPPLE_DMG * 1.5 * this.wave.hpScale, true);
    }
  }

  /** Ground enemies standing on any of these cells. */
  enemiesOn(cells: { x: number; y: number }[], ahead = 0): number {
    return this.enemies.filter(e => {
      if (e.dead || e.hidden || e.mode === 'fly') return false;
      // look ahead along the enemy's current step: a topple lands a moment after the click
      const p = e.pos.clone();
      if (ahead && e.next && !e.chewing) {
        const d = new THREE.Vector2(e.next.x, e.next.y).sub(p);
        const len = d.length();
        if (len > 0.01) p.addScaledVector(d, Math.min(len, e.def.speed * (1 - e.slow) * ahead) / len);
      }
      return cells.some(c => Math.hypot(p.x - c.x, p.y - c.y) < 0.75);
    }).length;
  }

  /**
   * Tip a tower over: every block that lands crushes the ground enemies on its cell,
   * and what it is made of decides what else happens where it lands.
   */
  topple(x: number, y: number, d: number, chain = 0) {
    const stack = this.board.col(x, y).filter((b): b is Block => !!b);
    const cells = this.board.topple(x, y, d);
    // blocks that tip past the island's edge swing out and drop into the sky
    this.r.tossBlocks(cells.flatMap((c, i) => (c.z < 0 && !this.board.inBounds(c.x, c.y) ? [{ id: stack[i].id, to: world(c.x, c.y, 0.5) }] : [])));
    this.hooks.boardChanged();
    sfx.crumble();
    // the tower takes a moment to swing down; the crush lands with it
    this.impacts.push({ cells, d, chain, t: TOPPLE_SWING });
  }

  private landTopple(cells: { x: number; y: number; z: number; mat: MatId }[], d: number, chain: number) {
    // dominoes: the first tower it slams into (2+ blocks before impact) tips over too, a beat later
    const hit = cells.find(c => c.z >= 2);
    if (hit && (chain < 3 || this.hooks.has('domino'))) this.dominoes.push({ x: hit.x, y: hit.y, d, t: 0.12, chain: chain + 1 });
    const base = TOPPLE_DMG * this.wave.hpScale * (this.hooks.has('gravity_well') ? 1.5 : 1) * (this.hooks.has('domino') ? 1 + 0.5 * chain : 1);
    const hs = this.wave.hpScale;
    sfx.boom();
    this.r.shakeCam(0.2 + cells.length * 0.04);
    const ground = (cx: number, cy: number, r: number) =>
      this.enemies.filter(e => !e.dead && e.mode !== 'fly' && Math.hypot(e.pos.x - cx, e.pos.y - cy) < r);
    for (const c of cells) {
      const at = world(c.x, c.y, Math.max(0, c.z) + 0.05);
      const heavy = c.mat === 'anvil';
      const crush = base * (heavy ? 3 : c.mat === 'stone' || c.mat === 'rock' ? 1.5 : 1);
      this.r.ring(at, heavy ? 1.6 : 0.8, 0xfff0c0, 0.4);
      for (const e of ground(c.x, c.y, heavy ? 1.6 : 0.75)) this.damage(e, crush, true);
      switch (c.mat) {
        case 'ember': // fire splashes out where it lands
          this.r.ring(at, 1.3, 0xff8a3a, 0.45);
          for (const e of ground(c.x, c.y, 1.3)) this.damage(e, 3 * hs, false, true);
          break;
        case 'crystal': { // shatters into shards that seek the nearest enemies
          const near = this.enemies.filter(e => !e.dead && Math.hypot(e.pos.x - c.x, e.pos.y - c.y) < 3)
            .sort((a, b) => Math.hypot(a.pos.x - c.x, a.pos.y - c.y) - Math.hypot(b.pos.x - c.x, b.pos.y - c.y)).slice(0, 3);
          for (const e of near) { this.r.beam(at, this.enemyWorld(e), 0x9ff3ff); this.damage(e, 2.5 * hs); }
          break;
        }
        case 'ward': // leaves a lingering slow field
          this.zones.push({ x: c.x, y: c.y, r: 1.4, t: 6 });
          this.r.ring(at, 1.4, MATS.ward.color, 0.8);
          break;
        case 'garden': // scatters seeds of gold
          this.hooks.gold(1, at);
          break;
        case 'keg':
          if (c.z >= 0) this.destroyBlock(c.x, c.y, c.z);
          else this.explode(c.x, c.y, 0);
          break;
      }
    }
    for (const e of this.enemies) if (e.type === 'sapper') this.retargetSapper(e);
  }

  private nearestTarget(x: number, y: number, range: number, air: boolean, ground = true, exclude?: Enemy): Enemy | null {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.hidden || e === exclude) continue;
      if (e.mode === 'fly' ? !air : !ground) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.y - y);
      if (d > range) continue;
      // lower score = higher priority, per the player's aim setting
      const aim = this.hooks.aim();
      let prog = Math.hypot(e.pos.x - CORE.x, e.pos.y - CORE.y);
      if (aim === 'strong') prog = -e.hp;
      if (aim === 'air' && e.mode === 'fly') prog -= 100;
      if (prog < bd) { bd = prog; best = e; }
    }
    return best;
  }

  update(dt: number) {
    this.t += dt;
    while (this.queue.length && this.queue[0].t <= this.t) this.spawn(this.queue.shift()!);
    if (this.turretVersion !== this.board.version) this.rebuildTurrets();
    const has = this.hooks.has;

    for (const e of this.enemies) { e.slow = 0; e.marked = Math.max(0, e.marked - dt); }
    // wards
    this.wardPulse -= dt;
    const pulse = this.wardPulse <= 0;
    if (pulse) this.wardPulse = 1.6;
    for (const tu of this.turrets) {
      if (tu.mat !== 'ward') continue;
      for (const e of this.enemies) {
        if (e.mode === 'fly' && !tu.hitsAir) continue;
        if (Math.hypot(e.pos.x - tu.x, e.pos.y - tu.y) > tu.range) continue;
        e.slow = Math.max(e.slow, tu.react === 'deepchill' ? 0.65 : TURRET.ward.slow);
        if (tu.react === 'bramble' && e.mode !== 'fly') this.damage(e, 0.9 * this.wave.hpScale * dt);
      }
      if (pulse && this.enemies.length) this.r.ring(world(tu.x, tu.y, 0.06), tu.range, MATS.ward.color, 0.9);
    }

    // slow fields from toppled wards
    for (const z of this.zones) {
      z.t -= dt;
      for (const e of this.enemies) if (e.mode !== 'fly' && Math.hypot(e.pos.x - z.x, e.pos.y - z.y) <= z.r) e.slow = Math.max(e.slow, 0.5);
    }
    this.zones = this.zones.filter(z => z.t > 0);
    for (const f of this.fires) {
      f.t -= dt;
      for (const e of this.enemies) if (e.mode !== 'fly' && Math.hypot(e.pos.x - f.x, e.pos.y - f.y) <= f.r) this.damage(e, f.dps * dt);
    }
    this.fires = this.fires.filter(f => f.t > 0);
    this.uniques(dt);
    // chilled by frost beams or smoke shells
    for (const e of this.enemies) if (e.chill > 0) { e.chill -= dt; e.slow = Math.max(e.slow, 0.4); }
    // bells stun everything on the ground in earshot
    if (this.bells.length && (this.bellCd -= dt) <= 0) {
      this.bellCd = 5;
      let rang = false;
      for (const bl of this.bells) {
        const r = 1.6 + 0.3 * bl.z;
        const hit = this.enemies.filter(e => !e.dead && e.mode === 'walk' && Math.hypot(e.pos.x - bl.x, e.pos.y - bl.y) <= r);
        if (!hit.length) continue;
        rang = true;
        for (const e of hit) e.stun = 1.2;
        this.r.ring(world(bl.x, bl.y, 0.08), r, MATS.bell.color, 0.6);
      }
      if (rang) sfx.zap(); else this.bellCd = 0.3;
    }

    for (const e of this.enemies) this.moveEnemy(e, dt);

    // turrets
    for (const tu of this.turrets) {
      if (tu.mat === 'ward') continue;
      tu.cd -= dt * (this.rally > 0 ? 2 : 1);
      if (tu.cd > 0) continue;
      const from = world(tu.x, tu.y, tu.z + 0.8);
      if (tu.mat === 'crystal') {
        const tgt = this.nearestTarget(tu.x, tu.y, tu.range, tu.hitsAir);
        if (!tgt) { tu.cd = 0.1; continue; }
        const dmg = TURRET.crystal.dmg * tu.dmgMult * this.hooks.mods.crystal;
        this.r.shot(from, this.enemyWorld(tgt), tu.react ? 0xd7f7ff : 0x9ff3ff);
        const wasAlive = !tgt.dead;
        // height is the answer to the air: high crystals hit fliers and bombers much harder
        this.damage(tgt, dmg * (tgt.mode === 'fly' && tu.z >= HIGH_AA ? 1.6 : 1));
        if (tu.react === 'bloom' && wasAlive && tgt.dead) this.hooks.gold(1, this.enemyWorld(tgt));
        if (tu.react === 'glint') {
          const next = this.nearestTarget(tgt.pos.x, tgt.pos.y, 1.8, tu.hitsAir, true, tgt);
          if (next) { this.r.shot(this.enemyWorld(tgt), this.enemyWorld(next), 0xfff1a6); this.damage(next, dmg * 0.8); }
        }
        if (tu.react === 'frost') tgt.chill = 1.5;
        if (tu.react === 'sparks') {
          this.r.ring(this.enemyWorld(tgt), 0.8, 0xff8a3a, 0.25);
          for (const e of this.enemies) if (e !== tgt && e.mode !== 'fly' && Math.hypot(e.pos.x - tgt.pos.x, e.pos.y - tgt.pos.y) < 0.9) this.damage(e, dmg * 0.5);
        }
        if (has('prism')) {
          const second = this.nearestTarget(tgt.pos.x, tgt.pos.y, 2.5, true, true, tgt);
          if (second) { this.r.beam(this.enemyWorld(tgt), this.enemyWorld(second), 0xd7a0ff); this.damage(second, dmg * 0.7); }
        }
        sfx.beam();
        this.r.kickBlock(tu.b.id, 2);
        tu.cd = TURRET.crystal.cd * tu.cdMult;
      } else if (tu.mat === 'ember') {
        const tgt = this.nearestTarget(tu.x, tu.y, tu.range, false);
        if (!tgt) { tu.cd = 0.15; continue; }
        const to = world(tgt.pos.x, tgt.pos.y, 0.1);
        const dist = from.distanceTo(to);
        const fs = has('firestorm');
        this.shells.push({
          mesh: this.r.makeShell(), from, to, t: 0, dur: 0.5 + dist * 0.06,
          dmg: (TURRET.ember.dmg + (fs ? 1 : 0)) * tu.dmgMult * this.hooks.mods.ember, radius: TURRET.ember.splash * (fs ? 1.6 : 1) * (1 + 0.12 * tu.stack) * (tu.react === 'shrapnel' ? 1.3 : 1), smoke: tu.react === 'smoke', fire: tu.react === 'wildfire',
        });
        sfx.shell();
        this.r.kickBlock(tu.b.id, 3.5);
        tu.cd = TURRET.ember.cd * tu.cdMult;
      }
    }

    // shells
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const p = s.from.clone().lerp(s.to, k);
      p.y += Math.sin(k * Math.PI) * (1.4 + s.from.distanceTo(s.to) * 0.15);
      s.mesh.position.copy(p);
      s.mesh.scale.setScalar(Math.min(1, 0.25 + k * 6));
      if (Math.floor(s.t * 30) !== Math.floor((s.t - dt) * 30)) this.r.trail(p, 0xff8a3a);
      s.mesh.rotation.x += dt * 12;
      s.mesh.rotation.z += dt * 7;
      if (k >= 1) {
        this.r.remove(s.mesh);
        this.r.ring(s.to, s.radius, 0xff8a3a, 0.35);
        this.r.puff(s.to, 3);
        sfx.boom();
        const gx = s.to.x + (N - 1) / 2, gy = s.to.z + (N - 1) / 2;
        if (s.fire) { this.fires.push({ x: gx, y: gy, r: s.radius, t: 2.5, dps: 1.2 * this.wave.hpScale }); this.r.ring(s.to, s.radius, 0xff4a1a, 2.5); }
        for (const e of this.enemies) {
          if (e.mode === 'fly' || e.dead) continue;
          if (Math.hypot(e.pos.x - gx, e.pos.y - gy) <= s.radius + e.def.size * 0.5) { this.damage(e, s.dmg); if (s.smoke) e.chill = 2; }
        }
        this.shells.splice(i, 1);
      }
    }

    // core pulse
    this.coreCd -= dt;
    if (this.coreCd <= 0) {
      const seismic = has('seismic');
      const lvl = this.hooks.coreLevel;
      const rad = (seismic ? 2.5 : 1.7) + 0.35 * lvl;
      const hits = this.enemies.filter(e => !e.dead && Math.hypot(e.pos.x - CORE.x, e.pos.y - CORE.y) <= rad);
      if (hits.length) {
        this.r.ring(world(CORE.x, CORE.y, 0.1), rad, 0xff9fc0, 0.45);
        for (const e of hits) this.damage(e, (seismic ? 6 : 2) + 2 * lvl, false, true);
        this.coreCd = 1.5;
      } else this.coreCd = 0.2;
    }

    // lightning rod
    if (has('lightning_rod')) {
      this.rodCd -= dt;
      if (this.rodCd <= 0) {
        const st = this.board.stats();
        const h = st.tallest;
        const tgt = h >= 2 ? this.nearestTarget(st.tallestAt.x, st.tallestAt.y, 3 + h * 0.5, true) : null;
        if (tgt) {
          this.r.lightning(world(st.tallestAt.x, st.tallestAt.y, h + 0.3), this.enemyWorld(tgt));
          sfx.zap();
          this.damage(tgt, h);
          this.rodCd = 2.5;
        } else this.rodCd = 0.3;
      }
    }

    this.weather(dt);
    this.rally = Math.max(0, this.rally - dt);
    for (const im of this.impacts) im.t -= dt;
    for (const im of this.impacts.filter(im => im.t <= 0)) this.landTopple(im.cells, im.d, im.chain);
    this.impacts = this.impacts.filter(im => im.t > 0);
    for (const dm of this.dominoes) dm.t -= dt;
    for (const dm of this.dominoes.filter(dm => dm.t <= 0)) {
      if (this.board.canTopple(dm.x, dm.y)) { this.hooks.chain(dm.chain + 1); this.r.floatText(world(dm.x, dm.y, this.board.height(dm.x, dm.y) + 1), `chain ×${dm.chain + 1}!`, '#fff0c0'); this.topple(dm.x, dm.y, dm.d, dm.chain); }
    }
    this.dominoes = this.dominoes.filter(dm => dm.t > 0);

    // arches
    if (has('arches')) {
      for (const e of this.enemies) {
        if (e.mode !== 'walk' || e.dead) continue;
        const ex = Math.round(e.pos.x), ey = Math.round(e.pos.y);
        if (!this.board.inBounds(ex, ey)) continue;
        const col = this.board.col(ex, ey);
        if (!col[0] && col.length) this.damage(e, 3 * dt);
      }
    }

    // cleanup
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.flash = Math.max(0, e.flash - dt);
      if (e.dead) {
        this.r.removeEnemy(e.view, e.def.color, true);
        this.enemies.splice(i, 1);
        continue;
      }
      e.t += dt;
      this.r.updateEnemy(e.view, this.enemyWorld(e), e.hp / e.maxHp, e.flash, e.slow > 0, e.def.color, e.t);
    }

    for (const { b } of this.board.blocks()) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);

    if (!this.queue.length && !this.enemies.length && !this.shells.length) this.done = true;
  }

  /** Biome hazards that act on their own during the night. */
  private weather(dt: number) {
    const { biome, vents } = this.hooks;
    const active = this.queue.length + this.enemies.length > 0;
    if (biome.gusts && active && (this.gustCd -= dt) <= 0) {
      this.gustCd = 9 + Math.random() * 6;
      const side = this.wave.sides[Math.floor(Math.random() * this.wave.sides.length)];
      // the wind catches the tallest tower on the windward half
      let best: { x: number; y: number; h: number } | null = null;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const windward = [y <= CORE.y, x >= CORE.x, y >= CORE.y, x <= CORE.x][side];
        const h = this.board.height(x, y);
        if (windward && h >= 4 && (!best || h > best.h)) best = { x, y, h };
      }
      if (best) {
        const top = this.board.col(best.x, best.y)[best.h - 1]!;
        this.r.gust(best.x, best.y, best.h - 1, side);
        if (top.mat === 'stone' || top.mat === 'rock') this.r.floatText(world(best.x, best.y, best.h + 0.8), 'holds!', '#fff1d6');
        else { this.r.floatText(world(best.x, best.y, best.h + 0.8), 'gust!', '#fff1d6'); this.destroyBlock(best.x, best.y, best.h - 1); }
      }
    }
    if (this.wave.weather === 'storm' && active && (this.stormCd -= dt) <= 0) {
      this.stormCd = 7 + Math.random() * 3;
      const st = this.board.stats();
      if (st.tallest >= 2) {
        const { x, y } = st.tallestAt, h = st.tallest;
        const top = this.board.col(x, y)[h - 1]!;
        this.r.lightning(world(x, y, h + 6), world(x, y, h));
        sfx.zap();
        if (top.mat === 'crystal') {
          // a crystal lightning rod throws the charge at nearby enemies
          for (const e of this.enemies.filter(e => !e.dead && Math.hypot(e.pos.x - x, e.pos.y - y) < 3.5).slice(0, 4)) {
            this.r.lightning(world(x, y, h), this.enemyWorld(e));
            this.damage(e, 5 * this.wave.hpScale * (this.hooks.has('storm_caller') ? 2 : 1), false, true);
          }
        } else this.destroyBlock(x, y, h - 1);
      }
    }
    if (vents.length && active && (this.ventCd -= dt) <= 0) {
      this.ventCd = 8 + Math.random() * 5;
      const v = vents[Math.floor(Math.random() * vents.length)];
      this.r.eruption(v.x, v.y);
      sfx.boom();
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = v.x + dx, y = v.y + dy;
        if (!this.board.inBounds(x, y)) continue;
        const z = this.board.col(x, y).findIndex(b => b);
        if (z === 0) this.destroyBlock(x, y, 0);
      }
      for (const e of this.enemies) {
        if (!e.dead && e.mode !== 'fly' && Math.hypot(e.pos.x - v.x, e.pos.y - v.y) < 1.7) this.damage(e, 6 * this.wave.hpScale, false, true);
      }
    }
  }

  private moveEnemy(e: Enemy, dt: number) {
    if (e.dead) return;
    if (e.stun > 0) { e.stun -= dt; return; }
    if (e.affix === 'regen') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.04 * dt);
    const speed = e.def.speed * (1 - e.slow) * dt * this.hooks.biome.enemySpeed * (this.wave.weather === 'moon' ? 1.15 : 1) * (e.affix === 'hasted' ? 1.4 : 1);
    e.chewing = null;

    if (e.type === 'boss') {
      e.shed -= dt;
      if (e.shed <= 0 && e.cur) { e.shed = 3.2; this.spawnAt('shard', e); }
    }

    if (e.type === 'wyrm') return this.moveWyrm(e, dt, speed);
    if (e.type === 'leviathan') {
      // tears the tops off towers it passes over
      e.alt = 3.8 + Math.sin(e.t) * 0.3;
      e.shed -= dt;
      if (e.shed <= 0) {
        e.shed = 4.5;
        const near: { x: number; y: number; h: number }[] = [];
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const h = this.board.height(x, y);
          if (h >= 3 && Math.hypot(x - e.pos.x, y - e.pos.y) <= 3.5) near.push({ x, y, h });
        }
        for (const c of near.sort((a, b) => b.h - a.h).slice(0, 2)) {
          this.r.beam(this.enemyWorld(e), world(c.x, c.y, c.h), 0x9fc4ff);
          this.destroyBlock(c.x, c.y, c.h - 1);
        }
      }
      const to = new THREE.Vector2(CORE.x, CORE.y).sub(e.pos);
      if (to.length() < 0.9) return this.hitCore(e);
      e.pos.addScaledVector(to.normalize(), speed);
      return;
    }

    if (e.mode === 'fly') {
      e.alt = 2.6 + Math.sin(e.t * 2) * 0.2;
      // bombers detour over the tallest tower first and drop their payload on it
      if (e.sapTarget) {
        const to = new THREE.Vector2(e.sapTarget.x, e.sapTarget.y).sub(e.pos);
        if (to.length() < 0.2) {
          const { x, y } = e.sapTarget;
          e.sapTarget = null;
          for (let n = 0; n < 2; n++) { const h = this.board.height(x, y); if (h) this.destroyBlock(x, y, h - 1); }
          this.r.ring(world(x, y, this.board.height(x, y) + 0.1), 1, 0x2f8fd8, 0.5);
          sfx.boom();
          this.r.shakeCam(0.2);
          // kamikaze: the bomb is the bomber
          e.dead = true;
          return;
        }
        e.pos.addScaledVector(to.normalize(), Math.min(speed, to.length()));
        return;
      }
      const to = new THREE.Vector2(CORE.x, CORE.y).sub(e.pos);
      if (to.length() < 0.7) return this.hitCore(e);
      e.pos.addScaledVector(to.normalize(), speed);
      return;
    }

    if (e.mode === 'climb') {
      // walks in a straight line, up and over whatever is in the way
      const gx = Math.round(e.pos.x), gy = Math.round(e.pos.y);
      const h = this.board.inBounds(gx, gy) && !this.board.isCore(gx, gy) ? this.board.height(gx, gy) : 0;
      e.alt += (h - e.alt) * Math.min(1, dt * 5);
      const to = new THREE.Vector2(CORE.x, CORE.y).sub(e.pos);
      if (to.length() < 0.7) return this.hitCore(e);
      e.pos.addScaledVector(to.normalize(), speed * (Math.abs(h - e.alt) > 0.3 ? 0.5 : 1));
      return;
    }

    if (e.mode === 'burrow') {
      e.alt = -0.15;
      if (Math.floor(e.t * 2) !== Math.floor((e.t + dt) * 2)) this.retargetSapper(e);
      if (!e.sapTarget || e.mode !== 'burrow') return;
      const to = new THREE.Vector2(e.sapTarget.x, e.sapTarget.y).sub(e.pos);
      if (to.length() < 0.15) {
        // blast the base of the column
        const { x, y } = e.sapTarget;
        for (let n = 0; n < 3; n++) {
          const col = this.board.col(x, y);
          const z = col.findIndex(b => b);
          if (z >= 0) this.destroyBlock(x, y, z);
        }
        this.r.ring(world(x, y, 0.1), 1.6, 0xffb02e, 0.5);
        sfx.boom();
        this.r.shakeCam(0.3);
        e.dead = true;
        return;
      }
      e.pos.addScaledVector(to.normalize(), Math.min(speed, to.length()));
      return;
    }

    // walking on the grid
    e.alt = 0;
    if (!e.next && e.cur) {
      e.next = this.board.nextStep(e.cur.x, e.cur.y);
    }
    if (!e.next) return;
    const nx = e.next.x, ny = e.next.y;
    const to = new THREE.Vector2(nx, ny).sub(e.pos);
    const dist = to.length();
    if (this.board.isCore(nx, ny)) {
      if (dist < 0.75) return this.hitCore(e);
    } else if (!this.board.passable(nx, ny)) {
      if (dist <= 0.66) {
        const blk = this.board.col(nx, ny)[0]!;
        e.chewing = { x: nx, y: ny };
        blk.hp -= e.def.chew * dt * (this.hooks.heat >= 7 ? 1.25 : 1);
        blk.flash = 0.08;
        sfx.chew();
        if (blk.hp <= 0) this.destroyBlock(nx, ny, 0);
        return;
      }
    } else if (dist < 0.05) {
      e.cur = { x: nx, y: ny };
      e.next = null;
      return;
    }
    e.pos.addScaledVector(to.normalize(), Math.min(speed, dist));
    // re-route at most once per cell: if flow field changed, the next cell may no longer be best
    if (e.cur && Math.floor(e.t * 3) !== Math.floor((e.t + dt) * 3)) {
      const best = this.board.nextStep(e.cur.x, e.cur.y);
      const curDist = e.pos.distanceTo(new THREE.Vector2(e.cur.x, e.cur.y));
      if ((best.x !== nx || best.y !== ny) && curDist < 0.3) e.next = best;
    }
  }

  /** The wyrm tunnels straight at the core, surfacing on a rhythm and ripping out the base block above it. */
  private moveWyrm(e: Enemy, dt: number, speed: number) {
    e.shed -= dt;
    if (e.shed <= 0) {
      e.hidden = !e.hidden;
      e.shed = e.hidden ? 3 : 3;
      if (!e.hidden) {
        const x = Math.round(e.pos.x), y = Math.round(e.pos.y);
        if (this.board.inBounds(x, y) && !this.board.isCore(x, y) && this.board.col(x, y)[0]) this.destroyBlock(x, y, 0);
        this.r.ring(world(e.pos.x, e.pos.y, 0.1), 1.2, ENEMIES.wyrm.color, 0.5);
        this.r.debris(world(e.pos.x, e.pos.y, 0.2), 0x8c6a55, 10);
        this.r.shakeCam(0.25);
        sfx.crumble();
      }
    }
    e.alt += ((e.hidden ? -1.1 : 0) - e.alt) * Math.min(1, dt * 6);
    // underground it still shows itself: a dust trail, then a warning ring just before it bursts up
    if (e.hidden) {
      const at = world(e.pos.x, e.pos.y, 0.05);
      if (Math.floor(e.t * 5) !== Math.floor((e.t - dt) * 5)) { this.r.puff(at, 1); this.r.debris(at, 0x8c6a55, 1); }
      if (e.shed < 0.9 && Math.floor(e.shed * 4) !== Math.floor((e.shed + dt) * 4)) this.r.ring(at, 1.2, 0xff5470, 0.35);
    }
    const to = new THREE.Vector2(CORE.x, CORE.y).sub(e.pos);
    if (to.length() < 0.8) return this.hitCore(e);
    // slower above ground: that is the window to hit it
    e.pos.addScaledVector(to.normalize(), speed * (e.hidden ? 1 : 0.25));
  }

  private hitCore(e: Enemy) {
    e.dead = true;
    this.hooks.coreDamage(e.def.coreDmg, e.type, this.enemyWorld(e));
  }

  /** The new unique blocks: ballista, spikes, vane, lodestone and hourglass. */
  private uniques(dt: number) {
    for (const u of this.specials) {
      const near = (r: number, ground = true) => this.enemies.filter(e => !e.dead && !e.hidden && (!ground || e.mode !== 'fly') && Math.hypot(e.pos.x - u.x, e.pos.y - u.y) <= r);
      if (u.mat === 'spikes') { for (const e of near(1.1)) this.damage(e, 1.4 * dt); continue; }
      if (u.mat === 'lodestone') { for (const e of this.enemies) if (!e.dead && e.mode === 'fly' && Math.hypot(e.pos.x - u.x, e.pos.y - u.y) <= 3) { e.slow = Math.max(e.slow, 0.5); e.marked = 0.2; } continue; }
      if (u.mat === 'hourglass') { if (this.t < 15) for (const e of near(3, false)) e.slow = Math.max(e.slow, 0.5); continue; }
      if ((u.cd -= dt) > 0) continue;
      if (u.mat === 'ballista') {
        const tgt = this.nearestTarget(u.x, u.y, 5.5 + 0.3 * u.z, true);
        if (!tgt) { u.cd = 0.2; continue; }
        u.cd = 2.5;
        this.r.shot(world(u.x, u.y, u.z + 0.8), this.enemyWorld(tgt), 0xffd08a);
        this.r.kickBlock(this.board.blockAt(u.x, u.y, u.z)?.id ?? -1, 4);
        this.damage(tgt, 6, false, true);
        sfx.shell();
      } else if (u.mat === 'vane') {
        u.cd = 6;
        const hit = near(3).filter(e => e.mode === 'walk');
        if (!hit.length) continue;
        this.r.ring(world(u.x, u.y, 0.1), 3, 0xd8e6f0, 0.5);
        for (const e of hit) this.pushBack(e);
      }
    }
  }

  /** Blow a walking enemy one open cell further from the core. */
  private pushBack(e: Enemy) {
    const cx = Math.round(e.pos.x), cy = Math.round(e.pos.y);
    let best: { x: number; y: number } | null = null, bd = this.board.distAt(cx, cy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx, y = cy + dy;
      if (!this.board.inBounds(x, y) || this.board.height(x, y) || this.board.isCore(x, y)) continue;
      const d = this.board.distAt(x, y);
      if (d > bd) { bd = d; best = { x, y }; }
    }
    if (!best) { e.stun = Math.max(e.stun, 0.8); return; }
    e.pos.set(best.x, best.y);
    e.cur = best;
    e.next = null;
    e.chewing = null;
  }

  /** Turrets reload twice as fast for a few seconds. */
  rallyNow(seconds: number) {
    this.rally = seconds;
    for (const tu of this.turrets) this.r.ring(world(tu.x, tu.y, tu.z + 1), 0.8, 0xffd34a, 0.5);
    sfx.unlock();
  }

  /** Strengthen one column: its blocks are fully repaired and gain 50% max HP for the rest of the run. */
  shoreUp(x: number, y: number) {
    for (const b of this.board.col(x, y)) if (b) { b.maxHp = Math.round(b.maxHp * 1.5); b.hp = b.maxHp; }
    this.r.ring(world(x, y, 0.1), 1.1, 0xfff1d6, 0.6);
    for (let z = 0; z < this.board.height(x, y); z++) this.r.kickBlock(this.board.col(x, y)[z]?.id ?? -1, 3);
    sfx.place();
  }

  dispose() {
    for (const e of this.enemies) this.r.removeEnemy(e.view, 0, false);
    for (const s of this.shells) this.r.remove(s.mesh);
    this.enemies = [];
    this.shells = [];
  }
}
