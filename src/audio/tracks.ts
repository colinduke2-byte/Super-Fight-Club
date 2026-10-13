/**
 * Chiptune tracks as pure data. Each track is four bars of sixteenth-notes; `stepEvents` turns a step number into
 * the notes to play, so the music is testable without any audio. Melody cells are semitones above the bar's chord
 * root ('.' = rest, '-' = hold the previous note).
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
}

export type MusicVoice = 'lead' | 'bass' | 'arp' | 'kick' | 'snare' | 'hat';
export interface MusicEvent {
  voice: MusicVoice;
  midi: number;
  /** Length in sixteenth-notes. */
  steps: number;
}

export const STEPS_PER_BAR = 16;
export const BARS = 4;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;

export const TRACKS: Record<string, Track> = {
  menu: {
    id: 'menu',
    bpm: 96,
    roots: [60, 57, 53, 55],
    minor: [false, true, false, false],
    bass: '1...5...1...5...',
    arp: '0.1.2.3.2.1.0.1.',
    lead: ['7...12...11.7.4...', '4...7...9.7.3...', '5...9...12.9.5...', '7...11.12.14.......'],
    drums: 'k.......k.......',
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
  },
};

const triad = (minor: boolean): number[] => [0, minor ? 3 : 4, 7, 12];

/** Notes that start on `step` (0-based, wraps every LOOP_STEPS). Allocation-light: returns a fresh small array. */
export function stepEvents(track: Track, step: number): MusicEvent[] {
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  const bar = Math.floor(s / STEPS_PER_BAR);
  const i = s % STEPS_PER_BAR;
  const root = track.roots[bar];
  const out: MusicEvent[] = [];

  const b = track.bass[i];
  if (b && b !== '.') out.push({ voice: 'bass', midi: root - 12 + (b === '8' ? 12 : b === '5' ? 7 : 0), steps: 2 });

  const a = track.arp[i];
  if (a && a !== '.') out.push({ voice: 'arp', midi: root + 12 + triad(track.minor[bar])[Number(a)], steps: 1 });

  // lead: parse the cell string into (note|rest|hold) tokens
  const cells = leadCells(track.lead[bar]);
  const c = cells[i];
  if (c && c.kind === 'note') out.push({ voice: 'lead', midi: root + 12 + c.semis, steps: c.len });

  const d = track.drums[i];
  if (d === 'k') out.push({ voice: 'kick', midi: 0, steps: 1 });
  else if (d === 's') out.push({ voice: 'snare', midi: 0, steps: 1 });
  else if (d === 'h') out.push({ voice: 'hat', midi: 0, steps: 1 });
  return out;
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

export function leadCellCount(str: string): number {
  return leadCells(str).length;
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
