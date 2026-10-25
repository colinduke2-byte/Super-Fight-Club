import type Phaser from 'phaser';
import type { Fighter } from '../engine/fighter';
import type { Swing } from '../fx/basicFx';

/**
 * Trail shapes for the basic moves, drawn into SlashArcs' additive Graphics from a `Swing` (fx/basicFx): short jab streaks,
 * punches' thrust and shock ring, kicks' sweep round the hip, up attacks' vertical fan, the down-smash's twin floor arcs, the
 * spinning nair's full ring, the dair's downward spike, fair / bair arcs, the dash attack's lunge with speed lines, and the
 * weapons' own heads (spearhead, anchor, blade edge, gun stock). Every point list is scratch reused per draw: no allocation.
 */
type G = Phaser.GameObjects.Graphics;
export type Layers = readonly (readonly [number, number, number])[];

const N = 14;
const TAPER = Array.from({ length: N + 1 }, (_, i) => Math.pow(i / N, 1.1));
const ARC: { x: number; y: number }[] = Array.from({ length: 2 * (N + 1) }, () => ({ x: 0, y: 0 }));
const QUAD: { x: number; y: number }[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));
const LINE: { x: number; y: number }[] = Array.from({ length: N + 1 }, () => ({ x: 0, y: 0 }));
const ELL_N = 16;
const ELL: { x: number; y: number }[] = Array.from({ length: ELL_N }, () => ({ x: 0, y: 0 }));

/** A point on the outer edge of a trail: `t` 0 (tail) .. 1 (head), (nx, ny) outward. Filled for the per-style dressing. */
export interface Deco {
  x: number;
  y: number;
  t: number;
  nx: number;
  ny: number;
}

/** Tapered band along an arc of an ellipse (radius r, vertical scale ry) from angle a0 (tail) to a1 (head), per layer. */
export function band(g: G, layers: Layers, px: number, py: number, facing: number, r: number, ry: number, a0: number, a1: number, width: number, fade: number): void {
  const pts = ARC;
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];
    for (let i = 0; i <= N; i++) {
      const ang = a0 + ((a1 - a0) * i) / N;
      const w = width * L[0] * TAPER[i];
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);
      const o = pts[i];
      o.x = px + cx * (r + w / 2) * facing;
      o.y = py + cy * (r + w / 2) * ry;
      const n = pts[2 * N + 1 - i];
      n.x = px + cx * (r - w / 2) * facing;
      n.y = py + cy * (r - w / 2) * ry;
    }
    g.fillStyle(L[1], L[2] * fade);
    g.fillPoints(pts as Phaser.Geom.Point[], true);
  }
}

/** A crisp 1 px line along the leading part (from `from` 0..1) of a band's outer edge. */
export function hairline(g: G, px: number, py: number, facing: number, r: number, ry: number, a0: number, a1: number, width: number, from: number, col: number, alpha: number): void {
  g.lineStyle(1, col, alpha);
  let n = 0;
  for (let i = Math.round(N * from); i <= N; i++) {
    const ang = a0 + ((a1 - a0) * i) / N;
    const w = width * TAPER[i];
    const p = LINE[n++];
    p.x = px + Math.cos(ang) * (r + w / 2) * facing;
    p.y = py + Math.sin(ang) * (r + w / 2) * ry;
  }
  if (n > 1) g.strokePoints(LINE as Phaser.Geom.Point[], false, false, n);
}

/** Fill `deco` with points along a band's outer edge (returns how many). */
export function arcDeco(deco: Deco[], px: number, py: number, facing: number, r: number, ry: number, a0: number, a1: number, width: number): number {
  let nd = 0;
  for (let i = 3; i <= N && nd < deco.length; i += 2) {
    const t = i / N;
    const ang = a0 + (a1 - a0) * t;
    const w = width * TAPER[i];
    const cx = Math.cos(ang);
    const cy = Math.sin(ang);
    const d = deco[nd++];
    d.x = px + cx * (r + w / 2) * facing;
    d.y = py + cy * (r + w / 2) * ry;
    d.t = t;
    d.nx = cx * facing;
    d.ny = cy;
  }
  return nd;
}

