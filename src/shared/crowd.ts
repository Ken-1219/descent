// The crowd's day as tomorrow's floor (Phase 8): a tally becomes mods, mods become a floor through a fallback ladder that
// always ends in a floor, and a band keeps the crowd from spiralling difficulty. Server and Lab share it; the sim never
// reads it. Trap souls are derived here from the victim's replay.
import { BAND, CROWD, FAMILIES, KILL_FAMILY, LADDER_REACH, PLAIN_BAND, TRAPS, type Curse, type Family } from './content';
import { bot } from './bot';
import { generate, NO_MODS, resolveCurse, safePath, type Generated, type Mods, type Trap } from './gen';
import { slitLine } from './grid';
import { isAction, start, step, type Floor } from './sim';

/** What a floor's day left, read at rollover: deaths per compass zone, kills by cause, curse votes, the survivors' traps. */
export type Tally = { deaths: readonly number[]; kills: Readonly<Record<string, number>>; curseVotes: Partial<Record<Curse, number>>; traps: readonly Trap[] };
export const EMPTY_TALLY: Tally = { deaths: NO_MODS.deaths, kills: {}, curseVotes: {}, traps: [] };

/** Yesterday's top killer: kills mapped to families, at least CROWD.minKills, ties in FAMILIES order. */
export function topFamily(kills: Readonly<Record<string, number>>): Family | null {
  const by = new Map<Family, number>();
  for (const [cause, n] of Object.entries(kills)) {
    const f = KILL_FAMILY[cause];
    if (f) by.set(f, (by.get(f) ?? 0) + n);
  }
  let best: Family | null = null;
  for (const f of FAMILIES) if ((by.get(f) ?? 0) >= CROWD.minKills && (by.get(f) ?? 0) > (best ? (by.get(best) ?? 0) : 0)) best = f;
  return best;
}

/** The mods a tally asks for (step 0 of the ladder). Zone weights and trap selection happen in generate() (shares, caps). */
export const modsFrom = (t: Tally): Mods => {
  const curse = resolveCurse(t.curseVotes);
  return { curses: curse ? [curse] : [], deaths: [...t.deaths], topFamily: topFamily(t.kills), traps: [...t.traps] };
};

/** Phase 11h: what the band set aside from a tally (the voted curse, the players' traps), so the intro can say so. */
export function setAside(t: Tally, r: Rolled): { curse: Curse | null; traps: number } {
  const voted = resolveCurse(t.curseVotes);
  const landed = (r.floor.traps ?? []).filter((p) => t.traps.some((x) => x.owner === p.owner)).length; // A122: what landed, not what was asked
  return { curse: voted && !(r.floor.curses ?? []).includes(voted) ? voted : null, traps: Math.max(0, t.traps.length - landed) };
}

/**
 * The ladder (A26, reordered in Phase 11i, A121): every mod; then without what the system derives (zone weights, the
 * top killer); then the players' choices on another base floor; then their traps moved within their zones; then the
 * fewest traps dropped; the plain floor last. The crowd's curse is never weighed against the relative band.
 */
export const LADDER = ['full', 'no crowd', 'reroll', 'moved traps', 'fewer traps', 'plain'] as const;
export type Step = (typeof LADDER)[number];

/** Skill-60 blind bot win rate on a floor over `runs` runs (BAND.seeds by default), in percent. */
export const winPct = (floor: Floor, runs: number = BAND.seeds) => {
  let won = 0;
  for (let s = 1; s <= runs; s++) if (bot(floor, BAND.skillPct, s).state.ended?.kind === 'won') won++;
  return Math.round((won * 100) / runs);
};

/** §8's target win rate at a depth: a straight line from startPct (depth 1) to endPct (endDepth), flat after it. */
export const targetPct = (depth: number) =>
  PLAIN_BAND.startPct - Math.floor(((PLAIN_BAND.startPct - PLAIN_BAND.endPct) * Math.min(depth - 1, PLAIN_BAND.endDepth - 1)) / (PLAIN_BAND.endDepth - 1));

/** The plain floor's win-rate band at a depth (PLAIN_BAND): around the target line, clamped. */
export function plainBand(depth: number): [number, number] {
  const target = targetPct(depth);
  return [Math.max(PLAIN_BAND.floorPct, target - PLAIN_BAND.below), Math.min(PLAIN_BAND.ceilPct, target + PLAIN_BAND.above)];
}

/**
 * fairSeed: reroll the seed (seed, seed + 1, …) until the plain floor sits inside plainBand(depth), at most
 * PLAIN_BAND.maxTries; past that the closest one is used. Runs at rollover, not inside generate(), so generate()'s budget
 * is untouched. Crowd mods are then applied to this seed, and the relative band (BAND) still holds on top. With the
 * crowd's curse (A121) the band is held by choosing a base floor that is fair with the curse on it.
 */
export function fairSeed(depth: number, seed: number, gen: Gen = generate, curses: readonly Curse[] = []): { seed: number; plain: Generated; win: number; tries: number } {
  const [lo, hi] = plainBand(depth);
  let best: { seed: number; plain: Generated; win: number; tries: number; off: number } | null = null;
  for (let k = 0; k < PLAIN_BAND.maxTries; k++) {
    const plain = gen(depth, seed + k, curses.length ? { ...NO_MODS, curses } : NO_MODS); // A121: the crowd's curse is part of the base floor
    const win = winPct(plain.floor, PLAIN_BAND.runs);
    const off = win < lo ? lo - win : win > hi ? win - hi : 0;
    if (!best || off < best.off) best = { seed: seed + k, plain, win, tries: k + 1, off };
    if (off === 0) break;
  }
  if (!best) throw new Error('PLAIN_BAND.maxTries must be at least 1');
  return { seed: best.seed, plain: best.plain, win: best.win, tries: best.tries };
}

