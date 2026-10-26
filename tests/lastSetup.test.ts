import { beforeEach, describe, expect, it } from 'vitest';
import type { InputDevice } from '../src/input/device';
import { CHARACTER_LIST } from '../src/characters';
import { STAGE_LIST } from '../src/stages';
import { LAST_SETUP_KEY, applySetup, devicesFor, loadLastSetup, prepareOneVsOne, prepareVersus, resetPrepareForTest, sanitizeSetup, saveLastSetup, setupFromSession, startLastSetup, versusTitle } from '../src/game/lastSetup';
import { Lobby } from '../src/game/lobby';
import { LOBBY_PRESETS, PRESETS, applyLobbyPreset, lobbyPresetName, loadSavedRules, resetRulesRestoreForTest, rulesSummary, saveLastRules } from '../src/game/rulesets';
import { DEFAULT_RULES, newSession, session, type Session } from '../src/game/session';

function fakeStorage(): Map<string, string> {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  };
  return m;
}

const dev = (id: string, kind: InputDevice['kind'] = 'keyboard'): InputDevice => ({ id, kind, label: id, connected: true, sample: () => undefined });

/** A versus session as character select leaves it: two humans on the keyboard halves and a CPU. */
function versusSession(): Session {
  const s = newSession();
  s.mode = 'versus';
  s.playerCount = 3;
  s.stage = 'temple';
  s.stageRandom = false;
  s.rules = { ...DEFAULT_RULES, stocks: 2, items: 2, stageForm: 'battlefield', modifier: 'giant', teams: true, teamOf: [0, 1, 1], handicap: [{ damage: 30, stock: 0 }, { damage: 0, stock: 0 }, { damage: 0, stock: 1 }] };
  s.players = [
    { index: 0, type: 'human', device: dev('keyboard:kb1'), character: 'nova', cpuLevel: 2, palette: 2 },
    { index: 1, type: 'human', device: dev('keyboard:kb2'), character: 'brick', cpuLevel: 2, palette: 0, random: true },
    { index: 2, type: 'cpu', device: null, character: 'vex', cpuLevel: 3, cpuSkill: 7, palette: 1 },
  ];
  return s;
}

