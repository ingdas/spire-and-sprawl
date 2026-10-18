import { MATS, MatId } from './config';

export interface PBlock { x: number; y: number; z: number; mat: MatId }
export interface Piece { uid: number; name: string; blocks: PBlock[]; gilded?: boolean }

type Cell3 = [number, number, number];
interface ShapeDef { name: string; cells: Cell3[]; weight: number }

const flat = (pts: [number, number][]): Cell3[] => pts.map(([x, y]) => [x, y, 0]);

export const SHAPES: ShapeDef[] = [
  { name: 'Pebble', cells: flat([[0, 0]]), weight: 0.6 },
  { name: 'Slab', cells: flat([[0, 0], [1, 0]]), weight: 1 },
  { name: 'Line', cells: flat([[0, 0], [1, 0], [2, 0]]), weight: 1 },
  { name: 'Corner', cells: flat([[0, 0], [1, 0], [0, 1]]), weight: 1 },
  { name: 'Wall', cells: flat([[0, 0], [1, 0], [2, 0], [3, 0]]), weight: 0.8 },
  { name: 'Hook', cells: flat([[0, 0], [0, 1], [0, 2], [1, 0]]), weight: 1 },
  { name: 'Tee', cells: flat([[0, 0], [1, 0], [2, 0], [1, 1]]), weight: 1 },
  { name: 'Zig', cells: flat([[0, 0], [1, 0], [1, 1], [2, 1]]), weight: 0.9 },
  { name: 'Square', cells: flat([[0, 0], [1, 0], [0, 1], [1, 1]]), weight: 0.9 },
  { name: 'Plot', cells: flat([[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]), weight: 0.6 },
  { name: 'Cross', cells: flat([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]), weight: 0.6 },
  { name: 'Cup', cells: flat([[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]]), weight: 0.6 },
  { name: 'Pillar', cells: [[0, 0, 0], [0, 0, 1]], weight: 1 },
  { name: 'Column', cells: [[0, 0, 0], [0, 0, 1], [0, 0, 2]], weight: 0.8 },
  { name: 'Obelisk', cells: [[0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 3]], weight: 0.45 },
  { name: 'Step', cells: [[0, 0, 0], [1, 0, 0], [1, 0, 1]], weight: 0.8 },
  { name: 'Gate', cells: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [2, 0, 1], [2, 0, 0]], weight: 0.6 },
  { name: 'Ziggurat', cells: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1]], weight: 0.5 },
  { name: 'Canopy', cells: [[1, 1, 0], [1, 1, 1], [0, 1, 1], [2, 1, 1], [1, 0, 1], [1, 2, 1]], weight: 0.4 },
  { name: 'Ledge', cells: [[0, 0, 0], [0, 0, 1], [1, 0, 1]], weight: 0.6 },
];

const shapeByName = (n: string) => SHAPES.find(s => s.name === n)!;

let uidCounter = 1;
export const nextUid = () => uidCounter++;

function build(shape: ShapeDef, mats: MatId[]): Piece {
  const blocks = shape.cells.map(([x, y, z], i) => ({ x, y, z, mat: mats[i] }));
  return { uid: nextUid(), name: nameFor(shape.name, blocks), blocks };
}

function nameFor(shapeName: string, blocks: PBlock[]): string {
  const counts = new Map<MatId, number>();
  for (const b of blocks) counts.set(b.mat, (counts.get(b.mat) ?? 0) + 1);
  if (counts.size === 1) return `${MATS[blocks[0].mat].name} ${shapeName}`;
  const top = blocks.reduce((a, b) => (b.z > a.z ? b : a));
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  if (top.z > 0 && top.mat !== main) return `${MATS[top.mat].name} ${shapeName}`;
  return `${MATS[main].name} ${shapeName}`;
}

/** A unique block on its own: one cell, named after the block. */
export function uniquePiece(mat: MatId): Piece {
  return { uid: nextUid(), name: MATS[mat].name, blocks: [{ x: 0, y: 0, z: 0, mat }] };
}

