/** Difficulty tuning and per-character knowledge for the CPU. */

export type CpuLevel = 1 | 2 | 3;

export interface LevelParams {
  name: string;
  /** Frames between offensive decisions. */
  thinkEvery: number;
  /** Frames a threat must be visible before the CPU reacts to it. */
  reaction: number;
  /** Chance (0..1) to shield / dodge a threat once reacted. */
  defend: number;
  /** Chance to tech a hard landing / wall hit. */
  tech: number;
  /** Chance to use directional influence in hitstun. */
  di: number;
  /** Recovery quality: lower = later / sloppier jump + special timing, aim error. */
  recovery: number;
  /** Goes after opponents who are off-stage. */
  edgeguard: boolean;
  /** 0..1 how often it attacks when something is in range. */
  aggression: number;
  /** Chance to punish an opponent's whiffed move / shield. */
  punish: number;
  /** 0..1 smash-attack charging (fraction of max charge held when it is safe). */
  charge: number;
  /** Random wasted actions per decision (0..1). */
  mistakes: number;
  /** Uses grabs, platforms, aerial approaches and stage hazards smartly. */
  smart: boolean;
}

export const LEVELS: Record<CpuLevel, LevelParams> = {
  1: { name: 'EASY', thinkEvery: 22, reaction: 24, defend: 0.25, tech: 0, di: 0, recovery: 0.7, edgeguard: false, aggression: 0.45, punish: 0.15, charge: 0, mistakes: 0.22, smart: false },
  2: { name: 'NORMAL', thinkEvery: 11, reaction: 13, defend: 0.6, tech: 0.5, di: 0.6, recovery: 0.9, edgeguard: true, aggression: 0.65, punish: 0.55, charge: 0.4, mistakes: 0.08, smart: true },
  3: { name: 'HARD', thinkEvery: 4, reaction: 5, defend: 0.92, tech: 1, di: 1, recovery: 1, edgeguard: true, aggression: 0.85, punish: 0.92, charge: 0.8, mistakes: 0.01, smart: true },
};

/**
 * What the CPU knows about a character beyond what its frame data already says (reach, speed and damage of normals are
 * derived automatically). Specials are named by input slot: neutralB / sideB / upB / downB.
 */
export interface CharacterAi {
  /** Projectile / zoning specials used at range. */
  ranged: string[];
  /** Gap-closing specials used when far from the target. */
  closers: string[];
  /** Closer slots that are aimed with the stick at the target (blink / dash strikes). */
  aimed?: string[];
  /** Setup specials (mines, turrets, runes) placed when the target is not on top of us. */
  setups: string[];
  /** Normals that kill: preferred at high percent. */
  finishers: string[];
  /** Specials the CPU never uses on its own. */
  avoid: string[];
  /** Special used as a defensive reflect / counter, tried against projectiles and close attacks. */
  defensive?: string;
  /** How many frames to hold the special button (charge) per slot. */
  holds: Record<string, number>;
  /** Recovery special: slot, vertical lift and horizontal reach in px (measured, see tests/ai.test.ts). */
  recovery: { slot: string; up: number; out: number; aim: 'stick8' | 'tether' | 'fixed' };
  /** Max distance at which the ultimate is used (cinematic grabs need to be close). */
  ultimateRange: number;
  /** 'hitandrun': prefers quick moves, backs off after each one instead of trading slow smashes. */
  style?: 'hitandrun';
  /** Preferred fighting distance (px between centres) when approaching. */
  spacing: number;
  /** A special that blows up the CPU's own deployables (Obelisk's Bedrock Stomp): used when a rival is next to one in range. */
  detonate?: { slot: string; range: number };
  /** An up-special-style option fired straight out of shield (`upB`: the stick is held up). */
  oos?: 'upB';
  /** Knock our own pillar into a rival standing beyond it (Obelisk): smash it when it sits within `reach` px in front. */
  strike?: { reach: number };
  /** A storable charge special (Brick's Charge Shoulder): wound up fully and banked with Shield when the rival is far away. */
  bank?: { slot: string; key: string; frames: number };
}

const GENERIC: CharacterAi = {
  ranged: [],
  closers: [],
  setups: [],
  finishers: ['fsmash', 'usmash', 'fair', 'bair'],
  avoid: [],
  holds: {},
  recovery: { slot: 'upB', up: 70, out: 60, aim: 'fixed' },
  ultimateRange: 80,
  spacing: 38,
};

