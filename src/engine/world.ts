import { resolveCombat } from './combat';
import { Deployable, MAX_DEPLOYABLES, MAX_PROJECTILES, Projectile } from './entities';
import { resolveEntityCombat, updateEntities } from './entityCombat';
import type { MoveDef } from './moves';
import { GRAB_DISTANCE, type Fighter } from './fighter';
import { stepHazards } from './hazards';
import { stepPillars, strikePillars } from './pillars';
import { stepCollisions } from './physics';
import { Item, MAX_ITEMS, stepItems } from './items';
import { stepTargets, type Target } from './targets';
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
  | 'dash'
  | 'sprint'
  | 'skid'
  | 'fastFall'
  | 'grab'
  | 'pummel'
  | 'throw'
  | 'moveStart'
  | 'trade'
  | 'clank'
  | 'target'
  | 'projectile'
  | 'projectileHit'
  | 'reflect'
  | 'deploy'
  | 'deployableTrigger'
  | 'deployableDestroyed'
  | 'status'
  | 'teleport'
  | 'tether'
  | 'cinematicStart'
  | 'cinematicHit'
  | 'cinematicEnd'
  | 'meterFull'
  | 'fx'
  | 'parry'
  | 'burst'
  | 'sdi'
  | 'trump'
  | 'hazardWarn'
  | 'itemSpawn'
  | 'itemPickup'
  | 'itemThrow'
  | 'itemKnock'
  | 'itemBoom'
  | 'hazardFire'
  | 'pillarShatter'
  | 'collide'
  | 'splat'
  | 'counter'
  | 'blast'
  | 'pillarCrumble'
  | 'ko';
/** `extra` meaning: hit/armorHit/shieldHit/pummel = damage dealt; ko = id of the last attacker (-1 none). */
export type WorldListener = (type: WorldEventType, fighter: Fighter, x: number, y: number, magnitude: number, extra: number, tag?: string) => void;

export interface CinematicState {
  attacker: Fighter;
  victim: Fighter;
  move: MoveDef;
  frame: number;
}

export interface WorldConfig {
  /** Flicking the stick + Attack performs a smash (otherwise only the Smash button does). */
  smashFlick: boolean;
  /** Item drops: 0 off, 1 low, 2 high. */
  itemRate: number;
  /** Item kinds switched off, one bit per ITEM_KINDS index (0 / absent = every kind drops). */
  itemsOff?: number;
  /** Team attack: teammates' attacks hit each other (CPUs still never target a teammate). */
  teamAttack?: boolean;
  /** Match rules: damage dealt by every hit, x this (0.5..2, default 1). */
  damageRatio?: number;
  /** Match rules: knockback of every hit, x this (0.5..2, default 1). */
  launchRate?: number;
}

/** Holds the stage and fighters and advances them one fixed tick at a time. Deterministic. */
/** Soft-push per tick (world units) for barely overlapping grounded fighters; it grows with the overlap up to SOFT_PUSH_MAX. */
export const SOFT_PUSH = 0.4;
/** Extra push per unit of overlap, and the cap: two bodies stacked on the same spot part in a few frames, a dash still runs through. */
export const SOFT_PUSH_DEPTH = 0.05;
export const SOFT_PUSH_MAX = 1;

/** Fighters standing, moving, shielding or attacking on the ground are nudged (not hit, grabbed, dodging or rolling: cross-ups stay). */
const PUSH_STATES = new Set<Fighter['state']>(['idle', 'run', 'dash', 'crouch', 'landing', 'shield', 'jumpsquat', 'attack']);
function pushable(f: Fighter): boolean {
  return f.grounded && f.hitlag === 0 && PUSH_STATES.has(f.state) && !(f.state === 'attack' && f.move?.kind === 'throw');
}

/** A fighter running / dashing into the other passes straight through (cross-ups): the pair is not pushed apart meanwhile. */
function runsThrough(f: Fighter, dxToOther: number): boolean {
  return (f.state === 'run' || f.state === 'dash') && f.vx * dxToOther > 0 && Math.abs(f.vx) > 1.4;
}

export class World {
  readonly platforms: Platform[];
  readonly ledges: Ledge[] = [];
  readonly fighters: Fighter[] = [];
  readonly blast: BlastZones;
  /** Target Smash targets (empty on normal stages). */
  readonly targets: Target[] = [];
  readonly projectiles: Projectile[] = Array.from({ length: MAX_PROJECTILES }, (_, i) => new Projectile(i));
  readonly deployables: Deployable[] = Array.from({ length: MAX_DEPLOYABLES }, (_, i) => new Deployable(i));
  /** Active ultimate cutscene, or null. While set, only the cutscene advances. */
  cinematic: CinematicState | null = null;
  private deploySerial = 0;
  tick = 0;
  listener: WorldListener | null = null;
  config: WorldConfig = { smashFlick: true, itemRate: 0 };
  readonly items: Item[] = Array.from({ length: MAX_ITEMS }, (_, i) => new Item(i));
  itemSeed = 12345;

