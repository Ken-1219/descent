import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, settings } from '@devvit/web/server';
import { postUrl, purgeBots, resetRun, today } from '../game';
import { postFloor0, rollNow, startFirstFloor } from '../rollover';
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

const devTools = async () => !!(await settings.get<boolean>('devTools'));
const devOff = () => ({ showToast: 'Dev tools are switched off in the app settings' });

// Dev tool: replay the live floor with one account. Switched off with the devTools setting before submission.
menu.post('/reset-run', async (c) => {
  const user = context.userId;
  if (!(await devTools())) {
    c.set('note', 'reset refused: devTools off');
    return c.json<UiResponse>(devOff());
  }
  if (!user) return c.json<UiResponse>({ showToast: 'Log in first' });
  const r = await resetRun(user);
  c.set('note', `RESET run of ${context.username ?? user} on floor ${r.depth} (${r.had ? 'had a run' : 'no run'})`);
  return c.json<UiResponse>({ showToast: r.had ? `Your Floor ${r.depth} run is cleared` : `No run on Floor ${r.depth} to clear` });
});

// Dev tool: open tomorrow's floor now (the daily cron still runs: this claims no date). Logged by the rollover itself.
menu.post('/roll-now', async (c) => {
  if (!(await devTools())) {
    c.set('note', 'roll over refused: devTools off');
    return c.json<UiResponse>(devOff());
  }
  const r = await rollNow();
  c.set('note', r.posted ? `ROLL OVER NOW by ${context.username ?? context.userId}: floor ${r.posted} posted` : 'roll over now: nothing to do');
  const url = r.posted ? postUrl((await today()).postId) : null;
  return c.json<UiResponse>(url ? { navigateTo: url } : { showToast: 'Nothing to roll over' });
});

menu.post('/post-floor0', async (c) => {
  const p = await postFloor0();
  c.set('note', `posted Floor 0 practice ${p.id}`);
  return c.json<UiResponse>({ navigateTo: postUrl(p.id) ?? '' });
});
