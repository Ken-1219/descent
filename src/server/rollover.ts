// Daily rollover (Phase 8): today's tally becomes tomorrow's floor through crowd.ts's ladder, then the post, a summary
// comment, flair (bounded, with a follow-up job) and a Chronicle record. Bounded work: a few reads whatever the crowd.
import { context, reddit, redis, scheduler, settings } from '@devvit/web/server';
import { CURSE_TEXT, FLAIR, ZONE_NAMES } from '../shared/content';
import { EMPTY_TALLY, rolloverFloor, setAside, targetPct, type Rolled } from '../shared/crowd';
import { isWardenFloor, showcaseFamilies } from '../shared/gen';
import type { Floor } from '../shared/sim';
import { bossDay, openBoss } from './boss';
import { health, healthLine } from './health';
import { drainFlair, floorSeed, openFloor, realResult, seedBots, tally, today, type FlairRun } from './game';

/** Store, post and publish floor `depth`; `game` moves to it only after the post exists. */
async function post(depth: number, made?: Parameters<typeof openFloor>[1]) {
  await openFloor(depth, made);
  const p = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: `Floor ${depth}`,
    postData: { depth },
    textFallback: { text: `Descent, floor ${depth}: one run a day. Open on new Reddit or the app to play.` },
  });
  await redis.hSet('game', { day: String(depth), postId: p.id });
  return p;
}

/** A39: what the bot predicts for a new floor, stored with it so the real result can be set beside it a day later. */
const predicted = (depth: number, r: Rolled) => ({ win: r.win, plain: r.plainWin, target: targetPct(depth) });

const fellText = (n: number) => (n === 1 ? '1 player fell' : `${n} players fell`);

/**
 * The summary comment on the new post (A30; A125 and A127 in Phase 11k): what yesterday did to today. Players and nameless
 * delvers (the game's bots) are counted apart, and it says whether the bots' deaths helped shape today (below
 * CROWD.realDeaths real deaths they fill in). A day no player ran says what today asks instead of "0 fell".
 */
export function summary(y: NonNullable<Floor['yesterday']>, traps: number): string {
  const bots = y.nameless ?? 0;
  const delvers = `${bots === 1 ? '1 nameless delver' : `${bots} nameless delvers`} (the game's own bots)`;
  const shaped = y.filled ? 'with too few players, their deaths helped shape today' : "enough players fell, so only players' deaths shaped today";
  const where = y.zone === null ? '' : ` Most deaths that shaped today were in the ${ZONE_NAMES[y.zone]?.toLowerCase()}.`;
  const curse = y.curse ? ` The crowd cursed today with ${CURSE_TEXT[y.curse].name} (${CURSE_TEXT[y.curse].effect}).` : ' No curse today.';
  const set = traps ? ` Survivors set ${traps} trap${traps === 1 ? '' : 's'}; ${traps === 1 ? 'it waits' : 'they wait'} below.` : '';
  if (!y.fell && !y.cleared) return `Floor ${y.depth + 1} is open. Be among the first down: where you fall, what you carve and the curse you vote shape Floor ${y.depth + 2}.${bots ? ` On Floor ${y.depth}, ${delvers} fell; ${shaped}.` : ''}${y.curse ? curse : ''}${set}`;
  return `Yesterday on Floor ${y.depth}: ${fellText(y.fell)}, and ${y.cleared} cleared it.${bots ? ` ${delvers} fell there too; ${shaped}.` : ''}${where}${curse}${set}`;
}

/**
 * Open floor `day + 1` from floor `day`'s tally. A depth is opened once, whoever asks: `rolled` is claimed with hSetNX
 * before any work, so a doubled cron, a retry or a mod pressing "Roll over now" twice can't post twice.
 */
