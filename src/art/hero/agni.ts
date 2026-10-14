import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * Agni: a bare-chested fire monk. Upright V-taper torso with flame tattoos, a three-quarter face under a crown of fire,
 * a flowing headband and sash, baggy hakama, and cloth-wrapped fists with flame licking up off the knuckles.
 */
export function drawAgni(r: Raster, k0: Skel, look: PlaceholderLook): void {
  // limb ends pulled inside the frame so a fist (and the flame over it) is never cut off at an edge
  const fit = (q: V2, mx: number, top: number): V2 => [Math.max(mx, Math.min(k0.W - mx, q[0])), Math.max(top, Math.min(k0.H - 8, q[1]))];
  const k: Skel = { ...k0, handF: fit(k0.handF, 15, 24), handB: fit(k0.handB, 15, 24), elbowF: fit(k0.elbowF, 7, 10), elbowB: fit(k0.elbowB, 7, 10) };
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.55);
  const accent = col(look.accent);
  const glow = mix(accent, [255, 245, 190], 0.65);
  const skin = col(look.skin);
  const gold: RGB = [240, 200, 110];
  const P = {
    skin: r.part(skin, { soft: true }),
    skinL: r.part(mix(skin, [255, 226, 190], 0.3), { soft: true }),
    skinD: r.part(mul(skin, 0.78), { soft: true }),
    skinDD: r.part(mul(skin, 0.6), { flat: true }),
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
    pleat: r.part(mul(mix(armor, dark, 0.5), 0.9), { flat: true }),
    absL: r.part(mix(mul(skin, 0.8), [120, 60, 40], 0.12), { flat: true }),
    wrap: r.part(mix(skin, [240, 230, 210], 0.6), { soft: true }),
    wrapD: r.part(mix(skin, [200, 180, 160], 0.5), { flat: true }),
    eye: r.part([250, 245, 230], { flat: true }),
    pupil: r.part([30, 16, 14], { flat: true }),
    hair: r.part([40, 22, 20]),
    brow: r.part([34, 18, 16], { flat: true }),
    lip: r.part(mul(skin, 0.62), { flat: true }),
  };
  const T = k.torso;
  const ph = k.phase;
  const flick = (i: number): number => Math.sin(ph * 2.1 + i * 1.7);
  const run = k.pose.lean > 2;
  // outfits: 1 = Inferno (demon horns, a wild blaze of hair, magma cracks, flame pauldron), 2 = Temple (bald monk, kasaya robe, big beads, wraps)
  const o = look.outfit ?? 0;
  // charcoal horn with bone tips: reads against both skin and the flames
  const horn = r.part([74, 52, 50]);
  const hornL = r.part([214, 194, 164]);
  const robe = r.part(mix(armor, [255, 200, 120], 0.12), { soft: true });
  const robeD = r.part(mul(armor, 0.72), { soft: true });
  const bead = r.part([150, 92, 52]);

  const x0 = T.x;
  const top = T.y;
  const w = T.w;
  const h = T.h;
  const waist = top + h - 12;

  // ---- sash tails (behind) ----
  {
    const nx = x0 + 6;
    const ny = waist + 4;
    const flow = run ? 0 : 0.35;
    let px = nx;
    let py = ny;
    for (let i = 0; i < 9; i++) {
      const x = nx - 4 - i * 4.2;
      const y = Math.min(k.H - 9, ny + i * flow * 3 + Math.sin(ph * 1.3 + i * 0.7) * (1 + i * 0.3) + i * 1.2);
      const sw = 8 - i * 0.5;
      r.seg(i % 3 === 2 ? P.sashD : P.sash, Math.max(10, px), py, Math.max(10, x), y, sw, Math.max(2.5, sw - 0.5));
      px = x;
      py = y;
    }
  }

  // ---- back arm ----
  {
    const el = k.elbowB;
    r.ellipse(P.skinD, k.shB[0], k.shB[1] + 1, 6, 6);
    r.seg(P.skinD, k.shB[0], k.shB[1], el[0], el[1], 10, 8.5);
    r.seg(P.skinD, el[0], el[1], k.handB[0], k.handB[1], 8.5, 7.5);
    fist(r, P, k.handB, el, true, ph, o);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- torso ----
  {
    const cx = x0 + w / 2;
    // neck base / trapezius, deltoid-wide shoulders, chest, then a tapered waist: an upright V
    r.poly(P.skin, [
      [cx - 7, top - 2],
      [cx + 7, top - 2],
      [x0 + w - 4, top + 6],
      [x0 + w + 3, top + 12],
      [x0 + w + 2, top + 22],
      [x0 + w - 3, top + 30],
      [x0 + w - 5, waist + 2],
      [x0 + 6, waist + 2],
      [x0 + 3, top + 28],
      [x0 - 1, top + 18],
      [x0 - 2, top + 10],
      [x0 + 4, top + 5],
    ]);
    // the turned-away side in shade
    r.poly(P.skinD, [[x0 + 4, top + 5], [x0 + 10, top + 6], [x0 + 12, top + 20], [x0 + 10, waist + 2], [x0 + 6, waist + 2], [x0 + 3, top + 28], [x0 - 1, top + 18], [x0 - 2, top + 10]]);
    // pecs: a lit plate with a shadow line under it
    r.poly(P.skinL, [[cx - 6, top + 7], [x0 + w - 2, top + 9], [x0 + w + 1, top + 16], [x0 + w - 4, top + 20], [cx + 1, top + 20], [cx - 4, top + 17]]);
    r.seg(P.abs, cx - 4, top + 20, x0 + w - 4, top + 21, 1.4, 1.4);
    r.seg(P.absL, cx, top + 9, cx, top + 18, 1.5, 1.5);
    // abs: a central groove and two rows of lit blocks (a six-pack read by its highlights, not a grid of lines)
    r.rect(P.absL, cx + 2, top + 23, 1, waist - top - 24);
    for (let i = 0; i < 3; i++) {
      const ay = top + 23 + i * 5;
      if (ay + 4 > waist) break;
      r.rect(P.skinL, cx + 4, ay, 5, 2);
      r.rect(P.skinL, cx - 3, ay, 4, 2);
    }
    // the oblique line and the serratus notches under the near arm
    r.seg(P.absL, x0 + w - 4, top + 24, x0 + w - 8, waist, 1.5, 1.5);
    for (let i = 0; i < 2; i++) r.rect(P.absL, x0 + w - 5 - i, top + 23 + i * 4, 2, 1);
    // collarbones
    r.seg(P.absL, cx - 6, top + 5, cx - 1, top + 6, 1.5, 1.5);
    r.seg(P.absL, cx + 4, top + 6, x0 + w - 6, top + 7, 1.5, 1.5);
    // flame tattoo licking up the shaded flank: three continuous tongues, thick at the waist and tapering to a point
    r.inlay(P.skinD, P.ink, (s) => {
      for (let j = 0; j < 3; j++) {
        const len = 12 + j * 6;
        const x0j = x0 + 2 + j * 4;
        for (let t = 0; t <= len; t += 0.5) {
          const q = t / len;
          const tx = x0j + Math.sin(q * 3.4 + j) * 1.6 + q * 2;
          const ty = waist - t;
          s(tx, ty);
          if (q < 0.2) s(tx + 1, ty);
        }
      }
    });
    if (o === 1) {
      // magma cracks splitting the skin, glowing from inside
      const cracks: [number, number, number, number][] = [[w / 2 + 2, 8, w / 2 - 3, 16], [w / 2 - 3, 16, w / 2 + 2, 24], [w / 2 + 2, 24, w / 2 - 2, h - 14], [w - 6, 12, w - 3, 20], [10, 18, 14, 26]];
      for (const [ax, ay, bx, by] of cracks) {
        r.seg(P.flame, x0 + ax, top + ay, x0 + bx, top + by, 2, 1.5);
        r.seg(P.glow, x0 + ax, top + ay, x0 + bx, top + by, 0.8, 0.8);
      }
    }
    if (o === 2) {
      // a kasaya robe draped over the back shoulder and across the chest
      r.poly(robe, [[x0 - 3, top + 4], [cx - 3, top - 1], [x0 + w + 2, waist - 8], [x0 + w - 4, waist + 2], [x0 + 5, waist + 2], [x0 - 2, top + 18]]);
      r.poly(robeD, [[x0 - 3, top + 4], [x0 + 6, top + 3], [x0 + 8, waist + 2], [x0 + 4, waist + 2], [x0 - 2, top + 18]]);
      for (let i = 0; i < 3; i++) r.seg(robeD, x0 + 10 + i * 6, top + 6 + i * 4, x0 + w - 10 + i * 2, waist - 6, 1, 1); // folds
      r.seg(P.gold, cx - 3, top - 1, x0 + w + 2, waist - 8, 1.4, 1.4);
    }
    // prayer beads: a heavy mala hanging from the neck
    for (let i = 0; i < 7; i++) {
      const bx = cx - 9 + i * 3.4;
      const by = top + 2 + Math.sin((i / 6) * Math.PI) * (o === 2 ? 12 : 8);
      r.ellipse(o === 2 ? bead : P.gold, bx, by, o === 2 ? 2.6 : 1.8, o === 2 ? 2.6 : 1.8);
    }
    if (o === 2) r.ellipse(P.gold, cx + 1, top + 17, 2.6, 3.2);
    // wide sash with a flame knot
    r.rect(P.pantsD, x0 + 5, waist - 1, w - 9, 13);
    r.rect(P.sash, x0 + 5, waist - 1, w - 9, 5);
    r.rect(P.sashD, x0 + 5, waist + 4, w - 9, 2);
    r.ellipse(P.accent, cx + 4, waist + 1, 4, 4);
    r.ellipse(P.glow, cx + 4, waist, 1.8, 1.8);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- head ----
  head(r, P, k, o, ph, run, horn, hornL, flick);

  // ---- front arm ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    r.seg(P.skin, sx, sy, el[0], el[1], 11, 9.5);
    r.seg(P.skin, el[0], el[1], k.handF[0], k.handF[1], 9.5, 8);
    // deltoid cap and a bicep highlight
    r.ellipse(P.skin, sx, sy + 1, 7, 7);
    r.seg(P.skinL, sx - 1, sy - 2, sx + (el[0] - sx) * 0.55 - 1, sy + (el[1] - sy) * 0.55 - 2, 3, 2.5);
    if (o === 1) {
      // a pauldron of bone with living flame: a skull-white shell plate, a charred rim, three short spikes and a
      // glowing crack, flames licking up behind it
      for (let i = 0; i < 3; i++) {
        const fl = flick(i + 7) * 2;
        r.poly(P.flame, [[sx - 8 + i * 6, sy - 3], [sx - 6 + i * 6 + fl * 0.3, sy - 13 - fl - (i === 1 ? 3 : 0)], [sx - 2 + i * 6, sy - 3]]);
      }
      for (let i = 0; i < 3; i++) r.poly(hornL, [[sx - 6 + i * 5, sy - 3], [sx - 5 + i * 5 + 1, sy - 9 + Math.abs(i - 1) * 2], [sx - 2 + i * 5, sy - 3]]);
      r.ellipse(horn, sx + 0.5, sy + 0.5, 8.5, 6);
      r.ellipse(hornL, sx - 0.5, sy - 0.5, 7.4, 4.8);
      r.seg(P.flame, sx - 4, sy - 2, sx + 1, sy + 1.5, 1.2, 1);
      r.seg(P.flame, sx + 1, sy + 1.5, sx + 4, sy - 1, 1, 0.8);
    } else if (o !== 2) {
      // an armband
      const bx = sx + (el[0] - sx) * 0.4;
      const by = sy + (el[1] - sy) * 0.4;
      r.seg(P.gold, bx - 1, by - 3, bx + 1, by + 3, 2.2, 2.2);
    }
    fist(r, P, k.handF, el, false, ph, o);
  }
}

