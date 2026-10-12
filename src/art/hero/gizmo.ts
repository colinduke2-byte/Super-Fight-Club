import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/** Gizmo: a squat orange tinker-bot: pot belly with a glowing hatch, big glass-lensed dome head, ball joints, a toolbox pack and a wrench. */
export function drawGizmo(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.6);
  const accent = col(look.accent);
  const glow = mix(accent, [255, 255, 255], 0.65);
  const glass = col(look.skin);
  const steel: RGB = [186, 196, 216];
  const steelD: RGB = [110, 122, 150];
  const P = {
    armor: r.part(armor),
    light: r.part(mix(armor, [255, 230, 190], 0.28)),
    dark: r.part(dark),
    deep: r.part(deep),
    steel: r.part(steel),
    steelD: r.part(steelD),
    glass: r.part(mix(glass, [60, 140, 180], 0.35)),
    glassL: r.part(glass, { flat: true }),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    stripe: r.part(accent, { flat: true }),
    seam: r.part(deep, { flat: true }),
    rivet: r.part(steel, { flat: true }),
    shine: r.part([255, 255, 255], { flat: true }),
    cable: r.part([40, 44, 60]),
    box: r.part(mix(dark, [120, 80, 40], 0.3)),
  };
  const T = k.torso;
  const cx = T.x + T.w / 2;
  const cy = T.y + T.h / 2;
  const blink = k.phase % 2 === 0;

  // ---- backpack: toolbox with a wrench handle and a grapple arm ----
  {
    const bx = T.x - 14;
    const by = T.y + 2;
    r.rect(P.deep, bx - 1, by - 1, 22, 34);
    r.rect(P.box, bx, by, 20, 32);
    r.rect(P.stripe, bx, by, 20, 5); // lid
    r.rect(P.steel, bx + 7, by - 5, 6, 5); // handle
    r.rect(P.seam, bx + 2, by + 13, 16, 1);
    r.rect(P.steel, bx + 6, by + 16, 8, 8);
    r.rect(P.glow, bx + 9, by + 18, 2, 4);
    r.seg(P.steelD, bx + 16, by - 2, bx + 22, by - 20, 4, 4);
    r.ellipse(P.steel, bx + 23, by - 22, 7, 6);
    r.ellipse(P.deep, bx + 25, by - 22, 3, 3);
    // grapple arm with a three-prong claw, resting on the pack
    r.seg(P.cable, bx + 4, by + 8, bx - 6, by + 22, 5, 5);
    r.rect(P.steel, bx - 12, by + 20, 12, 8);
    for (const dx of [-11, -6, -1]) r.seg(P.steel, bx + dx, by + 27, bx + dx - 1, by + 36, 2, 2);
  }

  // ---- back arm ----
  {
    const el = k.elbowB;
    r.seg(P.deep, k.shB[0], k.shB[1], el[0], el[1], 9, 8);
    r.seg(P.dark, el[0], el[1], k.handB[0], k.handB[1], 8, 8);
    r.ellipse(P.steelD, el[0], el[1], 5, 5);
    claw(r, P, k.handB);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- torso: pot belly ----
  {
    const rx = T.w / 2 + 6;
    const ry = T.h / 2 + 6;
    r.ellipse(P.deep, cx, cy + 2, rx + 2, ry + 2);
    r.ellipse(P.armor, cx, cy, rx, ry);
    r.ellipse(P.dark, cx + 6, cy + 7, rx - 6, ry - 6); // underside
    r.ellipse(P.armor, cx - 2, cy - 2, rx - 6, ry - 8);
    r.ellipse(P.light, cx - 12, cy - ry / 2, rx / 2.4, 4); // shine
    // panel seams
    r.rect(P.seam, cx - rx + 8, cy + ry - 10, rx * 2 - 16, 1);
    r.rect(P.seam, cx - 18, cy - ry + 8, 1, 12);
    r.rect(P.seam, cx + 20, cy - ry + 10, 1, 10);
    // belly hatch: steel ring, dark well, glowing core with a pulsing centre
    r.ellipse(P.steelD, cx + 4, cy + 2, 15, 13);
    r.ellipse(P.steel, cx + 3, cy + 1, 13, 11);
    r.ellipse(P.deep, cx + 4, cy + 2, 11, 9);
    r.ellipse(P.accent, cx + 4, cy + 2, 8, 7);
    r.ellipse(P.glow, cx + 3, cy + 1, blink ? 4 : 3, blink ? 3.5 : 2.5);
    for (let a = 0; a < 8; a++) r.rect(P.rivet, cx + 4 + Math.cos((a * Math.PI) / 4) * 14 - 1, cy + 2 + Math.sin((a * Math.PI) / 4) * 12 - 1, 2, 2);
    // belt band
    r.rect(P.deep, cx - rx + 3, cy + ry - 8, rx * 2 - 6, 4);
    r.rect(P.stripe, cx - rx + 6, cy + ry - 7, rx * 2 - 12, 1);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- head ----
  {
    const hs = k.head.s;
    const hx = k.head.x + hs / 2;
    const hy = k.head.y + hs / 2 + 3;
    r.ellipse(P.steelD, hx, hy + hs / 2 - 2, 10, 4); // neck ring
    r.ellipse(P.deep, hx, hy + 1, hs / 2 + 2, hs / 2 - 1);
    r.ellipse(P.armor, hx, hy, hs / 2 + 1, hs / 2 - 2);
    r.ellipse(P.dark, hx + 6, hy + 6, hs / 2 - 7, hs / 2 - 10);
    r.ellipse(P.armor, hx - 2, hy - 2, hs / 2 - 5, hs / 2 - 8);
    r.ellipse(P.light, hx - 8, hy - hs / 2 + 7, 8, 3);
    // glass lens with an eye and highlights
    r.ellipse(P.deep, hx + 7, hy + 2, hs / 3 + 3, hs / 3);
    r.ellipse(P.glass, hx + 7, hy + 2, hs / 3 + 1, hs / 3 - 2);
    r.ellipse(P.accent, hx + 10, hy + 4, 5, 5);
    r.ellipse(P.deep, hx + 10, hy + 4, 2, 2);
    r.rect(P.shine, hx + 2, hy - 3, 5, 2);
    r.rect(P.shine, hx + 1, hy, 2, 3);
    // bolts and the blinking antenna
    r.ellipse(P.steel, hx - hs / 2 + 4, hy + 2, 3, 3);
    r.seg(P.steelD, hx, hy - hs / 2 + 1, hx + 1, hy - hs / 2 - 10, 3, 3);
    r.ellipse(blink ? P.glow : P.accent, hx + 1, hy - hs / 2 - 11, 4, 4);
  }

  // ---- front arm + wrench ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    r.ellipse(P.dark, sx, sy, 8, 8); // shoulder joint
    r.seg(P.armor, sx, sy, el[0], el[1], 10, 9);
    r.ellipse(P.steelD, el[0], el[1], 5.5, 5.5);
    r.seg(P.armor, el[0], el[1], k.handF[0], k.handF[1], 9, 9);
    r.rect(P.stripe, sx - 6, sy + 5, 12, 2);
    // wrench: handle + open jaw
    let dx = k.handF[0] - el[0];
    let dy = k.handF[1] - el[1];
    const ln = Math.hypot(dx, dy) || 1;
    dx /= ln;
    dy /= ln;
    if (k.pose.aim !== undefined) {
      // the move swings the wrench explicitly (degrees: 0 forward, -90 up, 90 down)
      const a = (k.pose.aim * Math.PI) / 180;
      dx = Math.cos(a);
      dy = Math.sin(a);
    } else if (dy > 0.8) {
      dx = 0.5;
      dy = 0.85;
    }
    // an oversized monkey wrench: knurled handle, adjuster ring and an open jaw
    const wl = dy > 0.3 ? Math.max(14, Math.min(32, (k.base - 12 - k.handF[1]) / dy)) : 32; // never through the floor
    const tx = k.handF[0] + dx * wl;
    const ty = k.handF[1] + dy * wl;
    r.seg(P.steelD, k.handF[0] - dx * 6, k.handF[1] - dy * 6, tx, ty, 7, 7);
    r.seg(P.shine, k.handF[0] + 1, k.handF[1], tx + 1, ty, 1.5, 1.5);
    r.ellipse(P.accent, k.handF[0] + dx * 20, k.handF[1] + dy * 20, 3.6, 3.6);
    r.ellipse(P.steel, tx, ty, 11, 11);
    const nx = -dy;
    const ny = dx;
    r.poly(P.deep, [[tx + nx * 5 + dx * 2, ty + ny * 5 + dy * 2], [tx + nx * 5 + dx * 13, ty + ny * 5 + dy * 13], [tx - nx * 5 + dx * 13, ty - ny * 5 + dy * 13], [tx - nx * 5 + dx * 2, ty - ny * 5 + dy * 2]]);
    r.ellipse(P.rivet, tx - dx * 4 + nx * 5, ty - dy * 4 + ny * 5, 1.5, 1.5);
    r.ellipse(P.steel, k.handF[0], k.handF[1], 6, 6);
    r.ellipse(P.accent, k.handF[0], k.handF[1], 2, 2);
  }
}

