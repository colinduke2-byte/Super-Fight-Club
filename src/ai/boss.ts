import { Button, type FighterInput } from '../engine/buttons';
import type { Fighter } from '../engine/fighter';
import type { World } from '../engine/world';
import { applyHeld, clearInput, type Controller } from '../game/controllers';
import { newEpisode, offstage, recoveryStep, type RecoveryEpisode, type RecoveryOut } from './recovery';
import { LEVELS, type CharacterAi } from './profiles';
// deterministic PRNG: the boss must not use Math.random so matches can be replayed from inputs
import { mulberry32 } from '../art/rng';

const BOSS_RECOVERY: CharacterAi = {
  ranged: [],
  closers: [],
  setups: [],
  finishers: [],
  avoid: [],
  holds: {},
  recovery: { slot: 'upB', up: 120, out: 110, aim: 'fixed' },
  ultimateRange: 0,
  spacing: 60,
};

type PatternId = 'claws' | 'slam' | 'quake' | 'volley' | 'beam' | 'drones' | 'sky' | 'leap' | 'combo' | 'fury' | 'barrage' | 'cataclysm';

interface Step {
  /** Button + stick for a press, or null for a pure wait. */
  btn: number;
  /** Stick direction: 1 = toward target, -1 away, 0 neutral (x); y: -1 up. */
  dx: number;
  dy: number;
  /** Frames to hold the press. */
  hold: number;
  /** After the move ends, wait this many frames before the next step. */
  gap: number;
}

const press = (btn: number, dx = 0, dy = 0, gap = 8, hold = 2): Step => ({ btn, dx, dy, hold, gap });

/** Scripts for each pattern. Every attack has a long, readable windup; the gaps are the player's punish windows. */
const SCRIPTS: Record<PatternId, Step[]> = {
  claws: [press(Button.Attack, 0, 0, 10), press(Button.Attack, 0, 0, 22)],
  slam: [press(Button.Smash, 1, 0, 30)],
  quake: [press(Button.Smash, 0, 1, 26)],
  volley: [press(Button.Special, 0, 0, 34)],
  beam: [press(Button.Special, 1, 0, 40)],
  drones: [press(Button.Special, 0, 1, 40)],
  sky: [press(Button.Smash, 0, -1, 20)],
  leap: [press(Button.Special, 1, -1, 50)],
  combo: [press(Button.Smash, 1, 0, 12), press(Button.Smash, 0, 1, 34)],
  // phase 2 only: a three-hit string (swipe into the overhead slam into Skyfist) and a volley that covers a beam
  fury: [press(Button.Attack, 0, 0, 6), press(Button.Smash, 1, 0, 10), press(Button.Smash, 0, -1, 30)],
  barrage: [press(Button.Special, 0, 0, 10), press(Button.Special, 1, 0, 36)],
  cataclysm: [press(Button.Ultimate, 0, 0, 60)],
};

/**
 * The Arcade Ladder boss brain: not a reactive CPU but a scripted pattern machine. It idles and repositions, picks a pattern
 * from weights by distance / height (never the same one twice in a row), performs it, then leaves a punish window. Phase 2
 * (one stock left) shortens the pauses, adds a combo and the screen-wide Cataclysm, and sets `res.enrage`.
 *
 * The phase change is an event: on the first tick of phase 2 the boss emits an `fx` world event tagged `bossPhase2`
 * (`extra` = 2), calls `onPhase`, and roars (the `roar` move: invulnerable, a shockwave that shoves rivals back) before it
 * fights again, now with shorter punish windows, two extra strings and the Cataclysm. `bossPhase` / `phase2Tick` let the
 * view and the music read it without listening for the event.
 */
export class BossController implements Controller {
  private readonly rnd: () => number;
  private state: 'intro' | 'idle' | 'face' | 'act' | 'roar' = 'intro';
  private waitLeft = 100;
  private pattern: PatternId | null = null;
  private stepIdx = 0;
  private stepStart = 0;
  private pressed = false;
  private sawAttack = false;
  private gapLeft = 0;
  private last: PatternId | null = null;
  private episode: RecoveryEpisode | null = null;
  private readonly rec: RecoveryOut = { sx: 0, sy: 0, jump: false, special: false, steering: false };
  private prevHeld = 0;
  private ultCooldown = 600;
  private toggle = false;
  private approach = 0;
  /** Phase the script has acted on (the transition runs once, when this moves from 1 to 2). */
  private phaseSeen: 1 | 2 = 1;
  /** World tick phase 2 began, or -1 (for flashes / music fades keyed off the transition). */
  phase2Tick = -1;
  /** Ticks spent waiting to roar (gives up if the boss cannot get grounded). */
  private roarWait = 0;
  /** Taunted over a downed rival already (once per KO). */
  private taunted = false;
  /** Called once when the fight enters phase 2 (visuals / music hook). */
  onPhase: ((phase: 2, self: Fighter) => void) | null = null;
  /** Current phase: 1 while the boss has more than one stock left, then 2. */
  get bossPhase(): 1 | 2 {
    return this.phase;
  }
  /** For tests / HUD: the pattern currently running. */
  get current(): PatternId | null {
    return this.pattern;
  }
  readonly used = new Set<PatternId>();

