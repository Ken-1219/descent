// Phase 9: boards, streaks, the lifetime record, the poll and the Chronicle. Every number is written when a run or a vote
// is accepted; a resend adds nothing; bots never appear; the reset tool takes the caller's entries back.
import { expect } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';
import { BOARD, floorName } from '../src/shared/content';
import { start, step, type Floor } from '../src/shared/sim';
import { bot } from '../src/shared/bot';
import { carve, floorFor, openFloor, placeTrap, resetRun, seedBots, submitRun, voteCarving, voteCurse } from '../src/server/game';
import { purge } from '../src/server/privacy';
import { boardsFor, cardFor, chronicle, nextRollover, pulse } from '../src/server/boards';
import { rollNow, startFirstFloor } from '../src/server/rollover';

const test = createDevvitTest();
const dies = (floor: Floor) => {
  let s = start(floor);
  let log = '';
  while (!s.ended) {
    s = step(s, 'W').state;
    log += 'W';
  }
  return log;
};
const wins = (floor: Floor) => {
  for (let seed = 1; seed < 80; seed++) {
    let s = start(floor);
    let log = '';
    for (const a of bot(floor, 100, seed, 'map').log) {
      const n = step(s, a).state;
      if (n !== s) log += a;
      s = n;
    }
    if (s.ended?.kind === 'won') return log;
  }
  throw new Error('no win');
};
const stored = async (d: number): Promise<Floor> => JSON.parse((await redis.get(`f:${d}:floor`)) ?? 'null');

test('10,000 players: each board is capped to the top 10 plus your own row and rank, inside the size and time budgets', { timeout: 60_000 }, async () => {
  await startFirstFloor();
  const scores: { member: string; score: number }[] = [];
  const names: Record<string, string> = {};
  for (let i = 0; i < 10_000; i++) {
    scores.push({ member: `t2_p${i}`, score: 1000 + (i % 700) });
    names[`t2_p${i}`] = `player_${i}`;
  }
  for (const k of ['deepest', 'souls', 'honour']) await redis.zAdd(k, ...scores);
  await redis.zAdd('f:1:scores', ...scores.map((s, i) => ({ member: s.member, score: s.score * BOARD.order + (BOARD.order - 1 - i) })));
  await redis.hSet('names', names);
  await boardsFor('t2_p1', 1); // warm the in-memory mock once; Redis itself serves these from memory
  // Best of three: one slow read on a loaded machine is load, not the board (Phase 11e: no flaky timing on CI).
  let ms = Infinity;
  let b = await boardsFor('t2_p5', 1); // low score: far outside the top
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    b = await boardsFor('t2_p5', 1);
    ms = Math.min(ms, performance.now() - t0);
  }
  const bytes = JSON.stringify(b).length;
  console.log(`board with 10,000 players: ${bytes} bytes, ${ms.toFixed(1)} ms`);
  expect(bytes).toBeLessThan(50_000);
  expect(ms).toBeLessThan(100);
  expect(b.today.rows).toHaveLength(10);
  expect(b.today.total).toBe(10_000);
  expect(b.today.me).toMatchObject({ name: 'player_5', value: 1005, you: true });
  expect(b.today.me?.rank).toBeGreaterThan(10);
  const top = await boardsFor('t2_p699', 1); // a top score: inside the top rows, marked as you
  expect(top.today.rows.some((r) => r.you && r.name === 'player_699')).toBe(true);
});

test('today\'s ties (A38): equal scores rank the earlier accepted run first, whatever the user ids', async () => {
  await startFirstFloor();
  const f1 = await openFloor(1);
  const log = dies(f1);
  await submitRun('t2_zzz', 1, log, { name: 'first' }); // the higher id, accepted first
  await submitRun('t2_aaa', 1, log, { name: 'second' });
  await submitRun('t2_mmm', 1, log, { name: 'third' });
  const b = await boardsFor('t2_aaa', 1);
  expect(b.today.rows.map((r) => `${r.rank}:${r.name}:${r.value}`)).toEqual([`1:first:${b.today.rows[0]?.value}`, `2:second:${b.today.rows[0]?.value}`, `3:third:${b.today.rows[0]?.value}`]);
  expect(b.today.me?.rank).toBe(2);
  expect(b.today.rows[0]?.value).toBeGreaterThan(0);
});

