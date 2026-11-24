// The production bundles hold what each side needs and nothing else. The server runs gate 3 inside generate(), so it must
// carry gen.ts and bot.ts; the client must carry neither, nor scenes, the Lab, local.ts or the __descent hook.
import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// One string literal from each module (identifiers are minified away; literals survive).
const MARK = {
  gen: 'no floor even empty',
  bot: 'uxO,;oF_',
  scenes: 'Knock it down, step over',
  lab: 'Measure the curve',
  local: 'descent:local:',
  hook: '__descent',
};

test('bundles: server has gen and bot; client has no gen, bot, scenes, Lab, local or dev hook; splash JS under 60 KB gzipped', { timeout: 60_000 }, () => {
  // Vitest sets NODE_ENV=test, which would build with import.meta.env.DEV on; a real build is production.
  rmSync('dist/client', { recursive: true, force: true });
  execFileSync('bunx', ['vite', 'build'], { stdio: 'ignore', env: { ...process.env, NODE_ENV: 'production' } });
  const server = readFileSync('dist/server/index.cjs', 'utf8');
  expect(server).toContain(MARK.gen);
  expect(server).toContain(MARK.bot);
  const js = readdirSync('dist/client').filter((f) => f.endsWith('.js'));
  const client = js.map((f) => readFileSync(`dist/client/${f}`, 'utf8')).join('\n');
  for (const [name, mark] of Object.entries(MARK)) expect(client, name).not.toContain(mark);
  // game.html preloads the Phaser chunk by name (vite.config.ts), so that chunk must exist under that name, slimmed.
  const game = readFileSync('dist/client/game.html', 'utf8');
  for (const chunk of ['phaser-core.js', 'scene.js']) expect(game).toContain(`href="/${chunk}"`);
  expect(gzipSync(readFileSync('dist/client/phaser-core.js')).length).toBeLessThan(230_000);
  expect(readFileSync('dist/client/phaser-core.js', 'utf8')).not.toContain('ArcadePhysics');
  // Every file the splash warms is in the build (11k: a stale 'sprites.js' 404'd on every warm).
  const warm = /const WARM = \[([^\]]+)\]/.exec(readFileSync('src/client/splash.ts', 'utf8'))?.[1] ?? '';
  for (const f of warm.match(/[\w.-]+\.\w+/g) ?? []) expect(readdirSync('dist/client'), f).toContain(f);
  // The splash loads only the scripts its HTML names: no Phaser, no sim.
  const splash = readFileSync('dist/client/splash.html', 'utf8');
  const scripts = [...splash.matchAll(/(?:src|href)="\/([^"]+\.js)"/g)].map((m) => m[1] ?? '');
  expect(scripts).not.toContain('phaser-core.js');
  const gz = scripts.reduce((n, f) => n + gzipSync(readFileSync(`dist/client/${f}`)).length, 0);
  console.log(`splash JS: ${scripts.join(' + ')} = ${gz} bytes gzipped`);
  expect(gz).toBeLessThan(60_000);
});
