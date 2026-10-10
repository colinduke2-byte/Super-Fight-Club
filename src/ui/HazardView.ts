import Phaser from 'phaser';
import { hazardPhase } from '../engine/hazards';
import type { HazardDef } from '../engine/types';

/** Draws stage hazards: a glowing vent while idle, a pulsing telegraph while warning, a bright column while erupting. */
export class HazardView {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly hazards: HazardDef[],
  ) {
    this.g = scene.add.graphics().setDepth(5);
    layer.add(this.g);
  }

  update(tick: number): void {
    const g = this.g;
    g.clear();
    for (const h of this.hazards) {
      const phase = hazardPhase(h, tick);
      const x = h.x - h.w / 2;
      // vent grate on the floor
      g.fillStyle(0x2a1210, 1).fillRect(x - 2, h.y - 2, h.w + 4, 4);
      g.fillStyle(phase === 'idle' ? 0x7a2a14 : 0xff8a30, 1).fillRect(x + 2, h.y - 2, h.w - 4, 2);
      if (phase === 'warn') {
        const p = (tick % 12) / 12;
        const a = 0.25 + 0.35 * (tick % 12 < 6 ? 1 - p : p);
        g.fillStyle(0xff6a20, a).fillRect(x, h.y - 14 - 10 * p, h.w, 14 + 10 * p);
        // faint outline of where the column will be
        g.lineStyle(1, 0xff8a30, 0.35).strokeRect(x, h.y - h.h, h.w, h.h);
      } else if (phase === 'active') {
        const flick = tick % 4 < 2 ? 0 : 3;
        g.fillStyle(0xff5a1a, 0.55).fillRect(x - 3, h.y - h.h - flick, h.w + 6, h.h + flick);
        g.fillStyle(0xffa040, 0.85).fillRect(x, h.y - h.h + 6, h.w, h.h - 6);
        g.fillStyle(0xfff0b0, 0.95).fillRect(x + h.w * 0.3, h.y - h.h + 14, h.w * 0.4, h.h - 14);
      }
    }
  }
}
