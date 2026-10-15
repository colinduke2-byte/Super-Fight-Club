import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5173, host: true },
  // the whole game ships as ONE chunk by design (inlined into a single HTML file by scripts/make-artifact.mjs): ~2.3 MB
  // minified today (Phaser itself is ~1.2 MB). The limit sits just above that so real growth still warns.
  build: { chunkSizeWarningLimit: 2600 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
