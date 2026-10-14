import Phaser from 'phaser';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { PIXEL_FONT } from '../art/pixelFont';
import { CHARACTER_LIST } from '../characters';
import type { MenuEvent } from '../input/menuInput';
import { STAGE_LIST } from '../stages';
import { COLORS, MenuScene, text, textPx, type MenuBackdrop } from '../ui/menuKit';

/** Lines of the credits roll: [text, colour]; an empty string is a gap. */
const ROLL: [string, number][] = [
  ['SUPER FIGHT CLUB', COLORS.title],
  ['A SCI-FI FANTASY PLATFORM BRAWLER', COLORS.accent],
  ['', 0],
  ['THE ROSTER', COLORS.good],
  ...CHARACTER_LIST.map((c): [string, number] => [`${c.name.toUpperCase()}  -  ${c.tagline.toUpperCase()}`, parseInt(c.sprite.placeholder.accent.slice(1), 16)]),
  ['', 0],
  ['THE ARENAS', COLORS.good],
  ...STAGE_LIST.map((s): [string, number] => [s.name.toUpperCase(), COLORS.text]),
  ['', 0],
  ['HOW IT IS MADE', COLORS.good],
  ['EVERY SPRITE, STAGE, SOUND AND SONG IS GENERATED IN CODE', COLORS.text],
  ['AS THE GAME STARTS: NO IMAGE OR AUDIO FILES', COLORS.text],
  ['BUILT WITH PHASER 3, TYPESCRIPT AND THE WEB AUDIO API', COLORS.text],
  ['A DETERMINISTIC 60 HZ SIMULATION WITH INSTANT REPLAYS', COLORS.text],
  ['', 0],
  ['THANKS FOR PLAYING', COLORS.title],
];

/** A slow credits roll over a parade of the roster running along the bottom. */
export class CreditsScene extends MenuScene {
  private lines: Phaser.GameObjects.BitmapText[] = [];
  private runners: Phaser.GameObjects.Sprite[] = [];
  private hint!: Phaser.GameObjects.BitmapText;
  private scroll = 0;
  private lineH = 12;

  constructor() {
    super('Credits');
  }

  protected build(): void {
    this.scroll = 0;
    this.last = -1;
    this.lines = ROLL.map(([s, c]) => this.add.bitmapText(0, 0, PIXEL_FONT, s).setOrigin(0.5).setTint(c || COLORS.text));
    this.ui.add(this.lines);
    this.runners = CHARACTER_LIST.map((c) => {
      const s = this.add.sprite(0, 0, fighterTextureKey(c.id), 0).setOrigin(0.5, 1);
      s.play(fighterAnimKey(c.id, 'run'));
      s.setData('k', uiTexK(c));
      this.ui.add(s);
      return s;
    });
    this.hint = text(this, this.ui, 'J / ENTER / K / ESC: BACK', COLORS.dim).setOrigin(0.5);
  }

  protected override layoutUi(w: number, _h: number, u: number): void {
    this.lineH = 12 * u;
    for (const [i, l] of this.lines.entries()) {
      const big = i === 0 || i === ROLL.length - 1;
      l.setScale(Math.min(u * (big ? 3 : 1.3), (w * 0.92) / Math.max(1, textPx(l))));
    }
    this.placeFooter(this.hint);
  }

  protected override backdrop(): MenuBackdrop {
    return { planet: { x: 0.85, y: 0.2, k: 0.8 } };
  }

  private last = -1;

  protected override tick(time: number): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const u = this.u;
    // real elapsed time, so the roll moves at the same speed at any frame rate
    const dt = this.last < 0 ? 0 : Math.min(0.1, time - this.last);
    this.last = time;
    // the roll rises through a window above the parade and loops once it has gone by
    this.scroll += dt * 30 * u;
    const bottom = h * 0.62;
    const top = h * 0.06;
    const total = (ROLL.length + 2) * this.lineH * 1.4;
    const off = this.scroll % (total + (bottom - top));
    this.lines.forEach((l, i) => {
      const y = bottom - off + i * this.lineH * 1.4 + (i === 0 ? -this.lineH : 0);
      l.setPosition(w / 2, y);
      const t = Math.min((y - top) / (h * 0.08), (bottom - y) / (h * 0.08));
      l.setAlpha(Math.max(0, Math.min(1, t)));
    });
    // the roster runs across the bottom, one after another
    const floor = h - 22 * u;
    const gap = w / 5;
    this.runners.forEach((s, i) => {
      const s0 = u * 0.9 * (s.getData('k') as number);
      const x = ((time * 60 * u + i * gap) % (this.runners.length * gap)) - gap / 2;
      s.setScale(s0).setPosition(x, floor);
    });
  }

  protected onEvent(e: MenuEvent): void {
    if (e.action === 'back' || e.action === 'confirm') this.go('ModeSelect');
  }
}
