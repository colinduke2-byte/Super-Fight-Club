import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { classicStage } from '../src/stages/classic';

/** Bugs found in review: each test pins one fix. */
function duel(a: string, b: string) {
  const world = new World(classicStage);
  const fa = new Fighter(0, CHARACTERS[a]);
  const fb = new Fighter(1, CHARACTERS[b]);
  world.addFighter(fa);
  world.addFighter(fb);
  fa.spawn(-60, -1, 1);
  fb.spawn(60, -1, -1);
  const ins = [makeInput(), makeInput()];
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) world.step(ins);
  };
  run(130);
  return { world, fa, fb, run };
}

describe('regressions', () => {
  it('a third pillar replaces the oldest and stands on its own platform', () => {
    const t = duel('obelisk', 'brick');
    for (const x of [-100, -40, 60]) {
      t.world.spawnDeployable(0, 'pillar', x, 0);
      t.run(12);
    }
    const pillars = t.world.deployables.filter((d) => d.active && d.def?.pillar);
    expect(pillars).toHaveLength(2);
    for (const p of pillars) {
      expect(p.plat).not.toBeNull();
      expect(Math.abs(p.plat!.x + p.plat!.w / 2 - p.x)).toBeLessThan(2); // the platform is under the pillar
    }
    expect(pillars.map((p) => p.x).sort((a, b) => a - b)).toEqual([-40, 60]);
  });

  it('C4 stuck to a rival drops when the rival is KO\'d instead of hanging in the air', () => {
    const t = duel('havoc', 'vex');
    const c4 = t.world.spawnDeployable(0, 'c4', t.fb.x, t.fb.y)!;
    c4.attached = 1;
    t.run(2);
    t.fb.forceKo(t.world);
    const y0 = c4.y;
    t.run(30);
    expect(!c4.active || c4.y > y0 + 10).toBe(true);
  });

  it('an air grab falls with gravity and lets go into the air state', () => {
    const t = duel('gizmo', 'brick');
    Object.assign(t.fa, { x: -40, y: -200, grounded: false, vy: 0 });
    t.fb.invuln = 0;
    t.fa.grabVictim(t.fb);
    const y0 = t.fa.y;
    t.run(10);
    expect(t.fa.y).toBeGreaterThan(y0);
    t.run(200);
    expect(t.fb.state).not.toBe('grabbed');
    if (!t.fa.grounded && t.fa.state !== 'ko') expect(t.fa.state).not.toBe('idle');
  });
});
