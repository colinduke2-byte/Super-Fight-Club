import { describe, expect, it } from 'vitest';
import { BossController } from '../src/ai/boss';
import { CpuController } from '../src/ai/cpu';
import { CHARACTERS } from '../src/characters';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { Match, type MatchConfig } from '../src/engine/match';
import { World } from '../src/engine/world';
import { DummyController, type Controller } from '../src/game/controllers';
import { LaunchContest } from '../src/game/launch';
import { MatchRunner } from '../src/game/runner';
import { STAGES } from '../src/stages';

interface Case { name: string; stage: string; chars: string[]; items: 0 | 1 | 2; teams?: boolean; cfg: MatchConfig; stocks?: (number | undefined)[]; boss?: number; launch?: boolean; targets?: boolean; ticks: number; level?: 1 | 2 | 3; seedBase?: number }
const CASES: Case[] = [
  { name: 'storm-4-items2', stage: 'storm', chars: ['halcyon', 'brick', 'vex', 'nova'], items: 2, cfg: { mode: 'stock', stocks: 3, timeLimitSec: 180, respawnDelay: 70 }, ticks: 5000 },
  { name: 'reactor-teams-items1', stage: 'reactor', chars: ['agni', 'riptide', 'gizmo', 'obelisk'], items: 1, teams: true, cfg: { mode: 'stock', stocks: 2, timeLimitSec: 180, respawnDelay: 70 }, ticks: 5000 },
  { name: 'frostfang-time-items2', stage: 'frostfang', chars: ['rime', 'havoc', 'gizmo', 'obelisk'], items: 2, cfg: { mode: 'time', stocks: 3, timeLimitSec: 30, respawnDelay: 70 }, ticks: 6000 },
  { name: 'temple-stamina', stage: 'temple', chars: ['brick', 'nova', 'vex'], items: 2, cfg: { mode: 'stamina', stocks: 2, timeLimitSec: 180, respawnDelay: 70, staminaHp: 80 }, ticks: 5000 },
  { name: 'classic-boss-handicap', stage: 'classic', chars: ['halcyon', 'havoc'], items: 1, boss: 1, stocks: [2, 4], cfg: { mode: 'stock', stocks: 3, timeLimitSec: 180, respawnDelay: 70 }, ticks: 5000 },
  { name: 'launch', stage: 'launch', chars: ['brick', 'vex'], items: 0, launch: true, cfg: { mode: 'training', stocks: 3, timeLimitSec: 0, respawnDelay: 70 }, ticks: 3000 },
  { name: 'targets', stage: 'targets', chars: ['gizmo'], items: 0, targets: true, cfg: { mode: 'stock', stocks: 3, timeLimitSec: 180, respawnDelay: 70 }, ticks: 3000 },
  { name: 'soak-reactor', stage: 'reactor', chars: ['halcyon', 'brick', 'vex', 'nova'], items: 0, seedBase: 10, cfg: { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 }, ticks: 3000 },
  { name: 'soak-stormrunner', stage: 'stormrunner', chars: ['rime', 'havoc', 'gizmo', 'obelisk'], items: 0, seedBase: 20, cfg: { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 }, ticks: 3000 },
  { name: 'skyhold-cpu1-items2', stage: 'skyhold', chars: ['agni', 'halcyon', 'riptide'], items: 2, level: 1, cfg: { mode: 'stock', stocks: 2, timeLimitSec: 0, respawnDelay: 70 }, ticks: 4000 },
];

/**
 * The match logic MatchScene used to hand-roll before MatchRunner existed (spawn / respawn placement, KO -> stock, per-slot
 * stocks, teams, items, Launch Contest and Target Smash endings). The runner must reproduce it tick for tick.
 */
function reference(c: Case): string {
  const stage = STAGES[c.stage];
  const world = new World(stage);
  const fighters = c.chars.map((ch, i) => new Fighter(i, CHARACTERS[ch]));
  const respawn = (i: number, above = false): void => {
    const sp = stage.spawns[i % stage.spawns.length];
    fighters[i].spawn(sp.x, sp.y - (above ? 130 : 1), sp.x <= 0 ? 1 : -1);
  };
  let match!: Match;
  const ctrls = controllers(c, () => match);
  const inputs = c.chars.map(() => makeInput());
  const elimAt = c.chars.map(() => -1);
  for (const f of fighters) {
    world.addFighter(f);
    respawn(f.id);
  }
  if (c.teams && fighters.length === 4) fighters.forEach((f, i) => (f.team = i < 2 ? 0 : 1));
  const isTargets = !!c.targets && world.targets.length > 0;
  let targetTicks = -1;
  world.config.itemRate = c.items;
  const launch = c.launch ? new LaunchContest(fighters[1]) : null;
  if (launch) fighters.forEach((f) => (f.invuln = 0));
  let launchDamage = 0;
  match = new Match(world, c.cfg);
  match.onRespawn = (f) => respawn(f.id, true);
  c.stocks?.forEach((s, i) => {
    if (s) match.scores[i].stocks = s;
  });
  world.listener = (type, f, _x, _y, _m, extra) => {
    if (type === 'ko') match.onKo(f, extra);
  };
  let endTimer = -1;
  for (let t = 0; t < c.ticks; t++) {
    for (let i = 0; i < fighters.length; i++) ctrls[i].update(fighters[i], world, inputs[i]);
    world.step(inputs);
    match.step();
    if (launch && !match.over) {
      const was = launch.phase;
      launch.step();
      if (was !== 'flying' && launch.phase === 'flying') launchDamage = fighters[1].damage;
      if (launch.over) {
        match.over = true;
        match.winner = 0;
      }
    }
    match.scores.forEach((s, i) => {
      if (s.eliminated && elimAt[i] < 0) elimAt[i] = world.tick;
    });
    if (isTargets && !match.over && world.targets.every((tt) => !tt.alive)) {
      match.over = true;
      match.winner = 0;
      targetTicks = world.tick;
    }
    if (match.over) {
      if (endTimer < 0) endTimer = 150;
      else if (--endTimer === 0) break;
    }
  }
  return summary(world, match, elimAt, targetTicks, launch?.distance, launchDamage);
}

