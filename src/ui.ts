// Folio components: every UI surface is a sheet from the island's construction documents.
import { ENEMIES, EnemyId, MATS } from './config';
import { RelicId, relicDef } from './meta';
import { PBlock, Piece, drawPiece } from './pieces';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export interface SheetOpts { kicker: string; title: string; note?: string; headRight?: string; body: string; foot?: string; cls?: string }

export function sheet(o: SheetOpts): string {
  return `<section class="paper sheet ${o.cls ?? ''}">
    <header class="head">
      <div>${o.kicker ? `<span class="label kicker">${o.kicker}</span>` : ''}<h1>${o.title}</h1>${o.note ? `<p class="note">${o.note}</p>` : ''}</div>
      ${o.headRight ? `<div class="hr">${o.headRight}</div>` : ''}
    </header>
    ${o.body}
    ${o.foot ? `<footer class="foot">${o.foot}</footer>` : ''}
  </section>`;
}

export const sec = (n: number | string, t: string, aside = '') =>
  `<div class="sec"><span class="num">${n}</span><span class="t">${t}</span><span class="rule"></span>${aside ? `<span class="aside">${aside}</span>` : ''}</div>`;

export const stamp = (label: string, act: string, sub = '', disabled = false) =>
  `<button class="stamp" data-act="${act}" ${disabled ? 'disabled' : ''}>${label}${sub ? `<small>${sub}</small>` : ''}</button>`;

export const tab = (label: string, act: string, opts: { disabled?: boolean; red?: boolean; tip?: string } = {}) =>
  `<button class="tab ${opts.red ? 'red' : ''}" data-act="${act}" ${opts.disabled ? 'disabled' : ''} ${opts.tip ? `data-tip="${opts.tip}"` : ''}>${label}</button>`;

export const impression = (text: string) => `<span class="impression">${text}</span>`;

export const ledgerLine = (k: string, v: string, cls = '') =>
  `<div class="ln ${cls}"><span class="k">${k}</span><span class="lead"></span><span class="v">${v}</span></div>`;

/** Price tag: a gold coin chip, or FREE. */
export const price = (gold: number | null) => gold === null ? '<span class="price free">Free</span>' : `<span class="price"><i></i>${gold}</span>`;

const matNames = (blocks: PBlock[]) => [...new Set(blocks.map(b => b.mat))]
  .map(m => `<span><i style="background:${hex(MATS[m].color)}"></i>${MATS[m].name}</span>`).join('');

// ---------- pieces ----------

export function pieceSpec(p: { blocks: PBlock[] }) {
  const cells = new Set(p.blocks.map(b => `${b.x},${b.y}`)).size;
  const h = Math.max(...p.blocks.map(b => b.z)) + 1;
  return { blocks: p.blocks.length, cells, h };
}

export function pieceTip(p: Piece): string {
  const s = pieceSpec(p);
  const mats = [...new Set(p.blocks.map(b => b.mat))];
  return `<span class='tip-k'>${s.blocks} block${s.blocks > 1 ? 's' : ''} · ${s.h} tall</span><b>${p.name}</b><br>` +
    mats.map(m => `<span class='sw' style='background:${hex(MATS[m].color)}'></span><b style='font-size:13px'>${MATS[m].name}</b> — ${MATS[m].desc}`).join('<br>');
}

const drawQueue = new Map<string, PBlock[]>();
let drawKey = 0;

export interface PlateOpts { no?: string; act?: string; cost?: number | null; taken?: string; faded?: boolean; poor?: boolean; extraCls?: string; attrs?: string; desc?: string }

/** A card showing one piece. Canvases are drawn by flushDrawings(). */
export function plate(p: { name: string; blocks: PBlock[] }, o: PlateOpts): string {
  const key = `d${drawKey++}`;
  drawQueue.set(key, p.blocks);
  const tipAttr = 'uid' in p ? `data-tip="${pieceTip(p as Piece)}"` : '';
  const off = o.taken || o.faded;
  const unique = p.blocks.some(b => MATS[b.mat].unique);
  const no = unique ? `${o.no ? `${o.no} · ` : ''}<b class="uq">★ Unique</b>` : o.no;
  return `<div class="plate ${unique ? 'unique' : ''} ${(p as { gilded?: boolean }).gilded ? 'gilded' : ''} ${o.taken ? 'taken' : ''} ${o.faded ? 'faded' : ''} ${o.poor ? 'poor' : ''} ${o.extraCls ?? ''}" ${o.act && !off && !o.poor ? `data-act="${o.act}"` : ''} ${tipAttr} ${o.attrs ?? ''}>
    ${no || o.cost !== undefined ? `<div class="no"><span>${no ?? ''}</span>${o.cost !== undefined ? price(o.cost) : ''}</div>` : ''}
    <canvas data-draw="${key}" width="264" height="184"></canvas>
    <div class="nm">${p.name}</div>
    <div class="spec">${matNames(p.blocks)}</div>
    ${o.desc ? `<p class="note" style="margin:6px 0 0; font-size:12px">${o.desc}</p>` : ''}
    ${o.taken ? impression(o.taken) : ''}
  </div>`;
}

export function flushDrawings(root: ParentNode) {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-draw]').forEach(c => {
    const blocks = drawQueue.get(c.dataset.draw!);
    if (blocks) drawPiece(c, blocks);
  });
  drawQueue.clear();
}

// ---------- relics ----------

