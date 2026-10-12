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
      if (h.kind === 'bolt') {
        this.bolt(g, h, phase, tick);
        continue;
      }
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

  /** Lightning: a conductor rod where it will land, a crackling telegraph, then a jagged white-blue strike from the sky. */
  private bolt(g: Phaser.GameObjects.Graphics, h: HazardDef, phase: 'idle' | 'warn' | 'active', tick: number): void {
    const base = h.y + h.h;
    const rod = base - 14;
    g.fillStyle(0x24344c, 1).fillRect(h.x - 3, rod, 6, 14);
    g.fillStyle(0x8aa8c8, 1).fillRect(h.x - 1, rod - 4, 2, 6);
    g.fillStyle(phase === 'idle' ? 0x4a6a8a : 0xcfe8ff, 1).fillRect(h.x - 2, rod - 6, 4, 3);
    if (phase === 'warn') {
      const p = (tick % 10) / 10;
      g.lineStyle(1, 0xcfe8ff, 0.25 + 0.3 * (tick % 6 < 3 ? 1 - p : p));
      g.lineBetween(h.x, h.y, h.x, rod - 6);
      g.fillStyle(0x9fd8ff, 0.2 + 0.25 * p).fillCircle(h.x, rod - 6, 10 + 8 * p);
      g.lineStyle(1, 0xffffff, 0.5);
      for (let i = 0; i < 3; i++) {
        const a = tick * 0.9 + i * 2.1;
        g.lineBetween(h.x, rod - 6, h.x + Math.cos(a) * 14, rod - 6 + Math.sin(a) * 10);
      }
      g.lineStyle(1, 0x9fd8ff, 0.2).strokeRect(h.x - h.w / 2, h.y, h.w, h.h); // where it will strike
    } else if (phase === 'active') {
      const seed = Math.floor(tick / 2);
      const pts: [number, number][] = [[h.x, h.y]];
      const steps = 14;
      for (let i = 1; i < steps; i++) {
        const r = Math.sin((seed * 12.9898 + i * 78.233) * 43758.5453) * 0.5 + 0.5; // deterministic jitter, no Math.random
        pts.push([h.x + (r - 0.5) * 22, h.y + ((base - 12 - h.y) * i) / steps]);
      }
      pts.push([h.x, base - 6]);
      g.fillStyle(0x9fd8ff, 0.18).fillRect(h.x - h.w / 2, h.y, h.w, h.h);
      for (const [w, c, a] of [[9, 0x6ab8ff, 0.35], [5, 0xbfe6ff, 0.7], [2, 0xffffff, 1]] as const) {
        g.lineStyle(w, c, a);
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.strokePath();
      }
      g.fillStyle(0xffffff, 0.9).fillCircle(h.x, base - 8, 12);
    }
  }
}
