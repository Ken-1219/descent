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
  // §8 target: a straight line from ~80% at depth 1 to ~35% at 28. Fifty seeds can't judge single depths (SE ~7 points),
  // so the slope is judged on band averages: floors 1–21 within 10 points of the line's band means (75, 63, 52); from 22 on
  // it keeps falling and never goes under 25% (checked on 200 seeds at the weakest depth below).
  const bands = (c: number[]) => [0, 1, 2, 3].map((k) => c.slice(7 * k, 7 * k + 7).reduce((x, y) => x + y, 0) / 7);
  console.log(`bands A ${bands(a).map(Math.round).join(' / ')} · B ${bands(b).map(Math.round).join(' / ')} (target 75 / 63 / 52 / 40)`);
  for (const c of [a, b]) {
    const [b0 = 0, b1 = 0, b2 = 0, b3 = 0] = bands(c);
    expect(Math.abs(b0 - 75)).toBeLessThanOrEqual(10);
    expect(Math.abs(b1 - 63)).toBeLessThanOrEqual(10);
    expect(Math.abs(b2 - 52)).toBeLessThanOrEqual(10);
    expect(b3).toBeLessThan(b2);
  }
  // "Never under 25%": 50 seeds is ±12 points, so the weakest depth is judged on 200 seeds.
  const weakest = a.indexOf(Math.min(...a)) + 1;
  let wins = 0;
  for (let k = 2001; k <= 2200; k++) if (bot(generate(weakest, k).floor, 60, k).state.ended?.kind === 'won') wins++;
  console.log(`weakest depth ${weakest}: ${Math.round(wins / 2)}% on 200 seeds`);
  expect(wins / 2).toBeGreaterThanOrEqual(25);
});
