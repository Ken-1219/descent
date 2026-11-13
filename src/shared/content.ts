import type { Floor } from './sim';

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

// Light: lit keeps every token. Dim drops each neutral one rung (ink-2 > ink-1, stone > ink-2,
// pale and bone > stone); remembered also drops all colour. The dead (wisp) and danger (blood)
// keep their colour in dim light.
export const LIGHT: Record<'dim' | 'remembered', Record<Token, Token>> = {
  dim: {
    'ink-0': 'ink-0',
    'ink-1': 'ink-1',
    'ink-2': 'ink-1',
    stone: 'ink-2',
    pale: 'stone',
    bone: 'stone',
    ember: 'ember-deep',
    'ember-deep': 'ember-deep',
    wisp: 'wisp',
    blood: 'blood',
    gilt: 'stone',
    bile: 'stone',
  },
  remembered: {
    'ink-0': 'ink-0',
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

// ---- Phase 3: run tuning ----

export const HEARTS = 3;
export const TORCH_RADIUS = 4;
export const TORCH_LOW_RADIUS = 3;
export const TORCH_LOW_PCT = 20;
export const TORCH_OUT_RADIUS = 1;
export const TORCH_OUT_DRAIN = 2;
export const GOBLIN_SIGHT = 4;
export const GOBLIN_HP = 1;

export const FLOOR_0: Floor = {
  depth: 0,
  torch: 120,
  mercy: true,
  rows: [
    '#####T#####T#####',
    '#.....#.........#',
    '#.@...D...^.....#',
    '#...k.#...^..g..#',
    '#.....#...^.....#',
    '#######.........#',
    '#>..............#',
    '#################',
  ],
};

// ---- Phase 4: tier table (§8). Each family's tier is set per floor (Floor.tiers); rules read these entries. ----
// `cost` is the budget price of one instance (§8: 1, 2, 3, 5 by tier; enemies one more).
// `frames` names the pack or own sprites the client draws for it (checked by a test).

export type Family = 'spikes' | 'goblins' | 'imps' | 'mechanisms' | 'skeletons' | 'pits' | 'dark';
export type Tier = 1 | 2 | 3 | 4;
export const FAMILIES: readonly Family[] = ['spikes', 'goblins', 'imps', 'mechanisms', 'skeletons', 'pits', 'dark'];
export const TIERS: readonly Tier[] = [1, 2, 3, 4];

type Priced = { cost: number; frames: readonly string[] };

/** period 0 = always up. Otherwise up when (turn - rowShift*y) mod period = 0, half-raised the turn before. */
export const SPIKES: Record<Tier, Priced & { period: number; rowShift: number; buried: boolean }> = {
  1: { period: 0, rowShift: 0, buried: false, cost: 1, frames: ['spikes'] },
  2: { period: 3, rowShift: 0, buried: false, cost: 2, frames: ['spikes-0', 'spikes-1', 'spikes'] },
  3: { period: 3, rowShift: 1, buried: false, cost: 3, frames: ['spikes-0', 'spikes-1', 'spikes'] },
  4: { period: 0, rowShift: 0, buried: true, cost: 5, frames: ['crack', 'spikes'] },
};

/** sight: Manhattan wake distance (with line of sight). den: spawn period (0 none). starve: double move every N turns (0 none). */
export const GOBLINS: Record<Tier, Priced & { sight: number; flank: boolean; packWake: boolean; den: number; starve: number }> = {
  1: { sight: 4, flank: false, packWake: false, den: 0, starve: 0, cost: 2, frames: ['goblin-idle-0', 'goblin-run-0'] },
  2: { sight: 4, flank: true, packWake: true, den: 0, starve: 0, cost: 3, frames: ['goblin-idle-0', 'goblin-run-0'] },
  3: { sight: 4, flank: false, packWake: false, den: 6, starve: 0, cost: 4, frames: ['goblin-idle-0', 'goblin-run-0', 'den'] },
  4: { sight: 4, flank: false, packWake: false, den: 0, starve: 3, cost: 6, frames: ['goblin-idle-0', 'goblin-run-0'] },
};

/** wake 'near' = Manhattan distance, through walls; 'light' = its tile is lit by your torch. dive: dive length (0 = no dive). */
export const IMPS: Record<Tier, Priced & { wake: 'near' | 'light'; wakeDist: number; steps: number; dive: number; diveRange: number; packWake: boolean }> = {
  1: { wake: 'near', wakeDist: 4, steps: 2, dive: 0, diveRange: 0, packWake: false, cost: 2, frames: ['imp-idle-0', 'imp-run-0'] },
  2: { wake: 'near', wakeDist: 4, steps: 1, dive: 6, diveRange: 5, packWake: false, cost: 3, frames: ['imp-idle-0', 'imp-run-0', 'mark-line'] },
  3: { wake: 'near', wakeDist: 4, steps: 2, dive: 0, diveRange: 0, packWake: true, cost: 4, frames: ['imp-idle-0', 'imp-run-0'] },
  4: { wake: 'light', wakeDist: 0, steps: 2, dive: 0, diveRange: 0, packWake: false, cost: 6, frames: ['imp-idle-0', 'imp-run-0'] },
};

/** What a plate does to its nearest gate or slit. range: dart reach. turns: a timed gate's open time. */
export const MECHANISMS: Record<Tier, Priced & { plate: 'open' | 'close' | 'dart' | 'timed'; range: number; turns: number }> = {
  1: { plate: 'open', range: 0, turns: 0, cost: 1, frames: ['plate-blue', 'plate-blue-down', 'door-open', 'bars'] },
  2: { plate: 'close', range: 0, turns: 0, cost: 2, frames: ['plate-blue', 'plate-blue-down', 'door-open', 'bars'] },
  3: { plate: 'dart', range: 5, turns: 0, cost: 3, frames: ['plate-blue', 'plate-blue-down', 'slit', 'mark-line'] },
  4: { plate: 'timed', range: 0, turns: 5, cost: 5, frames: ['plate-blue', 'plate-blue-down', 'door-open', 'bars'] },
};

/** rebuild: turns as a bone pile. avoid: paths around spikes. range: archer reach along its row (0 = melee). shared: one rebuild timer per pair. */
export const SKELETONS: Record<Tier, Priced & { sight: number; rebuild: number; avoid: boolean; range: number; shared: boolean }> = {
  1: { sight: 4, rebuild: 4, avoid: false, range: 0, shared: false, cost: 2, frames: ['skelet-idle-0', 'skelet-run-0', 'skull'] },
  2: { sight: 4, rebuild: 3, avoid: true, range: 0, shared: false, cost: 3, frames: ['skelet-idle-0', 'skelet-run-0', 'skull'] },
  3: { sight: 4, rebuild: 3, avoid: true, range: 3, shared: false, cost: 4, frames: ['skelet-idle-0', 'skelet-run-0', 'skull', 'mark-line'] },
  4: { sight: 4, rebuild: 3, avoid: true, range: 0, shared: true, cost: 6, frames: ['skelet-idle-0', 'skelet-run-0', 'skull'] },
};

/** crumble 'leave' = falls after you step off; 'stand' = cracks under you and falls next turn. hidden = looks like floor. */
export const PITS: Record<Tier, Priced & { crumble: 'none' | 'leave' | 'stand'; hidden: boolean }> = {
  1: { crumble: 'none', hidden: false, cost: 1, frames: ['pit'] },
  2: { crumble: 'leave', hidden: false, cost: 2, frames: ['crumble', 'pit'] },
  3: { crumble: 'stand', hidden: false, cost: 3, frames: ['chain', 'chain-crack', 'pit'] },
  4: { crumble: 'none', hidden: true, cost: 5, frames: ['mortar', 'pit'] },
};
export const PIT_DAMAGE = 1;
/** A fall lands on the safe tile within this Manhattan distance that is nearest the stairs. */
export const PIT_DROP = 3;

/** Inside an unlit dark room: torch radius and torch burned per turn. brazier: the room can be lit. */
export const DARK: Record<Tier, Priced & { radius: number; burn: number; brazier: boolean }> = {
  1: { radius: 1, burn: 1, brazier: false, cost: 1, frames: [] },
  2: { radius: 1, burn: 2, brazier: false, cost: 2, frames: [] },
  3: { radius: 1, burn: 2, brazier: false, cost: 3, frames: [] },
  4: { radius: 1, burn: 2, brazier: true, cost: 5, frames: ['brazier', 'brazier-lit'] },
};

/** Trapsetter traps (§8), placed by survivors outside the floor budget, so they cost 0 here. */
export const TRAPS = {
  spikes: { cost: 0, frames: ['spikes', 'trap-mark'] },
  dart: { range: 5, cost: 0, frames: ['slit', 'trap-mark', 'mark-line'] },
  stairs: { cost: 0, frames: ['stairs', 'missing-step'] },
} as const satisfies Record<string, Priced & Record<string, unknown>>;

export type Item = 'potion' | 'oil' | 'bomb';
export const ITEMS = {
  potion: { heal: 1, cost: 0, frames: ['potion'] },
  oil: { turns: 20, cost: 0, frames: ['lamp-oil'] },
  bomb: { radius: 1, cost: 0, frames: ['bomb-0'] },
} as const satisfies Record<Item, Priced & Record<string, unknown>>;

/** Enemies of one kind within this Manhattan distance of each other at the start form a pack (pairs, swarms). */
export const PACK_RADIUS = 4;
