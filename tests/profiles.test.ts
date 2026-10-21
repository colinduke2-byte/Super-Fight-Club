import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROFILE_MAX, activeProfileName, cleanName, createProfile, cycleProfile, deleteProfile, lastProfileFor, listProfiles, noteProfileResult, profileLabel, profilesFrom, reloadProfiles, renameProfile, setActiveProfiles } from '../src/game/profiles';
import { exportSave, importSave, readSave } from '../src/game/save';
import { RUN_RECORDS_KEY, loadRunRecords, recordBoss, recordEndless } from '../src/game/runRecords';
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
  reloadProfiles();
});
afterEach(() => {
  setActiveProfiles([null, null, null, null]);
  delete (globalThis as { localStorage?: Storage }).localStorage;
  invalidateRecordsCache();
  reloadProfiles();
});

describe('player profiles', () => {
  it('names are cleaned to the font, upper case and eight letters', () => {
    expect(cleanName('  alex~ the  great ')).toBe('ALEX THE');
    expect(cleanName('ñ')).toBe('');
    expect(cleanName(42)).toBe('');
  });

  it('create, rename and delete, up to eight, no duplicates; kept in storage', () => {
    expect(createProfile('sam').ok).toBe(true);
    expect(createProfile('SAM')).toEqual({ ok: false, error: 'THAT NAME IS TAKEN' });
    expect(createProfile('   ').ok).toBe(false);
    for (let i = 1; i < PROFILE_MAX; i++) expect(createProfile(`P${i}X`).ok).toBe(true);
    expect(createProfile('ONE MORE').ok).toBe(false);
    const sam = listProfiles()[0];
    expect(renameProfile(sam.id, 'kit').ok).toBe(true);
    expect(renameProfile(sam.id, 'P1X').ok).toBe(false);
    reloadProfiles();
    expect(listProfiles()).toHaveLength(PROFILE_MAX);
    expect(listProfiles()[0].name).toBe('KIT');
    expect(deleteProfile(sam.id)).toBe(true);
    reloadProfiles();
    expect(listProfiles().map((p) => p.name)).not.toContain('KIT');
  });

  it('character select cycles names, skipping ones another player holds; the tag and results use it', () => {
    const a = (createProfile('ANN') as { profile: { id: string } }).profile.id;
    const b = (createProfile('BOB') as { profile: { id: string } }).profile.id;
    expect(cycleProfile(null, 1)).toBe(a);
    expect(cycleProfile(a, 1)).toBe(b);
    expect(cycleProfile(b, 1)).toBeNull();
    expect(cycleProfile(null, 1, [a])).toBe(b);
    expect(cycleProfile(null, -1)).toBe(b);
    setActiveProfiles([b, null]);
    expect(activeProfileName(0)).toBe('BOB');
    expect(profileLabel('P1')).toBe('BOB');
    expect(profileLabel('P2')).toBe('P2');
    expect(profileLabel('CPU')).toBe('CPU');
    expect(lastProfileFor(0)).toBe(b);
    // wins counted once per result object
    const r = {};
    noteProfileResult(r, [0], [0]);
    noteProfileResult(r, [0], [0]);
    expect(listProfiles().find((p) => p.id === b)).toMatchObject({ wins: 1, played: 1 });
  });

  it('bad stored data is dropped', () => {
    expect(profilesFrom([{ id: 'a1', name: 'OK' }, { id: 'a1', name: 'DUP' }, { id: '!!', name: 'X' }, { id: 'b', name: '' }, null, 'x'])).toEqual([{ id: 'a1', name: 'OK', wins: 0, played: 0 }]);
  });
});

describe('save export carries profiles and run records', () => {
  it('round-trips both, and a hand-edited save loads only sane values', () => {
    createProfile('ZED');
    recordEndless('agni', 5, 9);
    recordBoss(3, 125, 'brick', true);
    const text = exportSave(new Date(0));
    const file = JSON.parse(text) as { extras: { profiles: unknown[]; runRecords: { endless: Record<string, unknown> } } };
    expect(file.extras.profiles).toHaveLength(1);
    expect(file.extras.runRecords.endless.agni).toEqual({ wins: 5, kos: 9 });
    // a fresh browser
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
    reloadProfiles();
    const r = importSave(text);
    expect(r.ok).toBe(true);
    expect(listProfiles().map((p) => p.name)).toEqual(['ZED']);
    expect(loadRunRecords().boss['3']).toEqual({ sec: 125, fighter: 'brick', coop: true });
    if (r.ok) expect(r.summary).toMatch(/2 run records, 1 player names/);
    // junk inside the extras is filtered
    file.extras.runRecords = { endless: { agni: { wins: -1, kos: 2 }, 'bad key!': { wins: 1, kos: 1 }, rime: { wins: 2, kos: 3 } } } as never;
    const read = readSave(JSON.stringify(file));
    expect(read.ok && read.extras?.runRecords?.endless).toEqual({ rime: { wins: 2, kos: 3 } });
    expect(RUN_RECORDS_KEY).toBe('sfc.runRecords.v1');
  });
});
