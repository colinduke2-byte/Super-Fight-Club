import Phaser from 'phaser';
import { settings } from '../settings';

interface Blast {
  x: number;
  y: number;
  /** Unit direction from the screen edge towards the middle. */
  dx: number;
  dy: number;
  color: number;
  t: number;
}

const LIFE = 0.85;

/**
 * The KO blast: a cone of light in the fighter's colour that erupts from the screen edge where they left the stage, pointing back
 * into the arena. Drawn in screen space, so it reads even though the blast zone itself is far off camera.
 */
export class KoBlast {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly blasts: Blast[] = [];

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.g = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    layer.add(this.g);
  }

  /** `sx, sy`: the KO position projected to the screen (any value; it is pushed onto the nearest edge). */
  add(sx: number, sy: number, w: number, h: number, color: number): void {
    const cx = w / 2;
    const cy = h / 2;
    let dx = sx - cx;
    let dy = sy - cy;
    if (dx === 0 && dy === 0) dy = 1;
    // push the point out along its ray until it meets the screen border
    const k = Math.min(dx !== 0 ? Math.abs(cx / dx) : Infinity, dy !== 0 ? Math.abs(cy / dy) : Infinity);
    const ex = cx + dx * k;
    const ey = cy + dy * k;
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    this.blasts.push({ x: ex, y: ey, dx: -dx, dy: -dy, color, t: 0 });
  }

  update(dt: number, w: number, h: number): void {
    const g = this.g;
    g.clear();
    const soft = settings.reduceFlashes ? 0.4 : 1;
    const size = Math.min(w, h);
    for (const b of this.blasts) {
      b.t += dt;
      const t = b.t / LIFE;
      if (t >= 1) continue;
      const grow = 1 - Math.pow(1 - Math.min(1, b.t / 0.12), 3); // shoots out fast
      const fade = t < 0.25 ? 1 : 1 - (t - 0.25) / 0.75;
      const L = size * 0.55 * grow;
      const W = size * 0.2 * (1 - t * 0.6);
      const px = -b.dy;
      const py = b.dx;
      const cone = (len: number, wid: number, col: number, a: number): void => {
        g.fillStyle(col, a * fade * soft);
        g.fillTriangle(b.x + px * wid - b.dx * 20, b.y + py * wid - b.dy * 20, b.x - px * wid - b.dx * 20, b.y - py * wid - b.dy * 20, b.x + b.dx * len, b.y + b.dy * len);
      };
      cone(L, W, b.color, 0.55);
      cone(L * 0.8, W * 0.55, b.color, 0.6);
      cone(L * 0.62, W * 0.25, 0xffffff, 0.85);
      // flare at the edge and streaks fanning out
      g.fillStyle(0xffffff, 0.7 * fade * soft).fillCircle(b.x, b.y, W * 0.6 * (1 - t));
      g.lineStyle(Math.max(1, size / 220), 0xffffff, 0.6 * fade * soft);
      for (let i = -3; i <= 3; i++) {
        const a = Math.atan2(b.dy, b.dx) + i * 0.16;
        const r0 = L * (0.3 + 0.1 * Math.abs(i));
        const r1 = r0 + size * 0.12 * grow;
        g.lineBetween(b.x + Math.cos(a) * r0, b.y + Math.sin(a) * r0, b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1);
      }
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) if (this.blasts[i].t >= LIFE) this.blasts.splice(i, 1);
    void w;
    void h;
  }
}
