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
      attackPose(anim, f, p);
      break;
  }
  return p;
}

/** Attack/defence key poses. Frame 0 = wind-up, 1 = active, 2 = recovery (see Fighter.attackPhase). */
function attackPose(anim: string, f: number, p: Pose): void {
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
    shield: [[-2, 3, [10, -8], [4, -6], [5, 0], [-5, 0]]],
    dodge: [[-4, 8, [0, -2], [-2, 0], [6, 0], [-6, 0]]],
  };
  const row = T[anim];
  if (!row) return;
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

function drawFighterFrame(ctx: Ctx, size: number, look: PlaceholderLook, pose: Pose): void {
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

  // ---------- back arm (in shadow) ----------
  const bs: V2 = [x0 + 2, shoulderY + 2];
  const bh: V2 = [bs[0] - 4 + pose.backHand[0], bs[1] + b.armLen * 2 - 2 + pose.backHand[1]];
  limb(ctx, P.deep, bs[0], bs[1], bh[0], bh[1], 8);
  R(ctx, P.dark, bh[0] - 5, bh[1] - 3, 10, 9);

  // ---------- back leg ----------
  const bf = foot(pose.backFoot, -1);
  limb(ctx, P.deep, cx - 5 + lean * 0.5, hipY, bf[0], bf[1] - 4, 10);
  R(ctx, P.deep, bf[0] - 6, bf[1] - 4, 13, 5); // boot
  R(ctx, P.dark, bf[0] - 6, bf[1] - 4, 13, 2);

  // ---------- torso ----------
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

  // ---------- front leg ----------
  const ff = foot(pose.frontFoot, 1);
  limb(ctx, P.armor, cx + 4 + lean * 0.5, hipY, ff[0], ff[1] - 4, 10);
  const kx = (cx + 4 + lean * 0.5 + ff[0]) / 2;
  const ky = (hipY + ff[1] - 4) / 2;
  R(ctx, P.light, kx - 3, ky - 2, 8, 4); // knee plate
  R(ctx, P.steel, kx, ky - 1, 2, 2);
  R(ctx, P.dark, ff[0] - 6, ff[1] - 5, 15, 6); // boot
  R(ctx, P.armor, ff[0] - 6, ff[1] - 5, 15, 2);
  R(ctx, P.deep, ff[0] - 6, ff[1], 15, 1);

  // ---------- head ----------
  const headTop = torsoTop - hs + 4;
  const hx = Math.round(cx - hs / 2 + lean + 2);
  R(ctx, P.dark, hx + 2, torsoTop - 1, hs - 5, 3); // neck
  drawHead(ctx, look, P, hx, headTop, hs);

  // ---------- front shoulder: pauldron + piston-fist arm ----------
  const sx = x0 + tw - 2;
  const sy = shoulderY + 2;
  const hand: V2 = [sx + 7 + pose.frontHand[0], sy + b.armLen * 2 + pose.frontHand[1] + 2];
  // arm housing -> exposed piston rod -> fist
  const mid: V2 = [sx + (hand[0] - sx) * 0.5, sy + (hand[1] - sy) * 0.5];
  limb(ctx, P.dark, sx, sy, mid[0], mid[1], 12);
  limb(ctx, P.armor, sx, sy, mid[0], mid[1], 10);
  limb(ctx, P.steel, mid[0], mid[1], hand[0], hand[1] - 5, 5);
  limb(ctx, P.steelDark, mid[0] + 1, mid[1], hand[0] + 1, hand[1] - 5, 2);
  R(ctx, P.dark, mid[0] - 6, mid[1] - 2, 12, 5); // piston collar
  R(ctx, P.accent, mid[0] - 6, mid[1], 12, 1);
  // fist
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
      drawFighterFrame(tctx, size, sprite.placeholder, poseFor(name, f, def.frames));
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
