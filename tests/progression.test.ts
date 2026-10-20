import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BossController } from '../src/ai/boss';
import { CpuController } from '../src/ai/cpu';
import { characterById, CHARACTER_LIST } from '../src/characters';
import { makeInput } from '../src/engine/buttons';
import { CHALLENGES, challengeById, challengeRunResult, weightLine } from '../src/game/challenges';
import { applyLadderResult, buildLadder, canPickDifficulty, continueLadder, currentFight, fightSkill, ladderOutcomeFor, setLadderDifficulty, slotsForFight, SKILL_CURVES, type ArcadeDifficulty } from '../src/game/ladder';
import { launchSlots, standardDummy } from '../src/game/launch';
import { quickCpuSkill, rerollRandomPicks, QUICK_CPU_KEY } from '../src/game/quick';
import { arcadeRecords, arcadeScore, fighterRecords, invalidateRecordsCache, lifetimeStats, recordArcadeClear, recordMatch, recordMatchStats, recordTargetTime, bestTargetTime } from '../src/game/records';
import { fillReplayInputs, recordsReplay, ReplayRecorder } from '../src/game/replay';
import { bodyHalf, buildResult, MatchTally, podiumSpots, type TallyFighter } from '../src/game/results';
import { MatchRunner } from '../src/game/runner';
import { exportSave, importSave, readSave, TRIALS_KEY, TUTORIAL_KEY } from '../src/game/save';
import { DEFAULT_RULES, session, teamName, type MatchResult, type PlayerResult, type PlayerSlot } from '../src/game/session';
import { endingCards, fightCard } from '../src/game/story';
import { STAGES } from '../src/stages';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

const human: PlayerSlot = { index: 0, type: 'human', device: null, character: 'vex', cpuLevel: 1 };
const pl = (index: number, character: string, o: Partial<PlayerResult> = {}): PlayerResult => ({ index, character, type: index === 0 ? 'human' : 'cpu', stocks: 1, kos: 0, falls: 0, damageDealt: 0, eliminated: false, placement: index + 1, team: -1, ...o });
const res = (players: PlayerResult[], o: Partial<MatchResult> = {}): MatchResult => ({ winner: 0, winnerTeam: -1, durationSec: 60, players, ...o });

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  invalidateRecordsCache();
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
  invalidateRecordsCache();
});

