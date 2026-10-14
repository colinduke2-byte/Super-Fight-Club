import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import { solveLimb, type Skel } from './skeleton';

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
  // the dark mechanical frame under the plates (joints, neck, waist): the darkest value, so every plate parts from its neighbour
  const frame: RGB = mix(mul(dark, 0.42), [22, 24, 34], 0.5);
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
    frame: r.part(frame),
    frameL: r.part(mix(frame, steelD, 0.45)),
  };
  const T = k.torso;
  const pulse = k.phase % 2;
  // outfits: 1 = Siege (horned great helm with a T-slit, spiked pauldron, a chain), 2 = Diver (brass diving helmet, air tank)
  const o = look.outfit ?? 0;
  const horn = r.part([236, 226, 200]);
  const hornD = r.part([170, 156, 128]);
  const glass = r.part(mix(accent, [200, 240, 255], 0.5), { emissive: true });
  // keep the gauntlets and boots inside the frame on the widest reaches (they are the biggest pieces at a limb's end)
  const handF = clampV(k.handF, 17, r.w - 19, 17, r.h - 17);
  const handB = clampV(k.handB, 19, r.w - 19, 17, r.h - 17);
  const ankleF = clampV(k.ankleF, 15, r.w - 23, 0, k.base - 8);
  const ankleB = clampV(k.ankleB, 15, r.w - 23, 0, k.base - 8);
  // a hand pulled in re-solves its elbow, so the arm folds naturally instead of stretching to the old joint
  const elbowF = clampV(handF === k.handF ? k.elbowF : solveLimb(k.shF, handF, k.armBone, 1).mid, 14, r.w - 13, 12, r.h - 12);
  const elbowB = clampV(handB === k.handB ? k.elbowB : solveLimb(k.shB, handB, k.armBone, 1).mid, 14, r.w - 13, 12, r.h - 12);
  const kneeF = clampV(k.kneeF, 14, r.w - 14, 0, r.h - 16);
  const kneeB = clampV(k.kneeB, 14, r.w - 14, 0, r.h - 16);

  // ---- back arm: a dark frame upper arm, an elbow joint, a plated forearm ----
  {
    const el = elbowB;
    r.seg(P.frame, k.shB[0], k.shB[1], el[0], el[1], 13, 11);
    r.seg(P.deep, lerp(k.shB, el, 0.15)[0], lerp(k.shB, el, 0.15)[1], lerp(k.shB, el, 0.7)[0], lerp(k.shB, el, 0.7)[1], 16, 14);
    r.seg(P.dark, el[0], el[1], handB[0], handB[1], 15, 13);
    r.seg(P.deep, lerp(el, handB, 0.55)[0], lerp(el, handB, 0.55)[1], handB[0], handB[1], 15, 13);
    r.ellipse(P.frame, el[0], el[1], 7, 6.5);
    fist(r, P, handB, el, true);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, kneeB, ankleB, true);

  if (o === 2) {
    // ---- an air tank on the back with a hose up to the helmet ----
    const bx = Math.max(T.x - 10, 7); // tucked in on a deep wind-up so it stays in the frame
    const by = T.y + 2;
    r.ellipse(P.steelD, bx + 6, by + 2, 8, 5);
    r.rect(P.steelD, bx - 2, by + 2, 16, 26);
    r.ellipse(P.steelD, bx + 6, by + 28, 8, 4);
    r.rect(P.steel, bx + 1, by + 4, 3, 22);
    r.rect(P.stripeA, bx - 2, by + 10, 16, 2);
    r.rect(P.stripeA, bx - 2, by + 20, 16, 2);
    r.seg(P.deep, bx + 6, by - 2, k.head.x - 2, k.head.y + k.head.s - 4, 4, 4);
  } else {
  // ---- back exhausts ----
  {
    const bx = Math.max(T.x - 9, 11); // tucked in on a deep wind-up so the pipes stay in the frame
    const by = T.y + 4;
    r.rect(P.dark, bx, by, 14, 30);
    r.rect(P.deep, bx, by + 22, 14, 8);
    r.seg(P.steelD, bx + 4, by + 2, bx - 2, by - 12, 7, 6);
    r.seg(P.steelD, bx + 10, by + 4, bx + 7, by - 8, 7, 6);
    r.ellipse(P.accent, bx - 2, by - 12, 3, 3);
    r.ellipse(P.glow, bx + 7, by - 8, 2.4, 2.4);
    r.rect(P.stripeA, bx + 2, by + 12, 10, 2);
  }
  }

  // ---- torso ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    // the dark frame at the neck and the waist, so the chest shell sits apart from the head and the belt
    r.rect(P.frame, x0 + 12, top - 2, w - 22, 8);
    r.rect(P.frame, x0 + 8, top + h - 18, w - 16, 18);
    for (let i = 0; i < 3; i++) r.rect(P.frameL, x0 + 12, top + h - 16 + i * 3, w - 24, 1);
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

  if (o === 1) {
    // a heavy chain slung across the chest
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      const cx = T.x + 4 + (T.w - 8) * t;
      const cy = T.y + 4 + (T.h - 20) * t;
      r.ellipse(i % 2 ? P.steel : P.steelD, cx, cy, i % 2 ? 2.4 : 3.6, i % 2 ? 3.6 : 2.4);
    }
  }

  // ---- front leg ----
  leg(r, P, k.hipF, kneeF, ankleF, false);

  if (o === 1) {
    // ---- head: a horned great helm with a T-shaped eye slit ----
    const hx = k.head.x;
    const hy = k.head.y;
    const hs = k.head.s;
    r.rect(P.frame, hx + 8, T.y - 4, hs - 12, 8); // neck
    // horns: thick at the root, curving up and forward
    for (const [bx, dir] of [[hx + 2, -1], [hx + hs - 2, 1]] as const) {
      let px = bx;
      let py = hy + 6;
      for (let i = 0; i < 5; i++) {
        const x = px + dir * (4 - i * 0.6) + (dir > 0 ? 1 : -0.5);
        const y = py - 4.5 + i * 0.2;
        r.seg(i < 3 ? horn : hornD, px, py, x, y, 8 - i * 1.4, 7 - i * 1.4);
        px = x;
        py = y;
      }
    }
    r.poly(P.armor, [[hx - 2, hy + 4], [hx + hs + 2, hy + 2], [hx + hs + 5, hy + hs - 4], [hx + hs - 2, hy + hs + 1], [hx + 2, hy + hs], [hx - 3, hy + hs - 6]]);
    r.poly(P.plate, [[hx + 1, hy + 4], [hx + hs, hy + 3], [hx + hs + 1, hy + 8], [hx + 2, hy + 9]]);
    r.rect(P.dark, hx - 2, hy + 9, 8, hs - 14);
    // a ridge down the middle and the T-slit
    r.rect(P.dark, hx + hs - 6, hy + 2, 3, hs - 4);
    r.rect(P.deep, hx + 9, hy + 12, hs - 4, 4);
    r.rect(P.deep, hx + hs - 7, hy + 12, 5, 14);
    r.rect(P.accent, hx + 11, hy + 13, hs - 8, 2);
    r.rect(P.glow, hx + hs - 6, hy + 14, 3, 9);
    for (let i = 0; i < 4; i++) r.rect(P.rivet, hx + 6 + i * 6, hy + hs - 3, 2, 2);
  } else if (o === 2) {
    // ---- head: a round brass diving helmet with a big front port and two side ports ----
    const hx = k.head.x;
    const hy = k.head.y;
    const hs = k.head.s;
    const cx = hx + hs / 2 + 1;
    const cy = hy + hs / 2 + 2;
    const R = hs / 2 + 7;
    r.ellipse(P.deep, cx, T.y + 1, R + 2, 7); // collar
    r.ellipse(P.dark, cx + 1, cy + 1, R, R);
    r.ellipse(P.armor, cx, cy, R - 1, R - 1);
    r.ellipse(P.plate, cx - 4, cy - 6, R * 0.5, R * 0.35);
    // front port: a thick ring, glass with a glowing face behind it, a cross guard
    const fx = cx + R * 0.45;
    r.ellipse(P.frame, fx + 0.5, cy + 1.5, 11, 11);
    r.ellipse(P.steel, fx - 0.5, cy + 0.5, 9.6, 9.6);
    r.ellipse(P.frame, fx, cy + 1, 7.4, 7.4);
    // dark glass with two glowing eyes looking out of it, a top bar and a glint
    r.rect(P.glow, fx - 4, cy, 3, 3);
    r.rect(P.glow, fx + 2, cy, 3, 3);
    r.rect(P.steelD, fx - 6, cy - 4, 12, 2);
    r.rect(glass, fx - 4, cy - 6, 2, 1);
    for (let i = 0; i < 4; i++) r.rect(P.rivet, fx + Math.cos(i * 1.57 + 0.78) * 9.4 - 1, cy + 0.5 + Math.sin(i * 1.57 + 0.78) * 9.4 - 1, 2, 2);
    // top port and bolts around the collar
    r.ellipse(P.steelD, cx - 3, cy - R + 5, 4, 3.4);
    r.ellipse(glass, cx - 3, cy - R + 5, 2.6, 2.2);
    for (let i = 0; i < 6; i++) r.rect(P.rivet, cx - R + 2 + i * ((2 * R - 4) / 5), T.y - 1, 2, 2);
  } else {
  // ---- head ----
  {
    const hx = k.head.x;
    const hy = k.head.y;
    const hs = k.head.s;
    r.rect(P.frame, hx + 8, T.y - 4, hs - 12, 8); // neck
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
    // a steel mouth grille on the jaw and a bolted ear disc at the side, so the head reads as a face in profile
    r.rect(P.steelD, hx + hs - 8, hy + hs - 9, 11, 6);
    for (let i = 0; i < 3; i++) r.rect(P.frame, hx + hs - 7 + i * 4, hy + hs - 8, 1, 4);
    r.ellipse(P.frame, hx + 5, hy + 16, 5, 5);
    r.ellipse(P.steelD, hx + 5, hy + 16, 3.6, 3.6);
    r.rect(P.frame, hx + 3, hy + 15.5, 4, 1);
  }
  }

  // ---- front arm: pauldron, frame upper arm with a bicep plate, elbow joint, piston forearm, fist ----
  {
    const [sx, sy] = k.shF;
    const el = elbowF;
    const hand = handF;
    r.seg(P.frame, sx, sy, el[0], el[1], 14, 12);
    const b0 = lerp(k.shF, el, 0.2);
    const b1 = lerp(k.shF, el, 0.72);
    r.seg(P.dark, b0[0], b0[1], b1[0], b1[1], 19, 16);
    // piston forearm: housing + exposed rod
    const mx = el[0] + (hand[0] - el[0]) * 0.5;
    const my = el[1] + (hand[1] - el[1]) * 0.5;
    r.seg(P.armor, el[0], el[1], mx, my, 19, 17);
    r.seg(P.plate, el[0] - 1, el[1] - 3, mx - 1, my - 3, 6, 5);
    r.seg(P.frame, mx, my, hand[0], hand[1], 10, 10);
    r.seg(P.steel, mx, my - 1, hand[0], hand[1] - 1, 4, 4);
    for (let i = 0; i < 2; i++) {
      const t = 0.25 + i * 0.35;
      const px = mx + (hand[0] - mx) * t;
      const py = my + (hand[1] - my) * t;
      r.ellipse(P.stripeA, px, py, 2.5, 5);
    }
    r.ellipse(P.frame, el[0], el[1], 8, 7.5);
    r.ellipse(P.armor, el[0] - 0.5, el[1] - 1, 5.5, 5);
    fist(r, P, hand, el, false);
    // pauldron: sits low and outboard so the visor stays readable
    const px = sx + 5;
    const py = sy + 1;
    r.ellipse(P.frame, px + 1, py - 3, 16, 12);
    r.ellipse(P.armor, px, py - 5, 15, 10);
    r.poly(P.plate, [[px - 11, py - 10], [px + 9, py - 12], [px + 13, py - 5], [px - 9, py - 3]]);
    r.rect(P.dark, px - 14, py + 1, 28, 5);
    r.rect(P.stripeA, px - 13, py + 2, 26, 2);
    r.rect(P.rivet, px - 6, py - 8, 2, 2);
    r.rect(P.rivet, px + 5, py - 9, 2, 2);
    if (o === 1) {
      // three spikes along the top of the pauldron
      for (let i = 0; i < 3; i++) {
        const sx2 = px - 9 + i * 9;
        r.poly(i === 1 ? horn : hornD, [[sx2 - 3, py - 12], [sx2 + 3, py - 13], [sx2 - 1, py - 24 + Math.abs(i - 1) * 3]]);
      }
    }
  }
}

