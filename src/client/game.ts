/// <reference types="vite/client" />
// Boot, input router, HUD wiring and the dev hook. Rules live in src/shared/sim.ts; this file only sends actions.
import { BOARD, CURSE_TEXT, FLOOR_0, FLOOR_0_GHOSTS, HEARTS, ITEMS, KILL_FAMILY, NAMELESS, PALETTE, TILE, TORCH_LOW_PCT, TRAPS, TRAP_TEXT, ZONE_NAMES, type Curse } from '../shared/content';
import { slitLine, zoneOf } from '../shared/grid';
import { navigateTo, showLoginPrompt } from '@devvit/web/client';
import type { BossView, FloorResponse, GhostView, MyTrap, RunResult } from '../shared/api';
import { carvingLabel, type Ghost, type Vote } from '../shared/ghosts';
import { isAction, replay, start, step, type Action, type End, type Floor, type Pos } from '../shared/sim';
import { api, submit } from './net';
import { iconCanvas, loadPack, packIcon } from './sprites';
import { button, carvingPicker, carvingsList, chainMeter, controls, createHud, cursePicker, el, endPanel, ghostCard, introCompass, saveLine, trapPicker, type PanelAction } from './ui';
import { miniMap } from './minimap';
import { boardPanel, chroniclePanel } from './screens';

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
type Live = { depth: number; seed: number; attempt: number; floor: Floor; log: string };
// Phaser is most of the game's bytes, so it loads as its own chunk: the floor request runs while it downloads.
const engine = Promise.all([import('phaser'), import('./scene')]);
const day: FloorResponse | 'error' = devFloor ? { kind: 'none' } : await api.floor().catch(() => 'error' as const);
const [Phaser, { DescentScene }] = await engine;
let live: Live | null = null;
// Saved logs are keyed by depth and seed, so an old log can never replay onto a different floor; and by the mod reset
// tool's attempt count, so a cleared run's log is never resubmitted.
type Day = { depth: number; seed: number; attempt: number; floor: Floor };
const logKey = (l: Omit<Day, 'floor'>) => `descent:log:${l.depth}:${l.seed}${l.attempt ? `:${l.attempt}` : ''}`;
const F0_KEY = 'descent:f0';
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: the run still plays, it just won't resume */ } },
};
const liveOf = (r: Day): Live => ({ depth: r.depth, seed: r.seed, attempt: r.attempt, floor: r.floor, log: store.get(logKey(r)) ?? '' });
const playable = day !== 'error' && day.kind === 'play' ? day : null;
// The tutorial flag is kept on the server too: a deploy (new origin, empty storage) never shows Floor 0 again.
if (playable && (store.get(F0_KEY) || playable.tutorial)) live = liveOf(playable);
let floor: Floor = devFloor ?? live?.floor ?? FLOOR_0;
// Resume: the saved log replays with animations skipped (it is the same fold the server runs).
const begin = () => (live ? replay(floor, [...live.log].filter(isAction)) : start(floor));
let state = begin();
// Ghosts (7a): the crowd's on the day's floor, scripted ones on Floor 0; declared before the first view() reads them.
const NONE: GhostView = { fell: 0, tiles: [], list: [] };
const SCRIPTED: GhostView = {
  fell: FLOOR_0_GHOSTS.length,
  tiles: FLOOR_0_GHOSTS.map((g) => [g.x, g.y, 1]),
  list: FLOOR_0_GHOSTS.map((g, i) => ({ id: `floor0:${i}`, name: null, x: g.x, y: g.y, cause: g.cause, carving: g.carving })),
};
let dayGhosts: GhostView = day !== 'error' && (day.kind === 'play' || day.kind === 'played') ? day.ghosts : NONE;
/** Phase 10: the Warden's shared pool on its floor (refreshed by the plate's poll); null on other floors. */
let boss: BossView | null = day !== 'error' && (day.kind === 'play' || day.kind === 'played') ? (day.boss ?? null) : null;
let shown: GhostView = NONE;
const lowTorch = (t: number) => t * 100 <= state.floor.torch * TORCH_LOW_PCT;
let lastTorch = Infinity;
let torchTurn = -1;
let pack: HTMLCanvasElement | null = null;
void loadPack().then((p) => {
  pack = p;
  view();
});
const hud = createHud($('hud'), TORCH_LOW_PCT, HEARTS, (item) => (pack ? packIcon(pack, ITEMS[item].frames[0], 2) : undefined));
const view = () => {
  const curse = state.floor.curses?.[0];
  // During a live run on the Warden's floor the chain counts down with your own bumps (its HP when the run began, less yours).
  const chain = boss && live && !state.ended && state.enemies.some((e) => e.kind === 'warden') ? Math.max(0, boss.hp - state.dealt) : null;
  hud({ hearts: state.hearts, hasKey: state.hasKey, item: pack ? state.item : null, torch: state.torch, torchMax: state.floor.torch, depth: state.floor.depth, curse: curse ? CURSE_TEXT[curse].name : null, chain });
  // A torch event (crossing low, reaching zero) owns the line under the HUD on the turn it happens.
  if ((!lowTorch(lastTorch) && lowTorch(state.torch)) || (lastTorch > 0 && state.torch <= 0)) torchTurn = state.turn;
  lastTorch = state.torch;
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

const CAUSES: Record<string, string> = { trap: 'trap', pit: 'fall', warden: 'Warden' };
/** Phase 10: the links a run broke, said at its end (none said when it broke none). */
const linksLine = (n: number) => (n ? ` You broke ${n} link${n === 1 ? '' : 's'}.` : '');
const endLine = (ended: End, turns: number, by: string | null = null) =>
  ended.kind === 'won' ? `${turns} turns. The stairs go down.` : by ? `${by} took you on turn ${turns}.` : `The ${CAUSES[ended.cause] ?? ended.cause} took you on turn ${turns}.`;
/** A player's trap that took you: found from the floor alone (its placed traps), so it names its owner (Phase 8). */
function trapOwner(): string | null {
  if (state.ended?.cause !== 'trap') return null;
  const p = state.pos;
  const t = state.floor.traps?.find((x) => (x.kind === 'dart' ? slitLine(state.tiles, x, TRAPS.dart.range).some((q) => q.x === p.x && q.y === p.y) : x.x === p.x && x.y === p.y));
  return t ? `The ${TRAP_TEXT[t.kind].toLowerCase()} set by ${t.name ? `u/${t.name}` : NAMELESS}` : null;
}
/** What your trap (set yesterday) has done on this floor: shown before your run and on your plate. */
function trapNews(t: MyTrap) {
  if (!t) return '';
  const name = TRAP_TEXT[t.kind].toLowerCase();
  return t.hurt || t.killed ? `Your ${name} hurt ${t.hurt} and took ${t.killed} here.` : `Your ${name} wait here; nobody has stepped on them yet.`;
}
const practice: PanelAction = { label: 'Practice Floor 0', run: () => play(FLOOR_0, null) };
const fellLine = (n: number) => (n === 1 ? '1 fell here today.' : `${n} fell here today.`);
let played: RunResult | null = null;
/** Resolves true once the day's run is stored; a carving waits on it (§15.1: play never waits on the network). */
let runSaved: Promise<boolean> = Promise.resolve(false);

const finish = (ended: End) => {
  const title = ended.kind === 'won' ? `Floor ${state.floor.depth} cleared` : 'You fell';
  if (!live) {
    if (state.floor.depth === 0 && !store.get(F0_KEY)) void api.start({ depth: 0 }).catch(() => undefined); // tutorial seen, on the server
    store.set(F0_KEY, '1');
    // After Floor 0, the day's floor is the next thing (no dead ends), unless it is already played or out of reach.
    const next = playable && !played ? { label: `Descend to Floor ${playable.depth}`, run: () => play(playable.floor, playable) } : { label: 'Descend again', run: () => play(floor, null) };
    return endPanel(end, { title, line: endLine(ended, state.turn), primary: next });
  }
  const save = saveLine();
  sendRun(live, save);
  if (ended.kind === 'dead') return pickCarving(title, endLine(ended, state.turn, trapOwner()) + linksLine(state.dealt), save, live.depth);
  pickCurse(title, endLine(ended, state.turn) + linksLine(state.dealt), save, live.depth);
};

/**
 * Victory, step 1 of 2: the curse vote (select, then Vote; Skip moves on). Like a carving, it waits for the run to be
 * stored, because only a stored win may vote. The standings appear only after you have voted.
 */
function pickCurse(title: string, line: string, save: ReturnType<typeof saveLine>, depth: number, then = () => pickTrap(save, depth)) {
  let choice: Curse | null = null;
  const picker = cursePicker((c) => {
    choice = c;
    vote.disabled = !c;
  });
  const doVote = async () => {
    if (!choice) return;
    const curse = choice;
    vote.disabled = picker.disabled = true;
    if (!(await whenStored(save, () => void doVote()))) return;
    const r = await submit(() => api.vote({ depth, curse }), (st) => save.set(st, () => void doVote()));
    if (r?.kind === 'closed') return closed(depth, r.today, r.todayUrl);
    if (r) then();
  };
  const vote = endPanel(end, {
    title, line: `${line} Pick tomorrow's curse.`, body: [picker], status: save.node,
    primary: { label: 'Vote', run: () => void doVote(), disabled: true },
    secondary: { label: 'Skip', run: then },
  });
}

/** Victory, step 2 of 2: a trap for tomorrow, zone and kind (select both, then Set trap; Skip ends). Hidden from everyone. */
function pickTrap(save: ReturnType<typeof saveLine>, depth: number) {
  let pick: { zone: number; kind: keyof typeof TRAP_TEXT } | null = null;
  const picker = trapPicker((zone, kind) => {
    pick = zone !== null && kind ? { zone, kind } : null;
    set.disabled = !pick;
  });
  const doSet = async () => {
    if (!pick) return;
    const t = pick;
    set.disabled = true;
    if (!(await whenStored(save, () => void doSet()))) return;
    const r = await submit(() => api.trap({ depth, ...t }), (st) => save.set(st, () => void doSet()));
    if (r?.kind === 'closed') return closed(depth, r.today, r.todayUrl);
    if (r) void result();
  };
  const set = endPanel(end, {
    title: 'Set a trap for tomorrow', line: 'Only you will know where.', body: [picker], status: save.node,
    primary: { label: 'Set trap', run: () => void doSet(), disabled: true },
    secondary: { label: 'Skip', run: () => void runSaved.then(() => result()) },
  });
}

/** A choice made after the run waits until the run is stored: one resend if it isn't, then "Not saved" with a retry. */
async function whenStored(save: ReturnType<typeof saveLine>, retry: () => void): Promise<boolean> {
  if (!(await runSaved) && live) sendRun(live, save);
  if (await runSaved) return true;
  save.set('failed', retry);
  return false;
}

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
    if (!(await whenStored(save, () => void doCarve()))) return;
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
  plate = r;
  setGhosts(withPending(r.depth, r.ghosts));
  flushVotes(r.depth);
  const ended: End = { kind: r.run.outcome, cause: r.run.cause };
  const title = r.run.outcome === 'won' ? `Floor ${r.depth} cleared` : `You fell on Floor ${r.depth}`;
  const line = `Score ${r.run.score}. ${endLine(ended, r.run.turns, r.run.outcome === 'dead' ? (mine?.by ? `A trap set by u/${mine.by}` : null) : null)}${boss ? '' : linksLine(r.run.dealt)}`;
  const c = r.choices;
  const body: Node[] = [
    ...(r.myTrap ? [el('p', 'own-ghost', trapNews(r.myTrap))] : []),
    ...(mine ? [ownGhost(mine)] : []),
    ...(c.curse ? [el('p', 'own-ghost', `Your curse vote: ${CURSE_TEXT[c.curse].name}. ${(c.standings ?? []).map(([k, n]) => `${CURSE_TEXT[k].name} ${n}`).join(' · ')}`)] : []),
    ...(c.trap ? [el('p', 'own-ghost', `Your trap: ${TRAP_TEXT[c.trap.kind]}, ${ZONE_NAMES[c.trap.zone]?.toLowerCase()}`)] : []),
  ];
  // The already-played screen: your wisp on the map, the streak, the live count (polled), the countdown, then more.
  body.unshift(miniMap(r.floor.rows, r.ghosts.tiles.map(([x, y]) => ({ x, y, mine: !!mine && mine.x === x && mine.y === y }))));
  const fellNow = el('span', 'plate__fell', fellLine(r.ghosts.fell));
  const clock = el('span', 'plate__clock', '');
  body.push(el('p', 'plate__meta', `Streak ${r.streak} floor${r.streak === 1 ? '' : 's'} · `, fellNow, ' · ', clock));
  boss = r.boss ?? null;
  const bossNow = el('div', 'plate__boss');
  if (boss) body.push(wardenPlate(bossNow, boss));
  const links = el('div', 'plate__links');
  const others = shown.list.filter((g) => g.carving && !g.mine).length;
  const link = (label: string, cls: string, go: () => void) => {
    const b = button(label, cls);
    b.addEventListener('click', go);
    links.append(b);
  };
  if (others) link(`Carvings (${others})`, 'carvings__open', () => carvingsPanel(r.depth));
  const back = { label: 'Back', run: () => void result(plate ?? undefined) };
  link('Board', 'board__open', () => void boardPanel(end, r.depth, back));
  link('Chronicle', 'chronicle__open', () => void chroniclePanel(end, back, killerName));
  body.push(links);
  // While the floor is live, the next unfinished choice is the plate's one primary action.
  const won = r.run.outcome === 'won';
  const next: PanelAction | null = !r.live ? null
    : won && !c.curse ? { label: 'Vote on a curse', run: () => pickCurse(title, line, saveLine(), r.depth, () => void result()) }
    : won && !c.trap ? { label: 'Set a trap', run: () => pickTrap(saveLine(), r.depth) }
    : mine && !mine.carving ? { label: 'Carve', run: () => pickCarving(title, line, saveLine(), r.depth) }
    : null;
  endPanel(end, { title, line, body, primary: next ?? practice, ...(next ? { secondary: practice } : {}) });
  watch(r.depth, r.nextAt, fellNow, clock, bossNow); // after the plate is in the page: the clock stops once it leaves
}
let plate: (FloorResponse & { kind: 'played' }) | null = null;

