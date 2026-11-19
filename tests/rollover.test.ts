// Phase 8: the rollover. Its own file so Vitest runs it in parallel (the 28-day run is the slowest test in the suite).
import { expect } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';
import { BAND, FLOOR_0, LADDER_REACH, type Curse, PLAIN_BAND, TRAP_MAX, TRAP_ZONE_MAX } from '../src/shared/content';
import { EMPTY_TALLY, fairSeed, setAside, modsFrom, plainBand, rolloverFloor, topFamily, winPct, type Tally } from '../src/shared/crowd';
import { generate, NO_MODS, safePath, zoneWeights, type Mods, type Trap } from '../src/shared/gen';
import { zoneOf } from '../src/shared/grid';
import { start, step, type Floor } from '../src/shared/sim';
import { floorFor, floorSeed, logStart, openFloor, placeTrap, resetRun, seedBots, submitRun, voteCurse } from '../src/server/game';
import { rollNow, rollover, startFirstFloor, summary } from '../src/server/rollover';

const test = createDevvitTest();
const stored = async (d: number): Promise<Floor> => JSON.parse((await redis.get(`f:${d}:floor`)) ?? 'null');

test('Floor 0 flag lives on the server: a player with a stored start and empty browser storage starts a fresh run, and it is accepted', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  expect(await floorFor('t2_a', 1)).toMatchObject({ kind: 'play', tutorial: false });
  await logStart('t2_a', 0); // Floor 0 finished in a browser whose storage is now gone
  await logStart('t2_a', 1); // and a start on the day's floor
  const r = await floorFor('t2_a', 1);
  expect(r).toMatchObject({ kind: 'play', tutorial: true, attempt: 0 });
  let s = start(floor);
  let log = '';
  while (!s.ended) {
    s = step(s, 'W').state;
    log += 'W';
  }
  expect((await submitRun('t2_a', 1, log, { name: 'alice' })).kind).toBe('saved');
});

test('shares, not counts: under 3 deaths stay uniform; 5 deaths show; 1,000 rank like 100; a zone under 5% counts as other', () => {
  expect(zoneWeights([0, 0, 0, 0, 2, 0, 0, 0, 0])).toEqual(Array(9).fill(10));
  expect(zoneWeights([0, 0, 0, 0, 5, 0, 0, 0, 0])[4]).toBe(22);
  const hundred = zoneWeights([10, 40, 0, 0, 30, 0, 20, 0, 0]);
  expect(zoneWeights([100, 400, 0, 0, 300, 0, 200, 0, 0])).toEqual(hundred);
  expect(zoneWeights([1, 600, 0, 0, 399, 0, 0, 0, 0])[0]).toBe(8); // 0.1%: "other", not ranked third
  expect(topFamily({ goblin: 2, spikes: 2 })).toBeNull(); // under CROWD.minKills
  expect(topFamily({ goblin: 3, imp: 3, trap: 9 })).toBe('goblins'); // tie: FAMILIES order; traps name no family
  expect(topFamily({ arrow: 2, skeleton: 2, dark: 3 })).toBe('skeletons'); // arrows are skeletons
});

test('trap selection: 5 survivors all placed; 1,000 survivors cap at 12 and 3 per zone, the same every time', () => {
  const many = (n: number): Trap[] => Array.from({ length: n }, (_, i) => ({ zone: i % 9, kind: (['spikes', 'dart', 'stairs'] as const)[i % 3] ?? 'spikes', owner: `t2_${i}`, name: `p${i}` }));
  const five = generate(8, 77, { ...NO_MODS, traps: many(5) }).floor.traps ?? [];
  expect(five).toHaveLength(5); // a trap whose zone has no valid tile moves to the nearest zone that has one (A25)
  const a = generate(8, 77, { ...NO_MODS, traps: many(1000) }).floor;
  const b = generate(8, 77, { ...NO_MODS, traps: many(1000) }).floor;
  expect(a.traps).toEqual(b.traps);
  expect((a.traps ?? []).length).toBeLessThanOrEqual(TRAP_MAX);
  const side = a.rows.length;
  const perZone = new Map<number, number>();
  for (const t of a.traps ?? []) perZone.set(zoneOf(t, side), (perZone.get(zoneOf(t, side)) ?? 0) + 1);
  // darts sit on a wall in their zone; every zone holds at most TRAP_ZONE_MAX
  expect(Math.max(...perZone.values())).toBeLessThanOrEqual(TRAP_ZONE_MAX);
});

