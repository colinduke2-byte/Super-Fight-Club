import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { Button, makeInput } from '../src/engine/buttons';
import { CANCEL_REPEAT_MAX, Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { STAGES } from '../src/stages';
import { cancelGraph, cycles, findLoops } from './tools/loopFinder';

describe('infinites and loops through cancel routes', () => {
  it('every fighter has its cancel cycles found (Halcyon has the most routes)', () => {
    const routes = (id: string): number => Object.values(CHARACTERS[id].moves).reduce((n, m) => n + (m.cancels?.length ?? 0), 0);
    expect(routes('halcyon')).toBeGreaterThanOrEqual(20);
    expect(cycles(cancelGraph('halcyon')).length).toBeGreaterThan(0);
    expect(cycles(cancelGraph('vex')).length).toBeGreaterThan(0);
  });

  it('no cancel cycle (jab-to-jump cancels and aerial re-cancels included) keeps a dummy in hitstun for good', () => {
    expect(findLoops(16)).toEqual([]);
  }, 120_000);

  it('a cancel string enters the same move at most CANCEL_REPEAT_MAX times before the fighter is back in neutral', () => {
    for (const id of ['halcyon', 'vex', 'rime', 'riptide', 'obelisk']) {
      const world = new World(STAGES.classic);
      const f = new Fighter(0, CHARACTERS[id]);
      world.addFighter(f);
      f.standOn(world.platforms[0], 0);
      const route = f.data.moves.utilt.cancels!.find((c) => c.into === 'utilt')!;
      expect(route, id).toBeDefined();
      let entries = 0;
      f.startMove('utilt', null, world);
      for (let i = 0; i < 400; i++) {
        const inp = makeInput();
        if (f.state === 'attack' && f.move?.id === 'utilt') {
          f.moveHit = true; // pretend every swing connects
          if (f.moveFrame + 1 >= route.from) {
            inp.pressed = inp.held = Button.Attack;
            inp.stickY = -1;
          }
        }
        const before = f.moveFrame;
        world.step([inp]);
        if (f.state === 'attack' && f.move?.id === 'utilt' && f.moveFrame <= 1 && before > 1) entries++;
        if (f.state !== 'attack') break;
      }
      expect(entries, id).toBe(CANCEL_REPEAT_MAX);
    }
  });
});
