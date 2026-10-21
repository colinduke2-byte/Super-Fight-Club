import { describe, expect, it } from 'vitest';
import { AMBIENCE_TARGET, SCAPES } from '../src/audio/ambience';
import { FANFARES, FANFARE_TARGET, MUSIC_TARGET, STINGS } from '../src/audio/music';
import { LOUDNESS_TARGET } from '../src/audio/sfx';
import { TRACKS } from '../src/audio/tracks';
import { settings } from '../src/settings';
import { measureFanfare, measureScape, measureTrack } from './audioMeasure';

const DEFAULTS = { master: 0.7, music: 0.6 };
/** Offline renders are slow on a loaded machine: generous timeouts so only a real failure fails. */
const SLOW = { timeout: 120000 };
const db = (g: number): number => 20 * Math.log10(g);

describe('music levels (rendered)', () => {
  for (const id of Object.keys(TRACKS)) {
    it(`${id}: the whole song sits within 1 dB of the music target and never peaks near full scale`, SLOW, () => {
      const m = measureTrack(id);
      expect(m.integrated).toBeGreaterThan(MUSIC_TARGET - 1);
      expect(m.integrated).toBeLessThan(MUSIC_TARGET + 1);
      expect(m.peak).toBeLessThan(-3);
    });
  }

  it('every fanfare and boss sting lands within 1 dB of the fanfare target', SLOW, () => {
    for (const who of [...Object.keys(FANFARES), 'lose', ...Object.keys(STINGS)]) {
      const m = measureFanfare(who);
      expect(m.integrated, who).toBeGreaterThan(FANFARE_TARGET - 1);
      expect(m.integrated, who).toBeLessThan(FANFARE_TARGET + 1);
    }
  });

  it('at the default sliders the fight sits clearly on top of the music', () => {
    // the shipped defaults this balance was set for
    expect(settings.masterVolume).toBe(DEFAULTS.master);
    expect(settings.musicVolume).toBe(DEFAULTS.music);
    const music = MUSIC_TARGET + db(DEFAULTS.master * DEFAULTS.music);
    const midHit = LOUDNESS_TARGET.hit + db(DEFAULTS.master) + db(0.6 * 0.95 + 0.05);
    const heavy = LOUDNESS_TARGET.hitHeavy + db(DEFAULTS.master);
    expect(midHit - music).toBeGreaterThan(3);
    expect(heavy - music).toBeGreaterThan(9);
  });
});

describe('ambience levels (rendered)', () => {
  it('the ambience target sits well under the music', () => {
    expect(AMBIENCE_TARGET).toBeLessThan(MUSIC_TARGET - 10);
  });
  // one test per stage (each a 20 s seeded render) so a slow, loaded machine never runs one test past its timeout
  for (const theme of Object.keys(SCAPES)) {
    it(`${theme}: the stage ambience sits near the target`, SLOW, () => {
      const m = measureScape(theme);
      // the quietest scape (an open sky) is capped by its trim: allowed to sit a little lower
      expect(m.integrated, theme).toBeGreaterThan(AMBIENCE_TARGET - 6);
      expect(m.integrated, theme).toBeLessThan(AMBIENCE_TARGET + 1.5);
      expect(m.peak, theme).toBeLessThan(-12);
    });
  }
});
