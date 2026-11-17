// Phase 11 guard: the golden runs replay to identical results. Polish may not change the simulation, the generator or a
// stored format; any difference here is a rule change and fails the phase.
import { expect, test } from 'vitest';
import { CASES, GEN_DEPTHS, digest, genDigest } from './golden';
import golden from './golden.json';

test.each(CASES.map((c, i) => [c.name, i] as const))('golden run: %s', (_, i) => {
  const want = golden.runs[i];
  const c = CASES[i];
  expect(want && c && want.name === c.name).toBe(true);
  if (!want || !c) return;
  expect(digest(c.floor, want.log)).toEqual({ result: want.result, state: want.state, events: want.events });
});

test('golden floors: the generator makes the same floors at every depth it was recorded at', () => {
  expect(Object.fromEntries(GEN_DEPTHS.map((d) => [d, genDigest(d)]))).toEqual(golden.generated);
});
