// Floor generator (§8): BSP rooms, the tier cycle, budget spending, floor shape, crowd weights, player traps, fairness gates.
import {
  BUDGET, CROWD, CURSE_TIE_ORDER, CURSES, CYCLE, DARK, ENTRANCE_CLEAR, FAMILIES, FAMILY_POS, FAMILY_WEIGHT, GATE_TORCH_PCT, GOBLINS, GRID, IMPS,
  FRESH_PER_ROOM, ITEM_RULE, ITEM_WEIGHT, MAX_TIER, MECHANISMS, PITS, PLACE_TRIES, RETRY_CAP, ROOM1_ENEMY_GAP, ROOMS, SKELETONS, SLACK, SPIKES,
  TIERS, TILES_PER_INSTANCE, TRAP_MAX, TRAP_ZONE_MAX, TRAPS, WARDEN_POS, type Curse, type Family, type Item, type Tier,
} from './content';
import { bot } from './bot';
import { DIRS, bfs, blocks, dist, find, isWall, same, setTile, slitLine, tileAt, width, zoneOf, type Pos } from './grid';
import { hash, mulberry32 } from './rng';
import { spikeStage, start, step, tierOf, type Action, type Floor, type PlacedTrap, type Rect } from './sim';

/** A survivor's trap for tomorrow: a compass zone and a kind; `owner` and `name` say whose it is (souls, death panels). */
export type Trap = { zone: number; kind: 'spikes' | 'dart' | 'stairs'; owner?: string; name?: string | null };
/** Yesterday's crowd: deaths per compass zone (0..8, row-major), the top-killing family, survivors' traps, active curses. */
export type Mods = { curses: readonly Curse[]; deaths: readonly number[]; topFamily: Family | null; traps: readonly Trap[] };
export const NO_MODS: Mods = { curses: [], deaths: [0, 0, 0, 0, 0, 0, 0, 0, 0], topFamily: null, traps: [] };
export type SafePath = { burn: number; log: readonly Action[] };
/** `bought`: instances purchased per family (the hazard census). `fallback`: 0 normally; 1 or 2 when the retry cap was hit (see generate). */
export type Generated = { floor: Floor; rooms: readonly Rect[]; showcase: readonly Family[]; bought: Partial<Record<Family, number>>; rejected: number; fallback: number; safe: SafePath };

const COSTS: Record<Family, Record<Tier, { cost: number }>> = {
  spikes: SPIKES, goblins: GOBLINS, imps: IMPS, mechanisms: MECHANISMS, skeletons: SKELETONS, pits: PITS, dark: DARK,
};
const ITEM_CHAR: Record<Item, string> = { potion: 'p', oil: 'l', bomb: 'b' };
const ITEM_KINDS: readonly Item[] = ['potion', 'oil', 'bomb'];
const TRAP_CHAR = { spikes: 'x', stairs: 'F' } as const;

const cycle = (depth: number) => ({ band: Math.floor((depth - 1) / CYCLE), pos: ((depth - 1) % CYCLE) + 1 });

/** §8: in band b a family whose position has been reached is at tier b + 1, the rest at b; 0 (absent) is left out; capped at 4. */
export function tiersFor(depth: number): Partial<Record<Family, Tier>> {
  const { band, pos } = cycle(depth);
  const out: Partial<Record<Family, Tier>> = {};
  for (const f of FAMILIES) {
    const tier = TIERS[Math.min(MAX_TIER, band + (pos >= FAMILY_POS[f] ? 1 : 0)) - 1];
    if (tier) out[f] = tier;
  }
  return out;
}

/** Position-7 floors are the Warden's arena (A40). */
export const isWardenFloor = (depth: number) => cycle(depth).pos === WARDEN_POS;

/** The day's new families or tiers. With nothing new (position 7, or every family at T4 from depth 29) the showcase rotates. */
export function showcaseFamilies(depth: number): Family[] {
  const { band, pos } = cycle(depth);
  const fresh = band < MAX_TIER ? FAMILIES.filter((f) => FAMILY_POS[f] === pos) : [];
  const rotate = FAMILIES[(depth - 1) % FAMILIES.length];
  return fresh.length ? fresh : rotate ? [rotate] : [];
}