/** Tapered needle from (tx, ty) to a point at (hx, hy), `wid` wide at the head; `blunt` squares the head off. */
export function needle(g: G, layers: Layers, tx: number, ty: number, hx: number, hy: number, wid: number, fade: number, blunt = false): void {
  const dx = hx - tx;
  const dy = hy - ty;
  const d = Math.max(0.001, Math.hypot(dx, dy));
  const ux = dx / d;
  const uy = dy / d;
  const q = QUAD;
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];
    const w = (wid * L[0] * 0.93) / 2;
    g.fillStyle(L[1], L[2] * fade);
    q[0].x = tx;
    q[0].y = ty;
    q[1].x = hx - uy * w;
    q[1].y = hy + ux * w;
    q[2].x = hx + ux * (blunt ? 0 : 4);
    q[2].y = hy + uy * (blunt ? 0 : 4);
    q[3].x = hx + uy * w;
    q[3].y = hy - ux * w;
    if (blunt) {
      // a squared-off end: the head is a flat face as wide as the band
      q[2].x = hx + uy * w;
      q[2].y = hy - ux * w;
      q[3].x = hx + uy * w;
      q[3].y = hy - ux * w;
    }
    g.fillPoints(q as Phaser.Geom.Point[], true);
  }
}

/** Ellipse outline (centre, radii, rotation) as a closed 16-gon. */
export function ellipse(g: G, cx: number, cy: number, rx: number, ry: number, rot: number, col: number, alpha: number, lw: number): void {
  if (alpha <= 0.01 || rx < 0.5) return;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < ELL_N; i++) {
    const a = (i / ELL_N) * Math.PI * 2;
    const ex = Math.cos(a) * rx;
    const ey = Math.sin(a) * ry;
    ELL[i].x = cx + ex * c - ey * s;
    ELL[i].y = cy + ex * s + ey * c;
  }
  g.lineStyle(lw, col, alpha);
  g.strokePoints(ELL as Phaser.Geom.Point[], true, true, ELL_N);
}

/** Four-point sparkle. */
export function glint(g: G, x: number, y: number, s: number, c: number, a: number): void {
  if (s <= 0.3) return;
  g.fillStyle(c, a);
  g.fillTriangle(x - s, y, x + s, y, x, y - s * 0.25);
  g.fillTriangle(x - s, y, x + s, y, x, y + s * 0.25);
  g.fillTriangle(x, y - s, x, y + s, x - s * 0.25, y);
  g.fillTriangle(x, y - s, x, y + s, x + s * 0.25, y);
}

/** Per-weapon band widths (spears and blades thin, the anchor heavy). */
const WEAPON_W: Record<string, number> = { spear: 0.55, blade: 0.55, anchor: 1.35, stock: 1.1, claw: 0.8 };

/**
 * Draw one swing in its shape. Fills `deco` with points along it for the per-style dressing and returns how many; the head
 * point (for the dressing's accent) is s.hx, s.hy.
 */
