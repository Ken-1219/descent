import { defineConfig } from 'vite';
import { devvit } from '@devvit/start/vite';
import { phaserCore } from './vite.phaser';

export default defineConfig({
  plugins: [
    { ...phaserCore(), enforce: 'pre' },
    devvit({
      client: {
        build: {
          chunkSizeWarningLimit: 2000,
          // game.ts imports Phaser dynamically so the floor request starts early; preloading the chunk from game.html
          // keeps its download parallel with the entry instead of one round trip later.
          modulePreload: {
            resolveDependencies: (_file, deps, { hostId, hostType }) =>
              hostType === 'html' && hostId.endsWith('game.html') ? [...deps, 'phaser-core.js', 'scene.js'] : deps,
          },
        },
      },
    }),
  ],
});
