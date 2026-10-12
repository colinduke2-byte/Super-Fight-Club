import Phaser from 'phaser';
import { hazardPhase } from '../engine/hazards';
import type { HazardDef } from '../engine/types';

/** Draws stage hazards: a glowing vent while idle, a pulsing telegraph while warning, a bright column while erupting. */
export class HazardView {
  private readonly g: Phaser.GameObjects.Graphics;
  /** Additive layer for plasma and glow. */
  private readonly ga: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly hazards: HazardDef[],
  ) {
    this.g = scene.add.graphics().setDepth(5);
    this.ga = scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    layer.add(this.g);
    layer.add(this.ga);
  }

  update(tick: number): void {
    const g = this.g;
    g.clear();
    this.ga.clear();
    for (const h of this.hazards) {
      const phase = hazardPhase(h, tick);
      if (h.kind === 'bolt') {
        this.bolt(g, h, phase, tick);
        continue;
      }
      this.geyser(g, this.ga, h, phase, tick);
    }
  }

  /** Plasma geyser: a glowing vent, a bubbling telegraph with rising sparks, then a writhing column of plasma. */
  private geyser(g: Phaser.GameObjects.Graphics, ga: Phaser.GameObjects.Graphics, h: HazardDef, phase: 'idle' | 'warn' | 'active', tick: number): void {
    const x = h.x - h.w / 2;
    const jit = (i: number, k: number): number => {
      const r = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return r - Math.floor(r);
    };
    // vent: a dark grate set into the floor with a heat glow under the slats
    g.fillStyle(0x1a0c0a, 1).fillRect(x - 4, h.y - 3, h.w + 8, 5);
    g.fillStyle(0x4a2a20, 1).fillRect(x - 4, h.y - 3, h.w + 8, 1);
    const heat = phase === 'idle' ? 0.35 + 0.1 * Math.sin(tick * 0.08) : phase === 'warn' ? 0.8 : 1;
    for (let i = 0; i < h.w; i += 4) {
      g.fillStyle(0x2a1410, 1).fillRect(x + i, h.y - 2, 2, 3);
      ga.fillStyle(0xff6a20, heat).fillRect(x + i + 2, h.y - 2, 2, 3);
    }
    ga.fillStyle(0xff5a1a, 0.12 * heat).fillEllipse(h.x, h.y - 2, h.w + 26, 12);
    if (phase === 'warn') {
      // bubbling glow that grows as the eruption nears, and sparks spitting out of the grate
      const p = (tick % 12) / 12;
      ga.fillStyle(0xff7a2a, 0.18 + 0.18 * (tick % 12 < 6 ? 1 - p : p)).fillEllipse(h.x, h.y - 6, h.w + 10, 18 + 8 * p);
      for (let i = 0; i < 10; i++) {
        const life = ((tick + i * 7) % 26) / 26;
        const sx = x + jit(i, Math.floor((tick + i * 7) / 26)) * h.w;
        ga.fillStyle(i % 3 === 0 ? 0xfff0b0 : 0xffa040, 1 - life).fillRect(sx, h.y - 4 - life * 40, 1.5, 2.5);
      }
      g.lineStyle(1, 0xff8a30, 0.18 + 0.12 * Math.sin(tick * 0.5)).strokeRect(x, h.y - h.h, h.w, h.h);
    } else if (phase === 'active') {
      // writhing plasma: stacked slices whose width breathes along the column
      const top = h.y - h.h;
      for (let y = h.y; y > top - 10; y -= 2) {
        const u = (h.y - y) / h.h; // 0 base .. 1 top
        const wave = Math.sin(tick * 0.45 - y * 0.16) * 0.5 + Math.sin(tick * 0.31 + y * 0.07) * 0.5;
        const flare = u > 0.9 ? 1 + (u - 0.9) * 6 : 1; // plume at the top
        const half = (h.w / 2) * (0.82 + 0.16 * wave) * flare * (u > 1 ? Math.max(0, 1.6 - u) : 1);
        const dx = Math.sin(tick * 0.2 + y * 0.05) * 2;
        ga.fillStyle(0xff3a10, 0.35).fillRect(h.x + dx - half - 3, y, half * 2 + 6, 2);
        ga.fillStyle(0xff8a28, 0.55).fillRect(h.x + dx - half * 0.72, y, half * 1.44, 2);
        ga.fillStyle(0xffe08a, 0.75).fillRect(h.x + dx - half * 0.36, y, half * 0.72, 2);
      }
      ga.fillStyle(0xffffff, 0.6).fillRect(h.x - 2, top + 8, 4, h.h - 8);
      // splash at the base and embers flung out of the column
      ga.fillStyle(0xffa040, 0.5).fillEllipse(h.x, h.y - 2, h.w * 1.8, 12);
      for (let i = 0; i < 16; i++) {
        const life = ((tick * 2 + i * 11) % 40) / 40;
        const cyc = Math.floor((tick * 2 + i * 11) / 40);
        const side = jit(i, cyc) - 0.5;
        ga.fillStyle(i % 4 === 0 ? 0xffffff : 0xffb040, 1 - life).fillRect(h.x + side * h.w * (1 + life * 1.6), h.y - life * h.h * (0.4 + jit(i + 3, cyc) * 0.7), 2, 2);
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
