import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import { solveLimb, type Skel } from './skeleton';

/**
 * Havoc: a gadget soldier. A rounded combat helmet with a dark cover band, amber goggles worn over the eyes and a chin
 * strap down a stubbled square jaw; a dark plate-carrier vest with webbing rows, mag pouches and a chest radio over a
 * lighter fatigue shirt; a tan belt with frag grenades; a radio pack with a whip antenna and a rocket launcher slung across
 * the back; mid-tone trousers with cargo pockets and knee pads, gloves, and heavy laced boots. Values step from light
 * sleeves to a dark vest to near-black boots so every piece of kit parts from its neighbour.
 */
export function drawHavoc(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const accent = col(look.accent);
  guardGlow(r, accent); // no part blooms unless it is emissive on purpose (see guardGlow)
  const glow = mix(accent, [255, 250, 220], 0.5);
  const skin = col(look.skin);
  // the value ladder: shirt (light) > pouches / helmet (mid) > trousers > vest (dark) > webbing, gloves, boots (darkest)
  // the shirt lightens toward khaki; a near-black kit (Night Ops) lightens toward slate instead, so it stays dark
  const lum = (armor[0] + armor[1] + armor[2]) / 3;
  const shirt: RGB = mix(armor, mix([92, 98, 110], [200, 192, 150], Math.max(0, Math.min(1, (lum - 50) / 20))), 0.42);
  const pants: RGB = mul(mix(armor, [118, 108, 88], 0.35), 0.86);
  const vest: RGB = mix(armor, dark, 0.55);
  const web: RGB = mul(dark, 0.62);
  const belt: RGB = mix([156, 134, 92], armor, 0.25);
  const gun: RGB = [52, 54, 60];
  const steel: RGB = [190, 198, 212];
  const P: Parts = {
    armor: r.part(armor),
    light: r.part(mix(armor, [236, 240, 210], 0.3)),
    dark: r.part(dark),
    vest: r.part(vest),
    vestL: r.part(mix(vest, armor, 0.6)),
    web: r.part(web, { flat: true }),
    shirt: r.part(shirt, { soft: true }),
    shirtD: r.part(mul(shirt, 0.74), { soft: true }),
    pants: r.part(pants, { soft: true }),
    pantsD: r.part(mul(pants, 0.72), { soft: true }),
    camo: r.part(mul(mix(pants, dark, 0.4), 0.85), { flat: true }),
    belt: r.part(belt),
    skin: r.part(skin, { soft: true }),
    skinD: r.part(mul(skin, 0.74), { soft: true }),
    skinL: r.part(mix(skin, [255, 240, 222], 0.32), { soft: true }),
    skinDD: r.part(mix(mul(skin, 0.5), [40, 24, 30], 0.2), { flat: true }),
    hair: r.part([52, 40, 32], { flat: true }),
    brow: r.part([40, 28, 22], { flat: true }),
    pupil: r.part([28, 22, 20], { flat: true }),
    stubble: r.part(mix(mul(skin, 0.72), [84, 84, 104], 0.3), { flat: true }), // a blue-grey five o'clock shadow
    line: r.part([40, 28, 26], { flat: true }),
    eye: r.part([240, 236, 226], { flat: true }),
    glove: r.part([46, 40, 34], { soft: true }),
    gloveL: r.part([86, 76, 62], { soft: true }),
    gun: r.part(gun),
    gunL: r.part([96, 100, 110]),
    steel: r.part(steel),
    strap: r.part(mul(dark, 0.55), { soft: true }),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    lens: r.part(mix(accent, [255, 200, 120], 0.3), { emissive: true }),
    seam: r.part(mul(web, 0.7), { flat: true }),
    mark: r.part(mix(accent, [255, 255, 255], 0.2), { flat: true }),
    boot: r.part([44, 38, 32]),
    bootL: r.part([78, 66, 52]),
    sole: r.part([22, 20, 18], { flat: true }),
  };
  const T = k.torso;
  const sw = (i: number, a = 1.5): number => Math.sin(k.phase * 1.2 + i) * a;
  // outfits: 1 = Sniper (boonie hat, ghillie strips, a scoped long rifle), 2 = Commando (beret, shades, bandolier, rolled sleeves)
  const o = look.outfit ?? 0;
  const ghillie = [r.part(mix(armor, [70, 90, 40], 0.4), { soft: true }), r.part(mul(mix(armor, [70, 90, 40], 0.4), 0.7), { soft: true }), r.part(mix(shirt, [150, 140, 90], 0.3), { soft: true })];
  const brass = r.part([214, 170, 70]);
  // keep the hands and feet inside the frame on the widest reaches
  const handF = clampV(k.handF, 12, r.w - 22, 10, r.h - 10);
  const handB = clampV(k.handB, 9, r.w - 10, 9, r.h - 10);
  // a hand pulled in re-solves its elbow, so the arm folds to the new grip instead of stretching to the old joint
  const elbowF = handF === k.handF ? k.elbowF : solveLimb(k.shF, handF, k.armBone, 1).mid;
  const elbowB = handB === k.handB ? k.elbowB : solveLimb(k.shB, handB, k.armBone, 1).mid;

  // ---- radio pack with a whip antenna (behind the long gun, so the gun crosses over it and reads) ----
  {
    const bx = T.x - 11;
    const by = T.y + 1;
    r.rect(P.web, bx - 1, by - 1, 15, 23);
    r.rect(P.vest, bx, by, 13, 21);
    r.rect(P.vestL, bx + 1, by + 1, 11, 3);
    r.rect(P.dark, bx + 1, by + 14, 11, 6);
    r.rect(P.seam, bx + 2, by + 7, 9, 1);
    r.rect(P.accent, bx + 3, by + 3, 2, 2);
    r.rect(P.steel, bx + 8, by + 3, 2, 2); // a dial
    r.seg(P.web, bx + 3, by + 1, bx - 1 + sw(1, 2), by - 30, 2, 1.2);
    r.ellipse(P.glow, bx - 1 + sw(1, 2), by - 31, 1.7, 1.7);
  }

  // ---- the long gun slung across the back, over the radio pack: a rocket launcher, or the sniper's scoped rifle ----
  {
    if (o === 1) {
      // the long rifle slung muzzle-up behind the back shoulder: stock low at the hip, a big scope, a long barrel
      const rx0 = T.x + T.w - 4;
      const ry0 = T.y + T.h - 6;
      const rx1 = T.x - 10;
      const ry1 = T.y - 12;
      r.seg(P.dark, rx0 + 2, ry0 + 2, rx0 - 6, ry0 - 3, 8, 7); // stock
      r.seg(P.gun, rx0, ry0, rx1, ry1, 5, 4);
      r.seg(P.gun, rx1, ry1, rx1 - 7, ry1 - 12, 2.6, 2.2); // barrel
      r.rect(P.gun, rx1 - 9, ry1 - 15, 4, 3); // muzzle brake
      r.seg(P.web, rx1 + 9, ry1 + 4, rx1 + 1, ry1 - 3, 6, 6); // scope
      r.ellipse(P.lens, rx1 + 1, ry1 - 3, 1.8, 1.8);
    } else {
      // a fat launcher tube slung muzzle-up behind the back shoulder, with a flared muzzle, a sight and a warning band
      const lx0 = T.x + T.w - 6;
      const ly0 = T.y + T.h - 8;
      const lx1 = T.x - 12;
      const ly1 = T.y - 14;
      // the tube is a mid value (the kit colour) over a dark rim, so it parts from the dark radio pack in front of it
      r.seg(P.web, lx0, ly0, lx1, ly1, 11, 11);
      r.seg(P.armor, lx0, ly0, lx1, ly1, 9, 9);
      r.seg(P.light, lx0 - 1, ly0 - 2.5, lx1 + 1, ly1 - 2.5, 2.4, 2.4);
      r.seg(P.dark, lx0 + 1, ly0 + 2.5, lx1 + 1, ly1 + 2.5, 2, 2);
      r.seg(P.web, lx1 + 1.5, ly1 + 1.5, lx1 - 2, ly1 - 2, 13.5, 13.5); // muzzle bell: a dark rim,
      r.seg(P.gunL, lx1 + 1, ly1 + 1, lx1 - 2, ly1 - 2, 12, 12); // a lit steel flare
      r.ellipse(P.web, lx1 - 2.5, ly1 - 2.5, 3.8, 3.8); // and the dark bore
      r.seg(P.web, lx1 + 4, ly1 + 6, lx1 + 8, ly1 + 2, 1.5, 1.5); // the seam behind the flare
      r.rect(P.mark, lx1 + 7, ly1 + 2, 3, 3); // warning band
      r.rect(P.gun, lx1 + 10, ly1 - 1, 4, 3); // sight block
    }
  }
  if (o === 1) {
    // ghillie strips hanging off the shoulders and back
    for (let i = 0; i < 9; i++) {
      const gx = T.x - 6 + i * ((T.w + 8) / 8);
      const len = 8 + ((i * 5) % 7);
      r.seg(ghillie[i % 3], gx, T.y - 1, gx - 3 + sw(i, 1.5), T.y + len, 3, 1.5);
    }
  }

  // ---- back arm ----
  arm(r, P, k.shB, elbowB, handB, true, o);

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- torso: a fatigue shirt under a plate-carrier vest ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    // shirt: shows at the collar, the shoulders and under the arms
    r.poly(P.shirt, [[x0 + 1, top], [x0 + w - 1, top], [x0 + w + 2, top + 8], [x0 + w - 1, top + h - 4], [x0 + 2, top + h - 4], [x0 - 2, top + 8]]);
    r.poly(P.shirtD, [[x0 - 2, top + 8], [x0 + 1, top], [x0 + 4, top], [x0 + 3, top + h - 4], [x0 + 2, top + h - 4]]);
    // the plate carrier: shoulder straps up to the collar, a broad front plate a little wider than the body
    const vt = top + 4;
    const vb = top + h - 9;
    r.poly(P.web, [[x0 - 1, vt - 1], [x0 + w + 2, vt - 1], [x0 + w + 3, vb + 1], [x0 - 2, vb + 1]]);
    r.poly(P.vest, [[x0, vt], [x0 + w + 1, vt], [x0 + w + 2, vb], [x0 - 1, vb]]);
    r.rect(P.vest, x0 + 3, top - 1, 6, 6);
    r.rect(P.vest, x0 + w - 10, top - 1, 6, 6);
    r.rect(P.vestL, x0 + w - 10, top - 1, 6, 1);
    r.rect(P.vestL, x0 + 1, vt, w - 1, 1);
    // MOLLE webbing rows across the lower plate
    r.inlay(P.vest, P.web, (set) => {
      for (let y = vt + 12; y < vb - 1; y += 4) for (let x = x0; x < x0 + w + 2; x++) if ((x - x0) % 6 !== 0) set(x, y);
    });
    // a row of three mag pouches with lighter flaps
    const pw = (w - 6) / 3;
    for (let i = 0; i < 3; i++) {
      const px = x0 + 2 + i * (pw + 1);
      r.rect(P.armor, px, vb - 11, pw, 10);
      r.rect(P.light, px, vb - 11, pw, 3);
      r.rect(P.seam, px, vb - 8, pw, 1);
      r.rect(P.web, px + pw / 2 - 0.5, vb - 9, 1, 2); // the flap tab
    }
    if (o === 2) {
      // a bandolier of brass rounds across the chest
      r.seg(P.strap, x0 + w - 3, top + 1, x0 + 2, vb + 2, 5, 5);
      for (let i = 1; i < 7; i++) {
        const t = i / 7;
        const bx = x0 + w - 3 + (5 - w) * t;
        const by = top + 1 + (vb + 1 - top) * t;
        r.rect(brass, bx - 1, by - 3, 2, 4);
      }
    } else {
      // a chest radio on the upper plate, its stub antenna and light
      r.rect(P.web, x0 + 3, vt + 2, 8, 10);
      r.rect(P.dark, x0 + 4, vt + 3, 6, 8);
      r.rect(P.accent, x0 + 5, vt + 4, 2, 2);
      r.rect(P.seam, x0 + 5, vt + 7, 4, 1);
      r.rect(P.seam, x0 + 5, vt + 9, 4, 1);
      r.seg(P.web, x0 + 9, vt + 2, x0 + 10, vt - 5, 1.6, 1.2);
      // a name tape and the unit patch on the plate
      r.rect(P.light, x0 + w - 13, vt + 3, 11, 3);
      r.rect(P.seam, x0 + w - 12, vt + 4, 9, 1);
    }
    // belt: tan webbing, a steel buckle, frag grenades hanging off it
    const by = top + h - 9;
    r.rect(P.web, x0 - 1, by, w + 3, 7);
    r.rect(P.belt, x0, by + 1, w + 1, 5);
    r.rect(P.light, x0, by + 1, w + 1, 1);
    r.rect(P.steel, x0 + w / 2 - 2, by + 1, 5, 5);
    r.rect(P.gun, x0 + w / 2 - 1, by + 2, 3, 3);
    // collar
    r.rect(P.shirtD, x0 + 9, top - 3, w - 18, 4);
  }

  // ---- front leg, then the frag grenades on the belt over the hip ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);
  for (let i = 0; i < 2; i++) grenade(r, P, T.x + 4 + i * 8, T.y + T.h - 1 + i);

  if (o === 1) {
    // the ghillie mantle: shaggy strips over the shoulders and down the back
    for (let i = 0; i < 12; i++) {
      const gx = T.x - 8 + i * ((T.w + 10) / 11);
      const len = 7 + ((i * 7) % 6);
      r.seg(ghillie[i % 3], gx, T.y - 2, gx - 2 + sw(i, 1.2), T.y + len, 3.2, 1.4);
    }
  }

  // ---- the front upper arm goes under the head while it hangs below the shoulder (raised, it crosses in front) ----
  const armUnder = elbowF[1] > k.shF[1] - 2;
  if (armUnder) arm(r, P, k.shF, elbowF, handF, false, o, 'upper');

  // ---- head: a three-quarter human face turned to the right, under the helmet / boonie / beret ----
  {
    const hx = k.head.x;
    const hy = k.head.y - 9; // sits high enough on the collar that the jaw clears the vest and a neck shows
    const hs = k.head.s;
    soldierHead(r, P, hx, hy, hs, T.y, o, ghillie);
    if (o === 1) {
      // boonie hat: a soft crown, a floppy brim, foliage tucked in the band; face paint and a squinting eye under it
      r.ellipse(P.shirt, hx + hs / 2 + 1, hy + 2, hs / 2 + 3, hs / 2 - 1);
      r.rect(P.shirtD, hx - 2, hy + 1, 4, 6);
      r.poly(P.shirtD, [[hx - 12, hy + 11], [hx - 6, hy + 6], [hx + hs + 10, hy + 6], [hx + hs + 15, hy + 11], [hx + hs + 10, hy + 12], [hx - 6, hy + 11]]);
      r.rect(P.strap, hx - 2, hy + 4, hs + 6, 2);
      for (let i = 0; i < 5; i++) r.seg(ghillie[i % 3], hx - 2 + i * 4, hy + 4, hx - 4 + i * 4 + sw(i), hy - 5, 2.4, 1);
    } else if (o === 2) {
      // a beret: a leather band round the head, the crown pulled down over the front in a soft fold, a regimental
      // flash with a brass badge over the temple, and wraparound shades
      r.ellipse(P.armor, hx + hs / 2 + 3, hy + 3, hs / 2 + 6, hs / 2 - 6);
      r.ellipse(P.armor, hx + hs + 3, hy + 6, 6.5, 4);
      r.ellipse(P.light, hx + hs / 2, hy - 0.5, hs / 2 - 3, 2);
      r.seg(P.dark, hx + hs * 0.45, hy + 5, hx + hs + 3, hy + 8.5, 1.3, 1.6); // the fold
      r.rect(P.armor, hx + hs / 2 - 1, hy - 5, 2, 2); // the stalk
      r.rect(P.web, hx - 2, hy + 8, hs + 5, 3);
      r.rect(P.strap, hx - 1, hy + 8, hs + 3, 1);
      r.poly(P.web, [[hx + 3, hy + 1], [hx + 10, hy + 1], [hx + 10, hy + 7], [hx + 6.5, hy + 9], [hx + 3, hy + 7]]);
      r.poly(P.mark, [[hx + 4, hy + 2], [hx + 9, hy + 2], [hx + 9, hy + 6.5], [hx + 6.5, hy + 8], [hx + 4, hy + 6.5]]);
      r.ellipse(brass, hx + 6.5, hy + 4.5, 1.6, 1.8);
    } else {
      // helmet: a rounded shell with a lighter crown, a dark cover band with a net and a jutting lip
      r.ellipse(P.armor, hx + hs / 2 + 1, hy + 5, hs / 2 + 5, hs / 2 - 1);
      r.rect(P.armor, hx - 4, hy + 4, hs + 10, 6);
      r.ellipse(P.light, hx + hs / 2 + 2, hy - 2, hs / 2 - 2, 3);
      r.inlay(P.armor, P.seam, (set) => {
        for (let x = hx - 2; x < hx + hs + 4; x += 1) for (let y = hy - 4; y < hy + 6; y += 1) if ((x + y) % 6 === 0 || (x - y) % 6 === 0) if ((x + y * 7) % 3 === 0) set(x, y);
      });
      r.rect(P.web, hx - 5, hy + 9, hs + 12, 3); // lip
      r.rect(P.dark, hx - 4, hy + 9, hs + 10, 1);
      // goggles pushed up onto the helmet front: a dark strap round the shell, a framed pair of amber lenses, a glint
      r.rect(P.web, hx - 3, hy + 3, hs + 4, 3);
      r.poly(P.web, [[hx + hs * 0.42, hy + 1], [hx + hs + 4, hy + 1], [hx + hs + 5, hy + 8], [hx + hs * 0.42, hy + 8]]);
      r.poly(P.lens, [[hx + hs * 0.48, hy + 2], [hx + hs + 3, hy + 2], [hx + hs + 3.5, hy + 7], [hx + hs * 0.48, hy + 7]]);
      r.rect(P.web, hx + hs * 0.74, hy + 2, 1, 5); // the bridge
      r.rect(P.glow, hx + hs * 0.52, hy + 3, 2, 1);
      r.rect(P.glow, hx + hs * 0.8, hy + 3, 2, 1);
      // striking: the lenses catch the light right across
      if ((k.pose.hit ?? 0) >= 0.6) r.rect(P.glow, hx + hs * 0.5, hy + 4, hs * 0.5, 1);
    }
  }

  // ---- front arm with a combat knife ----
  arm(r, P, k.shF, elbowF, handF, false, o, armUnder ? 'lower' : 'all');
}

