import Phaser from 'phaser';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { session } from '../game/session';
import { COLORS, MenuList, MenuScene, text } from '../ui/menuKit';
import { PIXEL_FONT } from '../art/pixelFont';

/** Main menu: Versus / Arcade Ladder / Training / Settings. */
export class ModeSelectScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private desc!: Phaser.GameObjects.BitmapText;
  private readonly descriptions = [
    'FREE-FOR-ALL FOR 2-4 FIGHTERS. HUMANS AND CPUS.',
    'FIGHT 5 ESCALATING OPPONENTS THEN A BOSS.',
    'PRACTICE WITH A DUMMY, HITBOXES AND FRAME DATA.',
    'CONTROLS, AUDIO AND VIDEO.',
    '',
  ];

  constructor() {
    super('ModeSelect');
  }

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'MAIN MENU').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.list = new MenuList(this, this.ui, [
      { label: 'VERSUS', onConfirm: () => this.go('VersusSetup') },
      { label: 'ARCADE LADDER', onConfirm: () => this.start('arcade') },
      { label: 'TRAINING', onConfirm: () => this.start('training') },
      { label: 'SETTINGS', onConfirm: () => this.go('Settings', { back: 'ModeSelect' }) },
      {
        label: 'FULLSCREEN',
        value: () => (this.scale.isFullscreen ? 'ON' : 'OFF'),
        onConfirm: () => (this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen()),
      },
    ]);
    this.desc = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
  }

  private start(mode: 'arcade' | 'training'): void {
    session.mode = mode;
    session.playerCount = 1;
    session.ladder = mode === 'arcade' ? { stage: 0, won: 0 } : null;
    this.go('CharacterSelect');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.14);
    this.list.layout(w / 2, h * 0.3, u, 130);
    this.desc.setScale(u * 1.5).setPosition(w / 2, h * 0.78);
    this.hint.setScale(u).setPosition(w / 2, h - 10 * u);
  }

  protected override tick(time: number): void {
    this.list.update(time);
    this.desc.setText(this.descriptions[this.list.index] ?? '');
    const pads = inputManager.padList.length;
    this.hint.setText(`UP/DOWN: MOVE   J / ENTER: SELECT   K / ESC: BACK   ${pads} CONTROLLER${pads === 1 ? '' : 'S'}`);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('Title');
  }
}
