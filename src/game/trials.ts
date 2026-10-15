import type { Fighter } from '../engine/fighter';
import type { WorldEventType } from '../engine/world';

/**
 * Combo trials: three per fighter, played from the Training menu. A trial is a sequence of moves that must all hit the
 * dummy within one combo (the game's own combo counter: each hit lands while the dummy is still reeling from the last).
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

/** Three trials per roster fighter: a jab string, a throw follow-up and a character combo. */
export const TRIALS: Record<string, Trial[]> = {
  brick: [
    JAB3(),
    { id: 'throw', name: 'TOSS AND SWAT', steps: ['uthrow', 'uair'], percent: 10, tip: 'UP THROW, JUMP, UP AERIAL' },
    { id: 'combo', name: 'WRECKING CREW', steps: ['dtilt', 'ftilt', 'sideB'], percent: 20, tip: 'DOWN TILT, FORWARD TILT, THEN SIDE SPECIAL' },
  ],
  vex: [
    { id: 'jab', name: 'FLURRY', steps: ['jab1', 'jab2', 'jab3', 'jab4'], percent: 0, tip: 'KEEP TAPPING ATTACK' },
    { id: 'throw', name: 'TOSS AND SLICE', steps: ['uthrow', 'uair'], percent: 10, tip: 'UP THROW, JUMP, UP AERIAL' },
    { id: 'combo', name: 'RISING BLADE', steps: ['utilt', 'utilt', 'uair'], percent: 15, tip: 'UP TILT TWICE, JUMP AND UP AERIAL' },
  ],
  nova: [
    JAB3(),
    { id: 'throw', name: 'THROW TO SPARK', steps: ['dthrow', 'nair'], percent: 10, tip: 'DOWN THROW, SHORT HOP NEUTRAL AERIAL' },
    { id: 'combo', name: 'ARC LINK', steps: ['dtilt', 'utilt', 'uair'], percent: 20, tip: 'DOWN TILT, UP TILT, UP AERIAL' },
  ],
  gizmo: [
    JAB3(),
    { id: 'throw', name: 'SCRAP TOSS', steps: ['uthrow', 'uair'], percent: 10, tip: 'UP THROW, JUMP, UP AERIAL' },
    { id: 'combo', name: 'WRENCH WORK', steps: ['dtilt', 'ftilt', 'fsmash'], percent: 20, tip: 'DOWN TILT, FORWARD TILT, FORWARD SMASH' },
  ],
  agni: [
    JAB3(),
    { id: 'throw', name: 'KINDLING', steps: ['dthrow', 'fair'], percent: 10, tip: 'DOWN THROW, JUMP TOWARD, FORWARD AERIAL' },
    { id: 'combo', name: 'FLARE UP', steps: ['utilt', 'uair', 'upB'], percent: 15, tip: 'UP TILT, UP AERIAL, UP SPECIAL' },
  ],
  halcyon: [
    JAB3(),
    { id: 'throw', name: 'UPDRAFT', steps: ['uthrow', 'uair'], percent: 10, tip: 'UP THROW, JUMP, UP AERIAL' },
    { id: 'combo', name: 'GALE CHAIN', steps: ['dtilt', 'utilt', 'uair'], percent: 20, tip: 'DOWN TILT, UP TILT, UP AERIAL' },
  ],
  riptide: [
    JAB3(),
    { id: 'throw', name: 'UNDERTOW', steps: ['dthrow', 'nair'], percent: 10, tip: 'DOWN THROW, SHORT HOP NEUTRAL AERIAL' },
    { id: 'combo', name: 'RIP CURRENT', steps: ['dtilt', 'ftilt', 'sideB'], percent: 20, tip: 'DOWN TILT, FORWARD TILT, SIDE SPECIAL' },
  ],
  obelisk: [
    JAB3(),
    { id: 'throw', name: 'MONOLITH LIFT', steps: ['uthrow', 'uair'], percent: 10, tip: 'UP THROW, JUMP, UP AERIAL' },
    { id: 'combo', name: 'STONEWORK', steps: ['dtilt', 'utilt', 'usmash'], percent: 20, tip: 'DOWN TILT, UP TILT, UP SMASH' },
  ],
  rime: [
    JAB3(),
    { id: 'throw', name: 'COLD SNAP', steps: ['dthrow', 'fair'], percent: 10, tip: 'DOWN THROW, JUMP TOWARD, FORWARD AERIAL' },
    { id: 'combo', name: 'WHITEOUT', steps: ['dtilt', 'ftilt', 'neutralB'], percent: 20, tip: 'DOWN TILT, FORWARD TILT, NEUTRAL SPECIAL' },
  ],
  havoc: [
    JAB3(),
    { id: 'throw', name: 'BREACH', steps: ['uthrow', 'uair'], percent: 10, tip: 'UP THROW, JUMP, UP AERIAL' },
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
    this.onHit(this.player.move?.id ?? '', Math.max(1, this.dummy.comboHits));
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

  /** A combo that ends (the dummy recovers) before the trial is done starts it over. */
  tick(): void {
    if (!this.done && this.progress > 0 && this.dummy.comboHits === 0) {
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
