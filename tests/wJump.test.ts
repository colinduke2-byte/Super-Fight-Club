import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { Button, makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import type { InputDevice, RawInput } from '../src/input/device';
import { PlayerInput } from '../src/input/playerInput';
import { settings } from '../src/settings';
import { STAGES } from '../src/stages';

/**
 * W / Up jumps on keyboards, but Up + Attack / Special pressed right after it must still give the up moves:
 * the jump is held back for a couple of ticks (PlayerInput) and dropped when a move button follows.
 */
class Keys implements InputDevice {
  readonly id = 'keyboard:kb1';
  readonly label = 'kb';
  readonly kind = 'keyboard' as const;
  readonly connected = true;
  stickY = 0;
  held = 0;
  sample(out: RawInput): void {
    out.stickX = 0;
    out.stickY = this.stickY;
    out.held = this.held;
  }
}

function setup(char: string) {
  const world = new World(STAGES.classic);
  const me = new Fighter(0, CHARACTERS[char]);
  const dummy = new Fighter(1, CHARACTERS.brick);
  world.addFighter(me);
  world.addFighter(dummy);
  me.spawn(0, -1, 1);
  dummy.spawn(160, -1, -1);
  const keys = new Keys();
  const pin = new PlayerInput(keys);
  const ins = [makeInput(), makeInput()];
  const tick = (stickY: number, held: number): void => {
    keys.stickY = stickY;
    keys.held = held;
    pin.sample(ins[0]);
    world.step(ins);
  };
  for (let i = 0; i < 120; i++) tick(0, 0);
  return { world, me, tick };
}

describe('W jumps, up moves still come out', () => {
  it('is on by default for keyboards', () => {
    expect(settings.upJumpKeyboard).toBe(true);
  });

  it('W alone: the fighter jumps', () => {
    const { me, tick } = setup('nova');
    for (let i = 0; i < 20; i++) tick(-1, 0);
    expect(me.grounded).toBe(false);
  });

  it('W then Attack a tick later on the ground: an up attack, no jump', () => {
    const { me, tick } = setup('nova');
    tick(-1, 0);
    tick(-1, Button.Attack);
    let moves = '';
    for (let i = 0; i < 8; i++) {
      tick(-1, Button.Attack);
      if (me.move) moves = me.move.id;
    }
    expect(moves.startsWith('u')).toBe(true); // utilt / usmash
    expect(me.grounded).toBe(true);
  });

  it('W + Special in the air: up-special without spending the double jump', () => {
    const { me, tick } = setup('nova');
    Object.assign(me, { y: -200, vy: 0, grounded: false, groundPlat: null, state: 'air', jumpsLeft: me.stats.doubleJumps });
    tick(0, 0);
    const jumps = me.jumpsLeft;
    tick(-1, Button.Special);
    let moves = '';
    for (let i = 0; i < 6; i++) {
      tick(-1, Button.Special);
      if (me.move) moves = me.move.id;
    }
    expect(moves.startsWith('upB')).toBe(true);
    expect(me.jumpsLeft).toBe(jumps);
  });
});
