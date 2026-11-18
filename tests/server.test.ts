import { expect } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';
import { BOARD, FLOOR_0 } from '../src/shared/content';
import { bot } from '../src/shared/bot';
import { replay, score, start, step, type Action, type Floor } from '../src/shared/sim';
import { carve, floorFor, ghostsOf, openFloor, placeTrap, purgeBots, resetRun, seedBots, submitRun, tally, voteCarving, voteCurse } from '../src/server/game';
import { resolveCurse } from '../src/shared/gen';
import { CARVINGS } from '../src/shared/content';
import { zoneOf } from '../src/shared/grid';
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
  expect(r).toEqual({ kind: 'saved', run: { outcome: s.ended?.kind, score: score(s), turns: s.turn, torch: s.torch, cause: s.ended?.cause, tile: s.pos, dealt: 0 } });
  const stored = JSON.parse((await redis.hGet('f:1:runs', 't2_a')) ?? '{}');
  expect(stored).toMatchObject({ log, score: score(s) });
  expect(Math.floor(((await redis.zScore('f:1:scores', 't2_a')) ?? 0) / BOARD.order)).toBe(score(s));
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
  const once = performance.now() - t0;
  // The budget is the replay itself, best of five (a loaded CI machine stalls one call, never five): Phase 11e.
  let ms = Infinity;
  for (let i = 0; i < 5; i++) {
    const t1 = performance.now();
    judge(floor, log);
    ms = Math.min(ms, performance.now() - t1);
  }
  console.log(`server judge+store at depth 28: ${once.toFixed(1)} ms once, replay best of 5 ${ms.toFixed(1)} ms, ${log.length} actions; floor JSON ${JSON.stringify(floor).length} bytes`);
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

test('dev reset: clears the caller\'s run, ghost, carving, score, heat and kill on the live floor, and bumps the attempt', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  await submitRun('t2_b', 1, dies(floor).log, { name: 'bob' });
  const heat0 = await redis.hGetAll('f:1:heat');
  await submitRun('t2_a', 1, dies(floor).log, { name: 'alice' });
  await carve('t2_a', 1, 'safe-way:L');
  expect(await resetRun('t2_a')).toEqual({ depth: 1, had: true });
  expect(await redis.hGet('f:1:runs', 't2_a')).toBeUndefined();
  expect(await redis.hGet('f:1:ghosts', 't2_a')).toBeUndefined();
  expect(await redis.hGet('f:1:carvings', 't2_a')).toBeUndefined();
  expect(await redis.zScore('f:1:scores', 't2_a')).toBeUndefined();
  expect(await redis.hGetAll('f:1:heat')).toEqual(heat0);
  expect(await floorFor('t2_a', 1)).toMatchObject({ kind: 'play', attempt: 1 });
  expect((await submitRun('t2_a', 1, dies(floor).log, { name: 'alice' })).kind).toBe('saved'); // plays again
  expect(await redis.hGet('f:1:ghosts', 't2_b')).toBeTruthy(); // nobody else is touched
});

/** A winning log: the map bot on the first seed that wins (the floor is fair, so one does). */
const wins = (floor: Floor) => {
  for (let seed = 1; seed < 50; seed++) {
    const log = played(floor, seed);
    if (replay(floor, [...log] as Action[]).ended?.kind === 'won') return log;
  }
  throw new Error('no winning bot run');
};

test('curse vote and trap: only a stored win, once each (identical resend returns it), closed after rollover', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  expect(await voteCurse('t2_w', 1, 'frail')).toEqual({ kind: 'rejected', reason: 'not a winner' }); // no run yet
  await submitRun('t2_d', 1, dies(floor).log, { name: 'dee' });
  expect(await voteCurse('t2_d', 1, 'frail')).toEqual({ kind: 'rejected', reason: 'not a winner' }); // a loser
  expect(await placeTrap('t2_d', 1, 4, 'spikes')).toEqual({ kind: 'rejected', reason: 'not a winner' });
  await submitRun('t2_w', 1, wins(floor), { name: 'win' });
  expect(await voteCurse('t2_w', 1, 'nonsense')).toEqual({ kind: 'rejected', reason: 'curse' });
  expect(await voteCurse('t2_w', 1, 'frail')).toEqual({ kind: 'voted', vote: 'frail', standings: [['frail', 1]] });
  expect(await voteCurse('t2_w', 1, 'frail')).toEqual({ kind: 'voted', vote: 'frail', standings: [['frail', 1]] }); // retry
  expect(await voteCurse('t2_w', 1, 'overrun')).toEqual({ kind: 'rejected', reason: 'already voted' });
  expect(await placeTrap('t2_w', 1, 9, 'spikes')).toEqual({ kind: 'rejected', reason: 'trap' });
  expect(await placeTrap('t2_w', 1, 2, 'lava')).toEqual({ kind: 'rejected', reason: 'trap' });
  expect(await placeTrap('t2_w', 1, 2, 'dart')).toEqual({ kind: 'placed', trap: { zone: 2, kind: 'dart' } });
  expect(await placeTrap('t2_w', 1, 2, 'dart')).toEqual({ kind: 'placed', trap: { zone: 2, kind: 'dart' } });
  expect(await placeTrap('t2_w', 1, 5, 'dart')).toEqual({ kind: 'rejected', reason: 'already placed' });
  expect(await floorFor('t2_w', 1)).toMatchObject({ kind: 'played', choices: { curse: 'frail', standings: [['frail', 1]], trap: { zone: 2, kind: 'dart' } } });
  // Other players never see someone else's trap, nor the standings before voting.
  expect(await floorFor('t2_d', 1)).toMatchObject({ kind: 'played', choices: { curse: null, standings: null, trap: null } });
  await rollover('2026-11-24');
  expect(await voteCurse('t2_w', 1, 'frail')).toMatchObject({ kind: 'closed', today: 2 });
  expect(await placeTrap('t2_w', 1, 2, 'dart')).toMatchObject({ kind: 'closed', today: 2 });
});

