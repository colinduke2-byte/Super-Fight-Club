import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, Raster, type RGB, type V2 } from './raster';
import { solveLimb, type Skel } from './skeleton';

/**
 * The Overseer: the arena AI's warden body, the Arcade Ladder's final boss. Built silhouette-first to read as a boss at a
 * glance: a rotating halo of segments framing a small monolith helm sunk into a high collar, a single horizontal eye-slit
 * as the focal point, a V-shaped chest around the reactor core, two massive stacked pauldrons with gold crests, a tattered
 * imperial mantle behind, bell gauntlets ending in hammer fists, and pillar legs on heavy sabatons.
 *
 * One light from up-front (see `plate`), gold trim on every big edge so the shape reads against a dark stage, and the
 * accent glow kept to the eye, the core, the halo and the running seams.
 *
 * Channels the poses drive (see overseer.moves.json): `pose.wing` is the boss's "power" 0..1 (casts, the roar, the
 * Cataclysm): the eye flares, the core swells and the halo widens with every segment lit.
 * `look.outfit === 1` is phase 2 (the enraged sheet, see `overseerPhase2` in characters/overseer.ts): the armour vents
 * and seams glow, heat cracks open across the chest, the eye-slit widens and the halo spins twice as fast, all lit.
 */
export function drawOverseer(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const accent = col(look.accent);
  guardGlow(r, accent); // no part blooms unless it is emissive on purpose
  const p2 = (look.outfit ?? 0) === 1;
  const power = Math.max(0, Math.min(1, k.pose.wing ?? 0));
  const glow = mix(accent, [255, 252, 236], 0.55);
  const frame: RGB = mix(mul(dark, 0.5), [18, 18, 30], 0.45);
  const gun: RGB = mix([122, 124, 140], armor, 0.12);
  const gold: RGB = [226, 190, 112];
  const cloth: RGB = p2 ? [92, 22, 34] : [74, 30, 72];
  const M: Mats = {
    A: ramp(r, armor, dark, 0.34),
    D: ramp(r, mix(armor, dark, 0.7), mul(dark, 0.62), 0.16),
    F: ramp(r, frame, mul(frame, 0.6), 0.1),
    G: ramp(r, gun, mul(gun, 0.48), 0.3),
    GD: ramp(r, mul(gun, 0.66), mul(gun, 0.38), 0.14),
    T: ramp(r, gold, [118, 82, 40], 0.42),
    C: ramp(r, cloth, mul(cloth, 0.55), 0.12),
    line: r.part(mix(frame, [4, 4, 12], 0.5), { flat: true }),
    deep: r.part(mix(frame, [0, 0, 4], 0.45), { flat: true }),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    white: r.part(mix(glow, [255, 255, 255], 0.6), { emissive: true }),
    // vents: a dark grille while calm, white-hot slots once enraged
    vent: p2 ? r.part(accent, { emissive: true }) : r.part(mix(frame, [0, 0, 4], 0.3), { flat: true }),
    ventHot: p2 ? r.part(glow, { emissive: true }) : r.part(mix(gun, frame, 0.55), { flat: true }),
  };
  const T = k.torso;
  const ph = k.phase;
  const pulse = ph % 2;
  const hx = k.head.x;
  const hy = k.head.y;
  const hs = k.head.s;
  const x0 = T.x;
  const top = T.y;
  const w = T.w;
  const h = T.h;
  // the giant gauntlets and sabatons stay inside the frame on the widest reaches
  const handF = clampV(k.handF, 40, r.w - 42, 36, r.h - 30);
  const handB = clampV(k.handB, 40, r.w - 42, 36, r.h - 30);
  const ankleF = clampV(k.ankleF, 34, r.w - 46, 0, k.base - 14);
  const ankleB = clampV(k.ankleB, 34, r.w - 46, 0, k.base - 14);
  const elbowF = handF === k.handF ? k.elbowF : solveLimb(k.shF, handF, k.armBone, 1).mid;
  const elbowB = handB === k.handB ? k.elbowB : solveLimb(k.shB, handB, k.armBone, 1).mid;

  // ---- the halo: twelve plated segments on a ring behind the helm, turning with the animation ----
  halo(r, M, hx + hs / 2 - 4, hy + hs / 2 + 4, ph, p2, power);

  // ---- the mantle: a heavy tattered cloak off the back shoulders, swaying with the stride ----
  {
    const sway = Math.sin(ph * 1.05) * 3 - k.pose.lean * 1.6;
    const hem = Math.min(k.base - 22, top + h + 46);
    const bx = x0 + 8;
    const pts: V2[] = [
      [bx + 34, top - 2],
      [bx - 6, top + 2],
      [bx - 20 + sway * 0.4, top + 40],
      [bx - 30 + sway, hem - 18],
      [bx - 34 + sway, hem],
      [bx - 18 + sway, hem - 8],
      [bx - 8 + sway * 0.8, hem + 4],
      [bx + 4 + sway * 0.6, hem - 10],
      [bx + 18 + sway * 0.5, hem - 2],
      [bx + 26, top + 44],
    ];
    plate(r, M.C, (m) => m.poly(0, pts.map(([x, y]) => [Math.max(34, x), y] as V2)), { line: M.line, soft: true });
    // the gold-edged hem (a broken band that follows the tatters)
    for (let i = 3; i < 8; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      r.seg(M.T[2], Math.max(35, a[0]), a[1] - 2, Math.max(35, b[0]), b[1] - 2, 2, 2);
    }
    // folds
    r.seg(M.C[1], bx - 4, top + 20, bx - 16 + sway, hem - 14, 2, 3);
    r.seg(M.C[1], bx + 12, top + 26, bx + 2 + sway * 0.7, hem - 12, 2, 2);
  }

  // ---- back arm (in shadow) and its pauldron dome ----
  arm(r, M, k.shB, elbowB, handB, true, p2);
  leg(r, M, k.hipB, k.kneeB, ankleB, true, p2);
  {
    const px = Math.max(k.shB[0] - 2, 46);
    const py = k.shB[1] - 4;
    plate(r, M.D, (m) => m.ellipse(0, px, py, 26, 20), { line: M.line, round: true });
    plate(r, M.T, (m) => m.poly(0, [[px - 14, py - 16], [px - 6, py - 38], [px + 2, py - 18]]), { line: M.line });
  }

  // ---- torso: frame waist, ribbed abdomen, the V chest, the core, vents, belt ----
  plate(r, M.F, (m) => m.rect(0, x0 + 20, top + 44, w - 36, h - 40), { line: M.line });
  plate(r, M.A, (m) => m.poly(0, [[x0 + 22, top + 50], [x0 + w - 10, top + 50], [x0 + w - 18, top + h - 10], [x0 + 30, top + h - 10]]), { line: M.line, round: true });
  plate(r, M.D, (m) => m.poly(0, [[x0 + 22, top + 50], [x0 + 38, top + 50], [x0 + 42, top + h - 10], [x0 + 30, top + h - 10]]), { line: M.line });
  for (let i = 0; i < 2; i++) r.seg(M.line, x0 + 40, top + 62 + i * 9, x0 + w - 16 - i * 2, top + 62 + i * 9, 1.2, 1.2);
  const chest: V2[] = [
    [x0 - 8, top + 6],
    [x0 + 12, top - 6],
    [x0 + w - 8, top - 8],
    [x0 + w + 10, top + 4],
    [x0 + w + 14, top + 24],
    [x0 + w - 2, top + 48],
    [x0 + w / 2 + 12, top + 60],
    [x0 + 22, top + 52],
    [x0 - 2, top + 34],
  ];
  plate(r, M.A, (m) => m.poly(0, chest), { line: M.line, round: true });
  // the shadowed flank (the far side of the barrel) and the sternum ridge
  plate(r, M.D, (m) => m.poly(0, [[x0 - 8, top + 6], [x0 + 12, top - 6], [x0 + 26, top - 4], [x0 + 30, top + 50], [x0 + 22, top + 52], [x0 - 2, top + 34]]), { line: M.line });
  r.seg(M.A[4], x0 + w / 2 + 12, top + 50, x0 + w / 2 + 12, top + 58, 2, 2);
  // the gold collar edge across the top of the chest
  r.poly(M.T[3], [[x0 + 12, top - 6], [x0 + w - 8, top - 8], [x0 + w + 10, top + 4], [x0 + w + 6, top + 7], [x0 + w - 10, top - 4], [x0 + 14, top - 2]]);
  r.poly(M.T[1], [[x0 + w + 6, top + 7], [x0 + w + 10, top + 4], [x0 + w + 14, top + 24], [x0 + w + 11, top + 24]]);
  // heat cracks across the plate once enraged
  if (p2) {
    const cracks: V2[][] = [
      [[x0 + 40, top + 6], [x0 + 46, top + 16], [x0 + 42, top + 24], [x0 + 50, top + 34]],
      [[x0 + w - 4, top + 12], [x0 + w - 12, top + 20], [x0 + w - 8, top + 30], [x0 + w - 16, top + 40]],
      [[x0 + w / 2 + 2, top + 50], [x0 + w / 2 - 6, top + 46], [x0 + w / 2 - 14, top + 50]],
    ];
    for (const c of cracks) for (let i = 0; i + 1 < c.length; i++) r.seg(M.accent, c[i][0], c[i][1], c[i + 1][0], c[i + 1][1], 2, 1.6);
  }
  // the reactor core: gunmetal housing, gold ring, dark socket, the glow and its white-hot heart
  {
    const rx = x0 + w / 2 + 14;
    const ry = top + 24;
    const swell = power * 4 + pulse * 0.8;
    plate(r, M.G, (m) => m.ellipse(0, rx, ry, 18, 18), { line: M.line, round: true });
    for (let a = 0; a < 8; a++) {
      const an = (a * Math.PI) / 4 + Math.PI / 8;
      r.rect(M.GD[0], rx + Math.cos(an) * 15.5 - 1, ry + Math.sin(an) * 15.5 - 1, 2, 2);
    }
    r.ellipse(M.T[3], rx, ry, 13.5, 13.5);
    r.ellipse(M.deep, rx, ry, 11.5, 11.5);
    r.ellipse(M.accent, rx, ry, 9.5 + swell * 0.4, 9.5 + swell * 0.4);
    r.ellipse(M.glow, rx + 0.5, ry - 0.5, 5.5 + swell * 0.6, 5.5 + swell * 0.6);
    r.ellipse(M.white, rx + 1, ry - 1, 2.5 + swell * 0.4, 2.5 + swell * 0.4);
  }
  // flank vents under the front pauldron: three slanted slots
  for (let i = 0; i < 3; i++) {
    const vx = x0 + w - 16 + i * 1.5;
    const vy = top + 34 + i * 6;
    r.seg(M.line, vx - 8, vy + 2, vx + 6, vy - 1, 4, 4);
    r.seg(M.vent, vx - 7, vy + 2, vx + 5, vy - 1, 2.4, 2.4);
    if (p2) r.seg(M.ventHot, vx - 4, vy + 1.4, vx + 2, vy, 1.2, 1.2);
  }
  // back vents on the far flank (the enraged sheet vents heat out of both sides)
  for (let i = 0; i < 3; i++) {
    const vx = x0 + 10;
    const vy = top + 14 + i * 8;
    r.seg(M.line, vx - 4, vy, vx + 6, vy + 2, 4, 4);
    r.seg(M.vent, vx - 3, vy, vx + 5, vy + 2, 2.2, 2.2);
  }
  // belt: a dark band, a gold buckle with an accent gem
  plate(r, M.D, (m) => m.poly(0, [[x0 + 24, top + h - 15], [x0 + w - 12, top + h - 15], [x0 + w - 14, top + h - 2], [x0 + 26, top + h - 2]]), { line: M.line });
  for (let i = 0; i < 5; i++) r.rect(M.GD[2], x0 + 30 + i * ((w - 50) / 5), top + h - 11, 4, 6);
  {
    const bx = x0 + w / 2 + 6;
    const by = top + h - 8;
    plate(r, M.T, (m) => m.poly(0, [[bx - 12, by - 9], [bx + 12, by - 9], [bx + 9, by + 8], [bx, by + 12], [bx - 9, by + 8]]), { line: M.line, round: true });
    r.poly(M.accent, [[bx, by - 4], [bx + 4, by + 1], [bx, by + 6], [bx - 4, by + 1]]);
  }
  // back tasset
  {
    const [tx, ty] = k.hipB;
    plate(r, M.D, (m) => m.poly(0, [[tx - 16, ty - 4], [tx + 6, ty - 4], [tx + 4, ty + 16], [tx - 14, ty + 12]]), { line: M.line });
  }

  // ---- front leg, then the front tasset over its hip ----
  leg(r, M, k.hipF, k.kneeF, ankleF, false, p2);
  {
    const [tx, ty] = k.hipF;
    plate(r, M.A, (m) => m.poly(0, [[tx - 12, ty - 6], [tx + 20, ty - 6], [tx + 18, ty + 12], [tx + 6, ty + 20], [tx - 10, ty + 14]]), { line: M.line, round: true });
    r.poly(M.T[2], [[tx - 10, ty + 12], [tx + 6, ty + 18], [tx + 18, ty + 10], [tx + 18, ty + 13], [tx + 6, ty + 21], [tx - 10, ty + 15]]);
  }

  // ---- head: high collar, the monolith helm, crest fins, the eye-slit ----
  helm(r, M, hx, hy, hs, top, ph, p2, power);

  // ---- front arm, then the great front pauldron over the shoulder ----
  arm(r, M, k.shF, elbowF, handF, false, p2);
  {
    const px = Math.min(k.shF[0] + 4, r.w - 44);
    const py = k.shF[1] + 2;
    // one gold crest fin swept back off the top
    plate(r, M.T, (m) => m.poly(0, [[px - 20, py - 16], [px - 34, py - 40], [px - 4, py - 22]]), { line: M.line });
    // two lames hanging under the dome, each with a gold edge
    plate(r, M.D, (m) => m.poly(0, [[px - 28, py + 8], [px + 28, py + 6], [px + 26, py + 20], [px - 24, py + 22]]), { line: M.line });
    r.seg(M.T[1], px - 24, py + 20, px + 24, py + 18, 2.2, 2.2);
    plate(r, M.A, (m) => m.poly(0, [[px - 30, py + 0], [px + 32, py - 2], [px + 30, py + 10], [px - 28, py + 12]]), { line: M.line });
    r.seg(M.T[2], px - 26, py + 10, px + 28, py + 8, 2.2, 2.2);
    // the dome: a big rounded shell with a gold rim along its lower edge
    plate(r, M.A, (m) => m.ellipse(0, px, py - 2, 32, 24), { line: M.line, round: true, clip: [0, 0, r.w, py + 4] });
    r.seg(M.T[3], px - 31, py + 2, px + 31, py + 1, 3, 3);
    for (const [ox, oy] of [[-18, -8], [0, -16], [18, -8]] as V2[]) r.rect(M.G[3], px + ox - 1.5, py + oy - 1.5, 3, 3);
    // the enraged sheet adds a heat seam across the dome
    if (p2) r.seg(M.accent, px - 20, py - 4, px + 22, py - 6, 1.6, 1.6);
  }
}