type Parts = Record<
  | 'skin' | 'skinL' | 'skinD' | 'skinDD' | 'pants' | 'pantsD' | 'pantsDeep' | 'armor' | 'light' | 'dark' | 'deep' | 'sash' | 'sashD'
  | 'accent' | 'glow' | 'flame' | 'gold' | 'ink' | 'abs' | 'absL' | 'pleat' | 'wrap' | 'wrapD' | 'eye' | 'pupil' | 'hair' | 'brow' | 'lip',
  number
>;

/** A three-quarter face looking right, with dark hair under a crown of fire (or horns / a shaved scalp per outfit). */
function head(r: Raster, P: Parts, k: Skel, o: number, ph: number, run: boolean, horn: number, hornL: number, flick: (i: number) => number): void {
  const T = k.torso;
  const s = k.head.s * 1.18; // a touch bigger than the build's head so the face reads under the crown
  const cx = k.head.x + k.head.s / 2 + 2;
  const cy = T.y - s * 0.36;
  const u = (a: number, b: number): V2 => [cx + a * s, cy + b * s];
  // neck with a shaded side
  r.poly(P.skinD, [u(-0.2, 0.1), u(0.16, 0.2), u(0.24, 0.62), u(-0.26, 0.62)]);
  r.seg(P.skinDD, cx - 0.04 * s, cy + 0.3 * s, cx + 0.12 * s, cy + 0.6 * s, 1, 1);
  // cranium + face
  r.ellipse(P.skin, cx, cy - 0.04 * s, 0.4 * s, 0.44 * s);
  r.poly(P.skin, [u(-0.32, 0.05), u(0.33, -0.02), u(0.35, 0.2), u(0.27, 0.38), u(0.12, 0.46), u(-0.06, 0.46), u(-0.3, 0.28)]);
  // nose
  r.poly(P.skin, [u(0.32, -0.04), u(0.44, 0.14), u(0.41, 0.18), u(0.33, 0.18)]);
  r.rect(P.skinDD, cx + 0.34 * s, cy + 0.17 * s, 3, 1);
  // jaw shade at the back and under the cheek
  r.poly(P.skinD, [u(-0.32, 0.05), u(-0.1, 0.1), u(0.02, 0.46), u(-0.06, 0.46), u(-0.3, 0.28)]);
  // hair: dark cap over the back and top (Temple: shaved)
  if (o !== 2) {
    r.inlay(P.skin, P.hair, (set) => {
      for (let y = Math.floor(cy - 0.5 * s); y <= cy + 0.25 * s; y++) {
        for (let x = Math.floor(cx - 0.45 * s); x <= cx + 0.45 * s; x++) {
          const hairline = cy - 0.2 * s + Math.max(0, (cx - 0.02 * s - x) / s) * 0.9 * s;
          if (y < hairline && !(x > cx + 0.02 * s && y > cy - 0.24 * s)) set(x, y);
        }
      }
    });
    r.inlay(P.skinD, P.hair, (set) => {
      for (let y = Math.floor(cy - 0.5 * s); y <= cy + 0.25 * s; y++) for (let x = Math.floor(cx - 0.45 * s); x <= cx - 0.12 * s; x++) set(x, y);
    });
  } else {
    r.ellipse(P.skinL, cx - 0.06 * s, cy - 0.3 * s, 0.18 * s, 0.07 * s);
  }
  // a crown of fire burning up out of the hair (Inferno: taller, wilder; Temple: none)
  if (o !== 2) {
    const laid = !!k.pose.laid;
    const tongues: [number, number][] = o === 1 ? [[-0.4, 0.95], [-0.22, 1.35], [-0.02, 1.15], [0.16, 1.45], [0.32, 0.95]] : [[-0.36, 0.75], [-0.18, 1.05], [0.0, 0.9], [0.17, 1.15], [0.32, 0.7]];
    tongues.forEach(([ox, hgt], i) => {
      const fl = flick(i) * 2.5;
      const bx = cx + ox * s;
      const by = cy - 0.28 * s;
      // knocked down, the body is turned on its side and centred across the frame, so the crown's height becomes width
      // past the head: cap the tips (plus their ~3px glow) to the standard crown's reach so they clear the frame side
      const H = Math.min(hgt * s * 0.62, laid ? by - fl - (k.base - 126) : Infinity);
      const lean = -2 + fl * 0.4; // swept back
      r.poly(P.flame, [[bx - 5, by + 4], [bx - 2.6 + lean * 0.4, by - H * 0.32], [bx + lean, by - H - fl], [bx + 2.6 + lean * 0.25, by - H * 0.28], [bx + 5, by + 4]]);
      r.poly(P.glow, [[bx - 2.5, by + 4], [bx + lean * 0.6, by - H * 0.62 - fl * 0.6], [bx + 2.5, by + 4]]);
    });
  }
  // ear
  r.ellipse(P.skinD, cx - 0.12 * s, cy + 0.08 * s, 0.07 * s, 0.1 * s);
  r.ellipse(P.skinDD, cx - 0.12 * s, cy + 0.09 * s, 0.03 * s, 0.05 * s);
  // eyes (near and far), heavy brows angled down to the nose
  const ey = cy - 0.02 * s;
  const ew = Math.max(3, Math.round(0.13 * s));
  r.rect(P.eye, cx + 0.07 * s, ey, ew, 3);
  r.rect(P.pupil, cx + 0.07 * s + ew - 2, ey, 2, 3);
  r.rect(P.eye, cx + 0.3 * s, ey, 2, 3);
  r.rect(P.pupil, cx + 0.3 * s + 1, ey, 1, 3);
  r.seg(P.brow, cx + 0.03 * s, ey - 3.5, cx + 0.24 * s, ey - 1, 2.6, 2.2);
  r.seg(P.brow, cx + 0.29 * s, ey - 1.5, cx + 0.38 * s, ey - 3, 2, 1.6);
  // cheekbone shade and a set mouth
  r.rect(P.skinD, cx + 0.06 * s, ey + 4, ew, 1);
  r.seg(P.lip, cx + 0.19 * s, cy + 0.29 * s, cx + 0.3 * s, cy + 0.28 * s, 1.3, 1.3);
  if (o === 2) {
    // a shaved head: a crown of three marks and a glowing urna
    for (let i = 0; i < 3; i++) r.ellipse(P.ink, cx - 0.12 * s + i * 4, cy - 0.38 * s, 1, 1);
    r.ellipse(P.ink, cx + 0.3 * s, cy - 0.12 * s, 1.2, 1.2);
  } else if (o === 1) {
    // demon horns: thick charcoal roots at the temples sweeping out past the flames and curling up, warming through a
    // mid tone to bone-white tips; the far one smaller, sweeping the other way, so the pair reads in three-quarter
    const hornM = r.part(mix([74, 52, 50], [214, 194, 164], 0.45));
    const horns: [number, number, V2[]][] = [
      [cx - 0.1 * s, 0.72, [[-2.6, -1.6], [-2.6, -3], [-1.2, -3.8], [0.6, -3.6], [1.6, -2.4]]],
      [cx + 0.2 * s, 1, [[3.4, -1.4], [3.4, -2.8], [2, -4], [0, -4], [-1.6, -2.6]]],
    ];
    for (const [bx, sc, steps] of horns) {
      const path: V2[] = [[bx, cy - 0.3 * s]];
      for (const [ddx, ddy] of steps) {
        const [px, py] = path[path.length - 1];
        path.push([px + ddx * sc, py + ddy * sc]);
      }
      // a dark underside first (one pass for the whole horn), then the horn itself, root to tip
      for (let i = 0; i < steps.length; i++) r.seg(P.hair, path[i][0] + 0.8, path[i][1] + 0.8, path[i + 1][0] + 0.8, path[i + 1][1] + 0.8, (7.8 - i * 1.3) * sc, (6.5 - i * 1.3) * sc);
      for (let i = 0; i < steps.length; i++) r.seg(i < 2 ? horn : i < 3 ? hornM : hornL, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], (7 - i * 1.3) * sc, (5.7 - i * 1.3) * sc);
    }
  } else {
    // headband with trailing tails
    const by = cy - 0.24 * s;
    r.seg(P.light, cx - 0.42 * s, by + 1, cx + 0.36 * s, by - 1, 4.5, 4.5);
    r.seg(P.accent, cx - 0.42 * s, by + 1.5, cx + 0.36 * s, by - 0.5, 1.6, 1.6);
    for (let i = 0; i < 2; i++) {
      let px = cx - 0.42 * s;
      let py = by + i * 3;
      for (let j = 0; j < 5; j++) {
        const x = Math.max(8, px - 5);
        const y = py + Math.sin(ph * 1.4 + j * 0.8 + i) * 2 + (run ? 0 : 1.5);
        r.seg(P.sash, px, py, x, y, 3.6, 3.2);
        px = x;
        py = y;
      }
    }
  }
}

