import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * Vex: a lean teal shadow-blade. Peaked cowl with two burning eyes, trailing scarf and ragged cape, high-collared jacket with a
 * strap harness, single armoured pauldron, wrapped legs and a pair of curved glowing daggers.
 */
export function drawVex(r: Raster, k0: Skel, look: PlaceholderLook): void {
  // limb ends pulled inside the frame so a fist and its dagger are never cut off at an edge
  const fit = (q: V2, mx: number, top: number, bot: number): V2 => [Math.max(mx, Math.min(k0.W - mx, q[0])), Math.max(top, Math.min(k0.H - bot, q[1]))];
  const k: Skel = { ...k0, handF: fit(k0.handF, 17, 16, 10), handB: fit(k0.handB, 17, 16, 10), elbowF: fit(k0.elbowF, 9, 10, 8), elbowB: fit(k0.elbowB, 9, 10, 8) };
  const inside = (q: V2): V2 => [Math.max(5, Math.min(k.W - 5, q[0])), Math.max(5, Math.min(k.H - 6, q[1]))];
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
    capeIn: r.part(mix(mul(accent, 0.45), dark, 0.55), { soft: true }),
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
    glove: r.part(mix(mul(dark, 0.55), [40, 30, 30], 0.4)),
    gloveL: r.part(mix(mul(dark, 0.55), [200, 190, 200], 0.3), { soft: true }),
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
  const oniD = r.part(mul(mix(accent, [200, 30, 40], 0.55), 0.62));
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
    for (let i = 0; i < pts.length; i++) pts[i] = inside(pts[i]);
    r.poly(P.cape, pts);
    // jagged hem teeth and an accent edge line
    const last = pts[pts.length - 1];
    for (let i = 0; i < 4; i++) r.poly(P.cape, [inside([last[0] + i * 7, last[1]]), inside([last[0] + i * 7 + 7, last[1]]), inside([last[0] + i * 7 + 3, last[1] + 8])]);
    // a darker inner lining along the trailing edge so the cape reads as a separate layer behind the body
    r.inlay(P.cape, P.capeIn, (set) => {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) set(x0 - 2 - drift * (i / 16) * 1.4 - 3 * (i / 16) + j, top + 4 + i * ((hemY - top) * (len / 56) - 4) / 16);
    });
    r.inlay(P.cape, P.mark, (set) => {
      for (let i = 0; i < 18; i++) set(x0 - drift * 0.9 - i * 1.6 + 6, top + 2 + i * 2.4);
    });
  }

  // ---- scarf, streaming from the collar ----
  {
    const nx = T.x + 8;
    const ny = T.y + 2;
    const flow = run ? 0.05 : air ? -0.8 : 0.4;
    // the tail shortens its stride when the collar is near the left edge, so the scarf never trails out of the frame
    const step = Math.max(2.2, Math.min(4.4, (nx - 22) / 12.5));
    let px = nx;
    let py = ny;
    for (let i = 0; i < 13; i++) {
      const x = Math.max(8, nx - 4 - i * step);
      const y = Math.max(8, ny + i * flow * 3 + sw(i, 1.8 + i * 0.22));
      const w = o === 2 ? 3.4 - i * 0.15 : 9 - i * 0.5;
      r.seg(o === 2 ? (i % 2 ? P.glow : P.accent) : i % 4 === 3 ? P.scarfD : P.scarf, px, py, x, y, w, Math.max(o === 2 ? 1.4 : 2.5, w - 0.6));
      px = x;
      py = y;
    }
    if (o === 2) {
      // the neon cable ends in a dark metal jack (it also keeps the glow off the frame edge when knocked flat)
      r.seg(P.steelD, px, py, Math.max(4, px - 6), py + 1, 4, 4);
      r.rect(P.steel, Math.max(4, px - 6) - 1, py - 1, 2, 2);
    }
    if (o !== 2) {
      r.seg(P.scarfD, px, py, Math.max(5, px - 8), py + 4, 3.5, 2);
      r.seg(P.scarf, px, py, Math.max(5, px - 7), Math.max(5, py - 3), 3.5, 2);
    }
  }

  // ---- back arm + dagger ----
  {
    // the far arm sits a step darker than the jacket so it never melts into the torso in front of it
    const el = k.elbowB;
    r.seg(P.dark, k.shB[0], k.shB[1], el[0], el[1], 9, 8);
    r.seg(P.dark, el[0], el[1], k.handB[0], k.handB[1], 8, 7);
    bracer(r, P, el, k.handB, true);
    dagger(r, P, el, k.handB, 32);
    fist(r, P, el, k.handB, true);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- split tabard behind the hips ----
  r.poly(P.cloth, [[T.x + 2, T.y + T.h - 8], [T.x + 14, T.y + T.h - 8], [T.x + 9 + sw(1), Math.min(T.y + T.h + 22, r.h - 10)], [T.x - 3 + sw(2), Math.min(T.y + T.h + 26, r.h - 8)]]);

  // ---- torso ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    r.poly(P.cloth, [[x0 + 2, top + 2], [x0 + w - 2, top + 2], [x0 + w + 2, top + 9], [x0 + w - 6, top + h], [x0 + 6, top + h], [x0 - 2, top + 9]]);
    r.poly(P.deep, [[x0 - 2, top + 9], [x0 + 2, top + 2], [x0 + 9, top + 3], [x0 + 11, top + h - 2], [x0 + 6, top + h]]);
    // lighter chest panel with a centre seam
    // a wrap-over jacket front: a lighter lapel running diagonally down from the near shoulder
    r.poly(P.clothL, [[x0 + w - 4, top + 6], [x0 + w + 1, top + 10], [x0 + w / 2 + 2, top + h - 7], [x0 + w / 2 - 3, top + h - 7]]);
    r.seg(P.seam, x0 + w - 5, top + 8, x0 + w / 2 - 2, top + h - 7, 1, 1);
    // harness: two crossing straps with a buckle and throwing knives
    r.seg(P.strap, x0 + 3, top + 3, x0 + w - 3, top + h - 5, 6, 6);
    r.seg(P.strap, x0 + w - 4, top + 3, x0 + 6, top + h - 5, 5, 5);
    r.rect(P.steel, x0 + w / 2 - 2, top + h / 2 - 2, 5, 5);
    r.rect(P.accent, x0 + w / 2 - 0.5, top + h / 2 - 0.5, 2, 2);
    for (let i = 0; i < 3; i++) r.rect(P.steel, x0 + 6 + i * 4, top + 8 + i * 3.4, 2, 5); // throwing knives on the strap
    // belt with a glowing gem and side pouches
    r.rect(P.deep, x0 + 2, top + h - 6, w - 4, 7);
    r.rect(P.steelD, x0 + w / 2 - 5, top + h - 6, 10, 7);
    r.ellipse(P.accent, x0 + w / 2, top + h - 3, 2.6, 2.6);
    r.rect(P.strap, x0 + 4, top + h, 8, 9);
    r.rect(P.strap, x0 + w - 12, top + h, 8, 9);
    r.rect(P.mark, x0 + 4, top + h + 6, 8, 1);
    // tall collar
    r.poly(P.deep, [[x0 + 8, top - 2], [x0 + w - 4, top - 2], [x0 + w - 2, top + 8], [x0 + 6, top + 8]]);
    r.rect(P.mark, x0 + 9, top + 6, w - 14, 1);
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
    // a shaggy mane swept back: broad locks fanning from the crown, darker ones underneath
    const bx = hx + hs / 2 - 2;
    const by = hy + hs / 2 - 2;
    for (let i = 0; i < 6; i++) {
      const a = Math.PI - 0.1 + i * 0.26;
      const len = 22 + ((i * 5) % 7) - (i > 3 ? 6 : 0);
      const ex = Math.max(6, bx + Math.cos(a) * len + sw(i, 1.4));
      const ey = Math.max(5, by + Math.sin(a) * len * 0.85);
      const nx = -Math.sin(a) * 8;
      const ny = Math.cos(a) * 8;
      const mx = bx + (ex - bx) * 0.55;
      const my = by + (ey - by) * 0.55;
      r.poly(i % 2 ? hairD : hair, [[bx + nx, by + ny], [mx + nx * 0.55, my + ny * 0.55], [ex, ey], [mx - nx * 0.4, my - ny * 0.4], [bx - nx, by - ny]]);
    }
    for (let i = 0; i < 3; i++) r.poly(hairD, [[bx - 2, by + 4 + i * 3], [bx + 4, by + 8 + i * 3], [Math.max(6, bx - 20 - i * 3 + sw(i + 2, 1.5)), by + 10 + i * 5]]);
    r.ellipse(hair, hx + hs / 2, hy + hs / 2 - 2, hs / 2 + 1, hs / 2);
    // the mask: a broad scowling face with a heavy brow ridge, cheekbones, a hooked nose and a fanged grin
    r.poly(oniMask, [[hx + 9, hy + 1], [hx + hs + 1, hy], [hx + hs + 6, hy + 7], [hx + hs + 6, hy + hs - 2], [hx + hs + 1, hy + hs + 4], [hx + 12, hy + hs + 3], [hx + 7, hy + hs / 2]]);
    r.poly(oniD, [[hx + 7, hy + hs / 2], [hx + 12, hy + hs / 2 - 2], [hx + 16, hy + hs + 3], [hx + 12, hy + hs + 3]]); // shaded side of the jaw
    r.poly(oniD, [[hx + 11, hy + 5], [hx + hs + 7, hy + 4], [hx + hs + 7, hy + 9], [hx + hs - 3, hy + 7], [hx + 13, hy + 9]]); // brow ridge
    r.poly(P.deep, [[hx + hs - 9, hy + 9], [hx + hs + 2, hy + 8], [hx + hs, hy + 13], [hx + hs - 8, hy + 13]]); // eye socket
    r.poly(P.glow, [[hx + hs - 7, hy + 10], [hx + hs, hy + 9], [hx + hs - 2, hy + 12], [hx + hs - 6, hy + 12]]);
    r.rect(P.accent, hx + hs - 15, hy + 10, 4, 2); // far eye
    r.poly(oniMask, [[hx + hs + 4, hy + 10], [hx + hs + 9, hy + 16], [hx + hs + 4, hy + 18]]); // hooked nose
    r.rect(oniD, hx + hs + 3, hy + 17, 4, 1);
    r.poly(P.deep, [[hx + 12, hy + hs - 8], [hx + hs + 5, hy + hs - 9], [hx + hs + 3, hy + hs - 2], [hx + 13, hy + hs - 2]]); // open mouth
    for (let i = 0; i < 4; i++) r.poly(bone, [[hx + 13 + i * 4, hy + hs - 8], [hx + 16 + i * 4, hy + hs - 8], [hx + 14.5 + i * 4, hy + hs - 5 + (i === 3 ? 2 : 0)]]);
    for (let i = 0; i < 2; i++) r.poly(bone, [[hx + 15 + i * 9, hy + hs - 2], [hx + 18 + i * 9, hy + hs - 2], [hx + 16.5 + i * 9, hy + hs - 6]]);
    // curved horns from the brow, ringed at the base
    r.poly(bone, [[hx + 9, hy + 3], [hx + 4, hy - 6], [hx + 1, hy - 15], [hx + 8, hy - 8], [hx + 14, hy + 2]]);
    r.poly(bone, [[hx + hs - 3, hy + 2], [hx + hs - 1, hy - 8], [hx + hs + 5, hy - 16], [hx + hs + 5, hy - 6], [hx + hs + 3, hy + 3]]);
    r.rect(boneD, hx + 7, hy, 6, 2);
    r.rect(boneD, hx + hs - 3, hy, 6, 2);
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
    // ---- head: peaked cowl, shadowed face, burning eyes, the scarf pulled up as a mask ----
    const hx = k.head.x;
    const hy = k.head.y + 2;
    const hs = k.head.s;
    r.rect(P.deep, hx + 6, T.y - 5, hs - 10, 8); // neck
    const tip = sw(2, 3);
    // cowl: a lighter shell than the jacket so the head reads first, with a tail that trails behind
    r.poly(P.armor, [[hx + hs + 4, hy + 6], [hx + hs + 1, hy - 2], [hx + hs / 2 + 2, hy - 9], [hx - 4, hy - 4], [hx - 18 - tip, hy + 8 + tip * 0.5], [hx - 4, hy + hs - 6], [hx + 4, hy + hs + 4], [hx + hs - 2, hy + hs + 2], [hx + hs + 4, hy + hs - 8]]);
    r.poly(P.light, [[hx + hs / 2 + 2, hy - 9], [hx + hs + 1, hy - 2], [hx + hs - 4, hy + 2], [hx + hs / 2 - 2, hy - 5]]);
    r.poly(P.dark, [[hx - 18 - tip, hy + 8 + tip * 0.5], [hx - 4, hy + 2], [hx + 2, hy + 8], [hx - 4, hy + hs - 6]]); // fold under the tail
    r.seg(P.seam, hx + 2, hy - 2, hx + hs / 2 - 2, hy - 6, 1, 1);
    // face opening: a deep oval framed by the hood's rim
    r.ellipse(P.dark, hx + hs / 2 + 6, hy + hs / 2 + 1, hs / 2 + 1, hs / 2 - 1);
    r.ellipse(P.deep, hx + hs / 2 + 7, hy + hs / 2 + 1, hs / 2 - 1, hs / 2 - 3);
    // eyes: two narrow almond slits, the near one burning, the far one dimmer
    r.poly(P.glow, [[hx + hs - 9, hy + 11], [hx + hs - 3, hy + 9], [hx + hs + 1, hy + 10], [hx + hs - 4, hy + 13]]);
    r.rect(P.edge, hx + hs - 3, hy + 10, 2, 1);
    r.poly(P.accent, [[hx + hs - 16, hy + 11], [hx + hs - 12, hy + 10], [hx + hs - 11, hy + 12], [hx + hs - 15, hy + 13]]);
    // brow shadow over the eyes
    r.seg(P.deep, hx + hs - 17, hy + 8, hx + hs + 1, hy + 7, 2, 2);
    // the scarf pulled up over nose and mouth, with a fold and the nose bridge
    r.poly(P.scarf, [[hx + 6, hy + 14], [hx + hs + 2, hy + 14], [hx + hs + 5, hy + 18], [hx + hs + 1, hy + hs - 2], [hx + hs - 6, hy + hs + 1], [hx + 8, hy + hs + 1]]);
    r.seg(P.scarfD, hx + 8, hy + 19, hx + hs + 2, hy + 20, 1.6, 1.6);
    r.seg(P.scarfD, hx + 10, hy + hs - 3, hx + hs - 4, hy + hs - 2, 1.4, 1.4);
    r.rect(P.edge, hx + hs + 1, hy + 15, 2, 1);
  }

  // ---- front arm: pauldron, sleeve, dagger ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    // a dark backing a little wider than the sleeve cuts the near arm out of the body behind it
    r.seg(P.deep, sx, sy + 1, el[0], el[1] + 1, 12, 10);
    r.seg(P.deep, el[0], el[1] + 1, k.handF[0], k.handF[1] + 1, 10, 9);
    r.seg(P.clothL, sx, sy, el[0], el[1], 10, 8);
    r.seg(P.cloth, el[0], el[1], k.handF[0], k.handF[1], 8, 7);
    bracer(r, P, el, k.handF, false);
    // armoured shoulder
    // armoured shoulder: sits low on the arm and a step darker than the cowl, so it never reads as the jaw
    r.ellipse(P.deep, sx - 1, sy + 1, 9, 6.5);
    r.ellipse(P.dark, sx, sy, 8, 5.5);
    r.poly(P.armor, [[sx - 6, sy - 3], [sx + 5, sy - 4], [sx + 7, sy - 1], [sx - 5, sy]]);
    r.rect(P.mark, sx - 7, sy + 3, 15, 1);
    r.rect(P.rivet, sx - 1, sy - 2, 2, 2);
    dagger(r, P, el, k.handF, 34);
    fist(r, P, el, k.handF, false);
  }
}

