/** Animation poses for the generated sprite sheets: a pose per (animation, frame), from templates or a move's key poses. No Phaser or DOM, so it also runs in the sheet workers. */
import type { PoseSpec } from '../engine/moves';
import { buildKeys, type Flow, type Key } from './poseTemplates';

export type V2 = [number, number];

export interface Pose {
  /** Torso drop (authoring units, fractional values are drawn at the hi-res 2x grid, so half units are real sub-pixel motion). */
  bob: number;
  crouch: number;
  lean: number;
  frontFoot: V2; // [dx, lift]
  backFoot: V2;
  frontHand: V2; // offset from resting hang
  backHand: V2;
  lying?: boolean;
  /** Weapon axis in degrees (0 = forward, -90 = up, 90 = down) for fighters that carry a long weapon (spears). */
  aim?: number;
  /** Wing posture 0 (folded) .. 1 (fully spread) for winged fighters. */
  wing?: number;
  /** Which way loose cloth / hair hangs in the drawing's frame (flames rise against it). Default [0, 1]; [-1, 0] when lying on the back. */
  grav?: V2;
  /** Head offset from the neck (units): a snap back on a hit, a nod, a dizzy wobble. */
  head?: V2;
  /** Torso twist (units): + pulls the near shoulder back and the far one forward (hit recoil, a turned air dodge). */
  twist?: number;
  /** Cloth / hair sway phase for this frame (attack rows set it so loose parts move on smoothly instead of jittering per frame). */
  ph?: number;
  /**
   * Flowing attack rows: body squash / stretch and tilt for the drawers that bend a chunky body (hero/index.ts FLEX):
   * [sx, sy, tilt] (scale about the feet, then a forward shear above the hips per pixel of height).
   */
  flex?: [number, number, number];
  /** Flowing attack rows: how hard this frame is striking, 0 .. 1 (visor flares, jets, glowing fittings). */
  hit?: number;
  /** Set by poseFor: the row and frame this pose was made for (lets the hero renderer apply a fighter's own motion style). */
  anim?: string;
  f?: number;
  n?: number;
}

const REST: Pose = { bob: 0, crouch: 0, lean: 0, frontFoot: [4, 0], backFoot: [-4, 0], frontHand: [2, 0], backHand: [-2, 0] };

/** Key poses of the move-specific animations (`mv_<id>`) of the character whose sheet is being drawn. */
let moveKeys: Record<string, [Key, Key, Key]> = {};
/** Flowing basic moves (see movePoses.ts): their weight, and whether they are aerials. */
let moveFlows: Record<string, Flow> = {};

/** Load the key poses of a character's move animations before drawing its sheet. */
export function setMovePoses(poses: Iterable<{ anim: string; pose: PoseSpec }>): void {
  moveKeys = {};
  moveFlows = {};
  for (const m of poses) {
    moveKeys[m.anim] = buildKeys(m.pose);
    const fl = (m.pose as PoseSpec & { flow?: Flow }).flow;
    if (fl) moveFlows[m.anim] = fl;
  }
}

// ---- motion styles ------------------------------------------------------------------------------------------------

type JumpStyle = 'flip' | 'jet' | 'float' | 'stroke' | 'kick';
type LoseStyle = 'slump' | 'kneel' | 'turned';
/** Gait: stride and foot lift (units), arm swing (x), forward lean and bounce (x). */
interface Gait {
  stride: number;
  lift: number;
  arms: number;
  lean: number;
  bounce: number;
}
interface MotionStyle {
  /** Reaction poses (hurt, shield, ledge, held, dizzy) are scaled by this so they still read on a bulky body. */
  amp: number;
  idle: (p: Pose, ph: number, breath: number) => void;
  gait: Gait;
  jump2: JumpStyle;
  /** Victory action key poses; the last one is held (and breathes) in `victoryHold`. */
  victory: Key[];
  lose: LoseStyle;
}

const TAU = Math.PI * 2;
const sin = Math.sin;
const cos = Math.cos;
const r2 = (v: number): number => Math.round(v * 100) / 100;

const GAIT: Gait = { stride: 11, lift: 7, arms: 1, lean: 4, bounce: 1 };
const idleBase = (p: Pose, ph: number, b: number): void => {
  p.bob = b * 0.8 - 0.15;
  p.crouch = b * 0.35;
  p.lean = sin(ph) * 0.25;
  p.frontHand = [2 + sin(ph) * 0.4, b * 0.6];
  p.backHand = [-2 - sin(ph + 0.9) * 0.5, b * 0.6 + sin(ph + 0.9) * 0.3];
};
const STYLE_DEFAULT: MotionStyle = {
  amp: 1,
  idle: idleBase,
  gait: GAIT,
  jump2: 'flip',
  victory: [
    [0, 3, [5, 0], [-5, 0], [6, 0], [-6, 0]],
    [-1, 0, [8, -26], [-8, -26], [5, 0], [-5, 0]],
    [-1, 0, [7, -24], [-7, -24], [5, 0], [-5, 0]],
  ],
  lose: 'slump',
};

