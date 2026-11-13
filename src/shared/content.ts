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
// `cost` is the budget price of one instance. §8 started at 1, 2, 3, 5 by tier (enemies one more); Phase 5 sets each cell
// from its measured lethality: one budget point per 5 hearts lost per 100 instances by the skill-60 bot (depths 1–28,
// seeds 1–50; second pass on the first pass's floors), clamped to 1–8. A harmless upgrade (gates, dark rooms) no longer eats the budget a lethal one would.
// `frames` names the pack or own sprites the client draws for it (checked by a test).

export type Family = 'spikes' | 'goblins' | 'imps' | 'mechanisms' | 'skeletons' | 'pits' | 'dark';
export type Tier = 1 | 2 | 3 | 4;
export const FAMILIES: readonly Family[] = ['spikes', 'goblins', 'imps', 'mechanisms', 'skeletons', 'pits', 'dark'];
export const TIERS: readonly Tier[] = [1, 2, 3, 4];

type Priced = { cost: number; frames: readonly string[] };

/** period 0 = always up. Otherwise up when (turn - rowShift*y) mod period = 0, half-raised the turn before. */
export const SPIKES: Record<Tier, Priced & { period: number; rowShift: number; buried: boolean }> = {
  1: { period: 0, rowShift: 0, buried: false, cost: 5, frames: ['spikes'] },
  2: { period: 3, rowShift: 0, buried: false, cost: 4, frames: ['spikes-0', 'spikes-1', 'spikes'] },
  3: { period: 3, rowShift: 1, buried: false, cost: 2, frames: ['spikes-0', 'spikes-1', 'spikes'] },
  4: { period: 0, rowShift: 0, buried: true, cost: 2, frames: ['crack', 'spikes'] },
};

/** sight: Manhattan wake distance (with line of sight). den: spawn period (0 none). starve: double move every N turns (0 none). */
export const GOBLINS: Record<Tier, Priced & { sight: number; flank: boolean; packWake: boolean; den: number; starve: number }> = {
  1: { sight: 4, flank: false, packWake: false, den: 0, starve: 0, cost: 1, frames: ['goblin-idle-0', 'goblin-run-0'] },
  2: { sight: 4, flank: true, packWake: true, den: 0, starve: 0, cost: 1, frames: ['goblin-idle-0', 'goblin-run-0'] },
  3: { sight: 4, flank: false, packWake: false, den: 6, starve: 0, cost: 2, frames: ['goblin-idle-0', 'goblin-run-0', 'den'] },
  4: { sight: 4, flank: false, packWake: false, den: 0, starve: 3, cost: 1, frames: ['goblin-idle-0', 'goblin-run-0'] },
};

/** wake 'near' = Manhattan distance, through walls; 'light' = its tile is lit by your torch. dive: dive length (0 = no dive). */
export const IMPS: Record<Tier, Priced & { wake: 'near' | 'light'; wakeDist: number; steps: number; dive: number; diveRange: number; packWake: boolean }> = {
  1: { wake: 'near', wakeDist: 4, steps: 2, dive: 0, diveRange: 0, packWake: false, cost: 1, frames: ['imp-idle-0', 'imp-run-0'] },
  2: { wake: 'near', wakeDist: 4, steps: 1, dive: 6, diveRange: 5, packWake: false, cost: 6, frames: ['imp-idle-0', 'imp-run-0', 'mark-line'] },
  3: { wake: 'near', wakeDist: 4, steps: 2, dive: 0, diveRange: 0, packWake: true, cost: 2, frames: ['imp-idle-0', 'imp-run-0'] },
  4: { wake: 'light', wakeDist: 0, steps: 2, dive: 0, diveRange: 0, packWake: false, cost: 1, frames: ['imp-idle-0', 'imp-run-0'] },
};

