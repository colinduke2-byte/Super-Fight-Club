import { describe, expect, it } from 'vitest';
import { AMBIENCE_TARGET, SCAPES } from '../src/audio/ambience';
import { FANFARES, FANFARE_TARGET, MUSIC_TARGET, STINGS, loopSeconds } from '../src/audio/music';
import { LOUDNESS_TARGET } from '../src/audio/sfx';
import { BARS, LOOP_STEPS, STEPS_PER_BAR, TRACKS, sectionOf, stepEvents } from '../src/audio/tracks';
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

describe('song structure', () => {
  for (const t of Object.values(TRACKS)) {
    it(`${t.id}: a full song of at least 20 s with a breakdown, a build and fills`, () => {
      expect(loopSeconds(t)).toBeGreaterThan(20);
      const bar = STEPS_PER_BAR;
      const sec = bar * BARS;
      const voices = (from: number, to: number): Set<string> => {
        const v = new Set<string>();
        for (let s = from; s < to; s++) for (const e of stepEvents(t, s)) v.add(e.voice);
        return v;
      };
      // the breakdown drops the lead and brings in the pad
      expect(voices(2 * sec, 2 * sec + 2 * bar).has('lead')).toBe(false);
      expect(voices(2 * sec, 2 * sec + 2 * bar).has('pad')).toBe(true);
      expect(voices(0, sec).has('pad')).toBe(false);
      // the song opens and returns with a crash
      expect(stepEvents(t, 0).some((e) => e.voice === 'crash')).toBe(true);
      expect(stepEvents(t, 3 * sec).some((e) => e.voice === 'crash')).toBe(true);
      // a rising snare roll into the return
      const roll = [];
      for (let s = 3 * sec - 7; s < 3 * sec; s++) roll.push(...stepEvents(t, s).filter((e) => e.voice === 'snare'));
      expect(roll.length).toBe(7);
      expect(roll[6].vel ?? 1).toBeGreaterThan(roll[0].vel ?? 1);
      // the four sections are not copies of each other
      const sig = (k: number): string => JSON.stringify(Array.from({ length: sec }, (_, i) => stepEvents(t, k * sec + i)));
      expect(new Set([0, 1, 2, 3].map(sig)).size).toBe(4);
      expect(sectionOf(LOOP_STEPS - 1)).toBe(3);
    });
  }
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