interface Parts {
  armor: number;
  light: number;
  dark: number;
  vest: number;
  vestL: number;
  web: number;
  shirt: number;
  shirtD: number;
  pants: number;
  pantsD: number;
  camo: number;
  belt: number;
  skin: number;
  skinD: number;
  skinL: number;
  skinDD: number;
  hair: number;
  brow: number;
  pupil: number;
  stubble: number;
  line: number;
  eye: number;
  glove: number;
  gloveL: number;
  gun: number;
  gunL: number;
  steel: number;
  strap: number;
  accent: number;
  glow: number;
  lens: number;
  seam: number;
  mark: number;
  boot: number;
  bootL: number;
  sole: number;
}

/** `v` kept inside the box; the same object back when it already was (so callers can tell whether it moved). */
function clampV(v: V2, x0: number, x1: number, y0: number, y1: number): V2 {
  const x = Math.max(x0, Math.min(x1, v[0]));
  const y = Math.max(y0, Math.min(y1, v[1]));
  return x === v[0] && y === v[1] ? v : [x, y];
}

/**
 * A three-quarter human head turned to the right, in a 24px head box at (hx, hy) (scaled by hs / 24): a neck in shade
 * down into the collar, short dark hair at the back and the sideburn, an ear, a lit forehead and cheekbone, a near eye
 * (white, dark pupil) and a sliver of the far one under heavy brows, a nose with a lit bridge and a shaded side, a set
 * mouth, and a square stubbled jaw over a shadow on the neck. Headgear is drawn over the top by the caller; the sniper
 * gets face paint, the commando wraparound shades (the brows, nose, mouth and jaw still show around them).
 */