/**
 * Budget weights per zone (×10) from yesterday's deaths, by share rather than count, so 5 deaths show and 1,000 rank like
 * 100: ranked 22, 16, 12; a zone under CROWD.minSharePct of the deaths (or past third) counts as other, 8; no deaths 6.
 * Under CROWD.minDeaths deaths in all, the weights stay uniform (one death never redraws a floor).
 */
export function zoneWeights(deaths: readonly number[]): number[] {
  const total = deaths.reduce((a, b) => a + b, 0);
  if (total < CROWD.minDeaths) return deaths.map(() => CROWD.uniformWeight);
  const out = deaths.map(() => CROWD.emptyWeight);
  deaths
    .map((d, z) => ({ d, z }))
    .sort((a, b) => b.d - a.d || a.z - b.z)
    .forEach(({ d, z }, rank) => {
      if (d > 0) out[z] = d * 100 >= total * CROWD.minSharePct ? (CROWD.rankWeights[rank] ?? CROWD.otherWeight) : CROWD.otherWeight;
    });
  return out;
}

const inside = (r: Rect, p: Pos) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const centre = (r: Rect): Pos => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });
const cells = (r: Rect): Pos[] => Array.from({ length: r.w * r.h }, (_, i) => ({ x: r.x + (i % r.w), y: r.y + Math.floor(i / r.w) }));
/** Manhattan distance from a tile to the nearest tile of a room. */
const toRoom = (p: Pos, r: Rect) => Math.max(0, r.x - p.x, p.x - (r.x + r.w - 1)) + Math.max(0, r.y - p.y, p.y - (r.y + r.h - 1));
const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);

/**
 * Gate 1: the cheapest zero-damage route to the stairs, ignoring enemies, measured in torch burned.
 * Search state is (x, y, turn mod spike period). Hazards are modelled no more kindly than the sim (spec, Phase 5).
 */
export function safePath(floor: Floor): SafePath | null {
  const s0 = start(floor);
  const t = s0.tiles;
  const w = width(t);
  const period = SPIKES[tierOf(s0, 'spikes')].period || 1;
  const darkBurn = DARK[tierOf(s0, 'dark')].burn;
  const inDark = (p: Pos) => (floor.dark ?? []).some((r) => inside(r, p));
  const lines = new Set<number>();
  for (const p of find(t, 'SsZz')) {
    const range = 'Ss'.includes(tileAt(t, p.x, p.y)) ? MECHANISMS[tierOf(s0, 'mechanisms')].range : TRAPS.dart.range;
    for (const q of slitLine(t, p, range)) lines.add(q.y * w + q.x);
  }
  const ok = (p: Pos, turn: number) => {
    const c = tileAt(t, p.x, p.y);
    if (tileAt(floor.rows, p.x, p.y) === 'W') return false; // the Warden never moves off its block
    if (blocks(c) || 'uxO,;oF_Hh'.includes(c) || lines.has(p.y * w + p.x)) return false;
    return c !== '^' || (period > 1 && spikeStage(s0, p.x, p.y, turn) !== 2);
  };
  const id = (p: Pos, turn: number) => (p.y * w + p.x) * period + (turn % period);
  const cost: number[] = [];
  const from: { prev: number; a: Action }[] = [];
  const startId = id(s0.pos, 0);
  cost[startId] = 0;
  const buckets: number[][] = [[startId]];
  const ACTS: readonly { a: Action; dx: number; dy: number }[] = [...DIRS, { a: 'W', dx: 0, dy: 0 }];
  for (let c = 0; c < buckets.length; c++) {
    for (const i of buckets[c] ?? []) {
      if (cost[i] !== c) continue;
      const tile = Math.floor(i / period);
      const p = { x: tile % w, y: Math.floor(tile / w) };
      if (tileAt(t, p.x, p.y) === '>') {
        const log: Action[] = [];
        for (let k = i; k !== startId; k = from[k]?.prev ?? startId) log.unshift(from[k]?.a ?? 'W');
        return { burn: c, log };
      }
      const turn = i % period;
      for (const d of ACTS) {
        const q = { x: p.x + d.dx, y: p.y + d.dy };
        if (!ok(q, turn + 1)) continue;
        const j = id(q, turn + 1);
        const nc = c + (inDark(q) ? darkBurn : 1);
        if (cost[j] !== undefined && (cost[j] ?? 0) <= nc) continue;
        cost[j] = nc;
        from[j] = { prev: i, a: d.a };
        (buckets[nc] ??= []).push(j);
      }
    }
  }
  return null;
}

