import {
  CURSE_MIN_RADIUS,
  CURSES,
  DARK,
  GOBLIN_HP,
  GOBLINS,
  HEARTS,
  IMPS,
  ITEMS,
  MECHANISMS,
  PACK_RADIUS,
  PIT_DAMAGE,
  PIT_DROP,
  PITS,
  RUN,
  SCORE,
  SKELETONS,
  SPIKES,
  TORCH_LOW_PCT,
  TORCH_LOW_RADIUS,
  TORCH_OUT_DRAIN,
  TORCH_OUT_RADIUS,
  TORCH_RADIUS,
  TRAPS,
  type Curse,
  type Family,
  type Item,
  type Tier,
} from './content';
import { DIRS, bfs, blocks, dist, find, hazard, isPit, lineOfSight, nearest, ray, same, setTile, slitLine, tileAt, width, type Pos } from './grid';
import { rand } from './rng';

export type Action = 'U' | 'D' | 'L' | 'R' | 'W' | 'I';
export type { Pos };
export type Rect = { x: number; y: number; w: number; h: number };
/** `tiers`: each family's tier on this floor (default 1). `dark`: dark rooms, laid over the tiles. */
export type Floor = {
  depth: number;
  rows: readonly string[];
  torch: number;
  mercy: boolean;
  seed?: number;
  tiers?: Partial<Record<Family, Tier>>;
  dark?: readonly Rect[];
  /** Active curses (the crowd's vote); content.ts holds what each one changes. */
  curses?: readonly Curse[];
  /** Phase 8: the players' traps placed on this floor (tile, kind, owner), so a death names its trap's owner from the floor alone. */
  traps?: readonly PlacedTrap[];
  /** Phase 8: what yesterday's floor left: how many fell and cleared, the deadliest compass zone, today's curse. */
  yesterday?: { depth: number; fell: number; cleared: number; zone: number | null; curse: Curse | null; deaths?: readonly number[]; killer?: string | null };
  /** Phase 9: the family introduced or raised today (the intro's "new today" line). */
  showcase?: readonly Family[];
};
export type PlacedTrap = { x: number; y: number; kind: 'spikes' | 'dart' | 'stairs'; owner: string; name: string | null };
export type Kind = 'goblin' | 'imp' | 'skeleton';
export type Mode = 'idle' | 'alert' | 'chase' | 'windup' | 'pile';
/** `aim`: the tiles a wind-up will strike next turn. `timer`: a bone pile's countdown. `pack`: lowest id of its pack. */
export type Enemy = { id: number; kind: Kind; x: number; y: number; hp: number; mode: Mode; aim: readonly Pos[]; timer: number; pack: number };
/** A timed gate's countdown. */
export type Clock = { x: number; y: number; left: number };
export type End = { kind: 'won' | 'dead'; cause: string };
export type State = {
  floor: Floor;
  tiles: readonly string[];
  pos: Pos;
  hearts: number;
  torch: number;
  turn: number;
  hasKey: boolean;
  item: Item | null;
  seen: readonly number[];
  enemies: readonly Enemy[];
  clocks: readonly Clock[];
  /** mulberry32 state: the only randomness in a run. */
  rng: number;
  nextId: number;
  /** Turns spent with the torch out. */
  darkTurns: number;
  ended: End | null;
};
export type Event =
  | { t: 'move'; from: Pos; to: Pos }
  | { t: 'blocked'; at: Pos }
  | { t: 'locked'; at: Pos }
  | { t: 'door'; at: Pos }
  | { t: 'key'; at: Pos }
  | { t: 'attack'; id: number; at: Pos }
  | { t: 'kill'; id: number; at: Pos }
  | { t: 'alert'; id: number }
  | { t: 'enemyMove'; id: number; from: Pos; to: Pos }
  | { t: 'windup'; id: number }
  | { t: 'enemyAttack'; id: number; at: Pos }
  | { t: 'collapse'; id: number; at: Pos }
  | { t: 'rebuild'; id: number }
  | { t: 'spawn'; id: number; at: Pos }
  | { t: 'shot'; from: Pos; to: Pos; cause: string }
  | { t: 'fall'; at: Pos; to: Pos }
  | { t: 'pickup'; item: Item; at: Pos }
  | { t: 'use'; item: Item }
  | { t: 'bomb'; at: Pos }
  | { t: 'light'; at: Pos }
  | { t: 'gate'; at: Pos; open: boolean }
  | { t: 'hurt'; amount: number; cause: string; at: Pos }
  | { t: 'torchOut' }
  | { t: 'won' }
  | { t: 'dead'; cause: string };
