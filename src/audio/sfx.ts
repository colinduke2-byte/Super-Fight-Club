import { settings } from '../settings';
import type { SoundStyle } from '../engine/fxTypes';
import type { SoundName } from './soundMap';

/**
 * Sonic flavour of a fighter: the engine's `SoundStyle` plus 'overseer', the boss's own heavy, metallic and ominous set
 * (picked from fx data: the style 'overseer', or a mechanical colossus; see audio/matchCalls.ts styleOf).
 */
export type AudioStyle = SoundStyle | 'overseer';
export const AUDIO_STYLES: readonly AudioStyle[] = ['plain', 'heavy', 'blade', 'arcane', 'mech', 'fire', 'wind', 'water', 'stone', 'ice', 'military', 'overseer'];

/** A fighter's (or the announcer's) synthetic voice: pitch, vocal-tract size, breathiness, roughness and a robot ring. */
export interface VoiceProfile {
  /** Speaking pitch (Hz). */
  f0: number;
  /** Vocal tract length relative to an adult's: larger lowers the formants (a bigger body), smaller raises them. */
  tract: number;
  /** Breath noise mixed into the voice (0..1). */
  breath: number;
  /** Growl: a fast pitch wobble (fraction of the pitch); 0 for a clean voice. */
  growl: number;
  /** Ring-modulator frequency (Hz) for a robot voice; 0 for none. */
  ring: number;
}

/** Each fighter flavour's voice: Brick's barrel chest, Nova's bright voice, Gizmo's chirpy circuits, the Overseer's machine. */
export const VOICES: Record<AudioStyle | 'announcer', VoiceProfile> = {
  plain: { f0: 150, tract: 1, breath: 0.15, growl: 0, ring: 0 },
  heavy: { f0: 96, tract: 1.16, breath: 0.1, growl: 0.025, ring: 0 },
  blade: { f0: 176, tract: 0.94, breath: 0.22, growl: 0, ring: 0 },
  arcane: { f0: 236, tract: 0.86, breath: 0.25, growl: 0, ring: 0 },
  mech: { f0: 210, tract: 0.9, breath: 0, growl: 0, ring: 92 },
  fire: { f0: 134, tract: 1.04, breath: 0.2, growl: 0.02, ring: 0 },
  wind: { f0: 196, tract: 0.92, breath: 0.4, growl: 0, ring: 0 },
  water: { f0: 152, tract: 1, breath: 0.22, growl: 0, ring: 0 },
  stone: { f0: 70, tract: 1.3, breath: 0.08, growl: 0.04, ring: 0 },
  ice: { f0: 214, tract: 0.9, breath: 0.32, growl: 0, ring: 0 },
  military: { f0: 118, tract: 1.08, breath: 0.12, growl: 0.012, ring: 0 },
  overseer: { f0: 55, tract: 1.42, breath: 0.04, growl: 0.03, ring: 37 },
  announcer: { f0: 96, tract: 1.1, breath: 0.06, growl: 0.006, ring: 0 },
};

/** Vowel formants (Hz: F1, F2, F3) for an adult voice; 'm' is a hummed nasal and 'r' the r-colour. */
const VOWELS = {
  a: [730, 1090, 2440],
  e: [530, 1840, 2480],
  ey: [420, 2020, 2600],
  i: [280, 2250, 2950],
  o: [570, 840, 2410],
  u: [320, 870, 2240],
  uh: [560, 1190, 2390],
  ae: [660, 1720, 2410],
  m: [260, 1000, 2200],
  r: [460, 1200, 1600],
} as const;
type Vowel = keyof typeof VOWELS;

/**
 * A spoken word or grunt for the formant voice: points in time (s) with the vowel being shaped, the loudness (0..1) and the
 * pitch (times the voice's own), glided between; consonant bursts of filtered noise; and where it ends.
 */
interface Word {
  parts: [t: number, v: Vowel, amp: number, pitch: number][];
  bursts?: [t: number, f: number, dur: number, vol: number][];
  end: number;
}

const WORDS: Record<string, Word> = {
  // "ready?": an r, a short e, the d, and a long rising ee
  ready: {
    parts: [[0, 'r', 0.35, 0.95], [0.07, 'e', 1, 1], [0.18, 'e', 0.9, 1], [0.22, 'uh', 0.12, 1], [0.26, 'i', 0.95, 1.06], [0.52, 'i', 0.7, 1.32]],
    bursts: [[0.215, 3800, 0.022, 0.5]],
    end: 0.62,
  },
  // "go!": a g burst and a long falling oh-oo
  go: {
    parts: [[0, 'uh', 0.2, 1.15], [0.04, 'o', 1, 1.18], [0.3, 'o', 0.95, 1.05], [0.46, 'u', 0.55, 0.85]],
    bursts: [[0, 1600, 0.035, 0.7]],
    end: 0.58,
  },
  // "game!": g, a long ay gliding to ee, closing on a hummed m
  game: {
    parts: [[0, 'uh', 0.2, 1.1], [0.04, 'ey', 1, 1.12], [0.24, 'ey', 0.95, 1.05], [0.32, 'i', 0.8, 1], [0.36, 'm', 0.45, 0.95], [0.5, 'm', 0.3, 0.9]],
    bursts: [[0, 1700, 0.035, 0.7]],
    end: 0.6,
  },
  // "time!": a t burst, ah gliding to ee, a hummed m
  time: {
    parts: [[0, 'a', 0.3, 1.1], [0.05, 'a', 1, 1.12], [0.24, 'a', 0.9, 1.05], [0.34, 'i', 0.75, 1], [0.38, 'm', 0.45, 0.94], [0.5, 'm', 0.28, 0.9]],
    bursts: [[0, 4200, 0.03, 0.8]],
    end: 0.6,
  },
  // "K.O.!": kay, a breath of a gap, then a long oh
  ko: {
    parts: [[0, 'ey', 0.3, 1.15], [0.05, 'ey', 1, 1.18], [0.18, 'i', 0.85, 1.12], [0.24, 'uh', 0.2, 1.05], [0.29, 'o', 1, 1.1], [0.55, 'o', 0.9, 0.98], [0.68, 'u', 0.5, 0.85]],
    bursts: [[0, 2600, 0.04, 0.8]],
    end: 0.8,
  },
  // grunts: a sharp "hyah!" on a big swing
  attack: { parts: [[0, 'uh', 0.25, 1.2], [0.03, 'a', 1, 1.25], [0.12, 'a', 0.85, 1.05], [0.2, 'uh', 0.3, 0.85]], bursts: [[0, 1300, 0.04, 0.45]], end: 0.26 },
  // "uhh!": the air knocked out on a heavy hit
  hurt: { parts: [[0, 'uh', 1, 1.15], [0.07, 'uh', 0.8, 1], [0.16, 'o', 0.35, 0.8]], end: 0.22 },
  // "whoaaa...": sent flying off the screen, the pitch and the voice falling away
  koCry: { parts: [[0, 'u', 0.4, 1.25], [0.06, 'o', 1, 1.35], [0.35, 'a', 0.85, 1.2], [0.7, 'a', 0.45, 0.85], [0.95, 'uh', 0.15, 0.6]], end: 1.05 },
  // "ha-ha!": a short laugh
  laugh: {
    parts: [[0, 'a', 0.2, 1.1], [0.03, 'a', 1, 1.15], [0.11, 'a', 0.6, 1.05], [0.15, 'uh', 0.08, 1], [0.21, 'a', 0.95, 1.08], [0.3, 'a', 0.55, 0.95], [0.36, 'uh', 0.1, 0.9]],
    bursts: [[0, 1200, 0.03, 0.35], [0.18, 1200, 0.03, 0.3]],
    end: 0.4,
  },
};

/** Concurrent sounds (not nodes) across the whole mix; a sound is one recipe, a handful of oscillators / noise bursts. */
const MAX_SOUNDS = 24;
/** Concurrent copies of one sound: a fourth hit steals the oldest instead of stacking into a wall of noise. */
const MAX_SAME = 3;
/** The same sound retriggered within this many seconds is dropped (two fighters' identical events in one frame). */
const MIN_GAP = 0.028;
/** Repeats inside this window are attenuated so rapid multi-hits do not build up. */
const STACK_WINDOW = 0.1;
/** Sounds that always get a voice, stealing the oldest ordinary one if the mix is full. */
const PRIORITY: ReadonlySet<SoundName> = new Set<SoundName>(['ko', 'shieldBreak', 'parry', 'charge', 'ultimate', 'ready', 'go', 'roar', 'thunder', 'avalanche', 'callReady', 'callGo', 'callGame', 'callTime', 'callKo']);
/** Random pitch spread (fraction) per sound so repeats are not machine-gun identical; musical cues stay in tune. */
const NO_VARY: ReadonlySet<SoundName> = new Set<SoundName>(['ding', 'menuMove', 'menuOk', 'menuBack', 'freeze', 'ready', 'pickup', 'go', 'ultimate', 'taunt', 'coreGet', 'callReady', 'callGo', 'callGame', 'callTime', 'callKo']);
const VARY = 0.06;

/**
 * Loudness each sound is mixed to at full intensity, as momentary loudness (LUFS, 400 ms) of the dry sound on its own at
 * full volume. Grouped by role so the mix has a stable pecking order: menu blips < movement < light combat < heavy
 * combat < KO. `LEVEL_DB` below is measured against these (tests/audioLevels.test.ts renders every sound and checks).
 */
export const LOUDNESS_TARGET: Record<SoundName, number> = {
  // interface
  menuMove: -33,
  menuOk: -29,
  menuBack: -31,
  ding: -27,
  // movement (scaled down further by the cue's intensity in play)
  swing: -31,
  jump: -32,
  doubleJump: -31,
  land: -31,
  dodge: -32,
  ledge: -30,
  tech: -27,
  landBounce: -24,
  // light combat and status
  hit: -24,
  shield: -26,
  grab: -27,
  pummel: -28,
  throw: -23,
  bounce: -25,
  shoot: -28,
  zap: -25,
  reflect: -24,
  place: -28,
  break: -23,
  burn: -27,
  freeze: -27,
  slow: -28,
  stun: -26,
  splash: -27,
  blink: -27,
  hook: -27,
  slice: -27,
  gust: -28,
  spawn: -28,
  pickup: -26,
  ready: -24,
  // heavy combat and big moments
  hitHeavy: -20,
  clang: -22,
  parry: -20,
  boom: -17,
  shieldBreak: -18,
  charge: -21,
  go: -20,
  ultimate: -16,
  ko: -15,
  // footsteps: soft, well under every other movement sound
  stepMetal: -37,
  stepStone: -38,
  stepWood: -37,
  stepSnow: -38,
  stepGrass: -39,
  stepCrystal: -37,
  // character voices and flourishes
  taunt: -26,
  glint: -27,
  crowd: -27,
  // fighter voices: tasteful, under the hits they ride on (a KO cry under the KO itself)
  voxAttack: -27,
  voxHurt: -27,
  voxKo: -24,
  voxTaunt: -27,
  // the announcer's fallback voice: as present as a heavy hit
  callReady: -20,
  callGo: -19,
  callGame: -19,
  callTime: -19,
  callKo: -19,
  // items
  swordSwing: -28,
  swordHit: -23,
  rayShot: -26,
  crateBreak: -23,
  crateBoom: -21,
  coreGet: -23,
  // stage hazards and the boss: big moments, still under a KO
  stalactite: -19,
  waterSpout: -20,
  geyser: -19,
  avalanche: -18,
  thunder: -17,
  roar: -16,
};

