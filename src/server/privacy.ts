// Phase 10b: what Descent stores about a player, and how it goes away (A53, A56). No TTL: existing players keep everything;
// a deleted Reddit account is found by the daily sweep and purged, and "Delete my data" purges on request.
import { context, reddit, redis } from '@devvit/web/server';
import { FUNNEL, PRIVACY, SWEEP } from '../shared/content';
import type { GhostRecord } from '../shared/ghosts';
import type { Floor } from '../shared/sim';
import { forget, cycleOf } from './boss';
import { key, today } from './game';

const LIFETIME_SETS = ['deepest', 'deaths', 'liars', 'trapsouls', 'souls', 'honour'] as const;
const LIFETIME_HASHES = ['streak', 'tutorial', 'flairOn', 'flairCleared'] as const;
const PER_USER = ['runs', 'ghosts', 'carvings', 'starts', 'traps', 'flair', 'resets', 'errs'] as const;

/** One floor's copies of the user: their fields, votes by or on them, their name on other ghosts, their trap's owner. */
async function purgeFloor(d: number, user: string, name: string | null) {
  for (const k of PER_USER) await redis.hDel(key(d, k), [user]);
  await redis.zRem(key(d, 'scores'), [user]);
  await redis.zRem(key(d, 'cv'), [`${user}:trust`, `${user}:liar`]);
  await redis.hDel(key(d, 'trapped'), [`${user}:hurt`, `${user}:killed`]);
  await redis.hDel(key(d, 'seen'), FUNNEL.map((s) => `${user}:${s}`));
  const votes = Object.keys(await redis.hGetAll(key(d, 'votes'))).filter((f) => f.split('>').includes(user));
  if (votes.length) await redis.hDel(key(d, 'votes'), votes);
  if (name) {
    for (const [owner, raw] of Object.entries(await redis.hGetAll(key(d, 'ghosts')))) {
      const g: GhostRecord = JSON.parse(raw);
      if (g.by !== name) continue;
      delete g.by;
      await redis.hSet(key(d, 'ghosts'), { [owner]: JSON.stringify(g) });
    }
  }
  const raw = await redis.get(key(d, 'floor'));
  const floor: Floor | null = raw ? JSON.parse(raw) : null;
  if (floor?.traps?.some((t) => t.owner === user)) {
    floor.traps = floor.traps.map((t) => (t.owner === user ? { ...t, owner: '', name: null } : t));
    await redis.set(key(d, 'floor'), JSON.stringify(floor));
  }
}

/** Remove every stored copy of a user's ID and name (A53). Day counts (heat, kills, real, curse standings) name nobody and stay. */
export async function purge(user: string): Promise<{ floors: number }> {
  const name = (await redis.hGet('names', user)) ?? null;
  const { day } = await today();
  for (let d = 1; d <= day; d++) await purgeFloor(d, user, name);
  await forget(user, cycleOf(Math.max(1, day)));
  for (const k of LIFETIME_SETS) await redis.zRem(k, [user]);
  for (const k of [...LIFETIME_HASHES, 'names'] as const) await redis.hDel(k, [user]);
  console.log(`PURGE ${user}: ${day} floors`);
  return { floors: day };
}

const isUser = (id: string): id is `t2_${string}` => id.startsWith('t2_');
/** Reddit still has this account. A deleted account comes back undefined; an error throws (and the sweep skips it). */
const present = async (id: string) => (isUser(id) ? (await reddit.getUserById(id)) !== undefined : true);

/**
 * The daily sweep (A53): asks Reddit about about SWEEP.perDay stored players, resuming from a stored cursor, and purges the
 * ones whose account is gone. `exists` is injectable for tests; an error leaves that player alone.
 */
export async function sweep(exists: (id: string) => Promise<boolean> = present): Promise<{ checked: number; purged: number }> {
  let cursor = Number((await redis.hGet('sweep', 'cursor')) ?? 0);
  let checked = 0;
  let purged = 0;
  do {
    const page = await redis.hScan('names', cursor, undefined, SWEEP.perDay - checked);
    for (const { field } of page.fieldValues) {
      checked++;
      const ok = await exists(field).catch(() => true);
      if (!ok) {
        await purge(field);
        purged++;
      }
    }
    cursor = page.cursor;
  } while (cursor !== 0 && checked < SWEEP.perDay);
  await redis.hSet('sweep', { cursor: String(cursor) });
  return { checked, purged };
}

/** Write (or rewrite) the privacy page on the subreddit wiki (A56). */
export async function writePrivacyPage(): Promise<string> {
  const subredditName = context.subredditName;
  const page = { subredditName, page: PRIVACY.page, content: PRIVACY.text, reason: 'Descent privacy page' };
  await reddit.updateWikiPage(page).catch(() => reddit.createWikiPage(page));
  return PRIVACY.url(subredditName);
}
