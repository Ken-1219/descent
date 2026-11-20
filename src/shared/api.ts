// Wire types for /api/*, imported by client and server so a mismatch is a compile error (§15.2).
import type { ClientClass, Curse } from './content';
import type { Trap } from './gen';
import type { GhostView, Vote } from './ghosts';
import type { Floor, RunResult } from './sim';

export type { GhostView, RunResult, Trap, Vote };
/** Curse standings, most votes first: sent only to a player who has voted. */
export type Standings = [Curse, number][];
/** A winner's choices on the played plate: their curse vote (and the standings once they voted), their own trap. */
export type Choices = { curse: Curse | null; standings: Standings | null; trap: Trap | null };
/** Your trap on this floor (set yesterday) and what it has done here so far. */
/**
 * Phase 11i (A123): your own facts from the day before, for "Your mark" on the intro; only the ones that exist. `fell`:
 * the zone you fell in yesterday. `vote`: your curse vote, the standings, and whether it won (and was set aside). `trap`:
 * the trap you set, waiting today or set aside. `caught`: what your trap on yesterday's floor did. `carving`: its votes.
 */
export type Yours = {
  fell?: { zone: number };
  vote?: { curse: Curse; standings: [Curse, number][]; won: boolean; setAside: boolean };
  trap?: { kind: Trap['kind']; zone: number; waits: boolean };
  caught?: { kind: Trap['kind']; hurt: number; killed: number; souls: number };
  carving?: { carving: string; trust: number; liar: number };
};
export type MyTrap = { kind: Trap['kind']; x: number; y: number; hurt: number; killed: number } | null;

/** GET /api/floor. The depth is the post's own (postData), so an old post shows its floor as closed. */
export type FloorResponse =
  /** `attempt`: how often the mod reset tool cleared this player's run here (keys the client's saved log). */
  | { kind: 'play'; depth: number; seed: number; floor: Floor; ghosts: GhostView; attempt: number; tutorial: boolean; myTrap: MyTrap; boss?: BossView; hints?: number; yours?: Yours }
  | { kind: 'played'; depth: number; seed: number; floor: Floor; run: RunResult; ghosts: GhostView; live: boolean; attempt: number; choices: Choices; myTrap: MyTrap; streak: number; nextAt: number; flair?: boolean; today?: number; todayUrl?: string | null; boss?: BossView; hints?: number }
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
export type ChronicleRow = { depth: number; name?: string; fell: number; cleared: number; nameless?: number; filled?: boolean; curse: Curse | null; zone: number | null; killer: string | null; predicted?: number | null; players?: { cleared: number; fell: number } };
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

// Phase 10b: measurements and the funnel (A57, A59), "Delete my data" (A56), flair opt-in (A55).
export type Beacon =
  // Phase 11b: `ms` is first move possible; `stages` say where the time went (each ms from page start).
  | { kind: 'load'; depth: number; ms: number; client: ClientClass; stages?: LoadStages }
  | { kind: 'error'; depth: number; msg: string; screen: string }
  | { kind: 'save'; depth: number; screen: string }
  | { kind: 'step'; depth: number; step: 'splash' | 'descend' };
/** A load's stages, ms from page start: the game script running, the floor response, Phaser and the scene, the intro readable. */
export type LoadStages = { script: number; floor: number; engine: number; intro: number };
/** Phase 11f: POST /api/hint marks one thing taught (its index in TEACH); the reply is every bit seen so far. */
export type HintRequest = { bit: number };
export type HintResponse = { hints: number };
export type FlairRequest = { on: boolean };
export type FlairResponse = { on: boolean };
export type ForgetResponse = { floors: number };

// Phase 11d: practice. A floor to replay that saves nothing: a past floor, or today's once your own run is in.
export type PracticeResponse = { kind: 'practice'; depth: number; floor: Floor; ghosts: GhostView } | { kind: 'rejected'; reason: string };
