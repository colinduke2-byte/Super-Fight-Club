import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import type { Fighter } from '../engine/fighter';
import type { FighterView } from './FighterView';
import { fastShapes } from './fastShapes';
import { tauntLines } from '../game/story';
import { settings } from '../settings';

const SHOW_MS = 2200;

/**
 * Speech bubbles: a fighter who taunts says one of their lines (CharacterData.persona.taunts, taking turns) above their
 * head for a couple of seconds.
 */
export class TauntBubbles {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.BitmapText[];
  private readonly until: number[];
  /** Each fighter's taunt lines (pre-wrapped) and the one said next. */
  private readonly lines: string[][];
  private readonly next: number[];

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly fighters: Fighter[],
    private readonly views: FighterView[],
  ) {
    this.g = fastShapes(scene.add.graphics());
    layer.add(this.g);
    this.lines = fighters.map((f) => tauntLines(f.data.id).map((l) => up(wrap(l, 22))));
    this.next = fighters.map(() => 0);
    this.texts = fighters.map((f) => {
      const t = scene.add.bitmapText(0, 0, PIXEL_FONT, this.lines[f.id][0]).setOrigin(0.5, 0).setCenterAlign().setTint(0xfff4d8).setVisible(false);
      layer.add(t);
      return t;
    });
    this.until = fighters.map(() => 0);
  }

  /** Fighter `id` just taunted. */
  say(id: number, now: number): void {
    const lines = this.lines[id];
    const t = this.texts[id];
    if (lines?.length && t) {
      // a new taunt while the last bubble still shows keeps that line up (mashing taunt does not flip through them)
      if (this.until[id] <= now) {
        t.setText(lines[this.next[id] % lines.length]);
        this.next[id]++;
      }
    }
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
      // pop in (a short rise, none with REDUCE MOTION), hold, fade out; the text keeps a whole-number scale (crisp glyphs)
      const age = SHOW_MS - left;
      const pop = settings.reduceMotion ? 1 : Math.min(1, age / 120);
      const a = Math.min(1, left / 300);
      const ts = Math.max(1, Math.round(u));
      const p = Math.max(1, Math.round(u / 2)); // the bubble's pixel
      const rise = Math.round((1 - pop) * 4 * u);
      t.setScale(ts).setAlpha(a).setVisible(true);
      const w = Math.round(t.width + 8 * u);
      const h = Math.round(t.height + 6 * u);
      const bx = Math.round(Math.max(4, Math.min(sw - w - 4, sx - w / 2)));
      const by = Math.round(Math.max(4, sy - 6 * u - t.height - 3 * u) + rise);
      t.setPosition(bx + Math.round(w / 2), by + Math.round(3 * u));
      // the tail stays under the bubble even when the bubble is pushed in from a screen edge
      const tx = Math.round(Math.max(bx + 5 * p, Math.min(bx + w - 5 * p, sx)));
      const tl = 5 * p;
      // a dark plate edged in cream: the pixel font's baked dark outline sinks into the plate and the light letters read
      // cleanly (dark letters on light paper would merge with their own outlines)
      const edge = 0xfff0d0;
      const fill = 0x17132e;
      // pixel-art bubble: an outlined box with stepped corners, a shaded lower edge and an outlined tail
      g.fillStyle(edge, 0.95 * a);
      g.fillRect(bx + 2 * p, by - p, w - 4 * p, h + 2 * p);
      g.fillRect(bx - p, by + 2 * p, w + 2 * p, h - 4 * p);
      g.fillRect(bx, by, w, h);
      g.fillTriangle(tx - 4 * p, by + h, tx + 4 * p, by + h, tx, by + h + tl + 2 * p);
      g.fillStyle(fill, a);
      g.fillRect(bx + 2 * p, by, w - 4 * p, h);
      g.fillRect(bx, by + 2 * p, w, h - 4 * p);
      g.fillRect(bx + p, by + p, w - 2 * p, h - 2 * p);
      g.fillTriangle(tx - 3 * p, by + h - p, tx + 3 * p, by + h - p, tx, by + h + tl);
      // a soft shade along the bottom edge, broken where the tail joins
      g.fillStyle(0x0c0a1c, a).fillRect(bx + 2 * p, by + h - p, Math.max(0, tx - 3 * p - (bx + 2 * p)), p);
      g.fillRect(tx + 3 * p, by + h - p, Math.max(0, bx + w - 2 * p - (tx + 3 * p)), p);
      g.fillStyle(0x3a3470, a).fillRect(bx + 2 * p, by + p, Math.min(6 * p, w - 4 * p), p);
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
