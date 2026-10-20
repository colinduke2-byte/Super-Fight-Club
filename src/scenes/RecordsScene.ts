import Phaser from 'phaser';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { CHARACTER_LIST } from '../characters';
import { CHALLENGES, TIER_COLORS } from '../game/challenges';
import {
  ARCADE_STAR_SCORE,
  DIFFICULTY_LABELS,
  RECORD_SECTIONS,
  arcadeRecords,
  arcadeStars,
  bestLaunch,
  bestTargetTime,
  challengeBests,
  clearedChallenges,
  fighterRecords,
  formatSec,
  formatTicks,
  lifetimeStats,
  resetRecordSection,
  resetRecords,
  type RecordSection,
} from '../game/records';
import { exportSave, importSave, readSave } from '../game/save';
import { footerHint } from '../input/prompts';
import type { MenuEvent } from '../input/menuInput';
import { STAGES, STAGE_LIST } from '../stages';
import { COLORS, MenuList, MenuScene, PANEL, drawPanel, text, textPx, type MenuBackdrop } from '../ui/menuKit';

const PAGES = ['FIGHTERS', 'ARCADE', 'STATS', 'MATCHUPS'] as const;
const STAR = 0xffd84a;
const accentOf = (c: { sprite: { placeholder: { accent: string } } }): number => parseInt(c.sprite.placeholder.accent.slice(1), 16);
const short = (name: string): string => name.toUpperCase().slice(0, 3);

/** Remembered page between visits. */
let lastPage = 0;

/**
 * Lifetime records kept in this browser, over four pages: per-fighter versus numbers and bests (with arcade stars),
 * arcade clears and scores, lifetime totals with usage charts, and the head-to-head table. SAVE DATA opens a page
 * overlay to copy the save out as text, paste one back in, or reset a section.
 */
export class RecordsScene extends MenuScene {
  private title!: Phaser.GameObjects.BitmapText;
  private sub!: Phaser.GameObjects.BitmapText;
  private list!: MenuList;
  private hint!: Phaser.GameObjects.BitmapText;
  private chal!: Phaser.GameObjects.BitmapText;
  private plate!: Phaser.GameObjects.Graphics;
  private page = lastPage;
  /** What the current page made (destroyed on a page change). */
  private objs: Phaser.GameObjects.GameObject[] = [];
  private head: Phaser.GameObjects.BitmapText | null = null;
  private rows: Phaser.GameObjects.BitmapText[] = [];
  private icons: Phaser.GameObjects.Sprite[] = [];
  private labels: Phaser.GameObjects.BitmapText[] = [];
  /** Column (in characters) where the star column starts on the table pages (-1: none), and stars per row. */
  private starCol = -1;
  private stars: number[] = [];
  private overlay: HTMLDivElement | null = null;

  constructor() {
    super('Records');
  }

