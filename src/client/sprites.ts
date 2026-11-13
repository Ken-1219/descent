import { LIGHT, PALETTE, TILE, LEVELS, type Level, type Token } from '../shared/content';

export type Layer = { token: Token; rows: readonly string[] };
export type SpriteDef =
  | { bg?: Token; layers: readonly Layer[] }
  /** Multi-colour pixel map: each char maps to a token through `key`; '.' is transparent. */
  | { map: readonly string[]; key: Readonly<Record<string, Token>> };

const NAMES = [
  'hero', 'wisp',
  'heart', 'heart-lost', 'key', 'flame', 'arrow-up', 'arrow-left',
] as const;
export type SpriteName = (typeof NAMES)[number];

type Flip = { flipX?: boolean; flipY?: boolean };

const BLANK = '.'.repeat(TILE);
/** 16 rows: `art` starts at row `top`, the rest is blank. */
const at = (top: number, ...art: string[]): string[] =>
  Array.from({ length: TILE }, (_, y) => art[y - top] ?? BLANK);

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
  hero: {
    // The Delver: white-hooded cleric, 16×19, the same height as the pack's heroes (19–21 px).
    // Face in hood shadow with two ember eyes, gilt sash, robe shaded away from the torch,
    // torch with a gilt core, ember flame, ember-deep cup and handle, gripped in a bone hand.
    map: [
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
    ],
    key: { o: 'ink-0', w: 'bone', p: 'pale', s: 'stone', k: 'ink-1', e: 'ember', d: 'ember-deep', g: 'gilt' },
  },
  wisp: {
    layers: [{
      token: 'wisp',
      rows: at(3,
        '........#.......',
        '.......##.......',
        '......####......',
        '.....######.....',
        '....########....',
        '....#..##.##....',
        '....########....',
        '....########....',
        '.....######.....',
        '......####......',
      ),
    }],
  },
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

const shade = (token: Token, level: Level, x: number, y: number): Token => {
  const l = level === 'edge' ? ((x + y) % 2 === 0 ? 'lit' : 'dim') : level;
  return l === 'lit' ? token : LIGHT[l][token];
};

/** Top layer wins, then bg; null = transparent. */
export function tokenAt(def: SpriteDef, level: Level, x: number, y: number): Token | null {
  if ('map' in def) {
    const t = def.key[def.map[y]?.[x] ?? '.'];
    return t === undefined ? null : shade(t, level, x, y);
  }
  for (let i = def.layers.length - 1; i >= 0; i--) {
    const layer = def.layers[i];
    if (layer?.rows[y]?.[x] === '#') return shade(layer.token, level, x, y);
  }
  return def.bg === undefined ? null : shade(def.bg, level, x, y);
}

/** Sprites may be taller than a tile (up to CELL); they stand bottom-aligned on their tile. */
const CELL = TILE * 2;
const heightOf = (def: SpriteDef) => ('map' in def ? def.map.length : TILE);

const paint = (
  ctx: CanvasRenderingContext2D, name: SpriteName, level: Level,
  ox: number, oy: number, zoom: number, flip: Flip,
): void => {
  const def = SPRITES[name];
  const h = heightOf(def);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < TILE; x++) {
      const t = tokenAt(def, level, flip.flipX ? TILE - 1 - x : x, flip.flipY ? h - 1 - y : y);
      if (t === null) continue;
      ctx.fillStyle = PALETTE[t];
      ctx.fillRect(ox + x * zoom, oy + y * zoom, zoom, zoom);
    }
  }
};

const canvas2d = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  return [canvas, ctx];
};

export type Atlas = { canvas: HTMLCanvasElement; frames: Record<string, { x: number; y: number }> };