/**
 * A cloth-wrapped fist on the end of the forearm, flame licking up off the knuckles.
 * Inferno: a charred bracer and a bigger blaze; Temple: plain wraps and a small palm flame.
 */
function fist(r: Raster, P: Parts, h: V2, el: V2, back: boolean, ph: number, o: number): void {
  let dx = h[0] - el[0];
  let dy = h[1] - el[1];
  const ln = Math.hypot(dx, dy) || 1;
  dx /= ln;
  dy /= ln;
  const nx = -dy;
  const ny = dx;
  // slide the whole fist back inside the frame if its knuckles (about 10px out along the forearm) would leave it
  const tipX = h[0] + dx * 10;
  const tipY = h[1] + dy * 10;
  const x = h[0] - Math.max(0, tipX + 6 - (r.w - 4)) + Math.max(0, 10 - (tipX - 6));
  const y = h[1] - Math.max(0, tipY + 6 - (r.h - 3));
  const cxp = x + dx * 3;
  const cyp = y + dy * 3;
  // flames first, so the fist sits in front of them; they always rise, whatever way the fist points
  const big = o === 1 ? 1.35 : o === 2 ? 0.55 : 1;
  const f = Math.sin(ph * 2.3 + (back ? 1.3 : 0));
  const tongues: [number, number][] = [[-4, 11], [0, 16], [4, 10]];
  tongues.forEach(([ox, hh], i) => {
    const H = hh * big + (i === 1 ? f * 2 : -f * 1.2);
    const bx = cxp + ox * (o === 2 ? 0.5 : 1);
    const by = cyp - 2;
    const sway = -1.5 + (i - 1) * 1.2 + f * 0.8;
    r.poly(P.flame, [[bx - 3.2, by], [bx - 1.5 + sway * 0.4, by - H * 0.5], [bx + sway, by - H], [bx + 2 + sway * 0.3, by - H * 0.45], [bx + 3.2, by]]);
    if (H > 6) r.poly(P.glow, [[bx - 1.4, by], [bx + sway * 0.6, by - H * 0.62], [bx + 1.4, by]]);
  });
  // wrist wraps (or a charred bracer)
  const wx = x - dx * 4;
  const wy = y - dy * 4;
  if (o === 1) {
    r.seg(back ? P.deep : P.dark, wx - dx * 5, wy - dy * 5, wx + dx * 1, wy + dy * 1, 10, 10);
    r.seg(P.flame, wx - dx * 4 + nx * 4, wy - dy * 4 + ny * 4, wx + dx * 0 - nx * 4, wy - ny * 4, 1.2, 1.2);
  } else {
    r.seg(back ? P.wrapD : P.wrap, wx - dx * 6, wy - dy * 6, wx + dx * 1, wy + dy * 1, 9.5, 9.5);
    for (let i = 0; i < 3; i++) {
      const t = -5 + i * 2.6;
      r.seg(P.wrapD, wx + dx * t + nx * 4.5, wy + dy * t + ny * 4.5, wx + dx * (t + 1.5) - nx * 4.5, wy + dy * (t + 1.5) - ny * 4.5, 1, 1);
    }
  }
  // the fist: a rounded block along the forearm, knuckle ridge at the front, thumb across the top
  r.seg(back ? P.skinD : P.skin, x - dx * 1, y - dy * 1, cxp + dx * 2, cyp + dy * 2, 10, 9.5);
  // three knuckle rolls across the leading face, lit on the upper side, with dark gaps; wrapped across in white
  // (Standard / Temple) or bare and scorched (Inferno); the thumb laid over the top
  const up = ny <= 0 ? 1 : -1; // which normal points up the screen
  const kn = o === 1 ? (back ? P.skinD : P.skin) : back ? P.wrapD : P.wrap;
  r.seg(P.skinDD, cxp + dx * 3.2 + nx * 3.3, cyp + dy * 3.2 + ny * 3.3, cxp + dx * 3.2 - nx * 3.3, cyp + dy * 3.2 - ny * 3.3, 3.2, 3.2);
  for (let i = -1; i <= 1; i++) {
    const kx = cxp + dx * 3 + nx * i * 2.7;
    const ky = cyp + dy * 3 + ny * i * 2.7;
    r.ellipse(i * up > 0 && !back ? (o === 1 ? P.skinL : P.wrap) : kn, kx, ky, 1.4, 1.4);
  }
  r.seg(back ? P.skinD : P.skinL, cxp - dx * 2 + nx * up * 3.5, cyp - dy * 2 + ny * up * 3.5, cxp + dx * 1.5 + nx * up * 3, cyp + dy * 1.5 + ny * up * 3, 3, 2.6);
  r.seg(P.skinDD, cxp - dx * 2.5 + nx * up * 1.6, cyp - dy * 2.5 + ny * up * 1.6, cxp + dx * 1 + nx * up * 1.4, cyp + dy * 1 + ny * up * 1.4, 0.8, 0.8);
  // ember glow on the leading knuckle
  if (o !== 2) r.rect(P.accent, cxp + dx * 4 - nx * up * 2.7 - 0.5, cyp + dy * 4 - ny * up * 2.7 - 0.5, 1.5, 1.5);
}