async function advance(day: number, why: string): Promise<{ posted: number | null }> {
  const next = day + 1;
  if (!(await redis.hSetNX('rolled', String(next), '1'))) return { posted: null };
  const t0 = Date.now();
  const [t, real, was, h] = await Promise.all([tally(day), realResult(day), redis.get(`f:${day}:floor`), health(day)]);
  const before: Floor | null = was ? JSON.parse(was) : null;
  const rolled = rolloverFloor(next, floorSeed(next), t);
  const curse = rolled.mods.curses[0] ?? null;
  // The intro reads all of this from the floor itself: players and nameless delvers apart (A127), the deaths that shaped
  // today per zone, the top killer, today's new family.
  const yesterday = { depth: day, fell: real.fell, cleared: real.cleared, nameless: t.nameless, filled: t.filled, zone: t.zone, curse, deaths: [...t.deaths], killer: t.killer, setAside: setAside(t, rolled) };
  const floor: Floor = { ...rolled.floor, yesterday, showcase: showcaseFamilies(next), predicted: predicted(next, rolled) };
  // Phase 10: the Warden's day that just ended (killed, or what it carries), and the pool of a Warden posted now. Neither
  // may fail the rollover: an error is logged and the floor posts anyway.
  const ended = isWardenFloor(day) ? await bossDay(day, real.cleared + real.fell).catch((e: unknown) => (console.error(`WARDEN day ${day}: ${String(e)}`), null)) : null;
  const waits = isWardenFloor(next) ? await openBoss(next, real.cleared + real.fell).catch((e: unknown) => (console.error(`WARDEN open ${next}: ${String(e)}`), null)) : null;
  const p = await post(next, { mods: rolled.mods, floor, seed: rolled.seed });
  console.log(`ROLLOVER ${why}: floor ${day} -> ${next} (post ${p.id}), ladder step "${rolled.step}"${rolled.tried.length ? ` (after ${rolled.tried.map((x) => `${x.step}: ${x.why}`).join('; ')})` : ''}, win ${rolled.win}% vs plain ${rolled.plainWin}% (plain band check ${rolled.plainBandWin}% after ${rolled.rerolls} rerolls), ${floor.traps?.length ?? 0} player traps, curse ${curse ?? 'none'}${ended ? `; ${ended.text} Pool ${ended.pool}: ${ended.stats.links} links from ${ended.stats.runs} runs (${ended.stats.fighters} fought), mean ${ended.stats.mean}, median ${ended.stats.median}, max ${ended.stats.max}` : ''}${waits ? `; Warden pool ${waits.pool}${waits.carried ? ' (carried)' : ''}` : ''}; floor ${day} predicted ${before?.predicted ? `${before.predicted.win}%` : 'n/a'}, players ${real.cleared} cleared / ${real.fell} fell${real.cleared + real.fell ? ` (${Math.round((100 * real.cleared) / (real.cleared + real.fell))}%)` : ''}; health ${healthLine(h)}, ${Date.now() - t0} ms`);
  const boss = [ended?.text, waits ? `The Warden waits in its arena: ${waits.pool} links${waits.carried ? ', still wounded from its last floor' : ''}.` : ''].filter(Boolean).join(' ');
  await reddit.submitComment({ id: p.id, text: `${summary(yesterday, floor.traps?.length ?? 0)}${boss ? ` ${boss}` : ''}` }).then((c) => console.log(`summary comment ${c.id} on floor ${next}`), (e: unknown) => console.error(`summary comment failed: ${String(e)}`));
  const { deaths: _, ...ledger } = yesterday;
  await redis.hSet('chronicle', { [String(day)]: JSON.stringify({ ...ledger, predicted: before?.predicted?.win ?? null, players: real, ...(ended ? { warden: { hp: ended.hp, pool: ended.pool, killed: ended.killed, ...ended.stats } } : {}) }) });
  await flair(day);
  await scheduleNameless(next);
  return { posted: next };
}

/**
 * Phase 11c: the "Nameless delvers per day" setting. Its bot ghosts are added by their own job a little after the post, never
 * inside the rollover; they stay labelled and excluded like any seeded bot (boards, funnel, player counts). Their deaths
 * shape tomorrow only as a fill-in, below CROWD.realDeaths real deaths (A127, shapeOf).
 */
