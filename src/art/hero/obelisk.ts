import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * Obelisk: a living obelisk golem. A tall granite shaft of carved stone courses that tapers toward the top, with a chamfered
 * shadow face down its side, chipped corners and cracks that glow with amethyst light; a cartouche of glowing glyphs and a
 * geode heart down its front; a bronze collar under a faceted amethyst pyramid head with one blazing eye-slit, ringed by a
 * crown of crystal spikes. Massive boulder shoulders sprout crystal clusters; the arms are chunky boulders hung on threads
 * of crystal light ending in heavy stone fists with amethyst knuckles, and the legs are boulder pillars on wide stone feet.
 * Crystals take `armor`, deep stone `armorDark`, glow `accent`.
 */
export function drawObelisk(r: Raster, k: Skel, look: PlaceholderLook): void {
  // outfits: 1 = Ancient (a weathered stone head with a carved face, moss and vines), 2 = Molten (basalt with magma seams, an obsidian crown)
  const o = look.outfit ?? 0;
  const stone = o === 2 ? mix(col(look.skin), [44, 38, 44], 0.78) : o === 1 ? mix(col(look.skin), [150, 140, 116], 0.4) : col(look.skin);
  const crystal = col(look.armor);
  const deepStone = col(look.armorDark);
  const glow = col(look.accent);
  guardGlow(r, glow); // no part blooms unless it is emissive on purpose (see guardGlow)
  // the collar's bronze is kept clear of the glow colour (an orange accent would otherwise set the whole collar blooming)
  const bronze: RGB = calm([196, 150, 74], glow);
  // the limbs are rough boulders a clear step darker and cooler than the dressed stone of the shaft, so an arm swung across
  // the body still parts from it; a near-black ink fills the gaps around every boulder
  // (Molten's shaft is near-black basalt, so there the boulders go the other way: a cooled, ashen grey a step above it)
  const rock = o === 2 ? mix(mul(stone, 1.3), [104, 96, 100], 0.32) : mix(mix(mul(stone, 0.8), deepStone, 0.12), [80, 78, 104], 0.14);
  const ink = mix(mul(deepStone, 0.5), [14, 10, 22], 0.6);
  // Molten's seams run with the glow: magma gold for a warm accent, the crystal's own colour for a cold one (Glacier)
  const warm = glow[0] >= glow[2];
  const hotSeam: RGB = warm ? [255, 200, 80] : mix(crystal, [255, 255, 255], 0.3);
  const hotVein: RGB = warm ? [255, 140, 40] : crystal;
  const P: Parts = {
    stone: r.part(stone),
    stoneL: r.part(mix(stone, [240, 232, 220], o === 2 ? 0.2 : 0.3)),
    stoneD: r.part(mix(stone, deepStone, 0.48)),
    stoneDeep: r.part(mix(stone, deepStone, 0.8)),
    // the limbs are rougher boulders, a shade darker and cooler than the dressed stone of the shaft so they part from it
    rock: r.part(rock),
    rockL: r.part(mix(rock, [236, 230, 222], o === 2 ? 0.24 : 0.36)),
    rockD: r.part(mix(rock, deepStone, 0.56)),
    rockDeep: r.part(mix(rock, deepStone, 0.82)),
    ink: r.part(ink, { flat: true }),
    // cracks in the boulders: a dark cut in rough rock (it must sit below the rock's own value), magma in the Molten look
    crack: o === 2 ? r.part(mix(glow, hotSeam, 0.3), { emissive: true, flat: true }) : r.part(mix(rock, ink, 0.62), { flat: true }),
    seam: o === 2 ? r.part(mix(glow, hotSeam, 0.3), { emissive: true, flat: true }) : r.part(mul(mix(stone, deepStone, 0.6), 0.72), { flat: true }),
    vein: r.part(o === 2 ? mix(glow, hotVein, 0.4) : mix(glow, crystal, 0.35), { emissive: true, flat: true }),
    panel: r.part(mix(stone, deepStone, 0.66)),
    glyph: r.part(mix(glow, crystal, 0.25), { emissive: true, flat: true }),
    crystal: r.part(crystal),
    crystalL: r.part(mix(crystal, [255, 255, 255], 0.5)),
    crystalD: r.part(mul(crystal, 0.58)),
    crystalDeep: r.part(mul(crystal, 0.34)),
    bronze: r.part(bronze),
    bronzeD: r.part(mul(bronze, 0.62)),
    glow: r.part(glow, { emissive: true }),
    core: r.part(mix(glow, [255, 255, 255], 0.6), { emissive: true }),
  };
  const moss = r.part([86, 128, 58], { soft: true });
  const mossL = r.part([132, 170, 80], { soft: true });
  const T = k.torso;
  const ph = k.phase;
  const pulse = 0.5 + 0.5 * Math.sin(ph * 1.3);
  const lean = k.pose.lean * 0.7;
  // the shaft bends with the pose: it is drawn upright, then sheared so its foot stays over the hips while its top
  // (and the head on it) leans on into the strike or snaps back from a hit
  const baseOff = -k.pose.lean;
  const topOff = k.pose.lean * 1.2;

  // the shaft's outline: a firm taper (upright here; see `baseOff` / `topOff`)
  const cx = T.x + T.w / 2;
  const topY = T.y - 6;
  const baseY = Math.min(T.y + T.h + 2, r.h - 5);
  const topHalf = T.w * 0.3;
  const baseHalf = T.w * 0.56;
  const tl: V2 = [cx - topHalf, topY];
  const tr: V2 = [cx + topHalf, topY];
  const br: V2 = [cx + baseHalf, baseY];
  const bl: V2 = [cx - baseHalf, baseY];
  const edgeAt = (y: number, side: -1 | 1): number => {
    const t = (y - topY) / (baseY - topY);
    return cx + side * (topHalf + (baseHalf - topHalf) * t);
  };

  // ---- two shards of crystal hanging in the air behind the shoulder, bobbing on their own and trailing a lunge: kept
  // large, in the shaded crystal tones and without a glint, so at game scale they read as shapes, not as sparkle ----
  {
    const shards: [number, number, number, number][] = [
      [-24, -14, 15, -0.3],
      [-30, 6, 10, 0.25],
    ];
    shards.forEach(([dx, dy, len, tilt], i) => {
      const x = Math.max(12, k.shB[0] + dx - lean * 0.6);
      const y = Math.max(8 + len, k.shB[1] + dy + Math.sin(ph * 1.1 + i * 2.1) * 2.2);
      prism(r, P, [x, y], -Math.PI / 2 + tilt, len, 6, true, false, true);
      prism(r, P, [x, y], Math.PI / 2 + tilt, len * 0.4, 6, true, false, true);
      if (o === 2) r.rect(P.vein, x - 0.5, y - len + 3, 1, 2); // Molten: a hot tip on the obsidian
    });
  }

  // ---- back arm and back leg ----
  boulderArm(r, P, k.shB, k.elbowB, k.handB, true, 1);
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true, o, moss);

  // ---- the shaft ----
  const shaft = (r: Raster): void => {
    r.poly(P.stone, [tl, tr, br, bl]);
    // the chamfered side face: a darker plane down the left, so it reads as a solid four-sided column
    const sideW = (y: number): number => 6 + ((y - topY) / (baseY - topY)) * 6;
    r.poly(P.stoneD, [tl, [tl[0] + sideW(topY), topY], [bl[0] + sideW(baseY), baseY], bl]);
    r.inlay(P.stoneD, P.stoneDeep, (set) => {
      for (let y = topY; y < baseY; y++) for (let x = edgeAt(y, -1); x < edgeAt(y, -1) + 2; x++) set(x, y);
    });
    // the lit right edge
    r.poly(P.stoneL, [[tr[0] - 3, topY], tr, br, [br[0] - 4, baseY]]);
    // stone courses: deep seams with a lit lip above each, the blocks offset like masonry
    const courses = 5;
    for (let i = 1; i < courses; i++) {
      const y = Math.round(topY + ((baseY - topY) * i) / courses);
      const x0 = edgeAt(y, -1);
      const x1 = edgeAt(y, 1);
      r.inlay(P.stone, P.seam, (set) => {
        for (let x = x0; x < x1; x++) set(x, y);
        const jx = x0 + (x1 - x0) * (i % 2 ? 0.72 : 0.3);
        for (let yy = 1; yy < (baseY - topY) / courses; yy++) set(jx, y + yy);
      });
      r.inlay(P.stoneD, P.stoneDeep, (set) => {
        for (let x = x0; x < x1; x++) set(x, y);
      });
      r.inlay(P.stone, P.stoneL, (set) => {
        for (let x = x0 + 6; x < x1 - 2; x++) set(x, y + 1);
      });
      // a chipped block corner on alternating sides: a dark bite out of the edge
      const side: -1 | 1 = i % 2 ? 1 : -1;
      const ex = edgeAt(y, side);
      r.poly(P.stoneDeep, [[ex, y - 1], [ex - side * 4, y + 1], [ex - side * 1, y + 5], [ex, y + 5]]);
    }
    // the cartouche: a sunken panel down the front face, rounded at the top, full of glowing glyphs
    const px = cx + 3;
    const pTop = topY + 7;
    const pBot = baseY - 10;
    const pw = topHalf * 0.85;
    r.poly(P.panel, [[px - pw / 2, pTop + 3], [px - pw / 2 + 2, pTop], [px + pw / 2 - 2, pTop], [px + pw / 2, pTop + 3], [px + pw / 2 + 2, pBot], [px - pw / 2 - 2, pBot]]);
    r.rect(P.stoneDeep, px - pw / 2 - 1, pTop + 1, 1, pBot - pTop - 1); // the sunken inner wall catches shade
    r.rect(P.stoneL, px - pw / 2 - 2, pBot, pw + 4, 1);
    const glyphs: ((x: number, y: number) => void)[] = [
      (x, y) => { r.rect(P.glyph, x - 2, y, 4, 1); r.rect(P.glyph, x, y - 2, 1, 5); }, // cross
      (x, y) => { r.ellipse(P.glyph, x, y, 2, 2); r.rect(P.panel, x - 0.5, y - 0.5, 1, 1); }, // ring
      (x, y) => { r.rect(P.glyph, x - 2, y - 2, 1, 4); r.rect(P.glyph, x - 2, y + 1, 4, 1); r.rect(P.glyph, x + 1, y - 2, 1, 4); }, // cup
      (x, y) => { r.poly(P.glyph, [[x, y - 3], [x + 2, y + 1], [x - 2, y + 1]]); }, // triangle
      (x, y) => { r.rect(P.glyph, x - 2, y - 2, 4, 1); r.rect(P.glyph, x - 1, y, 3, 1); r.rect(P.glyph, x - 2, y + 2, 4, 1); }, // bars
    ];
    // the geode heart through a crack, two-thirds of the way down the cartouche
    const hy = pTop + (pBot - pTop) * 0.6;
    for (let i = 0; i * 7 + pTop + 5 < hy - 10; i++) glyphs[(i * 3) % glyphs.length](px, pTop + 5 + i * 7);
    r.poly(P.stoneDeep, [[px - 6, hy - 9], [px + 1, hy - 11], [px + 7, hy - 1], [px + 5, hy + 9], [px - 1, hy + 10], [px - 7, hy + 1]]);
    r.poly(P.crystalD, [[px - 4, hy - 7], [px + 1, hy - 8], [px + 5, hy - 1], [px + 3, hy + 7], [px - 1, hy + 8], [px - 5, hy + 1]]);
    r.poly(P.crystal, [[px + 1, hy - 8], [px + 5, hy - 1], [px + 1, hy]]);
    r.poly(P.glow, [[px - 1, hy - 4], [px + 2, hy - 1], [px + 1, hy + 4], [px - 2, hy + 1]]);
    // the crown's heart flares as a strike lands
    const hot = (k.pose.hit ?? 0) >= 0.6 ? 1.5 : 0;
    r.ellipse(P.core, px, hy, 1 + pulse + hot, 1.2 + pulse + hot);
    // glowing amethyst cracks spreading from the heart across the stone
    const crack = (pts: V2[]): void => r.inlay(P.stone, P.vein, (set) => line(set, pts));
    crack([[px + 6, hy + 3], [px + 9, hy + 7], [px + 8, hy + 11], [px + 12, hy + 16], [edgeAt(hy + 20, 1) - 2, hy + 21]]);
    crack([[px - 6, hy - 4], [px - 9, hy - 8], [px - 8, hy - 12], [px - 12, hy - 17]]);
    crack([[px - 6, hy + 4], [px - 10, hy + 6], [px - 12, hy + 11]]);
    // a sliver of crystal breaking out of the left base corner, and a chunk knocked off the right
    prism(r, P, [bl[0] + 6, baseY - 4], -Math.PI / 2 - 0.5, 10, 5, false);
    r.poly(P.stoneDeep, [[br[0] - 7, baseY], [br[0], baseY - 7], [br[0], baseY]]);
    // the plinth band at the foot of the shaft
    r.poly(P.stoneD, [[bl[0] - 1, baseY - 4], [br[0] + 1, baseY - 4], [br[0] + 1, baseY + 1], [bl[0] - 1, baseY + 1]]);
    r.rect(P.stoneL, bl[0], baseY - 4, br[0] - bl[0], 1);
    if (o === 1) {
      // moss on the ledges of the courses, and vines trailing down the faces
      for (let i = 1; i < courses; i++) {
        const y = topY + ((baseY - topY) * i) / courses;
        const x0 = edgeAt(y, -1);
        const x1 = edgeAt(y, 1);
        for (let x = x0 + 1; x < x1 - 1; x += 3) if ((x * 7 + i * 5) % 11 < 6) r.ellipse((x + i) % 2 ? moss : mossL, x, y - 1, 2.4, 1.6);
      }
      for (const [vx, len] of [[edgeAt(topY + 4, -1) + 3, 30], [cx + 8, 18], [edgeAt(topY + 10, 1) - 3, 24]] as const) {
        for (let y = 0; y < len; y += 2) r.ellipse(y % 4 ? moss : mossL, vx + Math.sin(y * 0.4 + ph * 0.5) * 1.2, topY + 2 + y, 1.4, 1.4);
      }
    }
  };
  {
    const t = new Raster(r.w, r.h);
    shaft(t);
    const span = Math.max(1, baseY - topY);
    for (let y = 0; y < t.h; y++) {
      const off = Math.round(baseOff + (topOff - baseOff) * Math.min(1.15, Math.max(0, (baseY - y) / span)));
      for (let x = 0; x < t.w; x++) {
        const i = y * t.w + x;
        if (!t.id[i]) continue;
        const nx = x + off;
        if (nx < 0 || nx >= r.w) continue;
        r.id[y * r.w + nx] = t.id[i];
        r.over[y * r.w + nx] = t.over[i];
      }
    }
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false, o, moss);

  // ---- the head: a bronze collar, then the capstone ----
  {
    const bx = cx + Math.round(topOff + (topOff - baseOff) * (4 / Math.max(1, baseY - topY)));
    const half = topHalf + 9;
    const collarY = topY - 4;
    r.poly(P.bronzeD, [[bx - half - 2, collarY], [bx + half + 2, collarY], [bx + half, topY + 3], [bx - half, topY + 3]]);
    r.poly(P.bronze, [[bx - half - 2, collarY], [bx + half + 2, collarY], [bx + half + 1, collarY + 3], [bx - half - 1, collarY + 3]]);
    for (let i = -2; i <= 2; i++) r.rect(P.bronzeD, bx + i * (half * 0.42) - 0.5, collarY + 1, 1, 2);
    r.rect(P.vein, bx - half + 2, topY + 2, half * 2 - 4, 1); // light leaking under the collar
    const base = collarY;
    if (o === 1) {
      // a moai: a tall, narrow carved head turned to the front, a heavy brow ridge over deep-set glowing eyes, a long nose
      // running down the face and flaring past its edge, pursed lips over a jutting chin, and a long ear on the shadowed
      // side; a squat topknot of red scoria (a pukao) sits on the crown, moss on its lid
      const top = Math.max(11, base - k.head.s * 1.3);
      const H = base - top;
      const hw = half * 0.74;
      const L = bx - hw + 1; // the head's back edge
      const R = bx + hw + 1; // the face's front edge
      const fx = bx - hw * 0.3; // where the shadowed side plane turns into the face
      r.poly(P.ink, [[L - 1, base + 1], [L, top], [R + 1, top], [R + 1, base + 1]]);
      r.poly(P.stoneD, [[L, base], [L + 1, top + 1], [fx, top + 1], [fx, base]]);
      r.poly(P.stone, [[fx, base], [fx, top + 1], [R, top + 1], [R, base]]);
      r.rect(P.stoneL, fx + 1, top + 1, R - fx - 1, 1); // the lit crown edge
      r.rect(P.stoneL, fx, top + 2, 1, H - 3); // the corner between the planes catches the light
      // the long ear on the side plane, with its carved groove
      const ex = L + (fx - L) * 0.28;
      r.rect(P.stoneDeep, ex, top + H * 0.26, 5, H * 0.56);
      r.rect(P.stoneD, ex + 1, top + H * 0.26 + 1, 3, H * 0.56 - 2);
      r.rect(P.stoneDeep, ex + 2, top + H * 0.32, 1, H * 0.42);
      // the brow: a lit ridge standing proud of the face, a band of deep shadow under it holding the eyes
      const ey = top + H * 0.3;
      r.rect(P.stoneL, fx + 1, ey - 4, R - fx + 1, 2);
      r.rect(P.stoneDeep, fx + 1, ey - 2, R - fx - 1, 4);
      const nx = fx + (R - fx) * 0.52; // the nose's ridge line
      r.rect(P.glow, fx + 3, ey - 1, 4, 2);
      r.rect(P.glow, nx + 3, ey - 1, 4, 2);
      r.rect(P.core, nx + 4, ey - 1, 2, 1);
      // the nose: a long block down the face, lit along its ridge, shadow cast to its back; its base flares past the face
      const nb = ey + H * 0.4;
      r.rect(P.stoneD, nx - 3, ey + 2, 3, nb - ey - 2);
      r.rect(P.stone, nx, ey + 2, 3, nb - ey - 2);
      r.rect(P.stoneL, nx + 2, ey + 2, 1, nb - ey - 3);
      r.poly(P.stone, [[nx - 3, nb - 3], [R + 1, nb - 4], [R + 3, nb], [nx - 3, nb + 1]]);
      r.rect(P.stoneL, nx, nb - 4, R - nx + 1, 1);
      r.rect(P.stoneDeep, nx - 2, nb + 1, R - nx + 4, 2); // nostrils' shadow
      // pursed lips and the jutting chin
      const my = nb + (base - nb) * 0.45;
      r.rect(P.stoneD, nx - 4, my - 1, R - nx + 5, 2);
      r.rect(P.stoneDeep, nx - 4, my + 1, R - nx + 5, 1);
      r.poly(P.stone, [[nx - 5, base - 3], [R + 2, base - 4], [R + 2, base], [nx - 5, base]]);
      r.rect(P.stoneL, nx - 4, base - 4, R - nx + 5, 1);
      r.inlay(P.stone, P.seam, (set) => line(set, [[fx + 3, top + 3], [fx + 4, top + 6], [fx + 2, ey - 5]]));
      // the pukao: a squat cylinder of red scoria with a lit lid, moss growing over it
      const kx = bx - hw * 0.05;
      const kw = hw * 0.78;
      const kt = top - 6;
      const scoria = r.part(mix(stone, [150, 76, 56], 0.5));
      const scoriaD = r.part(mul(mix(stone, [150, 76, 56], 0.5), 0.7));
      r.rect(P.ink, kx - kw - 1, kt, kw * 2 + 2, top - kt + 1);
      r.rect(scoriaD, kx - kw, kt + 1, kw * 2, top - kt);
      r.rect(scoria, kx - kw * 0.4, kt + 1, kw * 1.4, top - kt);
      r.rect(P.stoneL, kx - kw * 0.4, kt + 1, kw * 1.4, 1);
      for (let x = kx - kw + 1; x < kx + kw * 0.3; x += 3) r.ellipse((x | 0) % 2 ? moss : mossL, x, kt + 1, 2, 1.5);
      r.ellipse(moss, kx - kw + 1, kt + 4, 1.4, 2.2); // a drip of moss over the rim
      for (let x = R - 6; x < R; x += 3) r.ellipse((x | 0) % 2 ? moss : mossL, x, top + 1, 1.6, 1.1);
    } else if (o === 2) {
      // a basalt war-helm: a shadowed back plane and a chamfered front plane with a lit top lip, magma running down
      // its cracks; an angry V eye-slit with a molten tear, and a grille of glowing teeth under it; obsidian spikes
      // ring the crown
      const top = base - k.head.s * 0.75;
      const mid = bx + half * 0.05;
      const spikes: [number, number][] = [[-0.85, 0.7], [-0.45, 1.1], [0, 1.4], [0.45, 1.15], [0.85, 0.75]];
      for (const [t, hgt] of spikes) prism(r, P, [bx + t * half, top + 6], -Math.PI / 2 + t * 0.35, Math.min(k.head.s * hgt, (top + 6 - 3) / Math.cos(t * 0.35)), 7, false);
      r.poly(P.ink, [[bx - half - 1, base], [bx - half + 2, top + 3], [bx + half - 2, top + 3], [bx + half + 1, base]]);
      r.poly(P.stoneDeep, [[bx - half, base], [bx - half + 3, top + 4], [mid, top + 4], [mid, base]]);
      r.poly(P.stoneD, [[mid, base], [mid, top + 4], [bx + half - 3, top + 4], [bx + half, base]]);
      r.rect(P.stone, bx - half + 4, top + 4, 2 * half - 7, 1); // the lit lip under the spikes
      r.rect(P.stone, mid, top + 5, 1, base - top - 6); // the chamfer edge
      // magma seams down the plates
      const crackOn = (pts: V2[]): void => {
        r.inlay(P.stoneDeep, P.seam, (set) => line(set, pts));
        r.inlay(P.stoneD, P.seam, (set) => line(set, pts));
      };
      crackOn([[bx - half * 0.55, top + 5], [bx - half * 0.62, top + 9], [bx - half * 0.5, base - 2]]);
      crackOn([[bx + half * 0.8, top + 5], [bx + half * 0.72, top + 8]]);
      // the eye: a V slit dipping toward the front, a white-hot core, and a molten tear running from it
      const ey = top + (base - top) * 0.5;
      r.poly(P.ink, [[bx - half * 0.4, ey - 4], [bx + half * 0.15, ey - 1], [bx + half * 0.85, ey - 4], [bx + half * 0.85, ey + 3], [bx - half * 0.4, ey + 3]]);
      r.poly(P.glow, [[bx - half * 0.3, ey - 2], [bx + half * 0.15, ey], [bx + half * 0.78, ey - 2], [bx + half * 0.74, ey + 2], [bx - half * 0.3, ey + 1.5]]);
      r.rect(P.core, bx + half * 0.3, ey, 5, 1.4);
      r.rect(P.vein, bx + half * 0.55, ey + 3, 1, 3);
      r.rect(P.vein, bx + half * 0.55, ey + 6 + (ph % 2), 1, 1);
      // the jaw: a dark grille with glowing gaps between the teeth
      const jy = base - 5;
      r.rect(P.ink, bx - half * 0.1, jy, half * 0.95, 4);
      for (let i = 0; i < 4; i++) r.rect(P.vein, bx - half * 0.02 + i * half * 0.22, jy + 1, 1, 2);
        } else {
      // a faceted amethyst pyramid: shaded left facet, mid front facet, lit right facet, hard ridge lines between them
      const tipY = Math.max(3, base - k.head.s * 1.1);
      const tip: V2 = [bx + 2, tipY];
      const ridgeX = bx - half * 0.2;
      r.poly(P.crystal, [[bx - half, base], tip, [bx + half, base]]);
      r.poly(P.crystalD, [[bx - half, base], tip, [ridgeX, base]]);
      r.poly(P.crystalL, [tip, [bx + half, base], [bx + half * 0.45, base]]);
      r.seg(P.crystalDeep, tip[0], tip[1] + 2, ridgeX, base - 1, 1, 1);
      r.seg(P.crystalL, tip[0] + 1, tip[1] + 3, bx + half * 0.45, base - 1, 1, 1);
      // internal glints
      r.rect(P.crystalL, bx - half * 0.6, base - 6, 1, 3);
      r.rect(P.crystalL, bx + half * 0.05, base - (base - tipY) * 0.62, 1, 3);
      r.rect(P.core, tip[0], tip[1] + 2, 1, 2);
      // the eye: a blazing slit across the front facet with a hot white core
      const ey = base - (base - tipY) * 0.38;
      r.poly(P.crystalDeep, [[bx - half * 0.4, ey - 3], [bx + half * 0.9, ey - 1], [bx + half * 0.84, ey + 5], [bx - half * 0.4, ey + 4]]);
      r.poly(P.glow, [[bx + half * 0.02, ey], [bx + half * 0.74, ey + 1], [bx + half * 0.7, ey + 3], [bx + half * 0.02, ey + 2.5]]);
      r.rect(P.core, bx + half * 0.38, ey + 0.8, 5, 1.4);
      // the crystal crown: small spikes breaking out around the base of the pyramid
      const crown: [number, number, number][] = [[-1.05, -0.9, 8], [-0.7, -0.45, 10], [0.75, 0.4, 9], [1.05, 0.85, 7]];
      for (const [t, a, l] of crown) prism(r, P, [bx + t * half, base + 1], -Math.PI / 2 + a, l, 4.5, t < 0);
    }
  }

  // ---- front arm ----
  boulderArm(r, P, k.shF, k.elbowF, k.handF, false, 2);
}

