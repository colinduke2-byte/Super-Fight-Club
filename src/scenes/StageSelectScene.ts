import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { session } from '../game/session';
import type { MenuEvent } from '../input/menuInput';
import { STAGE_LIST } from '../stages';
import { COLORS, MenuList, MenuScene, text, textPx } from '../ui/menuKit';
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
    for (const st of STAGE_LIST) stageThumb(this, st);
    this.thumb = this.add.image(0, 0, stageThumb(this, STAGE_LIST[0])).setOrigin(0, 0);
    this.preview = this.add.graphics();
    this.ui.add([this.thumb, this.preview]);
    this.blurb = text(this, this.ui, '', COLORS.text).setOrigin(0, 0);
    this.tags = text(this, this.ui, '', COLORS.accent).setOrigin(0, 0);
    this.hint = text(this, this.ui, 'UP/DOWN: MOVE   J / ENTER: FIGHT   K / ESC: BACK', COLORS.dim).setOrigin(0.5);
  }

  private pick(id: string): void {
    session.stage = id;
    this.go('Match');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.1);
    this.list.layout(w * 0.28, h * 0.3, u, 110);
    this.area = { x: w * 0.5, y: h * 0.22, w: w * 0.44, h: w * 0.44 * (9 / 16) };
    this.blurb.setScale(u * 1.1).setPosition(w * 0.5, this.area.y + this.area.h + 6 * u);
    this.wrapChars = Math.max(10, Math.floor((w * 0.44) / (7.6 * u * 1.1)));
    this.tags.setScale(u).setPosition(w * 0.5, h - 22 * u);
    this.hint.setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(this.hint)))).setPosition(w / 2, h - 10 * u);
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
      if (stage.hazards?.length) tags.push(`HAZARD: ${stage.hazards[0].kind === 'bolt' ? 'LIGHTNING' : 'GEYSER'}`);
      this.tags.setText(tags.join('   '));
    } else this.tags.setText('');
    this.tags.setY(this.blurb.y + this.blurb.displayHeight + 5 * this.u);
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
