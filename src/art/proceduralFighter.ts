import Phaser from 'phaser';
import type { CharacterData, PlaceholderLook } from '../engine/types';

/**
 * Placeholder pixel-art generator (64x64 frames). Draws every animation frame with canvas rects and
 * limbs, adds rim-light / under-shade / outline passes, then packs frames into a sprite sheet laid
 * out like a real one: one animation per row, frames left-to-right. Swapping in real art only needs
 * `sprite.sheetUrl` in the character data (see BootScene).
 */

type V2 = [number, number];

interface Pose {
  bob: number;
  crouch: number;
  lean: number;
  frontFoot: V2; // [dx, lift]
  backFoot: V2;
  frontHand: V2; // offset from resting hang
  backHand: V2;
  lying?: boolean;
}

const REST: Pose = { bob: 0, crouch: 0, lean: 0, frontFoot: [4, 0], backFoot: [-4, 0], frontHand: [2, 0], backHand: [-2, 0] };

function poseFor(anim: string, f: number, frames: number): Pose {
  const p: Pose = { ...REST };
  switch (anim) {
    case 'idle': {
      const b = [0, 0, 1, 1][f % 4];
      p.bob = b;
      p.frontHand = [2, b];
      p.backHand = [-2, b];
      break;
    }
    case 'run': {
      const ph = (f / frames) * Math.PI * 2;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      p.frontFoot = [Math.round(s * 11), Math.max(0, Math.round(-c * 7))];
      p.backFoot = [-Math.round(s * 11), Math.max(0, Math.round(c * 7))];
      p.bob = Math.abs(s) > 0.7 ? 2 : 0;
      p.lean = 3;
      p.frontHand = [-Math.round(s * 7), -2];
      p.backHand = [Math.round(s * 7), -2];
      break;
    }
    case 'crouch':
      p.crouch = 7;
      p.frontFoot = [7, 0];
      p.backFoot = [-7, 0];
      p.frontHand = [5, -3];
      p.backHand = [-3, -3];
      break;
    case 'jump':
      p.frontFoot = [6, 7];
      p.backFoot = [-3, 9];
      p.frontHand = [6, -10];
      p.backHand = [-5, -8];
      break;
    case 'fall':
      p.frontFoot = [9, 3];
      p.backFoot = [-9, 0];
      p.frontHand = [8, -15];
      p.backHand = [-8, -15];
      break;
    case 'ledge':
      p.frontFoot = [3, 0];
      p.backFoot = [-3, 0];
      p.crouch = 2;
      p.frontHand = [6, -26];
      p.backHand = [-2, -26];
      break;
    case 'hurt':
      p.lean = -5;
      p.frontFoot = [9, 4];
      p.backFoot = [-7, 0];
      p.frontHand = [10, -8];
      p.backHand = [-10, -2];
      break;
    case 'down':
    case 'ko':
      p.lying = true;
      break;
    default:
      attackPose(anim, f, p, frames);
      break;
  }
  return p;
}

/** Attack/defence key poses. Frame 0 = wind-up, 1 = active, 2 = recovery (see Fighter.attackPhase). */
function attackPose(anim: string, f: number, p: Pose, frames = 3): void {
  const set = (lean: number, crouch: number, fh: V2, bh: V2, ff: V2, bf: V2): void => {
    p.lean = lean;
    p.crouch = crouch;
    p.frontHand = fh;
    p.backHand = bh;
    p.frontFoot = ff;
    p.backFoot = bf;
  };
  const T: Record<string, [number, number, V2, V2, V2, V2][]> = {
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
  const row = T[anim];
  if (!row) return;
  if (frames >= 6 && row.length === 3) {
    // six frames from three key poses: wind-up, an exaggerated anticipation (pulls back past the wind-up), the fast
    // in-between, the strike, follow-through and recovery. Frame 3 is the active pose.
    const mix = (a: number, b: number, t: number): number => Math.round(a + (b - a) * t);
    const mixV = (a: V2, b: V2, t: number): V2 => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
    const lerp = (a: (typeof row)[number], b: (typeof row)[number], t: number): (typeof row)[number] => [mix(a[0], b[0], t), mix(a[1], b[1], t), mixV(a[2], b[2], t), mixV(a[3], b[3], t), mixV(a[4], b[4], t), mixV(a[5], b[5], t)];
    const [A, B, C] = row;
    const e = [A, lerp(A, B, -0.28), lerp(A, B, 0.62), B, lerp(B, C, 0.5), C][Math.min(f, 5)];
    set(e[0], e[1], e[2], e[3], e[4], e[5]);
    return;
  }
  const e = row[Math.min(f, row.length - 1)];
  set(e[0], e[1], e[2], e[3], e[4], e[5]);
}

type Ctx = CanvasRenderingContext2D;

// ---- colour helpers --------------------------------------------------------------------------
function rgb(hex: string): V2 & { 2?: number } {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as unknown as V2 & { 2?: number };
}
function shade(hex: string, k: number): string {
  const [r, g, b] = rgb(hex) as unknown as [number, number, number];
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function R(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Thick line of w x w squares from (x0,y0) to (x1,y1): used for limbs so any pose is drawable. */
function limb(ctx: Ctx, color: string, x0: number, y0: number, x1: number, y1: number, w: number): void {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  ctx.fillStyle = color;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * t - w / 2), Math.round(y0 + (y1 - y0) * t - w / 2), w, w);
  }
}

