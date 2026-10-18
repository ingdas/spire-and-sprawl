import * as THREE from 'three';
import { isMuted, music, setMuted, setVolumes, sfx } from './audio';
import { Settings, loadSettings, saveSettings } from './settings';
import { Board, Placement } from './board';
import { CORE, ENEMIES, applyColorBlind, EnemyId, HAND_SIZE, MATS, MatId, N, NIGHTS, START_CORE_HP, START_GOLD, UNIQUES } from './config';
import { CODEX, CodexDef, HEATS, Meta, RelicId, RunStats, SEALS, UPGRADES, relicDef } from './meta';
import { FOUNDERS, FounderId, Piece, make, pivotOf, randomPiece, rotatePiece, uniquePiece } from './pieces';
import { Renderer, world } from './render';
import { AIMS, Aim, CONTRACTS, REACTIONS as COMBOS, ContractId, FOUNDATION_RANGE, Night, TOPPLE_SWING, isFoundation, REACTIONS, WEATHER, STACK_BONUS, Wave, makeWave, rangeBonus, reactionOf, stackBelow, turretRange } from './sim';
import { BIOMES, BiomeDef, BiomeId, actOf, randomCells, rollRoute } from './biomes';
import { ActMap, DANGER, GUARDIAN_INFO, MapNode, STOPS, StopKind, ahead, makeMap, reachable } from './map';
import { badge, blankPlate, callout, compass, detail, enemyGlyph, flushDrawings, impression, ledgerLine, plate, sec, sheet, stamp, tab } from './ui';

type Phase = 'title' | 'day' | 'night' | 'dawn' | 'end';

interface Run {
  board: Board;
  founder: FounderId;
  bag: Piece[];
  draw: Piece[];
  hand: Piece[];
  used: boolean[];
  gold: number;
  coreHp: number;
  coreMax: number;
  day: number;
  relics: RelicId[];
  stats: RunStats;
  wave: Wave;
  handSize: number;
  // dawn state
  draft: Piece[];
  draftPick: number; // -1 open, -2 waived, else index
  treasure: RelicId[];
  treasurePick: number;
  platesEarned: number;
  redraws: number;
  demolishes: number;
  /** piece saved from today's hand for tomorrow */
  keep: Piece | null;
  keptIdx: number;
  topples: number;
  keystone: boolean;
  heat: number;
  coreLevel: number;
  route: BiomeId[];
  act: number;
  vents: { x: number; y: number }[];
  shop: RelicId[];
  shopSold: boolean[];
  market: Piece[];
  marketSold: boolean[];
  income: [string, number][];
  contract: ContractId;
  event: EventId | null;
  eventDone: string;
  map: ActMap;
  /** core damage taken, by enemy type and by night: the defeat screen explains the loss */
  hurt: Partial<Record<EnemyId, number>>;
  hurtByNight: Record<number, number>;
  /** board states before each placement today, newest last */
  undo: { cols: ReturnType<Board['snapshot']>; gold: number; idx: number }[];
  /** per-night action uses */
  drops: number; rallies: number; shoreups: number; killsTonight: number;
  premium: Piece | null; premiumSold: boolean;
  /** forge "temper": permanent material boosts for this run */
  temper: Partial<Record<MatId, number>>;
  /** extra pieces bought today */
  buys: number;
}

const SIDE_NAMES = ['North', 'East', 'South', 'West'];

