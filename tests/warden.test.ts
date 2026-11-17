// Phase 10: the Warden. Sim rules first (bumps, the per-run cap, slams and their dodge, tiers), then the shared pool on the
// server: damage only from accepted replays, atomic and never below zero, one kill, carry-over, the memorial.
import { expect, test as plain, vi } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { reddit, redis } from '@devvit/web/server';
import { WARDEN } from '../src/shared/content';
import { generate, isWardenFloor, safePath } from '../src/shared/gen';
import { DIRS, bfs, blocks, find, hazard, width } from '../src/shared/grid';
import { judge, occupies, start, step, wardenTier, type Action, type Floor, type State } from '../src/shared/sim';
import { floorFor, resetRun, seedBots, submitRun } from '../src/server/game';
import { bossDay, memorial, openBoss, setLinks } from '../src/server/boss';
import { chronicle } from '../src/server/boards';
import { rollNow, startFirstFloor } from '../src/server/rollover';

const test = createDevvitTest();

const ARENA = ['#########', '#@......#', '#.......#', '#...WW..#', '#...WW..#', '#.......#', '#......>#', '#########'];
const arena = (depth: number): Floor => ({ depth, rows: ARENA, torch: 300, mercy: false, seed: 1 });
const run = (s: State, log: string) => [...log].reduce((x, a) => step(x, a as Action).state, s);
const warden = (s: State) => s.enemies.find((e) => e.kind === 'warden');

plain('the Warden is one 2×2 enemy; a bump breaks a link, burns no torch, and moves or kills nothing', () => {
  const s0 = start(arena(7));
  expect(s0.enemies).toHaveLength(1);
  expect(warden(s0)).toMatchObject({ x: 4, y: 3 });
  const s1 = run(s0, 'DDR'); // (2,3): left of the block's top row, after walking
  expect(s1.pos).toEqual({ x: 2, y: 3 });
  const before = run(s1, 'R'); // (3,3), adjacent
  const r = step(before, 'R'); // bump
  expect(r.events.map((e) => e.t)).toContain('link');
  expect(r.state.dealt).toBe(1);
  expect(r.state.torch).toBe(before.torch);
  expect(r.state.pos).toEqual(before.pos);
  expect(warden(r.state)).toMatchObject({ x: 4, y: 3 });
});

plain(`a run breaks at most WARDEN.perRun (${WARDEN.perRun}) links; past that a bump is a wall (no turn passes)`, () => {
  let s = run(start({ ...arena(7), mercy: true }), 'DDRR');
  for (let k = 0; k < 200 && s.dealt < WARDEN.perRun; k++) s = step(s, 'R').state;
  expect(s.dealt).toBe(WARDEN.perRun);
  const again = step(s, 'R');
  expect(again.state).toBe(s);
  expect(again.events).toEqual([{ t: 'blocked', at: { x: 4, y: 3 } }]);
});

plain('a slam is marked a turn ahead on a 2-wide band; staying is hurt, one step to a corner dodges', () => {
  // Wake it, then wait beside it until it winds up.
  let s = run(start(arena(7)), 'DDRR');
  for (let k = 0; k < 10 && warden(s)?.mode !== 'windup'; k++) s = step(s, 'W').state;
  const aim = warden(s)?.aim ?? [];
  expect(aim.some((p) => p.x === 3 && p.y === 3)).toBe(true); // its row band reaches the player
  expect(aim.some((p) => p.x === 3 && p.y === 4)).toBe(true); // 2 wide
  expect(aim.some((p) => p.y === 2 || p.y === 5)).toBe(false); // one band only at T1
  const stay = step(s, 'W');
  expect(stay.events).toContainEqual({ t: 'hurt', amount: 1, cause: 'warden', at: { x: 3, y: 3 } });
  const dodge = step(s, 'U'); // (3,2): the block's corner, outside the band
  expect(dodge.events.some((e) => e.t === 'hurt')).toBe(false);
});

