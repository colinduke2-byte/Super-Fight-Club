import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, Raster, type RGB, type V2 } from './raster';
import { solveLimb, type Skel } from './skeleton';

/**
 * Brick: a heavy powersuit bruiser. Designed silhouette-first: a barrel chest with the reactor core as the focal point,
 * two big domed pauldrons, a helm with a wide visor sitting down in a collar, thick bell gauntlets ending in big
 * knuckle-plated fists, and stocky legs on heavy boots. Every plate is a few large shapes painted with a hand-set bevel
 * (see `plate`): one light from up-front, so the top and front edges catch it and the lower and back edges fall away.
 * Value ladder: lit armour plates > shadowed armour (the far limbs) > the dark frame; gunmetal is the second material for
 * the joints, knuckles and fittings, and the accent glow is kept to the core, the visor and a couple of running lights.
 */
export function drawBrick(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const accent = col(look.accent);
  guardGlow(r, accent); // no part blooms unless it is emissive on purpose (see guardGlow)
  const glow = mix(accent, [255, 250, 220], 0.55);
  // the dark mechanical frame under the plates (joints, waist, thighs): the darkest value on the suit
  const frame: RGB = mix(mul(dark, 0.42), [22, 24, 34], 0.5);
  // gunmetal: kept a clear step away from the armour (darker under pale armour, lighter under deep armour)
  const lum = armor[0] * 0.3 + armor[1] * 0.59 + armor[2] * 0.11;
  const gunC: RGB = lum > 125 ? mix([74, 74, 84], dark, 0.15) : mix([132, 130, 138], armor, 0.1);
  const M: Mats = {
    A: ramp(r, armor, dark, 0.3),
    D: ramp(r, mix(armor, dark, 0.72), mul(dark, 0.6), 0.16),
    F: ramp(r, frame, mul(frame, 0.6), 0.08),
    G: ramp(r, gunC, mul(gunC, 0.5), 0.3),
    GD: ramp(r, mul(gunC, 0.7), mul(gunC, 0.4), 0.14),
    H: ramp(r, [226, 214, 186], [120, 106, 84], 0.3),
    HD: ramp(r, [160, 146, 120], [92, 80, 64], 0.12),
    line: r.part(mix(frame, [6, 6, 14], 0.45), { flat: true }),
    deep: r.part(mix(frame, [0, 0, 6], 0.35), { flat: true }),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    stripeA: r.part(accent, { flat: true, emissive: true }), // hazard stripes glow on purpose
    stripeB: r.part([20, 22, 36], { flat: true }),
  };
  const glass = r.part(mix(accent, [200, 240, 255], 0.5), { emissive: true });
  const smoke = r.part(mix([150, 152, 166], dark, 0.25), { soft: true });
  const smokeD = r.part(mix([96, 98, 116], dark, 0.3), { soft: true });
  const T = k.torso;
  const pulse = k.phase % 2;
  // outfits: 1 = Siege (horned great helm with a T-slit, spiked pauldron), 2 = Diver (round diving helmet, air tank)
  const o = look.outfit ?? 0;
  // keep the gauntlets and boots inside the frame on the widest reaches (they are the biggest pieces at a limb's end)
  const handF = clampV(k.handF, 19, r.w - 20, 17, r.h - 17);
  const handB = clampV(k.handB, 19, r.w - 20, 17, r.h - 17);
  const ankleF = clampV(k.ankleF, 16, r.w - 24, 0, k.base - 8);
  const ankleB = clampV(k.ankleB, 16, r.w - 24, 0, k.base - 8);
  // a hand pulled in re-solves its elbow, so the arm folds naturally instead of stretching to the old joint
  const elbowF = clampV(handF === k.handF ? k.elbowF : solveLimb(k.shF, handF, k.armBone, 1).mid, 14, r.w - 13, 12, r.h - 12);
  const elbowB = clampV(handB === k.handB ? k.elbowB : solveLimb(k.shB, handB, k.armBone, 1).mid, 14, r.w - 13, 12, r.h - 12);
  const kneeF = clampV(k.kneeF, 14, r.w - 14, 0, r.h - 16);
  const kneeB = clampV(k.kneeB, 14, r.w - 14, 0, r.h - 16);
  const hx = k.head.x;
  const hy = k.head.y;
  const hs = k.head.s;
  const x0 = T.x;
  const top = T.y;
  const w = T.w;
  const h = T.h;

  // ---- back pack: twin exhaust stacks (or the diver's air tank), tucked behind the far shoulder ----
  if (o === 2) {
    // the tank stands up past the far shoulder, so it shows above the pauldron
    const bx = Math.max(x0 - 2, 12);
    const by = top - 12;
    plate(r, M.F, (m) => m.seg(0, bx + 6, by - 1, hx + 1, hy + hs - 8, 5, 5), { line: M.line });
    plate(r, M.G, (m) => m.seg(0, bx + 6, by + 6, bx + 6, by + 30, 13, 13), { line: M.line, round: true });
    plate(r, M.GD, (m) => m.rect(0, bx + 3, by - 2, 6, 4), { line: M.line });
    r.rect(M.stripeA, bx, by + 11, 13, 2);
  } else {
    const bx = Math.max(x0 + 3, 17);
    const by = top + 4;
    const tips: [number, number][] = [
      [Math.max(bx - 8, 11), by - 10],
      [Math.max(bx + 1, 16), by - 14],
    ];
    // exhaust: puffs of smoke rising off the pipe mouths and drifting back, cycling with the animation
    tips.forEach(([mx, my], i0) => {
      for (let i = 0; i < 2; i++) {
        const t = (k.phase * 0.17 + i * 0.5 + i0 * 0.25) % 1;
        const x = Math.max(9, mx - 2 - t * 6 - k.pose.lean * 0.8 * t);
        const y = Math.max(9, my - 5 - t * 9);
        const rad = 2 + t * 2;
        r.ellipse(smokeD, x + 0.6, y + 0.6, rad, rad * 0.85);
        r.ellipse(smoke, x, y, rad - 0.8, rad * 0.85 - 0.8);
      }
    });
    plate(r, M.G, (m) => m.seg(0, bx + 1, by + 6, tips[0][0], tips[0][1], 10, 9), { line: M.line });
    plate(r, M.G, (m) => m.seg(0, bx + 9, by + 6, tips[1][0], tips[1][1], 10, 9), { line: M.line });
    for (const [mx, my] of tips) {
      r.ellipse(M.deep, mx - 0.5, my - 1.5, 2.6, 1.6);
    }
  }

  // ---- back arm (in shadow): frame upper arm, gunmetal elbow, a shadowed gauntlet ----
  arm(r, M, k.shB, elbowB, handB, true);
  // ---- back leg ----
  leg(r, M, k.hipB, kneeB, ankleB, true);
  // ---- back pauldron: only its rear dome shows past the chest, bulking out the shoulder line ----
  {
    const px = Math.max(k.shB[0] - 2, 21);
    const py = k.shB[1] - 3;
    plate(r, M.D, (m) => m.ellipse(0, px, py, 16, 13), { line: M.line, round: true });
  }

  // ---- torso: collar ring, frame waist, the barrel chest, reactor core, belt ----
  const ccx = hx + hs / 2 + 1; // the collar centre (under the helm)
  plate(r, M.F, (m) => m.ellipse(0, ccx, top + 1, 18, 7), { line: M.line });
  plate(r, M.F, (m) => m.rect(0, x0 + 8, top + 28, w - 14, h - 34), { line: M.line });
  plate(r, M.GD, (m) => m.rect(0, x0 + 12, top + h - 16, w - 22, 4), { line: M.line });
  plate(
    r,
    M.A,
    (m) =>
      m.poly(0, [
        [x0 - 1, top + 6],
        [x0 + 10, top - 2],
        [x0 + w - 8, top - 3],
        [x0 + w + 4, top + 5],
        [x0 + w + 8, top + 17],
        [x0 + w + 4, top + 29],
        [x0 + w - 6, top + 36],
        [x0 + 12, top + 37],
        [x0 + 1, top + 30],
        [x0 - 4, top + 18],
      ]),
    { line: M.line, round: true },
  );
  // the core: a gunmetal housing ring, a dark socket, the glowing reactor and its hot centre
  {
    const rx = x0 + w / 2 + 4;
    const ry = top + 19;
    plate(r, M.G, (m) => m.ellipse(0, rx, ry, 11.5, 11.5), { line: M.line, round: true });
    r.ellipse(M.deep, rx, ry, 8.5, 8.5);
    r.ellipse(M.accent, rx, ry, 7, 7);
    r.ellipse(M.glow, rx + 0.5, ry - 0.5, 3.6 + pulse * 0.6, 3.6 + pulse * 0.6);
  }
  // the belt, with a hazard band across the back of it (the front is covered by the tasset)
  plate(r, M.D, (m) => m.rect(0, x0 + 1, top + h - 11, w - 2, 10), { line: M.line });
  r.rect(M.stripeB, x0 + 6, top + h - 8, 18, 4);
  for (let i = 0; i < 4; i++) r.poly(M.stripeA, [[x0 + 6 + i * 5, top + h - 4], [x0 + 8 + i * 5, top + h - 8], [x0 + 10 + i * 5, top + h - 8], [x0 + 8 + i * 5, top + h - 4]]);

  // ---- front leg, then the tasset that hangs from the belt over its hip ----
  leg(r, M, k.hipF, kneeF, ankleF, false);
  {
    const [tx, ty] = k.hipF;
    plate(r, M.A, (m) => m.poly(0, [[tx - 8, ty - 3], [tx + 11, ty - 3], [tx + 10, ty + 7], [tx + 2, ty + 11], [tx - 7, ty + 8]]), { line: M.line });
  }

  // ---- head ----
  if (o === 1) helmSiege(r, M, hx, hy, hs, pulse);
  else if (o === 2) helmDiver(r, M, hx, hy, hs, top, glass);
  else helmVisor(r, M, hx, hy, hs, k.phase);
  // the gorget: a collar lip in front of the neck, so the helm sits down in the suit instead of on top of it
  if (o !== 2) {
    plate(r, M.A, (m) => m.poly(0, [[hx + 4, top + 1], [hx + hs + 6, top - 1], [hx + hs + 10, top + 5], [hx + hs + 6, top + 9], [hx + 6, top + 9]]), { line: M.line });
  }

  // ---- front arm and its pauldron ----
  arm(r, M, k.shF, elbowF, handF, false);
  {
    const px = Math.min(k.shF[0] + 1, r.w - 22);
    const py = k.shF[1];
    // the rim: a shadowed lip under the dome
    plate(r, M.D, (m) => m.poly(0, [[px - 15, py + 2], [px + 15, py + 2], [px + 13, py + 8], [px - 13, py + 8]]), { line: M.line });
    if (o === 1) {
      for (let i = 0; i < 3; i++) {
        const sx = px - 9 + i * 9;
        plate(r, M.H, (m) => m.poly(0, [[sx - 4, py - 10], [sx + 4, py - 11], [sx + 1, py - 27 + Math.abs(i - 1) * 4]]), { line: M.line });
      }
    }
    plate(r, M.A, (m) => m.ellipse(0, px, py - 3, 16, 13), { line: M.line, round: true, clip: [0, 0, r.w, py + 4] });
  }
}

