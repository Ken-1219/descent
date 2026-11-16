// Daily rollover (Phase 8): today's tally becomes tomorrow's floor through crowd.ts's ladder, then the post, a summary
// comment, flair (bounded, with a follow-up job) and a Chronicle record. Bounded work: a few reads whatever the crowd.
import { context, reddit, redis, scheduler } from '@devvit/web/server';
import { CURSE_TEXT, FLAIR, ZONE_NAMES } from '../shared/content';
import { EMPTY_TALLY, rolloverFloor, targetPct, type Rolled } from '../shared/crowd';
import { showcaseFamilies } from '../shared/gen';
import type { Floor } from '../shared/sim';
import { dayStats, drainFlair, floorSeed, openFloor, realResult, tally, today } from './game';

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

const fellText = (n: number) => (n === 1 ? '1 delver fell' : `${n} delvers fell`);

/** The summary comment on the new post (A30): what yesterday did to today. */
export function summary(y: NonNullable<Floor['yesterday']>, traps: number): string {
  const where = y.zone === null ? '' : `, most in the ${ZONE_NAMES[y.zone]?.toLowerCase()}`;
  const curse = y.curse ? `The crowd cursed today with ${CURSE_TEXT[y.curse].name} (${CURSE_TEXT[y.curse].effect}).` : 'No curse today.';
  const set = traps ? ` Survivors set ${traps} trap${traps === 1 ? '' : 's'}; ${traps === 1 ? 'it waits' : 'they wait'} below.` : '';
  return `Yesterday on Floor ${y.depth}: ${fellText(y.fell)}${where}, and ${y.cleared} cleared it. ${curse}${set}`;
}

/**
 * Open floor `day + 1` from floor `day`'s tally. A depth is opened once, whoever asks: `rolled` is claimed with hSetNX
 * before any work, so a doubled cron, a retry or a mod pressing "Roll over now" twice can't post twice.
 */
async function advance(day: number, why: string): Promise<{ posted: number | null }> {
  const next = day + 1;
  if (!(await redis.hSetNX('rolled', String(next), '1'))) return { posted: null };
  const t0 = Date.now();
  const [t, stats, real, was] = await Promise.all([tally(day), dayStats(day), realResult(day), redis.get(`f:${day}:floor`)]);
  const before: Floor | null = was ? JSON.parse(was) : null;
  const rolled = rolloverFloor(next, floorSeed(next), t);
  const curse = rolled.mods.curses[0] ?? null;
  const killer = Object.entries(t.kills).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
  // The intro reads all of this from the floor itself: yesterday's deaths per zone, the top killer, today's new family.
  const yesterday = { depth: day, fell: stats.fell, cleared: Math.max(0, stats.runs - stats.fell), zone: stats.zone, curse, deaths: [...t.deaths], killer };
  const floor: Floor = { ...rolled.floor, yesterday, showcase: showcaseFamilies(next), predicted: predicted(next, rolled) };
  const p = await post(next, { mods: rolled.mods, floor, seed: rolled.seed });
  console.log(`ROLLOVER ${why}: floor ${day} -> ${next}, ladder step "${rolled.step}"${rolled.tried.length ? ` (after ${rolled.tried.map((x) => `${x.step}: ${x.why}`).join('; ')})` : ''}, win ${rolled.win}% vs plain ${rolled.plainWin}% (plain band check ${rolled.plainBandWin}% after ${rolled.rerolls} rerolls), ${floor.traps?.length ?? 0} player traps, curse ${curse ?? 'none'}; floor ${day} predicted ${before?.predicted ? `${before.predicted.win}%` : 'n/a'}, players ${real.cleared} cleared / ${real.fell} fell${real.cleared + real.fell ? ` (${Math.round((100 * real.cleared) / (real.cleared + real.fell))}%)` : ''}, ${Date.now() - t0} ms`);
  await reddit.submitComment({ id: p.id, text: summary(yesterday, floor.traps?.length ?? 0) }).catch((e: unknown) => console.error(`summary comment failed: ${String(e)}`));
  const { deaths: _, ...ledger } = yesterday;
  await redis.hSet('chronicle', { [String(day)]: JSON.stringify({ ...ledger, predicted: before?.predicted?.win ?? null, players: real }) });
  await flair(day);
  return { posted: next };
}

/** Flair for yesterday's players, FLAIR.perRun per run; the rest continue in a follow-up scheduled job (§15.3). */
export async function flair(depth: number): Promise<{ done: number; left: number }> {
  const r = await drainFlair(depth, FLAIR.perRun, FLAIR.batch);
  if (r.left) await scheduler.runJob({ name: 'flair', runAt: new Date(Date.now() + 60_000), data: { depth } });
  console.log(`flair floor ${depth}: ${r.done} set, ${r.left} left`);
  return r;
}

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

