import type { PlaceholderLook } from '../../engine/types';
import { drawFace } from './face';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/** Nova: an aether mage in a flowing violet robe and cloak, wide-brimmed pointed hat, and a staff crowned with a living orb. */
export function drawNova(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.55);
  const accent = col(look.accent);
  const glow = mix(accent, [255, 255, 255], 0.65);
  const skin = col(look.skin);
  const wood: RGB = [112, 76, 44];
  const gold: RGB = [232, 196, 110];
  const P = {
    robe: r.part(armor, { soft: true }),
    robeL: r.part(mix(armor, [220, 200, 255], 0.22), { soft: true }),
    cloak: r.part(dark, { soft: true }),
    cloakD: r.part(deep, { soft: true }),
    skin: r.part(skin, { soft: true }),
    skinD: r.part(mul(skin, 0.8), { soft: true }),
    hair: r.part([226, 230, 246], { soft: true }),
    hairD: r.part([170, 176, 206], { soft: true }),
    sclera: r.part([246, 246, 255], { flat: true }),
    line: r.part(mul(skin, 0.42), { flat: true }),
    hat: r.part(mix(armor, [30, 10, 60], 0.35)),
    hatL: r.part(mix(armor, [220, 200, 255], 0.18)),
    wood: r.part(wood),
    woodL: r.part(mix(wood, [255, 230, 190], 0.3), { flat: true }),
    gold: r.part(gold),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    trim: r.part(accent, { flat: true }),
    star: r.part(mix(accent, [255, 255, 255], 0.4), { flat: true }),
    boot: r.part(mul(dark, 0.5)),
    eye: r.part(glow, { emissive: true }),
  };
  const T = k.torso;
  const hem = k.base - 2;
  const sway = (i: number): number => Math.sin(k.phase * 1.3 + i * 0.8) * 2.5;
  const run = k.pose.lean > 2;

  // ---- cloak behind everything ----
  {
    const top = T.y + 4;
    const x0 = T.x + 4;
    const back = run ? 22 : 12;
    const pts: V2[] = [[x0, top], [x0 + T.w - 8, top]];
    for (let i = 0; i <= 5; i++) pts.push([x0 + T.w - 4 - back * (i / 5) + sway(i) * (i / 5), top + (hem - top) * (i / 5)]);
    for (let i = 5; i >= 0; i--) pts.push([x0 - 6 - back * (i / 5) * 1.6 + sway(i + 2) * (i / 5), top + (hem - top) * (i / 5) + (i === 5 ? 0 : 0)]);
    r.poly(P.cloakD, pts);
    r.poly(P.cloak, pts.map(([x, y]) => [x + 3, y - 1] as V2));
    // star motes stitched into the cloak
    for (let i = 0; i < 7; i++) {
      const sx = x0 - 4 - back * 0.5 + ((i * 11) % 28);
      const sy = top + 14 + ((i * 17) % (hem - top - 20));
      r.inlay(P.cloak, P.star, (set) => {
        set(sx, sy);
        if (i % 3 === 0) {
          set(sx - 1, sy);
          set(sx + 1, sy);
          set(sx, sy - 1);
          set(sx, sy + 1);
        }
      });
    }
  }

  // ---- back arm (wide sleeve) ----
  {
    const el = k.elbowB;
    r.seg(P.cloakD, k.shB[0], k.shB[1], el[0], el[1], 11, 12);
    r.seg(P.cloak, el[0], el[1], k.handB[0], k.handB[1] - 3, 12, 15);
    r.ellipse(P.skin, k.handB[0], k.handB[1] + 1, 4.5, 4.5);
  }

  // ---- boots (peek out under the robe) ----
  for (const [a, back] of [[k.ankleB, true], [k.ankleF, false]] as const) {
    r.poly(back ? P.cloakD : P.boot, [[a[0] - 8, a[1] - 2], [a[0] + 8, a[1] - 2], [a[0] + 15, a[1] + 5], [a[0] + 15, a[1] + 8], [a[0] - 9, a[1] + 8]]);
    r.rect(P.gold, a[0] - 8, a[1] - 3, 16, 2);
  }

  // ---- robe ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const flare = run ? 6 : 12;
    const pts: V2[] = [[x0 + 4, top + 2], [x0 + w - 4, top + 2], [x0 + w + 2, top + 10]];
    for (let i = 1; i <= 4; i++) pts.push([x0 + w + 2 + flare * (i / 4) * 0.8 + sway(i) * 0.6 * (i / 4) - (run ? 8 * (i / 4) : 0), top + 10 + (hem - top - 10) * (i / 4)]);
    for (let i = 4; i >= 1; i--) pts.push([x0 - 2 - flare * (i / 4) + sway(i + 3) * 0.6 * (i / 4) - (run ? 10 * (i / 4) : 0), top + 10 + (hem - top - 10) * (i / 4)]);
    pts.push([x0 - 2, top + 10]);
    r.poly(P.robe, pts);
    // darker back fold and a lit front panel
    r.poly(P.cloak, [[x0 - 2, top + 10], [x0 + 6, top + 4], [x0 + 12, top + 6], [x0 + 6 - flare, hem], [x0 - 2 - flare, hem]]);
    r.poly(P.robeL, [[x0 + 16, top + 6], [x0 + w - 8, top + 6], [x0 + w - 4, hem - 6], [x0 + 12, hem - 6]]);
    // front trim down the opening and a scalloped hem of glowing glyphs
    r.rect(P.trim, x0 + w / 2 + 2, top + 8, 2, hem - top - 14);
    for (let i = 0; i < 7; i++) {
      const gx = x0 - 6 + i * ((w + 20) / 7);
      r.rect(P.trim, gx, hem - 5 - (i & 1) * 2, 3, 2);
      r.rect(P.star, gx + 1, hem - 7 - (i & 1) * 2, 1, 1);
    }
    r.rect(P.gold, x0 - 6, hem - 2, w + 22, 2);
    // collar and sash
    r.poly(P.cloak, [[x0 + 8, top], [x0 + w - 2, top], [x0 + w + 2, top + 8], [x0 + 4, top + 8]]);
    r.rect(P.gold, x0 + 6, top + 6, w - 4, 2);
    r.rect(P.cloakD, x0 + 2, top + T.h - 10, w, 8);
    r.rect(P.gold, x0 + 2, top + T.h - 10, w, 1);
    r.ellipse(P.accent, x0 + w / 2 + 2, top + T.h - 6, 4, 4);
    r.ellipse(P.glow, x0 + w / 2 + 1, top + T.h - 7, 1.6, 1.6);
    // rune panels on the chest
    for (let i = 0; i < 3; i++) {
      r.rect(P.trim, x0 + 18, top + 12 + i * 6, 6, 1);
      r.rect(P.trim, x0 + 18 + (i & 1) * 3, top + 13 + i * 6, 1, 3);
    }
  }

  // ---- head + hat ----
  {
    const hx = k.head.x;
    const hy = k.head.y + 2;
    const hs = k.head.s;
    r.rect(P.skin, hx + 6, T.y - 4, hs - 12, 8); // neck
    // hair wisps under the hat
    r.poly(P.cloak, [[hx - 2, hy + 6], [hx - 12 - sway(3), hy + hs - 2], [hx + 4, hy + hs - 6]]);
    // long silver hair framing the face and falling behind the shoulder
    r.poly(P.hairD, [[hx - 4, hy + 4], [hx + 10, hy + 2], [hx + 12, hy + hs - 2], [hx - 10 - sway(4), hy + hs + 18], [hx - 12, hy + 14]]);
    r.poly(P.hair, [[hx - 2, hy + 4], [hx + 8, hy + 3], [hx + 9, hy + hs - 4], [hx - 6 - sway(5), hy + hs + 14]]);
    // face
    drawFace(r, { skin: P.skin, skinD: P.skinD, eye: P.eye, pupil: P.eye, line: P.line }, hx + 4, hy + 4, hs, hs - 2, { eyeLit: true, mouth: true });
    // hat: wide brim, cone with a bend, glowing band and star
    r.ellipse(P.hat, hx + hs / 2 + 2, hy + 3, hs / 2 + 12, 5);
    r.ellipse(P.hatL, hx + hs / 2, hy + 2, hs / 2 + 10, 3);
    const bend = Math.sin(k.phase * 0.9) * 2;
    r.poly(P.hat, [[hx + 2, hy + 2], [hx + hs + 4, hy + 2], [hx + hs - 2, hy - 14], [hx + hs / 2 + 10 + bend, hy - 28], [hx + hs / 2 - 4, hy - 16]]);
    r.poly(P.hatL, [[hx + 4, hy + 1], [hx + 12, hy + 1], [hx + hs / 2 - 2, hy - 15], [hx + hs / 2 - 4, hy - 16]]);
    r.rect(P.accent, hx + 2, hy - 3, hs + 3, 3);
    r.ellipse(P.glow, hx + hs / 2 + 2, hy - 2, 2.5, 2.5);
    r.ellipse(P.accent, hx + hs / 2 + 10 + bend, hy - 29, 2.5, 2.5);
  }

  // ---- front arm: sleeve, hand, staff ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    r.seg(P.robe, sx, sy, el[0], el[1], 12, 13);
    r.seg(P.robeL, el[0], el[1], k.handF[0], k.handF[1] - 2, 14, 17);
    r.rect(P.gold, k.handF[0] - 8, k.handF[1] - 2, 16, 2);
    // the staff: wood shaft, gold rings, a claw cradling the orb
    let dx = k.handF[0] - el[0];
    let dy = k.handF[1] - el[1];
    const ln = Math.hypot(dx, dy) || 1;
    dx /= ln;
    dy /= ln;
    if (dy > 0.7) {
      dx = 0.1;
      dy = -1; // resting: planted upright
    }
    const len = 64;
    const tx = k.handF[0] + dx * len;
    const ty = k.handF[1] + dy * len;
    const bx = k.handF[0] - dx * 26;
    const by = k.handF[1] - dy * 26;
    r.seg(P.wood, bx, by, tx, ty, 5, 4);
    r.seg(P.woodL, bx - 1, by, tx - 1, ty, 1, 1);
    for (const t of [0.28, 0.55, 0.82]) r.ellipse(P.gold, bx + (tx - bx) * t, by + (ty - by) * t, 3.5, 3.5);
    const nx = -dy;
    const ny = dx;
    r.seg(P.gold, tx + nx * 7, ty + ny * 7, tx - dx * 4, ty - dy * 4, 3, 3);
    r.seg(P.gold, tx - nx * 7, ty - ny * 7, tx - dx * 4, ty - dy * 4, 3, 3);
    const pulse = 0.5 + 0.5 * Math.sin(k.phase * 1.7);
    r.ellipse(P.accent, tx + dx * 3, ty + dy * 3, 8, 8);
    r.ellipse(P.glow, tx + dx * 2, ty + dy * 2, 3.5 + pulse * 1.5, 3.5 + pulse * 1.5);
    r.ellipse(P.skin, k.handF[0], k.handF[1], 4.5, 4.5); // fingers over the shaft
    // orbiting motes
    for (let i = 0; i < 3; i++) {
      const a = k.phase * 0.9 + i * 2.1;
      r.rect(P.star, tx + dx * 3 + Math.cos(a) * 12, ty + dy * 3 + Math.sin(a) * 12, 2, 2);
    }
  }
}