describe('arcade difficulty', () => {
  it('every difficulty sets a climbing CPU skill per fight, harder at each step up', () => {
    for (const d of [1, 2, 3, 4] as ArcadeDifficulty[]) {
      const l = buildLadder('vex', () => 0.4, d);
      expect(l.difficulty).toBe(d);
      const skills: number[] = [];
      for (let i = 0; i < 8; i++) {
        l.index = i;
        const s = slotsForFight(l, human);
        expect(s[1].cpuSkill, `fight ${i}`).toBe(SKILL_CURVES[d][i]);
        skills.push(s[1].cpuSkill!);
        // brawl backups play a step below the lead
        for (const b of s.slice(2)) expect(b.cpuSkill).toBe(Math.max(1, SKILL_CURVES[d][i] - 1));
      }
      for (let i = 1; i < skills.length; i++) expect(skills[i]).toBeGreaterThanOrEqual(skills[i - 1]);
      if (d > 1) {
        const sum = (k: ArcadeDifficulty): number => SKILL_CURVES[k].reduce((a, b) => a + b, 0);
        for (let i = 0; i < 9; i++) expect(fightSkill(d, i)).toBeGreaterThanOrEqual(fightSkill((d - 1) as ArcadeDifficulty, i));
        expect(sum(d)).toBeGreaterThan(sum((d - 1) as ArcadeDifficulty));
      }
      l.index = 8;
      const boss = slotsForFight(l, human)[1];
      expect(boss.boss).toBe(true);
      expect(boss.stocks).toBe(d === 4 ? 3 : 2);
    }
    // normal no longer puts fights 7-8 at full skill 9
    const n = buildLadder('vex', () => 0.4, 2);
    n.index = 6;
    expect(slotsForFight(n, human)[1].cpuSkill).toBeLessThan(9);
  });

  it('is picked before the first fight only, and the clear is scored and recorded at it', () => {
    const l = buildLadder('gizmo', () => 0.3, 2);
    expect(canPickDifficulty(l)).toBe(true);
    expect(setLadderDifficulty(l, 4)).toBe(true);
    expect(slotsForFight(l, human)[1].cpuSkill).toBe(SKILL_CURVES[4][0]);
    const win = (): MatchResult => res([pl(0, 'gizmo', { kos: 2 }), pl(1, 'brick')]);
    applyLadderResult(l, win());
    expect(setLadderDifficulty(l, 1)).toBe(false);
    while (l.index < l.fights.length) applyLadderResult(l, win());
    expect(l.clear?.score).toBe(arcadeScore({ kos: 18, seconds: 540, continuesUsed: 0, difficulty: 4 }));
    expect(arcadeScore({ kos: 18, seconds: 540, continuesUsed: 0, difficulty: 4 })).toBeGreaterThan(arcadeScore({ kos: 18, seconds: 540, continuesUsed: 0, difficulty: 3 }));
    expect(arcadeRecords().gizmo.hardestClear).toBe(4);
    const last = endingCards(l).at(-1)!;
    expect(last.lines.join(' ')).toContain('Score');
    expect(last.lines.join(' ')).toContain('VERY HARD');
    for (const line of last.lines) expect(line.length).toBeLessThanOrEqual(36);
  });

  it('a result is applied once even when Results is shown again for it', () => {
    const l = buildLadder('vex', () => 0.3, 2);
    const r = res([pl(0, 'vex'), pl(1, 'brick')]);
    expect(ladderOutcomeFor(l, r)).toBe('next');
    expect(ladderOutcomeFor(l, r)).toBe('next');
    expect(l.index).toBe(1);
  });

  it('after game over: continue as another fighter or on an easier setting, from the same fight', () => {
    const l = buildLadder('vex', () => 0.3, 3);
    for (let i = 0; i < 2; i++) applyLadderResult(l, res([pl(0, 'vex')]));
    const lose = (): MatchResult => res([pl(0, 'vex'), pl(1, 'brick')], { winner: 1 });
    while (applyLadderResult(l, lose()) !== 'gameover');
    const used = l.continuesUsed;
    expect(continueLadder(l, { player: 'brick' })).toBe(true);
    expect(l.player).toBe('brick');
    expect(l.index).toBe(2);
    expect(l.fights[3].opponents[0].character).toBe('brick'); // the mirror match mirrors the new fighter
    expect(l.continuesUsed).toBe(used + 1);
    expect(continueLadder(l, { easier: true })).toBe(true);
    expect(l.difficulty).toBe(2);
    expect(slotsForFight(l, human)[1].cpuSkill).toBe(SKILL_CURVES[2][2]);
    l.difficulty = 1;
    expect(continueLadder(l, { easier: true })).toBe(false);
  });

  it('the brawl card lists every rival', () => {
    const l = buildLadder('vex', () => 0.3);
    const brawl = l.fights.find((f) => f.kind === 'brawl')!;
    const card = fightCard(l, brawl);
    expect(card.rivals?.map((r) => r.character)).toEqual(brawl.opponents.map((o) => o.character));
    expect(card.right).toBe(brawl.opponents[0].character);
  });
});

/** A stand-in fighter for the tally. */
function tf(id: number, o: Partial<TallyFighter> = {}): TallyFighter {
  return { id, x: 0, y: 0, koX: 0, koY: 0, state: 'idle', grounded: true, hitstun: 0, lastHitBy: -1, move: null, ...o };
}

describe('match tally', () => {
  it('counts ledge grabs, KOs by ultimate and the longest launch', () => {
    const a = tf(0);
    const b = tf(1);
    const fs = [a, b];
    const t = new MatchTally(2);
    for (let i = 0; i < 4; i++) t.onEvent('ledgeGrab', b, 0, fs);
    // a normal launch: 200 px before b lands
    b.lastHitBy = 0;
    t.onEvent('hit', b, 12, fs);
    b.grounded = false;
    b.hitstun = 20;
    for (let k = 1; k <= 10; k++) {
      b.x = 20 * k;
      t.step(fs);
    }
    b.grounded = true;
    t.step(fs);
    expect(t.biggestLaunch[0]).toBe(50); // 200 px at 4 px per metre
    // an ultimate KO
    a.state = 'attack';
    a.move = { kind: 'ultimate' };
    t.onEvent('moveStart', a, 0, fs);
    t.onEvent('hit', b, 30, fs);
    t.onEvent('ko', b, 0, fs);
    // a plain KO by a jab later does not count
    a.move = { kind: 'jab' };
    for (let k = 0; k < 300; k++) t.step(fs);
    t.onEvent('moveStart', a, 0, fs);
    t.onEvent('hit', b, 3, fs);
    t.onEvent('ko', b, 0, fs);
    expect(t.ultKos).toEqual([1, 0]);
    expect(t.ledgeGrabs).toEqual([0, 4]);
    // the result carries them, and the lifetime stats count ultimate KOs from it
    const slots: PlayerSlot[] = [human, { ...human, index: 1, type: 'cpu', character: 'brick' }];
    const sc = (stocks: number) => ({ stocks, kos: 1, falls: 0, damageDealt: 0, eliminated: false });
    const r = buildResult(slots, [sc(2), sc(1)], [0, 0], [-1, -1], { mode: 'stock' }, 0, 600, [], -1, [], t);
    expect(r.players[0]).toMatchObject({ ultimateKos: 1, biggestLaunch: 50, ledgeGrabs: 0 });
    expect(r.players[1].ledgeGrabs).toBe(4);
    recordMatchStats(r, 'classic');
    expect(lifetimeStats().ultimateKos).toBe(1);
  });

  it('a cinematic ultimate KO counts', () => {
    const a = tf(0);
    const b = tf(1, { lastHitBy: 0 });
    const t = new MatchTally(2);
    t.onEvent('cinematicStart', a, 1, [a, b]);
    t.onEvent('cinematicHit', b, 20, [a, b], 0);
    t.onEvent('ko', b, 0, [a, b]);
    expect(t.ultKos[0]).toBe(1);
  });
});