interface Parts {
  stone: number;
  stoneL: number;
  stoneD: number;
  stoneDeep: number;
  rock: number;
  rockL: number;
  rockD: number;
  rockDeep: number;
  ink: number;
  crack: number;
  seam: number;
  vein: number;
  panel: number;
  glyph: number;
  crystal: number;
  crystalL: number;
  crystalD: number;
  crystalDeep: number;
  bronze: number;
  bronzeD: number;
  glow: number;
  core: number;
}

/** Plot a polyline through `pts` one pixel at a time. */
function line(set: (x: number, y: number) => void, pts: V2[]): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let j = 0; j <= n; j++) set(x0 + ((x1 - x0) * j) / n, y0 + ((y1 - y0) * j) / n);
  }
}

/** A fan of three crystal prisms growing out of a shoulder, pointing up and out to `side`. */
function cluster(r: Raster, P: Parts, at: V2, side: -1 | 1, back: boolean): void {
  const specs: [number, number, number][] = [
    [-0.2, 18, 7],
    [0.25, 13, 6],
    [0.7, 9, 5],
  ];
  for (const [a, len, wid] of specs) {
    const ang = -Math.PI / 2 + side * a;
    prism(r, P, [at[0] + side * a * 7, at[1] + Math.abs(a) * 3], ang, len, wid, back);
  }
}

