// Tile-grid geometry shared by the sim (and gen.ts in Phase 5): what a map char means, line of sight, BFS, rays.
// Pure functions over `rows` of single-char tiles; no game state, no tuning.
export type Pos = { x: number; y: number };

export const DIRS: readonly { a: 'U' | 'D' | 'L' | 'R'; dx: number; dy: number }[] = [
  { a: 'U', dx: 0, dy: -1 },
  { a: 'D', dx: 0, dy: 1 },
  { a: 'L', dx: -1, dy: 0 },
  { a: 'R', dx: 1, dy: 0 },
];

export const width = (tiles: readonly string[]): number => tiles[0]?.length ?? 0;
/** Off the map reads as wall. */
export const tileAt = (tiles: readonly string[], x: number, y: number): string => tiles[y]?.[x] ?? '#';
export const isWall = (c: string): boolean => '#TSsZz'.includes(c);
/** Nothing can stand here. */
export const blocks = (c: string): boolean => isWall(c) || 'DHYy'.includes(c);
export const blocksSight = (c: string): boolean => isWall(c) || c === 'D' || c === 'H';
/** Ground hazards walkers avoid. */
export const hazard = (c: string): boolean => '^uxO,;oF'.includes(c);
export const isPit = (c: string): boolean => 'O,;o'.includes(c);
export const same = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;
export const dist = (a: Pos, b: Pos): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const setTile = (tiles: readonly string[], x: number, y: number, c: string): string[] =>
  tiles.map((row, ry) => (ry === y ? row.slice(0, x) + c + row.slice(x + 1) : row));

/** Row-major positions of every tile whose char is in `chars`. */
export function find(tiles: readonly string[], chars: string): Pos[] {
  const out: Pos[] = [];
  tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (chars.includes(row[x] ?? '')) out.push({ x, y });
  });
  return out;
}

/** Nearest tile with a char in `chars` (Manhattan; ties keep row-major order). */
export function nearest(tiles: readonly string[], from: Pos, chars: string): Pos | null {
  let best: Pos | null = null;
  for (const p of find(tiles, chars)) if (!best || dist(p, from) < dist(best, from)) best = p;
  return best;
}

/** Bresenham from a to b; only the tiles strictly between them can block. */
export function lineOfSight(tiles: readonly string[], a: Pos, b: Pos): boolean {
  const dx = Math.abs(b.x - a.x), dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let err = dx + dy, x = a.x, y = a.y;
  for (;;) {
    if (x === b.x && y === b.y) return true;
    if ((x !== a.x || y !== a.y) && blocksSight(tileAt(tiles, x, y))) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** Breadth-first distances from `from` over tiles where `pass` holds (-1 = unreachable). Reused by gen.ts. */
export function bfs(tiles: readonly string[], from: Pos, pass: (c: string) => boolean): number[] {
  const w = width(tiles);
  const d = tiles.flatMap((row) => [...row].map(() => -1));
  d[from.y * w + from.x] = 0;
  const queue: Pos[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    if (!p) break;
    for (const { dx, dy } of DIRS) {
      const q = { x: p.x + dx, y: p.y + dy };
      const i = q.y * w + q.x;
      if (q.x < 0 || q.x >= w || q.y < 0 || q.y >= tiles.length || d[i] !== -1 || !pass(tileAt(tiles, q.x, q.y))) continue;
      d[i] = (d[p.y * w + p.x] ?? 0) + 1;
      queue.push(q);
    }
  }
  return d;
}

/** Tiles a slit's dart flies over: out from its first open side (U, D, L, R), up to `range`, until something solid. */
export function slitLine(tiles: readonly string[], slit: Pos, range: number): Pos[] {
  const dir = DIRS.find((d) => !blocks(tileAt(tiles, slit.x + d.dx, slit.y + d.dy)));
  if (!dir) return [];
  const out: Pos[] = [];
  for (let k = 1; k <= range; k++) {
    const p = { x: slit.x + dir.dx * k, y: slit.y + dir.dy * k };
    if (blocks(tileAt(tiles, p.x, p.y))) break;
    out.push(p);
  }
  return out;
}

/** Straight tiles from `from` toward `to` (same row or column), up to `len`, until something solid. */
export function ray(tiles: readonly string[], from: Pos, to: Pos, len: number): Pos[] {
  const sx = Math.sign(to.x - from.x), sy = Math.sign(to.y - from.y);
  const out: Pos[] = [];
  for (let k = 1; k <= len; k++) {
    const p = { x: from.x + sx * k, y: from.y + sy * k };
    if (blocks(tileAt(tiles, p.x, p.y))) break;
    out.push(p);
  }
  return out;
}
