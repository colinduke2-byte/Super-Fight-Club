import { beforeEach, describe, expect, it } from 'vitest';
import { brick } from '../src/characters/brick';
import { Button, makeInput, type FighterInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { ITEM_KINDS, stepItems } from '../src/engine/items';
import { World } from '../src/engine/world';
import { Lobby, skillName } from '../src/game/lobby';
import { lastFighter, quickMatch, rememberFighter } from '../src/game/quick';
import { applyRules, loadSavedRules, PRESETS, presetName, saveCustomRules, saveLastRules, sanitizeRules } from '../src/game/rulesets';
import { MatchRunner } from '../src/game/runner';
import { DEFAULT_RULES, itemMask, runnerExtras, session, teamsFor, type MatchRules } from '../src/game/session';
import { STAGES } from '../src/stages';
import { classicStage } from '../src/stages/classic';

/** A tiny in-memory localStorage for the save / load tests. */
function fakeStorage(): void {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  };
}

const inp = (o: Partial<FighterInput> = {}): FighterInput => ({ ...makeInput(), ...o });

describe('lobby: CPU cards, RANDOM and handicaps', () => {
  const pal = (ci: number): number => (ci === 0 ? 4 : 2);

  it('a human moves onto a CPU card and sets fighter, outfit, level 1-9, team and handicap', () => {
    const l = new Lobby(3, 5, { random: true, palettes: pal });
    l.teams = true;
    l.join('kb1');
    l.slots[2].kind = 'cpu';
    // TAB: the cursor goes to the empty P2 card first (CPU OFF), then P3, then home
    expect(l.focusNext('kb1')).toBe(1);
    expect(l.rowOf('kb1')).toBe('cpu');
    l.adjust('kb1', 1); // CPU ON
    expect(l.slots[1].kind).toBe('cpu');
    expect(l.isRandom(l.slots[1])).toBe(true); // a new CPU shows RANDOM, not a made-up fighter
    expect(l.rows(1)).toEqual(['cpu', 'fighter', 'outfit', 'level', 'team', 'damage', 'stock']);
    l.moveRow('kb1', 1);
    l.adjust('kb1', 1); // RANDOM -> wraps to fighter 0
    expect(l.slots[1].character).toBe(0);
    l.moveRow('kb1', 1);
    l.adjust('kb1', 1);
    l.adjust('kb1', 1);
    expect(l.slots[1].palette).toBe(2);
    l.moveRow('kb1', 1);
    for (let k = 0; k < 10; k++) l.adjust('kb1', 1);
    expect(l.slots[1].skill).toBe(9);
    expect(l.slots[1].cpuLevel).toBe(3);
    l.adjust('kb1', -1);
    expect(l.slots[1].skill).toBe(8);
    expect(skillName(5)).toBe('LV 5 NORMAL');
    l.moveRow('kb1', 1);
    l.adjust('kb1', 1);
    expect(l.slots[1].team).toBe(2); // P2 of three starts on team 1 (red)
    l.moveRow('kb1', 1);
    l.adjust('kb1', 1);
    l.adjust('kb1', 1);
    expect(l.slots[1].damage).toBe(20);
    // the human's own cursor is unaffected
    expect(l.slots[0].character).toBe(0);
    expect(l.focusNext('kb1')).toBe(2);
    expect(l.focusNext('kb1')).toBe(0); // home
    expect(l.rowOf('kb1')).toBeNull(); // picking again
  });

  it('a locked player sets their own team and handicap', () => {
    const l = new Lobby(2, 5, { random: true });
    l.join('kb1');
    l.confirm('kb1');
    expect(l.rows(0)).toEqual(['damage', 'stock']);
    l.adjust('kb1', 1);
    expect(l.slots[0].damage).toBe(10);
    l.moveRow('kb1', 1);
    l.adjust('kb1', -1);
    expect(l.slots[0].stock).toBe(-1);
    l.stockRule = false;
    expect(l.rows(0)).toEqual(['damage']);
  });

  it('the roster has a RANDOM tile; RANDOM rolls at the end, CPUs avoid picked fighters, fixed picks are kept', () => {
    const l = new Lobby(3, 3, { random: true, palettes: () => 3 });
    l.join('kb1');
    l.move('kb1', -1);
    expect(l.isRandom(l.slots[0])).toBe(true);
    l.outfit('kb1', 1);
    expect(l.slots[0].palette).toBe(-1); // random outfit
    l.join('kb2');
    l.slots[1].character = 1;
    l.fillWithCpu();
    let seq = 0;
    const rand = (): number => [0.0, 0.99, 0.5, 0.2][seq++ % 4];
    const out = l.resolve(rand);
    expect(out[1]).toMatchObject({ character: 1, random: false, randomOutfit: false });
    expect(out[0].random).toBe(true);
    expect(out[0].randomOutfit).toBe(true);
    // the CPU's random pick avoids fighter 1 (taken by P2) and P1's roll
    expect(out[2].character).not.toBe(1);
    expect(out[2].character).not.toBe(out[0].character);
  });

  it('restores the last lineup (locked humans, CPUs with their level, RANDOM shows as RANDOM)', () => {
    const l = new Lobby(3, 5, { random: true, palettes: () => 3 });
    l.restore([{ kind: 'human', deviceId: 'kb1' }, { kind: 'cpu' }, { kind: 'human', deviceId: null }], [
      { character: 2, palette: 1 },
      { character: 4, palette: 0, random: true, skill: 7, team: 1, damage: 30 },
      { character: 1, palette: 0 },
    ]);
    expect(l.slots[0]).toMatchObject({ kind: 'human', deviceId: 'kb1', locked: true, character: 2, palette: 1 });
    expect(l.slots[1]).toMatchObject({ kind: 'cpu', skill: 7, cpuLevel: 3, team: 1, damage: 30 });
    expect(l.isRandom(l.slots[1])).toBe(true);
    expect(l.slots[2].kind).toBe('empty'); // that controller is gone
    expect(l.ready).toBe(true);
  });

  it('warns when everyone is on one team', () => {
    const l = new Lobby(2, 4, { random: true });
    l.teams = true;
    l.join('kb1');
    l.fillWithCpu();
    l.slots[1].team = l.slots[0].team;
    expect(l.warning(0)).toMatch(/ONE TEAM/);
  });
});

