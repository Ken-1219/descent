/// <reference types="vite/client" />
// The client's only network code. Dev builds route to local.ts (localStorage); production fetches /api/*.
import type { FloorResponse, RunRequest, RunResponse, StartRequest } from '../shared/api';

export type Api = {
  floor: () => Promise<FloorResponse>;
  run: (r: RunRequest) => Promise<RunResponse>;
  start: (r: StartRequest) => Promise<void>;
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
};

export const api: Api = import.meta.env.DEV ? (await import('./local')).local : remote;

export type SaveState = 'saving' | 'saved' | 'failed';
const RETRY_MS = [1000, 2000, 4000];

/**
 * submit: post a finished run in the background, 3 retries on network failure (§15.1). The server's own answer
 * (saved, closed, rejected) is final and never retried; resubmitting the same log is safe because it is a retry server-side.
 */
export async function submit(r: RunRequest, onState: (s: SaveState) => void): Promise<RunResponse | null> {
  onState('saving');
  for (let i = 0; ; i++) {
    try {
      const res = await api.run(r);
      onState(res.kind === 'saved' ? 'saved' : 'failed');
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
