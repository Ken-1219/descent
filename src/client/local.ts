// LOCAL ONLY (dev builds): the /api/* endpoints faked on localStorage with the same shared code the server runs, so the
// harness plays real generated floors. URL knobs: ?post=N opens an older post's floor, ?loggedOut=1 a logged-out viewer,
// ?ghosts=N adds N fixture ghosts (0, 1, 20, 300, 1000) to every floor, like other players' deaths; ?floor=f0 serves
// Floor 0's map as the day's floor (no mercy), so tests can win it with a known route; ?floor=trap makes its spikes a
// player's trap (owner u/trapper); ?curse=frail curses the floor; ?yesterday=1 adds yesterday's line; ?mytrap=2,1 makes
// this profile the owner of a trap that has hurt 2 and killed 1 here.
import { generate } from '../shared/gen';
import { CURSES, FLOOR_0, TRAP_TEXT, type Curse } from '../shared/content';
import type { MyTrap } from '../shared/api';
import type { Trap } from '../shared/gen';
import { carvingOf, fixtureGhosts, ghostView, type GhostRecord, type GhostView, type Vote } from '../shared/ghosts';
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
  const q = new URLSearchParams(location.search);
  const base: Floor = q.get('floor') === 'f0' ? { ...FLOOR_0, depth: d, mercy: false, seed: d }
    : q.get('floor') === 'trap' ? { ...FLOOR_0, depth: d, mercy: false, seed: d, rows: FLOOR_0.rows.map((r) => r.replaceAll('^', 'x')), traps: [2, 3, 4].map((y) => ({ x: 10, y, kind: 'spikes' as const, owner: 't2_trapper', name: 'trapper' })) }
    : generate(d, hash(`descent:local:${d}`)).floor;
  const curse = Object.keys(CURSES).find((c): c is Curse => c === q.get('curse'));
  const f: Floor = {
    ...base,
    ...(curse ? { curses: [curse] } : {}),
    ...(q.get('yesterday') ? { yesterday: { depth: d - 1 || 1, fell: 23, cleared: 9, zone: 2, curse: curse ?? null } } : {}),
  };
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
      return { kind: 'played', depth: d, seed: floor.seed ?? 0, floor, run, ghosts: withVotes(d, ghostsOf(d)), live: d === day(), attempt: 0, choices: choicesOf(d), myTrap: myTrap() };
    }
    if (d < day()) return { kind: 'closed', depth: d, today: day(), todayUrl: `${location.pathname}?post=${day()}` };
    return { kind: 'play', depth: d, seed: floor.seed ?? 0, floor, ghosts: ghostsOf(d), attempt: 0, tutorial: !!read('tutorial'), myTrap: myTrap() };
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
    const f = floorOf(depth);
    const by = j.run.cause === 'trap' ? f.traps?.find((t) => t.x === j.run.tile.x && t.y === j.run.tile.y)?.name : undefined;
    if (j.run.outcome === 'dead') write(`ghost:${depth}`, { name: 'local_delver', x: j.run.tile.x, y: j.run.tile.y, cause: j.run.cause, at: Date.now(), ...(by ? { by } : {}) });
    return { kind: 'saved', run: j.run };
  },
  start: async () => {
    net();
    write('tutorial', true); // the server keeps the tutorial flag per player
  },
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
  vote: async (r) => {
    net();
    if (r.depth < day()) return { kind: 'closed', today: day(), todayUrl: `${location.pathname}?post=${day()}` };
    const run = runOf(r.depth);
    if ('curse' in r) {
      if (!(r.curse in CURSES)) return { kind: 'rejected', reason: 'curse' };
      if (run?.outcome !== 'won') return { kind: 'rejected', reason: 'not a winner' };
      const prior = read<Curse>(`curse:${r.depth}`);
      if (prior && prior !== r.curse) return { kind: 'rejected', reason: 'already voted' };
      write(`curse:${r.depth}`, r.curse);
      return { kind: 'voted', vote: r.curse, standings: [[r.curse, 1]] };
    }
    if (!run) return { kind: 'rejected', reason: 'run not ended' };
    if (r.ghost === ME) return { kind: 'rejected', reason: 'own carving' };
    const votes = read<Record<string, Vote>>(`votes:${r.depth}`) ?? {};
    if (votes[r.ghost] && votes[r.ghost] !== r.vote) return { kind: 'rejected', reason: 'already voted' };
    write(`votes:${r.depth}`, { ...votes, [r.ghost]: r.vote });
    return { kind: 'voted', vote: r.vote, standings: null };
  },
  trap: async ({ depth, zone, kind }) => {
    net();
    if (depth < day()) return { kind: 'closed', today: day(), todayUrl: `${location.pathname}?post=${day()}` };
    if (!Number.isInteger(zone) || zone < 0 || zone > 8 || !(kind in TRAP_TEXT)) return { kind: 'rejected', reason: 'trap' };
    if (runOf(depth)?.outcome !== 'won') return { kind: 'rejected', reason: 'not a winner' };
    const prior = read<Trap>(`trap:${depth}`);
    if (prior && (prior.zone !== zone || prior.kind !== kind)) return { kind: 'rejected', reason: 'already placed' };
    write(`trap:${depth}`, { zone, kind });
    return { kind: 'placed', trap: { zone, kind } };
  },
};

const myTrap = (): MyTrap => {
  const m = params.get('mytrap')?.split(',').map(Number);
  return m ? { kind: 'spikes', x: 10, y: 3, hurt: m[0] ?? 0, killed: m[1] ?? 0 } : null;
};

/** Fixture totals (a few votes each, seeded by position in the list) plus this profile's own votes. */
const withVotes = (d: number, view: GhostView): GhostView => {
  const mine = read<Record<string, Vote>>(`votes:${d}`) ?? {};
  return {
    ...view,
    list: view.list.map((g, i) => {
      const my = mine[g.id];
      return { ...g, votes: { trust: (i % 5) + (my === 'trust' ? 1 : 0), liar: (i % 3) + (my === 'liar' ? 1 : 0) }, ...(my ? { myVote: my } : {}) };
    }),
  };
};
const choicesOf = (d: number) => {
  const curse = read<Curse>(`curse:${d}`);
  const standings: [Curse, number][] | null = curse ? [[curse, 1]] : null;
  return { curse, standings, trap: read<Trap>(`trap:${d}`) };
};

/** The local rollover: tomorrow's floor becomes today's. */
export const advanceDay = () => write('day', day() + 1);
/** Make every fake request fail like a dropped connection (tests the retry and "Not saved" states). */
export const setOffline = (on: boolean) => (offline = on);