/** Per-fighter motion, keyed by the hero drawer's helmet style (one per fighter). */
const STYLES: Record<string, MotionStyle> = {
  // Brick: heavy, slow breathing that heaves the whole suit; a stomping, arm-pumping run; jet-boot double jump
  visor: {
    amp: 1.35,
    idle: (p, _ph, b) => {
      p.bob = b * 1.5 - 0.45;
      p.crouch = b * 0.6;
      p.lean = -0.5 + b * 0.6;
      p.frontHand = [3.2 - b * 1.3, b * 0.5];
      p.backHand = [-3.2 + b * 1.3, b * 0.5];
    },
    gait: { stride: 11, lift: 8, arms: 1.35, lean: 6, bounce: 1.7 },
    jump2: 'jet',
    victory: [
      [-2, 6, [8, 2], [-6, 2], [8, 0], [-8, 0]],
      [3, 8, [6, -6], [3, -6], [9, 0], [-9, 0]],
      [-2, 0, [7, -30], [-6, -30], [7, 0], [-7, 0]],
      [-1, 1, [9, -24], [-8, -24], [8, 0], [-8, 0]],
    ],
    lose: 'kneel',
  },
  // Vex: bouncing on the balls of her feet with her guard up; a long low run; a front flip
  hood: {
    amp: 1,
    idle: (p, ph) => {
      const u = Math.abs(sin(ph)); // two bounces a cycle
      p.crouch = (1 - u) * 1.4 - 0.25;
      p.bob = (1 - u) * 0.4;
      p.lean = 1.5;
      p.frontFoot = [6, u * 0.7];
      p.backFoot = [-6, u * 0.7];
      p.frontHand = [5, -7 + (1 - u) * 0.8];
      p.backHand = [1, -5 + (1 - u) * 0.8];
    },
    gait: { stride: 12, lift: 8, arms: 0.85, lean: 6, bounce: 0.8 },
    jump2: 'flip',
    victory: [
      [0, 3, [6, -6], [-2, -4], [6, 0], [-6, 0]],
      [4, 2, [14, -8], [-12, -8], [4, 3], [-8, 0]],
      [-2, 4, [-4, -14], [6, -14], [9, 0], [-9, 0]],
      [-1, 2, [5, -31], [-10, -2], [8, 0], [-8, 0]],
      [-1, 2, [4, -30], [-10, -2], [8, 0], [-8, 0]],
    ],
    lose: 'turned',
  },
  // Nova: the staff sways with her breath; a gliding run; a floating double jump with the robe billowing
  pointed: {
    amp: 1,
    idle: (p, ph, b) => {
      p.bob = b * 0.6 - 0.1;
      p.crouch = b * 0.25;
      p.lean = sin(ph) * 0.6;
      p.frontHand = [3 + sin(ph) * 1.6, -1 + cos(ph) * 0.6];
      p.backHand = [-2 - sin(ph) * 0.6, b * 0.5];
    },
    gait: { stride: 9, lift: 5, arms: 0.6, lean: 3, bounce: 0.7 },
    jump2: 'float',
    victory: [
      [0, 2, [6, -4], [-2, 0], [5, 0], [-5, 0]],
      [-2, 0, [2, -34], [-4, -6], [4, 0], [-4, 0]],
      [0, 0, [3, -36], [-6, -10], [4, 0], [-4, 0]],
      [0, 0, [3, -34], [-4, -6], [4, 0], [-4, 0]],
    ],
    lose: 'slump',
  },
  // Gizmo: a fidgety, double-time breath with the free hand tapping; short quick strides; a jet hop
  dome: {
    amp: 1,
    idle: (p, ph, b) => {
      const tap = Math.max(0, sin(ph * 2));
      p.bob = b * 0.7 + 0.25 * sin(ph * 2) - 0.2;
      p.crouch = b * 0.3;
      p.lean = sin(ph) * 0.4;
      p.frontHand = [3, b * 0.5 - 1];
      p.backHand = [-2 + tap * 1.5, -tap];
    },
    gait: { stride: 8, lift: 6, arms: 1, lean: 4, bounce: 1 },
    jump2: 'jet',
    victory: [
      [0, 6, [4, 2], [-4, 2], [6, 0], [-6, 0]],
      [0, 0, [4, -30], [-6, -8], [4, 5], [-4, 5]],
      [0, 3, [6, -20], [-4, -2], [6, 0], [-6, 0]],
      [0, 1, [4, -22], [-2, 0], [5, 0], [-5, 0]],
    ],
    lose: 'slump',
  },
  // Agni: a breathing fighting stance, fists up; a driving run; a front flip
  band: {
    amp: 1,
    idle: (p, ph, b) => {
      p.bob = b * 0.8 - 0.2;
      p.crouch = 1 + b * 0.5;
      p.lean = 0.6 + sin(ph) * 0.3;
      p.frontFoot = [6, 0];
      p.backFoot = [-6, 0];
      p.frontHand = [4 + sin(ph) * 0.4, -4 + b * 0.7];
      p.backHand = [1 - sin(ph) * 0.4, -3 + b * 0.7];
    },
    gait: { stride: 11, lift: 8, arms: 1.1, lean: 5, bounce: 1 },
    jump2: 'flip',
    victory: [
      [-2, 3, [-6, -2], [-4, -2], [6, 0], [-6, 0]],
      [-5, 1, [16, -8], [-4, -4], [8, 0], [-6, 0]],
      [-1, 4, [-4, -6], [14, -8], [8, 0], [-7, 0]],
      [0, 0, [4, -34], [-6, -4], [5, 0], [-5, 0]],
    ],
    lose: 'slump',
  },
  // Halcyon: calm, spear upright, wings breathing; plants the spear and spreads her wings to win
  winged: {
    amp: 1,
    idle: (p, ph, b) => {
      p.bob = b * 0.5 - 0.1;
      p.crouch = b * 0.2;
      p.frontHand = [2 + sin(ph) * 0.3, b * 0.4];
      p.backHand = [-2 - sin(ph) * 0.3, b * 0.4];
      p.wing = 0.1 + b * 0.08;
    },
    gait: { stride: 12, lift: 7, arms: 0.7, lean: 5, bounce: 0.8 },
    jump2: 'float',
    victory: [
      [0, 2, [4, -6], [0, -6], [5, 0], [-5, 0], -80, 0.2],
      [1, 4, [6, 2], [2, 2], [6, 0], [-6, 0], 90, 0.35],
      [-1, 0, [6, -2], [2, -2], [5, 0], [-5, 0], 90, 1],
      [-1, 0, [6, -2], [2, -2], [5, 0], [-5, 0], 90, 0.95],
    ],
    lose: 'slump',
  },
  // Riptide: the anchor's weight rocks him; a heavy rolling run; a swimmer's stroke for the double jump
  fin: {
    amp: 1.1,
    idle: (p, ph, b) => {
      p.bob = b * 0.9 - 0.2;
      p.crouch = b * 0.35;
      p.lean = sin(ph) * 0.7;
      p.frontHand = [2 + sin(ph) * 0.8, b * 0.8];
      p.backHand = [-2 + sin(ph) * 0.8, b * 0.6];
    },
    gait: { stride: 12, lift: 8, arms: 1.1, lean: 6, bounce: 1.5 },
    jump2: 'stroke',
    victory: [
      [-3, 3, [-8, -10], [-10, -8], [7, 0], [-7, 0]],
      [3, 2, [14, -14], [10, -12], [8, 0], [-8, 0]],
      [0, 1, [4, -24], [2, -22], [6, 0], [-6, 0]],
      [-1, 0, [2, -22], [-1, -20], [6, 0], [-6, 0]],
    ],
    lose: 'slump',
  },
  // Obelisk: hovers and drifts, hands floating out of step like loose shards; levitates up for the double jump
  geode: {
    amp: 1.1,
    idle: (p, ph, b) => {
      p.bob = sin(ph) * 0.9;
      p.crouch = b * 0.2;
      p.frontHand = [3, -1 + sin(ph + 1.2) * 1.4];
      p.backHand = [-3, -1 + sin(ph + 2.4) * 1.4];
    },
    gait: { stride: 12, lift: 8, arms: 1.2, lean: 6, bounce: 1.4 },
    jump2: 'float',
    victory: [
      [0, 3, [6, 0], [-6, 0], [6, 0], [-6, 0]],
      [0, 0, [12, -20], [-12, -20], [5, 0], [-5, 0]],
      [0, -1, [10, -28], [-10, -28], [5, 0], [-5, 0]],
      [0, 0, [9, -26], [-9, -26], [5, 0], [-5, 0]],
    ],
    lose: 'slump',
  },
  // Rime: almost perfectly still, poised; a low ninja run with the arms held back; a flip; wins with a slash, a sheathe and a bow
  kasa: {
    amp: 1,
    idle: (p, ph, b) => {
      p.bob = b * 0.4 - 0.1;
      p.crouch = 0.4 + b * 0.2;
      p.frontHand = [2 + sin(ph) * 0.2, b * 0.3];
      p.backHand = [-2 - sin(ph) * 0.2, b * 0.3];
    },
    gait: { stride: 13, lift: 8, arms: 0.6, lean: 7, bounce: 0.8 },
    jump2: 'flip',
    victory: [
      [2, 2, [12, -6], [-10, -4], [8, 0], [-8, 0]],
      [-1, 4, [-2, -2], [-4, -2], [7, 0], [-7, 0]],
      [3, 5, [2, -2], [-2, -2], [5, 0], [-5, 0]],
      [3, 4, [2, -1], [-2, -1], [5, 0], [-5, 0]],
    ],
    lose: 'turned',
  },
  // Havoc: a soldier's weight shift from foot to foot; a scissor-kick double jump; a fist pump and a salute
  goggles: {
    amp: 1.2,
    idle: (p, ph, b) => {
      p.bob = b * 0.7 - 0.15;
      p.crouch = b * 0.3;
      p.lean = sin(ph) * 0.6;
      p.frontFoot = [4 + sin(ph) * 0.5, 0];
      p.frontHand = [2, b * 0.6];
      p.backHand = [-2, b * 0.6];
    },
    gait: { stride: 12, lift: 8, arms: 1.2, lean: 6, bounce: 1.3 },
    jump2: 'kick',
    victory: [
      [-1, 3, [4, -2], [-2, 0], [6, 0], [-6, 0]],
      [-2, 0, [6, -32], [-2, 0], [5, 0], [-5, 0]],
      [-2, 0, [8, -28], [-2, 0], [5, 0], [-5, 0]],
      [0, 0, [2, -20], [-2, 0], [4, 0], [-4, 0]],
    ],
    lose: 'kneel',
  },
};

