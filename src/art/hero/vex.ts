import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import { drape, type Skel } from './skeleton';

/**
 * Vex: a lean teal shadow-blade. Peaked cowl with two burning eyes, trailing scarf and ragged cape, high-collared jacket with a
 * strap harness, single armoured pauldron, wrapped legs and a pair of curved glowing daggers.
 */
export function drawVex(r: Raster, k0: Skel, look: PlaceholderLook): void {
  // limb ends pulled inside the frame so a fist and its dagger are never cut off at an edge
  const fit = (q: V2, mx: number, top: number, bot: number): V2 => [Math.max(mx, Math.min(k0.W - mx, q[0])), Math.max(top, Math.min(k0.H - bot, q[1]))];
  const k: Skel = { ...k0, handF: fit(k0.handF, 17, 16, 10), handB: fit(k0.handB, 17, 16, 10), elbowF: fit(k0.elbowF, 9, 10, 8), elbowB: fit(k0.elbowB, 9, 10, 8) };
  const inside = (q: V2): V2 => [Math.max(5, Math.min(k.W - 5, q[0])), Math.max(5, Math.min(k.H - 6, q[1]))];
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.5);
  const accent = col(look.accent);
  // every lit or painted part is held clear of the glow colours; only the parts made emissive on purpose bloom
  // (a pale lit part that would have to grey right down to clear the bloom white is painted flat instead: a flat white
  // only has to keep its own colour clear, so it can stay white)
  const part = (c: RGB, o: { emissive?: boolean; flat?: boolean; soft?: boolean; lean?: RGB } = {}): number => {
    if (o.emissive) return r.part(c, o);
    const k = keepClear(c, accent, o);
    if (k.steps > 3 && !o.flat && c[0] + c[1] + c[2] > 600) return r.part(keepClear(c, accent, { flat: true }).c, { flat: true });
    return r.part(k.c, { flat: o.flat, soft: o.soft });
  };
  const glow = mix(accent, [255, 245, 250], 0.6);
  const skin = col(look.skin);
  const steel: RGB = [200, 210, 230];
  const steelD: RGB = [112, 124, 152];
  const P = {
    armor: part(armor),
    light: part(mix(armor, [200, 245, 255], 0.22)),
    dark: part(dark),
    deep: part(deep),
    skin: part(skin, { soft: true }),
    cloth: part(mix(armor, dark, 0.45), { soft: true }),
    clothL: part(mix(armor, [200, 245, 255], 0.2), { soft: true }),
    cape: part(mix(dark, [10, 10, 30], 0.25), { soft: true }),
    capeIn: part(mix(mul(accent, 0.45), dark, 0.55), { soft: true }),
    scarf: part(accent, { soft: true }),
    scarfD: part(mul(accent, 0.68), { soft: true }),
    accent: part(accent, { emissive: true }),
    glow: part(glow, { emissive: true }),
    steel: part(steel),
    steelD: part(steelD),
    edge: part([255, 255, 255], { flat: true }),
    strap: part(mul(dark, 0.4), { soft: true }),
    mark: part(accent, { emissive: true }), // the neon trim lines glow on purpose
    rivet: part(steel, { flat: true }),
    seam: part(mul(deep, 0.8), { flat: true }),
    glove: part(mix(mul(dark, 0.55), [40, 30, 30], 0.4)),
    gloveL: part(mix(mul(dark, 0.55), [200, 190, 200], 0.3), { soft: true }),
    // a second material under the jacket: charcoal trousers and pale linen shin wraps, so the figure is not one hue
    // from cowl to boot and the legs read light and quick
    pant: part(mix(mul(dark, 0.8), [44, 42, 54], 0.6), { soft: true }),
    pantB: part(mix(mul(dark, 0.55), [26, 24, 34], 0.6), { soft: true }),
    wrap: part(mix([214, 206, 192], armor, 0.1), { soft: true }),
    wrapD: part(mix(mul(mix([214, 206, 192], armor, 0.1), 0.62), [40, 30, 60], 0.2), { soft: true }),
  };
  const T = k.torso;
  const run = k.pose.lean > 2;
  const air = k.pose.frontHand[1] < -8;
  const sw = (i: number, a = 2): number => Math.sin(k.phase * 1.25 + i * 0.7) * a;
  // outfits: 1 = Oni (wild hair, a horned demon mask with fangs), 2 = Cyber (visor helmet, neon circuit lines, no cape)
  const o = look.outfit ?? 0;
  const bone = part([236, 228, 210]);
  const boneD = part([176, 164, 140]);
  const oniMask = part(mix(accent, [200, 30, 40], 0.55), { lean: [120, 12, 34] }); // lacquered red, a step off the glowing accent
  const oniD = part(mul(mix(accent, [200, 30, 40], 0.55), 0.62), { lean: [70, 6, 24] });
  // the mane: a pale shock of hair in a clear three-step value ladder (lit crown, body, shadowed underside)
  const hairC = mix(armor, [236, 236, 246], 0.66);
  const hairHi = part(mix(hairC, [255, 255, 255], 0.55), { soft: true });
  const hair = part(hairC, { soft: true });
  const hairD = part(mix(mul(hairC, 0.58), [40, 30, 60], 0.15), { soft: true });
  const hairDeep = part(mix(mul(hairC, 0.34), [30, 16, 40], 0.3), { soft: true });

  // ---- ragged cape (behind everything) ----
  if (o !== 2) {
    const top = T.y + 3;
    const x0 = T.x + 6;
    const len = run ? 56 : air ? 64 : 50;
    const drift = run ? 30 : air ? 6 : 12; // how far the hem is blown back
    const hemY = k.hipY + 14;
    const pts: V2[] = [[x0 + 4, top], [x0 + 14, top + 2]];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push([x0 + 10 - drift * t + sw(i) * t - 6 * t, top + (hemY - top) * t * (len / 56)]);
    }
    for (let i = 5; i >= 0; i--) {
      const t = i / 5;
      pts.push([x0 - 4 - drift * t * 1.5 + sw(i + 3) * t, top + (hemY - top) * t * (len / 56) + (i % 2 === 0 ? 5 : 0)]);
    }
    for (let i = 0; i < pts.length; i++) pts[i] = inside(pts[i]);
    r.poly(P.cape, pts);
    // jagged hem teeth and an accent edge line
    const last = pts[pts.length - 1];
    for (let i = 0; i < 4; i++) r.poly(P.cape, [inside([last[0] + i * 7, last[1]]), inside([last[0] + i * 7 + 7, last[1]]), inside([last[0] + i * 7 + 3, last[1] + 8])]);
    // a darker inner lining along the trailing edge so the cape reads as a separate layer behind the body
    r.inlay(P.cape, P.capeIn, (set) => {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) set(x0 - 2 - drift * (i / 16) * 1.4 - 3 * (i / 16) + j, top + 4 + i * ((hemY - top) * (len / 56) - 4) / 16);
    });
    r.inlay(P.cape, P.mark, (set) => {
      for (let i = 0; i < 18; i++) set(x0 - drift * 0.9 - i * 1.6 + 6, top + 2 + i * 2.4);
    });
  }

  // ---- scarf, streaming from the collar ----
  {
    const nx = T.x + 8;
    const ny = T.y + 2;
    const flow = run ? 0.05 : air ? -0.8 : 0.4;
    // the tail shortens its stride when the collar is near the left edge, so the scarf never trails out of the frame
    // (bunched up when she lies on it: knocked flat, the frame is short along the body)
    const step = k.pose.laid ? 2.4 : Math.max(2.2, Math.min(4.4, (nx - 22) / 12.5));
    let px = nx;
    let py = ny;
    for (let i = 0; i < 13; i++) {
      // trailing back and sagging under the pose's gravity (it lies along the floor when she is knocked flat)
      const [ox, oy] = drape(k, -4 - i * step, i * flow * 3 + sw(i, 1.8 + i * 0.22));
      const x = Math.max(8, nx + ox);
      const y = Math.max(8, ny + oy);
      const w = o === 2 ? 3.4 - i * 0.15 : 9 - i * 0.5;
      r.seg(o === 2 ? (i % 2 ? P.glow : P.accent) : i % 4 === 3 ? P.scarfD : P.scarf, px, py, x, y, w, Math.max(o === 2 ? 1.4 : 2.5, w - 0.6));
      px = x;
      py = y;
    }
    if (o === 2) {
      // the neon cable ends in a dark metal jack (it also keeps the glow off the frame edge when knocked flat)
      r.seg(P.steelD, px, py, Math.max(4, px - 6), py + 1, 4, 4);
      r.rect(P.steel, Math.max(4, px - 6) - 1, py - 1, 2, 2);
    }
    if (o !== 2) {
      const [ax, ay] = drape(k, -8, 4);
      const [bx2, by2] = drape(k, -7, -3);
      r.seg(P.scarfD, px, py, Math.max(5, px + ax), py + ay, 3.5, 2);
      r.seg(P.scarf, px, py, Math.max(5, px + bx2), Math.max(5, py + by2), 3.5, 2);
    }
  }

  // ---- back arm + dagger ----
  {
    // the far arm sits a step darker than the jacket so it never melts into the torso in front of it
    const el = k.elbowB;
    r.seg(P.dark, k.shB[0], k.shB[1], el[0], el[1], 9, 8);
    r.seg(P.dark, el[0], el[1], k.handB[0], k.handB[1], 8, 7);
    bracer(r, P, el, k.handB, true);
    dagger(r, P, el, k.handB, 32);
    fist(r, P, el, k.handB, true);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true, o !== 2);

  // ---- split tabard behind the hips ----
  r.poly(P.cloth, [[T.x + 2, T.y + T.h - 8], [T.x + 14, T.y + T.h - 8], [T.x + 9 + sw(1), Math.min(T.y + T.h + 22, r.h - 10)], [T.x - 3 + sw(2), Math.min(T.y + T.h + 26, r.h - 8)]]);

  // ---- torso ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    r.poly(P.cloth, [[x0 + 2, top + 2], [x0 + w - 2, top + 2], [x0 + w + 2, top + 9], [x0 + w - 6, top + h], [x0 + 6, top + h], [x0 - 2, top + 9]]);
    r.poly(P.deep, [[x0 - 2, top + 9], [x0 + 2, top + 2], [x0 + 9, top + 3], [x0 + 11, top + h - 2], [x0 + 6, top + h]]);
    // lighter chest panel with a centre seam
    // a wrap-over jacket front: a lighter lapel running diagonally down from the near shoulder
    r.poly(P.clothL, [[x0 + w - 4, top + 6], [x0 + w + 1, top + 10], [x0 + w / 2 + 2, top + h - 7], [x0 + w / 2 - 3, top + h - 7]]);
    r.seg(P.seam, x0 + w - 5, top + 8, x0 + w / 2 - 2, top + h - 7, 1, 1);
    // harness: two crossing straps with a buckle and throwing knives
    r.seg(P.strap, x0 + 3, top + 3, x0 + w - 3, top + h - 5, 6, 6);
    r.seg(P.strap, x0 + w - 4, top + 3, x0 + 6, top + h - 5, 5, 5);
    r.rect(P.steel, x0 + w / 2 - 2, top + h / 2 - 2, 5, 5);
    r.rect(P.accent, x0 + w / 2 - 0.5, top + h / 2 - 0.5, 2, 2);
    for (let i = 0; i < 3; i++) r.rect(P.steel, x0 + 6 + i * 4, top + 8 + i * 3.4, 2, 5); // throwing knives on the strap
    // belt with a glowing gem and side pouches
    r.rect(P.deep, x0 + 2, top + h - 6, w - 4, 7);
    r.rect(P.steelD, x0 + w / 2 - 5, top + h - 6, 10, 7);
    r.ellipse(P.accent, x0 + w / 2, top + h - 3, 2.6, 2.6);
    r.rect(P.strap, x0 + 4, top + h, 8, 9);
    r.rect(P.strap, x0 + w - 12, top + h, 8, 9);
    r.rect(P.mark, x0 + 4, top + h + 6, 8, 1);
    // tall collar
    r.poly(P.deep, [[x0 + 8, top - 2], [x0 + w - 4, top - 2], [x0 + w - 2, top + 8], [x0 + 6, top + 8]]);
    r.rect(P.mark, x0 + 9, top + 6, w - 14, 1);
    if (o === 2) {
      // neon circuit traces over the jacket
      r.seg(P.glow, x0 + 12, top + 9, x0 + 12, top + 18, 1, 1);
      r.seg(P.glow, x0 + 12, top + 18, x0 + w - 6, top + 18, 1, 1);
      r.seg(P.accent, x0 + w - 6, top + 8, x0 + w - 6, top + 18, 1, 1);
      r.rect(P.glow, x0 + 11, top + 8, 3, 3);
    }
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false, o !== 2);

  if (o === 1) {
    // ---- head: a wild mane of hair and a red oni mask with horns and fangs ----
    const hx = k.head.x;
    const hy = k.head.y + 2;
    const hs = k.head.s;
    r.rect(P.deep, hx + 6, T.y - 5, hs - 10, 8); // neck
    // a heavy mane swept back: five big curved locks in three values (deep underside, mid body, lit crown), each a
    // broad tapered blade, so the silhouette reads as a few bold shapes rather than a fringe of thin spikes
    const bx = hx + hs / 2 - 1;
    const by = hy + hs / 2 - 3;
    const locks: [number, number, number, number, number][] = [
      // angle (0 = forward, PI = back), length, base width, curl, part
      [Math.PI - 0.62, 30, 19, 9, hairDeep],
      [Math.PI - 0.2, 37, 20, 9, hairD],
      [Math.PI + 0.25, 39, 20, 8, hair],
      [Math.PI + 0.72, 33, 18, 7, hairHi],
      [Math.PI + 1.18, 24, 15, 6, hair],
    ];
    locks.forEach(([a, len, w, curl, part], i) => maneLock(r, part, bx, by, a + sw(i, 0.06), len, w, curl, i < 2 ? hairDeep : hairD, i >= 2 ? hairHi : -1, drape(k, 0, 1)));
    r.ellipse(hairD, hx + hs / 2 - 3, hy + hs / 2, hs / 2 + 1, hs / 2);
    r.ellipse(hair, hx + hs / 2, hy + hs / 2 - 2, hs / 2 + 1, hs / 2);
    // the mask: a broad scowling face with a heavy brow ridge, cheekbones, a hooked nose and a fanged grin
    r.poly(oniMask, [[hx + 9, hy + 1], [hx + hs + 1, hy], [hx + hs + 6, hy + 7], [hx + hs + 6, hy + hs - 2], [hx + hs + 1, hy + hs + 4], [hx + 12, hy + hs + 3], [hx + 7, hy + hs / 2]]);
    r.poly(oniD, [[hx + 7, hy + hs / 2], [hx + 12, hy + hs / 2 - 2], [hx + 16, hy + hs + 3], [hx + 12, hy + hs + 3]]); // shaded side of the jaw
    r.poly(oniD, [[hx + 11, hy + 5], [hx + hs + 7, hy + 4], [hx + hs + 7, hy + 9], [hx + hs - 3, hy + 7], [hx + 13, hy + 9]]); // brow ridge
    r.poly(P.deep, [[hx + hs - 9, hy + 9], [hx + hs + 2, hy + 8], [hx + hs, hy + 13], [hx + hs - 8, hy + 13]]); // eye socket
    r.poly(P.glow, [[hx + hs - 7, hy + 10], [hx + hs, hy + 9], [hx + hs - 2, hy + 12], [hx + hs - 6, hy + 12]]);
    r.rect(P.accent, hx + hs - 15, hy + 10, 4, 2); // far eye
    r.poly(oniMask, [[hx + hs + 4, hy + 10], [hx + hs + 9, hy + 16], [hx + hs + 4, hy + 18]]); // hooked nose
    r.rect(oniD, hx + hs + 3, hy + 17, 4, 1);
    r.poly(P.deep, [[hx + 12, hy + hs - 8], [hx + hs + 5, hy + hs - 9], [hx + hs + 3, hy + hs - 2], [hx + 13, hy + hs - 2]]); // open mouth
    for (let i = 0; i < 4; i++) r.poly(bone, [[hx + 13 + i * 4, hy + hs - 8], [hx + 16 + i * 4, hy + hs - 8], [hx + 14.5 + i * 4, hy + hs - 5 + (i === 3 ? 2 : 0)]]);
    for (let i = 0; i < 2; i++) r.poly(bone, [[hx + 15 + i * 9, hy + hs - 2], [hx + 18 + i * 9, hy + hs - 2], [hx + 16.5 + i * 9, hy + hs - 6]]);
    // curved horns from the brow, ringed at the base
    r.poly(bone, [[hx + 9, hy + 3], [hx + 4, hy - 6], [hx + 1, hy - 15], [hx + 8, hy - 8], [hx + 14, hy + 2]]);
    r.poly(bone, [[hx + hs - 3, hy + 2], [hx + hs - 1, hy - 8], [hx + hs + 5, hy - 16], [hx + hs + 5, hy - 6], [hx + hs + 3, hy + 3]]);
    r.rect(boneD, hx + 7, hy, 6, 2);
    r.rect(boneD, hx + hs - 3, hy, 6, 2);
  } else if (o === 2) {
    // ---- head: a sleek helmet with a full-width glowing visor and a fin ----
    const hx = k.head.x;
    const hy = k.head.y + 2;
    const hs = k.head.s;
    r.rect(P.deep, hx + 6, T.y - 5, hs - 10, 8); // neck
    r.poly(P.dark, [[hx - 4, hy + 4], [hx + 6, hy - 4], [hx - 10, hy - 2]]); // rear fin
    r.ellipse(P.armor, hx + hs / 2 + 2, hy + hs / 2 + 1, hs / 2 + 4, hs / 2 + 3);
    r.ellipse(P.light, hx + hs / 2, hy + hs / 2 - 4, hs / 2, hs / 3);
    r.poly(P.deep, [[hx + 6, hy + 8], [hx + hs + 6, hy + 7], [hx + hs + 6, hy + 15], [hx + 8, hy + 15]]);
    r.poly(P.accent, [[hx + 8, hy + 9], [hx + hs + 5, hy + 8], [hx + hs + 5, hy + 13], [hx + 9, hy + 13]]);
    r.rect(P.glow, hx + hs - 4 - ((k.phase * 3) % 10), hy + 9, 4, 3);
    r.rect(P.seam, hx + 10, hy + hs - 2, hs - 4, 1);
    r.rect(P.glow, hx + 2, hy + hs / 2 + 4, 3, 1);
  } else {
    // ---- head: peaked cowl, shadowed face, burning eyes, the scarf pulled up as a mask ----
    const hx = k.head.x;
    const hy = k.head.y + 2;
    const hs = k.head.s;
    r.rect(P.deep, hx + 6, T.y - 5, hs - 10, 8); // neck
    const tip = sw(2, 3);
    // cowl: a lighter shell than the jacket so the head reads first, with a tail that trails behind
    r.poly(P.armor, [[hx + hs + 4, hy + 6], [hx + hs + 1, hy - 2], [hx + hs / 2 + 2, hy - 9], [hx - 4, hy - 4], [hx - 18 - tip, hy + 8 + tip * 0.5], [hx - 4, hy + hs - 6], [hx + 4, hy + hs + 4], [hx + hs - 2, hy + hs + 2], [hx + hs + 4, hy + hs - 8]]);
    r.poly(P.light, [[hx + hs / 2 + 2, hy - 9], [hx + hs + 1, hy - 2], [hx + hs - 4, hy + 2], [hx + hs / 2 - 2, hy - 5]]);
    r.poly(P.dark, [[hx - 18 - tip, hy + 8 + tip * 0.5], [hx - 4, hy + 2], [hx + 2, hy + 8], [hx - 4, hy + hs - 6]]); // fold under the tail
    r.seg(P.seam, hx + 2, hy - 2, hx + hs / 2 - 2, hy - 6, 1, 1);
    // face opening: a deep oval framed by the hood's rim
    r.ellipse(P.dark, hx + hs / 2 + 6, hy + hs / 2 + 1, hs / 2 + 1, hs / 2 - 1);
    r.ellipse(P.deep, hx + hs / 2 + 7, hy + hs / 2 + 1, hs / 2 - 1, hs / 2 - 3);
    // eyes: two narrow almond slits, the near one burning, the far one dimmer
    r.poly(P.glow, [[hx + hs - 9, hy + 11], [hx + hs - 3, hy + 9], [hx + hs + 1, hy + 10], [hx + hs - 4, hy + 13]]);
    r.rect(P.edge, hx + hs - 3, hy + 10, 2, 1);
    r.poly(P.accent, [[hx + hs - 16, hy + 11], [hx + hs - 12, hy + 10], [hx + hs - 11, hy + 12], [hx + hs - 15, hy + 13]]);
    // brow shadow over the eyes
    r.seg(P.deep, hx + hs - 17, hy + 8, hx + hs + 1, hy + 7, 2, 2);
    // the scarf pulled up over nose and mouth, with a fold and the nose bridge
    r.poly(P.scarf, [[hx + 6, hy + 14], [hx + hs + 2, hy + 14], [hx + hs + 5, hy + 18], [hx + hs + 1, hy + hs - 2], [hx + hs - 6, hy + hs + 1], [hx + 8, hy + hs + 1]]);
    r.seg(P.scarfD, hx + 8, hy + 19, hx + hs + 2, hy + 20, 1.6, 1.6);
    r.seg(P.scarfD, hx + 10, hy + hs - 3, hx + hs - 4, hy + hs - 2, 1.4, 1.4);
    r.rect(P.edge, hx + hs + 1, hy + 15, 2, 1);
  }

  // ---- front arm: pauldron, sleeve, dagger ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    // a dark backing a little wider than the sleeve cuts the near arm out of the body behind it
    r.seg(P.deep, sx, sy + 1, el[0], el[1] + 1, 12, 10);
    r.seg(P.deep, el[0], el[1] + 1, k.handF[0], k.handF[1] + 1, 10, 9);
    r.seg(P.clothL, sx, sy, el[0], el[1], 10, 8);
    r.seg(P.cloth, el[0], el[1], k.handF[0], k.handF[1], 8, 7);
    bracer(r, P, el, k.handF, false);
    // armoured shoulder
    // armoured shoulder: sits low on the arm and a step darker than the cowl, so it never reads as the jaw
    r.ellipse(P.deep, sx - 1, sy + 1, 9, 6.5);
    r.ellipse(P.dark, sx, sy, 8, 5.5);
    r.poly(P.armor, [[sx - 6, sy - 3], [sx + 5, sy - 4], [sx + 7, sy - 1], [sx - 5, sy]]);
    r.rect(P.mark, sx - 7, sy + 3, 15, 1);
    r.rect(P.rivet, sx - 1, sy - 2, 2, 2);
    dagger(r, P, el, k.handF, 34);
    fist(r, P, el, k.handF, false);
  }
}

