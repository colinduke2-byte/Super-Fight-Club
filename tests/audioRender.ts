/**
 * A small, pure-JS offline renderer for the subset of WebAudio the game's synth uses (oscillators, looped noise buffers,
 * biquads, gains with automation, panners, wave shapers, delays with feedback). It lets the tests *listen*: render a
 * sound or a stretch of music to samples and measure peak, loudness, length and spectrum without a browser.
 *
 * Fidelity: automation follows the WebAudio formulas, biquads use the spec's (RBJ) coefficients and Q conventions, and
 * oscillators are naive (not band-limited), so loudness agrees with Chromium to about a decibel. The master compressor
 * and convolution reverb are not modelled (compressor = pass-through, convolver = silent): measure the dry mix.
 *
 * Output is mono; a centred StereoPanner applies its -3 dB per channel, and `lufs()` counts the two identical channels,
 * so numbers line up with a stereo render.
 */

const BLOCK = 128;

type Ev = { type: 'set' | 'lin' | 'exp' | 'target'; v: number; t: number; tau: number };

export class RParam {
  private ev: Ev[] = [];
  /** Audio-rate modulators connected straight into the param (FM, LFOs). */
  inputs: RNode[] = [];
  private dflt: number;
  constructor(v: number) {
    this.dflt = v;
  }
  get value(): number {
    return this.ev.length ? this.at(this.ev[this.ev.length - 1].t + 1e-6) : this.dflt;
  }
  set value(v: number) {
    this.dflt = v;
  }
  private push(e: Ev): this {
    if (!Number.isFinite(e.v) || !Number.isFinite(e.t)) throw new TypeError('non-finite AudioParam value');
    let i = this.ev.length;
    while (i > 0 && this.ev[i - 1].t > e.t) i--;
    this.ev.splice(i, 0, e);
    return this;
  }
  setValueAtTime(v: number, t: number): this {
    return this.push({ type: 'set', v, t, tau: 0 });
  }
  linearRampToValueAtTime(v: number, t: number): this {
    return this.push({ type: 'lin', v, t, tau: 0 });
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    if (v <= 0) throw new RangeError('exponential ramp to a non-positive value');
    return this.push({ type: 'exp', v, t, tau: 0 });
  }
  setTargetAtTime(v: number, t: number, tau: number): this {
    return this.push({ type: 'target', v, t, tau });
  }
  cancelScheduledValues(t: number): this {
    this.ev = this.ev.filter((e) => e.t < t);
    return this;
  }
  /** True when the value never changes (lets nodes skip per-sample work). */
  get constant(): boolean {
    return this.ev.length === 0 && this.inputs.length === 0;
  }
  at(t: number): number {
    let kind: 'c' | 'tg' = 'c';
    let cv = this.dflt;
    let T0 = 0;
    let V0 = 0;
    let tau = 1;
    let prevT = 0;
    const val = (time: number): number => (kind === 'c' ? cv : cv + (V0 - cv) * Math.exp(-(time - T0) / tau));
    for (const e of this.ev) {
      if (e.type === 'lin' || e.type === 'exp') {
        const v0 = val(prevT);
        if (t < e.t) {
          const span = e.t - prevT;
          const k = span > 0 ? (t - prevT) / span : 1;
          if (t < prevT) return v0;
          if (e.type === 'lin') return v0 + (e.v - v0) * k;
          if (v0 <= 0 || v0 * e.v <= 0) return v0;
          return v0 * Math.pow(e.v / v0, k);
        }
        kind = 'c';
        cv = e.v;
        prevT = e.t;
      } else {
        if (t < e.t) return val(t);
        if (e.type === 'set') {
          kind = 'c';
          cv = e.v;
        } else {
          V0 = val(e.t);
          T0 = e.t;
          tau = Math.max(1e-6, e.tau);
          kind = 'tg';
          cv = e.v;
        }
        prevT = e.t;
      }
    }
    return val(t);
  }
  fill(t0: number, sr: number, out: Float32Array): Float32Array {
    if (this.ev.length === 0) out.fill(this.dflt);
    else {
      // evaluate every 8th sample and interpolate (envelopes here are >= 2 ms, so the error is far below a decibel)
      const S = 8;
      let prev = this.at(t0);
      for (let i = 0; i < out.length; i += S) {
        const ta = t0 + i / sr;
        const tb = t0 + Math.min(i + S, out.length) / sr;
        const next = this.at(tb);
        const n = Math.min(S, out.length - i);
        // an event inside the stretch may be a jump (setValueAtTime): evaluate it exactly
        if (this.ev.some((e) => e.t > ta && e.t <= tb)) for (let j = 0; j < n; j++) out[i + j] = this.at(ta + j / sr);
        else for (let j = 0; j < n; j++) out[i + j] = prev + ((next - prev) * j) / S;
        prev = next;
      }
    }
    const b = Math.round((t0 * sr) / BLOCK);
    for (const n of this.inputs) {
      const x = n.pull(b);
      if (x) for (let i = 0; i < out.length; i++) out[i] += x[i];
    }
    return out;
  }
}

