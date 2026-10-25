import type Phaser from 'phaser';
import type { Fighter } from '../engine/fighter';
import type { World } from '../engine/world';
import { basicOf, makeSwing, swingOf, swingVisible, type Swing } from '../fx/basicFx';
import { fighterColor, fighterTrailColor } from '../fx/runner';
import { fastShapes } from './fastShapes';
import { CRACK_TICKS, drawCrack, drawSwing, glint, type Deco } from './MoveFx';

/** Scratch polyline for the volt bolt and the flame ribbon (strokePoints reads it immediately). */
const HAIR: { x: number; y: number }[] = Array.from({ length: 16 }, () => ({ x: 0, y: 0 }));

/** Trail looks. A character picks one with `fx.slash`; otherwise its sound style decides (heavy = sparks, blade = blade, ...). */
export type SlashStyle = 'plain' | 'fire' | 'water' | 'spark' | 'blade' | 'arcane' | 'volt' | 'gale' | 'crystal' | 'frost';
const BY_SOUND: Record<string, SlashStyle> = { heavy: 'spark', blade: 'blade', arcane: 'arcane', mech: 'volt', wind: 'gale', fire: 'fire', water: 'water', stone: 'crystal' };

type Layers = readonly (readonly [number, number, number])[];
/** [width multiplier, colour, alpha] from the outside in, for the fixed-palette styles. */
const FIXED: Partial<Record<SlashStyle, Layers>> = {
  fire: [[1.6, 0xff2a10, 0.38], [1.05, 0xff7a1a, 0.75], [0.5, 0xfff0a0, 0.95]],
  water: [[1.6, 0x1a4ad8, 0.36], [1.05, 0x2fb0ff, 0.72], [0.5, 0xe6fbff, 0.95]],
  spark: [[1.6, 0xff5a10, 0.34], [1.05, 0xffa040, 0.72], [0.5, 0xfff4d8, 0.95]],
  volt: [[1.55, 0x1a6aff, 0.34], [1, 0x5fe8ff, 0.72], [0.45, 0xffffff, 0.95]],
  gale: [[1.55, 0xffd35a, 0.28], [1, 0xe8f0ff, 0.6], [0.45, 0xffffff, 0.95]],
  crystal: [[1.6, 0x5a2a9a, 0.34], [1.05, 0xa868e0, 0.72], [0.5, 0xf0e2ff, 0.95]],
  frost: [[1.5, 0x2a6ab0, 0.3], [0.95, 0x8fd8ff, 0.7], [0.42, 0xffffff, 0.98]],
};
/** Width of the band per style (blades are razor thin, sparks chunky). */
const WIDTH: Partial<Record<SlashStyle, number>> = { blade: 0.62, spark: 1.15, gale: 0.9, crystal: 1.1, frost: 0.7 };

export function slashStyle(f: Fighter): SlashStyle {
  const fx = f.data.fx;
  return (fx?.slash as SlashStyle | undefined) ?? BY_SOUND[fx?.sound ?? ''] ?? 'plain';
}

/** Fighter slots tracked for floor cracks. */
const SLOTS = 8;

/**
 * Swing trails drawn along each live hitbox, shaped by the kind of move (see fx/basicFx and ui/MoveFx: jab streaks, punch
 * thrusts with a shock ring, kick sweeps, up-attack fans, the down-smash's twin floor arcs and crack, nair rings, dair spikes,
 * fair / bair arcs, dash-attack lunges, weapon heads) and dressed per fighter (flames and ribbons, spray, sparks, a blade's
 * glint, arcane stars, crackling volts, feathers, shards, snow). Redrawn when the sim steps; purely visual.
 */
