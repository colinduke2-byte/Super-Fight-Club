/**
 * Chiptune tracks as pure data. Each track writes a four-bar phrase in sixteenth-notes (and optionally a bridge); the
 * arranger below (`songForm`, `stepEvents`) grows it into a song of two and a half minutes or more and turns a step number
 * into the notes to play, so the music is testable without any audio. Melody cells are semitones above the bar's chord
 * root ('.' = rest, which also holds the previous note a little longer).
 *
 * The song (every section is four bars; the same plan for every track, so a stage only writes its phrase):
 *   intro       bass, arp and a pad, the drums building up; no lead
 *   A           the phrase as written, a short fill into the next section
 *   A+          more energy: eighth-note hats and a quiet octave double on the lead
 *   B           breakdown: half-time drums and a pad on the phrase's second half, then a rising snare roll
 *   R           the return: crash, pad, doubled lead and a counter-melody, a big fill
 * then, until the song is long enough, chunks of four sections that alternate between
 *   bridge      C (new chords, a half-time melody built from the phrase), C2 (the same, busier, with a counter-melody),
 *               V (the phrase as a variation: ornamented, inverted or thinned out), R (the return)
 *   lift        build (drums and arp climbing, no lead), L (the return a key higher), drop (drums out, a sparse melody
 *               over the pad) and R, all in the new key
 * and an outro that winds down into the top of the song. Every chunk has its own variant number, which picks the melody
 * variation, the drum feel and the fills, so nothing repeats exactly until the whole song comes round again.
 */
export interface Track {
  id: string;
  bpm: number;
  /** Chord root (MIDI) per bar, and whether the chord is minor. */
  roots: [number, number, number, number];
  minor: boolean[];
  /** Bass: 16 cells per bar, '.' rest, '1' root, '8' octave, '5' fifth. */
  bass: string;
  /** Arpeggio: 16 cells, '.' rest, '0' root, '1' third, '2' fifth, '3' octave. */
  arp: string;
  /** Four bars of lead melody, 16 cells each. */
  lead: [string, string, string, string];
  /** Drums, 16 cells: k kick, s snare, h hat, '.' rest. */
  drums: string;
  /**
   * Optional counter-melody (same cell format as the lead, semitones above the chord root one octave up): a second lead
   * voice that answers the first, held until its next note. Softer in the first section; tracks without one get a simple
   * generated line of held chord tones in the sections that call for it.
   */
  counter?: [string, string, string, string];
  /** Optional bridge: its own four chords (and melody). Without one the bridge reorders the phrase's chords. */
  bridge?: { roots: [number, number, number, number]; minor: boolean[]; lead?: [string, string, string, string] };
  /** Key changes (semitones) for the lifted choruses, used in turn (default LIFTS). */
  lifts?: number[];
  /** Timbre, so stages differ in colour as well as in notes. Defaults: square lead and arp, triangle bass, 7 kHz tone. */
  sound?: TrackSound;
}

export interface TrackSound {
  lead?: OscillatorType;
  arp?: OscillatorType;
  bass?: OscillatorType;
  /** Lowpass on the whole track, Hz: lower is darker and softer. */
  tone?: number;
  /** Feedback (0..0.5) of a dotted-eighth echo on the lead. */
  echo?: number;
  /** Cents of detune between two lead oscillators (a thicker, chorused lead). */
  detune?: number;
  /** Wave of the sustained chord pad (default triangle). */
  pad?: OscillatorType;
  /** Wave of the counter-melody (default square). */
  counter?: OscillatorType;
  /** Level trim (dB), measured so every track plays at the same loudness (tests/musicLevels.test.ts). */
  level?: number;
}

export type MusicVoice = 'lead' | 'counter' | 'bass' | 'arp' | 'kick' | 'snare' | 'hat' | 'ohat' | 'tom' | 'crash' | 'pad';
export interface MusicEvent {
  voice: MusicVoice;
  /** Pitch (MIDI); for a tom, the drum's pitch. */
  midi: number;
  /** Length in sixteenth-notes. */
  steps: number;
  /** Relative loudness (default 1): doubled leads, the pad in the return and snare rolls play softer. */
  vel?: number;
}

export const STEPS_PER_BAR = 16;
/** Bars in a track's written phrase, and in every section of the song. */
export const BARS = 4;
export const SECTION_STEPS = STEPS_PER_BAR * BARS;
/** Every song plays at least this long (seconds) before it comes round again. */
export const MIN_SONG_SECONDS = 150;
/** Default key changes for the lifted choruses. */
export const LIFTS = [2, 5, 3];
/** Keys of the second and later bridges. */
const BRIDGE_KEYS = [-2, 1];
/** Notes above this (MIDI) drop an octave (or lose their octave double) so nothing shrieks. */
const TOP_NOTE = 100;

