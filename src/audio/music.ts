import { settings } from '../settings';
import { sfx, unit } from './sfx';
import { TRACKS, midiToHz, songSteps, stepEvents, type MusicEvent, type Track } from './tracks';

const LOOKAHEAD = 0.14; // seconds scheduled ahead
const TICK_MS = 30;
const BASE_GAIN = 0.25;
const dbToGain = (d: number): number => Math.pow(10, d / 20);
/**
 * Loudness every track's full song is trimmed to (integrated LUFS at full volume, dry). At the default sliders it sits
 * about 3 dB under a medium hit and 10 dB under a heavy one, and the heavy moments duck it further (see sfx DUCK).
 */
export const MUSIC_TARGET = -27;
/** Victory / defeat fanfares play alone on the results screen, so they sit a little higher. */
export const FANFARE_TARGET = -25;
/** Music level under the announcer's voice. */
const SPEECH_DUCK = 0.5;

/** Length of one pass of a track's arranged song, in seconds. */
export function loopSeconds(t: Track): number {
  return (60 / t.bpm / 4) * songSteps(t);
}

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
  /** Level trim (dB) so every fanfare lands at the same loudness (measured in tests/audioLevels.test.ts). */
  level?: number;
}

const LOSE: Fanfare = { notes: [[69, 2], [68, 2], [67, 2], [66, 2], [65, 8]], step: 0.13, wave: 'square', harmony: 3, level: -1.4 };

/** Every fighter's victory theme, in the spirit of their moveset. */
export const FANFARES: Record<string, Fanfare> = {
  default: { notes: [[72, 1], [76, 1], [79, 1], [84, 2], [79, 1], [84, 1], [88, 3], [86, 1], [88, 6]], step: 0.085, wave: 'square', harmony: 7, drums: true, level: -2.6 },
  // a stomping march, low and square
  brick: { notes: [[60, 2], [60, 1], [60, 1], [67, 2], [0, 1], [65, 1], [64, 2], [62, 2], [60, 6]], step: 0.11, wave: 'square', harmony: -5, drums: true, level: -0.4 },
  // a sly minor run that snaps up at the end
  vex: { notes: [[69, 1], [72, 1], [76, 1], [75, 1], [76, 1], [0, 1], [81, 1], [84, 1], [88, 5]], step: 0.075, wave: 'sawtooth', harmony: 0, level: 0.1 },
  // sparkling arpeggios rising through the octaves
  nova: { notes: [[72, 1], [76, 1], [79, 1], [83, 1], [84, 1], [88, 1], [91, 1], [95, 1], [96, 6]], step: 0.08, wave: 'triangle', harmony: 12, level: -2.7 },
  // bleeps and a cheeky beep-boop
  gizmo: { notes: [[84, 1], [0, 1], [84, 1], [79, 1], [88, 1], [0, 1], [91, 1], [72, 1], [96, 2], [91, 4]], step: 0.07, wave: 'square', harmony: 0, level: -1.3 },
  // a blazing horn call with drums
  agni: { notes: [[62, 1], [62, 1], [69, 2], [67, 1], [69, 1], [74, 2], [72, 1], [74, 1], [78, 6]], step: 0.09, wave: 'sawtooth', harmony: 7, drums: true, level: -0.5 },
  // wide soaring leaps
  halcyon: { notes: [[67, 2], [74, 2], [79, 3], [78, 1], [79, 2], [86, 2], [91, 6]], step: 0.09, wave: 'triangle', harmony: 7, level: -1 },
  // a slow, booming march down in the bedrock, ending on a ringing crystal chord
  obelisk: { notes: [[48, 3], [0, 1], [48, 2], [51, 2], [55, 3], [0, 1], [53, 2], [60, 6]], step: 0.1, wave: 'square', harmony: 7, drums: true, level: 0.8 },
  // falling snow: a quick pentatonic flurry that settles on a high, bell-like note
  rime: { notes: [[81, 1], [79, 1], [76, 1], [74, 1], [76, 1], [0, 1], [79, 1], [81, 1], [86, 1], [88, 6]], step: 0.07, wave: 'triangle', harmony: 12, level: -1.1 },
  // a snare-led military cadence that ends on a bugle call
  havoc: { notes: [[67, 1], [67, 1], [67, 1], [72, 3], [0, 1], [67, 1], [72, 1], [76, 2], [72, 1], [76, 1], [79, 6]], step: 0.08, wave: 'square', harmony: 7, drums: true, level: -1.4 },
  // a rolling sea-shanty phrase
  riptide: { notes: [[62, 1], [62, 1], [62, 1], [0, 1], [62, 1], [65, 1], [69, 2], [67, 1], [65, 1], [64, 1], [62, 5]], step: 0.09, wave: 'square', harmony: 4, drums: true, level: -0.4 },
  // the playable Overseer: a cold minor proclamation that climbs to a held high note
  'overseer-versus': { notes: [[57, 2], [60, 2], [64, 2], [63, 1], [0, 1], [62, 2], [57, 2], [69, 6]], step: 0.1, wave: 'sawtooth', harmony: 7, drums: true, level: 0 },
};