describe('last setup (PLAY repeats the last versus setup)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = fakeStorage();
  });

  it('saves fighters, CPU level, teams, handicaps, stage, form and every rule; loads them back', () => {
    const s = versusSession();
    saveLastSetup(s, ['prof1', null, null]);
    const got = loadLastSetup()!;
    expect(got.stage).toBe('temple');
    expect(got.rules).toMatchObject({ stocks: 2, items: 2, stageForm: 'battlefield', modifier: 'giant', teams: true });
    expect(got.fighters).toHaveLength(3);
    expect(got.fighters[0]).toMatchObject({ type: 'human', character: 'nova', palette: 2, profile: 'prof1', deviceId: 'keyboard:kb1', team: 0, handicap: { damage: 30, stock: 0 } });
    expect(got.fighters[1]).toMatchObject({ type: 'human', character: 'random', random: true, team: 1 });
    expect(got.fighters[2]).toMatchObject({ type: 'cpu', character: 'vex', cpuSkill: 7, cpuLevel: 3, team: 1, handicap: { damage: 0, stock: 1 } });
  });

  it('a RANDOM stage is saved as RANDOM; nothing is saved outside versus', () => {
    const s = versusSession();
    s.stageRandom = true;
    expect(setupFromSession(s, [])!.stage).toBe('random');
    s.mode = 'arcade';
    saveLastSetup(s);
    expect(store.has(LAST_SETUP_KEY)).toBe(false);
  });

  it('is robust to no save, broken JSON, old shapes, missing fighters and stages', () => {
    expect(loadLastSetup()).toBeNull();
    store.set(LAST_SETUP_KEY, '{nope');
    expect(loadLastSetup()).toBeNull();
    store.set(LAST_SETUP_KEY, JSON.stringify({ fighters: [{ type: 'human', character: 'nova' }] }));
    expect(loadLastSetup()).toBeNull(); // one fighter is no versus setup
    // an old record ("players"), a fighter that is gone, a stage that is gone, junk numbers
    store.set(LAST_SETUP_KEY, JSON.stringify({ players: [{ type: 'human', character: 'nova', palette: 99 }, { type: 'cpu', character: 'ghost', cpuSkill: 42 }, 7], stage: 'atlantis', rules: { stocks: 'x', mode: 'time' } }));
    const got = loadLastSetup()!;
    expect(got.fighters).toHaveLength(2);
    expect(got.fighters[0].palette).toBeLessThan(10);
    expect(got.fighters[1]).toMatchObject({ character: 'random', random: true, cpuSkill: 9 });
    expect(got.stage).toBe('random');
    expect(got.rules).toMatchObject({ mode: 'time', stocks: DEFAULT_RULES.stocks });
    expect(sanitizeSetup(null)).toBeNull();
    expect(sanitizeSetup({ fighters: 'no' })).toBeNull();
  });

  it('devices: each human gets their own device back; the PLAY press takes a missing one; a solo keyboard player gets both halves', () => {
    const kb1 = dev('keyboard:kb1');
    const kb2 = dev('keyboard:kb2');
    const pad = dev('gamepad:0', 'gamepad');
    const two = sanitizeSetup({ fighters: [{ type: 'human', character: 'nova', deviceId: 'keyboard:kb1' }, { type: 'human', character: 'vex', deviceId: 'gamepad:1' }, { type: 'cpu', character: 'brick' }] })!;
    expect(devicesFor(two.fighters, [kb1, kb2], null)).toEqual([kb1, null, null]);
    expect(devicesFor(two.fighters, [kb1, kb2, pad], pad)).toEqual([kb1, pad, null]);
    const merged = dev('p1', 'merged');
    const solo = sanitizeSetup({ fighters: [{ type: 'human', character: 'nova', deviceId: 'keyboard:kb2' }, { type: 'cpu', character: 'vex' }] })!;
    expect(devicesFor(solo.fighters, [kb1, kb2], kb1, () => merged)[0]).toBe(merged);
    expect(devicesFor(solo.fighters, [kb1, kb2, pad], pad, () => merged)[0]).toBe(pad);
  });

  it('applySetup rebuilds the session: RANDOM rolls (CPUs avoid picked fighters), teams and handicaps per slot, a RANDOM stage from the pool', () => {
    const setup = sanitizeSetup({
      fighters: [
        { type: 'human', character: 'nova', palette: 1, deviceId: 'keyboard:kb1', team: 0, handicap: { damage: 20, stock: 0 } },
        { type: 'cpu', character: 'random', random: true, cpuSkill: 3, team: 1 },
      ],
      stage: 'random',
      rules: { ...DEFAULT_RULES, teams: true, stagePool: ['temple'], items: 1 },
    })!;
    const s = newSession();
    const kb1 = dev('keyboard:kb1');
    const players = applySetup(setup, [kb1, null], () => 0, s)!;
    expect(players).not.toBeNull();
    expect(s.mode).toBe('versus');
    expect(s.playerCount).toBe(2);
    expect(players[0]).toMatchObject({ type: 'human', device: kb1, character: 'nova', palette: 1 });
    expect(players[1].type).toBe('cpu');
    expect(players[1].character).not.toBe('nova');
    expect(players[1]).toMatchObject({ random: true, cpuSkill: 3, cpuLevel: 1 });
    expect(s.rules.teamOf).toEqual([0, 1]);
    expect(s.rules.handicap).toEqual([{ damage: 20, stock: 0 }, { damage: 0, stock: 0 }]);
    expect(s.stage).toBe('temple');
    expect(s.stageRandom).toBe(true);
    expect(s.versusLineup).toBe(players);
    // a human without a device: no match (character select opens with the lineup instead)
    expect(applySetup(setup, [null, null], () => 0, newSession())).toBeNull();
  });

  it('startLastSetup: false without a setup; with one it goes through the VS splash into the match', () => {
    const calls: [string, object | undefined][] = [];
    const scene = { goTo: (k: string, d?: object) => calls.push([k, d]) } as unknown as Parameters<typeof startLastSetup>[0];
    expect(startLastSetup(scene)).toBe(false);
    expect(calls).toHaveLength(0);
    store.set(LAST_SETUP_KEY, JSON.stringify({ fighters: [{ type: 'cpu', character: 'nova', cpuSkill: 5 }, { type: 'cpu', character: 'vex', cpuSkill: 9 }], stage: STAGE_LIST[0].id, rules: { ...DEFAULT_RULES, stocks: 1 } }));
    expect(startLastSetup(scene)).toBe(true);
    expect(calls[0][0]).toBe('VersusSplash');
    expect(calls[0][1]).toMatchObject({ next: 'Match', title: '1 STOCK' });
    expect(session.players.map((p) => p.character)).toEqual(['nova', 'vex']);
    expect(session.stage).toBe(STAGE_LIST[0].id);
    expect(session.rules.stocks).toBe(1);
  });

  it('prepareVersus: versus mode, 2-4 players, the saved rules once, the stage strip on the last stage', () => {
    resetPrepareForTest();
    resetRulesRestoreForTest();
    saveLastRules({ ...DEFAULT_RULES, stocks: 5 }, 3);
    store.set(LAST_SETUP_KEY, JSON.stringify({ fighters: [{ type: 'cpu', character: 'nova' }, { type: 'cpu', character: 'vex' }], stage: 'temple' }));
    const s = newSession();
    s.mode = 'training';
    s.playerCount = 1;
    prepareVersus(s);
    expect(s.mode).toBe('versus');
    expect(s.playerCount).toBe(3);
    expect(s.rules.stocks).toBe(5);
    expect(s.stage).toBe('temple');
    expect(s.stageRandom).toBe(false);
    s.rules.stocks = 2;
    prepareVersus(s);
    expect(s.rules.stocks).toBe(2); // once per run
  });

  it('prepareOneVsOne (BATTLE): opens a 1 vs 1 even after a saved 4-player team battle, keeping the other rules', () => {
    resetPrepareForTest();
    resetRulesRestoreForTest();
    saveLastRules({ ...DEFAULT_RULES, stocks: 4, teams: true }, 4);
    const s = newSession();
    prepareOneVsOne(s);
    expect(s.mode).toBe('versus');
    expect(s.playerCount).toBe(2);
    expect(s.rules.teams).toBe(false);
    expect(s.rules.stocks).toBe(4);
  });

  it('versusTitle names the rules', () => {
    expect(versusTitle({ ...DEFAULT_RULES })).toBe('3 STOCKS');
    expect(versusTitle({ ...DEFAULT_RULES, mode: 'time', timeSec: 120 })).toBe('2 MINUTE MATCH');
    expect(versusTitle({ ...DEFAULT_RULES, mode: 'stamina', teams: true })).toBe('TEAM BATTLE: STAMINA: 150 HP');
  });
});

