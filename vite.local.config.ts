import { defineConfig } from 'vite';
import { PHASER_CORE, phaserCore } from './vite.phaser';

// Local harness only: plain Vite over src/client, no Devvit plugin, never used for production builds.
export default defineConfig({
  root: 'src/client',
  // The same slim Phaser as production, so the e2e suite exercises it; the dev server pre-bundles its CommonJS source.
  resolve: { alias: { phaser: PHASER_CORE } },
  optimizeDeps: { include: ['phaser'], rolldownOptions: { plugins: [phaserCore()] } },
  publicDir: '../../public',
  server: { port: 5190, strictPort: true },
});
