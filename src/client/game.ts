/// <reference types="vite/client" />
// Boot, input router, HUD wiring and the dev hook. Rules live in src/shared/sim.ts; this file only sends actions.
import * as Phaser from 'phaser';
import { FLOOR_0, HEARTS, ITEMS, PALETTE, TILE, TORCH_LOW_PCT } from '../shared/content';
import { navigateTo, showLoginPrompt } from '@devvit/web/client';
import type { FloorResponse, RunResult } from '../shared/api';
import { isAction, replay, start, step, type Action, type End, type Floor, type Pos } from '../shared/sim';
import { api, submit } from './net';
import { DescentScene } from './scene';
import { loadPack, packIcon } from './sprites';
import { controls, createHud, endPanel, saveLine } from './ui';

const $ = (id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`game.html is missing #${id}`);
  return node;
};
const stage = $('stage');
const end = $('end');
const pad = $('controls');

// The map view keeps at least 9×9 tiles at the largest integer zoom (2–4), then fills the stage with whole tiles.
const MIN_TILES = 9;
const SWIPE_PX = 24;
const REPEAT_DELAY_MS = 300;
const REPEAT_MS = 200;
const KEYS: Record<string, Action> = {
  ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R',
  ' ': 'W', e: 'I', E: 'I',
};

// Dev builds only: game.html?scene=goblins-2 opens a scene; game.html?depth=15&seed=123 opens a generated floor (§15.2).
// Production never imports the scenes, the generator or the bot.
const SCENES = import.meta.env.DEV ? (await import('../shared/scenes')).SCENES : [];
const GEN = import.meta.env.DEV ? await import('../shared/gen') : null;
const LOCAL = import.meta.env.DEV ? await import('./local') : null;
const sceneFloor = (id: string | null) => SCENES.find((s) => s.id === id)?.floor;
const depthFloor = (depth: number, seed: number) => (GEN && depth > 0 ? GEN.generate(depth, seed).floor : undefined);

const params = new URLSearchParams(location.search);
const devFloor = sceneFloor(params.get('scene')) ?? depthFloor(Number(params.get('depth')), Number(params.get('seed') ?? 1));

// ---- the day's floor: fetched once, then play never waits on the network (§15.1) ----
// `live` is the day's real floor while it is being played; Floor 0, scenes and dev floors are never logged or submitted.
type Live = { depth: number; seed: number; floor: Floor; log: string };
const day: FloorResponse | 'error' = devFloor ? { kind: 'none' } : await api.floor().catch(() => 'error' as const);
let live: Live | null = null;
// Saved logs are keyed by depth and seed, so an old log can never replay onto a different floor.
const logKey = (l: { depth: number; seed: number }) => `descent:log:${l.depth}:${l.seed}`;
const F0_KEY = 'descent:f0';
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: the run still plays, it just won't resume */ } },
};
const liveOf = (r: { depth: number; seed: number; floor: Floor }): Live => ({ depth: r.depth, seed: r.seed, floor: r.floor, log: store.get(logKey(r)) ?? '' });
const playable = day !== 'error' && day.kind === 'play' ? day : null;
if (playable && store.get(F0_KEY)) live = liveOf(playable);
let floor: Floor = devFloor ?? live?.floor ?? FLOOR_0;
// Resume: the saved log replays with animations skipped (it is the same fold the server runs).
const begin = () => (live ? replay(floor, [...live.log].filter(isAction)) : start(floor));
let state = begin();
let pack: HTMLCanvasElement | null = null;
void loadPack().then((p) => {
  pack = p;
  view();
});
const hud = createHud($('hud'), TORCH_LOW_PCT, HEARTS, (item) => (pack ? packIcon(pack, ITEMS[item].frames[0], 2) : undefined));
const view = () => hud({ hearts: state.hearts, hasKey: state.hasKey, item: pack ? state.item : null, torch: state.torch, torchMax: state.floor.torch, depth: state.floor.depth });
controls(pad);
view();

