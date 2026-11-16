import { expect } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';
import { FLOOR_0 } from '../src/shared/content';
import { bot } from '../src/shared/bot';
import { replay, score, start, step, type Action, type Floor } from '../src/shared/sim';
import { carve, floorFor, ghostsOf, openFloor, purgeBots, seedBots, submitRun } from '../src/server/game';
import { CARVINGS } from '../src/shared/content';
import { zoneOf } from '../src/shared/gen';
import { judge } from '../src/shared/sim';
import { rollover, startFirstFloor } from '../src/server/rollover';

const test = createDevvitTest();
const who = { name: 'testuser' };

/** A finished log as a client sends it: the map bot's run with its free bumps dropped (the client never logs them). */
const played = (floor: Floor, seed = 1) => {
  let s = start(floor);
  const out: Action[] = [];
  for (const a of bot(floor, 100, seed, 'map').log) {
    const next = step(s, a).state;
    if (next !== s) out.push(a);
    s = next;
  }
  return out.join('');
};

test('set-if-absent writes once', async () => {
  await redis.set('k', 'a', { nx: true });
  await redis.set('k', 'b', { nx: true });
  expect(await redis.get('k')).toBe('a');
  expect(await redis.hSetNX('h', 'f', '1')).toBe(1);
  expect(await redis.hSetNX('h', 'f', '2')).toBe(0);
});

test('a stored floor is served as stored: retuning content.ts never changes a floor in play', async () => {
  const first = await openFloor(3);
  expect(JSON.parse((await redis.get('f:3:mods')) ?? '{}')).toMatchObject({ curses: [], traps: [], topFamily: null, deaths: [0, 0, 0, 0, 0, 0, 0, 0, 0] });
  const planted = { ...first, torch: first.torch + 1 }; // stands in for a floor generated under older tuning
  await redis.set('f:3:floor', JSON.stringify(planted));
  expect(await openFloor(3)).toEqual(planted);
});

test('Floor 1 starts once; rollover posts the next floor once per day and moves `game`', async () => {
  expect(await rollover('2026-11-23')).toEqual({ posted: null }); // nothing to roll before Floor 1
  expect((await startFirstFloor()).created).toBe(true);
  expect((await startFirstFloor()).created).toBe(false);
  expect(await redis.hGet('game', 'day')).toBe('1');
  expect(await rollover('2026-11-24')).toEqual({ posted: 2 });
  expect(await rollover('2026-11-24')).toEqual({ posted: null }); // doubled cron: nothing
  expect(await redis.hGet('game', 'day')).toBe('2');
  expect(await redis.get('f:2:floor')).toBeTruthy();
  expect(await rollover('2026-11-25')).toEqual({ posted: 3 });
});

test('GET /api/floor: none before Floor 1, login when logged out, play, then played; a rolled-over floor is closed', async () => {
  expect(await floorFor('t2_a', null)).toEqual({ kind: 'none' });
  await startFirstFloor();
  expect(await floorFor(undefined, 1)).toEqual({ kind: 'login', depth: 1 });
  const f = await floorFor('t2_a', null);
  expect(f.kind).toBe('play');
  if (f.kind !== 'play') return;
  expect(JSON.stringify(f).length).toBeLessThan(50_000);
  expect((await submitRun('t2_a', 1, played(f.floor), who)).kind).toBe('saved');
  expect((await floorFor('t2_a', 1)).kind).toBe('played');
  await rollover('2026-11-24');
  expect(await floorFor('t2_b', 1)).toMatchObject({ kind: 'closed', depth: 1, today: 2 });
  expect((await floorFor('t2_a', 1)).kind).toBe('played'); // your own result still shows on the old post
});

test('POST /api/run: forged logs are rejected; the server derives outcome, score, turns, torch, cause and tile', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  expect(await submitRun('t2_a', 1, 'XYZ', who)).toEqual({ kind: 'rejected', reason: 'action' });
  expect(await submitRun('t2_a', 1, 'W', who)).toEqual({ kind: 'rejected', reason: 'unfinished' });
  expect(await submitRun('t2_a', 2, 'W', who)).toEqual({ kind: 'rejected', reason: 'no such floor' });
  const log = played(floor);
  const r = await submitRun('t2_a', 1, log, who);
  const s = replay(floor, [...log] as Action[]);
  expect(r).toEqual({ kind: 'saved', run: { outcome: s.ended?.kind, score: score(s), turns: s.turn, torch: s.torch, cause: s.ended?.cause, tile: s.pos } });
  const stored = JSON.parse((await redis.hGet('f:1:runs', 't2_a')) ?? '{}');
  expect(stored).toMatchObject({ log, score: score(s) });
  expect(await redis.zScore('f:1:scores', 't2_a')).toBe(score(s));
});

