// Phase 11d: practice serves a floor read-only. Never today's before your own run; nothing it does writes anything.
import { expect } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';
import { practiceFor, seedBots, submitRun } from '../src/server/game';
import { rollNow, startFirstFloor } from '../src/server/rollover';

const test = createDevvitTest();

const keys = async () => {
  const out: Record<string, number> = {};
  for (const k of ['f:1:runs', 'f:1:ghosts', 'f:2:runs', 'f:2:ghosts', 'f:2:funnel', 'f:2:seen', 'deepest', 'deaths', 'souls', 'streak']) out[k] = (await redis.hLen(k).catch(() => 0)) + (await redis.zCard(k).catch(() => 0));
  return out;
};

test('practice: past floors and today after your run, never today before it; reads only', { timeout: 60_000 }, async () => {
  await startFirstFloor();
  await seedBots(3);
  await rollNow();
  const before = await keys();
  expect(await practiceFor('t2_a', 2)).toEqual({ kind: 'rejected', reason: 'play it first' }); // today, no run yet
  const past = await practiceFor('t2_a', 1);
  expect(past.kind === 'practice' && past.depth === 1 && past.ghosts.list.length > 0).toBe(true); // its ghosts come along
  expect(await practiceFor('t2_a', 3)).toMatchObject({ kind: 'rejected' }); // no future floor
  expect(await practiceFor(undefined, 1)).toMatchObject({ kind: 'rejected', reason: 'logged out' });
  expect(await keys()).toEqual(before); // nothing written
  // A practice log can't be accepted for a past floor (closed) or today once played (one run a day).
  expect(await submitRun('t2_a', 1, 'W', { name: 'a' })).toMatchObject({ kind: 'closed' });
});