function soldierHead(r: Raster, P: Parts, hx: number, hy: number, hs: number, collar: number, o: number, paint: number[]): void {
  const z = hs / 24;
  const zx = z * 1.1; // a three-quarter head is broad: a little wider than tall in the box
  const q = (u: number, v: number): V2 => [hx + u * zx, hy + v * z];
  const X = (u: number): number => hx + u * zx;
  const Y = (v: number): number => hy + v * z;
  // neck: a shaded column down into the collar, with the jaw's cast shadow across its top
  const nb = collar - hy + 2;
  r.poly(P.skinD, [q(7, 18), q(17, 22), q(19, nb), q(6, nb)]);
  r.poly(P.skinDD, [q(7, 22), q(19, 27), q(19, 30.5), q(7, 26)]);
  r.seg(P.skin, X(17), Y(28), X(16), Y(nb - 1), 1.2, 1.2); // the lit front edge of the neck
  // the collar of the shirt closing round the neck
  r.poly(P.shirtD, [q(4, nb - 4), q(9, nb - 3), q(13, nb - 1), q(20, nb - 4), q(22, nb), q(3, nb)]);
  // the head: cranium, a flat forehead, the cheek and a square chin
  r.poly(P.skin, [q(3, 9), q(23, 9), q(24.5, 13), q(24.5, 16.5), q(25, 19), q(25.2, 23), q(26.2, 24.2), q(25.6, 26), q(26, 28.2), q(24.8, 29.8), q(20, 30.2), q(14.5, 28.6), q(10, 26), q(7, 22.5), q(3.5, 18)]);
  // the turned-away side of the head falls into shade, the cheek hollows under the cheekbone
  r.poly(P.skinD, [q(3, 9), q(8, 9), q(8.5, 15), q(10, 22), q(13.5, 27.6), q(10, 26), q(7, 22.5), q(3.5, 18)]);
  r.seg(P.skinD, X(14.5), Y(23), X(17.5), Y(25.2), 1.2, 1);
  // light on the forehead, the cheekbone and the chin
  r.rect(P.skinL, X(13), Y(12), 10 * zx, 2 * z);
  r.rect(P.skinL, X(16), Y(21), 6 * zx, 1.5 * z);
  r.rect(P.skinL, X(22), Y(27.5), 3 * zx, 1);
  // short cropped hair at the back and the sideburn, the ear in front of it
  r.poly(P.hair, [q(2.5, 9), q(11, 9), q(11, 13), q(9.5, 17.5), q(7.5, 19.5), q(4, 18)]);
  r.ellipse(P.skinD, X(9.5), Y(17.5), 2.3 * zx, 3.2 * z);
  r.ellipse(P.skin, X(10), Y(17), 1.5 * zx, 2.3 * z);
  r.seg(P.skinDD, X(9.6), Y(16), X(9.4), Y(19), 1, 1);
  // stubble: a dark shadow over the jaw, the chin and the upper lip
  r.inlay(P.skin, P.stubble, (set) => {
    for (let y = Math.floor(Y(27.4)); y < Y(31); y++) for (let x = Math.floor(X(12)); x < X(27); x++) if ((x + y) % 2 === 0) set(x, y);
    for (let y = Math.floor(Y(23)); y < Y(27.4); y++) for (let x = Math.floor(X(10)); x < X(15); x++) if ((x + y) % 2 === 0) set(x, y);
  });
  r.inlay(P.skinD, P.stubble, (set) => {
    for (let y = Math.floor(Y(22)); y < Y(31); y++) for (let x = Math.floor(X(7)); x < X(27); x++) if ((x + y) % 2 === 0) set(x, y);
  });
  r.seg(P.skinDD, X(11), Y(26.2), X(15), Y(29), 1, 1); // the jaw's edge on the shaded side
  // the nose: a wedge out past the face, a lit bridge, a shaded side plane and a nostril
  r.poly(P.skin, [q(23.5, 15.5), q(29.4, 21.8), q(28.8, 23.2), q(25, 23.6), q(23.6, 21)]);
  r.poly(P.skinD, [q(23.2, 19), q(25, 23.4), q(23, 22.8)]);
  r.seg(P.skinL, X(24.8), Y(16.8), X(28.2), Y(21), 1.2, 1);
  r.rect(P.skinDD, X(25.6), Y(23), 2.4 * zx, 1);
  // the mouth: a set line with a hard corner, a lit lower lip
  r.rect(P.line, X(20), Y(25.4), 5.8 * zx, 1);
  r.rect(P.line, X(19.6), Y(25.4), 1, 2);
  r.rect(P.skinL, X(21.5), Y(26.4), 3.5 * zx, 1);
  if (o === 2) {
    // wraparound shades over the eyes: dark lenses with a lit top edge and a glint, the arm running back to the ear;
    // the brows still frown over the top
    r.seg(P.brow, X(14.5), Y(13.2), X(21.5), Y(14.4), 2, 1.8);
    r.seg(P.brow, X(23.2), Y(14.4), X(25), Y(13.6), 1.6, 1.4);
    r.rect(P.web, X(10), Y(17), 6 * zx, 1.2);
    r.poly(P.web, [q(14.5, 16.4), q(26.4, 16.4), q(26, 19.8), q(22.5, 20.4), q(21.5, 19.4), q(15, 20.4)]);
    r.rect(P.gunL, X(15.5), Y(17), 6 * zx, 1);
    r.rect(P.glow, X(23.6), Y(17), 2 * zx, 1);
  } else {
    // the eye socket in shade, the near eye looking right (white, dark pupil, a heavy lid), the far eye past the bridge
    r.rect(P.eye, X(16), Y(16.6), 5 * zx, 3);
    r.rect(P.pupil, X(18.8), Y(16.6), 2 * zx, 3);
    r.rect(P.skinD, X(15.6), Y(16.6) + 3, 5.4 * zx, 1);
    r.rect(P.eye, X(23.4), Y(16.6), 1, 3);
    r.rect(P.pupil, X(24.4), Y(16.6), 1, 3);
    // heavy brows angled down toward the nose (a set, confident frown)
    r.seg(P.brow, X(15), Y(14), X(21.8), Y(15.4), 2.2, 2);
    r.seg(P.brow, X(23), Y(15.2), X(25.2), Y(14.2), 1.8, 1.4);
    if (o === 1) {
      // camo face paint: two stripes across the cheek and the nose
      r.seg(paint[1], X(12), Y(20.6), X(21.5), Y(21.6), 1.4, 1.4);
      r.seg(paint[0], X(13), Y(23.2), X(19.5), Y(24), 1.2, 1.2);
      r.seg(paint[1], X(23.5), Y(19.6), X(26.5), Y(20.6), 1.2, 1.2);
    }
  }
}