test('the ladder (A121): full, no crowd, reroll, moved traps, fewer traps, plain; each taken when the one before fails', { timeout: 60_000 }, () => {
  const traps: Trap[] = [{ zone: 4, kind: 'spikes', owner: 't2_o', name: 'olga' }, { zone: 2, kind: 'stairs', owner: 't2_p', name: 'pia' }];
  const tally: Tally = { deaths: [0, 0, 0, 0, 9, 0, 0, 0, 0], kills: { goblin: 5 }, curseVotes: { frail: 2 }, traps };
  // The base floor (no traps, no crowd weights) is the plain floor itself, so the band always holds; the first n floors
  // that carry players' traps or crowd weights report a generator fallback.
  const failing = (n: number) => {
    let calls = 0;
    return (d: number, s: number, m: Mods) => {
      const g = generate(d, s, NO_MODS);
      return !m.traps.length && m.deaths.every((x) => !x) && !m.topFamily ? g : calls++ < n ? { ...g, fallback: 1 } : g;
    };
  };
  expect(rolloverFloor(5, 11, tally, failing(0)).step).toBe('full');
  expect(rolloverFloor(5, 11, tally, failing(1))).toMatchObject({ step: 'no crowd', mods: { curses: ['frail'], topFamily: null, traps } });
  const re = rolloverFloor(5, 11, tally, failing(2));
  expect(re.step).toBe('reroll');
  expect(re.seed).toBeGreaterThan(rolloverFloor(5, 11, tally, failing(0)).seed);
  const moved = rolloverFloor(5, 11, tally, failing(2 + LADDER_REACH.rerolls));
  expect(moved.step).toBe('moved traps');
  expect(moved.mods.traps.map((t) => t.slot)).toEqual([1, 1]);
  const fewer = rolloverFloor(5, 11, tally, failing(2 + LADDER_REACH.rerolls + LADDER_REACH.trapMoves));
  expect(fewer.step).toBe('fewer traps');
  expect(fewer.mods.traps).toHaveLength(1); // one trap dropped, not both
  expect(fewer.mods.curses).toEqual(['frail']);
  const none = rolloverFloor(5, 11, tally, failing(99));
  expect(none).toMatchObject({ step: 'fewer traps', mods: { curses: ['frail'], traps: [] } }); // the curse outlives every trap
  // The plain floor only when the cursed base floor can't be made at all.
  const broken = (d: number, s: number, m: Mods) => ({ ...generate(d, s, NO_MODS), fallback: m === NO_MODS ? 0 : 1 });
  expect(rolloverFloor(5, 11, tally, broken)).toMatchObject({ step: 'plain', mods: NO_MODS });
});

test('the curse is the crowd\'s to make the day harder (A121): its own cost never counts against the band; a deadly trap still does', { timeout: 60_000 }, () => {
  const tally: Tally = { deaths: NO_MODS.deaths, kills: {}, curseVotes: { frail: 1 }, traps: [{ zone: 4, kind: 'spikes', owner: 't2_o', name: 'olga' }] };
  const base = (d: number, s: number) => generate(d, s, NO_MODS);
  // A curse that alone leaves 2 turns of torch (deadly), and a trap that changes nothing.
  const cursedDeadly = (d: number, s: number, m: Mods) => {
    const g = base(d, s);
    return m.curses.length ? { ...g, floor: { ...g.floor, torch: 2 } } : g;
  };
  const kept = rolloverFloor(5, 11, tally, cursedDeadly);
  expect(kept.step).toBe('full');
  expect(kept.mods.curses).toEqual(['frail']);
  // A trap that makes the floor deadly is refused and goes, while the curse stays.
  const trapDeadly = (d: number, s: number, m: Mods) => {
    const g = base(d, s);
    return m.traps.length ? { ...g, floor: { ...g.floor, torch: 2 } } : g;
  };
  const r = rolloverFloor(5, 11, tally, trapDeadly);
  expect(r).toMatchObject({ step: 'fewer traps', mods: { curses: ['frail'], traps: [] } });
  expect(r.tried[0]?.why).toMatch(/plain/);
});

