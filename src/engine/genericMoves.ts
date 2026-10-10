import type { MoveDef } from './moves';

/**
 * Moves every character has unless its own move file defines the same id: get-up attacks from the ledge and from lying
 * down, and the taunt. Kept generic so a new character gets a full toolset for free.
 */
const hb = (x: number, w: number, damage: number, base: number, scaling: number) => ({ x, y: -14, w, h: 28, damage, angle: 50, base, scaling, dir: 'away' as const, hitlag: 1, fx: 'punch' });

export const GENERIC_MOVES: Record<string, MoveDef> = {
  ledgeAttack: {
    id: 'ledgeAttack',
    name: 'Ledge Attack',
    kind: 'jab',
    anim: 'jab',
    startup: 6,
    active: 3,
    recovery: 20,
    invuln: [1, 8],
    hidden: true,
    hitboxes: [hb(24, 36, 8, 40, 0.8)],
  },
  getupAttack: {
    id: 'getupAttack',
    name: 'Get-up Attack',
    kind: 'jab',
    anim: 'jab',
    startup: 5,
    active: 3,
    recovery: 22,
    invuln: [1, 9],
    hidden: true,
    hitboxes: [hb(24, 36, 7, 36, 0.75), hb(-24, 36, 7, 36, 0.75)],
  },
  taunt: {
    id: 'taunt',
    name: 'Taunt',
    kind: 'jab',
    anim: 'idle',
    startup: 4,
    active: 1,
    recovery: 46,
    hidden: true,
    events: [{ frame: 6, action: 'fx', name: 'taunt' }],
    hitboxes: [],
  },
};
