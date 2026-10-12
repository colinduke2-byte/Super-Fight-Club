import type Phaser from 'phaser';
import { hitboxEnd, hitboxStart } from '../engine/moves';
import { hitboxActive, hitboxRect } from '../engine/combat';
import type { World } from '../engine/world';
import { fighterTrailColor } from '../fx/runner';

const r4 = [0, 0, 0, 0];
/** [width multiplier, colour, alpha] from the outside in. */
const FIRE_LAYERS = [[1.6, 0xff2a10, 0.38], [1.05, 0xff7a1a, 0.75], [0.5, 0xfff0a0, 0.95]] as const;
const N = 14;

/**
 * Tapered crescent "swoosh" drawn along each live hitbox: a bright head sweeps an arc around the fighter's chest with a long
 * fading tail (soft coloured glow outside, white core inside). Redrawn every render frame from the sim state; purely visual.
 */
export class SlashArcs {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.g = scene.add.graphics().setDepth(50).setBlendMode(1 /* ADD */);
    layer.add(this.g);
  }

  update(world: World): void {
    const g = this.g;
    g.clear();
    for (const f of world.fighters) {
      const m = f.move;
      if (f.state !== 'attack' || !m) continue;
      const fire = f.data.fx?.slash === 'fire';
      const col = fire ? 0xff7a1a : fighterTrailColor(f, world.tick);
      // fire: red rim, orange body, yellow-hot core; plain: the trail colour around a white core
      const layers = fire ? FIRE_LAYERS : ([[1.5, col, 0.35], [1, col, 0.7], [0.45, 0xffffff, 0.95]] as const);
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
        const style = m.view?.arc ?? 'curve';
        if (style === 'none') continue;
        const dir = m.kind === 'aerial' && hb.y > 0 ? -1 : 1;
        if (style === 'line') {
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
          const wid = Math.min(10, Math.max(4, Math.min(r4[2], r4[3]) * 0.4));
          const fadeLine = after > 0 ? 1 - after / 6 : 1;
          for (const [mulW0, c, a] of layers) {
            const w = (wid * mulW0 * 0.93) / 2;
            g.fillStyle(c, a * fadeLine);
            g.fillPoints([{ x: tx, y: ty }, { x: hx + px * w, y: hy + py * w }, { x: hx + ux * f.facing * 4, y: hy + uy * 4 }, { x: hx - px * w, y: hy - py * w }] as Phaser.Geom.Point[], true);
          }
          if (fire) {
            // flames licking up off the streak
            for (let i = 1; i <= 4; i++) {
              const t = i / 5;
              const fx0 = tx + (hx - tx) * t;
              const fy0 = ty + (hy - ty) * t;
              const fl = (4 + 5 * t) * fadeLine * (0.7 + 0.3 * Math.sin(world.tick * 1.7 + i * 2.1));
              g.fillStyle(i % 2 ? 0xffb030 : 0xff5a1a, 0.7 * fadeLine);
              g.fillTriangle(fx0 - 2.5, fy0, fx0 + 2.5, fy0, fx0 + Math.sin(world.tick * 0.9 + i) * 2, fy0 - fl);
            }
          }
          continue;
        }
        const head = centre + span * (2 * prog - 1) * dir;
        const tail = Math.max(centre - span, Math.min(centre + span, head - span * 1.5 * dir));
        const fade = after > 0 ? 1 - after / 6 : 1;
        const heavy = hb.damage >= 12 || m.kind === 'smash';
        const width = Math.min(13, Math.max(5, Math.min(r4[2], r4[3]) * 0.5 + (heavy ? 3 : 0)));
        for (const [mulW, c, a] of layers) {
          const outer: [number, number][] = [];
          const inner: [number, number][] = [];
          for (let i = 0; i <= N; i++) {
            const t = i / N;
            const ang = tail + (head - tail) * t;
            const w = width * mulW * Math.pow(t, 1.1);
            const rr = r + 0 * w;
            const cx = Math.cos(ang);
            const cy = Math.sin(ang);
            outer.push([chestX + cx * (rr + w / 2) * f.facing, chestY + cy * (rr + w / 2)]);
            inner.push([chestX + cx * (rr - w / 2) * f.facing, chestY + cy * (rr - w / 2)]);
          }
          const pts = [...outer, ...inner.reverse()].map(([x, y]) => ({ x, y }));
          g.fillStyle(c, a * fade);
          g.fillPoints(pts as Phaser.Geom.Point[], true);
        }
        if (fire) {
          // flame tongues rising off the outer edge of the crescent, flickering per tick
          for (let i = 3; i <= N; i += 2) {
            const t = i / N;
            const ang = tail + (head - tail) * t;
            const w = width * Math.pow(t, 1.1);
            const ox = chestX + Math.cos(ang) * (r + w / 2) * f.facing;
            const oy = chestY + Math.sin(ang) * (r + w / 2);
            const fl = (3 + 7 * t) * fade * (0.65 + 0.35 * Math.sin(world.tick * 1.9 + i * 1.3));
            g.fillStyle(i % 4 === 1 ? 0xffc040 : 0xff5a1a, 0.75 * fade);
            g.fillTriangle(ox - 2.4, oy, ox + 2.4, oy, ox + Math.sin(world.tick * 0.8 + i) * 2.5, oy - fl);
          }
        }
      }
    }
  }
}
