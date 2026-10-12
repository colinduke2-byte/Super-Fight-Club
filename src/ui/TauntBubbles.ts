import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import type { Fighter } from '../engine/fighter';
import type { FighterView } from './FighterView';

const SHOW_MS = 2200;

/** Speech bubbles: a fighter who taunts says their line (CharacterData.persona.taunt) above their head for a couple of seconds. */
export class TauntBubbles {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.BitmapText[];
  private readonly until: number[];

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly fighters: Fighter[],
    private readonly views: FighterView[],
  ) {
    this.g = scene.add.graphics();
    layer.add(this.g);
    this.texts = fighters.map((f) => {
      const t = scene.add.bitmapText(0, 0, PIXEL_FONT, up(wrap(f.data.persona?.taunt ?? 'COME ON!', 22))).setOrigin(0.5, 1).setCenterAlign().setTint(0x1a1630).setVisible(false);
      layer.add(t);
      return t;
    });
    this.until = fighters.map(() => 0);
  }

  /** Fighter `id` just taunted. */
  say(id: number, now: number): void {
    this.until[id] = now + SHOW_MS;
  }

  update(now: number, view: Phaser.Geom.Rectangle, sw: number, sh: number, u: number): void {
    const g = this.g;
    g.clear();
    for (const f of this.fighters) {
      const t = this.texts[f.id];
      const left = this.until[f.id] - now;
      if (left <= 0 || f.state === 'ko') {
        t.setVisible(false);
        continue;
      }
      const v = this.views[f.id];
      const sx = ((v.x - view.x) / Math.max(1, view.width)) * sw;
      const sy = ((v.y - f.h * f.sizeMul - 22 - view.y) / Math.max(1, view.height)) * sh;
      // pop in, hold, fade out
      const age = SHOW_MS - left;
      const pop = Math.min(1, age / 120);
      const a = Math.min(1, left / 300);
      const s = u * (0.75 + 0.25 * pop);
      t.setScale(s).setPosition(sx, sy - 6 * u).setAlpha(a).setVisible(true);
      const w = t.width + 8 * u;
      const h = t.height + 6 * u;
      const bx = Math.max(4, Math.min(sw - w - 4, sx - w / 2));
      const by = sy - 6 * u - t.height - 3 * u;
      t.setX(bx + w / 2);
      g.fillStyle(0x1a1630, 0.9 * a).fillRoundedRect(bx - u, by - u, w + 2 * u, h + 2 * u, 4 * u);
      g.fillStyle(0xfff8e8, a).fillRoundedRect(bx, by, w, h, 3 * u);
      g.fillStyle(0xfff8e8, a).fillTriangle(sx - 3 * u, by + h - 1, sx + 3 * u, by + h - 1, sx, by + h + 5 * u);
    }
  }
}

function wrap(s: string, per: number): string {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if (line && (line + ' ' + w).length > per) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out.join('\n');
}