interface Mats {
  A: Ramp;
  D: Ramp;
  F: Ramp;
  G: Ramp;
  GD: Ramp;
  T: Ramp;
  C: Ramp;
  line: number;
  deep: number;
  accent: number;
  glow: number;
  white: number;
  vent: number;
  ventHot: number;
}

/** A material's five flat tones, dark to light: shadow edge, shade, base, lit, highlight. */
type Ramp = [number, number, number, number, number];

function ramp(r: Raster, base: RGB, lo: RGB, shine: number): Ramp {
  return [
    r.part(mix(lo, [12, 10, 26], 0.3), { flat: true }),
    r.part(mix(base, lo, 0.5), { flat: true }),
    r.part(base, { flat: true }),
    r.part(mix(mul(base, 1.14), [255, 244, 220], shine * 0.35), { flat: true }),
    r.part(mix(mul(base, 1.3), [255, 246, 228], shine), { flat: true }),
  ];
}

/** The halo: plated arcs on a ring, every other one lit (all of them when enraged or powering up), turning by frame. */
function halo(r: Raster, M: Mats, cx: number, cy: number, ph: number, p2: boolean, power: number): void {
  const N = 12;
  const R = 58 + power * 6;
  // 5 degrees a frame loops cleanly over the 6-frame idle (one segment step); the enraged halo turns twice as fast
  const rot = ((ph * (p2 ? 10 : 5) - 90) * Math.PI) / 180;
  const arc = ((2 * Math.PI) / N) * 0.74;
  // faint inner ring and four struts back to the helm
  for (let i = 0; i < 4; i++) {
    const a = rot * 0.5 + (i * Math.PI) / 2 + Math.PI / 4;
    r.seg(M.GD[1], cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6), 3, 2);
  }
  for (let i = 0; i < N; i++) {
    const a0 = rot + (i * 2 * Math.PI) / N;
    const a1 = a0 + arc;
    const ring = (rad: number, n: number): V2[] => Array.from({ length: n + 1 }, (_, j) => [cx + Math.cos(a0 + ((a1 - a0) * j) / n) * rad, cy + Math.sin(a0 + ((a1 - a0) * j) / n) * rad] as V2);
    const outer = ring(R + 6, 6);
    const inner = ring(R - 6, 6).reverse();
    plate(r, M.G, (m) => m.poly(0, [...outer, ...inner]), { line: M.line });
    const lit = p2 || power > 0.5 || i % 2 === 0;
    const mid = ring(R, 6);
    for (let j = 0; j + 1 < mid.length; j++) r.seg(lit ? M.accent : M.GD[0], mid[j][0], mid[j][1], mid[j + 1][0], mid[j + 1][1], 2.4, 2.4);
    if (lit) r.ellipse(M.glow, mid[3][0], mid[3][1], 1.8, 1.8);
  }
}

