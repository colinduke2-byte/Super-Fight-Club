import Phaser from 'phaser';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { session } from '../game/session';
import { COLORS, MenuList, MenuScene, text, textPx } from '../ui/menuKit';
import { PIXEL_FONT } from '../art/pixelFont';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { CHARACTER_LIST } from '../characters';

/** Main menu: Versus / Arcade Ladder / Training / Settings. */
export class ModeSelectScene extends MenuScene {
  private list!: MenuList;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private desc!: Phaser.GameObjects.BitmapText;
  /** Two fighters flanking the menu, cycling through the roster. */
  private showcase: { sprite: Phaser.GameObjects.Sprite; name: Phaser.GameObjects.BitmapText; idx: number }[] = [];
  private glow!: Phaser.GameObjects.Graphics;
  private showScale = 1;
  private floorY = 0;
  private readonly descriptions = [
    'FREE-FOR-ALL FOR 2-4 FIGHTERS. HUMANS AND CPUS.',
    'FIGHT 5 ESCALATING OPPONENTS THEN A BOSS.',
    'BREAK TEN TARGETS AGAINST THE CLOCK. BEAT YOUR BEST TIME.',
    'TEN SECONDS TO PILE ON DAMAGE, THEN LAUNCH THE DUMMY. HOW FAR?',
    'PRACTICE WITH A DUMMY, HITBOXES AND FRAME DATA.',
    'CONTROLS, MOVES AND TECHNIQUES, PAGE BY PAGE.',
    'YOUR WINS, KOS, BEST TIMES AND DISTANCES PER FIGHTER.',
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
      { label: 'TARGET SMASH', onConfirm: () => this.start('targets') },
      { label: 'LAUNCH CONTEST', onConfirm: () => this.start('launch') },
      { label: 'TRAINING', onConfirm: () => this.start('training') },
      { label: 'HOW TO PLAY', onConfirm: () => this.go('HowToPlay') },
      { label: 'RECORDS', onConfirm: () => this.go('Records') },
      { label: 'SETTINGS', onConfirm: () => this.go('Settings', { back: 'ModeSelect' }) },
      {
        label: 'FULLSCREEN',
        value: () => (this.scale.isFullscreen ? 'ON' : 'OFF'),
        onConfirm: () => (this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen()),
      },
    ]);
    this.glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.ui.add(this.glow);
    const n = CHARACTER_LIST.length;
    this.showcase = [0, Math.floor(n / 2)].map((idx, side) => {
      const c = CHARACTER_LIST[idx];
      const sprite = this.add.sprite(0, 0, fighterTextureKey(c.id), 0).setOrigin(0.5, 1).setFlipX(side === 1);
      sprite.play(fighterAnimKey(c.id, 'idle'));
      const name = text(this, this.ui, c.name, parseInt(c.sprite.placeholder.accent.slice(1), 16)).setOrigin(0.5, 0);
      this.ui.add(sprite);
      return { sprite, name, idx };
    });
    this.desc = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.hint = text(this, this.ui, '', COLORS.dim).setOrigin(0.5);
  }

  private start(mode: 'arcade' | 'training' | 'targets' | 'launch'): void {
    session.mode = mode;
    session.playerCount = 1;
    session.ladder = null;
    this.go('CharacterSelect');
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.14);
    this.list.layout(w / 2, h * 0.3, u, 130);
    this.desc.setScale(u * 1.5).setPosition(w / 2, h * 0.78);
    // flanking fighters only when there is room beside the menu
    const room = w > h * 1.25;
    this.floorY = Math.min(h * 0.7, h * 0.78 - 20 * u);
    this.showScale = Math.max(0.6, Math.min(u * 2.4, (this.floorY - h * 0.25) / 64));
    this.showcase.forEach((s, side) => {
      const x = side === 0 ? w * 0.17 : w * 0.83;
      s.sprite.setVisible(room).setPosition(x, this.floorY).setScale(this.showScale * uiTexK(CHARACTER_LIST[s.idx]));
      s.name.setVisible(room && h >= 560).setScale(u * 1.2).setPosition(x, this.floorY + 4 * u);
    });
    this.hint.setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(this.hint)))).setPosition(w / 2, h - 10 * u);
  }

  protected override tick(time: number): void {
    this.list.update(time);
    // every few seconds the pair swaps to the next fighters, fading through
    const n = CHARACTER_LIST.length;
    const period = 4;
    const step = Math.floor(time / period);
    const phase = time / period - step;
    const fade = phase < 0.08 ? phase / 0.08 : phase > 0.92 ? (1 - phase) / 0.08 : 1;
    this.glow.clear();
    this.showcase.forEach((s, side) => {
      const idx = (step + side * Math.floor(n / 2)) % n;
      const c = CHARACTER_LIST[idx];
      if (s.idx !== idx) {
        s.idx = idx;
        s.sprite.setTexture(fighterTextureKey(c.id), 0).play(fighterAnimKey(c.id, 'idle'));
        s.sprite.setScale(this.showScale * uiTexK(c));
        s.name.setText(c.name.toUpperCase()).setTint(parseInt(c.sprite.placeholder.accent.slice(1), 16));
      }
      s.sprite.setAlpha(fade);
      s.name.setAlpha(fade);
      if (s.sprite.visible) {
        const col = parseInt(c.sprite.placeholder.accent.slice(1), 16);
        this.glow.fillStyle(col, 0.22 * fade).fillEllipse(s.sprite.x, this.floorY, 46 * this.showScale, 9 * this.showScale);
        this.glow.fillStyle(col, 0.06 * fade).fillEllipse(s.sprite.x, this.floorY - 30 * this.showScale, 60 * this.showScale, 80 * this.showScale);
      }
    });
    this.desc.setText(this.descriptions[this.list.index] ?? '');
    this.desc.setScale(Math.min(this.u * 1.5, (this.scale.width * 0.94) / Math.max(1, textPx(this.desc))));
    const pads = inputManager.padList.length;
    this.hint.setText(`UP/DOWN: MOVE   J / ENTER: SELECT   K / ESC: BACK   ${pads} CONTROLLER${pads === 1 ? '' : 'S'}`);
    this.hint.setScale(Math.min(this.u, (this.scale.width * 0.97) / Math.max(1, textPx(this.hint))));
  }

  protected onEvent(e: MenuEvent): void {
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('Title');
  }
}
