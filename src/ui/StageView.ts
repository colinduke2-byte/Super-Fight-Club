import Phaser from 'phaser';
import type { World } from '../engine/world';

interface PlatView {
  index: number;
  parts: { obj: Phaser.GameObjects.TileSprite; dy: number }[];
}

/** Draws the stage platforms from the sim's Platform objects (moving ones interpolated). */
export class StageView {
  private readonly views: PlatView[] = [];

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, private readonly world: World) {
    world.platforms.forEach((p, index) => {
      const parts: PlatView['parts'] = [];
      const add = (key: string, w: number, h: number, dy: number): void => {
        const t = scene.add.tileSprite(p.x, p.y + dy, w, h, key).setOrigin(0, 0);
        layer.add(t);
        parts.push({ obj: t, dy });
      };
      if (p.kind === 'solid') {
        add('tile-stone', p.w, p.h - 6, 6);
        add('tile-cap', p.w, 6, 0);
      } else {
        add(p.moving ? 'tile-move' : 'tile-pass', p.w, p.h, 0);
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
      for (const part of v.parts) part.obj.setPosition(x, y + part.dy);
    }
  }
}
