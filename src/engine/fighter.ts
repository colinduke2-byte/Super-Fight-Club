import { Button, type FighterInput } from './buttons';
import { COYOTE_FRAMES } from './constants';
import { moveBody, type Body } from './collision';
import { InputBuffer } from './inputBuffer';
import { computeKnockback, hitstunFrames, launchVelocity, LAUNCH_DRAG, type LaunchVector } from './knockback';
import type { Ledge, Platform } from './platform';
import type { CharacterData, CharacterStats } from './types';
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
  | 'ko';

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
const LEDGE_MAX_HANG = 300;
const LEDGE_ACTION_DELAY = 8;
const LEDGE_BASE_INVULN = 60;
const LEDGE_INVULN_LOSS_PER_GRAB = 14;
const LEDGE_REGRAB_COOLDOWN = 30;
const LEDGE_CLIMB_FRAMES = 24;
const DROP_NUDGE = 3;
const STICK_DOWN = 0.7;
const STICK_CROUCH = 0.6;
const STICK_UP = -0.6;
const TURN_THRESHOLD = 0.2;

export interface HitParams {
  damage: number;
  base: number;
  scaling: number;
  /** Degrees; 0 = horizontal away from attacker, 90 = up. */
  angle: number;
  /** Direction the victim is sent: +1 right, -1 left. */
  direction: 1 | -1;
  moveWeight?: number;
}

const tmpLaunch: LaunchVector = { vx: 0, vy: 0 };

function approach(v: number, target: number, amount: number): number {
  if (v < target) return Math.min(target, v + amount);
  return Math.max(target, v - amount);
}

