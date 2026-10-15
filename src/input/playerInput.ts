import { Button, type FighterInput } from '../engine/buttons';
import { makeRaw, type InputDevice, type RawInput } from './device';
import { settings } from '../settings';
import { notePad } from './lastDevice';

const TAP_UP_THRESHOLD = -0.7;
const TAP_UP_RELEASE = -0.4;

/**
 * Turns a device's raw sample into the per-tick FighterInput the sim consumes:
 * edge detection (pressed/released), keyboard-stick deadzone, and tap-jump.
 *
 * Tap-jump: a fresh upward flick presses Jump, and holding up keeps Jump "held" (so a held flick
 * is a full hop and a quick tap is a short hop, same as the dedicated button).
 */
export class PlayerInput {
  private readonly raw: RawInput = makeRaw();
  private prevHeld = 0;
  private prevStickY = 0;
  private tapJumpHeld = false;

  constructor(public device: InputDevice) {}

  /** Call exactly once per sim tick. */
  sample(out: FighterInput): void {
    const raw = this.raw;
    const d = this.device;
    d.use?.('fight');
    d.sample(raw);
    if (raw.held !== 0 && d.kind === 'gamepad') notePad((d as { padId?: string }).padId ?? '');
    let held = raw.held;
    const sx = raw.stickX;
    const sy = raw.stickY;

    // per device kind: keyboards have their own setting (default off), pads and touch use `tapJump` (default on)
    if (d.kind === 'keyboard' ? settings.tapJumpKeyboard : settings.tapJump) {
      if (sy < TAP_UP_THRESHOLD && this.prevStickY >= TAP_UP_THRESHOLD) this.tapJumpHeld = true;
      if (sy > TAP_UP_RELEASE) this.tapJumpHeld = false;
      if (this.tapJumpHeld) held |= Button.Jump;
    } else {
      this.tapJumpHeld = false;
    }

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
  }
}
