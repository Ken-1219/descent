import { Hono } from 'hono';
import { flair, rollover } from '../rollover';
import type { Env } from '../index';

export const scheduler = new Hono<Env>();

// Daily cron (devvit.json). The UTC date is the idempotency key: a second call that day posts nothing.
scheduler.post('/rollover', async (c) => {
  const r = await rollover(new Date().toISOString().slice(0, 10));
  c.set('note', r.posted ? `posted floor ${r.posted}` : 'already rolled');
  return c.json({ status: 'ok', ...r });
});

// Follow-up flair job (§15.3: at most FLAIR.perRun per run): scheduled by the rollover when players are still waiting.
scheduler.post('/flair', async (c) => {
  const body = await c.req.json<{ data?: { depth?: unknown } }>().catch((): { data?: { depth?: unknown } } => ({}));
  const depth = Number(body.data?.depth);
  const r = Number.isInteger(depth) && depth > 0 ? await flair(depth) : { done: 0, left: 0 };
  c.set('note', `flair floor ${depth}: ${r.done} set, ${r.left} left`);
  return c.json({ status: 'ok', ...r });
});
