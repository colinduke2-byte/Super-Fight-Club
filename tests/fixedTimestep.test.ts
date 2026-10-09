import { describe, expect, it } from 'vitest';
import { FixedTimestep } from '../src/engine/fixedTimestep';

/** Run `seconds` of wall time at a given display refresh rate (optionally jittered) and count sim steps. */
function simulate(hz: number, seconds: number, jitterMs = 0, seed = 1): { steps: number; ft: FixedTimestep } {
  const ft = new FixedTimestep();
  let steps = 0;
  const frame = 1000 / hz;
  let t = 0;
  let s = seed;
  const rnd = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5) * 2;
  while (t < seconds * 1000) {
    const dt = frame + rnd() * jitterMs;
    t += dt;
    steps += ft.advance(dt, () => {});
  }
  return { steps, ft };
}

describe('FixedTimestep', () => {
  it.each([60, 120, 144, 165, 240, 75])('runs ~60 steps per second on a %d Hz display', (hz) => {
    const { steps } = simulate(hz, 10);
    expect(Math.abs(steps - 600)).toBeLessThanOrEqual(2);
  });

  it('stays at 60 steps/s with vsync jitter on 60/120/144 Hz', () => {
    for (const hz of [60, 120, 144]) {
      const { steps } = simulate(hz, 10, 0.4);
      expect(Math.abs(steps - 600)).toBeLessThanOrEqual(3);
    }
  });

  it('takes exactly one step per frame on a perfect 60 Hz display (no 0/2-step stutter)', () => {
    const ft = new FixedTimestep();
    const counts = new Set<number>();
    for (let i = 0; i < 600; i++) counts.add(ft.advance(16.67 + (i % 2 ? 0.3 : -0.3), () => {}));
    expect([...counts]).toEqual([1]);
  });

  it('produces an identical step count regardless of frame pacing for the same wall time', () => {
    const a = simulate(60, 5).steps;
    const b = simulate(144, 5).steps;
    expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
  });

  it('clamps huge frame deltas (spiral of death) and caps steps per frame', () => {
    const ft = new FixedTimestep();
    let n = 0;
    const steps = ft.advance(10_000, () => n++);
    expect(steps).toBe(5);
    expect(n).toBe(5);
    expect(ft.accumulator).toBeLessThan(ft.stepMs);
  });

  it('exposes an interpolation alpha in [0,1)', () => {
    const ft = new FixedTimestep();
    ft.advance(10, () => {});
    expect(ft.alpha).toBeCloseTo(10 / ft.stepMs, 3);
    for (let i = 0; i < 100; i++) {
      ft.advance(7.3, () => {});
      expect(ft.alpha).toBeGreaterThanOrEqual(0);
      expect(ft.alpha).toBeLessThanOrEqual(1);
    }
  });

  it('ignores zero / negative deltas', () => {
    const ft = new FixedTimestep();
    expect(ft.advance(0, () => {})).toBe(0);
    expect(ft.advance(-5, () => {})).toBe(0);
  });
});
