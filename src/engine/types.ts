/** Shared data shapes for the simulation. Pure data, no Phaser imports. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MoveDef {
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
  move?: MoveDef;
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
}

export interface StageData {
  id: string;
  name: string;
  platforms: PlatformDef[];
  blast: BlastZones;
  spawns: { x: number; y: number }[];
  background: StageBackground;
  /** Chiptune loop id (resolved by the audio layer). */
  music?: string;
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
  /** Square frame size in px. */
  frameSize: number;
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
    helmet: 'visor' | 'hood' | 'pointed' | 'dome';
  };
}

export interface CharacterData {
  id: string;
  name: string;
  tagline: string;
  stats: CharacterStats;
  body: BodyDims;
  sprite: SpriteDef;
}
