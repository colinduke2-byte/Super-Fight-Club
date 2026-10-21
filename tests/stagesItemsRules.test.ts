import { describe, expect, it } from 'vitest';
import { CpuController } from '../src/ai/cpu';
import { CHARACTERS } from '../src/characters';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { BAT, batHit, DRONE, DRONE_PROJECTILE, heldItem, heldState, MINE, mineArmed, type ItemKind } from '../src/engine/items';
import { validateStage } from '../src/engine/stageValidation';
import { World } from '../src/engine/world';
import { GIANT_SIZE, modifierVariant, ruledCharacter, ruledStage } from '../src/game/modifiers';
import { sanitizeRules } from '../src/game/rulesets';
import { DEFAULT_RULES, newSession, tallySeries, seriesBeforeMatch, type MatchResult } from '../src/game/session';
import { MatchRunner } from '../src/game/runner';
import { STAGE_LIST, STAGES } from '../src/stages';
import { EXPRESS_ROUTE, stagePhase } from '../src/stages/express';
import { stageInForm } from '../src/stages/forms';
import { hitKillPercent, victims } from './tools/killProbe';
import { playMatch } from './tools/matchSim';

const raw = (p: { damage: number; base: number; scaling: number; angle: number; kbMult?: number }) => ({ damage: p.damage, base: p.base * (p.kbMult ?? 1), scaling: p.scaling * (p.kbMult ?? 1), angle: p.angle });

describe('new stages and stage forms', () => {
  it('Harbour Pier and Skyline Express are in Stage Select and valid, and every stage has valid BATTLEFIELD and PLAIN forms', () => {
    expect(STAGE_LIST.map((s) => s.id)).toEqual(expect.arrayContaining(['harbour', 'express']));
    for (const st of STAGE_LIST) {
      validateStage(st);
      const bf = stageInForm(st, 'battlefield');
      const pl = stageInForm(st, 'plain');
      validateStage(bf);
      validateStage(pl);
      expect(bf.platforms.length).toBe(4);
      expect(bf.platforms.slice(1).every((p) => p.kind === 'pass' && !p.move && !p.path)).toBe(true);
      expect(pl.platforms.length).toBe(1);
      expect(bf.hazards).toBeUndefined();
      expect(pl.hazards).toBeUndefined();
      // built from the stage's own main platform and look
      expect(pl.platforms[0].w).toBe(Math.max(...st.platforms.filter((p) => p.kind === 'solid').map((p) => p.w)));
      expect(pl.background).toBe(st.background);
      expect(stageInForm(st, 'battlefield')).toBe(bf); // cached
    }
  });

  it('the pier is a walk-off on the right: no ledge there, and walking out is a KO', () => {
    const world = new World(STAGES.harbour);
    expect(world.ledges.length).toBe(1);
    expect(world.ledges[0].side).toBe(-1);
    const f = new Fighter(0, CHARACTERS.brick);
    world.addFighter(f);
    f.spawn(300, -1, 1);
    let ko = false;
    world.listener = (t) => {
      if (t === 'ko') ko = true;
    };
    const run: FighterInput = { ...makeInput(), stickX: 1 };
    for (let i = 0; i < 400 && !ko; i++) world.step([run]);
    expect(ko).toBe(true);
  });

  it('CPUs on the walk-off pier rarely self-destruct', () => {
    const pairs = [['brick', 'vex'], ['nova', 'gizmo'], ['rime', 'havoc'], ['agni', 'halcyon']];
    let kos = 0;
    let sds = 0;
    pairs.forEach((p, i) => {
      const r = playMatch(p, 'harbour', 3, 900 + i, { stocks: 2, maxTicks: 60 * 150 });
      kos += r.kos.length;
      sds += r.kos.filter((k) => k.sd && k.dir === 'side' && k.killerIdx < 0).length;
    });
    expect(kos).toBeGreaterThan(4);
    expect(sds / Math.max(1, kos)).toBeLessThanOrEqual(0.15);
  });

  it('Skyline Express runs its three legs and moves its platforms between layouts', () => {
    const st = STAGES.express;
    expect(stagePhase(st, 0)?.name).toBe('OPEN LINE');
    expect(stagePhase(st, EXPRESS_ROUTE / 3 + 5)?.name).toBe('VIADUCT');
    expect(stagePhase(st, (2 * EXPRESS_ROUTE) / 3 + 5)?.name).toBe('STATION');
    expect(stagePhase(st, EXPRESS_ROUTE + 5)?.name).toBe('OPEN LINE');
    const world = new World(st);
    const at = (tick: number): { car: number; canopyX: number; podY: number } => {
      while (world.tick < tick) world.step([]);
      return { car: world.platforms[3].y, canopyX: world.platforms[4].x, podY: world.platforms[1].y };
    };
    const open = at(600);
    const via = at(EXPRESS_ROUTE / 3 + 600);
    const station = at((2 * EXPRESS_ROUTE) / 3 + 600);
    // the carriage alongside is only up during the viaduct; the canopy only over the stage at the station
    expect(open.car).toBeGreaterThan(st.blast.bottom);
    expect(via.car).toBeLessThan(0);
    expect(station.car).toBeGreaterThan(st.blast.bottom);
    expect(Math.abs(station.canopyX - -110)).toBeLessThan(1);
    expect(open.canopyX).toBeGreaterThan(st.blast.right);
    expect(via.podY).toBeLessThan(open.podY - 40);
    // pure function of the tick: deterministic
    const w2 = new World(st);
    for (let i = 0; i < 2000; i++) w2.step([]);
    const w3 = new World(st);
    for (let i = 0; i < 2000; i++) w3.step([]);
    expect(w2.platforms.map((p) => [p.x, p.y])).toEqual(w3.platforms.map((p) => [p.x, p.y]));
  });

  it('CPUs on the Express survive its legs (few self-destructs over full route cycles)', () => {
    let kos = 0;
    let sds = 0;
    [['brick', 'nova'], ['vex', 'rime']].forEach((p, i) => {
      const r = playMatch(p, 'express', 3, 300 + i, { stocks: 3, maxTicks: EXPRESS_ROUTE * 2 });
      kos += r.kos.length;
      sds += r.kos.filter((k) => k.sd).length;
    });
    expect(sds).toBeLessThanOrEqual(Math.max(1, Math.floor(kos * 0.25)));
  });
});

