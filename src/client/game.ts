/// <reference types="vite/client" />
// Boot, input router, HUD wiring and the dev hook. Rules live in src/shared/sim.ts; this file only sends actions.
import { FLOOR_0, FLOOR_0_GHOSTS, HEARTS, ITEMS, NAMELESS, PALETTE, TILE, TORCH_LOW_PCT } from '../shared/content';
import { navigateTo, showLoginPrompt } from '@devvit/web/client';
import type { FloorResponse, GhostView, RunResult } from '../shared/api';
import { carvingLabel, type Ghost } from '../shared/ghosts';
import { isAction, replay, start, step, type Action, type End, type Floor, type Pos } from '../shared/sim';
import { api, submit } from './net';
import { iconCanvas, loadPack, packIcon } from './sprites';
import { button, carvingPicker, controls, createHud, el, endPanel, ghostCard, saveLine, type PanelAction } from './ui';

const $ = (id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`game.html is missing #${id}`);
  return node;
};
const stage = $('stage');
const end = $('end');
const pad = $('controls');
const carvingLine = $('carving');
const cardRoot = $('card');

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
// Phaser is most of the game's bytes, so it loads as its own chunk: the floor request runs while it downloads.
const engine = Promise.all([import('phaser'), import('./scene')]);
const day: FloorResponse | 'error' = devFloor ? { kind: 'none' } : await api.floor().catch(() => 'error' as const);
const [Phaser, { DescentScene }] = await engine;
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
// Ghosts (7a): the crowd's on the day's floor, scripted ones on Floor 0; declared before the first view() reads them.
const NONE: GhostView = { fell: 0, tiles: [], list: [] };
const SCRIPTED: GhostView = {
  fell: FLOOR_0_GHOSTS.length,
  tiles: FLOOR_0_GHOSTS.map((g) => [g.x, g.y, 1]),
  list: FLOOR_0_GHOSTS.map((g) => ({ name: null, x: g.x, y: g.y, cause: g.cause, carving: g.carving })),
};
let dayGhosts: GhostView = day !== 'error' && (day.kind === 'play' || day.kind === 'played') ? day.ghosts : NONE;
let shown: GhostView = NONE;
let pack: HTMLCanvasElement | null = null;
void loadPack().then((p) => {
  pack = p;
  view();
});
const hud = createHud($('hud'), TORCH_LOW_PCT, HEARTS, (item) => (pack ? packIcon(pack, ITEMS[item].frames[0], 2) : undefined));
const view = () => {
  hud({ hearts: state.hearts, hasKey: state.hasKey, item: pack ? state.item : null, torch: state.torch, torchMax: state.floor.torch, depth: state.floor.depth });
  nearby();
};
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
const practice: PanelAction = { label: 'Practice Floor 0', run: () => play(FLOOR_0, null) };
const fellLine = (n: number) => (n === 1 ? '1 fell here today.' : `${n} fell here today.`);
let played: RunResult | null = null;
/** Resolves true once the day's run is stored; a carving waits on it (§15.1: play never waits on the network). */
let runSaved: Promise<boolean> = Promise.resolve(false);

const finish = (ended: End) => {
  const title = ended.kind === 'won' ? `Floor ${state.floor.depth} cleared` : 'You fell';
  if (!live) {
    store.set(F0_KEY, '1');
    // After Floor 0, the day's floor is the next thing (no dead ends), unless it is already played or out of reach.
    const next = playable && !played ? { label: `Descend to Floor ${playable.depth}`, run: () => play(playable.floor, playable) } : { label: 'Descend again', run: () => play(floor, null) };
    return endPanel(end, { title, line: endLine(ended, state.turn), primary: next });
  }
  const save = saveLine();
  sendRun(live, save);
  if (ended.kind === 'dead') return pickCarving(title, endLine(ended, state.turn), save, live.depth);
  endPanel(end, { title, line: endLine(ended, state.turn), primary: practice, status: save.node });
  void runSaved.then((ok) => {
    if (ok) void result();
  });
};

function sendRun(l: Live, save: ReturnType<typeof saveLine>) {
  const req = { depth: l.depth, log: l.log };
  runSaved = submit(() => api.run(req), (st) => save.set(st, () => sendRun(l, save))).then((r) => {
    if (r?.kind === 'saved') played = r.run;
    if (r?.kind === 'closed') closed(l.depth, r.today, r.todayUrl);
    return r?.kind === 'saved';
  });
}

