// Redis reads and writes for floors and runs. Routes pass identity in from the Devvit context; nothing here trusts a body.
import { context, reddit, redis } from '@devvit/web/server';
import { CURSES, GHOSTS, TRAP_TEXT, type Curse } from '../shared/content';
import { generate, NO_MODS, resolveCurse, zoneOf, type Mods, type Trap } from '../shared/gen';
import { CARVING_CHOICES, carvingOf, ghostView, type GhostRecord, type GhostView, type Vote } from '../shared/ghosts';
import { bot } from '../shared/bot';
import { hash, mulberry32 } from '../shared/rng';
import { judge, start, step, type Action, type Floor, type RunResult } from '../shared/sim';
import type { CarvingResponse, Choices, FloorResponse, RunResponse, Standings, TrapResponse, VoteResponse } from '../shared/api';

type StoredMods = Mods & { seed: number };
type StoredRun = RunResult & { log: string; at: number; bot?: true };
/** Who a run belongs to: the name comes from the Devvit context (null for bots, shown as a nameless delver). */
export type Who = { name: string | null; bot?: true };

type Key = 'mods' | 'floor' | 'runs' | 'scores' | 'starts' | 'ghosts' | 'carvings' | 'heat' | 'kills' | 'resets' | 'traps' | 'curse' | 'cv' | 'votes';
const key = (d: number, k: Key) => `f:${d}:${k}`;
const isBot = (user: string) => user.startsWith('bot:');

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

const result = ({ log: _, at: __, bot: ___, ...run }: StoredRun): RunResult => run;

/** GET /api/floor for `user` (undefined when logged out) on the post's depth. */
export async function floorFor(user: string | undefined, depth: number | null): Promise<FloorResponse> {
  const t = await today();
  const d = depth ?? t.day;
  if (!d) return { kind: 'none' };
  if (!user) return { kind: 'login', depth: d };
  const floor = await storedFloor(d);
  if (!floor) return { kind: 'none' };
  const mine = await redis.hGet(key(d, 'runs'), user);
  const attempt = Number((await redis.hGet(key(d, 'resets'), user)) ?? 0);
  if (mine) {
    // Your run has ended here, so the carvings' Trust and Liar totals (and your own votes) come with the ghosts.
    const ghosts = await withVotes(d, user, await ghostsOf(d, user));
    return { kind: 'played', depth: d, seed: floor.seed ?? 0, floor, run: result(JSON.parse(mine)), ghosts, live: d === t.day, attempt, choices: await choicesOf(d, user) };
  }
  if (d < t.day) return { kind: 'closed', depth: d, today: t.day, todayUrl: postUrl(t.postId) };
  return { kind: 'play', depth: d, seed: floor.seed ?? 0, floor, ghosts: await ghostsOf(d, user), attempt };
}

const ghostRecords = async (d: number): Promise<Record<string, GhostRecord>> =>
  Object.fromEntries(Object.entries(await redis.hGetAll(key(d, 'ghosts'))).map(([k, v]) => [k, JSON.parse(v)]));
/** The capped ghost view: per-tile counts plus at most GHOSTS.list records, the caller's own always among them. */
export const ghostsOf = async (d: number, user: string | null) => ghostView(await ghostRecords(d), await redis.hGetAll(key(d, 'carvings')), user);

/**
 * submitRun: validate and replay against the stored floor, then accept one run per user with hSetNX, so two posts
 * racing can't both win. Resubmitting the identical log is a retry and returns the stored result; any other log is rejected.
 */
