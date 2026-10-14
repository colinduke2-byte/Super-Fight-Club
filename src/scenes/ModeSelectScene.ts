import Phaser from 'phaser';
import { inputManager } from '../input/inputManager';
import type { MenuEvent } from '../input/menuInput';
import { session } from '../game/session';
import { COLORS, MenuList, MenuScene, text, textPx, type MenuBackdrop } from '../ui/menuKit';
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
    'EIGHT ESCALATING FIGHTS, THEN THE BOSS.',
    'BREAK TEN TARGETS AGAINST THE CLOCK. BEAT YOUR BEST TIME.',
    'TEN SECONDS TO PILE ON DAMAGE, THEN LAUNCH THE DUMMY. HOW FAR?',
    'FOURTEEN HAND-MADE FIGHTS WITH A TWIST. CLEAR THEM ALL.',
    'PRACTICE WITH A DUMMY, HITBOXES AND FRAME DATA.',
    'CONTROLS, MOVES AND TECHNIQUES, PAGE BY PAGE.',
    'YOUR WINS, KOS, BEST TIMES AND DISTANCES PER FIGHTER.',
    'CONTROLS, AUDIO, VIDEO AND FULLSCREEN.',
    'WHO IS WHO, WHERE THEY FIGHT AND HOW IT WAS MADE.',
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
      { label: 'CHALLENGES', onConfirm: () => this.go('Challenges') },
      { label: 'TRAINING', onConfirm: () => this.start('training') },
      { label: 'HOW TO PLAY', onConfirm: () => this.go('HowToPlay') },
      { label: 'RECORDS', onConfirm: () => this.go('Records') },
      { label: 'SETTINGS', onConfirm: () => this.go('Settings', { back: 'ModeSelect' }) },
      { label: 'CREDITS', onConfirm: () => this.go('Credits') },
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
    this.title.setScale(u * 4).setPosition(w / 2, h * 0.12);
    this.list.layout(w / 2, h * 0.24, u, 130, h * 0.73);
    // flanking fighters only when there is room beside the menu
    const room = w > h * 1.25;
    this.floorY = Math.min(h * 0.7, h * 0.78 - 20 * u);
    // the description sits a clear gap below the fighters' nameplates
    this.desc.setScale(u * 1.5).setPosition(w / 2, Math.max(h * 0.78, this.floorY + 4 * u + 7 * 1.2 * u + 12 * u + 5.25 * u));
    this.showScale = Math.max(0.6, Math.min(u * 2.4, (this.floorY - h * 0.25) / 64));
    this.showcase.forEach((s, side) => {
      const x = side === 0 ? w * 0.17 : w * 0.83;
      s.sprite.setVisible(room).setPosition(x, this.floorY);
      this.fitShowcase(s.sprite, CHARACTER_LIST[s.idx]);
      s.name.setVisible(room && h >= 560).setScale(u * 1.2).setPosition(x, this.floorY + 4 * u);
    });
    this.hint.setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(this.hint)))).setPosition(w / 2, h - 10 * u);
  }

  /** Scale a showcase fighter, shrinking it if a wide one (wings, staffs) would run past the screen edge. */
  private fitShowcase(sprite: Phaser.GameObjects.Sprite, c: (typeof CHARACTER_LIST)[number]): void {
    sprite.setScale(this.showScale * uiTexK(c));
    const room = Math.min(sprite.x, this.scale.width - sprite.x) - 4;
    const half = sprite.displayWidth * 0.4; // the frame carries transparent margin around the body
    if (half > room && room > 0) sprite.setScale(sprite.scaleX * (room / half));
  }

  protected override backdrop(w: number, h: number): MenuBackdrop {
    // small and high in the top-left corner, above the left fighter and clear of the title
    return w / h > 1.5 ? { planet: { x: 0.11, y: 0.15, k: 0.62 } } : { planet: { x: 0.085, y: 0.12, k: 0.55 } };
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
        this.fitShowcase(s.sprite, c);
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
