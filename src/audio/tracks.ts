/**
 * Chiptune tracks as pure data. Each track writes a four-bar phrase in sixteenth-notes; `stepEvents` arranges it into a
 * sixteen-bar song and turns a step number into the notes to play, so the music is testable without any audio. Melody
 * cells are semitones above the bar's chord root ('.' = rest, '-' = hold the previous note).
 *
 * The arrangement (the same form for every track, so each stage only has to write its phrase):
 *   A  (bars 1-4)   the phrase as written, a short snare pickup into the next section;
 *   A+ (bars 5-8)   more energy: eighth-note hats and a quiet octave double on the lead, a fill at the end;
 *   B  (bars 9-12)  a breakdown and build on the phrase's second half: half-time drums, a sustained pad and no lead,
 *                   then the lead comes back over a snare roll;
 *   A' (bars 13-16) the full return: crash, pad, doubled lead, a big fill into the loop (which opens with a crash).
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
   * voice that answers the first, held until its next note. Silent in the breakdown, softer in the first section.
   */
  counter?: [string, string, string, string];
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
  /** Wave of the sustained chord pad in the breakdown and the return (default triangle). */
  pad?: OscillatorType;
  /** Wave of the counter-melody (default square). */
  counter?: OscillatorType;
  /** Level trim (dB), measured so every track plays at the same loudness (tests/audioLevels.test.ts). */
  level?: number;
}

export type MusicVoice = 'lead' | 'counter' | 'bass' | 'arp' | 'kick' | 'snare' | 'hat' | 'crash' | 'pad';
export interface MusicEvent {
  voice: MusicVoice;
  midi: number;
  /** Length in sixteenth-notes. */
  steps: number;
  /** Relative loudness (default 1): doubled leads, the pad in the return and snare rolls play softer. */
  vel?: number;
}

export const STEPS_PER_BAR = 16;
/** Bars in a track's written phrase. */
export const BARS = 4;
/** Sections in the arranged song (A, A+, B, A'). */
export const SECTIONS = 4;
export const LOOP_STEPS = STEPS_PER_BAR * BARS * SECTIONS;

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
    sound: { arp: 'triangle', echo: 0.2, tone: 6500, level: -2.8 },
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
    sound: { detune: 6, echo: 0.2, tone: 7500, level: -3.8 },
  },
  // credits: slow and warm, a triangle lead with a long echo and a sine pad, looking back on the tournament
  credits: {
    id: 'credits',
    bpm: 90,
    roots: [53, 48, 50, 46],
    minor: [false, false, true, false],
    bass: '1.......5...8...',
    arp: '0.1.2.1.3.1.2.1.',
    lead: ['9...7...5...4.5.', '7...4...0...2.4.', '5...9...12...10.9.', '7...5...4...2...'],
    counter: ['12.......14.......', '11.......12.......', '15.......17.......', '14.......12.......'],
    drums: 'k.....h.s.....h.',
    sound: { lead: 'triangle', arp: 'sine', echo: 0.4, tone: 5000, pad: 'sine', counter: 'sine', level: -2.1 },
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
    sound: { lead: 'sawtooth', detune: 18, tone: 7000, bass: 'sawtooth', counter: 'square', level: -3.9 },
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
    sound: { echo: 0.25, tone: 5500, level: -2 },
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
    sound: { lead: 'sawtooth', detune: 12, tone: 6000, bass: 'sawtooth', level: -3.6 },
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
    sound: { tone: 6500, level: -2.6 },
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
    sound: { lead: 'triangle', echo: 0.3, tone: 6500, level: -1.8 },
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
    sound: { lead: 'triangle', arp: 'triangle', echo: 0.35, tone: 5000, level: -2.3 },
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
    sound: { arp: 'triangle', tone: 6000, level: -2.1 },
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
    sound: { lead: 'triangle', arp: 'triangle', echo: 0.4, tone: 3500, level: -1.4 },
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
    sound: { lead: 'triangle', arp: 'sine', echo: 0.35, tone: 8000, level: -1.8 },
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
    sound: { lead: 'sawtooth', detune: 10, tone: 7000, level: -2.7 },
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
    sound: { detune: 15, tone: 4500, bass: 'sawtooth', level: -3.9 },
  },
};

const triad = (minor: boolean): number[] => [0, minor ? 3 : 4, 7, 12];

/** Section of the song a bar (0..15) belongs to: 0 A, 1 A+, 2 B, 3 A'. */
export function sectionOf(step: number): number {
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  return Math.floor(s / (STEPS_PER_BAR * BARS));
}