/** Longest a sound may ring (seconds, audible span 40 dB under its peak); everything else stays under a second. */
export const SOUND_SPAN: Partial<Record<SoundName, number>> = {
  ko: 1.6,
  ultimate: 1.6,
  thunder: 2.4,
  avalanche: 2.4,
  roar: 2,
  crowd: 2.4,
  geyser: 1.6,
  waterSpout: 1.4,
  stalactite: 1.3,
  voxKo: 1.3,
};

/**
 * Per-sound trim in dB, measured: rendering each recipe at full intensity and comparing with LOUDNESS_TARGET. Keeps the
 * recipes free to be written for timbre while the mix stays level. Re-measure after editing a recipe.
 */
export const LEVEL_DB: Record<SoundName, number> = {
  swing: 9.9, hit: 2.4, hitHeavy: -2.1, clang: 1.9, shield: 3.4, shieldBreak: 2.6, jump: 2.7, doubleJump: 2.7,
  land: 1.5, landBounce: -1.2, bounce: 3.4, tech: 5.4, ledge: 4.4, dodge: 5.0, grab: 5.3, throw: 2.7, pummel: 3.9,
  ko: -1.0, shoot: 4.9, zap: 5.6, reflect: 3.1, place: 2.3, parry: 3.6, boom: 0.4, break: 1.9, burn: 13.1,
  freeze: 0.3, slow: -0.1, stun: 3.4, splash: 7.2, blink: 0.1, hook: 7.6, charge: -0.4, ding: -3.3, menuMove: 4.9,
  menuOk: 2.9, menuBack: 3.4, slice: 10.1, gust: 11.5, spawn: 5.6, pickup: 4.9, ready: 2.3, ultimate: 1.4, go: 1.3,
  taunt: 8, roar: 1.4, thunder: 0, avalanche: -0.7, geyser: -2.0, waterSpout: 2.7, stalactite: -0.8,
  stepMetal: 1.5, stepStone: 1.7, stepWood: -2.8, stepSnow: 5.5, stepGrass: -5.1, stepCrystal: 1.8, crowd: 7.9,
  glint: 4.1, swordSwing: 6.1, swordHit: 3.6, rayShot: 3.4, crateBreak: 4.9, crateBoom: 4.6, coreGet: 2.3,
  voxAttack: -6.4, voxHurt: -5.1, voxKo: -8.8, voxTaunt: -7.1, callReady: -4.5, callGo: -2.9, callGame: -2.4, callTime: -1.5, callKo: -2.9,
};

/** Extra trim (dB) for a style's swing / hits so every fighter lands at the same loudness (on top of LEVEL_DB). */
export const STYLE_DB: Partial<Record<string, number>> = {
  'hit:arcane': -0.6, 'hit:blade': -0.9, 'hit:fire': 1.6, 'hit:heavy': -1.6, 'hit:ice': 0.8, 'hit:mech': 0.4,
  'hit:military': -3.1, 'hit:stone': -3.8, 'hit:water': -0.8, 'hit:wind': -1.1, 'hitHeavy:arcane': 2.6,
  'hitHeavy:blade': 2.7, 'hitHeavy:fire': 3.2, 'hitHeavy:heavy': 2.2, 'hitHeavy:ice': 3.4, 'hitHeavy:mech': 2.9,
  'hitHeavy:military': 0.3, 'hitHeavy:stone': 0.7, 'hitHeavy:water': 0.8, 'hitHeavy:wind': 2.3, 'swing:arcane': -5.2,
  'swing:blade': -6.4, 'swing:fire': -1.4, 'swing:heavy': -9.6, 'swing:ice': -12.6, 'swing:mech': -6.1,
  'swing:military': -3.9, 'swing:stone': -10.3, 'swing:water': -3.1, 'swing:wind': -5.8,
  'taunt:heavy': -10.9, 'taunt:blade': -3.5, 'taunt:arcane': -6.7, 'taunt:mech': 1.6, 'taunt:fire': 3.2,
  'taunt:wind': -4.0, 'taunt:water': 2.9, 'taunt:stone': -7.9, 'taunt:ice': -6.0, 'taunt:military': -3.4,
  // the Overseer's own set
  'swing:overseer': -9.5, 'hit:overseer': -6.6, 'hitHeavy:overseer': -1.1, 'taunt:overseer': -2.0,
  // fighter voices
  'voxAttack:heavy': 1.2, 'voxAttack:blade': -0.4, 'voxAttack:arcane': -1.0, 'voxAttack:mech': -3.7, 'voxAttack:fire': 0.6, 'voxAttack:wind': 0.3, 'voxAttack:water': 0.2, 'voxAttack:stone': 2.0, 'voxAttack:ice': 0.0, 'voxAttack:military': 0.6, 'voxAttack:overseer': 0.9,
  'voxHurt:heavy': 0.9, 'voxHurt:blade': -0.2, 'voxHurt:arcane': -0.7, 'voxHurt:mech': -5.7, 'voxHurt:fire': 0.1, 'voxHurt:wind': -0.4, 'voxHurt:water': 0.4, 'voxHurt:stone': 1.8, 'voxHurt:ice': -0.6, 'voxHurt:military': 0.5, 'voxHurt:overseer': 0.4,
  'voxKo:heavy': 1.2, 'voxKo:blade': -0.1, 'voxKo:arcane': -0.6, 'voxKo:mech': -3.7, 'voxKo:fire': 0.8, 'voxKo:wind': 1.0, 'voxKo:water': 0.3, 'voxKo:stone': 2.1, 'voxKo:ice': 0.2, 'voxKo:military': 0.8, 'voxKo:overseer': 1.4,
  'voxTaunt:heavy': 1.0, 'voxTaunt:blade': -0.4, 'voxTaunt:arcane': -0.5, 'voxTaunt:mech': -1.6, 'voxTaunt:fire': 0.4, 'voxTaunt:wind': 0.1, 'voxTaunt:water': 0.4, 'voxTaunt:stone': 1.9, 'voxTaunt:ice': -0.1, 'voxTaunt:military': 0.6, 'voxTaunt:overseer': 0.7,
};

/** Sounds that dip the music and ambience for a moment ([gain, hold seconds]) so the big hits punch through. */
const DUCK: Partial<Record<SoundName, [number, number]>> = {
  ko: [0.45, 0.7],
  ultimate: [0.5, 0.9],
  shieldBreak: [0.6, 0.45],
  boom: [0.72, 0.25],
  hitHeavy: [0.8, 0.16],
  go: [0.7, 0.3],
  roar: [0.55, 1.2],
  thunder: [0.65, 0.8],
  avalanche: [0.65, 1.0],
  geyser: [0.75, 0.5],
  // the announcer's fallback voice dips the music like the speech voice does
  callReady: [0.6, 0.6],
  callGo: [0.6, 0.5],
  callGame: [0.6, 0.6],
  callTime: [0.6, 0.6],
  callKo: [0.6, 0.8],
};

/** A room for the effects: reverb tail length (s), wet level and the tail's brightness (Hz). */
export interface Space {
  decay: number;
  wet: number;
  tone: number;
}
/** Per stage backdrop (the ambience theme); 'default' is the menus and anything unlisted. */
export const SPACES: Record<string, Space> = {
  default: { decay: 0.8, wet: 0.1, tone: 5000 },
  skyline: { decay: 0.9, wet: 0.1, tone: 5500 },
  storm: { decay: 1.1, wet: 0.12, tone: 4000 },
  tide: { decay: 0.9, wet: 0.1, tone: 4500 },
  reactor: { decay: 1.3, wet: 0.16, tone: 6000 },
  temple: { decay: 1.9, wet: 0.2, tone: 4500 },
  dawn: { decay: 0.6, wet: 0.07, tone: 6000 },
  void: { decay: 2.6, wet: 0.24, tone: 3500 },
  frost: { decay: 1.4, wet: 0.15, tone: 7000 },
  airship: { decay: 0.6, wet: 0.08, tone: 4500 },
  cavern: { decay: 2.4, wet: 0.26, tone: 3800 },
};

/**
 * Master bus dynamics. The compressor glues the mix and pulls peaks down; WebAudio's compressor adds its own make-up
 * gain, which `trim` takes back (quiet material passes at unity; a full-scale pile-up comes out near -3 dBFS). The soft clipper after it only touches the
 * rare transient that gets through.
 */
export const MIX = { threshold: -6, knee: 4, ratio: 10, attack: 0.002, release: 0.15, trim: 0.75 };

const dbToGain = (d: number): number => Math.pow(10, d / 20);

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

/** Gentle tanh saturation (input -1..1) for grit on heavy impacts; unity slope at zero, so levels barely move. */
function driveCurve(n = 1024, k = 2.2): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const u = -1 + (2 * i) / (n - 1);
    c[i] = Math.tanh(k * u) / norm;
  }
  return c;
}

/** Inharmonic partial ratios: a struck metal bar (clangs, blades) and a glassy plate (ice, crystal). */
const METAL = [1, 2.76, 5.4, 8.93];
const GLASS = [1, 2.32, 4.25, 6.63];

/** One playing sound: its gain (for stealing / fades) and how many of its sources are still running. */
interface Voice {
  name: SoundName;
  gain: GainNode;
  out: AudioNode;
  live: number;
  start: number;
  stolen: boolean;
}

interface ToneOpts {
  /** Seconds of linear fade-in (default 4 ms). */
  attack?: number;
  /** Fraction of the duration the pitch takes to reach f1 (default the whole sound); short = a percussive drop. */
  glide?: number;
  /** Frequency modulation: [modulator ratio, index]; brightens zaps, bells and magic. */
  fm?: [number, number];
  /** Vibrato: [rate Hz, depth as a fraction of the pitch]. */
  vib?: [number, number];
}

interface NoiseOpts {
  attack?: number;
  q?: number;
  /** Run through the saturation curve (gritty crunch). */
  drive?: boolean;
}

/**
 * Tiny WebAudio synth: every sound is built from oscillators + filtered noise, so there are no
 * audio assets. The AudioContext is created lazily and resumed on the first key / pointer gesture
 * (browser autoplay policy).
 *
 * Mix graph: sound voices -> sfx bus (sfx volume) -> mix, plus a send into a short reverb (the stage's room) -> mix; music
 * and ambience feed `output` (a bed that dips under KOs and heavy hits) -> mix. The mix runs through a compressor and a soft
 * clipper before the speakers, so a pile-up of hits, a KO and the music never clip.
 */