plain('tiers: T2 waits less between slams, T3 slams a cross (still dodged at a corner), T4 slams twice', () => {
  expect([7, 14, 21, 28].map((d) => wardenTier(arena(d)))).toEqual([1, 2, 3, 4]);
  const cycle = (depth: number) => {
    let s = run(start({ ...arena(depth), mercy: true }), 'DDRR');
    const marks: number[] = [];
    for (let t = 0; t < 14; t++) {
      if (warden(s)?.mode === 'windup') marks.push(s.turn);
      s = step(s, s.pos.y === 3 ? 'D' : 'U').state; // step between (3,3) and (3,4): always inside the row band
    }
    return { marks, s };
  };
  const gaps = (m: number[]) => m.slice(1).map((v, i) => v - (m[i] ?? 0));
  expect(Math.min(...gaps(cycle(7).marks))).toBeGreaterThan(Math.min(...gaps(cycle(14).marks)));
  let s = run(start(arena(21)), 'DDRR');
  for (let k = 0; k < 10 && warden(s)?.mode !== 'windup'; k++) s = step(s, 'W').state;
  const aim = warden(s)?.aim ?? [];
  expect(aim.some((p) => p.x === 4 && p.y === 2)).toBe(true); // the column band too
  expect(step(s, 'U').events.some((e) => e.t === 'hurt')).toBe(false); // (3,2) is a corner: outside both
  expect(gaps(cycle(28).marks)).toContain(1); // T4: the second slam is marked the turn right after the first
});

plain('darts, arrows and bombs never harm the chained Warden; judge reports the damage a log dealt', () => {
  const bombed = run(start({ ...arena(7), rows: ARENA.map((r, y) => (y === 2 ? '#..b....#' : r)) }), 'DRR');
  expect(bombed.item).toBe('bomb');
  const after = run(bombed, 'I'); // at (3,2), diagonal to the block: inside the blast
  expect(warden(after)).toBeTruthy();
  const r = judge(arena(7), 'DDRR' + 'RRR' + 'UU' + 'RRRR' + 'DDDDD'); // three bumps, then around to the stairs
  expect(r.ok && r.run.dealt).toBe(3);
});

plain('Warden floors: an arena at least 4×4 holds the block and the stairs; gates pass; a walk-past route exists', () => {
  for (const d of [7, 14, 21, 28]) {
    expect(isWardenFloor(d)).toBe(true);
    for (let seed = 1; seed <= 20; seed++) {
      const g = generate(d, seed);
      expect(g.fallback).toBe(0);
      const blocks = g.floor.rows.join('').split('W').length - 1;
      expect(blocks).toBe(4);
      expect(safePath(g.floor)).not.toBeNull();
    }
  }
});

// ---- the shared pool (server) ----

/** A committed player: to the chain, bump, dodge each marked slam, leave while the torch still covers the walk out. */
function fighter(floor: Floor, wanted = WARDEN.perRun): string {
  let s = start(floor);
  const w = width(s.tiles);
  let log = '';
  const walk = (c: string) => !blocks(c) && !hazard(c);
  for (let n = 0; n < 900 && !s.ended; n++) {
    const W = s.enemies.find((e) => e.kind === 'warden');
    const stairs = find(s.tiles, '>')[0] ?? s.pos;
    const aimed = new Set((W?.mode === 'windup' ? W.aim : []).map((p) => p.y * w + p.x));
    const occ = (p: { x: number; y: number }) => s.enemies.some((e) => e.mode !== 'pile' && occupies(e, p));
    const home = bfs(s.tiles, stairs, walk);
    const ok = (p: { x: number; y: number }) => walk(s.tiles[p.y]?.[p.x] ?? '#') && !occ(p) && !aimed.has(p.y * w + p.x);
    const toward = (field: number[]) => DIRS.filter((d) => ok({ x: s.pos.x + d.dx, y: s.pos.y + d.dy }) && (field[(s.pos.y + d.dy) * w + s.pos.x + d.dx] ?? -1) >= 0)
      .sort((a, b) => (field[(s.pos.y + a.dy) * w + s.pos.x + a.dx] ?? 0) - (field[(s.pos.y + b.dy) * w + s.pos.x + b.dx] ?? 0))[0]?.a ?? 'W';
    const leave = !W || s.dealt >= wanted || s.torch <= (home[s.pos.y * w + s.pos.x] ?? 99) + 4 || s.hearts <= 1;
    let a: Action;
    if (aimed.has(s.pos.y * w + s.pos.x)) a = DIRS.find((d) => ok({ x: s.pos.x + d.dx, y: s.pos.y + d.dy }))?.a ?? 'W';
    else if (leave) a = toward(home);
    else {
      const bump = DIRS.find((d) => W && occupies(W, { x: s.pos.x + d.dx, y: s.pos.y + d.dy }));
      const sides = W ? [[-1, 0], [-1, 1], [2, 0], [2, 1], [0, -1], [1, -1], [0, 2], [1, 2]].map(([dx = 0, dy = 0]) => ({ x: W.x + dx, y: W.y + dy })).filter((p) => walk(s.tiles[p.y]?.[p.x] ?? '#') && !occ(p)) : [];
      const near = bfs(s.tiles, s.pos, walk);
      const goal = sides.sort((p, q) => (near[p.y * w + p.x] ?? 999) - (near[q.y * w + q.x] ?? 999))[0];
      a = bump ? bump.a : goal ? toward(bfs(s.tiles, goal, walk)) : toward(home);
    }
    const next = step(s, a).state;
    const used: Action = next === s ? 'W' : a;
    s = step(s, used).state;
    log += used;
  }
  return log;
}
const toWarden = async () => {
  await startFirstFloor();
  for (let i = 0; i < 6; i++) await rollNow();
  const f: Floor = JSON.parse((await redis.get('f:7:floor')) ?? 'null');
  return f;
};
const boss = async () => redis.hGetAll('boss:0');
/** A fighting log that deals damage and ends the run on this floor (found by trying a few link targets). */
const damaging = (f: Floor) => {
  for (const want of [WARDEN.perRun, 20, 12, 6, 3]) {
    const log = fighter(f, want);
    const j = judge(f, log);
    if (j.ok && j.run.dealt > 0) return { log, dealt: j.run.dealt };
  }
  throw new Error('no damaging log');
};

