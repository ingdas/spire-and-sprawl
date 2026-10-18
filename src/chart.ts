// The act map drawn as a surveyor's chart: a parchment sheet on a dark desk, ink trails between
// hand-drawn places, wax seals for the nights, biome doodles, fog ahead and a pawn that hops along.
// Pure markup: game.ts owns the state and the clicks (every place is a button with data-act="n<id>").
import { ActMap, DANGER, MapNode } from './map';
import { BiomeId } from './biomes';

/** chart units: the svg is CHART_W wide and chartHeight(m) tall, and scales uniformly */
export const CHART_W = 360;
const ROW = 80, TOP = 96, BOTTOM = 128;
export const chartHeight = (m: ActMap) => TOP + (m.rows - 1) * ROW + BOTTOM;

/** stable per-map dice for looks only (never the game dice) */
const hash = (a: number, b = 0) => {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  x ^= x >>> 13; x = Math.imul(x, 0x27d4eb2d); x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
};

export interface ChartNodeArt { glyph: string; name: string }

export interface ChartOpts {
  m: ActMap;
  act: number;
  biome: BiomeId;
  biomeName: string;
  nextBiomeName: string | null;
  /** places you can go to now */
  next: Set<number>;
  /** places still reachable later on */
  future: Set<number>;
  sel: number;
  art: (n: MapNode) => ChartNodeArt;
  weatherGlyph: (n: MapNode) => string;
  /** draw the sheet unrolling (first look at a new act) */
  unroll: boolean;
}

