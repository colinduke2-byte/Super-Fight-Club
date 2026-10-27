import Phaser from 'phaser';
import { settings } from '../settings';
import { fighterAnimKey, fighterTextureKey, uiTexK } from '../art/proceduralFighter';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { CHARACTER_LIST } from '../characters';
import { CHALLENGES, TIER_COLORS, TIER_NAMES } from '../game/challenges';
import { vaultList } from '../game/replayVault';
import { clearedTrials, trialsFor } from '../game/trials';
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
  fighterMatchups,
  fighterRecords,
  formatSec,
  HISTORY_MAX,
  matchHistory,
  stageWinRates,
  formatTicks,
  lifetimeStats,
  resetRecordSection,
  resetRecords,
  type RecordSection,
} from '../game/records';
import { exportSave, importSave, readSave, vaultSkippedInSave } from '../game/save';
import { loadRunRecords } from '../game/runRecords';
import { DIFFICULTY_NAMES } from '../game/ladder';
import { footerHint } from '../input/prompts';
import type { MenuEvent } from '../input/menuInput';
import { STAGES, STAGE_LIST } from '../stages';
import { COLORS, MenuList, MenuScene, PANEL, drawPanel, tapMin, text, textPx, type MenuBackdrop, type MenuItem } from '../ui/menuKit';

const PAGES = ['FIGHTERS', 'ARCADE', 'RUNS', 'STATS', 'MATCHUPS', 'RIVALS', 'STAGES', 'HISTORY', 'TRIALS'] as const;
/** History rows shown at once (older / newer pages through the rest). */
const HISTORY_ROWS = 12;

/** A text table drawn on a panel: a header, rows, and optionally a bar per row (0..1, null: no bar). */
interface PanelTable {
  head: Phaser.GameObjects.BitmapText;
  rows: { t: Phaser.GameObjects.BitmapText; bar: number | null; color: number }[];
}
const STAR = 0xffd84a;
const accentOf = (c: { sprite: { placeholder: { accent: string } } }): number => parseInt(c.sprite.placeholder.accent.slice(1), 16);
/** A fighter's name without a leading "The" (THE OVERSEER -> OVERSEER), so narrow columns keep the part that names them. */
const bare = (name: string): string => name.replace(/^the /i, '');
const short = (name: string): string => bare(name).toUpperCase().slice(0, 3);

