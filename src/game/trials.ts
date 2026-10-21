import type { Fighter } from '../engine/fighter';
import type { World, WorldEventType } from '../engine/world';

/**
 * Combo trials: three per fighter, played from the Training menu. A trial is a sequence of moves that must all hit the
 * dummy as one TRUE combo: every hit after the first lands while the dummy is still in hitstun from the one before (the
 * fighter's `trueCombo` counter), so a dummy that recovers, even for a frame, drops the string. A hit is credited to the
 * move that made it (`Fighter.lastHitMove`: a projectile to the move that fired it, a command grab's slam to the grab).
 * Move ids match exactly or as a prefix before '_' (so 'neutralB' covers Agni's charge variants neutralB_0..3).
 */
export interface Trial {
  id: string;
  name: string;
  /** Move ids to land in order, all in one combo. */
  steps: string[];
  /** Dummy percent at the start (launchers need some damage to send the dummy high enough to follow). */
  percent: number;
  /** One line of advice shown under the steps. */
  tip: string;
  /** The fighter's own mechanic this trial teaches (shown in the menu): 'FLAME LEVELS', 'HOVER'... */
  teaches?: string;
  /** Player resources set at the start (and on every reset): a Flame, Heat or Gale level to work with. */
  res?: Record<string, number>;
  /** Frostbite stacks already on the dummy at the start. */
  chill?: number;
  /** Moves done first, before the combo (they need not hit): cycling an element, planting C4, raising a pillar. */
  prep?: string[];
  /** The step a hit by the fighter's own trap or construct counts as (C4 going off, a spire erupting): they credit no move. */
  trap?: string;
  /**
   * Per step, an extra condition at the moment it lands: 'hover' (the player is hovering), 'frozen' (the dummy is frozen),
   * 'soaked' (the dummy is soaked), 'pillar' (one of the player's pillars stood there a moment before).
   */
  cond?: (TrialCond | null)[];
}

export type TrialCond = 'hover' | 'frozen' | 'soaked' | 'pillar';

const JAB3 = (tip = 'TAP ATTACK THREE TIMES'): Trial => ({ id: 'jab', name: 'JAB STRING', steps: ['jab1', 'jab2', 'jab3'], percent: 0, tip });

/**
 * Two trials per roster fighter (Vex three): a throw follow-up (or a juggle where no throw true-combos) and a character
 * combo. The generic jab strings are gone: each fighter's own mechanic has a trial instead (MECHANIC_TRIALS).
 */
export const TRIALS: Record<string, Trial[]> = {
  brick: [
    { id: 'juggle', name: 'SKY HAMMER', steps: ['utilt', 'uair', 'uair'], percent: 20, tip: 'UP TILT, JUMP, UP AERIAL TWICE' },
    { id: 'combo', name: 'WRECKING CREW', steps: ['dtilt', 'ftilt', 'utilt'], percent: 0, tip: 'DOWN TILT, FORWARD TILT, UP TILT' },
  ],
  vex: [
    { id: 'jab', name: 'FLURRY', steps: ['jab1', 'jab2', 'jab3', 'jab4'], percent: 0, tip: 'KEEP TAPPING ATTACK' },
    { id: 'throw', name: 'TOSS AND BLINK', steps: ['fthrow', 'neutralB'], percent: 20, tip: 'FORWARD THROW, THEN NEUTRAL SPECIAL' },
    { id: 'combo', name: 'RISING BLADE', steps: ['utilt', 'utilt', 'uair'], percent: 15, tip: 'UP TILT TWICE, JUMP AND UP AERIAL' },
  ],
  nova: [
    { id: 'throw', name: 'THROW TO SPARK', steps: ['uthrow', 'uair'], percent: 30, tip: 'UP THROW, JUMP, UP AERIAL' },
    { id: 'combo', name: 'ARC LINK', steps: ['dtilt', 'utilt', 'uair'], percent: 40, tip: 'DOWN TILT, UP TILT, UP AERIAL' },
  ],
  gizmo: [
    { id: 'juggle', name: 'SCRAP TOSS', steps: ['utilt', 'uair', 'uair'], percent: 20, tip: 'UP TILT, JUMP, UP AERIAL TWICE' },
    { id: 'combo', name: 'WRENCH WORK', steps: ['dtilt', 'ftilt', 'sideB'], percent: 0, tip: 'DOWN TILT, FORWARD TILT, ROCKET FIST' },
  ],
  agni: [
    { id: 'throw', name: 'KINDLING', steps: ['uthrow', 'upB'], percent: 50, tip: 'UP THROW, THEN UP SPECIAL' },
    { id: 'combo', name: 'FLARE UP', steps: ['utilt', 'uair', 'upB'], percent: 15, tip: 'UP TILT, UP AERIAL, UP SPECIAL' },
  ],
  halcyon: [
    { id: 'throw', name: 'UPDRAFT', steps: ['uthrow', 'upB'], percent: 50, tip: 'UP THROW, THEN UP SPECIAL' },
    { id: 'combo', name: 'GALE CHAIN', steps: ['dtilt', 'uair', 'uair'], percent: 20, tip: 'DOWN TILT, JUMP, UP AERIAL TWICE' },
  ],
  riptide: [
    { id: 'juggle', name: 'UNDERTOW', steps: ['utilt', 'nair', 'uair'], percent: 20, tip: 'UP TILT, JUMP, NEUTRAL AERIAL, UP AERIAL' },
    { id: 'combo', name: 'RIP CURRENT', steps: ['utilt', 'uair', 'upB'], percent: 40, tip: 'UP TILT, UP AERIAL, UP SPECIAL' },
  ],
  obelisk: [
    { id: 'juggle', name: 'MONOLITH LIFT', steps: ['utilt', 'uair', 'fair'], percent: 20, tip: 'UP TILT, JUMP, UP AERIAL, FORWARD AERIAL' },
    { id: 'combo', name: 'STONEWORK', steps: ['dtilt', 'utilt', 'uair'], percent: 40, tip: 'DOWN TILT, UP TILT, UP AERIAL' },
  ],
  rime: [
    { id: 'throw', name: 'COLD SNAP', steps: ['uthrow', 'uair'], percent: 50, tip: 'UP THROW, JUMP, UP AERIAL' },
    { id: 'combo', name: 'WHITEOUT', steps: ['dtilt', 'ftilt', 'neutralB'], percent: 0, tip: 'DOWN TILT, FORWARD TILT, NEUTRAL SPECIAL' },
  ],
  havoc: [
    { id: 'throw', name: 'BREACH', steps: ['uthrow', 'upB'], percent: 15, tip: 'UP THROW, THEN UP SPECIAL' },
    { id: 'combo', name: 'DEMOLITION', steps: ['dtilt', 'utilt', 'uair'], percent: 20, tip: 'DOWN TILT, UP TILT, UP AERIAL' },
  ],
};

