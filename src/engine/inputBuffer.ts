import { BUTTON_COUNT } from './buttons';
import { INPUT_BUFFER_FRAMES } from './constants';

/**
 * Remembers recent button presses for `window` sim frames so an action pressed slightly
 * early still fires (e.g. jump pressed 4 frames before landing).
 *
 * Per tick call order: advance() -> record(pressedMask) -> has()/consume().
 * A press recorded on tick t is available on ticks t .. t + window - 1.
 */
export class InputBuffer {
  private readonly counters = new Int8Array(BUTTON_COUNT);

  constructor(readonly window: number = INPUT_BUFFER_FRAMES) {}

  advance(): void {
    const c = this.counters;
    for (let i = 0; i < BUTTON_COUNT; i++) if (c[i] > 0) c[i]--;
  }

  record(pressedMask: number): void {
    if (pressedMask === 0) return;
    for (let i = 0; i < BUTTON_COUNT; i++) {
      if (pressedMask & (1 << i)) this.counters[i] = this.window;
    }
  }

  has(button: number): boolean {
    return this.counters[bitIndex(button)] > 0;
  }

  /** Returns true and clears the buffered press, if present. */
  consume(button: number): boolean {
    const i = bitIndex(button);
    if (this.counters[i] > 0) {
      this.counters[i] = 0;
      return true;
    }
    return false;
  }

  clear(button?: number): void {
    if (button === undefined) this.counters.fill(0);
    else this.counters[bitIndex(button)] = 0;
  }

  /** Remaining frames of a buffered press (0 = none). */
  remaining(button: number): number {
    return this.counters[bitIndex(button)];
  }
}

function bitIndex(button: number): number {
  return 31 - Math.clz32(button);
}