/** The helm sunk into a high collar: a slab with a swept crest, a gold brow band, a dark faceplate and the eye-slit. */
function helm(r: Raster, M: Mats, hx: number, hy: number, hs: number, top: number, ph: number, p2: boolean, power: number): void {
  // the collar: two high plates either side of the neck, so the helm sits down inside the armour
  plate(r, M.F, (m) => m.rect(0, hx + 4, hy + hs - 8, hs - 4, top - (hy + hs) + 14), { line: M.line });
  plate(r, M.D, (m) => m.poly(0, [[hx - 12, top + 6], [hx - 8, hy + hs - 18], [hx + 6, hy + hs - 6], [hx + 10, top + 4]]), { line: M.line });
  // crest: three fins swept back off the crown, the tall one in the middle
  plate(r, M.G, (m) => m.poly(0, [[hx + 2, hy + 2], [hx - 14, hy - 20], [hx + 12, hy - 2]]), { line: M.line });
  plate(r, M.T, (m) => m.poly(0, [[hx + 12, hy - 2], [hx + 4, hy - 34], [hx + 16, hy - 26], [hx + 28, hy - 4]]), { line: M.line });
  plate(r, M.G, (m) => m.poly(0, [[hx + 28, hy - 4], [hx + 26, hy - 22], [hx + 40, hy - 6]]), { line: M.line });
  // the helm slab
  const slab: V2[] = [
    [hx - 4, hy + 6],
    [hx + 6, hy - 6],
    [hx + hs - 4, hy - 8],
    [hx + hs + 8, hy + 2],
    [hx + hs + 12, hy + hs * 0.55],
    [hx + hs + 6, hy + hs + 2],
    [hx + 6, hy + hs + 2],
    [hx - 6, hy + hs - 8],
  ];
  plate(r, M.A, (m) => m.poly(0, slab), { line: M.line, round: true });
  // the far side of the helm in shade, with a gunmetal ear disc
  plate(r, M.D, (m) => m.poly(0, [[hx - 4, hy + 6], [hx + 6, hy - 6], [hx + 14, hy - 6], [hx + 14, hy + hs + 2], [hx + 6, hy + hs + 2], [hx - 6, hy + hs - 8]]), { line: M.line });
  plate(r, M.G, (m) => m.ellipse(0, hx + 16, hy + hs * 0.5, 8, 8), { line: M.line, round: true });
  r.ellipse(M.accent, hx + 16, hy + hs * 0.5, 2.5, 2.5);
  // the gold brow band
  r.poly(M.T[3], [[hx + 6, hy - 6], [hx + hs - 4, hy - 8], [hx + hs + 8, hy + 2], [hx + hs + 6, hy + 6], [hx + hs - 6, hy - 3], [hx + 8, hy - 1]]);
  // the faceplate: a dark mask on the front half, a heavy brow over the slit, a vented jaw
  const fx0 = hx + hs * 0.46;
  const fx1 = hx + hs + 10;
  const sy = hy + hs * 0.38;
  plate(r, M.F, (m) => m.poly(0, [[fx0, hy + 8], [fx1 - 2, hy + 6], [fx1 + 2, sy + 4], [fx1 - 2, hy + hs - 2], [fx0 + 4, hy + hs - 2], [fx0 - 4, sy + 8]]), { line: M.line });
  plate(r, M.A, (m) => m.poly(0, [[fx0 - 6, sy - 10], [fx1 + 4, sy - 12], [fx1 + 6, sy - 4], [fx0 - 2, sy - 2]]), { line: M.line });
  for (let i = 0; i < 4; i++) r.rect(M.deep, fx0 + 6 + i * 6, sy + 12, 2, hy + hs - sy - 16);
  // cheek vents
  for (let i = 0; i < 3; i++) r.seg(M.vent, fx0 - 10, sy + 6 + i * 5, fx0 - 2, sy + 6 + i * 5, 2, 2);
  // the eye-slit: a long glowing bar with a white-hot core and a scanning spot riding along it
  const eh = p2 ? 7.5 : 6;
  const ex0 = fx0 - 2;
  const ex1 = fx1 + 3;
  r.rect(M.deep, ex0 - 1, sy - 2 - eh / 2, ex1 - ex0 + 2, eh + 4);
  r.rect(M.accent, ex0, sy - eh / 2, ex1 - ex0, eh);
  r.rect(M.glow, ex0 + 2, sy - eh / 2 + 1, ex1 - ex0 - 3, eh - 2);
  const scan = ex0 + 4 + ((ph * 7) % Math.max(1, ex1 - ex0 - 10));
  r.rect(M.white, scan, sy - eh / 2 + 0.5, 6, eh - 1);
  if (power > 0) {
    // powering up: the slit throws a flare forward and a hot glint above and below
    const L = 8 + power * 14;
    r.seg(M.glow, ex1, sy, ex1 + L, sy, 2.4, 0.8);
    r.seg(M.accent, ex1 - 4, sy - 1, ex1 + 2, sy - 7 - power * 4, 1.6, 0.8);
    r.seg(M.accent, ex1 - 4, sy + 1, ex1 + 2, sy + 7 + power * 4, 1.6, 0.8);
  }
  if (p2) {
    // the enraged slit bleeds a line of light down the mask
    r.seg(M.accent, ex1 - 6, sy + eh / 2, ex1 - 8, sy + eh / 2 + 10, 1.4, 0.8);
  }
}

