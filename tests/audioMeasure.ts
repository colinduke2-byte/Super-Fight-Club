/**
 * Shared "listening" helpers for the audio tests: render one sound, one pass of a track, a fanfare or a stretch of
 * ambience with the offline renderer and measure it. The game's own mix graph is used, with the master compressor /
 * clipper bypassed so the numbers describe the material itself (dry, at full volume).
 */
import { Ambience } from '../src/audio/ambience';
import { Music, STINGS, loopSeconds, type StingId } from '../src/audio/music';
import { SOUND_SPAN, Sfx, sfx, type AudioStyle } from '../src/audio/sfx';
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
function dry(s: Sfx, sr = SR): RenderCtx {
  const ctx = new RenderCtx(sr);
  s.attach(ctx as unknown as BaseAudioContext);
  const mix = (s as unknown as { mix: { disconnect(): void; connect(n: unknown): void } }).mix;
  mix.disconnect();
  mix.connect(ctx.destination);
  return ctx;
}

function measure(x: Float32Array, sr = SR): Measured {
  const l = lufs(x, sr);
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
      // long sounds get room to ring out fully (their span plus a margin), short ones a little over a second
      const span = SOUND_SPAN[name] ?? (name === 'shieldBreak' || name === 'charge' ? 1.4 : 0.6);
      return measure(ctx.render(Math.max(1.2, span + 0.6)));
    }, seed);
  } finally {
    restore();
  }
}

/**
 * One full pass of a track's song (two and a half minutes or more), played by the real scheduler. Rendered at 24 kHz by
 * default: the songs are long, and nothing in the music sits above 12 kHz that the loudness or the peak would miss.
 */
export function measureTrack(id: string, sr = 24000): Measured {
  const restore = fullVolume();
  try {
    return seeded(() => {
      const ctx = dry(sfx, sr);
      const m = new Music();
      m.play(id);
      const x = ctx.render(loopSeconds(TRACKS[id]) + 0.3, () => m.tick());
      m.stop();
      return measure(x, sr);
    });
  } finally {
    restore();
  }
}

/** A victory fanfare (or 'lose', or a sting such as 'overseerDown' / 'bossClear'). */
export function measureFanfare(who: string): Measured {
  const restore = fullVolume();
  try {
    return seeded(() => {
      const ctx = dry(sfx);
      if (who in STINGS) new Music().sting(who as StingId);
      else new Music().jingle(who === 'lose' ? 'lose' : 'win', who);
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