/** Make a piece by shape name; `top` (if given) replaces the material of the highest blocks. */
export function make(shapeName: string, mat: MatId, top?: MatId): Piece {
  const shape = shapeByName(shapeName);
  const maxZ = Math.max(...shape.cells.map(c => c[2]));
  const mats = shape.cells.map(c => (top && c[2] === maxZ && maxZ > 0 ? top : mat));
  return build(shape, mats);
}

function pickWeighted<T>(items: T[], weight: (t: T) => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = Math.random() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

export function randomPiece(matPool: MatId[]): Piece {
  const shape = pickWeighted(SHAPES, s => s.weight);
  const matWeights: Partial<Record<MatId, number>> = { stone: 3, garden: 2.2, crystal: 2, ember: 1.5, ward: 1, beacon: 0.9 };
  const primary = pickWeighted(matPool, m => matWeights[m] ?? 1);
  const turrets = matPool.filter(m => MATS[m].turret);
  const mats: MatId[] = shape.cells.map(() => primary);
  const maxZ = Math.max(...shape.cells.map(c => c[2]));
  if (maxZ > 0 && Math.random() < 0.55) {
    const crown = turrets[Math.floor(Math.random() * turrets.length)];
    shape.cells.forEach((c, i) => {
      mats[i] = c[2] === maxZ ? crown : 'stone';
    });
  } else if (shape.cells.length > 1 && Math.random() < 0.3) {
    const i = Math.floor(Math.random() * shape.cells.length);
    mats[i] = pickWeighted(matPool.filter(m => m !== primary), m => matWeights[m] ?? 1);
  }
  return build(shape, mats);
}

export function rotatePiece(blocks: PBlock[], turns: number): PBlock[] {
  let out = blocks.map(b => ({ ...b }));
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) out = out.map(b => ({ ...b, x: -b.y, y: b.x }));
  const minX = Math.min(...out.map(b => b.x));
  const minY = Math.min(...out.map(b => b.y));
  return out.map(b => ({ ...b, x: b.x - minX, y: b.y - minY }));
}

/** The cell offset the cursor should sit on (roughly the footprint center). */
export function pivotOf(blocks: PBlock[]): { x: number; y: number } {
  const xs = blocks.map(b => b.x), ys = blocks.map(b => b.y);
  return {
    x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
    y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
  };
}

export type FounderId = 'settler' | 'spirewright' | 'sprawler' | 'quarryman' | 'pyromancer';

export const FOUNDERS: Record<FounderId, { name: string; desc: string; bag: () => Piece[] }> = {
  settler: {
    name: 'Settler',
    desc: 'A balanced bag of flat plots, gardens and a few turrets.',
    bag: () => [
      make('Pebble', 'stone'), make('Slab', 'stone'), make('Tee', 'stone'),
      make('Line', 'garden'), make('Corner', 'garden'),
      make('Slab', 'crystal'), make('Pebble', 'crystal'),
      make('Corner', 'ember'), make('Pillar', 'stone', 'crystal'),
    ],
  },
  spirewright: {
    name: 'Spirewright',
    desc: 'Pillars and crowned columns. Built to go up.',
    bag: () => [
      make('Column', 'stone'), make('Pillar', 'stone'), make('Column', 'stone', 'crystal'),
      make('Pillar', 'crystal'), make('Square', 'stone'), make('Slab', 'garden'),
      make('Pillar', 'stone', 'ember'), make('Step', 'stone'), make('Pebble', 'garden'),
    ],
  },
  sprawler: {
    name: 'Sprawler',
    desc: 'Wide gardens and walls. Built to spread out.',
    bag: () => [
      make('Square', 'garden'), make('Line', 'garden'), make('Zig', 'garden'),
      make('Wall', 'stone'), make('Hook', 'stone'), make('Corner', 'crystal'),
      make('Slab', 'ember'), make('Pebble', 'ember'), make('Tee', 'stone'),
    ],
  },
  quarryman: {
    name: 'Quarryman',
    desc: 'Heavy stone and rock, plus an Anvil. Built to topple onto enemies.',
    bag: () => [
      uniquePiece('anvil'), make('Pillar', 'rock'), make('Column', 'stone'), make('Obelisk', 'stone'),
      make('Square', 'stone'), make('Line', 'garden'), make('Pebble', 'crystal'), make('Pillar', 'stone', 'ember'),
      make('Slab', 'garden'),
    ],
  },
  pyromancer: {
    name: 'Pyromancer',
    desc: 'Embers everywhere and a Powder Keg. Built to burn.',
    bag: () => [
      uniquePiece('keg'), make('Corner', 'ember'), make('Slab', 'ember'), make('Pillar', 'stone', 'ember'),
      make('Square', 'garden'), make('Line', 'stone'), make('Tee', 'stone'), make('Pebble', 'crystal'),
      make('Corner', 'garden'),
    ],
  },
};

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

