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

describe('victory fanfares', () => {
  it('every playable fighter has its own, in a sane range', async () => {
    const { FANFARES } = await import('../src/audio/music');
    const { CHARACTER_LIST } = await import('../src/characters');
    for (const c of CHARACTER_LIST) {
      const f = FANFARES[c.id];
      expect(f, c.id).toBeDefined();
      const total = f.notes.reduce((n, [, len]) => n + len, 0) * f.step;
      expect(total).toBeGreaterThan(0.8);
      expect(total).toBeLessThan(2.5);
      for (const [m] of f.notes) if (m > 0) expect(midiToHz(m)).toBeLessThan(4000);
    }
  });
});
