/// <reference types="vite/client" />
// Boot, input router, HUD wiring and the dev hook. Rules live in src/shared/sim.ts; this file only sends actions.
import { BOARD, CURSE_TEXT, floorName, WARDEN, FLOOR_0, FLOOR_0_GHOSTS, HEARTS, ITEMS, KILL_FAMILY, NAMELESS, PALETTE, TILE, TEACH_TEXT, TORCH_LOW_PCT, TRAPS, TRAP_TEXT, ZONE_NAMES, type Curse } from '../shared/content';
import { find, slitLine, zoneOf } from '../shared/grid';
import { context, navigateTo, showLoginPrompt } from '@devvit/web/client';
import type { BossView, FloorResponse, GhostView, MyTrap, RunResult } from '../shared/api';
import { carvingLabel, type Ghost, type Vote } from '../shared/ghosts';
import { isAction, replay, start, step, type Action, type End, type Event, type Floor, type Pos, type Tell } from '../shared/sim';
import { api, clientClass, report, submit, watchErrors, where } from './net';
import { journey } from './journey';
import { lesson, taught } from './teach';
import { mapPlate } from './map';
import { sound } from './sound';
import { iconCanvas, loadPack, packIcon, shownTells } from './sprites';
import { button, carvingPicker, carvingsList, chainMeter, controls, createHud, cursePicker, el, endPanel, ghostCard, introCompass, saveLine, trapPicker, type PanelAction } from './ui';
import { miniMap } from './minimap';
import { boardPanel, chroniclePanel } from './screens';

// Phase 11b: where a load's time goes, ms from page start (sent with the load beacon; nothing else).
const stages = { script: performance.now(), floor: 0, engine: 0, intro: 0 };
/** The intro can show before the scene exists: Descend then waits for it (set once the scene is ready). */
const boot = { up: false, descend: false };
/** The loading flame gives way; its "Still dark?" line leaves the page with it (Phase 11g: out of every tree once unused). */
function hideBoot() {
  document.getElementById('boot')?.setAttribute('hidden', '');
  document.querySelector('.boot__slow')?.remove();
}
function descend() {
  journey.start(); // Phase 11c: the committed action that begins a run's journey
  if (boot.up) {
    end.hidden = true;
    return;
  }
  boot.descend = true;
  const b = end.querySelector<HTMLButtonElement>('.btn--primary');
  if (b) {
    b.textContent = 'Lighting the torch…';
    b.disabled = true;
  }
}
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
const FILL_COLS = 8; // the torch's reach (4) each side of the hero, less half a tile at the edges
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
stages.floor = performance.now();
// Phase 10b (A57, A58): beacons and reports say which floor and which screen; nothing about the device beyond its class.
where.depth = day !== 'error' && 'depth' in day && typeof day.depth === 'number' ? day.depth : 0;
where.screen = () => (end.hidden ? 'run' : end.classList.contains('end--intro') ? 'intro' : 'plate');
watchErrors();
/** Reddit's modmail compose, pre-filled: floor, screen and client class. One tap opens it, one sends it. */
const reportUrl = (screen: string) =>
  `https://www.reddit.com/message/compose?to=${encodeURIComponent(`/r/${context?.subredditName ?? 'descent_game_dev'}`)}&subject=${encodeURIComponent(`Descent: something broke (Floor ${where.depth})`)}&message=${encodeURIComponent(`Floor ${where.depth}, ${screen}, ${clientClass()}.\n\nWhat happened:\n`)}`;
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
if (day !== 'error' && (day.kind === 'play' || day.kind === 'played')) taught(day.hints);
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
/**
 * Phase 11d (blind playtest): a turn's news under the HUD. What hurt you and the hearts left; that a dark room burns the torch
 * faster (once per floor); that picking up an item left the one you held. Words only: the rules are untouched.
 */
