import type { PlaceholderLook } from '../../engine/types';
import { drawFace } from './face';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/** Agni: a bare-chested fire-god martial artist with flame tattoos, a blazing crest of hair, flowing headband and sash, and flame gauntlets. */
export function drawAgni(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.55);
  const accent = col(look.accent);
  const glow = mix(accent, [255, 245, 190], 0.65);
  const skin = col(look.skin);
  const gold: RGB = [240, 200, 110];
  const P = {
    skin: r.part(skin, { soft: true }),
    skinD: r.part(mul(skin, 0.78), { soft: true }),
    pants: r.part(armor, { soft: true }),
    pantsD: r.part(dark, { soft: true }),
    pantsDeep: r.part(deep, { soft: true }),
    armor: r.part(armor),
    light: r.part(mix(armor, [255, 200, 140], 0.28)),
    dark: r.part(dark),
    deep: r.part(deep),
    sash: r.part(accent, { soft: true }),
    sashD: r.part(mul(accent, 0.7), { soft: true }),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    flame: r.part(accent, { emissive: true }),
    gold: r.part(gold),
    ink: r.part(accent, { flat: true }),
    abs: r.part(mul(skin, 0.7), { flat: true }),
    wrap: r.part(mix(skin, [240, 230, 210], 0.55), { soft: true }),
    eye: r.part([250, 245, 230], { flat: true }),
    pupil: r.part(deep, { flat: true }),
  };
  const T = k.torso;
  const ph = k.phase;
  const flick = (i: number): number => Math.sin(ph * 2.1 + i * 1.7);
  const run = k.pose.lean > 2;
  // outfits: 1 = Inferno (demon horns, a wild blaze of hair, magma cracks, flame pauldron), 2 = Temple (bald monk, kasaya robe, big beads, wraps)
  const o = look.outfit ?? 0;
  const horn = r.part([206, 186, 156]);
  const hornL = r.part([150, 124, 100]);
  const robe = r.part(mix(armor, [255, 200, 120], 0.12), { soft: true });
  const robeD = r.part(mul(armor, 0.72), { soft: true });
  const bead = r.part([150, 92, 52]);

  // ---- sash tails (behind) ----
  {
    const nx = T.x + 4;
    const ny = T.y + T.h - 4;
    const flow = run ? 0 : 0.35;
    let px = nx;
    let py = ny;
    for (let i = 0; i < 9; i++) {
      const x = nx - 4 - i * 4.4;
      const y = ny + i * flow * 3 + Math.sin(ph * 1.3 + i * 0.7) * (1 + i * 0.3) + i * 1.2;
      const w = 9 - i * 0.55;
      r.seg(i % 3 === 2 ? P.sashD : P.sash, px, py, x, y, w, Math.max(2.5, w - 0.5));
      px = x;
      py = y;
    }
  }

  // ---- back arm ----
  {
    const el = k.elbowB;
    r.seg(P.skinD, k.shB[0], k.shB[1], el[0], el[1], 12, 10);
    r.seg(P.skinD, el[0], el[1], k.handB[0], k.handB[1], 10, 9);
    if (o === 2) wraps(r, P, k.handB, el, ph);
    else gauntlet(r, P, k.handB, el, true, ph);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- torso ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    // bare torso: broad shoulders tapering to the waist
    r.poly(P.skin, [[x0 + 2, top + 2], [x0 + w - 2, top + 2], [x0 + w + 2, top + 10], [x0 + w - 6, top + h - 4], [x0 + 8, top + h - 4], [x0 - 2, top + 10]]);
    r.poly(P.skinD, [[x0 - 2, top + 10], [x0 + 2, top + 2], [x0 + 8, top + 3], [x0 + 12, top + h - 6], [x0 + 8, top + h - 4]]);
    // pecs and abs
    r.rect(P.abs, x0 + w / 2, top + 6, 1, h - 16);
    r.rect(P.abs, x0 + 10, top + 14, w - 18, 1);
    for (let i = 0; i < 3; i++) r.rect(P.abs, x0 + 12, top + 20 + i * 5, w - 22, 1);
    r.rect(P.abs, x0 + 12, top + 11, 10, 1);
    r.rect(P.abs, x0 + w - 18, top + 11, 10, 1);
    // flame tattoo curling over the ribs and chest (self-lit)
    for (let i = 0; i < 9; i++) {
      const tx = x0 + 6 + Math.sin(i * 0.9) * 2;
      r.rect(P.ink, tx, top + 6 + i * 3, 2, 2);
    }
    r.rect(P.ink, x0 + 8, top + 8, 4, 1);
    r.rect(P.ink, x0 + 10, top + 14, 3, 1);
    r.rect(P.ink, x0 + w - 12, top + 8, 4, 1);
    r.rect(P.ink, x0 + w - 12, top + 14, 3, 1);
    if (o === 1) {
      // magma cracks splitting the skin, glowing from inside
      const cracks: [number, number, number, number][] = [[w / 2 + 2, 6, w / 2 - 4, 14], [w / 2 - 4, 14, w / 2 + 1, 22], [w / 2 + 1, 22, w / 2 - 3, h - 12], [w - 8, 10, w - 4, 18], [12, 18, 16, 26]];
      for (const [ax, ay, bx, by] of cracks) {
        r.seg(P.flame, x0 + ax, top + ay, x0 + bx, top + by, 2, 1.5);
        r.seg(P.glow, x0 + ax, top + ay, x0 + bx, top + by, 0.8, 0.8);
      }
    }
    if (o === 2) {
      // a kasaya robe draped over the back shoulder and across the chest
      r.poly(robe, [[x0 - 2, top + 2], [x0 + 12, top + 1], [x0 + w + 1, top + h - 12], [x0 + w - 4, top + h - 4], [x0 + 4, top + h - 4], [x0 - 3, top + 10]]);
      r.poly(robeD, [[x0 - 2, top + 2], [x0 + 6, top + 2], [x0 + 6, top + h - 4], [x0 + 2, top + h - 4], [x0 - 3, top + 10]]);
      for (let i = 0; i < 3; i++) r.seg(robeD, x0 + 10 + i * 6, top + 4 + i * 4, x0 + w - 10 + i * 2, top + h - 12, 1, 1); // folds
      r.seg(P.gold, x0 + 12, top + 1, x0 + w + 1, top + h - 12, 1.4, 1.4);
    }
    // prayer beads (the monk wears a heavy mala of big wooden beads)
    for (let i = 0; i < 7; i++) {
      const bx = x0 + 6 + i * ((w - 12) / 6);
      const by = top + 4 + Math.sin((i / 6) * Math.PI) * (o === 2 ? 12 : 9);
      r.ellipse(o === 2 ? bead : P.gold, bx, by, o === 2 ? 3.4 : 2.4, o === 2 ? 3.4 : 2.4);
    }
    if (o === 2) r.ellipse(P.gold, x0 + w / 2, top + 18, 3, 3.6);
    // wide sash with a flame knot
    r.rect(P.pantsD, x0 + 4, top + h - 12, w - 8, 12);
    r.rect(P.sash, x0 + 4, top + h - 12, w - 8, 4);
    r.rect(P.sashD, x0 + 4, top + h - 4, w - 8, 3);
    r.ellipse(P.accent, x0 + w / 2 + 2, top + h - 8, 5, 5);
    r.ellipse(P.glow, x0 + w / 2 + 2, top + h - 9, 2.2, 2.2);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- head: fierce face, flame crest, headband ----
  {
    const hx = k.head.x;
    const hy = k.head.y;
    const hs = k.head.s;
    r.rect(P.skinD, hx + 8, T.y - 4, hs - 14, 8); // neck
    // flame crest of hair (Inferno: a taller, wilder blaze; Temple: shaved bald)
    const tongues: [number, number][] = o === 2 ? [] : o === 1 ? [[-2, 22], [4, 32], [10, 26], [16, 36], [22, 24], [27, 18]] : [[2, 18], [8, 26], [14, 20], [19, 28], [24, 16]];
    tongues.forEach(([ox, hgt], i) => {
      const fl = flick(i) * 3;
      r.poly(P.flame, [[hx + ox, hy + 4], [hx + ox + 5 + fl * 0.3, hy + 4 - hgt - fl], [hx + ox + 10, hy + 4]]);
      r.poly(P.glow, [[hx + ox + 3, hy + 4], [hx + ox + 5 + fl * 0.3, hy + 4 - hgt * 0.6 - fl * 0.6], [hx + ox + 8, hy + 4]]);
    });
    if (o === 2) {
      // the shaved scalp's dome, under the face
      r.ellipse(P.skin, hx + hs / 2, hy + 8, hs / 2 + 1, hs / 2 - 1);
      r.ellipse(P.skinD, hx + 3, hy + 10, 4, hs / 2 - 4);
    }
    // face
    drawFace(r, { skin: P.skin, skinD: P.skinD, eye: P.eye, pupil: P.pupil, line: P.deep }, hx, hy + 4, hs, hs - 2, { grim: 1 });
    if (o === 2) {
      // a shaved head: a crown of three marks and a glowing urna
      for (let i = 0; i < 3; i++) r.ellipse(P.ink, hx + hs / 2 - 3 + i * 4, hy + 4, 1, 1);
      r.ellipse(P.ink, hx + hs - 2, hy + 9, 1.4, 1.4); // a glowing urna
    } else if (o === 1) {
      r.poly(P.deep, [[hx - 1, hy + 6], [hx + 8, hy + 3], [hx + 12, hy + hs - 6], [hx + 2, hy + hs - 2]]);
      // demon horns curling up and back from the brow
      for (const [bx, s] of [[hx + hs - 4, 1], [hx + 5, 0.8]] as const) {
        let px = bx;
        let py = hy + 5;
        for (let i = 0; i < 5; i++) {
          const x = px - (i < 2 ? -1 : 3) * s;
          const y = py - 4.5 * s;
          r.seg(i < 2 ? horn : hornL, px, py, x, y, (6 - i) * s, (5.2 - i) * s);
          px = x;
          py = y;
        }
      }
    } else {
    r.poly(P.deep, [[hx - 1, hy + 6], [hx + 8, hy + 3], [hx + 12, hy + hs - 6], [hx + 2, hy + hs - 2]]); // dark hair at the nape
    // headband with trailing tails
    r.rect(P.light, hx - 1, hy + 2, hs + 2, 5);
    r.rect(P.accent, hx - 1, hy + 4, hs + 2, 2);
    for (let i = 0; i < 2; i++) {
      let px = hx - 2;
      let py = hy + 4 + i * 3;
      for (let j = 0; j < 5; j++) {
        const x = px - 5;
        const y = py + Math.sin(ph * 1.4 + j * 0.8 + i) * 2 + (run ? 0 : 1.5);
        r.seg(P.sash, px, py, x, y, 4, 3.5);
        px = x;
        py = y;
      }
    }
    }
  }

  // ---- front arm: shoulder wrap, arm, flame gauntlet ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    r.seg(P.skin, sx, sy, el[0], el[1], 13, 11);
    r.seg(P.skin, el[0], el[1], k.handF[0], k.handF[1], 11, 10);
    if (o === 1) {
      // a pauldron of living flame
      r.ellipse(horn, sx, sy - 2, 9, 7);
      for (let i = 0; i < 3; i++) {
        const fl = flick(i + 7) * 2;
        r.poly(P.flame, [[sx - 8 + i * 6, sy - 4], [sx - 6 + i * 6 + fl * 0.3, sy - 16 - fl - (i === 1 ? 4 : 0)], [sx - 2 + i * 6, sy - 4]]);
      }
    } else if (o === 2) {
      r.ellipse(robe, sx, sy - 1, 8, 7);
    } else {
      r.ellipse(P.pants, sx, sy - 2, 9, 8); // shoulder wrap
      r.rect(P.sash, sx - 8, sy + 2, 16, 2);
    }
    if (o === 2) wraps(r, P, k.handF, el, ph);
    else gauntlet(r, P, k.handF, el, false, ph);
  }
}

