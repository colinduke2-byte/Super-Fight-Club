import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/** Vex: a lean teal assassin. Hood and mask with a glowing eye slit, trailing scarf, bandolier, wrapped legs and twin blades. */
export function drawVex(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.55);
  const accent = col(look.accent);
  const glow = mix(accent, [255, 245, 250], 0.6);
  const skin = col(look.skin);
  const steel: RGB = [196, 206, 226];
  const steelD: RGB = [112, 124, 152];
  const P = {
    armor: r.part(armor),
    light: r.part(mix(armor, [200, 240, 255], 0.2)),
    dark: r.part(dark),
    deep: r.part(deep),
    skin: r.part(skin, { soft: true }),
    cloth: r.part(mix(dark, [20, 20, 40], 0.3), { soft: true }),
    scarf: r.part(accent, { soft: true }),
    scarfD: r.part(mul(accent, 0.7), { soft: true }),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    steel: r.part(steel),
    steelD: r.part(steelD),
    edge: r.part([255, 255, 255], { flat: true }),
    strap: r.part(mul(dark, 0.45), { soft: true }),
    mark: r.part(accent, { flat: true }),
    rivet: r.part(steel, { flat: true }),
  };
  const T = k.torso;
  const run = k.pose.lean > 2;

  // ---- scarf, streaming behind the neck ----
  {
    const nx = T.x + 6;
    const ny = T.y + 2;
    const flow = run ? 0 : k.pose.frontHand[1] < -8 ? -0.7 : 0.35;
    let px = nx;
    let py = ny;
    for (let i = 0; i < 14; i++) {
      const wave = Math.sin(k.phase * 1.2 + i * 0.6) * (1.5 + i * 0.25);
      const x = nx - 4 - i * 4.2;
      const y = ny + i * flow * 3 + wave;
      const w = 11 - i * 0.55;
      r.seg(i % 4 === 3 ? P.scarfD : P.scarf, px, py, x, y, w, Math.max(3, w - 0.6));
      px = x;
      py = y;
    }
    // forked tail
    r.seg(P.scarfD, px, py, px - 9, py + 4, 4, 2);
    r.seg(P.scarf, px, py, px - 8, py - 3, 4, 2);
  }

  // ---- back arm + blade ----
  {
    const el = k.elbowB;
    r.seg(P.deep, k.shB[0], k.shB[1], el[0], el[1], 9, 8);
    r.seg(P.dark, el[0], el[1], k.handB[0], k.handB[1], 8, 7);
    bracer(r, P, el, k.handB, true);
    blade(r, P, el, k.handB, 30);
    r.ellipse(P.cloth, k.handB[0], k.handB[1], 4, 4);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- coat tails (a thin split flap behind the hips) ----
  {
    const sw = Math.sin(k.phase * 1.1) * 2;
    r.poly(P.deep, [[T.x + 2, T.y + T.h - 8], [T.x + 12, T.y + T.h - 8], [T.x + 6 + sw, T.y + T.h + 18], [T.x - 6 + sw, T.y + T.h + 22]]);
  }

  // ---- torso ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    r.poly(P.armor, [[x0 + 2, top + 2], [x0 + w - 2, top + 2], [x0 + w + 2, top + 8], [x0 + w - 6, top + h], [x0 + 6, top + h], [x0 - 2, top + 8]]);
    r.poly(P.dark, [[x0 - 2, top + 8], [x0 + 2, top + 2], [x0 + 8, top + 3], [x0 + 10, top + h - 2], [x0 + 6, top + h]]);
    // chest plate and clasps
    r.poly(P.light, [[x0 + 10, top + 4], [x0 + w - 6, top + 4], [x0 + w - 4, top + 12], [x0 + w - 10, top + 22], [x0 + 12, top + 22]]);
    r.rect(P.mark, x0 + w / 2 - 1, top + 6, 2, 12);
    // bandolier
    r.seg(P.strap, x0 + 4, top + 2, x0 + w - 4, top + h - 4, 7, 7);
    r.rect(P.rivet, x0 + w / 2 - 2, top + h / 2 - 2, 4, 4);
    for (let i = 0; i < 3; i++) r.rect(P.steel, x0 + 8 + i * 6, top + 6 + i * 5, 2, 5); // throwing knives
    // belt, gem and pouches
    r.rect(P.deep, x0 + 2, top + h - 6, w - 4, 7);
    r.rect(P.steelD, x0 + w / 2 - 5, top + h - 6, 10, 7);
    r.rect(P.accent, x0 + w / 2 - 2, top + h - 4, 4, 3);
    r.rect(P.strap, x0 + 4, top + h, 9, 9);
    r.rect(P.strap, x0 + w - 13, top + h, 9, 9);
    r.rect(P.mark, x0 + 4, top + h + 6, 9, 1);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- head: hood, mask, eye ----
  {
    const hx = k.head.x;
    const hy = k.head.y;
    const hs = k.head.s;
    r.rect(P.deep, hx + 6, T.y - 3, hs - 10, 8); // neck
    const sw = Math.sin(k.phase * 1.3) * 2;
    // hood tail trailing back
    r.poly(P.dark, [[hx - 2, hy + 6], [hx - 12 - sw, hy + 12], [hx - 4, hy + hs - 4], [hx + 2, hy + hs - 8]]);
    // hood shell
    r.poly(P.dark, [[hx - 4, hy + 8], [hx + 2, hy + 1], [hx + hs - 4, hy - 4], [hx + hs + 2, hy + 4], [hx + hs + 4, hy + hs - 4], [hx + 6, hy + hs + 3], [hx - 4, hy + hs - 2]]);
    r.poly(P.armor, [[hx + 2, hy + 3], [hx + hs - 4, hy - 2], [hx + hs - 2, hy + 4], [hx + 8, hy + 8]]);
    // face opening: mask over the lower face, skin strip around the eye
    r.poly(P.deep, [[hx + 10, hy + 6], [hx + hs + 2, hy + 6], [hx + hs + 2, hy + hs - 3], [hx + 8, hy + hs - 1]]);
    r.rect(P.skin, hx + 12, hy + 8, hs - 8, 8);
    r.rect(P.deep, hx + 12, hy + 8, hs - 8, 2); // brow
    r.rect(P.glow, hx + hs - 10, hy + 11, 9, 3);
    r.rect(P.accent, hx + hs - 16, hy + 12, 6, 1);
    r.rect(P.mark, hx + 12, hy + hs - 10, hs - 8, 1); // mask seam
  }

  // ---- front arm + blade ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    r.seg(P.armor, sx, sy, el[0], el[1], 10, 8);
    r.seg(P.armor, el[0], el[1], k.handF[0], k.handF[1], 8, 7);
    bracer(r, P, el, k.handF, false);
    r.ellipse(P.light, sx, sy - 2, 7, 5); // shoulder guard
    r.rect(P.mark, sx - 7, sy + 2, 14, 1);
    blade(r, P, el, k.handF, 32);
    r.ellipse(P.cloth, k.handF[0], k.handF[1], 4, 4);
  }
}

