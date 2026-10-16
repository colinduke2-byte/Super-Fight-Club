import Phaser from 'phaser';
import type { StageLight } from '../stages/lighting';

/** Scene data key under which StageView publishes the stage's light for the fighters (see StageLight). */
export const STAGE_LIGHT_KEY = 'stageLight';

/** World units the rim copies are pushed toward the light: a tight bright edge and a softer, wider one. */
const RIM = [
  [1, 0.8],
  [2, 0.28],
] as const;

/**
 * A rim of stage light on a fighter's edge: two additive, flat-coloured copies of the body sprite drawn just BEHIND it and
 * nudged toward the light, so only a thin sliver of colour shows round the silhouette on the lit side. Self-contained: it
 * follows the body sprite every frame on the scene's pre-render, so the owner only creates it (before adding the body to
 * the layer) and destroys it.
 */
export class RimLight {
  private readonly copies: Phaser.GameObjects.Sprite[] = [];
  private readonly dx: number;
  private readonly dy: number;
  private readonly strength: number;
  private readonly sync = (): void => this.follow();

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly body: Phaser.GameObjects.Sprite,
    texture: string,
  ) {
    const light = scene.data?.get(STAGE_LIGHT_KEY) as StageLight | undefined;
    const len = light ? Math.hypot(light.dir[0], light.dir[1]) || 1 : 1;
    this.dx = light ? light.dir[0] / len : 0;
    this.dy = light ? light.dir[1] / len : 0;
    this.strength = light ? Math.max(0, Math.min(1, light.strength ?? 0.5)) : 0;
    if (!light || this.strength <= 0) return;
    for (let i = 0; i < RIM.length; i++) {
      const c = scene.add.sprite(0, 0, texture, 0).setBlendMode(Phaser.BlendModes.ADD).setTintFill(light.rim).setVisible(false);
      layer.add(c);
      this.copies.push(c);
    }
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.sync);
  }

  private follow(): void {
    const s = this.body;
    const on = s.active && s.visible && s.alpha > 0.5 && !!s.frame;
    for (let i = 0; i < this.copies.length; i++) {
      const c = this.copies[i];
      if (!on) {
        c.setVisible(false);
        continue;
      }
      const off = RIM[i][0];
      // the frame only changes with the pose: skip the texture-manager lookup when it is already the body's
      if (c.frame !== s.frame) c.setTexture(s.texture.key, s.frame.name);
      c.setOrigin(s.originX, s.originY)
        .setPosition(s.x + this.dx * off, s.y + this.dy * off)
        .setFlipX(s.flipX)
        .setScale(s.scaleX, s.scaleY)
        .setRotation(s.rotation)
        .setAlpha(RIM[i][1] * this.strength * s.alpha)
        .setVisible(true);
    }
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.sync);
    for (const c of this.copies) c.destroy();
    this.copies.length = 0;
  }
}
