// Golden runs (Phase 11 guard): stored floors with their action logs, replayed to a digest of everything the rules
// produce. Polish may change how the game looks, never what it computes: tests/golden.test.ts fails on any difference.
// Record again (only for a deliberate rule change, which Phase 11 forbids): `bun tests/golden.ts > tests/golden.json`.
import { FLOOR_0 } from '../src/shared/content';
import { generate } from '../src/shared/gen';
import { hash } from '../src/shared/rng';
import { judge, start, step, type Action, type Floor } from '../src/shared/sim';

const T = { spikes: 1, goblins: 1, imps: 1, mechanisms: 1, skeletons: 1, pits: 1, dark: 1 } as const;
const MAIN = { owner: 't2_1vv4d0syr0', name: 'Clean_Position8332' };
const F6: Floor = { depth: 6, torch: 36, mercy: false, seed: 179023484, tiers: T, curses: ['overrun'], rows: ['###############', '###############', '##T############', '#^^gi#######T##', '#g...###.....##', '#.......OO.>O##', '###.####...pO##', '###.#T####..###', '##....###.x..##', '##....###.^^.##', '##..@........##', '##....#########', '###############', '###############', '###############'], dark: [{ x: 1, y: 3, w: 4, h: 3 }, { x: 8, y: 4, w: 5, h: 3 }, { x: 9, y: 8, w: 4, h: 3 }], traps: [{ x: 10, y: 8, kind: 'spikes', ...MAIN }] };
const F7: Floor = { depth: 7, torch: 44, mercy: false, seed: 195801101, tiers: T, rows: ['####T####T#####', '##.....#.....##', '##.....#.....##', '##........@..##', '##.....#.....##', '##.....#.....##', '##...x.###.####', '####.T####.####', '##.....###.####', '##.WW..##TH####', '##.WW......_.##', '##p....#.....##', '##>....#.....##', '###############', '###############'], dark: [{ x: 2, y: 1, w: 5, h: 6 }, { x: 8, y: 10, w: 5, h: 3 }], traps: [{ x: 5, y: 6, kind: 'spikes', ...MAIN }] };
const F7_FALLEN: Floor = { ...F7, rows: F7.rows.map((r) => r.replaceAll('W', '.')) };
const F8: Floor = { depth: 8, torch: 48, mercy: false, seed: 145468244, tiers: { ...T, spikes: 2, goblins: 2 }, dark: [], rows: ['####T############', '##^^^############', '##p.>######T#####', '##...#####....###', '###.######....###', '###.######^..^###', '###.######^..^###', '###.######^..^###', '##T.########.####', '#..g..#####T.####', '#.gg..####....###', '#.g.........@.###', '#.....####....###', '#.....###########', '#################', '#################', '#################'] };
const F9: Floor = { depth: 9, torch: 38, mercy: false, seed: 162245863, tiers: { ...T, spikes: 2, goblins: 2, imps: 2 }, dark: [], curses: ['overrun'], rows: ['##############T##', '#######T#OO...i##', '####...K#.OOO.O##', '####ii....O.OOO##', '####p..K#iOOOOO##', '#####.###>OOOOO##', '#####.###########', '#####.###########', '#####.###########', '###T#.####ZT#####', '###.....##...####', '###.....##..i####', '###..@.......####', '###.....##..i####', '###.....##...####', '#################', '#################'], traps: [{ x: 10, y: 9, kind: 'dart', ...MAIN }] };

/** A log cut at the turn its run ends (a death log is "act until it ends"). */
const until = (floor: Floor, moves: string) => {
  let st = start(floor);
  let log = '';
  for (const a of moves) {
    if (st.ended) break;
    st = step(st, a as Action).state;
    log += a;
  }
  return log;
};
const wait = (floor: Floor) => until(floor, 'W'.repeat(400));
export const CASES: { name: string; floor: Floor; log: string }[] = [
  { name: 'floor 0: the tutorial win', floor: FLOOR_0, log: 'DRRURRRRDDDDLLLLLL' },
  { name: 'floor 6 (cursed, a player trap): the win', floor: F6, log: 'RRRRRRRRUULUUU' },
  { name: 'floor 6: waiting out the torch in the dark', floor: F6, log: wait(F6) },
  { name: 'floor 7 (Warden): ten links and out', floor: F7, log: 'LLLLDLLLDDRDDDDDDDDRDDLDLUUULLD' },
  { name: 'floor 7: through the player trap, past a slam', floor: F7, log: 'LLLLDDLDWLDDLLDDDD' },
  { name: 'floor 7: killed by the Warden', floor: F7, log: until(F7, 'LLLLLDDDLDDLDDDD') },
  { name: 'floor 7 fallen: the empty arena', floor: F7_FALLEN, log: 'LLLLDDLLDDDDDDDLL' },
  { name: 'floor 8 (goblins T2, spikes T2): the win', floor: F8, log: 'LLLLLLLUUULLUUUUUUUR' },
  { name: 'floor 8: torch out', floor: F8, log: wait(F8) },
  { name: 'floor 9 (cursed, a dart trap): waiting it out', floor: F9, log: wait(F9) },
];
export const GEN_DEPTHS = [1, 5, 7, 14, 21, 28];

/** Everything the rules produce for a log: the judged result, the final state, and every event in order. */
export function digest(floor: Floor, log: string) {
  const j = judge(floor, log);
  let s = start(floor);
  const events: string[] = [];
  for (const a of log) {
    if (s.ended) break;
    const r = step(s, a as Action);
    events.push(JSON.stringify(r.events));
    s = r.state;
  }
  const state = { turn: s.turn, pos: s.pos, hearts: s.hearts, torch: s.torch, dealt: s.dealt, ended: s.ended ?? null, tiles: hash(s.tiles.join('/')), enemies: hash(JSON.stringify(s.enemies)) };
  return { result: j.ok ? j.run : { rejected: j.reason }, state, events: hash(events.join('|')) };
}
export const genDigest = (d: number) => hash(JSON.stringify(generate(d, hash(`golden:${d}`)).floor));

if (import.meta.main) {
  console.log(JSON.stringify({ runs: CASES.map((c) => ({ name: c.name, log: c.log, ...digest(c.floor, c.log) })), generated: Object.fromEntries(GEN_DEPTHS.map((d) => [d, genDigest(d)])) }, null, 1));
}