/** A pointed hexagonal prism: shaded and lit facets and a glowing ridge. */
function prism(r: Raster, P: Parts, base: V2, ang: number, len: number, wid: number, back: boolean, glint = true, rim = false): void {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const px = -uy;
  const py = ux;
  const hw = wid / 2;
  const shaft = len * 0.7;
  const b0: V2 = [base[0] + px * hw, base[1] + py * hw];
  const b1: V2 = [base[0] - px * hw, base[1] - py * hw];
  const s0: V2 = [b0[0] + ux * shaft, b0[1] + uy * shaft];
  const s1: V2 = [b1[0] + ux * shaft, b1[1] + uy * shaft];
  const tip: V2 = [base[0] + ux * len, base[1] + uy * len];
  if (rim) r.poly(P.ink, [[b0[0] + px * 1.2, b0[1] + py * 1.2], [s0[0] + px * 1.2, s0[1] + py * 1.2], [tip[0] + ux * 1.4, tip[1] + uy * 1.4], [s1[0] - px * 1.2, s1[1] - py * 1.2], [b1[0] - px * 1.2, b1[1] - py * 1.2]]);
  r.poly(back ? P.crystalDeep : P.crystalD, [b0, s0, tip, s1, b1]);
  const m0: V2 = [base[0] + px * hw * 0.1, base[1] + py * hw * 0.1];
  const m1: V2 = [m0[0] + ux * shaft, m0[1] + uy * shaft];
  r.poly(back ? P.crystalD : P.crystalL, [b1, s1, tip, m1, m0]);
  if (glint && len > 6) r.seg(P.glow, m0[0] + ux * len * 0.25, m0[1] + uy * len * 0.25, m1[0], m1[1], 1, 1);
}

