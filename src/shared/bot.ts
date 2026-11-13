// The difficulty bot (§8). It plays like a player who knows the rules and reads only what the screen shows:
// tiles it has seen, tells(), and hidden hazards it learned from their tells. No hidden-map access.
import { BOT_MAX_ACTIONS, IMPS, SPIKES } from './content';
import { DIRS, blocks, dist, width, type Pos } from './grid';
import { mulberry32 } from './rng';
import { lightRadius, spikeStage, start, step, tells, tierOf, visibility, type Action, type Floor, type State } from './sim';

/** Hazards a careful player never steps on once seen. */
const AVOID = 'uxO,;oF_';
const MARKED = new Set(['windup', 'armed', 'cracking']);
/** Unknown tiles cost more than known ones when planning, so it prefers routes it has seen. */
const UNKNOWN_COST = 2;
/** Tiles where its light shrank to one (a dark room) cost this much more: it crosses darkness, it doesn't explore it. */
const DARK_COST = 3;
/** Timed spikes cost extra, so it goes around them when it can and times its crossing when it can't. */
const SPIKE_COST = 4;
/** A bone pile in the way: plan through it (it will get up) but never bump it, which would only reset its countdown. */
const PILE_COST = 6;
/** Dithering: standing on the same tile this often in the last RECENT turns makes it bold for BOLD_TURNS (it takes the hit). */
const RECENT = 12;
/** A seen pit is a way out at a price: a heart, and the fall lands nearer the stairs (rule 7). Only with hearts to spare. */
const PIT_COST = 12;
const DITHER = 4;
const BOLD_TURNS = 6;

const toward = (from: Pos, to: Pos): Action => DIRS.find((d) => from.x + d.dx === to.x && from.y + d.dy === to.y)?.a ?? 'W';