/** Upper arm, elbow, the bell gauntlet and the hammer fist (the far arm `back` takes the shadowed armour). */
function arm(r: Raster, M: Mats, sh: V2, el: V2, hand: V2, back: boolean, p2: boolean): void {
  const [hx, hy] = hand;
  let dx = hx - el[0];
  let dy = hy - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const wr: V2 = [hx - dx * 14, hy - dy * 14];
  plate(r, M.F, (m) => m.seg(0, sh[0], sh[1], el[0], el[1], 24, 22), { line: M.line });
  // a hydraulic strut along the upper arm
  r.seg(back ? M.GD[1] : M.G[2], sh[0] + 6, sh[1] + 4, el[0] + 5, el[1] - 4, 4, 4);
  plate(r, back ? M.D : M.A, (m) => m.seg(0, el[0], el[1], wr[0], wr[1], 26, 36), { line: M.line, round: true });
  // a gold band two thirds down the gauntlet and its accent seam
  const b0: V2 = [el[0] + (wr[0] - el[0]) * 0.62, el[1] + (wr[1] - el[1]) * 0.62];
  const nx = -dy;
  const ny = dx;
  r.seg(back ? M.T[1] : M.T[3], b0[0] - nx * 15, b0[1] - ny * 15, b0[0] + nx * 15, b0[1] + ny * 15, 4, 4);
  if (!back || p2) r.seg(M.accent, b0[0] - nx * 12 + dx * 4, b0[1] - ny * 12 + dy * 4, b0[0] + nx * 12 + dx * 4, b0[1] + ny * 12 + dy * 4, 1.6, 1.6);
  plate(r, back ? M.GD : M.G, (m) => m.ellipse(0, el[0], el[1], 9, 8.5), { line: M.line, round: true });
  fist(r, M, hand, [dx, dy], back);
}

