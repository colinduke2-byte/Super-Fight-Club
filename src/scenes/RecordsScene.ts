import Phaser from 'phaser';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { PIXEL_FONT } from '../art/pixelFont';
import { CHARACTER_LIST } from '../characters';
import { CHALLENGES } from '../game/challenges';
import { bestLaunch, bestTargetTime, clearedChallenges, fighterRecords, formatTicks, resetRecords } from '../game/records';
import type { MenuEvent } from '../input/menuInput';
import { COLORS, MenuList, MenuScene, PANEL, drawPanel, text, textPx, type MenuBackdrop } from '../ui/menuKit';

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
    const ts = Math.min(u * 1.2, (w * 0.84) / Math.max(1, textPx(this.head)));
    const tw = textPx(this.head) * ts;
    // the icon column sits left of the text, so the text starts right of centre by half its width (plate centred)
    const x = w / 2 - tw / 2 + 9 * u;
    // stacked top to bottom: title, table, tally, menu, hint; the table's rows shrink to whatever height is left
    const footTop = this.placeFooter(this.hint);
    const below = 7 * u + 7 * 1.2 * u + 15 * u + 2 * 18 * u + 6 * u;
    const y0 = this.title.y + this.title.displayHeight / 2 + 13 * u;
    const rowH = Math.min(18 * u, (footTop - 6 * u - below - y0) / (this.rows.length + 1));
    // each text line sits centred in its row band
    const off = (rowH - 7 * ts) / 2;
    this.head.setScale(ts).setPosition(x, y0);
    const g = this.plate.clear();
    const px0 = x - 26 * u;
    const pw = tw + 34 * u;
    const py0 = y0 - off - u;
    const ph = rowH * (this.rows.length + 1) + 2 * u;
    drawPanel(g, px0, py0, pw, ph, u, 0.94);
    // header band and rule, then faint stripes on alternate rows
    g.fillStyle(PANEL.stripe, 1).fillRect(px0 + u, py0 + u, pw - 2 * u, rowH);
    g.fillStyle(PANEL.border, 1).fillRect(px0 + u, py0 + rowH + u, pw - 2 * u, u);
    for (let i = 2; i <= this.rows.length; i += 2) g.fillStyle(0x16132e, 1).fillRect(px0 + u, y0 + rowH * i - off, pw - 2 * u, rowH);
    this.rows.forEach((r, i) => r.setScale(ts).setPosition(x, y0 + rowH * (i + 1)));
    this.icons.forEach((img, i) => img.setScale(((rowH * 1.1) / 64) * (img.getData('k') as number)).setPosition(x - 12 * u, y0 + rowH * (i + 1) - off + rowH * 0.95));
    // a clear gap under the table, then the challenge tally, then the menu
    this.chal.setScale(u * 1.2).setPosition(w / 2, py0 + ph + 7 * u + 3.5 * 1.2 * u);
    this.list.layout(w / 2, this.chal.y + 4.2 * u + 15 * u, u, 120);
  }

  protected override backdrop(): MenuBackdrop {
    // the table spans the screen: no planet behind it, and a warm cast for the trophy room
    return { planet: null, tint: 0xfff0dc };
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
