import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import type { Fighter } from '../engine/fighter';
import type { FighterView } from './FighterView';

/** "P1" / "CPU" tags with a pointer above each fighter's head, in their colour, drawn at a constant screen size. */
export class PlayerTags {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.BitmapText[];
  /** x, y, half-width of the tags already drawn this frame (flat, reused every frame). */
  private readonly placed: number[] = [];

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly fighters: Fighter[],
    private readonly views: FighterView[],
    labels: string[],
    private readonly colors: number[],
  ) {
    this.g = scene.add.graphics();
    layer.add(this.g);
    this.texts = labels.map((l, i) => {
      const t = scene.add.bitmapText(0, 0, PIXEL_FONT, l).setOrigin(0.5, 1).setTint(colors[i]);
      layer.add(t);
      return t;
    });
  }

  update(view: Phaser.Geom.Rectangle, sw: number, sh: number, u: number): void {
    const g = this.g;
    g.clear();
    const placed = this.placed;
    placed.length = 0;
    for (const f of this.fighters) {
      const t = this.texts[f.id];
      const v = this.views[f.id];
      const sx = ((v.x - view.x) / Math.max(1, view.width)) * sw;
      let sy = ((v.y - f.h * f.sizeMul - (f.data.counter ? 15 : 7) - view.y) / Math.max(1, view.height)) * sh;
      // stack tags that would overlap (fighters standing close together)
      const hw = (t.width || 20 * u) / 2 + 3 * u;
      for (let k = 0; k < placed.length; k += 3) {
        const px = placed[k];
        const py = placed[k + 1];
        const phw = placed[k + 2];
        if (Math.abs(px - sx) < hw + phw && Math.abs(py - sy) < 11 * u) {
          sy = py - 11 * u;
          k = -3; // re-check against everything with the new height
        }
      }
      placed.push(sx, sy, hw);
      const on = f.state !== 'ko' && sx > 0 && sx < sw && sy > 8 * u && sy < sh;
      t.setVisible(on);
      if (!on) continue;
      const a = f.invuln > 0 ? 0.6 : 0.95;
      t.setScale(u * 1.1).setPosition(sx, sy - 4 * u).setAlpha(a);
      g.fillStyle(0x0c0a1c, 0.55 * a).fillRect(sx - t.width / 2 - 2 * u, sy - 4 * u - t.height - 1.5 * u, t.width + 4 * u, t.height + 2.5 * u);
      g.fillStyle(this.colors[f.id], a).fillTriangle(sx - 3 * u, sy - 3 * u, sx + 3 * u, sy - 3 * u, sx, sy);
    }
  }
}
