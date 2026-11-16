import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { seedBots } from '../game';
import type { Env } from '../index';

export const forms = new Hono<Env>();

forms.post('/seed-bots', async (c) => {
  const { n } = await c.req.json<{ n?: number }>().catch((): { n?: number } => ({}));
  const r = await seedBots(typeof n === 'number' ? n : 0);
  c.set('note', `seeded ${r.ghosts} bot ghosts in ${r.runs} runs on floor ${r.depth}`);
  return c.json<UiResponse>({ showToast: `Floor ${r.depth}: ${r.ghosts} bot ghosts from ${r.runs} runs` });
});