// `keep`: a hit or a lesson stays a turn longer and beats a torch notice.
let notice: { turn: number; text: string; keep?: true } | null = null;
const ITEM_WORD: Record<string, string> = { potion: 'potion', oil: 'lamp oil', bomb: 'bomb' };
const HURT_BY: Record<string, string> = { gate: 'A closing gate', trap: 'A trap', spikes: 'Spikes', dart: 'A dart', arrow: 'An arrow', dark: 'The dark', pit: 'The fall', warden: 'The Warden', goblin: 'A goblin', imp: 'An imp', skeleton: 'A skeleton', bomb: 'The blast' };
// Phase 11e (second blind playtest): what your own action did, so a kill, a bomb or an item is never silent.
const USED: Record<string, string> = { potion: 'The potion gave back a heart.', oil: 'The lamp oil feeds your torch.', bomb: 'The bomb went off: everything beside you is cleared.' };
function noticeOf(events: readonly Event[], prev: typeof state, s: typeof state): { turn: number; text: string; keep?: true } | null {
  const hurt = events.find((e) => e.t === 'hurt');
  if (hurt && s.hearts > 0) return { turn: s.turn, keep: true, text: `${HURT_BY[hurt.cause] ?? 'Something'} hit you: ${s.hearts} ${s.hearts === 1 ? 'heart' : 'hearts'} left.` }; // beats a torch notice
  const taughtNow = lesson(s, events); // Phase 11f: the first time each thing is met, once per player
  if (taughtNow) return { turn: s.turn, keep: true, text: TEACH_TEXT[taughtNow] };
  const got = events.find((e) => e.t === 'pickup');
  if (got && prev.item && prev.item !== got.item) return { turn: s.turn, text: `You took the ${ITEM_WORD[got.item] ?? got.item}; your ${ITEM_WORD[prev.item] ?? prev.item} is left here.` };
  if (events.some((e) => e.t === 'kept')) return { turn: s.turn, text: 'Your hearts are full: the potion stays in your pack.' }; // Phase 11g: no turn passes
  const used = events.find((e) => e.t === 'use');
  if (used) return { turn: s.turn, text: USED[used.item] ?? '' };
  const kind = (id: number) => prev.enemies.find((e) => e.id === id)?.kind;
  for (const e of events) {
    if (e.t === 'collapse') return { turn: s.turn, text: 'The skeleton crumbles. It will rise again.' };
    if (e.t === 'kill' && kind(e.id)) return { turn: s.turn, text: `The ${kind(e.id) === 'warden' ? 'Warden' : kind(e.id)} is slain.` };
  }
  return null;
}
let torchTurn = -1;
let lastHurt: string | null = null; // the dev hook's view of the last turn
let pack: HTMLCanvasElement | null = null;
void loadPack().then((p) => {
  pack = p;
  view();
});
const hud = createHud($('hud'), TORCH_LOW_PCT, HEARTS, (item) => (pack ? packIcon(pack, ITEMS[item].frames[0], 2) : undefined));
// Phase 11 (A63): sound starts on the first tap or key in the game; the mute sits in the HUD, in plain sight, remembered.
let lastSound: string | null = null;
addEventListener('pointerdown', () => sound.unlock(), { once: true });
addEventListener('keydown', () => sound.unlock(), { once: true });
const mute = button('', 'hud__mute');
const showMute = () => {
  mute.textContent = sound.muted ? 'Muted' : 'Sound';
  mute.setAttribute('aria-pressed', String(!sound.muted));
  mute.setAttribute('aria-label', sound.muted ? 'Sound is off: turn it on' : 'Sound is on: mute it');
};
mute.addEventListener('click', () => {
  sound.toggle();
  showMute();
  mute.blur(); // Space is Wait: a focused mute must not toggle on the next turn
});
showMute();
$('hud').append(mute);
const view = () => {
  const curse = state.floor.curses?.[0];
  // During a live run on the Warden's floor the chain counts down with your own bumps (its HP when the run began, less yours).
  const chain = boss && live && !state.ended && state.enemies.some((e) => e.kind === 'warden') ? Math.max(0, boss.hp - state.dealt) : null;
  hud({ hearts: state.hearts, hasKey: state.hasKey, item: pack ? state.item : null, torch: state.torch, torchMax: state.floor.torch, depth: state.floor.depth, curse: curse ? CURSE_TEXT[curse].name : null, chain, mine: chain === null ? 0 : state.dealt });
  // A torch event (crossing low, reaching zero) owns the line under the HUD on the turn it happens.
  if ((!lowTorch(lastTorch) && lowTorch(state.torch)) || (lastTorch > 0 && state.torch <= 0)) torchTurn = state.turn;
  lastTorch = state.torch;
  nearby();
};
controls(pad, () => openMap());
view();

const fit = () => {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  let zoom = Math.max(2, Math.min(4, Math.floor(Math.min(w, h) / (MIN_TILES * TILE))));
  // Phase 11e: a floor shorter than a tall stage is zoomed in (whole steps, so pixels stay crisp) until it fills the
  // height, as long as FILL_COLS columns still show across (a blind tester saw a thin band in a tall black screen).
  const mapH = state.floor.rows.length * TILE;
  while (zoom < 4 && mapH * zoom < h && w >= FILL_COLS * TILE * (zoom + 1)) zoom += 1;
  const cols = Math.max(1, Math.floor(w / (TILE * zoom)));
  const rows = Math.max(1, Math.floor(h / (TILE * zoom)));
  return { width: cols * TILE, height: rows * TILE, zoom };
};

