import type { PlaceholderLook } from '../../engine/types';
import { drawAgni } from './agni';
import { drawBrick } from './brick';
import { drawGizmo } from './gizmo';
import { drawHalcyon } from './halcyon';
import { drawNova } from './nova';
import { drawOverseer } from './overseer';
import { drawRiptide } from './riptide';
import { drawObelisk } from './obelisk';
import { drawRime } from './rime';
import { drawHavoc } from './havoc';
import { drawVex } from './vex';
import { Raster } from './raster';
import { skeleton, type HeroPose, type Skel } from './skeleton';
import { stylePose, type Pose } from '../poses';

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
  fin: drawRiptide,
  geode: drawObelisk,
  kasa: drawRime,
  goggles: drawHavoc,
};

/** The same frame as pixels (lit, not yet outlined), without a canvas round trip: the sheet builder finishes it in place. */
export function renderHeroImage(W: number, H: number, look: PlaceholderLook, pose: HeroPose, phase: number): ImageData {
  let r = new Raster(W, H);
  // the fighter's own motion style (idle, gaits, double jump, results) for rows that have one
  const posed = stylePose(pose as Pose, look.build.helmet) as HeroPose & { lying?: boolean; ph?: number };
  const lying = !!posed.lying;
  // knocked down: drawn upright in the sprawl pose with gravity along the body's back, then laid on its back, so hair,
  // flames and cloth fall (or rise) the right way once it is down
  const stand: HeroPose = lying ? { ...posed, bob: 0, crouch: 0, lean: 0, laid: true, grav: posed.grav ?? [-1, 0] } : posed;
  // attack rows carry their own sway phase (Pose.ph), so cloth and hair move on smoothly through the action
  const k = skeleton(look, stand, W, H, posed.ph ?? phase);
  DRAWERS[look.build.helmet]?.(r, k, look);
  // (the boss keeps its own lying placement)
  if (lying) r = r.lyingDown(H - 4, W / 2 - 5 * (H / 64), look.build.helmet === 'monolith' ? undefined : k.torso.x + 2);
  const img = new ImageData(W, H);
  r.shade(img.data);
  return img;
}