  constructor(
    private readonly stocksLeft: () => number,
    seed = 1,
  ) {
    this.rnd = mulberry32(seed * 6151 + 17);
  }

  private get phase(): 1 | 2 {
    return this.stocksLeft() <= 1 ? 2 : 1;
  }

  update(self: Fighter, world: World, out: FighterInput): void {
    clearInput(out);
    let sx = 0;
    let sy = 0;
    let held = 0;
    if (self.state !== 'ko') {
      const r = this.think(self, world);
      sx = r.sx;
      sy = r.sy;
      held = r.held;
    }
    out.stickX = sx;
    out.stickY = sy;
    applyHeld(out, held, this.prevHeld);
    this.prevHeld = held;
  }

  private readonly res = { sx: 0, sy: 0, held: 0 };

  private target(self: Fighter, world: World): Fighter | null {
    let best: Fighter | null = null;
    let bd = Infinity;
    for (const f of world.fighters) {
      if (f === self || f.state === 'ko') continue;
      const d = Math.abs(f.x - self.x) + Math.abs(f.y - self.y) * 0.5;
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  private think(self: Fighter, world: World): { sx: number; sy: number; held: number } {
    const o = this.res;
    o.sx = 0;
    o.sy = 0;
    o.held = 0;
    self.res.enrage = this.phase === 2 ? 1 : 0;
    if (this.ultCooldown > 0) this.ultCooldown--;
    if (this.phase === 2 && this.phaseSeen === 1) this.enterPhase2(self, world);

    switch (self.state) {
      case 'grabbed':
        this.toggle = !this.toggle;
        o.held = this.toggle ? Button.Attack : 0;
        return o;
      case 'ledge':
        if (self.ledgeFrames > 24) o.sy = -1;
        return o;
      case 'hitstun':
      case 'stunned':
      case 'frozen':
      case 'tech':
      case 'downed':
      case 'landing':
      case 'jumpsquat':
      case 'ledgeClimb':
      case 'tether':
        return o;
      default:
        break;
    }

    // off the stage: recover (the same ledge-aware routine the CPUs use)
    if (offstage(self, world)) {
      if (!this.episode) this.episode = newEpisode(world, LEVELS[3], this.rnd);
      recoveryStep(self, world, BOSS_RECOVERY, this.episode, this.rec);
      o.sx = this.rec.sx;
      o.sy = this.rec.sy;
      if (this.rec.jump) o.held |= Button.Jump;
      if (this.rec.special) {
        o.held |= Button.Special;
        this.episode.specialPressed = true;
      }
      this.state = 'idle';
      this.pattern = null;
      return o;
    }
    this.episode = null;

    const tgt = this.target(self, world);
    if (!tgt) {
      // a rival just went down: stand over the spot and taunt (once per KO)
      if (!this.taunted && self.grounded && self.state === 'idle' && this.state !== 'roar' && self.meter < 100) {
        this.taunted = true;
        o.held = Button.Ultimate;
      }
      return o;
    }
    this.taunted = false;
    const dx = tgt.x - self.x;
    const dir = dx >= 0 ? 1 : -1;
    const dist = Math.abs(dx);
    const phase = this.phase;

    if (self.state === 'attack') {
      this.sawAttack = true;
      if (this.state === 'act' && this.pattern === 'cataclysm') o.sx = 0;
      return o;
    }

    switch (this.state) {
      case 'roar': {
        // phase 2 opener: the roar is asked for through the taunt input (Ultimate with an empty meter), which the
        // Overseer's behaviour turns into the roar while `res.roar` is pending
        if (self.res.roar <= 0 || ++this.roarWait > 240) {
          self.res.roar = 0;
          this.state = 'idle';
          this.waitLeft = 8;
          return o;
        }
        if (self.grounded && self.facing !== dir) o.sx = dir;
        else if (self.grounded) {
          self.meter = 0;
          if ((world.tick & 3) < 2) o.held = Button.Ultimate;
        }
        return o;
      }
      case 'intro':
        if (self.grounded && self.facing !== dir) o.sx = dir;
        if (--this.waitLeft <= 0) this.state = 'idle', (this.waitLeft = 20);
        return o;
      case 'idle': {
        // reposition: keep a comfortable distance, facing the target
        const want = 55;
        if (self.grounded) {
          if (self.facing !== dir) o.sx = dir;
          else if (dist > want + 30) o.sx = dir;
          else if (dist < 30) o.sx = -dir * 0.6;
          this.clampEdge(self, o);
        }
        if (--this.waitLeft > 0) return o;
        this.pattern = this.choose(self, world, tgt, dist, phase);
        this.used.add(this.pattern);
        this.last = this.pattern;
        this.stepIdx = 0;
        this.state = 'face';
        this.waitLeft = 2;
        this.approach = 0;
        return o;
      }
      case 'face':
        if (self.grounded && self.facing !== dir) o.sx = dir;
        // slam and leap-in patterns close the distance first (up to a second)
        if (this.pattern === 'slam' && dist > 70 && self.grounded && this.approach < 60) {
          o.sx = dir;
          this.approach++;
          this.clampEdge(self, o);
          return o;
        }
        if (--this.waitLeft > 0) return o;
        this.state = 'act';
        this.stepStart = world.tick;
        this.pressed = false;
        this.sawAttack = false;
        return o;
      case 'act': {
        const steps = SCRIPTS[this.pattern!];
        const st = steps[this.stepIdx];
        if (!this.pressed) {
          const t = world.tick - this.stepStart;
          if (t < st.hold) {
            o.held |= st.btn;
            o.sx = st.dx * dir;
            o.sy = st.dy;
            if (this.pattern === 'cataclysm') self.meter = Math.max(self.meter, 100);
            return o;
          }
          this.pressed = true;
          this.stepStart = world.tick;
          this.gapLeft = -1;
        }
        // press is done: wait for the move to finish (state left 'attack' after we saw it start), or give up
        if (!this.sawAttack && world.tick - this.stepStart < 24) {
          // the move has not started yet (buffered); keep stick pointing the right way
          o.sx = st.dx * dir;
          o.sy = st.dy;
          return o;
        }
        if (this.gapLeft < 0) this.gapLeft = phase === 2 ? Math.round(st.gap * 0.65) : st.gap;
        if (--this.gapLeft > 0) return o;
        this.stepIdx++;
        if (this.stepIdx >= steps.length) {
          this.state = 'idle';
          this.waitLeft = phase === 2 ? 6 + Math.floor(this.rnd() * 12) : 18 + Math.floor(this.rnd() * 18);
          this.pattern = null;
        } else {
          this.stepStart = world.tick;
          this.pressed = false;
          this.sawAttack = false;
        }
        return o;
      }
      default:
        return o;
    }
  }

  /** Phase 1 -> 2: flag it, announce it (world event + callback) and queue the roar. */
  private enterPhase2(self: Fighter, world: World): void {
    this.phaseSeen = 2;
    this.phase2Tick = world.tick;
    self.res.roar = 1;
    this.roarWait = 0;
    this.state = 'roar';
    this.pattern = null;
    this.ultCooldown = Math.max(240, Math.min(this.ultCooldown, 420));
    world.emit('fx', self, self.x, self.y - self.h * 0.6, self.facing, 2, 'bossPhase2');
    this.onPhase?.(2, self);
  }

  private clampEdge(self: Fighter, o: { sx: number }): void {
    const pl = self.groundPlat;
    if (!pl || o.sx === 0) return;
    if (o.sx > 0 && self.x > pl.right - 28) o.sx = 0;
    else if (o.sx < 0 && self.x < pl.x + 28) o.sx = 0;
  }

  private choose(self: Fighter, world: World, tgt: Fighter, dist: number, phase: 1 | 2): PatternId {
    const w: [PatternId, number][] = [];
    const above = tgt.y < self.y - 70 && dist < 90;
    const sameRow = Math.abs(tgt.y - self.y) < 70;
    const drones = world.findDeployables(self.id, 'drone').length;
    // at the very edge facing out (a rival hanging on the ledge), a forward smash flick slides it off the stage
    const pl = self.groundPlat;
    const dir = tgt.x >= self.x ? 1 : -1;
    const fwd = !pl || (dir > 0 ? pl.right - self.x : self.x - pl.x) > 30;
    if (above) w.push(['sky', 6]);
    if (dist < 80) {
      w.push(['claws', 4], ['quake', 3]);
      if (fwd) w.push(['slam', 4]);
    } else if (dist < 200) {
      w.push(['quake', 3], ['volley', 3]);
      if (fwd) w.push(['slam', 3]);
      if (sameRow && fwd) w.push(['beam', 3]);
    } else {
      w.push(['volley', 3]);
      if (fwd) w.push(['leap', 4]);
      if (sameRow && fwd) w.push(['beam', 4]);
    }
    if (drones < 2 && dist > 80) w.push(['drones', 3]);
    if (phase === 2) {
      if (fwd) w.push(['combo', 4]);
      if (fwd && dist < 90) w.push(['fury', 5]);
      if (sameRow && fwd && dist >= 90) w.push(['barrage', 4]);
      if (this.ultCooldown <= 0) w.push(['cataclysm', 14]);
    }
    let total = 0;
    for (const [id, wt] of w) if (id !== this.last) total += wt;
    let r = this.rnd() * total;
    for (const [id, wt] of w) {
      if (id === this.last) continue;
      r -= wt;
      if (r <= 0) {
        if (id === 'cataclysm') this.ultCooldown = 780;
        return id;
      }
    }
    return 'claws';
  }
}