/** A round frag grenade hanging by its spoon. */
function grenade(r: Raster, P: Parts, x: number, y: number): void {
  r.ellipse(P.web, x, y, 4.2, 4.8);
  r.ellipse(P.armor, x - 0.3, y - 0.3, 3.3, 3.9);
  r.rect(P.dark, x - 3, y, 6, 1);
  r.rect(P.light, x - 2, y - 3, 2, 2);
  r.rect(P.gun, x - 1.5, y - 7, 3, 3); // the fuse
  r.rect(P.steel, x + 1.5, y - 6, 1, 4); // the spoon
}

/**
 * An arm: a fatigue sleeve that breaks at the elbow (an upper sleeve, a darker crease, a forearm with a shadow along its
 * underside and a buttoned cuff; the commando rolls it up to the bare forearm), and a gloved fist with knuckle rolls and
 * a thumb. The front fist holds the knife.
 */
function arm(r: Raster, P: Parts, sh: V2, el: V2, hand: V2, back: boolean, o: number, stage: 'upper' | 'lower' | 'all' = 'all'): void {
  const sleeve = back ? P.shirtD : P.shirt;
  const under = back ? P.web : P.shirtD;
  // the side of a bone that faces down the screen gets the shadow
  const shadeSide = (a: V2, b: V2): V2 => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let nx = -(b[1] - a[1]) / l;
    let ny = (b[0] - a[0]) / l;
    if (ny < 0 || (ny === 0 && nx < 0)) {
      nx = -nx;
      ny = -ny;
    }
    return [nx, ny];
  };
  // upper sleeve (with its unit patch); for the front arm it can be drawn before the head, so the jaw sits over the
  // shoulder instead of being cut off by it
  if (stage !== 'lower') {
    const [ux, uy] = shadeSide(sh, el);
    r.seg(under, sh[0], sh[1] + 1, el[0], el[1] + 1, 12, 11);
    r.seg(sleeve, sh[0], sh[1], el[0], el[1], 11, 9.5);
    if (!back) {
      r.seg(P.shirtD, sh[0] + ux * 3.5, sh[1] + uy * 3.5, el[0] + ux * 3, el[1] + uy * 3, 3, 2.5);
      const px = sh[0] + (el[0] - sh[0]) * 0.4;
      const py = sh[1] + (el[1] - sh[1]) * 0.4;
      r.rect(P.web, px - 2.5, py - 2, 5, 4);
      r.rect(P.mark, px - 1.5, py - 1, 3, 2);
    }
  }
  if (stage === 'upper') return;
  let dx = hand[0] - el[0];
  let dy = hand[1] - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const [fx, fy] = shadeSide(el, hand);
  const wx = hand[0] - dx * 5;
  const wy = hand[1] - dy * 5;
  if (o === 2) {
    // bare forearm under a rolled cuff, with a tendon highlight
    r.seg(back ? P.skinD : P.skin, el[0], el[1], wx, wy, 8.5, 7);
    if (!back) r.seg(P.skinD, el[0] + fx * 2.5, el[1] + fy * 2.5, wx + fx * 2, wy + fy * 2, 2.5, 2);
    r.ellipse(under, el[0] + 0.5, el[1] + 1, 6.5, 6);
    r.ellipse(sleeve, el[0], el[1], 6, 5.5); // the rolled cuff
    r.seg(under, el[0] - fx * 5, el[1] - fy * 5, el[0] + fx * 5, el[1] + fy * 5, 1, 1);
  } else {
    // forearm sleeve: a touch narrower than the upper arm, a dark crease at the elbow, a cuff at the wrist
    r.seg(under, el[0], el[1] + 1, wx, wy + 1, 10.5, 9.5);
    r.seg(sleeve, el[0], el[1], wx, wy, 9.5, 8.5);
    if (!back) {
      r.seg(P.shirtD, el[0] + fx * 3 + dx * 2, el[1] + fy * 3 + dy * 2, wx + fx * 2.5, wy + fy * 2.5, 3, 2.5);
      r.seg(P.shirtD, el[0] - dx * 1 - fx * 3, el[1] - dy * 1 - fy * 3, el[0] + dx * 2 + fx * 1, el[1] + dy * 2 + fy * 1, 1.4, 1.4); // the crease
    }
    r.seg(under, wx - fx * 4.5, wy - fy * 4.5, wx + fx * 4.5, wy + fy * 4.5, 3, 3); // cuff
  }
  if (!back) {
    knife(r, P, dx, dy, hand);
  }
  gloveFist(r, P, hand, dx, dy, back);
}

