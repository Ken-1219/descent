export const TILE = 16;

export const PALETTE = {
  'ink-0': '#0d0f14',
  'ink-1': '#171b24',
  'ink-2': '#262c3a',
  stone: '#4a5165',
  pale: '#8b93a7',
  bone: '#d9cfb8',
  ember: '#f2a33a',
  'ember-deep': '#b5541e',
  wisp: '#8fe3c8',
  blood: '#d8433b',
  gilt: '#e8cf6a',
  bile: '#b7c94a',
} as const;

export type Token = keyof typeof PALETTE;

export type Level = 'lit' | 'dim' | 'edge' | 'remembered';

export const LEVELS: readonly Level[] = ['lit', 'dim', 'edge', 'remembered'];

export const LIGHT: Record<'dim' | 'remembered', Record<Token, Token>> = {
  dim: {
    'ink-0': 'ink-0',
    'ink-1': 'ink-1',
    'ink-2': 'ink-2',
    stone: 'ink-1',
    pale: 'stone',
    bone: 'stone',
    ember: 'ember-deep',
    'ember-deep': 'ember-deep',
    wisp: 'wisp',
    blood: 'blood',
    gilt: 'ink-2',
    bile: 'ink-2',
  },
  remembered: {
    'ink-0': 'ink-2',
    'ink-1': 'ink-1',
    'ink-2': 'ink-1',
    stone: 'ink-2',
    pale: 'ink-2',
    bone: 'ink-2',
    ember: 'ink-2',
    'ember-deep': 'ink-2',
    wisp: 'ink-2',
    blood: 'ink-2',
    gilt: 'ink-2',
    bile: 'ink-2',
  },
};