export const TRACKS: Record<string, Track> = {
  // character select: a driving, expectant groove ("choose your fighter"), bright square lead over a busy bass
  select: {
    id: 'select',
    bpm: 124,
    roots: [52, 48, 43, 50],
    minor: [true, false, false, false],
    bass: '1..1..8.1..1..5.',
    arp: '0.1.2.3.0.1.2.3.',
    lead: ['7...7.10.12...10.7.', '4...4.7.9...7.4.', '7.9.11.12...11.9.7.', '9...7...6.7.9...'],
    drums: 'k...s..kk.k.s...',
    bridge: { roots: [45, 48, 50, 47], minor: [true, false, false, true], lead: ['7...5...3.5.7...', '4...7...9.7.4...', '9...7...5...7.9.', '7...10...7.3.2...'] },
    sound: { arp: 'triangle', echo: 0.2, tone: 6500, level: -3.0 },
  },
  // results: the winner's victory lap, a bright major loop with a chorused lead
  results: {
    id: 'results',
    bpm: 112,
    roots: [55, 60, 52, 50],
    minor: [false, false, true, false],
    bass: '1...5.8.1...5.8.',
    arp: '0.2.1.2.3.2.1.2.',
    lead: ['0...4.7.12...7...', '4.4.7.4.0...7...', '7...3.7.10.12.10.7.', '2.4.7.9.12.......'],
    drums: 'k.h.s.h.k.k.s.h.',
    sound: { detune: 6, echo: 0.2, tone: 7500, level: -4.0 },
  },
  // credits: an anthem looking back on the tournament (I-V-vi-IV), a warm triangle lead with a square counter-melody
  credits: {
    id: 'credits',
    bpm: 100,
    roots: [50, 57, 59, 55],
    minor: [false, false, true, false],
    bass: '1...1.5.8...5...',
    arp: '0.1.2.1.3.1.2.1.',
    lead: ['4...7.9.7...4.2.', '4...4.7.9...7.4.', '3...5.7.10...7.5.', '7.9.11.12.14...11...'],
    counter: ['12.......11.......', '12.......9.......', '15.......14.......', '12.......14.......'],
    drums: 'k...s..hk.k.s..h',
    bridge: { roots: [55, 57, 54, 59], minor: [false, false, true, true], lead: ['7...9...11...12...', '4...7...9...7...', '7...10...12...10...', '7...5...3.......'] },
    lifts: [2, 3],
    sound: { lead: 'triangle', arp: 'sine', echo: 0.35, tone: 5500, pad: 'sine', counter: 'square', level: -3.3 },
  },
  // the Overseer's second phase: faster, a running sawtooth lead, a square counter-melody wailing above it and
  // relentless drums
  boss2: {
    id: 'boss2',
    bpm: 184,
    roots: [43, 43, 46, 44],
    minor: [true, true, false, false],
    bass: '1.8.1.8.1.8.5.8.',
    arp: '0.2.3.2.3.2.0.2.',
    lead: ['0.3.5.7.10.7.5.3.', '0.3.5.7.12.10.7.5.', '3.5.7.10.12.10.7.5.', '7.10.12.15.14.12.10.7.'],
    counter: ['12.......15.......', '12.......17.......', '15.......19.......', '17.......14...12...'],
    drums: 'kkhskhhskkhsk.ss',
    bridge: { roots: [44, 46, 43, 42], minor: [false, false, true, false] },
    lifts: [1, 3, -1],
    sound: { lead: 'sawtooth', detune: 18, tone: 7000, bass: 'sawtooth', counter: 'square', level: -3.5 },
  },
  menu: {
    id: 'menu',
    bpm: 96,
    roots: [60, 57, 53, 55],
    minor: [false, true, false, false],
    bass: '1...5...1...5...',
    arp: '0.1.2.3.2.1.0.1.',
    lead: ['7...12...11.7.4...', '4...7...9.7.3...', '5...9...12.9.5...', '7...11.12.14.......'],
    drums: 'k.......k.......',
    lifts: [-3, 2],
    sound: { echo: 0.25, tone: 5500, level: -2.5 },
  },
  boss: {
    id: 'boss',
    bpm: 168,
    roots: [43, 43, 46, 44],
    minor: [true, true, false, false],
    bass: '1.1.1.8.1.1.8.5.',
    arp: '0.2.3.2.0.2.3.2.',
    lead: ['0.0.3.0.5.0.7.5.', '0.0.3.0.5.7.10.7.', '3.3.5.3.7.3.10.7.', '5.5.7.5.10.7.12.10.'],
    drums: 'khksk.hskhksk.sk',
    bridge: { roots: [44, 44, 41, 42], minor: [false, false, true, false] },
    lifts: [1, 3, -1],
    sound: { lead: 'sawtooth', detune: 12, tone: 6000, bass: 'sawtooth', level: -3.3 },
  },
  ring: {
    id: 'ring',
    bpm: 128,
    roots: [57, 53, 48, 55],
    minor: [true, false, false, false],
    bass: '1.1.8.1.1.1.8.5.',
    arp: '0.2.3.2.0.2.3.2.',
    lead: ['0..3..5..7..5..3', '0..4..7..9..7..4', '0..4..7..4..0...', '2..5..7..5..2...'],
    drums: 'k.h.s.h.k.h.s.hh',
    sound: { tone: 6500, level: -2.8 },
  },
  classic: {
    id: 'classic',
    bpm: 140,
    roots: [52, 48, 50, 47],
    minor: [true, false, false, true],
    bass: '1.18.1.51.18.1.5',
    arp: '0.1.2.1.0.1.2.3.',
    lead: ['7.7.12.11.7...4...', '4.4.7.9.7...4...', '5.5.9.12.9.5.2.0.', '7.7.11.12.14.12.11.7.'],
    drums: 'k.hhs.hhk.hhs.hk',
    sound: { tone: 7000, level: -3.2 },
  },
  storm: {
    id: 'storm',
    bpm: 150,
    roots: [45, 41, 48, 43],
    minor: [true, false, false, false],
    bass: '1.1.8.1.1.5.8.1.',
    arp: '0.2.3.2.0.2.3.2.',
    lead: ['0.3.7.3.0.3.7.10.', '5.8.12.8.5.8.12.15.', '3.7.10.7.3.7.10.12.', '7.7.10.7.12.10.7.5.'],
    drums: 'k..hs.hhk.h.s.hk',
    sound: { lead: 'sawtooth', detune: 8, tone: 5500, level: -2.6 },
  },
  dawn: {
    id: 'dawn',
    bpm: 112,
    roots: [48, 55, 53, 52],
    minor: [false, false, false, true],
    bass: '1...5...1...8...',
    arp: '0.1.2.3.2.1.0.1.',
    lead: ['4...7...12.9...7.', '7...11.9...7.4...', '9...12.11.9...7...', '7.9.11.12.14.12.11.9.'],
    drums: 'k...s...k...s.h.',
    sound: { lead: 'triangle', echo: 0.3, tone: 6500, level: -2.2 },
  },
  temple: {
    id: 'temple',
    bpm: 118,
    roots: [50, 50, 46, 48],
    minor: [true, true, false, false],
    bass: '1..1..8.1..5..8.',
    arp: '0.2.3.2.0.2.3.2.',
    lead: ['12...10.7...5.7...', '7...10.12.15...12...', '5...7.10...7.5.3.', '7.5.3.0...3.5.7.'],
    drums: 'k..hk.s.k.hhk.s.',
    sound: { lead: 'triangle', arp: 'triangle', echo: 0.35, tone: 5000, level: -2.6 },
  },
  cove: {
    id: 'cove',
    bpm: 132,
    roots: [50, 45, 46, 45],
    minor: [true, true, false, false],
    bass: '1..5..1.8..5..1.',
    arp: '0..1..2.0..1..2.',
    lead: ['7.7.7..5.3.0.3.5', '12.12.12..10.7.3.7.10', '7.7.7..9.12.9.7.5', '7.4.0..4.7......'],
    drums: 'k..h..s.k..h..sh',
    sound: { arp: 'triangle', tone: 6000, level: -2.3 },
  },
  hollow: {
    id: 'hollow',
    bpm: 104,
    roots: [50, 46, 43, 45],
    minor: [true, false, true, false],
    bass: '1...1...8...5...',
    arp: '0.2.3.2.0.2.3.2.',
    lead: ['12...10.7...3.5.7.', '10...7.5...2.3.5.', '7...3.2.0...2.3.', '7.5.4.0...4.7...'],
    drums: 'k...h.s.k.k.h.s.',
    sound: { lead: 'triangle', arp: 'triangle', echo: 0.4, tone: 3500, level: -1.7 },
  },
  frostfang: {
    id: 'frostfang',
    bpm: 118,
    roots: [57, 53, 48, 55],
    minor: [true, false, false, false],
    bass: '1...5...8...5...',
    arp: '0.1.2.3.2.1.0.2.',
    lead: ['12.10.7.5.7...3.5.', '7.5.3.0.3...5.7.', '10.7.5.7.10.12.....', '7.5.3.5.7.......'],
    drums: 'k...h...s...h.h.',
    sound: { lead: 'triangle', arp: 'sine', echo: 0.35, tone: 8000, level: -2.1 },
  },
  stormrunner: {
    id: 'stormrunner',
    bpm: 148,
    roots: [55, 52, 48, 50],
    minor: [false, true, false, false],
    bass: '1.1.5.1.8.5.1.5.',
    arp: '0.2.3.2.0.2.3.2.',
    lead: ['7.7.12..119.7.4.7.', '7.9.12.9.7...4.7.', '12.12.14..1211.9.7...', '9.7.4.7.12.......'],
    drums: 'k.h.s.hkk.h.s.hs',
    sound: { lead: 'sawtooth', detune: 10, tone: 7000, level: -2.8 },
  },
  reactor: {
    id: 'reactor',
    bpm: 156,
    roots: [50, 46, 43, 45],
    minor: [true, false, true, false],
    bass: '1.1.1.1.1.1.8.1.',
    arp: '0.2.0.2.3.2.0.2.',
    lead: ['0.3.0.5.0.7.5.3.', '0.4.0.7.0.9.7.4.', '3.5.3.7.3.10.7.5.', '7.7.0.0.12.10.7.5.'],
    drums: 'k.hks.hkk.hks.sk',
    sound: { detune: 15, tone: 4500, bass: 'sawtooth', level: -3.7 },
  },
  // Launch Contest: a bouncy, sporty home-run-derby organ tune in C (I-IV-V-vi), syncopated arp and a hand-clap snare
  launch: {
    id: 'launch',
    bpm: 132,
    roots: [60, 53, 55, 57],
    minor: [false, false, false, true],
    bass: '1.5.8.5.1.5.8.5.',
    arp: '0..2..3.0..2..3.',
    lead: ['0.4.7.4.12...7.4.', '0.4.5.7.9...7.5.', '7.7.9.10.12...10.9.', '3.5.7.3.0...7...'],
    counter: ['12.......16.......', '12.......16.......', '14.......16.......', '12.......15.......'],
    drums: 'k.h.s.hkk.h.s.hh',
    bridge: { roots: [53, 55, 52, 57], minor: [false, false, true, true], lead: ['9...7...4.5.7...', '7...11...14.11.7...', '7...3...5.7.10...', '7...5...3.......'] },
    lifts: [2, 3],
    sound: { lead: 'square', arp: 'triangle', detune: 5, echo: 0.15, tone: 7000, counter: 'triangle', level: -4.6 },
  },
  // Training: an unhurried ii-V-I-vi practice groove, soft triangle lead and sine arp, a lazy backbeat
  training: {
    id: 'training',
    bpm: 108,
    roots: [50, 55, 48, 45],
    minor: [true, false, false, true],
    bass: '1...5.8.1...5...',
    arp: '0.2.1.3.0.2.1.3.',
    lead: ['3...7...10.....9.', '5...4...2.......', '4.7.11.9.7...4...', '7...3...5.3.2.0.'],
    drums: 'k..hs..hk.kh.s.h',
    bridge: { roots: [53, 52, 50, 55], minor: [false, true, true, false] },
    lifts: [-2, 3],
    sound: { lead: 'triangle', arp: 'sine', echo: 0.3, tone: 4800, pad: 'sine', level: -2.3 },
  },
  // Target Smash: tense and ticking, a running E-minor riff against the clock with a hi-hat pulse
  targets: {
    id: 'targets',
    bpm: 150,
    roots: [52, 52, 48, 50],
    minor: [true, true, false, false],
    bass: '1.1.1.1.8.1.1.5.',
    arp: '03.203.203.203.2',
    lead: ['0.0.3.0.7.0.10.7.', '0.0.3.0.7.10.12.10.', '4.4.7.4.11.7.4.2.', '2.4.7.9.12...9.7.'],
    drums: 'kh.hshkhkh.hsh.h',
    bridge: { roots: [48, 50, 47, 47], minor: [false, false, true, false] },
    lifts: [1, 3],
    sound: { lead: 'square', arp: 'triangle', detune: 4, echo: 0.15, tone: 6500, level: -4.6 },
  },
  // Story: slow and cinematic in A minor, long triangle notes over a held pad, a heartbeat kick
  story: {
    id: 'story',
    bpm: 84,
    roots: [45, 41, 48, 43],
    minor: [true, false, false, false],
    bass: '1.......8.......',
    arp: '0.1.2.3.2.1.2.1.',
    lead: ['12.......10...7...', '7.......9...11...', '7...4...2...4...', '4...2...0.......'],
    counter: ['3.......5.......', '4.......7.......', '7.......9.......', '7.......11.......'],
    drums: 'k.......s...k...',
    bridge: { roots: [41, 43, 45, 40], minor: [false, false, true, false], lead: ['7...9...12.......', '7...11...14.......', '12...10...7...3...', '7.......4.......'] },
    lifts: [3, -2],
    sound: { lead: 'triangle', arp: 'sine', echo: 0.4, tone: 4200, pad: 'triangle', counter: 'sine', level: -1.2 },
  },
};

