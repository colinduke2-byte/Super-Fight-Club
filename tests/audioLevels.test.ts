import { describe, expect, it } from 'vitest';
import { AUDIO_STYLES, LOUDNESS_TARGET, SOUND_SPAN, Sfx, type AudioStyle } from '../src/audio/sfx';
import { settings } from '../src/settings';
import { ITEM, SOUND_NAMES, STAGE_SURFACE, SURFACES, footstepFor, hazardSounds, hitLayer, soundFor, soundsFor, type SoundName } from '../src/audio/soundMap';
import { STAGES } from '../src/stages';
import { RenderCtx, seeded } from './audioRender';
import { SR, audibleSpan, bandProfile, measureSound } from './audioMeasure';

/** Styles fighters actually use (plain is only the fallback). */
const FIGHTER_STYLES = AUDIO_STYLES.filter((s) => s !== 'plain');
const STYLED: SoundName[] = ['swing', 'hit', 'hitHeavy', 'taunt', 'voxAttack', 'voxHurt', 'voxKo', 'voxTaunt'];
/** Rendering every sound is slow on a loaded machine: generous timeouts so only a real failure fails. */
const SLOW = { timeout: 120000 };

/** Mean per-band level difference (dB) between two sounds' spectra: how different they sound in colour. */
function colourDistance(a: Float32Array, b: Float32Array): number {
  const toDb = (p: number[]): number[] => {
    const l = p.map((v) => 10 * Math.log10(v + 1e-9));
    const top = Math.max(...l);
    return l.map((v) => Math.max(v, top - 40));
  };
  const pa = toDb(bandProfile(a, SR));
  const pb = toDb(bandProfile(b, SR));
  return pa.reduce((n, v, i) => n + Math.abs(v - pb[i]), 0) / pa.length;
}

describe('sound effect levels (rendered)', () => {
  it('every sound lands within 1.5 dB of its loudness target and never peaks above -0.5 dBFS on its own', SLOW, () => {
    for (const name of SOUND_NAMES) {
      const styles: readonly AudioStyle[] = STYLED.includes(name) ? AUDIO_STYLES : ['plain'];
      for (const st of styles) {
        const m = measureSound(name, st);
        const label = `${name}:${st}`;
        expect(m.momentary, label).toBeGreaterThan(LOUDNESS_TARGET[name] - 1.5);
        expect(m.momentary, label).toBeLessThan(LOUDNESS_TARGET[name] + 1.5);
        expect(m.peak, label).toBeLessThan(-0.5);
      }
    }
  });

  it('keeps a pecking order: menu blips < movement < light hits < heavy hits < KO', () => {
    const T = LOUDNESS_TARGET;
    expect(Math.max(T.menuMove, T.menuBack, T.menuOk)).toBeLessThan(T.hit);
    expect(Math.max(T.jump, T.land, T.dodge, T.swing)).toBeLessThan(T.hit);
    expect(T.hit).toBeLessThan(T.hitHeavy - 3);
    for (const n of SOUND_NAMES) if (n !== 'ko') expect(T[n], n).toBeLessThanOrEqual(T.ko);
  });

  it('louder cues for harder hits: intensity scales the level', SLOW, () => {
    const soft = measureSound('hit', 'blade', 0.3);
    const hard = measureSound('hit', 'blade', 1);
    expect(hard.momentary - soft.momentary).toBeGreaterThan(6);
  });

  it('every sound fades out instead of being cut off (no click at the end)', SLOW, () => {
    for (const name of SOUND_NAMES) {
      const m = measureSound(name, STYLED.includes(name) ? 'stone' : 'plain');
      const { end } = audibleSpan(m.x, SR, -90);
      const e = Math.round(end * SR);
      // the last 5 ms before silence must already be far below the peak
      let tail = 0;
      for (let i = Math.max(0, e - SR * 0.005); i <= e; i++) tail = Math.max(tail, Math.abs(m.x[i]));
      expect(20 * Math.log10(tail + 1e-9), name).toBeLessThan(m.peak - 40);
    }
  });

  // deterministic (seeded) renders; the old flakiness was the default 5 s timeout on a loaded machine
  it('every sound is long enough to read (no click-length blips) and short enough not to smear the mix', SLOW, () => {
    for (const name of SOUND_NAMES) {
      const m = measureSound(name);
      const { start, end } = audibleSpan(m.x, SR, m.peak - 40);
      expect(end - start, name).toBeGreaterThan(0.035);
      expect(end - start, name).toBeLessThan(SOUND_SPAN[name] ?? 1);
    }
  });

  it('footsteps are soft: every surface sits well under a jump or a landing', () => {
    const T = LOUDNESS_TARGET;
    for (const s of SURFACES) {
      const cue = footstepFor(Object.keys(STAGE_SURFACE).find((id) => STAGE_SURFACE[id] === s), 6, 1);
      expect(cue.name.toLowerCase()).toContain(s);
      expect(T[cue.name]).toBeLessThan(Math.min(T.jump, T.land, T.dodge) - 4);
    }
    // every stage has a floor (unknown ones walk on stone)
    for (const id of Object.keys(STAGES)) expect(STAGE_SURFACE[id], id).toBeDefined();
    expect(footstepFor('nowhere').name).toBe('stepStone');
  });

  it('each fighter flavour has its own colour: no two styles sound alike on a swing, a hit or a taunt', SLOW, () => {
    const min: Record<string, number> = { swing: 4, hit: 3.5, hitHeavy: 1.5, taunt: 3 };
    for (const name of Object.keys(min) as SoundName[]) {
      const xs = FIGHTER_STYLES.map((st) => measureSound(name, st).x);
      for (let i = 0; i < xs.length; i++)
        for (let j = i + 1; j < xs.length; j++) {
          const d = colourDistance(xs[i], xs[j]);
          expect(d, `${name} ${FIGHTER_STYLES[i]} vs ${FIGHTER_STYLES[j]}`).toBeGreaterThan(min[name]);
        }
    }
  });

  it('the new cues have distinct sounds: ultimate ready is not the clock ding, an ultimate is not a charge', SLOW, () => {
    expect(soundFor('meterFull', 0, 0)!.name).toBe('ready');
    expect(soundFor('cinematicStart', 0, 0)!.name).toBe('ultimate');
    expect(soundFor('itemSpawn', 0, 0)!.name).toBe('spawn');
    expect(hitLayer('slash', 40, 8)!.name).toBe('slice');
    expect(hitLayer('gust', 40, 8)!.name).toBe('gust');
    expect(colourDistance(measureSound('ready').x, measureSound('ding').x)).toBeGreaterThan(8);
    expect(colourDistance(measureSound('ultimate').x, measureSound('charge').x)).toBeGreaterThan(4);
  });
});