/** The gate-1 route replayed in the real sim, enemies and dens removed (the chained Warden's block stays, as wall). */
function verified(floor: Floor, log: readonly Action[]): boolean {
  let s = start({ ...floor, rows: floor.rows.map((r) => r.replace(/[giKG]/g, '.').replace(/W/g, '#')) });
  for (const a of log) {
    const r = step(s, a);
    if (r.events.some((e) => e.t === 'hurt')) return false;
    s = r.state;
  }
  return s.ended?.kind === 'won';
}

/** No stranding: with every gate shut, each tile reachable from the entrance can still reach the stairs. */
export const strandFree = (floor: Floor): boolean => {
  const s0 = start(floor);
  return unstranded(s0.tiles, s0.pos);
};
function unstranded(t: readonly string[], entrance: Pos): boolean {
  const stairs = find(t, '>')[0];
  if (!stairs) return false;
  const w = width(t);
  const walk = (c: string) => !isWall(c) && !'DYy'.includes(c);
  const reach = bfs(t, entrance, walk);
  const back = bfs(t, stairs, (c) => walk(c) && c !== 'H' && c !== 'h');
  return reach.every((r, i) => r < 0 || (back[i] ?? -1) >= 0 || 'Hh'.includes(t[Math.floor(i / w)]?.[i % w] ?? ''));
}

/** A cheap gate-1 precheck while placing: a route to the stairs avoiding every always-dangerous tile (timed spikes count as passable). */
function routed(t: readonly string[], entrance: Pos, stairs: Pos, fixedSpikes: boolean): boolean {
  const w = width(t);
  const lines = new Set<number>();
  for (const p of find(t, 'SsZz')) for (const q of slitLine(t, p, TRAPS.dart.range)) lines.add(q.y * w + q.x);
  const pass = (c: string) => !blocks(c) && !'uxO,;oF_HhW'.includes(c) && !(fixedSpikes && c === '^');
  const masked = t.map((row, y) => [...row].map((c, x) => (lines.has(y * w + x) ? '#' : c)).join(''));
  return (bfs(masked, entrance, pass)[stairs.y * w + stairs.x] ?? -1) >= 0;
}

const cursePct = (mods: Mods, key: 'budgetPct' | 'torchPct') => mods.curses.reduce((v, c) => Math.floor((v * CURSES[c][key]) / 100), 100);
/** §8 budget 8 + step·min(depth, cap), scaled by the curses. */
/**
 * The crowd's curse for tomorrow: most votes wins, a tie goes to the mildest (CURSE_TIE_ORDER), one voter decides alone,
 * and no voters means no curse (never fabricate crowd data).
 */
export function resolveCurse(votes: Partial<Record<Curse, number>>): Curse | null {
  let best: Curse | null = null;
  for (const c of CURSE_TIE_ORDER) if ((votes[c] ?? 0) > 0 && (votes[c] ?? 0) > (best ? (votes[best] ?? 0) : 0)) best = c;
  return best;
}

export const budgetFor = (depth: number, mods: Mods = NO_MODS) =>
  Math.floor(((BUDGET.base + BUDGET.step * Math.min(depth, BUDGET.capDepth)) * cursePct(mods, 'budgetPct')) / 100);

/**
 * generate(depth, seed, mods): a fair floor, retrying with seed + 1 up to `cap` times. A day with no floor is the worst
 * outcome, so hitting the cap falls back to lighter floors: level 1 halves the budget and drops player traps; level 2
 * spends nothing (an empty floor always passes the gates). Tests treat any fallback as a generator bug.
 */
export function generate(depth: number, seed: number, mods: Mods = NO_MODS, cap = RETRY_CAP): Generated {
  for (let fallback = 0; fallback <= 2; fallback++) {
    for (let k = 0; k <= cap; k++) {
      const g = attempt(depth, seed + k, mods, fallback);
      if (g) return { ...g, rejected: k + fallback * (cap + 1), fallback };
    }
  }
  throw new Error(`generate(${depth}, ${seed}): no floor even empty`);
}

