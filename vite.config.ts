import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Phaser's build-time feature flags (`if (typeof WEBGL_RENDERER)` ...), replaced the way Phaser's own webpack build does, for
 * the trimmed Phaser the production build uses (src/vendor/phaser-trimmed.js). The game renders with WebGL only (main.ts shows
 * a help page when WebGL is missing), uses no Phaser sound (all audio is its own Web Audio graph) and no Phaser plugins.
 */
const PHASER_FLAGS: Record<string, boolean> = {
  WEBGL_RENDERER: true,
  CANVAS_RENDERER: true,
  FEATURE_SOUND: false,
  EXPERIMENTAL: false,
  PLUGIN_CAMERA3D: false,
  PLUGIN_FBINSTANT: false,
  WEBGL_DEBUG: false,
};

function phaserFlags(): Plugin {
  const re = new RegExp(`typeof (${Object.keys(PHASER_FLAGS).join('|')})\\b`, 'g');
  return {
    name: 'phaser-flags',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/node_modules/phaser/src/') || !code.includes('typeof ')) return null;
      const out = code.replace(re, (_m, flag: string) => String(PHASER_FLAGS[flag]));
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig(({ command }) => ({
  server: { port: 5173, host: true },
  // Production builds take Phaser from its sources with only the parts the game uses (src/vendor/phaser-trimmed.js: no
  // physics, tilemaps, sound, video, particles ...), ~0.4 MB smaller than the full prebuilt bundle. The dev server and the tests
  // keep the stock package.
  resolve: command === 'build' ? { alias: [{ find: /^phaser$/, replacement: fileURLToPath(new URL('./src/vendor/phaser-trimmed.js', import.meta.url)) }] } : undefined,
  plugins: command === 'build' ? [phaserFlags()] : [],
  // the whole game ships as ONE chunk by design (inlined into a single HTML file by scripts/make-artifact.mjs). The limit sits
  // just above today's size so real growth still warns (CI enforces a hard budget too: .github/workflows/ci.yml).
  build: { chunkSizeWarningLimit: 2300 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // a loaded machine (CI, several suites at once) can take far longer than the 5 s default on the long simulations
    testTimeout: 30000,
    // (isolate: false would save ~10% but tests/sheetPool.test.ts relies on a fresh module per file: it fails when another
    // file loaded the pool first)
  },
}));
