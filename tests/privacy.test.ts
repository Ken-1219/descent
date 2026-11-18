// Phase 10b: deleted accounts leave nothing behind (A53); the sweep finds them without a TTL (existing players keep everything).
import { expect, vi } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { reddit, redis } from '@devvit/web/server';
import { purge, sweep } from '../src/server/privacy';
import { startFirstFloor } from '../src/server/rollover';
import { drainFlair, setFlair } from '../src/server/game';
import { SWEEP } from '../src/shared/content';

const test = createDevvitTest();

/** Two players on floor 1: `t2_gone` (to be purged) and `t2_stay`, each touching every per-user key. */
async function seed() {
  await startFirstFloor();
  const floor = JSON.parse((await redis.get('f:1:floor')) ?? '{}');
  floor.traps = [{ x: 1, y: 1, kind: 'spikes', owner: 't2_gone', name: 'gone' }, { x: 2, y: 1, kind: 'dart', owner: 't2_stay', name: 'stay' }];
  await redis.set('f:1:floor', JSON.stringify(floor));
  for (const u of ['t2_gone', 't2_stay']) {
    for (const k of ['deepest', 'deaths', 'liars', 'trapsouls', 'souls', 'honour']) await redis.zAdd(k, { member: u, score: 3 });
    for (const k of ['streak', 'tutorial', 'flairOn', 'hints']) await redis.hSet(k, { [u]: '1' });
    await redis.hSet('names', { [u]: u.slice(3) });
    for (const k of ['runs', 'ghosts', 'carvings', 'starts', 'traps', 'flair', 'resets', 'errs']) await redis.hSet(`f:1:${k}`, { [u]: k === 'ghosts' ? JSON.stringify({ name: u.slice(3), x: 1, y: 1, cause: 'trap', at: 1, by: u === 't2_stay' ? 'gone' : 'stay' }) : '1' });
    await redis.zAdd('f:1:scores', { member: u, score: 5 });
    await redis.hSet('f:1:seen', { [`${u}:start`]: '1' });
    await redis.hSet('f:1:trapped', { [`${u}:hurt`]: '1' });
    await redis.zAdd('f:1:cv', { member: `${u}:trust`, score: 1 });
  }
  await redis.hSet('f:1:votes', { 't2_gone>t2_stay': 'trust', 't2_stay>t2_gone': 'liar', 't2_stay>curse': 'frail', 't2_gone>curse': 'frail' });
  await redis.hSet('f:1:heat', { '4': '2' });
  await redis.hSet('boss:0', { depth: '7', pool: '60', dealt: '60', killer: 't2_gone', killerName: 'gone' });
  await redis.zAdd('boss:0:dmg', { member: 't2_gone', score: 40 }, { member: 't2_stay', score: 20 });
}

test('purge removes every stored copy of a user\'s ID and name, and nothing of anyone else\'s; day counts stay', async () => {
  await seed();
  await purge('t2_gone');
  const all = JSON.stringify(await Promise.all([
    ...['deepest', 'deaths', 'liars', 'trapsouls', 'souls', 'honour', 'f:1:scores', 'f:1:cv', 'boss:0:dmg'].map((k) => redis.zRange(k, 0, -1)),
    ...['streak', 'tutorial', 'flairOn', 'hints', 'names', 'f:1:runs', 'f:1:ghosts', 'f:1:carvings', 'f:1:starts', 'f:1:traps', 'f:1:flair', 'f:1:resets', 'f:1:errs', 'f:1:seen', 'f:1:trapped', 'f:1:votes', 'boss:0'].map((k) => redis.hGetAll(k)),
    redis.get('f:1:floor'),
  ]));
  expect(all).not.toContain('t2_gone');
  expect(all).not.toMatch(/"gone"|:gone|u\/gone/);
  expect(all).toContain('t2_stay'); // the other player is untouched
  expect(await redis.hGet('f:1:votes', 't2_stay>curse')).toBe('frail');
  expect(await redis.hGet('f:1:heat', '4')).toBe('2'); // counts name nobody
  const floor = JSON.parse((await redis.get('f:1:floor')) ?? '{}');
  expect(floor.traps).toHaveLength(2); // the trap stays on the floor; its owner becomes nobody
  expect(await redis.hGet('boss:0', 'killer')).toBeTruthy(); // the kill stands, nameless
});

