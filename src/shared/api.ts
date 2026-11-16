// Wire types for /api/*, imported by client and server so a mismatch is a compile error (§15.2).
import type { GhostView } from './ghosts';
import type { Floor, RunResult } from './sim';

export type { GhostView, RunResult };

/** GET /api/floor. The depth is the post's own (postData), so an old post shows its floor as closed. */
export type FloorResponse =
  | { kind: 'play'; depth: number; seed: number; floor: Floor; ghosts: GhostView }
  | { kind: 'played'; depth: number; seed: number; floor: Floor; run: RunResult; ghosts: GhostView; live: boolean }
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
