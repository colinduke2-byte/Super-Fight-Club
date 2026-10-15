/** Difficulty tuning and per-character knowledge for the CPU. */

/** The three lobby levels (Easy / Normal / Hard). They map onto the 1-9 skill scale: 1 -> 1, 2 -> 5, 3 -> 9. */
export type CpuLevel = 1 | 2 | 3;
/** Fine-grained CPU skill, 1 (weakest) .. 9 (strongest); see `SKILLS` and `skillParams`. */
export type CpuSkill = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const MIN_SKILL = 1;
export const MAX_SKILL = 9;

/**
 * Everything that separates a weak CPU from a strong one. A strong CPU is not a faster one (reactions are capped at a human
 * ~12 frames and it perfect-shields only now and then): it makes better decisions (punishes whiffs, follows up hits,
 * picks the kill move by its knockback, traps the ledge, mixes up its recovery and survives longer with DI).
 */
export interface LevelParams {
  name: string;
  /** Frames between offensive decisions. */
  thinkEvery: number;
  /** Frames a threat must be visible before the CPU reacts to it. */
  reaction: number;
  /** Chance (0..1) to shield / dodge a threat once reacted. */
  defend: number;
  /** Chance to wait and time the shield as a perfect shield (instead of raising it at once). */
  perfectShield: number;
  /** Chance to tech a hard landing / wall hit. */
  tech: number;
  /** Chance to use directional influence in hitstun. */
  di: number;
  /** Chance to smash-DI out of multi-hit moves (flicks during hitlag). */
  sdi: number;
  /** Chance to pick survival DI (simulated: whichever bend keeps it alive) when a launch would KO. */
  survivalDi: number;
  /** Recovery quality: lower = later / sloppier jump + special timing, aim error. */
  recovery: number;
  /** Recovery variety (0..1): mixes high / low / ledge / stage targets, side-special recoveries and delayed jumps. */
  recoveryMix: number;
  /** Goes after opponents who are off-stage. */
  edgeguard: boolean;
  /** Chance to jump out after an off-stage opponent (needs a healthy CPU and a jump). */
  edgeguardLeap: number;
  /** Chance to set up a ledge trap (stand off the ledge, time a hit on the get-up) when the rival hangs on the ledge. */
  ledgeTrap: number;
  /** Ledge option variety (0..1): 0 always climbs straight up, 1 reads the rival (roll / jump / attack / drop). */
  ledgeMix: number;
  /** 0..1 how often it attacks when something is in range. */
  aggression: number;
  /** Chance to punish an opponent's whiffed move / shield. */
  punish: number;
  /** Chance to run in and punish a whiff it is not already in range of (the fastest move that gets there in time). */
  whiffPunish: number;
  /** Chance to follow up a hit / throw (chase the launched rival, juggle, re-press into the next move). */
  combo: number;
  /** Chance to approach / space with short-hop aerials (and retreating back airs). */
  shortHop: number;
  /** Chance to trap a landing rival (wait under it with an up attack) instead of just jumping at it. */
  juggle: number;
  /** Chance to pick the finisher whose computed knockback actually kills (rather than the highest damage). */
  killConfirm: number;
  /** 0..1 smash-attack charging (fraction of max charge held when it is safe). */
  charge: number;
  /** Random wasted actions per decision (0..1). */
  mistakes: number;
  /** Uses grabs, platforms, aerial approaches and stage hazards smartly. */
  smart: boolean;
  /** 0..1 how well it values items (heals at high percent, bombs thrown from the air). */
  itemSense: number;
}

type NumKey = { [K in keyof LevelParams]: LevelParams[K] extends number ? K : never }[keyof LevelParams];

