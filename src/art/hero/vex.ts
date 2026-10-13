import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * Vex: a lean teal shadow-blade. Peaked cowl with two burning eyes, trailing scarf and ragged cape, high-collared jacket with a
 * strap harness, single armoured pauldron, wrapped legs and a pair of curved glowing daggers.
 */
export function drawVex(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.5);
  const accent = col(look.accent);
  const glow = mix(accent, [255, 245, 250], 0.6);
  const skin = col(look.skin);
  const steel: RGB = [200, 210, 230];
  const steelD: RGB = [112, 124, 152];
  const P = {
    armor: r.part(armor),
    light: r.part(mix(armor, [200, 245, 255], 0.22)),
    dark: r.part(dark),
    deep: r.part(deep),
    skin: r.part(skin, { soft: true }),
    cloth: r.part(mix(armor, dark, 0.45), { soft: true }),
    clothL: r.part(mix(armor, [200, 245, 255], 0.2), { soft: true }),
    cape: r.part(mix(dark, [10, 10, 30], 0.25), { soft: true }),
    scarf: r.part(accent, { soft: true }),
    scarfD: r.part(mul(accent, 0.68), { soft: true }),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    steel: r.part(steel),
    steelD: r.part(steelD),
    edge: r.part([255, 255, 255], { flat: true }),
    strap: r.part(mul(dark, 0.4), { soft: true }),
    mark: r.part(accent, { flat: true }),
    rivet: r.part(steel, { flat: true }),
    seam: r.part(mul(deep, 0.8), { flat: true }),
  };
  const T = k.torso;
  const run = k.pose.lean > 2;
  const air = k.pose.frontHand[1] < -8;
  const sw = (i: number, a = 2): number => Math.sin(k.phase * 1.25 + i * 0.7) * a;
  // outfits: 1 = Oni (wild hair, a horned demon mask with fangs), 2 = Cyber (visor helmet, neon circuit lines, no cape)
  const o = look.outfit ?? 0;
  const bone = r.part([236, 228, 210]);
  const boneD = r.part([176, 164, 140]);
  const oniMask = r.part(mix(accent, [200, 30, 40], 0.55));
  const hair = r.part(mix(armor, [240, 240, 250], 0.6), { soft: true });
  const hairD = r.part(mix(armor, [200, 200, 220], 0.35), { soft: true });

  // ---- ragged cape (behind everything) ----
  if (o !== 2) {
    const top = T.y + 3;
    const x0 = T.x + 6;
    const len = run ? 56 : air ? 64 : 50;
    const drift = run ? 30 : air ? 6 : 12; // how far the hem is blown back
    const hemY = k.hipY + 14;
    const pts: V2[] = [[x0 + 4, top], [x0 + 14, top + 2]];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push([x0 + 10 - drift * t + sw(i) * t - 6 * t, top + (hemY - top) * t * (len / 56)]);
    }
    for (let i = 5; i >= 0; i--) {
      const t = i / 5;
      pts.push([x0 - 4 - drift * t * 1.5 + sw(i + 3) * t, top + (hemY - top) * t * (len / 56) + (i % 2 === 0 ? 5 : 0)]);
    }
    r.poly(P.cape, pts);
    // jagged hem teeth and an accent edge line
    const last = pts[pts.length - 1];
    for (let i = 0; i < 4; i++) r.poly(P.cape, [[last[0] + i * 7, last[1]], [last[0] + i * 7 + 7, last[1]], [last[0] + i * 7 + 3, last[1] + 8]]);
    r.inlay(P.cape, P.mark, (set) => {
      for (let i = 0; i < 18; i++) set(x0 - drift * 0.9 - i * 1.6 + 6, top + 2 + i * 2.4);
    });
  }

  // ---- scarf, streaming from the collar ----
  {
    const nx = T.x + 8;
    const ny = T.y + 2;
    const flow = run ? 0.05 : air ? -0.8 : 0.4;
    let px = nx;
    let py = ny;
    for (let i = 0; i < 13; i++) {
      const x = nx - 4 - i * 4.4;
      const y = ny + i * flow * 3 + sw(i, 1.8 + i * 0.22);
      const w = o === 2 ? 3.4 - i * 0.15 : 9 - i * 0.5;
      r.seg(o === 2 ? (i % 2 ? P.glow : P.accent) : i % 4 === 3 ? P.scarfD : P.scarf, px, py, x, y, w, Math.max(o === 2 ? 1.4 : 2.5, w - 0.6));
      px = x;
      py = y;
    }
    if (o !== 2) {
      r.seg(P.scarfD, px, py, px - 8, py + 4, 3.5, 2);
      r.seg(P.scarf, px, py, px - 7, py - 3, 3.5, 2);
    }
  }

  // ---- back arm + dagger ----
  {
    const el = k.elbowB;
    r.seg(P.cloth, k.shB[0], k.shB[1], el[0], el[1], 9, 8);
    r.seg(P.cloth, el[0], el[1], k.handB[0], k.handB[1], 8, 7);
    bracer(r, P, el, k.handB, true);
    dagger(r, P, el, k.handB, 32);
    r.ellipse(P.strap, k.handB[0], k.handB[1], 4, 4);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- split tabard behind the hips ----
  r.poly(P.cloth, [[T.x + 2, T.y + T.h - 8], [T.x + 14, T.y + T.h - 8], [T.x + 9 + sw(1), T.y + T.h + 22], [T.x - 3 + sw(2), T.y + T.h + 26]]);

  // ---- torso ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    r.poly(P.cloth, [[x0 + 2, top + 2], [x0 + w - 2, top + 2], [x0 + w + 2, top + 9], [x0 + w - 6, top + h], [x0 + 6, top + h], [x0 - 2, top + 9]]);
    r.poly(P.deep, [[x0 - 2, top + 9], [x0 + 2, top + 2], [x0 + 9, top + 3], [x0 + 11, top + h - 2], [x0 + 6, top + h]]);
    // lighter chest panel with a centre seam
    r.poly(P.clothL, [[x0 + 11, top + 4], [x0 + w - 6, top + 4], [x0 + w - 5, top + 14], [x0 + w - 10, top + 24], [x0 + 13, top + 24]]);
    r.rect(P.seam, x0 + w / 2 + 2, top + 5, 1, 18);
    // harness: two crossing straps with a buckle and throwing knives
    r.seg(P.strap, x0 + 3, top + 3, x0 + w - 3, top + h - 5, 6, 6);
    r.seg(P.strap, x0 + w - 4, top + 3, x0 + 6, top + h - 5, 5, 5);
    r.rect(P.steel, x0 + w / 2 - 2, top + h / 2 - 2, 5, 5);
    r.rect(P.accent, x0 + w / 2 - 0.5, top + h / 2 - 0.5, 2, 2);
    for (let i = 0; i < 3; i++) r.rect(P.steel, x0 + 8 + i * 5, top + 14 - i, 2, 6);
    // belt with a glowing gem and side pouches
    r.rect(P.deep, x0 + 2, top + h - 6, w - 4, 7);
    r.rect(P.steelD, x0 + w / 2 - 5, top + h - 6, 10, 7);
    r.ellipse(P.accent, x0 + w / 2, top + h - 3, 2.6, 2.6);
    r.rect(P.strap, x0 + 4, top + h, 8, 9);
    r.rect(P.strap, x0 + w - 12, top + h, 8, 9);
    r.rect(P.mark, x0 + 4, top + h + 6, 8, 1);
    // tall collar
    r.poly(P.dark, [[x0 + 8, top - 2], [x0 + w - 4, top - 2], [x0 + w - 2, top + 8], [x0 + 6, top + 8]]);
    r.rect(P.mark, x0 + 9, top + 5, w - 14, 1);
    if (o === 2) {
      // neon circuit traces over the jacket
      r.seg(P.glow, x0 + 12, top + 9, x0 + 12, top + 18, 1, 1);
      r.seg(P.glow, x0 + 12, top + 18, x0 + w - 6, top + 18, 1, 1);
      r.seg(P.accent, x0 + w - 6, top + 8, x0 + w - 6, top + 18, 1, 1);
      r.rect(P.glow, x0 + 11, top + 8, 3, 3);
    }
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  if (o === 1) {
    // ---- head: a wild mane of hair and a red oni mask with horns and fangs ----
    const hx = k.head.x;
    const hy = k.head.y + 2;
    const hs = k.head.s;
    r.rect(P.deep, hx + 6, T.y - 5, hs - 10, 8); // neck
    // spiky hair swept back
    for (let i = 0; i < 7; i++) {
      // fanning from straight back (angle PI) round to straight up
      const a = Math.PI - 0.15 + i * 0.22;
      const len = 20 + ((i * 5) % 7) - (i > 4 ? 5 : 0);
      const bx = hx + hs / 2 - 2;
      const by = hy + hs / 2 - 1;
      r.poly(i % 2 ? hairD : hair, [[bx - 4, by - 5], [bx + 4, by + 4], [bx + Math.cos(a) * len + sw(i, 1.4), by + Math.sin(a) * len * 0.85]]);
    }
    r.ellipse(hair, hx + hs / 2, hy + hs / 2 - 2, hs / 2 + 1, hs / 2);
    // the mask: a broad red face with a heavy brow, horns, glowing eyes and a fanged grin
    r.poly(oniMask, [[hx + 9, hy + 2], [hx + hs + 2, hy + 1], [hx + hs + 6, hy + 9], [hx + hs + 5, hy + hs - 1], [hx + hs, hy + hs + 3], [hx + 11, hy + hs + 2], [hx + 8, hy + hs / 2]]);
    r.poly(P.deep, [[hx + 11, hy + 6], [hx + hs + 6, hy + 6], [hx + hs + 6, hy + 8], [hx + 12, hy + 9]]); // brow shadow
    r.ellipse(oniMask, hx + hs + 5, hy + hs / 2 + 2, 2.4, 3); // a hooked nose
    r.rect(P.glow, hx + hs - 5, hy + 9, 6, 3);
    r.rect(P.accent, hx + hs - 11, hy + 10, 4, 2);
    r.rect(P.deep, hx + 10, hy + hs - 6, hs - 4, 4);
    for (let i = 0; i < 4; i++) r.poly(bone, [[hx + 11 + i * 4, hy + hs - 6], [hx + 14 + i * 4, hy + hs - 6], [hx + 12.5 + i * 4, hy + hs - 3 + (i % 3 === 0 ? 2 : 0)]]);
    r.poly(bone, [[hx + 8, hy + 2], [hx + 3, hy - 12], [hx + 13, hy + 1]]);
    r.poly(boneD, [[hx + hs - 2, hy + 1], [hx + hs + 3, hy - 13], [hx + hs + 5, hy + 2]]);
  } else if (o === 2) {
    // ---- head: a sleek helmet with a full-width glowing visor and a fin ----
    const hx = k.head.x;
    const hy = k.head.y + 2;
    const hs = k.head.s;
    r.rect(P.deep, hx + 6, T.y - 5, hs - 10, 8); // neck
    r.poly(P.dark, [[hx - 4, hy + 4], [hx + 6, hy - 4], [hx - 10, hy - 2]]); // rear fin
    r.ellipse(P.armor, hx + hs / 2 + 2, hy + hs / 2 + 1, hs / 2 + 4, hs / 2 + 3);
    r.ellipse(P.light, hx + hs / 2, hy + hs / 2 - 4, hs / 2, hs / 3);
    r.poly(P.deep, [[hx + 6, hy + 8], [hx + hs + 6, hy + 7], [hx + hs + 6, hy + 15], [hx + 8, hy + 15]]);
    r.poly(P.accent, [[hx + 8, hy + 9], [hx + hs + 5, hy + 8], [hx + hs + 5, hy + 13], [hx + 9, hy + 13]]);
    r.rect(P.glow, hx + hs - 4 - ((k.phase * 3) % 10), hy + 9, 4, 3);
    r.rect(P.seam, hx + 10, hy + hs - 2, hs - 4, 1);
    r.rect(P.glow, hx + 2, hy + hs / 2 + 4, 3, 1);
  } else {
  // ---- head: peaked cowl, shadowed face, burning eyes, mask ----
  {
    const hx = k.head.x;
    const hy = k.head.y + 2;
    const hs = k.head.s;
    r.rect(P.deep, hx + 6, T.y - 5, hs - 10, 8); // neck
    const tip = sw(2, 3);
    // cowl: smooth shell with a tail that trails behind
    r.poly(P.cloth, [[hx + hs + 4, hy + 6], [hx + hs + 1, hy - 2], [hx + hs / 2 + 2, hy - 9], [hx - 4, hy - 4], [hx - 18 - tip, hy + 8 + tip * 0.5], [hx - 4, hy + hs - 6], [hx + 4, hy + hs + 4], [hx + hs - 2, hy + hs + 2], [hx + hs + 4, hy + hs - 8]]);
    r.poly(P.clothL, [[hx + hs / 2 + 2, hy - 9], [hx + hs + 1, hy - 2], [hx + hs - 4, hy + 2], [hx + hs / 2 - 2, hy - 5]]);
    r.rect(P.seam, hx - 2, hy + 6, 14, 1);
    // face void
    r.ellipse(P.deep, hx + hs / 2 + 6, hy + hs / 2 + 1, hs / 2 - 1, hs / 2 - 3);
    // eyes: near eye burns bright, far eye dimmer
    r.rect(P.glow, hx + hs - 7, hy + 10, 7, 3);
    r.rect(P.accent, hx + hs - 12, hy + 10, 4, 2);
    r.rect(P.accent, hx + hs - 16, hy + 11, 6, 1);
    // mask over the lower face
    r.poly(P.cloth, [[hx + 8, hy + 15], [hx + hs + 3, hy + 15], [hx + hs, hy + hs - 3], [hx + 10, hy + hs]]);
    r.rect(P.mark, hx + 10, hy + 15, hs - 4, 1);
    r.rect(P.seam, hx + 12, hy + 21, hs - 9, 1);
  }
  }

  // ---- front arm: pauldron, sleeve, dagger ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    r.seg(P.cloth, sx, sy, el[0], el[1], 10, 8);
    r.seg(P.cloth, el[0], el[1], k.handF[0], k.handF[1], 8, 7);
    bracer(r, P, el, k.handF, false);
    // armoured shoulder
    r.ellipse(P.armor, sx, sy - 3, 9, 7);
    r.poly(P.light, [[sx - 7, sy - 8], [sx + 6, sy - 9], [sx + 8, sy - 4], [sx - 6, sy - 3]]);
    r.rect(P.mark, sx - 8, sy + 1, 17, 1);
    r.rect(P.rivet, sx - 2, sy - 6, 2, 2);
    dagger(r, P, el, k.handF, 34);
    r.ellipse(P.strap, k.handF[0], k.handF[1], 4, 4);
  }
}