interface Pal {
  skin: string;
  armor: string;
  light: string;
  dark: string;
  deep: string;
  accent: string;
  glow: string;
  steel: string;
  steelDark: string;
}

function palette(look: PlaceholderLook): Pal {
  return {
    skin: look.skin,
    armor: look.armor,
    light: shade(look.armor, 1.28),
    dark: look.armorDark,
    deep: shade(look.armorDark, 0.7),
    accent: look.accent,
    glow: shade(look.accent, 1.55),
    steel: '#a9b4cc',
    steelDark: '#6a7592',
  };
}

function drawFighterFrame(ctx: Ctx, size: number, look: PlaceholderLook, pose: Pose, phase = 0): void {
  const P = palette(look);
  const b = look.build;
  const cx = size / 2 - 5; // body sits left of centre: the piston fist reaches forward
  const base = size - 2; // feet row (leaves 1px for outline)

  if (pose.lying) {
    drawLying(ctx, cx, base, P, b.legH * 2, b.torsoH * 2, b.headSize * 2);
    return;
  }

  const legH = b.legH * 2 - pose.crouch;
  const torsoH = b.torsoH * 2;
  const tw = (b.shoulderW - 4) * 2; // torso width
  const hs = b.headSize * 2;
  const lean = pose.lean;

  const hipY = base - legH;
  const torsoTop = hipY - torsoH + 2 + pose.bob;
  const shoulderY = torsoTop + 5;
  const x0 = Math.round(cx - tw / 2 + lean);

  const foot = (f: V2, side: number): V2 => [cx + side * 4 + lean * 0.5 + f[0], base - f[1]];

  const extras = look.extras ?? [];
  const weapon = look.weapon ?? 'piston';
  // ---------- cloak / backpack (behind everything) ----------
  if (extras.includes('cloak')) drawCloak(ctx, P, cx + lean * 0.5 - 2, torsoTop0(hipY, torsoH, pose), base, tw, phase);
  if (extras.includes('toolbox')) drawToolbox(ctx, P, x0 - 9, hipY - torsoH + 1 + pose.bob, phase);

  // ---------- back arm (in shadow) ----------
  const bs: V2 = [x0 + 2, shoulderY + 2];
  const bh: V2 = [bs[0] - 4 + pose.backHand[0], bs[1] + b.armLen * 2 - 2 + pose.backHand[1]];
  limb(ctx, P.deep, bs[0], bs[1], bh[0], bh[1], 8);
  R(ctx, P.dark, bh[0] - 5, bh[1] - 3, 10, 9);
  if (weapon === 'blades') drawBlade(ctx, P, bs, bh, 11);
  if (weapon === 'gauntlet') drawGauntlet(ctx, P, bh, phase + 1, true);
  if (extras.includes('bracer')) {
    R(ctx, P.deep, bh[0] - 4, bh[1] - 6, 9, 5);
    R(ctx, P.accent, bh[0] - 3, bh[1] - 5, 7, 3);
    R(ctx, ((phase + 1) & 1) === 0 ? P.glow : P.accent, bh[0] - 1, bh[1] - 4, 3, 1);
  }
  if (extras.includes('grapple')) drawClaw(ctx, P, bs, bh);

  // ---------- back leg ----------
  const bf = foot(pose.backFoot, -1);
  if (b.round) {
    limb(ctx, P.deep, cx - 4 + lean * 0.5, hipY, bf[0], bf[1] - 4, 6);
    ellipse(ctx, P.deep, bf[0], bf[1] - 2, 8, 4);
    ellipse(ctx, P.dark, bf[0] - 1, bf[1] - 3, 6, 2);
  } else {
    limb(ctx, P.deep, cx - 5 + lean * 0.5, hipY, bf[0], bf[1] - 4, 10);
    R(ctx, P.deep, bf[0] - 6, bf[1] - 4, 13, 5); // boot
    R(ctx, P.dark, bf[0] - 6, bf[1] - 4, 13, 2);
  }

  // ---------- torso ----------
  if (b.round) drawRoundTorso(ctx, P, Math.round(cx + lean), torsoTop, tw, torsoH);
  else {
  R(ctx, P.armor, x0, torsoTop, tw, torsoH);
  R(ctx, P.light, x0 + 3, torsoTop, tw - 6, 2); // top highlight
  R(ctx, P.light, x0 + 3, torsoTop + 2, tw - 10, 6); // chest plate
  R(ctx, P.armor, x0 + 5, torsoTop + 3, tw - 14, 4);
  R(ctx, P.dark, x0, torsoTop + 2, 4, torsoH - 6); // shaded flank
  R(ctx, P.deep, x0, torsoTop + 2, 1, torsoH - 6);
  for (let y = torsoTop + 12; y < torsoTop + torsoH - 4; y += 3) R(ctx, P.dark, x0 + 6, y, tw - 10, 1); // abdomen plates
  // glowing seams
  R(ctx, P.accent, x0 + 5, torsoTop + 8, 1, torsoH - 14);
  R(ctx, P.accent, x0 + tw - 6, torsoTop + 8, 1, torsoH - 14);
  // reactor core
  R(ctx, P.deep, x0 + tw / 2 - 5, torsoTop + 4, 10, 10);
  R(ctx, P.accent, x0 + tw / 2 - 4, torsoTop + 5, 8, 8);
  R(ctx, P.glow, x0 + tw / 2 - 2, torsoTop + 7, 4, 4);
  // belt
  R(ctx, P.deep, x0, torsoTop + torsoH - 5, tw, 5);
  R(ctx, P.steel, x0 + tw / 2 - 3, torsoTop + torsoH - 4, 6, 3);
  }

  // ---------- front leg ----------
  const ff = foot(pose.frontFoot, 1);
  if (b.round) {
    limb(ctx, P.dark, cx + 4 + lean * 0.5, hipY, ff[0], ff[1] - 4, 7);
    limb(ctx, P.armor, cx + 4 + lean * 0.5, hipY, ff[0], ff[1] - 4, 5);
    ellipse(ctx, P.steelDark, (cx + 4 + lean * 0.5 + ff[0]) / 2, (hipY + ff[1] - 4) / 2, 4, 3); // ball joint
    ellipse(ctx, P.deep, ff[0], ff[1] - 2, 9, 4);
    ellipse(ctx, P.armor, ff[0], ff[1] - 3, 8, 3);
    ellipse(ctx, P.light, ff[0] - 2, ff[1] - 4, 4, 1);
    R(ctx, P.accent, ff[0] - 6, ff[1] - 1, 13, 1);
  } else {
  limb(ctx, P.armor, cx + 4 + lean * 0.5, hipY, ff[0], ff[1] - 4, 10);
  const kx = (cx + 4 + lean * 0.5 + ff[0]) / 2;
  const ky = (hipY + ff[1] - 4) / 2;
  R(ctx, P.light, kx - 3, ky - 2, 8, 4); // knee plate
  R(ctx, P.steel, kx, ky - 1, 2, 2);
  R(ctx, P.dark, ff[0] - 6, ff[1] - 5, 15, 6); // boot
  R(ctx, P.armor, ff[0] - 6, ff[1] - 5, 15, 2);
  R(ctx, P.deep, ff[0] - 6, ff[1], 15, 1);
  }

  // ---------- head ----------
  const headTop = torsoTop - hs + 4;
  const hx = Math.round(cx - hs / 2 + lean + 2);
  if (!b.round) R(ctx, P.dark, hx + 2, torsoTop - 1, hs - 5, 3); // neck
  if (extras.includes('scarf')) drawScarf(ctx, P, x0 + 5, torsoTop + 2, pose, phase);
  if (extras.includes('sash')) drawScarf(ctx, P, x0 + 4, torsoTop + torsoH - 3, pose, phase); // flame-trimmed sash from the belt
  if (b.round) drawRoundHead(ctx, P, hx, headTop + 2, hs, phase);
  else drawHead(ctx, look, P, hx, headTop, hs);

  // ---------- front shoulder + weapon arm ----------
  const sx = x0 + tw - 2;
  const sy = shoulderY + 2;
  const hand: V2 = [sx + 7 + pose.frontHand[0], sy + b.armLen * 2 + pose.frontHand[1] + 2];
  drawFrontArm(ctx, P, weapon, sx, sy, hand);
}