/** A hammer fist: a dark cuff, a big chamfered block, a gunmetal knuckle plate with the finger breaks, a thumb over the top. */
function fist(r: Raster, M: Mats, h: V2, dir: V2, back: boolean): void {
  const [x, y] = h;
  const [dx, dy] = dir;
  const nx = -dy;
  const ny = dx;
  // the fist's local frame: u along the forearm, v across it
  const P = (u: number, v: number): V2 => [x + dx * u + nx * v, y + dy * u + ny * v];
  plate(r, M.F, (m) => m.seg(0, ...P(-14, -16), ...P(-14, 16), 8, 8), { line: M.line });
  plate(r, back ? M.D : M.A, (m) => m.poly(0, [P(-12, -18), P(8, -20), P(16, -14), P(18, 12), P(10, 19), P(-12, 18)]), { line: M.line, round: true });
  plate(r, back ? M.GD : M.G, (m) => m.poly(0, [P(8, -18), P(16, -14), P(18, 12), P(10, 17), P(6, 12), P(6, -14)]), { line: M.line, round: true });
  for (let i = 0; i < 3; i++) {
    const v = -8 + i * 8;
    r.seg(M.line, ...P(7, v), ...P(17, v), 1.2, 1.2);
  }
  plate(r, back ? M.D : M.A, (m) => m.seg(0, ...P(-6, -16), ...P(6, -18), 7, 6), { line: M.line });
  if (!back) r.seg(M.T[3], ...P(-12, -17), ...P(-12, 17), 2.2, 2.2);
}