export class Sfx {
  private ctx: BaseAudioContext | null = null;
  private offline = false;
  private master: GainNode | null = null;
  private mix: GainNode | null = null;
  private bed: GainNode | null = null;
  private verb: ConvolverNode | null = null;
  private verbWet: GainNode | null = null;
  private verbTone: BiquadFilterNode | null = null;
  private space = '';
  private readonly irCache = new Map<number, AudioBuffer>();
  private drive: Float32Array<ArrayBuffer> | null = null;
  private noise: AudioBuffer | null = null;
  private voices: Voice[] = [];
  private cur: Voice | null = null;
  private pv = 1;
  private sfxLevel = -1;
  private duckEnd = 0;
  private duckDepth = 1;
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
  /** Where music and ambience connect: a bed into the compressed, limited mix that ducks under big moments. */
  get output(): AudioNode | null {
    return this.bed;
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
    this.duckEnd = 0;
    this.duckDepth = 1;
    this.irCache.clear();
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
    this.bed = ctx.createGain();
    this.bed.gain.value = 1;
    this.bed.connect(this.mix);
    this.drive = driveCurve();
    // the room: sfx bus -> highpass (keep the lows dry and tight) -> convolver -> tone -> wet level -> mix
    this.verb = null;
    this.verbWet = null;
    this.verbTone = null;
    if (typeof ctx.createConvolver === 'function') {
      try {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 280;
        this.verb = ctx.createConvolver();
        this.verbTone = ctx.createBiquadFilter();
        this.verbTone.type = 'lowpass';
        this.verbWet = ctx.createGain();
        this.verbWet.gain.value = 0;
        this.master.connect(hp).connect(this.verb).connect(this.verbTone).connect(this.verbWet).connect(this.mix);
      } catch {
        this.verb = null;
      }
    }
    // two seconds of white noise reused by every noise voice (each burst starts at a random offset)
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const want = this.space || 'default';
    this.space = '';
    this.setSpace(want);
  }

  /** Pick the room the effects ring in (a stage's ambience theme; unknown names get the default). Cheap to repeat. */
  setSpace(name: string | undefined): void {
    const key = name && SPACES[name] ? name : 'default';
    if (key === this.space && this.ctx) return;
    this.space = key;
    const ctx = this.ctx;
    if (!ctx || !this.verb || !this.verbWet || !this.verbTone) return;
    const s = SPACES[key];
    try {
      this.verb.buffer = this.impulse(ctx, s.decay);
    } catch {
      return;
    }
    const t = ctx.currentTime;
    this.verbTone.frequency.setValueAtTime(s.tone, t);
    this.verbWet.gain.cancelScheduledValues(t);
    this.verbWet.gain.setTargetAtTime(s.wet, t, 0.05);
  }