/**
 * Simulation-side fighter: movement physics + state machine. No rendering, no Phaser.
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

  // Combat-ish state
  damage = 0;
  hitstun = 0;
  techWindow = 0;
  techLock = 0;

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

  constructor(
    readonly id: number,
    readonly data: CharacterData,
  ) {
    this.stats = data.stats;
    this.hw = data.body.width / 2;
    this.h = data.body.height;
    this.fhw = data.body.footHalfWidth;
    this.jumpsLeft = this.stats.doubleJumps;
  }

  /** Place the fighter standing in the air/at spawn and reset all transient state. */
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
    this.techWindow = 0;
    this.techLock = 0;
    this.grabCooldown = 0;
    this.ledgeGrabs = 0;
    this.releaseLedge();
    this.invuln = 90;
    this.buffer.clear();
    this.snapped = true;
  }

  /** Animation name for the view layer. */
  get anim(): string {
    switch (this.state) {
      case 'idle':
        return 'idle';
      case 'run':
        return 'run';
      case 'crouch':
      case 'jumpsquat':
      case 'landing':
      case 'tech':
        return 'crouch';
      case 'air':
        return this.vy < 0 ? 'jump' : 'fall';
      case 'ledge':
      case 'ledgeClimb':
        return 'ledge';
      case 'hitstun':
        return 'hurt';
      case 'downed':
        return 'down';
      case 'ko':
        return 'ko';
    }
  }

  get isAirborne(): boolean {
    return !this.grounded && this.state !== 'ledge' && this.state !== 'ledgeClimb';
  }

  // -------------------------------------------------------------------------------------------
  // Hit application (the full hitbox system arrives with the combat milestone; this is the
  // knockback application layer it will call).
  // -------------------------------------------------------------------------------------------
  receiveHit(hit: HitParams, world: World): void {
    if (this.state === 'ko') return;
    this.damage += hit.damage;
    const kb = computeKnockback({
      base: hit.base,
      scaling: hit.scaling,
      damagePercent: this.damage,
      moveWeight: hit.moveWeight,
      targetWeight: this.stats.weight,
    });
    launchVelocity(kb, hit.angle, hit.direction, tmpLaunch);
    this.launch(tmpLaunch.vx, tmpLaunch.vy, hitstunFrames(kb));
    world.emit('hit', this, this.x, this.y - this.h / 2, kb);
  }

  launch(vx: number, vy: number, hitstun: number): void {
    this.releaseLedge();
    this.state = 'hitstun';
    this.stateFrame = 0;
    this.hitstun = Math.max(1, hitstun);
    this.vx = vx;
    this.vy = vy;
    this.techWindow = 0;
    this.techLock = 0;
    this.fastFalling = false;
    this.ledgeGrabs = 0;
    if (vy < 0) {
      this.grounded = false;
      this.groundPlat = null;
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

    // carry with a moving platform before anything else
    if (this.grounded && this.groundPlat && this.groundPlat.moving) {
      this.x += this.groundPlat.dx;
      this.y = this.groundPlat.top;
    }
    this.startBottom = this.y;

    this.buffer.advance();
    this.buffer.record(inp.pressed);
    this.stateFrame++;
    if (this.invuln > 0) this.invuln--;
    if (this.grabCooldown > 0) this.grabCooldown--;
    if (this.techWindow > 0) this.techWindow--;
    if (this.techLock > 0) this.techLock--;
    if (this.coyote > 0) this.coyote--;

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
      case 'hitstun':
        this.hitstunLogic(inp, world);
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

  // ---- ground ---------------------------------------------------------------------------------
  private groundLogic(inp: FighterInput, world: World): void {
    const s = this.stats;
    const canAct = this.state === 'idle' || this.state === 'run' || this.state === 'crouch';

    this.coyote = COYOTE_FRAMES;
    this.jumpsLeft = s.doubleJumps;
    this.fastFalling = false;
    this.ledgeGrabs = 0;

    let target = 0;
    if (this.state === 'landing' && this.stateFrame >= LANDING_FRAMES) this.setState('idle');
    if (this.state === 'downed' && this.stateFrame >= DOWNED_FRAMES) {
      this.setState('idle');
      this.invuln = Math.max(this.invuln, 10);
    }
    if (this.state === 'tech' && this.stateFrame >= TECH_GROUND_FRAMES) this.setState('idle');

    if (this.state === 'jumpsquat') {
      target = inp.stickX * s.runSpeed;
      if (this.stateFrame >= s.jumpsquatFrames) {
        // full hop if the jump button is still down at the end of jumpsquat, otherwise short hop
        this.takeoff((inp.held & Button.Jump) !== 0 ? s.jumpHeight : s.shortHopHeight, world);
        this.airLogic(inp, world, true);
        return;
      }
    } else if (canAct) {
      if (this.buffer.has(Button.Jump)) {
        this.buffer.consume(Button.Jump);
        if (inp.stickY > STICK_CROUCH && this.groundPlat && this.groundPlat.kind === 'pass') {
          this.dropThrough();
          this.airLogic(inp, world, true);
          return;
        }
        this.setState('jumpsquat');
        target = inp.stickX * s.runSpeed;
      } else if (inp.stickY > STICK_CROUCH) {
        if (this.state !== 'crouch') this.setState('crouch');
        target = 0;
      } else {
        target = inp.stickX * s.runSpeed;
        if (Math.abs(inp.stickX) > TURN_THRESHOLD) this.facing = inp.stickX > 0 ? 1 : -1;
        const next = Math.abs(this.vx) > 0.3 || Math.abs(target) > 0.3 ? 'run' : 'idle';
        if (this.state !== next) this.setState(next);
      }
    }

    const braking = target === 0 || (this.vx !== 0 && Math.sign(target) !== Math.sign(this.vx)) || Math.abs(target) < Math.abs(this.vx);
    const rate = braking ? s.groundFriction * (this.state === 'crouch' ? 2 : 1) : s.groundAccel;
    this.vx = approach(this.vx, target, rate);
    if (Math.abs(this.vx) < 0.01) this.vx = 0;

    this.integrate(world);
  }

  private takeoff(height: number, world: World): void {
    this.vy = -Math.sqrt(2 * this.stats.gravity * height);
    this.grounded = false;
    this.groundPlat = null;
    this.coyote = 0;
    this.setState('air');
    world.emit('jump', this, this.x, this.y, 0);
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

  // ---- air ------------------------------------------------------------------------------------
  private airLogic(inp: FighterInput, world: World, justLeftGround = false): void {
    const s = this.stats;

    if (this.buffer.has(Button.Jump)) {
      if (this.coyote > 0 && !justLeftGround) {
        // walked off a ledge: still allowed a ground jump
        this.buffer.consume(Button.Jump);
        this.vy = -Math.sqrt(2 * s.gravity * ((inp.held & Button.Jump) !== 0 ? s.jumpHeight : s.shortHopHeight));
        this.coyote = 0;
        world.emit('jump', this, this.x, this.y, 0);
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
        world.emit('doubleJump', this, this.x, this.y, 0);
      }
    }

    // fast-fall: a fresh downward flick once the fighter is no longer rising
    if (this.vy >= 0 && !this.fastFalling && inp.stickY > STICK_DOWN && this.lastStickY <= STICK_DOWN) {
      this.fastFalling = true;
      this.vy = s.fastFallSpeed;
    }

    // gravity
    this.vy += s.gravity;
    const maxFall = this.fastFalling ? s.fastFallSpeed : s.fallSpeed;
    if (this.vy > maxFall) this.vy = maxFall;

    // air drift
    const target = inp.stickX * s.airSpeed;
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

    this.hitstun--;
    if (this.grounded) {
      this.vx = approach(this.vx, 0, HITSTUN_GROUND_FRICTION);
    } else {
      this.vy += s.gravity;
      if (this.vy > s.fastFallSpeed) this.vy = s.fastFallSpeed;
      this.vx = approach(this.vx, 0, LAUNCH_DRAG);
    }

    this.integrate(world);
    this.resolveImpacts(inp, world);

    if (this.state === 'hitstun' && this.hitstun <= 0) {
      if (this.grounded) this.setState('idle');
      else this.setState('air');
    }
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
          world.emit('bounce', this, this.x, this.y, this.impactVy);
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
        world.emit('bounce', this, this.x, this.y - this.h / 2, Math.abs(this.impactVx));
      }
      return;
    }

    if (this.hitCeil && Math.abs(this.impactVy) >= BOUNCE_MIN_SPEED) {
      if (this.techWindow > 0) {
        this.doTech(inp, world, 'ceiling');
      } else {
        this.vy = -this.impactVy * BOUNCE_FLOOR;
        world.emit('bounce', this, this.x, this.y - this.h, Math.abs(this.impactVy));
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
    world.emit('tech', this, this.x, this.y - this.h / 2, 0);
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

  private grabLedge(l: Ledge, world: World): void {
    this.ledge = l;
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
    world.emit('ledgeGrab', this, this.x, this.y, 0);
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

    if (this.buffer.consume(Button.Jump)) {
      this.releaseLedge();
      this.grabCooldown = LEDGE_REGRAB_COOLDOWN;
      this.vy = -Math.sqrt(2 * this.stats.gravity * this.stats.jumpHeight * 0.9);
      this.vx = (-l.side) * this.stats.airSpeed * 0.6;
      this.setState('air');
      world.emit('jump', this, this.x, this.y, 0);
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
      world.emit('land', this, this.x, this.y, 0);
    }
  }

  // ---- shared ---------------------------------------------------------------------------------
  private integrate(world: World): void {
    const wasGrounded = this.grounded;
    moveBody(this, world.platforms);

    if (!wasGrounded && this.grounded && this.state !== 'hitstun') {
      // touched down
      this.setState('landing');
      this.jumpsLeft = this.stats.doubleJumps;
      this.fastFalling = false;
      this.ledgeGrabs = 0;
      world.emit('land', this, this.x, this.y, this.impactVy);
    } else if (wasGrounded && !this.grounded && this.state !== 'hitstun' && this.state !== 'air') {
      // walked off an edge
      this.coyote = COYOTE_FRAMES;
      this.setState('air');
    }
  }

  private setState(next: FighterState): void {
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
      this.state = 'ko';
      this.stateFrame = 0;
      world.emit('ko', this, this.x, this.y, Math.hypot(this.vx, this.vy));
    }
  }
}