describe('new items', () => {
  it('kill percents (middleweight, centre, best recovery): only the charged bat KOs below 110%, at about 100%', () => {
    const v = victims();
    const charged = hitKillPercent(v.mid, raw(batHit(1)), 'classic', 0);
    expect(charged.best).toBeGreaterThanOrEqual(90);
    expect(charged.best).toBeLessThanOrEqual(105);
    for (const victim of [v.mid, v.light]) {
      expect(hitKillPercent(victim, raw(batHit(0)), 'classic', 0).best).toBeGreaterThanOrEqual(110);
      expect(hitKillPercent(victim, raw(batHit(0, false)), 'classic', 0).best).toBeGreaterThanOrEqual(110);
      expect(hitKillPercent(victim, raw(MINE), 'classic', 0).best).toBeGreaterThanOrEqual(110);
      expect(hitKillPercent(victim, raw(MINE), 'classic', 150).best).toBeGreaterThanOrEqual(110);
      expect(hitKillPercent(victim, { damage: 3, base: 16, scaling: 0.2, angle: 30 }, 'classic', 150).best).toBeGreaterThanOrEqual(110);
    }
  });

  function rig(gap = 40) {
    const world = new World(STAGES.classic);
    const fa = new Fighter(0, CHARACTERS.brick);
    const fb = new Fighter(1, CHARACTERS.vex);
    world.addFighter(fa);
    world.addFighter(fb);
    fa.spawn(-gap / 2, -1, 1);
    fb.spawn(gap / 2, -1, -1);
    const ins: FighterInput[] = [makeInput(), makeInput()];
    for (let i = 0; i < 125; i++) world.step(ins);
    fa.invuln = fb.invuln = 0;
    const run = (n: number, inp: FighterInput = makeInput()): void => {
      for (let i = 0; i < n; i++) {
        ins[0] = inp;
        world.step(ins);
      }
      ins[0] = makeInput();
    };
    const give = (kind: ItemKind): void => {
      const it = world.items[0];
      Object.assign(it, { active: true, kind, x: fa.x + 4, y: fa.y - 7, vx: 0, vy: 0, resting: true, thrown: false, deployed: false, age: 0, knockedBy: -1, knockGrace: 0, knockCd: 0, pickDelay: 0, spent: false, primed: false });
      run(1, { ...makeInput(), pressed: Button.Grab, held: Button.Grab });
      run(20);
    };
    return { world, fa, fb, run, give };
  }

  it('the Home-Run Bat: picked up, a held swing charges and hits much harder than a tap', () => {
    const tap = rig(44);
    tap.give('bat');
    expect(heldItem(tap.world, 0)).toBe('bat');
    expect(heldState(tap.world, 0).uses).toBe(BAT.swings);
    tap.run(1, { ...makeInput(), pressed: Button.Attack, held: Button.Attack });
    tap.run(70);
    const light = tap.fb.damage;
    expect(light).toBeGreaterThan(10);
    const hold = rig(44);
    hold.give('bat');
    hold.run(1, { ...makeInput(), pressed: Button.Attack, held: Button.Attack });
    hold.run(70, { ...makeInput(), held: Button.Attack });
    hold.run(40);
    expect(hold.fb.damage).toBeGreaterThan(light * 1.15);
    expect(heldState(hold.world, 0).uses).toBe(BAT.swings - 1);
  });

  it('the Proximity Mine: thrown, plants, arms, then trips on a rival (never its thrower)', () => {
    const t = rig(150);
    t.give('mine');
    expect(heldItem(t.world, 0)).toBe('mine');
    t.fb.x = -150; // out of the way (behind the thrower) while it arms
    t.fa.facing = 1;
    t.run(1, { ...makeInput(), pressed: Button.Attack, held: Button.Attack, stickX: 1 });
    t.run(30);
    const mine = t.world.items.find((i) => i.active && i.kind === 'mine')!;
    expect(mine.deployed).toBe(true);
    expect(mineArmed(mine)).toBe(false);
    t.run(MINE.arm + 2);
    expect(mineArmed(mine)).toBe(true);
    // the thrower can stand on it
    t.fa.x = mine.x;
    t.run(5);
    expect(mine.active).toBe(true);
    t.fa.x = -100;
    t.fb.x = mine.x;
    t.fb.invuln = 0;
    t.run(3);
    expect(mine.active).toBe(false);
    expect(t.fb.damage).toBeCloseTo(MINE.damage, 0);
  });

  it('the Assist Drone hovers by its owner, shoots at the rival and leaves after 8 s', () => {
    const t = rig(160);
    const it = t.world.items[0];
    Object.assign(it, { active: true, kind: 'drone', x: t.fa.x, y: t.fa.y - 7, vx: 0, vy: 0, resting: true, thrown: false, deployed: false, age: 0, knockedBy: -1, knockGrace: 0, knockCd: 0, pickDelay: 0, spent: false });
    t.run(2);
    expect(it.deployed).toBe(true);
    expect(it.owner).toBe(0);
    let shots = 0;
    for (let i = 0; i < DRONE.frames + 10; i++) {
      t.run(1);
      shots += t.world.projectiles.filter((p) => p.active && p.defId === DRONE_PROJECTILE && p.age === 1).length;
      t.fb.invuln = 0;
    }
    expect(shots).toBeGreaterThanOrEqual(5);
    expect(t.fb.damage).toBeGreaterThan(0);
    expect(it.active).toBe(false);
  });

  it('CPUs pick up and use the new items', () => {
    let used = 0;
    for (const kind of ['bat', 'mine'] as const) {
      const t = rig(60);
      const it = t.world.items[0];
      const cpu = new CpuController(3, 7);
      t.world.config.itemRate = 1;
      Object.assign(it, { active: true, kind, x: t.fb.x - 2, y: t.fb.y - 7, vx: 0, vy: 0, resting: true, thrown: false, deployed: false, age: 0, knockedBy: -1, knockGrace: 0, knockCd: 0, pickDelay: 0, spent: false });
      const ins: FighterInput[] = [makeInput(), makeInput()];
      let had = false;
      for (let i = 0; i < 900; i++) {
        cpu.update(t.fb, t.world, ins[1]);
        t.world.step(ins);
        if (heldItem(t.world, 1) === kind) had = true;
        if (had && heldItem(t.world, 1) !== kind) {
          used++;
          break;
        }
        if (had && kind === 'bat' && heldState(t.world, 1).uses < BAT.swings) {
          used++;
          break;
        }
      }
      expect(had, kind).toBe(true);
    }
    expect(used).toBe(2);
  });
});

