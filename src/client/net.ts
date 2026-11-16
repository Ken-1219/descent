/// <reference types="vite/client" />
// The client's only network code. Dev builds route to local.ts (localStorage); production fetches /api/*.
import type { BoardResponse, CardResponse, ChronicleResponse, PulseResponse, CarvingRequest, CarvingResponse, FloorResponse, RunRequest, RunResponse, StartRequest, TrapRequest, TrapResponse, VoteRequest, VoteResponse } from '../shared/api';

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
  return null;
}