// Phase 11b: a fresh run's intro is a panel: it shows as soon as the floor is here, with Phaser and the atlas loading
// behind it. Descend tapped before the scene is up says so and goes through the moment it is.
if (!devFloor && playable && live && state.turn === 0 && !state.ended) {
  intro();
  hideBoot();
}
const [Phaser, { DescentScene }] = await engine;
stages.engine = performance.now();
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
const refit = () => {
  const s = fit();
  game.scale.resize(s.width, s.height);
  game.scale.setZoom(s.zoom);
};
addEventListener('resize', refit);
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
  const one = t.kind === 'dart'; // "spikes" and "false stairs" are plural, a dart slit is one
  return t.hurt || t.killed ? `Your ${name} hurt ${t.hurt} and took ${t.killed} here.` : `Your ${name} ${one ? 'waits' : 'wait'} here; nobody has stepped on ${one ? 'it' : 'them'} yet.`;
}
const practice: PanelAction = { label: 'Practice Floor 0', run: () => play(FLOOR_0, null) };

// ---- Phase 11d: practice. A floor played again where nothing counts: no run, ghost, vote, trap, board entry, soul, streak,
// funnel step or journey event is sent (the run never leaves this page). Its ghosts and carvings show, read-only. ----
let practising: { depth: number; back: () => void; ghosts: GhostView } | null = null;
let replayPlate = false;
const practiceTag = $('practice');
/** Practise a floor: today's from its result card (after your run), a past one from the Chronicle. */
function practise(depth: number, f: Floor, ghosts: GhostView, back: () => void) {
  practising = { depth, back, ghosts };
  journey.end(plate?.run.outcome === 'won', plate?.run.score ?? 0); // a real run's journey never spans practice
  play(f, null);
  practiceTag.hidden = false;
}
function leavePractice() {
  if (!practising) return;
  const { back } = practising;
  practising = null;
  practiceTag.hidden = true;
  replayPlate = true; // the card's map shows your real run again, not the practice
  back();
}
practiceTag.querySelector('button')?.addEventListener('click', leavePractice);
/** A past floor's practice, fetched only when asked (nothing loads for a player who never practises). */
async function practisePast(depth: number, back: () => void) {
  const r = await api.practice(depth).catch(() => null);
  if (!r || r.kind !== 'practice') return endPanel(end, { title: 'Practice', line: r?.reason === 'play it first' ? 'Play today\'s floor first; then you can practise it.' : "Can't open that floor. Try again.", primary: { label: 'Back', run: back } });
  practise(r.depth, r.floor, r.ghosts, back);
}
const fellLine = (n: number) => (n === 1 ? '1 fell here today.' : `${n} fell here today.`);
let played: RunResult | null = null;
/** Resolves true once the day's run is stored; a carving waits on it (§15.1: play never waits on the network). */
let runSaved: Promise<boolean> = Promise.resolve(false);

/** Phase 11g: a day's floor by name (Floor 0 has none). */
function nameOf(f: Floor) {
  return f.depth > 0 && f.seed !== undefined ? floorName(f.seed) : null;
}