/** Thigh, knee guard, greave and sabaton (the far leg in shade). */
function leg(r: Raster, M: Mats, hip: V2, kn: V2, ankle: V2, back: boolean, p2: boolean): void {
  plate(r, M.F, (m) => m.seg(0, hip[0], hip[1], kn[0], kn[1], 34, 30), { line: M.line });
  plate(r, back ? M.D : M.A, (m) => m.seg(0, hip[0] + 4, hip[1] + 6, kn[0] + 3, kn[1] - 6, 26, 22), { line: M.line, round: true });
  plate(r, back ? M.D : M.A, (m) => m.seg(0, kn[0], kn[1], ankle[0], ankle[1] - 4, 32, 28), { line: M.line, round: true });
  // a vent down the shin
  r.seg(M.line, kn[0] + 7, kn[1] + 12, ankle[0] + 6, ankle[1] - 16, 4, 4);
  r.seg(back && !p2 ? M.deep : M.vent, kn[0] + 7, kn[1] + 13, ankle[0] + 6, ankle[1] - 17, 2, 2);
  // knee guard with a gold rim
  plate(r, back ? M.D : M.A, (m) => m.poly(0, [[kn[0] - 4, kn[1] - 12], [kn[0] + 14, kn[1] - 10], [kn[0] + 22, kn[1] + 2], [kn[0] + 12, kn[1] + 14], [kn[0] - 2, kn[1] + 8]]), { line: M.line, round: true });
  r.seg(back ? M.T[1] : M.T[3], kn[0] + 14, kn[1] - 9, kn[0] + 21, kn[1] + 2, 2, 2);
  r.rect(back ? M.GD[2] : M.G[3], kn[0] + 7, kn[1] - 2, 3, 3);
  // the sabaton: a heavy wedge with a gunmetal toe cap and a gold heel plate
  const [bx, by] = ankle;
  plate(r, back ? M.D : M.A, (m) => m.poly(0, [[bx - 22, by - 8], [bx + 16, by - 10], [bx + 34, by + 4], [bx + 36, by + 14], [bx - 24, by + 14]]), { line: M.line, round: true });
  plate(r, back ? M.GD : M.G, (m) => m.poly(0, [[bx + 22, by - 2], [bx + 34, by + 4], [bx + 36, by + 14], [bx + 20, by + 14]]), { line: M.line });
  r.rect(back ? M.T[1] : M.T[3], bx - 22, by + 1, 14, 3);
}

