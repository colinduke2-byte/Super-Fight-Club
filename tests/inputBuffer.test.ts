import { describe, expect, it } from 'vitest';
import { Button } from '../src/engine/buttons';
import { InputBuffer } from '../src/engine/inputBuffer';

/** Mirrors the per-tick call order used by Fighter.update. */
function tick(b: InputBuffer, pressed = 0): void {
  b.advance();
  b.record(pressed);
}

describe('InputBuffer', () => {
  it('has an 8-frame default window: a press is usable on 8 ticks, then expires', () => {
    const b = new InputBuffer();
    tick(b, Button.Jump); // tick 0: the press
    expect(b.has(Button.Jump)).toBe(true);
    for (let i = 1; i < 8; i++) {
      tick(b);
      expect(b.has(Button.Jump)).toBe(true); // ticks 1..7
    }
    tick(b); // tick 8
    expect(b.has(Button.Jump)).toBe(false);
  });

  it('consume returns true once and clears the press', () => {
    const b = new InputBuffer();
    tick(b, Button.Attack);
    expect(b.consume(Button.Attack)).toBe(true);
    expect(b.consume(Button.Attack)).toBe(false);
    expect(b.has(Button.Attack)).toBe(false);
  });

  it('tracks buttons independently', () => {
    const b = new InputBuffer();
    tick(b, Button.Jump | Button.Shield);
    expect(b.consume(Button.Jump)).toBe(true);
    expect(b.has(Button.Shield)).toBe(true);
    expect(b.has(Button.Attack)).toBe(false);
  });

  it('a new press refreshes the window', () => {
    const b = new InputBuffer();
    tick(b, Button.Jump);
    for (let i = 0; i < 4; i++) tick(b);
    tick(b, Button.Jump);
    for (let i = 0; i < 5; i++) {
      tick(b);
      expect(b.has(Button.Jump)).toBe(true);
    }
  });

  it('supports custom windows and clear()', () => {
    const b = new InputBuffer(2);
    tick(b, Button.Jump);
    tick(b);
    expect(b.has(Button.Jump)).toBe(true);
    tick(b);
    expect(b.has(Button.Jump)).toBe(false);
    tick(b, Button.Special);
    b.clear();
    expect(b.has(Button.Special)).toBe(false);
  });
});
