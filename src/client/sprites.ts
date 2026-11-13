import { LIGHT, PALETTE, TILE, LEVELS, type Level, type Token } from '../shared/content';
import { NAMES, SPRITES, type SpriteDef, type SpriteName } from './art';

type Flip = { flipX?: boolean; flipY?: boolean };

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
  'goblin-idle-0': [368, 40, 16, 16],
  'goblin-idle-1': [384, 40, 16, 16],
  'goblin-idle-2': [400, 40, 16, 16],
  'goblin-idle-3': [416, 40, 16, 16],
  'goblin-run-0': [432, 40, 16, 16],
  'goblin-run-1': [448, 40, 16, 16],
  'goblin-run-2': [464, 40, 16, 16],
  'goblin-run-3': [480, 40, 16, 16],
  'imp-idle-0': [368, 64, 16, 16],
  'imp-idle-1': [384, 64, 16, 16],
  'imp-idle-2': [400, 64, 16, 16],
  'imp-idle-3': [416, 64, 16, 16],
  'imp-run-0': [432, 64, 16, 16],
  'imp-run-1': [448, 64, 16, 16],
  'imp-run-2': [464, 64, 16, 16],
  'imp-run-3': [480, 64, 16, 16],
  'skelet-idle-0': [368, 88, 16, 16],
  'skelet-idle-1': [384, 88, 16, 16],
  'skelet-idle-2': [400, 88, 16, 16],
  'skelet-idle-3': [416, 88, 16, 16],
  'skelet-run-0': [432, 88, 16, 16],
  'skelet-run-1': [448, 88, 16, 16],
  'skelet-run-2': [464, 88, 16, 16],
  'skelet-run-3': [480, 88, 16, 16],
  'warden-idle-0': [16, 332, 32, 36],
  'warden-idle-1': [48, 332, 32, 36],
  'warden-idle-2': [80, 332, 32, 36],
  'warden-idle-3': [112, 332, 32, 36],
  'warden-run-0': [144, 332, 32, 36],
  'warden-run-1': [176, 332, 32, 36],
  'warden-run-2': [208, 332, 32, 36],
  'warden-run-3': [240, 332, 32, 36],
  potion: [288, 336, 16, 16],
  'lamp-oil': [336, 352, 16, 16], // small flask: a different silhouette from the potion
  'bomb-0': [288, 320, 16, 16],
  'bomb-1': [304, 320, 16, 16],
  'bomb-2': [320, 320, 16, 16],
  door: [32, 240, 32, 32],
  'door-open': [80, 240, 32, 32],
  'wall-hole-2': [48, 48, 16, 16],
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
  ctx.drawImage(pack, x, y, w, h, dx + (TILE - w) / 2, dy + TILE - h, w, h);
}

export type Frame =
  | { src: 'own'; name: SpriteName; dy?: number; tint?: Token }
  | { src: 'pack'; name: PackName; dy?: number; tint?: Token };
export type Anim = { frames: readonly Frame[]; ms: readonly number[]; loop: boolean };

/** Index of the frame showing at `elapsed` ms. Loops wrap; one-shots clamp to the last frame. */
export function frameAt(anim: Anim, elapsed: number): number {
  const total = anim.ms.reduce((a, b) => a + b, 0);
  let t = anim.loop ? elapsed % total : elapsed;
  for (let i = 0; i < anim.ms.length; i++) {
    t -= anim.ms[i] ?? 0;
    if (t < 0) return i;
  }
  return anim.ms.length - 1;
}

const pack = (names: readonly PackName[], ms: readonly number[], loop = true): Anim =>
  ({ frames: names.map((name) => ({ src: 'pack', name })), ms, loop });
const bob = (name: PackName): Anim =>
  ({ frames: [{ src: 'pack', name }, { src: 'pack', name, dy: -1 }], ms: [700, 500], loop: true });
const own = (names: readonly SpriteName[], ms: readonly number[], loop = true): Anim =>
  ({ frames: names.map((name) => ({ src: 'own', name })), ms, loop });
const float = (a: SpriteName, b: SpriteName): Anim =>
  ({ frames: [{ src: 'own', name: a }, { src: 'own', name: b, dy: -1 }, { src: 'own', name: a }, { src: 'own', name: b, dy: -1 }], ms: [500, 380, 620, 300], loop: true });
const hurt = (name: PackName): Anim =>
  ({ frames: [{ src: 'pack', name, tint: 'blood' }, { src: 'pack', name }], ms: [84, 140], loop: false });

