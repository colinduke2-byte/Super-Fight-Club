import Phaser from 'phaser';
import { avalancheX, hazardPhase, stalactiteFall } from '../engine/hazards';
import type { HazardDef } from '../engine/types';
import { fastShapes } from './fastShapes';
import { settings } from '../settings';

/** Scratch points of the lightning strike's jagged path, reused each redraw. */
const BOLT_STEPS = 14;
const BOLT_X = new Float64Array(BOLT_STEPS + 1);
const BOLT_Y = new Float64Array(BOLT_STEPS + 1);
const BOLT_LAYERS = [[9, 0x6ab8ff, 0.35], [5, 0xbfe6ff, 0.7], [2, 0xffffff, 1]] as const;

/** How far through its warning a hazard is (0 at the start, 1 as it fires). */
function warnProgress(h: HazardDef, tick: number): number {
  const p = (tick + (h.offset ?? 0)) % h.period;
  return Math.max(0, Math.min(1, (p - (h.period - h.active - h.warn)) / h.warn));
}

/**
 * The danger zone of a hazard about to fire: a column of light strongest at the end where it starts (`from`), bands of light
 * sweeping along it, marching dashes down both edges and corner brackets at the floor. It brightens as the moment nears.
 */
function dangerZone(ga: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, col: number, edge: number, k: number, tick: number, from: 'bottom' | 'top'): void {
  const a = 0.1 + 0.22 * k;
  const up = from === 'bottom';
  ga.fillGradientStyle(col, col, col, col, up ? 0 : a, up ? 0 : a, up ? a : 0.04, up ? a : 0.04);
  ga.fillRect(x, y, w, h);
  // bands of light travelling away from the source, faster as it nears
  for (let i = 0; i < 3; i++) {
    const u = (tick * (0.012 + 0.02 * k) + i / 3) % 1;
    const by = up ? y + h - u * h : y + u * h;
    ga.fillStyle(edge, (0.12 + 0.18 * k) * (1 - u)).fillRect(x, by - 2, w, 3);
  }
  // marching dashes along both edges
  const dash = 6;
  const off = (tick * (up ? -0.6 : 0.6)) % (dash * 2);
  for (let yy = y + off - dash * 2; yy < y + h; yy += dash * 2) {
    const y0 = Math.max(y, yy);
    const y1 = Math.min(y + h, yy + dash);
    if (y1 <= y0) continue;
    ga.fillStyle(edge, 0.25 + 0.35 * k).fillRect(x, y0, 1, y1 - y0).fillRect(x + w - 1, y0, 1, y1 - y0);
  }
  // corner brackets where it lands / starts on the floor
  const fy = y + h;
  const bl = Math.min(8, w / 3);
  ga.fillStyle(edge, 0.55 + 0.4 * k);
  ga.fillRect(x - 1, fy - 1, bl, 2).fillRect(x - 1, fy - bl, 2, bl);
  ga.fillRect(x + w - bl + 1, fy - 1, bl, 2).fillRect(x + w - 1, fy - bl, 2, bl);
}