type Parts = Record<'skin' | 'skinD' | 'pants' | 'pantsD' | 'pantsDeep' | 'armor' | 'light' | 'dark' | 'deep' | 'sash' | 'sashD' | 'accent' | 'glow' | 'flame' | 'gold' | 'ink' | 'abs' | 'wrap' | 'eye' | 'pupil', number>;

/** Flame gauntlet: armoured bracer, fist with glowing knuckles, and a licking crest. */
function gauntlet(r: Raster, P: Parts, h: V2, el: V2, back: boolean, ph: number): void {
  const [x, y] = h;
  const mx = el[0] + (h[0] - el[0]) * 0.55;
  const my = el[1] + (h[1] - el[1]) * 0.55;
  r.seg(back ? P.dark : P.armor, mx, my, x, y, 13, 14); // bracer
  r.rect(P.deep, x - 9, y - 8, 19, 16);
  r.rect(back ? P.dark : P.armor, x - 8, y - 8, 17, 14);
  r.rect(back ? P.armor : P.light, x - 8, y - 8, 17, 4);
  for (let i = 0; i < 3; i++) r.rect(P.deep, x - 5 + i * 5, y - 1, 1, 7);
  r.rect(P.accent, x - 8, y + 5, 17, 3);
  r.rect(P.glow, x - 8 + (ph & 1) * 6, y + 5, 4, 1);
  // flame crest
  const f = Math.sin(ph * 2.3) * 2;
  r.poly(P.flame, [[x - 6, y - 8], [x - 4 + f * 0.4, y - 18 - f], [x - 1, y - 8]]);
  r.poly(P.flame, [[x - 1, y - 8], [x + 3 - f * 0.4, y - 21 + f], [x + 7, y - 8]]);
  r.poly(P.glow, [[x - 4, y - 8], [x - 3 + f * 0.3, y - 14 - f * 0.5], [x - 2, y - 8]]);
  r.poly(P.glow, [[x + 1, y - 8], [x + 3, y - 16 + f * 0.5], [x + 5, y - 8]]);
}