describe('rules -> runner', () => {
  it('teamsFor: default layouts and a lone team is no team battle', () => {
    const r: MatchRules = { ...DEFAULT_RULES, teams: true };
    expect(teamsFor(r, 4)).toEqual([0, 0, 1, 1]);
    expect(teamsFor(r, 3)).toEqual([0, 1, 1]);
    expect(teamsFor({ ...r, teamOf: [2, 2, 2] }, 3)).toBeNull();
    expect(teamsFor({ ...r, teams: false }, 4)).toBeNull();
  });

  it('runnerExtras is empty for the old rules (nothing changes for existing matches / replays)', () => {
    expect(runnerExtras({ ...DEFAULT_RULES })).toEqual({});
    const x = runnerExtras({ ...DEFAULT_RULES, teams: true, teamOf: [0, 0, 1], teamAttack: true, suddenDeath: false, stockTimeSec: 120, itemsOff: ['crate', 'bomb'], handicap: [{ damage: 40, stock: 1 }, { damage: 0, stock: 0 }] }, 3);
    expect(x).toEqual({ teamOf: [0, 0, 1], teamAttack: true, suddenDeath: false, stockTimeSec: 120, itemsOff: itemMask(['crate', 'bomb']), startDamage: [40, 0], stockBonus: [1, 0] });
  });

  it('flexible teams (2 v 1), handicaps and team attack reach the world', () => {
    const run = new MatchRunner({ stage: STAGES.classic, characters: ['brick', 'vex', 'nova'], rules: { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 }, teams: true, teamOf: [0, 0, 1], teamAttack: true, startDamage: [0, 50, 0], stockBonus: [2, 0, -5] });
    expect(run.fighters.map((f) => f.team)).toEqual([0, 0, 1]);
    expect(run.fighters[1].damage).toBe(50);
    expect(run.match.scores.map((s) => s.stocks)).toEqual([5, 3, 1]);
    expect(run.world.config.teamAttack).toBe(true);
    // a team layout naming one team falls back to no teams (3 players)
    const solo = new MatchRunner({ stage: STAGES.classic, characters: ['brick', 'vex', 'nova'], rules: { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 }, teams: true, teamOf: [1, 1, 1] });
    expect(solo.fighters.map((f) => f.team)).toEqual([-1, -1, -1]);
  });

  function jabTeammate(teamAttack: boolean): number {
    const world = new World(classicStage);
    world.config.teamAttack = teamAttack;
    const fs = [0, 1].map((i) => new Fighter(i, brick));
    fs.forEach((f, i) => {
      world.addFighter(f);
      f.spawn(-60 + i * 40, -1, 1);
      f.team = 0;
    });
    const ins = fs.map(() => inp());
    for (let i = 0; i < 130; i++) world.step(ins);
    fs.forEach((f) => (f.invuln = 0));
    fs[0].x = 0;
    fs[1].x = 14;
    ins[0] = inp({ pressed: Button.Attack, held: Button.Attack });
    world.step(ins);
    ins[0] = inp();
    for (let i = 0; i < 30; i++) world.step(ins);
    return fs[1].damage;
  }

  it('team attack: a teammate is hit only when it is on', () => {
    expect(jabTeammate(false)).toBe(0);
    expect(jabTeammate(true)).toBeGreaterThan(0);
  });

  it('stock + time limit: at the bell most stocks wins; sudden death off makes a timed tie a draw', () => {
    const run = new MatchRunner({ stage: STAGES.classic, characters: ['brick', 'vex'], rules: { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 }, stockTimeSec: 2 });
    run.match.scores[1].stocks = 2;
    const idle = [makeInput(), makeInput()];
    for (let t = 0; t < 200 && !run.over; t++) run.step(idle);
    expect(run.over).toBe(true);
    expect(run.match.winner).toBe(0);
    expect(run.stockClock).toBe(0);

    const tie = new MatchRunner({ stage: STAGES.classic, characters: ['brick', 'vex'], rules: { mode: 'time', stocks: 3, timeLimitSec: 1, respawnDelay: 70 }, suddenDeath: false });
    let sd = false;
    tie.onSuddenDeath(() => (sd = true));
    for (let t = 0; t < 120 && !tie.over; t++) tie.step(idle);
    expect(tie.over).toBe(true);
    expect(tie.match.winner).toBe(-1);
    expect(sd).toBe(false);
  });

  it('switched-off items never drop', () => {
    const world = new World(classicStage);
    const f = new Fighter(0, brick);
    world.addFighter(f);
    f.spawn(0, -1, 1);
    world.config.itemRate = 2;
    world.config.itemsOff = itemMask(ITEM_KINDS.filter((k) => k !== 'heal'));
    const seen = new Set<string>();
    for (let t = 0; t < 6000; t++) {
      world.tick++;
      stepItems(world);
      for (const it of world.items) if (it.active) seen.add(it.kind);
    }
    expect([...seen]).toEqual(['heal']);
    // everything off: nothing at all
    const w2 = new World(classicStage);
    w2.addFighter(new Fighter(0, brick));
    w2.config.itemRate = 2;
    w2.config.itemsOff = itemMask(ITEM_KINDS);
    for (let t = 0; t < 3000; t++) {
      w2.tick++;
      stepItems(w2);
    }
    expect(w2.items.some((it) => it.active)).toBe(false);
  });
});

