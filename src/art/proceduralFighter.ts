import Phaser from 'phaser';
import type { CharacterData, PlaceholderLook } from '../engine/types';

/**
 * Placeholder pixel-art generator. Draws every animation frame of a character with plain canvas
 * rects (no assets), then packs them into a sprite sheet laid out exactly like a real one:
 * one animation per row, frames left-to-right, `frameSize` squares. Swapping in a real sheet only
 * needs `sprite.sheetUrl` in the character data (see BootScene).
 */

interface Pose {
  bob: number; // torso/head vertical offset (px)
  crouch: number; // legs shortened by this many px
  frontLegX: number;
  backLegX: number;
  frontLegLift: number;
  backLegLift: number;
  frontArm: [number, number]; // end offset of the front arm (dx, dy) relative to the resting hang
  backArm: [number, number];
  lean: number; // torso/head x shift toward facing
  lying?: boolean;
}

const REST: Pose = {
  bob: 0,
  crouch: 0,
  frontLegX: 2,
  backLegX: -2,
  frontLegLift: 0,
  backLegLift: 0,
  frontArm: [1, 0],
  backArm: [-1, 0],
  lean: 0,
};

function poseFor(anim: string, f: number, frames: number): Pose {
  const p: Pose = { ...REST, frontArm: [...REST.frontArm], backArm: [...REST.backArm] };
  switch (anim) {
    case 'idle': {
      const b = [0, 0, 1, 1][f % 4];
      p.bob = b;
      p.frontArm = [1, b ? 1 : 0];
      break;
    }
    case 'run': {
      const ph = (f / frames) * Math.PI * 2;
      p.frontLegX = Math.round(Math.sin(ph) * 5);
      p.backLegX = -p.frontLegX;
      p.frontLegLift = Math.max(0, Math.round(-Math.cos(ph) * 3));
      p.backLegLift = Math.max(0, Math.round(Math.cos(ph) * 3));
      p.bob = Math.abs(Math.sin(ph)) > 0.7 ? 1 : 0;
      p.lean = 1;
      p.frontArm = [-Math.round(Math.sin(ph) * 3), 0];
      p.backArm = [Math.round(Math.sin(ph) * 3), 0];
      break;
    }
    case 'crouch':
      p.crouch = 3;
      p.frontLegX = 3;
      p.backLegX = -3;
      break;
    case 'jump':
      p.frontLegLift = 3;
      p.backLegLift = 4;
      p.frontLegX = 3;
      p.backLegX = -1;
      p.frontArm = [2, -4];
      p.backArm = [-2, -3];
      break;
    case 'fall':
      p.frontLegX = 4;
      p.backLegX = -4;
      p.frontLegLift = 1;
      p.frontArm = [3, -6];
      p.backArm = [-3, -6];
      break;
    case 'ledge':
      p.frontArm = [3, -9];
      p.backArm = [-1, -9];
      p.frontLegX = 1;
      p.backLegX = -1;
      p.crouch = 1;
      break;
    case 'hurt':
      p.lean = -2;
      p.frontLegX = 4;
      p.backLegX = -3;
      p.frontLegLift = 2;
      p.frontArm = [4, -3];
      p.backArm = [-4, -1];
      break;
    case 'down':
    case 'ko':
      p.lying = true;
      break;
    default:
      break;
  }
  return p;
}

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawFighterFrame(ctx: Ctx, size: number, look: PlaceholderLook, pose: Pose): void {
  const b = look.build;
  const cx = size / 2;
  const base = size - 1; // feet row

  if (pose.lying) {
    // body lying along the ground, head to the left
    const len = b.legH + b.torsoH;
    rect(ctx, look.armorDark, cx - len / 2 + b.headSize, base - 6, len - 2, 6);
    rect(ctx, look.armor, cx - len / 2 + b.headSize + 2, base - 8, len - 6, 5);
    rect(ctx, look.accent, cx - len / 2 + b.headSize + 4, base - 8, 3, 2);
    rect(ctx, look.armor, cx - len / 2 - 2, base - 8, b.headSize, b.headSize - 1);
    rect(ctx, look.accent, cx - len / 2 - 2, base - 5, 3, 2);
    rect(ctx, look.armorDark, cx + len / 2 - 2, base - 4, 5, 4);
    return;
  }

  const legH = b.legH - pose.crouch;
  const legTop = base - legH + 1;
  const torsoTop = legTop - b.torsoH + pose.bob;
  const shoulderY = torsoTop + 1;
  const tw = b.shoulderW - 4; // torso width (pauldrons add the rest)
  const lx = Math.round(pose.lean);

  // back arm + back leg (darker, behind the torso)
  const bAx = cx - tw / 2 - 2 + pose.backArm[0];
  rect(ctx, look.armorDark, bAx, shoulderY + 1 + Math.min(0, pose.backArm[1]), 3, b.armLen + Math.max(0, -pose.backArm[1]) - 1);
  rect(ctx, look.skin, bAx, shoulderY + b.armLen + Math.min(0, pose.backArm[1]) - 1, 3, 3);
  const bLx = cx - 4 + pose.backLegX;
  rect(ctx, look.armorDark, bLx, legTop - pose.backLegLift, 4, legH - 1);
  rect(ctx, look.outline, bLx, base - pose.backLegLift, 5, 2);

  // torso
  rect(ctx, look.armor, cx - tw / 2 + lx, torsoTop, tw, b.torsoH);
  rect(ctx, look.armorDark, cx - tw / 2 + lx, torsoTop + b.torsoH - 3, tw, 3); // belt
  rect(ctx, look.accent, cx - 2 + lx, torsoTop + 2, 4, 4); // chest core
  rect(ctx, look.armorDark, cx - tw / 2 + lx, torsoTop, 2, b.torsoH - 3); // side shade

  // front leg
  const fLx = cx - 1 + pose.frontLegX;
  rect(ctx, look.armor, fLx, legTop - pose.frontLegLift, 4, legH - 1);
  rect(ctx, look.armorDark, fLx, legTop - pose.frontLegLift + 3, 4, 2);
  rect(ctx, look.outline, fLx, base - pose.frontLegLift, 6, 2);

  // head
  const hs = b.headSize;
  const headTop = torsoTop - hs + 2;
  const hx = cx - hs / 2 + lx + 1;
  switch (b.helmet) {
    case 'visor':
      rect(ctx, look.armor, hx, headTop, hs, hs);
      rect(ctx, look.armorDark, hx, headTop, hs, 2);
      rect(ctx, look.accent, hx + hs / 2 - 1, headTop + 3, hs / 2 + 1, 2);
      break;
    case 'hood':
      rect(ctx, look.armorDark, hx - 1, headTop - 1, hs + 2, hs + 1);
      rect(ctx, look.skin, hx + hs / 2, headTop + 2, hs / 2, hs - 3);
      rect(ctx, look.accent, hx + hs / 2 + 1, headTop + 3, 2, 1);
      break;
    case 'pointed':
      rect(ctx, look.armor, hx, headTop + 1, hs, hs - 1);
      rect(ctx, look.armor, hx + 2, headTop - 3, hs - 4, 4);
      rect(ctx, look.skin, hx + hs / 2, headTop + 3, hs / 2, hs - 4);
      rect(ctx, look.accent, hx + hs / 2 + 1, headTop + 4, 2, 1);
      break;
    case 'dome':
      rect(ctx, look.armor, hx, headTop, hs, hs);
      rect(ctx, look.skin, hx + 2, headTop + 2, hs - 3, hs - 4);
      rect(ctx, look.accent, hx + hs - 3, headTop + 3, 2, 2);
      break;
  }

  // pauldron + front arm
  const aX = cx + tw / 2 - 1 + lx + pose.frontArm[0];
  rect(ctx, look.accent, cx + tw / 2 - 2 + lx, shoulderY - 1, 5, 4);
  rect(ctx, look.armor, aX, shoulderY + 3 + Math.min(0, pose.frontArm[1]), 4, b.armLen + Math.max(0, -pose.frontArm[1]) - 2);
  rect(ctx, look.skin, aX, shoulderY + b.armLen + 1 + Math.min(0, pose.frontArm[1]), 4, 3);
}

/** Add a 1px outline around the opaque silhouette. */
function outline(ctx: Ctx, size: number, color: string): void {
  const img = ctx.getImageData(0, 0, size, size);
  const src = new Uint8ClampedArray(img.data);
  const [r, g, b] = hexToRgb(color);
  const a = (x: number, y: number): number => (x < 0 || y < 0 || x >= size || y >= size ? 0 : src[(y * size + x) * 4 + 3]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (a(x, y) > 0) continue;
      if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) {
        const i = (y * size + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function fighterTextureKey(id: string): string {
  return `fighter:${id}`;
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
      outline(tctx, size, sprite.placeholder.outline);
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
