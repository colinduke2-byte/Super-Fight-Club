import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * Rime: a slim frost ninja. A wide conical kasa hat lacquered in ice-blue with a frosted crown and icicles hanging off the
 * brim, a dark mask with two glowing eyes under it, a long scarf streaming behind, a short haori vest over a fitted gi with
 * a sash, bandaged forearms, an icicle cluster on the front shoulder, split-toe tabi boots, and a kunai with a frozen edge.
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
  const P = {
    armor: r.part(armor),
    light: r.part(mix(armor, [230, 248, 255], 0.3)),
    dark: r.part(dark, { soft: true }),
    deep: r.part(deep, { soft: true }),
    gi: r.part(mix(dark, deep, 0.4), { soft: true }),
    vest: r.part(armor, { soft: true }),
    vestL: r.part(mix(armor, [230, 248, 255], 0.25), { soft: true }),
    trim: r.part([236, 244, 252], { flat: true }),
    sash: r.part(mix(accent, armor, 0.35), { soft: true }),
    wrap: r.part(wrap, { soft: true }),
    wrapL: r.part(mul(wrap, 0.82), { flat: true }),
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
  };
  const T = k.torso;
  const run = k.pose.lean > 2;
  const air = k.pose.frontHand[1] < -8;
  const sw = (i: number, a = 2): number => Math.sin(k.phase * 1.3 + i * 0.8) * a;

  // ---- long scarf streaming from the neck (behind everything) ----
  {
    const nx = T.x + 9;
    const ny = T.y + 1;
    const flow = run ? 0 : air ? -0.9 : 0.5;
    let px = nx;
    let py = ny;
    for (let i = 0; i < 15; i++) {
      const x = nx - 3 - i * 4.6;
      const y = ny + i * flow * 3 + sw(i, 1.6 + i * 0.25);
      const w = 8 - i * 0.35;
      r.seg(i % 4 === 3 ? P.scarfD : P.scarf, px, py, x, y, w, Math.max(3, w - 0.5));
      px = x;
      py = y;
    }
    // a frosted, fringed tail
    r.seg(P.frost, px, py, px - 6, py + 3, 4, 2);
    r.seg(P.frost, px, py, px - 5, py - 3, 4, 2);
  }

  // ---- back arm + back kunai ----
  {
    const el = k.elbowB;
    r.seg(P.gi, k.shB[0], k.shB[1], el[0], el[1], 8, 7);
    r.seg(P.deep, el[0], el[1], k.handB[0], k.handB[1], 7, 6);
    r.ellipse(P.deep, k.handB[0], k.handB[1], 3.6, 3.6);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- vest tails behind the hips ----
  r.poly(P.vest, [[T.x + 1, T.y + T.h - 6], [T.x + 12, T.y + T.h - 6], [T.x + 6 + sw(1), T.y + T.h + 16], [T.x - 5 + sw(2), T.y + T.h + 18]]);
  r.rect(P.trim, T.x - 4 + sw(2), T.y + T.h + 16, 9, 1);

  // ---- torso: fitted gi under a short sleeveless haori vest, sash ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    r.poly(P.gi, [[x0 + 3, top + 1], [x0 + w - 2, top + 1], [x0 + w, top + 8], [x0 + w - 4, top + h], [x0 + 5, top + h], [x0, top + 8]]);
    // the vest: two front panels that part over the chest, white trim down the edges
    r.poly(P.vest, [[x0 - 1, top + 2], [x0 + w / 2 - 1, top + 3], [x0 + w / 2 + 1, top + h - 4], [x0 + 3, top + h - 2]]);
    r.poly(P.vestL, [[x0 + w / 2 + 3, top + 3], [x0 + w + 1, top + 2], [x0 + w - 1, top + h - 2], [x0 + w / 2 + 4, top + h - 4]]);
    r.seg(P.trim, x0 + w / 2 - 1, top + 3, x0 + w / 2 + 1, top + h - 4, 1.6, 1.6);
    r.seg(P.trim, x0 + w / 2 + 3, top + 3, x0 + w / 2 + 4, top + h - 4, 1.6, 1.6);
    // snowflake crest on the vest
    const cx = x0 + w - 7;
    const cy = top + 9;
    r.inlay(P.vestL, P.trim, (set) => {
      for (let i = -3; i <= 3; i++) {
        set(cx + i, cy);
        set(cx, cy + i);
        set(cx + i * 0.7, cy + i * 0.7);
        set(cx + i * 0.7, cy - i * 0.7);
      }
    });
    // sash with a knot and hanging ends
    r.rect(P.sash, x0 + 1, top + h - 6, w - 2, 6);
    r.rect(P.trim, x0 + 1, top + h - 6, w - 2, 1);
    r.ellipse(P.sash, x0 + 4, top + h - 3, 3.5, 3.5);
    r.seg(P.sash, x0 + 3, top + h - 1, x0 - 1 + sw(3), top + h + 9, 3, 2);
    // high collar
    r.poly(P.deep, [[x0 + 6, top - 3], [x0 + w - 4, top - 3], [x0 + w - 2, top + 5], [x0 + 5, top + 5]]);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- head: mask, glowing eyes, white hair, the kasa ----
  {
    const hx = k.head.x;
    const hy = k.head.y + 3;
    const hs = k.head.s;
    r.rect(P.deep, hx + 6, T.y - 5, hs - 10, 8); // neck
    // face and mask
    r.ellipse(P.deep, hx + hs / 2 + 3, hy + hs / 2 + 2, hs / 2, hs / 2 - 1);
    r.poly(P.dark, [[hx + 5, hy + hs / 2], [hx + hs + 4, hy + hs / 2], [hx + hs + 1, hy + hs], [hx + 8, hy + hs + 2]]);
    r.rect(P.seam, hx + 8, hy + hs / 2 + 5, hs - 4, 1);
    // white hair spilling out at the back
    r.poly(P.frost, [[hx - 2, hy + 2], [hx + 6, hy + 4], [hx + 2, hy + 12], [hx - 8 - sw(4, 1.5), hy + 9]]);
    // eyes: a narrow glowing slit in the shadow of the brim
    r.rect(P.glow, hx + hs - 8, hy + hs / 2 - 2, 8, 3);
    r.rect(P.accent, hx + hs - 15, hy + hs / 2 - 1, 6, 2);
    // the kasa: a wide shallow cone with a frosted crown, a dark under-brim and icicles
    const bx0 = hx - 18;
    const bx1 = hx + hs + 19;
    const by = hy + 1;
    const peakX = (bx0 + bx1) / 2 + 2;
    const peakY = hy - 12;
    r.poly(P.hatD, [[bx0, by + 1], [bx1, by + 1], [bx1 - 4, by + 4], [bx0 + 4, by + 4]]); // under-brim shadow
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

  // ---- front arm: icicle pauldron, bandaged forearm, kunai ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    r.seg(P.gi, sx, sy, el[0], el[1], 8, 7);
    r.seg(P.wrap, el[0], el[1], k.handF[0], k.handF[1], 7, 6);
    for (let i = 0; i < 3; i++) {
      const t = 0.25 + i * 0.25;
      r.rect(P.wrapL, el[0] + (k.handF[0] - el[0]) * t - 3, el[1] + (k.handF[1] - el[1]) * t, 6, 1);
    }
    // icicle cluster on the shoulder, swept back and out
    r.ellipse(P.armor, sx, sy, 7, 5);
    r.poly(P.ice, [[sx - 4, sy - 2], [sx - 14, sy - 7], [sx - 3, sy + 2]]);
    r.poly(P.frost, [[sx - 2, sy - 3], [sx - 10, sy - 11], [sx + 1, sy - 3]]);
    kunai(r, P, el, k.handF);
    r.ellipse(P.deep, k.handF[0], k.handF[1], 3.8, 3.8);
  }
}

