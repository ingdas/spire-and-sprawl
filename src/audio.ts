// Tiny WebAudio synth; every sound is generated, no asset files.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const last = new Map<string, number>();

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) { muted = m; }
export function isMuted() { return muted; }

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, cutoff: number) {
  const c = ac();
  if (!c || !master || muted) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

function throttle(key: string, ms: number) {
  const now = performance.now();
  if ((last.get(key) ?? 0) + ms > now) return false;
  last.set(key, now);
  return true;
}

export const sfx = {
  click: () => tone(660, 0.06, 'triangle', 0.25),
  rotate: () => tone(520, 0.05, 'triangle', 0.2, 700),
  place: () => { tone(140, 0.18, 'triangle', 0.5, 60); noise(0.08, 0.2, 900); },
  invalid: () => tone(180, 0.12, 'square', 0.12, 120),
  beam: () => throttle('beam', 60) && tone(1200 + Math.random() * 300, 0.07, 'sine', 0.08, 1800),
  shell: () => throttle('shell', 90) && tone(300, 0.12, 'triangle', 0.15, 160),
  boom: () => throttle('boom', 80) && noise(0.25, 0.35, 700),
  kill: () => throttle('kill', 40) && tone(420 + Math.random() * 120, 0.1, 'square', 0.08, 140),
  chew: () => throttle('chew', 180) && noise(0.05, 0.08, 2500),
  crumble: () => throttle('crumble', 70) && noise(0.2, 0.3, 500),
  coreHit: () => { tone(110, 0.35, 'sawtooth', 0.25, 55); noise(0.2, 0.2, 400); },
  zap: () => { noise(0.15, 0.25, 6000); tone(1800, 0.12, 'sawtooth', 0.08, 300); },
  coin: () => throttle('coin', 50) && (tone(988, 0.06, 'square', 0.08), tone(1319, 0.12, 'square', 0.08, undefined, 0.06)),
  nightStart: () => { tone(220, 0.6, 'sine', 0.2, 110); tone(330, 0.6, 'sine', 0.12, 165, 0.1); },
  dawn: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, undefined, i * 0.09)); },
  unlock: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.35, 'square', 0.08, undefined, i * 0.08)); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, 'triangle', 0.2, undefined, i * 0.18)); },
};
