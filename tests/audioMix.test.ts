import { describe, expect, it } from 'vitest';
import { Sfx, softClipCurve, unit } from '../src/audio/sfx';
import { TRACKS } from '../src/audio/tracks';
import { settings } from '../src/settings';

/** A minimal fake of the WebAudio graph: enough to drive the synth, and strict about non-finite parameter values. */
class FakeParam {
  value = 0;
  events: string[] = [];
  private check(v: number): void {
    if (!Number.isFinite(v)) throw new TypeError('non-finite AudioParam value');
  }
  setValueAtTime(v: number, t: number): this {
    this.check(v);
    this.check(t);
    this.value = v;
    this.events.push('set');
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.check(v);
    this.check(t);
    this.events.push('lin');
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.check(v);
    this.check(t);
    if (v <= 0) throw new RangeError('exponential ramp to a non-positive value');
    this.events.push('exp');
    return this;
  }
  setTargetAtTime(v: number, t: number, tau: number): this {
    this.check(v);
    this.check(t);
    this.check(tau);
    this.events.push('target');
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

let live = 0;
class FakeNode {
  outs = new Set<FakeNode>();
  connect<T extends FakeNode>(n: T): T {
    if (this.outs.size === 0) live++;
    this.outs.add(n);
    return n;
  }
  disconnect(): void {
    if (this.outs.size) live--;
    this.outs.clear();
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeSource extends FakeNode {
  onended: (() => void) | null = null;
  frequency = new FakeParam();
  detune = new FakeParam();
  playbackRate = new FakeParam();
  type = '';
  buffer: unknown = null;
  loop = false;
  stopAt = Infinity;
  start(): void {}
  stop(t = 0): void {
    this.stopAt = t;
  }
}
class FakeCtx {
  currentTime = 1;
  sampleRate = 8000;
  state = 'running';
  destination = new FakeNode();
  sources: FakeSource[] = [];
  createGain = (): FakeGain => {
    const g = new FakeGain();
    g.gain.value = 1;
    return g;
  };
  createStereoPanner = () => Object.assign(new FakeNode(), { pan: new FakeParam() });
  createBiquadFilter = () => Object.assign(new FakeNode(), { type: '', frequency: new FakeParam(), Q: new FakeParam() });
  createDynamicsCompressor = () =>
    Object.assign(new FakeNode(), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() });
  createWaveShaper = () => Object.assign(new FakeNode(), { curve: null, oversample: 'none' });
  createDelay = () => Object.assign(new FakeNode(), { delayTime: new FakeParam() });
  createBuffer = (_c: number, len: number) => ({ duration: len / this.sampleRate, getChannelData: () => new Float32Array(len) });
  createOscillator = (): FakeSource => this.src();
  createBufferSource = (): FakeSource => this.src();
  private src(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  /** Advance the clock and fire `onended` for every source whose stop time has passed. */
  advance(dt: number): void {
    this.currentTime += dt;
    for (const s of this.sources.splice(0)) {
      if (s.stopAt <= this.currentTime) s.onended?.();
      else this.sources.push(s);
    }
  }
}

function rig(): { sfx: Sfx; ctx: FakeCtx } {
  const sfx = new Sfx();
  const ctx = new FakeCtx();
  sfx.attach(ctx as unknown as BaseAudioContext);
  return { sfx, ctx };
}

describe('audio mix safety', () => {
  it('the soft clipper is bounded, odd, monotonic and transparent at normal levels', () => {
    const c = softClipCurve(1001);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
    for (const v of c) expect(Math.abs(v)).toBeLessThanOrEqual(0.5);
    expect(c[500]).toBeCloseTo(0, 6);
    // input 0.5 (curve index for u = 0.5) passes unchanged (x0.5 pre-scale baked into the curve)
    expect(c[Math.round(((0.5 + 2) / 4) * 1000)] * 2).toBeCloseTo(0.5, 2);
    expect(c[0]).toBeCloseTo(-c[1000], 6);
  });

  it('unit() keeps settings and intensities finite and in range', () => {
    expect(unit(NaN)).toBe(1);
    expect(unit(Infinity, 0.5)).toBe(0.5);
    expect(unit(-3)).toBe(0);
    expect(unit(4)).toBe(1);
    expect(unit('x', 0.7)).toBe(0.7);
  });

  it('never throws on NaN intensity / pan or a corrupt volume setting', () => {
    const { sfx } = rig();
    const before = settings.sfxVolume;
    try {
      expect(() => sfx.play('hit', NaN, NaN, 'stone')).not.toThrow();
      settings.sfxVolume = NaN;
      expect(() => sfx.play('ko', 1, 0)).not.toThrow();
    } finally {
      settings.sfxVolume = before;
    }
  });

  it('caps polyphony, drops same-frame duplicates and frees every voice once its sources end', () => {
    const { sfx, ctx } = rig();
    const nodesAtRest = live;
    for (let i = 0; i < 20; i++) sfx.play('hitHeavy', 1, 0, 'stone');
    expect(sfx.activeSounds).toBe(1); // same sound in the same instant: one voice
    const names = ['hit', 'swing', 'land', 'zap', 'boom', 'clang', 'shield', 'jump', 'burn', 'splash'] as const;
    for (let f = 0; f < 120; f++) {
      ctx.currentTime += 1 / 60;
      for (const n of names) sfx.play(n, 0.8, 0, 'heavy');
      expect(sfx.activeSounds).toBeLessThanOrEqual(24);
    }
    ctx.advance(5);
    expect(sfx.activeSounds).toBe(0);
    expect(live).toBe(nodesAtRest); // every voice chain disconnected again
  });

  it('a KO always gets a voice even when the mix is full', () => {
    const { sfx, ctx } = rig();
    const names = ['hit', 'swing', 'land', 'zap', 'boom', 'clang', 'shield', 'jump', 'burn', 'splash', 'grab', 'throw'] as const;
    for (let f = 0; f < 4; f++) {
      ctx.currentTime += 0.03;
      for (const n of names) sfx.play(n, 0.8);
    }
    expect(sfx.activeSounds).toBe(24);
    ctx.currentTime += 0.03;
    sfx.play('ko', 1);
    expect(sfx.activeSounds).toBe(24);
  });

  it('volume changes glide instead of jumping', () => {
    const { sfx } = rig();
    sfx.play('jump', 0.5);
    const master = (sfx as unknown as { master: FakeGain }).master;
    const before = settings.sfxVolume;
    try {
      settings.sfxVolume = 0.3;
      sfx.syncVolume();
      expect(master.gain.events.at(-1)).toBe('target');
    } finally {
      settings.sfxVolume = before;
    }
  });
});

describe('track timbres', () => {
  it('every track sound option is in a sane range', () => {
    for (const t of Object.values(TRACKS)) {
      const s = t.sound ?? {};
      if (s.tone !== undefined) expect(s.tone, t.id).toBeGreaterThanOrEqual(2000);
      if (s.echo !== undefined) expect(s.echo, t.id).toBeLessThanOrEqual(0.5);
      if (s.detune !== undefined) expect(Math.abs(s.detune), t.id).toBeLessThanOrEqual(25);
    }
  });
});
