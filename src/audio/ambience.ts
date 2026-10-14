import { settings } from '../settings';
import { sfx, unit } from './sfx';

/** A continuous noise or drone layer under a stage's music. */
interface Bed {
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  gain: number;
  /** Slow swell: the level rises and falls by `depth` every `period` seconds (surf, wind gusts). */
  swell?: { period: number; depth: number };
  /** A low oscillator drone instead of noise. */
  drone?: { type: OscillatorType; hz: number };
}

/** One-shot sounds dropped in at random, about every `every` seconds. */
type Event = 'thunder' | 'bird' | 'gull' | 'creak' | 'hiss' | 'chime' | 'drip';

interface Scape {
  beds: Bed[];
  events: { kind: Event; every: number }[];
}

/** Per-backdrop ambience; quiet enough to sit under the music and the fight. */
const SCAPES: Record<string, Scape> = {
  storm: {
    beds: [
      { filter: 'highpass', freq: 3200, gain: 0.05 }, // rain
      { filter: 'lowpass', freq: 220, gain: 0.05, swell: { period: 7, depth: 0.6 } }, // wind
    ],
    events: [{ kind: 'thunder', every: 9 }],
  },
  tide: {
    beds: [
      { filter: 'lowpass', freq: 600, gain: 0.08, swell: { period: 6.5, depth: 0.85 } }, // surf rolling in and out
      { filter: 'bandpass', freq: 2400, q: 0.6, gain: 0.015, swell: { period: 6.5, depth: 0.9 } }, // foam hiss on the break
    ],
    events: [
      { kind: 'gull', every: 11 },
      { kind: 'creak', every: 8 },
    ],
  },
  reactor: {
    beds: [
      { filter: 'lowpass', freq: 160, gain: 0.04, drone: { type: 'sawtooth', hz: 55 } }, // the core's hum
      { filter: 'bandpass', freq: 900, q: 0.8, gain: 0.02, swell: { period: 4, depth: 0.5 } },
    ],
    events: [{ kind: 'hiss', every: 7 }],
  },
  temple: {
    beds: [{ filter: 'bandpass', freq: 700, q: 0.5, gain: 0.025, swell: { period: 9, depth: 0.5 } }],
    events: [{ kind: 'bird', every: 4 }],
  },
  dawn: {
    beds: [{ filter: 'lowpass', freq: 420, gain: 0.05, swell: { period: 8, depth: 0.7 } }], // high-altitude wind
    events: [{ kind: 'bird', every: 7 }],
  },
  void: {
    beds: [{ filter: 'lowpass', freq: 120, gain: 0.03, drone: { type: 'sine', hz: 41 } }],
    events: [{ kind: 'chime', every: 10 }],
  },
  frost: {
    beds: [
      { filter: 'bandpass', freq: 900, q: 0.5, gain: 0.03, swell: { period: 6, depth: 0.8 } }, // gusts over the ridge
      { filter: 'lowpass', freq: 200, gain: 0.025, swell: { period: 13, depth: 0.5 } },
    ],
    events: [{ kind: 'chime', every: 6 }],
  },
  airship: {
    beds: [
      { filter: 'lowpass', freq: 380, gain: 0.06, swell: { period: 5, depth: 0.5 } }, // rushing air past the hull
      { filter: 'bandpass', freq: 160, q: 0.8, gain: 0.03, drone: { type: 'sawtooth', hz: 48 } }, // the engines
    ],
    events: [
      { kind: 'creak', every: 7 },
      { kind: 'thunder', every: 12 },
    ],
  },
  cavern: {
    beds: [
      { filter: 'lowpass', freq: 140, gain: 0.05, swell: { period: 11, depth: 0.5 } }, // the deep rumble of the rock
      { filter: 'bandpass', freq: 520, q: 0.4, gain: 0.012, swell: { period: 7, depth: 0.6 } }, // air moving in the tunnels
    ],
    events: [
      { kind: 'drip', every: 1.6 },
      { kind: 'chime', every: 8 },
    ],
  },
  skyline: {
    beds: [{ filter: 'lowpass', freq: 300, gain: 0.03, swell: { period: 10, depth: 0.6 } }],
    events: [],
  },
};

interface Live {
  gain: GainNode;
  bed: Bed;
  src: AudioScheduledSourceNode;
  nodes: AudioNode[];
}

/** Seconds between envelope updates (the swells are many seconds long; 60 automation events a second is waste). */
const UPDATE_EVERY = 0.1;

/**
 * Stage ambience: looped filtered noise and drones from the SFX context (no assets), plus occasional one-shots. Call
 * `update` every frame; it starts lazily once audio is unlocked and follows the SFX volume. Purely cosmetic: nothing
 * here touches the simulation, so randomness is fine.
 */
export class Ambience {
  private theme = '';
  private live: Live[] = [];
  private out: GainNode | null = null;
  private outCtx: BaseAudioContext | null = null;
  private next: number[] = [];
  private level = 1;
  private lastUpdate = -1;
  private lastTarget = -1;

  start(theme: string | undefined): void {
    this.stop();
    this.theme = theme ?? 'skyline';
  }

  /** Fade the beds out (a hard stop of a running noise loop clicks) and free them. */
  stop(): void {
    const out = this.out;
    const ctx = this.outCtx;
    const live = this.live;
    this.live = [];
    this.out = null;
    this.outCtx = null;
    this.theme = '';
    this.lastUpdate = -1;
    this.lastTarget = -1;
    if (!out || !ctx) return;
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.linearRampToValueAtTime(0, t + 0.12);
    for (const l of live) {
      try {
        l.src.stop(t + 0.15);
      } catch {
        // already stopped
      }
      l.src.onended = () => {
        for (const n of l.nodes) n.disconnect();
      };
    }
    const drop = (): void => out.disconnect();
    if (typeof window !== 'undefined') window.setTimeout(drop, 400);
    else drop();
  }

