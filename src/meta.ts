import { MatId } from './config';
import { FounderId } from './pieces';

export type RelicId =
  | 'cartographer' | 'bulwark' | 'prism' | 'firestorm' | 'deep_roots' | 'masons_guild'
  | 'frontier' | 'seismic' | 'thrift' | 'vault' | 'spyglass' | 'mortar' | 'reinforced'
  | 'lightning_rod' | 'arches' | 'gravity_well' | 'plumb_line' | 'tapestry' | 'focus_lens' | 'mosaic'
  | 'domino' | 'storm_caller' | 'tipping_point';

export interface RelicDef { id: RelicId; name: string; icon: string; desc: string; price: number; locked?: CodexId }

export const RELICS: RelicDef[] = [
  { id: 'cartographer', name: 'Cartographer', icon: '▦', price: 10, desc: '+1 gold each morning for every 6 cells of ground you build on.' },
  { id: 'bulwark', name: 'Bulwark', icon: '■', price: 9, desc: 'Stone blocks have double HP.' },
  { id: 'prism', name: 'Prism', icon: '◆', price: 12, desc: 'Crystal beams chain to a second enemy.' },
  { id: 'firestorm', name: 'Firestorm', icon: '✸', price: 11, desc: 'Ember shells: +60% splash radius and +1 damage.' },
  { id: 'deep_roots', name: 'Deep Roots', icon: '♣', price: 8, desc: 'Gardens make gold at any height.' },
  { id: 'masons_guild', name: "Masons' Guild", icon: '▲', price: 8, desc: '+1 gold whenever you place a piece with no block on the ground.' },
  { id: 'frontier', name: 'Frontier', icon: '▭', price: 8, desc: '+1 gold whenever you place a piece entirely on the ground.' },
  { id: 'seismic', name: 'Seismic Core', icon: '◎', price: 10, desc: 'The core pulse hits 3x harder and reaches further.' },
  { id: 'thrift', name: 'Thrift', icon: '◇', price: 7, desc: 'Shop prices are 30% lower.' },
  { id: 'vault', name: 'Treasury Vault', icon: '⊞', price: 9, desc: 'Every morning, +1 gold for every 10 gold you are saving (up to +4).' },
  { id: 'spyglass', name: 'Spyglass', icon: '◉', price: 11, desc: 'All turret blocks get +1 range.' },
  { id: 'mortar', name: 'Mortar', icon: '▤', price: 9, desc: 'Blocks above ground level get +50% HP.' },
  { id: 'reinforced', name: 'Reinforced Core', icon: '✚', price: 9, desc: '+5 max core HP, and fully heals the core.' },
  { id: 'lightning_rod', name: 'Lightning Rod', icon: 'ϟ', price: 13, locked: 'skyscraper', desc: 'Your tallest column strikes every 2.5s for damage equal to its height.' },
  { id: 'arches', name: 'Vaulted Arches', icon: '∩', price: 11, locked: 'cathedral', desc: 'Enemies under overhangs take 3 damage/s. +1 gold each morning per 2 hollows (max 6).' },
  { id: 'gravity_well', name: 'Gravity Well', icon: '▼', price: 11, locked: 'avalanche', desc: 'Falling blocks deal 3x damage and also hit adjacent cells.' },
  { id: 'plumb_line', name: 'Plumb Line', icon: '┃', price: 13, locked: 'needle', desc: 'Turret blocks at level 4+ deal double damage.' },
  { id: 'tapestry', name: 'Tapestry', icon: '▩', price: 12, locked: 'carpet', desc: 'Ground blocks have +50% HP, and ground turrets get +1 range.' },
  { id: 'focus_lens', name: 'Focus Lens', icon: '◈', price: 12, locked: 'purist', desc: 'Crystals fire 35% faster.' },
  { id: 'domino', name: 'Domino Theory', icon: '⧉', price: 11, locked: 'domino_chain', desc: 'Chain topples never stop, and every link in the chain crushes 50% harder than the last.' },
  { id: 'storm_caller', name: 'Storm Caller', icon: 'ϟ', price: 10, locked: 'globetrotter', desc: 'Every night is a thunderstorm, and crystal-topped towers throw double-strength lightning.' },
  { id: 'tipping_point', name: 'Tipping Point', icon: '⤵', price: 9, locked: 'collector', desc: '+1 topple every night, and every topple pays 2 gold.' },
  { id: 'mosaic', name: 'Mosaic', icon: '❖', price: 12, locked: 'mosaic', desc: 'Turret blocks get +15% damage for each different material touching them.' },
];

