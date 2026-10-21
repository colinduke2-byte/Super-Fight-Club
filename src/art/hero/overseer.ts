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
  const k = k0.pose.laid ? k0 : skeleton(look, bossPose(k0.pose), k0.W, k0.H, k0.phase);
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const accent = col(look.accent);
  guardGlow(r, accent); // no part blooms unless it is emissive on purpose
  const p2 = (look.outfit ?? 0) === 1;
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
  };
  const T = k.torso;
  const ph = k.phase;
  const hx = k.head.x;
  const hy = k.head.y - 14; // the head stands clear of the collar on a neck
  const hs = k.head.s;
  const x0 = T.x;
  const top = T.y;
  const w = T.w;
  const h = T.h;
  const waistY = top + h * 0.62;
  const midX = x0 + w * 0.52;
  // the long arms and the sabatons stay inside the frame on the widest reaches
  const handF = clampV(k.handF, 30, r.w - 34, 30, r.h - 18);
  const handB = clampV(k.handB, 30, r.w - 34, 30, r.h - 18);
  const ankleF = clampV(k.ankleF, 30, r.w - 40, 0, k.base - 8);
  const ankleB = clampV(k.ankleB, 30, r.w - 40, 0, k.base - 8);
  const elbowF = handF === k.handF ? k.elbowF : solveLimb(k.shF, handF, k.armBone, 1).mid;
  const elbowB = handB === k.handB ? k.elbowB : solveLimb(k.shB, handB, k.armBone, 1).mid;
  const sway = Math.sin(ph * 1.05) * 2.5 - k.pose.lean * 1.4;

  // ---- the spire crown behind the shoulders (a ring of embers behind it once enraged) ----
  const neck: V2 = [hx + hs * 0.5, top + 10];
  if (p2) emberRing(r, M, neck[0], neck[1] - 16, ph, power);
  spires(r, M, neck[0] - 6, neck[1] + 6, ph, p2, power, k.pose.lean);

  // ---- the back of the robe: blade-plates hanging from the hips, in shade ----
  const hem = k.base - 4;
  robe(r, M, k.hipB[0] - 4, k.hipY - 4, hem, sway, true, p2, ph);

  // ---- back arm and back leg (in shade) ----
  arm(r, M, k.shB, elbowB, handB, true, p2, power);
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
    const dia = (rx: number, ry: number): V2[] => [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
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
  robe(r, M, k.hipF[0] + 6, k.hipY - 2, hem, sway, false, p2, ph);
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
  head(r, M, hx, hy, hs, top, ph, p2, power, k.pose.head);

  // ---- front arm, then the horned pauldron over the shoulder ----
  arm(r, M, k.shF, elbowF, handF, false, p2, power);
  {
    const [sx, sy] = k.shF;
    const px = Math.min(sx + 2, r.w - 40);
    const py = sy - 2;
    // a swept horn rising off the back of the shoulder
    plate(r, M.I, (m) => m.poly(0, [[px - 14, py - 4], [px - 22, py - 44], [px - 8, py - 22], [px + 2, py - 8]]), { line: M.line });
    r.seg(M.E[2], px - 14, py - 10, px - 19, py - 36, 2, 1);
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

/** Victory: the claw rises, the arena's light gathers in it; held there. */
const VICTORY: Key[] = [
  [2, 6, [10, -4], [-8, -2], [8, 0], [-8, 0]],
  [-2, 2, [14, -24], [-16, -12], [8, 0], [-8, 0]],
  [-4, 0, [10, -52], [-20, -20], [8, 0], [-8, 0]],
  [-5, 0, [8, -58], [-22, -18], [8, 0], [-8, 0]],
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
      key(p, [-1, b * 0.6, [12 + s * 0.8, -22 - b * 1.2], [-10, -2 + b], [8, 0], [-8, 0]]);
      p.bob = b * 0.9 - 0.2;
      p.wing = 0.12 + b * 0.08;
      break;
    }
    case 'walk':
      // a slow, gliding advance: short steps, upright, the claws carried still
      p.frontFoot = [s * 6, Math.max(0, -c) * 2];
      p.backFoot = [-s * 6, Math.max(0, c) * 2];
      p.frontHand = [10, -16 + s * 0.6];
      p.backHand = [-12 + s, -4];
      p.lean = 1;
      p.bob = Math.abs(s) * 0.5;
      p.crouch = 0.5;
      break;
    case 'run':
      // a predator's lope: leaning hard in, both claws swept back and low
      p.lean = 7 + s * 0.6;
      p.frontHand = [-8 + s * 3, 2];
      p.backHand = [-20 - s * 3, -4];
      p.crouch = (p.crouch ?? 0) + 2;
      break;
    case 'dash':
      p.lean = 10;
      p.crouch += 3;
      p.frontHand = [-14, -2];
      p.backHand = [-24, -10];
      break;
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
    case 'held':
      key(p, [-4, 0, [12, -34], [-10, -34], [4, 6], [-4, 8]]);
      p.head = [-1.5, -0.5];
      break;
    case 'hurt':
    case 'hurtL':
    case 'hurtU':
    case 'hurtD':
    case 'dizzy':
      amp(1.6);
      p.wing = anim === 'dizzy' ? 0.05 : 0.2;
      break;
    case 'victory':
      key(p, track(VICTORY, f / Math.max(1, n - 1)));
      p.wing = 0.3 + (f / Math.max(1, n - 1)) * 0.7;
      break;
    case 'victoryHold': {
      const b = (1 - c) / 2;
      key(p, VICTORY[VICTORY.length - 1]);
      p.frontHand = [p.frontHand[0], p.frontHand[1] + b * 1.2];
      p.bob = b * 0.8 - 0.2;
      p.wing = 0.9 + b * 0.1;
      break;
    }
    case 'lose': {
      // brought down to one knee, a claw planted on the floor, the head bowed and the eye dim
      const b = (1 - c) / 2;
      key(p, [7, 16, [22, 18 + b], [-4, 10 + b], [14, 0], [-14, 0]]);
      p.head = [2, 4 + b * 0.6];
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
 * tallest, each tipped with a light. They sway a little with the breath and spread with power. Enraged, every blade is
 * broken in two, its upper half held off on a gap of fire.
 */
function spires(r: Raster, M: Mats, cx: number, cy: number, ph: number, p2: boolean, power: number, lean: number): void {
  const N = 7;
  const spread = (p2 ? 1.32 : 1.12) + power * 0.14;
  for (let i = 0; i < N; i++) {
    const u = (i - (N - 1) / 2) / ((N - 1) / 2); // -1 .. 1
    const a = -Math.PI / 2 + u * spread * 1.15 + Math.sin(ph * 1.05 + i) * 0.02 - lean * 0.01;
    const L = (124 - Math.abs(u) * 44) * (1 + power * 0.06) * (p2 ? 1.12 : 1);
    const r0 = 38;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const nx = -dy;
    const ny = dx;
    const wd = 9 - Math.abs(u) * 2.5;
    const P = (t: number, v: number): V2 => [cx + dx * t + nx * v, cy + dy * t + ny * v];
    const gap = p2 ? 9 + power * 6 + Math.sin(ph + i) * 1.5 : 0;
    const brk = r0 + (L - r0) * 0.55;
    if (!p2) {
      plate(r, M.OD, (m) => m.poly(0, [P(r0, -wd), P(r0 + (L - r0) * 0.7, -wd * 0.8), P(L, 0), P(r0 + (L - r0) * 0.7, wd * 0.8), P(r0, wd)]), { line: M.line });
      r.seg(M.I[3], ...P(r0 + 2, -wd + 1.5), ...P(L - 4, -0.6), 2, 1);
    } else {
      plate(r, M.OD, (m) => m.poly(0, [P(r0, -wd), P(brk, -wd * 0.9), P(brk - 3, 0), P(brk, wd * 0.9), P(r0, wd)]), { line: M.line });
      plate(r, M.OD, (m) => m.poly(0, [P(brk + gap, -wd * 0.85), P(L + gap, 0), P(brk + gap, wd * 0.85), P(brk + gap + 3, 0)]), { line: M.line });
      r.seg(M.I[3], ...P(r0 + 2, -wd + 1.5), ...P(brk - 2, -wd + 1.5), 2, 1.6);
      // the fire holding the halves apart
      r.seg(M.accent, ...P(brk - 2, 0), ...P(brk + gap + 1, 0), 3.6, 2.4);
      r.seg(M.glow, ...P(brk, 0), ...P(brk + gap - 1, 0), 1.6, 1);
    }
    const lit = p2 || power > 0.45 || i % 2 === 1 || i === 3;
    const tip = P(L + gap - 6, 0);
    r.ellipse(lit ? M.accent : M.E[1], tip[0], tip[1], 2.2, 2.2);
    if (lit) r.ellipse(M.white, tip[0], tip[1], 0.9, 0.9);
  }
  // the half ring the blades rise from
  for (let j = 0; j <= 12; j++) {
    const a0 = Math.PI + (j / 12) * Math.PI;
    const a1 = Math.PI + ((j + 1) / 12) * Math.PI;
    if (j === 12) break;
    r.seg(M.line, cx + Math.cos(a0) * 40, cy + Math.sin(a0) * 40, cx + Math.cos(a1) * 40, cy + Math.sin(a1) * 40, 10, 10);
    r.seg(j % 2 ? M.O[2] : M.O[3], cx + Math.cos(a0) * 40, cy + Math.sin(a0) * 40, cx + Math.cos(a1) * 40, cy + Math.sin(a1) * 40, 7, 7);
  }
  for (let j = 1; j < 6; j++) {
    const a = Math.PI + (j / 6) * Math.PI;
    r.rect(p2 || power > 0.45 ? M.accent : M.seam, cx + Math.cos(a) * 40 - 1, cy + Math.sin(a) * 40 - 1, 2, 2);
  }
}

/** Phase 2: a ring of embers turning slowly behind the broken crown. */
function emberRing(r: Raster, M: Mats, cx: number, cy: number, ph: number, power: number): void {
  const R = 96 + power * 8;
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + ph * 0.09;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R * 0.92;
    const big = i % 3 === 0;
    r.seg(M.accent, x, y, x + Math.cos(a + 1.4) * (big ? 6 : 3), y + Math.sin(a + 1.4) * (big ? 6 : 3), big ? 3 : 2, 1);
    if (big) r.ellipse(M.glow, x, y, 1.2, 1.2);
  }
}

/** Phase 2: broken shell shards orbiting the body, each with a burning edge. */
function shards(r: Raster, M: Mats, cx: number, cy: number, ph: number, power: number): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + ph * 0.35 + i * 0.4;
    const R = 76 + (i % 2) * 14 + power * 10;
    const x = cx + Math.cos(a) * R;
    const y = cy + 20 + Math.sin(a) * R * 0.55;
    // behind the body on the far half of the orbit: only draw the near half so they never cover the face
    if (Math.sin(a) < -0.2 && Math.abs(Math.cos(a)) < 0.6) continue;
    const s = 5 + (i % 3) * 2;
    const t = a * 1.7 + i;
    const pts: V2[] = [0, 1, 2].map((j) => [x + Math.cos(t + j * 2.1) * s * (j === 0 ? 1.4 : 1), y + Math.sin(t + j * 2.1) * s * (j === 0 ? 1.4 : 1)] as V2);
    plate(r, M.ID, (m) => m.poly(0, pts), { line: M.accent });
  }
}