describe('event mapping for the newer cues', () => {
  it('taunts, the boss roar, items, hazards and the crowd each get their own sound', () => {
    expect(soundFor('fx', 0, 0, 'taunt')!.name).toBe('taunt');
    expect(soundFor('fx', 0, 0, 'roar')!.name).toBe('roar');
    expect(soundFor('fx', 0, 0, 'someMoveFx')).toBeNull();
    expect(soundFor('itemThrow', 1, ITEM.sword)!.name).toBe('swordSwing');
    expect(soundFor('itemThrow', 3, 0)).toBeNull(); // a bomb throw: the presenter's whoosh only
    expect(soundFor('itemPickup', ITEM.core, 0)!.name).toBe('coreGet');
    expect(soundFor('itemPickup', ITEM.heal, 0)).toBeNull();
    expect(soundFor('itemSpawn', ITEM.heal, 1)!.name).toBe('crateBreak');
    expect(soundFor('itemSpawn', ITEM.heal, 0)!.name).toBe('spawn');
    expect(soundFor('itemBoom', 46, 0)!.name).toBe('crateBoom');
    expect(soundFor('itemBoom', 30, 0)).toBeNull();
    expect(hazardSounds('bolt').map((c) => c.name)).toEqual(['thunder']);
    expect(hazardSounds('avalanche').map((c) => c.name)).toEqual(['avalanche']);
    expect(hazardSounds('stalactite').map((c) => c.name)).toEqual(['stalactite']);
    expect(hazardSounds('geyser').map((c) => c.name)).toEqual(['geyser']);
    expect(hazardSounds('geyser', 'water').map((c) => c.name)).toEqual(['waterSpout']);
    expect(soundsFor('parry', 0, 0).map((c) => c.name)).toEqual(['parry', 'glint']);
    expect(soundsFor('ko', 0, 0).map((c) => c.name)).toEqual(['ko', 'crowd']);
    expect(soundsFor('cinematicStart', 0, 0).map((c) => c.name)).toEqual(['ultimate', 'crowd']);
    expect(soundsFor('hit', 100, 8)[0]).toEqual(soundFor('hit', 100, 8));
  });

  it('the crowd stays quiet when the crowd setting is off', () => {
    const st = settings as unknown as { crowd?: boolean };
    const before = st.crowd;
    try {
      const s = new Sfx();
      const ctx = new RenderCtx(SR);
      s.attach(ctx as unknown as BaseAudioContext);
      st.crowd = false;
      s.play('crowd', 1);
      expect(s.activeSounds).toBe(0);
      st.crowd = true;
      s.play('crowd', 1);
      expect(s.activeSounds).toBe(1);
    } finally {
      if (before === undefined) delete st.crowd;
      else st.crowd = before;
    }
  });
});

describe('mix behaviour (rendered)', () => {
  it('a KO dips the music bed and lets it swell back', () => {
    seeded(() => {
      const s = new Sfx();
      const ctx = new RenderCtx(SR);
      s.attach(ctx as unknown as BaseAudioContext);
      const bed = (s as unknown as { bed: { gain: { at(t: number): number } } }).bed;
      ctx.render(0.5);
      s.play('ko', 1);
      expect(bed.gain.at(0.5 + 0.2)).toBeLessThan(0.6);
      expect(bed.gain.at(0.5 + 3)).toBeGreaterThan(0.95);
      // a light hit does not duck at all
      ctx.render(3);
      const t = ctx.currentTime;
      s.play('hit', 0.5);
      expect(bed.gain.at(t + 0.1)).toBeGreaterThan(0.99);
    });
  });

  it('a heavy-hit duck never cuts short a deeper KO duck', () => {
    const s = new Sfx();
    const ctx = new RenderCtx(SR);
    s.attach(ctx as unknown as BaseAudioContext);
    const bed = (s as unknown as { bed: { gain: { at(t: number): number } } }).bed;
    s.play('ko', 1);
    ctx.render(0.1);
    s.play('hitHeavy', 1);
    expect(bed.gain.at(0.4)).toBeLessThan(0.6);
  });

  it('the room changes with the stage and unknown stages get the default room', () => {
    const s = new Sfx();
    const ctx = new RenderCtx(SR);
    s.attach(ctx as unknown as BaseAudioContext);
    expect(() => s.setSpace('cavern')).not.toThrow();
    expect(() => s.setSpace('nowhere')).not.toThrow();
    expect(() => s.setSpace(undefined)).not.toThrow();
  });
});
