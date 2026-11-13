/// <reference types="vite/client" />
// Boot, input router, HUD wiring and the dev hook. Rules live in src/shared/sim.ts; this file only sends actions.
import * as Phaser from 'phaser';
import { FLOOR_0, HEARTS, PALETTE, TILE, TORCH_LOW_PCT } from '../shared/content';
import { start, step, type Action, type End, type Floor, type Pos } from '../shared/sim';
import { DescentScene } from './scene';
import { controls, createHud, endPanel } from './ui';

const $ = (id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`game.html is missing #${id}`);
  return node;
};
const stage = $('stage');
const end = $('end');
const pad = $('controls');

// The map view targets 11×9 tiles at the largest integer zoom (2–4) that fits.
const VIEW_W = 11;
const VIEW_H = 9;
const SWIPE_PX = 24;
const REPEAT_DELAY_MS = 300;
const REPEAT_MS = 200;
const ACTIONS: readonly Action[] = ['U', 'D', 'L', 'R', 'W', 'I'];
const KEYS: Record<string, Action> = {
  ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R',
  ' ': 'W', e: 'I', E: 'I',
};
const isAction = (s: string | undefined): s is Action => ACTIONS.some((a) => a === s);

let floor: Floor = FLOOR_0;
let state = start(floor);
const hud = createHud($('hud'), TORCH_LOW_PCT, HEARTS);
const view = () => hud({ hearts: state.hearts, hasKey: state.hasKey, torch: state.torch, torchMax: state.floor.torch, depth: state.floor.depth });
controls(pad);
view();

const fit = () => {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const zoom = Math.max(2, Math.min(4, Math.floor(Math.min(w / (VIEW_W * TILE), h / (VIEW_H * TILE)))));
  const cols = Math.max(1, Math.min(state.tiles[0]?.length ?? 1, Math.floor(w / (TILE * zoom))));
  const rows = Math.max(1, Math.min(state.tiles.length, Math.floor(h / (TILE * zoom))));
  return { width: cols * TILE, height: rows * TILE, zoom };
};

const scene = new DescentScene(state);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  pixelArt: true,
  roundPixels: true,
  backgroundColor: PALETTE['ink-0'],
  scale: { mode: Phaser.Scale.NONE, ...fit() },
  scene,
});
addEventListener('resize', () => {
  const s = fit();
  game.scale.resize(s.width, s.height);
  game.scale.setZoom(s.zoom);
});
// Pause the Phaser loop while the tab is hidden (§15.3).
document.addEventListener('visibilitychange', () => (document.hidden ? game.loop.sleep() : game.loop.wake()));

// ---- turn pipeline: one action plays at a time, one more is buffered ----
let busy = false;
let queued: Action | null = null;
let skipAnim = false;
let inputAt = 0;
let inputToMotion = 0;
const waiters: (() => void)[] = [];
const settle = () => {
  if (busy || queued) return;
  while (waiters.length) waiters.shift()?.();
};

const CAUSES: Record<string, string> = { spikes: 'spikes', goblin: 'goblin', dark: 'dark' };
const finish = (ended: End) => {
  const line = ended.kind === 'won' ? `${state.turn} turns. The stairs go down.` : `The ${CAUSES[ended.cause] ?? ended.cause} took you on turn ${state.turn}.`;
  endPanel(end, ended.kind === 'won' ? 'Floor 0 cleared' : 'You fell', line, again);
};

function again() {
  end.hidden = true;
  queued = null;
  state = start(floor);
  scene.reset(state);
  view();
  settle();
}

const act = (a: Action) => {
  if (state.ended) return scene.skip();
  if (busy) {
    queued = a;
    return;
  }
  void run(a);
};

const run = async (a: Action) => {
  busy = true;
  inputAt = performance.now();
  requestAnimationFrame(() => (inputToMotion = performance.now() - inputAt));
  const r = step(state, a);
  state = r.state;
  view();
  if (r.events.some((e) => e.t === 'hurt')) stopRepeat();
  await scene.play(r.events, state, skipAnim);
  busy = false;
  if (state.ended) {
    finish(state.ended);
    return settle();
  }
  const next = queued;
  queued = null;
  if (next) act(next);
  settle();
};

// ---- input: keyboard, d-pad (Pointer Events, hold to repeat), swipe on the map ----
addEventListener('keydown', (e) => {
  const a = KEYS[e.key];
  if (!a || !end.hidden) return;
  e.preventDefault();
  act(a);
});

let repeat = 0;
const stopRepeat = () => {
  clearTimeout(repeat);
  clearInterval(repeat);
  repeat = 0;
};
pad.addEventListener('pointerdown', (e) => {
  const b = e.target instanceof Element ? e.target.closest('[data-act]') : null;
  const a = b instanceof HTMLElement ? b.dataset.act : undefined;
  if (!isAction(a)) return;
  e.preventDefault();
  act(a);
  stopRepeat();
  if (a !== 'I') repeat = window.setTimeout(() => (repeat = window.setInterval(() => act(a), REPEAT_MS)), REPEAT_DELAY_MS);
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) pad.addEventListener(type, stopRepeat);
// Keyboard activation of a focused plate (Enter/Space) arrives as a click with detail 0.
pad.addEventListener('click', (e) => {
  const b = e.target instanceof Element ? e.target.closest('[data-act]') : null;
  const a = b instanceof HTMLElement ? b.dataset.act : undefined;
  if (e.detail === 0 && isAction(a)) act(a);
});

let swipe: Pos | null = null;
stage.addEventListener('pointerdown', (e) => {
  swipe = { x: e.clientX, y: e.clientY };
  if (state.ended) scene.skip();
});
stage.addEventListener('pointerup', (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
  act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U');
});

void scene.ready.then(() => performance.mark('descent:interactive'));

// ---- dev hook for Playwright (§10). Dev builds only; never in the Devvit bundle. ----
type DescentHook = {
  ready: Promise<void>;
  state: () => { pos: Pos; hearts: number; torch: number; turn: number; floor: number; ended: End | null; hasKey: boolean; enemies: { id: number; mode: string; x: number; y: number }[] };
  act: (a: Action) => Promise<void>;
  load: (depth: number, opts?: { mercy?: boolean; torch?: number }) => void;
  skipAnim: (on: boolean) => void;
  metrics: () => { inputToMotion: number; shakes: number };
};
declare global {
  interface Window {
    __descent?: DescentHook;
  }
}
if (import.meta.env.DEV) {
  window.__descent = {
    ready: scene.ready,
    state: () => ({
      pos: { ...state.pos }, hearts: state.hearts, torch: state.torch, turn: state.turn, floor: state.floor.depth, ended: state.ended, hasKey: state.hasKey,
      enemies: state.enemies.map((e) => ({ id: e.id, mode: e.mode, x: e.x, y: e.y })),
    }),
    act: (a) =>
      new Promise((resolve) => {
        waiters.push(resolve);
        act(a);
        settle();
      }),
    // Floor 0 variants for testing lethal paths (mercy off, short torch). Dev builds only.
    load: (depth, opts = {}) => {
      if (depth !== 0) throw new Error('Phase 3 has only Floor 0');
      floor = { ...FLOOR_0, ...opts };
      again();
    },
    skipAnim: (on) => (skipAnim = on),
    metrics: () => ({ inputToMotion, shakes: scene.shakes }),
  };
}
