import { BossController } from '../../ai/boss';
import { CpuController } from '../../ai/cpu';
import { Button, makeInput, type FighterInput } from '../../engine/buttons';
import type { Fighter } from '../../engine/fighter';
import type { World } from '../../engine/world';
import { DummyController, NullController, type Controller } from '../../game/controllers';
import type { MatchRunner } from '../../game/runner';
import type { PlayerSlot } from '../../game/session';
import type { InputDevice } from '../../input/device';
import type { GamepadDevice } from '../../input/gamepad';
import { inputManager } from '../../input/inputManager';
import { PlayerInput } from '../../input/playerInput';

export interface ControllerOptions {
  /** Watching a replay: every slot's input comes from the recording. */
  replay: boolean;
  isTraining: boolean;
  isLaunch: boolean;
}

/**
 * Input gathering for every slot: humans on their devices, CPUs / the boss brain / the training dummy, and gamepads
 * dropping out mid-match. Humans are sampled every sim tick (so START can pause during the countdown); controllers (CPU AI,
 * with its RNG) only run on ticks that actually step the world.
 */
export class MatchControllers {
  readonly humans: (PlayerInput | null)[];
  readonly controllers: Controller[];
  readonly inputs: FighterInput[];
  /** The training dummy (slot 1 in training). */
  readonly dummy = new DummyController();

  constructor(
    readonly slots: PlayerSlot[],
    runner: MatchRunner,
    opts: ControllerOptions,
  ) {
    this.humans = slots.map((s) => (s.type === 'human' && s.device ? new PlayerInput(s.device) : null));
    this.controllers = slots.map((s, i) =>
      opts.replay || s.type !== 'cpu' ? new NullController() : s.boss ? new BossController(() => runner.match.scores[i].stocks, 1) : opts.isTraining && i === 1 ? this.dummy : opts.isLaunch && i === 1 ? new DummyController() : new CpuController(s.cpuLevel, i + 1, s.cpuSkill),
    );
    this.inputs = slots.map(() => makeInput());
    // a replay plays the boss's recorded inputs, but its script also drives its enrage / roar / meter directly: it runs alongside
    // (its own inputs thrown away) so the playback stays in step with the live match
    this.shadows = opts.replay ? slots.map((s, i) => (s.boss ? new BossController(() => runner.match.scores[i].stocks, 1) : null)) : [];
  }

  /** Replay only: the boss scripts that run beside the recorded inputs (null per non-boss slot). */
  private readonly shadows: (BossController | null)[];
  private readonly scratch = makeInput();

  /** Replay: runs the boss scripts for the tick about to be simulated (their inputs are discarded; the recording's are used). */
  updateReplayShadows(fighters: Fighter[], world: World): void {
    for (let i = 0; i < this.shadows.length; i++) this.shadows[i]?.update(fighters[i], world, this.scratch);
  }

  /** Samples every human's device into its input. Returns the slot of the first one that pressed pause (-1: none). */
  sampleHumans(): number {
    let pauser = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const h = this.humans[i];
      if (!h) continue;
      h.sample(this.inputs[i]);
      if (pauser < 0 && this.inputs[i].pressed & Button.Pause) pauser = i;
    }
    return pauser;
  }

  /** Slot still missing its gamepad after the last checkConnections (-1: none). */
  missingSlot = -1;

  /** A free keyboard (one no other human slot plays on), or null. */
  freeKeyboard(): InputDevice | null {
    const used = new Set(this.slots.map((o) => o.device?.id));
    return inputManager.keyboards.find((k) => !used.has(k.id)) ?? null;
  }

  /** Disconnect: the player carries on on a free keyboard. Returns false if there is none. */
  continueWithKeyboard(i: number): boolean {
    const kb = this.freeKeyboard();
    const h = this.humans[i];
    if (!kb || !h) return false;
    this.slots[i].device = kb;
    h.device = kb;
    h.reset();
    return true;
  }

  /** Disconnect: a CPU takes the slot over for the rest of the match. */
  replaceWithCpu(i: number): void {
    const s = this.slots[i];
    if (!s) return;
    s.type = 'cpu';
    s.device = null;
    this.humans[i] = null;
    this.controllers[i] = new CpuController(s.cpuLevel, i + 1, s.cpuSkill);
    const inp = this.inputs[i];
    inp.held = inp.pressed = inp.released = 0;
    inp.stickX = inp.stickY = 0;
  }

  /** Runs the non-human controllers (CPU AI, dummy...) for the tick about to be simulated. */
  updateControllers(fighters: Fighter[], world: World): void {
    for (let i = 0; i < this.slots.length; i++) if (!this.humans[i]) this.controllers[i].update(fighters[i], world, this.inputs[i]);
  }

  resetHumans(): void {
    this.humans.forEach((h) => h?.reset());
  }

  /**
   * A human slot whose gamepad vanished: re-attach a free pad if there is one. Returns the label of a slot still missing its
   * pad ('' if none); `toast` reports reconnections.
   */
  checkConnections(toast: (msg: string) => void): string {
    let missing = '';
    this.missingSlot = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.type !== 'human' || !s.device || s.device.kind !== 'gamepad' || s.device.connected) continue;
      // compare by id: a pad that dropped out and came back may be a new device object for the same controller
      const used = new Set(this.slots.map((o) => o.device?.id));
      const free = inputManager.padList.find((p) => p.connected && !used.has(p.id));
      if (free) {
        s.device = free;
        this.humans[i]!.device = free;
        this.humans[i]!.reset();
        toast(`P${i + 1} controller reconnected`);
      } else {
        missing = `P${i + 1}`;
        this.missingSlot = i;
      }
    }
    return missing;
  }

  /** Vibrate the gamepad of the human slot that owns `f` (no-op for keyboards / CPUs). */
  rumble(f: Fighter, strong: number, weak: number, ms: number): void {
    const d = this.slots[f.id]?.device;
    if (d && d.kind === 'gamepad') (d as GamepadDevice).rumble(strong, weak, ms);
  }
}