/**
 * A rough-hewn boulder along a->b (widths w0 at a, w1 at b): an irregular octagon in three tones (a shadowed rim, the
 * stone face set up-left of it and a lit facet on the upper side), so every rock reads as a solid lump with depth.
 */
function boulder(r: Raster, P: Parts, a: V2, b: V2, w0: number, w1: number, back: boolean, seed: number): void {
  const S = back ? P.rockD : P.rock;
  const SD = back ? P.rockDeep : P.rockD;
  const SL = back ? P.rock : P.rockL;
  let ux = b[0] - a[0];
  let uy = b[1] - a[1];
  const l = Math.hypot(ux, uy) || 1;
  ux /= l;
  uy /= l;
  const px = -uy;
  const py = ux;
  const j = (i: number): number => (((seed * 7 + i * 13) % 5) - 2) * 0.35;
  const outline = (inset: number): V2[] => {
    const pts: V2[] = [];
    const hw = (t: number): number => Math.max(1.5, (w0 + (w1 - w0) * t) / 2 - inset);
    const cap = (w: number): number => Math.max(1, w * 0.32 - inset);
    // around: start cap, one side, end cap, other side
    const ts = [0.08, 0.5, 0.92];
    pts.push([a[0] - ux * cap(w0) + px * hw(0) * 0.45, a[1] - uy * cap(w0) + py * hw(0) * 0.45]);
    ts.forEach((t, i) => pts.push([a[0] + ux * l * t + px * (hw(t) + j(i)), a[1] + uy * l * t + py * (hw(t) + j(i))]));
    pts.push([b[0] + ux * cap(w1) + px * hw(1) * 0.45, b[1] + uy * cap(w1) + py * hw(1) * 0.45]);
    pts.push([b[0] + ux * cap(w1) - px * hw(1) * 0.45, b[1] + uy * cap(w1) - py * hw(1) * 0.45]);
    [...ts].reverse().forEach((t, i) => pts.push([a[0] + ux * l * t - px * (hw(t) + j(i + 3)), a[1] + uy * l * t - py * (hw(t) + j(i + 3))]));
    pts.push([a[0] - ux * cap(w0) - px * hw(0) * 0.45, a[1] - uy * cap(w0) - py * hw(0) * 0.45]);
    return pts;
  };
  // an ink contour a pixel outside the stone, so each boulder parts from whatever it lies over (the shaft, the other limbs)
  r.poly(P.ink, outline(-1.3));
  r.poly(SD, outline(0));
  const face = outline(2.2).map(([x, y]): V2 => [x + 0.5, y - 1]);
  r.poly(S, face);
  // the lit facet: the strip of the face nearest the key light, high and in front (the side the shaft is lit from)
  const s = px * 0.45 + py * -0.9 >= 0 ? 1 : -1; // which side faces the light
  const lit: V2[] = [];
  const hwF = (t: number): number => (w0 + (w1 - w0) * t) / 2 - 2.2;
  for (const t of [0.12, 0.5, 0.85]) lit.push([a[0] + ux * l * t + px * s * hwF(t) + 0.5, a[1] + uy * l * t + py * s * hwF(t) - 1]);
  for (const t of [0.75, 0.45, 0.2]) lit.push([a[0] + ux * l * t + px * s * (hwF(t) - 3) + 0.5, a[1] + uy * l * t + py * s * (hwF(t) - 3) - 1]);
  r.poly(SL, lit);
  // a hairline crack across the face
  const ct = 0.35 + ((seed * 3) % 4) * 0.08;
  const cxm = a[0] + ux * l * ct;
  const cym = a[1] + uy * l * ct;
  const hwc = hwF(ct);
  r.inlay(S, back ? P.rockDeep : P.crack, (set) =>
    line(set, [
      [cxm - px * s * hwc * 0.2, cym - py * s * hwc * 0.2],
      [cxm - px * s * hwc * 0.8 + ux * 3, cym - py * s * hwc * 0.8 + uy * 3],
    ]),
  );
}

