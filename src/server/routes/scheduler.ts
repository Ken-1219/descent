import { Hono } from 'hono';
import { rollover } from '../rollover';
import type { Env } from '../index';

export const scheduler = new Hono<Env>();

// Daily cron (devvit.json). The UTC date is the idempotency key: a second call that day posts nothing.
scheduler.post('/rollover', async (c) => {
  const r = await rollover(new Date().toISOString().slice(0, 10));
  c.set('note', r.posted ? `posted floor ${r.posted}` : 'already rolled');
  return c.json({ status: 'ok', ...r });
});
