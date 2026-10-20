import Phaser from 'phaser';
import type { Fighter } from '../engine/fighter';
import type { FighterView } from './FighterView';
import { PIXEL_FONT } from '../art/pixelFont';
import { drawPortShape, portOfColor } from './menuKit';
import { settings } from '../settings';
import { fastShapes } from './fastShapes';

/** The damage readout's colour, as on the HUD plate: white -> yellow -> orange -> red as damage climbs. */
export function damageTint(damage: number): number {
  const d = Math.min(damage / 160, 1);
  const g = Math.round(255 - 150 * Math.min(1, d * 1.6) - 60 * Math.max(0, d - 0.6));
  const b = Math.round(255 - 255 * Math.min(1, d * 3));
  return (255 << 16) | (Math.max(30, g) << 8) | Math.max(30, b);
}

/**
 * Off-screen indicators: when a fighter leaves the camera (launched high, recovering from far below) a bubble in their colour
 * sits on the screen edge, points at them and shows a live miniature, shrinking the further away they are.
 */
export class OffscreenBubbles {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly minis: Phaser.GameObjects.Sprite[];
  /** Circle masks so the miniature stays inside its bubble. */
  private readonly masks: Phaser.GameObjects.Graphics[];
  /** The circle each mask holds now ([x, y, r], NaN = none yet): a mask is only redrawn when its bubble moves or resizes. */
  private readonly maskAt: Float64Array;
  /** Each bubble's damage readout (drawn over the miniature) and the plate behind it. */
  private readonly pcts: Phaser.GameObjects.BitmapText[];
  private readonly front: Phaser.GameObjects.Graphics;
  private readonly ports: number[];

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly fighters: Fighter[],
    private readonly views: FighterView[],
    private readonly colors: number[],
  ) {
    this.g = fastShapes(scene.add.graphics());
    layer.add(this.g);
    this.masks = fighters.map(() => fastShapes(scene.make.graphics({}, false)));
    this.maskAt = new Float64Array(fighters.length * 3).fill(NaN);
    this.minis = fighters.map((f) => {
      const s = scene.add.sprite(0, 0, views[f.id].sprite.texture.key, 0).setOrigin(0.5, 1).setVisible(false);
      s.setMask(this.masks[f.id].createGeometryMask());
      layer.add(s);
      return s;
    });
    this.front = fastShapes(scene.add.graphics());
    layer.add(this.front);
    this.pcts = fighters.map(() => {
      const t = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0.5).setVisible(false);
      layer.add(t);
      return t;
    });
    this.ports = colors.map((c, i) => {
      const p = portOfColor(c);
      return p >= 0 ? p : i % 4;
    });
  }

  update(view: Phaser.Geom.Rectangle, sw: number, sh: number, u: number, hudTop: number): void {
    const g = this.g;
    g.clear();
    const fg = this.front.clear();
    for (const f of this.fighters) {
      const mini = this.minis[f.id];
      const v = this.views[f.id];
      const wx = v.x;
      const wy = v.y - (f.h * f.sizeMul) / 2;
      const sx = ((wx - view.x) / Math.max(1, view.width)) * sw;
      const sy = ((wy - view.y) / Math.max(1, view.height)) * sh;
      const margin = 6 * u;
      const inside = sx > -margin && sx < sw + margin && sy > -margin && sy < sh + margin;
      const pct = this.pcts[f.id];
      if (f.state === 'ko' || inside) {
        mini.setVisible(false);
        pct.setVisible(false);
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
      const at = this.maskAt;
      const mi = f.id * 3;
      if (at[mi] !== bx || at[mi + 1] !== by || at[mi + 2] !== R) {
        at[mi] = bx;
        at[mi + 1] = by;
        at[mi + 2] = R;
        this.masks[f.id].clear().fillStyle(0xffffff, 1).fillCircle(bx, by, R - 1);
      }
      const sp = v.sprite;
      const q = (R * 1.2) / Math.max(1, f.h * f.sizeMul);
      mini
        .setTexture(sp.texture.key, sp.frame.name)
        .setFlipX(sp.flipX)
        .setScale(sp.scaleX * q, sp.scaleY * q)
        .setPosition(bx, by + R * 0.6)
        .setTint(0xffffff)
        .setVisible(true);
      // the fighter's damage on a band across the bubble's lower edge (how worried to be about them)
      const ts = Math.max(1, Math.round(R / (11 * u))) * u;
      pct.setText(`${Math.floor(f.damage)}%`).setScale(ts).setTint(damageTint(f.damage)).setPosition(bx, by + R * 0.62).setVisible(true);
      fg.fillStyle(0x0c0a1c, 0.8).fillRect(bx - pct.displayWidth / 2 - 2 * u, by + R * 0.62 - pct.displayHeight / 2 - u, pct.displayWidth + 4 * u, pct.displayHeight + 2 * u);
      if (settings.portShapes) drawPortShape(fg, this.ports[f.id], bx - R * 0.72, by - R * 0.72, 2.5 * u, col, 1, u);
    }
  }
}