describe('saved rules, presets and Quick Match', () => {
  beforeEach(() => fakeStorage());

  it('the last rules and custom slots survive a reload; broken data falls back to the defaults', () => {
    const r: MatchRules = { ...DEFAULT_RULES, mode: 'time', timeSec: 240, items: 2, itemsOff: ['bomb'], suddenDeath: false, handicap: [{ damage: 10, stock: 0 }] };
    saveLastRules(r, 3);
    saveCustomRules(1, { ...DEFAULT_RULES, stocks: 5 });
    const s = loadSavedRules();
    expect(s.playerCount).toBe(3);
    expect(s.last).toMatchObject({ mode: 'time', timeSec: 240, items: 2, itemsOff: ['bomb'], suddenDeath: false });
    expect(s.last?.handicap).toBeUndefined();
    expect(s.custom[1]?.stocks).toBe(5);
    expect(presetName({ ...DEFAULT_RULES, stocks: 5 }, s)).toBe('CUSTOM 2');
    localStorage.setItem('sfc.rules.v1', '{nope');
    expect(loadSavedRules().last).toBeNull();
    expect(sanitizeRules({ mode: 'weird', stocks: -4, items: 9 })).toMatchObject({ mode: 'stock', stocks: 1, items: 2 });
  });

  it('presets: Competitive and Party; applying keeps the team layout', () => {
    const comp = PRESETS.find((p) => p.id === 'competitive')!.rules;
    expect(comp).toMatchObject({ mode: 'stock', stocks: 3, stockTimeSec: 420, items: 0, hazards: false });
    expect(PRESETS.find((p) => p.id === 'party')!.rules).toMatchObject({ mode: 'time', timeSec: 120, items: 2 });
    const into: MatchRules = { ...DEFAULT_RULES, teams: true, teamOf: [0, 0, 0, 1] };
    applyRules(into, comp);
    expect(into).toMatchObject({ teams: true, teamOf: [0, 0, 0, 1], hazards: false, stockTimeSec: 420 });
    expect(presetName(into, loadSavedRules())).toBe('COMPETITIVE');
  });

  it('quickMatch: the last fighter against a different random CPU on a pool stage', () => {
    rememberFighter('nova', 2);
    expect(lastFighter()).toEqual({ character: 'nova', palette: 2 });
    saveLastRules({ ...DEFAULT_RULES, stagePool: ['temple'], teams: true }, 4);
    const players = quickMatch(null, () => 0.3);
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({ type: 'human', character: 'nova', palette: 2 });
    expect(players[1].type).toBe('cpu');
    expect(players[1].character).not.toBe('nova');
    expect(session.stage).toBe('temple');
    expect(session.rules.teams).toBe(false);
    expect(session.playerCount).toBe(2);
    expect(session.mode).toBe('versus');
  });
});