  /** A synthetic room impulse: decorrelated stereo noise with an exponential (60 dB over `decay`) tail that darkens. */
  private impulse(ctx: BaseAudioContext, decay: number): AudioBuffer {
    const key = Math.round(decay * 10);
    const hit = this.irCache.get(key);
    if (hit) return hit;
    const sr = ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * decay));
    const pre = Math.floor(sr * 0.008);
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr;
        const env = Math.exp((-6.9 * t) / decay);
        // a one-pole lowpass that closes as the tail decays: air absorbs the highs first
        const a = 0.15 + 0.8 * Math.exp((-3 * t) / decay);
        lp += a * (Math.random() * 2 - 1 - lp);
        d[i] = lp * env;
      }
    }
    this.irCache.set(key, buf);
    return buf;
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

  /** Dip the music / ambience bed to `depth` for `hold` seconds, then let it swell back (a deeper or longer dip wins). */
  private duck(depth: number, hold: number): void {
    const ctx = this.ctx;
    const bed = this.bed;
    if (!ctx || !bed) return;
    const now = ctx.currentTime;
    const active = now < this.duckEnd;
    const end = now + hold;
    if (active && depth >= this.duckDepth && end <= this.duckEnd) return;
    const d = active ? Math.min(depth, this.duckDepth) : depth;
    const until = Math.max(end, active ? this.duckEnd : 0);
    bed.gain.cancelScheduledValues(now);
    bed.gain.setTargetAtTime(d, now, 0.012);
    bed.gain.setTargetAtTime(1, until, 0.22);
    this.duckDepth = d;
    this.duckEnd = until;
  }

  /** pan: -1 (left) .. 1 (right). */
  play(name: SoundName, intensity = 0.7, pan = 0, style: AudioStyle = 'plain'): void {
    const ctx = this.context;
    if (!ctx || !this.master) return;
    // the crowd is optional (a menu setting; read defensively, on by default)
    if (name === 'crowd' && (settings as unknown as { crowd?: unknown }).crowd === false) return;
    // fighter voices are optional too (a menu setting, on by default)
    if (name.startsWith('vox') && (settings as unknown as { voices?: unknown }).voices === false) return;
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
    const st: AudioStyle = AUDIO_STYLES.includes(style) ? style : 'plain';
    const trim = dbToGain((LEVEL_DB[name] ?? 0) + (STYLE_DB[`${name}:${st}`] ?? 0));
    const gain = ctx.createGain();
    gain.gain.value = trim * (1 / Math.sqrt(1 + repeats)) * (0.9 + Math.random() * 0.2);
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
      this.recipe(name, k, gain, st);
    } finally {
      this.cur = null;
      this.pv = 1;
    }
    if (voice.live === 0) this.release(voice);
    const dk = DUCK[name];
    // only a heavy hit that really lands dips the music, not every chip of a multi-hit
    if (dk && (name !== 'hitHeavy' || k > 0.7)) this.duck(1 - (1 - dk[0]) * k, dk[1]);
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

  /** An oscillator sweeping f0 -> f1 under a click-free envelope; optional FM, vibrato and a fast percussive glide. */
  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, o: ToneOpts = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    const a = Math.max(20, f0 * this.pv);
    const b = Math.max(20, f1 * this.pv);
    const gl = Math.max(0.01, Math.min(1, o.glide ?? 1)) * dur;
    osc.frequency.setValueAtTime(a, t);
    osc.frequency.exponentialRampToValueAtTime(b, t + gl);
    this.env(g, t, vol, dur, o.attack);
    osc.connect(g).connect(dest);
    const end = t + dur + 0.02;
    if (o.fm) {
      const [ratio, index] = o.fm;
      const m = ctx.createOscillator();
      const mg = ctx.createGain();
      m.frequency.setValueAtTime(a * ratio, t);
      m.frequency.exponentialRampToValueAtTime(b * ratio, t + gl);
      mg.gain.setValueAtTime(a * index, t);
      mg.gain.exponentialRampToValueAtTime(Math.max(1, b * index * 0.3), t + dur);
      m.connect(mg).connect(osc.frequency);
      m.start(t);
      this.track(m, end, [mg]);
    }
    if (o.vib) {
      const [rate, depth] = o.vib;
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = rate;
      lg.gain.value = a * depth;
      l.connect(lg).connect(osc.frequency);
      l.start(t);
      this.track(l, end, [lg]);
    }
    osc.start(t);
    this.track(osc, end, [g]);
  }

  private noiseBurst(dest: AudioNode, type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, delay = 0, o: NoiseOpts = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(Math.max(30, f0 * this.pv), t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1 * this.pv), t + dur);
    flt.Q.value = o.q ?? (type === 'bandpass' ? 1.4 : 0.7);
    const g = ctx.createGain();
    this.env(g, t, vol, dur, o.attack);
    const chain: AudioNode[] = [flt, g];
    let head: AudioNode = flt;
    if (o.drive && this.drive) {
      const sh = ctx.createWaveShaper();
      sh.curve = this.drive;
      head = flt.connect(sh);
      chain.push(sh);
    }
    src.connect(flt);
    head.connect(g).connect(dest);
    // a random point in the noise so no two bursts are sample-identical
    src.start(t, Math.random() * 1.5);
    this.track(src, t + dur + 0.02, chain);
  }

  /** A sharp transient (a few ms of bright noise) that gives an impact its edge. */
  private click(d: AudioNode, vol: number, delay = 0, hp = 3500): void {
    this.noiseBurst(d, 'highpass', hp, hp, 0.012, vol, delay, { attack: 0.0006 });
  }

  /** A struck, ringing body: inharmonic partials, the higher ones dying first. */
  private ring(d: AudioNode, f: number, dur: number, vol: number, delay = 0, partials: number[] = METAL): void {
    // partials above ~16 kHz are inaudible to most players and alias (or get clamped) near Nyquist: leave them out
    const top = Math.min(16000, this.ctx!.sampleRate * 0.42);
    partials.forEach((r, i) => {
      if (f * r * 1.07 > top) return;
      this.tone(d, 'sine', f * r, f * r * 0.996, dur / (1 + i * 0.7), vol / Math.pow(i + 1, 0.9), delay, { attack: 0.002 });
    });
  }

  /** Little ticks of bright noise scattered over `spread` seconds: fire crackle, grit, gear rattle. */
  private crackle(d: AudioNode, n: number, spread: number, vol: number, delay = 0, f = 3200): void {
    for (let i = 0; i < n; i++) {
      const at = delay + Math.random() * spread;
      this.noiseBurst(d, 'bandpass', f * (0.8 + Math.random() * 0.6), f, 0.008 + Math.random() * 0.01, vol * (0.5 + Math.random() * 0.5), at, { attack: 0.0008, q: 2 });
    }
  }

  /** Water bubbles: quick upward sine bloops. */
  private bubbles(d: AudioNode, n: number, spread: number, vol: number, delay = 0): void {
    for (let i = 0; i < n; i++) {
      const f = 380 + Math.random() * 520;
      this.tone(d, 'sine', f, f * 2.4, 0.03 + Math.random() * 0.03, vol * (0.6 + Math.random() * 0.4), delay + Math.random() * spread, { attack: 0.002 });
    }
  }

  // ---- fighter flavours ---------------------------------------------------------------------------

  /** Swing whoosh, flavoured per fighter style. Every whoosh swells in (no click) and lasts long enough to read as motion. */
  private swing(d: AudioNode, k: number, style: AudioStyle): void {
    switch (style) {
      case 'heavy':
        // a big, slow 'whoomp' of displaced air
        this.noiseBurst(d, 'lowpass', 900, 160, 0.2, 0.32 * k, 0, { attack: 0.04 });
        this.noiseBurst(d, 'bandpass', 380, 260, 0.18, 0.16 * k, 0, { attack: 0.05, q: 1 });
        this.tone(d, 'sine', 110, 58, 0.16, 0.2 * k, 0.02, { attack: 0.03 });
        break;
      case 'blade':
        // a thin, fast 'shwing': a high sweep and a whisper of steel
        this.noiseBurst(d, 'bandpass', 2400, 6400, 0.1, 0.3 * k, 0, { attack: 0.018, q: 2.2 });
        this.noiseBurst(d, 'highpass', 6000, 8000, 0.06, 0.07 * k, 0.03, { attack: 0.01 });
        this.tone(d, 'sine', 3300, 2900, 0.16, 0.05 * k, 0.03, { attack: 0.01 });
        this.ring(d, 1980, 0.18, 0.04 * k, 0.04);
        break;
      case 'arcane':
        // a shimmering sweep with sparkles trailing behind
        this.tone(d, 'sine', 620, 1240, 0.14, 0.11 * k, 0, { attack: 0.03, fm: [2, 0.6] });
        this.noiseBurst(d, 'bandpass', 1500, 3200, 0.12, 0.12 * k, 0, { attack: 0.03 });
        this.tone(d, 'sine', 2637, 2637, 0.1, 0.03 * k, 0.05);
        this.tone(d, 'sine', 3520, 3520, 0.09, 0.022 * k, 0.08);
        break;
      case 'mech':
        // a servo whirr and a hydraulic hiss
        this.tone(d, 'sawtooth', 180, 420, 0.1, 0.045 * k, 0, { attack: 0.012, vib: [38, 0.03] });
        this.tone(d, 'square', 360, 840, 0.08, 0.02 * k, 0.01, { attack: 0.01 });
        this.noiseBurst(d, 'highpass', 4200, 2600, 0.09, 0.12 * k, 0.03, { attack: 0.02 });
        this.click(d, 0.06 * k, 0, 2000);
        break;
      case 'wind':
        // a rising airy rush with a feathery flutter on top
        this.noiseBurst(d, 'bandpass', 1000, 3800, 0.16, 0.28 * k, 0, { attack: 0.04, q: 1 });
        this.noiseBurst(d, 'highpass', 5200, 2600, 0.09, 0.07 * k, 0.03, { attack: 0.02 });
        this.tone(d, 'sine', 820, 1500, 0.12, 0.035 * k, 0, { attack: 0.03, vib: [24, 0.04] });
        break;
      case 'fire':
        // a 'fwoosh' of flame with a few crackles
        this.noiseBurst(d, 'lowpass', 500, 2600, 0.16, 0.3 * k, 0, { attack: 0.035 });
        this.noiseBurst(d, 'bandpass', 900, 500, 0.14, 0.12 * k, 0.02, { attack: 0.03, drive: true });
        this.crackle(d, 3, 0.12, 0.12 * k, 0.02, 3800);
        break;
      case 'water':
        // a wet swish: a falling bandpass sweep and a bubble or two
        this.noiseBurst(d, 'bandpass', 1800, 600, 0.15, 0.3 * k, 0, { attack: 0.03, q: 1.2 });
        this.bubbles(d, 2, 0.08, 0.06 * k, 0.03);
        break;
      case 'stone':
        // a heavy grinding swing: a low rumble of rock with a faint glassy ring
        this.noiseBurst(d, 'lowpass', 650, 130, 0.2, 0.32 * k, 0, { attack: 0.04, drive: true });
        this.tone(d, 'sine', 72, 46, 0.16, 0.22 * k, 0, { attack: 0.03 });
        this.ring(d, 1560, 0.16, 0.022 * k, 0.04, GLASS);
        break;
      case 'ice':
        // a crisp, glassy hiss: cold and high where the blade is steely
        this.noiseBurst(d, 'highpass', 6500, 9000, 0.14, 0.2 * k, 0, { attack: 0.03 });
        this.crackle(d, 4, 0.1, 0.06 * k, 0.02, 7000);
        this.ring(d, 2637, 0.28, 0.06 * k, 0.03, GLASS);
        this.ring(d, 3951, 0.2, 0.03 * k, 0.07, GLASS);
        break;
      case 'military':
        // a hard rifle-butt swing: a punchy whoosh and the rattle of kit
        this.noiseBurst(d, 'lowpass', 1400, 400, 0.1, 0.3 * k, 0, { attack: 0.02 });
        this.tone(d, 'sine', 160, 80, 0.08, 0.12 * k, 0.04, { glide: 0.5 });
        this.crackle(d, 5, 0.09, 0.22 * k, 0.02, 1800);
        this.ring(d, 1250, 0.08, 0.05 * k, 0.05, [1, 1.53, 2.92]);
        break;
      case 'overseer':
        // the Overseer: a hydraulic heave, a groaning servo deep in the chassis and the ring of a huge steel limb
        this.noiseBurst(d, 'lowpass', 700, 180, 0.26, 0.3 * k, 0, { attack: 0.06, drive: true });
        this.tone(d, 'sawtooth', 62, 118, 0.24, 0.07 * k, 0, { attack: 0.05, vib: [23, 0.03] });
        this.noiseBurst(d, 'highpass', 3200, 1800, 0.14, 0.07 * k, 0.08, { attack: 0.03 });
        this.ring(d, 310, 0.3, 0.06 * k, 0.03);
        break;
      default:
        // an airy whoosh that swells in and sweeps up, with a low push of air under it
        this.noiseBurst(d, 'bandpass', 700, 1900, 0.13, 0.36 * k, 0, { attack: 0.03 });
        this.noiseBurst(d, 'lowpass', 500, 220, 0.1, 0.12 * k, 0, { attack: 0.02 });
    }
  }

  /** Extra layer on a hit so each fighter's blows sound like their style (thump, steel, sparkle, clank, crackle...). */
  private hitLayer(d: AudioNode, k: number, style: AudioStyle, heavy: boolean): void {
    const h = heavy ? 1.4 : 1;
    switch (style) {
      case 'heavy':
        // a meaty body blow: deep thump and a low, saturated slap
        this.tone(d, 'sine', 90, 38, 0.22 * h, 0.4 * k, 0, { glide: 0.5, attack: 0.006 });
        this.noiseBurst(d, 'lowpass', 1300, 160, 0.12 * h, 0.34 * k, 0, { drive: true });
        break;
      case 'blade':
        // steel through the guard: a bright cut and a ringing edge
        this.noiseBurst(d, 'highpass', 6500, 3500, 0.06, 0.26 * k);
        this.ring(d, 1480, 0.22 * h, 0.12 * k, 0.005);
        break;
      case 'arcane':
        // a magic sting: an FM bell over the impact
        this.tone(d, 'sine', 1320, 1760, 0.2 * h, 0.18 * k, 0, { fm: [1.5, 1.2] });
        this.tone(d, 'sine', 1980, 2640, 0.15 * h, 0.1 * k, 0.03);
        break;
      case 'mech':
        // a metal clank and a short electric buzz
        this.ring(d, 640, 0.16 * h, 0.2 * k, 0, [1, 1.53, 2.92]);
        this.tone(d, 'square', 120, 110, 0.08, 0.06 * k, 0.01, { fm: [3.01, 4] });
        this.noiseBurst(d, 'bandpass', 3200, 2200, 0.04, 0.22 * k);
        break;
      case 'wind':
        // a cutting gust: a whistle up and a spray of air
        this.tone(d, 'triangle', 1800, 2900, 0.1 * h, 0.14 * k);
        this.noiseBurst(d, 'highpass', 4800, 2400, 0.14 * h, 0.22 * k, 0, { attack: 0.008 });
        this.tone(d, 'sine', 240, 120, 0.1, 0.16 * k, 0, { glide: 0.5 });
        break;
      case 'fire':
        // a flaring burn: a roar of flame, a saturated growl and crackling embers
        this.noiseBurst(d, 'lowpass', 2400, 700, 0.2 * h, 0.22 * k, 0, { drive: true });
        this.tone(d, 'sawtooth', 160, 70, 0.14 * h, 0.08 * k);
        this.crackle(d, heavy ? 6 : 4, 0.18 * h, 0.16 * k, 0.01, 4200);
        break;
      case 'water':
        // a heavy splash: a low thump, a spray of hiss and a few bubbles
        this.tone(d, 'sine', 110, 50, 0.18 * h, 0.35 * k, 0, { glide: 0.5 });
        this.noiseBurst(d, 'bandpass', 2400, 700, 0.18 * h, 0.28 * k, 0, { q: 1 });
        this.bubbles(d, heavy ? 4 : 3, 0.12, 0.08 * k, 0.03);
        break;
      case 'stone':
        // rock on bone: a deep crunch, a crack of grit, and a crystal chime ringing over it
        this.tone(d, 'sine', 72, 32, 0.24 * h, 0.55 * k, 0, { glide: 0.6 });
        this.noiseBurst(d, 'lowpass', 1800, 180, 0.14 * h, 0.32 * k, 0, { drive: true });
        this.noiseBurst(d, 'bandpass', 4200, 2600, 0.04, 0.14 * k);
        this.ring(d, 1760, 0.32 * h, 0.06 * k, 0.02, GLASS);
        break;
      case 'ice':
        // a frozen crack: a sharp splintering snap and a high glassy shimmer
        this.noiseBurst(d, 'bandpass', 5200, 3400, 0.05, 0.3 * k, 0, { q: 2.5 });
        this.crackle(d, 4, 0.06, 0.14 * k, 0.005, 6000);
        this.ring(d, 2349, 0.3 * h, 0.08 * k, 0.01, GLASS);
        break;
      case 'overseer':
        // an anvil blow from a war machine: a low struck-steel ring, a sub thud and a buzzing overload
        this.ring(d, 196, 0.5 * h, 0.24 * k, 0);
        this.tone(d, 'sine', 62, 28, 0.3 * h, 0.55 * k, 0, { glide: 0.5, attack: 0.006 });
        this.noiseBurst(d, 'lowpass', 2000, 150, 0.16 * h, 0.3 * k, 0, { drive: true });
        this.tone(d, 'sawtooth', 55, 50, 0.22, 0.06 * k, 0.02, { fm: [1.41, 3] });
        break;
      case 'military':
        // a gunstock smack: a sharp report, a hard body thump and a metallic rattle
        this.noiseBurst(d, 'highpass', 1800, 900, 0.03, 0.5 * k, 0, { attack: 0.0008, drive: true });
        this.tone(d, 'sine', 140, 55, 0.12 * h, 0.4 * k, 0, { glide: 0.4 });
        this.ring(d, 1250, 0.12 * h, 0.1 * k, 0.01, [1, 1.53, 2.92]);
        this.crackle(d, 4, 0.1, 0.18 * k, 0.03, 1800);
        break;
      default:
        break;
    }
  }

  /** A small style touch on footwork (jumps and landings), so a fighter is recognisable even when not attacking. */
  private stepLayer(d: AudioNode, k: number, style: AudioStyle, landing: boolean): void {
    switch (style) {
      case 'heavy':
      case 'stone':
        if (landing) this.tone(d, 'sine', 70, 40, 0.14, 0.3 * k, 0, { glide: 0.5 });
        break;
      case 'military':
        this.crackle(d, 2, 0.04, 0.06 * k, 0.01, 2400);
        break;
      case 'overseer':
        // a heavy steel foot: a deep clank
        if (landing) {
          this.tone(d, 'sine', 60, 34, 0.16, 0.3 * k, 0, { glide: 0.5 });
          this.ring(d, 180, 0.18, 0.06 * k, 0);
        }
        break;
      case 'mech':
        this.tone(d, 'square', landing ? 300 : 260, landing ? 160 : 520, 0.06, 0.025 * k, 0, { attack: 0.006 });
        break;
      case 'wind':
        if (!landing) this.noiseBurst(d, 'bandpass', 1400, 3200, 0.12, 0.08 * k, 0, { attack: 0.02 });
        break;
      case 'arcane':
        if (!landing) this.tone(d, 'sine', 1760, 2637, 0.1, 0.025 * k, 0.02);
        break;
      case 'water':
        if (landing) this.bubbles(d, 2, 0.05, 0.05 * k);
        break;
      case 'fire':
        this.crackle(d, 2, 0.06, 0.06 * k, 0, 3600);
        break;
      case 'ice':
        if (landing) this.noiseBurst(d, 'bandpass', 4800, 3800, 0.04, 0.08 * k, 0, { q: 3 });
        break;
      default:
        break;
    }
  }

  /** A fighter's taunt, in their own flavour: a flourish of their element rather than a voice line. */
  private taunt(d: AudioNode, k: number, style: AudioStyle): void {
    switch (style) {
      case 'heavy':
        // Brick: knuckles cracked, then two chest thumps
        this.crackle(d, 3, 0.08, 0.2 * k, 0, 2200);
        this.tone(d, 'sine', 100, 55, 0.16, 0.5 * k, 0.16, { glide: 0.5 });
        this.noiseBurst(d, 'lowpass', 800, 200, 0.1, 0.3 * k, 0.16);
        this.tone(d, 'sine', 100, 55, 0.18, 0.55 * k, 0.36, { glide: 0.5 });
        this.noiseBurst(d, 'lowpass', 800, 200, 0.12, 0.34 * k, 0.36);
        break;
      case 'blade':
        // Vex: a twirl of the blade, two quick shings and a ringing edge
        this.noiseBurst(d, 'bandpass', 2600, 6000, 0.09, 0.22 * k, 0, { attack: 0.02, q: 2 });
        this.noiseBurst(d, 'bandpass', 3000, 7000, 0.09, 0.24 * k, 0.14, { attack: 0.02, q: 2 });
        this.ring(d, 2217, 0.45, 0.08 * k, 0.2);
        break;
      case 'arcane':
        // Nova: a twinkling run of stars, up through the octaves
        [1319, 1568, 1976, 2637, 3136].forEach((f, i) => this.tone(d, 'sine', f, f, 0.22, 0.1 * k, i * 0.06, { fm: [2, 0.3] }));
        this.noiseBurst(d, 'highpass', 5000, 8000, 0.4, 0.04 * k, 0.05, { attack: 0.1 });
        break;
      case 'mech':
        // Gizmo (and the Overseer): a cheeky beep-boop and a servo whirr
        [1568, 1047, 2093, 1319].forEach((f, i) => this.tone(d, 'square', f, f * (i === 3 ? 1.5 : 1), 0.07, 0.05 * k, i * 0.09, { attack: 0.003 }));
        this.tone(d, 'sawtooth', 200, 480, 0.2, 0.04 * k, 0.36, { attack: 0.02, vib: [40, 0.03] });
        break;
      case 'fire':
        // Agni: flame flaring up in the palm, crackling
        this.noiseBurst(d, 'lowpass', 400, 3000, 0.35, 0.26 * k, 0, { attack: 0.1 });
        this.noiseBurst(d, 'bandpass', 900, 500, 0.3, 0.1 * k, 0.05, { attack: 0.05, drive: true });
        this.crackle(d, 8, 0.4, 0.14 * k, 0.05, 3800);
        break;
      case 'wind':
        // Halcyon: a whistle swirling up on the breeze
        this.tone(d, 'sine', 1200, 2400, 0.4, 0.1 * k, 0, { attack: 0.08, vib: [6, 0.05] });
        this.noiseBurst(d, 'bandpass', 900, 3000, 0.45, 0.2 * k, 0, { attack: 0.1, q: 1 });
        break;
      case 'water':
        // Riptide: water sloshed from hand to hand, bubbles and a drop
        this.noiseBurst(d, 'bandpass', 1600, 700, 0.2, 0.24 * k, 0, { q: 1 });
        this.noiseBurst(d, 'bandpass', 700, 1500, 0.2, 0.2 * k, 0.2, { q: 1 });
        this.bubbles(d, 5, 0.35, 0.07 * k, 0.05);
        this.tone(d, 'sine', 1400, 600, 0.08, 0.1 * k, 0.42);
        break;
      case 'stone':
        // Obelisk: rock grinding, then a crystal chime
        this.noiseBurst(d, 'lowpass', 500, 140, 0.35, 0.36 * k, 0, { attack: 0.06, drive: true });
        this.tone(d, 'sine', 60, 42, 0.3, 0.3 * k, 0, { attack: 0.05 });
        this.ring(d, 1568, 0.5, 0.08 * k, 0.3, GLASS);
        break;
      case 'ice':
        // Rime: frost forming, a cascade of icy tinkles falling
        [3520, 2960, 2637, 2217].forEach((f, i) => this.ring(d, f, 0.3, 0.06 * k, i * 0.07, GLASS));
        this.noiseBurst(d, 'highpass', 6000, 8000, 0.35, 0.08 * k, 0, { attack: 0.06 });
        break;
      case 'overseer':
        // the Overseer: a low tritone drone of detuned saws, then a slow mechanical laugh of three pulses
        this.tone(d, 'sawtooth', 55, 52, 0.75, 0.07 * k, 0, { attack: 0.15, vib: [5, 0.02] });
        this.tone(d, 'sawtooth', 77.8, 74, 0.75, 0.05 * k, 0, { attack: 0.15 });
        this.noiseBurst(d, 'lowpass', 300, 600, 0.6, 0.18 * k, 0, { attack: 0.2 });
        for (let i = 0; i < 3; i++) this.tone(d, 'square', 98 - i * 6, 90 - i * 6, 0.1, 0.07 * k, 0.32 + i * 0.13, { fm: [0.5, 2] });
        this.ring(d, 147, 0.4, 0.05 * k, 0.32);
        break;
      case 'military':
        // Havoc: a rifle bolt worked, click-clack
        this.click(d, 0.25 * k, 0, 2500);
        this.ring(d, 1450, 0.07, 0.08 * k, 0, [1, 1.53, 2.92]);
        this.noiseBurst(d, 'bandpass', 2400, 1600, 0.05, 0.2 * k, 0.02);
        this.click(d, 0.3 * k, 0.16, 2000);
        this.ring(d, 980, 0.1, 0.1 * k, 0.16, [1, 1.53, 2.92]);
        this.tone(d, 'sine', 160, 90, 0.07, 0.25 * k, 0.16);
        break;
      default:
        // a clap and a 'hup'
        this.noiseBurst(d, 'bandpass', 1800, 1200, 0.06, 0.4 * k, 0, { q: 1, attack: 0.001 });
        this.tone(d, 'sine', 220, 330, 0.12, 0.18 * k, 0.12);
        break;
    }
  }

  /**
   * Formant voice: a buzzing glottal source (sawtooth, plus breath noise) shaped by three resonances that glide from vowel to
   * vowel, with consonant bursts of filtered noise. A growl wobbles the pitch; a robot voice is half ring-modulated.
   */
  private vox(d: AudioNode, w: Word, p: VoiceProfile, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const end = t0 + w.end;
    const f0 = p.f0 * this.pv;
    // the voice's output: straight through, or a robot's mix of dry and ring-modulated
    const out = ctx.createGain();
    out.gain.value = 1;
    const chain: AudioNode[] = [out];
    if (p.ring > 0) {
      const dry = ctx.createGain();
      dry.gain.value = 0.55;
      const rm = ctx.createGain();
      rm.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = p.ring;
      const depth = ctx.createGain();
      depth.gain.value = 0.9;
      lfo.connect(depth).connect(rm.gain);
      out.connect(dry).connect(d);
      out.connect(rm).connect(d);
      chain.push(dry, rm);
      lfo.start(t0);
      this.track(lfo, end + 0.03, [depth]);
    } else out.connect(d);
    // three formant filters in parallel, their centres gliding with the vowels
    const bank = ctx.createGain();
    bank.gain.value = 1;
    chain.push(bank);
    const fgain = [1, 0.55, 0.28];
    const q = [6, 9, 11];
    for (let f = 0; f < 3; f++) {
      const flt = ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.Q.value = q[f];
      const fq = (v: Vowel): number => Math.min(ctx.sampleRate * 0.4, VOWELS[v][f] / p.tract);
      flt.frequency.setValueAtTime(fq(w.parts[0][1]), t0);
      for (const [t, v] of w.parts) flt.frequency.linearRampToValueAtTime(fq(v), t0 + t);
      const g = ctx.createGain();
      g.gain.value = fgain[f] * 3.2;
      bank.connect(flt).connect(g).connect(out);
      chain.push(flt, g);
    }
    // loudness and pitch contours
    const env = (g: GainNode, k: number): void => {
      g.gain.setValueAtTime(0.0001, t0);
      for (const [t, , a] of w.parts) g.gain.linearRampToValueAtTime(Math.max(0.0002, a * k), t0 + Math.max(0.006, t));
      g.gain.exponentialRampToValueAtTime(0.0001, end);
    };
    const src = ctx.createOscillator();
    src.type = p.ring > 0 ? 'square' : 'sawtooth';
    src.frequency.setValueAtTime(f0 * w.parts[0][3], t0);
    for (const [t, , , pitch] of w.parts) src.frequency.linearRampToValueAtTime(f0 * pitch, t0 + t);
    const voiced = ctx.createGain();
    env(voiced, vol * (1 - p.breath * 0.6));
    src.connect(voiced).connect(bank);
    if (p.growl > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 33;
      const lg = ctx.createGain();
      lg.gain.value = f0 * p.growl;
      lfo.connect(lg).connect(src.frequency);
      lfo.start(t0);
      this.track(lfo, end + 0.02, [lg]);
    }
    src.start(t0);
    this.track(src, end + 0.02, [voiced]);
    if (p.breath > 0 && this.noise) {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      n.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 500;
      const bg = ctx.createGain();
      env(bg, vol * p.breath * 0.9);
      n.connect(hp).connect(bg).connect(bank);
      n.start(t0, Math.random() * 1.5);
      this.track(n, end + 0.02, [hp, bg]);
    }
    for (const [t, f, dur, v] of w.bursts ?? []) this.noiseBurst(d, 'bandpass', f, f * 0.8, dur, v * vol, delay + t, { attack: 0.002, q: 1.4 });
    // the shared nodes go once the last source has stopped (they outlive every source above by a few ms)
    const keep = ctx.createConstantSource ? ctx.createConstantSource() : ctx.createOscillator();
    const silent = ctx.createGain();
    silent.gain.value = 0;
    keep.connect(silent).connect(out);
    keep.start(t0);
    this.track(keep, end + 0.06, [silent, ...chain]);
  }

  private recipe(name: SoundName, k: number, d: AudioNode, style: AudioStyle = 'plain'): void {
    // harder hits are brighter as well as louder
    const bright = 0.7 + 0.3 * k;
    switch (name) {
      case 'swing':
        this.swing(d, k, style);
        break;
      case 'hit': {
        // the shared impact sits back when a fighter's own flavour layer goes on top, so the flavour is what you hear
        const b = style === 'plain' ? k : k * 0.7;
        this.click(d, 0.22 * b);
        this.tone(d, 'sine', 190 + 70 * (1 - k), 70, 0.12, 0.5 * b, 0, { glide: 0.35 });
        this.tone(d, 'triangle', 420, 210, 0.05, 0.12 * b);
        this.noiseBurst(d, 'bandpass', 2200 * bright, 700, 0.08, 0.42 * b, 0, { q: 1 });
        this.hitLayer(d, k * 1.2, style, false);
        break;
      }
      case 'hitHeavy': {
        const b = style === 'plain' ? k : k * 0.6;
        this.click(d, 0.24 * b);
        this.tone(d, 'sine', 120, 36, 0.36, 0.75 * b, 0, { glide: 0.45, attack: 0.008 });
        this.tone(d, 'triangle', 240, 70, 0.2, 0.28 * b, 0, { glide: 0.5 });
        this.noiseBurst(d, 'lowpass', 4200 * bright, 220, 0.24, 0.55 * b, 0, { drive: true });
        this.noiseBurst(d, 'bandpass', 900, 300, 0.4, 0.08 * b, 0.05, { attack: 0.02 });
        this.hitLayer(d, k * 1.4, style, true);
        break;
      }
      case 'clang':
        // two blows meeting: a bright transient and a ringing metal plate
        this.click(d, 0.25 * k, 0, 5000);
        this.ring(d, 880, 0.42, 0.26 * k);
        this.noiseBurst(d, 'highpass', 5000, 3000, 0.05, 0.22 * k);
        break;
      case 'parry':
        // a perfect deflect: a crisp 'ting', a rising shimmer and a glint of air
        this.click(d, 0.2 * k, 0, 6000);
        this.ring(d, 1500, 0.45, 0.22 * k, 0, GLASS);
        this.tone(d, 'sine', 2250, 3000, 0.18, 0.1 * k, 0.03, { fm: [2, 0.4] });
        this.noiseBurst(d, 'highpass', 6000, 4000, 0.06, 0.2 * k);
        break;
      case 'shield':
        // a hit absorbed by the bubble: a soft energy 'thwum' with a fizz
        this.tone(d, 'sine', 520, 300, 0.14, 0.3 * k, 0, { fm: [0.5, 0.8] });
        this.tone(d, 'triangle', 1040, 600, 0.08, 0.08 * k);
        this.noiseBurst(d, 'bandpass', 3000, 1500, 0.07, 0.18 * k);
        break;
      case 'shieldBreak':
        // the bubble pops: a glassy shatter, a deflating whistle and a heavy thud
        this.click(d, 0.3, 0, 4000);
        this.noiseBurst(d, 'bandpass', 4200, 200, 0.55, 0.5, 0, { q: 1 });
        this.ring(d, 1175, 0.5, 0.14, 0.01, GLASS);
        this.tone(d, 'sawtooth', 900, 90, 0.55, 0.12);
        this.tone(d, 'sine', 1200, 300, 0.6, 0.12, 0.05, { vib: [9, 0.04] });
        this.tone(d, 'sine', 90, 40, 0.3, 0.5, 0, { glide: 0.5 });
        break;
      case 'jump':
        // a light 'hup': a push off the floor and a puff of air
        this.tone(d, 'sine', 200, 420, 0.09, 0.2 * k, 0, { attack: 0.006 });
        this.tone(d, 'sine', 110, 70, 0.05, 0.18 * k);
        this.noiseBurst(d, 'bandpass', 900, 1900, 0.08, 0.12 * k, 0, { attack: 0.01 });
        this.stepLayer(d, k, style, false);
        break;
      case 'doubleJump':
        // a springier, airier second jump
        this.tone(d, 'sine', 330, 700, 0.11, 0.18 * k, 0, { attack: 0.006 });
        this.tone(d, 'sine', 500, 1000, 0.1, 0.1 * k, 0.05);
        this.noiseBurst(d, 'bandpass', 1300, 3200, 0.13, 0.12 * k, 0, { attack: 0.02 });
        this.stepLayer(d, k, style, false);
        break;
      case 'land':
        this.noiseBurst(d, 'lowpass', 600, 130, 0.08, 0.32 * k);
        this.tone(d, 'sine', 95, 50, 0.09, 0.32 * k, 0, { glide: 0.5 });
        this.noiseBurst(d, 'highpass', 3000, 2000, 0.03, 0.06 * k, 0.005);
        this.stepLayer(d, k, style, true);
        break;
      case 'landBounce':
        this.click(d, 0.2);
        this.noiseBurst(d, 'lowpass', 900, 100, 0.14, 0.45, 0, { drive: true });
        this.tone(d, 'sine', 140, 40, 0.26, 0.6, 0, { glide: 0.5 });
        this.tone(d, 'triangle', 300, 600, 0.12, 0.14, 0.06);
        break;
      case 'bounce':
        // knocked off the floor or a wall: a hard thud and a little rattle
        this.click(d, 0.15 * k, 0, 2500);
        this.tone(d, 'sine', 160, 70, 0.14, 0.4 * k, 0, { glide: 0.4 });
        this.tone(d, 'triangle', 340, 170, 0.08, 0.1 * k);
        this.noiseBurst(d, 'lowpass', 900, 200, 0.1, 0.28 * k);
        break;
      case 'tech':
        // a clean recovery: a bright two-step chirp
        this.tone(d, 'triangle', 620, 1240, 0.07, 0.26 * k);
        this.tone(d, 'square', 930, 1860, 0.08, 0.06 * k, 0.05);
        this.tone(d, 'sine', 1860, 1860, 0.12, 0.08 * k, 0.05);
        this.noiseBurst(d, 'highpass', 4000, 6000, 0.05, 0.08 * k, 0, { attack: 0.01 });
        break;
      case 'ledge':
        // a hand slaps the ledge
        this.click(d, 0.12 * k, 0, 3000);
        this.noiseBurst(d, 'bandpass', 1800, 900, 0.04, 0.2 * k);
        this.tone(d, 'triangle', 700, 520, 0.12, 0.16 * k);
        this.tone(d, 'sine', 160, 110, 0.07, 0.16 * k);
        break;
      case 'dodge':
        // a quick 'shff' of evasion
        this.noiseBurst(d, 'bandpass', 1400, 500, 0.15, 0.32 * k, 0, { attack: 0.03 });
        this.noiseBurst(d, 'highpass', 3600, 5000, 0.1, 0.06 * k, 0.01, { attack: 0.03 });
        break;
      case 'grab':
        // a grip on cloth: a muffled 'fwump' and a snap
        this.click(d, 0.12 * k, 0, 2000);
        this.noiseBurst(d, 'lowpass', 1600, 400, 0.08, 0.3 * k);
        this.tone(d, 'sine', 260, 170, 0.1, 0.25 * k, 0, { glide: 0.5 });
        break;
      case 'throw':
        // a heave and a launch: a rising whoosh and a thump
        this.noiseBurst(d, 'bandpass', 600, 2000, 0.16, 0.3 * k, 0, { attack: 0.03 });
        this.tone(d, 'sine', 150, 50, 0.18, 0.5 * k, 0.04, { glide: 0.5 });
        this.noiseBurst(d, 'lowpass', 1400, 200, 0.1, 0.2 * k, 0.04);
        break;
      case 'pummel':
        this.click(d, 0.1 * k, 0, 2500);
        this.tone(d, 'sine', 170, 80, 0.07, 0.35 * k, 0, { glide: 0.5 });
        this.noiseBurst(d, 'lowpass', 1200, 300, 0.05, 0.16 * k);
        break;
      case 'ko':
        // the blast-zone KO: a crack, a huge boom, the fighter screaming away into the distance, and a star twinkle
        this.click(d, 0.25, 0, 3000);
        this.noiseBurst(d, 'lowpass', 3200, 90, 1.0, 0.6, 0, { drive: true, attack: 0.006 });
        this.tone(d, 'sine', 80, 26, 1.1, 0.7, 0, { glide: 0.6, attack: 0.012 });
        this.tone(d, 'sawtooth', 420, 40, 0.9, 0.12);
        this.noiseBurst(d, 'highpass', 6000, 2000, 0.28, 0.24);
        this.noiseBurst(d, 'bandpass', 3000, 380, 0.9, 0.16, 0.06, { attack: 0.06, q: 2 });
        this.ring(d, 2637, 0.6, 0.05, 0.42, GLASS);
        this.tone(d, 'sine', 3520, 3520, 0.4, 0.03, 0.5);
        break;
      case 'shoot':
        // a 'pew': a falling zap with a little body under it
        this.tone(d, 'sawtooth', 900, 280, 0.12, 0.1 * k, 0, { glide: 0.6 });
        this.tone(d, 'sine', 700, 220, 0.12, 0.2 * k, 0, { glide: 0.6 });
        this.noiseBurst(d, 'bandpass', 2500, 900, 0.05, 0.14 * k);
        break;
      case 'zap':
        // electricity: a crackle and an FM buzz
        this.noiseBurst(d, 'highpass', 4000, 1500, 0.08, 0.24 * k);
        this.tone(d, 'sawtooth', 1500, 650, 0.1, 0.1 * k);
        this.tone(d, 'square', 220, 180, 0.12, 0.06 * k, 0, { fm: [2.71, 6] });
        this.crackle(d, 3, 0.08, 0.14 * k, 0, 5000);
        break;
      case 'reflect':
        this.click(d, 0.12 * k, 0, 5000);
        this.tone(d, 'sine', 1200, 1900, 0.2, 0.28 * k, 0, { fm: [1.5, 0.5] });
        this.tone(d, 'triangle', 600, 900, 0.18, 0.14 * k);
        break;
      case 'place':
        // something set down: a solid 'clunk'
        this.click(d, 0.14 * k, 0, 3000);
        this.tone(d, 'sine', 190, 95, 0.1, 0.35 * k, 0, { glide: 0.5 });
        this.noiseBurst(d, 'bandpass', 1300, 800, 0.05, 0.16 * k);
        break;
      case 'boom':
        // an explosion: crack, saturated blast, sub drop and falling debris
        this.click(d, 0.2 * k, 0, 2500);
        this.noiseBurst(d, 'lowpass', 2800, 80, 0.45, 0.7 * k, 0, { drive: true, attack: 0.006 });
        this.tone(d, 'sine', 100, 34, 0.45, 0.65 * k, 0, { glide: 0.5, attack: 0.012 });
        this.noiseBurst(d, 'bandpass', 1800, 500, 0.5, 0.08 * k, 0.08, { attack: 0.04 });
        this.crackle(d, 4, 0.3, 0.06 * k, 0.12, 2800);
        break;
      case 'break':
        // a shatter: a crack, a burst of shards and a few tinkles
        this.click(d, 0.25 * k, 0, 3000);
        this.noiseBurst(d, 'highpass', 5000, 1500, 0.16, 0.38 * k);
        this.tone(d, 'triangle', 300, 90, 0.14, 0.18 * k, 0, { glide: 0.5 });
        for (let i = 0; i < 3; i++) this.ring(d, 2200 + Math.random() * 1600, 0.12, 0.04 * k, 0.03 + i * 0.05, GLASS);
        break;
      case 'burn':
        // catching fire: a 'fwoom' and crackling
        this.noiseBurst(d, 'lowpass', 500, 2200, 0.2, 0.24 * k, 0, { attack: 0.03 });
        this.noiseBurst(d, 'bandpass', 2400, 900, 0.18, 0.14 * k);
        this.crackle(d, 5, 0.22, 0.16 * k, 0.02, 4000);
        break;
      case 'freeze':
        // ice forming: a glassy chime and crystals crackling
        this.ring(d, 2093, 0.4, 0.14 * k, 0, GLASS);
        this.tone(d, 'sine', 3100, 2400, 0.2, 0.06 * k, 0.03);
        this.crackle(d, 4, 0.15, 0.1 * k, 0.02, 6500);
        break;
      case 'slow':
        // time thickening: two detuned tones sagging, with a slow wobble
        this.tone(d, 'triangle', 420, 160, 0.32, 0.18 * k, 0, { vib: [6, 0.02] });
        this.tone(d, 'triangle', 428, 157, 0.32, 0.14 * k);
        this.noiseBurst(d, 'lowpass', 800, 300, 0.3, 0.1 * k, 0, { attack: 0.06 });
        break;
      case 'stun':
        // dazed: an electric buzz and a dizzy warble
        this.tone(d, 'sawtooth', 1100, 300, 0.2, 0.1 * k);
        this.tone(d, 'sine', 1400, 1100, 0.3, 0.12 * k, 0.04, { vib: [11, 0.06] });
        this.noiseBurst(d, 'highpass', 3500, 2000, 0.12, 0.16 * k);
        break;
      case 'splash':
        this.noiseBurst(d, 'bandpass', 2200, 600, 0.22, 0.26 * k, 0, { q: 1 });
        this.tone(d, 'sine', 700, 300, 0.1, 0.12 * k, 0.02);
        this.bubbles(d, 4, 0.15, 0.08 * k, 0.03);
        break;
      case 'blink':
        // a teleport: a reverse swell into a sparkle
        this.tone(d, 'sine', 300, 2000, 0.09, 0.24 * k, 0, { attack: 0.05, fm: [2, 0.3] });
        this.noiseBurst(d, 'highpass', 2500, 5000, 0.08, 0.16 * k, 0, { attack: 0.05 });
        this.tone(d, 'sine', 2637, 2637, 0.12, 0.05 * k, 0.08);
        break;
      case 'hook':
        // a grappling line: a zip and a chain rattle
        this.noiseBurst(d, 'highpass', 3500, 3000, 0.04, 0.2 * k);
        this.tone(d, 'sawtooth', 500, 950, 0.12, 0.08 * k);
        this.crackle(d, 5, 0.12, 0.12 * k, 0.02, 3000);
        break;
      case 'charge':
        this.tone(d, 'sine', 80, 420, 0.6, 0.45 * k, 0, { attack: 0.05 });
        this.tone(d, 'sawtooth', 120, 640, 0.6, 0.1 * k, 0, { attack: 0.05, vib: [9, 0.02] });
        this.noiseBurst(d, 'bandpass', 600, 4000, 0.6, 0.1 * k, 0, { attack: 0.3 });
        break;
      case 'ding':
        this.tone(d, 'sine', 880, 880, 0.4, 0.28 * k);
        this.tone(d, 'triangle', 880, 880, 0.12, 0.05 * k);
        this.tone(d, 'sine', 1320, 1320, 0.4, 0.2 * k, 0.07);
        break;
      case 'menuMove':
        // a soft, pitched tick
        this.tone(d, 'triangle', 1320, 1320, 0.075, 0.16 * k, 0, { attack: 0.002 });
        this.tone(d, 'square', 660, 660, 0.04, 0.03 * k, 0, { attack: 0.002 });
        break;
      case 'menuOk':
        // an upward fifth: confirm
        this.tone(d, 'triangle', 784, 784, 0.08, 0.2 * k);
        this.tone(d, 'square', 784, 784, 0.05, 0.04 * k);
        this.tone(d, 'triangle', 1175, 1175, 0.14, 0.2 * k, 0.06);
        this.tone(d, 'square', 1175, 1175, 0.06, 0.035 * k, 0.06);
        break;
      case 'menuBack':
        // a downward step: cancel
        this.tone(d, 'triangle', 659, 659, 0.06, 0.18 * k);
        this.tone(d, 'triangle', 440, 420, 0.12, 0.18 * k, 0.05);
        this.tone(d, 'square', 440, 420, 0.06, 0.03 * k, 0.05);
        break;
      case 'slice':
        // a steel 'shing' over a cutting or stabbing hit
        this.noiseBurst(d, 'bandpass', 7000, 4200, 0.07, 0.24 * k, 0, { q: 2.5 });
        this.ring(d, 3150, 0.18, 0.05 * k, 0.005);
        break;
      case 'gust':
        // a blast of wind behind the blow
        this.noiseBurst(d, 'bandpass', 800, 2600, 0.22, 0.26 * k, 0, { attack: 0.03, q: 0.9 });
        this.noiseBurst(d, 'lowpass', 400, 150, 0.2, 0.12 * k, 0, { attack: 0.03 });
        break;
      case 'spawn':
        // an item pops in: a bubbly pop and a little sparkle
        this.tone(d, 'sine', 420, 1100, 0.06, 0.24 * k, 0, { attack: 0.003 });
        this.tone(d, 'sine', 1568, 1568, 0.12, 0.06 * k, 0.05);
        this.tone(d, 'sine', 2093, 2093, 0.14, 0.05 * k, 0.09);
        break;
      case 'pickup':
        // grabbing an item: a quick rising two-note chime
        this.tone(d, 'triangle', 784, 784, 0.07, 0.2 * k);
        this.tone(d, 'triangle', 1047, 1047, 0.18, 0.22 * k, 0.06);
        this.tone(d, 'sine', 2093, 2093, 0.16, 0.05 * k, 0.06);
        break;
      case 'ready':
        // ultimate ready: a bright rising arpeggio with a shimmer
        [1047, 1319, 1568, 2093].forEach((f, i) => {
          this.tone(d, 'triangle', f, f, 0.22, 0.16 * k, i * 0.055);
          this.tone(d, 'sine', f * 2, f * 2, 0.16, 0.035 * k, i * 0.055);
        });
        this.noiseBurst(d, 'highpass', 5000, 8000, 0.35, 0.05 * k, 0.05, { attack: 0.1 });
        break;
      case 'ultimate':
        // the ultimate begins: a flash, then a roaring riser that opens up as it climbs
        this.click(d, 0.3, 0, 4000);
        this.ring(d, 1175, 0.5, 0.12, 0, GLASS);
        this.tone(d, 'sawtooth', 110, 880, 0.75, 0.12, 0.02, { attack: 0.2, vib: [7, 0.015] });
        this.tone(d, 'sawtooth', 111.5, 885, 0.75, 0.1, 0.02, { attack: 0.2 });
        this.tone(d, 'sine', 55, 220, 0.75, 0.5, 0.02, { attack: 0.15 });
        this.noiseBurst(d, 'bandpass', 500, 6000, 0.75, 0.22, 0.02, { attack: 0.4, q: 1 });
        break;
      case 'go':
        // the fight starts: a bright major chord stab over a thump
        this.click(d, 0.25, 0, 3000);
        this.tone(d, 'sine', 110, 45, 0.3, 0.6, 0, { glide: 0.5 });
        for (const f of [523, 659, 784, 1047]) {
          this.tone(d, 'square', f, f, 0.45, 0.04, 0.01);
          this.tone(d, 'triangle', f, f, 0.5, 0.1, 0.01);
        }
        break;
      case 'taunt':
        this.taunt(d, k, style);
        break;
      case 'roar':
        // the Overseer's Overload Roar: a mechanical bellow (detuned saws through a growling formant), a sub drop and
        // the crackle of overloaded circuits
        this.tone(d, 'sawtooth', 70, 52, 1.5, 0.22, 0, { attack: 0.12, vib: [7, 0.04] });
        this.tone(d, 'sawtooth', 71.5, 50, 1.5, 0.18, 0, { attack: 0.12, vib: [5.3, 0.05] });
        this.tone(d, 'square', 105, 78, 1.3, 0.06, 0.03, { attack: 0.1, fm: [1.41, 2] });
        this.noiseBurst(d, 'bandpass', 520, 300, 1.4, 0.34, 0, { attack: 0.1, q: 3, drive: true });
        this.noiseBurst(d, 'bandpass', 1300, 800, 1.2, 0.12, 0.05, { attack: 0.12, q: 4 });
        this.tone(d, 'sine', 55, 30, 1.4, 0.5, 0, { attack: 0.08, glide: 0.8 });
        this.crackle(d, 10, 1.0, 0.1, 0.15, 3200);
        break;
      case 'thunder':
        // lightning strikes: a split-second crack, a tearing sizzle, then the thunder rolling away in waves
        this.click(d, 0.35, 0, 2500);
        this.noiseBurst(d, 'highpass', 3000, 900, 0.18, 0.5, 0, { attack: 0.001, drive: true });
        this.crackle(d, 9, 0.16, 0.22, 0, 4500);
        this.noiseBurst(d, 'lowpass', 1400, 90, 0.7, 0.55, 0.02, { attack: 0.006, drive: true });
        this.noiseBurst(d, 'lowpass', 300, 70, 1.6, 0.42, 0.25, { attack: 0.25 });
        this.noiseBurst(d, 'lowpass', 220, 60, 1.4, 0.32, 0.8, { attack: 0.3 });
        this.tone(d, 'sine', 70, 32, 0.9, 0.5, 0.01, { glide: 0.5, attack: 0.01 });
        break;
      case 'avalanche':
        // snow breaking loose: a crack of ice, then a long, swelling roar of tumbling snow with chunks thudding down
        this.noiseBurst(d, 'bandpass', 5200, 3200, 0.06, 0.3, 0, { q: 2.5 });
        this.crackle(d, 6, 0.2, 0.14, 0, 6000);
        this.noiseBurst(d, 'lowpass', 600, 140, 2.0, 0.5, 0.05, { attack: 0.35, drive: true });
        this.noiseBurst(d, 'bandpass', 1400, 500, 1.6, 0.16, 0.1, { attack: 0.4, q: 0.8 });
        this.tone(d, 'sine', 55, 38, 1.8, 0.4, 0.05, { attack: 0.3 });
        for (let i = 0; i < 4; i++) this.tone(d, 'sine', 110, 45, 0.18, 0.3, 0.3 + i * 0.3 + Math.random() * 0.1, { glide: 0.5 });
        this.ring(d, 2349, 0.4, 0.03, 0.05, GLASS);
        break;
      case 'geyser':
        // the reactor vents: a pressure hiss, a deep whump and a gout of bubbling plasma with an electric sizzle
        this.noiseBurst(d, 'highpass', 2000, 5000, 0.25, 0.2, 0, { attack: 0.12 });
        this.tone(d, 'sine', 90, 34, 0.5, 0.55, 0.12, { glide: 0.5, attack: 0.01 });
        this.noiseBurst(d, 'lowpass', 2400, 160, 1.1, 0.5, 0.12, { attack: 0.01, drive: true });
        this.noiseBurst(d, 'bandpass', 700, 1600, 1.0, 0.16, 0.15, { attack: 0.05, q: 1.2 });
        this.tone(d, 'sawtooth', 160, 110, 0.9, 0.05, 0.15, { fm: [2.71, 5], attack: 0.03 });
        for (let i = 0; i < 6; i++) {
          const f = 140 + Math.random() * 180;
          this.tone(d, 'sine', f, f * 1.9, 0.07, 0.14, 0.25 + Math.random() * 0.8, { attack: 0.004 });
        }
        break;
      case 'waterSpout':
        // the wreck's spout: a rush of water climbing, a heavy gush and spray falling back with bubbles
        this.noiseBurst(d, 'bandpass', 500, 2600, 0.45, 0.4, 0, { attack: 0.08, q: 0.9 });
        this.tone(d, 'sine', 120, 50, 0.4, 0.45, 0.06, { glide: 0.5 });
        this.noiseBurst(d, 'lowpass', 1200, 300, 0.9, 0.34, 0.05, { attack: 0.05 });
        this.noiseBurst(d, 'highpass', 3000, 1800, 0.7, 0.12, 0.35, { attack: 0.15 });
        this.bubbles(d, 8, 0.7, 0.07, 0.15);
        break;
      case 'stalactite':
        // a stalactite gives way: a sharp crack high up, then the crash of crystal and stone on the floor
        this.noiseBurst(d, 'bandpass', 4200, 2600, 0.05, 0.32, 0, { q: 3, attack: 0.001 });
        this.crackle(d, 4, 0.06, 0.16, 0, 5000);
        this.click(d, 0.3, 0.12, 3000);
        this.tone(d, 'sine', 120, 38, 0.4, 0.6, 0.12, { glide: 0.5, attack: 0.004 });
        this.noiseBurst(d, 'lowpass', 2800, 150, 0.45, 0.5, 0.12, { drive: true });
        this.noiseBurst(d, 'highpass', 5000, 2000, 0.3, 0.22, 0.13);
        for (let i = 0; i < 4; i++) this.ring(d, 1700 + Math.random() * 1800, 0.35, 0.05, 0.14 + i * 0.06, GLASS);
        break;
      case 'stepMetal':
        // a boot on a grating: a tap and a short metal ring
        this.click(d, 0.12 * k, 0, 3000);
        this.ring(d, 1180, 0.09, 0.06 * k, 0, [1, 1.53, 2.92]);
        this.tone(d, 'sine', 160, 110, 0.05, 0.12 * k);
        break;
      case 'stepStone':
        // a scuff on rock: a dull tap and a whisper of grit
        this.noiseBurst(d, 'lowpass', 900, 300, 0.08, 0.3 * k, 0, { attack: 0.002 });
        this.noiseBurst(d, 'bandpass', 3200, 2200, 0.06, 0.06 * k, 0.005);
        this.tone(d, 'sine', 130, 90, 0.07, 0.12 * k);
        break;
      case 'stepWood':
        // a hollow knock on planks
        this.tone(d, 'sine', 240, 190, 0.09, 0.24 * k, 0, { attack: 0.002 });
        this.noiseBurst(d, 'bandpass', 800, 600, 0.07, 0.18 * k, 0, { q: 3 });
        this.click(d, 0.05 * k, 0, 2000);
        break;
      case 'stepSnow':
        // a soft crunch: a cluster of muffled grains
        this.noiseBurst(d, 'bandpass', 2400, 1400, 0.08, 0.18 * k, 0, { attack: 0.01, q: 1.2 });
        this.crackle(d, 5, 0.06, 0.08 * k, 0, 2600);
        break;
      case 'stepGrass':
        // a brush through grass: an airy swish
        this.noiseBurst(d, 'highpass', 3000, 4500, 0.09, 0.14 * k, 0, { attack: 0.02 });
        this.noiseBurst(d, 'lowpass', 500, 250, 0.05, 0.08 * k);
        break;
      case 'stepCrystal':
        // a tap on crystal: a click and a tiny glassy chime
        this.click(d, 0.08 * k, 0, 4000);
        this.ring(d, 2093 + Math.random() * 400, 0.14, 0.05 * k, 0, GLASS);
        this.tone(d, 'sine', 180, 120, 0.04, 0.08 * k);
        break;
      case 'crowd':
        // the stands react: a swell of many voices (bands of noise, each with its own breath) and a cheer on top
        for (let i = 0; i < 5; i++) {
          const f = 450 + i * 260 + Math.random() * 120;
          this.noiseBurst(d, 'bandpass', f, f * 1.15, 1.6 + Math.random() * 0.4, (0.11 - i * 0.012) * k, Math.random() * 0.12, { attack: 0.35 + Math.random() * 0.2, q: 2.2 });
        }
        this.noiseBurst(d, 'lowpass', 600, 400, 1.5, 0.1 * k, 0.05, { attack: 0.4 });
        for (let i = 0; i < 4; i++) {
          const f = 500 + Math.random() * 350;
          this.tone(d, 'triangle', f, f * 1.25, 0.5 + Math.random() * 0.3, 0.012 * k, 0.15 + Math.random() * 0.3, { attack: 0.12, vib: [5 + Math.random() * 3, 0.03] });
        }
        break;
      case 'glint':
        // the parry glint: a bright sparkle that flicks up and away
        this.tone(d, 'sine', 3136, 4186, 0.16, 0.14 * k, 0, { attack: 0.003, fm: [2.5, 0.25] });
        this.tone(d, 'sine', 5274, 5274, 0.12, 0.04 * k, 0.04);
        this.noiseBurst(d, 'highpass', 7000, 9000, 0.08, 0.1 * k, 0, { attack: 0.004 });
        break;
      case 'swordSwing':
        // the beam sword: a humming blade sweeping through the air
        this.tone(d, 'sawtooth', 220, 330, 0.2, 0.05 * k, 0, { attack: 0.03, vib: [30, 0.02] });
        this.tone(d, 'sine', 440, 660, 0.2, 0.12 * k, 0, { attack: 0.03 });
        this.noiseBurst(d, 'bandpass', 2000, 5200, 0.16, 0.2 * k, 0, { attack: 0.03, q: 2 });
        break;
      case 'swordHit':
        // the beam sword connects: an energised cut, a crackle of the blade and a ringing edge
        this.click(d, 0.2 * k, 0, 4000);
        this.noiseBurst(d, 'bandpass', 5200, 2400, 0.1, 0.34 * k, 0, { q: 1.5 });
        this.tone(d, 'sawtooth', 660, 220, 0.16, 0.08 * k, 0, { fm: [1.5, 2] });
        this.tone(d, 'sine', 180, 70, 0.14, 0.4 * k, 0, { glide: 0.4 });
        this.ring(d, 1760, 0.25, 0.08 * k, 0.01);
        break;
      case 'rayShot':
        // the ray gun: a sci-fi 'tsew' with a ringing FM tail
        this.tone(d, 'square', 2400, 600, 0.14, 0.06 * k, 0, { glide: 0.5, fm: [0.5, 1.5] });
        this.tone(d, 'sine', 1800, 400, 0.18, 0.2 * k, 0, { glide: 0.6 });
        this.noiseBurst(d, 'highpass', 5000, 3000, 0.04, 0.12 * k);
        break;
      case 'crateBreak':
        // a crate splinters open: a hollow knock, cracking planks and the clatter of boards
        this.tone(d, 'sine', 200, 110, 0.12, 0.4 * k, 0, { glide: 0.5 });
        this.noiseBurst(d, 'bandpass', 900, 500, 0.12, 0.36 * k, 0, { q: 1.5, drive: true });
        this.crackle(d, 8, 0.12, 0.2 * k, 0, 1800);
        for (let i = 0; i < 3; i++) this.tone(d, 'triangle', 300 + Math.random() * 200, 260, 0.06, 0.08 * k, 0.12 + i * 0.07 + Math.random() * 0.03);
        break;
      case 'crateBoom':
        // a volatile crate blows: boards flung apart and splinters raining down (layered over the blast)
        this.noiseBurst(d, 'bandpass', 1200, 400, 0.3, 0.36 * k, 0, { q: 1, drive: true });
        this.crackle(d, 12, 0.5, 0.18 * k, 0.02, 2000);
        for (let i = 0; i < 4; i++) this.tone(d, 'triangle', 250 + Math.random() * 200, 200, 0.07, 0.1 * k, 0.2 + i * 0.1 + Math.random() * 0.05);
        this.tone(d, 'sine', 140, 50, 0.25, 0.35 * k, 0, { glide: 0.5 });
        break;
      case 'voxAttack':
        this.vox(d, WORDS.attack, VOICES[style], 0.5 * k);
        break;
      case 'voxHurt':
        this.vox(d, WORDS.hurt, VOICES[style], 0.5 * k);
        break;
      case 'voxKo':
        this.vox(d, WORDS.koCry, VOICES[style], 0.5 * k);
        break;
      case 'voxTaunt':
        this.vox(d, WORDS.laugh, VOICES[style], 0.5 * k);
        break;
      case 'callReady':
        this.vox(d, WORDS.ready, VOICES.announcer, 0.5);
        break;
      case 'callGo':
        this.vox(d, WORDS.go, VOICES.announcer, 0.5);
        break;
      case 'callGame':
        this.vox(d, WORDS.game, VOICES.announcer, 0.5);
        break;
      case 'callTime':
        this.vox(d, WORDS.time, VOICES.announcer, 0.5);
        break;
      case 'callKo':
        this.vox(d, WORDS.ko, VOICES.announcer, 0.5);
        break;
      case 'coreGet':
        // a core fragment: power surging in, a rising FM sweep that resolves on a bright chord
        this.tone(d, 'sine', 220, 880, 0.3, 0.2 * k, 0, { attack: 0.05, fm: [2, 0.6] });
        this.noiseBurst(d, 'bandpass', 800, 5000, 0.3, 0.1 * k, 0, { attack: 0.15 });
        for (const [f, at] of [[1047, 0.24], [1319, 0.27], [1568, 0.3]] as const) {
          this.tone(d, 'triangle', f, f, 0.45, 0.12 * k, at);
          this.tone(d, 'sine', f * 2, f * 2, 0.3, 0.03 * k, at);
        }
        break;
    }
  }
}

export const sfx = new Sfx();
