import Phaser from 'phaser';
import { MASS_HEAD, MASS_OVER, PLAT_HEAD } from '../art/stageMass';
import { ensureStageArtNow, glowPixels, stageArtEmissive, stageArtKey, type Emissive } from '../art/stageArt';
import { addCanvasTexture, context2d, holdTexture } from '../art/canvasTexture';
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

/** The glow overlay of a piece as a canvas (see glowPixels). */
function glowCanvas(e: Emissive): HTMLCanvasElement | null {
  const W = e.width;
  const H = e.height;
  const out = glowPixels(e);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = context2d(c);
  if (!g) return null;
  g.putImageData(new ImageData(out, W, H), 0, 0);
  return c;
}

/**
 * The emissive parts of a platform texture (lamps, lit windows, runes, crystals: bright, saturated pixels) on a transparent
 * texture, with a two-pixel halo around each in its own colour, for an additive overlay. Made from the emissive pixels
 * found when the piece was built (no readback of the art), held by the match and removed after it.
 */
function glowTexture(scene: Phaser.Scene, key: string): string | null {
  const e = stageArtEmissive(key);
  if (!e) return null;
  const gk = `${key}:glow`;
  if (!scene.textures.exists(gk)) {
    const c = glowCanvas(e);
    if (!c) return null;
    addCanvasTexture(scene, gk, c, () => glowCanvas(e));
  }
  holdTexture(scene, gk);
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
    ensureStageArtNow(scene, world.stage); // usually built in the background already (Stage Select, see ensureStageArt)
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
        const tw = scene.textures.get(gk).source[0].width;
        const th = scene.textures.get(gk).source[0].height;
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