/** What a plate does to its nearest gate or slit. range: dart reach. turns: a timed gate's open time. */
export const MECHANISMS: Record<Tier, Priced & { plate: 'open' | 'close' | 'dart' | 'timed'; range: number; turns: number }> = {
  1: { plate: 'open', range: 0, turns: 0, cost: 1, frames: ['plate-blue', 'plate-blue-down', 'door-open', 'bars'] },
  2: { plate: 'close', range: 0, turns: 0, cost: 1, frames: ['plate-blue', 'plate-blue-down', 'door-open', 'bars'] },
  3: { plate: 'dart', range: 5, turns: 0, cost: 1, frames: ['plate-blue', 'plate-blue-down', 'slit', 'mark-line'] },
  4: { plate: 'timed', range: 0, turns: 5, cost: 1, frames: ['plate-blue', 'plate-blue-down', 'door-open', 'bars'] },
};

/** rebuild: turns as a bone pile. avoid: paths around spikes. range: archer reach along its row (0 = melee). shared: one rebuild timer per pair. */
export const SKELETONS: Record<Tier, Priced & { sight: number; rebuild: number; avoid: boolean; range: number; shared: boolean }> = {
  1: { sight: 4, rebuild: 4, avoid: false, range: 0, shared: false, cost: 1, frames: ['skelet-idle-0', 'skelet-run-0', 'skull'] },
  2: { sight: 4, rebuild: 3, avoid: true, range: 0, shared: false, cost: 1, frames: ['skelet-idle-0', 'skelet-run-0', 'skull'] },
  3: { sight: 4, rebuild: 3, avoid: true, range: 3, shared: false, cost: 3, frames: ['skelet-idle-0', 'skelet-run-0', 'skull', 'mark-line'] },
  4: { sight: 4, rebuild: 3, avoid: true, range: 0, shared: true, cost: 4, frames: ['skelet-idle-0', 'skelet-run-0', 'skull'] },
};

/** crumble 'leave' = falls after you step off; 'stand' = cracks under you and falls next turn. hidden = looks like floor. */
export const PITS: Record<Tier, Priced & { crumble: 'none' | 'leave' | 'stand'; hidden: boolean }> = {
  1: { crumble: 'none', hidden: false, cost: 3, frames: ['pit'] },
  2: { crumble: 'leave', hidden: false, cost: 1, frames: ['crumble', 'pit'] },
  3: { crumble: 'stand', hidden: false, cost: 3, frames: ['chain', 'chain-crack', 'pit'] },
  4: { crumble: 'none', hidden: true, cost: 1, frames: ['mortar', 'pit'] },
};
export const PIT_DAMAGE = 1;
/** A fall lands on the safe tile within this Manhattan distance that is nearest the stairs. */
export const PIT_DROP = 3;