/**
 * A massive arm: a boulder shoulder with a crystal cluster growing out of it, an upper-arm boulder and a forearm boulder hung
 * on a thread of crystal light (it shows in the gaps), and a heavy stone fist with amethyst knuckles.
 */
function boulderArm(r: Raster, P: Parts, sh: V2, el: V2, handIn: V2, back: boolean, seed: number): void {
  // keep the heavy fist inside the frame on the widest reaches
  // (a fist driven straight down carries its knuckles and their shards below the hand, so it stops higher)
  const down = Math.max(0, (handIn[1] - el[1]) / (Math.hypot(handIn[0] - el[0], handIn[1] - el[1]) || 1));
  const hand: V2 = [Math.max(18, Math.min(r.w - 18, handIn[0])), Math.max(17, Math.min(r.h - 15 - down * 12, handIn[1]))];
  // the thread of light first, so the stones sit on it and it shows in the gaps
  r.seg(P.glow, sh[0], sh[1], el[0], el[1], 3, 3);
  r.seg(P.glow, el[0], el[1], hand[0], hand[1], 3, 3);
  const at = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // upper arm and forearm: the forearm flares toward the fist, heavy and top-loaded like a club
  boulder(r, P, at(sh, el, 0.3), at(sh, el, 0.86), 14, 13, back, seed);
  boulder(r, P, at(el, hand, 0.14), at(el, hand, 0.66), 14, 17, back, seed + 2);
  socket(r, P, el, back); // the elbow: a glowing crystal socket in the gap
  fist(r, P, el, hand, back);
  // the shoulder boulder, with crystals growing out of its top
  const side: -1 | 1 = back ? -1 : 1;
  cluster(r, P, [sh[0] + side * 3, sh[1] - 8], side, back);
  boulder(r, P, [sh[0] - 7, sh[1] - 2], [sh[0] + 7, sh[1] - 1], 16, 14, back, seed + 5);
  r.inlay(back ? P.rockD : P.rock, P.vein, (set) => line(set, [[sh[0] - 3, sh[1] - 4], [sh[0], sh[1] - 1], [sh[0] - 1, sh[1] + 3]]));
}

