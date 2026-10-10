import type { CharacterBehavior } from '../engine/behavior';
import { parseMoves, validateReferences, type CharacterJson } from '../engine/moves';
import type { CharacterData } from '../engine/types';
import { standardAnimations } from './common';
import movesJson from './nova.moves.json';

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
  /** Neutral and side special change behaviour with the element. */
  chooseMove(f, id) {
    if (id === 'neutralB' || id === 'sideB') return `${id}_${ELEMENTS[f.res.element]}`;
    return id;
  },
  onMoveEvent(f, name) {
    if (name === 'cycle') f.res.element = nextElement(f.res.element);
  },
  onHitDealt(f, victim, _hb, _damage, world) {
    if (!f.move || !ELEMENTAL_MOVES.has(f.move.id)) return;
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

/**
 * Nova: spell-slinging zoner. Controls space with elemental projectiles and traps; weak up close.
 * Down special cycles Fire -> Ice -> Lightning (the orb changes colour); hold it to plant a reflecting barrier.
 */
export const nova: CharacterData = {
  id: 'nova',
  name: 'Nova',
  tagline: 'Spell-slinging zoner. Fire, ice, lightning.',
  stats: {
    weight: 100,
    runSpeed: 2.3,
    airSpeed: 2.0,
    groundAccel: 0.26,
    groundFriction: 0.3,
    airAccel: 0.22,
    airFriction: 0.05,
    gravity: 0.38,
    fallSpeed: 5.6,
    fastFallSpeed: 8.8,
    jumpHeight: 68,
    shortHopHeight: 31,
    doubleJumpHeight: 58,
    doubleJumps: 1,
    jumpsquatFrames: 4,
  },
  body: { width: 16, height: 28, footHalfWidth: 6 },
  sprite: {
    frameSize: 64,
    pixelScale: 0.5,
    animations: standardAnimations(['castF', 'castU', 'castD', 'raid']),
    placeholder: {
      skin: '#e6bc98',
      armor: '#6a3fb8',
      armorDark: '#33206c',
      accent: '#7fe8ff',
      outline: '#0f0c26',
      build: { shoulderW: 13, torsoH: 12, legH: 5, headSize: 8, armLen: 9, helmet: 'pointed' },
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