type Parts = Record<'armor' | 'plate' | 'dark' | 'deep' | 'steel' | 'steelD' | 'accent' | 'glow' | 'stripeA' | 'stripeB' | 'seam' | 'rivet' | 'frame' | 'frameL', number>;

function lerp(a: V2, b: V2, t: number): V2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** `v` kept inside the box; the same object back when it already was (so callers can tell whether it moved). */
function clampV(v: V2, x0: number, x1: number, y0: number, y1: number): V2 {
  const x = Math.max(x0, Math.min(x1, v[0]));
  const y = Math.max(y0, Math.min(y1, v[1]));
  return x === v[0] && y === v[1] ? v : [x, y];
}

/**
 * An armoured gauntlet closed into a fist: a dark cuff across the wrist, a back-of-hand plate, four finger rolls curled
 * on the striking face with dark gaps between them, steel knuckle studs and a thumb laid over the top.
 */
function fist(r: Raster, P: Parts, h: V2, el: V2, back: boolean): void {
  const [x, y] = h;
  let dx = x - el[0];
  let dy = y - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const nx = -dy;
  const ny = dx;
  const shell = back ? P.dark : P.armor;
  const lit = back ? P.armor : P.plate;
  // cuff across the wrist, square to the forearm
  const cx = x - dx * 9;
  const cy = y - dy * 9;
  r.seg(P.frame, cx - nx * 9, cy - ny * 9, cx + nx * 9, cy + ny * 9, 7, 7);
  r.seg(P.accent, cx - nx * 8 + dx * 1.5, cy - ny * 8 + dy * 1.5, cx + nx * 8 + dx * 1.5, cy + ny * 8 + dy * 1.5, 1.5, 1.5);
  // the hand: a dark underside, the plated back, a lit top edge
  r.ellipse(P.frame, x + 1, y + 1, 12.5, 11.5);
  r.ellipse(shell, x - 1, y, 11, 10.5);
  r.ellipse(lit, x - 3, y - 4, 7, 4.5);
  // fingers curled on the front face (always the side facing forward), separated by dark gaps
  r.rect(P.frame, x + 2, y - 10, 10, 20);
  for (let i = 0; i < 4; i++) {
    const fy = y - 8 + i * 5;
    r.seg(i % 2 ? shell : lit, x + 3, fy, x + 9, fy, 4.4, 4.4);
    r.rect(P.steel, x + 10, fy - 1, 2, 2);
  }
  // thumb over the top of the fingers
  r.seg(P.frame, x - 4, y - 8, x + 6, y - 11, 6, 5.5);
  r.seg(back ? P.deep : P.dark, x - 4, y - 9, x + 6, y - 11.5, 4.4, 4);
  r.rect(P.rivet, x - 7, y + 1, 2, 2);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  const plate = back ? P.deep : P.armor;
  const thigh = back ? P.deep : P.armor;
  // the frame: a dark hydraulic thigh and shin under the plates
  r.seg(P.frame, hip[0], hip[1], kn[0], kn[1], 18, 16);
  r.seg(P.frame, kn[0], kn[1], ankle[0], ankle[1], 15, 13);
  // thigh plate (upper two thirds of the thigh), shin greave
  const t0 = lerp(hip, kn, 0.05);
  const t1 = lerp(hip, kn, 0.7);
  r.seg(thigh, t0[0], t0[1], t1[0], t1[1], 25, 21);
  if (!back) r.seg(P.plate, t0[0] - 5, t0[1] + 1, t1[0] - 5, t1[1], 5, 4);
  const s0 = lerp(kn, ankle, 0.22);
  const s1 = lerp(kn, ankle, 0.92);
  r.seg(plate, s0[0], s0[1], s1[0], s1[1], 21, 17);
  if (!back) {
    r.seg(P.plate, s0[0] + 4, s0[1], s1[0] + 3, s1[1] - 2, 5, 4);
    r.rect(P.stripeA, ankle[0] - 8, ankle[1] - 6, 16, 2);
  }
  // knee: a pointed poleyn plate over the joint
  const kx = kn[0] + 3;
  const ky = kn[1];
  r.poly(P.frame, [[kx - 9, ky - 8], [kx + 6, ky - 9], [kx + 11, ky], [kx + 6, ky + 9], [kx - 9, ky + 8]]);
  r.poly(back ? P.dark : P.plate, [[kx - 7, ky - 6], [kx + 5, ky - 7], [kx + 9, ky], [kx + 5, ky + 6], [kx - 7, ky + 5]]);
  if (!back) r.rect(P.armor, kx - 7, ky + 2, 13, 3);
  r.rect(P.rivet, kx - 1, ky - 3, 2, 2);
  // boot: a heavy sabaton with a toe cap and a thick sole; its sole sits on the ankle line + 8 (the floor)
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(back ? P.frame : P.deep, [[bx - 10, by - 5], [bx + 7, by - 5], [bx + 17, by + 1], [bx + 18, by + 6], [bx - 12, by + 6]]);
  r.poly(back ? P.deep : P.dark, [[bx + 6, by - 2], [bx + 16, by + 2], [bx + 17, by + 5], [bx + 6, by + 5]]);
  r.rect(back ? P.deep : P.armor, bx - 11, by - 6, 19, 4);
  r.rect(P.frame, bx - 12, by + 5, 31, 4);
  r.rect(P.frameL, bx - 11, by + 5, 29, 1);
}