async function scheduleNameless(depth: number) {
  const n = Number((await settings.get<number>('namelessDelvers')) ?? 0);
  if (!(n > 0)) return;
  await scheduler.runJob({ name: 'delvers', runAt: new Date(Date.now() + 120_000), data: { depth } }).catch((e: unknown) => console.error(`nameless delvers not scheduled: ${String(e)}`));
}
/** The job: today's floor only (a late job never seeds an older floor). */
export async function nameless(depth: number): Promise<{ ghosts: number; runs: number } | null> {
  const n = Number((await settings.get<number>('namelessDelvers')) ?? 0);
  if (!(n > 0) || (await today()).day !== depth) return null;
  const r = await seedBots(n);
  console.log(`NAMELESS floor ${depth}: ${r.ghosts} bot ghosts from ${r.runs} runs`);
  return r;
}

/** Flair for yesterday's players, FLAIR.perRun per run; the rest continue in a follow-up scheduled job (§15.3). */
export async function flair(depth: number): Promise<FlairRun> {
  const r = await drainFlair(depth, FLAIR.perRun, FLAIR.batch);
  if (r.left) await scheduler.runJob({ name: 'flair', runAt: new Date(Date.now() + 60_000), data: { depth } });
  console.log(`flair floor ${depth}: ${flairNote(r)}`);
  return r;
}
/** Confirmed by Reddit only: set (rows answered ok), removed, failed; skipped are players already cleared once. */
export const flairNote = (r: FlairRun) => `${r.set} set, ${r.removed} removed, ${r.failed} failed, ${r.skipped} skipped, ${r.left} left`;

/**
 * rollover(date): the daily cron. A second call on the same UTC day does nothing (the date is claimed first); the depth
 * guard in advance() keeps it from posting a floor the dev tool already opened.
 */
export async function rollover(date: string): Promise<{ posted: number | null }> {
  const { day } = await today();
  if (!day || !(await redis.hSetNX('rollovers', date, '1'))) return { posted: null }; // not started yet, or already rolled today
  return advance(day, `cron ${date}`);
}

/** Dev tool "Roll over now" (devTools): the same rollover without claiming today's date, so the daily cron still runs. */
export async function rollNow(): Promise<{ posted: number | null }> {
  const { day } = await today();
  return day ? advance(day, 'roll over now') : { posted: null };
}

/** Install trigger and mod menu: start Floor 1 once. Later calls report the live floor and post nothing. */
export async function startFirstFloor(): Promise<{ depth: number; postId: string | null; created: boolean }> {
  if (!(await redis.hSetNX('game', 'started', '1'))) {
    const t = await today();
    return { depth: t.day, postId: t.postId, created: false };
  }
  await redis.hSet('rolled', { '1': '1' });
  const r = rolloverFloor(1, floorSeed(1), EMPTY_TALLY); // no crowd yet: a plain floor inside the plain band
  const p = await post(1, { mods: r.mods, floor: { ...r.floor, showcase: showcaseFamilies(1), predicted: predicted(1, r) }, seed: r.seed });
  return { depth: 1, postId: p.id, created: true };
}

/** Mod menu "Post Floor 0": a practice post that always plays the tutorial (A31). */
export async function postFloor0() {
  return reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: 'Floor 0: learn to descend',
    postData: { depth: 0 },
    textFallback: { text: 'Descent, Floor 0: the practice floor. Open on new Reddit or the app to play.' },
  });
}


/**
 * Phase 11c: mod menu "Post today's floor (to pin)": a post with no depth, so it always opens today's floor (floorFor treats
 * no depth as today) and never shows a closed state. It is the one link to pin and to submit.
 */
export async function postToday() {
  const p = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: "Descent: today's floor",
    postData: { today: true },
    textFallback: { text: "Descent: today's floor of a daily dungeon built by the community's deaths. Open on new Reddit or the app to play." },
  });
  await redis.hSet('game', { todayPost: p.id });
  return p;
}
