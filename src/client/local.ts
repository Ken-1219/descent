// LOCAL ONLY (dev builds): the /api/* endpoints faked on localStorage with the same shared code the server runs, so the
// harness plays real generated floors. URL knobs: ?post=N opens an older post's floor, ?loggedOut=1 a logged-out viewer,
// ?ghosts=N adds N fixture ghosts (0, 1, 20, 300, 1000) to every floor, like other players' deaths; ?floor=f0 serves
// Floor 0's map as the day's floor (no mercy), so tests can win it with a known route; ?floor=trap makes its spikes a
// player's trap (owner u/trapper); ?curse=frail curses the floor; ?yesterday=1 adds yesterday's line; ?mytrap=2,1 makes
// this profile the owner of a trap that has hurt 2 and killed 1 here; ?yesterday=few gives a day of 2 deaths;
// ?board=N fills the board with N players (this profile ranked by its own run); ?floor=warden serves a small Warden arena;
// ?boss=alive|carried|killed sets its shared pool (killed serves the floor without it, as the server does).
import { generate } from '../shared/gen';
import { CURSES, FLOOR_0, TRAP_TEXT, type Curse } from '../shared/content';
import type { BoardRows, BossView, MyTrap } from '../shared/api';
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
    : q.get('floor') === 'warden' ? { depth: d, mercy: false, seed: d, torch: 90, rows: ARENA }
    : q.get('floor') === 'trap' ? { ...FLOOR_0, depth: d, mercy: false, seed: d, rows: FLOOR_0.rows.map((r) => r.replaceAll('^', 'x')), traps: [2, 3, 4].map((y) => ({ x: 10, y, kind: 'spikes' as const, owner: 't2_trapper', name: 'trapper' })) }
    : generate(d, hash(`descent:local:${d}`)).floor;
  const curse = Object.keys(CURSES).find((c): c is Curse => c === q.get('curse'));
  const f: Floor = {
    ...base,
    ...(curse ? { curses: [curse] } : {}),
    ...(q.get('yesterday') === 'few' ? { yesterday: { depth: d - 1 || 1, fell: 2, cleared: 5, zone: 4, curse: curse ?? null, deaths: [0, 0, 0, 0, 2, 0, 0, 0, 0], killer: 'spikes' } }
      : q.get('yesterday') ? { yesterday: { depth: d - 1 || 1, fell: 23, cleared: 9, zone: 2, curse: curse ?? null, deaths: [1, 2, 14, 0, 3, 0, 1, 2, 0], killer: 'goblin' } } : {}),
    showcase: ['goblins'],
  };
  write(`floor:${d}`, f);
  return f;
};
const ARENA = ['###########', '#@........#', '#.........#', '#....WW...#', '#....WW...#', '#.........#', '#........>#', '###########'];
/** The Warden's pool for ?boss=: what the server's bossView returns, with this profile's own links taken off. */
const bossOf = (d: number): BossView | undefined => {
  const k = new URLSearchParams(location.search).get('boss');
  if (!k) return undefined;
  const you = runOf(d)?.dealt ?? 0;
  const pool = k === 'carried' ? 40 : 120;
  const hp = k === 'killed' ? 0 : Math.max(0, (k === 'carried' ? 40 : 84) - you);
  return { hp, pool, carried: k === 'carried', killer: k === 'killed' ? 'Warden_Slayer_2026' : null, you };
};
const served = (d: number): Floor => {
  const f = floorOf(d);
  return bossOf(d)?.killer ? { ...f, rows: f.rows.map((r) => r.replace(/W/g, '.')) } : f;
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
    const floor = served(d);
    const boss = bossOf(d);
    const mine = runOf(d);
    if (mine) {
      const { log: _, ...run } = mine;
      return { kind: 'played', depth: d, seed: floor.seed ?? 0, floor, run, ghosts: withVotes(d, ghostsOf(d)), live: d === day(), attempt: 0, choices: choicesOf(d), myTrap: myTrap(), streak: read<number>('streak') ?? 1, nextAt: Date.now() + 5 * 3_600_000 + 12 * 60_000, flair: read<boolean>('flair') ?? false, ...(d === day() ? {} : { today: day(), todayUrl: `${location.pathname}?post=${day()}` }), ...(boss ? { boss } : {}) };
    }
    if (d < day()) return { kind: 'closed', depth: d, today: day(), todayUrl: `${location.pathname}?post=${day()}` };
    return { kind: 'play', depth: d, seed: floor.seed ?? 0, floor, ghosts: ghostsOf(d), attempt: 0, tutorial: !!read('tutorial'), myTrap: myTrap(), ...(boss ? { boss } : {}) };
  },
  run: async ({ depth, log }) => {
    net();
    if (depth < day()) return { kind: 'closed', today: day(), todayUrl: `${location.pathname}?post=${day()}` };
    const prior = runOf(depth);
    if (prior) {
      const { log: l, ...run } = prior;
      return l === log ? { kind: 'saved', run } : { kind: 'rejected', reason: 'already played' };
    }
    const j = judge(served(depth), log);
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
  card: async (ghost) => ({ avatar: null, record: ghost.startsWith('bot:') || ghost.startsWith('floor0:') ? null : { deaths: 7, trust: 12, liar: 3 } }),
  pulse: async (depth) => {
    net();
    const boss = bossOf(depth);
    return { fell: ghostsOf(depth).fell, carved: 0, ...(boss ? { boss } : {}) };
  },
  chronicle: async () => ({ rows: Array.from({ length: day() - 1 }, (_, i) => ({ depth: day() - 1 - i, fell: 10 + i, cleared: 3, curse: i % 2 ? 'frail' : null, zone: i % 9, killer: 'goblin' })) }),
  board: async (depth) => {
    net();
    // A fixture crowd of N players, plus this profile's own run (if any) ranked among them; same tie rule as the server.
    const n = Number(params.get('board') ?? 0);
    const mine = runOf(depth);
    const all = Array.from({ length: n }, (_, i) => ({ name: i === 1 ? 'Twenty_Char_Name_123' : `delver_${i}`, value: 1500 - i, you: false }));
    if (mine) all.push({ name: 'local_delver', value: mine.score, you: true });
    all.sort((a, b) => b.value - a.value || (a.name < b.name ? 1 : -1));
    const rows = (list: typeof all): BoardRows => {
      const ranked = list.map((r, i) => ({ rank: i + 1, name: r.name, value: r.value, ...(r.you ? { you: true as const } : {}) }));
      return { rows: ranked.slice(0, 10), me: ranked.find((r) => r.you) ?? null, total: ranked.length };
    };
    const life = rows(all.map((r) => ({ ...r, value: Math.max(1, Math.floor(r.value / 100)) })));
    return { depth, today: rows(all), deepest: life, souls: life, honour: life, trapsetter: { rank: 1, name: 'delver_3', value: 9 }, liar: { rank: 1, name: 'delver_7', value: 5 } };
  },
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
  // Phase 10b: beacons are kept for the e2e checks; flair and "Delete my data" act on this profile.
  beacon: async (b) => write('beacons', [...(read<unknown[]>('beacons') ?? []), b]),
  flair: async (on) => (write('flair', on), { on }),
  forget: async () => {
    for (let d = 1; d <= day(); d++) for (const k of ['run', 'ghost', 'carving', 'votes', 'curse', 'trap']) localStorage.removeItem(`${K}${k}:${d}`);
    return { floors: day() };
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
