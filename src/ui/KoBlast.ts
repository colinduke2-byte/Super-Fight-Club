import Phaser from 'phaser';
import { settings } from '../settings';
import { fastShapes } from './SlashArcs';

/** A spark flung out of the blast (screen space). */
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  white: boolean;
}

interface Blast {
  x: number;
  y: number;
  /** Unit direction from the screen edge towards the middle. */
  dx: number;
  dy: number;
  color: number;
  /** The colour lifted toward white: the hot inner layers. */
  hot: number;
  t: number;
  /** Per-ray length / angle jitter, rolled once so the fan holds its shape while it grows. */
  rays: number[];
  sparks: Spark[];
}

const LIFE = 1.35;
const RAYS = 13;

function lift(c: number, k: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return (Math.round(r + (255 - r) * k) << 16) | (Math.round(g + (255 - g) * k) << 8) | Math.round(b + (255 - b) * k);
}

/**
 * The KO blast: a column of light in the fighter's colour erupts from the screen edge where they left the stage and punches back
 * across the arena. Layers: a one-frame screen flash, a stacked cone (coloured shell, hot body, white core), a fan of jagged rays,
 * two shockwave arcs racing out from the edge, debris sparks flung along the column and a pillar that lingers after the burst.
 * Drawn in screen space, so it reads even though the blast zone itself is far off camera.
 */
export class KoBlast {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly flash: Phaser.GameObjects.Graphics;
  private readonly blasts: Blast[] = [];

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.flash = fastShapes(scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD));
    this.g = fastShapes(scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD));
    layer.add([this.flash, this.g]);
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
    const rays: number[] = [];
    for (let i = 0; i < RAYS * 2; i++) rays.push(Math.random());
    const size = Math.min(w, h);
    const sparks: Spark[] = [];
    const n = settings.particleQuality === 'low' ? 14 : settings.particleQuality === 'medium' ? 24 : 40;
    const base = Math.atan2(-dy, -dx);
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * 1.5 * (i % 3 === 0 ? 1 : 0.55);
      const sp = size * (0.6 + Math.random() * 1.7);
      sparks.push({ x: ex, y: ey, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.55, white: i % 3 !== 0 });
    }
    this.blasts.push({ x: ex, y: ey, dx: -dx, dy: -dy, color, hot: lift(color, 0.55), t: 0, rays, sparks });
  }

  update(dt: number, w: number, h: number): void {
    const g = this.g;
    const fl = this.flash;
    g.clear();
    fl.clear();
    const soft = settings.reduceFlashes ? 0.4 : 1;
    const size = Math.min(w, h);
    for (const b of this.blasts) {
      b.t += dt;
      const t = b.t / LIFE;
      if (t >= 1) continue;
      const ang = Math.atan2(b.dy, b.dx);
      const px = -b.dy;
      const py = b.dx;
      // a frame of light over the whole screen as it goes off (heavily damped under REDUCE FLASHES)
      if (b.t < 0.16) {
        const k = 1 - b.t / 0.16;
        fl.fillStyle(b.hot, (settings.reduceFlashes ? 0.06 : 0.3) * k * k).fillRect(0, 0, w, h);
      }
      const grow = 1 - Math.pow(1 - Math.min(1, b.t / 0.14), 3); // shoots out fast
      const burst = b.t < 0.45 ? 1 : Math.max(0, 1 - (b.t - 0.45) / 0.5); // the eruption itself
      const fade = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7; // the lingering pillar
      const flick = 0.92 + 0.08 * Math.sin(b.t * 70);
      const L = size * 1.05 * grow;
      const W = size * 0.26 * (1 - Math.min(1, t) * 0.55) * flick;
      const back = size * 0.04;
      const cone = (len: number, wid: number, col: number, a: number): void => {
        if (a <= 0.004) return;
        g.fillStyle(col, a * soft);
        g.fillTriangle(b.x + px * wid - b.dx * back, b.y + py * wid - b.dy * back, b.x - px * wid - b.dx * back, b.y - py * wid - b.dy * back, b.x + b.dx * len, b.y + b.dy * len);
      };
      // the column: a wide soft shell, the coloured body, a hot inner body and a white-hot core, each a bit longer-lived inward
      cone(L * 1.05, W * 1.5, b.color, 0.2 * burst);
      cone(L * 0.95, W, b.color, 0.45 * fade);
      cone(L * 0.75, W * 0.6, b.hot, 0.55 * fade);
      cone(L * 0.55, W * 0.26, 0xffffff, (0.45 + 0.4 * burst) * fade);
      // the fan of jagged rays: thin spikes of uneven length, alternating white and colour
      for (let i = 0; i < RAYS; i++) {
        const u = i / (RAYS - 1) - 0.5;
        const a = ang + u * 1.5 + (b.rays[i] - 0.5) * 0.12;
        const r1 = size * (0.25 + 0.6 * b.rays[RAYS + i]) * grow * (1 - 0.4 * Math.abs(u));
        const wd = size * (0.012 + 0.012 * b.rays[i]) * burst;
        if (wd <= 0.2) continue;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        g.fillStyle(i % 2 ? 0xffffff : b.hot, 0.75 * burst * soft);
        g.fillTriangle(b.x - sa * wd, b.y + ca * wd, b.x + sa * wd, b.y - ca * wd, b.x + ca * r1, b.y + sa * r1);
      }
      // two shockwave arcs racing out from the edge point (the half facing into the arena)
      for (let k = 0; k < 2; k++) {
        const tk = Math.max(0, b.t - k * 0.08) / 0.55;
        if (tk <= 0 || tk >= 1) continue;
        const e = 1 - Math.pow(1 - tk, 3);
        const r = size * (0.12 + (k ? 0.55 : 0.85) * e);
        g.lineStyle(Math.max(1, size * (k ? 0.012 : 0.022) * (1 - tk)), k ? 0xffffff : b.hot, (k ? 0.6 : 0.8) * (1 - tk) * soft);
        g.beginPath();
        g.arc(b.x, b.y, r, ang - 1.35, ang + 1.35, false);
        g.strokePath();
      }
      // the flare where they went out: a stacked glow, swelling with the burst
      const fr = size * 0.16 * (0.6 + 0.6 * grow) * (1 - t * 0.6);
      g.fillStyle(b.color, 0.35 * fade * soft).fillCircle(b.x, b.y, fr * 1.7);
      g.fillStyle(b.hot, 0.55 * fade * soft).fillCircle(b.x, b.y, fr);
      g.fillStyle(0xffffff, 0.85 * burst * soft).fillCircle(b.x, b.y, fr * 0.55);
      // debris: streaks flung along the column, braking hard
      const drag = Math.exp(-3.2 * dt);
      for (const s of b.sparks) {
        if (b.t > s.life) continue;
        s.vx *= drag;
        s.vy *= drag;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const k = 1 - b.t / s.life;
        g.lineStyle(Math.max(1, size * 0.006 * (0.5 + k)), s.white ? 0xffffff : b.hot, 0.9 * k * soft);
        g.lineBetween(s.x, s.y, s.x - s.vx * 0.045, s.y - s.vy * 0.045);
      }
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) if (this.blasts[i].t >= LIFE) this.blasts.splice(i, 1);
  }
}