export function drawSwing(g: G, f: Fighter, s: Swing, layers: Layers, wMul: number, tick: number, deco: Deco[], hot: number): number {
  const shape = s.look.shape;
  const weapon = s.look.weapon;
  const fade = s.fade;
  const fc = f.facing;
  const r4 = s.rect;
  const wm = wMul * (weapon ? (WEAPON_W[weapon] ?? 1) : 1);
  let nd = 0;
  switch (shape) {
    case 'streak': {
      // jabs: three short sharp streaks snapping out at the fist, staggered
      const len = (9 + 7 * s.prog) * (weapon === 'spear' ? 1.6 : 1);
      const wid = 3.2 * wm;
      for (let k = -1; k <= 1; k++) {
        const off = k * 3.4;
        const l = len * (k === 0 ? 1 : 0.62);
        const hx = s.hx - s.nx * Math.abs(k) * 3 - s.ny * off;
        const hy = s.hy - s.ny * Math.abs(k) * 3 + s.nx * off;
        needle(g, layers, hx - s.nx * l, hy - s.ny * l, hx, hy, k === 0 ? wid : wid * 0.6, fade * (k === 0 ? 1 : 0.75));
      }
      glint(g, s.hx + s.nx * 2, s.hy + s.ny * 2, 4.5 * fade, 0xffffff, 0.9 * fade);
      if (weapon) weaponHead(g, weapon, s.hx, s.hy, s.nx, s.ny, fade, hot, tick);
      for (let i = 1; i <= 3; i++) nd = pushDeco(deco, nd, s.hx - s.nx * len * (1 - i / 4), s.hy - s.ny * len * (1 - i / 4), i / 4, -s.ny, s.nx);
      return nd;
    }
    case 'thrust':
    case 'lunge': {
      // a straight thrust (punches, pokes, spear thrusts) from behind the fist to its tip
      const lunge = shape === 'lunge';
      const lenBase = (16 + Math.min(r4[2], 44) * 0.7) * (0.45 + 0.55 * s.prog);
      const len = lunge ? lenBase + 18 : weapon === 'spear' ? lenBase * 1.35 : lenBase;
      const wid = Math.min(10, Math.max(4, Math.min(r4[2], r4[3]) * 0.4)) * wm;
      const tx = s.hx - s.nx * len;
      const ty = s.hy - s.ny * len;
      needle(g, layers, tx, ty, s.hx, s.hy, wid, fade, weapon === 'stock');
      if (weapon === 'spear') {
        // the shaft: a hairline back to the hands
        g.lineStyle(1, 0xffffff, 0.55 * fade).lineBetween(s.px + s.nx * 4, s.py + s.ny * 4, s.hx, s.hy);
      }
      if (s.look.limb === 'fist' || weapon === 'stock' || weapon === 'anchor') {
        // punches: a shock ring bursting round the fist, flattened along the punch
        const k = Math.min(1, s.prog * 1.4 + s.after * 0.15);
        const rr = 3 + 9 * k * (s.heavy ? 1.3 : 1);
        const rot = Math.atan2(s.ny, s.nx);
        ellipse(g, s.hx - s.nx * 2, s.hy - s.ny * 2, rr * 0.45, rr, rot, 0xffffff, 0.85 * (1 - k * 0.8) * fade, 1.5);
        ellipse(g, s.hx - s.nx * 5, s.hy - s.ny * 5, rr * 0.3, rr * 0.7, rot, layers[1][1], 0.6 * (1 - k * 0.7) * fade, 1);
      }
      if (lunge) {
        // the dash attack: speed lines streaming behind the body
        const bx = f.x - fc * 8;
        const top = f.y - f.h * f.sizeMul * 0.85;
        for (let k = 0; k < 5; k++) {
          const yy = top + (f.h * f.sizeMul * 0.8 * (k + 0.5)) / 5;
          const l = 14 + ((k * 7 + tick * 3) % 13) * 1.6;
          g.lineStyle(k % 2 ? 1 : 1.5, k % 2 ? 0xffffff : layers[1][1], (k % 2 ? 0.55 : 0.7) * fade);
          g.lineBetween(bx - fc * 2, yy, bx - fc * (2 + l), yy);
        }
      }
      if (weapon) weaponHead(g, weapon, s.hx, s.hy, s.nx, s.ny, fade, hot, tick);
      for (let i = 1; i <= 4; i++) nd = pushDeco(deco, nd, tx + (s.hx - tx) * (i / 5), ty + (s.hy - ty) * (i / 5), i / 5, -s.ny, s.nx);
      return nd;
    }
    case 'spike': {
      // dair: a downward spike from the body through the hitbox, with two chevron streaks closing in on its point
      const top = f.y - f.h * f.sizeMul * 0.45;
      const ax = s.hx;
      const ay = top + (s.hy + 6 - top) * (0.4 + 0.6 * s.prog);
      const wid = Math.min(16, Math.max(8, r4[2] * 0.55)) * wm;
      // (a needle's point is its tail: the point goes at the bottom, the wide end up at the body)
      needle(g, layers, ax, ay, ax, top, wid, fade);
      for (let k = -1; k <= 1; k += 2) {
        g.lineStyle(1.5, k < 0 ? 0xffffff : layers[1][1], 0.8 * fade);
        g.lineBetween(ax + k * wid * 1.1, top + 2, ax + k * 1.5, ay - 3);
      }
      glint(g, ax, ay, 5 * fade, 0xffffff, 0.9 * fade);
      for (let i = 1; i <= 4; i++) nd = pushDeco(deco, nd, ax + (i % 2 ? -1 : 1) * wid * 0.4, top + (ay - top) * (i / 5), i / 5, i % 2 ? -1 : 1, 0.2);
      s.hy = ay;
      s.nx = 0;
      s.ny = 1;
      return nd;
    }
    case 'split': {
      // down-smash: twin arcs splitting from the feet out along the floor, both ways
      const w = Math.min(12, Math.max(6, r4[3] * 0.6 + 3)) * wm;
      const ry = 0.32;
      band(g, layers, s.px, s.py, 1, s.r, ry, s.tail, s.head, w, fade);
      band(g, layers, s.px, s.py, -1, s.r, ry, s.tail, s.head, w, fade);
      hairline(g, s.px, s.py, 1, s.r, ry, s.tail, s.head, w * 0.5, 0.5, 0xffffff, 0.7 * fade);
      hairline(g, s.px, s.py, -1, s.r, ry, s.tail, s.head, w * 0.5, 0.5, 0xffffff, 0.7 * fade);
      nd = arcDeco(deco, s.px, s.py, 1, s.r, ry, s.tail, s.head, w);
      return nd;
    }
    default:
      break;
  }
  // the curved shapes: arc, sweep, fan, ring
  const ring = shape === 'ring' && s.look.basic;
  const ry = ring ? Math.max(0.55, Math.min(1, r4[3] / Math.max(1, r4[2]))) : 1;
  const px = ring ? r4[0] + r4[2] / 2 : s.px;
  const py = ring ? r4[1] + r4[3] / 2 : s.py;
  const width = Math.min(13, Math.max(5, Math.min(r4[2], r4[3]) * 0.5 + (s.heavy ? 3 : 0))) * wm * (shape === 'sweep' ? 1.15 : ring ? 0.8 : 1);
  band(g, layers, px, py, fc, s.r, ry, s.tail, s.head, width, fade);
  if (shape === 'fan') {
    // the fan's ribs: thin spokes from the pivot opening out behind the head
    for (let k = 1; k <= 3; k++) {
      const a = s.tail + (s.head - s.tail) * (k / 3.6);
      const al = 0.5 * fade * (k / 3);
      g.lineStyle(1, k === 3 ? 0xffffff : layers[1][1], al);
      g.lineBetween(px + Math.cos(a) * s.r * 0.35 * fc, py + Math.sin(a) * s.r * 0.35, px + Math.cos(a) * (s.r - width * 0.3) * fc, py + Math.sin(a) * (s.r - width * 0.3));
    }
  }
  if (s.heavy && !ring) {
    // a heavy swing throws a thinner shock arc just outside the first: the air it displaces, led by the head
    const sr = s.r + width * 0.95;
    const sTail = s.head - (s.head - s.tail) * 0.6;
    band(g, SHOCK(layers), px, py, fc, sr, ry, sTail, s.head, width * 0.32, fade);
  }
  if (weapon !== 'blade') hairline(g, px, py, fc, s.r, ry, s.tail, s.head, width * layers[layers.length - 1][0], 0.5, 0xffffff, 0.7 * fade);
  else {
    // a blade: a razor edge on both sides of the band
    hairline(g, px, py, fc, s.r, ry, s.tail, s.head, width * layers[layers.length - 1][0], 0.2, 0xffffff, 0.9 * fade);
    hairline(g, px, py, fc, s.r - width * 0.35, ry, s.tail, s.head, 0, 0.55, 0xdff6ff, 0.6 * fade);
  }
  nd = arcDeco(deco, px, py, fc, s.r, ry, s.tail, s.head, width);
  s.hx = px + Math.cos(s.head) * s.r * fc;
  s.hy = py + Math.sin(s.head) * s.r * ry;
  // tangent at the head (direction of travel): for the weapon heads
  const dir = s.head >= s.tail ? 1 : -1;
  const tx = -Math.sin(s.head) * fc * dir;
  const ty = Math.cos(s.head) * ry * dir;
  if (weapon) weaponHead(g, weapon, s.hx, s.hy, tx, ty, fade, hot, tick);
  return nd;
}

