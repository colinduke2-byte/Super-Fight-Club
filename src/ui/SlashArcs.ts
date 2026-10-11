import type Phaser from 'phaser';
import { hitboxEnd, hitboxStart } from '../engine/moves';
import { hitboxActive, hitboxRect } from '../engine/combat';
import type { World } from '../engine/world';
import { fighterTrailColor } from '../fx/runner';

const r4 = [0, 0, 0, 0];
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
      const col = fighterTrailColor(f, world.tick);
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
        const r = Math.max(10, Math.hypot(dx, dy));
        const centre = Math.atan2(dy, dx);
        const span = Math.min(1.25, Math.max(0.5, (Math.max(r4[2], r4[3]) * 0.95) / (r + 6)));
        const prog = after > 0 ? 1 : a1 > a0 ? Math.min(1, Math.max(0, (f.moveFrame - a0) / (a1 - a0 + 1))) : 0.6;
        const dir = m.kind === 'aerial' && hb.y > 0 ? -1 : 1;
        const head = centre + span * (2 * prog - 1) * dir;
        const tail = Math.max(centre - span, Math.min(centre + span, head - span * 1.5 * dir));
        const fade = after > 0 ? 1 - after / 6 : 1;
        const heavy = hb.damage >= 12 || m.kind === 'smash';
        const width = Math.min(13, Math.max(5, Math.min(r4[2], r4[3]) * 0.5 + (heavy ? 3 : 0)));
        for (const [mulW, c, a] of [[1.5, col, 0.35], [1, col, 0.7], [0.45, 0xffffff, 0.95]] as const) {
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
      }
    }
  }
}
