import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * Obelisk: a living obelisk. A tall granite shaft built of stone courses that tapers hard toward the top, a carved cartouche
 * down its front face filled with glowing glyphs, a geode heart showing through a crack, a bronze collar under a faceted
 * amethyst capstone (its head) with one blazing eye-slit, crystal clusters hovering over the shoulders, a ring of rune
 * stones orbiting the waist, arms of separate floating stones strung on crystal light ending in faceted crystal fists, and
 * long legs of floating stone segments on stepped plinth feet. Crystals take `armor`, deep stone `armorDark`, glow `accent`.
 */
export function drawObelisk(r: Raster, k: Skel, look: PlaceholderLook): void {
  const stone = col(look.skin);
  const crystal = col(look.armor);
  const deepStone = col(look.armorDark);
  const glow = col(look.accent);
  const bronze: RGB = [196, 150, 74];
  const P = {
    stone: r.part(stone),
    stoneL: r.part(mix(stone, [240, 232, 220], 0.32)),
    stoneD: r.part(mix(stone, deepStone, 0.5)),
    stoneDeep: r.part(mix(stone, deepStone, 0.82)),
    seam: r.part(mul(mix(stone, deepStone, 0.6), 0.75), { flat: true }),
    panel: r.part(mix(stone, deepStone, 0.66)),
    glyph: r.part(mix(glow, crystal, 0.25), { emissive: true, flat: true }),
    crystal: r.part(crystal),
    crystalL: r.part(mix(crystal, [255, 255, 255], 0.5)),
    crystalD: r.part(mul(crystal, 0.55)),
    crystalDeep: r.part(mul(crystal, 0.35)),
    bronze: r.part(bronze),
    bronzeD: r.part(mul(bronze, 0.62)),
    glow: r.part(glow, { emissive: true }),
    core: r.part(mix(glow, [255, 255, 255], 0.6), { emissive: true }),
  };
  const T = k.torso;
  const ph = k.phase;
  const pulse = 0.5 + 0.5 * Math.sin(ph * 1.3);
  const lean = k.pose.lean * 0.7;

  // the shaft's outline: a strong taper (the top is ~55% of the base), leaning with the pose at the top
  const cx = T.x + T.w / 2;
  const topY = T.y - 6;
  const baseY = T.y + T.h + 2;
  const topHalf = T.w * 0.25;
  const baseHalf = T.w * 0.52;
  const tl: V2 = [cx - topHalf + lean, topY];
  const tr: V2 = [cx + topHalf + lean, topY];
  const br: V2 = [cx + baseHalf, baseY];
  const bl: V2 = [cx - baseHalf, baseY];
  const edgeAt = (y: number, side: -1 | 1): number => {
    const t = (y - topY) / (baseY - topY);
    return cx + lean * (1 - t) + side * (topHalf + (baseHalf - topHalf) * t);
  };

  // ---- the rune ring, back half (behind everything) ----
  runeRing(r, P, cx, baseY - 8, baseHalf + 9, ph, false);

  // ---- back arm and back leg ----
  floatingArm(r, P, k.shB, k.elbowB, k.handB, true);
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- the shaft ----
  {
    r.poly(P.stone, [tl, tr, br, bl]);
    // the shaded back face: a narrow strip down the left side, so it reads as a four-sided column
    r.poly(P.stoneD, [tl, [tl[0] + 5, topY], [bl[0] + 9, baseY], bl]);
    // the lit right edge
    r.poly(P.stoneL, [[tr[0] - 3, topY], tr, br, [br[0] - 4, baseY]]);
    // stone courses: horizontal seams with a lit lip above each one, a few blocks offset
    for (let i = 1; i < 5; i++) {
      const y = topY + ((baseY - topY) * i) / 5;
      const x0 = edgeAt(y, -1);
      const x1 = edgeAt(y, 1);
      r.inlay(P.stone, P.seam, (set) => {
        for (let x = x0; x < x1; x++) set(x, y);
        const jx = x0 + (x1 - x0) * (i % 2 ? 0.7 : 0.3);
        for (let yy = 1; yy < (baseY - topY) / 5; yy++) set(jx, y + yy);
      });
      r.inlay(P.stoneD, P.seam, (set) => {
        for (let x = x0; x < x1; x++) set(x, y);
      });
      r.inlay(P.stone, P.stoneL, (set) => {
        for (let x = x0 + 4; x < x1 - 2; x++) set(x, y - 1);
      });
    }
    // the cartouche: a sunken panel down the front face, rounded at the top, full of glowing glyphs
    const px = cx + lean * 0.4 + 2;
    const pTop = topY + 6;
    const pBot = baseY - 10;
    const pw = topHalf * 0.95;
    r.poly(P.panel, [[px - pw / 2, pTop + 3], [px - pw / 2 + 2, pTop], [px + pw / 2 - 2, pTop], [px + pw / 2, pTop + 3], [px + pw / 2 + 2, pBot], [px - pw / 2 - 2, pBot]]);
    r.rect(P.stoneDeep, px - pw / 2 - 2, pBot, pw + 4, 1);
    const glyphs: ((x: number, y: number) => void)[] = [
      (x, y) => { r.rect(P.glyph, x - 2, y, 4, 1); r.rect(P.glyph, x, y - 2, 1, 5); }, // cross
      (x, y) => { r.ellipse(P.glyph, x, y, 2, 2); r.rect(P.panel, x - 0.5, y - 0.5, 1, 1); }, // ring
      (x, y) => { r.rect(P.glyph, x - 2, y - 2, 1, 4); r.rect(P.glyph, x - 2, y + 1, 4, 1); r.rect(P.glyph, x + 1, y - 2, 1, 4); }, // cup
      (x, y) => { r.poly(P.glyph, [[x, y - 3], [x + 2, y + 1], [x - 2, y + 1]]); }, // triangle
      (x, y) => { r.rect(P.glyph, x - 2, y - 2, 4, 1); r.rect(P.glyph, x - 1, y, 3, 1); r.rect(P.glyph, x - 2, y + 2, 4, 1); }, // bars
    ];
    // the geode heart through a crack, two-thirds of the way down the cartouche
    const hy = pTop + (pBot - pTop) * 0.6;
    for (let i = 0; i * 7 + pTop + 5 < hy - 9; i++) glyphs[(i * 3) % glyphs.length](px, pTop + 5 + i * 7);
    r.poly(P.stoneDeep, [[px - 5, hy - 8], [px + 1, hy - 10], [px + 6, hy - 1], [px + 4, hy + 8], [px - 1, hy + 9], [px - 6, hy + 1]]);
    r.poly(P.crystalD, [[px - 3, hy - 6], [px + 1, hy - 7], [px + 4, hy - 1], [px + 2, hy + 6], [px - 1, hy + 7], [px - 4, hy + 1]]);
    r.poly(P.glow, [[px - 1, hy - 4], [px + 2, hy - 1], [px + 1, hy + 4], [px - 2, hy + 1]]);
    r.ellipse(P.core, px, hy, 1 + pulse, 1.2 + pulse);
    // hairline cracks spreading from it, and a chipped corner at the base
    r.inlay(P.stone, P.seam, (set) => {
      for (let i = 0; i < 9; i++) set(px + 6 + i * 0.6, hy + 3 + i);
      for (let i = 0; i < 6; i++) set(px - 6 - i * 0.7, hy - 4 - i);
    });
    r.poly(P.stoneDeep, [[br[0] - 6, baseY - 1], [br[0], baseY - 6], [br[0], baseY]]);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- the capstone: a bronze collar, then a faceted amethyst pyramid with one blazing eye-slit ----
  {
    const bx = cx + lean;
    const half = topHalf + 7;
    const collarY = topY - 3;
    r.poly(P.bronze, [[bx - half - 1, collarY], [bx + half + 1, collarY], [bx + half - 1, topY + 3], [bx - half + 1, topY + 3]]);
    r.rect(P.bronzeD, bx - half, topY + 2, half * 2, 1);
    for (let i = -1; i <= 1; i++) r.rect(P.bronzeD, bx + i * (half * 0.6) - 0.5, collarY + 1, 1, 3);
    const base = collarY;
    const tipY = base - k.head.s * 0.95; // a squat pyramidion, not a spire
    const tip: V2 = [bx + 1, tipY];
    // three visible facets: shaded left, mid front, lit right edge
    r.poly(P.crystal, [[bx - half, base], tip, [bx + half, base]]);
    r.poly(P.crystalD, [[bx - half, base], tip, [bx - half * 0.25, base]]);
    r.poly(P.crystalL, [tip, [bx + half * 0.55, base], [bx + half * 0.3, base]]);
    r.seg(P.crystalL, tip[0], tip[1] + 1, bx - half * 0.25, base - 1, 1, 1);
    // internal glints
    r.rect(P.crystalL, bx - half * 0.55, base - 6, 1, 3);
    r.rect(P.crystalL, bx + half * 0.05, base - (base - tipY) * 0.6, 1, 2);
    // the eye: a blazing slit across the front facet with a hot white core
    const ey = base - (base - tipY) * 0.42;
    r.poly(P.crystalDeep, [[bx - half * 0.45, ey - 3], [bx + half * 0.9, ey - 1], [bx + half * 0.82, ey + 5], [bx - half * 0.45, ey + 4]]);
    r.poly(P.glow, [[bx + half * 0.05, ey], [bx + half * 0.72, ey + 1], [bx + half * 0.68, ey + 2.5], [bx + half * 0.05, ey + 2]]);
    r.rect(P.core, bx + half * 0.35, ey + 0.8, 4, 1.2); // the pupil: a hot white glint toward the front
    // the hovering shoulder clusters: crystal prisms floating over each shoulder, clear of the shaft
    const hover = Math.sin(ph * 1.2) * 1.2;
    cluster(r, P, [k.shB[0] - 4, k.shB[1] - 10 + hover], -1, true);
    cluster(r, P, [k.shF[0] + 2, k.shF[1] - 11 - hover], 1, false);
  }

  // ---- front arm, then the front half of the rune ring ----
  floatingArm(r, P, k.shF, k.elbowF, k.handF, false);
  runeRing(r, P, cx, baseY - 8, baseHalf + 9, ph, true);
}

type Parts = Record<
  'stone' | 'stoneL' | 'stoneD' | 'stoneDeep' | 'seam' | 'panel' | 'glyph' | 'crystal' | 'crystalL' | 'crystalD' | 'crystalDeep' | 'bronze' | 'bronzeD' | 'glow' | 'core',
  number
>;

/** A fan of three crystal prisms hovering over a shoulder, pointing up and out to `side`. */
function cluster(r: Raster, P: Parts, at: V2, side: -1 | 1, back: boolean): void {
  const specs: [number, number, number][] = [
    [-0.25, 15, 6],
    [0.15, 11, 5],
    [0.55, 8, 4],
  ];
  for (const [a, len, wid] of specs) {
    const ang = -Math.PI / 2 + side * a;
    prism(r, P, [at[0] + side * a * 6, at[1]], ang, len, wid, back);
  }
}

/** A pointed hexagonal prism: shaded and lit facets and a glowing ridge. */
function prism(r: Raster, P: Parts, base: V2, ang: number, len: number, wid: number, back: boolean): void {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const px = -uy;
  const py = ux;
  const hw = wid / 2;
  const shaft = len * 0.7;
  const b0: V2 = [base[0] + px * hw, base[1] + py * hw];
  const b1: V2 = [base[0] - px * hw, base[1] - py * hw];
  const s0: V2 = [b0[0] + ux * shaft, b0[1] + uy * shaft];
  const s1: V2 = [b1[0] + ux * shaft, b1[1] + uy * shaft];
  const tip: V2 = [base[0] + ux * len, base[1] + uy * len];
  r.poly(back ? P.crystalD : P.crystal, [b0, s0, tip, s1, b1]);
  const m0: V2 = [base[0] + px * hw * 0.1, base[1] + py * hw * 0.1];
  const m1: V2 = [m0[0] + ux * shaft, m0[1] + uy * shaft];
  r.poly(back ? P.crystal : P.crystalL, [b1, s1, tip, m1, m0]);
  r.seg(P.glow, m0[0] + ux * len * 0.25, m0[1] + uy * len * 0.25, m1[0], m1[1], 1, 1);
}

/** A ring of small rune stones orbiting the waist; drawn in two halves (behind, then in front of the body). */
function runeRing(r: Raster, P: Parts, cx: number, cy: number, rad: number, ph: number, front: boolean): void {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = ph * 0.7 + (i * Math.PI * 2) / n;
    const z = Math.sin(a); // > 0: in front of the body
    if (front !== z > 0) continue;
    const x = cx + Math.cos(a) * rad;
    const y = cy + z * 3;
    const s = front ? 4.4 : 3.4;
    r.poly(front ? P.stoneL : P.stoneD, [[x - s, y - s * 0.8], [x + s, y - s], [x + s * 0.9, y + s * 0.8], [x - s * 0.8, y + s]]);
    r.rect(front ? P.glyph : P.crystal, x - 1, y - 1.5, 2, 3);
  }
}

