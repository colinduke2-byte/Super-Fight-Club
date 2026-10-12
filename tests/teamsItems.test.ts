import { describe, expect, it } from 'vitest';
import { chooseTarget } from '../src/ai/targeting';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { applyItem, ITEM_INTERVAL } from '../src/engine/items';
import { Match } from '../src/engine/match';
import { World } from '../src/engine/world';
import { buildResult } from '../src/game/results';
import { classicStage } from '../src/stages/classic';
import { GamepadDevice } from '../src/input/gamepad';
import { settings } from '../src/settings';

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

function arena(n: number, teams = false) {
  const world = new World(classicStage);
  const fs = Array.from({ length: n }, (_, i) => new Fighter(i, brick));
  fs.forEach((f, i) => {
    world.addFighter(f);
    f.spawn(-60 + i * 40, -1, 1);
    if (teams) f.team = i < 2 ? 0 : 1;
  });
  const ins = fs.map(() => inp());
  for (let i = 0; i < 130; i++) world.step(ins);
  fs.forEach((f) => (f.invuln = 0));
  return { world, fs, ins };
}

describe('team battles', () => {
  it('teammates cannot hit each other, opponents can', () => {
    const { world, fs, ins } = arena(4, true);
    // everyone stacked close: fighter 0 jabs
    fs[0].x = 0;
    fs[1].x = 14; // teammate in front
    fs[2].x = -14; // opponent behind (hit by bair-ish? use a spin: nair needs air) -> compare with jab facing right
    fs[3].x = 300;
    ins[0] = inp({ pressed: Button.Attack, held: Button.Attack });
    world.step(ins);
    ins[0] = inp();
    for (let i = 0; i < 30; i++) world.step(ins);
    expect(fs[1].damage).toBe(0);
    // an opponent in front does take it
    const t = arena(4, true);
    t.fs[0].x = 0;
    t.fs[2].x = 14;
    t.fs[1].x = -300;
    t.fs[3].x = 300;
    t.ins[0] = inp({ pressed: Button.Attack, held: Button.Attack });
    t.world.step(t.ins);
    t.ins[0] = inp();
    for (let i = 0; i < 30; i++) t.world.step(t.ins);
    expect(t.fs[2].damage).toBeGreaterThan(0);
  });

  it('the match ends when one team is out of stocks, and the results rank the winning team first', () => {
    const { world, fs } = arena(4, true);
    const match = new Match(world, { mode: 'stock', stocks: 1, timeLimitSec: 0, respawnDelay: 70 });
    match.scores[2].eliminated = true;
    match.scores[3].eliminated = true;
    match.step();
    expect(match.over).toBe(true);
    expect(match.winnerTeam).toBe(0);
    const slots = fs.map((_, i) => ({ index: i, type: 'human' as const, device: null, character: 'brick', cpuLevel: 1 as const }));
    const r = buildResult(slots, match.scores, [0, 0, 0, 0], [-1, -1, 10, 20], match.cfg, match.winner, 600, fs.map((f) => f.team), match.winnerTeam);
    expect(r.players.filter((p) => p.placement === 1).map((p) => p.index).sort()).toEqual([0, 1]);
    expect(r.winnerTeam).toBe(0);
  });

  it('CPUs never target their own teammate', () => {
    const { world, fs } = arena(4, true);
    fs.forEach((f, i) => Object.assign(f, { x: i * 30 }));
    for (let k = 0; k < 10; k++) {
      const t = chooseTarget(fs[0], world, -1, [k * 7, 0, 0, 0]);
      expect([2, 3]).toContain(t);
    }
  });
});

describe('items', () => {
  it('drop on a timer, fall onto the stage, and pick-up effects work', () => {
    const { world, fs, ins } = arena(2);
    world.config.itemRate = 2;
    const kinds = new Set<string>();
    let landed = false;
    for (let t = 0; t < ITEM_INTERVAL[2] * 6; t++) {
      fs.forEach((f) => (f.invuln = 99));
      world.step(ins);
      for (const it of world.items) {
        if (it.active) kinds.add(it.kind);
        if (it.active && it.resting) landed = true;
      }
    }
    expect(landed).toBe(true);
    expect(kinds.size).toBeGreaterThan(0);

    fs[0].damage = 60;
    applyItem(world, 'heal', 0);
    expect(fs[0].damage).toBe(35);
    fs[0].meter = 0;
    applyItem(world, 'cell', 0);
    expect(fs[0].meter).toBe(50);
    applyItem(world, 'boost', 0);
    expect(fs[0].boostFrames).toBe(600);
    expect(fs[0].outMul).toBeCloseTo(1.3);
  });

  it('the Aegis Core makes the holder shrug off hits for five seconds', () => {
    const { world, fs, ins } = arena(2);
    for (let t = 0; t < 130; t++) world.step(ins); // spawn invincibility wears off
    applyItem(world, 'aegis', 0);
    expect(fs[0].aegisFrames).toBe(300);
    expect(fs[0].invuln).toBeGreaterThanOrEqual(300); // combat, hazards and grabs all skip an invincible fighter
    for (let t = 0; t < 301; t++) world.step(ins);
    expect(fs[0].aegisFrames).toBe(0);
    expect(fs[0].invuln).toBe(0);
  });

  it('a fighter walking into an item picks it up', () => {
    const { world, fs, ins } = arena(2);
    world.config.itemRate = 1;
    for (let t = 0; t < ITEM_INTERVAL[1] + 1; t++) world.step(ins);
    const it = world.items.find((x) => x.active)!;
    expect(it).toBeDefined();
    it.resting = true;
    it.vy = 0;
    it.y = -7;
    it.x = fs[0].x;
    fs[0].damage = 50;
    it.kind = 'heal';
    world.step(ins);
    expect(it.active).toBe(false);
    expect(fs[0].damage).toBe(25);
  });

  it('drops are deterministic', () => {
    const run = (): string => {
      const { world, fs, ins } = arena(2);
      world.config.itemRate = 2;
      let log = '';
      for (let t = 0; t < 4000; t++) {
        fs.forEach((f) => (f.invuln = 99));
        world.step(ins);
        for (const it of world.items) if (it.active && it.age === 1) log += `${it.kind}@${it.x.toFixed(2)};`;
      }
      return log;
    };
    expect(run()).toBe(run());
    expect(run().length).toBeGreaterThan(0);
  });
});

describe('rumble', () => {
  it('asks the gamepad actuator for a dual-rumble effect, unless disabled', () => {
    const calls: unknown[] = [];
    const pad = { index: 0, connected: true, id: 'x', buttons: [], axes: [], vibrationActuator: { playEffect: (t: string, p: unknown) => (calls.push([t, p]), Promise.resolve('complete')) } };
    Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
    const dev = new GamepadDevice(0, 'Test Pad');
    dev.rumble(0.8, 0.4, 100);
    expect(calls).toHaveLength(1);
    expect((calls[0] as [string, { duration: number }])[0]).toBe('dual-rumble');
    settings.rumble = false;
    dev.rumble(1, 1, 100);
    expect(calls).toHaveLength(1);
    settings.rumble = true;
  });
});
