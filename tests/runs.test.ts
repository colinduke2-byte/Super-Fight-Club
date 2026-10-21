import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHARACTER_LIST, CORE_CHARACTER_LIST, characterById } from '../src/characters';
import {
  BOSS_BATTLE_STOCKS,
  ENDLESS_CARRY,
  ENDLESS_CARRY_CAP,
  ENDLESS_DUO_EVERY,
  GAUNTLET_HEAL,
  GAUNTLET_STOCKS,
  SKILL_CURVES,
  applyLadderResult,
  buildLadder,
  canPickDifficulty,
  continueLadder,
  currentFight,
  endlessSkill,
  foesFor,
  generatedRoute,
  humanSideWon,
  ladderOutcomeFor,
  planRun,
  plannedRun,
  restartRun,
  rulesForSlots,
  setLadderDifficulty,
  slotsForFight,
  type ArcadeDifficulty,
} from '../src/game/ladder';
import { canBeMetal, METAL_SIZE, METAL_WEIGHT, metalVariant } from '../src/game/metal';
import { HOME_STAGE, RIVAL, ROUTES, ROUTE_SHAPE } from '../src/game/routes';
import { loadRunRecords, RUN_RECORDS_KEY } from '../src/game/runRecords';
import { endingCards, fightCard, gameOverCard, introCards, LINE_WIDTH, OVERSEER_STORY } from '../src/game/story';
import { runnerExtras, type MatchResult, type PlayerResult, type PlayerSlot } from '../src/game/session';
import { STAGES } from '../src/stages';
import { invalidateRecordsCache } from '../src/game/records';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  invalidateRecordsCache();
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
  invalidateRecordsCache();
  planRun(null);
});

const human: PlayerSlot = { index: 0, type: 'human', device: null, character: 'agni', cpuLevel: 1 };
const mate: PlayerSlot = { index: 1, type: 'human', device: null, character: 'rime', cpuLevel: 1 };
const pl = (index: number, character: string, o: Partial<PlayerResult> = {}): PlayerResult => ({ index, character, type: index === 0 ? 'human' : 'cpu', stocks: 1, kos: 1, falls: 0, damageDealt: 0, eliminated: false, placement: index + 1, team: -1, ...o });
const win = (o: Partial<PlayerResult> = {}): MatchResult => ({ winner: 0, winnerTeam: -1, durationSec: 60, players: [pl(0, 'agni', o), pl(1, 'brick', { kos: 0 })] });
const lose = (): MatchResult => ({ winner: 1, winnerTeam: -1, durationSec: 40, players: [pl(0, 'agni', { kos: 1 }), pl(1, 'brick')] });
const seq = (...v: number[]): (() => number) => {
  let i = 0;
  return () => v[i++ % v.length];
};

