import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * The Overseer: the arena's warden body. A towering armoured colossus with a monolithic helm and a single vertical scanning eye,
 * a halo of rotating segments, a pulsing reactor ring, hydraulic limbs and hammer fists.
 */
export function drawOverseer(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.55);
  const accent = col(look.accent);
  const glow = mix(accent, [255, 235, 235], 0.6);
  const steel: RGB = [150, 148, 176];
  const P = {
    armor: r.part(armor),
    plate: r.part(mix(armor, [200, 196, 240], 0.2)),
    dark: r.part(dark),
    deep: r.part(deep),
    steel: r.part(steel),
    steelD: r.part(mul(steel, 0.6)),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    cable: r.part([30, 28, 44]),
    seam: r.part(deep, { flat: true }),
    mark: r.part(accent, { flat: true }),
    rivet: r.part(steel, { flat: true }),
    glass: r.part([18, 14, 28]),
  };
  const T = k.torso;
  const ph = k.phase;
  const pulse = 0.5 + 0.5 * Math.sin(ph * 1.4);
  const hs = k.head.s;
  const hx = k.head.x;
  const hy = k.head.y;

  // ---- halo of rotating segments behind the head ----
  {
    const cx = hx + hs / 2;
    const cy = hy + hs / 2 + 6;
    for (let i = 0; i < 18; i++) {
      const a0 = (i / 18) * Math.PI * 2 + ph * 0.18;
      const a1 = a0 + 0.22;
      const on = (i + Math.floor(ph / 2)) % 3 !== 0;
      const R0 = hs * 1.1;
      r.seg(on ? P.accent : P.deep, cx + Math.cos(a0) * R0, cy + Math.sin(a0) * R0 * 0.9, cx + Math.cos(a1) * R0, cy + Math.sin(a1) * R0 * 0.9, on ? 6 : 4, on ? 6 : 4);
    }
  }

  // ---- back arm ----
  {
    const el = k.elbowB;
    r.seg(P.cable, k.shB[0], k.shB[1], el[0], el[1], 30, 26);
    r.seg(P.deep, el[0], el[1], k.handB[0], k.handB[1], 28, 26);
    r.ellipse(P.dark, el[0], el[1], 16, 16);
    fist(r, P, k.handB, true);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- cables hanging off the back ----
  for (let i = 0; i < 4; i++) {
    const bx = T.x - 4 + i * 6;
    let px = bx;
    let py = T.y + 14;
    for (let j = 0; j < 6; j++) {
      const nx = px - 4 - i + Math.sin(ph * 0.9 + i + j * 0.6) * 2;
      const ny = py + 10;
      r.seg(P.cable, px, py, nx, ny, 5, 4);
      px = nx;
      py = ny;
    }
  }

  // ---- torso ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    r.rect(P.deep, x0 + 20, top + h - 24, w - 40, 26); // waist
    r.poly(P.armor, [[x0 + 10, top], [x0 + w - 6, top], [x0 + w + 8, top + 22], [x0 + w - 18, top + h - 14], [x0 + 22, top + h - 14], [x0 - 4, top + 22]]);
    r.poly(P.dark, [[x0 - 4, top + 22], [x0 + 10, top], [x0 + 34, top + 4], [x0 + 38, top + h - 18], [x0 + 22, top + h - 14]]);
    r.poly(P.plate, [[x0 + 36, top + 6], [x0 + w - 16, top + 6], [x0 + w - 6, top + 24], [x0 + w - 26, top + h - 26], [x0 + 40, top + h - 26], [x0 + 28, top + 24]]);
    // reactor ring
    const rx = x0 + w / 2 + 6;
    const ry = top + 38;
    r.ellipse(P.deep, rx, ry, 22, 22);
    r.ellipse(P.steel, rx, ry, 19, 19);
    r.ellipse(P.deep, rx, ry, 16, 16);
    r.ellipse(P.accent, rx, ry, 13, 13);
    r.ellipse(P.glow, rx, ry, 6 + pulse * 3, 6 + pulse * 3);
    for (let a = 0; a < 8; a++) r.rect(P.rivet, rx + Math.cos((a * Math.PI) / 4) * 20 - 1.5, ry + Math.sin((a * Math.PI) / 4) * 20 - 1.5, 3, 3);
    // ribs, vents, seams
    for (let i = 0; i < 4; i++) {
      r.rect(P.dark, x0 + 44, top + h - 40 + i * 6, w - 70, 4);
      r.rect(P.seam, x0 + 44, top + h - 41 + i * 6, w - 70, 1);
    }
    r.rect(P.accent, x0 + 30, top + 40, 3, 26);
    r.rect(P.accent, x0 + w - 24, top + 40, 3, 26);
    r.rect(P.seam, x0 + w / 2 + 6, top + 8, 2, 14);
    // belt of segments + hip plates
    r.rect(P.deep, x0 + 6, top + h - 14, w - 12, 14);
    for (let i = 0; i < 8; i++) r.rect(i % 2 ? P.accent : P.steelD, x0 + 10 + i * ((w - 24) / 8), top + h - 11, (w - 24) / 8 - 3, 7);
    r.poly(P.armor, [[x0 + 6, top + h], [x0 + 38, top + h], [x0 + 34, top + h + 22], [x0 + 12, top + h + 18]]);
    r.poly(P.armor, [[x0 + w - 38, top + h], [x0 + w - 6, top + h], [x0 + w - 12, top + h + 18], [x0 + w - 34, top + h + 22]]);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  // ---- head: monolith helm with a vertical scanning eye ----
  {
    r.rect(P.deep, hx + 12, T.y - 14, hs - 24, 18); // neck pistons
    r.rect(P.steel, hx + 18, T.y - 12, 6, 14);
    r.rect(P.steel, hx + hs - 28, T.y - 12, 6, 14);
    // antenna spikes
    for (let i = 0; i < 3; i++) {
      const sx = hx + 8 + i * (hs / 3);
      r.poly(P.dark, [[sx, hy + 4], [sx + 4 + i, hy - 20 - i * 6], [sx + 9, hy + 4]]);
      r.ellipse(P.accent, sx + 4 + i, hy - 20 - i * 6, 2.5, 2.5);
    }
    r.poly(P.armor, [[hx - 2, hy + 10], [hx + 6, hy], [hx + hs - 4, hy], [hx + hs + 6, hy + 10], [hx + hs + 6, hy + hs - 6], [hx + hs - 6, hy + hs + 4], [hx + 4, hy + hs + 2], [hx - 2, hy + hs - 8]]);
    r.poly(P.plate, [[hx + 6, hy + 1], [hx + hs - 4, hy + 1], [hx + hs, hy + 8], [hx + 8, hy + 8]]);
    r.rect(P.dark, hx - 4, hy + 10, 12, hs - 14);
    // face glass and the eye
    r.rect(P.deep, hx + hs / 2 - 4, hy + 12, hs / 2 + 6, hs - 18);
    r.rect(P.glass, hx + hs / 2 - 1, hy + 14, hs / 2, hs - 22);
    const ey = hy + 16 + ((ph * 3) % (hs - 30));
    r.rect(P.accent, hx + hs / 2 + 6, hy + 14, 5, hs - 22);
    r.rect(P.glow, hx + hs / 2 + 4, ey, 9, 4);
    r.rect(P.steelD, hx + 6, hy + hs - 8, hs - 4, 6); // jaw
    for (let i = 0; i < 3; i++) r.rect(P.seam, hx + 2, hy + 14 + i * 6, 8, 1);
  }

  // ---- front arm: stacked pauldron, hydraulic upper arm, bracer, hammer fist ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    r.seg(P.cable, sx, sy, el[0], el[1], 32, 28);
    r.seg(P.steelD, sx + 6, sy + 4, el[0] + 6, el[1] - 4, 7, 7);
    r.seg(P.armor, el[0], el[1], k.handF[0], k.handF[1], 30, 28);
    r.seg(P.plate, el[0] + (k.handF[0] - el[0]) * 0.3, el[1] + (k.handF[1] - el[1]) * 0.3, el[0] + (k.handF[0] - el[0]) * 0.65, el[1] + (k.handF[1] - el[1]) * 0.65, 34, 32);
    r.ellipse(P.dark, el[0], el[1], 18, 18);
    r.ellipse(P.armor, el[0] - 1, el[1] - 1, 14, 14);
    fist(r, P, k.handF, false);
    // pauldron: three stacked plates and a glowing rim
    r.ellipse(P.deep, sx + 2, sy - 6, 34, 24);
    r.ellipse(P.armor, sx, sy - 8, 30, 20);
    r.poly(P.plate, [[sx - 24, sy - 20], [sx + 22, sy - 24], [sx + 28, sy - 10], [sx - 22, sy - 6]]);
    r.rect(P.mark, sx - 28, sy + 4, 56, 3);
    r.rect(P.rivet, sx - 14, sy - 16, 4, 4);
    r.rect(P.rivet, sx + 10, sy - 18, 4, 4);
  }
}