const finish = (ended: End) => {
  const title = ended.kind === 'won' ? `Floor ${state.floor.depth} cleared` : 'You fell';
  if (practising) {
    const p = practising;
    return endPanel(end, {
      title: ended.kind === 'won' ? `Practice: Floor ${p.depth} cleared` : 'Practice: you fell',
      line: `${endLine(ended, state.turn)} Practice: nothing was saved.`,
      primary: { label: 'Practice again', run: () => play(state.floor, null) },
      secondary: { label: 'Leave practice', run: leavePractice },
    });
  }
  if (!live) {
    const first = state.floor.depth === 0 && !store.get(F0_KEY);
    if (first) void api.start({ depth: 0 }).catch(() => undefined); // tutorial seen, on the server
    store.set(F0_KEY, '1');
    // Phase 11c: a newcomer's first clear goes straight on to the day's intro (no panel, no tap in between).
    if (first && ended.kind === 'won' && playable && !played) return play(playable.floor, playable);
    // After Floor 0, the day's floor is the next thing (no dead ends), unless it is already played or out of reach.
    const next = playable && !played ? { label: `Descend to Floor ${playable.depth}`, run: () => play(playable.floor, playable) } : { label: 'Descend again', run: () => play(floor, null) };
    return endPanel(end, { title, line: endLine(ended, state.turn), primary: next });
  }
  // Phase 11c: one result card. While the run saves, the card shows what happened and its save status (a failed save offers
  // Retry here); once stored, the full card replaces it, and carving, the curse vote and the trap are optional steps from it.
  journey.progress(1, ended.kind === 'won' ? 'won' : 'fell');
  const save = saveLine();
  afterSave = () => void result();
  sendRun(live, save);
  const line = endLine(ended, state.turn, ended.kind === 'dead' ? trapOwner() : null) + linksLine(state.dealt);
  endPanel(end, { kicker: nameOf(state.floor), title, line, status: save.node, clear: ended.kind === 'dead', primary: { label: 'Saving your run…', run: () => undefined, disabled: true } });
  if (ended.kind === 'dead') keepHeroInView();
};
/** What happens once the run is stored (the result card), set by finish() for the run it sent; a retry keeps it. */
let afterSave: (() => void) | null = null;

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
    if (r?.kind === 'voted') journey.interaction('voted');
    if (r) then();
  };
  const vote = endPanel(end, {
    title, line: `${line} Pick tomorrow's curse.`, body: [picker], status: save.node,
    primary: { label: 'Vote', run: () => void doVote(), disabled: true },
    secondary: { label: 'Skip', run: then },
  });
}

/** Victory, step 2 of 2: a trap for tomorrow, zone and kind (select both, then Set trap; Skip ends). Hidden from everyone. */
function pickTrap(save: ReturnType<typeof saveLine>, depth: number, skip: () => void = () => void runSaved.then(() => result())) {
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
    if (r?.kind === 'placed') journey.interaction('trap_set');
    if (r) void result();
  };
  const set = endPanel(end, {
    title: 'Set a trap for tomorrow', line: 'Only you will know where.', body: [picker], status: save.node,
    primary: { label: 'Set trap', run: () => void doSet(), disabled: true },
    secondary: { label: 'Skip', run: skip },
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
    if (r?.kind === 'saved') {
      played = r.run;
      const then = afterSave;
      afterSave = null;
      then?.();
    }
    if (r?.kind === 'closed') closed(l.depth, r.today, r.todayUrl);
    return r?.kind === 'saved';
  });
}

/**
 * The carving picker, on the death panel and (while the floor is live) on the result plate: Carve is primary, Skip
 * secondary. The panel leaves the map undimmed and the camera lifts, so the tile where you fell and its neighbours stay in
 * view; the chosen glyph previews on that tile. A carving made before the run is saved waits for it.
 */
