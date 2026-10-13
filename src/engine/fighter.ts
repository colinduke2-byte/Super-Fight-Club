import { Button, type FighterInput } from './buttons';
import { COYOTE_FRAMES } from './constants';
import { moveBody, type Body } from './collision';
import { InputBuffer } from './inputBuffer';
import { computeKnockback, hitstunFrames, launchVelocity, LAUNCH_DRAG, type LaunchVector } from './knockback';
import { executeMoveEvent } from './actions';
import { moveTotal, type MoveDef, type StatusApply } from './moves';
import type { Ledge, Platform } from './platform';
import type { CharacterData, CharacterStats } from './types';
import { GENERIC_MOVES } from './genericMoves';
import { throwBomb } from './items';
import type { World } from './world';

export type FighterState =
  | 'idle'
  | 'run'
  | 'crouch'
  | 'jumpsquat'
  | 'air'
  | 'landing'
  | 'ledge'
  | 'ledgeClimb'
  | 'hitstun'
  | 'downed'
  | 'tech'
  | 'attack'
  | 'shield'
  | 'shieldstun'
  | 'shieldbreak'
  | 'spotdodge'
  | 'roll'
  | 'airdodge'
  | 'holding'
  | 'grabbed'
  | 'dash'
  | 'tether'
  | 'frozen'
  | 'stunned'
  | 'ko';

export const MAX_FIGHTERS = 4;
export const MAX_GROUPS = 8;

// ---- tuning constants (frames / px per frame) ----
const LANDING_FRAMES = 2;
const DOWNED_FRAMES = 28;
const TECH_GROUND_FRAMES = 18;
const TECH_WINDOW = 20;
const TECH_LOCKOUT = 50;
const TECH_INVULN = 14;
const BOUNCE_MIN_SPEED = 3;
const BOUNCE_FLOOR = 0.7;
const BOUNCE_WALL = 0.75;
/** A storable charge held at full releases by itself after this many frames in the move (no infinite stalling). */
const STORE_HOLD_MAX = 240;
/** An untech'd slam into a floor, wall or ceiling at least this fast (px/frame) is a splat: it hurts. */
const SPLAT_MIN_SPEED = 6.5;
const SPLAT_RATE = 0.9;
const SPLAT_MAX = 9;
const HITSTUN_GROUND_FRICTION = 0.35;
/** Perfect shield: shielding in the first N frames after raising it deflects a hit with no shield damage. */
export const PARRY_FRAMES = 4;
/** Extra freeze on an attacker whose hit was parried. */
export const PARRY_HITLAG = 10;
/** Frames after dropping the shield before it can be raised again (stops shield mashing). */
export const SHIELD_DROP_LAG = 6;
/** Stale-move negation: the last N connecting moves are remembered; each repeat in the queue costs this much damage. */
export const STALE_QUEUE = 9;
export const STALE_PER_USE = 0.045;
/** Rage: attackers above RAGE_START% deal up to RAGE_MAX more knockback (full effect RAGE_RANGE% later). */
export const RAGE_START = 35;
export const RAGE_RANGE = 115;
export const RAGE_MAX = 0.1;
/** Combo scaling: each further hit of a combo deals this much less damage (floor COMBO_MIN) and shortens hitstun. */
export const COMBO_STEP = 0.03;
export const COMBO_MIN = 0.65;
export const COMBO_STUN_STEP = 0.04;
export const COMBO_STUN_MIN = 0.6;
/** Frames of actionable state after which a combo is considered over. */
export const COMBO_GAP = 24;
/** Soak (water status): frames stack up to SOAK_MAX; every SOAK_LEVEL frames is one level (1-3). */
export const SOAK_MAX = 360;
export const SOAK_LEVEL = 120;
/** Extra knockback taken per soak level. */
export const SOAK_KB_PER_LEVEL = 0.04;
/** After a freeze ends or shatters, frames during which a new freeze only slows (no freeze-locks). */
export const FREEZE_IMMUNE = 120;
/**
 * Hit confirm: a jab / tilt / aerial / dash attack that lands on a fighter (not a shield) keeps only this fraction of
 * its recovery, so strings flow; whiffs and shielded hits keep the full recovery and stay punishable.
 */
export const HIT_RECOVERY_KEEP = 0.5;
const QUICK_ON_HIT: ReadonlySet<string> = new Set(['jab', 'tilt', 'aerial', 'dashAttack']);
/** Hitlag SDI: stick flicks during hit-stop nudge the victim this many px, up to SDI_MAX times per hit. */
export const SDI_DIST = 5;
export const SDI_MAX = 3;
/** Repeated dodges (spot / roll / air) lose invincibility: stale count decays one step per DODGE_DECAY frames. */
export const DODGE_DECAY = 90;
/** Analog walk: stick tilts under this fraction walk at WALK_SPEED_FRAC of the run speed (scaled by tilt). */
/**
 * Initial dash: a flick of the stick on the ground bursts to DASH_SPEED_MULT x run speed for INITIAL_DASH_FRAMES. Flicking the other
 * way inside it turns on the spot into a new dash (dash-dancing); holding on settles into the run; letting go brakes.
 */
export const INITIAL_DASH_FRAMES = 10;
export const DASH_SPEED_MULT = 1.22;
const DASH_ACCEL_MULT = 2.5;
/**
 * Hitstun canceling: out of a long launch (HITSTUN_CANCEL_MIN+ frames of hitstun) an air dodge is allowed after HITSTUN_CANCEL_DODGE
 * frames and an aerial / special / jump after HITSTUN_CANCEL_ACT, so a big hit sends you flying without locking you out for seconds.
 */
export const HITSTUN_CANCEL_MIN = 32;
export const HITSTUN_CANCEL_DODGE = 40;
export const HITSTUN_CANCEL_ACT = 45;
/** Turnaround window: a back flick in the first frames of a neutral / down special turns it around (B-reverse; reverses air drift). */
const B_REVERSE_FRAMES = 3;
export const WALK_TILT = 0.55;
export const WALK_SPEED_FRAC = 0.45;
/** Wall cling (wall-jump characters): holding toward a wall slows the fall for up to this many frames. */
export const WALL_CLING_FRAMES = 50;
export const WALL_SLIDE_SPEED = 0.9;
/** Burst (combo breaker): spend this much meter to escape a combo of at least BURST_MIN_HITS hits. */
export const BURST_COST = 50;
export const BURST_MIN_HITS = 4;
export const BURST_RADIUS = 70;
/** Damage percent at which ledge get-ups become slow (longer, less invincibility). */
export const SLOW_GETUP_DAMAGE = 100;
/** Knockback multiplier when hit while crouching on the ground. */
export const CROUCH_CANCEL = 0.8;
/** Gravity multiplier while launched (floaty launches: upward hits can actually reach the top blast zone). */
export const HITSTUN_RISE_GRAVITY = 0.2;
export const HITSTUN_FALL_GRAVITY = 0.9;
/** Max trajectory bend from directional influence (radians, ~17 degrees). */
export const DI_MAX_ANGLE = 0.3;
const LEDGE_MAX_HANG = 300;
const LEDGE_ACTION_DELAY = 8;
const LEDGE_BASE_INVULN = 60;
const LEDGE_INVULN_LOSS_PER_GRAB = 14;
const LEDGE_REGRAB_COOLDOWN = 30;
const LEDGE_CLIMB_FRAMES = 24;
const DROP_NUDGE = 3;
const AIRDODGE_FRAMES = 28;
const AIRDODGE_NEUTRAL_FRAMES = 22;
const AIRDODGE_NEUTRAL_INVULN = 17;
const AIRDODGE_SPEED = 4.6;
const STICK_DOWN = 0.7;
const STICK_CROUCH = 0.6;
const STICK_UP = -0.6;
const TURN_THRESHOLD = 0.2;

// ---- defence ----
export const SHIELD_MAX = 50;
const SHIELD_DECAY = 0.11; // per frame while held (the bubble shrinks)
const SHIELD_REGEN = 0.1;
const SHIELD_MIN_RADIUS = 8;
const SHIELD_MAX_RADIUS = 20;
const SPOTDODGE_FRAMES = 24;
const SPOTDODGE_INVULN: [number, number] = [2, 20];
const ROLL_FRAMES = 32;
const ROLL_INVULN: [number, number] = [3, 22];
const ROLL_SPEED = 3.4;
const SHIELDBREAK_FRAMES = 200;
const FLICK_FRAMES = 4;
const FLICK_HI = 0.8;
const FLICK_LO = 0.5;
export const GRAB_DISTANCE = 18;
const GRAB_BASE_HOLD = 70;
const GRAB_STRUGGLE = 4;
const ULT_GAIN_DEALT = 0.6;
const ULT_GAIN_TAKEN = 0.9;
const ULT_COST = 100;
const HELPLESS_DRIFT = 0.55;
const GROUND_STATES: ReadonlySet<FighterState> = new Set<FighterState>(['dash', 'frozen', 'stunned', 'idle', 'run', 'crouch', 'landing', 'jumpsquat', 'shield', 'shieldstun', 'downed', 'tech', 'spotdodge', 'roll', 'holding']);

export interface HitParams {
  damage: number;
  base: number;
  scaling: number;
  /** Degrees; 0 = horizontal away from attacker, 90 = up. */
  angle: number;
  /** Direction the victim is sent: +1 right, -1 left. */
  direction: 1 | -1;
  moveWeight?: number;
  /** Hitlag frames applied to the victim (and by the combat system to the attacker). */
  hitlag?: number;
  minHitstun?: number;
  /** Extra knockback multiplier (e.g. smash charge). */
  kbMult?: number;
  attackerId?: number;
  /** Horizontal momentum carried into the launch (px/frame, signed), from an attacker moving into the hit. */
  carryVx?: number;
}

const tmpLaunch: LaunchVector = { vx: 0, vy: 0 };
const moveKeys = new Map<string, number>();
/** Small stable integer per move id (for the stale-move queue). */
function moveKey(id: string): number {
  let k = moveKeys.get(id);
  if (k === undefined) {
    k = moveKeys.size + 1;
    moveKeys.set(id, k);
  }
  return k;
}

function approach(v: number, target: number, amount: number): number {
  if (v < target) return Math.min(target, v + amount);
  return Math.max(target, v - amount);
}

/**
 * Simulation-side fighter: movement physics + state machine + combat state. No rendering, no Phaser.
 * Position (x, y) is the bottom-centre of the hurtbox; y grows downward.
 */
export class Fighter implements Body {
  readonly stats: CharacterStats;
  readonly hw: number;
  readonly h: number;
  readonly fhw: number;

  x = 0;
  y = 0;
  prevX = 0;
  prevY = 0;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;

  state: FighterState = 'idle';
  stateFrame = 0;

  grounded = true;
  groundPlat: Platform | null = null;
  startBottom = 0;

  // Body outputs
  wall = 0;
  hitCeil = false;
  landed = false;
  impactVx = 0;
  impactVy = 0;

  // Movement bookkeeping
  jumpsLeft: number;
  fastFalling = false;
  coyote = 0;
  invuln = 0;
  /** Frames of landing lag to serve in the 'landing' state (0 = default short landing). */
  lagFrames = 0;

  // Damage / hit reaction
  damage = 0;
  hitstun = 0;
  /** Hitstun the last launch started with (for hitstun canceling). */
  hitstunTotal = 0;
  hitlag = 0;
  techWindow = 0;
  techLock = 0;
  lastHitBy = -1;
  /** Human projectiles: fighters this one has already crashed into during the current launch (bit per id). */
  collideMask = 0;
  /** Carrying a Shock Bomb item: the next Attack throws it. */
  heldBomb = false;
  /** Frames left in which a freshly raised shield is a perfect shield. */
  parryFrames = 0;
  parryCount = 0;
  shieldCooldown = 0;
  /** Recently connected moves (stale-move negation) and the staleness multiplier snapshot for the current move. */
  readonly staleQueue = new Int16Array(STALE_QUEUE);
  private staleIdx = 0;
  moveStale = 1;
  /** Hits taken in the current combo and frames spent actionable since (a combo ends after COMBO_GAP). */
  comboHits = 0;
  private comboIdle = COMBO_GAP;
  private sdiCount = 0;
  private sdiWasNeutral = true;
  dodgeStale = 0;
  private dodgeStaleTimer = 0;
  /** Which hurt pose the view shows while in hitstun (set by the launch): light flinch / heavy / launched up / spiked down. */
  hurtKind: 'hurtL' | 'hurt' | 'hurtU' | 'hurtD' = 'hurt';
  /** Visual effect tag of the last clean hit taken (drives the hit-stop flash colour). */
  lastHitFx = '';
  /** Directional influence is applied once, on the first hitstun tick. */
  private diDone = false;
  private bReversed = false;

