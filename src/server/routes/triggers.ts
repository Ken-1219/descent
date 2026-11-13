import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { startFirstFloor } from '../rollover';
import type { Env } from '../index';

export const triggers = new Hono<Env>();

triggers.post('/on-app-install', async (c) => {
  try {
    const input = await c.req.json<OnAppInstallRequest>();
    const r = await startFirstFloor();
    return c.json<TriggerResponse>({ status: 'success', message: `Floor ${r.depth} ${r.created ? 'posted' : 'already live'} (trigger: ${input.type})` });
  } catch (error) {
    console.error(`Error starting floor 1: ${error}`);
    return c.json<TriggerResponse>({ status: 'error', message: 'Failed to start Floor 1' }, 400);
  }
});