function pickCarving(title: string, line: string, save: ReturnType<typeof saveLine>, depth: number, skip: () => void = () => void runSaved.then(() => result())) {
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
    if (r?.kind === 'carved') journey.interaction('carved');
    if (r) void result();
  };
  const carve = endPanel(end, {
    title, line, body: [picker], status: save.node, clear: true,
    primary: { label: 'Carve', run: () => void doCarve(), disabled: true },
    secondary: { label: 'Skip', run: skip },
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
  if (state.floor.depth !== r.depth || replayPlate) {
    replayPlate = false;
    // The plate's map is the day's floor: your run replayed if this device kept its log, else you stand on your ghost.
    floor = r.floor;
    live = null;
    const log = store.get(logKey(r));
    state = log ? replay(floor, [...log].filter(isAction)) : start(floor);
    if (mine && !log) state = { ...state, pos: { x: mine.x, y: mine.y } };
    scene.reset(state);
    refit();
  }
  plate = r;
  setGhosts(withPending(r.depth, r.ghosts));
  flushVotes(r.depth);
  const ended: End = { kind: r.run.outcome, cause: r.run.cause };
  const title = r.run.outcome === 'won' ? `Floor ${r.depth} cleared` : `You fell on Floor ${r.depth}`;
  const what = endLine(ended, r.run.turns, r.run.outcome === 'dead' ? (mine?.by ? `A trap set by u/${mine.by}` : null) : null);
  const line = `Score ${r.run.score}. ${what}${boss ? '' : linksLine(r.run.dealt)}`;
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
  // Phase 11e: the card shows its primary, Practice and one link (the carvings to judge, else the Board); the rest sit
  // behind one native "More" disclosure (a blind tester counted six buttons).
  const links = el('div', 'plate__links');
  const moreList = el('div', 'plate__links');
  const more = el('details', 'plate__more', el('summary', 'btn', 'More'), moreList);
  const others = shown.list.filter((g) => g.carving && !g.mine).length;
  const link = (label: string, cls: string, go: () => void, shown = false) => {
    const b = button(label, cls);
    b.addEventListener('click', go);
    (shown ? links : moreList).append(b);
  };
  if (others) link(`Carvings (${others})`, 'carvings__open', () => carvingsPanel(r.depth), true);
  const back = { label: 'Back', run: () => void result(plate ?? undefined) };
  link('Board', 'board__open', () => void boardPanel(end, r.depth, back), !others);
  const toChronicle = () => void chroniclePanel(end, back, killerName, (d) => void practisePast(d, toChronicle));
  link('Chronicle', 'chronicle__open', toChronicle);
  // Phase 10b: depth as flair is opt-in (A55); a broken thing is two taps from modmail (A58).
  let flairOn = !!r.flair;
  const flairLabel = () => `Depth as flair: ${flairOn ? 'On' : 'Off'}`;
  link(flairLabel(), 'flair__toggle', () => {
    const b = moreList.querySelector('.flair__toggle');
    void api.flair(!flairOn).then((f) => {
      flairOn = f.on;
      if (b) {
        b.textContent = flairLabel();
        b.setAttribute('aria-pressed', String(flairOn));
      }
    }, () => undefined);
  });
  moreList.querySelector('.flair__toggle')?.setAttribute('aria-pressed', String(flairOn));
  link('Something broke?', 'report__open', () => go(reportUrl('result plate')));
  // Phase 11c: the post's comments, one tap from the card (the crowd talks there).
  const comments = context?.postId ? `https://www.reddit.com/comments/${context.postId.replace(/^t3_/, '')}` : null;
  if (comments) link('Comments', 'comments__open', () => go(comments));
  links.append(more);
  body.push(links);
  // While the floor is live, the next unfinished choice is the plate's one primary action.
  const won = r.run.outcome === 'won';
  // Phase 11c: each is an optional step from the card; a step skipped this visit leaves the order, so the next one comes up.
  const skipTo = (step: string) => () => {
    skipped.add(step);
    void result();
  };
  const next: PanelAction | null = !r.live ? null
    : won && !c.curse && !skipped.has('curse') ? { label: 'Vote on a curse', run: () => pickCurse(title, what, saveLine(), r.depth, skipTo('curse')) }
    : won && !c.trap && !skipped.has('trap') ? { label: 'Set a trap', run: () => pickTrap(saveLine(), r.depth, skipTo('trap')) }
    : mine && !mine.carving && !skipped.has('carve') ? { label: 'Carve', run: () => pickCarving(title, what, saveLine(), r.depth, skipTo('carve')) }
    : null;
  // An old floor's plate points on to today's (A61); a live one offers its next choice, then practice.
  const onward: PanelAction | null = r.todayUrl ? { label: `Go to Floor ${r.today}`, run: () => go(r.todayUrl ?? null) } : null;
  // With nothing left to choose, the next step is the conversation: the comments become the primary (and leave the links).
  const talk: PanelAction | null = comments ? { label: 'See the comments', run: () => go(comments) } : null;
  const first = next ?? onward ?? talk ?? practice;
  if (first === talk) moreList.querySelector('.comments__open')?.remove();
  // Phase 11d: the floor you just played, again, where nothing counts (never before your own run: you are on its card).
  const practiceAgain: PanelAction = { label: 'Practice this floor', run: () => practise(r.depth, r.floor, r.ghosts, () => void result()) };
  endPanel(end, { kicker: nameOf(r.floor), title, line, body, primary: first, secondary: practiceAgain });
  if (!next) journey.end(r.run.outcome === 'won', r.run.score); // Phase 11c: the run's journey closes once no choice is left
  watch(r.depth, r.nextAt, fellNow, clock, bossNow); // after the plate is in the page: the clock stops once it leaves
}
let plate: (FloorResponse & { kind: 'played' }) | null = null;
/** Steps skipped from the result card on this visit (they stop being offered as its next step). */
const skipped = new Set<string>();

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
  refit();
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
  shown = state.floor.depth === 0 ? SCRIPTED : devFloor ? NONE : practising ? practising.ghosts : g;
  scene.setGhosts(shown);
  nearby();
}
/** Steps from the hero, diagonals counting one: 1 is on or next to. */
const reach = (p: Pos) => Math.max(Math.abs(p.x - state.pos.x), Math.abs(p.y - state.pos.y));

