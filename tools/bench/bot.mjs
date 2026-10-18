// The bench's in-page code. Both functions are serialised and run inside the game page,
// so they can only use what the page has (window.game, the DOM), not Node imports.
//
// initScript runs before the game loads (virtual clock, no frames).
// playRun plays one whole run and returns a result row. Edit the policies here to change how the bot plays.

export const initScript = () => {
  // a virtual clock: timers only fire when the bot calls __flush(), in due order.
  // No real waiting, and no races between game timers and bot steps, so a seed always replays the same run.
  const q = [];
  let now = 0, nextId = 1;
  window.setTimeout = (f, ms = 0, ...a) => { q.push({ id: nextId, at: now + (+ms || 0), f, a }); return nextId++; };
  window.clearTimeout = id => { const i = q.findIndex(t => t.id === id); if (i >= 0) q.splice(i, 1); };
  window.__flush = (limit = 1000) => {
    for (let k = 0; k < limit && q.length; k++) {
      q.sort((x, y) => x.at - y.at || x.id - y.id);
      const t = q.shift();
      now = t.at;
      if (typeof t.f === 'function') t.f(...t.a);
    }
  };
  // no frames either: nothing is drawn, and the bench steps nights itself
  window.requestAnimationFrame = () => 0;
  // saves stay in memory: the game saves at almost every step, and many browsers writing to disk at once
  // made the bench crawl while the CPU sat idle
  const mem = new Map();
  Storage.prototype.getItem = function (k) { return mem.has(k) ? mem.get(k) : null; };
  Storage.prototype.setItem = function (k, v) { mem.set(k, String(v)); };
  Storage.prototype.removeItem = function (k) { mem.delete(k); };
};

