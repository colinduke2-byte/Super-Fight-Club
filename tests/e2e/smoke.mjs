// Browser smoke test: boot to the Title screen, run a few short CPU versus matches on different stages and lineups (a hazard
// stage, the boss arena with the boss, a 2-player and a 4-player match), fail on any uncaught page error.
//
//   node tests/e2e/smoke.mjs <url-or-path>       e.g. http://localhost:5173/  or  dist/super-fight-club.html
//
// Playwright is resolved from PLAYWRIGHT_MODULE (a path or package name) if set, else the `playwright` package, else the
// sandbox's copy at /opt/node-tools/node_modules/playwright/index.mjs.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const target = process.argv[2] || 'http://localhost:5173/';
const url = /^(https?|file):/.test(target) ? target : pathToFileURL(resolve(target)).href;
const MATCH_MS = Number(process.env.SMOKE_MATCH_MS || 6_000);
/** The matches to run: stage + characters (all CPUs). */
const MATCHES = [
  { stage: 'classic', chars: ['brick', 'vex', 'nova', 'gizmo'] },
  { stage: 'reactor', chars: ['agni', 'rime', 'obelisk', 'halcyon'] },
  { stage: 'apex', chars: ['riptide', 'overseer'] },
];

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const c of candidates) {
    try {
      const spec = c.startsWith('/') || c.startsWith('.') ? pathToFileURL(resolve(c)).href : c;
      if (spec.startsWith('file:') && !existsSync(new URL(spec))) continue;
      return await import(spec);
    } catch {
      /* try the next one */
    }
  }
  throw new Error(`playwright not found (tried ${candidates.join(', ')}); set PLAYWRIGHT_MODULE`);
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e?.stack || e)));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
});

let failed = false;
const t0 = Date.now();
const step = (s) => console.log(`[smoke] ${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
try {
  step(`open ${url}`);
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 180_000 });
  step('Title is up');
  for (const { stage, chars } of MATCHES) {
    await page.evaluate(({ stage, chars }) => {
      const s = window.__session;
      s.mode = 'versus';
      s.stage = stage;
      s.players = chars.map((character, index) => ({ index, type: 'cpu', device: null, character, cpuLevel: 3 }));
      const g = window.__game;
      // from the Title (first match) or wherever the last one left off
      const from = g.scene.getScenes(true)[0];
      for (const sc of g.scene.getScenes(true)) if (sc !== from) sc.scene.stop();
      from.scene.start('Match');
    }, { stage, chars });
    await page.waitForFunction(() => window.__game.scene.isActive('Match'), null, { timeout: 60_000 });
    const label = `${stage} (${chars.join(', ')})`;
    step(`match started: ${label}`);
    const f0 = await page.evaluate(() => window.__game.loop.frame);
    await page.waitForTimeout(MATCH_MS);
    const state = await page.evaluate(() => ({
      frame: window.__game.loop.frame,
      match: window.__game.scene.isActive('Match'),
      results: window.__game.scene.isActive('Results'),
      stage: window.__session.stage,
      overlay: document.querySelector('[role="alert"]')?.textContent ?? null,
      // errors caught by the per-scene guard (src/errorOverlay.ts) do not reach pageerror
      caught: window.__errors ?? [],
    }));
    step(`after ${MATCH_MS / 1000}s: ${state.frame - f0} frames rendered, match=${state.match} results=${state.results}`);
    if (state.frame - f0 < 10) {
      console.error(`[smoke] FAIL (${label}): the game loop is not advancing`);
      failed = true;
    }
    if (!state.match && !state.results) {
      console.error(`[smoke] FAIL (${label}): neither Match nor Results is active`);
      failed = true;
    }
    if (state.caught.length) {
      console.error(`[smoke] FAIL (${label}): ${state.caught.length} error(s) caught in scenes:\n  ${state.caught.slice(0, 5).join('\n  ')}`);
      failed = true;
    }
    if (state.overlay) {
      console.error(`[smoke] FAIL (${label}): error overlay shown: ${state.overlay}`);
      failed = true;
    }
    if (failed) break;
  }
} catch (e) {
  console.error('[smoke] FAIL:', e?.message || e);
  failed = true;
}
if (consoleErrors.length) console.warn(`[smoke] ${consoleErrors.length} console error(s):\n  ${consoleErrors.slice(0, 10).join('\n  ')}`);
if (pageErrors.length) {
  console.error(`[smoke] FAIL: ${pageErrors.length} page error(s):\n  ${pageErrors.slice(0, 10).join('\n  ')}`);
  failed = true;
}
await browser.close();
step(failed ? 'FAILED' : 'passed');
process.exit(failed ? 1 : 0);