export abstract class RNode {
  ins: RNode[] = [];
  outs = new Set<RNode>();
  private cacheBlock = -1;
  private cache: Float32Array | null = null;
  constructor(readonly ctx: RenderCtx) {}
  outParams = new Set<RParam>();
  connect<T extends RNode | RParam>(n: T): T {
    if (n instanceof RParam) {
      this.outParams.add(n);
      n.inputs.push(this);
    } else {
      this.outs.add(n);
      n.ins.push(this);
    }
    return n;
  }
  disconnect(): void {
    for (const o of this.outs) o.ins = o.ins.filter((x) => x !== this);
    for (const p of this.outParams) p.inputs = p.inputs.filter((x) => x !== this);
    this.outs.clear();
    this.outParams.clear();
  }
  /** Output for block `b`, or null for silence. */
  pull(b: number): Float32Array | null {
    if (this.cacheBlock === b) return this.cache;
    this.cacheBlock = b;
    this.cache = null; // a feedback loop that reaches back here reads silence for this block
    this.cache = this.process(b);
    return this.cache;
  }
  mixIns(b: number): Float32Array | null {
    let acc: Float32Array | null = null;
    for (const n of this.ins) {
      const x = n.pull(b);
      if (!x) continue;
      if (!acc) acc = Float32Array.from(x);
      else for (let i = 0; i < BLOCK; i++) acc[i] += x[i];
    }
    return acc;
  }
  protected abstract process(b: number): Float32Array | null;
}

class RGain extends RNode {
  gain = new RParam(1);
  private g = new Float32Array(BLOCK);
  protected process(b: number): Float32Array | null {
    const x = this.mixIns(b);
    if (!x) return null;
    if (this.gain.constant) {
      const k = this.gain.value;
      if (k === 0) return null;
      for (let i = 0; i < BLOCK; i++) x[i] *= k;
    } else {
      this.gain.fill(this.ctx.blockTime(b), this.ctx.sampleRate, this.g);
      for (let i = 0; i < BLOCK; i++) x[i] *= this.g[i];
    }
    return x;
  }
}

class RPass extends RNode {
  constructor(
    ctx: RenderCtx,
    private readonly k = 1,
  ) {
    super(ctx);
  }
  pan = new RParam(0);
  threshold = new RParam(0);
  knee = new RParam(0);
  ratio = new RParam(1);
  attack = new RParam(0);
  release = new RParam(0);
  protected process(b: number): Float32Array | null {
    const x = this.mixIns(b);
    if (x && this.k !== 1) for (let i = 0; i < BLOCK; i++) x[i] *= this.k;
    return x;
  }
}

class RSilent extends RNode {
  buffer: unknown = null;
  normalize = true;
  protected process(b: number): Float32Array | null {
    this.mixIns(b);
    return null;
  }
}

class RShaper extends RNode {
  curve: Float32Array | null = null;
  oversample = 'none';
  protected process(b: number): Float32Array | null {
    const x = this.mixIns(b);
    const c = this.curve;
    if (!x || !c) return x;
    const n = c.length - 1;
    for (let i = 0; i < BLOCK; i++) {
      const p = Math.max(0, Math.min(n, ((x[i] + 1) / 2) * n));
      const k = Math.floor(p);
      const f = p - k;
      x[i] = k >= n ? c[n] : c[k] * (1 - f) + c[k + 1] * f;
    }
    return x;
  }
}