export type TellKind =
  | 'spikes-up' | 'spikes-half' | 'crack' | 'pit' | 'crumble' | 'cracking' | 'mortar' | 'missing-step'
  | 'slit' | 'armed' | 'gate' | 'windup' | 'alert' | 'rebuild' | 'spawn' | 'hungry' | 'dark';
/** Something the player can read now; `cause` names the damage it warns of. */
export type Tell = { kind: TellKind; x: number; y: number; cause: string };

type Hit = { amount: number; cause: string; at: Pos };

const ITEM_AT: Record<string, Item> = { p: 'potion', l: 'oil', b: 'bomb' };
const ITEM_CHAR: Record<Item, string> = { potion: 'p', oil: 'l', bomb: 'b' };
export const tierOf = (s: { floor: Floor }, f: Family): Tier => s.floor.tiers?.[f] ?? 1;
/** The summed effect of the floor's curses on one number. */
export const curse = (f: Floor, key: 'radiusDelta' | 'wakeDelta' | 'heartsDelta'): number => (f.curses ?? []).reduce((v, c) => v + CURSES[c][key], 0);
const inside = (r: Rect, p: Pos): boolean => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;


/** 0 down, 1 half-raised (rises next turn), 2 up. Fixed spikes and Trapsetter spikes are always up; buried ones are down. */
export function spikeStage(s: State, x: number, y: number, turn = s.turn): 0 | 1 | 2 {
  const c = tileAt(s.tiles, x, y);
  if (c === 'x') return 2;
  if (c !== '^') return 0;
  const t = SPIKES[tierOf(s, 'spikes')];
  if (!t.period) return 2;
  const k = (((turn - t.rowShift * y) % t.period) + t.period) % t.period;
  return k === 0 ? 2 : k === t.period - 1 ? 1 : 0;
}

/** The unlit dark room the position is in, if any. A lit brazier ends its room's darkness. */
function darkRoom(s: State, p: Pos): Rect | undefined {
  return s.floor.dark?.find((r) => inside(r, p) && !find(s.tiles, 'y').some((b) => inside(r, b)));
}

export function lightRadius(state: State): number {
  if (state.torch <= 0) return TORCH_OUT_RADIUS;
  if (darkRoom(state, state.pos)) return DARK[tierOf(state, 'dark')].radius;
  const base = state.torch * 100 <= state.floor.torch * TORCH_LOW_PCT ? TORCH_LOW_RADIUS : TORCH_RADIUS;
  return Math.max(Math.min(base, CURSE_MIN_RADIUS), base + curse(state.floor, 'radiusDelta'));
}

function lit(state: State): number[] {
  const w = width(state.tiles), r = lightRadius(state), { pos } = state;
  const out: number[] = [];
  state.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const dx = x - pos.x, dy = y - pos.y;
      out[y * w + x] = dx * dx + dy * dy <= r * r && lineOfSight(state.tiles, pos, { x, y }) ? 1 : 0;
    }
  });
  return out;
}

const withSeen = (state: State): State => {
  const now = lit(state);
  return { ...state, seen: now.map((v, i) => (v || state.seen[i] ? 1 : 0)) };
};

/** Per tile (index y*w+x): 0 unseen, 1 remembered, 2 lit. */
export function visibility(state: State): number[] {
  return lit(state).map((v, i) => (v ? 2 : state.seen[i] ? 1 : 0));
}

export function start(floor: Floor): State {
  let pos: Pos = { x: 0, y: 0 };
  const enemies: Enemy[] = [];
  const KINDS: Record<string, Kind> = { g: 'goblin', i: 'imp', K: 'skeleton' };
  floor.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x] ?? '';
      if (c === '@') pos = { x, y };
      const kind = KINDS[c];
      if (!kind) continue;
      const id = enemies.length;
      // Packs: same kind within PACK_RADIUS of an earlier one joins that one's pack.
      const mate = enemies.find((e) => e.kind === kind && dist(e, { x, y }) <= PACK_RADIUS);
      enemies.push({ id, kind, x, y, hp: GOBLIN_HP, mode: 'idle', aim: [], timer: 0, pack: mate ? mate.pack : id });
    }
  });
  const buried = SPIKES[floor.tiers?.spikes ?? 1].buried;
  const tiles = floor.rows.map((row) => row.replace(/[@giK]/g, '.').replace(/\^/g, buried ? 'u' : '^'));
  return withSeen({
    floor, tiles, pos, hearts: HEARTS + curse(floor, 'heartsDelta'), torch: floor.torch, turn: 0, hasKey: false, item: null, seen: [], enemies,
    clocks: [], rng: (floor.seed ?? 0) >>> 0, nextId: enemies.length, darkTurns: 0, ended: null,
  });
}

