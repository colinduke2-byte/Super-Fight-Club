import Phaser from 'phaser';
import { MASS_HEAD, MASS_OVER, PLAT_HEAD } from '../art/stageMass';
import { ensureStageArt, stageArtKey } from '../art/stageArt';
import type { World } from '../engine/world';

interface PlatView {
  index: number;
  parts: { obj: Phaser.GameObjects.Image; dx: number; dy: number }[];
}

/** Draws the stage platforms from the sim's Platform objects (moving ones interpolated) with generated art. Art pixel = 0.5 world units. */
export class StageView {
  private readonly views: PlatView[] = [];

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, private readonly world: World) {
    ensureStageArt(scene, world.stage); // usually prebuilt in the background since boot
    world.platforms.forEach((p, index) => {
      const parts: PlatView['parts'] = [];
      if (p.kind === 'solid') {
        // one designed structure per solid platform (cap, facade, underside), generated once per stage
        const key = stageArtKey(world.stage, index);
        const dx = -MASS_OVER / 2;
        const dy = -MASS_HEAD / 2;
        const img = scene.add.image(p.x + dx, p.y + dy, key).setOrigin(0, 0).setScale(0.5);
        layer.add(img);
        parts.push({ obj: img, dx, dy });
      } else {
        const key = stageArtKey(world.stage, index);
        const dy = -PLAT_HEAD / 2;
        const img = scene.add.image(p.x, p.y + dy, key).setOrigin(0, 0).setScale(0.5);
        layer.add(img);
        parts.push({ obj: img, dx: 0, dy });
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
  }
}