export class SlashArcs {
  private readonly g: Phaser.GameObjects.Graphics;
  /** The drawing only changes when the sim steps: skip redraws between ticks (high refresh rates, pauses). */
  private lastWorld: World | null = null;
  private lastTick = -1;
  /** Layers for the accent-coloured styles (colour filled in per fighter). */
  private readonly accent: [number, number, number][] = [[1.5, 0, 0.35], [1, 0, 0.7], [0.45, 0xffffff, 0.95]];
  /** Pooled trail-edge points handed to `decorate`. */
  private readonly deco: Deco[] = Array.from({ length: 8 }, () => ({ x: 0, y: 0, t: 0, nx: 0, ny: 0 }));
  private readonly swing: Swing = makeSwing();
  /** Floor cracks per fighter slot: start tick (-1 none), x, y, length, colour; and the move that made it. */
  private readonly crackT = new Int32Array(SLOTS).fill(-1);
  private readonly crackX = new Float32Array(SLOTS);
  private readonly crackY = new Float32Array(SLOTS);
  private readonly crackL = new Float32Array(SLOTS);
  private readonly crackC = new Uint32Array(SLOTS);
  private readonly crackMove: (object | null)[] = new Array(SLOTS).fill(null);

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.g = fastShapes(scene.add.graphics().setDepth(50).setBlendMode(1 /* ADD */));
    layer.add(this.g);
  }

  update(world: World): void {
    const tick = world.tick;
    if (world === this.lastWorld && tick === this.lastTick) return;
    if (world !== this.lastWorld) this.crackT.fill(-1);
    this.lastWorld = world;
    this.lastTick = tick;
    const g = this.g;
    g.clear();
    for (const f of world.fighters) {
      const slot = f.id % SLOTS;
      if (this.crackT[slot] >= 0) {
        const age = tick - this.crackT[slot];
        if (age < 0 || age >= CRACK_TICKS) this.crackT[slot] = -1;
        else drawCrack(g, this.crackX[slot], this.crackY[slot], age, this.crackL[slot], this.crackC[slot]);
      }
      const m = f.move;
      if (f.state !== 'attack' || !m) {
        this.crackMove[slot] = null;
        continue;
      }
      const style = slashStyle(f);
      const col = fighterTrailColor(f, tick);
      let layers: Layers | undefined = FIXED[style];
      if (!layers) {
        this.accent[0][1] = col;
        this.accent[1][1] = col;
        // two-tone trails: basic.trail2 colours the hot core (default white)
        const t2 = basicOf(f)?.trail2;
        this.accent[2][1] = t2 !== undefined ? fighterColor(f, t2, tick) : 0xffffff;
        layers = this.accent;
      }
      const wMul = WIDTH[style] ?? 1;
      const basic = basicOf(f);
      let drawn = 0;
      for (const hb of m.hitboxes) {
        if (drawn >= 2) break;
        if (!swingVisible(f, m, hb)) continue;
        const s = swingOf(f, m, hb, this.swing);
        const shape = s.look.shape;
        if (shape === 'none') break;
        drawn++;
        // ring, fan and split are whole-move shapes: once per move, from its first live hitbox
        const once = shape === 'ring' || shape === 'fan' || shape === 'split' || shape === 'lunge';
        const nd = drawSwing(g, f, s, layers, wMul, tick, this.deco, layers[1][1]);
        if (style === 'fire' && basic?.ribbon && (shape === 'arc' || shape === 'sweep' || shape === 'fan')) ribbon(g, this.deco, nd, s.fade, tick);
        decorate(g, style, this.deco, nd, s.fade, tick, col, s.hx, s.hy);
        if (shape === 'split' && s.live && f.grounded && basic?.crack !== false && this.crackMove[slot] !== m) {
          // the floor cracks under a down-smash (once per use)
          this.crackMove[slot] = m;
          this.crackT[slot] = tick;
          this.crackX[slot] = f.x;
          this.crackY[slot] = f.y;
          this.crackL[slot] = Math.max(18, s.r * 1.1);
          this.crackC[slot] = layers[1][1];
        }
        if (once) break;
      }
    }
  }
}

/** A flame ribbon: a sinuous thin streamer licking off just outside the trail's edge. */
function ribbon(g: Phaser.GameObjects.Graphics, pts: readonly Deco[], n: number, fade: number, tick: number): void {
  if (n < 3) return;
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const off = 4 + k * 3 + Math.sin(tick * 0.7 + i * 1.4 + k * 2) * 2.2;
      const h = HAIR[i];
      h.x = p.x + p.nx * off;
      h.y = p.y + p.ny * off - (1 - p.t) * (2 + k * 2);
    }
    g.lineStyle(k ? 1 : 1.5, k ? 0xffe08a : 0xff6a1a, (k ? 0.6 : 0.75) * fade);
    g.strokePoints(HAIR as Phaser.Geom.Point[], false, false, n);
  }
}