interface Mats {
  A: Ramp;
  D: Ramp;
  F: Ramp;
  G: Ramp;
  GD: Ramp;
  H: Ramp;
  HD: Ramp;
  line: number;
  deep: number;
  accent: number;
  glow: number;
  stripeA: number;
  stripeB: number;
}

/** A material's five flat tones, dark to light: shadow edge, shade, base, lit, highlight. */
type Ramp = [number, number, number, number, number];

function ramp(r: Raster, base: RGB, lo: RGB, shine: number): Ramp {
  return [
    r.part(mix(lo, [14, 12, 30], 0.3), { flat: true }),
    r.part(mix(base, lo, 0.5), { flat: true }),
    r.part(base, { flat: true }),
    r.part(mix(mul(base, 1.14), [255, 244, 220], shine * 0.35), { flat: true }),
    r.part(mix(mul(base, 1.28), [255, 246, 228], shine), { flat: true }),
  ];
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
 * fighter faces +x): the top edge takes the highlight, the front edge the lit tone, the back edge and the row above the
 * bottom the shade, and the bottom edge the shadow. `round` adds a soft specular on the upper front of the interior and
 * shade low at the back (domes, fists, pauldrons); `line` draws a 1px dark keyline around it first, so a piece reads apart
 * from whatever it overlaps; `clip` keeps only the part of the shape inside [x0, y0, x1, y1).
 */