/**
 * One lock of the oni mane: a broad blade from the crown curving back and down to a point, with a darker
 * band along its underside so each lock keeps its own light/dark read. It is drawn shorter rather than clipped
 * where the tip would leave the frame.
 */
function maneLock(r: Raster, part: number, bx: number, by: number, ang: number, len0: number, w: number, curl: number, under: number, shine: number, down: V2 = [0, 1]): void {
  let len = len0;
  const at = (L: number, t: number): V2 => {
    // a quadratic curve: out along the angle, then curling downward (gravity) by `curl`
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    return [bx + dx * L * t + down[0] * curl * t * t, by + dy * L * t + down[1] * curl * t * t];
  };
  while (len > 8) {
    const [tx, ty] = at(len, 1);
    if (tx >= 8 && ty >= 8 && tx <= r.w - 8) break;
    len -= 1;
  }
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  const side = ny >= 0 ? 1 : -1; // the normal pointing (mostly) downward: the lock's shaded underside
  const n = 8;
  const L: V2[] = [];
  const R: V2[] = [];
  const U: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = at(len, t);
    const hw = (w / 2) * Math.pow(1 - t, 0.85) * (t < 0.25 ? 0.75 + t : 1);
    L.push([x - nx * hw * side, y - ny * hw * side]);
    R.push([x + nx * hw * side, y + ny * hw * side]);
    U.push([x + nx * hw * side * 0.15, y + ny * hw * side * 0.15]);
  }
  r.poly(part, [...L, ...R.slice().reverse()]);
  r.poly(under, [...U.slice(1, n), ...R.slice(1, n).reverse()]);
  if (shine >= 0) {
    // a lit streak along the upper face of the lock
    const S: V2[] = [];
    for (let i = 1; i <= 5; i++) {
      const t = i / 8;
      const [x, y] = at(len, t);
      const hw = (w / 2) * Math.pow(1 - t, 0.85);
      S.push([x - nx * hw * side * 0.45, y - ny * hw * side * 0.45]);
    }
    for (let i = 0; i + 1 < S.length; i++) r.seg(shine, S[i][0], S[i][1], S[i + 1][0], S[i + 1][1], 3 - i * 0.45, 2.6 - i * 0.45);
  }
}

