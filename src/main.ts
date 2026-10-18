import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/rubik/latin-400';
import '@fontsource/rubik/latin-600';
import '@fontsource/rubik/latin-400-italic';
import './style.css';
import { Game } from './game';
import { PERF } from './settings';

// Behave like an app, not a page: no context menus, selection, drag ghosts, pinch or ctrl-wheel zoom.
for (const ev of ['contextmenu', 'selectstart', 'dragstart', 'gesturestart']) {
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
}
window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0', 's', 'p', 'f'].includes(e.key.toLowerCase())) e.preventDefault();
});
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

const game = new Game();
if (import.meta.env.DEV || location.search.includes('debug')) (window as unknown as { game: Game }).game = game;

// hold the splash until the fonts are in, so nothing ever renders in a fallback font
const splash = document.getElementById('splash')!;
Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]).then(() => {
  splash.classList.add('out');
  setTimeout(() => splash.remove(), 600);
});

// performance mode shows a small badge so nobody mistakes it for the real look
if (PERF) {
  const b = document.createElement('div');
  b.id = 'perfbadge';
  b.textContent = 'Performance mode';
  document.body.appendChild(b);
}