const fit = () => {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const zoom = Math.max(2, Math.min(4, Math.floor(Math.min(w, h) / (MIN_TILES * TILE))));
  const cols = Math.max(1, Math.floor(w / (TILE * zoom)));
  const rows = Math.max(1, Math.floor(h / (TILE * zoom)));
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

const CAUSES: Record<string, string> = { trap: 'trap', pit: 'fall' };
const endLine = (ended: End, turns: number) =>
  ended.kind === 'won' ? `${turns} turns. The stairs go down.` : `The ${CAUSES[ended.cause] ?? ended.cause} took you on turn ${turns}.`;
const practice = { label: 'Practice Floor 0', run: () => play(FLOOR_0, null) };
const finish = (ended: End) => {
  const title = ended.kind === 'won' ? `Floor ${state.floor.depth} cleared` : 'You fell';
  if (!live) {
    store.set(F0_KEY, '1');
    // After Floor 0, the day's floor is the next thing (no dead ends), unless it is already played or out of reach.
    const next = playable && !played ? { label: `Descend to Floor ${playable.depth}`, run: () => play(playable.floor, playable) } : { label: 'Descend again', run: () => play(floor, null) };
    return endPanel(end, title, endLine(ended, state.turn), next);
  }
  const save = saveLine();
  endPanel(end, title, endLine(ended, state.turn), practice, save.node);
  const req = { depth: live.depth, log: live.log };
  const send = () => void submit(req, (s) => save.set(s, send)).then((r) => {
    if (r?.kind === 'saved') played = r.run;
    if (r?.kind === 'closed') closed(state.floor.depth, r.today, r.todayUrl);
  });
  send();
};
let played: RunResult | null = null;

/** Start (or restart) a floor. `real` set: the day's floor, logged and resumed from its saved log. */
function play(f: Floor, real: { depth: number; seed: number; floor: Floor } | null) {
  floor = f;
  live = real && liveOf(real);
  again();
}

function again() {
  end.hidden = true;
  queued = null;
  state = begin();
  scene.reset(state);
  view();
  settle();
  if (state.ended) finish(state.ended);
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
  // Only actions that change state are logged: a free bump would make a log unbounded, and the server rejects one.
  if (live && r.state !== state) {
    if (!live.log) void api.start({ depth: live.depth }).catch(() => undefined);
    live.log += a;
    store.set(logKey(live), live.log);
  }
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
// Keys repeat on our own clock, like the d-pad: OS auto-repeat is ignored, so damage can cancel a held key,
// and a key whose keyup we never see (focus jumped to the Reddit page) can't keep walking the hero.
let heldKey = '';
addEventListener('keydown', (e) => {
  const a = KEYS[e.key];
  if (!a || !end.hidden) return;
  e.preventDefault();
  if (e.repeat) return;
  act(a);
  startRepeat(a);
  heldKey = e.key;
});
addEventListener('keyup', (e) => {
  if (e.key === heldKey) stopRepeat();
});
addEventListener('blur', stopRepeat);
document.addEventListener('visibilitychange', stopRepeat);

let repeat = 0;
function stopRepeat() {
  clearTimeout(repeat);
  clearInterval(repeat);
  repeat = 0;
  heldKey = '';
}
function startRepeat(a: Action) {
  stopRepeat();
  if (a !== 'I') repeat = window.setTimeout(() => (repeat = window.setInterval(() => act(a), REPEAT_MS)), REPEAT_DELAY_MS);
}
pad.addEventListener('pointerdown', (e) => {
  const b = e.target instanceof Element ? e.target.closest('[data-act]') : null;
  const a = b instanceof HTMLElement ? b.dataset.act : undefined;
  if (!isAction(a)) return;
  e.preventDefault();
  act(a);
  startRepeat(a);
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

const go = (url: string | null) => url && (import.meta.env.DEV ? location.assign(url) : navigateTo(url));
function closed(depth: number, today: number, url: string | null) {
  endPanel(end, `Floor ${depth} has closed`, `Today is Floor ${today}.`, { label: "Go to today's floor", run: () => go(url) });
}

// Every state the day can be in is designed, none fails silently (§15.1). The full already-played screen is Phase 9.
if (day === 'error') endPanel(end, 'The way down is dark', "Can't reach the dungeon. Try again.", { label: 'Retry', run: () => location.reload() });
else if (day.kind === 'login') endPanel(end, 'Log in to descend', `Floor ${day.depth}: one run a day, kept under your name.`, { label: 'Log in', run: () => showLoginPrompt() });
else if (day.kind === 'closed') closed(day.depth, day.today, day.todayUrl);
else if (day.kind === 'played') {
  played = day.run;
  const ended: End = { kind: day.run.outcome, cause: day.run.cause };
  endPanel(end, day.run.outcome === 'won' ? `Floor ${day.depth} cleared` : `You fell on Floor ${day.depth}`, `Score ${day.run.score}. ${endLine(ended, day.run.turns)}`, practice);
} else if (day.kind === 'none' && !devFloor) endPanel(end, 'No floor yet', 'The first floor opens soon.', practice);
else if (state.ended) finish(state.ended); // resumed onto a finished run: show it and (re)submit, which is a safe retry

void scene.ready.then(() => performance.mark('descent:interactive'));

// ---- dev hook for Playwright (§10). Dev builds only; never in the Devvit bundle. ----
type DescentHook = {
  ready: Promise<void>;
  state: () => { pos: Pos; hearts: number; torch: number; turn: number; floor: number; ended: End | null; hasKey: boolean; item: string | null; enemies: { id: number; mode: string; x: number; y: number }[] };
  act: (a: Action) => Promise<void>;
  /** Floor 0 (with test options), a scene by id, or a generated floor (depth > 0, opts.seed). */
  load: (depth: number | string, opts?: { mercy?: boolean; torch?: number; seed?: number }) => void;
  skipAnim: (on: boolean) => void;
  /** Every scene's id and action log, for e2e checks that replay them by keyboard or taps. */
  scenes: () => { id: string; log: Action[] }[];
  metrics: () => { inputToMotion: number; shakes: number };
  /** The local rollover (local.ts); reload to see the new day. */
  advanceDay: () => void;
  /** Fake a dropped connection for every request (retry and "Not saved" states). */
  offline: (on: boolean) => void;
  /** The live floor's logged actions ('' on Floor 0 and dev floors). */
  log: () => string;
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
      pos: { ...state.pos }, hearts: state.hearts, torch: state.torch, turn: state.turn, floor: state.floor.depth, ended: state.ended, hasKey: state.hasKey, item: state.item,
      enemies: state.enemies.map((e) => ({ id: e.id, mode: e.mode, x: e.x, y: e.y })),
    }),
    act: (a) =>
      new Promise((resolve) => {
        waiters.push(resolve);
        act(a);
        settle();
      }),
    // Floor 0 variants for testing lethal paths (mercy off, short torch). Dev builds only.
    load: (target, opts = {}) => {
      const picked = typeof target === 'string' ? sceneFloor(target) : depthFloor(target, opts.seed ?? 1);
      if (target !== 0 && !picked) throw new Error(`no floor ${target}: Floor 0, a scene id, or a depth`);
      const { seed: _, ...floorOpts } = opts;
      floor = picked ?? { ...FLOOR_0, ...floorOpts };
      live = null;
      again();
    },
    skipAnim: (on) => (skipAnim = on),
    scenes: () => SCENES.map((s) => ({ id: s.id, log: [...s.log] })),
    metrics: () => ({ inputToMotion, shakes: scene.shakes }),
    advanceDay: LOCAL?.advanceDay ?? (() => undefined),
    offline: LOCAL?.setOffline ?? (() => undefined),
    log: () => live?.log ?? '',
  };
}