/** A gloved fist: a dark cuff, the padded back of the hand, three knuckle rolls on the leading face, the thumb on top. */
function gloveFist(r: Raster, P: Parts, h: V2, dx: number, dy: number, back: boolean): void {
  const [x, y] = h;
  const nx = -dy;
  const ny = dx;
  const up = ny <= 0 ? 1 : -1; // the normal that points up the screen
  const g = back ? P.web : P.glove;
  r.seg(P.web, x - dx * 6, y - dy * 6, x - dx * 3, y - dy * 3, 10, 10); // cuff
  r.seg(g, x - dx * 6, y - dy * 6, x - dx * 3.5, y - dy * 3.5, 8, 8);
  r.ellipse(P.web, x + 0.5, y + 0.5, 6.4, 6.4);
  r.ellipse(g, x, y, 5.6, 5.6);
  if (back) return;
  // the knuckle rolls across the leading face, lit on top
  for (let i = -1; i <= 1; i++) {
    const kx = x + dx * 3.2 + nx * i * 2.8;
    const ky = y + dy * 3.2 + ny * i * 2.8;
    r.ellipse(i * up < 0 ? P.gloveL : P.glove, kx, ky, 1.7, 1.7);
  }
  // the padded knuckle guard across the back of the hand and the thumb wrapped over
  r.seg(P.gloveL, x - dx * 1 + nx * up * 3, y - dy * 1 + ny * up * 3, x + dx * 2 + nx * up * 3, y + dy * 2 + ny * up * 3, 2.4, 2);
  r.seg(P.web, x - dx * 2 - nx * up * 1, y - dy * 2 - ny * up * 1, x + dx * 1.5 - nx * up * 2.5, y + dy * 1.5 - ny * up * 2.5, 1, 1);
}

