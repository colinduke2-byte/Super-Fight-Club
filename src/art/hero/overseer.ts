import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, Raster, type RGB, type V2 } from './raster';
import { skeleton, solveLimb, type HeroPose, type Skel } from './skeleton';

/**
 * The Overseer: the arena AI's warden body, the Arcade Ladder's final boss. Nothing like a fighter's chibi build: a tall,
 * narrow-waisted sovereign in porcelain-white plate over an obsidian frame, its colour language ivory, black and one cold
 * violet light. The silhouette is an hourglass: a crown of seven blade spires fanned behind the shoulders like a throne's
 * back, horned pauldrons, a wasp waist, and a long robe of hanging blade-plates that flares to the floor. Its face is a
 * smooth ivory mask with no features but one great round eye (an iris of aperture blades around a white-hot pupil) under a
 * thin three-spike crown. Long obsidian arms end in ivory vambraces and three-talon claws.
 *
 * Phase 2 (`look.outfit === 1`, the `~rage` sheet): a transformation, not a recolour. The mask splits down a burning seam
 * and its jaw plate is gone, the eye turns red with a slit pupil and a second ring, the spire crown shatters into shards
 * held apart by fire with a ring of embers turning behind it, the robe plates float loose on glowing gaps, energy blades
 * burn along the forearms, heat cracks run through every ivory plate, and broken shards orbit the body.
 *
 * Channels: `pose.wing` is the boss's "power" 0..1 (casts, the roar, the Cataclysm): the eye flares, the core swells and
 * the spires light. The drawer also re-poses the standard rows (see `bossPose`) so every row reads on this body.
 */
export function drawOverseer(r: Raster, k0: Skel, look: PlaceholderLook): void {
  // (laid poses are re-posed too: the shared sprawl is built for fighter-length arms and leaves these standing off the chest)
  const k = skeleton(look, bossPose(k0.pose), k0.W, k0.H, k0.phase);
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const accent = col(look.accent);
  guardGlow(r, accent); // no part blooms unless it is emissive on purpose
  const p2 = (look.outfit ?? 0) === 1;
  // the playable Overseer's frames are shorter than the boss's 320px (its sheet holds a full fighter's rows): it carries a
  // compact crown and a bolder face so it reads at a fighter's size
  const fit = r.h < 300;
  const mo = motionOf(k.pose as MotionPose);
  const power = Math.max(0, Math.min(1, k.pose.wing ?? 0));
  const glow = mix(accent, [255, 250, 255], 0.5);
  const frame: RGB = mix(dark, [10, 8, 18], 0.35);
  const enamel: RGB = mix(dark, accent, 0.28);
  const M: Mats = {
    I: ramp(r, armor, mix(armor, [70, 60, 90], 0.55), 0.4),
    ID: ramp(r, mix(armor, dark, 0.38), mix(armor, dark, 0.7), 0.16),
    O: ramp(r, mix(frame, [40, 36, 56], 0.4), mul(frame, 0.7), 0.24),
    OD: ramp(r, frame, mul(frame, 0.55), 0.1),
    E: ramp(r, enamel, mul(enamel, 0.55), 0.2),
    line: r.part(mix(frame, [2, 0, 8], 0.6), { flat: true }),
    deep: r.part(mix(frame, [0, 0, 2], 0.6), { flat: true }),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    white: r.part(mix(glow, [255, 255, 255], 0.65), { emissive: true }),
    seam: p2 ? r.part(accent, { emissive: true }) : r.part(mix(frame, enamel, 0.5), { flat: true }),
    hot: r.part(mix(accent, [255, 236, 200], 0.72), { emissive: true }),
    fit,
  };
  const T = k.torso;
  const ph = k.phase;
  const hx = k.head.x;
  const hy = k.head.y - (fit ? 22 : 14); // the head stands clear of the collar on a neck
  const hs = k.head.s;
  const x0 = T.x;
  const top = T.y;
  const w = T.w;
  const h = T.h;
  const waistY = top + h * 0.62;
  const midX = x0 + w * 0.52;
  // the long arms and the sabatons stay inside the frame on the widest reaches
  // (pulled back along the arm's own line, so a full-reach thrust stays a straight thrust instead of folding at the elbow)
  const handF = clampRay(k.shF, k.handF, 30, r.w - 34, 30, r.h - 18);
  const handB = clampRay(k.shB, k.handB, 30, r.w - 34, 30, r.h - 18);
  const ankleF = clampV(k.ankleF, 30, r.w - 40, 0, k.base - 8);
  const ankleB = clampV(k.ankleB, 30, r.w - 40, 0, k.base - 8);
  const elbowF = handF === k.handF ? k.elbowF : solveLimb(k.shF, handF, k.armBone, 1).mid;
  const elbowB = handB === k.handB ? k.elbowB : solveLimb(k.shB, handB, k.armBone, 1).mid;
  // the robe's secondary motion: it breathes at rest, trails the body's travel and overshoots on the follow-through
  const sway = Math.sin(ph * 1.05) * 2.5 - k.pose.lean * 1.4 + mo.trail * 9;

  // ---- the spire crown behind the shoulders (a ring of embers behind it once enraged) ----
  const neck: V2 = [hx + hs * 0.5, top + 10];
  if (p2) emberRing(r, M, neck[0], neck[1] - 16, ph, power);
  spires(r, M, neck[0] - 6, neck[1] + 6, ph, p2, power, k.pose.lean, mo);

  // ---- the back of the robe: blade-plates hanging from the hips, in shade ----
  const hem = k.base - 4;
  robe(r, M, k.hipB[0] - 4, k.hipY - 4, hem, sway, true, p2, ph, mo);

  // ---- back arm and back leg (in shade) ----
  arm(r, M, k.shB, elbowB, handB, true, p2, power, mo);
  leg(r, M, k.hipB, k.kneeB, ankleB, true);

  // ---- the front leg, then the torso over both hips ----
  leg(r, M, k.hipF, k.kneeF, ankleF, false);

  // the waist: an obsidian spine of stacked rings, narrow, between the chest and the hip girdle
  {
    const wx = midX - 2;
    plate(r, M.OD, (m) => m.poly(0, [[wx - 18, waistY - 6], [wx + 18, waistY - 6], [wx + 14, k.hipY + 2], [wx - 16, k.hipY + 2]]), { line: M.line });
    for (let y = waistY; y < k.hipY - 2; y += 7) {
      plate(r, M.O, (m) => m.poly(0, [[wx - 15, y], [wx + 15, y], [wx + 13, y + 5], [wx - 13, y + 5]]), { line: M.line, round: true });
      r.seg(M.seam, wx - 8, y + 2.5, wx + 9, y + 2.5, 1.4, 1.4);
    }
  }
  // the hip girdle: an ivory band that the robe hangs from
  {
    const gy = k.hipY - 6;
    plate(r, M.I, (m) => m.poly(0, [[x0 + 4, gy], [x0 + w - 2, gy - 2], [x0 + w + 2, gy + 10], [x0 + w - 8, gy + 16], [x0 + 12, gy + 16], [x0, gy + 8]]), { line: M.line, round: true });
    r.seg(M.E[2], x0 + 8, gy + 8, x0 + w - 6, gy + 6, 3, 3);
    if (p2) r.seg(M.accent, x0 + 20, gy + 3, x0 + 34, gy + 12, 1.4, 1.2);
  }

  // the cuirass: an inverted trapezoid, broad at the shoulders and tapering hard into the waist
  const chest: V2[] = [
    [x0 - 2, top + 10],
    [x0 + 14, top - 2],
    [midX, top - 6],
    [x0 + w - 8, top - 4],
    [x0 + w + 6, top + 8],
    [x0 + w, top + 32],
    [midX + 16, waistY + 2],
    [midX - 14, waistY + 4],
    [x0 + 6, top + 34],
  ];
  plate(r, M.I, (m) => m.poly(0, chest), { line: M.line, round: true });
  // the far flank in shade
  plate(r, M.ID, (m) => m.poly(0, [[x0 - 2, top + 10], [x0 + 14, top - 2], [x0 + 28, top - 4], [midX - 8, waistY + 3], [midX - 14, waistY + 4], [x0 + 6, top + 34]]), { line: M.line });
  // enamel inlay: a V from each shoulder to the core, and the sternum keel down to the waist
  r.seg(M.E[1], x0 + 18, top + 2, midX, top + 30, 3.2, 2.4);
  r.seg(M.E[2], x0 + w - 4, top, midX + 4, top + 30, 3.2, 2.4);
  r.seg(M.I[4], midX + 2, top + 40, midX + 1, waistY - 2, 2.4, 1.4);
  // heat cracks through the plate once enraged
  if (p2) {
    const cracks: V2[][] = [
      [[x0 + 30, top - 4], [x0 + 36, top + 8], [x0 + 32, top + 16], [x0 + 40, top + 26]],
      [[x0 + w + 6, top + 6], [x0 + w - 4, top + 14], [x0 + w - 2, top + 22], [x0 + w - 14, top + 32]],
      [[midX - 10, waistY - 2], [midX - 4, waistY - 10], [midX + 8, waistY - 8]],
    ];
    for (const c of cracks) for (let i = 0; i + 1 < c.length; i++) r.seg(M.accent, c[i][0], c[i][1], c[i + 1][0], c[i + 1][1], 2, 1.4);
  }
  // the heart: a tall diamond lens set in a black bezel where the V meets
  {
    const cx = midX + 2;
    const cy = top + 30;
    const s = 1 + power * 0.25 + (ph % 2) * 0.04;
    const z = M.fit ? 1.15 : 1;
    const dia = (rx: number, ry: number): V2[] => [[cx, cy - ry * z], [cx + rx * z, cy], [cx, cy + ry * z], [cx - rx * z, cy]];
    plate(r, M.OD, (m) => m.poly(0, dia(13, 19)), { line: M.line });
    r.poly(M.deep, dia(10, 15));
    r.poly(M.accent, dia(7.5 * s, 12 * s));
    r.poly(M.glow, dia(4.5 * s, 8 * s));
    r.poly(M.white, dia(2 * s, 4 * s));
    if (p2) {
      // the enraged heart burns through its bezel: rays out of the four points
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as V2[]) r.seg(M.accent, cx + dx * 12, cy + dy * 18, cx + dx * (18 + power * 6), cy + dy * (26 + power * 6), 1.6, 0.6);
    }
  }

  // ---- the front tabard: a long panel from the girdle between the legs, and the front blade-plates of the robe ----
  robe(r, M, k.hipF[0] + 6, k.hipY - 2, hem, sway, false, p2, ph, mo);
  {
    const tx = midX + 2;
    const ty = k.hipY + 6;
    const tb = Math.min(hem - 6, ty + (hem - ty) * 0.78);
    const sw = sway * 0.6 + k.pose.lean * 0.4;
    plate(r, M.I, (m) => m.poly(0, [[tx - 11, ty], [tx + 11, ty], [tx + 9 + sw, tb - 8], [tx + sw, tb], [tx - 9 + sw, tb - 8]]), { line: M.line, round: true });
    r.seg(M.E[2], tx, ty + 4, tx + sw * 0.9, tb - 10, 4, 2.4);
    // the warden's sigil on the tabard: a small eye
    r.ellipse(M.deep, tx + sw * 0.25, ty + 16, 4.5, 3);
    r.ellipse(p2 ? M.accent : M.glow, tx + sw * 0.25, ty + 16, 2, 2);
  }

  // ---- the high collar, the head and its crown ----
  head(r, M, hx, hy, hs, top, ph, p2, power, mo, k.pose.head);

  // ---- front arm, then the horned pauldron over the shoulder ----
  arm(r, M, k.shF, elbowF, handF, false, p2, power, mo);
  {
    const [sx, sy] = k.shF;
    const px = Math.min(sx + 2, r.w - 40);
    const py = sy - 2;
    // a swept horn rising off the back of the shoulder
    // (shorter on the playable body, where a full horn would cross the face)
    const hh = fit ? 28 : 44;
    plate(r, M.I, (m) => m.poly(0, [[px - 14, py - 4], [px - 22 + (fit ? 6 : 0), py - hh], [px - 8, py - hh * 0.5], [px + 2, py - 8]]), { line: M.line });
    r.seg(M.E[2], px - 14, py - 10, px - 19 + (fit ? 5 : 0), py - hh * 0.82, 2, 1);
    // the shell: a narrow angular plate over two lames
    plate(r, M.ID, (m) => m.poly(0, [[px - 14, py + 8], [px + 16, py + 10], [px + 16, py + 17], [px - 10, py + 16]]), { line: M.line });
    plate(r, M.I, (m) => m.poly(0, [[px - 16, py - 6], [px + 4, py - 12], [px + 18, py - 4], [px + 20, py + 6], [px + 10, py + 11], [px - 14, py + 9]]), { line: M.line, round: true });
    r.seg(M.E[2], px - 12, py + 2, px + 16, py - 2, 2.2, 2.2);
    r.seg(M.seam, px - 8, py + 13, px + 12, py + 14, 1.2, 1.2);
    if (p2) r.seg(M.accent, px - 2, py - 10, px + 4, py + 4, 1.6, 1.2);
  }

  // ---- phase 2: shards of the broken shell orbiting the body ----
  if (p2) shards(r, M, midX, top + 30, ph, power);
}