test('one run per user: an identical resubmit returns the stored result, a different log is rejected, racing posts accept one', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  const a = played(floor, 1);
  const dead = 'W'.repeat(floor.torch + 20).slice(0, 1500);
  const first = await submitRun('t2_a', 1, a, who);
  expect(await submitRun('t2_a', 1, a, who)).toEqual(first); // a retry is not a second run
  expect(await submitRun('t2_a', 1, dead, who)).toEqual({ kind: 'rejected', reason: 'already played' });
  // Two different logs submitted at once by one user: exactly one is accepted.
  const both = await Promise.all([submitRun('t2_b', 1, a, who), submitRun('t2_b', 1, dead, who)]);
  expect(both.filter((r) => r.kind === 'saved')).toHaveLength(1);
});

test('a run for a floor that has rolled over is closed and points at today', async () => {
  await startFirstFloor();
  const log = played(await openFloor(1));
  await rollover('2026-11-24');
  expect(await submitRun('t2_a', 1, log, who)).toMatchObject({ kind: 'closed', today: 2 });
});

test('server replay of a depth-28 run stays under 50 ms (§15.3)', async () => {
  await redis.hSet('game', { day: '28' });
  const floor = await openFloor(28);
  const log = played(floor);
  const t0 = performance.now();
  const r = await submitRun('t2_a', 28, log, who);
  const ms = performance.now() - t0;
  console.log(`server judge+store at depth 28: ${ms.toFixed(1)} ms for ${log.length} actions; floor JSON ${JSON.stringify(floor).length} bytes`);
  expect(r.kind).toBe('saved');
  expect(ms).toBeLessThan(50);
});

test('Floor 0 is local: the server has no Floor 0', async () => {
  await startFirstFloor();
  expect(await submitRun('t2_a', FLOOR_0.depth, 'DRRURRRRDDDDLLLLLL', who)).toEqual({ kind: 'rejected', reason: 'no such floor' });
});

/** A finished log that dies: wait in place until the torch and then the dark run out (always valid, always a death). */
const dies = (floor: Floor) => {
  let s = start(floor);
  let log = '';
  while (!s.ended) {
    s = step(s, 'W').state;
    log += 'W';
  }
  return { log, end: s };
};

test('a death stores a ghost on the replay\'s tile with the context name, plus compass heat and the kill, in one write', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  const { log, end } = dies(floor);
  expect((await submitRun('t2_a', 1, log, { name: 'alice' })).kind).toBe('saved');
  const ghost = JSON.parse((await redis.hGet('f:1:ghosts', 't2_a')) ?? '{}');
  expect(ghost).toMatchObject({ name: 'alice', x: end.pos.x, y: end.pos.y, cause: end.ended?.cause });
  expect(await redis.hGet('f:1:heat', String(zoneOf(end.pos, floor.rows.length)))).toBe('1');
  expect(await redis.hGet('f:1:kills', end.ended?.cause ?? '')).toBe('1');
  // A survivor leaves no ghost.
  const won = played(floor);
  if (replay(floor, [...won] as Action[]).ended?.kind === 'won') {
    await submitRun('t2_b', 1, won, { name: 'bob' });
    expect(await redis.hGet('f:1:ghosts', 't2_b')).toBeUndefined();
  }
});

test('carving rules: wrong id, no death, a survivor, a path without a direction, a second different carving, a closed floor', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  expect(await carve('t2_a', 1, 'trap-ahead')).toEqual({ kind: 'rejected', reason: 'no death' });
  await submitRun('t2_a', 1, dies(floor).log, { name: 'alice' });
  expect(await carve('t2_a', 1, 'free text')).toEqual({ kind: 'rejected', reason: 'carving' });
  expect(await carve('t2_a', 1, 'safe-way')).toEqual({ kind: 'rejected', reason: 'carving' }); // a path needs a direction
  expect(await carve('t2_a', 1, 'trap-ahead:U')).toEqual({ kind: 'rejected', reason: 'carving' }); // a warning has none
  expect(await carve('t2_a', 1, 'safe-way:L')).toEqual({ kind: 'carved', carving: 'safe-way:L' });
  expect(await carve('t2_a', 1, 'safe-way:L')).toEqual({ kind: 'carved', carving: 'safe-way:L' }); // a retry
  expect(await carve('t2_a', 1, 'dead-end')).toEqual({ kind: 'rejected', reason: 'already carved' });
  const won = played(floor);
  if (replay(floor, [...won] as Action[]).ended?.kind === 'won') {
    await submitRun('t2_s', 1, won, { name: 'sam' });
    expect(await carve('t2_s', 1, 'dead-end')).toEqual({ kind: 'rejected', reason: 'no death' });
  }
  await rollover('2026-11-24');
  expect(await carve('t2_a', 1, 'dead-end')).toMatchObject({ kind: 'closed', today: 2 });
  expect(Object.keys(CARVINGS)).toHaveLength(12);
});

