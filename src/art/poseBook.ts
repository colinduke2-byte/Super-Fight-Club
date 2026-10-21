/**
 * Hand-set key poses that replace a move's template pose (`pose` in its moves.json) for the art only: airborne aerials
 * (legs tucked or kicking, the back air reaching back, the down air striking down) and distinct wind-up / strike /
 * follow-through poses for moves whose templates came out alike. Gameplay never reads these.
 *
 * A key is [lean, crouch, frontHand, backHand, frontFoot, backFoot, aim?, wing?, twist?, bob?, headX?, headY?] in the
 * 64px authoring grid (see poseTemplates.ts / Pose). Feet are [dx, lift]: in the air a lifted foot is a tucked leg.
 */
import type { PoseSpec } from '../engine/moves';
import type { Key } from './poseTemplates';

type V2 = [number, number];
interface Extra {
  aim?: number;
  wing?: number;
  tw?: number;
  bob?: number;
  hx?: number;
  hy?: number;
}
/** One key pose. */
function K(lean: number, crouch: number, fh: V2, bh: V2, ff: V2, bf: V2, x: Extra = {}): Key {
  const k: Key = [lean, crouch, fh, bh, ff, bf];
  if (x.aim !== undefined || x.wing !== undefined || x.tw !== undefined || x.bob !== undefined || x.hx !== undefined || x.hy !== undefined) {
    k[6] = x.aim;
    k[7] = x.wing;
    k[8] = x.tw;
    k[9] = x.bob;
    k[10] = x.hx;
    k[11] = x.hy;
  }
  return k;
}
/** Three keys as a custom pose spec. */
const C = (a: Key, b: Key, c: Key): PoseSpec => ({ t: 'custom', keys: [a, b, c] as unknown as PoseSpec['keys'] });
/** The same three keys with a weapon aim / wing spread track (kept from the move's own spec when it has one). */
function withTracks(p: PoseSpec, from: PoseSpec | undefined, aim?: [number, number, number], wing?: [number, number, number]): PoseSpec {
  const a = aim ?? from?.aim;
  const w = wing ?? from?.wing;
  const keys = (p.keys as unknown as Key[]).map((k, i) => {
    const o = [...k] as Key;
    if (a && o[6] === undefined) o[6] = a[i];
    if (w && o[7] === undefined) o[7] = w[i];
    return o;
  });
  return { t: 'custom', keys: keys as unknown as PoseSpec['keys'] };
}

// ---- airborne shapes -----------------------------------------------------------------------------------------------

