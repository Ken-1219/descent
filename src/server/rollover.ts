// Daily rollover (cron) and the first floor. Phase 6 is minimal: next mods and floor, the post, `game`. Tally, comment
// and flair arrive in Phase 8.
import { context, reddit, redis } from '@devvit/web/server';
import { openFloor, today } from './game';

/** Store, post and publish floor `depth`; `game` moves to it only after the post exists. */
async function post(depth: number) {
  await openFloor(depth);
  const p = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: `Floor ${depth}`,
    postData: { depth },
    textFallback: { text: `Descent, floor ${depth}: one run a day. Open on new Reddit or the app to play.` },
  });
  await redis.hSet('game', { day: String(depth), postId: p.id });
  return p;
}

/**
 * rollover(date): open the next floor once the game has started. A second call on the same UTC day does nothing: the date is claimed with
 * hSetNX before any work, so a retried or doubled cron can't post twice.
 */
export async function rollover(date: string): Promise<{ posted: number | null }> {
  const { day } = await today();
  if (!day || !(await redis.hSetNX('rollovers', date, '1'))) return { posted: null }; // not started yet, or already rolled today
  await post(day + 1);
  return { posted: day + 1 };
}

/** Install trigger and mod menu: start Floor 1 once. Later calls report the live floor and post nothing. */
export async function startFirstFloor(): Promise<{ depth: number; postId: string | null; created: boolean }> {
  if (!(await redis.hSetNX('game', 'started', '1'))) {
    const t = await today();
    return { depth: t.day, postId: t.postId, created: false };
  }
  const p = await post(1);
  return { depth: 1, postId: p.id, created: true };
}
