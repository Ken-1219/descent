/// <reference types="vite/client" />
// The client's only network code. Dev builds route to local.ts (localStorage); production fetches /api/*.
import { BEACON, type ClientClass } from '../shared/content';
import type { HintResponse, PracticeResponse, Beacon, FlairResponse, ForgetResponse, BoardResponse, CardResponse, ChronicleResponse, PulseResponse, CarvingRequest, CarvingResponse, FloorResponse, RunRequest, RunResponse, StartRequest, TrapRequest, TrapResponse, VoteRequest, VoteResponse } from '../shared/api';

export type Api = {
  floor: () => Promise<FloorResponse>;
  run: (r: RunRequest) => Promise<RunResponse>;
  start: (r: StartRequest) => Promise<void>;
  carve: (r: CarvingRequest) => Promise<CarvingResponse>;
  card: (ghost: string, depth: number) => Promise<CardResponse>;
  board: (depth: number) => Promise<BoardResponse>;
  pulse: (depth: number) => Promise<PulseResponse>;
  chronicle: () => Promise<ChronicleResponse>;
  vote: (r: VoteRequest) => Promise<VoteResponse>;
  trap: (r: TrapRequest) => Promise<TrapResponse>;
  beacon: (b: Beacon) => Promise<unknown>;
  flair: (on: boolean) => Promise<FlairResponse>;
  forget: () => Promise<ForgetResponse>;
  practice: (depth: number) => Promise<PracticeResponse>;
  hint: (bit: number) => Promise<HintResponse>;
};

const send = async <T>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status >= 500) throw new Error(`${path}: ${res.status}`);
  return res.json();
};

const remote: Api = {
  floor: () => send('/api/floor'),
  run: (r) => send('/api/run', r),
  start: (r) => send('/api/start', r),
  carve: (r) => send('/api/carving', r),
  card: (ghost, depth) => send(`/api/card?ghost=${encodeURIComponent(ghost)}&depth=${depth}`),
  board: (depth) => send(`/api/board?depth=${depth}`),
  pulse: (depth) => send(`/api/pulse?depth=${depth}`),
  chronicle: () => send('/api/chronicle'),
  vote: (r) => send('/api/vote', r),
  trap: (r) => send('/api/trap', r),
  beacon: (b) => send('/api/beacon', b),
  flair: (on) => send('/api/flair', { on }),
  forget: () => send('/api/forget', {}),
  practice: (depth) => send(`/api/practice?depth=${depth}`),
  hint: (bit) => send('/api/hint', { bit }),
};

export const api: Api = import.meta.env.DEV ? (await import('./local')).local : remote;

export type SaveState = 'saving' | 'saved' | 'failed';
const RETRY_MS = [1000, 2000, 4000];

/**
 * submit: send a run, carving, vote or trap in the background, 3 retries on network failure (§15.1). The server's own answer
 * (saved, carved, closed, rejected) is final and never retried; resending the same request is safe server-side.
 */
export async function submit<T extends { kind: string }>(call: () => Promise<T>, onState: (s: SaveState) => void): Promise<T | null> {
  onState('saving');
  for (let i = 0; ; i++) {
    try {
      const res = await call();
      onState(res.kind === 'saved' || res.kind === 'carved' || res.kind === 'voted' || res.kind === 'placed' ? 'saved' : 'failed');
      return res;
    } catch {
      const wait = RETRY_MS[i];
      if (wait === undefined) break;
      await new Promise((ok) => setTimeout(ok, wait));
    }
  }
  onState('failed');
  report({ kind: 'save', depth: where.depth, screen: where.screen() });
  return null;
}

// ---- Phase 10b: measurements (A57). Fire and forget; a beacon that fails is simply lost. ----
/** The page's floor and screen, set by the page, for beacons sent from here (save failures, errors). */
export const where = { depth: 0, screen: (): string => 'game' };
export const report = (b: Beacon) => void api.beacon(b).catch(() => undefined);
/** One of four coarse classes from the user agent; nothing finer ever leaves the device. */
export const clientClass = (ua = navigator.userAgent): ClientClass =>
  /Reddit/i.test(ua) && /iPhone|iPad|iOS/i.test(ua) ? 'ios' : /Reddit/i.test(ua) && /Android/i.test(ua) ? 'android' : /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mweb' : 'desktop';
/** Uncaught errors and rejections, at most BEACON.errorsPerLoad per page load (the server has its own budget). */
export function watchErrors() {
  let sent = 0;
  const send = (msg: string) => sent++ < BEACON.errorsPerLoad && report({ kind: 'error', depth: where.depth, msg: msg.slice(0, BEACON.msgChars), screen: where.screen() });
  addEventListener('error', (e) => send(e.message || 'error'));
  addEventListener('unhandledrejection', (e) => send(String(e.reason)));
}