/**
 * The carving picker, on the death panel and (while the floor is live) on the result plate: Carve is primary, Skip
 * secondary. The panel leaves the map undimmed and the camera lifts, so the tile where you fell and its neighbours stay in
 * view; the chosen glyph previews on that tile. A carving made before the run is saved waits for it.
 */
function pickCarving(title: string, line: string, save: ReturnType<typeof saveLine>, depth: number) {
  let choice: string | null = null;
  const picker = carvingPicker((raw) => {
    choice = raw;
    carve.disabled = !raw;
    scene.preview(state.pos, raw);
  });
  const doCarve = async () => {
    if (!choice) return;
    const raw = choice;
    carve.disabled = true;
    picker.disabled = true;
    save.set('saving');
    if (!(await runSaved) && live) sendRun(live, save);
    if (!(await runSaved)) return save.set('failed', () => void doCarve());
    const r = await submit(() => api.carve({ depth, carving: raw }), (st) => save.set(st, () => void doCarve()));
    if (r?.kind === 'closed') return closed(depth, r.today, r.todayUrl);
    if (r) void result();
  };
  const carve = endPanel(end, {
    title, line, body: [picker], status: save.node, clear: true,
    primary: { label: 'Carve', run: () => void doCarve(), disabled: true },
    secondary: { label: 'Skip', run: () => void runSaved.then(() => result()) },
  });
  keepHeroInView();
}

/** The result plate: your run, your ghost and its carving, how many fell. Ghosts are fetched again here (no polling). */
async function result(prefetched?: FloorResponse) {
  scene.preview(null);
  const r = prefetched ?? (await api.floor().catch(() => null));
  if (!r || r.kind !== 'played') return;
  played = r.run;
  runSaved = Promise.resolve(true); // the server sent it, so it is stored: a carving made from this plate goes straight out
  const mine = r.ghosts.list.find((g) => g.mine);
  if (state.floor.depth !== r.depth) {
    // The plate's map is the day's floor: your run replayed if this device kept its log, else you stand on your ghost.
    floor = r.floor;
    live = null;
    const log = store.get(logKey(r));
    state = log ? replay(floor, [...log].filter(isAction)) : start(floor);
    if (mine && !log) state = { ...state, pos: { x: mine.x, y: mine.y } };
    scene.reset(state);
  }
  setGhosts(r.ghosts);
  const ended: End = { kind: r.run.outcome, cause: r.run.cause };
  const title = r.run.outcome === 'won' ? `Floor ${r.depth} cleared` : `You fell on Floor ${r.depth}`;
  const line = `Score ${r.run.score}. ${endLine(ended, r.run.turns)} ${fellLine(r.ghosts.fell)}`;
  if (mine && !mine.carving && r.live) {
    return endPanel(end, { title, line, body: [ownGhost(mine)], primary: { label: 'Carve', run: () => pickCarving(title, line, saveLine(), r.depth) }, secondary: practice });
  }
  endPanel(end, { title, line, body: mine ? [ownGhost(mine)] : [], primary: practice });
}
const ownGhost = (g: Ghost) => el('p', 'own-ghost', g.carving ? `Your ghost: ${carvingLabel(g.carving)}` : 'Your ghost left no carving.');

/** Start (or restart) a floor. `real` set: the day's floor, logged and resumed from its saved log. */
function play(f: Floor, real: { depth: number; seed: number; floor: Floor } | null) {
  floor = f;
  live = real && liveOf(real);
  again();
}

function again() {
  end.hidden = true;
  end.classList.remove('end--clear');
  queued = null;
  state = begin();
  scene.reset(state);
  scene.lift(0);
  scene.preview(null);
  setGhosts(dayGhosts);
  view();
  settle();
  if (state.ended) finish(state.ended);
}

// ---- ghosts (7a): what other players left. Pictures and words only: never part of the run, never logged ----
/** Floor 0 shows its scripted ghosts, the day's floor the crowd's, dev floors none. */
function setGhosts(g: GhostView) {
  dayGhosts = g;
  shown = state.floor.depth === 0 ? SCRIPTED : devFloor ? NONE : g;
  scene.setGhosts(shown);
  nearby();
}
/** Steps from the hero, diagonals counting one: 1 is on or next to. */
const reach = (p: Pos) => Math.max(Math.abs(p.x - state.pos.x), Math.abs(p.y - state.pos.y));

