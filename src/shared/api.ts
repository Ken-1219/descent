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

/** GET /api/floor. The depth is the post's own (postData), so an old post shows its floor as closed. */
export type FloorResponse =
  /** `attempt`: how often the mod reset tool cleared this player's run here (keys the client's saved log). */
  | { kind: 'play'; depth: number; seed: number; floor: Floor; ghosts: GhostView; attempt: number }
  | { kind: 'played'; depth: number; seed: number; floor: Floor; run: RunResult; ghosts: GhostView; live: boolean; attempt: number; choices: Choices }
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

/** GET /api/avatar?name=: the snoovatar for a ghost card, fetched only when the card opens. */
export type AvatarResponse = { url: string | null };

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