// Function declarations, not consts: the intro can run before Phaser arrives (Phase 11b), above where these are written.
/** Today's danger per compass zone, counted from the stored floor itself (hazards and enemies), for the intro. */
function dangerOf(f: Floor) {
  const danger = '^Oo,_giKGYxFSuZs';
  const z = Array<number>(9).fill(0);
  f.rows.forEach((row, y) => [...row].forEach((c, x) => danger.includes(c) && (z[zoneOf({ x, y }, f.rows.length)] = (z[zoneOf({ x, y }, f.rows.length)] ?? 0) + 1)));
  return z;
}
function killerName(k: string) {
  return KILL_FAMILY[k] ?? (k === 'trap' ? 'player traps' : `the ${k}`);
}
function zoneName(z: number) {
  return ZONE_NAMES[z]?.toLowerCase() ?? '';
}

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
  if (!y) lines.push(state.floor.depth === 1 ? 'The first floor. Nobody has fallen yet.' : 'Nobody fell here yesterday.');
  else if (fell === 0) lines.push(`Nobody fell on Floor ${y.depth}, so nothing moved.`);
  else if (fell < 3) lines.push(`Only ${fell} fell on Floor ${y.depth}: too few to move anything.`);
  else {
    lines.push(`${y.fell} fell on Floor ${y.depth}${y.zone === null ? '' : `, most in the ${zoneName(y.zone)}`}; ${y.cleared} cleared it.`);
    if (y.zone !== null && Math.max(...danger) > 0 && hz !== y.zone) lines.push(`Today's danger gathered in the ${zoneName(hz)}.`);
    if (y.killer) lines.push(`Top killer: ${killerName(y.killer)}.`);
  }
  // Phase 11e: the day's torch budget, said before the first move (Floor 0's practice torch is more generous).
  lines.unshift(`Torch: ${state.torch} turns of light today${store.get(F0_KEY) ? ` (practice gave ${FLOOR_0.torch})` : ''}.`);
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
        el('p', 'intro__line', `Walk into it: each bump breaks one link (${WARDEN.perRun} a run at most). Everyone today shares this chain; when it breaks, the Warden falls for all. Take the stairs whenever you like: your links count either way.`),
      ];
  endPanel(end, {
    kicker: nameOf(f),
    title: `Floor ${f.depth}`,
    line: curse ? `Cursed: ${CURSE_TEXT[curse].name}, ${CURSE_TEXT[curse].effect}.` : 'No curse today.',
    body: [
      ...warden,
      el('h2', 'intro__compass-title', 'Danger on this floor, by area'),
      introCompass(deaths, danger, boss && !boss.killer ? arenaZone(f) : null, zoneOf(state.pos, f.rows.length)),
      el('p', 'intro__legend muted', `${deaths ? '☠ fell yesterday · ' : ''}▲ danger today · red frame: most danger`),
      ...lines.map((t) => el('p', 'intro__line', t)),
      ...(fresh ? [el('p', 'intro__new', `New today: ${fresh}.`)] : []),
    ],
    primary: { label: 'Descend', run: descend },
  });
  end.classList.add('end--intro');
  stages.intro ||= performance.now();
}

/** Phase 11f: the Warden's arena on the intro compass, and which way it lies from you (eight compass points). */
function wardenAt(f: Floor) {
  return find(f.rows, 'W')[0] ?? null;
}
function arenaZone(f: Floor) {
  const w = wardenAt(f);
  return w ? zoneOf(w, f.rows.length) : null;
}
/** The way to a 2×2 block from `from`: a component counts only past the block's own edge, so it doesn't flip as you close in. */
function wayTo(from: Pos, to: Pos) {
  const side = (d: number) => (d > 1 ? 1 : d < 0 ? -1 : 0); // the block covers offsets 0 and 1
  return ['north-west', 'north', 'north-east', 'west', '', 'east', 'south-west', 'south', 'south-east'][side(to.x - from.x) + 1 + 3 * (side(to.y - from.y) + 1)] ?? '';
}

/**
 * The line under the HUD (aria-live): a nearby carving (no input needed), else a low torch. A torch event takes the line
 * on the turn it happens; on every other turn a nearby carving wins.
 */