// ---- the boss's own posing of the standard rows -------------------------------------------------------------------

type Key = [number, number, V2, V2, V2, V2];
const key = (p: HeroPose, e: Key): void => {
  p.lean = e[0];
  p.crouch = e[1];
  p.frontHand = e[2];
  p.backHand = e[3];
  p.frontFoot = e[4];
  p.backFoot = e[5];
};
const lerpKey = (a: Key, b: Key, t: number): Key => {
  const l = (u: number, v: number): number => u + (v - u) * t;
  const lv = (u: V2, v: V2): V2 => [l(u[0], v[0]), l(u[1], v[1])];
  return [l(a[0], b[0]), l(a[1], b[1]), lv(a[2], b[2]), lv(a[3], b[3]), lv(a[4], b[4]), lv(a[5], b[5])];
};
const track = (keys: Key[], u: number): Key => {
  const x = Math.max(0, Math.min(1, u)) * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(x));
  const t = x - i;
  return lerpKey(keys[i], keys[i + 1], t * t * (3 - 2 * t));
};

/**
 * Victory: bowed over its claws, it straightens to full height and opens both arms wide like a sovereign receiving the
 * arena, the crown flaring and the eye blazing; held there.
 */
const VICTORY: Key[] = [
  [6, 8, [6, 4], [-6, 4], [8, 0], [-8, 0]],
  [2, 4, [10, -20], [-10, -18], [8, 0], [-8, 0]],
  [-3, 0, [20, -46], [-22, -42], [9, 0], [-9, 0]],
  [-5, 0, [24, -54], [-28, -48], [9, 0], [-9, 0]],
];

/**
 * The Overseer's own take on the standard rows (the shared tables are built for fighter proportions): a regal, still idle
 * with one claw raised, a gliding walk, a predatory lean into the run, arms crossed behind a barrier, claws spread in the
 * air, a kneel in defeat. Move rows (`mv_*`) keep their authored keys, a little larger so they read on the long arms.
 */