/** Inside an unlit dark room: torch radius and torch burned per turn. brazier: the room can be lit. */
export const DARK: Record<Tier, Priced & { radius: number; burn: number; brazier: boolean }> = {
  1: { radius: 1, burn: 1, brazier: false, cost: 1, frames: [] },
  2: { radius: 1, burn: 2, brazier: false, cost: 1, frames: [] },
  3: { radius: 1, burn: 2, brazier: false, cost: 1, frames: [] },
  4: { radius: 1, burn: 2, brazier: true, cost: 1, frames: ['brazier', 'brazier-lit'] },
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

// ---- Phase 5: generator and difficulty (§8). Every number the generator and the curve depend on. ----

/** §8 cycle: a 7-floor band; each family arrives at its position; position 7 is the Warden (Phase 10). */
export const CYCLE = 7;
export const MAX_TIER = 4;
export const WARDEN_POS = 7;
export const FAMILY_POS: Record<Family, number> = { spikes: 1, goblins: 1, imps: 2, mechanisms: 3, skeletons: 4, pits: 5, dark: 6 };

/** Grid side 15 + 2·min(band, 5); rooms 4 + min(band, 5). Rooms are BSP leaves of at least `minLeaf`, interiors at least `minRoom`. */
export const GRID = { base: 15, step: 2, maxBand: 5 };
export const ROOMS = { base: 4, maxBand: 5, minLeaf: 6, minRoom: 3, loops: 1 };

/** Budget 8 + 4·min(depth, 35) (§8 started at 3 per depth; Phase 5 tuning); no family may take more than 30% of it (§8 allows up to 40%; 30 keeps a showcase family from flooding the floor). */
export const BUDGET = { base: 8, step: 4, capDepth: 35, familyCapPct: 30 };
/** Purchase weight per family (×10). */
export const FAMILY_WEIGHT: Record<Family, number> = { spikes: 10, goblins: 10, imps: 10, mechanisms: 8, skeletons: 2, pits: 10, dark: 6 };

/**
 * Torch = ceil(burn of the zero-damage path × slack), slack = max(min, start − perDepth·depth) + perRoom per room beyond 4.
 * §8 began at 230% falling to 150%, which assumes a known map. A first visit costs the careful bot 1.7–2.7× the safe path
 * (median) and up to ~4× (p75 on 9-room floors), so slack covers exploration and grows with the room count (Phase 5 tuning).
 * Gate 2: the safe path's burn ≤ 70% of the torch.
 */
export const SLACK = { startPct: 250, perDepthPct: 2, minPct: 160, perRoomPct: 0 };
export const GATE_TORCH_PCT = 70;

/** Compass zones ranked by yesterday's deaths: weights ×10. Zones with no deaths 6; no deaths anywhere: uniform. */
export const CROWD = { rankWeights: [22, 16, 12], otherWeight: 8, emptyWeight: 6, uniformWeight: 10, topFamilyPct: 150, overflowTrapWeight: 2 };
export const TRAP_MAX = 12;

/** Floor shape: enemies stay beyond every wake range (4) of each room-1 tile; no hazard within 2 tiles of the entrance. */
export const ROOM1_ENEMY_GAP = 5;
export const ENTRANCE_CLEAR = 2;

/** Items per floor: 1, plus one more every 2 bands, at most 3. Kind by weight. */
export const ITEM_RULE = { base: 1, bandStep: 2, max: 3 };
export const ITEM_WEIGHT: Record<Item, number> = { potion: 3, oil: 2, bomb: 1 };

/** A floor failing a fairness gate is retried with seed + 1, at most this many times; hitting the cap is a generator bug. */
export const RETRY_CAP = 25;

/**
 * Curses (the crowd's vote). Each changes one number: torch and budget (budget also scales room capacity) in percent, light radius, wake range and starting
 * hearts as deltas. The torch never drops below gate 2; a cursed radius never drops below CURSE_MIN_RADIUS (dark rooms keep
 * their own), so tells stay visible a turn early.
 */
export const CURSES = {
  'short-wick': { torchPct: 90, budgetPct: 100, radiusDelta: 0, wakeDelta: 0, heartsDelta: 0 },
  overrun: { torchPct: 100, budgetPct: 140, radiusDelta: 0, wakeDelta: 0, heartsDelta: 0 },
  'deep-dark': { torchPct: 100, budgetPct: 100, radiusDelta: -1, wakeDelta: 0, heartsDelta: 0 },
  'light-sleepers': { torchPct: 100, budgetPct: 100, radiusDelta: 0, wakeDelta: 2, heartsDelta: 0 },
  frail: { torchPct: 100, budgetPct: 100, radiusDelta: 0, wakeDelta: 0, heartsDelta: -1 },
} as const satisfies Record<string, { torchPct: number; budgetPct: number; radiusDelta: number; wakeDelta: number; heartsDelta: number }>;
export const CURSE_MIN_RADIUS = 2;
export type Curse = keyof typeof CURSES;

/** The bot never plays longer than this many actions (bumps included). */
export const BOT_MAX_ACTIONS = 600;
/** Budget spending stops after this many failed placements in a row (the floor is full). */
export const PLACE_TRIES = 24;
/** A room holds at most one instance per this many floor tiles (at least one), by band: floors fill up as you descend. */
export const TILES_PER_INSTANCE = [10, 8, 6, 5, 5, 5];
