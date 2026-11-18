import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import { telemetry } from '@devvit/analytics/server/reddit';
import type { PracticeResponse, Beacon, FlairResponse, ForgetResponse, BoardResponse, CardResponse, CarvingRequest, ChronicleResponse, PulseResponse, CarvingResponse, FloorResponse, RunRequest, RunResponse, StartRequest, TrapRequest, TrapResponse, VoteResponse } from '../../shared/api';
import { carve, floorFor, logStart, placeTrap, practiceFor, setFlair, submitRun, today, voteCarving, voteCurse } from '../game';
import { beacon, beaconNote, count } from '../health';
import { purge } from '../privacy';
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
  if (r.kind === 'saved' && typeof depth === 'number') await count(depth, user, 'finish');
  c.set('note', `d${depth ?? '-'} ${r.kind}${r.kind === 'rejected' ? ` (${r.reason})` : r.kind === 'saved' ? ` ${r.run.outcome} ${r.run.score}${r.run.dealt ? `, ${r.run.dealt} links` : ''}` : ''}`);
  return c.json<RunResponse>(r, r.kind === 'rejected' ? 400 : 200);
});

api.post('/start', async (c) => {
  const { depth } = await c.req.json<Partial<StartRequest>>().catch((): Partial<StartRequest> => ({}));
  if (context.userId && typeof depth === 'number' && Number.isInteger(depth) && depth >= 0) {
    await logStart(context.userId, depth); // 0: Floor 0 done
    await count(depth || (await today()).day, context.userId, depth ? 'start' : 'floor0'); // Floor 0 counts on today's floor
  }
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
  if (r.kind === 'carved' && typeof depth === 'number') await count(depth, user, 'carved');
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
  if (r.kind === 'voted' && typeof b.depth === 'number') await count(b.depth, user, 'voted');
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
  if (r.kind === 'placed' && typeof depth === 'number') await count(depth, user, 'trap');
  c.set('note', `d${depth ?? '-'} trap ${kind ?? '-'} zone ${zone ?? '-'}: ${r.kind}${r.kind === 'rejected' ? ` (${r.reason})` : ''}`);
  return c.json<TrapResponse>(r, r.kind === 'rejected' ? 400 : 200);
});

// Phase 10b: measurements and funnel steps from the client (A57, A59): validated, rate-limited, one log line each.
api.post('/beacon', async (c) => {
  const b = await c.req.json<Beacon>().catch(() => null);
  const ok = b ? await beacon(context.userId, b) : false;
  c.set('note', b?.kind === 'step' ? `d${b.depth} ${beaconNote(b)}${ok ? '' : ' (already counted)'}` : b && ok ? `d${b.depth} ${beaconNote(b)}` : 'beacon dropped (malformed or over budget)');
  return c.json({ ok });
});

// Depth as flair, opt-in (A55): off removes your flair now; on is applied by the next flair job.
api.post('/flair', async (c) => {
  const { on } = await c.req.json<{ on?: unknown }>().catch((): { on?: unknown } => ({}));
  const user = context.userId;
  const r: FlairResponse = { on: user && typeof on === 'boolean' ? await setFlair(user, context.username ?? null, on) : false };
  c.set('note', `flair ${r.on ? 'on' : 'off'}`);
  return c.json<FlairResponse>(r);
});

// "Delete my data" (A56): everything Descent stores about the caller, now.
api.post('/forget', async (c) => {
  const user = context.userId;
  if (!user) return c.json({ kind: 'rejected', reason: 'logged out' }, 400);
  const r = await purge(user);
  c.set('note', `FORGET ${context.username ?? user}: ${r.floors} floors`);
  return c.json<ForgetResponse>(r);
});

// Phase 11c: Devvit Journeys, the client's telemetry calls (`@devvit/analytics/client/reddit` posts here). Hono stands in for
// the package's Express router: the same five endpoints, validated, each logging Reddit's receipt (VALID, or why it was
// dropped: playtest, not allowlisted yet, rate-limited).
const str = (v: unknown, n = 64) => (typeof v === 'string' ? v.slice(0, n) : '');
api.post('/telemetry/journey/:kind', async (c) => {
  const kind = c.req.param('kind');
  const b = await c.req.json<Record<string, unknown>>().catch((): Record<string, unknown> => ({}));
  const journeyId = str(b.journeyId, 128);
  const game = typeof b.game === 'object' && b.game !== null ? b.game : null;
  const win = game && 'win' in game ? game.win === true : false;
  const score = game && 'score' in game && typeof game.score === 'number' ? game.score : 0;
  const progress = typeof b.progress === 'number' ? Math.min(1, Math.max(0, b.progress)) : 0;
  const r =
    kind === 'start' ? await telemetry.startJourney()
    : kind === 'progress' ? await telemetry.journeyProgress({ journeyId, progress, action: str(b.action), actionDetails: str(b.actionDetails) })
    : kind === 'interaction' ? await telemetry.journeyInteraction({ journeyId, action: str(b.action), actionDetails: str(b.actionDetails) })
    : kind === 'end' ? await telemetry.endJourney({ journeyId, complete: b.complete === true, ...(game ? { game: { win, score } } : {}) })
    : kind === 'app-ready' ? await telemetry.appReady()
    : null;
  if (!r) return c.json({ error: 'unknown journey event' }, 400);
  c.set('note', `journey ${kind}${b.action ? ` ${str(b.action)}` : ''}: ${r.receipt.status}${r.receipt.message ? ` (${r.receipt.message.slice(0, 80)})` : ''}`);
  return c.json(r);
});

// Phase 11d: practice. Read-only: a floor and its ghosts to replay; nothing is written and no funnel step counts.
api.get('/practice', async (c) => {
  const r = await practiceFor(context.userId, Number(c.req.query('depth')));
  c.set('note', `practice d${c.req.query('depth') ?? '-'}: ${r.kind === 'practice' ? 'served (nothing saved)' : r.reason}`);
  return c.json<PracticeResponse>(r);
});
