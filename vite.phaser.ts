import { resolve } from 'node:path';
import type { Plugin } from 'rolldown';

// Phaser's custom-build route (its own webpack configs do the same with DefinePlugin): bundle src/phaser-core.js, which
// leaves out physics, the extra loaders and plugins, and switch off the features we never use. `typeof X` is truthy
// even when X is undefined, so a feature is only dropped by replacing the whole expression.
// Both renderers stay (WebGL, with the canvas fallback for Phaser.AUTO); these are switched off.
const OFF = /typeof (WEBGL_DEBUG|FEATURE_SOUND|EXPERIMENTAL|PLUGIN_CAMERA3D|PLUGIN_FBINSTANT)\b/g;

/** The package's exports field hides src/, so the file is addressed directly. */
export const PHASER_CORE = resolve(import.meta.dirname, 'node_modules/phaser/src/phaser-core.js');

/** A rolldown plugin, so the same code runs in the production build and in the dev server's dependency pre-bundling. */
export const phaserCore = (): Plugin => ({
  name: 'descent:phaser-core',
  resolveId: (id) => (id === 'phaser' ? PHASER_CORE : null),
  transform(code, id) {
    if (!id.includes('/node_modules/phaser/src/')) return null;
    // Replacements stay on their own line, so the existing line mapping holds (map: null).
    const out = code
      .replace(OFF, 'false')
      .replace(/\bglobal\.Phaser\b/g, 'globalThis.Phaser');
    return { code: out, map: null };
  },
});