/** Fighters whose `jump2` is a somersault (the view spins the sprite through it). */
export function flipsOnDoubleJump(helmet: string): boolean {
  return (STYLES[helmet] ?? STYLE_DEFAULT).jump2 === 'flip';
}

/** Rows a fighter's motion style changes (idle, gaits, double jump, results); everything else is shared. */
const STYLED = new Set(['idle', 'run', 'walk', 'dash', 'jump2', 'victory', 'victoryHold', 'lose', 'hurt', 'hurtL', 'hurtU', 'hurtD', 'shield', 'ledge', 'held', 'dizzy', 'airdodge']);
/** Reaction rows scaled by the style's `amp` (bigger bodies need bigger offsets to read the same). */
const AMPED = new Set(['hurt', 'hurtL', 'hurtU', 'hurtD', 'shield', 'ledge', 'held', 'dizzy', 'airdodge']);

/** The pose of `pose`'s row and frame in the motion style of the fighter drawn with `helmet` (unchanged for rows without one). */
export function stylePose(pose: Pose, helmet: string): Pose {
  if (!pose.anim || pose.f === undefined || !STYLED.has(pose.anim) || !STYLES[helmet]) return pose;
  return poseFor(pose.anim, pose.f, pose.n ?? 1, helmet);
}

// ---- helpers ------------------------------------------------------------------------------------------------------

const smooth = (t: number): number => t * t * (3 - 2 * t);
const mixN = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixV = (a: V2, b: V2, t: number): V2 => [mixN(a[0], b[0], t), mixN(a[1], b[1], t)];
const mixO = (a: number | undefined, b: number | undefined, t: number): number | undefined => (a === undefined || b === undefined ? (a ?? b) : mixN(a, b, t));
/** The optional extras (twist, bob, head x, head y) blend toward 0 when only one side has them. */
const mixX = (a: number | undefined, b: number | undefined, t: number): number | undefined => (a === undefined && b === undefined ? undefined : mixN(a ?? 0, b ?? 0, t));
function mixKey(a: Key, b: Key, t: number): Key {
  return [mixN(a[0], b[0], t), mixN(a[1], b[1], t), mixV(a[2], b[2], t), mixV(a[3], b[3], t), mixV(a[4], b[4], t), mixV(a[5], b[5], t), mixO(a[6], b[6], t), mixO(a[7], b[7], t), mixX(a[8], b[8], t), mixX(a[9], b[9], t), mixX(a[10], b[10], t), mixX(a[11], b[11], t)];
}
/** Sample a key-pose track at u (0..1), eased between keys. */
function track(keys: Key[], u: number): Key {
  if (keys.length === 1) return keys[0];
  const x = Math.max(0, Math.min(1, u)) * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(x));
  return mixKey(keys[i], keys[i + 1], smooth(x - i));
}
function applyKey(p: Pose, e: Key): void {
  p.lean = e[0];
  p.crouch = e[1];
  p.frontHand = e[2];
  p.backHand = e[3];
  p.frontFoot = e[4];
  p.backFoot = e[5];
  if (e[6] !== undefined) p.aim = e[6];
  if (e[7] !== undefined) p.wing = e[7];
  applyExtras(p, e);
}
/** A key's optional twist, bob and head offset. */
function applyExtras(p: Pose, e: Key): void {
  if (e[8] !== undefined) p.twist = e[8];
  if (e[9] !== undefined) p.bob = e[9];
  if (e[10] !== undefined || e[11] !== undefined) p.head = [e[10] ?? 0, e[11] ?? 0];
}
/** Position (0..1) of frame f in a one-shot row of n frames. */
const at = (f: number, n: number): number => (n <= 1 ? 1 : f / (n - 1));

/** A stride: feet on a sin/cos cycle, the body lowest just after each contact and highest after the passing position. */
function stride(p: Pose, ph: number, g: Gait, scale = 1): void {
  const s = sin(ph);
  const c = cos(ph);
  const st = g.stride * scale;
  p.frontFoot = [s * st, Math.max(0, -c) * g.lift];
  p.backFoot = [-s * st, Math.max(0, c) * g.lift];
  // 0 at the top of the bounce, 1 at the bottom (just after a foot lands)
  const down = 0.5 + 0.5 * cos(2 * (ph - Math.PI / 2 - 0.45));
  p.bob = (down * 1.6 - 0.5) * g.bounce;
  p.crouch = down * 0.8 * g.bounce;
  p.lean = g.lean + down * 0.8;
  // arms swing against the legs; the forward hand rises with a bent elbow
  const a = g.arms;
  p.frontHand = [-s * 8 * a, -2 - Math.max(0, -s) * 4 * a - Math.abs(s) * 0.5];
  p.backHand = [s * 8 * a, -2 - Math.max(0, s) * 4 * a - Math.abs(s) * 0.5];
}

const JUMP2: Record<JumpStyle, Key[]> = {
  // somersault: crouch in, a tight tuck (hands on shins) through the turn, open out
  flip: [
    [-1, 4, [6, -4], [-4, -4], [6, 4], [-4, 2]],
    [2, 6, [7, 4], [3, 4], [7, 12], [1, 13]],
    [2, 6, [6, 5], [2, 5], [6, 13], [0, 13]],
    [0, 0, [8, -12], [-8, -12], [6, 6], [-5, 8]],
  ],
  // jet boots: knees snapped up into a tuck as the boots fire, then the legs locked together under the thrust, arms swept back
  jet: [
    [0, 4, [4, -6], [-4, -6], [6, 2], [-6, 2]],
    [1, 0, [6, 2], [2, 2], [6, 14], [0, 15]],
    [0, 0, [-2, 6], [-6, 6], [2, 6], [-2, 7]],
    [0, 0, [0, 4], [-4, 4], [3, 4], [-3, 5]],
  ],
  // levitation: arms rise and spread, legs trailing
  float: [
    [0, 2, [6, -6], [-6, -6], [5, 3], [-5, 3]],
    [0, 0, [12, -16], [-12, -16], [5, 12], [-1, 13]],
    [0, 0, [13, -18], [-13, -18], [4, 9], [-3, 11]],
    [0, 0, [10, -12], [-10, -12], [5, 5], [-5, 7]],
  ],
  // breaststroke: arms reach up and pull down, the legs kick
  stroke: [
    [0, 2, [6, -24], [-6, -24], [5, 4], [-5, 4]],
    [0, 0, [14, -10], [-14, -10], [6, 8], [-6, 2]],
    [0, 0, [8, 4], [-8, 4], [5, 2], [-5, 9]],
    [0, 0, [6, -4], [-6, -4], [5, 5], [-5, 6]],
  ],
  // scissor kick: knee drive on one leg, then the other
  kick: [
    [-1, 3, [6, -8], [-6, -4], [6, 3], [-6, 2]],
    [1, 0, [-4, -6], [8, -10], [10, 12], [-8, 2]],
    [1, 0, [6, -8], [-4, -6], [-2, 4], [8, 12]],
    [0, 0, [8, -10], [-6, -8], [6, 6], [-5, 8]],
  ],
};

/**
 * Knocked down, flat on the back (drawn upright, then laid down: up becomes past the head, back becomes the floor, front
 * becomes up): both arms flung out past the head along the floor, one knee a little raised, the other leg flat, so as little
 * as possible stands up off the floor.
 */
const SPRAWL: Key = [0, 0, [0, -28], [-4, -25], [5, 4], [-2, 0]];
/** About to get up: both knees up, hands planted. */
const PROPPED: Key = [0, 0, [-6, -8], [-10, 2], [4, 12], [-2, 8]];

// ---- the poses ----------------------------------------------------------------------------------------------------

