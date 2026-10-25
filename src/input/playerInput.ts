import { Button, type FighterInput } from '../engine/buttons';
import { makeRaw, type InputDevice, type RawInput } from './device';
import { settings } from '../settings';
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

    out.stickX = sx;
    out.stickY = sy;
    out.held = held;
    out.pressed = held & ~this.prevHeld;
    out.released = ~held & this.prevHeld & 0xff;
    this.prevHeld = held;
    this.prevStickY = sy;
  }

  reset(): void {
    this.prevHeld = 0;
    this.prevStickY = 0;
    this.tapJumpHeld = false;
    this.tapPending = 0;
    this.tapTapped = false;
    this.prevRawHeld = 0;
  }
}