/** A scratch coverage mask (same size as the frame) that remembers the box it was painted in. */
class Mask extends Raster {
  bx0 = 1e9;
  by0 = 1e9;
  bx1 = -1;
  by1 = -1;
  override set(_p: number, x: number, y: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.id[y * this.w + x] = 1;
    if (x < this.bx0) this.bx0 = x;
    if (x > this.bx1) this.bx1 = x;
    if (y < this.by0) this.by0 = y;
    if (y > this.by1) this.by1 = y;
  }
  clear(): void {
    for (let y = this.by0; y <= this.by1; y++) this.id.fill(0, y * this.w + this.bx0, y * this.w + this.bx1 + 1);
    this.bx0 = this.by0 = 1e9;
    this.bx1 = this.by1 = -1;
  }
}
let scratch: Mask | null = null;

/**
 * Paint one plate: `draw` lays its shape into a mask, which is then filled from `R` with a bevel lit from up-front (the
 * boss faces +x): the top edge takes the highlight, the front edge the lit tone, the back edge and the row above the
 * bottom the shade, and the bottom edge the shadow. `round` adds a soft specular high on the front of the interior and
 * shade low at the back; `soft` (cloth) skips the hard top highlight; `line` draws a 1px dark keyline around it first so
 * a piece reads apart from whatever it overlaps; `clip` keeps only the part of the shape inside [x0, y0, x1, y1).
 */