test('tie rule (A33): equal values go to the higher user id; the caller\'s rank agrees with the rows', async () => {
  await startFirstFloor();
  await redis.zAdd('honour', { member: 't2_aaa', score: 3 }, { member: 't2_ccc', score: 3 }, { member: 't2_bbb', score: 3 }, { member: 't2_zzz', score: 9 });
  await redis.hSet('names', { t2_aaa: 'aaa', t2_bbb: 'bbb', t2_ccc: 'ccc', t2_zzz: 'zzz' });
  const b = await boardsFor('t2_bbb', 1);
  expect(b.honour.rows.map((r) => `${r.rank}:${r.name}`)).toEqual(['1:zzz', '2:ccc', '3:bbb', '4:aaa']);
  expect(b.honour.me?.rank).toBe(3);
});

test('streaks count floors, not dates (A34): consecutive depths continue, a gap restarts, a manual rollover changes nothing by itself', async () => {
  await startFirstFloor();
  await submitRun('t2_s', 1, dies(await openFloor(1)), { name: 'sam' });
  await rollNow();
  await submitRun('t2_s', 2, dies(await stored(2)), { name: 'sam' });
  expect(await floorFor('t2_s', 2)).toMatchObject({ kind: 'played', streak: 2 });
  await rollNow(); // floor 3: sam skips it
  await rollNow(); // floor 4
  await submitRun('t2_s', 4, dies(await stored(4)), { name: 'sam' });
  expect(await floorFor('t2_s', 4)).toMatchObject({ streak: 1 });
});

test('runs write boards once: a resend adds nothing; bots never appear; deepest keeps the deepest; reset puts it all back', async () => {
  await startFirstFloor();
  const f1 = await openFloor(1);
  const win = wins(f1);
  await submitRun('t2_w', 1, win, { name: 'winnie' });
  await submitRun('t2_w', 1, win, { name: 'winnie' }); // a resend
  await seedBots(4);
  const b = await boardsFor('t2_w', 1);
  expect(b.today.rows.map((r) => r.name)).toEqual(['winnie']); // no bots
  expect(b.deepest.rows).toEqual([{ rank: 1, name: 'winnie', value: 1, you: true }]);
  expect(await redis.hGet('streak', 't2_w')).toBe(JSON.stringify({ last: 1, n: 1 }));
  await submitRun('t2_d', 1, dies(f1), { name: 'dee' });
  expect(await redis.zScore('deaths', 't2_d')).toBe(1);
  await resetRun('t2_w');
  await resetRun('t2_d');
  expect(await redis.zScore('deepest', 't2_w')).toBeUndefined();
  expect(await redis.hGet('streak', 't2_w')).toBeUndefined();
  expect(await redis.zScore('deaths', 't2_d')).toBe(0);
  expect((await boardsFor('t2_w', 1)).today.rows).toEqual([]);
});

test('lifetime record on the card (A36): lifetime numbers minus today\'s votes on today\'s carving; bots have none', async () => {
  await startFirstFloor();
  const f1 = await openFloor(1);
  await submitRun('t2_a', 1, dies(f1), { name: 'alice' });
  await carve('t2_a', 1, 'trap-ahead');
  await redis.zIncrBy('honour', 't2_a', 4); // earned on earlier floors
  await redis.zIncrBy('liars', 't2_a', 2);
  await submitRun('t2_v', 1, dies(f1), { name: 'vee' });
  await voteCarving('t2_v', 1, 't2_a', 'liar'); // today: must not show on the card
  expect(await redis.zScore('liars', 't2_a')).toBe(3);
  const card = await cardFor('t2_a', 1);
  expect(card.record).toEqual({ deaths: 1, trust: 4, liar: 2 });
  expect(await cardFor('bot:1', 1)).toEqual({ avatar: null, record: null });
});