/** Chord of a song bar: the B section dwells on the phrase's second half (bars 3-4 twice), which also sets up the return. */
function chordOf(track: Track, songBar: number): { root: number; minor: boolean; phraseBar: number } {
  const sec = Math.floor(songBar / BARS);
  const pb = songBar % BARS;
  const phraseBar = sec === 2 ? 2 + (pb % 2) : pb;
  return { root: track.roots[phraseBar], minor: track.minor[phraseBar], phraseBar };
}

/** Notes that start on `step` (0-based, wraps every LOOP_STEPS). Allocation-light: returns a fresh small array. */
export function stepEvents(track: Track, step: number): MusicEvent[] {
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  const songBar = Math.floor(s / STEPS_PER_BAR);
  const sec = Math.floor(songBar / BARS);
  const pb = songBar % BARS;
  const i = s % STEPS_PER_BAR;
  const { root, minor, phraseBar } = chordOf(track, songBar);
  const breakdown = sec === 2 && pb < 2;
  const out: MusicEvent[] = [];

  // bass: half-time roots through the breakdown, as written elsewhere
  if (breakdown) {
    if (i === 0 || i === 8) out.push({ voice: 'bass', midi: root - 12, steps: 8 });
  } else {
    const b = track.bass[i];
    if (b && b !== '.') out.push({ voice: 'bass', midi: root - 12 + (b === '8' ? 12 : b === '5' ? 7 : 0), steps: 2 });
  }

  const a = track.arp[i];
  if (a && a !== '.') out.push({ voice: 'arp', midi: root + 12 + triad(minor)[Number(a)], steps: 1, vel: breakdown ? 0.8 : 1 });

  // pad: a held chord through B and (softer) under the return
  if (i === 0 && sec >= 2) {
    const vel = sec === 2 ? 1 : 0.5;
    for (const n of triad(minor).slice(0, 3)) out.push({ voice: 'pad', midi: root + n, steps: STEPS_PER_BAR, vel });
  }

  // lead: silent in the breakdown, doubled an octave up (quietly) in A+ and the return
  if (!breakdown) {
    const cells = leadCells(track.lead[phraseBar]);
    const c = cells[i];
    if (c && c.kind === 'note') {
      out.push({ voice: 'lead', midi: root + 12 + c.semis, steps: c.len });
      if (sec === 1 || sec === 3) out.push({ voice: 'lead', midi: root + 24 + c.semis, steps: c.len, vel: 0.3 });
    }
    if (track.counter) {
      const cc = leadCells(track.counter[phraseBar]);
      const n = cc[i];
      if (n && n.kind === 'note') out.push({ voice: 'counter', midi: root + 12 + n.semis, steps: heldFor(cc, i), vel: sec === 0 ? 0.6 : 1 });
    }
  }

  const d = drumCell(track, sec, pb, i);
  if (d === 'k') out.push({ voice: 'kick', midi: 0, steps: 1 });
  else if (d === 's') out.push({ voice: 'snare', midi: 0, steps: 1 });
  else if (d === 'r') out.push({ voice: 'snare', midi: 0, steps: 1, vel: 0.35 + (0.65 * (i - 8)) / 7 });
  else if (d === 'h') out.push({ voice: 'hat', midi: 0, steps: 1 });
  if (i === 0 && pb === 0 && (sec === 0 || sec === 3)) out.push({ voice: 'crash', midi: 0, steps: 8 });
  return out;
}

/**
 * The drum cell for a bar of the song: the written pattern, with eighth-note hats added in the busier sections, half-time
 * in the breakdown, a 16th snare roll ('r', rising) into the return, and fills closing each phrase.
 */
function drumCell(track: Track, sec: number, pb: number, i: number): string {
  const w = track.drums[i] ?? '.';
  if (sec === 2) {
    if (pb < 2) return i === 0 ? 'k' : i === 8 ? 's' : i % 4 === 0 ? 'h' : '.';
    if (pb === 3 && i >= 8) return i === 8 ? 'k' : 'r';
  }
  const last = pb === BARS - 1;
  if (last && sec === 0 && i >= 14) return 's';
  if (last && (sec === 1 || sec === 3) && i >= 12) return i === 12 ? 'k' : 's';
  if ((sec === 1 || sec === 3) && w === '.' && i % 2 === 0) return 'h';
  return w;
}

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

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
