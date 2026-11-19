// Read-only views for Phase 9: the board, a ghost's lifetime record, the live count, the Chronicle. Every value here was
// written when a run or vote was accepted (game.ts); nothing is computed in the rollover. Bots never appear.
import { reddit, redis } from '@devvit/web/server';
import { BOARD, floorName } from '../shared/content';
import { isWardenFloor } from '../shared/gen';
import { bossView } from './boss';
import { key, realResult } from './game';
import type { BoardResponse, BoardRows, CardResponse, ChronicleResponse, PulseResponse } from '../shared/api';

const isBot = (user: string) => user.startsWith('bot:');

/**
 * One board: the top BOARD.top rows, plus the caller's own row and rank even when outside them, and the total.
 * Ties: Redis's own order, value descending then member descending (A33, lifetime boards); today's board packs the
 * acceptance order into the value (A38), so the earlier run ranks first. Either way the caller's rank is exact: card − zRank.
 */
async function board(key: string, user: string | undefined, unit = 1): Promise<BoardRows & { members: string[] }> {
  const [top, total, myRank, myScore] = await Promise.all([
    redis.zRange(key, 0, BOARD.top + 4, { by: 'rank', reverse: true }), // a few spare rows for any stray bot entries
    redis.zCard(key),
    user ? redis.zRank(key, user) : Promise.resolve(undefined),
    user ? redis.zScore(key, user) : Promise.resolve(undefined),
  ]);
  const rows = top.filter(({ member, score }) => !isBot(member) && score > 0).slice(0, BOARD.top);
  const me = user && myRank !== undefined && myScore !== undefined && myScore > 0 ? { rank: total - myRank, name: user, value: Math.floor(myScore / unit) } : null;
  return { rows: rows.map((r, i) => ({ rank: i + 1, name: r.member, value: Math.floor(r.score / unit) })), me, total, members: rows.map((r) => r.member) };
}

/** GET /api/board?depth=: today's scores, deepest floor cleared, souls, honour, and the two plates (A35). */
export async function boardsFor(user: string | undefined, depth: number): Promise<BoardResponse> {
  const [today, deepest, souls, honour, trapsetter, liar] = await Promise.all([
    board(`f:${depth}:scores`, user, BOARD.order),
    board('deepest', user),
    board('souls', user),
    board('honour', user),
    board('trapsouls', undefined),
    board('liars', undefined),
  ]);
  // One name lookup for every member shown, the caller included.
  const ids = [...new Set([...[today, deepest, souls, honour, trapsetter, liar].flatMap((b) => b.members), ...(user ? [user] : [])])];
  const names = ids.length ? await redis.hMGet('names', ids) : [];
  const nameOf = new Map(ids.map((id, i) => [id, names[i] ?? null]));
  const named = (b: BoardRows): BoardRows => ({
    rows: b.rows.map((r) => ({ ...r, name: nameOf.get(r.name) ?? 'a delver', ...(r.name === user ? { you: true } : {}) })),
    me: b.me ? { ...b.me, name: nameOf.get(b.me.name) ?? 'you', you: true } : null,
    total: b.total,
  });
  const plate = (b: BoardRows) => named(b).rows[0] ?? null;
  return { depth, today: named(today), deepest: named(deepest), souls: named(souls), honour: named(honour), trapsetter: plate(trapsetter), liar: plate(liar) };
}

/**
 * GET /api/card: a ghost's snoovatar and lifetime record (A36): deaths, Trusted, Liar, each minus today's votes on today's
 * carving, so the card never says whether today's carving is true. Bots have neither.
 */
export async function cardFor(ghost: string, depth: number): Promise<CardResponse> {
  if (isBot(ghost) || !/^t2_[a-z0-9]+$/.test(ghost)) return { avatar: null, record: null };
  const [name, deaths, honour, liars, trustToday, liarToday] = await Promise.all([
    redis.hGet('names', ghost),
    redis.zScore('deaths', ghost),
    redis.zScore('honour', ghost),
    redis.zScore('liars', ghost),
    redis.zScore(`f:${depth}:cv`, `${ghost}:trust`),
    redis.zScore(`f:${depth}:cv`, `${ghost}:liar`),
  ]);
  const avatar = name ? ((await reddit.getSnoovatarUrl(name).catch(() => undefined)) ?? null) : null;
  return {
    avatar,
    record: { deaths: Math.max(0, deaths ?? 0), trust: Math.max(0, (honour ?? 0) - (trustToday ?? 0)), liar: Math.max(0, (liars ?? 0) - (liarToday ?? 0)) },
  };
}

/** GET /api/pulse: the already-played screen's 20 s poll asks only for counts (§15.3), and the Warden's HP on its floor. */
export async function pulse(depth: number, user?: string): Promise<PulseResponse> {
  const [fell, carved] = await Promise.all([redis.hLen(`f:${depth}:ghosts`), redis.hLen(`f:${depth}:carvings`)]);
  // Phase 10: on the Warden's floor the same poll carries its HP (no realtime channel).
  const boss = isWardenFloor(depth) ? await bossView(depth, user, async () => { const r = await realResult(depth - 1); return r.cleared + r.fell; }) : undefined;
  return { fell, carved, ...(boss ? { boss } : {}) };
}

/** GET /api/chronicle: one row per floor, newest first, the last BOARD.chronicle floors. */
export async function chronicle(): Promise<ChronicleResponse> {
  const all = Object.entries(await redis.hGetAll('chronicle')).map(([d, v]) => ({ ...JSON.parse(v), depth: Number(d) }));
  const rows = all.sort((a, b) => b.depth - a.depth).slice(0, BOARD.chronicle);
  // Phase 11g: each floor's name, from the seed its mods were stored with.
  const mods = rows.length ? await redis.mGet(rows.map((r) => key(r.depth, 'mods'))) : [];
  return {
    rows: rows.map((r, i) => {
      const seed: unknown = JSON.parse(mods[i] ?? 'null')?.seed;
      return typeof seed === 'number' ? { ...r, name: floorName(seed) } : r;
    }),
  };
}

/** The next daily rollover (cron "0 15 * * *", UTC), for the countdown (A37). */
export const nextRollover = (now: number) => {
  const d = new Date(now);
  const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 15);
  return at > now ? at : at + 86_400_000;
};