describe('match rules', () => {
  it('modifiers change every fighter: GIANT x1.5 size and weight, TINY, LOW GRAVITY, TURBO, METAL', () => {
    const base = CHARACTERS.nova;
    const giant = modifierVariant(base, 'giant');
    expect(giant.stats.weight).toBe(Math.round(base.stats.weight * 1.5));
    const world = new World(STAGES.classic);
    const f = new Fighter(0, giant);
    world.addFighter(f);
    f.spawn(0, -1, 1);
    for (let i = 0; i < 5; i++) world.step([makeInput()]);
    expect(f.sizeMul).toBeCloseTo(GIANT_SIZE, 5);
    for (let i = 0; i < 60; i++) world.step([makeInput()]);
    expect(f.sizeMul).toBeCloseTo(GIANT_SIZE, 5); // never compounds
    expect(giant.moves.fsmash.hitboxes[0].w).toBeCloseTo(base.moves.fsmash.hitboxes[0].w * 1.5, 5);
    expect(modifierVariant(base, 'tiny').stats.weight).toBeLessThan(base.stats.weight);
    expect(modifierVariant(base, 'lowgrav').stats.gravity).toBeLessThan(base.stats.gravity);
    expect(modifierVariant(base, 'turbo').stats.runSpeed).toBeGreaterThan(base.stats.runSpeed);
    expect((modifierVariant(base, 'metal') as typeof base).stats.weight).toBeGreaterThan(base.stats.weight);
    const c = ruledCharacter('nova', { modifier: 'giant' }, 0);
    expect(typeof c).not.toBe('string');
  });

  it('damage ratio and launch rate reach the engine through the rules (replays rebuild them from the rules)', () => {
    const stage = ruledStage('classic', { ...DEFAULT_RULES, damageRatio: 2, launchRate: 1.5, stageForm: 'battlefield' });
    expect(stage.platforms.length).toBe(4);
    const hit = (st = STAGES.classic): { dmg: number; vx: number } => {
      const r = new MatchRunner({ stage: st, characters: ['brick', 'nova'], rules: { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 } });
      const v = r.fighters[1];
      v.invuln = 0;
      v.receiveHit({ damage: 10, base: 40, scaling: 0.5, angle: 0, direction: 1, hitlag: 0 }, r.world);
      return { dmg: v.damage, vx: v.vx };
    };
    const a = hit();
    const b = hit(stage);
    expect(b.dmg).toBeCloseTo(a.dmg * 2, 5);
    expect(b.vx).toBeGreaterThan(a.vx * 1.4);
  });

  it('saved rules keep the new fields (clamped), so presets and the last rules bring them back', () => {
    const r = sanitizeRules({ ...DEFAULT_RULES, stageForm: 'plain', damageRatio: 5, launchRate: 0.7, modifier: 'turbo', bestOf: 5 })!;
    expect(r.stageForm).toBe('plain');
    expect(r.damageRatio).toBe(2);
    expect(r.launchRate).toBeCloseTo(0.7);
    expect(r.modifier).toBe('turbo');
    expect(r.bestOf).toBe(5);
    expect(sanitizeRules({ ...DEFAULT_RULES, modifier: 'huge', bestOf: 4 })!.modifier).toBeUndefined();
  });

  it('a best-of-3 series tallies wins across rematches and starts over once decided', () => {
    const s = newSession();
    s.mode = 'versus';
    s.rules.bestOf = 3;
    s.players = [
      { index: 0, type: 'human', device: null, character: 'brick', cpuLevel: 1 },
      { index: 1, type: 'cpu', device: null, character: 'vex', cpuLevel: 1 },
    ];
    const result = (winner: number): MatchResult => ({ winner, winnerTeam: -1, durationSec: 60, players: [] });
    seriesBeforeMatch(s);
    s.lastResult = result(0);
    expect(tallySeries(s)!.wins).toEqual([1, 0]);
    expect(tallySeries(s)!.wins).toEqual([1, 0]); // counted once
    seriesBeforeMatch(s);
    s.lastResult = result(1);
    seriesBeforeMatch(s);
    s.lastResult = result(0);
    const ser = tallySeries(s)!;
    expect(ser.wins).toEqual([2, 1]);
    expect(ser.champion).toBe(0);
    expect(seriesBeforeMatch(s)!.wins).toEqual([0, 0]);
  });
});