// Timing: spec 2026-11-13-phase-2-design.md, §15.4.
export const ANIMS = {
  'goblin-idle': pack(['goblin-idle-0', 'goblin-idle-1', 'goblin-idle-2', 'goblin-idle-3'], [110, 90, 110, 160]),
  'goblin-run': pack(['goblin-run-0', 'goblin-run-1', 'goblin-run-2', 'goblin-run-3'], [84, 84, 84, 120]),
  'imp-perch': pack(['imp-idle-0'], [600]),
  'imp-idle': pack(['imp-idle-0', 'imp-idle-1', 'imp-idle-2', 'imp-idle-3'], [120, 90, 90, 200]),
  'imp-run': pack(['imp-run-0', 'imp-run-1', 'imp-run-2', 'imp-run-3'], [84, 84, 84, 140]),
  'skelet-idle': pack(['skelet-idle-0', 'skelet-idle-1', 'skelet-idle-2', 'skelet-idle-3'], [180, 140, 140, 260]),
  'skelet-run': pack(['skelet-run-0', 'skelet-run-1', 'skelet-run-2', 'skelet-run-3'], [220, 100, 100, 120]),
  'warden-idle': pack(['warden-idle-0', 'warden-idle-1', 'warden-idle-2', 'warden-idle-3'], [260, 160, 160, 340]),
  'warden-run': pack(['warden-run-0', 'warden-run-1', 'warden-run-2', 'warden-run-3'], [240, 120, 120, 200]),
  'potion-bob': bob('potion'),
  'oil-bob': bob('lamp-oil'),
  'bomb-fuse': pack(['bomb-0', 'bomb-1', 'bomb-2'], [140, 100, 180]),
  'goblin-hurt': hurt('goblin-idle-0'),
  'imp-hurt': hurt('imp-idle-0'),
  'skelet-hurt': hurt('skelet-idle-0'),
  'warden-hurt': hurt('warden-idle-0'),
  'hero-idle': own(['hero', 'hero-flicker'], [520, 380]),
  'hero-hurt': { frames: [{ src: 'own', name: 'hero', tint: 'blood' }, { src: 'own', name: 'hero' }], ms: [84, 140], loop: false },
  // Collapse ≈ 600 ms (d1–d3), a 200 ms beat of stillness (d3 held), the flame gutters and dies, then the wisp rises slowly.
  'hero-death': own(
    ['death-1', 'death-2', 'death-3', 'death-3', 'death-4', 'death-5', 'death-6', 'death-7', 'death-8', 'death-9'],
    [100, 100, 140, 200, 120, 140, 160, 240, 300, 420],
    false,
  ),
  'wisp-float': float('wisp', 'wisp-b'),
  'ghost-float': float('ghost', 'ghost-b'),
  'key-bob': { frames: [{ src: 'own', name: 'key' }, { src: 'own', name: 'key', dy: -1 }], ms: [700, 500], loop: true },
  // Played in shuffled order with random holds by the caller; listed here at its base timing.
  'torch-flame': own(['torch-0', 'torch-1', 'torch-2'], [84, 112, 140]),
} satisfies Record<string, Anim>;

let tintCanvas: HTMLCanvasElement | null = null;

/** Draws the frame of `anim` showing at `elapsed` ms, standing on the tile at (dx, dy). */
export function drawAnim(
  ctx: CanvasRenderingContext2D, atlas: Atlas, pack: HTMLCanvasElement, anim: Anim, elapsed: number, dx: number, dy: number,
): void {
  const f = anim.frames[frameAt(anim, elapsed)];
  if (!f) return;
  const draw = (c: CanvasRenderingContext2D, x: number, y: number) =>
    f.src === 'own' ? drawFrame(c, atlas, f.name, 'lit', x, y) : drawPack(c, pack, f.name, x, y);
  const y = dy + (f.dy ?? 0);
  if (!f.tint) return draw(ctx, dx, y);
  // Flash: draw into a scratch canvas, fill its pixels with the tint, copy back. Origin (16, 32) leaves room for tall and wide frames.
  tintCanvas ??= canvas2d(64, 64)[0];
  const t = tintCanvas.getContext('2d');
  if (!t) return;
  t.clearRect(0, 0, 64, 64);
  draw(t, 16, 32);
  t.globalCompositeOperation = 'source-atop';
  t.fillStyle = PALETTE[f.tint];
  t.fillRect(0, 0, 64, 64);
  t.globalCompositeOperation = 'source-over';
  ctx.drawImage(tintCanvas, dx - 16, y - 32);
}