export const CHARACTER_AI: Record<string, CharacterAi> = {
  brick: {
    ...GENERIC,
    closers: ['neutralB'],
    finishers: ['fsmash', 'usmash', 'fair', 'uair'],
    holds: { neutralB: 26 },
    bank: { slot: 'neutralB', key: 'punch', frames: 50 },
    oos: 'upB',
    recovery: { slot: 'upB', up: 90, out: 70, aim: 'fixed' },
    ultimateRange: 60,
    spacing: 36,
  },
  vex: {
    ...GENERIC,
    closers: ['neutralB'],
    aimed: ['neutralB'],
    setups: ['downB'],
    finishers: ['usmash', 'fsmash', 'fair', 'uair'],
    recovery: { slot: 'upB', up: 110, out: 110, aim: 'stick8' },
    ultimateRange: 70,
    spacing: 30,
    detonate: { slot: 'downB', range: 400 },
  },
  nova: {
    ...GENERIC,
    ranged: ['neutralB'],
    setups: ['sideB'],
    finishers: ['fsmash', 'usmash', 'fair', 'bair'],
    defensive: 'downB',
    holds: { neutralB: 12, downB: 30 },
    recovery: { slot: 'upB', up: 100, out: 100, aim: 'stick8' },
    ultimateRange: 240,
    spacing: 70,
  },
  gizmo: {
    ...GENERIC,
    ranged: ['sideB'],
    setups: ['neutralB'],
    finishers: ['fsmash', 'usmash', 'bair', 'dair'],
    recovery: { slot: 'upB', up: 130, out: 90, aim: 'tether' },
    ultimateRange: 400,
    spacing: 50,
  },
};

CHARACTER_AI.agni = {
  ...GENERIC,
  ranged: ['neutralB'],
  closers: ['sideB'],
  finishers: ['fsmash', 'usmash', 'fair', 'bair'],
  recovery: { slot: 'upB', up: 95, out: 45, aim: 'fixed' },
  ultimateRange: 320,
  spacing: 42,
};

CHARACTER_AI.halcyon = {
  ...GENERIC,
  ranged: ['neutralB'],
  closers: ['sideB'],
  finishers: ['fsmash', 'usmash', 'fair', 'bair'],
  recovery: { slot: 'upB', up: 100, out: 55, aim: 'fixed' },
  ultimateRange: 70,
  spacing: 52,
};

// Riptide: the grappler. Soaks from range with the Tidal Shot, closes with the unblockable Shark Lunge (which also beats
// shields), lays a Whirlpool when there is room, and wants to be close: throws are his finishers' best friend.
CHARACTER_AI.riptide = {
  ...GENERIC,
  ranged: ['neutralB'],
  closers: ['sideB'],
  setups: ['downB'],
  finishers: ['fsmash', 'usmash', 'bair', 'fair'],
  recovery: { slot: 'upB', up: 95, out: 40, aim: 'fixed' },
  ultimateRange: 70,
  spacing: 36,
};

// Obelisk: the terrain builder. Raises a Crystal Spire between itself and the rival when there is room (a wall against
// zoners and a launcher), fires Shard Volleys at range, stomps pillars into shards up close, recovers with Upheaval.
CHARACTER_AI.obelisk = {
  ...GENERIC,
  ranged: ['sideB'],
  setups: ['neutralB'],
  finishers: ['fsmash', 'usmash', 'fair', 'bair'],
  recovery: { slot: 'upB', up: 90, out: 34, aim: 'fixed' },
  ultimateRange: 70,
  spacing: 44,
  strike: { reach: 34 },
  detonate: { slot: 'downB', range: 120 },
};

// Rime: hit-and-run frost ninja. Needles at range, Frost Step to close, Substitution against close attacks, Shatter Ascent to recover.
CHARACTER_AI.rime = {
  ...GENERIC,
  ranged: ['neutralB'],
  closers: ['sideB'],
  finishers: ['usmash', 'fsmash', 'bair', 'uair'],
  defensive: 'downB',
  holds: { neutralB: 18 },
  recovery: { slot: 'upB', up: 96, out: 96, aim: 'stick8' },
  ultimateRange: 70,
  style: 'hitandrun',
  spacing: 28,
};

export function aiFor(id: string): CharacterAi {
  return CHARACTER_AI[id] ?? GENERIC;
}
