import type { PlaceholderLook } from '../../engine/types';
import { drawFace } from './face';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import { solveLimb, type Skel } from './skeleton';

/** Nova: an aether mage in a flowing violet robe and cloak, wide-brimmed pointed hat, and a staff crowned with a living orb. */
export function drawNova(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.55);
  const accent = col(look.accent);
  guardGlow(r, accent); // no part blooms unless it is emissive on purpose (see guardGlow)
  const glow = mix(accent, [255, 255, 255], 0.65);
  const skin = col(look.skin);
  const wood: RGB = [112, 76, 44];
  const gold: RGB = [232, 196, 110];
  const P = {
    robe: r.part(armor, { soft: true }),
    robeL: r.part(mix(armor, [220, 200, 255], 0.22), { soft: true }),
    robeD: r.part(mul(armor, 0.74), { flat: true }),
    sleeve: r.part(mix(armor, [236, 222, 255], 0.3), { soft: true }),
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
    trim: r.part(accent, { flat: true, emissive: true }), // arcane trim glows on purpose
    star: r.part(mix(accent, [255, 255, 255], 0.4), { flat: true, emissive: true }), // the stars glow on purpose
    boot: r.part(mul(dark, 0.5)),
    eye: r.part(glow, { emissive: true }),
  };
  const lip = r.part(mix(skin, [196, 74, 96], 0.45), { flat: true });
  const T = k.torso;
  const sway = (i: number): number => Math.sin(k.phase * 1.3 + i * 0.8) * 2.5;
  const run = k.pose.lean > 2;
  // outfits: 1 = Stargazer (deep hood, a star circlet, a crescent moon on the staff), 2 = Witch (huge crooked hat, patched robe)
  const o = look.outfit ?? 0;
  const patch = r.part(mix(armor, [180, 150, 110], 0.45), { flat: true });
  // hands stay inside the frame on the widest reaches, boots stay on the floor line
  const handF = clampV(k.handF, 10, r.w - 12, 10, r.h - 12);
  const handB = clampV(k.handB, 10, r.w - 12, 10, r.h - 12);
  const elbowF = handF === k.handF ? k.elbowF : solveLimb(k.shF, handF, k.armBone, 1).mid;
  const elbowB = handB === k.handB ? k.elbowB : solveLimb(k.shB, handB, k.armBone, 1).mid;
  const ankleF = clampV(k.ankleF, 12, r.w - 20, 0, k.base - 8);
  const ankleB = clampV(k.ankleB, 12, r.w - 20, 0, k.base - 8);
  // the hem rides on the feet: it lifts with them in the air (the boot soles show under it) and never sinks below the floor
  const hem = Math.min(k.base - 2, Math.max(ankleF[1], ankleB[1]) + 6);

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
    const el = elbowB;
    const hand = handB;
    const [dx, dy] = unit(el, hand);
    const cx = hand[0] - dx * 4;
    const cy = hand[1] - dy * 4;
    r.seg(P.cloakD, k.shB[0], k.shB[1], el[0], el[1], 11, 12);
    r.seg(P.cloakD, el[0], el[1], cx, cy, 13, 16);
    r.seg(P.cloak, el[0] - 0.5, el[1] - 0.5, cx - dx, cy - dy, 10, 13);
    // an open hand at the end of the wide sleeve
    r.ellipse(P.skinD, hand[0] + 0.5, hand[1] + 0.5, 4.4, 4.4);
    r.ellipse(P.skin, hand[0], hand[1], 3.6, 3.6);
    r.seg(P.skin, hand[0], hand[1], hand[0] + dx * 5 + 1, hand[1] + dy * 5, 2.4, 2);
  }

  // ---- boots (peek out under the robe) ----
  for (const [a, back] of [[ankleB, true], [ankleF, false]] as const) {
    r.poly(back ? P.cloakD : P.boot, [[a[0] - 8, a[1] - 2], [a[0] + 8, a[1] - 2], [a[0] + 15, a[1] + 5], [a[0] + 15, a[1] + 8], [a[0] - 9, a[1] + 8]]);
    r.rect(P.gold, a[0] - 8, a[1] - 3, 16, 2);
  }

  // ---- robe ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    // airborne (the lower foot well off the floor), the skirt belles out and its corners lift; on the ground the hem
    // still ripples, harder on the run
    const air = Math.max(ankleF[1], ankleB[1]) < k.base - 16;
    const flare = (run ? 6 : 12) + (air ? 5 : 0);
    const pts: V2[] = [[x0 + 4, top + 2], [x0 + w - 4, top + 2], [x0 + w + 2, top + 10]];
    // the skirt is pushed out by the legs inside it: a stride or a kick fans the hem toward each foot
    // (and on the run the hem swings with the stride, front panel forward as the front foot reaches, back as it trails)
    const strideF = Math.max(-5, Math.min(6, (ankleF[0] - k.hipF[0]) * 0.45));
    const strideB = Math.max(-6, Math.min(5, (ankleB[0] - k.hipB[0]) * 0.45));
    const fwd = Math.max(strideF, ankleF[0] + 12 - (x0 + w + 2 + flare * 0.8 - (run ? 8 : 0)));
    const bwd = Math.max(-strideB, x0 - 2 - flare - (run ? 10 : 0) - (ankleB[0] - 8));
    const sideX = (i: number, right: boolean): number =>
      right
        ? x0 + w + 2 + flare * (i / 4) * 0.8 + sway(i) * 0.6 * (i / 4) - (run ? 8 * (i / 4) : 0) + fwd * (i / 4) ** 2
        : x0 - 2 - flare * (i / 4) + sway(i + 3) * 0.6 * (i / 4) - (run ? 10 * (i / 4) : 0) - bwd * (i / 4) ** 2;
    const xr = Math.min(r.w - 6, sideX(4, true));
    const xl = Math.max(5, sideX(4, false));
    const mid = (xl + xr) / 2;
    const amp = run ? 1.6 : air ? 1.4 : 0.8;
    const wave = (x: number): number => {
      const u = (x - mid) / ((xr - xl) / 2 || 1);
      return Math.min(k.base - 2, hem + amp * Math.sin(k.phase * 1.6 + x * 0.32) - (air ? 6 * u * u : 0));
    };
    for (let i = 1; i <= 3; i++) pts.push([sideX(i, true), top + 10 + (hem - top - 10) * (i / 4) - (air ? (i / 4) ** 3 * 4 : 0)]);
    for (let j = 0; j <= 8; j++) {
      const x = xr + (xl - xr) * (j / 8);
      pts.push([x, wave(x)]);
    }
    for (let i = 3; i >= 1; i--) pts.push([sideX(i, false), top + 10 + (hem - top - 10) * (i / 4) - (air ? (i / 4) ** 3 * 4 : 0)]);
    pts.push([x0 - 2, top + 10]);
    r.poly(P.robe, pts);
    // darker back fold and a lit front panel
    r.poly(P.cloak, [[x0 - 2, top + 10], [x0 + 6, top + 4], [x0 + 12, top + 6], [x0 + 6 - flare, wave(x0 + 6 - flare)], [xl, wave(xl)]]);
    r.poly(P.robeL, [[x0 + 16, top + 6], [x0 + w - 8, top + 6], [x0 + w - 4 + fwd * 0.3, hem - 6], [x0 + 12, hem - 6]]);
    const cloth = [P.robe, P.robeL, P.cloak];
    const onCloth = (part: number, x: number, y: number): void => {
      for (const c of cloth) r.inlay(c, part, (set) => set(x, y));
    };
    // pleats: deep folds falling from the sash and fanning out to the hem, each with a lit edge, swaying with the cloth
    const folds: [number, number, number][] = [
      [x0 + 6, xl + (mid - xl) * 0.3, 0],
      [x0 + 13, xl + (mid - xl) * 0.75, 1],
      [x0 + w - 6, mid + (xr - mid) * 0.45, 2],
      [x0 + w - 2, mid + (xr - mid) * 0.85, 3],
    ];
    for (const [fx0, fx1, i] of folds) {
      const y0 = top + T.h - 2;
      const y1 = wave(fx1) - 3;
      for (let y = y0; y < y1; y++) {
        const t = (y - y0) / (y1 - y0 || 1);
        const x = fx0 + (fx1 - fx0) * t + sway(i + 1) * 0.6 * t * t;
        onCloth(P.robeD, x, y);
        if (t > 0.3) onCloth(P.robeL, x + 1, y);
      }
    }
    // gold piping down the opening (the glow is saved for the runes and the hem) and a scalloped hem of glowing glyphs,
    // all riding the hem's ripple
    r.rect(P.cloakD, x0 + w / 2 + 1, top + 8, 1, hem - top - 14);
    r.rect(P.gold, x0 + w / 2 + 2, top + 8, 2, hem - top - 14);
    for (let i = 0; i < 7; i++) {
      const gx = xl + 4 + i * ((xr - xl - 10) / 6);
      const gy = wave(gx);
      r.rect(P.trim, gx, gy - 5 - (i & 1) * 2, 3, 2);
      r.rect(P.star, gx + 1, gy - 7 - (i & 1) * 2, 1, 1);
    }
    for (let x = Math.ceil(xl); x <= xr; x++) {
      const y = Math.round(wave(x));
      onCloth(P.gold, x, y - 1);
      onCloth(P.gold, x, y - 2);
    }
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
    if (o === 2) {
      // stitched patches on the robe
      for (const [px, py, pw, ph2] of [[x0 + 2, hem - 22, 9, 8], [x0 + w - 2, hem - 34, 7, 9]] as const) {
        r.rect(patch, px, py, pw, ph2);
        for (let i = 0; i < pw; i += 2) {
          r.rect(P.line, px + i, py - 1, 1, 1);
          r.rect(P.line, px + i, py + ph2, 1, 1);
        }
      }
    }
  }

  // ---- the boot toes poking out from under the hem, so the feet (and the stride) show ----
  for (const [a, back] of [[ankleB, true], [ankleF, false]] as const) {
    const sole = a[1] + 8;
    const top = Math.min(hem - 3, sole - 4);
    if (sole - top < 3) continue;
    r.poly(P.cloakD, [[a[0] + 1, top], [a[0] + 11, top], [a[0] + 16, sole - 4], [a[0] + 16, sole], [a[0] - 1, sole]]);
    r.poly(back ? P.cloakD : P.boot, [[a[0] + 2, top], [a[0] + 10, top], [a[0] + 15, sole - 3], [a[0] + 15, sole - 1], [a[0], sole - 1]]);
    if (!back) r.rect(P.gold, a[0] + 9, sole - 3, 4, 1); // a gold toe-cap glint
  }

  // ---- head + hat ----
  {
    const hx = k.head.x;
    const hy = k.head.y + 2;
    const hs = k.head.s;
    r.rect(P.skin, hx + 6, T.y - 4, hs - 12, 8); // neck
    if (o === 1) {
      // the hood's back and sides, behind the face
      r.ellipse(P.cloakD, hx + hs / 2 - 1, hy + 6, hs / 2 + 8, hs / 2 + 6);
      r.poly(P.cloakD, [[hx - 8, hy + 6], [hx - 14 - sway(3), hy + hs + 10], [hx + 6, hy + hs + 4]]);
    }
    // hair wisps under the hat
    r.poly(P.cloak, [[hx - 2, hy + 6], [hx - 12 - sway(3), hy + hs - 2], [hx + 4, hy + hs - 6]]);
    // long silver hair framing the face and falling behind the shoulder
    r.poly(P.hairD, [[hx - 4, hy + 4], [hx + 10, hy + 2], [hx + 12, hy + hs - 2], [hx - 10 - sway(4), hy + hs + 18], [hx - 12, hy + 14]]);
    r.poly(P.hair, [[hx - 2, hy + 4], [hx + 8, hy + 3], [hx + 9, hy + hs - 4], [hx - 6 - sway(5), hy + hs + 14]]);
    // loose locks at the ends, then strands combed down the hair
    for (let i = 0; i < 3; i++) {
      const lx = hx - 8 - sway(5) + i * 4;
      const ly = hy + hs + 10 - i * 3;
      r.seg(i === 1 ? P.hair : P.hairD, lx + 2, ly - 6, lx - 1 - sway(i + 6) * 0.4, ly + 3, 3.4, 1.4);
    }
    for (let i = 0; i < 2; i++) {
      const ax = hx + 2 + i * 4;
      const bx2 = hx - 6 - sway(5) + i * 5;
      for (let y = hy + 6; y < hy + hs + 12; y++) {
        const t = (y - hy - 6) / (hs + 6);
        r.inlay(P.hair, P.hairD, (set) => set(ax + (bx2 - ax) * t, y));
      }
    }
    // face
    drawFace(r, { skin: P.skin, skinD: P.skinD, eye: P.eye, pupil: P.eye, line: P.line }, hx + 4, hy + 4, hs, hs - 2, { eyeLit: true, mouth: true });
    // her features: a fine arched brow, a lash flick at the outer corner of the glowing eye, tinted lips, and a lock of
    // silver hair swept forward over the ear so the face reads young and framed rather than craggy
    const fx = (u: number): number => hx + 4 + hs * u;
    const fy = (v: number): number => hy + 4 + (hs - 2) * v;
    r.seg(P.skin, fx(0.5), fy(0.27), fx(0.92), fy(0.3), 2.8, 3); // (over the generic heavy brow)
    r.seg(P.line, fx(0.58), fy(0.25), fx(0.74), fy(0.19), 1, 1);
    r.seg(P.line, fx(0.74), fy(0.19), fx(0.9), fy(0.23), 1, 1);
    r.rect(P.line, fx(0.9), fy(0.33), 2, 1);
    r.rect(P.skinD, fx(0.6), fy(0.52), hs * 0.2, 1);
    r.rect(lip, fx(0.74), fy(0.78), hs * 0.18, 2);
    r.poly(P.hairD, [[fx(0.02), fy(-0.02)], [fx(0.36), fy(0.02)], [fx(0.32), fy(0.5)], [fx(0.2), fy(0.86)], [fx(0.04), fy(0.92)]]);
    r.poly(P.hair, [[fx(0.04), fy(0)], [fx(0.32), fy(0.03)], [fx(0.27), fy(0.46)], [fx(0.15), fy(0.78)], [fx(0.06), fy(0.8)]]);
    r.seg(P.hairD, fx(0.22), fy(0.08), fx(0.12), fy(0.7), 1, 1);
    if (o === 1) {
      // a deep hood pulled up over the hair, and a gold circlet with a star on the brow
      // the hood's front lip over the brow, open at the face
      r.poly(P.cloak, [[hx - 7, hy + 4], [hx + 1, hy - 7], [hx + hs / 2 + 2, hy - 9], [hx + hs + 5, hy - 2], [hx + hs + 4, hy + 4], [hx + 2, hy + 4], [hx - 2, hy + hs + 2], [hx - 9, hy + hs]]);
      r.seg(P.trim, hx + 1, hy + 4, hx + hs + 4, hy + 3, 1, 1);
      r.rect(P.gold, hx + 3, hy + 6, hs + 2, 2);
      const sx = hx + hs - 1;
      const sy = hy + 6;
      r.poly(P.glow, [[sx, sy - 5], [sx + 1.5, sy - 1.5], [sx + 5, sy], [sx + 1.5, sy + 1.5], [sx, sy + 5], [sx - 1.5, sy + 1.5], [sx - 5, sy], [sx - 1.5, sy - 1.5]]);
    } else if (o === 2) {
      // a huge witch's hat: a very wide brim and a tall crooked cone with a patched band and buckle
      r.ellipse(P.hat, hx + hs / 2 + 2, hy + 3, hs / 2 + 19, 5);
      r.ellipse(P.hatL, hx + hs / 2, hy + 2, hs / 2 + 16, 3);
      const bend = Math.sin(k.phase * 0.9) * 2.5;
      r.poly(P.hat, [[hx - 1, hy + 2], [hx + hs + 6, hy + 2], [hx + hs + 1, hy - 16], [hx + hs - 4, hy - 30], [hx - 12 + bend, hy - 36], [hx - 4 + bend, hy - 30], [hx + 2, hy - 16]]);
      r.poly(P.hatL, [[hx + 1, hy + 1], [hx + 9, hy + 1], [hx + 4, hy - 16], [hx + 2, hy - 16]]);
      r.rect(P.cloakD, hx, hy - 4, hs + 5, 5);
      r.rect(P.gold, hx + hs / 2 - 2, hy - 5, 7, 7);
      r.rect(P.cloakD, hx + hs / 2, hy - 3, 3, 3);
      r.rect(patch, hx + hs - 6, hy - 22, 6, 6);
      r.ellipse(P.accent, hx - 12 + bend, hy - 36, 2.2, 2.2);
    } else {
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
  }

  // ---- front arm: sleeve, hand, staff ----
  {
    const [sx, sy] = k.shF;
    // the staff's direction: along the forearm, aimed by the move, or planted upright at rest
    let dx = handF[0] - elbowF[0];
    let dy = handF[1] - elbowF[1];
    const ln = Math.hypot(dx, dy) || 1;
    dx /= ln;
    dy /= ln;
    if (k.pose.aim !== undefined) {
      // the move aims the staff explicitly (degrees: 0 forward, -90 up, 90 down)
      const a = (k.pose.aim * Math.PI) / 180;
      dx = Math.cos(a);
      dy = Math.sin(a);
    } else if (dy > 0.7) {
      dx = 0.1;
      dy = -1; // resting: planted upright
    }
    // a staff pointed at the frame edge from close by: the hand draws back so the orb still fits
    let hand = handF;
    let el = elbowF;
    const room = reach(r, hand, dx, dy, 16);
    if (room < 20) {
      hand = [hand[0] - dx * (20 - room), hand[1] - dy * (20 - room)];
      el = solveLimb(k.shF, hand, k.armBone, 1).mid;
    }
    // and an orb that would still graze an edge across the staff's line (a level staff held low) lifts the hand with it
    {
      const l0 = Math.max(14, Math.min(64, reach(r, hand, dx, dy, 16) - 3)) + 3;
      const ox = hand[0] + dx * l0;
      const oy = hand[1] + dy * l0;
      const sx2 = Math.max(16, Math.min(r.w - 17, ox)) - ox;
      const sy2 = Math.max(16, Math.min(r.h - 17, oy)) - oy;
      if (sx2 || sy2) {
        hand = [hand[0] + sx2, hand[1] + sy2];
        el = solveLimb(k.shF, hand, k.armBone, 1).mid;
      }
    }
    // a lighter sleeve with a dark rim, so the arm parts from the robe; a bell cuff with a gold band at the wrist
    const [ax, ay] = unit(el, hand);
    const cx = hand[0] - ax * 5;
    const cy = hand[1] - ay * 5;
    r.seg(P.cloakD, sx, sy + 1, el[0], el[1] + 1, 14, 15);
    r.seg(P.cloakD, el[0], el[1] + 1, cx + ax, cy + ay + 1, 15, 19);
    r.seg(P.sleeve, sx, sy, el[0], el[1], 12, 13);
    r.seg(P.sleeve, el[0], el[1], cx, cy, 13, 17);
    r.seg(P.robe, el[0] + 1, el[1] + 2, cx + 1, cy + 2, 5, 8);
    r.seg(P.gold, cx - ay * 8, cy + ax * 8, cx + ay * 8, cy - ax * 8, 2.6, 2.6);
    // the staff: wood shaft, gold rings, a claw cradling the orb
    // the staff keeps its length unless the orb (or the butt) would leave the frame, then it is held shorter
    const len = Math.max(14, Math.min(64, reach(r, hand, dx, dy, 16) - 3));
    const tail = Math.max(4, Math.min(26, reach(r, hand, -dx, -dy, 7)));
    const tx = hand[0] + dx * len;
    const ty = hand[1] + dy * len;
    const bx = hand[0] - dx * tail;
    const by = hand[1] - dy * tail;
    r.seg(P.wood, bx, by, tx, ty, 5, 4);
    r.seg(P.woodL, bx - 1, by, tx - 1, ty, 1, 1);
    for (const t of [0.28, 0.55, 0.82]) r.ellipse(P.gold, bx + (tx - bx) * t, by + (ty - by) * t, 3.5, 3.5);
    const nx = -dy;
    const ny = dx;
    if (o === 1) {
      // a crescent moon cradling the orb: an arc of gold around its back
      let px = tx + nx * 10;
      let py = ty + ny * 10;
      for (let i = 1; i <= 8; i++) {
        const a = (i / 8) * Math.PI;
        const cx = tx - dx * 2 + (nx * Math.cos(a) - dx * Math.sin(a)) * 10;
        const cy = ty - dy * 2 + (ny * Math.cos(a) - dy * Math.sin(a)) * 10;
        r.seg(P.gold, px, py, cx, cy, 3.4 - Math.abs(i - 4) * 0.4, 3.4 - Math.abs(i - 4) * 0.4);
        px = cx;
        py = cy;
      }
    } else {
      r.seg(P.gold, tx + nx * 7, ty + ny * 7, tx - dx * 4, ty - dy * 4, 3, 3);
      r.seg(P.gold, tx - nx * 7, ty - ny * 7, tx - dx * 4, ty - dy * 4, 3, 3);
    }
    const pulse = 0.5 + 0.5 * Math.sin(k.phase * 1.7);
    r.ellipse(P.accent, tx + dx * 3, ty + dy * 3, 8, 8);
    r.ellipse(P.glow, tx + dx * 2, ty + dy * 2, 3.5 + pulse * 1.5, 3.5 + pulse * 1.5);
    // the hand closed round the shaft: knuckles, finger creases across the staff, a thumb on top
    r.ellipse(P.skinD, hand[0] + 0.5, hand[1] + 0.5, 5.2, 5.2);
    r.ellipse(P.skin, hand[0], hand[1], 4.4, 4.4);
    for (let i = -1; i <= 1; i++) {
      const fx = hand[0] + dx * i * 2.4;
      const fy = hand[1] + dy * i * 2.4;
      r.seg(P.skinD, fx + nx * 1.5, fy + ny * 1.5, fx + nx * 4, fy + ny * 4, 1, 1);
    }
    r.ellipse(P.skin, hand[0] - nx * 3 + dx * 2, hand[1] - ny * 3 + dy * 2, 2, 2);
    // orbiting motes
    for (let i = 0; i < 3; i++) {
      const a = k.phase * 0.9 + i * 2.1;
      const mx = tx + dx * 3 + Math.cos(a) * 12;
      const my = ty + dy * 3 + Math.sin(a) * 12;
      if (mx >= 7 && my >= 7 && mx <= r.w - 9 && my <= r.h - 9) r.rect(P.star, mx, my, 2, 2);
    }
  }
}