/** A working copy that one step() may mutate; the caller's state is never touched. */
type Draft = Omit<State, 'tiles' | 'enemies' | 'clocks' | 'pos'> & { tiles: string[]; enemies: Enemy[]; clocks: Clock[]; pos: Pos };

export function step(state: State, action: Action): { state: State; events: Event[] } {
  if (state.ended) return { state, events: [] };
  const d: Draft = {
    ...state, tiles: [...state.tiles], enemies: state.enemies.map((e) => ({ ...e })), clocks: state.clocks.map((c) => ({ ...c })), pos: { ...state.pos },
  };
  const events: Event[] = [];
  const hits: Hit[] = [];
  const from = state.pos;
  const put = (p: Pos, c: string) => (d.tiles = setTile(d.tiles, p.x, p.y, c));
  // A bone pile is floor for everyone (rule 6): only standing enemies block, take blows or stop darts.
  const enemyAt = (p: Pos) => d.enemies.find((e) => e.mode !== 'pile' && same(e, p));
  const free = (p: Pos) => !same(d.pos, p) && !enemyAt(p);
  const kill = (e: Enemy) => {
    d.enemies = d.enemies.filter((o) => o.id !== e.id);
    events.push({ t: 'kill', id: e.id, at: { x: e.x, y: e.y } });
  };
  /** A pile counts down at the end of each enemy turn; one that falls before its own turn gets +1 so it reads `rebuild` turns. */
  const collapse = (e: Enemy, acted = false) => {
    const t = SKELETONS[tierOf(d, 'skeletons')];
    const mate = t.shared ? d.enemies.find((o) => o.id !== e.id && o.pack === e.pack && o.mode === 'pile') : undefined;
    Object.assign(e, { mode: 'pile', aim: [], timer: mate ? mate.timer : t.rebuild + (acted ? 0 : 1) });
    events.push({ t: 'collapse', id: e.id, at: { x: e.x, y: e.y } });
  };
  /** Damage to an enemy: skeletons fall into a pile, everything else dies. */
  const harm = (e: Enemy) => (e.kind === 'skeleton' ? e.mode !== 'pile' && collapse(e) : kill(e));
  /** A dart or arrow flies along `line` and hits the first creature in it. */
  const shoot = (origin: Pos, line: readonly Pos[], cause: string) => {
    let end: Pos | null = null;
    for (const p of line) {
      end = p;
      if (same(p, d.pos)) {
        hits.push({ amount: 1, cause, at: p });
        break;
      }
      const e = enemyAt(p);
      if (e) {
        harm(e);
        break;
      }
    }
    if (end) events.push({ t: 'shot', from: origin, to: end, cause });
  };
  const fall = (at: Pos) => {
    hits.push({ amount: PIT_DAMAGE, cause: 'pit', at });
    const to = landing(d, at);
    d.pos = to;
    events.push({ t: 'fall', at, to });
  };

  // 1. Player acts.
  if (action === 'I') {
    const item = d.item;
    if (!item) return { state, events: [] };
    d.item = null;
    events.push({ t: 'use', item });
    if (item === 'potion') d.hearts = Math.min(HEARTS, d.hearts + ITEMS.potion.heal);
    if (item === 'oil') {
      d.torch = Math.min(d.floor.torch, d.torch + ITEMS.oil.turns);
      d.darkTurns = 0;
    }
    if (item === 'bomb') {
      const r = ITEMS.bomb.radius;
      const near = (p: Pos) => Math.abs(p.x - d.pos.x) <= r && Math.abs(p.y - d.pos.y) <= r;
      events.push({ t: 'bomb', at: { ...d.pos } });
      for (const e of d.enemies.filter(near)) kill(e); // skeletons included: a bombed skeleton never rebuilds
      for (const p of find(d.tiles, '^ux')) if (near(p)) put(p, '.');
    }
  } else if (action !== 'W') {
    const dir = DIRS.find((x) => x.a === action);
    const to = { x: d.pos.x + (dir?.dx ?? 0), y: d.pos.y + (dir?.dy ?? 0) };
    const c = tileAt(d.tiles, to.x, to.y);
    const target = enemyAt(to);
    if (target) {
      events.push({ t: 'attack', id: target.id, at: to });
      if (target.kind === 'skeleton') collapse(target);
      else if (--target.hp <= 0) kill(target);
    } else if (c === 'D') {
      if (!d.hasKey) return { state, events: [{ t: 'locked', at: to }] };
      events.push({ t: 'door', at: to });
      put(to, '/');
      d.hasKey = false;
    } else if (c === 'Y') {
      events.push({ t: 'light', at: to });
      put(to, 'y');
    } else if (blocks(c)) {
      return { state, events: [{ t: 'blocked', at: to }] };
    } else {
      events.push({ t: 'move', from, to });
      d.pos = to;
      const item = ITEM_AT[c];
      if (c === 'k') {
        events.push({ t: 'key', at: to });
        d.hasKey = true;
        put(to, '.');
      } else if (item) {
        events.push({ t: 'pickup', item, at: to });
        put(to, d.item ? ITEM_CHAR[d.item] : '.');
        d.item = item;
      } else if (c === 'G') put(to, '.');
      else if (c === 'O') fall(to);
      else if (c === 'o') {
        put(to, 'O');
        fall(to);
      } else if (c === 'F') {
        put(to, '.');
        hits.push({ amount: 1, cause: 'trap', at: to });
      }
    }
  }
  d.turn = state.turn + 1;
  const turn = d.turn;
  const pressed = same(d.pos, from) || tileAt(d.tiles, d.pos.x, d.pos.y) !== '_' ? null : d.pos;

  // 2. Mechanisms tick.
  const mech = MECHANISMS[tierOf(d, 'mechanisms')];
  const fired: Pos[] = [];
  for (const p of find(d.tiles, 'sz')) {
    const plate = tileAt(d.tiles, p.x, p.y) === 's';
    shoot(p, slitLine(d.tiles, p, plate ? mech.range : TRAPS.dart.range), plate ? 'dart' : 'trap');
    put(p, plate ? 'S' : 'Z');
    fired.push(p);
  }
  for (const c of d.clocks) {
    c.left = Math.max(0, c.left - 1);
    if (c.left === 0 && free(c)) {
      put(c, 'H');
      events.push({ t: 'gate', at: { x: c.x, y: c.y }, open: false });
    }
  }
  d.clocks = d.clocks.filter((c) => tileAt(d.tiles, c.x, c.y) === 'h');
  if (pressed) {
    const target = nearest(d.tiles, pressed, mech.plate === 'dart' ? 'S' : mech.plate === 'close' ? 'h' : mech.plate === 'timed' ? 'Hh' : 'H');
    if (target && mech.plate === 'dart') put(target, 's');
    else if (target && mech.plate === 'close') {
      if (free(target)) {
        put(target, 'H');
        events.push({ t: 'gate', at: target, open: false });
      }
    } else if (target) {
      if (tileAt(d.tiles, target.x, target.y) === 'H') events.push({ t: 'gate', at: target, open: true });
      put(target, 'h');
      if (mech.plate === 'timed') d.clocks = [...d.clocks.filter((c) => !same(c, target)), { ...target, left: mech.turns }];
    }
  }
  for (const p of find(d.tiles, 'Z')) {
    if (!fired.some((f) => same(f, p)) && slitLine(d.tiles, p, TRAPS.dart.range).some((q) => same(q, d.pos))) put(p, 'z');
  }
  for (const p of find(d.tiles, 'u')) if (dist(p, d.pos) === 1) put(p, '^');
  const pits = PITS[tierOf(d, 'pits')];
  for (const p of find(d.tiles, ';')) {
    put(p, 'O');
    if (same(p, d.pos)) fall(p);
  }
  const under = tileAt(d.tiles, d.pos.x, d.pos.y);
  if (pits.crumble === 'stand' && under === ',') put(d.pos, ';');
  if (pits.crumble === 'leave' && !same(d.pos, from) && tileAt(d.tiles, from.x, from.y) === ',') put(from, 'O');
  const den = GOBLINS[tierOf(d, 'goblins')].den;
  if (den && turn % den === 0) {
    for (const p of find(d.tiles, 'G')) {
      if (!free(p)) continue;
      const id = d.nextId++;
      d.enemies.push({ id, kind: 'goblin', x: p.x, y: p.y, hp: GOBLIN_HP, mode: 'idle', aim: [], timer: 0, pack: id });
      events.push({ t: 'spawn', id, at: p });
    }
  }
  // Spikes hurt when you step onto raised ones, or when they rise under you.
  const here = tileAt(d.tiles, d.pos.x, d.pos.y);
  if ((here === '^' || here === 'x') && spikeStage(d, d.pos.x, d.pos.y) === 2) {
    if (!same(d.pos, from) || spikeStage(d, d.pos.x, d.pos.y, turn - 1) !== 2) hits.push({ amount: 1, cause: here === 'x' ? 'trap' : 'spikes', at: { ...d.pos } });
  }

  // 3. Enemies act in id order.
  const woke: number[] = [];
  const litNow = d.enemies.some((e) => e.kind === 'imp') ? lit(d) : [];
  const w = width(d.tiles);
  const walker = (c: string) => !blocks(c) && !hazard(c) && c !== 'G';
  const flier = (c: string) => !blocks(c);
  const moveTo = (e: Enemy, p: Pos) => {
    events.push({ t: 'enemyMove', id: e.id, from: { x: e.x, y: e.y }, to: p });
    e.x = p.x;
    e.y = p.y;
  };
  const windup = (e: Enemy, aim: readonly Pos[]) => {
    Object.assign(e, { mode: 'windup', aim });
    events.push({ t: 'windup', id: e.id });
  };
  /** Greedy step toward `goal`: larger axis first, then the other; never onto the player or another enemy. */
  const greedy = (e: Enemy, goal: Pos, pass: (c: string) => boolean): Pos | null => {
    const dx = goal.x - e.x, dy = goal.y - e.y;
    const xs = { x: e.x + Math.sign(dx), y: e.y }, ys = { x: e.x, y: e.y + Math.sign(dy) };
    for (const p of Math.abs(dx) >= Math.abs(dy) ? [xs, ys] : [ys, xs]) {
      if (same(p, e) || !pass(tileAt(d.tiles, p.x, p.y)) || !free(p)) continue;
      return p;
    }
    return null;
  };
  /** Shortest-path step toward the player over `pass` tiles. */
  const pathStep = (e: Enemy, pass: (c: string) => boolean): Pos | null => {
    const far = bfs(d.tiles, d.pos, pass);
    let best: Pos | null = null, bestD = -1;
    for (const { dx, dy } of DIRS) {
      const p = { x: e.x + dx, y: e.y + dy };
      const v = far[p.y * w + p.x] ?? -1;
      if (v < 0 || !free(p) || (bestD >= 0 && v >= bestD)) continue;
      best = p;
      bestD = v;
    }
    return best;
  };
  /** Imps fly erratically: any step that closes the distance, the seeded rng breaking ties. */
  const flutter = (e: Enemy): Pos | null => {
    const steps = DIRS.map(({ dx, dy }) => ({ x: e.x + dx, y: e.y + dy })).filter(
      (p) => dist(p, d.pos) < dist(e, d.pos) && flier(tileAt(d.tiles, p.x, p.y)) && free(p),
    );
    if (steps.length < 2) return steps[0] ?? null;
    const [v, next] = rand(d.rng);
    d.rng = next;
    return steps[v % steps.length] ?? null;
  };
  const strike = (e: Enemy) => {
    const at = e.aim[0];
    if (e.kind === 'skeleton' && SKELETONS[tierOf(d, 'skeletons')].range) shoot({ x: e.x, y: e.y }, e.aim, 'arrow');
    else if (e.kind === 'imp' && IMPS[tierOf(d, 'imps')].dive) {
      // The dive flies its line through the aimed tile and lands past it. Only the aimed tile is hurt (the rest is
      // flight path), so one step off it dodges, even in a corridor. A taken landing tile: it stops on the aimed tile.
      const line = at ? ray(d.tiles, e, at, IMPS[tierOf(d, 'imps')].dive) : [];
      if (at && same(at, d.pos)) hits.push({ amount: 1, cause: 'imp', at });
      const land = line[line.length - 1];
      const stop = land && free(land) ? land : at && free(at) ? at : null;
      if (at) events.push({ t: 'enemyAttack', id: e.id, at });
      if (stop && !same(stop, e)) moveTo(e, stop);
    } else if (at) {
      events.push({ t: 'enemyAttack', id: e.id, at });
      if (same(at, d.pos)) hits.push({ amount: 1, cause: e.kind, at });
    }
  };
  const wakes = (e: Enemy): boolean => {
    if (e.kind === 'imp') {
      const t = IMPS[tierOf(d, 'imps')];
      return t.wake === 'light' ? litNow[e.y * w + e.x] === 1 || dist(e, d.pos) <= curse(d.floor, 'wakeDelta') : dist(e, d.pos) <= t.wakeDist + curse(d.floor, 'wakeDelta');
    }
    const sight = e.kind === 'goblin' ? GOBLINS[tierOf(d, 'goblins')].sight : SKELETONS[tierOf(d, 'skeletons')].sight;
    return dist(e, d.pos) <= sight + curse(d.floor, 'wakeDelta') && lineOfSight(d.tiles, e, d.pos);
  };
  const packWakes = (e: Enemy) => (e.kind === 'goblin' ? GOBLINS[tierOf(d, 'goblins')].packWake : e.kind === 'imp' && IMPS[tierOf(d, 'imps')].packWake);

  const chase = (e: Enemy) => {
    if (e.kind === 'goblin') {
      const t = GOBLINS[tierOf(d, 'goblins')];
      const steps = t.starve && turn % t.starve === 0 ? 2 : 1;
      for (let k = 0; k < steps; k++) {
        // A flanker keeps circling to its tile before it winds up.
        const goal = t.flank ? flankGoal(e) : d.pos;
        const ready = dist(e, d.pos) === 1;
        if (ready && (same(goal, d.pos) || same(goal, e))) return windup(e, [{ ...d.pos }]);
        const p = greedy(e, goal, walker);
        if (!p) return ready ? windup(e, [{ ...d.pos }]) : undefined;
        moveTo(e, p);
      }
      return;
    }
    if (e.kind === 'imp') {
      const t = IMPS[tierOf(d, 'imps')];
      if (t.dive) {
        const aligned = e.x === d.pos.x || e.y === d.pos.y;
        if (aligned && dist(e, d.pos) <= t.diveRange && ray(d.tiles, e, d.pos, dist(e, d.pos)).length === dist(e, d.pos)) {
          return windup(e, [{ ...d.pos }]); // it marks only the tile it aims at
        }
        // Line up with you on the closer axis, otherwise close in.
        const dx = d.pos.x - e.x, dy = d.pos.y - e.y;
        const toLine = !aligned ? (Math.abs(dx) <= Math.abs(dy) ? { x: e.x + Math.sign(dx), y: e.y } : { x: e.x, y: e.y + Math.sign(dy) }) : null;
        const p = toLine && flier(tileAt(d.tiles, toLine.x, toLine.y)) && free(toLine) ? toLine : greedy(e, d.pos, flier);
        if (p) moveTo(e, p);
        return;
      }
      for (let k = 0; k < t.steps; k++) {
        if (dist(e, d.pos) === 1) return windup(e, [{ ...d.pos }]);
        const p = flutter(e);
        if (!p) return;
        moveTo(e, p);
      }
      return;
    }
    const t = SKELETONS[tierOf(d, 'skeletons')];
    if (t.range) {
      // Archer: line up with your row, then shoot along it.
      if (e.y === d.pos.y && Math.abs(e.x - d.pos.x) <= t.range && ray(d.tiles, e, d.pos, dist(e, d.pos)).length === dist(e, d.pos)) {
        return windup(e, ray(d.tiles, e, d.pos, t.range));
      }
      const v = { x: e.x, y: e.y + Math.sign(d.pos.y - e.y) };
      const p = e.y !== d.pos.y && walker(tileAt(d.tiles, v.x, v.y)) && free(v) ? v : greedy(e, d.pos, walker);
      if (p) moveTo(e, p);
      return;
    }
    if (dist(e, d.pos) === 1) return windup(e, [{ ...d.pos }]);
    const p = t.avoid ? pathStep(e, walker) : greedy(e, d.pos, (c) => !blocks(c) && !isPit(c) && c !== 'G' && c !== 'F');
    if (!p) return;
    moveTo(e, p);
    const c = tileAt(d.tiles, p.x, p.y);
    if ((c === '^' || c === 'x') && spikeStage(d, p.x, p.y) === 2) collapse(e, true);
  };
  /** A flanker heads for the tile on your far side from its pack leader. */
  const flankGoal = (e: Enemy): Pos => {
    const lead = d.enemies.find((o) => o.pack === e.pack && o.id !== e.id && o.id < e.id);
    if (!lead) return d.pos;
    const dx = d.pos.x - lead.x, dy = d.pos.y - lead.y;
    const g = Math.abs(dx) >= Math.abs(dy) ? { x: d.pos.x + Math.sign(dx), y: d.pos.y } : { x: d.pos.x, y: d.pos.y + Math.sign(dy) };
    return walker(tileAt(d.tiles, g.x, g.y)) ? g : d.pos;
  };

  for (const id of d.enemies.map((e) => e.id)) {
    const e = d.enemies.find((o) => o.id === id);
    if (!e || woke.includes(id)) continue;
    if (e.mode === 'pile') {
      // At 0 it gets up, but not under someone: like a gate (rule 10) it waits for the first turn its tile is empty.
      e.timer = Math.max(0, e.timer - 1);
      if (e.timer === 0 && free(e)) {
        e.mode = 'chase';
        events.push({ t: 'rebuild', id });
      }
    } else if (e.mode === 'windup') {
      strike(e);
      Object.assign(e, { mode: 'chase', aim: [] });
    } else if (e.mode === 'idle') {
      if (!wakes(e)) continue;
      e.mode = 'alert';
      events.push({ t: 'alert', id });
      if (!packWakes(e)) continue;
      for (const m of d.enemies) {
        if (m.pack !== e.pack || m.mode !== 'idle') continue;
        m.mode = 'alert';
        events.push({ t: 'alert', id: m.id });
        woke.push(m.id);
      }
    } else {
      // The turn after the alert it starts chasing and acts that same turn.
      e.mode = 'chase';
      chase(e);
    }
  }

  // 4. Torch burns: 1 per turn, more inside a dark room. Out: 1 heart every TORCH_OUT_DRAIN turns.
  if (d.torch <= 0) {
    d.darkTurns += 1;
    if (d.darkTurns % TORCH_OUT_DRAIN === 0) hits.push({ amount: 1, cause: 'dark', at: { ...d.pos } });
  } else {
    d.torch = Math.max(0, d.torch - (darkRoom(d, d.pos) ? DARK[tierOf(d, 'dark')].burn : 1));
    if (d.torch === 0) events.push({ t: 'torchOut' });
  }

  // 5. Damage resolves once.
  let deathCause = '';
  for (const h of hits) {
    events.push({ t: 'hurt', amount: h.amount, cause: h.cause, at: h.at });
    d.hearts = Math.max(d.floor.mercy ? 1 : 0, d.hearts - h.amount);
    if (d.hearts === 0 && !deathCause) deathCause = h.cause;
  }

  // 6. End check: dead beats won.
  if (d.hearts === 0) {
    events.push({ t: 'dead', cause: deathCause });
    d.ended = { kind: 'dead', cause: deathCause };
  } else if (tileAt(d.tiles, d.pos.x, d.pos.y) === '>') {
    events.push({ t: 'won' });
    d.ended = { kind: 'won', cause: 'stairs' };
  }
  return { state: withSeen(d), events };
}