test('purge edits the Warden memorial so it no longer names the user', async () => {
  await seed();
  const post = await reddit.submitPost({ subredditName: 'test', title: 'The Warden has fallen (Floor 7)', text: 'u/gone broke the last link' });
  await redis.hSet('boss:0', { memorial: post.id });
  const edit = vi.fn(async () => undefined);
  vi.spyOn(reddit, 'getPostById').mockResolvedValue(Object.assign(post, { edit }));
  await purge('t2_gone');
  expect(edit).toHaveBeenCalledTimes(1);
  const text = JSON.stringify(edit.mock.calls[0]);
  expect(text).not.toContain('gone');
  expect(text).toContain('u/stay');
});

test('the sweep purges only accounts Reddit no longer has; an error skips; it resumes where it stopped', async () => {
  await seed();
  for (let i = 0; i < SWEEP.perDay + 10; i++) await redis.hSet('names', { [`t2_p${i}`]: `p${i}` });
  const exists = async (id: string) => {
    if (id === 't2_p3') throw new Error('Reddit hiccup');
    return id !== 't2_gone';
  };
  let checked = 0;
  for (let day = 0; day < 4 && (await redis.hGet('names', 't2_gone')); day++) checked += (await sweep(exists)).checked;
  expect(await redis.hGet('names', 't2_gone')).toBeUndefined();
  expect(await redis.hGet('names', 't2_stay')).toBe('stay');
  expect(await redis.hGet('names', 't2_p3')).toBe('p3'); // an error never purges
  expect(checked).toBeGreaterThan(0);
  const first = await sweep(exists);
  expect(first.checked).toBeLessThanOrEqual(SWEEP.perDay + 50); // a day's work is bounded
});

test('flair is opt-in (A55): only opted-in players get it; others have Descent\'s flair removed once; off removes it now', async () => {
  await redis.hSet('f:1:flair', { t2_in: JSON.stringify({ name: 'in', text: 'Cleared floor 1' }), t2_out: JSON.stringify({ name: 'out', text: 'Fell on floor 1' }) });
  const batch = vi.spyOn(reddit, 'setUserFlairBatch').mockResolvedValue([{ ok: true, status: 'added flair for user in' }]);
  const remove = vi.spyOn(reddit, 'removeUserFlair').mockResolvedValue(undefined);
  await setFlair('t2_in', 'in', true);
  expect(await drainFlair(1, 100, 50)).toMatchObject({ set: 1, removed: 1, failed: 0 });
  expect(batch).toHaveBeenCalledWith(expect.any(String), [{ username: 'in', text: 'Cleared floor 1' }]);
  expect(remove).toHaveBeenCalledWith(expect.any(String), 'out');
  await redis.hSet('f:2:flair', { t2_out: JSON.stringify({ name: 'out', text: 'Fell on floor 2' }) });
  await drainFlair(2, 100, 50);
  expect(remove).toHaveBeenCalledTimes(1); // once per player, not every day
  await setFlair('t2_in', 'in', false);
  expect(remove).toHaveBeenLastCalledWith(expect.any(String), 'in');
  // A call that resolves with a rejected row is a failure, never "set" (the Phase 8 line reported one that never happened).
  batch.mockResolvedValue([{ ok: false, status: 'skipped', errors: { user: 'no such user' } }]);
  await setFlair('t2_in', 'in', true);
  await redis.hSet('f:3:flair', { t2_in: JSON.stringify({ name: 'in', text: 'Cleared floor 3' }) });
  expect(await drainFlair(3, 100, 50)).toMatchObject({ set: 0, failed: 1 });
});
