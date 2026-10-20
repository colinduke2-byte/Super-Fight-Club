import type { Fighter } from '../engine/fighter';
import type { WorldEventType } from '../engine/world';

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
}

const JAB3 = (tip = 'TAP ATTACK THREE TIMES'): Trial => ({ id: 'jab', name: 'JAB STRING', steps: ['jab1', 'jab2', 'jab3'], percent: 0, tip });

/** Three trials per roster fighter: a jab string, a throw follow-up (or a juggle where no throw true-combos) and a character combo. */
export const TRIALS: Record<string, Trial[]> = {
  brick: [
    JAB3(),
    { id: 'juggle', name: 'SKY HAMMER', steps: ['utilt', 'uair', 'uair'], percent: 20, tip: 'UP TILT, JUMP, UP AERIAL TWICE' },
    { id: 'combo', name: 'WRECKING CREW', steps: ['dtilt', 'ftilt', 'utilt'], percent: 0, tip: 'DOWN TILT, FORWARD TILT, UP TILT' },
  ],
  vex: [
    { id: 'jab', name: 'FLURRY', steps: ['jab1', 'jab2', 'jab3', 'jab4'], percent: 0, tip: 'KEEP TAPPING ATTACK' },
    { id: 'throw', name: 'TOSS AND BLINK', steps: ['fthrow', 'neutralB'], percent: 20, tip: 'FORWARD THROW, THEN NEUTRAL SPECIAL' },
    { id: 'combo', name: 'RISING BLADE', steps: ['utilt', 'utilt', 'uair'], percent: 15, tip: 'UP TILT TWICE, JUMP AND UP AERIAL' },
  ],
  nova: [
    JAB3(),
    { id: 'throw', name: 'THROW TO SPARK', steps: ['uthrow', 'uair'], percent: 30, tip: 'UP THROW, JUMP, UP AERIAL' },
    { id: 'combo', name: 'ARC LINK', steps: ['dtilt', 'utilt', 'uair'], percent: 40, tip: 'DOWN TILT, UP TILT, UP AERIAL' },
  ],
  gizmo: [
    JAB3(),
    { id: 'juggle', name: 'SCRAP TOSS', steps: ['utilt', 'uair', 'uair'], percent: 20, tip: 'UP TILT, JUMP, UP AERIAL TWICE' },
    { id: 'combo', name: 'WRENCH WORK', steps: ['dtilt', 'ftilt', 'sideB'], percent: 0, tip: 'DOWN TILT, FORWARD TILT, ROCKET FIST' },
  ],
  agni: [
    JAB3(),
    { id: 'throw', name: 'KINDLING', steps: ['uthrow', 'upB'], percent: 50, tip: 'UP THROW, THEN UP SPECIAL' },
    { id: 'combo', name: 'FLARE UP', steps: ['utilt', 'uair', 'upB'], percent: 15, tip: 'UP TILT, UP AERIAL, UP SPECIAL' },
  ],
  halcyon: [
    JAB3(),
    { id: 'throw', name: 'UPDRAFT', steps: ['uthrow', 'upB'], percent: 50, tip: 'UP THROW, THEN UP SPECIAL' },
    { id: 'combo', name: 'GALE CHAIN', steps: ['dtilt', 'uair', 'uair'], percent: 20, tip: 'DOWN TILT, JUMP, UP AERIAL TWICE' },
  ],
  riptide: [
    JAB3(),
    { id: 'juggle', name: 'UNDERTOW', steps: ['utilt', 'nair', 'uair'], percent: 20, tip: 'UP TILT, JUMP, NEUTRAL AERIAL, UP AERIAL' },
    { id: 'combo', name: 'RIP CURRENT', steps: ['utilt', 'uair', 'upB'], percent: 40, tip: 'UP TILT, UP AERIAL, UP SPECIAL' },
  ],
  obelisk: [
    JAB3(),
    { id: 'juggle', name: 'MONOLITH LIFT', steps: ['utilt', 'uair', 'fair'], percent: 20, tip: 'UP TILT, JUMP, UP AERIAL, FORWARD AERIAL' },
    { id: 'combo', name: 'STONEWORK', steps: ['dtilt', 'utilt', 'uair'], percent: 40, tip: 'DOWN TILT, UP TILT, UP AERIAL' },
  ],
  rime: [
    JAB3(),
    { id: 'throw', name: 'COLD SNAP', steps: ['uthrow', 'uair'], percent: 50, tip: 'UP THROW, JUMP, UP AERIAL' },
    { id: 'combo', name: 'WHITEOUT', steps: ['dtilt', 'ftilt', 'neutralB'], percent: 0, tip: 'DOWN TILT, FORWARD TILT, NEUTRAL SPECIAL' },
  ],
  havoc: [
    JAB3(),
    { id: 'throw', name: 'BREACH', steps: ['uthrow', 'upB'], percent: 15, tip: 'UP THROW, THEN UP SPECIAL' },
    { id: 'combo', name: 'DEMOLITION', steps: ['dtilt', 'utilt', 'uair'], percent: 20, tip: 'DOWN TILT, UP TILT, UP AERIAL' },
  ],
};

/** The trials for a fighter (falls back to a jab string for fighters without a set). */
export function trialsFor(fighterId: string): Trial[] {
  return TRIALS[fighterId] ?? [JAB3()];
}

/** True when a hit by move `id` counts as trial step `step`. */
export function stepMatches(id: string, step: string): boolean {
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
    this.onHit(this.dummy.lastHitMove, this.dummy.trueCombo + 1);
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
    if (this.progress < steps.length && stepMatches(id, steps[this.progress])) {
      this.progress++;
      this.lastId = id;
    } else if (id && id === this.lastId) {
      // another hit of a multi-hit move already counted: neither progress nor a miss
    } else if (stepMatches(id, steps[0])) {
      this.progress = 1;
      this.lastId = id;
    } else {
      if (this.progress > 0) this.drops++;
      this.progress = 0;
      this.lastId = '';
    }
    if (this.progress >= steps.length) this.done = true;
  }

  /** A combo that ends (the dummy leaves hitstun) before the trial is done starts it over. */
  tick(): void {
    const d = this.dummy;
    const reeling = d.state === 'hitstun' || d.state === 'grabbed' || d.hitlag > 0;
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
