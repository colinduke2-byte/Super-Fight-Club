import type Phaser from 'phaser';
import { PIXEL_FONT, up } from '../art/pixelFont';
import { formatSec } from '../game/records';
import type { TimelineData } from '../game/results';
import { COLORS, drawPanel, drawPortShape, textPx } from './menuKit';

/** One fighter on the graphs: its tag ("P1", "CPU2") and port colour. */
export interface GraphFighter {
  label: string;
  color: number;
}

/**
 * The results graphs, drawn from a finished match's timeline (results.ts MatchTimeline): each fighter's damage over the match
 * as a line (a KO drops it back to 0 and is marked with the fighter's port shape), and under it a stock timeline: one bar per
 * fighter from the start until they were out, notched at every fall, with the stocks left written on each stretch.
 *
 * Self-contained: create it on any layer, call `layout(x, y, w, h, u)` with the box to fill (and again on resize), `destroy()`
 * when done. It draws nothing until laid out.
 */
export class ResultsGraph {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.BitmapText[] = [];
  private readonly title: Phaser.GameObjects.BitmapText;
  private readonly stockTitle: Phaser.GameObjects.BitmapText;
  private readonly yMax: Phaser.GameObjects.BitmapText;
  private readonly yMid: Phaser.GameObjects.BitmapText;
  private readonly t0: Phaser.GameObjects.BitmapText;
  private readonly t1: Phaser.GameObjects.BitmapText;
  private readonly names: Phaser.GameObjects.BitmapText[];
  private readonly counts: Phaser.GameObjects.BitmapText[] = [];
  private visible = true;
  private box: [number, number, number, number, number] | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly data: TimelineData,
    private readonly fighters: readonly GraphFighter[],
  ) {
    this.g = scene.add.graphics();
    layer.add(this.g);
    const t = (s: string, tint: number = COLORS.text): Phaser.GameObjects.BitmapText => {
      const o = scene.add.bitmapText(0, 0, PIXEL_FONT, up(s)).setTint(tint);
      layer.add(o);
      this.texts.push(o);
      return o;
    };
    this.title = t('DAMAGE OVER TIME', COLORS.title);
    this.stockTitle = t('STOCKS', COLORS.title);
    this.yMax = t('', COLORS.dim).setOrigin(1, 0.5);
    this.yMid = t('', COLORS.dim).setOrigin(1, 0.5);
    this.t0 = t('0:00', COLORS.dim).setOrigin(0, 0);
    this.t1 = t(formatSec(data.ticks / 60), COLORS.dim).setOrigin(1, 0);
    this.names = fighters.map((f) => t(f.label, f.color).setOrigin(1, 0.5));
  }

  /** The highest damage on the chart's axis: the peak rounded up to 50, at least 100. */
  static axisMax(data: TimelineData): number {
    let m = 0;
    for (const a of data.damage) for (const v of a) if (v > m) m = v;
    return Math.max(100, Math.ceil(m / 50) * 50);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.g.setVisible(v);
    for (const o of [...this.texts, ...this.counts]) o.setVisible(v);
  }

  /** Fills the box (x, y, w, h) in screen pixels at UI unit `u`. */
  layout(x: number, y: number, w: number, h: number, u: number): void {
    this.box = [x, y, w, h, u];
    this.draw();
  }

  private draw(): void {
    if (!this.box) return;
    const [x, y, w, h, u] = this.box;
    const d = this.data;
    const n = this.fighters.length;
    const g = this.g.clear();
    drawPanel(g, x, y, w, h, u, 0.96);
    const k = Math.max(1, Math.round(u * 0.8));
    const pad = 6 * u;
    const labW = Math.max(...this.names.map((t) => textPx(t)), textPx(this.yMax.setText('300'))) * k + 4 * u;
    const left = x + pad + labW;
    const right = x + w - pad;
    const cw = Math.max(10, right - left);
    // the damage chart over the top ~60%, the stock rows under it
    this.title.setScale(k).setPosition(x + pad, y + pad);
    const top = this.title.y + 7 * k + 4 * u;
    const rowH = Math.min(10 * u, (h * 0.36) / Math.max(1, n));
    const stocksH = rowH * n;
    const chartBottom = y + h - pad - stocksH - 7 * k - 12 * u;
    const ch = Math.max(10, chartBottom - top);
    const max = ResultsGraph.axisMax(d);
    const samples = Math.max(1, (d.damage[0]?.length ?? 1) - 1);
    const total = Math.max(1, d.ticks);
    const xs = (i: number): number => left + Math.min(1, (i * d.every) / total) * cw;
    const xt = (t: number): number => left + Math.min(1, t / total) * cw;
    const yd = (v: number): number => chartBottom - (Math.min(v, max) / max) * ch;

    // grid: every 50%, the 100% line brighter (a fighter there is in KO range)
    g.fillStyle(0x07060f, 0.6).fillRect(left, top, cw, ch);
    for (let v = 50; v <= max; v += 50) {
      g.fillStyle(v === 100 ? 0x5a4a8a : 0x241f48, 1).fillRect(left, Math.round(yd(v)), cw, Math.max(1, u / 2));
    }
    g.fillStyle(0x3c3478, 1).fillRect(left, chartBottom, cw, Math.max(1, u / 2));
    this.yMax.setText(String(max)).setScale(k).setPosition(left - 2 * u, yd(max));
    this.yMid.setText('100').setScale(k).setPosition(left - 2 * u, yd(100)).setVisible(this.visible && max > 100);

    // one line per fighter (a KO falls straight down to 0 at its tick)
    const lw = Math.max(1, Math.round(u * 0.75));
    d.damage.forEach((series, fi) => {
      const col = this.fighters[fi]?.color ?? COLORS.text;
      g.lineStyle(lw + 2, 0x07060f, 0.9);
      this.path(g, series, xs, yd, samples);
      g.lineStyle(lw, col, 1);
      this.path(g, series, xs, yd, samples);
    });
    // KO markers: the fallen fighter's port shape where its line drops
    for (const ko of d.kos) {
      const series = d.damage[ko.victim];
      if (!series) continue;
      const i = Math.min(series.length - 1, Math.max(0, Math.floor(ko.t / d.every)));
      const v = series[i] ?? 0;
      const col = this.fighters[ko.victim]?.color ?? COLORS.text;
      drawPortShape(g, ko.victim % 4, xt(ko.t), yd(v), 2.6 * u, col, 1, Math.max(1, u * 0.6));
    }
    this.t0.setScale(k).setPosition(left, chartBottom + 2 * u);
    this.t1.setScale(k).setPosition(right, chartBottom + 2 * u);

    // stock timeline
    const st = chartBottom + 7 * k + 6 * u;
    this.stockTitle.setScale(k).setPosition(x + pad, st);
    for (const c of this.counts) c.destroy();
    this.counts.length = 0;
    const rows0 = st + 7 * k + 3 * u;
    const rh = Math.max(4 * u, Math.min(rowH, (y + h - pad - rows0) / Math.max(1, n)));
    for (let fi = 0; fi < n; fi++) {
      const col = this.fighters[fi].color;
      const ry = rows0 + fi * rh;
      const by = ry + rh * 0.2;
      const bh = rh * 0.6;
      this.names[fi].setScale(Math.min(k, (bh * 1.4) / 7)).setPosition(left - 3 * u, by + bh / 2);
      g.fillStyle(0x16132e, 1).fillRect(left, by, cw, bh);
      const stocks = d.stocks[fi] ?? [];
      // stretches between this fighter's falls, each with the stocks it had
      const falls = d.kos.filter((ko) => ko.victim === fi).map((ko) => ko.t);
      const outAt = (() => {
        const last = stocks.length ? stocks[stocks.length - 1] : 1;
        return last <= 0 && falls.length ? falls[falls.length - 1] : total;
      })();
      g.fillStyle(col, 0.85).fillRect(left, by, Math.max(u, xt(outAt) - left), bh);
      const edges = [0, ...falls.filter((t) => t < outAt), outAt];
      for (let s = 0; s + 1 < edges.length; s++) {
        const a = xt(edges[s]);
        const b = xt(edges[s + 1]);
        if (s > 0) g.fillStyle(0x07060f, 1).fillRect(a - u / 2, by - u, Math.max(1, u), bh + 2 * u);
        const at = Math.min(stocks.length - 1, Math.max(0, Math.floor((edges[s] + 1) / d.every)));
        const left0 = stocks[at] ?? 0;
        if (b - a > 10 * u && left0 > 0) {
          const c = this.scene.add.bitmapText((a + b) / 2, by + bh / 2, PIXEL_FONT, String(left0)).setOrigin(0.5).setTint(0x07060f);
          c.setScale(Math.max(1, Math.min(k, (bh * 0.85) / 7))).setVisible(this.visible);
          this.layer.add(c);
          this.counts.push(c);
        }
      }
    }
  }

  private path(g: Phaser.GameObjects.Graphics, series: readonly number[], xs: (i: number) => number, yd: (v: number) => number, samples: number): void {
    if (!series.length) return;
    g.beginPath();
    g.moveTo(xs(0), yd(series[0]));
    for (let i = 1; i < series.length && i <= samples + 1; i++) g.lineTo(xs(i), yd(series[i]));
    g.strokePath();
  }

  destroy(): void {
    this.g.destroy();
    for (const o of [...this.texts, ...this.counts]) o.destroy();
    this.texts.length = 0;
    this.counts.length = 0;
  }
}