test('pool (A42): 12 links per real player on the floor before, at least 5 players; posted with the floor', { timeout: 60_000 }, async () => {
  await toWarden();
  expect(await boss()).toMatchObject({ depth: '7', pool: String(WARDEN.perPlayer * WARDEN.minPlayers), dealt: '0', carried: '0' });
  const r = await floorFor('t2_a', 7);
  expect(r.kind === 'play' && r.boss).toEqual({ hp: 60, pool: 60, carried: false, killer: null, you: 0 });
});

test('damage (A43): only from an accepted replay; a resend adds nothing; bots deal none; the reset takes it back', { timeout: 60_000 }, async () => {
  const f = await toWarden();
  const { log, dealt } = damaging(f);
  const r = await submitRun('t2_a', 7, log, { name: 'alice' });
  expect(r.kind === 'saved' && r.run.dealt).toBe(dealt);
  expect(await boss()).toMatchObject({ dealt: String(dealt) });
  await submitRun('t2_a', 7, log, { name: 'alice' }); // resend
  await seedBots(5);
  expect(await boss()).toMatchObject({ dealt: String(dealt) });
  expect(await redis.zScore('boss:0:dmg', 't2_a')).toBe(dealt);
  expect(await submitRun('t2_b', 7, log + 'W', { name: 'bob' })).toMatchObject({ kind: 'rejected' }); // forged: not a finished log
  await resetRun('t2_a');
  expect(await boss()).toMatchObject({ dealt: '0' });
  expect(await redis.zScore('boss:0:dmg', 't2_a')).toBeUndefined(); // reset to nothing: out of the damage set
});

test('one kill (A43): two killing blows at once make exactly one kill; HP never shows below zero', { timeout: 60_000 }, async () => {
  const f = await toWarden();
  const { log, dealt } = damaging(f);
  await redis.hSet('boss:0', { pool: String(dealt) }); // either run alone finishes it
  const [a, b] = await Promise.all([submitRun('t2_a', 7, log, { name: 'alice' }), submitRun('t2_b', 7, log, { name: 'bob' })]);
  expect(a.kind).toBe('saved');
  expect(b.kind).toBe('saved');
  const h = await boss();
  expect(['t2_a', 't2_b']).toContain(h.killer);
  expect(Number(h.dealt)).toBe(2 * dealt); // both runs' damage is recorded; HP is derived and floors at zero
  const v = await floorFor('t2_c', 7);
  expect(v.kind === 'play' && v.boss).toMatchObject({ hp: 0, killer: h.killer === 't2_a' ? 'alice' : 'bob' });
});

test('killed mid-day (A46): later players get the floor without the Warden; a run begun before the kill still counts', { timeout: 60_000 }, async () => {
  const f = await toWarden();
  const { log } = damaging(f);
  await redis.hSet('boss:0', { killer: 't2_x', killerName: 'xena' });
  const later = await floorFor('t2_c', 7);
  expect(later.kind === 'play' && later.floor.rows.join('').includes('W')).toBe(false);
  expect(later.kind === 'play' && later.boss?.killer).toBe('xena');
  const fallenLog = fighter(later.kind === 'play' ? later.floor : f); // no Warden: it just walks to the stairs
  expect(await submitRun('t2_c', 7, fallenLog, { name: 'cat' })).toMatchObject({ kind: 'saved', run: { dealt: 0 } });
  expect(await submitRun('t2_d', 7, log, { name: 'dan' })).toMatchObject({ kind: 'saved' }); // began on the living floor
});