describe('podium layout', () => {
  it('pushes a big runner-up (the Overseer) clear of the winner and keeps regular fighters where they were', () => {
    const normal = bodyHalf(characterById('vex')!);
    const boss = bodyHalf(characterById('overseer')!);
    expect(boss).toBeGreaterThan(normal * 1.5);
    const reg = podiumSpots(normal, [normal * 0.72, normal * 0.72, normal * 0.62]);
    expect(reg.map((p) => p.dx)).toEqual([-42, 42, 76]);
    const big = podiumSpots(normal, [boss * 0.72]);
    // its step is wider, and the fighter on it stands clear of the winner
    expect(big[0].hw).toBeGreaterThan(reg[0].hw);
    expect(-big[0].dx - boss * 0.72).toBeGreaterThanOrEqual(normal + 4);
    // every runner's fighter stays off the winner and off its neighbour
    for (const spots of [podiumSpots(boss, [normal * 0.72, boss * 0.72, normal * 0.62]), podiumSpots(normal, [boss * 0.72, normal * 0.72, boss * 0.62])]) {
      expect(-spots[0].dx).toBeGreaterThanOrEqual(boss);
      expect(spots[1].dx).toBeGreaterThanOrEqual(normal);
      expect(spots[2].dx - spots[2].hw).toBeGreaterThan(spots[1].dx + spots[1].hw);
    }
  });
});

describe('records across tabs', () => {
  it('a write re-reads storage first, so another tab’s results are kept', () => {
    recordMatch('brick', true, 2, 1);
    // another tab writes a target time straight into storage after this tab cached its copy
    const raw = JSON.parse(localStorage.getItem('sfc-records-v1')!);
    raw.targets = { vex: 900 };
    raw.fighters.brick.played = 5;
    raw.fighters.brick.wins = 5;
    localStorage.setItem('sfc-records-v1', JSON.stringify(raw));
    recordMatch('nova', false, 0, 3);
    invalidateRecordsCache();
    expect(bestTargetTime('vex')).toBe(900);
    expect(fighterRecords().brick.played).toBe(5);
    expect(fighterRecords().nova.played).toBe(1);
    recordTargetTime('vex', 800);
    expect(JSON.parse(localStorage.getItem('sfc-records-v1')!).fighters.brick.played).toBe(5);
  });

  it('keeps working on the cached copy when storage throws', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    invalidateRecordsCache();
    recordMatch('rime', true, 1, 0);
    recordMatch('rime', true, 1, 0);
    expect(fighterRecords().rime.played).toBe(2);
  });
});

describe('stage wins', () => {
  it('counts matches a human won per stage (team wins too), never more than were played', () => {
    recordMatchStats(res([pl(0, 'brick'), pl(1, 'vex', { placement: 2 })]), 'classic');
    recordMatchStats(res([pl(0, 'brick', { placement: 2 }), pl(1, 'vex', { placement: 1 })], { winner: 1 }), 'classic');
    recordMatchStats(res([pl(0, 'brick', { team: 2 }), pl(1, 'vex', { team: 3 })], { winner: 1, winnerTeam: 2 }), 'wreck');
    const s = lifetimeStats();
    expect(s.stages).toEqual({ classic: 2, wreck: 1 });
    expect(s.stageWins).toEqual({ classic: 1, wreck: 1 });
    // a hand-edited save cannot claim more wins than matches
    localStorage.setItem('sfc-records-v1', JSON.stringify({ stats: { stages: { classic: 2 }, stageWins: { classic: 9, ghost: 3 } } }));
    invalidateRecordsCache();
    expect(lifetimeStats().stageWins).toEqual({ classic: 2 });
  });
});