/**
 * Half the robe: long blade-plates hanging from the girdle, fanning out toward the hem and swaying with the stride
 * (the back half in shade). Enraged, the plates hang loose on glowing gaps.
 */
function robe(r: Raster, M: Mats, x: number, y: number, hem: number, sway: number, back: boolean, p2: boolean, ph: number): void {
  const N = back ? 3 : 2;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const off = back ? -6 - u * 22 : -2 + u * 18;
    const fan = back ? -6 - u * 12 : 2 + u * 10;
    const loose = p2 ? 4 + ((i + Math.floor(ph)) % 2) * 2 : 0;
    const len = hem - y - (back ? (1 - u) * 4 : 6 + u * 14) - (p2 ? 6 : 0);
    const sx = x + off;
    const sy = y + loose;
    const ex = sx + fan + sway * (0.5 + u * 0.5);
    const ey = sy + len;
    const wd0 = back ? 18 : 16;
    const wd1 = back ? 22 : 18;
    const pts: V2[] = [
      [sx - wd0 / 2, sy],
      [sx + wd0 / 2, sy],
      [ex + wd1 / 2, ey - 8],
      [ex, ey],
      [ex - wd1 / 2, ey - 6],
    ];
    plate(r, back ? M.ID : M.I, (m) => m.poly(0, pts), { line: M.line, round: !back });
    // an enamel rib down each plate, a light at the foot of the front ones
    r.seg(back ? M.E[0] : M.E[2], sx, sy + 4, ex, ey - 10, 2, 1.2);
    if (!back && i === 1) r.ellipse(p2 ? M.accent : M.seam, ex, ey - 6, 1.4, 1.4);
    if (p2) r.seg(M.accent, sx - wd0 / 2 + 1, sy - 2, sx + wd0 / 2 - 1, sy - 2, 2, 2);
  }
}