/** A wind-up frame on the hero's own tile. */
function onYou(t: Tell) {
  return t.kind === 'windup' && t.x === state.pos.x && t.y === state.pos.y;
}
function nearby() {
  const near = shown.list.filter((g) => g.carving && reach(g) <= 1);
  const g = near[0];
  // Phase 11g: standing on a Warden mark beats every other line (two blind testers were hit by marks they didn't notice).
  if (!state.ended && shownTells(state).some((t) => onYou(t) && t.cause === 'warden')) {
    carvingLine.replaceChildren(el('span', '', 'The Warden strikes this tile next turn: step off it.'));
    carvingLine.hidden = false;
    return;
  }
  // Phase 11d: what just happened, said on the turn it happened (a torch event first, then this, then a carving).
  if (notice && state.turn - notice.turn <= (notice.keep ? 1 : 0) && !state.ended && (notice.keep || !(torchTurn === state.turn && lowTorch(state.torch)))) {
    carvingLine.replaceChildren(el('span', '', notice.text));
    carvingLine.hidden = false;
    return;
  }
  if (!g?.carving || (torchTurn === state.turn && lowTorch(state.torch))) {
    // Phase 10b (A61): a newcomer's Floor 0 says it is practice, and what it opens, so the day's post doesn't look skipped.
    const practiceFirst = !lowTorch(state.torch) && state.floor.depth === 0 && playable;
    // Phase 11e: on a Warden floor, until your first link breaks, the goal in plain words.
    if (!lowTorch(state.torch) && !state.ended && boss && !boss.killer && live && state.dealt === 0 && state.enemies.some((e) => e.kind === 'warden')) {
      const w = wardenAt(state.floor);
      const way = w ? wayTo(state.pos, w) : '';
      carvingLine.replaceChildren(el('span', '', `The Warden is ${way ? `to the ${way}` : 'right beside you'}: bump it for links. Stairs any time.`));
      carvingLine.hidden = false;
      return;
    }
    const burn = Math.max(1, state.torch - step(state, 'W').state.torch); // Phase 11g: count turns, not torch, in a dark room
    carvingLine.replaceChildren(el('span', '', practiceFirst ? (state.turn < 8 ? 'Practice first: find the stairs.' : 'Practice is generous: real floors give less torch, and its items stay here.') : state.torch > 0 ? `Torch low: ${Math.ceil(state.torch / burn)} turns of light left${burn > 1 ? ` (this room burns ${burn} a turn)` : ''}.` : 'Torch out: the dark is taking your hearts.'));
    carvingLine.hidden = !!state.ended || (!practiceFirst && !lowTorch(state.torch));
    return;
  }
  const read = button('Read');
  read.addEventListener('click', () => openCard(g));
  carvingLine.replaceChildren(el('span', '', `${g.name ? `u/${g.name}` : NAMELESS}: ${carvingLabel(g.carving)}${near.length > 1 ? ` (+${near.length - 1})` : ''}`), read);
  carvingLine.hidden = false;
}

