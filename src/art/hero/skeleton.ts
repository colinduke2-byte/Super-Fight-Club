import type { PlaceholderLook } from '../../engine/types';
import { ik, type V2 } from './raster';

/** The pose inputs the animation tables produce (units of the 64px authoring grid). */
export interface HeroPose {
  bob: number;
  crouch: number;
  lean: number;
  frontFoot: V2;
  backFoot: V2;
  frontHand: V2;
  backHand: V2;
  aim?: number;
  wing?: number;
}

/** Joint positions in full-resolution (128px frame) pixels, derived from a pose. */
export interface Skel {
  W: number;
  H: number;
  phase: number;
  pose: HeroPose;
  cx: number;
  base: number;
  hipY: number;
  tw: number;
  torso: { x: number; y: number; w: number; h: number };
  head: { x: number; y: number; s: number };
  shF: V2;
  shB: V2;
  handF: V2;
  handB: V2;
  hipF: V2;
  hipB: V2;
  ankleF: V2;
  ankleB: V2;
  elbowF: V2;
  elbowB: V2;
  kneeF: V2;
  kneeB: V2;
  armLen: number;
  /** Bone length of each arm segment (shoulder-elbow, elbow-hand). */
  armBone: number;
  legLen: number;
}

/** Two-bone limb from `a` towards `t` with bone length `l` (the end point is clamped to the reach). */
export function solveLimb(a: V2, t: V2, l: number, bend: 1 | -1): { mid: V2; end: V2 } {
  const dx = t[0] - a[0];
  const dy = t[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  const m = Math.min(d, l * 2 * 0.999);
  const end: V2 = [a[0] + (dx / d) * m, a[1] + (dy / d) * m];
  return { mid: ik(a, end, l, l, bend), end };
}

export function skeleton(look: PlaceholderLook, pose: HeroPose, W: number, H: number, phase: number): Skel {
  const b = look.build;
  const k = 2; // hi-res pixels per authoring-grid unit
  const cx = W / 2 - 5 * (H / 64);
  const base = H - 4;
  const legH = b.legH * 2 * k - pose.crouch * k;
  const torsoH = b.torsoH * 2 * k;
  const tw = (b.shoulderW - 4) * 2 * k;
  const hs = b.headSize * 2 * k;
  const lean = pose.lean * k;
  const hipY = base - legH;
  const torsoTop = hipY - torsoH + 2 * k + pose.bob * k;
  const x0 = Math.round(cx - tw / 2 + lean);
  const shoulderY = torsoTop + 5 * k;
  const shF: V2 = [x0 + tw - 2 * k, shoulderY + 2 * k];
  const shB: V2 = [x0 + 2 * k, shoulderY + 2 * k];
  const armLen = b.armLen * 2 * k;
  const handF: V2 = [shF[0] + 7 * k + pose.frontHand[0] * k, shF[1] + armLen + pose.frontHand[1] * k + 2 * k];
  const handB: V2 = [shB[0] - 4 * k + pose.backHand[0] * k, shB[1] + armLen - 2 * k + pose.backHand[1] * k];
  const hipF: V2 = [cx + 4 * k + lean * 0.5, hipY];
  const hipB: V2 = [cx - 5 * k + lean * 0.5, hipY];
  const footF: V2 = [cx + 4 * k + lean * 0.5 + pose.frontFoot[0] * k, base - pose.frontFoot[1] * k];
  const footB: V2 = [cx - 4 * k + lean * 0.5 + pose.backFoot[0] * k, base - pose.backFoot[1] * k];
  const ankle = 4 * k;
  // two-bone limbs: fixed bone lengths, so a folded arm / bent leg keeps its size (the end point is clamped to the reach)
  const armL = armLen * 0.52;
  // bones keep the standing leg length: a crouch bends the knees instead of shrinking the legs (so wide stances,
  // splits and stomps can actually reach their feet)
  const standLeg = b.legH * 2 * k;
  const legL = ((Math.max(legH, standLeg * 0.86) - ankle) / 2) * 1.01;
  const limb = solveLimb;
  const aF = limb(shF, handF, armL, 1);
  const aB = limb(shB, handB, armL, 1);
  const lF = limb(hipF, [footF[0], footF[1] - ankle], legL, -1);
  const lB = limb(hipB, [footB[0], footB[1] - ankle], legL, -1);
  return {
    W,
    H,
    phase,
    pose,
    cx,
    base,
    hipY,
    tw,
    torso: { x: x0, y: torsoTop, w: tw, h: torsoH },
    head: { x: Math.round(cx - hs / 2 + lean + 2 * k), y: torsoTop - hs + 4 * k, s: hs },
    shF,
    shB,
    handF: aF.end,
    handB: aB.end,
    hipF,
    hipB,
    ankleF: lF.end,
    ankleB: lB.end,
    elbowF: aF.mid,
    elbowB: aB.mid,
    kneeF: lF.mid,
    kneeB: lB.mid,
    armLen,
    armBone: armL,
    legLen: legH,
  };
}
