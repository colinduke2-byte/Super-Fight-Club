import { Button, INPUT_MASK, Sprint, type FighterInput } from '../engine/buttons';
import { makeRaw, type InputDevice, type RawInput } from './device';
import { settings, type SprintMode } from '../settings';
import { notePad } from './lastDevice';

/** performance.now() of the last time a match read a player's device: "a human is fighting right now" (rotate prompt). */
export const fightActivity = { at: -1e9 };

const TAP_UP_THRESHOLD = -0.7;
const TAP_UP_RELEASE = -0.4;
/** Ticks a tap-jump waits for Attack / Special / Smash: pressed in that window, the flick means an up attack, not a jump. */
export const TAP_JUMP_WINDOW = 2;
const UP_MOVE_BUTTONS = Button.Attack | Button.Special | Button.Smash;
/**
 * With W / Up jumping, a keyboard's up is reported as this firm-but-not-full tilt: still "up" for up-tilt, up-special,
 * up-throw and climbing (all below -0.7), but short of the engine's flick threshold (-0.8), so W + Attack is an up-tilt
 * instead of always reading as a flick up-smash. Up-smash on a keyboard is the Smash key, like the other smashes.
 */
const KEYBOARD_UP = -0.75;

/**
 * Double-tap sprint: the second press must come within DOUBLE_TAP_WINDOW ticks of letting go of the first (~0.2 s), and
 * the first must have been a tap (held at most DOUBLE_TAP_MAX_HOLD ticks), so running, stopping and running on again
 * does not sprint by accident.
 */
export const DOUBLE_TAP_WINDOW = 12;
export const DOUBLE_TAP_MAX_HOLD = 18;
/** Stick travel that counts as a press of a direction, and the travel it must drop under to count as let go (hysteresis). */
const PUSH_ON = 0.8;
const PUSH_OFF = 0.5;

/**
 * Turns a device's raw sample into the per-tick FighterInput the sim consumes:
 * edge detection (pressed/released), keyboard-stick deadzone, and tap-jump.
 *
 * Tap-jump: a fresh upward flick presses Jump, and holding up keeps Jump "held" (so a held flick
 * is a full hop and a quick tap is a short hop, same as the dedicated button). The jump waits TAP_JUMP_WINDOW ticks:
 * if Attack, Special or Smash is pressed by then the flick was the start of an up-tilt / up-smash / up-special (in
 * the air: up-special without spending the double jump), so no jump is sent at all.
 */
export class PlayerInput {
  private readonly raw: RawInput = makeRaw();
  private prevHeld = 0;
  private prevStickY = 0;
  private prevRawHeld = 0;
  private tapJumpHeld = false;
  /** Ticks left before a fresh flick turns into a jump (0 = none pending). */
  private tapPending = 0;
  /** The flick was let go while pending: send a one-tick jump (a short hop). */
  private tapTapped = false;
  /** Sprint detection (all in ticks of this input's own clock): the direction pushed now (0 none) and since when. */
  private tick = 0;
  private pushDir = 0;
  private pushAt = 0;
  /** The last finished press: its direction, how long it was held, and when it was let go. */
  private lastPushDir = 0;
  private lastPushLen = 0;
  private lastReleaseAt = -1e9;
  private prevStickX = 0;
  /** The sprint being held (0 none, -1 left, 1 right): its bit stays down while the stick is still pushed that way. */
  private sprintDir = 0;

  constructor(public device: InputDevice) {}