export function bossPose(p0: HeroPose): HeroPose {
  const p = { ...p0, frontHand: [...p0.frontHand] as V2, backHand: [...p0.backHand] as V2, frontFoot: [...p0.frontFoot] as V2, backFoot: [...p0.backFoot] as V2 } as HeroPose & { anim?: string; f?: number; n?: number; lying?: boolean };
  const anim = p.anim ?? '';
  const f = p.f ?? 0;
  const n = Math.max(1, p.n ?? 1);
  const ph = (f / n) * Math.PI * 2;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const amp = (k: number): void => {
    p.lean *= k;
    p.frontHand = [2 + (p.frontHand[0] - 2) * k, p.frontHand[1] * k];
    p.backHand = [-2 + (p.backHand[0] + 2) * k, p.backHand[1] * k];
    if (p.head) p.head = [p.head[0] * k, p.head[1] * k];
    if (p.twist) p.twist *= k;
  };
  switch (anim) {
    case 'idle': {
      // still and regal: the front claw held open at the chest, the other low and out; only the breath and the claw move
      const b = (1 - c) / 2;
      key(p, [-1, b * 0.6, [12 + s * 0.8, -22 - b * 1.2], [-10 - s * 0.7, -2 + b + c * 0.6], [8, 0], [-8, 0]]);
      p.bob = b * 0.9 - 0.2;
      p.head = [s * 0.35, b * 0.3];
      p.wing = 0.12 + b * 0.08;
      break;
    }
    case 'walk':
      // a slow, gliding advance: short steps under the robe (the planted foot pushing back), the body settling on each
      // step, the claws swinging against the legs and the shoulders turning with them
      p.frontFoot = [-s * 6, Math.max(0, -c) * 2];
      p.backFoot = [s * 6, Math.max(0, c) * 2];
      p.frontHand = [10 + s * 2.5, -16 + Math.abs(s) * 0.8];
      p.backHand = [-12 - s * 3, -4 + Math.max(0, -s) * 1.5];
      p.lean = 1.5 + s * s * 0.5;
      p.bob = s * s * 1.1 - 0.3;
      p.crouch = 0.5 + s * s * 0.4;
      p.head = [c * 0.3, s * s * 0.3];
      p.twist = s * 0.6;
      break;
    case 'run':
      // a predator's lope: leaning hard in, both claws swept back and low, pumping against the stride
      p.lean = 7 + s * 0.6;
      p.frontHand = [-8 + s * 5, 2 - Math.max(0, s) * 2];
      p.backHand = [-20 - s * 5, -4 - Math.max(0, -s) * 2];
      p.crouch = (p.crouch ?? 0) + 2;
      p.twist = s * 0.8;
      break;
    case 'dash': {
      // the burst: the claws thrown back in turn (two beats; a four-frame row adds the passing in-betweens, the body
      // rising through them and the shoulders turning with the claws)
      const k = -c;
      const mid = s * s;
      p.lean = 10 + k * 0.5 - mid * 0.4;
      p.crouch += 3 + k * 0.3 - mid * 0.8;
      p.frontHand = [-14 + k * 3, -2 + k - mid * 1.5];
      p.backHand = [-24 - k * 3, -10 - k + mid];
      p.bob = (p.bob ?? 0) - mid * 0.6;
      if (n > 2) p.twist = (p.twist ?? 0) + s * 0.8;
      break;
    }
    case 'crouch':
      key(p, [5, 11, [20, 12], [-6, 6], [10, 0], [-10, 0]]);
      break;
    case 'land':
      key(p, track([[4, 12, [18, 10], [-14, 6], [12, 0], [-12, 0]], [1, 3, [12, -8], [-10, -2], [8, 0], [-8, 0]]], f / Math.max(1, n - 1)));
      break;
    case 'jump':
      key(p, [[2, 0, [14, -36], [-12, -34], [4, 3], [-5, 1]], [0, 0, [18, -28], [-16, -26], [6, 8], [-3, 10]], [2, 3, [20, -16], [-16, -14], [7, 10], [-1, 11]]][Math.min(2, f)] as Key);
      p.wing = 0.4;
      break;
    case 'fall':
      // claws spread wide like a descending raptor
      key(p, [s * 0.5, 0, [22 + c, -20 + s], [-22 - c, -18 - s], [8, 4 + c * 0.6], [-8, 1]]);
      p.wing = 0.35;
      break;
    case 'skid':
      key(p, [-8, 4, [16, -12], [-10, -16], [13, 0], [-6, 0]]);
      break;
    case 'roll':
      key(p, [5, 12, [10, -6], [-4, -8], [6, 6], [-6, 6]]);
      break;
    case 'shield':
      // arms crossed in an X before the chest, braced
      key(p, [2, 4, [-6, -30], [22, -28], [10, 0], [-10, 0]]);
      p.wing = 0.6;
      break;
    case 'dodge':
      key(p, [-6, 4, [-10, -10], [-18, -6], [4, 0], [-12, 0]]);
      p.twist = 3;
      break;
    case 'airdodge':
      key(p, [-4, 6, [-6, -18], [-14, -14], [6, 9], [-1, 11]]);
      p.twist = 3;
      break;
    case 'grab':
      key(p, f === 0 ? [-2, 2, [4, -20], [-10, -8], [8, 0], [-10, 0]] : [6, 4, [34, -14], [-12, -4], [14, 0], [-12, 0]]);
      break;
    case 'ledge':
      key(p, [0, 2, [8, -44], [0, -44], [3, 0], [-3, 0]]);
      break;
    case 'down':
    case 'ko':
      // laid out on its back (drawn upright, then laid down: up is past the head, back is the floor): both claws flung
      // overhead along the floor, the long arms reaching past the crown instead of standing up off the chest
      key(p, [0, 0, [-10, 0], [-10, -86], [6, 4], [-3, 0]]);
      p.head = [-1, 0];
      p.wing = 0;
      break;
    case 'getup':
      // still on its back, propped on both elbows behind it with the knees drawn up, before the kneel and the rise
      if (f === 0) {
        key(p, [0, 0, [-10, 2], [-26, -26], [6, 14], [-1, 10]]);
        p.wing = 0;
      }
      break;
    case 'held':
      key(p, [-4, 0, [12, -34], [-10, -34], [4, 6], [-4, 8]]);
      p.head = [-1.5, -0.5];
      break;
    // the hit reactions, each its own shape (they were one scaled-up flinch): rocked back with the claws thrown up, a
    // short flinch, flung upward with the arms trailing overhead, driven down and folded over
    case 'hurt':
      key(p, [-7, 2, [16, -30], [-6, -34], [6, 0], [-11, 0]]);
      p.head = [-1.5, -0.8];
      p.twist = -1.5;
      p.wing = 0.2;
      break;
    case 'hurtL':
      key(p, [-4, 4, [8, -18], [-14, -10], [9, 0], [-8, 0]]);
      p.head = [-1, 0.3];
      p.wing = 0.15;
      break;
    case 'hurtU':
      key(p, [-3, 0, [12, -62], [-14, -58], [6, 6], [-4, 10]]);
      p.head = [-0.5, -1.2];
      p.bob = -1;
      p.wing = 0.25;
      break;
    case 'hurtD':
      key(p, [9, 9, [18, 8], [4, 10], [8, 5], [-7, 3]]);
      p.head = [1.5, 2];
      p.wing = 0.2;
      break;
    case 'dizzy':
      amp(1.6);
      p.wing = 0.05;
      break;
    case 'victory':
      key(p, track(VICTORY, f / Math.max(1, n - 1)));
      p.wing = 0.3 + (f / Math.max(1, n - 1)) * 0.7;
      break;
    case 'victoryHold': {
      const b = (1 - c) / 2;
      key(p, VICTORY[VICTORY.length - 1]);
      p.frontHand = [p.frontHand[0], p.frontHand[1] + b * 1.2];
      p.backHand = [p.backHand[0], p.backHand[1] + b * 1.2];
      p.head = [0.5, -1];
      p.bob = b * 0.8 - 0.2;
      p.wing = 0.9 + b * 0.1;
      break;
    }
    case 'lose': {
      // brought down to one knee, a claw planted on the floor, the head bowed and the eye dim
      const b = (1 - c) / 2;
      // both claws planted, the body sagging over them, breathing hard
      key(p, [9, 17, [22, 18 + b], [8, 16 + b], [14, 0], [-14, 0]]);
      p.head = [2.5, 5 + b * 0.8];
      p.bob = 0.4 + b * 0.8;
      p.wing = 0;
      break;
    }
    default:
      if (anim.startsWith('mv_')) amp(1.15);
      break;
  }
  return p;
}

// ---- parts --------------------------------------------------------------------------------------------------------

