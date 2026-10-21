import { Button, type FighterInput } from '../engine/buttons';
import { GRAB_DISTANCE, SHIELD_DROP_FRAMES, type Fighter } from '../engine/fighter';
import { avalancheX, hazardPhase } from '../engine/hazards';
import * as Items from '../engine/items';
import { hitboxEnd, moveTotal, type MoveDef } from '../engine/moves';
import { pathOffset, type Ledge, type Platform } from '../engine/platform';
import type { HazardDef } from '../engine/types';
import type { World } from '../engine/world';
import { applyHeld, clearInput, type Controller } from '../game/controllers';
import { killScore, launchOf, fly, survivalDi } from './knockout';
import { chooseLedgeOption, dropSafe, hangRunningOut, trapLedge, type LedgeOption } from './ledge';
import { attackDecel, moveTable, NORMAL_INPUTS, specialTable, travel, type AiMove } from './moveInfo';
import { aiFor, skillForLevel, skillParams, type CharacterAi, type CpuLevel, type LevelParams } from './profiles';
import { newEpisode, offstage, overStage, recoveryStep, type RecoveryEpisode, type RecoveryOut } from './recovery';
import { canGetBack, drift, type Sim } from './recoveryPlan';
import { chooseTarget } from './targeting';
import { detectThreat, type Threat } from './threat';
// deterministic PRNG: the CPU must not use Math.random so matches can be replayed from inputs
import { mulberry32 } from '../art/rng';

/** Default distance band for gap-closing specials. */
const CLOSER_RANGE: [number, number] = [120, 320];
/** Frames between two shots of the same projectile normal. */
const SHOT_GAP = 120;
const CAN_ACT = new Set(['idle', 'run', 'crouch', 'dash', 'air']);
const SPECIAL_DIR: Record<string, [number, number]> = { neutralB: [0, 0], sideB: [1, 0], upB: [0, -1], downB: [0, 1] };

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
  /** A scripted input per frame (short-hop aerials: Jump + Attack, then the aerial's stick, then the drift). */
  seq?: SeqStep[];
  sawAttack: boolean;
}

interface SeqStep {
  btn: number;
  sx: number;
  sy: number;
}

