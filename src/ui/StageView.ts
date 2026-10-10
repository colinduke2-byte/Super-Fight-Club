import Phaser from 'phaser';
import { BACKDROPS } from './BackgroundView';
import type { World } from '../engine/world';

interface PlatView {
  index: number;
  parts: { obj: Phaser.GameObjects.TileSprite; dy: number }[];
}

/** Draws the stage platforms from the sim's Platform objects (moving ones interpolated). Art pixel = 0.5 world units. */
export class StageView {
  private readonly views: PlatView[] = [];

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, private readonly world: World) {
    const tint = (BACKDROPS[world.stage.background.theme ?? 'skyline'] ?? BACKDROPS.skyline).tiles;
    world.platforms.forEach((p, index) => {
      const parts: PlatView['parts'] = [];
      const add = (key: string, w: number, h: number, dy: number): void => {
        const t = scene.add.tileSprite(p.x, p.y + dy, w, h, key).setOrigin(0, 0).setTileScale(0.5, 0.5);
        t.setTint(tint);
        layer.add(t);
        parts.push({ obj: t, dy });
      };
      if (p.kind === 'solid') {
        if (p.ledges) {
          // rocky underside hanging below the main platform
          const under = scene.add.image(p.x + p.w / 2, p.y + p.h - 3, 'stage-under').setOrigin(0.5, 0);
          under.setScale((p.w / 320) * 0.5).setTint(tint);
          layer.add(under);
        }
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
