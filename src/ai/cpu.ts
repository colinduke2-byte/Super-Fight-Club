import { Button, type FighterInput } from '../engine/buttons';
import { hitboxRect, hurtRect } from '../engine/combat';
import type { Fighter } from '../engine/fighter';
import { hazardPhase } from '../engine/hazards';
import { hitboxEnd, hitboxStart } from '../engine/moves';
import type { Platform } from '../engine/platform';
import type { World } from '../engine/world';
import { applyHeld, clearInput, type Controller } from '../game/controllers';
import { moveTable, NORMAL_INPUTS, type AiMove } from './moveInfo';
import { aiFor, LEVELS, type CharacterAi, type CpuLevel, type LevelParams } from './profiles';
import { newEpisode, offstage, recoveryStep, type RecoveryEpisode, type RecoveryOut } from './recovery';
import { chooseTarget } from './targeting';

const CAN_ACT = new Set(['idle', 'run', 'crouch', 'dash', 'air']);
const SPECIAL_DIR: Record<string, [number, number]> = { neutralB: [0, 0], sideB: [1, 0], upB: [0, -1], downB: [0, 1] };

/** Deterministic PRNG (the CPU must not use Math.random so matches can be replayed from inputs). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One scripted button press: what to hold and where to point the stick, for a few frames. */
interface Plan {
  label: string;
  start: number;
  btn: number;
  sx: number;
  sy: number;
  pressFrames: number;
  /** After the press the stick turns to (sx2, sy2) for `stickFrames` (aimed specials like Blink Strike). */
  sx2: number;
  sy2: number;
  stickFrames: number;
  /** Frames to keep the button held for charging. */
  holdFrames: number;
  sawAttack: boolean;
}

const rA = [0, 0, 0, 0];
const rB = [0, 0, 0, 0];

type Mode = 'neutral' | 'recover' | 'edgeguard' | 'defend';

/**
 * CPU fighter: a state machine (neutral -> approach / attack / defend / recover / edge-guard) that produces the same
 * FighterInput a human would, so it can use every character with no special engine access. Difficulty (reaction time,
 * defence, tech, DI, recovery quality, edge-guarding, mistakes) comes from `LEVELS`; character knowledge (ranged
 * moves, setups, recovery, finishers) from `CHARACTER_AI`; reach / speed / damage of normals is read from frame data.
 */
export class CpuController implements Controller {
  readonly params: LevelParams;
  private readonly rnd: () => number;
  readonly bias: number[];
  private targetId = -1;
  private mode: Mode = 'neutral';
  private plan: Plan | null = null;
  private prevHeld = 0;
  private thinkLeft = 0;
  private threatFrames = 0;
  private shieldHold = 0;
  /** Consecutive ticks spent waiting to time a perfect shield (capped so a lingering threat cannot freeze the CPU). */
  private parryWait = 0;
  private episode: RecoveryEpisode | null = null;
  private readonly rec: RecoveryOut = { sx: 0, sy: 0, jump: false, special: false, steering: false };
  private cooldown: Record<string, number> = {};
  private diOn = false;
  private lastHitstunFrame = -1;
  private techTried = false;
  private techOn = false;
  private ledgeWait = 0;
  private holdPummels = 0;
  private mashToggle = false;
  private hopTarget = false;
  /** Frames of backing off left after a hit-and-run attack. */
  private retreat = 0;
  /** Frames since anybody took damage: a stalled mirror match makes the CPU stop zoning and close in. */
  private stall = 0;
  /** Showboating: frames until the CPU taunts after scoring a KO (-1 = none pending). */
  private tauntIn = -1;
  private wasKo: boolean[] = [];
  /** Decaying per-move usage counts (staleness). */
  private readonly useCount = new Float32Array(16);
  private lastDamageSum = 0;

  private sx = 0;
  private sy = 0;
  private held = 0;

  constructor(
    readonly level: CpuLevel,
    seed: number,
  ) {
    this.params = LEVELS[level];
    this.rnd = mulberry32(seed * 7919 + level * 104729);
    this.bias = [0, 1, 2, 3].map(() => (this.rnd() - 0.5) * 70);
  }

  get currentMode(): Mode {
    return this.mode;
  }
  get currentTarget(): number {
    return this.targetId;
  }

  update(self: Fighter, world: World, out: FighterInput): void {
    clearInput(out);
    this.sx = 0;
    this.sy = 0;
    this.held = 0;
    for (const k in this.cooldown) if (this.cooldown[k] > 0) this.cooldown[k]--;

    // scored a KO? sometimes celebrate with a taunt once it is safe (nobody close)
    world.fighters.forEach((f, i) => {
      const ko = f.state === 'ko';
      if (ko && !this.wasKo[i] && f.id !== self.id && f.lastHitBy === self.id && this.rnd() < 0.45) this.tauntIn = 40 + Math.floor(this.rnd() * 40);
      this.wasKo[i] = ko;
    });
    if (this.tauntIn > 0) this.tauntIn--;
    if (this.tauntIn === 0 && self.state === 'idle' && self.grounded && self.meter < (self.data.ultimate?.cost ?? 100)) {
      const near = world.fighters.some((f) => f.id !== self.id && f.state !== 'ko' && Math.abs(f.x - self.x) < 150 && Math.abs(f.y - self.y) < 100);
      this.tauntIn = -1;
      if (!near) {
        this.held = Button.Ultimate;
        applyHeld(out, this.held, this.prevHeld);
        this.prevHeld = this.held;
        return;
      }
    }

    if (self.state !== 'ko') {
      let sum = 0;
      for (const f of world.fighters) sum += f.damage;
      if (sum !== this.lastDamageSum) this.stall = 0;
      else this.stall++;
      this.lastDamageSum = sum;
      this.think(self, world);
    }

    // never flick backwards in the first frames of a special: that would B-reverse it away from the target
    if (self.state === 'attack' && self.move?.kind === 'special' && self.moveFrame <= 4 && this.sx * self.facing < 0) this.sx = 0;
    out.stickX = this.sx;
    out.stickY = this.sy;
    applyHeld(out, this.held, this.prevHeld);
    this.prevHeld = this.held;
  }

