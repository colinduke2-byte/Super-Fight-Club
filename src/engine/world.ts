import type { Fighter } from './fighter';
import { Ledge, Platform } from './platform';
import type { BlastZones, StageData } from './types';

export type WorldEventType = 'jump' | 'doubleJump' | 'land' | 'hit' | 'bounce' | 'tech' | 'ledgeGrab' | 'ko';
export type WorldListener = (type: WorldEventType, fighter: Fighter, x: number, y: number, magnitude: number) => void;

/** Holds the stage and fighters and advances them one fixed tick at a time. Deterministic. */
export class World {
  readonly platforms: Platform[];
  readonly ledges: Ledge[] = [];
  readonly fighters: Fighter[] = [];
  readonly blast: BlastZones;
  tick = 0;
  listener: WorldListener | null = null;

  constructor(readonly stage: StageData) {
    this.blast = stage.blast;
    this.platforms = stage.platforms.map((d, i) => new Platform(i, d));
    for (const p of this.platforms) {
      if (p.ledges) {
        this.ledges.push(new Ledge(p, -1), new Ledge(p, 1));
      }
    }
  }

  addFighter(f: Fighter): void {
    this.fighters.push(f);
  }

  step(inputs: ReadonlyArray<Readonly<import('./buttons').FighterInput>>): void {
    this.tick++;
    for (let i = 0; i < this.platforms.length; i++) this.platforms[i].update(this.tick);
    for (let i = 0; i < this.fighters.length; i++) this.fighters[i].update(inputs[i], this);
  }

  emit(type: WorldEventType, f: Fighter, x: number, y: number, magnitude: number): void {
    if (this.listener) this.listener(type, f, x, y, magnitude);
  }

  /** Cheap state fingerprint for determinism checks. */
  hash(): number {
    const buf = new Float64Array(1);
    const u32 = new Uint32Array(buf.buffer);
    let h = 2166136261 >>> 0;
    const mix = (v: number): void => {
      buf[0] = v;
      h = Math.imul(h ^ u32[0], 16777619) >>> 0;
      h = Math.imul(h ^ u32[1], 16777619) >>> 0;
    };
    mix(this.tick);
    for (const f of this.fighters) {
      mix(f.x);
      mix(f.y);
      mix(f.vx);
      mix(f.vy);
      mix(f.stateFrame);
      mix(f.jumpsLeft);
      mix(f.damage);
    }
    return h;
  }
}