class RDelay extends RNode {
  delayTime = new RParam(0);
  private buf: Float32Array;
  private w = 0;
  constructor(ctx: RenderCtx, max: number) {
    super(ctx);
    this.buf = new Float32Array(Math.ceil(max * ctx.sampleRate) + BLOCK * 2);
    ctx.delays.add(this);
  }
  /** Output only reads the past; the input is written in `feed` after the whole block is rendered, so feedback loops resolve. */
  protected process(_b: number): Float32Array | null {
    const n = this.buf.length;
    const d = Math.max(BLOCK, Math.round(this.delayTime.value * this.ctx.sampleRate));
    const out = new Float32Array(BLOCK);
    let any = false;
    for (let i = 0; i < BLOCK; i++) {
      const v = this.buf[(this.w + i - d + n * 4) % n];
      out[i] = v;
      if (v !== 0) any = true;
    }
    return any ? out : null;
  }
  feed(b: number): void {
    const n = this.buf.length;
    const x = this.mixIns(b);
    for (let i = 0; i < BLOCK; i++) this.buf[(this.w + i) % n] = x ? x[i] : 0;
    this.w = (this.w + BLOCK) % n;
  }
}

class RBiquad extends RNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new RParam(350);
  Q = new RParam(1);
  gain = new RParam(0);
  detune = new RParam(0);
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private c = [1, 0, 0, 0, 0];
  private coef(t: number): void {
    const sr = this.ctx.sampleRate;
    const f = Math.max(10, Math.min(sr / 2 - 1, this.frequency.at(t)));
    const w0 = (2 * Math.PI * f) / sr;
    const cs = Math.cos(w0);
    const sn = Math.sin(w0);
    const q = this.Q.at(t);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    if (this.type === 'bandpass') {
      const alpha = sn / (2 * Math.max(1e-4, q));
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cs;
      a2 = 1 - alpha;
    } else {
      // lowpass / highpass: Q is a resonance in dB (WebAudio spec)
      const alpha = sn / (2 * Math.pow(10, q / 20));
      if (this.type === 'highpass') {
        b0 = (1 + cs) / 2;
        b1 = -(1 + cs);
        b2 = (1 + cs) / 2;
      } else {
        b0 = (1 - cs) / 2;
        b1 = 1 - cs;
        b2 = (1 - cs) / 2;
      }
      a0 = 1 + alpha;
      a1 = -2 * cs;
      a2 = 1 - alpha;
    }
    this.c = [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  protected process(b: number): Float32Array | null {
    const x = this.mixIns(b);
    if (!x) {
      if (Math.abs(this.y1) + Math.abs(this.y2) < 1e-7) return null;
    }
    const inp = x ?? new Float32Array(BLOCK);
    const t0 = this.ctx.blockTime(b);
    const sr = this.ctx.sampleRate;
    const live = !(this.frequency.constant && this.Q.constant);
    for (let i = 0; i < BLOCK; i++) {
      if (i % 16 === 0 && (live || (b === 0 && i === 0) || this.c[0] === 1)) this.coef(t0 + i / sr);
      const [b0, b1, b2, a1, a2] = this.c;
      const y = b0 * inp[i] + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
      this.x2 = this.x1;
      this.x1 = inp[i];
      this.y2 = this.y1;
      this.y1 = y;
      inp[i] = y;
    }
    return inp;
  }
}

abstract class RSource extends RNode {
  onended: (() => void) | null = null;
  protected t0 = Infinity;
  protected t1 = Infinity;
  start(t = 0, _offset = 0): void {
    this.t0 = Math.max(t, 0);
    this.ctx.sources.add(this);
  }
  stop(t = 0): void {
    this.t1 = t;
  }
  /** Fire onended once the render is past the stop time (keeps the synth's voice bookkeeping honest). */
  tick(now: number): void {
    if (now >= this.t1) {
      this.ctx.sources.delete(this);
      this.onended?.();
    }
  }
  protected process(b: number): Float32Array | null {
    const t = this.ctx.blockTime(b);
    const sr = this.ctx.sampleRate;
    if (t + BLOCK / sr <= this.t0 || t >= this.t1) return null;
    const out = new Float32Array(BLOCK);
    this.gen(t, sr, out);
    for (let i = 0; i < BLOCK; i++) {
      const ti = t + i / sr;
      if (ti < this.t0 || ti >= this.t1) out[i] = 0;
    }
    return out;
  }
  protected abstract gen(t: number, sr: number, out: Float32Array): void;
}

class ROsc extends RSource {
  type: OscillatorType = 'sine';
  frequency = new RParam(440);
  detune = new RParam(0);
  private phase = 0;
  private f = new Float32Array(BLOCK);
  protected gen(t: number, sr: number, out: Float32Array): void {
    this.frequency.fill(t, sr, this.f);
    const det = this.detune.constant ? this.detune.value : this.detune.at(t);
    const dk = Math.pow(2, det / 1200);
    for (let i = 0; i < BLOCK; i++) {
      if (t + i / sr < this.t0) continue;
      const p = this.phase;
      let v: number;
      switch (this.type) {
        case 'square':
          v = p < 0.5 ? 1 : -1;
          break;
        case 'sawtooth':
          v = 2 * p - 1;
          break;
        case 'triangle':
          v = p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
          break;
        default:
          v = Math.sin(2 * Math.PI * p);
      }
      out[i] = v;
      this.phase = (p + (this.f[i] * dk) / sr) % 1;
    }
  }
}

class RBufferSource extends RSource {
  buffer: RBuffer | null = null;
  loop = false;
  playbackRate = new RParam(1);
  detune = new RParam(0);
  private pos = 0;
  override start(t = 0, offset = 0): void {
    super.start(t);
    this.pos = (offset || 0) * this.ctx.sampleRate;
  }
  protected gen(t: number, sr: number, out: Float32Array): void {
    const d = this.buffer?.data;
    if (!d) return;
    const rate = this.playbackRate.value;
    for (let i = 0; i < BLOCK; i++) {
      if (t + i / sr < this.t0) continue;
      let k = Math.floor(this.pos);
      if (k >= d.length) {
        if (!this.loop) return;
        this.pos -= d.length;
        k = Math.floor(this.pos);
      }
      out[i] = d[k];
      this.pos += rate;
    }
  }
}

interface RBuffer {
  data: Float32Array;
  duration: number;
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData(c: number): Float32Array;
}

class RDest extends RNode {
  protected process(b: number): Float32Array | null {
    return this.mixIns(b);
  }
}

/** The offline context: build a graph with the usual factory methods, then `render(seconds)`. */
export class RenderCtx {
  readonly sampleRate: number;
  currentTime = 0;
  state = 'running';
  readonly destination: RDest;
  readonly sources = new Set<RSource>();
  readonly delays = new Set<RDelay>();
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.destination = new RDest(this);
  }
  blockTime(b: number): number {
    return (b * BLOCK) / this.sampleRate;
  }
  createGain = (): RGain => new RGain(this);
  createOscillator = (): ROsc => new ROsc(this);
  createBufferSource = (): RBufferSource => new RBufferSource(this);
  createBiquadFilter = (): RBiquad => new RBiquad(this);
  createStereoPanner = (): RPass => new RPass(this, Math.SQRT1_2);
  createDynamicsCompressor = (): RPass => new RPass(this);
  createWaveShaper = (): RShaper => new RShaper(this);
  createDelay = (max = 1): RDelay => new RDelay(this, max);
  createConvolver = (): RSilent => new RSilent(this);
  createBuffer = (_ch: number, length: number, sampleRate: number): RBuffer => {
    const data = new Float32Array(length);
    return { data, length, sampleRate, duration: length / sampleRate, numberOfChannels: 1, getChannelData: () => data };
  };
  /** Render from the current time for `seconds`; `onBlock` runs before each block (to schedule more, e.g. music). */
  render(seconds: number, onBlock?: (t: number) => void): Float32Array {
    const n = Math.ceil((seconds * this.sampleRate) / BLOCK);
    const out = new Float32Array(n * BLOCK);
    const b0 = Math.round((this.currentTime * this.sampleRate) / BLOCK);
    for (let k = 0; k < n; k++) {
      const b = b0 + k;
      this.currentTime = this.blockTime(b);
      onBlock?.(this.currentTime);
      const x = this.destination.pull(b);
      if (x) out.set(x, k * BLOCK);
      for (const d of this.delays) d.feed(b);
      for (const s of [...this.sources]) s.tick(this.currentTime);
    }
    this.currentTime = this.blockTime(b0 + n);
    return out;
  }
}

