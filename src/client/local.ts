// LOCAL ONLY (dev builds): the /api/* endpoints faked on localStorage with the same shared code the server runs, so the
// harness plays real generated floors. URL knobs: ?post=N opens an older post's floor, ?loggedOut=1 a logged-out viewer.
import { generate } from '../shared/gen';
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
      return { kind: 'played', depth: d, seed: floor.seed ?? 0, floor, run };
    }
    if (d < day()) return { kind: 'closed', depth: d, today: day(), todayUrl: `${location.pathname}?post=${day()}` };
    return { kind: 'play', depth: d, seed: floor.seed ?? 0, floor };
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
    return { kind: 'saved', run: j.run };
  },
  start: async () => net(),
};

/** The local rollover: tomorrow's floor becomes today's. */
export const advanceDay = () => write('day', day() + 1);
/** Make every fake request fail like a dropped connection (tests the retry and "Not saved" states). */
export const setOffline = (on: boolean) => (offline = on);