/** On or next to a carved ghost, its carving shows in a line under the HUD (aria-live): no input needed. */
function nearby() {
  const near = shown.list.filter((g) => g.carving && reach(g) <= 1);
  const g = near[0];
  if (!g?.carving) {
    carvingLine.hidden = true;
    return;
  }
  const read = button('Read');
  read.addEventListener('click', () => openCard(g));
  carvingLine.replaceChildren(el('span', '', `${g.name ? `u/${g.name}` : NAMELESS}: ${carvingLabel(g.carving)}${near.length > 1 ? ` (+${near.length - 1})` : ''}`), read);
  carvingLine.hidden = false;
}

/** The ghost card: tap a wisp or press Read. The snoovatar loads only now; the wisp stays if there is none. */
function openCard(g: Ghost) {
  const avatar = el('div', 'ghost-card__img', iconCanvas('wisp', 4));
  if (g.name)
    void api.avatar(g.name).then(({ url }) => {
      if (!url) return;
      const img = el('img');
      img.alt = '';
      img.width = img.height = 96;
      img.onload = () => avatar.replaceChildren(img);
      img.src = url;
    }, () => undefined);
  const close = () => {
    cardRoot.hidden = true;
    cardRoot.replaceChildren();
  };
  cardRoot.replaceChildren(ghostCard({ name: g.name, carving: g.carving ? carvingLabel(g.carving) : null, cause: g.cause, avatar, onClose: close }));
  cardRoot.hidden = false;
  cardRoot.querySelector<HTMLButtonElement>('.ghost-card__close')?.focus();
}

/** Lift the camera so the hero's tile and the tiles around it sit above the panel covering the bottom of the map. */
function keepHeroInView() {
  void scene.ready.then(() => requestAnimationFrame(() => {
    const panel = end.querySelector('.end__panel')?.getBoundingClientRect();
    const hero = scene.screenOf(state.pos);
    if (panel && hero) scene.lift(Math.max(0, hero.bottom + hero.size - panel.top + 4));
  }));
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
  if (!cardRoot.hidden) {
    if (e.key === 'Escape') cardRoot.querySelector<HTMLButtonElement>('.ghost-card__close')?.click();
    return; // reading a card never moves the hero
  }
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
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) {
    // A tap on a lit wisp reads it: the first listed ghost on that tile (carved first), or the count alone.
    const t = scene.tileAt(e.clientX, e.clientY);
    const tile = t && shown.tiles.find(([x, y]) => x === t.x && y === t.y);
    if (!t || !tile || !scene.isLit(t)) return;
    openCard(shown.list.find((g) => g.x === t.x && g.y === t.y) ?? { name: null, x: t.x, y: t.y, cause: `${tile[2]} deaths`, carving: null });
    return;
  }
  act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U');
});

const go = (url: string | null) => url && (import.meta.env.DEV ? location.assign(url) : navigateTo(url));
function closed(depth: number, today: number, url: string | null) {
  endPanel(end, { title: `Floor ${depth} has closed`, line: `Today is Floor ${today}.`, primary: { label: "Go to today's floor", run: () => go(url) } });
}

// Every state the day can be in is designed, none fails silently (§15.1). The full already-played screen is Phase 9.
setGhosts(dayGhosts);
if (day === 'error') endPanel(end, { title: 'The way down is dark', line: "Can't reach the dungeon. Try again.", primary: { label: 'Retry', run: () => location.reload() } });
else if (day.kind === 'login') endPanel(end, { title: 'Log in to descend', line: `Floor ${day.depth}: one run a day, kept under your name.`, primary: { label: 'Log in', run: () => showLoginPrompt() } });
else if (day.kind === 'closed') closed(day.depth, day.today, day.todayUrl);
else if (day.kind === 'played') void result(day);
else if (day.kind === 'none' && !devFloor) endPanel(end, { title: 'No floor yet', line: 'The first floor opens soon.', primary: practice });
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
  /** The ghosts drawn on this floor (scripted on Floor 0). */
  ghosts: () => GhostView;
  /** A tile's box on the page, for taps and layout checks. */
  tileBox: (x: number, y: number) => { left: number; top: number; bottom: number; size: number } | null;
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
    ghosts: () => shown,
    tileBox: (x, y) => scene.screenOf({ x, y }),
  };
}
