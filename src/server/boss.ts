// Phase 10: the Warden's shared pool, one per 7-floor cycle: `boss:{c}` hash and the damage sorted set `boss:{c}:dmg`.
// HP is never stored: it is pool − dealt, floored at zero, and `dealt` only moves by one atomic hIncrBy per accepted run
// (or its reset). So the pool can't go below zero and exactly one run's increment crosses it (A43).
import { context, reddit, redis, scheduler } from '@devvit/web/server';
import { WARDEN } from '../shared/content';
import type { BossView } from '../shared/api';

export const cycleOf = (depth: number) => Math.floor((depth - 1) / 7);
const key = (c: number) => `boss:${c}`;
const dmgKey = (c: number) => `boss:${c}:dmg`;

type Boss = { depth: number; pool: number; fresh: number; dealt: number; forced: number; carried: boolean; killer: string | null; killerName: string | null; memorial: string | null };

async function read(c: number): Promise<Boss | null> {
  const h = await redis.hGetAll(key(c));
  if (!h.pool) return null;
  return {
    depth: Number(h.depth), pool: Number(h.pool), fresh: Number(h.fresh ?? h.pool), dealt: Number(h.dealt ?? 0), forced: Number(h.forced ?? 0), carried: h.carried === '1',
    killer: h.killer ?? null, killerName: h.killerName ?? null, memorial: h.memorial ?? null,
  };
}
export const hpOf = (b: Pick<Boss, 'pool' | 'dealt'>) => Math.max(0, b.pool - b.dealt);

/**
 * Open the Warden of floor `depth` once (A42): WARDEN.perPlayer links per real player on yesterday's floor, at least
 * WARDEN.minPlayers. A Warden that survived its last floor comes back with its leftover links, never more than the fresh
 * pool (A44): unbeaten, its HP can only fall from one boss floor to the next, and a kill resets it to fresh.
 */
export async function openBoss(depth: number, players: number): Promise<Boss> {
  const c = cycleOf(depth);
  const fresh = WARDEN.perPlayer * Math.max(WARDEN.minPlayers, players);
  const prev = c > 0 ? await read(c - 1) : null;
  const left = prev && !prev.killer ? hpOf(prev) : 0;
  const pool = left > 0 ? Math.min(left, fresh) : fresh;
  if (await redis.hSetNX(key(c), 'pool', String(pool))) {
    await redis.hSet(key(c), { depth: String(depth), fresh: String(fresh), dealt: '0', carried: left > 0 ? '1' : '0' });
    console.log(`WARDEN floor ${depth}: pool ${pool} (fresh ${fresh} from ${players} players${left > 0 ? `, carried ${left} from floor ${prev?.depth}` : ''})`);
  }
  return (await read(c)) ?? { depth, pool, fresh, dealt: 0, forced: 0, carried: left > 0, killer: null, killerName: null, memorial: null };
}

/** What a player sees: HP, the pool it started from, whether it carried over, who killed it, and your own links. */
export async function bossView(depth: number, user: string | undefined, players: () => Promise<number>): Promise<BossView> {
  const b = (await read(cycleOf(depth))) ?? (await openBoss(depth, await players()));
  const you = user ? ((await redis.zScore(dmgKey(cycleOf(depth)), user)) ?? 0) : 0;
  return { hp: b.killer ? 0 : hpOf(b), pool: b.pool, carried: b.carried, killer: b.killer ? (b.killerName ?? 'a delver') : null, you }; // a kill stands after a reset
}

/** Is the Warden of this floor dead (so later runs get the fallen floor)? */
export async function fallen(depth: number): Promise<boolean> {
  return !!(await redis.hGet(key(cycleOf(depth)), 'killer'));
}

/**
 * An accepted run's damage (A43): one atomic increment; the run whose increment crosses the pool is the kill, claimed
 * with hSetNX so two killing blows at once still make one kill. Only called for real players' first acceptance.
 */
export async function strike(depth: number, user: string, name: string | null, dealt: number, players: () => Promise<number>): Promise<{ hp: number; killed: boolean }> {
  const c = cycleOf(depth);
  const b = (await read(c)) ?? (await openBoss(depth, await players()));
  const total = await redis.hIncrBy(key(c), 'dealt', dealt);
  await redis.zIncrBy(dmgKey(c), user, dealt);
  const killed = total - dealt < b.pool && total >= b.pool ? (await redis.hSetNX(key(c), 'killer', user)) === 1 : false;
  if (killed) {
    await redis.hSet(key(c), { killerName: name ?? 'a delver', killedAt: String(Date.now()) });
    console.log(`WARDEN killed on floor ${depth} by ${name ?? user}: ${total}/${b.pool}`);
    await scheduleMemorial(c);
  }
  return { hp: Math.max(0, b.pool - total), killed };
}

