import { settings } from '../settings';
import type { SoundStyle } from '../engine/fxTypes';
import type { SoundName } from './soundMap';

const MAX_VOICES = 24;
const MIN_GAP_MS = 28;

/**
 * Tiny WebAudio synth: every sound is built from oscillators + filtered noise, so there are no
 * audio assets. The AudioContext is created lazily and resumed on the first key / pointer gesture
 * (browser autoplay policy).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  private readonly lastPlayed = new Map<SoundName, number>();
  private armed = false;

  /** Call once: waits for a user gesture, then creates and resumes the context. */
  arm(target: Window = window): void {
    if (this.armed) return;
    this.armed = true;
    const unlock = (): void => {
      this.ensure();
      void this.ctx?.resume();
      if (this.ctx && this.ctx.state === 'running') {
        target.removeEventListener('keydown', unlock);
        target.removeEventListener('pointerdown', unlock);
      }
    };
    target.addEventListener('keydown', unlock);
    target.addEventListener('pointerdown', unlock);
  }

  /** The shared context and noise buffer (null until the first user gesture); used by the music player. */
  get context(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }
  get noiseBuffer(): AudioBuffer | null {
    return this.noise;
  }

  private ensure(): boolean {
    if (this.ctx) return true;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    // one second of white noise reused by every noise voice
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  /** pan: -1 (left) .. 1 (right). */
  play(name: SoundName, intensity = 0.7, pan = 0, style: SoundStyle = 'plain'): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const vol = settings.masterVolume * settings.sfxVolume;
    if (vol <= 0) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -1e9) < MIN_GAP_MS) return;
    if (this.voices >= MAX_VOICES) return;
    this.lastPlayed.set(name, now);
    this.master.gain.value = vol;
    const out = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (out) {
      out.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(this.master);
    }
    this.recipe(name, Math.max(0.05, Math.min(1, intensity)), out ?? this.master, style);
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
        this.noiseBurst(d, 'bandpass', 900, 300, 0.07, 0.12 * k);
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
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private track(node: AudioScheduledSourceNode, dur: number): void {
    this.voices++;
    node.onended = () => void this.voices--;
    node.stop(this.ctx!.currentTime + dur + 0.05);
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, vol, dur);
    o.connect(g).connect(dest);
    o.start(t);
    this.track(o, dur + delay);
  }

  private noiseBurst(dest: AudioNode, type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    flt.Q.value = type === 'bandpass' ? 1.4 : 0.7;
    const g = ctx.createGain();
    this.env(g, t, vol, dur);
    src.connect(flt).connect(g).connect(dest);
    src.start(t);
    this.track(src, dur + delay);
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
        this.noiseBurst(d, 'bandpass', 1200, 500, 0.12, 0.18 * k);
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