function plate(r: Raster, R: Ramp, draw: (m: Raster) => void, o: { line?: number; round?: boolean; soft?: boolean; clip?: [number, number, number, number] } = {}): void {
  if (!scratch || scratch.w !== r.w || scratch.h !== r.h) scratch = new Mask(r.w, r.h);
  const m = scratch;
  draw(m);
  if (m.bx1 < 0) return;
  const W = r.w;
  const id = m.id;
  if (o.clip) {
    const [cx0, cy0, cx1, cy1] = o.clip;
    for (let y = m.by0; y <= m.by1; y++) for (let x = m.bx0; x <= m.bx1; x++) if (x < cx0 || y < cy0 || x >= cx1 || y >= cy1) id[y * W + x] = 0;
  }
  const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < r.h && id[y * W + x] === 1;
  if (o.line !== undefined) {
    for (let y = m.by0 - 1; y <= m.by1 + 1; y++)
      for (let x = m.bx0 - 1; x <= m.bx1 + 1; x++) if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) r.set(o.line, x, y);
  }
  const bw = Math.max(1, m.bx1 - m.bx0);
  const bh = Math.max(1, m.by1 - m.by0);
  const sx = m.bx0 + bw * 0.64;
  const sy = m.by0 + bh * 0.3;
  const run = (x: number, y: number, dx: number, dy: number): number => {
    let n = 0;
    while (n < 3 && at(x + dx * (n + 1), y + dy * (n + 1))) n++;
    return n;
  };
  for (let y = m.by0; y <= m.by1; y++)
    for (let x = m.bx0; x <= m.bx1; x++) {
      if (!at(x, y)) continue;
      const u = run(x, y, 0, -1);
      const d = run(x, y, 0, 1);
      const f = run(x, y, 1, 0);
      const b = run(x, y, -1, 0);
      let t = 2;
      if (d === 0) t = 0;
      else if (u === 0) t = o.soft ? 3 : 4;
      else if (f === 0) t = 3;
      else if (b === 0 || d === 1) t = 1;
      else if (u === 1 && !o.soft) t = 3;
      else {
        const fu = (x - m.bx0) / bw;
        const fv = (y - m.by0) / bh;
        if (o.round) {
          const ex = (x - sx) / (bw * 0.26);
          const ey = (y - sy) / (bh * 0.2);
          if (ex * ex + ey * ey < 1) t = 3;
          else if (fv > 0.7 || (fu < 0.25 && fv > 0.4)) t = 1;
        } else if (bh > 12 && fv > 0.72) t = 1;
      }
      r.set(R[t], x, y);
    }
  m.clear();
}

/** `v` kept inside the box; the same object back when it already was (so callers can tell whether it moved). */
function clampV(v: V2, x0: number, x1: number, y0: number, y1: number): V2 {
  const x = Math.max(x0, Math.min(x1, v[0]));
  const y = Math.max(y0, Math.min(y1, v[1]));
  return x === v[0] && y === v[1] ? v : [x, y];
}

/**
 * `x` nudged just far enough that none of the tones the shader can give it lands within reach of the accent or its bloom
 * white (the finishing pass blooms any pixel near those). Leans darker by the smallest step that clears.
 */
function keepClear(x: RGB, accent: RGB, o: { flat?: boolean; soft?: boolean }): RGB {
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
  if (ok(x)) return x;
  for (let n = 1; n <= 14; n++) {
    const v = mix(x, mul(x, 0.55), Math.min(1, n * 0.07));
    if (ok(v)) return v;
  }
  return mul(x, 0.5);
}

/** Hold every non-emissive part this drawer creates clear of the glow colours: only parts made emissive on purpose bloom. */
function guardGlow(r: Raster, accent: RGB): void {
  const raw = r.part.bind(r);
  r.part = (c: RGB, o: { emissive?: boolean; flat?: boolean; soft?: boolean } = {}): number => (o.emissive ? raw(c, o) : raw(keepClear(c, accent, o), o));
}