/**
 * The plate's live parts: the countdown to the next floor (each second) and the ghost count, polled every BOARD.pollMs
 * only while the plate shows and the tab is visible (§15.3), asking for the counts alone.
 */
let watching = 0;
/** The plate's Warden line: its chain and your links, or who killed it; redrawn when the poll brings new numbers. */
function wardenPlate(root: HTMLElement, b: BossView) {
  root.replaceChildren(...(b.killer ? [el('p', 'intro__boss', `The Warden fell to u/${b.killer}.`)] : [chainMeter(b.hp, b.pool)]), ...(b.you ? [el('p', 'muted', linksLine(b.you).trim())] : []));
  return root;
}
function watch(depth: number, nextAt: number, fell: HTMLElement, clock: HTMLElement, bossNow: HTMLElement) {
  clearInterval(watching);
  let ticks = 0;
  const tick = () => {
    if (end.hidden || !document.body.contains(clock)) return clearInterval(watching);
    const left = Math.max(0, nextAt - Date.now());
    const h = Math.floor(left / 3_600_000), m = Math.floor((left % 3_600_000) / 60_000), sec = Math.floor((left % 60_000) / 1000);
    clock.textContent = left ? `next floor in ${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s` : 'the next floor is opening';
    if (++ticks % (BOARD.pollMs / 1000) === 0 && !document.hidden)
      void api.pulse(depth).then((p) => {
        fell.textContent = fellLine(p.fell);
        if (p.boss) wardenPlate(bossNow, (boss = p.boss)); // A47: live HP rides the same visible-only poll
      }, () => undefined);
  };
  tick();
  watching = window.setInterval(tick, 1000);
}

