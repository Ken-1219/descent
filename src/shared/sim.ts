import {
  GOBLIN_HP,
  GOBLIN_SIGHT,
  HEARTS,
  TORCH_LOW_PCT,
  TORCH_LOW_RADIUS,
  TORCH_OUT_DRAIN,
  TORCH_OUT_RADIUS,
  TORCH_RADIUS,
} from './content';

export type Action = 'U' | 'D' | 'L' | 'R' | 'W' | 'I';
export type Pos = { x: number; y: number };
export type Floor = { depth: number; rows: readonly string[]; torch: number; mercy: boolean };
export type Enemy = { id: number; kind: 'goblin'; x: number; y: number; hp: number; mode: 'idle' | 'alert' | 'chase' };
export type End = { kind: 'won' | 'dead'; cause: string };
export type State = {
  floor: Floor;
  tiles: readonly string[];
  pos: Pos;
  hearts: number;
  torch: number;
  turn: number;
  hasKey: boolean;
  seen: readonly number[];
  enemies: readonly Enemy[];
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
  | { t: 'enemyAttack'; id: number }
  | { t: 'hurt'; amount: number; cause: string }
  | { t: 'torchOut' }
  | { t: 'won' }
  | { t: 'dead'; cause: string };

type Hit = { amount: number; cause: string };

const DIRS: readonly { a: Action; dx: number; dy: number }[] = [
  { a: 'U', dx: 0, dy: -1 },
  { a: 'D', dx: 0, dy: 1 },
  { a: 'L', dx: -1, dy: 0 },
  { a: 'R', dx: 1, dy: 0 },
];

const width = (tiles: readonly string[]): number => tiles[0]?.length ?? 0;
/** Off the map reads as wall. */
const tileAt = (tiles: readonly string[], x: number, y: number): string => tiles[y]?.[x] ?? '#';
const isWall = (c: string): boolean => c === '#' || c === 'T';
const blocksSight = (c: string): boolean => isWall(c) || c === 'D';
const setTile = (tiles: readonly string[], x: number, y: number, c: string): string[] =>
  tiles.map((row, ry) => (ry === y ? row.slice(0, x) + c + row.slice(x + 1) : row));

/** Bresenham from a to b; only the tiles strictly between them can block. */
function lineOfSight(tiles: readonly string[], a: Pos, b: Pos): boolean {
  const dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let err = dx + dy, x = a.x, y = a.y;
  for (;;) {
    if (x === b.x && y === b.y) return true;
    if ((x !== a.x || y !== a.y) && blocksSight(tileAt(tiles, x, y))) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

export function lightRadius(state: State): number {
  if (state.torch <= 0) return TORCH_OUT_RADIUS;
  return state.torch * 100 <= state.floor.torch * TORCH_LOW_PCT ? TORCH_LOW_RADIUS : TORCH_RADIUS;
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
  floor.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '@') pos = { x, y };
      if (row[x] === 'g') enemies.push({ id: enemies.length, kind: 'goblin', x, y, hp: GOBLIN_HP, mode: 'idle' });
    }
  });
  const tiles = floor.rows.map((row) => row.replace(/[@g]/g, '.'));
  return withSeen({
    floor, tiles, pos, hearts: HEARTS, torch: floor.torch, turn: 0, hasKey: false, seen: [], enemies, ended: null,
  });
}

/** Goblin step: greedy on the larger axis first, then the other; never into walls, closed doors, spikes, enemies or the player. */
function chaseStep(state: State, e: Enemy, enemies: readonly Enemy[]): Pos | null {
  const dx = state.pos.x - e.x, dy = state.pos.y - e.y;
  const xStep = { x: e.x + Math.sign(dx), y: e.y }, yStep = { x: e.x, y: e.y + Math.sign(dy) };
  const tries = Math.abs(dx) >= Math.abs(dy) ? [xStep, yStep] : [yStep, xStep];
  for (const p of tries) {
    if (p.x === e.x && p.y === e.y) continue;
    const c = tileAt(state.tiles, p.x, p.y);
    if (isWall(c) || c === 'D' || c === '^') continue;
    if (p.x === state.pos.x && p.y === state.pos.y) continue;
    if (enemies.some((o) => o.id !== e.id && o.x === p.x && o.y === p.y)) continue;
    return p;
  }
  return null;
}