export function poseFor(anim: string, f: number, frames: number, style?: string): Pose {
  const p: Pose = { ...REST, anim, f, n: frames };
  const S = (style && STYLES[style]) || STYLE_DEFAULT;
  const n = Math.max(1, frames);
  const ph = (f / n) * TAU; // loop phase
  switch (anim) {
    case 'idle': {
      // breath: the chest drops and rises in sub-pixel steps, the hands drift with it (each fighter has its own idle)
      const b = (1 - cos(ph)) / 2;
      S.idle(p, ph, b);
      break;
    }
    case 'run':
      stride(p, ph, S.gait);
      break;
    case 'walk': {
      // gentle stride: shorter steps, upright, lowest on each contact, arms swinging lightly
      const s = sin(ph);
      const c = cos(ph);
      const g = S.gait;
      p.frontFoot = [s * g.stride * 0.55, Math.max(0, -c) * 3.2];
      p.backFoot = [-s * g.stride * 0.55, Math.max(0, c) * 3.2];
      p.bob = s * s * 0.8 * g.bounce - 0.2;
      p.crouch = s * s * 0.3;
      p.lean = 1 + (g.lean - 4) * 0.25;
      p.frontHand = [-s * 3.5 * g.arms, -0.5 - Math.max(0, -s) * 1.2];
      p.backHand = [s * 3.5 * g.arms, -0.5 - Math.max(0, s) * 1.2];
      break;
    }
    case 'dash': {
      // a sprint: long low strides, leaning hard in, arms pumping back
      stride(p, ph, { ...S.gait, stride: S.gait.stride + 2, lean: S.gait.lean + 3.5 });
      p.crouch += 2.5;
      p.frontHand = [p.frontHand[0] * 0.6 - 3, p.frontHand[1] + 1];
      p.backHand = [p.backHand[0] * 0.6 - 5, p.backHand[1] + 1.5];
      break;
    }
    case 'crouch':
      p.crouch = 7;
      p.frontFoot = [7, 0];
      p.backFoot = [-7, 0];
      p.frontHand = [5, -3];
      p.backHand = [-3, -3];
      break;
    case 'land':
      // touch-down: a deep squash with the arms thrown out for balance, then settle back up
      applyKey(
        p,
        track(
          [
            [2, 8, [7, 3], [-6, 3], [8, 0], [-8, 0]],
            [1, 4, [5, 1], [-4, 1], [6, 0], [-6, 0]],
            [0, 1, [3, 0], [-2, 0], [5, 0], [-5, 0]],
          ],
          at(f, n),
        ),
      );
      p.bob = (1 - at(f, n)) * 1.2;
      break;
    case 'jump': {
      // take-off stretch -> rising -> knees tucked at the top
      const J: Key[] = [
        [1, 0, [5, -14], [-6, -12], [4, 3], [-5, 1]],
        [0, 0, [6, -10], [-5, -8], [6, 7], [-3, 9]],
        [2, 3, [7, -6], [-3, -5], [7, 10], [-1, 11]],
      ];
      applyKey(p, J[Math.min(f, J.length - 1)]);
      p.grav = [-0.25, 1];
      break;
    }
    case 'jump2':
      applyKey(p, track(JUMP2[S.jump2], at(f, n)));
      if (S.jump2 === 'float') p.grav = [-0.3, 1];
      break;
    case 'fall': {
      // arms up for balance, legs reaching for the ground, everything fluttering in the rushing air
      const s = sin(ph);
      const c = cos(ph);
      p.lean = s * 0.4;
      p.frontFoot = [9 + s * 0.8, 3.5 + c * 0.8];
      p.backFoot = [-8.5 - s * 0.6, 0.6 - c * 0.6];
      p.frontHand = [8 + c, -14.5 + s * 1.5];
      p.backHand = [-8 - c, -15 - s * 1.5];
      p.bob = c * 0.3;
      break;
    }
    case 'ledge':
      // hanging from the edge: both hands gripping overhead, arms at full stretch, the body hanging below with the
      // legs dangling (knees loose, toes down), the head tipped up to the ledge
      // (the two hands meet over the front of the head: the front one reaches back, the back one across)
      p.lean = 2;
      p.crouch = -1;
      p.frontHand = [-1, -33];
      p.backHand = [12, -33];
      p.frontFoot = [-1, 3];
      p.backFoot = [-4, 1];
      p.head = [0.5, -0.5];
      break;
    case 'ledgeClimb':
      // hang -> haul the chest up over the edge -> a knee onto the floor -> stand
      applyKey(
        p,
        track(
          [
            [2, -1, [-1, -33], [12, -33], [-1, 3], [-4, 1]],
            [-2, 5, [7, -14], [2, -14], [8, 10], [-3, 2]],
            [3, 8, [9, 2], [4, 2], [9, 4], [-7, 6]],
            [1, 2, [4, -1], [-2, -1], [5, 0], [-5, 0]],
          ],
          at(f, n),
        ),
      );
      break;
    case 'getup':
      // from the floor: knees up and hands planted (still lying), a kneel pushing off the floor, rising, standing
      if (f === 0) {
        applyKey(p, PROPPED);
        p.lying = true;
        p.grav = [-1, 0];
        break;
      }
      applyKey(
        p,
        track(
          [
            [4, 10, [7, 0], [-6, 9], [9, 0], [-9, 0]],
            [2, 5, [5, -2], [-3, -1], [7, 0], [-6, 0]],
            [0, 1, [3, 0], [-2, 0], [5, 0], [-5, 0]],
          ],
          at(f - 1, n - 1),
        ),
      );
      break;
    case 'tech':
      // a tech in place: slapped into a tuck, then popping up with the arms out
      applyKey(
        p,
        track(
          [
            [2, 9, [5, 6], [-4, 6], [7, 4], [-7, 4]],
            [-2, 1, [11, -12], [-10, -10], [6, 0], [-6, 0]],
          ],
          at(f, n),
        ),
      );
      break;
    case 'hurt':
      // the hit: head snapped back, chest twisted away; then settling toward the flinch as hitstun runs out
      if (f === 0) {
        applyKey(p, [-10, 2, [11, -20], [-14, -6], [11, 8], [-8, 0]]);
        p.head = [-3.5, -0.5];
        p.twist = 3.5;
      } else {
        applyKey(p, [-7, 4, [9, -12], [-11, -2], [9, 4], [-7, 0]]);
        p.head = [-2, 1];
        p.twist = 2;
      }
      break;
    case 'hurtL': // light flinch: a small recoil, still on both feet
      applyKey(p, [-6, 3, [9, -12], [-10, -4], [9, 2], [-7, 0]]);
      p.head = [-2, 0.5];
      p.twist = 2;
      break;
    case 'hurtU': // launched upward: back arched, arms flung up, legs trailing
      applyKey(p, [-7, 0, [8, -18], [-8, -18], [6, 6], [-6, 8]]);
      p.head = [-1, -1.5];
      break;
    case 'hurtD': // spiked / driven downward: curled forward, arms down
      applyKey(p, [6, 3, [4, 7], [-2, 7], [4, 5], [-4, 7]]);
      p.head = [1.5, 1.5];
      break;
    case 'dizzy': {
      // stunned: the body wobbles on loose knees, the head lolls round in a circle, the arms dangle
      // the weight lurches from one foot to the other (the unweighted foot lifts and drifts), knees buckling
      const s = sin(ph);
      p.lean = s * 6.5;
      p.head = [cos(ph) * 2.6, 1.2 + s * 1.1];
      p.crouch = 3.5 + (1 - cos(ph * 2)) * 0.8;
      p.bob = 1;
      p.twist = s * 1.5;
      p.frontHand = [5 + s * 4, 8 + cos(ph) * 1.5];
      p.backHand = [-3 + s * 4, 9 - cos(ph) * 1.5];
      p.frontFoot = [5 + s * 3, Math.max(0, -s) * 3];
      p.backFoot = [-5 + s * 3, Math.max(0, s) * 3];
      break;
    }
    case 'airdodge':
      // tucked and turned away
      applyKey(p, [-3, 5, [4, -12], [7, -10], [6, 9], [-1, 11]]);
      p.twist = 3;
      p.head = [-1, 0.5];
      break;
    case 'skid': // braking: weight thrown back, front foot dug in
      applyKey(p, [-5, 3, [8, -6], [-6, -4], [11, 0], [-5, 0]]);
      break;
    case 'roll': // tucked ball (the view spins the sprite)
      applyKey(p, [4, 10, [4, 0], [-2, 0], [6, 6], [-6, 6]]);
      break;
    case 'held': // dangling in a grab
      applyKey(p, [-3, 0, [8, -22], [-8, -22], [4, 6], [-4, 8]]);
      p.head = [-1, 0];
      break;
    case 'glide': // wings fully spread, body stretched out level, spear trailing
      applyKey(p, [8, 0, [10, -6], [-4, -4], [5, 6], [-8, 8]]);
      p.aim = 20;
      p.wing = 1 + (f % 2 === 0 ? 0 : -0.12);
      p.grav = [-0.5, 1];
      break;
    case 'victory':
      applyKey(p, track(S.victory, at(f, n)));
      break;
    case 'victoryHold': {
      // the end pose of the victory, held and breathing
      const b = (1 - cos(ph)) / 2;
      applyKey(p, S.victory[S.victory.length - 1]);
      p.bob = b * 0.7 - 0.2;
      p.frontHand = [p.frontHand[0], p.frontHand[1] + b * 0.6];
      p.backHand = [p.backHand[0], p.backHand[1] + b * 0.6];
      if (p.wing !== undefined) p.wing -= b * 0.06;
      break;
    }
    case 'lose': {
      // beaten: slumped and sighing (heavies drop to a knee; the proud ones turn away, head down)
      const b = (1 - cos(ph)) / 2;
      if (S.lose === 'kneel') {
        // down on one knee, a fist on the floor, head hung
        applyKey(p, [6, 11, [9, 10], [-1, 9], [9, 0], [-11, 0]]);
        p.head = [1.5, 3.5];
      } else if (S.lose === 'turned') {
        // turned half away, shoulders dropped, head down, arms hanging
        applyKey(p, [3, 3, [0, 6], [-4, 6], [4, 0], [-4, 0]]);
        p.head = [0.5, 3.5];
        p.twist = 4;
      } else {
        // slumped: bent forward at the waist, knees sagging, arms hanging limp, head down
        applyKey(p, [7, 5, [5, 9], [1, 9], [5, 0], [-5, 0]]);
        p.head = [1.5, 4];
      }
      p.bob = 0.3 + b * 0.8;
      p.frontHand = [p.frontHand[0], p.frontHand[1] + b * 0.6];
      p.backHand = [p.backHand[0], p.backHand[1] + b * 0.6];
      break;
    }
    case 'mvSettle':
      // the shared last beat of every flowing attack: weight settling back into the stance (0, grounded) or opening out of the
      // strike in the air (1), loose cloth and hair still swinging a little past plumb before the idle takes over
      applyKey(p, f === 0 ? SETTLE_GROUND : SETTLE_AIR);
      p.grav = [0.14, 1];
      p.ph = 10;
      break;
    case 'down':
    case 'ko':
      applyKey(p, SPRAWL);
      p.lying = true;
      p.grav = [-1, 0];
      p.head = [-1, 0];
      break;
    default:
      attackPose(anim, f, p, frames);
      break;
  }
  if (AMPED.has(anim) && S.amp !== 1) amplify(p, S.amp);
  if (p.wing === undefined) {
    // winged fighters: folded on the ground, flaring while airborne or hurt
    const w: Record<string, number> = { idle: 0.1, run: 0.2, walk: 0.15, dash: 0.3, skid: 0.35, crouch: 0.05, land: [0.6, 0.35, 0.15][Math.min(2, f)], jump: [0.9, 0.55, 0.2][f % 3], jump2: [0.3, 1, 0.75, 0.45][f % 4], fall: 0.65 + sin(ph) * 0.08, ledge: 0.45, ledgeClimb: 0.4, getup: [0.06, 0.3, 0.2, 0.12][Math.min(3, f)], tech: 0.4, hurt: 0.85, hurtL: 0.5, hurtU: 0.95, hurtD: 0.7, dizzy: 0.35, roll: 0.05, held: 0.8, shield: 0.4, dodge: 0.2, airdodge: 0.15, victory: 0.4, victoryHold: 0.4, lose: 0.05, down: 0.06, ko: 0.06 };
    p.wing = w[anim] ?? 0.3;
  }
  // keep the numbers tidy (they are drawn on a 2x grid, so anything finer than 1/100 is noise)
  p.bob = r2(p.bob);
  p.crouch = r2(p.crouch);
  p.lean = r2(p.lean);
  for (const v of [p.frontFoot, p.backFoot, p.frontHand, p.backHand]) {
    v[0] = r2(v[0]);
    v[1] = r2(v[1]);
  }
  return p;
}

