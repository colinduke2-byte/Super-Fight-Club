import type { CharacterBehavior } from './behavior';
import type { CharacterFx } from './fxTypes';
import type { DeployableDef, MoveDef, ProjectileDef } from './moves';

/** Shared data shapes for the simulation. Pure data, no Phaser imports. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlatformMotion {
  axis: 'x' | 'y';
  /** Peak displacement in px from the base position. */
  amplitude: number;
  /** Full cycle length in sim frames. */
  period: number;
  /** Phase offset 0..1 of a cycle. */
  phase?: number;
}

export interface PlatformDef {
  /** Top-left corner in stage space (y grows downward, stage origin = centre of the main platform top). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 'solid' blocks from every side; 'pass' only blocks from above (drop-through). */
  kind: 'solid' | 'pass';
  /** Solid only: corners can be grabbed. */
  ledges?: boolean;
  move?: PlatformMotion;
  /** Ground feel: 'ice' = slippery, 'sticky' = high friction, 'conveyor' = carries fighters (`conveyor` px/frame), 'bouncy' = launched fighters rebound harder. */
  surface?: 'normal' | 'ice' | 'sticky' | 'conveyor' | 'bouncy';
  conveyor?: number;
}

export interface BlastZones {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface StageBackground {
  topColor: number;
  bottomColor: number;
  /** Parallax layer ids understood by the stage renderer. */
  layers: string[];
  /** Look of the parallax backdrop and tiles (palette + tints); see `BACKDROPS` in the UI layer. */
  theme?: 'skyline' | 'void' | 'reactor' | 'storm' | 'dawn' | 'temple' | 'tide';
}

/** A stage hazard. Phase is a pure function of the sim tick, so it is deterministic and needs no state. */
export interface HazardDef {
  /** 'geyser' erupts upward from its base; 'bolt' is lightning that strikes straight down from its top. */
  kind: 'geyser' | 'bolt';
  /** Column centre x and the y of its base (it grows upward by `h`); for a bolt, the y of its top (it reaches down by `h`). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Frames per cycle; the last `warn` + `active` frames of each cycle are the telegraph and the eruption. */
  period: number;
  offset?: number;
  warn: number;
  active: number;
  damage: number;
  base: number;
  scaling: number;
  /** Launch angle in degrees (90 = straight up). */
  angle: number;
  /** Look of an erupting column (default plasma); visual only. */
  style?: 'plasma' | 'water';
  /** Frames of soak added to whoever the eruption hits. */
  soak?: number;
}

export interface StageData {
  id: string;
  name: string;
  platforms: PlatformDef[];
  blast: BlastZones;
  spawns: { x: number; y: number }[];
  background: StageBackground;
  hazards?: HazardDef[];
  /** Chiptune loop id (resolved by the audio layer). */
  music?: string;
  /** One or two sentences for the stage select card. */
  blurb?: string;
  /** Target Smash course: positions of the targets to break. */
  targets?: { x: number; y: number }[];
}

export interface CharacterStats {
  /** Heavier = launched less. Typical 70..130. */
  weight: number;
  runSpeed: number; // px / frame
  airSpeed: number; // px / frame, max horizontal air speed
  groundAccel: number;
  groundFriction: number;
  airAccel: number;
  airFriction: number;
  gravity: number; // px / frame^2
  fallSpeed: number; // terminal velocity
  fastFallSpeed: number;
  /** Apex height of a full hop, px. */
  jumpHeight: number;
  /** Apex height of a short hop, px. */
  shortHopHeight: number;
  /** Apex height of each double jump, px. */
  doubleJumpHeight: number;
  doubleJumps: number;
  jumpsquatFrames: number;
}

export interface BodyDims {
  /** Hurtbox width/height in px. Origin of the fighter is the bottom-centre of this box. */
  width: number;
  height: number;
  /** Half-width of the "feet" used for landing / standing support. */
  footHalfWidth: number;
}

export interface AnimDef {
  frames: number;
  fps: number;
  loop: boolean;
}

export interface SpriteDef {
  /** Square frame size in px (placeholder art is 64; real sheets may differ). */
  frameSize: number;
  /** Frame width when wider than tall (long-weapon fighters); defaults to `frameSize`. */
  frameWidth?: number;
  /** Portrait crop [x, y, size] in frame pixels (menus / HUD); default is derived from the frame size. */
  portrait?: [number, number, number];
  /** World units per sprite pixel (0.5 = a 64px frame covers 32 world units). Keeps hurtboxes independent of art density. */
  pixelScale: number;
  /** Row order == key order. Sheet layout: one animation per row, frames left to right. */
  animations: Record<string, AnimDef>;
  /** If set, a real sprite sheet is loaded from this URL instead of the generated placeholder. */
  sheetUrl?: string;
  /** Placeholder generator parameters (used when sheetUrl is undefined). */
  placeholder: PlaceholderLook;
}

export interface PlaceholderLook {
  skin: string;
  armor: string;
  armorDark: string;
  accent: string;
  outline: string;
  /** Relative proportions, roughly 0..1 of the 32px frame. */
  build: {
    shoulderW: number;
    torsoH: number;
    legH: number;
    headSize: number;
    armLen: number;
    helmet: 'visor' | 'hood' | 'pointed' | 'dome' | 'band' | 'winged' | 'monolith' | 'fin' | 'geode';
    /** Soft, rounded construction (pot-belly torso, ball joints, domed head) instead of plated blocks. */
    round?: boolean;
  };
  /** 'hi' draws the character with the full-resolution renderer (src/art/hero) instead of the 64px block template. */
  art?: 'hi';
  /** What the front hand holds. Default 'piston' (Brick's piston fist). */
  weapon?: 'piston' | 'blades' | 'staff' | 'wrench' | 'gauntlet' | 'spear' | 'anchor';
  /** Silhouette accessories: scarf, bracer, cloak, toolbox, grapple. */
  extras?: ('scarf' | 'bracer' | 'cloak' | 'toolbox' | 'grapple' | 'sash')[];
}

/** A resource that fills from fighting and drains when idle, declared as data instead of hook code (Brick's Heat, Agni's Flame). */
export interface ResourceRule {
  key: string;
  max: number;
  /** Gain per point of damage dealt (hits under `minDealt` give nothing) / taken. */
  gainDealt?: number;
  minDealt?: number;
  gainTaken?: number;
  /** After `decayAfter` quiet frames (no hit dealt or taken) lose `decayRate` per frame. */
  decayAfter?: number;
  decayRate?: number;
  /** Writes how many of the `at` thresholds the resource has reached into `res[key]`. */
  levels?: { key: string; at: number[] };
}

/** Story-mode text for a character (intro card, line spoken as an opponent, ending). */
export interface CharacterPersona {
  intro: string;
  taunt: string;
  epilogue: string;
}

export interface CharacterData {
  id: string;
  /** Visual effects (recipes, auras, trails), see `fxTypes.ts`. Presentation only. */
  fx?: CharacterFx;
  persona?: CharacterPersona;
  /**
   * Move slots that resolve to a variant by a resource: `neutralB: { key: 'element', ids: ['neutralB_fire', ...] }` starts `ids[res.element]`
   * (clamped). Any move id can be a key (specials, ultimate...). Replaces hand-written `chooseMove` hooks for the common case.
   */
  variants?: Record<string, { key: string; ids: string[] }>;
  /** Declarative resource gain / decay / levels; run by the engine before behaviour hooks. */
  resourceRules?: ResourceRule[];
  name: string;
  tagline: string;
  stats: CharacterStats;
  body: BodyDims;
  sprite: SpriteDef;
  /** Frame data, loaded from <id>.moves.json via parseMoves(). */
  moves: Record<string, MoveDef>;
  projectiles?: Record<string, ProjectileDef>;
  deployables?: Record<string, DeployableDef>;
  /** Initial per-fighter resources (Heat, Scrap, ...). Keys are the only ones allowed to be used. */
  resources?: Record<string, number>;
  /** Ultimate meter tuning. Defaults: cost 100, gainDealt 0.6, gainTaken 0.9 per damage point. */
  ultimate?: { cost: number; gainDealt: number; gainTaken: number };
  /** Ground dash (double-tap / flick) with an invulnerability window. */
  /** Can jump off walls (the sides of solid platforms) while airborne. */
  wallJump?: boolean;
  /** Wings: holding Jump while falling slows the fall (`fall` px/frame), speeds up air drift (`speed` x) for at most `max` frames per airtime. */
  glide?: { fall: number; speed: number; max: number };
  dash?: { speed: number; frames: number; invuln: [number, number]; cooldown: number };
  /** HUD resource bar (Heat, Scrap...): drawn as a glowing seam on the player plate; sprite glows once `hotAt` is reached. */
  hud?: { resource: string; max: number; color: number; hotAt: number; /** Per-element seam colours picked by `res[colorKey]`. */ colors?: number[]; colorKey?: string; /** Tick marks on the seam (level thresholds). */ marks?: number[] };
  /** A floating companion orb whose colour follows `res[resource]` (Nova's Arcana orb). */
  companion?: { resource: string; colors: number[] };
  /** Shows a number above the fighter (Gizmo's Scrap). */
  counter?: { resource: string };
  /** Visual transformation while `res[resource] > 0` (Mech mode): sprite scale + tint. */
  transform?: { resource: string; scale: number; tint: number };
  /** Character-specific logic hooks (kept tiny; most behaviour should be data). */
  behavior?: CharacterBehavior;
}
