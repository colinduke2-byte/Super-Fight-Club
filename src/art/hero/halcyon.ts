import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import { solveLimb, type Skel } from './skeleton';

const rad = (d: number): number => (d * Math.PI) / 180;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Halcyon: a storm-winged lancer. Feathered wings (folded on the ground, flared in the air, spread to glide), a long gold-bladed spear
 * held two-handed along an aim axis, silver cuirass with gold trim, azure pteruges skirt, winged boots and a winged helm with a streaming ponytail.
 */
export function drawHalcyon(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.55);
  const gold = col(look.accent);
  const goldL = mix(gold, [255, 250, 220], 0.55);
  const skin = col(look.skin);
  const azure: RGB = [58, 126, 216];
  const feather: RGB = [246, 249, 255];
  const featherU: RGB = [172, 196, 232];
  const P = {
    armor: r.part(armor),
    light: r.part(mix(armor, [255, 255, 255], 0.35)),
    dark: r.part(dark),
    deep: r.part(deep),
    gold: r.part(gold),
    goldL: r.part(goldL, { flat: true }),
    goldFlat: r.part(gold, { flat: true }),
    skin: r.part(skin, { soft: true }),
    hair: r.part([246, 226, 160], { soft: true }),
    hairD: r.part([205, 176, 108], { soft: true }),
    azure: r.part(azure, { soft: true }),
    azureD: r.part(mul(azure, 0.66), { soft: true }),
    feather: r.part(feather, { soft: true }),
    featherU: r.part(featherU, { soft: true }),
    featherF: r.part(mix(featherU, [90, 120, 190], 0.5), { soft: true }),
    covert: r.part(mix(feather, azure, 0.28), { soft: true }),
    bone: r.part(mul(armor, 0.8)),
    steel: r.part([226, 234, 248]),
    shaft: r.part([92, 76, 120]),
    glow: r.part(goldL, { emissive: true }),
    eye: r.part([70, 150, 255], { emissive: true }),
    ribbon: r.part([255, 96, 120], { soft: true }),
    seam: r.part(deep, { flat: true }),
  };
  const T = k.torso;
  const ph = k.phase;
  const wingAmt = k.pose.wing ?? 0.2;
  const flap = Math.sin(ph * 1.7) * (wingAmt > 0.5 ? 1 : 0.35);
  const aim = rad(k.pose.aim ?? -78);
  const u: V2 = [Math.cos(aim), Math.sin(aim)];
  const sway = (i: number, a = 2): number => Math.sin(ph * 1.2 + i * 0.8) * a;

  // ---- wings (behind everything): far wing darker, near wing brighter ----
  const root: V2 = [T.x + 10, T.y + 8];
  wing(r, P, [root[0] + 5, root[1] - 3], wingAmt * 0.94, flap * 0.8 + 0.1, true, ph);
  wing(r, P, root, wingAmt, flap, false, ph);

  // ---- grips: the front hand holds the spear, the back hand grips along the shaft ----
  const G = k.handF;
  const bg: V2 = [G[0] - u[0] * 34, G[1] - u[1] * 34];
  const aB = solveLimb(k.shB, bg, k.armBone, 1);

  // ---- back leg + boot ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true, ph);

  // ---- pteruges: azure leather strips hanging from the belt ----
  for (let i = 0; i < 5; i++) {
    const bx = T.x + 4 + i * ((T.w - 8) / 4);
    const by = T.y + T.h - 4;
    const len = 20 + (i % 2) * 4;
    r.poly(P.azureD, [[bx - 4, by], [bx + 5, by], [bx + 4 + sway(i, 1.5), by + len], [bx - 3 + sway(i, 1.5), by + len + 2]]);
  }

  // ---- back arm ----
  r.seg(P.armor, k.shB[0], k.shB[1], aB.mid[0], aB.mid[1], 10, 9);
  r.seg(P.dark, aB.mid[0], aB.mid[1], aB.end[0], aB.end[1], 9, 8);

  // ---- torso: silver cuirass, gold trim, feather relief ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    r.poly(P.armor, [[x0 + 3, top + 2], [x0 + w - 3, top + 2], [x0 + w + 2, top + 10], [x0 + w - 6, top + h - 2], [x0 + 7, top + h - 2], [x0 - 2, top + 10]]);
    r.poly(P.dark, [[x0 - 2, top + 10], [x0 + 3, top + 2], [x0 + 9, top + 3], [x0 + 11, top + h - 4], [x0 + 7, top + h - 2]]);
    r.poly(P.light, [[x0 + 12, top + 4], [x0 + w - 6, top + 4], [x0 + w - 3, top + 14], [x0 + w - 12, top + h - 12], [x0 + 14, top + h - 12]]);
    // gold feather relief on the breastplate
    for (let i = 0; i < 3; i++) {
      const fx = x0 + 17 + i * 5;
      r.poly(P.goldFlat, [[fx, top + 8 + i * 2], [fx + 3, top + 8 + i * 2], [fx + 2, top + 22 + i], [fx + 1, top + 23 + i]]);
    }
    r.rect(P.seam, x0 + w / 2 + 6, top + 6, 1, 18);
    // gorget, belt and clasp
    r.rect(P.gold, x0 + 8, top, w - 12, 5);
    r.rect(P.deep, x0 + 3, top + h - 8, w - 6, 7);
    r.rect(P.gold, x0 + 3, top + h - 8, w - 6, 1);
    r.ellipse(P.glow, x0 + w / 2 + 3, top + h - 5, 4, 4);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false, ph);

  // ---- head: winged helm, streaming ponytail, determined face ----
  {
    const hx = k.head.x;
    const hy = k.head.y - 5;
    const hs = k.head.s;
    r.rect(P.skin, hx + 8, T.y - 12, hs - 14, 14); // neck
    r.rect(P.gold, hx + 6, T.y - 2, hs - 10, 3); // gorget ring
    // ponytail
    const run = k.pose.lean > 2 ? 1 : 0;
    let px = hx + 2;
    let py = hy + 8;
    for (let i = 0; i < 8; i++) {
      const x = px - 4 - run * 2;
      const y = py + 2.5 + sway(i, 1.8) - run * 0.6;
      r.seg(i % 3 === 2 ? P.hairD : P.hair, px, py, x, y, 9 - i * 0.7, 8 - i * 0.7);
      px = x;
      py = y;
    }
    // face
    r.rect(P.skin, hx + 6, hy + 4, hs - 4, hs - 6);
    r.rect(P.skin, hx + hs - 2, hy + 12, 3, 6); // nose
    r.rect(P.eye, hx + hs - 9, hy + 11, 6, 3);
    r.rect(P.deep, hx + hs - 11, hy + 8, 9, 2); // brow
    r.rect(P.seam, hx + hs - 7, hy + hs - 7, 5, 1); // mouth
    // helm: dome, cheek guard, gold circlet
    r.poly(P.armor, [[hx + 2, hy + 10], [hx + 6, hy], [hx + hs - 2, hy - 2], [hx + hs + 3, hy + 6], [hx + hs - 4, hy + 8], [hx + 8, hy + 8]]);
    r.poly(P.light, [[hx + 6, hy + 1], [hx + hs - 2, hy - 1], [hx + hs - 4, hy + 3], [hx + 8, hy + 4]]);
    r.poly(P.armor, [[hx + 2, hy + 10], [hx + 10, hy + 6], [hx + 12, hy + hs - 6], [hx + 4, hy + hs - 2]]); // cheek/ear guard
    r.rect(P.gold, hx + 2, hy + 7, hs + 2, 3);
    // wing fins at the temple
    for (let i = 0; i < 3; i++) {
      const fy = hy + 4 + i * 3;
      r.seg(i === 1 ? P.feather : P.featherU, hx + 4, fy, hx - 16 - i * 3 - sway(i, 2), fy - 7 + i * 3, 5, 2);
    }
    r.ellipse(P.glow, hx + hs - 4, hy + 8, 2, 2);
  }

  // ---- the spear ----
  {
    const butt: V2 = [G[0] - u[0] * 52, G[1] - u[1] * 52];
    const tip: V2 = [G[0] + u[0] * 88, G[1] + u[1] * 88];
    const nx = -u[1];
    const ny = u[0];
    r.seg(P.shaft, butt[0], butt[1], tip[0] - u[0] * 20, tip[1] - u[1] * 20, 4.5, 4);
    for (const t of [0.12, 0.38, 0.66]) {
      const bx = lerp(butt[0], tip[0], t);
      const by = lerp(butt[1], tip[1], t);
      r.ellipse(P.goldFlat, bx, by, 3, 3);
    }
    r.ellipse(P.gold, butt[0], butt[1], 3.5, 3.5);
    // leaf-shaped head
    const b0: V2 = [tip[0] - u[0] * 24, tip[1] - u[1] * 24];
    const m0: V2 = [tip[0] - u[0] * 12, tip[1] - u[1] * 12];
    r.poly(P.steel, [[b0[0], b0[1]], [m0[0] + nx * 6, m0[1] + ny * 6], [tip[0], tip[1]], [m0[0] - nx * 6, m0[1] - ny * 6]]);
    r.seg(P.goldFlat, b0[0], b0[1], tip[0] - u[0] * 2, tip[1] - u[1] * 2, 1.4, 1);
    r.rect(P.gold, b0[0] - 4, b0[1] - 3, 8, 6); // socket
    r.ellipse(P.glow, m0[0], m0[1], 2.2, 2.2);
    // streaming ribbon below the head
    let rx = b0[0];
    let ry = b0[1];
    for (let i = 0; i < 6; i++) {
      const nxp = rx - u[0] * 3 - 4 + sway(i, 2.2);
      const nyp = ry - u[1] * 3 + 3 + sway(i + 2, 2);
      r.seg(P.ribbon, rx, ry, nxp, nyp, 5 - i * 0.5, 4.5 - i * 0.5);
      rx = nxp;
      ry = nyp;
    }
    // back hand over the shaft
    r.ellipse(P.gold, bg[0], bg[1], 5.5, 5.5);
    r.ellipse(P.skin, bg[0], bg[1], 3.5, 3.5);
  }

  // ---- front arm: pauldron, vambrace, gauntlet ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    r.seg(P.armor, sx, sy, el[0], el[1], 11, 9);
    r.seg(P.armor, el[0], el[1], G[0], G[1], 9, 8);
    r.seg(P.gold, el[0] + (G[0] - el[0]) * 0.35, el[1] + (G[1] - el[1]) * 0.35, el[0] + (G[0] - el[0]) * 0.6, el[1] + (G[1] - el[1]) * 0.6, 10, 10);
    r.ellipse(P.gold, G[0], G[1], 6, 6);
    r.ellipse(P.skin, G[0], G[1], 3.8, 3.8);
    // feather-layered pauldron
    r.ellipse(P.deep, sx + 1, sy - 1, 10, 7);
    r.ellipse(P.armor, sx, sy - 2, 9, 6);
    r.ellipse(P.light, sx - 1, sy - 4, 6, 3);
    r.rect(P.gold, sx - 9, sy + 2, 18, 2);
    for (let i = 0; i < 3; i++) r.rect(P.goldFlat, sx - 5 + i * 4, sy - 5, 1, 5);
  }
}