/**
 * One trial per fighter that teaches its own mechanic (kept apart from the three above so the menu can mark them). Each
 * is proved completable by the trial solver like the rest, and its proved plan is the DEMO the menu plays.
 */
export const MECHANIC_TRIALS: Record<string, Trial> = {
  agni: { id: 'flame', name: 'STOKE THE FLAME', teaches: 'FLAME LEVELS', steps: ['utilt', 'uair', 'upB_2'], percent: 15, res: { flame: 50 }, tip: 'FLAME AT 50: TWO HITS PUSH IT TO LEVEL 2, THEN A LEVEL-2 RISING FLARE' },
  gizmo: { id: 'scrap', name: 'OVERCHARGE', teaches: 'SCRAP: THE CAUGHT FIST', steps: ['jab1', 'sideB_hot'], percent: 30, res: { hotFist: 1, scrap: 10 }, tip: 'A CAUGHT ROCKET FIST COMES BACK OVERCHARGED (HERE IT IS READY): JAB, THEN ROCKET FIST' },
  nova: { id: 'element', name: 'COLD FRONT', teaches: 'ELEMENT CYCLE', prep: ['downB'], steps: ['ftilt', 'neutralB_ice'], percent: 30, tip: 'DOWN SPECIAL CYCLES FIRE TO ICE; FORWARD TILT, THEN AN ICE BOLT' },
  obelisk: { id: 'pillar', name: 'ROCK BOTTOM', teaches: 'PILLARS', prep: ['~neutralB'], steps: ['bthrow'], cond: ['pillar'], percent: 20, tip: 'TURN AWAY AND RAISE A SPIRE, THEN GRAB AND BACK THROW THEM THROUGH IT' },
  havoc: { id: 'c4', name: 'BREACH AND CLEAR', teaches: 'C4', prep: ['downB'], trap: 'detonateC4', steps: ['jab1', 'detonateC4'], percent: 20, tip: 'SLAP C4 ON THEM (DOWN SPECIAL UP CLOSE), JAB, THEN DOWN SPECIAL AGAIN TO SET IT OFF' },
  rime: { id: 'freeze', name: 'DEEP FREEZE', teaches: 'SIX-STACK FREEZE', chill: 4, steps: ['dtilt', 'utilt', 'fsmash'], cond: [null, null, 'frozen'], percent: 20, tip: 'FOUR STACKS ON: TWO FROSTY TILTS MAKE SIX AND FREEZE THEM, THEN A FORWARD SMASH' },
  riptide: { id: 'soak', name: 'SOAKED THROUGH', teaches: 'SOAK', steps: ['utilt', 'uair'], cond: [null, 'soaked'], percent: 30, tip: 'UP TILT SOAKS THEM (SOAKED RIVALS FLY FURTHER), THEN AN UP AERIAL WHILE THEY DRIP' },
  brick: { id: 'heat', name: 'BLOW OFF STEAM', teaches: 'HEAT', steps: ['jab1', 'jab2', 'downB'], percent: 20, res: { heat: 60 }, tip: 'HEAT AT 60: TWO JABS, THEN VENT SPENDS IT ALL FOR A BIG HIT' },
  halcyon: { id: 'gale', name: 'PIERCING GALE', teaches: 'GALE', steps: ['jab1', 'neutralB_1'], percent: 30, res: { gale: 45 }, tip: 'GALE AT LEVEL 1 UPGRADES THE JAVELIN: JAB, THEN THE PIERCING JAVELIN' },
  vex: { id: 'blink', name: 'BLINK TRAIL', teaches: 'BLINK TRAIL', steps: ['ftilt', 'neutralB'], percent: 40, tip: 'FORWARD TILT, THEN BLINK STRIKE THROUGH THEM; IT LEAVES A MARKER: SPECIAL AGAIN RECALLS YOU' },
};

