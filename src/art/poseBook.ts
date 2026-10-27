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
/** A shoulder charge: tucked behind the lead shoulder, then the whole body thrown forward through it. */
const shoulderCharge = (): PoseSpec => C(K(-6, 6, [2, -10], [-4, -8], [9, 0], [-10, 0], { tw: -2 }), K(12, 4, [10, -14], [6, -12], [16, 0], [-13, 0], { tw: 2.5, hx: 1 }), K(5, 3, [6, -10], [2, -8], [10, 0], [-8, 0]));
/** A low leg sweep along the floor from a deep crouch. */
const legSweep = (reach = 24): PoseSpec => C(K(-2, 8, [4, -6], [-6, -4], [8, 0], [-8, 0]), K(4, 11, [0, -4], [-10, -2], [reach, 1], [-9, 0], { tw: -1 }), K(1, 7, [4, -4], [-6, -2], [13, 0], [-8, 0]));
/** A one-fist ground slam from overhead into the floor in front. */
const groundSlam = (): PoseSpec => C(K(-4, 0, [2, -36], [-2, -34], [6, 0], [-6, 0], { hy: -1 }), K(9, 9, [16, 14], [8, 10], [12, 0], [-9, 0]), K(4, 6, [10, 8], [4, 6], [9, 0], [-7, 0]));
/** Both fists slammed down to either side at once. */
const splitSlam = (): PoseSpec => C(K(0, 2, [6, -34], [-6, -34], [6, 0], [-6, 0], { hy: -1 }), K(0, 10, [14, 12], [-14, 12], [11, 0], [-11, 0], { hy: 1 }), K(0, 6, [8, 6], [-8, 6], [8, 0], [-8, 0]));

// ---- throws (the shared template barely moved the arms: these heave the whole body the throw's way) ------------------

/**
 * Four throws from the grab's two-fisted hold. `bx` brings the back hand forward to meet the front one (wide-shouldered
 * builds need more), `up` how high a heave goes, `lean` how far the body throws itself into it, `r` how far the hands fling.
 */
function throwSet(bx = 4, up = -40, lean = 10, r = 1): Record<'fthrow' | 'bthrow' | 'uthrow' | 'dthrow', PoseSpec> {
  const L = lean;
  return {
    // pulled in tight to the chest, then shoved out at full stretch off the front foot
    fthrow: C(K(-4, 3, [6, -12], [4 + bx, -12], [6, 0], [-7, 0], { tw: 1.5 }), K(L, 4, [24 * r, -18], [20 * r + bx, -16], [13, 0], [-10, 0], { tw: -1.5, hx: 1 }), K(Math.round(L * 0.4), 2, [14, -12], [10 + bx, -10], [8, 0], [-7, 0])),
    // hoisted, then the body wrenches round and both hands fling the foe out behind
    bthrow: C(K(2, 2, [12, -18], [8 + bx, -16], [6, 0], [-6, 0], { tw: -1 }), K(-L, 3, [-14 * r, -22], [-20 * r, -18], [2, 0], [-12, 0], { tw: 3.5, hx: -1.5 }), K(-Math.round(L * 0.4), 2, [-4, -12], [-8, -10], [5, 0], [-7, 0], { tw: 1.5 })),
    // sunk low under the foe, then heaved straight up overhead with the whole body rising behind it
    uthrow: C(K(2, 7, [12, -4], [8 + bx, -2], [7, 0], [-7, 0], { hy: 0.5 }), K(-3, 0, [6, up], [2 + bx, up + 2], [5, 2], [-5, 3], { bob: -1.5, hy: -1.5 }), K(-1, 1, [6, up * 0.55], [2 + bx, up * 0.5], [5, 0], [-5, 0])),
    // lifted high, then driven down into the floor in front from a deep crouch
    dthrow: C(K(-3, 0, [6, up * 0.75], [2 + bx, up * 0.7], [5, 0], [-6, 0], { hy: -1, bob: -1 }), K(Math.round(L * 0.7), 10, [18, 14], [14 + bx, 14], [11, 0], [-10, 0], { hy: 1.5 }), K(Math.round(L * 0.3), 6, [12, 6], [8 + bx, 6], [8, 0], [-8, 0])),
  };
}

/** Agni's spin kick (every charge level draws the same row): chambered and turned away, the leg whipped round high. */
const AGNI_SPIN = C(K(-4, 3, [-6, -16], [8, -16], [5, 4], [-8, 0], { tw: 2.5, hx: -0.5 }), K(-7, 0, [-10, -18], [2, -18], [24, 22], [-6, 0], { tw: -2, hx: -1 }), K(-2, 1, [-4, -12], [4, -12], [10, 6], [-6, 0]));
const spinKick = { sideB_0: AGNI_SPIN, sideB_1: AGNI_SPIN, sideB_2: AGNI_SPIN, sideB_3: AGNI_SPIN };

// ---- the book -------------------------------------------------------------------------------------------------------

/**
 * The Overseer's strikes. Its arms are twice a fighter's length, so hand offsets (measured from the resting hang, then
 * scaled 1.15 by the boss drawer) must climb ~35 just to bring a claw level with the shoulder: the moves' own keys left
 * every jab, tilt and smash drooping at the hip. These reach the hitboxes: level thrusts, claws flung out behind for the
 * back air, raked down past the tucked legs for the down air, slammed out to both sides for the down smash.
 */
