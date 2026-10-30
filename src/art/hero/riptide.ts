import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * Riptide: a cyber-shark gladiator. A shark's head (blunt snout, glowing eye, a jaw full of teeth) under a steel brow band, a tall
 * dorsal fin, grey shark hide with a pale ribbed belly and gill slits, a leather harness with a bronze buckle, armoured kilt
 * strips, a shark tail, plated greaves and a big pauldron on the front shoulder. The front hand carries an anchor on a chain.
 */
export function drawRiptide(r: Raster, k0: Skel, look: PlaceholderLook): void {
  // limb ends pulled inside the frame so a fist (and the anchor it carries) is never cut off at an edge
  const fit = (q: V2, mx: number, top: number, bot: number): V2 => [Math.max(mx, Math.min(k0.W - mx, q[0])), Math.max(top, Math.min(k0.H - bot, q[1]))];
  const k: Skel = { ...k0, handF: fit(k0.handF, 16, 14, 16), handB: fit(k0.handB, 14, 14, 12), elbowF: fit(k0.elbowF, 10, 10, 10), elbowB: fit(k0.elbowB, 10, 10, 10) };
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.6);
  const accent = col(look.accent);
  // every lit or painted part is held clear of the glow colours; only the parts made emissive on purpose bloom
  // (a pale lit part that would have to grey right down to clear the bloom white is painted flat instead: a flat white
  // only has to keep its own colour clear, so it can stay white)
  const part = (c: RGB, o: { emissive?: boolean; flat?: boolean; soft?: boolean; lean?: RGB } = {}): number => {
    if (o.emissive) return r.part(c, o);
    const k = keepClear(c, accent, o);
    if (k.steps > 3 && !o.flat && c[0] + c[1] + c[2] > 600) return r.part(keepClear(c, accent, { flat: true }).c, { flat: true });
    return r.part(k.c, { flat: o.flat, soft: o.soft });
  };
  const hide = col(look.skin);
  const belly: RGB = mix(hide, [244, 248, 252], 0.72);
  const leather: RGB = [104, 70, 48];
  const steel: RGB = [196, 210, 222];
  const P = {
    hide: part(hide, { soft: true }),
    hideD: part(mul(hide, 0.74), { soft: true }),
    hideDeep: part(mul(hide, 0.52), { soft: true }),
    belly: part(belly, { soft: true }),
    bellyLine: part(mul(belly, 0.8), { flat: true }),
    gill: part(mul(hide, 0.4), { flat: true }),
    armor: part(armor),
    light: part(mix(armor, [220, 245, 255], 0.35)),
    dark: part(dark),
    deep: part(deep),
    leather: part(leather, { soft: true }),
    leatherD: part(mul(leather, 0.7), { soft: true }),
    bronze: part(accent, { lean: mix(mul(accent, 0.5), [120, 70, 30], 0.4) }), // metal in the accent hue, held off the glow
    accent: part(accent, { emissive: true }),
    eye: part(mix(accent, [255, 240, 200], 0.4), { emissive: true }),
    tooth: part([248, 248, 240], { flat: true }),
    mouth: part([40, 16, 24], { flat: true }),
    steel: part(steel),
    steelD: part(mul(steel, 0.66)),
    chain: part(mul(steel, 0.8), { flat: true }),
    // the anchor is forged iron: darker and more neutral than the brow band, so it reads apart from the pale hide it
    // crosses (both a pale blue-grey, the fist, shank and flukes ran together into one blob)
    iron: part([132, 138, 152]),
    ironD: part([76, 80, 96]),
    rivet: part(mix(accent, [255, 255, 255], 0.3), { flat: true }),
  };
  const T = k.torso;
  const ph = k.phase;
  const run = k.pose.lean > 2;
  const sway = (i: number, a = 2): number => Math.sin(ph * 1.25 + i * 0.9) * a;
  // outfits: 1 = Pirate (tricorn, eyepatch, a long coat with brass buttons), 2 = Hammerhead (a hammer-shaped head, heavy gladiator plate)
  const o = look.outfit ?? 0;
  const coat = part(armor, { soft: true });
  const coatD = part(mul(armor, 0.7), { soft: true });
  const black = part([30, 26, 32]);
  const gold = part([230, 190, 90], { lean: [170, 104, 40] });

  // ---- shark tail (behind): sweeps back from the lower spine to a crescent caudal fin ----
  {
    let px = T.x + 4;
    let py = T.y + T.h - 2;
    for (let i = 0; i < 6; i++) {
      const x = Math.max(22, px - 6);
      const y = Math.min(r.h - 30, py + (run ? 0.5 : 2) + sway(i, 1 + i * 0.35)); // a low crouch lays the tail along the floor, not through it
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
      const y = Math.min(r.h - 12, sy + (hand[1] - sy) * t + Math.sin(t * Math.PI) * 10); // the slack never drags through the floor
      r.ellipse(i % 2 ? P.chain : P.steelD, x, y, 2.6, 2);
    }
  }

  // ---- back arm: hide with a plated bracer ----
  {
    const el = k.elbowB;
    r.seg(P.hideD, k.shB[0], k.shB[1], el[0], el[1], 12, 11);
    r.seg(P.hideD, el[0], el[1], k.handB[0], k.handB[1], 11, 10);
    r.seg(P.dark, el[0] + (k.handB[0] - el[0]) * 0.35, el[1] + (k.handB[1] - el[1]) * 0.35, k.handB[0], k.handB[1], 12, 12);
    {
      let bx = k.handB[0] - el[0];
      let by = k.handB[1] - el[1];
      const bl = Math.hypot(bx, by) || 1;
      bx /= bl;
      by /= bl;
      sharkFist(r, P, k.handB, bx, by, true);
    }
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- armoured kilt strips (behind the torso's front, over the hips) ----
  for (let i = 0; i < 4; i++) {
    const bx = T.x + 4 + i * ((T.w - 6) / 3);
    const by = T.y + T.h - 5;
    const len = Math.min(15 + (i % 2) * 3, r.h - 11 - by);
    r.poly(i % 2 ? P.dark : P.armor, [[bx - 4, by], [bx + 5, by], [bx + 4 + sway(i, 1.2), by + len], [bx - 3 + sway(i, 1.2), by + len + 1]]);
    r.rect(P.rivet, bx, by + 3, 1, 1);
  }

  if (o === 1) {
    // ---- the coat's long tails behind the legs ----
    const run = k.pose.lean > 2 ? 1 : 0;
    // the hem stops short of the floor line (a deep crouch would otherwise drag it through)
    const hem = Math.min(T.y + T.h + 26, r.h - 10);
    r.poly(coatD, [[T.x - 1, T.y + T.h - 10], [T.x + 12, T.y + T.h - 10], [T.x + 8 - run * 10 + sway(2, 2), hem], [Math.max(8, T.x - 10 - run * 16 + sway(3, 3)), hem - 2]]);
    r.rect(gold, Math.max(8, T.x - 10 - run * 16 + sway(3, 3)), hem - 3, 16, 1);
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
    if (o === 1) {
      // the coat open over the chest: lapels and a row of brass buttons
      r.poly(coat, [[x0 - 2, top + 2], [x0 + 8, top + 1], [x0 + w / 2 - 2, top + h - 8], [x0 + 6, top + h - 2], [x0 - 3, top + 11]]);
      r.poly(coatD, [[x0 + 8, top + 1], [x0 + 14, top + 2], [x0 + w / 2, top + 14], [x0 + w / 2 - 3, top + 18]]);
      for (let i = 0; i < 3; i++) r.ellipse(gold, x0 + w / 2 - 4, top + 8 + i * 6, 1.6, 1.6);
    }
    if (o === 2) {
      // a heavy plated chest guard over the belly
      r.poly(P.armor, [[x0 + w / 2 - 4, top + 4], [x0 + w + 3, top + 8], [x0 + w - 2, top + h - 12], [x0 + w / 2 - 2, top + h - 12]]);
      r.poly(P.light, [[x0 + w / 2 - 2, top + 5], [x0 + w + 1, top + 9], [x0 + w, top + 14], [x0 + w / 2 - 1, top + 12]]);
      for (let i = 0; i < 3; i++) r.rect(P.rivet, x0 + w / 2 + 1 + i * 5, top + h - 15, 2, 2);
    }
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- front pauldron (under the head so the snout overlaps it) ----
  {
    const [sx, sy] = k.shF;
    const big = o === 2 ? 1.5 : 1;
    r.ellipse(o === 1 ? coatD : P.dark, sx - 1, sy + 1, 9 * big, 7 * big);
    r.ellipse(o === 1 ? coat : P.armor, sx, sy, 7.5 * big, 5.5 * big);
    r.ellipse(P.light, sx - 2, sy - 2, 3.5 * big, 2 * big);
    r.rect(o === 1 ? gold : P.bronze, sx - 8 * big, sy + 5 * big, 16 * big, 2);
    if (o === 2) for (let i = 0; i < 2; i++) r.rect(P.dark, sx - 10, sy + 1 + i * 4, 20, 1); // layered lames
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
    // a fierce glowing eye: dark socket, lit iris and a black slit pupil (the hammerhead's eyes sit on its lobes instead)
    if (o !== 2) r.poly(P.mouth, [[hx + hs * 0.56, hy + hs * 0.4], [hx + hs * 0.9, hy + hs * 0.37], [hx + hs * 0.84, hy + hs * 0.53], [hx + hs * 0.58, hy + hs * 0.53]]);
    if (o !== 2) {
      r.poly(P.eye, [[hx + hs * 0.6, hy + hs * 0.42], [hx + hs * 0.86, hy + hs * 0.4], [hx + hs * 0.8, hy + hs * 0.5], [hx + hs * 0.62, hy + hs * 0.5]]);
      r.rect(P.mouth, hx + hs * 0.74, hy + hs * 0.41, 1.5, hs * 0.09);
      // striking: the eye flashes, a glint streaking off it
      if ((k0.pose.hit ?? 0) >= 0.6) r.rect(P.eye, hx + hs * 0.86, hy + hs * 0.42, 3 + (k0.pose.hit ?? 0) * 4, 1);
    }
    // gill marks behind the jaw
    for (let i = 0; i < 2; i++) r.seg(P.gill, hx + 4 + i * 3, hy + hs * 0.55, hx + 3 + i * 3, hy + hs - 3, 1.2, 1);
    if (o === 2) {
      // the hammer, seen three-quarter: a broad flat cephalofoil across the top of the skull, tipping down toward the
      // viewer, with an eye on each lobe (the far one small and dim)
      const a: V2 = [hx - 6, hy - 2];
      const b: V2 = [hx + hs + 16, hy + hs * 0.34];
      r.poly(P.hideD, [[a[0] - 2, a[1] - 5], [b[0] + 2, b[1] - 6], [b[0] + 4, b[1] + 3], [b[0] - 4, b[1] + 6], [a[0] + 2, a[1] + 6]]);
      r.poly(P.hide, [[a[0], a[1] - 5], [b[0], b[1] - 7], [b[0] + 3, b[1] - 1], [a[0] + 2, a[1] + 1]]);
      r.seg(P.belly, a[0] + 4, a[1] + 5, b[0] - 4, b[1] + 5, 2, 2.4);
      r.ellipse(P.mouth, b[0], b[1] - 1, 3.2, 3);
      r.ellipse(P.eye, b[0] + 0.5, b[1] - 1, 2.2, 2);
      r.ellipse(P.eye, a[0] + 1, a[1] - 1, 1.4, 1.4);
      r.rect(P.steel, hx + hs * 0.2, hy + hs * 0.08, hs * 0.5, 2); // a steel band across the hammer
    }
    if (o === 1) {
      // an eyepatch over the eye, its strap round the head, and a tricorn hat with gold trim and a skull
      r.seg(black, hx - 1, hy + 5, hx + hs * 0.75, hy + hs * 0.44, 1.4, 1.4);
      r.ellipse(black, hx + hs * 0.74, hy + hs * 0.46, 4, 3.4);
      const tx = hx + hs / 2;
      const ty = hy + 2;
      r.poly(black, [[tx - hs / 2 - 10, ty + 1], [tx - hs / 2 + 2, ty - 12], [tx, ty - 8], [tx + hs / 2 + 2, ty - 13], [tx + hs / 2 + 12, ty + 2], [tx + 2, ty + 4]]);
      r.poly(gold, [[tx - hs / 2 - 10, ty + 1], [tx + 2, ty + 3], [tx + hs / 2 + 12, ty + 2], [tx + hs / 2 + 11, ty + 3], [tx + 2, ty + 5], [tx - hs / 2 - 10, ty + 2]]);
      r.ellipse(P.tooth, tx + 1, ty - 5, 2.4, 2.2);
      r.rect(black, tx, ty - 5, 1, 1);
      r.rect(black, tx + 2, ty - 5, 1, 1);
    }
  }

  // ---- front arm: pauldron, hide arm, plated gauntlet, anchor ----
  {
    const [sx, sy] = k.shF;
    const el = elF;
    // a dark backing a little wider than the arm cuts it out of the hide torso behind it
    r.seg(P.hideDeep, sx, sy + 1, el[0], el[1] + 1, 16, 15);
    r.seg(P.hideDeep, el[0], el[1] + 1, hand[0], hand[1] + 1, 15, 14);
    r.seg(P.hide, sx, sy, el[0], el[1], 13, 12);
    r.seg(P.hide, el[0], el[1], hand[0], hand[1], 12, 11);
    r.seg(P.belly, el[0] + (hand[0] - el[0]) * 0.1 + uy * 3, el[1] + (hand[1] - el[1]) * 0.1 - ux * 3 + 3, el[0] + (hand[0] - el[0]) * 0.45, el[1] + (hand[1] - el[1]) * 0.45 + 3, 4, 3); // pale underside
    r.seg(P.armor, el[0] + (hand[0] - el[0]) * 0.5, el[1] + (hand[1] - el[1]) * 0.5, hand[0] - ux * 4, hand[1] - uy * 4, 12, 13);
    r.seg(P.bronze, hand[0] - ux * 5 + uy * 6, hand[1] - uy * 5 - ux * 6, hand[0] - ux * 5 - uy * 6, hand[1] - uy * 5 + ux * 6, 2, 2); // gauntlet rim
    // at rest (idle, crouch, walk: upright, feet under him, the fist hanging near the hip): a low anchor is planted on
    // the floor instead of shrunk. Attacks keep it in the swing, so an animation never pops between the two holds.
    const q = k.pose;
    const standing = q.lean === 0 && Math.abs(q.frontFoot[0]) <= 7 && q.frontFoot[1] <= 3 && q.backFoot[1] <= 3 && Math.abs(q.frontHand[0]) <= 6 && q.frontHand[1] >= -4 && q.frontHand[1] <= 2;
    anchor(r, P, hand, ux, uy, k.base, standing);
    sharkFist(r, P, hand, ux, uy, false);
  }
}

type Parts = Record<
  'hide' | 'hideD' | 'hideDeep' | 'belly' | 'bellyLine' | 'gill' | 'armor' | 'light' | 'dark' | 'deep' | 'leather' | 'leatherD' | 'bronze' | 'accent' | 'eye' | 'tooth' | 'mouth' | 'steel' | 'steelD' | 'chain' | 'rivet' | 'iron' | 'ironD',
  number
>;

/** A big webbed shark fist: knuckles along the forearm direction, a bronze knuckle-duster ridge and the thumb on top. */
function sharkFist(r: Raster, P: Parts, h: V2, ux: number, uy: number, back: boolean): void {
  const nx = -uy;
  const ny = ux;
  const up = ny <= 0 ? 1 : -1;
  r.seg(back ? P.hideDeep : P.hideD, h[0] - ux * 1, h[1] - uy * 1, h[0] + ux * 3, h[1] + uy * 3, 12, 11);
  r.seg(back ? P.dark : P.bronze, h[0] + ux * 5.5 + nx * 4.5, h[1] + uy * 5.5 + ny * 4.5, h[0] + ux * 5.5 - nx * 4.5, h[1] + uy * 5.5 - ny * 4.5, 2.4, 2.4);
  if (!back) {
    r.seg(P.hide, h[0] - ux * 1 + nx * up * 4, h[1] - uy * 1 + ny * up * 4, h[0] + ux * 3 + nx * up * 3.5, h[1] + uy * 3 + ny * up * 3.5, 3.4, 3); // thumb
    for (const t of [-1.6, 1.6]) r.seg(P.gill, h[0] + ux * 1 + nx * t, h[1] + uy * 1 + ny * t, h[0] + ux * 4 + nx * t, h[1] + uy * 4 + ny * t, 0.8, 0.8);
  }
}

/**
 * Ship's anchor held by the ring: shank along the forearm (a low arm lets it hang plumb), a stock bar near the top, curved
 * flukes with barbed tips. It is drawn shorter rather than cut off where it would leave the frame or sink through the floor.
 */
function anchor(r: Raster, P: Parts, grip: V2, ux0: number, uy0: number, base: number, canPlant: boolean): void {
  const hand = grip;
  let ux = ux0;
  let uy = uy0;
  if (uy > 0.35) {
    // hanging: swings toward plumb, tipped a little forward
    ux = 0.3;
    uy = 0.95;
  }
  const F = 16; // fluke span
  const ends = (L: number, ux: number, uy: number): V2[] => {
    const b: V2 = [hand[0] + ux * L, hand[1] + uy * L];
    const px = -uy;
    const py = ux;
    return [b, [b[0] + px * F - ux * 12, b[1] + py * F - uy * 12], [b[0] - px * F - ux * 12, b[1] - py * F - uy * 12], [b[0] + px * F * 0.8, b[1] + py * F * 0.8], [b[0] - px * F * 0.8, b[1] - py * F * 0.8]];
  };
  const floor = Math.min(r.h - 13, base - 9);
  const inFrame = (q: V2): boolean => q[0] >= 9 && q[0] <= r.w - 9 && q[1] >= 8 && q[1] <= floor;
  // shorten first; if even a short anchor will not fit (a fist near the floor), swing it forward until it does
  let L = 44;
  const ox = ux;
  const oy = uy;
  // (first try to keep it near full size by swinging it, then accept a shorter one)
  search: for (const minL of [36, 22]) {
    for (let swing = 0; swing <= 6; swing++) {
      const t = swing / 6;
      const fx = ox + ((ox < 0 ? -0.96 : 0.96) - ox) * t;
      const fy = oy + (0.28 - oy) * t;
      const fl = Math.hypot(fx, fy) || 1;
      ux = fx / fl;
      uy = fy / fl;
      L = 44;
      while (L > minL && !ends(L, ux, uy).every(inFrame)) L -= 1;
      if (ends(L, ux, uy).every(inFrame)) break search;
    }
    if (minL === 36 && !canPlant && oy > 0.35) {
      // on the move (run, dash) a low fist has no room to hang or level it: carry the anchor raised ahead instead,
      // full size, rather than shrinking it to a trinket
      const fwd = ox < 0 ? -1 : 1;
      for (let deg = 10; deg >= -50; deg -= 6) {
        ux = fwd * Math.cos((deg * Math.PI) / 180);
        uy = Math.sin((deg * Math.PI) / 180);
        L = 44;
        while (L > minL && !ends(L, ux, uy).every(inFrame)) L -= 1;
        if (ends(L, ux, uy).every(inFrame)) break search;
      }
    }
  }
  if (canPlant && oy > 0.35 && L < 40) {
    // a low hand (idle, crouch): rather than shrink a hanging anchor, plant it. The crown rests on the floor just in
    // front of the fist and the shank stands up through the grip, leaning forward, clear of the forearm, so the
    // stock and ring stand out in front of the chest: the full-size anchor, read as a gladiator leaning on his weapon.
    const pu = Math.hypot(0.32, 0.95);
    const dx = -0.32 / pu;
    const dy = 0.95 / pu;
    const a = Math.max(3, Math.min(14, (floor - 2 - grip[1]) / dy));
    const crown: V2 = [grip[0] + dx * a, grip[1] + dy * a];
    const ring: V2 = [crown[0] - dx * 44, crown[1] - dy * 44];
    // flukes curl up from the crown: they need room above the floor, not below it
    if ([ring, crown, [crown[0] - 16, crown[1] - 12] as V2, [crown[0] + 16, crown[1] - 12] as V2].every(inFrame)) {
      drawAnchor(r, P, ring, dx, dy, 44, F, inFrame);
      return;
    }
  }
  while (L > 14 && !inFrame([hand[0] + ux * L, hand[1] + uy * L])) L -= 1;
  drawAnchor(r, P, hand, ux, uy, L, F, inFrame);
}

/** The anchor itself: ring at `hand`, shank `L` long along (ux, uy), stock, crown and curved flukes. */
function drawAnchor(r: Raster, P: Parts, hand: V2, ux: number, uy: number, L: number, F: number, inFrame: (q: V2) => boolean): void {
  const px = -uy;
  const py = ux;
  // a fluke with no room (the anchor resting on the floor) is drawn dug in: its arm shorter
  const span = (sgn: number): number => {
    let f = F;
    const b: V2 = [hand[0] + ux * L, hand[1] + uy * L];
    const ok = (q: V2): boolean => inFrame(q);
    while (f > 4 && !(ok([b[0] + px * sgn * f - ux * 12, b[1] + py * sgn * f - uy * 12]) && ok([b[0] + px * sgn * f * 0.8, b[1] + py * sgn * f * 0.8]))) f -= 1;
    return f;
  };
  const top: V2 = [hand[0] + ux * 2, hand[1] + uy * 2];
  const bot: V2 = [hand[0] + ux * L, hand[1] + uy * L];
  // stock (cross bar) with bronze ball ends
  const sx = hand[0] + ux * 10;
  const sy = hand[1] + uy * 10;
  const bar = (sgn: number): number => {
    let h = 11;
    while (h > 3 && !inFrame([sx + px * sgn * h, sy + py * sgn * h])) h -= 1;
    return h;
  };
  const b0 = bar(-1);
  const b1 = bar(1);
  r.seg(P.ironD, sx - px * b0, sy - py * b0, sx + px * b1, sy + py * b1, 4.5, 4.5);
  r.ellipse(P.bronze, sx - px * b0, sy - py * b0, 2.8, 2.8);
  r.ellipse(P.bronze, sx + px * b1, sy + py * b1, 2.8, 2.8);
  // shank with a dark groove
  r.seg(P.iron, top[0], top[1], bot[0], bot[1], 7, 8);
  r.seg(P.ironD, top[0] + px * 2, top[1] + py * 2, bot[0] + px * 2, bot[1] + py * 2, 1.4, 1.4);
  // crown and arms curving back up into flukes
  for (const sgn of [-1, 1]) {
    const Fs = span(sgn);
    const back = (12 * Fs) / F;
    let ax = bot[0];
    let ay = bot[1];
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      const x = bot[0] + px * sgn * Fs * t - ux * back * t * t;
      const y = bot[1] + py * sgn * Fs * t - uy * back * t * t;
      r.seg(P.iron, ax, ay, x, y, 7 - i * 0.6, 6.5 - i * 0.6);
      ax = x;
      ay = y;
    }
    // barbed fluke: a broad spade at each tip
    r.poly(P.ironD, [[ax + px * sgn * 1, ay + py * sgn * 1], [ax + px * sgn * 6 + ux * 3, ay + py * sgn * 6 + uy * 3], [ax - ux * 8, ay - uy * 8], [ax - px * sgn * 3 + ux * 2, ay - py * sgn * 3 + uy * 2]]);
  }
  r.ellipse(P.bronze, bot[0], bot[1], 3.6, 3.6);
  r.ellipse(P.rivet, bot[0], bot[1], 1.4, 1.4);
}

/** Plated greave over hide, a strapped sandal-boot with a bronze toe cap. */
function leg(r: Raster, P: Parts, hip: V2, kn0: V2, ankle0: V2, back: boolean): void {
  // a deep crouch can fold the knee (or a foot) under the floor line: keep them above it
  const kn: V2 = [kn0[0], Math.min(r.h - 18, kn0[1])];
  const ankle: V2 = [ankle0[0], Math.min(r.h - 12, ankle0[1])];
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

/**
 * `x` nudged just far enough that none of the tones the shader can give it (rim light, cast shade, volume) lands within
 * reach of the accent or its bloom white. The finishing pass treats any pixel near those as self-lit and blooms it, so
 * without this a pale accent set the whites glowing and an accent-coloured cloth or metal read as a light source. The
 * colour leans toward `lean` (default: darker; pale colours try a cool tint first) by the smallest step that clears;
 * `steps` says how far it had to go (0 = untouched).
 */
function keepClear(x: RGB, accent: RGB, o: { flat?: boolean; soft?: boolean; lean?: RGB }): { c: RGB; steps: number } {
  const hot = mul(accent, 1.55);
  const far = (a: RGB, b: RGB): boolean => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) >= 50;
  const warm: RGB = [255, 242, 214];
  const cool: RGB = [28, 18, 72];
  const tones = (v: RGB): RGB[] => {
    if (o.flat) return [v];
    const out: RGB[] = [];
    for (const vol of [0.92, 1.06]) {
      const b = mul(v, vol);
      const lit = mix(mul(b, o.soft ? 1.12 : 1.3), warm, 0.1);
      out.push(b, lit, mul(b, 1.1), mix(mul(b, o.soft ? 0.8 : 0.66), cool, 0.2), mix(mul(lit, o.soft ? 0.8 : 0.66), cool, 0.2), mix(mul(b, 0.86), cool, 0.08), mul(b, 0.92));
    }
    return out;
  };
  const ok = (v: RGB): boolean => tones(v).every((t) => far(t, accent) && far(t, hot));
  if (ok(x)) return { c: x, steps: 0 };
  const hues: RGB[] = o.lean ? [o.lean] : x[0] + x[1] + x[2] > 600 ? [[176, 194, 244], mul(x, 0.55)] : [mul(x, 0.55)];
  for (let n = 1; n <= 14; n++)
    for (const h of hues) {
      const v = mix(x, h, Math.min(1, n * 0.07));
      if (ok(v)) return { c: v, steps: n };
    }
  return { c: mul(x, 0.5), steps: 15 };
}