/** Per-style dressing along the first `n` points of the trail's outer edge plus an accent at its head (hx, hy). */
function decorate(g: Phaser.GameObjects.Graphics, style: SlashStyle, pts: readonly Deco[], n: number, fade: number, tick: number, col: number, hx: number, hy: number): void {
  switch (style) {
    case 'fire':
      // flame tongues rising off the edge, flickering per tick
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const fl = (3 + 7 * p.t) * fade * (0.65 + 0.35 * Math.sin(tick * 1.9 + i * 1.3));
        g.fillStyle(i % 2 ? 0xffc040 : 0xff5a1a, 0.75 * fade);
        g.fillTriangle(p.x - 2.4, p.y, p.x + 2.4, p.y, p.x + Math.sin(tick * 0.8 + i) * 2.5, p.y - fl);
      }
      break;
    case 'water':
      // droplets thrown off the edge, falling away behind the head
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const off = 3 + ((i * 7) % 5);
        g.fillStyle(i % 2 ? 0xe6fbff : 0x3ab8ff, 0.8 * fade);
        g.fillCircle(p.x + p.nx * off, p.y + p.ny * off + (1 - p.t) * 6 * (1 - fade * 0.5), 1.4 + p.t * 1.2);
      }
      break;
    case 'spark':
      // molten sparks spitting outward from the edge
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        if ((i + (tick >> 1)) % 2) continue;
        const d = 4 + ((i * 5 + tick) % 7);
        g.fillStyle(i % 3 ? 0xffd27a : 0xffffff, 0.9 * fade);
        g.fillRect(p.x + p.nx * d - 1, p.y + p.ny * d - 1, 2, 2);
      }
      g.fillStyle(0xffe0a0, 0.5 * fade).fillCircle(hx, hy, 4);
      break;
    case 'blade':
      // a hard bright edge and a four-point glint riding the head
      for (let i = 1; i < n; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        g.lineStyle(1, 0xffffff, 0.85 * fade * b.t).lineBetween(a.x, a.y, b.x, b.y);
      }
      glint(g, hx, hy, 6 * fade, 0xffffff, 0.95 * fade);
      break;
    case 'arcane':
      // twinkling stars strewn along the arc in the spell's colour
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const tw = 0.5 + 0.5 * Math.sin(tick * 0.9 + i * 2.3);
        glint(g, p.x + p.nx * 4, p.y + p.ny * 4, (1.5 + 2.5 * p.t) * tw, i % 2 ? 0xffffff : col, 0.85 * fade);
      }
      glint(g, hx, hy, 5 * fade, 0xffffff, fade);
      break;
    case 'volt': {
      // a crackling zigzag bolt along the edge, re-rolled every couple of ticks
      g.lineStyle(1.5, 0xbff8ff, 0.9 * fade);
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const j = (((i * 13 + (tick >> 1) * 7) % 9) - 4) * 0.9;
        const h = HAIR[i];
        h.x = p.x + p.nx * (3 + j);
        h.y = p.y + p.ny * (3 + j);
      }
      if (n > 0) g.strokePoints(HAIR as Phaser.Geom.Point[], false, false, n);
      g.fillStyle(0xffffff, 0.8 * fade).fillCircle(hx, hy, 2.5);
      break;
    }
    case 'gale':
      // feathers peeling off behind the head
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        if (i % 2) continue;
        const d = 4 + (1 - p.t) * 6;
        const x = p.x + p.nx * d;
        const y = p.y + p.ny * d + (1 - p.t) * 3;
        g.fillStyle(i % 4 ? 0xffffff : 0xffe39a, 0.8 * fade);
        g.fillEllipse(x, y, 5 * (0.5 + p.t), 2);
      }
      break;
    case 'crystal':
      // faceted shards flaking off the edge (little diamonds that tumble outward) and ringing glints
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        if ((i + (tick >> 2)) % 2) continue;
        const d = 3 + ((i * 7) % 6) * (1.2 - fade * 0.4);
        const x = p.x + p.nx * d;
        const y = p.y + p.ny * d;
        const s = 1.6 + p.t * 1.8;
        g.fillStyle(i % 3 ? 0xc898f6 : 0xf0e2ff, 0.9 * fade);
        g.fillTriangle(x, y - s, x + s * 0.7, y, x, y + s);
        g.fillTriangle(x, y - s, x - s * 0.7, y, x, y + s);
      }
      glint(g, hx, hy, 6 * fade, 0xf0e2ff, 0.95 * fade);
      break;
    case 'frost':
      // a razor-thin cut that leaves a trail of snow: tiny flakes drifting off the edge and icy glints at the tip
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        if ((i + (tick >> 1)) % 3) continue;
        const d = 2 + ((i * 5) % 7) * (1.3 - fade * 0.5);
        const x = p.x + p.nx * d - fade * 2;
        const y = p.y + p.ny * d + (1 - fade) * 4;
        const s = 0.9 + p.t * 1.1;
        g.fillStyle(i % 2 ? 0xbfeaff : 0xffffff, 0.85 * fade);
        g.fillRect(x - s, y - 0.4, s * 2, 0.8);
        g.fillRect(x - 0.4, y - s, 0.8, s * 2);
      }
      glint(g, hx, hy, 7 * fade, 0xffffff, fade);
      break;
    default:
      break;
  }
}