interface Mats {
  I: Ramp;
  ID: Ramp;
  O: Ramp;
  OD: Ramp;
  E: Ramp;
  line: number;
  deep: number;
  accent: number;
  glow: number;
  white: number;
  seam: number;
  /** White-hot accent (phase-2 flames, the strike glint). */
  hot: number;
  /** Drawn for the playable Overseer's shorter frames: a compact crown, a bolder eye and core. */
  fit: boolean;
}

type MotionPose = HeroPose & { anim?: string; f?: number; n?: number };

/** Secondary motion read off the row being drawn: the eye's aperture, the spire crown's flex, the robe's lag. */
interface Motion {
  /** Iris aperture: above 1 dilated (striking, powering up), below 1 narrowed to a point (hit, beaten). */
  iris: number;
  /** Spire tips bent back (+) / forward (-) and down (+) / up (-), in px at the tip. */
  flexX: number;
  flexY: number;
  /** Robe hem: -1 trailing behind the travel .. +1 thrown forward (follow-through); flare 0..1 lifts and spreads it. */
  trail: number;
  flare: number;
  /** 0..1: how hard the claw is striking on this frame (talon glints). */
  strike: number;
  /** A smash's strike frame: the eye throws a star flare. */
  eyeFlare: number;
}

/** The six frames of a move row: wind-up, anticipation, the fast in-between, strike, follow-through, recovery. */
const MOVE_IRIS = [0.85, 0.7, 1.25, 1.6, 1.35, 1.05];
const MOVE_FLEX = [2, -7, 10, 16, -11, -3];
const MOVE_TRAIL = [0, 0.35, -0.6, -1, 0.8, 0.25];
const MOVE_STRIKE = [0, 0, 0.45, 1, 0.55, 0];

function motionOf(p: MotionPose): Motion {
  const anim = p.anim ?? '';
  const f = p.f ?? 0;
  const n = Math.max(1, p.n ?? 1);
  const ph = (f / n) * Math.PI * 2;
  const m: Motion = { iris: 1, flexX: 0, flexY: 0, trail: 0, flare: 0, strike: 0, eyeFlare: 0 };
  if (anim.startsWith('mv_') && n >= 6) {
    const i = Math.min(5, f);
    if (anim === 'mv_taunt' || anim === 'mv_roar') {
      m.iris = [0.9, 1.1, 1.4, 1.7, 1.5, 1.2][i];
      m.flexY = [0, -3, -6, -8, -6, -2][i];
      m.trail = [0, 0.2, 0.4, 0.5, 0.3, 0.1][i];
      return m;
    }
    m.iris = MOVE_IRIS[i];
    m.flexX = MOVE_FLEX[i];
    m.trail = MOVE_TRAIL[i];
    m.strike = MOVE_STRIKE[i];
    if (/^mv_[fud]smash$/.test(anim) || anim === 'mv_ultimate') m.eyeFlare = i === 3 ? 1 : i === 4 ? 0.5 : 0;
    if (/^mv_(nair|fair|bair|uair|dair|upB)$/.test(anim)) m.flexY = [4, 6, -4, -8, -2, 2][i];
    return m;
  }
  switch (anim) {
    case 'idle':
      m.iris = 1 + Math.sin(ph) * 0.06;
      m.flexX = Math.sin(ph) * 1.2;
      break;
    case 'walk':
      m.flexX = 4 + Math.sin(ph * 2) * 1.5;
      m.trail = -0.25 + Math.sin(ph) * 0.15;
      break;
    case 'run':
      m.flexX = 13 + Math.sin(ph * 2) * 2;
      m.flexY = Math.cos(ph * 2) * 2;
      m.trail = -0.8 + Math.sin(ph * 2) * 0.12;
      break;
    case 'dash':
      m.flexX = 18;
      m.trail = -1;
      m.iris = 1.15;
      break;
    case 'skid':
      m.flexX = -12;
      m.trail = 0.9;
      break;
    case 'jump':
    case 'jump2':
      m.flexY = 10 - f * 2;
      m.flare = 0.3;
      break;
    case 'fall':
      m.flexY = -9 + Math.sin(ph) * 1.5;
      m.flare = 0.8 + Math.sin(ph) * 0.1;
      break;
    case 'land':
      m.flexY = f === 0 ? 10 : 3;
      m.flexX = f === 0 ? -3 : 0;
      break;
    case 'hurt':
    case 'hurtL':
    case 'hurtD':
      m.iris = 0.42;
      m.flexX = -10;
      m.trail = 0.8;
      break;
    case 'hurtU':
      m.iris = 0.42;
      m.flexY = 12;
      m.flare = 0.6;
      break;
    case 'dizzy':
      m.iris = 0.5 + Math.sin(ph * 2) * 0.08;
      m.flexX = Math.sin(ph) * 6;
      m.trail = Math.sin(ph) * 0.3;
      break;
    case 'shield':
      m.iris = 0.8;
      m.flexY = 3;
      break;
    case 'roll':
    case 'dodge':
    case 'airdodge':
      m.iris = 0.75;
      m.flexX = 9;
      m.trail = -0.6;
      break;
    case 'grab':
      m.iris = f > 0 ? 1.4 : 1;
      m.flexX = f > 0 ? 8 : 0;
      m.trail = f > 0 ? -0.5 : 0;
      break;
    case 'victory':
      m.iris = 1 + (f / Math.max(1, n - 1)) * 0.6;
      m.flexY = -(f / Math.max(1, n - 1)) * 6;
      break;
    case 'victoryHold':
      m.iris = 1.55 + Math.sin(ph) * 0.05;
      m.flexY = -6;
      break;
    case 'lose':
      m.iris = 0.32;
      m.flexY = 9;
      m.flexX = -4;
      break;
    default:
      break;
  }
  return m;
}

/** A material's five flat tones, dark to light: shadow edge, shade, base, lit, highlight. */
type Ramp = [number, number, number, number, number];

function ramp(r: Raster, base: RGB, lo: RGB, shine: number): Ramp {
  return [
    r.part(mix(lo, [12, 10, 26], 0.3), { flat: true }),
    r.part(mix(base, lo, 0.5), { flat: true }),
    r.part(base, { flat: true }),
    r.part(mix(mul(base, 1.1), [255, 248, 236], shine * 0.35), { flat: true }),
    r.part(mix(mul(base, 1.22), [255, 250, 240], shine), { flat: true }),
  ];
}

/**
 * The spire crown: seven obsidian blades edged in ivory fanning up behind the shoulders from a half ring, the middle one
 * tallest, each tipped with a light. They sway a little with the breath, spread with power and flex with the body's
 * motion (`mo`): the tips lag behind a lunge, whip through on the follow-through, droop on a jump and lift in a fall, the
 * outer blades more than the middle one. Enraged, every blade is broken in two, its upper half held off on a gap of fire
 * with flames licking up off the break.
 */