// ---- the arranger ----------------------------------------------------------------------------------------------

export type SectionKind = 'intro' | 'A' | 'A+' | 'B' | 'R' | 'C' | 'C2' | 'V' | 'build' | 'L' | 'drop' | 'outro';
export interface Section {
  kind: SectionKind;
  /** Transposition (semitones) of the section. */
  key: number;
  /** Variation number: picks the melody variation, the drum feel and the fills. */
  v: number;
}

const formCache = new Map<Track, Section[]>();

/** Seconds of one bar of a track. */
export function barSeconds(t: Track): number {
  return (60 / t.bpm) * 4;
}

/**
 * The track's whole song, section by section: the opening, then bridge and lift chunks in turn until the song lasts at
 * least MIN_SONG_SECONDS, then the outro.
 */
export function songForm(t: Track): Section[] {
  const hit = formCache.get(t);
  if (hit) return hit;
  const S = (kind: SectionKind, key = 0, v = 0): Section => ({ kind, key, v });
  const form: Section[] = [S('intro'), S('A'), S('A+'), S('B'), S('R')];
  const lifts = t.lifts?.length ? t.lifts : LIFTS;
  const minBars = Math.ceil(MIN_SONG_SECONDS / barSeconds(t));
  for (let c = 0; (form.length + 1) * BARS < minBars; c++) {
    const v = c + 1;
    if (c % 2 === 0) {
      // later bridges wander to a neighbouring key too
      const key = c === 0 ? 0 : BRIDGE_KEYS[(c / 2 - 1) % BRIDGE_KEYS.length];
      form.push(S('C', key, v), S('C2', key, v), S('V', key, v), S('R', 0, v));
    }
    else {
      const key = lifts[((c - 1) / 2) % lifts.length];
      form.push(S('build', key, v), S('L', key, v), S('drop', key, v), S('R', key, v));
    }
  }
  form.push(S('outro'));
  formCache.set(t, form);
  return form;
}

