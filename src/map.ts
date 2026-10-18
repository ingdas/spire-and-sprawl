import { ContractId, WeatherId } from './sim';
import { rand } from './rng';

/** Every act is a small branching map. Battles are nights; the stops between them each do one thing. */
export type StopKind = 'shop' | 'camp' | 'forge' | 'event' | 'treasure' | 'unique';
export type NodeKind = 'battle' | 'guardian' | StopKind;

export interface MapNode {
  id: number;
  row: number;
  lane: number;
  kind: NodeKind;
  /** battles: the night's contract and pre-rolled weather */
  contract?: ContractId;
  weather?: WeatherId | null;
  /** the night this battle is (1..12) */
  night?: number;
  next: number[];
}

export interface ActMap { nodes: MapNode[]; rows: number; at: number | null; visited: number[] }

export const STOPS: Record<StopKind, { icon: string; name: string; desc: string }> = {
  shop: { icon: '$', name: 'Shop', desc: 'Spend gold on relics, pieces and core repairs.' },
  camp: { icon: '✚', name: 'Camp', desc: 'Pick one: heal the core, fix every damaged block, or power up the core pulse.' },
  forge: { icon: '⚒', name: 'Forge', desc: 'Improve one piece for free, or throw one away.' },
  event: { icon: '?', name: 'Mystery', desc: 'Something unexpected. Could be good, could be a gamble.' },
  treasure: { icon: '✦', name: 'Treasure', desc: 'Pick one of three relics for free.' },
  unique: { icon: '★', name: 'Rare block', desc: 'Pick one of two unique blocks, each with its own special rule.' },
};

export const GUARDIAN_INFO = { icon: '♛', name: 'Boss night' };

/** Row layout for one act: B = battle, S = stop, G = guardian. Night 1 of the act is a single start node. */
const LAYOUT = ['B', 'S', 'B', 'S', 'B', 'S', 'S', 'G'] as const;
const LANES = 3;

const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const shuffle = <T>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const STOP_WEIGHTS: [StopKind, number][] = [['shop', 4], ['camp', 3], ['forge', 2], ['event', 2], ['treasure', 1.5], ['unique', 1.5]];
const CONTRACT_POOL: ContractId[] = ['standard', 'calm', 'bounty', 'skyward', 'siege'];

function weighted(exclude: StopKind[]): StopKind {
  const pool = STOP_WEIGHTS.filter(([k]) => !exclude.includes(k));
  let r = rand() * pool.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of pool) if ((r -= w) <= 0) return k;
  return pool[0][0];
}

export function rollWeather(night: number, guardian: boolean): WeatherId | null {
  return night >= 2 && !guardian && rand() < 0.35 ? pick(['fog', 'storm', 'moon'] as WeatherId[]) : null;
}

export function makeMap(act: number, opts: { treasure: boolean }): ActMap {
  const nodes: MapNode[] = [];
  const rows: MapNode[][] = [];
  let night = act * 4;
  LAYOUT.forEach((t, row) => {
    const single = row === 0 || t === 'G';
    if (t !== 'S') night++;
    const lanes = single ? [1] : [0, 1, 2];
    // battle rows offer a spread of contracts; stop rows a spread of stops (no repeats within a row)
    const contracts = shuffle([...CONTRACT_POOL]);
    const used: StopKind[] = [];
    rows.push(lanes.map((lane, i) => {
      const n: MapNode = { id: nodes.length, row, lane, kind: t === 'G' ? 'guardian' : t === 'B' ? 'battle' : 'shop', next: [] };
      if (t === 'B') {
        n.contract = single ? 'standard' : contracts[i];
        n.night = night;
        n.weather = rollWeather(night, false);
      } else if (t === 'G') {
        n.night = night;
        n.weather = null;
      } else {
        // the stop right before the boss always offers a camp and a shop
        const k = row === LAYOUT.length - 2 && i < 2 ? (['camp', 'shop'] as StopKind[])[i] : weighted(used);
        n.kind = k;
        used.push(k);
      }
      nodes.push(n);
      return n;
    }));
  });
  // guarantee one shop, one rare block and one treasure per act (treasure turns into an event at high heat)
  const stops = nodes.filter(n => n.kind !== 'battle' && n.kind !== 'guardian' && n.row < LAYOUT.length - 2);
  for (const k of ['shop', 'unique', 'treasure'] as StopKind[]) {
    if (stops.some(n => n.kind === k)) continue;
    const spare = stops.filter(n => !(['shop', 'unique', 'treasure'] as NodeKind[]).includes(n.kind) && !rows[n.row].some(m => m.kind === k));
    if (spare.length) pick(spare).kind = k;
  }
  // shuffle the camp and shop before the boss so they are not always in the same lanes
  const pre = rows[LAYOUT.length - 2];
  const kinds = shuffle(pre.map(n => n.kind));
  pre.forEach((n, i) => (n.kind = kinds[i]));
  // later acts get sharper: act 2 always offers a hard night on every battle row,
  // act 3 trades the pre-boss rest for two shops (spend everything before the end)
  if (act >= 1) for (const r of rows) {
    if (r.length < 3 || r[0].kind !== 'battle') continue;
    if (!r.some(n => n.contract === 'siege' || n.contract === 'skyward')) pick(r.filter(n => n.contract !== 'standard')).contract = rand() < 0.5 ? 'siege' : 'skyward';
  }
  if (act === 2) {
    const pre = rows[LAYOUT.length - 2];
    const shops = pre.filter(n => n.kind === 'shop').length;
    if (shops < 2) { const other = pre.find(n => n.kind !== 'shop' && n.kind !== 'camp'); if (other) other.kind = 'shop'; }
  }
  if (!opts.treasure) for (const n of nodes) if (n.kind === 'treasure') n.kind = 'event';
  // edges: straight up the lane, plus at most one diagonal per lane gap so paths never cross
  for (let r = 0; r < rows.length - 1; r++) {
    const a = rows[r], b = rows[r + 1];
    if (a.length === 1 || b.length === 1) { for (const n of a) n.next = b.map(m => m.id); continue; }
    for (let l = 0; l < LANES; l++) a[l].next.push(b[l].id);
    for (let l = 0; l < LANES - 1; l++) {
      const roll = rand();
      if (roll < 0.35) a[l].next.push(b[l + 1].id);
      else if (roll < 0.7) a[l + 1].next.push(b[l].id);
    }
  }
  return { nodes, rows: LAYOUT.length, at: null, visited: [] };
}

/** How hard each kind of night is, 1-4, shown as pips on the map. */
export const DANGER: Record<string, number> = { calm: 1, standard: 2, bounty: 3, siege: 3, skyward: 3, guardian: 4 };

/** Every node still reachable from where you stand (including the next ones). */
export function ahead(m: ActMap): Set<number> {
  const out = new Set<number>();
  const todo = reachable(m).map(n => n.id);
  while (todo.length) {
    const id = todo.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    todo.push(...m.nodes[id].next);
  }
  return out;
}

/** Nodes the player may move to next. */
export function reachable(m: ActMap): MapNode[] {
  if (m.at === null) return m.nodes.filter(n => n.row === 0);
  return m.nodes[m.at].next.map(id => m.nodes[id]);
}
