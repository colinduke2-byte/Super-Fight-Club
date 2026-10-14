import Phaser from 'phaser';
import type { Fighter } from '../engine/fighter';
import type { FighterView } from './FighterView';

/**
 * Off-screen indicators: when a fighter leaves the camera (launched high, recovering from far below) a bubble in their colour
 * sits on the screen edge, points at them and shows a live miniature, shrinking the further away they are.
 */
export class OffscreenBubbles {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly minis: Phaser.GameObjects.Sprite[];
  /** Circle masks so the miniature stays inside its bubble. */
  private readonly masks: Phaser.GameObjects.Graphics[];

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly fighters: Fighter[],
    private readonly views: FighterView[],
    private readonly colors: number[],
  ) {
    this.g = scene.add.graphics();
    layer.add(this.g);
    this.masks = fighters.map(() => scene.make.graphics({}, false));
    this.minis = fighters.map((f) => {
      const s = scene.add.sprite(0, 0, views[f.id].sprite.texture.key, 0).setOrigin(0.5, 1).setVisible(false);
      s.setMask(this.masks[f.id].createGeometryMask());
      layer.add(s);
      return s;
    });
  }

  update(view: Phaser.Geom.Rectangle, sw: number, sh: number, u: number, hudTop: number): void {
    const g = this.g;
    g.clear();
    for (const f of this.fighters) {
      const mini = this.minis[f.id];
      const v = this.views[f.id];
      const wx = v.x;
      const wy = v.y - (f.h * f.sizeMul) / 2;
      const sx = ((wx - view.x) / Math.max(1, view.width)) * sw;
      const sy = ((wy - view.y) / Math.max(1, view.height)) * sh;
      const margin = 6 * u;
      const inside = sx > -margin && sx < sw + margin && sy > -margin && sy < sh + margin;
      if (f.state === 'ko' || inside) {
        mini.setVisible(false);
        continue;
      }
      const far = Math.hypot(Math.max(0, -sx, sx - sw), Math.max(0, -sy, sy - sh)) / Math.max(sw, sh);
      const R = 22 * u * Math.max(0.6, 1 - far * 0.8);
      // keep the whole bubble, pointer tip included (7u past the rim), on screen and clear of the HUD plates
      const edge = 8 * u;
      const bottom = Math.min(sh, hudTop) - R - edge;
      const bx = Phaser.Math.Clamp(sx, R + edge, sw - R - edge);
      const by = Phaser.Math.Clamp(sy, R + edge, Math.max(R + edge, bottom));
      const col = this.colors[f.id];
      // pointer towards the fighter
      const a = Math.atan2(sy - by, sx - bx);
      const tip = R + 7 * u;
      g.fillStyle(col, 1).fillTriangle(bx + Math.cos(a) * tip, by + Math.sin(a) * tip, bx + Math.cos(a + 0.5) * R, by + Math.sin(a + 0.5) * R, bx + Math.cos(a - 0.5) * R, by + Math.sin(a - 0.5) * R);
      g.fillStyle(0x0c0a1c, 0.85).fillCircle(bx, by, R);
      g.lineStyle(Math.max(2, u), col, 1).strokeCircle(bx, by, R);
      this.masks[f.id].clear().fillStyle(0xffffff, 1).fillCircle(bx, by, R - 1);
      const sp = v.sprite;
      const q = (R * 1.2) / Math.max(1, f.h * f.sizeMul);
      mini
        .setTexture(sp.texture.key, sp.frame.name)
        .setFlipX(sp.flipX)
        .setScale(sp.scaleX * q, sp.scaleY * q)
        .setPosition(bx, by + R * 0.6)
        .setTint(0xffffff)
        .setVisible(true);
    }
  }
}