/** Steps in a track's whole song (it loops after this). */
export function songSteps(t: Track): number {
  return songForm(t).length * SECTION_STEPS;
}

/** The section a step (wrapping) of the song falls in, and its index. */
export function sectionAt(t: Track, step: number): Section & { index: number } {
  const form = songForm(t);
  const n = form.length * SECTION_STEPS;
  const s = ((step % n) + n) % n;
  const index = Math.floor(s / SECTION_STEPS);
  return { ...form[index], index };
}

const triad = (minor: boolean): number[] => [0, minor ? 3 : 4, 7, 12];

/** The bridge's chords: the track's own, or its phrase's chords in a new order (ending where the phrase ends). */
function bridgeChords(t: Track): { roots: number[]; minor: boolean[] } {
  if (t.bridge) return t.bridge;
  const order = [2, 1, 2, 3];
  return { roots: order.map((k) => t.roots[k]), minor: order.map((k) => t.minor[k]) };
}

/** Chord of a bar (0-3) of a section, before the section's key: which written bar it borrows from, too. */
function chordOf(t: Track, kind: SectionKind, pb: number): { root: number; minor: boolean; phraseBar: number } {
  if (kind === 'C' || kind === 'C2') {
    const b = bridgeChords(t);
    return { root: b.roots[pb], minor: b.minor[pb], phraseBar: (pb + 2) % BARS };
  }
  // the breakdowns dwell on half the phrase (bars 3-4 twice, which also sets up the return; the drop on bars 1-2)
  const phraseBar = kind === 'B' ? 2 + (pb % 2) : kind === 'drop' ? pb % 2 : pb;
  return { root: t.roots[phraseBar], minor: t.minor[phraseBar], phraseBar };
}