/** Plays `floor`. With probability skillPct/100 each turn it takes its best known step; otherwise it steps greedily toward its target. */
export function bot(floor: Floor, skillPct: number, seed: number): { state: State; log: Action[] } {
  const roll = mulberry32(seed);
  let s = start(floor);
  const w = width(s.tiles);
  const entrance = s.pos;
  const fixed = SPIKES[tierOf(s, 'spikes')].period === 0;
  // Divers keep their distance and pin you down, and die for good: a player charges them.
  // Archers rebuild, so chasing one is futile: it is dodged and walked past instead.
  const ranged = (k: string) => k === 'imp' && IMPS[tierOf(s, 'imps')].dive > 0;
  const learned = new Set<number>(); // tiles whose hidden-hazard tell was seen (membership only)
  const darkness = new Set<number>(); // tiles where it stood and its light shrank to one while the torch burned
  const log: Action[] = [];
  let aim = -1; // the unknown tile it is exploring toward, kept until revealed so it doesn't dither between two
  let luring: Pos | null = null; // a bone pile it is waiting out, until it gets up
  const recent: number[] = [];
  let bold = 0;

  for (let n = 0; n < BOT_MAX_ACTIONS && !s.ended; n++) {
    if (s.torch > 0 && lightRadius(s) === 1) darkness.add(s.pos.y * w + s.pos.x);
    recent.push(s.pos.y * w + s.pos.x);
    if (recent.length > RECENT) recent.shift();
    if (bold > 0) bold--;
    else if (recent.filter((i) => i === recent[recent.length - 1]).length >= DITHER) bold = BOLD_TURNS;
    const vis = visibility(s);
    const tl = tells(s);
    for (const t of tl) if (t.kind === 'crack' || t.kind === 'mortar' || t.kind === 'missing-step') learned.add(t.y * w + t.x);
    const marked = new Set(tl.filter((t) => MARKED.has(t.kind)).map((t) => t.y * w + t.x));
    // What the player sees at each tile, computed once a turn: '?' if never seen; an unlearned hidden hazard looks like
    // what it imitates. Off the map reads as wall.
    const seenAs = s.tiles.flatMap((row, y) =>
      [...row].map((c, x) => {
        const i = y * w + x;
        if (!vis[i]) return '?';
        return (c === 'u' || c === 'o' || c === 'F') && !learned.has(i) ? (c === 'F' ? '>' : '.') : c;
      }),
    );
    const onMap = (p: Pos) => p.x >= 0 && p.y >= 0 && p.x < w && p.y < s.tiles.length;
    const look = (p: Pos): string => (onMap(p) ? (seenAs[p.y * w + p.x] ?? '#') : '#');
    const occupant: (State['enemies'][number] | undefined)[] = [];
    for (const e of s.enemies) occupant[e.y * w + e.x] = e;
    const enemyAt = (p: Pos) => (onMap(p) ? occupant[p.y * w + p.x] : undefined);
    const hurtsNext = (p: Pos) => {
      const c = look(p);
      if ((marked.has(p.y * w + p.x) && !bold) || AVOID.includes(c)) return true;
      return c === '^' && (fixed || spikeStage(s, p.x, p.y, s.turn + 1) === 2);
    };
    const open = (p: Pos) => {
      const c = look(p);
      return c === '?' || !blocks(c);
    };
    const around = DIRS.map((d) => ({ x: s.pos.x + d.dx, y: s.pos.y + d.dy }));
    const safeStep = around.find((p) => open(p) && !enemyAt(p) && !hurtsNext(p));

    // Plan: Dijkstra over what it knows, to the known stairs, else to the unknown tile that pulls it away from the entrance.
    // -1 = not reached. Arrays, not Maps: this runs every turn of every bot game.
    const cost: number[] = new Array<number>(w * s.tiles.length).fill(-1);
    const parent: number[] = new Array<number>(w * s.tiles.length).fill(-1);
    const me = s.pos.y * w + s.pos.x;
    cost[me] = 0;
    const buckets: number[][] = [[me]];
    let stairs = -1;
    let explore = -1, exploreScore = 0;
    for (let c = 0; c < buckets.length; c++) {
      for (const i of buckets[c] ?? []) {
        if (cost[i] !== c) continue;
        const p = { x: i % w, y: Math.floor(i / w) };
        const here = look(p);
        if (here === '>' && stairs < 0) stairs = i;
        if (here === '?') {
          const score = 2 * c - dist(p, entrance);
          if (explore < 0 || score < exploreScore) [explore, exploreScore] = [i, score];
          continue; // plan into the unknown, not through it
        }
        for (const d of DIRS) {
          const q = { x: p.x + d.dx, y: p.y + d.dy };
          const qc = look(q);
          const pit = (qc === 'O' || qc === 'o') && s.hearts >= 2;
          if ((qc !== '?' && blocks(qc)) || (AVOID.includes(qc) && !pit)) continue;
          const foe = enemyAt(q);
          if ((qc === '^' && fixed) || (foe && foe.mode !== 'pile')) continue;
          const j = q.y * w + q.x;
          const nc = c + (qc === '?' ? UNKNOWN_COST : qc === '^' ? SPIKE_COST : pit ? PIT_COST : 1) + (darkness.has(j) ? DARK_COST : 0) + (foe ? PILE_COST : 0);
          const old = cost[j] ?? -1;
          if (old >= 0 && old <= nc) continue;
          cost[j] = nc;
          parent[j] = i;
          (buckets[nc] ??= []).push(j);
        }
      }
      if (stairs >= 0) break;
    }
    let hunt = -1;
    for (const e of s.enemies) {
      if (e.mode === 'idle' || e.mode === 'pile' || !ranged(e.kind) || vis[e.y * w + e.x] !== 2) continue;
      for (const d of DIRS) {
        const j = (e.y + d.dy) * w + (e.x + d.dx);
        if ((cost[j] ?? -1) >= 0 && (hunt < 0 || (cost[j] ?? 0) < (cost[hunt] ?? 0))) hunt = j;
      }
    }
    if (aim >= 0 && (cost[aim] ?? -1) >= 0 && !vis[aim]) explore = aim; // keep heading for the same unknown tile
    aim = stairs < 0 ? explore : -1;
    const target = hunt >= 0 && hunt !== me ? hunt : stairs >= 0 ? stairs : explore;
    const charging = hunt >= 0 && target === hunt && s.hearts >= 2;
    const path: Pos[] = [];
    for (let k = target; k >= 0 && k !== me; k = parent[k] ?? -1) path.unshift({ x: k % w, y: Math.floor(k / w) });
    const firstPos = path[0] && parent[path[0].y * w + path[0].x] === me ? path[0] : null;
    if (luring && enemyAt(luring)?.mode !== 'pile') luring = null;
    const pileAhead: Pos | undefined = luring ?? path.slice(0, 2).find((p) => enemyAt(p)?.mode === 'pile');
    const goal = target >= 0 ? { x: target % w, y: Math.floor(target / w) } : null;

    let a: Action = 'W';
    if (roll() % 100 >= skillPct) {
      // Careless: the step that most closes on the goal, blind to hazards and tells (§8).
      const best = goal ? around.filter(open).sort((p, q) => dist(p, goal) - dist(q, goal) || around.indexOf(p) - around.indexOf(q))[0] : undefined;
      a = best ? toward(s.pos, best) : 'W';
    } else {
      const aimers = s.enemies.filter((e) => e.mode === 'windup' && e.aim.some((t) => t.x === s.pos.x && t.y === s.pos.y));
      const adjacent = s.enemies.filter((e) => e.mode !== 'pile' && dist(e, s.pos) === 1);
      const nearby = s.enemies.filter((e) => e.mode !== 'pile' && Math.abs(e.x - s.pos.x) <= 1 && Math.abs(e.y - s.pos.y) <= 1);
      const lone = aimers.length === 1 && aimers[0] && dist(aimers[0], s.pos) === 1 ? aimers[0] : undefined;
      if (s.item === 'potion' && s.hearts <= 1) a = 'I';
      else if (s.item === 'oil' && s.torch * 100 <= 25 * s.floor.torch) a = 'I';
      else if (s.item === 'bomb' && nearby.length >= 2) a = 'I';
      else if (lone) a = toward(s.pos, lone); // striking the only attacker cancels its blow
      else if (bold && roll() % 2 === 0 && around.some((p) => open(p) && !enemyAt(p) && !AVOID.includes(look(p)))) {
        const moves = around.filter((p) => open(p) && !enemyAt(p) && !AVOID.includes(look(p)));
        a = toward(s.pos, moves[roll() % moves.length] ?? s.pos); // dithering: a random step breaks the loop
      } else if (bold && adjacent[0]) a = toward(s.pos, adjacent[0]);
      else if (darkness.has(me) && around.some((p) => look(p) === 'Y')) a = toward(s.pos, around.find((p) => look(p) === 'Y') ?? s.pos); // light the brazier
      else if (hurtsNext(s.pos) && safeStep && !charging) a = toward(s.pos, safeStep);
      else if (adjacent[0] && !hurtsNext(s.pos)) a = toward(s.pos, adjacent[0]);
      else if (pileAhead && (firstPos || luring)) {
        luring = pileAhead;
        // A bone pile blocks the way. Never bump it (that resets it). Wait out of its row and column, 3+ tiles off,
        // so when it gets up it must come out into the open to reach or line up with you.
        // Prefer a spot out of its row and column; failing that, any spot 3+ tiles back.
        let lure = -1, lureRank = 0;
        for (let k = 0; k < cost.length; k++) {
          const c = cost[k] ?? -1;
          if (c < 0) continue;
          const p = { x: k % w, y: Math.floor(k / w) };
          if (look(p) === '?' || enemyAt(p) || dist(p, pileAhead) < 3) continue;
          const rank = (p.x === pileAhead.x || p.y === pileAhead.y ? 1000 : 0) + c;
          if (lure < 0 || rank < lureRank) [lure, lureRank] = [k, rank];
        }
        let step = lure;
        while (step >= 0 && parent[step] !== me) step = parent[step] ?? -1;
        const next = step >= 0 ? { x: step % w, y: Math.floor(step / w) } : null;
        a = next && !hurtsNext(next) && !enemyAt(next) ? toward(s.pos, next) : 'W';
      }
      // Charging a ranged foe it accepts one marked step; otherwise it waits out danger or sidesteps it.
      else if (firstPos) {
        const jump = 'Oo'.includes(look(firstPos)) && s.hearts >= 2 && !marked.has(firstPos.y * w + firstPos.x); // the planned way out
        a = !hurtsNext(firstPos) || jump || (charging && !AVOID.includes(look(firstPos))) ? toward(s.pos, firstPos) : !hurtsNext(s.pos) ? 'W' : safeStep ? toward(s.pos, safeStep) : 'W';
      }
      else if (adjacent[0]) a = toward(s.pos, adjacent[0]);
    }
    log.push(a);
    s = step(s, a).state;
  }
  return { state: s, log };
}
