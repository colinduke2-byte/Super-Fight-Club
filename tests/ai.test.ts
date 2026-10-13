import { describe, expect, it } from 'vitest';
import { CpuController } from '../src/ai/cpu';
import { aiFor, CHARACTER_AI, LEVELS, type CpuLevel } from '../src/ai/profiles';
import { moveTable, NORMAL_INPUTS } from '../src/ai/moveInfo';
import { offstage } from '../src/ai/recovery';
import { chooseTarget } from '../src/ai/targeting';
import { CHARACTERS } from '../src/characters';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { Match } from '../src/engine/match';
import { World } from '../src/engine/world';
import { STAGES } from '../src/stages';

function arena(chars: string[], stage = 'classic'): { world: World; fighters: Fighter[]; match: Match; place: (f: Fighter, air?: boolean) => void } {
  const world = new World(STAGES[stage]);
  const fighters = chars.map((c, i) => new Fighter(i, CHARACTERS[c]));
  fighters.forEach((f) => world.addFighter(f));
  const match = new Match(world, { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 });
  const sp = STAGES[stage].spawns;
  const place = (f: Fighter, air = false): void => f.spawn(sp[f.id].x, sp[f.id].y - (air ? 130 : 1), sp[f.id].x <= 0 ? 1 : -1);
  fighters.forEach((f) => place(f));
  match.onRespawn = (f) => place(f, true);
  world.listener = (type, f, _x, _y, _m, extra) => {
    if (type === 'ko') match.onKo(f, extra);
  };
  return { world, fighters, match, place };
}

function recover(char: string, level: CpuLevel, x: number, y: number): boolean {
  const { world, fighters } = arena([char, 'brick']);
  const [me, other] = fighters;
  other.spawn(-90, -1, 1);
  const cpu = new CpuController(level, 3);
  const ins = [makeInput(), makeInput()];
  for (let i = 0; i < 140; i++) world.step(ins);
  Object.assign(me, { x, y, vx: 0, vy: 0, grounded: false, groundPlat: null, state: 'air', invuln: 0, jumpsLeft: me.stats.doubleJumps, facing: x < 0 ? 1 : -1 });
  for (let t = 0; t < 360; t++) {
    cpu.update(me, world, ins[0]);
    world.step(ins);
    if (me.state === 'ko') return false;
    if (me.grounded || me.state === 'ledge' || me.state === 'ledgeClimb') return true;
  }
  return false;
}

describe('CPU frame-data knowledge', () => {
  it('derives reach, speed and damage of every normal for every character', () => {
    for (const c of Object.values(CHARACTERS)) {
      const t = moveTable(c);
      expect(t.length).toBeGreaterThanOrEqual(9);
      for (const m of t) {
        expect(m.maxX).toBeGreaterThan(m.minX);
        expect(m.startup).toBeGreaterThan(0);
        expect(NORMAL_INPUTS[m.id]).toBeDefined();
      }
    }
  });
  it('every roster character has an AI profile naming real moves', () => {
    for (const c of Object.values(CHARACTERS)) {
      expect(CHARACTER_AI[c.id]).toBeDefined();
      const ai = aiFor(c.id);
      for (const slot of [...ai.ranged, ...ai.closers, ...ai.setups]) {
        const has = c.moves[slot] || Object.keys(c.moves).some((k) => k.startsWith(`${slot}_`));
        expect(has, `${c.id}.${slot}`).toBeTruthy();
      }
      expect(c.moves[ai.recovery.slot] || Object.keys(c.moves).some((k) => k.startsWith(`${ai.recovery.slot}_`))).toBeTruthy();
    }
  });
  it('difficulty levels get strictly sharper', () => {
    expect(LEVELS[1].reaction).toBeGreaterThan(LEVELS[2].reaction);
    expect(LEVELS[2].reaction).toBeGreaterThan(LEVELS[3].reaction);
    expect(LEVELS[1].mistakes).toBeGreaterThan(LEVELS[3].mistakes);
    expect(LEVELS[3].recovery).toBeGreaterThan(LEVELS[1].recovery);
  });
});

describe('CPU recovery', () => {
  // off-stage spots a human could get back from (the last two are the hard ones)
  const reachable: [number, number][] = [[-230, 40], [230, 40], [-200, 120], [200, 120], [260, 80], [-260, 160]];
  for (const char of ['brick', 'vex', 'nova', 'gizmo', 'agni']) {
    it(`${char}: Normal and Hard CPUs get back to the stage from every reachable spot`, () => {
      for (const level of [2, 3] as const) {
        for (const [x, y] of reachable) expect(recover(char, level, x, y), `${char} L${level} from ${x},${y}`).toBe(true);
      }
    });
  }
  it('Easy recovers less reliably than Hard overall', () => {
    let easy = 0;
    let hard = 0;
    for (const char of ['brick', 'vex', 'nova', 'gizmo', 'agni']) {
      for (const [x, y] of reachable) {
        if (recover(char, 1, x, y)) easy++;
        if (recover(char, 3, x, y)) hard++;
      }
    }
    expect(hard).toBeGreaterThanOrEqual(easy);
    expect(hard).toBe(reachable.length * 5);
  });
  it('knows when it is off the stage', () => {
    const { world, fighters } = arena(['brick', 'vex']);
    const f = fighters[0];
    for (let i = 0; i < 140; i++) world.step([makeInput(), makeInput()]);
    expect(offstage(f, world)).toBe(false);
    Object.assign(f, { x: 300, y: 20, grounded: false, groundPlat: null, state: 'air' });
    expect(offstage(f, world)).toBe(true);
  });
});