/** One-shot stings for the boss fight, played through the same fanfare engine (the loop stops under them). */
export type StingId = 'overseerDown' | 'bossClear';
export const STINGS: Record<StingId, Fanfare> = {
  // the Overseer falls: a grinding chromatic power-down in tritones, the machine dying with a last low hit
  overseerDown: { notes: [[62, 1], [61, 1], [60, 1], [59, 1], [58, 2], [57, 2], [56, 3], [0, 1], [43, 8]], step: 0.1, wave: 'sawtooth', harmony: 6, drums: true, level: 2.3 },
  // the boss is cleared: a long, triumphant fanfare climbing to a held high chord
  bossClear: {
    notes: [[67, 1], [67, 1], [67, 1], [72, 3], [74, 1], [76, 2], [74, 1], [76, 1], [79, 3], [0, 1], [79, 1], [81, 1], [83, 1], [84, 8]],
    step: 0.09,
    wave: 'square',
    harmony: 7,
    drums: true,
    level: -1.9,
  },
};

/** Track ids per boss phase (`setBossPhase`). */
const BOSS_PHASE_TRACK = ['boss', 'boss', 'boss2'];

/** Rough loudness match between waveforms, so a triangle lead sits at the same level as a square one. */
const WAVE_GAIN: Record<OscillatorType, number> = { square: 1, sawtooth: 1.2, triangle: 1.6, sine: 1.5, custom: 1 };

/** One track's signal chain: melodic voices -> tone filter -> level -> mix; drums skip the filter so hats stay crisp. */
interface Bus {
  ctx: BaseAudioContext;
  gain: GainNode;
  filter: BiquadFilterNode;
  /** Lead send into the echo (null when the track has none). */
  send: GainNode | null;
  extra: AudioNode[];
  target: number;
}

export class Music {
  private timer: number | null = null;
  private track: Track | null = null;
  private step = 0;
  private nextTime = 0;
  private bus: Bus | null = null;
  private duck = 1;
  private speech = 1;
  private current = '';
  /** The loop stays silent until this audio time (a jingle is playing). */
  private holdUntil = 0;