test('two carvings posted at once by one player: exactly one is accepted', async () => {
  await startFirstFloor();
  await submitRun('t2_a', 1, dies(await openFloor(1)).log, { name: 'alice' });
  const both = await Promise.all([carve('t2_a', 1, 'dead-end'), carve('t2_a', 1, 'turn-back')]);
  expect(both.filter((r) => r.kind === 'carved')).toHaveLength(1);
});

test('1,000 stored ghosts: GET /api/floor stays under 50 KB and the server time budget; carved first, then newest, own always in', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  const ghosts: Record<string, string> = {};
  const carvings: Record<string, string> = {};
  for (let i = 0; i < 1000; i++) {
    ghosts[`t2_u${i}`] = JSON.stringify({ name: `user_number_${i}`, x: 1 + (i % 9), y: 1 + (i % 5), cause: 'dark', at: i });
    if (i % 7 === 0) carvings[`t2_u${i}`] = 'stairs-way:R';
  }
  await redis.hSet('f:1:ghosts', ghosts);
  await redis.hSet('f:1:carvings', carvings);
  await redis.hSet('f:1:runs', { t2_u3: JSON.stringify({ outcome: 'dead', score: 1, turns: 1, torch: 0, cause: 'dark', tile: { x: 4, y: 4 }, log: 'W', at: 3 }) });
  const t0 = performance.now();
  const r = await floorFor('t2_u3', 1);
  const ms = performance.now() - t0;
  const bytes = JSON.stringify(r).length;
  console.log(`floor with 1,000 ghosts: ${bytes} bytes, ${ms.toFixed(1)} ms`);
  expect(bytes).toBeLessThan(50_000);
  expect(ms).toBeLessThan(50);
  if (r.kind !== 'played') throw new Error(r.kind);
  expect(r.ghosts.fell).toBe(1000);
  expect(r.ghosts.list).toHaveLength(60);
  expect(r.ghosts.list[0]).toMatchObject({ name: 'user_number_3', mine: true });
  expect(r.ghosts.list.slice(1).every((g) => g.carving)).toBe(true); // 143 carved: the 59 newest of them fill the rest
  expect(r.ghosts.list[1]?.name).toBe('user_number_994');
  expect(r.ghosts.tiles.reduce((n, t) => n + t[2], 0)).toBe(1000);
  expect(floor.rows.length).toBeGreaterThan(0);
});

test('ghosts never enter the simulation: the same log scores the same whatever ghosts exist', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  const log = played(floor);
  const before = judge(floor, log);
  const many: Record<string, string> = {};
  for (let i = 0; i < 300; i++) many[`t2_g${i}`] = JSON.stringify({ name: `g${i}`, x: 2, y: 2, cause: 'dark', at: i });
  await redis.hSet('f:1:ghosts', many);
  const r = await submitRun('t2_a', 1, log, who);
  expect(r).toEqual({ kind: 'saved', run: before.ok ? before.run : null });
});

test('bot seeding goes through run validation; bot ghosts are flagged, nameless, count toward heat, and purge removes them with their heat and kills', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  await submitRun('t2_a', 1, dies(floor).log, { name: 'alice' });
  const heatBefore = await redis.hGetAll('f:1:heat');
  const killsBefore = await redis.hGetAll('f:1:kills');
  const s = await seedBots(5);
  expect(s.ghosts).toBe(5);
  const view = await ghostsOf(1, null);
  expect(view.fell).toBe(6);
  const bots = Object.entries(await redis.hGetAll('f:1:ghosts')).filter(([k]) => k.startsWith('bot:'));
  expect(bots).toHaveLength(5);
  for (const [, v] of bots) expect(JSON.parse(v)).toMatchObject({ name: null, bot: true });
  const runs = Object.entries(await redis.hGetAll('f:1:runs')).filter(([k]) => k.startsWith('bot:'));
  expect(runs).toHaveLength(s.runs);
  for (const [, v] of runs) expect(JSON.parse(v).bot).toBe(true);
  const heatSum = (h: Record<string, string>) => Object.values(h).reduce((n, v) => n + Number(v), 0);
  expect(heatSum(await redis.hGetAll('f:1:heat'))).toBe(heatSum(heatBefore) + 5);
  const p = await purgeBots();
  expect(p.removed).toBe(s.runs);
  expect((await ghostsOf(1, null)).fell).toBe(1);
  expect(heatSum(await redis.hGetAll('f:1:heat'))).toBe(heatSum(heatBefore));
  expect(heatSum(await redis.hGetAll('f:1:kills'))).toBe(heatSum(killsBefore));
  expect(Object.keys(await redis.hGetAll('f:1:runs'))).toEqual(['t2_a']);
  expect(await redis.zCard('f:1:scores')).toBe(1);
});
