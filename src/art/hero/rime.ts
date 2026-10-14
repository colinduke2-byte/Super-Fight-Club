import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import { solveLimb, type Skel } from './skeleton';

/**
 * Rime: a slim frost ninja. A wide conical kasa hat lacquered in ice-blue with a frosted crown and icicles hanging off the
 * brim; under it a dark hood, a band of bare skin with one glowing eye, and a cloth mask over the jaw; a long scarf
 * wrapped at the throat and streaming behind; a short haori vest over a fitted gi with a sash; lighter hakama-cut trousers
 * with shin wraps, bandaged forearms, wrapped gloves, an icicle cluster on the front shoulder, split-toe tabi boots and a
 * kunai with a frozen edge. Values step from the white wraps and the light vest to the mid trousers, the dark gi and the
 * near-black hood, gloves and tabi, so limbs part from the body and from each other.
 */
export function drawRime(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.55);
  const accent = col(look.accent);
  const glow = mix(accent, [255, 255, 255], 0.55);
  const ice: RGB = mix(accent, [255, 255, 255], 0.3);
  const wrap: RGB = [226, 232, 240];
  const steel: RGB = [206, 216, 236];
  const steelD: RGB = [110, 124, 156];
  const skin = col(look.skin);
  const gi: RGB = mix(dark, deep, 0.4);
  const pants: RGB = mix(dark, armor, 0.3);
  const ink: RGB = mix(mul(deep, 0.55), [14, 16, 24], 0.5);
  const P: Parts = {
    armor: r.part(armor),
    light: r.part(mix(armor, [230, 248, 255], 0.3)),
    dark: r.part(dark, { soft: true }),
    deep: r.part(deep, { soft: true }),
    gi: r.part(gi, { soft: true }),
    giL: r.part(mix(gi, armor, 0.3), { soft: true }),
    pants: r.part(pants, { soft: true }),
    pantsD: r.part(mul(pants, 0.72), { soft: true }),
    ink: r.part(ink, { soft: true }),
    inkL: r.part(mix(ink, armor, 0.3), { flat: true }),
    vest: r.part(armor, { soft: true }),
    vestL: r.part(mix(armor, [230, 248, 255], 0.25), { soft: true }),
    trim: r.part([236, 244, 252], { flat: true }),
    sash: r.part(mix(accent, armor, 0.35), { soft: true }),
    wrap: r.part(wrap, { soft: true }),
    wrapL: r.part(mul(wrap, 0.78), { flat: true }),
    wrapD: r.part(mix(mul(wrap, 0.62), deep, 0.3), { soft: true }),
    scarf: r.part(accent, { soft: true }),
    scarfD: r.part(mul(accent, 0.7), { soft: true }),
    hat: r.part(mix(armor, [220, 240, 255], 0.18)),
    hatD: r.part(mul(armor, 0.7)),
    frost: r.part([244, 250, 255]),
    ice: r.part(ice),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    steel: r.part(steel),
    steelD: r.part(steelD),
    edge: r.part([255, 255, 255], { flat: true }),
    seam: r.part(mul(deep, 0.8), { flat: true }),
    skin: r.part(skin, { soft: true }),
    skinD: r.part(mul(skin, 0.72), { soft: true }),
  };
  const T = k.torso;
  const run = k.pose.lean > 2;
  const air = k.pose.frontHand[1] < -8;
  const sw = (i: number, a = 2): number => Math.sin(k.phase * 1.3 + i * 0.8) * a;
  // outfits: 1 = Kitsune (fox mask, ears, a long ponytail, no hat), 2 = Yeti (shaggy fur hood, fur mantle and boots)
  const o = look.outfit ?? 0;
  const fur: RGB = mix(armor, [250, 252, 255], 0.35);
  const F = {
    fur: r.part(fur, { soft: true }),
    furD: r.part(mul(fur, 0.78), { soft: true }),
    furDeep: r.part(mul(fur, 0.55), { soft: true }),
    mask: r.part([246, 244, 238]),
    maskRim: r.part([70, 52, 56], { flat: true }),
    maskMark: r.part(accent, { flat: true }),
    hair: r.part(mix([236, 240, 248], armor, 0.12), { soft: true }),
    hairD: r.part(mul(mix([236, 240, 248], armor, 0.12), 0.72), { soft: true }),
  };
  /** A tuft of fur: a few short strands fanning from (x, y). */
  const tuft = (x: number, y: number, dir: number, len: number, i: number): void => {
    for (let s = -1; s <= 1; s++) r.seg(s === 0 ? F.fur : F.furD, x, y, x + dir * len * 0.5 + s * 2 + sw(i + s, 0.6), y + len, 2.2, 1);
  };
  // limb ends stay inside the frame on the widest reaches (the arm folds instead of stretching), boots stay on the floor
  const handF = clampV(k.handF, 9, r.w - 12, 9, r.h - 12);
  const handB = clampV(k.handB, 9, r.w - 10, 9, r.h - 12);
  const elbowF = clampV(handF === k.handF ? k.elbowF : solveLimb(k.shF, handF, k.armBone, 1).mid, 7, r.w - 7, 7, r.h - 9);
  const elbowB = clampV(handB === k.handB ? k.elbowB : solveLimb(k.shB, handB, k.armBone, 1).mid, 7, r.w - 7, 7, r.h - 9);
  const ankleF = clampV(k.ankleF, 11, r.w - 19, 10, k.base - 8);
  const ankleB = clampV(k.ankleB, 11, r.w - 19, 10, k.base - 8);
  const kneeF = clampV(k.kneeF, 8, r.w - 8, 8, r.h - 12);
  const kneeB = clampV(k.kneeB, 8, r.w - 8, 8, r.h - 12);

  if (o === 1) {
    // ---- a long white ponytail, tied high and streaming back ----
    const hx = k.head.x;
    const hy = k.head.y + 3;
    let px = hx + 2;
    let py = hy + 1;
    const flow = run ? -0.2 : air ? -0.8 : 0.6;
    for (let i = 0; i < 8; i++) {
      const x = Math.max(9, px - 4.2);
      const y = Math.max(8, py + flow * 2.4 + sw(i + 3, 0.8 + i * 0.25));
      r.seg(i % 3 === 2 ? F.hairD : F.hair, px, py, x, y, 7 - i * 0.6, 6 - i * 0.6);
      px = x;
      py = y;
    }
  }

  // ---- long scarf streaming from the neck (behind everything) ----
  if (o !== 2) {
    const nx = T.x + 9;
    const ny = T.y + 1;
    const flow = run ? 0 : air ? -0.9 : 0.5;
    let px = nx;
    let py = ny;
    for (let i = 0; i < 11; i++) {
      // the tail curls up and back in on itself rather than leave the frame
      const x = Math.max(12, nx - 3 - i * 4.2);
      const y = Math.max(10, Math.min(r.h - 14, ny + i * flow * 3 + sw(i, 1.6 + i * 0.25)));
      const w = 8 - i * 0.4;
      r.seg(i % 4 === 3 ? P.scarfD : P.scarf, px, py, x, y, w, Math.max(3, w - 0.5));
      px = x;
      py = y;
    }
    // a frosted, fringed tail
    r.seg(P.frost, px, py, Math.max(7, px - 5), py + 3, 3.6, 2);
    r.seg(P.frost, px, py, Math.max(7, px - 4), py - 3, 3.6, 2);
  }

  // ---- back arm: dark sleeve, wrapped forearm in shadow, an open gloved hand ----
  {
    const el = elbowB;
    r.seg(P.ink, k.shB[0], k.shB[1], el[0], el[1], 9, 8);
    r.seg(P.gi, k.shB[0] - 0.5, k.shB[1] - 0.5, el[0] - 0.5, el[1] - 0.5, 7, 6);
    r.seg(P.ink, el[0], el[1], handB[0], handB[1], 8, 7);
    r.seg(P.wrapD, el[0] - 0.5, el[1] - 0.5, handB[0] - 0.5, handB[1] - 0.5, 6, 5);
    hand(r, P, el, handB, true);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, kneeB, ankleB, true, o === 2 ? F.furD : -1);

  // ---- vest tails behind the hips ----
  r.poly(P.ink, [[T.x, T.y + T.h - 7], [T.x + 13, T.y + T.h - 7], [T.x + 7 + sw(1), T.y + T.h + 17], [T.x - 6 + sw(2), T.y + T.h + 19]]);
  r.poly(P.vest, [[T.x + 1, T.y + T.h - 6], [T.x + 12, T.y + T.h - 6], [T.x + 6 + sw(1), T.y + T.h + 16], [T.x - 5 + sw(2), T.y + T.h + 18]]);
  r.rect(P.trim, T.x - 4 + sw(2), T.y + T.h + 16, 9, 1);

  // ---- torso: fitted gi under a short sleeveless haori vest, sash ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    r.poly(P.ink, [[x0 + 2, top], [x0 + w - 1, top], [x0 + w + 1, top + 8], [x0 + w - 3, top + h + 1], [x0 + 4, top + h + 1], [x0 - 1, top + 8]]);
    r.poly(P.gi, [[x0 + 3, top + 1], [x0 + w - 2, top + 1], [x0 + w, top + 8], [x0 + w - 4, top + h], [x0 + 5, top + h], [x0, top + 8]]);
    // the vest: two front panels that part over the chest, white trim down the edges
    r.poly(P.vest, [[x0 - 1, top + 2], [x0 + w / 2 - 1, top + 3], [x0 + w / 2 + 1, top + h - 4], [x0 + 3, top + h - 2]]);
    r.poly(P.vestL, [[x0 + w / 2 + 3, top + 3], [x0 + w + 1, top + 2], [x0 + w - 1, top + h - 2], [x0 + w / 2 + 4, top + h - 4]]);
    // the gi's crossed collar shows in the V between the panels
    r.poly(P.giL, [[x0 + w / 2 - 1, top + 3], [x0 + w / 2 + 3, top + 3], [x0 + w / 2 + 2, top + 12]]);
    r.seg(P.trim, x0 + w / 2 - 1, top + 3, x0 + w / 2 + 1, top + h - 4, 1.6, 1.6);
    r.seg(P.trim, x0 + w / 2 + 3, top + 3, x0 + w / 2 + 4, top + h - 4, 1.6, 1.6);
    // snowflake crest on the vest
    const cx = x0 + w - 7;
    const cy = top + 10;
    r.inlay(P.vestL, P.trim, (set) => {
      for (let i = -3; i <= 3; i++) {
        set(cx + i, cy);
        set(cx, cy + i);
        set(cx + i * 0.7, cy + i * 0.7);
        set(cx + i * 0.7, cy - i * 0.7);
      }
    });
    // sash with a knot and hanging ends
    r.rect(P.ink, x0, top + h - 7, w, 8);
    r.rect(P.sash, x0 + 1, top + h - 6, w - 2, 6);
    r.rect(P.trim, x0 + 1, top + h - 6, w - 2, 1);
    r.ellipse(P.sash, x0 + 4, top + h - 3, 3.5, 3.5);
    r.seg(P.sash, x0 + 3, top + h - 1, x0 - 1 + sw(3), top + h + 9, 3, 2);
    // high collar
    r.poly(P.ink, [[x0 + 6, top - 3], [x0 + w - 4, top - 3], [x0 + w - 2, top + 5], [x0 + 5, top + 5]]);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, kneeF, ankleF, false, o === 2 ? F.fur : -1);

  if (o === 2) {
    // ---- fur mantle across the shoulders (kept high, so the vest still shows) ----
    r.ellipse(F.furDeep, T.x + T.w / 2, T.y + 2, T.w / 2 + 7, 6);
    r.ellipse(F.furD, T.x + T.w / 2, T.y + 1, T.w / 2 + 6, 5.5);
    r.ellipse(F.fur, T.x + T.w / 2 + 1, T.y, T.w / 2 + 4, 4);
    for (let i = 0; i < 7; i++) tuft(T.x - 4 + i * ((T.w + 8) / 6), T.y + 3, i < 3 ? -0.4 : 0.4, 4, i + 9);
  } else {
    // ---- the scarf wrapped at the throat, its end knotted at the front ----
    r.ellipse(P.scarfD, T.x + T.w / 2 + 1, T.y - 1, T.w / 2 - 1, 4.5);
    r.ellipse(P.scarf, T.x + T.w / 2, T.y - 2, T.w / 2 - 2, 3.5);
    r.ellipse(P.scarfD, T.x + T.w - 4, T.y + 1, 2.6, 2.6);
  }

  if (o === 1) {
    // ---- head: hair tied back, a white fox mask with red markings and tall ears ----
    const hx = k.head.x;
    const hy = k.head.y + 3;
    const hs = k.head.s;
    r.rect(P.ink, hx + 6, T.y - 5, hs - 10, 8); // neck
    // hair: a shadowed mass at the back of the head with combed streaks, the tie at the crown
    r.ellipse(F.hairD, hx + hs / 2, hy + hs / 2 + 1, hs / 2 + 2, hs / 2 + 1);
    r.ellipse(F.hair, hx + hs / 2 - 1, hy + hs / 2 - 1, hs / 2, hs / 2 - 1);
    for (let i = 0; i < 3; i++) r.seg(F.hairD, hx + 2 + i * 3, hy + 3, hx - 1 + i * 3, hy + hs - 2, 1, 1);
    r.ellipse(P.sash, hx + 1, hy + 2, 3, 3); // the tie
    // mask: rounded brow, a pointed muzzle forward, ringed in a dark lacquer edge so it parts from the white hair
    const maskPts: V2[] = [[hx + 5, hy + 1], [hx + hs + 2, hy], [hx + hs + 9, hy + hs / 2 + 3], [hx + hs + 1, hy + hs + 1], [hx + 7, hy + hs + 1], [hx + 5, hy + hs / 2]];
    const earA: V2[] = [[hx + 6, hy + 2], [hx + 8, hy - 11], [hx + 13, hy + 1]];
    const earB: V2[] = [[hx + hs - 4, hy + 1], [hx + hs, hy - 12], [hx + hs + 4, hy + 2]];
    for (const [ox, oy] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]] as const) {
      for (const pts of [maskPts, earA, earB]) r.poly(F.maskRim, pts.map(([x, y]) => [x + ox, y + oy] as V2));
    }
    r.poly(F.mask, maskPts);
    r.poly(F.mask, earA);
    r.poly(F.mask, earB);
    r.poly(F.maskMark, [[hx + 8, hy], [hx + 8.6, hy - 7], [hx + 11, hy]]);
    r.poly(F.maskMark, [[hx + hs - 2, hy], [hx + hs, hy - 8], [hx + hs + 2, hy + 1]]);
    // markings: swept brows, cheek flicks, a black nose tip; a dark eye hole with the glowing eye inside
    r.seg(F.maskMark, hx + hs - 10, hy + 6, hx + hs + 1, hy + 4, 1.8, 1.2);
    r.seg(F.maskMark, hx + hs - 4, hy + hs - 3, hx + hs + 4, hy + hs - 6, 1.6, 1);
    r.seg(F.maskMark, hx + 8, hy + hs - 6, hx + 13, hy + hs - 3, 1.4, 1);
    r.ellipse(F.maskRim, hx + hs + 8, hy + hs / 2 + 3, 1.8, 1.6);
    r.poly(F.maskRim, [[hx + hs - 9, hy + hs / 2 - 3], [hx + hs, hy + hs / 2 - 3], [hx + hs + 1, hy + hs / 2], [hx + hs - 8, hy + hs / 2 + 1]]);
    r.rect(P.glow, hx + hs - 5, hy + hs / 2 - 2, 4, 2);
    r.rect(F.maskRim, hx + hs - 1, hy + hs / 2 + 6, 6, 1); // the mouth line
  } else if (o === 2) {
    // ---- head: a shaggy fur hood framing a shadowed face, a dark mask and a glowing eye ----
    const hx = k.head.x;
    const hy = k.head.y + 3;
    const hs = k.head.s;
    r.rect(P.ink, hx + 6, T.y - 5, hs - 10, 8); // neck
    r.ellipse(F.furDeep, hx + hs / 2, hy + hs / 2 + 2, hs / 2 + 7, hs / 2 + 6);
    r.ellipse(F.furD, hx + hs / 2, hy + hs / 2 + 1, hs / 2 + 6, hs / 2 + 5);
    r.ellipse(F.fur, hx + hs / 2 - 1, hy + hs / 2 - 1, hs / 2 + 4, hs / 2 + 3);
    for (let i = 0; i < 7; i++) tuft(hx - 5 + i * ((hs + 12) / 6), hy - 6 + Math.abs(i - 3) * 2, i < 3 ? -1 : 1, 4, i);
    // the face opening: deep shadow ringed by the hood's inner fur, skin around the eye, a cloth mask over the jaw
    const fx = hx + hs / 2 + 6;
    const fy = hy + hs / 2 + 2;
    r.ellipse(F.furDeep, fx, fy, hs / 2 - 1, hs / 2 - 1);
    r.ellipse(P.ink, fx + 1, fy, hs / 2 - 3, hs / 2 - 3);
    r.poly(P.skinD, [[fx - 4, fy - 5], [fx + hs / 2 - 2, fy - 5], [fx + hs / 2 - 1, fy + 1], [fx - 4, fy + 1]]);
    r.poly(P.skin, [[fx - 2, fy - 5], [fx + hs / 2 - 2, fy - 5], [fx + hs / 2 - 1, fy - 1], [fx - 2, fy - 1]]);
    r.rect(P.glow, fx + 3, fy - 4, 5, 2);
    r.rect(P.ink, fx + 2, fy - 6, 8, 1); // the brow's shadow
    r.poly(P.dark, [[fx - 5, fy + 1], [fx + hs / 2 - 1, fy + 1], [fx + hs / 2 - 3, fy + hs / 2 - 3], [fx - 3, fy + hs / 2 - 2]]);
    r.rect(P.seam, fx - 3, fy + 4, hs / 2, 1);
    // a fringe of fur over the brow, then little ice horns poking out of the hood
    for (let i = 0; i < 4; i++) r.seg(i % 2 ? F.fur : F.furD, fx - 6 + i * 4, fy - hs / 2 + 1, fx - 5 + i * 4 + sw(i, 0.5), fy - hs / 2 + 6, 2.6, 1.2);
    r.poly(P.ice, [[hx + 2, hy - 2], [hx - 4, hy - 12], [hx + 6, hy - 4]]);
    r.poly(P.ice, [[hx + hs - 2, hy - 3], [hx + hs + 2, hy - 13], [hx + hs + 4, hy - 2]]);
  } else {
    const hx = k.head.x;
    const hy = k.head.y + 3;
    const hs = k.head.s;
    r.rect(P.ink, hx + 6, T.y - 5, hs - 10, 8); // neck
    // the hood (back of the head), a band of bare skin over the eyes, a cloth mask over the nose and jaw
    r.ellipse(P.ink, hx + hs / 2 + 3, hy + hs / 2 + 2, hs / 2 + 1, hs / 2);
    r.ellipse(P.deep, hx + hs / 2 + 2, hy + hs / 2 + 1, hs / 2, hs / 2 - 1);
    const ey = hy + hs / 2 - 4;
    r.poly(P.skinD, [[hx + hs * 0.42, ey], [hx + hs + 3, ey], [hx + hs + 3, ey + 7], [hx + hs * 0.42, ey + 7]]);
    r.poly(P.skin, [[hx + hs * 0.5, ey + 1], [hx + hs + 3, ey + 1], [hx + hs + 3, ey + 6], [hx + hs * 0.5, ey + 6]]);
    // the eye glows in the shadow of the brim, a hard brow over it
    r.rect(P.ink, hx + hs - 6, ey + 1, 8, 5);
    r.rect(P.glow, hx + hs - 4, ey + 2, 5, 3);
    r.rect(P.accent, hx + hs - 10, ey + 3, 4, 1);
    r.rect(P.ink, hx + hs - 8, ey, 11, 1);
    r.poly(P.dark, [[hx + hs * 0.4, ey + 7], [hx + hs + 5, ey + 7], [hx + hs + 6, ey + 10], [hx + hs + 1, hy + hs], [hx + 8, hy + hs + 2]]);
    r.rect(P.seam, hx + 9, ey + 11, hs - 4, 1);
    r.rect(P.seam, hx + hs - 2, ey + 8, 1, 4);
    // white hair spilling out at the back
    r.poly(P.frost, [[hx - 2, hy + 2], [hx + 6, hy + 4], [hx + 2, hy + 12], [hx - 8 - sw(4, 1.5), hy + 9]]);
    r.seg(P.wrapL, hx + 3, hy + 4, hx - 5 - sw(4, 1.5), hy + 9, 1, 1);
    // the kasa: a wide shallow cone with a frosted crown, a dark under-brim and icicles
    const bx0 = hx - 18;
    const bx1 = hx + hs + 19;
    const by = hy + 1;
    const peakX = (bx0 + bx1) / 2 + 2;
    const peakY = hy - 12;
    r.poly(P.ink, [[bx0, by + 1], [bx1, by + 1], [bx1 - 4, by + 4], [bx0 + 4, by + 4]]); // under-brim shadow
    r.poly(P.hat, [[bx0, by], [peakX - 4, peakY + 1], [peakX + 4, peakY + 1], [bx1, by]]);
    r.poly(P.frost, [[peakX - 9, peakY + 6], [peakX - 4, peakY + 1], [peakX + 4, peakY + 1], [peakX + 10, peakY + 7], [peakX + 4, peakY + 8], [peakX - 3, peakY + 9]]);
    r.ellipse(P.ice, peakX, peakY, 3, 2.5); // an ice finial
    r.ellipse(P.glow, peakX, peakY - 1, 1.2, 1.2);
    // woven bands
    r.inlay(P.hat, P.hatD, (set) => {
      for (let i = 0; i < 2; i++) {
        const t = 0.45 + i * 0.28;
        const yy = peakY + (by - peakY) * t;
        const half = ((bx1 - bx0) / 2) * t;
        for (let x = -half; x <= half; x += 1) set(peakX + x, yy);
      }
    });
    // icicles along the brim (they sway a touch)
    for (let i = 0; i < 5; i++) {
      const ix = bx0 + 4 + i * ((bx1 - bx0 - 8) / 4);
      const len = 2 + ((i * 3) % 3);
      r.poly(P.ice, [[ix - 1.6, by + 1], [ix + 1.6, by + 1], [ix + sw(i, 0.4), by + 1 + len]]);
    }
  }

  // ---- front arm: icicle pauldron, bandaged forearm, gloved fist, kunai ----
  {
    const [sx, sy] = k.shF;
    const el = elbowF;
    r.seg(P.ink, sx, sy, el[0], el[1], 10, 9);
    r.seg(P.gi, sx - 0.5, sy - 0.5, el[0] - 0.5, el[1] - 0.5, 8, 7);
    r.seg(P.wrapD, el[0], el[1] + 0.5, handF[0], handF[1] + 0.5, 8, 7);
    r.seg(P.wrap, el[0] - 0.5, el[1] - 0.5, handF[0] - 0.5, handF[1] - 0.5, 6.4, 5.4);
    for (let i = 0; i < 3; i++) {
      const t = 0.25 + i * 0.22;
      const px = el[0] + (handF[0] - el[0]) * t;
      const py = el[1] + (handF[1] - el[1]) * t;
      r.seg(P.wrapL, px - 3, py + 1, px + 3, py - 1, 1, 1);
    }
    // the shoulder piece
    if (o === 2) {
      r.ellipse(F.furD, sx, sy + 1, 8.5, 7);
      r.ellipse(F.fur, sx - 0.5, sy, 7.5, 6);
      tuft(sx - 5, sy + 2, -0.5, 5, 20);
      tuft(sx + 3, sy + 3, 0.5, 5, 21);
    } else if (o === 1) {
      // a lacquered shoulder guard with a red cord
      sode(r, P.ink, P.armor, P.light, sx, sy);
      r.rect(F.maskMark, sx - 5, sy + 3, 11, 1);
    } else {
      r.poly(P.ice, [[sx - 4, sy - 2], [sx - 14, sy - 7], [sx - 3, sy + 2]]);
      r.poly(P.frost, [[sx - 2, sy - 3], [sx - 10, sy - 11], [sx + 1, sy - 3]]);
      sode(r, P.ink, P.armor, P.light, sx, sy);
    }
    kunai(r, P, el, handF);
    hand(r, P, el, handF, false);
  }
}

