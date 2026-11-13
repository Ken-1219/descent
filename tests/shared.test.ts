import { test, expect } from 'vitest';
import { LIGHT, PALETTE, type Token } from '../src/shared/content';
import { SPRITES, contrast, tokenAt, type SpriteDef } from '../src/client/sprites';

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

test('sprites are 16x16 bitmaps with 1-2 layers', () => {
  for (const def of Object.values(SPRITES)) {
    expect(def.layers.length).toBeGreaterThanOrEqual(1);
    expect(def.layers.length).toBeLessThanOrEqual(2);
    for (const layer of def.layers) {
      expect(layer.rows).toHaveLength(16);
      for (const row of layer.rows) expect(row).toMatch(/^[#.]{16}$/);
    }
  }
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