function plate(r: Raster, R: Ramp, draw: (m: Raster) => void, o: { line?: number; round?: boolean; clip?: [number, number, number, number] } = {}): void {
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
      else if (u === 0) t = 4;
      else if (f === 0) t = 3;
      else if (b === 0 || d === 1) t = 1;
      else if (u === 1) t = 3;
      else {
        // form shade: the lower and back faces of a big plate turn away from the light
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

/** Upper arm, elbow, bell gauntlet and fist (the far arm `back` takes the shadowed armour). */
function arm(r: Raster, M: Mats, sh: V2, el: V2, hand: V2, back: boolean): void {
  const [hx, hy] = hand;
  let dx = hx - el[0];
  let dy = hy - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const wr: V2 = [hx - dx * 8, hy - dy * 8];
  plate(r, M.F, (m) => m.seg(0, sh[0], sh[1], el[0], el[1], 15, 13), { line: M.line });
  plate(r, back ? M.D : M.A, (m) => m.seg(0, el[0], el[1], wr[0], wr[1], 16, 21), { line: M.line, round: true });
  plate(r, back ? M.GD : M.G, (m) => m.ellipse(0, el[0], el[1], 5, 4.5), { line: M.line, round: true });
  fist(r, M, hand, [dx, dy], back);
}

/**
 * An armoured fist: a dark cuff across the wrist (with a thin glowing seam on the lead hand), a big chamfered gauntlet
 * shell, a gunmetal knuckle plate on the striking face with the finger breaks cut into it, and a thumb over the top.
 */
function fist(r: Raster, M: Mats, h: V2, dir: V2, back: boolean): void {
  const [x, y] = h;
  const [dx, dy] = dir;
  const nx = -dy;
  const ny = dx;
  const cx = x - dx * 9;
  const cy = y - dy * 9;
  plate(r, M.F, (m) => m.seg(0, cx - nx * 9, cy - ny * 9, cx + nx * 9, cy + ny * 9, 6, 6), { line: M.line });
  if (!back) r.seg(M.accent, cx - nx * 7 + dx * 1.5, cy - ny * 7 + dy * 1.5, cx + nx * 7 + dx * 1.5, cy + ny * 7 + dy * 1.5, 1.4, 1.4);
  const shell = back ? M.D : M.A;
  plate(
    r,
    shell,
    (m) =>
      m.poly(0, [
        [x - 8, y - 10],
        [x + 7, y - 10],
        [x + 10, y - 7],
        [x + 10, y + 7],
        [x + 7, y + 10],
        [x - 8, y + 10],
        [x - 11, y + 7],
        [x - 11, y - 7],
      ]),
    { line: M.line, round: true },
  );
  plate(r, back ? M.GD : M.G, (m) => m.poly(0, [[x + 3, y - 9], [x + 9, y - 9], [x + 12, y - 6], [x + 12, y + 6], [x + 9, y + 9], [x + 3, y + 9]]), { line: M.line });
  for (let i = 0; i < 3; i++) r.rect(M.line, x + 4, y - 4 + i * 5, 7, 1);
  plate(r, back ? M.GD : M.D, (m) => m.seg(0, x - 6, y - 7, x + 2, y - 9, 6, 5), { line: M.line });
}

/** Frame thigh, gunmetal knee, a greave that flares toward the ankle, and a heavy boot with a gunmetal toe cap. */
function leg(r: Raster, M: Mats, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  const S = back ? M.D : M.A;
  plate(r, M.F, (m) => m.seg(0, hip[0], hip[1], kn[0], kn[1], 19, 16), { line: M.line });
  // a thigh plate one step down the ladder from the greave (it sits under the belt, out of the light)
  const t1 = lerp(hip, kn, 0.75);
  plate(r, back ? M.F : M.D, (m) => m.seg(0, hip[0] + 1, hip[1] + 2, t1[0] + 1, t1[1], 16, 13), { line: M.line, round: true });
  const s0 = lerp(kn, ankle, 0.1);
  plate(r, S, (m) => m.seg(0, s0[0], s0[1], ankle[0], ankle[1] - 5, 17, 21), { line: M.line, round: true });
  const kx = kn[0] + 3;
  const ky = kn[1] - 1;
  plate(r, S, (m) => m.poly(0, [[kx - 7, ky - 7], [kx + 5, ky - 8], [kx + 10, ky], [kx + 5, ky + 8], [kx - 7, ky + 6]]), { line: M.line, round: true });
  const [bx, by] = ankle;
  // the sole sits on the ankle line + 8 (the floor); the keyline under it is the last opaque row
  plate(r, M.F, (m) => m.rect(0, bx - 11, by + 4, 28, 3), { line: M.line });
  plate(r, S, (m) => m.poly(0, [[bx - 10, by - 4], [bx + 5, by - 5], [bx + 12, by - 1], [bx + 16, by + 4], [bx - 10, by + 4]]), { line: M.line });
  plate(r, back ? M.GD : M.G, (m) => m.poly(0, [[bx + 6, by - 1], [bx + 12, by - 1], [bx + 16, by + 4], [bx + 6, by + 4]]), { line: M.line });
}

/** The standard helm: a rounded shell with a low crest, a wide visor slot that runs out to the front edge, a jaw plate. */
function helmVisor(r: Raster, M: Mats, hx: number, hy: number, hs: number, phase: number): void {
  plate(r, M.D, (m) => m.poly(0, [[hx + 5, hy + 2], [hx + 9, hy - 5], [hx + hs - 7, hy - 5], [hx + hs - 2, hy + 2]]), { line: M.line });
  plate(
    r,
    M.A,
    (m) =>
      m.poly(0, [
        [hx - 1, hy + hs + 1],
        [hx - 2, hy + 9],
        [hx + 3, hy + 1],
        [hx + 10, hy - 2],
        [hx + hs - 3, hy - 2],
        [hx + hs + 3, hy + 4],
        [hx + hs + 5, hy + 11],
        [hx + hs + 5, hy + hs - 3],
        [hx + hs + 1, hy + hs + 1],
      ]),
    { line: M.line, round: true },
  );
  // jaw plate under the visor
  plate(r, M.D, (m) => m.poly(0, [[hx + 11, hy + 19], [hx + hs + 5, hy + 19], [hx + hs + 4, hy + hs - 3], [hx + hs, hy + hs + 1], [hx + 12, hy + hs + 1]]), { line: M.line });
  // the visor: a dark slot cut through to the front edge, the glowing band in it and a bright glint that sweeps along it
  r.poly(M.deep, [[hx + 9, hy + 9], [hx + hs + 6, hy + 8], [hx + hs + 6, hy + 18], [hx + 11, hy + 18]]);
  r.rect(M.accent, hx + 12, hy + 11, hs - 6, 5);
  const g = hx + 13 + ((phase * 4) % (hs - 12));
  r.rect(M.glow, g, hy + 12, 5, 3);
  // the side bolt that holds the visor hinge
  plate(r, M.G, (m) => m.ellipse(0, hx + 5, hy + 16, 4.5, 4.5), { line: M.line, round: true });
}

/** Siege: a flat-topped great helm with two big horns and a glowing T-slit. */
function helmSiege(r: Raster, M: Mats, hx: number, hy: number, hs: number, pulse: number): void {
  // horns, thick at the root and curving up and outward: the far one behind the helm in shade, the near one in front
  for (const [bx, dir, far] of [[hx + 3, -1, true], [hx + hs - 1, 1, false]] as const) {
    let px = bx;
    let py = hy + 7;
    const pts: V2[] = [[px, py]];
    for (let i = 0; i < 5; i++) {
      px += dir * (5 - i * 0.9);
      py -= 3.2 + i * 1.1;
      pts.push([px, py]);
    }
    plate(r, far ? M.HD : M.H, (m) => {
      for (let i = 0; i < 5; i++) m.seg(0, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 10 - i * 1.9, 8.1 - i * 1.9);
    }, { line: M.line, round: !far });
  }
  plate(
    r,
    M.A,
    (m) =>
      m.poly(0, [
        [hx - 2, hy + hs + 1],
        [hx - 2, hy + 3],
        [hx + 2, hy - 2],
        [hx + hs + 1, hy - 2],
        [hx + hs + 5, hy + 3],
        [hx + hs + 5, hy + hs - 2],
        [hx + hs + 1, hy + hs + 1],
      ]),
    { line: M.line, round: true },
  );
  // a raised ridge down the face
  plate(r, M.D, (m) => m.rect(0, hx + hs - 2, hy - 1, 5, hs + 1), { line: M.line });
  // the T-slit
  r.rect(M.deep, hx + 8, hy + 10, hs - 3, 6);
  r.rect(M.deep, hx + hs - 8, hy + 10, 6, 15);
  r.rect(M.accent, hx + 10, hy + 12, hs - 7, 2);
  r.rect(M.accent, hx + hs - 6, hy + 12, 2, 11);
  r.rect(M.glow, hx + hs - 7, hy + 11, 4, 4 + pulse);
  for (let i = 0; i < 3; i++) r.rect(M.G[4], hx + 4 + i * 7, hy + hs - 3, 2, 2);
}

/** Diver: a big round helmet with a thick front port (two glowing eyes behind the glass) and a small top port. */
function helmDiver(r: Raster, M: Mats, hx: number, hy: number, hs: number, top: number, glass: number): void {
  const cx = hx + hs / 2 + 1;
  const cy = hy + hs / 2 + 1;
  const R = hs / 2 + 3;
  plate(r, M.A, (m) => m.ellipse(0, cx, cy, R, R), { line: M.line, round: true });
  // the breastplate collar the helmet is bolted into
  plate(r, M.G, (m) => m.ellipse(0, cx + 1, top + 3, R - 1, 5), { line: M.line });
  plate(r, M.G, (m) => m.ellipse(0, cx - 3, cy - R + 3, 4.5, 3.5), { line: M.line });
  r.ellipse(glass, cx - 3, cy - R + 3, 2.4, 1.8);
  const fx = cx + R * 0.42;
  const fy = cy + 1;
  plate(r, M.G, (m) => m.ellipse(0, fx, fy, 10.5, 10.5), { line: M.line, round: true });
  r.ellipse(M.deep, fx, fy, 7.4, 7.4);
  r.rect(M.glow, fx - 4, fy - 1, 3, 3);
  r.rect(M.glow, fx + 2, fy - 1, 3, 3);
  r.rect(glass, fx - 4, fy - 5, 3, 1);
}

function lerp(a: V2, b: V2, t: number): V2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** `v` kept inside the box; the same object back when it already was (so callers can tell whether it moved). */
function clampV(v: V2, x0: number, x1: number, y0: number, y1: number): V2 {
  const x = Math.max(x0, Math.min(x1, v[0]));
  const y = Math.max(y0, Math.min(y1, v[1]));
  return x === v[0] && y === v[1] ? v : [x, y];
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