const SHOCK_L: [number, number, number][] = [[1, 0xffffff, 0.45]];
function SHOCK(layers: Layers): Layers {
  SHOCK_L[0][1] = layers[1][1];
  return SHOCK_L;
}

function pushDeco(deco: Deco[], nd: number, x: number, y: number, t: number, nx: number, ny: number): number {
  if (nd >= deco.length) return nd;
  const d = deco[nd];
  d.x = x;
  d.y = y;
  d.t = t;
  d.nx = nx;
  d.ny = ny;
  return nd + 1;
}

/** The weapon's own head at the front of its trail, pointing along (ux, uy). */
function weaponHead(g: G, w: string, x: number, y: number, ux: number, uy: number, fade: number, hot: number, tick: number): void {
  const d = Math.hypot(ux, uy) || 1;
  ux /= d;
  uy /= d;
  const vx = -uy;
  const vy = ux;
  switch (w) {
    case 'spear': {
      // a bright leaf-shaped spearhead
      const q = QUAD;
      q[0].x = x + ux * 7;
      q[0].y = y + uy * 7;
      q[1].x = x + vx * 2.6;
      q[1].y = y + vy * 2.6;
      q[2].x = x - ux * 3;
      q[2].y = y - uy * 3;
      q[3].x = x - vx * 2.6;
      q[3].y = y - vy * 2.6;
      g.fillStyle(hot, 0.7 * fade).fillPoints(q as Phaser.Geom.Point[], true);
      g.lineStyle(1, 0xffffff, 0.95 * fade).lineBetween(x - ux * 2, y - uy * 2, x + ux * 6.5, y + uy * 6.5);
      break;
    }
    case 'anchor': {
      // the anchor's crown: a fluke crescent across the head and the shank behind it, with chain links trailing
      g.lineStyle(2, hot, 0.85 * fade);
      g.lineBetween(x - ux * 7, y - uy * 7, x + ux * 2, y + uy * 2);
      g.lineBetween(x + vx * 5 - ux * 1, y + vy * 5 - uy * 1, x + ux * 2.5, y + uy * 2.5);
      g.lineBetween(x - vx * 5 - ux * 1, y - vy * 5 - uy * 1, x + ux * 2.5, y + uy * 2.5);
      g.fillStyle(0xffffff, 0.9 * fade);
      g.fillRect(x + vx * 5 - ux - 1, y + vy * 5 - uy - 1, 2, 2);
      g.fillRect(x - vx * 5 - ux - 1, y - vy * 5 - uy - 1, 2, 2);
      for (let k = 1; k <= 3; k++) g.fillRect(x - ux * (8 + k * 4) - 0.75, y - uy * (8 + k * 4) - 0.75, 1.5, 1.5);
      break;
    }
    case 'blade':
      glint(g, x, y, 6.5 * fade, 0xffffff, 0.95 * fade);
      break;
    case 'stock': {
      // a gun-stock bash: a squared butt plate and three impact ticks
      const q = QUAD;
      q[0].x = x + vx * 4;
      q[0].y = y + vy * 4;
      q[1].x = x + vx * 4 + ux * 2.5;
      q[1].y = y + vy * 4 + uy * 2.5;
      q[2].x = x - vx * 4 + ux * 2.5;
      q[2].y = y - vy * 4 + uy * 2.5;
      q[3].x = x - vx * 4;
      q[3].y = y - vy * 4;
      g.fillStyle(0xffffff, 0.85 * fade).fillPoints(q as Phaser.Geom.Point[], true);
      g.lineStyle(1, hot, 0.85 * fade);
      for (let k = -1; k <= 1; k++) {
        const ax = ux + vx * k * 0.7;
        const ay = uy + vy * k * 0.7;
        const j = (tick + k) & 1;
        g.lineBetween(x + ax * (5 + j), y + ay * (5 + j), x + ax * (9 + j), y + ay * (9 + j));
      }
      break;
    }
    case 'claw':
      for (let k = -1; k <= 1; k++) g.lineStyle(1, 0xffffff, 0.8 * fade).lineBetween(x + vx * k * 3, y + vy * k * 3, x + vx * k * 3 + ux * 6, y + vy * k * 3 + uy * 6);
      break;
    default:
      break;
  }
}