describe('save export v2', () => {
  it('carries trial clears, tutorial progress, saved rules and the last picks, and still loads old exports', () => {
    recordArcadeClear('vex', { kos: 12, seconds: 800, continuesUsed: 0, difficulty: 4 });
    localStorage.setItem(TRIALS_KEY, JSON.stringify(['vex:jab', 'brick:combo', 'bad entry']));
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ offered: true, done: true }));
    localStorage.setItem('sfc.rules.v1', JSON.stringify({ last: { ...DEFAULT_RULES, stocks: 5 }, playerCount: 3, custom: [null, { ...DEFAULT_RULES, mode: 'time' }, null] }));
    localStorage.setItem('sfc.lastFighter', JSON.stringify({ character: 'nova', palette: 2 }));
    localStorage.setItem('sfc.arcadeDifficulty', '3');
    const text = exportSave(new Date(0));
    const file = JSON.parse(text);
    expect(file.save).toBe(2);
    expect(file.extras.trials).toEqual(['vex:jab', 'brick:combo']);
    expect(file.extras.lastFighter).toEqual({ character: 'nova', palette: 2 });
    expect(file.extras.arcadeDifficulty).toBe(3);
    // wipe and load it back
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
    invalidateRecordsCache();
    const r = importSave(text);
    expect(r.ok).toBe(true);
    expect(arcadeRecords().vex.hardestClear).toBe(4);
    expect(JSON.parse(localStorage.getItem(TRIALS_KEY)!)).toEqual(['vex:jab', 'brick:combo']);
    expect(JSON.parse(localStorage.getItem(TUTORIAL_KEY)!)).toEqual({ offered: true, done: true });
    expect(JSON.parse(localStorage.getItem('sfc.rules.v1')!).last.stocks).toBe(5);
    expect(JSON.parse(localStorage.getItem('sfc.lastFighter')!).character).toBe('nova');
    expect(localStorage.getItem('sfc.arcadeDifficulty')).toBe('3');
    // a format-1 export (records only) still loads, and leaves the other progress alone
    const old = JSON.stringify({ game: 'super-fight-club', save: 1, exported: 'x', records: { version: 3, fighters: { brick: { played: 2, wins: 1, kos: 0, falls: 0 } } } });
    expect(readSave(old).ok).toBe(true);
    expect(importSave(old).ok).toBe(true);
    expect(fighterRecords().brick.played).toBe(2);
    expect(JSON.parse(localStorage.getItem(TRIALS_KEY)!)).toHaveLength(2);
    expect(readSave(JSON.stringify({ game: 'super-fight-club', save: 3, records: {} })).ok).toBe(false);
  });
});

describe('challenges', () => {
  it('HEAVYWEIGHT reads the weights from the data; THE WARDEN is on The Apex', () => {
    const brick = characterById('brick')!.stats.weight;
    const obelisk = characterById('obelisk')!.stats.weight;
    const hw = challengeById('heavyweight')!;
    expect(hw.brief).toContain(weightLine('brick', 'obelisk'));
    expect(weightLine('brick', 'obelisk')).toContain(brick > obelisk ? 'Brick outweighs Obelisk' : 'Obelisk outweighs Brick');
    expect(challengeById('warden')!.stage).toBe('apex');
    expect(STAGES.apex).toBeTruthy();
    for (const c of CHALLENGES) expect(STAGES[c.stage], c.id).toBeTruthy();
  });

  it('the run result says which goals were met and what improved', () => {
    const c = challengeById('first-blood')!; // silver: under 0:45, gold: no falls
    const fast = challengeRunResult(c, 'vex', res([pl(0, 'vex', { falls: 1 }), pl(1, 'brick')], { durationSec: 30 }));
    expect(fast).toMatchObject({ earned: 2, silverMet: true, goldMet: false, firstClear: true, newTier: true });
    const gold = challengeRunResult(c, 'vex', res([pl(0, 'vex'), pl(1, 'brick')], { durationSec: 20 }));
    expect(gold).toMatchObject({ earned: 3, silverMet: true, goldMet: true, firstClear: false, newTier: true, newBestTime: true, tier: 3 });
    const lost = challengeRunResult(c, 'vex', res([pl(0, 'vex'), pl(1, 'brick')], { winner: 1 }));
    expect(lost).toMatchObject({ earned: 0, silverMet: false, goldMet: false });
  });
});

