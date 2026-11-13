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
  'slit', 'missing-step', 'steps', 'pit', 'crack', 'mortar', 'bars', 'chain', 'chain-crack', 'crumble', 'den', 'brazier', 'brazier-lit',
  'mark-aim', 'mark-line', 'mark-glint', 'mark-hungry', 'mark-eyes', 'trap-mark', 'digit-1', 'digit-2', 'digit-3', 'digit-4',
] as const;
export type SpriteName = (typeof NAMES)[number];


export const BLANK = '.'.repeat(TILE);
/** 16 rows: `art` starts at row `top`, the rest is blank. */
const at = (top: number, ...art: string[]): string[] =>
  Array.from({ length: TILE }, (_, y) => art[y - top] ?? BLANK);

// Key shared by every pixel map drawn for Descent.
const ART: Readonly<Record<string, Token>> = { o: 'ink-0', w: 'bone', p: 'pale', s: 'stone', k: 'ink-1', n: 'ink-2', e: 'ember', d: 'ember-deep', g: 'gilt', t: 'wisp', r: 'blood' };

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

// ---- Phase 4: obstacle art the pack lacks. Overlays are full 16×16 tiles drawn on top of floor, wall or pack props. ----
// The graded floor tile has an ink-1 grout row on top and an ink-2 face; hidden-hazard tells are drawn against that.
const tile = (...rows: string[]): string[] => Array.from({ length: TILE }, (_, y) => rows[y] || BLANK);