type Parts = Record<'armor' | 'light' | 'dark' | 'deep' | 'skin' | 'cloth' | 'scarf' | 'scarfD' | 'accent' | 'glow' | 'steel' | 'steelD' | 'edge' | 'strap' | 'mark' | 'rivet', number>;

function bracer(r: Raster, P: Parts, el: V2, hand: V2, back: boolean): void {
  const mx = el[0] + (hand[0] - el[0]) * 0.6;
  const my = el[1] + (hand[1] - el[1]) * 0.6;
  r.seg(back ? P.dark : P.light, el[0] + (hand[0] - el[0]) * 0.25, el[1] + (hand[1] - el[1]) * 0.25, mx, my, 10, 10);
  r.ellipse(P.accent, mx, my, 3, 3);
}

/** Dagger from the hand, pointing along the forearm. */
function blade(r: Raster, P: Parts, el: V2, hand: V2, len: number): void {
  let dx = hand[0] - el[0];
  let dy = hand[1] - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  if (dy > 0.75) {
    dx = 0.45;
    dy = 0.89; // a hanging arm tilts the blade forward instead of straight down
  }
  const tx = hand[0] + dx * len;
  const ty = hand[1] + dy * len;
  const nx = -dy;
  const ny = dx;
  r.rect(P.steelD, hand[0] - 3, hand[1] - 3, 6, 6); // guard
  r.poly(P.steel, [[hand[0] + nx * 3.5, hand[1] + ny * 3.5], [tx, ty], [hand[0] - nx * 3.5, hand[1] - ny * 3.5]]);
  r.seg(P.edge, hand[0], hand[1], tx - dx * 2, ty - dy * 2, 1.4, 1);
  r.ellipse(P.glow, tx, ty, 1.6, 1.6);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  const pant = back ? P.deep : P.dark;
  r.seg(pant, hip[0], hip[1], kn[0], kn[1], 14, 11);
  r.seg(pant, kn[0], kn[1], ankle[0], ankle[1], 11, 8);
  if (!back) {
    r.ellipse(P.armor, kn[0] + 3, kn[1], 5, 5); // knee guard
    for (let i = 0; i < 3; i++) {
      const t = 0.3 + i * 0.22;
      r.rect(P.mark, kn[0] + (ankle[0] - kn[0]) * t - 5, kn[1] + (ankle[1] - kn[1]) * t, 10, 1); // shin wraps
    }
  }
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(back ? P.deep : P.strap, [[bx - 7, by - 6], [bx + 7, by - 6], [bx + 16, by + 4], [bx + 16, by + 8], [bx - 8, by + 8]]);
  r.rect(back ? P.deep : P.dark, bx - 8, by - 8, 15, 5);
  r.rect(P.deep, bx - 8, by + 7, 25, 2);
}