test('the poll and the Chronicle: counts only, and one ledger row per floor, newest first', async () => {
  await startFirstFloor();
  await openFloor(1);
  await seedBots(3);
  expect(await pulse(1)).toMatchObject({ fell: 3 });
  await rollNow();
  await rollNow();
  const c = await chronicle();
  expect(c.rows.map((r) => r.depth)).toEqual([2, 1]);
  expect(c.rows[1]).toMatchObject({ depth: 1, fell: 3 });
  // Phase 11g: each row carries its floor's name, from the seed it was generated with.
  for (const r of c.rows) expect(r.name).toBe(floorName((await stored(r.depth)).seed ?? -1));
  expect((await stored(2)).yesterday).toMatchObject({ depth: 1, fell: 3 });
  expect((await stored(2)).yesterday?.deaths?.reduce((a, b) => a + b, 0)).toBe(3);
  expect((await stored(2)).showcase?.length).toBeGreaterThan(0);
  expect(nextRollover(Date.UTC(2026, 10, 16, 9))).toBe(Date.UTC(2026, 10, 16, 15));
  expect(nextRollover(Date.UTC(2026, 10, 16, 16))).toBe(Date.UTC(2026, 10, 17, 15));
});

test('difficulty data (A39): each floor stores its predicted win rate; the Chronicle sets real players (bots excluded) beside it', async () => {
  await startFirstFloor();
  const f1 = await openFloor(1);
  expect(f1.predicted).toMatchObject({ target: 80 });
  expect(f1.predicted?.win).toBeGreaterThanOrEqual(0);
  await seedBots(5); // bots count for the crowd, never for the real result
  await submitRun('t2_w', 1, wins(f1), { name: 'winnie' });
  await submitRun('t2_d', 1, dies(f1), { name: 'dee' });
  await submitRun('t2_e', 1, dies(f1), { name: 'eve' });
  await resetRun('t2_e'); // the reset takes it back out
  await rollNow();
  const row = (await chronicle()).rows[0];
  expect(row).toMatchObject({ depth: 1, predicted: f1.predicted?.win, players: { cleared: 1, fell: 1 } });
  expect((await stored(2)).predicted?.target).toBe(79);
});

test('seeded nameless delvers carve only what a floor can make true or false there (A118)', async () => {
  await startFirstFloor();
  const f1 = await openFloor(1);
  await seedBots(12);
  const carvings = Object.entries(await redis.hGetAll('f:1:carvings'));
  const ghosts = await redis.hGetAll('f:1:ghosts');
  expect(carvings.length).toBeGreaterThan(0);
  for (const [user, c] of carvings) {
    expect(user.startsWith('bot:')).toBe(true);
    expect(c).toMatch(/^(trap-ahead|dead-end|stairs-way:[UDLR])$/);
    expect(JSON.parse(ghosts[user] ?? '{}').bot).toBe(true);
  }
  expect(f1.depth).toBe(1);
});

test('your mark on today (A123): your own facts from the day before, only those that exist, and none after "Delete my data"', { timeout: 60_000 }, async () => {
  await startFirstFloor();
  const f1 = await openFloor(1);
  await submitRun('t2_a', 1, dies(f1), { name: 'ana' });
  await carve('t2_a', 1, 'dead-end');
  await submitRun('t2_b', 1, wins(f1), { name: 'bea' });
  await voteCurse('t2_b', 1, 'frail');
  await placeTrap('t2_b', 1, 4, 'spikes', 'bea');
  await voteCarving('t2_b', 1, 't2_a', 'trust');
  await rollNow();
  const f2 = await openFloor(2);
  const a = await floorFor('t2_a', 2);
  const b = await floorFor('t2_b', 2);
  if (a.kind !== 'play' || b.kind !== 'play') throw new Error('expected play');
  expect(a.yours?.fell?.zone).toBeGreaterThanOrEqual(0);
  expect(a.yours?.carving).toEqual({ carving: 'dead-end', trust: 1, liar: 0 });
  expect(a.yours?.vote).toBeUndefined();
  expect(b.yours?.vote).toMatchObject({ curse: 'frail', won: true, standings: [['frail', 1]] });
  expect(b.yours?.trap).toMatchObject({ kind: 'spikes', waits: !!f2.traps?.some((t) => t.owner === 't2_b') });
  expect(b.yours?.fell).toBeUndefined();
  const stranger = await floorFor('t2_new', 2);
  expect(stranger.kind === 'play' && stranger.yours).toBeFalsy();
  await purge('t2_a');
  const gone = await floorFor('t2_a', 2);
  expect(gone.kind === 'play' && gone.yours).toBeFalsy();
});
