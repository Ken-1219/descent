import { LIGHT, PALETTE, PITS, SKELETONS, TILE, LEVELS, type Level, type Token } from '../shared/content';
import { spikeStage, step, tells, tierOf, type Enemy, type Event, type Kind, type Pos, type State, type Tell } from '../shared/sim';
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

/** A pack frame at `zoom`× as its own canvas (HUD item slot); undefined for a name the pack doesn't have. */
export function packIcon(pack: HTMLCanvasElement, name: string, zoom: number): HTMLCanvasElement | undefined {
  const f = Object.entries(PACK).find(([k]) => k === name)?.[1];
  if (!f) return undefined;
  const [x, y, w, h] = f;
  const [canvas, ctx] = canvas2d(w * zoom, h * zoom);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pack, x, y, w, h, 0, 0, w * zoom, h * zoom);
  return canvas;
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
  'wall-top': [32, 0, 16, 16],
  wall: [32, 16, 16, 16],
  'wall-hole': [48, 32, 16, 16],
  'spikes-0': [16, 192, 16, 16], // floor_spikes_anim_f0: down, holes only
  'spikes-1': [32, 192, 16, 16], // f1: tips showing
  'spikes-2': [48, 192, 16, 16], // f2: half-raised, the breathing tell
  spikes: [64, 192, 16, 16], // floor_spikes_anim_f3: fully raised
  'plate-blue': [48, 208, 16, 16],
  'plate-blue-down': [64, 208, 16, 16],
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
const STONE: readonly PackName[] = ['floor', 'wall-top', 'wall', 'wall-hole', 'stairs'];
const DANGER: readonly PackName[] = ['spikes-0', 'spikes-1', 'spikes-2', 'spikes'];
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

export type Light = { x: number; y: number; r: number; tint: Token };

export const rgba = (t: Token, a: number) => {
  const [r, g, b] = rgb(PALETTE[t]);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};