/**
 * An arm of separate floating stones: a shoulder slab, an upper-arm block and a forearm block with clear gaps between them,
 * strung on a thread of crystal light, ending in a faceted crystal fist.
 */
function floatingArm(r: Raster, P: Parts, sh: V2, el: V2, hand: V2, back: boolean): void {
  const S = back ? P.stoneD : P.stone;
  const SD = back ? P.stoneDeep : P.stoneD;
  // the thread of light first, so the stones sit on it and it shows in the gaps
  r.seg(P.glow, sh[0], sh[1], el[0], el[1], 1.6, 1.6);
  r.seg(P.glow, el[0], el[1], hand[0], hand[1], 1.6, 1.6);
  // the shoulder slab, hovering
  r.poly(back ? P.stoneDeep : P.stoneL, [[sh[0] - 7, sh[1] - 4], [sh[0] + 5, sh[1] - 7], [sh[0] + 8, sh[1]], [sh[0] - 5, sh[1] + 3]]);
  r.rect(P.seam, sh[0] - 5, sh[1] - 1, 11, 1);
  // upper arm and forearm stones, leaving glowing gaps at the shoulder, elbow and wrist
  block(r, S, SD, sh, el, 0.34, 0.8, 9);
  block(r, S, SD, el, hand, 0.2, 0.66, 8.5);
  // a crystal fist: a faceted chunk of amethyst pointing along the forearm, with a glowing core
  let ux = hand[0] - el[0];
  let uy = hand[1] - el[1];
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  const px = -uy;
  const py = ux;
  const c: V2 = [hand[0] + ux * 2, hand[1] + uy * 2];
  const pts: V2[] = [
    [c[0] - ux * 5 + px * 5, c[1] - uy * 5 + py * 5],
    [c[0] + ux * 4 + px * 6, c[1] + uy * 4 + py * 6],
    [c[0] + ux * 9, c[1] + uy * 9],
    [c[0] + ux * 4 - px * 6, c[1] + uy * 4 - py * 6],
    [c[0] - ux * 5 - px * 5, c[1] - uy * 5 - py * 5],
  ];
  r.poly(back ? P.crystalDeep : P.crystalD, pts);
  r.poly(back ? P.crystalD : P.crystal, [pts[0], pts[1], pts[2], [c[0], c[1]]]);
  if (!back) {
    r.poly(P.crystalL, [pts[1], pts[2], [c[0] + ux * 3 + px * 2, c[1] + uy * 3 + py * 2]]);
    r.ellipse(P.glow, c[0] + ux * 1.5, c[1] + uy * 1.5, 1.6, 1.6);
  }
}

