import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/** Brick: a heavy blue bruiser in layered plate armour with a piston fist, reactor core, hazard belt and back exhausts. */
export function drawBrick(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.62);
  const plate = mix(armor, [220, 235, 255], 0.14);
  const accent = col(look.accent);
  const glow = mix(accent, [255, 250, 220], 0.55);
  const steel: RGB = [169, 180, 204];
  const steelD: RGB = [106, 117, 146];
  const black: RGB = [20, 22, 36];
  const P = {
    armor: r.part(armor),
    plate: r.part(plate),
    dark: r.part(dark),
    deep: r.part(deep),
    steel: r.part(steel),
    steelD: r.part(steelD),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    stripeA: r.part(accent, { flat: true }),
    stripeB: r.part(black, { flat: true }),
    seam: r.part(deep, { flat: true }),
    rivet: r.part(steel, { flat: true }),
  };
  const T = k.torso;
  const pulse = k.phase % 2;

  // ---- back arm ----
  {
    const el = k.elbowB;
    r.seg(P.deep, k.shB[0], k.shB[1], el[0], el[1], 18, 15);
    r.seg(P.dark, el[0], el[1], k.handB[0], k.handB[1], 15, 14);
    r.ellipse(P.armor, el[0], el[1], 8, 7);
    fist(r, P, k.handB, true);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- back exhausts ----
  {
    const bx = T.x - 9;
    const by = T.y + 4;
    r.rect(P.dark, bx, by, 14, 30);
    r.rect(P.deep, bx, by + 22, 14, 8);
    r.seg(P.steelD, bx + 4, by + 2, bx - 2, by - 12, 7, 6);
    r.seg(P.steelD, bx + 10, by + 4, bx + 7, by - 8, 7, 6);
    r.ellipse(P.accent, bx - 2, by - 12, 3, 3);
    r.ellipse(P.glow, bx + 7, by - 8, 2.4, 2.4);
    r.rect(P.stripeA, bx + 2, by + 12, 10, 2);
  }

  // ---- torso ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    // waist + belt block
    r.rect(P.deep, x0 + 10, top + h - 16, w - 20, 16);
    // chest shell
    r.poly(P.armor, [[x0 + 6, top], [x0 + w - 4, top], [x0 + w + 4, top + 10], [x0 + w - 8, top + h - 12], [x0 + 10, top + h - 12], [x0 - 2, top + 10]]);
    r.poly(P.dark, [[x0 - 2, top + 10], [x0 + 6, top], [x0 + 16, top + 2], [x0 + 18, top + h - 14], [x0 + 10, top + h - 12]]);
    // chest plate
    r.poly(P.plate, [[x0 + 18, top + 2], [x0 + w - 8, top + 2], [x0 + w - 2, top + 10], [x0 + w - 12, top + h - 18], [x0 + 20, top + h - 18], [x0 + 14, top + 10]]);
    // reactor housing + core
    const rx = x0 + w / 2 + 2;
    const ry = top + 18;
    r.ellipse(P.deep, rx, ry, 13, 13);
    r.ellipse(P.steelD, rx, ry, 11, 11);
    r.ellipse(P.deep, rx, ry, 9, 9);
    r.ellipse(P.accent, rx, ry, 7, 7);
    r.ellipse(P.glow, rx - 1, ry - 1, 3.5 + pulse * 0.6, 3.5 + pulse * 0.6);
    for (let a = 0; a < 6; a++) r.rect(P.rivet, rx + Math.cos((a * Math.PI) / 3) * 11.5 - 1, ry + Math.sin((a * Math.PI) / 3) * 11.5 - 1, 2, 2);
    // pec seams and ab plates
    r.rect(P.seam, x0 + 22, top + 4, 2, 10);
    r.rect(P.seam, x0 + w - 12, top + 4, 2, 10);
    for (let i = 0; i < 3; i++) {
      r.rect(P.dark, x0 + 22, top + h - 26 + i * 4, w - 36, 3);
      r.rect(P.seam, x0 + 22, top + h - 27 + i * 4, w - 36, 1);
    }
    // glowing flank seams
    r.rect(P.accent, x0 + 14, top + 22, 2, 10);
    r.rect(P.accent, x0 + w - 10, top + 22, 2, 10);
    // belt with hazard chevrons and buckle
    r.rect(P.deep, x0 + 2, top + h - 12, w - 4, 12);
    for (let i = 0; i < w - 6; i += 8) {
      r.poly(P.stripeA, [[x0 + 4 + i, top + h - 4], [x0 + 8 + i, top + h - 4], [x0 + 12 + i, top + h - 1], [x0 + 8 + i, top + h - 1]]);
    }
    r.rect(P.steel, x0 + w / 2 - 6, top + h - 11, 12, 8);
    r.rect(P.deep, x0 + w / 2 - 3, top + h - 9, 6, 4);
    // hip plates
    r.poly(P.armor, [[x0 + 2, top + h], [x0 + 14, top + h], [x0 + 12, top + h + 10], [x0 + 4, top + h + 8]]);
    r.poly(P.armor, [[x0 + w - 14, top + h], [x0 + w - 2, top + h], [x0 + w - 4, top + h + 8], [x0 + w - 12, top + h + 10]]);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- head ----
  {
    const hx = k.head.x;
    const hy = k.head.y;
    const hs = k.head.s;
    r.rect(P.deep, hx + 8, T.y - 4, hs - 12, 8); // neck
    // crest fin
    r.poly(P.dark, [[hx + 6, hy + 4], [hx + 10, hy - 8], [hx + hs - 4, hy - 7], [hx + hs - 2, hy + 4]]);
    r.rect(P.stripeA, hx + 12, hy - 6, hs - 18, 2);
    // shell
    r.poly(P.armor, [[hx - 2, hy + 8], [hx + 4, hy], [hx + hs - 2, hy], [hx + hs + 4, hy + 8], [hx + hs + 4, hy + hs - 6], [hx + hs - 6, hy + hs], [hx + 2, hy + hs - 2], [hx - 4, hy + hs - 10]]);
    r.poly(P.plate, [[hx + 4, hy + 1], [hx + hs - 2, hy + 1], [hx + hs, hy + 6], [hx + 6, hy + 6]]);
    r.rect(P.dark, hx - 3, hy + 8, 10, hs - 16); // rear shade
    for (let i = 0; i < 3; i++) r.rect(P.seam, hx, hy + 11 + i * 4, 6, 1); // vents
    // visor
    r.rect(P.deep, hx + 11, hy + 10, hs - 5, 11);
    r.rect(P.accent, hx + 13, hy + 12, hs - 9, 6);
    const scan = 14 + ((k.phase * 5) % (hs - 14));
    r.rect(P.glow, hx + scan, hy + 12, 3, 6);
    // cheek / jaw
    r.poly(P.dark, [[hx + 10, hy + 22], [hx + hs + 4, hy + 22], [hx + hs - 2, hy + hs], [hx + 6, hy + hs - 2]]);
    r.rect(P.steelD, hx + hs - 6, hy + hs - 8, 8, 4);
    r.rect(P.rivet, hx + 14, hy + 24, 2, 2);
  }

  // ---- front arm: pauldron, sleeve, piston, fist ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    r.seg(P.dark, sx, sy, el[0], el[1], 20, 17);
    // piston forearm: housing + exposed rod
    const mx = el[0] + (k.handF[0] - el[0]) * 0.45;
    const my = el[1] + (k.handF[1] - el[1]) * 0.45;
    r.seg(P.armor, el[0], el[1], mx, my, 18, 16);
    r.seg(P.steelD, mx, my, k.handF[0], k.handF[1], 9, 9);
    r.seg(P.steel, mx, my - 1, k.handF[0], k.handF[1] - 1, 4, 4);
    for (let i = 0; i < 3; i++) {
      const t = 0.15 + i * 0.28;
      const px = mx + (k.handF[0] - mx) * t;
      const py = my + (k.handF[1] - my) * t;
      r.ellipse(P.stripeA, px, py, 2.5, 6);
    }
    r.ellipse(P.dark, el[0], el[1], 10, 9);
    r.ellipse(P.armor, el[0] - 1, el[1] - 1, 8, 7);
    fist(r, P, k.handF, false);
    // pauldron
    r.ellipse(P.deep, sx + 1, sy - 6, 20, 14);
    r.ellipse(P.armor, sx, sy - 7, 18, 12);
    r.poly(P.plate, [[sx - 14, sy - 12], [sx + 12, sy - 14], [sx + 16, sy - 6], [sx - 12, sy - 4]]);
    r.rect(P.stripeA, sx - 15, sy + 1, 30, 3);
    r.rect(P.rivet, sx - 8, sy - 10, 2, 2);
    r.rect(P.rivet, sx + 6, sy - 11, 2, 2);
  }
}

