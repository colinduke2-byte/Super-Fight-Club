import { describe, expect, it } from 'vitest';
import { Sprint, makeInput } from '../src/engine/buttons';
import { MergedDevice, type InputDevice, type RawInput } from '../src/input/device';
import { PlayerInput } from '../src/input/playerInput';

/** The solo modes' keyboard + pad device reads by the rules of whatever was pressed last: one tap on the keys only runs. */
class Fake implements InputDevice {
  readonly connected = true;
  stickX = 0;
  constructor(
    readonly id: string,
    readonly kind: 'keyboard' | 'gamepad',
  ) {}
  readonly label = 'fake';
  sample(out: RawInput): void {
    out.stickX = this.stickX;
    out.stickY = 0;
    out.held = 0;
  }
}

describe('keyboard + pad device', () => {
  it('a single key press runs (keyboard rules), it does not sprint like a pad flick', () => {
    const kb = new Fake('keyboard:kb1', 'keyboard');
    const pad = new Fake('pad0', 'gamepad');
    const pin = new PlayerInput(new MergedDevice('p1', 'both', () => [kb, pad]));
    const out = makeInput();
    for (let i = 0; i < 5; i++) pin.sample(out);
    kb.stickX = 1;
    let sprinted = false;
    for (let i = 0; i < 20; i++) {
      pin.sample(out);
      if (out.held & (Sprint.Left | Sprint.Right)) sprinted = true;
    }
    expect(sprinted).toBe(false);
  });

  it('a flick on the pad still sprints (pad rules)', () => {
    const kb = new Fake('keyboard:kb1', 'keyboard');
    const pad = new Fake('pad0', 'gamepad');
    const pin = new PlayerInput(new MergedDevice('p1', 'both', () => [kb, pad]));
    const out = makeInput();
    for (let i = 0; i < 5; i++) pin.sample(out);
    pad.stickX = 1;
    let sprinted = false;
    for (let i = 0; i < 20; i++) {
      pin.sample(out);
      if (out.held & (Sprint.Left | Sprint.Right)) sprinted = true;
    }
    expect(sprinted).toBe(true);
  });
});
