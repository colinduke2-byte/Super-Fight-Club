import type { ParticleQuality } from '../settings';

const ORDER: ParticleQuality[] = ['high', 'medium', 'low'];

/**
 * Watches frame times and asks for a lower particle tier when the game cannot hold ~45 fps for several seconds in a row
 * (so a slow laptop or integrated GPU degrades effects, not gameplay). It only ever steps down, with a cooldown, and never
 * touches the saved setting: the match scene applies the result as a temporary cap.
 */
export class AdaptiveQuality {
  private sum = 0;
  private frames = 0;
  private slowWindows = 0;
  private cooldown = 0;
  /** Current cap, or null while no reduction was needed. */
  cap: ParticleQuality | null = null;

  constructor(
    /** Average frame time (ms) above which a window counts as slow. */
    private readonly slowMs = 22,
    /** Frames per measurement window. */
    private readonly windowFrames = 90,
    /** Consecutive slow windows before stepping down. */
    private readonly windowsNeeded = 2,
  ) {}

  /** Feed one frame; returns the new cap when a step down just happened. */
  observe(frameMs: number, current: ParticleQuality): ParticleQuality | null {
    if (this.cooldown > 0) {
      this.cooldown--;
      return null;
    }
    // ignore hitches (tab switch, first frames): they say nothing about sustained cost
    this.sum += Math.min(frameMs, 100);
    if (++this.frames < this.windowFrames) return null;
    const avg = this.sum / this.frames;
    this.sum = 0;
    this.frames = 0;
    if (avg <= this.slowMs) {
      this.slowWindows = 0;
      return null;
    }
    if (++this.slowWindows < this.windowsNeeded) return null;
    this.slowWindows = 0;
    const eff = this.cap ?? current;
    const next = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(eff) + 1)];
    if (next === eff) return null;
    this.cap = next;
    this.cooldown = 600; // ten seconds at 60 fps before judging again
    return next;
  }
}
