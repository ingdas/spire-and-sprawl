import { CORE, MATS, MAX_HEIGHT, MatId, N } from './config';
import { PBlock } from './pieces';

export interface Block {
  id: number;
  mat: MatId;
  hp: number;
  maxHp: number;
  flash: number;
  gilded?: boolean;
}

export interface Placement {
  ok: boolean;
  reason?: string;
  cells: { x: number; y: number; z: number; mat: MatId }[];
}

export interface FallEvent { x: number; y: number; count: number; drop: number; heavy: boolean }

let blockId = 1;

/** Compass directions in grid space: north, east, south, west (matches wave side numbering). */
export const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class Board {
  cols: (Block | null)[][] = [];
  dist: number[] = [];
  /** Exposed (can fire) flag keyed by block id. */
  exposed = new Set<number>();
  version = 0;

  constructor() {
    for (let i = 0; i < N * N; i++) this.cols.push([]);
    this.recompute();
  }

  idx(x: number, y: number) { return y * N + x; }
  inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < N && y < N; }
  isCore(x: number, y: number) { return x === CORE.x && y === CORE.y; }
  col(x: number, y: number) { return this.cols[this.idx(x, y)]; }

  /** Copy of every column (blocks are copied too), for undoing a placement. */
  snapshot(): (Block | null)[][] { return this.cols.map(c => c.map(b => (b ? { ...b } : null))); }
  restore(cols: (Block | null)[][]) { this.cols = cols.map(c => c.map(b => (b ? { ...b } : null))); this.recompute(); }
  height(x: number, y: number) { return this.inBounds(x, y) ? this.col(x, y).length : 0; }
  blockAt(x: number, y: number, z: number): Block | null {
    if (!this.inBounds(x, y)) return null;
    return this.col(x, y)[z] ?? null;
  }
  passable(x: number, y: number) { return !this.col(x, y)[0]; }

  /** Work out where a (rotated) piece would land with its origin at (ax, ay). */
  evaluate(blocks: PBlock[], ax: number, ay: number): Placement {
    const cells: Placement['cells'] = [];
    const zmin = new Map<number, number>();
    for (const b of blocks) {
      const x = ax + b.x, y = ay + b.y;
      if (!this.inBounds(x, y)) return { ok: false, reason: 'Off the island', cells: [] };
      const k = this.idx(x, y);
      zmin.set(k, Math.min(zmin.get(k) ?? Infinity, b.z));
    }
    let L = 0;
    for (const [k, zm] of zmin) L = Math.max(L, this.cols[k].length - zm);
    let touchesCore = false, touches = false;
    for (const b of blocks) {
      const x = ax + b.x, y = ay + b.y;
      cells.push({ x, y, z: L + b.z, mat: b.mat });
    }
    for (const c of cells) {
      if (this.isCore(c.x, c.y)) return { ok: false, reason: 'Cannot build on the core', cells };
      if (c.z >= MAX_HEIGHT) return { ok: false, reason: 'Too tall', cells };
      if (this.height(c.x, c.y) > 0) touches = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, ny = c.y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (this.isCore(nx, ny)) touchesCore = true;
        if (this.height(nx, ny) > 0) touches = true;
      }
    }
    if (!touches && !touchesCore) return { ok: false, reason: 'Must connect to your settlement', cells };
    return { ok: true, cells };
  }

  place(p: Placement, hpMult: (mat: MatId, z: number) => number): Block[] {
    const made: Block[] = [];
    for (const c of p.cells) {
      const col = this.col(c.x, c.y);
      while (col.length < c.z) col.push(null);
      const maxHp = Math.round(MATS[c.mat].hp * hpMult(c.mat, c.z));
      const b: Block = { id: blockId++, mat: c.mat, hp: maxHp, maxHp, flash: 0 };
      col[c.z] = b;
      made.push(b);
    }
    this.recompute();
    return made;
  }

  /** Remove the block at (x,y,z); the run of blocks directly above it falls down. */
  destroy(x: number, y: number, z: number): FallEvent | null {
    const col = this.col(x, y);
    if (!col[z]) return null;
    col[z] = null;
    let top = z + 1;
    while (top < col.length && col[top]) top++;
    const seg = col.slice(z + 1, top);
    let rest = z;
    while (rest > 0 && !col[rest - 1]) rest--;
    let ev: FallEvent | null = null;
    if (seg.length) {
      for (let i = z + 1; i < top; i++) col[i] = null;
      seg.forEach((b, i) => (col[rest + i] = b));
      ev = { x, y, count: seg.length, drop: z + 1 - rest, heavy: seg.some(b => b!.mat === 'anvil') };
    }
    while (col.length && !col[col.length - 1]) col.pop();
    this.recompute();
    return ev;
  }

  /**
   * Where each block of the column at (x,y) lands if the tower tips over in direction d (0 N, 1 E, 2 S, 3 W).
   * The bottom block lands next door, the top block lands farthest away. `z` is -1 for blocks that are lost.
   */
  toppleCells(x: number, y: number, d: number): { x: number; y: number; z: number; mat: MatId }[] {
    const [dx, dy] = DIRS[d];
    const stack = this.col(x, y).filter((b): b is Block => !!b);
    return stack.map((b, i) => {
      const tx = x + dx * (i + 1), ty = y + dy * (i + 1);
      const h = this.height(tx, ty);
      const lost = !this.inBounds(tx, ty) || this.isCore(tx, ty) || h >= MAX_HEIGHT;
      return { x: tx, y: ty, z: lost ? -1 : h, mat: b.mat };
    });
  }

  /** Landscape blocks: placed directly, no connection rules. */
  addTerrain(x: number, y: number, h: number, mat: MatId, hp: number) {
    const col = this.col(x, y);
    for (let i = 0; i < h && col.length < MAX_HEIGHT; i++) col.push({ id: blockId++, mat, hp, maxHp: hp, flash: 0 });
    this.recompute();
  }

  /** The journey between biomes: the rim breaks off and very tall towers lose their tops. */
  journeyDamage(maxH: number): { rim: number; tops: number } {
    let rim = 0, tops = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y);
      const col = this.cols[i];
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) { rim += col.filter(Boolean).length; this.cols[i] = []; continue; }
      if (col.length > maxH) { tops += col.slice(maxH).filter(Boolean).length; col.length = maxH; }
      // the cut can expose a hollow; a column never ends in an empty slot
      while (col.length && !col[col.length - 1]) col.pop();
    }
    this.recompute();
    return { rim, tops };
  }

  canTopple(x: number, y: number) { return this.col(x, y).filter(Boolean).length >= 2; }

  /** Tip the tower over: it becomes a line of blocks along the ground. */
  topple(x: number, y: number, d: number) {
    const cells = this.toppleCells(x, y, d);
    const stack = this.col(x, y).filter((b): b is Block => !!b);
    this.cols[this.idx(x, y)] = [];
    cells.forEach((c, i) => { if (c.z >= 0) this.col(c.x, c.y).push(stack[i]); });
    this.recompute();
    return cells;
  }

  recompute() {
    this.version++;
    this.computeExposure();
    this.computeFlow();
  }

  private computeExposure() {
    this.exposed.clear();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const col = this.col(x, y);
      col.forEach((b, z) => {
        if (!b) return;
        const open = !col[z + 1] ||
          [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !this.blockAt(x + dx, y + dy, z) && !this.isCoreAt(x + dx, y + dy, z));
        if (open) this.exposed.add(b.id);
      });
    }
  }

  private isCoreAt(x: number, y: number, z: number) { return this.isCore(x, y) && z < 2; }

  /** Cost for an enemy to step into a cell: blocked cells must be chewed through. */
  enterCost(x: number, y: number) {
    const col = this.col(x, y);
    if (!col[0]) return 1;
    let hp = 0;
    for (let z = 0; z < col.length && col[z]; z++) hp += col[z]!.hp;
    return 1 + hp * 0.35;
  }

  private computeFlow() {
    const dist = new Array(N * N).fill(Infinity);
    const start = this.idx(CORE.x, CORE.y);
    dist[start] = 0;
    // small board: simple O(n^2) Dijkstra is plenty
    const done = new Array(N * N).fill(false);
    for (;;) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < N * N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; best = i; }
      if (best < 0) break;
      done[best] = true;
      const bx = best % N, by = Math.floor(best / N);
      const stepCost = best === start ? 0 : this.enterCost(bx, by);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = bx + dx, ny = by + dy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        const nd = bd + stepCost;
        if (nd < dist[ni]) dist[ni] = nd;
      }
    }
    this.dist = dist;
  }

  distAt(x: number, y: number) { return this.inBounds(x, y) ? this.dist[this.idx(x, y)] : Infinity; }

  /** Best neighbor step toward the core from (x,y). */
  nextStep(x: number, y: number): { x: number; y: number } {
    let best = { x, y }, bd = Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const d = this.isCore(nx, ny) ? -1 : this.dist[this.idx(nx, ny)] + this.enterCost(nx, ny);
      if (d < bd) { bd = d; best = { x: nx, y: ny }; }
    }
    return best;
  }

  *blocks(): Generator<{ x: number; y: number; z: number; b: Block }> {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const col = this.col(x, y);
      for (let z = 0; z < col.length; z++) {
        const b = col[z];
        if (b) yield { x, y, z, b };
      }
    }
  }

  stats() {
    let tallest = 0, footprint = 0, hollows = 0, groundGardens = 0, gardens = 0;
    let tx = -1, ty = -1;
    const mats = new Set<MatId>();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const col = this.col(x, y);
      if (col.length) footprint++;
      if (col.length > tallest) { tallest = col.length; tx = x; ty = y; }
      col.forEach((b, z) => {
        if (!b) { hollows++; return; }
        mats.add(b.mat);
        if (b.mat === 'garden') { gardens++; if (z === 0) groundGardens++; }
      });
    }
    const turrets = [...this.blocks()].filter(b => MATS[b.b.mat].turret).length;
    return { tallest, tallestAt: { x: tx, y: ty }, footprint, hollows, groundGardens, gardens, mats, turrets };
  }
}
