import Phaser from 'phaser';
import { up } from '../../art/pixelFont';
import { settings } from '../../settings';
import type { MatchScene } from '../MatchScene';
import { canvasDpr, hudUnit } from './hudLayout';

/**
 * `?bench=<seconds>` (with a 4-CPU match): measures frame times for that long, then shows and logs the summary (and sets
 * `window.__benchResult`). Run it on each machine / browser to get comparable numbers (fps, 1% low, sim ms, JS ms per frame).
 * The countdown is skipped while benching.
 */
export class Bench {
  frames = 0;
  readonly t0 = performance.now();
  sim = 0;
  upd = 0;
  done = false;

  private constructor(
    private readonly s: MatchScene,
    readonly seconds: number,
  ) {}

  /** A bench for this match if the URL asks for one (it hides the help text). */
  static fromUrl(s: MatchScene): Bench | null {
    const sec = Number(new URLSearchParams(location.search).get('bench') ?? 0);
    if (!(sec > 0)) return null;
    s.st.helpOn = false;
    s.hud.helpText.setVisible(false);
    return new Bench(s, sec);
  }

  /** Once per rendered frame. */
  step(simMs: number, updMs: number): void {
    if (this.done) return;
    const s = this.s;
    this.frames++;
    this.sim += simMs;
    this.upd += updMs;
    if ((performance.now() - this.t0) / 1000 < this.seconds) return;
    this.done = true;
    const secs = (performance.now() - this.t0) / 1000;
    const result = {
      seconds: Number(secs.toFixed(1)),
      frames: this.frames,
      avgFps: Number((this.frames / secs).toFixed(1)),
      oneLowFps: Number(s.perf.lowFps.toFixed(1)),
      worstFrameMs: Number(s.perf.maxMs.toFixed(1)),
      simMsPerFrame: Number((this.sim / this.frames).toFixed(3)),
      jsMsPerFrame: Number((this.upd / this.frames).toFixed(2)),
      resolution: `${s.scale.width}x${s.scale.height}`,
      dpr: Number(canvasDpr(s).toFixed(2)),
      particles: settings.particleQuality,
      renderer: s.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas',
      userAgent: navigator.userAgent,
    };
    (window as unknown as { __benchResult: unknown }).__benchResult = result;
    console.info('BENCH RESULT', JSON.stringify(result));
    s.hud.banner
      .setText(up(`BENCH DONE\n${result.avgFps} FPS AVG   ${result.oneLowFps} FPS 1% LOW\nSIM ${result.simMsPerFrame} MS   JS ${result.jsMsPerFrame} MS PER FRAME`))
      .setScale(hudUnit(s.scale.height) * 1.6)
      .setVisible(true);
  }
}