function shade(c: number, f: number): string {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return `rgb(${r},${g},${b})`;
}

/** Draw a piece as an isometric construction drawing: flat fills, section hatching, dashed plan footprint. */
export function drawPiece(canvas: HTMLCanvasElement, blocks: PBlock[], ink = '#25202e') {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const proj = (x: number, y: number, z: number) => ({ sx: (x - y) * 0.866, sy: (x + y) * 0.5 - z });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of blocks) {
    for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 1, 1], [1, 0, 1], [0, 1, 1]]) {
      const p = proj(b.x + dx, b.y + dy, b.z + dz);
      minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx);
      minY = Math.min(minY, p.sy); maxY = Math.max(maxY, p.sy);
    }
    // include the footprint at ground level
    const g = proj(b.x + 1, b.y + 1, 0);
    maxY = Math.max(maxY, g.sy);
  }
  const s = Math.min((W - 24) / (maxX - minX), (H - 24) / (maxY - minY), 34);
  const ox = W / 2 - ((minX + maxX) / 2) * s;
  const oy = H / 2 - ((minY + maxY) / 2) * s;
  const P = (x: number, y: number, z: number) => {
    const p = proj(x, y, z);
    return [ox + p.sx * s, oy + p.sy * s] as const;
  };
  const path = (pts: (readonly [number, number])[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
  };
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = ink;

  // dashed plan footprint for anything raised off the ground
  const raised = new Map<string, PBlock>();
  for (const b of blocks) if (!blocks.some(o => o.x === b.x && o.y === b.y && o.z === 0)) raised.set(`${b.x},${b.y}`, b);
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  for (const b of raised.values()) {
    path([P(b.x, b.y, 0), P(b.x + 1, b.y, 0), P(b.x + 1, b.y + 1, 0), P(b.x, b.y + 1, 0)]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  const hatch = (pts: (readonly [number, number])[], spacing: number, alpha: number) => {
    ctx.save();
    path(pts);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    ctx.beginPath();
    for (let x = x0 - (y1 - y0); x < x1; x += spacing) { ctx.moveTo(x, y1); ctx.lineTo(x + (y1 - y0), y0); }
    ctx.stroke();
    ctx.restore();
  };

  const sorted = [...blocks].sort((a, b) => a.x + a.y - (b.x + b.y) || a.z - b.z);
  for (const b of sorted) {
    const c = hex(MATS[b.mat].color);
    const { x, y, z } = b;
    const top = [P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)];
    const left = [P(x, y + 1, z + 1), P(x + 1, y + 1, z + 1), P(x + 1, y + 1, z), P(x, y + 1, z)];
    const right = [P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x + 1, y + 1, z), P(x + 1, y, z)];
    ctx.lineWidth = 1.6;
    path(top); ctx.fillStyle = c; ctx.fill(); ctx.stroke();
    path(left); ctx.fillStyle = shade(MATS[b.mat].color, 0.86); ctx.fill();
    hatch(left, Math.max(4, s * 0.22), 0.28);
    path(left); ctx.stroke();
    path(right); ctx.fillStyle = shade(MATS[b.mat].color, 0.7); ctx.fill();
    hatch(right, Math.max(3, s * 0.13), 0.42);
    path(right); ctx.stroke();
  }
}
