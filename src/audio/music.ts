import { settings } from '../settings';
import { sfx } from './sfx';
import { LOOP_STEPS, TRACKS, midiToHz, stepEvents, type MusicEvent, type Track } from './tracks';

const LOOKAHEAD = 0.14; // seconds scheduled ahead
const TICK_MS = 30;
const BASE_GAIN = 0.2;

/**
 * Looping chiptune player. A timer schedules sixteenth-notes slightly ahead of the audio clock (the standard
 * WebAudio lookahead pattern) so timing stays steady even when the render loop stutters. Uses the SFX context.
 */
/** A short victory theme: [midi, sixteenths] notes (midi 0 = rest), step length in seconds, lead wave, harmony interval. */
interface Fanfare {
  notes: [number, number][];
  step: number;
  wave: OscillatorType;
  harmony: number;
  drums?: boolean;
}

const LOSE: Fanfare = { notes: [[69, 2], [68, 2], [67, 2], [66, 2], [65, 8]], step: 0.13, wave: 'square', harmony: 3 };

/** Every fighter's victory theme, in the spirit of their moveset. */
export const FANFARES: Record<string, Fanfare> = {
  default: { notes: [[72, 1], [76, 1], [79, 1], [84, 2], [79, 1], [84, 1], [88, 3], [86, 1], [88, 6]], step: 0.085, wave: 'square', harmony: 7, drums: true },
  // a stomping march, low and square
  brick: { notes: [[60, 2], [60, 1], [60, 1], [67, 2], [0, 1], [65, 1], [64, 2], [62, 2], [60, 6]], step: 0.11, wave: 'square', harmony: -5, drums: true },
  // a sly minor run that snaps up at the end
  vex: { notes: [[69, 1], [72, 1], [76, 1], [75, 1], [76, 1], [0, 1], [81, 1], [84, 1], [88, 5]], step: 0.075, wave: 'sawtooth', harmony: 0 },
  // sparkling arpeggios rising through the octaves
  nova: { notes: [[72, 1], [76, 1], [79, 1], [83, 1], [84, 1], [88, 1], [91, 1], [95, 1], [96, 6]], step: 0.08, wave: 'triangle', harmony: 12 },
  // bleeps and a cheeky beep-boop
  gizmo: { notes: [[84, 1], [0, 1], [84, 1], [79, 1], [88, 1], [0, 1], [91, 1], [72, 1], [96, 2], [91, 4]], step: 0.07, wave: 'square', harmony: 0 },
  // a blazing horn call with drums
  agni: { notes: [[62, 1], [62, 1], [69, 2], [67, 1], [69, 1], [74, 2], [72, 1], [74, 1], [78, 6]], step: 0.09, wave: 'sawtooth', harmony: 7, drums: true },
  // wide soaring leaps
  halcyon: { notes: [[67, 2], [74, 2], [79, 3], [78, 1], [79, 2], [86, 2], [91, 6]], step: 0.09, wave: 'triangle', harmony: 7 },
  // a slow, booming march down in the bedrock, ending on a ringing crystal chord
  obelisk: { notes: [[48, 3], [0, 1], [48, 2], [51, 2], [55, 3], [0, 1], [53, 2], [60, 6]], step: 0.1, wave: 'square', harmony: 7, drums: true },
  // a rolling sea-shanty phrase
  riptide: { notes: [[62, 1], [62, 1], [62, 1], [0, 1], [62, 1], [65, 1], [69, 2], [67, 1], [65, 1], [64, 1], [62, 5]], step: 0.09, wave: 'square', harmony: 4, drums: true },
};

export class Music {
  private timer: number | null = null;
  private track: Track | null = null;
  private step = 0;
  private nextTime = 0;
  private bus: GainNode | null = null;
  private busCtx: AudioContext | null = null;
  private duck = 1;
  private current = '';
  /** The loop stays silent until this audio time (a jingle is playing). */
  private holdUntil = 0;