/** After your run: the floor's carvings, each opening its card with Trust and Liar. */
function carvingsPanel(depth: number) {
  const list = carvingsList(shown.list.filter((g) => !g.mine), (g) => openCard(g, () => carvingsPanel(depth)));
  endPanel(end, { title: `Carvings on Floor ${depth}`, line: 'Trust them, or call out a liar. Votes are final.', body: [list], primary: { label: 'Back', run: () => void result(plate ?? undefined) } });
}

// ---- carving votes: optimistic on the card, kept in a local queue until the server has answered (offline-safe) ----
const pendingKey = (depth: number) => `descent:votes:${depth}`;
const pending = (depth: number): Record<string, Vote> => {
  try {
    return JSON.parse(store.get(pendingKey(depth)) ?? '{}');
  } catch {
    return {};
  }
};
/** Your unsent votes laid over the server's view, so the card and list show them at once. */
function withPending(depth: number, view: GhostView): GhostView {
  const p = pending(depth);
  return { ...view, list: view.list.map((g) => {
    const v = p[g.id];
    return v && !g.myVote && g.votes ? { ...g, myVote: v, votes: { ...g.votes, [v]: g.votes[v] + 1 } } : g;
  }) };
}
function flushVotes(depth: number) {
  for (const [ghost, vote] of Object.entries(pending(depth))) {
    void submit(() => api.vote({ depth, ghost, vote }), () => undefined).then((r) => {
      if (!r) return; // still offline: it stays queued for the next load
      const left = pending(depth);
      delete left[ghost];
      store.set(pendingKey(depth), JSON.stringify(left));
    });
  }
}
function castVote(depth: number, g: Ghost, vote: Vote) {
  store.set(pendingKey(depth), JSON.stringify({ ...pending(depth), [g.id]: vote }));
  setGhosts(withPending(depth, shown));
  const now = shown.list.find((x) => x.id === g.id);
  if (now) openCard(now, afterCard);
  flushVotes(depth);
}
const ownGhost = (g: Ghost) => el('p', 'own-ghost', g.carving ? `Your ghost: ${carvingLabel(g.carving)}` : 'Your ghost left no carving.');