/** Scale a reaction pose's offsets from the rest pose (lean, limbs, head snap, twist) for a bigger body. */
function amplify(p: Pose, k: number): void {
  const sc = (v: V2, rest: V2): V2 => [rest[0] + (v[0] - rest[0]) * k, rest[1] + (v[1] - rest[1]) * k];
  p.lean *= k;
  p.frontHand = sc(p.frontHand, REST.frontHand);
  p.backHand = sc(p.backHand, REST.backHand);
  p.frontFoot = sc(p.frontFoot, REST.frontFoot);
  p.backFoot = sc(p.backFoot, REST.backFoot);
  if (p.head) p.head = [p.head[0] * k, p.head[1] * k];
  if (p.twist) p.twist *= k;
}

/** Attack/defence key poses. Frame 0 = wind-up, 1 = active, 2 = recovery (see Fighter.attackPhase). */
function attackPose(anim: string, f: number, p: Pose, frames = 3): void {
  const set = (e: Key): void => {
    if (e[6] !== undefined) p.aim = e[6];
    if (e[7] !== undefined) p.wing = e[7];
    p.lean = e[0];
    p.crouch = e[1];
    p.frontHand = [e[2][0], e[2][1]];
    p.backHand = [e[3][0], e[3][1]];
    p.frontFoot = [e[4][0], e[4][1]];
    p.backFoot = [e[5][0], e[5][1]];
    applyExtras(p, e);
  };
  const T: Record<string, Key[]> = {
    jab: [
      [-2, 0, [-6, -2], [-2, 0], [4, 0], [-4, 0]],
      [-6, 1, [14, -6], [-2, 0], [6, 0], [-5, 0]],
      [-4, 0, [6, -3], [-2, 0], [4, 0], [-4, 0]],
    ],
    smashF: [
      [-8, 3, [-12, -8], [-4, 0], [8, 0], [-8, 0]],
      [-4, 2, [14, -6], [-4, 0], [10, 0], [-9, 0]],
      [-6, 1, [8, -2], [-2, 0], [6, 0], [-6, 0]],
    ],
    smashU: [
      [-2, 4, [-2, -2], [-2, 0], [6, 0], [-6, 0]],
      [-2, 0, [0, -38], [-2, -6], [4, 0], [-4, 0]],
      [-2, 0, [2, -16], [-2, 0], [4, 0], [-4, 0]],
    ],
    smashD: [
      [-2, 9, [2, 6], [-2, 4], [8, 0], [-8, 0]],
      [-2, 4, [6, 10], [-4, 8], [11, 0], [-11, 0]],
      [-2, 2, [4, 2], [-2, 2], [8, 0], [-8, 0]],
    ],
    aerialN: [
      [0, 0, [0, -6], [-2, -4], [4, 6], [-4, 8]],
      [-4, 0, [12, -6], [-12, -6], [7, 5], [-7, 5]],
      [-4, 0, [12, -6], [-12, -6], [7, 5], [-7, 5]],
    ],
    aerialF: [
      [-6, 0, [-8, -18], [-2, 0], [5, 4], [-4, 6]],
      [-5, 0, [14, 8], [-2, 0], [6, 4], [-4, 6]],
      [-3, 0, [6, 2], [-2, 0], [5, 4], [-4, 6]],
    ],
    aerialB: [
      [5, 0, [2, -2], [-6, -4], [5, 4], [-4, 6]],
      [6, 0, [2, -2], [-14, -6], [6, 4], [-5, 6]],
      [4, 0, [2, -2], [-8, -4], [5, 4], [-4, 6]],
    ],
    aerialU: [
      [-2, 0, [0, -10], [-2, 0], [4, 5], [-4, 6]],
      [-2, 0, [4, -40], [-2, 0], [5, 5], [-5, 6]],
      [-2, 0, [4, -22], [-2, 0], [4, 5], [-4, 6]],
    ],
    aerialD: [
      [0, 0, [2, -4], [-2, 0], [6, 4], [-6, 4]],
      [0, 0, [4, 14], [-2, 6], [6, 1], [-6, 1]],
      [0, 0, [4, 8], [-2, 4], [6, 2], [-6, 2]],
    ],
    // grab: a lunge with both hands out, then (held for the whole hold) both fists clamped on the victim, braced
    grab: [
      [5, 3, [16, -12], [12, -10], [11, 0], [-8, 0], undefined, undefined, -1],
      [2, 3, [12, -13], [10, -11], [8, 0], [-8, 0], undefined, undefined, 1],
    ],
    chargeS: [
      [-4, 6, [8, -2], [-6, -2], [8, 0], [-8, 0]],
      [2, 2, [16, -6], [-8, -4], [10, 0], [-6, 0]],
      [0, 1, [8, -2], [-4, 0], [6, 0], [-4, 0]],
    ],
    grapple: [
      [-2, 0, [12, -4], [-6, -2], [6, 0], [-6, 0]],
      [2, 3, [16, 2], [4, -2], [10, 0], [-8, 0]],
      [0, 0, [6, 0], [-2, 0], [5, 0], [-5, 0]],
    ],
    jet: [
      [0, 4, [0, 2], [0, 2], [6, 0], [-6, 0]],
      [0, 0, [2, 8], [-2, 8], [4, 3], [-4, 3]],
      [0, 0, [2, 0], [-2, 0], [5, 3], [-5, 3]],
    ],
    vent: [
      [-2, 6, [8, -4], [-8, -4], [8, 0], [-8, 0]],
      [0, 0, [18, -14], [-18, -14], [10, 3], [-10, 3]],
      [0, 2, [6, -2], [-6, -2], [6, 0], [-6, 0]],
    ],
    meltdown: [
      [-4, 2, [12, -6], [-4, 0], [6, 0], [-6, 0]],
      [2, 0, [0, -30], [-2, -30], [5, 0], [-5, 0]],
      [0, 0, [4, -10], [-4, -10], [5, 0], [-5, 0]],
    ],
    castF: [
      [-3, 1, [10, -8], [-6, -4], [6, 0], [-6, 0]],
      [2, 0, [18, -8], [10, -6], [8, 0], [-8, 0]],
      [0, 0, [8, -4], [-2, -2], [5, 0], [-5, 0]],
    ],
    castU: [
      [0, 2, [2, -6], [-2, -6], [5, 0], [-5, 0]],
      [0, 0, [3, -34], [-3, -34], [4, 0], [-4, 0]],
      [0, 0, [3, -20], [-3, -20], [5, 0], [-5, 0]],
    ],
    castD: [
      [0, 6, [6, 0], [-4, 0], [7, 0], [-7, 0]],
      [0, 8, [10, 6], [-2, 6], [9, 0], [-8, 0]],
      [0, 3, [6, 2], [-2, 2], [6, 0], [-6, 0]],
    ],
    dashS: [
      [-6, 4, [-8, -2], [8, -4], [10, 0], [-10, 0]],
      [-2, 2, [20, -4], [-12, -2], [14, 0], [-12, 0]],
      [0, 2, [10, -2], [-4, -2], [8, 0], [-6, 0]],
    ],
    raid: [
      [-6, 4, [-6, -10], [-8, -8], [8, 0], [-8, 0]],
      [4, 0, [16, -16], [-14, -16], [10, 4], [-10, 4]],
      [0, 0, [6, -4], [-4, -4], [6, 0], [-6, 0]],
    ],
    // lunging shoulder charge: whole body leans into it, both arms tucked forward
    shoulder: [
      [-4, 4, [6, -8], [2, -8], [10, 0], [-10, 0]],
      [9, 3, [14, -14], [10, -12], [14, 0], [-12, 0]],
      [4, 1, [8, -6], [2, -6], [8, 0], [-6, 0]],
    ],
    // low sweeping kick: crouched, front leg shot out along the floor
    sweep: [
      [-2, 8, [2, -6], [-4, -4], [8, 0], [-8, 0]],
      [2, 9, [-4, -4], [-8, -2], [24, 0], [-10, 0]],
      [0, 5, [2, -4], [-4, -2], [12, 0], [-8, 0]],
    ],
    // roundhouse / spin kick: front leg whips up and out, arms counter-balance
    spinKick: [
      [-4, 3, [-4, -10], [8, -12], [4, 0], [-8, 0]],
      [5, 0, [-6, -14], [10, -10], [22, 12], [-8, 0]],
      [0, 1, [-2, -8], [6, -8], [8, 2], [-6, 0]],
    ],
    // two-handed blast: both fists thrust forward in a wide stance
    beamF: [
      [-6, 5, [8, -10], [4, -10], [8, 0], [-8, 0]],
      [-2, 3, [22, -16], [18, -14], [12, 0], [-12, 0]],
      [0, 1, [14, -14], [10, -12], [8, 0], [-8, 0]],
    ],
    // off-hand jab (used for the 2nd / 4th hit of a jab chain so a combo does not repeat one pose)
    jabB: [
      [-2, 0, [-6, -2], [-2, 0], [4, 0], [-4, 0]],
      [-4, 1, [-2, 0], [14, -6], [6, 0], [-5, 0]],
      [-2, 0, [-2, 0], [4, -2], [4, 0], [-4, 0]],
    ],
    // throws: grip -> the throw itself in the throw's direction -> release
    throwF: [
      [-3, 0, [12, -6], [-2, 0], [5, 0], [-5, 0]],
      [5, 2, [24, -10], [8, -6], [8, 0], [-8, 0]],
      [0, 0, [10, -4], [-2, 0], [5, 0], [-5, 0]],
    ],
    throwB: [
      [-3, 0, [12, -6], [-2, 0], [5, 0], [-5, 0]],
      [-8, 2, [-18, -12], [-6, -6], [-6, 0], [6, 0]],
      [-2, 0, [-6, -4], [-2, 0], [4, 0], [-4, 0]],
    ],
    throwU: [
      [-3, 0, [12, -6], [-2, 0], [5, 0], [-5, 0]],
      [-3, 0, [6, -40], [-2, -8], [4, 0], [-4, 0]],
      [-2, 0, [4, -22], [-2, 0], [4, 0], [-4, 0]],
    ],
    throwD: [
      [-3, 0, [12, -8], [-2, 0], [5, 0], [-5, 0]],
      [4, 9, [12, 10], [4, 6], [9, 0], [-9, 0]],
      [0, 3, [8, 2], [0, 2], [6, 0], [-6, 0]],
    ],
    shield: [[-2, 3, [10, -8], [4, -6], [5, 0], [-5, 0]]],
    dodge: [[-4, 8, [0, -2], [-2, 0], [6, 0], [-6, 0]]],
  };
  const row = moveKeys[anim] ?? T[anim];
  if (!row) return;
  const fl = moveFlows[anim];
  if (fl && frames >= 8 && row.length === 3) {
    const fr = flowFrame(row as [Key, Key, Key], fl, f);
    set(fr.key);
    p.grav = fr.grav;
    p.ph = fr.ph;
    p.flex = fr.flex;
    p.hit = fr.hit;
    return;
  }
  if (frames >= 6 && row.length === 3) {
    // six frames from three key poses: wind-up, an exaggerated anticipation (pulls back past the wind-up), the fast
    // in-between, the strike, follow-through and recovery. Frame 3 is the active pose.
    const mix = (a: number, b: number, t: number): number => Math.round(a + (b - a) * t);
    const mixV = (a: V2, b: V2, t: number): V2 => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
    const opt = (a: number | undefined, b: number | undefined, t: number): number | undefined => (a === undefined || b === undefined ? (a ?? b) : Math.round((a + (b - a) * t) * 100) / 100);
    const ext = (a: number | undefined, b: number | undefined, t: number): number | undefined => (a === undefined && b === undefined ? undefined : Math.round(((a ?? 0) + ((b ?? 0) - (a ?? 0)) * t) * 100) / 100);
    const lerp = (a: Key, b: Key, t: number): Key => [mix(a[0], b[0], t), mix(a[1], b[1], t), mixV(a[2], b[2], t), mixV(a[3], b[3], t), mixV(a[4], b[4], t), mixV(a[5], b[5], t), opt(a[6], b[6], t), opt(a[7], b[7], t), ext(a[8], b[8], t), ext(a[9], b[9], t), ext(a[10], b[10], t), ext(a[11], b[11], t)];
    const [A, B, C] = row;
    // a taunt is a pose, not a strike: no overshoot or snap, just an eased move into it and back out
    const e = (anim === 'mv_taunt' ? [A, lerp(A, B, 0.35), lerp(A, B, 0.75), B, lerp(B, C, 0.5), C] : [A, lerp(A, B, -0.28), lerp(A, B, 0.62), B, lerp(B, C, 0.5), C])[Math.min(f, 5)];
    set(e);
    return;
  }
  set(row[Math.min(f, row.length - 1)]);
}

