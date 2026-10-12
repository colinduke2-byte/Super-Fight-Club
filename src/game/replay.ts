import type { FighterInput } from '../engine/buttons';
import type { MatchRules } from './session';

/** One recorded fighter slot. */
export interface ReplayPlayer {
  character: string;
  palette?: number;
}

/**
 * A finished match as data: the setup plus every fighter's input on every tick. The simulation is deterministic (no Math.random in
 * `src/engine`, seeded item drops), so feeding the same inputs into the same setup reproduces the match exactly.
 */
export interface Replay {
  stage: string;
  rules: MatchRules;
  players: ReplayPlayer[];
  smashFlick: boolean;
  ticks: number;
  /** Per tick, per fighter: stickX, stickY. */
  sticks: Float64Array;
  /** Per tick, per fighter: held, pressed, released. */
  buttons: Int32Array;
}

/** Collects inputs tick by tick while a match is played. */
export class ReplayRecorder {
  private readonly sticks: number[] = [];
  private readonly buttons: number[] = [];
  private ticks = 0;

  constructor(
    private readonly stage: string,
    private readonly rules: MatchRules,
    private readonly players: ReplayPlayer[],
    private readonly smashFlick: boolean,
  ) {}

  /** Call once per simulation tick, before `world.step`, with the inputs about to be used. */
  record(inputs: FighterInput[]): void {
    for (const i of inputs) {
      this.sticks.push(i.stickX, i.stickY);
      this.buttons.push(i.held, i.pressed, i.released);
    }
    this.ticks++;
  }

  finish(): Replay {
    return {
      stage: this.stage,
      rules: { ...this.rules },
      players: this.players.map((p) => ({ ...p })),
      smashFlick: this.smashFlick,
      ticks: this.ticks,
      sticks: Float64Array.from(this.sticks),
      buttons: Int32Array.from(this.buttons),
    };
  }
}

/** Writes the recorded inputs of `tick` into `out` (one entry per fighter). Returns false past the end. */
export function fillReplayInputs(r: Replay, tick: number, out: FighterInput[]): boolean {
  if (tick >= r.ticks) return false;
  const n = r.players.length;
  for (let i = 0; i < n; i++) {
    const k = tick * n + i;
    const o = out[i];
    o.stickX = r.sticks[k * 2];
    o.stickY = r.sticks[k * 2 + 1];
    o.held = r.buttons[k * 3];
    o.pressed = r.buttons[k * 3 + 1];
    o.released = r.buttons[k * 3 + 2];
  }
  return true;
}