export const relicDef = (id: RelicId) => RELICS.find(r => r.id === id)!;

export type CodexId =
  | 'first_light' | 'skyscraper' | 'cathedral' | 'avalanche' | 'needle' | 'carpet'
  | 'purist' | 'mosaic' | 'untouched' | 'victory' | 'grand_architect'
  | 'domino_chain' | 'globetrotter' | 'collector';

export interface RunStats {
  nights: number;
  maxTallest: number;
  maxHollows: number;
  fallKills: number;
  kills: number;
  placedMats: Set<MatId>;
  coreDamaged: boolean;
  finalFootprint: number;
  finalMats: Set<MatId>;
  won: boolean;
  maxChain: number;
  calderaNights: number;
  maxUniques: number;
}

export interface CodexDef {
  id: CodexId;
  name: string;
  req: string;
  reward: string;
  midRun: boolean; // can be earned before the run ends
  check: (s: RunStats, unlocked: Set<CodexId>) => boolean;
}

export const CODEX: CodexDef[] = [
  { id: 'first_light', name: 'First Light', req: 'Survive 4 nights.', reward: 'Ward blocks join the draft pool. Founder: Pyromancer.', midRun: true,
    check: s => s.nights >= 4 },
  { id: 'victory', name: 'Founder', req: 'Win a run.', reward: 'Founder: Sprawler.', midRun: false,
    check: s => s.won },
  { id: 'skyscraper', name: 'Skyscraper', req: 'Build a column 10 blocks tall.', reward: 'Relic: Lightning Rod. Founder: Spirewright.', midRun: true,
    check: s => s.maxTallest >= 10 },
  { id: 'cathedral', name: 'Cathedral', req: 'Have 12 hollow spaces under overhangs at once.', reward: 'Relic: Vaulted Arches.', midRun: true,
    check: s => s.maxHollows >= 12 },
  { id: 'avalanche', name: 'Avalanche', req: 'Crush 20 enemies with falling blocks in one run.', reward: 'Relic: Gravity Well. Founder: Quarryman.', midRun: true,
    check: s => s.fallKills >= 20 },
  { id: 'needle', name: 'Needle', req: 'Win with a footprint of 24 cells or fewer.', reward: 'Beacon blocks join the draft pool. Relic: Plumb Line.', midRun: false,
    check: s => s.won && s.finalFootprint <= 24 },
  { id: 'carpet', name: 'Carpet', req: 'Win without any column ever taller than 2.', reward: 'Relic: Tapestry.', midRun: false,
    check: s => s.won && s.maxTallest <= 2 },
  { id: 'purist', name: 'Purist', req: 'Win without placing both Crystal and Ember.', reward: 'Relic: Focus Lens.', midRun: false,
    check: s => s.won && !(s.placedMats.has('crystal') && s.placedMats.has('ember')) },
  { id: 'mosaic', name: 'Mosaic', req: 'Win with 5 different materials on the board.', reward: 'Relic: Mosaic.', midRun: false,
    check: s => s.won && s.finalMats.size >= 5 },
  { id: 'domino_chain', name: 'Domino', req: 'Knock over 3 towers in one chain.', reward: 'Relic: Domino Theory.', midRun: true,
    check: s => s.maxChain >= 3 },
  { id: 'globetrotter', name: 'Globetrotter', req: 'Survive a night in the Caldera.', reward: 'Relic: Storm Caller.', midRun: true,
    check: s => s.calderaNights >= 1 },
  { id: 'collector', name: 'Collector', req: 'Have 3 unique blocks on your island at once.', reward: 'Relic: Tipping Point.', midRun: true,
    check: s => s.maxUniques >= 3 },
  { id: 'untouched', name: 'Untouched', req: 'Win without the core taking damage.', reward: '+3 core HP in every run.', midRun: false,
    check: s => s.won && !s.coreDamaged },
  { id: 'grand_architect', name: 'Grand Architect', req: 'Complete Needle, Carpet and Cathedral.', reward: 'Hand size +1, and every run starts with a free relic.', midRun: true,
    check: (_s, u) => u.has('needle') && u.has('carpet') && u.has('cathedral') },
];