/** A gloved fist round the dagger's grip: knuckles along the forearm, a strap at the wrist and the thumb on top. */
function fist(r: Raster, P: Parts, el: V2, h: V2, back: boolean): void {
  let dx = h[0] - el[0];
  let dy = h[1] - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const nx = -dy;
  const ny = dx;
  const up = ny <= 0 ? 1 : -1;
  r.seg(back ? P.deep : P.strap, h[0] - dx * 5, h[1] - dy * 5, h[0] - dx * 2, h[1] - dy * 2, 8, 8); // wrist cuff
  r.seg(back ? P.strap : P.glove, h[0] - dx * 2, h[1] - dy * 2, h[0] + dx * 2.5, h[1] + dy * 2.5, back ? 8 : 9, back ? 7.5 : 8.5);
  if (!back) {
    r.seg(P.gloveL, h[0] - dx * 1 + nx * up * 3, h[1] - dy * 1 + ny * up * 3, h[0] + dx * 2 + nx * up * 2.6, h[1] + dy * 2 + ny * up * 2.6, 2.6, 2.2); // thumb
    r.seg(P.seam, h[0] + dx * 4.5 + nx * 3.5, h[1] + dy * 4.5 + ny * 3.5, h[0] + dx * 4.5 - nx * 3.5, h[1] + dy * 4.5 - ny * 3.5, 1, 1); // knuckle line
  }
}

