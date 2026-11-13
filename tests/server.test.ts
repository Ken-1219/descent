import { expect } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';

const test = createDevvitTest();

test('set-if-absent writes once', async () => {
  await redis.set('k', 'a', { nx: true });
  await redis.set('k', 'b', { nx: true });
  expect(await redis.get('k')).toBe('a');
  expect(await redis.hSetNX('h', 'f', '1')).toBe(1);
  expect(await redis.hSetNX('h', 'f', '2')).toBe(0);
});
