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
const HITSTUN_GROUND_FRICTION = 0.35;
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
}

const tmpLaunch: LaunchVector = { vx: 0, vy: 0 };

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
  hitlag = 0;
  techWindow = 0;
  techLock = 0;
  lastHitBy = -1;
  /** Which hurt pose the view shows while in hitstun (set by the launch): light flinch / heavy / launched up / spiked down. */
  hurtKind: 'hurtL' | 'hurt' | 'hurtU' | 'hurtD' = 'hurt';
  /** Visual effect tag of the last clean hit taken (drives the hit-stop flash colour). */
  lastHitFx = '';
  /** Directional influence is applied once, on the first hitstun tick. */
  private diDone = false;

  // Attacking
  move: MoveDef | null = null;
  moveFrame = 0;
  chargeFrames = 0;
  private chargeButton = 0;
  private queuedNext = false;
  moveHit = false;
  /** Outgoing damage multiplier (character mechanics like Heat hook in here). */
  damageMult = 1;
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
  readonly status = { burn: 0, slow: 0, freeze: 0, stun: 0 };
  private slowMul = 1;
  private burnPerTick = 0.05;
  /** Active reflecting barrier (frames > 0), forward-relative box around the feet. */
  barrier = { frames: 0, x: 0, y: 0, w: 0, h: 0 };
  /** After a recovery move: no actions until landing / ledge / hit. */
  helpless = false;
  dashCd = 0;
  /** Team index for team battles (-1 = free-for-all). Teammates cannot hurt each other. */
  team = -1;
  /** Frames of the Overdrive item left (outgoing damage x1.3). */
  boostFrames = 0;
  /** One air dodge per airtime; wall jumps are limited too. */
  airDodgeUsed = false;
  wallJumps = 0;
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
    this.damageMult = 1;
    this.kbMult = 1;
    this.sizeMul = 1;
    this.superArmor = false;
    this.armorBonus = 0;
    this.res = { ...(this.data.resources ?? {}) };
    this.status.burn = this.status.slow = this.status.freeze = this.status.stun = 0;
    this.slowMul = 1;
    this.barrier.frames = 0;
    this.helpless = false;
    this.dashCd = 0;
    this.boostFrames = 0;
    this.airDodgeUsed = false;
    this.wallJumps = 0;
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
        return 'run';
      case 'crouch':
      case 'jumpsquat':
      case 'landing':
        return 'crouch';
      case 'tech':
        return pick('roll', 'crouch');
      case 'air':
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

  get shieldRadius(): number {
    return SHIELD_MIN_RADIUS + (SHIELD_MAX_RADIUS - SHIELD_MIN_RADIUS) * Math.max(0, this.shieldHP / SHIELD_MAX);
  }

  /** Armor threshold active right now, or -1 if none. */
  armorThreshold(): number {
    if (this.superArmor && this.state !== 'ko' && this.state !== 'hitstun' && this.state !== 'grabbed') return Infinity;
    const m = this.move;
    if (this.state !== 'attack' || !m || !m.armor) return -1;
    if (this.moveFrame < m.armor.from || this.moveFrame > m.armor.to) return -1;
    const t = (m.armor.threshold ?? Infinity) + this.armorBonus;
    return t > 0 ? t : -1; // a threshold of 0 means "armored only when a mechanic grants a bonus"
  }

  /** Damage multiplier from smash charge for the current move. */
  get chargeFrac(): number {
    const c = this.move?.charge;
    return c ? this.chargeFrames / c.max : 0;
  }

  get speedMul(): number {
    return this.status.slow > 0 ? this.slowMul : 1;
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
        this.status.burn = Math.max(this.status.burn, s.frames);
        this.burnPerTick = s.value ?? 0.05;
        break;
      case 'slow':
        this.status.slow = Math.max(this.status.slow, s.frames);
        this.slowMul = s.value ?? 0.6;
        break;
      case 'freeze':
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
    world.emit('status', this, this.x, this.y - this.h / 2, s.frames, ['burn', 'slow', 'freeze', 'stun'].indexOf(s.type));
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
    this.damage += hit.damage;
    if (hit.attackerId !== undefined) this.lastHitBy = hit.attackerId;
    if (hit.attackerId !== undefined && hit.attackerId !== this.id) world.damageDealt[hit.attackerId] = (world.damageDealt[hit.attackerId] ?? 0) + hit.damage;
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
      }) * (hit.kbMult ?? 1);

    let angle = hit.angle;
    if (angle === 361) angle = this.grounded && kb < 32 ? 0 : 44; // "Sakurai angle"
    launchVelocity(kb, angle, hit.direction, tmpLaunch);
    this.launch(tmpLaunch.vx, tmpLaunch.vy, Math.max(hitstunFrames(kb), hit.minHitstun ?? 0));
    // recoil: knocked sideways, the victim turns to face where the hit came from; near-vertical launches keep their facing
    if (Math.abs(tmpLaunch.vx) > 0.6 && Math.abs(tmpLaunch.vx) > Math.abs(tmpLaunch.vy) * 0.35) this.facing = tmpLaunch.vx > 0 ? -1 : 1;
    const speed = Math.hypot(tmpLaunch.vx, tmpLaunch.vy);
    if (tmpLaunch.vy < -Math.abs(tmpLaunch.vx) * 1.3 && speed > 3) this.hurtKind = 'hurtU';
    else if (tmpLaunch.vy > 1.5 && tmpLaunch.vy > Math.abs(tmpLaunch.vx) * 0.8) this.hurtKind = 'hurtD';
    else if (speed < 3.4 && this.hitstun < 18) this.hurtKind = 'hurtL';
    else this.hurtKind = 'hurt';
    this.hitlag = hit.hitlag ?? 0;
    this.gainMeterTaken(hit.damage, world);
    world.emit('hit', this, this.x, this.y - this.h / 2, kb, hit.damage);
    this.data.behavior?.onHitTaken?.(this, hit.attackerId !== undefined ? (world.fighters[hit.attackerId] ?? null) : null, hit.damage, world);
  }

  launch(vx: number, vy: number, hitstun: number): void {
    this.releaseLedge();
    this.endMoveState();
    this.grabTarget = -1;
    this.grabbedBy = -1;
    this.state = 'hitstun';
    this.stateFrame = 0;
    this.hitstun = Math.max(1, hitstun);
    this.vx = vx;
    this.vy = vy;
    this.techWindow = 0;
    this.techLock = 0;
    this.diDone = false;
    this.fastFalling = false;
    this.ledgeGrabs = 0;
    this.helpless = false;
    this.barrier.frames = 0;
    if (this.status.freeze > 0) this.status.freeze = 0; // being hit shatters ice
    this.status.stun = 0;
    if (vy < 0) {
      this.grounded = false;
      this.groundPlat = null;
    }
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
      this.trackSticks(inp);
      return;
    }

    // carry with a moving platform before anything else
    if (this.grounded && this.groundPlat && this.groundPlat.moving) {
      this.x += this.groundPlat.dx;
      this.y = this.groundPlat.top;
    }
    this.startBottom = this.y;

    this.tickStatus(world);
    this.stateFrame++;
    if (this.invuln > 0) this.invuln--;
    if (this.barrier.frames > 0) this.barrier.frames--;
    if (this.dashCd > 0) this.dashCd--;
    if (this.boostFrames > 0) this.boostFrames--;
    if (this.grabCooldown > 0) this.grabCooldown--;
    if (this.techWindow > 0) this.techWindow--;
    if (this.techLock > 0) this.techLock--;
    if (this.coyote > 0) this.coyote--;
    if (this.pummelCd > 0) this.pummelCd--;
    if (this.state !== 'shield' && this.state !== 'shieldstun' && this.shieldHP < SHIELD_MAX) this.shieldHP = Math.min(SHIELD_MAX, this.shieldHP + SHIELD_REGEN);
    this.trackSticks(inp);
    this.data.behavior?.onTick?.(this, world);

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
    this.ledgeGrabs = 0;
    this.airDodgeUsed = false;
    this.wallJumps = 0;

    let target = 0;
    if (this.state === 'landing' && this.stateFrame >= (this.lagFrames || LANDING_FRAMES)) {
      this.lagFrames = 0;
      this.setState('idle');
    }
    if (this.state === 'downed' && this.stateFrame >= 6 && this.buffer.consume(Button.Attack) && this.startMove('getupAttack', inp, world)) return;
    if (this.state === 'downed' && this.stateFrame >= DOWNED_FRAMES) {
      this.setState('idle');
      this.invuln = Math.max(this.invuln, 10);
    }
    if (this.state === 'tech' && this.stateFrame >= TECH_GROUND_FRAMES) this.setState('idle');

    if (this.state === 'jumpsquat') {
      target = inp.stickX * s.runSpeed * this.speedMul;
      if (this.stateFrame >= s.jumpsquatFrames) {
        // full hop if the jump button is still down at the end of jumpsquat, otherwise short hop
        this.takeoff((inp.held & Button.Jump) !== 0 ? s.jumpHeight : s.shortHopHeight, world);
        this.airLogic(inp, world, true);
        return;
      }
    } else if (this.state === 'idle' || this.state === 'run' || this.state === 'crouch') {
      if (this.tryStartAction(inp, world)) return;
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
        target = inp.stickX * s.runSpeed * this.speedMul;
        if (Math.abs(inp.stickX) > TURN_THRESHOLD) this.facing = inp.stickX > 0 ? 1 : -1;
        const next = Math.abs(this.vx) > 0.3 || Math.abs(target) > 0.3 ? 'run' : 'idle';
        if (this.state !== next) this.setState(next);
      }
    }
    void canAct;

    const braking = target === 0 || (this.vx !== 0 && Math.sign(target) !== Math.sign(this.vx)) || Math.abs(target) < Math.abs(this.vx);
    const rate = braking ? s.groundFriction * (this.state === 'crouch' ? 2 : 1) : s.groundAccel;
    this.vx = approach(this.vx, target, rate);
    if (Math.abs(this.vx) < 0.01) this.vx = 0;

    this.integrate(world);
  }

  /** Buffered attack / special / grab / shield inputs from a neutral grounded state. */
  private tryStartAction(inp: FighterInput, world: World): boolean {
    if ((inp.held & Button.Shield) !== 0 && this.shieldHP > 0) {
      this.setState('shield');
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
    if (!this.data.moves[id]) return false;
    this.buffer.consume(Button.Special);
    this.chargeButton = Button.Special; // chargeable specials hold on the Special button
    return this.startMove(id, inp, world);
  }

  private tryStartAttack(inp: FighterInput, world: World, grounded: boolean): boolean {
    const smashBtn = this.buffer.has(Button.Smash);
    const atkBtn = this.buffer.has(Button.Attack);
    if (!smashBtn && !atkBtn) return false;
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

  private takeoff(height: number, world: World): void {
    this.vy = -Math.sqrt(2 * this.stats.gravity * height);
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
    if (st.freeze > 0) st.freeze--;
    if (st.stun > 0) st.stun--;
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
      this.vx = approach(this.vx, 0, this.stats.groundFriction);
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
  startMove(id: string, inp: FighterInput | null, world: World): boolean {
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
    this.queuedNext = false;
    this.moveHit = false;
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

    // smash charge: hold on the charge frame while the button is down
    if (m.charge && this.moveFrame === m.charge.frame && this.chargeFrames < m.charge.max && (inp.held & this.chargeButton) !== 0) {
      this.chargeFrames++;
      this.attackPhysics(m, inp);
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

    this.attackPhysics(m, inp);
    this.integrateAttack(world);
    if (this.state !== 'attack') return;
    // recovery specials can catch the ledge mid-move
    if (!this.grounded && m.kind === 'special' && m.ledgeGrab !== false) this.tryLedgeGrab(inp, world);
    if (this.state !== 'attack') return;

    if (this.moveFrame >= moveTotal(m)) this.finishMove(world);
  }

  private attackPhysics(m: MoveDef, inp: FighterInput): void {
    const s = this.stats;
    if (this.grounded) {
      this.vx = approach(this.vx, 0, s.groundFriction * 0.7);
    } else {
      if (this.hover) this.vy = 0;
      else this.vy += s.gravity * (m.gravityScale ?? 1);
      if (this.vy > s.fallSpeed) this.vy = s.fallSpeed;
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
  }

  // ---- shield / dodge / stun ------------------------------------------------------------------
  private shieldLogic(inp: FighterInput, world: World): void {
    this.vx = approach(this.vx, 0, this.stats.groundFriction);
    if (this.state === 'shield') {
      this.shieldHP -= SHIELD_DECAY;
      if (this.shieldHP <= 0) {
        this.shieldHP = 0;
        this.shieldHit(0, true, 1, 0, world);
        return;
      }
      if ((inp.held & Button.Shield) === 0) {
        this.setState('idle');
        return;
      }
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
        world.emit('dodge', this, this.x, this.y, 0, 0);
        return;
      }
      if (this.flickX > 0) {
        this.rollDir = this.flickXDir > 0 ? 1 : -1;
        this.flickX = 0;
        this.setState('roll');
        world.emit('dodge', this, this.x, this.y, 0, 0);
        return;
      }
    } else if (this.stateFrame >= this.shieldStun) {
      this.setState((inp.held & Button.Shield) !== 0 ? 'shield' : 'idle');
    }
    this.integrate(world);
  }

  private airDodgeLogic(_inp: FighterInput, world: World): void {
    const t = this.stateFrame;
    if (t >= 3 && t <= 20) this.invuln = Math.max(this.invuln, 1);
    const k = t <= 16 ? 1 - t / 20 : 0;
    this.vx = this.airDodgeDx * AIRDODGE_SPEED * k;
    this.vy = this.airDodgeDy * AIRDODGE_SPEED * k;
    this.integrate(world);
    if (this.grounded) {
      this.lagFrames = 8;
      this.setState('landing');
      return;
    }
    if (t >= AIRDODGE_FRAMES) {
      this.setState('air');
      this.helpless = true; // like a special fall: no more actions until you land or grab a ledge
    }
  }

  private dodgeLogic(world: World): void {
    const spot = this.state === 'spotdodge';
    const total = spot ? SPOTDODGE_FRAMES : ROLL_FRAMES;
    const win = spot ? SPOTDODGE_INVULN : ROLL_INVULN;
    if (this.stateFrame >= win[0] && this.stateFrame <= win[1]) this.invuln = Math.max(this.invuln, 1);
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
    }

    // gravity
    if (this.hover) this.vy = 0;
    else this.vy += s.gravity;
    const maxFall = this.fastFalling ? s.fastFallSpeed : s.fallSpeed;
    if (this.vy > maxFall) this.vy = maxFall;

    // air drift
    const target = inp.stickX * s.airSpeed * this.speedMul * (this.helpless ? HELPLESS_DRIFT : 1);
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
    this.hitstun--;
    if (this.grounded) {
      this.vx = approach(this.vx, 0, HITSTUN_GROUND_FRICTION);
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

  private resolveImpacts(inp: FighterInput, world: World): void {
    if (this.state !== 'hitstun') return;

    if (this.landed) {
      this.landed = false;
      if (this.impactVy >= BOUNCE_MIN_SPEED) {
        if (this.techWindow > 0) {
          this.doTech(inp, world, 'floor');
        } else {
          this.vy = -this.impactVy * BOUNCE_FLOOR;
          this.vx *= 0.8;
          this.grounded = false;
          this.groundPlat = null;
          world.emit('bounce', this, this.x, this.y, this.impactVy, 0);
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
      }
      return;
    }

    if (this.hitCeil && Math.abs(this.impactVy) >= BOUNCE_MIN_SPEED) {
      if (this.techWindow > 0) {
        this.doTech(inp, world, 'ceiling');
      } else {
        this.vy = -this.impactVy * BOUNCE_FLOOR;
        world.emit('bounce', this, this.x, this.y - this.h, Math.abs(this.impactVy), 0);
      }
    }
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
  }

  // ---- ledge ----------------------------------------------------------------------------------
  private tryLedgeGrab(inp: FighterInput, world: World): void {
    if (this.grabCooldown > 0 || this.vy < -1) return;
    for (let i = 0; i < world.ledges.length; i++) {
      const l = world.ledges[i];
      if (l.occupant !== -1 && l.occupant !== this.id) continue;
      const outside = (this.x - l.x) * l.side; // + when beyond the corner, away from the stage
      if (outside < -this.hw * 0.5 || outside > this.hw + 18) continue;
      const head = this.y - this.h - l.y;
      if (head < -10 || head > 24) continue;
      const towardStage = -l.side;
      if (this.facing !== towardStage && Math.sign(inp.stickX) !== towardStage) continue;
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
    l.occupant = this.id;
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
      this.climbFromX = this.x;
      this.climbFromY = this.y;
      this.invuln = Math.max(this.invuln, LEDGE_CLIMB_FRAMES + 2);
      this.setState('ledgeClimb');
    } else if (this.buffer.consume(Button.Jump)) {
      this.releaseLedge();
      this.grabCooldown = LEDGE_REGRAB_COOLDOWN;
      this.vy = -Math.sqrt(2 * this.stats.gravity * this.stats.jumpHeight * 0.9);
      this.vx = -l.side * this.stats.airSpeed * 0.6;
      this.setState('air');
      world.emit('jump', this, this.x, this.y, 0, 0);
    } else if (inp.stickY < STICK_UP || toward > 0.6) {
      this.climbFromX = this.x;
      this.climbFromY = this.y;
      this.invuln = Math.max(this.invuln, LEDGE_CLIMB_FRAMES + 2);
      this.setState('ledgeClimb');
    } else if (inp.stickY > STICK_DOWN || toward < -0.6) {
      this.dropFromLedge();
    }
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
    const t = Math.min(1, this.stateFrame / LEDGE_CLIMB_FRAMES);
    const tx = l.x - l.side * (this.hw + 2);
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
      world.emit('ko', this, this.x, this.y, Math.hypot(this.vx, this.vy), this.lastHitBy);
    }
  }
}

const NEUTRAL: FighterInput = { stickX: 0, stickY: 0, held: 0, pressed: 0, released: 0 };