  // Attacking
  move: MoveDef | null = null;
  moveFrame = 0;
  chargeFrames = 0;
  private chargeButton = 0;
  private queuedNext = false;
  moveHit = false;
  /** The current move hit a fighter cleanly (not a shield, parry or armor). */
  moveLanded = false;
  /** Outgoing damage multiplier (character mechanics like Heat hook in here). */
  damageMult = 1;
  /** Permanent speed bonus a character mechanic can set each tick (Halcyon's Gale). */
  speedBonus = 1;
  /** Outgoing knockback multiplier (Vent scales with Heat, etc.). */
  kbMult = 1;
  /** Hurtbox size multiplier (a giant mech suit is easier to hit); terrain collision is unaffected. */
  sizeMul = 1;
  /** Never flinches while set (except from hitstun already in progress): Mech mode. */
  superArmor = false;
  /** The stick this tick (character logic like Overclock reads it). */
  readonly stick = { x: 0, y: 0 };
  /** Added to armor thresholds (Infinity = super armor). */
  armorBonus = 0;
  /** Tough Guy: hits dealing at most this much damage do not flinch (0 = off). Reset to `data.toughness` each tick; behaviours may raise it. */
  toughness = 0;
  /** Bit per (victim, group) already hit by the current move. */
  readonly hitMask = new Uint16Array(MAX_FIGHTERS);
  readonly rehit = new Int16Array(MAX_FIGHTERS * MAX_GROUPS);

  /** Hit registries for the current move against enemy projectiles / deployables. */
  readonly hitProjMask = new Uint32Array(2);
  hitDepMask = 0;

  // Character mechanic state (Heat, Scrap, markers...). Keys come from CharacterData.resources.
  res: Record<string, number>;
  /** Ultimate meter 0..cost. */
  meter = 0;
  /** Remaining frames per status effect. */
  readonly status = { burn: 0, slow: 0, freeze: 0, stun: 0, soak: 0 };
  /** Frames left of freeze immunity (see FREEZE_IMMUNE). */
  freezeImmune = 0;
  private slowMul = 1;
  private burnPerTick = 0.05;
  /** Active reflecting barrier (frames > 0), forward-relative box around the feet. */
  barrier = { frames: 0, x: 0, y: 0, w: 0, h: 0 };
  /** After a recovery move: no actions until landing / ledge / hit. */
  helpless = false;
  dashCd = 0;
  /** Frames left of an initial dash (0 = not dashing). */
  dashTimer = 0;
  private dashDir: 1 | -1 = 1;
  /** Turning against a run: the feet slide, still facing the old way until the momentum is gone. */
  skidding = false;

  /** Team index for team battles (-1 = free-for-all). Teammates cannot hurt each other. */
  team = -1;
  /** Frames of the Overdrive item left (outgoing damage x1.3). */
  boostFrames = 0;
  /** Aegis Core item: invincible (and shimmering) while this runs. */
  aegisFrames = 0;
  /** One air dodge per airtime; wall jumps are limited too. */
  airDodgeUsed = false;
  wallJumps = 0;
  private clingFrames = 0;
  private climbDur = LEDGE_CLIMB_FRAMES;
  private climbRoll = false;
  private wallSide = 0;
  private wallGrace = 0;
  private airDodgeDx = 0;
  private airDodgeDy = 0;
  private climbAttack = false;

  /** Outgoing damage multiplier including item boosts. */
  get outMul(): number {
    return this.damageMult * (this.boostFrames > 0 ? 1.3 : 1);
  }
  /** Training aid: no gravity while airborne and not in hitstun (test aerials in place). */
  hover = false;
  /** Tether target while in the 'tether' state. */
  tetherX = 0;
  tetherY = 0;
  private tetherSpeed = 0;
  private tetherLedge: Ledge | null = null;
  private tetherPlat: Platform | null = null;
  /** Where the last teleport started (for effects / afterimages). */
  tpFromX = 0;
  tpFromY = 0;

  // Defence
  shieldHP = SHIELD_MAX;
  shieldStun = 0;
  private rollDir: 1 | -1 = 1;

  // Grabs
  grabTarget = -1;
  grabbedBy = -1;
  holdTimer = 0;
  private pummelCd = 0;

  // Ledge
  ledge: Ledge | null = null;
  ledgeFrames = 0;
  grabCooldown = 0;
  ledgeGrabs = 0;
  /** Wings: true while gliding this tick (view picks the glide pose); frames spent gliding this airtime. */
  gliding = false;
  glideFrames = 0;
  private climbFromX = 0;
  private climbFromY = 0;

  // KO info for effects
  koX = 0;
  koY = 0;
  koVx = 0;
  koVy = 0;

  /** Set for a tick when a teleport happened so the renderer does not interpolate across it. */
  snapped = false;

  readonly buffer = new InputBuffer();
  private lastStickY = 0;
  private lastStickX = 0;
  private flickX = 0;
  private flickXDir = 0;
  private flickUp = 0;
  private flickDown = 0;

  constructor(
    readonly id: number,
    readonly data: CharacterData,
  ) {
    this.stats = data.stats;
    this.hw = data.body.width / 2;
    this.h = data.body.height;
    this.fhw = data.body.footHalfWidth;
    this.jumpsLeft = this.stats.doubleJumps;
    this.res = { ...(data.resources ?? {}) };
  }

  /** Place the fighter in the air at spawn and reset all transient state. */
  spawn(x: number, y: number, facing: 1 | -1 = 1): void {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.startBottom = y;
    this.vx = this.vy = 0;
    this.facing = facing;
    this.data.behavior?.onSpawn?.(this);
    this.staleQueue.fill(0);
    this.staleIdx = 0;
    this.comboHits = 0;
    this.comboIdle = COMBO_GAP;
    this.parryFrames = 0;
    this.shieldCooldown = 0;
    this.dodgeStale = 0;
    this.state = 'air';
    this.stateFrame = 0;
    this.grounded = false;
    this.groundPlat = null;
    this.jumpsLeft = this.stats.doubleJumps;
    this.fastFalling = false;
    this.coyote = 0;
    this.hitstun = 0;
    this.hitlag = 0;
    this.techWindow = 0;
    this.techLock = 0;
    this.grabCooldown = 0;
    this.ledgeGrabs = 0;
    this.lagFrames = 0;
    this.move = null;
    this.moveFrame = 0;
    this.chargeFrames = 0;
    this.shieldHP = SHIELD_MAX;
    this.shieldStun = 0;
    this.grabTarget = -1;
    this.grabbedBy = -1;
    this.lastHitBy = -1;
    this.heldBomb = false;
    this.damageMult = 1;
    this.speedBonus = 1;
    this.kbMult = 1;
    this.sizeMul = 1;
    this.superArmor = false;
    this.armorBonus = 0;
    this.res = { ...(this.data.resources ?? {}) };
    this.status.burn = this.status.slow = this.status.freeze = this.status.stun = this.status.soak = 0;
    this.freezeImmune = 0;
    this.slowMul = 1;
    this.barrier.frames = 0;
    this.helpless = false;
    this.dashCd = 0;
    this.dashTimer = 0;
    this.skidding = false;
    this.boostFrames = 0;
    this.aegisFrames = 0;
    this.airDodgeUsed = false;
    this.wallJumps = 0;
    this.clingFrames = 0;
    this.climbAttack = false;
    this.releaseLedge();
    this.invuln = 120;
    this.buffer.clear();
    this.snapped = true;
  }

  /** Animation name for the view layer (attack states use `attackAnim` + move phase instead). */
  get anim(): string {
    const pick = (name: string, fallback: string): string => (this.data.sprite.animations[name] ? name : fallback);
    switch (this.state) {
      case 'idle':
        // braking after a run / dash: skid with the feet planted
        return Math.abs(this.vx) > 1.6 && this.grounded ? pick('skid', 'idle') : 'idle';
      case 'run':
        if (this.dashTimer > 0) return pick('dash', 'run');
        if (this.skidding) return pick('skid', 'run');
        return Math.abs(this.vx) < this.stats.runSpeed * 0.62 ? pick('walk', 'run') : 'run';
      case 'crouch':
      case 'jumpsquat':
      case 'landing':
        return 'crouch';
      case 'tech':
        return pick('roll', 'crouch');
      case 'air':
        if (this.gliding) return pick('glide', 'fall');
        return this.vy < 0 ? 'jump' : 'fall';
      case 'ledge':
      case 'ledgeClimb':
        return 'ledge';
      case 'hitstun':
        return pick(this.hurtKind, 'hurt');
      case 'grabbed':
        return pick('held', 'hurt');
      case 'shieldbreak':
      case 'downed':
        return 'down';
      case 'shield':
      case 'shieldstun':
        return 'shield';
      case 'roll':
        return pick('roll', 'dodge');
      case 'spotdodge':
      case 'airdodge':
        return 'dodge';
      case 'holding':
        return 'grab';
      case 'dash':
        return pick('dash', 'run');
      case 'tether':
        return 'jump';
      case 'frozen':
        return 'hurt';
      case 'stunned':
        return 'hurt';
      case 'attack':
        return this.move ? this.move.anim : 'idle';
      case 'ko':
        return 'ko';
    }
  }

  /** Index (0..) of the placeholder pose for an attack: 0 wind-up, 1 active, 2 recovery. */
  get attackPhase(): number {
    const m = this.move;
    if (!m) return 0;
    const n = this.data.sprite.animations[m.anim]?.frames ?? 3;
    if (n < 6) {
      if (this.moveFrame <= m.startup) return 0;
      return this.moveFrame <= m.startup + m.active ? 1 : 2;
    }
    // six-pose attack animations: 0 wind-up, 1 anticipation, 2 fast in-between, 3 strike, 4 follow-through, 5 recovery
    if (this.moveFrame <= m.startup) {
      if (m.startup <= 3) return 2;
      const t = this.moveFrame / m.startup;
      return t < 0.35 ? 0 : t < 0.75 ? 1 : 2;
    }
    if (this.moveFrame <= m.startup + m.active) return 3;
    const r = (this.moveFrame - m.startup - m.active) / Math.max(1, m.recovery);
    return r < 0.3 ? 4 : 5;
  }

  get isAirborne(): boolean {
    return !this.grounded && this.state !== 'ledge' && this.state !== 'ledgeClimb';
  }

  /** Height of the hurtbox right now (shorter while crouching / lying down). */
  get hurtH(): number {
    if (this.state === 'crouch' || this.state === 'jumpsquat') return this.h * 0.72 * this.sizeMul;
    if (this.state === 'downed' || this.state === 'shieldbreak') return this.h * 0.4 * this.sizeMul;
    return this.h * this.sizeMul;
  }

  /** Target ground speed for a stick tilt: gentle tilts walk, a firm push runs. */
  private groundTarget(stickX: number): number {
    const tilt = Math.abs(stickX);
    const run = this.stats.runSpeed * this.speedMul;
    if (tilt >= WALK_TILT) return Math.sign(stickX) * run;
    return Math.sign(stickX) * (tilt / WALK_TILT) * run * WALK_SPEED_FRAC;
  }

  /** Declarative resources: quiet-time decay, clamping and level thresholds (every tick). */
  private tickResources(): void {
    const rules = this.data.resourceRules;
    if (!rules) return;
    const quiet = (this.res.quiet = (this.res.quiet ?? 0) + 1);
    for (const r of rules) {
      let v = this.res[r.key] ?? 0;
      if (r.decayAfter !== undefined && quiet > r.decayAfter) v -= r.decayRate ?? 0;
      v = Math.max(0, Math.min(r.max, v));
      this.res[r.key] = v;
      if (r.levels) {
        let n = 0;
        for (const t of r.levels.at) if (v >= t) n++;
        this.res[r.levels.key] = n;
      }
    }
  }

  /** Called when this fighter deals `damage`: resources with a `gainDealt` fill. */
  gainResourcesDealt(damage: number): void {
    const rules = this.data.resourceRules;
    if (!rules) return;
    this.res.quiet = 0;
    for (const r of rules) if (r.gainDealt && damage >= (r.minDealt ?? 0)) this.res[r.key] = Math.min(r.max, (this.res[r.key] ?? 0) + damage * r.gainDealt);
  }

  /** Called when this fighter takes `damage`: resources with a `gainTaken` fill. */
  gainResourcesTaken(damage: number): void {
    const rules = this.data.resourceRules;
    if (!rules) return;
    this.res.quiet = 0;
    for (const r of rules) if (r.gainTaken) this.res[r.key] = Math.min(r.max, (this.res[r.key] ?? 0) + Math.max(0, damage) * r.gainTaken);
  }

  /** Braking strength on the surface under the feet (ice slides, sticky grips). */
  private surfaceFriction(): number {
    switch (this.groundPlat?.def.surface) {
      case 'ice':
        return 0.15;
      case 'sticky':
        return 1.8;
      default:
        return 1;
    }
  }

