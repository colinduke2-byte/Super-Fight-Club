import Phaser from 'phaser';
import type { World } from '../engine/world';

/**
 * Bespoke staging drawn over a cinematic ultimate, keyed by the attacker's id (others just get the generic cut-in, flashes
 * and their fx `cinematicHit` recipes). World space, redrawn every frame from the cinematic's frame counter.
 */
export class CinematicArt {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.g = scene.add.graphics().setDepth(6);
    this.glow = scene.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    layer.add([this.g, this.glow]);
  }

  update(world: World, tick: number): void {
    const g = this.g;
    const a = this.glow;
    g.clear();
    a.clear();
    const c = world.cinematic;
    if (!c) return;
    if (c.attacker.data.id === 'obelisk') this.mountainsWrath(c.frame, c.move.cinematic!.frames, c.victim.x, c.victim.y, c.victim.h, tick);
  }

  /** Obelisk's ultimate: the rival is sealed in a growing amethyst crystal, then a granite monolith drops out of the sky onto it. */
  private mountainsWrath(frame: number, total: number, vx: number, vy: number, vh: number, tick: number): void {
    const g = this.g;
    const a = this.glow;
    const grow = Math.min(1, frame / 40);
    const w = 18 + 8 * grow;
    const h = (vh + 18) * grow;
    const top = vy - h;
    if (h > 1 && frame < total) {
      // the crystal: a tall pointed prism (an off-centre tip, two lit facets), a bright outline and glints, pulsing with the hits
      const pulse = 0.85 + 0.15 * Math.sin(frame * 0.6);
      const tip = 16 * grow;
      const L = vx - w / 2;
      const R = vx + w / 2;
      const body = [
        new Phaser.Math.Vector2(L, vy),
        new Phaser.Math.Vector2(L, top + 6),
        new Phaser.Math.Vector2(vx - w * 0.18, top - 2),
        new Phaser.Math.Vector2(vx + w * 0.08, top - tip),
        new Phaser.Math.Vector2(R - w * 0.12, top + 2),
        new Phaser.Math.Vector2(R, top + 10),
        new Phaser.Math.Vector2(R, vy),
      ];
      g.fillStyle(0x3e1f66, 0.9).fillPoints(body, true);
      g.fillStyle(0x9a5ad6, 0.6 * pulse).fillPoints([body[1], body[2], body[3], new Phaser.Math.Vector2(vx - w * 0.05, top + 8), new Phaser.Math.Vector2(vx - w * 0.12, vy), body[0]], true);
      g.fillStyle(0xc898f6, 0.5).fillPoints([body[2], body[3], new Phaser.Math.Vector2(vx - w * 0.05, top + 8)], true);
      g.lineStyle(1.5, 0xf0e2ff, 0.95).strokePoints(body, true);
      g.lineStyle(1, 0xf0e2ff, 0.5).lineBetween(vx - w * 0.05, top + 8, vx - w * 0.12, vy);
      for (let i = 0; i < 4; i++) {
        const gx = L + 4 + ((i * 11 + (tick >> 3)) % Math.max(1, w - 8));
        const gy = top + 10 + ((i * 17) % Math.max(1, h - 14));
        a.fillStyle(0xffffff, 0.8).fillTriangle(gx - 3, gy, gx + 3, gy, gx, gy - 1).fillTriangle(gx, gy - 3, gx, gy + 3, gx + 1, gy);
      }
      a.fillStyle(0xc898f6, 0.12 * pulse).fillEllipse(vx, top + h / 2, w * 1.8, h * 1.25);
    }
    // the monolith: a slab of granite falls out of the sky, lands on the crystal and grinds it down until the last hit shatters it
    const start = total - 40;
    if (frame >= start && frame <= total) {
      const t = Math.min(1, (frame - start) / 20);
      const mw = 44;
      const mh = 110;
      const land = top - 14 + (t >= 1 ? Math.min(10, frame - start - 20) * 1.2 : 0); // drops, then grinds the crystal down
      const my = land - mh - (1 - t * t) * 220;
      g.fillStyle(0x3e3833, 1).fillRect(vx - mw / 2, my, mw, mh);
      g.fillStyle(0x585049, 1).fillRect(vx - mw / 2, my, mw * 0.32, mh);
      g.fillStyle(0x2a2522, 1).fillRect(vx + mw / 2 - 8, my, 8, mh);
      g.fillStyle(0x746a60, 1).fillRect(vx - mw / 2, my, mw, 4);
      // glowing amethyst veins down its face
      for (let i = 0; i < 3; i++) {
        const x0 = vx - mw / 2 + 10 + i * 13;
        a.lineStyle(2, 0xc898f6, 0.9);
        a.beginPath();
        a.moveTo(x0, my + 10);
        for (let k = 1; k <= 6; k++) a.lineTo(x0 + (k % 2 ? 3 : -2), my + 10 + k * ((mh - 20) / 6));
        a.strokePath();
      }
      // a shadow growing on the crystal as it comes down
      g.fillStyle(0x000000, 0.25 * t).fillEllipse(vx, land + 4, mw * (0.6 + 0.6 * t), 8);
    }
  }
}