/** A combat knife held point-forward: a dark grip and guard, a steel blade with a dark spine and a bright edge. */
function knife(r: Raster, P: Parts, dx0: number, dy0: number, hand: V2): void {
  let dx = dx0;
  let dy = dy0;
  if (dy > 0.75) {
    dx = 0.5;
    dy = 0.86;
  }
  const nx = -dy;
  const ny = dx;
  const up = ny <= 0 ? 1 : -1;
  // the blade shortens rather than poke past the frame (tip plus its outline and glow stay 6px inside every edge)
  let L = 19;
  const m = 6;
  if (dx > 0.05) L = Math.min(L, (r.w - m - hand[0]) / dx - 5);
  if (dx < -0.05) L = Math.min(L, (hand[0] - m) / -dx - 5);
  if (dy > 0.05) L = Math.min(L, (r.h - m - hand[1]) / dy - 5);
  if (dy < -0.05) L = Math.min(L, (hand[1] - m) / -dy - 5);
  L = Math.max(7, L);
  const bx = hand[0] + dx * 4;
  const by = hand[1] + dy * 4;
  const tx = hand[0] + dx * (4 + L);
  const ty = hand[1] + dy * (4 + L);
  r.seg(P.gun, hand[0] - dx * 7, hand[1] - dy * 7, hand[0] - dx * 3, hand[1] - dy * 3, 3, 3); // pommel
  // blade: a dark outline wedge, the steel face, the clipped point, a lit edge along the bottom
  r.poly(P.web, [[bx + nx * up * 3.6, by + ny * up * 3.6], [tx - dx * 4 + nx * up * 2.4, ty - dy * 4 + ny * up * 2.4], [tx + dx * 1.2, ty + dy * 1.2], [bx - nx * up * 2.8, by - ny * up * 2.8]]);
  r.poly(P.steel, [[bx + nx * up * 2.6, by + ny * up * 2.6], [tx - dx * 4 + nx * up * 1.6, ty - dy * 4 + ny * up * 1.6], [tx, ty], [bx - nx * up * 1.9, by - ny * up * 1.9]]);
  r.seg(P.gunL, bx + nx * up * 1.8 + dx * 2, by + ny * up * 1.8 + dy * 2, tx - dx * 5 + nx * up * 1.2, ty - dy * 5 + ny * up * 1.2, 1, 1); // fuller
  r.seg(P.eye, bx - nx * up * 1.3 + dx * 2, by - ny * up * 1.3 + dy * 2, tx - dx * 2, ty - dy * 2, 0.9, 0.9); // the edge
  r.seg(P.gun, bx - nx * 4.5, by - ny * 4.5, bx + nx * 4.5, by + ny * 4.5, 2.4, 2.4); // guard
}