/** Draws stage hazards: a glowing vent while idle, a pulsing telegraph while warning, a bright column while erupting. */
export class HazardView {
  private readonly g: Phaser.GameObjects.Graphics;
  /** Additive layer for plasma and glow. */
  private readonly ga: Phaser.GameObjects.Graphics;
  /** Everything drawn is a pure function of the sim tick (the defs never change): redraw only when it advances. */
  private lastTick = NaN;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly hazards: HazardDef[],
  ) {
    this.g = fastShapes(scene.add.graphics().setDepth(5));
    this.ga = fastShapes(scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD));
    layer.add(this.g);
    layer.add(this.ga);
  }

  update(tick: number): void {
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    const g = this.g;
    g.clear();
    this.ga.clear();
    for (const h of this.hazards) {
      const phase = hazardPhase(h, tick);
      if (h.kind === 'bolt') {
        this.bolt(g, this.ga, h, phase, tick);
        continue;
      }
      if (h.kind === 'stalactite') {
        this.stalactite(g, this.ga, h, phase, tick);
        continue;
      }
      if (h.kind === 'avalanche') {
        this.avalanche(g, this.ga, h, phase, tick);
        continue;
      }
      if (h.style === 'water') this.spout(g, this.ga, h, phase, tick);
      else this.geyser(g, this.ga, h, phase, tick);
    }
  }

  /** Avalanche: a rumble of loose snow sliding off the slope first, then a rolling wall of snow, chunks and spray. */
  private avalanche(g: Phaser.GameObjects.Graphics, ga: Phaser.GameObjects.Graphics, h: HazardDef, phase: 'idle' | 'warn' | 'active', tick: number): void {
    const dir = (h.travel ?? 1) >= 0 ? 1 : -1;
    const jit = (i: number, k: number): number => {
      const r = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return r - Math.floor(r);
    };
    if (phase === 'warn') {
      // the lane it will sweep, like every other hazard's danger zone: a low band of cold light along the floor that
      // brightens as it nears, with chevrons marching the way the snow will roll (steady pixels: no strobing)
      const k = warnProgress(h, tick);
      const travel = h.travel ?? 0;
      // (it breaks loose off the slope beyond the floor's end: the lane marks the floor it crosses, not the open air)
      const inset = Math.min(Math.abs(travel) / 4, h.w * 1.3);
      const x0 = Math.min(h.x, h.x + travel) + inset;
      const len = Math.abs(travel) - inset * 2;
      const band = Math.round(h.h * 0.6);
      ga.fillGradientStyle(0x9fc8ff, 0x9fc8ff, 0x9fc8ff, 0x9fc8ff, 0, 0, 0.1 + 0.2 * k, 0.1 + 0.2 * k);
      ga.fillRect(x0, h.y - band, len, band);
      const gap = 30;
      const off = (((tick * (0.5 + 0.9 * k)) % gap) + gap) % gap;
      for (let c = 0; c * gap < len; c++) {
        const cx = Math.round(dir > 0 ? x0 + c * gap + off : x0 + len - c * gap - off);
        if (cx < x0 || cx > x0 + len) continue;
        const cy = h.y - 10;
        ga.fillStyle(0xf4f8ff, 0.25 + 0.5 * k);
        for (let j = 0; j < 5; j++) ga.fillRect(cx + dir * j, cy - 5 + j, 2, 2).fillRect(cx + dir * j, cy + 3 - j, 2, 2);
      }
      // corner brackets at both ends of the lane (the same marks the columns' danger zones carry)
      ga.fillStyle(0xf4f8ff, 0.55 + 0.4 * k);
      ga.fillRect(x0 - 1, h.y - 1, 8, 2).fillRect(x0 - 1, h.y - 8, 2, 8);
      ga.fillRect(x0 + len - 7, h.y - 1, 8, 2).fillRect(x0 + len - 1, h.y - 8, 2, 8);
      // snow trickling down from the high side, a few clumps bouncing in
      for (let i = 0; i < 14; i++) {
        const life = ((tick + i * 5) % 30) / 30;
        const sx = h.x - dir * (30 - jit(i, 3) * 40);
        g.fillStyle(i % 3 ? 0xf4f8ff : 0xc8d8ec, 1 - life * 0.6).fillRect(sx + dir * life * 26, h.y - h.h - 30 + life * (h.h + 26), 2 + (i % 2), 2 + (i % 2));
      }
      return;
    }
    if (phase !== 'active') return;
    const p = (tick + (h.offset ?? 0)) % h.period;
    const cx = avalancheX(h, p)!;
    const front = cx + (dir * h.w) / 2;
    // the bulk: stacked rolling lobes, brightest at the crest, with a trail of churned snow behind
    for (let k = 0; k < 7; k++) {
      const ox = cx - dir * k * 9;
      const lobe = h.h * (0.95 - k * 0.11) * (0.92 + 0.08 * Math.sin(tick * 0.6 + k));
      g.fillStyle(k === 0 ? 0xffffff : k < 3 ? 0xeef4fc : 0xc8d6e8, 1).fillEllipse(ox, h.y - lobe / 2, h.w * 0.9, lobe);
    }
    g.fillStyle(0xa8bcd4, 1).fillRect(cx - dir * h.w * 0.9 - (dir < 0 ? 0 : 0), h.y - 6, dir * -h.w * 1.6, 6);
    // chunks tumbling out of the front and a spray of powder above
    for (let i = 0; i < 12; i++) {
      const a = (tick * 0.3 + i * 0.9) % (Math.PI * 2);
      const rr = 6 + jit(i, Math.floor(tick / 6)) * h.h * 0.5;
      g.fillStyle(i % 2 ? 0xdce8f6 : 0xffffff, 1).fillRect(front + dir * Math.abs(Math.cos(a)) * 8 - 3, h.y - rr - 4, 5, 5);
    }
    for (let i = 0; i < 16; i++) {
      const life = ((tick + i * 3) % 18) / 18;
      g.fillStyle(0xffffff, 0.7 * (1 - life)).fillRect(front - dir * jit(i, 1) * h.w + dir * life * 10, h.y - h.h - life * 24 + jit(i, 2) * 10, 2, 2);
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
      ga.fillStyle(0xff7a2a, settings.reduceFlashes ? 0.27 : 0.18 + 0.18 * (tick % 12 < 6 ? 1 - p : p)).fillEllipse(h.x, h.y - 6, h.w + 10, 18 + 8 * p);
      for (let i = 0; i < 10; i++) {
        const life = ((tick + i * 7) % 26) / 26;
        const sx = x + jit(i, Math.floor((tick + i * 7) / 26)) * h.w;
        ga.fillStyle(i % 3 === 0 ? 0xfff0b0 : 0xffa040, 1 - life).fillRect(sx, h.y - 4 - life * 40, 1.5, 2.5);
      }
      dangerZone(ga, x, h.y - h.h, h.w, h.h, 0xff5a1a, 0xffa040, warnProgress(h, tick), tick, 'bottom');
      // heat shimmer wavering up the column to come
      for (let i = 0; i < 6; i++) {
        const u = ((tick * 0.02 + i / 6) % 1);
        const yy = h.y - u * h.h;
        ga.fillStyle(0xffd090, 0.12 * (1 - u)).fillRect(h.x - h.w * 0.3 + Math.sin(tick * 0.3 + i * 2) * 4, yy, h.w * 0.6, 1);
      }
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

  /** Water spout: a swirling blowhole, a churning telegraph with spray, then a roaring column of seawater with a foam crown. */
  private spout(g: Phaser.GameObjects.Graphics, ga: Phaser.GameObjects.Graphics, h: HazardDef, phase: 'idle' | 'warn' | 'active', tick: number): void {
    const jit = (i: number, k: number): number => {
      const r = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return r - Math.floor(r);
    };
    // blowhole: a dark round hole in the deck with a barnacled rim and water sloshing in it
    g.fillStyle(0x0a1c26, 1).fillEllipse(h.x, h.y - 1, h.w + 10, 7);
    g.fillStyle(0x3a5a5a, 1).fillRect(h.x - h.w / 2 - 5, h.y - 3, 3, 2).fillRect(h.x + h.w / 2 + 2, h.y - 3, 3, 2);
    const slosh = phase === 'idle' ? 0.3 + 0.1 * Math.sin(tick * 0.07) : phase === 'warn' ? 0.7 : 1;
    g.fillStyle(0x1a6a8a, 1).fillEllipse(h.x + Math.sin(tick * 0.06) * 2, h.y - 1, h.w * 0.8, 4);
    ga.fillStyle(0x4ae0e0, 0.16 * slosh).fillEllipse(h.x, h.y - 2, h.w + 24, 10);
    for (let i = 0; i < 3; i++) {
      // ripples swirling around the hole
      const a = tick * 0.05 + (i * Math.PI * 2) / 3;
      ga.fillStyle(0xbff6ff, 0.5 * slosh).fillRect(h.x + Math.cos(a) * (h.w / 2), h.y - 1.5 + Math.sin(a) * 1.5, 3, 1);
    }
    if (phase === 'warn') {
      // the sea churns: a growing foam dome, spray spitting up, a faint outline of the column to come
      const p = (tick % 14) / 14;
      g.fillStyle(0xd8f6ff, 0.55 + 0.25 * Math.sin(tick * 0.6)).fillEllipse(h.x, h.y - 3, h.w * (0.7 + 0.3 * p), 6 + 6 * p);
      for (let i = 0; i < 12; i++) {
        const life = ((tick + i * 5) % 22) / 22;
        const cyc = Math.floor((tick + i * 5) / 22);
        const sx = h.x + (jit(i, cyc) - 0.5) * h.w * (0.8 + life);
        const sy = h.y - 4 - Math.sin(life * Math.PI) * (16 + jit(i + 9, cyc) * 26);
        g.fillStyle(i % 3 === 0 ? 0xffffff : 0x8adcf0, 1 - life * 0.6).fillRect(sx, sy, 2, 2);
      }
      dangerZone(ga, h.x - h.w / 2, h.y - h.h, h.w, h.h, 0x2a8ac0, 0x9ae6ff, warnProgress(h, tick), tick, 'bottom');
    } else if (phase === 'active') {
      // the column: deep blue core, lighter flanks, white foam streaks racing up it
      const top = h.y - h.h;
      for (let y = h.y; y > top - 14; y -= 2) {
        const u = (h.y - y) / h.h;
        const wave = Math.sin(tick * 0.4 - y * 0.14) * 0.5 + Math.sin(tick * 0.27 + y * 0.06) * 0.5;
        const crown = u > 0.86 ? 1 + (u - 0.86) * 7 : 1;
        const half = (h.w / 2) * (0.84 + 0.14 * wave) * crown * (u > 1 ? Math.max(0, 1.7 - u) : 1);
        const dx = Math.sin(tick * 0.18 + y * 0.05) * 2;
        g.fillStyle(0x1a5a8a, 0.78).fillRect(h.x + dx - half, y, half * 2, 2);
        g.fillStyle(0x3aa8d8, 0.8).fillRect(h.x + dx - half * 0.7, y, half * 1.1, 2);
        g.fillStyle(0x8ae4ff, 0.75).fillRect(h.x + dx - half * 0.6, y, half * 0.35, 2);
        if (u > 0.82) g.fillStyle(0xf0fcff, 0.85 * Math.min(1, (u - 0.82) * 6)).fillRect(h.x + dx - half, y, half * 2, 2);
      }
      for (let i = 0; i < 7; i++) {
        // foam streaks rushing upward
        const life = ((tick * 3 + i * 17) % 50) / 50;
        const cyc = Math.floor((tick * 3 + i * 17) / 50);
        const sx = h.x + (jit(i, cyc) - 0.5) * h.w * 0.8;
        g.fillStyle(0xffffff, 0.7 * (1 - life)).fillRect(sx, h.y - life * h.h, 2, 8);
      }
      ga.fillStyle(0x6ad8ff, 0.18).fillRect(h.x - h.w / 2 - 4, top, h.w + 8, h.h);
      // splash ring at the base and spray falling from the crown
      g.fillStyle(0xe8faff, 0.8).fillEllipse(h.x, h.y - 2, h.w * 1.9, 8);
      for (let i = 0; i < 18; i++) {
        const life = ((tick * 2 + i * 9) % 44) / 44;
        const cyc = Math.floor((tick * 2 + i * 9) / 44);
        const side = jit(i, cyc) - 0.5;
        const x = h.x + side * h.w * (1.2 + life * 2.6);
        const y = top - 6 + life * life * h.h * 0.9 - Math.sin(life * Math.PI) * 18;
        g.fillStyle(i % 4 === 0 ? 0xffffff : 0x9ae6ff, 1 - life).fillRect(x, y, 2, 2);
      }
    }
  }

  /** Stalactite: a crystal spike hanging from the cave roof; it cracks and shakes in the warning, then drops and shatters. */
  private stalactite(g: Phaser.GameObjects.Graphics, ga: Phaser.GameObjects.Graphics, h: HazardDef, phase: 'idle' | 'warn' | 'active', tick: number): void {
    const p = (tick + (h.offset ?? 0)) % h.period;
    const fall = stalactiteFall(h, p);
    const len = 34;
    const w = h.w * 0.7;
    // a rock knuckle on the roof it hangs from
    g.fillStyle(0x16121a, 1).fillEllipse(h.x, h.y, w * 1.8, 12);
    const shake = phase === 'warn' ? Math.sin(tick * 1.7) * (1 + 2 * ((p - (h.period - h.active - h.warn)) / h.warn)) : 0;
    const dropped = phase === 'active' && fall >= 1;
    if (!dropped) {
      const top = h.y + (phase === 'active' ? h.h * fall - len : 0);
      const x = h.x + shake;
      // the spike: dark core, lit facet, glowing tip
      g.fillStyle(0x3e1f66, 1).fillTriangle(x - w / 2, top, x + w / 2, top, x, top + len);
      g.fillStyle(0x9a5ad6, 1).fillTriangle(x - w / 2, top, x - w * 0.05, top, x, top + len);
      g.fillStyle(0xd8b0ff, 1).fillTriangle(x - w * 0.3, top, x - w * 0.12, top, x, top + len * 0.8);
      ga.fillStyle(0xc898f6, 0.25 + (phase === 'idle' ? 0.08 * Math.sin(tick * 0.08) : 0.3)).fillCircle(x, top + len - 4, 6);
      if (phase === 'active') {
        // a falling streak behind it
        ga.fillStyle(0xd8b0ff, 0.25).fillRect(x - 2, h.y, 4, Math.max(0, top - h.y));
      }
    }
    if (phase === 'warn') {
      // cracks spreading across the roof, grit trickling down, and the spot it will hit lit on the floor
      g.lineStyle(1, 0xf0e2ff, 0.7);
      for (let i = 0; i < 3; i++) g.lineBetween(h.x, h.y, h.x + (i - 1) * 10 + Math.sin(tick + i) * 2, h.y - 4 + (i % 2) * 3);
      for (let i = 0; i < 6; i++) {
        const life = ((tick + i * 9) % 30) / 30;
        g.fillStyle(0x8a7a70, 1 - life).fillRect(h.x + ((i * 7) % 11) - 5, h.y + 6 + life * h.h * 0.5, 2, 2);
      }
      const floor = h.y + h.h;
      ga.fillStyle(0xc898f6, 0.3 + 0.18 * Math.sin(tick * 0.6)).fillEllipse(h.x, floor - 1, h.w * 1.8, 8);
      g.fillStyle(0x000000, 0.25).fillEllipse(h.x, floor + 1, h.w * 1.2, 5); // its shadow on the floor
      dangerZone(ga, h.x - h.w / 2, h.y, h.w, h.h, 0x7a3ad0, 0xd8b0ff, warnProgress(h, tick), tick, 'top');
    }
  }

  /** Lightning: a conductor rod where it will land, a crackling telegraph, then a jagged white-blue strike from the sky. */
  private bolt(g: Phaser.GameObjects.Graphics, ga: Phaser.GameObjects.Graphics, h: HazardDef, phase: 'idle' | 'warn' | 'active', tick: number): void {
    const base = h.y + h.h;
    const rod = base - 14;
    g.fillStyle(0x24344c, 1).fillRect(h.x - 3, rod, 6, 14);
    g.fillStyle(0x8aa8c8, 1).fillRect(h.x - 1, rod - 4, 2, 6);
    g.fillStyle(phase === 'idle' ? 0x4a6a8a : 0xcfe8ff, 1).fillRect(h.x - 2, rod - 6, 4, 3);
    if (phase === 'warn') {
      const p = (tick % 10) / 10;
      // (the crackle flickers; steady under REDUCE FLASHES)
      g.lineStyle(1, 0xcfe8ff, settings.reduceFlashes ? 0.4 : 0.25 + 0.3 * (tick % 6 < 3 ? 1 - p : p));
      g.lineBetween(h.x, h.y, h.x, rod - 6);
      g.fillStyle(0x9fd8ff, 0.2 + 0.25 * p).fillCircle(h.x, rod - 6, 10 + 8 * p);
      g.lineStyle(1, 0xffffff, 0.5);
      for (let i = 0; i < 3; i++) {
        const a = tick * 0.9 + i * 2.1;
        g.lineBetween(h.x, rod - 6, h.x + Math.cos(a) * 14, rod - 6 + Math.sin(a) * 10);
      }
      // where it will strike: an ionised channel down from the cloud, stray sparks crawling along it
      const k = warnProgress(h, tick);
      dangerZone(ga, h.x - h.w / 2, h.y, h.w, h.h, 0x4a90ff, 0xcfe8ff, k, tick, 'top');
      for (let i = 0; i < 5; i++) {
        const u = ((tick * 0.03 + i * 0.21) % 1);
        const sy = h.y + u * h.h;
        const sx = h.x + Math.sin(tick * 0.9 + i * 3) * h.w * 0.35;
        ga.fillStyle(0xe8f4ff, (0.3 + 0.5 * k) * (1 - u * 0.5)).fillRect(sx, sy, 1, 4 + 4 * k);
      }
    } else if (phase === 'active') {
      const seed = Math.floor(tick / 2);
      const steps = BOLT_STEPS;
      BOLT_X[0] = h.x;
      BOLT_Y[0] = h.y;
      for (let i = 1; i < steps; i++) {
        const r = Math.sin((seed * 12.9898 + i * 78.233) * 43758.5453) * 0.5 + 0.5; // deterministic jitter, no Math.random
        BOLT_X[i] = h.x + (r - 0.5) * 22;
        BOLT_Y[i] = h.y + ((base - 12 - h.y) * i) / steps;
      }
      BOLT_X[steps] = h.x;
      BOLT_Y[steps] = base - 6;
      g.fillStyle(0x9fd8ff, 0.18).fillRect(h.x - h.w / 2, h.y, h.w, h.h);
      for (const [w, c, a] of BOLT_LAYERS) {
        g.lineStyle(w, c, a);
        g.beginPath();
        g.moveTo(BOLT_X[0], BOLT_Y[0]);
        for (let i = 1; i <= steps; i++) g.lineTo(BOLT_X[i], BOLT_Y[i]);
        g.strokePath();
      }
      g.fillStyle(0xffffff, 0.9).fillCircle(h.x, base - 8, 12);
    }
  }
}
