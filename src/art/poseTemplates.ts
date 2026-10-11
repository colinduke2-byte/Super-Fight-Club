import type { PoseSpec } from '../engine/moves';

type V2 = [number, number];
/** [lean, crouch, frontHand, backHand, frontFoot, backFoot] (same layout as the pose tables in proceduralFighter). */
export type Key = [number, number, V2, V2, V2, V2];

const FF: V2 = [4, 0];
const BF: V2 = [-4, 0];
const FH: V2 = [2, 0];
const BH: V2 = [-2, 0];

/** Build the three key poses (wind-up, strike, recovery) for a pose spec. */
export function buildKeys(s: PoseSpec): [Key, Key, Key] {
  const reach = s.reach ?? 14;
  const h = s.h ?? -6;
  const lean = s.lean;
  const crouch = s.crouch ?? 0;
  const step = s.step ?? 2;
  const hand = s.hand ?? 'front';
  const front = hand !== 'back';
  /** Place `p` on the striking hand and `guard` on the other one. */
  const hands = (p: V2, guard: V2): [V2, V2] => (front ? [p, guard] : [guard, p]);
  const both = (p: V2, q: V2): [V2, V2] => [p, q];
  switch (s.t) {
    case 'punch': {
      const wind = s.wind ?? [-6, -2];
      const [wa, wg] = hands(wind, front ? BH : [6, -6]);
      const [sa, sg] = hands([reach, h], front ? [-4, -4] : [6, -6]);
      const [ra, rg] = hands([reach * 0.45, h * 0.5], front ? [-2, 0] : [4, -4]);
      return [
        [-2, crouch, wa, wg, FF, BF],
        [lean ?? -5, crouch + 1, sa, sg, [4 + step, 0], [-5, 0]],
        [-3, crouch, ra, rg, FF, BF],
      ];
    }
    case 'hook': {
      const wind = s.wind ?? [-10, 2];
      const [wa, wg] = hands(wind, [4, -8]);
      const [sa, sg] = hands([reach, h], [2, -8]);
      const [ra, rg] = hands([reach * 0.3, h * 0.4], [0, -4]);
      return [
        [-6, crouch + 2, wa, wg, [8, 0], [-8, 0]],
        [lean ?? 4, crouch + 2, sa, sg, [4 + step + 4, 0], [-8, 0]],
        [1, crouch, ra, rg, [6, 0], [-6, 0]],
      ];
    }
    case 'uppercut': {
      const [wa, wg] = hands(s.wind ?? [4, 6], [-2, 2]);
      const [sa, sg] = hands([reach * 0.2, s.h ?? -38], [-3, -8]);
      const [ra, rg] = hands([3, (s.h ?? -38) * 0.55], [-2, -2]);
      return [
        [-2, s.crouch ?? 5, wa, wg, [6, 0], [-6, 0]],
        [lean ?? -2, 0, sa, sg, [4, 0], [-4, 0]],
        [-1, 0, ra, rg, FF, BF],
      ];
    }
    case 'kick': {
      const frontFoot = s.foot !== 'back';
      const lift = s.lift ?? 6;
      const wind: V2 = s.wind ?? [-4, 8];
      const strike: V2 = [reach, lift];
      const rec: V2 = [reach * 0.35, lift * 0.4];
      const bal: [V2, V2] = [[-4, -8], [8, -10]];
      const feet = (f: V2, other: V2): [V2, V2] => (frontFoot ? [f, other] : [other, f]);
      const [wa, wb] = feet(wind, frontFoot ? BF : FF);
      const [sa, sb] = feet(strike, frontFoot ? [-6, 0] : [6, 0]);
      const [ra, rb] = feet(rec, frontFoot ? BF : FF);
      return [
        [-4, crouch + 2, bal[0], bal[1], wa, wb],
        [lean ?? 4, crouch, bal[0], bal[1], sa, sb],
        [0, crouch + 1, [-2, -6], [4, -6], ra, rb],
      ];
    }
    case 'sweep':
      return [
        [-2, 6, [2, -6], [-4, -4], [8, 0], [-8, 0]],
        [lean ?? 2, s.crouch ?? 9, [-4, -4], [-8, -2], [reach, 0], [-10, 0]],
        [0, 5, [2, -4], [-4, -2], [reach * 0.5, 0], [-8, 0]],
      ];
    case 'slash': {
      const from: V2 = s.from ?? [-8, -22];
      const to: V2 = s.to ?? [16, 8];
      const mid: V2 = [(from[0] + to[0]) / 2 + 2, (from[1] + to[1]) / 2];
      const rec: V2 = [to[0] * 0.5, to[1] * 0.5];
      const [wa, wg] = hands(from, front ? [-4, -6] : [8, -6]);
      const [sa, sg] = hands(to, front ? [-6, -4] : [8, -6]);
      const [ra, rg] = hands(rec, front ? [-2, 0] : [4, -4]);
      void mid;
      return [
        [-5, crouch, wa, wg, [6, 0], [-6, 0]],
        [lean ?? 3, crouch + 2, sa, sg, [4 + step + 4, 0], [-8, 0]],
        [0, crouch, ra, rg, FF, BF],
      ];
    }
    case 'thrust': {
      const windP: V2 = s.wind ?? [-4, -6];
      return [
        [-6, crouch + 2, windP, [windP[0] - 2, windP[1] + 2], [8, 0], [-8, 0]],
        [lean ?? 7, crouch + 1, ...both([reach, h], [reach - 4, h + 2]), [4 + step + 8, 0], [-10, 0]],
        [2, crouch, [reach * 0.4, h * 0.5], [reach * 0.3, h * 0.5], [8, 0], [-6, 0]],
      ];
    }
    case 'spin':
      return [
        [-6, crouch + 3, [-8, -4], [8, -8], [4, 0], [-6, 0]],
        [lean ?? 3, crouch, [reach, h], [-reach, h], [7, 5], [-7, 5]],
        [-1, crouch + 1, [4, -4], [-2, -4], [6, 0], [-6, 0]],
      ];
    case 'slam': {
      const up = s.from ?? [2, -32];
      return [
        [-4, crouch, up, [up[0] - 2, up[1]], [6, 0], [-6, 0]],
        [lean ?? 5, crouch + 6, ...both([reach, s.h ?? 6], [reach - 4, (s.h ?? 6) - 2]), [10, 0], [-8, 0]],
        [1, crouch + 3, [8, 2], [6, 2], [7, 0], [-6, 0]],
      ];
    }
    case 'stomp':
      return [
        [-2, crouch + 1, [-2, -10], [10, -8], [6, s.lift ?? 12], [-6, 0]],
        [lean ?? 2, crouch + 6, [-6, -4], [10, -4], [reach, 0], [-8, 0]],
        [0, crouch + 3, [0, -2], [6, -2], [8, 0], [-6, 0]],
      ];
    case 'elbow': {
      // strikes behind the fighter
      return [
        [-3, crouch, [4, -6], [-2, -6], FF, BF],
        [lean ?? 6, crouch + 1, [2, -6], [-reach, h], [6, 0], [-6, 0]],
        [2, crouch, [3, -4], [-reach * 0.4, h * 0.5], FF, BF],
      ];
    }
    case 'overhead': {
      const [wa, wg] = hands(s.from ?? [-4, -26], [-2, -20]);
      const [sa, sg] = hands([reach, s.h ?? 10], [reach - 8, 4]);
      const [ra, rg] = hands([reach * 0.5, 2], [2, 0]);
      return [
        [-5, crouch, wa, wg, [6, 0], [-6, 0]],
        [lean ?? 5, crouch + 3, sa, sg, [8, 0], [-8, 0]],
        [1, crouch + 1, ra, rg, FF, BF],
      ];
    }
    case 'custom':
      if (!s.keys || s.keys.length !== 3) throw new Error('custom pose spec needs exactly 3 keys');
      return s.keys as [Key, Key, Key];
    default:
      throw new Error(`unknown pose template '${s.t}'`);
  }
}

export const POSE_TEMPLATES = ['punch', 'hook', 'uppercut', 'kick', 'sweep', 'slash', 'thrust', 'spin', 'slam', 'stomp', 'elbow', 'overhead', 'custom'];

void FH;