/** Slots of the move-usage counters (normals first, then the profile's specials). */
const USE_SLOTS = 48;

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
  private readonly rec: RecoveryOut = { sx: 0, sy: 0, jump: false, special: false, dodge: false, steering: false };
  private cooldown: Record<string, number> = {};
  private diOn = false;
  private lastHitstunFrame = -1;
  private techTried = false;
  private techOn = false;
  private ledgeWait = 0;
  /** The get-up chosen for the current ledge hang. */
  private ledgePlan: { opt: LedgeOption; wait: number } | null = null;
  private holdPummels = 0;
  /** The throw picked for the current grab ('' = not decided yet). */
  private throwPick = '';
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
  private readonly useCount = new Float32Array(USE_SLOTS);
  /** Tick from which each projectile normal (rocket, mortar) may be fired again: shots are pokes, not a stream. */
  private readonly shotReady = new Int32Array(USE_SLOTS);
  /** Consecutive frames the stick has been held fully one way (a dash attack needs the dash flick to have expired). */
  private runFrames = 0;
  private lastSx = 0;
  /** Until this tick the CPU is following up a hit or throw on the target (decides every frame, chases it). */
  private comboUntil = -1;
  /** Until this tick the target is in a punishable whiff the CPU is running in on. */
  private punishUntil = -1;
  /** Hitlag SDI flick phase, and the DI stick chosen for the current launch. */
  private sdiPhase = false;
  private readonly diStick = { x: 0, y: 0, on: false };
  /** Ledge trap: distance (px in from the corner) to wait at, rolled per trap. */
  private trapDist = 0;
  private trapLedgeRef: Ledge | null = null;

  /** Recall out of the Blink Strike that just whiffed (rolled once per strike). */
  private recallOut = false;
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

  /** Skill on the 1..9 scale (the lobby's levels 1 / 2 / 3 play at 1 / 5 / 9 unless a skill is given). */
  readonly skill: number;
  /** Skill as 0..1 (1 -> 0, 9 -> 1). */
  private readonly q: number;

  constructor(
    readonly level: CpuLevel,
    seed: number,
    skill?: number,
  ) {
    this.skill = skill ?? skillForLevel(level);
    // a private copy: the graded switches (smart play, edge-guarding) are rolled per controller, see rollSwitches
    this.params = { ...skillParams(this.skill) };
    this.q = Math.max(0, Math.min(1, (this.skill - 1) / 8));
    this.rnd = mulberry32(seed * 7919 + level * 104729 + (skill ?? 0) * 31);
    this.bias = [0, 1, 2, 3].map(() => (this.rnd() - 0.5) * 70);
  }

  private lastRoll = -1;
  /** Graded difficulty: whether this stretch of play is `smart` / edge-guards (see LevelParams.smartness). */
  private rollSwitches(): void {
    const base = skillParams(this.skill);
    this.lastRoll = 1;
    this.params.smart = base.smartness >= 1 || (base.smartness > 0 && this.rnd() < base.smartness);
    this.params.edgeguard = base.edgeguardRate >= 1 || (base.edgeguardRate > 0 && this.rnd() < base.edgeguardRate);
  }

  get currentMode(): Mode {
    return this.mode;
  }
  get currentTarget(): number {
    return this.targetId;
  }
  /** The recovery attempt in progress (null when on the stage); for measurement tools. */
  get recoveryEpisode(): Readonly<RecoveryEpisode> | null {
    return this.episode;
  }
  /** Label of the scripted input plan running now ('' if none); for measurement tools. */
  get planLabel(): string {
    return this.plan?.label ?? '';
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

    if (world.tick % 120 === 0 || this.lastRoll < 0) this.rollSwitches();
    if (self.state !== 'ko') {
      let sum = 0;
      for (const f of world.fighters) sum += f.damage;
      if (sum !== this.lastDamageSum) this.stall = 0;
      else this.stall++;
      this.lastDamageSum = sum;
      this.think(self, world);
    }

    // a Home-Run Bat swing being charged: keep holding until the charge is wanted
    if (this.batHold > 0) {
      this.batHold--;
      if (self.state === 'attack') this.held |= Button.Attack;
      else this.batHold = 0;
    }
    if (self.state !== 'ko') this.guardBlast(self, world);
    // never flick backwards in the first frames of a special: that would B-reverse it away from the target
    if (self.state === 'attack' && self.move?.kind === 'special' && self.moveFrame <= 4 && this.sx * self.facing < 0) this.sx = 0;
    if (Math.abs(this.sx) >= 0.8 && Math.sign(this.sx) === Math.sign(this.lastSx) && Math.abs(this.lastSx) >= 0.8) this.runFrames++;
    else this.runFrames = Math.abs(this.sx) >= 0.8 ? 1 : 0;
    this.lastSx = this.sx;
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

    // back on solid ground or a ledge: the recovery attempt is over (a landing state would otherwise keep a stale one)
    if (this.episode && (self.grounded || self.state === 'ledge' || self.state === 'ledgeClimb')) {
      this.episode = null;
      if (this.mode === 'recover') this.mode = 'neutral';
    }
    // involuntary / special states first
    switch (self.state) {
      case 'hitstun':
        this.hitstun(self, world);
        return;
      case 'grabbed': {
        // mash out: a press every ~4 frames at the top (a fast human), every ~10 at the bottom
        const every = Math.round(4 + (1 - this.q) * 6);
        this.mashToggle = world.tick % every === 0;
        this.held = this.mashToggle ? Button.Attack : 0;
        this.sx = world.tick % (every * 2) < every ? 1 : -1;
        return;
      }
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
        this.getUp(self, world, tgt);
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
        // jumpsquat: keep holding the planned jump button (or run a scripted short-hop aerial); landing / dodges: nothing to do
        if (self.state === 'jumpsquat' && this.plan?.seq) {
          this.runPlan(self, world);
          return;
        }
        if (self.state === 'jumpsquat' && this.hopTarget) this.held |= Button.Jump;
        if (self.state === 'jumpsquat' && tgt) this.sx = Math.sign(tgt.x - self.x);
        return;
      default:
        break;
    }
    this.hopTarget = false;
    this.techTried = false;
    this.ledgePlan = null;
    this.throwPick = '';

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
      this.recover(self, world, ai, tgt);
      return;
    }
    this.mode = 'neutral';
    this.episode = null;

    if (!CAN_ACT.has(self.state)) return;

    // a travelling stage's platform about to carry us off
    if (this.leaveRoute(self, world)) return;

    // stage hazards
    if (this.avoidHazards(self, world)) return;

    // threats (reaction-delayed)
    if (this.defend(self, world, tgt, ai)) return;

    if (self.grounded && this.fleeCrate(self, world)) return;
    if (this.params.smart && this.chaseItem(self, world, tgt)) return;
    if (!tgt) return;
    // carrying a Shock Bomb / ray gun: use it once the target is in range (any attack would throw it anyway)
    if (self.heldBomb && this.useHeld(self, world, tgt)) return;
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
    if (p.seq) {
      if (t < p.seq.length && !(p.sawAttack && self.state !== 'attack')) {
        const st = p.seq[t];
        this.held |= st.btn;
        this.sx = st.sx;
        this.sy = st.sy;
        return true;
      }
      if ((p.sawAttack && self.state !== 'attack') || t > p.seq.length + 30 || (!p.sawAttack && t >= p.seq.length + 4)) {
        this.plan = null;
        return false;
      }
      // the aerial is out: keep drifting the way the script last pointed
      this.sx = p.seq[p.seq.length - 1].sx;
      return self.state !== 'air' || !p.sawAttack;
    }
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
    // a ground move (a charging smash) that slid off the stage: let go of the charge now, recovery comes first
    if (!self.grounded && m.charge && m.kind === 'smash' && offstage(self, world)) {
      this.held &= ~(Button.Smash | Button.Attack);
      if (p) p.holdFrames = 0;
    }
    // hit and run (Vex, Rime): a move that whiffed is followed by backing off out of the rival's punish range
    const ai = aiFor(self.data.id);
    if (ai.style === 'hitandrun' && self.grounded && !self.moveHit && self.moveFrame === moveTotal(m) - 2) this.retreat = Math.round(moveTotal(m) * 0.5);
    // Blink, bait and vanish (Vex): a Blink Strike that whiffed next to the rival warps back to its marker (the recall is
    // invulnerable on arrival); one that hit is cancelled into the follow-up below
    const rc = ai.recall;
    if (rc && tgt && m.id === rc.slot && !self.moveHit && self.moveFrame >= moveTotal(m) - 4 && this.mode !== 'recover' && Math.abs(tgt.x - self.x) < 80 && world.findDeployables(self.id, rc.marker).length > 0) {
      if (self.moveFrame === moveTotal(m) - 4) this.recallOut = this.rnd() < 0.3 + 0.6 * this.q;
      if (this.recallOut) {
        this.held |= Button.Special;
        this.sx = 0;
        this.sy = 0;
      }
    }
    // a hit that put the target in hitstun: follow it up (chase it, decide every frame) for a moment after this move
    if (self.moveHit && tgt && tgt.state === 'hitstun' && world.tick >= this.comboUntil - 5 && this.rnd() < this.params.combo * 0.25) {
      this.comboUntil = world.tick + (moveTotal(m) - self.moveFrame) + Math.min(40, tgt.hitstun + 10);
    }
    // jab chain: press again while the next hit is available and the first one connected
    if (m.next && self.moveFrame >= m.next.from - 2 && self.moveFrame <= m.next.to && tgt && (self.moveHit || this.rnd() < 0.15)) {
      const follow = this.params.smart || this.rnd() < 0.5;
      if (follow && world.tick % 3 === 0) this.held |= Button.Attack;
    }
    // hit-confirm cancels: after connecting, route into the next move (combos)
    if (m.cancels && self.moveHit && this.params.smart && tgt && this.rnd() < 0.25 + 0.5 * this.params.punish) this.cancelInput(self, m, tgt, world);
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

  /** Press the input of the most valuable eligible cancel route (see MoveCancel): damage, kill potential, position. */
  private cancelInput(self: Fighter, m: NonNullable<Fighter['move']>, tgt: Fighter, world?: World): void {
    let pick = -1;
    let n = 0;
    let bestV = -Infinity;
    const cs = m.cancels!;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (self.moveFrame < c.from || (c.to !== undefined && self.moveFrame > c.to)) continue;
      if (c.air !== undefined && c.air !== !self.grounded) continue;
      if (c.into === '@jump' && !(tgt.y < self.y - 20)) continue;
      if (Math.abs(tgt.x - self.x) > 140) continue;
      // never cancel into a lunge (Charge Shoulder, Shark Lunge, Agni's Spin Kick variants) that would carry us off the stage
      if (self.grounded && this.lungesOff(self, travel(this.slotMove(self, self.resolveVariant(c.into)), attackDecel(self.data)), c.dir === 'side' ? (tgt.x >= self.x ? 1 : -1) : c.dir === 'back' ? -self.facing : self.facing)) continue;
      // value: the follow-up's damage, more for one whose launch kills (a sharp CPU computes it), a little noise for variety
      const mv = self.data.moves[self.resolveVariant(c.into)];
      let v = this.rnd() * 3;
      if (mv) {
        let dmg = 0;
        let kb: NonNullable<AiMove['kb']> | null = null;
        for (const h of mv.hitboxes) {
          dmg = Math.max(dmg, h.damage);
          if (!kb || h.base + h.scaling * 100 > kb.base + kb.scaling * 100) kb = { base: h.base, scaling: h.scaling, angle: h.angle, weight: h.weight, damage: h.damage };
        }
        v += dmg;
        if (world && kb && tgt.damage > 40 && this.params.killConfirm > 0) {
          const d = (tgt.x >= self.x ? 1 : -1) as 1 | -1;
          const l = launchOf(self, tgt, kb, d);
          if (fly(tgt, world, tgt.x, tgt.y, l.vx, l.vy, l.stun).ko) v += 30 * this.params.killConfirm;
        }
        // a route that would carry us out past the edge: worth less (the lunge test above drops the worst ones)
        if (world && !overStage(self.x + self.facing * 30, self.y - 2, world)) v -= 8;
      }
      n++;
      if (v > bestV) {
        bestV = v;
        pick = i;
      }
    }
    if (pick < 0 || n === 0) return;
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
  /** Frames left of a charged Home-Run Bat swing (Attack held). */
  private batHold = 0;

  /**
   * Never walk, dash or drift out through a side blast zone: on a walk-off stage the ground runs on past it, so the platform
   * edge clamp never fires there. Near a side blast zone the stick may only point back in (with room to brake from a run).
   */
  private guardBlast(self: Fighter, world: World): void {
    if (self.state === 'hitstun' || self.state === 'grabbed') return; // DI has its own reasons (survival DI points inward anyway)
    const b = world.blast;
    const margin = 70 + Math.abs(self.vx) * 10 + (self.data.dash ? self.data.dash.speed * self.data.dash.frames : 0);
    if (self.x > b.right - margin && this.sx > 0) this.sx = self.x > b.right - margin * 0.6 ? -1 : 0;
    else if (self.x < b.left + margin && this.sx < 0) this.sx = self.x < b.left + margin * 0.6 ? 1 : 0;
  }

  /**
   * Standing on a platform that follows a route (a travelling stage) that is about to carry us off: down below the stage or
   * out toward a side blast zone. Get off: drop through it / jump, and head for the main platform. True if it acted.
   */
  private leaveRoute(self: Fighter, world: World): boolean {
    const pl = self.groundPlat;
    const path = pl?.def.path;
    if (!pl || !self.grounded || !path) return false;
    const main = this.mainPlatform(world);
    const now = pathOffset(path, world.tick);
    const nx = now.dx;
    const ny = now.dy;
    const ahead = pathOffset(path, world.tick + 45);
    const dy = ahead.dy - ny;
    const dx = ahead.dx - nx;
    const b = world.blast;
    const futureX = self.x + dx;
    const sinking = dy > 8 && pl.y + dy > main.top + 30;
    const carried = Math.abs(dx) > 8 && (futureX > b.right - 160 || futureX < b.left + 160 || futureX < main.x - 40 || futureX > main.right + 40);
    if (!sinking && !carried) return false;
    const toward = Math.sign(main.x + main.w / 2 - self.x) || 1;
    this.sx = toward;
    // over the main platform: drop through onto it; otherwise jump back toward it
    if (self.x > main.x + 10 && self.x < main.right - 10 && pl.y < main.top) this.sy = 1;
    else if (!this.cooldownBusy('routeJump', 20)) this.held |= Button.Jump;
    return true;
  }

  private mainPlatform(world: World): Platform {
    let best = world.platforms[0];
    for (const p of world.platforms) if (p.kind === 'solid' && p.w > (best.kind === 'solid' ? best.w : 0)) best = p;
    return best;
  }

  /** Never run off the platform we stand on unless dropping is intended. */
  private clampEdge(self: Fighter): void {
    const pl = self.groundPlat;
    if (!pl || !self.grounded || this.sx === 0) return;
    // leave room to brake: a fast runner / dasher needs a few frames to stop; a full flick from standing starts a dash
    // (Vex's blink dash) that carries its whole length
    const dash = self.data.dash;
    const flick = dash && Math.abs(this.sx) >= 0.8 && Math.abs(this.lastSx) < 0.8 && self.state !== 'dash' && self.dashCd === 0 ? dash.speed * dash.frames : 0;
    const margin = 10 + Math.abs(self.vx) * 7 + flick;
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
  private recover(self: Fighter, world: World, ai: CharacterAi, tgt: Fighter | null): void {
    const ep = this.episode!;
    // a rival right next to us out here, while we still have a jump and the stage is within reach: hit it on the way back
    const high = !!ep.ledge && self.y < ep.ledge.y + 20;
    if (tgt && high && ep.ledge && this.params.smart && self.jumpsLeft > 0 && !self.helpless && Math.abs(tgt.x - self.x) < 60 && Math.abs(tgt.y - self.y) < 50 && !this.cooldownBusy('recAerial', 30) && this.rnd() < this.params.combo) {
      // only an aerial after which a simulated recovery still gets back (see tryAerial's `safe`)
      if (this.tryAerial(self, world, tgt, 1, ep.ledge)) return;
    }
    // something about to hit us on the way back (an edge-guarder's swing, a shot): air dodge through it
    if (this.params.smart && !self.airDodgeUsed && !self.helpless && detectThreat(self, world, this.threat) && this.threat.eta <= 4 && this.rnd() < this.params.defend * 0.6) {
      const l = ep.ledge;
      this.held |= Button.Shield;
      // dodge in place, or toward the stage when it is above us and close (keeps the recovery going)
      if (l && Math.abs(l.x - self.x) < 60) {
        this.sx = -l.side * 0.7;
        this.sy = -0.7;
      }
      return;
    }
    recoveryStep(self, world, ai, ep, this.rec);
    this.sx = this.rec.sx;
    this.sy = this.rec.sy;
    if (this.rec.jump) {
      this.held |= Button.Jump;
      ep.jumpDelay = 0;
    }
    if (this.rec.dodge) {
      this.held |= Button.Shield;
      return;
    }
    // jet hover (Gizmo): once the double jump is spent, hang in the air while drifting back toward the stage (a sloppy CPU
    // only starts it late, see RecoveryEpisode.specialDelay)
    if (self.data.hover && !this.rec.special && !self.grounded && self.vy >= 0 && self.jumpsLeft === 0 && self.state === 'air' && world.tick - ep.startTick >= ep.specialDelay) this.held |= Button.Jump;
    if (this.rec.special) {
      this.held |= Button.Special;
      // only the up special counts as "the" recovery special (a side special or a recall leaves it available)
      if (this.rec.sy < 0) ep.specialPressed = true;
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
      if (gap > -4 && gap < 26 + Math.max(0, self.vx * dir) * 8) return true; // a run still slides after letting go
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
      // drifting / sliding toward the column: a move started now still carries us into it
      const drift = (h.x - self.x) * self.vx > 0 ? Math.abs(self.vx) * 10 : 0;
      if (Math.abs(self.x - h.x) >= h.w / 2 + 12 + drift || !inColumn(h, self)) continue;
      const p = (world.tick + (h.offset ?? 0)) % h.period;
      const start = h.period - h.active;
      const t = p >= start ? 0 : start - p;
      if (t < 90) due = Math.min(due, t);
    }
    return due;
  }

  // ---- defence ---------------------------------------------------------------------------------
  private readonly threat: Threat = { eta: 0, grab: false, proj: false, fromX: 0, owner: -1, damage: 0, lasts: 1 };

  /** Fills `this.threat` and returns true when something is about to hit us (melee hitbox, lunge or projectile). */
  private detectThreat(self: Fighter, world: World): boolean {
    return detectThreat(self, world, this.threat);
  }

  private defend(self: Fighter, world: World, tgt: Fighter | null, ai: CharacterAi): boolean {
    if (!this.detectThreat(self, world)) {
      this.threatFrames = 0;
      this.parryWait = 0;
      return false;
    }
    const th = this.threat;
    const p = this.params;
    this.threatFrames++;
    // reaction time: the threat must have been visible this long (a quick move from neutral lands before a human-like
    // CPU can react to it; a lingering or repeated one does not)
    if (this.threatFrames < p.reaction) return false;
    // one roll per threat: does the CPU see it in time at all?
    if (this.threatFrames === p.reaction && this.rnd() > p.defend) {
      this.threatFrames = -30;
      return false;
    }
    if (th.eta > 12 && !th.proj) return false;
    const away = th.fromX > self.x ? -1 : 1;
    if (!self.grounded) {
      // in the air: air dodge a close hit, else counter with an aerial if smart, else drift away
      if (p.smart && !self.airDodgeUsed && !self.helpless && th.eta <= 6 && this.rnd() < 0.7) {
        this.held |= Button.Shield;
        return true;
      }
      if (p.smart && tgt && this.tryAerial(self, world, tgt, 1.0)) return true;
      this.sx = away;
      return true;
    }
    // reflect / barrier special against projectiles
    if (th.proj && ai.defensive && p.smart && !this.cooldownBusy('def', 40)) {
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
    // a close melee attacker: dash through it instead (the invincible frames cover the hit) and end up behind its end lag
    const atk = th.owner >= 0 ? world.fighters[th.owner] : null;
    const roomThrough = self.groundPlat ? (away > 0 ? self.x - self.groundPlat.x : self.groundPlat.right - self.x) : 0;
    const through = !!atk && !th.proj && !th.grab && th.eta >= 2 && th.eta <= 6 && Math.abs(atk.x - self.x) < 46 && roomThrough > runOut + 24 && this.rnd() < 0.3 + 0.4 * this.q;
    if (p.smart && dash && self.dashCd === 0 && th.eta >= 1 && th.eta <= 9 && (through || roomAway > runOut + 12) && this.rnd() < 0.85) {
      if (through) this.punishUntil = world.tick + 30;
      this.startPlan(world, 'dash', 0, 0, 0, { pressFrames: 1, sx2: through ? -away : away, sy2: 0, stickFrames: 3 });
      this.runPlan(self, world);
      return true;
    }
    if (th.grab && p.smart) {
      // shields lose to grabs: jump out of the way
      this.held |= Button.Jump;
      this.sx = away;
      return true;
    }
    if (th.proj && p.smart && this.rnd() < 0.5) {
      this.held |= Button.Jump; // hop over it
      this.sx = -away;
      return true;
    }
    // a counter stance (Rime's Substitution) against a close attack that will land inside its window
    const ctr = ai.defensive ? this.slotMove(self, ai.defensive)?.counter : undefined;
    if (ctr && p.smart && !th.proj && !th.grab && th.eta + 1 >= ctr.from && th.eta <= ctr.to && this.rnd() < 0.6 && !this.cooldownBusy('ctr', 50)) {
      const [bx, by] = SPECIAL_DIR[ai.defensive!] ?? [0, 0];
      this.startPlan(world, 'counter', Button.Special, bx, by);
      this.runPlan(self, world);
      return true;
    }
    // shield-health awareness: a weak shield (or a hit strong enough to break it) is better dodged than blocked
    const shieldWeak = self.shieldHP < 16 || th.damage * 1.2 > self.shieldHP;
    if (p.smart && shieldWeak && th.eta <= 6) {
      if (roomAway > 50 && this.rnd() < 0.5) {
        this.held |= Button.Shield;
        this.sx = away; // roll away (a shield press with the stick sideways rolls)
        this.shieldHold = 0;
        return true;
      }
      this.held |= Button.Shield;
      this.sy = 1; // spot dodge
      this.shieldHold = 0;
      return true;
    }
    // walk out of a slow hit that is still a way off instead of blocking it (then punish its end lag)
    if (p.smart && !th.proj && th.eta >= 7 && roomAway > 40 && this.rnd() < p.whiffPunish * 0.5 && !this.cooldownBusy('backoff', 20)) {
      this.sx = away;
      return true;
    }
    // a sharp CPU sometimes times the shield so it comes up just before the hit (a perfect shield)
    if (p.smart && !th.proj && th.eta > 4 && th.eta <= 12 && self.shieldCooldown === 0 && this.parryWait < 6 && (this.parryWait > 0 || this.rnd() < p.perfectShield)) {
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
    // the rival's move is spent next to our shield: punish out of shield. An up smash comes out at once (on a rival above /
    // beside us), a short-hop aerial through the jump; a long opening is worth dropping the shield for (its drop lag,
    // SHIELD_DROP_FRAMES) and answering with the ground game; otherwise the grab below
    const win = tgt ? punishWindow(tgt) : 0;
    if (tgt && this.params.smart && !th && self.state === 'shield' && win > 0 && this.rnd() < this.params.punish * 0.5) {
      const dx = Math.abs(tgt.x - self.x);
      const dyU = tgt.y - self.y;
      const us = moveTable(self.data).find((m) => m.id === 'usmash');
      if (us && us.startup <= win + 1 && dx < us.maxX + tgt.hw && dyU > us.minY - 6 && dyU < 10 && tgt.invuln < us.startup) {
        this.held |= Button.Smash | Button.Shield;
        this.sy = -1;
        return;
      }
      const jsq = self.stats.jumpsquatFrames;
      const air = moveTable(self.data).find((m) => m.id === 'nair');
      if (air && air.startup + jsq + 1 <= win && dx < air.maxX + tgt.hw && Math.abs(dyU) < 40 && !this.cooldownBusy('oosAir', 30)) {
        const seq: SeqStep[] = [{ btn: Button.Jump | Button.Shield, sx: 0, sy: 0 }];
        for (let i = 0; i < jsq; i++) seq.push({ btn: i === jsq - 1 ? Button.Attack : 0, sx: 0, sy: 0 });
        seq.push({ btn: 0, sx: 0, sy: 0 });
        this.useCount[air.index]++;
        this.startPlan(world, 'oos_nair', 0, 0, 0, { seq });
        this.runPlan(self, world);
        return;
      }
      if (win > SHIELD_DROP_FRAMES + 8) {
        // drop the shield: the offence picks the punish once it is down (the opening is still there)
        this.shieldHold = 0;
        this.thinkLeft = 0;
        return;
      }
    }
    // grab out of shield when the target is right there and its move is spent (or it is shielding too)
    if (tgt && this.params.smart && !th && self.state === 'shield' && Math.hypot(tgt.x - self.x, tgt.y - self.y) < 40 && this.rnd() < this.params.punish * 0.3) {
      this.held |= Button.Grab | Button.Shield;
      this.facingFix(self, tgt);
      return;
    }
    // a shield about to break under this hit: spot dodge out of it instead
    if (th && self.state === 'shield' && this.params.smart && th.eta <= 3 && th.damage * 1.2 > self.shieldHP && this.rnd() < this.params.defend) {
      this.held |= Button.Shield;
      this.sy = 1;
      return;
    }
    // dodge flick when the hit is about to land and the CPU is sharp
    if (th && !th.proj && th.eta <= 4 && self.state === 'shield' && this.params.smart && this.rnd() < 0.35) {
      this.held |= Button.Shield;
      if (th.grab) this.sx = th.fromX > self.x ? -1 : 1; // roll away from grabs
      else this.sy = 1; // spot dodge
      return;
    }
    // a worn-down shield is let go of as soon as nothing is coming (it regenerates only while lowered)
    if (!th && self.shieldHP < 14 && this.params.smart) return;
    if (this.shieldHold > 0 || self.state === 'shieldstun') this.held |= Button.Shield;
  }

  private facingFix(self: Fighter, tgt: Fighter): void {
    const want = tgt.x >= self.x ? 1 : -1;
    // a light tilt turns around without dashing (a full flick would dash, at a stage edge that dashes off it)
    if (self.facing !== want && self.state !== 'shield') this.sx = self.grounded ? want * 0.3 : want;
  }

  // ---- involuntary states ----------------------------------------------------------------------
  private hitstun(self: Fighter, world: World): void {
    if (self.stateFrame <= this.lastHitstunFrame) this.techTried = false; // new hit
    this.lastHitstunFrame = self.stateFrame;
    if (self.stateFrame <= 1 && !this.diStick.on) {
      this.diOn = this.rnd() < this.params.di;
      this.techOn = this.rnd() < this.params.tech; // one decision per hit
      this.sdiPhase = this.rnd() < this.params.sdi;
      // survival DI: when this launch would kill (or come close), bend it whichever way the simulation says lives
      const sv = this.diOn && this.rnd() < this.params.survivalDi ? survivalDi(self, world) : null;
      this.diStick.on = true;
      if (sv) {
        this.diStick.x = sv.x;
        this.diStick.y = sv.y;
      } else {
        const center = this.mainPlatform(world);
        // combo DI: bend the launch toward the stage centre (applied once when the hitlag ends, see applyDirectionalInfluence)
        const dx = center.x + center.w / 2 - self.x;
        const dy = center.y - 40 - self.y;
        const len = Math.hypot(dx, dy) || 1;
        this.diStick.x = (dx / len) * 0.95;
        this.diStick.y = (dy / len) * 0.95;
      }
    }
    if (self.stateFrame > 1) this.diStick.on = false;
    if (self.hitlag > 1 && this.sdiPhase) {
      // smash DI out of a multi-hit / a combo: flick away from the attacker (neutral every other frame: each flick counts)
      const atk = self.lastHitBy >= 0 ? world.fighters[self.lastHitBy] : null;
      const away = atk ? (self.x >= atk.x ? 1 : -1) : 0;
      if (world.tick % 2 === 0) {
        this.sx = away;
        this.sy = self.grounded ? 0 : -0.6;
      }
    } else if (this.diOn) {
      this.sx = this.diStick.x;
      this.sy = this.diStick.y;
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

  /**
   * Holding a grab. Pummel only while the hold has time to spare (a mashing victim drains it fast: a pummel the hold cannot
   * afford loses the grab), then throw. The throw is picked by its computed launch: one that kills, else one that sends the
   * victim off the stage toward the nearer blast zone (an edge-guard), else a low-launch throw to follow up on.
   */
  private holding(self: Fighter, world: World, tgt: Fighter | null): void {
    const victim = self.grabTarget >= 0 ? world.fighters[self.grabTarget] : tgt;
    if (!victim) return;
    const p = this.params;
    if (!this.throwPick) {
      this.throwPick = this.pickThrow(self, world, victim);
      this.holdPummels = 0;
    }
    // a pummel costs 6 frames of hold and the victim's mashing drains it ~2 a frame: keep a safe margin before the throw
    const wantPummels = p.smart ? (this.throwPick === 'kill' ? 0 : 2) : 1;
    if (this.holdPummels < wantPummels && self.holdTimer > 30) {
      if (self.stateFrame < 2) return;
      // one press per pummel cooldown (14 frames): each press is a pummel
      if (world.tick - this.lastPummel >= 16) {
        this.held |= Button.Attack;
        this.lastPummel = world.tick;
        this.holdPummels++;
      }
      return;
    }
    const pick = this.throwPick === 'kill' ? this.killThrow : this.throwPick;
    const fwd = self.facing;
    const id = pick || 'fthrow';
    if (id === 'uthrow') this.sy = -1;
    else if (id === 'dthrow') this.sy = 1;
    else if (id === 'bthrow') this.sx = -fwd;
    else this.sx = fwd;
    // any throw whose launch leaves a follow-up (enough hitstun, a short flight that stays over the stage): chase after it
    const fu = this.throwFollowUp(self, world, victim, id);
    if (fu > 0 && this.rnd() < p.combo) this.comboUntil = world.tick + fu;
  }

  /**
   * Frames worth chasing after throw `id` (0 = no follow-up): its computed launch must leave the victim in hitstun long
   * enough to be reached, and not too far away (or off the stage) to get to in time.
   */
  private throwFollowUp(self: Fighter, world: World, victim: Fighter, id: string): number {
    const m = self.data.moves[id];
    const hb = m?.hitboxes.find((h) => h.throw) ?? m?.hitboxes[0];
    if (!hb) return 0;
    const kb = { base: hb.base, scaling: hb.scaling, angle: hb.angle, weight: hb.weight, damage: hb.damage };
    const dir = (hb.dir === 'away' ? (victim.x >= self.x ? 1 : -1) : id === 'bthrow' ? -self.facing : self.facing) as 1 | -1;
    const l = launchOf(self, victim, kb, dir);
    const sp = Math.hypot(l.vx, l.vy);
    // where the victim is when the hitstun ends (roughly): reachable by a run / jump in that time?
    const t = l.stun;
    const ex = victim.x + l.vx * t * 0.7;
    const ey = victim.y + l.vy * t * 0.5;
    const reach = self.stats.runSpeed * t + 40;
    if (t < 14 || sp > 9 || Math.abs(ex - self.x) > reach || ey < self.y - 160 || !overStage(ex, self.y - 2, world)) return 0;
    return Math.min(70, t + 20);
  }

  private killThrow = 'fthrow';
  private lastPummel = -99;

  /** Choose a throw by simulating each one's launch from where the victim is held. 'kill' means `killThrow` kills. */
  private pickThrow(self: Fighter, world: World, victim: Fighter): string {
    const p = this.params;
    if (!p.smart) {
      const b = world.blast;
      const toRight = b.right - victim.x < victim.x - b.left;
      if (victim.damage >= 110) return 'uthrow';
      if (victim.damage >= 70) return (toRight ? 1 : -1) === self.facing ? 'fthrow' : 'bthrow';
      return this.rnd() < 0.5 ? 'dthrow' : 'fthrow';
    }
    const ms = self.data.moves;
    let best = '';
    let bestScore = -Infinity;
    const vx = self.x + self.facing * GRAB_DISTANCE;
    for (const id of ['fthrow', 'bthrow', 'uthrow', 'dthrow']) {
      const m = ms[id];
      if (!m) continue;
      const hb = m.hitboxes.find((h) => h.throw) ?? m.hitboxes[0];
      if (!hb) continue;
      const kb = { base: hb.base, scaling: hb.scaling, angle: hb.angle, weight: hb.weight, damage: hb.damage };
      const dir = (hb.dir === 'away' ? (victim.x >= self.x ? 1 : -1) : self.facing) as 1 | -1;
      const l = launchOf(self, victim, kb, dir);
      const fl = fly(victim, world, vx, victim.y, l.vx, l.vy, l.stun);
      let sc: number;
      if (fl.ko && this.rnd() < p.killConfirm + 0.05) sc = 1000 - fl.margin;
      else {
        // off the stage = an edge-guard; otherwise how far it sends them toward a blast zone, or a low launch to follow up
        const endX = vx + l.vx * Math.min(l.stun, 30) * 0.8;
        const off = !overStage(endX, victim.y - 2, world);
        sc = (off ? 60 : 0) + Math.max(0, 200 - fl.margin) * 0.3;
        if (victim.damage < 90 && this.throwFollowUp(self, world, victim, id) > 0) sc += 45 * p.combo; // a throw that combos
        sc += this.rnd() * 20;
      }
      if (sc > bestScore) {
        bestScore = sc;
        best = id;
      }
    }
    if (bestScore >= 500) {
      this.killThrow = best;
      return 'kill';
    }
    return best || 'fthrow';
  }

  private onLedge(self: Fighter, world: World, tgt: Fighter | null): void {
    this.ledgeWait++;
    const l = self.ledge;
    if (!l) return;
    if (!this.ledgePlan) this.ledgePlan = chooseLedgeOption(self, world, l, this.params, this.rnd, aiFor(self.data.id));
    const plan = this.ledgePlan;
    // something about to hit us on the ledge (no ledge invincibility here): let go / jump rather than eat it
    if (this.params.smart && self.ledgeFrames >= 8 && this.detectThreat(self, world) && this.threat.eta <= 5 && this.rnd() < this.params.defend) {
      if ((this.threat.eta <= 2 || this.rnd() < 0.5) && dropSafe(self, world, l, aiFor(self.data.id))) this.sy = 1; // drop under it
      else this.held |= Button.Jump;
      this.ledgePlan = null;
      return;
    }
    if (self.ledgeFrames < plan.wait && !hangRunningOut(self)) return;
    this.ledgeWait = 0;
    switch (plan.opt) {
      case 'attack':
        this.held |= Button.Attack;
        break;
      case 'roll':
        this.held |= Button.Shield;
        break;
      case 'jump':
        this.held |= Button.Jump;
        this.sx = -l.side; // hop up and over onto the stage
        break;
      case 'drop':
        // let go and come straight back with the double jump (an aerial if the rival is close): see recover()
        this.sx = l.side;
        break;
      default:
        this.sy = -1; // climb up
    }
    void tgt;
  }

  /** Lying on the ground after a missed tech: get up (in place, rolling away from a rival on top of us, or attacking). */
  private getUp(self: Fighter, world: World, tgt: Fighter | null): void {
    if (self.stateFrame < 7) return;
    const p = this.params;
    const close = tgt && Math.abs(tgt.x - self.x) < 50 && Math.abs(tgt.y - self.y) < 40;
    if (!p.smart) {
      if (close && this.rnd() < 0.05) this.held |= Button.Attack;
      return;
    }
    if (this.rnd() > 0.15 + 0.3 * p.ledgeMix) return; // a little timing variety
    if (!close) {
      this.held |= Button.Jump; // stand up
      return;
    }
    const r = this.rnd();
    const away = tgt!.x > self.x ? -1 : 1;
    const room = self.groundPlat ? (away > 0 ? self.groundPlat.right - self.x : self.x - self.groundPlat.x) : 0;
    if (r < 0.4) this.held |= Button.Attack;
    else if (r < 0.75 && room > 60) this.sx = away;
    else this.sx = -away; // roll behind them
    void world;
  }

  /** How much an item on the floor is worth to us now (unknown kinds from newer item sets get a modest default). */
  private itemValue(self: Fighter, kind: string): number {
    const sense = this.params.itemSense;
    let v: number;
    switch (kind) {
      case 'heal':
        v = self.damage < 25 ? 2 : 10 + self.damage * 0.35; // a heal at 0% is wasted, at high percent it is a stock
        break;
      case 'cell':
        v = self.meter < (self.data.ultimate?.cost ?? 100) ? 24 : 4;
        break;
      case 'core':
        v = self.meter < (self.data.ultimate?.cost ?? 100) ? 55 : 6;
        break;
      case 'aegis':
        v = 45;
        break;
      case 'boost':
        v = 26;
        break;
      case 'bomb':
      case 'sword':
      case 'raygun':
      case 'mine':
        v = self.heldBomb ? 0 : 30; // one thing in hand at a time
        break;
      case 'bat':
        v = self.heldBomb ? 0 : 38; // a KO threat in hand
        break;
      case 'drone':
        v = 40;
        break;
      case 'crate':
        v = 0; // broken open with attacks, not picked up
        break;
      default:
        v = 18;
    }
    // a CPU with little item sense grabs whatever is there
    return v * sense + 20 * (1 - sense);
  }

  /** Step away from a primed (about to explode) crate next to us; hop over a rival's live mine in our path. */
  private fleeCrate(self: Fighter, world: World): boolean {
    for (const it of world.items) {
      if (!Items.mineArmed(it) || it.owner === self.id || world.allied(it.owner, self.id)) continue;
      const dx = it.x - self.x;
      if (Math.abs(dx) > 34 || Math.abs(it.y - self.y) > 20) continue;
      // stepping toward it (or standing on it): jump it, carrying on over
      if (Math.abs(dx) < 10 || Math.sign(dx) === Math.sign(this.sx || self.facing)) {
        this.sx = Math.sign(dx) || self.facing;
        this.held |= Button.Jump;
        return true;
      }
    }
    for (let i = 0; i < world.items.length; i++) {
      const it = world.items[i] as { active: boolean; kind: string; primed?: boolean; x: number; y: number };
      if (!it.active || it.kind !== 'crate' || !it.primed) continue;
      if (Math.abs(it.x - self.x) > 60 || Math.abs(it.y - self.y) > 50) continue;
      this.sx = self.x >= it.x ? 1 : -1;
      this.clampEdge(self);
      if (this.sx === 0) this.held |= Button.Jump;
      return true;
    }
    return false;
  }

  /** Grab a nearby item when nobody is on top of us. */
  private chaseItem(self: Fighter, world: World, tgt: Fighter | null): boolean {
    if (world.config.itemRate === 0) return false;
    // a carried item in reach is picked up with a Grab press (an Attack press would too, but could start an attack instead)
    const near = Items.itemInReach(world, self.id);
    if (near && CAN_ACT.has(self.state) && this.itemValue(self, near.kind) > 4 && !this.cooldownBusy('pick', 6)) {
      this.held |= Button.Grab;
      return true;
    }
    if (!self.grounded) return false;
    if (tgt && Math.abs(tgt.x - self.x) < 60 && Math.abs(tgt.y - self.y) < 50) return false;
    let best: { x: number; y: number } | null = null;
    let bestScore = 0;
    for (let i = 0; i < world.items.length; i++) {
      const it = world.items[i] as { active: boolean; resting: boolean; x: number; y: number; kind: string; spent?: boolean; thrown?: boolean; volatile?: boolean; primed?: boolean };
      if (!it.active || !it.resting || it.spent || it.thrown) continue;
      // crates are broken open, not picked up; a hazard-striped / primed one is about to blow: stay away from it
      if (it.kind === 'crate') continue;
      const d = Math.abs(it.x - self.x);
      if (Math.abs(it.y - self.y) >= 70) continue;
      const v = this.itemValue(self, it.kind);
      if (v <= 4) continue;
      // worth the walk: value against distance (a valuable item justifies a longer trip)
      const sc = v * 9 - d;
      if (d < 120 + v * 4 && sc > bestScore) {
        bestScore = sc;
        best = it;
      }
    }
    if (!best) return false;
    this.sx = Math.abs(best.x - self.x) < 4 ? 0 : Math.sign(best.x - self.x);
    this.clampEdge(self);
    return true;
  }

  /** What we carry in hand ('' = nothing; 'bomb' for a plain Shock Bomb or when the item set does not say). */
  private heldKind(self: Fighter, world: World): string {
    if (!self.heldBomb) return '';
    return Items.heldItem(world, self.id) ?? 'bomb';
  }

  /** Use a carried item: lob a bomb (also from the air, dropped onto a rival below), fire a ray gun. True if it acted. */
  private useHeld(self: Fighter, world: World, tgt: Fighter): boolean {
    const kind = this.heldKind(self, world);
    if (!kind) return false;
    const dx = tgt.x - self.x;
    const dy = tgt.y - self.y;
    if (kind === 'sword') {
      // the blade reaches further than a fist: swing from just outside the rival's own reach
      if (!self.grounded) return false;
      const reach = Items.SWORD?.reach ?? 42;
      if (Math.abs(dy) < 40 && Math.abs(dx) < reach + 8 && tgt.invuln === 0) {
        if (self.facing !== Math.sign(dx)) this.sx = Math.sign(dx) * 0.3;
        else this.held = Button.Attack;
        return true;
      }
      if (Math.abs(dy) < 60 && Math.abs(dx) < 200) {
        this.sx = Math.sign(dx);
        this.clampEdge(self);
        return true;
      }
      return false;
    }
    if (kind === 'bat') {
      // the bat on the ground: a charged home-run swing when the rival is open (stunned, landing, lying down) and well
      // damaged, a quick swing otherwise; in the air it is only a light hit, so keep it for the ground
      if (!self.grounded) return false;
      const reach = Items.BAT.reach + 6;
      if (Math.abs(dy) < 34 && Math.abs(dx) < reach && tgt.invuln === 0) {
        if (self.facing !== Math.sign(dx)) this.sx = Math.sign(dx) * 0.3;
        else {
          this.held = Button.Attack;
          const open = tgt.state === 'downed' || tgt.state === 'landing' || tgt.state === 'shieldbreak' || tgt.state === 'stunned' || tgt.state === 'frozen' || tgt.hitstun > 20;
          if (open && tgt.damage > 70 && this.params.smart) this.batHold = 18 + Math.floor(this.rnd() * 20);
        }
        return true;
      }
      if (Math.abs(dy) < 60 && Math.abs(dx) < 220) {
        this.sx = Math.sign(dx);
        this.clampEdge(self);
        return true;
      }
      return false;
    }
    if (kind === 'raygun') {
      if (Math.abs(dy) < 30 && Math.abs(dx) < 320 && Math.abs(dx) > 40 && !this.cooldownBusy('ray', 20)) {
        this.sx = self.facing === Math.sign(dx) ? 0 : Math.sign(dx) * 0.3;
        this.held = Button.Attack;
        return true;
      }
      return false;
    }
    if (!self.grounded) {
      // airborne: drop it straight onto a rival below, or throw it forward at one ahead
      if (Math.abs(dx) < 22 && dy > 20 && dy < 200) {
        this.sy = 1;
        this.held = Button.Attack;
        return true;
      }
      if (Math.abs(dx) < 130 && Math.abs(dx) > 30 && dy > -20 && dy < 80 && Math.sign(dx) === self.facing && this.params.itemSense > 0.4) {
        this.sx = Math.sign(dx);
        this.held = Button.Attack;
        return true;
      }
      return false;
    }
    if (Math.abs(dx) < 150 && Math.abs(dy) < 60 && Math.abs(dx) > 30) {
      this.sx = Math.sign(dx);
      this.held = Button.Attack;
      return true;
    }
    if (Math.abs(dx) <= 40 && dy < -50) {
      this.sy = -1;
      this.held = Button.Attack;
      return true;
    }
    return false;
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

    // the target hangs on / climbs from the ledge of our platform: trap its get-up
    const tl = p.edgeguard ? trapLedge(self, tgt) : null;
    if (tl && this.ledgeTrap(self, world, tgt, tl, ai)) return;
    if (!tl) this.trapLedgeRef = null;

    // thinking cadence: only roll new attack decisions every few frames, except that the moment the target becomes
    // punishable (end lag, landing lag, broken shield, lying down) the CPU may answer at once instead of waiting
    const window = punishWindow(tgt);
    const opening = window > 0;
    if (opening && !this.sawOpening && this.rnd() < p.punish) {
      this.thinkLeft = 0;
      // a whiff it is not already next to: run in on it if the window is long enough to get there
      if (this.rnd() < p.whiffPunish) this.punishUntil = world.tick + window;
    }
    if (!opening) this.punishUntil = -1;
    this.sawOpening = opening;
    const chasing = world.tick < this.comboUntil || world.tick < this.punishUntil;
    const decide = --this.thinkLeft <= 0 || chasing;
    if (decide) {
      this.thinkLeft = p.thinkEvery;
      for (let k = 0; k < USE_SLOTS; k++) this.useCount[k] *= 0.93;
    }

    // face the target (ground) before committing to anything
    if (grounded && self.facing !== dir && dist > 4 && self.state !== 'dash') {
      this.sx = dir * 0.3; // a light tilt turns around without dashing
    }

    if (decide) {
      if (!chasing && this.rnd() < p.mistakes) {
        // wasted action: hop, shield, or a random jab
        const r = this.rnd();
        if (grounded && r < 0.35) this.held |= Button.Jump;
        else if (grounded && r < 0.6) this.held |= Button.Attack;
        return;
      }
      if (this.chooseAction(self, world, tgt, ai, dist, dy, dir, window)) return;
    }

    this.moveTowards(self, world, tgt, ai, dist, dy, dir, chasing);
  }

  /** Does move `m` reach the target if started now (`at`: an assumed target position, e.g. where a ledge get-up ends)? */
  private reaches(self: Fighter, m: AiMove, tgt: Fighter, atX?: number, atY?: number): boolean {
    const f = self.facing;
    const lead = m.startup * 0.5;
    const tx = atX ?? tgt.x + tgt.vx * lead;
    const ty = atY ?? tgt.y + (tgt.grounded ? 0 : tgt.vy * lead);
    const half = tgt.hw * tgt.sizeMul + 2;
    // a lunge's hitbox comes out further forward (dash attacks, lunging smashes, a command grab's dash)
    const fwd = self.grounded ? m.travelHit : 0;
    const x0 = self.x + (f > 0 ? m.minX : -m.maxX - fwd);
    const x1 = self.x + (f > 0 ? m.maxX + fwd : -m.minX);
    const y0 = self.y + m.minY + (self.grounded ? 0 : self.vy * m.startup * 0.3);
    const y1 = self.y + m.maxY + (self.grounded ? 0 : self.vy * m.startup * 0.3);
    return tx + half > x0 && tx - half < x1 && ty > y0 && ty - tgt.hurtH < y1;
  }

  private score(self: Fighter, world: World, m: AiMove, tgt: Fighter, ai: CharacterAi, dir: number): number {
    const p = this.params;
    // kill power: a skilled CPU computes whether the hit kills from its knockback (the engine's own launch physics), a weak
    // one goes by a rough "big percent = use a finisher" rule
    const killZone = Math.min(1, Math.max(0, (tgt.damage - 50) / 90));
    const finisher = ai.finishers.includes(m.id) ? 1 : 0;
    // a resource spender whose power grows with what it spends (Brick's Vent): value it at today's power
    const sp = ai.spender;
    const pw = sp?.scale && m.slot === sp.slot ? sp.scale(self.res[sp.key] ?? 0) : null;
    if (pw && m.kb) m = this.scaledMove(m, pw.damageMult, pw.kbMult);
    const guess = (m.power * 0.07 * killZone + finisher * killZone * 6) * (1 - p.killConfirm);
    let kill = 0;
    if (p.killConfirm > 0 && m.kb && tgt.damage > 30) {
      const d = (m.kb.away ? (tgt.x >= self.x ? 1 : -1) : m.kind === 'aerial' ? self.facing : dir) as 1 | -1;
      kill = killScore(self, tgt, world, m, d) * 22 * p.killConfirm;
    }
    let s = (m.dmg + guess + kill) * (34 / (m.startup + 12));
    const lag = m.total - m.startup - m.active;
    const shielding = tgt.state === 'shield' || tgt.state === 'shieldstun';
    s -= lag * (shielding ? 0.12 : 0.03);
    if (m.charge) s *= 0.9;
    s /= 1 + 0.45 * this.useCount[m.index]; // staleness: recently used moves lose appeal, so the CPU mixes things up
    if (m.kind === 'grab') s = (shielding ? 12 : 3 + (tgt.state === 'run' ? 0 : 1)) + (ai.grabBonus ?? 0);
    // a soaked rival (Riptide's tide moves): the throws wring the soak out for extra damage and launch
    if (m.kind === 'grab' && ai.grabBonus && tgt.status.soak > 0) s += 2 * tgt.soakLevel;
    // a command grab beats shields outright, and its slam hits hard
    if (m.cmdGrab) s = (shielding ? 16 : 4) + (ai.grabBonus ?? 0) + kill;
    return s + this.rnd() * 1.5;
  }

  private readonly scaled: AiMove = { id: '', index: 0, kind: 'special', startup: 0, active: 0, total: 0, dmg: 0, maxHit: 0, power: 0, minX: 0, maxX: 0, minY: 0, maxY: 0, charge: false, proj: false, travel: 0, travelHit: 0, kb: null, landingLag: 0 };
  private readonly scaledKb: NonNullable<AiMove['kb']> = { base: 0, scaling: 0, angle: 0, damage: 0 };
  /** A copy of `m` (reused) with its damage and knockback multiplied (knockback is linear in base and scaling). */
  private scaledMove(m: AiMove, dmg: number, kb: number): AiMove {
    const o = Object.assign(this.scaled, m);
    o.kb = Object.assign(this.scaledKb, m.kb, { base: m.kb!.base * kb, scaling: m.kb!.scaling * kb, damage: m.kb!.damage * dmg });
    o.dmg = m.dmg * dmg;
    o.maxHit = m.maxHit * dmg;
    o.power = m.power * kb;
    return o;
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

  /** An aerial thrown from here (off the stage) leaves a simulated way back to ledge `l` (its own motion included). */
  private aerialSafe(self: Fighter, world: World, m: AiMove, l: Ledge): boolean {
    const mi = NORMAL_INPUTS[m.id];
    const from = { x: self.x, y: self.y, vx: self.vx, vy: self.vy };
    return canGetBack(self, world, l, aiFor(self.data.id).recovery.aim, from, !!(self.data.glide || self.data.hover), { ax: mi.fwd * self.facing, ay: mi.up, total: Math.round(m.total) });
  }

  /**
   * Try an aerial that reaches the target now. With `safe` (a ledge): only one that still leaves a way back to it (off the
   * stage), and otherwise only one that lands back on something when thrown near or past the stage's edge.
   */
  private tryAerial(self: Fighter, world: World, tgt: Fighter, chance: number, safe?: Ledge): boolean {
    if (self.helpless || this.rnd() > chance) return false;
    const ai = aiFor(self.data.id);
    // an aerial whose hitbox would come out after we land is only landing lag next to the opponent
    const land = this.framesToLand(self, world);
    let best: AiMove | null = null;
    let bestScore = -Infinity;
    const dir = tgt.x >= self.x ? 1 : -1;
    for (const m of moveTable(self.data)) {
      if (m.kind !== 'aerial' || m.startup >= land || !this.reaches(self, m, tgt)) continue;
      if (tgt.invuln >= m.startup + m.active) continue;
      const s = this.score(self, world, m, tgt, ai, dir);
      if (s > bestScore) {
        bestScore = s;
        best = m;
      }
    }
    if (!best) return false;
    const edge = safe ?? (land === Infinity ? this.nearLedge(self, world) : null);
    if (edge && !this.aerialSafe(self, world, best, edge)) return false;
    const mi = NORMAL_INPUTS[best.id];
    this.useCount[best.index]++;
    this.startPlan(world, best.id, Button.Attack, self.facing * mi.fwd, mi.up);
    this.runPlan(self, world);
    return true;
  }

  /** Can this move be started right now (grounded / airborne, dash out of a run, resources, our facing)? */
  private usableNow(self: Fighter, m: AiMove, dir: number): boolean {
    const grounded = self.grounded;
    if (m.kind === 'special') {
      if (m.air ? grounded : !grounded) return false;
      if (m.slot && self.resolveVariant(m.slot) !== m.id) return false; // another variant is the live one (Agni's levels)
      const md = self.data.moves[m.id];
      if (md?.requires && (self.res[md.requires.key] ?? 0) < md.requires.min) return false;
      const sp = aiFor(self.data.id).spender;
      if (sp && sp.slot === m.slot && (self.res[sp.key] ?? 0) < sp.min) return false;
      if (grounded && self.facing !== dir) return false;
      return true;
    }
    if (grounded === (m.kind === 'aerial')) return false; // aerials only in the air, ground moves only on the ground
    if (m.kind === 'dash') return grounded && self.state === 'run' && Math.abs(self.vx) > 1.7 && self.facing === dir && Math.sign(self.vx) === dir && this.runFrames >= 6;
    if (grounded && self.facing !== dir && m.kind !== 'smash') return false;
    return true;
  }

  private chooseAction(self: Fighter, world: World, tgt: Fighter, ai: CharacterAi, dist: number, dy: number, dir: number, window: number): boolean {
    const p = this.params;
    const grounded = self.grounded;
    const shielding = tgt.state === 'shield' || tgt.state === 'shieldstun';
    const tgtVulnerable = window > 0;

    // ultimate
    const ultCost = self.data.ultimate?.cost ?? 100;
    const transformed = self.data.transform ? (self.res[self.data.transform.resource] ?? 0) > 0 : false;
    // a strong CPU fires it often and well (in range, on a target that can be hit, ideally one that cannot block or dodge
    // it); a weak one rarely, with a sloppy range read and no check that the target can be hit at all
    const q = this.q;
    if (self.meter >= ultCost && self.data.moves.ultimate && !self.helpless && !transformed && this.rnd() < 0.15 + 0.4 * q) {
      const cin = self.data.moves.ultimate.hitboxes.some((h) => h.cinematic);
      const range = ai.ultimateRange * (1 + 0.7 * (1 - q));
      const open = tgt.state !== 'ko' && (q < 0.3 || tgt.invuln === 0);
      // timing: a sharp CPU waits for an opening (a whiff, a landing, a lying rival) or a kill percent
      const timed = q < 0.5 || tgtVulnerable || tgt.damage >= 70 || (!shielding && this.rnd() < 0.25);
      if (open && timed && ((cin && dist < range && Math.abs(dy) < 40 && grounded) || (!cin && dist < range))) {
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

    if (grounded && this.slidingOffEdge(self) && this.mode !== 'edgeguard') {
      this.sx = 0; // stop first: attacking out of a dash at the stage edge slides the CPU off the stage
      return true;
    }
    // do not commit to a move that is still running when a hazard over us goes off
    const due = this.hazardDue(self, world);
    const candidates = this.candidates;
    candidates.length = 0;
    const consider = (m: AiMove): void => {
      if (m.total >= due) return;
      if (!this.usableNow(self, m, dir)) return;
      // a long-range shot (rocket launcher) is a poke from afar: up close the quicker normals do the job
      if (m.proj && (world.tick < this.shotReady[m.index] || (m.maxX > 120 && dist < 60))) return;
      const fwdDir = m.kind === 'special' || NORMAL_INPUTS[m.id]?.fwd !== 0 ? dir : self.facing;
      // a lunge (and a dash attack carries the run's momentum too) must not slide us off the platform
      if (grounded && m.travel > 0 && this.lungesOff(self, m.travel + 6 + Math.max(0, self.vx * fwdDir) * 10, fwdDir)) return;
      // any ground move started while still sliding toward an edge (a landing, a run) carries that slide with it
      const sl = Math.sign(self.vx);
      if (grounded && Math.abs(self.vx) > 0.8 && this.lungesOff(self, Math.abs(self.vx) * 12 + (m.charge ? 30 : 0) + (sl === fwdDir ? m.travel : 0), sl)) return;
      if (!grounded && m.kind === 'special' && m.travel > 0 && this.airLungesOff(self, world, m.travel, fwdDir)) return;
      // the target cannot be hurt for the whole of this move's hit (respawn / roll / get-up invincibility)
      if (tgt.invuln >= m.startup + m.active) return;
      if (this.reaches(self, m, tgt)) candidates.push(m);
    };
    for (const m of moveTable(self.data)) consider(m);
    for (const m of specialTable(self.data, ai)) if (!m.air) consider(m); // dives are aimed separately (tryDive)

    if (p.smart && tgt.armorThreshold() > 0 && grounded && dist < 90 && candidates.every((m) => m.kind !== 'grab' && !m.cmdGrab && m.maxHit <= tgt.armorThreshold())) {
      // the target is mid armored windup and nothing we have breaks it: step out of range and punish the lag
      this.sx = -dir;
      this.clampEdge(self);
      return true;
    }
    if (candidates.length > 0) {
      // aggression gate (a CPU in range does not always swing)
      const punishing = tgtVulnerable && this.rnd() < p.punish;
      const chasing = world.tick < this.comboUntil;
      if (!punishing && !chasing && this.stall < 300 && this.rnd() > p.aggression) return false;
      let best: AiMove | null = null;
      let bestScore = -Infinity;
      const armor = tgt.armorThreshold(); // an armored move cannot be interrupted by weak hits: do not poke into it
      const hasGrab = candidates.some((c) => c.kind === 'grab' || c.cmdGrab);
      for (const m of candidates) {
        const grabby = m.kind === 'grab' || m.cmdGrab;
        if (p.smart && armor > 0 && !grabby && m.maxHit <= armor) continue;
        if (p.smart && shielding && !grabby && hasGrab) continue;
        if (!p.smart && grabby && this.rnd() < 0.7) continue;
        // punishing a whiff: only what comes out before the target can act again
        if (punishing && m.startup > window + 1) continue;
        const s = this.score(self, world, m, tgt, ai, dir);
        if (s > bestScore) {
          bestScore = s;
          best = m;
        }
      }
      if (best) {
        this.execMove(self, world, best, tgt, dir, shielding || tgtVulnerable, tgtVulnerable ? window : 0);
        return true;
      }
    }

    // specials: ranged zoning, setups, gap closers, buffs, dives
    if ((grounded || p.smart) && due > 40) {
      if (this.trySpecials(self, world, tgt, ai, dist, dy, dir)) return true;
    }

    const main = this.mainPlatform(world);
    const tgtNearEdge = tgt.x > main.right - 30 || tgt.x < main.x + 30;
    // short-hop aerial pressure (and a retreating back air against a rival running in)
    if (grounded && p.smart && Math.abs(dy) < 40 && dist < 120 && dist > 18 && !shielding && this.rnd() < p.shortHop * 0.4 && !this.cooldownBusy('sh', 30)) {
      if (this.shortHopAerial(self, world, tgt, dir, dist)) return true;
    }
    // go up to the opponent in the air with an aerial approach
    if (grounded && p.smart && !tgtNearEdge && dist < 110 && dist > 40 && Math.abs(dy) < 70 && this.rnd() < 0.18 * p.aggression + 0.05 && !this.cooldownBusy('hop', 40)) {
      this.hopTarget = true;
      this.held |= Button.Jump;
      this.sx = dir;
      return true;
    }
    return false;
  }

  private readonly candidates: AiMove[] = [];

  /**
   * A short-hop aerial: Jump and Attack together (the jump comes first and the attack waits in the buffer, so the hop is a
   * short one), the aerial's direction held at take-off. Against a rival running in, a retreating back air: turn away
   * first, hop away and hit behind. Picks the aerial that reaches where the rival will be.
   */
  private shortHopAerial(self: Fighter, world: World, tgt: Fighter, dir: number, dist: number): boolean {
    const s = self.stats;
    const jsq = s.jumpsquatFrames;
    const v0 = Math.sqrt(2 * s.gravity * s.shortHopHeight);
    const approaching = tgt.vx * -dir > 1 && dist < 90;
    const retreat = approaching && this.rnd() < 0.6;
    let drift = retreat ? -dir : dist > 50 ? dir : 0;
    // never hop off the platform: the drift must leave solid ground under the landing spot
    if (drift !== 0 && this.roomAhead(self, drift) < 60) {
      if (retreat) return false;
      drift = 0;
    }
    let best: AiMove | null = null;
    let bestScore = -Infinity;
    for (const m of moveTable(self.data)) {
      if (m.kind !== 'aerial') continue;
      const mi = NORMAL_INPUTS[m.id];
      // the aerial's facing: we face the target, or face away for a retreating back air
      const face = retreat ? -dir : dir;
      if (retreat && mi.fwd !== -1) continue;
      if (!retreat && mi.fwd === -1) continue;
      const t = m.startup + 1;
      const h = Math.max(0, v0 * t - (s.gravity * t * t) / 2);
      const x = self.x + drift * s.airSpeed * 0.6 * (t + jsq);
      const tx = tgt.x + tgt.vx * (t + jsq) * 0.7;
      const x0 = x + (face > 0 ? m.minX : -m.maxX);
      const x1 = x + (face > 0 ? m.maxX : -m.minX);
      const y = self.y - h;
      if (!(tx + tgt.hw > x0 && tx - tgt.hw < x1 && tgt.y > y + m.minY && tgt.y - tgt.hurtH < y + m.maxY)) continue;
      if (tgt.invuln >= m.startup + m.active + jsq) continue;
      const sc = this.score(self, world, m, tgt, aiFor(self.data.id), dir);
      if (sc > bestScore) {
        bestScore = sc;
        best = m;
      }
    }
    if (!best) return false;
    const mi = NORMAL_INPUTS[best.id];
    this.useCount[best.index]++;
    const seq: SeqStep[] = [];
    const face = retreat ? -dir : dir;
    if (retreat && self.facing !== face) seq.push({ btn: 0, sx: face * 0.35, sy: 0 }); // turn around first
    seq.push({ btn: Button.Jump | Button.Attack, sx: drift * 0.5, sy: 0 });
    for (let i = 1; i < jsq; i++) seq.push({ btn: 0, sx: drift * 0.6, sy: 0 });
    // the stick at take-off picks the aerial (back = toward the rival behind us for the retreating back air)
    for (let i = 0; i < 3; i++) seq.push({ btn: 0, sx: mi.fwd === 0 ? 0 : face * mi.fwd, sy: mi.up });
    seq.push({ btn: 0, sx: drift, sy: 0 });
    this.startPlan(world, `sh_${best.id}`, 0, 0, 0, { seq });
    this.runPlan(self, world);
    return true;
  }

  /** `window`: frames the target stays punishable (a charged smash must still land inside it); 0 = no limit. */
  private execMove(self: Fighter, world: World, m: AiMove, tgt: Fighter, dir: number, safe: boolean, window = 0): void {
    this.useCount[m.index]++;
    if (m.proj) this.shotReady[m.index] = world.tick + SHOT_GAP;
    const p = this.params;
    if (m.kind === 'special') {
      const [bx, by] = SPECIAL_DIR[m.slot ?? 'neutralB'] ?? [0, 0];
      this.startPlan(world, m.id, Button.Special, bx * dir, by);
      this.runPlan(self, world);
      return;
    }
    const mi = NORMAL_INPUTS[m.id];
    const btn = mi.button === 'smash' ? Button.Smash : mi.button === 'grab' ? Button.Grab : Button.Attack;
    let sx = 0;
    let sy = mi.up;
    if (m.kind === 'aerial') sx = self.facing * mi.fwd;
    else if (m.id === 'fsmash' || m.kind === 'dash') sx = dir;
    else if (mi.fwd !== 0) sx = dir * mi.fwd;
    // charge smashes only when it is safe (vulnerable or shielding target) or the CPU is cautious-smart
    let hold = 0;
    if (m.charge) {
      hold = safe ? Math.round(10 + 40 * p.charge * this.rnd()) : Math.round(14 * p.charge * this.rnd());
      if (window > 0) hold = Math.max(0, Math.min(hold, window - m.startup - m.active));
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

  /**
   * Ledge trap: the rival hangs on (or climbs from) the ledge of the platform we stand on. Stand off the corner at a spot
   * that covers the get-up and the roll, shield its get-up attack, and time a hit for when its get-up invincibility ends
   * (the candidate filter skips moves whose hit would land while it is still invincible). Returns false to fall back on
   * the ordinary offence (a weaker CPU, or the trap roll failed).
   */
  private ledgeTrap(self: Fighter, world: World, tgt: Fighter, l: Ledge, ai: CharacterAi): boolean {
    const p = this.params;
    if (this.trapLedgeRef !== l) {
      this.trapLedgeRef = l;
      this.trapDist = this.rnd() < p.ledgeTrap ? 36 + this.rnd() * 26 : -1;
    }
    if (this.trapDist < 0) return false;
    const inward = -l.side;
    const dir = l.x >= self.x ? 1 : -1;
    const dist = Math.abs(tgt.x - self.x);
    const dy = tgt.y - self.y;
    // a get-up attack / anything coming: the ordinary defence handles it (checked before offence each frame)
    // hit the hanging fighter if something of ours reaches below the edge (it has no ledge invincibility here)
    if (tgt.state === 'ledge' && this.chooseAction(self, world, tgt, ai, dist, dy, dir, 0)) return true;
    if (tgt.state === 'ledgeClimb') {
      // where the get-up ends: the plain climb lands just in from the corner, a roll ~26 px further
      const climbX = l.x + inward * (tgt.hw + 2);
      const rollX = climbX + inward * 26;
      if (this.trapHit(self, world, tgt, ai, climbX, rollX, l.y)) return true;
    }
    const want = l.x + inward * this.trapDist;
    const off = want - self.x;
    if (Math.abs(off) > 6) this.sx = Math.sign(off) * (Math.abs(off) > 30 ? 1 : 0.5);
    else {
      this.sx = 0;
      this.facingFix(self, tgt);
    }
    this.clampEdge(self);
    return true;
  }

  /** Fire the best move that will hit a get-up ending at x1 (or x2) once its invincibility is gone. */
  private trapHit(self: Fighter, world: World, tgt: Fighter, ai: CharacterAi, x1: number, x2: number, y: number): boolean {
    if (!self.grounded || !CAN_ACT.has(self.state)) return false;
    const dir = x1 >= self.x ? 1 : -1;
    let best: AiMove | null = null;
    let bestScore = -Infinity;
    for (const m of moveTable(self.data)) {
      if (!this.usableNow(self, m, dir) || m.kind === 'grab') continue;
      // the hit must come out just as the invincibility runs out (not before: it would pass through)
      if (tgt.invuln >= m.startup + m.active || tgt.invuln < m.startup - 3) continue;
      if (this.lungesOff(self, m.travel, dir)) continue;
      const r1 = this.reaches(self, m, tgt, x1, y);
      const r2 = this.reaches(self, m, tgt, x2, y);
      if (!r1 && !r2) continue;
      const sc = this.score(self, world, m, tgt, ai, dir) + (r1 && r2 ? 6 : 0);
      if (sc > bestScore) {
        bestScore = sc;
        best = m;
      }
    }
    if (!best) return false;
    this.execMove(self, world, best, tgt, dir, true);
    return true;
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
    if (!self.grounded && this.tryDive(self, world, tgt, ai)) return true;
    // in the air a special (a steered missile, a charged shot) holds us up while we fall: only over something to land on
    if (!self.grounded && this.framesToLand(self, world) === Infinity) return false;
    // upgrade our deployables when one is near the action (Gizmo's Overclock: forward = more damage)
    const bf = ai.buff;
    if (bf && p.smart && (self.res[bf.key] ?? 0) >= bf.min && usable(bf.slot) && !this.cooldownBusy('buff', 360)) {
      for (const d of world.findDeployables(self.id, bf.deployable)) {
        if (!d.active || Math.abs(d.x - self.x) > bf.range * 0.9 || Math.abs(tgt.x - d.x) > 260) continue;
        const [bx, by] = SPECIAL_DIR[bf.slot] ?? [0, 1];
        this.facingFix(self, tgt);
        this.startPlan(world, 'buff', Button.Special, bx * dir, by, { sx2: dir * 0.8, sy2: 0, stickFrames: 14 });
        this.runPlan(self, world);
        return true;
      }
      this.cooldown.buff = 30; // nothing to upgrade yet: look again soon
    }
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
        // with a Blink marker out, the slot is the recall (a warp back, not the strike): only a recall when it is wanted
        if (ai.recall?.slot === slot && world.findDeployables(self.id, ai.recall.marker).length > 0) continue;
        const lunge = travel(this.slotMove(self, slot), attackDecel(self.data));
        // a lunge starts the way we face: turned away from the rival it would carry us the wrong way (off the stage, too)
        if (lunge > 0 && self.grounded && self.facing !== dir) continue;
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

  /**
   * A diving special (Halcyon's Falcon Dive) from the air onto a rival below: the dive's own angle (its motion) decides where
   * it comes down; only fired when that spot is over solid stage (never a dive into the pit).
   */
  private tryDive(self: Fighter, world: World, tgt: Fighter, ai: CharacterAi): boolean {
    const slot = ai.dive;
    if (!slot || self.helpless || !this.params.smart) return false;
    const m = this.slotMove(self, slot);
    const mo = m?.motion?.find((x) => x.vy !== undefined && x.vy > 0);
    if (!m || !mo || mo.vy === undefined) return false;
    const dy = tgt.y - self.y;
    if (dy < 24 || dy > 240) return false;
    const fall = Math.max(0, dy - Math.max(0, self.vy) * m.startup);
    const face = self.facing;
    if ((tgt.x - self.x) * face < -10) return false; // it dives the way we face
    const landX = self.x + self.vx * m.startup + face * (mo.vx ?? 0) * (fall / mo.vy);
    if (Math.abs(landX - (tgt.x + tgt.vx * (m.startup + fall / mo.vy))) > 22 + tgt.hw) return false;
    if (!overStage(landX, tgt.y - 4, world) || tgt.invuln > m.startup + 4) return false;
    if (this.rnd() > 0.35 + 0.4 * this.params.aggression || this.cooldownBusy('dive', 90)) return false;
    const [bx, by] = SPECIAL_DIR[slot] ?? [0, 1];
    this.startPlan(world, 'dive', Button.Special, bx * face, by, { sx2: face, sy2: 0, stickFrames: 4 });
    this.runPlan(self, world);
    return true;
  }

  private moveTowards(self: Fighter, world: World, tgt: Fighter, ai: CharacterAi, dist: number, dy: number, dir: number, chasing = false): void {
    const p = this.params;
    if (this.retreat > 0) {
      this.retreat--;
      if (self.grounded && dist < 90 && self.state !== 'attack' && !chasing) {
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
      // (a deliberate edge-guard leap is a scripted plan of its own, see leapAerial)
      if (!acrossGap) {
        const main = this.mainPlatform(world);
        if ((this.sx > 0 && self.x > main.right - 6) || (this.sx < 0 && self.x < main.x + 6)) this.sx = 0;
      }
      if (this.hotAhead(self, world, this.sx)) this.sx = 0;
      if (p.smart && this.tryAerial(self, world, tgt, chasing ? 1 : p.aggression)) return;
      // winged fighters glide in on a rival ahead and below, then strike out of the glide (Halcyon's Talon Dive)
      const gl = self.data.glide;
      if (gl && p.smart && self.jumpsLeft === 0 && self.vy > 0 && !self.helpless && self.facing === dir && dist > 30 && dist < 200 && dy > -10 && dy < 120 && overStage(self.x + dir * 40, self.y, world) && self.glideFrames < gl.max) {
        this.held |= Button.Jump;
        if (gl.attack && self.gliding && dist < 80 && dy < 50 && this.rnd() < 0.5) this.held |= Button.Attack;
        return;
      }
      const over = this.mainPlatform(world);
      if (self.vy > 0 && tgt.y > self.y + 30 && dist < 40 && p.smart && self.x > over.x && self.x < over.right) this.sy = 1; // fast fall onto them
      return;
    }
    // the target is off the stage and we are not edge-guarding it: hold our ground (no jump after it, no run off the edge)
    if (this.mode === 'edgeguard' && self.grounded && offstage(tgt, world)) {
      this.sx = dist > 30 ? dir * 0.5 : 0;
      this.clampEdge(self);
      return;
    }
    const want = chasing ? 0 : ai.spacing * (p.smart ? 1 : 0.7) * (this.stall > 420 ? 0.5 : 1);
    const upAbove = dy < -46;
    const downBelow = dy > 46;
    // a rival falling toward us from above: a juggling CPU waits under its landing spot (and hits it with an up attack
    // from the candidates) instead of jumping into its aerial
    if (upAbove && !tgt.grounded && tgt.vy > 0 && tgt.state !== 'hitstun' && dist < 160 && this.rnd() < p.juggle) {
      const land = this.landingX(tgt, world);
      if (land !== null) {
        const off = land - self.x;
        this.sx = Math.abs(off) < 6 ? 0 : Math.sign(off) * (Math.abs(off) > 30 ? 1 : 0.5);
        this.clampEdge(self);
        return;
      }
    }
    if (upAbove && dist < 120 && !this.cooldownBusy('jmp', chasing ? 20 : 50)) {
      this.held |= Button.Jump;
      this.sx = dir;
      this.hopTarget = true;
      return;
    }
    // drop through a one-way platform onto a rival below (only with something under it to land on, never into the pit)
    if (downBelow && self.groundPlat && self.groundPlat.kind === 'pass' && (dist < 140 || this.stall > 480) && this.groundBelow(self, world, self.groundPlat)) {
      this.held |= Button.Jump;
      this.sy = 1; // drop through
      return;
    }
    if (dist > want) {
      // far: dash in; nearly in range: walk the last steps so the spacing is not overshot. Running in on a whiff / chasing
      // a combo always goes full speed (a dash attack may come out of it)
      this.sx = chasing || dist - want > 50 ? dir : dir * 0.5;
    } else if (dist < want * 0.5 && p.smart && tgt.state !== 'shield' && this.rnd() < 0.3) {
      this.sx = -dir * 0.5; // too close: back off a step to regain spacing
    }
    // do not walk into a hit that is already coming out (a rival swinging in place): wait just outside it for the whiff
    if (p.smart && !chasing && this.sx * dir > 0 && tgt.state === 'attack' && punishWindow(tgt) === 0 && this.walksIntoHit(self, world, tgt, dir)) this.sx = 0;
    if (this.hotAhead(self, world, Math.sign(this.sx))) this.sx = 0; // wait for the eruption in front of us to pass
    const wanted = this.sx;
    if (!(downBelow && dist < 160)) this.clampEdge(self);
    // stopped at our edge while the target stands on another platform within jumping range: jump the gap
    if (wanted !== 0 && this.sx === 0 && tgt.grounded && tgt.groundPlat && tgt.groundPlat !== self.groundPlat && dist < 300 && (Math.abs(dy) < 110 || (this.stall > 480 && dy > 0 && dy < 200)) && self.jumpsLeft > 0 && !this.cooldownBusy('gap', 45)) {
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

  /** The ledge nearest the fighter (to check a way back when it acts over the pit). */
  private nearLedge(self: Fighter, world: World): Ledge | null {
    let best: Ledge | null = null;
    let bd = Infinity;
    for (const l of world.ledges) {
      const d = Math.abs(l.x - self.x) + Math.abs(l.y - self.y) * 0.5;
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  }

  /** Is there another platform below `pl` under the fighter (somewhere to land after dropping through it)? */
  private groundBelow(self: Fighter, world: World, pl: Platform): boolean {
    for (const p of world.platforms) if (p !== pl && self.x >= p.x + 4 && self.x <= p.right - 4 && p.top > pl.top + 4) return true;
    return false;
  }

  /** Where a falling fighter will land (x), from its current fall; null over a pit. */
  private landingX(f: Fighter, world: World): number | null {
    const s = f.stats;
    let x = f.x;
    let y = f.y;
    let vx = f.vx;
    let vy = f.vy;
    for (let t = 0; t < 90; t++) {
      vy = Math.min(s.fallSpeed, vy + s.gravity);
      vx = vx > s.airFriction ? vx - s.airFriction : vx < -s.airFriction ? vx + s.airFriction : 0;
      const py = y;
      x += vx;
      y += vy;
      for (const p of world.platforms) if (x >= p.x && x <= p.right && py <= p.top && y >= p.top) return x;
    }
    return null;
  }

  /** Would stepping toward the rival put us inside one of its hitboxes still to come (a rival swinging in place)? */
  private walksIntoHit(self: Fighter, world: World, tgt: Fighter, dir: number): boolean {
    const m = tgt.move;
    if (!m) return false;
    const reachFwd = Math.max(0, ...m.hitboxes.filter((h) => h.damage > 0 && hitboxEnd(m, h) >= tgt.moveFrame).map((h) => h.x + h.w / 2));
    if (reachFwd <= 0) return false;
    // facing us? then its forward reach covers the gap between us
    const facingUs = (self.x - tgt.x) * tgt.facing > 0;
    const gap = Math.abs(self.x - tgt.x) - self.hw - 6;
    void world;
    void dir;
    return facingUs ? gap < reachFwd + 10 : gap < 20;
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

  /**
   * An edge-guard leap: a full hop out toward the off-stage rival with an aerial timed to meet it, taken only when the aerial
   * reaches where the rival will be and a simulated recovery from where the aerial ends gets back to the ledge.
   */
  private leapAerial(self: Fighter, world: World, tgt: Fighter, l: Ledge): boolean {
    const s = self.stats;
    const out = l.side;
    const jsq = s.jumpsquatFrames;
    const v0 = -Math.sqrt(2 * s.gravity * s.jumpHeight);
    const sim: Sim = { x: self.x, y: self.y, vx: self.vx, vy: 0 };
    const tg = { x: tgt.x, y: tgt.y, vy: tgt.vy };
    const ts = tgt.stats;
    // our arc (jumpsquat, then a full hop drifting out) and the rival's fall, frame by frame
    const arc: Sim[] = [];
    const tgs: { x: number; y: number }[] = [];
    for (let t = 0; t < 48; t++) {
      if (t === jsq) sim.vy = v0;
      if (t >= jsq) drift(self, sim, out);
      arc.push({ ...sim });
      tg.vy = Math.min(ts.fallSpeed, tg.vy + ts.gravity);
      tg.x += tgt.vx * 0.9;
      tg.y += tg.vy;
      tgs.push({ x: tg.x, y: tg.y });
    }
    let pick: AiMove | null = null;
    let at = -1;
    for (const m of moveTable(self.data)) {
      if (m.kind !== 'aerial' || NORMAL_INPUTS[m.id].fwd === -1) continue;
      for (let t = jsq + 1; t + m.startup < 46; t += 2) {
        const me = arc[t + m.startup];
        const them = tgs[t + m.startup];
        const x0 = me.x + (out > 0 ? m.minX : -m.maxX);
        const x1 = me.x + (out > 0 ? m.maxX : -m.minX);
        if (!(them.x + tgt.hw > x0 && them.x - tgt.hw < x1 && them.y > me.y + m.minY && them.y - tgt.hurtH < me.y + m.maxY)) continue;
        if (pick && m.dmg <= pick.dmg) break;
        pick = m;
        at = t;
        break;
      }
    }
    if (!pick) return false;
    // the aerial thrown from that point of the arc (its own motion included), then a simulated way back?
    const mi = NORMAL_INPUTS[pick.id];
    const p0 = arc[at];
    const from = { x: p0.x, y: p0.y, vx: p0.vx, vy: p0.vy, jumpsLeft: self.stats.doubleJumps, airDodgeUsed: false, helpless: false, facing: out as 1 | -1 };
    if (!canGetBack(self, world, l, aiFor(self.data.id).recovery.aim, from, !!(self.data.glide || self.data.hover), { ax: out * mi.fwd, ay: mi.up, total: Math.round(pick.total) })) return false;
    const seq: SeqStep[] = [];
    for (let t = 0; t < at; t++) seq.push({ btn: t < jsq + 2 ? Button.Jump : 0, sx: t === 0 ? 0 : out, sy: 0 });
    for (let i = 0; i < 3; i++) seq.push({ btn: i === 0 ? Button.Attack : 0, sx: mi.fwd === 0 ? 0 : out * mi.fwd, sy: mi.up });
    this.useCount[pick.index]++;
    this.startPlan(world, `leap_${pick.id}`, 0, 0, 0, { seq });
    this.runPlan(self, world);
    return true;
  }

  /**
   * Stand at the edge the opponent is coming back to and hit it as it tries to. The edge is picked per platform: the free
   * ledge nearest the opponent on the platform we stand on (Skyhold's islands, the Wreck's decks), not always the main stage.
   */
  private edgeguard(self: Fighter, world: World, tgt: Fighter, ai: CharacterAi): boolean {
    if (!self.grounded || !self.groundPlat) return false;
    let l: Ledge | null = null;
    let bd = Infinity;
    for (const c of world.ledges) {
      if (c.platform !== self.groundPlat) continue;
      const d = Math.abs(c.x - tgt.x) + Math.abs(c.y - tgt.y) * 0.5;
      if (d < bd) {
        bd = d;
        l = c;
      }
    }
    if (!l || bd > 420) return false;
    const p = this.params;
    const edgeX = l.x - l.side * 14;
    const dx = tgt.x - self.x;
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
    // a move that reaches it from the edge (a down-angled tilt or smash on a rival recovering low): use it
    if (Math.abs(dx) < 110 && Math.abs(tgt.y - self.y) < 90 && this.thinkLeft-- <= 0) {
      this.thinkLeft = p.thinkEvery;
      if (this.chooseAction(self, world, tgt, ai, Math.abs(dx), tgt.y - self.y, dx >= 0 ? 1 : -1, punishWindow(tgt))) return true;
    }
    // skilled CPUs leap out after them when they are healthy and still have a jump, but only with an aerial that meets the
    // rival out there and a simulated way back afterwards (a leap that cannot attack, or cannot get home, is not taken)
    if (p.edgeguardLeap > 0 && self.jumpsLeft > 0 && self.damage < 90 && Math.abs(self.x - edgeX) < 24 && Math.abs(dx) < 150 && tgt.y > self.y - 40 && tgt.y < self.y + 120 && !tgt.helpless && !this.cooldownBusy('leap', 60) && this.rnd() < p.edgeguardLeap) {
      if (this.leapAerial(self, world, tgt, l)) return true;
    }
    if (Math.abs(self.x - edgeX) > 10) {
      // walk the last stretch: a run (or a dash) into the corner overshoots it
      this.sx = Math.sign(edgeX - self.x) * (Math.abs(edgeX - self.x) > 60 ? 1 : 0.5);
      this.clampEdge(self);
    } else {
      this.facingFix(self, tgt);
    }
    return true;
  }
}

/**
 * Frames the target stays punishable (0 = not punishable): the end lag of a move whose hitboxes are all spent (an aerial
 * that will land adds its landing lag), landing lag, a broken shield, lying on the floor, the end of a roll / spot dodge.
 */
export function punishWindow(t: Fighter): number {
  switch (t.state) {
    case 'attack': {
      const m = t.move;
      if (!m || m.kind === 'grab' || m.kind === 'throw') return 0;
      let last = 0;
      for (const hb of m.hitboxes) last = Math.max(last, hitboxEnd(m, hb));
      if (m.hitboxes.length === 0) last = m.startup + m.active; // a projectile / setup special: its own lag after firing
      if (t.moveFrame <= last) return 0;
      let left = moveTotal(m) - t.moveFrame;
      if (!t.grounded && m.kind === 'aerial') left = Math.max(left, Math.min(left + (m.landingLag ?? 0), 20));
      return Math.max(0, left);
    }
    case 'landing':
      // the landing lag actually served (an aerial's own landing lag, or the short default landing)
      return Math.max(1, (t.lagFrames || 2) - t.stateFrame);
    case 'shieldbreak':
      return 120;
    // frozen solid (Rime's Frostbite, an ice shot) or stunned (lightning): a free hit for whoever gets there first
    case 'frozen':
      return Math.max(0, t.status.freeze);
    case 'stunned':
      return Math.max(0, t.status.stun);
    case 'downed':
      return t.stateFrame < 6 ? 12 : 4;
    case 'roll':
      return t.stateFrame > 22 ? 32 - t.stateFrame : 0;
    case 'spotdodge':
      return t.stateFrame > 16 ? 24 - t.stateFrame : 0;
    default:
      return 0;
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
