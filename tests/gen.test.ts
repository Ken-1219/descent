import { test, expect } from 'vitest';
import { CURSES, FAMILIES, GATE_TORCH_PCT, ROOM1_ENEMY_GAP, ENTRANCE_CLEAR, TRAP_MAX, type Family } from '../src/shared/content';
import { NO_MODS, budgetFor, generate, isWardenFloor, safePath, showcaseFamilies, strandFree, tiersFor, zoneWeights, type Mods } from '../src/shared/gen';
import { zoneOf } from '../src/shared/grid';
import { lightRadius, start } from '../src/shared/sim';

const all = (t: number) => {
  const out: Partial<Record<Family, number>> = {};
  for (const f of FAMILIES) out[f] = t;
  return out;
};

test('tiers follow the §8 cycle rule at depths 1, 7, 8, 14, 22, 28, 29 and 60', () => {
  expect(tiersFor(1)).toEqual({ spikes: 1, goblins: 1 });
  expect(tiersFor(7)).toEqual(all(1));
  expect(tiersFor(8)).toEqual({ ...all(1), spikes: 2, goblins: 2 });
  expect(tiersFor(14)).toEqual(all(2));
  expect(tiersFor(22)).toEqual({ ...all(3), spikes: 4, goblins: 4 });
  expect(tiersFor(28)).toEqual(all(4));
  expect(tiersFor(29)).toEqual(all(4));
  expect(tiersFor(60)).toEqual(all(4));
  expect(tiersFor(2)).toEqual({ spikes: 1, goblins: 1, imps: 1 });
});

test('Warden hook on position 7; showcase is the new family, rotating once nothing is new', () => {
  expect([7, 14, 28, 35].map(isWardenFloor)).toEqual([true, true, true, true]);
  expect([1, 6, 29].map(isWardenFloor)).toEqual([false, false, false]);
  expect(showcaseFamilies(1)).toEqual(['spikes', 'goblins']);
  expect(showcaseFamilies(9)).toEqual(['imps']);
  expect(showcaseFamilies(7)).toEqual(['dark']); // position 7: nothing new, rotation (depth 7 → FAMILIES[6])
  expect(showcaseFamilies(29)).toEqual(['spikes']); // all at T4 from 29: rotation continues
  expect(showcaseFamilies(30)).toEqual(['goblins']);
});

test('same inputs give an identical floor', () => {
  const mods: Mods = { curses: ['overrun'], deaths: [5, 0, 0, 2, 0, 0, 0, 0, 9], topFamily: 'goblins', traps: [{ zone: 4, kind: 'spikes' }, { zone: 8, kind: 'dart' }] };
  for (const [d, s] of [[1, 7], [15, 123], [28, 9]] as const) {
    expect(JSON.stringify(generate(d, s, mods))).toBe(JSON.stringify(generate(d, s, mods)));
    expect(JSON.stringify(generate(d, s))).toBe(JSON.stringify(generate(d, s)));
  }
});

test('crowd weights: ranked 2.2/1.6/1.2 then 0.8, empty zones 0.6, uniform with no deaths', () => {
  expect(zoneWeights(NO_MODS.deaths)).toEqual([10, 10, 10, 10, 10, 10, 10, 10, 10]);
  expect(zoneWeights([0, 9, 0, 3, 0, 1, 0, 0, 5])).toEqual([6, 22, 6, 12, 6, 8, 6, 6, 16]);
});

