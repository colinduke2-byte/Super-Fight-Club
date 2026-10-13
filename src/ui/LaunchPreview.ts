import Phaser from 'phaser';
import type { Fighter } from '../engine/fighter';
import { HUMAN_MIN_SPEED, predictLaunch } from '../engine/physics';
import type { World } from '../engine/world';

const LIFE = 100;

/**
 * Training aid: after a launching hit, a dotted line traces where the victim would fly with no DI, ending in a ring where
 * they would land, or a red cross where the launch would KO. Segments fast enough to crash into others are drawn hot.
 */
export class LaunchPreview {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly path: number[] = [];
  private end: 'ko' | 'land' | 'open' = 'open';
  private age = LIFE;
  private fast = 0;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.gfx = scene.add.graphics().setDepth(900);
    layer.add(this.gfx);
  }

  /** Call on a hit: previews `f`'s launch if it is a real one. */
  show(f: Fighter, world: World): void {
    if (f.state !== 'hitstun' || Math.hypot(f.vx, f.vy) < 2.5) return;
    this.end = predictLaunch(f, world, this.path);
    this.age = 0;
    // how many leading points are still at crash speed (one point per two frames, slowing roughly with launch drag)
    const v0 = Math.hypot(f.vx, f.vy);
    this.fast = v0 < HUMAN_MIN_SPEED ? 0 : Math.ceil((v0 - HUMAN_MIN_SPEED) / 0.17 / 2);
  }

  update(): void {
    const g = this.gfx;
    g.clear();
    if (this.age >= LIFE || this.path.length < 4) return;
    this.age++;
    const a = this.age < LIFE - 25 ? 0.85 : (0.85 * (LIFE - this.age)) / 25;
    const p = this.path;
    const n = p.length / 2;
    for (let i = 0; i < n - 1; i += 2) {
      g.lineStyle(2, i < this.fast ? 0xffb060 : 0xffffff, a);
      g.lineBetween(p[i * 2], p[i * 2 + 1], p[i * 2 + 2], p[i * 2 + 3]);
    }
    const ex = p[p.length - 2];
    const ey = p[p.length - 1];
    if (this.end === 'ko') {
      g.lineStyle(3, 0xff4a5a, a);
      g.lineBetween(ex - 7, ey - 7, ex + 7, ey + 7);
      g.lineBetween(ex - 7, ey + 7, ex + 7, ey - 7);
    } else if (this.end === 'land') {
      g.lineStyle(2, 0x8fe6ff, a);
      g.strokeCircle(ex, ey, 6);
    }
  }
}
