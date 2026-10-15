import Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { sfx } from '../audio/sfx';
import type { MenuEvent } from '../input/menuInput';
import { footerHint } from '../input/prompts';
import { COLORS, drawPanel, MenuList, pointerXY, textPx, type MenuItem } from './menuKit';

/** One screen of the training menu: a title and its rows (`back` = what the back button does on this page). */
export interface TrainingMenuPage {
  title: string;
  items: MenuItem[];
  /** Text shown under the rows (trial steps, recording state...). */
  info?: () => string;
  back?: () => void;
}

/**
 * The training side menu: a panel down the right of the screen with a page of rows (driven by menu input and by mouse /
 * touch through MenuList), a title, an info block and a footer of live prompts. Also owns the small "MENU" chip in the
 * top-right corner that opens it with a click / tap. It is presentation only: TrainingTools builds the pages and freezes
 * the match while it is open.
 */
export class TrainingMenu {
  readonly list: MenuList;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.BitmapText;
  private readonly info: Phaser.GameObjects.BitmapText;
  private readonly foot: Phaser.GameObjects.BitmapText;
  private readonly chipG: Phaser.GameObjects.Graphics;
  private readonly chipT: Phaser.GameObjects.BitmapText;
  private page: TrainingMenuPage = { title: '', items: [] };
  private stack: { page: TrainingMenuPage; index: number }[] = [];
  open = false;
  private w = 800;
  private h = 600;
  private u = 2;
  private box = { x: 0, y: 0, w: 0, h: 0 };
  private chip = { x: 0, y: 0, w: 0, h: 0 };
  private chipLabel = 'MENU';
  /** Fired by a click / tap on the chip. */
  onChip: (() => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
  ) {
    this.g = scene.add.graphics();
    layer.add(this.g);
    this.list = new MenuList(scene, layer, []);
    this.list.plate = false;
    this.title = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 0).setTint(COLORS.title);
    this.info = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0, 0).setTint(COLORS.text).setLeftAlign();
    this.foot = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5, 1).setTint(COLORS.dim).setCenterAlign();
    this.chipG = scene.add.graphics();
    this.chipT = scene.add.bitmapText(0, 0, PIXEL_FONT, '').setOrigin(0.5).setTint(COLORS.hot);
    layer.add([this.title, this.info, this.foot, this.chipG, this.chipT]);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input?.off(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this));
    this.setOpen(false);
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    if (this.open || !this.chipT.visible) return;
    const q = pointerXY(this.scene, p);
    const c = this.chip;
    if (q.x >= c.x && q.x <= c.x + c.w && q.y >= c.y && q.y <= c.y + c.h) {
      sfx.play('menuOk', 0.7, 0);
      this.onChip?.();
    }
  }

  /** Text of the corner chip (e.g. 'TAB: MENU'). */
  setChip(label: string, visible = true): void {
    this.chipLabel = label;
    this.chipT.setVisible(visible && !this.open);
    this.chipG.setVisible(visible && !this.open);
    this.layoutChip();
  }

  /** Replace the whole stack with one page. */
  show(page: TrainingMenuPage): void {
    this.stack = [];
    this.setPage(page, 0);
  }

  /** Open a sub-page (back returns to the current one). */
  push(page: TrainingMenuPage): void {
    this.stack.push({ page: this.page, index: this.list.index });
    this.setPage(page, 0);
  }

  /** Back one page; returns false at the top. */
  pop(): boolean {
    const prev = this.stack.pop();
    if (!prev) return false;
    this.setPage(prev.page, prev.index);
    return true;
  }

  /** Rebuild the current page's rows (after its item list changed). */
  refresh(page?: TrainingMenuPage): void {
    this.setPage(page ?? this.page, this.list.index);
  }

  private setPage(page: TrainingMenuPage, index: number): void {
    this.page = page;
    this.list.items = page.items;
    this.list.rebuild();
    this.list.index = Math.min(index, Math.max(0, page.items.length - 1));
    this.list.setVisible(this.open);
    this.layout(this.w, this.h, this.u);
  }

  setOpen(on: boolean): void {
    this.open = on;
    this.g.setVisible(on);
    this.title.setVisible(on);
    this.info.setVisible(on);
    this.foot.setVisible(on);
    this.list.setVisible(on);
    this.chipT.setVisible(!on && this.chipLabel !== '');
    this.chipG.setVisible(!on && this.chipLabel !== '');
  }

  /** A menu event while open. Back pops a page (or runs the page's back action). Returns true if consumed. */
  handle(e: MenuEvent): boolean {
    if (this.list.handle(e)) {
      if (e.action === 'confirm') sfx.play('menuOk', 0.7, 0);
      else sfx.play('menuMove', 0.6, 0);
      return true;
    }
    if (e.action === 'back') {
      sfx.play('menuBack', 0.7, 0);
      if (this.page.back) this.page.back();
      else if (!this.pop()) return false;
      return true;
    }
    return false;
  }

  layout(w: number, h: number, u: number): void {
    this.w = w;
    this.h = h;
    this.u = u;
    // a side panel on wide screens; nearly full width on narrow (portrait phone) ones
    const pw = Math.min(w - 16, Math.max(220 * u, w * 0.36));
    const x = w - pw - 8 * (w > pw + 32 ? u : 0.5);
    const y = 8 * u;
    const ph = h - 16 * u;
    this.box = { x, y, w: pw, h: ph };
    this.title.setScale(u * 1.5).setPosition(x + pw / 2, y + 6 * u);
    const top = y + 22 * u;
    const nInfo = this.page.info ? 7 : 4;
    const bottom = y + ph - (22 + nInfo * 9) * u;
    this.list.layout(x + pw / 2, top, u, pw / u - 20, bottom);
    this.info.setScale(u).setPosition(x + 10 * u, bottom + 2 * u);
    this.foot.setScale(u).setPosition(x + pw / 2, y + ph - 4 * u);
    this.layoutChip();
    this.redraw();
  }

  private layoutChip(): void {
    const u = this.u;
    this.chipT.setText(up(this.chipLabel)).setScale(u);
    const tw = textPx(this.chipT) * u;
    const cw = tw + 10 * u;
    const ch = 13 * u;
    const cx = this.w - cw - 8 * u;
    const cy = 8 * u;
    this.chip = { x: cx, y: cy, w: cw, h: ch };
    this.chipT.setPosition(cx + cw / 2, cy + ch / 2);
    const g = this.chipG.clear();
    g.fillStyle(0x0a0820, 0.85).fillRect(cx, cy, cw, ch);
    g.lineStyle(u, COLORS.hot, 0.9).strokeRect(cx, cy, cw, ch);
  }

  private redraw(): void {
    const g = this.g.clear();
    const b = this.box;
    drawPanel(g, b.x, b.y, b.w, b.h, this.u, 0.93);
  }

  /** Per frame while open: rows, title, info and footer text. */
  update(now: number): void {
    if (!this.open) return;
    this.list.update(now / 1000);
    this.title.setText(up(this.page.title));
    const fit = (t: Phaser.GameObjects.BitmapText, k: number) => t.setScale(Math.min(this.u * k, (this.box.w - 12 * this.u) / Math.max(1, textPx(t))));
    fit(this.title, 1.5);
    const hint = this.list.hint;
    const info = [hint, this.page.info?.() ?? ''].filter(Boolean).join('\n\n');
    this.info.setText(up(wrap(info, Math.max(16, Math.floor((this.box.w - 20 * this.u) / (7 * this.u))))));
    // two short footer lines (one long line would shrink past legibility in a side panel)
    this.foot.setText(
      `${footerHint([
        ['updown', 'MOVE'],
        ['leftright', 'CHANGE'],
      ])}\n${footerHint([
        ['confirm', 'SELECT'],
        ['back', 'BACK'],
      ])}`,
    );
    fit(this.foot, 1);
    // the info block sits right under the rows (whose height depends on how many there are)
    this.info.setY(Math.min(this.list.bottom + 4 * this.u, this.foot.y - this.foot.displayHeight - this.info.displayHeight - 2 * this.u));
  }

  destroy(): void {
    this.list.destroy();
    for (const o of [this.g, this.title, this.info, this.foot, this.chipG, this.chipT]) o.destroy();
  }
}

/** Word-wraps each line of `s` to `max` characters. */
export function wrap(s: string, max: number): string {
  return s
    .split('\n')
    .map((line) => {
      const out: string[] = [];
      let cur = '';
      for (const word of line.split(' ')) {
        if (cur && cur.length + 1 + word.length > max) {
          out.push(cur);
          cur = word;
        } else cur = cur ? `${cur} ${word}` : word;
      }
      out.push(cur);
      return out.join('\n');
    })
    .join('\n');
}
