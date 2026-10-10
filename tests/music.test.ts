import { describe, expect, it } from 'vitest';
import { LOOP_STEPS, STEPS_PER_BAR, TRACKS, leadCellCount, midiToHz, stepEvents } from '../src/audio/tracks';
import { STAGES } from '../src/stages';

describe('chiptune tracks', () => {
  for (const t of Object.values(TRACKS)) {
    it(`${t.id}: every pattern is one bar long`, () => {
      expect(t.bass.length).toBe(STEPS_PER_BAR);
      expect(t.arp.length).toBe(STEPS_PER_BAR);
      expect(t.drums.length).toBe(STEPS_PER_BAR);
      for (const bar of t.lead) expect(leadCellCount(bar)).toBe(STEPS_PER_BAR);
      expect(t.minor.length).toBe(4);
    });
    it(`${t.id}: loops and produces audible notes in a sane range`, () => {
      let n = 0;
      for (let s = 0; s < LOOP_STEPS; s++) {
        for (const e of stepEvents(t, s)) {
          n++;
          if (e.voice === 'lead' || e.voice === 'bass' || e.voice === 'arp') {
            const hz = midiToHz(e.midi);
            expect(hz).toBeGreaterThan(30);
            expect(hz).toBeLessThan(4000);
          }
        }
      }
      expect(n).toBeGreaterThan(40);
      expect(stepEvents(t, 3)).toEqual(stepEvents(t, 3 + LOOP_STEPS));
    });
  }
  it('every stage names a track that exists', () => {
    for (const s of Object.values(STAGES)) expect(TRACKS[s.music ?? '']).toBeDefined();
  });
});
