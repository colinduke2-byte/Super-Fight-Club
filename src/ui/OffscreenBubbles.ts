import Phaser from 'phaser';
import type { Fighter } from '../engine/fighter';
import type { FighterView } from './FighterView';
import { PIXEL_FONT } from '../art/pixelFont';
import { drawPortShape, portOfColor } from './menuKit';
import { settings } from '../settings';
import { fastShapes } from './fastShapes';

/**
 * The damage colour ramp shared by the HUD plates, the off-screen bubbles and the name tags: white at 0, cream, gold,
 * orange, red as KO range opens (~120%), then crimson and a deep blood red past 200% (still bright enough to read on the
 * dark plates). One entry per whole percent, built once.
 */
const RAMP_STOPS: [number, number][] = [
  [0, 0xffffff],
  [25, 0xfff4c0],
  [55, 0xffd448],
  [85, 0xff9a2a],
  [115, 0xff5228],
  [150, 0xf0202c],
  [200, 0xc8102e],
  [300, 0xa80c2c],
];
const RAMP = new Uint32Array(301);
for (let d = 0; d <= 300; d++) {
  let i = 0;
  while (i < RAMP_STOPS.length - 2 && d > RAMP_STOPS[i + 1][0]) i++;
  const [d0, c0] = RAMP_STOPS[i];
  const [d1, c1] = RAMP_STOPS[i + 1];
  const t = Math.min(1, Math.max(0, (d - d0) / (d1 - d0)));
  const ch = (s: number): number => Math.round(((c0 >> s) & 255) + (((c1 >> s) & 255) - ((c0 >> s) & 255)) * t);
  RAMP[d] = (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** The damage readout's colour (see RAMP_STOPS). */
export function damageTint(damage: number): number {
  return RAMP[Math.min(300, Math.max(0, Math.floor(damage)))];
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
  /** The damage each tag shows (its text is only rebuilt when it changes). */
  private readonly shownDmg: Int32Array;

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
    this.shownDmg = new Int32Array(fighters.length).fill(-1);
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
      const R = Math.round(22 * u * Math.max(0.6, 1 - far * 0.8));
      // the damage tag: a small plate hung under the bubble (over it when the fighter is below the screen), so the miniature stays
      // clear; whole-pixel text at the HUD's text scale
      const shown = Math.floor(f.damage);
      if (this.shownDmg[f.id] !== shown) {
        this.shownDmg[f.id] = shown;
        pct.setText(`${shown}%`);
      }
      const ts = Math.max(1, Math.floor(u));
      pct.setScale(ts);
      // with PORT SHAPES on, the port's shape leads the tag (inside the plate, clear of the bubble's pointer)
      const shapeW = settings.portShapes ? 7 * ts : 0;
      const tw = pct.width + 4 * ts + shapeW;
      const th = pct.height + 2 * ts;
      const below = sy < sh; // the fighter is off the top or a side: the tag hangs under the bubble
      // keep the whole bubble, pointer tip (7u past the rim) and tag on screen and clear of the HUD plates
      const edge = 8 * u;
      const halfW = Math.max(R, tw / 2);
      const bottom = Math.min(sh, hudTop) - R - edge - (below ? th : 0);
      const bx = Math.round(Phaser.Math.Clamp(sx, halfW + edge, sw - halfW - edge));
      const by = Math.round(Phaser.Math.Clamp(sy, R + edge + (below ? 0 : th), Math.max(R + edge, bottom)));
      const col = this.colors[f.id];
      // pointer towards the fighter (outlined so it reads over bright skies)
      const a = Math.atan2(sy - by, sx - bx);
      const tip = R + 7 * u;
      const tx = bx + Math.cos(a) * tip;
      const ty = by + Math.sin(a) * tip;
      g.fillStyle(0x0c0a1c, 0.9).fillTriangle(bx + Math.cos(a) * (tip + u), by + Math.sin(a) * (tip + u), bx + Math.cos(a + 0.55) * R, by + Math.sin(a + 0.55) * R, bx + Math.cos(a - 0.55) * R, by + Math.sin(a - 0.55) * R);
      g.fillStyle(col, 1).fillTriangle(tx, ty, bx + Math.cos(a + 0.5) * R, by + Math.sin(a + 0.5) * R, bx + Math.cos(a - 0.5) * R, by + Math.sin(a - 0.5) * R);
      g.fillStyle(0x0c0a1c, 0.85).fillCircle(bx, by, R);
      g.lineStyle(u, 0x0c0a1c, 0.9).strokeCircle(bx, by, R + Math.max(2, u));
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
      // the tag overlaps the rim by a pixel or two, a plate edged in the port colour (how worried to be about them)
      const tagY = below ? by + R + th / 2 - ts : by - R - th / 2 + ts;
      const x0 = Math.round(bx - tw / 2);
      const y0 = Math.round(tagY - th / 2);
      fg.fillStyle(col, 1).fillRect(x0 - ts, y0 - ts, tw + 2 * ts, th + 2 * ts);
      fg.fillStyle(0x0c0a1c, 1).fillRect(x0, y0, tw, th);
      pct.setTint(damageTint(f.damage)).setPosition(Math.round(bx + shapeW / 2), Math.round(tagY)).setVisible(true);
      if (shapeW) drawPortShape(fg, this.ports[f.id], x0 + 2 * ts + 2.5 * ts, Math.round(tagY), 2.5 * ts, col, 1, ts);
    }
  }
}
