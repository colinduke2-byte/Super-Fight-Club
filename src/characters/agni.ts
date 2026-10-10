import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { addFlame, decayFlame, flameFromDealt, flameFromTaken, flameLevel, levelDamageMult } from './agniFlame';
import { standardAnimations } from './common';
import movesJson from './agni.moves.json';

const json = movesJson as unknown as CharacterJson;
const moves = parseMoves(json as never, 'agni');
validateReferences(moves, json.projectiles, json.deployables, 'agni');

/** Specials whose behaviour depends on the current Flame level (variants are named `<slot>_<level>`). */
const LEVELLED = new Set(['neutralB', 'sideB', 'upB', 'downB']);

const behavior: CharacterBehavior = {
  onTick(f) {
    f.res.quiet++;
    f.res.flame = decayFlame(f.res.flame, f.res.quiet);
    f.res.level = flameLevel(f.res.flame);
    f.damageMult = levelDamageMult(f.res.level);
  },
  chooseMove(f, id) {
    return LEVELLED.has(id) ? `${id}_${flameLevel(f.res.flame)}` : id;
  },
  remapMove(f, id) {
    return id === 'ultimate' ? `ultimate_${flameLevel(f.res.flame)}` : id;
  },
  onMoveStart(f, m) {
    // the burst and the beam commit all the stored flame
    if (m.id.startsWith('downB_') || m.id.startsWith('ultimate_')) f.res.flame = 0;
  },
  onHitDealt(f, _victim, _hb, damage) {
    f.res.flame = addFlame(f.res.flame, flameFromDealt(damage));
    f.res.quiet = 0;
  },
  onHitTaken(f, _attacker, damage) {
    f.res.flame = addFlame(f.res.flame, flameFromTaken(damage));
    f.res.quiet = 0;
  },
};

/**
 * Agni: fire-god martial artist, the all-rounder. Solid fundamentals (tilts, a fireball, a rising uppercut, a spin kick)
 * and a stored-energy mechanic: Inner Flame builds from fighting and upgrades every special as it climbs.
 */
export const agni: CharacterData = {
  id: 'agni',
  name: 'Agni',
  tagline: 'Fire-god brawler. Build the flame, spend it big.',
  stats: {
    weight: 92,
    runSpeed: 1.95,
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
    frameSize: 64,
    pixelScale: 0.5,
    animations: standardAnimations(['castF', 'castD', 'spinKick', 'beamF']),
    placeholder: {
      skin: '#d99a62',
      armor: '#b3301c',
      armorDark: '#561810',
      accent: '#ff8a2a',
      outline: '#1a0a0c',
      build: { shoulderW: 15, torsoH: 11, legH: 9, headSize: 7, armLen: 10, helmet: 'band' },
      weapon: 'gauntlet',
      extras: ['sash'],
    },
  },
  moves,
  projectiles: json.projectiles,
  resources: { flame: 0, quiet: 0, level: 0 },
  ultimate: { cost: 100, gainDealt: 0.28, gainTaken: 0.4 },
  hud: { resource: 'flame', max: 100, color: 0xff7a2a, hotAt: 85 },
  behavior,
};
