import type { PlaceholderLook } from '../../engine/types';
import { drawFace } from './face';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import { drape, solveLimb, type Skel } from './skeleton';

const rad = (d: number): number => (d * Math.PI) / 180;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Halcyon: a storm-winged lancer. Feathered wings (folded on the ground, flared in the air, spread to glide), a long gold-bladed spear
 * held two-handed along an aim axis, silver cuirass with gold trim, azure pteruges skirt, winged boots and a winged helm with a streaming ponytail.
 */
export function drawHalcyon(r: Raster, k0: Skel, look: PlaceholderLook): void {
  // limb ends pulled inside the frame so a gauntlet is never cut off at an edge
  const fit = (q: V2, mx: number, top: number, bot: number): V2 => [Math.max(mx, Math.min(k0.W - mx, q[0])), Math.max(top, Math.min(k0.H - bot, q[1]))];
  const k: Skel = { ...k0, handF: fit(k0.handF, 12, 12, 12), handB: fit(k0.handB, 12, 12, 12), elbowF: fit(k0.elbowF, 9, 10, 10), elbowB: fit(k0.elbowB, 9, 10, 10) };
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.55);
  const gold = col(look.accent);
  // every lit or painted part is held clear of the glow colours; only the parts made emissive on purpose bloom
  // (a pale lit part that would have to grey right down to clear the bloom white is painted flat instead: a flat white
  // only has to keep its own colour clear, so it can stay white)
  const part = (c: RGB, o: { emissive?: boolean; flat?: boolean; soft?: boolean; lean?: RGB } = {}): number => {
    if (o.emissive) return r.part(c, o);
    const k = keepClear(c, gold, o);
    if (k.steps > 3 && !o.flat && c[0] + c[1] + c[2] > 600) return r.part(keepClear(c, gold, { flat: true }).c, { flat: true });
    return r.part(k.c, { flat: o.flat, soft: o.soft });
  };
  const goldL = mix(gold, [255, 250, 220], 0.55);
  const skin = col(look.skin);
  // outfits: 1 = Valkyrie (crested helm with a horsehair plume, a cape, braids), 2 = Raven (black wings, hood and beak mask)
  const o = look.outfit ?? 0;
  const azure: RGB = o === 2 ? mix(dark, [40, 40, 60], 0.4) : [58, 126, 216];
  const feather: RGB = o === 2 ? [92, 92, 112] : [246, 249, 255];
  const featherU: RGB = o === 2 ? [52, 52, 68] : [172, 196, 232];
  const P = {
    armor: part(armor),
    light: part(mix(armor, [255, 255, 255], 0.35)),
    dark: part(dark),
    deep: part(deep),
    gold: part(gold, { lean: [150, 116, 36] }), // burnished: a deeper gold than the glowing accent, same hue
    goldL: part(goldL, { flat: true, lean: [214, 186, 112] }),
    goldFlat: part(gold, { flat: true, lean: [150, 116, 36] }),
    skin: part(skin, { soft: true }),
    skinD: part(mul(skin, 0.8), { soft: true }),
    sclera: part([246, 246, 255], { flat: true }),
    line: part(mul(skin, 0.4), { flat: true }),
    iris: part([60, 130, 235], { flat: true }),
    hair: part([246, 226, 160], { soft: true }),
    hairD: part([205, 176, 108], { soft: true }),
    azure: part(azure, { soft: true }),
    azureD: part(mul(azure, 0.66), { soft: true }),
    feather: part(feather, { soft: true }),
    featherU: part(featherU, { soft: true }),
    featherF: part(mix(featherU, [90, 120, 190], 0.5), { soft: true }),
    covert: part(mix(feather, azure, 0.28), { soft: true }),
    bone: part(mul(armor, 0.8)),
    steel: part([226, 234, 248]),
    shaft: part([92, 76, 120]),
    glow: part(goldL, { emissive: true }),
    eye: part([70, 150, 255], { emissive: true }),
    ribbon: part([255, 96, 120], { soft: true }),
    seam: part(deep, { flat: true }),
  };
  const T = k.torso;
  const ph = k.phase;
  const wingAmt = k.pose.wing ?? 0.2;
  const flap = Math.sin(ph * 1.7) * (wingAmt > 0.5 ? 1 : 0.35);
  const aim = rad(k.pose.aim ?? -78);
  const u: V2 = [Math.cos(aim), Math.sin(aim)];
  const sway = (i: number, a = 2): number => Math.sin(ph * 1.2 + i * 0.8) * a;
  const plume = part(mix(gold, [220, 40, 50], 0.6), { soft: true });
  const plumeD = part(mul(mix(gold, [220, 40, 50], 0.6), 0.7), { soft: true });
  const beak = part(mix([226, 216, 196], gold, 0.15));
  const beakD = part(mul(mix([226, 216, 196], gold, 0.15), 0.7));

  // ---- wings (behind everything): far wing darker, near wing brighter ----
  const root: V2 = [T.x + 10, T.y + 8];
  wing(r, P, [root[0] + 5, root[1] - 3], wingAmt * 0.94, flap * 0.8 + 0.1, true, ph);
  wing(r, P, root, wingAmt, flap, false, ph);
  if (o === 1) {
    // a short battle cape from the shoulders, blown back
    const run = k.pose.lean > 2 ? 1 : 0;
    const top = T.y + 2;
    const hem = T.y + T.h + 18;
    // hanging along the pose's gravity from the shoulder line (spread on the floor when she is knocked down)
    const hang = (pts: V2[]): V2[] => pts.map(([x, y]) => {
      const [u, v] = drape(k, x - (T.x + 8), y - top);
      return [T.x + 8 + u, top + v];
    });
    r.poly(plumeD, hang([[T.x + 2, top], [T.x + 14, top], [T.x + 6 - run * 14 + sway(1, 2), hem], [T.x - 12 - run * 18 + sway(2, 3), hem + 4], [T.x - 4, top + 8]]));
    r.poly(plume, hang([[T.x + 4, top], [T.x + 12, top], [T.x + 4 - run * 12 + sway(1, 2), hem - 4], [T.x - 4 - run * 14 + sway(2, 2), hem - 2]]));
  }

  // a shadowed fold where the wings meet the back, so the white plumage never melts into the silver cuirass
  r.seg(P.featherF, T.x - 1, T.y + 2, T.x - 2, T.y + T.h - 4, 10, 8);

  // ---- grips: the front hand holds the spear, the back hand grips along the shaft ----
  const G = k.handF;
  // the shaft is foreshortened rather than cut off where it would leave the frame (or sink through the floor)
  const reach = (sgn: number, want: number, m: number, floor: number): number => {
    let L = want;
    const ok = (t: number): boolean => {
      const x = G[0] + u[0] * t * sgn;
      const y = G[1] + u[1] * t * sgn;
      return x >= m && x <= r.w - m && y >= m && y <= r.h - floor;
    };
    while (L > 4 && !ok(L)) L -= 1;
    return L;
  };
  // the back hand slides up the shaft when the butt end is short (a low grip near the floor)
  const backL = reach(-1, 52, 10, 13);
  let bgL = Math.max(10, Math.min(34, backL - 8));
  const inGrip = (t: number): boolean => G[1] - u[1] * t <= r.h - 12 && G[0] - u[0] * t >= 12 && G[0] - u[0] * t <= r.w - 12 && G[1] - u[1] * t >= 12;
  while (bgL > 6 && !inGrip(bgL)) bgL -= 1;
  const bg: V2 = fit([G[0] - u[0] * bgL, G[1] - u[1] * bgL], 12, 12, 12);
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
  r.seg(P.azureD, k.shB[0], k.shB[1], aB.mid[0], aB.mid[1], 10, 9); // azure undersleeve: a second material between the silver plates
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
    // ponytail (Valkyrie: two braids; Raven: hidden under the hood)
    const run = k.pose.lean > 2 ? 1 : 0;
    let px = hx + 2;
    let py = hy + 8;
    for (let i = 0; i < (o === 2 ? 0 : 8); i++) {
      const [ox, oy] = drape(k, -4 - run * 2, 2.5 + sway(i, 1.8) - run * 0.6); // falls with the pose's gravity
      const x = px + ox;
      const y = py + oy;
      r.seg(i % 3 === 2 ? P.hairD : P.hair, px, py, x, y, 9 - i * 0.7, 8 - i * 0.7);
      px = x;
      py = y;
    }
    // face
    drawFace(r, { skin: P.skin, skinD: P.skinD, eye: P.sclera, pupil: P.iris, line: P.line }, hx + 6, hy + 6, hs - 4, hs - 6, { grim: 0.5 });
    if (o === 2) {
      // Raven: a feathered hood and a long curved beak mask over the face, one eye glinting
      r.ellipse(P.featherF, hx + hs / 2 + 1, hy + hs / 2 + 1, hs / 2 + 7, hs / 2 + 6);
      r.ellipse(P.feather, hx + hs / 2 + 2, hy + hs / 2 - 1, hs / 2 + 5, hs / 2 + 4);
      for (let i = 0; i < 4; i++) featherPoly(r, i % 2 ? P.featherU : P.feather, [hx + 2, hy + 4 + i * 4], [hx - 14 - i * 2 - sway(i, 1.5), hy + 10 + i * 6], 7);
      // the hood's opening, and a pale bone beak mask filling it: brow plate, a dark socket with the eye glinting, and a long curved beak
      r.ellipse(P.deep, hx + hs / 2 + 5, hy + hs / 2 + 2, hs / 2 - 1, hs / 2 - 2);
      r.poly(beak, [[hx + 8, hy + 6], [hx + hs - 2, hy + 4], [hx + hs + 4, hy + 8], [hx + hs + 3, hy + hs - 4], [hx + hs - 6, hy + hs], [hx + 10, hy + hs - 2]]);
      r.poly(beakD, [[hx + 8, hy + 12], [hx + 12, hy + 10], [hx + 14, hy + hs - 2], [hx + 10, hy + hs - 2]]);
      r.ellipse(P.deep, hx + hs - 4, hy + 11, 4, 3.4);
      r.ellipse(P.eye, hx + hs - 3, hy + 11, 2.2, 2);
      r.rect(P.glow, hx + hs - 3, hy + 10, 1, 1);
      r.poly(beak, [[hx + hs - 1, hy + 13], [hx + hs + 6, hy + 13], [hx + hs + 20, hy + hs + 4], [hx + hs + 4, hy + hs], [hx + hs - 3, hy + hs - 2]]);
      r.poly(beakD, [[hx + hs + 1, hy + hs - 3], [hx + hs + 12, hy + hs + 0.5], [hx + hs + 20, hy + hs + 4], [hx + hs + 4, hy + hs]]);
      r.seg(P.goldFlat, hx + hs + 1, hy + 14, hx + hs + 17, hy + hs + 2, 1, 1);
    } else {
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
    if (o === 1) {
      // a tall crest along the helm and a horsehair plume streaming back from it
      r.poly(P.gold, [[hx + 2, hy + 2], [hx + hs / 2 + 2, hy - 8], [hx + hs, hy - 2]]);
      let qx = hx + hs / 2 + 2;
      let qy = hy - 8;
      for (let i = 0; i < 9; i++) {
        const [ox, oy] = drape(k, -4.2 - run * 1.5, (i < 3 ? -1.2 : 2.4) + sway(i + 4, 1.4));
        const x = qx + ox;
        const y = qy + oy;
        r.seg(i % 3 === 2 ? plumeD : plume, qx, qy, x, y, 8 - i * 0.6, 7 - i * 0.6);
        qx = x;
        qy = y;
      }
    }
    }
  }

  // ---- the spear ----
  {
    const butt: V2 = [G[0] - u[0] * backL, G[1] - u[1] * backL];
    const tipL = reach(1, 88, 10, 12);
    const tip: V2 = [G[0] + u[0] * tipL, G[1] + u[1] * tipL];
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
      const [gx, gy] = drape(k, -4 + sway(i, 2.2), 3 + sway(i + 2, 2)); // the sag follows the pose's gravity
      const nxp = Math.max(7, Math.min(r.w - 7, rx - u[0] * 3 + gx));
      const nyp = Math.max(7, Math.min(r.h - 9, ry - u[1] * 3 + gy));
      r.seg(P.ribbon, rx, ry, nxp, nyp, 5 - i * 0.5, 4.5 - i * 0.5);
      rx = nxp;
      ry = nyp;
    }
    // back hand over the shaft
    gauntlet(r, P, bg, u, aB.mid, true);
  }

  // ---- front arm: pauldron, vambrace, gauntlet ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    // a dark backing a little wider than the arm cuts it out of the cuirass behind it
    r.seg(P.deep, sx, sy + 1, el[0], el[1] + 1, 13, 11);
    r.seg(P.deep, el[0], el[1] + 1, G[0], G[1] + 1, 11, 10);
    // an azure sleeve on the upper arm (the same cloth as the leggings), so the arm parts from the silver cuirass and
    // the white wings instead of joining one pale mass; the plate starts at the elbow
    r.seg(P.azure, sx, sy, el[0], el[1], 11, 9);
    r.seg(P.azureD, sx + (el[0] - sx) * 0.55 + 2, sy + (el[1] - sy) * 0.55 + 2, el[0] + 1, el[1] + 2, 3, 3);
    r.seg(P.light, el[0], el[1], G[0], G[1], 9, 8);
    // vambrace: two thin gold bands round the forearm (the cuff at the wrist carries the colour)
    {
      let dx = G[0] - el[0];
      let dy = G[1] - el[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      for (const t of [0.32, 0.5]) {
        const mx = el[0] + (G[0] - el[0]) * t;
        const my = el[1] + (G[1] - el[1]) * t;
        r.seg(P.goldFlat, mx + dy * 5, my - dx * 5, mx - dy * 5, my + dx * 5, 1.6, 1.6);
      }
    }
    gauntlet(r, P, G, u, el, false);
    // feather-layered pauldron
    r.ellipse(P.deep, sx + 1, sy - 1, 10, 7);
    r.ellipse(P.armor, sx, sy - 2, 9, 6);
    r.ellipse(P.light, sx - 1, sy - 4, 6, 3);
    r.rect(P.gold, sx - 9, sy + 2, 18, 2);
    for (let i = 0; i < 3; i++) r.rect(P.goldFlat, sx - 5 + i * 4, sy - 5, 1, 5);
  }
}

