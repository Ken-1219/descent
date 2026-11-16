// LOCAL ONLY (dev builds): the /api/* endpoints faked on localStorage with the same shared code the server runs, so the
// harness plays real generated floors. URL knobs: ?post=N opens an older post's floor, ?loggedOut=1 a logged-out viewer,
// ?ghosts=N adds N fixture ghosts (0, 1, 20, 300, 1000) to every floor, like other players' deaths.
import { generate } from '../shared/gen';
import { carvingOf, fixtureGhosts, ghostView, type GhostRecord } from '../shared/ghosts';
import { hash } from '../shared/rng';
import { judge, type Floor, type RunResult } from '../shared/sim';
import type { Api } from './net';

const K = 'descent:local:';
const read = <T>(k: string): T | null => JSON.parse(localStorage.getItem(K + k) ?? 'null');
const write = (k: string, v: unknown) => localStorage.setItem(K + k, JSON.stringify(v));
const day = () => read<number>('day') ?? 1;
const floorOf = (d: number): Floor => {
  const stored = read<Floor>(`floor:${d}`);
  if (stored) return stored;
  const f = generate(d, hash(`descent:local:${d}`)).floor;
  write(`floor:${d}`, f);
  return f;
};
const runOf = (d: number) => read<RunResult & { log: string }>(`run:${d}`);
const params = new URLSearchParams(location.search);
const ME = 'local';
/** This profile's ghost and carving per floor, plus the fixture crowd: the same view the server builds. */
const ghostsOf = (d: number) => {
  const crowd = fixtureGhosts(floorOf(d), Number(params.get('ghosts') ?? 0), d);
  const mine = read<GhostRecord>(`ghost:${d}`);
  const carved = read<string>(`carving:${d}`);
  return ghostView({ ...crowd.records, ...(mine ? { [ME]: mine } : {}) }, { ...crowd.carvings, ...(carved ? { [ME]: carved } : {}) }, ME);
};
let offline = false;
const net = () => {
  if (offline) throw new Error('offline (local harness)');
};

export const local: Api = {
  floor: async () => {
    net();
    const d = Number(params.get('post') ?? day());
    if (params.get('loggedOut')) return { kind: 'login', depth: d };
    const floor = floorOf(d);
    const mine = runOf(d);
    if (mine) {
      const { log: _, ...run } = mine;
      return { kind: 'played', depth: d, seed: floor.seed ?? 0, floor, run, ghosts: ghostsOf(d), live: d === day(), attempt: 0 };
    }
    if (d < day()) return { kind: 'closed', depth: d, today: day(), todayUrl: `${location.pathname}?post=${day()}` };
    return { kind: 'play', depth: d, seed: floor.seed ?? 0, floor, ghosts: ghostsOf(d), attempt: 0 };
  },
  run: async ({ depth, log }) => {
    net();
    if (depth < day()) return { kind: 'closed', today: day(), todayUrl: `${location.pathname}?post=${day()}` };
    const prior = runOf(depth);
    if (prior) {
      const { log: l, ...run } = prior;
      return l === log ? { kind: 'saved', run } : { kind: 'rejected', reason: 'already played' };
    }
    const j = judge(floorOf(depth), log);
    if (!j.ok) return { kind: 'rejected', reason: j.reason };
    write(`run:${depth}`, { ...j.run, log });
    if (j.run.outcome === 'dead') write(`ghost:${depth}`, { name: 'local_delver', x: j.run.tile.x, y: j.run.tile.y, cause: j.run.cause, at: Date.now() });
    return { kind: 'saved', run: j.run };
  },
  start: async () => net(),
  carve: async ({ depth, carving }) => {
    net();
    if (depth < day()) return { kind: 'closed', today: day(), todayUrl: `${location.pathname}?post=${day()}` };
    const c = carvingOf(carving);
    if (!c) return { kind: 'rejected', reason: 'carving' };
    if (!read(`ghost:${depth}`)) return { kind: 'rejected', reason: 'no death' };
    const canon = c.dir ? `${c.id}:${c.dir}` : c.id;
    const stored = read<string>(`carving:${depth}`);
    if (stored && stored !== canon) return { kind: 'rejected', reason: 'already carved' };
    write(`carving:${depth}`, canon);
    return { kind: 'carved', carving: canon };
  },
  avatar: async () => ({ url: null }),
};

/** The local rollover: tomorrow's floor becomes today's. */
export const advanceDay = () => write('day', day() + 1);
/** Make every fake request fail like a dropped connection (tests the retry and "Not saved" states). */
export const setOffline = (on: boolean) => (offline = on);