type Parts = Record<'armor' | 'plate' | 'dark' | 'deep' | 'steel' | 'steelD' | 'accent' | 'glow' | 'stripeA' | 'stripeB' | 'seam' | 'rivet', number>;

function fist(r: Raster, P: Parts, h: V2, back: boolean): void {
  const [x, y] = h;
  const base = back ? P.dark : P.armor;
  r.rect(P.deep, x - 12, y - 11, 25, 22);
  r.rect(base, x - 11, y - 11, 23, 20);
  r.rect(back ? P.armor : P.plate, x - 11, y - 11, 23, 5);
  // fingers curled in
  for (let i = 0; i < 4; i++) r.rect(P.deep, x - 8 + i * 6, y - 3, 1, 10);
  r.rect(P.dark, x - 11, y + 5, 23, 4);
  r.rect(P.accent, x - 11, y + 3, 23, 2);
  r.rect(P.steel, x - 10, y - 10, 3, 3);
  r.rect(P.steel, x + 6, y - 10, 3, 3);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  const c = back ? P.deep : P.armor;
  r.seg(back ? P.deep : P.dark, hip[0], hip[1], kn[0], kn[1], 26, 21);
  r.seg(c, kn[0], kn[1], ankle[0], ankle[1], 21, 17);
  if (!back) {
    r.ellipse(P.plate, kn[0] + 4, kn[1] - 1, 9, 8);
    r.rect(P.rivet, kn[0] + 3, kn[1] - 1, 3, 3);
    r.rect(P.stripeA, ankle[0] - 8, ankle[1] - 6, 16, 2);
  }
  // boot
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(back ? P.deep : P.dark, [[bx - 10, by - 4], [bx + 8, by - 4], [bx + 18, by + 4], [bx + 18, by + 10], [bx - 12, by + 10]]);
  r.rect(back ? P.deep : P.armor, bx - 11, by - 4, 20, 4);
  r.rect(P.deep, bx - 12, by + 8, 31, 3);
}
