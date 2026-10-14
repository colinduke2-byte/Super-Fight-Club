import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { session } from '../game/session';
import type { MenuEvent } from '../input/menuInput';
import { STAGE_LIST } from '../stages';
import { COLORS, MenuList, MenuScene, text, textPx, type MenuBackdrop } from '../ui/menuKit';
import { stageThumb } from '../ui/stageThumb';

/** Pick a stage from the list; a preview draws its platforms and blast zones. RANDOM is always last. */
export class StageSelectScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private blurb!: Phaser.GameObjects.BitmapText;
  private tags!: Phaser.GameObjects.BitmapText;
  private wrapChars = 40;
  private preview!: Phaser.GameObjects.Graphics;
  private thumb!: Phaser.GameObjects.Image;
  private area = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('StageSelect');
  }

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'CHOOSE A STAGE').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.list = new MenuList(this, this.ui, [
      ...STAGE_LIST.map((s) => ({ label: s.name, onConfirm: () => this.pick(s.id) })),
      { label: 'RANDOM', onConfirm: () => this.pick(STAGE_LIST[Math.floor(Math.random() * STAGE_LIST.length)].id) },
    ]);
    this.thumb = this.add.image(0, 0, stageThumb(this, STAGE_LIST[0])).setOrigin(0, 0);
    this.preview = this.add.graphics();
    this.ui.add([this.thumb, this.preview]);
    this.blurb = text(this, this.ui, '', COLORS.text).setOrigin(0, 0).setLineSpacing(3);
    this.tags = text(this, this.ui, '', COLORS.accent).setOrigin(0, 0);
    this.hint = text(this, this.ui, 'UP/DOWN: MOVE   J / ENTER: FIGHT   K / ESC: BACK', COLORS.dim).setOrigin(0.5);
  }

  private pick(id: string): void {
    session.stage = id;
    this.go('Match');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(Math.min(u * 4, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.1);
    // list on the left, preview on the right: shrink the list's unit so the longest name fits its column
    // the longest name is ~180 units wide at full size; the plate adds 6 units a side and must stay clear of the preview at 0.5w
    const lu = Math.max(0.8, Math.min(u, (w * 0.43) / 202));
    this.list.layout(w * 0.035 + 101 * lu, h * 0.28, lu, 190);
    const aw = w * 0.46;
    const ah = Math.min(aw * (9 / 16), h * 0.42);
    this.area = { x: w * 0.5, y: h * 0.22, w: ah * (16 / 9), h: ah };
    const bu = Math.max(0.75, Math.min(u * 1.1, (h * 0.2) / 40));
    // clear of the preview's frame (which is drawn 2px outside the card)
    this.blurb.setScale(bu).setPosition(this.area.x, this.area.y + this.area.h + 10 * u);
    this.wrapChars = Math.max(10, Math.floor((w * 0.46) / (7.6 * bu)));
    this.tags.setScale(Math.min(u, bu)).setPosition(this.area.x, h - 22 * u).setLineSpacing(3);
    this.placeFooter(this.hint);
  }

  protected override backdrop(): MenuBackdrop {
    // the preview card carries its own sky: no planet peeking over its frame
    return { planet: null, tint: 0xe4e0ff };
  }

  protected override tick(time: number): void {
    this.list.update(time);
    const g = this.preview;
    g.clear();
    const a = this.area;
    const stage = STAGE_LIST[this.list.index];
    if (stage) {
      this.thumb.setTexture(stageThumb(this, stage)).setVisible(true);
      const k = Math.min(a.w / this.thumb.width, a.h / this.thumb.height);
      this.thumb.setScale(k).setPosition(a.x + (a.w - this.thumb.width * k) / 2, a.y + (a.h - this.thumb.height * k) / 2);
    } else {
      this.thumb.setVisible(false);
      g.fillStyle(0x0b0a24, 0.85).fillRect(a.x, a.y, a.w, a.h);
    }
    g.lineStyle(3, COLORS.title, 1).strokeRect(a.x - 2, a.y - 2, a.w + 4, a.h + 4);
    this.blurb.setText(this.wrap(stage ? (stage.blurb ?? '').toUpperCase() : 'A RANDOM STAGE FROM THE LIST.'));
    if (stage) {
      const bw0 = stage.blast.right - stage.blast.left;
      const size = bw0 > 1500 ? 'LARGE' : bw0 > 1150 ? 'MEDIUM' : 'SMALL';
      const moving = stage.platforms.filter((p) => p.move).length;
      const tags = [`SIZE: ${size}`, `PLATFORMS: ${stage.platforms.length}`];
      if (moving) tags.push(`MOVING: ${moving}`);
      if (stage.hazards?.length) {
        const h = stage.hazards[0];
        tags.push(`HAZARD: ${h.kind === 'bolt' ? 'LIGHTNING' : h.kind === 'stalactite' ? 'STALACTITES' : h.kind === 'avalanche' ? 'AVALANCHES' : h.style === 'water' ? 'WATER SPOUTS' : 'GEYSER'}`);
      }
      // as many tags per line as fit the card
      const rows: string[] = [];
      for (const t of tags) {
        const last = rows.length ? rows[rows.length - 1] : '';
        if (last && (last + '   ' + t).length <= Math.floor(this.wrapChars * 1.2)) rows[rows.length - 1] = `${last}   ${t}`;
        else rows.push(t);
      }
      this.tags.setText(rows.join('\n'));
    } else this.tags.setText('');
    this.tags.setY(Math.min(this.blurb.y + this.blurb.displayHeight + 7 * this.u, this.hint.y - this.hint.displayHeight / 2 - 6 * this.u - this.tags.displayHeight));
    if (!stage) {
      // RANDOM: question mark card
      g.fillStyle(0x4a4578, 1).fillRect(a.x + a.w / 2 - 6, a.y + a.h / 2 - 20, 12, 40);
    }
  }

  /** Word-wrap to the card width (fixed-width pixel font, so a character count is enough). */
  private wrap(t: string): string {
    const lines: string[] = [];
    let line = '';
    for (const word of t.split(' ')) {
      if (line && (line + ' ' + word).length > this.wrapChars) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines.join('\n');
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('CharacterSelect');
  }
}