  /** Damage % each fighter (by id) has inflicted on others; stats only, never read by the sim. */
  readonly damageDealt: number[] = [];
  /** Longest combo (hits) each fighter (by id) has landed; stats only, never read by the sim. */
  readonly bestCombo: number[] = [];
  /** hazardHit[hazard][fighter] = cycle of the last eruption that hit them. */
  readonly hazardHit: number[][];
  /** Stalactite stumps standing on the floor, per hazard (null when none). */
  readonly hazardPlats: (import('./platform').Platform | null)[];

  constructor(readonly stage: StageData) {
    this.blast = stage.blast;
    this.hazardHit = (stage.hazards ?? []).map(() => []);
    this.hazardPlats = (stage.hazards ?? []).map(() => null);
    this.platforms = stage.platforms.map((d, i) => new Platform(i, d));
    for (const p of this.platforms) {
      if (!p.ledges) continue;
      // no ledge where another solid block sits on the corner (a tier flush with the edge): climbing up would land inside it
      for (const side of [-1, 1] as const) {
        const cx = side === -1 ? p.x : p.right;
        // walk-off ground runs on past the blast zone: that end has no ledge (nobody can get there and live)
        if (cx <= stage.blast.left || cx >= stage.blast.right) continue;
        const covered = this.platforms.some((q) => q !== p && q.kind === 'solid' && Math.abs(q.bottom - p.top) < 1 && cx >= q.x - 12 && cx <= q.right + 12);
        if (!covered) this.ledges.push(new Ledge(p, side));
      }
    }
    for (const t of stage.targets ?? []) this.targets.push({ x: t.x, y: t.y, alive: true });
    if (stage.ruleScale) {
      this.config.damageRatio = stage.ruleScale.damage;
      this.config.launchRate = stage.ruleScale.launch;
    }
  }

  /** True when both fighters are on the same team (team battles): no friendly fire. */
  allied(a: number, b: number): boolean {
    const x = this.fighters[a];
    const y = this.fighters[b];
    return !!x && !!y && a !== b && x.team >= 0 && x.team === y.team;
  }

  /** True when `a`'s attacks pass through `b`: same team and team attack is off. */
  shielded(a: number, b: number): boolean {
    return !this.config.teamAttack && this.allied(a, b);
  }

  /**
   * Grounded fighters standing inside each other drift apart (SOFT_PUSH..SOFT_PUSH_MAX per tick each), so bodies stay readable and
   * nobody hides inside an opponent. Never pushes anyone off their platform; frozen (hit-stop), grabbed and ledge states are left alone.
   */
  private softPush(): void {
    const fs = this.fighters;
    for (let i = 0; i < fs.length; i++) {
      const a = fs[i];
      if (!pushable(a)) continue;
      for (let j = i + 1; j < fs.length; j++) {
        const b = fs[j];
        if (!pushable(b) || a.groundPlat !== b.groundPlat || !a.groundPlat) continue;
        const reach = (a.hw * a.sizeMul + b.hw * b.sizeMul) * 0.8;
        const dx = b.x - a.x;
        const overlap = reach - Math.abs(dx);
        if (overlap <= 0 || runsThrough(a, dx) || runsThrough(b, -dx)) continue;
        const dir = dx > 0 ? 1 : dx < 0 ? -1 : a.facing; // exactly stacked: split along the first fighter's facing
        const step = Math.min(overlap / 2, SOFT_PUSH_MAX, SOFT_PUSH + SOFT_PUSH_DEPTH * overlap);
        const p = a.groundPlat;
        a.x = Math.max(p.x + 1, Math.min(p.right - 1, a.x - dir * step));
        b.x = Math.max(p.x + 1, Math.min(p.right - 1, b.x + dir * step));
      }
    }
  }

  addFighter(f: Fighter): void {
    this.fighters.push(f);
    this.damageDealt.push(0);
    this.bestCombo.push(0);
  }

  step(inputs: ReadonlyArray<Readonly<import('./buttons').FighterInput>>): void {
    this.tick++;
    if (this.cinematic) {
      this.stepCinematic();
      return;
    }
    for (let i = 0; i < this.platforms.length; i++) this.platforms[i].update(this.tick);
    stepPillars(this);
    this.markIce();
    for (let i = 0; i < this.fighters.length; i++) this.fighters[i].update(inputs[i], this);
    this.fixGrabs();
    this.softPush();
    stepCollisions(this);
    updateEntities(this);
    resolveCombat(this);
    strikePillars(this);
    resolveEntityCombat(this);
    stepHazards(this);
    stepItems(this);
    stepTargets(this);
  }