/** Remembered page between visits (and the fighter on the RIVALS page). */
let lastPage = 0;
let rivalOf = -1;

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
    this.list = new MenuList(this, this.ui, []);
    this.setRows();
    this.list.index = this.list.items.length - 1;
    this.hint = text(this, this.ui, footerHint([['updown', 'MOVE'], ['leftright', 'PAGE'], ['confirm', 'SELECT'], ['back', 'BACK']]), COLORS.dim).setOrigin(0.5);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.closeSave(false));
    this.fill();
  }

  private turn(d: number): void {
    this.page = lastPage = (this.page + d + PAGES.length) % PAGES.length;
    this.histAt = 0;
    this.setRows();
    this.list.index = 0;
    this.fill();
  }

  /** The menu rows: PAGE, the page's own row (RIVALS: the fighter; HISTORY: older / newer), SAVE DATA, BACK. */
  private setRows(): void {
    const page = PAGES[this.page];
    const extra: MenuItem[] = [];
    if (page === 'RIVALS') {
      extra.push({ label: 'FIGHTER', value: () => (CHARACTER_LIST[this.rival()]?.name ?? '-').toUpperCase(), onLeft: () => this.pickRival(-1), onRight: () => this.pickRival(1), onConfirm: () => this.pickRival(1) });
    } else if (page === 'HISTORY') {
      extra.push({
        label: 'MATCHES',
        value: () => {
          const n = matchHistory().length;
          return n ? `${this.histAt + 1}-${Math.min(n, this.histAt + HISTORY_ROWS)}/${n}` : 'NONE';
        },
        onLeft: () => this.pageHistory(-1),
        onRight: () => this.pageHistory(1),
        onConfirm: () => this.pageHistory(1),
      });
    }
    this.list.items = [
      { label: 'PAGE', value: () => PAGES[this.page], onLeft: () => this.turn(-1), onRight: () => this.turn(1), onConfirm: () => this.turn(1) },
      ...extra,
      { label: 'SAVE DATA', onConfirm: () => this.openSave() },
      { label: 'BACK', onConfirm: () => this.go('ModeSelect') },
    ];
    this.list.rebuild();
  }

  /** The fighter the RIVALS page shows (default: the one played most). */
  private rival(): number {
    if (rivalOf < 0) {
      const recs = fighterRecords();
      let best = 0;
      CHARACTER_LIST.forEach((c, i) => {
        if ((recs[c.id]?.played ?? 0) > (recs[CHARACTER_LIST[best].id]?.played ?? 0)) best = i;
      });
      rivalOf = best;
    }
    return rivalOf;
  }

  private pickRival(d: number): void {
    rivalOf = (this.rival() + d + CHARACTER_LIST.length) % CHARACTER_LIST.length;
    this.fill();
  }

  private histAt = 0;
  private pageHistory(d: number): void {
    const n = matchHistory().length;
    this.histAt = Math.max(0, Math.min(Math.max(0, n - 1), this.histAt + d * HISTORY_ROWS));
    this.histAt -= this.histAt % HISTORY_ROWS;
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
    this.tables = [];
    const page = PAGES[this.page];
    if (page === 'FIGHTERS') this.fillFighters();
    else if (page === 'ARCADE') this.fillArcade();
    else if (page === 'RUNS') this.fillRuns();
    else if (page === 'STATS') this.fillStats();
    else if (page === 'MATCHUPS') this.fillMatchups();
    else if (page === 'RIVALS') this.fillRivals();
    else if (page === 'STAGES') this.fillStages();
    else if (page === 'HISTORY') this.fillHistory();
    else this.fillTrials();
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
      return `${bare(c.name).slice(0, 9).padEnd(10)}${String(r.played).padStart(7)}${String(r.wins).padStart(6)}${pct.padStart(6)}${String(r.kos).padStart(6)}${String(r.falls).padStart(7)}${(best !== null ? formatTicks(best) : '-').padStart(10)}${(far !== null ? `${far.toFixed(1)}M` : '-').padStart(9)}  ${' '.repeat(6)}`;
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
      if (!a) return `${bare(c.name).slice(0, 9).padEnd(10)}${'-'.padStart(7)}${'-'.padStart(11)}${'-'.padStart(12)}${'-'.padStart(9)}${'-'.padStart(10)}  ${' '.repeat(6)}`;
      return `${bare(c.name).slice(0, 9).padEnd(10)}${String(a.clears).padStart(7)}${(a.bestSec ? formatSec(a.bestSec) : '-').padStart(11)}${String(a.bestScore).padStart(12)}${String(a.noContinue).padStart(9)}${(DIFFICULTY_LABELS[a.hardestClear] ?? '-').padStart(10)}  ${' '.repeat(6)}`;
    });
    this.starCol = head.length - 6;
    this.table(head, lines);
  }

  /** Endless (most wins, KOs) and Gauntlet (best time) per fighter; Boss Battle's best time per difficulty. */
  private fillRuns(): void {
    const runs = loadRunRecords();
    const bestWins = Math.max(1, ...Object.values(runs.endless).map((e) => e.wins));
    this.table2(
      `${'FIGHTER'.padEnd(10)}${'WINS'.padStart(5)}${'KOS'.padStart(5)}${'GAUNTLET'.padStart(9)}${'LEVEL'.padStart(10)}`,
      CHARACTER_LIST.map((c) => {
        const e = runs.endless[c.id];
        const gt = runs.gauntlet[c.id];
        const level = gt ? (DIFFICULTY_NAMES[gt.difficulty] ?? '') : '-';
        return {
          text: `${c.name.replace('The ', '').slice(0, 9).padEnd(10)}${(e ? String(e.wins) : '-').padStart(5)}${(e ? String(e.kos) : '-').padStart(5)}${(gt ? formatSec(gt.sec) : '-').padStart(9)}${level.padStart(10)}`,
          tint: e || gt ? accentOf(c) : COLORS.dim,
          bar: e ? e.wins / bestWins : null,
          color: accentOf(c),
        };
      }),
    );
    const name = (id: string): string => (CHARACTER_LIST.find((c) => c.id === id)?.name ?? id).replace('The ', '').slice(0, 9);
    this.table2(
      `${'BOSS BATTLE'.padEnd(12)}${'BEST'.padStart(7)}  ${'FIGHTER'.padEnd(13)}`,
      [1, 2, 3, 4].map((d) => {
        const b = runs.boss[String(d)];
        return { text: `${(DIFFICULTY_NAMES[d] ?? String(d)).slice(0, 11).padEnd(12)}${(b ? formatSec(b.sec) : '-').padStart(7)}  ${(b ? `${name(b.fighter)}${b.coop ? ' +2P' : ''}` : '-').padEnd(13)}`, tint: b ? COLORS.text : COLORS.dim, color: COLORS.accent };
      }),
    );
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

  // ---- RIVALS, STAGES, HISTORY, TRIALS: panel tables ------------------------------------------------------------------

  private tables: PanelTable[] = [];

  private table2(head: string, rows: { text: string; tint?: number; bar?: number | null; color?: number }[]): void {
    this.tables.push({ head: this.t(head, COLORS.dim), rows: rows.map((r) => ({ t: this.t(r.text, r.tint ?? COLORS.text), bar: r.bar ?? null, color: r.color ?? COLORS.accent })) });
  }

  private pct(w: number, n: number): string {
    return n ? `${Math.round((w / n) * 100)}%` : '-';
  }

  /** One fighter's record against each opponent. */
  private fillRivals(): void {
    const me = CHARACTER_LIST[this.rival()];
    const ms = new Map(fighterMatchups(me.id).map((m) => [m.opponent, m]));
    const rows = CHARACTER_LIST.filter((c) => c.id !== me.id || ms.has(c.id))
      .map((c) => ({ c, m: ms.get(c.id) ?? { opponent: c.id, w: 0, l: 0 } }))
      .sort((a, b) => b.m.w + b.m.l - (a.m.w + a.m.l));
    this.table2(`${'OPPONENT'.padEnd(11)}${'WINS'.padStart(6)}${'LOSSES'.padStart(8)}${'WIN%'.padStart(7)}`, rows.map(({ c, m }) => ({ text: `${bare(c.name).slice(0, 10).padEnd(11)}${String(m.w).padStart(6)}${String(m.l).padStart(8)}${this.pct(m.w, m.w + m.l).padStart(7)}`, tint: accentOf(c), bar: m.w + m.l ? m.w / (m.w + m.l) : null, color: accentOf(c) })));
  }

  /** Matches and wins per stage (human matches). */
  private fillStages(): void {
    const rates = new Map(stageWinRates().map((r) => [r.stage, r]));
    const ids = [...STAGE_LIST.map((st) => st.id), ...[...rates.keys()].filter((k) => !STAGE_LIST.some((st) => st.id === k))];
    const rows = ids.map((id) => ({ id, r: rates.get(id) ?? { stage: id, played: 0, wins: 0 } })).sort((a, b) => b.r.played - a.r.played);
    this.table2(
      `${'STAGE'.padEnd(17)}${'PLAYED'.padStart(7)}${'WINS'.padStart(6)}${'WIN%'.padStart(6)}`,
      rows.map(({ id, r }) => ({ text: `${(STAGES[id]?.name ?? id).slice(0, 16).padEnd(17)}${String(r.played).padStart(7)}${String(r.wins).padStart(6)}${this.pct(r.wins, r.played).padStart(6)}`, tint: r.played ? COLORS.text : COLORS.dim, bar: r.played ? r.wins / r.played : null, color: COLORS.good })),
    );
  }

  /** The last HISTORY_MAX matches, newest first, a page at a time. */
  private fillHistory(): void {
    const all = matchHistory();
    const two = (n: number): string => String(n).padStart(2, '0');
    const when = (ms: number): string => {
      const d = new Date(ms);
      return ms ? `${two(d.getMonth() + 1)}/${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}` : '--/-- --:--';
    };
    const nm = (id: string): string => bare(CHARACTER_LIST.find((c) => c.id === id)?.name ?? id).slice(0, 7);
    const rows = all.slice(this.histAt, this.histAt + HISTORY_ROWS).map((h) => {
      const who = h.fighters.map((f) => `${f.placement === 1 ? '*' : ''}${nm(f.character)}`).join(h.fighters.length > 2 ? ',' : ' VS ');
      return { text: `${when(h.date)}  ${h.mode.slice(0, 9).padEnd(10)}${who.slice(0, 30).padEnd(31)}${(STAGES[h.stage]?.name ?? h.stage).slice(0, 12).padEnd(13)}${h.result.slice(0, 22).padEnd(23)}${formatSec(h.sec).padStart(6)}`, tint: h.fighters.some((f) => f.type === 'human' && f.placement === 1) ? COLORS.good : COLORS.text };
    });
    if (!rows.length) rows.push({ text: `NO MATCHES YET: THE LAST ${HISTORY_MAX} ARE KEPT HERE.`, tint: COLORS.dim });
    this.table2(`${'DATE'.padEnd(13)}${'MODE'.padEnd(10)}${'FIGHTERS (* WON)'.padEnd(31)}${'STAGE'.padEnd(13)}${'RESULT'.padEnd(23)}${'TIME'.padStart(6)}`, rows);
  }

  /** Combo trials cleared per fighter, and every challenge's medal and best time (read from their own saves). */
  private fillTrials(): void {
    const done = clearedTrials();
    this.table2(
      `${'FIGHTER'.padEnd(11)}${'TRIALS'.padStart(7)}`,
      CHARACTER_LIST.map((c) => {
        const all = trialsFor(c.id);
        const n = all.filter((t) => done.has(`${c.id}:${t.id}`)).length;
        return { text: `${bare(c.name).slice(0, 10).padEnd(11)}${`${n}/${all.length}`.padStart(7)}`, tint: accentOf(c), bar: all.length ? n / all.length : null, color: n === all.length ? STAR : accentOf(c) };
      }),
    );
    // the challenges: medal counts, then the best medals won (as many as fit beside the trials; the rest are counted)
    const bests = challengeBests();
    const tiers = [3, 2, 1].map((t) => CHALLENGES.filter((ch) => bests[ch.id]?.tier === t).length);
    const won = CHALLENGES.filter((ch) => bests[ch.id]).sort((a, b) => bests[b.id].tier - bests[a.id].tier);
    const shown = won.slice(0, CHARACTER_LIST.length - 2);
    const rows: { text: string; tint?: number }[] = [
      { text: `GOLD ${tiers[0]}  SILVER ${tiers[1]}  BRONZE ${tiers[2]}  OF ${CHALLENGES.length}`, tint: COLORS.title },
      ...shown.map((ch) => ({ text: `${ch.title.slice(0, 19).padEnd(20)}${TIER_NAMES[bests[ch.id].tier].padStart(8)}${(bests[ch.id].sec ? formatSec(bests[ch.id].sec) : '-').padStart(7)}`, tint: TIER_COLORS[bests[ch.id].tier] })),
    ];
    if (won.length > shown.length) rows.push({ text: `+${won.length - shown.length} MORE MEDALS (SEE CHALLENGES)`, tint: COLORS.dim });
    if (!won.length) rows.push({ text: 'NO MEDALS YET: CHALLENGES ARE IN SOLO.', tint: COLORS.dim });
    this.table2(`${'CHALLENGE'.padEnd(20)}${'MEDAL'.padStart(8)}${'BEST'.padStart(7)}`, rows);
  }

  /** The page's tables side by side, each on its own panel, text sized to fit (bars at the right of each row). */
  private layoutTables(g: Phaser.GameObjects.Graphics, w: number, u: number, top: number, bottom: number): void {
    const subs: Record<string, string> = {
      RUNS: 'ENDLESS WINS AND KOS, GAUNTLET BEST TIME, BOSS BATTLE BEST BY DIFFICULTY',
      RIVALS: `${(CHARACTER_LIST[this.rival()]?.name ?? '').toUpperCase()} AGAINST EACH OPPONENT (FIGHTER ROW: LEFT / RIGHT)`,
      STAGES: 'MATCHES AND WINS BY STAGE (MATCHES WITH A HUMAN PLAYER)',
      HISTORY: `THE LAST ${HISTORY_MAX} MATCHES, NEWEST FIRST`,
      TRIALS: 'COMBO TRIALS CLEARED AND CHALLENGE MEDALS',
    };
    this.sub.setText(up(subs[PAGES[this.page]] ?? ''));
    this.sub.setScale(Math.min(u * 1.2, (w * 0.94) / Math.max(1, textPx(this.sub))));
    const n = this.tables.length;
    if (!n) return;
    const avail = Math.min(w * 0.96, 460 * u);
    const gap = 6 * u;
    const pw = (avail - gap * (n - 1)) / n;
    let x = w / 2 - avail / 2;
    const h = bottom - top;
    for (const tb of this.tables) {
      drawPanel(g, x, top, pw, h, u, 0.94);
      const barW = tb.rows.some((r) => r.bar !== null) ? Math.min(60 * u, pw * 0.22) : 0;
      const widest = Math.max(textPx(tb.head), ...tb.rows.map((r) => textPx(r.t)));
      const lineH = Math.min(12 * u, (h - 12 * u) / (tb.rows.length + 1.5));
      const ts = Math.max(0.5, Math.min(u * 1.1, (pw - 14 * u - barW) / Math.max(1, widest), (lineH * 0.8) / 7));
      tb.head.setScale(ts).setPosition(x + 6 * u, top + 5 * u);
      g.fillStyle(PANEL.border, 1).fillRect(x + u, top + 5 * u + lineH, pw - 2 * u, u);
      tb.rows.forEach((r, i) => {
        const y = top + 5 * u + lineH * (i + 1.4);
        r.t.setScale(ts).setPosition(x + 6 * u, y);
        if (i % 2 === 1) g.fillStyle(0x16132e, 1).fillRect(x + u, y - (lineH - 7 * ts) / 2, pw - 2 * u, lineH);
        if (barW && r.bar !== null && r.bar > 0) {
          const bx = x + pw - 6 * u - barW;
          const by = y + 7 * ts * 0.15;
          const bh = 7 * ts * 0.7;
          g.fillStyle(0x16132e, 1).fillRect(bx, by, barW, bh);
          g.fillStyle(r.color, 0.95).fillRect(bx, by, Math.max(u, barW * r.bar), bh);
          // the 50% mark
          g.fillStyle(0xffffff, 0.35).fillRect(bx + barW / 2, by - u / 2, Math.max(1, u / 2), bh + u);
        }
      });
      x += pw + gap;
    }
  }

  private relayoutNow(): void {
    this.layoutUi(this.scale.width, this.scale.height, this.u);
  }

  protected override layoutUi(w: number, h: number, u: number): void {
    if (!this.list) return;
    this.layoutWith(w, h, u, u);
    // TEXT SIZE above 100%: when a larger title and menu would squeeze the table's rows below their 100% height, those
    // stay at their 100% size and the table gets the room
    const base = u / Math.max(1, settings.uiScale);
    if (base < u && this.tableRowH > 0 && this.tableRowH < 18 * base) this.layoutWith(w, h, u, base);
  }

  /** Row height the last FIGHTERS / ARCADE table got (0 on the other pages). */
  private tableRowH = 0;

  /** Lays the screen out with `cu` for the title, the tally and the menu (the chrome) and `u` for the page. */
  private layoutWith(w: number, h: number, u: number, cu: number): void {
    this.tableRowH = 0;
    this.title.setScale(Math.min(cu * 4, (w * 0.9) / Math.max(1, textPx(this.title)))).setPosition(w / 2, h * 0.08);
    const footTop = this.placeFooter(this.hint);
    // bottom up: hint, menu (3-4 rows), tally; the page fills what is left under the title
    // (rows are a finger tall on a touch screen: see MenuList.layout)
    const menuH = this.list.items.length * Math.max(18 * cu, tapMin(this));
    const menuTop = footTop - 6 * cu - menuH;
    this.list.layout(w / 2, menuTop + 4 * cu, cu, 150, footTop);
    // (finger-tall touch rows pad the menu's plate further up: the tally stays clear of it, and on the screen)
    this.chal.setScale(Math.min(cu, (w * 0.94) / Math.max(1, textPx(this.chal)))).setPosition(w / 2, menuTop - 10 * cu - Math.max(0, tapMin(this) - 18 * cu) / 2);
    this.sub.setScale(Math.min(cu * 1.2, (w * 0.94) / Math.max(1, textPx(this.sub)))).setPosition(w / 2, this.title.y + this.title.displayHeight / 2 + 7 * cu);
    const top = this.sub.y + 8 * cu;
    const bottom = this.chal.y - 7 * cu;
    const g = this.plate.clear();
    const page = PAGES[this.page];
    if (page === 'FIGHTERS' || page === 'ARCADE') this.layoutTable(g, w, u, top, bottom);
    else if (page === 'STATS') this.layoutStats(g, w, u, top, bottom);
    else if (page === 'MATCHUPS') this.layoutMatchups(g, w, u, top, bottom);
    else this.layoutTables(g, w, u, top, bottom);
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
    this.tableRowH = rowH;
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
    el('p', 'margin:0 0 10px;color:#c8c4ec', 'Copy the text below to keep your records somewhere safe or move them to another browser. To load a save, paste its text into the box and press LOAD. Settings and controls are not part of the save. Starred replays from the replay vault ride along (as many as fit); loading a save adds them to the vault.');
    const area = el('textarea', 'width:100%;height:120px;box-sizing:border-box;background:#07060f;color:#7fe8ff;border:2px solid #3c3478;font:12px/1.3 ui-monospace,Menlo,Consolas,monospace;padding:6px;resize:vertical');
    area.spellcheck = false;
    area.setAttribute('aria-label', 'Save text');
    area.value = exportSave();
    const status = el('p', 'margin:6px 0;min-height:1.4em;color:#7affa0', '');
    // the vault is asynchronous storage: its favourites join the save text once read
    void vaultList()
      .then(() => {
        if (this.overlay !== root || pendingLoad()) return;
        area.value = exportSave();
        const skipped = vaultSkippedInSave();
        if (skipped) say(`${skipped} favourite replays are left out of the save text (too long): use their share codes in the replay vault.`, true);
      })
      .catch(() => undefined);
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
    const pendingLoad = (): boolean => !!pending || area.value !== exportSaveSnapshot;
    const exportSaveSnapshot = area.value;
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
