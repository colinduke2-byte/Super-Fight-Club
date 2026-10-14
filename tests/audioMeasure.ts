/**
 * Shared "listening" helpers for the audio tests: render one sound, one pass of a track, a fanfare or a stretch of
 * ambience with the offline renderer and measure it. The game's own mix graph is used, with the master compressor /
 * clipper bypassed so the numbers describe the material itself (dry, at full volume).
 */
import { Ambience } from '../src/audio/ambience';
import { Music, loopSeconds } from '../src/audio/music';
import { Sfx, sfx, type AudioStyle } from '../src/audio/sfx';
import type { SoundName } from '../src/audio/soundMap';
import { TRACKS } from '../src/audio/tracks';
import { settings } from '../src/settings';
import { RenderCtx, audibleSpan, bandProfile, lufs, peakDb, seeded } from './audioRender';

export const SR = 48000;

export interface Measured {
  peak: number;
  momentary: number;
  integrated: number;
  x: Float32Array;
}

function fullVolume(): () => void {
  const before = { m: settings.masterVolume, s: settings.sfxVolume, mu: settings.musicVolume, a: settings.ambience };
  settings.masterVolume = 1;
  settings.sfxVolume = 1;
  settings.musicVolume = 1;
  settings.ambience = true;
  return () => {
    settings.masterVolume = before.m;
    settings.sfxVolume = before.s;
    settings.musicVolume = before.mu;
    settings.ambience = before.a;
  };
}

/** Attach a synth to a fresh render context with the master dynamics bypassed. */
function dry(s: Sfx): RenderCtx {
  const ctx = new RenderCtx(SR);
  s.attach(ctx as unknown as BaseAudioContext);
  const mix = (s as unknown as { mix: { disconnect(): void; connect(n: unknown): void } }).mix;
  mix.disconnect();
  mix.connect(ctx.destination);
  return ctx;
}

function measure(x: Float32Array): Measured {
  const l = lufs(x, SR);
  return { peak: peakDb(x), momentary: l.momentary, integrated: l.integrated, x };
}

/** One sound at the given intensity (deterministic randomness). Long sounds get a longer render. */
export function measureSound(name: SoundName, style: AudioStyle = 'plain', intensity = 1, seed = 1): Measured {
  const restore = fullVolume();
  try {
    return seeded(() => {
      const s = new Sfx();
      const ctx = dry(s);
      s.play(name, intensity, 0, style);
      const long = name === 'ko' || name === 'ultimate' || name === 'shieldBreak' || name === 'charge';
      return measure(ctx.render(long ? 2 : 1.2));
    }, seed);
  } finally {
    restore();
  }
}

/** One full pass of a track's arranged song, played by the real scheduler. */
export function measureTrack(id: string): Measured {
  const restore = fullVolume();
  try {
    return seeded(() => {
      const ctx = dry(sfx);
      const m = new Music();
      m.play(id);
      const x = ctx.render(loopSeconds(TRACKS[id]) + 0.3, () => m.tick());
      m.stop();
      return measure(x);
    });
  } finally {
    restore();
  }
}

/** A victory fanfare (or 'lose'). */
export function measureFanfare(who: string): Measured {
  const restore = fullVolume();
  try {
    return seeded(() => {
      const ctx = dry(sfx);
      new Music().jingle(who === 'lose' ? 'lose' : 'win', who);
      return measure(ctx.render(3));
    });
  } finally {
    restore();
  }
}

/** A stage's ambience for `seconds`. */
export function measureScape(theme: string, seconds = 20): Measured {
  const restore = fullVolume();
  try {
    return seeded(() => {
      const ctx = dry(sfx);
      const a = new Ambience();
      a.start(theme);
      const x = ctx.render(seconds, () => a.update());
      a.stop();
      return measure(x);
    });
  } finally {
    restore();
  }
}

export { audibleSpan, bandProfile };