  /** Start a track by id (no-op if it is already playing). Waits quietly for the first user gesture. */
  play(id: string): void {
    if (id === this.current && this.timer !== null) return;
    // notes of the old track are already scheduled up to the lookahead and long ones ring on: fade its bus out and give
    // the new track a fresh one so the two never clash
    this.retire();
    this.current = id;
    this.track = TRACKS[id] ?? null;
    this.step = 0;
    this.nextTime = 0;
    this.holdUntil = 0;
    if (this.timer === null && typeof window !== 'undefined') this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.retire();
    this.current = '';
    this.track = null;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Seconds into the playing song (the step being scheduled; 0 while waiting for audio to unlock). */
  get songTime(): number {
    return this.track ? (this.step * 60) / this.track.bpm / 4 : 0;
  }

  /** The track id that is playing (or waiting for audio to unlock); '' when stopped. */
  get playing(): string {
    return this.current;
  }

  /**
   * Switch the boss music to a phase's arrangement: 1 is the 'boss' track, 2 'boss2' (faster, with a counter-melody and
   * busier drums). Restarts from the top of the song (which opens on a crash), so call it on the phase change itself.
   */
  setBossPhase(phase: number): void {
    const id = BOSS_PHASE_TRACK[Math.max(1, Math.min(2, Math.round(phase) || 1))];
    this.play(id);
  }

  /** One-shot fanfare over a held loop: the winner's own victory theme (or a generic flourish), a falling minor phrase for a loss. */
  jingle(kind: 'win' | 'lose', who?: string): void {
    this.fanfare(kind === 'lose' ? LOSE : (who && FANFARES[who]) || FANFARES.default);
  }

  /**
   * A boss sting ('overseerDown' as the Overseer is defeated, 'bossClear' when the boss stage is won). The current loop
   * stops under it; with `next` (e.g. 'results') that track starts once the sting has finished, otherwise the music
   * stays silent. (Calling `play` straight after a sting would cut it off: pass `next` instead.)
   */
  sting(id: StingId, next?: string): void {
    const f = STINGS[id];
    if (!f) return;
    if (next && TRACKS[next]) this.play(next);
    else this.stop();
    this.fanfare(f);
  }

  private fanfare(f: Fanfare): void {
    const ctx = sfx.context;
    if (!ctx) return;
    // a fanfare still playing (a win jingle, then the boss-clear sting) is faded out rather than played over
    if (ctx.currentTime < this.holdUntil) this.retire();
    const bus = this.ensureBus(ctx);
    if (!bus) return;
    this.level(bus);
    let at = ctx.currentTime + 0.05;
    // the fanfare plays through the current track's bus: undo that track's level trim so every fanfare lands the same
    const lv = dbToGain((f.level ?? 0) - (this.track?.sound?.level ?? 0));
    const w = WAVE_GAIN[f.wave] * lv;
    for (const [m, len] of f.notes) {
      const d = f.step * len;
      if (m > 0) {
        this.osc(ctx, bus.filter, f.wave, midiToHz(m), at, d * 0.92, 0.5 * w);
        if (f.harmony) this.osc(ctx, bus.filter, f.wave, midiToHz(m + f.harmony), at, d * 0.92, 0.18 * w);
        this.osc(ctx, bus.filter, 'triangle', midiToHz(m - 24), at, d * 0.95, 0.9 * lv);
        if (f.drums && len >= 2) this.noise(ctx, bus.gain, at, 0.12, 0.4 * lv, 1200);
      }
      at += d;
    }
    this.holdUntil = at + 0.4;
  }

  /** Quieten the music (e.g. while paused). Glides, so pausing never clicks. */
  setDuck(d: number): void {
    this.duck = unit(d);
    if (this.bus) this.level(this.bus);
  }

  /** Dip the music under the announcer's voice. */
  setSpeechDuck(on: boolean): void {
    this.speech = on ? SPEECH_DUCK : 1;
    if (this.bus) this.level(this.bus);
  }

  private targetGain(): number {
    const trim = dbToGain(this.track?.sound?.level ?? 0);
    return unit(settings.masterVolume) * unit(settings.musicVolume) * BASE_GAIN * trim * this.duck * this.speech;
  }

  /** Move the bus towards the current volume x duck; only reschedules when the target changes. */
  private level(bus: Bus): number {
    const target = this.targetGain();
    if (target !== bus.target) {
      const t = bus.ctx.currentTime;
      bus.gain.gain.cancelScheduledValues(t);
      bus.gain.gain.setTargetAtTime(target, t, bus.target < 0 ? 0.005 : 0.06);
      bus.target = target;
    }
    return target;
  }

  /** Fade the current bus out and tear it down once its last notes have died away. */
  private retire(): void {
    const bus = this.bus;
    this.bus = null;
    if (!bus) return;
    const t = bus.ctx.currentTime;
    bus.gain.gain.cancelScheduledValues(t);
    bus.gain.gain.setTargetAtTime(0, t, 0.025);
    const drop = (): void => {
      for (const n of [bus.gain, bus.filter, bus.send, ...bus.extra]) n?.disconnect();
    };
    if (typeof window !== 'undefined') window.setTimeout(drop, 400);
    else drop();
  }

  private ensureBus(ctx: BaseAudioContext): Bus | null {
    if (this.bus && this.bus.ctx === ctx) return this.bus;
    const out = sfx.output;
    if (!out) return null;
    const look = this.track?.sound ?? {};
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = look.tone ?? 7000;
    filter.Q.value = 0.5;
    filter.connect(gain).connect(out);
    let send: GainNode | null = null;
    const extra: AudioNode[] = [];
    if (look.echo && this.track) {
      // a dotted-eighth echo on the lead: send -> delay <-> feedback, delay -> wet -> filter
      send = ctx.createGain();
      send.gain.value = 1;
      const delay = ctx.createDelay(1);
      delay.delayTime.value = Math.min(0.9, (60 / this.track.bpm) * 0.75);
      const fb = ctx.createGain();
      fb.gain.value = Math.min(0.5, look.echo);
      const wet = ctx.createGain();
      wet.gain.value = 0.45;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 300; // keep the repeats out of the bass
      send.connect(delay).connect(hp).connect(fb).connect(delay);
      hp.connect(wet).connect(filter);
      extra.push(delay, fb, wet, hp);
    }
    this.bus = { ctx, gain, filter, send, extra, target: -1 };
    return this.bus;
  }

  /** Schedule the notes due in the next lookahead window. Runs on a timer; tests and offline renders call it directly. */
  tick(): void {
    const ctx = sfx.context;
    const t = this.track;
    if (!ctx || !t) return;
    sfx.syncVolume();
    const bus = this.ensureBus(ctx);
    if (!bus) return;
    if (this.level(bus) <= 0) {
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
      for (const e of stepEvents(t, this.step)) this.voice(ctx, bus, t, e, this.nextTime, stepDur);
      this.step = (this.step + 1) % songSteps(t);
      this.nextTime += stepDur;
    }
  }

  private osc(ctx: BaseAudioContext, bus: AudioNode, type: OscillatorType, hz: number, at: number, dur: number, vol: number, detune = 0, send: AudioNode | null = null): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz, at);
    if (detune) o.detune.setValueAtTime(detune, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(bus);
    if (send) g.connect(send);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private noise(ctx: BaseAudioContext, bus: AudioNode, at: number, dur: number, vol: number, hp: number): void {
    const buf = sfx.noiseBuffer;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(bus);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
    src.start(at, Math.random() * (buf.duration - dur - 0.05));
    src.stop(at + dur + 0.02);
  }

  /** A held chord tone: a slow swell, a sustain and a soft release (two detuned oscillators for width). */
  private padNote(ctx: BaseAudioContext, bus: AudioNode, type: OscillatorType, hz: number, at: number, dur: number, vol: number): void {
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(hz, at);
      o.detune.setValueAtTime(det, at);
      const rel = Math.min(0.25, dur * 0.3);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(vol, at + Math.min(0.15, dur * 0.3));
      g.gain.setValueAtTime(vol, at + dur - rel);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(bus);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
      o.start(at);
      o.stop(at + dur + 0.02);
    }
  }

