import Phaser from 'phaser';
import { settings } from '../settings';

const POOL = 512;
const FLASHES = 24;

/**
 * Pooled particle effects. Particle size is in ART PIXELS (1 art pixel = 0.5 world units), matching
 * the character art density. Sparks use additive blending. Everything is created once and recycled.
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

  private readonly flashes: Phaser.GameObjects.Image[] = [];
  private readonly flashLife = new Float32Array(FLASHES);
  private readonly flashMax = new Float32Array(FLASHES);
  private readonly flashScale = new Float32Array(FLASHES);
  private nextFlash = 0;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    for (let i = 0; i < POOL; i++) {
      const s = scene.add.image(0, 0, 'px').setVisible(false).setActive(false);
      layer.add(s);
      this.sprites.push(s);
    }
    for (let i = 0; i < FLASHES; i++) {
      const s = scene.add.image(0, 0, 'spark').setVisible(false).setActive(false).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(s);
      this.flashes.push(s);
    }
  }

  private get quality(): number {
    return settings.particleQuality === 'high' ? 1 : settings.particleQuality === 'medium' ? 0.55 : 0.25;
  }

  emit(x: number, y: number, vx: number, vy: number, life: number, color: number, size: number, gravity: number, additive = false): void {
    const i = this.next;
    this.next = (this.next + 1) % POOL;
    const s = this.sprites[i];
    s.setPosition(x, y).setTint(color).setVisible(true).setActive(true).setAlpha(1).setBlendMode(additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    this.baseScale[i] = (size * 0.5) / 4; // 'px' texture is 4x4; size is in art pixels (0.5 world units)
    s.setScale(this.baseScale[i]);
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = this.maxLife[i] = life;
    this.grav[i] = gravity;
  }

  /** Radial burst of sparks (additive). */
  burst(x: number, y: number, count: number, speed: number, color: number, life = 0.35, size = 2): void {
    const n = Math.max(1, Math.round(count * this.quality));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
      const sp = speed * (0.5 + Math.random() * 0.7);
      this.emit(x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * (0.7 + Math.random() * 0.6), color, size, 40, true);
    }
  }

  /** Dust kicked up at the feet. */
  dust(x: number, y: number, count: number, dir: number): void {
    const n = Math.max(1, Math.round(count * this.quality));
    for (let k = 0; k < n; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      this.emit(x + side * 3, y - 1, side * (12 + Math.random() * 22) + dir * 14, -(6 + Math.random() * 14), 0.3 + Math.random() * 0.25, k % 3 === 0 ? 0xa9a0d8 : 0xcfc8e8, 2 + (k % 2), 30);
    }
  }

  /** Impact flash: 4-point star that pops and fades. `power` ~ 0.5..3. */
  flash(x: number, y: number, power: number, color = 0xffffff): void {
    const i = this.nextFlash;
    this.nextFlash = (this.nextFlash + 1) % FLASHES;
    const s = this.flashes[i];
    this.flashScale[i] = 0.5 * power;
    this.flashLife[i] = this.flashMax[i] = 0.18 + 0.03 * power;
    s.setPosition(x, y).setTint(color).setVisible(true).setActive(true).setScale(this.flashScale[i]).setAlpha(1).setRotation(Math.random() * 0.4 - 0.2);
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
      s.setAlpha(Math.min(1, t * 1.6));
      s.setScale(this.baseScale[i] * (0.5 + 0.5 * t));
    }
    for (let i = 0; i < FLASHES; i++) {
      const s = this.flashes[i];
      if (!s.active) continue;
      this.flashLife[i] -= dt;
      if (this.flashLife[i] <= 0) {
        s.setVisible(false).setActive(false);
        continue;
      }
      const t = this.flashLife[i] / this.flashMax[i];
      s.setScale(this.flashScale[i] * (1.9 - t * 0.9)).setAlpha(t);
    }
  }
}
