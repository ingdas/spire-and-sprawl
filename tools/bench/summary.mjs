// Summarise a bench results file: average night reached, win rate, worst nights, and (with
// several variants) the paired difference against the first variant on the same seeds.
//
//   node tools/bench/summary.mjs tools/bench/results/<name>.jsonl
import fs from 'fs';

const file = process.argv[2];
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const bad = rows.filter(r => r.error);
const ok = rows.filter(r => !r.error);
if (bad.length) console.log(`${bad.length} runs failed, e.g. ${bad[0].error}`);

const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const se = a => a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1) / a.length) : 0;
const group = (list, key) => { const m = new Map(); for (const r of list) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
const pad = (s, n) => String(s).padEnd(n);
const fmt = rs => {
  const n = rs.map(r => r.night);
  const worst = {};
  for (const r of rs) for (const x of r.nights) worst[x.n] = (worst[x.n] ?? 0) + x.hurt;
  const top = Object.entries(worst).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `n${k}:${(v / rs.length).toFixed(1)}`).join(' ');
  return `${mean(n).toFixed(2).padStart(5)} ±${se(n).toFixed(2)}  wins ${String(rs.filter(r => r.won).length).padStart(2)}/${String(rs.length).padEnd(3)} (${Math.round(100 * mean(rs.map(r => +r.won))).toString().padStart(3)}%)  core lost/run ${top}`;
};

// share of all damage dealt, by source (turret material, topple, unique, core)
const share = (rs, top = 99) => {
  const tot = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.dmg ?? {})) tot[k] = (tot[k] ?? 0) + v;
  const sum = Object.values(tot).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => `${k} ${Math.round(100 * v / sum)}%`).join(', ');
};

console.log(`\n${pad('variant', 14)}${pad('meta', 6)}${pad('heat', 5)}${pad('style', 10)} avg night        wins`);
for (const [k, rs] of group(ok, r => `${r.variant}|${r.meta}|${r.heat}`)) {
  const [variant, meta, heat] = k.split('|');
  for (const [style, ss] of group(rs, r => r.style)) console.log(`${pad(variant, 14)}${pad(meta, 6)}${pad(heat, 5)}${pad(style, 10)}${fmt(ss)}  | ${share(ss, 4)}`);
  console.log(`${pad(variant, 14)}${pad(meta, 6)}${pad(heat, 5)}${pad('ALL', 10)}${fmt(rs)}`);
  console.log(`${' '.repeat(25)}damage dealt: ${share(rs)}\n`);
}

// paired comparison: same seed/style/meta/heat, different variant
const variants = [...new Set(ok.map(r => r.variant))];
if (variants.length > 1) {
  const base = variants[0];
  const key = r => `${r.meta}|${r.heat}|${r.style}|${r.seed}`;
  const baseBy = new Map(ok.filter(r => r.variant === base).map(r => [key(r), r]));
  console.log(`paired vs "${base}" (same seeds):`);
  for (const v of variants.slice(1)) {
    for (const [mh, rs] of group(ok.filter(r => r.variant === v), r => `${r.meta} heat ${r.heat}`)) {
      const d = rs.map(r => baseBy.get(key(r))).map((b, i) => b ? rs[i].night - b.night : null).filter(x => x !== null);
      const w = rs.map(r => baseBy.get(key(r))).map((b, i) => b ? +rs[i].won - +b.won : null).filter(x => x !== null);
      console.log(`  ${pad(v, 14)}${pad(mh, 14)} night ${mean(d) >= 0 ? '+' : ''}${mean(d).toFixed(2)} ±${se(d).toFixed(2)}   win rate ${mean(w) >= 0 ? '+' : ''}${Math.round(100 * mean(w))}%  (${d.length} pairs)`);
    }
  }
}
