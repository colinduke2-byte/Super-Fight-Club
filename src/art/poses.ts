/** Animation poses for the generated sprite sheets: a pose per (animation, frame), from templates or a move's key poses. No Phaser or DOM, so it also runs in the sheet workers. */
import type { PoseSpec } from '../engine/moves';
import { buildKeys, type Key } from './poseTemplates';

export type V2 = [number, number];

export interface Pose {
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
}

const REST: Pose = { bob: 0, crouch: 0, lean: 0, frontFoot: [4, 0], backFoot: [-4, 0], frontHand: [2, 0], backHand: [-2, 0] };

/** Key poses of the move-specific animations (`mv_<id>`) of the character whose sheet is being drawn. */
let moveKeys: Record<string, [Key, Key, Key]> = {};

/** Load the key poses of a character's move animations before drawing its sheet. */
export function setMovePoses(poses: Iterable<{ anim: string; pose: PoseSpec }>): void {
  moveKeys = {};
  for (const m of poses) moveKeys[m.anim] = buildKeys(m.pose);
}

export function poseFor(anim: string, f: number, frames: number): Pose {
  const p: Pose = { ...REST };
  switch (anim) {
    case 'idle': {
      // slow breath: the chest rises and settles, hands drift with it
      const ph = (f / Math.max(1, frames)) * Math.PI * 2;
      const b = Math.round((1 - Math.cos(ph)) / 2);
      p.bob = b;
      p.frontHand = [2, b];
      p.backHand = [-2 + Math.round(Math.sin(ph) * 0.6), b];
      break;
    }
    case 'run': {
      const ph = (f / frames) * Math.PI * 2;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      p.frontFoot = [Math.round(s * 11), Math.max(0, Math.round(-c * 7))];
      p.backFoot = [-Math.round(s * 11), Math.max(0, Math.round(c * 7))];
      p.bob = Math.round(Math.abs(s) * 2); // lowest on contact, highest mid-stride
      p.lean = 4;
      p.frontHand = [-Math.round(s * 8), -2 - Math.round(Math.abs(s))];
      p.backHand = [Math.round(s * 8), -2 - Math.round(Math.abs(s))];
      break;
    }
    case 'crouch':
      p.crouch = 7;
      p.frontFoot = [7, 0];
      p.backFoot = [-7, 0];
      p.frontHand = [5, -3];
      p.backHand = [-3, -3];
      break;
    case 'jump': {
      // take-off stretch -> rising -> knees tucked at the top
      const J: [number, number, V2, V2, V2, V2][] = [
        [1, 0, [5, -14], [-6, -12], [4, 3], [-5, 1]],
        [0, 0, [6, -10], [-5, -8], [6, 7], [-3, 9]],
        [2, 3, [7, -6], [-3, -5], [7, 10], [-1, 11]],
      ];
      const [ln, cr, fh, bh, ff, bf] = J[Math.min(f, J.length - 1)];
      p.lean = ln;
      p.crouch = cr;
      p.frontHand = fh;
      p.backHand = bh;
      p.frontFoot = ff;
      p.backFoot = bf;
      break;
    }
    case 'fall':
      // arms up for balance, legs reaching for the ground; a slow flutter between two poses
      p.frontFoot = f % 2 === 0 ? [9, 3] : [8, 4];
      p.backFoot = f % 2 === 0 ? [-9, 0] : [-8, 1];
      p.frontHand = f % 2 === 0 ? [8, -15] : [9, -13];
      p.backHand = f % 2 === 0 ? [-8, -15] : [-9, -16];
      break;
    case 'ledge':
      p.frontFoot = [3, 0];
      p.backFoot = [-3, 0];
      p.crouch = 2;
      p.frontHand = [6, -26];
      p.backHand = [-2, -26];
      break;
    case 'hurt':
      p.lean = -7;
      p.crouch = 1;
      p.frontFoot = [10, 5];
      p.backFoot = [-7, 0];
      p.frontHand = [12, -14];
      p.backHand = [-12, -8];
      break;
    case 'walk': {
      // gentle stride: shorter steps than the run, upright, arms swinging lightly
      const ph = (f / frames) * Math.PI * 2;
      const sn = Math.sin(ph);
      const cs = Math.cos(ph);
      p.frontFoot = [Math.round(sn * 6), Math.max(0, Math.round(-cs * 3))];
      p.backFoot = [-Math.round(sn * 6), Math.max(0, Math.round(cs * 3))];
      p.bob = Math.abs(sn) > 0.7 ? 1 : 0;
      p.frontHand = [-Math.round(sn * 3), -1];
      p.backHand = [Math.round(sn * 3), -1];
      break;
    }
    case 'hurtL': // light flinch: a small recoil, still on both feet
      p.lean = -5;
      p.crouch = 2;
      p.frontFoot = [8, 0];
      p.backFoot = [-7, 0];
      p.frontHand = [9, -10];
      p.backHand = [-9, -5];
      break;
    case 'hurtU': // launched upward: back arched, arms flung up, legs trailing
      p.lean = -7;
      p.frontFoot = [6, 6];
      p.backFoot = [-6, 8];
      p.frontHand = [8, -18];
      p.backHand = [-8, -18];
      break;
    case 'hurtD': // spiked / driven downward: curled forward, arms down
      p.lean = 6;
      p.crouch = 3;
      p.frontFoot = [4, 5];
      p.backFoot = [-4, 7];
      p.frontHand = [4, 7];
      p.backHand = [-2, 7];
      break;
    case 'dash': // two alternating strides, body low and leaning in
      p.lean = 7;
      p.crouch = 3;
      p.frontFoot = f % 2 === 0 ? [13, 0] : [-3, 4];
      p.backFoot = f % 2 === 0 ? [-9, 3] : [9, 0];
      p.frontHand = [-4, -2];
      p.backHand = [-8, 0];
      break;
    case 'skid': // braking: weight thrown back, front foot dug in
      p.lean = -5;
      p.crouch = 3;
      p.frontFoot = [11, 0];
      p.backFoot = [-5, 0];
      p.frontHand = [8, -6];
      p.backHand = [-6, -4];
      break;
    case 'roll': // tucked ball (the view spins the sprite)
      p.lean = 4;
      p.crouch = 10;
      p.frontFoot = [6, 6];
      p.backFoot = [-6, 6];
      p.frontHand = [4, 0];
      p.backHand = [-2, 0];
      break;
    case 'held': // dangling in a grab
      p.lean = -3;
      p.frontFoot = [4, 6];
      p.backFoot = [-4, 8];
      p.frontHand = [8, -22];
      p.backHand = [-8, -22];
      break;
    case 'glide': // wings fully spread, body stretched out level, spear trailing
      p.lean = 8;
      p.frontFoot = [5, 6];
      p.backFoot = [-8, 8];
      p.frontHand = [10, -6];
      p.backHand = [-4, -4];
      p.aim = 20;
      p.wing = 1 + (f % 2 === 0 ? 0 : -0.12);
      break;
    case 'down':
    case 'ko':
      p.lying = true;
      break;
    default:
      attackPose(anim, f, p, frames);
      break;
  }
  if (p.wing === undefined) {
    // winged fighters: folded on the ground, flaring while airborne or hurt
    const w: Record<string, number> = { idle: 0.1, run: 0.2, walk: 0.15, dash: 0.3, skid: 0.35, crouch: 0.05, jump: [0.9, 0.55, 0.2][f % 3], fall: 0.65, ledge: 0.45, hurt: 0.85, hurtL: 0.5, hurtU: 0.95, hurtD: 0.7, roll: 0.05, held: 0.8, shield: 0.4, dodge: 0.2 };
    p.wing = w[anim] ?? 0.3;
  }
  return p;
}