test('painted deaths pull hazards toward that zone: where it has a room, it holds about the §8 share', { timeout: 30_000 }, () => {
  // §8 weights give one painted zone (2.2 against eight zones at 0.6) about 31% of the budget. Measured on floors that
  // have a room in the zone (a zone without a room can't hold hazards), over 100 floors at depth 22.
  const share = (mods: Mods) => {
    let inZone = 0, all = 0;
    for (let s = 1; s <= 100; s++) {
      const g = generate(22, s, mods);
      const side = g.floor.rows.length;
      if (!g.rooms.some((r) => zoneOf({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) }, side) === 8)) continue;
      g.floor.rows.forEach((row, y) => [...row].forEach((c, x) => {
        if (!'^Oo,_giKGYxFSu'.includes(c)) return;
        all++;
        if (zoneOf({ x, y }, side) === 8) inZone++;
      }));
    }
    return inZone / all;
  };
  const painted = share({ ...NO_MODS, deaths: [0, 0, 0, 0, 0, 0, 0, 0, 40] });
  const plain = share(NO_MODS);
  console.log(`zone 8 share at depth 22: ${Math.round(plain * 100)}% unpainted, ${Math.round(painted * 100)}% painted`);
  expect(painted).toBeGreaterThanOrEqual(0.25);
  expect(painted).toBeGreaterThanOrEqual(2 * plain);
});

test('hitting the retry cap falls back to a lighter floor that still passes the gates (production never goes without a floor)', () => {
  let seed = 1;
  while (generate(25, seed).rejected === 0) seed++;
  const g = generate(25, seed, NO_MODS, 0); // cap 0: the first rejection forces the fallback
  expect(g.fallback).toBeGreaterThanOrEqual(1);
  expect(safePath(g.floor)).not.toBeNull();
  expect(strandFree(g.floor)).toBe(true);
});

test('curses: overrun raises the budget; short wick shortens the torch but never below gate 2', () => {
  expect(budgetFor(22, { ...NO_MODS, curses: ['overrun'] })).toBe(Math.floor((budgetFor(22) * CURSES.overrun.budgetPct) / 100));
  expect(budgetFor(22, { ...NO_MODS, curses: ['overrun'] })).toBeGreaterThan(budgetFor(22));
  for (let s = 1; s <= 5; s++) {
    const g = generate(30, s, { ...NO_MODS, curses: ['short-wick'] });
    expect(g.safe.burn * 100).toBeLessThanOrEqual(GATE_TORCH_PCT * g.floor.torch);
  }
  expect(CURSES['short-wick'].torchPct).toBeLessThan(100);
});

test('player traps: at most TRAP_MAX materialise; the floor stays fair', () => {
  const traps = Array.from({ length: 20 }, (_, i) => ({ zone: i % 9, kind: (['spikes', 'dart', 'stairs'] as const)[i % 3] ?? 'spikes' }));
  for (let s = 1; s <= 5; s++) {
    const f = generate(12, s, { ...NO_MODS, traps }).floor;
    const placed = f.rows.join('').replace(/[^xZF]/g, '').length;
    expect(placed).toBeLessThanOrEqual(TRAP_MAX);
    expect(safePath(f)).not.toBeNull();
  }
});

// 2,000 floors across depths 1–60: every one passes the gates; rejected seeds are reported per depth.
test('2,000 floors pass every fairness gate and the floor-shape rules', { timeout: 120_000 }, () => {
  const rejected: number[][] = Array.from({ length: 61 }, () => []);
  for (let i = 0; i < 2000; i++) {
    const depth = (i % 60) + 1;
    const g = generate(depth, 1000 + i);
    (rejected[depth] ??= []).push(g.rejected);
    expect(g.fallback, `d${depth} s${1000 + i} hit the retry cap`).toBe(0);
    const f = g.floor;
    const s = start(f);
    const room1 = g.rooms.find((r) => s.pos.x >= r.x && s.pos.x < r.x + r.w && s.pos.y >= r.y && s.pos.y < r.y + r.h);
    expect(room1, `d${depth}`).toBeDefined();
    if (!room1) continue;
    // Gates, re-checked independently of generate().
    const safe = safePath(f);
    expect(safe, `d${depth} s${1000 + i} gate 1`).not.toBeNull();
    expect((safe?.burn ?? 1e9) * 100, `d${depth} gate 2`).toBeLessThanOrEqual(GATE_TORCH_PCT * f.torch);
    expect(strandFree(f), `d${depth} stranding`).toBe(true);
    // Floor shape: room 1 empty; enemies beyond every wake range of room 1; nothing within 2 of the entrance.
    f.rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        const inRoom1 = x >= room1.x && x < room1.x + room1.w && y >= room1.y && y < room1.y + room1.h;
        if (inRoom1) expect('.@', `d${depth} room 1 at ${x},${y}`).toContain(c);
        if ('giKG'.includes(c)) {
          const gap = Math.max(0, room1.x - x, x - (room1.x + room1.w - 1)) + Math.max(0, room1.y - y, y - (room1.y + room1.h - 1));
          expect(gap, `d${depth} enemy near room 1`).toBeGreaterThanOrEqual(ROOM1_ENEMY_GAP);
        }
        if ('^xOo,_GF'.includes(c)) expect(Math.abs(x - s.pos.x) + Math.abs(y - s.pos.y)).toBeGreaterThan(ENTRANCE_CLEAR);
      }),
    );
  }
  const lines = rejected.flatMap((r, d) => (r.length ? [`d${d} mean ${(r.reduce((a, b) => a + b, 0) / r.length).toFixed(2)} max ${Math.max(...r)}`] : []));
  console.log(`rejected seeds per depth:\n${lines.join('\n')}`);
});

