import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { postUrl } from '../game';
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