export async function submitRun(user: string, depth: number, log: string, who: Who): Promise<RunResponse> {
  if (!Number.isInteger(depth) || depth < 1) return { kind: 'rejected', reason: 'no such floor' }; // Floor 0 never reaches the server
  const t = await today();
  if (depth < t.day) return { kind: 'closed', today: t.day, todayUrl: postUrl(t.postId) };
  const floor = await storedFloor(depth);
  if (!floor || depth > t.day) return { kind: 'rejected', reason: 'no such floor' };
  const prior = await redis.hGet(key(depth, 'runs'), user);
  if (prior) return retry(JSON.parse(prior), log);
  const j = judge(floor, log);
  if (!j.ok) return { kind: 'rejected', reason: j.reason };
  const at = Date.now();
  const run: StoredRun = { ...j.run, log, at, ...(who.bot ? { bot: true as const } : {}) };
  if (!(await redis.hSetNX(key(depth, 'runs'), user, JSON.stringify(run)))) {
    const won = await redis.hGet(key(depth, 'runs'), user);
    return won ? retry(JSON.parse(won), log) : { kind: 'rejected', reason: 'already played' };
  }
  // One transaction after the run is accepted: the score, and for a death its ghost, compass heat and kill by cause.
  // Everything comes from the replay and the context; heat and kills are recorded now and read from 7b on.
  const tx = await redis.watch();
  await tx.multi();
  await tx.zAdd(key(depth, 'scores'), { member: user, score: run.score });
  if (run.outcome === 'dead') {
    const ghost: GhostRecord = { name: who.name, x: run.tile.x, y: run.tile.y, cause: run.cause, at, ...(who.bot ? { bot: true as const } : {}) };
    await tx.hSet(key(depth, 'ghosts'), { [user]: JSON.stringify(ghost) });
    await tx.hIncrBy(key(depth, 'heat'), String(zoneOf(run.tile, floor.rows.length)), 1);
    await tx.hIncrBy(key(depth, 'kills'), run.cause, 1);
  }
  await tx.exec();
  return { kind: 'saved', run: j.run };
}

/**
 * carve: one carving on the caller's own ghost on the live floor. hSetNX makes it final, so two posts racing can't both
 * win; the same carving again returns the stored one, a different one is rejected.
 */
export async function carve(user: string, depth: number, raw: string): Promise<CarvingResponse> {
  if (!Number.isInteger(depth) || depth < 1) return { kind: 'rejected', reason: 'no such floor' };
  const t = await today();
  if (depth < t.day) return { kind: 'closed', today: t.day, todayUrl: postUrl(t.postId) };
  if (depth > t.day) return { kind: 'rejected', reason: 'no such floor' };
  const c = carvingOf(raw);
  if (!c) return { kind: 'rejected', reason: 'carving' };
  if (!(await redis.hGet(key(depth, 'ghosts'), user))) return { kind: 'rejected', reason: 'no death' };
  const canon = c.dir ? `${c.id}:${c.dir}` : c.id;
  if (await redis.hSetNX(key(depth, 'carvings'), user, canon)) return { kind: 'carved', carving: canon };
  const stored = await redis.hGet(key(depth, 'carvings'), user);
  return stored === canon ? { kind: 'carved', carving: canon } : { kind: 'rejected', reason: 'already carved' };
}

/** A finished log as a client sends it: the bot's actions with free bumps dropped (a client never logs them). */
const clientLog = (floor: Floor, actions: readonly Action[]) => {
  let s = start(floor);
  let out = '';
  for (const a of actions) {
    const next = step(s, a).state;
    if (next !== s) out += a;
    s = next;
  }
  return out;
};

/**
 * Mod tool: bot runs on the live floor through submitRun, the same validation as a real run, until `n` have died (at
 * most GHOSTS.seedRunsPer·n runs). Skill varies per bot so the deaths spread; every other bot ghost carves at random.
 */
export async function seedBots(n: number): Promise<{ depth: number; runs: number; ghosts: number }> {
  const { day } = await today();
  const floor = day ? await storedFloor(day) : null;
  if (!floor) return { depth: day, runs: 0, ghosts: 0 };
  const want = Math.max(0, Math.min(GHOSTS.seedMax, Math.floor(n)));
  let runs = 0, ghosts = 0;
  while (ghosts < want && runs < want * GHOSTS.seedRunsPer) {
    const k = await redis.hIncrBy('game', 'botSeq', 1);
    const user = `bot:${k}`;
    const rnd = mulberry32(hash(`${user}:${day}`));
    const played = bot(floor, rnd() % 61, k);
    runs++;
    const r = await submitRun(user, day, clientLog(floor, played.log), { name: null, bot: true });
    if (r.kind !== 'saved' || r.run.outcome !== 'dead') continue;
    ghosts++;
    if (k % 2 === 0) await carve(user, day, CARVING_CHOICES[rnd() % CARVING_CHOICES.length] ?? 'trap-ahead');
  }
  return { depth: day, runs, ghosts };
}