/** A heavy stone fist at the end of the forearm, knuckles along the forearm's direction, studded with crystal. */
function fist(r: Raster, P: Parts, el: V2, hand: V2, back: boolean): void {
  let ux = hand[0] - el[0];
  let uy = hand[1] - el[1];
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  const px = -uy;
  const py = ux;
  const c: V2 = [hand[0] + ux * 3, hand[1] + uy * 3];
  // a squared-off block: back of the hand to the knuckle face
  const A: V2 = [c[0] - ux * 7, c[1] - uy * 7];
  const B: V2 = [c[0] + ux * 6, c[1] + uy * 6];
  boulder(r, P, A, B, 17, 18, back, 3);
  // finger grooves across the knuckle face
  const S = back ? P.rockD : P.rock;
  const groove = back ? P.rockDeep : P.crack;
  r.inlay(S, groove, (set) => {
    for (const f of [-0.35, 0.05, 0.42]) line(set, [[B[0] + px * f * 16 - ux * 1, B[1] + py * f * 16 - uy * 1], [B[0] + px * f * 16 - ux * 5, B[1] + py * f * 16 - uy * 5]]);
    line(set, [[c[0] - ux * 2 + px * 7, c[1] - uy * 2 + py * 7], [c[0] - ux * 2 - px * 7, c[1] - uy * 2 - py * 7]]);
  });
  // amethyst knuckle shards jutting forward
  const ang = Math.atan2(uy, ux);
  for (const [f, l] of [[-0.26, 8], [0.2, 9]] as const) prism(r, P, [B[0] + px * f * 16 - ux, B[1] + py * f * 16 - uy], ang, l, 5, back);
  if (!back) r.ellipse(P.vein, c[0] - ux * 1, c[1] - uy * 1, 1.2, 1.2);
}