  /** Call exactly once per sim tick. */
  sample(out: FighterInput): void {
    const raw = this.raw;
    const d = this.device;
    d.use?.('fight');
    fightActivity.at = typeof performance !== 'undefined' ? performance.now() : 0;
    d.sample(raw);
    if (raw.held !== 0 && d.kind === 'gamepad') notePad((d as { padId?: string }).padId ?? '');
    let held = raw.held;
    const sx = raw.stickX;
    const sy = d.kind === 'keyboard' && settings.upJumpKeyboard ? Math.max(raw.stickY, KEYBOARD_UP) : raw.stickY;

    // per device kind: keyboards have their own setting (W / Up jumps, default on), pads and touch use `tapJump` (default on)
    if (d.kind === 'keyboard' ? settings.upJumpKeyboard : settings.tapJump) {
      const freshMove = (raw.held & ~this.prevRawHeld & UP_MOVE_BUTTONS) !== 0;
      if (sy < TAP_UP_THRESHOLD && this.prevStickY >= TAP_UP_THRESHOLD) {
        this.tapJumpHeld = false;
        this.tapTapped = false;
        this.tapPending = freshMove ? 0 : TAP_JUMP_WINDOW;
      } else if (this.tapPending > 0) {
        if (freshMove) this.tapPending = 0; // up + attack / special: the move, no jump
        else if (sy > TAP_UP_RELEASE) this.tapTapped = true;
        if (this.tapPending > 0 && --this.tapPending === 0) {
          if (this.tapTapped) held |= Button.Jump; // let go already: one tick of Jump, a short hop
          else this.tapJumpHeld = true;
          this.tapTapped = false;
        }
      }
      if (sy > TAP_UP_RELEASE) this.tapJumpHeld = false;
      if (this.tapJumpHeld) held |= Button.Jump;
    } else {
      this.tapJumpHeld = false;
      this.tapPending = 0;
    }
    this.prevRawHeld = raw.held;
    held |= this.sprint(sx, d.kind === 'keyboard' ? settings.sprintKeyboard : settings.sprintPad);

    out.stickX = sx;
    out.stickY = sy;
    out.held = held;
    out.pressed = held & ~this.prevHeld;
    out.released = ~held & this.prevHeld & INPUT_MASK;
    this.prevHeld = held;
    this.prevStickY = sy;
  }

  /**
   * The sprint bits for this tick (see buttons.ts Sprint). A press of a direction is the stick crossing PUSH_ON (a key: always
   * at once); it is a flick when it came from under PUSH_OFF (or from the other side) in one tick, a double-tap when the same
   * direction was tapped and let go just before. `mode` picks which of the two start a sprint. Always Managed: the sim
   * never reads a raw flick of a human's stick as a dash.
   */
  private sprint(sx: number, mode: SprintMode | undefined): number {
    const t = ++this.tick;
    const a = Math.abs(sx);
    const dir = sx > 0 ? 1 : -1;
    if (this.pushDir !== 0 && (a < PUSH_OFF || dir !== this.pushDir)) {
      // let go (or pushed straight through to the other side)
      this.lastPushDir = this.pushDir;
      this.lastPushLen = t - this.pushAt;
      this.lastReleaseAt = t;
      if (this.sprintDir === this.pushDir) this.sprintDir = 0;
      this.pushDir = 0;
    }
    if (this.pushDir === 0 && a >= PUSH_ON) {
      const pa = Math.abs(this.prevStickX);
      const flick = pa < PUSH_OFF || (this.prevStickX > 0 ? 1 : -1) !== dir;
      const doubleTap = this.lastPushDir === dir && this.lastPushLen <= DOUBLE_TAP_MAX_HOLD && t - this.lastReleaseAt <= DOUBLE_TAP_WINDOW;
      const m = mode ?? 'both';
      if ((flick && m !== 'doubletap') || (doubleTap && m !== 'flick')) {
        this.sprintDir = dir;
        this.lastPushDir = 0; // a third tap is a fresh first tap, not another double
      }
      this.pushDir = dir;
      this.pushAt = t;
    }
    this.prevStickX = sx;
    return Sprint.Managed | (this.sprintDir > 0 ? Sprint.Right : this.sprintDir < 0 ? Sprint.Left : 0);
  }

  reset(): void {
    this.prevHeld = 0;
    this.pushDir = 0;
    this.lastPushDir = 0;
    this.lastReleaseAt = -1e9;
    this.prevStickX = 0;
    this.sprintDir = 0;
    this.prevStickY = 0;
    this.tapJumpHeld = false;
    this.tapPending = 0;
    this.tapTapped = false;
    this.prevRawHeld = 0;
  }
}