describe('rival routes', () => {
  it('every roster fighter has a hand-written route of eight fights in the standard shape', () => {
    for (const c of CHARACTER_LIST) {
      const r = ROUTES[c.id];
      expect(r, c.id).toBeTruthy();
      expect(r.map((s) => s.kind)).toEqual(ROUTE_SHAPE);
      for (const st of r) {
        expect(STAGES[st.stage], `${c.id} ${st.title}`).toBeTruthy();
        expect(st.reason.length).toBeGreaterThan(10);
        for (const f of st.foes) {
          expect(characterById(f), f).toBeTruthy();
          expect(f).not.toBe(c.id);
        }
        if (st.ally) expect(st.ally).not.toBe(c.id);
      }
    }
  });

  it('the rival fight is against the fighter\'s rival on the rival\'s home stage', () => {
    for (const c of CHARACTER_LIST) {
      const rival = RIVAL[c.id];
      // rivals pair up (the playable Overseer's rival, Gizmo, keeps Obelisk as his own)
      if (c.id !== 'overseer-versus') expect(RIVAL[rival]).toBe(c.id);
      const st = ROUTES[c.id].find((s) => s.kind === 'rival')!;
      expect(st.foes).toEqual([rival]);
      expect(st.stage).toBe(HOME_STAGE[rival]);
    }
    expect(HOME_STAGE).toMatchObject({ obelisk: 'hollow', rime: 'frostfang', havoc: 'stormrunner', riptide: 'wreck' });
  });

  it('special events: a team fight with an ally, a metal fight and a brawl; the run meets every rival', () => {
    for (const c of CHARACTER_LIST) {
      const l = buildLadder(c.id, seq(0.3, 0.7), 2, { kind: 'arcade' });
      expect(l.fights).toHaveLength(9);
      const team = l.fights.find((f) => f.kind === 'team')!;
      expect(team.opponents).toHaveLength(2);
      expect(team.ally?.character).toBeTruthy();
      const metal = l.fights.find((f) => f.kind === 'metal')!;
      expect(metal.opponents[0].metal).toBe(true);
      expect(canBeMetal(metal.opponents[0].character)).toBe(true);
      expect(l.fights.find((f) => f.kind === 'brawl')!.opponents.length).toBe(3);
      expect(l.fights.find((f) => f.rival)!.stage).toBe(HOME_STAGE[RIVAL[c.id]]);
      const met = new Set(l.fights.flatMap((f) => f.opponents.map((o) => o.character)));
      // the boss fight is the Overseer itself: that run meets the playable one too
      if (met.has('overseer')) met.add('overseer-versus');
      for (const o of CHARACTER_LIST) if (o.id !== c.id) expect(met.has(o.id), `${c.id} meets ${o.id}`).toBe(true);
    }
  });

  it('every fight card and ending card fits under the art', () => {
    for (const c of CHARACTER_LIST) {
      const l = buildLadder(c.id, seq(0.4), 2, { kind: 'arcade' });
      for (const card of [...l.fights.map((f) => fightCard(l, f)), ...endingCards(l), gameOverCard(l)]) {
        expect(card.lines.length, card.title).toBeLessThanOrEqual(4);
        for (const line of card.lines) expect(line.length).toBeLessThanOrEqual(LINE_WIDTH);
      }
    }
  });

  it('a fighter without a route gets a generated one in the same shape', () => {
    const r = generatedRoute('agni', seq(0.2, 0.9, 0.5));
    expect(r.map((s) => s.kind)).toEqual(ROUTE_SHAPE);
    expect(r.find((s) => s.kind === 'rival')!.foes).toEqual(['riptide']);
    expect(r.find((s) => s.kind === 'rival')!.stage).toBe('wreck');
  });

  it('difficulty curves still drive every fight (the ally and backups a step below the lead)', () => {
    for (const d of [1, 2, 3, 4] as ArcadeDifficulty[]) {
      const l = buildLadder('agni', seq(0.5), d, { kind: 'arcade' });
      l.fights.slice(0, 8).forEach((f, i) => {
        expect(f.opponents[0].skill).toBe(SKILL_CURVES[d][i]);
        if (f.ally) expect(f.ally.skill).toBe(Math.max(1, SKILL_CURVES[d][i] - 1));
      });
    }
  });

  it('team fights: the ally fights on your team, and the rules carry the teams', () => {
    const l = buildLadder('agni', seq(0.5), 2, { kind: 'arcade' });
    l.index = l.fights.findIndex((f) => f.kind === 'team');
    const slots = slotsForFight(l, human);
    expect(slots.map((s) => s.team)).toEqual([0, 1, 1, 0]);
    expect(slots[3].character).toBe('halcyon');
    const rules = rulesForSlots(slots);
    expect(rules.teams).toBe(true);
    expect(runnerExtras(rules, slots.length).teamOf).toEqual([0, 1, 1, 0]);
    // the team (not player 1 alone) wins it
    const r: MatchResult = { winner: 3, winnerTeam: 0, durationSec: 50, players: [pl(0, 'agni', { team: 0, eliminated: true }), pl(1, 'rime', { team: 1 }), pl(2, 'nova', { team: 1 }), pl(3, 'halcyon', { team: 0 })] };
    expect(humanSideWon(r)).toBe(true);
    expect(applyLadderResult(l, r)).toBe('next');
  });

  it('the metal fight: a heavier, larger rival, rebuilt from the rules', () => {
    const l = buildLadder('agni', seq(0.5), 2, { kind: 'arcade' });
    l.index = l.fights.findIndex((f) => f.kind === 'metal');
    const slots = slotsForFight(l, human);
    expect(slots[1].metal).toBe(true);
    const rules = rulesForSlots(slots);
    expect(rules.metal).toEqual([1]);
    const m = metalVariant('obelisk')!;
    const base = characterById('obelisk')!;
    expect(m.id).toBe('obelisk');
    expect(m.stats.weight).toBe(Math.round(base.stats.weight * METAL_WEIGHT));
    expect(m.transform?.scale).toBe(METAL_SIZE);
    expect(canBeMetal('gizmo')).toBe(false); // the mech suit is its own look
  });

  it('continue as another fighter: a rival who is the new fighter swaps places with the old one', () => {
    const l = buildLadder('agni', seq(0.5), 3, { kind: 'arcade' });
    applyLadderResult(l, win());
    while (applyLadderResult(l, lose()) !== 'gameover');
    expect(continueLadder(l, { player: 'riptide' })).toBe(true);
    const rival = l.fights.find((f) => f.rival)!;
    expect(rival.opponents[0].character).toBe('agni');
    expect(l.fights[3].opponents[0].character).toBe('riptide'); // the mirror mirrors the new fighter
    for (const f of l.fights.slice(l.index)) for (const o of f.opponents) if (!f.mirror) expect(o.character).not.toBe('riptide');
    // retry on easier still works on the route
    expect(continueLadder(l, { easier: true })).toBe(true);
    expect(currentFight(l).opponents[0].skill).toBe(SKILL_CURVES[2][1]);
  });
});