/** A stone block along a->b from fraction t0 to t1, `w` thick, with a shaded underside. */
function block(r: Raster, S: number, SD: number, a: V2, b: V2, t0: number, t1: number, w: number): void {
  const x0 = a[0] + (b[0] - a[0]) * t0;
  const y0 = a[1] + (b[1] - a[1]) * t0;
  const x1 = a[0] + (b[0] - a[0]) * t1;
  const y1 = a[1] + (b[1] - a[1]) * t1;
  r.seg(SD, x0, y0 + 1, x1, y1 + 1, w, w * 0.85);
  r.seg(S, x0, y0, x1, y1, w - 2.5, (w - 2.5) * 0.85);
}

/** A leg of two floating stone segments with a glowing knee gap, standing on a stepped plinth foot. */
function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  const S = back ? P.stoneD : P.stone;
  const SD = back ? P.stoneDeep : P.stoneD;
  r.seg(P.glow, hip[0], hip[1], ankle[0], ankle[1] - 2, 1.6, 1.6);
  r.seg(P.glow, hip[0], hip[1], kn[0], kn[1], 1.6, 1.6);
  block(r, S, SD, hip, kn, 0.05, 0.82, 13);
  block(r, S, SD, kn, ankle, 0.2, 0.92, 11);
  if (!back) r.ellipse(P.crystal, kn[0] + 1, kn[1], 2.4, 2.4); // a crystal knee-stud in the gap
  // a stepped plinth foot, like the base of an obelisk
  const bx = ankle[0];
  const by = ankle[1];
  r.rect(SD, bx - 7, by + 4, 20, 4);
  r.rect(back ? P.stoneDeep : P.stoneL, bx - 7, by + 4, 20, 1);
  r.rect(S, bx - 4, by - 1, 14, 5);
  r.rect(back ? P.stoneDeep : P.stoneL, bx - 4, by - 1, 14, 1);
}
