import { MAX_FIGHTERS } from './fighter';
import type { DeployableDef, ProjectileDef } from './moves';

export const MAX_PROJECTILES = 64;
export const MAX_DEPLOYABLES = 32;

/** Pooled projectile. Position is the box centre. */
export class Projectile {
  active = false;
  readonly index: number;
  defId = '';
  def: ProjectileDef | null = null;
  owner = -1;
  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  /** Launch height: zigzag paths oscillate around it. */
  baseY = 0;
  vx = 0;
  vy = 0;
  age = 0;
  hp = 0;
  /** Damage multiplier (reflected projectiles hit harder). */
  dmgMult = 1;
  reflects = 0;
  /** Frames until this projectile may hit fighter i again (0 = ready). Pierce / multi-hit use this. */
  readonly rehit = new Int16Array(MAX_FIGHTERS);
  readonly hitOnce = new Uint8Array(MAX_FIGHTERS);
  /** A blast projectile (grenade, missile) has already gone off. */
  exploded = false;

  constructor(index: number) {
    this.index = index;
  }

  get dir(): 1 | -1 {
    return this.vx < 0 ? -1 : 1;
  }

  spawn(owner: number, defId: string, def: ProjectileDef, x: number, y: number, vx: number, vy: number, dmgMult = 1): void {
    this.active = true;
    this.owner = owner;
    this.defId = defId;
    this.def = def;
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.baseY = y;
    this.vx = vx;
    this.vy = vy;
    this.age = 0;
    this.hp = def.health ?? 0;
    this.dmgMult = dmgMult;
    this.reflects = 0;
    this.rehit.fill(0);
    this.hitOnce.fill(0);
    this.exploded = false;
  }

  deactivate(): void {
    this.active = false;
  }
}

/** Pooled placed object: turret, mine, rune, marker. Position is bottom-centre. */
export class Deployable {
  active = false;
  readonly index: number;
  defId = '';
  def: DeployableDef | null = null;
  owner = -1;
  x = 0;
  y = 0;
  vy = 0;
  grounded = false;
  age = 0;
  hp = 0;
  /** Spawn order, used for "replace oldest". */
  serial = 0;
  turretCd = 0;
  facing: 1 | -1 = 1;
  /** Upgrade modifiers (Gizmo's Overclock etc.). */
  fireRateMul = 1;
  damageMul = 1;
  shield = 0;
  modFrames = 0;
  /** Crystal pillar: its live platform, whether it bursts into shards when it goes, and who its rise already hit. */
  plat: import('./platform').Platform | null = null;
  shatter = false;
  riseMask = 0;
  /** A pillar its owner struck: the shards fly along this launch angle (degrees, -1 = the usual radial burst) and side. */
  aimAngle = -1;
  aimDir: 1 | -1 = 1;
  /** Stuck to a fighter (C4 planted on a rival): follows their body until set off. -1 = not attached. */
  attached = -1;

  constructor(index: number) {
    this.index = index;
  }

  spawn(owner: number, defId: string, def: DeployableDef, x: number, y: number, serial: number, facing: 1 | -1): void {
    this.active = true;
    this.owner = owner;
    this.defId = defId;
    this.def = def;
    this.x = x;
    this.y = y;
    this.vy = 0;
    this.grounded = !def.gravity;
    this.age = 0;
    this.hp = def.health;
    this.serial = serial;
    this.turretCd = def.turret ? Math.max(20, def.armFrames ?? 20) : 0;
    this.facing = facing;
    this.fireRateMul = 1;
    this.damageMul = 1;
    this.shield = 0;
    this.modFrames = 0;
    this.shatter = false;
    this.aimAngle = -1;
    this.attached = -1;
  }

  deactivate(): void {
    this.active = false;
  }
}
