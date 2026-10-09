import Phaser from 'phaser';
import { settings } from '../settings';

const POOL = 384;

/**
 * Pooled particle effects (dust, sparks, KO bursts). All images are created once up front and
 * recycled; nothing is allocated per frame. Particle counts scale with the quality setting.
 */
export class Effects {
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly vx = new Float32Array(POOL);
  private readonly vy = new Float32Array(POOL);
  private readonly life = new Float32Array(POOL);
  private readonly maxLife = new Float32Array(POOL);
  private readonly grav = new Float32Array(POOL);
  private readonly baseScale = new Float32Array(POOL);
  private next = 0;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    for (let i = 0; i < POOL; i++) {
      const s = scene.add.image(0, 0, 'px').setVisible(false).setActive(false);
      layer.add(s);
      this.sprites.push(s);
    }
  }

  private get quality(): number {
    return settings.particleQuality === 'high' ? 1 : settings.particleQuality === 'medium' ? 0.55 : 0.25;
  }

  emit(x: number, y: number, vx: number, vy: number, life: number, color: number, size: number, gravity: number): void {
    const i = this.next;
    this.next = (this.next + 1) % POOL;
    const s = this.sprites[i];
    s.setPosition(x, y).setTint(color).setVisible(true).setActive(true).setAlpha(1);
    this.baseScale[i] = size / 4; // 'px' texture is 4x4
    s.setScale(this.baseScale[i]);
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = this.maxLife[i] = life;
    this.grav[i] = gravity;
  }

  /** Radial burst of sparks. */
  burst(x: number, y: number, count: number, speed: number, color: number, life = 0.35, size = 2): void {
    const n = Math.max(1, Math.round(count * this.quality));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
      const sp = speed * (0.5 + Math.random() * 0.7);
      this.emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * (0.7 + Math.random() * 0.6), color, size, 0);
    }
  }

  /** Dust kicked up at the feet. dir = -1/0/1 horizontal bias. */
  dust(x: number, y: number, count: number, dir: number): void {
    const n = Math.max(1, Math.round(count * this.quality));
    for (let k = 0; k < n; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      this.emit(x + side * 3, y - 1, side * (12 + Math.random() * 22) + dir * 14, -(6 + Math.random() * 14), 0.3 + Math.random() * 0.2, 0xcfc8e8, 2, 30);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      const s = this.sprites[i];
      if (!s.active) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        s.setVisible(false).setActive(false);
        continue;
      }
      this.vy[i] += this.grav[i] * dt;
      s.x += this.vx[i] * dt;
      s.y += this.vy[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      s.setAlpha(t);
      s.setScale(this.baseScale[i] * (0.4 + 0.6 * t));
    }
  }
}