/** A leg of two boulder pillars with a glowing knee gap, standing on a wide, heavy stone foot. */
function leg(r: Raster, P: Parts, hip: V2, knIn: V2, ankleIn: V2, back: boolean, o: number, moss: number): void {
  // the wide foot stays inside the frame when a stomp drives it below the floor line or out to the side
  const ankle: V2 = [Math.max(12, Math.min(r.w - 18, ankleIn[0])), Math.min(r.h - 12, ankleIn[1])];
  const kn: V2 = [knIn[0], Math.min(r.h - 15, knIn[1])]; // a knee dropped to the floor keeps its boulder above the frame edge
  r.seg(P.glow, hip[0], hip[1], kn[0], kn[1], 3, 3);
  r.seg(P.glow, kn[0], kn[1], ankle[0], ankle[1] - 2, 3, 3);
  const at = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  boulder(r, P, at(hip, kn, 0.02), at(hip, kn, 0.8), 17, 15, back, back ? 4 : 1);
  boulder(r, P, at(kn, ankle, 0.2), at(kn, ankle, 0.9), 14, 16, back, back ? 6 : 3);
  socket(r, P, [kn[0] + 1, kn[1]], back); // the knee: a glowing crystal socket in the gap
  // a wide, heavy stone foot with a squared toe
  const S = back ? P.rockD : P.rock;
  const SD = back ? P.rockDeep : P.rockD;
  const SL = back ? P.rockD : P.rockL;
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(P.ink, [[bx - 10, by + 7], [bx - 11, by + 1], [bx - 7, by - 4], [bx + 8, by - 4], [bx + 12, by], [bx + 16, by + 1], [bx + 17, by + 7]]);
  r.poly(SD, [[bx - 9, by + 8], [bx - 10, by + 1], [bx - 6, by - 3], [bx + 7, by - 3], [bx + 11, by + 1], [bx + 15, by + 2], [bx + 16, by + 8]]);
  r.poly(S, [[bx - 8, by + 5], [bx - 9, by + 1], [bx - 5, by - 2], [bx + 6, by - 2], [bx + 10, by + 2], [bx + 14, by + 3], [bx + 14, by + 5]]);
  r.rect(SL, bx - 5, by - 2, 11, 1);
  r.rect(SL, bx + 10, by + 2, 4, 1);
  r.inlay(S, back ? P.rockDeep : P.crack, (set) => {
    for (let y = by + 2; y < by + 6; y++) set(bx + 9, y);
    for (let x = bx - 7; x < bx + 9; x++) set(x, by + 5);
  });
  if (!back) r.rect(P.vein, bx + 11, by + 6, 3, 1); // light leaking under the toe
  if (o === 1) r.ellipse(moss, bx - 5, by - 1, 3, 1.6);
}

/**
 * `c` darkened just enough that neither it nor its rim-lit tone lands within reach of the glow colour (or its bloom
 * white), which the finishing pass would otherwise treat as self-lit and bloom.
 */
function calm(c: RGB, glow: RGB): RGB {
  const hot: RGB = mul(glow, 1.55);
  const near = (a: RGB, b: RGB): boolean => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 52;
  const lit = (x: RGB): RGB => mix(mul(x, 1.3), [255, 242, 214], 0.1);
  let out = c;
  for (let i = 0; i < 10 && [out, lit(out), mul(out, 1.1)].some((x) => near(x, glow) || near(x, hot)); i++) out = mul(out, 0.92);
  return out;
}

/** A joint: an ink-ringed crystal socket with a hot core, the light that holds the boulders together showing through. */
function socket(r: Raster, P: Parts, at: V2, back: boolean): void {
  r.ellipse(P.ink, at[0], at[1], 4, 4);
  r.ellipse(back ? P.crystalD : P.crystal, at[0], at[1], 3, 3);
  r.ellipse(back ? P.vein : P.glow, at[0] + 0.5, at[1] - 0.5, 1.6, 1.6);
  if (!back) r.rect(P.core, at[0], at[1] - 1, 1, 1);
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