/** How far from `p` along the unit direction (dx, dy) stays at least `m` pixels inside the frame. */
function reach(r: Raster, p: V2, dx: number, dy: number, m: number): number {
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (r.w - 1 - m - p[0]) / dx);
  if (dx < -1e-6) t = Math.min(t, (m - p[0]) / dx);
  if (dy > 1e-6) t = Math.min(t, (r.h - 1 - m - p[1]) / dy);
  if (dy < -1e-6) t = Math.min(t, (m - p[1]) / dy);
  return Math.max(0, t);
}

function clampV(v: V2, x0: number, x1: number, y0: number, y1: number): V2 {
  const x = Math.max(x0, Math.min(x1, v[0]));
  const y = Math.max(y0, Math.min(y1, v[1]));
  return x === v[0] && y === v[1] ? v : [x, y];
}

function unit(a: V2, b: V2): V2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

/**
 * `x` nudged just far enough that none of the tones the shader can give it (rim light, cast shade, volume) lands within
 * reach of the accent or its bloom white. The finishing pass treats any pixel near those as self-lit and blooms it, so
 * without this an accent-coloured cloth, metal or stone (or, with a pale accent, the whites) read as a light source. The
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

/**
 * Hold every part this drawer creates (including its helpers') clear of the glow colours: only parts made emissive on
 * purpose bloom. A pale lit part that would have to grey right down is painted flat instead, so it can stay pale.
 */
function guardGlow(r: Raster, accent: RGB): void {
  const raw = r.part.bind(r);
  r.part = (c: RGB, o: { emissive?: boolean; flat?: boolean; soft?: boolean; lean?: RGB } = {}): number => {
    if (o.emissive) return raw(c, o);
    const k = keepClear(c, accent, o);
    if (k.steps > 3 && !o.flat && c[0] + c[1] + c[2] > 600) return raw(keepClear(c, accent, { flat: true }).c, { flat: true });
    return raw(k.c, { flat: o.flat, soft: o.soft });
  };
}