/** One column per level, one CELL-high row per sprite; frame key `${name}@${level}`. */
export function buildAtlas(): Atlas {
  const [canvas, ctx] = canvas2d(TILE * LEVELS.length, CELL * NAMES.length);
  const frames: Atlas['frames'] = {};
  NAMES.forEach((name, row) => {
    LEVELS.forEach((level, col) => {
      const x = col * TILE;
      const y = row * CELL;
      paint(ctx, name, level, x, y + CELL - heightOf(SPRITES[name]), 1, {});
      frames[`${name}@${level}`] = { x, y };
    });
  });
  return { canvas, frames };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D, atlas: Atlas, name: SpriteName, level: Level,
  dx: number, dy: number, opts: Flip = {},
): void {
  const f = atlas.frames[`${name}@${level}`];
  if (!f) return;
  ctx.save();
  ctx.translate(dx + (opts.flipX ? TILE : 0), dy + TILE - CELL + (opts.flipY ? CELL : 0));
  ctx.scale(opts.flipX ? -1 : 1, opts.flipY ? -1 : 1);
  ctx.drawImage(atlas.canvas, f.x, f.y, TILE, CELL, 0, 0, TILE, CELL);
  ctx.restore();
}

/** Lit sprite at `zoom`× as its own canvas (16·zoom px). */
export function iconCanvas(name: SpriteName, zoom: number, opts: Flip = {}): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(TILE * zoom, heightOf(SPRITES[name]) * zoom);
  paint(ctx, name, 'lit', 0, 0, zoom, opts);
  return canvas;
}

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};

/** WCAG 2 contrast ratio of two '#rrggbb' colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

// 0x72 DungeonTileset II (CC0), assets/atlas.png: [x, y, w, h]. Tall frames are bottom-aligned to the tile.
export const PACK = {
  floor: [16, 64, 16, 16],
  'floor-crack': [32, 64, 16, 16],
  'floor-chip': [48, 80, 16, 16],
  'wall-top': [32, 0, 16, 16],
  wall: [32, 16, 16, 16],
  'wall-hole': [48, 32, 16, 16],
  spikes: [64, 192, 16, 16], // floor_spikes_anim_f3: fully raised
  stairs: [80, 192, 16, 16],
  crate: [288, 408, 16, 24],
  skull: [288, 432, 16, 16],
  knight: [128, 100, 16, 28],
  wizard: [128, 164, 16, 28],
  elf: [128, 36, 16, 28],
  dwarf: [128, 292, 16, 28],
  lizard: [128, 196, 16, 28],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type PackName = keyof typeof PACK;

// Stone is graded onto our ink ramp so the dungeon reads cold; danger onto blood. Actors keep their art.
const STONE: readonly PackName[] = ['floor', 'floor-crack', 'floor-chip', 'wall-top', 'wall', 'wall-hole', 'stairs'];
const DANGER: readonly PackName[] = ['spikes'];
const RAMP: readonly Token[] = ['ink-0', 'ink-1', 'ink-2', 'stone', 'pale'];

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const lum = ([r, g, b]: readonly number[]) => 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
const nearest = (ramp: readonly Token[], l: number): Token =>
  ramp.reduce((best, t) => (Math.abs(lum(rgb(PALETTE[t])) - l) < Math.abs(lum(rgb(PALETTE[best])) - l) ? t : best));

const grade = (ctx: CanvasRenderingContext2D, names: readonly PackName[], pick: (l: number) => Token) => {
  for (const name of names) {
    const [x, y, w, h] = PACK[name];
    const img = ctx.getImageData(x, y, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if ((d[i + 3] ?? 0) === 0) continue;
      const [r, g, b] = rgb(PALETTE[pick(lum([d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0]))]);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ctx.putImageData(img, x, y);
  }
};

/** Loads the pack and grades its stone and danger tiles onto the palette. */
export async function loadPack(): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = new URL('./assets/atlas.png', import.meta.url).href;
  await img.decode();
  const [canvas, ctx] = canvas2d(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  grade(ctx, STONE, (l) => nearest(RAMP, l));
  grade(ctx, DANGER, (l) => (l > 110 ? 'blood' : nearest(['ink-0', 'ink-1', 'ink-2'], l)));
  return canvas;
}

export function drawPack(ctx: CanvasRenderingContext2D, pack: HTMLCanvasElement, name: PackName, dx: number, dy: number): void {
  const [x, y, w, h] = PACK[name];
  ctx.drawImage(pack, x, y, w, h, dx, dy + TILE - h, w, h);
}