/** Filled ellipse in pixel rows (soft shapes for round builds). */
function ellipse(ctx: Ctx, color: string, cx: number, cy: number, rx: number, ry: number): void {
  ctx.fillStyle = color;
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const k = 1 - (y * y) / (ry * ry);
    if (k < 0) continue;
    const half = Math.round(rx * Math.sqrt(k));
    ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
  }
}

/** Rounded torso: pot belly with a glowing core, riveted belt and shaded underside. */
function drawRoundTorso(ctx: Ctx, P: Pal, cx: number, top: number, w: number, h: number): void {
  const cy = top + h / 2;
  const rx = w / 2 + 1;
  const ry = h / 2 + 1;
  ellipse(ctx, P.deep, cx, cy + 1, rx + 1, ry + 1);
  ellipse(ctx, P.armor, cx, cy, rx, ry);
  ellipse(ctx, P.dark, cx + 3, cy + 3, rx - 3, ry - 3); // underside shade
  ellipse(ctx, P.armor, cx - 1, cy - 1, rx - 3, ry - 4);
  ellipse(ctx, P.light, cx - 5, cy - ry / 2, rx / 2.5, 2); // top-left shine
  // belly hatch: steel ring, dark well, glowing core
  ellipse(ctx, P.steelDark, cx + 2, cy + 1, 7, 6);
  ellipse(ctx, P.deep, cx + 2, cy + 1, 5, 4);
  ellipse(ctx, P.accent, cx + 2, cy + 1, 3, 3);
  ellipse(ctx, P.glow, cx + 2, cy, 1, 1);
  // rivets and a seam
  for (const [dx, dy] of [[-9, -1], [-8, 4], [12, -1], [11, 4]] as const) R(ctx, P.steel, cx + dx, cy + dy, 2, 2);
  R(ctx, P.deep, cx - rx + 3, cy + ry - 4, w - 4, 1);
}