/** Where a fall lands: the safe free tile within PIT_DROP of the pit that is nearest the stairs (or the pit, with no stairs). */
function landing(d: State, pit: Pos): Pos {
  const w = width(d.tiles);
  const safe = (c: string) => !blocks(c) && !hazard(c) && c !== 'G' && c !== '_';
  const stairs = find(d.tiles, '>')[0];
  const far = stairs ? bfs(d.tiles, stairs, (c) => !blocks(c)) : null;
  const score = (p: Pos) => (far ? (far[p.y * w + p.x] ?? -1) : dist(p, pit));
  let best: Pos | null = null;
  d.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const p = { x, y };
      if (dist(p, pit) > PIT_DROP || !safe(row[x] ?? '#') || d.enemies.some((e) => e.mode !== 'pile' && same(e, p)) || score(p) < 0) continue;
      if (!best || score(p) < score(best)) best = p;
    }
  });
  return best ?? d.pos;
}

/** Everything readable on the floor now. Hidden hazards show their static tell only once lit. */
export function tells(s: State): Tell[] {
  const out: Tell[] = [];
  const w = width(s.tiles);
  const now = lit(s);
  const den = GOBLINS[tierOf(s, 'goblins')].den;
  const mech = MECHANISMS[tierOf(s, 'mechanisms')];
  s.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x] ?? '';
      const on = now[y * w + x] === 1;
      const add = (kind: TellKind, cause: string) => out.push({ kind, x, y, cause });
      if (c === '^' || c === 'x') {
        const stage = spikeStage(s, x, y);
        if (stage) add(stage === 2 ? 'spikes-up' : 'spikes-half', c === 'x' ? 'trap' : 'spikes');
      } else if (c === 'u' && on) add('crack', 'spikes');
      else if (c === 'O') add('pit', 'pit');
      else if (c === ',') add('crumble', 'pit');
      else if (c === ';') add('cracking', 'pit');
      else if (c === 'o' && on) add('mortar', 'pit');
      else if (c === 'F' && on) add('missing-step', 'trap');
      else if (c === 'S' || c === 'Z') add('slit', c === 'S' ? 'dart' : 'trap');
      else if (c === 's' || c === 'z') {
        for (const p of slitLine(s.tiles, { x, y }, c === 's' ? mech.range : TRAPS.dart.range)) out.push({ kind: 'armed', x: p.x, y: p.y, cause: c === 's' ? 'dart' : 'trap' });
      } else if (c === 'G' && den && (s.turn + 1) % den === 0) add('spawn', 'goblin');
    }
  });
  for (const c of s.clocks) if (c.left === 1) out.push({ kind: 'gate', x: c.x, y: c.y, cause: 'gate' });
  const starve = GOBLINS[tierOf(s, 'goblins')].starve;
  for (const e of s.enemies) {
    const at = (kind: TellKind, cause: string) => out.push({ kind, x: e.x, y: e.y, cause });
    if (e.mode === 'alert') at('alert', e.kind);
    if (e.mode === 'pile' && e.timer <= 1) at('rebuild', 'skeleton');
    if (e.kind === 'goblin' && starve && e.mode !== 'idle' && (s.turn + 1) % starve === 0) at('hungry', 'goblin');
    if (e.mode === 'windup') {
      const cause = e.kind === 'skeleton' && SKELETONS[tierOf(s, 'skeletons')].range ? 'arrow' : e.kind;
      for (const p of e.aim) out.push({ kind: 'windup', x: p.x, y: p.y, cause });
    }
  }
  if (s.torch <= 0) out.push({ kind: 'dark', x: s.pos.x, y: s.pos.y, cause: 'dark' });
  return out;
}