/** Anchor skills: 1 (old Easy), 5 (Normal), 9 (Hard). Everything in between is interpolated. */
const ANCHORS: Record<1 | 5 | 9, LevelParams> = {
  1: { name: 'EASY', thinkEvery: 22, reaction: 24, defend: 0.25, perfectShield: 0, tech: 0, di: 0, sdi: 0, survivalDi: 0, recovery: 0.7, recoveryMix: 0, edgeguard: false, edgeguardLeap: 0, ledgeTrap: 0, ledgeMix: 0, aggression: 0.45, punish: 0.15, whiffPunish: 0.05, combo: 0.05, shortHop: 0, juggle: 0, killConfirm: 0, charge: 0, mistakes: 0.22, smart: false, itemSense: 0.2 },
  5: { name: 'NORMAL', thinkEvery: 8, reaction: 16, defend: 0.55, perfectShield: 0.05, tech: 0.45, di: 0.55, sdi: 0.2, survivalDi: 0.2, recovery: 0.9, recoveryMix: 0.3, edgeguard: true, edgeguardLeap: 0.1, ledgeTrap: 0.2, ledgeMix: 0.35, aggression: 0.6, punish: 0.5, whiffPunish: 0.2, combo: 0.2, shortHop: 0.15, juggle: 0.15, killConfirm: 0.2, charge: 0.4, mistakes: 0.08, smart: true, itemSense: 0.5 },
  9: { name: 'HARD', thinkEvery: 4, reaction: 12, defend: 0.78, perfectShield: 0.3, tech: 0.9, di: 1, sdi: 0.85, survivalDi: 1, recovery: 1, recoveryMix: 0.85, edgeguard: true, edgeguardLeap: 0.7, ledgeTrap: 0.85, ledgeMix: 0.9, aggression: 0.85, punish: 0.95, whiffPunish: 0.9, combo: 0.9, shortHop: 0.7, juggle: 0.8, killConfirm: 0.95, charge: 0.8, mistakes: 0.01, smart: true, itemSense: 1 },
};

const SKILL_NAMES = ['', 'EASY', 'EASY+', 'NOVICE', 'NORMAL-', 'NORMAL', 'NORMAL+', 'SKILLED', 'HARD-', 'HARD'];

function lerpParams(a: LevelParams, b: LevelParams, t: number, skill: number): LevelParams {
  const out = { ...a, name: SKILL_NAMES[skill] } as LevelParams;
  for (const k of Object.keys(a) as (keyof LevelParams)[]) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') out[k as NumKey] = va + (vb - va) * t;
    else if (typeof va === 'boolean') (out as unknown as Record<string, boolean>)[k] = t < 0.5 ? va : (vb as boolean);
  }
  out.thinkEvery = Math.round(out.thinkEvery);
  out.reaction = Math.round(out.reaction);
  return out;
}

/** Parameters of every skill 1..9 (index 0 unused). */
export const SKILLS: readonly LevelParams[] = [ANCHORS[1], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => (s === 1 || s === 5 || s === 9 ? ANCHORS[s] : s < 5 ? lerpParams(ANCHORS[1], ANCHORS[5], (s - 1) / 4, s) : lerpParams(ANCHORS[5], ANCHORS[9], (s - 5) / 4, s)))];

/** The skill a lobby level plays at. */
export function skillForLevel(level: CpuLevel): CpuSkill {
  return level === 1 ? 1 : level === 2 ? 5 : 9;
}

/** Parameters for a skill (clamped to 1..9; fractional skills round). */
export function skillParams(skill: number): LevelParams {
  return SKILLS[Math.max(MIN_SKILL, Math.min(MAX_SKILL, Math.round(skill)))];
}

