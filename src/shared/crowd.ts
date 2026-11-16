// The crowd's day as tomorrow's floor (Phase 8): a tally becomes mods, mods become a floor through a fallback ladder that
// always ends in a floor, and a band keeps the crowd from spiralling difficulty. Server and Lab share it; the sim never
// reads it. Trap souls are derived here from the victim's replay.
import { BAND, CROWD, FAMILIES, KILL_FAMILY, TRAPS, type Curse, type Family } from './content';
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

/** Skill-60 blind bot win rate on a floor over BAND.seeds runs, in percent. */
export const winPct = (floor: Floor) => {
  let won = 0;
  for (let s = 1; s <= BAND.seeds; s++) if (bot(floor, BAND.skillPct, s).state.ended?.kind === 'won') won++;
  return Math.round((won * 100) / BAND.seeds);
};

export type Rolled = { floor: Floor; mods: Mods; step: Step; tried: { step: Step; why: string }[]; win: number; plainWin: number };
type Gen = (depth: number, seed: number, mods: Mods) => Generated;

/**
 * rolloverFloor: tomorrow's floor from today's tally. Each step is accepted when generation needed no fallback, gate 1
 * holds, and the floor is within BAND of that day's plain floor (no spiral). The plain floor always posts.
 * `gen` is generate(); tests pass one that fails to walk the ladder.
 */
export function rolloverFloor(depth: number, seed: number, tally: Tally, gen: Gen = generate): Rolled {
  const plain = gen(depth, seed, NO_MODS);
  const plainWin = winPct(plain.floor);
  const full = modsFrom(tally);
  const tried: { step: Step; why: string }[] = [];
  for (const s of LADDER) {
    const mods = atStep(full, s);
    if (s === 'plain') return { floor: plain.floor, mods, step: s, tried, win: plainWin, plainWin };
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
    return { floor: g.floor, mods, step: s, tried, win, plainWin };
  }
  return { floor: plain.floor, mods: NO_MODS, step: 'plain', tried, win: plainWin, plainWin };
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
