import { test, expect } from 'vitest';
import { FLOOR_0, floorName, HEARTS, LIGHT, PALETTE, RUN, STONE_TINT, stoneTint, type Token } from '../src/shared/content';
import { hash, mulberry32, pick } from '../src/shared/rng';
import { judge, replay, score, start, step, visibility, type Action, type Event, type Floor, type State } from '../src/shared/sim';
import { SPRITES, type SpriteDef } from '../src/client/art';
import { ANIMS, PACK, contrast, frameAt, tokenAt, type Anim } from '../src/client/sprites';

const tokens = Object.keys(PALETTE);
const isToken = (t: string): t is Token => tokens.includes(t);

test('text pairs meet WCAG AA', () => {
  expect(contrast(PALETTE.bone, PALETTE['ink-0'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(PALETTE.bone, PALETTE['ink-2'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(PALETTE.pale, PALETTE['ink-2'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
});

test('Phase 11g: every stone tint keeps the hero (bone) readable on the tinted stone, at 3:1 or more; names come by seed', () => {
  const mul = (a: string, b: string) => `#${[1, 3, 5].map((i) => Math.floor((parseInt(a.slice(i, i + 2), 16) * parseInt(b.slice(i, i + 2), 16)) / 255).toString(16).padStart(2, '0')).join('')}`;
  for (const t of STONE_TINT) {
    const stone = t ? mul(PALETTE.stone, PALETTE[t]) : PALETTE.stone;
    expect(contrast(PALETTE.bone, stone)).toBeGreaterThanOrEqual(3);
  }
  expect([1, 7, 8, 14, 15, 22, 28, 29].map(stoneTint)).toEqual([null, null, 'bone', 'bone', 'wisp', 'ember', 'ember', null]);
  expect(floorName(0)).toBe('The Drowned Halls');
  expect(floorName(17)).toBe('The Hollow Vaults');
  expect(floorName(2 ** 32 - 1)).toMatch(/^The \w+ \w+$/);
});

test('light tables map every token to a token', () => {
  for (const level of ['dim', 'remembered'] as const) {
    expect(Object.keys(LIGHT[level]).sort()).toEqual([...tokens].sort());
    for (const v of Object.values(LIGHT[level])) expect(isToken(v)).toBe(true);
  }
  for (const v of Object.values(LIGHT.remembered)) expect(['ink-0', 'ink-1', 'ink-2']).toContain(v);
});

test('sprites are 16 wide: 16x16 1-2 layer bitmaps, or pixel maps 1–32 tall (bottom-aligned) whose every char has a token', () => {
  for (const def of Object.values(SPRITES)) {
    if ('map' in def) {
      expect(def.map.length).toBeGreaterThanOrEqual(1);
      expect(def.map.length).toBeLessThanOrEqual(32);
      for (const row of def.map) {
        expect(row).toHaveLength(16);
        for (const ch of row) if (ch !== '.') expect(def.key[ch]).toBeDefined();
      }
      continue;
    }
    expect(def.layers.length).toBeGreaterThanOrEqual(1);
    expect(def.layers.length).toBeLessThanOrEqual(2);
    for (const layer of def.layers) {
      expect(layer.rows).toHaveLength(16);
      for (const row of layer.rows) expect(row).toMatch(/^[#.]{16}$/);
    }
  }
});

test('tokenAt reads pixel maps through their key', () => {
  const def: SpriteDef = { map: ['oe' + '.'.repeat(14), ...Array.from({ length: 15 }, () => '.'.repeat(16))], key: { o: 'ink-0', e: 'ember' } };
  expect(tokenAt(def, 'lit', 0, 0)).toBe('ink-0');
  expect(tokenAt(def, 'dim', 1, 0)).toBe(LIGHT.dim.ember);
  expect(tokenAt(def, 'lit', 2, 0)).toBeNull();
});

const blank = '.'.repeat(16);
const rows = [
  '##' + '.'.repeat(14),
  ...Array.from({ length: 15 }, () => blank),
];

test('tokenAt resolves layers, light levels, bg and transparency', () => {
  const lit: SpriteDef = { bg: 'ink-1', layers: [{ token: 'bone', rows }] };
  expect(tokenAt(lit, 'lit', 0, 0)).toBe('bone');
  expect(tokenAt(lit, 'dim', 0, 0)).toBe(LIGHT.dim.bone);
  expect(tokenAt(lit, 'edge', 0, 0)).toBe('bone');
  expect(tokenAt(lit, 'edge', 1, 0)).toBe(LIGHT.dim.bone);
  expect(tokenAt(lit, 'remembered', 0, 0)).toBe(LIGHT.remembered.bone);
  expect(tokenAt(lit, 'lit', 5, 5)).toBe('ink-1');
  const noBg: SpriteDef = { layers: [{ token: 'bone', rows }] };
  expect(tokenAt(noBg, 'lit', 5, 5)).toBeNull();
});

test('top layer wins', () => {
  const def: SpriteDef = {
    layers: [
      { token: 'bone', rows },
      { token: 'blood', rows: ['#' + '.'.repeat(15), ...rows.slice(1)] },
    ],
  };
  expect(tokenAt(def, 'lit', 0, 0)).toBe('blood');
  expect(tokenAt(def, 'lit', 1, 0)).toBe('bone');
});

test('style.css tokens match PALETTE exactly', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/client/style.css', import.meta.url), 'utf8');
  const found = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
  expect(found).toEqual(PALETTE);
});

test('animations: one ms per frame, every frame >= 84 ms, a hold, and real frame names', () => {
  for (const anim of Object.values(ANIMS)) {
    expect(anim.ms).toHaveLength(anim.frames.length);
    for (const ms of anim.ms) expect(ms).toBeGreaterThanOrEqual(84);
    // A one-frame anim (imp-perch) is all hold.
    if (anim.ms.length > 1) expect(Math.max(...anim.ms)).toBeGreaterThan(Math.min(...anim.ms));
    for (const f of anim.frames) expect(f.name in (f.src === 'own' ? SPRITES : PACK)).toBe(true);
  }
});

test('frameAt wraps loops and clamps one-shots', () => {
  const frames: Anim['frames'] = [{ src: 'pack', name: 'floor' }, { src: 'pack', name: 'floor' }];
  const loop: Anim = { frames, ms: [100, 200], loop: true };
  expect([0, 99, 100, 299, 300].map((t) => frameAt(loop, t))).toEqual([0, 0, 1, 1, 0]);
  expect(frameAt({ ...loop, loop: false }, 1000)).toBe(1);
});

// ---- Phase 3: rng + sim ----

const ACTIONS: readonly Action[] = ['U', 'D', 'L', 'R', 'W', 'I'];
const floor = (rows: string[], torch = 50, mercy = false): Floor => ({ depth: 1, rows, torch, mercy });
const run = (s: State, log: readonly Action[]) => {
  const events: Event[] = [];
  for (const a of log) {
    const r = step(s, a);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
};
const randomLog = (seed: number, n: number) => {
  const next = mulberry32(seed);
  return Array.from({ length: n }, () => pick(next, ACTIONS));
};

test('mulberry32 repeats, returns uint32 integers; hash differs', () => {
  const a = mulberry32(1), b = mulberry32(1);
  const xs = Array.from({ length: 20 }, () => a());
  expect(Array.from({ length: 20 }, () => b())).toEqual(xs);
  for (const x of xs) expect(Number.isInteger(x) && x >= 0 && x < 2 ** 32).toBe(true);
  expect(hash('a')).not.toBe(hash('b'));
});

test('wall bump is blocked and costs no turn or torch', () => {
  const s = start(floor(['###', '#@#', '###']));
  const r = step(s, 'U');
  expect(r.events).toEqual([{ t: 'blocked', at: { x: 1, y: 0 } }]);
  expect(r.state.turn).toBe(0);
  expect(r.state.torch).toBe(s.torch);
});

test('key then door: door event, key used, tile opens, player stays', () => {
  const s = start(floor(['#####', '#@kD#', '#####']));
  const locked = step(s, 'R');
  expect(locked.events.map((e) => e.t)).toContain('key');
  expect(locked.state.hasKey).toBe(true);
  const r = step(locked.state, 'R');
  expect(r.events[0]).toEqual({ t: 'door', at: { x: 3, y: 1 } });
  expect(r.state.hasKey).toBe(false);
  expect(r.state.tiles[1]).toBe('#../#');
  expect(r.state.pos).toEqual({ x: 2, y: 1 });
  expect(r.state.turn).toBe(2);
  const noKey = step(start(floor(['####', '#@D#', '####'])), 'R');
  expect(noKey.events).toEqual([{ t: 'locked', at: { x: 2, y: 1 } }]);
  expect(noKey.state.turn).toBe(0);
});

test('spikes hurt', () => {
  const r = step(start(floor(['####', '#@^#', '####'])), 'R');
  expect(r.events).toContainEqual({ t: 'hurt', amount: 1, cause: 'spikes', at: { x: 2, y: 1 } });
  expect(r.state.hearts).toBe(HEARTS - 1);
});

test('goblin alerts (no move), chases, winds up next to you, then lunges at the marked tile', () => {
  let s = start(floor(['######', '#@..g#', '######']));
  const t1 = step(s, 'W');
  expect(t1.events).toEqual([{ t: 'alert', id: 0 }]);
  expect(t1.state.enemies[0]).toMatchObject({ x: 4, mode: 'alert' });
  s = t1.state;
  const t2 = step(s, 'W');
  expect(t2.events).toEqual([{ t: 'enemyMove', id: 0, from: { x: 4, y: 1 }, to: { x: 3, y: 1 } }]);
  const t3 = step(t2.state, 'W');
  expect(t3.events).toEqual([{ t: 'enemyMove', id: 0, from: { x: 3, y: 1 }, to: { x: 2, y: 1 } }]);
  const t4 = step(t3.state, 'W');
  expect(t4.events).toEqual([{ t: 'windup', id: 0 }]);
  expect(t4.state.enemies[0]).toMatchObject({ mode: 'windup', aim: [{ x: 1, y: 1 }] });
  const t5 = step(t4.state, 'W');
  expect(t5.events).toEqual([{ t: 'enemyAttack', id: 0, at: { x: 1, y: 1 } }, { t: 'hurt', amount: 1, cause: 'goblin', at: { x: 1, y: 1 } }]);
  const kill = step(t5.state, 'R');
  expect(kill.events.slice(0, 2)).toEqual([{ t: 'attack', id: 0, at: { x: 2, y: 1 } }, { t: 'kill', id: 0, at: { x: 2, y: 1 } }]);
  expect(kill.state.enemies).toEqual([]);
});

test('torch out, then dark damage every 2 turns on a non-mercy floor', () => {
  const { state, events } = run(start(floor(['###', '#@#', '###'], 2)), ['W', 'W', 'W', 'W', 'W', 'W']);
  expect(events.filter((e) => e.t === 'torchOut')).toHaveLength(1);
  expect(events.filter((e) => e.t === 'hurt')).toEqual([
    { t: 'hurt', amount: 1, cause: 'dark', at: { x: 1, y: 1 } },
    { t: 'hurt', amount: 1, cause: 'dark', at: { x: 1, y: 1 } },
  ]);
  expect(state.hearts).toBe(HEARTS - 2);
  expect(state.torch).toBe(0);
});

test('dead beats won; ended runs ignore steps', () => {
  const s0 = start(floor(['#####', '#@>g#', '#####']));
  const s: State = { ...s0, hearts: 1, enemies: s0.enemies.map((e) => ({ ...e, mode: 'windup' as const, aim: [{ x: 2, y: 1 }] })) };
  const r = step(s, 'R');
  expect(r.state.ended).toEqual({ kind: 'dead', cause: 'goblin' });
  expect(r.events.map((e) => e.t)).not.toContain('won');
  expect(step(r.state, 'L')).toEqual({ state: r.state, events: [] });
  const win = step(start(floor(['####', '#@>#', '####'])), 'R');
  expect(win.state.ended?.kind).toBe('won');
  expect(win.events.at(-1)).toEqual({ t: 'won' });
});

test('fog: start lit, walls block, seen tiles are remembered', () => {
  const s = start(floor(['#####', '#@#.#', '#####']));
  const v = visibility(s);
  expect(v[1 * 5 + 1]).toBe(2);
  expect(v[1 * 5 + 2]).toBe(2);
  expect(v[1 * 5 + 3]).toBe(0);
  const f = start(FLOOR_0);
  const w = FLOOR_0.rows[0]?.length ?? 0;
  expect(visibility(f)[1 * w + 1]).toBe(2);
  const away = run(f, ['R', 'R', 'R']).state;
  expect(visibility(away)[1 * w + 1]).toBe(1);
});

test('replay equals folding step, and is stable', () => {
  for (let i = 0; i < 50; i++) {
    const log = randomLog(i + 1, 200);
    expect(replay(FLOOR_0, log)).toEqual(run(start(FLOOR_0), log).state);
  }
  const log = randomLog(7, 200);
  const first = JSON.stringify(replay(FLOOR_0, log));
  for (let i = 0; i < 100; i++) expect(JSON.stringify(replay(FLOOR_0, log))).toBe(first);
});

test('Floor 0 cannot kill', () => {
  for (let i = 0; i < 300; i++) {
    let s = start(FLOOR_0);
    for (const a of randomLog(1000 + i, 400)) {
      s = step(s, a).state;
      expect(s.hearts).toBeGreaterThanOrEqual(1);
    }
    expect(s.ended?.kind).not.toBe('dead');
  }
});

test('Floor 0 is finishable in <= 45 turns (BFS over sim states)', () => {
  const key = (s: State) => JSON.stringify([s.pos, s.hasKey, s.tiles, s.enemies, s.hearts]);
  let frontier: { s: State; log: Action[] }[] = [{ s: start(FLOOR_0), log: [] }];
  const seen = new Set([key(frontier[0]!.s)]);
  let found: Action[] | null = null;
  while (!found && frontier.length) {
    const next: typeof frontier = [];
    for (const { s, log } of frontier) {
      for (const a of ['U', 'D', 'L', 'R'] as const) {
        const r = step(s, a).state;
        if (r.ended?.kind === 'won') { found = [...log, a]; break; }
        const k = key(r);
        if (r.ended || seen.has(k)) continue;
        seen.add(k);
        next.push({ s: r, log: [...log, a] });
      }
      if (found) break;
    }
    frontier = next;
  }
  expect(found).not.toBeNull();
  const end = replay(FLOOR_0, found ?? []);
  expect(end.ended?.kind).toBe('won');
  expect(end.turn).toBeLessThanOrEqual(45);
});

// ---- Phase 4: tier table, scenes, items ----

import { DARK, FAMILIES, GOBLINS, IMPS, ITEMS, MECHANISMS, PITS, SKELETONS, SPIKES, TIERS, TRAPS } from '../src/shared/content';
import { SCENES, type Scene } from '../src/shared/scenes';
import { lightRadius, tells } from '../src/shared/sim';

const TABLES = { spikes: SPIKES, goblins: GOBLINS, imps: IMPS, mechanisms: MECHANISMS, skeletons: SKELETONS, pits: PITS, dark: DARK };

test('tier table: every cost is a whole budget point from 1 to 16 (set from measured lethality) and every frame exists', () => {
  for (const f of FAMILIES) {
    for (const t of TIERS) {
      const c = TABLES[f][t].cost;
      expect(Number.isInteger(c) && c >= 1 && c <= 16, `${f} T${t} cost ${c}`).toBe(true);
    }
  }
  const all = [...FAMILIES.flatMap((f) => TIERS.map((t) => TABLES[f][t])), ...Object.values(TRAPS), ...Object.values(ITEMS)];
  for (const entry of all) for (const name of entry.frames) expect(name in PACK || name in SPRITES, name).toBe(true);
});

test('scenes: 28 family cells + 3 traps + 3 items, unique ids, captions of 8 words or fewer, maps 10 wide or less', () => {
  expect(SCENES).toHaveLength(34);
  expect(new Set(SCENES.map((s) => s.id)).size).toBe(34);
  for (const f of FAMILIES) for (const t of TIERS) expect(SCENES.some((s) => s.id === `${f}-${t}`), `${f}-${t}`).toBe(true);
  for (const s of SCENES) {
    expect(s.caption.split(/\s+/).length, s.id).toBeLessThanOrEqual(8);
    for (const row of s.floor.rows) expect(row.length, s.id).toBe(s.floor.rows[0]?.length);
    expect(s.floor.rows[0]?.length ?? 99, s.id).toBeLessThanOrEqual(10);
  }
});

/** Replays a scene, keeping every state (index = turn) and each turn's events. */
const play = (sc: Scene) => {
  const states: State[] = [start(sc.floor)];
  const turns: Event[][] = [[]];
  for (const a of sc.log) {
    const r = step(states[states.length - 1] as State, a);
    expect(r.state.turn, `${sc.id}: every scripted action takes a turn`).toBe(states.length);
    states.push(r.state);
    turns.push(r.events);
  }
  return { states, turns };
};

test.each(SCENES.map((s) => [s.id, s] as const))('scene %s: outcome, timing, and a tell one turn before every hurt', (_, sc) => {
  const { states, turns } = play(sc);
  const hurts = turns.flatMap((ev, turn) => ev.flatMap((e) => (e.t === 'hurt' ? [[turn, e.cause] as const] : [])));
  expect(hurts).toEqual(sc.hurt);
  expect(states.at(-1)?.ended?.kind ?? null).toBe(sc.end);
  // Every hit was readable the turn before: a tell with the same cause on the tile where it landed.
  turns.forEach((ev, turn) => {
    for (const e of ev) {
      if (e.t !== 'hurt') continue;
      const before = tells(states[turn - 1] as State);
      expect(before.some((t) => t.cause === e.cause && t.x === e.at.x && t.y === e.at.y), `${sc.id} t${turn} ${e.cause} at ${e.at.x},${e.at.y}`).toBe(true);
    }
  });
  for (const c of sc.at) {
    const s = states[c.turn] as State;
    const label = `${sc.id} t${c.turn}`;
    if (c.tile) expect(s.tiles[c.tile[1]]?.[c.tile[0]], label).toBe(c.tile[2]);
    if (c.pos) expect([s.pos.x, s.pos.y], label).toEqual(c.pos);
    if (c.hearts !== undefined) expect(s.hearts, label).toBe(c.hearts);
    if (c.torch !== undefined) expect(s.torch, label).toBe(c.torch);
    if (c.light !== undefined) expect(lightRadius(s), label).toBe(c.light);
    if (c.item !== undefined) expect(s.item, label).toBe(c.item);
    if (c.tell) {
      const [x, y, kind] = c.tell;
      expect(tells(s).some((t) => t.x === x && t.y === y && t.kind === kind), `${label} tell ${kind} at ${x},${y}`).toBe(true);
    }
    if (c.enemy) {
      const [id, mode, x, y] = c.enemy;
      const e = s.enemies.find((o) => o.id === id);
      if (mode === 'gone') expect(e, label).toBeUndefined();
      else {
        expect(e?.mode, `${label} enemy ${id}`).toBe(mode);
        if (x !== undefined) expect([e?.x, e?.y], `${label} enemy ${id}`).toEqual([x, y]);
      }
    }
  }
});

test('determinism: every scene replays 100 times to the same state', () => {
  for (const sc of SCENES) {
    const first = JSON.stringify(replay(sc.floor, sc.log));
    for (let i = 0; i < 100; i++) expect(JSON.stringify(replay(sc.floor, sc.log))).toBe(first);
  }
});

const itemFloor = (row: string, torch = 30) => floor(['#########', row, '#########'], torch);

test('items: pick up, swap with the one held, use costs a turn, nothing held costs nothing', () => {
  let s = start(itemFloor('#@pl....#'));
  s = step(s, 'R').state;
  expect(s.item).toBe('potion');
  const swap = step(s, 'R');
  expect(swap.state.item).toBe('oil');
  expect(swap.state.tiles[1]?.[3]).toBe('p'); // the potion lies where the oil was
  expect(swap.events).toContainEqual({ t: 'pickup', item: 'oil', at: { x: 3, y: 1 } });
  const used = step(swap.state, 'I');
  expect(used.state.turn).toBe(swap.state.turn + 1);
  expect(used.state.item).toBeNull();
  expect(step(used.state, 'I')).toEqual({ state: used.state, events: [] });
});

test('items: a potion at full hearts is kept (no turn); hurt, it heals 1; lamp oil adds ITEMS.oil.turns, capped at the floor torch', () => {
  const held = step(start(itemFloor('#@p.....#')), 'R').state;
  expect(step(held, 'I')).toEqual({ state: held, events: [{ t: 'kept', item: 'potion' }] }); // Phase 11g
  const healed = step({ ...held, hearts: HEARTS - 1 }, 'I').state;
  expect([healed.hearts, healed.item, healed.turn]).toEqual([HEARTS, null, held.turn + 1]);
  const low = step(start(itemFloor('#@l.....#', 50)), 'R').state;
  const drained: State = { ...low, torch: 5 };
  expect(step(drained, 'I').state.torch).toBe(5 + ITEMS.oil.turns - 1);
  expect(step(low, 'I').state.torch).toBe(49);
  const out: State = { ...low, torch: 0, darkTurns: 3 };
  expect(step(out, 'I').state.darkTurns).toBe(0);
});

test('Phase 11g: at most one heart a turn; the first source in order takes it and is the cause', () => {
  // Two goblins wind up on you together: before 11g both struck (2 hearts); now one heart goes, to the first by id.
  const s0 = start(floor(['#####', '#g.g#', '#####']));
  const placed: State = { ...s0, pos: { x: 2, y: 1 }, enemies: s0.enemies.map((e) => ({ ...e, mode: 'windup' as const, aim: [{ x: 2, y: 1 }] })) };
  const r = step(placed, 'W');
  expect(r.events.filter((e) => e.t === 'enemyAttack')).toHaveLength(2);
  expect(r.events.filter((e) => e.t === 'hurt')).toEqual([{ t: 'hurt', amount: 1, cause: 'goblin', at: { x: 2, y: 1 } }]);
  expect(r.state.hearts).toBe(HEARTS - 1);
  const last = step({ ...placed, hearts: 1 }, 'W');
  expect(last.state.ended).toEqual({ kind: 'dead', cause: 'goblin' });
});

test('items: a bomb defeats enemies within 1 (8 neighbours), clears spikes within 1, and bombed skeletons never rebuild', () => {
  const s0 = start({ ...floor(['#######', '#.g.K.#', '#^@^..#', '#..g..#', '#######']), tiers: { skeletons: 1 } });
  const s: State = { ...s0, item: 'bomb' };
  const r = step(s, 'I');
  // goblin (2,1) and goblin (3,3) are in reach; the skeleton (4,1) is two tiles away.
  expect(r.state.enemies.map((e) => e.kind)).toEqual(['skeleton']);
  expect(r.state.tiles[2]).toBe('#.....#');
  const pile = start({ ...floor(['#####', '#@K.#', '#####']), tiers: { skeletons: 1 } });
  const hit = step(pile, 'R').state;
  expect(hit.enemies[0]?.mode).toBe('pile');
  const bombed = step({ ...hit, item: 'bomb' }, 'I').state;
  expect(bombed.enemies).toEqual([]);
  for (let i = 0; i < 6; i++) expect(step(bombed, 'W').state.enemies).toEqual([]);
});

test('imp randomness comes from the seeded rng in the state', () => {
  const sc = SCENES.find((s) => s.id === 'imps-3');
  if (!sc) throw new Error('imps-3 missing');
  const a = replay(sc.floor, sc.log), b = replay({ ...sc.floor, seed: 99 }, sc.log);
  expect(a.rng).not.toBe(sc.floor.seed);
  expect(replay(sc.floor, sc.log)).toEqual(a);
  expect(b.rng).not.toBe(a.rng);
});

test('a bone pile is floor for everyone; at 0 it rises only once its tile is empty', () => {
  let s = start({ ...floor(['######', '#@K..#', '######']), tiers: { skeletons: 1 } });
  s = step(s, 'R').state; // strike: pile at (2,1), countdown shows 4
  expect(s.enemies[0]).toMatchObject({ mode: 'pile', timer: 4 });
  s = step(s, 'R').state; // walk onto the pile
  expect(s.pos).toEqual({ x: 2, y: 1 });
  for (let i = 0; i < 5; i++) s = step(s, 'W').state; // stand on it past 0: it stays down
  expect(s.enemies[0]).toMatchObject({ mode: 'pile', timer: 0 });
  expect(tells(s).some((t) => t.kind === 'rebuild')).toBe(true);
  const off = step(s, 'R'); // step off: it gets up that turn
  expect(off.state.enemies[0]?.mode).toBe('chase');
  expect(off.events).toContainEqual({ t: 'rebuild', id: 0 });
});

test('judge: a finished log is replayed into its result; score matches replay', () => {
  const win = 'DRRURRRRDDDDLLLLLL';
  const r = judge(FLOOR_0, win);
  expect(r).toEqual({ ok: true, run: { outcome: 'won', score: score(replay(FLOOR_0, [...win] as Action[])), turns: 18, torch: FLOOR_0.torch - 18, cause: 'stairs', tile: { x: 1, y: 6 }, dealt: 0 } });
  const dead = { ...FLOOR_0, mercy: false, torch: 6 };
  const d = judge(dead, 'WWWWWWWWWWWW');
  expect(d.ok && d.run).toMatchObject({ outcome: 'dead', cause: 'dark', score: 12, tile: { x: 2, y: 2 } });
});

test('judge rejects forged logs: unknown action, a free bump, unfinished, actions after the end, too long, empty', () => {
  const win = 'DRRURRRRDDDDLLLLLL';
  expect(judge(FLOOR_0, 'DRRURRRRDDDDLLLLLX')).toEqual({ ok: false, reason: 'action' });
  expect(judge(FLOOR_0, 'LL' + win)).toEqual({ ok: false, reason: 'free action' }); // the second L bumps the west wall
  expect(judge(FLOOR_0, win.slice(0, -1))).toEqual({ ok: false, reason: 'unfinished' });
  expect(judge(FLOOR_0, win + 'W')).toEqual({ ok: false, reason: 'after end' });
  expect(judge(FLOOR_0, 'W'.repeat(RUN.maxActions + 1))).toEqual({ ok: false, reason: 'length' });
  expect(judge(FLOOR_0, '')).toEqual({ ok: false, reason: 'length' });
});

// ---- Phase 11h (A118): nameless delvers carve from the floor's truth, one in BOT_LIE_IN on purpose false ----
import { BOT_LIE_IN } from '../src/shared/content';
import { botCarving, carvingTrue, floorTiles } from '../src/shared/ghosts';
import { generate } from '../src/shared/gen';

test('carvingTrue judges a trap near, a pocket and a shortest step to the stairs', () => {
  const f: Floor = { depth: 1, mercy: false, seed: 1, torch: 50, rows: [
    '#########',
    '#@.....>#',
    '#.#####.#',
    '#.#^....#',
    '###.#####',
    '###.#####',
    '#########',
  ] };
  expect(carvingTrue(f, { x: 3, y: 5 }, 'trap-ahead')).toBe(true); // spikes two steps up
  expect(carvingTrue(f, { x: 4, y: 1 }, 'trap-ahead')).toBe(false);
  expect(carvingTrue(f, { x: 3, y: 5 }, 'dead-end')).toBe(true); // the spur below the spikes leads nowhere
  expect(carvingTrue(f, { x: 1, y: 3 }, 'dead-end')).toBe(true);
  expect(carvingTrue(f, { x: 4, y: 1 }, 'dead-end')).toBe(false); // on the way from the entrance to the stairs
  expect(carvingTrue(f, { x: 4, y: 1 }, 'stairs-way:R')).toBe(true);
  expect(carvingTrue(f, { x: 4, y: 1 }, 'stairs-way:L')).toBe(false);
  expect(carvingTrue(f, { x: 7, y: 3 }, 'stairs-way:U')).toBe(true);
});

test('bot carvings: true at the floor, a lie one time in BOT_LIE_IN, deterministic by seed', () => {
  let lies = 0, all = 0;
  for (let s = 1; s <= 24; s++) {
    const f = generate(5 + (s % 20), s).floor;
    const tiles = floorTiles(f);
    for (let i = 0; i < tiles.length; i += 4) {
      const at = tiles[i];
      if (!at) continue;
      const c = botCarving(f, at, mulberry32(hash(`bot:${s}:${i}`)));
      if (!c) continue; // no phrase is true here (behind shut bars): the bot carves nothing
      expect(c).toBe(botCarving(f, at, mulberry32(hash(`bot:${s}:${i}`))));
      const lie = mulberry32(hash(`bot:${s}:${i}`))() % BOT_LIE_IN === 0;
      expect(carvingTrue(f, at, c)).toBe(!lie);
      all++;
      if (lie) lies++;
    }
  }
  expect(all).toBeGreaterThan(400);
  expect(lies / all).toBeGreaterThan(0.2);
  expect(lies / all).toBeLessThan(0.3);
});

// A128: the card's count names players and nameless delvers apart (11k: "12 fell" on a floor no player had died on).
import { fellText, ghostView } from '../src/shared/ghosts';
test('ghostView counts bots as nameless, and fellText names them apart', () => {
  const g = (x: number, bot?: true) => ({ name: bot ? null : 'p', x, y: 1, cause: 'spike', at: x, ...(bot ? { bot } : {}) });
  expect(ghostView({ a: g(1), b: g(2, true), c: g(3, true) }, {}, null)).toMatchObject({ fell: 3, nameless: 2 });
  expect(fellText(0, 0)).toBe('0 fell');
  expect(fellText(1, 0)).toBe('1 fell');
  expect(fellText(12, 12)).toBe('12 nameless delvers fell');
  expect(fellText(13, 12)).toBe('1 player and 12 nameless delvers fell');
  expect(fellText(5, 1)).toBe('4 players and 1 nameless delver fell');
});
