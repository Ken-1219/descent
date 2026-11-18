// Phase 11c: the always-today post (no depth in its post data) opens today's floor on every day and is never closed.
import { expect } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';
import { floorFor } from '../src/server/game';
import { postToday, rollNow, startFirstFloor } from '../src/server/rollover';

const test = createDevvitTest();

test('the always-today post follows the rollover and never closes; a dated post does close', { timeout: 60_000 }, async () => {
  await startFirstFloor();
  const p = await postToday();
  expect(await redis.hGet('game', 'todayPost')).toBe(p.id);
  expect(await floorFor('t2_a', null)).toMatchObject({ kind: 'play', depth: 1 });
  await rollNow();
  expect(await floorFor('t2_a', null)).toMatchObject({ kind: 'play', depth: 2 }); // no depth: today, whatever day it is
  expect(await floorFor('t2_a', 1)).toMatchObject({ kind: 'closed' }); // Floor 1's own post closes
});
