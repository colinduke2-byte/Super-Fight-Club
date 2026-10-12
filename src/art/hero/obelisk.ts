import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * Obelisk: a crystal golem. A blocky granite body speckled with mica and split by cracks, a glowing geode heart in the
 * chest, an amethyst spine of jutting crystal prisms across the shoulders and back, a small head sunk low between boulder
 * shoulders under a heavy brow with two glowing eyes, huge boulder fists with crystal growths along the forearms, and short
 * pillar legs on flat slab feet. Crystals take `armor`, deep stone `armorDark`, the glow `accent`.
 */
export function drawObelisk(r: Raster, k: Skel, look: PlaceholderLook): void {
  const stone = col(look.skin);
  const crystal = col(look.armor);
  const deepStone = col(look.armorDark);
  const glow = col(look.accent);
  const P = {
    stone: r.part(stone),
    stoneL: r.part(mix(stone, [230, 222, 210], 0.25)),
    stoneD: r.part(mix(stone, deepStone, 0.55)),
    stoneDeep: r.part(mix(stone, deepStone, 0.85)),
    crack: r.part(mul(deepStone, 0.55), { flat: true }),
    mica: r.part(mix(stone, [255, 250, 240], 0.55), { flat: true }),
    crystal: r.part(crystal),
    crystalL: r.part(mix(crystal, [255, 255, 255], 0.45)),
    crystalD: r.part(mul(crystal, 0.58)),
    glow: r.part(glow, { emissive: true }),
    core: r.part(mix(glow, [255, 255, 255], 0.5), { emissive: true }),
    eye: r.part(mix(glow, [255, 250, 255], 0.35), { emissive: true }),
  };
  const T = k.torso;
  const ph = k.phase;
  const pulse = 0.5 + 0.5 * Math.sin(ph * 1.3);

  // ---- the amethyst spine: big prisms jutting up and back from the shoulders and the upper back ----
  {
    const sx = T.x + T.w * 0.35;
    const sy = T.y + 6;
    prism(r, P, [sx - 6, sy + 10], -2.3, 40, 13, true);
    prism(r, P, [sx + 4, sy + 2], -1.98, 54, 16, true);
    prism(r, P, [sx + 15, sy + 4], -1.66, 38, 12, true);
    prism(r, P, [sx - 12, sy + 24], -2.65, 26, 9, true);
    prism(r, P, [sx + 22, sy + 8], -1.38, 22, 8, true);
  }

  // ---- back arm: boulder arm, knuckled fist ----
  {
    const el = k.elbowB;
    r.seg(P.stoneD, k.shB[0], k.shB[1], el[0], el[1], 17, 16);
    r.seg(P.stoneD, el[0], el[1], k.handB[0], k.handB[1], 16, 17);
    r.ellipse(P.stoneDeep, k.handB[0], k.handB[1] + 1, 10, 9);
    prism(r, P, [el[0] - 2, el[1] + 2], -2.4, 12, 6, true);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- torso: a granite block, broad at the shoulders, with a geode heart ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    r.poly(P.stone, [[x0 - 4, top + 4], [x0 + w + 4, top + 2], [x0 + w + 2, top + h * 0.6], [x0 + w - 4, top + h], [x0 + 4, top + h], [x0, top + h * 0.6]]);
    // shaded back face and a lit top edge
    r.poly(P.stoneD, [[x0 - 4, top + 4], [x0 + 8, top + 4], [x0 + 10, top + h], [x0 + 4, top + h], [x0, top + h * 0.6]]);
    r.rect(P.stoneL, x0 + 4, top + 3, w - 4, 3);
    // lower slab: a heavy belt of darker rock
    r.poly(P.stoneDeep, [[x0 + 2, top + h - 9], [x0 + w - 2, top + h - 10], [x0 + w - 5, top + h + 2], [x0 + 5, top + h + 2]]);
    // the geode heart: a dark rock ring opening onto glowing crystal
    const cx = x0 + w * 0.62;
    const cy = top + h * 0.58;
    r.ellipse(P.stoneDeep, cx, cy, 8, 7);
    r.ellipse(P.crystalD, cx, cy, 6, 5);
    r.poly(P.glow, [[cx - 3, cy + 2], [cx - 1, cy - 4], [cx + 3, cy - 2], [cx + 2, cy + 3]]);
    r.ellipse(P.core, cx, cy - 0.5, 1.6 + pulse, 1.6 + pulse);
    // cracks running from the heart, and mica glints
    r.inlay(P.stone, P.crack, (set) => {
      for (let i = 0; i < 12; i++) set(cx - 10 - i, cy + 2 + i * 0.7 + (i % 3 === 0 ? 1 : 0));
      for (let i = 0; i < 9; i++) set(cx + 6 + i * 0.6, cy + 8 + i);
      for (let i = 0; i < 7; i++) set(x0 + 14 + (i % 2), top + 8 + i);
    });
    r.inlay(P.stone, P.mica, (set) => {
      for (let i = 0; i < 14; i++) set(x0 + 6 + ((i * 17) % (w - 8)), top + 8 + ((i * 11) % (h - 12)));
    });
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- shoulder boulders: the front one carries a crystal cluster ----
  {
    const [bx, by] = k.shB;
    r.ellipse(P.stoneD, bx - 2, by - 2, 12, 10);
    const [sx, sy] = k.shF;
    r.ellipse(P.stoneDeep, sx - 4, sy + 1, 12, 10);
    r.ellipse(P.stone, sx - 3, sy - 1, 10.5, 8.5);
    r.ellipse(P.stoneL, sx - 7, sy - 5, 4.5, 2.2);
    prism(r, P, [sx - 6, sy - 6], -1.85, 18, 8, false);
    prism(r, P, [sx - 12, sy - 3], -2.35, 11, 5, false);
  }

  // ---- head: a small block sunk between the shoulders, heavy brow, glowing eyes, crystal crest ----
  {
    const hs = k.head.s;
    const hx = k.head.x + 2;
    const hy = k.head.y + 5; // sits low and forward, in front of the shoulder boulders
    // an irregular hewn boulder rather than a box: chipped corners, a slanted crown
    r.poly(P.stoneD, [[hx - 1, hy + 5], [hx + 4, hy - 1], [hx + hs * 0.6, hy - 2], [hx + hs - 2, hy + hs - 4], [hx + 2, hy + hs - 3]]);
    r.poly(P.stone, [[hx + 3, hy + 2], [hx + hs * 0.45, hy - 2], [hx + hs - 1, hy + 1], [hx + hs + 4, hy + hs * 0.3], [hx + hs + 3, hy + hs * 0.6], [hx + hs - 2, hy + hs - 4], [hx + 5, hy + hs - 4]]);
    r.poly(P.stoneL, [[hx + 5, hy + 2], [hx + hs * 0.45, hy - 1], [hx + hs - 2, hy + 2], [hx + hs * 0.5, hy + 4]]);
    // jaw slab, a little forward of the face
    r.poly(P.stoneDeep, [[hx + 6, hy + hs * 0.66], [hx + hs + 4, hy + hs * 0.62], [hx + hs + 2, hy + hs - 2], [hx + 6, hy + hs - 2]]);
    r.rect(P.crack, hx + hs * 0.5, hy + hs * 0.68, hs * 0.5, 1);
    // brow ridge overhanging the eyes, scowling down at the front
    r.poly(P.stoneL, [[hx + 2, hy + 3], [hx + hs + 5, hy + hs * 0.22], [hx + hs + 5, hy + hs * 0.36], [hx + 2, hy + hs * 0.26]]);
    r.rect(P.stoneDeep, hx + hs * 0.42, hy + hs * 0.34, hs * 0.64, hs * 0.22); // deep-set eye socket under the brow
    r.poly(P.eye, [[hx + hs * 0.48, hy + hs * 0.38], [hx + hs * 0.7, hy + hs * 0.41], [hx + hs * 0.68, hy + hs * 0.52], [hx + hs * 0.48, hy + hs * 0.5]]);
    r.poly(P.eye, [[hx + hs * 0.8, hy + hs * 0.42], [hx + hs + 2, hy + hs * 0.45], [hx + hs + 1, hy + hs * 0.54], [hx + hs * 0.8, hy + hs * 0.52]]);
    // a small crystal crest growing out of the crown
    prism(r, P, [hx + hs * 0.28, hy + 1], -1.95, 16, 7, false);
    prism(r, P, [hx + hs * 0.55, hy], -1.45, 11, 5, false);
  }

  // ---- front arm: boulder upper arm, a forearm crusted with crystal, a huge fist ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    const hand = k.handF;
    r.seg(P.stone, sx, sy + 2, el[0], el[1], 18, 17);
    r.seg(P.stone, el[0], el[1], hand[0], hand[1], 17, 19);
    r.seg(P.stoneD, el[0], el[1] + 3, hand[0], hand[1] + 3, 6, 6);
    // crystal growths along the outside of the forearm, pointing back up the arm
    let ux = hand[0] - el[0];
    let uy = hand[1] - el[1];
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul;
    uy /= ul;
    const back = Math.atan2(-uy, -ux);
    for (let i = 0; i < 3; i++) {
      const t = 0.25 + i * 0.25;
      const bx = el[0] + (hand[0] - el[0]) * t - uy * 6;
      const by = el[1] + (hand[1] - el[1]) * t + ux * 6 - 2;
      prism(r, P, [bx, by], back - 0.7 + i * 0.12, 11 - i * 1.5, 5, false);
    }
    // knuckled boulder fist
    r.ellipse(P.stoneDeep, hand[0] + 1, hand[1] + 1, 11, 10);
    r.ellipse(P.stone, hand[0], hand[1], 10, 9);
    for (let i = 0; i < 3; i++) r.rect(P.crack, hand[0] + 2 + i * 3, hand[1] - 6, 1, 7);
    r.ellipse(P.stoneL, hand[0] - 3, hand[1] - 4, 3.5, 2);
  }
}