  /** Which grounded fighters stand on a rival's ice patch this tick. */
  private markIce(): void {
    for (const f of this.fighters) {
      f.onIce = false;
      if (!f.grounded) continue;
      for (const d of this.deployables) {
        if (!d.active || !d.def?.slick || d.owner === f.id || this.allied(d.owner, f.id)) continue;
        if (Math.abs(f.x - d.x) <= d.def.w / 2 && Math.abs(f.y - d.y) < 4) {
          f.onIce = true;
          break;
        }
      }
    }
  }

  // ---- projectiles / deployables -------------------------------------------------------------
  /** Spawn a projectile defined by fighter `ownerId`'s character. Returns null if the pool is full. */
  spawnProjectile(ownerId: number, defId: string, x: number, y: number, vx: number, vy: number, dmgMult = 1): Projectile | null {
    const def = this.fighters[ownerId]?.data.projectiles?.[defId];
    if (!def) throw new Error(`unknown projectile '${defId}'`);
    for (const p of this.projectiles) {
      // a blast projectile that died this tick still has to go off (resolveBlasts, end of tick): leave its slot alone
      if (p.active || (p.def?.blast && !p.exploded && p.age > 0)) continue;
      p.spawn(ownerId, defId, def, x, y, vx, vy, dmgMult);
      p.moveId = this.fighters[ownerId]?.move?.id ?? '';
      this.emit('projectile', this.fighters[ownerId], x, y, 0, 0);
      return p;
    }
    return null;
  }

  /** Number of live deployables of `group` owned by `ownerId`. */
  countDeployables(ownerId: number, group: string): number {
    let n = 0;
    for (const d of this.deployables) if (d.active && d.owner === ownerId && (d.def!.limitGroup ?? d.defId) === group) n++;
    return n;
  }

  findDeployables(ownerId: number, defId: string): Deployable[] {
    return this.deployables.filter((d) => d.active && d.owner === ownerId && d.defId === defId);
  }

  /**
   * Place a deployable. Honours the def's per-owner limit: over the limit it either replaces the
   * oldest (`replaceOldest`) or refuses (returns null).
   */
  spawnDeployable(ownerId: number, defId: string, x: number, y: number): Deployable | null {
    const owner = this.fighters[ownerId];
    const def = owner?.data.deployables?.[defId];
    if (!def) throw new Error(`unknown deployable '${defId}'`);
    if (def.pillar) {
      // a pillar grows out of the nearest ground under the spot (stage ground only, never another pillar); none, no pillar
      let top = Infinity;
      for (const p of this.platforms) {
        if (p.dynamic || x < p.x + 2 || x > p.right - 2 || p.top < y - 24 || p.top > y + 60) continue;
        top = Math.min(top, p.top);
      }
      if (top === Infinity) return null;
      y = top;
    }
    const group = def.limitGroup ?? defId;
    if (this.countDeployables(ownerId, group) >= def.limit) {
      if (!def.replaceOldest) return null;
      let oldest: Deployable | null = null;
      for (const d of this.deployables) {
        if (d.active && d.owner === ownerId && (d.def!.limitGroup ?? d.defId) === group && (!oldest || d.serial < oldest.serial)) oldest = d;
      }
      oldest?.deactivate();
    }
    for (const d of this.deployables) {
      // a slot whose pillar platform has not been taken down yet (the replaced oldest) is not free this tick
      if (d.active || d.plat) continue;
      d.spawn(ownerId, defId, def, x, y, ++this.deploySerial, owner.facing);
      this.emit('deploy', owner, x, y, 0, 0);
      return d;
    }
    return null;
  }

  // ---- cinematic ultimates --------------------------------------------------------------------
  startCinematic(attacker: Fighter, victim: Fighter, move: MoveDef): void {
    this.cinematic = { attacker, victim, move, frame: 0 };
    victim.beGrabbed(attacker);
    victim.grabbedBy = -1; // pinned by the cutscene, not by a normal hold
    attacker.setState('attack');
    this.emit('cinematicStart', attacker, attacker.x, attacker.y - attacker.h / 2, 0, victim.id);
  }

