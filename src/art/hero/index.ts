import type { PlaceholderLook } from '../../engine/types';
import { drawAgni } from './agni';
import { drawBrick } from './brick';
import { drawGizmo } from './gizmo';
import { drawHalcyon } from './halcyon';
import { drawNova } from './nova';
import { drawOverseer } from './overseer';
import { drawVex } from './vex';
import { Raster } from './raster';
import { skeleton, type HeroPose, type Skel } from './skeleton';

type Ctx = CanvasRenderingContext2D;

/** Looks flagged `art: 'hi'` use a full-resolution renderer chosen by their helmet style; the others use the 64px template upscaled. */
export function hasHeroArt(look: PlaceholderLook): boolean {
  return look.art === 'hi' && look.build.helmet in DRAWERS;
}

const DRAWERS: Partial<Record<PlaceholderLook['build']['helmet'], (r: Raster, k: Skel, look: PlaceholderLook) => void>> = {
  visor: drawBrick,
  hood: drawVex,
  pointed: drawNova,
  dome: drawGizmo,
  band: drawAgni,
  winged: drawHalcyon,
  monolith: drawOverseer,
};

/** Render one frame of character `id` into `ctx` (a `size` x `size` canvas), lit but not yet outlined. */
export function renderHero(ctx: Ctx, W: number, H: number, look: PlaceholderLook, pose: HeroPose, phase: number): void {
  let r = new Raster(W, H);
  const lying = !!(pose as HeroPose & { lying?: boolean }).lying;
  const stand: HeroPose = lying ? { bob: 0, crouch: 0, lean: 0, frontFoot: [8, 3], backFoot: [-8, 0], frontHand: [6, -2], backHand: [-8, -2] } : pose;
  const k = skeleton(look, stand, W, H, phase);
  DRAWERS[look.build.helmet]?.(r, k, look);
  // knocked down: the same body, laid on its back
  if (lying) r = r.lyingDown(H - 4, W / 2 - 5 * (H / 64));
  const img = ctx.createImageData(W, H);
  r.shade(img.data);
  ctx.putImageData(img, 0, 0);
}