/** Notes that start on `step` (0-based, wraps every songSteps). Allocation-light: returns a fresh small array. */
export function stepEvents(track: Track, step: number): MusicEvent[] {
  const form = songForm(track);
  const n = form.length * SECTION_STEPS;
  const s = ((step % n) + n) % n;
  const index = Math.floor(s / SECTION_STEPS);
  const sec = form[index];
  const next = form[(index + 1) % form.length];
  const pb = Math.floor((s % SECTION_STEPS) / STEPS_PER_BAR);
  const i = s % STEPS_PER_BAR;
  const kind = sec.kind;
  const ch = chordOf(track, kind, pb);
  const root = ch.root + sec.key;
  const minor = ch.minor;
  const out: MusicEvent[] = [];
  const last = pb === BARS - 1;

  // ---- bass
  const halfTime = (kind === 'B' && pb < 2) || (kind === 'intro' && pb < 2);
  if (kind === 'drop') {
    if (i === 0) out.push({ voice: 'bass', midi: root - 12, steps: 16, vel: 0.8 });
  } else if (halfTime) {
    if (i === 0 || i === 8) out.push({ voice: 'bass', midi: root - 12, steps: 8 });
  } else if (kind === 'C') {
    // the bridge pumps octaves in eighths
    if (i % 2 === 0) out.push({ voice: 'bass', midi: root - 12 + (i % 4 === 2 ? 12 : 0), steps: 2, vel: 0.85 });
  } else {
    const b = track.bass[i];
    if (b && b !== '.') out.push({ voice: 'bass', midi: root - 12 + (b === '8' ? 12 : b === '5' ? 7 : 0), steps: 2 });
    else if (kind === 'V' && i === 14 && !last) {
      // a walking variation: a chromatic approach note into the next bar's root
      const nr = chordOf(track, kind, pb + 1).root + sec.key;
      out.push({ voice: 'bass', midi: nr - 13, steps: 2, vel: 0.8 });
    }
  }

  // ---- arp
  const arpCell = kind === 'C' ? track.arp[STEPS_PER_BAR - 1 - i] : track.arp[i];
  // the intro's first bar and the drop only keep the arp's notes on the beat
  const sparseArp = (kind === 'intro' && pb === 0) || kind === 'drop';
  const arpOn = !!arpCell && arpCell !== '.' && !(sparseArp && i % 4 !== 0);
  if (arpOn) {
    const up = kind === 'build' && pb >= 2 ? 12 : 0;
    const vel = kind === 'intro' && pb < 2 ? 0.7 : kind === 'B' && pb < 2 ? 0.8 : kind === 'drop' ? 0.75 : 1;
    out.push({ voice: 'arp', midi: root + 12 + up + triad(minor)[Number(arpCell)], steps: 1, vel });
  }

  // ---- pad: a held chord through the breakdowns and the bridge, softer under the returns
  const padVel: Partial<Record<SectionKind, number>> = { B: 1, drop: 1, C: 0.8, C2: 0.6, R: 0.5, L: 0.5, intro: 0.7, build: 0.6 };
  const pv = kind === 'outro' ? (pb >= 2 ? 0.7 : 0) : (padVel[kind] ?? 0);
  if (i === 0 && pv > 0) for (const k of triad(minor).slice(0, 3)) out.push({ voice: 'pad', midi: root + k, steps: STEPS_PER_BAR, vel: pv });

  // ---- lead
  const leadCellsNow = leadFor(track, kind, sec.v, pb, ch.phraseBar, minor);
  if (leadCellsNow) {
    const c = leadCellsNow[i];
    if (c && c.kind === 'note') {
      let m = root + 12 + c.semis;
      if (m > TOP_NOTE) m -= 12;
      const vel = kind === 'drop' ? 0.75 : kind === 'C' ? 0.9 : 1;
      out.push({ voice: 'lead', midi: m, steps: c.len, vel });
      const dbl = kind === 'A+' || kind === 'R' || kind === 'L' || kind === 'C2';
      if (dbl && m + 12 <= TOP_NOTE) out.push({ voice: 'lead', midi: m + 12, steps: c.len, vel: 0.3 });
    }
  }

  // ---- counter-melody: the track's own in the choruses, or held chord tones where the arrangement wants a second voice
  const withCounter = kind === 'A' || kind === 'A+' || kind === 'R' || kind === 'L' || kind === 'V' || (kind === 'B' && pb >= 2) || kind === 'outro';
  if (track.counter && withCounter) {
    const cc = leadCells(track.counter[ch.phraseBar]);
    const nn = cc[i];
    if (nn && nn.kind === 'note') {
      let m = root + 12 + nn.semis;
      if (m > TOP_NOTE) m -= 12;
      out.push({ voice: 'counter', midi: m, steps: heldFor(cc, i), vel: kind === 'A' ? 0.6 : 1 });
    }
  } else if ((kind === 'C2' || ((kind === 'L' || kind === 'R') && sec.v > 0)) && (i === 0 || i === 8)) {
    const tone = triad(minor)[(pb + i / 8 + sec.v) % 2 === 0 ? 1 : 2];
    out.push({ voice: 'counter', midi: root + 12 + tone, steps: 8, vel: 0.55 });
  }

  // ---- drums
  const d = drumCell(track, sec, next, pb, i, index);
  switch (d) {
    case 'k':
      out.push({ voice: 'kick', midi: 0, steps: 1 });
      break;
    case 'K':
      out.push({ voice: 'kick', midi: 0, steps: 1 }, { voice: 'ohat', midi: 0, steps: 2, vel: 0.7 });
      break;
    case 's':
      out.push({ voice: 'snare', midi: 0, steps: 1 });
      break;
    case 'g':
      out.push({ voice: 'snare', midi: 0, steps: 1, vel: 0.3 });
      break;
    case 'r': {
      // a rising roll: the whole last bar of a build, or its second half elsewhere
      const from = kind === 'build' ? 0 : 8;
      out.push({ voice: 'snare', midi: 0, steps: 1, vel: 0.35 + (0.65 * (i - from)) / (15 - from) });
      break;
    }
    case 'h':
      out.push({ voice: 'hat', midi: 0, steps: 1 });
      break;
    case 'o':
      out.push({ voice: 'ohat', midi: 0, steps: 2 });
      break;
    case '1':
    case '2':
    case '3':
      out.push({ voice: 'tom', midi: [0, 57, 50, 43][Number(d)], steps: 2 });
      break;
  }
  const crashAt = kind === 'intro' || kind === 'R' || kind === 'L' || kind === 'C2' || kind === 'V' || kind === 'outro';
  if (i === 0 && pb === 0 && crashAt) out.push({ voice: 'crash', midi: 0, steps: 8 });
  return out;
}

