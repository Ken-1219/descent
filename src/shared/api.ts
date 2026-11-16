// Wire types for /api/*, imported by client and server so a mismatch is a compile error (§15.2).
import type { Curse } from './content';
import type { Trap } from './gen';
import type { GhostView, Vote } from './ghosts';
import type { Floor, RunResult } from './sim';

export type { GhostView, RunResult, Trap, Vote };
/** Curse standings, most votes first: sent only to a player who has voted. */
export type Standings = [Curse, number][];
/** A winner's choices on the played plate: their curse vote (and the standings once they voted), their own trap. */
export type Choices = { curse: Curse | null; standings: Standings | null; trap: Trap | null };
/** Your trap on this floor (set yesterday) and what it has done here so far. */
export type MyTrap = { kind: Trap['kind']; x: number; y: number; hurt: number; killed: number } | null;

/** GET /api/floor. The depth is the post's own (postData), so an old post shows its floor as closed. */
export type FloorResponse =
  /** `attempt`: how often the mod reset tool cleared this player's run here (keys the client's saved log). */
  | { kind: 'play'; depth: number; seed: number; floor: Floor; ghosts: GhostView; attempt: number; tutorial: boolean; myTrap: MyTrap; boss?: BossView }
  | { kind: 'played'; depth: number; seed: number; floor: Floor; run: RunResult; ghosts: GhostView; live: boolean; attempt: number; choices: Choices; myTrap: MyTrap; streak: number; nextAt: number; boss?: BossView }
  /** A "Post Floor 0" post: the tutorial, never stored or submitted. */
  | { kind: 'practice' }
  | { kind: 'closed'; depth: number; today: number; todayUrl: string | null }
  | { kind: 'login'; depth: number }
  | { kind: 'none' };

/** POST /api/run: the depth and the action log, nothing else. The server derives the rest by replay. */
export type RunRequest = { depth: number; log: string };

export type RunResponse =
  | { kind: 'saved'; run: RunResult }
  | { kind: 'closed'; today: number; todayUrl: string | null }
  | { kind: 'rejected'; reason: string };

/** POST /api/start: logs a run start (§2: act on scouting after the hackathon). */
export type StartRequest = { depth: number };

/** POST /api/carving: one carving on the caller's own ghost ("id" or "id:dir"), final once set. */
export type CarvingRequest = { depth: number; carving: string };
export type CarvingResponse =
  | { kind: 'carved'; carving: string }
  | { kind: 'closed'; today: number; todayUrl: string | null }
  | { kind: 'rejected'; reason: string };

/** GET /api/card?ghost=&depth=: a ghost's snoovatar and lifetime record (minus today's votes), fetched when its card opens. */
export type CardResponse = { avatar: string | null; record: { deaths: number; trust: number; liar: number } | null };

/** A board row: rank (ties: value, then user id, both descending), display name, value; `you` marks the caller. */
export type BoardRow = { rank: number; name: string; value: number; you?: true };
export type BoardRows = { rows: BoardRow[]; me: BoardRow | null; total: number };
/** GET /api/board?depth=: loaded only when the Board opens. Bots never appear. */
export type BoardResponse = { depth: number; today: BoardRows; deepest: BoardRows; souls: BoardRows; honour: BoardRows; trapsetter: BoardRow | null; liar: BoardRow | null };
/** GET /api/pulse?depth=: the already-played screen's 20 s poll. */
/** Phase 10, on the Warden's floor: links left (never below 0) of the pool it started with, whether it carried over from its last floor, who killed it, and the links you broke. */
export type BossView = { hp: number; pool: number; carried: boolean; killer: string | null; you: number };
export type PulseResponse = { fell: number; carved: number; boss?: BossView };
/** GET /api/chronicle: one row per floor, newest first. */
/** `predicted` (bot win %, A39) and `players` (real runs, bots excluded) sit side by side for tuning the target curve. */
export type ChronicleRow = { depth: number; fell: number; cleared: number; curse: Curse | null; zone: number | null; killer: string | null; predicted?: number | null; players?: { cleared: number; fell: number } };
export type ChronicleResponse = { rows: ChronicleRow[] };

/** POST /api/vote: Trust or Liar on a ghost's carving (after your run), or a winner's curse vote. Final once stored. */
export type VoteRequest = { depth: number; ghost: string; vote: Vote } | { depth: number; curse: Curse };
export type VoteResponse =
  | { kind: 'voted'; vote: string; standings: Standings | null }
  | { kind: 'closed'; today: number; todayUrl: string | null }
  | { kind: 'rejected'; reason: string };

/** POST /api/trap: a winner's trap for tomorrow (a compass zone and a kind). Final once stored; nobody else sees it. */
export type TrapRequest = { depth: number; zone: number; kind: Trap['kind'] };
export type TrapResponse =
  | { kind: 'placed'; trap: Trap }
  | { kind: 'closed'; today: number; todayUrl: string | null }
  | { kind: 'rejected'; reason: string };
