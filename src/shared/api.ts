// Wire types for /api/*, imported by client and server so a mismatch is a compile error (§15.2).
import type { Floor, RunResult } from './sim';

export type { RunResult };

/** GET /api/floor. The depth is the post's own (postData), so an old post shows its floor as closed. */
export type FloorResponse =
  | { kind: 'play'; depth: number; seed: number; floor: Floor }
  | { kind: 'played'; depth: number; seed: number; floor: Floor; run: RunResult }
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