type Parts = Record<'armor' | 'light' | 'dark' | 'deep' | 'gi' | 'vest' | 'vestL' | 'trim' | 'sash' | 'wrap' | 'wrapL' | 'scarf' | 'scarfD' | 'hat' | 'hatD' | 'frost' | 'ice' | 'accent' | 'glow' | 'steel' | 'steelD' | 'edge' | 'seam', number>;

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
  const len = 20;
  const tx = hand[0] + dx * len;
  const ty = hand[1] + dy * len;
  r.ellipse(P.steelD, hand[0] - dx * 5, hand[1] - dy * 5, 2.4, 2.4); // ring pommel
  r.poly(P.steel, [[hand[0] + nx * 3.4, hand[1] + ny * 3.4], [tx, ty], [hand[0] - nx * 3.4, hand[1] - ny * 3.4]]);
  r.seg(P.ice, hand[0] + dx * 4 + nx, hand[1] + dy * 4 + ny, tx - dx, ty - dy, 1.6, 1);
  r.ellipse(P.glow, tx, ty, 1.5, 1.5);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  const pant = back ? P.deep : P.gi;
  r.seg(pant, hip[0], hip[1], kn[0], kn[1], 12, 10);
  r.seg(pant, kn[0], kn[1], ankle[0], ankle[1], 10, 7);
  if (!back) {
    // shin wraps
    for (let i = 0; i < 4; i++) {
      const t = 0.15 + i * 0.2;
      r.rect(P.wrapL, kn[0] + (ankle[0] - kn[0]) * t - 4, kn[1] + (ankle[1] - kn[1]) * t, 8, 1);
    }
  }
  // split-toe tabi boot
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(back ? P.deep : P.dark, [[bx - 6, by - 7], [bx + 6, by - 7], [bx + 7, by - 1], [bx + 14, by + 3], [bx + 14, by + 8], [bx - 7, by + 8]]);
  r.rect(P.seam, bx + 9, by + 2, 1, 6);
  r.rect(back ? P.deep : P.wrap, bx - 7, by - 9, 13, 3);
}