// ---- flowing attacks ------------------------------------------------------------------------------------------------
//
// A basic move's row is drawn from its three key poses (wind-up A, strike B, recovery C) as a full action: an optional
// lift (heavies), the wind-up, the anticipation coil, a breakdown and a fast in-between travelling on arcs, the strike, a
// late-active extension, the overshoot, the recovery and (heavies) a mid-recovery beat. Frames 0..5 keep the meaning the
// six-pose rows always had (0 wind-up, 1 anticipation, 2 in-between, 3 strike, 4 follow-through, 5 recovery) so effects
// keyed on them still line up; the extra beats sit after them. The shared settle frame lives in the `mvSettle` row.

/** Row slots of a flowing move (see movePoses.ts FLOW_*). */
export const FLOW_SLOT = { wind: 0, coil: 1, smear: 2, strike: 3, over: 4, recover: 5, breakdown: 6, extend: 7, lift: 8, settleMid: 9 } as const;

const SETTLE_GROUND: Key = [0.5, 1.5, [3, 0.5], [-3, 0.5], [5, 0], [-5, 0], undefined, undefined, 0.3, 0.3];
const SETTLE_AIR: Key = [0, 0, [8, -10], [-7, -9], [7, 5], [-6, 7], undefined, undefined, 0, -0.3];
const STANCE: Key = [0, 1, [2, 0], [-2, 0], [4, 0], [-4, 0]];
const AIR_STANCE: Key = [0, 0, [7, -8], [-6, -8], [6, 6], [-5, 8]];

