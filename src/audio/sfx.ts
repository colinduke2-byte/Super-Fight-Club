import { settings } from '../settings';
import type { SoundStyle } from '../engine/fxTypes';
import type { SoundName } from './soundMap';

/** Concurrent sounds (not nodes) across the whole mix; a sound is one recipe, a handful of oscillators / noise bursts. */
const MAX_SOUNDS = 24;
/** Concurrent copies of one sound: a fourth hit steals the oldest instead of stacking into a wall of noise. */
const MAX_SAME = 3;
/** The same sound retriggered within this many seconds is dropped (two fighters' identical events in one frame). */
const MIN_GAP = 0.028;
/** Repeats inside this window are attenuated so rapid multi-hits do not build up. */
const STACK_WINDOW = 0.1;
/** Sounds that always get a voice, stealing the oldest ordinary one if the mix is full. */
const PRIORITY: ReadonlySet<SoundName> = new Set<SoundName>(['ko', 'shieldBreak', 'parry', 'charge']);
/** Random pitch spread (fraction) per sound so repeats are not machine-gun identical; musical cues stay in tune. */
const NO_VARY: ReadonlySet<SoundName> = new Set<SoundName>(['ding', 'menuMove', 'menuOk', 'menuBack', 'freeze']);
const VARY = 0.06;

/**
 * Master bus dynamics. The compressor glues the mix and pulls peaks down; WebAudio's compressor adds its own make-up
 * gain, which `trim` takes back (quiet material passes at unity; a full-scale pile-up comes out near -3 dBFS). The soft clipper after it only touches the
 * rare transient that gets through.
 */
export const MIX = { threshold: -6, knee: 4, ratio: 10, attack: 0.002, release: 0.15, trim: 0.75 };

/** A finite number in [0, 1]; anything else (a corrupt setting, NaN from upstream maths) falls back. */
export function unit(v: unknown, fallback = 1): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

/** Soft-knee clipper curve for the final safety stage: linear to 0.8, then saturating smoothly towards 1 (input -2..2). */
export function softClipCurve(n = 2048): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = -2 + (4 * i) / (n - 1);
    const a = Math.abs(u);
    const y = a <= 0.8 ? a : 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2);
    c[i] = Math.sign(u) * y * 0.5; // the shaper's input is pre-scaled by 0.5 and its output by 2
  }
  return c;
}

/** One playing sound: its gain (for stealing / fades) and how many of its sources are still running. */
interface Voice {
  name: SoundName;
  gain: GainNode;
  out: AudioNode;
  live: number;
  start: number;
  stolen: boolean;
}

/**
 * Tiny WebAudio synth: every sound is built from oscillators + filtered noise, so there are no
 * audio assets. The AudioContext is created lazily and resumed on the first key / pointer gesture
 * (browser autoplay policy).
 *
 * Mix graph: sound voices -> sfx bus (sfx volume) -> mix; music and ambience also feed `output` (the mix), which runs
 * through a compressor and a soft clipper before the speakers, so a pile-up of hits, a KO and the music never clip.
 */
export class Sfx {
  private ctx: BaseAudioContext | null = null;
  private offline = false;
  private master: GainNode | null = null;
  private mix: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices: Voice[] = [];
  private cur: Voice | null = null;
  private pv = 1;
  private sfxLevel = -1;
  private readonly lastPlayed = new Map<SoundName, number>();
  private readonly recent: { name: SoundName; t: number }[] = [];
  private armed = false;

  /** Call once: waits for a user gesture, then creates and resumes the context. */
  arm(target: Window = window): void {
    if (this.armed) return;
    this.armed = true;
    // the listeners stay: browsers (Safari / iOS above all) suspend or interrupt the context again after backgrounding or a
    // locked screen, and the next gesture has to resume it
    const unlock = (): void => {
      if (this.ensure()) this.resume();
    };
    target.addEventListener('keydown', unlock);
    target.addEventListener('pointerdown', unlock);
    document.addEventListener('visibilitychange', () => {
      const ctx = this.ctx as AudioContext | null;
      if (!ctx || this.offline) return;
      // hidden tabs throttle the music timer to 1 Hz, which garbles the loop: pause the whole mix instead
      if (document.visibilityState === 'hidden') {
        if (ctx.state === 'running') ctx.suspend().catch(() => undefined);
      } else this.resume();
    });
  }