export type Rolled = { floor: Floor; mods: Mods; step: Step; tried: { step: Step; why: string }[]; win: number; plainWin: number; seed: number; rerolls: number; plainBandWin: number };
type Gen = (depth: number, seed: number, mods: Mods) => Generated;

/**
 * rolloverFloor: tomorrow's floor from today's tally, down the LADDER. A step is accepted when generation needed no
 * fallback, a safe path exists, and its win rate is within BAND of the same base floor with only the crowd's curse on it.
 * The plain floor always posts. `gen` is generate(); tests pass one that fails to walk the ladder.
 */
export function rolloverFloor(depth: number, seed0: number, tally: Tally, gen: Gen = generate): Rolled {
  const full = modsFrom(tally);
  const players: Mods = { ...NO_MODS, curses: full.curses, traps: full.traps };
  const tried: { step: Step; why: string }[] = [];
  let fair = fairSeed(depth, seed0, gen, full.curses);
  let ref = winPct(fair.plain.floor);
  let budget = LADDER_REACH.maxFloors;
  // One floor tried: null when it can't be used at all, else its win rate and whether it sits within BAND of `against`.
  const score = (step: Step, seed: number, mods: Mods, against: number) => {
    budget--;
    const g = gen(depth, seed, mods);
    const why = g.fallback ? `generator fallback ${g.fallback}` : !safePath(g.floor) ? 'no safe path' : '';
    if (why) return (tried.push({ step, why }), null);
    const win = winPct(g.floor);
    const fits = win >= against - BAND.maxDropPct;
    if (!fits) tried.push({ step, why: `win ${win}% < plain ${against}% - ${BAND.maxDropPct}` });
    return { floor: g.floor, win, fits };
  };
  const done = (step: Step, mods: Mods, r: { floor: Floor; win: number }): Rolled =>
    ({ floor: r.floor, mods, step, tried, win: r.win, seed: fair.seed, rerolls: fair.tries - 1, plainBandWin: fair.win, plainWin: ref });
  for (const [step, mods] of [['full', full], ['no crowd', players]] as const) {
    const r = score(step, fair.seed, mods, ref);
    if (r?.fits) return done(step, mods, r);
  }
  if (players.traps.length) {
    for (let k = 0, next = fair.seed + 1; k < LADDER_REACH.rerolls && budget > 0; k++) {
      const alt = fairSeed(depth, next, gen, full.curses);
      const altRef = winPct(alt.plain.floor);
      next = alt.seed + 1;
      const r = score('reroll', alt.seed, players, altRef);
      if (r?.fits) {
        [fair, ref] = [alt, altRef];
        return done('reroll', players, r);
      }
    }
    for (let slot = 1; slot <= LADDER_REACH.trapMoves && budget > 0; slot++) {
      const mods = { ...players, traps: players.traps.map((t) => ({ ...t, slot })) };
      const r = score('moved traps', fair.seed, mods, ref);
      if (r?.fits) return done('moved traps', mods, r);
    }
    // The fewest traps go: drop the one whose absence helps most, again and again, until the floor fits.
    let keep = [...players.traps];
    while (keep.length > 1 && budget > 0) {
      let next = keep.slice(1);
      let bestWin = -1;
      for (let i = 0; i < keep.length && budget > 0; i++) {
        const traps = keep.filter((_, j) => j !== i);
        const r = score('fewer traps', fair.seed, { ...players, traps }, ref);
        if (r?.fits) return done('fewer traps', { ...players, traps }, r);
        if (r && r.win > bestWin) [next, bestWin] = [traps, r.win];
      }
      keep = next;
    }
    // No traps left: the base floor with only the crowd's curse is the reference itself, so it fits.
    if (!fair.plain.fallback && safePath(fair.plain.floor)) return done('fewer traps', { ...NO_MODS, curses: full.curses }, { floor: fair.plain.floor, win: ref });
  }
  const plain = gen(depth, fair.seed, NO_MODS);
  return done('plain', NO_MODS, { floor: plain.floor, win: winPct(plain.floor) });
}

/**
 * Which players' traps hurt a run, from its replay alone: a trap-cause hit on a placed trap's tile (spikes, false stairs)
 * or in a placed slit's line (darts). The killing hit counts as a kill instead of a hurt. Your own trap never counts.
 */
export function trapHits(floor: Floor, log: string, victim: string): { owner: string; name: string | null; hurt: number; killed: number }[] {
  const traps = floor.traps ?? [];
  if (!traps.length) return [];
  const out = new Map<string, { owner: string; name: string | null; hurt: number; killed: number }>();
  let s = start(floor);
  for (const a of log) {
    if (!isAction(a)) continue; // judge() has already validated every character
    const r = step(s, a);
    for (const e of r.events) {
      if (e.t !== 'hurt' || e.cause !== 'trap') continue;
      const trap = traps.find((t) => (t.kind === 'dart' ? slitLine(s.tiles, t, TRAPS.dart.range).some((p) => p.x === e.at.x && p.y === e.at.y) : t.x === e.at.x && t.y === e.at.y));
      if (!trap || trap.owner === victim) continue;
      const o = out.get(trap.owner) ?? { owner: trap.owner, name: trap.name, hurt: 0, killed: 0 };
      if (r.state.ended?.kind === 'dead' && r.state.ended.cause === 'trap') o.killed++;
      else o.hurt++;
      out.set(trap.owner, o);
    }
    s = r.state;
  }
  return [...out.values()].sort((a, b) => (a.owner < b.owner ? -1 : 1));
}
/** Souls for a trap's owner (A15): +1 per hurt, +3 per kill. */
export const trapSouls = (h: { hurt: number; killed: number }) => h.hurt + 3 * h.killed;