  /** 1 normally; lower while paused. */
  setLevel(k: number): void {
    this.level = unit(k);
  }

  update(): void {
    const scape = SCAPES[this.theme];
    const ctx = sfx.context;
    const noise = sfx.noiseBuffer;
    if (!scape || !ctx || !noise) return;
    if (!this.out || this.outCtx !== ctx) {
      if (!this.build(ctx, noise, scape)) return;
    }
    const out = this.out!;
    const t = ctx.currentTime;
    if (t - this.lastUpdate < UPDATE_EVERY) return;
    this.lastUpdate = t;
    const target = settings.ambience ? sfx.syncVolume() * this.level : 0;
    if (target !== this.lastTarget) {
      out.gain.setTargetAtTime(target, t, 0.2);
      this.lastTarget = target;
    }
    for (const l of this.live) {
      const s = l.bed.swell;
      if (!s) continue;
      const k = 1 - s.depth * (0.5 + 0.5 * Math.cos((t / s.period) * Math.PI * 2));
      l.gain.gain.setTargetAtTime(l.bed.gain * k, t, 0.1);
    }
    if (this.level < 1 || !settings.ambience) return;
    scape.events.forEach((e, i) => {
      if (t < this.next[i]) return;
      this.next[i] = t + e.every * (0.6 + Math.random() * 0.8);
      this.oneShot(ctx, noise, out, e.kind);
    });
  }

  private build(ctx: BaseAudioContext, noise: AudioBuffer, scape: Scape): boolean {
    const dest = sfx.output;
    if (!dest) return false;
    this.out = ctx.createGain();
    this.outCtx = ctx;
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.next = scape.events.map((e) => ctx.currentTime + e.every * (0.3 + Math.random() * 0.7));
    for (const bed of scape.beds) {
      let src: AudioScheduledSourceNode;
      if (bed.drone) {
        const o = ctx.createOscillator();
        o.type = bed.drone.type;
        o.frequency.value = bed.drone.hz;
        src = o;
      } else {
        const b = ctx.createBufferSource();
        b.buffer = noise;
        b.loop = true;
        b.playbackRate.value = 0.9 + Math.random() * 0.2;
        src = b;
      }
      const f = ctx.createBiquadFilter();
      f.type = bed.filter;
      f.frequency.value = bed.freq;
      f.Q.value = bed.q ?? 0.7;
      const g = ctx.createGain();
      // beds without a swell sit at a fixed level; the master `out` gain does the fade-in
      g.gain.value = bed.swell ? 0 : bed.gain;
      src.connect(f).connect(g).connect(this.out);
      if (src instanceof AudioBufferSourceNode) src.start(ctx.currentTime, Math.random() * noise.duration);
      else src.start(ctx.currentTime);
      this.live.push({ gain: g, bed, src, nodes: [src, f, g] });
    }
    return true;
  }

  private oneShot(ctx: BaseAudioContext, noise: AudioBuffer, out: AudioNode, kind: Event): void {
    const t = ctx.currentTime;
    const env = (g: GainNode, peak: number, attack: number, dur: number, at = t): void => {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    };
    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, peak: number, at = t): void => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      env(g, peak, Math.min(0.02, dur / 4), dur, at);
      o.connect(g).connect(out);
      o.onended = () => g.disconnect();
      o.start(at);
      o.stop(at + dur + 0.05);
    };
    const rumble = (freq: number, dur: number, peak: number, attack: number): void => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      const g = ctx.createGain();
      env(g, peak, attack, dur);
      s.connect(f).connect(g).connect(out);
      s.onended = () => g.disconnect();
      s.start(t, Math.random() * noise.duration);
      s.stop(t + dur + 0.05);
    };
    switch (kind) {
      case 'thunder':
        rumble(140, 3.2, 0.22, 0.25);
        rumble(420, 0.9, 0.06, 0.02);
        break;
      case 'creak':
        // timbers groaning: a slow, wobbling low square
        tone('square', 70 + Math.random() * 30, 55, 0.7, 0.012);
        tone('triangle', 140, 120, 0.5, 0.01, t + 0.2);
        break;
      case 'gull': {
        const f = 1500 + Math.random() * 400;
        for (let i = 0; i < 3; i++) tone('triangle', f, f * 0.7, 0.16, 0.012, t + i * 0.22);
        break;
      }
      case 'bird': {
        const f = 2400 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) tone('sine', f, f * (Math.random() > 0.5 ? 1.3 : 0.8), 0.07, 0.012, t + i * 0.11);
        break;
      }
      case 'hiss': {
        const s = ctx.createBufferSource();
        s.buffer = noise;
        s.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 2600;
        const g = ctx.createGain();
        env(g, 0.03, 0.08, 1.1);
        s.connect(f).connect(g).connect(out);
        s.onended = () => g.disconnect();
        s.start(t, Math.random() * noise.duration);
        s.stop(t + 1.2);
        break;
      }
      case 'drip': {
        // a drop landing in a pool: a quick falling blip with a short echo
        const f = 1400 + Math.random() * 900;
        tone('sine', f, f * 0.45, 0.09, 0.02);
        tone('sine', f * 0.9, f * 0.4, 0.08, 0.008, t + 0.18);
        break;
      }
      case 'chime':
        tone('sine', 1760, 1750, 1.4, 0.01);
        tone('sine', 2637, 2630, 1.1, 0.006, t + 0.05);
        break;
    }
  }
}

export const ambience = new Ambience();