// ---- measurement ----------------------------------------------------------------------------------------------------

export const db = (v: number): number => 20 * Math.log10(Math.max(v, 1e-9));

export function peakDb(x: Float32Array): number {
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  return db(p);
}

/** K-weighting (BS.1770 pre-filter + RLB) as two biquads at the render's sample rate. */
function kWeight(x: Float32Array, sr: number): Float32Array {
  const biq = (inp: Float32Array, c: number[]): Float32Array => {
    const [b0, b1, b2, a1, a2] = c;
    const out = new Float32Array(inp.length);
    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0;
    for (let i = 0; i < inp.length; i++) {
      const y = b0 * inp[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = inp[i];
      y2 = y1;
      y1 = y;
      out[i] = y;
    }
    return out;
  };
  // high shelf (+4 dB above ~1.7 kHz)
  {
    const f0 = 1681.97,
      G = 3.99984,
      Q = 0.7071752;
    const K = Math.tan((Math.PI * f0) / sr);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    const a0 = 1 + K / Q + K * K;
    x = biq(x, [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]);
  }
  // high pass (~38 Hz)
  {
    const f0 = 38.13547,
      Q = 0.5003270373238773;
    const K = Math.tan((Math.PI * f0) / sr);
    const a0 = 1 + K / Q + K * K;
    x = biq(x, [1 / a0, -2 / a0, 1 / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]);
  }
  return x;
}

/**
 * Loudness of a mono render played on both stereo channels, LUFS-style: `momentary` is the loudest 400 ms window,
 * `integrated` the gated mean over the whole render (BS.1770 gating).
 */
export function lufs(x: Float32Array, sr: number): { momentary: number; integrated: number } {
  const k = kWeight(x, sr);
  const w = Math.round(0.4 * sr);
  const hop = Math.round(0.1 * sr);
  const pow: number[] = [];
  const sq = new Float64Array(k.length + 1);
  for (let i = 0; i < k.length; i++) sq[i + 1] = sq[i] + k[i] * k[i];
  const len = Math.max(k.length, w);
  for (let s = 0; s + w <= len; s += hop) {
    const e = Math.min(k.length, s + w);
    pow.push((2 * (sq[e] - sq[Math.min(s, k.length)])) / w);
  }
  const L = (p: number): number => -0.691 + 10 * Math.log10(p + 1e-12);
  const momentary = Math.max(...pow.map(L));
  const abs = pow.filter((p) => L(p) > -70);
  if (!abs.length) return { momentary, integrated: -99 };
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((p) => L(p) > rel);
  return { momentary, integrated: L(g.reduce((a, b) => a + b, 0) / g.length) };
}

/** Seconds from the first to the last sample above `floorDb`. */
export function audibleSpan(x: Float32Array, sr: number, floorDb = -60): { start: number; end: number } {
  const th = Math.pow(10, floorDb / 20);
  let s = -1,
    e = -1;
  for (let i = 0; i < x.length; i++)
    if (Math.abs(x[i]) > th) {
      if (s < 0) s = i;
      e = i;
    }
  return { start: s / sr, end: e / sr };
}

/** Normalised log-band energy profile (24 bands, 40 Hz .. Nyquist): a coarse spectral fingerprint. */
export function bandProfile(x: Float32Array, sr: number): number[] {
  const N = 4096;
  const bands = 24;
  const lo = Math.log(40);
  const hi = Math.log(sr / 2);
  const acc = new Array<number>(bands).fill(0);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let s = 0; s + N <= x.length; s += N / 2) {
    for (let i = 0; i < N; i++) {
      re[i] = x[s + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let i = 1; i < N / 2; i++) {
      const f = (i * sr) / N;
      if (f < 40) continue;
      const band = Math.min(bands - 1, Math.floor(((Math.log(f) - lo) / (hi - lo)) * bands));
      acc[band] += re[i] * re[i] + im[i] * im[i];
    }
  }
  const tot = acc.reduce((a, b) => a + b, 0) || 1;
  return acc.map((v) => v / tot);
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j],
          ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr;
        im[i + j + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Distance between two band profiles: 0 identical, 2 disjoint (L1). */
export function profileDistance(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d;
}

/** Deterministic Math.random for the duration of `fn` (the synth varies pitch and level randomly). */
export function seeded<T>(fn: () => T, seed = 12345): T {
  const orig = Math.random;
  let s = seed >>> 0;
  Math.random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}