// Dart slit: a dark letterbox in the wall with a stone lip.
const SLIT = tile('', '', '', '', '', '....ssssssss....', '...soooooooos...', '...okkkkkkkko...', '...soooooooos...', '....ssssssss....');
// Stairs: the graded pack stairs are a dark wedge, so pale edges draw its three steps. False stairs leave the middle one out.
const STEP_A = ['....wwwwwwwwwww.', '....w...........', '....w...........'];
const STEP_B = ['........wwwwwww.', '........w.......', '........w.......'];
const STEP_C = ['............www.', '............w...', '............w...'];
const STEPS = tile('', '', '', ...STEP_A, ...STEP_B, ...STEP_C);
// The missing step is a black gap where its edge should be.
const MISSING_STEP = tile('', '', '', ...STEP_A, '........ooooooo.', '........ooooooo.', '........oo......', ...STEP_C);
// Open pit: black, with only its far wall catching light. No brick rim, so a row of pits reads as a chasm, not a wall.
const PIT = tile('.oooooooooooooo.', 'onnnnnnnnnnnnnno', 'okkkkkkkkkkkkkko', 'okkkknkkkkkkknko', ...Array.from({ length: 11 }, () => 'oooooooooooooooo'), '.oooooooooooooo.');
// Buried spikes: a hairline crack with four pin-pricks where the tips wait.
// An X of hairline cracks joining the four holes where the spike tips wait (pale glints).
const CRACK = tile('', '', '', '....o......o....', '...opo....opo...', '....oo....oo....', '.....o....o.....', '......oooo......', '.....o....o.....', '....oo....oo....', '...opo....opo...', '....o......o....');
// Hidden pit: one grout line is missing from the top edge.
// The whole top grout line is gone and the middle sags: the floor here is hollow.
const MORTAR = tile('nnnnnnnnnnnnnnnn', '', '', '', '...k........k...', '....k......k....', '.....kkkkkk.....');
// Gate: iron bars standing in the open doorway (the pack's open door frame sits under them).
const BARS: readonly string[] = [
  '.osssssssssssso.', '.oppppppppppppo.', '.osssssssssssso.',
  ...Array.from({ length: 18 }, (_, i) => (i % 6 === 5 ? '.opsopsopsopsoo.' : '..ps.ps.ps.ps...')),
  '.osssssssssssso.', '.oppppppppppppo.', '..oooooooooooo..',
];
// Chain bridge over a pit: two chain rails and slats. The cracking frame splits the slats in blood: it falls next turn.
const CHAIN = tile('', '', '', '.pp..pp..pp..pp.', 'p..pp..pp..pp..p', '.pp..pp..pp..pp.', 'oooooooooooooooo', 'spspspspspspspsp', 'pspspspspspspsps', 'oooooooooooooooo', '.pp..pp..pp..pp.', 'p..pp..pp..pp..p', '.pp..pp..pp..pp.');
const CHAIN_CRACK = tile('', '', '', '.pp..pp..pp..pp.', 'p..pp..pp..pp..p', '.pp..pp..pp..pp.', 'oooooooroooooooo', 'spspsprsspspspsp', 'pspspsprpspspsps', 'oooooorooooooooo', '.pp..pp..pp..pp.', 'p..pp..pp..pp..p', '.pp..pp..pp..pp.');
// Crumbling floor: heavy cracks and loose chips.
const CRUMBLE = tile('', '..o.......o.....', '...o.....o..p...', '...o....o.......', '....oo.o....o...', '.p....o....o....', '.....o.o..o.....', '....o...oo...p..', '...o.....o......', '..o..p...o......', '.........o.o....', '..p.....o...o...', '.......o.....o..');
// Goblin den: a burrow mouth with a gnawed bone. The spawn tell puts two blood eyes in the dark.
const DEN = tile('', '', '', '', '', '', '....oooooooo....', '...osssssssso...', '..ossoooooosso..', '.osoooooooooooso', '.osoooooooooooso', '.ossoooooooooso.', '..ossssssssss.o.', '.wo.oooooooo.ow.', 'wwo..........oww');
const MARK_EYES = tile('', '', '', '', '', '', '', '', '', '.....r....r.....');
const BRAZIER_BOWL = ['...oooooooooo...', '..osssssssssso..', '..opkkkkkkkkpo..', '...osssssssso...', '....osssssso....', '......osso......', '......osso......', '.....osssso.....', '....osssssso....', '....oooooooo....'];
const BRAZIER = tile('', '', '', '', '', '', ...BRAZIER_BOWL);
const BRAZIER_LIT = tile('', '.......e........', '......ee..e.....', '.....eege.ee....', '.....egggeee....', '....eegggggee...', ...BRAZIER_BOWL.map((r, i) => (i === 2 ? '..opddeddeddpo..' : r)));
// Tell marks, all blood: aim corners (this tile is struck next turn), line dash (a dart or dive passes), glints over a head.
const MARK_AIM = tile('', '.rrr........rrr.', '.r............r.', '.r............r.', '', '', '', '', '', '', '', '', '.r............r.', '.r............r.', '.rrr........rrr.');
const MARK_LINE = tile('', '', '', '', '', '', '', '......rrrr......', '......rrrr......');
const MARK_GLINT = tile('', '', '', '', '', '', '', '', '', '', '', '', '', '', '.......rr.......', '.......rr.......');
// Starving: "!!" over its head the turn before it moves twice.
const MARK_HUNGRY = tile('', '', '', '', '', '', '', '', '.....rr.rr......', '.....rr.rr......', '.....rr.rr......', '.....rr.rr......', '', '.....rr.rr......');
// Left by a survivor: a small wisp carving in the corner, never glowing.
const TRAP_MARK = tile('', '', '', '', '', '', '', '', '', '', '', '', '.............t..', '............ttt.');
// Pile countdown, top-right: bone digits, the last one in blood (rebuilds next turn).
const DIGITS: Record<1 | 2 | 3 | 4, readonly string[]> = {
  1: ['.ooo.', 'orro.', '.oro.', '.oro.', 'orrro', 'ooooo'],
  2: ['oooo.', 'owwwo', 'oowwo', 'owwoo', 'owwwo', 'ooooo'],
  3: ['oooo.', 'owwwo', 'oowwo', 'ooowo', 'owwwo', 'ooooo'],
  4: ['oo.oo', 'owowo', 'owwwo', 'ooowo', '..owo', '..ooo'],
};
const digit = (n: 1 | 2 | 3 | 4) => tile(...DIGITS[n].map((r) => '..........' + r + '.'));

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
  slit: { map: SLIT, key: ART },
  'missing-step': { map: MISSING_STEP, key: ART },
  steps: { map: STEPS, key: ART },
  pit: { map: PIT, key: ART },
  crack: { map: CRACK, key: ART },
  mortar: { map: MORTAR, key: ART },
  bars: { map: BARS, key: ART },
  chain: { map: CHAIN, key: ART },
  'chain-crack': { map: CHAIN_CRACK, key: ART },
  crumble: { map: CRUMBLE, key: ART },
  den: { map: DEN, key: ART },
  brazier: { map: BRAZIER, key: ART },
  'brazier-lit': { map: BRAZIER_LIT, key: ART },
  'mark-aim': { map: MARK_AIM, key: ART },
  'mark-line': { map: MARK_LINE, key: ART },
  'mark-glint': { map: MARK_GLINT, key: ART },
  'mark-hungry': { map: MARK_HUNGRY, key: ART },
  'mark-eyes': { map: MARK_EYES, key: ART },
  'trap-mark': { map: TRAP_MARK, key: ART },
  'digit-1': { map: digit(1), key: ART },
  'digit-2': { map: digit(2), key: ART },
  'digit-3': { map: digit(3), key: ART },
  'digit-4': { map: digit(4), key: ART },
};