test('rollover turns the tally into tomorrow: curse, heat, owned traps and yesterday are in the stored floor', async () => {
  await startFirstFloor();
  const floor = await openFloor(1);
  // A winner votes and sets a trap; bots die to make heat.
  let s = start(floor);
  const { bot } = await import('../src/shared/bot');
  let win = '';
  for (let seed = 1; seed < 50 && !win; seed++) {
    s = start(floor);
    let log = '';
    for (const a of bot(floor, 100, seed, 'map').log) {
      const n = step(s, a).state;
      if (n !== s) log += a;
      s = n;
    }
    if (s.ended?.kind === 'won') win = log;
  }
  await submitRun('t2_w', 1, win, { name: 'winnie' });
  await voteCurse('t2_w', 1, 'overrun');
  await placeTrap('t2_w', 1, 4, 'spikes', 'winnie');
  await seedBots(6);
  expect(await rollover('2026-11-24')).toEqual({ posted: 2 });
  const f2 = await stored(2);
  expect(f2.curses).toEqual(['overrun']);
  expect(f2.yesterday).toMatchObject({ depth: 1, fell: 6, curse: 'overrun' });
  expect(f2.yesterday?.cleared).toBeGreaterThanOrEqual(1); // the winner, plus any bot that survived
  expect(JSON.parse((await redis.get('f:2:mods')) ?? '{}')).toMatchObject({ curses: ['overrun'] });
  const owned = f2.traps?.find((t) => t.owner === 't2_w');
  if (f2.traps?.length) expect(owned).toMatchObject({ kind: 'spikes', name: 'winnie' }); // placed unless the ladder dropped it
  expect(safePath(f2)).not.toBeNull();
  expect(JSON.parse((await redis.hGet('chronicle', '1')) ?? '{}')).toMatchObject({ depth: 1, fell: 6 });
  // Idempotent: a doubled cron, and "Roll over now" after the cron, both find the depth already opened.
  expect(await rollover('2026-11-24')).toEqual({ posted: null });
  expect(await redis.hGet('game', 'day')).toBe('2');
  expect(summary(f2.yesterday ?? { depth: 1, fell: 0, cleared: 0, zone: null, curse: null }, 1)).toMatch(/Yesterday on Floor 1: 6 delvers fell.*Overrun/);
});

test('"Roll over now" claims no date: the daily cron still runs that day; two presses at once post one floor', async () => {
  await startFirstFloor();
  await openFloor(1);
  const both = await Promise.all([rollNow(), rollNow()]);
  expect(both.filter((r) => r.posted === 2)).toHaveLength(1);
  expect(await rollover('2026-11-24')).toEqual({ posted: 3 }); // the cron opens the next one
  expect(await rollover('2026-11-24')).toEqual({ posted: null });
});

test('rollover with 1,000 runs on the floor stays bounded: a few reads, 200 flairs, the rest scheduled', async () => {
  await startFirstFloor();
  await openFloor(1);
  const runs: Record<string, string> = {};
  const flair: Record<string, string> = {};
  for (let i = 0; i < 1000; i++) {
    runs[`t2_u${i}`] = JSON.stringify({ outcome: 'won', score: 1000, turns: 9, torch: 1, cause: 'stairs', tile: { x: 1, y: 1 }, log: 'W'.repeat(400), at: i });
    flair[`t2_u${i}`] = JSON.stringify({ name: `user_${i}`, text: 'Cleared floor 1' });
  }
  await redis.hSet('f:1:runs', runs);
  await redis.hSet('f:1:flair', flair);
  const t0 = performance.now();
  expect(await rollover('2026-11-24')).toEqual({ posted: 2 });
  const ms = performance.now() - t0;
  console.log(`rollover with 1,000 runs: ${ms.toFixed(0)} ms`);
  expect(ms).toBeLessThan(10_000);
  expect(await redis.hLen('f:1:flair')).toBe(800); // 200 now, 800 for the follow-up job
});

test('trap souls: from the victim\'s replay, +1 per hurt and +3 for the kill; a resend gives nothing more; never your own trap; bots none; reset undoes', async () => {
  await startFirstFloor();
  await openFloor(1);
  // A floor whose spikes column is a player's trap: three steps onto it hurt, hurt, kill (non-mercy, 3 hearts).
  const rows = FLOOR_0.rows.map((r) => r.replaceAll('^', 'x'));
  const traps = [2, 3, 4].map((y) => ({ x: 10, y, kind: 'spikes' as const, owner: 't2_o', name: 'olga' }));
  await redis.set('f:1:floor', JSON.stringify({ ...FLOOR_0, rows, mercy: false, seed: 1, traps }));
  const kill = 'DRRURRRRRRRLRLR'; // to the door, onto the trap, then back and forth over it
  const r = await submitRun('t2_v', 1, kill, { name: 'victor' });
  expect(r).toMatchObject({ kind: 'saved', run: { outcome: 'dead', cause: 'trap' } });
  expect(await redis.zScore('souls', 't2_o')).toBe(5); // hurt, hurt, kill
  expect(JSON.parse((await redis.hGet('f:1:ghosts', 't2_v')) ?? '{}')).toMatchObject({ cause: 'trap', by: 'olga' });
  expect(await floorFor('t2_o', 1)).toMatchObject({ myTrap: { kind: 'spikes', hurt: 2, killed: 1 } });
  await submitRun('t2_v', 1, kill, { name: 'victor' }); // a resend
  expect(await redis.zScore('souls', 't2_o')).toBe(5);
  await submitRun('t2_o', 1, kill, { name: 'olga' }); // walking into your own trap
  expect(await redis.zScore('souls', 't2_o')).toBe(5);
  await submitRun('bot:1', 1, kill, { name: null, bot: true }); // a bot victim
  expect(await redis.zScore('souls', 't2_o')).toBe(5);
  await resetRun('t2_v');
  expect(await redis.zScore('souls', 't2_o')).toBe(0);
  expect(await floorFor('t2_o', 1)).toMatchObject({ myTrap: { hurt: 0, killed: 0 } });
});

