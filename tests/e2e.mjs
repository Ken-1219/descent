// End-to-end runner (Phase 11k): `bun run e2e`. Serves the local harness on :5190 (or uses one already running), runs
// tests/play.mcp.js in Playwright's Chromium and exits 1 on any failed check. `bun run e2e --budgets` then measures
// §15.3 on the production build in dist/client (run `bun run build` first), at 4× CPU throttle, and prints the numbers.
//
// The one standalone browser script. The owner's global rule says browsers are driven only step by step through the
// Playwright MCP tools; on Nov 20 they allowed this script, and only this one, as an explicit exception so the suite can
// run in CI. Everything else (playtests, Reddit checks) stays with the MCP tools.
import { createServer as http } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { FLOOR_0 } from '../src/shared/content.ts';

const root = new URL('..', import.meta.url).pathname;
let vite = null;
try {
  vite = await createServer({ configFile: join(root, 'vite.local.config.ts'), server: { port: 5190, strictPort: true }, logLevel: 'error' });
  await vite.listen();
} catch {
  await vite?.close(); // :5190 is taken: `bun run local` is already serving the harness
  vite = null;
}
const browser = await chromium.launch();
const suite = (0, eval)(`(${readFileSync(join(root, 'tests/play.mcp.js'), 'utf8')}\n)`);
const r = await suite(await (await browser.newContext()).newPage());
console.log(`e2e: ${r.passed} of ${r.total} passed`);
for (const f of r.failed) console.log(`FAIL ${f.name}: ${String(f.detail ?? '').slice(0, 300)}`);
if (r.errs.length) console.log(`page errors: ${JSON.stringify(r.errs).slice(0, 500)}`);
for (const line of r.results ?? []) if (/input to motion|animation lock|under 60 s/.test(line)) console.log(line);

if (process.argv.includes('--budgets')) await budgets();
await browser.close();
await vite?.close();
process.exit(r.failed.length || r.errs.length ? 1 : 0);

// §15.3 on the built client: a static server with a stand-in /api (Floor 0 as the day's floor), three cold loads each.
async function budgets() {
  const dist = join(root, 'dist/client');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
  const floor = { kind: 'play', depth: 1, seed: 0, floor: { ...FLOOR_0, depth: 1 }, ghosts: { list: [], tiles: [], fell: 0, carved: 0 }, attempt: 0, tutorial: true, myTrap: null, hints: 0 };
  const server = http((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path.startsWith('/api/')) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(path === '/api/floor' ? floor : { ok: true }));
    try {
      const body = readFileSync(join(dist, path === '/' ? 'game.html' : path));
      const gz = /\.(html|js|css|json)$/.test(path) ? gzipSync(body) : null; // gzip on the wire, as Reddit serves it
      res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', ...(gz ? { 'content-encoding': 'gzip' } : {}) }).end(gz ?? body);
    } catch {
      res.writeHead(404).end();
    }
  }).listen(5199);
  const load = async (page, mark, viewport) => {
    const ctx = await browser.newContext({ viewport });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await p.goto(`http://localhost:5199/${page}`);
    await p.waitForFunction((m) => performance.getEntriesByName(m).length > 0, mark, { timeout: 30000 });
    const m = await p.evaluate((m) => ({ ms: performance.getEntriesByName(m)[0].startTime, bytes: [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].reduce((s, e) => s + e.transferSize, 0) }), mark);
    await ctx.close();
    return m;
  };
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const splash = [], game = [];
  for (let i = 0; i < 3; i++) {
    splash.push(await load('splash.html', 'descent:splash', { width: 390, height: 320 }));
    game.push(await load('game.html', 'descent:interactive', { width: 390, height: 844 }));
  }
  server.close();
  const files = readdirSync(dist).map((f) => join(dist, f)).filter((f) => statSync(f).isFile());
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const gz = (f) => gzipSync(readFileSync(f)).length;
  // Every script splash.html loads or preloads, as Reddit would send it.
  const splashJs = [...readFileSync(join(dist, 'splash.html'), 'utf8').matchAll(/(?:src|href)="\.?\/?([^"]+\.js)"/g)].reduce((s, [, f]) => s + gz(join(dist, f)), 0);
  const pngs = files.filter((f) => f.endsWith('.png')).map((f) => statSync(f).size);
  const fonts = files.filter((f) => f.endsWith('.woff2')).map((f) => statSync(f).size);
  console.log(`budgets: splash JS ${kb(splashJs)} gzipped (< 60 KB); splash interactive median ${Math.round(median(splash.map((x) => x.ms)))} ms (< 1000, 4× CPU); game interactive median ${Math.round(median(game.map((x) => x.ms)))} ms (< 3000, 4× CPU); game transfer ${kb(median(game.map((x) => x.bytes)))} gzipped (< 1.5 MB); largest PNG ${kb(Math.max(0, ...pngs))} (< 100 KB); fonts ${fonts.length} files, ${kb(fonts.reduce((s, n) => s + n, 0))} (< 60 KB)`);
}