export function step(state: State, action: Action): { state: State; events: Event[] } {
  if (state.ended || action === 'I') return { state, events: [] };
  const events: Event[] = [];
  const hits: Hit[] = [];
  let { tiles, pos, hasKey, enemies } = state;

  // 1. Player acts.
  const dir = DIRS.find((d) => d.a === action);
  if (dir) {
    const to = { x: pos.x + dir.dx, y: pos.y + dir.dy };
    const c = tileAt(tiles, to.x, to.y);
    const target = enemies.find((e) => e.x === to.x && e.y === to.y);
    if (target) {
      events.push({ t: 'attack', id: target.id, at: to });
      const hp = target.hp - 1;
      if (hp <= 0) events.push({ t: 'kill', id: target.id, at: to });
      enemies = hp <= 0 ? enemies.filter((e) => e.id !== target.id) : enemies.map((e) => (e.id === target.id ? { ...e, hp } : e));
    } else if (isWall(c)) {
      return { state, events: [{ t: 'blocked', at: to }] };
    } else if (c === 'D') {
      if (!hasKey) return { state, events: [{ t: 'locked', at: to }] };
      events.push({ t: 'door', at: to });
      tiles = setTile(tiles, to.x, to.y, '/');
      hasKey = false;
    } else {
      events.push({ t: 'move', from: pos, to });
      pos = to;
      if (c === 'k') {
        events.push({ t: 'key', at: to });
        hasKey = true;
        tiles = setTile(tiles, to.x, to.y, '.');
      }
      if (c === '^') hits.push({ amount: 1, cause: 'spikes' });
    }
  }
  let next: State = { ...state, tiles, pos, hasKey, enemies, turn: state.turn + 1 };

  // 2. Mechanisms tick: none yet.

  // 3. Enemies act in id order.
  for (const id of next.enemies.map((e) => e.id)) {
    const e = next.enemies.find((o) => o.id === id);
    if (!e) continue;
    let moved: Enemy = e;
    if (e.mode === 'idle') {
      const dist = Math.abs(next.pos.x - e.x) + Math.abs(next.pos.y - e.y);
      if (dist <= GOBLIN_SIGHT && lineOfSight(next.tiles, e, next.pos)) {
        moved = { ...e, mode: 'alert' };
        events.push({ t: 'alert', id });
      }
    } else {
      // The turn after the alert it starts chasing and acts that same turn.
      moved = { ...e, mode: 'chase' };
      if (Math.abs(next.pos.x - e.x) + Math.abs(next.pos.y - e.y) === 1) {
        events.push({ t: 'enemyAttack', id });
        hits.push({ amount: 1, cause: 'goblin' });
      } else {
        const p = chaseStep(next, e, next.enemies);
        if (p) {
          events.push({ t: 'enemyMove', id, from: { x: e.x, y: e.y }, to: p });
          moved = { ...moved, x: p.x, y: p.y };
        }
      }
    }
    next = { ...next, enemies: next.enemies.map((o) => (o.id === id ? moved : o)) };
  }

  // 4. Torch -1. Torch only falls by turns, so turns in the dark = turn - floor.torch.
  const torch = Math.max(0, next.torch - 1);
  if (next.torch > 0 && torch === 0) events.push({ t: 'torchOut' });
  const dark = next.turn - next.floor.torch;
  if (torch === 0 && dark > 0 && dark % TORCH_OUT_DRAIN === 0) hits.push({ amount: 1, cause: 'dark' });
  next = { ...next, torch };

  // 5. Damage resolves once.
  let hearts = next.hearts, deathCause = '';
  for (const h of hits) {
    events.push({ t: 'hurt', amount: h.amount, cause: h.cause });
    hearts = Math.max(next.floor.mercy ? 1 : 0, hearts - h.amount);
    if (hearts === 0 && !deathCause) deathCause = h.cause;
  }
  next = { ...next, hearts };

  // 6. End check: dead beats won.
  if (hearts === 0) {
    events.push({ t: 'dead', cause: deathCause });
    next = { ...next, ended: { kind: 'dead', cause: deathCause } };
  } else if (tileAt(next.tiles, next.pos.x, next.pos.y) === '>') {
    events.push({ t: 'won' });
    next = { ...next, ended: { kind: 'won', cause: 'stairs' } };
  }
  return { state: withSeen(next), events };
}

export function replay(floor: Floor, log: readonly Action[]): State {
  return log.reduce((s, a) => step(s, a).state, start(floor));
}
