// Phase 10b: measurements from real devices and the per-floor funnel (A57, A59), read by the Health menu item and the
// rollover line (A60). Our own server only; nothing that identifies a device: a client class, a bucketed time, counts.
import { redis } from '@devvit/web/server';
import { BEACON, CLIENTS, FUNNEL, LOAD, type ClientClass, type FunnelStep } from '../shared/content';
import type { Beacon } from '../shared/api';
import { isBot, key } from './game';

/** A funnel step, once per player per floor: the marker is set-if-absent, so a resend adds nothing. Bots never count. */
export async function count(depth: number, user: string | undefined, step: FunnelStep): Promise<boolean> {
  if (!user) {
    if (step === 'splash') await redis.hIncrBy(key(depth, 'funnel'), 'splash_anon', 1); // no identity to deduplicate
    return false;
  }
  if (isBot(user) || !(await redis.hSetNX(key(depth, 'seen'), `${user}:${step}`, '1'))) return false;
  await redis.hIncrBy(key(depth, 'funnel'), step, 1);
  return true;
}

const text = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
const isClient = (v: unknown): v is ClientClass => CLIENTS.some((c) => c === v);
const isMs = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const bucket = (ms: number) => Math.floor(Math.min(ms, LOAD.maxMs) / LOAD.bucketMs);
/** Error and save beacons share one budget: per player per floor, or one logged-out budget per floor. */
async function withinBudget(depth: number, user: string | undefined) {
  if (user) return (await redis.hIncrBy(key(depth, 'errs'), user, 1)) <= BEACON.errorsPerUser;
  return (await redis.hIncrBy(key(depth, 'health'), 'anon', 1)) <= BEACON.anonErrors;
}

/** Record one beacon (validated: this is a trust boundary). False when it is malformed or over budget. */
export async function beacon(user: string | undefined, b: Beacon): Promise<boolean> {
  const depth = Number(b?.depth);
  if (!Number.isInteger(depth) || depth < 0) return false;
  const h = key(depth, 'health');
  if (b.kind === 'load') {
    if (!isMs(b.ms) || !isClient(b.client)) return false;
    const st = b.stages;
    if (st !== undefined && !(isMs(st?.script) && isMs(st.floor) && isMs(st.engine) && isMs(st.intro))) return false;
    await redis.hIncrBy(h, `load:${b.client}:${bucket(b.ms)}`, 1);
    if (st) await redis.hIncrBy(h, `intro:${b.client}:${bucket(st.intro)}`, 1); // Phase 11b: intro readable, apart from first move
    return true;
  }
  if (b.kind === 'step') return b.step === 'splash' || b.step === 'descend' ? count(depth, user, b.step) : false;
  if (b.kind !== 'error' && b.kind !== 'save') return false;
  if (!(await withinBudget(depth, user))) return false;
  await redis.hIncrBy(h, b.kind === 'error' ? 'errors' : 'saves', 1);
  return true;
}
/** What a beacon logs: one line, no identity beyond the request's own log prefix. */
export const beaconNote = (b: Beacon) =>
  b.kind === 'load' ? `load ${b.client} ${Math.round(b.ms)}ms${b.stages ? ` (script ${Math.round(b.stages.script)}, floor ${Math.round(b.stages.floor)}, engine ${Math.round(b.stages.engine)}, intro ${Math.round(b.stages.intro)})` : ''}` : b.kind === 'error' ? `error on ${text(b.screen, 24)}: ${text(b.msg, BEACON.msgChars)}` : b.kind === 'save' ? `save failed on ${text(b.screen, 24)}` : `step ${b.step}`;

export type LoadStats = { n: number; p50: number; p90: number };
export type Health = { funnel: Record<string, number>; load: Partial<Record<ClientClass, LoadStats>>; intro: Partial<Record<ClientClass, LoadStats>>; errors: number; saves: number };

/** p50/p90 from the histogram: the upper edge of the bucket where the running count passes the share. */
function percentiles(buckets: [number, number][]): LoadStats {
  const n = buckets.reduce((s, [, c]) => s + c, 0);
  const at = (share: number) => {
    let run = 0;
    for (const [b, c] of buckets) if ((run += c) >= share * n) return (b + 1) * LOAD.bucketMs;
    return LOAD.maxMs;
  };
  return { n, p50: at(0.5), p90: at(0.9) };
}

/** Today's (or any floor's) numbers for the Health item and the rollover line. */
export async function health(depth: number): Promise<Health> {
  const [funnelRaw, h] = await Promise.all([redis.hGetAll(key(depth, 'funnel')), redis.hGetAll(key(depth, 'health'))]);
  const funnel = Object.fromEntries(Object.entries(funnelRaw).map(([k, v]) => [k, Number(v)]));
  const stats = (kind: 'load' | 'intro') => {
    const out: Health['load'] = {};
    for (const c of CLIENTS) {
      const buckets = Object.entries(h).flatMap(([f, v]): [number, number][] => (f.startsWith(`${kind}:${c}:`) ? [[Number(f.split(':')[2]), Number(v)]] : [])).sort((a, b) => a[0] - b[0]);
      if (buckets.length) out[c] = percentiles(buckets);
    }
    return out;
  };
  return { funnel, load: stats('load'), intro: stats('intro'), errors: Number(h.errors ?? 0), saves: Number(h.saves ?? 0) };
}

export const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
/** One line: the funnel in order, load by class, errors and failed saves. */
export const healthLine = (h: Health) =>
  [
    `funnel ${FUNNEL.map((s) => `${s} ${h.funnel[s] ?? 0}`).join(' > ')} (splash logged out ${h.funnel.splash_anon ?? 0})`,
    ...CLIENTS.flatMap((c) => { const l = h.load[c]; const i = h.intro[c]; return l ? [`load ${c} p50 ${secs(l.p50)} p90 ${secs(l.p90)} (${l.n})${i ? `, intro p50 ${secs(i.p50)} p90 ${secs(i.p90)}` : ''}`] : []; }),
    `errors ${h.errors}, failed saves ${h.saves}`,
  ].join('; ');