function attempt(depth: number, seed: number, mods: Mods, fallback: number): Omit<Generated, 'rejected' | 'fallback'> | null {
  const rnd = mulberry32(hash(`descent:${depth}:${seed}`));
  const int = (n: number) => (n > 0 ? rnd() % n : 0);
  const pickW = <T>(items: readonly T[], weight: (x: T) => number): T | undefined => {
    let r = int(items.reduce((s, x) => s + weight(x), 0));
    return items.find((x) => (r -= weight(x)) < 0);
  };
  const { band } = cycle(depth);
  const tiers = tiersFor(depth);
  const side = GRID.base + GRID.step * Math.min(band, GRID.maxBand);

  // Rooms: split the largest leaf until there are enough, one room per leaf, a wall between any two.
  const leaves: Rect[] = [{ x: 1, y: 1, w: side - 2, h: side - 2 }];
  for (let want = ROOMS.base + Math.min(band, ROOMS.maxBand); leaves.length < want; ) {
    const i = leaves.reduce((b, l, k) => (Math.max(l.w, l.h) >= 2 * ROOMS.minLeaf && (b < 0 || l.w * l.h > (leaves[b]?.w ?? 0) * (leaves[b]?.h ?? 0)) ? k : b), -1);
    const l = leaves[i];
    if (!l) break;
    const across = l.w >= l.h;
    const cut = ROOMS.minLeaf + int((across ? l.w : l.h) - 2 * ROOMS.minLeaf + 1);
    leaves.splice(i, 1, across ? { ...l, w: cut } : { ...l, h: cut }, across ? { ...l, x: l.x + cut, w: l.w - cut } : { ...l, y: l.y + cut, h: l.h - cut });
  }
  const rooms = leaves.map((l) => {
    const w = ROOMS.minRoom + int(l.w - ROOMS.minRoom), h = ROOMS.minRoom + int(l.h - ROOMS.minRoom);
    return { x: l.x + int(l.w - w), y: l.y + int(l.h - h), w, h };
  });
  let rows = Array.from({ length: side }, () => '#'.repeat(side));
  const at = (p: Pos) => tileAt(rows, p.x, p.y);
  const put = (p: Pos, c: string) => (rows = setTile(rows, p.x, p.y, c));
  for (const r of rooms) for (const p of cells(r)) put(p, '.');
  const corridor = (a: Pos, b: Pos) => {
    const bend = int(2) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    for (const [p, q] of [[a, bend], [bend, b]] as const) {
      for (let k = 0; k <= dist(p, q); k++) {
        const c = { x: p.x + Math.sign(q.x - p.x) * k, y: p.y + Math.sign(q.y - p.y) * k };
        if (at(c) === '#') put(c, '.');
      }
    }
  };
  // Prim joins the rooms (nearest centres first), then a few extra corridors make loops.
  const mids = rooms.map(centre);
  const joined = [0];
  const edges: string[] = [];
  while (joined.length < mids.length) {
    let best = { i: -1, j: -1, d: 0 };
    for (const i of joined) mids.forEach((m, j) => {
      const d = dist(mids[i] ?? m, m);
      if (!joined.includes(j) && (best.i < 0 || d < best.d)) best = { i, j, d };
    });
    const [a, b] = [mids[best.i], mids[best.j]];
    if (!a || !b) break;
    corridor(a, b);
    joined.push(best.j);
    edges.push(`${Math.min(best.i, best.j)}-${Math.max(best.i, best.j)}`);
  }
  for (let k = 0; k < ROOMS.loops && mids.length > 2; k++) {
    const i = int(mids.length), j = int(mids.length);
    const [a, b] = [mids[i], mids[j]];
    if (i !== j && a && b && !edges.includes(`${Math.min(i, j)}-${Math.max(i, j)}`)) corridor(a, b);
  }

  // Entrance in room 1; stairs in the room farthest away by walking distance.
  const r1 = int(rooms.length);
  const room1 = rooms[r1];
  if (!room1) return null;
  const entrance = centre(room1);
  const far = bfs(rows, entrance, (c) => !blocks(c));
  const away = (r: Rect) => far[centre(r).y * side + centre(r).x] ?? -1;
  const order = rooms.map((_, k) => k).sort((a, b) => away(rooms[a] ?? room1) - away(rooms[b] ?? room1) || a - b);
  // A40: on the Warden's floor the stairs room is its arena: the farthest room at least 4×4, the 2×2 block in its middle,
  // the stairs on its corner farthest from the entrance (a corner lies outside every slam band). Open from the start.
  const warden = isWardenFloor(depth);
  const fits = (k: number) => !warden || ((rooms[k]?.w ?? 0) >= 4 && (rooms[k]?.h ?? 0) >= 4);
  const stairsK = [...order].reverse().find((k) => k !== r1 && fits(k));
  const stairsRoom = stairsK === undefined ? undefined : rooms[stairsK];
  if (!stairsRoom || stairsRoom === room1 || (!warden && stairsK !== order[order.length - 1])) return null;
  const block = { x: stairsRoom.x + Math.floor((stairsRoom.w - 2) / 2), y: stairsRoom.y + Math.floor((stairsRoom.h - 2) / 2) };
  const corners = [
    { x: stairsRoom.x, y: stairsRoom.y }, { x: stairsRoom.x + stairsRoom.w - 1, y: stairsRoom.y },
    { x: stairsRoom.x, y: stairsRoom.y + stairsRoom.h - 1 }, { x: stairsRoom.x + stairsRoom.w - 1, y: stairsRoom.y + stairsRoom.h - 1 },
  ];
  const farCorner = corners.reduce((b, c) => ((far[c.y * side + c.x] ?? -1) > (far[b.y * side + b.x] ?? -1) ? c : b));
  const stairs = warden ? farCorner : (cells(stairsRoom)[int(stairsRoom.w * stairsRoom.h)] ?? centre(stairsRoom));
  put(stairs, '>');
  if (warden) for (const p of cells({ ...block, w: 2, h: 2 })) put(p, 'W');

  // Room roles: room 1 safe; the next room is the showcase; later rooms add one older family each.
  const fresh = showcaseFamilies(depth).filter((f) => tiers[f]);
  // Each later room adds one older family; shuffled by seed so every family turns up across floors even with few rooms.
  const older = FAMILIES.filter((f) => tiers[f] && !fresh.includes(f))
    .map((f, i) => ({ f, i, key: rnd() }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map((x) => x.f);
  // Two new tiers at once (band starts after depth 1): each gets its own showcase room, and a later room holds at most one
  // of them plus one older family (floor-shape rule 3). Depth 1 has no older family, so its two share the showcase.
  const split = fresh.length > 1 && older.length > 0;
  const shows = split ? fresh.length : 1;
  const allowed = order.map((k, rank): [number, Family[]] => {
    if (k === r1 || (warden && k === stairsK)) return [k, []]; // room 1 is safe; the arena holds only the Warden
    if (rank <= shows) return [k, split ? [fresh[rank - 1] ?? fresh[0] ?? 'spikes'] : fresh];
    const old = older[(rank - 1 - shows) % Math.max(1, older.length)];
    const news = split ? [fresh[(rank - 1 - shows) % fresh.length] ?? 'spikes'] : fresh;
    return [k, old ? [...news, old] : news];
  });

  // Crowd: survivors' traps in a seeded shuffle, then taken in order while their zone has room (TRAP_ZONE_MAX), up to
  // TRAP_MAX; the rest add weight to their zone. Seeded shuffle: sort by a random key per trap (ties keep their order).
  const shuffled = (fallback ? [] : mods.traps).map((t, i) => ({ t, i, key: rnd() })).sort((a, b) => a.key - b.key || a.i - b.i).map((x) => x.t);
  const perZone = new Map<number, number>();
  const traps: Trap[] = [];
  const zones = zoneWeights(mods.deaths);
  for (const t of shuffled) {
    if (traps.length < TRAP_MAX && (perZone.get(t.zone) ?? 0) < TRAP_ZONE_MAX) {
      traps.push(t);
      perZone.set(t.zone, (perZone.get(t.zone) ?? 0) + 1);
    } else zones[t.zone] = (zones[t.zone] ?? 0) + CROWD.overflowTrapWeight;
  }

  // Placement rules shared by every instance.
  const free = (p: Pos) => at(p) === '.' && !same(p, entrance) && !inside(room1, p) && dist(p, entrance) > ENTRANCE_CLEAR;
  // Room 1 stays beyond the normal wake range. Under Light Sleepers only the entrance tile is kept out of the longer range,
  // so nothing is awake on turn 0 but the curse still bites (checking all of room 1 would cancel it).
  const wakeBonus = mods.curses.reduce((v, c) => v + CURSES[c].wakeDelta, 0);
  const foeOk = (p: Pos) => free(p) && toRoom(p, room1) >= ROOM1_ENEMY_GAP && dist(p, entrance) >= ROOM1_ENEMY_GAP + wakeBonus;
  const pickIn = (r: Rect, ok: (p: Pos) => boolean) => {
    const c = cells(r).filter(ok);
    return c[int(c.length)] ?? null;
  };
  const lineIn = (r: Rect, len: number, across: boolean, ok: (p: Pos) => boolean = free) => {
    const head = pickIn(r, ok);
    if (!head) return null;
    const line = Array.from({ length: len }, (_, k) => (across ? { x: head.x + k, y: head.y } : { x: head.x, y: head.y + k }));
    return line.every((p) => inside(r, p) && ok(p)) ? line : null;
  };
  const doorways = (r: Rect) =>
    cells({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }).filter((p) => {
      if (inside(r, p) || at(p) !== '.' || dist(p, entrance) <= ENTRANCE_CLEAR) return false;
      const sideways = DIRS.filter((d) => isWall(at({ x: p.x + d.dx, y: p.y + d.dy })));
      return sideways.length === 2 && sideways[0]?.dx === -(sideways[1]?.dx ?? 0) && sideways[0]?.dy === -(sideways[1]?.dy ?? 0);
    });
  const darkRooms: Rect[] = [];
  const place = (f: Family, tier: Tier, r: Rect): boolean => {
    const each = (line: Pos[] | null, c: string | string[]) => {
      if (!line) return false;
      line.forEach((p, k) => put(p, typeof c === 'string' ? c : (c[k] ?? '.')));
      return true;
    };
    if (f === 'spikes') return each(lineIn(r, tier === 1 ? 2 : 3, tier !== 3 && int(2) === 0), '^');
    if (f === 'goblins') return tier === 3 ? each(lineIn(r, 1, true, foeOk), 'G') : each(lineIn(r, tier === 2 ? 2 : 1, int(2) === 0, foeOk), 'g');
    if (f === 'imps') return each(lineIn(r, tier === 3 ? 3 : 1, int(2) === 0, foeOk), 'i');
    if (f === 'skeletons') return each(lineIn(r, tier === 4 ? 2 : 1, int(2) === 0, foeOk), 'K');
    if (f === 'pits') {
      if (tier === 1) return each(lineIn(r, 2, int(2) === 0), 'O');
      if (tier === 2) return each(lineIn(r, 2 + int(2), int(2) === 0), ',');
      if (tier === 4) return each(lineIn(r, 1, true), 'o');
      // T3: a chasm across the room with a chain bridge; one floor gap keeps the room crossable without the chains.
      if (r.w < 4) return false;
      const y = r.y + int(r.h);
      const row = Array.from({ length: r.w }, (_, k) => ({ x: r.x + k, y }));
      if (!row.every(free)) return false;
      const gap = int(r.w);
      const chain = (gap + 1 + int(r.w - 2)) % r.w; // never the gap
      return each(row, row.map((_, k) => (k === gap ? '.' : k === chain ? ',' : 'O')));
    }
    if (f === 'dark') {
      if (darkRooms.includes(r)) return false;
      darkRooms.push(r);
      if (tier === 4) each(lineIn(r, 1, true), 'Y');
      return true;
    }
    // Mechanisms. A gate only goes on a doorway whose closure keeps the stairs reachable, so a slam never strands.
    if (tier === 3) {
      const slits = cells({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }).filter((p) => at(p) === '#' && !inside(r, p));
      const slit = slits[int(slits.length)];
      if (!slit) return false;
      const line = slitLine(rows, slit, MECHANISMS[tier].range);
      const plate = line[1];
      if (line.length < 3 || !plate || !free(plate) || line.some((p) => !free(p) && at(p) !== '.') || line.some((p) => same(p, stairs))) return false;
      put(slit, 'S');
      put(plate, '_');
      return true;
    }
    const doors = doorways(r).filter((d) => unstranded(setTile(rows, d.x, d.y, 'H'), entrance));
    const door = doors[int(doors.length)];
    const plate = pickIn(r, free);
    if (!door || !plate) return false;
    put(door, tier === 2 ? 'h' : 'H');
    put(plate, '_');
    return true;
  };

  // Budget: the showcase first, then weighted purchases, each family at most 40% of the budget.
  const budget = fallback === 0 ? budgetFor(depth, mods) : fallback === 1 ? Math.floor(budgetFor(depth, mods) / 2) : 0;
  const cap = Math.floor((budget * BUDGET.familyCapPct) / 100);
  const spent: Partial<Record<Family, number>> = {};
  const bought: Partial<Record<Family, number>> = {};
  let total = 0;
  const fixedSpikes = SPIKES[tiers.spikes ?? 1].period === 0;
  const filled = new Map<Rect, number>();
  const freshIn = new Map<Rect, number>(); // new-family instances per room: it shows alone, then combines (rules 2-3)
  // Capacity follows the crowd weight both ways (2.2× in the deadliest zone, 0.6× where nobody died), so painted deaths
  // move hazards toward a zone rather than only reordering them.
  const perInstance = TILES_PER_INSTANCE[Math.min(band, TILES_PER_INSTANCE.length - 1)] ?? 4;
  // Relative to the floor's own mean room weight, so the total stays put and only its distribution moves.
  const later = rooms.filter((r) => r !== room1);
  const weightOf = (r: Rect) => zones[zoneOf(centre(r), side)] ?? CROWD.uniformWeight;
  const totalWeight = later.reduce((n, r) => n + weightOf(r), 0);
  const meanWeight = Math.max(1, Math.floor(totalWeight / Math.max(1, later.length)));
  const crowdPct = (r: Rect) => Math.floor((weightOf(r) * 100) / meanWeight);
  const capacity = (r: Rect) => Math.max(1, Math.floor((r.w * r.h * crowdPct(r) * cursePct(mods, 'budgetPct')) / (perInstance * 100 * 100)));
  const freshCap = (r: Rect) => Math.max(1, Math.floor((FRESH_PER_ROOM * crowdPct(r)) / 100));
  // A room in a zone the crowd painted (weight above uniform) may host any family: the crowd outweighs rule 3's pairing there.
  const crowded = (r: Rect) => crowdPct(r) > 100;
  // §8 budget weights: each later room gets a share of the budget in proportion to its zone's crowd weight, so painted
  // deaths move spending (not only capacity) toward the deadly zone.
  const share = (r: Rect) => Math.floor((budget * weightOf(r)) / Math.max(1, totalWeight));
  const roomSpent = new Map<Rect, number>();
  const costOf = (f: Family) => {
    const tier = tiers[f];
    return tier ? COSTS[f][tier].cost : 0;
  };
  const buy = (f: Family, r: Rect, showcase = false) => {
    if (warden && r === stairsRoom) return false;
    const tier = tiers[f];
    const cost = costOf(f);
    const room = filled.get(r) ?? 0;
    if (!showcase && (roomSpent.get(r) ?? 0) + cost > share(r)) return false;
    if (fresh.includes(f) && (freshIn.get(r) ?? 0) >= freshCap(r)) return false;
    if (!tier || total + cost > budget || (spent[f] ?? 0) + cost > cap || room >= capacity(r)) return false;
    const before = rows;
    if (!place(f, tier, r)) return false;
    if (!routed(rows, entrance, stairs, fixedSpikes)) {
      rows = before; // this instance would cut the only safe route: take it back
      if (f === 'dark') darkRooms.pop();
      return false;
    }
    filled.set(r, room + 1);
    roomSpent.set(r, (roomSpent.get(r) ?? 0) + cost);
    if (fresh.includes(f)) freshIn.set(r, (freshIn.get(r) ?? 0) + 1);
    bought[f] = (bought[f] ?? 0) + 1;
    spent[f] = (spent[f] ?? 0) + cost;
    total += cost;
    return true;
  };
  fresh.forEach((f, i) => {
    const showRoom = rooms[order[split ? 1 + i : 1] ?? r1];
    if (showRoom) buy(f, showRoom, true);
  });
  // A room that is full (capacity, or its share of the new family) is not a candidate, so filling the crowd's favourite
  // rooms never ends the spending early.
  const roomsFor = (f: Family) =>
    allowed.filter(([k, fs]) => {
      const r = rooms[k];
      return r && (fs.includes(f) || (crowded(r) && k !== r1)) && (filled.get(r) ?? 0) < capacity(r) && (roomSpent.get(r) ?? 0) + costOf(f) <= share(r) && (!fresh.includes(f) || (freshIn.get(r) ?? 0) < freshCap(r));
    }).map(([k]) => k);
  for (let fails = 0; fails < PLACE_TRIES; ) {
    const options = FAMILIES.filter((f) => {
      const tier = tiers[f];
      return tier && total + COSTS[f][tier].cost <= budget && (spent[f] ?? 0) + COSTS[f][tier].cost <= cap && roomsFor(f).length > 0;
    });
    const f = pickW(options, (x) => Math.floor((FAMILY_WEIGHT[x] * (mods.topFamily === x ? CROWD.topFamilyPct : 100)) / 100));
    if (!f) break;
    const k = pickW(roomsFor(f), (k) => zones[zoneOf(centre(rooms[k] ?? room1), side)] ?? 1);
    const r = k === undefined ? undefined : rooms[k];
    if (!r || !buy(f, r)) fails++;
  }

  // Items, then survivors' traps, then decoration.
  for (let n = Math.min(ITEM_RULE.max, ITEM_RULE.base + Math.floor(band / ITEM_RULE.bandStep)); n > 0; n--) {
    const kind = pickW(ITEM_KINDS, (k) => ITEM_WEIGHT[k]);
    const r = later[int(later.length)];
    const p = r ? pickIn(r, free) : null;
    if (kind && p) put(p, ITEM_CHAR[kind]);
  }
  const placed: PlacedTrap[] = [];
  const mark = (p: Pos, t: Trap) => {
    landed.set(zoneOf(p, side), (landed.get(zoneOf(p, side)) ?? 0) + 1);
    if (t.owner) placed.push({ x: p.x, y: p.y, kind: t.kind, owner: t.owner, name: t.name ?? null });
  };
  // A trap whose zone has no valid tile moves to the nearest zone that has one (compass steps), rather than vanishing.
  const zoneStep = (a: number, b: number) => Math.max(Math.abs((a % 3) - (b % 3)), Math.abs(Math.floor(a / 3) - Math.floor(b / 3)));
  // TRAP_ZONE_MAX holds for where traps land, so a moved trap never overfills its new zone.
  const landed = new Map<number, number>();
  const nearest = (zone: number, all: Pos[]) => {
    const ps = all.filter((p) => (landed.get(zoneOf(p, side)) ?? 0) < TRAP_ZONE_MAX);
    const d = Math.min(...ps.map((p) => zoneStep(zone, zoneOf(p, side))));
    return ps.filter((p) => zoneStep(zone, zoneOf(p, side)) === d);
  };
  for (const t of traps) {
    if (t.kind === 'dart') {
      const walls = nearest(t.zone, find(rows, '#').filter((p) => {
        const line = slitLine(rows, p, TRAPS.dart.range);
        return line.length >= 2 && line.every((q) => !same(q, stairs) && dist(q, entrance) > ENTRANCE_CLEAR && !inside(room1, q));
      }));
      const slit = walls[int(walls.length)];
      if (slit) {
        put(slit, 'Z');
        mark(slit, t);
      }
      continue;
    }
    const spots = nearest(t.zone, later.flatMap((r) => cells(r)).filter(free));
    const p = spots[int(spots.length)];
    if (p) {
      put(p, TRAP_CHAR[t.kind]);
      mark(p, t);
    }
  }
  for (const r of rooms) {
    const torch = { x: r.x + int(r.w), y: r.y - 1 };
    if (at(torch) === '#' && at({ x: torch.x, y: torch.y - 1 }) !== '.') put(torch, 'T');
  }
  put(entrance, '@');

  // Torch and fairness gates, on the finished floor.
  const floor: Floor = { depth, rows, torch: 1, mercy: false, seed, tiers, dark: darkRooms, ...(mods.curses.length ? { curses: mods.curses } : {}), ...(placed.length ? { traps: placed } : {}) };
  const safe = safePath(floor);
  if (!safe) return null;
  const slack = Math.max(SLACK.minPct, SLACK.startPct - SLACK.perDepthPct * depth) + SLACK.perRoomPct * (rooms.length - ROOMS.base);
  const torch = Math.max(ceilDiv(safe.burn * slack * cursePct(mods, 'torchPct'), 100 * 100), ceilDiv(safe.burn * 100, GATE_TORCH_PCT));
  const done: Floor = { ...floor, torch };
  if (safe.burn * 100 > GATE_TORCH_PCT * torch || !verified(done, safe.log) || !strandFree(done)) return null;
  const run = bot(done, 100, seed, 'map').state; // gate 3 is a proof: the bot plays with the map
  if (run.ended?.kind !== 'won' || run.hearts < 1) return null;
  return { floor: done, rooms, showcase: fresh, bought, safe };
}
