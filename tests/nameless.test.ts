// Phase 11c: "Nameless delvers per day": a job after the rollover (never inside it) seeds labelled bot ghosts on today's floor.
import { expect, vi } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis, scheduler, settings } from '@devvit/web/server';
import { nameless, rollNow, startFirstFloor } from '../src/server/rollover';
import { realResult } from '../src/server/game';

const test = createDevvitTest();

test('off by default: the rollover schedules nothing', { timeout: 60_000 }, async () => {
  const job = vi.spyOn(scheduler, 'runJob');
  await startFirstFloor();
  await rollNow();
  expect(job.mock.calls.some(([j]) => j.name === 'delvers')).toBe(false);
});

test('on: the rollover schedules its own job; the job seeds bot ghosts on today\'s floor only, never counted as players', { timeout: 60_000 }, async () => {
  vi.spyOn(settings, 'get').mockResolvedValue(4); // the only setting the rollover reads besides devTools, which it never reads
  const job = vi.spyOn(scheduler, 'runJob');
  await startFirstFloor();
  await rollNow();
  const call = job.mock.calls.find(([j]) => j.name === 'delvers')?.[0];
  expect(call?.data).toEqual({ depth: 2 });
  expect(await redis.hLen('f:2:ghosts')).toBe(0); // nothing seeded inside the rollover
  const r = await nameless(2);
  expect(r?.ghosts).toBe(4);
  const ghosts = Object.keys(await redis.hGetAll('f:2:ghosts'));
  expect(ghosts.length).toBe(4);
  expect(ghosts.every((g) => g.startsWith('bot:'))).toBe(true); // labelled
  expect(await realResult(2)).toEqual({ cleared: 0, fell: 0 }); // excluded from real players
  expect(await nameless(1)).toBeNull(); // a late job never seeds an older floor
});