const OV_W = (w: number): Extra => ({ wing: w });
const overseerStrikes = {
  jab1: C(K(-3, 2, [-4, -26], [-8, -6], [8, 0], [-10, 0], OV_W(0)), K(6, 3, [44, -36], [-10, -4], [14, 0], [-11, 0], { wing: 0.15, tw: -1 }), K(2, 2, [26, -24], [-6, -4], [10, 0], [-10, 0], OV_W(0))),
  ftilt: C(K(-6, 4, [-10, -14], [-4, -8], [8, 0], [-12, 0], OV_W(0)), K(8, 6, [44, -26], [-14, -10], [20, 0], [-14, 0], { wing: 0.2, tw: -1 }), K(4, 4, [28, -16], [-8, -6], [14, 0], [-12, 0], OV_W(0))),
  fsmash: C(K(-9, 0, [-8, -64], [2, -60], [6, 0], [-12, 0], { wing: 0.3, hy: -1 }), K(12, 9, [44, -28], [42, -16], [22, 0], [-14, 0], { wing: 0.6, tw: 1.5, hx: 1 }), K(8, 7, [30, -16], [26, -8], [18, 0], [-12, 0], OV_W(0.15))),
  dsmash: C(K(0, 0, [6, -58], [-6, -58], [8, 6], [-8, 0], { wing: 0.25, hy: -1 }), K(2, 14, [30, 0], [-32, 2], [16, 0], [-16, 0], { wing: 0.6, hy: 1 }), K(0, 10, [20, -4], [-20, -2], [14, 0], [-14, 0], OV_W(0))),
  nair: C(K(-2, 4, [-4, -28], [6, -32], [8, 6], [-8, 4], OV_W(0)), K(0, 2, [44, -32], [-44, -28], [10, 8], [-10, 8], { wing: 0.3, tw: 3 }), K(0, 2, [22, -18], [-22, -16], [8, 6], [-8, 4], OV_W(0))),
};
const overseerVersusStrikes = {
  ...overseerStrikes,
  jab2: C(K(-4, 3, [-6, -10], [-10, -28], [8, 0], [-10, 0], { tw: -1, wing: 0 }), K(6, 4, [10, -14], [50, -30], [16, 0], [-12, 0], { wing: 0.2, tw: 2.5 }), K(3, 3, [8, -10], [30, -20], [12, 0], [-10, 0], { tw: 1, wing: 0 })),
  dtilt: C(K(4, 12, [6, 4], [-8, 2], [10, 0], [-12, 0], OV_W(0)), K(10, 20, [44, -4], [-12, 4], [20, 0], [-14, 0], { wing: 0.15, hy: 1 }), K(5, 14, [26, -2], [-8, 4], [14, 0], [-12, 0], OV_W(0))),
  dashAttack: C(K(-4, 4, [-8, -10], [-14, -8], [10, 0], [-12, 0], OV_W(0)), K(12, 6, [44, -30], [40, -20], [22, 0], [-16, 4], { wing: 0.3, tw: 1, hx: 1 }), K(6, 4, [26, -18], [20, -10], [14, 0], [-12, 0], OV_W(0))),
  bair: C(K(4, 2, [6, -14], [8, -12], [6, 6], [-4, 8], { tw: -2, wing: 0 }), K(6, 2, [10, -18], [-46, -28], [8, 6], [-8, 8], { wing: 0.15, tw: 3, hx: -1 }), K(2, 2, [6, -14], [-28, -18], [6, 6], [-6, 8], OV_W(0))),
  dair: C(K(0, 6, [14, -34], [-14, -34], [6, 8], [-6, 10], { wing: 0, hy: -1 }), K(0, 0, [8, 26], [2, 26], [8, 16], [-6, 14], { wing: 0.2, hy: 1.5 }), K(0, 2, [10, 6], [-4, 6], [6, 10], [-5, 10], OV_W(0))),
  // the eye beam: reared back with both claws raised to frame the eye as it charges, then the head thrust forward and the
  // arms flung back by the recoil as it fires
  sideB: C(K(-8, 4, [6, -50], [-4, -48], [12, 0], [-14, 0], { wing: 0.6, hx: -1, hy: -0.5, tw: 1 }), K(9, 8, [-14, -30], [-26, -24], [18, 0], [-16, 0], { wing: 1, hx: 2, hy: 0.5 }), K(2, 4, [8, -22], [-8, -16], [12, 0], [-12, 0], { wing: 0.4 })),
  // the orb volley: both claws gathered high overhead, then thrust out together at the shoulder line the orbs leave from
  neutralB: C(K(-5, 2, [8, -62], [-2, -64], [8, 0], [-10, 0], { wing: 0.5, hy: -1 }), K(8, 4, [46, -38], [40, -30], [14, 0], [-12, 0], { wing: 1, tw: 1, hx: 1 }), K(3, 2, [28, -28], [22, -22], [10, 0], [-10, 0], { wing: 0.35 })),
  // cast out: the victim hauled in to the chest, then flung out at full stretch, the free claw swept back for balance
  fthrow: C(K(-3, 2, [26, -34], [20, -30], [8, 0], [-10, 0], { tw: 1 }), K(10, 4, [50, -40], [-22, -30], [16, 0], [-12, 0], { wing: 0.4, tw: -1.5, hx: 1 }), K(4, 2, [30, -26], [-10, -16], [12, 0], [-10, 0])),
};