function spires(r: Raster, M: Mats, cx: number, cy: number, ph: number, p2: boolean, power: number, lean: number, mo: Motion): void {
  const N = 7;
  const fit = M.fit;
  const spread = (p2 ? 1.32 : 1.12) + power * 0.14;
  const ringR = fit ? 34 : 40;
  for (let i = 0; i < N; i++) {
    const u = (i - (N - 1) / 2) / ((N - 1) / 2); // -1 .. 1
    const a = -Math.PI / 2 + u * spread * 1.15 + Math.sin(ph * 1.05 + i) * 0.02 - lean * 0.01;
    const L = (fit ? 86 - Math.abs(u) * 26 : 124 - Math.abs(u) * 44) * (1 + power * 0.06) * (p2 ? 1.12 : 1);
    const r0 = fit ? 32 : 38;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const nx = -dy;
    const ny = dx;
    const wd = (fit ? 8.5 : 9) - Math.abs(u) * 2.5;
    // the flex: a bend that grows with the square of the distance up the blade (a stiff root, a whipping tip), a little
    // out of step from blade to blade so the crown ripples rather than tilting as one piece
    const lag = 0.7 + Math.abs(u) * 0.45 + Math.sin(i * 2.3) * 0.08;
    const bx = -mo.flexX * lag;
    const by = mo.flexY * lag;
    const P = (t: number, v: number): V2 => {
      const q = Math.max(0, (t - r0) / (L - r0));
      return [cx + dx * t + nx * v + bx * q * q, cy + dy * t + ny * v + by * q * q];
    };
    const gap = p2 ? 9 + power * 6 + Math.sin(ph + i) * 1.5 : 0;
    const brk = r0 + (L - r0) * 0.55;
    if (!p2) {
      plate(r, M.OD, (m) => m.poly(0, [P(r0, -wd), P(r0 + (L - r0) * 0.38, -wd * 0.92), P(r0 + (L - r0) * 0.7, -wd * 0.8), P(L, 0), P(r0 + (L - r0) * 0.7, wd * 0.8), P(r0 + (L - r0) * 0.38, wd * 0.92), P(r0, wd)]), { line: M.line });
      // the ivory edge, in two pieces so it follows the bend
      const e0 = P(r0 + 2, -wd + 1.5);
      const e1 = P(r0 + (L - r0) * 0.6, -wd * 0.85 + 1.2);
      const e2 = P(L - 4, -0.6);
      r.seg(M.I[3], e0[0], e0[1], e1[0], e1[1], fit ? 2.4 : 2, fit ? 1.8 : 1.5);
      r.seg(M.I[3], e1[0], e1[1], e2[0], e2[1], fit ? 1.8 : 1.5, 1);
      // a fuller of enamel down the middle of the long blades
      if (Math.abs(u) < 0.7) {
        const f0 = P(r0 + 6, 0.5);
        const f1 = P(r0 + (L - r0) * 0.62, 0.3);
        r.seg(M.E[1], f0[0], f0[1], f1[0], f1[1], 1.6, 1);
      }
    } else {
      plate(r, M.OD, (m) => m.poly(0, [P(r0, -wd), P(brk, -wd * 0.9), P(brk - 3, 0), P(brk, wd * 0.9), P(r0, wd)]), { line: M.line });
      plate(r, M.OD, (m) => m.poly(0, [P(brk + gap, -wd * 0.85), P(L + gap, 0), P(brk + gap, wd * 0.85), P(brk + gap + 3, 0)]), { line: M.line });
      r.seg(M.I[3], ...P(r0 + 2, -wd + 1.5), ...P(brk - 2, -wd + 1.5), 2, 1.6);
      // the fire holding the halves apart
      r.seg(M.accent, ...P(brk - 2, 0), ...P(brk + gap + 1, 0), 3.6, 2.4);
      r.seg(M.glow, ...P(brk, 0), ...P(brk + gap - 1, 0), 1.6, 1);
      // flames licking up off the break, leaning against the motion
      const [fx0, fy0] = P(brk + gap * 0.5, wd * 0.6);
      const fl = 7 + ((i + Math.floor(ph * 2)) % 3) * 3 + power * 4;
      r.seg(M.accent, fx0, fy0, fx0 + mo.flexX * 0.25 - 1, fy0 - fl, 3.2, 0.6);
      r.seg(M.hot, fx0, fy0 - 1, fx0 + mo.flexX * 0.2 - 0.5, fy0 - fl * 0.55, 1.4, 0.4);
    }
    const lit = p2 || power > 0.45 || i % 2 === 1 || i === 3;
    const tip = P(L + gap - 6, 0);
    r.ellipse(lit ? M.accent : M.E[1], tip[0], tip[1], fit ? 2.6 : 2.2, fit ? 2.6 : 2.2);
    if (lit) r.ellipse(M.white, tip[0], tip[1], 0.9, 0.9);
  }
  // the half ring the blades rise from
  for (let j = 0; j < 12; j++) {
    const a0 = Math.PI + (j / 12) * Math.PI;
    const a1 = Math.PI + ((j + 1) / 12) * Math.PI;
    r.seg(M.line, cx + Math.cos(a0) * ringR, cy + Math.sin(a0) * ringR, cx + Math.cos(a1) * ringR, cy + Math.sin(a1) * ringR, 10, 10);
    r.seg(j % 2 ? M.O[2] : M.O[3], cx + Math.cos(a0) * ringR, cy + Math.sin(a0) * ringR, cx + Math.cos(a1) * ringR, cy + Math.sin(a1) * ringR, 7, 7);
  }
  for (let j = 1; j < 6; j++) {
    const a = Math.PI + (j / 6) * Math.PI;
    r.rect(p2 || power > 0.45 ? M.accent : M.seam, cx + Math.cos(a) * ringR - 1, cy + Math.sin(a) * ringR - 1, 2, 2);
  }
}

/** Phase 2: a ring of embers turning slowly behind the broken crown, with a thin burning halo inside it. */
function emberRing(r: Raster, M: Mats, cx: number, cy: number, ph: number, power: number): void {
  const R = (M.fit ? 70 : 96) + power * 8;
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + ph * 0.09;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R * 0.92;
    const big = i % 3 === 0;
    r.seg(M.accent, x, y, x + Math.cos(a + 1.4) * (big ? 6 : 3), y + Math.sin(a + 1.4) * (big ? 6 : 3), big ? 3 : 2, 1);
    if (big) r.ellipse(M.glow, x, y, 1.2, 1.2);
  }
  // the halo: broken arcs of fire, the gaps turning against the embers
  const H = R * 0.8;
  for (let i = 0; i < 24; i++) {
    if ((i + Math.floor(ph * 0.5)) % 4 === 0) continue;
    const a0 = (i / 24) * Math.PI * 2 - ph * 0.05;
    const a1 = a0 + (Math.PI * 2) / 24 - 0.06;
    r.seg(M.accent, cx + Math.cos(a0) * H, cy + Math.sin(a0) * H * 0.92, cx + Math.cos(a1) * H, cy + Math.sin(a1) * H * 0.92, 1.6, 1.6);
  }
}

/** Phase 2: broken shell shards orbiting the body, each with a burning edge and a glowing core. */
function shards(r: Raster, M: Mats, cx: number, cy: number, ph: number, power: number): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + ph * 0.35 + i * 0.4;
    const R = (M.fit ? 60 : 76) + (i % 2) * 14 + power * 10;
    const x = cx + Math.cos(a) * R;
    const y = cy + 20 + Math.sin(a) * R * 0.55;
    // behind the body on the far half of the orbit: only draw the near half so they never cover the face
    if (Math.sin(a) < -0.2 && Math.abs(Math.cos(a)) < 0.6) continue;
    const s = 5 + (i % 3) * 2;
    const t = a * 1.7 + i;
    const pts: V2[] = [0, 1, 2].map((j) => [x + Math.cos(t + j * 2.1) * s * (j === 0 ? 1.4 : 1), y + Math.sin(t + j * 2.1) * s * (j === 0 ? 1.4 : 1)] as V2);
    plate(r, M.ID, (m) => m.poly(0, pts), { line: M.accent });
    r.ellipse(M.hot, x, y, 1, 1);
  }
}

/**
 * Half the robe: long blade-plates hanging from the girdle, fanning out toward the hem (the back half in shade). They
 * swing as a second, lagging body: `sway` carries the trail of the travel and the overshoot of a follow-through, each
 * plate further out lagging a little more, and `mo.flare` lifts and spreads the hem in the air. Enraged, the plates hang
 * loose on glowing gaps with cracks of fire running down them.
 */