  protected build(): void {
    this.title = this.add.bitmapText(0, 0, PIXEL_FONT, 'RECORDS').setOrigin(0.5).setTint(COLORS.title);
    this.ui.add(this.title);
    this.plate = this.add.graphics();
    this.ui.add(this.plate);
    this.sub = text(this, this.ui, '', COLORS.accent).setOrigin(0.5);
    this.chal = text(this, this.ui, '', COLORS.good).setOrigin(0.5);
    this.list = new MenuList(this, this.ui, [
      { label: 'PAGE', value: () => PAGES[this.page], onLeft: () => this.turn(-1), onRight: () => this.turn(1), onConfirm: () => this.turn(1) },
      { label: 'SAVE DATA', onConfirm: () => this.openSave() },
      { label: 'BACK', onConfirm: () => this.go('ModeSelect') },
    ]);
    this.list.index = 2;
    this.hint = text(this, this.ui, footerHint([['updown', 'MOVE'], ['leftright', 'PAGE'], ['confirm', 'SELECT'], ['back', 'BACK']]), COLORS.dim).setOrigin(0.5);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.closeSave(false));
    this.fill();
  }

  private turn(d: number): void {
    this.page = lastPage = (this.page + d + PAGES.length) % PAGES.length;
    this.fill();
  }

  /** (Re)build the current page from storage. */
  private fill(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.head = null;
    this.rows = [];
    this.icons = [];
    this.labels = [];
    this.starCol = -1;
    this.stars = [];
    if (this.page === 0) this.fillFighters();
    else if (this.page === 1) this.fillArcade();
    else if (this.page === 2) this.fillStats();
    else this.fillMatchups();
    this.relayoutNow();
  }

  private t(str: string, tint: number = COLORS.text): Phaser.GameObjects.BitmapText {
    const o = text(this, this.ui, up(str), tint);
    this.objs.push(o);
    return o;
  }

  /** A fighter table: header, one row per fighter with its idle sprite. */
  private table(head: string, lines: string[]): void {
    this.head = this.t(head, COLORS.dim);
    CHARACTER_LIST.forEach((c, i) => {
      this.rows.push(this.t(lines[i], accentOf(c)));
      const img = this.add.sprite(0, 0, fighterTextureKey(c.id), 0).setOrigin(0.5, 1);
      img.play(fighterAnimKey(c.id, 'idle'));
      img.setData('k', uiTexK(c));
      this.ui.add(img);
      this.objs.push(img);
      this.icons.push(img);
    });
  }

  private fillFighters(): void {
    const recs = fighterRecords();
    const arc = arcadeRecords();
    const head = `${'FIGHTER'.padEnd(10)}${'PLAYED'.padStart(7)}${'WINS'.padStart(6)}${'WIN%'.padStart(6)}${'KOS'.padStart(6)}${'FALLS'.padStart(7)}${'TARGETS'.padStart(10)}${'LAUNCH'.padStart(9)}  ARCADE`;
    const lines = CHARACTER_LIST.map((c) => {
      const r = recs[c.id] ?? { played: 0, wins: 0, kos: 0, falls: 0 };
      const pct = r.played ? `${Math.round((r.wins / r.played) * 100)}%` : '-';
      const best = bestTargetTime(c.id);
      const far = bestLaunch(c.id);
      this.stars.push(arcadeStars(arc[c.id]));
      return `${c.name.slice(0, 9).padEnd(10)}${String(r.played).padStart(7)}${String(r.wins).padStart(6)}${pct.padStart(6)}${String(r.kos).padStart(6)}${String(r.falls).padStart(7)}${(best !== null ? formatTicks(best) : '-').padStart(10)}${(far !== null ? `${far.toFixed(1)}M` : '-').padStart(9)}  ${' '.repeat(6)}`;
    });
    this.starCol = head.length - 6;
    this.table(head, lines);
  }

  private fillArcade(): void {
    const arc = arcadeRecords();
    const head = `${'FIGHTER'.padEnd(10)}${'CLEARS'.padStart(7)}${'BEST TIME'.padStart(11)}${'HIGH SCORE'.padStart(12)}${'NO CONT'.padStart(9)}${'HARDEST'.padStart(10)}  STARS `;
    const lines = CHARACTER_LIST.map((c) => {
      const a = arc[c.id];
      this.stars.push(arcadeStars(a));
      if (!a) return `${c.name.slice(0, 9).padEnd(10)}${'-'.padStart(7)}${'-'.padStart(11)}${'-'.padStart(12)}${'-'.padStart(9)}${'-'.padStart(10)}  ${' '.repeat(6)}`;
      return `${c.name.slice(0, 9).padEnd(10)}${String(a.clears).padStart(7)}${(a.bestSec ? formatSec(a.bestSec) : '-').padStart(11)}${String(a.bestScore).padStart(12)}${String(a.noContinue).padStart(9)}${(DIFFICULTY_LABELS[a.hardestClear] ?? '-').padStart(10)}  ${' '.repeat(6)}`;
    });
    this.starCol = head.length - 6;
    this.table(head, lines);
  }

  /** Lifetime totals on the left, matches by fighter and by stage as bar charts. */
  private fillStats(): void {
    const s = lifetimeStats();
    const recs = fighterRecords();
    const fav = Object.entries(s.stages).sort((a, b) => b[1] - a[1])[0];
    const main = CHARACTER_LIST.map((c) => [c, recs[c.id]?.played ?? 0] as const).sort((a, b) => b[1] - a[1])[0];
    const medals = Object.values(challengeBests()).filter((b) => b.tier === 3).length;
    const clears = Object.values(arcadeRecords()).reduce((n, a) => n + a.clears, 0);
    const totals: [string, string][] = [
      ['PLAY TIME', formatSec(s.playSec)],
      ['MATCHES', String(s.matches)],
      ['KOS', String(s.kos)],
      ['FALLS', String(s.falls)],
      ['DAMAGE', String(Math.round(s.damage))],
      ['BEST COMBO', s.bestCombo ? `${s.bestCombo} HITS` : '-'],
      ['ULTIMATE KOS', String(s.ultimateKos)],
      ['TOP STAGE', fav ? (STAGES[fav[0]]?.name ?? fav[0]) : '-'],
      ['MAIN FIGHTER', main && main[1] ? main[0].name : '-'],
      ['ARCADE CLEARS', String(clears)],
      ['GOLD MEDALS', `${medals} / ${CHALLENGES.length}`],
    ];
    this.head = this.t('LIFETIME', COLORS.title);
    for (const [k, v] of totals) {
      this.rows.push(this.t(k, COLORS.dim));
      this.labels.push(this.t(v, COLORS.text).setOrigin(1, 0));
    }
    // chart labels: [title, then one per bar]
    this.chartF = CHARACTER_LIST.map((c) => ({ name: c.name, n: recs[c.id]?.played ?? 0, color: accentOf(c) }));
    const stageIds = [...STAGE_LIST.map((st) => st.id), ...Object.keys(s.stages).filter((k) => !STAGE_LIST.some((st) => st.id === k))];
    // first word of the stage name (SKYLINE, STORMSPIRE, APEX...) keeps the chart labels one size
    this.chartS = stageIds.map((id) => ({ name: (STAGES[id]?.name ?? id).replace(/^the /i, '').split(' ')[0], n: s.stages[id] ?? 0, color: COLORS.accent }));
    this.chartT = [this.t('MATCHES BY FIGHTER', COLORS.title), this.t('MATCHES BY STAGE', COLORS.title)];
    this.chartL = [...this.chartF, ...this.chartS].map((b) => this.t(b.name.slice(0, 16), COLORS.text));
    this.chartN = [...this.chartF, ...this.chartS].map((b) => this.t(String(b.n), COLORS.dim));
  }

  private chartF: { name: string; n: number; color: number }[] = [];
  private chartS: { name: string; n: number; color: number }[] = [];
  private chartT: Phaser.GameObjects.BitmapText[] = [];
  private chartL: Phaser.GameObjects.BitmapText[] = [];
  private chartN: Phaser.GameObjects.BitmapText[] = [];
  private grid: { w: number; l: number }[][] = [];
  private cells: Phaser.GameObjects.BitmapText[] = [];

  /** Head to head: rows are your fighter, columns the opponent; each cell is your win rate, coloured red to green. */
  private fillMatchups(): void {
    const m = lifetimeStats().matchups;
    this.grid = CHARACTER_LIST.map((a) => CHARACTER_LIST.map((b) => m[a.id]?.[b.id] ?? { w: 0, l: 0 }));
    this.head = this.t('YOU', COLORS.dim);
    this.rows = CHARACTER_LIST.map((c) => this.t(short(c.name), accentOf(c)));
    this.labels = CHARACTER_LIST.map((c) => this.t(short(c.name), accentOf(c)).setOrigin(0.5));
    this.cells = this.grid.flat().map((x) => this.t(x.w + x.l ? String(Math.round((x.w / (x.w + x.l)) * 100)) : '', COLORS.text).setOrigin(0.5));
  }

  private relayoutNow(): void {
    this.layoutUi(this.scale.width, this.scale.height, this.u);
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    if (!this.list) return;
    this.title.setScale(Math.min(u * 4, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.08);
    const footTop = this.placeFooter(this.hint);
    // bottom up: hint, menu (3 rows), tally; the page fills what is left under the title
    const menuH = 3 * 18 * u;
    const menuTop = footTop - 6 * u - menuH;
    this.list.layout(w / 2, menuTop + 4 * u, u, 130);
    this.chal.setScale(u).setPosition(w / 2, menuTop - 10 * u);
    this.sub.setScale(u * 1.2).setPosition(w / 2, this.title.y + this.title.displayHeight / 2 + 7 * u);
    const top = this.sub.y + 8 * u;
    const bottom = this.chal.y - 7 * u;
    const g = this.plate.clear();
    if (this.page <= 1) this.layoutTable(g, w, u, top, bottom);
    else if (this.page === 2) this.layoutStats(g, w, u, top, bottom);
    else this.layoutMatchups(g, w, u, top, bottom);
  }

  private drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, on: boolean): void {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
    }
    g.fillStyle(on ? STAR : 0x3c3478, on ? 1 : 0.9).fillPoints(pts, true);
  }

  private layoutTable(g: Phaser.GameObjects.Graphics, w: number, u: number, top: number, bottom: number): void {
    const head = this.head!;
    const ts = Math.min(u * 1.2, (w * 0.84) / Math.max(1, textPx(head)));
    const tw = textPx(head) * ts;
    const charW = tw / head.text.length;
    // the icon column sits left of the text, so the text starts right of centre by half its width (plate centred)
    const x = w / 2 - tw / 2 + 9 * u;
    const rowH = Math.min(18 * u, (bottom - top) / (this.rows.length + 1));
    const off = (rowH - 7 * ts) / 2;
    const y0 = top + off;
    head.setScale(ts).setPosition(x, y0);
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
    if (this.starCol >= 0) {
      const sr = Math.min(3.4 * ts, rowH * 0.32);
      this.stars.forEach((n, i) => {
        const cy = y0 + rowH * (i + 1) + 3.5 * ts;
        for (let k = 0; k < 3; k++) this.drawStar(g, x + charW * (this.starCol + 0.6 + k * 2), cy, sr, k < n);
      });
    }
    this.sub.setText(up(this.page === 0 ? 'VERSUS AND ARCADE MATCHES, PERSONAL BESTS' : `STARS: CLEAR, NO CONTINUES, ${ARCADE_STAR_SCORE} POINTS`));
  }

  private layoutStats(g: Phaser.GameObjects.Graphics, w: number, u: number, top: number, bottom: number): void {
    this.sub.setText('LIFETIME TOTALS');
    const gap = 6 * u;
    const avail = Math.min(w * 0.96, 420 * u);
    const x0 = w / 2 - avail / 2;
    const colW = [avail * 0.36, avail * 0.32, avail * 0.32];
    const h = bottom - top;
    // panel 1: totals
    let x = x0;
    const ts = Math.min(u, h / (this.rows.length + 2) / 10);
    const lineH = Math.min(12 * u, (h - 16 * u) / (this.rows.length + 1));
    drawPanel(g, x, top, colW[0] - gap, h, u, 0.94);
    this.head!.setScale(ts * 1.2).setPosition(x + 6 * u, top + 5 * u);
    this.rows.forEach((r, i) => {
      const y = top + 8 * u + lineH * (i + 1);
      r.setScale(ts).setPosition(x + 6 * u, y);
      this.labels[i].setScale(ts).setPosition(x + colW[0] - gap - 6 * u, y);
      const k = Math.min(1, (colW[0] - gap - 18 * u - r.displayWidth) / Math.max(1, this.labels[i].displayWidth));
      if (k < 1) this.labels[i].setScale(ts * k);
    });
    // panels 2 and 3: bar charts
    const charts = [this.chartF, this.chartS];
    let li = 0;
    charts.forEach((bars, ci) => {
      x += colW[ci] + (ci === 0 ? 0 : 0);
      const pw = colW[ci + 1] - gap;
      drawPanel(g, x, top, pw, h, u, 0.94);
      this.chartT[ci].setScale(Math.min(ts * 1.2, (pw - 12 * u) / Math.max(1, textPx(this.chartT[ci])))).setPosition(x + 6 * u, top + 5 * u);
      const max = Math.max(1, ...bars.map((b) => b.n));
      const bh = Math.min(12 * u, (h - 20 * u) / bars.length);
      const k = Math.min(ts, (bh * 0.7) / 7);
      const labW = Math.min(pw * 0.45, Math.max(...this.chartL.map((l) => textPx(l))) * k + 4 * u);
      // one text size per chart: the widest label decides it
      const mine = this.chartL.slice(li, li + bars.length);
      const lk = Math.min(k, (labW - 4 * u) / Math.max(1, ...mine.map((l) => textPx(l))));
      bars.forEach((b, i) => {
        const y = top + 16 * u + bh * i;
        const lab = this.chartL[li];
        const num = this.chartN[li];
        li++;
        lab.setScale(lk).setPosition(x + 6 * u, y + (bh - 7 * k) / 2);
        const bx = x + 6 * u + labW;
        const bw = Math.max(0, pw - 12 * u - labW - 22 * k);
        g.fillStyle(0x16132e, 1).fillRect(bx, y + bh * 0.18, bw, bh * 0.64);
        if (b.n) g.fillStyle(b.color, 0.95).fillRect(bx, y + bh * 0.18, Math.max(u, (bw * b.n) / max), bh * 0.64);
        num.setScale(k).setPosition(bx + bw + 3 * u, y + (bh - 7 * k) / 2);
      });
    });
  }

  private layoutMatchups(g: Phaser.GameObjects.Graphics, w: number, u: number, top: number, bottom: number): void {
    this.sub.setText(up('YOUR WIN % BY FIGHTER (ROWS) AGAINST EACH OPPONENT (COLUMNS)'));
    this.sub.setScale(Math.min(u * 1.2, (w * 0.94) / Math.max(1, textPx(this.sub))));
    const n = CHARACTER_LIST.length;
    const cell = Math.min((bottom - top - 4 * u) / (n + 1), (w * 0.9) / (n + 2));
    const gw = cell * (n + 1.5);
    const x0 = w / 2 - gw / 2;
    const y0 = top + 2 * u;
    drawPanel(g, x0 - 3 * u, y0 - 2 * u, gw + 6 * u, cell * (n + 1) + 4 * u, u, 0.94);
    const k = Math.min(u * 1.2, (cell * 0.8) / 18);
    this.head!.setScale(k * 0.8).setOrigin(0, 0.5).setPosition(x0, y0 + cell / 2);
    const lx = x0 + cell * 1.5;
    this.labels.forEach((l, j) => l.setScale(k).setPosition(lx + cell * (j + 0.5), y0 + cell / 2));
    this.rows.forEach((r, i) => r.setScale(k).setOrigin(0, 0.5).setPosition(x0 + 2 * u, y0 + cell * (i + 1.5)));
    this.grid.forEach((row, i) =>
      row.forEach((m, j) => {
        const cx = lx + cell * j;
        const cy = y0 + cell * (i + 1);
        const total = m.w + m.l;
        let c = i === j ? 0x221d44 : 0x16132e;
        if (total) {
          const p = m.w / total;
          c = Phaser.Display.Color.GetColor(Math.round(255 - 150 * p), Math.round(90 + 150 * p), 90);
        }
        g.fillStyle(c, total ? 0.85 : 1).fillRect(cx + u / 2, cy + u / 2, cell - u, cell - u);
        this.cells[i * n + j].setScale(k * 0.9).setPosition(cx + cell / 2, cy + cell / 2).setTint(total ? 0x0a0820 : COLORS.dim);
      }),
    );
  }

  protected override backdrop(): MenuBackdrop {
    // the table spans the screen: no planet behind it, and a warm cast for the trophy room
    return { planet: null, tint: 0xfff0dc };
  }

  protected override tick(time: number): void {
    this.list.update(time);
    const cleared = clearedChallenges();
    const bests = challengeBests();
    const n = Object.keys(cleared).length;
    const gold = CHALLENGES.filter((c) => bests[c.id]?.tier === 3).length;
    this.chal.setText(`CHALLENGES CLEARED  ${n} / ${CHALLENGES.length}    GOLD MEDALS  ${gold}`).setTint(n === CHALLENGES.length ? COLORS.hot : COLORS.good);
  }

  protected onEvent(e: MenuEvent): void {
    if (this.overlay) {
      if (e.action === 'back' && !e.pointer) this.closeSave();
      return;
    }
    // left / right turn the page from any row (keys); a click on the PAGE value goes through the list
    if ((e.action === 'left' || e.action === 'right') && e.target === undefined) {
      this.turn(e.action === 'left' ? -1 : 1);
      return;
    }
    if (this.list.handle(e)) return;
    if (e.action === 'back') this.go('ModeSelect');
  }

  // ---- SAVE DATA overlay (DOM: the page cannot download files, so the save moves as copy / paste text) --------------

  private openSave(): void {
    if (this.overlay || typeof document === 'undefined') return;
    const tierC = (i: number) => `#${TIER_COLORS[i].toString(16).padStart(6, '0')}`;
    const root = document.createElement('div');
    this.overlay = root;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Save data');
    root.style.cssText =
      'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(7,6,15,0.82);font:14px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#e8e4ff;padding:16px;box-sizing:border-box';
    const box = document.createElement('div');
    box.style.cssText = 'background:#0a0820;border:3px solid #3c3478;max-width:720px;width:100%;max-height:100%;overflow:auto;padding:16px 18px;box-sizing:border-box';
    root.appendChild(box);
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, txt = '', parent: HTMLElement = box): HTMLElementTagNameMap[K] => {
      const e = document.createElement(tag);
      e.style.cssText = css;
      if (txt) e.textContent = txt;
      parent.appendChild(e);
      return e;
    };
    const btnCss = 'font:inherit;font-weight:bold;letter-spacing:1px;background:#1c1840;color:#ffd46a;border:2px solid #3c3478;padding:8px 12px;margin:4px 6px 4px 0;cursor:pointer;min-height:40px';
    const button = (label: string, onClick: (b: HTMLButtonElement) => void, parent: HTMLElement = box): HTMLButtonElement => {
      const b = el('button', btnCss, label, parent);
      b.type = 'button';
      b.addEventListener('click', () => onClick(b));
      return b;
    };
    el('h2', `margin:0 0 6px;font-size:20px;color:#ffd46a;letter-spacing:2px`, 'SAVE DATA');
    el('p', 'margin:0 0 10px;color:#c8c4ec', 'Copy the text below to keep your records somewhere safe or move them to another browser. To load a save, paste its text into the box and press LOAD. Settings and controls are not part of the save.');
    const area = el('textarea', 'width:100%;height:120px;box-sizing:border-box;background:#07060f;color:#7fe8ff;border:2px solid #3c3478;font:12px/1.3 ui-monospace,Menlo,Consolas,monospace;padding:6px;resize:vertical');
    area.spellcheck = false;
    area.setAttribute('aria-label', 'Save text');
    area.value = exportSave();
    const status = el('p', 'margin:6px 0;min-height:1.4em;color:#7affa0', '');
    const say = (msg: string, bad = false) => {
      status.textContent = msg;
      status.style.color = bad ? '#ff6a5a' : '#7affa0';
    };
    const row1 = el('div', 'display:flex;flex-wrap:wrap');
    button(
      'COPY SAVE',
      () => {
        area.value = exportSave();
        const fallback = () => {
          area.focus();
          area.select();
          let ok = false;
          try {
            ok = document.execCommand('copy');
          } catch {
            ok = false;
          }
          say(ok ? 'Save copied.' : 'Save selected: press Ctrl+C (or Cmd+C) to copy it.');
        };
        // the clipboard call has to happen inside the click
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(area.value).then(() => say('Save copied to the clipboard.'), fallback);
        else fallback();
      },
      row1,
    );
    let pending = '';
    const load = button(
      'LOAD PASTED SAVE',
      (b) => {
        const txt = area.value;
        if (pending && pending === txt) {
          const r = importSave(txt);
          pending = '';
          b.textContent = 'LOAD PASTED SAVE';
          if (r.ok) {
            say(`Save loaded: ${r.summary}.`);
            this.fill();
          } else say(r.error, true);
          return;
        }
        const r = readSave(txt);
        if (!r.ok) return say(r.error, true);
        pending = txt;
        b.textContent = 'CONFIRM LOAD';
        say(`This save holds ${r.summary}. Loading it replaces all your records: press CONFIRM LOAD.`, true);
      },
      row1,
    );
    area.addEventListener('input', () => {
      pending = '';
      load.textContent = 'LOAD PASTED SAVE';
    });
    el('h3', 'margin:14px 0 4px;font-size:15px;color:#ffd46a;letter-spacing:1px', 'RESET');
    el('p', 'margin:0 0 6px;color:#c8c4ec', 'Clears one part of your records. Press twice to confirm. Copy your save first if you may want it back.');
    const row2 = el('div', 'display:flex;flex-wrap:wrap');
    const resets: HTMLButtonElement[] = [];
    const arm = (b: HTMLButtonElement, label: string, run: () => void) => {
      const was = b.dataset.armed === '1';
      for (const o of resets) {
        o.dataset.armed = '';
        o.textContent = o.dataset.label ?? '';
        o.style.color = '#ffd46a';
      }
      if (!was) {
        b.dataset.armed = '1';
        b.textContent = `CONFIRM: ${label}?`;
        b.style.color = '#ff6a5a';
        return;
      }
      run();
      area.value = exportSave();
      this.fill();
      say(`${label} cleared.`);
    };
    const sections: { id: RecordSection | 'all'; label: string }[] = [...RECORD_SECTIONS, { id: 'all', label: 'Everything' }];
    for (const s of sections) {
      const label = s.label.toUpperCase();
      const b = button(
        `RESET ${label}`,
        (bb) => arm(bb, label, () => (s.id === 'all' ? resetRecords() : resetRecordSection(s.id))),
        row2,
      );
      b.dataset.label = `RESET ${label}`;
      if (s.id === 'all') b.style.borderColor = tierC(1);
      resets.push(b);
    }
    const row3 = el('div', 'display:flex;justify-content:flex-end;margin-top:10px');
    button('CLOSE', () => this.closeSave(), row3);
    // typing in the box must not drive the menus (J / K / arrows), and Escape closes
    const stop = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.type === 'keydown' && e.key === 'Escape') this.closeSave();
    };
    root.addEventListener('keydown', stop);
    root.addEventListener('keyup', stop);
    root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target === root) this.closeSave();
    });
    document.body.appendChild(root);
    area.focus();
    area.select();
  }

  private closeSave(refresh = true): void {
    const o = this.overlay;
    if (!o) return;
    this.overlay = null;
    o.remove();
    if (refresh) this.fill();
  }
}