describe('co-op arcade', () => {
  it('two humans on team 0; duels bring a second rival, the boss an extra stock', () => {
    planRun({ kind: 'arcade', coop: true });
    expect(plannedRun()).toEqual({ kind: 'arcade', coop: true });
    const l = buildLadder('agni', seq(0.5), 2);
    expect(plannedRun().kind).toBe('arcade'); // the plan is used once
    expect(l.coop).toBe(true);
    l.partner = 'rime';
    const s = slotsForFight(l, human, mate);
    expect(s.map((p) => p.type)).toEqual(['human', 'human', 'cpu', 'cpu']);
    expect(s.map((p) => p.team)).toEqual([0, 0, 1, 1]);
    // the team fight drops the CPU ally for the partner
    l.index = 2;
    const t = slotsForFight(l, human, mate);
    expect(t).toHaveLength(4);
    expect(t.filter((p) => p.type === 'human')).toHaveLength(2);
    // the brawl keeps two rivals (four fighters at most)
    l.index = 7;
    expect(slotsForFight(l, human, mate)).toHaveLength(4);
    l.index = 8;
    const b = slotsForFight(l, human, mate);
    expect(b[2].boss).toBe(true);
    expect(b[2].stocks).toBe(l.fights[8].opponents[0].stocks + 1);
    // the mirror match brings a mirror of each human
    l.index = 3;
    expect(foesFor(l).map((o) => o.character)).toEqual(['agni', 'rime']);
  });

  it('without a second human the run plays solo', () => {
    const l = buildLadder('agni', seq(0.5), 2, { kind: 'arcade', coop: true });
    l.partner = null;
    expect(slotsForFight(l, human, null)).toHaveLength(2);
  });

  it('the human side wins when player 2 finishes it', () => {
    const r: MatchResult = { winner: 1, winnerTeam: 0, durationSec: 50, players: [pl(0, 'agni', { team: 0, eliminated: true }), pl(1, 'rime', { team: 0, type: 'human' }), pl(2, 'nova', { team: 1 })] };
    expect(humanSideWon(r)).toBe(true);
  });
});