type EventId = 'merchant' | 'shrine' | 'gambler' | 'quarry';
const EVENTS: EventId[] = ['merchant', 'shrine', 'gambler', 'quarry'];
const EVENT_TEXT: Record<EventId, { icon: string; title: string; text: string; yes: string }> = {
  merchant: { icon: '★', title: 'A wandering merchant', text: 'She sells one unique block for 6 gold.', yes: 'Buy · 6 g' },
  shrine: { icon: '✚', title: 'An old shrine', text: 'Offer 3 core HP to receive a random relic.', yes: 'Offer 3 HP' },
  gambler: { icon: '◎', title: 'A gambler', text: 'Bet 5 gold: half the time you win 12.', yes: 'Bet · 5 g' },
  quarry: { icon: '▲', title: 'A quarry', text: 'Take a 2-tall rock pillar piece for free. Rock is very tough.', yes: 'Take it' },
};
/** Towers taller than this lose their tops on the journey between biomes. */
const JOURNEY_MAX_H = 10;
const DEMOLISH_PER_DAY = 2;
const DEMOLISH_COST = 3;
const CAMP_HEAL = 6;
const CAMP_GOLD = 6;
const DROP_COST = 3;
const RUN_KEY = 'spire-sprawl-run';
/** a night's extra actions */
const RALLY_SECONDS = 5;
/** a bonus topple every this many kills in one night */
const KILLS_PER_TOPPLE = 15;
const INTEREST_CAP = 4;
const GILD_HP = 1.5;
const $ = (id: string) => document.getElementById(id)!;
const shuffle = <T>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Game {
  r: Renderer;
  meta = new Meta();
  phase: Phase = 'title';
  run: Run | null = null;
  night: Night | null = null;
  speed = (() => { try { return Number(localStorage.getItem('spire-speed')) || 1; } catch { return 1; } })();
  sel = -1;
  rot = 0;
  private lastPointer: { x: number; y: number } | null = null;
  private downAt: { x: number; y: number; b: number } | null = null;
  private hint = '';
  private touchPreview = '';
  private toppleDir: number | null = null;
  private toppleKey = '';
  private ghostKey = '';
  private aimTick = 0;
  private demolishing = false;
  private demoKey = '';
  private dropping = false;
  private aim: Aim = 'first';
  private paused = false;
  private flying = false;
  /** seconds of slow motion left (a boss arriving) */
  private slowmo = 0;
  /** a tactical nudge, e.g. when a topple would crush a crowd */
  private nightTip = '';
  private showAllRanges = false;
  private shoring = false;
  /** the dawn screen to return to from the bag view */
  private screen: () => void = () => {};
  private mapSel = -1;
  /** last shown value per [data-num] key, so changes count up instead of snapping */
  private nums = new Map<string, number>();
  /** bumps whenever a fresh hand is drawn, so the cards are dealt in once */
  private handDeal = 0;
  private handShown = -1;
  private handUsed: boolean[] = [];
  private handSel = -1;
  private actionsPhase = '';
  private actionsFresh = 0;
  private fades = new WeakMap<HTMLElement, number>();
  private relicsShown = 0;
  private handRot = 0;
  private phaseShown = '';
  private threatPhase = '';
  private last = performance.now();

  settings: Settings = loadSettings();

  constructor() {
    this.applySettings();
    this.r = new Renderer($('app'));
    this.r.setCameraSpeed(this.settings.camSpeed);
    this.bindInput();
    this.bindTooltips();
    this.showTitle();
    requestAnimationFrame(t => this.frame(t));
  }

  get has() { return (id: RelicId) => !!this.run?.relics.includes(id); }

  // ======================= loop =======================

  private frame(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    let simDt = dt;
    if (this.phase === 'title') this.r.autoOrbit(dt);
    if (this.phase === 'night' && this.night && this.run) {
      this.slowmo = Math.max(0, this.slowmo - dt);
      const slow = this.slowmo > 0 ? 0.35 : 1;
      simDt = this.paused ? 0 : dt * this.speed * slow;
      for (let i = 0; i < (this.paused ? 0 : this.speed) && this.phase === 'night'; i++) this.night.update(dt * slow);
      this.r.tintBlocks(this.run.board);
      this.updateNightHud();
      // enemies move under the aim, so refresh the crush preview a few times a second
      if ((this.aimTick += dt) > 0.2 && !this.dropping) { this.aimTick = 0; this.updateToppleGhost(); this.toppleHint(); }
      if (this.phase === 'night' && this.night.done) this.endNight();
    }
    this.r.update(dt, simDt);
    requestAnimationFrame(tt => this.frame(tt));
  }

  // ======================= title & menus =======================

  showTitle() {
    this.phase = 'title';
    music('day');
    this.night?.dispose();
    this.night = null;
    this.run = null;
    this.r.setBiome(BIOMES.meadow);
    this.showHud(false);
    this.r.setNight(false);
    this.r.clearAll();
    this.buildDemo();
    const m = this.meta;
    this.overlay(`
      <section class="paper sheet cover">
        <h1>Spire<br><span class="amp">&amp;</span>Sprawl</h1>
        <p class="note lede">Build a fortress on a floating island and survive ${NIGHTS} nights. Build tall to shoot far, or wide to earn gold.</p>
        <nav class="toc">
          ${this.savedRun() ? `<button class="first" data-act="continue"><span class="t">Continue</span><span class="lead"></span><span class="p">night ${this.savedRun()!.day} · ${BIOMES[this.savedRun()!.route[this.savedRun()!.act]].name}</span></button>` : ''}
          <button class="${this.savedRun() ? '' : 'first'}" data-act="start"><span class="t">${this.savedRun() ? 'New run' : 'Play'}</span><span class="lead"></span><span class="p">▶</span></button>
          <button data-act="atelier"><span class="t">Workshop</span><span class="lead"></span><span class="p">${m.runs ? `${m.seals} seals ✠ to spend` : 'permanent upgrades'}</span></button>
          <button data-act="codex"><span class="t">Challenges</span><span class="lead"></span><span class="p">${m.unlocked.size} / ${CODEX.length} done</span></button>
          <button data-act="howto"><span class="t">How to play</span><span class="lead"></span><span class="p">?</span></button>
          <button data-act="settings"><span class="t">Settings</span><span class="lead"></span><span class="p">⚙</span></button>
        </nav>
        ${m.runs ? `<div class="foot"><span class="label">Runs ${m.runs} · Wins ${m.wins} · Best night ${m.bestNight || '—'}</span></div>` : ''}
      </section>`, false, {
      start: () => { this.fullscreen(); if (this.savedRun()) this.ask('Start a new run?', 'Your saved run will be lost.', 'New run', () => { this.clearSave(); this.showFounders(); }); else this.showFounders(); },
      continue: () => { this.fullscreen(); this.loadRun(); },
      settings: () => this.showSettings(() => this.showTitle()),
      atelier: () => this.showAtelier(() => this.showTitle()),
      codex: () => this.showCodex(),
      howto: () => this.showHowTo(),
    });
  }

  private buildDemo() {
    const b = new Board();
    const pool = this.meta.matPool();
    for (let i = 0, placed = 0; i < 400 && placed < 26; i++) {
      const p = randomPiece(pool);
      const blocks = rotatePiece(p.blocks, Math.floor(Math.random() * 4));
      const pl = b.evaluate(blocks, Math.floor(Math.random() * 13) - 1, Math.floor(Math.random() * 13) - 1);
      if (pl.ok) { b.place(pl, () => 1); placed++; }
    }
    this.r.syncBoard(b);
  }

  private showFounders() {
    sfx.click();
    const avail = this.meta.founders();
    const all: FounderId[] = ['settler', 'spirewright', 'sprawler', 'pyromancer', 'quarryman'];
    const m = this.meta;
    const maxHeat = m.maxHeat();
    m.heat = Math.min(m.heat, maxHeat);
    if (avail.length === 1 && !maxHeat) return this.startRun('settler');
    const lockHint: Record<FounderId, string> = { settler: '', spirewright: 'Unlock: complete the “Skyscraper” challenge.', sprawler: 'Unlock: win a run.', pyromancer: 'Unlock: complete the “First Light” challenge.', quarryman: 'Unlock: complete the “Avalanche” challenge.' };
    const signature: Record<FounderId, number> = { settler: 8, spirewright: 2, sprawler: 0, quarryman: 3, pyromancer: 3 };
    const acts: Record<string, () => void> = {
      f_settler: () => this.startRun('settler'),
      f_spirewright: () => this.startRun('spirewright'),
      f_sprawler: () => this.startRun('sprawler'),
      f_pyromancer: () => this.startRun('pyromancer'),
      f_quarryman: () => this.startRun('quarryman'),
      back: () => this.showTitle(),
    };
    for (let h = 0; h <= maxHeat; h++) acts[`h${h}`] = () => { m.heat = h; this.showFounders(); };
    const heatRow = maxHeat ? `${sec('ϟ', 'Heat', `+20% seals per level`)}
      <div class="heat">${Array.from({ length: maxHeat + 1 }, (_, h) => `<button class="chip ${m.heat === h ? 'on' : ''}" data-act="h${h}">${h || 'Off'}</button>`).join('')}</div>
      <ul class="heat-rules">${HEATS.slice(0, m.heat).map(r => `<li>${r}</li>`).join('') || '<li>No extra rules.</li>'}</ul>` : '';
    this.overlay(sheet({
      kicker: 'New run',
      title: 'Pick your starting bag',
      note: 'This decides which pieces you begin with.',
      body: `<div class="heatbox">${heatRow}</div><div class="grid-row" style="margin-top:18px">${all.map(f => avail.includes(f)
        ? plate({ name: FOUNDERS[f].name, blocks: FOUNDERS[f].bag()[signature[f]].blocks }, { no: `${FOUNDERS[f].bag().length} pieces`, act: `f_${f}`, desc: FOUNDERS[f].desc })
        : blankPlate('', FOUNDERS[f].name, lockHint[f])).join('')}</div>`,
      foot: `${tab('Back', 'back')}<span class="label">Click one to start</span>`,
    }), true, acts);
    flushDrawings($('overlay'));
  }

  private showAtelier(back: () => void) {
    sfx.click();
    const m = this.meta;
    const acts: Record<string, () => void> = {
      back,
      refund_all: () => { if (!m.invested()) return; m.refundAll(); sfx.crumble(); this.showAtelier(back); },
    };
    const rows = UPGRADES.map(u => {
      const rank = m.rank(u.id);
      const maxed = rank >= u.costs.length;
      const locked = !!u.locked && !m.has(u.locked);
      const cost = maxed ? 0 : u.costs[rank];
      acts[`u_${u.id}`] = () => { if (m.buy(u.id)) { sfx.unlock(); this.showAtelier(back); } };
      acts[`r_${u.id}`] = () => { if (m.refund(u.id)) { sfx.click(); this.showAtelier(back); } };
      const pips = u.costs.map((_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
      const lockPlate = locked ? CODEX.find(c => c.id === u.locked)! : null;
      return `<div class="up ${locked ? 'locked' : ''} ${maxed ? 'maxed' : ''}">
        ${badge(locked ? '✕' : u.icon)}
        <div class="body">
          <div class="top"><span class="nm">${u.name}</span><span class="pips">${pips}</span></div>
          <div class="ds">${locked ? `Locked. Complete the challenge <b>${lockPlate!.name}</b>: ${lockPlate!.req}` : rank ? `<b>Now:</b> ${u.desc(rank)}${maxed ? ' (max)' : `<span class="label">next: ${u.desc(rank + 1)}</span>`}` : u.desc(1)}</div>
          ${locked ? '' : `<div class="buy">${rank ? tab(`− Refund ${u.costs[rank - 1]} ✠`, `r_${u.id}`) : '<span></span>'}${maxed ? '<span class="label">max</span>' : tab(`+ ${cost} ✠`, `u_${u.id}`, { disabled: m.seals < cost, red: true })}</div>`}
        </div>
      </div>`;
    }).join('');
    const invested = m.invested();
    this.overlay(sheet({
      kicker: '',
      title: 'Workshop',
      note: 'Put your seals ✠ into upgrades. You can take them back for a full refund any time between runs, so try different setups!',
      headRight: `<div class="bigstat"><span class="label">Free seals</span><b>${m.seals} ✠</b></div><div class="bigstat"><span class="label">In use</span><b>${invested} ✠</b></div>`,
      body: `<div class="atelier">${rows}</div>`,
      foot: `<div style="display:flex; gap:6px">${tab('Back', 'back')}${tab('Refund all', 'refund_all', { disabled: !invested })}</div><span class="label">Earn seals: 1 per night survived · +6 per challenge · +8 for a win</span>`,
    }), true, acts);
  }

  private codexPlate(c: CodexDef, done: boolean) {
    return `<div class="cx ${done ? 'done' : ''} ${c.id === 'grand_architect' ? 'capstone' : ''}">
      <div class="nm">${c.name}</div>
      <div class="row goal">${c.req}</div>
      <div class="row"><span class="label">Reward</span>${c.reward} <b>+${SEALS.plate} ✠</b></div>
      ${done ? impression('Done') : ''}
    </div>`;
  }

  private showCodex() {
    sfx.click();
    const m = this.meta;
    const order = [...CODEX.filter(c => c.id !== 'grand_architect'), CODEX.find(c => c.id === 'grand_architect')!];
    this.overlay(sheet({
      kicker: '',
      title: 'Challenges',
      note: 'Each challenge asks you to play a different way. Completing them unlocks new relics, pieces and workshop upgrades.',
      headRight: `<div class="bigstat"><span class="label">Done</span><b>${m.unlocked.size} / ${CODEX.length}</b></div>`,
      body: `<div class="codex">${order.map(c => this.codexPlate(c, m.has(c.id))).join('')}</div>`,
      foot: `${tab('Back', 'back')}${tab('Reset all progress', 'reset', { red: true })}`,
    }), true, {
      back: () => this.showTitle(),
      reset: () => this.ask('Reset everything?', 'This erases all challenges, seals and workshop upgrades. It cannot be undone.', 'Erase', () => { this.meta.reset(); this.showCodex(); }),
    });
  }

  private showHowTo() {
    sfx.click();
    const item = (n: string, t: string, body: string) => `<div class="item"><h4><span>${n}</span>${t}</h4><p>${body}</p></div>`;
    this.overlay(sheet({
      kicker: '',
      title: 'How to play',
      note: `Protect the pink core for ${NIGHTS} nights.`,
      body: `<div class="manual">
        ${item('1', 'Build by day', `You get ${HAND_SIZE} pieces each day. A piece lands on top of whatever is below it, so you can build <b>up</b> or <b>out</b>. Pieces must touch your buildings or the core. You can <b>keep</b> one piece for tomorrow and <b>demolish</b> 2 blocks a day.`)}
        ${item('2', 'Survive the night', 'Enemies come from the <b class="red">red</b> sides. They chew through the <b>bottom</b> block of a column to reach the core.')}
        ${item('3', 'Tall towers', 'Turrets shoot further the higher they are. Stack the same material to make it stronger: three crystals on top of each other hit harder than one. A turret standing on stone (or rock) shoots 1 cell further.')}
        ${item('4', 'Topple!', 'At night, click a tower to knock it over. Every block that lands on an enemy crushes it, and the tower becomes a wall. What it is made of matters: ember splashes fire, crystal shatters into shards, ward leaves a slow field, garden drops gold. You get one topple per night.')}
        ${item('✦', 'Combos', `A turret touching a certain block (side, above or below) gets a twist, and a small star shows on it: ${Object.values(COMBOS).map(c => `${MATS[c.turret].name.toLowerCase()} + ${MATS[c.with].name.toLowerCase()} = <b>${c.name}</b>`).join(', ')}. Hover a tower in the day to see what it does.`)}
        ${item('◎', 'Gold tips', 'Every 10 gold you save earns +1 at dawn (up to +3). Starting the night with pieces still in hand pays +1 gold each. At night you can drop an emergency stone for 3 gold, and at a camp on the map you can make the core pulse hit harder.')}
        ${item('ϟ', 'Weather', 'Some nights have weather: fog shortens turret range, thunderstorms strike your tallest tower (put a crystal on top to turn it into a weapon!), and a full moon makes enemies faster but pays extra gold. Check the Tonight panel.')}
        ${item('★', 'Unique blocks', 'Rare block stops on the map (and sometimes your morning pick) offer special blocks: the Anvil, Bell, Powder Keg, Omen Stone, Fountain or Mirror. Each one has its own rule, so build around it!')}
        ${item('✈', 'Journeys', 'After nights 4 and 8 your island flies to a new land (Dunes, Glacier or Caldera) with new rules. On the way, blocks on the outer edge break off and very tall towers lose their tops.')}
        ${item('5', 'Wide bases', 'Gardens on the ground earn gold every morning. Every block is a wall enemies must chew through.')}
        ${item('6', 'Watch out', '<b class="red">Sappers</b> tunnel to your tallest tower and blow up its base. <b class="red">Brutes</b> show up more when you build wide.')}
        ${item('7', 'The map', 'After each night you pick a free piece, then choose your path on the map. Red squares are nights (some are harder but pay more). The stops between them each do one thing: a shop, a camp to heal, a forge, treasure, a rare block or a mystery.')}
        ${item('8', 'Seals & workshop', 'Every run earns seals ✠, even if you lose. Spend them in the workshop on permanent upgrades. Challenges give the most seals.')}
        ${item('⌨', 'Controls', '<kbd>Click</kbd> place / topple · <kbd>R</kbd> rotate · drag to look around · <kbd>Q</kbd><kbd>E</kbd> turn the camera · <kbd>1</kbd>–<kbd>5</kbd> pick a piece · <kbd>K</kbd> keep for tomorrow · <kbd>X</kbd> demolish · <kbd>Space</kbd> start the night · <kbd>F</kbd> speed · <kbd>M</kbd> mute')}
      </div>`,
      foot: `${tab('Back', 'back')}`,
    }), true, { back: () => this.showTitle() });
  }

  // ======================= run lifecycle =======================

  startRun(founder: FounderId) {
    sfx.click();
    this.nums.clear();
    this.r.clearAll();
    const meta = this.meta;
    const hot = meta.heat >= 2 ? 3 : 0;
    const coreMax = START_CORE_HP + (meta.has('untouched') ? 3 : 0) + 2 * meta.rank('foundations') - hot;
    this.run = {
      board: new Board(), founder, bag: FOUNDERS[founder].bag(), draw: [], hand: [], used: [],
      gold: Math.max(0, START_GOLD + 2 * meta.rank('treasury') - hot), coreHp: coreMax, coreMax, day: 1, relics: [],
      stats: { nights: 0, maxTallest: 0, maxHollows: 0, fallKills: 0, kills: 0, placedMats: new Set(), coreDamaged: false, finalFootprint: 0, finalMats: new Set(), won: false, maxChain: 1, calderaNights: 0, maxUniques: 0 },
      route: rollRoute(), act: 0, heat: meta.heat, coreLevel: 0, vents: [], wave: makeWave(1), handSize: HAND_SIZE + (meta.has('grand_architect') ? 1 : 0),
      draft: [], draftPick: -1, treasure: [], treasurePick: -1, platesEarned: 0, redraws: 0, demolishes: 0, keep: null, keptIdx: -1, topples: 0, keystone: meta.rank('keystone') > 0, shop: [], shopSold: [], market: [], marketSold: [], income: [], contract: 'standard', event: null, eventDone: '', map: makeMap(0, { treasure: meta.heat < 5 }), hurt: {}, hurtByNight: {}, undo: [], drops: 0, rallies: 0, shoreups: 0, killsTonight: 0, buys: 0, premium: null, premiumSold: false, temper: {},
    };
    const gifts = (meta.has('grand_architect') ? 1 : 0) + meta.rank('cartouche');
    for (const id of this.relicChoices(gifts)) { this.addRelic(id); this.toast(`Starting relic: ${relicDef(id).name}.`); }
    this.overlay('');
    this.relicsShown = 0;
    this.showHud(true);
    this.r.syncBoard(this.run.board);
    this.r.setBiome(this.biome);
    // a brand-new player builds before meeting the map
    if (!meta.runs) this.enterNode(this.run.map.nodes[0]);
    else this.showMap();
  }

  // ======================= saved runs =======================

  /** The run is saved every time you stand on the map, so closing the tab costs nothing. */
  private saveRun() {
    const run = this.run;
    if (!run) return;
    try {
      const data = { ...run, board: run.board.snapshot(), stats: { ...run.stats, placedMats: [...run.stats.placedMats], finalMats: [...run.stats.finalMats] }, undo: [] };
      localStorage.setItem(RUN_KEY, JSON.stringify(data));
    } catch { /* storage full or blocked: play on without saving */ }
  }

  private savedRun(): { day: number; route: BiomeId[]; act: number } | null {
    try { const s = localStorage.getItem(RUN_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  }

  private clearSave() { try { localStorage.removeItem(RUN_KEY); } catch { /* fine */ } }

  private loadRun() {
    let data: any;
    try { data = JSON.parse(localStorage.getItem(RUN_KEY)!); } catch { return this.showTitle(); }
    sfx.click();
    this.r.clearAll();
    const board = new Board();
    board.restore(data.board);
    // pieces are shared by reference between bag, draw pile and hand: rebuild those links
    const bag: Piece[] = data.bag;
    const same = (p: Piece) => bag.find(b => JSON.stringify(b) === JSON.stringify(p)) ?? p;
    this.run = {
      ...data, board, bag,
      draw: data.draw.map(same), hand: data.hand.map(same), keep: data.keep ? same(data.keep) : null,
      stats: { ...data.stats, placedMats: new Set(data.stats.placedMats), finalMats: new Set(data.stats.finalMats) },
      undo: [],
    } as Run;
    this.nums.clear();
    this.relicsShown = 0;
    this.showHud(true);
    this.r.setBiome(this.biome);
    this.r.setVents(this.run!.vents);
    this.r.syncBoard(board);
    this.trackStats();
    this.showMap();
  }

  // ======================= settings =======================

  private applySettings() {
    const s = this.settings;
    setVolumes(s.sfx, s.music);
    applyColorBlind(s.colorBlind);
    document.body.classList.toggle('reduce-motion', s.reduceMotion);
    this.r?.setCameraSpeed(s.camSpeed);
  }

  private showSettings(back: () => void) {
    sfx.click();
    const s = this.settings;
    const slider = (key: 'sfx' | 'music' | 'camSpeed', label: string, min: number, max: number) => `
      <label class="setting"><span>${label}</span>
        <span class="steps">${[0, 1, 2, 3, 4].map(i => { const v = +(min + ((max - min) * i) / 4).toFixed(2); return `<button class="chip ${Math.abs(s[key] - v) < 0.01 ? 'on' : ''}" data-act="${key}_${i}">${key === 'camSpeed' ? `${v}×` : i === 0 ? 'Off' : `${i * 25}%`}</button>`; }).join('')}</span></label>`;
    const toggle = (key: 'reduceMotion' | 'colorBlind', label: string, note: string) => `
      <label class="setting"><span>${label}<small>${note}</small></span><span class="steps"><button class="chip ${s[key] ? '' : 'on'}" data-act="${key}_0">Off</button><button class="chip ${s[key] ? 'on' : ''}" data-act="${key}_1">On</button></span></label>`;
    const acts: Record<string, () => void> = { back };
    for (const [key, min, max] of [['sfx', 0, 1], ['music', 0, 1], ['camSpeed', 0.5, 1.5]] as const)
      for (let i = 0; i < 5; i++) acts[`${key}_${i}`] = () => { s[key] = +(min + ((max - min) * i) / 4).toFixed(2); this.commitSettings(back); };
    for (const key of ['reduceMotion', 'colorBlind'] as const)
      for (const i of [0, 1]) acts[`${key}_${i}`] = () => { s[key] = !!i; this.commitSettings(back); };
    this.overlay(sheet({
      kicker: '',
      title: 'Settings',
      body: `<div class="settings">
        ${slider('sfx', 'Sound effects', 0, 1)}
        ${slider('music', 'Music', 0, 1)}
        ${slider('camSpeed', 'Camera speed', 0.5, 1.5)}
        ${toggle('reduceMotion', 'Reduce motion', 'Fewer menu and HUD animations')}
        ${toggle('colorBlind', 'Colour-blind colours', 'Block colours that are easier to tell apart')}
      </div>`,
      foot: tab('Back', 'back'),
    }), true, acts);
  }

  private commitSettings(back: () => void) {
    saveSettings(this.settings);
    this.applySettings();
    // block colours changed: repaint every block
    if (this.run) { this.r.clearAll(); this.r.syncBoard(this.run.board); this.r.setVents(this.run.vents); }
    this.showSettings(back);
  }

  // ======================= journey between biomes =======================

  /** The island is carried to the next biome: pay the travel damage, land, read the new rules. */
  private showJourney() {
    const run = this.run!;
    // the flight: clouds rush past, then the new land's sheet
    if (!this.flying) {
      this.flying = true;
      this.overlay('');
      this.r.journeyFx(2.6);
      sfx.nightStart();
      this.banner('The island takes off', 'Journey', `to ${BIOMES[run.route[actOf(run.day)]].name}`);
      setTimeout(() => { this.showJourney(); }, 2300);
      return;
    }
    this.flying = false;
    run.act = actOf(run.day);
    const b = this.biome;
    const lost = run.board.journeyDamage(JOURNEY_MAX_H);
    // the new landscape
    run.vents = [];
    for (const c of randomCells(b.outcrops, 3, (x, y) => run.board.height(x, y) > 0)) run.board.addTerrain(c.x, c.y, 1 + Math.floor(Math.random() * 2), 'rock', MATS.rock.hp);
    run.vents = randomCells(b.vents, 3, (x, y) => run.board.height(x, y) > 0);
    this.rehp();
    this.r.setBiome(b);
    this.r.setVents(run.vents);
    this.r.syncBoard(run.board);
    this.r.shakeCam(0.5);
    sfx.nightStart();
    this.trackStats();
    const damage = lost.rim + lost.tops
      ? `The trip cost you ${lost.rim ? `${lost.rim} block${lost.rim > 1 ? 's' : ''} from the rim` : ''}${lost.rim && lost.tops ? ' and ' : ''}${lost.tops ? `${lost.tops} block${lost.tops > 1 ? 's' : ''} from tower tops` : ''}.`
      : 'Your fortress made the trip without a scratch.';
    this.overlay(sheet({
      kicker: `Act ${run.act + 1} of 3 · the island has moved`,
      title: b.name,
      note: b.tagline,
      body: `<div class="rules">${b.rules.map(([i, t]) => `<div class="brule"><span class="ic">${i}</span><span>${t}</span></div>`).join('')}</div>
        <p class="journey-loss">${damage}</p>`,
      foot: `<span class="label">Next: ${run.route[run.act + 1] ? `then ${BIOMES[run.route[run.act + 1]].name}` : 'the final act'}</span>${stamp('Land', 'land')}`,
      cls: 'journey',
    }), true, { land: () => { sfx.click(); run.map = makeMap(run.act, { treasure: run.heat < 5 }); this.showMap(); } });
  }

  private startDay() {
    const run = this.run!;
    this.phase = 'day';
    this.r.setNight(false);
    this.overlay('');
    this.drawHand();
    run.redraws = this.meta.rank('redraft');
    run.demolishes = DEMOLISH_PER_DAY;
    run.undo = [];
    run.buys = 0;
    this.demolishing = false;
    this.sel = -1;
    this.rot = 0;
    this.r.setTelegraph(run.wave.sides);
    this.r.setPaths(this.enemyPaths());
    this.banner(`${run.day} of ${NIGHTS}`, 'Day', run.wave.guardian ? `tonight: ${ENEMIES[run.wave.guardian].name}` : 'time to build');
    this.renderHud();
    if (run.day === 1) this.selectCard(0);
  }

  private drawHand() {
    const run = this.run!;
    run.hand = run.keep ? [run.keep] : [];
    const size = run.handSize + (run.keep ? 1 : 0);
    run.keep = null;
    run.keptIdx = -1;
    for (let i = run.hand.length; i < size; i++) {
      if (!run.draw.length) run.draw = shuffle(run.bag.filter(p => !run.hand.includes(p)));
      const p = run.draw.pop();
      if (p && !run.hand.includes(p)) run.hand.push(p);
    }
    run.used = run.hand.map(() => false);
    this.handDeal++;
  }

  private beginNight() {
    const run = this.run;
    if (!run || this.phase !== 'day') return;
    this.phase = 'night';
    this.sel = -1;
    this.r.clearGhost();
    this.r.setRanges([]);
    this.r.setNight(true);
    sfx.nightStart();
    // starting early pays: +1 gold per piece left unplaced
    const early = run.used.filter(u => !u).length;
    if (early) { run.gold += early; this.toast(`Early start: +${early} gold.`); }
    this.dropping = false;
    this.shoring = false;
    this.paused = false;
    document.body.classList.remove('paused');
    run.undo = [];
    run.drops = 0; run.rallies = 0; run.shoreups = 0; run.killsTonight = 0;
    this.showAllRanges = false;
    this.nightTip = '';
    this.r.setPaths([]);
    this.r.setValid([]);
    run.topples = 1 + this.meta.rank('leverage') + (CONTRACTS[run.contract].topple ?? 0) + (this.has('tipping_point') ? 1 : 0);
    if (this.has('storm_caller') && !run.wave.guardian) run.wave.weather = 'storm';
    this.toppleDir = null;
    this.night = new Night(run.board, this.r, run.wave, {
      has: this.has,
      mods: this.mods(),
      biome: this.biome,
      heat: run.heat,
      coreLevel: run.coreLevel,
      chain: n => { run.stats.maxChain = Math.max(run.stats.maxChain, n); this.checkCodex(false); },
      aim: () => this.aim,
      vents: run.vents,
      gold: (n, at) => { run.gold += n; sfx.coin(); if (at) this.r.floatText(at.clone().add(new THREE.Vector3(0, 0.6, 0)), `+${n}`, '#f7c948'); this.renderTop(); },
      coreDamage: (n, by, at) => this.coreDamage(n, by, at),
      onKill: fall => {
        run.stats.kills++;
        if (fall) run.stats.fallKills++;
        // good defence earns more toppling
        if (++run.killsTonight % KILLS_PER_TOPPLE === 0) { run.topples++; this.toast(`${run.killsTonight} enemies down: +1 topple!`); this.renderActions(); }
      },
      boardChanged: () => { this.r.syncBoard(run.board); this.trackStats(); },
    });
    this.r.setWeather(run.wave.weather);
    this.r.setGates(run.wave.sides);
    music(run.wave.guardian ? 'boss' : 'night');
    // a boss arrives with ceremony: the camera turns to its gate and time slows for a moment
    if (run.wave.guardian) {
      const s = run.wave.sides[0], d = (N - 1) / 2 + 1.4;
      this.r.cinematic([new THREE.Vector3(0, 1.5, -d), new THREE.Vector3(d, 1.5, 0), new THREE.Vector3(0, 1.5, d), new THREE.Vector3(-d, 1.5, 0)][s], 3.2);
      this.slowmo = 3;
    }
    this.banner(`${run.day} of ${NIGHTS}`, run.wave.guardian ? ENEMIES[run.wave.guardian].name : 'Night', run.wave.guardian ? `the ${ENEMIES[run.wave.guardian].name.toLowerCase()} is coming` : `attack from the ${run.wave.sides.map(s => SIDE_NAMES[s]).join(' & ')}`);
    this.renderHud();
  }

  private get biome(): BiomeDef { return BIOMES[this.run?.route[this.run.act] ?? 'meadow']; }

  private mods() {
    const m = this.meta, b = this.biome;
    const t = this.run?.temper ?? {};
    return { crystal: (1 + 0.1 * m.rank('lens')) * (1 + 0.15 * (t.crystal ?? 0)), ember: (1 + 0.1 * m.rank('kiln')) * b.emberMult * (1 + 0.15 * (t.ember ?? 0)), range: 0.25 * m.rank('eye'), crystalRange: b.crystalRange, wardRange: 0.4 * (t.ward ?? 0) };
  }

  private coreDamage(n: number, by?: EnemyId, at?: THREE.Vector3) {
    const run = this.run!;
    run.coreHp = Math.max(0, run.coreHp - n);
    if (by) {
      run.hurt[by] = (run.hurt[by] ?? 0) + n;
      run.hurtByNight[run.day] = (run.hurtByNight[run.day] ?? 0) + n;
      this.r.floatText(world(CORE.x, CORE.y, 2.4), `−${n} ${ENEMIES[by].name}`, '#ff5470');
      if (at) this.hitMarker(at);
    }
    if (run.coreHp <= 0 && run.keystone) {
      run.keystone = false;
      run.coreHp = 3;
      this.toast('The keystone holds. The core stands at 3.', true);
    }
    run.stats.coreDamaged = true;
    this.r.coreHit();
    sfx.coreHit();
    this.renderTop();
    if (run.coreHp <= 0) this.endRun(false);
  }

  /** A red chevron beside the core, pointing at where the hit came from. */
  private hitMarker(at: THREE.Vector3) {
    const c = this.r.project(world(CORE.x, CORE.y, 1.1)), e = this.r.project(at);
    const a = Math.atan2(e.y - c.y, e.x - c.x);
    const m = document.createElement('div');
    m.className = 'hitmark';
    m.style.left = `${c.x + Math.cos(a) * 70}px`;
    m.style.top = `${c.y + Math.sin(a) * 70}px`;
    m.style.setProperty('--a', `${a}rad`);
    document.body.appendChild(m);
    setTimeout(() => m.remove(), 900);
  }

  /** Save the selected piece: it skips today and joins tomorrow's hand as an extra. */
  private keepPiece() {
    const run = this.run;
    if (!run || this.phase !== 'day' || this.sel < 0 || run.keep) return;
    run.keep = run.hand[this.sel];
    run.keptIdx = this.sel;
    run.used[this.sel] = true;
    this.sel = -1;
    sfx.place();
    this.r.clearGhost();
    this.renderHud();
    const next = run.used.findIndex(u => !u);
    if (next >= 0) this.selectCard(next);
  }

  // ======================= emergency stone (night) =======================

  /** The emergency stone gets pricier with every drop tonight, and in later acts. */
  private dropCost() { const run = this.run!; return DROP_COST + 2 * run.act + 2 * run.drops; }

  private toggleDrop() {
    const run = this.run;
    if (!run || this.phase !== 'night') return;
    this.shoring = false;
    this.dropping = !this.dropping && run.gold >= this.dropCost();
    this.ghostKey = '';
    this.r.clearGhost();
    sfx.click();
    this.renderActions();
    this.setHint(this.dropping ? `${matchMedia('(pointer: coarse)').matches ? 'Tap a spot twice' : 'Click a spot'} next to your fortress to drop a stone (${this.dropCost()} gold). It crushes whatever is under it.` : undefined);
  }

  private dropPlacement() {
    const run = this.run;
    if (!run || !this.lastPointer) return null;
    const cell = this.r.pick(this.lastPointer.x, this.lastPointer.y);
    return cell ? run.board.evaluate([{ x: 0, y: 0, z: 0, mat: 'stone' }], cell.x, cell.y) : null;
  }

  private tryDrop(touch: boolean) {
    const run = this.run!;
    const p = this.dropPlacement();
    if (!p || !p.cells.length) return;
    const key = `${p.cells[0].x},${p.cells[0].y}`;
    if (touch && this.demoKey !== key) { this.demoKey = key; this.r.setGhost(p.cells, p.ok); return; }
    this.demoKey = '';
    if (!p.ok || run.gold < this.dropCost()) { sfx.invalid(); return; }
    run.gold -= this.dropCost();
    run.drops++;
    run.board.place(p, this.hpMult);
    this.r.syncBoard(run.board);
    this.night!.crushAt(p.cells[0].x, p.cells[0].y);
    this.r.clearGhost();
    if (run.gold < this.dropCost()) this.dropping = false;
    this.renderTop();
    this.renderActions();
    this.setHint();
  }

  private rally() {
    const run = this.run;
    if (!run || this.phase !== 'night' || run.rallies >= 1 || !this.night) return;
    run.rallies++;
    this.night.rallyNow(RALLY_SECONDS);
    this.toast(`Rally! Turrets fire twice as fast for ${RALLY_SECONDS} seconds.`);
    this.renderActions();
  }

  private toggleShore() {
    const run = this.run;
    if (!run || this.phase !== 'night' || run.shoreups >= 1) return;
    this.dropping = false;
    this.shoring = !this.shoring;
    sfx.click();
    this.renderActions();
    this.setHint(this.shoring ? `${matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click'} a tower to shore it up: full repair and +50% HP for good.` : undefined);
  }

  private tryShore() {
    const run = this.run!;
    if (!this.lastPointer) return;
    const hit = this.r.pickBlock(this.lastPointer.x, this.lastPointer.y);
    if (!hit || !run.board.height(hit.x, hit.y)) { sfx.invalid(); return; }
    this.night!.shoreUp(hit.x, hit.y);
    run.shoreups++;
    this.shoring = false;
    this.r.tintBlocks(run.board);
    this.renderActions();
    this.setHint();
  }

  /** Gold sinks for the day: draw one more piece, or knock out one more block. */
  private buyCost() { return 4 + 2 * this.run!.buys + this.run!.act; }

  private buyPiece() {
    const run = this.run;
    if (!run || this.phase !== 'day' || run.gold < this.buyCost()) return;
    if (!run.draw.length) run.draw = shuffle(run.bag.filter(p => !run.hand.includes(p)));
    const p = run.draw.pop();
    if (!p) return;
    run.gold -= this.buyCost();
    run.buys++;
    run.hand.push(p);
    run.used.push(false);
    sfx.coin();
    this.renderHud();
    this.selectCard(run.hand.length - 1);
  }

  private payDemolish() {
    const run = this.run;
    if (!run || this.phase !== 'day' || run.demolishes > 0 || run.gold < DEMOLISH_COST) return;
    run.gold -= DEMOLISH_COST;
    run.demolishes = 1;
    sfx.coin();
    this.renderHud();
    this.toggleDemolish();
  }

  // ======================= demolish =======================

  private toggleDemolish() {
    const run = this.run;
    if (!run || this.phase !== 'day') return;
    this.demolishing = !this.demolishing && run.demolishes > 0;
    this.sel = -1;
    this.demoKey = '';
    this.r.clearGhost();
    this.r.setRanges([]);
    sfx.click();
    this.renderHand();
    this.renderActions();
    this.setHint();
  }

  private demolishTarget() {
    const run = this.run;
    if (!run || !this.lastPointer) return null;
    const hit = this.r.pickBlock(this.lastPointer.x, this.lastPointer.y);
    if (!hit) return null;
    const z = run.board.col(hit.x, hit.y).findIndex(b => b?.id === hit.id);
    if (z < 0) return null;
    return { x: hit.x, y: hit.y, z, mat: run.board.col(hit.x, hit.y)[z]!.mat };
  }

  private updateDemolishGhost() {
    const t = this.demolishTarget();
    if (!t) { this.r.clearGhost(); return; }
    this.r.setGhost([t], false);
  }

  private tryDemolish(touch: boolean) {
    const run = this.run!;
    const t = this.demolishTarget();
    if (!t || run.demolishes <= 0) return;
    // on touch, the first tap only highlights the block
    const key = `${t.x},${t.y},${t.z}`;
    if (touch && this.demoKey !== key) { this.demoKey = key; this.updateDemolishGhost(); return; }
    this.demoKey = '';
    run.board.destroy(t.x, t.y, t.z);
    run.demolishes--;
    this.r.syncBoard(run.board);
    this.r.clearGhost();
    sfx.crumble();
    this.r.shakeCam(0.1);
    this.trackStats();
    if (!run.demolishes) this.demolishing = false;
    this.renderHud();
  }

  // ======================= topple =======================

  /** The tower under the pointer, and which way it would fall. Auto-aims at the most enemies unless the player turned it. */
  private toppleAim(): { x: number; y: number; d: number; cells: { x: number; y: number; z: number; mat: MatId }[] } | null {
    const run = this.run, night = this.night;
    if (!run || !night || this.phase !== 'night' || run.topples <= 0 || !this.lastPointer) return null;
    const cell = this.r.pickBlock(this.lastPointer.x, this.lastPointer.y);
    if (!cell || !run.board.canTopple(cell.x, cell.y)) return null;
    const key = `${cell.x},${cell.y}`;
    if (this.toppleKey !== key) { this.toppleKey = key; this.toppleDir = null; }
    let d = this.toppleDir ?? 0;
    if (this.toppleDir === null) {
      let best = -1;
      for (let i = 0; i < 4; i++) {
        const cells = run.board.toppleCells(cell.x, cell.y, i);
        const score = night.enemiesOn(cells, TOPPLE_SWING) * 10 + cells.filter(c => c.z >= 0).length;
        if (score > best) { best = score; d = i; }
      }
    }
    return { ...cell, d, cells: run.board.toppleCells(cell.x, cell.y, d) };
  }

  private updateToppleGhost() {
    const aim = this.toppleAim();
    if (!aim) {
      if (this.ghostKey) { this.ghostKey = ''; this.r.clearGhost(); }
      $('actions').querySelector<HTMLButtonElement>('[data-act=turn]')?.setAttribute('disabled', '');
      this.setHint();
      return;
    }
    const kept = aim.cells.filter(c => c.z >= 0);
    const key = `${aim.x},${aim.y},${aim.d},${this.run!.board.version}`;
    if (key !== this.ghostKey) { this.ghostKey = key; this.r.setGhost(kept, true); }
    const hits = this.night!.enemiesOn(kept, TOPPLE_SWING);
    const chain = kept.some(c => c.z >= 2) ? ' · knocks over the next tower!' : '';
    const touch = matchMedia('(pointer: coarse)').matches;
    this.setHint(`${touch ? 'Tap again' : 'Click'} to topple ${SIDE_NAMES[aim.d].toLowerCase()}${hits ? ` · crushes ${hits} enem${hits > 1 ? 'ies' : 'y'}` : ''}${chain} · ${touch ? 'Turn ↻' : 'R'} to change direction`);
    $('actions').querySelector<HTMLButtonElement>('[data-act=turn]')?.removeAttribute('disabled');
  }

  /** The topple counter glows when some tower could crush three or more enemies right now. */
  private toppleHint() {
    const run = this.run, n = this.night;
    const el = document.querySelector('#actions .topples');
    if (!run || !n || !el) return;
    let best = 0;
    if (run.topples > 0) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!run.board.canTopple(x, y)) continue;
        for (let d = 0; d < 4; d++) best = Math.max(best, n.enemiesOn(run.board.toppleCells(x, y, d).filter(c => c.z >= 0), TOPPLE_SWING));
      }
    }
    el.classList.toggle('hot', best >= 3);
    const tip = best >= 3 && !this.ghostKey ? `${best} enemies are bunched up near a tower: topple it!` : '';
    if (tip !== this.nightTip) { this.nightTip = tip; if (!this.ghostKey && !this.dropping && !this.shoring) this.setHint(); }
  }

  private tryTopple() {
    const aim = this.toppleAim();
    if (!aim) return;
    const run = this.run!;
    run.topples--;
    this.night!.topple(aim.x, aim.y, aim.d);
    if (this.has('tipping_point')) { run.gold += 2; this.renderTop(); }
    this.toppleKey = '';
    this.r.clearGhost();
    this.renderActions();
    this.updateToppleGhost();
  }

  private turnTopple() {
    const aim = this.toppleAim();
    if (!aim) return;
    this.toppleDir = (aim.d + 1) % 4;
    sfx.rotate();
    this.updateToppleGhost();
  }

  private endNight() {
    const run = this.run!;
    this.night?.dispose();
    this.r.clearGhost();
    this.night = null;
    this.fade($('bossbar'), false);
    run.stats.nights = run.day;
    if (this.biome.id === 'caldera') run.stats.calderaNights++;
    if (run.day > this.meta.bestNight) { this.meta.bestNight = run.day; this.meta.save(); }
    this.checkCodex(false);
    if (run.day >= NIGHTS) return this.endRun(true);
    this.phase = 'dawn';
    this.r.setNight(false);
    this.r.setTelegraph([]);
    this.r.setWeather(null);
    this.r.setGates([]);
    this.clearEdgeMarks();
    music('day');
    sfx.dawn();
    // fountains repair their surroundings
    for (const f of [...run.board.blocks()].filter(b => b.b.mat === 'fountain')) {
      for (const { x, y, b } of run.board.blocks()) if (Math.max(Math.abs(x - f.x), Math.abs(y - f.y)) <= 2) b.hp = b.maxHp;
      run.coreHp = Math.min(run.coreMax, run.coreHp + 1);
      this.r.ring(world(f.x, f.y, 0.1), 2.5, MATS.fountain.color, 0.8);
    }
    this.r.tintBlocks(run.board);
    // income
    const st = run.board.stats();
    const income: [string, number][] = [['Morning pay', 3 + this.meta.rank('tithe')]];
    // diminishing returns so a sea of gardens isn't an infinite money printer
    const gCount = this.has('deep_roots') ? st.gardens : st.groundGardens;
    const gardens = Math.floor(2.5 * Math.sqrt(gCount) * this.biome.gardenMult);
    if (gardens) income.push([this.has('deep_roots') ? 'Gardens (Deep Roots)' : 'Gardens on the ground', gardens]);
    if (this.has('cartographer')) income.push(['Cartographer', Math.floor(st.footprint / 6)]);
    if (this.has('arches')) income.push(['Vaulted Arches', Math.min(6, Math.floor(st.hollows / 2))]);
    // interest: savings grow a little
    const interest = this.has('vault') ? Math.min(INTEREST_CAP, Math.floor(run.gold / 10)) : 0;
    if (interest) income.push(['Treasury Vault', interest]);
    const done = CONTRACTS[run.contract];
    if (done.gold) income.push([`Contract: ${done.name}`, done.gold]);
    run.income = income.filter(i => i[1] > 0);
    run.gold += run.income.reduce((s, i) => s + i[1], 0);
    // the night's reward: one free piece (rare ones come gilded or unique), plus a relic after a sky raid
    const pool = this.meta.matPool();
    run.draft = Array.from({ length: 3 + this.meta.rank('draughtsman') }, () => {
      const p = randomPiece(pool);
      if (Math.random() < 0.15) { p.gilded = true; p.name = `Gilded ${p.name}`; }
      return p;
    });
    const owned = new Set(run.bag.flatMap(p => p.blocks.map(b => b.mat)));
    const fresh = UNIQUES.filter(u => !owned.has(u));
    if (fresh.length && Math.random() < 0.1) run.draft[run.draft.length - 1] = uniquePiece(fresh[Math.floor(Math.random() * fresh.length)]);
    run.draftPick = -1;
    run.treasure = CONTRACTS[run.contract].relic ? this.relicChoices(2) : [];
    run.treasurePick = -1;
    run.day++;
    run.contract = 'standard';
    this.renderHud();
    const lost = run.hurtByNight[run.day - 1] ?? 0;
    this.banner(`Night ${run.day - 1}`, 'Survived', `${run.killsTonight} defeated · ${lost ? `core −${lost}` : 'core untouched'}`);
    setTimeout(() => { if (this.phase === 'dawn' && this.run === run) this.showReward(); }, 1400);
  }

  private endRun(won: boolean) {
    const run = this.run!;
    this.clearSave();
    music('off');
    this.phase = 'end';
    this.night?.dispose();
    this.night = null;
    this.fade($('bossbar'), false);
    const st = run.board.stats();
    run.stats.won = won;
    run.stats.finalFootprint = st.footprint;
    run.stats.finalMats = st.mats;
    this.meta.runs++;
    if (won) this.meta.wins++;
    const earned = this.meta.evaluate(run.stats, true);
    run.platesEarned += earned.length;
    // seal payout
    const held = won ? NIGHTS : run.day - 1;
    const payout: [string, number][] = [['Nights survived', held * SEALS.night]];
    const hard = (held >= 4 ? 1 : 0) + (held >= 8 ? 1 : 0) + (won ? 1 : 0);
    if (hard) payout.push(['Elite & boss nights', hard * SEALS.hardNight]);
    if (won) payout.push(['Victory', SEALS.win]);
    if (run.platesEarned) payout.push([`Challenges done (${run.platesEarned})`, run.platesEarned * SEALS.plate]);
    if (run.heat) payout.push([`Heat ${run.heat} bonus`, Math.round(payout.reduce((s, p) => s + p[1], 0) * 0.2 * run.heat)]);
    if (won) this.meta.heatWon = Math.max(this.meta.heatWon, run.heat);
    const runSeals = payout.reduce((s, p) => s + p[1], 0);
    // plate seals were already credited when the plates were certified
    this.meta.seals += runSeals - run.platesEarned * SEALS.plate;
    this.meta.save();
    if (won) sfx.dawn(); else sfx.lose();
    if (earned.length) setTimeout(() => sfx.unlock(), 600);
    this.r.setNight(!won);
    const s = run.stats;
    const row = (k: string, v: string | number) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`;
    const open = CODEX.filter(c => !this.meta.has(c.id)).slice(0, 3);
    const affordable = UPGRADES.some(u => {
      const r = this.meta.rank(u.id);
      return r < u.costs.length && (!u.locked || this.meta.has(u.locked)) && u.costs[r] <= this.meta.seals;
    });
    this.overlay(sheet({
      kicker: '',
      title: won ? 'You won!' : 'The core broke',
      note: won ? `You survived all ${NIGHTS} nights.` : `You made it to night ${run.day} of ${NIGHTS}.`,
      headRight: `<div class="verdict">${won ? 'Victory' : 'Defeat'}</div>`,
      body: `<div class="cols"><div>
          ${sec(1, 'Your run')}
          <table class="schedule">
            ${row('Enemies defeated', s.kills)}
            ${row('Crushed by falling blocks', s.fallKills)}
            ${row('Tallest tower', s.maxTallest)}
            ${row('Area built', s.finalFootprint)}
          </table>
          ${!won && Object.keys(run.hurt).length ? `${sec('!', 'What hurt the core')}
            <table class="schedule hurt">${(Object.entries(run.hurt) as [EnemyId, number][]).sort((a, b) => b[1] - a[1]).map(([t, v]) => `<tr><td>${enemyGlyph(t)} ${ENEMIES[t].name}</td><td class="n">−${v}</td></tr>`).join('')}</table>
            <p class="note">Worst night: night ${Object.entries(run.hurtByNight).sort((a, b) => b[1] - a[1])[0][0]} (−${Object.entries(run.hurtByNight).sort((a, b) => b[1] - a[1])[0][1]} HP).</p>` : ''}
          ${earned.length
            ? `${sec(2, 'Challenges completed!')}<div class="codex">${earned.map(c => this.codexPlate(c, true)).join('')}</div>`
            : `${sec(2, 'Try next')}<div class="codex">${open.map(c => this.codexPlate(c, false)).join('')}</div>`}
        </div>
        <aside class="side">
          ${sec('✠', 'Seals earned')}
          <div class="ledger">
            ${payout.map(([k, v]) => ledgerLine(k, `+${v} ✠`)).join('')}
            ${ledgerLine('You have', `${this.meta.seals} ✠`, 'total')}
          </div>
          ${affordable ? `<p class="note" style="margin-top:8px">You can buy a workshop upgrade!</p>` : ''}
        </aside></div>`,
      foot: `<div style="display:flex; gap:6px">${tab('Main menu', 'title')}${tab('Workshop', 'atelier', { red: affordable })}</div>${stamp('Play again', 'again')}`,
    }), true, {
      again: () => this.showFounders(),
      title: () => this.showTitle(),
      atelier: () => this.showAtelier(() => this.showTitle()),
    });
  }

  private checkCodex(end: boolean) {
    const run = this.run;
    if (!run) return;
    for (const c of this.meta.evaluate(run.stats, end)) {
      run.platesEarned++;
      this.toast(`Challenge done: ${c.name}! +${SEALS.plate} ✠. ${c.reward}`, true);
      sfx.unlock();
    }
  }

  private trackStats() {
    const run = this.run!;
    const st = run.board.stats();
    this.r.setFocus(st.tallest);
    this.r.setLinks(this.beaconLinks());
    this.r.setCombos(this.comboBlocks());
    if (this.phase === 'day') this.r.setPaths(this.enemyPaths());
    run.stats.maxTallest = Math.max(run.stats.maxTallest, st.tallest);
    run.stats.maxHollows = Math.max(run.stats.maxHollows, st.hollows);
    run.stats.maxUniques = Math.max(run.stats.maxUniques, [...run.board.blocks()].filter(b => MATS[b.b.mat].unique).length);
  }

  /** Turret blocks that currently have a combo with a neighbour. */
  private comboBlocks() {
    const b = this.run!.board, out = new Set<number>();
    for (const { x, y, z, b: blk } of b.blocks()) {
      if (!MATS[blk.mat].turret) continue;
      const touching = new Set<MatId>();
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const nb = b.blockAt(x + dx, y + dy, z + dz); if (nb) touching.add(nb.mat); }
      if (reactionOf(blk.mat, touching)) out.add(blk.id);
    }
    return out;
  }

  /** What a piece would add to your fortress, in a line: turrets and combos with blocks you own. */
  private pieceNote(p: Piece) {
    const run = this.run!;
    const turrets = p.blocks.filter(b => MATS[b.mat].turret).length;
    const owned = new Set(run.bag.flatMap(q => q.blocks.map(b => b.mat)));
    const mats = new Set(p.blocks.map(b => b.mat));
    const combos = (Object.values(COMBOS)).filter(r => (mats.has(r.turret) && (owned.has(r.with) || mats.has(r.with))) || (mats.has(r.with) && owned.has(r.turret)));
    const parts: string[] = [];
    if (turrets) parts.push(`+${turrets} turret${turrets > 1 ? 's' : ''}`);
    else parts.push(`+${p.blocks.length} wall`);
    if (combos.length) parts.push(`combos: ${combos.slice(0, 2).map(c => `${c.icon} ${c.name}`).join(', ')}`);
    return parts.join(' · ');
  }

  /** The routes tonight's walkers will take: from three points on each attacking edge to the core. */
  private enemyPaths() {
    const run = this.run!, b = run.board;
    const out: { x: number; y: number }[][] = [];
    for (const side of run.wave.sides) for (const k of [2, 6, 10]) {
      let c = [{ x: k, y: 0 }, { x: N - 1, y: k }, { x: k, y: N - 1 }, { x: 0, y: k }][side];
      const path = [[{ x: k, y: -1 }, { x: N, y: k }, { x: k, y: N }, { x: -1, y: k }][side], c];
      for (let i = 0; i < 40 && !b.isCore(c.x, c.y); i++) { c = b.nextStep(c.x, c.y); path.push(c); }
      out.push(path);
    }
    return out;
  }

  /** Which turrets each beacon powers (the 3x3x3 cube around it), for drawing the links. */
  private beaconLinks() {
    const b = this.run!.board;
    const out: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }[] = [];
    for (const { x, y, z, b: blk } of b.blocks()) {
      if (blk.mat !== 'beacon') continue;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nb = b.blockAt(x + dx, y + dy, z + dz);
        if (nb && MATS[nb.mat].turret) out.push({ a: { x, y, z }, b: { x: x + dx, y: y + dy, z: z + dz } });
      }
    }
    return out;
  }

  // ======================= relics =======================

  private relicChoices(n: number, exclude: RelicId[] = []): RelicId[] {
    const owned = this.run?.relics ?? [];
    const pool = this.meta.relicPool().map(r => r.id).filter(id => !owned.includes(id) && !exclude.includes(id));
    return shuffle(pool).slice(0, n);
  }

  private price(base: number) {
    const f = (this.has('thrift') ? 0.7 : 1) * (1 - 0.1 * this.meta.rank('haggling'));
    return Math.ceil(base * f);
  }
  /** Relics get pricier the more you own. */
  private relicPrice(id: RelicId) { return this.price(relicDef(id).price + 3 * (this.run?.relics.length ?? 0) + 3 * (this.run?.act ?? 0)); }

  private addRelic(id: RelicId) {
    const run = this.run!;
    run.relics.push(id);
    if (id === 'reinforced') { run.coreMax += 5; run.coreHp = run.coreMax; }
    if (id === 'bulwark' || id === 'mortar' || id === 'tapestry') this.rehp();
    sfx.unlock();
  }

  private hpMult = (mat: MatId, z: number) =>
    (z === 0 ? this.biome.groundHp : 1) * (mat === 'stone' ? (this.has('bulwark') ? 2 : 1) * (1 + 0.15 * this.meta.rank('masonry')) : 1) * (this.has('mortar') && z > 0 ? 1.5 : 1) * (this.has('tapestry') && z === 0 ? 1.5 : 1);

  /** Re-apply HP multipliers to existing blocks after gaining an HP relic. */
  private rehp() {
    for (const { z, b } of this.run!.board.blocks()) {
      const max = Math.round(MATS[b.mat].hp * this.hpMult(b.mat, z) * (b.gilded ? GILD_HP : 1));
      b.hp = (b.hp / b.maxHp) * max;
      b.maxHp = max;
    }
  }

  // ======================= dawn: reward, then the map =======================

  /** After a night: collect gold and pick one free piece (plus a relic after a sky raid). */
  private showReward() {
    const run = this.run!;
    this.screen = () => this.showReward();
    const acts: Record<string, () => void> = {};
    run.draft.forEach((p, i) => (acts[`d${i}`] = () => {
      if (run.draftPick !== -1) return;
      run.bag.push(p); run.draftPick = i; sfx.place(); this.showReward();
    }));
    acts.dskip = () => {
      if (run.draftPick !== -1) return;
      run.draftPick = -2; run.gold += 2; sfx.coin();
      // skipping also clears out a plain stone piece, so the bag stays lean
      const plain = run.bag.filter(p => p.blocks.every(b => b.mat === 'stone'));
      if (plain.length && run.bag.length > 6) {
        const p = plain[Math.floor(Math.random() * plain.length)];
        run.bag.splice(run.bag.indexOf(p), 1);
        run.draw = run.draw.filter(d => d !== p);
        this.toast(`${p.name} left your bag.`);
      }
      this.showReward();
    };
    run.treasure.forEach((id, i) => (acts[`t${i}`] = () => {
      if (run.treasurePick !== -1) return;
      run.treasurePick = i; this.addRelic(id); this.showReward();
    }));
    acts.bag = () => this.showBag('view');
    const travelling = actOf(run.day) !== run.act;
    const picked = run.draftPick;
    const ready = picked !== -1 && (!run.treasure.length || run.treasurePick !== -1);
    acts.go = () => {
      if (!ready) return;
      sfx.click();
      if (travelling) this.showJourney(); else this.showMap();
    };
    const night = run.day - 1;
    const draft = run.draft.map((p, i) => plate(p, {
      act: `d${i}`, taken: picked === i ? 'Got it' : undefined, faded: picked !== -1 && picked !== i,
      desc: MATS[p.blocks[0].mat].unique ? MATS[p.blocks[0].mat].desc : this.pieceNote(p),
    })).join('');
    const waive = picked === -1
      ? `<div class="plate skip" data-act="dskip"><div class="blank"><span class="price"><i></i>+2</span></div><div class="nm">Skip</div><p class="note" style="margin:6px 0 0; font-size:12px">Take 2 gold and throw away a plain stone piece.</p></div>`
      : '';
    const treasure = run.treasure.map((id, i) => detail(id, {
      act: `t${i}`, taken: run.treasurePick === i ? 'Got it' : undefined, faded: run.treasurePick !== -1 && run.treasurePick !== i,
    })).join('');
    this.overlay(sheet({
      kicker: `Night ${night} survived · ${NIGHTS - night} to go`,
      title: 'Morning',
      headRight: this.purse(),
      body: `<div class="cols"><div>
          ${sec(1, 'Pick a free piece', picked === -1 ? '' : '✓ done')}
          <div class="grid-row">${draft}${waive}</div>
          ${run.treasure.length ? `${sec(2, 'Sky raid prize: pick a relic', run.treasurePick === -1 ? '' : '✓ done')}<div class="grid-row">${treasure}</div>` : ''}
        </div>
        <aside class="side">
          ${sec('+', 'Gold earned')}
          <div class="ledger">
            ${run.income.map(([k, v]) => ledgerLine(k, `+${v}`)).join('')}
            ${ledgerLine('Gold', `${run.gold}`, 'total')}
          </div>
          <div style="margin-top:10px">${tab(`See your bag (${run.bag.length})`, 'bag')}</div>
        </aside></div>`,
      foot: `<span class="label">${ready ? '' : 'Pick a piece (or skip) to go on'}</span>${stamp(travelling ? `Fly to ${BIOMES[run.route[actOf(run.day)]].name}` : 'To the map', 'go', '', !ready)}`,
    }), true, acts);
    flushDrawings($('overlay'));
    this.renderTop();
  }

  private purse() {
    const run = this.run!;
    return `<div class="bigstat"><span class="label">Core</span><b><span data-num="pcore">${Math.ceil(run.coreHp)}</span>/${run.coreMax}</b></div><div class="bigstat gold"><span class="label">Gold</span><b><span data-num="pgold">${run.gold}</span></b></div>`;
  }

  private nodeInfo(n: MapNode): { icon: string; name: string; desc: string } {
    if (n.kind === 'guardian') {
      const g = makeWave(n.night!).guardian!;
      return { icon: GUARDIAN_INFO.icon, name: ENEMIES[g].name, desc: `Night ${n.night}: the boss of this land. ${ENEMIES[g].desc}` };
    }
    if (n.kind === 'battle') {
      const c = CONTRACTS[n.contract!];
      const w = n.weather ? ` Weather: ${WEATHER[n.weather].name}. ${WEATHER[n.weather].desc}` : '';
      return { icon: c.icon, name: c.name, desc: `Night ${n.night}. ${c.desc}${w}` };
    }
    return STOPS[n.kind];
  }

  /** The act map: pick where to go next. Battles are nights, every other stop does one thing. */
  private showMap() {
    const run = this.run!;
    const m = run.map;
    this.phase = 'dawn';
    this.screen = () => this.showMap();
    this.saveRun();
    const next = reachable(m);
    // any spot can be inspected; only the next ones can be entered
    const sel0 = m.nodes[this.mapSel];
    if (!sel0 || m.visited.includes(sel0.id) || sel0.row <= (m.at === null ? -1 : m.nodes[m.at].row)) this.mapSel = next[0]?.id ?? -1;
    const acts: Record<string, () => void> = {
      bag: () => this.showBag('view'),
      settings: () => this.showSettings(() => this.showMap()),
      quit: () => this.ask('Quit to the title?', 'Your run is saved. Pick Continue on the title screen to carry on.', 'Quit', () => { this.showHud(false); this.showTitle(); }),
    };
    for (const n of m.nodes) acts[`n${n.id}`] = () => { if (this.mapSel === n.id && next.includes(n)) return this.enterNode(n); this.mapSel = n.id; sfx.click(); this.showMap(); };
    const sel = m.nodes[this.mapSel];
    const canGo = !!sel && next.includes(sel);
    acts.go = () => { if (canGo) this.enterNode(sel); };
    // rows run bottom (start) to top (boss)
    const X = (lane: number) => 20 + lane * 30;
    const Y = (row: number) => 100 - ((row + 0.5) / m.rows) * 100;
    // what's still reachable stays bright; the rest of the map fades back
    const future = ahead(m);
    const live = (id: number) => future.has(id) || m.visited.includes(id);
    const edges = m.nodes.flatMap(a => a.next.map(id => {
      const b = m.nodes[id];
      const walked = m.visited.includes(a.id) && m.visited.includes(b.id);
      const open = m.at === a.id;
      const gone = !walked && !(live(a.id) && future.has(b.id));
      return `<line x1="${X(a.lane)}" y1="${Y(a.row)}" x2="${X(b.lane)}" y2="${Y(b.row)}" class="${walked ? 'walked' : open ? 'open' : gone ? 'gone' : ''}"/>`;
    })).join('');
    const nodes = m.nodes.map(n => {
      const info = this.nodeInfo(n);
      const can = next.includes(n);
      const cls = [n.kind === 'battle' || n.kind === 'guardian' ? 'fight' : 'stop', `k-${n.kind}`, can ? 'can' : '', m.visited.includes(n.id) ? 'done' : '', m.at === n.id ? 'here' : '', this.mapSel === n.id ? 'sel' : '', live(n.id) ? '' : 'gone'].join(' ');
      const tag = n.night ? `<span class="nt">${n.night}</span>` : '';
      const wx = n.weather ? `<span class="wx">${WEATHER[n.weather].icon}</span>` : '';
      const danger = n.night && !m.visited.includes(n.id) ? `<span class="dg">${'●'.repeat(DANGER[n.kind === 'guardian' ? 'guardian' : n.contract!])}</span>` : '';
      return `<button class="node ${cls}" style="left:${X(n.lane)}%; top:${Y(n.row)}%; --i:${n.row}" data-act="n${n.id}" aria-label="${info.name}"><span class="ic">${info.icon}</span>${tag}${wx}${danger}</button>`;
    }).join('');
    // the island token: where you are now (or where you start)
    const hereNode = m.at === null ? m.nodes.find(n => n.row === 0)! : m.nodes[m.at];
    const token = `<span class="you ${m.at === null ? 'start' : ''}" style="left:${X(hereNode.lane)}%; top:${Y(hereNode.row)}%">${m.at === null ? 'Start' : 'You'}</span>`;
    const nextBiome = run.route[run.act + 1];
    const info = sel ? this.nodeInfo(sel) : null;
    const fight = !!sel && (sel.kind === 'battle' || sel.kind === 'guardian');
    const legend = (['shop', 'camp', 'forge', 'treasure', 'unique', 'event'] as StopKind[]).map(k => `<span><i>${STOPS[k].icon}</i>${STOPS[k].name}</span>`).join('');
    this.overlay(sheet({
      kicker: `Act ${run.act + 1} of 3 · ${this.biome.name}`,
      title: 'Map',
      note: 'Pick your path. Red squares are nights to survive. The circles between them are stops that each give you one thing.',
      headRight: this.purse(),
      body: `<div class="mapwrap">
          <div class="map" style="--rows:${m.rows}">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">${edges}</svg>
            ${nodes}
            ${token}
          </div>
          <aside class="mapinfo">
            ${info ? `<div class="pick ${fight ? 'fight' : ''}"><span class="ic">${info.icon}</span><div><span class="label">${fight ? 'Battle' : 'Stop'}${canGo ? '' : ' · later on the path'}</span><b>${info.name}</b><p>${info.desc}</p>${fight ? `<p class="dgline">Danger <span class="dg">${'●'.repeat(DANGER[sel.kind === 'guardian' ? 'guardian' : sel.contract!])}${'○'.repeat(4 - DANGER[sel.kind === 'guardian' ? 'guardian' : sel.contract!])}</span>${sel.contract && CONTRACTS[sel.contract].gold ? ` · Reward +${CONTRACTS[sel.contract].gold} gold` : sel.contract && CONTRACTS[sel.contract].relic ? ' · Reward: a relic' : ''}</p>` : ''}</div></div>` : ''}
            <p class="mapnote">${nextBiome ? `After the boss your island flies to ${BIOMES[nextBiome].name} ✈` : 'The boss at the top is the final battle.'}</p>
            <div class="legend">${legend}</div>
            <div class="legend nights">${(['standard', 'calm', 'bounty', 'siege', 'skyward'] as ContractId[]).map(c => `<span><i class="f">${CONTRACTS[c].icon}</i>${CONTRACTS[c].name}</span>`).join('')}<span><i class="f">${GUARDIAN_INFO.icon}</i>Boss</span><span><i class="dgk">●</i>Danger</span></div>
            <div class="bagbtn">${tab(`See your bag (${run.bag.length})`, 'bag')}${tab('Settings', 'settings')}${tab('Quit to title', 'quit')}</div>
          </aside>
        </div>`,
      foot: `<span class="label">${matchMedia('(pointer: coarse)').matches ? 'Tap a glowing spot, then Go' : 'Click a glowing spot to choose it'}</span>${stamp(canGo ? (fight ? `Start day ${run.day}` : `Go: ${info!.name}`) : 'Not yet', 'go', '', !canGo)}`,
      cls: 'mapsheet',
    }), true, acts);
    if (!this.meta.runs && run.day === 2 && m.visited.length === 1) this.toast('This is the map. Pick your path to the boss: each spot does one thing.');
    // keep the spot you are choosing on screen (the map is taller than a phone)
    document.querySelector('.map .node.sel')?.scrollIntoView({ block: 'center' });
    this.renderHud();
  }

  private enterNode(n: MapNode) {
    const run = this.run!;
    const m = run.map;
    if (!reachable(m).includes(n)) return;
    sfx.click();
    m.at = n.id;
    m.visited.push(n.id);
    if (n.kind === 'battle' || n.kind === 'guardian') {
      run.contract = n.contract ?? 'standard';
      run.wave = makeWave(run.day, run.board.stats(), CONTRACTS[run.contract]);
      run.wave.weather = n.weather ?? null;
      if (this.has('storm_caller') && !run.wave.guardian) run.wave.weather = 'storm';
      return this.startDay();
    }
    if (n.kind === 'shop') {
      const pool = this.meta.matPool();
      run.shop = this.relicChoices(3);
      run.shopSold = run.shop.map(() => false);
      run.market = [randomPiece(pool), randomPiece(pool)];
      run.marketSold = [false, false];
      const owned = new Set(run.bag.flatMap(p => p.blocks.map(b => b.mat)));
      const fresh = UNIQUES.filter(u => !owned.has(u));
      run.premium = fresh.length ? uniquePiece(fresh[Math.floor(Math.random() * fresh.length)]) : null;
      run.premiumSold = false;
      return this.showShop();
    }
    if (n.kind === 'treasure') { run.treasure = this.relicChoices(3); return this.showTreasure(); }
    if (n.kind === 'unique') {
      const owned = new Set(run.bag.flatMap(p => p.blocks.map(b => b.mat)));
      run.draft = shuffle(UNIQUES.filter(u => !owned.has(u))).slice(0, 2).map(u => uniquePiece(u));
      return this.showUnique();
    }
    if (n.kind === 'event') { run.event = EVENTS[Math.floor(Math.random() * EVENTS.length)]; run.eventDone = ''; return this.showEvent(); }
    if (n.kind === 'camp') return this.showCamp();
    return this.showForgeStop();
  }

  /** One small sheet for a single-choice stop. */
  private stopSheet(n: StopKind, body: string, acts: Record<string, () => void>, leave = 'Back to the map') {
    acts.leave = () => { sfx.click(); this.showMap(); };
    acts.bag = () => this.showBag('view');
    this.overlay(sheet({
      kicker: `Stop · ${this.biome.name}`,
      title: STOPS[n].name,
      note: STOPS[n].desc,
      headRight: this.purse(),
      body,
      foot: `${tab(`Bag · ${this.run!.bag.length}`, 'bag')}${stamp(leave, 'leave')}`,
      cls: 'stopsheet',
    }), true, acts);
    flushDrawings($('overlay'));
    this.renderTop();
  }

  private option(icon: string, name: string, desc: string, act: string, ok = true) {
    return `<button class="contract" data-act="${act}" ${ok ? '' : 'disabled'}><span class="ic">${icon}</span><span><b>${name}</b><small>${desc}</small></span></button>`;
  }

  private showShop() {
    const run = this.run!;
    this.screen = () => this.showShop();
    const acts: Record<string, () => void> = {};
    run.shop.forEach((id, i) => (acts[`s${i}`] = () => {
      const pr = this.relicPrice(id);
      if (run.gold < pr || run.shopSold[i]) return;
      run.gold -= pr; run.shopSold[i] = true; this.addRelic(id); this.showShop();
    }));
    const pieceCost = this.price(5);
    run.market.forEach((p, i) => (acts[`m${i}`] = () => {
      if (run.gold < pieceCost || run.marketSold[i]) return;
      run.gold -= pieceCost; run.marketSold[i] = true; run.bag.push(p); sfx.coin(); this.showShop();
    }));
    const repairCost = this.price(5), removeCost = this.price(4), rerollCost = this.price(2);
    acts.repair = () => { if (run.gold < repairCost || run.coreHp >= run.coreMax) return; run.gold -= repairCost; run.coreHp = Math.min(run.coreMax, run.coreHp + 4); sfx.coin(); this.showShop(); };
    // the premium shelf: a unique block for big spenders
    const premCost = this.price(16 + 4 * run.act);
    acts.prem = () => {
      if (!run.premium || run.premiumSold || run.gold < premCost) return;
      run.gold -= premCost; run.premiumSold = true; run.bag.push(run.premium); sfx.unlock(); this.showShop();
    };
    acts.remove = () => { if (run.gold < removeCost || run.bag.length <= 4) return; this.showBag('remove', removeCost); };
    acts.reroll = () => { if (run.gold < rerollCost) return; run.gold -= rerollCost; run.shop = this.relicChoices(3); run.shopSold = run.shop.map(() => false); sfx.click(); this.showShop(); };
    const shop = run.shop.map((id, i) => {
      const pr = this.relicPrice(id);
      return detail(id, { act: `s${i}`, price: pr, taken: run.shopSold[i] ? 'Bought' : undefined, poor: !run.shopSold[i] && run.gold < pr });
    }).join('');
    const market = run.market.map((p, i) => plate(p, {
      act: `m${i}`, cost: pieceCost,
      taken: run.marketSold[i] ? 'Bought' : undefined, poor: !run.marketSold[i] && run.gold < pieceCost,
    })).join('');
    const order = (k: string, sub: string, cost: number, act: string, ok: boolean) =>
      `<div class="order"><span class="k">${k}<small>${sub}</small></span><span class="lead"></span>${tab(`Buy · ${cost} g`, act, { disabled: !ok })}</div>`;
    this.stopSheet('shop', `<div class="cols"><div>
        ${sec(1, 'Relics', 'special powers')}
        <div class="grid-row">${shop}</div>
        ${sec(2, 'Pieces')}
        <div class="grid-row">${market}</div>
        ${run.premium ? `${sec('★', 'Premium shelf', 'one of a kind')}<div class="grid-row">${plate(run.premium, { act: 'prem', cost: premCost, desc: MATS[run.premium.blocks[0].mat].desc, taken: run.premiumSold ? 'Bought' : undefined, poor: !run.premiumSold && run.gold < premCost })}</div>` : ''}
      </div>
      <aside class="side">
        ${sec('⚒', 'Services')}
        ${order('Repair core', '+4 HP', repairCost, 'repair', run.gold >= repairCost && run.coreHp < run.coreMax)}
        ${order('Remove a piece', 'from your bag', removeCost, 'remove', run.gold >= removeCost && run.bag.length > 4)}
        ${order('New relics', 'refresh the shop', rerollCost, 'reroll', run.gold >= rerollCost)}
      </aside></div>`, acts, 'Leave the shop');
  }

  private showCamp() {
    const run = this.run!;
    this.screen = () => this.showCamp();
    const damaged = [...run.board.blocks()].filter(b => b.b.hp < b.b.maxHp).length;
    const done = (msg: string) => { this.toast(msg); this.showMap(); };
    const acts: Record<string, () => void> = {
      rest: () => { if (run.coreHp >= run.coreMax) return; run.coreHp = Math.min(run.coreMax, run.coreHp + CAMP_HEAL); sfx.coin(); done(`Core healed +${CAMP_HEAL}.`); },
      mend: () => {
        if (!damaged) return;
        for (const { b } of run.board.blocks()) b.hp = b.maxHp;
        this.r.tintBlocks(run.board); sfx.place(); done(`${damaged} block${damaged > 1 ? 's' : ''} repaired.`);
      },
      pulse: () => { if (run.coreLevel >= 3) return; run.coreLevel++; sfx.unlock(); done(`Core pulse is now level ${run.coreLevel}.`); },
      gather: () => { run.gold += CAMP_GOLD; sfx.coin(); done(`+${CAMP_GOLD} gold.`); },
    };
    const anything = run.coreHp < run.coreMax || damaged > 0 || run.coreLevel < 3;
    this.stopSheet('camp', `<div class="contracts" style="margin-top:16px">
        ${this.option('✚', 'Rest', run.coreHp < run.coreMax ? `Heal the core +${CAMP_HEAL} HP (now ${Math.ceil(run.coreHp)}/${run.coreMax}).` : 'The core is already at full HP.', 'rest', run.coreHp < run.coreMax)}
        ${this.option('▤', 'Mend walls', damaged ? `Fully repair all ${damaged} damaged block${damaged > 1 ? 's' : ''}.` : 'Nothing is damaged.', 'mend', damaged > 0)}
        ${this.option('◎', `Core pulse ${Math.min(3, run.coreLevel + 1)}`, run.coreLevel < 3 ? 'The core’s shock wave hits harder and further, for the rest of the run.' : 'Already at the top level.', 'pulse', run.coreLevel < 3)}
        ${anything ? '' : this.option('◉', 'Gather', `Find +${CAMP_GOLD} gold.`, 'gather')}
      </div>`, acts, 'Skip');
  }

  private showForgeStop() {
    const run = this.run!;
    this.screen = () => this.showForgeStop();
    this.stopSheet('forge', `<div class="contracts" style="margin-top:16px">
        ${this.option('⚒', 'Forge a piece', 'Gild it (+50% HP for good) or turn its stone into a turret material.', 'forge')}
        ${this.option('✕', 'Throw a piece away', 'Remove one piece from your bag, so you draw your good ones more often.', 'remove', run.bag.length > 4)}
        ${this.option('♦', 'Temper a material', 'Make every crystal, ember or ward block stronger for the rest of the run.', 'temper')}
      </div>`, {
      forge: () => this.showBag('forge', 0),
      temper: () => this.showTemper(),
      remove: () => { if (run.bag.length > 4) this.showBag('remove', 0); },
    }, 'Skip');
  }

  private showTemper() {
    const run = this.run!;
    const t = (m: MatId) => run.temper[m] ?? 0;
    const pick = (m: MatId) => { run.temper[m] = t(m) + 1; sfx.unlock(); this.toast(`${MATS[m].name} tempered (level ${t(m)}).`); this.showMap(); };
    this.stopSheet('forge', `<div class="contracts" style="margin-top:16px">
        ${this.option('◇', `Crystal ${t('crystal') + 1}`, 'All crystal beams deal +15% damage.', 'tc')}
        ${this.option('△', `Ember ${t('ember') + 1}`, 'All ember shells deal +15% damage.', 'te')}
        ${this.option('○', `Ward ${t('ward') + 1}`, 'All ward fields reach +0.4 cells further.', 'tw')}
      </div>`, { tc: () => pick('crystal'), te: () => pick('ember'), tw: () => pick('ward') }, 'Back');
  }

  private showTreasure() {
    const run = this.run!;
    this.screen = () => this.showTreasure();
    const acts: Record<string, () => void> = {};
    run.treasure.forEach((id, i) => (acts[`t${i}`] = () => {
      run.treasure = [];
      this.addRelic(id); this.toast(`Got ${relicDef(id).name}.`); this.showMap();
    }));
    this.stopSheet('treasure', `<div class="grid-row" style="margin-top:16px">${run.treasure.map((id, i) => detail(id, { act: `t${i}` })).join('')}</div>`, acts, 'Skip');
  }

  private showUnique() {
    const run = this.run!;
    this.screen = () => this.showUnique();
    const acts: Record<string, () => void> = {};
    run.draft.forEach((p, i) => (acts[`d${i}`] = () => { run.draft = []; run.bag.push(p); sfx.place(); this.toast(`The ${p.name} joined your bag.`); this.showMap(); }));
    this.stopSheet('unique', run.draft.length
      ? `<div class="grid-row" style="margin-top:16px">${run.draft.map((p, i) => plate(p, { act: `d${i}`, desc: MATS[p.blocks[0].mat].desc })).join('')}</div>`
      : `<p class="note">You already own every unique block.</p>`, acts, 'Skip');
  }

  private showEvent() {
    const run = this.run!;
    this.screen = () => this.showEvent();
    const ev = EVENT_TEXT[run.event!];
    const acts: Record<string, () => void> = {
      ev_no: () => { run.eventDone = 'You walked on.'; sfx.click(); this.showEvent(); },
      ev_yes: () => {
        if (!run.event || run.eventDone) return;
        if (run.event === 'merchant') {
          const owned = new Set(run.bag.flatMap(p => p.blocks.map(b => b.mat)));
          const fresh = UNIQUES.filter(u => !owned.has(u));
          if (run.gold < 6 || !fresh.length) return;
          run.gold -= 6;
          const p = uniquePiece(fresh[Math.floor(Math.random() * fresh.length)]);
          run.bag.push(p);
          run.eventDone = `You bought the ${p.name}. It is in your bag.`;
        } else if (run.event === 'shrine') {
          const [id] = this.relicChoices(1);
          if (run.coreHp <= 3 || !id) return;
          run.coreHp -= 3;
          this.addRelic(id);
          run.eventDone = `The shrine gave you ${relicDef(id).name}: ${relicDef(id).desc}`;
        } else if (run.event === 'gambler') {
          if (run.gold < 5) return;
          run.gold -= 5;
          const win = Math.random() < 0.5;
          if (win) run.gold += 12;
          run.eventDone = win ? 'You won 12 gold!' : 'You lost the bet.';
        } else if (run.event === 'quarry') {
          run.bag.push(make('Pillar', 'rock'));
          run.eventDone = 'A Rock Pillar joined your bag.';
        }
        sfx.coin();
        this.showEvent();
      },
    };
    this.stopSheet('event', `<div class="event"><span class="ic">${ev.icon}</span><div><b>${ev.title}</b><p>${run.eventDone || ev.text}</p></div>${run.eventDone ? '' : `<div class="row">${tab('No thanks', 'ev_no')}${tab(ev.yes, 'ev_yes', { red: true })}</div>`}</div>`, acts, run.eventDone ? 'Back to the map' : 'Walk on');
  }

  private showBag(mode: 'view' | 'remove' | 'forge', cost = 0) {
    const run = this.run!;
    const back = () => (this.phase === 'dawn' ? this.screen() : this.overlay(''));
    const acts: Record<string, () => void> = { back };
    run.bag.forEach((p, i) => (acts[`b${i}`] = () => {
      if (mode === 'forge') return this.showForge(p, cost);
      if (mode !== 'remove' || run.gold < cost) return;
      run.gold -= cost;
      run.bag.splice(i, 1);
      run.draw = run.draw.filter(d => d !== p);
      sfx.crumble();
      this.toast(`${p.name} removed from your bag.`);
      // a paid removal keeps you in the shop; the free one at the forge is the whole stop
      if (cost) this.screen(); else this.showMap();
    }));
    const pickable = (p: Piece) => mode === 'remove' || (mode === 'forge' && !p.gilded && !p.blocks.some(b => MATS[b.mat].unique));
    const costText = cost ? ` (${cost} gold)` : '';
    this.overlay(sheet({
      kicker: '',
      title: mode === 'remove' ? 'Remove a piece' : mode === 'forge' ? 'Forge a piece' : 'Your bag',
      note: mode === 'remove' ? `Click a piece to remove it for good${costText}.`
        : mode === 'forge' ? `Pick a piece to improve${costText}. Unique blocks and gilded pieces can't be forged again.`
        : `You draw ${run.handSize} pieces each day. Used pieces go back into the bag.`,
      headRight: `<div class="bigstat"><span class="label">Pieces</span><b>${run.bag.length}</b></div>`,
      body: `<div class="grid-row" style="margin-top:16px">${run.bag.map((p, i) => plate(p, { act: pickable(p) ? `b${i}` : undefined, faded: mode === 'forge' && !pickable(p) })).join('')}</div>`,
      foot: `${tab('Back', 'back')}`,
    }), true, acts);
    flushDrawings($('overlay'));
  }

  /** Two ways to improve one piece: gild it (+50% HP) or transmute its stone into a turret material. */
  private showForge(p: Piece, cost: number) {
    const run = this.run!;
    const turrets = this.meta.matPool().filter(m => MATS[m].turret);
    const into = turrets[Math.floor(Math.random() * turrets.length)];
    const hasStone = p.blocks.some(b => b.mat === 'stone');
    const transmuted: Piece = hasStone
      ? { ...p, blocks: p.blocks.map(b => (b.mat === 'stone' ? { ...b, mat: into } : b)) }
      : { ...p, blocks: [...p.blocks, { ...p.blocks.reduce((a, b) => (b.z > a.z ? b : a)), z: Math.max(...p.blocks.map(b => b.z)) + 1, mat: 'stone' as MatId }] };
    const gilded: Piece = { ...p, gilded: true };
    const apply = (np: Piece, name: string) => {
      if (run.gold < cost) return;
      run.gold -= cost;
      Object.assign(p, np, { name });
      sfx.unlock();
      this.toast(`Forged: ${name}.`);
      this.showMap();
    };
    this.overlay(sheet({
      kicker: 'Forge',
      title: p.name,
      note: cost ? `Choose one. Costs ${cost} gold.` : 'Choose one.',
      body: `<div class="grid-row" style="margin-top:16px">
        ${plate(gilded, { act: 'gild', desc: 'Gild: every block of this piece gets +50% HP for good.' })}
        ${plate(transmuted, { act: 'trans', desc: hasStone ? `Transmute: its stone turns into ${MATS[into].name}.` : 'Extend: it grows one stone block taller.' })}
      </div>`,
      foot: tab('Back', 'back'),
    }), true, {
      back: () => this.showBag('forge', cost),
      gild: () => apply(gilded, `Gilded ${p.name}`),
      trans: () => apply(transmuted, hasStone ? p.name.replace(/Stone/g, MATS[into].name) : `Tall ${p.name}`),
    });
    flushDrawings($('overlay'));
  }

  // ======================= HUD =======================

  private renderHud() {
    this.renderTop();
    this.renderThreat();
    this.renderRelics();
    this.renderHand();
    this.renderActions();
    this.setHint();
  }

  private renderTop() {
    const run = this.run;
    if (!run) return;
    const st = run.board.stats();
    const phase = this.phase === 'night' ? 'Night' : this.phase === 'dawn' ? 'Dawn' : 'Day';
    const low = run.coreHp <= run.coreMax * 0.34;
    const ticks = Array.from({ length: run.coreMax }, (_, i) => `<i class="${i < Math.ceil(run.coreHp) ? '' : 'off'}"></i>`).join('');
    $('topbar').innerHTML = `
      <div class="cell phase ${this.phaseShown && this.phaseShown !== this.phase ? 'changed' : ''}"><span class="label">${this.biome.name} · ${run.day}/${NIGHTS}</span><span class="v">${phase}</span></div>
      <div class="cell ${low ? 'low' : ''}" data-tip="<b>Core HP</b><br>If it reaches 0, you lose."><span class="label">Core HP</span><span class="v"><span data-num="thp">${Math.ceil(run.coreHp)}</span><small>/${run.coreMax}</small></span><div class="hpbar">${ticks}</div></div>
      <div class="cell" data-tip="<b>Gold</b><br>Earned every morning, more with gardens on the ground."><span class="label">Gold</span><span class="v gold"><span data-num="tgold">${run.gold}</span></span></div>
      <div class="cell stat" data-tip="<b>Tallest tower</b><br>Height makes turrets shoot further, but attracts sappers."><span class="label">Tallest</span><span class="v"><span data-num="ttall">${st.tallest}</span></span></div>
      <div class="cell stat" data-tip="<b>Area</b><br>Ground you have built on. Width earns gold, but attracts brutes."><span class="label">Area</span><span class="v"><span data-num="tarea">${st.footprint}</span></span></div>`;
    this.animateNumbers($('topbar'));
    this.phaseShown = this.phase;
  }

  private renderThreat() {
    const run = this.run!;
    const counts = new Map<EnemyId, number>();
    for (const s of run.wave.spawns) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
    const st = run.board.stats();
    const counter = (t: EnemyId) => (st.tallest >= 6 && (t === 'sapper' || t === 'bomber') ? 'vs tall' : st.footprint >= 30 && (t === 'brute' || t === 'climber') ? 'vs wide' : '');
    const danger = (t: EnemyId) => (ENEMIES[t].minNight >= 99 ? 1e6 : 0) + ENEMIES[t].coreDmg * 100 + ENEMIES[t].hp;
    const roster = [...counts.entries()].sort((a, b) => danger(b[0]) - danger(a[0]));
    const el = $('threat');
    this.fade(el, this.phase !== 'dawn');
    // the panel gives a little jolt when it switches between "Tonight" and "Attack!"
    if (this.threatPhase && this.threatPhase !== this.phase) this.restart(el, 'changed', 400);
    this.threatPhase = this.phase;
    el.innerHTML = `
      <div class="hd"><span class="t">${this.phase === 'night' ? 'Attack!' : 'Tonight'}</span><span>${run.wave.guardian ? '<span class="tag">Boss</span>' : ''}</span></div>
      <div class="survey">
        ${compass(run.wave.sides)}
        <div class="roster">
          ${roster.map(([t, n]) => `<div class="r" data-tip="<b>${ENEMIES[t].name}</b><br>${ENEMIES[t].desc}">${enemyGlyph(t)}<span>${ENEMIES[t].name}${counter(t) ? ` <em class="ctr">${counter(t)}</em>` : ''}</span><span class="n">×${n}</span></div>`).join('')}
        </div>
      </div>
      ${run.wave.weather ? `<div class="weather" data-tip="<b>${WEATHER[run.wave.weather].name}</b><br>${WEATHER[run.wave.weather].desc}"><span class="ic">${WEATHER[run.wave.weather].icon}</span><span><b>${WEATHER[run.wave.weather].name}</b> ${WEATHER[run.wave.weather].desc}</span></div>` : ''}
      <div class="remain" id="remaining"></div>`;
  }

  /** Arrows on the screen edge for enemies the camera can't see. */
  private edgeMarks() {
    const n = this.night;
    const box = $('edgemarks');
    if (!n) return;
    const W = window.innerWidth, H = window.innerHeight, pad = 26;
    let k = 0;
    for (const e of n.enemies) {
      if (e.dead || e.hidden) continue;
      const p = this.r.project(e.view.root.position);
      if (p.x > 0 && p.x < W && p.y > 0 && p.y < H) continue;
      const cx = W / 2, cy = H / 2, a = Math.atan2(p.y - cy, p.x - cx);
      const t = Math.min((W / 2 - pad) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - pad) / Math.abs(Math.sin(a) || 1e-6));
      let m = box.children[k] as HTMLElement | undefined;
      if (!m) { m = document.createElement('i'); box.appendChild(m); }
      m.style.transform = `translate(${cx + Math.cos(a) * t}px, ${cy + Math.sin(a) * t}px) rotate(${a}rad)`;
      m.style.display = '';
      k++;
    }
    for (let i = k; i < box.children.length; i++) (box.children[i] as HTMLElement).style.display = 'none';
  }

  private clearEdgeMarks() { $('edgemarks').innerHTML = ''; }

  private updateNightHud() {
    const n = this.night;
    if (!n) return;
    this.edgeMarks();
    const el = document.getElementById('remaining');
    if (el) el.innerHTML = `<span class="label">Enemies left</span><b>${n.remaining}</b>`;
    const boss = n.bossRef;
    const bar = $('bossbar');
    if (boss && !boss.dead) {
      this.fade(bar, true);
      const t = bar.querySelector('.t')!;
      if (t.textContent !== boss.def.name) t.textContent = boss.def.name;
      bar.querySelector('.label')!.textContent = boss.hidden ? 'underground!' : 'Boss';
      (bar.querySelector('.fill') as HTMLElement).style.width = `${(boss.hp / boss.maxHp) * 100}%`;
    } else this.fade(bar, false);
  }

  private renderRelics() {
    const run = this.run!;
    const el = $('relics');
    el.innerHTML = run.relics.length ? `<span class="label">Relics ${run.relics.length}</span>${run.relics.map(id => callout(id)).join('')}` : '';
    el.onclick = () => this.showRelics();
    el.querySelectorAll<HTMLElement>('.callout').forEach((c, i) => { if (i >= this.relicsShown) { c.classList.add('fresh'); c.style.setProperty('--i', `${i - this.relicsShown}`); } });
    this.relicsShown = run.relics.length;
  }

  /** Every relic with its name and what it does (not during a night: the fight would keep running). */
  private showRelics() {
    const run = this.run;
    if (!run || !run.relics.length || this.phase === 'night') return;
    const back = this.phase === 'dawn' ? () => this.screen() : () => this.overlay('');
    this.overlay(sheet({
      kicker: '',
      title: 'Your relics',
      note: 'Relics are special powers that last for the rest of the run.',
      body: `<div class="grid-row" style="margin-top:16px">${run.relics.map(id => detail(id, {})).join('')}</div>`,
      foot: tab('Back', 'back'),
    }), true, { back });
  }

  /** What the bag holds, by material, for the bag button's tooltip. */
  private bagTip() {
    const counts = new Map<MatId, number>();
    for (const p of this.run!.bag) for (const b of p.blocks) counts.set(b.mat, (counts.get(b.mat) ?? 0) + 1);
    return `<b>Your bag</b><br>${[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `<span class='sw' style='background:#${MATS[m].color.toString(16).padStart(6, '0')}'></span>${MATS[m].name} ×${n}`).join('<br>')}`;
  }

  private renderHand() {
    const run = this.run!;
    const el = $('hand');
    this.fade(el, this.phase === 'day');
    el.innerHTML = run.hand.map((p, i) => plate({ ...p, blocks: rotatePiece(p.blocks, i === this.sel ? this.rot : 0) }, {
      no: `${i + 1}`, taken: i === run.keptIdx ? 'Kept' : undefined, extraCls: `${i === this.sel ? 'sel' : ''} ${run.used[i] ? 'used' : ''}`, attrs: `data-card="${i}"`,
    })).join('');
    flushDrawings(el);
    const cards = [...el.querySelectorAll<HTMLElement>('[data-card]')];
    const dealing = this.phase === 'day' && this.handShown !== this.handDeal;
    cards.forEach((c, i) => {
      if (dealing) { c.classList.add('deal'); c.style.setProperty('--i', `${i}`); }
      else if (run.used[i] && !this.handUsed[i]) c.classList.add('consumed');
      else if (i === this.sel && this.handSel !== i) c.classList.add('lift');
      else if (i === this.sel && this.handRot !== this.rot) c.querySelector('canvas')?.classList.add('spin');
      c.onclick = () => this.selectCard(i);
    });
    if (this.phase === 'day') this.handShown = this.handDeal;
    this.handUsed = [...run.used];
    this.handSel = this.sel;
    this.handRot = this.rot;
  }

  private renderActions() {
    const el = $('actions');
    const run = this.run!;
    if (this.actionsPhase && this.actionsPhase !== this.phase && el.children.length) this.ghostOut(el);
    if (this.phase === 'day') {
      const left = run.used.filter(u => !u).length;
      el.innerHTML = `${stamp('Start night', 'night', left ? `${left} piece${left > 1 ? 's' : ''} left` : 'ready!')}
        <div class="tabs">${tab('Rotate', 'rotate', { disabled: this.sel < 0, tip: 'Rotate the piece (R)' })}${tab('Undo', 'undo', { disabled: !run.undo.length, tip: 'Take back your last piece (Z)' })}${run.redraws > 0 ? tab(`Redraw ${run.redraws}`, 'redraw', { tip: 'Swap your unused pieces for new ones' }) : ''}${tab('Keep', 'keep', { disabled: this.sel < 0 || !!run.keep, tip: 'Save the selected piece for tomorrow (K)' })}${run.demolishes ? tab(`Demolish ${run.demolishes}`, 'demolish', { red: this.demolishing, tip: 'Remove one of your blocks (X)' }) : tab(`Demolish · ${DEMOLISH_COST}g`, 'paydemo', { disabled: run.gold < DEMOLISH_COST, tip: 'Pay for one more demolish today' })}${tab(`+ Piece · ${this.buyCost()}g`, 'buy', { disabled: run.gold < this.buyCost(), tip: 'Draw one more piece from your bag today. Costs more each time.' })}${tab(`Bag ${run.bag.length}`, 'bag', { tip: this.bagTip() })}</div>`;
    } else if (this.phase === 'night') {
      el.innerHTML = `<span class="left topples${run.topples ? '' : ' spent'}" data-tip="<b>Topples</b><br>Click a tower to knock it onto the enemies.">⤵ Topples <b>${run.topples}</b></span>
        <div class="tabs">${tab(this.paused ? 'Resume ▶' : 'Pause ❚❚', 'pause', { red: this.paused, tip: 'Pause the night (P). You can still look around.' })}${tab(`Rally${run.rallies ? ' ✓' : ''}`, 'rally', { disabled: run.rallies >= 1, tip: `Once a night: turrets fire twice as fast for ${RALLY_SECONDS} seconds (G)` })}${tab(`Shore up${run.shoreups ? ' ✓' : ''}`, 'shore', { disabled: run.shoreups >= 1, red: this.shoring, tip: 'Once a night: fully repair one tower and give it +50% HP (H)' })}${tab(`Drop stone · ${this.dropCost()}g`, 'drop', { disabled: run.gold < this.dropCost(), red: this.dropping, tip: 'Drop a stone block on the enemies (D). Each drop costs more.' })}${run.topples ? tab('Turn ↻', 'turn', { disabled: !this.ghostKey, tip: 'Change which way the tower falls (R)' }) : ''}${tab(this.showAllRanges ? 'Ranges ✓' : 'Ranges', 'ranges', { red: this.showAllRanges, tip: 'Show every turret range (V)' })}${tab(`Aim: ${AIMS[this.aim]}`, 'aim', { tip: 'What turrets shoot first: closest to the core, the strongest enemy, or fliers (A)' })}${tab(`Speed ${this.speed}×`, 'speed', { tip: 'Night speed (F)' })}</div>`;
    } else el.innerHTML = '';
    // the controls rise in when the phase changes, not on every refresh
    if (this.actionsPhase !== this.phase) this.actionsFresh = performance.now() + 450;
    el.classList.toggle('fresh', performance.now() < this.actionsFresh);
    this.actionsPhase = this.phase;
    el.querySelectorAll<HTMLElement>('[data-act]').forEach(b => (b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'night') this.beginNight();
      if (a === 'bag') this.showBag('view');
      if (a === 'rotate') this.rotate();
      if (a === 'undo') this.undoPlace();
      if (a === 'speed') this.toggleSpeed();
      if (a === 'redraw') this.redraw();
      if (a === 'turn') this.turnTopple();
      if (a === 'demolish') this.toggleDemolish();
      if (a === 'keep') this.keepPiece();
      if (a === 'drop') this.toggleDrop();
      if (a === 'pause') this.togglePause();
      if (a === 'ranges') this.toggleRanges();
      if (a === 'rally') this.rally();
      if (a === 'shore') this.toggleShore();
      if (a === 'buy') this.buyPiece();
      if (a === 'paydemo') this.payDemolish();
      if (a === 'aim') { const order: Aim[] = ['first', 'strong', 'air']; this.aim = order[(order.indexOf(this.aim) + 1) % 3]; sfx.click(); this.renderActions(); }
    }));
  }

  private redraw() {
    const run = this.run!;
    if (this.phase !== 'day' || run.redraws <= 0) return;
    const keep = run.hand.filter((_, i) => run.used[i]);
    const want = run.hand.length - keep.length;
    if (!want) return;
    run.redraws--;
    const fresh: Piece[] = [];
    for (let i = 0; i < want; i++) {
      if (!run.draw.length) run.draw = shuffle(run.bag.filter(p => !run.hand.includes(p) && !fresh.includes(p)));
      const p = run.draw.pop();
      if (p) fresh.push(p);
    }
    run.hand = [...keep, ...fresh];
    run.used = run.hand.map((_, i) => i < keep.length);
    this.handDeal++;
    this.sel = -1;
    sfx.rotate();
    this.renderHud();
    const next = run.used.findIndex(u => !u);
    if (next >= 0) this.selectCard(next);
  }

  /** Night: show (or hide) the range of every turret and ward. */
  private toggleRanges() {
    const run = this.run;
    if (!run || this.phase !== 'night') return;
    this.showAllRanges = !this.showAllRanges;
    sfx.click();
    this.r.setRanges(this.showAllRanges ? this.allRanges() : []);
    this.renderActions();
  }

  private allRanges() {
    const b = this.run!.board, out: { x: number; y: number; r: number; color: number }[] = [];
    for (const { x, y, z, b: blk } of b.blocks()) {
      if (!MATS[blk.mat].turret || !b.exposed.has(blk.id)) continue;
      out.push({ x, y, r: turretRange(blk.mat, z, this.has, rangeBonus(this.mods(), blk.mat)) + (isFoundation(b.blockAt(x, y, z - 1)?.mat) ? FOUNDATION_RANGE : 0), color: MATS[blk.mat].color });
    }
    return out;
  }

  private togglePause() {
    if (this.phase !== 'night') return;
    this.paused = !this.paused;
    document.body.classList.toggle('paused', this.paused);
    sfx.click();
    this.renderActions();
  }

  private toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    try { localStorage.setItem('spire-speed', `${this.speed}`); } catch { /* fine */ }
    sfx.click();
    this.renderActions();
  }

  private setHint(extra?: string) {
    let h = '';
    if (this.phase === 'day') {
      const touch = matchMedia('(pointer: coarse)').matches;
      h = this.sel >= 0
        ? (touch ? 'Tap to preview, tap again to place · ⟳ to rotate' : 'Click to place · R / right-click to rotate · Esc to cancel')
        : (touch ? 'Pick a piece from your hand' : 'Pick a piece, or hover a column to inspect it · Space to begin the night');
      if (this.demolishing) h = `${touch ? 'Tap a block twice' : 'Click a block'} to remove it. Blocks above it fall down.`;
    } else if (this.phase === 'night') {
      const touch = matchMedia('(pointer: coarse)').matches;
      h = this.run && this.run.topples > 0 && this.run.day <= 2 ? `${touch ? 'Tap' : 'Click'} a tower to aim a topple at the enemies` : '';
      if (this.nightTip) h = this.nightTip;
      if (this.dropping) h = `Pick a spot next to your fortress to drop a stone (${this.dropCost()} gold). It crushes whatever is under it.`;
    }
    if (extra) h = extra;
    if (h !== this.hint) {
      this.hint = h;
      const el = $('hint');
      if (!h) this.fade(el, false);
      else {
        const showing = !el.classList.contains('hidden') && !el.classList.contains('anim-out') && !!el.textContent;
        el.textContent = h;
        if (showing) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); } else this.fade(el, true);
      }
    }
    // keep the hint just above whatever the bottom bar currently holds
    $('hint').style.bottom = `${$('bottom').offsetHeight + 24}px`;
  }

  // ======================= placement =======================

  private selectCard(i: number) {
    const run = this.run;
    if (!run || this.phase !== 'day' || i >= run.hand.length || run.used[i]) return;
    sfx.click();
    this.sel = this.sel === i ? -1 : i;
    this.demolishing = false;
    this.rot = 0;
    this.renderHand();
    this.renderActions();
    this.updateGhost();
    this.showValid();
    this.setHint();
  }

  private currentPlacement(): Placement | null {
    const run = this.run;
    if (!run || this.sel < 0 || !this.lastPointer) return null;
    const cell = this.r.pick(this.lastPointer.x, this.lastPointer.y);
    if (!cell) return null;
    const blocks = rotatePiece(run.hand[this.sel].blocks, this.rot);
    const pv = pivotOf(blocks);
    return run.board.evaluate(blocks, cell.x - pv.x, cell.y - pv.y);
  }

  /** Where the selected piece (in its current rotation) can go: outlined on the board. */
  private showValid() {
    const run = this.run;
    if (!run || this.phase !== 'day' || this.sel < 0) return this.r.setValid([]);
    const blocks = rotatePiece(run.hand[this.sel].blocks, this.rot);
    const pv = pivotOf(blocks);
    const cells: { x: number; y: number; z: number }[] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const p = run.board.evaluate(blocks, x - pv.x, y - pv.y);
      if (p.ok) cells.push({ x, y, z: run.board.height(x, y) });
    }
    this.r.setValid(cells);
  }

  private updateGhost() {
    const run = this.run;
    if (!run || this.phase !== 'day') return;
    if (this.sel < 0) {
      this.r.clearGhost();
      this.inspect();
      return;
    }
    const p = this.currentPlacement();
    if (!p || !p.cells.length) { this.r.clearGhost(); this.r.setRanges([]); this.setHint(); return; }
    this.r.setGhost(p.cells, p.ok);
    const below = (c: { x: number; y: number; z: number }) => p.cells.find(o => o.x === c.x && o.y === c.y && o.z === c.z - 1)?.mat ?? run.board.blockAt(c.x, c.y, c.z - 1)?.mat;
    const rings = p.cells.filter(c => MATS[c.mat].turret).map(c => ({ x: c.x, y: c.y, r: turretRange(c.mat, c.z, this.has, rangeBonus(this.mods(), c.mat)) + (isFoundation(below(c)) ? FOUNDATION_RANGE : 0), color: MATS[c.mat].color }));
    this.r.setRanges(p.ok ? rings : []);
    this.setHint(p.ok ? undefined : `✕ ${p.reason}`);
  }

  private inspect() {
    const run = this.run!;
    if (!this.lastPointer) return;
    const cell = this.r.pick(this.lastPointer.x, this.lastPointer.y);
    if (!cell || !run.board.height(cell.x, cell.y)) { this.r.setRanges([]); this.setHint(); return; }
    const col = run.board.col(cell.x, cell.y);
    const rings: { x: number; y: number; r: number; color: number }[] = [];
    let note = '';
    col.forEach((b, z) => {
      if (!b || !MATS[b.mat].turret || !run.board.exposed.has(b.id)) return;
      const footing = isFoundation(run.board.blockAt(cell.x, cell.y, z - 1)?.mat);
      rings.push({ x: cell.x, y: cell.y, r: turretRange(b.mat, z, this.has, rangeBonus(this.mods(), b.mat)) + (footing ? FOUNDATION_RANGE : 0), color: MATS[b.mat].color });
      const n = stackBelow(run.board, cell.x, cell.y, z);
      const parts: string[] = [];
      if (footing) parts.push(`stands on ${MATS[run.board.blockAt(cell.x, cell.y, z - 1)!.mat].name.toLowerCase()}: +${FOUNDATION_RANGE} range`);
      if (n) parts.push(`${MATS[b.mat].name} tower: ${n + 1} stacked · ${b.mat === 'ward' ? `+${(0.3 * n).toFixed(1)} range` : `+${Math.round(STACK_BONUS * n * 100)}% damage`}`);
      const touching = new Set<MatId>();
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nb = run.board.blockAt(cell.x + dx, cell.y + dy, z + dz);
        if (nb) touching.add(nb.mat);
      }
      const rx = reactionOf(b.mat, touching);
      if (rx) parts.push(`✦ ${REACTIONS[rx].name}: ${REACTIONS[rx].desc}`);
      if (parts.length) note = parts.join(' · ');
    });
    this.r.setRanges(rings);
    this.setHint(note || undefined);
  }

  private tryPlace() {
    const run = this.run;
    if (!run || this.phase !== 'day' || this.sel < 0) return;
    const p = this.currentPlacement();
    if (!p || !p.ok) { sfx.invalid(); return; }
    const piece = run.hand[this.sel];
    run.undo.push({ cols: run.board.snapshot(), gold: run.gold, idx: this.sel });
    const made = run.board.place(p, (m, z) => this.hpMult(m, z) * (piece.gilded ? GILD_HP : 1));
    if (piece.gilded) for (const b of made) b.gilded = true;
    for (const c of p.cells) run.stats.placedMats.add(c.mat);
    if (this.has('masons_guild') && p.cells.every(c => c.z > 0)) { run.gold++; this.r.floatText(world(p.cells[0].x, p.cells[0].y, p.cells[0].z + 1.5), '+1', '#f7c948'); sfx.coin(); }
    if (this.has('frontier') && p.cells.every(c => c.z === 0)) { run.gold++; this.r.floatText(world(p.cells[0].x, p.cells[0].y, 1.5), '+1', '#f7c948'); sfx.coin(); }
    this.r.syncBoard(run.board);
    sfx.place();
    this.r.shakeCam(0.08);
    run.used[this.sel] = true;
    this.trackStats();
    this.checkCodex(false);
    const next = run.used.findIndex(u => !u);
    this.sel = -1;
    this.r.clearGhost();
    this.r.setRanges([]);
    this.r.setValid([]);
    this.renderHud();
    if (next >= 0) this.selectCard(next);
  }

  /** Take back the last placement made today. */
  private undoPlace() {
    const run = this.run;
    const u = run?.undo.pop();
    if (!run || !u || this.phase !== 'day') return;
    run.board.restore(u.cols);
    run.gold = u.gold;
    run.used[u.idx] = false;
    this.r.syncBoard(run.board);
    this.trackStats();
    sfx.rotate();
    this.renderHud();
    this.selectCard(u.idx);
  }

  private rotate() {
    if (this.phase !== 'day' || this.sel < 0) return;
    this.rot = (this.rot + 1) % 4;
    this.r.spinGhost();
    sfx.rotate();
    this.renderHand();
    this.updateGhost();
    this.showValid();
  }

  // ======================= input =======================

  private bindInput() {
    const cvs = this.r.renderer.domElement;
    cvs.addEventListener('contextmenu', e => e.preventDefault());
    cvs.addEventListener('pointerdown', e => { this.downAt = { x: e.clientX, y: e.clientY, b: e.button }; });
    cvs.addEventListener('pointermove', e => {
      this.lastPointer = { x: e.clientX, y: e.clientY };
      if (this.phase === 'day') { if (this.demolishing) this.updateDemolishGhost(); else this.updateGhost(); }
      if (this.phase === 'night') { if (this.shoring) { this.r.clearGhost(); return; } if (this.dropping) { const p = this.dropPlacement(); if (p?.cells.length) this.r.setGhost(p.cells, p.ok); else this.r.clearGhost(); } else this.updateToppleGhost(); }
    });
    cvs.addEventListener('pointerup', e => {
      const d = this.downAt;
      this.downAt = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      if (this.phase === 'night') {
        if (this.dropping) { if (d.b === 0) this.tryDrop(e.pointerType !== 'mouse'); else this.toggleDrop(); return; }
        if (this.shoring) { if (d.b === 0) this.tryShore(); else this.toggleShore(); return; }
        if (d.b === 2) return this.turnTopple();
        if (d.b !== 0) return;
        if (e.pointerType !== 'mouse') {
          const cell = this.r.pickBlock(e.clientX, e.clientY);
          const key = cell ? `${cell.x},${cell.y}` : '';
          if (key !== this.touchPreview) { this.touchPreview = key; this.updateToppleGhost(); return; }
        }
        this.touchPreview = '';
        return this.tryTopple();
      }
      if (this.phase === 'day' && this.demolishing) { if (d.b === 0) this.tryDemolish(e.pointerType !== 'mouse'); else this.toggleDemolish(); return; }
      if (d.b === 2) return this.rotate();
      if (d.b !== 0) return;
      this.updateGhost();
      if (e.pointerType !== 'mouse') {
        const cell = this.r.pick(e.clientX, e.clientY);
        const key = cell ? `${cell.x},${cell.y},${this.rot},${this.sel}` : '';
        if (key !== this.touchPreview) { this.touchPreview = key; this.setHint(this.sel >= 0 ? 'Tap again to place' : undefined); return; }
      }
      this.touchPreview = '';
      this.tryPlace();
    });
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'm') { setMuted(!isMuted()); this.toast(isMuted() ? 'Sound off.' : 'Sound on.'); }
      if (k === 'q') this.r.rotateView(-1);
      if (k === 'e') this.r.rotateView(1);
      if (this.phase === 'day' && !$('overlay').innerHTML) {
        if (k === 'r') this.rotate();
        if (k === 'x') this.toggleDemolish();
        if (k === 'k') this.keepPiece();
        if (k === 'z') this.undoPlace();
        if (k === 'escape') { this.demolishing = false; this.sel = -1; this.renderHand(); this.updateGhost(); this.showValid(); this.setHint(); }
        if (k >= '1' && k <= '5') this.selectCard(+k - 1);
        if (k === ' ' || k === 'enter') { e.preventDefault(); this.beginNight(); }
      } else if (this.phase === 'day' && k === 'escape') this.overlay('');
      if (this.phase === 'night' && k === 'f') this.toggleSpeed();
      if (this.phase === 'night' && k === 'r') this.turnTopple();
      if (this.phase === 'night' && k === 'd') this.toggleDrop();
      if (this.phase === 'night' && (k === 'p' || k === 'escape')) this.togglePause();
      if (this.phase === 'night' && k === 'g') this.rally();
      if (this.phase === 'night' && k === 'v') this.toggleRanges();
      if (this.phase === 'night' && k === 'h') this.toggleShore();
      if (this.phase === 'night' && k === 'a') $('actions').querySelector<HTMLElement>('[data-act=aim]')?.click();
    });
  }

  private bindTooltips() {
    const tip = $('tooltip');
    document.addEventListener('mouseover', e => {
      const t = (e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null;
      if (!t) { this.fade(tip, false); return; }
      tip.innerHTML = t.dataset.tip!;
      this.fade(tip, true);
      placeTip(e as MouseEvent);
    });
    const placeTip = (e: MouseEvent) => {
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let x = e.clientX + 16, y = e.clientY - h - 12;
      if (x + w > window.innerWidth - 8) x = e.clientX - w - 16;
      if (y < 8) y = e.clientY + 20;
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
    };
    document.addEventListener('mousemove', e => { if (!tip.classList.contains('hidden')) placeTip(e); });
  }

  // ======================= helpers =======================

  /** Phones and tablets play fullscreen, like an installed app. */
  private fullscreen() {
    if (!matchMedia('(pointer: coarse)').matches || document.fullscreenElement) return;
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
  }

  /** In-game yes/no dialog. */
  private ask(title: string, text: string, yes: string, onYes: () => void) {
    sfx.click();
    const el = $('modal');
    el.classList.remove('closing');
    el.innerHTML = `<div class="paper box"><h2>${title}</h2><p>${text}</p><div class="row">${tab('Cancel', 'no')}${tab(yes, 'yes', { red: true })}</div></div>`;
    el.onclick = e => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (!a && e.target !== el) return;
      el.classList.add('closing');
      el.onclick = null;
      setTimeout(() => { if (el.classList.contains('closing')) { el.innerHTML = ''; el.classList.remove('closing'); } }, 200);
      if (a === 'yes') onYes();
    };
  }

  /**
   * Show a sheet. A new screen slides in and deals its contents; re-rendering the same screen
   * (after buying something, say) stays put and only pops what changed.
   */
  private overlay(html: string, dim = false, acts: Record<string, () => void> = {}) {
    const el = $('overlay');
    if (html) this.dismissBanners();
    const old = el.querySelector<HTMLElement>('.sheet');
    const key = (h: ParentNode | null) => h?.querySelector('h1')?.textContent ?? '';
    const probe = document.createElement('div');
    probe.innerHTML = html;
    const same = !!html && !!old && key(old) === key(probe);
    const before = new Map<string, string>();
    if (same) el.querySelectorAll<HTMLElement>('[data-act]').forEach(n => before.set(n.dataset.act!, n.outerHTML));
    const scroll = el.scrollTop, sheetScroll = old?.scrollTop ?? 0;
    if (old && !same) this.sheetOut(old, el.classList.contains('dim') && !html);
    el.innerHTML = html;
    const sheetEl = el.querySelector<HTMLElement>('.sheet');
    if (sheetEl && same) {
      sheetEl.classList.add('static');
      el.scrollTop = scroll;
      sheetEl.scrollTop = sheetScroll;
      el.querySelectorAll<HTMLElement>('[data-act]').forEach(n => { const was = before.get(n.dataset.act!); if (was !== undefined && was !== n.outerHTML) n.classList.add('changed'); });
    } else if (sheetEl) {
      sheetEl.classList.add('enter');
      let i = 0;
      sheetEl.querySelectorAll<HTMLElement>('.plate, .detail, .contract, .up, .cx, .order, .ledger .ln, .brule, .manual .item, .toc button, .event, .mapinfo .pick, .bigstat').forEach(n => {
        n.classList.add('deal');
        n.style.setProperty('--i', `${Math.min(i++, 12)}`);
      });
    }
    if (html) this.animateNumbers(el);
    el.classList.toggle('dim', dim && !!html);
    document.body.classList.toggle('sheet-open', dim && !!html);
    const hud = $('hud'), away = dim && !!html;
    if (away !== hud.classList.contains('away')) {
      hud.classList.toggle('away', away);
      if (!away) this.restart(hud, 'back', 900);
    }
    this.fade($('tooltip'), false);
    el.onclick = e => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (t && acts[t.dataset.act!]) acts[t.dataset.act!]();
    };
  }

  /** Show or hide an element with its enter/leave animation instead of snapping. */
  private fade(el: HTMLElement, on: boolean) {
    const hidden = el.classList.contains('hidden'), leaving = el.classList.contains('anim-out');
    if (on) {
      if (!hidden && !leaving) return;
      clearTimeout(this.fades.get(el));
      el.classList.remove('hidden', 'anim-out');
      this.restart(el, 'anim-in', 600);
    } else {
      if (hidden || leaving) return;
      el.classList.remove('anim-in');
      el.classList.add('anim-out');
      this.fades.set(el, window.setTimeout(() => { el.classList.add('hidden'); el.classList.remove('anim-out'); }, 230));
    }
  }

  /** Re-trigger a CSS animation class (and drop it again once it has played). */
  private restart(el: HTMLElement, cls: string, ms: number) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  private showHud(on: boolean) {
    const hud = $('hud');
    if (on) { hud.classList.remove('hidden', 'leaving'); this.restart(hud, 'back', 900); return; }
    if (hud.classList.contains('hidden')) return;
    hud.classList.add('leaving');
    setTimeout(() => { if (hud.classList.contains('leaving')) { hud.classList.add('hidden'); hud.classList.remove('leaving'); } }, 260);
  }

  /** A copy of the element's current contents drops away while the real one gets new contents. */
  private ghostOut(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const c = el.cloneNode(true) as HTMLElement;
    c.classList.remove('fresh');
    c.classList.add('ghost-out');
    c.querySelectorAll('[data-act]').forEach(n => n.removeAttribute('data-act'));
    Object.assign(c.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', pointerEvents: 'none', zIndex: '5' });
    el.after(c);
    setTimeout(() => c.remove(), 260);
  }

  private dismissBanners() {
    document.querySelectorAll<HTMLElement>('.banner:not(.out)').forEach(b => { b.classList.add('out'); setTimeout(() => b.remove(), 220); });
  }

  /** The old sheet lifts off the table and fades while the new one comes in. */
  private sheetOut(old: HTMLElement, fadeDim: boolean) {
    const r = old.getBoundingClientRect();
    const wrap = document.createElement('div');
    wrap.className = 'sheet-out' + (fadeDim ? ' dim' : '');
    Object.assign(old.style, { position: 'absolute', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0' });
    old.classList.remove('enter', 'static');
    old.classList.add('leave');
    // a leaving copy is scenery: it must never answer clicks or selectors
    old.querySelectorAll('[data-act]').forEach(n => n.removeAttribute('data-act'));
    wrap.appendChild(old);
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 260);
  }

  /** Numbers that changed since they were last shown count up or down and give a little bump. */
  private animateNumbers(root: ParentNode) {
    root.querySelectorAll<HTMLElement>('[data-num]').forEach(el => {
      const k = el.dataset.num!, to = Number(el.textContent);
      const from = this.nums.get(k);
      this.nums.set(k, to);
      if (from === undefined || from === to || Number.isNaN(to)) return;
      el.classList.add(to > from ? 'bump-up' : 'bump-down');
      const t0 = performance.now(), dur = Math.min(650, 220 + Math.abs(to - from) * 35);
      el.textContent = `${from}`;
      const step = (now: number) => {
        if (!el.isConnected) return;
        const e = 1 - Math.pow(1 - Math.min(1, (now - t0) / dur), 3);
        el.textContent = `${Math.round(from + (to - from) * e)}`;
        if (e < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  private toast(msg: string, unlock = false) {
    const t = document.createElement('div');
    t.className = 'paper toast' + (unlock ? ' unlock' : '');
    t.innerHTML = `<span class="label">${unlock ? '★' : '▸'}</span>`;
    t.append(msg);
    $('toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, unlock ? 4500 : 2200);
  }

  private banner(kicker: string, title: string, sub = '') {
    this.dismissBanners();
    const b = document.createElement('div');
    b.className = 'banner';
    b.innerHTML = `<div class="k">${kicker}</div><div class="t">${title}</div>${sub ? `<div class="dimline">${sub}</div>` : ''}`;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 2300);
  }
}
