import Phaser from 'phaser';
import { MASS_HEAD, MASS_OVER, PLAT_HEAD } from '../art/stageMass';
import { ensureStageArt, stageArtKey } from '../art/stageArt';
import { addCanvasTexture } from '../art/canvasTexture';
import type { World } from '../engine/world';
import { stageLight } from '../stages/lighting';
import { STAGE_LIGHT_KEY } from './RimLight';

interface PlatView {
  index: number;
  parts: { obj: Phaser.GameObjects.Image; dx: number; dy: number }[];
}

/** One vertical slice of a platform's glow overlay, breathing on its own phase so light ripples along the structure. */
interface GlowStrip {
  obj: Phaser.GameObjects.Image;
  phase: number;
}

/** Themes whose platforms have no light sources of their own. */
const NO_GLOW = new Set(['dawn']);

/** Glow overlays already derived from a platform texture (null: the texture has nothing that glows). */
const glowCache = new Map<string, string | null>();

/**
 * The emissive parts of a platform texture (lamps, lit windows, runes, crystals: bright, saturated pixels) on a transparent
 * canvas, with a two-pixel halo around each in its own colour, for an additive overlay. Built once per texture.
 */
function glowTexture(scene: Phaser.Scene, key: string): string | null {
  const gk = `${key}:glow`;
  if (glowCache.has(gk) && (glowCache.get(gk) === null || scene.textures.exists(gk))) return glowCache.get(gk)!;
  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  const ctx = typeof src.getContext === 'function' ? src.getContext('2d') : null;
  if (!ctx) return null;
  const W = src.width;
  const H = src.height;
  const d = ctx.getImageData(0, 0, W, H).data;
  const out = new Uint8ClampedArray(W * H * 4);
  let count = 0;
  const HALO = [255, 120, 48];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (d[o + 3] < 200) continue;
      const mx = Math.max(d[o], d[o + 1], d[o + 2]);
      const mn = Math.min(d[o], d[o + 1], d[o + 2]);
      if (mx < 190 || mx - mn < 100) continue;
      count++;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const a = HALO[Math.max(Math.abs(dx), Math.abs(dy))];
          const q = (yy * W + xx) * 4;
          if (out[q + 3] >= a) continue;
          out[q] = d[o];
          out[q + 1] = d[o + 1];
          out[q + 2] = d[o + 2];
          out[q + 3] = a;
        }
      }
    }
  }
  if (count === 0) {
    glowCache.set(gk, null);
    return null;
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  img.data.set(out);
  g.putImageData(img, 0, 0);
  if (scene.textures.exists(gk)) scene.textures.remove(gk);
  addCanvasTexture(scene, gk, c);
  glowCache.set(gk, gk);
  return gk;
}

/** Draws the stage platforms from the sim's Platform objects (moving ones interpolated) with generated art. Art pixel = 0.5 world units. */
export class StageView {
  private readonly views: PlatView[] = [];
  private readonly glows: GlowStrip[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly world: World,
  ) {
    ensureStageArt(scene, world.stage); // usually prebuilt in the background since boot
    scene.data.set(STAGE_LIGHT_KEY, stageLight(world.stage.background)); // the fighters' rim light (RimLight) reads it
    world.platforms.forEach((p, index) => {
      const parts: PlatView['parts'] = [];
      const key = stageArtKey(world.stage, index);
      // one designed structure per solid platform (cap, facade, underside), generated once per stage
      const dx = p.kind === 'solid' ? -MASS_OVER / 2 : 0;
      const dy = p.kind === 'solid' ? -MASS_HEAD / 2 : -PLAT_HEAD / 2;
      const img = scene.add.image(p.x + dx, p.y + dy, key).setOrigin(0, 0).setScale(0.5);
      layer.add(img);
      parts.push({ obj: img, dx, dy });
      // its lamps, windows and runes glow and breathe, a ripple of light running along the structure (not in the sunlit
      // marble of the dawn stages, whose gold trim is metal catching the sun rather than a light source)
      const gk = NO_GLOW.has(world.stage.background.theme ?? '') ? null : glowTexture(scene, key);
      if (gk) {
        const tw = scene.textures.get(gk).getSourceImage().width;
        const th = scene.textures.get(gk).getSourceImage().height;
        const strips = Math.max(1, Math.round(tw / 48));
        for (let i = 0; i < strips; i++) {
          const x0 = Math.floor((i * tw) / strips);
          const x1 = Math.floor(((i + 1) * tw) / strips);
          const gl = scene.add.image(p.x + dx, p.y + dy, gk).setOrigin(0, 0).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD).setCrop(x0, 0, x1 - x0, th).setAlpha(0);
          layer.add(gl);
          parts.push({ obj: gl, dx, dy });
          this.glows.push({ obj: gl, phase: i * 0.55 + index * 1.3 });
        }
      }
      this.views.push({ index, parts });
    });
  }

  update(alpha: number): void {
    for (const v of this.views) {
      const p = this.world.platforms[v.index];
      if (!p.moving) continue;
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const y = p.prevY + (p.y - p.prevY) * alpha;
      for (const part of v.parts) part.obj.setPosition(x + part.dx, y + part.dy);
    }
    const t = this.scene.time.now / 1000;
    for (const g of this.glows) g.obj.setAlpha(0.16 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.4 - g.phase)));
  }
}
