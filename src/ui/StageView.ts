import Phaser from 'phaser';
import { BACKDROPS } from './BackgroundView';
import { MASS_HEAD, MASS_OVER, stageMass } from '../art/stageMass';
import type { World } from '../engine/world';

interface PlatView {
  index: number;
  parts: { obj: Phaser.GameObjects.TileSprite | Phaser.GameObjects.Image; dx: number; dy: number }[];
}

/** Draws the stage platforms from the sim's Platform objects (moving ones interpolated). Art pixel = 0.5 world units. */
export class StageView {
  private readonly views: PlatView[] = [];

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, private readonly world: World) {
    const theme = world.stage.background.theme;
    const tint = (BACKDROPS[theme ?? 'skyline'] ?? BACKDROPS.skyline).tiles;
    const sfx = theme === 'storm' || theme === 'dawn' ? `-${theme}` : ''; // themed tile sets exist for these stages
    const tex = (key: string): string => `${key}${sfx}`;
    world.platforms.forEach((p, index) => {
      const parts: PlatView['parts'] = [];
      const add = (key: string, w: number, h: number, dy: number): void => {
        const t = scene.add.tileSprite(p.x, p.y + dy, w, h, key).setOrigin(0, 0).setTileScale(0.5, 0.5);
        t.setTint(sfx ? 0xffffff : tint);
        layer.add(t);
        parts.push({ obj: t, dx: 0, dy });
      };
      if (p.kind === 'solid') {
        // one designed structure per solid platform (cap, facade, underside), generated once per stage
        const key = `mass:${world.stage.id}:${index}:${p.w}x${p.h}`;
        if (!scene.textures.exists(key)) scene.textures.addCanvas(key, stageMass(theme, p.w, p.h, index + 1));
        const dx = -MASS_OVER / 2;
        const dy = -MASS_HEAD / 2;
        const img = scene.add.image(p.x + dx, p.y + dy, key).setOrigin(0, 0).setScale(0.5);
        layer.add(img);
        parts.push({ obj: img, dx, dy });
      } else {
        add(tex(p.moving ? 'tile-move' : 'tile-pass'), p.w, p.h, 0);
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