/**
 * An armoured gauntlet closed round the spear shaft: a gold cuff on the wrist, the fist in silver plate with the
 * knuckle ridge across the shaft and bare fingertips curled under it.
 */
function gauntlet(r: Raster, P: Parts, g: V2, u: V2, el: V2, back: boolean): void {
  let dx = g[0] - el[0];
  let dy = g[1] - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  r.seg(back ? P.goldFlat : P.gold, g[0] - dx * 7, g[1] - dy * 7, g[0] - dx * 3, g[1] - dy * 3, 9, 9); // cuff
  r.ellipse(back ? P.dark : P.armor, g[0], g[1], 5.6, 5.6); // fist
  // fingers wrapped round the shaft: three skin knuckles stepping along it
  for (let i = -1; i <= 1; i++) r.ellipse(back ? P.skinD : P.skin, g[0] + u[0] * i * 2.6 + dx * 2.4, g[1] + u[1] * i * 2.6 + dy * 2.4, 1.7, 1.7);
  r.seg(P.seam, g[0] - u[0] * 4, g[1] - u[1] * 4, g[0] + u[0] * 4, g[1] + u[1] * 4, 1, 1); // knuckle ridge
}

type Parts = Record<'skinD' | 'sclera' | 'line' | 'iris' | 'armor' | 'light' | 'dark' | 'deep' | 'gold' | 'goldL' | 'goldFlat' | 'skin' | 'hair' | 'hairD' | 'azure' | 'azureD' | 'feather' | 'featherU' | 'featherF' | 'covert' | 'bone' | 'steel' | 'shaft' | 'glow' | 'eye' | 'ribbon' | 'seam', number>;