type Parts = Record<'armor' | 'light' | 'dark' | 'deep' | 'skin' | 'cloth' | 'clothL' | 'cape' | 'scarf' | 'scarfD' | 'accent' | 'glow' | 'steel' | 'steelD' | 'edge' | 'strap' | 'mark' | 'rivet' | 'seam', number>;

function bracer(r: Raster, P: Parts, el: V2, hand: V2, back: boolean): void {
  const mx = el[0] + (hand[0] - el[0]) * 0.62;
  const my = el[1] + (hand[1] - el[1]) * 0.62;
  r.seg(back ? P.dark : P.armor, el[0] + (hand[0] - el[0]) * 0.3, el[1] + (hand[1] - el[1]) * 0.3, mx, my, 10, 9);
  r.ellipse(P.accent, mx, my, 2.4, 2.4);
}

/** Curved dagger from the hand along the forearm, glowing edge and tip. */
function dagger(r: Raster, P: Parts, el: V2, hand: V2, len: number): void {
  let dx = hand[0] - el[0];
  let dy = hand[1] - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  if (dy > 0.75) {
    dx = 0.45;
    dy = 0.89; // a hanging arm tilts the blade forward instead of straight down
  }
  const nx = -dy;
  const ny = dx;
  const tx = hand[0] + dx * len + nx * 3;
  const ty = hand[1] + dy * len + ny * 3;
  const mx = hand[0] + dx * len * 0.55 + nx * 4.5;
  const my = hand[1] + dy * len * 0.55 + ny * 4.5;
  r.rect(P.steelD, hand[0] - 3, hand[1] - 3, 6, 6); // guard
  r.poly(P.steel, [[hand[0] + nx * 4, hand[1] + ny * 4], [mx + nx * 2, my + ny * 2], [tx, ty], [mx - nx * 2.5, my - ny * 2.5], [hand[0] - nx * 3, hand[1] - ny * 3]]);
  r.seg(P.edge, hand[0] + nx, hand[1] + ny, tx - dx * 2, ty - dy * 2, 1.4, 1);
  r.seg(P.accent, mx + nx * 2.5, my + ny * 2.5, tx, ty, 1.6, 1.2);
  r.ellipse(P.glow, tx, ty, 1.6, 1.6);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  const pant = back ? P.deep : P.cloth;
  r.seg(pant, hip[0], hip[1], kn[0], kn[1], 14, 11);
  r.seg(pant, kn[0], kn[1], ankle[0], ankle[1], 11, 8);
  if (!back) {
    r.ellipse(P.armor, kn[0] + 3, kn[1], 5, 5); // knee guard
    r.rect(P.mark, kn[0] + 1, kn[1] - 1, 6, 1);
    for (let i = 0; i < 3; i++) {
      const t = 0.3 + i * 0.22;
      r.rect(P.mark, kn[0] + (ankle[0] - kn[0]) * t - 5, kn[1] + (ankle[1] - kn[1]) * t, 10, 1); // shin wraps
    }
  }
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(back ? P.deep : P.strap, [[bx - 7, by - 8], [bx + 7, by - 8], [bx + 7, by - 2], [bx + 16, by + 4], [bx + 16, by + 8], [bx - 8, by + 8]]);
  r.rect(back ? P.deep : P.dark, bx - 8, by - 10, 15, 5);
  r.rect(P.steelD, bx + 10, by + 3, 7, 5); // metal toe cap
  r.rect(P.deep, bx - 8, by + 7, 25, 2);
}
