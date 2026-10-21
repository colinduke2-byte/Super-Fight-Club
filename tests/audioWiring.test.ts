import { describe, expect, it } from 'vitest';
import { fallbackFor, koLine, voiceScore, voiceTuning } from '../src/audio/announcer';
import { Footsteps, type StepSource } from '../src/audio/footsteps';
import { Music, loopSeconds } from '../src/audio/music';
import { Sfx, VOICES, AUDIO_STYLES, sfx } from '../src/audio/sfx';
import { SOUND_NAMES } from '../src/audio/soundMap';
import { TRACKS, songSteps, stepEvents } from '../src/audio/tracks';
import { Match } from '../src/engine/match';
import type { Fighter } from '../src/engine/fighter';
import type { World } from '../src/engine/world';
import { flawlessWin, koEndsMatch, styleOf } from '../src/audio/matchCalls';
import { settings } from '../src/settings';
import { RenderCtx } from './audioRender';

describe('announcer voice and fallback', () => {
  it('the key calls have a synth fallback word, other lines are skipped', () => {
    expect(fallbackFor('Ready?')).toBe('callReady');
    expect(fallbackFor('Go!')).toBe('callGo');
    expect(fallbackFor('Game!')).toBe('callGame');
    expect(fallbackFor('Time!')).toBe('callTime');
    for (const n of [1, 2, 3, 4]) expect(fallbackFor(koLine(n)), koLine(n)).toBe('callKo');
    for (const l of ['Knockout!', 'Smashed!', 'Sent flying!']) expect(fallbackFor(l)).toBe('callKo');
    expect(fallbackFor('Brick wins!')).toBeNull();
    expect(fallbackFor('one')).toBeNull();
    for (const n of ['callReady', 'callGo', 'callGame', 'callTime', 'callKo'] as const) expect(SOUND_NAMES).toContain(n);
  });

  it('picks a deep English voice, never a novelty one, the same way on every system', () => {
    const voices = [
      { name: 'Samantha', lang: 'en-US', localService: true },
      { name: 'Zarvox', lang: 'en-US', localService: true },
      { name: 'Daniel', lang: 'en-GB', localService: true },
      { name: 'Thomas', lang: 'fr-FR', localService: true },
      { name: 'Google UK English Male', lang: 'en-GB', localService: false },
      { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true },
    ];
    const best = (vs: typeof voices): string => [...vs].map((v) => ({ v, s: voiceScore(v) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s || a.v.name.localeCompare(b.v.name))[0].v.name;
    // a local deep voice (no network round trip) is as good as the best remote one, and the name settles a tie
    expect(best(voices)).toBe('Daniel');
    expect(best(voices.filter((v) => v.name !== 'Daniel'))).toBe('Google UK English Male');
    expect(best(voices.filter((v) => v.name !== 'Daniel' && !v.name.startsWith('Google')))).toMatch(/^Microsoft David/);
    expect(voiceScore({ name: 'Zarvox', lang: 'en-US' })).toBeLessThan(0);
    // an English voice of any kind beats a voice in another language
    expect(voiceScore({ name: 'Samantha', lang: 'en-US' })).toBeGreaterThan(voiceScore({ name: 'Thomas', lang: 'fr-FR' }));
    // a deep voice is not pushed lower still; a neutral one is
    expect(voiceTuning({ name: 'Daniel' }).pitch).toBeGreaterThan(voiceTuning({ name: 'Samantha' }).pitch);
    expect(voiceTuning(null).rate).toBeGreaterThan(0.9);
  });
});

describe('fighter voices', () => {
  it('every flavour has a voice, the Overseer the deepest and a robot ring', () => {
    for (const st of AUDIO_STYLES) expect(VOICES[st], st).toBeDefined();
    const f0s = AUDIO_STYLES.map((s) => VOICES[s].f0);
    expect(VOICES.overseer.f0).toBe(Math.min(...f0s));
    expect(VOICES.overseer.ring).toBeGreaterThan(0);
  });

  it('the boss machine (a mechanical colossus) gets its own set; others use their fx style', () => {
    const fake = (weight: number, sound?: string): Fighter => ({ stats: { weight }, data: { fx: sound ? { sound } : undefined } }) as unknown as Fighter;
    expect(styleOf(fake(260, 'mech'))).toBe('overseer');
    expect(styleOf(fake(90, 'mech'))).toBe('mech');
    expect(styleOf(fake(90, 'overseer'))).toBe('overseer');
    expect(styleOf(fake(120, 'heavy'))).toBe('heavy');
    expect(styleOf(fake(100))).toBe('plain');
    expect(styleOf(undefined)).toBe('plain');
  });

  it('voices can be switched off (a menu setting, on by default)', () => {
    const st = settings as unknown as { voices?: boolean };
    const before = st.voices;
    try {
      const s = new Sfx();
      s.attach(new RenderCtx(24000) as unknown as BaseAudioContext);
      st.voices = false;
      s.play('voxHurt', 1, 0, 'heavy');
      expect(s.activeSounds).toBe(0);
      st.voices = true;
      s.play('voxHurt', 1, 0, 'heavy');
      expect(s.activeSounds).toBe(1);
    } finally {
      if (before === undefined) delete st.voices;
      else st.voices = before;
    }
  });
});

describe('KO calls', () => {
  const world = (teams: number[]): { w: World; fs: Fighter[] } => {
    const fs = teams.map((team, id) => ({ id, team, damage: 0 }) as unknown as Fighter);
    return { w: { fighters: fs, tick: 0 } as unknown as World, fs };
  };
  it('knows the KO that ends the match, and a flawless win', () => {
    const { w, fs } = world([-1, -1]);
    const m = new Match(w, { mode: 'stock', stocks: 2, timeLimitSec: 60, respawnDelay: 10 });
    m.onKo(fs[1], 0);
    expect(koEndsMatch(m, fs, fs[1])).toBe(false);
    m.onKo(fs[1], 0);
    expect(koEndsMatch(m, fs, fs[1])).toBe(true);
    expect(flawlessWin(m, fs)).toBe(true);
    const b = world([-1, -1]);
    const m2 = new Match(b.w, { mode: 'stock', stocks: 2, timeLimitSec: 60, respawnDelay: 10 });
    m2.onKo(b.fs[0], 1);
    m2.onKo(b.fs[1], 0);
    m2.onKo(b.fs[1], 0);
    expect(koEndsMatch(m2, b.fs, b.fs[1])).toBe(true);
    expect(flawlessWin(m2, b.fs)).toBe(false);
  });
  it('teams: the match ends when one team is left', () => {
    const { w, fs } = world([0, 0, 1]);
    const m = new Match(w, { mode: 'stock', stocks: 1, timeLimitSec: 60, respawnDelay: 10 });
    m.onKo(fs[2], 0);
    expect(koEndsMatch(m, fs, fs[2])).toBe(true);
    // one stock each: only an untouched winner is "perfect"
    fs[0].damage = 30;
    expect(flawlessWin(m, fs)).toBe(false);
  });
});

describe('footsteps', () => {
  it('a runner on the ground steps about four times a second; nobody standing still or in the air does', () => {
    const s = new Sfx();
    const ctx = new RenderCtx(24000);
    s.attach(ctx as unknown as BaseAudioContext);
    const play = sfx.play.bind(sfx);
    const played: string[] = [];
    (sfx as unknown as { play: typeof sfx.play }).play = (name) => {
      played.push(name);
    };
    try {
      const runner = { x: 0, h: 36, vx: 2, grounded: true, state: 'run', stats: { weight: 100 } } as unknown as Fighter;
      const idle = { x: 0, h: 36, vx: 0, grounded: true, state: 'idle', stats: { weight: 100 } } as unknown as Fighter;
      const air = { x: 0, h: 36, vx: 3, grounded: false, state: 'run', stats: { weight: 100 } } as unknown as Fighter;
      let tick = 0;
      const src: StepSource = { fighters: [runner, idle, air], stageId: 'reactor', tick: () => tick, pan: () => 0 };
      const fs = new Footsteps();
      fs.attach(src);
      for (let i = 0; i < 60; i++) {
        tick++;
        fs.update();
      }
      expect(played.length).toBeGreaterThanOrEqual(3);
      expect(played.length).toBeLessThanOrEqual(6);
      expect(new Set(played)).toEqual(new Set(['stepMetal']));
      // a paused sim (the clock does not move) takes no steps
      const n = played.length;
      for (let i = 0; i < 30; i++) fs.update();
      expect(played.length).toBe(n);
      fs.detach(src);
      tick += 60;
      expect(fs.update()).toBe(0);
    } finally {
      (sfx as unknown as { play: typeof sfx.play }).play = play;
    }
  });
});

describe('music scheduling', () => {
  it('the scheduler walks the whole song and wraps to the top', () => {
    const ctx = new RenderCtx(8000);
    sfx.attach(ctx as unknown as BaseAudioContext);
    const m = new Music();
    const t = TRACKS.story;
    m.play('story');
    // render a little: notes are scheduled ahead of the clock, step by step
    ctx.render(2, () => m.tick());
    const step = (m as unknown as { step: number }).step;
    const expected = Math.floor((2 + 0.14 - 0.05) / (60 / t.bpm / 4));
    expect(Math.abs(step - expected)).toBeLessThanOrEqual(2);
    // jump to the end of the song: the next steps wrap to the intro
    (m as unknown as { step: number }).step = songSteps(t) - 1;
    ctx.render(0.5, () => m.tick());
    expect((m as unknown as { step: number }).step).toBeLessThan(20);
    m.stop();
    expect(loopSeconds(t)).toBeCloseTo((songSteps(t) * 60) / t.bpm / 4, 6);
    expect(stepEvents(t, songSteps(t))).toEqual(stepEvents(t, 0));
  });

  it('a second fanfare replaces one still playing instead of piling on it', () => {
    const ctx = new RenderCtx(8000);
    sfx.attach(ctx as unknown as BaseAudioContext);
    const m = new Music();
    m.play('results');
    m.jingle('win', 'brick');
    const first = (m as unknown as { bus: unknown }).bus;
    ctx.render(0.3);
    m.sting('bossClear', 'results');
    expect((m as unknown as { bus: unknown }).bus).not.toBe(first);
    m.stop();
  });
});