/** Neutral air as a star: balled up, then every limb flung out at once, then gathering back in. */
function nairStar(r = 14, h = -10, x: Extra = {}): PoseSpec {
  return C(
    K(1, 1, [4, -12], [0, -12], [6, 12], [-1, 13], { tw: 1, ...x }),
    K(0, 0, [r, h], [-r, h], [13, 5], [-12, 7], { bob: -0.5, ...x }),
    K(0, 0, [8, -10], [-6, -10], [8, 8], [-6, 10]),
  );
}
/** Neutral air as a flying knee / sex kick: the front leg shot out straight, the back one tucked, arms back. */
function nairKick(reach = 16, lift = 10): PoseSpec {
  return C(
    K(-1, 1, [6, -12], [-2, -10], [6, 13], [-2, 12]),
    K(-4, 0, [-2, -14], [-8, -10], [reach, lift], [-3, 13], { tw: -1 }),
    K(-2, 0, [2, -12], [-4, -10], [reach * 0.55, lift + 3], [-3, 12]),
  );
}
/** Forward air with an arm / weapon (or both arms): wound high behind, swung through, the legs kicking back to counter it. */
function fairArm(from: V2, to: V2, x: Extra = {}, hand: 'front' | 'back' | 'both' = 'front'): PoseSpec {
  const rec: V2 = [to[0] * 0.55, to[1] * 0.5];
  const pair = (p: V2, guard: V2): [V2, V2] => (hand === 'back' ? [guard, p] : hand === 'both' ? [p, [p[0] - 4, p[1] + 2]] : [p, guard]);
  const [a1, a2] = pair(from, hand === 'back' ? [6, -8] : [-4, -8]);
  const [b1, b2] = pair(to, hand === 'back' ? [10, -4] : [-8, -4]);
  const [c1, c2] = pair(rec, hand === 'back' ? [6, -6] : [-4, -6]);
  return C(K(-4, 0, a1, a2, [5, 13], [0, 14], { tw: 1.5, ...x }), K(6, 0, b1, b2, [1, 6], [-10, 11], { tw: -1, ...x }), K(2, 0, c1, c2, [6, 10], [-4, 12]));
}
/** Forward air as a kick: knee chambered, the leg snapped out at hitbox height, the other leg tucked. */
function fairKick(reach = 20, lift = 22): PoseSpec {
  return C(
    K(-1, 0, [-4, -16], [6, -14], [5, lift], [0, 14]),
    K(-7, 0, [-8, -12], [-1, -18], [reach, lift], [0, 15], { tw: -1, hx: -0.5 }),
    K(-3, 0, [0, -12], [2, -12], [10, lift], [0, 14]),
  );
}
/** Back air as a back kick: turned away, the back leg driven straight out behind at hip height. */
function bairKick(reach = 20, lift = 20): PoseSpec {
  return C(
    K(2, 0, [6, -12], [2, -12], [3, 14], [-1, lift], { tw: 1 }),
    K(9, 0, [12, -14], [6, -16], [3, 15], [-reach, lift], { tw: 2, hx: -1 }),
    K(4, 0, [8, -12], [4, -12], [3, 14], [-reach * 0.5, lift]),
  );
}
/** Back air with the back arm / weapon: the chest turns away and the far arm swings out behind. */
function bairArm(reach = 18, h = -10, x: Extra = {}): PoseSpec {
  return C(
    K(-2, 0, [4, -10], [8, -14], [5, 13], [0, 14], { tw: 1.5, ...x }),
    K(7, 0, [10, -10], [-reach, h], [5, 12], [-8, 9], { tw: -3, hx: -1, ...x }),
    K(4, 0, [8, -8], [-reach * 0.5, h * 0.6], [6, 11], [-5, 11], { tw: -1 }),
  );
}
/** Back air with a long weapon in the front hand: pulled in to the chest so the weapon (aimed back) sweeps out behind. */
function bairWeapon(aim: [number, number, number], x: Extra = {}): PoseSpec {
  return C(
    K(-2, 0, [8, -12], [-4, -10], [5, 13], [0, 14], { tw: 1, aim: aim[0], ...x }),
    K(7, 0, [-2, -12], [8, -12], [5, 12], [-8, 9], { tw: -2.5, hx: -1, aim: aim[1], ...x }),
    K(4, 0, [2, -10], [6, -10], [6, 11], [-5, 11], { tw: -1, aim: aim[2] }),
  );
}
/** Up air with an arm / weapon: balled up, then stretched long with the strike overhead and the legs hanging. */
function uairArm(reach = 4, h = -40, both = false, x: Extra = {}): PoseSpec {
  return C(
    K(1, 2, [4, 2], [-2, 2], [5, 13], [0, 14], { ...x }),
    K(-3, 0, [reach, h], both ? [-reach - 2, h + 4] : [-8, -6], [3, 3], [-5, 6], { bob: -1, hy: -1, ...x }),
    K(-1, 0, [reach, h * 0.6], both ? [-reach, h * 0.55] : [-6, -6], [5, 7], [-4, 9]),
  );
}
/** Up air as a bicycle / flip kick: the front foot whipped up overhead, the back arched, the other leg tucked. */
function uairKick(lift = 42): PoseSpec {
  return C(
    K(1, 1, [6, -6], [-4, -6], [6, 13], [-2, 12]),
    K(-12, 0, [8, 4], [-8, 2], [12, lift], [0, 14], { hy: 1 }),
    K(-5, 0, [6, -2], [-6, -2], [10, lift * 0.7], [0, 14]),
  );
}
/** Down air as a stomp: knees pulled up, then both legs driven straight down with the arms flung up. */
function dairStomp(): PoseSpec {
  return C(
    K(0, 0, [8, -22], [-6, -22], [6, 16], [-3, 15], { bob: 1 }),
    K(0, 0, [12, -30], [-10, -30], [2, -2], [-3, 0], { bob: -1.5, hy: 1 }),
    K(0, 0, [8, -18], [-6, -18], [4, 5], [-4, 8]),
  );
}
/** Down air with an arm / weapon: raised overhead, then driven straight down past the tucked-up legs. */
function dairSlam(from: V2 = [2, -30], depth = 20, x: Extra = {}, both = false): PoseSpec {
  return C(
    K(-1, 0, from, both ? [from[0] - 4, from[1] + 2] : [-6, -10], [6, 10], [-3, 12], { ...x }),
    K(3, 0, [5, depth], both ? [1, depth - 2] : [-8, -14], [7, 15], [-3, 14], { hy: 1.5, ...x }),
    K(1, 0, [5, depth * 0.5], both ? [1, depth * 0.4] : [-6, -10], [6, 10], [-3, 12]),
  );
}


