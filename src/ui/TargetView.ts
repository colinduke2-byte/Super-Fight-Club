import Phaser from 'phaser';
import { TARGET_R } from '../engine/targets';
import type { World } from '../engine/world';

/** Target Smash targets: red-and-white bullseyes on a short post, gently bobbing, with a glow. */
export class TargetView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, private readonly world: World) {
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.g = scene.add.graphics();
    layer.add([this.glow, this.g]);
  }

  update(time: number): void {
    const g = this.g;
    const gl = this.glow;
    g.clear();
    gl.clear();
    this.world.targets.forEach((t, i) => {
      if (!t.alive) return;
      const bob = Math.sin(time * 2.2 + i * 1.7) * 1.2;
      const x = t.x;
      const y = t.y + bob;
      const R = TARGET_R;
      gl.fillStyle(0xff4a5a, 0.18 + 0.08 * Math.sin(time * 4 + i)).fillCircle(x, y, R * 1.9);
      g.fillStyle(0x1a1020, 1).fillCircle(x + 0.6, y + 0.6, R + 0.8);
      const rings = [0xff3a4a, 0xffffff, 0xff3a4a, 0xffffff];
      rings.forEach((c, k) => g.fillStyle(c, 1).fillCircle(x, y, R * (1 - k * 0.24)));
      g.fillStyle(0xffe14a, 1).fillCircle(x, y, R * 0.18);
      g.fillStyle(0xffffff, 0.55).fillCircle(x - R * 0.35, y - R * 0.35, R * 0.18); // shine
    });
  }
}