/** How far a ray from (x, y) at angle `ang` can run before it comes within `m` px of the frame edge. */
function fitLen(r: Raster, x: number, y: number, ang: number, m: number): number {
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  let L = 999;
  if (c < -1e-3) L = Math.min(L, (x - m) / -c);
  if (c > 1e-3) L = Math.min(L, (r.w - m - x) / c);
  if (sn < -1e-3) L = Math.min(L, (y - m) / -sn);
  if (sn > 1e-3) L = Math.min(L, (r.h - m - 2 - y) / sn);
  return Math.max(8, L);
}

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
  // the fan as authored: each feather's root, angle (radians) and length
  const fan = (): { rx: number; ry: number; ang: number; len: number; t: number; primary: boolean; i: number }[] => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1); // 0 = outermost primary, 1 = innermost secondary
      const primary = i < 5;
      const angFold = 98 + t * 54;
      const angOpen = 222 - t * 98;
      const ang = rad(lerp(angFold, angOpen, Math.min(1, s)) + flap * 16 + Math.sin(ph * 1.3 + i) * 2.5);
      const len = lerp(lerp(88, 58, t), lerp(104, 64, t), Math.min(1, s)) * (far ? 0.92 : 1);
      const rootT = primary ? 0 : ((t - 0.4) / 0.6) * 0.85;
      out.push({ rx: lerp(wrist[0], A[0], rootT), ry: lerp(wrist[1], A[1], rootT), ang, len, t, primary, i });
    }
    return out;
  };
  const base = fan();
  const mid = base.reduce((m, f) => m + f.ang, 0) / N;
  // a wide spread near the frame edge is made to fit as a whole wing rather than by clipping single feathers: first the
  // fan swings a little (up or down, wherever there is room) and closes a little, then, only if it must, every
  // feather shortens by the same factor, so the primaries keep their staggered, tapered tips
  const M = 7;
  const fits = (x: number, y: number): boolean => x >= M && x <= r.w - M && y >= M && y <= r.h - M - 2;
  const room = (f: { rx: number; ry: number }, ang: number, len: number, w: number): number => {
    // the largest share (<= 1) of `len` for which the tip and the feather's widest points stay inside
    let lo = 0;
    let hi = 1;
    const ok = (k: number): boolean => {
      const L = len * k;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const mx = f.rx + c * L * 0.42;
      const my = f.ry + sn * L * 0.42;
      return fits(f.rx + c * L, f.ry + sn * L) && fits(mx - sn * w * 0.5, my + c * w * 0.5) && fits(mx + sn * w * 0.5, my - c * w * 0.5);
    };
    if (ok(1)) return 1;
    for (let it = 0; it < 12; it++) {
      const m = (lo + hi) / 2;
      if (ok(m)) lo = m;
      else hi = m;
    }
    return lo;
  };
  // prefer full length, then the least distortion: a few degrees of swing, a slightly closed fan or a slightly shorter
  // wing all cost about the same
  const cost = (rot: number, close: number, k: number): number => (1 - k) * 1.2 + Math.abs(rot) / 160 + close / 3;
  let best = { rot: 0, close: 0, k: 0, c: Infinity };
  for (const close of [0, 0.1, 0.2, 0.3]) {
    for (let rot = -24; rot <= 24; rot += 4) {
      let k = 1;
      for (const f of base) {
        const ang = mid + (f.ang - mid) * (1 - close) + rad(rot);
        k = Math.min(k, room(f, ang, f.len, 17 - f.t * 4));
      }
      const c = cost(rot, close, k);
      if (c < best.c) best = { rot, close, k, c };
    }
  }
  const xf = (ang: number): number => mid + (ang - mid) * (1 - best.close) + rad(best.rot);
  const kLen = Math.max(0.45, best.k);
  // secondaries first (inner, behind), then primaries (outer, in front)
  for (let pass = 0; pass < 2; pass++) {
    for (const f of base) {
      if ((pass === 0) === f.primary) continue;
      const { rx, ry, t, i } = f;
      const ang = xf(f.ang);
      // a last guard: whatever still does not fit is shortened (never cut off)
      const len = Math.min(f.len * kLen, fitLen(r, rx, ry, ang, 7));
      const tx = rx + Math.cos(ang) * len;
      const ty = ry + Math.sin(ang) * len;
      featherPoly(r, i % 2 ? P.featherU : main, [rx, ry], [tx, ty], 17 - t * 4);
      // the quill down each feather's middle
      if (!far) r.seg(P.featherF, rx + (tx - rx) * 0.15, ry + (ty - ry) * 0.15, rx + (tx - rx) * 0.72, ry + (ty - ry) * 0.72, 1.6, 1);
    }
  }
  // coverts along the arm
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const bx = lerp(wrist[0], A[0], t * 0.9);
    const by = lerp(wrist[1], A[1], t * 0.9);
    const ang = xf(rad(lerp(98, 222, Math.min(1, s)) - t * 40 + flap * 14));
    const cl = Math.min(34 * Math.min(1, kLen + 0.2), fitLen(r, bx, by, ang, 7));
    featherPoly(r, far ? P.featherF : P.covert, [bx, by], [bx + Math.cos(ang) * cl, by + Math.sin(ang) * cl], 15);
  }
}

function leg(r: Raster, P: Parts, hip: V2, kn0: V2, ankle0: V2, back: boolean, ph: number): void {
  // a deep crouch can fold the knee (or a foot) under the floor line: keep them above it
  const kn: V2 = [kn0[0], Math.min(r.h - 16, kn0[1])];
  const ankle: V2 = [ankle0[0], Math.min(r.h - 13, ankle0[1])];
  // azure leggings on the thigh (so the hips read apart from the cuirass) and a plated silver greave on the shin
  r.seg(back ? P.deep : P.azure, hip[0], hip[1], kn[0], kn[1], 15, 12);
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
  // little ankle wings flicking back: two layered feathers
  for (let i = 1; i >= 0; i--) featherPoly(r, i ? P.featherU : P.feather, [bx - 5, by - 6 + i * 2], [Math.max(7, bx - 20 - i * 3 - Math.sin(ph * 1.8 + i) * 2), by - 13 + i * 4], 7);
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