test('generate(28): mean under 20 ms including retries; worst-case time is reported, not asserted', { timeout: 20_000 }, () => {
  for (let s = 1; s <= 5; s++) generate(28, s); // warm up
  const ms: number[] = [];
  for (let s = 100; s < 150; s++) {
    const t0 = performance.now();
    generate(28, s);
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
  // The max is machine load plus retries (~20 ms each); a floor is generated once at rollover, so it never reaches a player.
  console.log(`generate(28): mean ${mean.toFixed(1)} ms, median ${ms[25]?.toFixed(1)} ms, max ${ms[49]?.toFixed(1)} ms`);
  expect(mean).toBeLessThan(20);
});

test('generate(28) retries stay bounded: at most 4 rejections on any of seeds 1–200 (500 seeds measured: max 3)', { timeout: 30_000 }, () => {
  const worst = Math.max(...Array.from({ length: 200 }, (_, i) => generate(28, i + 1).rejected));
  expect(worst).toBeLessThanOrEqual(4);
});

test('every curse: floors still pass the gates; Frail starts on 2 hearts; Deep Dark keeps the radius at 2 or more; Light Sleepers keeps the entrance out of its range', () => {
  for (const c of Object.keys(CURSES) as (keyof typeof CURSES)[]) {
    for (const d of [1, 9, 15, 22, 30]) {
      const g = generate(d, 7, { ...NO_MODS, curses: [c] });
      expect(g.floor.curses).toEqual([c]);
      expect(safePath(g.floor), `${c} d${d}`).not.toBeNull();
      expect(strandFree(g.floor), `${c} d${d}`).toBe(true);
    }
  }
  expect(start(generate(5, 1, { ...NO_MODS, curses: ['frail'] }).floor).hearts).toBe(2);
  expect(lightRadius(start(generate(5, 1, { ...NO_MODS, curses: ['deep-dark'] }).floor))).toBe(3);
  // Light Sleepers: room 1 keeps the normal range; only the entrance tile is kept out of the cursed (longer) range.
  const g = generate(15, 3, { ...NO_MODS, curses: ['light-sleepers'] });
  const s0 = start(g.floor);
  const room1 = g.rooms.find((r) => s0.pos.x >= r.x && s0.pos.x < r.x + r.w && s0.pos.y >= r.y && s0.pos.y < r.y + r.h);
  for (const e of s0.enemies) {
    if (!room1) break;
    const gap = Math.max(0, room1.x - e.x, e.x - (room1.x + room1.w - 1)) + Math.max(0, room1.y - e.y, e.y - (room1.y + room1.h - 1));
    expect(gap).toBeGreaterThanOrEqual(ROOM1_ENEMY_GAP);
    expect(Math.abs(e.x - s0.pos.x) + Math.abs(e.y - s0.pos.y)).toBeGreaterThanOrEqual(ROOM1_ENEMY_GAP + CURSES['light-sleepers'].wakeDelta);
  }
});