/** Phase 11f: the map overview in the card overlay. Not an action: no turn passes, nothing is logged. */
function openMap() {
  if (!cardRoot.hidden || !end.hidden) return;
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const r = stage.getBoundingClientRect();
  const close = () => {
    cardRoot.hidden = true;
    cardRoot.replaceChildren();
    back?.focus();
  };
  cardRoot.replaceChildren(mapPlate(state, { width: Math.min(r.width, 560) - 64, height: Math.max(120, r.height - 120) }, close));
  cardRoot.hidden = false;
  cardRoot.querySelector<HTMLButtonElement>('.map__close')?.focus();
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
  const real = state.floor.depth > 0 && !devFloor && !practising && !!g.carving && !g.mine; // practice: read-only
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
    if (!panel || !hero) return;
    // Measured with any earlier lift applied (the saving card's), so both sums add it back. The tile below the hero clears
    // the panel; a 4 px margin only where the tile above can still clear the HUD.
    const was = scene.lifted();
    const need = hero.bottom + hero.size - panel.top + was;
    const ceiling = Math.max($('hud').getBoundingClientRect().bottom, stage.querySelector('canvas')?.getBoundingClientRect().top ?? 0);
    const room = hero.top - hero.size - ceiling + was;
    scene.lift(Math.max(0, Math.min(need + 4, Math.max(need, room))));
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
  const prev = state;
  const r = step(state, a);
  // Only actions that change state are logged: a free bump would make a log unbounded, and the server rejects one.
  if (live && r.state !== state) {
    if (!live.log) {
      void api.start({ depth: live.depth }).catch(() => undefined);
      journey.start(); // a resumed or intro-less run starts its journey on its first move
      journey.progress(0.1, 'run_started');
    }
    live.log += a;
    store.set(logKey(live), live.log);
  }
  state = r.state;
  notice = noticeOf(r.events, prev, state) ?? (notice?.keep && state.turn - notice.turn <= 1 ? notice : null); // before view(); a hit stays a turn longer
  view();
  if (r.events.some((e) => e.t === 'hurt')) stopRepeat();
  lastSound = sound.play(r.events);
  lastHurt = r.events.find((e) => e.t === 'hurt')?.cause ?? null;
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
    if (e.key === 'Escape' || ((e.key === 'm' || e.key === 'M') && cardRoot.querySelector('.map__close'))) cardRoot.querySelector<HTMLButtonElement>('.ghost-card__close, .map__close')?.click();
    return; // reading a card never moves the hero
  }
  if ((e.key === 'm' || e.key === 'M') && end.hidden && !e.repeat) return openMap();
  const a = KEYS[e.key];
  if (!a || !end.hidden) return;
  if (document.activeElement instanceof HTMLElement && document.activeElement.closest('#hud, #practice')) document.activeElement.blur();
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
if (day === 'error') endPanel(end, { title: 'The way down is dark', line: "Can't reach the dungeon. Try again.", primary: { label: 'Retry', run: () => location.reload() }, secondary: { label: 'Something broke?', run: () => go(reportUrl('cannot reach')) } });
else if (day.kind === 'login') endPanel(end, { title: 'Log in to descend', line: `Floor ${day.depth}: one run a day, kept under your name.`, primary: { label: 'Log in', run: () => showLoginPrompt() } });
else if (day.kind === 'closed') closed(day.depth, day.today, day.todayUrl);
else if (day.kind === 'played') void result(day);
else if (day.kind === 'none' && !devFloor) endPanel(end, { title: 'No floor yet', line: 'The first floor opens soon.', primary: practice });
// day.kind === 'practice': a "Post Floor 0" post simply plays Floor 0, which is already loaded.
else if (state.ended) finish(state.ended); // resumed onto a finished run: show it and (re)submit, which is a safe retry
else if (live && state.turn === 0 && !stages.intro) intro(); // a fresh run on the day's floor starts at the intro (unless already up)

// Phase 11e: on a Warden floor the shared chain moves during your run too: the same visible-only 20 s poll as the plate.
if (boss)
  window.setInterval(() => {
    if (!live || !boss || boss.killer || !end.hidden || document.hidden) return;
    void api.pulse(live.depth).then((p) => {
      if (p.boss) {
        boss = p.boss; // the server's HP, which doesn't hold this run's links yet: the HUD subtracts them
        view();
      }
    }, () => undefined);
  }, BOARD.pollMs);
void scene.ready.then(() => {
  hideBoot(); // A64: the flame gives way to the floor
  boot.up = true;
  if (boot.descend) end.hidden = true; // Descend was tapped while the scene loaded
  journey.ready();
  performance.mark('descent:interactive');
  const ms = Math.round(performance.now());
  stages.intro ||= ms; // no intro on this visit (a plate, Floor 0): the first panel is the game itself
  if (!devFloor) report({ kind: 'load', depth: where.depth, ms, client: clientClass(), stages }); // A57, stages: Phase 11b
});

// ---- dev hook for Playwright (§10). Dev builds only; never in the Devvit bundle. ----
type DescentHook = {
  ready: Promise<void>;
  state: () => { pos: Pos; hearts: number; torch: number; turn: number; floor: number; ended: End | null; hasKey: boolean; item: string | null; enemies: { id: number; mode: string; x: number; y: number }[] };
  act: (a: Action) => Promise<void>;
  /** Floor 0 (with test options), a scene by id, or a generated floor (depth > 0, opts.seed). */
  load: (depth: number | string, opts?: { mercy?: boolean; torch?: number; seed?: number }) => void;
  skipAnim: (on: boolean) => void;
  /** Phase 11g: a wind-up frame is drawn on your tile now; what hurt you on the last turn (null: nothing). */
  frame: () => boolean;
  lastHurt: () => string | null;
  /** Every scene's id and action log, for e2e checks that replay them by keyboard or taps. */
  scenes: () => { id: string; log: Action[]; hurt: [number, string][] }[];
  metrics: () => { inputToMotion: number; shakes: number; hitStops: number; sound: string | null; muted: boolean };
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
    frame: () => shownTells(state).some(onYou),
    lastHurt: () => lastHurt,
    scenes: () => SCENES.map((s) => ({ id: s.id, log: [...s.log], hurt: s.hurt.map(([n, c]): [number, string] => [n, c]) })),
    metrics: () => ({ inputToMotion, shakes: scene.shakes, hitStops: scene.hitStops, sound: lastSound, muted: sound.muted }),
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
