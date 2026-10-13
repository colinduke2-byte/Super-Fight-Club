import type { PlaceholderLook } from '../../engine/types';
import { col, mix, mul, type Raster, type RGB, type V2 } from './raster';
import type { Skel } from './skeleton';

/**
 * Havoc: a gadget soldier. Rounded combat helmet with goggles, a stubbled jaw, an olive tactical vest with pouches and a
 * radio on the chest strap, a backpack radio with a whip antenna, a rifle slung across his back, grenades on the belt,
 * gloves, knee pads, heavy boots and a combat knife in the front hand.
 */
export function drawHavoc(r: Raster, k: Skel, look: PlaceholderLook): void {
  const armor = col(look.armor);
  const dark = col(look.armorDark);
  const deep = mul(dark, 0.6);
  const accent = col(look.accent);
  const glow = mix(accent, [255, 250, 220], 0.5);
  const skin = col(look.skin);
  const fabric: RGB = mix(armor, [120, 110, 90], 0.35);
  const gun: RGB = [52, 54, 60];
  const gunL: RGB = [96, 100, 110];
  const steel: RGB = [190, 198, 212];
  const P = {
    armor: r.part(armor),
    light: r.part(mix(armor, [230, 240, 200], 0.25)),
    dark: r.part(dark),
    deep: r.part(deep, { soft: true }),
    fabric: r.part(fabric, { soft: true }),
    fabricD: r.part(mul(fabric, 0.72), { soft: true }),
    skin: r.part(skin, { soft: true }),
    stubble: r.part(mul(skin, 0.72), { flat: true }),
    glove: r.part([44, 40, 36], { soft: true }),
    gun: r.part(gun),
    gunL: r.part(gunL),
    steel: r.part(steel),
    strap: r.part(mul(dark, 0.55), { soft: true }),
    accent: r.part(accent, { emissive: true }),
    glow: r.part(glow, { emissive: true }),
    lens: r.part(mix(accent, [255, 200, 120], 0.3), { emissive: true }),
    seam: r.part(mul(deep, 0.75), { flat: true }),
    mark: r.part(mix(accent, [255, 255, 255], 0.2), { flat: true }),
    boot: r.part([40, 36, 32]),
    sole: r.part([24, 22, 20], { flat: true }),
  };
  const T = k.torso;
  const sw = (i: number, a = 1.5): number => Math.sin(k.phase * 1.2 + i) * a;
  // outfits: 1 = Sniper (boonie hat, ghillie strips, a scoped long rifle), 2 = Commando (beret, shades, bandolier, rolled sleeves)
  const o = look.outfit ?? 0;
  const ghillie = [r.part(mix(armor, [70, 90, 40], 0.4), { soft: true }), r.part(mul(mix(armor, [70, 90, 40], 0.4), 0.7), { soft: true }), r.part(mix(fabric, [150, 140, 90], 0.3), { soft: true })];
  const brass = r.part([214, 170, 70]);

  // ---- rifle slung across the back (behind everything) ----
  {
    const x0 = T.x - 12;
    const y0 = T.y + T.h - 2;
    const x1 = T.x + T.w + 6;
    const y1 = T.y - 8;
    r.seg(P.gun, x0, y0, x1, y1, 6, 5);
    r.seg(P.gunL, x0 + 6, y0 - 3, x0 + 20, y0 - 10, 2, 2);
    r.seg(P.gun, x0 + 8, y0 - 2, x0 + 10, y0 + 8, 4, 3); // magazine
    r.seg(P.dark, x0 - 4, y0 + 2, x0 + 6, y0 - 2, 7, 6); // stock
    if (o === 1) {
      // a long barrel and a scope
      r.seg(P.gun, x1, y1, x1 + 8, y1 - 7, 3, 2);
      r.seg(P.dark, x0 + 16, y0 - 12, x0 + 30, y0 - 20, 5, 5);
      r.ellipse(P.lens, x0 + 31, y0 - 20, 1.6, 1.6);
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

  // ---- backpack radio with a whip antenna ----
  {
    const bx = T.x - 10;
    const by = T.y + 2;
    r.rect(P.dark, bx, by, 13, 20);
    r.rect(P.fabricD, bx + 1, by + 14, 11, 6);
    r.rect(P.seam, bx + 2, by + 5, 9, 1);
    r.rect(P.accent, bx + 3, by + 2, 2, 2);
    r.seg(P.steel, bx + 3, by, bx - 2 + sw(1, 2), by - 30, 1.6, 1);
    r.ellipse(P.glow, bx - 2 + sw(1, 2), by - 31, 1.6, 1.6);
  }

  // ---- back arm ----
  {
    const el = k.elbowB;
    r.seg(P.fabricD, k.shB[0], k.shB[1], el[0], el[1], 10, 9);
    r.seg(o === 2 ? P.skin : P.fabricD, el[0], el[1], k.handB[0], k.handB[1], 9, 8);
    r.ellipse(P.glove, k.handB[0], k.handB[1], 4.5, 4.5);
  }

  // ---- back leg ----
  leg(r, P, k.hipB, k.kneeB, k.ankleB, true);

  // ---- torso: fatigues under a tactical vest ----
  {
    const x0 = T.x;
    const top = T.y;
    const w = T.w;
    const h = T.h;
    r.poly(P.fabric, [[x0 + 1, top + 1], [x0 + w - 1, top + 1], [x0 + w + 1, top + 9], [x0 + w - 2, top + h], [x0 + 2, top + h], [x0 - 1, top + 9]]);
    // vest plates
    r.poly(P.armor, [[x0 + 2, top + 3], [x0 + w - 2, top + 3], [x0 + w, top + h - 7], [x0 + 1, top + h - 7]]);
    r.poly(P.light, [[x0 + w / 2 + 1, top + 4], [x0 + w - 3, top + 4], [x0 + w - 2, top + 12], [x0 + w / 2 + 2, top + 12]]);
    // pouches in a row
    for (let i = 0; i < 3; i++) {
      const px = x0 + 3 + i * ((w - 6) / 3);
      r.rect(P.dark, px, top + h - 15, (w - 8) / 3, 7);
      r.rect(P.seam, px, top + h - 13, (w - 8) / 3, 1);
    }
    if (o === 2) {
      // a bandolier of brass rounds across the chest
      r.seg(P.strap, x0 + w - 3, top + 1, x0 + 2, top + h - 7, 4, 4);
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        const bx = x0 + w - 3 + (5 - w) * t;
        const by = top + 1 + (h - 8) * t;
        r.rect(brass, bx - 1, by - 3, 2, 4);
      }
    } else {
      // chest strap with a radio handset and its glowing light
      r.seg(P.strap, x0 + 3, top + 2, x0 + w - 4, top + h - 8, 3, 3);
      r.rect(P.dark, x0 + 4, top + 6, 5, 8);
      r.rect(P.accent, x0 + 5, top + 7, 2, 2);
    }
    // belt with grenades
    r.rect(P.strap, x0 + 1, top + h - 6, w - 2, 5);
    r.rect(P.steel, x0 + w / 2 - 2, top + h - 6, 4, 5);
    for (let i = 0; i < 2; i++) {
      const gx = x0 + 5 + i * 6;
      r.ellipse(P.armor, gx, top + h, 2.6, 3.2);
      r.rect(P.steel, gx - 1, top + h - 4, 2, 2);
    }
    // collar
    r.rect(P.fabricD, x0 + 5, top - 2, w - 9, 5);
  }

  // ---- front leg ----
  leg(r, P, k.hipF, k.kneeF, k.ankleF, false);

  if (o === 1) {
    // the ghillie mantle: shaggy strips over the shoulders and down the back
    for (let i = 0; i < 12; i++) {
      const gx = T.x - 8 + i * ((T.w + 10) / 11);
      const len = 7 + ((i * 7) % 6);
      r.seg(ghillie[i % 3], gx, T.y - 2, gx - 2 + sw(i, 1.2), T.y + len, 3.2, 1.4);
    }
  }

  // ---- head: combat helmet, goggles on the brim, stubbled jaw ----
  {
    const hx = k.head.x;
    const hy = k.head.y + 2;
    const hs = k.head.s;
    r.rect(P.skin, hx + 5, T.y - 6, hs - 8, 8); // neck
    // face
    r.poly(P.skin, [[hx + 3, hy + 6], [hx + hs + 2, hy + 6], [hx + hs + 3, hy + hs - 4], [hx + hs - 2, hy + hs + 2], [hx + 6, hy + hs + 2], [hx + 2, hy + hs - 6]]);
    // stubble along the jaw and a determined eye
    r.inlay(P.skin, P.stubble, (set) => {
      for (let x = hx + 8; x < hx + hs; x += 2) for (let y = hy + hs - 4; y < hy + hs + 2; y += 2) set(x, y);
    });
    r.rect(P.seam, hx + hs - 6, hy + 12, 6, 2); // eye
    r.rect(P.seam, hx + hs - 7, hy + hs - 3, 7, 1); // mouth
    if (o === 1) {
      // boonie hat: a soft crown, a floppy brim, foliage tucked in the band; a scope-squint eye under it
      // face paint: two dark stripes across the cheek
      r.seg(ghillie[1], hx + hs - 10, hy + 15, hx + hs + 2, hy + 13, 2, 2);
      r.seg(ghillie[0], hx + hs - 8, hy + 19, hx + hs + 2, hy + 17, 2, 2);
      r.ellipse(P.fabric, hx + hs / 2 + 1, hy + 2, hs / 2 + 3, hs / 2 - 1);
      // a wide floppy brim, drooping at the front and back
      r.poly(P.fabricD, [[hx - 12, hy + 11], [hx - 6, hy + 6], [hx + hs + 10, hy + 6], [hx + hs + 15, hy + 11], [hx + hs + 10, hy + 12], [hx - 6, hy + 11]]);
      r.rect(P.strap, hx - 2, hy + 4, hs + 6, 2);
      for (let i = 0; i < 5; i++) r.seg(ghillie[i % 3], hx - 2 + i * 4, hy + 4, hx - 4 + i * 4 + sw(i), hy - 5, 2.4, 1);
      r.rect(P.glow, hx + hs - 4, hy + 13, 2, 1);
    } else if (o === 2) {
      // beret tilted over the front, a cap badge and dark shades
      r.ellipse(P.armor, hx + hs / 2 + 3, hy + 2, hs / 2 + 6, hs / 2 - 4);
      r.ellipse(P.armor, hx + hs + 4, hy + 4, 5, 3);
      r.rect(P.dark, hx - 2, hy + 6, hs + 6, 2);
      r.ellipse(P.mark, hx + 2, hy + 3, 2.2, 2.2);
      r.rect(P.deep, hx + hs - 9, hy + 11, 12, 3);
      r.rect(P.glow, hx + hs - 4, hy + 11, 2, 1);
    } else {
    // helmet: a rounded shell with a lip, net strap and the goggles on the brow
    r.ellipse(P.armor, hx + hs / 2 + 1, hy + 4, hs / 2 + 5, hs / 2 - 1);
    r.rect(P.armor, hx - 4, hy + 2, hs + 10, 6);
    r.rect(P.dark, hx - 5, hy + 7, hs + 12, 3); // lip
    r.inlay(P.armor, P.seam, (set) => {
      for (let x = hx - 2; x < hx + hs + 4; x += 4) for (let y = hy - 4; y < hy + 6; y += 1) if ((x + y) % 5 === 0) set(x, y);
    });
    // goggles
    r.rect(P.strap, hx - 4, hy + 4, hs + 8, 3);
    r.ellipse(P.dark, hx + hs - 1, hy + 5, 4.5, 3.6);
    r.ellipse(P.lens, hx + hs - 1, hy + 5, 3, 2.3);
    r.ellipse(P.glow, hx + hs, hy + 4, 1, 1);
    }
  }

  // ---- front arm with a combat knife ----
  {
    const [sx, sy] = k.shF;
    const el = k.elbowF;
    r.seg(P.fabric, sx, sy, el[0], el[1], 10, 9);
    r.seg(o === 2 ? P.skin : P.fabric, el[0], el[1], k.handF[0], k.handF[1], 9, 8);
    if (o === 2) r.ellipse(P.fabricD, el[0], el[1], 5.5, 5);
    // shoulder pad with a unit patch
    r.ellipse(P.armor, sx, sy - 1, 7, 6);
    r.rect(P.mark, sx - 3, sy - 2, 5, 3);
    knife(r, P, el, k.handF);
    r.ellipse(P.glove, k.handF[0], k.handF[1], 4.8, 4.8);
  }
}

type Parts = Record<'armor' | 'light' | 'dark' | 'deep' | 'fabric' | 'fabricD' | 'skin' | 'stubble' | 'glove' | 'gun' | 'gunL' | 'steel' | 'strap' | 'accent' | 'glow' | 'lens' | 'seam' | 'mark' | 'boot' | 'sole', number>;

/** A short combat knife held point-forward. */
function knife(r: Raster, P: Parts, el: V2, hand: V2): void {
  let dx = hand[0] - el[0];
  let dy = hand[1] - el[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  if (dy > 0.75) {
    dx = 0.5;
    dy = 0.86;
  }
  const nx = -dy;
  const ny = dx;
  const tx = hand[0] + dx * 16;
  const ty = hand[1] + dy * 16;
  r.seg(P.dark, hand[0] - nx * 3, hand[1] - ny * 3, hand[0] + nx * 3, hand[1] + ny * 3, 2, 2); // guard
  r.poly(P.steel, [[hand[0] + nx * 2.6, hand[1] + ny * 2.6], [tx, ty], [hand[0] - nx * 1.4, hand[1] - ny * 1.4]]);
  r.seg(P.mark, hand[0] + nx * 1.6 + dx * 3, hand[1] + ny * 1.6 + dy * 3, tx - dx, ty - dy, 1, 1);
}

function leg(r: Raster, P: Parts, hip: V2, kn: V2, ankle: V2, back: boolean): void {
  const pant = back ? P.fabricD : P.fabric;
  r.seg(pant, hip[0], hip[1], kn[0], kn[1], 14, 12);
  r.seg(pant, kn[0], kn[1], ankle[0], ankle[1], 12, 10);
  // thigh pocket and a knee pad
  if (!back) r.rect(P.fabricD, hip[0] + (kn[0] - hip[0]) * 0.4 - 3, hip[1] + (kn[1] - hip[1]) * 0.4, 7, 7);
  r.ellipse(back ? P.dark : P.armor, kn[0] + 2, kn[1], 5.5, 5);
  // heavy boot
  const bx = ankle[0];
  const by = ankle[1];
  r.poly(P.boot, [[bx - 7, by - 9], [bx + 6, by - 9], [bx + 7, by - 2], [bx + 15, by + 2], [bx + 15, by + 8], [bx - 8, by + 8]]);
  r.rect(P.sole, bx - 8, by + 7, 24, 2);
  r.rect(P.strap, bx - 7, by - 9, 13, 3);
}