/**
 * The drum cell for a step: the written pattern with the section's feel (eighth hats in the busier sections, half time in
 * the breakdown and the bridge, nothing but a tick in the drop, a climbing build), and a fill closing the section.
 */
function drumCell(track: Track, sec: Section, next: Section, pb: number, i: number, index: number): string {
  const w = track.drums[i] ?? '.';
  const kind = sec.kind;
  const last = pb === BARS - 1;
  switch (kind) {
    case 'intro':
      if (pb === 0) return i === 0 || i === 8 ? 'k' : '.';
      if (pb === 1) return i % 4 === 0 ? 'k' : i % 4 === 2 ? 'h' : '.';
      if (pb === 2) return w === 's' ? 'h' : w;
      break;
    case 'B':
      if (pb < 2) return i === 0 ? 'k' : i === 8 ? 's' : i % 4 === 0 ? 'h' : '.';
      if (pb === 3 && i >= 8) return i === 8 ? 'k' : 'r';
      return w;
    case 'drop':
      // the drums fall away: a tick on the beat, then the kick creeps back in under a short roll
      if (pb < 3) return pb > 0 && i % 4 === 0 ? 'h' : '.';
      return i < 12 ? (i % 4 === 0 ? 'k' : '.') : 'r';
    case 'build':
      if (pb === 0) return i % 4 === 0 ? 'k' : '.';
      if (pb === 1) return i % 4 === 0 ? 'k' : i >= 8 && i % 2 === 0 ? 's' : '.';
      if (pb === 2) return i % 2 === 0 ? (i % 4 === 0 ? 'k' : 's') : '.';
      return 'r';
    case 'C':
      if (!last) return i === 0 || i === 10 ? 'k' : i === 8 ? 's' : i % 2 === 0 ? 'h' : '.';
      break;
    default:
      break;
  }
  if (last) {
    // into a drop: a stop (two beats of silence) instead of a fill
    if (next.kind === 'drop') return i >= 12 ? '.' : w;
    const f = fill((sec.v + index) % 4, i, kind === 'R' || kind === 'L' || kind === 'outro');
    if (f) return f;
  }
  const busy = kind === 'A+' || kind === 'R' || kind === 'L' || kind === 'V' || kind === 'C2' || kind === 'outro';
  if (busy) {
    const feel = sec.v % 3;
    if (w === '.' && feel === 1 && i % 8 === 6) return 'o';
    if (w === '.' && feel === 2 && (i === 7 || i === 15)) return 'g';
    if (w === '.' && i % 2 === 0) return 'h';
    if (w === 'k' && i === 0 && feel === 1) return 'K';
  }
  return w;
}

