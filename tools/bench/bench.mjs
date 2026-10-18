// Balance bench: plays many full runs with a heuristic bot, fast.
//
//   npm run bench -- tools/bench/experiments/smoke.json
//
// Speed comes from four things:
//  - nights are simulated synchronously inside the page (fixed 1/30 s steps, no waiting for frames);
//  - game timers (dawn beats, flights, sheet transitions) run on a virtual clock: no real waiting;
//  - nothing is rendered: the frame loop is switched off (?perf also skips effects);
//  - runs are spread over several browsers in parallel (with GPU compositing off, see the launch flags).
// The game dice (src/rng.ts) are seeded per run, so a seed replays exactly and two variants
// with the same seed face the same dice,
// and TUNE overrides are applied per job, so trying a tweak needs no rebuild.
//
// The experiment file lists variants (TUNE overrides) and the grid to run; see tools/bench/README.md.
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initScript, playRun } from './bot.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const expPath = process.argv[2];
if (!expPath) { console.error('usage: node tools/bench/bench.mjs <experiment.json> [--no-build]'); process.exit(1); }
const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
const name = exp.name ?? path.basename(expPath, '.json');
const outDir = path.join(root, 'tools/bench/results');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${name}.jsonl`);

// ---------- build once into a private folder, so editing the source mid-run can't change results ----------
const dist = path.join(os.tmpdir(), `bench-dist-${process.pid}`);
if (!process.argv.includes('--no-build')) {
  execSync(`npx vite build --outDir "${dist}" --emptyOutDir --logLevel error`, { cwd: root, stdio: 'inherit' });
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = path.join(dist, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, r));
const url = `http://localhost:${server.address().port}/?debug&perf&bench`;

// ---------- the job grid ----------
const variants = exp.variants ?? { base: {} };
const jobs = [];
for (const [variant, tune] of Object.entries(variants))
  for (const meta of exp.metas ?? ['none'])
    for (const heat of exp.heats ?? [0])
      for (const style of exp.styles ?? ['balanced', 'tall', 'wide'])
        for (let i = 0; i < (exp.runs ?? 6); i++)
          jobs.push({ variant, tune, meta, heat, style, founder: exp.founder ?? 'settler', seed: (exp.seed ?? 1) * 1000 + i });
const workers = Math.min(exp.workers ?? Math.max(1, Math.floor(os.cpus().length / 2)), jobs.length);
console.log(`${name}: ${jobs.length} runs on ${workers} workers`);

// ---------- workers ----------
const out = fs.createWriteStream(outFile);
let next = 0, done = 0;
const t0 = Date.now();
const errors = [];
const timing = { load: 0, play: 0 };
const worker = async () => {
  // Software GL for three.js, but no GPU compositing or GPU 2D canvas: with those on, every drawing call
  // went through a GPU process that all the browsers fought over, and the bench ran 5x slower with an idle CPU.
  const browser = await chromium.launch({
    executablePath: exp.chrome ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-compositing', '--disable-accelerated-2d-canvas', ...(exp.args ?? [])],
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => errors.push(String(e.stack ?? e).slice(0, 400)));
  await page.addInitScript(`(${initScript})();`);
  await page.goto(url);
  await page.waitForFunction(() => window.game);
  // every run gets a freshly loaded page: nothing a previous run left behind can leak into it,
  // so a seed always replays the same run, whichever worker plays it and in whatever order
  let first = true;
  while (next < jobs.length) {
    const job = jobs[next++];
    const tl = Date.now();
    if (!first) { await page.reload(); await page.waitForFunction(() => window.game); }
    first = false;
    const tp = Date.now();
    let res;
    try { res = await page.evaluate(`(${playRun})(${JSON.stringify(job)})`); }
    catch (e) { res = { error: String(e).slice(0, 300) }; }
    timing.load += tp - tl;
    timing.play += Date.now() - tp;
    const { tune, ...rest } = job;
    out.write(JSON.stringify({ ...rest, ...res }) + '\n');
    done++;
    if (done % 10 === 0 || done === jobs.length) process.stdout.write(`\r${done}/${jobs.length} runs, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  await browser.close();
};
await Promise.all(Array.from({ length: workers }, worker));
out.end();
server.close();
fs.rmSync(dist, { recursive: true, force: true });
console.log(`\nper run and worker: page load ${(timing.load / jobs.length / 1000).toFixed(2)} s, play ${(timing.play / jobs.length / 1000).toFixed(2)} s`);
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s total, ${((Date.now() - t0) / 1000 / jobs.length).toFixed(1)} s per run`);
if (errors.length) console.log(`page errors (${errors.length}):\n` + [...new Set(errors)].slice(0, 5).join('\n'));
execSync(`node "${path.join(root, 'tools/bench/summary.mjs')}" "${outFile}"`, { stdio: 'inherit' });
