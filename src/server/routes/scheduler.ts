import { Hono } from 'hono';
import { memorial } from '../boss';
import { flair, rollover } from '../rollover';
import { sweep } from '../privacy';
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

// Phase 10: the memorial post, its own job so it never blocks a run or the rollover (A45).
scheduler.post('/memorial', async (c) => {
  const body = await c.req.json<{ data?: { cycle?: unknown } }>().catch((): { data?: { cycle?: unknown } } => ({}));
  const cycle = Number(body.data?.cycle);
  const id = Number.isInteger(cycle) && cycle >= 0 ? await memorial(cycle) : null;
  c.set('note', `memorial cycle ${cycle}: ${id ?? 'nothing posted'}`);
  return c.json({ status: 'ok', id });
});

// Phase 10b: the daily deleted-account sweep (A53). Existing players keep everything; only accounts Reddit no longer has go.
scheduler.post('/sweep', async (c) => {
  const r = await sweep();
  c.set('note', `SWEEP checked ${r.checked}, purged ${r.purged}`);
  return c.json({ status: 'ok', ...r });
});
