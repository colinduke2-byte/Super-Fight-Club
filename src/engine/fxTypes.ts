/**
 * Data-driven presentation effects. Pure data (no Phaser): characters describe their visual effects in `<id>.fx.json`
 * and the UI layer interprets them (`src/fx/runner.ts`). Nothing here feeds back into the simulation.
 *
 * Positions are relative to the fighter: `x` is forward (flips with facing), `y` is px relative to the feet (negative = up),
 * `yh` adds a fraction of the fighter's height upward. `jx` / `jy` add random jitter (+-/2).
 */

/** Number sources a value can read: `res:<key>` (fighter resource), `charge` (0..1), `speed` (|vx|), `extra` / `mag` (event data). */
export type FxSource = string;

export type FxNum =
  | number
  | {
      /** `res:<key>` | `charge` | `speed` | `extra` | `mag` | `sin` | `cos` (of tick * freq + phase) */
      from: FxSource;
      mul?: number;
      add?: number;
      min?: number;
      max?: number;
      freq?: number;
      phase?: number;
    };

/** 0xRRGGBB number, '#rrggbb', '@accent' (the sprite accent), '@trail' (the character's trail colour), or a resource-indexed palette. */
export type FxColor = number | string | { from: FxSource; colors: (number | string)[] };

export interface FxPos {
  x?: FxNum;
  y?: FxNum;
  yh?: number;
  jx?: number;
  jy?: number;
}

export type FxOp =
  | ({ op: 'burst'; count: FxNum; speed: FxNum; color: FxColor; life?: number; size?: number } & FxPos)
  | ({ op: 'ring'; radius: FxNum; color: FxColor; life?: number } & FxPos)
  | ({ op: 'flash'; power: FxNum; color: FxColor } & FxPos)
  | ({ op: 'dust'; count: FxNum; /** multiplier of facing: -1 behind, 0 both sides, 1 ahead */ dir?: number } & FxPos)
  | ({ op: 'emit'; vx?: FxNum; vy?: FxNum; jvx?: number; jvy?: number; life: number; color: FxColor; size?: number; gravity?: number; additive?: boolean } & FxPos)
  | ({ op: 'trail'; to: FxPos; color: FxColor; /** rotate the segment by a random angle around its midpoint */ random?: boolean } & FxPos)
  /** Particle spawned on a ring around the body centre, drifting inward (charge auras). */
  | ({ op: 'converge'; radius: [number, number]; pull: number; swirl?: number; life: number; color: FxColor; size?: number; additive?: boolean })
  | { op: 'shake'; amount: FxNum }
  | { op: 'punch'; amount: FxNum };

export interface FxWhen {
  states?: string[];
  kinds?: string[];
  moves?: string[];
  phase?: 'startup' | 'active' | 'recovery';
  /** Inclusive move-frame range. */
  frames?: [number, number];
  minSpeed?: number;
  res?: { key: string; min?: number; max?: number };
  charging?: boolean;
  /** Smash / special charge fraction at least this (0..1). */
  chargeMin?: number;
  /** Also run during hit-stop (default: skipped). */
  hitlag?: boolean;
}

export interface FxRule {
  when?: FxWhen;
  /** Run every N sim ticks (default 1). */
  every?: FxNum;
  ops: FxOp[];
}

/** Sonic flavour of a fighter's swings and hits. */
export type SoundStyle = 'plain' | 'heavy' | 'blade' | 'arcane' | 'mech' | 'fire' | 'wind' | 'water' | 'stone';
export const SOUND_STYLES: SoundStyle[] = ['plain', 'heavy', 'blade', 'arcane', 'mech', 'fire', 'wind', 'water', 'stone'];

export interface CharacterFx {
  /** Swing / hit sound flavour (default 'plain'). */
  sound?: SoundStyle;
  /** Slash-arc / trail colour (default: the sprite accent). */
  trail?: FxColor;
  /** Slash-arc look: 'fire' burns (yellow-hot core, orange body, red rim, flame tongues licking off the edge). */
  slash?: 'plain' | 'fire' | 'water' | 'spark' | 'blade' | 'arcane' | 'volt' | 'gale' | 'crystal';
  /** Named recipes played for `{action:'fx', name}` move events and behaviour events; the shared library fills the gaps. */
  recipes?: Record<string, FxOp[]>;
  /** Per-tick auras / flourishes / charge effects. */
  rules?: FxRule[];
  /** Plays at every hit of this character's cinematic ultimate. */
  cinematicHit?: FxOp[];
}

// ---------------------------------------------------------------------------------------------
// Validation (run when a character / library is loaded, so typos fail loudly instead of silently)
// ---------------------------------------------------------------------------------------------
const OPS = new Set(['burst', 'ring', 'flash', 'dust', 'emit', 'trail', 'converge', 'shake', 'punch']);
const SOURCE_RE = /^(res:[A-Za-z0-9_]+|charge|speed|extra|mag|sin|cos)$/;

function checkNum(owner: string, n: FxNum | undefined): void {
  if (n === undefined || typeof n === 'number' || Array.isArray(n)) return;
  if (!SOURCE_RE.test(n.from)) throw new Error(`${owner}: bad number source '${n.from}'`);
}

function checkColor(owner: string, c: FxColor | undefined): void {
  if (c === undefined) return;
  if (typeof c === 'number') return;
  if (typeof c === 'string') {
    if (!(c === '@accent' || c === '@trail' || /^#[0-9a-fA-F]{6}$/.test(c))) throw new Error(`${owner}: bad colour '${c}'`);
    return;
  }
  if (!SOURCE_RE.test(c.from) || !Array.isArray(c.colors) || c.colors.length === 0) throw new Error(`${owner}: bad palette colour`);
  for (const k of c.colors) checkColor(owner, k);
}

export function validateOps(owner: string, ops: FxOp[]): void {
  if (!Array.isArray(ops)) throw new Error(`${owner}: effect recipe must be an array`);
  for (const o of ops) {
    if (!OPS.has(o.op)) throw new Error(`${owner}: unknown effect op '${(o as { op: string }).op}'`);
    const any = o as unknown as Record<string, unknown>;
    for (const k of ['x', 'y', 'count', 'speed', 'radius', 'power', 'amount', 'vx', 'vy']) checkNum(owner, any[k] as FxNum | undefined);
    checkColor(owner, any.color as FxColor | undefined);
    if (o.op === 'trail') for (const k of ['x', 'y']) checkNum(owner, (o.to as unknown as Record<string, FxNum | undefined>)[k]);
  }
}

export function validateFx(owner: string, fx: CharacterFx | undefined): void {
  if (!fx) return;
  checkColor(`${owner}.fx.trail`, fx.trail);
  if (fx.slash !== undefined && !['plain', 'fire', 'water', 'spark', 'blade', 'arcane', 'volt', 'gale', 'crystal'].includes(fx.slash)) throw new Error(`${owner}.fx.slash: unknown style '${fx.slash}'`);
  if (fx.sound !== undefined && !SOUND_STYLES.includes(fx.sound)) throw new Error(`${owner}.fx.sound: unknown style '${fx.sound}'`);
  for (const [name, ops] of Object.entries(fx.recipes ?? {})) validateOps(`${owner}.fx.recipes.${name}`, ops);
  (fx.rules ?? []).forEach((r, i) => {
    validateOps(`${owner}.fx.rules[${i}]`, r.ops);
    checkNum(`${owner}.fx.rules[${i}].every`, r.every);
  });
  if (fx.cinematicHit) validateOps(`${owner}.fx.cinematicHit`, fx.cinematicHit);
}