/**
 * The high collar and the head: two ivory plates rising either side of the neck like a pharaoh's headdress, a smooth
 * ovoid mask with one great eye, and a thin crown of three spikes. Enraged, the mask is split and its jaw is gone.
 */
function head(r: Raster, M: Mats, hx: number, hy: number, hs: number, top: number, ph: number, p2: boolean, power: number, nod?: V2): void {
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
    const ty = by + len * (p2 ? 1.2 : 1);
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
  // the eye: a deep socket, an iris of aperture blades, a white-hot pupil (a slit and a second ring when enraged)
  const ex = cx + rx * 0.28;
  const ey = cy - ry * 0.08;
  const R = hs * 0.34 + (p2 ? 1.5 : 0);
  r.ellipse(M.line, ex, ey, R + 2.5, R + 2.5);
  r.ellipse(M.deep, ex, ey, R + 1.5, R + 1.5);
  r.ellipse(M.accent, ex, ey, R, R);
  r.ellipse(M.deep, ex, ey, R - 2, R - 2);
  const spin = ph * 0.5;
  for (let i = 0; i < 6; i++) {
    const a = spin + (i * Math.PI) / 3;
    r.seg(M.E[1], ex + Math.cos(a) * (R - 2.5), ey + Math.sin(a) * (R - 2.5), ex + Math.cos(a + 1) * (R * 0.35), ey + Math.sin(a + 1) * (R * 0.35), 1.2, 1.2);
  }
  const pr = R * 0.38 * (1 + power * 0.4) * (nod && nod[1] > 2 ? 0.6 : 1);
  if (p2) {
    r.ellipse(M.accent, ex, ey, pr * 0.75, pr * 1.5);
    r.ellipse(M.white, ex, ey, pr * 0.3, pr * 1.2);
    // the second ring outside the socket
    for (let i = 0; i < 16; i += 2) {
      const a0 = (i / 16) * Math.PI * 2 - spin;
      const a1 = ((i + 1) / 16) * Math.PI * 2 - spin;
      r.seg(M.accent, ex + Math.cos(a0) * (R + 5), ey + Math.sin(a0) * (R + 5), ex + Math.cos(a1) * (R + 5), ey + Math.sin(a1) * (R + 5), 1.4, 1.4);
    }
  } else {
    r.ellipse(M.glow, ex, ey, pr, pr);
    r.ellipse(M.white, ex - pr * 0.25, ey - pr * 0.25, pr * 0.45, pr * 0.45);
  }
  if (power > 0.2) {
    // powering up: the eye throws a flare forward and a cross of light
    const L = 6 + power * 16;
    r.seg(M.glow, ex + R, ey, ex + R + L, ey, 2, 0.6);
    r.seg(M.accent, ex, ey - R - 1, ex, ey - R - L * 0.5, 1.4, 0.5);
    r.seg(M.accent, ex, ey + R + 1, ex, ey + R + L * 0.5, 1.4, 0.5);
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
function arm(r: Raster, M: Mats, sh: V2, el: V2, hand: V2, back: boolean, p2: boolean, power: number): void {
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
  claw(r, M, hand, [dx, dy], back, p2);
}

/** Three long ivory talons and a thumb spur off a small obsidian palm, curled a little. */
function claw(r: Raster, M: Mats, h: V2, dir: V2, back: boolean, p2: boolean): void {
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
    if (p2 && !back) r.set(M.accent, t[0], t[1]);
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
