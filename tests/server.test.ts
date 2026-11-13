import { expect } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';
import { FLOOR_0 } from '../src/shared/content';
import { bot } from '../src/shared/bot';
import { replay, score, start, step, type Action, type Floor } from '../src/shared/sim';
import { floorFor, openFloor, submitRun } from '../src/server/game';
import { rollover, startFirstFloor } from '../src/server/rollover';

const test = createDevvitTest();

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
  expect((await submitRun('t2_a', 1, played(f.floor))).kind).toBe('saved');
  expect((await floorFor('t2_a', 1)).kind).toBe('played');
  await rollover('2026-11-24');
  expect(await floorFor('t2_b', 1)).toMatchObject({ kind: 'closed', depth: 1, today: 2 });
  expect((await floorFor('t2_a', 1)).kind).toBe('played'); // your own result still shows on the old post
});

test('POST /api/run: forged logs are rejected; the server derives outcome, score, turns, torch, cause and tile', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  expect(await submitRun('t2_a', 1, 'XYZ')).toEqual({ kind: 'rejected', reason: 'action' });
  expect(await submitRun('t2_a', 1, 'W')).toEqual({ kind: 'rejected', reason: 'unfinished' });
  expect(await submitRun('t2_a', 2, 'W')).toEqual({ kind: 'rejected', reason: 'no such floor' });
  const log = played(floor);
  const r = await submitRun('t2_a', 1, log);
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
  const first = await submitRun('t2_a', 1, a);
  expect(await submitRun('t2_a', 1, a)).toEqual(first); // a retry is not a second run
  expect(await submitRun('t2_a', 1, dead)).toEqual({ kind: 'rejected', reason: 'already played' });
  // Two different logs submitted at once by one user: exactly one is accepted.
  const both = await Promise.all([submitRun('t2_b', 1, a), submitRun('t2_b', 1, dead)]);
  expect(both.filter((r) => r.kind === 'saved')).toHaveLength(1);
});

test('a run for a floor that has rolled over is closed and points at today', async () => {
  await startFirstFloor();
  const log = played(await openFloor(1));
  await rollover('2026-11-24');
  expect(await submitRun('t2_a', 1, log)).toMatchObject({ kind: 'closed', today: 2 });
});

test('server replay of a depth-28 run stays under 50 ms (§15.3)', async () => {
  await redis.hSet('game', { day: '28' });
  const floor = await openFloor(28);
  const log = played(floor);
  const t0 = performance.now();
  const r = await submitRun('t2_a', 28, log);
  const ms = performance.now() - t0;
  console.log(`server judge+store at depth 28: ${ms.toFixed(1)} ms for ${log.length} actions; floor JSON ${JSON.stringify(floor).length} bytes`);
  expect(r.kind).toBe('saved');
  expect(ms).toBeLessThan(50);
});

test('Floor 0 is local: the server has no Floor 0', async () => {
  await startFirstFloor();
  expect(await submitRun('t2_a', FLOOR_0.depth, 'DRRURRRRDDDDLLLLLL')).toEqual({ kind: 'rejected', reason: 'no such floor' });
});