test('modsFrom: deaths as given (weights happen in generate), top family, resolved curse, all traps with owners', () => {
  const t: Tally = { ...EMPTY_TALLY, deaths: [5, 0, 0, 0, 0, 0, 0, 0, 0], kills: { imp: 4 }, curseVotes: { frail: 1, 'deep-dark': 1 }, traps: [{ zone: 1, kind: 'dart', owner: 'a', name: 'a' }] };
  expect(modsFrom(t)).toEqual({ curses: ['frail'], deaths: [5, 0, 0, 0, 0, 0, 0, 0, 0], topFamily: 'imps', traps: [{ zone: 1, kind: 'dart', owner: 'a', name: 'a' }] });
  expect(floorSeed(2)).not.toBe(floorSeed(3));
});

test('no difficulty spiral: 28 bot-only days through the real rollover stay solvable and inside the band', { timeout: 120_000 }, async () => {
  await startFirstFloor();
  await openFloor(1);
  const rows: string[] = [];
  const t0 = performance.now();
  for (let day = 1; day <= 28; day++) {
    await seedBots(6); // six deaths a day, wherever the bots fall: that is all the crowd there is
    const date = new Date(Date.UTC(2026, 10, 24 + day)).toISOString().slice(0, 10);
    expect(await rollover(date)).toEqual({ posted: day + 1 });
    const f = await stored(day + 1);
    expect(safePath(f), `floor ${day + 1} solvable`).not.toBeNull();
    const win = winPct(f);
    const seed = JSON.parse((await redis.get(`f:${day + 1}:mods`)) ?? '{}').seed; // the seed the plain band chose
    const plain = winPct(generate(day + 1, seed, NO_MODS).floor);
    rows.push(`${day + 1}:${win}/${plain}`);
    // The band (A27): a crowd floor never loses more than BAND.maxDropPct points against the day's plain floor.
    expect(win, `floor ${day + 1}`).toBeGreaterThanOrEqual(plain - BAND.maxDropPct);
  }
  console.log(`28 bot days (stored win % / plain win %): ${rows.join(' ')} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
});

test('plain floor band: around the §8 target line, clamped; the reroll lands inside it (or the closest), the same every time', () => {
  expect(plainBand(1)).toEqual([55, 95]);
  expect(plainBand(28)).toEqual([20, 50]);
  expect(plainBand(60)).toEqual([20, 50]);
  for (const d of [3, 11, 18]) {
    const a = fairSeed(d, 9001);
    const [lo, hi] = plainBand(d);
    expect(a).toEqual(fairSeed(d, 9001));
    if (a.tries < PLAIN_BAND.maxTries) expect(a.win).toBeGreaterThanOrEqual(lo);
    if (a.tries < PLAIN_BAND.maxTries) expect(a.win).toBeLessThanOrEqual(hi);
  }
});

test('what the band set aside (Phase 11h, counted from what landed in 11i): the voted curse and the players\' traps missing from the floor', () => {
  const t: Tally = { deaths: [1, 2, 0, 1, 2, 6, 0, 1, 4], kills: {}, curseVotes: { 'light-sleepers': 1 }, traps: [{ zone: 8, kind: 'stairs', owner: 'local', name: 'me' }] };
  const r = rolloverFloor(10, 1, t);
  const fake = (curses: Curse[], owners: string[]) => ({ ...r, floor: { ...r.floor, curses, traps: owners.map((owner) => ({ x: 1, y: 1, kind: 'stairs' as const, owner, name: null })) } });
  expect(setAside(t, fake(['light-sleepers'], ['local']))).toEqual({ curse: null, traps: 0 });
  expect(setAside(t, fake(['light-sleepers'], []))).toEqual({ curse: null, traps: 1 });
  expect(setAside(t, fake([], []))).toEqual({ curse: 'light-sleepers', traps: 1 });
  expect(setAside(EMPTY_TALLY, fake([], []))).toEqual({ curse: null, traps: 0 });
});
