import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { postUrl, purgeBots } from '../game';
import { startFirstFloor } from '../rollover';
import type { Env } from '../index';

export const menu = new Hono<Env>();

menu.post('/post-create', async (c) => {
  try {
    const r = await startFirstFloor();
    const url = postUrl(r.postId);
    c.set('note', r.created ? 'started floor 1' : `floor ${r.depth} is live`);
    if (r.created && url) return c.json<UiResponse>({ navigateTo: url });
    return c.json<UiResponse>({ showToast: `Floor ${r.depth} is already live` });
  } catch (error) {
    console.error(`Error starting floor 1: ${error}`);
    return c.json<UiResponse>({ showToast: 'Could not start Floor 1' }, 400);
  }
});

// Mod tools for seeing a populated floor with one account: bot runs go through the same validation as real runs.
menu.post('/seed-bots', (c) =>
  c.json<UiResponse>({
    showForm: { name: 'seedBots', form: { title: 'Seed bot ghosts', acceptLabel: 'Seed', fields: [{ name: 'n', label: 'Bot ghosts to add (up to 100)', type: 'number', defaultValue: 20 }] } },
  }),
);

menu.post('/purge-bots', async (c) => {
  const r = await purgeBots();
  c.set('note', `purged ${r.removed} bot runs on floor ${r.depth}`);
  return c.json<UiResponse>({ showToast: `Removed ${r.removed} bot runs from Floor ${r.depth}` });
});