  /** Acceleration multiplier on the surface under the feet. */
  private surfaceTraction(): number {
    switch (this.groundPlat?.def.surface) {
      case 'ice':
        return 0.45;
      case 'sticky':
        return 0.75;
      default:
        return 1;
    }
  }

  /** Damage multiplier for a move given the recently connected moves (stale-move negation). */
  staleMult(id: string): number {
    const k = moveKey(id);
    let n = 0;
    for (let i = 0; i < STALE_QUEUE; i++) if (this.staleQueue[i] === k) n++;
    return 1 - STALE_PER_USE * n;
  }

  /** Remember that `id` connected. */
  pushStale(id: string): void {
    this.staleQueue[this.staleIdx] = moveKey(id);
    this.staleIdx = (this.staleIdx + 1) % STALE_QUEUE;
  }

  /** Knockback bonus for dealing damage while behind on health ("rage"). */
  get rage(): number {
    return 1 + RAGE_MAX * Math.max(0, Math.min(1, (this.damage - RAGE_START) / RAGE_RANGE));
  }

  get shieldRadius(): number {
    return SHIELD_MIN_RADIUS + (SHIELD_MAX_RADIUS - SHIELD_MIN_RADIUS) * Math.max(0, this.shieldHP / SHIELD_MAX);
  }

  /** Armor threshold active right now, or -1 if none. */
  armorThreshold(): number {
    if (this.state === 'ko' || this.state === 'hitstun' || this.state === 'grabbed') return -1;
    if (this.superArmor) return Infinity;
    // Tough Guy: hits up to `toughness` damage never flinch (a heavy's passive, see CharacterData.toughness)
    const tough = this.toughness > 0 ? this.toughness : -1;
    const m = this.move;
    if (this.state !== 'attack' || !m || !m.armor) return tough;
    if (this.moveFrame < m.armor.from || this.moveFrame > m.armor.to) return tough;
    const t = (m.armor.threshold ?? Infinity) + this.armorBonus;
    return Math.max(tough, t > 0 ? t : -1); // a threshold of 0 means "armored only when a mechanic grants a bonus"
  }

  /** Damage multiplier from smash charge for the current move. */
  get chargeFrac(): number {
    const c = this.move?.charge;
    return c ? this.chargeFrames / c.max : 0;
  }

  get speedMul(): number {
    return (this.status.slow > 0 ? this.slowMul : 1) * this.speedBonus;
  }

  /** Ultimate meter gain from dealing damage. */
  gainMeter(damage: number, world: World): void {
    const u = this.data.ultimate;
    this.addMeter(damage * (u?.gainDealt ?? ULT_GAIN_DEALT), u?.cost ?? ULT_COST, world);
  }

  gainMeterTaken(damage: number, world?: World): void {
    const u = this.data.ultimate;
    this.addMeter(damage * (u?.gainTaken ?? ULT_GAIN_TAKEN), u?.cost ?? ULT_COST, world);
  }

  /** Add ultimate meter directly (items); respects the character's cost. */
  addMeterRaw(amount: number, world: World): void {
    this.addMeter(amount, this.data.ultimate?.cost ?? ULT_COST, world);
  }

  private addMeter(amount: number, cost: number, world?: World): void {
    const before = this.meter;
    this.meter = Math.min(cost, this.meter + amount);
    if (before < cost && this.meter >= cost) world?.emit('meterFull', this, this.x, this.y - this.h, 0, 0);
  }

  applyStatus(s: StatusApply, world: World): void {
    if (this.state === 'ko') return;
    if (s.minPercent !== undefined && this.damage < s.minPercent) {
      if (s.fallback) this.applyStatus(s.fallback, world);
      return;
    }
    switch (s.type) {
      case 'burn':
        if (this.status.soak > 0) {
          // fire on a soaked fighter just boils the water off
          this.status.soak = Math.max(0, this.status.soak - s.frames * 2);
          world.emit('status', this, this.x, this.y - this.h / 2, 0, 5);
          return;
        }
        this.status.burn = Math.max(this.status.burn, s.frames);
        this.burnPerTick = s.value ?? 0.05;
        break;
      case 'soak':
        this.status.soak = Math.min(SOAK_MAX, this.status.soak + s.frames);
        this.status.burn = 0; // water douses fire
        break;
      case 'slow':
        this.status.slow = Math.max(this.status.slow, s.frames);
        this.slowMul = s.value ?? 0.6;
        break;
      case 'freeze':
        if (this.freezeImmune > 0) {
          // just thawed: chilled instead of frozen again
          this.status.slow = Math.max(this.status.slow, Math.min(60, s.frames));
          this.slowMul = 0.7;
          break;
        }
        this.status.freeze = Math.max(this.status.freeze, s.frames);
        this.releaseLedge();
        this.endMoveState();
        this.vx = this.vy = 0;
        this.setState('frozen');
        break;
      case 'stun':
        this.status.stun = Math.max(this.status.stun, s.frames);
        if (this.state !== 'hitstun') {
          this.endMoveState();
          this.setState('stunned');
        }
        break;
    }
    world.emit('status', this, this.x, this.y - this.h / 2, s.frames, ['burn', 'slow', 'freeze', 'stun', 'soak'].indexOf(s.type));
  }

  /** Put the fighter standing idle on a platform (training / scenario setup). */
  standOn(plat: Platform, x: number): void {
    this.spawn(x, plat.top, this.facing);
    this.state = 'idle';
    this.grounded = true;
    this.groundPlat = plat;
    this.invuln = 0;
    this.hover = false;
  }

  /** Hard-place the fighter (teleports): no interpolation, collision state refreshed on the next move. */
  placeAt(x: number, y: number, platforms: readonly Platform[] = []): void {
    this.x = x;
    this.y = y;
    this.startBottom = y;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.groundPlat = null;
    // arriving on a surface keeps the fighter standing (so a ground move is not mistaken for a landing)
    for (const p of platforms) {
      if (Math.abs(p.top - y) < 0.75 && x + this.fhw > p.x && x - this.fhw < p.right) {
        this.grounded = true;
        this.groundPlat = p;
        this.y = p.top;
        break;
      }
    }
    this.snapped = true;
  }

  beginTether(x: number, y: number, speed: number, ledge: Ledge | null, plat: Platform | null): void {
    this.endMoveState();
    this.tetherX = x;
    this.tetherY = y;
    this.tetherSpeed = speed;
    this.tetherLedge = ledge;
    this.tetherPlat = plat;
    this.grounded = false;
    this.groundPlat = null;
    this.vx = this.vy = 0;
    this.setState('tether');
  }

  // -------------------------------------------------------------------------------------------
  // Being hit
  // -------------------------------------------------------------------------------------------
  receiveHit(hit: HitParams, world: World): void {
    if (this.state === 'ko') return;
    const inCombo = this.state === 'hitstun' || this.state === 'grabbed' || this.comboIdle < COMBO_GAP;
    this.comboHits = inCombo ? this.comboHits + 1 : 1;
    this.comboIdle = 0;
    const dmgScale = this.comboHits <= 1 ? 1 : Math.max(COMBO_MIN, 1 - COMBO_STEP * (this.comboHits - 1));
    const dealt = hit.damage * dmgScale;
    this.damage += dealt;
    if (hit.attackerId !== undefined) this.lastHitBy = hit.attackerId;
    if (hit.attackerId !== undefined && hit.attackerId !== this.id) {
      world.damageDealt[hit.attackerId] = (world.damageDealt[hit.attackerId] ?? 0) + dealt;
      world.bestCombo[hit.attackerId] = Math.max(world.bestCombo[hit.attackerId] ?? 0, this.comboHits);
    }
    // crouch cancel: taking a hit while crouching on the ground absorbs part of the knockback
    const crouchCancel = this.state === 'crouch' && this.grounded ? CROUCH_CANCEL : 1;
    const kb =
      crouchCancel *
      computeKnockback({
        base: hit.base,
        scaling: hit.scaling,
        damagePercent: this.damage,
        moveWeight: hit.moveWeight,
        targetWeight: this.stats.weight,
      }) * (hit.kbMult ?? 1) * (1 + SOAK_KB_PER_LEVEL * this.soakLevel);

    let angle = hit.angle;
    if (angle === 361) angle = this.grounded && kb < 32 ? 0 : 44; // "Sakurai angle"
    launchVelocity(kb, angle, hit.direction, tmpLaunch);
    if (hit.carryVx) tmpLaunch.vx += hit.carryVx;
    const stunScale = this.comboHits <= 1 ? 1 : Math.max(COMBO_STUN_MIN, 1 - COMBO_STUN_STEP * (this.comboHits - 1));
    this.launch(tmpLaunch.vx, tmpLaunch.vy, Math.round(Math.max(hitstunFrames(kb), hit.minHitstun ?? 0) * stunScale));
    // recoil: knocked sideways, the victim turns to face where the hit came from; near-vertical launches keep their facing
    if (Math.abs(tmpLaunch.vx) > 0.6 && Math.abs(tmpLaunch.vx) > Math.abs(tmpLaunch.vy) * 0.35) this.facing = tmpLaunch.vx > 0 ? -1 : 1;
    const speed = Math.hypot(tmpLaunch.vx, tmpLaunch.vy);
    if (tmpLaunch.vy < -Math.abs(tmpLaunch.vx) * 1.3 && speed > 3) this.hurtKind = 'hurtU';
    else if (tmpLaunch.vy > 1.5 && tmpLaunch.vy > Math.abs(tmpLaunch.vx) * 0.8) this.hurtKind = 'hurtD';
    else if (speed < 3.4 && this.hitstun < 18) this.hurtKind = 'hurtL';
    else this.hurtKind = 'hurt';
    this.hitlag = hit.hitlag ?? 0;
    this.gainMeterTaken(dealt, world);
    this.gainResourcesTaken(dealt);
    world.emit('hit', this, this.x, this.y - this.h / 2, kb, dealt);
    this.data.behavior?.onHitTaken?.(this, hit.attackerId !== undefined ? (world.fighters[hit.attackerId] ?? null) : null, dealt, world);
  }

  launch(vx: number, vy: number, hitstun: number): void {
    this.releaseLedge();
    this.endMoveState();
    this.grabTarget = -1;
    this.grabbedBy = -1;
    this.state = 'hitstun';
    this.stateFrame = 0;
    this.hitstun = Math.max(1, hitstun);
    this.hitstunTotal = this.hitstun;
    this.vx = vx;
    this.vy = vy;
    this.techWindow = 0;
    this.techLock = 0;
    this.diDone = false;
    this.collideMask = 0;
    this.sdiCount = 0;
    this.fastFalling = false;
    this.ledgeGrabs = 0;
    this.helpless = false;
    this.barrier.frames = 0;
    if (this.status.freeze > 0) {
      this.status.freeze = 0; // being hit shatters ice
      this.freezeImmune = FREEZE_IMMUNE;
    }
    this.status.stun = 0;
    if (vy < 0) {
      this.grounded = false;
      this.groundPlat = null;
    }
  }

  /** Clank recoil: the current attack is cancelled, a short lag in place, pushed `dir` a little. */
  rebound(frames: number, dir: number): void {
    this.endMoveState();
    this.lagFrames = frames;
    this.setState('landing');
    this.vx = dir * 1.6;
  }

  /** Called by the combat system when a hit lands on a shielding fighter. */
  shieldHit(damage: number, breaks: boolean, shieldMult: number, pushDir: number, world: World): void {
    this.shieldHP -= breaks ? SHIELD_MAX : damage * shieldMult;
    this.shieldStun = Math.min(24, Math.floor(damage * 0.5) + 3);
    this.vx = pushDir * Math.min(4, 1 + damage * 0.12);
    if (this.shieldHP <= 0) {
      this.shieldHP = 0;
      this.setState('shieldbreak');
      this.grounded = false;
      this.groundPlat = null;
      this.vy = -8;
      this.vx = 0;
      world.emit('shieldBreak', this, this.x, this.y - this.h / 2, 0, 0);
    } else {
      this.setState('shieldstun');
    }
  }

  // -------------------------------------------------------------------------------------------
  // Per-tick update
  // -------------------------------------------------------------------------------------------
  update(inp: FighterInput, world: World): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.snapped = false;
    if (this.state === 'ko') return;

    this.stick.x = inp.stickX;
    this.stick.y = inp.stickY;
    this.buffer.advance();
    this.buffer.record(inp.pressed);

    // hitlag freezes everything except input buffering (and grab struggling)
    if (this.hitlag > 0) {
      this.hitlag--;
      if (this.state === 'grabbed') this.struggle(inp, world);
      else if (this.state === 'hitstun') this.smashDI(inp, world);
      this.trackSticks(inp);
      return;
    }