// ---------- atelier: Hades-style persistent upgrades bought with seals ----------

/** Heat: optional stacking difficulty after your first win. Each level adds its rule to all below it. */
export const HEATS = [
  'Enemies have +20% HP.',
  'Start with 3 less gold and 3 less core HP.',
  'Elites appear from night 2, twice as often.',
  'Act guardians have +50% HP.',
  'Treasure spots on the map become events.',
];

export const SEALS = { night: 1, hardNight: 3, win: 8, plate: 6 };

export type UpgradeId =
  | 'foundations' | 'treasury' | 'tithe' | 'masonry' | 'lens' | 'kiln'
  | 'draughtsman' | 'redraft' | 'eye' | 'haggling' | 'keystone' | 'cartouche' | 'leverage';

export interface UpgradeDef { id: UpgradeId; name: string; icon: string; costs: number[]; desc: (rank: number) => string; locked?: CodexId }

export const UPGRADES: UpgradeDef[] = [
  { id: 'foundations', name: 'Foundations', icon: '▣', costs: [4, 8, 14, 20, 28], desc: r => `+${2 * r} max core HP` },
  { id: 'treasury', name: 'Treasury', icon: '⊚', costs: [3, 6, 10, 16], desc: r => `start each run with +${2 * r} gold` },
  { id: 'tithe', name: 'Standing Tithe', icon: '⊕', costs: [6, 12, 20], desc: r => `+${r} gold every morning` },
  { id: 'masonry', name: 'Masonry', icon: '▤', costs: [5, 10, 16], desc: r => `stone blocks +${15 * r}% HP` },
  { id: 'lens', name: 'Lens Grinding', icon: '◇', costs: [6, 12, 20], desc: r => `crystal damage +${10 * r}%` },
  { id: 'kiln', name: 'Kiln', icon: '△', costs: [6, 12, 20], desc: r => `ember damage +${10 * r}%` },
  { id: 'leverage', name: 'Leverage', icon: '⤵', costs: [8, 16, 26], desc: r => `topple ${1 + r} towers every night` },
  { id: 'draughtsman', name: 'Draughtsman', icon: '✎', costs: [10, 22], desc: r => `${3 + r} free pieces to choose from each morning` },
  { id: 'redraft', name: 'Redraft', icon: '↻', costs: [8, 18], desc: r => `swap your unused pieces ${r}× per day`, locked: 'first_light' },
  { id: 'eye', name: 'Surveyor’s Eye', icon: '◉', costs: [10, 18, 28], desc: r => `all turrets +${(0.25 * r).toFixed(2)} range`, locked: 'skyscraper' },
  { id: 'haggling', name: 'Haggling', icon: '%', costs: [8, 16], desc: r => `market prices −${10 * r}%`, locked: 'cathedral' },
  { id: 'cartouche', name: 'Cartouche', icon: '✦', costs: [15, 30], desc: r => `start each run holding ${r} random relic${r > 1 ? 's' : ''}`, locked: 'avalanche' },
  { id: 'keystone', name: 'Keystone', icon: '⌂', costs: [25], desc: () => 'once per run, a lethal blow leaves the core at 3 HP', locked: 'victory' },
];

interface SaveData { unlocked: CodexId[]; runs: number; wins: number; bestNight: number; seals?: number; ranks?: Partial<Record<UpgradeId, number>>; heatWon?: number }

