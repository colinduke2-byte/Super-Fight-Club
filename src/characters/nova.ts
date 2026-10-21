import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, validateVariants, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { applyMovePoses } from '../engine/movePoses';
import { addMotionRows, standardAnimations } from './common';
import movesJson from './nova.moves.json';
import fxJson from './nova.fx.json';
import { validateFx, type CharacterFx } from '../engine/fxTypes';

const fx = fxJson as unknown as CharacterFx;
validateFx('nova', fx);

const json = movesJson as unknown as CharacterJson;

/** ARCANA CYCLE: the three elements, in cycle order. Index is stored in `fighter.res.element`. */
export const ELEMENTS = ['fire', 'ice', 'lightning'] as const;
export type Element = (typeof ELEMENTS)[number];
export const ELEMENT_COLORS = [0xff7a2a, 0x8fe6ff, 0xffee55];

export function nextElement(i: number): number {
  return (i + 1) % ELEMENTS.length;
}

/** Melee moves that carry the current element's effect. */
const ELEMENTAL_MOVES = new Set(['jab3', 'fsmash', 'usmash', 'dsmash', 'uair']);
/** Elemental melee damage: fire hits harder, lightning is a touch weaker. */
const ELEMENT_DAMAGE = [1.12, 1, 0.92];

const behavior: CharacterBehavior = {
  onTick(f) {
    f.res.elementBar = 100; // HUD seam: always full, coloured by the current element
    const m = f.move;
    f.damageMult = m && ELEMENTAL_MOVES.has(m.id) ? ELEMENT_DAMAGE[f.res.element] : 1;
  },
  onMoveEvent(f, name) {
    if (name === 'cycle') f.res.element = nextElement(f.res.element);
  },
  onHitDealt(f, victim, hb, _damage, world) {
    // only the elemental move's own hitboxes (not a bolt or rune landing while Nova is mid-swing)
    if (!f.move || !ELEMENTAL_MOVES.has(f.move.id) || !f.move.hitboxes.includes(hb)) return;
    switch (ELEMENTS[f.res.element]) {
      case 'fire':
        victim.applyStatus({ type: 'burn', frames: 100, value: 0.05 }, world);
        break;
      case 'ice':
        victim.applyStatus({ type: 'freeze', frames: 50, minPercent: 100, fallback: { type: 'slow', frames: 90, value: 0.6 } }, world);
        break;
      case 'lightning':
        victim.applyStatus({ type: 'stun', frames: 14 }, world);
        break;
    }
  },
};

const moves = parseMoves(json as never, 'nova');
validateReferences(moves, json.projectiles, json.deployables, 'nova');
const variants = {
  neutralB: { key: 'element', ids: ELEMENTS.map((e) => `neutralB_${e}`) },
  sideB: { key: 'element', ids: ELEMENTS.map((e) => `sideB_${e}`) },
};
validateVariants(variants, moves, 'nova');

/**
 * Nova: spell-slinging zoner. Controls space with elemental projectiles and traps; weak up close.
 * Down special cycles Fire -> Ice -> Lightning (the orb changes colour); hold it to plant a reflecting barrier.
 */
export const nova: CharacterData = {
  id: 'nova',
  fx,
  variants,
  name: 'Nova',
  tagline: 'Spell-slinging zoner. Fire, ice, lightning.',
  difficulty: 4,
  persona: {
    intro: 'Nova felt her stolen Aether humming from the arena core, loud as a second heartbeat. She follows the sound.',
    bio: 'A spell-slinger who heard her stolen Aether humming from the arena\'s core. Nova cycles fire, ice and lightning, and reads the fight a few moves ahead in the stars.',
    taunt: 'The stars said you would come. They laughed.',
    // in-match taunt bubbles take turns through these
    taunts: [
      'The stars said you would come. They laughed.',
      'Fire, ice or lightning? Trick question.',
      'Your fortune: bruises.',
      'I read your future. It is very short.',
    ],
    epilogue: 'The Aether returns to her staff like a lost bird. The Hollow glows blue for one long minute, and every lamp in the city remembers the sky.',
    victory: 'Written in the stars. Twice.',
    victories: [
      'Written in the stars. Twice.',
      'The cosmos sends its regards.',
      'As foretold.',
    ],
    // against their RIVAL (routes.ts): the line before the fight, and the one after beating them
    rival: { taunt: 'Vex. You sold what was mine. The stars want it back, with interest.', victory: 'Keep the change, Vex. I took the Aether back. And your hat.' },
  },
  stats: {
    weight: 100,
    runSpeed: 2.3,
    airSpeed: 2.0,
    groundAccel: 0.26,
    groundFriction: 0.3,
    airAccel: 0.22,
    airFriction: 0.05,
    gravity: 0.43,
    fallSpeed: 6.2,
    fastFallSpeed: 8.8,
    jumpHeight: 68,
    shortHopHeight: 31,
    doubleJumpHeight: 58,
    doubleJumps: 1,
    jumpsquatFrames: 4,
  },
  body: { width: 16, height: 28, footHalfWidth: 6 },
  sprite: {
    frameSize: 160,
    frameWidth: 216, // room for the staff swung level
    pixelScale: 0.29,
    animations: standardAnimations(['castF', 'castU', 'castD', 'dashS', 'raid']),
    placeholder: {
      art: 'hi',
      skin: '#e6bc98',
      armor: '#6a3fb8',
      armorDark: '#33206c',
      accent: '#7fe8ff',
      outline: '#0f0c26',
      build: { shoulderW: 13, torsoH: 11, legH: 6, headSize: 6.5, armLen: 9, helmet: 'pointed' },
      weapon: 'staff',
      extras: ['cloak'],
    },
  },
  moves,
  projectiles: json.projectiles,
  deployables: json.deployables,
  resources: { element: 0, elementBar: 100 },
  ultimate: { cost: 100, gainDealt: 0.3, gainTaken: 0.4 },
  hud: { resource: 'elementBar', max: 100, color: ELEMENT_COLORS[0], hotAt: 101, colors: ELEMENT_COLORS, colorKey: 'element' },
  companion: { resource: 'element', colors: ELEMENT_COLORS },
  behavior,
};

applyMovePoses(nova);
addMotionRows(nova); // full-motion rows (after the prune in applyMovePoses)