type Entry = PoseSpec | ((own: PoseSpec | undefined) => PoseSpec);
export const POSE_BOOK: Record<string, Record<string, Entry>> = {
  overseer: overseerStrikes,
  'overseer-versus': overseerVersusStrikes,
  brick: {
    // Brick's arms are short under huge pauldrons, so every move is built on a different big shape: the fists ride out on
    // forearm pistons (hero/brick.ts) past what the bones reach, the rear cross comes across in front of the chest, and the
    // chunky body squashes, stretches and tips with the strike (Pose.flex).
    // jab 1: a lead piston jab at head height, the near shoulder driving through it, the rear fist up at the chin
    jab1: C(K(-3, 2, [2, -16], [8, -22], [5, 0], [-6, 0], { tw: 1 }), K(7, 2, [26, -20], [10, -24], [10, 0], [-7, 0], { tw: -2.5, hx: 1 }), K(2, 2, [10, -16], [8, -22], [7, 0], [-6, 0])),
    // jab 2: the rear cross: the chest turns square and the far fist rams across the front at head height
    jab2: C(K(2, 2, [8, -18], [-6, -10], [7, 0], [-6, 0], { tw: -1 }), K(8, 3, [-2, -14], [44, -18], [11, 0], [-8, 0], { tw: 3.5, hx: 1 }), K(3, 2, [4, -16], [20, -16], [8, 0], [-7, 0], { tw: 1.5 })),
    // jab 3: both pistons fired together, up and out at head height from a dip, the whole body rising behind them
    jab3: C(K(-4, 6, [-4, 2], [0, 4], [6, 0], [-9, 0], { tw: 1 }), K(8, 1, [24, -28], [36, -30], [13, 0], [-11, 0], { tw: 2, hx: 1, hy: -1 }), K(4, 3, [12, -14], [16, -14], [10, 0], [-9, 0], { tw: 1 })),
    // ftilt: a wide hook at chest height swung round from far behind, the shoulders turning right through it
    ftilt: C(K(-8, 3, [-18, -10], [8, -18], [8, 0], [-9, 0], { tw: 3 }), K(9, 4, [27, -12], [-12, -6], [13, 0], [-10, 0], { tw: -3, hx: 1 }), K(3, 3, [12, -8], [-4, -10], [9, 0], [-8, 0], { tw: -1 })),
    // utilt: a rising piston uppercut, the fist driven straight up past the helm, leaning back off it
    utilt: C(K(3, 6, [8, 8], [6, -16], [6, 0], [-7, 0], { tw: 1 }), K(-5, 0, [8, -54], [-10, -4], [6, 0], [-6, 0], { tw: -1, hy: -1 }), K(-2, 1, [6, -30], [-6, -8], [5, 0], [-5, 0])),
    // dtilt: crouched right down, a low piston jab skimming the floor at shin height
    dtilt: C(K(-2, 9, [-2, 4], [6, -14], [9, 0], [-9, 0], { tw: 1 }), K(8, 12, [28, 18], [4, -24], [14, 0], [-11, 0], { tw: -2, hy: 1 }), K(3, 9, [12, 10], [6, -10], [10, 0], [-9, 0])),
    // dash attack: head down behind the lead pauldron, both fists tucked, the stacks firing as he barrels through
    dashAttack: C(K(-6, 7, [4, -14], [6, -16], [9, 0], [-11, 0], { tw: -2, hy: 1 }), K(15, 6, [16, -18], [20, -16], [18, 0], [-17, 6], { tw: -2.5, hx: 2, hy: 1.5 }), K(6, 4, [10, -14], [10, -14], [11, 0], [-9, 0])),
    // fsmash: a two-fisted hammer: both fists hauled high up behind the head, then brought down into the floor in front
    fsmash: C(K(-11, 0, [-10, -48], [-14, -44], [9, 0], [-10, 0], { tw: 1, hy: -1.5, bob: -1 }), K(13, 6, [27, 0], [40, 4], [17, 0], [-13, 0], { tw: 2, hx: 2, hy: 1.5 }), K(6, 6, [16, 6], [24, 8], [12, 0], [-10, 0], { tw: 1 })),
    // usmash: coiled right down with both fists by the floor, then the whole body launched upward, both fists overhead
    usmash: C(K(1, 10, [6, 12], [10, 12], [8, 0], [-8, 0], { hy: 1 }), K(-2, 0, [4, -54], [12, -54], [4, 6], [-5, 9], { bob: -3, hy: -1.5 }), K(-1, 1, [4, -32], [8, -32], [5, 0], [-5, 0], { bob: -1 })),
    // dsmash: up on the toes with both fists high, then a ground pound: one fist into the floor each side of him
    dsmash: C(K(0, 0, [6, -50], [-4, -50], [5, 0], [-5, 0], { bob: -2, hy: -1 }), K(1, 12, [24, 22], [-24, 22], [12, 0], [-12, 0], { hy: 2 }), K(0, 8, [14, 14], [-14, 14], [10, 0], [-10, 0])),
    neutralB: shoulderCharge(),
    // the grapple lunge: dropped low, then thrown forward at full stretch with both hands open to seize
    sideB: C(K(-6, 7, [-2, -8], [6, -10], [8, 0], [-10, 0], { tw: 1.5, hy: 0.5 }), K(14, 4, [28, -16], [40, -14], [18, 0], [-15, 3], { tw: 1, hx: 2 }), K(6, 3, [16, -12], [24, -10], [12, 0], [-9, 0])),
    // the grapple slam: the caught foe hauled up over the helm and smashed into the floor far out in front
    slam: C(K(-9, 0, [-6, -46], [6, -48], [7, 0], [-9, 0], { tw: 1, hy: -1.5, bob: -1 }), K(13, 11, [28, 18], [40, 20], [17, 0], [-13, 0], { tw: 1.5, hx: 2, hy: 2 }), K(6, 7, [18, 10], [26, 12], [12, 0], [-10, 0])),
    // the whirling jet: tucked behind the pauldrons, then both pistons flung out level as a spinning lariat, feet off the floor
    upB: C(K(0, 7, [4, -10], [14, -12], [7, 0], [-7, 0], { tw: 2 }), K(0, 0, [30, -20], [-30, -20], [6, 7], [-6, 9], { tw: -2.5, bob: -2, hy: -0.5 }), K(0, 1, [20, -16], [-20, -16], [6, 4], [-6, 5], { tw: -1, bob: -1 })),
    ...throwSet(14, -52, 12, 1.5),
    nair: nairStar(16, -10),
    // fair: an airborne hammer, both fists hauled up together over the helm and clubbed down in front
    fair: C(K(-5, 0, [-2, -44], [12, -46], [5, 13], [0, 14], { tw: 1.5, hy: -1 }), K(8, 0, [24, 10], [36, 12], [1, 6], [-10, 11], { tw: -1, hx: 1.5, hy: 1 }), K(3, 0, [14, 4], [24, 6], [6, 10], [-4, 12])),
    // bair: the rear piston rammed straight out behind
    bair: C(K(-2, 0, [6, -14], [6, -16], [5, 12], [0, 14], { tw: 1.5 }), K(8, 0, [10, -12], [-26, -14], [6, 10], [-6, 9], { tw: -3, hx: -1.5 }), K(4, 0, [8, -10], [-12, -10], [6, 10], [-4, 11], { tw: -1 })),
    // uair: both pistons punched straight up
    uair: uairArm(6, -54, true),
    // dair: the crater stomp: balled up with both fists overhead, then fists and boots driven straight down together
    dair: C(K(0, 0, [8, -36], [18, -36], [6, 16], [-3, 15], { bob: 1.5, hy: -0.5 }), K(2, 0, [10, 16], [22, 16], [4, -2], [-4, 0], { bob: -1.5, hy: 1.5 }), K(1, 0, [8, 6], [18, 6], [5, 5], [-4, 8])),
  },
  vex: {
    // the second slash comes back the other way, rising off the rear hand; the dash attack is a long low slide
    jab2: C(K(-2, 1, [4, -6], [-8, -2], [5, 0], [-5, 0], { tw: 1 }), K(5, 3, [-2, -6], [18, -14], [8, 0], [-6, 0], { tw: 2.5 }), K(2, 2, [2, -6], [8, -10], [6, 0], [-5, 0])),
    dashAttack: C(K(-4, 4, [-8, -6], [6, -8], [8, 0], [-8, 0], { tw: 1.5 }), K(10, 8, [24, -2], [-12, -6], [20, 0], [-14, 2], { tw: -2 }), K(4, 6, [12, 0], [-8, -4], [13, 0], [-10, 0])),
    neutralB: C(K(-4, 2, [-14, -20], [4, -8], [6, 0], [-6, 0], { tw: 2 }), K(6, 2, [22, -18], [-6, -6], [10, 0], [-7, 0], { tw: -2 }), K(2, 1, [10, -8], [-4, -6], [7, 0], [-6, 0])),
    sideB: C(K(-6, 4, [-14, -10], [6, -10], [8, 0], [-8, 0], { tw: 2 }), K(14, 6, [26, 0], [-14, -8], [18, 0], [-16, 2], { tw: -2 }), K(5, 4, [12, -2], [-8, -6], [11, 0], [-10, 0])),
    usmash: C(K(-1, 7, [6, 6], [-2, 6], [7, 0], [-7, 0]), K(-3, 0, [4, -44], [-4, -42], [4, 0], [-4, 0], { hy: -1 }), K(-1, 1, [6, -26], [-4, -24], [5, 0], [-5, 0])),
    // ftilt: not another straight stab: the front blade whipped from high behind the hood across the chest on a lunge
    ftilt: C(K(-5, 3, [-12, -22], [6, -6], [7, 0], [-7, 0], { tw: 2.5, hx: -0.5 }), K(10, 5, [24, -12], [-10, -4], [14, 0], [-9, 0], { tw: -2.5, hx: 1 }), K(4, 3, [12, -6], [-6, -4], [9, 0], [-7, 0])),
    // fsmash (Double Cross): coiled low with both knives crossed up over the shoulder, then scissored out together
    fsmash: C(K(-6, 4, [-10, -26], [-2, -28], [9, 0], [-9, 0], { tw: 3, hx: -1 }), K(13, 6, [26, -8], [24, -20], [17, 0], [-14, 0], { tw: -2.5, hx: 1.5 }), K(6, 4, [14, -2], [12, -8], [12, 0], [-10, 0])),
    // the snare mine: a flick of the wrist, then dropped into a crouch to set it on the floor, the other hand by the mask
    downB: C(K(-2, 3, [2, -16], [-4, -6], [5, 0], [-5, 0], { tw: 1 }), K(6, 10, [16, 10], [-4, -22], [10, 0], [-9, 0], { tw: -1, hy: 0.5 }), K(2, 6, [8, 4], [-4, -14], [7, 0], [-7, 0])),
    ...throwSet(4, -42, 11),
    nair: nairStar(16, -10),
    fair: fairArm([-10, -28], [19, 10]),
    bair: bairKick(20),
    uair: uairArm(6, -42),
    dair: dairStomp(),
  },
  nova: {
    jab2: C(K(-2, 1, [4, -6], [-6, -4], [5, 0], [-5, 0], { tw: 1 }), K(5, 3, [16, -20], [-4, -8], [8, 0], [-6, 0], { tw: 2 }), K(2, 2, [8, -12], [-4, -6], [6, 0], [-5, 0])),
    // ftilt: a two-handed spear thrust: the staff drawn back level along the body, then driven straight out off a lunge
    ftilt: C(K(-6, 3, [-4, -12], [-8, -10], [6, 0], [-8, 0], { aim: 0, tw: 1.5 }), K(9, 4, [20, -14], [12, -12], [14, 0], [-10, 0], { aim: 0, tw: -1, hx: 1 }), K(3, 2, [10, -12], [4, -10], [8, 0], [-6, 0], { aim: 4 })),
    // the aether slide: gliding in low on the robe, staff swept up and forward, the free hand trailing the spell behind
    dashAttack: C(K(-4, 3, [-4, -16], [-2, -6], [8, 0], [-8, 0], { aim: -125 }), K(10, 9, [16, -12], [-14, -16], [22, 0], [-14, 4], { aim: -15, tw: -1, hx: 1.5 }), K(4, 5, [10, -8], [-8, -10], [12, 0], [-9, 0], { aim: 0 })),
    // the rune traps: the staff raised, then its foot driven into the floor in front where the rune is carved
    sideB_fire: C(K(-3, 1, [4, -30], [-4, -10], [5, 0], [-5, 0], { aim: -80, hy: -0.5 }), K(6, 6, [14, -14], [-6, -18], [9, 0], [-7, 0], { aim: 40, tw: -1, hy: 1 }), K(2, 3, [8, -12], [-4, -10], [6, 0], [-5, 0], { aim: 30 })),
    // ice: knelt down, the staff swept low and planted at the floor ahead, the free hand spread above it
    sideB_ice: C(K(-2, 2, [2, -12], [-2, -6], [4, 0], [-4, 0], { aim: -30 }), K(4, 10, [12, -10], [4, -16], [10, 0], [-8, 0], { aim: 30, hy: 1 }), K(2, 5, [8, -8], [0, -8], [6, 0], [-6, 0], { aim: 20 })),
    // cycle: the staff swung up and held high overhead to turn the element over, the free hand open beside the hat
    downB: C(K(0, 3, [2, -8], [-4, -6], [4, 0], [-4, 0], { aim: -55 }), K(-2, 0, [4, -30], [-10, -16], [4, 0], [-4, 0], { aim: -90, hy: -1, bob: -1 }), K(0, 1, [2, -16], [-6, -8], [4, 0], [-4, 0], { aim: -80 })),
    ...throwSet(4, -40, 9),
    // the crush: staff and foe hoisted high, then the staff's foot rammed down at the floor in front
    dthrow: C(K(-3, 0, [6, -30], [2, -28], [5, 0], [-6, 0], { aim: -70, hy: -1, bob: -1 }), K(6, 9, [16, -8], [10, -6], [11, 0], [-10, 0], { aim: 40, hy: 1.5 }), K(3, 5, [12, -8], [6, -6], [8, 0], [-8, 0], { aim: 25 })),
    nair: nairStar(15, -10),
    fair: fairArm([-10, -26], [21, 6]),
    bair: bairWeapon([-60, 178, -120]),
    uair: uairArm(6, -44),
    dair: dairSlam([2, -32], 18),
  },
  gizmo: {
    // the combo: a poke, a backhand swipe, then the wrench brought down overhead; the smash is a full wound-up swing
    jab2: C(K(-5, 2, [-10, -8], [4, -6], [6, 0], [-6, 0], { tw: 2 }), K(5, 3, [16, -16], [-4, -4], [9, 0], [-7, 0], { tw: -2 }), K(2, 2, [8, -8], [-2, -4], [7, 0], [-6, 0])),
    jab3: C(K(-6, 1, [-2, -34], [-4, -20], [6, 0], [-6, 0], { hy: -1 }), K(8, 6, [18, 10], [10, 6], [11, 0], [-8, 0], { hy: 1 }), K(3, 4, [10, 6], [4, 2], [8, 0], [-6, 0])),
    fsmash: C(K(-10, 3, [-16, -30], [2, -12], [8, 0], [-9, 0], { tw: 3, hx: -1 }), K(12, 5, [24, 0], [-8, -6], [15, 0], [-12, 0], { tw: -3 }), K(5, 3, [14, 4], [-4, -4], [10, 0], [-8, 0])),
    dashAttack: C(K(-4, 4, [-6, -6], [4, -8], [8, 0], [-8, 0]), K(14, 2, [-8, -4], [-12, -2], [12, 6], [-16, 10], { hx: 2, hy: 1 }), K(4, 4, [10, 0], [-4, -6], [9, 0], [-8, 0])),
    usmash: C(K(-1, 8, [4, 4], [-2, 4], [7, 0], [-7, 0]), K(-2, 0, [2, -44], [-4, -42], [4, 5], [-4, 7], { hy: -1, bob: -2 }), K(-1, 1, [2, -28], [-3, -26], [5, 0], [-5, 0])),
    // the tilt is one-handed: the wrench flicked up in front, the free hand thrown out behind for balance
    utilt: C(K(1, 4, [10, 2], [-4, -2], [6, 0], [-6, 0]), K(-5, 1, [6, -40], [-12, 2], [6, 0], [-6, 0], { tw: -1 }), K(-1, 2, [8, -18], [-6, -2], [5, 0], [-5, 0])),
    neutralB: C(K(-4, 3, [-8, -16], [4, -8], [5, 0], [-5, 0], { tw: 2 }), K(4, 2, [18, -14], [-6, -6], [8, 0], [-6, 0], { tw: -2 }), K(1, 1, [8, -6], [-4, -4], [6, 0], [-5, 0])),
    // ftilt: a stretched-out lunge with the wrench jaws first, up at chest height, the free hand flung back for balance
    ftilt: C(K(-6, 4, [-8, -8], [4, -10], [8, 0], [-8, 0], { tw: 2 }), K(12, 4, [26, -14], [-8, -4], [16, 0], [-11, 2], { tw: -2, hx: 1 }), K(5, 3, [14, -8], [-4, -4], [10, 0], [-8, 0])),
    // dtilt (Foot Drill): the legs are too stubby to carry it, so the whole body drops and lunges low behind it, the wrench
    // raking along the floor in front of the drilling boot and the free hand planted behind
    dtilt: C(K(-4, 6, [-4, -6], [-4, -2], [5, 0], [-7, 0], { tw: 1.5 }), K(9, 10, [22, 8], [-10, 4], [12, 1], [-9, 0], { tw: -1.5, hx: 1, hy: 1 }), K(4, 8, [12, 6], [-8, 2], [9, 0], [-8, 0])),
    // rocket fist: the fist cocked back by the ear with the free hand aiming, punched out, then the recoil rocks him back
    sideB: C(K(-6, 3, [-12, -14], [10, -12], [7, 0], [-8, 0], { tw: 2.5 }), K(7, 3, [24, -14], [-8, -6], [12, 0], [-9, 0], { tw: -2, hx: 1 }), K(-4, 2, [10, -10], [-4, -6], [6, 0], [-8, 0], { tw: 0.5, hx: -0.5 })),
    // overclock: hunched over the core, then every limb flung out as the power surges through
    downB: C(K(0, 6, [4, -4], [-2, -4], [5, 0], [-5, 0], { hy: 1 }), K(0, 0, [14, -30], [-14, -30], [8, 0], [-8, 0], { bob: -1.5, hy: -1 }), K(0, 2, [8, -16], [-8, -16], [6, 0], [-6, 0])),
    // grapple tether: crouched, then the claw arm fired up and forward at full stretch, the other hand back
    upB: C(K(-2, 5, [4, 0], [-4, 0], [6, 0], [-6, 0]), K(-3, 0, [14, -42], [-10, -4], [4, 3], [-4, 4], { tw: -1, hy: -1 }), K(-1, 0, [10, -32], [-6, -6], [4, 2], [-4, 2])),
    nair: nairStar(12, -8),
    fair: fairArm([-6, -6], [22, -8]),
    bair: bairArm(20, -6),
    uair: uairArm(4, -40),
    dair: dairSlam([2, -30], 16),
  },
  agni: {
    jab3: C(K(-2, 2, [4, -12], [-2, -10], [9, 14], [-6, 0]), K(-5, 1, [-6, -16], [6, -14], [25, 15], [-7, 0], { tw: -1, hx: -0.5 }), K(-1, 1, [2, -12], [-2, -10], [12, 8], [-6, 0])),
    upB_0: C(K(-2, 8, [4, 4], [-2, 4], [6, 0], [-6, 0]), K(-3, 0, [4, -46], [-2, -42], [6, 10], [0, 12], { hy: -1 }), K(-1, 0, [4, -30], [-2, -28], [5, 8], [-1, 10])),
    // the jabs come up to the chin: a snapped lead and a turning cross at the hitbox's height instead of at the belt
    jab1: jabLead(16, -18),
    jab2: jabCross(30, -18),
    // flame orb: both palms cupped back at the hip in a deep horse stance, then driven out together at chest height
    neutralB_0: C(K(-6, 5, [-8, -8], [-4, -6], [8, 0], [-10, 0], { tw: 2, hx: -0.5 }), K(8, 6, [22, -16], [34, -14], [15, 0], [-11, 0], { tw: 1.5, hx: 1 }), K(3, 4, [14, -12], [24, -10], [10, 0], [-9, 0])),
    // flare burst: fists drawn in to the hips, crouched, then every limb thrown wide as the flames burst out of him
    downB_0: C(K(0, 6, [0, -6], [-2, -6], [6, 0], [-6, 0], { hy: 1 }), K(0, 2, [18, -30], [-16, -30], [12, 0], [-12, 0], { hy: -1, bob: -1 }), K(0, 3, [10, -14], [-10, -14], [9, 0], [-9, 0])),
    // the spin kick: chambered and turned away, then the front leg whipped round high at chest height
    ...spinKick,
    ...throwSet(6, -40, 10),
    fair: fairKick(24),
    bair: bairKick(22),
    // uair (Cinder Kick): the short legs cannot reach overhead, so it is a rising knee with the fist driven up past the
    // head (the old flip kick's foot ended up hidden behind the chest)
    uair: C(K(1, 1, [6, -6], [-4, -6], [6, 13], [-2, 12]), K(-3, 0, [8, -46], [-8, -2], [8, 22], [-4, 4], { tw: -1, bob: -1, hy: -1 }), K(-1, 0, [6, -28], [-6, -4], [6, 16], [-3, 8])),
  },
  halcyon: {
    // the wing flare: wings clamped tight and the spear low, then both wings burst open as the spear sweeps up
    jab3: C(K(-5, 4, [4, -6], [-2, 0], [8, 0], [-8, 0], { aim: 20, wing: 0.05, tw: 1 }), K(5, 1, [16, -18], [-2, 0], [10, 0], [-8, 0], { aim: -30, wing: 1, bob: -1, hy: -0.5 }), K(1, 1, [10, -10], [-2, 0], [7, 0], [-6, 0], { aim: -10, wing: 0.55 })),
    // the wing sweep: up on the toes with the wings folded and the spear high, then dropped into a deep crouch with the
    // wings snapped wide over the floor either side and the spear swept low
    dsmash: C(K(-1, 0, [4, -22], [-2, 0], [6, 0], [-6, 0], { aim: -60, wing: 0, bob: -1, hy: -1 }), K(2, 10, [18, 10], [-2, 0], [13, 0], [-13, 0], { aim: 20, wing: 1, hy: 1 }), K(1, 6, [12, 6], [-2, 0], [9, 0], [-9, 0], { aim: 15, wing: 0.5 })),
    // the javelin: the spear cocked back by the ear, wings half open, then hurled flat out with the wings thrown wide
    neutralB_0: C(K(-6, 2, [-12, -24], [-2, 0], [7, 0], [-8, 0], { aim: -22, wing: 0.4, tw: 2 }), K(8, 2, [26, -14], [-2, 0], [12, 0], [-9, 0], { aim: -4, wing: 0.8, tw: -2 }), K(2, 1, [12, -6], [-2, 0], [6, 0], [-5, 0], { aim: 8, wing: 0.3 })),
    // the hurl: the skewered foe levered up off the spear tip, the wings flaring with the heave
    fthrow: C(K(-4, 2, [8, -6], [-2, 0], [5, 0], [-6, 0], { aim: 10, wing: 0.2 }), K(9, 2, [24, -18], [-2, 0], [11, 0], [-8, 0], { aim: -25, wing: 0.9, tw: -1.5 }), K(2, 0, [12, -8], [-2, 0], [6, 0], [-5, 0], { aim: 0, wing: 0.4 })),
    jab2: C(K(-3, 2, [-2, -2], [-2, 0], [4, 0], [-4, 0], { aim: 10 }), K(4, 4, [19, 2], [-2, 0], [9, 0], [-7, 0], { aim: 16 }), K(0, 2, [8, -2], [-2, 0], [5, 0], [-4, 0], { aim: 10 })),
    sideB: C(K(-8, 4, [-10, -10], [-2, 0], [10, 0], [-10, 0], { aim: -6, wing: 0.6 }), K(13, 2, [26, -8], [-2, 0], [12, 7], [-14, 9], { aim: 0, wing: 1 }), K(3, 1, [10, -6], [-2, 0], [6, 2], [-6, 2], { aim: -10, wing: 0.5 })),
    nair: nairStar(14, -12),
    fair: fairArm([-6, -14], [22, -8]),
    // the wing buffet: the spear swept out behind as both wings beat open behind her
    bair: C(K(-2, 0, [8, -12], [-4, -10], [5, 13], [0, 14], { tw: 1, aim: -100, wing: 0.1 }), K(7, 0, [-2, -12], [8, -12], [5, 12], [-8, 9], { tw: -2.5, hx: -1, aim: 172, wing: 1 }), K(4, 0, [2, -10], [6, -10], [6, 11], [-5, 11], { tw: -1, aim: -150, wing: 0.55 })),
    uair: uairArm(4, -36),
    dair: dairSlam([2, -12], 14),
  },
  riptide: {
    // the anchor smash goes up behind the head in both hands and comes down far out in front; the dash attack is a dive
    fsmash: C(K(-10, 0, [-8, -40], [-12, -36], [8, 0], [-9, 0], { tw: 2, hy: -1.5 }), K(13, 9, [28, 8], [22, 8], [16, 0], [-13, 0], { tw: -1, hy: 1.5 }), K(6, 7, [18, 8], [12, 8], [12, 0], [-10, 0])),
    dashAttack: C(K(-6, 6, [2, -10], [-6, -8], [9, 0], [-10, 0], { tw: -1.5 }), K(15, 5, [-12, -2], [-16, 0], [18, 0], [-16, 8], { tw: 1, hx: 2.5, hy: 1 }), K(5, 4, [2, -6], [-4, -4], [11, 0], [-9, 0])),
    jab1: jabLead(15, -10),
    jab2: jabCross(17, -10),
    neutralB: shove(18, -12),
    nair: nairStar(20, -10),
    fair: fairArm([-6, -30], [22, 8]),
    bair: bairKick(22),
    uair: uairArm(4, -40, true),
    // the anchor plunge: hauled up overhead in both hands, then driven straight down under the feet
    dair: C(K(-1, 0, [0, -32], [-4, -30], [6, 10], [-3, 12]), K(2, 0, [2, 8], [-3, 6], [7, 15], [-3, 14], { hy: 1.5 }), K(1, 0, [2, 2], [-3, 0], [6, 10], [-3, 12])),
    // the shark lunge: coiled low, then a jaws-first dive with both claws reaching, the tail end kicked up behind
    sideB: C(K(-7, 7, [-4, -4], [2, -6], [7, 0], [-9, 0], { tw: 1.5 }), K(16, 4, [24, -14], [20, -6], [16, 0], [-16, 8], { tw: -1, hx: 2.5, hy: 0.5 }), K(5, 3, [12, -8], [8, -6], [10, 0], [-9, 0])),
    // the throws are a grappler's: a two-handed heave, a bridging suplex, a squat-and-launch and an overhead pin
    fthrow: C(K(-3, 2, [12, -8], [8, -8], [6, 0], [-6, 0], { tw: 1 }), K(8, 4, [26, -12], [22, -6], [13, 0], [-10, 0], { tw: -2, hx: 1 }), K(3, 2, [14, -6], [8, -4], [8, 0], [-7, 0])),
    bthrow: C(K(-2, 5, [12, -6], [8, -6], [6, 0], [-6, 0]), K(-14, 4, [-14, -34], [-18, -30], [8, 0], [-4, 0], { hy: -1, tw: 1 }), K(-4, 6, [-10, -4], [-12, -2], [6, 0], [-6, 0])),
    uthrow: C(K(1, 9, [12, 4], [8, 4], [7, 0], [-7, 0], { hy: 0.5 }), K(-3, 0, [6, -46], [0, -44], [4, 6], [-4, 8], { bob: -2, hy: -1 }), K(-1, 1, [6, -26], [0, -24], [5, 0], [-5, 0])),
    dthrow: C(K(-2, 0, [10, -30], [4, -28], [6, 0], [-6, 0], { hy: -1 }), K(10, 12, [20, 14], [14, 12], [12, 0], [-10, 0], { hy: 1.5 }), K(4, 8, [14, 8], [8, 6], [9, 0], [-8, 0])),
  },
  obelisk: {
    // the palm drives up from the hip; the smash coils down by the floor and erupts into a full-stretch punch
    jab3: C(K(-4, 5, [-2, 4], [-6, 2], [6, 0], [-8, 0], { tw: 1 }), K(10, 2, [20, -18], [14, -12], [14, 0], [-10, 0], { tw: -1, hy: -0.5 }), K(4, 2, [10, -10], [6, -8], [9, 0], [-8, 0])),
    jab1: jabLead(16, -12),
    jab2: jabCross(18, -12),
    ftilt: hookArc(20, -14),
    // the rubble sweep: short legs under a huge body, so the near fist rakes the floor out in front from a low crouch
    dtilt: C(K(-3, 8, [-6, 0], [-8, 2], [8, 0], [-9, 0], { tw: 1 }), K(8, 12, [28, 16], [-4, 6], [15, 0], [-10, 0], { tw: -1.5, hy: 1 }), K(3, 9, [14, 10], [-4, 4], [10, 0], [-9, 0])),
    fsmash: C(K(-10, 9, [-14, 4], [6, -10], [10, 0], [-11, 0], { tw: 3.5, hx: -1 }), K(14, 6, [30, -4], [-18, -24], [18, 0], [-14, 1], { tw: -3, hx: 1.5 }), K(6, 5, [16, -2], [-10, -14], [13, 0], [-11, 0], { tw: -1 })),
    dsmash: splitSlam(),
    // the charge is shoulder first, both arms tucked in to the body, the back foot kicking up
    dashAttack: C(K(-4, 5, [-4, -6], [6, -10], [6, 0], [-8, 0], { tw: -1 }), K(14, 7, [4, -14], [0, -16], [16, 0], [-16, 6], { tw: -2, hx: 1.5 }), K(4, 3, [4, -8], [2, -8], [8, 0], [-7, 0])),
    neutralB: groundSlam(),
    // the shard volley: both fists drawn back low by the hip, then both palms driven out at chest height to loose the shards
    sideB: C(K(-7, 6, [-10, 2], [-12, 4], [8, 0], [-10, 0], { tw: 1.5 }), K(10, 3, [26, -18], [22, -12], [14, 0], [-11, 0], { tw: -1, hx: 1, hy: -0.5 }), K(4, 3, [14, -12], [10, -8], [10, 0], [-9, 0])),
    // the bedrock stomp: the knee hauled high with both fists up, then the foot and both fists brought down into the floor
    downB: C(K(-3, 0, [10, -30], [-10, -28], [10, 18], [-6, 0], { bob: -1.5, hy: -1 }), K(3, 12, [20, 8], [-18, 8], [16, 0], [-12, 0], { hy: 1.5 }), K(1, 8, [12, 4], [-10, 4], [12, 0], [-10, 0])),
    // the upheaval: crouched over the rising pillar, then flung up off it, both fists punched high
    upB: C(K(-2, 9, [-6, -4], [6, -4], [7, 0], [-7, 0], { hy: 0.5 }), K(0, -2, [8, -48], [-6, -46], [4, 10], [-4, 10], { bob: -2, hy: -1.5 }), K(0, 0, [6, -32], [-4, -30], [4, 6], [-4, 6])),
    nair: nairStar(18, -8),
    fair: fairArm([-4, -34], [20, 10], {}, 'both'),
    bair: bairArm(22, -12),
    // the crystal horn is a headbutt: arms swept down and back, the crown driven straight up
    uair: uairArm(4, -42, true, { hy: -1.5 }),
    dair: dairStomp(),
    utilt: C(K(-2, 6, [4, 2], [-4, 2], [6, 0], [-6, 0], { hy: 0.5 }), K(-3, -1, [6, -42], [-4, -40], [6, 0], [-6, 0], { bob: -1, hy: -1.5 }), K(-1, 1, [6, -24], [-4, -22], [6, 0], [-6, 0])),
    usmash: C(K(-3, 11, [8, 6], [-6, 6], [8, 0], [-8, 0], { hy: 1 }), K(0, -2, [10, -46], [-8, -44], [5, 4], [-5, 6], { bob: -2, hy: -1.5 }), K(0, 2, [8, -26], [-6, -24], [6, 0], [-6, 0], { bob: -0.5 })),
  },
  rime: {
    // the smash crosses both kunai high over the shoulder and slashes them out together
    fsmash: C(K(-6, 3, [-10, -28], [-4, -30], [8, 0], [-9, 0], { tw: 3 }), K(12, 6, [26, -4], [20, 8], [16, 0], [-13, 0], { tw: -3 }), K(5, 4, [14, 0], [10, 4], [11, 0], [-9, 0])),
    dashAttack: C(K(-2, 6, [4, -8], [-4, -6], [8, 0], [-8, 0]), K(-6, 9, [-6, -6], [-10, -2], [24, 4], [-6, 10], { tw: -1 }), K(-2, 6, [0, -6], [-6, -4], [14, 2], [-6, 6])),
    sideB: C(K(-6, 4, [-14, -10], [6, -10], [8, 0], [-8, 0], { tw: 2 }), K(14, 6, [26, 2], [-14, -8], [18, 0], [-16, 3], { tw: -2 }), K(5, 4, [12, -2], [-8, -6], [11, 0], [-10, 0])),
    counterStrike: C(K(-4, 2, [6, -26], [-4, -10], [5, 0], [-6, 0], { tw: 1 }), K(10, 4, [26, -12], [-10, -10], [14, 0], [-12, 0], { tw: -2 }), K(3, 2, [12, -8], [-6, -6], [9, 0], [-8, 0])),
    ultimate: C(K(-6, 2, [-6, -40], [-10, -34], [6, 0], [-7, 0], { hy: -1 }), K(10, 6, [24, 8], [16, 6], [14, 0], [-12, 0], { hy: 1 }), K(4, 4, [14, 4], [8, 2], [10, 0], [-9, 0])),
    nair: nairKick(17, 10),
    fair: fairArm([-4, -30], [22, 4]),
    bair: bairKick(20),
    uair: uairArm(6, -38, true),
    // the avalanche kick is a dive: tucked, then the front heel driven down and forward along the dive, arms swept back
    dair: C(K(-2, 0, [6, -16], [-6, -14], [6, 14], [-3, 13], { tw: 1 }), K(8, 0, [-4, -18], [-10, -14], [10, 2], [-4, 14], { tw: -1, hy: 0.5 }), K(4, 0, [0, -14], [-6, -12], [8, 6], [-4, 12])),
    // the low sweep: dropped right down onto the back hand, the front leg scything along the floor
    dtilt: C(K(-2, 8, [4, -4], [-4, 4], [8, 0], [-8, 0]), K(5, 13, [6, -6], [-6, 14], [26, 1], [-9, 0], { tw: -1 }), K(2, 9, [4, -4], [-4, 8], [14, 0], [-8, 0])),
    // the substitution: a ninja's hand seal held at the chin while it waits for the hit
    downB: C(K(0, 2, [6, -10], [-2, -10], [6, 0], [-6, 0]), K(-2, 5, [8, -20], [6, -19], [7, 0], [-7, 0], { tw: 1.5, hy: 0.5 }), K(-1, 4, [8, -18], [6, -17], [7, 0], [-7, 0], { tw: 1 })),
    // the ice kunai: cocked behind the ear, then flicked out sidearm with the chest turning through
    neutralB: C(K(-4, 1, [-10, -22], [6, -10], [6, 0], [-6, 0], { tw: 2 }), K(6, 2, [22, -14], [-6, -8], [10, 0], [-7, 0], { tw: -2 }), K(2, 1, [12, -8], [-4, -6], [7, 0], [-6, 0])),
  },
  havoc: {
    // the third hit is a real knee: both hands clinch and pull down as the knee drives up
    jab3: C(K(-2, 1, [8, -14], [2, -12], [5, 0], [-5, 0]), K(-4, 0, [12, -8], [6, -6], [10, 18], [-4, 0], { tw: -1, hy: -0.5 }), K(-1, 1, [8, -10], [2, -8], [8, 6], [-5, 0])),
    // the ultimate: braced, one arm flung up pointing the strike in, the other hand at the radio by the ear
    ultimate: C(K(0, 3, [4, -12], [-2, -20], [6, 0], [-6, 0], { hx: 0.5 }), K(-4, 2, [18, -34], [0, -24], [9, 0], [-8, 0], { tw: -1, hy: -1 }), K(-2, 1, [14, -30], [0, -22], [8, 0], [-7, 0])),
    detonateC4: C(K(0, 1, [6, -12], [0, -8], [6, 0], [-6, 0]), K(4, 4, [15, -16], [2, -10], [9, 0], [-7, 0], { hy: 0.5 }), K(2, 2, [10, -14], [0, -8], [7, 0], [-6, 0])),
    jab1: jabLead(15, -12),
    jab2: jabCross(16, -12),
    // the rifle butt is a rising butt-stroke: the rifle hauled down by the hip, then the stock driven up at the jaw
    ftilt: C(K(-5, 4, [-8, 4], [-12, 2], [8, 0], [-9, 0], { tw: 3 }), K(9, 3, [20, -24], [12, -26], [13, 0], [-10, 0], { tw: -2, hy: -0.5 }), K(3, 2, [10, -14], [6, -14], [8, 0], [-7, 0])),
    // the rising kick goes all the way up: the front boot snapped up past the head off the planted leg
    // (a stocky build: a high kick only reaches the chin, so the overhead boxes take an uppercut swing of the blade arm)
    utilt: C(K(1, 5, [10, 2], [-4, -4], [6, 0], [-6, 0], { tw: 1 }), K(-5, 0, [6, -42], [-12, 0], [6, 0], [-6, 0], { tw: -1, hy: -1 }), K(-1, 2, [8, -20], [-6, -4], [5, 0], [-5, 0])),
    dtilt: legSweep(22),
    dashAttack: shoulderCharge(),
    fsmash: C(K(2, 6, [10, -16], [4, -16], [10, 0], [-11, 0]), K(-8, 5, [14, -18], [8, -17], [11, 0], [-12, 0], { hx: -1.5, tw: 1 }), K(-3, 4, [12, -16], [6, -15], [9, 0], [-10, 0])),
    nair: nairStar(16, -10),
    fair: fairKick(18),
    bair: bairKick(20),
    uair: uairArm(4, -42, true),
    // the drill stomp: balled up, then both boots drilled straight down together, the arms kept tight in a guard
    dair: C(K(0, 0, [8, -16], [-6, -14], [6, 16], [-3, 15], { bob: 1 }), K(0, 0, [10, -22], [-6, -22], [2, -2], [-2, 0], { bob: -1.5, hy: 1 }), K(0, 0, [8, -16], [-6, -16], [4, 5], [-4, 8])),
    // the C4: dropped to one knee and the charge slapped onto the floor in front
    downB: C(K(0, 3, [8, -10], [-2, -6], [6, 0], [-6, 0]), K(8, 14, [20, 14], [2, -6], [12, 0], [-10, 0], { hy: 1 }), K(3, 9, [12, 6], [0, -4], [9, 0], [-8, 0])),
  },
};

/** The pose to draw for `moveId` of fighter `charId`, or undefined to keep the move's own. */
export function bookPose(charId: string, moveId: string, own: PoseSpec | undefined): PoseSpec | undefined {
  const e = POSE_BOOK[charId]?.[moveId];
  if (!e) return undefined;
  return typeof e === 'function' ? e(own) : withTracks(e, own);
}
