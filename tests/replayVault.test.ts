import { beforeEach, describe, expect, it } from 'vitest';
import { CpuController } from '../src/ai/cpu';
import { makeInput } from '../src/engine/buttons';
import { decodeReplay, encodeReplay, fromShareCode, replayDataVersion, replayMeta, replayRunnerSetup, ReplayRecorder, ReplaySim, resultLine, toShareCode, type Replay, type ReplayMeta } from '../src/game/replay';
import { favouritesForSave, favouritesFrom, isPlayable, LocalStorageVault, MemoryVault, setVaultBackend, VAULT_RECENT, VAULT_STARS, vaultAdd, vaultAddCode, vaultDelete, vaultImport, vaultList, vaultLoad, vaultRename, vaultStar } from '../src/game/replayVault';
import { MatchRunner } from '../src/game/runner';
import { DEFAULT_RULES } from '../src/game/session';

/** Plays a CPU match on `stage` for up to `ticks`, recording it. */
function record(stage: string, chars: string[], ticks: number, rules = { ...DEFAULT_RULES, stocks: 2 }, seed = 7): { replay: Replay; hashes: Map<number, number> } {
  const rec = new ReplayRecorder(stage, rules, chars.map((character) => ({ character, type: 'cpu' as const })), true);
  const replay0: Replay = { stage, rules, players: chars.map((character) => ({ character })), smashFlick: true, ticks: 0, sticks: new Float64Array(), buttons: new Int32Array() };
  const r = new MatchRunner(replayRunnerSetup(replay0));
  const ins = r.fighters.map(() => makeInput());
  const cpus = chars.map((_, i) => new CpuController(3, seed + i));
  const hashes = new Map<number, number>();
  for (let t = 0; t < ticks && !r.over; t++) {
    r.fighters.forEach((f, i) => cpus[i].update(f, r.world, ins[i]));
    rec.record(ins);
    r.step(ins);
    hashes.set(r.world.tick, r.world.hash());
  }
  return { replay: rec.finish(), hashes };
}

const meta = (r: Replay, date = 1000): ReplayMeta => replayMeta(r, { winner: 0, winnerTeam: -1 }, date);

describe('replay codec', () => {
  it('round-trips inputs exactly, including odd stick values', async () => {
    const { replay } = record('classic', ['brick', 'vex'], 600);
    // an analog stick value that is not a multiple of 1/127, and a negative zero
    replay.sticks[10] = 0.7071067811865476;
    replay.sticks[11] = -0;
    replay.buttons[5] = 123456;
    const m = meta(replay);
    const back = decodeReplay(encodeReplay(replay, m));
    expect(back.replay.ticks).toBe(replay.ticks);
    expect(Array.from(back.replay.sticks)).toEqual(Array.from(replay.sticks));
    expect(Array.from(back.replay.buttons)).toEqual(Array.from(replay.buttons));
    expect(back.replay.rules).toEqual(replay.rules);
    expect(back.meta.result).toBe(m.result);
    expect(back.meta.version).toBe(replayDataVersion());
  });

  it('share codes round-trip and reject junk', async () => {
    const { replay } = record('storm', ['halcyon', 'gizmo'], 900);
    const code = await toShareCode(replay, meta(replay));
    expect(code.startsWith('SFCR1')).toBe(true);
    // a 15 s two-fighter match packs into a short paste
    expect(code.length).toBeLessThan(6000);
    const wrapped = code.replace(/(.{60})/g, '$1\n  ');
    const r = await fromShareCode(wrapped);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.from(r.replay.buttons)).toEqual(Array.from(replay.buttons));
    expect((await fromShareCode('')).ok).toBe(false);
    expect((await fromShareCode('hello')).ok).toBe(false);
    expect((await fromShareCode(code.slice(0, code.length - 40))).ok).toBe(false);
    expect((await fromShareCode('SFCR9z.AAAA')).ok).toBe(false);
  });

  it('labels results the way the match does', () => {
    const f = [{ type: 'human' as const }, { type: 'cpu' as const }, { type: 'cpu' as const }];
    expect(resultLine(f, 0, -1)).toBe('P1 WINS');
    expect(resultLine(f, 2, -1)).toBe('CPU3 WINS');
    expect(resultLine(f, -1, -1)).toBe('DRAW');
    expect(resultLine(f, 0, 1)).toBe('TEAM RED WINS');
  });
});

