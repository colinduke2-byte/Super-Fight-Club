import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { heldItem, heldState } from '../src/engine/items';
import { World } from '../src/engine/world';
import { skinsInUse } from '../src/scenes/skinsInUse';
import { STAGES } from '../src/stages';

// Crashes found by soaking the built game in a browser (see the error overlay's scene + stack).
describe('crash regressions', () => {
  it("a hit nobody owns (lastHitBy -1: a hazard, an unowned item) has an empty hand, not undefined (\"reading 'kind'\")", () => {
    const world = new World(STAGES.wreck);
    const f = new Fighter(0, CHARACTERS.halcyon);
    world.addFighter(f);
    f.spawn(0, -1, 1);
    expect(f.lastHitBy).toBe(-1);
    // WorldEventFx asked heldState(world, f.lastHitBy).kind on every 'hit': with -1 that threw inside the world's event
    // emit, aborting receiveHit half way (and, before the per-scene guard, froze the game loop for good)
    expect(() => heldState(world, f.lastHitBy).kind).not.toThrow();
    expect(heldState(world, -1).kind).toBeNull();
    expect(heldItem(world, -1)).toBeNull();
    // the empty hand is not stored: real slots are unaffected
    heldState(world, -1).kind = 'sword';
    expect(heldState(world, 0).kind).toBeNull();
    expect(heldState(world, -1).kind).toBeNull();
  });

  it('hazard hits (no attacker) on every hazard stage, with a listener that reads the attacker hand for each hit', () => {
    let unowned = 0;
    for (const id of ['storm', 'reactor', 'skyhold', 'hollow', 'stormrunner', 'temple', 'wreck', 'frostfang']) {
      const world = new World(STAGES[id]);
      const fs = [new Fighter(0, CHARACTERS.brick), new Fighter(1, CHARACTERS.vex)];
      fs.forEach((f, i) => {
        world.addFighter(f);
        f.spawn(i ? 30 : -30, -1, i ? -1 : 1);
      });
      world.listener = (type, f) => {
        if (type !== 'hit') return;
        if (f.lastHitBy < 0) unowned++;
        void heldState(world, f.lastHitBy).kind;
      };
      const ins: FighterInput[] = [makeInput(), makeInput()];
      expect(() => {
        for (let t = 0; t < 60 * 40; t++) world.step(ins);
      }).not.toThrow();
    }
    // idle fighters only ever get hit by the stages' hazards: the case that crashed
    expect(unowned).toBeGreaterThan(0);
  });
});


describe('skinsInUse (outfit release never frees a texture a live sprite shows)', () => {
  it('finds fighter skins on top-level objects, inside layers / containers, and in a playing animation', () => {
    const sprite = (key: string) => ({ texture: { key } });
    const scenes = [
      { sys: { displayList: { list: [sprite('fighter:brick~2'), sprite('bg-planet'), { list: [sprite('fighter:vex~3'), { list: [sprite('fighter:nova')] }] }] } } },
      // a sprite parked on another texture but playing an outfit's animation
      { sys: { displayList: { list: [{ texture: { key: '__DEFAULT' }, anims: { currentAnim: { frames: [{ textureKey: 'fighter:rime~5' }] } } }] } } },
      // a scene that was never started has no display list yet
      { sys: {} },
    ];
    const got = skinsInUse({ scene: { scenes } } as never);
    expect([...got].sort()).toEqual(['brick~2', 'nova', 'rime~5', 'vex~3']);
  });
});