interface Parts {
  armor: number;
  light: number;
  dark: number;
  deep: number;
  gi: number;
  giL: number;
  pants: number;
  pantsD: number;
  ink: number;
  inkL: number;
  vest: number;
  vestL: number;
  trim: number;
  sash: number;
  wrap: number;
  wrapL: number;
  wrapD: number;
  scarf: number;
  scarfD: number;
  hat: number;
  hatD: number;
  frost: number;
  ice: number;
  accent: number;
  glow: number;
  steel: number;
  steelD: number;
  edge: number;
  seam: number;
  skin: number;
  skinD: number;
}

/** `v` kept inside the box; the same object back when it already was (so callers can tell whether it moved). */
function clampV(v: V2, x0: number, x1: number, y0: number, y1: number): V2 {
  const x = Math.max(x0, Math.min(x1, v[0]));
  const y = Math.max(y0, Math.min(y1, v[1]));
  return x === v[0] && y === v[1] ? v : [x, y];
}

/**
 * A wrapped glove. The front one is a fist closed round the kunai's grip (knuckles toward the blade, a thumb over the top);
 * the back one an open hand, fingers together, trailing the forearm.
 */
function hand(r: Raster, P: Parts, el: V2, h: V2, back: boolean): void {
  let dx = h[0] - el[0];
  let dy = h[1] - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const nx = -dy;
  const ny = dx;
  if (back) {
    r.seg(P.ink, h[0], h[1], h[0] + dx * 6, h[1] + dy * 6, 6, 4);
    r.seg(P.deep, h[0] - 0.5, h[1] - 0.5, h[0] + dx * 5.5 - 0.5, h[1] + dy * 5.5 - 0.5, 4.4, 2.6);
    r.seg(P.deep, h[0] + nx * 2, h[1] + ny * 2, h[0] + nx * 3.5 + dx * 2.5, h[1] + ny * 3.5 + dy * 2.5, 2.2, 1.6); // thumb
    return;
  }
  r.ellipse(P.ink, h[0] + 0.5, h[1] + 0.5, 4.8, 4.8);
  r.ellipse(P.deep, h[0], h[1], 4, 4);
  // a lighter wrap across the knuckles, finger creases, the thumb on top
  r.seg(P.inkL, h[0] + dx * 2 - nx * 3, h[1] + dy * 2 - ny * 3, h[0] + dx * 2 + nx * 3, h[1] + dy * 2 + ny * 3, 1.6, 1.6);
  r.ellipse(P.deep, h[0] - nx * 3.4, h[1] - ny * 3.4, 2, 2);
}

