import { test, expect } from 'vitest';
import { LIGHT, PALETTE, type Token } from '../src/shared/content';
import { ANIMS, PACK, SPRITES, contrast, frameAt, tokenAt, type Anim, type SpriteDef } from '../src/client/sprites';

const tokens = Object.keys(PALETTE);
const isToken = (t: string): t is Token => tokens.includes(t);

test('text pairs meet WCAG AA', () => {
  expect(contrast(PALETTE.bone, PALETTE['ink-0'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(PALETTE.bone, PALETTE['ink-2'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(PALETTE.pale, PALETTE['ink-2'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
});

test('light tables map every token to a token', () => {
  for (const level of ['dim', 'remembered'] as const) {
    expect(Object.keys(LIGHT[level]).sort()).toEqual([...tokens].sort());
    for (const v of Object.values(LIGHT[level])) expect(isToken(v)).toBe(true);
  }
  for (const v of Object.values(LIGHT.remembered)) expect(['ink-0', 'ink-1', 'ink-2']).toContain(v);
});

test('sprites are 16 wide: 16x16 1-2 layer bitmaps, or pixel maps 1–32 tall (bottom-aligned) whose every char has a token', () => {
  for (const def of Object.values(SPRITES)) {
    if ('map' in def) {
      expect(def.map.length).toBeGreaterThanOrEqual(1);
      expect(def.map.length).toBeLessThanOrEqual(32);
      for (const row of def.map) {
        expect(row).toHaveLength(16);
        for (const ch of row) if (ch !== '.') expect(def.key[ch]).toBeDefined();
      }
      continue;
    }
    expect(def.layers.length).toBeGreaterThanOrEqual(1);
    expect(def.layers.length).toBeLessThanOrEqual(2);
    for (const layer of def.layers) {
      expect(layer.rows).toHaveLength(16);
      for (const row of layer.rows) expect(row).toMatch(/^[#.]{16}$/);
    }
  }
});

test('tokenAt reads pixel maps through their key', () => {
  const def: SpriteDef = { map: ['oe' + '.'.repeat(14), ...Array.from({ length: 15 }, () => '.'.repeat(16))], key: { o: 'ink-0', e: 'ember' } };
  expect(tokenAt(def, 'lit', 0, 0)).toBe('ink-0');
  expect(tokenAt(def, 'dim', 1, 0)).toBe(LIGHT.dim.ember);
  expect(tokenAt(def, 'lit', 2, 0)).toBeNull();
});

const blank = '.'.repeat(16);
const rows = [
  '##' + '.'.repeat(14),
  ...Array.from({ length: 15 }, () => blank),
];

test('tokenAt resolves layers, light levels, bg and transparency', () => {
  const lit: SpriteDef = { bg: 'ink-1', layers: [{ token: 'bone', rows }] };
  expect(tokenAt(lit, 'lit', 0, 0)).toBe('bone');
  expect(tokenAt(lit, 'dim', 0, 0)).toBe(LIGHT.dim.bone);
  expect(tokenAt(lit, 'edge', 0, 0)).toBe('bone');
  expect(tokenAt(lit, 'edge', 1, 0)).toBe(LIGHT.dim.bone);
  expect(tokenAt(lit, 'remembered', 0, 0)).toBe(LIGHT.remembered.bone);
  expect(tokenAt(lit, 'lit', 5, 5)).toBe('ink-1');
  const noBg: SpriteDef = { layers: [{ token: 'bone', rows }] };
  expect(tokenAt(noBg, 'lit', 5, 5)).toBeNull();
});

test('top layer wins', () => {
  const def: SpriteDef = {
    layers: [
      { token: 'bone', rows },
      { token: 'blood', rows: ['#' + '.'.repeat(15), ...rows.slice(1)] },
    ],
  };
  expect(tokenAt(def, 'lit', 0, 0)).toBe('blood');
  expect(tokenAt(def, 'lit', 1, 0)).toBe('bone');
});

test('style.css tokens match PALETTE exactly', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/client/style.css', import.meta.url), 'utf8');
  const found = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
  expect(found).toEqual(PALETTE);
});

test('animations: one ms per frame, every frame >= 84 ms, a hold, and real frame names', () => {
  for (const anim of Object.values(ANIMS)) {
    expect(anim.ms).toHaveLength(anim.frames.length);
    for (const ms of anim.ms) expect(ms).toBeGreaterThanOrEqual(84);
    // A one-frame anim (imp-perch) is all hold.
    if (anim.ms.length > 1) expect(Math.max(...anim.ms)).toBeGreaterThan(Math.min(...anim.ms));
    for (const f of anim.frames) expect(f.name in (f.src === 'own' ? SPRITES : PACK)).toBe(true);
  }
});

test('frameAt wraps loops and clamps one-shots', () => {
  const frames: Anim['frames'] = [{ src: 'pack', name: 'floor' }, { src: 'pack', name: 'floor' }];
  const loop: Anim = { frames, ms: [100, 200], loop: true };
  expect([0, 99, 100, 299, 300].map((t) => frameAt(loop, t))).toEqual([0, 0, 1, 1, 0]);
  expect(frameAt({ ...loop, loop: false }, 1000)).toBe(1);
});