/** A gloved fist round the dagger's grip: knuckles along the forearm, a strap at the wrist and the thumb on top. */
function fist(r: Raster, P: Parts, el: V2, h: V2, back: boolean): void {
  let dx = h[0] - el[0];
  let dy = h[1] - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const nx = -dy;
  const ny = dx;
  const up = ny <= 0 ? 1 : -1;
  r.seg(back ? P.deep : P.strap, h[0] - dx * 5, h[1] - dy * 5, h[0] - dx * 2, h[1] - dy * 2, 8, 8); // wrist cuff
  r.seg(back ? P.strap : P.glove, h[0] - dx * 2, h[1] - dy * 2, h[0] + dx * 2.5, h[1] + dy * 2.5, back ? 8 : 9, back ? 7.5 : 8.5);
  if (!back) {
    r.seg(P.gloveL, h[0] - dx * 1 + nx * up * 3, h[1] - dy * 1 + ny * up * 3, h[0] + dx * 2 + nx * up * 2.6, h[1] + dy * 2 + ny * up * 2.6, 2.6, 2.2); // thumb
    r.seg(P.seam, h[0] + dx * 4.5 + nx * 3.5, h[1] + dy * 4.5 + ny * 3.5, h[0] + dx * 4.5 - nx * 3.5, h[1] + dy * 4.5 - ny * 3.5, 1, 1); // knuckle line
  }
}

