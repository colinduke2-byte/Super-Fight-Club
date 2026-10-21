import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { Button } from '../engine/buttons';
import { COLORS, drawPanel, hudUnit, textPx } from './menuKit';

/** One line of a summary: its text and colour. */
export type SummaryLine = [string, number];

/** What the panel needs from the match scene (kept narrow so it can be tested and reused). */
export interface SummaryHost {
  scene: Phaser.Scene;
  layer: Phaser.GameObjects.Layer;
  /** The humans' inputs this tick (any Attack / Jump / Special press continues). */
  inputs: () => { pressed: number }[];
}

/**
 * End-of-run summary for the practice modes (Launch Contest attempts, take-turns standings): a panel in the middle of the
 * screen with a title and lines, held until a player presses a button (or taps), then `done` runs.
 */
export class RunSummary {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.BitmapText;
  private readonly body: Phaser.GameObjects.BitmapText[] = [];
  private readonly foot: Phaser.GameObjects.BitmapText;
  private shownAt = -1;
  private tapped = false;
  visible = false;

  constructor(private readonly host: SummaryHost) {
    const s = host.scene;
    this.g = s.add.graphics().setDepth(2000);
    this.title = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setTint(COLORS.title).setDepth(2001);
    this.foot = s.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 1).setTint(COLORS.hint).setDepth(2001);
    host.layer.add([this.g, this.title, this.foot]);
    const tap = (): void => {
      if (this.visible) this.tapped = true;
    };
    s.input.on(Phaser.Input.Events.POINTER_DOWN, tap);
    s.events.once(Phaser.Scenes.Events.SHUTDOWN, () => s.input?.off(Phaser.Input.Events.POINTER_DOWN, tap));
    this.hide();
  }

  show(title: string, lines: SummaryLine[], foot = 'PRESS ATTACK TO CONTINUE'): void {
    const s = this.host.scene;
    for (const t of this.body) t.destroy();
    this.body.length = 0;
    for (const [str, col] of lines) {
      const t = s.add.bitmapText(0, 0, PIXEL_FONT, up(str)).setOrigin(0.5, 0).setTint(col).setDepth(2001);
      this.host.layer.add(t);
      this.body.push(t);
    }
    this.title.setText(up(title));
    this.foot.setText(up(foot));
    this.visible = true;
    this.tapped = false;
    this.shownAt = performance.now();
    this.layout();
  }

  hide(): void {
    this.visible = false;
    this.g.setVisible(false);
    this.title.setVisible(false);
    this.foot.setVisible(false);
    for (const t of this.body) t.setVisible(false);
  }

  /** Per tick while shown: true once a player asked to continue (a short lock-out first, so a held button does not skip it). */
  continued(): boolean {
    if (!this.visible || performance.now() - this.shownAt < 700) return false;
    if (this.tapped) return true;
    const any = Button.Attack | Button.Jump | Button.Special;
    return this.host.inputs().some((i) => (i.pressed & any) !== 0);
  }

  layout(): void {
    if (!this.visible) return;
    const s = this.host.scene;
    const w = s.scale.width;
    const h = s.scale.height;
    const u = hudUnit(h);
    const all = [this.title, ...this.body, this.foot];
    const widest = Math.max(...all.map((t) => textPx(t)), 40);
    const k = Math.min(u * 1.4, (w * 0.86) / widest);
    const lineH = 9 * k;
    const pw = widest * k + 24 * u;
    const ph = lineH * (this.body.length + 4.4) + 12 * u;
    const x = w / 2 - pw / 2;
    const y = Math.max(8 * u, h * 0.46 - ph / 2);
    const g = this.g.clear().setVisible(true);
    drawPanel(g, x, y, pw, ph, u, 0.94);
    this.title.setScale(k * 1.3).setPosition(w / 2, y + 6 * u).setVisible(true);
    this.body.forEach((t, i) => t.setScale(k).setPosition(w / 2, y + 6 * u + lineH * (i + 2)).setVisible(true));
    this.foot.setScale(k * 0.85).setPosition(w / 2, y + ph - 6 * u).setVisible(true);
  }
}