test('simultaneous choices: exactly one of two curse votes, two traps, two carving votes is accepted', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  await submitRun('t2_w', 1, wins(floor), { name: 'win' });
  await submitRun('t2_a', 1, dies(floor).log, { name: 'alice' });
  await carve('t2_a', 1, 'trap-ahead');
  const curse = await Promise.all([voteCurse('t2_w', 1, 'frail'), voteCurse('t2_w', 1, 'overrun')]);
  const trap = await Promise.all([placeTrap('t2_w', 1, 1, 'spikes'), placeTrap('t2_w', 1, 7, 'stairs')]);
  const carv = await Promise.all([voteCarving('t2_w', 1, 't2_a', 'trust'), voteCarving('t2_w', 1, 't2_a', 'liar')]);
  for (const pair of [curse, carv]) expect(pair.filter((r) => r.kind === 'voted')).toHaveLength(1);
  expect(trap.filter((r) => r.kind === 'placed')).toHaveLength(1);
});

test('carving votes: after your run only, not your own, carved ghosts only, once each; honour and souls follow A15–A16', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  await submitRun('t2_a', 1, dies(floor).log, { name: 'alice' });
  await carve('t2_a', 1, 'safe-way:L');
  await submitRun('t2_q', 1, dies(floor).log, { name: 'quiet' }); // dead, no carving
  expect(await voteCarving('t2_x', 1, 't2_a', 'trust')).toEqual({ kind: 'rejected', reason: 'run not ended' });
  expect(await voteCarving('t2_a', 1, 't2_a', 'trust')).toEqual({ kind: 'rejected', reason: 'own carving' });
  await submitRun('t2_d', 1, dies(floor).log, { name: 'dee' });
  await submitRun('t2_w', 1, wins(floor), { name: 'win' });
  expect(await voteCarving('t2_d', 1, 't2_q', 'liar')).toEqual({ kind: 'rejected', reason: 'no carving' });
  expect(await voteCarving('t2_d', 1, 't2_none', 'liar')).toEqual({ kind: 'rejected', reason: 'no such ghost' });
  expect(await voteCarving('t2_d', 1, 't2_a', 'liar')).toEqual({ kind: 'voted', vote: 'liar', standings: null }); // a death: +1 soul
  expect(await voteCarving('t2_d', 1, 't2_a', 'liar')).toEqual({ kind: 'voted', vote: 'liar', standings: null }); // retry: no double count
  expect(await voteCarving('t2_d', 1, 't2_a', 'trust')).toEqual({ kind: 'rejected', reason: 'already voted' });
  expect(await voteCarving('t2_w', 1, 't2_a', 'liar')).toMatchObject({ kind: 'voted' }); // a winner's Liar: counted, no soul
  await submitRun('t2_t', 1, dies(floor).log, { name: 'tee' });
  expect(await voteCarving('t2_t', 1, 't2_a', 'trust')).toMatchObject({ kind: 'voted' }); // +1 honour
  expect(await redis.zScore('souls', 't2_a')).toBe(1);
  expect(await redis.zScore('honour', 't2_a')).toBe(1);
  // Totals reach a viewer whose run has ended, never one still playing; the list is not reordered by them.
  const v = await floorFor('t2_d', 1);
  if (v.kind !== 'played') throw new Error(v.kind);
  expect(v.ghosts.list.find((g) => g.id === 't2_a')).toMatchObject({ votes: { trust: 1, liar: 2 }, myVote: 'liar' });
  const fresh = await floorFor('t2_new', 1);
  if (fresh.kind !== 'play') throw new Error(fresh.kind);
  expect(fresh.ghosts.list.every((g) => g.votes === undefined && g.myVote === undefined)).toBe(true);
  expect(v.ghosts.list.map((g) => g.id)).toEqual((await ghostsOf(1, 't2_d')).list.map((g) => g.id)); // votes never reorder it
});