test('carry-over (A44): unbeaten, the next Warden keeps its leftover links, never more than a fresh pool; a kill resets it', async () => {
  await redis.hSet('boss:0', { depth: '7', pool: '100', fresh: '100', dealt: '30', carried: '0' });
  expect(await openBoss(14, 20)).toMatchObject({ pool: 70, fresh: 240, carried: true });
  await redis.hSet('boss:1', { pool: '300', fresh: '300', dealt: '0', depth: '14' });
  await redis.hDel('boss:2', ['pool']);
  expect(await openBoss(21, 0)).toMatchObject({ pool: 60, fresh: 60, carried: true }); // 300 left, capped at fresh
  await redis.hSet('boss:2', { killer: 't2_k' });
  expect(await openBoss(28, 0)).toMatchObject({ pool: 60, carried: false });
  expect(await bossDay(21, 0)).toMatchObject({ killed: true });
});

test('memorial (A45): posted once even when asked twice at once or again later; never for a live Warden', async () => {
  await redis.hSet('names', { t2_a: 'alice', t2_b: 'bob' });
  await redis.hSet('boss:0', { depth: '7', pool: '10', dealt: '12', killer: 't2_a', killerName: 'alice' });
  await redis.zAdd('boss:0:dmg', { member: 't2_a', score: 8 }, { member: 't2_b', score: 4 });
  const [x, y] = await Promise.all([memorial(0), memorial(0)]);
  expect([x, y].filter(Boolean)).toHaveLength(1);
  expect((await boss()).memorial).toBe(x ?? y);
  expect(await memorial(0)).toBeNull(); // asked again later (the rollover's retry): nothing new
  await redis.hSet('boss:1', { depth: '14', pool: '10', dealt: '0' });
  expect(await memorial(1)).toBeNull();
});

test('the Warden\'s day in the rollover: the summary and Chronicle report it, and the next floor posts whatever happens', { timeout: 60_000 }, async () => {
  await toWarden();
  await redis.hSet('boss:0', { dealt: '40' });
  await redis.zAdd('boss:0:dmg', { member: 't2_a', score: 25 }, { member: 't2_b', score: 15 });
  await redis.hSet('f:7:real', { cleared: '3', fell: '1' }); // four real runs, two of them broke links
  expect(await rollNow()).toEqual({ posted: 8 });
  const row = (await chronicle()).rows[0];
  expect(row).toMatchObject({ depth: 7, warden: { hp: 20, pool: 60, killed: false, runs: 4, fighters: 2, links: 40, mean: 10, median: 0, max: 25 } });
  await redis.del('boss:1');
});

test('a memorial post that fails frees its claim, so the rollover\'s next ask posts it', async () => {
  await redis.hSet('boss:0', { depth: '7', pool: '10', dealt: '10', killer: 't2_a', killerName: 'alice' });
  const spy = vi.spyOn(reddit, 'submitPost').mockRejectedValueOnce(new Error('reddit down'));
  expect(await memorial(0)).toBeNull();
  expect((await boss()).memorial).toBeUndefined();
  expect(await memorial(0)).toMatch(/^t3_/);
  spy.mockRestore();
});

test('dev tool: set the Warden\'s remaining links (at least 1, so a real run makes the kill); refused once it has fallen', { timeout: 60_000 }, async () => {
  const f = await toWarden();
  const { log, dealt } = damaging(f);
  expect(await setLinks(7, dealt)).toMatchObject({ hp: dealt, pool: 60 });
  expect(await setLinks(7, 0)).toMatchObject({ hp: 1 }); // never kills it by itself
  expect(await setLinks(7, 999)).toMatchObject({ hp: 60 }); // never more than the pool
  await setLinks(7, dealt);
  expect(await submitRun('t2_a', 7, log, { name: 'alice' })).toMatchObject({ kind: 'saved' });
  expect((await boss()).killer).toBe('t2_a');
  await resetRun('t2_a'); // the reset takes the links back, but a kill stands: a fallen Warden always shows 0
  const after = await floorFor('t2_b', 7);
  expect(after.kind === 'play' && after.boss).toMatchObject({ hp: 0, killer: 'alice' });
  expect(await setLinks(7, 10)).toBeNull();
  expect(await setLinks(8, 10)).toBeNull(); // no Warden on that floor
  expect((await bossDay(7, 1))?.stats.links).toBe(0); // the tool's links never count as players' (the run was reset)
});
