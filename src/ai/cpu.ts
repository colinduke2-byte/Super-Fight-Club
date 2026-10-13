import { Button, type FighterInput } from '../engine/buttons';
import { hitboxRect, hurtRect } from '../engine/combat';
import type { Fighter } from '../engine/fighter';
import { avalancheX, hazardPhase } from '../engine/hazards';
import { hitboxEnd, hitboxStart, type MoveDef } from '../engine/moves';
import type { Platform } from '../engine/platform';
import type { HazardDef } from '../engine/types';
import type { World } from '../engine/world';
import { applyHeld, clearInput, type Controller } from '../game/controllers';
import { attackDecel, moveTable, NORMAL_INPUTS, travel, type AiMove } from './moveInfo';
import { aiFor, LEVELS, type CharacterAi, type CpuLevel, type LevelParams } from './profiles';
import { newEpisode, offstage, recoveryStep, type RecoveryEpisode, type RecoveryOut } from './recovery';
import { chooseTarget } from './targeting';

/** Default distance band for gap-closing specials. */
const CLOSER_RANGE: [number, number] = [120, 320];
/** Frames between two shots of the same projectile normal. */
const SHOT_GAP = 120;
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
  /** Press this button at frame `tailAt` of the plan (Shield to bank a charge). */
  tail?: number;
  tailAt?: number;
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
  /** Tick from which each projectile normal (rocket, mortar) may be fired again: shots are pokes, not a stream. */
  private readonly shotReady = new Int32Array(16);
  private lastDamageSum = 0;
  /** The target was punishable last frame (so an opening triggers one immediate decision, not one per frame). */
  private sawOpening = false;
  /** Stick direction currently held to steer a remote projectile. */
  private steerY = 0;
  /** Platform we are jumping across a gap to, and until when that attempt counts (then recovery takes over). */
  private cross: Platform | null = null;
  private crossUntil = 0;

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
    for (let i = 0; i < world.fighters.length; i++) {
      const f = world.fighters[i];
      const ko = f.state === 'ko';
      if (ko && !this.wasKo[i] && f.id !== self.id && f.lastHitBy === self.id && this.rnd() < 0.45) this.tauntIn = 40 + Math.floor(this.rnd() * 40);
      this.wasKo[i] = ko;
    }
    if (this.tauntIn > 0) this.tauntIn--;
    if (this.tauntIn === 0 && self.state === 'idle' && self.grounded && self.meter < (self.data.ultimate?.cost ?? 100)) {
      let near = false;
      for (const f of world.fighters) if (f.id !== self.id && f.state !== 'ko' && Math.abs(f.x - self.x) < 150 && Math.abs(f.y - self.y) < 100) near = true;
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

    // keep running an in-flight plan (button press frames); a stage hazard about to go off where we stand comes first
    // (the plan's move has not started yet, so dropping it costs nothing)
    if (this.plan && CAN_ACT.has(self.state) && !offstage(self, world) && this.avoidHazards(self, world)) {
      this.plan = null;
      return;
    }
    if (this.plan && this.runPlan(self, world)) return;

    // mid-jump across a gap to the target's platform (Skyhold's islands): keep going while it can still be reached
    if (this.cross && (world.tick > this.crossUntil || self.grounded || self.y > this.cross.top + 6 || self.helpless)) this.cross = null;
    if (this.cross && self.state === 'air') {
      this.crossGap(self, this.cross);
      return;
    }
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
      if (p.tail && t === p.tailAt) this.held |= p.tail;
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
    if (tgt && m.kind === 'special' && this.mode !== 'recover') this.steerShot(self, world, tgt, m.id);
    if (this.mode === 'recover' && this.episode) {
      recoveryStep(self, world, aiFor(self.data.id), this.episode, this.rec);
      if (this.rec.steering) {
        this.sx = this.rec.sx;
        this.sy = this.rec.sy;
      }
    }
  }

  /**
   * Fly a stick-steered projectile (Havoc's Remote Missile) at the target while its move runs: up / down turns it toward the
   * target's middle; once it has flown past, let go of the button so the move ends and the CPU can act again.
   */
  private steerShot(self: Fighter, world: World, tgt: Fighter, moveId: string): void {
    for (let i = 0; i < world.projectiles.length; i++) {
      const p = world.projectiles[i];
      if (!p.active || p.owner !== self.id || p.def?.steer?.move !== moveId) continue;
      const fwd = p.vx >= 0 ? 1 : -1;
      const ahead = (tgt.x - p.x) * fwd;
      if (ahead < -12 || tgt.state === 'ko') {
        this.held &= ~Button.Special;
        if (this.plan) this.plan.holdFrames = 0;
        return;
      }
      // the stick is re-aimed only every few frames (the CPU's thinking cadence): a slower CPU flies a looser missile
      if (world.tick % this.params.thinkEvery === 0) {
        const want = Math.atan2(tgt.y - tgt.h / 2 - p.y, Math.abs(tgt.x - p.x) + 1);
        const cur = Math.atan2(p.vy, Math.abs(p.vx) + 1e-6);
        this.steerY = want - cur > 0.05 ? 1 : want - cur < -0.05 ? -1 : 0;
      }
      this.sy = this.steerY;
      this.sx = 0;
      return;
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
      // never cancel into a lunge (Charge Shoulder, Shark Lunge) that would carry us off the stage
      if (self.grounded && this.lungesOff(self, travel(self.data.moves[c.into], attackDecel(self.data)), c.dir === 'side' ? (tgt.x >= self.x ? 1 : -1) : c.dir === 'back' ? -self.facing : self.facing)) continue;
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

  /** Px of platform left in direction `dir` from where we stand (Infinity in the air). */
  private roomAhead(self: Fighter, dir: number): number {
    const pl = self.groundPlat;
    if (!pl || !self.grounded) return Infinity;
    return dir > 0 ? pl.right - self.x : self.x - pl.x;
  }

  /** Airborne: true when a lunge of `dist` px toward `dir` would end with no solid stage underneath. */
  private airLungesOff(self: Fighter, world: World, dist: number, dir: number): boolean {
    if (self.grounded || dist <= 0) return false;
    const x = self.x + dir * dist;
    for (const p of world.platforms) if (p.kind === 'solid' && x >= p.x + 4 && x <= p.right - 4 && self.y <= p.top + 6) return false;
    return true;
  }

  /** True when a move's lunge (its motion steps) would carry us past the end of the platform toward `dir`. */
  private lungesOff(self: Fighter, dist: number, dir: number): boolean {
    return dist > 0 && dist > this.roomAhead(self, dir) - 8;
  }

  /** Drift onto platform `pl` across a gap, spending the double jump once we sink toward its top. */
  private crossGap(self: Fighter, pl: Platform): void {
    const aim = Math.max(pl.x + 12, Math.min(pl.right - 12, self.x));
    this.sx = Math.abs(aim - self.x) < 4 ? 0 : Math.sign(aim - self.x);
    if (self.vy > 0 && self.y > pl.top - 24 && self.jumpsLeft > 0) this.held |= Button.Jump;
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
    // jet hover (Gizmo): once the double jump is spent, hang in the air while drifting back toward the stage (a sloppy CPU
    // only starts it late, see RecoveryEpisode.specialDelay)
    if (self.data.hover && !this.rec.special && !self.grounded && self.vy >= 0 && self.jumpsLeft === 0 && self.state === 'air' && world.tick - ep.startTick >= ep.specialDelay) this.held |= Button.Jump;
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
    if (!hs || this.rnd() < this.params.mistakes * 0.3) return false;
    const air = !self.grounded;
    for (const h of hs) {
      const ph = hazardPhase(h, world.tick);
      if (ph === 'idle') continue;
      if (h.kind === 'avalanche') {
        // only once the wall is rolling (the rumble before it is just a warning: keep fighting)
        const front = avalancheX(h, (world.tick + (h.offset ?? 0)) % h.period);
        if (front === null) continue;
        const dir = (h.travel ?? 1) >= 0 ? 1 : -1;
        const speed = Math.abs(h.travel ?? 0) / Math.max(1, h.active - 1);
        const ahead = (self.x - front) * dir;
        if (air) {
          // in the air low over the snow: drift back over the front, and spend the double jump rather than drop into it
          if (self.y > h.y - h.h - 24 && ahead > -h.w && ahead < self.hw + h.w / 2 + speed * 10) {
            this.sx = -dir;
            if (self.vy > 0 && self.jumpsLeft > 0) this.held |= Button.Jump;
            return true;
          }
          continue;
        }
        // a wall of snow rolling along the floor: no column to step out of, so jump it as the front arrives
        if (Math.abs(self.y - h.y) > 6) continue;
        // press Jump so we leave the ground ~11 ticks before the front reaches our body, so we are high and stay high while it passes
        if (ahead > -h.w / 2 && ahead < self.hw + h.w / 2 + speed * (11 + self.stats.jumpsquatFrames)) {
          this.held |= Button.Jump;
          this.hopTarget = true; // a full hop: a short hop does not clear the snow
          this.sx = -dir; // drift back over the front
          return true;
        }
        if (ahead > 0 && ahead < self.hw + h.w / 2 + speed * 28) {
          // it is coming: do not start anything committal, wait for the moment to jump
          this.sx = 0;
          return true;
        }
        continue;
      }
      const half = h.w / 2 + 16;
      if (Math.abs(self.x - h.x) >= half) continue;
      if (air) {
        // airborne inside a warned / erupting column (geyser, bolt, falling stalactite): drift out of it sideways
        if (!inColumn(h, self)) continue;
        const dir = self.x >= h.x ? 1 : -1;
        const main = this.mainPlatform(world);
        this.sx = (dir > 0 ? self.x < main.right - 10 : self.x > main.x + 10) ? dir : -dir;
        return true;
      }
      // step out of the column toward the nearer side (and away from the edge)
      const dir = self.x >= h.x ? 1 : -1;
      this.sx = dir;
      this.clampEdge(self);
      if (this.sx === 0) this.sx = -dir; // cornered: go the other way
      return true;
    }
    return false;
  }

  /** True when stepping `dir` would walk / drift us into a column hazard that is warned or erupting. */
  private hotAhead(self: Fighter, world: World, dir: number): boolean {
    const hs = world.stage.hazards;
    if (!hs || dir === 0) return false;
    for (const h of hs) {
      if (h.kind === 'avalanche' || hazardPhase(h, world.tick) === 'idle' || !inColumn(h, self)) continue;
      const gap = (h.x - self.x) * dir - h.w / 2 - self.hw;
      if (gap > -4 && gap < 26) return true;
    }
    return false;
  }

  /** Frames until a column hazard over our x goes off (0 while it is erupting; Infinity if none is due within ~1.5 s). */
  private hazardDue(self: Fighter, world: World): number {
    const hs = world.stage.hazards;
    if (!hs) return Infinity;
    let due = Infinity;
    for (const h of hs) {
      if (h.kind === 'avalanche') {
        // the snow wall: frames until its front reaches us (only once it is rolling)
        const front = avalancheX(h, (world.tick + (h.offset ?? 0)) % h.period);
        if (front === null || !self.grounded) continue;
        const ahead = (self.x - front) * ((h.travel ?? 1) >= 0 ? 1 : -1);
        const speed = Math.abs(h.travel ?? 0) / Math.max(1, h.active - 1);
        if (ahead > -h.w) due = Math.min(due, Math.max(0, (ahead - h.w / 2) / Math.max(0.1, speed)));
        continue;
      }
      if (Math.abs(self.x - h.x) >= h.w / 2 + 12 || !inColumn(h, self)) continue;
      const p = (world.tick + (h.offset ?? 0)) % h.period;
      const start = h.period - h.active;
      const t = p >= start ? 0 : start - p;
      if (t < 90) due = Math.min(due, t);
    }
    return due;
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
    // a counter stance (Rime's Substitution) against a close attack that will land inside its window
    const ctr = ai.defensive ? this.slotMove(self, ai.defensive)?.counter : undefined;
    if (ctr && this.params.smart && !th.proj && !th.grab && th.eta + 1 >= ctr.from && th.eta <= ctr.to && this.rnd() < 0.6 && !this.cooldownBusy('ctr', 50)) {
      const [bx, by] = SPECIAL_DIR[ai.defensive!] ?? [0, 0];
      this.startPlan(world, 'counter', Button.Special, bx, by);
      this.runPlan(self, world);
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
    // a dedicated out-of-shield special (Brick's intangible Whirling Jet) when the rival is right there after its hit
    const oos = aiFor(self.data.id).oos;
    if (oos && tgt && this.params.smart && !th && self.state === 'shield' && Math.hypot(tgt.x - self.x, tgt.y - self.y) < 44 && this.rnd() < this.params.punish * 0.35) {
      this.held |= Button.Special | Button.Shield;
      this.sy = -1;
      return;
    }
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

    // thinking cadence: only roll new attack decisions every few frames, except that the moment the target becomes
    // punishable (end lag, landing lag, broken shield, lying down) the CPU may answer at once instead of waiting
    const lag = tgt.state === 'attack' && tgt.move ? tgt.move.startup + tgt.move.active : -1;
    const opening = (tgt.state === 'attack' && tgt.moveFrame > lag) || tgt.state === 'landing' || tgt.state === 'shieldbreak' || tgt.state === 'downed';
    if (opening && !this.sawOpening && this.rnd() < p.punish) this.thinkLeft = 0;
    this.sawOpening = opening;
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
    if (m.kind === 'grab') s = (shielding ? 12 : 3 + (tgt.state === 'run' ? 0 : 1)) + (ai.grabBonus ?? 0);
    return s + this.rnd() * 1.5;
  }

  /** Frames until the fighter lands on the surface below it at its current fall (Infinity over a pit). */
  private framesToLand(self: Fighter, world: World): number {
    if (self.grounded) return 0;
    let gap = Infinity;
    for (const p of world.platforms) {
      if (self.x < p.x || self.x > p.right || p.top < self.y - 1) continue;
      gap = Math.min(gap, p.top - self.y);
    }
    if (gap === Infinity) return Infinity;
    const s = self.stats;
    let y = 0;
    let vy = self.vy;
    for (let t = 1; t < 90; t++) {
      vy = Math.min(s.fallSpeed, vy + s.gravity);
      y += vy;
      if (y >= gap) return t;
    }
    return 90;
  }

  /** Try an aerial that reaches the target now. */
  private tryAerial(self: Fighter, world: World, tgt: Fighter, chance: number): boolean {
    if (self.helpless || this.rnd() > chance) return false;
    const ai = aiFor(self.data.id);
    // an aerial whose hitbox would come out after we land is only landing lag next to the opponent
    const land = this.framesToLand(self, world);
    let best: AiMove | null = null;
    let bestScore = -Infinity;
    for (const m of moveTable(self.data)) {
      if (m.kind !== 'aerial' || m.startup >= land || !this.reaches(self, m, tgt)) continue;
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
      // only on a target that can be hit right now (not mid-respawn / invulnerable) and that is within the ult's reach
      const open = tgt.invuln === 0 && tgt.state !== 'ko';
      if (open && ((cin && dist < ai.ultimateRange && Math.abs(dy) < 40 && grounded) || (!cin && dist < ai.ultimateRange))) {
        this.facingFix(self, tgt);
        this.startPlan(world, 'ultimate', Button.Ultimate, 0, 0);
        this.runPlan(self, world);
        return true;
      }
    }

    // stick a setup onto a rival standing right in front (Havoc's C4), to set it off once they are in kill range
    const slap = ai.slap;
    if (slap && p.smart && grounded && self.facing === dir && Math.abs(dy) < 20 && !hasTrap(world, self.id)) {
      const ahead = (tgt.x - self.x) * dir;
      if (ahead > 0 && ahead < slap.reach + tgt.hw && this.rnd() < 0.35 && !this.cooldownBusy('slap', 90)) {
        const [bx, by] = SPECIAL_DIR[slap.slot] ?? [0, 0];
        this.startPlan(world, 'slap', Button.Special, bx * dir, by);
        this.runPlan(self, world);
        return true;
      }
    }

    // opponent is blocked: grab it (smart) or just keep hitting (easy)
    if (grounded && this.slidingOffEdge(self) && this.mode !== 'edgeguard') {
      this.sx = 0; // stop first: attacking out of a dash at the stage edge slides the CPU off the stage
      return true;
    }
    // do not commit to a move that is still running when a hazard over us goes off
    const due = this.hazardDue(self, world);
    const candidates: AiMove[] = [];
    for (const m of table) {
      if (m.total >= due) continue;
      if (grounded === (m.kind === 'aerial')) continue; // aerials only in the air, ground moves only on the ground
      if (grounded && self.facing !== dir && m.kind !== 'smash') continue;
      // a long-range shot (rocket launcher) is a poke from afar: up close the quicker normals do the job
      if (m.proj && (world.tick < this.shotReady[m.index] || (m.maxX > 120 && dist < 60))) continue;
      if (grounded && m.travel > 0 && this.lungesOff(self, m.travel, NORMAL_INPUTS[m.id].fwd !== 0 ? dir : self.facing)) continue;
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
    if ((grounded || p.smart) && due > 40) {
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
    if (m.proj) this.shotReady[m.index] = world.tick + SHOT_GAP;
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

  /** The move a special slot starts (the plain one, or the first variant such as Agni's `sideB_0`). */
  private slotMove(self: Fighter, slot: string): MoveDef | undefined {
    const ms = self.data.moves;
    const m = ms[slot];
    if (m) return m;
    for (const k in ms) if (k.startsWith(slot) && k.charCodeAt(slot.length) === 95) return ms[k]; // '_'
    return undefined;
  }

  private trySpecials(self: Fighter, world: World, tgt: Fighter, ai: CharacterAi, dist: number, dy: number, dir: number): boolean {
    const p = this.params;
    const usable = (slot: string): boolean => {
      const m = this.slotMove(self, slot);
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
    // knock our own pillar over into a rival standing beyond it (the shards fly the way the smash goes)
    if (ai.strike && self.grounded && !this.cooldownBusy('strike', 40)) {
      for (const d of world.deployables) {
        if (!d.active || d.owner !== self.id || !d.plat || d.age < 12) continue;
        const ahead = (d.x - self.x) * dir;
        if (ahead > 0 && ahead < ai.strike.reach && (tgt.x - d.x) * dir > 0 && dist < 240 && Math.abs(dy) < 60 && this.rnd() < 0.5 + 0.4 * p.punish) {
          this.facingFix(self, tgt);
          this.startPlan(world, 'strike', Button.Smash, dir, 0);
          this.runPlan(self, world);
          return true;
        }
      }
    }
    // bank a full charge while the rival is far away (Giant Punch style), to fire it at once later
    if (ai.bank && p.smart && self.grounded && dist > 200 && (self.res[ai.bank.key] ?? 0) < ai.bank.frames && !this.cooldownBusy('bank', 120) && this.rnd() < 0.5) {
      const hold = ai.bank.frames + 12;
      this.startPlan(world, 'bank', Button.Special, 0, 0, { holdFrames: hold + 4, tail: Button.Shield, tailAt: hold });
      this.runPlan(self, world);
      return true;
    }
    // blow up our own pillars when a rival is standing next to one (and the pillar is in range of the stomp)
    if (ai.detonate && self.grounded && usable(ai.detonate.slot) && !this.cooldownBusy('det', 60)) {
      const r = ai.detonate.range;
      for (const d of world.deployables) {
        if (!d.active || d.owner !== self.id || Math.abs(d.x - self.x) > r) continue;
        // a pillar (Obelisk) to burst, or a remote trap (Vex's mine) to set off; one stuck on the rival (C4) waits for kill
        // range (or the rival going off the stage, or it getting old)
        const stuck = d.attached === tgt.id;
        const near = d.plat
          ? Math.abs(tgt.x - d.x) < 46 && tgt.y > d.plat.top - 60 && tgt.y < d.y + 4
          : stuck
            ? tgt.damage >= 85 || offstage(tgt, world) || d.age > 360
            : !!d.def?.trigger && d.attached < 0 && Math.abs(tgt.x - d.x) < 34 && Math.abs(tgt.y - d.y) < 40;
        if (near && this.rnd() < 0.6) {
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
        const lunge = travel(this.slotMove(self, slot), attackDecel(self.data));
        if (self.grounded ? this.lungesOff(self, lunge, dir) : this.airLungesOff(self, world, lunge, dir)) continue;
        const [near, far] = ai.closerRange ?? CLOSER_RANGE;
        if (dist > near && dist < far && usable(slot) && this.rnd() < (p.smart ? 0.4 : 0.12) && !this.cooldownBusy(`c${slot}`, 90)) {
          fire(slot, slot, !!ai.aimed?.includes(slot));
          return true;
        }
      }
    }
    // switch modes (Nova's elements) now and then while there is room: a quick tap, not the held barrier
    if (ai.cycle && p.smart && self.grounded && dist > 150 && this.rnd() < 0.2 && !this.cooldownBusy('cycle', 420)) {
      const [bx, by] = SPECIAL_DIR[ai.cycle] ?? [0, 0];
      this.startPlan(world, 'cycle', Button.Special, bx * dir, by, { pressFrames: 1 });
      this.runPlan(self, world);
      return true;
    }
    if (p.smart && self.grounded && !stalled) {
      for (const slot of ai.setups) {
        // a remote trap already out: pressing its slot again would set it off, so leave it to the detonate logic
        if (ai.detonate?.slot === slot && hasTrap(world, self.id)) continue;
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
      if (this.hotAhead(self, world, this.sx)) this.sx = 0;
      if (p.smart && this.tryAerial(self, world, tgt, p.aggression)) return;
      const over = this.mainPlatform(world);
      if (self.vy > 0 && tgt.y > self.y + 30 && dist < 40 && p.smart && self.x > over.x && self.x < over.right) this.sy = 1; // fast fall onto them
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
    if (this.hotAhead(self, world, Math.sign(this.sx))) this.sx = 0; // wait for the eruption in front of us to pass
    const wanted = this.sx;
    if (!(downBelow && dist < 160)) this.clampEdge(self);
    // stopped at our edge while the target stands on another platform within jumping range: jump the gap
    if (wanted !== 0 && this.sx === 0 && tgt.grounded && tgt.groundPlat && tgt.groundPlat !== self.groundPlat && dist < 300 && Math.abs(dy) < 110 && self.jumpsLeft > 0 && !this.cooldownBusy('gap', 45)) {
      this.held |= Button.Jump;
      this.sx = wanted;
      this.hopTarget = true;
      this.cross = tgt.groundPlat;
      this.crossUntil = world.tick + 150;
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

/** Is the fighter's body within the vertical span of a column hazard (geysers rise from `y`, bolts and stalactites hang from it)? */
function inColumn(h: HazardDef, f: Fighter): boolean {
  const top = h.kind === 'geyser' ? h.y - h.h : h.y;
  const bottom = h.kind === 'geyser' ? h.y : h.y + h.h;
  return f.y > top - 8 && f.y - f.h < bottom + 8;
}

/** Does fighter `id` have a trigger trap (a mine) out? (A plain loop: this runs every think, so no closures.) */
function hasTrap(world: World, id: number): boolean {
  for (const d of world.deployables) if (d.active && d.owner === id && d.def?.trigger) return true;
  return false;
}
