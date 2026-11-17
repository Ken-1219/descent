import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { seedBots, today } from '../game';
import { setLinks } from '../boss';
import { devTools } from './menu';
import type { Env } from '../index';

export const forms = new Hono<Env>();

forms.post('/seed-bots', async (c) => {
  const { n } = await c.req.json<{ n?: number }>().catch((): { n?: number } => ({}));
  const r = await seedBots(typeof n === 'number' ? n : 0);
  c.set('note', `seeded ${r.ghosts} bot ghosts in ${r.runs} runs on floor ${r.depth}`);
  return c.json<UiResponse>({ showToast: `Floor ${r.depth}: ${r.ghosts} bot ghosts from ${r.runs} runs` });
});

forms.post('/set-links', async (c) => {
  if (!(await devTools())) {
    c.set('note', 'set links refused: devTools off');
    return c.json<UiResponse>({ showToast: 'Dev tools are switched off in the app settings' });
  }
  const { left } = await c.req.json<{ left?: number }>().catch((): { left?: number } => ({}));
  const { day } = await today();
  const r = await setLinks(day, typeof left === 'number' ? left : 0);
  c.set('note', r ? `SET LINKS by ${context.username ?? context.userId} on floor ${day}: ${r.hp}/${r.pool}` : `set links: no living Warden on floor ${day}`);
  return c.json<UiResponse>({ showToast: r ? `The Warden: ${r.hp} of ${r.pool} links` : `No living Warden on Floor ${day}` });
});

// The Health form is read-only: closing it does nothing.
forms.post('/health', (c) => c.json<UiResponse>({}));