  private resume(): void {
    const ctx = this.ctx as AudioContext | null;
    if (!ctx || this.offline || ctx.state === 'running' || ctx.state === 'closed') return;
    try {
      ctx.resume().catch(() => undefined);
    } catch {
      /* no audio: stay silent */
    }
  }

  /** The shared context (null until the first user gesture, or while suspended); used by the music and ambience. */
  get context(): BaseAudioContext | null {
    return this.ctx && (this.offline || this.ctx.state === 'running') ? this.ctx : null;
  }
  get noiseBuffer(): AudioBuffer | null {
    return this.noise;
  }
  /** The mix input (compressed and limited); music and ambience connect here, never straight to the destination. */
  get output(): AudioNode | null {
    return this.mix;
  }

  private ensure(): boolean {
    if (this.ctx) return true;
    const w = typeof window !== 'undefined' ? window : undefined;
    const Ctor = w?.AudioContext ?? (w as unknown as { webkitAudioContext?: typeof AudioContext } | undefined)?.webkitAudioContext;
    if (!Ctor) return false;
    try {
      this.build(new Ctor({ latencyHint: 'interactive' }));
    } catch {
      this.ctx = null; // audio blocked or unavailable (too many contexts, sandboxed frame): the game stays silent
      return false;
    }
    return true;
  }

  /** Build the mix on a given context (an OfflineAudioContext renders the same graph for analysis and tests). */
  attach(ctx: BaseAudioContext): void {
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.build(ctx);
  }