    // carry with a moving platform before anything else
    if (this.grounded && this.groundPlat && this.groundPlat.moving) {
      this.x += this.groundPlat.dx;
      this.y = this.groundPlat.top;
    }
    if (this.grounded && this.groundPlat?.def.surface === 'conveyor') this.x += this.groundPlat.def.conveyor ?? 0;
    this.startBottom = this.y;

    this.tickStatus(world);
    this.stateFrame++;
    if (this.invuln > 0) this.invuln--;
    if (this.barrier.frames > 0) this.barrier.frames--;
    if (this.dashCd > 0) this.dashCd--;
    if (this.boostFrames > 0) this.boostFrames--;
    if (this.aegisFrames > 0) this.aegisFrames--;
    if (this.grabCooldown > 0) this.grabCooldown--;
    if (this.techWindow > 0) this.techWindow--;
    if (this.techLock > 0) this.techLock--;
    if (this.coyote > 0) this.coyote--;
    if (this.pummelCd > 0) this.pummelCd--;
    if (this.parryFrames > 0) this.parryFrames--;
    if (this.shieldCooldown > 0) this.shieldCooldown--;
    if (this.state === 'hitstun' || this.state === 'grabbed') this.comboIdle = 0;
    else if (this.comboIdle < COMBO_GAP && ++this.comboIdle >= COMBO_GAP) this.comboHits = 0;
    if (this.state !== 'spotdodge' && this.state !== 'roll' && this.state !== 'airdodge' && this.dodgeStale > 0 && ++this.dodgeStaleTimer >= DODGE_DECAY) {
      this.dodgeStale--;
      this.dodgeStaleTimer = 0;
    }
    if (this.state !== 'shield' && this.state !== 'shieldstun' && this.shieldHP < SHIELD_MAX) this.shieldHP = Math.min(SHIELD_MAX, this.shieldHP + SHIELD_REGEN);
    this.trackSticks(inp);
    this.tickResources();
    this.toughness = this.data.toughness ?? 0;
    this.data.behavior?.onTick?.(this, world);
    if (this.state !== 'run' && this.state !== 'idle') {
      this.dashTimer = 0;
      this.skidding = false;
    }

    switch (this.state) {
      case 'idle':
      case 'run':
      case 'crouch':
      case 'jumpsquat':
      case 'landing':
      case 'downed':
      case 'tech':
        this.groundLogic(inp, world);
        break;
      case 'air':
        this.airLogic(inp, world);
        break;
      case 'attack':
        this.attackLogic(inp, world);
        break;
      case 'shield':
      case 'shieldstun':
        this.shieldLogic(inp, world);
        break;
      case 'spotdodge':
      case 'roll':
        this.dodgeLogic(world);
        break;
      case 'airdodge':
        this.airDodgeLogic(inp, world);
        break;
      case 'shieldbreak':
        this.shieldBreakLogic(world);
        break;
      case 'holding':
        this.holdLogic(inp, world);
        break;
      case 'grabbed':
        this.struggle(inp, world);
        break;
      case 'hitstun':
        this.hitstunLogic(inp, world);
        break;
      case 'dash':
        this.dashLogic(inp, world);
        break;
      case 'tether':
        this.tetherLogic(world);
        break;
      case 'frozen':
        this.vx = this.vy = 0;
        if (this.status.freeze <= 0) this.setState(this.grounded ? 'idle' : 'air');
        break;
      case 'stunned':
        this.stunLogic(world);
        break;
      case 'ledge':
        this.ledgeLogic(inp, world);
        break;
      case 'ledgeClimb':
        this.climbLogic(world);
        break;
    }