  /** Start a track by id (no-op if it is already playing). Waits quietly for the first user gesture. */
  play(id: string): void {
    if (id === this.current && this.timer !== null) return;
    this.current = id;
    this.track = TRACKS[id] ?? null;
    this.step = 0;
    this.nextTime = 0;
    if (this.timer === null) this.timer = window.setInterval(() => this.pump(), TICK_MS);
  }

  stop(): void {
    this.current = '';
    this.track = null;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One-shot fanfare over a held loop: the winner's own victory theme (or a generic flourish), a falling minor phrase for a loss. */
  jingle(kind: 'win' | 'lose', who?: string): void {
    const ctx = sfx.context;
    if (!ctx) return;
    const bus = this.ensureBus(ctx);
    bus.gain.value = settings.masterVolume * settings.musicVolume * BASE_GAIN * this.duck;
    const f: Fanfare = kind === 'lose' ? LOSE : (who && FANFARES[who]) || FANFARES.default;
    let at = ctx.currentTime + 0.05;
    for (const [m, len] of f.notes) {
      const d = f.step * len;
      if (m > 0) {
        this.osc(ctx, bus, f.wave, midiToHz(m), at, d * 0.92, 0.5);
        if (f.harmony) this.osc(ctx, bus, f.wave, midiToHz(m + f.harmony), at, d * 0.92, 0.18);
        this.osc(ctx, bus, 'triangle', midiToHz(m - 24), at, d * 0.95, 0.9);
        if (f.drums && len >= 2) this.noise(ctx, bus, at, 0.12, 0.4, 1200);
      }
      at += d;
    }
    this.holdUntil = at + 0.4;
  }

  /** Quieten the music (e.g. while paused). */
  setDuck(d: number): void {
    this.duck = d;
  }

  private ensureBus(ctx: AudioContext): GainNode {
    if (!this.bus || this.busCtx !== ctx) {
      this.bus = ctx.createGain();
      this.bus.connect(ctx.destination);
      this.busCtx = ctx;
    }
    return this.bus;
  }

  private pump(): void {
    const ctx = sfx.context;
    const t = this.track;
    if (!ctx || !t) return;
    const bus = this.ensureBus(ctx);
    bus.gain.value = settings.masterVolume * settings.musicVolume * BASE_GAIN * this.duck;
    if (bus.gain.value <= 0) {
      this.nextTime = 0; // muted: do not build a backlog, just resync when audible again
      return;
    }
    const stepDur = 60 / t.bpm / 4;
    if (ctx.currentTime < this.holdUntil) {
      this.nextTime = this.holdUntil;
      return;
    }
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      for (const e of stepEvents(t, this.step)) this.voice(ctx, bus, e, this.nextTime, stepDur);
      this.step = (this.step + 1) % LOOP_STEPS;
      this.nextTime += stepDur;
    }
  }

  private osc(ctx: AudioContext, bus: AudioNode, type: OscillatorType, hz: number, at: number, dur: number, vol: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(bus);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private noise(ctx: AudioContext, bus: AudioNode, at: number, dur: number, vol: number, hp: number): void {
    const buf = sfx.noiseBuffer;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  private voice(ctx: AudioContext, bus: AudioNode, e: MusicEvent, at: number, stepDur: number): void {
    switch (e.voice) {
      case 'lead':
        this.osc(ctx, bus, 'square', midiToHz(e.midi), at, stepDur * e.steps * 0.9, 0.5);
        break;
      case 'arp':
        this.osc(ctx, bus, 'square', midiToHz(e.midi), at, stepDur * 0.7, 0.2);
        break;
      case 'bass':
        this.osc(ctx, bus, 'triangle', midiToHz(e.midi), at, stepDur * e.steps * 0.95, 0.9);
        break;
      case 'kick': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(150, at);
        o.frequency.exponentialRampToValueAtTime(40, at + 0.12);
        g.gain.setValueAtTime(0.9, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
        o.connect(g).connect(bus);
        o.start(at);
        o.stop(at + 0.17);
        break;
      }
      case 'snare':
        this.noise(ctx, bus, at, 0.12, 0.5, 1200);
        break;
      case 'hat':
        this.noise(ctx, bus, at, 0.04, 0.25, 7000);
        break;
    }
  }
}

export const music = new Music();
