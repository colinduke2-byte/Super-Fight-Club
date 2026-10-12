import Phaser from 'phaser';
import { settings, type ParticleQuality } from '../settings';

const QUALITY_SCALE: Record<ParticleQuality, number> = { high: 1, medium: 0.55, low: 0.25 };

const POOL = 512;
const FLASHES = 24;
const RINGS = 12;

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

  private readonly rings: Phaser.GameObjects.Image[] = [];
  private readonly ringLife = new Float32Array(RINGS);
  private readonly ringMax = new Float32Array(RINGS);
  private readonly ringTo = new Float32Array(RINGS);
  private nextRing = 0;

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
    for (let i = 0; i < RINGS; i++) {
      const s = scene.add.image(0, 0, 'ring').setVisible(false).setActive(false).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(s);
      this.rings.push(s);
    }
  }

  /** Temporary cap from the adaptive-quality governor (never saved). */
  cap: ParticleQuality | null = null;

  private get quality(): number {
    const q = this.cap && QUALITY_SCALE[this.cap] < QUALITY_SCALE[settings.particleQuality] ? this.cap : settings.particleQuality;
    return QUALITY_SCALE[q];
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
    const soft = settings.reduceFlashes ? 0.35 : 1; // photosensitivity: smaller, dimmer pops
    power *= soft;
    this.flashScale[i] = 0.5 * power;
    this.flashLife[i] = this.flashMax[i] = 0.18 + 0.03 * power;
    s.setPosition(x, y).setTint(color).setVisible(true).setActive(true).setScale(this.flashScale[i]).setAlpha(soft).setRotation(Math.random() * 0.4 - 0.2);
  }

  /** Expanding shockwave ring (world units radius `to`). */
  ring(x: number, y: number, to: number, color = 0xffffff, life = 0.35): void {
    const i = this.nextRing;
    this.nextRing = (this.nextRing + 1) % RINGS;
    this.ringLife[i] = this.ringMax[i] = life;
    this.ringTo[i] = to;
    this.rings[i].setPosition(x, y).setTint(color).setVisible(true).setActive(true).setScale(0.1).setAlpha(1);
  }

  /** Fading particle line between two points (teleport afterimage). */
  trail(x0: number, y0: number, x1: number, y1: number, color: number): void {
    const n = Math.max(2, Math.round((Math.hypot(x1 - x0, y1 - y0) / 4) * this.quality));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      this.emit(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.25 + 0.25 * t, color, 3, 0, true);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < RINGS; i++) {
      const s = this.rings[i];
      if (!s.active) continue;
      this.ringLife[i] -= dt;
      if (this.ringLife[i] <= 0) {
        s.setVisible(false).setActive(false);
        continue;
      }
      const t = 1 - this.ringLife[i] / this.ringMax[i];
      s.setScale(((this.ringTo[i] * 2) / 32) * (1 - (1 - t) * (1 - t))).setAlpha(1 - t);
    }
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
