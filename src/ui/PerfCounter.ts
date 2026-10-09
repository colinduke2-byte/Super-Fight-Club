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
  get maxMs(): number {
    let m = 0;
    for (let i = 0; i < this.count; i++) if (this.samples[i] > m) m = this.samples[i];
    return m;
  }

  /** Refresh the label at most 4x per second to avoid per-frame string churn. */
  update(frameMs: number, extra: string): void {
    this.text.setVisible(this.visible);
    if (!this.visible) return;
    this.sinceText += frameMs;
    if (this.sinceText < 250) return;
    this.sinceText = 0;
    const avg = this.avgMs;
    this.text.setText(`${(1000 / Math.max(avg, 0.001)).toFixed(0)} fps  ${avg.toFixed(1)} ms (max ${this.maxMs.toFixed(1)})  ${extra}`);
  }

  layout(width: number, margin: number): void {
    this.text.setPosition(width - margin, margin);
  }
}