function robe(r: Raster, M: Mats, x: number, y: number, hem: number, sway: number, back: boolean, p2: boolean, ph: number, mo: Motion): void {
  const N = back ? 3 : 2;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const off = back ? -6 - u * 22 : -2 + u * 18;
    const fan = (back ? -6 - u * 12 : 2 + u * 10) * (1 + mo.flare * 0.9);
    const loose = p2 ? 4 + ((i + Math.floor(ph)) % 2) * 2 : 0;
    const len = hem - y - (back ? (1 - u) * 4 : 6 + u * 14) - (p2 ? 6 : 0) - mo.flare * (8 + u * 6);
    const sx = x + off;
    const sy = y + loose;
    // the outer plates lag more (and a touch later in the breath) than the inner ones
    const swing = sway * (0.5 + u * 0.7) + Math.sin(ph * 1.05 - 0.6 - u) * 0.8;
    const ex = sx + fan + swing;
    const ey = sy + len;
    const wd0 = back ? 18 : 16;
    const wd1 = (back ? 22 : 18) * (1 + mo.flare * 0.15);
    // a knee in the middle of each plate, so the swing bends it instead of shearing it
    const mx = sx + (ex - sx) * 0.5 - swing * 0.18;
    const my = sy + len * 0.5;
    const wm = (wd0 + wd1) / 4;
    const pts: V2[] = [
      [sx - wd0 / 2, sy],
      [sx + wd0 / 2, sy],
      [mx + wm, my],
      [ex + wd1 / 2, ey - 8],
      [ex, ey],
      [ex - wd1 / 2, ey - 6],
      [mx - wm, my],
    ];
    plate(r, back ? M.ID : M.I, (m) => m.poly(0, pts), { line: M.line, round: !back });
    // an enamel rib down each plate, a light at the foot of the front ones
    r.seg(back ? M.E[0] : M.E[2], sx, sy + 4, mx, my, 2, 1.6);
    r.seg(back ? M.E[0] : M.E[2], mx, my, ex, ey - 10, 1.6, 1.2);
    if (!back && i === 1) r.ellipse(p2 ? M.accent : M.seam, ex, ey - 6, 1.4, 1.4);
    if (p2) {
      r.seg(M.accent, sx - wd0 / 2 + 1, sy - 2, sx + wd0 / 2 - 1, sy - 2, 2, 2);
      if (!back) {
        // a crack of fire down the plate
        const c0: V2 = [sx + 3, sy + 6];
        const c1: V2 = [mx - 2, my - 4];
        const c2: V2 = [mx + 3, my + 6];
        r.seg(M.accent, c0[0], c0[1], c1[0], c1[1], 1.4, 1.2);
        r.seg(M.accent, c1[0], c1[1], c2[0], c2[1], 1.2, 0.8);
      }
    }
  }
}

/**
 * The high collar and the head: two ivory plates rising either side of the neck like a pharaoh's headdress, a smooth
 * ovoid mask with one great eye, and a thin crown of three spikes. Enraged, the mask is split and its jaw is gone.
 */
function head(r: Raster, M: Mats, hx: number, hy: number, hs: number, top: number, ph: number, p2: boolean, power: number, mo: Motion, nod?: V2): void {
  const cx = hx + hs * 0.5 + 2;
  const cy = hy + hs * 0.52;
  const rx = hs * 0.6;
  const ry = hs * 0.74;
  // the collar: a tall plate behind the head on the far side, and a lower one in front
  plate(r, M.OD, (m) => m.poly(0, [[cx - 8, top + 8], [cx - rx - 12, cy + 2], [cx - rx - 8, cy - ry - 6], [cx - 2, cy - 6], [cx + 6, top - 2]]), { line: M.line });
  r.seg(M.I[3], cx - rx - 10, cy, cx - rx - 7, cy - ry - 3, 1.6, 1.2);
  // the neck: an obsidian column of rings
  plate(r, M.OD, (m) => m.rect(0, cx - 7, cy + ry - 8, 14, top - (cy + ry - 8) + 6), { line: M.line });
  for (let y = cy + ry - 4; y < top + 2; y += 4) r.seg(M.O[1], cx - 6, y, cx + 6, y, 1.2, 1.2);
  // the crown: three thin spikes swept back off the brow, the middle one tallest, each tipped with light
  const crown: [number, number, number][] = [
    [-0.55, -28, -14],
    [-0.1, -40, -6],
    [0.3, -26, 4],
  ];
  for (const [u, len, lean] of crown) {
    const bx = cx + u * rx;
    const by = cy - ry * 0.82 + Math.abs(u) * 4;
    const tx = bx + lean - (p2 ? 4 : 0);
    const ty = by + len * (p2 ? 1.2 : 1) * (M.fit ? 0.75 : 1);
    plate(r, M.O, (m) => m.poly(0, [[bx - 4, by + 2], [tx, ty], [bx + 4, by + 2]]), { line: M.line });
    r.ellipse(p2 || power > 0.5 ? M.accent : M.E[2], tx, ty + 2, 1.6, 1.6);
  }
  // the band the spikes rise from
  plate(r, M.OD, (m) => m.poly(0, [[cx - rx + 1, cy - ry * 0.62], [cx - rx * 0.4, cy - ry * 0.92], [cx + rx * 0.5, cy - ry * 0.92], [cx + rx + 1, cy - ry * 0.55], [cx + rx, cy - ry * 0.4], [cx - rx + 2, cy - ry * 0.44]]), { line: M.line });
  // the mask: a smooth egg, slightly pointed at the chin, the far side in shade
  const mask: V2[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const chin = Math.max(0, Math.sin(a)) ** 3 * 4;
    mask.push([cx + Math.cos(a) * rx * (Math.sin(a) > 0 ? 1 - Math.sin(a) * 0.18 : 1), cy + Math.sin(a) * (ry + chin)]);
  }
  plate(r, M.I, (m) => m.poly(0, mask), { line: M.line, round: true });
  plate(r, M.ID, (m) => m.poly(0, mask.filter(([x]) => x <= cx - rx * 0.3).concat([[cx - rx * 0.3, cy + ry * 0.8], [cx - rx * 0.3, cy - ry * 0.9]])), { line: M.line });
  // the eye: a deep socket, an iris of aperture blades, a white-hot pupil (a slit and a second ring when enraged). The
  // aperture is alive: it opens wide on a strike or a cast and shuts to a pinpoint when the Overseer is hit or beaten.
  const ex = cx + rx * 0.28;
  const ey = cy - ry * 0.08;
  const R = hs * (M.fit ? 0.4 : 0.34) + (p2 ? 1.5 : 0);
  r.ellipse(M.line, ex, ey, R + 2.5, R + 2.5);
  r.ellipse(M.deep, ex, ey, R + 1.5, R + 1.5);
  r.ellipse(M.accent, ex, ey, R, R);
  r.ellipse(M.deep, ex, ey, R - 2, R - 2);
  const iris = Math.max(0.3, Math.min(1.8, mo.iris * (1 + power * 0.25)));
  const pr = Math.min(R - 2.6, R * 0.38 * iris * (nod && nod[1] > 2 ? 0.6 : 1));
  const spin = ph * 0.5 + (iris - 1) * 0.9; // the blades turn as they open
  // the six blades reach in from the rim to just outside the pupil: long and overlapping when it narrows, short when wide
  const inner = Math.max(pr + 0.8, R * 0.22);
  for (let i = 0; i < 6; i++) {
    const a = spin + (i * Math.PI) / 3;
    r.seg(M.E[1], ex + Math.cos(a) * (R - 2.5), ey + Math.sin(a) * (R - 2.5), ex + Math.cos(a + 1) * inner, ey + Math.sin(a + 1) * inner, M.fit ? 1.6 : 1.2, 1.2);
  }
  if (iris > 1.15) {
    // wide open: a ring of light just inside the rim
    for (let i = 0; i < 12; i += 2) {
      const a0 = (i / 12) * Math.PI * 2 + spin;
      const a1 = ((i + 1) / 12) * Math.PI * 2 + spin;
      r.seg(M.accent, ex + Math.cos(a0) * (R - 1.2), ey + Math.sin(a0) * (R - 1.2), ex + Math.cos(a1) * (R - 1.2), ey + Math.sin(a1) * (R - 1.2), 1, 1);
    }
  }
  if (p2) {
    r.ellipse(M.accent, ex, ey, Math.max(0.8, pr * 0.75), pr * 1.5);
    r.ellipse(M.white, ex, ey, Math.max(0.6, pr * 0.3), pr * 1.2);
    // the second ring outside the socket
    for (let i = 0; i < 16; i += 2) {
      const a0 = (i / 16) * Math.PI * 2 - spin;
      const a1 = ((i + 1) / 16) * Math.PI * 2 - spin;
      r.seg(M.accent, ex + Math.cos(a0) * (R + 5), ey + Math.sin(a0) * (R + 5), ex + Math.cos(a1) * (R + 5), ey + Math.sin(a1) * (R + 5), 1.4, 1.4);
    }
    // flame streaming back off the burning eye
    const fl = 10 + power * 8 + (Math.floor(ph * 2) % 2) * 3;
    r.seg(M.accent, ex - R * 0.4, ey - R - 3, ex - R - fl, ey - R - fl * 0.6, 3, 0.6);
    r.seg(M.hot, ex - R * 0.3, ey - R - 3, ex - R - fl * 0.5, ey - R - fl * 0.35, 1.4, 0.4);
  } else {
    r.ellipse(M.glow, ex, ey, pr, pr);
    r.ellipse(M.white, ex - pr * 0.25, ey - pr * 0.25, Math.max(0.7, pr * 0.45), Math.max(0.7, pr * 0.45));
  }
  if (power > 0.2) {
    // powering up: the eye throws a flare forward and a cross of light
    const L = 6 + power * 16;
    r.seg(M.glow, ex + R, ey, ex + R + L, ey, 2, 0.6);
    r.seg(M.accent, ex, ey - R - 1, ex, ey - R - L * 0.5, 1.4, 0.5);
    r.seg(M.accent, ex, ey + R + 1, ex, ey + R + L * 0.5, 1.4, 0.5);
  }
  if (mo.eyeFlare > 0) {
    // a smash lands: a four-point star glint bursts off the eye
    const L = (M.fit ? 18 : 22) * mo.eyeFlare;
    for (const [dx, dy, k] of [[1, 0, 1], [-1, 0, 0.6], [0, -1, 0.75], [0, 1, 0.75]] as [number, number, number][]) {
      r.seg(M.glow, ex + dx * (R - 1), ey + dy * (R - 1), ex + dx * (R + L * k), ey + dy * (R + L * k), 2.6, 0.5);
      r.seg(M.white, ex + dx * (R - 1), ey + dy * (R - 1), ex + dx * (R + L * k * 0.6), ey + dy * (R + L * k * 0.6), 1.2, 0.4);
    }
  }
  if (p2) {
    // the split: a burning seam from the crown through the eye to the chin, and the broken jaw
    const seam: V2[] = [[cx - 2, cy - ry], [cx + 2, cy - ry * 0.6], [ex - R - 1, ey - 2], [ex - R + 2, ey + R], [cx + 4, cy + ry * 0.55], [cx, cy + ry + 2]];
    for (let i = 0; i + 1 < seam.length; i++) r.seg(M.accent, seam[i][0], seam[i][1], seam[i + 1][0], seam[i + 1][1], 2.2, 1.6);
    r.poly(M.deep, [[cx + 6, cy + ry * 0.45], [cx + rx + 1, cy + ry * 0.2], [cx + rx - 2, cy + ry * 0.8], [cx + 8, cy + ry + 2]]);
    for (let i = 0; i < 3; i++) r.seg(M.accent, cx + 9 + i * 3, cy + ry * 0.55 + i, cx + 9 + i * 3, cy + ry * 0.85, 1.2, 1.2);
  } else {
    // a single fine line down the mask under the eye: the only mark on the face
    r.seg(M.E[2], ex, ey + R + 3, ex - 1, cy + ry * 0.8, 1.2, 0.6);
  }
}