/** Mod tool: remove every bot run on the live floor with its ghost, carving, score, heat and kill. */
export async function purgeBots(): Promise<{ depth: number; removed: number }> {
  const { day } = await today();
  if (!day) return { depth: 0, removed: 0 };
  const bots = Object.keys(await redis.hGetAll(key(day, 'runs'))).filter(isBot);
  const floor = await storedFloor(day);
  const ghosts = await ghostRecords(day);
  const tx = await redis.watch();
  await tx.multi();
  for (const [user, g] of Object.entries(ghosts)) {
    if (!isBot(user) || !floor) continue;
    await tx.hIncrBy(key(day, 'heat'), String(zoneOf(g, floor.rows.length)), -1);
    await tx.hIncrBy(key(day, 'kills'), g.cause, -1);
  }
  if (bots.length) {
    for (const k of ['runs', 'ghosts', 'carvings'] as const) await tx.hDel(key(day, k), bots);
    await tx.zRem(key(day, 'scores'), bots);
  }
  await tx.exec();
  return { depth: day, removed: bots.length };
}

/** The snoovatar URL for a ghost card (null when the user has none). */
export const avatar = async (name: string): Promise<string | null> => (await reddit.getSnoovatarUrl(name)) ?? null;

const retry = (prior: StoredRun, log: string): RunResponse => (prior.log === log ? { kind: 'saved', run: result(prior) } : { kind: 'rejected', reason: 'already played' });

/** Run starts are logged, not enforced (§2): the first start per user per floor is kept. */
export const logStart = async (user: string, depth: number) => {
  await redis.hSetNX(key(depth, 'starts'), user, String(Date.now()));
};

/**
 * Dev tool (mod menu, behind the devTools setting): remove the caller's run on the live floor with everything it wrote
 * (score, start, ghost, carving, heat, kill), so one account can play a floor again. The reset count goes to the
 * client, which keys its saved log by it, so the old run's log is never replayed and resubmitted.
 */
export async function resetRun(user: string): Promise<{ depth: number; had: boolean }> {
  const { day } = await today();
  if (!day) return { depth: 0, had: false };
  const had = !!(await redis.hGet(key(day, 'runs'), user));
  const ghost = await redis.hGet(key(day, 'ghosts'), user);
  const floor = await storedFloor(day);
  const votes = Object.entries(await redis.hGetAll(key(day, 'votes')));
  const run = await runOf(day, user);
  const tx = await redis.watch();
  await tx.multi();
  // 7b: undo the caller's votes (and what they gave), votes on the caller's carving, their curse vote and trap.
  for (const [field, v] of votes) {
    const [voter = '', target = ''] = field.split('>');
    if (voter !== user && target !== user) continue;
    await tx.hDel(key(day, 'votes'), [field]);
    if (target === 'curse') {
      await tx.zIncrBy(key(day, 'curse'), v, -1);
      continue;
    }
    await tx.zIncrBy(key(day, 'cv'), `${target}:${v}`, -1);
    if (isBot(target)) continue;
    const died = voter === user ? run?.outcome === 'dead' : (await runOf(day, voter))?.outcome === 'dead';
    if (v === 'trust') await tx.zIncrBy('honour', target, -1);
    else if (died) await tx.zIncrBy('souls', target, -1);
  }
  await tx.hDel(key(day, 'traps'), [user]);
  if (ghost && floor) {
    const g: GhostRecord = JSON.parse(ghost);
    await tx.hIncrBy(key(day, 'heat'), String(zoneOf(g, floor.rows.length)), -1);
    await tx.hIncrBy(key(day, 'kills'), g.cause, -1);
  }
  for (const k of ['runs', 'ghosts', 'carvings', 'starts'] as const) await tx.hDel(key(day, k), [user]);
  await tx.zRem(key(day, 'scores'), [user]);
  await tx.hIncrBy(key(day, 'resets'), user, 1);
  await tx.exec();
  return { depth: day, had };
}