describe('seeking by re-simulation', () => {
  it('a replay played headless from the start reaches exactly the recorded state at any tick', () => {
    const { replay, hashes } = record('storm', ['halcyon', 'brick', 'vex'], 1800, { ...DEFAULT_RULES, stocks: 2, items: 2 });
    for (const target of [1, 457, 1200, replay.ticks]) {
      const sim = new ReplaySim(replay);
      expect(sim.runTo(target)).toBe(true);
      expect(sim.tick).toBe(target);
      expect(sim.runner.world.hash()).toBe(hashes.get(target));
    }
    // seeking in time-boxed slices lands on the same state
    const sliced = new ReplaySim(replay);
    let n = 0;
    while (!sliced.runTo(1500, 1)) n++;
    expect(sliced.runner.world.hash()).toBe(hashes.get(1500));
    expect(n).toBeGreaterThanOrEqual(0);
  }, 120000);

  it('re-simulates fast enough to seek (ticks per millisecond)', () => {
    const { replay } = record('classic', ['brick', 'nova'], 3000);
    const sim = new ReplaySim(replay);
    const t0 = performance.now();
    sim.runTo(replay.ticks);
    const ms = performance.now() - t0;
    // printed for the report; the bound is loose (a loaded machine)
    console.log(`[replay] re-sim ${replay.ticks} ticks in ${ms.toFixed(0)} ms (${(replay.ticks / ms).toFixed(1)} ticks/ms)`);
    expect(ms).toBeLessThan(60000);
  }, 120000);
});