type Parts = Record<'armor' | 'light' | 'dark' | 'deep' | 'skin' | 'cloth' | 'clothL' | 'cape' | 'scarf' | 'scarfD' | 'accent' | 'glow' | 'steel' | 'steelD' | 'edge' | 'strap' | 'mark' | 'rivet' | 'seam' | 'glove' | 'gloveL', number>;

function bracer(r: Raster, P: Parts, el: V2, hand: V2, back: boolean): void {
  const mx = el[0] + (hand[0] - el[0]) * 0.62;
  const my = el[1] + (hand[1] - el[1]) * 0.62;
  r.seg(back ? P.dark : P.armor, el[0] + (hand[0] - el[0]) * 0.3, el[1] + (hand[1] - el[1]) * 0.3, mx, my, 10, 9);
  r.ellipse(P.accent, mx, my, 2.4, 2.4);
}

/** Curved dagger from the hand along the forearm, glowing edge and tip. */
function dagger(r: Raster, P: Parts, el: V2, hand: V2, len0: number): void {
  let len = len0;
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
  // a blade that would poke out of the frame is drawn shorter (as if seen a little end-on)
  const out = (L: number): boolean => {
    const x = hand[0] + dx * L + nx * 3;
    const y = hand[1] + dy * L + ny * 3;
    return x < 7 || y < 7 || x > r.w - 7 || y > r.h - 8; // the glowing tip blooms a few pixels past itself
  };
  while (len > 12 && out(len)) len -= 1;
  const tx = hand[0] + dx * len + nx * 3;
  const ty = hand[1] + dy * len + ny * 3;
  const mx = hand[0] + dx * len * 0.55 + nx * 4.5;
  const my = hand[1] + dy * len * 0.55 + ny * 4.5;
  r.seg(P.steelD, hand[0] + dx * 4 + nx * 5, hand[1] + dy * 4 + ny * 5, hand[0] + dx * 4 - nx * 5, hand[1] + dy * 4 - ny * 5, 2.6, 2.6); // cross guard
  r.seg(P.steelD, hand[0] - dx * 4, hand[1] - dy * 4, hand[0] - dx * 7, hand[1] - dy * 7, 3.4, 3.4); // pommel
  const bx = hand[0] + dx * 5;
  const by = hand[1] + dy * 5;
  r.poly(P.steel, [[bx + nx * 3.5, by + ny * 3.5], [mx + nx * 2, my + ny * 2], [tx, ty], [mx - nx * 2.5, my - ny * 2.5], [bx - nx * 2.5, by - ny * 2.5]]);
  r.seg(P.edge, hand[0] + nx, hand[1] + ny, tx - dx * 2, ty - dy * 2, 1.4, 1);
  r.seg(P.accent, mx + nx * 2.5, my + ny * 2.5, tx, ty, 1.6, 1.2);
  r.ellipse(P.glow, tx, ty, 1.6, 1.6);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  // a deep crouch can fold the knee under the floor line: keep the cloth above it
  const lowY = r.h - 14;
  kn = [kn[0], Math.min(lowY, kn[1])];
  ankle = [ankle[0], Math.min(ankle[1], r.h - 12)]; // the sole never sinks below the floor line
  // trousers a step darker than the jacket (so the hips read apart from the torso), lighter wrapped shins
  const pant = back ? P.deep : P.dark;
  r.seg(pant, hip[0], hip[1], kn[0], kn[1], 14, 11);
  r.seg(back ? P.deep : P.cloth, kn[0], kn[1], ankle[0], ankle[1], 11, 8);
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
  // soft boot with a pointed, slightly upturned toe and a folded cuff
  r.poly(back ? P.deep : P.strap, [[bx - 7, by - 8], [bx + 6, by - 8], [bx + 7, by - 1], [bx + 14, by + 3], [bx + 18, by + 4], [bx + 16, by + 8], [bx - 8, by + 8]]);
  r.rect(back ? P.strap : P.armor, bx - 8, by - 10, 15, 4);
  r.rect(P.seam, bx - 8, by - 7, 15, 1);
  r.poly(P.steelD, [[bx + 11, by + 3], [bx + 18, by + 4], [bx + 16, by + 8], [bx + 11, by + 8]]); // metal toe cap
  r.rect(P.deep, bx - 8, by + 7, 24, 2);
}