/** Darkness at `dark` alpha with soft holes cut at each light, then a warm or cold wash. Decoration only: fog decides visibility. */
export function shine(ctx: CanvasRenderingContext2D, w: number, h: number, lights: readonly Light[], dark: number): void {
  const [layer, d] = canvas2d(w, h);
  d.fillStyle = rgba('ink-0', dark);
  d.fillRect(0, 0, w, h);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const g = d.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    g.addColorStop(0, rgba('ink-0', 1));
    g.addColorStop(0.5, rgba('ink-0', 0.75));
    g.addColorStop(1, rgba('ink-0', 0));
    d.fillStyle = g;
    d.fillRect(0, 0, w, h);
  }
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = 'soft-light';
  for (const l of lights) {
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    g.addColorStop(0, rgba(l.tint, 0.7));
    g.addColorStop(1, rgba(l.tint, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---- Phase 4: what each tile, enemy and tell looks like, and how a turn moves. Shared by scene.ts and the Lab. ----

const still = (f: Frame): Anim => ({ frames: [f], ms: [1000], loop: true });
const P = (name: PackName): Frame => ({ src: 'pack', name });
const O = (name: SpriteName): Frame => ({ src: 'own', name });

/** A prop on a tile. Flat props lie on the floor; standing ones sort with actors by row. */
export type Prop = { anim: Anim; flat: boolean };
const flat = (f: Frame): Prop => ({ anim: still(f), flat: true });
const stand = (anim: Anim): Prop => ({ anim, flat: false });

/** Props on a tile, bottom to top. Floor and wall bases are drawn separately. */
export function tileLook(s: State, x: number, y: number): Prop[] {
  const c = s.tiles[y]?.[x] ?? '#';
  const on = s.pos.x === x && s.pos.y === y;
  switch (c) {
    case '^': {
      const st = spikeStage(s, x, y);
      return [flat(P(st === 2 ? 'spikes' : st === 1 ? 'spikes-2' : 'spikes-0'))];
    }
    case 'x': return [flat(P('spikes')), flat(O('trap-mark'))];
    case 'O': return [flat(O('pit'))];
    case ',': return PITS[tierOf(s, 'pits')].crumble === 'stand' ? [flat(O('pit')), flat(O('chain'))] : [flat(O('crumble'))];
    case ';': return [flat(O('pit')), flat(O('chain-crack'))];
    // One plate look for every tier: the pack's red button would read as a blood tell. The slit and its line warn of darts.
    case '_': return [flat(P(on ? 'plate-blue-down' : 'plate-blue'))];
    case 'H': return [stand(still(P('door-open'))), stand(still(O('bars')))];
    case 'h': case '/': return [stand(still(P('door-open')))];
    case 'D': return [stand(still(P('door')))];
    case 'S': case 's': return [stand(still(O('slit')))];
    case 'Z': case 'z': return [stand(still(O('slit'))), stand(still(O('trap-mark')))];
    case '>': return [flat(P('stairs')), flat(O('steps'))];
    // False stairs carry their tell in the art itself: the middle step edge is missing.
    case 'F': return [flat(P('stairs')), flat(O('missing-step'))];
    case 'G': return [flat(O('den'))];
    case 'Y': return [stand(still(O('brazier')))];
    case 'y': return [stand(still(O('brazier-lit')))];
    case 'k': return [stand(ANIMS['key-bob'])];
    case 'p': return [stand(ANIMS['potion-bob'])];
    case 'l': return [stand(ANIMS['oil-bob'])];
    case 'b': return [stand(ANIMS['bomb-fuse'])];
    default: return [];
  }
}

/** Tell marks, drawn from `tells()`. Blood shapes for danger next turn; quiet hairlines for hidden hazards once lit. */
export type Mark = { frame: Frame; x: number; y: number };
const MARK: Partial<Record<ReturnType<typeof tells>[number]['kind'], { name: SpriteName; above?: boolean }>> = {
  // Aim corners always mean "this tile hurts or shuts next turn"; they reach past the hero standing on it.
  windup: { name: 'mark-aim' },
  gate: { name: 'mark-aim' },
  cracking: { name: 'mark-aim' },
  'spikes-half': { name: 'mark-aim' },
  armed: { name: 'mark-line' },
  alert: { name: 'mark-glint', above: true },
  hungry: { name: 'mark-hungry', above: true },
  spawn: { name: 'mark-eyes' },
  crack: { name: 'crack' },
  mortar: { name: 'mortar' },
};
/**
 * Phase 11g: the tells as drawn. A wind-up frame on your own tile shows only if standing still costs a heart next turn: the
 * sim is deterministic, so this looks one turn ahead. Frames on other tiles still mark where an attack lands.
 */
export function shownTells(s: State): Tell[] {
  const all = tells(s);
  const onYou = all.some((t) => t.kind === 'windup' && t.x === s.pos.x && t.y === s.pos.y);
  const hits = onYou && !s.ended && step(s, 'W').events.some((e) => e.t === 'hurt');
  return onYou && !hits ? all.filter((t) => t.kind !== 'windup' || t.x !== s.pos.x || t.y !== s.pos.y) : all;
}
export const marks = (s: State): Mark[] =>
  shownTells(s).flatMap((t) => {
    const m = MARK[t.kind];
    return m ? [{ frame: O(m.name), x: t.x, y: m.above ? t.y - 1 : t.y }] : [];
  });

/** A skeleton pair sharing one rebuild timer: dot positions (canvas px) of a bone link between them while either is a pile. */
export function links(s: State): Pos[][] {
  if (!SKELETONS[tierOf(s, 'skeletons')].shared) return [];
  return s.enemies.flatMap((e) => {
    const mate = s.enemies.find((o) => o.kind === 'skeleton' && o.pack === e.pack && o.id > e.id);
    if (e.kind !== 'skeleton' || !mate || (e.mode !== 'pile' && mate.mode !== 'pile')) return [];
    const [ax, ay, bx, by] = [px(e.x), py(e.y) - 5, px(mate.x), py(mate.y) - 5];
    const n = Math.max(1, Math.floor(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 3));
    return [Array.from({ length: n + 1 }, (_, i) => ({ x: Math.round(ax + ((bx - ax) * i) / n), y: Math.round(ay + ((by - ay) * i) / n) }))];
  });
}

// The Warden is chained: it never runs or dies, so its "run" plays as the strain of a slam and a bump shakes its idle.
const IDLE: Record<Kind, Anim> = { goblin: ANIMS['goblin-idle'], imp: ANIMS['imp-idle'], skeleton: ANIMS['skelet-idle'], warden: ANIMS['warden-idle'] };
export const RUN: Record<Kind, Anim> = { goblin: ANIMS['goblin-run'], imp: ANIMS['imp-run'], skeleton: ANIMS['skelet-run'], warden: ANIMS['warden-run'] };
export const HURT: Record<Kind, Anim> = { goblin: ANIMS['goblin-hurt'], imp: ANIMS['imp-hurt'], skeleton: ANIMS['skelet-hurt'], warden: ANIMS['warden-idle'] };
const WINDUP: Record<Kind, PackName> = { goblin: 'goblin-run-0', imp: 'imp-run-0', skeleton: 'skelet-run-0', warden: 'warden-run-0' };
const DIGIT: readonly SpriteName[] = ['digit-1', 'digit-2', 'digit-3', 'digit-4'];

/** An enemy's pose for its mode. The wind-up is the anticipation frame (§15.4): run frame 0 leaning 1 px away from its target. */
export function enemyLook(e: Enemy): { anim: Anim; dx: number; dy: number; digit: SpriteName | null } {
  if (e.mode === 'pile') return { anim: still(P('skull')), dx: 0, dy: 0, digit: DIGIT[e.timer - 1] ?? null };
  if (e.mode === 'windup') {
    const a = e.aim[0];
    // Phase 11e: the Warden counts down; in its wind-up the slam is next turn ("1").
    return { anim: still(P(WINDUP[e.kind])), dx: a ? -Math.sign(a.x - e.x) : 0, dy: a ? -Math.sign(a.y - e.y) : 0, digit: e.kind === 'warden' ? 'digit-1' : null };
  }
  // Between slams the Warden shows the turns until the next one (its quiet turns, the wind-up, the slam), once it is 4 or fewer.
  if (e.kind === 'warden' && e.mode === 'chase') return { anim: IDLE.warden, dx: 0, dy: 0, digit: DIGIT[e.timer + 1] ?? null };
  return { anim: e.kind === 'imp' && e.mode === 'idle' ? ANIMS['imp-perch'] : IDLE[e.kind], dx: 0, dy: 0, digit: null };
}

// Motion (§15.4): fast out, slow settle; every action fits the 120 ms lock and plays together.
export const LOCK_MS = 120;
const HOP_MS = [24, 24, 16, 32];
const HOP_HURT_MS = [24, 16, 16, 60]; // the landing frame becomes the 60 ms hit-stop
const HOP_Y = [0, -2, -1, 0];
const IMP_ARC_Y = [-1, -3, -2, 0]; // wings never fly straight: three stepped heights between tiles
const DIVE_MS = [16, 16, 24, 48];
const FALL_MS = [24, 24, 24, 48]; // onto the pit, sink, sink, cut to the landing
const FALL_Y = [0, 3, 6, 0];
const LUNGE_PX = 4;
const LUNGE_MS = 40;
const NUDGE_MS = 24;
const STREAK_MS = 72;

export const px = (x: number) => x * TILE + TILE / 2;
export const py = (y: number) => y * TILE + TILE;
/** One motion key: from `at` ms after the turn starts the actor stands at (x, y) lifted by yo. */
export type Key = { at: number; x: number; y: number; yo: number };
export type Motion = { who: 'hero' | number; keys: Key[] };
/** A dart or arrow in flight. */
export type Streak = { from: Pos; to: Pos; at: number; until: number };

const path = (from: Pos, to: Pos, ms: readonly number[], ys: readonly number[], t0: number): Key[] => {
  let at = t0;
  return ms.map((m, k) => {
    const f = (k + 1) / ms.length;
    const key = { at, x: px(from.x + (to.x - from.x) * f), y: py(from.y + (to.y - from.y) * f), yo: ys[k] ?? 0 };
    at += m;
    return key;
  });
};
const lunge = (from: Pos, toward: Pos, distance: number, half: number): Key[] => {
  const x = px(from.x), y = py(from.y);
  return [
    { at: 0, x: x + Math.sign(toward.x - from.x) * distance, y: y + Math.sign(toward.y - from.y) * distance, yo: 0 },
    { at: half, x, y, yo: 0 },
  ];
};
const end = (keys: readonly Key[], ms: number) => (keys.at(-1)?.at ?? 0) + ms;

/** The motion of one turn from its events: positions in canvas px; `lock` is when input may go on (≤ LOCK_MS). */
export function choreograph(events: readonly Event[], next: State): { motions: Motion[]; streaks: Streak[]; lock: number } {
  const motions: Motion[] = [];
  const streaks: Streak[] = [];
  let lock = 0;
  const add = (who: Motion['who'], keys: Key[], last: number) => {
    motions.push({ who, keys });
    lock = Math.max(lock, end(keys, last));
  };
  const hurt = events.some((e) => e.t === 'hurt');
  const fall = events.find((e) => e.t === 'fall');
  const moves = new Map<number, Pos[]>();
  for (const e of events) {
    if (e.t === 'fall') {
      // Onto the pit (or already on the chain), sink twice, then cut to the landing.
      const [m0 = 0, m1 = 0, m2 = 0, m3 = 0] = FALL_MS;
      const pit = { x: px(e.at.x), y: py(e.at.y) };
      add('hero', [
        { at: 0, ...pit, yo: FALL_Y[0] ?? 0 },
        { at: m0, ...pit, yo: FALL_Y[1] ?? 0 },
        { at: m0 + m1, ...pit, yo: FALL_Y[2] ?? 0 },
        { at: m0 + m1 + m2, x: px(e.to.x), y: py(e.to.y), yo: 0 },
      ], m3);
    } else if (e.t === 'move' && fall) continue;
    else if (e.t === 'move') add('hero', path(e.from, e.to, hurt ? HOP_HURT_MS : HOP_MS, HOP_Y, 0), (hurt ? HOP_HURT_MS : HOP_MS).at(-1) ?? 0);
    else if (e.t === 'blocked' || e.t === 'locked') add('hero', lunge(next.pos, e.at, 1, NUDGE_MS), NUDGE_MS);
    else if (e.t === 'attack') add('hero', lunge(next.pos, e.at, LUNGE_PX, LUNGE_MS), LUNGE_MS);
    else if (e.t === 'enemyMove') moves.set(e.id, [...(moves.get(e.id) ?? [e.from]), e.to]);
    else if (e.t === 'enemyAttack') {
      const en = next.enemies.find((o) => o.id === e.id);
      // The Warden is drawn across its 2×2 block (centre of both columns, feet on the lower row): it lunges from there.
      const from = en?.kind === 'warden' ? { x: en.x + 0.5, y: en.y + 1 } : en;
      if (from) add(e.id, lunge(from, e.at, LUNGE_PX, LUNGE_MS), LUNGE_MS);
    } else if (e.t === 'shot') {
      streaks.push({ from: e.from, to: e.to, at: 0, until: STREAK_MS });
      lock = Math.max(lock, STREAK_MS);
    }
  }
  for (const [id, steps] of moves) {
    const en = next.enemies.find((o) => o.id === id);
    const imp = en?.kind === 'imp';
    const [a, b] = [steps[0], steps[1]];
    if (steps.length === 2 && a && b && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) {
      add(id, path(a, b, DIVE_MS, [0, -1, -1, 0], 0), DIVE_MS.at(-1) ?? 0); // a dive: one long, fast line
      continue;
    }
    // Several steps share one hop's time, so a double move still lands inside the lock.
    const n = steps.length - 1;
    const keys = steps.slice(1).flatMap((to, k) => path(steps[k] ?? to, to, HOP_MS.map((m) => Math.round(m / n)), imp ? IMP_ARC_Y : HOP_Y, Math.round((96 * k) / n)));
    add(id, keys, Math.round((HOP_MS.at(-1) ?? 0) / n));
  }
  return { motions, streaks, lock: Math.min(lock, LOCK_MS) };
}