type Parts = Record<'stone' | 'stoneL' | 'stoneD' | 'stoneDeep' | 'crack' | 'mica' | 'crystal' | 'crystalL' | 'crystalD' | 'glow' | 'core' | 'eye', number>;

/** A hexagonal crystal prism from `base` in direction `ang` (radians, screen space), `len` long and `wid` wide: lit and shaded facets and a pointed tip. */
function prism(r: Raster, P: Parts, base: V2, ang: number, len: number, wid: number, back: boolean): void {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const px = -uy;
  const py = ux;
  const hw = wid / 2;
  const shaft = len * 0.72;
  const b0: V2 = [base[0] + px * hw, base[1] + py * hw];
  const b1: V2 = [base[0] - px * hw, base[1] - py * hw];
  const s0: V2 = [b0[0] + ux * shaft, b0[1] + uy * shaft];
  const s1: V2 = [b1[0] + ux * shaft, b1[1] + uy * shaft];
  const tip: V2 = [base[0] + ux * len, base[1] + uy * len];
  r.poly(back ? P.crystalD : P.crystal, [b0, s0, tip, s1, b1]);
  // a lit facet down one side and a bright edge to the tip
  const m0: V2 = [base[0] + px * hw * 0.1, base[1] + py * hw * 0.1];
  const m1: V2 = [m0[0] + ux * shaft, m0[1] + uy * shaft];
  r.poly(back ? P.crystal : P.crystalL, [b1, s1, tip, m1, m0]);
  r.seg(P.glow, m0[0] + ux * len * 0.2, m0[1] + uy * len * 0.2, m1[0], m1[1], 1, 1);
}

/** A short pillar leg of stacked stone, a flat slab foot. */
function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  const c = back ? P.stoneDeep : P.stoneD;
  r.seg(c, hip[0], hip[1], kn[0], kn[1], 22, 21);
  r.seg(back ? P.stoneDeep : P.stone, kn[0], kn[1], ankle[0], ankle[1], 21, 19);
  if (!back) {
    r.ellipse(P.stoneL, kn[0] + 2, kn[1] - 1, 6, 4); // knee stone
    r.rect(P.crack, ankle[0] - 6, ankle[1] - 9, 12, 1);
  }
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(back ? P.stoneDeep : P.stoneD, [[bx - 11, by - 4], [bx + 11, by - 5], [bx + 15, by + 2], [bx + 15, by + 8], [bx - 12, by + 8]]);
  r.rect(back ? P.crack : P.stoneL, bx - 8, by - 4, 18, 2);
}
