// Phase 10b: the funnel counts each step once per player per floor and never a bot (A59); beacons are validated and
// rate-limited (A57); Health and the rollover line read the same numbers (A60).
import { expect } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';
import { beacon, count, health, healthLine } from '../src/server/health';
import { BEACON } from '../src/shared/content';

const test = createDevvitTest();

test('funnel: once per player per floor; a resend adds nothing; bots never count; logged-out splash loads count apart', async () => {
  expect(await count(3, 't2_a', 'start')).toBe(true);
  expect(await count(3, 't2_a', 'start')).toBe(false); // resend
  expect(await count(3, 't2_b', 'start')).toBe(true);
  expect(await count(3, 'bot:1', 'start')).toBe(false);
  await count(3, undefined, 'splash');
  await count(3, undefined, 'splash');
  await count(3, undefined, 'descend'); // no identity, no count beyond the splash
  expect((await health(3)).funnel).toMatchObject({ start: 2, splash_anon: 2 });
  expect((await health(3)).funnel.descend ?? 0).toBe(0);
  expect((await health(4)).funnel.start ?? 0).toBe(0); // per floor
});

test('beacons: validated, bucketed load times by client class, errors rate-limited per player and for logged-out', async () => {
  expect(await beacon('t2_a', { kind: 'load', depth: 3, ms: 900, client: 'ios' })).toBe(true);
  await beacon('t2_b', { kind: 'load', depth: 3, ms: 1100, client: 'ios' });
  await beacon('t2_c', { kind: 'load', depth: 3, ms: 3100, client: 'ios' });
  await beacon('t2_d', { kind: 'load', depth: 3, ms: 999_999, client: 'desktop' }); // capped, still counted
  expect(await beacon('t2_a', JSON.parse('{"kind":"load","depth":3,"ms":"fast","client":"ios"}'))).toBe(false);
  expect(await beacon('t2_a', JSON.parse('{"kind":"load","depth":3,"ms":5,"client":"toaster"}'))).toBe(false);
  for (let i = 0; i < BEACON.errorsPerUser + 3; i++) await beacon('t2_a', { kind: 'error', depth: 3, msg: 'x'.repeat(500), screen: 'run' });
  await beacon('t2_a', { kind: 'save', depth: 3, screen: 'plate' }); // over budget: dropped
  await beacon('t2_b', { kind: 'save', depth: 3, screen: 'plate' });
  for (let i = 0; i < BEACON.anonErrors + 5; i++) await beacon(undefined, { kind: 'error', depth: 3, msg: 'boom', screen: 'splash' });
  const h = await health(3);
  expect(h.errors).toBe(BEACON.errorsPerUser + BEACON.anonErrors); // t2_a's save came after its budget ran out
  expect(h.saves).toBe(1);
  expect(h.load.ios).toMatchObject({ n: 3, p50: 1250, p90: 3250 });
  expect(h.load.desktop?.n).toBe(1);
  expect(healthLine(h)).toMatch(/load ios p50 1\.3s p90 3\.3s \(3\)/);
});
