import { Button, type FighterInput } from '../engine/buttons';
import type { Fighter } from '../engine/fighter';
import type { World } from '../engine/world';

/** Produces a fighter's input for one sim tick (the CPU AI and training dummy implement this). */
export interface Controller {
  update(self: Fighter, world: World, out: FighterInput): void;
}

export function clearInput(out: FighterInput): void {
  out.stickX = 0;
  out.stickY = 0;
  out.held = 0;
  out.pressed = 0;
  out.released = 0;
}

/** Writes `held` into `out`, deriving pressed / released edges from the previous mask. */
export function applyHeld(out: FighterInput, held: number, prev: number): void {
  out.held = held;
  out.pressed = held & ~prev;
  out.released = ~held & prev & 0xff;
}

export class NullController implements Controller {
  update(_self: Fighter, _world: World, out: FighterInput): void {
    clearInput(out);
  }
}

export const DUMMY_MODES = ['stand', 'shield', 'jump', 'jab'] as const;
export type DummyMode = (typeof DUMMY_MODES)[number];

/** Training-dummy behaviour: stand, hold shield, hop, or jab on a loop. */
export class DummyController implements Controller {
  mode = 0;
  private prev = 0;
  private jabTimer = 0;

  update(_self: Fighter, world: World, out: FighterInput): void {
    out.stickX = 0;
    out.stickY = 0;
    let held = 0;
    switch (DUMMY_MODES[this.mode]) {
      case 'shield':
        held = Button.Shield;
        break;
      case 'jump':
        if (world.tick % 80 < 6) held = Button.Jump;
        break;
      case 'jab':
        if (++this.jabTimer % 50 < 2) held = Button.Attack;
        break;
      default:
        break;
    }
    applyHeld(out, held, this.prev);
    this.prev = held;
  }

  cycle(): DummyMode {
    this.mode = (this.mode + 1) % DUMMY_MODES.length;
    return DUMMY_MODES[this.mode];
  }
}
