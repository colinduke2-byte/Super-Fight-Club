import Phaser from 'phaser';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { PIXEL_FONT } from '../art/pixelFont';
import { CHARACTER_LIST } from '../characters';
import { CHALLENGES } from '../game/challenges';
import { bestLaunch, bestTargetTime, clearedChallenges, fighterRecords, formatTicks, resetRecords } from '../game/records';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuList, MenuScene, text, textPx } from '../ui/menuKit';

/** Lifetime records kept in this browser: matches, wins, KOs and falls per fighter, and Target Smash best times. */
export class RecordsScene extends MenuScene {
  private title!: Phaser.GameObjects.BitmapText;
  private head!: Phaser.GameObjects.BitmapText;
  private rows: Phaser.GameObjects.BitmapText[] = [];
  private icons: Phaser.GameObjects.Image[] = [];
  private list!: MenuList;
  private hint!: Phaser.GameObjects.BitmapText;
  private confirmReset = false;
  private chal!: Phaser.GameObjects.BitmapText;
  private plate!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Records');
  }

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'RECORDS').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.plate = this.add.graphics();
    this.ui.add(this.plate);
    this.head = text(this, this.ui, `${'FIGHTER'.padEnd(10)}${'PLAYED'.padStart(7)}${'WINS'.padStart(6)}${'WIN%'.padStart(6)}${'KOS'.padStart(6)}${'FALLS'.padStart(7)}${'TARGETS'.padStart(10)}${'LAUNCH'.padStart(9)}`, COLORS.dim);
    this.rows = [];
    this.icons = [];
    this.fill();
    this.list = new MenuList(this, this.ui, [
      {
        label: () => (this.confirmReset ? 'CONFIRM RESET?' : 'RESET RECORDS'),
        onConfirm: () => {
          if (!this.confirmReset) {
            this.confirmReset = true;
            return;
          }
          resetRecords();
          this.confirmReset = false;
          this.fill();
        },
      },
      { label: 'BACK', onConfirm: () => this.go('ModeSelect') },
    ]);
    this.list.index = 1;
    this.chal = text(this, this.ui, '', COLORS.good).setOrigin(0.5);
    this.hint = text(this, this.ui, 'UP/DOWN: MOVE   J / ENTER: SELECT   K / ESC: BACK', COLORS.dim).setOrigin(0.5);
  }

  /** (Re)build the table from storage. */
  private fill(): void {
    const recs = fighterRecords();
    const lines = CHARACTER_LIST.map((c) => {
      const r = recs[c.id] ?? { played: 0, wins: 0, kos: 0, falls: 0 };
      const pct = r.played ? `${Math.round((r.wins / r.played) * 100)}%` : '-';
      const best = bestTargetTime(c.id);
      const far = bestLaunch(c.id);
      return `${c.name.toUpperCase().slice(0, 9).padEnd(10)}${String(r.played).padStart(7)}${String(r.wins).padStart(6)}${pct.padStart(6)}${String(r.kos).padStart(6)}${String(r.falls).padStart(7)}${(best !== null ? formatTicks(best) : '-').padStart(10)}${(far !== null ? `${far.toFixed(1)}M` : '-').padStart(9)}`;
    });
    if (this.rows.length === 0) {
      CHARACTER_LIST.forEach((c, i) => {
        this.rows.push(text(this, this.ui, lines[i], parseInt(c.sprite.placeholder.accent.slice(1), 16)));
        const img = this.add.sprite(0, 0, fighterTextureKey(c.id), 0).setOrigin(0.5, 1);
        img.play(fighterAnimKey(c.id, 'idle'));
        img.setData('k', uiTexK(c));
        this.ui.add(img);
        this.icons.push(img as unknown as Phaser.GameObjects.Image);
      });
    } else this.rows.forEach((r, i) => r.setText(lines[i]));
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    this.title.setScale(Math.min(u * 4, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.1);
    const ts = Math.min(u * 1.2, (w * 0.8) / Math.max(1, textPx(this.head)));
    const tw = textPx(this.head) * ts;
    const x = w / 2 - tw / 2 + 16 * u;
    const rowH = Math.min(18 * u, (h * 0.55) / (this.rows.length + 1));
    this.head.setScale(ts).setPosition(x, h * 0.2);
    // a plate behind the table with faint stripes on alternate rows, so it reads over the planet and skyline
    const g = this.plate.clear();
    const px0 = x - 26 * u;
    const pw = tw + 34 * u;
    const py0 = h * 0.2 - 5 * u;
    const ph = rowH * (this.rows.length + 1) + 6 * u;
    g.fillStyle(0x07061a, 0.66).fillRect(px0, py0, pw, ph);
    g.lineStyle(u, 0x3c3478, 0.9).strokeRect(px0 - u / 2, py0 - u / 2, pw + u, ph + u);
    for (let i = 1; i <= this.rows.length; i += 2) g.fillStyle(0x3c3478, 0.22).fillRect(px0 + u, h * 0.2 + rowH * i - 3 * u, pw - 2 * u, rowH);
    g.fillStyle(COLORS.title, 0.85);
    for (const [cx, cy] of [[px0 - u, py0 - u], [px0 + pw - u * 2, py0 - u], [px0 - u, py0 + ph - u * 2], [px0 + pw - u * 2, py0 + ph - u * 2]]) g.fillRect(cx, cy, u * 3, u * 3);
    this.rows.forEach((r, i) => r.setScale(ts).setPosition(x, h * 0.2 + rowH * (i + 1)));
    this.icons.forEach((img, i) => img.setScale(((rowH * 1.1) / 64) * (img.getData('k') as number)).setPosition(x - 12 * u, h * 0.2 + rowH * (i + 1) + rowH * 0.8));
    this.chal.setScale(u * 1.2).setPosition(w / 2, h * 0.2 + rowH * (this.rows.length + 1.5));
    this.list.layout(w / 2, h * 0.2 + rowH * (this.rows.length + 2.4), u, 120);
    this.hint.setScale(Math.min(u, (w * 0.97) / Math.max(1, textPx(this.hint)))).setPosition(w / 2, h - 10 * u);
  }

  protected override tick(time: number): void {
    this.list.update(time);
    const n = Object.keys(clearedChallenges()).length;
    this.chal.setText(`CHALLENGES CLEARED  ${n} / ${CHALLENGES.length}`).setTint(n === CHALLENGES.length ? COLORS.hot : COLORS.good);
  }

  protected onEvent(e: MenuEvent): void {
    if (e.action === 'up' || e.action === 'down') this.confirmReset = false;
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }
}
