// Pixel art: the sprite shapes drawn for Descent (hero, wisp, wall torch, death-to-wisp, UI icons).
// sprites.ts turns these into canvases; pack art lives in assets/atlas.png.
import { TILE, type Token } from '../shared/content';

export type Layer = { token: Token; rows: readonly string[] };
export type SpriteDef =
  | { bg?: Token; layers: readonly Layer[] }
  /** Multi-colour pixel map: each char maps to a token through `key`; '.' is transparent. */
  | { map: readonly string[]; key: Readonly<Record<string, Token>> };

export const NAMES = [
  'hero', 'hero-flicker', 'wisp', 'wisp-b', 'ghost', 'ghost-b', 'torch-0', 'torch-1', 'torch-2',
  'death-1', 'death-2', 'death-3', 'death-4', 'death-5', 'death-6', 'death-7', 'death-8', 'death-9',
  'heart', 'heart-lost', 'key', 'flame', 'arrow-up', 'arrow-left',
] as const;
export type SpriteName = (typeof NAMES)[number];


export const BLANK = '.'.repeat(TILE);
/** 16 rows: `art` starts at row `top`, the rest is blank. */
const at = (top: number, ...art: string[]): string[] =>
  Array.from({ length: TILE }, (_, y) => art[y - top] ?? BLANK);

// Key shared by every pixel map drawn for Descent.
const ART: Readonly<Record<string, Token>> = { o: 'ink-0', w: 'bone', p: 'pale', s: 'stone', k: 'ink-1', e: 'ember', d: 'ember-deep', g: 'gilt', t: 'wisp' };

// The Delver: white-hooded cleric, 16×19, the same height as the pack's heroes (19–21 px).
// Face in hood shadow with two ember eyes, gilt sash, robe shaded away from the torch,
// torch with a gilt core, ember flame, ember-deep cup and handle, gripped in a bone hand.
const HERO_MAP: readonly string[] = [
  '....oooo........',
  '...owwwwoo......',
  '..owwppwwwwo....',
  '.owwpwwooooo....',
  '.owpwwokkkko....',
  '.owpwokkkkko..o.',
  '.owpwokekkeo.oeo',
  '.owppwokkkoooggo',
  '.owwppwoooowoeeo',
  '..owwwwwwwwooddo',
  '.owgggggggwoowwo',
  '.owpwwwwwwpo.odo',
  '.ospwwwwwwpo.odo',
  '.ospwwwwwwpo..o.',
  '.osspwwwwwpo....',
  '.ossspwwwppo....',
  '..osssspppo.....',
  '..osso.osso.....',
  '..ooo..ooo......',
];

// The wisp: a teardrop of the dead, two dark eyes, its tip and tail flicker between the two frames.
const WISP: readonly string[] = [
  '................',
  '................',
  '........o.......',
  '.......oto......',
  '......ottto.....',
  '.....otwttto....',
  '....otwttttto...',
  '....otwttttto...',
  '....ottkttkto...',
  '....ottkttkto...',
  '....ottttttpo...',
  '.....otttppo....',
  '.....opotpo.....',
  '......o..o......',
  '................',
  '................',
];
const WISP_B: readonly string[] = [
  '................',
  '................',
  '.........o......',
  '........oto.....',
  '......ottto.....',
  '.....otwttto....',
  '....otwttttto...',
  '....otwttttto...',
  '....ottkttkto...',
  '....ottkttkto...',
  '....ottttttpo...',
  '.....otttppo....',
  '.....optopo.....',
  '.......o..o.....',
  '................',
  '................',
];

// Wall torch: ember-deep cup on a stone bracket; three flame shapes, shuffled at runtime.
const TORCH_0: readonly string[] = [
  '................',
  '................',
  '........e.......',
  '.......ee.......',
  '.......eee......',
  '......eegee.....',
  '......eggge.....',
  '......eggge.....',
  '.......ege......',
  '.....oddddo.....',
  '......osso......',
  '.......so.......',
  '.......so.......',
  '......osso......',
  '................',
  '................',
];
const TORCH_1: readonly string[] = [
  '................',
  '......e.........',
  '......ee........',
  '.......ee.......',
  '......eeee......',
  '......egge......',
  '......eggge.....',
  '......eggge.....',
  '.......ege......',
  '.....oddddo.....',
  '......osso......',
  '.......so.......',
  '.......so.......',
  '......osso......',
  '................',
  '................',
];
const TORCH_2: readonly string[] = [
  '................',
  '................',
  '................',
  '.........e......',
  '........ee......',
  '......eeeee.....',
  '.....eegggee....',
  '......eggge.....',
  '.......ege......',
  '.....oddddo.....',
  '......osso......',
  '.......so.......',
  '.......so.......',
  '......osso......',
  '................',
  '................',
];

