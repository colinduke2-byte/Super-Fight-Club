import { describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { classicStage } from '../src/stages/classic';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

describe('drop through platforms', () => {
  const setup = () => {
    const w = new World(classicStage);
    const f = new Fighter(0, brick);
    w.addFighter(f);
    f.spawn(-100, -72, 1); // on the low left pass-through platform
    for (let i = 0; i < 20; i++) w.step([inp()]);
    return { w, f };
  };
  it('tapping down drops through a pass-through platform', () => {
    const { w, f } = setup();
    expect(f.grounded && f.groundPlat?.kind === 'pass').toBe(true);
    for (let i = 0; i < 3; i++) w.step([inp({ stickY: 1 })]);
    expect(f.grounded).toBe(false);
    expect(f.y).toBeGreaterThan(-68);
  });
  it('holding down while landing does not drop you; the main stage never drops', () => {
    const w = new World(classicStage);
    const f = new Fighter(0, brick);
    w.addFighter(f);
    f.spawn(0, -4, 1);
    for (let i = 0; i < 20; i++) w.step([inp()]);
    for (let i = 0; i < 20; i++) w.step([inp({ stickY: 1 })]);
    expect(f.grounded).toBe(true);
    expect(f.y).toBeCloseTo(0, 0);
  });
});