describe('boss battle', () => {
  it('one fight against the Overseer; the difficulty sets both sides\' stocks; a clear keeps the best time', () => {
    for (const d of [1, 2, 3, 4] as ArcadeDifficulty[]) {
      const l = buildLadder('agni', Math.random, d, { kind: 'boss' });
      expect(l.fights).toHaveLength(1);
      expect(l.fights[0].kind).toBe('boss');
      expect(l.fights[0].stage).toBe('apex');
      expect(l.fights[0].playerStocks).toBe(BOSS_BATTLE_STOCKS[d]);
      expect(l.continuesLeft).toBe(0);
    }
    const l = buildLadder('agni', Math.random, 2, { kind: 'boss' });
    expect(setLadderDifficulty(l, 4)).toBe(true);
    expect(l.fights[0].playerStocks).toBe(2);
    expect(l.fights[0].opponents[0].stocks).toBe(3);
    expect(applyLadderResult(l, win())).toBe('champion');
    expect(l.best?.newBest).toBe(true);
    expect(loadRunRecords().boss['4']).toMatchObject({ sec: 60, fighter: 'agni' });
    expect(l.clear).toBeUndefined(); // not an arcade clear
    const again = restartRun(l);
    expect(again.kind).toBe('boss');
    expect(again.difficulty).toBe(4);
    expect(applyLadderResult(again, lose())).toBe('gameover');
  });

  it('the Overseer has story text for its intro and ending', () => {
    expect(OVERSEER_STORY.intro.length).toBeGreaterThan(20);
    expect(OVERSEER_STORY.epilogue.length).toBeGreaterThan(20);
    const l = buildLadder('agni', Math.random, 2, { kind: 'boss' });
    const intro = introCards('agni', l);
    expect(intro[0].art).toBe('boss');
    expect(intro[0].lines.join(' ')).toContain('Overseer');
  });
});

describe('endless', () => {
  it('one stock each, a fight at a time, climbing skill and a duo every fifth round', () => {
    const l = buildLadder('agni', seq(0.1, 0.6, 0.3), 2, { kind: 'endless' });
    expect(l.fights).toHaveLength(1);
    expect(l.continuesLeft).toBe(0);
    expect(currentFight(l).playerStocks).toBe(1);
    expect(currentFight(l).opponents[0].stocks).toBe(1);
    for (let round = 0; round < 10; round++) {
      const f = currentFight(l);
      expect(f.index).toBe(round);
      expect(f.opponents[0].skill).toBe(endlessSkill(2, round));
      expect(f.opponents.length).toBe(round % ENDLESS_DUO_EVERY === ENDLESS_DUO_EVERY - 1 ? 2 : 1);
      for (const o of f.opponents) expect(o.character).not.toBe('agni');
      expect(applyLadderResult(l, win(), [80, 0], seq(0.2, 0.8))).toBe('next');
      expect(canPickDifficulty(l)).toBe(false);
    }
    expect(endlessSkill(2, 0)).toBe(2);
    expect(endlessSkill(2, 30)).toBe(9);
    expect(endlessSkill(4, 0)).toBeGreaterThan(endlessSkill(1, 0));
  });

  it('carries part of your damage into the next round', () => {
    const l = buildLadder('agni', seq(0.5), 2, { kind: 'endless' });
    applyLadderResult(l, win(), [90, 0]);
    expect(currentFight(l).playerDamage).toBe(Math.round(90 * ENDLESS_CARRY));
    const slots = slotsForFight(l, human);
    expect(slots[0].startDamage).toBe(45);
    expect(runnerExtras(rulesForSlots(slots), slots.length).startDamage).toEqual([45, 0]);
    applyLadderResult(l, win(), [400, 0]);
    expect(currentFight(l).playerDamage).toBe(ENDLESS_CARRY_CAP);
  });

  it('counts KOs, ends on a loss and keeps the best per fighter', () => {
    const l = buildLadder('agni', seq(0.5), 2, { kind: 'endless' });
    applyLadderResult(l, win({ kos: 1 }), [10]);
    applyLadderResult(l, win({ kos: 1 }), [10]);
    expect(ladderOutcomeFor(l, lose(), [150])).toBe('gameover');
    expect(l.kos).toBe(3); // the KO in the last round counts
    expect(l.best).toEqual({ newBest: true, prev: null });
    expect(loadRunRecords().endless.agni).toEqual({ wins: 2, kos: 3 });
    const l2 = buildLadder('agni', seq(0.5), 2, { kind: 'endless' });
    applyLadderResult(l2, lose());
    expect(l2.best).toEqual({ newBest: false, prev: 2 });
    expect(loadRunRecords().endless.agni.wins).toBe(2);
    expect(localStorage.getItem(RUN_RECORDS_KEY)).toContain('endless');
  });
});