/** Round relic badge with its icon. */
export const callout = (id: RelicId) => {
  const r = relicDef(id);
  return `<div class="callout" data-tip="<span class='tip-k'>Relic</span><b>${r.name}</b><br>${r.desc}"><span class="g">${r.icon}</span></div>`;
};

export const badge = (icon: string) => `<div class="callout"><span class="g">${icon}</span></div>`;

export interface DetailOpts { act?: string; price?: number | null; taken?: string; faded?: boolean; poor?: boolean }

export function detail(id: RelicId, o: DetailOpts): string {
  const r = relicDef(id);
  const off = o.taken || o.faded;
  return `<div class="detail ${o.taken ? 'taken' : ''} ${o.faded ? 'faded' : ''} ${o.poor ? 'poor' : ''}" ${o.act && !off && !o.poor ? `data-act="${o.act}"` : ''}>
    ${badge(r.icon)}
    <div class="nm">${r.name}</div>
    <div class="ds">${r.desc}</div>
    ${o.price !== undefined ? `<div class="buyrow">${price(o.price)}</div>` : ''}
    ${o.taken ? impression(o.taken) : ''}
  </div>`;
}

// ---------- enemies & survey ----------

export function enemyGlyph(id: EnemyId, size = 14): string {
  const c = hex(ENEMIES[id].color);
  const s = size, h = s / 2;
  const poly = (n: number, r: number, rot = -Math.PI / 2) =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (i / n) * Math.PI * 2;
      return `${(h + Math.cos(a) * r).toFixed(1)},${(h + Math.sin(a) * r).toFixed(1)}`;
    }).join(' ');
  const shape: Record<EnemyId, string> = {
    shard: `<polygon points="${poly(3, h - 1)}"/>`,
    runner: `<circle cx="${h}" cy="${h}" r="${h - 2}"/>`,
    flier: `<polygon points="${poly(4, h - 1)}"/>`,
    brute: `<polygon points="${poly(5, h - 1)}"/>`,
    sapper: `<polygon points="${poly(6, h - 1, 0)}"/>`,
    climber: `<polygon points="${poly(3, h - 1, Math.PI / 2)}"/>`,
    bomber: `<polygon points="${poly(4, h - 1, 0)}"/><circle cx="${h}" cy="${h}" r="${h / 3.5}" fill="var(--ink)"/>`,
    bulwark: `<rect x="1.5" y="1.5" width="${s - 3}" height="${s - 3}" rx="2"/>`,
    wyrm: `<path d="M1 ${h + 2} Q ${h / 2} ${h - 4} ${h} ${h + 1} T ${s - 1} ${h - 2}" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`,
    leviathan: `<ellipse cx="${h}" cy="${h}" rx="${h - 1}" ry="${h / 2.2}"/>`,
    boss: `<polygon points="${poly(10, h - 1)}"/><circle cx="${h}" cy="${h}" r="${h / 3}" fill="none"/>`,
  };
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" style="flex:none"><g fill="${c}" stroke="var(--ink)" stroke-width="1.2" stroke-linejoin="round">${shape[id]}</g></svg>`;
}

/** Plan of the island with threatened edges redlined. Side 0 = north. */
export function compass(sides: number[]): string {
  const S = 74, m = 15, w = S - m * 2;
  const edges = [
    [m, m, m + w, m], [m + w, m, m + w, m + w], [m, m + w, m + w, m + w], [m, m, m, m + w],
  ];
  const arrows = [
    `${S / 2 - 4},2 ${S / 2 + 4},2 ${S / 2},8`, `${S - 2},${S / 2 - 4} ${S - 2},${S / 2 + 4} ${S - 8},${S / 2}`,
    `${S / 2 - 4},${S - 2} ${S / 2 + 4},${S - 2} ${S / 2},${S - 8}`, `2,${S / 2 - 4} 2,${S / 2 + 4} 8,${S / 2}`,
  ];
  const letters = [[S / 2, 11, 'N'], [S - 7, S / 2 + 3, 'E'], [S / 2, S - 3, 'S'], [7, S / 2 + 3, 'W']] as const;
  return `<svg class="compass" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" style="flex:none">
    <rect x="${m}" y="${m}" width="${w}" height="${w}" fill="none" stroke="var(--ink)" stroke-width="1"/>
    <path d="M${m} ${S / 2}H${m + w}M${S / 2} ${m}V${m + w}" stroke="var(--ink-faint)" stroke-dasharray="2 2"/>
    <rect x="${S / 2 - 3}" y="${S / 2 - 3}" width="6" height="6" fill="var(--ink)" transform="rotate(45 ${S / 2} ${S / 2})"/>
    ${sides.map(s => { const e = edges[s]; return `<line x1="${e[0]}" y1="${e[1]}" x2="${e[2]}" y2="${e[3]}" stroke="var(--red)" stroke-width="4"/><polygon points="${arrows[s]}" fill="var(--red)"/>`; }).join('')}
    ${letters.map(([x, y, l], i) => sides.includes(i) ? '' : `<text x="${x}" y="${y}" font-size="8" font-family="IBM Plex Mono, monospace" font-weight="600" text-anchor="middle" fill="var(--ink-soft)">${l}</text>`).join('')}
  </svg>`;
}

/** An undrawn (locked) plate: hatched blank with the requirement. */
export const blankPlate = (no: string, name: string, req: string) =>
  `<div class="plate locked"><div class="no"><span>${no}</span><span>✕</span></div>
    <div class="blank"><span class="label">locked</span></div>
    <div class="nm">${name}</div><p class="note" style="margin:6px 0 0; font-size:12px">${req}</p></div>`;
