import { LIGHT, PALETTE, TILE, LEVELS, type Level, type Token } from '../shared/content';

export type Layer = { token: Token; rows: readonly string[] };
export type SpriteDef = { bg?: Token; layers: readonly Layer[] };

const NAMES = [
  'floor', 'wall', 'spikes', 'stairs', 'hero', 'wisp',
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
  floor: {
    // Flagstones: dark grooves on ink-2 slabs. In dim light the slabs sink to ink-1 and the
    // grooves vanish, so only the torch's pool shows the stone.
    bg: 'ink-2',
    layers: [{
      token: 'ink-1',
      rows: [
        '################',
        '#.....#.........',
        '#.....#.........',
        '#.....#.........',
        '#.....#.........',
        '#.....#.........',
        '#.....#.........',
        '#.....#.........',
        '#.....##########',
        '#..........#....',
        '#..........#....',
        '#..........#....',
        '#..........#....',
        '#..........#....',
        '#..........#....',
        '#..........#....',
      ],
    }],
  },
  wall: {
    // Bricks: ink-0 grooves survive every light level; stone top faces catch the torch.
    bg: 'ink-2',
    layers: [
      {
        token: 'ink-0',
        rows: [
          '...........#....',
          '...........#....',
          '...........#....',
          '...........#....',
          '################',
          '...#............',
          '...#............',
          '...#............',
          '...#............',
          '################',
          '........#.......',
          '........#.......',
          '........#.......',
          '........#.......',
          '################',
          '.............#..',
        ],
      },
      {
        token: 'stone',
        rows: [
          '###########.####', BLANK, BLANK, BLANK, BLANK,
          '###.############', BLANK, BLANK, BLANK, BLANK,
          '########.#######', BLANK, BLANK, BLANK, BLANK,
          '#############.##',
        ],
      },
    ],
  },
  spikes: {
    bg: 'ink-2',
    layers: [{
      token: 'blood',
      rows: at(5,
        '...#............',
        '...#.......#....',
        '..###......#....',
        '..###.....###...',
        '.#####....###...',
        '.#####...#####..',
        '#######..#####..',
        '#######.#######.',
      ),
    }],
  },
  stairs: {
    bg: 'ink-0',
    layers: [{
      token: 'bone',
      rows: at(1,
        '################', BLANK,
        '##############..', BLANK,
        '############....', BLANK,
        '##########......', BLANK,
        '########........', BLANK,
        '######..........', BLANK,
        '####............',
      ),
    }],
  },
  hero: {
    // Hooded delver in profile, facing right. Negative space carries the read: the face
    // opening (one ember glint inside), the neck notch under the hood, a cloak fold, split feet.
    layers: [
      {
        token: 'bone',
        rows: at(4,
          '......###.......',
          '.....#####......',
          '....###...#.....',
          '....##....#.....',
          '....###..##.....',
          '.....####.......',
          '....######..#...',
          '...##.#######...',
          '...##.####..#...',
          '...##.#####.....',
          '..###.######....',
          '...##....##.....',
        ),
      },
      {
        token: 'ember',
        rows: at(6,
          '............#...',
          '........#..##...',
          '...........###..',
          '............#...',
        ),
      },
    ],
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
  for (let i = def.layers.length - 1; i >= 0; i--) {
    const layer = def.layers[i];
    if (layer?.rows[y]?.[x] === '#') return shade(layer.token, level, x, y);
  }
  return def.bg === undefined ? null : shade(def.bg, level, x, y);
}

const paint = (
  ctx: CanvasRenderingContext2D, name: SpriteName, level: Level,
  ox: number, oy: number, zoom: number, flip: Flip,
): void => {
  const def = SPRITES[name];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const t = tokenAt(def, level, flip.flipX ? TILE - 1 - x : x, flip.flipY ? TILE - 1 - y : y);
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

/** One column per level, one row per sprite; frame key `${name}@${level}`. */
export function buildAtlas(): Atlas {
  const [canvas, ctx] = canvas2d(TILE * LEVELS.length, TILE * NAMES.length);
  const frames: Atlas['frames'] = {};
  NAMES.forEach((name, row) => {
    LEVELS.forEach((level, col) => {
      const x = col * TILE;
      const y = row * TILE;
      paint(ctx, name, level, x, y, 1, {});
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
  ctx.translate(dx + (opts.flipX ? TILE : 0), dy + (opts.flipY ? TILE : 0));
  ctx.scale(opts.flipX ? -1 : 1, opts.flipY ? -1 : 1);
  ctx.drawImage(atlas.canvas, f.x, f.y, TILE, TILE, 0, 0, TILE, TILE);
  ctx.restore();
}

/** Lit sprite at `zoom`× as its own canvas (16·zoom px). */
export function iconCanvas(name: SpriteName, zoom: number, opts: Flip = {}): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(TILE * zoom, TILE * zoom);
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