// ---- ground shapes (heavies: the body does the work, since short arms under big shoulders barely show) ---------------

/** A quick lead jab: guard up, the front fist snapped straight out with a small step, back to guard. */
const jabLead = (reach = 16, h = -12): PoseSpec => C(K(-2, 1, [-2, -10], [-4, -6], [5, 0], [-5, 0]), K(4, 2, [reach, h], [-2, -10], [8, 0], [-6, 0], { tw: -1.5 }), K(1, 1, [6, -10], [-4, -8], [6, 0], [-5, 0]));
/** A rear cross: the chest turns square as the back fist drives through, the weight onto the front foot. */
const jabCross = (reach = 18, h = -12): PoseSpec => C(K(1, 1, [8, -10], [-6, -6], [6, 0], [-6, 0], { tw: 1 }), K(6, 3, [2, -8], [reach, h], [10, 0], [-7, 0], { tw: 3 }), K(2, 2, [4, -10], [6, -10], [7, 0], [-6, 0], { tw: 1 }));
/** A two-fisted shove from a low crouch, the whole body lunging behind it. */
const shove = (reach = 18, h = -8): PoseSpec => C(K(-4, 4, [-4, -4], [-6, -4], [6, 0], [-8, 0], { tw: -1 }), K(9, 5, [reach, h], [reach - 4, h + 2], [14, 0], [-10, 0]), K(3, 3, [8, -6], [4, -6], [9, 0], [-8, 0]));
/** A horizontal hook: the fist wound out wide behind, slung round at head height with the shoulders turning through. */
const hookArc = (reach = 18, h = -16): PoseSpec => C(K(-6, 3, [-12, -10], [4, -12], [8, 0], [-8, 0], { tw: 2.5 }), K(6, 3, [reach, h], [-6, -8], [11, 0], [-9, 0], { tw: -2.5 }), K(2, 2, [8, -8], [-2, -8], [8, 0], [-7, 0]));
/** A smash haymaker: a huge coil (leaning back, fist far behind), then the full-body lunge through. */
const haymaker = (reach = 22, h = -14): PoseSpec => C(K(-9, 5, [-18, -14], [6, -14], [9, 0], [-10, 0], { tw: 3.5, hx: -1 }), K(10, 5, [reach, h], [-10, -6], [15, 0], [-11, 0], { tw: -3 }), K(4, 3, [12, -8], [-6, -6], [11, 0], [-9, 0], { tw: -1 }));
/** A shoulder charge: tucked behind the lead shoulder, then the whole body thrown forward through it. */
const shoulderCharge = (): PoseSpec => C(K(-6, 6, [2, -10], [-4, -8], [9, 0], [-10, 0], { tw: -2 }), K(12, 4, [10, -14], [6, -12], [16, 0], [-13, 0], { tw: 2.5, hx: 1 }), K(5, 3, [6, -10], [2, -8], [10, 0], [-8, 0]));
/** A long rocket punch: coiled low, then the fist driven out at full stretch with a deep lunge. */
const lungePunch = (reach = 24, h = -12): PoseSpec => C(K(-7, 4, [-10, -10], [4, -10], [10, 0], [-10, 0], { tw: 2 }), K(12, 3, [reach, h], [-8, -8], [17, 0], [-14, 0], { tw: -3 }), K(5, 2, [12, -10], [-4, -8], [11, 0], [-9, 0]));
/** A rising back-hand arc overhead (anti-air): dipped low, then the far arm swept up past the head. */
const upSweep = (h = -40): PoseSpec => C(K(2, 5, [4, -6], [8, 2], [7, 0], [-7, 0]), K(-4, 0, [2, -12], [6, h], [5, 0], [-5, 0], { tw: 2, hy: -1 }), K(-1, 1, [3, -8], [4, h * 0.6], [5, 0], [-5, 0]));
/** A low leg sweep along the floor from a deep crouch. */
const legSweep = (reach = 24): PoseSpec => C(K(-2, 8, [4, -6], [-6, -4], [8, 0], [-8, 0]), K(4, 11, [0, -4], [-10, -2], [reach, 1], [-9, 0], { tw: -1 }), K(1, 7, [4, -4], [-6, -2], [13, 0], [-8, 0]));
/** A one-fist ground slam from overhead into the floor in front. */
const groundSlam = (): PoseSpec => C(K(-4, 0, [2, -36], [-2, -34], [6, 0], [-6, 0], { hy: -1 }), K(9, 9, [16, 14], [8, 10], [12, 0], [-9, 0]), K(4, 6, [10, 8], [4, 6], [9, 0], [-7, 0]));
/** Both fists slammed down to either side at once. */
const splitSlam = (): PoseSpec => C(K(0, 2, [6, -34], [-6, -34], [6, 0], [-6, 0], { hy: -1 }), K(0, 10, [14, 12], [-14, 12], [11, 0], [-11, 0], { hy: 1 }), K(0, 6, [8, 6], [-8, 6], [8, 0], [-8, 0]));

