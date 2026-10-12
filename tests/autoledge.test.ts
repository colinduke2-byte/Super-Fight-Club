import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { classicStage } from '../src/stages/classic';

describe('auto ledge grab', () => {
  it('walking off the stage edge grabs the ledge', () => {
    const w = new World(classicStage);
    const f = new Fighter(0, brick);
    w.addFighter(f);
    f.spawn(150, -1, 1);
    for (let i = 0; i < 20; i++) w.step([makeInput()]);
    for (let i = 0; i < 90 && f.state !== 'ledge'; i++) w.step([{ ...makeInput(), stickX: 0.5 }]);
    expect(f.state).toBe('ledge');
  });
  it('a jump off the edge does not auto-grab immediately', () => {
    const w = new World(classicStage);
    const f = new Fighter(0, brick);
    w.addFighter(f);
    f.spawn(160, -1, 1);
    for (let i = 0; i < 20; i++) w.step([makeInput()]);
    expect(f.state).not.toBe('ledge');
  });
});