type Parts = Record<'armor' | 'light' | 'dark' | 'deep' | 'gold' | 'goldL' | 'goldFlat' | 'skin' | 'hair' | 'hairD' | 'azure' | 'azureD' | 'feather' | 'featherU' | 'featherF' | 'covert' | 'bone' | 'steel' | 'shaft' | 'glow' | 'eye' | 'ribbon' | 'seam', number>;

/** A leaf-shaped feather from `a` to `b`, widest about 40% along. */
function featherPoly(r: Raster, part: number, a: V2, b: V2, w: number): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const m: V2 = [a[0] + dx * 0.42, a[1] + dy * 0.42];
  const q: V2 = [a[0] + dx * 0.8, a[1] + dy * 0.8];
  r.poly(part, [[a[0] + nx * w * 0.3, a[1] + ny * w * 0.3], [m[0] + nx * w * 0.5, m[1] + ny * w * 0.5], [q[0] + nx * w * 0.32, q[1] + ny * w * 0.32], [b[0], b[1]], [q[0] - nx * w * 0.3, q[1] - ny * w * 0.3], [m[0] - nx * w * 0.5, m[1] - ny * w * 0.5], [a[0] - nx * w * 0.3, a[1] - ny * w * 0.3]]);
}

/** One wing: a bone from the shoulder to the wrist and a fan of feathers; `spread` 0 folded .. 1 open, `flap` -1..1 (up/down stroke). */
function wing(r: Raster, P: Parts, A: V2, spread: number, flap: number, far: boolean, ph: number): void {
  const s = Math.max(0, Math.min(1.15, spread));
  const wristFold: V2 = [-10, -46];
  const wristOpen: V2 = [-50, -22 - flap * 16];
  const wrist: V2 = [A[0] + lerp(wristFold[0], wristOpen[0], Math.min(1, s)), A[1] + lerp(wristFold[1], wristOpen[1], Math.min(1, s)) - flap * 4];
  r.seg(P.bone, A[0], A[1], wrist[0], wrist[1], 7, 5);
  const N = 9;
  const main = far ? P.featherU : P.feather;
  // secondaries first (inner, behind), then primaries (outer, in front)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1); // 0 = outermost primary, 1 = innermost secondary
      const primary = i < 5;
      if ((pass === 0) === primary) continue;
      const angFold = 98 + t * 54;
      const angOpen = 222 - t * 98;
      const ang = rad(lerp(angFold, angOpen, Math.min(1, s)) + flap * 16 + Math.sin(ph * 1.3 + i) * 2.5);
      const len = lerp(lerp(88, 58, t), lerp(104, 64, t), Math.min(1, s)) * (far ? 0.92 : 1);
      const rootT = primary ? 0 : ((t - 0.4) / 0.6) * 0.85;
      const rx = lerp(wrist[0], A[0], rootT);
      const ry = lerp(wrist[1], A[1], rootT);
      const tx = rx + Math.cos(ang) * len;
      const ty = ry + Math.sin(ang) * len;
      featherPoly(r, i % 2 ? P.featherU : main, [rx, ry], [tx, ty], 17 - t * 4);
      if (!far) {
        r.seg(P.featherF, rx + (tx - rx) * 0.15, ry + (ty - ry) * 0.15 + 3, rx + (tx - rx) * 0.7, ry + (ty - ry) * 0.7 + 3, 2.5, 1.5);
        r.rect(P.goldFlat, tx - 1, ty - 1, 3, 3);
      }
    }
  }
  // coverts along the arm
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const bx = lerp(wrist[0], A[0], t * 0.9);
    const by = lerp(wrist[1], A[1], t * 0.9);
    const ang = rad(lerp(98, 222, Math.min(1, s)) - t * 40 + flap * 14);
    featherPoly(r, far ? P.featherF : P.covert, [bx, by], [bx + Math.cos(ang) * 34, by + Math.sin(ang) * 34], 15);
  }
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean, ph: number): void {
  r.seg(back ? P.deep : P.armor, hip[0], hip[1], kn[0], kn[1], 15, 12);
  r.seg(back ? P.dark : P.armor, kn[0], kn[1], ankle[0], ankle[1], 12, 9);
  if (!back) {
    r.ellipse(P.gold, kn[0] + 3, kn[1], 5.5, 5.5); // knee cop
    r.rect(P.goldFlat, kn[0] - 4, kn[1] + 8, 9, 1);
  }
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(back ? P.deep : P.azureD, [[bx - 7, by - 9], [bx + 7, by - 9], [bx + 7, by - 2], [bx + 17, by + 4], [bx + 17, by + 8], [bx - 8, by + 8]]);
  r.rect(P.gold, bx - 8, by - 10, 15, 3);
  r.rect(P.deep, bx - 8, by + 7, 26, 2);
  // little ankle wings flicking back
  for (let i = 0; i < 3; i++) r.seg(i === 1 ? P.feather : P.featherU, bx - 6, by - 6 + i * 2, bx - 22 - i * 3 - Math.sin(ph * 1.8 + i) * 2, by - 12 + i * 3, 5, 2);
}