/** Upper arm (a thin obsidian limb), elbow, the ivory vambrace with its back fin, and the claw. */
function arm(r: Raster, M: Mats, sh: V2, el: V2, hand: V2, back: boolean, p2: boolean, power: number, mo: Motion): void {
  const [hx, hy] = hand;
  let dx = hx - el[0];
  let dy = hy - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const nx = -dy;
  const ny = dx;
  const wr: V2 = [hx - dx * 8, hy - dy * 8];
  plate(r, back ? M.OD : M.O, (m) => m.seg(0, sh[0], sh[1], el[0], el[1], 15, 12), { line: M.line, round: !back });
  r.seg(M.seam, sh[0] + 3, sh[1] + 3, el[0] + 2, el[1] - 2, 1.4, 1.4);
  plate(r, back ? M.OD : M.O, (m) => m.ellipse(0, el[0], el[1], 7, 7), { line: M.line, round: true });
  // the vambrace: a long tapered blade along the forearm, its fin running back past the elbow
  const side = ny > 0 ? -1 : 1; // the fin rides the outer (upper) side of the forearm
  const F = (u: number, v: number): V2 => [el[0] + (wr[0] - el[0]) * u + nx * v * side, el[1] + (wr[1] - el[1]) * u + ny * v * side];
  const vamb: V2[] = [F(-0.32, 12), F(0.05, 9), F(0.95, 8), F(1.02, 0), F(0.95, -7), F(0.1, -7)];
  plate(r, back ? M.ID : M.I, (m) => m.poly(0, vamb), { line: M.line, round: !back });
  r.seg(back ? M.E[0] : M.E[2], ...F(0.1, 2), ...F(0.9, 1), 2.4, 1.6);
  if (p2) {
    // an energy blade burning along the fin
    r.seg(M.accent, ...F(-0.42, 15), ...F(0.9, 11), 3, 1.2);
    r.seg(M.glow, ...F(-0.3, 14), ...F(0.8, 11), 1.2, 0.6);
  } else if (!back || power > 0.5) r.seg(M.seam, ...F(0.2, 6), ...F(0.85, 5), 1.2, 1.2);
  claw(r, M, hand, [dx, dy], back, p2, back ? 0 : mo.strike);
}

/** Three long ivory talons and a thumb spur off a small obsidian palm, curled a little. */
function claw(r: Raster, M: Mats, h: V2, dir: V2, back: boolean, p2: boolean, strike = 0): void {
  const [x, y] = h;
  const [dx, dy] = dir;
  const nx = -dy;
  const ny = dx;
  const P = (u: number, v: number): V2 => [x + dx * u + nx * v, y + dy * u + ny * v];
  plate(r, back ? M.OD : M.O, (m) => m.ellipse(0, x - dx * 3, y - dy * 3, 8, 8), { line: M.line, round: true });
  const tal: [number, number][] = [
    [-7, -0.5],
    [0, 0],
    [7, 0.5],
  ];
  for (const [v, bend] of tal) {
    const a = P(2, v);
    const m = P(12, v * 1.3 + bend * 3);
    const t = P(20, v * 1.1 + 3 + bend * 2);
    r.seg(M.line, ...a, ...m, 6, 5);
    r.seg(M.line, ...m, ...t, 5, 1.6);
    r.seg(back ? M.ID[2] : M.I[2], ...a, ...m, 4, 3.4);
    r.seg(back ? M.ID[1] : M.I[3], ...m, ...t, 3.4, 0.8);
    if (strike > 0.4) {
      // striking: the talon edges catch the light, violet along the blade and white-hot at the point
      r.seg(M.accent, ...m, ...t, 1.4, 0.6);
      r.ellipse(strike > 0.8 ? M.white : M.glow, t[0], t[1], 1.2, 1.2);
    } else if (p2 && !back) r.ellipse(M.accent, t[0], t[1], 0.9, 0.9);
  }
  // the thumb spur
  const s0 = P(-2, -9);
  const s1 = P(8, -14);
  r.seg(M.line, ...s0, ...s1, 5, 1.6);
  r.seg(back ? M.ID[1] : M.I[2], ...s0, ...s1, 3.2, 0.8);
}