/** A fill over the end of a bar (null: no fill on this step). `big` fills start earlier. */
function fill(type: number, i: number, big: boolean): string | null {
  const from = big ? 8 : 12;
  if (i < from) return null;
  switch (type) {
    case 0:
      return i >= 14 ? 's' : big && i % 2 === 0 ? 's' : null;
    case 1:
      return i === 12 ? 'k' : i > 12 ? 's' : i % 2 === 0 ? 'g' : null;
    case 2:
      // toms down the kit
      return i >= 14 ? '3' : i >= 12 ? '2' : i % 2 === 0 ? '1' : null;
    default:
      return i === 15 ? 's' : i === 14 ? '3' : i === 13 ? '2' : i === 12 ? '1' : i % 2 === 0 ? 'g' : null;
  }
}

// ---- melody ----------------------------------------------------------------------------------------------------

interface Cell {
  kind: 'note' | 'rest';
  semis: number;
  len: number;
}
const cellCache = new Map<string, Cell[]>();

/**
 * Lead strings are written either as a run of single-digit semitones with '.' rests ("0..3..5") or, for notes
 * above 9, with the number in brackets-free two-digit form (10, 11, 12, 14). Digits are greedily grouped: a
 * leading '1' followed by a digit is read as 10-19.
 */
function leadCells(str: string): Cell[] {
  let cells = cellCache.get(str);
  if (cells) return cells;
  cells = [];
  for (let k = 0; k < str.length; k++) {
    const ch = str[k];
    if (ch === '.') {
      // a rest extends the previous note by one step (so "7.." is a three-step note)
      const prev = cells[cells.length - 1];
      cells.push({ kind: 'rest', semis: 0, len: 0 });
      if (prev && prev.kind === 'note' && prev.len < 3) prev.len++;
    } else if (ch === '1' && k + 1 < str.length && /[0-9]/.test(str[k + 1])) {
      cells.push({ kind: 'note', semis: Number(ch + str[k + 1]), len: 1 });
      k++;
    } else {
      cells.push({ kind: 'note', semis: Number(ch), len: 1 });
    }
  }
  cellCache.set(str, cells);
  return cells;
}

