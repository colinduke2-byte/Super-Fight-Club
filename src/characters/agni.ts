import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, validateVariants, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { DEALT_RATE, DECAY_DELAY, DECAY_RATE, FLAME_MAX, LEVEL_AT, TAKEN_RATE, levelDamageMult } from './agniFlame';
import { standardAnimations } from './common';
import movesJson from './agni.moves.json';
import fxJson from './agni.fx.json';
import { validateFx, type CharacterFx } from '../engine/fxTypes';

const fx = fxJson as unknown as CharacterFx;
validateFx('agni', fx);

const json = movesJson as unknown as CharacterJson;
const moves = parseMoves(json as never, 'agni');
validateReferences(moves, json.projectiles, json.deployables, 'agni');

/** Specials (and the ultimate) whose version depends on the current Flame level: `<slot>_0..3`, picked by `res.level`. */
const variants = Object.fromEntries(['neutralB', 'sideB', 'upB', 'downB', 'ultimate'].map((slot) => [slot, { key: 'level', ids: [0, 1, 2, 3].map((l) => `${slot}_${l}`) }]));
validateVariants(variants, moves, 'agni');

const behavior: CharacterBehavior = {
  onTick(f) {
    f.damageMult = levelDamageMult(f.res.level); // level is derived from the flame by the resource rule below
  },
  onMoveStart(f, m) {
    // the burst and the beam commit all the stored flame
    if (m.id.startsWith('downB_') || m.id.startsWith('ultimate_')) f.res.flame = 0;
  },
};

/**
 * Agni: fire-god martial artist, the all-rounder. Solid fundamentals (tilts, a fireball, a rising uppercut, a spin kick)
 * and a stored-energy mechanic: Inner Flame builds from fighting and upgrades every special as it climbs.
 */
export const agni: CharacterData = {
  id: 'agni',
  fx,
  variants,
  resourceRules: [{ key: 'flame', max: FLAME_MAX, gainDealt: DEALT_RATE, gainTaken: TAKEN_RATE, decayAfter: DECAY_DELAY, decayRate: DECAY_RATE, levels: { key: 'level', at: [...LEVEL_AT] } }],
  name: 'Agni',
  tagline: 'Fire-god brawler. Build the flame, spend it big.',
  persona: {
    intro: 'Agni was a festival bonfire once, lit for a forgotten god. The arena asked who would dare to burn, and the flame stood up.',
    taunt: 'I do not need to win quickly. I only need to burn longer than you.',
    epilogue: 'The last light in the Hollow is no longer the arena\'s. Agni cups it in both hands and walks out into the night.',
  },
  stats: {
    weight: 92,
    runSpeed: 2.25,
    airSpeed: 1.7,
    groundAccel: 0.25,
    groundFriction: 0.3,
    airAccel: 0.18,
    airFriction: 0.05,
    gravity: 0.5,
    fallSpeed: 6.8,
    fastFallSpeed: 10,
    jumpHeight: 72,
    shortHopHeight: 33,
    doubleJumpHeight: 54,
    doubleJumps: 1,
    jumpsquatFrames: 4,
  },
  body: { width: 18, height: 27, footHalfWidth: 6 },
  sprite: {
    frameSize: 160,
    pixelScale: 0.29,
    animations: standardAnimations(['castF', 'castD', 'spinKick', 'beamF']),
    placeholder: {
      art: 'hi',
      skin: '#d99a62',
      armor: '#b3301c',
      armorDark: '#561810',
      accent: '#ff8a2a',
      outline: '#1a0a0c',
      build: { shoulderW: 14, torsoH: 11, legH: 10, headSize: 7, armLen: 10, helmet: 'band' },
      weapon: 'gauntlet',
      extras: ['sash'],
    },
  },
  moves,
  projectiles: json.projectiles,
  resources: { flame: 0, quiet: 0, level: 0 },
  ultimate: { cost: 100, gainDealt: 0.28, gainTaken: 0.4 },
  hud: { resource: 'flame', max: 100, color: 0xff7a2a, hotAt: 85, marks: [25, 55, 85] },
  behavior,
};

applyMovePoses(agni);
