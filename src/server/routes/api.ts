import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { BoardResponse, CardResponse, CarvingRequest, ChronicleResponse, PulseResponse, CarvingResponse, FloorResponse, RunRequest, RunResponse, StartRequest, TrapRequest, TrapResponse, VoteResponse } from '../../shared/api';
import { carve, floorFor, logStart, placeTrap, submitRun, voteCarving, voteCurse } from '../game';
import { boardsFor, cardFor, chronicle, pulse } from '../boards';
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
  c.set('note', `d${depth ?? '-'} ${r.kind}${r.kind === 'rejected' ? ` (${r.reason})` : r.kind === 'saved' ? ` ${r.run.outcome} ${r.run.score}${r.run.dealt ? `, ${r.run.dealt} links` : ''}` : ''}`);
  return c.json<RunResponse>(r, r.kind === 'rejected' ? 400 : 200);
});

api.post('/start', async (c) => {
  const { depth } = await c.req.json<Partial<StartRequest>>().catch((): Partial<StartRequest> => ({}));
  if (context.userId && typeof depth === 'number' && Number.isInteger(depth) && depth >= 0) await logStart(context.userId, depth); // 0: Floor 0 done
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

// Only when a ghost card opens: the avatar and the lifetime record (minus today's votes, so it reveals nothing about today).
api.get('/card', async (c) => {
  const ghost = c.req.query('ghost') ?? '';
  const depth = Number(c.req.query('depth'));
  const r = Number.isInteger(depth) && depth > 0 ? await cardFor(ghost, depth) : { avatar: null, record: null };
  c.set('note', `card ${ghost.startsWith('bot:') ? 'bot' : 'player'}: avatar ${r.avatar ? 'found' : 'none'}`);
  return c.json<CardResponse>(r);
});

// The board loads on demand (never with the floor), capped to top rows plus your own.
api.get('/board', async (c) => {
  const depth = Number(c.req.query('depth'));
  if (!Number.isInteger(depth) || depth < 1) return c.json({ kind: 'rejected', reason: 'depth' }, 400);
  const r = await boardsFor(context.userId, depth);
  c.set('note', `d${depth} board: today ${r.today.total}, you ${r.today.me ? `#${r.today.me.rank}` : '-'}`);
  return c.json<BoardResponse>(r);
});

api.get('/pulse', async (c) => {
  const depth = Number(c.req.query('depth'));
  const r = Number.isInteger(depth) && depth > 0 ? await pulse(depth, context.userId) : { fell: 0, carved: 0 };
  c.set('note', `d${depth} pulse ${r.fell} fell${r.boss ? `, Warden ${r.boss.hp}/${r.boss.pool}` : ''}`);
  return c.json<PulseResponse>(r);
});

api.get('/chronicle', async (c) => {
  const r = await chronicle();
  c.set('note', `chronicle ${r.rows.length} rows`);
  return c.json<ChronicleResponse>(r);
});

// A carving vote ({ ghost, vote }) or a winner's curse vote ({ curse }); the server checks both against what it holds.
api.post('/vote', async (c) => {
  const user = context.userId;
  type Body = { depth?: unknown; ghost?: unknown; vote?: unknown; curse?: unknown };
  const b = await c.req.json<Body>().catch((): Body => ({}));
  let r: VoteResponse;
  if (!user) r = { kind: 'rejected', reason: 'logged out' };
  else if (typeof b.depth !== 'number') r = { kind: 'rejected', reason: 'shape' };
  else if (typeof b.curse === 'string') r = await voteCurse(user, b.depth, b.curse);
  else if (typeof b.ghost === 'string' && (b.vote === 'trust' || b.vote === 'liar')) r = await voteCarving(user, b.depth, b.ghost, b.vote);
  else r = { kind: 'rejected', reason: 'shape' };
  const what = typeof b.curse === 'string' ? `curse ${b.curse}` : `${String(b.vote)} on ${String(b.ghost)}`;
  c.set('note', `d${String(b.depth ?? '-')} ${what}: ${r.kind}${r.kind === 'rejected' ? ` (${r.reason})` : ''}`);
  return c.json<VoteResponse>(r, r.kind === 'rejected' ? 400 : 200);
});

api.post('/trap', async (c) => {
  const user = context.userId;
  const { depth, zone, kind } = await c.req.json<Partial<TrapRequest>>().catch((): Partial<TrapRequest> => ({}));
  let r: TrapResponse;
  if (!user) r = { kind: 'rejected', reason: 'logged out' };
  else if (typeof depth !== 'number' || typeof zone !== 'number' || typeof kind !== 'string') r = { kind: 'rejected', reason: 'shape' };
  else r = await placeTrap(user, depth, zone, kind, context.username ?? null);
  c.set('note', `d${depth ?? '-'} trap ${kind ?? '-'} zone ${zone ?? '-'}: ${r.kind}${r.kind === 'rejected' ? ` (${r.reason})` : ''}`);
  return c.json<TrapResponse>(r, r.kind === 'rejected' ? 400 : 200);
});
