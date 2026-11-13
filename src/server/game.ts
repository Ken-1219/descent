// Redis reads and writes for floors and runs. Routes pass identity in from the Devvit context; nothing here trusts a body.
import { context, redis } from '@devvit/web/server';
import { generate, NO_MODS, type Mods } from '../shared/gen';
import { hash } from '../shared/rng';
import { judge, type Floor, type RunResult } from '../shared/sim';
import type { FloorResponse, RunResponse } from '../shared/api';

type StoredMods = Mods & { seed: number };
type StoredRun = RunResult & { log: string; at: number };

const key = (d: number, k: 'mods' | 'floor' | 'runs' | 'scores' | 'starts') => `f:${d}:${k}`;

export const today = async (): Promise<{ day: number; postId: string | null }> => {
  const g = await redis.hGetAll('game');
  return { day: Number(g.day ?? 0), postId: g.postId ?? null };
};
export const postUrl = (postId: string | null) => (postId ? `https://www.reddit.com/r/${context.subredditName}/comments/${postId.replace(/^t3_/, '')}` : null);

/**
 * openFloor(depth): write the day's mods and floor once, set-if-absent, and return the stored floor. A redeploy with new
 * tuning never regenerates a floor people are playing: the first write wins and every later read gets that copy.
 * Phase 6 mods are seed only (no curse, uniform zones, no traps); Phases 7–8 fill the same shape from real tallies.
 */
export async function openFloor(depth: number): Promise<Floor> {
  const mods: StoredMods = { ...NO_MODS, seed: hash(`descent:${context.subredditName}:${depth}`) };
  await redis.set(key(depth, 'mods'), JSON.stringify(mods), { nx: true });
  const stored = await storedFloor(depth);
  if (stored) return stored;
  const m: StoredMods = JSON.parse((await redis.get(key(depth, 'mods'))) ?? JSON.stringify(mods));
  const t0 = Date.now();
  const g = generate(depth, m.seed, m);
  if (g.fallback) console.error(`FLOOR FALLBACK: depth ${depth} seed ${m.seed} hit the retry cap; serving fallback level ${g.fallback} (${g.rejected} rejected)`);
  console.log(`floor ${depth}: seed ${m.seed}, ${g.rejected} rejected, ${Date.now() - t0} ms`);
  await redis.set(key(depth, 'floor'), JSON.stringify(g.floor), { nx: true });
  return (await storedFloor(depth)) ?? g.floor;
}

const storedFloor = async (depth: number): Promise<Floor | null> => {
  const s = await redis.get(key(depth, 'floor'));
  return s ? JSON.parse(s) : null;
};

const result = ({ log: _, at: __, ...run }: StoredRun): RunResult => run;

/** GET /api/floor for `user` (undefined when logged out) on the post's depth. */
export async function floorFor(user: string | undefined, depth: number | null): Promise<FloorResponse> {
  const t = await today();
  const d = depth ?? t.day;
  if (!d) return { kind: 'none' };
  if (!user) return { kind: 'login', depth: d };
  const floor = await storedFloor(d);
  if (!floor) return { kind: 'none' };
  const mine = await redis.hGet(key(d, 'runs'), user);
  if (mine) return { kind: 'played', depth: d, seed: floor.seed ?? 0, floor, run: result(JSON.parse(mine)) };
  if (d < t.day) return { kind: 'closed', depth: d, today: t.day, todayUrl: postUrl(t.postId) };
  return { kind: 'play', depth: d, seed: floor.seed ?? 0, floor };
}

/**
 * submitRun: validate and replay against the stored floor, then accept one run per user with hSetNX, so two posts
 * racing can't both win. Resubmitting the identical log is a retry and returns the stored result; any other log is rejected.
 */
export async function submitRun(user: string, depth: number, log: string): Promise<RunResponse> {
  if (!Number.isInteger(depth) || depth < 1) return { kind: 'rejected', reason: 'no such floor' }; // Floor 0 never reaches the server
  const t = await today();
  if (depth < t.day) return { kind: 'closed', today: t.day, todayUrl: postUrl(t.postId) };
  const floor = await storedFloor(depth);
  if (!floor || depth > t.day) return { kind: 'rejected', reason: 'no such floor' };
  const prior = await redis.hGet(key(depth, 'runs'), user);
  if (prior) return retry(JSON.parse(prior), log);
  const j = judge(floor, log);
  if (!j.ok) return { kind: 'rejected', reason: j.reason };
  const run: StoredRun = { ...j.run, log, at: Date.now() };
  if (!(await redis.hSetNX(key(depth, 'runs'), user, JSON.stringify(run)))) {
    const won = await redis.hGet(key(depth, 'runs'), user);
    return won ? retry(JSON.parse(won), log) : { kind: 'rejected', reason: 'already played' };
  }
  await redis.zAdd(key(depth, 'scores'), { member: user, score: run.score });
  return { kind: 'saved', run: j.run };
}

const retry = (prior: StoredRun, log: string): RunResponse => (prior.log === log ? { kind: 'saved', run: result(prior) } : { kind: 'rejected', reason: 'already played' });

/** Run starts are logged, not enforced (§2): the first start per user per floor is kept. */
export const logStart = async (user: string, depth: number) => {
  await redis.hSetNX(key(depth, 'starts'), user, String(Date.now()));
};