/** Floor cracks after a down-smash: slots per fighter, drawn for CRACK_TICKS ticks. */
export const CRACK_TICKS = 22;
/** Unit zigzag offsets for a crack running out along the floor: [along, down] pairs. */
const CRACK_PATH = [0, 0, 0.18, 0.6, 0.34, -0.2, 0.52, 0.8, 0.7, 0.1, 0.86, 0.9, 1, 0.4];

/** A crack and a ripple running out both ways from x along the floor at y (age in ticks, length in world units). */
export function drawCrack(g: G, x: number, y: number, age: number, len: number, col: number): void {
  const t = age / CRACK_TICKS;
  if (t >= 1) return;
  const grow = Math.min(1, age / 4);
  const a = (1 - t) * (1 - t);
  for (let side = -1; side <= 1; side += 2) {
    let n = 0;
    for (let i = 0; i < CRACK_PATH.length; i += 2) {
      const p = LINE[n++];
      p.x = x + side * (4 + CRACK_PATH[i] * len * grow);
      p.y = y + CRACK_PATH[i + 1] * 2.2;
    }
    g.lineStyle(1.5, col, 0.75 * a);
    g.strokePoints(LINE as Phaser.Geom.Point[], false, false, n);
    // a short branch off the middle
    g.lineStyle(1, 0xffffff, 0.6 * a);
    g.lineBetween(LINE[3].x, LINE[3].y, LINE[3].x + side * len * 0.12 * grow, LINE[3].y + 2.5);
  }
  // the floor ripple: a flat ring spreading out
  const e = 1 - (1 - t) * (1 - t) * (1 - t);
  ellipse(g, x, y + 0.5, 6 + len * 1.3 * e, 1.6 + 2.4 * e, 0, col, 0.7 * (1 - t), 1.5);
  ellipse(g, x, y + 0.5, 4 + len * 0.9 * e, 1.2 + 1.8 * e, 0, 0xffffff, 0.5 * (1 - t), 1);
}
