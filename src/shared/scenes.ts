// One small scene per tier-table cell, Trapsetter trap and item: a hand-written map, a fixed action log and the
// expected outcome. Used three ways: the Vitest case, the Lab Bestiary loop, and game.html?scene=<id> (dev only).
// game.ts imports this file only inside `import.meta.env.DEV`, so it never reaches the production bundle.
import { DARK, GOBLINS, IMPS, ITEMS, MECHANISMS, PITS, SKELETONS, SPIKES, TRAPS, type Family, type Item, type Tier } from './content';
import type { Action, Floor, Mode, Rect, TellKind } from './sim';

/** A state assertion after `turn`. `enemy`: [id, mode or 'gone', x?, y?]. `light`: torch radius. */
export type Check = {
  turn: number;
  tile?: [number, number, string];
  enemy?: [number, Mode | 'gone', number?, number?];
  pos?: [number, number];
  hearts?: number;
  torch?: number;
  light?: number;
  item?: Item | null;
  tell?: [number, number, TellKind];
};
export type Scene = {
  id: string;
  family: Family | 'trap' | 'item';
  tier: number;
  /** The rule in 8 words or fewer. */
  caption: string;
  cost: number;
  floor: Floor;
  log: readonly Action[];
  /** Every heart lost: [turn, cause]. */
  hurt: readonly [number, string][];
  end: 'won' | 'dead' | null;
  at: readonly Check[];
};

const ACTS: readonly Action[] = ['U', 'D', 'L', 'R', 'W', 'I'];
const L = (s: string): Action[] => [...s].flatMap((c) => ACTS.filter((a) => a === c));
// Family intro positions (§8): a tier first appears on depth 7·(tier − 1) + position.
const POS: Record<Family, number> = { spikes: 1, goblins: 1, imps: 2, mechanisms: 3, skeletons: 4, pits: 5, dark: 6 };
const COST: Record<Family, Record<Tier, { cost: number }>> = {
  spikes: SPIKES, goblins: GOBLINS, imps: IMPS, mechanisms: MECHANISMS, skeletons: SKELETONS, pits: PITS, dark: DARK,
};

type Spec = Omit<Scene, 'id' | 'cost' | 'floor' | 'family' | 'tier' | 'log'> & { rows: string[]; log: string; torch?: number; dark?: Rect[]; seed?: number };

const scene = (id: string, family: Scene['family'], tier: number, cost: number, floor: Omit<Floor, 'rows' | 'torch' | 'mercy' | 'seed'>, s: Spec): Scene => ({
  id, family, tier, cost, caption: s.caption,
  floor: { ...floor, rows: s.rows, torch: s.torch ?? 30, mercy: false, seed: s.seed ?? 1 },
  log: L(s.log), hurt: s.hurt, end: s.end, at: s.at,
});
const cell = (family: Family, tier: Tier, s: Spec): Scene =>
  scene(`${family}-${tier}`, family, tier, COST[family][tier].cost, { depth: 7 * (tier - 1) + POS[family], tiers: { [family]: tier }, ...(s.dark ? { dark: s.dark } : {}) }, s);
const extra = (family: 'trap' | 'item', name: string, cost: number, s: Spec): Scene => scene(`${family}-${name}`, family, 0, cost, { depth: 1 }, s);