/** Start (or restart) a floor. `real` set: the day's floor, logged and resumed from its saved log. */
function play(f: Floor, real: Day | null) {
  floor = f;
  live = real && liveOf(real);
  again();
  if (live && state.turn === 0 && !state.ended) intro();
}

function again() {
  end.hidden = true;
  end.classList.remove('end--clear', 'end--intro');
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

/** Today's danger per compass zone, counted from the stored floor itself (hazards and enemies), for the intro. */
const DANGER = '^Oo,_giKGYxFSuZs';
const dangerOf = (f: Floor) => {
  const z = Array<number>(9).fill(0);
  f.rows.forEach((row, y) => [...row].forEach((c, x) => DANGER.includes(c) && (z[zoneOf({ x, y }, f.rows.length)] = (z[zoneOf({ x, y }, f.rows.length)] ?? 0) + 1)));
  return z;
};
const killerName = (k: string) => KILL_FAMILY[k] ?? (k === 'trap' ? 'player traps' : `the ${k}`);
const zoneName = (z: number) => ZONE_NAMES[z]?.toLowerCase() ?? '';

/**
 * The intro (replaces Phase 8's yesterday line): before your first move on the day's floor. It reads today's stored
 * floor, not only yesterday's tally: the compass shows where the crowd died and where today's danger actually is, so a
 * displaced effect says where the hazards went. One action, Descend (splash Descend + this = two taps to your first move).
 */
function intro() {
  const f = state.floor;
  const y = f.yesterday;
  const danger = dangerOf(f);
  const deaths = y?.deaths ?? null;
  const fell = deaths ? deaths.reduce((a, b) => a + b, 0) : (y?.fell ?? 0);
  const hz = danger.indexOf(Math.max(...danger));
  const lines: string[] = [];
  if (!y) lines.push('The first floor. Nobody has fallen yet.');
  else if (fell < 3) lines.push(`Only ${fell} fell on Floor ${y.depth}: too few to move anything.`);
  else {
    lines.push(`${y.fell} fell on Floor ${y.depth}${y.zone === null ? '' : `, most in the ${zoneName(y.zone)}`}; ${y.cleared} cleared it.`);
    if (y.zone !== null && Math.max(...danger) > 0 && hz !== y.zone) lines.push(`Today's danger gathered in the ${zoneName(hz)}.`);
    if (y.killer) lines.push(`Top killer: ${killerName(y.killer)}.`);
  }
  const traps = f.traps?.length ?? 0;
  if (traps) lines.push(`Survivors set ${traps} trap${traps === 1 ? '' : 's'} here.`);
  const news = trapNews(playable?.myTrap ?? null);
  if (news) lines.push(news);
  const fresh = f.showcase?.[0];
  const curse = f.curses?.[0];
  // Phase 10: on the Warden's floor its chain leads the intro: alive (and whether it came back wounded), or fallen.
  const warden: Node[] = !boss ? [] : boss.killer
    ? [el('p', 'intro__boss', `The Warden fell to u/${boss.killer}.`), el('p', 'intro__line', 'Its arena is quiet. The stairs are open.')]
    : [
        el('p', 'intro__boss', boss.carried ? 'The Warden returns, still wounded.' : 'The Warden waits, chained.'),
        chainMeter(boss.hp, boss.pool),
        el('p', 'intro__line', 'Bump it to break a link. Stairs are open.'),
      ];
  endPanel(end, {
    title: `Floor ${f.depth}`,
    line: curse ? `Cursed: ${CURSE_TEXT[curse].name}, ${CURSE_TEXT[curse].effect}.` : 'No curse today.',
    body: [
      ...warden,
      introCompass(deaths, danger),
      el('p', 'intro__legend muted', deaths ? '☠ fell yesterday · ▲ danger today' : '▲ danger today'),
      ...lines.map((t) => el('p', 'intro__line', t)),
      ...(fresh ? [el('p', 'intro__new', `New today: ${fresh}.`)] : []),
    ],
    primary: { label: 'Descend', run: () => (end.hidden = true) },
  });
  end.classList.add('end--intro');
}

/**
 * The line under the HUD (aria-live): a nearby carving (no input needed), else a low torch. A torch event takes the line
 * on the turn it happens; on every other turn a nearby carving wins.
 */
function nearby() {
  const near = shown.list.filter((g) => g.carving && reach(g) <= 1);
  const g = near[0];
  if (!g?.carving || (torchTurn === state.turn && lowTorch(state.torch))) {
    carvingLine.replaceChildren(el('span', '', state.torch > 0 ? `Torch low: ${state.torch} turns of light left.` : 'Torch out: the dark is taking your hearts.'));
    carvingLine.hidden = !!state.ended || !lowTorch(state.torch);
    return;
  }
  const read = button('Read');
  read.addEventListener('click', () => openCard(g));
  carvingLine.replaceChildren(el('span', '', `${g.name ? `u/${g.name}` : NAMELESS}: ${carvingLabel(g.carving)}${near.length > 1 ? ` (+${near.length - 1})` : ''}`), read);
  carvingLine.hidden = false;
}

let afterCard: (() => void) | undefined;
/** The ghost card: tap a wisp or press Read. The snoovatar loads only now; the wisp stays if there is none. */
function openCard(g: Ghost, onClose?: () => void) {
  const avatar = el('div', 'ghost-card__img', iconCanvas('wisp', 4));
  // The snoovatar and the lifetime record load only now (A36): lifetime numbers minus today's votes on today's carving.
  const record = el('dl', 'ghost-card__record');
  const known = state.floor.depth > 0 && !devFloor && !g.id.startsWith('floor0:') && !g.id.startsWith('tile:');
  if (known)
    void api.card(g.id, state.floor.depth).then(({ avatar: url, record: r }) => {
      if (r) record.replaceChildren(...([['Deaths', r.deaths], ['Trusted', r.trust], ['Liar', r.liar]] as const).map(([k, v]) => el('div', '', el('dt', '', k), el('dd', '', String(v)))));
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
    afterCard?.();
  };
  afterCard = onClose;
  // Votes: only on the day's floor, never on Floor 0's scripted ghosts or your own; open once your run there has ended.
  const real = state.floor.depth > 0 && !devFloor && !!g.carving && !g.mine;
  const ended = plate !== null && plate.depth === state.floor.depth;
  const depth = state.floor.depth;
  const votes = !real ? undefined
    : !ended ? { canVote: false, note: 'Vote after your run.' }
    : { canVote: !!plate?.live, ...(g.votes ? { totals: g.votes } : {}), ...(g.myVote ? { mine: g.myVote } : {}), onVote: (v: Vote) => castVote(depth, g, v) };
  cardRoot.replaceChildren(ghostCard({ name: g.name, carving: g.carving ? carvingLabel(g.carving) : null, cause: g.by ? `trap set by u/${g.by}` : g.cause, avatar, ...(votes ? { votes } : {}), onClose: close }));
  cardRoot.querySelector('.ghost-card__text')?.append(record);
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
    openCard(shown.list.find((g) => g.x === t.x && g.y === t.y) ?? { id: `tile:${t.x},${t.y}`, name: null, x: t.x, y: t.y, cause: `${tile[2]} deaths`, carving: null });
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
// day.kind === 'practice': a "Post Floor 0" post simply plays Floor 0, which is already loaded.
else if (state.ended) finish(state.ended); // resumed onto a finished run: show it and (re)submit, which is a safe retry
else if (live && state.turn === 0) intro(); // a fresh run on the day's floor starts at the intro

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
  /** Open a listed ghost's card by id (as a tap or Read would). */
  card: (id: string) => void;
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
    card: (id) => {
      const g = shown.list.find((x) => x.id === id);
      if (g) openCard(g);
    },
  };
}