  // ---------------------------------------------------------------------------------------------
  private think(self: Fighter, world: World): void {
    const ai = aiFor(self.data.id);
    // target selection every few frames (with hysteresis)
    if (world.tick % 12 === 0 || this.targetId < 0 || world.fighters[this.targetId]?.state === 'ko') {
      this.targetId = chooseTarget(self, world, this.targetId, this.bias);
    }
    const tgt = this.targetId >= 0 ? world.fighters[this.targetId] : null;

    // involuntary / special states first
    switch (self.state) {
      case 'hitstun':
        this.hitstun(self, world);
        return;
      case 'grabbed':
        this.mashToggle = !this.mashToggle;
        this.held = this.mashToggle ? Button.Attack : 0;
        this.sx = this.mashToggle ? 1 : -1;
        return;
      case 'holding':
        this.holding(self, world, tgt);
        return;
      case 'ledge':
        this.onLedge(self, world, tgt);
        return;
      case 'shield':
      case 'shieldstun':
        this.shielding(self, world, tgt);
        return;
      case 'attack':
        this.duringAttack(self, world, tgt);
        return;
      case 'downed':
        // get-up attack when the target is standing right over us
        if (tgt && self.stateFrame > 8 && Math.abs(tgt.x - self.x) < 45 && this.params.smart && this.rnd() < 0.05) this.held |= Button.Attack;
        return;
      case 'tether':
      case 'stunned':
      case 'frozen':
      case 'shieldbreak':
      case 'spotdodge':
      case 'roll':
      case 'airdodge':
      case 'tech':
      case 'ledgeClimb':
      case 'jumpsquat':
      case 'landing':
        // jumpsquat: keep holding the planned jump button; landing / dodges: nothing to do
        if (self.state === 'jumpsquat' && this.hopTarget) this.held |= Button.Jump;
        if (self.state === 'jumpsquat' && tgt) this.sx = Math.sign(tgt.x - self.x);
        return;
      default:
        break;
    }
    this.hopTarget = false;
    this.techTried = false;

    // keep running an in-flight plan (button press frames)
    if (this.plan && this.runPlan(self, world)) return;

    // recovery has priority over everything when we are off the stage
    if (offstage(self, world)) {
      if (this.mode !== 'recover') {
        this.mode = 'recover';
        this.episode = newEpisode(world, this.params, this.rnd);
      }
      this.recover(self, world, ai);
      return;
    }
    this.mode = 'neutral';
    this.episode = null;

    if (!CAN_ACT.has(self.state)) return;

    // stage hazards
    if (this.avoidHazards(self, world)) return;

    // threats (reaction-delayed)
    if (this.defend(self, world, tgt, ai)) return;

    if (this.params.smart && this.chaseItem(self, world, tgt)) return;
    if (!tgt) return;
    // carrying a Shock Bomb: lob it once the target is in range (any attack would throw it anyway)
    if (self.heldBomb && self.grounded) {
      const dx = tgt.x - self.x;
      const dy = tgt.y - self.y;
      if (Math.abs(dx) < 150 && Math.abs(dy) < 60 && Math.abs(dx) > 30) {
        this.sx = Math.sign(dx);
        this.held = Button.Attack;
        return;
      }
      if (Math.abs(dx) <= 40 && dy < -50) {
        this.sy = -1;
        this.held = Button.Attack;
        return;
      }
    }
    this.offense(self, world, tgt, ai);
  }

  // ---- plans -----------------------------------------------------------------------------------
  private startPlan(world: World, label: string, btn: number, sx: number, sy: number, o: Partial<Plan> = {}): void {
    this.plan = { label, start: world.tick, btn, sx, sy, pressFrames: 2, sx2: sx, sy2: sy, stickFrames: 0, holdFrames: 0, sawAttack: false, ...o };
  }

  /** Apply the active plan for this frame. Returns true if it consumed the frame. */
  private runPlan(self: Fighter, world: World): boolean {
    const p = this.plan!;
    const t = world.tick - p.start;
    if (self.state === 'attack') p.sawAttack = true;
    const holdLen = Math.max(p.pressFrames, p.holdFrames);
    const done = (p.sawAttack && self.state !== 'attack') || t > holdLen + 14;
    if (done) {
      this.plan = null;
      return false;
    }
    if (t < p.pressFrames) {
      this.held |= p.btn;
      this.sx = p.sx;
      this.sy = p.sy;
    } else {
      if (t < p.holdFrames) this.held |= p.btn;
      if (t < p.pressFrames + p.stickFrames) {
        this.sx = p.sx2;
        this.sy = p.sy2;
      }
    }
    return true;
  }

  private duringAttack(self: Fighter, world: World, tgt: Fighter | null): void {
    const p = this.plan;
    const m = self.move;
    if (p) this.runPlan(self, world);
    if (!m) return;
    // jab chain: press again while the next hit is available and the first one connected
    if (m.next && self.moveFrame >= m.next.from - 2 && self.moveFrame <= m.next.to && tgt && (self.moveHit || this.rnd() < 0.15)) {
      const follow = this.params.smart || this.rnd() < 0.5;
      if (follow && world.tick % 3 === 0) this.held |= Button.Attack;
    }
    // hit-confirm cancels: after connecting, route into the next move (combos)
    if (m.cancels && self.moveHit && this.params.smart && tgt && this.rnd() < 0.25 + 0.5 * this.params.punish) this.cancelInput(self, m, tgt);
    // drift toward the target during aerials; recovery specials steer toward the ledge
    if (self.state === 'attack' && !self.grounded && tgt && m.kind === 'aerial') {
      this.sx = Math.sign(tgt.x - self.x) * 0.6;
      // fast-fall the aerial onto a grounded target (over the stage only): lands sooner, so the follow-up comes faster
      const main = this.mainPlatform(world);
      if (this.params.smart && self.vy > 0 && !self.fastFalling && tgt.grounded && tgt.y > self.y && self.x > main.x && self.x < main.right) this.sy = 1;
    }
    if (this.mode === 'recover' && this.episode) {
      recoveryStep(self, world, aiFor(self.data.id), this.episode, this.rec);
      if (this.rec.steering) {
        this.sx = this.rec.sx;
        this.sy = this.rec.sy;
      }
    }
  }

