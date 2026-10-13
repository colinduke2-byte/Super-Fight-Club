import Phaser from 'phaser';

/** Rolling frame-time statistics (ring buffer, allocation-free) rendered as one line of text. */
export class PerfCounter {
  private readonly samples = new Float32Array(120);
  private idx = 0;
  private count = 0;
  private sinceText = 0;
  readonly text: Phaser.GameObjects.Text;
  visible = true;

  constructor(scene: Phaser.Scene, fontPx: number) {
    this.text = scene.add
      .text(0, 0, '', { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: `${fontPx}px`, color: '#9affb0', backgroundColor: '#000000aa', padding: { x: 4, y: 2 } })
      .setOrigin(1, 0)
      .setScrollFactor(0);
  }

  push(frameMs: number): void {
    this.samples[this.idx] = frameMs;
    this.idx = (this.idx + 1) % this.samples.length;
    if (this.count < this.samples.length) this.count++;
  }

  get avgMs(): number {
    let s = 0;
    for (let i = 0; i < this.count; i++) s += this.samples[i];
    return this.count ? s / this.count : 0;
  }
  /** p-th percentile (0..1) of the recent frame times. Allocates: call from reports, not per frame. */
  percentile(p: number): number {
    if (this.count === 0) return 0;
    const a = Array.from(this.samples.subarray(0, this.count)).sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(p * a.length))];
  }

  /** "1% low" fps: the frame rate of the slowest 1% of recent frames. */
  get lowFps(): number {
    return 1000 / Math.max(0.001, this.percentile(0.99));
  }

  get maxMs(): number {
    let m = 0;
    for (let i = 0; i < this.count; i++) if (this.samples[i] > m) m = this.samples[i];
    return m;
  }

  /**
   * Refresh the label at most 4x per second to avoid per-frame string churn. Pass `extra` as a function so its text (and anything
   * costly in it, such as `lowFps`, which sorts) is only built when the counter is shown and due to refresh.
   */
  update(frameMs: number, extra: string | (() => string)): void {
    this.text.setVisible(this.visible);
    if (!this.visible) return;
    this.sinceText += frameMs;
    if (this.sinceText < 250) return;
    this.sinceText = 0;
    const avg = this.avgMs;
    this.text.setText(`${(1000 / Math.max(avg, 0.001)).toFixed(0)} fps  ${avg.toFixed(1)} ms (max ${this.maxMs.toFixed(1)})  ${typeof extra === 'function' ? extra() : extra}`);
  }

  layout(width: number, margin: number): void {
    this.text.setPosition(width - margin, margin);
  }
}
