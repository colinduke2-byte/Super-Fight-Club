import type { HitboxDef, MoveDef } from './moves';

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

/**
 * Grab variants every character gets from its own standing grab (unless its move file defines the id itself):
 * - dashGrab: out of a run, a lunge with more reach, a little slower and laggier.
 * - pivotGrab: out of a run with the stick pulled back, turns and lunges the other way: the longest reach, the most lag.
 */
const GRAB_VARIANTS: Record<string, { name: string; startup: number; recovery: number; reach: number; widen: number }> = {
  dashGrab: { name: 'Dash Grab', startup: 2, recovery: 8, reach: 8, widen: 8 },
  pivotGrab: { name: 'Pivot Grab', startup: 3, recovery: 10, reach: 12, widen: 10 },
};

const derivedCache = new WeakMap<MoveDef, Record<string, MoveDef>>();

/** A move derived from one of the character's own moves (see GRAB_VARIANTS), or undefined. Cached, so stable per grab. */
export function derivedMove(moves: Record<string, MoveDef>, id: string): MoveDef | undefined {
  const v = GRAB_VARIANTS[id];
  const grab = moves.grab;
  if (!v || !grab) return undefined;
  let cache = derivedCache.get(grab);
  if (!cache) derivedCache.set(grab, (cache = {}));
  return (cache[id] ??= {
    ...grab,
    id,
    name: v.name,
    startup: grab.startup + v.startup,
    recovery: grab.recovery + v.recovery,
    hidden: true,
    hitboxes: grab.hitboxes.map((h): HitboxDef => (h.grab ? { ...h, x: h.x + v.reach, w: h.w + v.widen } : h)),
  });
}