  private stepCinematic(): void {
    const c = this.cinematic!;
    const cin = c.move.cinematic!;
    if (c.victim.state !== 'grabbed' || c.attacker.state !== 'attack' || c.attacker.move !== c.move) {
      // the cutscene lost its cast (a stamina KO mid-way, sudden death respawning everyone, another hit landing on the
      // victim or the caster the tick it started): stop it instead of pinning and hitting whoever is standing there now
      this.cinematic = null;
      c.victim.releaseGrab(); // a victim still pinned (the caster was the one interrupted) is let go
      this.emit('cinematicEnd', c.attacker, c.attacker.x, c.attacker.y, 0, c.victim.id);
      return;
    }
    c.frame++;
    c.victim.x = c.attacker.x + c.attacker.facing * 18;
    c.victim.y = c.attacker.y;
    c.victim.grounded = c.attacker.grounded;
    c.victim.groundPlat = c.attacker.groundPlat;
    c.victim.snapped = true;
    for (const h of cin.hits) {
      if (h.frame !== c.frame) continue;
      if (h.launch) {
        c.victim.releaseGrab();
        c.victim.receiveHit(
          { damage: h.damage, base: h.base ?? 0, scaling: h.scaling ?? 0, angle: h.angle ?? 45, direction: c.attacker.facing, hitlag: 0, attackerId: c.attacker.id },
          this,
        );
      } else {
        c.victim.damage += h.damage;
        c.victim.lastHitBy = c.attacker.id;
      }
      c.attacker.gainMeter(h.damage, this);
      this.emit('cinematicHit', c.victim, c.victim.x, c.victim.y - c.victim.h / 2, h.launch ? 1 : 0, h.damage);
    }
    if (c.frame >= cin.frames) {
      this.cinematic = null;
      c.victim.releaseGrab();
      this.emit('cinematicEnd', c.attacker, c.attacker.x, c.attacker.y, 0, c.victim.id);
    }
  }

  /** Whether a captor is in a state that can hold a victim: holding, throwing, a command-grab move, or running a cinematic. */
  private holdsGrab(a: Fighter): boolean {
    if (a.state === 'holding' || this.cinematic?.attacker === a) return true;
    const m = a.move;
    if (a.state !== 'attack' || !m) return false;
    if (m.kind === 'throw') return true;
    for (const h of m.hitboxes) if (h.grab) return true;
    return false;
  }

  /** Keep grabbed fighters pinned to their captor and clean up broken grab links. */
  private fixGrabs(): void {
    const fs = this.fighters;
    for (const a of fs) {
      if (a.grabTarget < 0) continue;
      const v = fs[a.grabTarget];
      if (a.state === 'ko') {
        // a grabber that was KO'd (or never respawns) must let go, or its victim would stay grabbed forever
        if (v && v.grabbedBy === a.id) v.releaseGrab();
        a.grabTarget = -1;
        continue;
      }
      if (!v || v.grabbedBy !== a.id || v.state === 'ko') {
        // victim got hit / KO'd out of the grab
        a.grabTarget = -1;
        if (a.state === 'holding') a.setState(a.grounded ? 'idle' : 'air');
      } else if (!this.holdsGrab(a)) {
        // the captor's grab move was cut short (landing, a hit, a cancel): it can no longer hold anyone, so let go
        v.releaseGrab();
        a.grabTarget = -1;
      } else if (a.state === 'holding' && a.holdTimer <= 0) {
        v.releaseGrab();
        a.grabTarget = -1;
        a.setState(a.grounded ? 'idle' : 'air');
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
      // held at the captor's feet: standing if the captor stands, airborne if it is (an air grab carries a grounded victim
      // off the floor, and on release it must fall from there, not snap back down to where it was grabbed)
      v.grounded = a.grounded;
      v.groundPlat = a.groundPlat;
      v.facing = (-a.facing) as 1 | -1;
      v.snapped = true;
    }
  }

  emit(type: WorldEventType, f: Fighter, x: number, y: number, magnitude: number, extra: number, tag?: string): void {
    if (this.listener) this.listener(type, f, x, y, magnitude, extra, tag);
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
      mix(f.meter);
      mix(f.state.length);
      for (const k of Object.keys(f.res)) mix(f.res[k]);
      mix(f.status.burn + f.status.slow * 7 + f.status.freeze * 13 + f.status.stun * 17 + f.status.soak * 19 + f.freezeImmune * 23 + f.status.chill * 29);
    }
    for (const it of this.items) {
      if (!it.active) continue;
      mix(it.x);
      mix(it.y);
      mix(it.vx);
    }
    for (const p of this.projectiles) {
      if (!p.active) continue;
      mix(p.x);
      mix(p.y);
      mix(p.age);
    }
    for (const d of this.deployables) {
      if (!d.active) continue;
      mix(d.x);
      mix(d.y);
      mix(d.hp);
      if (d.plat) mix(d.plat.y);
    }
    return h;
  }
}