/** The lobby's three levels (kept for existing callers: Easy = skill 1, Normal = skill 5, Hard = skill 9). */
export const LEVELS: Record<CpuLevel, LevelParams> = { 1: SKILLS[1], 2: SKILLS[5], 3: SKILLS[9] };

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
  /** 'hitandrun': prefers quick moves, backs off after each one instead of trading slow smashes (Rime, Vex). */
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
  /** Distance band (px between centres) in which the closers are used; default 120..320. A short lunge wants it shorter. */
  closerRange?: [number, number];
  /** Added to a grab's score (grapplers: throws are the point of getting in). */
  grabBonus?: number;
  /** A tap special that switches the character's mode (Nova's Arcana Cycle): pressed now and then while the rival is far. */
  cycle?: string;
  /** A setup that sticks to a rival standing right in front (Havoc's C4): planted on them within `reach` px, set off later. */
  slap?: { slot: string; reach: number };
  /** A command grab special (Brick's Grapple Slam): used like a grab with reach (its lunge included), great against shields. */
  commandGrab?: string;
  /**
   * A special that cashes in a resource (Brick's Vent at Heat >= `min`, Agni's Flare Burst at flame level >= `min`): used as a
   * close-range move from its hitboxes once the resource is there. The move's own `requires` gate is honoured too.
   */
  spender?: { slot: string; key: string; min: number };
  /** A buff special that upgrades our deployables (Gizmo's Overclock): pressed when one is near and `key` >= `min`. */
  buff?: { slot: string; key: string; min: number; deployable: string; range: number };
  /** A diving special (Halcyon's Falcon Dive): fired from the air onto a rival below, only over solid stage. */
  dive?: string;
  /** Pressing this special again warps back to a marker (Vex's Blink Recall): used to get back from off the stage. */
  recall?: { slot: string; marker: string };
  /** A horizontal special used to cover distance when recovering from far out (not helpless: jumps / up special follow). */
  sideRecovery?: string;
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
    commandGrab: 'sideB',
    spender: { slot: 'downB', key: 'heat', min: 50 },
    grabBonus: 3,
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
    style: 'hitandrun',
    detonate: { slot: 'downB', range: 400 },
    recall: { slot: 'neutralB', marker: 'marker' },
    sideRecovery: 'sideB',
  },
  nova: {
    ...GENERIC,
    ranged: ['neutralB'],
    setups: ['sideB'],
    finishers: ['fsmash', 'usmash', 'fair', 'bair'],
    defensive: 'downB',
    cycle: 'downB',
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
    buff: { slot: 'downB', key: 'scrap', min: 5, deployable: 'turret', range: 170 },
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
  spender: { slot: 'downB', key: 'level', min: 2 },
  sideRecovery: 'sideB',
  ultimateRange: 320,
  spacing: 42,
};

CHARACTER_AI.halcyon = {
  ...GENERIC,
  ranged: ['neutralB'],
  closers: ['sideB'],
  finishers: ['fsmash', 'usmash', 'fair', 'bair'],
  recovery: { slot: 'upB', up: 100, out: 55, aim: 'fixed' },
  dive: 'downB',
  sideRecovery: 'sideB',
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
  // the lunge only carries ~80 px: fired from further out it just whiffs (and can carry him off the stage)
  closerRange: [40, 100],
  grabBonus: 9,
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
  spacing: 28,
  style: 'hitandrun',
  sideRecovery: 'sideB',
};

// Havoc: trap-and-punish soldier. Grenades and the missile at range, C4 as a setup (set off when a rival walks over it, or
// slapped onto a rival up close and set off once they are in kill range), the Cypher drone to recover. The rocket launcher
// and mortar smashes are projectile normals: moveTable gives them their flight path as reach.
CHARACTER_AI.havoc = {
  ...GENERIC,
  ranged: ['neutralB', 'sideB'],
  setups: ['downB'],
  finishers: ['fsmash', 'usmash', 'utilt', 'bair', 'uair'],
  // the missile is steered while Special is held (see CpuController.steerShot), so hold it for its whole flight
  holds: { sideB: 56 },
  recovery: { slot: 'upB', up: 110, out: 50, aim: 'fixed' },
  ultimateRange: 200,
  spacing: 40,
  detonate: { slot: 'downB', range: 400 },
  slap: { slot: 'downB', reach: 26 },
};

export function aiFor(id: string): CharacterAi {
  return CHARACTER_AI[id] ?? GENERIC;
}