/** The trials for a fighter: its combos, then the trial of its own mechanic (a jab string for a fighter without a set). */
export function trialsFor(fighterId: string): Trial[] {
  const own = MECHANIC_TRIALS[fighterId];
  return [...(TRIALS[fighterId] ?? [JAB3()]), ...(own ? [own] : [])];
}

/** True when a hit by move `id` counts as trial step `step`. */
export function stepMatches(id: string, step: string, trap?: string): boolean {
  if (id === '' && trap === step) return true; // a trap or construct going off is credited to no move: it counts as `trap`
  return id === step || id.startsWith(`${step}_`);
}

/** Tracks one trial against the player's hits on the dummy. */
export class TrialChecker {
  /** Steps landed so far in the current combo. */
  progress = 0;
  done = false;
  /** Attempts that landed at least one step and then dropped. */
  drops = 0;
  private lastId = '';
  /** Ticks since the dummy was last frozen (for 'frozen' conditions). */
  private frozenAgo = 99;
  /** Ticks since one of the player's pillars last stood (for 'pillar' conditions; needs `world`). */
  private pillarAgo = 99;
  /** The world, for conditions about constructs (set by whoever runs the trial). */
  world: World | null = null;

  constructor(
    readonly trial: Trial,
    private readonly player: Fighter,
    private readonly dummy: Fighter,
  ) {}

  reset(): void {
    this.progress = 0;
    this.done = false;
    this.lastId = '';
  }

  /** World events: hits the player lands on the dummy advance (or restart) the sequence. */
  onEvent(type: WorldEventType, f: Fighter): void {
    if (this.done || type !== 'hit' || f !== this.dummy || this.dummy.lastHitBy !== this.player.id) return;
    // a frozen dummy is still caught: a hit on it (or the hit that thaws it) continues the combo
    const frozen = this.progress > 0 && (this.frozenAgo <= 3 || this.dummy.status.freeze > 0);
    this.onHit(this.dummy.lastHitMove, frozen ? Math.max(2, this.dummy.trueCombo + 1) : this.dummy.trueCombo + 1);
  }

  /** A hit by move `id` that is hit number `combo` of the current combo. Exposed for tests. */
  onHit(id: string, combo: number): void {
    if (this.done) return;
    const steps = this.trial.steps;
    if (combo <= 1 && this.progress > 0) {
      this.drops++;
      this.progress = 0; // the combo dropped: start over
      this.lastId = '';
    }
    if (this.progress < steps.length && stepMatches(id, steps[this.progress], this.trial.trap) && this.condMet(this.progress)) {
      this.progress++;
      this.lastId = id;
    } else if (id && id === this.lastId) {
      // another hit of a multi-hit move already counted: neither progress nor a miss
    } else if (stepMatches(id, steps[0], this.trial.trap)) {
      this.progress = 1;
      this.lastId = id;
    } else {
      if (this.progress > 0) this.drops++;
      this.progress = 0;
      this.lastId = '';
    }
    if (this.progress >= steps.length) this.done = true;
  }

  /** The step's extra condition (if any) holds right now. */
  private condMet(step: number): boolean {
    const c = this.trial.cond?.[step];
    if (c === 'hover') return this.player.hover;
    if (c === 'frozen') return this.frozenAgo <= 3 || this.dummy.status.freeze > 0;
    if (c === 'soaked') return this.dummy.status.soak > 0;
    if (c === 'pillar') return this.pillarAgo <= 3;
    return true;
  }

  /** A combo that ends (the dummy leaves hitstun) before the trial is done starts it over. */
  tick(): void {
    const d = this.dummy;
    this.frozenAgo = d.status.freeze > 0 ? 0 : this.frozenAgo + 1;
    const own = this.world?.deployables.some((x) => x.active && x.owner === this.player.id && !!x.def?.pillar);
    this.pillarAgo = own ? 0 : this.pillarAgo + 1;
    const reeling = d.state === 'hitstun' || d.state === 'grabbed' || d.hitlag > 0 || d.status.freeze > 0 || d.status.stun > 0;
    if (!this.done && this.progress > 0 && !reeling) {
      this.progress = 0;
      this.lastId = '';
      this.drops++;
    }
  }
}

const SAVE_KEY = 'sfc.trials.v1';

/** Cleared trials ('<fighter>:<trial id>'), kept in localStorage. */
export function clearedTrials(): Set<string> {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markTrialCleared(fighterId: string, trialId: string): void {
  try {
    const s = clearedTrials();
    s.add(`${fighterId}:${trialId}`);
    localStorage.setItem(SAVE_KEY, JSON.stringify([...s]));
  } catch {
    // storage blocked: the clear just is not remembered
  }
}
