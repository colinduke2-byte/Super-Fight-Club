import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { makeInput } from '../src/engine/buttons';
import { INNER_MAX_GAP, innerRect } from '../src/engine/combat';
import { Fighter } from '../src/engine/fighter';
import type { MoveDef } from '../src/engine/moves';
import { World } from '../src/engine/world';
import { sandboxStage } from '../src/stages/sandbox';
import { competitiveStages } from './tools/matchSim';
import { FIGHTERS, mutual, OFFSETS, overlapMatch, pointBlank } from './tools/pointBlank';

/** Point blank: two bodies standing inside each other must not swing straight past one another. */
const NORMALS = ['jab1', 'ftilt', 'utilt', 'dtilt', 'fsmash', 'usmash', 'dsmash', 'dashAttack', 'grab'];

describe('point-blank hits', () => {
  it("every fighter's jab, tilts, smashes, dash attack and grab connect on a rival standing inside it (either side, either facing)", () => {
    const misses: string[] = [];
    for (const a of FIGHTERS)
      for (const b of ['brick', 'rime']) // a middleweight and the smallest body
        for (const mv of NORMALS) {
          const m = CHARACTERS[a].moves[mv];
          if (!m || m.hitboxes.length === 0) continue; // projectile-only moves (a mortar) land later, elsewhere
          for (const dx of OFFSETS)
            for (const f of [1, -1] as const) {
              if (mv === 'dashAttack' && dx * f < 0) continue; // a dash attack is a forward lunge: a rival behind it at the start is not in its path
              const r = pointBlank(a, b, mv, dx, f);
              if (r !== 'hit') misses.push(`${a}.${mv} vs ${b} dx${dx} f${f}: ${r}`);
            }
        }
    expect(misses).toEqual([]);
  });

  it('two fighters attacking inside each other: somebody gets hit (or the attacks clank), almost never a double whiff', () => {
    const mm = ['jab1', 'ftilt', 'dtilt', 'fsmash', 'dsmash'];
    let none = 0;
    let n = 0;
    for (const [a, b] of [['brick', 'vex'], ['rime', 'obelisk'], ['agni', 'halcyon'], ['gizmo', 'havoc'], ['nova', 'riptide']])
      for (const ma of mm)
        for (const mb of mm)
          for (const dx of OFFSETS)
            for (const [fa, fb] of [[1, -1], [1, 1]] as const) {
              n++;
              if (mutual(a, b, ma, mb, dx, fa, fb) === 'none') none++;
            }
    expect(none / n).toBeLessThan(0.01);
  });

  it('the inner part only bridges a short gap: far disjointed pokes and specials keep their exact shapes', () => {
    const world = new World(sandboxStage);
    const f = new Fighter(0, CHARACTERS.brick);
    world.addFighter(f);
    f.spawn(0, -1, 1);
    const out = [0, 0, 0, 0];
    const poke: MoveDef = { ...CHARACTERS.brick.moves.ftilt, hitboxes: [{ ...CHARACTERS.brick.moves.ftilt.hitboxes[0], x: INNER_MAX_GAP + 30, w: 10 }] };
    expect(innerRect(f, poke, poke.hitboxes[0], out)).toBe(false);
    const near: MoveDef = { ...poke, hitboxes: [{ ...poke.hitboxes[0], x: 20, w: 16 }] };
    expect(innerRect(f, near, near.hitboxes[0], out)).toBe(true);
    expect(out[0]).toBe(f.x); // reaches back to the body centre
    expect(out[0] + out[2]).toBe(f.x + 12); // up to the box's near edge
    const special: MoveDef = { ...near, kind: 'special' };
    expect(innerRect(f, special, special.hitboxes[0], out)).toBe(false);
  });
});

describe('soft separation', () => {
  const pair = (): { world: World; a: Fighter; b: Fighter } => {
    const world = new World(sandboxStage);
    const a = new Fighter(0, CHARACTERS.brick);
    const b = new Fighter(1, CHARACTERS.vex);
    world.addFighter(a);
    world.addFighter(b);
    a.spawn(0, -1, 1);
    b.spawn(1, -1, -1);
    return { world, a, b };
  };

  it('two grounded bodies stacked on one spot part within a few frames, even while one is attacking', () => {
    const { world, a, b } = pair();
    const n = makeInput();
    for (let i = 0; i < 4; i++) world.step([n, n]);
    a.x = 0;
    b.x = 1;
    a.startMove('fsmash', null, world);
    let t = 0;
    const reach = (a.hw + b.hw) * 0.5;
    while (Math.abs(b.x - a.x) < reach && t < 40) {
      world.step([n, n]);
      t++;
    }
    expect(t).toBeLessThan(16);
  });

  it('a dash still runs straight through a standing rival (cross-ups stay)', () => {
    const { world, a, b } = pair();
    const n = makeInput();
    for (let i = 0; i < 10; i++) world.step([n, n]);
    a.x = -40;
    b.x = 0;
    const right = { ...makeInput(), stickX: 1 };
    for (let i = 0; i < 70 && a.x < b.x + 12; i++) world.step([right, n]);
    expect(a.x).toBeGreaterThan(b.x + 10);
  });
});

describe('CPU overlap time', () => {
  it('skill-9 CPUs spend little time inside each other, and never long', () => {
    const st = competitiveStages(2);
    let ticks = 0;
    let over = 0;
    let max = 0;
    const pairs: [string, string][] = [['brick', 'vex'], ['rime', 'obelisk'], ['agni', 'halcyon'], ['gizmo', 'havoc'], ['nova', 'riptide'], ['brick', 'rime']];
    pairs.forEach((p, i) => {
      const r = overlapMatch(p, st[i % st.length], 9, i, 4000);
      ticks += r.ticks;
      over += r.overlapTicks;
      max = Math.max(max, ...r.episodes, 0);
    });
    // before soft separation reached attacking bodies (and the inner hitbox parts): ~1.7% of the time, episodes up to 60 ticks
    expect(over / ticks).toBeLessThan(0.012);
    expect(max).toBeLessThan(40);
  });
});