const q = (v: number): number => Math.round(v * 2) / 2;
const qa = (v: number): number => Math.round(v * 10) / 10;
/** Approximate shoulder / hip pivots in each limb's offset space (units): hands swing round the shoulder, feet round the hip. */
const PIVOT: V2[] = [[-6, -20], [4, -18], [0, 18], [0, 18]];

/** Limb offset from a to b at t, travelling round `pivot` (radius and angle eased separately) so swings are arcs, not lines. */
function arc(a: V2, b: V2, t: number, pivot: V2): V2 {
  const ax = a[0] - pivot[0];
  const ay = a[1] - pivot[1];
  const bx = b[0] - pivot[0];
  const by = b[1] - pivot[1];
  const ra = Math.hypot(ax, ay);
  const rb = Math.hypot(bx, by);
  // too close to the pivot (or barely moving) for an angle to mean anything: a straight line
  if (ra < 3 || rb < 3 || Math.hypot(bx - ax, by - ay) < 3) return [mixN(a[0], b[0], t), mixN(a[1], b[1], t)];
  const a0 = Math.atan2(ay, ax);
  let da = Math.atan2(by, bx) - a0;
  if (da > Math.PI) da -= TAU;
  if (da < -Math.PI) da += TAU;
  const ang = a0 + da * t;
  const r = mixN(ra, rb, t);
  return [pivot[0] + Math.cos(ang) * r, pivot[1] + Math.sin(ang) * r];
}
const lim = (k: Key, i: number): V2 => k[i] as V2;
const num = (v: number | undefined): number => v ?? 0;
/** b + (b - a) * k (an overshoot / a pull back past a pose). */
const past = (a: number, b: number, k: number): number => b + (b - a) * k;
const pastV = (a: V2, b: V2, k: number): V2 => [past(a[0], b[0], k), past(a[1], b[1], k)];

interface FlowFrame {
  key: Key;
  grav: V2;
  ph: number;
  flex: [number, number, number];
  hit: number;
}
/** Which limb (2 front hand, 3 back hand, 4 front foot, 5 back foot) travels furthest from wind-up to strike. */
function leadLimb(A: Key, B: Key): number {
  let best = 2;
  let d = -1;
  for (let i = 2; i <= 5; i++) {
    const v = Math.hypot(lim(B, i)[0] - lim(A, i)[0], lim(B, i)[1] - lim(A, i)[1]);
    if (v > d + 0.5) {
      d = v;
      best = i;
    }
  }
  return best;
}