/** Steps from a note to the next note in its bar (or the bar's end): the counter-melody holds its notes. */
function heldFor(cells: Cell[], i: number): number {
  let j = i + 1;
  while (j < cells.length && cells[j].kind === 'rest') j++;
  return j - i;
}

export function leadCellCount(str: string): number {
  return leadCells(str).length;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
/** The scale tone (semitones above the chord root, any octave) nearest to `x`. */
function snap(x: number, minor: boolean): number {
  const sc = minor ? MINOR : MAJOR;
  let best = x;
  let bd = Infinity;
  for (let o = -12; o <= 24; o += 12)
    for (const d of sc) {
      const c = o + d;
      if (Math.abs(c - x) < bd) {
        bd = Math.abs(c - x);
        best = c;
      }
    }
  return best;
}
/** The scale tone a step above or below `x` (which is on the scale). */
function scaleStep(x: number, dir: 1 | -1, minor: boolean): number {
  for (let d = 1; d <= 3; d++) {
    const c = x + d * dir;
    if (snap(c, minor) === c) return c;
  }
  return x + dir;
}

const varCache = new Map<string, Cell[]>();

/**
 * A melody variation of one bar: 'orn' fills the gaps with passing notes, 'inv' mirrors the line around its first note,
 * 'thin' keeps one note a beat (held) for a half-time melody. Every note stays on the chord's scale.
 */
function vary(str: string, how: 'orn' | 'inv' | 'thin', minor: boolean): Cell[] {
  const key = `${how}|${minor ? 1 : 0}|${str}`;
  const hit = varCache.get(key);
  if (hit) return hit;
  const src = leadCells(str);
  const out: Cell[] = src.map(() => ({ kind: 'rest', semis: 0, len: 0 }));
  const notes = src.map((c, i) => ({ c, i })).filter((x) => x.c.kind === 'note');
  if (how === 'thin') {
    for (let b = 0; b < STEPS_PER_BAR; b += 4) {
      const first = notes.find((x) => x.i >= b && x.i < b + 4);
      if (first) out[b] = { kind: 'note', semis: snap(first.c.semis, minor), len: 4 };
    }
  } else if (how === 'inv') {
    const pivot = notes[0]?.c.semis ?? 0;
    for (const { c, i } of notes) out[i] = { kind: 'note', semis: Math.max(-5, Math.min(19, snap(2 * pivot - c.semis, minor))), len: c.len };
  } else {
    notes.forEach(({ c, i }, k) => {
      const gap = (notes[k + 1]?.i ?? STEPS_PER_BAR) - i;
      out[i] = { kind: 'note', semis: c.semis, len: Math.min(c.len, gap >= 4 ? 2 : c.len) };
      if (gap >= 4) {
        // a passing note half way to the next one (or a neighbour note above when the line stays put)
        const to = notes[k + 1]?.c.semis ?? c.semis;
        const dir: 1 | -1 = to > c.semis ? 1 : to < c.semis ? -1 : 1;
        const p = scaleStep(snap(c.semis, minor), dir, minor);
        out[i + Math.floor(gap / 2)] = { kind: 'note', semis: Math.min(19, p), len: Math.min(2, gap - Math.floor(gap / 2)) };
      }
    });
  }
  varCache.set(key, out);
  return out;
}

/** The lead cells for a bar of a section (null: no lead here). */
function leadFor(t: Track, kind: SectionKind, v: number, pb: number, phraseBar: number, minor: boolean): Cell[] | null {
  switch (kind) {
    case 'intro':
    case 'build':
      return null;
    case 'B':
      return pb < 2 ? null : leadCells(t.lead[phraseBar]);
    case 'drop':
      return vary(t.lead[phraseBar], 'thin', minor);
    case 'C':
    case 'C2': {
      const own = t.bridge?.lead?.[pb];
      if (own) return kind === 'C2' && v % 2 === 1 ? vary(own, 'orn', minor) : leadCells(own);
      // no bridge melody of its own: the phrase's other half, thinned to half time (busier the second time)
      return vary(t.lead[phraseBar], kind === 'C' ? 'thin' : 'orn', minor);
    }
    case 'V': {
      const how = (['orn', 'inv', 'thin'] as const)[(v - 1) % 3];
      // the last bar keeps its written shape so the variation still lands where the phrase does
      return pb === BARS - 1 && how !== 'orn' ? leadCells(t.lead[phraseBar]) : vary(t.lead[phraseBar], how, minor);
    }
    case 'outro':
      return pb < 2 ? leadCells(t.lead[phraseBar]) : vary(t.lead[phraseBar], 'thin', minor);
    default:
      return leadCells(t.lead[phraseBar]);
  }
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