export const SCENES: readonly Scene[] = [
  // ---- Spikes ----
  cell('spikes', 1, {
    caption: 'Fixed spikes are always up.',
    rows: ['##########', '#@..^...>#', '##########'],
    log: 'RRRRRRR',
    hurt: [[3, 'spikes']],
    end: 'won',
    at: [{ turn: 2, tell: [4, 1, 'spikes-up'] }],
  }),
  cell('spikes', 2, {
    caption: 'Spikes rise every third turn.',
    rows: ['##########', '#@..^...>#', '##########'],
    log: 'RRRRRRR',
    hurt: [[3, 'spikes']],
    end: 'won',
    at: [{ turn: 2, tell: [4, 1, 'spikes-half'] }, { turn: 1, tile: [4, 1, '^'] }],
  }),
  cell('spikes', 3, {
    caption: 'Each row rises one turn later.',
    rows: ['##########', '#...^....#', '#@..^...>#', '#...^....#', '##########'],
    log: 'RRWWRRRRR',
    hurt: [[5, 'spikes']],
    end: 'won',
    at: [{ turn: 3, tell: [4, 1, 'spikes-half'] }, { turn: 4, tell: [4, 2, 'spikes-half'] }, { turn: 5, tell: [4, 3, 'spikes-half'] }],
  }),
  cell('spikes', 4, {
    caption: 'Cracks hide spikes. They rise when near.',
    rows: ['##########', '#@..^...>#', '##########'],
    log: 'RRRRRRR',
    hurt: [[3, 'spikes']],
    end: 'won',
    at: [{ turn: 1, tile: [4, 1, 'u'] }, { turn: 1, tell: [4, 1, 'crack'] }, { turn: 2, tile: [4, 1, '^'] }],
  }),

  // ---- Goblins ----
  cell('goblins', 1, {
    caption: 'Within four tiles, it glints, then chases.',
    rows: ['##########', '#@....g.>#', '#........#', '##########'],
    log: 'RRWWWRRRRRR',
    hurt: [[5, 'goblin']],
    end: 'won',
    at: [{ turn: 1, enemy: [0, 'alert', 6, 1] }, { turn: 4, enemy: [0, 'windup', 4, 1] }, { turn: 6, enemy: [0, 'gone'] }],
  }),
  cell('goblins', 2, {
    caption: 'Pairs split up and flank you.',
    rows: ['##########', '#.......>#', '#.@....g.#', '#......g.#', '##########'],
    log: 'RWWWWWWRLRRRRRU',
    hurt: [[6, 'goblin']],
    end: 'won',
    at: [{ turn: 1, enemy: [1, 'alert'] }, { turn: 7, enemy: [1, 'chase', 2, 2] }, { turn: 9, enemy: [1, 'gone'] }],
  }),
  cell('goblins', 3, {
    caption: 'Dens breed goblins until you step on them.',
    rows: ['##########', '#@.....G.#', '#.......>#', '##########'],
    log: 'RRRWWWRRRRDR',
    hurt: [],
    end: 'won',
    at: [{ turn: 5, tell: [7, 1, 'spawn'] }, { turn: 6, enemy: [0, 'alert', 7, 1] }, { turn: 10, tile: [7, 1, '.'] }],
  }),
  cell('goblins', 4, {
    caption: 'Every third turn it moves twice.',
    rows: ['##########', '#@.....g>#', '#........#', '##########'],
    log: 'RRWWWRRRRRR',
    hurt: [],
    end: 'won',
    at: [{ turn: 2, tell: [7, 1, 'hungry'] }, { turn: 3, enemy: [0, 'chase', 5, 1] }],
  }),

  // ---- Imps ----
  cell('imps', 1, {
    caption: 'Wakes within four. Flies two tiles a turn.',
    rows: ['##########', '#@.......#', '#...^^i.>#', '##########'],
    log: 'RRWWWDRRRRRD',
    hurt: [[5, 'imp']],
    end: 'won',
    at: [{ turn: 2, enemy: [0, 'alert', 6, 2] }, { turn: 3, enemy: [0, 'chase', 4, 2] }, { turn: 4, enemy: [0, 'windup', 3, 2] }, { turn: 6, enemy: [0, 'gone'] }],
  }),
  cell('imps', 2, {
    caption: 'Divers mark your tile, then dive past.',
    rows: ['##########', '#@...>..i#', '#........#', '#........#', '##########'],
    log: 'RRRDUWDWWWUR',
    hurt: [[10, 'imp']],
    end: 'won',
    at: [{ turn: 6, tell: [4, 1, 'windup'] }, { turn: 7, enemy: [0, 'chase', 2, 1], hearts: 3 }, { turn: 9, tell: [4, 2, 'windup'] }],
  }),
  cell('imps', 3, {
    caption: 'One wakes, the whole swarm wakes.',
    rows: ['##########', '#>@......#', '#......ii#', '#.......i#', '##########'],
    log: 'RRWLLL',
    hurt: [],
    end: 'won',
    at: [{ turn: 1, enemy: [2, 'idle'] }, { turn: 2, enemy: [0, 'alert'] }, { turn: 2, enemy: [1, 'alert'] }, { turn: 2, enemy: [2, 'alert'] }],
  }),
  cell('imps', 4, {
    caption: 'Wakes only when your torch reaches it.',
    rows: ['##########', '#@..#....#', '#...#.i..#', '#.......>#', '##########'],
    log: 'RRDDRRRRRR',
    hurt: [],
    end: 'won',
    at: [{ turn: 3, enemy: [0, 'idle'] }, { turn: 4, enemy: [0, 'alert'] }, { turn: 6, enemy: [0, 'gone'] }],
  }),

  // ---- Mechanisms ----
  cell('mechanisms', 1, {
    caption: 'A plate opens its gate.',
    rows: ['##########', '#@._.#...#', '#....H..>#', '##########'],
    log: 'RRDRRRRR',
    hurt: [],
    end: 'won',
    at: [{ turn: 1, tile: [5, 2, 'H'] }, { turn: 2, tile: [5, 2, 'h'] }],
  }),
  cell('mechanisms', 2, {
    caption: 'This plate slams the gate behind you.',
    rows: ['##########', '#@..h._..#', '#...#...>#', '##########'],
    log: 'RRRRRRDR',
    hurt: [],
    end: 'won',
    at: [{ turn: 4, tile: [4, 1, 'h'] }, { turn: 5, tile: [4, 1, 'H'] }],
  }),
  cell('mechanisms', 3, {
    caption: 'Plate arms the slit. Next turn, a dart.',
    rows: ['##########', 'S@.._....#', '#.......>#', '##########'],
    log: 'RRRRDRRR',
    hurt: [[4, 'dart']],
    end: 'won',
    at: [{ turn: 3, tile: [0, 1, 's'] }, { turn: 3, tell: [5, 1, 'armed'] }, { turn: 4, tile: [0, 1, 'S'] }],
  }),
  cell('mechanisms', 4, {
    caption: 'The gate shuts five turns after the plate.',
    rows: ['##########', '#@_...H..#', '#.....#.>#', '##########'],
    log: 'RRRRRRDR',
    hurt: [],
    end: 'won',
    at: [{ turn: 1, tile: [6, 1, 'h'] }, { turn: 5, tell: [6, 1, 'gate'] }, { turn: 6, tile: [6, 1, 'H'] }],
  }),

  // ---- Skeletons ----
  cell('skeletons', 1, {
    caption: 'Knock it down, step over; it rises.',
    rows: ['##########', '#@.......#', '#......K>#', '##########'],
    log: 'RRRWWWDDRRRR',
    hurt: [],
    end: 'won',
    at: [{ turn: 7, enemy: [0, 'pile', 4, 2] }, { turn: 8, pos: [4, 2] }, { turn: 10, tell: [4, 2, 'rebuild'] }, { turn: 11, enemy: [0, 'chase', 4, 2] }],
  }),
  cell('skeletons', 2, {
    caption: 'Rebuilds in three. Walks around spikes.',
    rows: ['##########', '#....^...#', '#@...^.K>#', '#........#', '##########'],
    log: 'RRWWWWWRDRRRRRU',
    hurt: [],
    end: 'won',
    at: [{ turn: 3, enemy: [0, 'chase', 7, 3] }, { turn: 8, enemy: [0, 'pile'] }, { turn: 10, tell: [4, 2, 'rebuild'] }, { turn: 11, enemy: [0, 'chase'] }],
  }),
  cell('skeletons', 3, {
    caption: 'Archers shoot along your row, three tiles.',
    rows: ['##########', '#.....K..#', '#@.......#', '#>.......#', '##########'],
    log: 'RRWWDLL',
    hurt: [],
    end: 'won',
    at: [{ turn: 3, enemy: [0, 'chase', 6, 2] }, { turn: 4, enemy: [0, 'windup', 6, 2] }, { turn: 4, tell: [3, 2, 'windup'] }, { turn: 5, enemy: [0, 'chase', 6, 2] }],
  }),
  cell('skeletons', 4, {
    caption: 'A pair shares one rebuild timer.',
    rows: ['##########', '#....K...#', '#@.......#', '#....K..>#', '##########'],
    log: 'RWWWUDRLW',
    hurt: [],
    end: null,
    at: [{ turn: 6, enemy: [1, 'pile'] }, { turn: 7, enemy: [0, 'pile'] }, { turn: 8, tell: [3, 1, 'rebuild'] }, { turn: 8, tell: [2, 2, 'rebuild'] }, { turn: 9, enemy: [0, 'chase'] }, { turn: 9, enemy: [1, 'chase'] }],
  }),

  // ---- Pits ----
  cell('pits', 1, {
    caption: 'Fall in: lose a heart, land further on.',
    rows: ['##########', '#@..O...>#', '#........#', '##########'],
    log: 'RRRR',
    hurt: [[3, 'pit']],
    end: 'won',
    at: [{ turn: 3, pos: [7, 1] }],
  }),
  cell('pits', 2, {
    caption: 'Cracked floor falls once you step off.',
    rows: ['##########', '#@..,...>#', '##########'],
    log: 'RRRRRRR',
    hurt: [],
    end: 'won',
    at: [{ turn: 3, tile: [4, 1, ','] }, { turn: 4, tile: [4, 1, 'O'] }],
  }),
  cell('pits', 3, {
    caption: 'Chains crack underfoot and fall next turn.',
    rows: ['##########', '#OOOOOOOO#', '#@.,,,,.>#', '#OOOOOOOO#', '##########'],
    log: 'RRRWR',
    hurt: [[4, 'pit']],
    end: 'won',
    at: [{ turn: 2, tile: [3, 2, ';'] }, { turn: 3, tile: [3, 2, 'O'] }, { turn: 4, pos: [7, 2] }],
  }),
  cell('pits', 4, {
    caption: 'A missing mortar line marks a pit.',
    rows: ['##########', '#@..o...>#', '##########'],
    log: 'RRRR',
    hurt: [[3, 'pit']],
    end: 'won',
    at: [{ turn: 1, tell: [4, 1, 'mortar'] }, { turn: 3, tile: [4, 1, 'O'] }, { turn: 3, pos: [7, 1] }],
  }),

  // ---- Dark rooms ----
  cell('dark', 1, {
    caption: 'In the dark, your torch lights one tile.',
    rows: ['##########', '#@...#...#', '#.......>#', '#....#...#', '##########'],
    dark: [{ x: 6, y: 1, w: 3, h: 3 }],
    log: 'DRRRRRRR',
    hurt: [],
    end: 'won',
    at: [{ turn: 5, light: 4 }, { turn: 6, light: 1 }],
  }),
  cell('dark', 2, {
    caption: 'The dark burns your torch twice as fast.',
    rows: ['##########', '#@...#...#', '#.......>#', '#....#...#', '##########'],
    dark: [{ x: 6, y: 1, w: 3, h: 3 }],
    log: 'DRRRRRRR',
    hurt: [],
    end: 'won',
    at: [{ turn: 5, torch: 25 }, { turn: 6, torch: 23 }, { turn: 7, torch: 21 }],
  }),
  cell('dark', 3, {
    caption: 'Something else waits in the dark.',
    rows: ['##########', '#@...#...#', '#.....^.>#', '#....#...#', '##########'],
    dark: [{ x: 6, y: 1, w: 3, h: 3 }],
    log: 'DRRRRRRR',
    hurt: [[6, 'spikes']],
    end: 'won',
    at: [{ turn: 6, light: 1 }],
  }),
  cell('dark', 4, {
    caption: 'Light the brazier and the dark lifts.',
    rows: ['##########', '#@...#...#', '#.......>#', '#....#.Y.#', '##########'],
    dark: [{ x: 6, y: 1, w: 3, h: 3 }],
    log: 'DRRRRRDRURR',
    hurt: [],
    end: 'won',
    at: [{ turn: 7, light: 1 }, { turn: 8, tile: [7, 3, 'y'] }, { turn: 8, light: 4 }],
  }),

  // ---- Trapsetter traps ----
  extra('trap', 'spikes', TRAPS.spikes.cost, {
    caption: 'A survivor left these spikes.',
    rows: ['##########', '#@..x...>#', '##########'],
    log: 'RRRRRRR',
    hurt: [[3, 'trap']],
    end: 'won',
    at: [{ turn: 2, tell: [4, 1, 'spikes-up'] }],
  }),
  extra('trap', 'dart', TRAPS.dart.cost, {
    caption: 'Cross its line and a dart follows.',
    rows: ['##########', 'Z........#', '#@......>#', '##########'],
    log: 'URDRRRRRR',
    hurt: [[2, 'trap']],
    end: 'won',
    at: [{ turn: 1, tile: [0, 1, 'z'] }, { turn: 2, tile: [0, 1, 'Z'] }],
  }),
  extra('trap', 'stairs', TRAPS.stairs.cost, {
    caption: 'False stairs miss a step. They bite.',
    rows: ['##########', '#@..F...>#', '##########'],
    log: 'RRRRRRR',
    hurt: [[3, 'trap']],
    end: 'won',
    at: [{ turn: 2, tell: [4, 1, 'missing-step'] }, { turn: 3, tile: [4, 1, '.'] }],
  }),

  // ---- Items ----
  extra('item', 'potion', ITEMS.potion.cost, {
    caption: 'A potion restores one heart.',
    rows: ['##########', '#@^.p...>#', '##########'],
    log: 'RRRIRRRR',
    hurt: [[1, 'spikes']],
    end: 'won',
    at: [{ turn: 3, item: 'potion', hearts: 2 }, { turn: 4, item: null, hearts: 3 }],
  }),
  extra('item', 'oil', ITEMS.oil.cost, {
    caption: 'Lamp oil refills your torch.',
    rows: ['##########', '#@.l....>#', '##########'],
    torch: 30,
    log: 'RRIRRRRR',
    hurt: [],
    end: 'won',
    at: [{ turn: 2, item: 'oil', torch: 28 }, { turn: 3, item: null, torch: 29 }],
  }),
  extra('item', 'bomb', ITEMS.bomb.cost, {
    caption: 'Bombs clear foes and spikes. Bones stay down.',
    rows: ['##########', '#@.b^...>#', '#..Kg....#', '##########'],
    log: 'RRIRRRRR',
    hurt: [],
    end: 'won',
    at: [{ turn: 2, item: 'bomb' }, { turn: 3, enemy: [0, 'gone'] }, { turn: 3, enemy: [1, 'gone'] }, { turn: 3, tile: [4, 1, '.'] }],
  }),
];
