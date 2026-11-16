import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { context, createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api';
import { forms } from './routes/forms';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { scheduler } from './routes/scheduler';

/** `note`: what the handler did (depth, outcome), for the one log line per request (§15.2). */
export type Env = { Variables: { note: string } };

const app = new Hono<Env>();
const internal = new Hono<Env>();

app.use(async (c, next) => {
  const t0 = Date.now();
  await next();
  console.log(`${context.username ?? context.userId ?? 'anon'} ${c.req.method} ${c.req.path} ${c.get('note') ?? c.res.status} ${Date.now() - t0}ms`);
});

internal.route('/menu', menu);
internal.route('/form', forms);
internal.route('/triggers', triggers);
internal.route('/scheduler', scheduler);

app.route('/api', api);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