  private voice(ctx: BaseAudioContext, bus: Bus, t: Track, e: MusicEvent, at: number, stepDur: number): void {
    const look = t.sound ?? {};
    const vel = e.vel ?? 1;
    switch (e.voice) {
      case 'lead': {
        const wave = look.lead ?? 'square';
        const vol = 0.5 * WAVE_GAIN[wave] * vel;
        const dur = stepDur * e.steps * 0.9;
        if (look.detune) {
          // two slightly detuned oscillators: a fatter, chorused lead
          this.osc(ctx, bus.filter, wave, midiToHz(e.midi), at, dur, vol * 0.65, look.detune, bus.send);
          this.osc(ctx, bus.filter, wave, midiToHz(e.midi), at, dur, vol * 0.65, -look.detune, bus.send);
        } else this.osc(ctx, bus.filter, wave, midiToHz(e.midi), at, dur, vol, 0, bus.send);
        break;
      }
      case 'counter': {
        // the second lead: held notes a little under the main one, through the same echo
        const wave = look.counter ?? 'square';
        this.osc(ctx, bus.filter, wave, midiToHz(e.midi), at, stepDur * e.steps * 0.95, 0.3 * WAVE_GAIN[wave] * vel, 0, bus.send);
        break;
      }
      case 'arp': {
        const wave = look.arp ?? 'square';
        this.osc(ctx, bus.filter, wave, midiToHz(e.midi), at, stepDur * 0.7, 0.2 * WAVE_GAIN[wave] * vel);
        break;
      }
      case 'bass': {
        const wave = look.bass ?? 'triangle';
        this.osc(ctx, bus.filter, wave, midiToHz(e.midi), at, stepDur * e.steps * 0.95, (0.9 * WAVE_GAIN[wave] * vel) / WAVE_GAIN.triangle);
        break;
      }
      case 'pad': {
        const wave = look.pad ?? 'triangle';
        this.padNote(ctx, bus.filter, wave, midiToHz(e.midi), at, stepDur * e.steps, 0.07 * WAVE_GAIN[wave] * vel);
        break;
      }
      case 'kick': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(150, at);
        o.frequency.exponentialRampToValueAtTime(40, at + 0.12);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(0.9 * vel, at + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
        o.connect(g).connect(bus.gain);
        o.onended = () => {
          o.disconnect();
          g.disconnect();
        };
        o.start(at);
        o.stop(at + 0.17);
        break;
      }
      case 'snare':
        // noise for the wires and a short pitched body for the drum
        this.noise(ctx, bus.gain, at, 0.12, 0.45 * vel, 1200);
        this.osc(ctx, bus.gain, 'triangle', 190, at, 0.07, 0.35 * vel);
        break;
      case 'hat':
        this.noise(ctx, bus.gain, at, 0.04, 0.25 * vel, 7000);
        break;
      case 'ohat':
        // an open hat: a longer, softer wash of the same noise
        this.noise(ctx, bus.gain, at, 0.16, 0.16 * vel, 6500);
        break;
      case 'tom': {
        // a pitched drum for the fills: a sine dropping a little, with a short knock of noise
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const hz = midiToHz(e.midi);
        o.frequency.setValueAtTime(hz, at);
        o.frequency.exponentialRampToValueAtTime(hz * 0.62, at + 0.16);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(0.55 * vel, at + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
        o.connect(g).connect(bus.gain);
        o.onended = () => {
          o.disconnect();
          g.disconnect();
        };
        o.start(at);
        o.stop(at + 0.22);
        this.noise(ctx, bus.gain, at, 0.03, 0.12 * vel, 900);
        break;
      }
      case 'crash':
        this.noise(ctx, bus.gain, at, 1.1, 0.2 * vel, 4500);
        break;
    }
  }
}

export const music = new Music();