function leg(r: Raster, P: Parts, hip: V2, knIn: V2, ankleIn: V2, back: boolean): void {
  // the boot stays inside the frame when a stomp drives it below the floor line or out to the side
  const ankle: V2 = [Math.max(10, Math.min(r.w - 18, ankleIn[0])), Math.min(r.h - 12, ankleIn[1])];
  const kn: V2 = [knIn[0], Math.min(r.h - 10, knIn[1])];
  const pant = back ? P.pantsD : P.pants;
  r.seg(back ? P.web : P.pantsD, hip[0], hip[1] + 1, kn[0], kn[1] + 1, 15, 13);
  r.seg(pant, hip[0], hip[1], kn[0], kn[1], 14, 12);
  r.seg(back ? P.web : P.pantsD, kn[0], kn[1] + 1, ankle[0], ankle[1] - 3, 13, 12);
  r.seg(pant, kn[0], kn[1], ankle[0], ankle[1] - 4, 12, 11);
  // camo blotches
  r.inlay(pant, P.camo, (set) => {
    for (const t of [0.25, 0.6]) {
      const x = hip[0] + (kn[0] - hip[0]) * t;
      const y = hip[1] + (kn[1] - hip[1]) * t;
      for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) set(x + i + (t > 0.5 ? 2 : -2), y + j + i * 0.5);
    }
    const x = kn[0] + (ankle[0] - kn[0]) * 0.5;
    const y = kn[1] + (ankle[1] - kn[1]) * 0.5;
    for (let i = -2; i <= 1; i++) for (let j = -1; j <= 1; j++) set(x + i - 1, y + j);
  });
  // a cargo pocket on the thigh and a knee pad
  if (!back) {
    const px = hip[0] + (kn[0] - hip[0]) * 0.45;
    const py = hip[1] + (kn[1] - hip[1]) * 0.45;
    r.rect(P.pantsD, px - 4, py - 2, 8, 8);
    r.rect(P.pants, px - 4, py - 2, 8, 2);
  }
  r.ellipse(P.web, kn[0] + 2, kn[1], 6, 5.5);
  r.ellipse(back ? P.vest : P.armor, kn[0] + 2, kn[1] - 0.5, 4.8, 4.2);
  // heavy laced boot: a bloused cuff, laces, a lighter toe cap and a thick sole
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(P.boot, [[bx - 7, by - 9], [bx + 6, by - 9], [bx + 7, by - 2], [bx + 15, by + 2], [bx + 15, by + 8], [bx - 8, by + 8]]);
  r.poly(P.bootL, [[bx + 8, by + 1], [bx + 14, by + 3], [bx + 14, by + 6], [bx + 8, by + 6]]);
  r.rect(P.sole, bx - 8, by + 7, 24, 2);
  r.rect(back ? P.pantsD : P.pants, bx - 8, by - 12, 15, 4); // bloused trouser cuff
  if (!back) for (let i = 0; i < 3; i++) r.rect(P.bootL, bx + 1, by - 7 + i * 3, 4, 1);
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
