/// <reference types="vite/client" />
// The feed card: floor number, Descend, played state. No Phaser and no sim: one request, a few DOM writes (§15.3).
import { context, navigateTo, requestExpandedMode, showLoginPrompt } from '@devvit/web/client';
import { CURSE_TEXT, PALETTE, PRIVACY } from '../shared/content';
import type { Floor } from '../shared/sim';
import { miniMap } from './minimap';
import { api, report } from './net';

const $ = (id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`splash.html is missing #${id}`);
  return node;
};
const floor = $('floor');
const line = $('line');
const go = $('go');
const view = $('view');
if (!(go instanceof HTMLButtonElement)) throw new Error('#go must be a button');

// The post knows its floor, so the number shows before any request returns.
const depth = context?.postData?.depth;
if (typeof depth === 'number') floor.textContent = `Floor ${depth}`;

const expand = (e: MouseEvent) => (import.meta.env.DEV ? location.assign(`game.html${location.search}`) : requestExpandedMode(e, 'game'));
// Phase 11b: on a sign of intent to descend (a hover, focus or press on the button, never a mere feed impression), warm the
// game's largest files into the HTTP cache the game shares with this card, so its load starts ahead. Names match the build
// (vite.config.ts names phaser-core.js and scene.js too).
const WARM = ['game.html', 'game.js', 'phaser-core.js', 'scene.js', 'sprites.js', 'atlas.png'];
let warmed = false;
const warm = () => {
  if (warmed || import.meta.env.DEV) return;
  warmed = true;
  for (const href of WARM) {
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = href;
    document.head.append(l);
  }
};
for (const ev of ['pointerenter', 'pointerdown', 'focus'] as const) go.addEventListener(ev, warm, { passive: true });
// Phase 10b (A59): the funnel's first two steps. The server counts each once per player per floor.
const step = (s: 'splash' | 'descend', d: number) => report({ kind: 'step', depth: d, step: s });
// The privacy text opens in the card itself (A56): nobody is sent away from the feed to read it.
const card = $('card');
$('privacy').addEventListener('click', () => {
  const back = document.createElement('button');
  back.className = 'btn btn--primary';
  back.textContent = 'Back';
  const panel = document.createElement('div');
  panel.className = 'splash__text';
  for (const b of PRIVACY.blocks) {
    const n = document.createElement('h' in b ? 'h2' : 'p');
    n.textContent = 'h' in b ? b.h : 'p' in b ? b.p : `${b.li[0]}: ${b.li[1]}`;
    panel.append(n);
  }
  panel.append(back);
  const was = [...card.children];
  card.replaceChildren(panel);
  back.addEventListener('click', () => card.replaceChildren(...was));
  back.focus();
});
let onGo: (e: MouseEvent) => void = expand;
go.addEventListener('click', (e) => onGo(e));

const set = (floorText: string | null, text: string, label: string, act: (e: MouseEvent) => void = expand) => {
  if (floorText) floor.textContent = floorText;
  line.textContent = text;
  go.textContent = label;
  go.disabled = false;
  onGo = act;
};

/**
 * Today's floor in miniature with its wisps, and a 3-second loop over it: a delver falls (ember), a wisp rises where it
 * fell, and tomorrow's trap appears (blood). Reduced motion keeps the still map.
 */
function render(f: Floor, tiles: readonly (readonly [number, number, number])[]) {
  const map = miniMap(f.rows, tiles.map(([x, y]) => ({ x, y })), 4);
  view.replaceChildren(map);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = map.getContext('2d');
  const floorTiles = f.rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === '.' ? [{ x, y }] : [])));
  const base = ctx?.getImageData(0, 0, map.width, map.height);
  if (!ctx || !base || !floorTiles.length) return;
  let step = 0;
  let at = floorTiles[0] ?? { x: 0, y: 0 };
  let trap = at;
  setInterval(() => {
    if (step === 0) {
      at = floorTiles[(Date.now() >> 10) % floorTiles.length] ?? at;
      trap = floorTiles[((Date.now() >> 10) * 7) % floorTiles.length] ?? trap;
    }
    ctx.putImageData(base, 0, 0);
    const dot = (p: { x: number; y: number }, colour: string) => {
      ctx.fillStyle = colour;
      ctx.fillRect(p.x * 4, p.y * 4, 4, 4);
    };
    if (step === 0) dot(at, PALETTE.ember);
    if (step === 1) dot({ x: at.x, y: Math.max(0, at.y - 1) }, PALETTE.wisp);
    if (step === 2) {
      dot(at, PALETTE.wisp);
      dot(trap, PALETTE.blood);
    }
    step = (step + 1) % 3;
  }, 1000);
}

void api.floor().then(
  (r) => {
    if (r.kind === 'play' || r.kind === 'played') render(r.floor, r.ghosts.tiles);
    const curse = (r.kind === 'play' || r.kind === 'played') && r.floor.curses?.[0];
    if (curse) floor.dataset.curse = CURSE_TEXT[curse].name;
    // Boss day (§7 splash states): the Warden and its chain, or that it has fallen.
    const boss = (r.kind === 'play' || r.kind === 'played') && r.boss ? (r.boss.killer ? 'The Warden has fallen.' : `The Warden: ${r.boss.hp} of ${r.boss.pool} links.`) : '';
    if ('depth' in r && typeof r.depth === 'number') step('splash', r.depth);
    if (r.kind === 'play') set(`Floor ${r.depth}${curse ? ` · ${CURSE_TEXT[curse].name}` : ''}`, boss || (r.ghosts.fell ? `${r.ghosts.fell} fell here today.` : 'Nobody has fallen here yet. Be the first ghost.'), 'Descend', (e) => {
      step('descend', r.depth);
      expand(e);
    });
    else if (r.kind === 'played' && r.today) set(`Floor ${r.depth}`, `${r.run.outcome === 'won' ? 'Cleared' : 'Fell'} · score ${r.run.score}. Today is Floor ${r.today}.`, "Today's floor", () => r.todayUrl && (import.meta.env.DEV ? location.assign(r.todayUrl) : navigateTo(r.todayUrl))); // an old floor points on (A61)
    else if (r.kind === 'played') set(`Floor ${r.depth}`, boss || `${r.run.outcome === 'won' ? 'Cleared' : 'Fell'} · score ${r.run.score} · ${r.ghosts.fell} fell`, 'See your run');
    else if (r.kind === 'closed') set(`Floor ${r.depth}`, `Closed. Today is Floor ${r.today}.`, "Today's floor", () => r.todayUrl && (import.meta.env.DEV ? location.assign(r.todayUrl) : navigateTo(r.todayUrl)));
    else if (r.kind === 'login') set(`Floor ${r.depth}`, 'One run a day, under your name.', 'Log in to descend', () => showLoginPrompt());
    else set('Floor 0', 'No floor yet. Practice first.', 'Practice');
  },
  () => set(null, "Can't reach the dungeon.", 'Descend anyway'),
);
performance.mark('descent:splash');