describe('lobby presets and one-tap picks', () => {
  beforeEach(() => {
    fakeStorage();
  });

  it('CLASSIC, QUICK and PARTY; the stage form stays; the chip names and sums them up', () => {
    expect(LOBBY_PRESETS).toEqual(['classic', 'quick', 'party']);
    const byId = (id: string) => PRESETS.find((p) => p.id === id)!.rules;
    expect(byId('classic')).toMatchObject({ mode: 'stock', stocks: 3, items: 1 });
    expect(byId('quick')).toMatchObject({ mode: 'stock', stocks: 1 });
    expect(byId('party')).toMatchObject({ items: 2, modifier: 'turbo' });
    const r = { ...DEFAULT_RULES, stageForm: 'plain' as const, teams: true, teamOf: [0, 0, 1] };
    applyLobbyPreset(r, 'quick');
    expect(r).toMatchObject({ stocks: 1, stageForm: 'plain', teams: true, teamOf: [0, 0, 1] });
    expect(lobbyPresetName(r, loadSavedRules())).toBe('QUICK');
    applyLobbyPreset(r, 'party');
    expect(lobbyPresetName(r, loadSavedRules())).toBe('PARTY');
    expect(rulesSummary(r)).toBe('2 MIN  ITEMS HIGH  TURBO  TEAMS');
    r.stocks = 7;
    r.mode = 'stock';
    expect(lobbyPresetName(r, loadSavedRules())).toBe('CUSTOM');
    expect(applyLobbyPreset(r, 'nope')).toBe(false);
  });

  it('pickAndLock joins and locks in one go; picking another fighter switches; restyle and setOutfit work while locked', () => {
    const l = new Lobby(2, CHARACTER_LIST.length, { random: true, palettes: () => 4 });
    expect(l.pickAndLock('touch', 3)).toBe(0);
    expect(l.slots[0]).toMatchObject({ kind: 'human', character: 3, locked: true, palette: 0 });
    expect(l.ready).toBe(true); // one locked human: the CPU fills the rest
    l.restyle('touch', 1);
    expect(l.slots[0].palette).toBe(1);
    expect(l.setOutfit('touch', 3)).toBe(true);
    expect(l.slots[0].palette).toBe(3);
    l.pickAndLock('touch', 5);
    expect(l.slots[0]).toMatchObject({ character: 5, palette: 0, locked: true });
    // a second player joins: not ready until they lock too
    l.join('keyboard:kb2');
    expect(l.ready).toBe(false);
    l.confirm('keyboard:kb2');
    expect(l.ready).toBe(true);
  });

  it('adjustSlot edits a CPU directly (the CPU panel); rows a slot lacks are ignored', () => {
    const l = new Lobby(3, CHARACTER_LIST.length, { random: true });
    l.teams = true;
    l.fillWithCpu();
    expect(l.adjustSlot(1, 'level', 1)).toBe(true);
    expect(l.slots[1].skill).toBe(6);
    expect(l.adjustSlot(1, 'team', 1)).toBe(true);
    expect(l.adjustSlot(1, 'damage', 1)).toBe(true);
    expect(l.slots[1].damage).toBe(10);
    l.join('kb1');
    expect(l.adjustSlot(0, 'level', 1)).toBe(false); // a human slot has no LEVEL row
    expect(l.adjustSlot(3, 'level', 1)).toBe(false); // outside the player count
  });
});