// ---- the book -------------------------------------------------------------------------------------------------------

type Entry = PoseSpec | ((own: PoseSpec | undefined) => PoseSpec);
export const POSE_BOOK: Record<string, Record<string, Entry>> = {
  brick: {
    jab1: jabLead(16, -12),
    jab2: jabCross(18, -12),
    jab3: shove(18, -8),
    ftilt: hookArc(18, -16),
    utilt: upSweep(-40),
    dtilt: legSweep(24),
    fsmash: haymaker(22, -14),
    neutralB: shoulderCharge(),
    sideB: lungePunch(24, -12),
    nair: nairStar(14, -10),
    fair: fairArm([0, -36], [16, 10], {}, 'both'),
    bair: bairArm(18, -10),
    uair: uairArm(8, -42),
    dair: dairStomp(),
  },
  vex: {
    neutralB: C(K(-4, 2, [-14, -20], [4, -8], [6, 0], [-6, 0], { tw: 2 }), K(6, 2, [22, -18], [-6, -6], [10, 0], [-7, 0], { tw: -2 }), K(2, 1, [10, -8], [-4, -6], [7, 0], [-6, 0])),
    sideB: C(K(-6, 4, [-14, -10], [6, -10], [8, 0], [-8, 0], { tw: 2 }), K(14, 6, [26, 0], [-14, -8], [18, 0], [-16, 2], { tw: -2 }), K(5, 4, [12, -2], [-8, -6], [11, 0], [-10, 0])),
    usmash: C(K(-1, 7, [6, 6], [-2, 6], [7, 0], [-7, 0]), K(-3, 0, [4, -44], [-4, -42], [4, 0], [-4, 0], { hy: -1 }), K(-1, 1, [6, -26], [-4, -24], [5, 0], [-5, 0])),
    nair: nairStar(16, -10),
    fair: fairArm([-10, -28], [19, 10]),
    bair: bairKick(20),
    uair: uairArm(6, -42),
    dair: dairStomp(),
  },
  nova: {
    nair: nairStar(15, -10),
    fair: fairArm([-10, -26], [21, 6]),
    bair: bairWeapon([-60, 178, -120]),
    uair: uairArm(6, -44),
    dair: dairSlam([2, -32], 18),
  },
  gizmo: {
    dashAttack: C(K(-4, 4, [-6, -6], [4, -8], [8, 0], [-8, 0]), K(12, 6, [20, 2], [8, -4], [14, 0], [-12, 3]), K(4, 3, [10, -2], [4, -4], [9, 0], [-8, 0])),
    usmash: C(K(-1, 8, [4, 4], [-2, 4], [7, 0], [-7, 0]), K(-2, 0, [2, -44], [-4, -42], [4, 0], [-4, 0], { hy: -1 }), K(-1, 1, [2, -28], [-3, -26], [5, 0], [-5, 0])),
    neutralB: C(K(-4, 3, [-8, -16], [4, -8], [5, 0], [-5, 0], { tw: 2 }), K(4, 2, [18, -14], [-6, -6], [8, 0], [-6, 0], { tw: -2 }), K(1, 1, [8, -6], [-4, -4], [6, 0], [-5, 0])),
    nair: nairStar(12, -8),
    fair: fairArm([-6, -6], [22, -8]),
    bair: bairKick(18),
    uair: uairArm(4, -40),
    dair: dairSlam([2, -30], 16),
  },
  agni: {
    jab3: C(K(-2, 2, [4, -12], [-2, -10], [6, 0], [-6, 0]), K(3, 1, [-4, -16], [8, -14], [9, 16], [-6, 0], { tw: 1 }), K(1, 1, [2, -10], [-2, -8], [8, 4], [-6, 0])),
    upB_0: C(K(-2, 8, [4, 4], [-2, 4], [6, 0], [-6, 0]), K(-3, 0, [4, -46], [-2, -42], [6, 10], [0, 12], { hy: -1 }), K(-1, 0, [4, -30], [-2, -28], [5, 8], [-1, 10])),
    fair: fairKick(24),
    bair: bairKick(22),
    uair: uairKick(44),
  },
  halcyon: {
    jab2: C(K(-3, 2, [-2, -2], [-2, 0], [4, 0], [-4, 0], { aim: 10 }), K(4, 4, [19, 2], [-2, 0], [9, 0], [-7, 0], { aim: 16 }), K(0, 2, [8, -2], [-2, 0], [5, 0], [-4, 0], { aim: 10 })),
    sideB: C(K(-8, 4, [-10, -10], [-2, 0], [10, 0], [-10, 0], { aim: -6, wing: 0.6 }), K(13, 2, [26, -8], [-2, 0], [12, 7], [-14, 9], { aim: 0, wing: 1 }), K(3, 1, [10, -6], [-2, 0], [6, 2], [-6, 2], { aim: -10, wing: 0.5 })),
    nair: nairStar(14, -12),
    fair: fairArm([-6, -14], [22, -8]),
    bair: bairWeapon([-100, 172, -150]),
    uair: uairArm(4, -36),
    dair: dairSlam([2, -12], 14),
  },
  riptide: {
    jab1: jabLead(15, -10),
    jab2: jabCross(17, -10),
    neutralB: shove(18, -12),
    nair: nairStar(20, -10),
    fair: fairArm([-6, -30], [22, 8]),
    bair: bairKick(22),
    uair: uairArm(4, -40, true),
    dair: dairStomp(),
  },
  obelisk: {
    jab1: jabLead(16, -12),
    jab2: jabCross(18, -12),
    jab3: shove(20, -10),
    ftilt: hookArc(20, -14),
    dtilt: legSweep(24),
    fsmash: haymaker(28, -12),
    dsmash: splitSlam(),
    neutralB: groundSlam(),
    sideB: shoulderCharge(),
    nair: nairStar(18, -8),
    fair: fairArm([-4, -34], [20, 10], {}, 'both'),
    bair: bairArm(22, -12),
    uair: uairArm(4, -42, true),
    dair: dairStomp(),
  },
  rime: {
    dashAttack: C(K(-2, 6, [4, -8], [-4, -6], [8, 0], [-8, 0]), K(-6, 9, [-6, -6], [-10, -2], [24, 4], [-6, 10], { tw: -1 }), K(-2, 6, [0, -6], [-6, -4], [14, 2], [-6, 6])),
    sideB: C(K(-6, 4, [-14, -10], [6, -10], [8, 0], [-8, 0], { tw: 2 }), K(14, 6, [26, 2], [-14, -8], [18, 0], [-16, 3], { tw: -2 }), K(5, 4, [12, -2], [-8, -6], [11, 0], [-10, 0])),
    counterStrike: C(K(-4, 2, [6, -26], [-4, -10], [5, 0], [-6, 0], { tw: 1 }), K(10, 4, [26, -12], [-10, -10], [14, 0], [-12, 0], { tw: -2 }), K(3, 2, [12, -8], [-6, -6], [9, 0], [-8, 0])),
    ultimate: C(K(-6, 2, [-6, -40], [-10, -34], [6, 0], [-7, 0], { hy: -1 }), K(10, 6, [24, 8], [16, 6], [14, 0], [-12, 0], { hy: 1 }), K(4, 4, [14, 4], [8, 2], [10, 0], [-9, 0])),
    nair: nairKick(17, 10),
    fair: fairArm([-4, -30], [22, 4]),
    bair: bairKick(20),
    uair: uairArm(6, -38, true),
    dair: dairStomp(),
  },
  havoc: {
    // the ultimate: braced, one arm flung up pointing the strike in, the other hand at the radio by the ear
    ultimate: C(K(0, 3, [4, -12], [-2, -20], [6, 0], [-6, 0], { hx: 0.5 }), K(-4, 2, [18, -34], [0, -24], [9, 0], [-8, 0], { tw: -1, hy: -1 }), K(-2, 1, [14, -30], [0, -22], [8, 0], [-7, 0])),
    detonateC4: C(K(0, 1, [6, -12], [0, -8], [6, 0], [-6, 0]), K(4, 4, [15, -16], [2, -10], [9, 0], [-7, 0], { hy: 0.5 }), K(2, 2, [10, -14], [0, -8], [7, 0], [-6, 0])),
    jab1: jabLead(15, -12),
    jab2: jabCross(16, -12),
    ftilt: C(K(-5, 3, [-6, -14], [-10, -12], [8, 0], [-9, 0], { tw: 2 }), K(8, 3, [20, -14], [14, -12], [12, 0], [-10, 0], { tw: -1 }), K(3, 2, [10, -10], [6, -10], [8, 0], [-7, 0])),
    dashAttack: shoulderCharge(),
    fsmash: C(K(2, 6, [10, -16], [4, -16], [10, 0], [-11, 0]), K(-8, 5, [14, -18], [8, -17], [11, 0], [-12, 0], { hx: -1.5, tw: 1 }), K(-3, 4, [12, -16], [6, -15], [9, 0], [-10, 0])),
    nair: nairStar(16, -10),
    fair: fairKick(18),
    bair: bairKick(20),
    uair: uairKick(40),
    dair: dairStomp(),
  },
};

/** The pose to draw for `moveId` of fighter `charId`, or undefined to keep the move's own. */
export function bookPose(charId: string, moveId: string, own: PoseSpec | undefined): PoseSpec | undefined {
  const e = POSE_BOOK[charId]?.[moveId];
  if (!e) return undefined;
  return typeof e === 'function' ? e(own) : withTracks(e, own);
}
