import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { AvatarResponse, CarvingRequest, CarvingResponse, FloorResponse, RunRequest, RunResponse, StartRequest } from '../../shared/api';
import { avatar, carve, floorFor, logStart, submitRun } from '../game';
import type { Env } from '../index';

// Identity always comes from the Devvit context, never from a request body.
export const api = new Hono<Env>();

const postDepth = () => {
  const d = context.postData?.depth;
  return typeof d === 'number' ? d : null;
};

api.get('/floor', async (c) => {
  const r = await floorFor(context.userId, postDepth());
  c.set('note', `d${'depth' in r ? r.depth : '-'} ${r.kind}`);
  return c.json<FloorResponse>(r);
});

api.post('/run', async (c) => {
  const user = context.userId;
  const body: Partial<RunRequest> = await c.req.json<Partial<RunRequest>>().catch(() => ({}));
  const { depth, log } = body;
  let r: RunResponse;
  if (!user) r = { kind: 'rejected', reason: 'logged out' };
  else if (typeof depth !== 'number' || typeof log !== 'string') r = { kind: 'rejected', reason: 'shape' };
  else r = await submitRun(user, depth, log, { name: context.username ?? null });
  c.set('note', `d${depth ?? '-'} ${r.kind}${r.kind === 'rejected' ? ` (${r.reason})` : r.kind === 'saved' ? ` ${r.run.outcome} ${r.run.score}` : ''}`);
  return c.json<RunResponse>(r, r.kind === 'rejected' ? 400 : 200);
});

api.post('/start', async (c) => {
  const { depth } = await c.req.json<Partial<StartRequest>>().catch((): Partial<StartRequest> => ({}));
  if (context.userId && typeof depth === 'number' && Number.isInteger(depth) && depth > 0) await logStart(context.userId, depth);
  c.set('note', `d${depth ?? '-'} start`);
  return c.json({ ok: true });
});

api.post('/carving', async (c) => {
  const user = context.userId;
  const { depth, carving } = await c.req.json<Partial<CarvingRequest>>().catch((): Partial<CarvingRequest> => ({}));
  let r: CarvingResponse;
  if (!user) r = { kind: 'rejected', reason: 'logged out' };
  else if (typeof depth !== 'number' || typeof carving !== 'string') r = { kind: 'rejected', reason: 'shape' };
  else r = await carve(user, depth, carving);
  c.set('note', `d${depth ?? '-'} ${r.kind}${r.kind === 'rejected' ? ` (${r.reason})` : r.kind === 'carved' ? ` ${r.carving}` : ''}`);
  return c.json<CarvingResponse>(r, r.kind === 'rejected' ? 400 : 200);
});

// Only when a ghost card opens; a reddit username is the only input and the answer is a public avatar URL.
api.get('/avatar', async (c) => {
  const name = c.req.query('name') ?? '';
  const url = /^[A-Za-z0-9_-]{3,20}$/.test(name) ? await avatar(name).catch(() => null) : null;
  c.set('note', `avatar ${url ? 'found' : 'none'}`);
  return c.json<AvatarResponse>({ url });
});