/** Attack/defence key poses. Frame 0 = wind-up, 1 = active, 2 = recovery (see Fighter.attackPhase). */
function attackPose(anim: string, f: number, p: Pose, frames = 3): void {
  const set = (lean: number, crouch: number, fh: V2, bh: V2, ff: V2, bf: V2, aim?: number, wing?: number): void => {
    if (aim !== undefined) p.aim = aim;
    if (wing !== undefined) p.wing = wing;
    p.lean = lean;
    p.crouch = crouch;
    p.frontHand = fh;
    p.backHand = bh;
    p.frontFoot = ff;
    p.backFoot = bf;
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
    grab: [
      [-3, 0, [10, -6], [-2, 0], [5, 0], [-5, 0]],
      [-4, 0, [14, -4], [-4, -2], [6, 0], [-6, 0]],
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
  if (frames >= 6 && row.length === 3) {
    // six frames from three key poses: wind-up, an exaggerated anticipation (pulls back past the wind-up), the fast
    // in-between, the strike, follow-through and recovery. Frame 3 is the active pose.
    const mix = (a: number, b: number, t: number): number => Math.round(a + (b - a) * t);
    const mixV = (a: V2, b: V2, t: number): V2 => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
    const opt = (a: number | undefined, b: number | undefined, t: number): number | undefined => (a === undefined || b === undefined ? (a ?? b) : Math.round((a + (b - a) * t) * 100) / 100);
    const lerp = (a: (typeof row)[number], b: (typeof row)[number], t: number): (typeof row)[number] => [mix(a[0], b[0], t), mix(a[1], b[1], t), mixV(a[2], b[2], t), mixV(a[3], b[3], t), mixV(a[4], b[4], t), mixV(a[5], b[5], t), opt(a[6], b[6], t), opt(a[7], b[7], t)];
    const [A, B, C] = row;
    const e = [A, lerp(A, B, -0.28), lerp(A, B, 0.62), B, lerp(B, C, 0.5), C][Math.min(f, 5)];
    set(e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7]);
    return;
  }
  const e = row[Math.min(f, row.length - 1)];
  set(e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7]);
}