export function replay(floor: Floor, log: readonly Action[]): State {
  return log.reduce((s, a) => step(s, a).state, start(floor));
}

/** What the server stores for a run, derived by replay (the client sends only the log). `tile`: where it ended. */
export type RunResult = { outcome: End['kind']; score: number; turns: number; torch: number; cause: string; tile: Pos };

export const score = (s: State): number => (s.ended?.kind === 'won' ? SCORE.won + SCORE.perHeart * s.hearts + s.torch : s.turn);

/**
 * judge(floor, log): validate a submitted log, then replay it. A log is only U D L R W I, at most RUN.maxActions long,
 * holds no free action (a bump changes no state, so a client never logs one; without this rule a log has no upper bound),
 * and ends the run on its last action.
 */
export function judge(floor: Floor, log: string): { ok: true; run: RunResult } | { ok: false; reason: string } {
  if (log.length === 0 || log.length > RUN.maxActions) return { ok: false, reason: 'length' };
  let s = start(floor);
  for (const a of log) {
    if (!isAction(a)) return { ok: false, reason: 'action' };
    if (s.ended) return { ok: false, reason: 'after end' };
    const next = step(s, a).state;
    if (next === s) return { ok: false, reason: 'free action' };
    s = next;
  }
  if (!s.ended) return { ok: false, reason: 'unfinished' };
  return { ok: true, run: { outcome: s.ended.kind, score: score(s), turns: s.turn, torch: s.torch, cause: s.ended.cause, tile: { ...s.pos } } };
}

const ACTIONS: readonly Action[] = ['U', 'D', 'L', 'R', 'W', 'I'];
export const isAction = (a: string | undefined): a is Action => ACTIONS.some((x) => x === a);