/** Domed robot head: neck ring, shell, big glass lens with a glint, side bolts and a blinking antenna. */
function drawRoundHead(ctx: Ctx, P: Pal, hx: number, top: number, hs: number, phase: number): void {
  const cx = hx + hs / 2;
  const cy = top + hs / 2;
  R(ctx, P.steelDark, cx - 5, cy + hs / 2 - 3, 10, 4); // neck ring
  ellipse(ctx, P.deep, cx, cy + 1, hs / 2 + 1, hs / 2 - 1);
  ellipse(ctx, P.armor, cx, cy, hs / 2, hs / 2 - 2);
  ellipse(ctx, P.dark, cx + 3, cy + 3, hs / 2 - 4, hs / 2 - 6);
  ellipse(ctx, P.armor, cx - 1, cy - 1, hs / 2 - 3, hs / 2 - 5);
  ellipse(ctx, P.light, cx - 4, cy - hs / 2 + 4, 5, 2); // shine
  // glass lens (faces forward / right)
  ellipse(ctx, P.deep, cx + 3, cy + 1, hs / 3 + 1, hs / 3 - 1);
  ellipse(ctx, P.skin, cx + 3, cy + 1, hs / 3 - 1, hs / 3 - 3);
  ellipse(ctx, P.accent, cx + 5, cy + 2, 3, 3); // eye
  ellipse(ctx, P.deep, cx + 5, cy + 2, 1, 1);
  R(ctx, '#ffffff', cx + 1, cy - 2, 3, 1); // glint
  // side bolt + antenna with a blinking bulb
  R(ctx, P.steel, cx - hs / 2 + 1, cy + 1, 3, 3);
  R(ctx, P.steelDark, cx - 1, top - 5, 2, 6);
  ellipse(ctx, (phase & 1) === 0 ? P.glow : P.accent, cx, top - 6, 2, 2);
}

function torsoTop0(hipY: number, torsoH: number, pose: Pose): number {
  return hipY - torsoH + 2 + pose.bob;
}

