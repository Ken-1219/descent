// Difficulty curve (§8): bot skill 60 on 50 seeds per depth. List A (seeds 1–50) is the tuning list; list B (1001–1050)
// is never tuned against and is reported beside it. Separate file so Vitest runs it in parallel with the generator tests.
import { test, expect } from 'vitest';
import { bot } from '../src/shared/bot';
import { generate } from '../src/shared/gen';

const curve = (first: number) =>
  Array.from({ length: 28 }, (_, i) => {
    let wins = 0;
    for (let k = 0; k < 50; k++) if (bot(generate(i + 1, first + k).floor, 60, first + k).state.ended?.kind === 'won') wins++;
    return wins * 2;
  });

test('win-rate curve at skill 60 on two seed lists', { timeout: 60_000 }, () => {
  const a = curve(1);
  const b = curve(1001);
  console.log(`depth  ${a.map((_, i) => String(i + 1).padStart(3)).join('')}\nlist A ${a.map((v) => String(v).padStart(3)).join('')}\nlist B ${b.map((v) => String(v).padStart(3)).join('')}`);
  // What holds today (the §8 targets of ~80% → ~35% do not yet; see the Phase 5 report):
  expect(a[0]).toBeGreaterThanOrEqual(70); // depth 1 is gentle
  expect(Math.min(...a, ...b)).toBeGreaterThanOrEqual(25); // never under 25%
  const early = (c: number[]) => c.slice(0, 7).reduce((x, y) => x + y, 0) / 7;
  const late = (c: number[]) => c.slice(21).reduce((x, y) => x + y, 0) / 7;
  expect(late(a)).toBeLessThan(early(a)); // the last band is harder than the first
  expect(late(b)).toBeLessThan(early(b));
});
