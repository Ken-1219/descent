import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, settings } from '@devvit/web/server';
import { postUrl, purgeBots, resetRun, today } from '../game';
import { postFloor0, rollNow, startFirstFloor } from '../rollover';
import { health, secs } from '../health';
import { writePrivacyPage } from '../privacy';
import { CLIENTS, FUNNEL } from '../../shared/content';
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

export const devTools = async () => !!(await settings.get<boolean>('devTools'));
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

// Dev tool: set the live Warden's remaining links, to test the kill and the memorial with a real run. Logged by the form.
menu.post('/set-links', async (c) => {
  if (!(await devTools())) {
    c.set('note', 'set links refused: devTools off');
    return c.json<UiResponse>(devOff());
  }
  return c.json<UiResponse>({
    showForm: { name: 'setLinks', form: { title: "Set the Warden's links", acceptLabel: 'Set', fields: [{ name: 'left', label: 'Links left (1 to the pool; a real run makes the kill)', type: 'number', defaultValue: 5 }] } },
  });
});

menu.post('/post-floor0', async (c) => {
  const p = await postFloor0();
  c.set('note', `posted Floor 0 practice ${p.id}`);
  return c.json<UiResponse>({ navigateTo: postUrl(p.id) ?? '' });
});

// Phase 10b: Health (A60), mod-only and always on: today's funnel, load by client class, errors and failed saves.
menu.post('/health', async (c) => {
  const { day } = await today();
  const h = await health(day);
  const row = (name: string, label: string, value: string) => ({ name, label, type: 'string' as const, defaultValue: value, disabled: true });
  const fields = [
    row('funnel', 'Funnel (once per player)', FUNNEL.map((s) => `${s} ${h.funnel[s] ?? 0}`).join(' > ')),
    row('anon', 'Splash loads, logged out', String(h.funnel.splash_anon ?? 0)),
    ...CLIENTS.map((k) => {
      const l = h.load[k];
      const i = h.intro[k];
      return row(k, `Load ${k}: first move (intro)`, l ? `p50 ${secs(l.p50)}, p90 ${secs(l.p90)} (${l.n} loads)${i ? `; intro p50 ${secs(i.p50)}, p90 ${secs(i.p90)}` : ''}` : 'no loads');
    }),
    row('errors', 'Client errors / failed saves', `${h.errors} / ${h.saves}`),
  ];
  c.set('note', `health floor ${day}`);
  return c.json<UiResponse>({ showForm: { name: 'health', form: { title: `Health: Floor ${day}`, acceptLabel: 'Close', fields } } });
});

menu.post('/privacy-page', async (c) => {
  const url = await writePrivacyPage();
  c.set('note', `privacy page written: ${url}`);
  return c.json<UiResponse>({ showToast: 'Privacy page written to the wiki' });
});