/** Steel blade from the hand along the arm direction. */
function drawBlade(ctx: Ctx, P: Pal, from: V2, hand: V2, len: number): void {
  let dx = hand[0] - from[0];
  let dy = hand[1] - from[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  // a hanging arm holds the blade angled forward-down instead of straight down
  if (dy > 0.8) {
    dx = 0.55;
    dy = 0.83;
  }
  const tip: V2 = [hand[0] + dx * len, hand[1] + dy * len];
  limb(ctx, P.steelDark, hand[0], hand[1], tip[0], tip[1], 3);
  limb(ctx, '#e8eef8', hand[0] + 1, hand[1], tip[0] + 1, tip[1], 1);
  R(ctx, P.accent, hand[0] - 2, hand[1] - 1, 5, 3); // hilt
}

function drawStaffLike(ctx: Ctx, P: Pal, from: V2, hand: V2, len: number, head: boolean): void {
  let dx = hand[0] - from[0];
  let dy = hand[1] - from[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  if (dy > 0.7) {
    // resting: planted upright
    dx = 0.1;
    dy = -1;
  }
  const tip: V2 = [hand[0] + dx * len, hand[1] + dy * len];
  const tail: V2 = [hand[0] - dx * (len * 0.4), hand[1] - dy * (len * 0.4)];
  limb(ctx, '#6a4a2a', tail[0], tail[1], tip[0], tip[1], 3);
  limb(ctx, '#a87a44', tail[0] + 1, tail[1], tip[0] + 1, tip[1], 1);
  if (head) {
    R(ctx, P.accent, tip[0] - 3, tip[1] - 3, 7, 7);
    R(ctx, P.glow, tip[0] - 1, tip[1] - 1, 3, 3);
  }
}

function drawFrontArm(ctx: Ctx, P: Pal, weapon: NonNullable<PlaceholderLook['weapon']>, sx: number, sy: number, hand: V2): void {
  if (weapon === 'piston') {
    // arm housing -> exposed piston rod -> fist
    const mid: V2 = [sx + (hand[0] - sx) * 0.5, sy + (hand[1] - sy) * 0.5];
    limb(ctx, P.dark, sx, sy, mid[0], mid[1], 12);
    limb(ctx, P.armor, sx, sy, mid[0], mid[1], 10);
    limb(ctx, P.steel, mid[0], mid[1], hand[0], hand[1] - 5, 5);
    limb(ctx, P.steelDark, mid[0] + 1, mid[1], hand[0] + 1, hand[1] - 5, 2);
    R(ctx, P.dark, mid[0] - 6, mid[1] - 2, 12, 5); // piston collar
    R(ctx, P.accent, mid[0] - 6, mid[1], 12, 1);
    R(ctx, P.deep, hand[0] - 9, hand[1] - 8, 19, 16);
    R(ctx, P.armor, hand[0] - 8, hand[1] - 8, 17, 14);
    R(ctx, P.light, hand[0] - 8, hand[1] - 8, 17, 2);
    for (let k = 0; k < 3; k++) R(ctx, P.dark, hand[0] - 6 + k * 5, hand[1] - 2, 1, 7); // knuckle lines
    R(ctx, P.accent, hand[0] - 8, hand[1] + 4, 17, 2);
    // pauldron on top
    R(ctx, P.deep, sx - 8, sy - 8, 19, 13);
    R(ctx, P.armor, sx - 7, sy - 8, 17, 11);
    R(ctx, P.light, sx - 7, sy - 8, 17, 2);
    R(ctx, P.accent, sx - 7, sy + 1, 17, 2);
    R(ctx, P.steel, sx - 4, sy - 5, 2, 2);
    R(ctx, P.steel, sx + 4, sy - 5, 2, 2);
    return;
  }
  if (weapon === 'gauntlet') {
    // bare arm -> shoulder wrap -> flame gauntlet
    limb(ctx, P.deep, sx, sy, hand[0], hand[1], 8);
    limb(ctx, P.skin, sx, sy, hand[0], hand[1], 6);
    R(ctx, P.armor, sx - 5, sy - 4, 11, 7);
    R(ctx, P.light, sx - 5, sy - 4, 11, 1);
    R(ctx, P.accent, sx - 4, sy + 2, 9, 1);
    drawGauntlet(ctx, P, hand, 0, false);
    return;
  }
  // slimmer arm for the other styles
  limb(ctx, P.deep, sx, sy, hand[0], hand[1], 8);
  limb(ctx, P.armor, sx, sy, hand[0], hand[1], 6);
  limb(ctx, P.light, sx - 1, sy, hand[0] - 1, hand[1], 1);
  R(ctx, P.armor, sx - 5, sy - 4, 11, 7); // shoulder guard
  R(ctx, P.light, sx - 5, sy - 4, 11, 1);
  R(ctx, P.accent, sx - 4, sy + 2, 9, 1);
  R(ctx, P.skin, hand[0] - 3, hand[1] - 3, 6, 6); // hand
  if (weapon === 'blades') drawBlade(ctx, P, [sx, sy], hand, 15);
  else if (weapon === 'staff') drawStaffLike(ctx, P, [sx, sy], hand, 30, true);
  else {
    // wrench: handle + open-jaw head
    let dx = hand[0] - sx;
    let dy = hand[1] - sy;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    if (dy > 0.8) (dx = 0.5), (dy = 0.85);
    const tip: V2 = [hand[0] + dx * 12, hand[1] + dy * 12];
    limb(ctx, P.steelDark, hand[0], hand[1], tip[0], tip[1], 3);
    limb(ctx, '#e0e6f4', hand[0] + 1, hand[1], tip[0] + 1, tip[1], 1);
    R(ctx, P.steel, tip[0] - 4, tip[1] - 4, 9, 9);
    R(ctx, P.deep, tip[0] - 1, tip[1] - 2, 5, 5); // jaw gap
    R(ctx, P.accent, tip[0] - 4, tip[1] + 4, 9, 1);
  }
}

function drawCloak(ctx: Ctx, P: Pal, cx: number, top: number, base: number, tw: number, phase: number): void {
  for (let y = top; y < base - 1; y++) {
    const t = (y - top) / Math.max(1, base - top);
    const half = tw / 2 + 2 + t * 9;
    const sway = Math.round(Math.sin(phase * 1.3 + t * 3) * 2 * t) - Math.round(t * 3);
    const x0 = Math.round(cx - half + sway);
    const w = Math.round(half * 2);
    R(ctx, P.deep, x0, y, w, 1);
    R(ctx, P.dark, x0 + 2, y, w - 5, 1);
    R(ctx, P.armor, x0 + w - 4, y, 3, 1); // lit right edge
  }
  // scalloped hem
  for (let k = 0; k < 6; k++) R(ctx, P.accent, Math.round(cx - 14 + k * 5), base - 3 - (k % 2), 3, 1);
}

function drawToolbox(ctx: Ctx, P: Pal, x: number, y: number, phase: number): void {
  R(ctx, P.deep, x - 1, y - 1, 13, 18);
  R(ctx, P.dark, x, y, 11, 16);
  R(ctx, P.accent, x, y, 11, 3); // lid
  R(ctx, P.steel, x + 4, y - 3, 3, 3); // handle
  R(ctx, P.deep, x + 1, y + 6, 9, 1);
  R(ctx, P.steel, x + 3, y + 8, 5, 4);
  R(ctx, P.glow, x + 5, y + 9, 1, 2);
  // wrench handle sticking out of the top
  limb(ctx, P.steelDark, x + 9, y - 1, x + 12, y - 9, 2);
  R(ctx, P.steel, x + 10, y - 12, 5, 4);
  R(ctx, P.deep, x + 12, y - 11, 2, 2);
  if ((phase & 1) === 0) R(ctx, P.glow, x + 1, y + 1, 1, 1);
}

function drawClaw(ctx: Ctx, P: Pal, shoulder: V2, hand: V2): void {
  // grappling arm: cable-wrapped forearm ending in a three-prong claw
  limb(ctx, P.steelDark, shoulder[0], shoulder[1], hand[0], hand[1], 4);
  R(ctx, P.steel, hand[0] - 3, hand[1] - 2, 7, 5);
  R(ctx, P.accent, hand[0] - 3, hand[1] - 2, 7, 1);
  for (const dx of [-3, 0, 3]) limb(ctx, '#e0e6f4', hand[0] + dx, hand[1] + 3, hand[0] + dx + Math.sign(dx), hand[1] + 8, 1);
}

/** Flame gauntlet: armoured fist with glowing knuckles and a licking flame crest. */
function drawGauntlet(ctx: Ctx, P: Pal, hand: V2, phase: number, back: boolean): void {
  const [hx, hy] = hand;
  R(ctx, P.deep, hx - 7, hy - 7, 15, 14);
  R(ctx, back ? P.dark : P.armor, hx - 6, hy - 7, 13, 12);
  R(ctx, P.light, hx - 6, hy - 7, 13, 2);
  for (let k = 0; k < 3; k++) R(ctx, P.dark, hx - 4 + k * 4, hy - 2, 1, 6); // knuckle lines
  R(ctx, P.accent, hx - 6, hy + 3, 13, 2);
  R(ctx, P.glow, hx - 6 + (phase & 1), hy + 3, 3, 1);
  // flame crest on the back of the fist
  R(ctx, P.accent, hx - 4, hy - 10, 3, 4);
  R(ctx, P.accent, hx + 1, hy - 12 + (phase & 1), 3, 6);
  R(ctx, P.glow, hx - 3, hy - 9, 1, 2);
  R(ctx, P.glow, hx + 2, hy - 10, 1, 3);
}

function drawScarf(ctx: Ctx, P: Pal, nx: number, ny: number, pose: Pose, phase: number): void {
  // flows backward; streams level when running, trails up when airborne, droops when standing
  const flow = pose.lean > 2 ? 0 : pose.frontHand[1] < -8 ? -0.55 : 0.45;
  for (let i = 0; i < 16; i++) {
    const wave = Math.sin(phase * 1.2 + i * 0.55) * (1 + i * 0.12);
    const x = nx - 3 - i * 1.7;
    const y = ny + i * flow * 1.4 + wave;
    R(ctx, i % 5 === 4 ? P.light : P.accent, x, y, 3, 3);
    if (i > 2) R(ctx, P.deep, x, y + 3, 3, 1);
  }
  R(ctx, P.accent, nx - 2, ny - 1, 6, 4); // knot
}

function drawHead(ctx: Ctx, look: PlaceholderLook, P: Pal, hx: number, top: number, hs: number): void {
  switch (look.build.helmet) {
    case 'visor':
      R(ctx, P.deep, hx - 1, top + 2, hs + 2, hs - 1);
      R(ctx, P.armor, hx, top, hs, hs - 1); // shell
      R(ctx, P.light, hx + 1, top, hs - 2, 2);
      R(ctx, P.dark, hx + hs / 2 - 3, top - 3, 6, 4); // crest
      R(ctx, P.light, hx + hs / 2 - 2, top - 3, 4, 1);
      R(ctx, P.dark, hx, top + 2, 4, hs - 4); // rear shade
      R(ctx, P.deep, hx + 6, top + 6, hs - 5, 5); // visor recess
      R(ctx, P.accent, hx + 7, top + 7, hs - 7, 3);
      R(ctx, P.glow, hx + 9, top + 8, hs - 11, 1);
      R(ctx, P.dark, hx + 5, top + hs - 4, hs - 4, 4); // chin guard
      for (let k = 0; k < 3; k++) R(ctx, P.deep, hx + 1, top + 4 + k * 3, 3, 1); // vents
      break;
    case 'hood':
      R(ctx, P.dark, hx - 2, top - 1, hs + 4, hs + 2);
      R(ctx, P.deep, hx - 2, top + hs - 1, hs + 4, 1);
      R(ctx, P.skin, hx + hs / 2, top + 4, hs / 2, hs - 6);
      R(ctx, P.accent, hx + hs / 2 + 2, top + 6, 3, 2);
      break;
    case 'pointed':
      R(ctx, P.armor, hx, top + 2, hs, hs - 2);
      R(ctx, P.armor, hx + 3, top - 7, hs - 6, 9);
      R(ctx, P.light, hx + 3, top - 7, hs - 6, 2);
      R(ctx, P.skin, hx + hs / 2, top + 6, hs / 2, hs - 8);
      R(ctx, P.accent, hx + hs / 2 + 2, top + 8, 3, 2);
      break;
    case 'band':
      R(ctx, P.skin, hx, top + 1, hs, hs - 1);
      R(ctx, P.deep, hx, top - 1, hs, 4); // hair base
      for (let k = 0; k < 4; k++) {
        R(ctx, P.accent, hx + 1 + k * 3, top - 6 - (k % 2) * 3, 3, 7); // flame-spike hair
        R(ctx, P.glow, hx + 2 + k * 3, top - 5 - (k % 2) * 3, 1, 4);
      }
      R(ctx, P.light, hx, top + 3, hs, 3); // headband
      R(ctx, P.accent, hx, top + 4, hs, 1);
      R(ctx, P.accent, hx - 5, top + 4, 6, 2); // band tail
      R(ctx, P.deep, hx + hs - 5, top + 7, 3, 2); // eye
      R(ctx, P.dark, hx, top + 8, 4, hs - 9); // rear shade
      break;
    case 'dome':
      R(ctx, P.armor, hx, top, hs, hs);
      R(ctx, P.light, hx + 1, top, hs - 2, 2);
      R(ctx, P.skin, hx + 3, top + 4, hs - 6, hs - 8);
      R(ctx, P.accent, hx + hs - 6, top + 6, 3, 3);
      break;
  }
}

function drawLying(ctx: Ctx, cx: number, base: number, P: Pal, legH: number, torsoH: number, hs: number): void {
  const len = legH + torsoH;
  const x0 = cx - len / 2;
  R(ctx, P.deep, x0 + hs, base - 11, len - 4, 11);
  R(ctx, P.armor, x0 + hs + 2, base - 15, len - 12, 10);
  R(ctx, P.light, x0 + hs + 2, base - 15, len - 12, 2);
  R(ctx, P.accent, x0 + hs + 8, base - 13, 8, 5);
  R(ctx, P.glow, x0 + hs + 10, base - 11, 4, 2);
  R(ctx, P.dark, x0 + len - 4, base - 9, 10, 8); // boots
  R(ctx, P.armor, x0 - 4, base - 15, hs, hs - 2); // head
  R(ctx, P.accent, x0 - 4 + 2, base - 9, 7, 3);
  R(ctx, P.steel, x0 + hs - 6, base - 6, 12, 5); // fist
}

/** 1px passes: rim light on top edges, under-shade on bottom edges, then outline. */
function finish(ctx: Ctx, size: number, outlineColor: string): void {
  const img = ctx.getImageData(0, 0, size, size);
  const src = new Uint8ClampedArray(img.data);
  const A = (x: number, y: number): number => (x < 0 || y < 0 || x >= size || y >= size ? 0 : src[(y * size + x) * 4 + 3]);
  const [or, og, ob] = rgb(outlineColor) as unknown as [number, number, number];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (src[i + 3] > 0) {
        const k = !A(x, y - 1) ? 1.18 : !A(x, y + 1) ? 0.78 : 1;
        if (k !== 1) {
          img.data[i] = Math.min(255, src[i] * k);
          img.data[i + 1] = Math.min(255, src[i + 1] * k);
          img.data[i + 2] = Math.min(255, src[i + 2] * k);
        }
      } else if (A(x - 1, y) || A(x + 1, y) || A(x, y - 1) || A(x, y + 1)) {
        img.data[i] = or;
        img.data[i + 1] = og;
        img.data[i + 2] = ob;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function fighterTextureKey(id: string): string {
  return `fighter:${id}`;
}
/** Sheet frame index for (animation, frame): one animation per row. */
export function animFrameIndex(data: CharacterData, anim: string, frame: number): number {
  const names = Object.keys(data.sprite.animations);
  const cols = Math.max(...names.map((n) => data.sprite.animations[n].frames));
  const row = Math.max(0, names.indexOf(anim));
  const def = data.sprite.animations[anim];
  return row * cols + Math.min(frame, (def?.frames ?? 1) - 1);
}

export function fighterAnimKey(id: string, anim: string): string {
  return `${id}:${anim}`;
}

/** Build the sprite sheet + animations for a character from its placeholder look. */
export function buildPlaceholderSheet(scene: Phaser.Scene, data: CharacterData): void {
  const { sprite } = data;
  const size = sprite.frameSize;
  const names = Object.keys(sprite.animations);
  const cols = Math.max(...names.map((n) => sprite.animations[n].frames));
  const sheet = document.createElement('canvas');
  sheet.width = cols * size;
  sheet.height = names.length * size;
  const sctx = sheet.getContext('2d')!;
  sctx.imageSmoothingEnabled = false;

  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = size;
  const tctx = tmp.getContext('2d', { willReadFrequently: true })!;

  names.forEach((name, row) => {
    const def = sprite.animations[name];
    for (let f = 0; f < def.frames; f++) {
      tctx.clearRect(0, 0, size, size);
      drawFighterFrame(tctx, size, sprite.placeholder, poseFor(name, f, def.frames), f);
      finish(tctx, size, sprite.placeholder.outline);
      sctx.drawImage(tmp, f * size, row * size);
    }
  });

  registerSheet(scene, data, sheet);
}

function registerSheet(scene: Phaser.Scene, data: CharacterData, sheet: HTMLCanvasElement): void {
  const key = fighterTextureKey(data.id);
  const size = data.sprite.frameSize;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, sheet)!;
  const names = Object.keys(data.sprite.animations);
  const cols = Math.max(...names.map((n) => data.sprite.animations[n].frames));
  names.forEach((_, row) => {
    for (let c = 0; c < cols; c++) tex.add(row * cols + c, 0, c * size, row * size, size, size);
  });
  registerAnimations(scene, data);
}

/** Works for both generated and loaded sheets: frame index = row * cols + col. */
export function registerAnimations(scene: Phaser.Scene, data: CharacterData): void {
  const key = fighterTextureKey(data.id);
  const names = Object.keys(data.sprite.animations);
  const cols = Math.max(...names.map((n) => data.sprite.animations[n].frames));
  names.forEach((name, row) => {
    const def = data.sprite.animations[name];
    const animKey = fighterAnimKey(data.id, name);
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      frames: Array.from({ length: def.frames }, (_, c) => ({ key, frame: row * cols + c })),
      frameRate: def.fps,
      repeat: def.loop ? -1 : 0,
    });
  });
}