/** One frame of a flowing move row (see FLOW_SLOT). */
function flowFrame(row: [Key, Key, Key], fl: Flow, f: number): FlowFrame {
  const [A, B0, C0] = row;
  const w = Math.max(0, Math.min(1, fl.w));
  const air = !!fl.air;
  const L = leadLimb(A, B0);
  const d: V2 = [lim(B0, L)[0] - lim(A, L)[0], lim(B0, L)[1] - lim(A, L)[1]];
  const dl = Math.hypot(d[0], d[1]) || 1;
  const u: V2 = [d[0] / dl, d[1] / dl];
  // the strike turns the chest into it (a lead hand brings the near shoulder through, a rear hand the far one), unless
  // the key already says how; a mostly vertical strike turns less
  const side = L === 2 ? -1 : L === 3 ? 1 : L === 4 ? -0.5 : 0.5;
  const horiz = Math.abs(u[0]);
  const twS = B0[8] ?? q(side * (1 + 1.6 * w) * (0.35 + 0.65 * horiz) * Math.sign(u[0] || 1));
  const B: Key = [...B0] as Key;
  B[8] = twS;
  if (B[10] === undefined) B[10] = qa(u[0] * 0.5 * (0.5 + w)); // the head leans into it
  const C: Key = [...C0] as Key;
  if (C[8] === undefined) C[8] = qa(twS * 0.3);
  C[1] = C0[1] + (air ? 0 : 1.5 * w); // weight sinks into the recovery on heavies
  // anticipation: everything pulled back past the wind-up, away from the strike; the coil turns the chest the other way
  const ka = 0.14 + 0.24 * w;
  const coil = (k: number): Key => {
    const o = [...A] as Key;
    o[0] = q(past(B[0], A[0], k * 1.2));
    o[1] = air ? A[1] : q(A[1] + 1 + 2.5 * w * (k / ka));
    for (let i = 2; i <= 5; i++) {
      const grounded = !air && i >= 4 && lim(A, i)[1] <= 0.5 && lim(B, i)[1] <= 0.5;
      const kk = i === L ? k : grounded ? k * 0.15 : k * 0.5;
      const v = pastV(lim(B, i), lim(A, i), kk);
      o[i] = [q(v[0]), grounded ? 0 : q(v[1])] as V2;
    }
    o[8] = qa(num(A[8]) - twS * (0.4 + 0.5 * w) * (k / ka));
    o[9] = qa(num(A[9]) + (air ? 0 : 0.6 * w));
    o[10] = qa(num(A[10]) - u[0] * 0.4 * (k / ka));
    return o;
  };
  const A1 = coil(ka);
  // travel from the coil to the strike: the body leads (lean / twist arrive early), the striking limb whips round on an arc
  const travel = (t: number): Key => {
    const tb = 1 - (1 - t) ** 1.6;
    const tl = t ** 1.25;
    const o: Key = [q(mixN(A1[0], B[0], tb)), q(mixN(A1[1], B[1], tb)), [0, 0], [0, 0], [0, 0], [0, 0], mixO(A1[6], B[6], tl), mixO(A1[7], B[7], tb), qa(mixN(num(A1[8]), num(B[8]), tb)), qa(mixN(num(A1[9]), num(B[9]), tb)), qa(mixN(num(A1[10]), num(B[10]), t) - u[0] * 0.5 * Math.sin(t * Math.PI)), qa(mixN(num(A1[11]), num(B[11]), t))];
    for (let i = 2; i <= 5; i++) {
      const v = arc(lim(A1, i), lim(B, i), i === L ? tl : t, PIVOT[i - 2]);
      o[i] = [q(v[0]), q(v[1])] as V2;
    }
    if (o[6] !== undefined) o[6] = Math.round(o[6]);
    return o;
  };
  // overshoot: the striking limb and the body carry on past the strike, more on heavies; the head snaps through last
  const ko = 0.1 + 0.22 * w;
  const over = (k: number): Key => {
    const o = [...B] as Key;
    o[0] = q(past(A1[0], B[0], k * 0.6));
    o[1] = air ? B[1] : q(B[1] + 1.5 * w * (k / ko));
    for (let i = 2; i <= 5; i++) {
      const grounded = !air && i >= 4 && lim(B, i)[1] <= 0.5;
      const kk = i === L ? k : grounded ? 0 : k * 0.35;
      const v = i === L ? arc(lim(A1, i), lim(B, i), 1 + kk, PIVOT[i - 2]) : pastV(lim(A1, i), lim(B, i), kk);
      o[i] = [q(v[0]), grounded ? 0 : q(v[1])] as V2;
    }
    if (B[6] !== undefined && A1[6] !== undefined) o[6] = Math.round(past(A1[6], B[6], Math.min(0.25, k)));
    o[8] = qa(twS * (1 + 0.5 * (k / ko)));
    o[10] = qa(num(B[10]) + u[0] * 0.8 * (k / ko));
    o[11] = qa(num(B[11]) + u[1] * 0.6 * (k / ko));
    return o;
  };
  const stance = air ? AIR_STANCE : STANCE;
  // per slot: the key, and how hard loose parts trail the motion (+ streams behind, - swings on past)
  let key: Key;
  let lag: number;
  let ph: number;
  switch (f) {
    case FLOW_SLOT.lift: {
      key = mixKey(stance, A, 0.45);
      key[1] = air ? key[1] : key[1] - 0.5;
      key[9] = -0.5;
      lag = 0;
      ph = 0;
      break;
    }
    case FLOW_SLOT.wind:
      key = coil(ka * 0.35);
      lag = -0.2;
      ph = 1;
      break;
    case FLOW_SLOT.coil:
      key = A1;
      lag = -0.4;
      ph = 2;
      break;
    case FLOW_SLOT.breakdown:
      key = travel(0.38);
      lag = 0.35;
      ph = 3;
      break;
    case FLOW_SLOT.smear:
      key = travel(0.78);
      lag = 0.85;
      ph = 4;
      break;
    case FLOW_SLOT.strike:
      key = B;
      lag = 0.75;
      ph = 5;
      break;
    case FLOW_SLOT.extend:
      key = over(ko * 0.45);
      lag = 0.4;
      ph = 6;
      break;
    case FLOW_SLOT.over:
      key = over(ko);
      lag = -0.35;
      ph = 7;
      break;
    case FLOW_SLOT.recover:
      key = C;
      lag = 0.2;
      ph = 8;
      break;
    default: {
      // settleMid: halfway home, still low
      key = mixKey(C, stance, 0.5);
      if (!air) key[1] += 0.8 * w;
      lag = -0.1;
      ph = 9;
      break;
    }
  }
  const s = lag * (0.55 + 0.65 * w);
  // loose parts trail opposite the strike's motion (u), turned into the direction gravity hangs them
  const gx = -u[0] * s;
  const gy = 1 - u[1] * s * 0.6;
  // squash and stretch: squashed into the coil, stretched along the strike (tall for a rising strike, flattened for one
  // driven down into the floor), squashed again by the impact of the overshoot; airborne bodies flex less
  const up = Math.max(0, -u[1]);
  const down = Math.max(0, u[1]);
  const strikeSy = 1 + w * (0.08 * up - 0.09 * down - 0.02 * (1 - up - down));
  let sy: number;
  let hit: number;
  switch (f) {
    case FLOW_SLOT.lift:
      sy = 1 + 0.03 * w;
      hit = 0;
      break;
    case FLOW_SLOT.wind:
      sy = 1 - 0.03 * w;
      hit = 0;
      break;
    case FLOW_SLOT.coil:
      sy = 1 - 0.08 * w - 0.02;
      hit = 0.1;
      break;
    case FLOW_SLOT.breakdown:
      sy = 1 - 0.02 * w;
      hit = 0.25;
      break;
    case FLOW_SLOT.smear:
      sy = 1 + (0.03 + 0.04 * w) * (up > 0.5 ? 1.4 : 1) - 0.06 * down * w;
      hit = 0.6;
      break;
    case FLOW_SLOT.strike:
      sy = strikeSy;
      hit = 1;
      break;
    case FLOW_SLOT.extend:
      sy = mixN(strikeSy, 1, 0.3);
      hit = 0.8;
      break;
    case FLOW_SLOT.over:
      sy = 1 - 0.05 * w - 0.01;
      hit = 0.45;
      break;
    case FLOW_SLOT.recover:
      sy = 1 - 0.02 * w;
      hit = 0.1;
      break;
    default:
      sy = 1 - 0.01 * w;
      hit = 0;
  }
  if (air) sy = 1 + (sy - 1) * 0.6;
  const sx = 1 + (1 - sy) * 0.7;
  // the chest tips over the hips with the lean (a heavy body rotates into a lunge instead of only sliding along)
  const tilt = Math.max(-0.22, Math.min(0.3, key[0] * (0.014 + 0.008 * w)));
  return { key, grav: [qa(gx), qa(Math.max(0.2, gy))], ph, flex: [Math.round(sx * 1000) / 1000, Math.round(sy * 1000) / 1000, Math.round(tilt * 1000) / 1000], hit };
}