/** Where every place sits on the chart, with a little hand-placed wobble. */
export function chartPos(m: ActMap, act: number) {
  const H = chartHeight(m);
  const pos = new Map<number, { x: number; y: number }>();
  for (const n of m.nodes) {
    const solo = m.nodes.filter(o => o.row === n.row).length === 1;
    const x = (solo ? CHART_W / 2 : 70 + n.lane * 110) + (solo ? 0 : (hash(n.id, act) - 0.5) * 26);
    const y = H - BOTTOM - n.row * ROW + (solo ? 0 : (hash(n.id + 99, act) - 0.5) * 16);
    pos.set(n.id, { x, y });
  }
  return pos;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// ---------- line art (40x40, ink strokes) ----------
const ICONS: Record<string, string> = {
  shop: '<path d="M6 15 L9 8 H31 L34 15"/><path d="M6 15 q3.5 4.5 7 0 q3.5 4.5 7 0 q3.5 4.5 7 0 q3.5 4.5 7 0"/><path d="M9 18 V33 M31 18 V33 M5 33 H35"/><circle cx="20" cy="26" r="4"/>',
  camp: '<path d="M5 33 L18 9 L31 33 Z"/><path d="M18 9 L15 33 M18 9 L22 33"/><path d="M31 33 q-2 -5 2 -9 q1 4 3 5 q1 3 -2 4"/><path d="M3 33 H37"/>',
  forge: '<path d="M7 13 H29 q5 0 6 5 H27 l-3 4 v4 h4 v5 H12 v-5 h4 v-4 l-4 -5 H7 Z"/><path d="M30 6 l-2 4 M35 8 l-4 3 M24 5 l0 4"/>',
  treasure: '<rect x="7" y="17" width="26" height="15" rx="1.5"/><path d="M7 17 q13 -12 26 0"/><path d="M7 23 H33"/><rect x="17.5" y="20.5" width="5" height="6" rx="1"/>',
  unique: '<path d="M20 5 L33 12.5 V27.5 L20 35 L7 27.5 V12.5 Z"/><path d="M7 12.5 L20 20 L33 12.5 M20 20 V35"/><path d="M34 4 v5 M31.5 6.5 h5"/>',
  event: '<path d="M10 9 h20 v22 h-20 z"/><path d="M8 9 q2 -4 4 0 M28 31 q2 4 4 0"/><path d="M16 17 q0 -4 4 -4 q4 0 4 4 q0 3 -4 4 v3"/><circle cx="20" cy="27.5" r="0.6" fill="currentColor"/>',
};
/** a stop's line drawing */
export const stopIcon = (k: string) => `<svg viewBox="0 0 40 40" class="ico" aria-hidden="true">${ICONS[k] ?? ''}</svg>`;
const icon = stopIcon;

/** a wax blob: a circle with soft irregular bumps */
function sealPath(r: number, seed: number) {
  const pts: string[] = [];
  const k = 14;
  for (let i = 0; i <= k; i++) {
    const a = (i / k) * Math.PI * 2;
    const rr = r * (0.9 + 0.13 * hash(seed, i % k));
    pts.push(`${(50 + Math.cos(a) * rr).toFixed(1)} ${(50 + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function seal(n: Pick<MapNode, 'id' | 'kind' | 'contract'>, glyph: string, boss: boolean) {
  const danger = DANGER[n.kind === 'guardian' ? 'guardian' : n.contract!];
  // notches pressed into the rim: one per danger point
  const notches = Array.from({ length: danger }, (_, i) => {
    const a = -Math.PI / 2 + (i - (danger - 1) / 2) * 0.42;
    const x1 = 50 + Math.cos(a) * 33, y1 = 50 + Math.sin(a) * 33, x2 = 50 + Math.cos(a) * 42, y2 = 50 + Math.sin(a) * 42;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }).join('');
  const crown = boss ? '<path class="crown" d="M33 60 L30 38 L40 48 L50 33 L60 48 L70 38 L67 60 Z"/>' : `<text x="50" y="51" class="sg">${glyph}</text>`;
  return `<svg viewBox="0 0 100 100" class="seal" aria-hidden="true">
    <path class="wax" d="${sealPath(44, n.id * 7 + 3)}"/>
    <circle class="rim" cx="50" cy="50" r="31"/>
    ${crown}
    <g class="notch">${notches}</g>
  </svg>`;
}

/** The art for any place: a wax seal for nights, a line drawing for stops. */
export function placeArt(n: Pick<MapNode, 'id' | 'kind' | 'contract'>, glyph: string) {
  return n.kind === 'battle' || n.kind === 'guardian' ? seal(n, glyph, n.kind === 'guardian') : stopIcon(n.kind);
}

/** a hand-drawn ring around the chosen place (drawn in with a dash animation) */
const RING = '<svg viewBox="0 0 100 100" class="ring" aria-hidden="true"><path pathLength="1" d="M18 58 C12 30 40 10 62 14 C86 19 94 46 84 66 C74 86 40 92 24 78 C14 70 12 56 22 44"/></svg>';

// ---------- biome doodles (local coordinates around 0,0, ~30 units wide) ----------
const DOODLES: Record<BiomeId, string[]> = {
  meadow: [
    '<path d="M0 0 v-7"/><circle cx="0" cy="-12" r="6"/>',
    '<path d="M-5 0 v-6"/><circle cx="-5" cy="-10" r="4.5"/><path d="M5 0 v-8"/><circle cx="5" cy="-13" r="5.5"/>',
    '<path d="M-6 0 l2 -5 l2 5 l2 -6 l2 6 l2 -4 l2 4"/>',
  ],
  dunes: [
    '<path d="M-14 0 q7 -8 14 0 q7 -6 14 0"/>',
    '<path d="M0 0 v-14 M0 -7 h-5 v-5 M0 -9 h5 v-4"/>',
    '<path d="M-10 0 q10 -10 20 0"/><path d="M-4 -2 q4 -3 8 0"/>',
  ],
  glacier: [
    '<path d="M-14 0 L-3 -16 L4 -7 L8 -11 L16 0"/><path d="M-6 -11.5 L-3 -16 L0 -11.5 L-3 -10 Z"/>',
    '<path d="M-10 0 L0 -13 L10 0"/><path d="M-3 -9 L0 -13 L3 -9"/>',
    '<path d="M-6 -6 L6 6 M-6 6 L6 -6 M0 -8 V8"/>',
  ],
  caldera: [
    '<path d="M-15 0 L-5 -13 H5 L15 0"/><path d="M0 -15 q-4 -4 0 -8 q4 -3 0 -7"/>',
    '<path d="M-9 0 L-2 -9 L4 -4 L9 0"/><path d="M-1 -12 q2 -2 0 -4"/>',
    '<path d="M-12 0 q4 -3 8 0 q4 3 8 0 q4 -3 8 0"/>',
  ],
};

const COMPASS = `<g class="compass" transform="translate(46 64)">
  <circle r="17"/><circle r="12" class="thin"/>
  <path d="M0 -22 L4 0 L0 22 L-4 0 Z" class="fill"/><path d="M-22 0 L0 -3 L22 0 L0 3 Z"/>
  <text y="-25" class="cn">N</text>
</g>`;

function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

export function chartHtml(o: ChartOpts): string {
  const { m, act } = o;
  const H = chartHeight(m);
  const pos = chartPos(m, act);
  const visited = new Set(m.visited);
  const here = m.at === null ? null : m.nodes[m.at];
  const hereRow = here ? here.row : -1;
  // fog: everything more than two rows ahead of you is still unsurveyed
  const fogRow = hereRow + 3;
  const fogY = H - BOTTOM - fogRow * ROW + ROW * 0.55;
  const pct = (x: number, y: number) => `left:${((x / CHART_W) * 100).toFixed(2)}%; top:${((y / H) * 100).toFixed(2)}%`;

  // trails: a gentle curve between two places
  const curve = (a: MapNode, b: MapNode) => {
    const p = pos.get(a.id)!, q = pos.get(b.id)!;
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const nx = -(q.y - p.y), ny = q.x - p.x, nl = Math.hypot(nx, ny) || 1;
    const bend = (hash(a.id * 31 + b.id, act) - 0.5) * 22;
    return `M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q${(mx + (nx / nl) * bend).toFixed(1)} ${(my + (ny / nl) * bend).toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  };
  const live = (id: number) => o.future.has(id) || visited.has(id);
  const edges: string[] = [], inks: string[] = [];
  for (const a of m.nodes) for (const id of a.next) {
    const b = m.nodes[id];
    const d = curve(a, b);
    const walked = visited.has(a.id) && visited.has(b.id);
    const open = m.at === a.id;
    const gone = !walked && !(live(a.id) && o.future.has(b.id));
    edges.push(`<path class="trail ${walked ? 'walked' : open ? 'open' : gone ? 'gone' : ''}" d="${d}"/>`);
    // the trail you are about to walk gets an ink overlay that draws itself in
    if (open) inks.push(`<path class="inkline" data-e="${a.id}-${b.id}" pathLength="1" d="${d}"/>`);
  }

  // doodles in the empty spaces
  const doodles: string[] = [];
  const art = DOODLES[o.biome] ?? DOODLES.meadow;
  const segs = m.nodes.flatMap(a => a.next.map(id => [pos.get(a.id)!, pos.get(id)!]));
  for (let i = 0, placed = 0; i < 90 && placed < 16; i++) {
    const x = 18 + hash(i, act * 13 + 5) * (CHART_W - 36), y = 30 + hash(i + 500, act * 13 + 5) * (H - 70);
    if ([...pos.values()].some(p => Math.hypot(p.x - x, p.y - y) < 40)) continue;
    if (segs.some(([p, q]) => distSeg(x, y, p.x, p.y, q.x, q.y) < 20)) continue;
    if (Math.hypot(x - 46, y - 64) < 36) continue;
    if (y > H - 60) continue;
    const s = 0.8 + hash(i, 77) * 0.5;
    doodles.push(`<g class="doodle" transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${s.toFixed(2)})">${art[Math.floor(hash(i, 3) * art.length)]}</g>`);
    placed++;
  }

  // the sheet itself: rough edges, stains, a fold, a cartouche
  const roman = ROMAN[act + 1] ?? `${act + 1}`;
  const svg = `<svg class="chart-svg" viewBox="0 0 ${CHART_W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <filter id="rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="${act + 2}"/><feDisplacementMap in="SourceGraphic" scale="9"/></filter>
      <filter id="inky" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.12  0 0 0 0.09 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <radialGradient id="stain" r="0.5"><stop offset="0" stop-color="#b78a4c" stop-opacity="0.05"/><stop offset="0.8" stop-color="#b78a4c" stop-opacity="0.06"/><stop offset="0.93" stop-color="#8a5a2b" stop-opacity="0.13"/><stop offset="1" stop-color="#8a5a2b" stop-opacity="0"/></radialGradient>
      <radialGradient id="burn" r="0.75"><stop offset="0.62" stop-color="#7a4a20" stop-opacity="0"/><stop offset="1" stop-color="#5a3412" stop-opacity="0.38"/></radialGradient>
      <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eadcbd" stop-opacity="0.96"/><stop offset="0.78" stop-color="#eadcbd" stop-opacity="0.85"/><stop offset="1" stop-color="#eadcbd" stop-opacity="0"/></linearGradient>
    </defs>
    <g filter="url(#rough)">
      <rect class="parch" x="8" y="8" width="${CHART_W - 16}" height="${H - 16}" rx="4"/>
      <rect x="8" y="8" width="${CHART_W - 16}" height="${H - 16}" fill="url(#burn)"/>
    </g>
    <rect x="8" y="8" width="${CHART_W - 16}" height="${H - 16}" filter="url(#grain)" fill="#000"/>
    ${[0, 1, 2].map(i => `<ellipse cx="${(40 + hash(i, act + 40) * 280).toFixed(0)}" cy="${(60 + hash(i + 9, act + 40) * (H - 120)).toFixed(0)}" rx="${(30 + hash(i, 8) * 30).toFixed(0)}" ry="${(22 + hash(i, 9) * 24).toFixed(0)}" fill="url(#stain)" filter="url(#rough)"/>`).join('')}
    <line class="fold" x1="${CHART_W / 2}" y1="14" x2="${CHART_W / 2}" y2="${H - 14}"/>
    <line class="fold" x1="14" y1="${(H / 2).toFixed(0)}" x2="${CHART_W - 14}" y2="${(H / 2).toFixed(0)}"/>
    <g class="ink" filter="url(#inky)">
      ${doodles.join('')}
      ${COMPASS}
      ${o.nextBiomeName ? `<path class="trail onward" d="M${CHART_W / 2} ${TOP - 34} q 30 -20 70 -40"/><text class="onward-t" x="${CHART_W / 2 + 74}" y="${TOP - 70}">to ${o.nextBiomeName} ✈</text>` : `<text class="onward-t" x="${CHART_W / 2}" y="${TOP - 48}" text-anchor="middle">the last stand</text>`}
      ${edges.join('')}
    </g>
    ${inks.join('')}
    <rect class="fogbank" x="8" y="8" width="${CHART_W - 16}" height="${Math.max(0, fogY - 8).toFixed(0)}" fill="url(#fog)" filter="url(#rough)"/>
    <g class="cartouche" transform="translate(${CHART_W / 2} ${H - 40})">
      <path d="M-104 -14 H104 L92 0 L104 14 H-104 L-92 0 Z"/>
      <text y="5">Act ${roman} · ${o.biomeName}</text>
    </g>
  </svg>`;

  // places
  const nodes = m.nodes.map(n => {
    const p = pos.get(n.id)!;
    const fight = n.kind === 'battle' || n.kind === 'guardian';
    const a = o.art(n);
    const can = o.next.has(n.id);
    const fog = n.row >= fogRow && n.kind !== 'guardian';
    const cls = ['place', fight ? 'fight' : 'stop', `k-${n.kind}`, can ? 'can' : '', visited.has(n.id) ? 'done' : '', m.at === n.id ? 'here' : '',
      o.sel === n.id ? 'sel' : '', live(n.id) ? '' : 'gone', fog ? 'fog' : ''].filter(Boolean).join(' ');
    const body = fight ? seal(n, a.glyph, n.kind === 'guardian') : icon(n.kind);
    const night = n.night ? `<span class="nn">${ROMAN[n.night]}</span>` : '';
    const wx = n.weather ? `<span class="wx">${o.weatherGlyph(n)}</span>` : '';
    return `<button class="${cls}" style="${pct(p.x, p.y)}; --i:${n.row}" data-act="n${n.id}" aria-label="${a.name}">${body}${night}${wx}${o.sel === n.id ? RING : ''}</button>`;
  }).join('');

  // the pawn: on its place, or waiting below the first one
  const start = m.nodes.find(n => n.row === 0)!;
  const pp = here ? pos.get(here.id)! : { x: pos.get(start.id)!.x, y: pos.get(start.id)!.y + 50 };
  const pawn = `<span class="pawn ${here ? '' : 'start'}" style="${pct(pp.x, pp.y)}"><span class="hop"><svg viewBox="0 0 40 60" aria-hidden="true">
      <ellipse class="sh" cx="20" cy="55" rx="13" ry="4"/>
      <path class="pc" d="M9 53 q0 -5 5 -6 l2 -12 q-6 -3 -6 -9 q0 -4 4 -6 q-3 -3 -3 -7 q0 -8 9 -8 q9 0 9 8 q0 4 -3 7 q4 2 4 6 q0 6 -6 9 l2 12 q5 1 5 6 z"/>
      <path class="hl" d="M15 12 q1 -4 5 -5"/>
    </svg></span></span>`;

  return `<div class="chart-desk"><div class="chart-view${o.unroll ? ' unroll' : ''}">
    <div class="chart" style="aspect-ratio:${CHART_W} / ${H}">
      ${svg}
      ${nodes}
      ${pawn}
    </div>
  </div></div>`;
}