/** The reset tool takes a run's damage back. A kill already made stands (its memorial may be posted). */
export async function unstrike(depth: number, user: string, dealt: number) {
  const c = cycleOf(depth);
  if (!(await read(c))) return;
  await redis.hIncrBy(key(c), 'dealt', -dealt);
  // Reset to nothing, the player leaves the damage set, so its size stays the number of runs that broke a link.
  if ((await redis.zIncrBy(dmgKey(c), user, -dealt)) <= 0) await redis.zRem(dmgKey(c), [user]);
}

/**
 * Dev tool: set a living Warden's remaining links, clamped to 1..pool so only a real run can make the kill. Moves `dealt`
 * by one atomic increment and credits nobody, so the damage set and the memorial's dealers stay real runs only; `forced`
 * keeps the tool's share out of the links-per-run stats.
 */
export async function setLinks(depth: number, left: number): Promise<{ hp: number; pool: number } | null> {
  const c = cycleOf(depth);
  const b = await read(c);
  if (!b || b.depth !== depth || b.killer) return null;
  const hp = Math.min(b.pool, Math.max(1, Math.floor(left)));
  await redis.hIncrBy(key(c), 'dealt', hpOf(b) - hp);
  await redis.hIncrBy(key(c), 'forced', hpOf(b) - hp);
  return { hp, pool: b.pool };
}

/** The memorial runs as its own job, so it can never block a run or the rollover; a failure only logs. */
export async function scheduleMemorial(c: number) {
  await scheduler.runJob({ name: 'memorial', runAt: new Date(Date.now() + 1000), data: { cycle: c } }).catch((e: unknown) => console.error(`memorial schedule failed: ${String(e)}`));
}

/**
 * Post "The Warden has fallen" once (A45): claimed with hSetNX before posting; a failed post releases the claim so the next
 * attempt (the rollover asks again) can retry. Lists the killing blow and the top WARDEN.memorialTop dealers.
 */
export async function memorial(c: number): Promise<string | null> {
  const b = await read(c);
  if (!b?.killer || b.memorial || !(await redis.hSetNX(key(c), 'memorial', 'pending'))) return null;
  try {
    const top = await redis.zRange(dmgKey(c), 0, WARDEN.memorialTop * 2, { by: 'rank', reverse: true });
    const real = top.filter((t) => t.score > 0).slice(0, WARDEN.memorialTop);
    const names = real.length ? await redis.hMGet('names', real.map((t) => t.member)) : [];
    const lines = real.map((t, i) => `${i + 1}. u/${names[i] ?? 'a delver'}: ${t.score} links`);
    const p = await reddit.submitPost({
      subredditName: context.subredditName,
      title: `The Warden has fallen (Floor ${b.depth})`,
      text: [`u/${b.killerName ?? 'a delver'} broke the last link of ${b.pool}.`, '', 'Those who broke the most:', '', ...lines].join('\n'),
    });
    await redis.hSet(key(c), { memorial: p.id });
    console.log(`WARDEN memorial for floor ${b.depth}: ${p.id}`);
    return p.id;
  } catch (e) {
    await redis.hDel(key(c), ['memorial']);
    console.error(`WARDEN memorial for floor ${b.depth} failed: ${String(e)}`);
    return null;
  }
}

/**
 * Links per run on a Warden's day (A48), real players only, for tuning WARDEN.perPlayer: runs on the floor, runs that broke
 * a link, all links, the mean per run (zeros included: the pool is sized per player), the median per run, the most. A few
 * reads whatever the crowd: the median is one rank lookup in the damage set.
 */
export type LinkStats = { runs: number; fighters: number; links: number; mean: number; median: number; max: number };
async function linkStats(c: number, links: number, runs: number): Promise<LinkStats> {
  const fighters = await redis.zCard(dmgKey(c));
  const at = async (rank: number) => (rank < fighters ? ((await redis.zRange(dmgKey(c), rank, rank, { by: 'rank', reverse: true }))[0]?.score ?? 0) : 0);
  const n = Math.max(runs, fighters);
  return { runs: n, fighters, links, mean: n ? Math.round((10 * links) / n) / 10 : 0, median: await at(Math.floor(n / 2)), max: await at(0) };
}

/** The rollover's line on the Warden's day (summary comment and log): killed, or how many links it carries on. */
export async function bossDay(depth: number, runs: number): Promise<{ text: string; killed: boolean; hp: number; pool: number; stats: LinkStats } | null> {
  const c = cycleOf(depth);
  const b = await read(c);
  if (!b || b.depth !== depth) return null;
  const stats = await linkStats(c, Math.max(0, b.dealt - b.forced), runs);
  if (b.killer) {
    if (!b.memorial) await scheduleMemorial(c); // a memorial that failed earlier gets another try, off the rollover's path
    return { text: `The Warden fell to u/${b.killerName ?? 'a delver'}.`, killed: true, hp: 0, pool: b.pool, stats };
  }
  const hp = hpOf(b);
  return { text: `The Warden survived with ${hp} of ${b.pool} links; it returns on Floor ${depth + 7} with them.`, killed: false, hp, pool: b.pool, stats };
}
