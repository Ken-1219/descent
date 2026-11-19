// Phase 11f: each thing a player meets is explained once, the first time it is in sight (TEACH, one line under the HUD).
// What has been taught is kept on this device and on the server (a bitmask per player), so a new deploy's empty storage
// never teaches it twice. Words only: nothing here touches the run.
import { TEACH, type Teach } from '../shared/content';
import { width } from '../shared/grid';
import { visibility, type Event, type State } from '../shared/sim';
import { shownTells } from './sprites';
import { api } from './net';

const KEY = 'descent:taught';
let bits = 0;
try {
  bits = Number(localStorage.getItem(KEY) ?? 0) || 0;
} catch {
  /* private mode: taught for this visit only */
}
const bit = (t: Teach) => 1 << TEACH.indexOf(t);

/** What the server already knows this player was taught (from the floor response). */
export const taught = (server = 0) => {
  bits |= server;
};

/** What this turn shows for the first time: the things in sight (or in hand) this player has not been taught yet. */
function met(s: State, events: readonly Event[]): Teach[] {
  const vis = visibility(s);
  const w = width(s.tiles);
  const lit = (x: number, y: number) => vis[y * w + x] === 2;
  const out: Teach[] = [];
  for (const t of shownTells(s)) {
    if (t.kind === 'windup' && lit(t.x, t.y)) out.push(t.cause === 'warden' ? 'warden' : 'imp'); // any foe's frame
    if (t.kind === 'armed' && lit(t.x, t.y)) out.push('dart');
  }
  s.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'u' && lit(x, y)) out.push('spikes');
      if (row[x] === 'H' && lit(x, y)) out.push('gate');
    }
  });
  if (events.some((e) => e.t === 'collapse') || s.enemies.some((e) => e.kind === 'skeleton' && e.mode === 'pile' && lit(e.x, e.y))) out.push('skeleton');
  const room = (s.floor.dark ?? []).find((r) => s.pos.x >= r.x && s.pos.x < r.x + r.w && s.pos.y >= r.y && s.pos.y < r.y + r.h);
  if (room && !s.tiles.slice(room.y, room.y + room.h).some((row) => row.slice(room.x, room.x + room.w).includes('y'))) out.push('dark'); // unlit
  if (s.item === 'bomb') out.push('bomb');
  if (s.item === 'oil') out.push('lamp');
  return out;
}

/** The one lesson for this turn, marked taught here and on the server; null when there is nothing new. */
export function lesson(s: State, events: readonly Event[]): Teach | null {
  const t = met(s, events).find((k) => !(bits & bit(k)));
  if (!t) return null;
  bits |= bit(t);
  try {
    localStorage.setItem(KEY, String(bits));
  } catch {
    /* private mode */
  }
  void api.hint(TEACH.indexOf(t)).catch(() => undefined); // logged out or offline: this device still remembers
  return t;
}