test('bots: votes on a bot\'s carving are stored but give no souls or honour; bots never hold traps or votes', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  await seedBots(6);
  const carvedBot = Object.keys(await redis.hGetAll('f:1:carvings')).find((k) => k.startsWith('bot:'));
  expect(carvedBot).toBeDefined();
  await submitRun('t2_d', 1, dies(floor).log, { name: 'dee' });
  expect(await voteCarving('t2_d', 1, carvedBot ?? '', 'liar')).toMatchObject({ kind: 'voted' });
  expect(await redis.zScore('f:1:cv', `${carvedBot}:liar`)).toBe(1);
  expect(await redis.zCard('souls')).toBe(0);
  expect(await redis.zCard('honour')).toBe(0);
  expect(Object.keys(await redis.hGetAll('f:1:votes')).every((f) => !f.startsWith('bot:'))).toBe(true);
  expect(await redis.hGetAll('f:1:traps')).toEqual({});
});

test('curse tie-break: most votes wins, a tie goes to the mildest, one voter decides, no voters means no curse', async () => {
  expect(resolveCurse({})).toBeNull();
  expect(resolveCurse({ 'deep-dark': 1 })).toBe('deep-dark');
  expect(resolveCurse({ 'deep-dark': 2, frail: 2, overrun: 1 })).toBe('frail'); // frail is milder than deep dark
  expect(resolveCurse({ 'deep-dark': 3, 'light-sleepers': 2 })).toBe('deep-dark');
  expect(resolveCurse({ 'short-wick': 1, overrun: 1, 'light-sleepers': 1 })).toBe('light-sleepers');
  await startFirstFloor();
  const floor = await openFloor(1);
  await submitRun('t2_w', 1, wins(floor), { name: 'win' });
  await voteCurse('t2_w', 1, 'overrun');
  await placeTrap('t2_w', 1, 4, 'spikes');
  const t = await tally(1);
  expect(resolveCurse(t.curseVotes)).toBe('overrun');
  expect(t.traps).toMatchObject([{ owner: 't2_w', zone: 4, kind: 'spikes' }]);
});

test('1,000 ghosts with votes: the played response stays under 50 KB and the server time budget', async () => {
  await startFirstFloor();
  await openFloor(1);
  const ghosts: Record<string, string> = {};
  const carvings: Record<string, string> = {};
  const votes: Record<string, string> = {};
  const cv: { member: string; score: number }[] = [];
  for (let i = 0; i < 1000; i++) {
    ghosts[`t2_u${i}`] = JSON.stringify({ name: `user_number_${i}`, x: 1 + (i % 9), y: 1 + (i % 5), cause: 'dark', at: i });
    carvings[`t2_u${i}`] = 'trap-ahead';
    votes[`t2_u3>t2_u${i}`] = 'trust';
    cv.push({ member: `t2_u${i}:trust`, score: 1 + (i % 50) }, { member: `t2_u${i}:liar`, score: i % 7 });
  }
  await redis.hSet('f:1:ghosts', ghosts);
  await redis.hSet('f:1:carvings', carvings);
  await redis.hSet('f:1:votes', votes);
  await redis.zAdd('f:1:cv', ...cv);
  await redis.hSet('f:1:runs', { t2_u3: JSON.stringify({ outcome: 'dead', score: 1, turns: 1, torch: 0, cause: 'dark', tile: { x: 4, y: 4 }, log: 'W', at: 3 }) });
  const t0 = performance.now();
  const r = await floorFor('t2_u3', 1);
  const ms = performance.now() - t0;
  console.log(`played floor with 1,000 ghosts and votes: ${JSON.stringify(r).length} bytes, ${ms.toFixed(1)} ms`);
  expect(JSON.stringify(r).length).toBeLessThan(50_000);
  expect(ms).toBeLessThan(50);
});

test('dev reset also removes your curse vote, trap and carving votes, and what they gave', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  await submitRun('t2_a', 1, dies(floor).log, { name: 'alice' });
  await carve('t2_a', 1, 'dead-end');
  await submitRun('t2_w', 1, wins(floor), { name: 'win' });
  await voteCurse('t2_w', 1, 'frail');
  await placeTrap('t2_w', 1, 3, 'stairs');
  await voteCarving('t2_w', 1, 't2_a', 'trust');
  expect(await redis.zScore('honour', 't2_a')).toBe(1);
  await resetRun('t2_w');
  expect(await redis.zScore('honour', 't2_a')).toBe(0);
  expect(await redis.zScore('f:1:curse', 'frail')).toBe(0);
  expect(await redis.hGetAll('f:1:traps')).toEqual({});
  expect(await redis.hGetAll('f:1:votes')).toEqual({});
  expect(resolveCurse((await tally(1)).curseVotes)).toBeNull();
});