// ---- Phase 7b: the survivors' choices and the votes on carvings ----

const live = async (depth: number): Promise<{ ok: true } | { ok: false; r: { kind: 'closed'; today: number; todayUrl: string | null } | { kind: 'rejected'; reason: string } }> => {
  if (!Number.isInteger(depth) || depth < 1) return { ok: false, r: { kind: 'rejected', reason: 'no such floor' } };
  const t = await today();
  if (depth < t.day) return { ok: false, r: { kind: 'closed', today: t.day, todayUrl: postUrl(t.postId) } };
  if (depth > t.day) return { ok: false, r: { kind: 'rejected', reason: 'no such floor' } };
  return { ok: true };
};
const runOf = async (d: number, user: string): Promise<StoredRun | null> => {
  const r = await redis.hGet(key(d, 'runs'), user);
  return r ? JSON.parse(r) : null;
};
const isCurse = (c: string | null | undefined): c is Curse => !!c && c in CURSES;
const isTrapKind = (k: string): k is Trap['kind'] => k in TRAP_TEXT;
const standings = async (d: number): Promise<Standings> =>
  (await redis.zRange(key(d, 'curse'), 0, -1, { by: 'rank', reverse: true })).flatMap(({ member, score }): Standings => (isCurse(member) && score > 0 ? [[member, score]] : []));

/** Totals and your own votes for the listed ghosts (≤ GHOSTS.list): one sorted-set read and one hMGet. */
async function withVotes(d: number, user: string, view: GhostView): Promise<GhostView> {
  const tally = new Map((await redis.zRange(key(d, 'cv'), 0, -1, { by: 'rank' })).map(({ member, score }) => [member, score]));
  const mine = view.list.length ? await redis.hMGet(key(d, 'votes'), view.list.map((g) => `${user}>${g.id}`)) : [];
  return {
    ...view,
    list: view.list.map((g, i) => {
      const my = mine[i];
      return { ...g, votes: { trust: tally.get(`${g.id}:trust`) ?? 0, liar: tally.get(`${g.id}:liar`) ?? 0 }, ...(my === 'trust' || my === 'liar' ? { myVote: my } : {}) };
    }),
  };
}

async function choicesOf(d: number, user: string): Promise<Choices> {
  const [curse, trap] = await Promise.all([redis.hGet(key(d, 'votes'), `${user}>curse`), redis.hGet(key(d, 'traps'), user)]);
  const mine = isCurse(curse) ? curse : null;
  const t = trap ? JSON.parse(trap) : null;
  return { curse: mine, standings: mine ? await standings(d) : null, trap: t ? { zone: t.zone, kind: t.kind } : null };
}

/**
 * voteCarving: Trust or Liar on another player's carving, once per ghost, after your own run on that floor has ended.
 * hSetNX on `f:{d}:votes` makes it final. Then one transaction: the ghost's tally (`f:{d}:cv`), and for a real author
 * honour (+1 per Trust) or souls (+1 per Liar from a voter who died on this floor). Bots' carvings feed nothing.
 */