// One whole run inside the page. Returns a result row.
export const playRun = async job => {
  const g = window.game;
  // let pending timers (and then promise callbacks) run
  const settle = async () => { window.__flush(); await null; };
  window.__tuneDefault ??= JSON.parse(JSON.stringify(g.tune));
  // reset knobs, then apply this variant
  const def = JSON.parse(JSON.stringify(window.__tuneDefault));
  for (const k of Object.keys(g.tune)) g.tune[k] = def[k];
  for (const [k, v] of Object.entries(job.tune)) {
    if (v && typeof v === 'object' && g.tune[k] && typeof g.tune[k] === 'object') Object.assign(g.tune[k], v); else g.tune[k] = v;
  }
  // the game rolls its own seeded dice (src/rng.ts); the bot's tie-breaks get their own
  let bs = job.seed >>> 0 || 1;
  const botRand = () => { bs = (bs + 0x6d2b79f5) | 0; let t = Math.imul(bs ^ (bs >>> 15), 1 | bs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const reseed = n => { g.seedRandom(n); bs = n >>> 0 || 1; };
  reseed(job.seed);
  const style = job.style;
  const m = g.meta; m.reset(); m.runs = 5; m.heatWon = 9; m.heat = job.heat;
  if (job.meta === 'mid') m.ranks = { foundations: 2, treasury: 2, lens: 1, kiln: 1, leverage: 1, draughtsman: 1, masonry: 1 };
  if (job.meta === 'high') m.ranks = { foundations: 4, treasury: 3, tithe: 2, lens: 2, kiln: 2, leverage: 2, draughtsman: 2, masonry: 2, eye: 1 };
  const acts = id => document.querySelector(`[data-act=${id}]`);

  const placeAll = () => {
    const run = g.run, board = run.board;
    const rot = (bl, t) => {
      let o = bl.map(b => ({ ...b }));
      for (let i = 0; i < t; i++) o = o.map(b => ({ ...b, x: -b.y, y: b.x }));
      const mx = Math.min(...o.map(b => b.x)), my = Math.min(...o.map(b => b.y));
      return o.map(b => ({ ...b, x: b.x - mx, y: b.y - my }));
    };
    const turret = { crystal: 1, ember: 1, ward: 1, arc: 1 };
    for (let i = 0; i < run.hand.length; i++) {
      if (run.used[i]) continue;
      let best = null, bs = -Infinity;
      for (let r = 0; r < 4; r++) {
        const bl = rot(run.hand[i].blocks, r);
        for (let ay = -3; ay < 15; ay++) for (let ax = -3; ax < 15; ax++) {
          const pl = board.evaluate(bl, ax, ay);
          if (!pl.ok) continue;
          let s = botRand() * 0.5;
          for (const c of pl.cells) {
            const d = Math.max(Math.abs(c.x - 6), Math.abs(c.y - 6));
            // arcs want to sit low and near the walls; other turrets want height
            if (c.mat === 'arc') s += (c.z <= 1 ? 3 : 0) + (d >= 2 && d <= 4 ? 2 : 0);
            else if (turret[c.mat]) s += c.z * (style === 'wide' ? 0.3 : style === 'tall' ? 2.5 : 1.5) + (d <= 3 ? 3 : 0) - d * 0.5;
            else if (c.mat === 'garden') s += (c.z === 0 ? 3 : -2) + (d >= 2 && d <= 4 ? 1 : 0);
            else if (c.mat === 'beacon') s += 1;
            else s += (d === 2 || d === 3 ? 2 : 0) + (style === 'tall' ? (d <= 2 ? 2 : -1) : c.z <= 1 ? 1 : -1);
            if (style === 'wide' && c.z > 1) s -= 6;
          }
          if (s > bs) { bs = s; best = pl; }
        }
      }
      if (best) { g.currentPlacement = () => best; g.sel = i; g.tryPlace(); }
    }
    delete g.currentPlacement;
  };

  const dawn = () => {
    const run = g.run;
    const turretCount = p => p.blocks.filter(b => b.mat !== 'stone' && b.mat !== 'garden').length + p.blocks.length * 0.3;
    const stopPri = { treasure: 9, shop: run.gold >= 12 ? 8 : 1, camp: run.coreHp <= run.coreMax - 5 ? 10 : 3, unique: 6, forge: 4, event: 2 };
    const fightPri = { standard: 5, calm: 4, bounty: 3, siege: 2, skyward: 3 };
    for (let guard = 0; guard < 30 && g.phase !== 'day' && g.phase !== 'end'; guard++) {
      const title = document.querySelector('#overlay .sheet h1')?.textContent;
      if (!title) return;
      if (acts('land')) { acts('land').click(); continue; }
      if (title === 'Morning') {
        let bi = 0;
        run.draft.forEach((p, i) => { if (turretCount(p) > turretCount(run.draft[bi])) bi = i; });
        acts(`d${bi}`)?.click(); acts('t0')?.click(); acts('go')?.click(); continue;
      }
      if (title === 'Map') {
        const mp = run.map;
        const next = mp.at === null ? mp.nodes.filter(n => n.row === 0) : mp.nodes[mp.at].next.map(id => mp.nodes[id]);
        const score = n => n.kind === 'battle' ? fightPri[n.contract] : n.kind === 'guardian' ? 0 : stopPri[n.kind];
        g.enterNode(next.reduce((a, b) => (score(b) > score(a) ? b : a)), true); continue;
      }
      if (title === 'Shop') {
        if (run.coreHp <= run.coreMax - 5) acts('repair')?.click();
        for (const a of ['s0', 's1', 's2', 'm0', 'm1']) acts(a)?.click();
      }
      if (title === 'Camp') { for (const a of ['rest', 'mend', 'pulse']) { const el = acts(a); if (el && !el.disabled && (a !== 'rest' || run.coreHp <= run.coreMax - 4)) { el.click(); break; } } }
      if (title === 'Treasure') { acts('t0')?.click(); continue; }
      if (title === 'Rare block') { if (acts('d0')) { acts('d0').click(); continue; } }
      if (title === 'Forge') { acts('forge')?.click(); const pl = document.querySelector('.plate[data-act]'); if (pl) { pl.click(); acts('gild')?.click(); continue; } }
      acts('leave')?.click();
      acts('back')?.click();
    }
  };

  // what a decent player does at night: rally into a crowd, shore up the weakest block, topple onto 2+ enemies
  const nightPolicy = () => {
    const n = g.night, b = g.run.board;
    const alive = n.enemies.filter(e => !e.dead).length;
    if (alive >= 8 && g.run.rallies < 1) g.rally();
    if (g.run.shoreups < 1) {
      let worst = null, wf = 0.5;
      for (const { x, y, b: k } of b.blocks()) { const f = k.hp / k.maxHp; if (f < wf) { wf = f; worst = { x, y }; } }
      if (worst) { n.shoreUp(worst.x, worst.y); g.run.shoreups++; }
    }
    if (g.run.topples > 0) {
      for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
        if (!b.canTopple(x, y)) continue;
        for (let d = 0; d < 4; d++) if (g.run.topples > 0 && n.enemiesOn(b.toppleCells(x, y, d)) >= 2) { g.run.topples--; n.topple(x, y, d); }
      }
    }
  };

  const waitFor = async cond => { for (let k = 0; k < 200 && !cond(); k++) await settle(); };
  const ms = { place: 0, night: 0, dawn: 0 };
  const timed = (k, f) => { const t = performance.now(); const r = f(); ms[k] += performance.now() - t; return r; };
  g.startRun(job.founder);
  const nights = [];
  for (let k = 0; k < 40 && g.phase !== 'day'; k++) { dawn(); await settle(); }
  for (let night = 1; night <= 12 && g.phase !== 'end'; night++) {
    await waitFor(() => g.phase === 'day');
    // reseed every day and night: the frame loop also rolls dice while we wait, so without this
    // two runs on the same seed would drift apart after the first dawn
    reseed(job.seed * 7919 + night * 104729);
    while (g.run.gold > 30 && g.run.gold >= g.buyCost() && g.run.buys < 2) g.buyPiece();
    timed('place', placeAll);
    reseed(job.seed * 7919 + night * 104729 + 1);
    g.beginNight();
    timed('night', () => {
      for (let step = 0; g.phase === 'night' && step < 30 * 400; step++) {
        g.night.update(1 / 30);
        if (step % 6 === 0 && g.phase === 'night') nightPolicy();
        if (g.phase === 'night' && g.night.done) { g.endNight(); break; }
      }
    });
    const run = g.run, st = run.board.stats();
    nights.push({ n: night, core: Math.ceil(run.coreHp), gold: run.gold, tall: st.tallest, foot: st.footprint, hurt: run.hurtByNight[night] ?? 0});
    if (g.phase === 'end') break;
    // dawn: reward, map stops, until the next day starts
    const td = performance.now();
    for (let k = 0; k < 400 && g.phase !== 'day' && g.phase !== 'end'; k++) { await settle(); dawn(); }
    ms.dawn += performance.now() - td;
  }
  const run = g.run ?? {};
  const won = g.phase === 'end' && nights.length === 12 && nights[11].core > 0;
  for (const k in ms) ms[k] = Math.round(ms[k]);
  const dmg = Object.fromEntries(Object.entries(run.stats?.dmgBy ?? {}).map(([k, v]) => [k, Math.round(v)]));
  return { night: nights.length, won, nights, hurt: run.hurt ?? {}, dmg, relics: run.relics ?? [], ms };
};
