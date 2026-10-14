import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import type { Fighter } from '../engine/fighter';
import type { FighterView } from './FighterView';

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
    this.texts = labels.map((l, i) => {
      const t = scene.add.bitmapText(0, 0, PIXEL_FONT, l).setOrigin(0.5, 1).setTint(colors[i]);
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
      // stack tags that would overlap (fighters standing close together)
      const hw = (t.width || 20 * u) / 2 + 3 * u;
      for (let k = 0; k < placed.length; k += 3) {
        if (owners[k / 3] === f.id) continue; // its own readout: the eased lift above already clears it
        const px = placed[k];
        const py = placed[k + 1];
        const phw = placed[k + 2];
        if (Math.abs(px - sx) < hw + phw && Math.abs(py - sy) < 11 * u) {
          sy = py - 11 * u;
          k = -3; // re-check against everything with the new height
        }
      }
      placed.push(sx, sy, hw);
      const on = f.state !== 'ko' && this.entA[f.id] > 0.05 && sx > 0 && sx < sw && sy > 8 * u && sy < sh;
      t.setVisible(on);
      if (!on) continue;
      const a = (f.invuln > 0 ? 0.6 : 0.95) * Math.min(1, this.entA[f.id]);
      t.setScale(u * 1.1).setPosition(sx, sy - 4 * u).setAlpha(a);
      g.fillStyle(0x0c0a1c, 0.55 * a).fillRect(sx - t.width / 2 - 2 * u, sy - 4 * u - t.height - 1.5 * u, t.width + 4 * u, t.height + 2.5 * u);
      g.fillStyle(this.colors[f.id], a).fillTriangle(sx - 3 * u, sy - 3 * u, sx + 3 * u, sy - 3 * u, sx, sy);
    }
  }
}