  private build(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    this.voices = [];
    this.lastPlayed.clear();
    this.recent.length = 0;
    this.sfxLevel = -1;
    // master chain: mix -> compressor -> soft clipper -> speakers
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = MIX.threshold;
    comp.knee.value = MIX.knee;
    comp.ratio.value = MIX.ratio;
    comp.attack.value = MIX.attack;
    comp.release.value = MIX.release;
    const trim = ctx.createGain();
    trim.gain.value = MIX.trim * 0.5;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = 'none';
    const post = ctx.createGain();
    post.gain.value = 2;
    this.mix = ctx.createGain();
    this.mix.connect(comp).connect(trim).connect(clip).connect(post).connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.mix);
    // two seconds of white noise reused by every noise voice (each burst starts at a random offset)
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Follow the volume settings with a short glide (no zipper noise when a slider moves). Cheap to call every frame. */
  syncVolume(): number {
    const vol = unit(settings.masterVolume) * unit(settings.sfxVolume);
    if (this.ctx && this.master && vol !== this.sfxLevel) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      if (this.sfxLevel < 0) this.master.gain.setValueAtTime(vol, t);
      else this.master.gain.setTargetAtTime(vol, t, 0.015);
      this.sfxLevel = vol;
    }
    return vol;
  }

  /** Fade out every sound still ringing (scene change, quit to menu). */
  stopAll(fade = 0.05): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of this.voices) this.fadeVoice(v, ctx.currentTime, fade);
    this.voices = [];
  }

  /** Sounds currently holding a voice (for tests / perf overlays). */
  get activeSounds(): number {
    return this.voices.length;
  }

  private fadeVoice(v: Voice, t: number, fade: number): void {
    v.stolen = true;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + fade);
  }

  /** pan: -1 (left) .. 1 (right). */
  play(name: SoundName, intensity = 0.7, pan = 0, style: SoundStyle = 'plain'): void {
    const ctx = this.context;
    if (!ctx || !this.master) return;
    const vol = this.syncVolume();
    if (vol <= 0) return;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1e9) < MIN_GAP) return;
    const prio = PRIORITY.has(name);
    const same = this.voices.filter((v) => v.name === name);
    if (same.length >= MAX_SAME) this.steal(same[0], now);
    else if (this.voices.length >= MAX_SOUNDS) {
      const victim = prio ? this.voices.find((v) => !PRIORITY.has(v.name)) : undefined;
      if (!victim) return;
      this.steal(victim, now);
    }
    this.lastPlayed.set(name, now);
    // rapid repeats of one sound get progressively quieter so a flurry of hits stays readable
    while (this.recent.length && now - this.recent[0].t > STACK_WINDOW) this.recent.shift();
    const repeats = this.recent.reduce((n, r) => n + (r.name === name ? 1 : 0), 0);
    this.recent.push({ name, t: now });
    const k = unit(intensity, 0.7) * 0.95 + 0.05;
    const gain = ctx.createGain();
    gain.gain.value = (1 / Math.sqrt(1 + repeats)) * (0.9 + Math.random() * 0.2);
    let out: AudioNode = gain;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
      gain.connect(p);
      out = p;
    }
    out.connect(this.master);
    const voice: Voice = { name, gain, out, live: 0, start: now, stolen: false };
    this.voices.push(voice);
    this.cur = voice;
    this.pv = NO_VARY.has(name) ? 1 : 1 + (Math.random() * 2 - 1) * VARY;
    try {
      this.recipe(name, k, gain, style);
    } finally {
      this.cur = null;
      this.pv = 1;
    }
    if (voice.live === 0) this.release(voice);
  }

  private steal(v: Voice, t: number): void {
    this.fadeVoice(v, t, 0.015);
    this.voices = this.voices.filter((x) => x !== v);
  }

  private release(v: Voice): void {
    v.gain.disconnect();
    if (v.out !== v.gain) v.out.disconnect();
    if (!v.stolen) this.voices = this.voices.filter((x) => x !== v);
  }

  /** Swing whoosh, flavoured per fighter style. */
  private swing(d: AudioNode, k: number, style: SoundStyle): void {
    switch (style) {
      case 'heavy':
        this.noiseBurst(d, 'lowpass', 700, 140, 0.14, 0.2 * k);
        this.tone(d, 'sine', 90, 55, 0.1, 0.18 * k);
        break;
      case 'blade':
        this.noiseBurst(d, 'bandpass', 3600, 1400, 0.06, 0.16 * k);
        this.tone(d, 'sawtooth', 2400, 3400, 0.05, 0.05 * k);
        break;
      case 'arcane':
        this.tone(d, 'sine', 700, 1200, 0.12, 0.1 * k);
        this.noiseBurst(d, 'bandpass', 1800, 900, 0.08, 0.06 * k);
        break;
      case 'mech':
        this.tone(d, 'square', 320, 180, 0.06, 0.1 * k);
        this.noiseBurst(d, 'bandpass', 1400, 500, 0.07, 0.12 * k);
        break;
      case 'wind':
        // a rising airy rush with a feathery flutter on top
        this.noiseBurst(d, 'bandpass', 1200, 4200, 0.13, 0.16 * k);
        this.noiseBurst(d, 'highpass', 5200, 2600, 0.07, 0.07 * k, 0.03);
        this.tone(d, 'sine', 900, 1500, 0.09, 0.04 * k);
        break;
      case 'fire':
        this.noiseBurst(d, 'highpass', 2600, 1200, 0.1, 0.12 * k);
        this.noiseBurst(d, 'lowpass', 900, 300, 0.12, 0.14 * k);
        break;
      case 'water':
        // a wet swish: a falling bandpass sweep with a bubbly blip
        this.noiseBurst(d, 'bandpass', 1600, 500, 0.12, 0.16 * k);
        this.tone(d, 'sine', 520, 260, 0.08, 0.07 * k);
        break;
      case 'stone':
        // a heavy grinding swing: a low rumble of rock with a faint glassy ring
        this.noiseBurst(d, 'lowpass', 600, 120, 0.16, 0.22 * k);
        this.tone(d, 'sine', 70, 45, 0.12, 0.2 * k);
        this.tone(d, 'triangle', 1560, 1480, 0.06, 0.03 * k, 0.03);
        break;
      default:
        // an airy whoosh that swells in and sweeps up, with a low push of air under it
        this.noiseBurst(d, 'bandpass', 700, 1900, 0.12, 0.34 * k, 0, 0.03);
        this.noiseBurst(d, 'lowpass', 500, 220, 0.09, 0.12 * k, 0, 0.02);
    }
  }

  /** Extra layer on a hit sound so each fighter's blows sound like their style (thump, metal ping, arcane sparkle, clank, crackle). */
  private hitLayer(d: AudioNode, k: number, style: SoundStyle, heavy: boolean): void {
    const h = heavy ? 1.4 : 1;
    switch (style) {
      case 'heavy':
        this.tone(d, 'sine', 80, 38, 0.22 * h, 0.55 * k);
        this.noiseBurst(d, 'lowpass', 1200, 150, 0.12 * h, 0.3 * k);
        break;
      case 'blade':
        this.tone(d, 'triangle', 2100, 1500, 0.12 * h, 0.22 * k);
        this.noiseBurst(d, 'highpass', 6500, 3500, 0.05, 0.28 * k);
        break;
      case 'arcane':
        this.tone(d, 'sine', 1320, 1760, 0.2 * h, 0.2 * k);
        this.tone(d, 'sine', 1980, 2640, 0.15 * h, 0.12 * k, 0.03);
        break;
      case 'mech':
        this.tone(d, 'triangle', 640, 610, 0.18 * h, 0.3 * k);
        this.tone(d, 'square', 980, 940, 0.1, 0.12 * k);
        this.noiseBurst(d, 'bandpass', 3200, 2200, 0.04, 0.25 * k);
        break;
      case 'wind':
        this.tone(d, 'triangle', 1800, 2900, 0.1 * h, 0.2 * k);
        this.noiseBurst(d, 'highpass', 4800, 2400, 0.12 * h, 0.2 * k);
        this.tone(d, 'sine', 240, 120, 0.1, 0.18 * k);
        break;
      case 'fire':
        this.noiseBurst(d, 'highpass', 3000, 1800, 0.2 * h, 0.25 * k);
        this.tone(d, 'sawtooth', 160, 70, 0.16 * h, 0.2 * k);
        break;
      case 'water':
        // a heavy splash: low thump, a spray of hiss and a plop
        this.tone(d, 'sine', 110, 50, 0.18 * h, 0.4 * k);
        this.noiseBurst(d, 'bandpass', 2400, 700, 0.18 * h, 0.3 * k);
        this.tone(d, 'sine', 900, 380, 0.07, 0.14 * k, 0.04);
        break;
      case 'stone':
        // rock on bone: a deep crunch, a crack of grit, and a crystal chime ringing over it
        this.tone(d, 'sine', 72, 32, 0.24 * h, 0.6 * k);
        this.noiseBurst(d, 'lowpass', 1800, 180, 0.14 * h, 0.34 * k);
        this.noiseBurst(d, 'bandpass', 4200, 2600, 0.04, 0.16 * k);
        this.tone(d, 'sine', 1760, 1740, 0.32 * h, 0.07 * k, 0.02);
        this.tone(d, 'sine', 2637, 2620, 0.24 * h, 0.04 * k, 0.03);
        break;
      default:
        break;
    }
  }

  // ---- synthesis helpers ------------------------------------------------------------------------
  private env(g: GainNode, t: number, vol: number, dur: number, attack = 0.004): void {
    const a = Math.min(attack, dur * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  /** Schedule a source's stop and, once it has ended, disconnect its chain and free the sound's voice. */
  private track(node: AudioScheduledSourceNode, end: number, chain: AudioNode[]): void {
    const v = this.cur;
    if (v) v.live++;
    node.onended = () => {
      node.disconnect();
      for (const n of chain) n.disconnect();
      if (v && --v.live === 0) this.release(v);
    };
    node.stop(end);
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0 * this.pv), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * this.pv), t + dur);
    this.env(g, t, vol, dur);
    o.connect(g).connect(dest);
    o.start(t);
    this.track(o, t + dur + 0.02, [g]);
  }

  private noiseBurst(dest: AudioNode, type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, delay = 0, attack = 0.004): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(Math.max(30, f0 * this.pv), t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1 * this.pv), t + dur);
    flt.Q.value = type === 'bandpass' ? 1.4 : 0.7;
    const g = ctx.createGain();
    this.env(g, t, vol, dur, attack);
    src.connect(flt).connect(g).connect(dest);
    // a random point in the noise so no two bursts are sample-identical
    src.start(t, Math.random() * 1.5);
    this.track(src, t + dur + 0.02, [flt, g]);
  }

  private recipe(name: SoundName, k: number, d: AudioNode, style: SoundStyle = 'plain'): void {
    switch (name) {
      case 'swing':
        this.swing(d, k, style);
        break;
      case 'hit':
        this.noiseBurst(d, 'bandpass', 2200, 700, 0.07, 0.5 * k);
        this.tone(d, 'square', 190 + 80 * (1 - k), 60, 0.1, 0.35 * k);
        this.hitLayer(d, k, style, false);
        break;
      case 'hitHeavy':
        this.noiseBurst(d, 'lowpass', 3500, 200, 0.22, 0.7 * k);
        this.tone(d, 'sawtooth', 220, 45, 0.2, 0.4 * k);
        this.tone(d, 'sine', 110, 32, 0.32, 0.8 * k);
        this.hitLayer(d, k, style, true);
        break;
      case 'clang':
        this.tone(d, 'sine', 920, 880, 0.3, 0.3 * k);
        this.tone(d, 'sine', 1380, 1330, 0.22, 0.22 * k);
        this.noiseBurst(d, 'highpass', 5000, 3000, 0.05, 0.25 * k);
        break;
      case 'parry':
        this.tone(d, 'sine', 1500, 1100, 0.16, 0.35 * k);
        this.tone(d, 'sine', 2250, 1700, 0.12, 0.22 * k, 0.02);
        this.noiseBurst(d, 'highpass', 6000, 4000, 0.04, 0.3 * k);
        break;
      case 'shield':
        this.tone(d, 'triangle', 520, 300, 0.14, 0.35 * k);
        this.noiseBurst(d, 'bandpass', 3000, 1500, 0.06, 0.2 * k);
        break;
      case 'shieldBreak':
        this.noiseBurst(d, 'bandpass', 4000, 200, 0.5, 0.6);
        this.tone(d, 'sawtooth', 900, 90, 0.5, 0.35);
        break;
      case 'jump':
        this.tone(d, 'sine', 230, 460, 0.09, 0.22 * k);
        break;
      case 'doubleJump':
        this.tone(d, 'sine', 340, 700, 0.1, 0.22 * k);
        this.tone(d, 'sine', 510, 1000, 0.1, 0.15 * k, 0.05);
        break;
      case 'land':
        this.noiseBurst(d, 'lowpass', 500, 120, 0.07, 0.35 * k);
        this.tone(d, 'sine', 85, 50, 0.08, 0.3 * k);
        break;
      case 'landBounce':
        this.noiseBurst(d, 'lowpass', 900, 100, 0.12, 0.5);
        this.tone(d, 'sine', 140, 40, 0.25, 0.6);
        this.tone(d, 'triangle', 300, 600, 0.12, 0.2, 0.06);
        break;
      case 'bounce':
        this.tone(d, 'square', 170, 85, 0.12, 0.3 * k);
        this.noiseBurst(d, 'lowpass', 800, 200, 0.08, 0.3 * k);
        break;
      case 'tech':
        this.tone(d, 'square', 620, 1240, 0.06, 0.22 * k);
        this.tone(d, 'square', 930, 1860, 0.08, 0.18 * k, 0.05);
        break;
      case 'ledge':
        this.noiseBurst(d, 'highpass', 3000, 2500, 0.03, 0.3 * k);
        this.tone(d, 'triangle', 700, 520, 0.08, 0.25 * k);
        break;
      case 'dodge':
        this.noiseBurst(d, 'bandpass', 1400, 500, 0.14, 0.32 * k, 0, 0.025);
        break;
      case 'grab':
        this.tone(d, 'square', 320, 210, 0.07, 0.25 * k);
        this.noiseBurst(d, 'bandpass', 1800, 900, 0.04, 0.2 * k);
        break;
      case 'throw':
        this.noiseBurst(d, 'bandpass', 1500, 400, 0.14, 0.3 * k);
        this.tone(d, 'sine', 140, 50, 0.16, 0.5 * k, 0.04);
        break;
      case 'pummel':
        this.tone(d, 'square', 150, 90, 0.05, 0.25 * k);
        break;
      case 'ko':
        this.noiseBurst(d, 'lowpass', 3000, 90, 0.9, 0.8);
        this.tone(d, 'sawtooth', 420, 38, 0.95, 0.45);
        this.tone(d, 'sine', 70, 28, 1.0, 0.9);
        this.noiseBurst(d, 'highpass', 6000, 2000, 0.25, 0.3);
        break;
      case 'shoot':
        this.tone(d, 'sawtooth', 900, 280, 0.12, 0.22 * k);
        this.noiseBurst(d, 'bandpass', 2500, 900, 0.05, 0.15 * k);
        break;
      case 'zap':
        this.noiseBurst(d, 'highpass', 4000, 1500, 0.08, 0.3 * k);
        this.tone(d, 'sawtooth', 1500, 650, 0.1, 0.25 * k);
        break;
      case 'reflect':
        this.tone(d, 'sine', 1200, 1900, 0.18, 0.35 * k);
        this.tone(d, 'triangle', 600, 900, 0.18, 0.2 * k);
        break;
      case 'place':
        this.tone(d, 'square', 210, 120, 0.08, 0.3 * k);
        this.noiseBurst(d, 'highpass', 3500, 3000, 0.02, 0.25 * k);
        break;
      case 'boom':
        this.noiseBurst(d, 'lowpass', 2500, 80, 0.4, 0.8 * k);
        this.tone(d, 'sine', 95, 35, 0.4, 0.8 * k);
        break;
      case 'break':
        this.noiseBurst(d, 'highpass', 5000, 1500, 0.16, 0.45 * k);
        this.tone(d, 'square', 300, 90, 0.14, 0.25 * k);
        break;
      case 'burn':
        this.noiseBurst(d, 'bandpass', 2400, 900, 0.18, 0.22 * k);
        break;
      case 'freeze':
        this.tone(d, 'sine', 2100, 1500, 0.3, 0.2 * k);
        this.tone(d, 'sine', 3100, 2400, 0.2, 0.12 * k, 0.03);
        break;
      case 'slow':
        this.tone(d, 'triangle', 420, 160, 0.3, 0.25 * k);
        break;
      case 'splash':
        this.noiseBurst(d, 'bandpass', 2200, 600, 0.2, 0.28 * k);
        this.tone(d, 'sine', 700, 300, 0.1, 0.16 * k, 0.02);
        break;
      case 'stun':
        this.tone(d, 'sawtooth', 1100, 300, 0.2, 0.25 * k);
        this.noiseBurst(d, 'highpass', 3500, 2000, 0.12, 0.2 * k);
        break;
      case 'blink':
        this.tone(d, 'sine', 300, 2000, 0.08, 0.3 * k);
        this.noiseBurst(d, 'highpass', 2500, 5000, 0.07, 0.2 * k);
        break;
      case 'hook':
        this.noiseBurst(d, 'highpass', 3500, 3000, 0.03, 0.25 * k);
        this.tone(d, 'sawtooth', 500, 950, 0.12, 0.2 * k);
        break;
      case 'charge':
        this.tone(d, 'sine', 80, 420, 0.6, 0.5 * k);
        this.tone(d, 'sawtooth', 120, 640, 0.6, 0.18 * k);
        break;
      case 'menuMove':
        this.tone(d, 'square', 660, 700, 0.05, 0.12 * k);
        break;
      case 'menuOk':
        this.tone(d, 'square', 520, 520, 0.07, 0.16 * k);
        this.tone(d, 'square', 780, 780, 0.1, 0.16 * k, 0.06);
        break;
      case 'menuBack':
        this.tone(d, 'square', 420, 300, 0.12, 0.14 * k);
        break;
      case 'ding':
        this.tone(d, 'sine', 880, 880, 0.35, 0.3 * k);
        this.tone(d, 'sine', 1320, 1320, 0.35, 0.22 * k, 0.07);
        break;
    }
  }
}

export const sfx = new Sfx();
