import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * Obelisk: a living obelisk. Not a squat brute but a tall, narrow monolith of granite that tapers upward to an amethyst
 * capstone (its head: a pointed pyramid with one glowing eye-slit), a geode heart glowing through a crack in its chest,
 * shards of crystal orbiting the capstone, arms of separate floating stones held together by threads of crystal light (the
 * gaps between them glow), and long tapering stone legs on pointed feet. Crystals take `armor`, deep stone `armorDark`,
 * the glow `accent`.
 */
export function drawObelisk(r: Raster, k: Skel, look: PlaceholderLook): void {
  const stone = col(look.skin);
  const crystal = col(look.armor);
  const deepStone = col(look.armorDark);
  const glow = col(look.accent);
  const P = {
    stone: r.part(stone),
    stoneL: r.part(mix(stone, [236, 228, 216], 0.3)),
    stoneD: r.part(mix(stone, deepStone, 0.55)),
    stoneDeep: r.part(mix(stone, deepStone, 0.85)),
    crack: r.part(mul(deepStone, 0.55), { flat: true }),
    rune: r.part(mix(glow, crystal, 0.3), { emissive: true, flat: true }),
    crystal: r.part(crystal),
    crystalL: r.part(mix(crystal, [255, 255, 255], 0.45)),
    crystalD: r.part(mul(crystal, 0.58)),
    glow: r.part(glow, { emissive: true }),
    core: r.part(mix(glow, [255, 255, 255], 0.5), { emissive: true }),
  };
  const T = k.torso;
  const ph = k.phase;
  const pulse = 0.5 + 0.5 * Math.sin(ph * 1.3);
  const bob = (i: number): number => Math.sin(ph * 1.1 + i * 1.7) * 1.5;

  // the monolith's footprint: narrow at the shoulders, a little wider at the hips, a pointed capstone on top
  const cx = T.x + T.w / 2;
  const topY = T.y - 2;
  const hipY = T.y + T.h;
  const shoulderHalf = T.w * 0.3;
  const hipHalf = T.w * 0.5;
  const lean = k.pose.lean * 0.6;

  // ---- back arm: floating stones joined by crystal light ----
  floatingArm(r, P, k.shB, k.elbowB, k.handB, true);

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- the body: a tapering granite shaft with carved runes and a geode heart behind a crack ----
  {
    const tl: V2 = [cx - shoulderHalf + lean, topY];
    const tr: V2 = [cx + shoulderHalf + lean, topY];
    const br: V2 = [cx + hipHalf, hipY];
    const bl: V2 = [cx - hipHalf, hipY];
    r.poly(P.stone, [tl, tr, br, bl]);
    // a shaded back face and a lit edge, so the shaft reads as a four-sided column
    r.poly(P.stoneD, [tl, [tl[0] + 6, topY], [bl[0] + 8, hipY], bl]);
    r.poly(P.stoneL, [[tr[0] - 4, topY], tr, [br[0], hipY], [br[0] - 4, hipY]]);
    // a belt of darker stone where it meets the legs
    r.poly(P.stoneDeep, [[bl[0] + 1, hipY - 7], [br[0] - 1, hipY - 7], br, bl]);
    // the crack over the heart, glowing from inside
    const hx = cx + 3 + lean * 0.5;
    const hy = topY + (hipY - topY) * 0.42;
    r.poly(P.stoneDeep, [[hx - 5, hy - 10], [hx + 1, hy - 12], [hx + 6, hy - 2], [hx + 4, hy + 10], [hx - 2, hy + 12], [hx - 6, hy + 2]]);
    r.poly(P.crystalD, [[hx - 3, hy - 7], [hx + 1, hy - 9], [hx + 4, hy - 1], [hx + 2, hy + 8], [hx - 1, hy + 9], [hx - 4, hy + 2]]);
    r.poly(P.glow, [[hx - 1, hy - 5], [hx + 2, hy - 2], [hx + 1, hy + 5], [hx - 2, hy + 2]]);
    r.ellipse(P.core, hx, hy, 1.2 + pulse, 1.4 + pulse);
    // carved runes down the shaft, faintly lit
    r.inlay(P.stone, P.rune, (set) => {
      for (let i = 0; i < 4; i++) {
        const y0 = topY + 6 + i * 7;
        if (y0 > hy - 14 && y0 < hy + 14) continue;
        for (let j = 0; j < 4; j++) set(cx - 6 + lean * 0.7, y0 + j);
        set(cx - 5 + lean * 0.7, y0 + (i % 2 ? 0 : 3));
        set(cx - 7 + lean * 0.7, y0 + (i % 2 ? 3 : 1));
      }
    });
    r.inlay(P.stone, P.crack, (set) => {
      for (let i = 0; i < 10; i++) set(hx + 6 + i * 0.5, hy + 2 + i);
      for (let i = 0; i < 6; i++) set(hx - 6 - i * 0.6, hy - 6 - i);
    });
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- the capstone: a pointed amethyst pyramid seated on the shaft, one eye-slit across it ----
  {
    const bx = cx + lean;
    const base = topY + 2;
    const half = shoulderHalf + 3;
    const tipY = base - k.head.s * 1.25;
    // a rim of dark stone the capstone sits in
    r.rect(P.stoneDeep, bx - half, base - 3, half * 2, 5);
    r.poly(P.crystal, [[bx - half, base - 2], [bx + 1, tipY], [bx + half, base - 2]]);
    r.poly(P.crystalD, [[bx - half, base - 2], [bx + 1, tipY], [bx - half * 0.15, base - 2]]); // shaded face
    r.poly(P.crystalL, [[bx + 1, tipY], [bx + half * 0.35, base - 2], [bx + half * 0.15, base - 2]]); // a lit edge
    // the eye: a glowing slit across the front face, scowling
    const ey = base - (base - tipY) * 0.38;
    r.poly(P.stoneDeep, [[bx - half * 0.3, ey - 2.5], [bx + half * 0.9, ey], [bx + half * 0.85, ey + 5], [bx - half * 0.3, ey + 3.5]]);
    r.poly(P.glow, [[bx - half * 0.1, ey - 0.5], [bx + half * 0.75, ey + 1.5], [bx + half * 0.72, ey + 3], [bx - half * 0.1, ey + 1.5]]);
    r.rect(P.core, bx + half * 0.35, ey + 1, 3, 1);
    // shards of crystal orbiting the capstone
    for (let i = 0; i < 3; i++) {
      const a = ph * 0.9 + (i * Math.PI * 2) / 3;
      const sx = bx + Math.cos(a) * (half + 7);
      const sy = (base + tipY) / 2 + Math.sin(a) * 4 + bob(i);
      const front = Math.sin(a) > 0;
      shard(r, P, sx, sy, front ? 4.5 : 3.5, front);
    }
  }

  // ---- front arm ----
  floatingArm(r, P, k.shF, k.elbowF, k.handF, false);
}

type Parts = Record<'stone' | 'stoneL' | 'stoneD' | 'stoneDeep' | 'crack' | 'rune' | 'crystal' | 'crystalL' | 'crystalD' | 'glow' | 'core', number>;

/** A small floating crystal shard (a diamond with a lit facet). */
function shard(r: Raster, P: Parts, x: number, y: number, s: number, lit: boolean): void {
  r.poly(lit ? P.crystal : P.crystalD, [[x, y - s * 1.6], [x + s, y], [x, y + s * 1.6], [x - s, y]]);
  r.poly(lit ? P.crystalL : P.crystal, [[x, y - s * 1.6], [x + s * 0.2, y], [x, y + s * 1.6], [x - s, y]]);
}

/**
 * An arm of separate stones that float apart: a shoulder stone, an upper-arm block, a forearm block and a crystal-tipped fist,
 * strung on a thread of crystal light that shows in the gaps.
 */
function floatingArm(r: Raster, P: Parts, sh: V2, el: V2, hand: V2, back: boolean): void {
  const S = back ? P.stoneDeep : P.stone;
  const SD = back ? P.stoneDeep : P.stoneD;
  // the light thread first, so the stones sit on it
  r.seg(P.glow, sh[0], sh[1], el[0], el[1], 2, 2);
  r.seg(P.glow, el[0], el[1], hand[0], hand[1], 2, 2);
  // the shoulder stone: a slab hovering just off the body
  r.poly(back ? P.stoneDeep : P.stoneL, [[sh[0] - 7, sh[1] - 6], [sh[0] + 6, sh[1] - 8], [sh[0] + 8, sh[1] + 1], [sh[0] - 6, sh[1] + 3]]);
  // upper arm and forearm: blocks along each bone, leaving a glowing gap at the elbow
  block(r, S, SD, sh, el, 0.28, 0.82, 10);
  block(r, S, SD, el, hand, 0.18, 0.7, 9);
  // the fist: a stone block with a crystal spike jutting forward from the knuckles
  let ux = hand[0] - el[0];
  let uy = hand[1] - el[1];
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  r.ellipse(SD, hand[0], hand[1], 7, 6.5);
  r.ellipse(S, hand[0] - 0.5, hand[1] - 0.5, 6, 5.5);
  const tip: V2 = [hand[0] + ux * 11, hand[1] + uy * 11];
  const px = -uy * 3;
  const py = ux * 3;
  r.poly(back ? P.crystalD : P.crystal, [[hand[0] + px, hand[1] + py], tip, [hand[0] - px, hand[1] - py]]);
  if (!back) r.seg(P.glow, hand[0], hand[1], tip[0] - ux * 2, tip[1] - uy * 2, 1, 1);
}

/** A stone block along the segment a->b, from fraction t0 to t1, `w` thick. */
function block(r: Raster, S: number, SD: number, a: V2, b: V2, t0: number, t1: number, w: number): void {
  const x0 = a[0] + (b[0] - a[0]) * t0;
  const y0 = a[1] + (b[1] - a[1]) * t0;
  const x1 = a[0] + (b[0] - a[0]) * t1;
  const y1 = a[1] + (b[1] - a[1]) * t1;
  r.seg(SD, x0, y0 + 1, x1, y1 + 1, w, w * 0.9);
  r.seg(S, x0, y0, x1, y1, w - 2, (w - 2) * 0.9);
}

/** A long tapering stone leg ending in a pointed foot, the knee a separate floating stone. */
function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  const S = back ? P.stoneDeep : P.stoneD;
  const L = back ? P.stoneDeep : P.stone;
  r.seg(P.glow, hip[0], hip[1], kn[0], kn[1], 2, 2);
  r.seg(S, hip[0], hip[1], kn[0], kn[1], 14, 11);
  r.seg(L, kn[0], kn[1] + 3, ankle[0], ankle[1], 11, 7);
  r.ellipse(back ? P.stoneDeep : P.stoneL, kn[0] + 1, kn[1], 5, 4); // the knee stone
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(S, [[bx - 6, by - 3], [bx + 5, by - 4], [bx + 16, by + 6], [bx + 14, by + 8], [bx - 7, by + 8]]);
  if (!back) r.rect(P.stoneL, bx - 5, by - 3, 10, 1);
}
