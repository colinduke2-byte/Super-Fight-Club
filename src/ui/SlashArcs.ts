import type Phaser from 'phaser';
import { hitboxEnd, hitboxStart } from '../engine/moves';
import { hitboxActive, hitboxRect } from '../engine/combat';
import type { Fighter } from '../engine/fighter';
import type { World } from '../engine/world';
import { fighterTrailColor } from '../fx/runner';

const r4 = [0, 0, 0, 0];
const N = 14;
/** t^1.1 for t = i / N (the trail's taper), computed once. */
const TAPER = Array.from({ length: N + 1 }, (_, i) => Math.pow(i / N, 1.1));
/** Scratch polygons reused every redraw (Graphics.fillPoints reads them immediately). */
const ARC: { x: number; y: number }[] = Array.from({ length: 2 * (N + 1) }, () => ({ x: 0, y: 0 }));
const NEEDLE: { x: number; y: number }[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));

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

/**
 * Tapered crescent "swoosh" drawn along each live hitbox: a bright head sweeps an arc around the fighter's chest with a long
 * fading tail (soft coloured glow outside, bright core inside), dressed per fighter (flames, spray, sparks, a blade's glint,
 * arcane stars, crackling volts, feathers). Redrawn every render frame from the sim state; purely visual.
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

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.g = scene.add.graphics().setDepth(50).setBlendMode(1 /* ADD */);
    layer.add(this.g);
  }

  update(world: World): void {
    const tick = world.tick;
    if (world === this.lastWorld && tick === this.lastTick) return;
    this.lastWorld = world;
    this.lastTick = tick;
    const g = this.g;
    g.clear();
    for (const f of world.fighters) {
      const m = f.move;
      if (f.state !== 'attack' || !m) continue;
      const style = slashStyle(f);
      const col = fighterTrailColor(f, tick);
      let layers: Layers | undefined = FIXED[style];
      if (!layers) {
        this.accent[0][1] = col;
        this.accent[1][1] = col;
        layers = this.accent;
      }
      const wMul = WIDTH[style] ?? 1;
      const chestX = f.x;
      const chestY = f.y - f.h * 0.55;
      let drawn = 0;
      for (const hb of m.hitboxes) {
        if (drawn >= 2 || hb.grab || hb.throw || hb.travel) continue;
        const a0 = hitboxStart(m, hb);
        const a1 = hitboxEnd(m, hb);
        const live = hitboxActive(f, m, hb);
        // keep the tail visible a few frames after the hitbox ends
        const after = f.moveFrame - a1;
        if (!live && !(after > 0 && after <= 5) && !(f.moveFrame >= a0 - 1 && f.moveFrame < a0)) continue;
        drawn++;
        hitboxRect(f, hb, r4);
        const dx = (r4[0] + r4[2] / 2 - chestX) * f.facing;
        const dy = r4[1] + r4[3] / 2 - chestY;
        const r = Math.max(m.view?.arc === 'ring' ? 24 : 10, Math.hypot(dx, dy));
        const centre = Math.atan2(dy, dx);
        const span = m.view?.arc === 'ring' ? Math.PI * 0.98 : Math.min(1.25, Math.max(0.5, (Math.max(r4[2], r4[3]) * 0.95) / (r + 6)));
        const prog = after > 0 ? 1 : a1 > a0 ? Math.min(1, Math.max(0, (f.moveFrame - a0) / (a1 - a0 + 1))) : 0.6;
        const shape = m.view?.arc ?? 'curve';
        if (shape === 'none') continue;
        const fade = after > 0 ? 1 - after / 6 : 1;
        const deco = this.deco;
        let nd = 0;
        if (shape === 'line') {
          // straight streak (punches, thrusts, pokes): a tapered needle from behind the fist to its tip
          const ux = dx / r;
          const uy = dy / r;
          const reach = r + Math.max(r4[2], r4[3]) * 0.3;
          const hx = chestX + ux * reach * f.facing;
          const hy = chestY + uy * reach;
          const len = (16 + Math.min(r4[2], 44) * 0.7) * (0.45 + 0.55 * prog);
          const tx = hx - ux * len * f.facing;
          const ty = hy - uy * len;
          const px = -uy * f.facing;
          const py = ux;
          const wid = Math.min(10, Math.max(4, Math.min(r4[2], r4[3]) * 0.4)) * wMul;
          const q = NEEDLE;
          for (let li = 0; li < layers.length; li++) {
            const L = layers[li];
            const w = (wid * L[0] * 0.93) / 2;
            g.fillStyle(L[1], L[2] * fade);
            q[0].x = tx;
            q[0].y = ty;
            q[1].x = hx + px * w;
            q[1].y = hy + py * w;
            q[2].x = hx + ux * f.facing * 4;
            q[2].y = hy + uy * 4;
            q[3].x = hx - px * w;
            q[3].y = hy - py * w;
            g.fillPoints(q as Phaser.Geom.Point[], true);
          }
          for (let i = 1; i <= 4; i++) {
            const t = i / 5;
            const d = deco[nd++];
            d.x = tx + (hx - tx) * t;
            d.y = ty + (hy - ty) * t;
            d.t = t;
            d.nx = px;
            d.ny = py;
          }
          decorate(g, style, deco, nd, fade, tick, col, hx, hy);
          continue;
        }
        const dir = m.kind === 'aerial' && hb.y > 0 ? -1 : 1;
        const head = centre + span * (2 * prog - 1) * dir;
        const tail = Math.max(centre - span, Math.min(centre + span, head - span * 1.5 * dir));
        const heavy = hb.damage >= 12 || m.kind === 'smash';
        const width = Math.min(13, Math.max(5, Math.min(r4[2], r4[3]) * 0.5 + (heavy ? 3 : 0))) * wMul;
        const pts = ARC;
        for (let li = 0; li < layers.length; li++) {
          const L = layers[li];
          // outer edge tail -> head, then the inner edge head -> tail, written straight into the scratch polygon
          for (let i = 0; i <= N; i++) {
            const ang = tail + ((head - tail) * i) / N;
            const w = width * L[0] * TAPER[i];
            const cx = Math.cos(ang);
            const cy = Math.sin(ang);
            const o = pts[i];
            o.x = chestX + cx * (r + w / 2) * f.facing;
            o.y = chestY + cy * (r + w / 2);
            const n = pts[2 * N + 1 - i];
            n.x = chestX + cx * (r - w / 2) * f.facing;
            n.y = chestY + cy * (r - w / 2);
          }
          g.fillStyle(L[1], L[2] * fade);
          g.fillPoints(pts as Phaser.Geom.Point[], true);
        }
        if (heavy) {
          // a heavy swing throws a second, thinner shock arc just outside the first: the air it displaces, led by the head
          const sr = r + width * 0.95;
          const sw = width * 0.32;
          const sTail = head - (head - tail) * 0.6;
          for (let i = 0; i <= N; i++) {
            const ang = sTail + ((head - sTail) * i) / N;
            const w = sw * TAPER[i];
            const cx = Math.cos(ang);
            const cy = Math.sin(ang);
            const o = pts[i];
            o.x = chestX + cx * (sr + w / 2) * f.facing;
            o.y = chestY + cy * (sr + w / 2);
            const n = pts[2 * N + 1 - i];
            n.x = chestX + cx * (sr - w / 2) * f.facing;
            n.y = chestY + cy * (sr - w / 2);
          }
          g.fillStyle(layers[1][1], 0.45 * fade);
          g.fillPoints(pts as Phaser.Geom.Point[], true);
        }
        if (style !== 'blade') {
          // a crisp hot hairline along the leading half of the outer edge: the cut itself, so even soft styles read sharp
          g.lineStyle(1, 0xffffff, 0.7 * fade);
          g.beginPath();
          for (let i = N >> 1; i <= N; i++) {
            const ang = tail + ((head - tail) * i) / N;
            const w = width * layers[layers.length - 1][0] * TAPER[i];
            const x = chestX + Math.cos(ang) * (r + w / 2) * f.facing;
            const y = chestY + Math.sin(ang) * (r + w / 2);
            if (i === N >> 1) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.strokePath();
        }
        for (let i = 3; i <= N; i += 2) {
          const t = i / N;
          const ang = tail + (head - tail) * t;
          const w = width * TAPER[i];
          const cx = Math.cos(ang);
          const cy = Math.sin(ang);
          const d = deco[nd++];
          d.x = chestX + cx * (r + w / 2) * f.facing;
          d.y = chestY + cy * (r + w / 2);
          d.t = t;
          d.nx = cx * f.facing;
          d.ny = cy;
        }
        const hAng = head;
        decorate(g, style, deco, nd, fade, tick, col, chestX + Math.cos(hAng) * r * f.facing, chestY + Math.sin(hAng) * r);
      }
    }
  }
}

/** A point on the outer edge of a trail: `t` 0 (tail) .. 1 (head), (nx, ny) the outward direction. */
interface Deco {
  x: number;
  y: number;
  t: number;
  nx: number;
  ny: number;
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
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const j = (((i * 13 + (tick >> 1) * 7) % 9) - 4) * 0.9;
        const x = p.x + p.nx * (3 + j);
        const y = p.y + p.ny * (3 + j);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
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

/** Four-point sparkle. */
function glint(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, c: number, a: number): void {
  if (s <= 0.3) return;
  g.fillStyle(c, a);
  g.fillTriangle(x - s, y, x + s, y, x, y - s * 0.25);
  g.fillTriangle(x - s, y, x + s, y, x, y + s * 0.25);
  g.fillTriangle(x, y - s, x, y + s, x - s * 0.25, y);
  g.fillTriangle(x, y - s, x, y + s, x + s * 0.25, y);
}
