import { defineConfig } from 'vite';

// Local harness only: plain Vite over src/client, no Devvit plugin, never used for production builds.
export default defineConfig({
  root: 'src/client',
  publicDir: '../../public',
  server: { port: 5190, strictPort: true },
});