function leg(r: Raster, P: Parts, hip0: V2, kn0: V2, ankle: V2, back: boolean): void {
  // a deep crouch can fold the knee under the floor line: keep the cloth above it
  const lowY = r.h - 12;
  const hip: V2 = [hip0[0], Math.min(lowY, hip0[1])];
  const kn: V2 = [kn0[0], Math.min(lowY, kn0[1])];
  // baggy hakama: a full thigh, the cloth gathered into a dark band at the ankle. The back leg sits a value down (not
  // to black), so it still reads as a leg behind the front one
  const up = back ? P.pantsD : P.pants;
  const low = back ? P.pantsDeep : P.pantsD;
  r.seg(back ? P.pantsDeep : P.pantsD, hip[0] + 1.5, hip[1], kn[0] + 1.5, kn[1], 19, 16);
  r.seg(up, hip[0], hip[1], kn[0], kn[1], 19, 16);
  r.seg(low, kn[0], kn[1], ankle[0], ankle[1] - 3, 16, 10);
  // a soft fold where the cloth breaks over the knee
  if (!back) r.seg(P.pleat, kn[0] - 6, kn[1] + 4, kn[0] + 4, kn[1] + 6, 1.5, 1.5);
  const bx = ankle[0];
  const by = Math.min(ankle[1], r.h - 13);
  // the gathered cuff
  r.seg(back ? P.pantsDeep : P.deep, bx - 6, by - 4, bx + 6, by - 4, 4, 4);
  // a bare foot: a heel, the ankle bone, an arched instep sloping down to the toes, a dark sole line;
  // a cloth stirrup wrap round the ankle and the arch leaves the toes and the heel bare
  const sk = back ? P.skinD : P.skin;
  r.poly(sk, [[bx - 4, by - 3], [bx + 3, by - 3], [bx + 4, by + 1], [bx + 9, by + 4], [bx + 13, by + 5.5], [bx + 14.5, by + 7.5], [bx + 14, by + 9], [bx - 6, by + 9], [bx - 6.5, by + 6], [bx - 5, by + 3]]);
  if (!back) r.seg(P.skinL, bx + 3, by + 1.5, bx + 11, by + 5, 1.2, 1); // the lit instep
  r.rect(back ? P.skinDD : P.skinD, bx - 6, by + 8, 20, 2); // the sole in shadow
  r.ellipse(back ? P.skinDD : P.skinD, bx - 1.5, by + 3, 1.2, 1.2); // the ankle bone
  // toes: the big toe's knuckle and the gaps between the small ones
  for (let i = 0; i < 3; i++) r.rect(P.skinDD, bx + 8.5 + i * 2, by + 5 + i * 0.5, 1, 2);
  // a thin cloth wrap round the ankle, just under the cuff
  r.rect(back ? P.wrapD : P.wrap, bx - 5, by - 2, 9, 2);
  r.rect(P.wrapD, bx - 5, by - 1, 9, 1);
}