describe('CPU targeting (free-for-all)', () => {
  function ffa(): { world: World; fighters: Fighter[] } {
    const { world, fighters } = arena(['brick', 'vex', 'nova', 'gizmo']);
    for (let i = 0; i < 140; i++) world.step(fighters.map(() => makeInput()));
    return { world, fighters };
  }
  it('retaliates against whoever just hit it', () => {
    const { world, fighters } = ffa();
    fighters.forEach((f, i) => Object.assign(f, { x: -150 + i * 100, y: -1 }));
    fighters[0].lastHitBy = 3;
    const pick = chooseTarget(fighters[0], world, -1, [0, 0, 0, 0]);
    expect(pick).toBe(3);
  });
  it('goes for a weakened opponent that is not much further away', () => {
    const { world, fighters } = ffa();
    fighters.forEach((f, i) => Object.assign(f, { x: i * 60, y: -1 }));
    fighters[3].damage = 140;
    expect(chooseTarget(fighters[0], world, -1, [0, 0, 0, 0])).toBe(3);
  });
  it('does not pile onto an opponent that two others are already brawling with', () => {
    const { world, fighters } = ffa();
    Object.assign(fighters[0], { x: 0, y: -1 });
    Object.assign(fighters[1], { x: 80, y: -1 });
    Object.assign(fighters[2], { x: 110, y: -1, state: 'attack' });
    Object.assign(fighters[3], { x: -90, y: -1 });
    fighters[1].damage = 0;
    // fighter 1 is being swarmed by 2; 3 is a free target at a similar distance
    expect(chooseTarget(fighters[0], world, -1, [0, 0, 0, 0])).toBe(3);
  });
  it('different CPUs do not all choose the same victim', () => {
    const { world, fighters } = ffa();
    // human (0) in the middle, the three CPUs spread around at equal distance from each other
    Object.assign(fighters[0], { x: 0, y: -1 });
    Object.assign(fighters[1], { x: -120, y: -1 });
    Object.assign(fighters[2], { x: 120, y: -1 });
    Object.assign(fighters[3], { x: 0, y: -100 });
    const picks = [1, 2, 3].map((i) => new Set<number>().add(chooseTarget(fighters[i], world, -1, new CpuController(2, i).bias ?? [0, 0, 0, 0])));
    const distinct = new Set(picks.map((s) => [...s][0]));
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });
});

describe('CPU matches', () => {
  function play(chars: string[], levels: CpuLevel[], stage = 'classic', ticks = 14400): { match: Match; world: World; hash: number } {
    const { world, fighters, match } = arena(chars, stage);
    const cpus = levels.map((l, i) => new CpuController(l, i + 1));
    const ins = fighters.map(() => makeInput());
    for (let t = 0; t < ticks && !match.over; t++) {
      fighters.forEach((f, i) => cpus[i].update(f, world, ins[i]));
      world.step(ins);
      match.step();
    }
    return { match, world, hash: world.hash() };
  }

  it('a Hard CPU beats an Easy CPU of the same character', () => {
    let wins = 0;
    for (const stage of ['classic', 'ring', 'reactor']) {
      const r = play(['brick', 'brick'], [3, 1], stage);
      expect(r.match.over).toBe(true);
      if (r.match.winner === 0) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(2);
  });

  it('every character can finish a match against every other (no stuck CPU)', () => {
    const ids = Object.keys(CHARACTERS);
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue;
        const r = play([a, b], [3, 3]);
        expect(r.match.over, `${a} v ${b}`).toBe(true);
      }
    }
  }, 120000);

  it('CPUs cross terrain: hop the Sunken Temple centre tier and jump gaps between Skyhold islands', () => {
    expect(play(['brick', 'vex'], [2, 2], 'temple', 30000).match.over, 'temple tier').toBe(true);
    expect(play(['brick', 'riptide'], [1, 1], 'skyhold', 30000).match.over, 'skyhold gap').toBe(true);
    expect(play(['vex', 'vex'], [1, 1], 'wreck', 36000).match.over, 'wreck quarterdeck').toBe(true);
    // ice platforms and avalanches on Frostfang, the raised stern and the moving skiff on the Stormrunner
    expect(play(['brick', 'rime'], [1, 1], 'frostfang', 36000).match.over, 'frostfang ice').toBe(true);
    expect(play(['havoc', 'riptide'], [1, 1], 'stormrunner', 36000).match.over, 'stormrunner stern').toBe(true);
    // crystal pillars everywhere: two Obelisks and two rivals, nobody gets walled in
    expect(play(['obelisk', 'brick', 'obelisk', 'halcyon'], [2, 2, 2, 2], 'temple', 36000).match.over, 'obelisk pillars').toBe(true);
  });

  it('four CPUs free-for-all stay sane (finite positions, someone wins)', () => {
    const r = play(['brick', 'vex', 'nova', 'gizmo'], [2, 2, 2, 2], 'reactor', 28800);
    for (const f of r.world.fighters) {
      expect(Number.isFinite(f.x)).toBe(true);
      expect(Number.isFinite(f.y)).toBe(true);
    }
    expect(r.match.over).toBe(true);
  });

  it('is deterministic: same seeds, same match', () => {
    const a = play(['nova', 'gizmo'], [3, 2], 'classic', 2400).hash;
    const b = play(['nova', 'gizmo'], [3, 2], 'classic', 2400).hash;
    expect(a).toBe(b);
  });
});