export async function voteCarving(user: string, depth: number, ghost: string, vote: Vote): Promise<VoteResponse> {
  const l = await live(depth);
  if (!l.ok) return l.r;
  if (vote !== 'trust' && vote !== 'liar') return { kind: 'rejected', reason: 'vote' };
  const run = await runOf(depth, user);
  if (!run) return { kind: 'rejected', reason: 'run not ended' };
  if (ghost === user) return { kind: 'rejected', reason: 'own carving' };
  if (!(await redis.hGet(key(depth, 'ghosts'), ghost))) return { kind: 'rejected', reason: 'no such ghost' };
  if (!(await redis.hGet(key(depth, 'carvings'), ghost))) return { kind: 'rejected', reason: 'no carving' };
  if (!(await redis.hSetNX(key(depth, 'votes'), `${user}>${ghost}`, vote))) {
    const stored = await redis.hGet(key(depth, 'votes'), `${user}>${ghost}`);
    return stored === vote ? { kind: 'voted', vote, standings: null } : { kind: 'rejected', reason: 'already voted' };
  }
  const tx = await redis.watch();
  await tx.multi();
  await tx.zIncrBy(key(depth, 'cv'), `${ghost}:${vote}`, 1);
  if (!isBot(ghost)) {
    if (vote === 'trust') await tx.zIncrBy('honour', ghost, 1);
    else if (run.outcome === 'dead') await tx.zIncrBy('souls', ghost, 1);
  }
  await tx.exec();
  return { kind: 'voted', vote, standings: null };
}

/** voteCurse: a stored win votes once for tomorrow's curse; the standings come back only now that they have voted. */
export async function voteCurse(user: string, depth: number, curse: string): Promise<VoteResponse> {
  const l = await live(depth);
  if (!l.ok) return l.r;
  if (!isCurse(curse)) return { kind: 'rejected', reason: 'curse' };
  if ((await runOf(depth, user))?.outcome !== 'won') return { kind: 'rejected', reason: 'not a winner' };
  if (!(await redis.hSetNX(key(depth, 'votes'), `${user}>curse`, curse))) {
    const stored = await redis.hGet(key(depth, 'votes'), `${user}>curse`);
    return stored === curse ? { kind: 'voted', vote: curse, standings: await standings(depth) } : { kind: 'rejected', reason: 'already voted' };
  }
  await redis.zIncrBy(key(depth, 'curse'), curse, 1);
  return { kind: 'voted', vote: curse, standings: await standings(depth) };
}

/** placeTrap: a stored win sets one trap for tomorrow (compass zone + kind). Phase 8 places it; nobody else sees it. */
export async function placeTrap(user: string, depth: number, zone: number, kind: string): Promise<TrapResponse> {
  const l = await live(depth);
  if (!l.ok) return l.r;
  if (!Number.isInteger(zone) || zone < 0 || zone > 8 || !isTrapKind(kind)) return { kind: 'rejected', reason: 'trap' };
  if ((await runOf(depth, user))?.outcome !== 'won') return { kind: 'rejected', reason: 'not a winner' };
  const trap: Trap = { zone, kind };
  if (!(await redis.hSetNX(key(depth, 'traps'), user, JSON.stringify({ ...trap, at: Date.now() })))) {
    const stored = JSON.parse((await redis.hGet(key(depth, 'traps'), user)) ?? '{}');
    return stored.zone === zone && stored.kind === kind ? { kind: 'placed', trap } : { kind: 'rejected', reason: 'already placed' };
  }
  return { kind: 'placed', trap };
}

/**
 * The floor's crowd data as Phase 8's rollover reads it: deaths per compass zone (bots included: seeding exists to show
 * the crowd effect), kills by cause, the resolved curse, and the players' traps with their owners (bots never set one).
 */
export async function tally(depth: number): Promise<{ deaths: number[]; kills: Record<string, number>; curse: Curse | null; traps: (Trap & { owner: string })[] }> {
  const [heat, kills, votes, traps] = await Promise.all([
    redis.hGetAll(key(depth, 'heat')),
    redis.hGetAll(key(depth, 'kills')),
    standings(depth),
    redis.hGetAll(key(depth, 'traps')),
  ]);
  return {
    deaths: Array.from({ length: 9 }, (_, z) => Math.max(0, Number(heat[String(z)] ?? 0))),
    kills: Object.fromEntries(Object.entries(kills).map(([c, n]) => [c, Number(n)]).filter(([, n]) => Number(n) > 0)),
    curse: resolveCurse(Object.fromEntries(votes)),
    traps: Object.entries(traps).sort(([a], [b]) => (a < b ? -1 : 1)).map(([owner, v]) => {
      const t = JSON.parse(v);
      return { owner, zone: t.zone, kind: t.kind };
    }),
  };
}
