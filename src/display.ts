import type Phaser from 'phaser';
import { settings } from './settings';

/** Largest devicePixelRatio we ever render at (keeps 4K / 3x phones from over-allocating the canvas). */
const MAX_DPR = 3;
/** Canvas pixel budgets: AUTO stays near 1440p worth of pixels, PERFORMANCE near 720p. */
const BUDGET = { auto: 2560 * 1440, fast: 1280 * 800 } as const;

/**
 * Canvas pixels per CSS pixel. The game is pixel art, so rendering above ~1440p only multiplies fill cost: on a Retina or
 * 4K screen AUTO renders at a lower scale and the browser upscales the canvas with nearest-neighbour (image-rendering:
 * pixelated), which looks the same. Steps prefer whole-number scales (or 1/2, 1/3) so pixels stay even.
 */
export function renderScale(cssW = window.innerWidth, cssH = window.innerHeight, dpr = window.devicePixelRatio || 1): number {
  const base = Math.min(dpr, MAX_DPR);
  if (settings.renderQuality === 'sharp') return base;
  const budget = BUDGET[settings.renderQuality === 'fast' ? 'fast' : 'auto'];
  const steps = [base];
  for (let k = Math.floor(base); k >= 1; k--) if (k < base) steps.push(k);
  steps.push(1 / 2, 1 / 3);
  for (const s of steps) if (cssW * s * cssH * s <= budget) return s;
  return steps[steps.length - 1];
}

let game: Phaser.Game | null = null;

/** Size the canvas backing store in render pixels and display it at CSS size. */
export function applySize(): void {
  if (!game) return;
  const s = renderScale();
  game.scale.resize(Math.max(1, Math.round(window.innerWidth * s)), Math.max(1, Math.round(window.innerHeight * s)));
  const canvas = game.canvas;
  if (canvas) {
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }
}

export function initDisplay(g: Phaser.Game): void {
  game = g;
  window.addEventListener('resize', applySize);
  // dragging the window to a monitor with a different DPR fires a resolution media-query change
  const watchDpr = (): void => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => { applySize(); watchDpr(); }, { once: true });
  };
  watchDpr();
  g.events.once('ready', applySize);
}