/** Temple: bare fists bound in cloth wraps, a small flame in the palm. */
function wraps(r: Raster, P: Parts, h: V2, el: V2, ph: number): void {
  const [x, y] = h;
  const mx = el[0] + (h[0] - el[0]) * 0.5;
  const my = el[1] + (h[1] - el[1]) * 0.5;
  r.seg(P.wrap, mx, my, x, y, 11, 11);
  for (let i = 0; i < 3; i++) {
    const t = 0.2 + i * 0.3;
    r.rect(P.abs, mx + (x - mx) * t - 5, my + (y - my) * t, 10, 1);
  }
  r.ellipse(P.skin, x, y, 7, 6.5);
  r.rect(P.wrap, x - 6, y - 2, 12, 3);
  const f = Math.sin(ph * 2.3) * 1.5;
  r.poly(P.flame, [[x - 3, y - 6], [x + f * 0.4, y - 14 - f], [x + 3, y - 6]]);
  r.poly(P.glow, [[x - 1.5, y - 6], [x, y - 10 - f * 0.5], [x + 1.5, y - 6]]);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  // baggy hakama gathered at the ankle, wrapped shin, bare wrapped foot
  r.seg(back ? P.pantsDeep : P.pants, hip[0], hip[1], kn[0], kn[1], 24, 19);
  r.seg(back ? P.pantsDeep : P.pantsD, kn[0], kn[1], ankle[0], ankle[1], 19, 12);
  if (!back) {
    r.rect(P.sash, ankle[0] - 8, ankle[1] - 8, 16, 2);
    r.rect(P.sashD, ankle[0] - 8, ankle[1] - 5, 16, 2);
  }
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(back ? P.skinD : P.skin, [[bx - 6, by - 3], [bx + 6, by - 3], [bx + 16, by + 5], [bx + 16, by + 8], [bx - 7, by + 8]]);
  r.rect(P.wrap, bx - 6, by - 2, 12, 3);
  r.rect(P.deep, bx - 8, by + 7, 25, 2);
}