type Parts = Record<'armor' | 'light' | 'dark' | 'deep' | 'skin' | 'cloth' | 'clothL' | 'cape' | 'scarf' | 'scarfD' | 'accent' | 'glow' | 'steel' | 'steelD' | 'edge' | 'strap' | 'mark' | 'rivet' | 'seam' | 'glove' | 'gloveL' | 'pant' | 'pantB' | 'wrap' | 'wrapD', number>;

function bracer(r: Raster, P: Parts, el: V2, hand: V2, back: boolean): void {
  const mx = el[0] + (hand[0] - el[0]) * 0.62;
  const my = el[1] + (hand[1] - el[1]) * 0.62;
  r.seg(back ? P.dark : P.armor, el[0] + (hand[0] - el[0]) * 0.3, el[1] + (hand[1] - el[1]) * 0.3, mx, my, 10, 9);
  r.ellipse(P.accent, mx, my, 2.4, 2.4);
}

/** Curved dagger from the hand along the forearm, glowing edge and tip. */
function dagger(r: Raster, P: Parts, el: V2, hand: V2, len0: number): void {
  let len = len0;
  let dx = hand[0] - el[0];
  let dy = hand[1] - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  if (dy > 0.75) {
    dx = 0.45;
    dy = 0.89; // a hanging arm tilts the blade forward instead of straight down
  }
  const nx = -dy;
  const ny = dx;
  // a blade that would poke out of the frame is drawn shorter (as if seen a little end-on)
  const out = (L: number): boolean => {
    const x = hand[0] + dx * L + nx * 3;
    const y = hand[1] + dy * L + ny * 3;
    return x < 7 || y < 7 || x > r.w - 7 || y > r.h - 8; // the glowing tip blooms a few pixels past itself
  };
  while (len > 12 && out(len)) len -= 1;
  const tx = hand[0] + dx * len + nx * 3;
  const ty = hand[1] + dy * len + ny * 3;
  const mx = hand[0] + dx * len * 0.55 + nx * 4.5;
  const my = hand[1] + dy * len * 0.55 + ny * 4.5;
  r.seg(P.steelD, hand[0] + dx * 4 + nx * 5, hand[1] + dy * 4 + ny * 5, hand[0] + dx * 4 - nx * 5, hand[1] + dy * 4 - ny * 5, 2.6, 2.6); // cross guard
  r.seg(P.steelD, hand[0] - dx * 4, hand[1] - dy * 4, hand[0] - dx * 7, hand[1] - dy * 7, 3.4, 3.4); // pommel
  const bx = hand[0] + dx * 5;
  const by = hand[1] + dy * 5;
  r.poly(P.steel, [[bx + nx * 3.5, by + ny * 3.5], [mx + nx * 2, my + ny * 2], [tx, ty], [mx - nx * 2.5, my - ny * 2.5], [bx - nx * 2.5, by - ny * 2.5]]);
  r.seg(P.edge, hand[0] + nx, hand[1] + ny, tx - dx * 2, ty - dy * 2, 1.4, 1);
  r.seg(P.accent, mx + nx * 2.5, my + ny * 2.5, tx, ty, 1.6, 1.2);
  r.ellipse(P.glow, tx, ty, 1.6, 1.6);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean, wraps: boolean): void {
  // a deep crouch can fold the knee under the floor line: keep the cloth above it
  const lowY = r.h - 14;
  kn = [kn[0], Math.min(lowY, kn[1])];
  ankle = [ankle[0], Math.min(ankle[1], r.h - 12)]; // the sole never sinks below the floor line
  if (wraps) {
    // charcoal trousers, then the shin bound in pale linen: a shaded underlayer, the lit wrap over it and the diagonal
    // turns of the binding (the far leg sits a step down the value ladder)
    r.seg(back ? P.pantB : P.pant, hip[0], hip[1], kn[0], kn[1], 14, 11);
    r.seg(back ? P.pantB : P.wrapD, kn[0], kn[1], ankle[0], ankle[1], 11, 8);
    if (!back) {
      r.seg(P.wrap, kn[0] - 1, kn[1] + 2, ankle[0] - 1, ankle[1] - 3, 8, 6);
      for (let i = 0; i < 4; i++) {
        const t = 0.22 + i * 0.19;
        const x = kn[0] + (ankle[0] - kn[0]) * t;
        const y = kn[1] + (ankle[1] - kn[1]) * t;
        r.seg(P.seam, x - 4, y + 1.5, x + 4, y - 1.5, 1, 1);
      }
      r.ellipse(P.armor, kn[0] + 3, kn[1], 5, 5); // knee guard
      r.rect(P.mark, kn[0] + 1, kn[1] - 1, 6, 1);
    } else {
      for (let i = 0; i < 3; i++) {
        const t = 0.3 + i * 0.22;
        r.rect(P.seam, kn[0] + (ankle[0] - kn[0]) * t - 4, kn[1] + (ankle[1] - kn[1]) * t, 8, 1);
      }
    }
  } else {
    // trousers a step darker than the jacket (so the hips read apart from the torso), lighter wrapped shins
    const pant = back ? P.deep : P.dark;
    r.seg(pant, hip[0], hip[1], kn[0], kn[1], 14, 11);
    r.seg(back ? P.deep : P.cloth, kn[0], kn[1], ankle[0], ankle[1], 11, 8);
    if (!back) {
      r.ellipse(P.armor, kn[0] + 3, kn[1], 5, 5); // knee guard
      r.rect(P.mark, kn[0] + 1, kn[1] - 1, 6, 1);
      for (let i = 0; i < 3; i++) {
        const t = 0.3 + i * 0.22;
        r.rect(P.mark, kn[0] + (ankle[0] - kn[0]) * t - 5, kn[1] + (ankle[1] - kn[1]) * t, 10, 1); // shin wraps
      }
    }
  }
  const bx = ankle[0];
  const by = ankle[1];
  // a lean split-toe tabi boot: wrapped ankle, a low soft foot tapering to the toe, a pale wrap band (it used to be a
  // tall square boot, the heaviest dark mass on a fighter who should read light on his feet)
  r.poly(back ? P.deep : P.strap, [[bx - 6, by - 5], [bx + 5, by - 5], [bx + 8, by + 1], [bx + 14, by + 2.5], [bx + 17, by + 5], [bx + 16, by + 8], [bx - 7, by + 8], [bx - 8, by + 2]]);
  r.rect(wraps ? (back ? P.wrapD : P.wrap) : back ? P.strap : P.clothL, bx - 7, by - 9, 13, 5); // ankle wrap (the linen binding runs down into it)
  r.rect(P.seam, bx - 7, by - 5, 13, 1);
  r.rect(back || wraps ? P.seam : P.mark, bx - 6, by - 8, 11, 1);
  r.poly(P.steelD, [[bx + 12, by + 2], [bx + 17, by + 5], [bx + 16, by + 8], [bx + 12, by + 8]]); // metal toe cap
  r.rect(P.seam, bx + 11, by + 3, 1, 5); // the split toe
  r.rect(P.deep, bx - 7, by + 7, 23, 2);
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