type Parts = Record<'armor' | 'light' | 'dark' | 'deep' | 'steel' | 'steelD' | 'glass' | 'glassL' | 'accent' | 'glow' | 'stripe' | 'seam' | 'rivet' | 'shine' | 'cable' | 'box', number>;

function claw(r: Raster, P: Parts, h: V2): void {
  r.rect(P.steel, h[0] - 5, h[1] - 4, 10, 8);
  r.rect(P.stripe, h[0] - 5, h[1] - 4, 10, 2);
  for (const dx of [-4, 0, 4]) r.seg(P.steel, h[0] + dx, h[1] + 3, h[0] + dx + Math.sign(dx), h[1] + 11, 2.4, 1.5);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  r.seg(back ? P.deep : P.dark, hip[0], hip[1], kn[0], kn[1], 11, 10);
  r.seg(back ? P.deep : P.armor, kn[0], kn[1], ankle[0], ankle[1], 10, 9);
  r.ellipse(P.steelD, kn[0], kn[1], 6, 6); // ball joint
  // big flat foot
  r.ellipse(back ? P.deep : P.deep, ankle[0] + 3, ankle[1] + 4, 17, 7);
  r.ellipse(back ? P.dark : P.armor, ankle[0] + 3, ankle[1] + 3, 15, 5.5);
  if (!back) {
    r.ellipse(P.light, ankle[0], ankle[1], 6, 2);
    r.rect(P.stripe, ankle[0] - 11, ankle[1] + 6, 28, 1);
  }
}
