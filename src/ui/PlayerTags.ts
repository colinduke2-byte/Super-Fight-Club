import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import type { Fighter } from '../engine/fighter';
import type { FighterView } from './FighterView';
import { drawPortShape, portOfColor } from './menuKit';
import { settings } from '../settings';

/** A tag's short form for crowded (3-4 fighter) matches: 'CPU3' -> 'C3', 'DUMMY' -> 'DUM'. */
export function shortTag(label: string): string {
  const m = /^CPU(\d)$/.exec(label);
  if (m) return `C${m[1]}`;
  if (label === 'DUMMY') return 'DUM';
  return label;
}

/** "P1" / "CPU" tags with a pointer above each fighter's head, in their colour, drawn at a constant screen size. */
export class PlayerTags {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.BitmapText[];
  /** x, y, half-width of the tags already drawn this frame (flat, reused every frame). */
  private readonly placed: number[] = [];
  /** Fighter id of each combo readout at the start of `placed`. */
  private readonly owners: number[] = [];
  /** READY entrances: per fighter world offset and opacity of the body, which the tag follows (see entrance()). */
  private readonly entX: number[];
  private readonly entY: number[];
  private readonly entA: number[];
  /** Per fighter: how far (world px) the tag currently sits above the head (eased back down after a combo). */
  private readonly lift: number[];
  /** Port (0..3) of each fighter's colour: decides its shape. */
  private readonly ports: number[];

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly fighters: Fighter[],
    private readonly views: FighterView[],
    labels: string[],
    private readonly colors: number[],
  ) {
    this.entX = fighters.map(() => 0);
    this.entY = fighters.map(() => 0);
    this.entA = fighters.map(() => 1);
    this.lift = fighters.map(() => -1);
    this.g = scene.add.graphics();
    layer.add(this.g);
    const crowded = fighters.length >= 3;
    this.ports = colors.map((c, i) => {
      const p = portOfColor(c);
      return p >= 0 ? p : i % 4;
    });
    this.texts = labels.map((l, i) => {
      const t = scene.add.bitmapText(0, 0, PIXEL_FONT, crowded ? shortTag(l) : l).setOrigin(0.5, 1).setTint(colors[i]);
      layer.add(t);
      return t;
    });
  }

  /** During READY: the fighter's body is drawn shifted by (dx, dy) at opacity `a`; its tag arrives with it. */
  entrance(id: number, dx: number, dy: number, a: number): void {
    this.entX[id] = dx;
    this.entY[id] = dy;
    this.entA[id] = a;
  }

  /** The entrances are over: tags back on the fighters. */
  endEntrances(): void {
    this.entX.fill(0);
    this.entY.fill(0);
    this.entA.fill(1);
  }

  update(view: Phaser.Geom.Rectangle, sw: number, sh: number, u: number): void {
    const g = this.g;
    g.clear();
    const placed = this.placed;
    placed.length = 0;
    // "N HITS" combo readouts (drawn by the fighter views) count as placed, so a neighbour's tag stacks clear of them
    const zx = sw / Math.max(1, view.width);
    const zy = sh / Math.max(1, view.height);
    const owners = this.owners;
    owners.length = 0;
    for (const f of this.fighters) {
      if (f.state === 'ko' || f.comboHits < 3) continue;
      const v = this.views[f.id];
      placed.push((v.x - view.x) * zx, (v.y - f.h * f.sizeMul - 14 - view.y) * zy + 4 * u, 11 * zx);
      owners.push(f.id);
    }
    for (const f of this.fighters) {
      const t = this.texts[f.id];
      const v = this.views[f.id];
      // clear the head, the floating counter (Scrap) and the "N HITS" combo readout when one is up
      const want = f.state !== 'ko' && f.comboHits >= 3 ? 21 : f.data.counter ? 15 : 7;
      // rises at once (never over the readout), settles back down gently when the combo ends
      this.lift[f.id] = this.lift[f.id] < 0 || want > this.lift[f.id] ? want : this.lift[f.id] + (want - this.lift[f.id]) * 0.3;
      const sx = ((v.x + this.entX[f.id] - view.x) / Math.max(1, view.width)) * sw;
      let sy = ((v.y + this.entY[f.id] - f.h * f.sizeMul - this.lift[f.id] - view.y) / Math.max(1, view.height)) * sh;
      const shape = settings.portShapes;
      const k1 = this.fighters.length >= 3 ? 1 : 1.1;
      t.setScale(u * k1);
      // the shape sits left of the label inside the tag
      const shapeW = shape ? 6 * u : 0;
      const hw = (t.width || 20 * u) / 2 + shapeW / 2 + 3 * u;
      // tags that would overlap (fighters standing close together): a small overlap slides the tag sideways, a big one
      // stacks it above (a thin leader keeps it tied to its fighter)
      const headX = sx;
      const headY = sy;
      let tx = sx;
      for (let k = 0; k < placed.length; k += 3) {
        if (owners[k / 3] === f.id) continue; // its own readout: the eased lift above already clears it
        const px = placed[k];
        const py = placed[k + 1];
        const phw = placed[k + 2];
        const need = hw + phw - Math.abs(px - tx);
        if (need > 0 && Math.abs(py - sy) < 11 * u) {
          if (need < hw * 0.6 && tx === sx) tx += px <= tx ? need : -need;
          else {
            tx = sx;
            sy = py - 11 * u;
          }
          k = -3; // re-check against everything with the new spot
        }
      }
      placed.push(tx, sy, hw);
      const on = f.state !== 'ko' && this.entA[f.id] > 0.05 && headX > 0 && headX < sw && sy > 8 * u && headY < sh;
      t.setVisible(on);
      if (!on) continue;
      const a = (f.invuln > 0 ? 0.6 : 0.95) * Math.min(1, this.entA[f.id]);
      t.setPosition(tx + shapeW / 2, sy - 4 * u).setAlpha(a);
      const bw = t.width + shapeW + 4 * u;
      const bx = tx - bw / 2;
      g.fillStyle(0x0c0a1c, 0.55 * a).fillRect(bx, sy - 4 * u - t.height - 1.5 * u, bw, t.height + 2.5 * u);
      if (shape) drawPortShape(g, this.ports[f.id], bx + 2 * u + 2.5 * u, sy - 4 * u - t.height / 2, 2 * u, this.colors[f.id], a, Math.max(1, u * 0.6));
      const col = this.colors[f.id];
      if (Math.abs(sy - headY) > u || Math.abs(tx - headX) > u) {
        // displaced: a leader line from the tag down to the pointer over the head
        g.lineStyle(Math.max(1, u * 0.6), col, 0.7 * a).lineBetween(tx, sy - 3 * u, headX, headY - 3 * u);
        g.fillStyle(col, a).fillTriangle(headX - 2.5 * u, headY - 3 * u, headX + 2.5 * u, headY - 3 * u, headX, headY);
      } else g.fillStyle(col, a).fillTriangle(sx - 3 * u, sy - 3 * u, sx + 3 * u, sy - 3 * u, sx, sy);
    }
  }
}
