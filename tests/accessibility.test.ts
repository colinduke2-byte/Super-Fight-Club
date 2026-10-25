import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, resetSettings, settings, validateSettings } from '../src/settings';

describe('accessibility settings', () => {
  it('defaults keep the classic look: classic colours, shapes on, 100% text, motion and flashes as designed', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ playerPalette: 'classic', portShapes: true, uiScale: 1, reduceMotion: false, reduceFlashes: false, renderQuality: 'sharp', upJumpKeyboard: true });
  });

  it('validates the new fields: unknown palettes fall back, text size is clamped, wrong types are dropped', () => {
    expect(validateSettings({ playerPalette: 'neon' }).playerPalette).toBe('classic');
    expect(validateSettings({ playerPalette: 'colorblind' }).playerPalette).toBe('colorblind');
    expect(validateSettings({ uiScale: 9 }).uiScale).toBe(1.5);
    expect(validateSettings({ uiScale: 0.1 }).uiScale).toBe(0.75);
    expect(validateSettings({ reduceMotion: 'yes', portShapes: false })).toMatchObject({ reduceMotion: false, portShapes: false });
  });

  it('older saves without the new fields load with their defaults', () => {
    const s = parseSettings(JSON.stringify({ version: 2, values: { musicVolume: 0.3 } }));
    expect(s.musicVolume).toBe(0.3);
    expect(s.playerPalette).toBe('classic');
    expect(s.uiScale).toBe(1);
  });

  it('resetSettings puts back only the keys asked for', () => {
    const before = { ...settings };
    settings.playerPalette = 'colorblind';
    settings.musicVolume = 0.1;
    resetSettings(['playerPalette']);
    expect(settings.playerPalette).toBe('classic');
    expect(settings.musicVolume).toBe(0.1);
    Object.assign(settings, before);
  });
});
