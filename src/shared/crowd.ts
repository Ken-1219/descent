// The crowd's day as tomorrow's floor (Phase 8): a tally becomes mods, mods become a floor through a fallback ladder that
// always ends in a floor, and a band keeps the crowd from spiralling difficulty. Server and Lab share it; the sim never
// reads it. Trap souls are derived here from the victim's replay.
import { BAND, CROWD, FAMILIES, KILL_FAMILY, PLAIN_BAND, TRAPS, type Curse, type Family } from './content';
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

/** The ladder (A26): full mods, then no traps, then no crowd modifiers (the curse stays), then the plain floor. */
export const LADDER = ['full', 'no traps', 'no crowd', 'plain'] as const;
export type Step = (typeof LADDER)[number];
const atStep = (m: Mods, s: Step): Mods =>
  s === 'full' ? m : s === 'no traps' ? { ...m, traps: [] } : s === 'no crowd' ? { ...NO_MODS, curses: m.curses } : NO_MODS;

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
 * is untouched. Crowd mods are then applied to this seed, and the relative band (BAND) still holds on top.
 */
export function fairSeed(depth: number, seed: number, gen: Gen = generate): { seed: number; plain: Generated; win: number; tries: number } {
  const [lo, hi] = plainBand(depth);
  let best: { seed: number; plain: Generated; win: number; tries: number; off: number } | null = null;
  for (let k = 0; k < PLAIN_BAND.maxTries; k++) {
    const plain = gen(depth, seed + k, NO_MODS);
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
 * rolloverFloor: tomorrow's floor from today's tally. Each step is accepted when generation needed no fallback, gate 1
 * holds, and the floor is within BAND of that day's plain floor (no spiral). The plain floor always posts.
 * `gen` is generate(); tests pass one that fails to walk the ladder.
 */
export function rolloverFloor(depth: number, seed0: number, tally: Tally, gen: Gen = generate): Rolled {
  const fair = fairSeed(depth, seed0, gen);
  const seed = fair.seed;
  const plain = fair.plain;
  const plainWin = winPct(plain.floor);
  const meta = { seed, rerolls: fair.tries - 1, plainBandWin: fair.win };
  const full = modsFrom(tally);
  const tried: { step: Step; why: string }[] = [];
  for (const s of LADDER) {
    const mods = atStep(full, s);
    if (s === 'plain') return { floor: plain.floor, mods, step: s, tried, win: plainWin, plainWin, ...meta };
    const g = gen(depth, seed, mods);
    if (g.fallback) {
      tried.push({ step: s, why: `generator fallback ${g.fallback}` });
      continue;
    }
    if (!safePath(g.floor)) {
      tried.push({ step: s, why: 'no safe path' });
      continue;
    }
    const win = winPct(g.floor);
    if (win < plainWin - BAND.maxDropPct) {
      tried.push({ step: s, why: `win ${win}% < plain ${plainWin}% - ${BAND.maxDropPct}` });
      continue;
    }
    return { floor: g.floor, mods, step: s, tried, win, plainWin, ...meta };
  }
  return { floor: plain.floor, mods: NO_MODS, step: 'plain', tried, win: plainWin, plainWin, ...meta };
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