// Death to wisp: the Delver kneels, falls, and the robe settles into a pile while the dropped torch still burns.
const DEATH_1: readonly string[] = [
  '...oooo.........',
  '..owwwwoo.......',
  '.owwppwwwo......',
  '.owpwooooo......',
  '.owpokekeo......',
  '.owppokkoo......',
  '.owwpwooowo.....',
  '..owgggggwo..o..',
  '.owpwwwwwpo.oeo.',
  '.ospwwwwwpooogo.',
  '.osspwwwppo.odo.',
  '.osssppppso.oo..',
  '..ooooooooo.....',
];
const DEATH_2: readonly string[] = [
  '.....oooo.......',
  '...oowwwwoo.....',
  '..owwppwkkko..e.',
  '.owwpwwkekko.eg.',
  '.owpgggwwwwo.ge.',
  '.ospwwwwwwppoodo',
  '.ossppppppssoddo',
  '..oooooooooooooo',
];
const DEATH_3: readonly string[] = [
  '......ooo....e..',
  '...ooowwwoo..eg.',
  '..owwwpwkkwo.ge.',
  '.owpwwwwwppooddo',
  '..oooooooooooooo',
];
// The flame gutters...
const DEATH_4: readonly string[] = [
  '......ooo.......',
  '...ooowwwoo..e..',
  '..owwwpwkkwo.d..',
  '.owpwwwwwppooddo',
  '..oooooooooooooo',
];
// ...and goes out. The empty robe stays; the wisp rises from it.
const PILE: readonly string[] = [
  '......ooo.......',
  '...ooowwwoo.....',
  '..owwwpwkkwo....',
  '.owpwwwwwppooddo',
  '..oooooooooooooo',
];
const WISP_SPARK: readonly string[] = [
  '.......t........',
  '......ttt.......',
  '......twt.......',
  '.......t........',
];

const trim = (rows: readonly string[]) => rows.filter((r) => r !== BLANK);
/** `top` floating `gap` rows above `base`: lets the wisp rise from the pile without redrawing either. */
const stack = (top: readonly string[], gap: number, base: readonly string[]) => [...top, ...Array.from({ length: gap }, () => BLANK), ...base];

const heartOutline: Layer = {
  token: 'bone',
  rows: at(3,
    '..###...###.....',
    '.#...#.#...#....',
    '.#....#....#....',
    '.#.........#....',
    '..#.......#.....',
    '...#.....#......',
    '....#...#.......',
    '.....#.#........',
    '......#.........',
  ),
};

// Placeholders; Phase 2 owns the final bitmaps.
export const SPRITES: Record<SpriteName, SpriteDef> = {
  // The Delver: see HERO_MAP. hero-flicker swaps the flame and eyes from ember to gilt for idle frame 2.
  hero: { map: HERO_MAP, key: ART },
  'hero-flicker': { map: HERO_MAP, key: { ...ART, e: 'gilt', g: 'ember' } },
  wisp: { map: WISP, key: ART },
  'wisp-b': { map: WISP_B, key: ART },
  // Your own ghost from an earlier day: the same wisp with an ember outline.
  ghost: { map: WISP, key: { ...ART, o: 'ember' } },
  'ghost-b': { map: WISP_B, key: { ...ART, o: 'ember' } },
  'torch-0': { map: TORCH_0, key: ART },
  'torch-1': { map: TORCH_1, key: ART },
  'torch-2': { map: TORCH_2, key: ART },
  'death-1': { map: DEATH_1, key: ART },
  'death-2': { map: DEATH_2, key: ART },
  'death-3': { map: DEATH_3, key: ART },
  'death-4': { map: DEATH_4, key: ART },
  'death-5': { map: PILE, key: ART },
  'death-6': { map: stack(WISP_SPARK, 3, PILE), key: ART },
  'death-7': { map: stack(trim(WISP), 1, PILE), key: ART },
  'death-8': { map: stack(trim(WISP), 5, PILE), key: ART },
  'death-9': { map: stack(trim(WISP), 9, PILE), key: ART },
  heart: {
    layers: [
      heartOutline,
      {
        token: 'blood',
        rows: at(4,
          '..###...###.....',
          '..####.####.....',
          '..#########.....',
          '...#######......',
          '....#####.......',
          '.....###........',
          '......#.........',
        ),
      },
    ],
  },
  'heart-lost': { layers: [heartOutline] },
  key: {
    layers: [{
      token: 'gilt',
      rows: at(6,
        '..###...........',
        '.#...#..........',
        '.#...##########.',
        '.#...#....#.##..',
        '..###...........',
      ),
    }],
  },
  flame: {
    layers: [
      {
        token: 'ember',
        rows: at(2,
          '.......#........',
          '.......##.......',
          '......###.......',
          '......####......',
          '.....#####......',
          '....######.#....',
          '....########....',
          '...#########....',
          '...##########...',
          '...##########...',
          '....########....',
          '.....######.....',
        ),
      },
      {
        token: 'ember-deep',
        rows: at(8,
          '......##........',
          '.....####.......',
          '.....#####......',
          '......###.......',
          '......##........',
        ),
      },
    ],
  },
  'arrow-up': {
    layers: [{
      token: 'bone',
      rows: at(4,
        '.......##.......',
        '......####......',
        '.....##..##.....',
        '....##....##....',
        '...##......##...',
        '..##........##..',
        '..#..........#..',
      ),
    }],
  },
  'arrow-left': {
    layers: [{
      token: 'bone',
      rows: at(2,
        '........##......',
        '.......##.......',
        '......##........',
        '.....##.........',
        '....##..........',
        '...##...........',
        '...##...........',
        '....##..........',
        '.....##.........',
        '......##........',
        '.......##.......',
        '........##......',
      ),
    }],
  },
};