const KEY = 'spire-sprawl-save-v1';

export class Meta {
  unlocked = new Set<CodexId>();
  runs = 0;
  wins = 0;
  bestNight = 0;
  /** highest heat level won (-1 = no wins yet) */
  heatWon = -1;
  heat = 0;
  seals = 0;
  ranks: Partial<Record<UpgradeId, number>> = {};

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as SaveData;
        this.unlocked = new Set(d.unlocked);
        this.runs = d.runs; this.wins = d.wins; this.bestNight = d.bestNight;
        this.seals = d.seals ?? 0; this.ranks = d.ranks ?? {};
        this.heatWon = d.heatWon ?? (d.wins > 0 ? 0 : -1);
      }
    } catch { /* storage unavailable: play without saves */ }
  }

  save() {
    try {
      const d: SaveData = { unlocked: [...this.unlocked], runs: this.runs, wins: this.wins, bestNight: this.bestNight, seals: this.seals, ranks: this.ranks, heatWon: this.heatWon };
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch { /* ignore */ }
  }

  reset() { this.unlocked.clear(); this.runs = 0; this.wins = 0; this.bestNight = 0; this.seals = 0; this.ranks = {}; this.heatWon = -1; this.heat = 0; this.save(); }

  /** Heat levels you may pick: one above the highest you have won. */
  maxHeat() { return Math.min(HEATS.length, this.heatWon + 1); }

  rank(id: UpgradeId) { return this.ranks[id] ?? 0; }
  totalRanks() { return Object.values(this.ranks).reduce((s, r) => s + (r ?? 0), 0); }

  buy(id: UpgradeId): boolean {
    const u = UPGRADES.find(x => x.id === id)!;
    const r = this.rank(id);
    if (r >= u.costs.length || (u.locked && !this.has(u.locked)) || this.seals < u.costs[r]) return false;
    this.seals -= u.costs[r];
    this.ranks[id] = r + 1;
    this.save();
    return true;
  }

  /** Respec: take back the last rank of an upgrade for a full refund. */
  refund(id: UpgradeId): boolean {
    const r = this.rank(id);
    if (!r) return false;
    this.seals += UPGRADES.find(x => x.id === id)!.costs[r - 1];
    this.ranks[id] = r - 1;
    this.save();
    return true;
  }

  refundAll() {
    for (const u of UPGRADES) while (this.rank(u.id)) this.refund(u.id);
  }

  /** seals currently invested in upgrades */
  invested() { return UPGRADES.reduce((s, u) => s + u.costs.slice(0, this.rank(u.id)).reduce((a, b) => a + b, 0), 0); }

  has(id: CodexId) { return this.unlocked.has(id); }

  /** Evaluate codex entries; returns newly earned ones. */
  evaluate(s: RunStats, endOfRun: boolean): CodexDef[] {
    const earned: CodexDef[] = [];
    // two passes so grand_architect can chain off entries earned this same call
    for (let pass = 0; pass < 2; pass++) {
      for (const c of CODEX) {
        if (this.unlocked.has(c.id) || (!c.midRun && !endOfRun)) continue;
        if (c.check(s, this.unlocked)) { this.unlocked.add(c.id); earned.push(c); this.seals += SEALS.plate; }
      }
    }
    if (earned.length) this.save();
    return earned;
  }

  matPool(): MatId[] {
    const m: MatId[] = ['stone', 'garden', 'crystal', 'ember'];
    if (this.has('first_light')) m.push('ward');
    if (this.has('needle')) m.push('beacon');
    return m;
  }

  relicPool() { return RELICS.filter(r => !r.locked || this.unlocked.has(r.locked)); }

  founders(): FounderId[] {
    const f: FounderId[] = ['settler'];
    if (this.has('skyscraper')) f.push('spirewright');
    if (this.has('victory')) f.push('sprawler');
    if (this.has('first_light')) f.push('pyromancer');
    if (this.has('avalanche')) f.push('quarryman');
    return f;
  }
}