describe('quick match, rematch, launch, teams, replays', () => {
  it('Quick Match plays the last lobby CPU skill (remembered), else Normal', () => {
    expect(quickCpuSkill(null)).toBe(5);
    expect(quickCpuSkill([human, { ...human, index: 1, type: 'cpu', cpuLevel: 3, cpuSkill: 7 }])).toBe(7);
    expect(localStorage.getItem(QUICK_CPU_KEY)).toBe('7');
    expect(quickCpuSkill(null)).toBe(7);
    expect(quickCpuSkill([human, { ...human, index: 1, type: 'cpu', cpuLevel: 1 }])).toBe(1);
  });

  it('REMATCH rolls RANDOM picks again and keeps fixed ones', () => {
    const players: PlayerSlot[] = [
      { ...human, character: 'vex', palette: 1 },
      { index: 1, type: 'cpu', device: null, character: 'brick', cpuLevel: 2, random: true },
      { index: 2, type: 'cpu', device: null, character: 'nova', cpuLevel: 2, random: true, randomOutfit: true, palette: 0 },
    ];
    session.stageRandom = true;
    session.rules = { ...DEFAULT_RULES, stagePool: ['wreck'] };
    session.stage = 'classic';
    let n = 0;
    const seq = [0.99, 0.5, 0.99];
    rerollRandomPicks(players, () => seq[n++ % seq.length]);
    expect(players[0]).toMatchObject({ character: 'vex', palette: 1 });
    expect(players[1].character).toBe(CHARACTER_LIST[CHARACTER_LIST.length - 1].id);
    expect(players[2].character).toBe(CHARACTER_LIST[Math.floor(0.5 * CHARACTER_LIST.length)].id);
    expect(players[2].palette).toBeGreaterThan(0);
    expect(session.stage).toBe('wreck');
    session.stageRandom = false;
    session.rules = { ...DEFAULT_RULES };
  });

  it('Launch Contest always flies the same standard dummy', () => {
    const d = standardDummy();
    const w = characterById(d)!.stats.weight;
    for (const c of CHARACTER_LIST) expect(Math.abs(c.stats.weight - 100)).toBeGreaterThanOrEqual(Math.abs(w - 100));
    for (const c of CHARACTER_LIST) expect(launchSlots({ ...human, character: c.id })[1].character).toBe(d);
  });

  it('team names follow the team index', () => {
    expect([0, 1, 2, 3].map(teamName)).toEqual(['BLUE', 'RED', 'GREEN', 'YELLOW']);
  });

  it('arcade fights, boss fights and challenges are recorded; a boss fight plays back exactly', () => {
    expect(recordsReplay('arcade')).toBe(true);
    expect(recordsReplay('challenge')).toBe(true);
    expect(recordsReplay('versus', true)).toBe(false);
    expect(recordsReplay('training')).toBe(false);
    const chars = ['vex', 'overseer'];
    const setup = { stage: STAGES.apex, characters: chars, rules: { mode: 'stock' as const, stocks: 3, timeLimitSec: 0, respawnDelay: 70 }, stocks: [3, 2] };
    const live = new MatchRunner(setup);
    const rec = new ReplayRecorder('apex', { ...DEFAULT_RULES }, [{ character: 'vex', stocks: 3 }, { character: 'overseer', stocks: 2, boss: true }], false, 'arcade');
    const cpu = new CpuController(3, 1);
    const boss = new BossController(() => live.match.scores[1].stocks, 1);
    const ins = [makeInput(), makeInput()];
    for (let t = 0; t < 3000 && !live.over; t++) {
      cpu.update(live.fighters[0], live.world, ins[0]);
      boss.update(live.fighters[1], live.world, ins[1]);
      rec.record(ins);
      live.step(ins);
    }
    const replay = rec.finish();
    expect(replay.mode).toBe('arcade');
    expect(replay.players[1]).toMatchObject({ boss: true, stocks: 2 });
    const again = new MatchRunner(setup);
    // the boss script runs beside the recording (its own inputs discarded), as MatchControllers does on playback
    const shadow = new BossController(() => again.match.scores[1].stocks, 1);
    const scratch = makeInput();
    const rin = [makeInput(), makeInput()];
    for (let t = 0; t < replay.ticks; t++) {
      fillReplayInputs(replay, t, rin);
      shadow.update(again.fighters[1], again.world, scratch);
      again.step(rin);
    }
    expect(again.world.hash()).toBe(live.world.hash());
    void currentFight;
  });
});