type Parts = Record<'armor' | 'plate' | 'dark' | 'deep' | 'steel' | 'steelD' | 'accent' | 'glow' | 'cable' | 'seam' | 'mark' | 'rivet' | 'glass', number>;

function fist(r: Raster, P: Parts, h: V2, back: boolean): void {
  const [x, y] = h;
  r.rect(P.deep, x - 24, y - 22, 49, 44);
  r.rect(back ? P.dark : P.armor, x - 22, y - 22, 45, 40);
  r.rect(back ? P.armor : P.plate, x - 22, y - 22, 45, 8);
  for (let i = 0; i < 3; i++) r.rect(P.deep, x - 12 + i * 11, y - 6, 2, 22);
  r.rect(P.accent, x - 22, y + 8, 45, 5);
  r.rect(P.steel, x - 20, y - 20, 5, 5);
  r.rect(P.steel, x + 14, y - 20, 5, 5);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  r.seg(back ? P.deep : P.dark, hip[0], hip[1], kn[0], kn[1], 46, 38);
  r.seg(back ? P.deep : P.armor, kn[0], kn[1], ankle[0], ankle[1], 38, 32);
  r.seg(P.steelD, hip[0] + 8, hip[1] + 6, kn[0] + 8, kn[1] - 6, 6, 6); // hydraulic strut
  if (!back) {
    r.ellipse(P.plate, kn[0] + 8, kn[1], 16, 15);
    r.rect(P.rivet, kn[0] + 6, kn[1] - 2, 4, 4);
    r.rect(P.mark, ankle[0] - 16, ankle[1] - 10, 32, 3);
  }
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(back ? P.deep : P.dark, [[bx - 20, by - 6], [bx + 18, by - 6], [bx + 34, by + 8], [bx + 34, by + 18], [bx - 24, by + 18]]);
  r.rect(back ? P.deep : P.armor, bx - 22, by - 6, 40, 8);
  r.rect(P.deep, bx - 24, by + 16, 60, 4);
}
