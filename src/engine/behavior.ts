import type { Fighter } from './fighter';
import type { HitboxDef, MoveDef } from './moves';
import type { World } from './world';

/**
 * Per-character logic hooks. Everything is optional. Hooks run inside the deterministic sim: they
 * may only read/write the fighter, its `res` resources and the world through its public API, and must
 * not use Math.random, Date or Phaser.
 */
export interface CharacterBehavior {
  /** Every tick the fighter is not in hitlag/KO, before state logic. */
  onTick?(f: Fighter, world: World): void;
  onMoveStart?(f: Fighter, move: MoveDef, world: World): void;
  /** Each time the move advances a frame (frame is 1-based). */
  onMoveFrame?(f: Fighter, move: MoveDef, frame: number, world: World): void;
  onMoveEnd?(f: Fighter, move: MoveDef, world: World): void;
  /** `f` landed a clean hit on `victim`. */
  onHitDealt?(f: Fighter, victim: Fighter, hb: HitboxDef, damage: number, world: World): void;
  /** `f` took a hit (attacker is null for projectiles whose owner is gone). */
  onHitTaken?(f: Fighter, attacker: Fighter | null, damage: number, world: World): void;
  /** `f` knocked `victim` out (the last fighter to hit them). */
  onKill?(f: Fighter, victim: Fighter, world: World): void;
  /** `f` landed on the ground from the air (`speed` = impact speed). */
  onLand?(f: Fighter, speed: number, world: World): void;
  onLedgeGrab?(f: Fighter, world: World): void;
  onTech?(f: Fighter, world: World): void;
  /** `f` perfect-shielded a hit from `attacker`. */
  onParry?(f: Fighter, attacker: Fighter | null, world: World): void;
  /** `f` blocked a hit with its shield. */
  onShieldHit?(f: Fighter, attacker: Fighter | null, damage: number, world: World): void;
  /** `f` grabbed / threw `victim`. */
  onGrab?(f: Fighter, victim: Fighter, world: World): void;
  onThrow?(f: Fighter, victim: Fighter, world: World): void;
  /** `f` was placed on the stage (match start or respawn). */
  onSpawn?(f: Fighter): void;
  /** One of f's deployables was destroyed by an enemy attack. */
  onDeployableDestroyed?(f: Fighter, id: string, world: World): void;
  /**
   * Called when a special input maps to move `id` (neutralB, sideB, ...). Return another move id to run
   * instead (Vex's recall), or null to ignore the press.
   */
  chooseMove?(f: Fighter, id: string, world: World): string | null;
  /** Rewrites any move id just before it starts (Gizmo's Mech mode swaps his attacks). */
  remapMove?(f: Fighter, id: string): string;
  /** `name`/`args` of a `custom` move event. */
  onMoveEvent?(f: Fighter, name: string, args: number[], world: World): void;
}
