import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * Riptide: a cyber-shark gladiator. A shark's head (blunt snout, glowing eye, a jaw full of teeth) under a steel brow band, a tall
 * dorsal fin, grey shark hide with a pale ribbed belly and gill slits, a leather harness with a bronze buckle, armoured kilt
 * strips, a shark tail, plated greaves and a big pauldron on the front shoulder. The front hand carries an anchor on a chain.
 */
export function drawRiptide(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.6);
  const accent = col(look.accent);
  const hide = col(look.skin);
  const belly: RGB = mix(hide, [244, 248, 252], 0.72);
  const leather: RGB = [104, 70, 48];
  const steel: RGB = [196, 210, 222];
  const P = {
    hide: r.part(hide, { soft: true }),
    hideD: r.part(mul(hide, 0.74), { soft: true }),
    hideDeep: r.part(mul(hide, 0.52), { soft: true }),
    belly: r.part(belly, { soft: true }),
    bellyLine: r.part(mul(belly, 0.8), { flat: true }),
    gill: r.part(mul(hide, 0.4), { flat: true }),
    armor: r.part(armor),
    light: r.part(mix(armor, [220, 245, 255], 0.35)),
    dark: r.part(dark),
    deep: r.part(deep),
    leather: r.part(leather, { soft: true }),
    leatherD: r.part(mul(leather, 0.7), { soft: true }),
    bronze: r.part(accent),
    accent: r.part(accent, { emissive: true }),
    eye: r.part(mix(accent, [255, 240, 200], 0.4), { emissive: true }),
    tooth: r.part([248, 248, 240], { flat: true }),
    mouth: r.part([40, 16, 24], { flat: true }),
    steel: r.part(steel),
    steelD: r.part(mul(steel, 0.66)),
    chain: r.part(mul(steel, 0.8), { flat: true }),
    rivet: r.part(mix(accent, [255, 255, 255], 0.3), { flat: true }),
  };
  const T = k.torso;
  const ph = k.phase;
  const run = k.pose.lean > 2;
  const sway = (i: number, a = 2): number => Math.sin(ph * 1.25 + i * 0.9) * a;

  // ---- shark tail (behind): sweeps back from the lower spine to a crescent caudal fin ----
  {
    let px = T.x + 4;
    let py = T.y + T.h - 2;
    for (let i = 0; i < 6; i++) {
      const x = px - 6;
      const y = py + (run ? 0.5 : 2) + sway(i, 1 + i * 0.35);
      r.seg(i < 3 ? P.hideD : P.hideDeep, px, py, x, y, 15 - i * 1.8, 13 - i * 1.8);
      px = x;
      py = y;
    }
    // crescent tail fin
    r.poly(P.hideDeep, [[px + 2, py - 2], [px - 14, py - 16 + sway(7, 2)], [px - 9, py], [px - 15, py + 13 + sway(8, 2)], [px + 2, py + 3]]);
  }

  // ---- anchor chain: hangs from the anchor ring behind the body to the belt ----
  const hand = k.handF;
  const elF = k.elbowF;
  let ux = hand[0] - elF[0];
  let uy = hand[1] - elF[1];
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  {
    const sx = T.x + T.w / 2 - 4;
    const sy = T.y + T.h - 8;
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = sx + (hand[0] - sx) * t;
      const y = sy + (hand[1] - sy) * t + Math.sin(t * Math.PI) * 10;
      r.ellipse(i % 2 ? P.chain : P.steelD, x, y, 2.6, 2);
    }
  }

  // ---- back arm: hide with a plated bracer ----
  {
    const el = k.elbowB;
    r.seg(P.hideD, k.shB[0], k.shB[1], el[0], el[1], 12, 11);
    r.seg(P.hideD, el[0], el[1], k.handB[0], k.handB[1], 11, 10);
    r.seg(P.dark, el[0] + (k.handB[0] - el[0]) * 0.35, el[1] + (k.handB[1] - el[1]) * 0.35, k.handB[0], k.handB[1], 12, 12);
    r.ellipse(P.hideDeep, k.handB[0], k.handB[1], 6, 6);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- armoured kilt strips (behind the torso's front, over the hips) ----
  for (let i = 0; i < 4; i++) {
    const bx = T.x + 4 + i * ((T.w - 6) / 3);
    const by = T.y + T.h - 5;
    const len = 15 + (i % 2) * 3;
    r.poly(i % 2 ? P.dark : P.armor, [[bx - 4, by], [bx + 5, by], [bx + 4 + sway(i, 1.2), by + len], [bx - 3 + sway(i, 1.2), by + len + 1]]);
    r.rect(P.rivet, bx, by + 3, 1, 1);
  }

  // ---- torso: shark hide, ribbed pale belly, gill slits, harness ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    r.poly(P.hide, [[x0 + 2, top + 2], [x0 + w - 1, top + 2], [x0 + w + 3, top + 11], [x0 + w - 5, top + h - 3], [x0 + 7, top + h - 3], [x0 - 2, top + 11]]);
    r.poly(P.hideD, [[x0 - 2, top + 11], [x0 + 2, top + 2], [x0 + 8, top + 3], [x0 + 11, top + h - 5], [x0 + 7, top + h - 3]]);
    // pale belly with ventral ridges, on the front half of the chest
    r.poly(P.belly, [[x0 + w / 2 - 2, top + 6], [x0 + w + 1, top + 10], [x0 + w - 5, top + h - 4], [x0 + w / 2 - 1, top + h - 4]]);
    for (let i = 0; i < 5; i++) r.rect(P.bellyLine, x0 + w / 2, top + 12 + i * 4, w / 2 - 4 - i * 0.6, 1);
    // gill slits on the flank
    for (let i = 0; i < 3; i++) r.seg(P.gill, x0 + 6 + i * 4, top + 8, x0 + 4 + i * 4, top + 18, 1.6, 1.2);
    // harness: diagonal strap, belt and buckle
    r.seg(P.leather, x0 + 2, top + 4, x0 + w - 4, top + h - 10, 6, 6);
    r.seg(P.leatherD, x0 + 2, top + 6, x0 + w - 4, top + h - 8, 2, 2);
    r.rect(P.leather, x0 + 2, top + h - 9, w - 4, 7);
    r.rect(P.leatherD, x0 + 2, top + h - 3, w - 4, 1);
    r.ellipse(P.bronze, x0 + w / 2 + 3, top + h - 6, 4.5, 4);
    r.ellipse(P.accent, x0 + w / 2 + 3, top + h - 6, 1.8, 1.6);
    r.ellipse(P.bronze, x0 + w / 2 + 1, top + h / 2 - 1, 3, 3); // strap ring
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- front pauldron (under the head so the snout overlaps it) ----
  {
    const [sx, sy] = k.shF;
    r.ellipse(P.dark, sx - 1, sy + 1, 9, 7);
    r.ellipse(P.armor, sx, sy, 7.5, 5.5);
    r.ellipse(P.light, sx - 2, sy - 2, 3.5, 2);
    r.rect(P.bronze, sx - 8, sy + 5, 16, 2);
  }

  // ---- head: blunt shark snout, glowing eye, toothy jaw, steel brow band, dorsal fin ----
  {
    const hx = k.head.x;
    const hy = k.head.y;
    const hs = k.head.s;
    r.rect(P.hideD, hx + 6, T.y - 6, hs - 10, 10); // thick neck
    // dorsal fin rising off the back of the head and neck
    const fin = Math.sin(ph * 0.9) * 1.2;
    r.poly(P.hideD, [[hx - 2, hy + hs * 0.55], [hx + 2, hy - hs * 0.5 + fin], [hx + 8, hy - hs * 0.62 + fin], [hx + hs * 0.55, hy + 4]]);
    r.poly(P.hide, [[hx + 2, hy + hs * 0.45], [hx + 6, hy - hs * 0.4 + fin], [hx + 9, hy - hs * 0.5 + fin], [hx + hs * 0.5, hy + 5]]);
    // skull and long snout
    r.poly(P.hide, [[hx - 2, hy + 6], [hx + 4, hy], [hx + hs - 2, hy + 1], [hx + hs + 12, hy + hs * 0.42], [hx + hs + 13, hy + hs * 0.58], [hx + hs + 2, hy + hs * 0.7], [hx + 2, hy + hs - 2]]);
    r.poly(P.hideD, [[hx - 2, hy + 6], [hx + 4, hy + 2], [hx + 6, hy + hs - 3], [hx + 2, hy + hs - 2]]);
    // pale underside of the jaw
    r.poly(P.belly, [[hx + 6, hy + hs * 0.66], [hx + hs + 2, hy + hs * 0.7], [hx + hs + 10, hy + hs * 0.6], [hx + hs - 2, hy + hs - 1], [hx + 8, hy + hs - 1]]);
    // open mouth with a row of teeth
    const my = hy + hs * 0.64;
    r.poly(P.mouth, [[hx + hs * 0.45, my], [hx + hs + 8, my - 1], [hx + hs + 4, my + 4], [hx + hs * 0.5, my + 4]]);
    for (let i = 0; i < 6; i++) {
      const tx = hx + hs * 0.5 + i * ((hs * 0.5 + 6) / 6);
      r.poly(P.tooth, [[tx, my], [tx + 3, my], [tx + 1.5, my + 3]]);
      r.poly(P.tooth, [[tx + 1, my + 4], [tx + 4, my + 4], [tx + 2.5, my + 1.5]]);
    }
    // steel brow band with a bronze stud, and the glowing eye under it
    r.poly(P.steel, [[hx - 1, hy + 4], [hx + hs + 4, hy + hs * 0.26], [hx + hs + 4, hy + hs * 0.38], [hx - 1, hy + 10]]);
    r.rect(P.steelD, hx - 1, hy + 9, hs + 2, 1);
    r.ellipse(P.bronze, hx + hs * 0.3, hy + 7, 2.2, 2.2);
    r.poly(P.eye, [[hx + hs * 0.62, hy + hs * 0.42], [hx + hs * 0.86, hy + hs * 0.4], [hx + hs * 0.8, hy + hs * 0.5], [hx + hs * 0.62, hy + hs * 0.5]]);
    // gill marks behind the jaw
    for (let i = 0; i < 2; i++) r.seg(P.gill, hx + 4 + i * 3, hy + hs * 0.55, hx + 3 + i * 3, hy + hs - 3, 1.2, 1);
  }

  // ---- front arm: pauldron, hide arm, plated gauntlet, anchor ----
  {
    const [sx, sy] = k.shF;
    const el = elF;
    r.seg(P.hide, sx, sy, el[0], el[1], 13, 12);
    r.seg(P.hide, el[0], el[1], hand[0], hand[1], 12, 11);
    r.seg(P.armor, el[0] + (hand[0] - el[0]) * 0.5, el[1] + (hand[1] - el[1]) * 0.5, hand[0], hand[1], 12, 13);
    r.rect(P.bronze, hand[0] - 6, hand[1] - 7, 12, 1);
    anchor(r, P, hand, ux, uy, k.base);
    r.ellipse(P.hideD, hand[0], hand[1], 6.5, 6.5); // fist over the ring
  }
}

type Parts = Record<
  'hide' | 'hideD' | 'hideDeep' | 'belly' | 'bellyLine' | 'gill' | 'armor' | 'light' | 'dark' | 'deep' | 'leather' | 'leatherD' | 'bronze' | 'accent' | 'eye' | 'tooth' | 'mouth' | 'steel' | 'steelD' | 'chain' | 'rivet',
  number
>;

/** Ship's anchor held by the ring: shank along the forearm, a stock bar near the top, curved flukes with barbed tips. */
function anchor(r: Raster, P: Parts, hand: V2, ux: number, uy: number, base: number): void {
  // hanging low it rests its crown on the ground instead of sinking through it
  const L = uy > 0.2 ? Math.max(18, Math.min(38, (base - 6 - hand[1]) / uy)) : 38;
  const px = -uy;
  const py = ux;
  const top: V2 = [hand[0] + ux * 2, hand[1] + uy * 2];
  const bot: V2 = [hand[0] + ux * L, hand[1] + uy * L];
  // stock (cross bar)
  const sx = hand[0] + ux * 9;
  const sy = hand[1] + uy * 9;
  r.seg(P.steelD, sx - px * 11, sy - py * 11, sx + px * 11, sy + py * 11, 4, 4);
  r.ellipse(P.bronze, sx - px * 11, sy - py * 11, 2.6, 2.6);
  r.ellipse(P.bronze, sx + px * 11, sy + py * 11, 2.6, 2.6);
  // shank
  r.seg(P.steel, top[0], top[1], bot[0], bot[1], 6, 7);
  r.seg(P.steelD, top[0] + px * 2, top[1] + py * 2, bot[0] + px * 2, bot[1] + py * 2, 1.4, 1.4);
  // crown and arms curving back up into flukes
  for (const s of [-1, 1]) {
    let ax = bot[0];
    let ay = bot[1];
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      const x = bot[0] + px * s * 14 * t - ux * 10 * t * t;
      const y = bot[1] + py * s * 14 * t - uy * 10 * t * t;
      r.seg(P.steel, ax, ay, x, y, 6 - i * 0.6, 5.5 - i * 0.6);
      ax = x;
      ay = y;
    }
    // barbed fluke
    r.poly(P.steelD, [[ax, ay], [ax + px * s * 5 + ux * 2, ay + py * s * 5 + uy * 2], [ax - ux * 7, ay - uy * 7]]);
  }
  r.ellipse(P.bronze, bot[0], bot[1], 3.4, 3.4);
  r.ellipse(P.accent, bot[0], bot[1], 1.4, 1.4);
}

/** Plated greave over hide, a strapped sandal-boot with a bronze toe cap. */
function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  r.seg(back ? P.hideDeep : P.hideD, hip[0], hip[1], kn[0], kn[1], 20, 17);
  r.seg(back ? P.deep : P.armor, kn[0], kn[1], ankle[0], ankle[1], 17, 13);
  if (!back) {
    r.ellipse(P.light, kn[0] + 1, kn[1], 6, 5); // knee guard
    r.rect(P.dark, ankle[0] - 7, ankle[1] - 10, 14, 2);
  }
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(back ? P.leatherD : P.leather, [[bx - 7, by - 4], [bx + 7, by - 4], [bx + 17, by + 4], [bx + 17, by + 8], [bx - 8, by + 8]]);
  r.rect(back ? P.deep : P.bronze, bx + 10, by + 3, 7, 5);
  r.rect(P.deep, bx - 9, by + 7, 27, 2);
}