function summary(world: World, m: Match, elimAt: number[], targetTicks: number, dist: number | undefined, launchDamage: number): string {
  return JSON.stringify({ hash: world.hash(), tick: world.tick, winner: m.winner, winnerTeam: m.winnerTeam, sd: m.suddenDeath, scores: m.scores, elimAt, targetTicks, dist, launchDamage, combo: world.bestCombo, dealt: world.damageDealt });
}

function controllers(c: Case, match: () => Match): Controller[] {
  return c.chars.map((_, i) => (c.boss === i ? new BossController(() => match().scores[i].stocks, 1) : c.launch && i === 1 ? new DummyController() : new CpuController(c.level ?? 3, (c.seedBase ?? 0) + i + 1)));
}

/** Plays a case through MatchRunner the way MatchScene does (CPU inputs gathered only on ticks that step, results 150 ticks after the end). */
function runCase(c: Case): string {
  const r = new MatchRunner({ stage: STAGES[c.stage], characters: c.chars, rules: c.cfg, stocks: c.stocks, teams: c.teams, itemRate: c.items, launch: c.launch, targets: c.targets, smashFlick: true });
  const ctrls = controllers(c, () => r.match);
  const inputs = c.chars.map(() => makeInput());
  let endTimer = -1;
  for (let t = 0; t < c.ticks; t++) {
    r.fighters.forEach((f, i) => ctrls[i].update(f, r.world, inputs[i]));
    r.step(inputs);
    if (r.over) {
      if (endTimer < 0) endTimer = 150;
      else if (--endTimer === 0) break;
    }
  }
  return summary(r.world, r.match, r.elimAt, r.targetTicks, r.launch?.distance, r.launchDamage);
}

describe('MatchRunner', () => {
  for (const c of CASES) {
    it(`${c.name}: plays exactly like the hand-rolled match loop, and replays identically`, () => {
      const a = runCase(c);
      expect(a).toBe(reference(c));
      expect(runCase(c)).toBe(a);
    }, 60_000);
  }

  it('applies KOs without any subscriber, and subscribers see the rules already applied', () => {
    const r = new MatchRunner({ stage: STAGES.classic, characters: ['brick', 'vex'], rules: { mode: 'stock', stocks: 2, timeLimitSec: 0, respawnDelay: 70 } });
    let stocksSeen = -1;
    r.subscribe((type, f) => {
      if (type === 'ko') stocksSeen = r.match.scores[f.id].stocks;
    });
    const ins = r.fighters.map(() => makeInput());
    r.fighters[1].y = r.world.blast.bottom + 50;
    for (let t = 0; t < 5 && r.fighters[1].state !== 'ko'; t++) r.step(ins);
    expect(r.fighters[1].state).toBe('ko');
    expect(r.match.scores[1].stocks).toBe(1);
    expect(stocksSeen).toBe(1);
    // the respawn puts it back on its spawn point, dropping in from above
    for (let t = 0; t < 80; t++) r.step(ins);
    const sp = STAGES.classic.spawns[1];
    expect(r.fighters[1].state).not.toBe('ko');
    expect(r.fighters[1].x).toBeCloseTo(sp.x, 0);
  });

  it('per-slot stocks, teams and the item rate come from the setup', () => {
    const r = new MatchRunner({ stage: STAGES.reactor, characters: ['brick', 'vex', 'nova', 'agni'], rules: { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 }, stocks: [undefined, 5], teams: true, itemRate: 2 });
    expect(r.match.scores.map((s) => s.stocks)).toEqual([3, 5, 3, 3]);
    expect(r.fighters.map((f) => f.team)).toEqual([0, 0, 1, 1]);
    expect(r.world.config.itemRate).toBe(2);
  });
});
