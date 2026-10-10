import { describe, expect, it } from 'vitest';
import { BossController } from '../src/ai/boss';
import { CpuController } from '../src/ai/cpu';
import { BOSSES, CHARACTERS } from '../src/characters';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { Match } from '../src/engine/match';
import { World } from '../src/engine/world';
import { STAGES } from '../src/stages';

function fight(playerChar: string, level: 1 | 2 | 3 | 0, ticks = 14400, stage = 'reactor') {
  const world = new World(STAGES[stage]);
  const p = new Fighter(0, CHARACTERS[playerChar]);
  const b = new Fighter(1, BOSSES.overseer);
  world.addFighter(p);
  world.addFighter(b);
  const match = new Match(world, { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 });
  match.scores[1].stocks = 2;
  const sp = STAGES[stage].spawns;
  const place = (f: Fighter, air = false): void => f.spawn(sp[f.id === 0 ? 0 : 1].x, sp[0].y - (air ? 130 : 1), f.id === 0 ? 1 : -1);
  place(p);
  place(b);
  match.onRespawn = (f) => place(f, true);
  world.listener = (type, f, _x, _y, _m, extra) => {
    if (type === 'ko') match.onKo(f, extra);
  };
  const boss = new BossController(() => match.scores[1].stocks, 1);
  const cpu = level ? new CpuController(level, 1) : null;
  const ins = [makeInput(), makeInput()];
  let t = 0;
  const used: Record<string, number> = {};
  const orig = world.listener;
  world.listener = (type, f, x, y, m, e, tag) => {
    if (type === 'moveStart' && f.id === 1) used[f.move?.id ?? '?'] = (used[f.move?.id ?? '?'] ?? 0) + 1;
    orig?.(type, f, x, y, m, e, tag);
  };
  for (; t < ticks && !match.over; t++) {
    if (cpu) cpu.update(p, world, ins[0]);
    boss.update(b, world, ins[1]);
    world.step(ins);
    match.step();
  }
  return { match, world, boss, t, used, p, b };
}

describe('the Overseer boss', () => {
  it('telegraphs: every attack has a readable windup', () => {
    for (const m of Object.values(BOSSES.overseer.moves)) {
      const maxDmg = Math.max(0, ...m.hitboxes.map((h) => h.damage));
      expect(m.startup, m.id).toBeGreaterThanOrEqual(maxDmg >= 14 ? 14 : 6);
    }
  });

  it('runs its whole pattern book against a stationary target and hurts it', () => {
    const r = fight('brick', 0, 9000);
    expect(r.p.damage > 60 || r.match.over).toBe(true);
    expect(r.boss.used.size).toBeGreaterThanOrEqual(6);
    expect(Object.keys(r.used).length).toBeGreaterThanOrEqual(6);
  });

  it('enrages and unleashes Cataclysm in phase two', () => {
    let stocks = 2;
    const world = new World(STAGES.reactor);
    const p = new Fighter(0, CHARACTERS.nova);
    const b = new Fighter(1, BOSSES.overseer);
    world.addFighter(p);
    world.addFighter(b);
    p.spawn(-100, -1, 1);
    b.spawn(100, -1, -1);
    p.invuln = 99999;
    const boss = new BossController(() => stocks, 4);
    const ins = [makeInput(), makeInput()];
    const used = new Set<string>();
    world.listener = (type, f) => {
      if (type === 'moveStart' && f.id === 1) used.add(f.move!.id);
    };
    for (let t = 0; t < 1200; t++) {
      boss.update(b, world, ins[1]);
      world.step(ins);
    }
    expect(b.res.enrage).toBe(0);
    expect(used.has('ultimate')).toBe(false);
    stocks = 1;
    for (let t = 0; t < 2600; t++) {
      boss.update(b, world, ins[1]);
      world.step(ins);
    }
    expect(b.res.enrage).toBe(1);
    expect(b.damageMult).toBeGreaterThan(1.3);
    expect(used.has('ultimate')).toBe(true);
  });

  it('recovers to the stage when launched off it', () => {
    const world = new World(STAGES.reactor);
    const p = new Fighter(0, CHARACTERS.nova);
    const b = new Fighter(1, BOSSES.overseer);
    world.addFighter(p);
    world.addFighter(b);
    p.spawn(-100, -1, 1);
    p.invuln = 99999;
    b.spawn(100, -1, -1);
    const boss = new BossController(() => 2, 2);
    const ins = [makeInput(), makeInput()];
    for (let i = 0; i < 200; i++) {
      boss.update(b, world, ins[1]);
      world.step(ins);
    }
    Object.assign(b, { x: 215, y: 60, vx: 0, vy: 0, grounded: false, groundPlat: null, state: 'air', invuln: 0, jumpsLeft: 1 });
    let back = false;
    for (let t = 0; t < 300 && b.state !== 'ko'; t++) {
      boss.update(b, world, ins[1]);
      world.step(ins);
      if (b.grounded || b.state === 'ledge') {
        back = true;
        break;
      }
    }
    expect(back).toBe(true);
  });

  it('is beatable: a Hard Nova takes it down, and an Easy CPU cannot', () => {
    expect(fight('nova', 3).match.winner).toBe(0);
    expect(fight('brick', 1).match.winner).toBe(1);
  }, 60000);

  it('is deterministic', () => {
    const a = fight('vex', 2, 1500).world.hash();
    const b = fight('vex', 2, 1500).world.hash();
    expect(a).toBe(b);
  });
});
