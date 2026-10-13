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
  // outfits: 1 = Steamworks (top hat with a gear, monocle, a boiler pack with a chimney), 2 = Astronaut (fishbowl helmet, air pack, flag)
  const o = look.outfit ?? 0;
  const brass = r.part([214, 168, 74]);
  const brassD = r.part([150, 108, 44]);
  const silk = r.part([34, 30, 36]);
  const silkL = r.part([72, 64, 76]);
  const steam = r.part([236, 240, 246], { soft: true });
  const bowl = r.part(mix(accent, [120, 186, 236], 0.88), { soft: true });
  const bowlL = r.part(mix(accent, [186, 226, 252], 0.9), { soft: true });
  /** A ring of short segments: a thin outline (bubble glass) around (x, y). */
  const ring = (part: number, x: number, y: number, rx: number, ry: number, from: number, to: number, w: number): void => {
    let px = x + Math.cos(from) * rx;
    let py = y + Math.sin(from) * ry;
    for (let i = 1; i <= 14; i++) {
      const a = from + ((to - from) * i) / 14;
      const nx = x + Math.cos(a) * rx;
      const ny = y + Math.sin(a) * ry;
      r.seg(part, px, py, nx, ny, w, w);
      px = nx;
      py = ny;
    }
  };

  if (o === 1) {
    // ---- backpack: a brass boiler with a chimney puffing steam ----
    const bx = T.x - 14;
    const by = T.y + 2;
    r.ellipse(brassD, bx + 10, by + 16, 12, 17);
    r.ellipse(brass, bx + 9, by + 15, 10.5, 15.5);
    for (let i = 0; i < 3; i++) r.rect(brassD, bx - 1, by + 6 + i * 9, 20, 1);
    r.ellipse(P.deep, bx + 9, by + 24, 4, 3);
    r.ellipse(P.accent, bx + 9, by + 24, 2.6, 2);
    r.rect(silk, bx + 2, by - 16, 6, 18);
    r.rect(silkL, bx + 1, by - 18, 8, 3);
    const puff = k.phase % 4;
    r.ellipse(steam, bx + 4 - puff, by - 23 - puff * 2, 4 + puff * 0.6, 3.5 + puff * 0.5);
    r.ellipse(steam, bx + 1 - puff, by - 30 - puff * 2, 3, 2.6);
  } else if (o === 2) {
    // ---- backpack: an air pack with two tanks and a little flag on a whip ----
    const bx = T.x - 14;
    const by = T.y + 2;
    r.rect(P.deep, bx - 1, by - 1, 22, 32);
    r.rect(P.light, bx, by, 20, 30);
    r.ellipse(P.steel, bx + 5, by + 15, 5, 14);
    r.ellipse(P.steel, bx + 15, by + 15, 5, 14);
    r.rect(P.stripe, bx, by + 6, 20, 2);
    r.rect(P.glow, bx + 8, by + 22, 4, 2);
    r.seg(P.steelD, bx + 2, by, bx - 1, by - 24, 1.4, 1.4);
    const wave = Math.sin(k.phase * 1.4) * 1.5;
    r.poly(P.stripe, [[bx - 1, by - 24], [bx - 13, by - 22 + wave], [bx - 12, by - 16 + wave], [bx - 1, by - 18]]);
    r.rect(P.light, bx - 9, by - 21 + wave, 3, 3);
  } else {
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
    if (o === 2) {
      // the fishbowl's glass, behind the head: a pale tinted sphere the head sits inside
      r.ellipse(bowl, hx, hy - 3, hs / 2 + 9, hs / 2 + 9);
      r.ellipse(bowlL, hx - 4, hy - 8, hs / 2 + 2, hs / 2 + 1);
    }
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
    r.ellipse(P.steel, hx - hs / 2 + 4, hy + 2, 3, 3);
    if (o === 1) {
      // a monocle: a brass ring round the lens on a little chain, and a tall top hat with a gear on the band
      ring(brass, hx + 7, hy + 2, hs / 3 + 2, hs / 3 + 1, 0, Math.PI * 2, 1.6);
      r.seg(brassD, hx + 7 - hs / 3, hy + 6, hx - 2, hy + hs / 2 + 2, 1, 1);
      const tx = hx - 1;
      const ty = hy - hs / 2 + 3;
      r.ellipse(silk, tx, ty, hs / 2 + 2, 3.5); // brim
      r.rect(silk, tx - hs / 3, ty - 22, (hs / 3) * 2, 22);
      r.rect(silkL, tx - hs / 3 + 2, ty - 21, 3, 18);
      r.ellipse(silk, tx, ty - 22, hs / 3, 2.5);
      r.rect(P.stripe, tx - hs / 3, ty - 6, (hs / 3) * 2, 3);
      r.ellipse(brassD, tx + hs / 3 - 2, ty - 5, 4.5, 4.5);
      r.ellipse(brass, tx + hs / 3 - 2, ty - 5, 3.2, 3.2);
      r.ellipse(P.deep, tx + hs / 3 - 2, ty - 5, 1.2, 1.2);
    } else {
      // the blinking antenna
      r.seg(P.steelD, hx, hy - hs / 2 + 1, hx + 1, hy - hs / 2 - 10, 3, 3);
      r.ellipse(blink ? P.glow : P.accent, hx + 1, hy - hs / 2 - 11, 4, 4);
    }
    if (o === 2) {
      // a glass fishbowl over the whole head: a collar ring, a thin rim and two highlight arcs
      const R = hs / 2 + 9;
      r.ellipse(P.steelD, hx, hy + hs / 2, R - 4, 4);
      r.rect(P.stripe, hx - R + 6, hy + hs / 2 - 1, (R - 6) * 2, 1);
      ring(P.shine, hx, hy - 3, R - 3, R - 3, Math.PI * 1.1, Math.PI * 1.45, 1.4);
      ring(P.shine, hx, hy - 3, R - 3, R - 3, Math.PI * 1.55, Math.PI * 1.62, 1.4);
    }
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
