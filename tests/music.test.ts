import { describe, expect, it } from 'vitest';
import { loopSeconds } from '../src/audio/music';
import { BARS, MIN_SONG_SECONDS, SECTION_STEPS, STEPS_PER_BAR, TRACKS, leadCellCount, midiToHz, sectionAt, songForm, songSteps, stepEvents, type MusicEvent } from '../src/audio/tracks';
import { STAGES } from '../src/stages';

describe('chiptune tracks', () => {
  for (const t of Object.values(TRACKS)) {
    it(`${t.id}: every pattern is one bar long`, () => {
      expect(t.bass.length).toBe(STEPS_PER_BAR);
      expect(t.arp.length).toBe(STEPS_PER_BAR);
      expect(t.drums.length).toBe(STEPS_PER_BAR);
      for (const bar of t.lead) expect(leadCellCount(bar)).toBe(STEPS_PER_BAR);
      for (const bar of t.counter ?? []) expect(leadCellCount(bar)).toBe(STEPS_PER_BAR);
      for (const bar of t.bridge?.lead ?? []) expect(leadCellCount(bar)).toBe(STEPS_PER_BAR);
      expect(t.minor.length).toBe(4);
      if (t.bridge) expect(t.bridge.minor.length).toBe(4);
    });
    it(`${t.id}: loops and produces audible notes in a sane range`, () => {
      let n = 0;
      const steps = songSteps(t);
      for (let s = 0; s < steps; s++) {
        for (const e of stepEvents(t, s)) {
          n++;
          if (e.voice === 'lead' || e.voice === 'counter' || e.voice === 'bass' || e.voice === 'arp' || e.voice === 'pad') {
            const hz = midiToHz(e.midi);
            expect(hz, `${e.voice} at ${s}`).toBeGreaterThan(30);
            expect(hz, `${e.voice} at ${s}`).toBeLessThan(4000);
          }
          expect(e.steps).toBeGreaterThan(0);
          expect(e.vel ?? 1).toBeGreaterThan(0);
          expect(e.vel ?? 1).toBeLessThanOrEqual(1);
        }
      }
      expect(n).toBeGreaterThan(400);
      expect(stepEvents(t, 3)).toEqual(stepEvents(t, 3 + steps));
      expect(stepEvents(t, -1)).toEqual(stepEvents(t, steps - 1));
    });
  }
  it('every stage names a track that exists', () => {
    for (const s of Object.values(STAGES)) expect(TRACKS[s.music ?? '']).toBeDefined();
  });
  it('the menus, modes and the boss have their own tracks', () => {
    for (const id of ['menu', 'select', 'results', 'credits', 'story', 'launch', 'training', 'targets', 'boss', 'boss2']) expect(TRACKS[id], id).toBeDefined();
  });
});

describe('song length and form', () => {
  const sig = (t: (typeof TRACKS)[string], from: number, len: number): string => JSON.stringify(Array.from({ length: len }, (_, i) => stepEvents(t, from + i)));
  for (const t of Object.values(TRACKS)) {
    it(`${t.id}: plays at least two and a half minutes before it repeats, and not much more than four`, () => {
      expect(loopSeconds(t)).toBeGreaterThanOrEqual(MIN_SONG_SECONDS);
      expect(loopSeconds(t)).toBeLessThan(250);
      expect(songSteps(t) % SECTION_STEPS).toBe(0);
    });

    it(`${t.id}: sections, a breakdown, a bridge, a drop, fills and a key change`, () => {
      const form = songForm(t);
      const kinds = new Set(form.map((s) => s.kind));
      for (const k of ['intro', 'A', 'B', 'R', 'C', 'V', 'outro'] as const) expect(kinds.has(k), k).toBe(true);
      // the song opens on a crash and the outro is last, so it wraps cleanly into the top
      expect(stepEvents(t, 0).some((e) => e.voice === 'crash')).toBe(true);
      expect(form[form.length - 1].kind).toBe('outro');
      // the breakdown drops the lead and brings in the pad, and ends on a rising roll into the return
      const b = form.findIndex((s) => s.kind === 'B') * SECTION_STEPS;
      const voices = (from: number, to: number): Set<string> => {
        const v = new Set<string>();
        for (let s = from; s < to; s++) for (const e of stepEvents(t, s)) v.add(e.voice);
        return v;
      };
      expect(voices(b, b + 2 * STEPS_PER_BAR).has('lead')).toBe(false);
      expect(voices(b, b + 2 * STEPS_PER_BAR).has('pad')).toBe(true);
      const roll: MusicEvent[] = [];
      for (let s = b + SECTION_STEPS - 7; s < b + SECTION_STEPS; s++) roll.push(...stepEvents(t, s).filter((e) => e.voice === 'snare'));
      expect(roll.length).toBe(7);
      expect(roll[6].vel ?? 1).toBeGreaterThan(roll[0].vel ?? 1);
      // the opening section has no pad; the intro has no lead
      expect(voices(SECTION_STEPS, 2 * SECTION_STEPS).has('pad')).toBe(false);
      expect(voices(0, SECTION_STEPS).has('lead')).toBe(false);
      // every section that is not followed by a drop ends on a fill: snares or toms on the last beat
      form.forEach((s, k) => {
        if (form[(k + 1) % form.length].kind === 'drop' || s.kind === 'drop') return;
        const end = (k + 1) * SECTION_STEPS;
        const fills = voices(end - 4, end);
        expect(fills.has('snare') || fills.has('tom'), `${s.kind} #${k}`).toBe(true);
      });
      // at least one lifted chorus in another key, and the drop takes the drums out
      if (form.length > 9) {
        expect(form.some((s) => s.key !== 0)).toBe(true);
        const d = form.findIndex((s) => s.kind === 'drop') * SECTION_STEPS;
        const dv = voices(d, d + 3 * STEPS_PER_BAR);
        expect(dv.has('kick') || dv.has('snare')).toBe(false);
        expect(dv.has('lead')).toBe(true);
      }
    });

    it(`${t.id}: no stretch of the song is a copy of another (variation everywhere)`, () => {
      const n = songForm(t).length;
      const sigs = Array.from({ length: n }, (_, k) => sig(t, k * SECTION_STEPS, SECTION_STEPS));
      // every four-bar section is its own; the melody of a section never comes back note for note either
      expect(new Set(sigs).size).toBe(n);
      expect(sectionAt(t, songSteps(t) - 1).kind).toBe('outro');
      expect(sectionAt(t, songSteps(t)).kind).toBe('intro');
      expect(BARS).toBe(4);
    });
  }
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
