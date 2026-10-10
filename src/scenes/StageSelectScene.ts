import Phaser from 'phaser';
import { PIXEL_FONT } from '../art/pixelFont';
import { session } from '../game/session';
import type { MenuEvent } from '../input/menuInput';
import { STAGE_LIST } from '../stages';
import { COLORS, MenuList, MenuScene, text } from '../ui/menuKit';

/** Pick a stage from the list; a preview draws its platforms and blast zones. RANDOM is always last. */
export class StageSelectScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private preview!: Phaser.GameObjects.Graphics;
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
    this.preview = this.add.graphics();
    this.ui.add(this.preview);
    this.hint = text(this, this.ui, 'UP/DOWN: MOVE   J / ENTER: FIGHT   K / ESC: BACK', COLORS.dim).setOrigin(0.5);
  }

  private pick(id: string): void {
    session.stage = id;
    this.go('Match');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.1);
    this.list.layout(w * 0.28, h * 0.3, u, 110);
    this.area = { x: w * 0.5, y: h * 0.26, w: w * 0.44, h: h * 0.5 };
    this.hint.setScale(u).setPosition(w / 2, h - 10 * u);
  }

  protected override tick(time: number): void {
    this.list.update(time);
    const g = this.preview;
    g.clear();
    const a = this.area;
    g.fillStyle(0x0b0a24, 0.85).fillRect(a.x, a.y, a.w, a.h);
    g.lineStyle(2, 0x4a4578, 1).strokeRect(a.x, a.y, a.w, a.h);
    const stage = STAGE_LIST[this.list.index];
    if (!stage) {
      // RANDOM: question mark card
      g.fillStyle(0x4a4578, 1).fillRect(a.x + a.w / 2 - 6, a.y + a.h / 2 - 20, 12, 40);
      return;
    }
    const b = stage.blast;
    const bw = b.right - b.left;
    const bh = b.bottom - b.top;
    const sc = Math.min((a.w - 20) / bw, (a.h - 20) / bh);
    const ox = a.x + a.w / 2 - ((b.left + b.right) / 2) * sc;
    const oy = a.y + a.h / 2 - ((b.top + b.bottom) / 2) * sc;
    g.lineStyle(1, 0xff3355, 0.5).strokeRect(ox + b.left * sc, oy + b.top * sc, bw * sc, bh * sc);
    for (const p of stage.platforms) {
      const col = p.kind === 'solid' ? 0x7a72a8 : p.move ? 0xffb02e : 0x42e0d0;
      g.fillStyle(col, 1).fillRect(ox + p.x * sc, oy + p.y * sc, Math.max(2, p.w * sc), Math.max(2, p.h * sc));
      if (p.move) {
        const amp = p.move.amplitude * sc;
        g.lineStyle(1, 0xffe9a0, 0.5);
        if (p.move.axis === 'x') g.lineBetween(ox + p.x * sc - amp, oy + p.y * sc - 4, ox + (p.x + p.w) * sc + amp, oy + p.y * sc - 4);
        else g.lineBetween(ox + (p.x + p.w / 2) * sc, oy + p.y * sc - amp, ox + (p.x + p.w / 2) * sc, oy + p.y * sc + amp);
      }
    }
    for (const sp of stage.spawns) g.fillStyle(0x7affa0, 1).fillCircle(ox + sp.x * sc, oy + (sp.y - 8) * sc, 3);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('CharacterSelect');
  }
}