describe('gauntlet', () => {
  it('all ten fighters once, in a random order, each on its home stage', () => {
    const l = buildLadder('agni', seq(0.7, 0.1, 0.4), 2, { kind: 'gauntlet' });
    expect(l.fights).toHaveLength(CORE_CHARACTER_LIST.length);
    expect(new Set(l.fights.map((f) => f.opponents[0].character)).size).toBe(CORE_CHARACTER_LIST.length);
    for (const f of l.fights) {
      expect(f.opponents).toHaveLength(1);
      expect(f.opponents[0].stocks).toBe(1);
      expect(f.stage).toBe(HOME_STAGE[f.opponents[0].character]);
      expect(!!f.mirror).toBe(f.opponents[0].character === 'agni');
    }
    const other = buildLadder('agni', seq(0.2, 0.9, 0.5), 2, { kind: 'gauntlet' });
    expect(other.fights.map((f) => f.opponents[0].character)).not.toEqual(l.fights.map((f) => f.opponents[0].character));
  });

  it('stocks last the whole run and only some damage heals between fights', () => {
    const l = buildLadder('agni', seq(0.5), 2, { kind: 'gauntlet' });
    expect(currentFight(l).playerStocks).toBe(GAUNTLET_STOCKS);
    expect(applyLadderResult(l, win({ stocks: 2 }), [100, 0])).toBe('next');
    expect(l.stocksLeft).toBe(2);
    expect(currentFight(l).playerStocks).toBe(2);
    expect(currentFight(l).playerDamage).toBe(100 - GAUNTLET_HEAL);
    applyLadderResult(l, win({ stocks: 2 }), [20, 0]);
    expect(currentFight(l).playerDamage).toBe(0);
    expect(applyLadderResult(l, lose())).toBe('gameover');
  });

  it('a clear keeps the best time per fighter', () => {
    const l = buildLadder('agni', seq(0.5), 2, { kind: 'gauntlet' });
    let out = '';
    while ((out = applyLadderResult(l, win({ stocks: 3 }), [0])) === 'next');
    expect(out).toBe('champion');
    expect(l.seconds).toBe(60 * CORE_CHARACTER_LIST.length);
    expect(l.best?.newBest).toBe(true);
    expect(loadRunRecords().gauntlet.agni.sec).toBe(60 * CORE_CHARACTER_LIST.length);
    expect(l.clear).toBeUndefined();
    const slow = buildLadder('agni', seq(0.5), 2, { kind: 'gauntlet' });
    while (applyLadderResult(slow, { ...win({ stocks: 3 }), durationSec: 90 }, [0]) === 'next');
    expect(slow.best).toEqual({ newBest: false, prev: 60 * CORE_CHARACTER_LIST.length });
    // no continue-as for these runs
    expect(continueLadder(slow, { easier: true })).toBe(false);
  });
});