/** Thigh, the knee spike, the greave and the pointed sabaton (the far leg in shade). */
function leg(r: Raster, M: Mats, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  plate(r, back ? M.OD : M.O, (m) => m.seg(0, hip[0], hip[1], kn[0], kn[1], 20, 16), { line: M.line, round: !back });
  // the greave: an ivory shin plate tapering to the ankle
  plate(r, back ? M.ID : M.I, (m) => m.seg(0, kn[0], kn[1] + 2, ankle[0], ankle[1] - 6, 20, 12), { line: M.line, round: !back });
  r.seg(back ? M.E[0] : M.E[2], kn[0] + 4, kn[1] + 8, ankle[0] + 3, ankle[1] - 12, 2, 1.2);
  // the knee spike, forward
  plate(r, back ? M.ID : M.I, (m) => m.poly(0, [[kn[0] - 6, kn[1] - 8], [kn[0] + 18, kn[1] - 2], [kn[0] - 2, kn[1] + 8]]), { line: M.line });
  // the sabaton: a long pointed foot, raised heel
  const [bx, by] = ankle;
  plate(r, back ? M.OD : M.O, (m) => m.poly(0, [[bx - 12, by - 8], [bx + 8, by - 10], [bx + 34, by + 4], [bx + 22, by + 6], [bx - 14, by + 6]]), { line: M.line, round: !back });
  plate(r, back ? M.ID : M.I, (m) => m.poly(0, [[bx + 4, by - 8], [bx + 34, by + 4], [bx + 14, by + 2]]), { line: M.line });
}

/** A scratch coverage mask (same size as the frame) that remembers the box it was painted in. */
class Mask extends Raster {
  bx0 = 1e9;
  by0 = 1e9;
  bx1 = -1;
  by1 = -1;
  override set(_p: number, x: number, y: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.id[y * this.w + x] = 1;
    if (x < this.bx0) this.bx0 = x;
    if (x > this.bx1) this.bx1 = x;
    if (y < this.by0) this.by0 = y;
    if (y > this.by1) this.by1 = y;
  }
  clear(): void {
    for (let y = this.by0; y <= this.by1; y++) this.id.fill(0, y * this.w + this.bx0, y * this.w + this.bx1 + 1);
    this.bx0 = this.by0 = 1e9;
    this.bx1 = this.by1 = -1;
  }
}
let scratch: Mask | null = null;

/**
 * Paint one plate: `draw` lays its shape into a mask, which is then filled from `R` with a bevel lit from up-front (the
 * boss faces +x): the top edge takes the highlight, the front edge the lit tone, the back edge and the row above the
 * bottom the shade, and the bottom edge the shadow. `round` adds a soft specular high on the front of the interior and
 * shade low at the back; `soft` (cloth) skips the hard top highlight; `line` draws a 1px dark keyline around it first so
 * a piece reads apart from whatever it overlaps; `clip` keeps only the part of the shape inside [x0, y0, x1, y1).
 */
function plate(r: Raster, R: Ramp, draw: (m: Raster) => void, o: { line?: number; round?: boolean; soft?: boolean; clip?: [number, number, number, number] } = {}): void {
  if (!scratch || scratch.w !== r.w || scratch.h !== r.h) scratch = new Mask(r.w, r.h);
  const m = scratch;
  draw(m);
  if (m.bx1 < 0) return;
  const W = r.w;
  const id = m.id;
  if (o.clip) {
    const [cx0, cy0, cx1, cy1] = o.clip;
    for (let y = m.by0; y <= m.by1; y++) for (let x = m.bx0; x <= m.bx1; x++) if (x < cx0 || y < cy0 || x >= cx1 || y >= cy1) id[y * W + x] = 0;
  }
  const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < r.h && id[y * W + x] === 1;
  if (o.line !== undefined) {
    for (let y = m.by0 - 1; y <= m.by1 + 1; y++)
      for (let x = m.bx0 - 1; x <= m.bx1 + 1; x++) if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) r.set(o.line, x, y);
  }
  const bw = Math.max(1, m.bx1 - m.bx0);
  const bh = Math.max(1, m.by1 - m.by0);
  const sx = m.bx0 + bw * 0.64;
  const sy = m.by0 + bh * 0.3;
  const run = (x: number, y: number, dx: number, dy: number): number => {
    let n = 0;
    while (n < 3 && at(x + dx * (n + 1), y + dy * (n + 1))) n++;
    return n;
  };
  for (let y = m.by0; y <= m.by1; y++)
    for (let x = m.bx0; x <= m.bx1; x++) {
      if (!at(x, y)) continue;
      const u = run(x, y, 0, -1);
      const d = run(x, y, 0, 1);
      const f = run(x, y, 1, 0);
      const b = run(x, y, -1, 0);
      let t = 2;
      if (d === 0) t = 0;
      else if (u === 0) t = o.soft ? 3 : 4;
      else if (f === 0) t = 3;
      else if (b === 0 || d === 1) t = 1;
      else if (u === 1 && !o.soft) t = 3;
      else {
        const fu = (x - m.bx0) / bw;
        const fv = (y - m.by0) / bh;
        if (o.round) {
          const ex = (x - sx) / (bw * 0.26);
          const ey = (y - sy) / (bh * 0.2);
          if (ex * ex + ey * ey < 1) t = 3;
          else if (fv > 0.7 || (fu < 0.25 && fv > 0.4)) t = 1;
        } else if (bh > 12 && fv > 0.72) t = 1;
      }
      r.set(R[t], x, y);
    }
  m.clear();
}

/** `v` kept inside the box; the same object back when it already was (so callers can tell whether it moved). */
/** `v` moved back towards `from` along their line until it lies inside the box (or `v` itself when it already does). */
function clampRay(from: V2, v: V2, x0: number, x1: number, y0: number, y1: number): V2 {
  if (v[0] >= x0 && v[0] <= x1 && v[1] >= y0 && v[1] <= y1) return v;
  const dx = v[0] - from[0];
  const dy = v[1] - from[1];
  let t = 1;
  if (v[0] > x1 && dx > 0) t = Math.min(t, (x1 - from[0]) / dx);
  if (v[0] < x0 && dx < 0) t = Math.min(t, (x0 - from[0]) / dx);
  if (v[1] > y1 && dy > 0) t = Math.min(t, (y1 - from[1]) / dy);
  if (v[1] < y0 && dy < 0) t = Math.min(t, (y0 - from[1]) / dy);
  return clampV([from[0] + dx * Math.max(0, t), from[1] + dy * Math.max(0, t)], x0, x1, y0, y1);
}
function clampV(v: V2, x0: number, x1: number, y0: number, y1: number): V2 {
  const x = Math.max(x0, Math.min(x1, v[0]));
  const y = Math.max(y0, Math.min(y1, v[1]));
  return x === v[0] && y === v[1] ? v : [x, y];
}

/**
 * `x` nudged just far enough that none of the tones the shader can give it lands within reach of the accent or its bloom
 * white (the finishing pass blooms any pixel near those). Leans darker by the smallest step that clears.
 */
function keepClear(x: RGB, accent: RGB, o: { flat?: boolean; soft?: boolean }): RGB {
  const hot = mul(accent, 1.55);
  const far = (a: RGB, b: RGB): boolean => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) >= 50;
  const warm: RGB = [255, 242, 214];
  const cool: RGB = [28, 18, 72];
  const tones = (v: RGB): RGB[] => {
    if (o.flat) return [v];
    const out: RGB[] = [];
    for (const vol of [0.92, 1.06]) {
      const b = mul(v, vol);
      const lit = mix(mul(b, o.soft ? 1.12 : 1.3), warm, 0.1);
      out.push(b, lit, mul(b, 1.1), mix(mul(b, o.soft ? 0.8 : 0.66), cool, 0.2), mix(mul(lit, o.soft ? 0.8 : 0.66), cool, 0.2), mix(mul(b, 0.86), cool, 0.08), mul(b, 0.92));
    }
    return out;
  };
  const ok = (v: RGB): boolean => tones(v).every((t) => far(t, accent) && far(t, hot));
  if (ok(x)) return x;
  for (let n = 1; n <= 14; n++) {
    const v = mix(x, mul(x, 0.55), Math.min(1, n * 0.07));
    if (ok(v)) return v;
  }
  return mul(x, 0.5);
}

/** Hold every non-emissive part this drawer creates clear of the glow colours: only parts made emissive on purpose bloom. */
function guardGlow(r: Raster, accent: RGB): void {
  const raw = r.part.bind(r);
  r.part = (c: RGB, o: { emissive?: boolean; flat?: boolean; soft?: boolean } = {}): number => (o.emissive ? raw(c, o) : raw(keepClear(c, accent, o), o));
}
