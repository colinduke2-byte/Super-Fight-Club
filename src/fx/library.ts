import { validateOps, type FxOp, type FxRule } from '../engine/fxTypes';

/**
 * Shared effect recipes: any character (or the boss) can reference these names from its move events without defining them.
 * A character's own `fx.recipes` entry of the same name wins.
 */
export const LIBRARY_RECIPES: Record<string, FxOp[]> = {
  taunt: [
    { op: 'ring', y: -6, yh: 1, radius: 12, color: 0xffe14a, life: 0.4 },
    { op: 'burst', y: -6, yh: 1, count: 8, speed: 50, color: 0xffe14a, life: 0.4, size: 2 },
  ],
  place: [{ op: 'dust', x: 22, count: 5 }],
  fizzle: [{ op: 'burst', y: -22, count: 4, speed: 30, color: 0x888888, life: 0.25, size: 2 }],
  cast: [{ op: 'flash', x: 20, y: -18, power: 0.9, color: '@accent' }],
  beam: [{ op: 'shake', amount: 6 }],
  converge: [
    { op: 'ring', y: -14, radius: 50, color: 0xffffff, life: 0.8 },
    { op: 'burst', y: -14, count: 30, speed: 90, color: '@accent', life: 0.7, size: 3 },
  ],
  stomp: [
    { op: 'dust', x: -30, count: 8, dir: -1 },
    { op: 'dust', x: 30, count: 8, dir: 1 },
    { op: 'ring', y: -2, radius: 46, color: 0xffffff, life: 0.35 },
    { op: 'shake', amount: 8 },
  ],
  slam: [
    { op: 'trail', x: 10, y: -1, to: { x: 80, y: -1 }, color: '@accent' },
    { op: 'dust', x: 18, count: 12 },
    { op: 'ring', x: 18, y: -2, radius: 30, color: 0xffffff, life: 0.3 },
    { op: 'flash', x: 18, y: -8, power: 2, color: 0xffffff },
    { op: 'shake', amount: 8 },
  ],
  overload: [
    { op: 'ring', y: -14, radius: 40, color: 0xff6a30, life: 0.6 },
    { op: 'burst', y: -14, count: 24, speed: 80, color: 0xffd46a, life: 0.6, size: 3 },
  ],
};

/** Applied to any fighter whose character defines no charge-aura rule of its own: accent motes pulled in as a smash charges. */
export const DEFAULT_RULES: FxRule[] = [
  { when: { charging: true }, every: { from: 'charge', mul: -1, add: 3, min: 2 }, ops: [{ op: 'converge', radius: [20, 30], pull: 3, life: 0.28, color: '@accent' }] },
  { when: { charging: true, chargeMin: 1 }, every: 6, ops: [{ op: 'ring', yh: 0.5, radius: 16, color: '@accent', life: 0.25 }] },
];

/** Applied to every fighter: speed lines behind dashes and lunging attacks. */
export const ALWAYS_RULES: FxRule[] = [
  { when: { states: ['attack', 'dash'], minSpeed: 2.4 }, every: 2, ops: [{ op: 'trail', x: -16, y: -6, yh: 0.3, jy: 14, to: { x: -36 }, color: '@trail' }] },
  { when: { states: ['air'], minSpeed: 5 }, every: 3, ops: [{ op: 'trail', x: -12, yh: 0.4, jy: 10, to: { x: -28 }, color: 0xffffff }] },
];

for (const [k, v] of Object.entries(LIBRARY_RECIPES)) validateOps(`library.${k}`, v);
for (const r of [...DEFAULT_RULES, ...ALWAYS_RULES]) validateOps('library.rules', r.ops);
