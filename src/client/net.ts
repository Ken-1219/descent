/// <reference types="vite/client" />
// The client's only network code. Dev builds route to local.ts (localStorage); production fetches /api/*.
import type { AvatarResponse, CarvingRequest, CarvingResponse, FloorResponse, RunRequest, RunResponse, StartRequest } from '../shared/api';

export type Api = {
  floor: () => Promise<FloorResponse>;
  run: (r: RunRequest) => Promise<RunResponse>;
  start: (r: StartRequest) => Promise<void>;
  carve: (r: CarvingRequest) => Promise<CarvingResponse>;
  avatar: (name: string) => Promise<AvatarResponse>;
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
  avatar: (name) => send(`/api/avatar?name=${encodeURIComponent(name)}`),
};

export const api: Api = import.meta.env.DEV ? (await import('./local')).local : remote;

export type SaveState = 'saving' | 'saved' | 'failed';
const RETRY_MS = [1000, 2000, 4000];

/**
 * submit: send a run or a carving in the background, 3 retries on network failure (§15.1). The server's own answer
 * (saved, carved, closed, rejected) is final and never retried; resending the same request is safe server-side.
 */
export async function submit<T extends { kind: string }>(call: () => Promise<T>, onState: (s: SaveState) => void): Promise<T | null> {
  onState('saving');
  for (let i = 0; ; i++) {
    try {
      const res = await call();
      onState(res.kind === 'saved' || res.kind === 'carved' ? 'saved' : 'failed');
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