    this.lastStickY = inp.stickY;
    this.checkBlastZones(world);
  }

  /** Flick detection (fast stick pushes) for smash inputs, rolls and spot dodges. */
  private trackSticks(inp: FighterInput): void {
    if (this.flickX > 0) this.flickX--;
    if (this.flickUp > 0) this.flickUp--;
    if (this.flickDown > 0) this.flickDown--;
    if (Math.abs(inp.stickX) >= FLICK_HI && Math.abs(this.lastStickX) < FLICK_LO) {
      this.flickX = FLICK_FRAMES;
      this.flickXDir = inp.stickX > 0 ? 1 : -1;
    }
    if (inp.stickY <= -FLICK_HI && this.lastStickY > -FLICK_LO) this.flickUp = FLICK_FRAMES;
    if (inp.stickY >= FLICK_HI && this.lastStickY < FLICK_LO) this.flickDown = FLICK_FRAMES;
    this.lastStickX = inp.stickX;
  }

  // ---- ground ---------------------------------------------------------------------------------
  private groundLogic(inp: FighterInput, world: World): void {
    const s = this.stats;
    const canAct = this.state === 'idle' || this.state === 'run' || this.state === 'crouch';

    this.coyote = COYOTE_FRAMES;
    this.jumpsLeft = s.doubleJumps;
    this.fastFalling = false;
    this.glideFrames = 0;
    this.gliding = false;
    this.ledgeGrabs = 0;
    this.airDodgeUsed = false;
    this.wallJumps = 0;
    this.clingFrames = 0;

    let target = 0;
    if (this.state === 'landing' && this.stateFrame >= (this.lagFrames || LANDING_FRAMES)) {
      this.lagFrames = 0;
      this.setState('idle');
    }
    if (this.state === 'downed' && this.stateFrame >= 6 && this.buffer.consume(Button.Attack) && this.startMove('getupAttack', inp, world)) return;
    // getup options after a missed tech: roll left / right, or stand straight up (Jump / Shield / Up)
    if (this.state === 'downed' && this.stateFrame >= 6) {
      if (Math.abs(inp.stickX) > 0.6) {
        this.rollDir = inp.stickX > 0 ? 1 : -1;
        this.setState('roll');
        this.invuln = Math.max(this.invuln, 22);
        world.emit('dodge', this, this.x, this.y, 0, 0);
        return;
      }
      if (this.buffer.consume(Button.Jump) || this.buffer.consume(Button.Shield) || inp.stickY < STICK_UP) {
        this.setState('idle');
        this.invuln = Math.max(this.invuln, 14);
        return;
      }
    }
    if (this.state === 'downed' && this.stateFrame >= DOWNED_FRAMES) {
      this.setState('idle');
      this.invuln = Math.max(this.invuln, 10);
    }
    if (this.state === 'tech' && this.stateFrame >= TECH_GROUND_FRAMES) this.setState('idle');

    let accelMul = 1;
    if (this.state === 'jumpsquat') {
      // jumpsquat keeps the ground momentum (a dash jump flies further); pushing the other way still brakes
      const run = s.runSpeed * this.speedMul;
      target = Math.abs(inp.stickX) > 0.3 ? Math.sign(inp.stickX) * Math.max(run * Math.abs(inp.stickX), Math.sign(inp.stickX) === Math.sign(this.vx) ? Math.abs(this.vx) : 0) : this.vx * 0.9;
      if (this.stateFrame >= s.jumpsquatFrames) {
        // full hop if the jump button is still down at the end of jumpsquat, otherwise short hop; an attack pressed during the
        // jumpsquat (Jump + Attack together) always short hops, so the aerial comes out low and fast
        const shAerial = this.buffer.has(Button.Attack) || this.buffer.has(Button.Smash);
        this.takeoff((inp.held & Button.Jump) !== 0 && !shAerial ? s.jumpHeight : s.shortHopHeight, world);
        this.airLogic(inp, world, true);
        return;
      }
    } else if (this.state === 'idle' || this.state === 'run' || this.state === 'crouch') {
      if (this.tryStartAction(inp, world)) return;
      // tap down on a pass-through platform to drop through it
      if (this.flickDown > 0 && inp.stickY > STICK_CROUCH && this.groundPlat && this.groundPlat.kind === 'pass') {
        this.flickDown = 0;
        this.buffer.consume(Button.Jump); // a jump pressed together with the drop is spent on it
        this.dropThrough();
        this.airLogic(inp, world, true);
        return;
      }
      if (this.buffer.has(Button.Jump)) {
        this.buffer.consume(Button.Jump);
        if (inp.stickY > STICK_CROUCH && this.groundPlat && this.groundPlat.kind === 'pass') {
          this.dropThrough();
          this.airLogic(inp, world, true);
          return;
        }
        this.setState('jumpsquat');
        target = inp.stickX * s.runSpeed * this.speedMul;
      } else if (inp.stickY > STICK_CROUCH) {
        if (this.state !== 'crouch') this.setState('crouch');
        target = 0;
      } else {
        target = this.groundTarget(inp.stickX);
        // a flick starts an initial dash; flicking back inside one dash-dances (fighters with their own dash special use that instead)
        // (the flick stays live for a few frames, so flick-then-Attack is still a smash attack out of the dash)
        if (!this.data.dash && this.flickX === FLICK_FRAMES && Math.abs(inp.stickX) >= FLICK_HI && (this.dashTimer === 0 || this.flickXDir !== this.dashDir)) {
          this.startDash(this.flickXDir > 0 ? 1 : -1, world);
        }
        if (this.dashTimer > 0) {
          this.dashTimer--;
          const holding = Math.abs(inp.stickX) > 0.3 && Math.sign(inp.stickX) === this.dashDir;
          target = holding ? this.dashDir * s.runSpeed * DASH_SPEED_MULT * this.speedMul : 0;
          accelMul = DASH_ACCEL_MULT;
          this.facing = this.dashDir;
          this.skidding = false;
        } else {
          // turning against a run skids first: the facing flips once the slide has stopped
          this.skidding = Math.abs(this.vx) > 1 && target !== 0 && Math.sign(target) !== Math.sign(this.vx);
          if (!this.skidding && Math.abs(inp.stickX) > TURN_THRESHOLD) this.facing = inp.stickX > 0 ? 1 : -1;
        }
        const next = Math.abs(this.vx) > 0.3 || Math.abs(target) > 0.3 || this.dashTimer > 0 ? 'run' : 'idle';
        if (this.state !== next) this.setState(next);
      }
    }
    void canAct;

    const braking = target === 0 || (this.vx !== 0 && Math.sign(target) !== Math.sign(this.vx)) || Math.abs(target) < Math.abs(this.vx);
    const rate = braking ? s.groundFriction * this.surfaceFriction() * (this.state === 'crouch' ? 2 : 1) * (this.skidding ? 1.25 : 1) : s.groundAccel * this.surfaceTraction() * accelMul;
    this.vx = approach(this.vx, target, rate);
    if (Math.abs(this.vx) < 0.01) this.vx = 0;

    const wasGrounded = this.grounded;
    const was = this.state;
    this.integrate(world);
    // walking off a stage edge catches the ledge automatically
    if (wasGrounded && !this.grounded && (was === 'idle' || was === 'run' || was === 'crouch') && this.state !== 'attack') this.autoLedgeGrab(world);
  }

  private autoLedgeGrab(world: World): void {
    if (this.grabCooldown > 0 || this.vy < 0) return;
    for (let i = 0; i < world.ledges.length; i++) {
      const l = world.ledges[i];
      if (l.occupant !== -1 && l.occupant !== this.id) continue;
      const outside = (this.x - l.x) * l.side;
      if (outside < -this.hw || outside > this.hw + 12 || Math.abs(this.y - l.y) > 10) continue;
      this.grabLedge(l, world);
      return;
    }
  }

  /** Buffered attack / special / grab / shield inputs from a neutral grounded state. */
  private tryStartAction(inp: FighterInput, world: World): boolean {
    if ((inp.held & Button.Shield) !== 0 && this.shieldHP > 0 && this.shieldCooldown === 0) {
      this.setState('shield');
      this.parryFrames = PARRY_FRAMES;
      return true;
    }
    if (this.buffer.consume(Button.Grab)) return this.startMove('grab', inp, world);
    if (this.tryStartSpecial(inp, world)) return true;
    const dash = this.data.dash;
    if (dash && this.dashCd === 0 && this.flickX > 0 && !this.buffer.has(Button.Attack) && !this.buffer.has(Button.Smash)) {
      this.facing = this.flickXDir > 0 ? 1 : -1;
      this.flickX = 0;
      this.setState('dash');
      world.emit('dodge', this, this.x, this.y, 0, 0);
      return true;
    }
    return this.tryStartAttack(inp, world, true);
  }

  private tryStartSpecial(inp: FighterInput, world: World): boolean {
    if (this.buffer.has(Button.Ultimate) && this.data.moves.ultimate) {
      this.buffer.consume(Button.Ultimate);
      const cost = this.data.ultimate?.cost ?? ULT_COST;
      if (this.meter < cost) return this.grounded && this.startMove('taunt', inp, world); // no meter: taunt instead

      this.meter = 0;
      return this.startMove('ultimate', inp, world);
    }
    if (!this.buffer.has(Button.Special)) return false;
    let id = 'neutralB';
    if (inp.stickY < -0.6) id = 'upB';
    else if (inp.stickY > 0.6) id = 'downB';
    else if (Math.abs(inp.stickX) > 0.6) id = 'sideB';
    if (this.data.behavior?.chooseMove) {
      const chosen = this.data.behavior.chooseMove(this, id, world);
      if (chosen === null) {
        this.buffer.consume(Button.Special); // the press is swallowed (e.g. no air blink left)
        return false;
      }
      id = chosen;
    }
    if (!this.data.moves[this.resolveVariant(id)]) return false;
    this.buffer.consume(Button.Special);
    this.chargeButton = Button.Special; // chargeable specials hold on the Special button
    // side specials go the way the stick points (up specials aim with the stick instead, so they keep the facing)
    if (id.startsWith('sideB') && Math.abs(inp.stickX) > 0.6) this.facing = inp.stickX > 0 ? 1 : -1;
    return this.startMove(id, inp, world);
  }

  private tryStartAttack(inp: FighterInput, world: World, grounded: boolean): boolean {
    const smashBtn = this.buffer.has(Button.Smash);
    const atkBtn = this.buffer.has(Button.Attack);
    if (!smashBtn && !atkBtn) return false;
    if (this.heldBomb) {
      this.buffer.consume(smashBtn ? Button.Smash : Button.Attack);
      return throwBomb(world, this.id, inp.stickX, inp.stickY);
    }
    // Jump + Attack together on the ground: the jump goes first and the attack waits in the buffer (short-hop aerial)
    if (grounded && this.state !== 'dash' && (inp.pressed & Button.Jump) !== 0) return false;
    const up = inp.stickY < -0.5;
    const down = inp.stickY > 0.5;
    const side = Math.abs(inp.stickX) > 0.5;

    if (!grounded) {
      this.buffer.consume(smashBtn ? Button.Smash : Button.Attack);
      let id = 'nair';
      if (up) id = 'uair';
      else if (down) id = 'dair';
      else if (side) id = inp.stickX * this.facing > 0 ? 'fair' : 'bair';
      return this.startMove(id, inp, world);
    }

    const flicked = world.config.smashFlick && atkBtn && (this.flickX > 0 || this.flickUp > 0 || this.flickDown > 0);
    const isSmash = smashBtn || flicked;
    if (isSmash) {
      this.chargeButton = smashBtn ? Button.Smash : Button.Attack;
      this.buffer.consume(smashBtn ? Button.Smash : Button.Attack);
      const flickDir = this.flickUp > 0 ? 'up' : this.flickDown > 0 ? 'down' : 'side';
      let id = 'fsmash';
      if (up || flickDir === 'up') id = 'usmash';
      else if (down || flickDir === 'down') id = 'dsmash';
      else if (side) this.facing = inp.stickX > 0 ? 1 : -1;
      else if (this.flickX > 0) this.facing = this.flickXDir > 0 ? 1 : -1;
      return this.startMove(id, inp, world);
    }
    this.buffer.consume(Button.Attack);
    const dm = this.data.moves;
    if ((this.state === 'run' || this.state === 'dash') && Math.abs(this.vx) > 1.6 && Math.abs(inp.stickX) > 0.75 && dm.dashAttack) return this.startMove('dashAttack', inp, world);
    if (up && dm.utilt) return this.startMove('utilt', inp, world);
    if (down && dm.dtilt) return this.startMove('dtilt', inp, world);
    if (side && dm.ftilt) {
      this.facing = inp.stickX > 0 ? 1 : -1;
      return this.startMove('ftilt', inp, world);
    }
    return this.startMove('jab1', inp, world);
  }

  /** Initial dash: an instant burst in `dir` (a reversal drops the old momentum: that is what makes dash-dancing snappy). */
  private startDash(dir: 1 | -1, world: World): void {
    const sp = this.stats.runSpeed * DASH_SPEED_MULT * this.speedMul;
    this.dashDir = dir;
    this.facing = dir;
    this.dashTimer = INITIAL_DASH_FRAMES;
    this.skidding = false;
    this.vx = dir * Math.max(sp * 0.75, this.vx * dir);
    if (this.state !== 'run') this.setState('run');
    world.emit('dash', this, this.x, this.y, 0, dir);
  }

  private takeoff(height: number, world: World): void {
    this.vy = -Math.sqrt(2 * this.stats.gravity * height);
    if (this.groundPlat && this.groundPlat.moving) this.vx += this.groundPlat.dx * 0.9; // inherit the platform's motion
    this.grounded = false;
    this.groundPlat = null;
    this.coyote = 0;
    this.setState('air');
    world.emit('jump', this, this.x, this.y, 0, 0);
  }

  private dropThrough(): void {
    this.grounded = false;
    this.groundPlat = null;
    this.y += DROP_NUDGE;
    this.startBottom = this.y;
    this.vy = 1;
    this.coyote = 0;
    this.setState('air');
  }

  // ---- status / dash / tether -------------------------------------------------------------------
  private tickStatus(world: World): void {
    const st = this.status;
    if (st.burn > 0) {
      st.burn--;
      this.damage += this.burnPerTick;
      if (st.burn % 12 === 0) world.emit('status', this, this.x, this.y - this.h / 2, st.burn, 0);
    }
    if (st.slow > 0 && --st.slow === 0) this.slowMul = 1;
    if (st.freeze > 0 && --st.freeze === 0) this.freezeImmune = FREEZE_IMMUNE;
    else if (this.freezeImmune > 0) this.freezeImmune--;
    if (st.stun > 0) st.stun--;
    if (st.soak > 0) {
      st.soak--;
      if (st.soak % 20 === 0 && st.soak > 0) world.emit('status', this, this.x, this.y - this.h / 2, st.soak, 6); // drips
    }
  }

  /** Soak level 0-3 (each SOAK_LEVEL frames of soak is one level). */
  get soakLevel(): number {
    return Math.ceil(this.status.soak / SOAK_LEVEL);
  }

  private dashLogic(inp: FighterInput, world: World): void {
    const d = this.data.dash!;
    this.vx = this.facing * d.speed * this.speedMul;
    if (this.stateFrame >= d.invuln[0] && this.stateFrame <= d.invuln[1]) this.invuln = Math.max(this.invuln, 1);
    if (this.buffer.has(Button.Jump)) {
      this.buffer.consume(Button.Jump);
      this.setState('jumpsquat');
      this.dashCd = d.cooldown;
      this.integrate(world);
      return;
    }
    if (this.tryStartAttack(inp, world, true)) {
      this.dashCd = d.cooldown;
      return;
    }
    this.integrate(world);
    if (this.state === 'dash' && this.stateFrame >= d.frames) {
      this.dashCd = d.cooldown;
      this.setState(Math.abs(inp.stickX) > 0.3 ? 'run' : 'idle');
    }
  }

  private stunLogic(world: World): void {
    if (this.grounded) {
      this.vx = approach(this.vx, 0, this.stats.groundFriction * this.surfaceFriction());
    } else {
      this.vy = Math.min(this.stats.fallSpeed, this.vy + this.stats.gravity);
    }
    this.integrate(world);
    if (this.status.stun <= 0) this.setState(this.grounded ? 'idle' : 'air');
  }

  private tetherLogic(world: World): void {
    // the hook reaches the point; for a ledge the fighter ends up hanging below it, otherwise on top
    const hangY = this.tetherLedge ? this.tetherY + this.h * 0.95 : this.tetherY;
    const hangX = this.tetherLedge ? this.tetherLedge.x + this.tetherLedge.side * (this.hw + 1) : this.tetherX;
    const ddx = hangX - this.x;
    const ddy = hangY - this.y;
    const d2 = Math.hypot(ddx, ddy);
    if (d2 <= this.tetherSpeed) {
      this.x = hangX;
      this.y = hangY;
      if (this.tetherLedge && (this.tetherLedge.occupant === -1 || this.tetherLedge.occupant === this.id)) {
        this.grabLedge(this.tetherLedge, world);
      } else if (this.tetherPlat) {
        this.groundPlat = this.tetherPlat;
        this.grounded = true;
        this.helpless = false;
        this.setState('idle');
        world.emit('land', this, this.x, this.y, 0, 0);
      } else {
        this.setState('air');
      }
      this.tetherLedge = null;
      this.tetherPlat = null;
      return;
    }
    this.x += (ddx / d2) * this.tetherSpeed;
    this.y += (ddy / d2) * this.tetherSpeed;
    this.vx = this.vy = 0;
    this.invuln = Math.max(this.invuln, 1);
  }

  // ---- moves ----------------------------------------------------------------------------------
  /** Resolve a move slot to its resource-selected variant (see `CharacterData.variants`). */
  resolveVariant(id: string): string {
    const v = this.data.variants?.[id];
    if (!v || v.ids.length === 0) return id;
    const i = Math.max(0, Math.min(v.ids.length - 1, Math.floor(this.res[v.key] ?? 0)));
    return v.ids[i];
  }

  startMove(id: string, inp: FighterInput | null, world: World): boolean {
    id = this.resolveVariant(id);
    let m = this.data.moves[id] ?? GENERIC_MOVES[id];
    if (!m && !this.data.behavior?.remapMove) return false;
    if (this.data.behavior?.remapMove) {
      id = this.data.behavior.remapMove(this, id);
      m = this.data.moves[id] ?? GENERIC_MOVES[id];
    }
    if (!m) return false;
    if (m.requires && (this.res[m.requires.key] ?? 0) < m.requires.min) return false;
    if (m.charge && m.kind === 'special') this.chargeButton = Button.Special; // also when started directly (training)
    this.move = m;
    this.moveFrame = 0;
    this.chargeFrames = 0;
    if (m.charge?.store && (this.res[m.charge.store] ?? 0) > 0) {
      // a stored charge (Giant Punch style): pick up where the last wind-up was banked
      this.chargeFrames = Math.min(m.charge.max, this.res[m.charge.store]);
      this.res[m.charge.store] = 0;
    }
    this.queuedNext = false;
    this.moveHit = false;
    this.moveLanded = false;
    this.bReversed = false;
    this.moveStale = this.staleMult(m.id);
    this.hitMask.fill(0);
    this.rehit.fill(0);
    this.hitProjMask.fill(0);
    this.hitDepMask = 0;
    this.helpless = false;
    if (m.noLedge) this.grabCooldown = Math.max(this.grabCooldown, m.noLedge);
    if (m.kind === 'jab' || m.kind === 'smash') {
      if (inp && Math.abs(inp.stickX) > 0.5 && m.kind === 'smash') this.facing = inp.stickX > 0 ? 1 : -1;
    }
    this.setState('attack');
    world.emit('moveStart', this, this.x, this.y, 0, 0);
    this.data.behavior?.onMoveStart?.(this, m, world);
    this.attackLogic(inp ?? NEUTRAL, world);
    return true;
  }

  /** Hit-confirm cancel routes (see MoveCancel). Returns true when a cancel started a new move / jump. */
  private tryCancel(m: MoveDef, inp: FighterInput, world: World): boolean {
    const cs = m.cancels!;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (this.moveFrame < c.from || (c.to !== undefined && this.moveFrame > c.to)) continue;
      if (c.onHit !== false && !this.moveHit) continue;
      if (c.air !== undefined && c.air !== !this.grounded) continue;
      const mask = c.button === 'attack' ? Button.Attack : c.button === 'special' ? Button.Special : c.button === 'smash' ? Button.Smash : c.button === 'grab' ? Button.Grab : Button.Jump;
      if (!this.buffer.has(mask)) continue;
      const fx = inp.stickX * this.facing;
      const ok =
        c.dir === undefined || c.dir === 'any' ? true
        : c.dir === 'neutral' ? Math.abs(inp.stickX) < 0.5 && Math.abs(inp.stickY) < 0.5
        : c.dir === 'forward' ? fx > 0.5
        : c.dir === 'back' ? fx < -0.5
        : c.dir === 'side' ? Math.abs(inp.stickX) > 0.5
        : c.dir === 'up' ? inp.stickY < -0.5
        : inp.stickY > 0.5;
      if (!ok) continue;
      if (c.into === '@jump') {
        this.buffer.consume(mask);
        if (this.jumpCancel(inp, world)) return true;
        continue;
      }
      if (c.dir === 'forward' && Math.abs(inp.stickX) > 0.5) this.facing = inp.stickX > 0 ? 1 : -1;
      this.buffer.consume(mask);
      if (c.button === 'special' || c.button === 'smash') this.chargeButton = c.button === 'special' ? Button.Special : Button.Smash;
      let into = c.into;
      if (c.button === 'special' && this.data.behavior?.chooseMove) {
        const chosen = this.data.behavior.chooseMove(this, into, world); // e.g. Nova's element variant
        if (chosen === null) continue;
        into = chosen;
      }
      if (this.startMove(into, inp, world)) return true;
    }
    return false;
  }

  private jumpCancel(inp: FighterInput, world: World): boolean {
    if (!this.grounded && this.jumpsLeft <= 0) return false;
    this.endMoveState();
    if (this.grounded) {
      this.setState('jumpsquat');
      return true;
    }
    if (this.jumpsLeft > 0) {
      const s = this.stats;
      this.jumpsLeft--;
      this.vy = -Math.sqrt(2 * s.gravity * s.doubleJumpHeight);
      this.fastFalling = false;
      this.vx = Math.abs(inp.stickX) > 0.3 ? inp.stickX * s.airSpeed : this.vx * 0.5;
      this.setState('air');
      world.emit('doubleJump', this, this.x, this.y - this.h / 2, 0, 0);
      return true;
    }
    return false;
  }

  private attackLogic(inp: FighterInput, world: World): void {
    const m = this.move;
    if (!m) {
      this.setState(this.grounded ? 'idle' : 'air');
      return;
    }

    // rehit timers
    for (let i = 0; i < this.rehit.length; i++) {
      if (this.rehit[i] > 0 && --this.rehit[i] === 0) this.hitMask[(i / MAX_GROUPS) | 0] &= ~(1 << (i % MAX_GROUPS));
    }

    if (m.cancels && this.tryCancel(m, inp, world)) return;

    // B-reverse: flick back right after starting a neutral / down special to turn it around (and flip air drift)
    if (m.kind === 'special' && this.moveFrame >= 1 && this.moveFrame <= B_REVERSE_FRAMES && !this.bReversed && this.flickX === FLICK_FRAMES && this.flickXDir === -this.facing && !/^(sideB|upB)/.test(m.id)) {
      this.bReversed = true;
      this.facing = this.facing === 1 ? -1 : 1;
      if (!this.grounded) this.vx = -this.vx;
      world.emit('dodge', this, this.x, this.y, 0, 0);
    }

    // storable charge: Shield mid-wind-up banks the charge and cancels the move (Giant Punch style)
    if (m.charge?.store && this.moveFrame === m.charge.frame && this.chargeFrames > 0 && (inp.pressed & Button.Shield) !== 0) {
      this.res[m.charge.store] = this.chargeFrames;
      this.endMoveState();
      this.setState(this.grounded ? 'idle' : 'air');
      world.emit('fx', this, this.x, this.y - this.h / 2, this.facing, 0, 'store');
      return;
    }
    // smash charge: hold on the charge frame while the button is down
    // (a storable charge keeps holding at full while the button is down, so it can be banked at leisure)
    if (m.charge && this.moveFrame === m.charge.frame && (this.chargeFrames < m.charge.max || (m.charge.store && this.stateFrame < STORE_HOLD_MAX)) && (inp.held & this.chargeButton) !== 0) {
      if (this.chargeFrames < m.charge.max) this.chargeFrames++;
      this.attackPhysics(m, inp, world);
      this.integrateAttack(world);
      return;
    }

    this.moveFrame++;
    const f = this.moveFrame;

    if (m.motion) {
      for (const mv of m.motion) {
        if (mv.frame !== f) continue;
        if (mv.vx !== undefined) this.vx = mv.mode === 'add' ? this.vx + mv.vx * this.facing : mv.vx * this.facing;
        if (mv.vy !== undefined) {
          this.vy = mv.mode === 'add' ? this.vy + mv.vy : mv.vy;
          if (mv.vy < 0) {
            this.grounded = false;
            this.groundPlat = null;
          }
        }
      }
    }
    if (m.invuln && f >= m.invuln[0] && f <= m.invuln[1]) this.invuln = Math.max(this.invuln, 1);
    if (m.events) {
      for (const ev of m.events) {
        if (ev.frame !== f) continue;
        if (ev.minCharge !== undefined && this.chargeFrac < ev.minCharge) continue;
        executeMoveEvent(this, ev, inp, world);
        if (this.state !== 'attack' || this.move !== m) return; // the event ended the move (tether latched, ledge snapped, ...)
      }
    }
    this.data.behavior?.onMoveFrame?.(this, m, f, world);
    if (this.state !== 'attack' || this.move !== m) return;

    // jab chain
    if (m.next) {
      if (f >= m.next.from && f <= m.next.to && this.buffer.consume(Button.Attack)) this.queuedNext = true;
      if (this.queuedNext && f >= m.next.at) {
        this.startMove(m.next.id, inp, world);
        return;
      }
    }

    this.attackPhysics(m, inp, world);
    this.integrateAttack(world);
    if (this.state !== 'attack') return;
    // recovery specials can catch the ledge mid-move
    if (!this.grounded && m.kind === 'special' && m.ledgeGrab !== false) this.tryLedgeGrab(inp, world);
    if (this.state !== 'attack') return;

    if (this.moveLanded && !this.queuedNext && QUICK_ON_HIT.has(m.kind) && f >= m.startup + m.active + Math.ceil(m.recovery * HIT_RECOVERY_KEEP)) {
      this.finishMove(world);
      return;
    }
    if (this.moveFrame >= moveTotal(m)) this.finishMove(world);
  }

  private attackPhysics(m: MoveDef, inp: FighterInput, world: World): void {
    const s = this.stats;
    if (this.grounded) {
      this.vx = approach(this.vx, 0, s.groundFriction * this.surfaceFriction() * 0.7);
    } else {
      // aerials can be fast-fallen (a fresh down flick once falling), and a fast fall carries into the aerial
      if (m.kind === 'aerial' && !this.fastFalling && this.vy >= 0 && inp.stickY > STICK_DOWN && this.lastStickY <= STICK_DOWN) {
        this.fastFalling = true;
        this.vy = s.fastFallSpeed;
        world.emit('fastFall', this, this.x, this.y - this.h / 2, 0, 0);
      }
      if (this.hover) this.vy = 0;
      else this.vy += s.gravity * (m.gravityScale ?? 1);
      const cap = this.fastFalling && m.kind === 'aerial' ? s.fastFallSpeed : s.fallSpeed;
      if (this.vy > cap) this.vy = cap;
      const target = inp.stickX * s.airSpeed * 0.8;
      this.vx = Math.abs(inp.stickX) < 0.05 ? approach(this.vx, 0, s.airFriction) : approach(this.vx, target, s.airAccel * 0.7);
    }
  }

  private integrateAttack(world: World): void {
    this.integrate(world);
  }

  private finishMove(world: World): void {
    const m = this.move;
    const wasThrow = m?.kind === 'throw';
    this.endMoveState();
    if (wasThrow) this.grabTarget = -1;
    this.setState(this.grounded ? 'idle' : 'air');
    if (m) {
      if (m.helpless && !this.grounded) this.helpless = true;
      this.data.behavior?.onMoveEnd?.(this, m, world);
    }
  }

  /** Clear move bookkeeping (does not change state). */
  private endMoveState(): void {
    this.move = null;
    this.moveFrame = 0;
    this.chargeFrames = 0;
    this.queuedNext = false;
  }

  private onAttackLand(world: World): void {
    const m = this.move;
    if (!m) {
      this.setState('landing');
      return;
    }
    const f = this.moveFrame;
    const activeFrom = m.startup + 1;
    const activeTo = m.startup + m.active;
    if (m.landBounce && f >= activeFrom && f <= activeTo + 4) {
      // stomp bounces back up and the move plays out
      this.vy = -m.landBounce;
      this.grounded = false;
      this.groundPlat = null;
      world.emit('landBounce', this, this.x, this.y, m.landBounce, 0);
      return;
    }
    const auto = m.autocancel?.some(([a, b]) => f >= a && f <= b) ?? false;
    this.endMoveState();
    this.lagFrames = auto ? 0 : (m.landingLag ?? 8);
    this.setState('landing');
    world.emit('land', this, this.x, this.y, this.impactVy, 0);
    this.data.behavior?.onLand?.(this, this.impactVy, world);
  }

  // ---- shield / dodge / stun ------------------------------------------------------------------
  private shieldLogic(inp: FighterInput, world: World): void {
    this.vx = approach(this.vx, 0, this.stats.groundFriction * this.surfaceFriction());
    if (this.state === 'shield') {
      this.shieldHP -= SHIELD_DECAY;
      if (this.shieldHP <= 0) {
        this.shieldHP = 0;
        this.shieldHit(0, true, 1, 0, world);
        return;
      }
      if ((inp.held & Button.Shield) === 0) {
        this.shieldCooldown = SHIELD_DROP_LAG;
        this.setState('idle');
        return;
      }
      // out-of-shield options: up smash / smashes by stick, any special, jump-cancelled grab
      if (this.buffer.has(Button.Smash) || (this.buffer.has(Button.Attack) && inp.stickY < -0.5)) {
        const smashBtn = this.buffer.has(Button.Smash);
        this.buffer.consume(smashBtn ? Button.Smash : Button.Attack);
        const id = inp.stickY < -0.5 ? 'usmash' : inp.stickY > 0.5 ? 'dsmash' : 'fsmash';
        if (this.startMove(id, inp, world)) return;
      }
      if (this.buffer.has(Button.Special) && this.tryStartSpecial(inp, world)) return;
      if (this.buffer.consume(Button.Grab) || this.buffer.consume(Button.Attack)) {
        this.startMove('grab', inp, world);
        return;
      }
      if (this.buffer.consume(Button.Jump)) {
        this.setState('jumpsquat');
        return;
      }
      if (this.flickDown > 0) {
        this.flickDown = 0;
        this.setState('spotdodge');
        this.staleDodge();
        world.emit('dodge', this, this.x, this.y, 0, 0);
        return;
      }
      if (this.flickX > 0) {
        this.rollDir = this.flickXDir > 0 ? 1 : -1;
        this.flickX = 0;
        this.setState('roll');
        this.staleDodge();
        world.emit('dodge', this, this.x, this.y, 0, 0);
        return;
      }
    } else if (this.stateFrame >= this.shieldStun) {
      this.setState((inp.held & Button.Shield) !== 0 ? 'shield' : 'idle');
    }
    this.integrate(world);
  }

  /**
   * Air dodge. Neutral (no stick): a short in-place dodge that slows the fall. Directional: a dash of momentum that can be slid
   * into the ground (wavelanding). Either way it is once per airtime, and the fighter can act again afterwards.
   */
  private airDodgeLogic(_inp: FighterInput, world: World): void {
    const t = this.stateFrame;
    const neutral = this.airDodgeDx === 0 && this.airDodgeDy === 0;
    const total = neutral ? AIRDODGE_NEUTRAL_FRAMES : AIRDODGE_FRAMES;
    const inv = neutral ? AIRDODGE_NEUTRAL_INVULN : 20;
    if (t >= 3 && t <= inv - this.dodgeCut(inv - 3)) this.invuln = Math.max(this.invuln, 1);
    if (neutral) {
      this.vx *= 0.86;
      if (t < 12) this.vy = approach(this.vy, 0, 0.6);
      else this.vy = Math.min(this.stats.fallSpeed, this.vy + this.stats.gravity);
    } else {
      const k = t <= 16 ? 1 - t / 20 : 0;
      this.vx = this.airDodgeDx * AIRDODGE_SPEED * k;
      this.vy = t <= 16 ? this.airDodgeDy * AIRDODGE_SPEED * k : Math.min(this.stats.fallSpeed, this.vy + this.stats.gravity);
    }
    this.integrate(world);
    if (this.grounded) {
      this.lagFrames = neutral ? 6 : 8;
      this.setState('landing');
      return;
    }
    if (t >= total) this.setState('air');
  }

  private staleDodge(): void {
    this.dodgeStale = Math.min(6, this.dodgeStale + 1);
    this.dodgeStaleTimer = 0;
  }

  /** Invincibility frames lost to dodge staleness (2 per repeat after the first, always leaving at least 2). */
  private dodgeCut(span: number): number {
    return Math.min(Math.max(0, span - 2), Math.max(0, this.dodgeStale - 1) * 2);
  }

  private dodgeLogic(world: World): void {
    const spot = this.state === 'spotdodge';
    const total = spot ? SPOTDODGE_FRAMES : ROLL_FRAMES;
    const win = spot ? SPOTDODGE_INVULN : ROLL_INVULN;
    if (this.stateFrame >= win[0] && this.stateFrame <= win[1] - this.dodgeCut(win[1] - win[0])) this.invuln = Math.max(this.invuln, 1);
    if (spot) this.vx = 0;
    else this.vx = this.stateFrame >= 4 && this.stateFrame <= 24 ? this.rollDir * ROLL_SPEED : this.vx * 0.6;
    this.integrate(world);
    if (this.stateFrame >= total) this.setState('idle');
  }

  private shieldBreakLogic(world: World): void {
    this.vy += this.stats.gravity;
    if (this.vy > this.stats.fallSpeed) this.vy = this.stats.fallSpeed;
    if (this.grounded) this.vx = approach(this.vx, 0, 0.4);
    this.integrate(world);
    if (this.stateFrame >= SHIELDBREAK_FRAMES) {
      this.shieldHP = SHIELD_MAX * 0.6;
      this.setState(this.grounded ? 'idle' : 'air');
    }
  }

  // ---- grabs ----------------------------------------------------------------------------------
  /** Attacker side: successfully grabbed `victim`. */
  grabVictim(victim: Fighter): void {
    this.endMoveState();
    this.grabTarget = victim.id;
    this.holdTimer = GRAB_BASE_HOLD + victim.damage * 0.8;
    this.setState('holding');
    this.vx = 0;
    victim.beGrabbed(this);
  }

  beGrabbed(by: Fighter): void {
    this.endMoveState();
    this.grabbedBy = by.id;
    this.state = 'grabbed';
    this.stateFrame = 0;
    this.vx = this.vy = 0;
    this.hitstun = 0;
    this.releaseLedge();
  }

  /** Victim side: freed from a grab (timeout, escape, or throw). */
  releaseGrab(): void {
    this.grabbedBy = -1;
    if (this.state === 'grabbed') {
      this.setState(this.grounded ? 'idle' : 'air');
      this.invuln = Math.max(this.invuln, 12);
    }
  }

  private holdLogic(inp: FighterInput, world: World): void {
    this.holdTimer--;
    this.vx = 0;
    if (this.holdTimer <= 0) {
      // victim broke free / timed out: both get a short breather
      this.grabTarget = -1;
      this.setState('idle');
      this.lagFrames = 0;
      return;
    }
    if (this.buffer.consume(Button.Attack) && this.pummelCd === 0) {
      const v = world.fighters[this.grabTarget];
      if (v) {
        v.damage += 1.5;
        v.hitlag = 3;
        this.hitlag = 3;
        this.pummelCd = 14;
        this.holdTimer -= 6;
        world.emit('pummel', v, v.x, v.y - v.h / 2, 0, 1.5);
      }
      return;
    }
    let id: string | null = null;
    if (inp.stickY < -0.7) id = 'uthrow';
    else if (inp.stickY > 0.7) id = 'dthrow';
    else if (inp.stickX * this.facing > 0.7) id = 'fthrow';
    else if (inp.stickX * this.facing < -0.7) id = 'bthrow';
    else if (this.buffer.consume(Button.Smash) || this.buffer.consume(Button.Grab)) id = 'fthrow';
    if (id) this.startMove(id, inp, world);
  }

  private struggle(inp: FighterInput, world: World): void {
    const g = world.fighters[this.grabbedBy];
    if (!g) return;
    if (inp.pressed !== 0) g.holdTimer -= GRAB_STRUGGLE;
  }

  // ---- air ------------------------------------------------------------------------------------
  private airLogic(inp: FighterInput, world: World, justLeftGround = false): void {
    const s = this.stats;

    // air dodge: Shield in the air (once per airtime); the stick picks the direction, neutral = dodge in place
    if (!this.helpless && !justLeftGround && !this.airDodgeUsed && (inp.pressed & Button.Shield) !== 0) {
      this.airDodgeUsed = true;
      const mag = Math.hypot(inp.stickX, inp.stickY);
      this.airDodgeDx = mag > 0.3 ? inp.stickX / mag : 0;
      this.airDodgeDy = mag > 0.3 ? inp.stickY / mag : 0;
      this.endMoveState();
      this.fastFalling = false;
      this.setState('airdodge');
      this.staleDodge();
      world.emit('dodge', this, this.x, this.y - this.h / 2, 0, 0);
      return;
    }
    if (this.wall !== 0) {
      this.wallSide = this.wall;
      this.wallGrace = 6;
    } else if (this.wallGrace > 0) this.wallGrace--;
    if (this.data.wallJump && !this.helpless && !justLeftGround && this.wallGrace > 0 && this.wallJumps < 2 && this.buffer.consume(Button.Jump)) {
      this.wallJumps++;
      this.wallGrace = 0;
      this.vy = -Math.sqrt(2 * s.gravity * s.doubleJumpHeight * 0.95);
      this.vx = -this.wallSide * s.airSpeed * 1.4;
      this.facing = (-this.wallSide) as 1 | -1;
      this.fastFalling = false;
      world.emit('jump', this, this.x, this.y - this.h / 2, 0, 1);
    }
    if (!this.helpless && !justLeftGround && this.tryStartSpecial(inp, world)) return;
    if (!this.helpless && !justLeftGround && this.tryStartAttack(inp, world, false)) return;

    if (!this.helpless && this.buffer.has(Button.Jump)) {
      if (this.coyote > 0 && !justLeftGround) {
        // walked off a ledge: still allowed a ground jump
        this.buffer.consume(Button.Jump);
        this.vy = -Math.sqrt(2 * s.gravity * ((inp.held & Button.Jump) !== 0 ? s.jumpHeight : s.shortHopHeight));
        this.coyote = 0;
        world.emit('jump', this, this.x, this.y, 0, 0);
      } else if (this.jumpsLeft > 0) {
        this.buffer.consume(Button.Jump);
        this.jumpsLeft--;
        this.vy = -Math.sqrt(2 * s.gravity * s.doubleJumpHeight);
        this.fastFalling = false;
        if (Math.abs(inp.stickX) > 0.3) {
          this.vx = inp.stickX * s.airSpeed;
          this.facing = inp.stickX > 0 ? 1 : -1;
        } else {
          this.vx *= 0.5;
        }
        world.emit('doubleJump', this, this.x, this.y, 0, 0);
      }
    }

    // fast-fall: a fresh downward flick once the fighter is no longer rising
    if (!this.helpless && this.vy >= 0 && !this.fastFalling && inp.stickY > STICK_DOWN && this.lastStickY <= STICK_DOWN) {
      this.fastFalling = true;
      this.vy = s.fastFallSpeed;
      world.emit('fastFall', this, this.x, this.y - this.h / 2, 0, 0);
    }

    // gravity
    if (this.hover) this.vy = 0;
    else this.vy += s.gravity;
    const maxFall = this.fastFalling ? s.fastFallSpeed : s.fallSpeed;
    if (this.vy > maxFall) this.vy = maxFall;
    // wall cling: wall-jumpers holding toward a wall slide down slowly for a moment
    if (this.data.wallJump && !this.helpless && this.wall !== 0 && inp.stickX * this.wall > 0.3 && this.vy > WALL_SLIDE_SPEED && this.clingFrames < WALL_CLING_FRAMES) {
      this.clingFrames++;
      this.vy = WALL_SLIDE_SPEED;
      this.fastFalling = false;
    }

    // wings: hold Jump while falling to glide
    const gl = this.data.glide;
    this.gliding = false;
    if (gl && !this.helpless && this.vy > gl.fall && (inp.held & Button.Jump) !== 0 && this.glideFrames < gl.max && !this.fastFalling && !this.hover) {
      this.gliding = true;
      this.glideFrames++;
      this.vy = gl.fall;
    }

    // air drift
    const target = inp.stickX * s.airSpeed * this.speedMul * (this.helpless ? HELPLESS_DRIFT : 1) * (this.gliding && gl ? gl.speed : 1);
    if (Math.abs(inp.stickX) < 0.05) {
      this.vx = approach(this.vx, 0, s.airFriction);
    } else if (Math.abs(this.vx) > s.airSpeed && Math.sign(this.vx) === Math.sign(target)) {
      this.vx = approach(this.vx, target, s.airFriction);
    } else {
      this.vx = approach(this.vx, target, s.airAccel);
    }

    this.integrate(world);

    if (this.state === 'air' && !this.grounded) this.tryLedgeGrab(inp, world);
  }

  // ---- hitstun / bounce / tech ---------------------------------------------------------------
  private hitstunLogic(inp: FighterInput, world: World): void {
    const s = this.stats;

    if ((inp.pressed & Button.Shield) !== 0 && this.techLock === 0) {
      this.techWindow = TECH_WINDOW;
      this.techLock = TECH_LOCKOUT;
    }

    if (!this.diDone && this.hitlag === 0) {
      this.diDone = true;
      this.applyDirectionalInfluence(inp);
    }
    if ((inp.pressed & Button.Ultimate) !== 0 && this.comboHits >= BURST_MIN_HITS && this.meter >= BURST_COST) {
      this.burst(world);
      return;
    }
    // hitstun canceling out of a big launch
    if (!this.grounded && this.hitstunTotal >= HITSTUN_CANCEL_MIN && this.hitstun > 0) {
      const t = this.stateFrame;
      const dodge = t >= HITSTUN_CANCEL_DODGE && (inp.pressed & Button.Shield) !== 0 && !this.airDodgeUsed;
      const act = t >= HITSTUN_CANCEL_ACT && (this.buffer.has(Button.Attack) || this.buffer.has(Button.Special) || this.buffer.has(Button.Jump) || this.buffer.has(Button.Smash));
      if (dodge || act) {
        this.hitstun = 0;
        this.techWindow = 0;
        this.setState('air');
        this.airLogic(inp, world);
        return;
      }
    }
    this.hitstun--;
    if (this.grounded) {
      this.vx = approach(this.vx, 0, HITSTUN_GROUND_FRICTION * this.surfaceFriction());
    } else {
      this.vy += s.gravity * (this.vy < 0 ? HITSTUN_RISE_GRAVITY : HITSTUN_FALL_GRAVITY);
      if (this.vy > s.fastFallSpeed) this.vy = s.fastFallSpeed;
      this.vx = approach(this.vx, 0, LAUNCH_DRAG);
    }

    this.integrate(world);
    this.resolveImpacts(inp, world);

    if (this.state === 'hitstun' && this.hitstun <= 0) {
      if (this.status.stun > 0) this.setState('stunned'); // a stun that landed during hitstun starts when it ends
      else if (this.grounded) this.setState('idle');
      else this.setState('air');
    }
  }

  /** Hitlag SDI: a fresh stick flick during hit-stop shifts the victim a few pixels (a small way to escape or avoid follow-ups). */
  private smashDI(inp: FighterInput, world: World): void {
    const mag = Math.hypot(inp.stickX, inp.stickY);
    if (mag < 0.5) {
      this.sdiWasNeutral = true;
      return;
    }
    if (mag < 0.8 || !this.sdiWasNeutral || this.sdiCount >= SDI_MAX) return;
    this.sdiWasNeutral = false;
    this.sdiCount++;
    const dx = (inp.stickX / mag) * SDI_DIST;
    let dy = (inp.stickY / mag) * SDI_DIST;
    if (this.grounded && dy > 0) dy = 0;
    if (this.grounded) dy = Math.min(0, dy) * 0; // grounded victims only slide sideways
    this.x += dx;
    this.y += dy;
    world.emit('sdi', this, this.x, this.y - this.h / 2, 0, 0);
  }

  /**
   * Directional influence: holding the stick across the launch direction bends the trajectory by up to ~17 degrees
   * (survive by bending out of a blast zone, or fall short of a kill). Applied once, when the hitlag ends.
   */
  private applyDirectionalInfluence(inp: FighterInput): void {
    const sp = Math.hypot(this.vx, this.vy);
    const mag = Math.hypot(inp.stickX, inp.stickY);
    if (sp < 2 || mag < 0.35) return;
    const cross = (this.vx * inp.stickY - this.vy * inp.stickX) / (sp * Math.max(1, mag)); // -1..1, + = stick is clockwise of the launch
    const a = cross * DI_MAX_ANGLE;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const vx = this.vx * c - this.vy * sn;
    const vy = this.vx * sn + this.vy * c;
    this.vx = vx;
    this.vy = vy;
  }

  /** Combo breaker: spend meter to shrug off a long combo, shove nearby enemies away and gain a moment of invincibility. */
  private burst(world: World): void {
    this.meter -= BURST_COST;
    this.comboHits = 0;
    this.comboIdle = COMBO_GAP;
    this.hitstun = 0;
    this.vx = this.vy = 0;
    this.invuln = Math.max(this.invuln, 22);
    this.setState(this.grounded ? 'idle' : 'air');
    for (const o of world.fighters) {
      if (o === this || o.state === 'ko' || world.allied(this.id, o.id)) continue;
      if (Math.hypot(o.x - this.x, o.y - o.h / 2 - (this.y - this.h / 2)) > BURST_RADIUS || o.invuln > 0) continue;
      const dir: 1 | -1 = o.x >= this.x ? 1 : -1;
      o.receiveHit({ damage: 0, base: 40, scaling: 0, angle: 40, direction: dir, hitlag: 6, attackerId: this.id }, world);
    }
    world.emit('burst', this, this.x, this.y - this.h / 2, BURST_RADIUS, 0);
  }

  private resolveImpacts(inp: FighterInput, world: World): void {
    if (this.state !== 'hitstun') return;

    if (this.landed) {
      this.landed = false;
      if (this.impactVy >= BOUNCE_MIN_SPEED) {
        if (this.techWindow > 0) {
          this.doTech(inp, world, 'floor');
        } else {
          this.vy = -this.impactVy * BOUNCE_FLOOR * (this.groundPlat?.def.surface === 'bouncy' ? 1.35 : 1);
          this.vx *= 0.8;
          this.grounded = false;
          this.groundPlat = null;
          world.emit('bounce', this, this.x, this.y, this.impactVy, 0);
          this.splat(world, this.impactVy, this.x, this.y);
        }
      } else if (this.hitstun > 0) {
        // slow landing: lie down
        this.hitstun = 0;
        this.setState('downed');
      }
      return;
    }

    if (this.wall !== 0 && Math.abs(this.impactVx) >= BOUNCE_MIN_SPEED && Math.sign(this.impactVx) === this.wall) {
      if (this.techWindow > 0) {
        this.doTech(inp, world, 'wall');
      } else {
        this.vx = -this.impactVx * BOUNCE_WALL;
        world.emit('bounce', this, this.x, this.y - this.h / 2, Math.abs(this.impactVx), 0);
        this.splat(world, Math.abs(this.impactVx), this.x + this.wall * this.hw, this.y - this.h / 2);
      }
      return;
    }

    if (this.hitCeil && Math.abs(this.impactVy) >= BOUNCE_MIN_SPEED) {
      if (this.techWindow > 0) {
        this.doTech(inp, world, 'ceiling');
      } else {
        this.vy = -this.impactVy * BOUNCE_FLOOR;
        world.emit('bounce', this, this.x, this.y - this.h, Math.abs(this.impactVy), 0);
        this.splat(world, Math.abs(this.impactVy), this.x, this.y - this.h);
      }
    }
  }

  /** A hard, untech'd slam hurts: damage by impact speed, credited to whoever launched us, plus a beat of hitlag. */
  private splat(world: World, speed: number, x: number, y: number): void {
    if (speed < SPLAT_MIN_SPEED || this.stats.weight >= 200) return; // colossi (the boss) are too massive to splat
    const dmg = Math.min(SPLAT_MAX, (speed - SPLAT_MIN_SPEED + 2) * SPLAT_RATE);
    this.damage += dmg;
    if (this.lastHitBy >= 0) world.damageDealt[this.lastHitBy] = (world.damageDealt[this.lastHitBy] ?? 0) + dmg;
    this.hitlag = Math.max(this.hitlag, 4 + Math.round(speed / 3));
    world.emit('splat', this, x, y, speed, dmg);
  }

  private doTech(inp: FighterInput, world: World, kind: 'floor' | 'wall' | 'ceiling'): void {
    this.techWindow = 0;
    this.hitstun = 0;
    this.invuln = Math.max(this.invuln, TECH_INVULN);
    if (kind === 'floor') {
      this.vx = Math.abs(inp.stickX) > 0.5 ? Math.sign(inp.stickX) * 3.5 : 0; // tech roll
      this.vy = 0;
      this.setState('tech');
    } else {
      this.vx = 0;
      this.vy = 0;
      this.setState('air');
    }
    world.emit('tech', this, this.x, this.y - this.h / 2, 0, 0);
    this.data.behavior?.onTech?.(this, world);
  }

  // ---- ledge ----------------------------------------------------------------------------------
  private tryLedgeGrab(inp: FighterInput, world: World): void {
    if (this.grabCooldown > 0 || this.vy < -1) return;
    for (let i = 0; i < world.ledges.length; i++) {
      const l = world.ledges[i];
      let trumped: Fighter | null = null;
      if (l.occupant !== -1 && l.occupant !== this.id) {
        // ledge trump: grabbing an occupied ledge knocks the hanging fighter off (never an ally, never one that is climbing)
        const o = world.fighters[l.occupant];
        if (!o || o.state !== 'ledge' || world.allied(this.id, o.id)) continue;
        trumped = o;
      }
      const outside = (this.x - l.x) * l.side; // + when beyond the corner, away from the stage
      if (outside < -this.hw * 0.5 || outside > this.hw + 18) continue;
      const head = this.y - this.h - l.y;
      if (head < -10 || head > 24) continue;
      const towardStage = -l.side;
      if (this.facing !== towardStage && Math.sign(inp.stickX) !== towardStage) continue;
      if (trumped) trumped.getTrumped(l, world);
      this.grabLedge(l, world);
      return;
    }
  }

  grabLedge(l: Ledge, world: World): void {
    this.endMoveState();
    this.helpless = false;
    this.ledge = l;
    this.climbAttack = false;
    this.airDodgeUsed = false;
    this.wallJumps = 0;
    this.clingFrames = 0;
    l.occupant = this.id;
    this.glideFrames = 0;
    this.ledgeGrabs++;
    this.ledgeFrames = 0;
    this.x = l.x + l.side * (this.hw + 1);
    this.y = l.y + this.h * 0.95;
    this.vx = this.vy = 0;
    this.facing = (-l.side) as 1 | -1;
    this.jumpsLeft = this.stats.doubleJumps;
    this.fastFalling = false;
    // anti-stall: every consecutive grab (without touching ground) gives less invincibility
    this.invuln = Math.max(0, LEDGE_BASE_INVULN - LEDGE_INVULN_LOSS_PER_GRAB * (this.ledgeGrabs - 1));
    this.setState('ledge');
    world.emit('ledgeGrab', this, this.x, this.y, 0, 0);
    this.data.behavior?.onLedgeGrab?.(this, world);
  }

  private releaseLedge(): void {
    if (this.ledge) {
      this.ledge.occupant = -1;
      this.ledge = null;
    }
  }

  private ledgeLogic(inp: FighterInput, world: World): void {
    const l = this.ledge!;
    this.ledgeFrames++;
    this.vx = this.vy = 0;
    const toward = inp.stickX * -l.side; // + toward the stage, - away

    if (this.ledgeFrames > LEDGE_MAX_HANG) {
      this.dropFromLedge();
      return;
    }
    if (this.ledgeFrames < LEDGE_ACTION_DELAY) return;

    if (this.buffer.consume(Button.Attack)) {
      this.climbAttack = true;
      this.startClimb(false);
    } else if (this.buffer.consume(Button.Shield)) {
      this.startClimb(true); // ledge roll: a longer, fully invincible get-up
    } else if (this.buffer.has(Button.Jump) && toward > 0.4) {
      // ledge hop: a hop up and over onto the stage
      this.buffer.consume(Button.Jump);
      this.releaseLedge();
      this.grabCooldown = LEDGE_REGRAB_COOLDOWN;
      this.vy = -Math.sqrt(2 * this.stats.gravity * this.stats.jumpHeight * 0.8);
      this.vx = -l.side * this.stats.airSpeed * 1.1;
      this.facing = (-l.side) as 1 | -1;
      this.setState('air');
      world.emit('jump', this, this.x, this.y, 0, 0);
    } else if (this.buffer.consume(Button.Jump)) {
      this.releaseLedge();
      this.grabCooldown = LEDGE_REGRAB_COOLDOWN;
      this.vy = -Math.sqrt(2 * this.stats.gravity * this.stats.jumpHeight * 0.9);
      this.vx = -l.side * this.stats.airSpeed * 0.2; // a neutral ledge jump goes almost straight up; hold toward the stage to hop over
      this.setState('air');
      world.emit('jump', this, this.x, this.y, 0, 0);
    } else if (inp.stickY < STICK_UP || toward > 0.6) {
      this.startClimb(false);
    } else if (inp.stickY > STICK_DOWN || toward < -0.6) {
      this.dropFromLedge();
    }
  }

  /** Begin the get-up. Damaged fighters (>= SLOW_GETUP_DAMAGE) climb slowly with less invincibility; a roll is longer but safer. */
  private startClimb(roll: boolean): void {
    const slow = this.damage >= SLOW_GETUP_DAMAGE;
    this.climbRoll = roll;
    this.climbDur = LEDGE_CLIMB_FRAMES + (slow ? 10 : 0) + (roll ? 6 : 0);
    this.climbFromX = this.x;
    this.climbFromY = this.y;
    this.invuln = Math.max(this.invuln, this.climbDur + 2 - (slow ? 8 : 0));
    this.setState('ledgeClimb');
  }

  /** Knocked off the ledge by another fighter grabbing it: fall away from the stage and lose the regrab for a moment. */
  getTrumped(l: Ledge, world: World): void {
    this.releaseLedge();
    this.grabCooldown = LEDGE_REGRAB_COOLDOWN + 20;
    this.vx = l.side * 1.6;
    this.vy = 0.5;
    this.invuln = 0;
    this.setState('air');
    world.emit('trump', this, this.x, this.y - this.h / 2, 0, 0);
  }

  private dropFromLedge(): void {
    this.releaseLedge();
    this.grabCooldown = LEDGE_REGRAB_COOLDOWN;
    this.vx = 0;
    this.vy = 0;
    this.setState('air');
  }

  private climbLogic(world: World): void {
    const l = this.ledge!;
    const t = Math.min(1, this.stateFrame / this.climbDur);
    const tx = l.x - l.side * (this.hw + 2 + (this.climbRoll ? 26 : 0));
    const ty = l.y;
    if (t < 0.5) {
      this.x = this.climbFromX;
      this.y = this.climbFromY + (ty - this.climbFromY) * (t * 2);
    } else {
      this.y = ty;
      this.x = this.climbFromX + (tx - this.climbFromX) * ((t - 0.5) * 2);
    }
    if (t >= 1) {
      this.x = tx;
      this.y = ty;
      this.groundPlat = l.platform;
      this.grounded = true;
      this.releaseLedge();
      this.prevX = this.x;
      this.prevY = this.y;
      this.setState('idle');
      world.emit('land', this, this.x, this.y, 0, 0);
      if (this.climbAttack) {
        this.climbAttack = false;
        this.startMove('ledgeAttack', null, world);
      }
    }
  }

  // ---- shared ---------------------------------------------------------------------------------
  private integrate(world: World): void {
    const wasGrounded = this.grounded;
    moveBody(this, world.platforms);

    if (!wasGrounded && this.grounded) {
      this.helpless = false;
      if (this.state === 'air') {
        this.setState('landing');
        this.jumpsLeft = this.stats.doubleJumps;
        this.fastFalling = false;
        this.ledgeGrabs = 0;
        world.emit('land', this, this.x, this.y, this.impactVy, 0);
        this.data.behavior?.onLand?.(this, this.impactVy, world);
      } else if (this.state === 'attack') {
        this.jumpsLeft = this.stats.doubleJumps;
        this.fastFalling = false;
        this.ledgeGrabs = 0;
        this.onAttackLand(world);
      }
    } else if (wasGrounded && !this.grounded && GROUND_STATES.has(this.state) && this.state !== 'jumpsquat') {
      // walked off an edge
      this.coyote = COYOTE_FRAMES;
      this.setState('air');
    }
  }

  setState(next: FighterState): void {
    this.state = next;
    this.stateFrame = 0;
  }

  /** KO on the spot (stamina mode: out of hit points). */
  forceKo(world: World): void {
    if (this.state === 'ko') return;
    this.koX = this.x;
    this.koY = this.y - this.h / 2;
    this.koVx = this.vx;
    this.koVy = this.vy;
    this.releaseLedge();
    this.endMoveState();
    if (this.grabTarget >= 0) world.fighters[this.grabTarget]?.releaseGrab();
    if (this.grabbedBy >= 0) {
      const g = world.fighters[this.grabbedBy];
      if (g && g.state === 'holding') {
        g.grabTarget = -1;
        g.setState('idle');
      }
    }
    this.grabTarget = -1;
    this.grabbedBy = -1;
    this.heldBomb = false;
    this.state = 'ko';
    this.stateFrame = 0;
    world.emit('ko', this, this.x, this.y, 0, this.lastHitBy);
    if (this.lastHitBy >= 0 && this.lastHitBy !== this.id) world.fighters[this.lastHitBy]?.data.behavior?.onKill?.(world.fighters[this.lastHitBy], this, world);
  }

  private checkBlastZones(world: World): void {
    const b = world.blast;
    if (this.x < b.left || this.x > b.right || this.y - this.h > b.bottom || this.y < b.top) {
      this.koX = this.x;
      this.koY = this.y;
      this.koVx = this.vx;
      this.koVy = this.vy;
      this.releaseLedge();
      this.endMoveState();
      this.grabTarget = -1;
      this.grabbedBy = -1;
      this.state = 'ko';
      this.stateFrame = 0;
      this.heldBomb = false;
      world.emit('ko', this, this.x, this.y, Math.hypot(this.vx, this.vy), this.lastHitBy);
      if (this.lastHitBy >= 0 && this.lastHitBy !== this.id) world.fighters[this.lastHitBy]?.data.behavior?.onKill?.(world.fighters[this.lastHitBy], this, world);
    }
  }
}

const NEUTRAL: FighterInput = { stickX: 0, stickY: 0, held: 0, pressed: 0, released: 0 };