describe('replay vault', () => {
  let r1: Replay;
  beforeEach(() => {
    setVaultBackend(new MemoryVault());
    r1 ??= record('classic', ['brick', 'vex'], 240).replay;
  });

  it('keeps the last VAULT_RECENT matches, plus starred ones', async () => {
    const first = await vaultAdd(r1, meta(r1, 1), { now: 1 });
    expect((await vaultStar(first.id, true)).ok).toBe(true);
    for (let i = 0; i < VAULT_RECENT + 4; i++) {
      // a distinct recording each time (the vault keeps one entry per identical code)
      const r = { ...r1, buttons: r1.buttons.slice() };
      r.buttons[0] = i + 1;
      await vaultAdd(r, meta(r, 10 + i), { now: 10 + i });
    }
    const list = await vaultList();
    expect(list.filter((e) => !e.starred)).toHaveLength(VAULT_RECENT);
    expect(list.filter((e) => e.starred).map((e) => e.id)).toEqual([first.id]);
    // newest first, and the oldest recents dropped off
    expect(list[0].meta.date).toBe(10 + VAULT_RECENT + 3);
    expect(list.some((e) => e.meta.date === 10)).toBe(false);
  });

  it('caps favourites, renames, deletes', async () => {
    const ids: string[] = [];
    for (let i = 0; i < VAULT_STARS + 1; i++) {
      const r = { ...r1, buttons: r1.buttons.slice() };
      r.buttons[0] = 1000 + i;
      ids.push((await vaultAdd(r, meta(r, i), { now: i })).id);
      const res = await vaultStar(ids[i], true, i);
      expect(res.ok).toBe(i < VAULT_STARS);
    }
    expect((await vaultList()).filter((e) => e.starred)).toHaveLength(VAULT_STARS);
    expect((await vaultRename(ids[0], '  My best\u0007 game ever, really long name  ')).ok).toBe(true);
    const named = (await vaultList()).find((e) => e.id === ids[0])!;
    expect(named.name).toBe('My best game ever, reall');
    await vaultDelete(ids[0]);
    expect((await vaultList()).some((e) => e.id === ids[0])).toBe(false);
  });

  it('gates outdated replays and imports share codes', async () => {
    const e = await vaultAdd(r1, meta(r1));
    expect(isPlayable(e.meta)).toBe(true);
    expect((await vaultLoad(e)).ok).toBe(true);
    const old = { ...e, meta: { ...e.meta, version: '0.old' } };
    expect(isPlayable(old.meta)).toBe(false);
    const refused = await vaultLoad(old);
    expect(refused.ok).toBe(false);
    // an import arrives starred
    setVaultBackend(new MemoryVault());
    const imp = await vaultImport(e.code);
    expect(imp.ok).toBe(true);
    if (imp.ok) {
      expect(imp.entry.starred).toBe(true);
      expect(imp.outdated).toBe(false);
    }
    expect((await vaultImport('nonsense')).ok).toBe(false);
  });

  it('two tabs on one localStorage never drop each other\'s changes', async () => {
    const store = new Map<string, string>();
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } as unknown as Storage;
    const a = new LocalStorageVault(ls);
    const b = new LocalStorageVault(ls);
    setVaultBackend(a);
    const ea = await vaultAdd(r1, meta(r1, 1), { now: 1 });
    setVaultBackend(b);
    const r2 = { ...r1, buttons: r1.buttons.slice() };
    r2.buttons[0] = 77;
    await vaultAdd(r2, meta(r2, 2), { now: 2 });
    await vaultStar(ea.id, true);
    setVaultBackend(a);
    const list = await vaultList();
    expect(list).toHaveLength(2);
    expect(list.find((e) => e.id === ea.id)?.starred).toBe(true);
  });

  it('save export carries favourites within the size limit', async () => {
    const e = await vaultAdd(r1, meta(r1));
    await vaultStar(e.id, true);
    const list = await vaultList();
    const all = favouritesForSave(list);
    expect(all.items).toHaveLength(1);
    expect(favouritesForSave(list, 10)).toEqual({ items: [], skipped: 1 });
    const back = favouritesFrom(JSON.parse(JSON.stringify(all.items)));
    expect(back).toHaveLength(1);
    expect(favouritesFrom([{ code: 'bad', meta: {} }, 5, null])).toEqual([]);
    setVaultBackend(new MemoryVault());
    await vaultAddCode(back[0].code, back[0].meta, { starred: true });
    expect((await vaultList())[0].starred).toBe(true);
  });
});

describe('attract demo rotation', () => {
  it('rotates a CPU match and a starred vault replay, and puts the player setup back', async () => {
    const { startDemo, endDemo, primeDemo, demoCaption } = await import('../src/game/demo');
    const { session } = await import('../src/game/session');
    setVaultBackend(new MemoryVault());
    const r = record('classic', ['brick', 'vex'], 120).replay;
    const e = await vaultAdd(r, meta(r));
    session.stage = 'storm';
    session.replay = null;
    // nothing starred yet: CPU matches only
    expect(startDemo(() => 0.3)).toBe('cpu');
    expect(demoCaption()?.title).toBe('DEMO PLAY');
    endDemo();
    expect(session.stage).toBe('storm');
    expect(session.demo).toBe(false);
    await vaultStar(e.id, true);
    await primeDemo(() => 0);
    expect(startDemo(() => 0.3)).toBe('vault');
    expect(session.watchReplay).toBe(true);
    expect((session.replay as Replay | null)?.ticks).toBe(r.ticks);
    expect(demoCaption()?.title).toBe('FROM THE VAULT');
    endDemo();
    expect(session.replay).toBe(null);
    expect(session.watchReplay).toBe(false);
    expect(demoCaption()).toBe(null);
    // the course showcase is skipped (no ghost runs to play): back to a CPU match
    expect(startDemo(() => 0.3)).toBe('cpu');
    endDemo();
  });
});
