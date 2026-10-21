import type { Fighter } from '../engine/fighter';
import { footstepFor } from './soundMap';
import { sfx } from './sfx';

/** What footsteps need from a match: its fighters, the stage (for the floor's surface), the sim clock and stereo pan. */
export interface StepSource {
  readonly fighters: readonly Fighter[];
  readonly stageId: string | undefined;
  /** Sim tick (steps only advance while the sim does: none while paused or frozen). */
  tick(): number;
  pan(x: number): number;
}

/** Distance (px) per footfall, as a fraction of the fighter's height: a run of a 36 px fighter steps every ~29 px, about four steps a second. */
const STRIDE = 0.8;
/** Slower than this (px a tick) is standing still, however the stick is held. */
const MIN_SPEED = 0.6;
/** Footsteps louder than this many at once are dropped (four runners never turn into a drum roll). */
const MAX_PER_TICK = 2;

/**
 * Soft, surface-aware footsteps for fighters walking and running on the ground. Driven per frame (from the ambience update,
 * which every match calls), it follows the sim clock: each grounded runner accumulates the distance covered and takes a
 * step each stride. Plays through the SFX bus, so the SFX volume applies; presentation only.
 */
export class Footsteps {
  private src: StepSource | null = null;
  private lastTick = -1;
  private dist: number[] = [];

  attach(src: StepSource): void {
    this.src = src;
    this.lastTick = src.tick();
    // half a stride in, so the first step lands soon after a fighter sets off
    this.dist = src.fighters.map((f) => f.h * STRIDE * 0.5);
  }

  detach(src?: StepSource): void {
    if (!src || src === this.src) this.src = null;
  }

  get attached(): boolean {
    return this.src !== null;
  }

  /** Per frame. Returns how many steps were played (for tests). */
  update(): number {
    const src = this.src;
    if (!src) return 0;
    const now = src.tick();
    const dt = Math.max(0, Math.min(8, now - this.lastTick));
    this.lastTick = now;
    if (dt === 0) return 0;
    let played = 0;
    src.fighters.forEach((f, i) => {
      const moving = f.grounded && (f.state === 'run' || f.state === 'dash') && Math.abs(f.vx) > MIN_SPEED;
      if (!moving) {
        this.dist[i] = f.h * STRIDE * 0.5;
        return;
      }
      const stride = Math.max(14, f.h * STRIDE);
      this.dist[i] = (this.dist[i] ?? 0) + Math.abs(f.vx) * dt;
      if (this.dist[i] < stride) return;
      this.dist[i] %= stride;
      if (played >= MAX_PER_TICK) return;
      const cue = footstepFor(src.stageId, Math.abs(f.vx), (f.stats.weight || 100) / 100);
      sfx.play(cue.name, cue.intensity, src.pan(f.x));
      played++;
    });
    return played;
  }
}

export const footsteps = new Footsteps();