/** A small lacquered shoulder guard (sode): a squared plate hanging off the shoulder, its top edge lit. */
function sode(r: Raster, rim: number, body: number, lit: number, sx: number, sy: number): void {
  r.poly(rim, [[sx - 7, sy - 5], [sx + 6, sy - 6], [sx + 8, sy + 5], [sx - 5, sy + 7]]);
  r.poly(body, [[sx - 6, sy - 4], [sx + 5, sy - 5], [sx + 7, sy + 4], [sx - 4, sy + 6]]);
  r.poly(lit, [[sx - 6, sy - 4], [sx + 5, sy - 5], [sx + 5.5, sy - 3], [sx - 5.5, sy - 2]]);
}

/** A short kunai with a ring pommel; the blade's edge is frozen and glows. */
function kunai(r: Raster, P: Parts, el: V2, hand: V2): void {
  let dx = hand[0] - el[0];
  let dy = hand[1] - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  if (dy > 0.75) {
    dx = 0.5;
    dy = 0.86;
  }
  const nx = -dy;
  const ny = dx;
  // the blade is shortened only when its tip would leave the frame
  let len = 20;
  const tip = (t: number): V2 => [hand[0] + dx * t, hand[1] + dy * t];
  while (len > 8) {
    const [x, y] = tip(len);
    if (x >= 6 && y >= 6 && x <= r.w - 7 && y <= r.h - 7) break;
    len -= 1;
  }
  const [tx, ty] = tip(len);
  r.ellipse(P.steelD, hand[0] - dx * 5, hand[1] - dy * 5, 2.4, 2.4); // ring pommel
  r.poly(P.steel, [[hand[0] + nx * 3.4, hand[1] + ny * 3.4], [tx, ty], [hand[0] - nx * 3.4, hand[1] - ny * 3.4]]);
  r.seg(P.ice, hand[0] + dx * 4 + nx, hand[1] + dy * 4 + ny, tx - dx, ty - dy, 1.6, 1);
  r.ellipse(P.glow, tx, ty, 1.5, 1.5);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean, fur = -1): void {
  // trousers: a lighter mid tone on the front leg, deep on the back one, each with a dark rim
  const pant = back ? P.deep : P.pants;
  r.seg(P.ink, hip[0], hip[1] + 0.5, kn[0], kn[1] + 0.5, 13.5, 11.5);
  r.seg(pant, hip[0] - 0.5, hip[1], kn[0] - 0.5, kn[1], 12, 10);
  r.seg(P.ink, kn[0], kn[1] + 0.5, ankle[0], ankle[1] - 4, 11.5, 8.5);
  r.seg(pant, kn[0] - 0.5, kn[1], ankle[0] - 0.5, ankle[1] - 4.5, 10, 7);
  if (!back) {
    // a crease down the thigh and shin wraps
    r.seg(P.pantsD, hip[0] + 2, hip[1] + 3, kn[0] + 2, kn[1] - 2, 1.4, 1.2);
  }
  {
    const wrapC = back ? P.wrapD : P.wrap;
    const a: V2 = [kn[0] + (ankle[0] - kn[0]) * 0.45, kn[1] + (ankle[1] - kn[1]) * 0.45];
    r.seg(P.ink, a[0], a[1], ankle[0], ankle[1] - 4, 9.5, 8.5);
    r.seg(wrapC, a[0] - 0.5, a[1] - 0.5, ankle[0] - 0.5, ankle[1] - 4.5, 8, 7);
    for (let i = 0; i < 3; i++) {
      const t = 0.15 + i * 0.3;
      const x = a[0] + (ankle[0] - a[0]) * t;
      const y = a[1] + (ankle[1] - 4 - a[1]) * t;
      r.rect(back ? P.ink : P.wrapL, x - 4, y, 8, 1);
    }
  }
  // knee: a small dark kneecap pad
  if (!back) {
    r.ellipse(P.ink, kn[0] + 2, kn[1], 5, 4.5);
    r.ellipse(P.gi, kn[0] + 1.5, kn[1] - 0.5, 4, 3.5);
  }
  // split-toe tabi boot: a near-black sock boot, the split marked, a lighter sole edge
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(P.ink, [[bx - 6, by - 6], [bx + 6, by - 6], [bx + 7, by - 1], [bx + 14, by + 2], [bx + 15, by + 8], [bx - 7, by + 8]]);
  r.poly(back ? P.ink : P.gi, [[bx - 5, by - 5], [bx + 5, by - 5], [bx + 6, by], [bx + 13, by + 3], [bx + 13, by + 6], [bx - 5, by + 6]]);
  r.rect(P.ink, bx + 9, by + 2, 1, 6);
  r.rect(back ? P.seam : P.inkL, bx - 6, by + 7, 21, 1);
  // Yeti: a thick fur cuff over the boot
  if (fur >= 0) r.ellipse(fur, bx, by - 6, 9, 5);
}