  /** Press the input of a random eligible cancel route (see MoveCancel). */
  private cancelInput(self: Fighter, m: NonNullable<Fighter['move']>, tgt: Fighter): void {
    let pick = -1;
    let n = 0;
    const cs = m.cancels!;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (self.moveFrame < c.from || (c.to !== undefined && self.moveFrame > c.to)) continue;
      if (c.air !== undefined && c.air !== !self.grounded) continue;
      if (c.into === '@jump' && !(tgt.y < self.y - 20)) continue;
      if (Math.abs(tgt.x - self.x) > 140) continue;
      if (this.rnd() < 1 / ++n) pick = i; // reservoir pick
    }
    if (pick < 0) return;
    const c = cs[pick];
    this.held |= c.button === 'attack' ? Button.Attack : c.button === 'special' ? Button.Special : c.button === 'smash' ? Button.Smash : c.button === 'grab' ? Button.Grab : Button.Jump;
    const mag = c.button === 'attack' ? 0.6 : 0.9; // a half-pressed stick on Attack is a tilt, not a smash flick
    const toward = tgt.x >= self.x ? 1 : -1;
    switch (c.dir) {
      case 'forward':
        this.sx = self.facing * mag;
        break;
      case 'back':
        this.sx = -self.facing * mag;
        break;
      case 'side':
        this.sx = toward * Math.max(0.8, mag);
        break;
      case 'up':
        this.sy = -mag;
        break;
      case 'down':
        this.sy = mag;
        break;
      default:
        break;
    }
  }

  // ---- movement helpers ------------------------------------------------------------------------
  private mainPlatform(world: World): Platform {
    let best = world.platforms[0];
    for (const p of world.platforms) if (p.kind === 'solid' && p.w > (best.kind === 'solid' ? best.w : 0)) best = p;
    return best;
  }

  /** Never run off the platform we stand on unless dropping is intended. */
  private clampEdge(self: Fighter): void {
    const pl = self.groundPlat;
    if (!pl || !self.grounded || this.sx === 0) return;
    // leave room to brake: a fast runner / dasher needs a few frames to stop
    const margin = 10 + Math.abs(self.vx) * 7;
    if (this.sx > 0 && self.x > pl.right - margin) this.sx = 0;
    else if (this.sx < 0 && self.x < pl.x + margin) this.sx = 0;
  }

  /** True when the fighter's current ground speed would carry it off its platform within ~14 frames. */
  private slidingOffEdge(self: Fighter): boolean {
    const pl = self.groundPlat;
    if (!pl || !self.grounded) return false;
    const reach = Math.abs(self.vx) * 14;
    return (self.vx > 1 && pl.right - self.x < reach) || (self.vx < -1 && self.x - pl.x < reach);
  }

  // ---- recovery --------------------------------------------------------------------------------
  private recover(self: Fighter, world: World, ai: CharacterAi): void {
    const ep = this.episode!;
    recoveryStep(self, world, ai, ep, this.rec);
    this.sx = this.rec.sx;
    this.sy = this.rec.sy;
    if (this.rec.jump) {
      this.held |= Button.Jump;
      ep.jumpDelay = 0;
    }
    if (this.rec.special) {
      this.held |= Button.Special;
      ep.specialPressed = true;
      // keep the plan machinery out of it: the special press is one frame, steering continues in duringAttack
    }
    // a failed / wasted special (no longer attacking, still offstage) may be retried after the move ends
    if (ep.specialPressed && self.state === 'air' && !self.helpless && self.jumpsLeft === 0 && world.tick - ep.startTick > 60) ep.specialPressed = false;
  }

  // ---- hazards ---------------------------------------------------------------------------------
  private avoidHazards(self: Fighter, world: World): boolean {
    const hs = world.stage.hazards;
    if (!hs || !self.grounded || this.rnd() < this.params.mistakes * 0.3) return false;
    for (const h of hs) {
      const ph = hazardPhase(h, world.tick);
      if (ph === 'idle') continue;
      const half = h.w / 2 + 16;
      if (Math.abs(self.x - h.x) < half) {
        // step out of the column toward the nearer side (and away from the edge)
        const dir = self.x >= h.x ? 1 : -1;
        this.sx = dir;
        this.clampEdge(self);
        if (this.sx === 0) this.sx = -dir; // cornered: go the other way
        return true;
      }
    }
    return false;
  }

  // ---- defence ---------------------------------------------------------------------------------
  private readonly threat = { eta: 0, grab: false, proj: false, fromX: 0 };

  /** Fills `this.threat` and returns true when something is about to hit us (melee hitbox or projectile). */
  private detectThreat(self: Fighter, world: World): boolean {
    hurtRect(self, rB);
    const th = this.threat;
    let found = false;
    for (let i = 0; i < world.fighters.length; i++) {
      const o = world.fighters[i];
      if (o === self || o.state !== 'attack' || !o.move || world.allied(self.id, o.id)) continue;
      if (Math.abs(o.x - self.x) > 170 || Math.abs(o.y - self.y) > 140) continue;
      const hbs = o.move.hitboxes;
      for (let k = 0; k < hbs.length; k++) {
        const hb = hbs[k];
        if (hb.damage <= 0 && !hb.grab) continue;
        const a = hitboxStart(o.move, hb);
        if (o.moveFrame > hitboxEnd(o.move, hb) || a - o.moveFrame > 20) continue;
        hitboxRect(o, hb, rA);
        if (rA[0] - 8 < rB[0] + rB[2] && rA[0] + rA[2] + 8 > rB[0] && rA[1] - 8 < rB[1] + rB[3] && rA[1] + rA[3] + 8 > rB[1]) {
          const eta = Math.max(0, a - o.moveFrame);
          if (!found || eta < th.eta) {
            found = true;
            th.eta = eta;
            th.grab = !!hb.grab;
            th.proj = false;
            th.fromX = o.x;
          }
        }
      }
    }
    for (let i = 0; i < world.projectiles.length; i++) {
      const p = world.projectiles[i];
      if (!p.active || p.owner === self.id || !p.def || world.allied(self.id, p.owner)) continue;
      const dx = self.x - p.x;
      if (Math.abs(dx) > 150 || Math.sign(dx) !== Math.sign(p.vx) || Math.abs(p.vx) < 0.5) continue;
      const mid = self.y - self.h / 2;
      if (Math.abs(mid - p.y) > self.h / 2 + p.def.h / 2 + 8) continue;
      const eta = Math.max(0, Math.abs(dx) / Math.abs(p.vx) - 2);
      if (eta > 22) continue;
      if (!found || eta < th.eta) {
        found = true;
        th.eta = eta;
        th.grab = false;
        th.proj = true;
        th.fromX = p.x;
      }
    }
    return found;
  }

  private defend(self: Fighter, world: World, tgt: Fighter | null, ai: CharacterAi): boolean {
    if (!this.detectThreat(self, world)) {
      this.threatFrames = 0;
      return false;
    }
    const th = this.threat;
    this.threatFrames++;
    if (this.threatFrames < this.params.reaction) return false;
    if (th.eta > 12 && !th.proj) return false;
    if (this.rnd() > this.params.defend + 0.0) {
      // missed it: fall through to normal behaviour, but do not roll again every frame
      this.threatFrames = -30;
      return false;
    }
    const away = th.fromX > self.x ? -1 : 1;
    if (!self.grounded) {
      // in the air: air dodge a close hit, else counter with an aerial if smart, else drift away
      if (this.params.smart && !self.airDodgeUsed && !self.helpless && th.eta <= 6 && this.rnd() < 0.7) {
        this.held |= Button.Shield;
        return true;
      }
      if (this.params.smart && tgt && this.tryAerial(self, world, tgt, 1.0)) return true;
      this.sx = away;
      return true;
    }
    // reflect / barrier special against projectiles
    if (th.proj && ai.defensive && this.params.smart && !this.cooldownBusy('def', 40)) {
      const [dx, dy] = SPECIAL_DIR[ai.defensive] ?? [0, 0];
      this.startPlan(world, 'defensive', Button.Special, dx, dy, { holdFrames: ai.holds[ai.defensive] ?? 0 });
      this.runPlan(self, world);
      return true;
    }
    // fighters with an invulnerable dash (Vex) slip out of attacks instead of shielding them: the flick needs the stick to
    // go from neutral to full in one frame, hence the one-frame neutral press of the plan
    const dash = self.data.dash;
    const runOut = dash && self.groundPlat ? dash.speed * dash.frames * 0.9 : 0;
    const roomAway = self.groundPlat ? (away > 0 ? self.groundPlat.right - self.x : self.x - self.groundPlat.x) : 0;
    if (this.params.smart && dash && self.dashCd === 0 && th.eta >= 1 && th.eta <= 9 && roomAway > runOut + 12 && this.rnd() < 0.85) {
      this.startPlan(world, 'dash', 0, 0, 0, { pressFrames: 1, sx2: away, sy2: 0, stickFrames: 3 });
      this.runPlan(self, world);
      return true;
    }
    if (th.grab && this.params.smart) {
      // shields lose to grabs: jump out of the way
      this.held |= Button.Jump;
      this.sx = away;
      return true;
    }
    if (th.proj && this.params.smart && this.rnd() < 0.5) {
      this.held |= Button.Jump; // hop over it
      this.sx = -away;
      return true;
    }
    // sharp CPUs time the shield so it comes up just before the hit (a perfect shield) instead of raising it early
    if (this.params.smart && this.params.defend >= 0.9 && !th.proj && th.eta > 4 && th.eta <= 12 && self.shieldCooldown === 0 && this.parryWait < 6 && this.rnd() < 0.8) {
      this.parryWait++;
      return true;
    }
    this.parryWait = 0;
    this.held |= Button.Shield;
    this.shieldHold = 8;
    return true;
  }

  private cooldownBusy(key: string, frames: number): boolean {
    if ((this.cooldown[key] ?? 0) > 0) return true;
    this.cooldown[key] = frames;
    return false;
  }

  private shielding(self: Fighter, world: World, tgt: Fighter | null): void {
    const th = this.detectThreat(self, world) ? this.threat : null;
    if (th) this.shieldHold = Math.max(this.shieldHold, 6);
    this.shieldHold--;
    // grab out of shield when the target is right there and its move is spent (or it is shielding too)
    if (tgt && this.params.smart && !th && self.state === 'shield' && Math.hypot(tgt.x - self.x, tgt.y - self.y) < 40 && this.rnd() < this.params.punish * 0.3) {
      this.held |= Button.Grab | Button.Shield;
      this.facingFix(self, tgt);
      return;
    }
    // dodge flick when the hit is about to land and the CPU is sharp
    if (th && !th.proj && th.eta <= 4 && self.state === 'shield' && this.params.smart && this.rnd() < 0.35) {
      this.held |= Button.Shield;
      if (th.grab) this.sx = th.fromX > self.x ? -1 : 1; // roll away from grabs
      else this.sy = 1; // spot dodge
      return;
    }
    if (this.shieldHold > 0 || self.state === 'shieldstun') this.held |= Button.Shield;
  }

  private facingFix(self: Fighter, tgt: Fighter): void {
    const want = tgt.x >= self.x ? 1 : -1;
    if (self.facing !== want && self.state !== 'shield') this.sx = want;
  }

  // ---- involuntary states ----------------------------------------------------------------------
  private hitstun(self: Fighter, world: World): void {
    if (self.stateFrame <= this.lastHitstunFrame) this.techTried = false; // new hit
    this.lastHitstunFrame = self.stateFrame;
    if (self.stateFrame <= 1) {
      this.diOn = this.rnd() < this.params.di;
      this.techOn = this.rnd() < this.params.tech; // one decision per hit
    }
    if (this.diOn) {
      const center = this.mainPlatform(world);
      // bend the launch toward the stage centre (applied once when the hitlag ends, see Fighter.applyDirectionalInfluence)
      const dx = center.x + center.w / 2 - self.x;
      const dy = center.y - 40 - self.y;
      const len = Math.hypot(dx, dy) || 1;
      this.sx = (dx / len) * 0.95;
      this.sy = (dy / len) * 0.95;
    }
    // combo breaker: a sharp CPU caught in a long combo with enough meter bursts out
    if (this.params.smart && self.comboHits >= 5 && self.meter >= 50 && this.rnd() < 0.06 * this.params.punish) this.held |= Button.Ultimate;
    // tech: press shield just before slamming into a floor, wall or ceiling (a missed tech bounces and can splat)
    if (!this.techTried && !self.grounded && self.techLock === 0 && this.techOn) {
      const hw = self.hw;
      for (const pl of world.platforms) {
        let soon = false;
        if (self.vy > 1 && self.x >= pl.x - 4 && self.x <= pl.right + 4) {
          const gap = pl.top - self.y;
          soon = gap >= -2 && gap <= self.vy * 3 + 4;
        }
        if (!soon && pl.kind === 'solid' && Math.abs(self.vx) >= 3 && self.y > pl.top + 2 && self.y - self.h < pl.top + pl.h) {
          const gap = self.vx > 0 ? pl.x - (self.x + hw) : self.x - hw - pl.right;
          soon = gap >= -2 && gap <= Math.abs(self.vx) * 3 + 4;
        }
        if (!soon && pl.kind === 'solid' && self.vy < -3 && self.x >= pl.x && self.x <= pl.right) {
          const gap = self.y - self.h - (pl.top + pl.h);
          soon = gap >= -2 && gap <= -self.vy * 3 + 4;
        }
        if (soon) {
          this.held |= Button.Shield;
          this.techTried = true;
          break;
        }
      }
    }
  }

  private holding(self: Fighter, world: World, tgt: Fighter | null): void {
    const victim = self.grabTarget >= 0 ? world.fighters[self.grabTarget] : tgt;
    if (!victim) return;
    const wantPummels = this.params.smart ? 2 : 0;
    if (this.holdPummels < wantPummels && world.tick % 16 === 0) {
      this.holdPummels++;
      this.held |= Button.Attack;
      return;
    }
    if (self.holdTimer > 30 && this.holdPummels < wantPummels) return;
    // throw: toward the nearer blast zone when the victim is hurt, else a forward throw (or down throw for follow-ups)
    const b = world.blast;
    const toRight = b.right - victim.x < victim.x - b.left;
    const fwd = self.facing;
    if (victim.damage >= 110 && victim.y > -40) {
      this.sy = -1; // up throw kills from the top
    } else if (victim.damage >= 70) {
      this.sx = toRight ? 1 : -1;
    } else {
      this.sy = this.rnd() < 0.5 ? 1 : 0;
      this.sx = this.sy === 0 ? fwd : 0;
    }
    this.holdPummels = 0;
  }

  private onLedge(self: Fighter, world: World, tgt: Fighter | null): void {
    this.ledgeWait++;
    const l = self.ledge;
    if (!l) return;
    const wait = this.params.smart ? 18 + Math.floor(this.rnd() * 20) : 40 + Math.floor(this.rnd() * 60);
    if (self.ledgeFrames < wait) return;
    this.ledgeWait = 0;
    const r = this.rnd();
    if (this.params.smart && tgt && Math.abs(tgt.x - self.x) < 70 && r > 0.85) this.held |= Button.Attack; // ledge attack
    else if (r < 0.5 || !this.params.smart) this.sy = -1; // climb up
    else if (r < 0.8) this.held |= Button.Jump; // ledge jump
    else this.sx = -l.side; // toward the stage = climb
    void tgt;
    void world;
  }

  /** Grab a nearby item when nobody is on top of us. */
  private chaseItem(self: Fighter, world: World, tgt: Fighter | null): boolean {
    if (!self.grounded || world.config.itemRate === 0) return false;
    if (tgt && Math.abs(tgt.x - self.x) < 60 && Math.abs(tgt.y - self.y) < 50) return false;
    let best: { x: number; y: number } | null = null;
    let bd = 220;
    for (let i = 0; i < world.items.length; i++) {
      const it = world.items[i];
      if (!it.active || !it.resting) continue;
      const d = Math.abs(it.x - self.x);
      if (d < bd && Math.abs(it.y - self.y) < 70) {
        bd = d;
        best = it;
      }
    }
    if (!best) return false;
    this.sx = Math.abs(best.x - self.x) < 4 ? 0 : Math.sign(best.x - self.x);
    this.clampEdge(self);
    return true;
  }

  // ---- offence ---------------------------------------------------------------------------------
  private offense(self: Fighter, world: World, tgt: Fighter, ai: CharacterAi): void {
    const p = this.params;
    const dx = tgt.x - self.x;
    const dy = tgt.y - self.y;
    const dir = dx >= 0 ? 1 : -1;
    const dist = Math.abs(dx);
    const grounded = self.grounded;

    // chasing an opponent that is off the stage (or retreat to the safe side of the stage)
    if (offstage(tgt, world) && tgt.state !== 'ledge') {
      this.mode = 'edgeguard';
      if (p.edgeguard && this.edgeguard(self, world, tgt, ai)) return;
    } else if (this.mode === 'edgeguard') this.mode = 'neutral';

    // thinking cadence: only roll new attack decisions every few frames
    const decide = --this.thinkLeft <= 0;
    if (decide) {
      this.thinkLeft = p.thinkEvery;
      for (let k = 0; k < 16; k++) this.useCount[k] *= 0.93;
    }

    // face the target (ground) before committing to anything
    if (grounded && self.facing !== dir && dist > 4 && self.state !== 'dash') {
      this.sx = dir * 0.3; // a light tilt turns around without dashing
    }

    if (decide) {
      if (this.rnd() < p.mistakes) {
        // wasted action: hop, shield, or a random jab
        const r = this.rnd();
        if (grounded && r < 0.35) this.held |= Button.Jump;
        else if (grounded && r < 0.6) this.held |= Button.Attack;
        return;
      }
      if (this.chooseAction(self, world, tgt, ai, dist, dy, dir)) return;
    }

    this.moveTowards(self, world, tgt, ai, dist, dy, dir);
  }

  private reaches(self: Fighter, m: AiMove, tgt: Fighter): boolean {
    const f = self.facing;
    const lead = m.startup * 0.5;
    const tx = tgt.x + tgt.vx * lead;
    const ty = tgt.y + (tgt.grounded ? 0 : tgt.vy * lead);
    const half = tgt.hw * tgt.sizeMul + 2;
    const x0 = self.x + (f > 0 ? m.minX : -m.maxX);
    const x1 = self.x + (f > 0 ? m.maxX : -m.minX);
    const y0 = self.y + m.minY + (self.grounded ? 0 : self.vy * m.startup * 0.3);
    const y1 = self.y + m.maxY + (self.grounded ? 0 : self.vy * m.startup * 0.3);
    return tx + half > x0 && tx - half < x1 && ty > y0 && ty - tgt.hurtH < y1;
  }

  private score(m: AiMove, tgt: Fighter, ai: CharacterAi): number {
    const killZone = Math.min(1, Math.max(0, (tgt.damage - 50) / 90));
    const finisher = ai.finishers.includes(m.id) ? 1 : 0;
    let s = (m.dmg + m.power * 0.07 * killZone + finisher * killZone * 6) * (34 / (m.startup + 12));
    const lag = m.total - m.startup - m.active;
    const shielding = tgt.state === 'shield' || tgt.state === 'shieldstun';
    s -= lag * (shielding ? 0.12 : 0.03);
    if (m.charge) s *= 0.9;
    s /= 1 + 0.45 * this.useCount[m.index]; // staleness: recently used moves lose appeal, so the CPU mixes things up
    if (m.kind === 'grab') s = shielding ? 12 : 3 + (tgt.state === 'run' ? 0 : 1);
    return s + this.rnd() * 1.5;
  }

  /** Try an aerial that reaches the target now. */
  private tryAerial(self: Fighter, world: World, tgt: Fighter, chance: number): boolean {
    if (self.helpless || this.rnd() > chance) return false;
    const ai = aiFor(self.data.id);
    let best: AiMove | null = null;
    let bestScore = -Infinity;
    for (const m of moveTable(self.data)) {
      if (m.kind !== 'aerial' || !this.reaches(self, m, tgt)) continue;
      const s = this.score(m, tgt, ai);
      if (s > bestScore) {
        bestScore = s;
        best = m;
      }
    }
    if (!best) return false;
    const mi = NORMAL_INPUTS[best.id];
    this.startPlan(world, best.id, Button.Attack, self.facing * mi.fwd, mi.up);
    this.runPlan(self, world);
    return true;
  }

  private chooseAction(self: Fighter, world: World, tgt: Fighter, ai: CharacterAi, dist: number, dy: number, dir: number): boolean {
    const p = this.params;
    const table = moveTable(self.data);
    const grounded = self.grounded;
    const shielding = tgt.state === 'shield' || tgt.state === 'shieldstun';
    const tgtLag = tgt.state === 'attack' && tgt.move ? tgt.move.startup + tgt.move.active : -1;
    const tgtVulnerable = (tgt.state === 'attack' && tgt.moveFrame > tgtLag) || tgt.state === 'landing' || tgt.state === 'shieldbreak' || tgt.state === 'downed';

    // ultimate
    const ultCost = self.data.ultimate?.cost ?? 100;
    const transformed = self.data.transform ? (self.res[self.data.transform.resource] ?? 0) > 0 : false;
    if (self.meter >= ultCost && self.data.moves.ultimate && !self.helpless && !transformed && this.rnd() < 0.5) {
      const cin = self.data.moves.ultimate.hitboxes.some((h) => h.cinematic);
      if ((cin && dist < ai.ultimateRange && Math.abs(dy) < 40 && grounded) || (!cin && dist < ai.ultimateRange) || (!cin && self.damage > 90)) {
        this.facingFix(self, tgt);
        this.startPlan(world, 'ultimate', Button.Ultimate, 0, 0);
        this.runPlan(self, world);
        return true;
      }
    }

    // opponent is blocked: grab it (smart) or just keep hitting (easy)
    if (grounded && this.slidingOffEdge(self) && this.mode !== 'edgeguard') {
      this.sx = 0; // stop first: attacking out of a dash at the stage edge slides the CPU off the stage
      return true;
    }
    const candidates: AiMove[] = [];
    for (const m of table) {
      if (grounded === (m.kind === 'aerial')) continue; // aerials only in the air, ground moves only on the ground
      if (grounded && self.facing !== dir && m.kind !== 'smash') continue;
      if (this.reaches(self, m, tgt)) candidates.push(m);
    }

    if (p.smart && tgt.armorThreshold() > 0 && grounded && dist < 90 && candidates.every((m) => m.kind !== 'grab' && m.maxHit <= tgt.armorThreshold())) {
      // the target is mid armored windup and nothing we have breaks it: step out of range and punish the lag
      this.sx = -dir;
      this.clampEdge(self);
      return true;
    }
    if (candidates.length > 0) {
      // aggression gate (a CPU in range does not always swing)
      const punishing = tgtVulnerable && this.rnd() < p.punish;
      if (!punishing && this.stall < 300 && this.rnd() > p.aggression) return false;
      let best: AiMove | null = null;
      let bestScore = -Infinity;
      const armor = tgt.armorThreshold(); // an armored move cannot be interrupted by weak hits: do not poke into it
      for (const m of candidates) {
        if (ai.style === 'hitandrun' && !punishing && m.total > 34 && m.kind !== 'grab') continue;
        if (p.smart && armor > 0 && m.kind !== 'grab' && m.maxHit <= armor) continue;
        if (p.smart && shielding && m.kind !== 'grab' && candidates.some((c) => c.kind === 'grab')) continue;
        if (!p.smart && m.kind === 'grab' && this.rnd() < 0.7) continue;
        if (punishing && tgtLag > 0 && tgt.move && m.startup > tgt.move.startup + tgt.move.active + tgt.move.recovery - tgt.moveFrame + 2) continue;
        const s = this.score(m, tgt, ai);
        if (s > bestScore) {
          bestScore = s;
          best = m;
        }
      }
      if (best) {
        this.execMove(self, world, best, tgt, dir, shielding || tgtVulnerable);
        return true;
      }
    }

    // specials: ranged zoning, setups, gap closers
    if (grounded || p.smart) {
      if (this.trySpecials(self, world, tgt, ai, dist, dy, dir)) return true;
    }

    // go up to the opponent in the air with an aerial approach
    const main = this.mainPlatform(world);
    const tgtNearEdge = tgt.x > main.right - 30 || tgt.x < main.x + 30;
    if (grounded && p.smart && !tgtNearEdge && dist < 110 && dist > 40 && Math.abs(dy) < 70 && this.rnd() < 0.18 * p.aggression + 0.05 && !this.cooldownBusy('hop', 40)) {
      this.hopTarget = true;
      this.held |= Button.Jump;
      this.sx = dir;
      return true;
    }
    return false;
  }

  private execMove(self: Fighter, world: World, m: AiMove, tgt: Fighter, dir: number, safe: boolean): void {
    this.useCount[m.index]++;
    if (aiFor(self.data.id).style === 'hitandrun') this.retreat = Math.round(m.total * 0.5);
    const mi = NORMAL_INPUTS[m.id];
    const p = this.params;
    const btn = mi.button === 'smash' ? Button.Smash : mi.button === 'grab' ? Button.Grab : Button.Attack;
    let sx = 0;
    let sy = mi.up;
    if (m.kind === 'aerial') sx = self.facing * mi.fwd;
    else if (m.id === 'fsmash') sx = dir;
    else if (mi.fwd !== 0) sx = dir * mi.fwd;
    // charge smashes only when it is safe (vulnerable or shielding target) or the CPU is cautious-smart
    let hold = 0;
    if (m.charge) {
      hold = safe ? Math.round(10 + 40 * p.charge * this.rnd()) : Math.round(14 * p.charge * this.rnd());
    }
    if (m.kind === 'jab' && !p.smart) sy = 0;
    if (mi.tilt) {
      sx *= 0.6;
      sy *= 0.6;
    }
    this.startPlan(world, m.id, btn, sx, sy, { holdFrames: hold });
    void tgt;
    this.runPlan(self, world);
  }

  private trySpecials(self: Fighter, world: World, tgt: Fighter, ai: CharacterAi, dist: number, dy: number, dir: number): boolean {
    const p = this.params;
    const usable = (slot: string): boolean => {
      const m = self.data.moves[slot] ?? Object.values(self.data.moves).find((x) => x.id.startsWith(`${slot}_`));
      if (!m || ai.avoid.includes(slot)) return false;
      if (m.requires && (self.res[m.requires.key] ?? 0) < m.requires.min) return false;
      return true;
    };
    const fire = (slot: string, label: string, aim: boolean): void => {
      const [bx, by] = SPECIAL_DIR[slot] ?? [0, 0];
      this.facingFix(self, tgt);
      const sx = bx * dir;
      const o: Partial<Plan> = { holdFrames: ai.holds[slot] ?? 0 };
      if (aim) {
        // Blink Strike style: the direction is read a few frames into the move
        o.sx2 = dir;
        o.sy2 = 0;
        o.stickFrames = 10;
      }
      this.startPlan(world, label, Button.Special, sx, by, o);
      this.runPlan(self, world);
    };
    const stalled = this.stall > 420;
    // blow up our own pillars when a rival is standing next to one (and the pillar is in range of the stomp)
    if (ai.detonate && self.grounded && usable(ai.detonate.slot) && !this.cooldownBusy('det', 60)) {
      const r = ai.detonate.range;
      for (const d of world.deployables) {
        if (!d.active || d.owner !== self.id || !d.plat || Math.abs(d.x - self.x) > r) continue;
        if (Math.abs(tgt.x - d.x) < 46 && tgt.y > d.plat.top - 60 && tgt.y < d.y + 4 && this.rnd() < 0.6) {
          fire(ai.detonate.slot, 'det', false);
          return true;
        }
      }
    }
    if (Math.abs(dy) < 70 && !(stalled && dist < 260)) {
      for (const slot of ai.ranged) {
        if (dist > 90 && dist < 340 && usable(slot) && this.rnd() < 0.5 * p.aggression && !this.cooldownBusy(`r${slot}`, 40 + p.thinkEvery)) {
          fire(slot, slot, false);
          return true;
        }
      }
      for (const slot of ai.closers) {
        if (dist > 120 && dist < 320 && usable(slot) && p.smart && this.rnd() < 0.4 && !this.cooldownBusy(`c${slot}`, 90)) {
          fire(slot, slot, !!ai.aimed?.includes(slot));
          return true;
        }
      }
    }
    if (p.smart && self.grounded && !stalled) {
      for (const slot of ai.setups) {
        if (dist > 70 && dist < 300 && usable(slot) && this.rnd() < 0.25 && !this.cooldownBusy(`s${slot}`, 150)) {
          fire(slot, slot, false);
          return true;
        }
      }
    }
    return false;
  }

  private moveTowards(self: Fighter, world: World, tgt: Fighter, ai: CharacterAi, dist: number, dy: number, dir: number): void {
    const p = this.params;
    if (this.retreat > 0) {
      this.retreat--;
      if (self.grounded && dist < 90 && self.state !== 'attack') {
        this.sx = -dir;
        this.clampEdge(self);
        return;
      }
    }
    if (!self.grounded) {
      // air: drift toward the target, land on something; aerial when it reaches
      this.sx = dist > 20 ? dir : 0;
      // do not follow the target out past the stage edge unless deliberately edge-guarding
      // (unless the target is standing on another platform out there: then crossing the gap is the point)
      const acrossGap = tgt.grounded && !!tgt.groundPlat && tgt.groundPlat !== this.mainPlatform(world);
      if (this.mode !== 'edgeguard' && !acrossGap) {
        const main = this.mainPlatform(world);
        if ((this.sx > 0 && self.x > main.right - 6) || (this.sx < 0 && self.x < main.x + 6)) this.sx = 0;
      }
      if (p.smart && this.tryAerial(self, world, tgt, p.aggression)) return;
      if (self.vy > 0 && tgt.y > self.y + 30 && dist < 40 && p.smart) this.sy = 1; // fast fall onto them
      return;
    }
    const want = ai.spacing * (p.smart ? 1 : 0.7) * (this.stall > 420 ? 0.5 : 1);
    const upAbove = dy < -46;
    const downBelow = dy > 46;
    if (upAbove && dist < 120 && !this.cooldownBusy('jmp', 50)) {
      this.held |= Button.Jump;
      this.sx = dir;
      this.hopTarget = true;
      return;
    }
    if (downBelow && self.groundPlat && self.groundPlat.kind === 'pass' && dist < 140) {
      this.held |= Button.Jump;
      this.sy = 1; // drop through
      return;
    }
    if (dist > want) {
      // far: dash in; nearly in range: walk the last steps so the spacing is not overshot
      this.sx = dist - want > 50 ? dir : dir * 0.5;
    } else if (dist < want * 0.5 && p.smart && tgt.state !== 'shield' && this.rnd() < 0.3) {
      this.sx = -dir * 0.5; // too close: back off a step to regain spacing
    }
    const wanted = this.sx;
    if (!(downBelow && dist < 160)) this.clampEdge(self);
    // stopped at our edge while the target stands on another platform within jumping range: jump the gap
    if (wanted !== 0 && this.sx === 0 && tgt.grounded && tgt.groundPlat && tgt.groundPlat !== self.groundPlat && dist < 300 && Math.abs(dy) < 110 && self.jumpsLeft > 0 && !this.cooldownBusy('gap', 45)) {
      this.held |= Button.Jump;
      this.sx = wanted;
      this.hopTarget = true;
      return;
    }
    // a step or low wall in the way (Sunken Temple's centre tier): hop up onto it instead of running into it forever
    if (this.sx !== 0 && this.wallAhead(self, world, Math.sign(this.sx)) && !this.cooldownBusy('wallhop', 30)) {
      this.held |= Button.Jump;
      this.hopTarget = true;
    }
  }

  /** A solid platform face just ahead of a grounded fighter whose top is above its feet but low enough to jump onto. */
  private wallAhead(self: Fighter, world: World, dir: number): boolean {
    const half = self.hw;
    for (const p of world.platforms) {
      if (p.kind !== 'solid' || p === self.groundPlat) continue;
      const rise = self.y - p.y; // how far the top sits above our feet
      if (rise < 4 || rise > 90 || self.y > p.y + p.h + 2) continue;
      const gap = dir > 0 ? p.x - (self.x + half) : self.x - half - (p.x + p.w);
      if (gap >= -2 && gap < 16) return true;
    }
    return false;
  }

  /** Stand at the stage edge nearest the opponent and hit it as it tries to come back. */
  private edgeguard(self: Fighter, world: World, tgt: Fighter, ai: CharacterAi): boolean {
    const main = this.mainPlatform(world);
    const edgeX = tgt.x < main.x + main.w / 2 ? main.x + 14 : main.right - 14;
    const outDir = tgt.x < main.x + main.w / 2 ? -1 : 1;
    const dx = tgt.x - self.x;
    if (!self.grounded) return false;
    // ranged specials on a recovering opponent
    if (Math.abs(tgt.y - self.y) < 140 && Math.abs(dx) < 300) {
      for (const slot of ai.ranged) {
        if (Math.abs(dx) > 60 && !this.cooldownBusy(`e${slot}`, 50)) {
          this.facingFix(self, tgt);
          this.startPlan(world, slot, Button.Special, SPECIAL_DIR[slot]?.[0] === 0 ? 0 : Math.sign(dx), 0);
          this.runPlan(self, world);
          return true;
        }
      }
    }
    // hard CPUs leap out after them when they are healthy and still have a jump
    if (this.params.edgeguard && this.params === LEVELS[3] && self.jumpsLeft > 0 && self.damage < 90 && Math.abs(self.x - edgeX) < 24 && Math.abs(dx) < 120 && tgt.y > self.y - 20 && tgt.y < self.y + 160 && !this.cooldownBusy('leap', 120)) {
      this.hopTarget = true;
      this.held |= Button.Jump;
      this.sx = outDir;
      return true;
    }
    if (Math.abs(self.x - edgeX) > 10) {
      this.sx = Math.sign(edgeX - self.x);
    } else {
      this.facingFix(self, tgt);
    }
    return true;
  }
}
