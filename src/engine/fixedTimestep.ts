import { SIM_HZ, STEP_MS } from './constants';

/**
 * Fixed-timestep accumulator ("Fix Your Timestep"). Rendering runs at whatever the display
 * gives us; the simulation advances in exact 1/60 s ticks. Leftover time becomes `alpha`
 * (0..1) so the renderer can interpolate between the previous and current sim state.
 *
 * Frame deltas that land (within `snapMs`) on a whole multiple/divisor of the sim step are
 * snapped to it. This removes vsync jitter so 60/120/144 Hz displays do not produce
 * irregular 0-step / 2-step frames.
 */
export class FixedTimestep {
  /** Accumulated, not-yet-simulated time in ms. */
  accumulator = 0;
  /** Total sim steps taken. */
  totalSteps = 0;

  constructor(
    readonly stepMs: number = STEP_MS,
    /** Max sim steps per rendered frame; extra time is dropped (avoids the spiral of death). */
    readonly maxStepsPerFrame = 5,
    /** Frame deltas above this are clamped (tab was hidden, debugger paused, ...). */
    readonly maxFrameMs = 250,
    readonly snapMs = 1.0,
  ) {}

  /** Snap a raw frame delta to nearby refresh-rate-aligned values (1x, 2x, 3x, 1/2x, 1/3x, 1/4x of a step). */
  snap(frameMs: number): number {
    const s = this.stepMs;
    const candidates = [s * 3, s * 2, s, s / 2, s / 3, s / 4];
    for (const c of candidates) {
      // tolerance scales down for the small divisors so 144 Hz (6.94 ms) is not forced onto 8.33 ms
      const tol = Math.min(this.snapMs, c * 0.06);
      if (Math.abs(frameMs - c) < tol) return c;
    }
    return frameMs;
  }

  /**
   * Feed the real elapsed time since the previous frame. Calls `step` once per whole sim tick.
   * Returns the number of ticks run.
   */
  advance(frameMs: number, step: () => void): number {
    if (!(frameMs > 0)) return 0;
    if (frameMs > this.maxFrameMs) frameMs = this.maxFrameMs;
    this.accumulator += this.snap(frameMs);

    let steps = 0;
    // epsilon absorbs float error when accumulating e.g. 2 x 8.3333 ms
    while (this.accumulator + 1e-6 >= this.stepMs && steps < this.maxStepsPerFrame) {
      step();
      this.accumulator -= this.stepMs;
      steps++;
    }
    if (steps === this.maxStepsPerFrame && this.accumulator >= this.stepMs) {
      // fell behind: discard the backlog
      this.accumulator = this.accumulator % this.stepMs;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    this.totalSteps += steps;
    return steps;
  }

  /** Interpolation factor for rendering between the last two sim states. */
  get alpha(): number {
    const a = this.accumulator / this.stepMs;
    return a < 0 ? 0 : a > 1 ? 1 : a;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

export { SIM_HZ };
