import { resolveCombat } from './combat';
import { Deployable, MAX_DEPLOYABLES, MAX_PROJECTILES, Projectile } from './entities';
import { resolveEntityCombat, updateEntities } from './entityCombat';
import type { MoveDef } from './moves';
import { GRAB_DISTANCE, type Fighter } from './fighter';
import { stepHazards } from './hazards';
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
  | 'itemBoom'
  | 'hazardFire'
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
}

/** Holds the stage and fighters and advances them one fixed tick at a time. Deterministic. */
/** Max soft-push per tick (world units) for overlapping grounded fighters. */
export const SOFT_PUSH = 0.4;

/** Only fighters going about their business (not attacking, hit, grabbing or dodging) are nudged. */
const PUSH_STATES = new Set<Fighter['state']>(['idle', 'run', 'dash', 'crouch', 'landing', 'shield', 'jumpsquat']);
function pushable(f: Fighter): boolean {
  return f.grounded && f.hitlag === 0 && PUSH_STATES.has(f.state);
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

  constructor(readonly stage: StageData) {
    this.blast = stage.blast;
    this.hazardHit = (stage.hazards ?? []).map(() => []);
    this.platforms = stage.platforms.map((d, i) => new Platform(i, d));
    for (const p of this.platforms) {
      if (!p.ledges) continue;
      // no ledge where another solid block sits on the corner (a tier flush with the edge): climbing up would land inside it
      for (const side of [-1, 1] as const) {
        const cx = side === -1 ? p.x : p.right;
        const covered = this.platforms.some((q) => q !== p && q.kind === 'solid' && Math.abs(q.bottom - p.top) < 1 && cx >= q.x - 12 && cx <= q.right + 12);
        if (!covered) this.ledges.push(new Ledge(p, side));
      }
    }
    for (const t of stage.targets ?? []) this.targets.push({ x: t.x, y: t.y, alive: true });
  }

  /** True when both fighters are on the same team (team battles): no friendly fire. */
  allied(a: number, b: number): boolean {
    const x = this.fighters[a];
    const y = this.fighters[b];
    return !!x && !!y && a !== b && x.team >= 0 && x.team === y.team;
  }

  /**
   * Grounded fighters standing inside each other drift apart (at most SOFT_PUSH per tick each), so bodies stay readable and
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
        if (overlap <= 0) continue;
        const dir = dx > 0 ? 1 : dx < 0 ? -1 : a.facing; // exactly stacked: split along the first fighter's facing
        const step = Math.min(overlap / 2, SOFT_PUSH);
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
    for (let i = 0; i < this.fighters.length; i++) this.fighters[i].update(inputs[i], this);
    this.fixGrabs();
    this.softPush();
    updateEntities(this);
    resolveCombat(this);
    resolveEntityCombat(this);
    stepHazards(this);
    stepItems(this);
    stepTargets(this);
  }

  // ---- projectiles / deployables -------------------------------------------------------------
  /** Spawn a projectile defined by fighter `ownerId`'s character. Returns null if the pool is full. */
  spawnProjectile(ownerId: number, defId: string, x: number, y: number, vx: number, vy: number, dmgMult = 1): Projectile | null {
    const def = this.fighters[ownerId]?.data.projectiles?.[defId];
    if (!def) throw new Error(`unknown projectile '${defId}'`);
    for (const p of this.projectiles) {
      if (p.active) continue;
      p.spawn(ownerId, defId, def, x, y, vx, vy, dmgMult);
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
      if (d.active) continue;
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
    c.frame++;
    c.victim.x = c.attacker.x + c.attacker.facing * 18;
    c.victim.y = c.attacker.y;
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
      mix(f.status.burn + f.status.slow * 7 + f.status.freeze * 13 + f.status.stun * 17 + f.status.soak * 19 + f.freezeImmune * 23);
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
    }
    return h;
  }
}
