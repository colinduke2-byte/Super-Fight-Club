import { resolveCombat } from './combat';
import { GRAB_DISTANCE, type Fighter } from './fighter';
import { Ledge, Platform } from './platform';
import type { BlastZones, StageData } from './types';

export type WorldEventType =
  | 'jump'
  | 'doubleJump'
  | 'land'
  | 'landBounce'
  | 'hit'
  | 'armorHit'
  | 'shieldHit'
  | 'shieldBreak'
  | 'bounce'
  | 'tech'
  | 'ledgeGrab'
  | 'dodge'
  | 'grab'
  | 'pummel'
  | 'throw'
  | 'moveStart'
  | 'trade'
  | 'ko';
/** `extra` meaning: hit/armorHit/shieldHit/pummel = damage dealt; ko = id of the last attacker (-1 none). */
export type WorldListener = (type: WorldEventType, fighter: Fighter, x: number, y: number, magnitude: number, extra: number) => void;

export interface WorldConfig {
  /** Flicking the stick + Attack performs a smash (otherwise only the Smash button does). */
  smashFlick: boolean;
}

/** Holds the stage and fighters and advances them one fixed tick at a time. Deterministic. */
export class World {
  readonly platforms: Platform[];
  readonly ledges: Ledge[] = [];
  readonly fighters: Fighter[] = [];
  readonly blast: BlastZones;
  tick = 0;
  listener: WorldListener | null = null;
  config: WorldConfig = { smashFlick: true };

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
    this.fixGrabs();
    resolveCombat(this);
  }

  /** Keep grabbed fighters pinned to their captor and clean up broken grab links. */
  private fixGrabs(): void {
    const fs = this.fighters;
    for (const a of fs) {
      if (a.grabTarget < 0) continue;
      const v = fs[a.grabTarget];
      if (!v || v.grabbedBy !== a.id || v.state === 'ko') {
        // victim got hit / KO'd out of the grab
        a.grabTarget = -1;
        if (a.state === 'holding') a.setState('idle');
      } else if (a.state === 'holding' && a.holdTimer <= 0) {
        v.releaseGrab();
        a.grabTarget = -1;
        a.setState('idle');
      }
    }
    for (const v of fs) {
      if (v.grabbedBy < 0) continue;
      const a = fs[v.grabbedBy];
      if (!a || a.grabTarget !== v.id) {
        v.releaseGrab();
        continue;
      }
      v.x = a.x + a.facing * GRAB_DISTANCE;
      v.y = a.y;
      v.facing = (-a.facing) as 1 | -1;
      v.snapped = true;
    }
  }

  emit(type: WorldEventType, f: Fighter, x: number, y: number, magnitude: number, extra: number): void {
    if (this.listener) this.listener(type, f, x, y, magnitude, extra);
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
