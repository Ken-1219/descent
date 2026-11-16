// Ghosts and carvings: what a death leaves on a floor. Never read by the simulation; the server derives every field
// from the replay and the Devvit context, then shapes them for the wire here so server and local mode agree.
import { CARVINGS, GHOSTS, type CarvingKind } from './content';
import { mulberry32 } from './rng';
import type { Floor, Pos } from './sim';

export type Dir = 'U' | 'D' | 'L' | 'R';
export type Carving = { id: string; text: string; kind: CarvingKind; dir: Dir | null };
/** What the server stores per ghost (`f:{d}:ghosts`). `name` is null for bots, which show as a nameless delver. */
export type GhostRecord = { name: string | null; x: number; y: number; cause: string; at: number; bot?: true };
/** One ghost on the wire. `carving` is the stored "id" or "id:dir". */
export type Ghost = { name: string | null; x: number; y: number; cause: string; carving: string | null; mine?: true };
/** `tiles`: [x, y, count] for every tile with a ghost. `list`: capped records, carved first, then newest. */
export type GhostView = { fell: number; tiles: [number, number, number][]; list: Ghost[] };

const DIRS: readonly Dir[] = ['U', 'D', 'L', 'R'];
const isDir = (d: string | undefined): d is Dir => DIRS.some((x) => x === d);

/** Parse a stored or submitted carving; null when the id is unknown or the direction doesn't fit the phrase's kind. */
export function carvingOf(raw: string): Carving | null {
  const [id = '', dir, extra] = raw.split(':');
  const c = CARVINGS[id];
  if (!c || extra !== undefined) return null;
  if (c.kind === 'path') return isDir(dir) ? { id, ...c, dir } : null; // a path with no direction is useless
  return dir === undefined ? { id, ...c, dir: null } : null;
}

const ARROW: Readonly<Record<Dir, string>> = { U: '↑', D: '↓', L: '←', R: '→' };
/** A carving as players read it: the phrase, plus an arrow for a path ("Safe this way ←"). */
export const carvingLabel = (raw: string): string => {
  const c = carvingOf(raw);
  return c ? (c.dir ? `${c.text} ${ARROW[c.dir]}` : c.text) : '';
};

/** Every carving a player can choose, path phrases once per direction (the picker's options). */
export const CARVING_CHOICES: readonly string[] = Object.entries(CARVINGS).flatMap(([id, c]) => (c.kind === 'path' ? DIRS.map((d) => `${id}:${d}`) : [id]));

/**
 * ghostView: per-tile counts for all ghosts plus at most `cap` records, carved ones first, then newest; the caller's own
 * ghost is always in the list. Sorting is by `at` then key, so equal inputs give equal output.
 */
export function ghostView(records: Readonly<Record<string, GhostRecord>>, carvings: Readonly<Record<string, string>>, me: string | null, cap = GHOSTS.list): GhostView {
  const keys = Object.keys(records).sort();
  const counts = new Map<string, [number, number, number]>();
  for (const k of keys) {
    const g = records[k];
    if (!g) continue;
    const t = counts.get(`${g.x},${g.y}`) ?? [g.x, g.y, 0];
    t[2]++;
    counts.set(`${g.x},${g.y}`, t);
  }
  const ranked = keys
    .filter((k) => k !== me)
    .sort((a, b) => Number(!!carvings[b]) - Number(!!carvings[a]) || (records[b]?.at ?? 0) - (records[a]?.at ?? 0) || (a < b ? -1 : 1));
  const own = me && records[me] ? [me] : [];
  const list = [...own, ...ranked].slice(0, cap).flatMap((k) => {
    const g = records[k];
    return g ? [{ name: g.name, x: g.x, y: g.y, cause: g.cause, carving: carvings[k] ?? null, ...(k === me ? { mine: true as const } : {}) }] : [];
  });
  return { fell: keys.length, tiles: [...counts.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]), list };
}

/** Walkable floor tiles of a floor, in reading order (fixtures and bot carvings pick from these). */
export const floorTiles = (f: Floor): Pos[] => f.rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === '.' ? [{ x, y }] : [])));

/** Seeded fixture ghosts for the Lab and local mode (0, 1, 20, 300, 1,000): clustered like real deaths, some carved. */
export function fixtureGhosts(f: Floor, n: number, seed = 1): { records: Record<string, GhostRecord>; carvings: Record<string, string> } {
  const rnd = mulberry32(seed);
  const tiles = floorTiles(f);
  // One deadly spot two tiles from the entrance, so a fixture crowd is in sight from the first turn; five more anywhere.
  const y0 = f.rows.findIndex((r) => r.includes('@'));
  const x0 = f.rows[y0]?.indexOf('@') ?? 0;
  const first = tiles.find((t) => Math.abs(t.x - x0) + Math.abs(t.y - y0) === 2);
  const hot = [first, ...Array.from({ length: 5 }, () => tiles[rnd() % tiles.length])].filter((t): t is Pos => !!t);
  const records: Record<string, GhostRecord> = {};
  const carvings: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    // Most deaths pile onto a few deadly tiles; the rest scatter.
    const t = rnd() % 3 ? hot[rnd() % hot.length] : tiles[rnd() % tiles.length];
    if (!t) continue;
    const key = `fixture:${i}`;
    records[key] = { name: i % 4 ? `delver_${i}` : null, x: t.x, y: t.y, cause: ['spikes', 'goblin', 'dark', 'imp'][rnd() % 4] ?? 'dark', at: i, ...(i % 4 ? {} : { bot: true as const }) };
    if (rnd() % 3 === 0) carvings[key] = CARVING_CHOICES[rnd() % CARVING_CHOICES.length] ?? 'trap-ahead';
  }
  return { records, carvings };
}
