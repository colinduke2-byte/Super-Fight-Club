import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, loadSettings, parseSettings, saveSettings, serializeSettings, settings, validateSettings } from '../src/settings';

const KEY = 'sfc.settings.v1';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe('settings persistence', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
    Object.assign(settings, DEFAULT_SETTINGS);
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    Object.assign(settings, DEFAULT_SETTINGS);
  });

  it('missing, corrupt or non-object saves give the defaults', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
  });

  it('saves as { version, values } and round-trips', () => {
    settings.deadzone = 0.35;
    settings.particleQuality = 'low';
    settings.autoQuality = true;
    saveSettings();
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.version).toBe(SETTINGS_VERSION);
    expect(stored.values.deadzone).toBe(0.35);
    Object.assign(settings, DEFAULT_SETTINGS);
    loadSettings();
    expect(settings.deadzone).toBe(0.35);
    expect(settings.particleQuality).toBe('low');
    expect(settings.autoQuality).toBe(true); // current-version saves are not migrated
  });

  it('migrates a v1 (unversioned) save: autoQuality is reset to false, other values kept', () => {
    localStorage.setItem(KEY, JSON.stringify({ ...DEFAULT_SETTINGS, autoQuality: true, tapJump: false, musicVolume: 0.25 }));
    loadSettings();
    expect(settings.autoQuality).toBe(false);
    expect(settings.tapJump).toBe(false);
    expect(settings.musicVolume).toBe(0.25);
  });

  it('bad enum values fall back to the defaults', () => {
    const s = validateSettings({ particleQuality: 'ultra', smashMode: 3, renderQuality: 'fast' });
    expect(s.particleQuality).toBe(DEFAULT_SETTINGS.particleQuality);
    expect(s.smashMode).toBe(DEFAULT_SETTINGS.smashMode);
    expect(s.renderQuality).toBe('fast');
  });

  it('bad numbers fall back to the default; out-of-range numbers are clamped', () => {
    expect(validateSettings({ screenShake: 'lots' }).screenShake).toBe(DEFAULT_SETTINGS.screenShake);
    expect(validateSettings({ screenShake: null }).screenShake).toBe(DEFAULT_SETTINGS.screenShake);
    expect(parseSettings(JSON.stringify({ version: 2, values: { screenShake: 'NaN' } })).screenShake).toBe(DEFAULT_SETTINGS.screenShake);
    expect(validateSettings({ screenShake: 7 }).screenShake).toBe(1);
    expect(validateSettings({ deadzone: -1 }).deadzone).toBe(0);
    expect(validateSettings({ deadzone: 5 }).deadzone).toBe(0.9);
    expect(validateSettings({ masterVolume: 2, sfxVolume: -3 })).toMatchObject({ masterVolume: 1, sfxVolume: 0 });
  });

  it('wrong-typed booleans fall back and unknown keys are dropped', () => {
    const s = validateSettings({ rumble: 'yes', killCam: false, bogus: 1 });
    expect(s.rumble).toBe(DEFAULT_SETTINGS.rumble);
    expect(s.killCam).toBe(false);
    expect('bogus' in s).toBe(false);
  });

  it('every default validates to itself', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(serializeSettings(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });

  it('a save from a newer version keeps what validates', () => {
    const s = parseSettings(JSON.stringify({ version: SETTINGS_VERSION + 5, values: { autoQuality: true, particleQuality: 'medium' } }));
    expect(s.autoQuality).toBe(true);
    expect(s.particleQuality).toBe('medium');
  });

  it('throwing storage keeps defaults', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    expect(() => loadSettings()).not.toThrow();
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings()).not.toThrow();
  });
});
